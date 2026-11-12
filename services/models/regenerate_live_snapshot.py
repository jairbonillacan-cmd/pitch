"""B8 (`b8-snapshot`) — Regenerador determinista de `live_matchday_v3_snapshot.json` (`v3.2`).

Lee en solo lectura la serie temporal multi-tick legal producida por `B3`
(`../web-scraping/data/odds_timeseries/{football,nfl}/*.jsonl` + `health.json`),
valida cada captura con `services/ingest/odds_snapshots.py` y `src/domain/prediction/odds.ts`,
filtra estrictamente cuotas reales pre-partido con antigüedad `< max_quote_age_hours` (`72 h` por
defecto) y `ts_captured <= kickoff_utc`, e invoca `buildMatchOutlook` (`src/domain/prediction/outlook.ts`)
para publicar `outlooks: MatchOutlook[]` sobre los `130` enfrentamientos soportados (`84` fútbol en
`bundesliga`, `epl`, `laliga`, `liga-mx`, `ligue-1`, `serie-a` + `46` `nfl`), conservando intactos
los arreglos heredados de compatibilidad (`edge_matrix_records`, `team_master_records`,
`counts_by_league`, `expected_predictions`).

Reglas rectoras verificadas (`MASTER.md` §0 y `CONTRACT_OUTLOOK.md`):
  - Cero re-tuning de artefactos `v3.1` y `production_enabled = 0`.
  - Cero precios inventados: sin cuota real causal `< 72 h`, `market: null` y `pSource` en
    `"model"` o `"base_rate"`.
  - Cero campos de dimensionamiento o apuesta en `outlooks` (`stake`, `kelly`, `kellyFraction`,
    `expectedEdge`, `edge`, `ev`, `value`, `valueStatus`, `tier`, `"pick seguro"`).
  - Cero consumo de fuentes bloqueadas (`caliente`, `action_network`, etc.).

Uso CLI:
  # Regenerar el snapshot oficial con ventana estricta < 72 h:
  .\\research\\prediction-lab\\.venv\\Scripts\\python.exe services/models/regenerate_live_snapshot.py \\
    --timeseries-dir ../web-scraping/data/odds_timeseries \\
    --max-quote-age-hours 72 \\
    --out src/data/prediction/live_matchday_v3_snapshot.json

  # Auditar en seco (CI / cron) sin modificar el archivo en disco:
  .\\research\\prediction-lab\\.venv\\Scripts\\python.exe services/models/regenerate_live_snapshot.py \\
    --timeseries-dir ../web-scraping/data/odds_timeseries \\
    --max-quote-age-hours 72 \\
    --out src/data/prediction/live_matchday_v3_snapshot.json \\
    --check
"""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import re
import subprocess
import sys
import time
from typing import Any, Mapping, Sequence
import unicodedata

import pandas as pd

WORKTREE_ROOT = Path(__file__).resolve().parents[2]
if str(WORKTREE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKTREE_ROOT))

from services.ingest.odds_snapshots import (  # noqa: E402
    REQUIRED_COLUMNS,
    SHARP_BOOKS_SCRAPED_FALLBACK_ORDER,
    validate_and_deduplicate_snapshots,
)

SNAPSHOT_SCHEMA_VERSION = "3.2.0"
SUITE_CODENAME = "PitchLab Spacetime Suite v3.2"
OUTLOOK_SCHEMA_VERSION = "match_outlook_v3.2.0"
DEFAULT_MAX_QUOTE_AGE_HOURS = 72.0
MAX_FIXTURE_KICKOFF_DRIFT_SECONDS = 36.0 * 3600.0
SIMPLEX_TOLERANCE = 1e-12

DEFAULT_TIMESERIES_DIR = (
    WORKTREE_ROOT.parent / "web-scraping" / "data" / "odds_timeseries"
)
DEFAULT_SNAPSHOT_PATH = (
    WORKTREE_ROOT / "src" / "data" / "prediction" / "live_matchday_v3_snapshot.json"
)

SOCCER_LEAGUE_TO_CANONICAL_DIV: dict[str, str] = {
    "bundesliga": "D1",
    "epl": "E0",
    "laliga": "SP1",
    "liga-mx": "MEX",
    "ligue-1": "F1",
    "serie-a": "I1",
}

SUPPORTED_FOOTBALL_LEAGUES: frozenset[str] = frozenset(
    SOCCER_LEAGUE_TO_CANONICAL_DIV.keys()
)
SHARP_BOOKS: frozenset[str] = frozenset(SHARP_BOOKS_SCRAPED_FALLBACK_ORDER)

# Fuentes sin API legal o placeholders sintéticos prohibidos bajo Regla #4 y #7
BLOCKED_OR_PLACEHOLDER_BOOKS: frozenset[str] = frozenset(
    {
        "",
        "none",
        "null",
        "unknown",
        "synthetic",
        "sports_only",
        "action_network",
        "action_network_splits",
        "action_consensus",
        "action_open",
        "caliente",
        "caliente_mx",
    }
)

FORBIDDEN_OUTLOOK_KEYS: frozenset[str] = frozenset(
    {
        "stake",
        "stake_u",
        "stake_raw_u",
        "kelly",
        "kellyfraction",
        "f_full_kelly",
        "f_quarter_kelly",
        "expectededge",
        "edge",
        "edge_effective",
        "ev",
        "ev_shrunk",
        "value",
        "valuestatus",
        "tier",
    }
)

COMMON_CLUB_AFFIX_TOKENS: frozenset[str] = frozenset(
    {
        "fc",
        "cf",
        "cd",
        "club",
        "de",
        "del",
        "la",
        "el",
        "sc",
        "ac",
        "as",
        "afc",
        "rc",
        "rcd",
        "ud",
        "sv",
        "vfb",
        "fsv",
        "tsg",
        "losc",
        "estac",
        " calcio",
        "calcio",
        "deportivo",
        "1",
        "04",
        "05",
        "07",
        "1899",
    }
)

