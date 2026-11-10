"""Orquestador Pre-Jornada CLI (`run_matchday_refresh.py`) para PitchLab Web-Scraping.

Gestiona la actualización inteligente, auditoría criptográfica (`sha256`), control anti-leakage
(`captured_at_utc <= now_utc`) y cumplimiento de SLA de frescura para las 28 fuentes del
catálogo maestro (`config/sources_catalog.json`) dentro de `.worktrees/web-scraping`.

Modos de operación principales:
- Ejecución normal por ventana (`--window T-24h`, `T-6h`, `T-1h`, etc.): inspecciona el último
  snapshot de cada fuente aplicable, decide `SKIP_FRESH` vs `RUN_SCRAPER`, ejecuta los scrapers
  requeridos mediante `subprocess.run([sys.executable, ...])` y reconstruye `normalize_datasets.py`
  + `build_feature_store.py` (salvo `--skip-build`).
- `--dry-run`: calcula y muestra el plan exacto de ejecución por fuente sin lanzar subprocesos.
- `--verify-only`: audita todos los snapshots crudos existentes en `data/raw/` verificando
  integridad `sha256`, regla anti-leakage (`captured_at_utc <= now_utc`) y SLA de frescura sin
  disparar tráfico de red.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import sys
import time
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
WORKTREE_ROOT = SCRIPT_DIR.parent
if str(WORKTREE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKTREE_ROOT))

from scrapers.base_scraper import (  # noqa: E402
    CATALOG_PATH,
    DATA_RAW_DIR,
    load_sources_catalog,
    sha256_text,
    utc_now_iso,
)


VALID_WINDOWS = (
    "T-72h",
    "T-24h",
    "T-6h",
    "T-2h",
    "T-90m",
    "T-1h",
    "post-match",
    "weekly",
    "all",
)

WINDOW_DEFAULT_SLA_HOURS: dict[str, float] = {
    "T-1h": 1.5,
    "T-90m": 2.0,
    "T-2h": 2.5,
    "T-6h": 6.0,
    "T-24h": 24.0,
    "T-72h": 72.0,
    "weekly": 168.0,
    "post-match": 24.0,
    "all": 24.0,
}

# Compatibilidad de ventanas con las etiquetas `capture_schedule` de `sources_catalog.json`
WINDOW_SCHEDULE_COMPATIBILITY: dict[str, set[str]] = {
    "T-72h": {"T-72h", "T-48h", "weekly"},
    "T-24h": {"T-24h", "T-48h"},
    "T-6h": {"T-6h", "T-3h", "T-2h", "T-1h"},
    "T-2h": {"T-2h", "T-3h", "T-90m", "T-1h"},
    "T-90m": {"T-90m", "T-2h", "T-1h"},
    "T-1h": {"T-1h", "T-90m"},
    "post-match": {"post-match"},
    "weekly": {"weekly"},
}


# Registro maestro de los 28 `source_id` de `config/sources_catalog.json` hacia el scraper más completo/reciente
SOURCE_SCRAPER_REGISTRY: dict[str, dict[str, Any]] = {
    # --- 1. odds_casinos (6 fuentes) ---
    "pinnacle": {
        "script": "wave4_european_stadiums_and_deep_odds.py",
        "args": ["--source", "pinnacle"],
        "coverage_note": "Wave 4 Arcadia Multi-League (Europa Top-5, UCL, Liga MX, NFL, NBA, NHL)",
    },
    "caliente_mx": {
        "script": "odds_scraper.py",
        "args": ["--source", "caliente_mx"],
        "coverage_note": "Wave 1 Caliente.mx Sportsbook (Liga MX, Fútbol Europeo, US Sports)",
    },
    "codere_bet365_mx": {
        "script": "wave2_stats_odds_scraper.py",
        "args": ["--source", "codere_bet365_mx"],
        "coverage_note": "Wave 2 Codere.mx / Bet365 MX Markets",
    },
    "oddsportal_oddschecker": {
        "script": "wave2_stats_odds_scraper.py",
        "args": ["--source", "oddsportal_oddschecker"],
        "coverage_note": "Wave 2 OddsPortal / Oddschecker Opening vs Closing Consensus",
    },
    "action_network_splits": {
        "script": "wave5_multisport_odds_injuries_weather.py",
        "args": ["--source", "action_network_splits"],
        "secondary_script": "wave3_deep_odds_env_referees.py",
        "coverage_note": "Wave 5 Multi-Sport Splits & Open/Current RLM (NBA, NHL, MLB, NCAAF, NFL)",
    },
    "betfair_smarkets_exchange": {
        "script": "wave5_multisport_odds_injuries_weather.py",
        "args": ["--source", "betfair_smarkets_exchange"],
        "secondary_script": "wave3_deep_odds_env_referees.py",
        "coverage_note": "Wave 5 Smarkets P2P Exchange Multi-Sport (NBA, NHL, MLB, NCAAF, NFL)",
    },
    # --- 2. advanced_stats_xg (12 fuentes) ---
    "opta_player_stats": {
        "script": "wave4_full_opta_statiskicks_understat.py",
        "args": ["--source", "opta_player_stats"],
        "coverage_note": "Wave 4 Opta PerformFeeds (18 clubes Liga MX detailed + 7 competiciones)",
    },
    "statiskicks": {
        "script": "wave4_full_opta_statiskicks_understat.py",
        "args": ["--source", "statiskicks"],
        "coverage_note": "Wave 4 Statiskicks (18+ clubes Liga MX series xG rolling, xP y SKore)",
    },
    "sofascore": {
        "script": "wave4_full_rosters_and_history.py",
        "args": [],
        "coverage_note": "Wave 4 Sofascore 7 Ligas (tablas, eventos y top players)",
    },
    "fotmob": {
        "script": "wave3_deep_six_leagues.py",
        "args": [],
        "coverage_note": "Wave 3 FotMob 7 Competiciones (__NEXT_DATA__ xG, tablas y líderes)",
    },
    "fbref": {
        "script": "wave4_full_rosters_and_history.py",
        "args": [],
        "secondary_script": "wave3_deep_six_leagues.py",
        "coverage_note": "Wave 4 FBref Histórico Multi-Temporada + 6 Ligas",
    },
    "understat": {
        "script": "wave4_full_opta_statiskicks_understat.py",
        "args": ["--source", "understat"],
        "coverage_note": "Wave 4 Understat 5 Ligas Europeas (~2,774 jugadores + histórico 2023-2024)",
    },
    "clubelo_transfermarkt_values": {
        "script": "wave4_full_rosters_and_history.py",
        "args": [],
        "secondary_script": "wave3_deep_six_leagues.py",
        "coverage_note": "Wave 4 Plantillas Completas Transfermarkt + Valores 6 Ligas",
    },
    "pfr_rbsdm_sumersports": {
        "script": "wave2_stats_odds_scraper.py",
        "args": ["--source", "pfr_rbsdm_sumersports"],
        "coverage_note": "Wave 2 Pro-Football-Reference / RBSDM / SumerSports NFL EPA",
    },
    "nhl_moneypuck_hockeyref": {
        "script": "wave5_multisport_advanced_stats.py",
        "args": ["--source", "nhl_moneypuck_hockeyref"],
        "dynamic_wave5_probe": True,
        "coverage_note": "Wave 5 MoneyPuck & Hockey-Reference (NHL xG, Corsi, Fenwick, GSAx)",
    },
    "mlb_fangraphs_baseballref": {
        "script": "wave5_multisport_advanced_stats.py",
        "args": ["--source", "mlb_fangraphs_baseballref"],
        "dynamic_wave5_probe": True,
        "coverage_note": "Wave 5 Baseball-Reference & MLB StatsAPI (OPS+, wOBA, FIP, WHIP)",
    },
    "nba_bballref_fourfactors": {
        "script": "wave5_multisport_advanced_stats.py",
        "args": ["--source", "nba_bballref_fourfactors"],
        "dynamic_wave5_probe": True,
        "coverage_note": "Wave 5 Basketball-Reference & ESPN NBA (ORTG, DRTG, NetRTG, Four Factors)",
    },
    "ncaaf_cfb_sp_plus_srs": {
        "script": "wave5_multisport_advanced_stats.py",
        "args": ["--source", "ncaaf_cfb_sp_plus_srs"],
        "dynamic_wave5_probe": True,
        "coverage_note": "Wave 5 Sports-Reference CFB & ESPN NCAAF (SRS, SOS, Off/Def YPP)",
    },
    # --- 3. injuries_lineups (4 fuentes) ---
    "transfermarkt_injuries": {
        "script": "wave3_deep_six_leagues.py",
        "args": [],
        "coverage_note": "Wave 3 Transfermarkt Lesiones y Sanciones 6 Ligas",
    },
    "premierinjuries_sportsgambler": {
        "script": "wave2_context_scraper.py",
        "args": [],
        "coverage_note": "Wave 2 PremierInjuries & SportsGambler Football Availability",
    },
    "rotowire_lineups_injuries": {
        "script": "wave5_multisport_odds_injuries_weather.py",
        "args": ["--source", "rotowire_lineups_injuries"],
        "secondary_script": "wave4_european_stadiums_and_deep_odds.py",
        "coverage_note": "Wave 5 CBS + ESPN + RotoWire + Covers Multi-Sport Injuries & Starters",
    },
    "nfl_official_injuries_depth": {
        "script": "wave2_context_scraper.py",
        "args": [],
        "coverage_note": "Wave 2 NFL Official Injury Report & Ourlads Depth Charts",
    },
    # --- 4. news_press_sentiment (4 fuentes) ---
    "mediotiempo_record_mx": {
        "script": "context_scraper.py",
        "args": [],
        "coverage_note": "Wave 1 Mediotiempo / Récord Liga MX AI-Targeted Markdown",
    },
    "ffs_bbc_press_conferences": {
        "script": "wave2_context_scraper.py",
        "args": [],
        "coverage_note": "Wave 2 Fantasy Football Scout & BBC Sport EPL Press Conferences",
    },
    "marca_as_laliga_news": {
        "script": "wave2_context_scraper.py",
        "args": [],
        "coverage_note": "Wave 2 Marca / Diario AS LaLiga Medical & Lineup News",
    },
    "profootballtalk_nfl_news": {
        "script": "wave2_context_scraper.py",
        "args": [],
        "coverage_note": "Wave 2 ProFootballTalk / NBC Sports NFL Beat Reports",
    },
    # --- 5. environment_referees (2 fuentes) ---
    "open_meteo_nflweather": {
        "script": "wave5_multisport_odds_injuries_weather.py",
        "args": ["--source", "open_meteo_nflweather"],
        "secondary_script": "wave4_european_stadiums_and_deep_odds.py",
        "coverage_note": "Wave 5 Open-Meteo 30 MLB Ballparks + 30 NCAAF Stadiums (plus Wave 3/4 108 Stadiums)",
    },
    "worldfootball_nflpenalties_referees": {
        "script": "wave3_deep_odds_env_referees.py",
        "args": ["--source", "worldfootball_nflpenalties_referees"],
        "coverage_note": "Wave 3 WorldFootball 6 Ligas + NFLPenalties Crews & All-Penalties",
    },
}


def _resolve_scraper_binding(source_id: str, requested_leagues: set[str] | None) -> dict[str, Any]:
    """Resuelve el script exacto en `scrapers/` para un `source_id`, incluyendo autodetección Wave 5."""
    entry = dict(
        SOURCE_SCRAPER_REGISTRY.get(
            source_id,
            {
                "script": "base_scraper.py",
                "args": ["--list-sources"],
                "coverage_note": "Fallback binding",
            },
        )
    )

    # Si se pidieron exclusivamente ligas de fútbol europeo/Liga MX en fuentes multi-ola, usar el script europeo/fútbol
    soccer_only_leagues = {
        "liga-mx",
        "expansion-mx",
        "epl",
        "laliga",
        "bundesliga",
        "serie-a",
        "ligue-1",
        "champions-league",
    }
    if (
        requested_leagues
        and requested_leagues.issubset(soccer_only_leagues)
        and entry.get("secondary_script")
        and source_id in {"rotowire_lineups_injuries", "open_meteo_nflweather", "action_network_splits"}
    ):
        sec_script = entry["secondary_script"]
        entry["script"] = sec_script
        entry["args"] = ["--source", source_id]

    # Autodetección dinámica para scripts paralelos de Wave 5 (ej. stats NBA/NHL/MLB/NCAAF)
    if entry.get("dynamic_wave5_probe"):
        default_path = SCRIPT_DIR / entry["script"]
        if not default_path.exists():
            for candidate in sorted(SCRIPT_DIR.glob("wave5*.py")):
                if candidate.name in {
                    "wave5_multisport_odds_injuries_weather.py",
                    "run_matchday_refresh.py",
                }:
                    continue
                try:
                    txt = candidate.read_text(encoding="utf-8", errors="ignore")
                except OSError:
                    continue
                if source_id in txt:
                    entry["script"] = candidate.name
                    entry["args"] = ["--source", source_id] if '"--source"' in txt or "'--source'" in txt else []
                    break

    script_path = SCRIPT_DIR / entry["script"]
    entry["script_path"] = str(script_path)
    entry["script_exists"] = script_path.exists()
    return entry


def _parse_iso_utc(ts_str: str | None) -> datetime | None:
    if not ts_str or not isinstance(ts_str, str):
        return None
    cleaned = ts_str.strip()
    if cleaned.endswith("Z"):
        cleaned = cleaned[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(cleaned)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError:
        return None


def _verify_snapshot_file(file_path: Path, now_utc: datetime) -> dict[str, Any]:
    """Audita un archivo JSON de snapshot crudo: `sha256` del `payload`, `captured_at_utc <= now_utc` y edad."""
    rel_path = str(file_path.relative_to(WORKTREE_ROOT)).replace("\\", "/")
    try:
        envelope = json.loads(file_path.read_text(encoding="utf-8"))
    except Exception as exc:
        return {
            "path": rel_path,
            "valid_json": False,
            "sha256_valid": False,
            "anti_leakage_valid": False,
            "error": f"JSON inválido: {exc}",
        }

    if not isinstance(envelope, dict) or "payload" not in envelope:
        return {
            "path": rel_path,
            "valid_json": True,
            "sha256_valid": False,
            "anti_leakage_valid": False,
            "error": "Falta llave obligatoria 'payload' en el envelope.",
        }

    payload = envelope.get("payload")
    serialized = (
        payload
        if isinstance(payload, str)
        else json.dumps(payload, ensure_ascii=False, sort_keys=True)
    )
    computed_hash = sha256_text(serialized)
    stored_hash = str(envelope.get("sha256") or "")
    sha256_valid = bool(stored_hash and computed_hash == stored_hash)

    captured_str = envelope.get("captured_at_utc")
    captured_dt = _parse_iso_utc(captured_str)
    if captured_dt is not None:
        # Tolerancia de 2 segundos ante redondeo de reloj del sistema
        delta_sec = (now_utc - captured_dt).total_seconds()
        anti_leakage_valid = delta_sec >= -2.0
        age_hours = round(max(0.0, delta_sec) / 3600.0, 4)
    else:
        anti_leakage_valid = False
        age_hours = None

    return {
        "path": rel_path,
        "source_id": envelope.get("source_id"),
        "category": envelope.get("category"),
        "captured_at_utc": captured_str,
        "stored_sha256": stored_hash,
        "computed_sha256": computed_hash,
        "valid_json": True,
        "sha256_valid": sha256_valid,
        "anti_leakage_valid": anti_leakage_valid,
        "age_hours": age_hours,
        "meta": envelope.get("meta") or {},
    }


def _inspect_source_snapshots(
    category: str,
    source_id: str,
    now_utc: datetime,
    audit_all_files: bool = False,
) -> dict[str, Any]:
    """Inspecciona `data/raw/{category}/{source_id}/`, audita el último snapshot (o todos en `--verify-only`)."""
    src_dir = DATA_RAW_DIR / category / source_id
    if not src_dir.exists():
        return {
            "snapshots_count": 0,
            "markdown_artifacts_count": 0,
            "latest_snapshot": None,
            "all_snapshots_audit": [],
            "all_sha256_valid": True,
            "all_anti_leakage_valid": True,
        }

    json_files = sorted(src_dir.rglob("*.json"))
    md_files = sorted(src_dir.rglob("*.md"))
    if not json_files:
        return {
            "snapshots_count": 0,
            "markdown_artifacts_count": len(md_files),
            "latest_snapshot": None,
            "all_snapshots_audit": [],
            "all_sha256_valid": True,
            "all_anti_leakage_valid": True,
        }

    if audit_all_files:
        audits = [_verify_snapshot_file(f, now_utc) for f in json_files]
        valid_dated = [a for a in audits if a.get("captured_at_utc")]
        latest = (
            max(valid_dated, key=lambda a: (a["captured_at_utc"], a["path"]))
            if valid_dated
            else audits[-1]
        )
        all_sha_ok = all(a.get("sha256_valid", False) for a in audits)
        all_leak_ok = all(a.get("anti_leakage_valid", False) for a in audits)
    else:
        # Los nombres siguen `YYYYMMDDTHHMMSSZ_{label}_{hash}.json`, por lo que `json_files[-1]` suele ser el más reciente;
        # verificamos los últimos 5 por seguridad ante subcarpetas de fecha.
        tail_audits = [_verify_snapshot_file(f, now_utc) for f in json_files[-5:]]
        valid_dated = [a for a in tail_audits if a.get("captured_at_utc")]
        latest = (
            max(valid_dated, key=lambda a: (a["captured_at_utc"], a["path"]))
            if valid_dated
            else tail_audits[-1]
        )
        audits = [latest]
        all_sha_ok = bool(latest.get("sha256_valid", False))
        all_leak_ok = bool(latest.get("anti_leakage_valid", False))

    return {
        "snapshots_count": len(json_files),
        "markdown_artifacts_count": len(md_files),
        "latest_snapshot": latest,
        "all_snapshots_audit": audits if audit_all_files else [],
        "all_sha256_valid": all_sha_ok,
        "all_anti_leakage_valid": all_leak_ok,
    }


def _parse_csv_filter(raw: str | None) -> set[str] | None:
    if raw is None:
        return None
    cleaned = raw.strip()
    if not cleaned or cleaned.lower() == "all":
        return None
    items = {tok.strip().lower() for tok in cleaned.split(",") if tok.strip()}
    return items or None


def _source_matches_window(source: dict[str, Any], window: str) -> bool:
    if window == "all":
        return True
    schedules = set(source.get("capture_schedule") or [])
    compatible = WINDOW_SCHEDULE_COMPATIBILITY.get(window, {window})
    return bool(schedules & compatible)


def _resolve_report_path(raw_report_path: str) -> Path:
    """Garantiza que rutas relativas se resuelvan siempre dentro de `.worktrees/web-scraping`."""
    candidate = Path(raw_report_path)
    if not candidate.is_absolute():
        candidate = (WORKTREE_ROOT / candidate).resolve()
    else:
        candidate = candidate.resolve()
    worktree_resolved = WORKTREE_ROOT.resolve()
    if worktree_resolved not in candidate.parents and candidate != worktree_resolved:
        raise ValueError(
            f"Ruta de reporte '{candidate}' fuera de '{worktree_resolved}'. "
            "Por regla de aislamiento, todos los artefactos deben permanecer en .worktrees/web-scraping."
        )
    return candidate


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Orquestador Pre-Jornada CLI de PitchLab: control de SLA de frescura, "
            "verificación criptográfica sha256 y refresco selectivo de las 28 fuentes."
        )
    )
    parser.add_argument(
        "--window",
        choices=list(VALID_WINDOWS),
        default="T-24h",
        help="Ventana operativa pre-jornada o post-partido (default: T-24h).",
    )
    parser.add_argument(
        "--leagues",
        default="all",
        help="Lista de ligas separadas por coma (ej. liga-mx,epl,nfl,nba,nhl,mlb,ncaaf) o 'all'.",
    )
    parser.add_argument(
        "--categories",
        default="all",
        help="Lista de categorías separadas por coma (ej. odds_casinos,injuries_lineups) o 'all'.",
    )
    parser.add_argument(
        "--sources",
        default=None,
        help="Filtro opcional de source_id separados por coma.",
    )
    parser.add_argument(
        "--max-age-hours",
        type=float,
        default=None,
        help="Override opcional del SLA de frescura en horas (por defecto derivado de --window).",
    )
    parser.add_argument(
        "--force-refresh",
        action="store_true",
        help="Ejecuta los scrapers seleccionados aunque exista un snapshot fresco dentro del SLA.",
    )
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Audita todos los snapshots existentes en data/raw/ (sha256, anti-leakage y SLA) sin tráfico de red.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Muestra el plan exacto de ejecución por fuente sin ejecutar subprocesos.",
    )
    parser.add_argument(
        "--skip-build",
        action="store_true",
        help="Omite ejecutar normalize_datasets.py y build_feature_store.py al finalizar.",
    )
    parser.add_argument(
        "--timeout-sec",
        type=int,
        default=300,
        help="Timeout máximo en segundos por módulo scraper (default: 300).",
    )
    parser.add_argument(
        "--report-path",
        default="data/feature_store/refresh_run_report.json",
        help="Ruta del reporte JSON auditable (relativa a .worktrees/web-scraping).",
    )
    return parser


def run_orchestrator(args: argparse.Namespace) -> tuple[dict[str, Any], int]:
    now_utc = datetime.now(timezone.utc)
    started_iso = now_utc.strftime("%Y-%m-%dT%H:%M:%SZ")
    catalog = load_sources_catalog(CATALOG_PATH)
    sources: list[dict[str, Any]] = catalog.get("sources", [])

    # Verificar que los 28 `source_id` del catálogo estén mapeados
    catalog_ids = {s["id"] for s in sources}
    unmapped_ids = sorted(catalog_ids - set(SOURCE_SCRAPER_REGISTRY.keys()))
    if unmapped_ids:
        raise KeyError(
            f"Fuentes en sources_catalog.json sin mapeo en SOURCE_SCRAPER_REGISTRY: {unmapped_ids}"
        )

    sla_hours = (
        float(args.max_age_hours)
        if args.max_age_hours is not None
        else WINDOW_DEFAULT_SLA_HOURS[args.window]
    )

    league_filter = _parse_csv_filter(args.leagues)
    category_filter = _parse_csv_filter(args.categories)
    source_filter = _parse_csv_filter(args.sources)

    mode = (
        "verify_only"
        if args.verify_only
        else ("dry_run" if args.dry_run else "execute_refresh")
    )

    source_plans: list[dict[str, Any]] = []
    total_raw_files_audited = 0
    total_raw_files_sha256_ok = 0
    total_raw_files_anti_leakage_ok = 0
    total_markdown_artifacts = 0

    for src in sources:
        sid = src["id"]
        cat = src["category"]
        src_leagues = [lg.lower() for lg in src.get("leagues", [])]

        cat_ok = category_filter is None or cat.lower() in category_filter
        src_ok = source_filter is None or sid.lower() in source_filter
        lg_ok = league_filter is None or bool(set(src_leagues) & league_filter)
        in_scope = cat_ok and src_ok and lg_ok

        in_window = _source_matches_window(src, args.window) or (source_filter is not None and src_ok)
        binding = _resolve_scraper_binding(sid, league_filter)

        snap_info = _inspect_source_snapshots(
            category=cat,
            source_id=sid,
            now_utc=now_utc,
            audit_all_files=args.verify_only,
        )
        latest = snap_info["latest_snapshot"]
        total_markdown_artifacts += snap_info["markdown_artifacts_count"]

        if args.verify_only:
            for a in snap_info["all_snapshots_audit"]:
                total_raw_files_audited += 1
                if a.get("sha256_valid"):
                    total_raw_files_sha256_ok += 1
                if a.get("anti_leakage_valid"):
                    total_raw_files_anti_leakage_ok += 1
        elif latest is not None:
            total_raw_files_audited += 1
            if latest.get("sha256_valid"):
                total_raw_files_sha256_ok += 1
            if latest.get("anti_leakage_valid"):
                total_raw_files_anti_leakage_ok += 1

        age_hours = latest.get("age_hours") if latest else None
        integrity_ok = bool(
            latest
            and latest.get("sha256_valid")
            and latest.get("anti_leakage_valid")
            and snap_info["all_sha256_valid"]
            and snap_info["all_anti_leakage_valid"]
        )
        within_sla = bool(
            latest is not None
            and integrity_ok
            and age_hours is not None
            and age_hours <= sla_hours
        )

        if not in_scope:
            decision = "SKIP_FILTERED_OUT"
            reason = "Excluida por filtros --leagues / --categories / --sources"
        elif args.verify_only:
            if latest is None:
                decision = "AUDIT_MISSING_SNAPSHOT"
                reason = "Sin snapshots en data/raw/ para esta fuente"
            elif not integrity_ok:
                decision = "AUDIT_INTEGRITY_ERROR"
                reason = "Fallo en verificación sha256 o regla anti-leakage captured_at_utc <= now_utc"
            elif within_sla:
                decision = "AUDIT_FRESH_OK"
                reason = f"Snapshot íntegro dentro de SLA ({age_hours:.2f}h <= {sla_hours:.2f}h)"
            else:
                decision = "AUDIT_STALE_SNAPSHOT"
                reason = f"Snapshot íntegro pero fuera de SLA ({age_hours:.2f}h > {sla_hours:.2f}h)"
        elif not in_window:
            decision = "SKIP_OUT_OF_WINDOW"
            reason = f"capture_schedule={src.get('capture_schedule')} fuera de ventana {args.window}"
        elif args.force_refresh:
            decision = "RUN_SCRAPER"
            reason = "Forzado por --force-refresh"
        elif within_sla:
            decision = "SKIP_FRESH"
            reason = f"Snapshot fresco e íntegro ({age_hours:.2f}h <= SLA {sla_hours:.2f}h)"
        elif latest is None:
            decision = "RUN_SCRAPER"
            reason = "No existe snapshot previo en data/raw/"
        elif not integrity_ok:
            decision = "RUN_SCRAPER"
            reason = "Último snapshot con fallo de sha256 o timestamp futuro"
        else:
            decision = "RUN_SCRAPER"
            reason = f"Snapshot vencido ({age_hours:.2f}h > SLA {sla_hours:.2f}h)"

        cmd_preview = [sys.executable, binding["script_path"], *binding["args"]]

        source_plans.append(
            {
                "source_id": sid,
                "priority": src.get("priority"),
                "category": cat,
                "leagues": src.get("leagues", []),
                "capture_schedule": src.get("capture_schedule", []),
                "in_filter_scope": in_scope,
                "in_window": in_window,
                "assigned_scraper": binding["script"],
                "assigned_scraper_args": binding["args"],
                "assigned_scraper_exists": binding["script_exists"],
                "coverage_note": binding.get("coverage_note"),
                "command": cmd_preview,
                "snapshots_count": snap_info["snapshots_count"],
                "markdown_artifacts_count": snap_info["markdown_artifacts_count"],
                "latest_snapshot_path": latest.get("path") if latest else None,
                "latest_captured_at_utc": latest.get("captured_at_utc") if latest else None,
                "latest_sha256": (
                    (latest.get("stored_sha256") or "")[:16] if latest else None
                ),
                "sha256_valid": snap_info["all_sha256_valid"] if latest else None,
                "anti_leakage_valid": snap_info["all_anti_leakage_valid"] if latest else None,
                "age_hours": age_hours,
                "sla_max_age_hours": sla_hours,
                "within_sla": within_sla,
                "decision": decision,
                "reason": reason,
            }
        )

    # Inspeccionar también si existen carpetas extra en data/raw no listadas (por completitud de auditoría)
    execution_runs: list[dict[str, Any]] = []
    pipeline_build_runs: list[dict[str, Any]] = []
    exit_code = 0

    # Ejecución real de scrapers cuando corresponde
    if not args.dry_run and not args.verify_only:
        seen_commands: set[tuple[str, ...]] = set()
        for plan in source_plans:
            if plan["decision"] != "RUN_SCRAPER":
                continue
            cmd_tuple = tuple(plan["command"])
            if cmd_tuple in seen_commands:
                execution_runs.append(
                    {
                        "source_id": plan["source_id"],
                        "script": plan["assigned_scraper"],
                        "status": "DEDUPLICATED_SHARED_MODULE",
                        "returncode": 0,
                        "elapsed_sec": 0.0,
                    }
                )
                continue

            if not plan["assigned_scraper_exists"]:
                execution_runs.append(
                    {
                        "source_id": plan["source_id"],
                        "script": plan["assigned_scraper"],
                        "status": "MISSING_SCRAPER_SCRIPT",
                        "returncode": 2,
                        "elapsed_sec": 0.0,
                    }
                )
                exit_code = 2
                continue

            seen_commands.add(cmd_tuple)
            print(
                f"\n[RUN] {plan['source_id']} -> {plan['assigned_scraper']} {' '.join(plan['assigned_scraper_args'])}"
            )
            t0 = time.perf_counter()
            try:
                proc = subprocess.run(
                    list(cmd_tuple),
                    cwd=str(WORKTREE_ROOT),
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    timeout=args.timeout_sec,
                    check=False,
                )
                elapsed = round(time.perf_counter() - t0, 2)
                ok = proc.returncode == 0
                if not ok:
                    exit_code = 1
                execution_runs.append(
                    {
                        "source_id": plan["source_id"],
                        "script": plan["assigned_scraper"],
                        "args": plan["assigned_scraper_args"],
                        "status": "SUCCESS" if ok else "FAILED",
                        "returncode": proc.returncode,
                        "elapsed_sec": elapsed,
                        "stdout_tail": (proc.stdout or "")[-800:],
                        "stderr_tail": (proc.stderr or "")[-800:],
                    }
                )
                print(
                    f"      status={'SUCCESS' if ok else 'FAILED'} (rc={proc.returncode}, {elapsed:.2f}s)"
                )
            except subprocess.TimeoutExpired:
                elapsed = round(time.perf_counter() - t0, 2)
                exit_code = 1
                execution_runs.append(
                    {
                        "source_id": plan["source_id"],
                        "script": plan["assigned_scraper"],
                        "args": plan["assigned_scraper_args"],
                        "status": "TIMEOUT",
                        "returncode": -1,
                        "elapsed_sec": elapsed,
                    }
                )
                print(f"      status=TIMEOUT ({elapsed:.2f}s > {args.timeout_sec}s)")

        # Reconstrucción de datasets normalizados + Feature Store cuando no se pasa `--skip-build`
        if not args.skip_build and exit_code == 0:
            for build_script in ("normalize_datasets.py", "build_feature_store.py"):
                build_path = SCRIPT_DIR / build_script
                print(f"\n[BUILD] Ejecutando {build_script}...")
                t0 = time.perf_counter()
                proc = subprocess.run(
                    [sys.executable, str(build_path)],
                    cwd=str(WORKTREE_ROOT),
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    timeout=max(args.timeout_sec, 600),
                    check=False,
                )
                elapsed = round(time.perf_counter() - t0, 2)
                ok = proc.returncode == 0
                if not ok:
                    exit_code = 1
                pipeline_build_runs.append(
                    {
                        "step": build_script,
                        "status": "SUCCESS" if ok else "FAILED",
                        "returncode": proc.returncode,
                        "elapsed_sec": elapsed,
                        "stdout_tail": (proc.stdout or "")[-800:],
                        "stderr_tail": (proc.stderr or "")[-800:],
                    }
                )
                print(
                    f"        status={'SUCCESS' if ok else 'FAILED'} (rc={proc.returncode}, {elapsed:.2f}s)"
                )

    # En `--verify-only`, fallar con código != 0 únicamente si algún snapshot existente violó sha256 o anti-leakage
    if args.verify_only:
        integrity_failures = sum(
            1 for p in source_plans if p["decision"] == "AUDIT_INTEGRITY_ERROR"
        )
        if integrity_failures > 0:
            exit_code = 1

    decision_counts: dict[str, int] = {}
    for p in source_plans:
        d = p["decision"]
        decision_counts[d] = decision_counts.get(d, 0) + 1

    sources_with_snapshots = sum(1 for p in source_plans if p["snapshots_count"] > 0)
    sources_within_sla = sum(1 for p in source_plans if p["within_sla"])
    total_snapshots_across_catalog = sum(p["snapshots_count"] for p in source_plans)

    report = {
        "schema_version": "1.0.0",
        "generated_at_utc": utc_now_iso(),
        "started_at_utc": started_iso,
        "mode": mode,
        "parameters": {
            "window": args.window,
            "sla_max_age_hours": sla_hours,
            "leagues": args.leagues,
            "categories": args.categories,
            "sources": args.sources,
            "force_refresh": args.force_refresh,
            "verify_only": args.verify_only,
            "dry_run": args.dry_run,
            "skip_build": args.skip_build,
            "timeout_sec": args.timeout_sec,
        },
        "summary": {
            "catalog_sources_total": len(sources),
            "mapped_sources_total": len(SOURCE_SCRAPER_REGISTRY),
            "sources_in_filter_scope": sum(1 for p in source_plans if p["in_filter_scope"]),
            "sources_in_window": sum(
                1 for p in source_plans if p["in_filter_scope"] and p["in_window"]
            ),
            "sources_with_snapshots": sources_with_snapshots,
            "sources_missing_snapshots": len(sources) - sources_with_snapshots,
            "sources_within_sla": sources_within_sla,
            "total_json_snapshots_in_raw": total_snapshots_across_catalog,
            "total_markdown_artifacts_in_raw": total_markdown_artifacts,
            "json_snapshots_audited_count": total_raw_files_audited,
            "json_snapshots_sha256_valid_count": total_raw_files_sha256_ok,
            "json_snapshots_anti_leakage_valid_count": total_raw_files_anti_leakage_ok,
            "decisions_breakdown": decision_counts,
            "scraper_subprocesses_executed": len(execution_runs),
            "pipeline_build_steps_executed": len(pipeline_build_runs),
            "exit_code": exit_code,
        },
        "sources_plan": source_plans,
        "execution_runs": execution_runs,
        "pipeline_build_runs": pipeline_build_runs,
    }

    report_path = _resolve_report_path(args.report_path)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(
        json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    _print_console_summary(report, report_path)
    return report, exit_code


def _print_console_summary(report: dict[str, Any], report_path: Path) -> None:
    params = report["parameters"]
    summ = report["summary"]
    print(
        "\n=========================================================================================================="
    )
    print(
        f" PITCHLAB MATCHDAY REFRESH ORCHESTRATOR | mode={report['mode'].upper()} | "
        f"window={params['window']} | SLA={params['sla_max_age_hours']}h"
    )
    print(
        "=========================================================================================================="
    )
    header = (
        f"{'PRI':<3} | {'SOURCE_ID':<34} | {'CATEGORY':<20} | {'SNAPS':>5} | "
        f"{'AGE(h)':>7} | {'SHA256':<6} | {'DECISION':<22} | {'SCRAPER'}"
    )
    print(header)
    print("-" * len(header))
    for p in report["sources_plan"]:
        age_txt = f"{p['age_hours']:.2f}" if p["age_hours"] is not None else "   -   "
        sha_txt = (
            "OK"
            if p["sha256_valid"] is True
            else ("FAIL" if p["sha256_valid"] is False else "NONE")
        )
        args_str = " ".join(p["assigned_scraper_args"])
        scr_txt = f"{p['assigned_scraper']} {args_str}".strip()
        print(
            f"{str(p['priority'] or ''):<3} | {p['source_id']:<34} | {p['category']:<20} | "
            f"{p['snapshots_count']:>5} | {age_txt:>7} | {sha_txt:<6} | {p['decision']:<22} | {scr_txt}"
        )
    print("-" * len(header))
    print(
        f"Catálogo: {summ['catalog_sources_total']}/28 fuentes mapeadas | "
        f"Con snapshots: {summ['sources_with_snapshots']} | "
        f"Dentro de SLA ({params['sla_max_age_hours']}h): {summ['sources_within_sla']}"
    )
    print(
        f"Snapshots JSON en data/raw: {summ['total_json_snapshots_in_raw']} "
        f"(auditados={summ['json_snapshots_audited_count']}, "
        f"sha256_ok={summ['json_snapshots_sha256_valid_count']}, "
        f"anti_leakage_ok={summ['json_snapshots_anti_leakage_valid_count']}) | "
        f"MD={summ['total_markdown_artifacts_in_raw']}"
    )
    print(f"Decisiones: {json.dumps(summ['decisions_breakdown'], ensure_ascii=False)}")
    print(f"Reporte auditable guardado en: {report_path}")


def main() -> None:
    parser = _build_arg_parser()
    args = parser.parse_args()
    _, rc = run_orchestrator(args)
    sys.exit(rc)


if __name__ == "__main__":
    main()
