"""Programador legal de captura multi-tick de cuotas (`v3.2` · Agente `B3`).

Lee en solo lectura los regímenes de cadencia de `../prediction-lab/src/data/prediction/stale_lines_config.json`:
  - `closing_decision_window_t_minus_60m` (`[T-60m, T-0]`): `<= 3.69 min` (`221.15 s`)
  - `matchday_near_kickoff_q00_ws` (`[T-4.4h, T-60m)`): `<= 8.57 min` (`514.05 s`)
  - `matchday_window_q10_ws` (`[T-8.5h, T-4.4h)`): `<= 11.69 min` (`701.32 s`)
  - `early_week_median_q50_ws` (`> T-8.5h`): `<= 30.40 min` (`1824.28 s`)

Modos soportados:
  - `--dry-run`: calcula calendario y horarios por evento, verifica compuerta legal y actualiza `health.json` sin red.
  - `--once`: ejecuta un ciclo único sobre las fuentes aprobadas con credenciales presentes.
  - `--loop`: ejecuta ciclos continuos acotados por `--max-duration-seconds` y/o `--max-cycles`.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import statistics
import sys
import time
from typing import Any, Callable, Mapping, Sequence

WORKTREE_ROOT = Path(__file__).resolve().parent.parent
if str(WORKTREE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKTREE_ROOT))

from scrapers.sources.base import (  # noqa: E402
    AntiBotChallengeError,
    MissingCredentialsError,
    OddsSourceAdapter,
    OddsSourceError,
    SourceBlockedError,
    TIMESERIES_JSONL_COLUMNS,
    validate_and_normalize_tick_rows,
)
from scrapers.sources.registry import (  # noqa: E402
    build_active_source_adapters,
    get_allowed_canonical_books,
    summarize_legal_registry,
)
from scrapers.sources.team_resolution import (  # noqa: E402
    SUPPORTED_TIMESERIES_SPORTS,
    build_canonical_event_id,
    format_utc_iso,
    parse_utc_datetime,
    resolve_canonical_team,
    resolve_sport_and_league,
)

DEFAULT_STALE_LINES_CONFIG_PATH = (
    WORKTREE_ROOT.parent / "prediction-lab" / "src" / "data" / "prediction" / "stale_lines_config.json"
)
DEFAULT_OUTPUT_DIR = WORKTREE_ROOT / "data" / "odds_timeseries"
DEFAULT_EDGE_MATRIX_PATH = WORKTREE_ROOT / "data" / "feature_store" / "live_matchups_edge_matrix.json"
DEFAULT_MICROSTRUCTURE_PATH = WORKTREE_ROOT / "data" / "normalized" / "market_microstructure.json"

# Libros sharp reconocidos por `odds_snapshots.py` (`SHARP_SCRAPED_FALLBACK_ORDER`)
CLOSING_SHARP_BOOKS: frozenset[str] = frozenset({"pinnacle", "smarkets"})

REGIME_SHORT_LABELS: dict[str, str] = {
    "closing_decision_window_t_minus_60m": "T-60m",
    "matchday_near_kickoff_q00_ws": "T-4.4h",
    "matchday_window_q10_ws": "T-8.5h",
    "early_week_median_q50_ws": "early_week",
}

# Factor conservador (< 1.0) para garantizar que la brecha realizada quede estrictamente <= máximo del régimen
DEFAULT_INTERVAL_SAFETY_FACTOR: float = 0.92


@dataclass(frozen=True)
class CadenceRegime:
    """Régimen horario leído en solo lectura desde `stale_lines_config.json`."""

    regime_id: str
    short_label: str
    horizon_minutes: float
    max_interval_minutes: float
    max_interval_seconds: float
    scheduled_interval_seconds: float


@dataclass(frozen=True)
class ScheduledEventPlan:
    """Plan horario calculado para un evento pre-partido del calendario."""

    event_id: str
    sport: str
    league: str
    home_team: str
    away_team: str
    ts_event_start: str
    minutes_to_kickoff: float
    regime_id: str
    regime_short_label: str
    max_interval_seconds: float
    scheduled_interval_seconds: float
    next_due_utc: str


def load_cadence_regimes_readonly(
    config_path: Path = DEFAULT_STALE_LINES_CONFIG_PATH,
    *,
    safety_factor: float = DEFAULT_INTERVAL_SAFETY_FACTOR,
) -> tuple[list[CadenceRegime], str]:
    """Lee `stale_lines_config.json` en estricto modo lectura y devuelve `(regimes_sorted, sha256_hex)`."""
    if not (0.1 < safety_factor <= 1.0):
        raise ValueError(f"safety_factor debe estar en (0.1, 1.0]: {safety_factor}")

    raw_bytes = config_path.read_bytes()
    config_sha256 = hashlib.sha256(raw_bytes).hexdigest()
    payload = json.loads(raw_bytes.decode("utf-8"))

    cadence_block = (
        payload.get("recommended_scraping_cadence")
        or payload.get("cadence_recommendation")
        or {}
    )
    raw_regimes = (
        cadence_block.get("regimes")
        or cadence_block.get("regimes_evaluated")
        or []
    )
    if not isinstance(raw_regimes, list) or len(raw_regimes) < 4:
        raise ValueError(f"No se encontraron los 4 regímenes de cadencia en {config_path}")

    parsed: list[CadenceRegime] = []
    for item in raw_regimes:
        if not isinstance(item, Mapping):
            continue
        rid = str(item.get("regime_id") or "").strip()
        if rid not in REGIME_SHORT_LABELS:
            continue
        horizon_min = float(item["horizon_minutes"])
        max_min = float(item["recommended_interval_minutes"])
        max_sec = float(item["recommended_interval_seconds"])
        sched_sec = round(min(max_sec, max_sec * safety_factor), 3)
        parsed.append(
            CadenceRegime(
                regime_id=rid,
                short_label=REGIME_SHORT_LABELS[rid],
                horizon_minutes=horizon_min,
                max_interval_minutes=max_min,
                max_interval_seconds=max_sec,
                scheduled_interval_seconds=sched_sec,
            )
        )

    parsed.sort(key=lambda r: r.horizon_minutes)
    if len(parsed) != 4:
        raise ValueError(f"Se esperaban exactamente 4 regímenes canónicos; encontrados={len(parsed)}")
    return parsed, config_sha256


def classify_event_regime(
    minutes_to_kickoff: float,
    regimes: Sequence[CadenceRegime],
) -> CadenceRegime | None:
    """Clasifica `minutes_to_kickoff` (`(ts_event_start - now) / 60`) en uno de los 4 regímenes pre-partido.

    - `< 0`: evento ya iniciado (`None` -> excluido de captura pre-partido).
    - `[0, 60.0]`: `closing_decision_window_t_minus_60m` (`<= 221.15 s`)
    - `(60.0, 262.4167]`: `matchday_near_kickoff_q00_ws` (`<= 514.05 s`)
    - `(262.4167, 509.9]`: `matchday_window_q10_ws` (`<= 701.32 s`)
    - `> 509.9`: `early_week_median_q50_ws` (`<= 1824.28 s`)
    """
    if minutes_to_kickoff < 0.0:
        return None
    sorted_regs = sorted(regimes, key=lambda r: r.horizon_minutes)
    # Los primeros 3 regímenes tienen cotas superiores explícitas (60.0, 262.4167, 509.9);
    # el cuarto (`early_week_median_q50_ws`) cubre todo `> 509.9` minutos antes del kickoff.
    for reg in sorted_regs[:-1]:
        if minutes_to_kickoff <= reg.horizon_minutes + 1e-9:
            return reg
    return sorted_regs[-1]


def load_prematch_calendar_readonly(
    *,
    now_utc: datetime,
    sports: Sequence[str] = ("football", "nfl"),
    edge_matrix_path: Path | None = DEFAULT_EDGE_MATRIX_PATH,
    microstructure_path: Path | None = DEFAULT_MICROSTRUCTURE_PATH,
) -> list[dict[str, str]]:
    """Carga el calendario pre-partido (`ts_event_start >= now_utc`) en estricto modo lectura.

    Solo usa metadatos de programación (equipos, deporte, liga, hora de inicio UTC); jamás lee ni copia cuotas.
    """
    wanted_sports = {s.strip().lower() for s in sports if s.strip().lower() in SUPPORTED_TIMESERIES_SPORTS}
    by_event_id: dict[str, dict[str, str]] = {}

    def _try_register(sport_raw: Any, league_raw: Any, kickoff_raw: Any, home_raw: Any, away_raw: Any) -> None:
        sp_lg = resolve_sport_and_league(sport_raw, league_raw)
        if sp_lg is None or sp_lg[0] not in wanted_sports:
            return
        canon_sport, canon_league = sp_lg
        dt_ko = parse_utc_datetime(kickoff_raw)
        if dt_ko is None or dt_ko < now_utc:
            return
        try:
            eid = build_canonical_event_id(canon_sport, canon_league, format_utc_iso(dt_ko), str(home_raw or ""), str(away_raw or ""))
        except ValueError:
            return
        if eid not in by_event_id:
            by_event_id[eid] = {
                "event_id": eid,
                "sport": canon_sport,
                "league": canon_league,
                "home_team": resolve_canonical_team(home_raw, canon_sport, canon_league),
                "away_team": resolve_canonical_team(away_raw, canon_sport, canon_league),
                "ts_event_start": format_utc_iso(dt_ko),
            }

    if edge_matrix_path is not None and edge_matrix_path.exists():
        try:
            em_data = json.loads(edge_matrix_path.read_text(encoding="utf-8"))
            for rec in em_data.get("records", []):
                if isinstance(rec, Mapping):
                    _try_register(
                        rec.get("sport"),
                        rec.get("league"),
                        rec.get("kickoff_utc"),
                        rec.get("home_team"),
                        rec.get("away_team"),
                    )
        except Exception:
            pass

    if microstructure_path is not None and microstructure_path.exists():
        try:
            ms_data = json.loads(microstructure_path.read_text(encoding="utf-8"))
            ms_records = ms_data.get("records", []) if isinstance(ms_data, Mapping) else []
            for rec in ms_records:
                if not isinstance(rec, Mapping):
                    continue
                rt = rec.get("record_type")
                if rt in ("pinnacle_matchup", "pinnacle_market"):
                    _try_register(
                        rec.get("sport_name"),
                        rec.get("league_name"),
                        rec.get("kickoff_utc"),
                        rec.get("home_team"),
                        rec.get("away_team"),
                    )
                elif rt == "smarkets_exchange_event":
                    ev_name = str(rec.get("event_name") or "")
                    if " vs " in ev_name:
                        h_part, a_part = ev_name.split(" vs ", 1)
                        full_slug = str(rec.get("full_slug") or "")
                        slug_parts = [p for p in full_slug.strip("/").split("/") if p]
                        lg_hint = slug_parts[2] if len(slug_parts) >= 3 else "SOCCER"
                        _try_register(
                            rec.get("event_type"),
                            lg_hint,
                            rec.get("start_datetime_utc"),
                            h_part,
                            a_part,
                        )
        except Exception:
            pass

    events = list(by_event_id.values())
    events.sort(key=lambda e: (e["ts_event_start"], e["event_id"]))
    return events


def compute_event_schedules(
    calendar_events: Sequence[Mapping[str, str]],
    regimes: Sequence[CadenceRegime],
    *,
    now_utc: datetime,
    last_captured_by_event: Mapping[str, datetime] | None = None,
) -> list[ScheduledEventPlan]:
    """Calcula el régimen e instante `next_due_utc` para cada evento pre-partido."""
    plans: list[ScheduledEventPlan] = []
    last_map = last_captured_by_event or {}

    for ev in calendar_events:
        dt_start = parse_utc_datetime(ev.get("ts_event_start"))
        if dt_start is None:
            continue
        mins_to_ko = (dt_start - now_utc).total_seconds() / 60.0
        reg = classify_event_regime(mins_to_ko, regimes)
        if reg is None:
            continue

        eid = str(ev["event_id"])
        prev_cap = last_map.get(eid)
        if prev_cap is None:
            next_due = now_utc
        else:
            cand_due = prev_cap + timedelta(seconds=reg.scheduled_interval_seconds)
            next_due = max(now_utc, min(cand_due, dt_start))

        plans.append(
            ScheduledEventPlan(
                event_id=eid,
                sport=str(ev["sport"]),
                league=str(ev["league"]),
                home_team=str(ev.get("home_team") or ""),
                away_team=str(ev.get("away_team") or ""),
                ts_event_start=format_utc_iso(dt_start),
                minutes_to_kickoff=round(mins_to_ko, 3),
                regime_id=reg.regime_id,
                regime_short_label=reg.short_label,
                max_interval_seconds=reg.max_interval_seconds,
                scheduled_interval_seconds=reg.scheduled_interval_seconds,
                next_due_utc=format_utc_iso(next_due),
            )
        )

    plans.sort(key=lambda p: (p.minutes_to_kickoff, p.event_id))
    return plans


def _natural_dedup_key(row: Mapping[str, Any]) -> tuple[Any, ...]:
    dt_cap = parse_utc_datetime(row.get("ts_captured"))
    cap_ms = int(dt_cap.timestamp() * 1000) if dt_cap is not None else 0
    line_val = row.get("line")
    line_norm = None if line_val is None else (0.0 if float(line_val) == 0.0 else float(line_val))
    return (
        str(row["event_id"]),
        str(row["market"]).lower(),
        line_norm,
        str(row["selection"]).lower(),
        str(row["book"]).lower(),
        cap_ms,
        str(row["source"]),
    )


def append_validated_ticks_jsonl(
    rows: Sequence[Mapping[str, Any]],
    *,
    output_dir: Path = DEFAULT_OUTPUT_DIR,
    allowed_books: frozenset[str] | None = None,
) -> dict[str, Any]:
    """Escribe en modo append-only en `data/odds_timeseries/<sport>/<YYYY-MM-DD>.jsonl`.

    - `<YYYY-MM-DD>` es la fecha UTC de `ts_event_start` (documentado en `CONTRACT_ODDS_TIMESERIES.md`).
    - Deduplica contra cualquier fila ya existente en el archivo destino.
    - Jamás crea archivos vacíos si no hay filas reales validadas.
    """
    books_whitelist = allowed_books if allowed_books is not None else get_allowed_canonical_books()
    valid_rows, norm_stats = validate_and_normalize_tick_rows(rows, allowed_books=books_whitelist)

    by_target_file: dict[Path, list[dict[str, Any]]] = {}
    for row in valid_rows:
        dt_start = parse_utc_datetime(row["ts_event_start"])
        if dt_start is None:
            continue
        ymd_dash = dt_start.strftime("%Y-%m-%d")
        target_path = output_dir / str(row["sport"]) / f"{ymd_dash}.jsonl"
        by_target_file.setdefault(target_path, []).append(row)

    written_count = 0
    already_present_count = 0
    touched_files: list[str] = []

    for target_path, file_rows in sorted(by_target_file.items(), key=lambda kv: str(kv[0])):
        existing_keys: set[tuple[Any, ...]] = set()
        if target_path.exists():
            for raw_line in target_path.read_text(encoding="utf-8").splitlines():
                line_s = raw_line.strip()
                if not line_s:
                    continue
                try:
                    existing_obj = json.loads(line_s)
                    if isinstance(existing_obj, Mapping):
                        existing_keys.add(_natural_dedup_key(existing_obj))
                except json.JSONDecodeError:
                    continue

        lines_to_append: list[str] = []
        for row in file_rows:
            nkey = _natural_dedup_key(row)
            if nkey in existing_keys:
                already_present_count += 1
                continue
            existing_keys.add(nkey)
            ordered_obj = {col: row[col] for col in TIMESERIES_JSONL_COLUMNS}
            lines_to_append.append(json.dumps(ordered_obj, ensure_ascii=False, separators=(",", ":")))

        if lines_to_append:
            target_path.parent.mkdir(parents=True, exist_ok=True)
            with target_path.open("a", encoding="utf-8", newline="\n") as fh:
                for ln in lines_to_append:
                    fh.write(ln + "\n")
            written_count += len(lines_to_append)
            touched_files.append(str(target_path))

    return {
        "normalization_stats": norm_stats.to_dict(),
        "rows_appended": written_count,
        "rows_already_present": already_present_count,
        "files_touched": touched_files,
    }


def load_all_timeseries_rows(output_dir: Path = DEFAULT_OUTPUT_DIR) -> list[dict[str, Any]]:
    """Lee todas las filas JSONL almacenadas bajo `<output_dir>/<sport>/*.jsonl`."""
    all_rows: list[dict[str, Any]] = []
    for sport in sorted(SUPPORTED_TIMESERIES_SPORTS):
        sport_dir = output_dir / sport
        if not sport_dir.exists():
            continue
        for jsonl_file in sorted(sport_dir.glob("*.jsonl")):
            for raw_line in jsonl_file.read_text(encoding="utf-8").splitlines():
                s = raw_line.strip()
                if not s:
                    continue
                obj = json.loads(s)
                if isinstance(obj, dict):
                    all_rows.append(obj)
    return all_rows


def build_health_report(
    *,
    output_dir: Path,
    regimes: Sequence[CadenceRegime],
    stale_lines_config_sha256: str,
    scheduled_plans: Sequence[ScheduledEventPlan],
    env: Mapping[str, str] | None = None,
    mode: str = "once",
    runtime_errors: Sequence[str] = (),
    now_utc: datetime | None = None,
) -> dict[str, Any]:
    """Construye el objeto completo `data/odds_timeseries/health.json` según `CONTRACT_ODDS_TIMESERIES.md`."""
    now_dt = now_utc or datetime.now(timezone.utc)
    legal_summary = summarize_legal_registry(env)
    stored_rows = load_all_timeseries_rows(output_dir)

    # Ticks únicos por evento (`event_id -> set(ts_captured_epoch_ms)`)
    ticks_by_event_set: dict[str, set[int]] = {}
    books_by_event: dict[str, set[str]] = {}
    # Serie por `(event_id, book)` para medir brecha entre capturas consecutivas por régimen
    series_points: dict[tuple[str, str], dict[int, tuple[datetime, datetime]]] = {}

    for row in stored_rows:
        eid = str(row.get("event_id") or "").strip()
        book = str(row.get("book") or "").strip().lower()
        dt_cap = parse_utc_datetime(row.get("ts_captured"))
        dt_start = parse_utc_datetime(row.get("ts_event_start"))
        if not eid or not book or dt_cap is None or dt_start is None:
            continue
        if dt_cap > dt_start:
            continue
        cap_ms = int(dt_cap.timestamp() * 1000)
        ticks_by_event_set.setdefault(eid, set()).add(cap_ms)
        books_by_event.setdefault(eid, set()).add(book)
        series_points.setdefault((eid, book), {})[cap_ms] = (dt_cap, dt_start)

    by_event_counts = {eid: len(ts_set) for eid, ts_set in sorted(ticks_by_event_set.items())}
    counts_list = list(by_event_counts.values())
    if counts_list:
        ticks_summary: dict[str, Any] = {
            "min": int(min(counts_list)),
            "median": round(float(statistics.median(counts_list)), 3),
            "max": int(max(counts_list)),
            "by_event": by_event_counts,
        }
    else:
        ticks_summary = {
            "min": 0,
            "median": 0.0,
            "max": 0,
            "by_event": {},
        }

    gaps_by_regime: dict[str, list[float]] = {
        "T-60m": [],
        "T-4.4h": [],
        "T-8.5h": [],
        "early_week": [],
    }
    events_with_2min_separation = 0
    for eid, ts_ms_set in ticks_by_event_set.items():
        if len(ts_ms_set) >= 2 and (max(ts_ms_set) - min(ts_ms_set)) >= 120_000:
            events_with_2min_separation += 1

    for (_, _), pts_map in series_points.items():
        if len(pts_ms := sorted(pts_map.keys())) < 2:
            continue
        for idx in range(1, len(pts_ms)):
            prev_dt, _ = pts_map[pts_ms[idx - 1]]
            curr_dt, start_dt = pts_map[pts_ms[idx]]
            gap_min = (curr_dt - prev_dt).total_seconds() / 60.0
            mins_to_ko = (start_dt - curr_dt).total_seconds() / 60.0
            reg = classify_event_regime(mins_to_ko, regimes)
            if reg is not None and reg.short_label in gaps_by_regime:
                gaps_by_regime[reg.short_label].append(gap_min)

    median_gap_by_regime: dict[str, float | None] = {
        label: (round(float(statistics.median(vals)), 4) if vals else None)
        for label, vals in gaps_by_regime.items()
    }

    total_events = len(by_event_counts)
    sharp_books_seen: set[str] = set()
    events_with_sharp = 0
    for eid, bset in books_by_event.items():
        ev_sharp = bset & CLOSING_SHARP_BOOKS
        if ev_sharp:
            events_with_sharp += 1
            sharp_books_seen.update(ev_sharp)

    sharp_ratio = round(events_with_sharp / total_events, 4) if total_events > 0 else 0.0

    cal_by_regime: dict[str, int] = {"T-60m": 0, "T-4.4h": 0, "T-8.5h": 0, "early_week": 0}
    for plan in scheduled_plans:
        if plan.regime_short_label in cal_by_regime:
            cal_by_regime[plan.regime_short_label] += 1

    t60_reg = next((r for r in regimes if r.short_label == "T-60m"), None)
    t60_limit_min = t60_reg.max_interval_minutes if t60_reg is not None else 3.685835
    t60_median = median_gap_by_regime["T-60m"]

    meets_full_matchday_sla = (
        events_with_2min_separation >= 1
        and events_with_sharp >= 1
        and t60_median is not None
        and t60_median <= t60_limit_min + 1e-6
    )

    capture_status = "ok" if meets_full_matchday_sla else "prospective_capture_pending"

    notes_parts: list[str] = []
    if not legal_summary["active_sources"]:
        notes_parts.append(
            "0 fuentes activas sin evasión en este entorno: las 5 fuentes web heredadas "
            "(pinnacle, smarkets, caliente, codere, action_network) están en blocked_pending_owner_decision "
            "por prohibición de ToS/robots.txt o reto anti-bot Cloudflare HTTP 403 (Regla #7), y las 2 APIs "
            "oficiales aprobadas (the_odds_api, betfair_exchange) están en api_only a la espera de configurar "
            "THE_ODDS_API_KEY o BETFAIR_APP_KEY+BETFAIR_SESSION_TOKEN."
        )
    if cal_by_regime["T-60m"] == 0:
        notes_parts.append(
            f"Sin partidos de football/nfl en ventana [T-60m, T-0] al instante {format_utc_iso(now_dt)} "
            f"(eventos futuros en calendario: {len(scheduled_plans)}, distribución={cal_by_regime})."
        )
    if not meets_full_matchday_sla:
        notes_parts.append(
            "Estado marcado honestamente como prospective_capture_pending sin inventar ni simular ticks (Regla #4)."
        )
    if runtime_errors:
        notes_parts.append("Errores de ejecución registrados: " + "; ".join(runtime_errors))

    return {
        "generated_at_utc": format_utc_iso(now_dt),
        "mode": mode,
        "capture_status": capture_status,
        "stale_lines_config_sha256": stale_lines_config_sha256,
        "regimes_configured": [
            {
                "regime_id": r.regime_id,
                "short_label": r.short_label,
                "horizon_minutes": r.horizon_minutes,
                "max_interval_minutes": round(r.max_interval_minutes, 4),
                "max_interval_seconds": round(r.max_interval_seconds, 4),
                "scheduled_interval_seconds": r.scheduled_interval_seconds,
            }
            for r in regimes
        ],
        "approved_sources": legal_summary["approved_sources"],
        "active_sources": legal_summary["active_sources"],
        "credential_pending_sources": legal_summary["credential_pending_sources"],
        "blocked_sources": [
            {
                "source": b["source"],
                "status": b["status"],
                "reason": b["reason"],
            }
            for b in legal_summary["blocked_sources"]
        ],
        "calendar_upcoming_events_count": len(scheduled_plans),
        "calendar_events_by_regime": cal_by_regime,
        "events_tracked": total_events,
        "total_rows_written": len(stored_rows),
        "ticks_per_event": ticks_summary,
        "median_gap_minutes_by_regime": median_gap_by_regime,
        "sharp_coverage": {
            "events_with_sharp": events_with_sharp,
            "total_events": total_events,
            "ratio": sharp_ratio,
            "books": sorted(sharp_books_seen),
        },
        "notes": " ".join(notes_parts) if notes_parts else "Captura prospectiva operativa dentro de SLA.",
    }


def write_health_report(health_payload: Mapping[str, Any], output_dir: Path = DEFAULT_OUTPUT_DIR) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    health_path = output_dir / "health.json"
    health_path.write_text(json.dumps(health_payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return health_path


class CadenceScheduler:
    """Orquestador de captura multi-tick legal gobernado por `stale_lines_config.json`."""

    def __init__(
        self,
        *,
        config_path: Path = DEFAULT_STALE_LINES_CONFIG_PATH,
        output_dir: Path = DEFAULT_OUTPUT_DIR,
        sports: Sequence[str] = ("football", "nfl"),
        env: Mapping[str, str] | None = None,
        adapters: Sequence[OddsSourceAdapter] | None = None,
        edge_matrix_path: Path | None = DEFAULT_EDGE_MATRIX_PATH,
        microstructure_path: Path | None = DEFAULT_MICROSTRUCTURE_PATH,
        now_fn: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
        sleep_fn: Callable[[float], None] = time.sleep,
    ) -> None:
        self.config_path = config_path
        self.output_dir = output_dir
        self.sports = tuple(s.strip().lower() for s in sports if s.strip().lower() in SUPPORTED_TIMESERIES_SPORTS)
        self._env = os.environ if env is None else env
        self.regimes, self.config_sha256 = load_cadence_regimes_readonly(config_path)
        self.edge_matrix_path = edge_matrix_path
        self.microstructure_path = microstructure_path
        self._now_fn = now_fn
        self._sleep_fn = sleep_fn

        if adapters is not None:
            # Guardia defensiva: jamás aceptar adaptadores bloqueados ni sin credenciales requeridas
            for ad in adapters:
                if ad.metadata.legal_status == "blocked_pending_owner_decision":
                    raise SourceBlockedError(
                        f"Intento prohibido de registrar fuente bloqueada en CadenceScheduler: {ad.metadata.source_id}"
                    )
                if not ad.metadata.is_eligible_for_scheduler(self._env):
                    raise MissingCredentialsError(
                        f"Fuente no elegible o sin credenciales en CadenceScheduler: {ad.metadata.source_id}"
                    )
            self.active_adapters = list(adapters)
        else:
            self.active_adapters = build_active_source_adapters(env=self._env)

        self._last_captured_by_event: dict[str, datetime] = {}

    def plan_schedule(self, now_utc: datetime | None = None) -> list[ScheduledEventPlan]:
        now_dt = now_utc or self._now_fn()
        cal_events = load_prematch_calendar_readonly(
            now_utc=now_dt,
            sports=self.sports,
            edge_matrix_path=self.edge_matrix_path,
            microstructure_path=self.microstructure_path,
        )
        return compute_event_schedules(
            cal_events,
            self.regimes,
            now_utc=now_dt,
            last_captured_by_event=self._last_captured_by_event,
        )

    def compute_next_sleep_seconds(self, plans: Sequence[ScheduledEventPlan]) -> float:
        if not plans:
            return self.regimes[-1].scheduled_interval_seconds
        return min(p.scheduled_interval_seconds for p in plans)

    def run_dry_run(self, *, write_health: bool = True) -> dict[str, Any]:
        now_dt = self._now_fn()
        plans = self.plan_schedule(now_dt)
        health = build_health_report(
            output_dir=self.output_dir,
            regimes=self.regimes,
            stale_lines_config_sha256=self.config_sha256,
            scheduled_plans=plans,
            env=self._env,
            mode="dry-run",
            now_utc=now_dt,
        )
        health_path = write_health_report(health, self.output_dir) if write_health else None
        return {
            "mode": "dry-run",
            "now_utc": format_utc_iso(now_dt),
            "active_sources": [a.metadata.source_id for a in self.active_adapters],
            "upcoming_events_planned": len(plans),
            "next_sleep_seconds": self.compute_next_sleep_seconds(plans),
            "sample_schedule": [p.__dict__ for p in plans[:10]],
            "health_path": str(health_path) if health_path else None,
            "capture_status": health["capture_status"],
        }

    def run_once(self) -> dict[str, Any]:
        now_dt = self._now_fn()
        plans = self.plan_schedule(now_dt)
        collected_rows: list[dict[str, Any]] = []
        errors: list[str] = []

        for adapter in list(self.active_adapters):
            try:
                rows = adapter.fetch_snapshots(sports=self.sports, captured_at=now_dt)
                collected_rows.extend(rows)
            except (AntiBotChallengeError, SourceBlockedError, MissingCredentialsError) as exc:
                errors.append(f"{adapter.metadata.source_id}: {exc}")
                # Desactivar adaptador bloqueado en sesión para no volver a tocar ese endpoint
                self.active_adapters = [a for a in self.active_adapters if a is not adapter]
            except OddsSourceError as exc:
                errors.append(f"{adapter.metadata.source_id}: {exc}")

        append_summary = append_validated_ticks_jsonl(
            collected_rows,
            output_dir=self.output_dir,
        )
        for row in collected_rows:
            eid = str(row.get("event_id") or "")
            dt_cap = parse_utc_datetime(row.get("ts_captured"))
            if eid and dt_cap is not None:
                self._last_captured_by_event[eid] = dt_cap

        # Re-evaluar calendario incorporando cualquier evento nuevo recién descubierto en JSONL
        plans_after = self.plan_schedule(now_dt)
        health = build_health_report(
            output_dir=self.output_dir,
            regimes=self.regimes,
            stale_lines_config_sha256=self.config_sha256,
            scheduled_plans=plans_after,
            env=self._env,
            mode="once",
            runtime_errors=errors,
            now_utc=now_dt,
        )
        health_path = write_health_report(health, self.output_dir)

        return {
            "mode": "once",
            "now_utc": format_utc_iso(now_dt),
            "active_sources": [a.metadata.source_id for a in self.active_adapters],
            "rows_collected": len(collected_rows),
            "append_summary": append_summary,
            "errors": errors,
            "health_path": str(health_path),
            "capture_status": health["capture_status"],
        }

    def run_loop(
        self,
        *,
        max_duration_seconds: float | None = 300.0,
        max_cycles: int | None = None,
    ) -> dict[str, Any]:
        started_monotonic = time.monotonic()
        cycles_run = 0
        total_appended = 0
        all_errors: list[str] = []
        last_result: dict[str, Any] = {}

        while True:
            cycle_res = self.run_once()
            cycles_run += 1
            total_appended += int(cycle_res["append_summary"]["rows_appended"])
            all_errors.extend(cycle_res["errors"])
            last_result = cycle_res

            if max_cycles is not None and cycles_run >= max_cycles:
                break
            if not self.active_adapters:
                # Sin fuentes activas habilitadas, no tiene sentido dormir en bucle vacío
                break

            plans = self.plan_schedule(self._now_fn())
            sleep_sec = self.compute_next_sleep_seconds(plans)

            if max_duration_seconds is not None:
                elapsed = time.monotonic() - started_monotonic
                remaining = max_duration_seconds - elapsed
                if remaining <= 0 or sleep_sec > remaining:
                    break

            self._sleep_fn(sleep_sec)

        # Actualizar `mode="loop"` en `health.json`
        now_dt = self._now_fn()
        plans_final = self.plan_schedule(now_dt)
        health = build_health_report(
            output_dir=self.output_dir,
            regimes=self.regimes,
            stale_lines_config_sha256=self.config_sha256,
            scheduled_plans=plans_final,
            env=self._env,
            mode="loop",
            runtime_errors=all_errors,
            now_utc=now_dt,
        )
        health_path = write_health_report(health, self.output_dir)

        return {
            "mode": "loop",
            "cycles_run": cycles_run,
            "total_rows_appended": total_appended,
            "active_sources": [a.metadata.source_id for a in self.active_adapters],
            "errors": all_errors,
            "health_path": str(health_path),
            "capture_status": health["capture_status"],
            "last_cycle": last_result,
        }


def build_cli_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Programador de captura multi-tick legal de cuotas (v3.2 · B3)"
    )
    mode_grp = parser.add_mutually_exclusive_group(required=True)
    mode_grp.add_argument("--dry-run", action="store_true", help="Calcula horarios y salud sin llamadas de red")
    mode_grp.add_argument("--once", action="store_true", help="Ejecuta un ciclo único de captura legal")
    mode_grp.add_argument("--loop", action="store_true", help="Ejecuta captura continua gobernada por régimen")

    parser.add_argument(
        "--config-path",
        type=Path,
        default=DEFAULT_STALE_LINES_CONFIG_PATH,
        help="Ruta en solo lectura a stale_lines_config.json",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Directorio raíz de salida para odds_timeseries",
    )
    parser.add_argument(
        "--sports",
        type=str,
        default="football,nfl",
        help="Lista separada por comas de deportes dentro de {football,nfl}",
    )
    parser.add_argument(
        "--max-duration-seconds",
        type=float,
        default=300.0,
        help="Duración máxima en segundos para --loop",
    )
    parser.add_argument(
        "--max-cycles",
        type=int,
        default=None,
        help="Número máximo de ciclos en --loop",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_cli_parser()
    args = parser.parse_args(argv)
    sports = [s.strip().lower() for s in args.sports.split(",") if s.strip()]

    scheduler = CadenceScheduler(
        config_path=args.config_path,
        output_dir=args.output_dir,
        sports=sports,
    )

    if args.dry_run:
        summary = scheduler.run_dry_run(write_health=True)
    elif args.once:
        summary = scheduler.run_once()
    else:
        summary = scheduler.run_loop(
            max_duration_seconds=args.max_duration_seconds,
            max_cycles=args.max_cycles,
        )

    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