# Alias bilingües deterministas (catálogo en español <-> feeds internacionales The Odds API / Betfair)
SUPPLEMENTAL_TEAM_SLUG_ALIASES: dict[str, tuple[str, ...]] = {
    "bayern_munich": ("bayern_munchen", "fc_bayern_munchen", "bayern"),
    "eintracht_francfort": ("eintracht_frankfurt", "frankfurt"),
    "friburgo": ("freiburg", "sc_freiburg"),
    "colonia": ("koln", "fc_koln", "1_fc_koln", "cologne"),
    "hamburgo": ("hamburger_sv", "hamburg"),
    "union_berlin": ("1_fc_union_berlin",),
    "mainz": ("mainz_05", "1_fsv_mainz_05"),
    "bayer_leverkusen": ("leverkusen",),
    "paderborn": ("sc_paderborn", "sc_paderborn_07"),
    "atalanta_bergamo": ("atalanta", "atalanta_bc"),
    "inter_milan": ("inter", "internazionale", "fc_internazionale"),
    "milan": ("ac_milan",),
    "roma": ("as_roma",),
    "monza": ("ac_monza",),
    "guadalajara": ("chivas", "chivas_guadalajara", "cd_guadalajara"),
    "cruz_azul": ("cd_cruz_azul", "cruz_azul_fc"),
    "america": ("cf_america", "club_america"),
    "pumas_unam": ("unam", "pumas"),
    "atletico_san_luis": ("atletico_de_san_luis", "san_luis"),
    "a_coruna": ("deportivo_la_coruna", "deportivo_a_coruna", "rc_deportivo"),
    "athletic": ("athletic_bilbao", "athletic_club"),
    "celta_vigo": ("celta", "rc_celta"),
    "monaco": ("as_monaco",),
    "stade_rennais": ("rennes", "stade_rennais_fc"),
}


class SnapshotRegenerationError(RuntimeError):
    """Error de validación o consistencia al regenerar o auditar el snapshot en vivo."""


def parse_utc_datetime(iso_value: Any) -> datetime | None:
    """Convierte un timestamp ISO-8601 (`Z`, `.000Z`, `+00:00`) a `datetime` UTC."""
    if iso_value is None or isinstance(iso_value, bool):
        return None
    raw = str(iso_value).strip()
    if not raw:
        return None
    if raw.endswith("Z") or raw.endswith("z"):
        raw = raw[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def format_utc_iso(dt_or_iso: datetime | str) -> str:
    """Normaliza un `datetime` o cadena ISO a formato canónico UTC `YYYY-MM-DDTHH:MM:SSZ`."""
    dt = dt_or_iso if isinstance(dt_or_iso, datetime) else parse_utc_datetime(dt_or_iso)
    if dt is None:
        raise SnapshotRegenerationError(f"Timestamp UTC inválido: {dt_or_iso!r}")
    dt_utc = (
        dt.astimezone(timezone.utc)
        if dt.tzinfo is not None
        else dt.replace(tzinfo=timezone.utc)
    )
    return dt_utc.strftime("%Y-%m-%dT%H:%M:%SZ")


def slugify_team(value: Any) -> str:
    """Normaliza un nombre de equipo a `snake_case` ASCII determinista."""
    if value is None:
        return ""
    norm = unicodedata.normalize("NFKD", str(value))
    ascii_txt = "".join(ch for ch in norm if not unicodedata.combining(ch)).lower()
    return re.sub(r"[^a-z0-9]+", "_", ascii_txt).strip("_")


def _strip_affix_tokens(slug: str) -> str:
    tokens = [t for t in slug.split("_") if t and t not in COMMON_CLUB_AFFIX_TOKENS]
    return "_".join(tokens)


def build_team_candidate_slugs(
    team_name: str,
    short_slug_from_matchup: str | None = None,
    master_team_id: str | None = None,
    league: str | None = None,
) -> frozenset[str]:
    """Construye el conjunto cerrado de slugs equivalentes para un equipo del snapshot."""
    candidates: set[str] = set()
    base_slug = slugify_team(team_name)
    if base_slug:
        candidates.add(base_slug)
        stripped = _strip_affix_tokens(base_slug)
        if stripped:
            candidates.add(stripped)

    if short_slug_from_matchup:
        s_clean = slugify_team(short_slug_from_matchup)
        if s_clean:
            candidates.add(s_clean)
            stripped_s = _strip_affix_tokens(s_clean)
            if stripped_s:
                candidates.add(stripped_s)

    if master_team_id:
        m_clean = slugify_team(master_team_id)
        if league:
            lg_prefix = slugify_team(league) + "_"
            if m_clean.startswith(lg_prefix):
                m_clean = m_clean[len(lg_prefix) :]
        if m_clean:
            candidates.add(m_clean)

    expanded = set(candidates)
    for slug in list(candidates):
        for extra in SUPPLEMENTAL_TEAM_SLUG_ALIASES.get(slug, ()):
            expanded.add(extra)
        for key, aliases in SUPPLEMENTAL_TEAM_SLUG_ALIASES.items():
            if slug in aliases:
                expanded.add(key)
                expanded.update(aliases)

    return frozenset(s for s in expanded if s)


def resolve_matchup_outlook_sport_and_div(
    record: Mapping[str, Any],
) -> tuple[str, str] | None:
    """Clasifica un registro de `edge_matrix_records` hacia `('football', div)` o `('nfl', 'NFL')`.

    Devuelve `None` para deportes fuera del alcance de `MatchOutlook` (`mlb`, `nba`, `ncaaf`, `nhl`).
    """
    league = str(record.get("league") or "").strip().lower()
    sport_raw = str(record.get("sport") or "").strip().lower()
    if league == "nfl":
        return ("nfl", "NFL")
    if league in SOCCER_LEAGUE_TO_CANONICAL_DIV or sport_raw in (
        "soccer",
        "football_soccer",
    ):
        div = SOCCER_LEAGUE_TO_CANONICAL_DIV.get(league)
        if div is not None:
            return ("football", div)
    return None


def load_capture_health(timeseries_dir: Path) -> dict[str, Any]:
    """Lee `health.json` de `B3` en modo solo lectura."""
    health_path = timeseries_dir / "health.json"
    if not health_path.exists():
        return {
            "capture_status": "missing_health_file",
            "generated_at_utc": None,
            "events_tracked": 0,
            "total_rows_written": 0,
        }
    try:
        data = json.loads(health_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SnapshotRegenerationError(
            f"No se pudo parsear health.json en {health_path}: {exc}"
        ) from exc
    if not isinstance(data, dict):
        raise SnapshotRegenerationError(f"health.json inválido en {health_path}")
    return data


def load_and_validate_timeseries_ticks(
    timeseries_dir: Path,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    """Escanea `{football,nfl}/*.jsonl` de `B3`, excluye fuentes bloqueadas y valida esquema `A1`."""
    raw_rows: list[dict[str, Any]] = []
    files_scanned = 0
    blocked_rows_dropped = 0

    for sport_subdir in ("football", "nfl"):
        sub_path = timeseries_dir / sport_subdir
        if not sub_path.exists() or not sub_path.is_dir():
            continue
        for jsonl_file in sorted(sub_path.glob("*.jsonl")):
            files_scanned += 1
            text = jsonl_file.read_text(encoding="utf-8")
            for line_no, raw_line in enumerate(text.splitlines(), start=1):
                stripped = raw_line.strip()
                if not stripped:
                    continue
                try:
                    obj = json.loads(stripped)
                except json.JSONDecodeError as exc:
                    raise SnapshotRegenerationError(
                        f"JSON inválido en {jsonl_file}:{line_no}: {exc}"
                    ) from exc
                if not isinstance(obj, dict):
                    raise SnapshotRegenerationError(
                        f"Se esperaba objeto JSON en {jsonl_file}:{line_no}"
                    )
                book_norm = str(obj.get("book") or "").strip().lower()
                if book_norm in BLOCKED_OR_PLACEHOLDER_BOOKS:
                    blocked_rows_dropped += 1
                    continue
                row_copy = dict(obj)
                if not row_copy.get("source"):
                    row_copy["source"] = "scraped_ws"
                raw_rows.append(row_copy)

    if not raw_rows:
        return [], {
            "files_scanned": files_scanned,
            "raw_rows_read": 0,
            "blocked_rows_dropped": blocked_rows_dropped,
            "validated_rows": 0,
            "post_kickoff_dropped": 0,
            "invalid_schema_dropped": 0,
        }

    raw_df = pd.DataFrame(raw_rows)
    for col in REQUIRED_COLUMNS:
        if col not in raw_df.columns:
            raw_df[col] = None
    clean_df, stats = validate_and_deduplicate_snapshots(raw_df)

    validated_records: list[dict[str, Any]] = []
    for rec in clean_df[list(REQUIRED_COLUMNS)].to_dict(orient="records"):
        line_val = rec.get("line")
        norm_line = (
            None
            if line_val is None
            or (isinstance(line_val, float) and math.isnan(line_val))
            else float(line_val)
        )
        validated_records.append(
            {
                "event_id": str(rec["event_id"]),
                "sport": str(rec["sport"]),
                "league": str(rec["league"]),
                "market": str(rec["market"]),
                "line": norm_line,
                "selection": str(rec["selection"]),
                "book": str(rec["book"]).strip().lower(),
                "price_decimal": float(rec["price_decimal"]),
                "ts_captured": format_utc_iso(rec["ts_captured"]),
                "ts_event_start": format_utc_iso(rec["ts_event_start"]),
                "source": str(rec["source"]),
            }
        )

    invalid_dropped = int(stats.get("n_missing_required", 0)) + int(
        stats.get("n_out_of_range", 0)
    )
    return validated_records, {
        "files_scanned": files_scanned,
        "raw_rows_read": len(raw_rows),
        "blocked_rows_dropped": blocked_rows_dropped,
        "validated_rows": len(validated_records),
        "post_kickoff_dropped": int(stats.get("n_post_kickoff_discarded", 0)),
        "invalid_schema_dropped": invalid_dropped,
    }


def _parse_ws_event_id(event_id: str) -> tuple[str, str, str, str, str] | None:
    """Descompone `ws:<sport>:<league>:<YYYYMMDD>:<home_slug>:<away_slug>` si cumple formato."""
    parts = event_id.strip().split(":")
    if len(parts) != 6 or parts[0] != "ws":
        return None
    _, sport, league, ymd, home_slug, away_slug = parts
    if not home_slug or not away_slug:
        return None
    return (sport.lower(), league.upper(), ymd, home_slug.lower(), away_slug.lower())


def match_fresh_ticks_to_matchups(
    target_matchups: Sequence[Mapping[str, Any]],
    team_master_records: Sequence[Mapping[str, Any]],
    validated_ticks: Sequence[Mapping[str, Any]],
    now_utc_iso: str,
    max_quote_age_hours: float,
) -> tuple[dict[str, list[dict[str, Any]]], dict[str, str | None], int]:
    """Filtra ticks reales con `0 <= age < max_quote_age_hours` y `ts_captured <= kickoff` y los cruza."""
    if max_quote_age_hours <= 0 or not math.isfinite(max_quote_age_hours):
        raise SnapshotRegenerationError(
            f"max_quote_age_hours debe ser > 0; recibido {max_quote_age_hours!r}"
        )

    now_dt = parse_utc_datetime(now_utc_iso)
    if now_dt is None:
        raise SnapshotRegenerationError(f"now_utc inválido: {now_utc_iso!r}")
    max_age_seconds = max_quote_age_hours * 3600.0

    # 1. Filtro estricto de ventana `< max_quote_age_hours` y causalidad pre-kickoff
    fresh_ticks: list[tuple[dict[str, Any], datetime, datetime]] = []
    for tick in validated_ticks:
        cap_dt = parse_utc_datetime(tick.get("ts_captured"))
        start_dt = parse_utc_datetime(tick.get("ts_event_start"))
        if cap_dt is None or start_dt is None:
            continue
        age_sec = (now_dt - cap_dt).total_seconds()
        # Estricto: no futuro (`age_sec >= 0`) y estrictamente menor que `max_quote_age_hours` (`< 72 h`)
        if age_sec < 0.0 or age_sec >= max_age_seconds:
            continue
        if cap_dt > start_dt:
            continue
        fresh_ticks.append((dict(tick), cap_dt, start_dt))

    # Índice de `team_master_records` para enriquecer alias
    master_team_id_by_key: dict[tuple[str, str], str] = {}
    for tm in team_master_records:
        lg = str(tm.get("league") or "").strip().lower()
        t_name = str(tm.get("team_name") or "").strip()
        t_id = str(tm.get("team_id") or "").strip()
        if lg and t_name and t_id:
            master_team_id_by_key[(lg, slugify_team(t_name))] = t_id

    # Descriptores de los 130 enfrentamientos objetivo
    descriptors: list[dict[str, Any]] = []
    by_exact_id: dict[str, dict[str, Any]] = {}
    for rec in target_matchups:
        sp_div = resolve_matchup_outlook_sport_and_div(rec)
        if sp_div is None:
            continue
        outlook_sport, canon_div = sp_div
        matchup_id = str(rec["matchup_id"]).strip()
        league_raw = str(rec["league"]).strip().lower()
        home_team = str(rec["home_team"]).strip()
        away_team = str(rec["away_team"]).strip()

        short_home: str | None = None
        short_away: str | None = None
        prefix = f"{league_raw}_"
        if matchup_id.startswith(prefix) and "_vs_" in matchup_id[len(prefix) :]:
            rem = matchup_id[len(prefix) :]
            short_home, short_away = rem.split("_vs_", 1)

        home_master_id = master_team_id_by_key.get((league_raw, slugify_team(home_team)))
        away_master_id = master_team_id_by_key.get((league_raw, slugify_team(away_team)))

        kickoff_raw = rec.get("kickoff_utc")
        kickoff_dt = parse_utc_datetime(kickoff_raw) if kickoff_raw else None

        desc = {
            "matchup_id": matchup_id,
            "sport": outlook_sport,
            "canon_div": canon_div,
            "kickoff_dt": kickoff_dt,
            "kickoff_iso": format_utc_iso(kickoff_dt) if kickoff_dt is not None else None,
            "home_slugs": build_team_candidate_slugs(
                home_team, short_home, home_master_id, league_raw
            ),
            "away_slugs": build_team_candidate_slugs(
                away_team, short_away, away_master_id, league_raw
            ),
            "candidates": [],
        }
        descriptors.append(desc)
        by_exact_id[matchup_id] = desc

    for tick, cap_dt, start_dt in fresh_ticks:
        ev_id = str(tick["event_id"]).strip()
        matched_desc: dict[str, Any] | None = by_exact_id.get(ev_id)

        if matched_desc is None:
            parsed = _parse_ws_event_id(ev_id)
            if parsed is not None:
                ws_sport, ws_div, _ymd, ws_home, ws_away = parsed
                for desc in descriptors:
                    if desc["sport"] != ws_sport or desc["canon_div"] != ws_div:
                        continue
                    if (
                        ws_home not in desc["home_slugs"]
                        or ws_away not in desc["away_slugs"]
                    ):
                        continue
                    if desc["kickoff_dt"] is not None:
                        drift = abs((start_dt - desc["kickoff_dt"]).total_seconds())
                        if drift > MAX_FIXTURE_KICKOFF_DRIFT_SECONDS:
                            continue
                    matched_desc = desc
                    break

        if matched_desc is None:
            continue

        # Si el enfrentamiento ya trae `kickoff_utc`, exigimos también `ts_captured <= kickoff_utc`
        if matched_desc["kickoff_dt"] is not None and cap_dt > matched_desc["kickoff_dt"]:
            continue

        matched_desc["candidates"].append((tick, cap_dt, start_dt))

    snapshots_by_matchup: dict[str, list[dict[str, Any]]] = {}
    resolved_kickoff_by_matchup: dict[str, str | None] = {}

    for desc in descriptors:
        mid = desc["matchup_id"]
        cands: list[tuple[dict[str, Any], datetime, datetime]] = desc["candidates"]
        if not cands:
            snapshots_by_matchup[mid] = []
            resolved_kickoff_by_matchup[mid] = desc["kickoff_iso"]
            continue

        anchor_kickoff_dt: datetime = desc["kickoff_dt"]
        if anchor_kickoff_dt is None:
            future_starts = sorted({st for (_, _, st) in cands if st >= now_dt})
            if future_starts:
                anchor_kickoff_dt = future_starts[0]
            else:
                anchor_kickoff_dt = max(st for (_, _, st) in cands)

        rewritten: list[dict[str, Any]] = []
        for tick, cap_dt, start_dt in cands:
            if cap_dt > anchor_kickoff_dt:
                continue
            if (
                abs((start_dt - anchor_kickoff_dt).total_seconds())
                > MAX_FIXTURE_KICKOFF_DRIFT_SECONDS
            ):
                continue
            normalized_tick = dict(tick)
            normalized_tick["event_id"] = mid
            rewritten.append(normalized_tick)

        snapshots_by_matchup[mid] = rewritten
        resolved_kickoff_by_matchup[mid] = (
            desc["kickoff_iso"]
            if desc["kickoff_iso"] is not None
            else (format_utc_iso(anchor_kickoff_dt) if rewritten else None)
        )

    return snapshots_by_matchup, resolved_kickoff_by_matchup, len(fresh_ticks)


_INLINE_TS_RUNNER_SOURCE = r"""
import footballModelJson from "./src/data/prediction/model_motor_a.json";
import nflModelJson from "./src/data/prediction/model_nfl.json";
import { validateAndDeduplicateSnapshots, type OddsSnapshotRow } from "./src/domain/prediction/odds.ts";
import { buildMatchOutlook, type MatchOutlook } from "./src/domain/prediction/outlook.ts";
import {
  SERVICE_CONSTANTS_V3_2,
  buildTeamMasterIndex,
  synthesizeFootballSnapshotRowFromMaster,
  synthesizeNflSnapshotRowFromMaster,
  type LiveMatchupEdgeRecord,
  type TeamMasterFeatureRecord,
} from "./src/domain/prediction/service.ts";
import type { NFLLiveArtifactConfig } from "./src/domain/prediction/nfl_live.ts";
import type { ModelArtifact, NFLModelArtifact } from "./src/domain/prediction/types.ts";

interface BridgePayload {
  readonly generatedAtUtc: string;
  readonly maxQuoteAgeHours: number;
  readonly teamMasterRecords: readonly TeamMasterFeatureRecord[];
  readonly targetMatchups: ReadonlyArray<{
    readonly record: LiveMatchupEdgeRecord;
    readonly outlookSport: "football" | "nfl";
    readonly canonicalDiv: string;
    readonly resolvedKickoffUtc: string | null;
    readonly oddsSnapshots: readonly OddsSnapshotRow[];
  }>;
  readonly allValidatedTicks: readonly OddsSnapshotRow[];
}

function slugTokenLocal(raw: string | null | undefined): string {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const payload = (
  globalThis as unknown as { __B8_BRIDGE_PAYLOAD__: BridgePayload }
).__B8_BRIDGE_PAYLOAD__;

// Validación cruzada en TypeScript (`odds.ts`) de todos los ticks leídos
const tsDeduplicated = validateAndDeduplicateSnapshots(payload.allValidatedTicks);

const footballModel = footballModelJson as unknown as ModelArtifact;
const nflModel = nflModelJson as unknown as NFLModelArtifact & NFLLiveArtifactConfig;
const teamIndex = buildTeamMasterIndex(payload.teamMasterRecords, nflModel);
const maxQuoteAgeMinutes = payload.maxQuoteAgeHours * 60.0;

const outlooks: MatchOutlook[] = [];

for (const item of payload.targetMatchups) {
  const rec = item.record;
  const sportRaw = String(rec.sport ?? "").trim().toLowerCase();
  const leagueRaw = String(rec.league ?? "").trim().toLowerCase();
  const sHome = slugTokenLocal(rec.home_team);
  const sAway = slugTokenLocal(rec.away_team);

  const homeMaster =
    teamIndex.byLeagueSlug.get(`${leagueRaw}::${sHome}`) ??
    teamIndex.bySportSlug.get(`${sportRaw}::${sHome}`) ??
    null;
  const awayMaster =
    teamIndex.byLeagueSlug.get(`${leagueRaw}::${sAway}`) ??
    teamIndex.bySportSlug.get(`${sportRaw}::${sAway}`) ??
    null;

  if (item.outlookSport === "football") {
    const synth = synthesizeFootballSnapshotRowFromMaster(
      item.canonicalDiv,
      homeMaster,
      awayMaster,
      rec,
      footballModel,
      SERVICE_CONSTANTS_V3_2,
    );
    outlooks.push(
      buildMatchOutlook({
        matchId: rec.matchup_id,
        sport: "football",
        league: rec.league,
        homeTeam: rec.home_team,
        awayTeam: rec.away_team,
        tsDecision: payload.generatedAtUtc,
        kickoffUtc: item.resolvedKickoffUtc,
        football: {
          footballRow: synth.row,
          footballModel,
        },
        oddsSnapshots: item.oddsSnapshots,
        maxQuoteAgeMinutes,
      }),
    );
  } else {
    const homeAbbr = teamIndex.nflSlugToAbbr.get(sHome) ?? "";
    const awayAbbr = teamIndex.nflSlugToAbbr.get(sAway) ?? "";
    const synthNfl = synthesizeNflSnapshotRowFromMaster(
      homeAbbr,
      awayAbbr,
      homeMaster,
      awayMaster,
      rec,
      nflModel,
      SERVICE_CONSTANTS_V3_2,
    );
    outlooks.push(
      buildMatchOutlook({
        matchId: rec.matchup_id,
        sport: "nfl",
        league: rec.league,
        homeTeam: rec.home_team,
        awayTeam: rec.away_team,
        tsDecision: payload.generatedAtUtc,
        kickoffUtc: item.resolvedKickoffUtc,
        nfl: {
          nflRow: synthNfl.row,
          nflModel,
          liveContext: synthNfl.liveContext,
          liveConfig: nflModel,
        },
        oddsSnapshots: item.oddsSnapshots,
        maxQuoteAgeMinutes,
      }),
    );
  }
}

process.stdout.write(
  JSON.stringify({
    tsValidatedTickCount: tsDeduplicated.rows.length,
    tsInvalidDroppedCount:
      tsDeduplicated.stats.n_missing_required +
      tsDeduplicated.stats.n_out_of_range +
      tsDeduplicated.stats.n_post_kickoff_discarded +
      tsDeduplicated.stats.n_duplicates_removed,
    outlooks,
  }),
);
"""

_CACHED_TS_BUNDLE_B64: str | None = None
_NODE_BOOTSTRAP_EXPR = (
    "import fs from 'node:fs';"
    "const req = JSON.parse(fs.readFileSync(0, 'utf8'));"
    "globalThis.__B8_BRIDGE_PAYLOAD__ = req.payload;"
    "await import('data:text/javascript;base64,' + req.bundleB64);"
)


def _get_compiled_ts_bundle_b64() -> str:
    """Compila el puente `outlook.ts` + `service.ts` en memoria vía `esbuild` y cachea su base64."""
    global _CACHED_TS_BUNDLE_B64
    if _CACHED_TS_BUNDLE_B64 is not None:
        return _CACHED_TS_BUNDLE_B64

    esbuild_wrapper = (
        "import { build } from 'esbuild';\n"
        f"const tsSource = {json.dumps(_INLINE_TS_RUNNER_SOURCE)};\n"
        "const built = await build({\n"
        "  stdin: {\n"
        "    contents: tsSource,\n"
        f"    resolveDir: {json.dumps(str(WORKTREE_ROOT))},\n"
        "    loader: 'ts',\n"
        "    sourcefile: 'regenerate_live_snapshot_bridge.ts',\n"
        "  },\n"
        "  bundle: true,\n"
        "  write: false,\n"
        "  platform: 'node',\n"
        "  format: 'esm',\n"
        "  loader: { '.json': 'json' },\n"
        "});\n"
        "process.stdout.write(Buffer.from(built.outputFiles[0].text, 'utf8').toString('base64'));\n"
    )

    compile_proc = subprocess.run(
        ["node", "--input-type=module"],
        input=esbuild_wrapper,
        text=True,
        capture_output=True,
        encoding="utf-8",
        cwd=str(WORKTREE_ROOT),
        check=False,
    )
    if compile_proc.returncode != 0 or not compile_proc.stdout.strip():
        raise SnapshotRegenerationError(
            f"Fallo al compilar puente TypeScript de outlook.ts con esbuild:\n{compile_proc.stderr}"
        )

    _CACHED_TS_BUNDLE_B64 = compile_proc.stdout.strip()
    return _CACHED_TS_BUNDLE_B64


def invoke_typescript_outlook_builder(
    bridge_payload: Mapping[str, Any],
) -> tuple[list[dict[str, Any]], int, int]:
    """Ejecuta `buildMatchOutlook` (`src/domain/prediction/outlook.ts`) en memoria vía `esbuild` + `node`."""
    bundle_b64 = _get_compiled_ts_bundle_b64()
    stdin_envelope = json.dumps(
        {"bundleB64": bundle_b64, "payload": bridge_payload},
        ensure_ascii=False,
    )
    exec_proc = subprocess.run(
        ["node", "--input-type=module", "-e", _NODE_BOOTSTRAP_EXPR],
        input=stdin_envelope,
        text=True,
        capture_output=True,
        encoding="utf-8",
        cwd=str(WORKTREE_ROOT),
        check=False,
    )
    if exec_proc.returncode != 0:
        raise SnapshotRegenerationError(
            f"Fallo al ejecutar buildMatchOutlook en Node:\n{exec_proc.stderr}"
        )

    try:
        parsed = json.loads(exec_proc.stdout)
    except json.JSONDecodeError as exc:
        raise SnapshotRegenerationError(
            f"Salida JSON inválida desde puente Node: {exc}"
        ) from exc

    return (
        list(parsed["outlooks"]),
        int(parsed["tsValidatedTickCount"]),
        int(parsed["tsInvalidDroppedCount"]),
    )


def _assert_no_forbidden_outlook_fields(node: Any, path: str = "outlooks") -> None:
    if node is None:
        return
    if isinstance(node, str):
        if "pick seguro" in node.lower():
            raise SnapshotRegenerationError(
                f"Texto prohibido 'pick seguro' detectado en {path}"
            )
        return
    if isinstance(node, list):
        for idx, item in enumerate(node):
            _assert_no_forbidden_outlook_fields(item, f"{path}[{idx}]")
        return
    if isinstance(node, dict):
        for k, v in node.items():
            norm_k = str(k).lower()
            if (
                norm_k in FORBIDDEN_OUTLOOK_KEYS
                or "kelly" in norm_k
                or "stake" in norm_k
            ):
                raise SnapshotRegenerationError(
                    f"Clave prohibida '{k}' detectada en {path}.{k}"
                )
            _assert_no_forbidden_outlook_fields(v, f"{path}.{k}")


def validate_snapshot_payload(
    snapshot: Mapping[str, Any],
    *,
    max_quote_age_hours: float = DEFAULT_MAX_QUOTE_AGE_HOURS,
    reference_now_utc: str | None = None,
) -> dict[str, Any]:
    """Audita invariantes de compatibilidad, suma `< 1e-12`, frescura `< 72 h` y ausencia de stake."""
    if int(snapshot.get("n_matchups", -1)) != 242:
        raise SnapshotRegenerationError(
            f"n_matchups debe conservarse en 242; recibido {snapshot.get('n_matchups')!r}"
        )
    if int(snapshot.get("n_teams", -1)) != 376:
        raise SnapshotRegenerationError(
            f"n_teams debe conservarse en 376; recibido {snapshot.get('n_teams')!r}"
        )
    if int(snapshot.get("executable_bets_count", -1)) != 0:
        raise SnapshotRegenerationError(
            f"executable_bets_count debe ser 0 en v3.2; recibido {snapshot.get('executable_bets_count')!r}"
        )

    edge_records = snapshot.get("edge_matrix_records")
    team_records = snapshot.get("team_master_records")
    exp_preds = snapshot.get("expected_predictions")
    if not isinstance(edge_records, list) or len(edge_records) != 242:
        raise SnapshotRegenerationError("edge_matrix_records debe contener 242 registros")
    if not isinstance(team_records, list) or len(team_records) != 376:
        raise SnapshotRegenerationError("team_master_records debe contener 376 equipos")
    if not isinstance(exp_preds, list) or len(exp_preds) != 242:
        raise SnapshotRegenerationError("expected_predictions debe contener 242 entradas")

    outlooks = snapshot.get("outlooks")
    meta = snapshot.get("outlooks_meta")
    if not isinstance(outlooks, list) or len(outlooks) != 130:
        raise SnapshotRegenerationError(
            f"outlooks debe contener exactamente 130 MatchOutlook; recibido {len(outlooks) if isinstance(outlooks, list) else type(outlooks).__name__}"
        )
    if not isinstance(meta, dict):
        raise SnapshotRegenerationError("Falta bloque outlooks_meta en el snapshot")

    _assert_no_forbidden_outlook_fields(outlooks, "outlooks")
    _assert_no_forbidden_outlook_fields(meta, "outlooks_meta")

    gen_iso = str(meta.get("generated_at_utc") or snapshot.get("generated_at") or "")
    gen_dt = parse_utc_datetime(gen_iso)
    if gen_dt is None:
        raise SnapshotRegenerationError(f"generated_at_utc inválido: {gen_iso!r}")

    ref_dt = parse_utc_datetime(reference_now_utc) if reference_now_utc else gen_dt
    if ref_dt is None:
        raise SnapshotRegenerationError(
            f"reference_now_utc inválido: {reference_now_utc!r}"
        )

    max_age_sec = max_quote_age_hours * 3600.0
    n_football = 0
    n_nfl = 0
    n_sharp_fresh = 0
    max_simplex_error = 0.0
    attached_quotes_checked = 0

    expected_football_markets = [
        "1x2",
        "double_chance",
        "totals_1_5",
        "totals_2_5",
        "totals_3_5",
        "btts",
        "dnb",
        "ah_-1_0",
        "ah_-0_5",
        "ah_0_5",
        "ah_1_0",
    ]

    seen_ids: set[str] = set()
    for idx, outlook in enumerate(outlooks):
        if outlook.get("schemaVersion") != OUTLOOK_SCHEMA_VERSION:
            raise SnapshotRegenerationError(
                f"outlooks[{idx}].schemaVersion inválido: {outlook.get('schemaVersion')!r}"
            )
        mid = str(outlook.get("matchId") or "")
        if not mid or mid in seen_ids:
            raise SnapshotRegenerationError(
                f"matchId vacío o duplicado en outlooks[{idx}]: {mid!r}"
            )
        seen_ids.add(mid)

        sp = outlook.get("sport")
        markets = outlook.get("markets")
        if not isinstance(markets, list) or not markets:
            raise SnapshotRegenerationError(f"outlooks[{idx}] sin mercados")

        if sp == "football":
            n_football += 1
            m_keys = [m.get("marketKey") for m in markets]
            if m_keys != expected_football_markets:
                raise SnapshotRegenerationError(
                    f"Mercados de fútbol inesperados en {mid}: {m_keys}"
                )
            top_sc = outlook.get("topScorelines")
            if not isinstance(top_sc, list) or len(top_sc) != 3:
                raise SnapshotRegenerationError(
                    f"topScorelines debe tener 3 marcadores en {mid}"
                )
        elif sp == "nfl":
            n_nfl += 1
            if markets[0].get("marketKey") != "moneyline":
                raise SnapshotRegenerationError(
                    f"Primer mercado NFL debe ser moneyline en {mid}"
                )
        else:
            raise SnapshotRegenerationError(f"Deporte no soportado en outlooks[{idx}]: {sp!r}")

        kick_iso = outlook.get("kickoffUtc")
        kick_dt = parse_utc_datetime(kick_iso) if kick_iso else None

        if bool(outlook.get("dataQuality", {}).get("sharpMarketAvailable")):
            n_sharp_fresh += 1

        for m in markets:
            sels = m.get("selections", [])
            exp_sum = float(m.get("expectedProbabilitySum", 1.0))
            actual_sum = sum(float(s["p"]) for s in sels)
            err = abs(actual_sum - exp_sum)
            if err >= SIMPLEX_TOLERANCE:
                raise SnapshotRegenerationError(
                    f"Error de suma de probabilidades >= 1e-12 en {mid}::{m.get('marketKey')}: {err}"
                )
            max_simplex_error = max(max_simplex_error, err)

            mkt_ctx = m.get("market")
            if mkt_ctx is None:
                m_key = str(m.get("marketKey") or "")
                parent_1x2_mkt = (
                    outlook.get("marketsByKey", {}).get("1x2", {}).get("market")
                    if m_key == "double_chance"
                    else None
                )
                allowed_null_sources = (
                    ("model", "base_rate", "market_sharp_novig", "blend_v3_1")
                    if parent_1x2_mkt is not None
                    else ("model", "base_rate")
                )
                for s in sels:
                    if s.get("pSource") not in allowed_null_sources:
                        raise SnapshotRegenerationError(
                            f"{mid}::{m_key} tiene market=null pero pSource={s.get('pSource')!r}"
                        )
            else:
                attached_quotes_checked += 1
                book_name = str(mkt_ctx.get("book") or "").strip().lower()
                if not book_name or book_name in BLOCKED_OR_PLACEHOLDER_BOOKS:
                    raise SnapshotRegenerationError(
                        f"Libro inválido o bloqueado en {mid}::{m.get('marketKey')}: {book_name!r}"
                    )
                cap_dt = parse_utc_datetime(mkt_ctx.get("tsCaptured"))
                if cap_dt is None:
                    raise SnapshotRegenerationError(
                        f"tsCaptured inválido en {mid}::{m.get('marketKey')}"
                    )
                age_vs_gen = (gen_dt - cap_dt).total_seconds()
                age_vs_ref = (ref_dt - cap_dt).total_seconds()
                if age_vs_gen < 0.0 or age_vs_gen >= max_age_sec:
                    raise SnapshotRegenerationError(
                        f"Cuota fuera de ventana < {max_quote_age_hours}h respecto a generated_at en {mid}: {age_vs_gen / 3600.0:.3f}h"
                    )
                if age_vs_ref < 0.0 or age_vs_ref >= max_age_sec:
                    raise SnapshotRegenerationError(
                        f"Cuota expirada (>= {max_quote_age_hours}h) respecto a reloj de verificación en {mid}: {age_vs_ref / 3600.0:.3f}h"
                    )
                if kick_dt is not None and cap_dt > kick_dt:
                    raise SnapshotRegenerationError(
                        f"Cuota post-kickoff detectada en {mid}: {mkt_ctx.get('tsCaptured')} > {kick_iso}"
                    )

    if n_football != 84 or n_nfl != 46:
        raise SnapshotRegenerationError(
            f"Conteo por deporte inesperado: football={n_football} (esp. 84), nfl={n_nfl} (esp. 46)"
        )
    if (
        int(meta.get("n_outlooks_total", -1)) != 130
        or int(meta.get("n_football", -1)) != 84
        or int(meta.get("n_nfl", -1)) != 46
        or int(meta.get("n_with_fresh_sharp_quotes_lt_72h", -1)) != n_sharp_fresh
    ):
        raise SnapshotRegenerationError(
            f"Desajuste entre outlooks_meta y outlooks: meta={meta}"
        )

    return {
        "n_outlooks_total": len(outlooks),
        "n_football": n_football,
        "n_nfl": n_nfl,
        "n_with_fresh_sharp_quotes_lt_72h": n_sharp_fresh,
        "attached_quotes_checked": attached_quotes_checked,
        "max_simplex_error": max_simplex_error,
        "capture_status": meta.get("capture_status"),
    }


def build_regenerated_snapshot(
    *,
    base_snapshot_path: Path = DEFAULT_SNAPSHOT_PATH,
    timeseries_dir: Path = DEFAULT_TIMESERIES_DIR,
    max_quote_age_hours: float = DEFAULT_MAX_QUOTE_AGE_HOURS,
    now_utc: str | None = None,
) -> dict[str, Any]:
    """Construye en memoria el diccionario completo de `live_matchday_v3_snapshot.json` actualizado."""
    t0 = time.perf_counter()
    if not base_snapshot_path.exists():
        raise SnapshotRegenerationError(
            f"No existe el snapshot base en {base_snapshot_path}"
        )

    base_data = json.loads(base_snapshot_path.read_text(encoding="utf-8"))
    edge_records: list[dict[str, Any]] = base_data["edge_matrix_records"]
    team_records: list[dict[str, Any]] = base_data["team_master_records"]
    counts_by_league: dict[str, int] = base_data["counts_by_league"]
    expected_predictions: list[dict[str, Any]] = base_data["expected_predictions"]

    generated_at_utc = (
        format_utc_iso(now_utc)
        if now_utc is not None
        else datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    )

    health = load_capture_health(timeseries_dir)
    capture_status = str(health.get("capture_status") or "unknown")

    validated_ticks, tick_stats = load_and_validate_timeseries_ticks(timeseries_dir)

    target_entries: list[tuple[dict[str, Any], str, str]] = []
    for rec in edge_records:
        sp_div = resolve_matchup_outlook_sport_and_div(rec)
        if sp_div is not None:
            target_entries.append((rec, sp_div[0], sp_div[1]))

    snapshots_by_mid, resolved_kickoff_by_mid, n_fresh_ticks_total = (
        match_fresh_ticks_to_matchups(
            target_matchups=[t[0] for t in target_entries],
            team_master_records=team_records,
            validated_ticks=validated_ticks,
            now_utc_iso=generated_at_utc,
            max_quote_age_hours=max_quote_age_hours,
        )
    )

    bridge_payload = {
        "generatedAtUtc": generated_at_utc,
        "maxQuoteAgeHours": float(max_quote_age_hours),
        "teamMasterRecords": team_records,
        "allValidatedTicks": validated_ticks,
        "targetMatchups": [
            {
                "record": rec,
                "outlookSport": outlook_sport,
                "canonicalDiv": canon_div,
                "resolvedKickoffUtc": resolved_kickoff_by_mid.get(rec["matchup_id"]),
                "oddsSnapshots": snapshots_by_mid.get(rec["matchup_id"], []),
            }
            for (rec, outlook_sport, canon_div) in target_entries
        ],
    }

    outlooks, ts_valid_count, ts_invalid_dropped = invoke_typescript_outlook_builder(
        bridge_payload
    )
    if ts_invalid_dropped != 0 or ts_valid_count != len(validated_ticks):
        raise SnapshotRegenerationError(
            f"Discrepancia de validación TS (`odds.ts`) vs Python (`odds_snapshots.py`): "
            f"py={len(validated_ticks)}, ts={ts_valid_count}, ts_dropped={ts_invalid_dropped}"
        )

    n_football = sum(1 for o in outlooks if o.get("sport") == "football")
    n_nfl = sum(1 for o in outlooks if o.get("sport") == "nfl")
    n_with_sharp = sum(
        1
        for o in outlooks
        if bool(o.get("dataQuality", {}).get("sharpMarketAvailable"))
    )
    n_with_any_quote = sum(
        1
        for o in outlooks
        if any(m.get("market") is not None for m in o.get("markets", []))
    )
    outlook_counts_by_league = dict(
        sorted(Counter(str(o.get("league")) for o in outlooks).items())
    )

    age_hours_json: int | float = (
        int(max_quote_age_hours)
        if float(max_quote_age_hours).is_integer()
        else float(max_quote_age_hours)
    )
    elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 4)

    outlooks_meta = {
        "schema_version": OUTLOOK_SCHEMA_VERSION,
        "generated_at_utc": generated_at_utc,
        "max_quote_age_hours": age_hours_json,
        "n_outlooks_total": len(outlooks),
        "n_football": n_football,
        "n_nfl": n_nfl,
        "counts_by_league": outlook_counts_by_league,
        "n_with_fresh_sharp_quotes_lt_72h": n_with_sharp,
        "n_with_any_fresh_quotes_lt_72h": n_with_any_quote,
        "timeseries_files_scanned": tick_stats["files_scanned"],
        "timeseries_rows_validated": tick_stats["validated_rows"],
        "timeseries_rows_fresh_lt_72h": n_fresh_ticks_total,
        "capture_status": capture_status,
        "health_generated_at_utc": health.get("generated_at_utc"),
        "regeneration_latency_ms": elapsed_ms,
    }

    regenerated = {
        "schema_version": SNAPSHOT_SCHEMA_VERSION,
        "suite_codename": SUITE_CODENAME,
        "generated_at": generated_at_utc,
        "n_matchups": base_data["n_matchups"],
        "n_teams": base_data["n_teams"],
        "python_total_latency_ms": base_data["python_total_latency_ms"],
        "python_avg_latency_ms": base_data["python_avg_latency_ms"],
        "counts_by_league": counts_by_league,
        "executable_bets_count": 0,
        "vetoed_by_rlm_count": 0,
        "institutionally_confirmed_count": 0,
        "outlooks_meta": outlooks_meta,
        "outlooks": outlooks,
        "edge_matrix_records": edge_records,
        "team_master_records": team_records,
        "expected_predictions": expected_predictions,
    }

    validate_snapshot_payload(
        regenerated,
        max_quote_age_hours=max_quote_age_hours,
        reference_now_utc=generated_at_utc,
    )
    return regenerated


def regenerate_live_snapshot_file(
    *,
    out_path: Path = DEFAULT_SNAPSHOT_PATH,
    base_snapshot_path: Path | None = None,
    timeseries_dir: Path = DEFAULT_TIMESERIES_DIR,
    max_quote_age_hours: float = DEFAULT_MAX_QUOTE_AGE_HOURS,
    now_utc: str | None = None,
) -> dict[str, Any]:
    """Regenera y escribe atómicamente el archivo `live_matchday_v3_snapshot.json`."""
    effective_base = (
        base_snapshot_path
        if base_snapshot_path is not None
        else (out_path if out_path.exists() else DEFAULT_SNAPSHOT_PATH)
    )
    regenerated = build_regenerated_snapshot(
        base_snapshot_path=effective_base,
        timeseries_dir=timeseries_dir,
        max_quote_age_hours=max_quote_age_hours,
        now_utc=now_utc,
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(regenerated, indent=2, ensure_ascii=False) + "\n"
    out_path.write_text(serialized, encoding="utf-8")
    return regenerated


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Regenera o verifica src/data/prediction/live_matchday_v3_snapshot.json "
            "cruzando la serie multi-tick legal de B3 con ventana estricta < max-quote-age-hours."
        )
    )
    parser.add_argument(
        "--timeseries-dir",
        type=Path,
        default=DEFAULT_TIMESERIES_DIR,
        help="Directorio de serie temporal multi-tick de B3 (por defecto ../web-scraping/data/odds_timeseries).",
    )
    parser.add_argument(
        "--max-quote-age-hours",
        type=float,
        default=DEFAULT_MAX_QUOTE_AGE_HOURS,
        help="Antigüedad máxima estricta (< horas) para aceptar una cuota real (por defecto 72).",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=DEFAULT_SNAPSHOT_PATH,
        help="Ruta del archivo live_matchday_v3_snapshot.json a escribir o verificar.",
    )
    parser.add_argument(
        "--base-snapshot",
        type=Path,
        default=None,
        help="Snapshot base opcional de entrada (por defecto igual a --out).",
    )
    parser.add_argument(
        "--now-utc",
        type=str,
        default=None,
        help="Timestamp UTC ISO-8601 opcional para corridas deterministas (por defecto reloj UTC actual).",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Modo auditoría sin escritura: valida tipos, sumas < 1e-12, frescura < max-quote-age-hours y ausencia de stake.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    if args.check:
        if not args.out.exists():
            print(
                f"[FAIL] No existe el archivo de snapshot a verificar: {args.out}",
                file=sys.stderr,
            )
            return 1
        try:
            existing = json.loads(args.out.read_text(encoding="utf-8"))
            ref_now = (
                format_utc_iso(args.now_utc)
                if args.now_utc is not None
                else datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            )
            summary = validate_snapshot_payload(
                existing,
                max_quote_age_hours=args.max_quote_age_hours,
                reference_now_utc=ref_now,
            )
        except (OSError, json.JSONDecodeError, SnapshotRegenerationError) as exc:
            print(f"[FAIL] Verificación --check falló: {exc}", file=sys.stderr)
            return 1

        print(json.dumps({"status": "ok", "mode": "check", **summary}, ensure_ascii=False))
        return 0

    regenerated = regenerate_live_snapshot_file(
        out_path=args.out,
        base_snapshot_path=args.base_snapshot,
        timeseries_dir=args.timeseries_dir,
        max_quote_age_hours=args.max_quote_age_hours,
        now_utc=args.now_utc,
    )
    print(
        json.dumps(
            {
                "status": "regenerated",
                "out": str(args.out),
                "outlooks_meta": regenerated["outlooks_meta"],
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
