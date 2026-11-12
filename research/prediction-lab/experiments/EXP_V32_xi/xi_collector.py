#!/usr/bin/env python3
"""Validador contractual y colector legal `T-60m` de XI confirmado (`EXP_V32_xi` · Ola 3 `B7`).

Implementa el contrato `CONTRACT_XI_PUBLISHED.md`:
  1. Validación estricta del esquema JSONL append-only (`ConfirmedXIRecord`, 12 campos obligatorios,
     11 titulares únicos por equipo, cero solapamiento entre titulares y bajas clave, `raw_sha256` hex64).
  2. Guardia anti-fuga dura (`XILeakageError`):
     `ts_xi_published <= ts_captured <= ts_decision - 2.0 min < kickoff_utc`
     más llenado diferido en mercado `ts_fill >= ts_decision + 2.0 min` y `ts_fill <= kickoff_utc`.
  3. Registro legal auditado de fuentes (`XI_LEGAL_SOURCES_REGISTRY`) con estados
     `ok`, `api_only` y `blocked_pending_owner_decision`.
  4. Colector HTTP limpio (`urllib.request` estándar, User-Agent transparente, cero evasión anti-bot,
     aborto inmediato ante HTTP 403/429/503 o desafíos de mitigación) con modos `--dry-run` y `--once`.

Uso CLI:
  .\\research\\prediction-lab\\.venv\\Scripts\\python.exe research/prediction-lab/experiments/EXP_V32_xi/xi_collector.py --dry-run
  .\\research\\prediction-lab\\.venv\\Scripts\\python.exe research/prediction-lab/experiments/EXP_V32_xi/xi_collector.py --once
"""

from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import re
from typing import Any, Callable, Mapping, Sequence
import urllib.error
import urllib.parse
import urllib.request

EXP_DIR = Path(__file__).resolve().parent
PRED_LAB_ROOT = EXP_DIR.parents[1]
REPO_ROOT = EXP_DIR.parents[3]
DEFAULT_DATA_DIR = EXP_DIR / "data"
DEFAULT_SNAPSHOTS_JSONL = DEFAULT_DATA_DIR / "xi_snapshots.jsonl"
DEFAULT_HEALTH_JSON = DEFAULT_DATA_DIR / "xi_health.json"
DEFAULT_POLL_STATE_JSON = DEFAULT_DATA_DIR / "xi_poll_state.json"
FROZEN_STALE_LINES_CONFIG_PATH = REPO_ROOT / "src" / "data" / "prediction" / "stale_lines_config.json"
EXPECTED_STALE_LINES_SHA256 = "8bcb9c7be93270cde0cac2d58bc19f0381184dd2e769f358dd28334db2a05eac"

HOLDOUT_CUT_UTC = "2025-02-02T17:30:00Z"
MIN_INGESTION_BUFFER_MINUTES: float = 2.0
MIN_EXECUTION_DELAY_MINUTES: float = 2.0
CADENCE_SAFETY_FACTOR: float = 0.92
ACTIVE_WINDOW_START_MINUTES: float = 75.0
ACTIVE_WINDOW_END_MINUTES: float = 4.0
TRANSPARENT_USER_AGENT: str = "PitchLab-XI-Collector/1.0 (+legal-api-only)"

VALID_LEGAL_STATUSES: tuple[str, ...] = ("ok", "api_only", "blocked_pending_owner_decision")
REQUIRED_XI_RECORD_FIELDS: tuple[str, ...] = (
    "event_id",
    "league",
    "kickoff_utc",
    "ts_xi_published",
    "ts_captured",
    "lead_minutes_to_kickoff",
    "home_starting_xi",
    "away_starting_xi",
    "home_missing_key_starters",
    "away_missing_key_starters",
    "source",
    "raw_sha256",
)

_HEX64_RE = re.compile(r"^[0-9a-f]{64}$")
_NON_ALNUM_RE = re.compile(r"[^a-z0-9]+")


class XIContractError(ValueError):
    """Error de validación estructural o semántica sobre `ConfirmedXIRecord`."""


class XILeakageError(RuntimeError):
    """Excepción lanzada ante cualquier violación temporal o causal de `ts_xi_published`."""


class XISourceBlockedError(PermissionError):
    """Excepción lanzada al invocar una fuente `blocked_pending_owner_decision` o bloqueada por HTTP."""


@dataclass(frozen=True)
class XISourceAuditEntry:
    source_id: str
    provider_name: str
    endpoint_template: str
    legal_status: str
    required_env_vars: tuple[str, ...]
    supports_explicit_ts_published: bool
    http_audit_observed: str
    robots_and_tos_summary: str
    coverage_notes: str

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["required_env_vars"] = list(self.required_env_vars)
        return data


XI_LEGAL_SOURCES_REGISTRY: dict[str, XISourceAuditEntry] = {
    "api_football": XISourceAuditEntry(
        source_id="api_football",
        provider_name="API-Football (API-Sports REST v3)",
        endpoint_template="https://v3.football.api-sports.io/fixtures/lineups?fixture={fixture_id}",
        legal_status="api_only",
        required_env_vars=("API_FOOTBALL_KEY",),
        supports_explicit_ts_published=False,
        http_audit_observed="HTTP 200 JSON (missing-key message sin bloqueo de red cuando falta credencial)",
        robots_and_tos_summary="API comercial oficial para consumo automatizado con cabecera x-apisports-key.",
        coverage_notes="Cubre Liga MX (262), Top-5 europeas y UCL con startXI oficial (11v11).",
    ),
    "football_data_org": XISourceAuditEntry(
        source_id="football_data_org",
        provider_name="football-data.org REST API v4",
        endpoint_template="https://api.football-data.org/v4/matches/{match_id}",
        legal_status="api_only",
        required_env_vars=("FOOTBALL_DATA_API_KEY",),
        supports_explicit_ts_published=False,
        http_audit_observed="HTTP 200 en /v4/competitions; robots.txt permite User-agent: * (solo bloquea dotbot)",
        robots_and_tos_summary="API REST oficial documentada con X-Auth-Token; lineups según nivel de suscripción.",
        coverage_notes="Cubre Premier League, LaLiga, Bundesliga, Serie A, Ligue 1 y Champions League.",
    ),
    "espn_site_api": XISourceAuditEntry(
        source_id="espn_site_api",
        provider_name="ESPN Undocumented Site API",
        endpoint_template="https://site.api.espn.com/apis/site/v2/sports/soccer/{league}/summary?event={event_id}",
        legal_status="blocked_pending_owner_decision",
        required_env_vars=(),
        supports_explicit_ts_published=False,
        http_audit_observed="HTTP 403 Access Denied (AkamaiGHost) ante User-Agent transparente de bot",
        robots_and_tos_summary=(
            "Disney Terms of Use (§2.B.x) prohíben acceder o extraer datos mediante robot, spider, script "
            "u otros medios automatizados sin licencia escrita."
        ),
        coverage_notes="Bloqueada legal y técnicamente sin suplantación de User-Agent.",
    ),
    "sofascore": XISourceAuditEntry(
        source_id="sofascore",
        provider_name="SofaScore Web / Internal API",
        endpoint_template="https://api.sofascore.com/api/v1/event/{event_id}/lineups",
        legal_status="blocked_pending_owner_decision",
        required_env_vars=(),
        supports_explicit_ts_published=False,
        http_audit_observed='HTTP 403 {"error":{"code":403,"reason":"Forbidden"}} (Varnish) en cliente HTTP limpio',
        robots_and_tos_summary="Exige navegador instrumentado y vulnera restricciones de extracción automatizada.",
        coverage_notes="Bloqueada pendiente de licencia B2B oficial.",
    ),
    "fotmob": XISourceAuditEntry(
        source_id="fotmob",
        provider_name="FotMob Internal Match API",
        endpoint_template="https://www.fotmob.com/api/matchDetails?matchId={match_id}",
        legal_status="blocked_pending_owner_decision",
        required_env_vars=(),
        supports_explicit_ts_published=False,
        http_audit_observed="robots.txt HTTP 200 con User-agent: * Disallow: /api/* y firma anti-bot x-mas",
        robots_and_tos_summary="Prohibido explícitamente en robots.txt (/api/*) y protegido por reto anti-bot.",
        coverage_notes="Bloqueada pendiente de acuerdo escrito con FotMob.",
    ),
    "flashscore": XISourceAuditEntry(
        source_id="flashscore",
        provider_name="Flashscore Web Feeds",
        endpoint_template="https://www.flashscore.com/match/{match_id}/",
        legal_status="blocked_pending_owner_decision",
        required_env_vars=(),
        supports_explicit_ts_published=False,
        http_audit_observed="robots.txt HTTP 200 con Disallow: /live/, /scheduled/, /finished/, /draw/",
        robots_and_tos_summary="Prohibido en robots.txt y en los términos de uso de Livesport.",
        coverage_notes="Bloqueada pendiente de feed comercial Livesport.",
    ),
    "rotowire_web": XISourceAuditEntry(
        source_id="rotowire_web",
        provider_name="RotoWire Soccer Lineups HTML",
        endpoint_template="https://www.rotowire.com/soccer/lineups.php",
        legal_status="blocked_pending_owner_decision",
        required_env_vars=(),
        supports_explicit_ts_published=False,
        http_audit_observed="termsandconditions.php HTTP 200 Artículo VI (Automated Access; No Scraping)",
        robots_and_tos_summary=(
            "Artículo VI de ToS prohíbe web scraping, bots, crawlers y consumo sin licencia comercial (/partner/); "
            "además el HTML no expone ts_xi_published exacto al segundo."
        ),
        coverage_notes="Bloqueada en scraping web; elegible solo bajo contrato comercial RotoWire Partner API.",
    ),
}


def sha256_bytes_hex(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def file_sha256(path: str | Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def slugify_team(name: str) -> str:
    s = _NON_ALNUM_RE.sub("_", str(name or "").strip().lower()).strip("_")
    if not s:
        raise XIContractError(f"Nombre de equipo vacío o no normalizable: {name!r}")
    return s


def build_canonical_football_event_id(
    league: str,
    kickoff_utc: str | datetime,
    home_team: str,
    away_team: str,
) -> str:
    dt_ko = parse_strict_utc_iso(kickoff_utc, "kickoff_utc")
    lg = str(league or "").strip().upper()
    if not lg:
        raise XIContractError("`league` vacío al construir event_id canónico.")
    ymd = dt_ko.strftime("%Y%m%d")
    return f"ws:football:{lg}:{ymd}:{slugify_team(home_team)}:{slugify_team(away_team)}"


def parse_strict_utc_iso(value: Any, field_name: str) -> datetime:
    """Parsea un timestamp ISO-8601 exigiendo zona horaria explícita y normalizándolo a UTC."""
    if isinstance(value, datetime):
        if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
            raise XIContractError(f"`{field_name}` debe incluir zona horaria explícita UTC; recibido naive {value!r}")
        return value.astimezone(timezone.utc)
    if not isinstance(value, str) or not value.strip():
        raise XIContractError(f"`{field_name}` debe ser string ISO-8601 UTC no vacío; recibido {value!r}")
    raw = value.strip()
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError as exc:
        raise XIContractError(f"`{field_name}` no es ISO-8601 válido ({value!r}): {exc}") from exc
    if dt.tzinfo is None or dt.tzinfo.utcoffset(dt) is None:
        raise XIContractError(f"`{field_name}` carece de sufijo explícito de zona UTC (`Z` o `+00:00`): {value!r}")
    return dt.astimezone(timezone.utc)


def format_utc_iso(dt: datetime) -> str:
    utc_dt = parse_strict_utc_iso(dt, "dt")
    if utc_dt.microsecond:
        return utc_dt.isoformat().replace("+00:00", "Z")
    return utc_dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def assert_source_legally_allowed(
    source_id: str,
    *,
    env: Mapping[str, str] | None = None,
    require_credentials: bool = False,
) -> XISourceAuditEntry:
    """Verifica que `source_id` exista en el registro legal y no esté bloqueada por ToS/robots/anti-bot."""
    key = str(source_id or "").strip().lower()
    entry = XI_LEGAL_SOURCES_REGISTRY.get(key)
    if entry is None:
        raise XISourceBlockedError(
            f"Fuente de XI no registrada en auditoría legal: {source_id!r}. "
            f"Fuentes conocidas: {sorted(XI_LEGAL_SOURCES_REGISTRY)}"
        )
    if entry.legal_status not in VALID_LEGAL_STATUSES:
        raise XIContractError(f"Estado legal inválido en registro para {key}: {entry.legal_status!r}")
    if entry.legal_status == "blocked_pending_owner_decision":
        raise XISourceBlockedError(
            f"Fuente {key!r} bloqueada legalmente (`blocked_pending_owner_decision`): "
            f"{entry.robots_and_tos_summary}"
        )
    if require_credentials and entry.legal_status == "api_only":
        eff_env = os.environ if env is None else env
        missing = [v for v in entry.required_env_vars if not str(eff_env.get(v, "")).strip()]
        if missing:
            raise XISourceBlockedError(
                f"Fuente `api_only` {key!r} inactiva por credenciales faltantes: {missing}"
            )
    return entry


def get_active_legal_sources(env: Mapping[str, str] | None = None) -> list[XISourceAuditEntry]:
    eff_env = os.environ if env is None else env
    active: list[XISourceAuditEntry] = []
    for entry in XI_LEGAL_SOURCES_REGISTRY.values():
        if entry.legal_status == "ok":
            active.append(entry)
        elif entry.legal_status == "api_only":
            if all(str(eff_env.get(v, "")).strip() for v in entry.required_env_vars):
                active.append(entry)
    return active


def _canonical_player_identity(item: Any, field_name: str, idx: int) -> tuple[str, dict[str, Any] | str]:
    if isinstance(item, str):
        cleaned = item.strip()
        if not cleaned:
            raise XIContractError(f"{field_name}[{idx}] es un string vacío.")
        return (cleaned.lower(), cleaned)
    if isinstance(item, Mapping):
        pid = str(item.get("player_id") or "").strip()
        pname = str(item.get("player_name") or item.get("name") or "").strip()
        if not pid and not pname:
            raise XIContractError(
                f"{field_name}[{idx}] debe contener al menos `player_id` o `player_name` no vacío."
            )
        norm_obj: dict[str, Any] = {}
        if pid:
            norm_obj["player_id"] = pid
        if pname:
            norm_obj["player_name"] = pname
        if item.get("position") is not None:
            norm_obj["position"] = str(item["position"]).strip()
        if item.get("shirt_number") is not None:
            num = int(item["shirt_number"])
            if num < 0 or num > 99:
                raise XIContractError(f"{field_name}[{idx}].shirt_number fuera de rango [0, 99]: {num}")
            norm_obj["shirt_number"] = num
        if item.get("reason") is not None:
            norm_obj["reason"] = str(item["reason"]).strip()
        if item.get("market_value_share") is not None:
            mvs = float(item["market_value_share"])
            if not math.isfinite(mvs) or mvs < 0.0 or mvs > 1.0:
                raise XIContractError(
                    f"{field_name}[{idx}].market_value_share debe estar en [0, 1]; recibido {mvs}"
                )
            norm_obj["market_value_share"] = round(mvs, 8)
        dedup_key = f"id:{pid.lower()}" if pid else f"name:{pname.lower()}"
        return (dedup_key, norm_obj)
    raise XIContractError(f"{field_name}[{idx}] debe ser objeto o string; recibido {type(item).__name__}")


def _validate_player_list(
    raw_list: Any,
    field_name: str,
    *,
    exact_len: int | None = None,
) -> tuple[list[dict[str, Any] | str], set[str]]:
    if not isinstance(raw_list, list):
        raise XIContractError(f"`{field_name}` debe ser una lista JSON; recibido {type(raw_list).__name__}")
    if exact_len is not None and len(raw_list) != exact_len:
        raise XIContractError(f"`{field_name}` debe tener exactamente {exact_len} jugadores; recibido {len(raw_list)}")
    normalized: list[dict[str, Any] | str] = []
    seen: set[str] = set()
    for idx, item in enumerate(raw_list):
        key, norm_item = _canonical_player_identity(item, field_name, idx)
        if key in seen:
            raise XIContractError(f"Jugador duplicado en `{field_name}` (índice {idx}, clave={key!r}).")
        seen.add(key)
        normalized.append(norm_item)
    return normalized, seen


def validate_xi_record(
    record: Mapping[str, Any],
    *,
    forbid_holdout_after_utc: str | None = None,
) -> dict[str, Any]:
    """Valida el esquema completo y las invariantes intrínsecas de un registro `ConfirmedXIRecord`."""
    if not isinstance(record, Mapping):
        raise XIContractError(f"El registro XI debe ser un objeto JSON; recibido {type(record).__name__}")

    missing_fields = [f for f in REQUIRED_XI_RECORD_FIELDS if f not in record]
    if missing_fields:
        raise XIContractError(f"Faltan campos obligatorios en ConfirmedXIRecord: {missing_fields}")

    event_id = str(record["event_id"] or "").strip()
    if not event_id:
        raise XIContractError("`event_id` no puede ser vacío.")
    league = str(record["league"] or "").strip()
    if not league:
        raise XIContractError("`league` no puede ser vacío.")

    source_entry = assert_source_legally_allowed(str(record["source"]), require_credentials=False)

    kickoff_dt = parse_strict_utc_iso(record["kickoff_utc"], "kickoff_utc")
    published_dt = parse_strict_utc_iso(record["ts_xi_published"], "ts_xi_published")
    captured_dt = parse_strict_utc_iso(record["ts_captured"], "ts_captured")

    if forbid_holdout_after_utc is not None:
        cut_dt = parse_strict_utc_iso(forbid_holdout_after_utc, "forbid_holdout_after_utc")
        if kickoff_dt >= cut_dt:
            raise XILeakageError(
                f"Contaminación de holdout sellado en event_id={event_id}: "
                f"kickoff_utc ({format_utc_iso(kickoff_dt)}) >= {format_utc_iso(cut_dt)}."
            )

    if published_dt > captured_dt:
        raise XILeakageError(
            f"Violación causal en event_id={event_id}: ts_xi_published ({format_utc_iso(published_dt)}) > "
            f"ts_captured ({format_utc_iso(captured_dt)})."
        )
    if captured_dt >= kickoff_dt:
        raise XILeakageError(
            f"Captura post-kickoff prohibida en event_id={event_id}: "
            f"ts_captured ({format_utc_iso(captured_dt)}) >= kickoff_utc ({format_utc_iso(kickoff_dt)})."
        )

    raw_lead = record["lead_minutes_to_kickoff"]
    if isinstance(raw_lead, bool) or not isinstance(raw_lead, (int, float)) or not math.isfinite(float(raw_lead)):
        raise XIContractError(f"`lead_minutes_to_kickoff` debe ser número finito; recibido {raw_lead!r}")
    expected_lead = (kickoff_dt - captured_dt).total_seconds() / 60.0
    if abs(float(raw_lead) - expected_lead) > 1e-3:
        raise XIContractError(
            f"`lead_minutes_to_kickoff` inconsistente ({raw_lead}) frente a "
            f"(kickoff_utc - ts_captured) = {expected_lead:.6f} min."
        )
    if expected_lead <= 0.0:
        raise XILeakageError(f"`lead_minutes_to_kickoff` debe ser > 0; recibido {expected_lead:.6f}")

    home_xi, home_xi_keys = _validate_player_list(record["home_starting_xi"], "home_starting_xi", exact_len=11)
    away_xi, away_xi_keys = _validate_player_list(record["away_starting_xi"], "away_starting_xi", exact_len=11)
    home_miss, home_miss_keys = _validate_player_list(
        record["home_missing_key_starters"], "home_missing_key_starters", exact_len=None
    )
    away_miss, away_miss_keys = _validate_player_list(
        record["away_missing_key_starters"], "away_missing_key_starters", exact_len=None
    )

    overlap_home = home_xi_keys & home_miss_keys
    if overlap_home:
        raise XIContractError(
            f"Contradicción en equipo local: jugador(es) simultáneamente titular y ausente: {sorted(overlap_home)}"
        )
    overlap_away = away_xi_keys & away_miss_keys
    if overlap_away:
        raise XIContractError(
            f"Contradicción en equipo visitante: jugador(es) simultáneamente titular y ausente: {sorted(overlap_away)}"
        )

    raw_sha = str(record["raw_sha256"] or "").strip().lower()
    if not _HEX64_RE.match(raw_sha):
        raise XIContractError(f"`raw_sha256` debe ser SHA-256 hex64 en minúsculas; recibido {record['raw_sha256']!r}")

    canonical: dict[str, Any] = {
        "event_id": event_id,
        "league": league,
        "kickoff_utc": format_utc_iso(kickoff_dt),
        "ts_xi_published": format_utc_iso(published_dt),
        "ts_captured": format_utc_iso(captured_dt),
        "lead_minutes_to_kickoff": round(expected_lead, 6),
        "home_starting_xi": home_xi,
        "away_starting_xi": away_xi,
        "home_missing_key_starters": home_miss,
        "away_missing_key_starters": away_miss,
        "source": source_entry.source_id,
        "raw_sha256": raw_sha,
    }
    if "ts_xi_published_precision" in record and record["ts_xi_published_precision"] is not None:
        prec = str(record["ts_xi_published_precision"]).strip()
        if prec not in ("upstream_explicit", "transition_poll_upper_bound"):
            raise XIContractError(f"`ts_xi_published_precision` inválido: {prec!r}")
        canonical["ts_xi_published_precision"] = prec
    for opt_ctx in ("home_availability_ctx", "away_availability_ctx"):
        if opt_ctx in record and record[opt_ctx] is not None:
            if not isinstance(record[opt_ctx], Mapping):
                raise XIContractError(f"`{opt_ctx}` debe ser un objeto Mapping.")
            canonical[opt_ctx] = dict(record[opt_ctx])
    return canonical


def validate_xi_anti_leakage(
    record: Mapping[str, Any],
    ts_decision: str | datetime,
    *,
    min_ingestion_buffer_minutes: float = MIN_INGESTION_BUFFER_MINUTES,
    forbid_holdout_after_utc: str | None = None,
) -> dict[str, Any]:
    """Aplica la guardia anti-fuga estricta del contrato (§3.1):
    `ts_xi_published <= ts_captured <= ts_decision - 2.0 min < kickoff_utc` y `ts_decision < kickoff_utc`.
    """
    buf = float(min_ingestion_buffer_minutes)
    if not math.isfinite(buf) or buf < MIN_INGESTION_BUFFER_MINUTES - 1e-12:
        raise XILeakageError(
            f"Prohibido reducir `min_ingestion_buffer_minutes` por debajo de {MIN_INGESTION_BUFFER_MINUTES} min; "
            f"recibido {min_ingestion_buffer_minutes!r}."
        )

    validated = validate_xi_record(record, forbid_holdout_after_utc=forbid_holdout_after_utc)
    decision_dt = parse_strict_utc_iso(ts_decision, "ts_decision")
    kickoff_dt = parse_strict_utc_iso(validated["kickoff_utc"], "kickoff_utc")
    published_dt = parse_strict_utc_iso(validated["ts_xi_published"], "ts_xi_published")
    captured_dt = parse_strict_utc_iso(validated["ts_captured"], "ts_captured")

    if decision_dt >= kickoff_dt:
        raise XILeakageError(
            f"Decisión en o post-kickoff en event_id={validated['event_id']}: "
            f"ts_decision ({format_utc_iso(decision_dt)}) >= kickoff_utc ({format_utc_iso(kickoff_dt)})."
        )

    latest_allowed_capture = decision_dt - timedelta(minutes=buf)
    if captured_dt > latest_allowed_capture:
        raise XILeakageError(
            f"Violación de guardia anti-fuga (buffer {buf:.2f}m) en event_id={validated['event_id']}: "
            f"ts_captured ({format_utc_iso(captured_dt)}) > ts_decision - {buf:.2f}m "
            f"({format_utc_iso(latest_allowed_capture)})."
        )
    if published_dt > captured_dt:
        raise XILeakageError(
            f"Violación ts_xi_published > ts_captured en event_id={validated['event_id']}."
        )
    return validated


def resolve_xi_delayed_execution_tick(
    record: Mapping[str, Any],
    ts_decision: str | datetime,
    market_ticks: Sequence[Mapping[str, Any]],
    *,
    selection: str,
    book: str,
    market: str = "1x2",
    execution_delay_minutes: float = MIN_EXECUTION_DELAY_MINUTES,
    min_ingestion_buffer_minutes: float = MIN_INGESTION_BUFFER_MINUTES,
) -> dict[str, Any]:
    """Verifica `validate_xi_anti_leakage` y resuelve el fill diferido `>= ts_decision + 2.0 min <= kickoff_utc`."""
    delay = float(execution_delay_minutes)
    if not math.isfinite(delay) or delay < MIN_EXECUTION_DELAY_MINUTES - 1e-12:
        raise XILeakageError(
            f"Prohibido ejecutar con `execution_delay_minutes` < {MIN_EXECUTION_DELAY_MINUTES} min; recibido {delay}."
        )

    validated = validate_xi_anti_leakage(
        record,
        ts_decision,
        min_ingestion_buffer_minutes=min_ingestion_buffer_minutes,
    )
    decision_dt = parse_strict_utc_iso(ts_decision, "ts_decision")
    kickoff_dt = parse_strict_utc_iso(validated["kickoff_utc"], "kickoff_utc")
    min_fill_dt = decision_dt + timedelta(minutes=delay)

    if min_fill_dt > kickoff_dt:
        return {
            "filled": False,
            "exec_status": "unfilled_delay_exceeds_kickoff",
            "price_tomado": None,
            "ts_executed": None,
            "min_fill_utc": format_utc_iso(min_fill_dt),
        }

    want_sel = str(selection).strip().lower()
    want_book = str(book).strip().lower()
    want_mkt = str(market).strip().lower()

    eligible: list[tuple[datetime, float, Mapping[str, Any]]] = []
    for q in market_ticks:
        if str(q.get("market", "")).strip().lower() != want_mkt:
            continue
        if str(q.get("selection", "")).strip().lower() != want_sel:
            continue
        if str(q.get("book", "")).strip().lower() != want_book:
            continue
        q_dt = parse_strict_utc_iso(q.get("ts_captured"), "market_tick.ts_captured")
        price = float(q.get("price_decimal", 0.0))
        if not (1.01 <= price <= 1000.0):
            continue
        # Ignora estrictamente cualquier tick previo a ts_decision + 2.0 min o posterior a kickoff_utc
        if min_fill_dt <= q_dt <= kickoff_dt:
            eligible.append((q_dt, price, q))

    if not eligible:
        return {
            "filled": False,
            "exec_status": "unfilled_no_post_delay_tick",
            "price_tomado": None,
            "ts_executed": None,
            "min_fill_utc": format_utc_iso(min_fill_dt),
        }

    eligible.sort(key=lambda item: item[0])
    fill_dt, fill_price, _ = eligible[0]
    return {
        "filled": True,
        "exec_status": "filled_ws_delayed_tick",
        "price_tomado": float(fill_price),
        "ts_executed": format_utc_iso(fill_dt),
        "min_fill_utc": format_utc_iso(min_fill_dt),
    }


def xi_record_to_team_availability_context(
    record: Mapping[str, Any],
    side: str,
    *,
    value_ratio_vs_league_median: float = 1.0,
) -> dict[str, Any]:
    """Proyecta las bajas clave confirmadas de `ConfirmedXIRecord` a `TeamAvailabilityContext` sin fuga."""
    validated = validate_xi_record(record)
    if side not in ("home", "away"):
        raise ValueError(f"`side` debe ser 'home' o 'away'; recibido {side!r}")

    explicit_key = f"{side}_availability_ctx"
    if explicit_key in validated:
        return dict(validated[explicit_key])

    missing_list = validated[f"{side}_missing_key_starters"]
    total_missing_share = 0.0
    suspended_count = 0
    injured_count = 0
    for item in missing_list:
        if isinstance(item, Mapping):
            total_missing_share += float(item.get("market_value_share", 0.0) or 0.0)
            reason = str(item.get("reason", "")).strip().lower()
            if "susp" in reason or "red_card" in reason or "sanc" in reason:
                suspended_count += 1
            else:
                injured_count += 1
        else:
            injured_count += 1

    return {
        "missing_market_value_ratio": min(0.60, max(0.0, total_missing_share)),
        "value_ratio_vs_league_median": float(value_ratio_vs_league_median)
        if value_ratio_vs_league_median > 0
        else 1.0,
        "injured_players_count": injured_count,
        "rotowire_injured_out_count": None,
        "suspended_players_count": suspended_count,
    }


def load_xi_records_jsonl(
    path: str | Path,
    *,
    forbid_holdout_after_utc: str | None = None,
) -> list[dict[str, Any]]:
    p = Path(path)
    if not p.exists():
        return []
    records: list[dict[str, Any]] = []
    seen_keys: set[tuple[str, str, str]] = set()
    for line_no, raw_line in enumerate(p.read_text(encoding="utf-8").splitlines(), start=1):
        s = raw_line.strip()
        if not s:
            continue
        try:
            parsed = json.loads(s)
        except json.JSONDecodeError as exc:
            raise XIContractError(f"JSON inválido en {p}:{line_no}: {exc}") from exc
        validated = validate_xi_record(parsed, forbid_holdout_after_utc=forbid_holdout_after_utc)
        dedup_key = (validated["event_id"], validated["source"], validated["raw_sha256"])
        if dedup_key in seen_keys:
            raise XIContractError(f"Clave duplicada detectada en archivo append-only {p}:{line_no}: {dedup_key}")
        seen_keys.add(dedup_key)
        records.append(validated)
    return records


def append_xi_record_jsonl(path: str | Path, record: Mapping[str, Any]) -> tuple[dict[str, Any], bool]:
    """Valida e inserta `record` en modo append-only idempotente por `(event_id, source, raw_sha256)`.
    Devuelve `(validated_record, was_appended)`.
    """
    validated = validate_xi_record(record)
    p = Path(path)
    existing = load_xi_records_jsonl(p)
    target_key = (validated["event_id"], validated["source"], validated["raw_sha256"])
    for item in existing:
        if (item["event_id"], item["source"], item["raw_sha256"]) == target_key:
            return (validated, False)
    p.parent.mkdir(parents=True, exist_ok=True)
    line = json.dumps(validated, ensure_ascii=False, separators=(",", ":")) + "\n"
    with p.open("a", encoding="utf-8") as fh:
        fh.write(line)
    return (validated, True)


def load_t60m_cadence_spec(stale_config_path: str | Path = FROZEN_STALE_LINES_CONFIG_PATH) -> dict[str, Any]:
    """Lee `stale_lines_config.json` en estricto modo solo lectura y extrae la cadencia `T-60m`."""
    p = Path(stale_config_path)
    actual_sha = file_sha256(p)
    payload = json.loads(p.read_text(encoding="utf-8"))
    regimes = (payload.get("recommended_scraping_cadence") or {}).get("regimes") or []
    t60 = next((r for r in regimes if r.get("regime_id") == "closing_decision_window_t_minus_60m"), None)
    if t60 is None:
        raise XIContractError(
            f"No se encontró `closing_decision_window_t_minus_60m` en {p}."
        )
    rec_min = float(t60["recommended_interval_minutes"])
    rec_sec = float(t60["recommended_interval_seconds"])
    return {
        "stale_lines_config_path": str(p),
        "stale_lines_config_sha256": actual_sha,
        "sha256_matches_frozen_v3_1": actual_sha == EXPECTED_STALE_LINES_SHA256,
        "regime_id": str(t60["regime_id"]),
        "horizon_minutes": float(t60["horizon_minutes"]),
        "recommended_interval_minutes": rec_min,
        "recommended_interval_seconds": rec_sec,
        "scheduled_interval_seconds": round(rec_sec * CADENCE_SAFETY_FACTOR, 4),
        "scheduled_interval_minutes": round(rec_min * CADENCE_SAFETY_FACTOR, 6),
        "active_poll_window_minutes_before_kickoff": [ACTIVE_WINDOW_END_MINUTES, ACTIVE_WINDOW_START_MINUTES],
    }


def clean_legal_http_get(
    url: str,
    *,
    headers: Mapping[str, str] | None = None,
    timeout_seconds: float = 12.0,
) -> tuple[int, dict[str, str], bytes]:
    """Ejecuta un `GET` HTTP estándar limpio sin cookies ni evasión; aborta de inmediato ante bloqueo."""
    parsed_url = urllib.parse.urlparse(url)
    if parsed_url.scheme not in ("https", "http"):
        raise XIContractError(f"Esquema URL no permitido: {url!r}")

    req_headers: dict[str, str] = {
        "User-Agent": TRANSPARENT_USER_AGENT,
        "Accept": "application/json",
    }
    if headers:
        req_headers.update({str(k): str(v) for k, v in headers.items()})

    req = urllib.request.Request(url, headers=req_headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
            status = int(resp.status)
            resp_headers = {k.lower(): v for k, v in resp.headers.items()}
            body = resp.read()
    except urllib.error.HTTPError as exc:
        resp_headers = {k.lower(): v for k, v in exc.headers.items()} if exc.headers else {}
        cf_mit = resp_headers.get("cf-mitigated", "")
        if exc.code in (401, 403, 429, 503) or "challenge" in cf_mit.lower():
            raise XISourceBlockedError(
                f"Abortado limpio sin reintento evasivo: HTTP {exc.code} en {url} "
                f"(cf-mitigated={cf_mit!r})."
            ) from exc
        raise

    cf_mit = resp_headers.get("cf-mitigated", "")
    if status in (401, 403, 429, 503) or "challenge" in cf_mit.lower():
        raise XISourceBlockedError(
            f"Abortado limpio por cabecera de mitigación o estado {status} en {url} (cf-mitigated={cf_mit!r})."
        )
    return (status, resp_headers, body)


def parse_api_football_lineups_payload(
    raw_bytes: bytes,
    *,
    fixture_meta: Mapping[str, Any],
    ts_captured: datetime,
    prior_empty_poll_ts: datetime | None,
    max_poll_gap_minutes: float = 4.0,
) -> dict[str, Any] | None:
    """Convierte la respuesta cruda de API-Football `/fixtures/lineups` en `ConfirmedXIRecord` si hay 11v11.
    Si aún no se publicaron alineaciones (`response == []`), devuelve `None`.
    Si no existe `updated_at` explícito ni evidencia de sondeo previo vacío cercano (`<= max_poll_gap_minutes`),
    rechaza fabricar `ts_xi_published` lanzando `XILeakageError`.
    """
    payload = json.loads(raw_bytes.decode("utf-8"))
    if payload.get("errors"):
        raise XISourceBlockedError(f"API-Football reportó errores de API/autorización: {payload['errors']}")
    resp_list = payload.get("response") or []
    if len(resp_list) < 2:
        return None

    def _extract_xi(team_block: Mapping[str, Any]) -> list[dict[str, Any]]:
        starters = team_block.get("startXI") or []
        out: list[dict[str, Any]] = []
        for entry in starters:
            p = entry.get("player") if isinstance(entry, Mapping) else None
            if not isinstance(p, Mapping):
                continue
            item: dict[str, Any] = {}
            if p.get("id") is not None:
                item["player_id"] = str(p["id"])
            if p.get("name"):
                item["player_name"] = str(p["name"]).strip()
            if p.get("pos"):
                item["position"] = str(p["pos"]).strip()
            if p.get("number") is not None:
                item["shirt_number"] = int(p["number"])
            out.append(item)
        return out

    home_xi = _extract_xi(resp_list[0])
    away_xi = _extract_xi(resp_list[1])
    if len(home_xi) != 11 or len(away_xi) != 11:
        return None

    captured_dt = parse_strict_utc_iso(ts_captured, "ts_captured")
    kickoff_dt = parse_strict_utc_iso(fixture_meta["kickoff_utc"], "fixture_meta.kickoff_utc")

    explicit_pub = payload.get("published_at") or fixture_meta.get("ts_xi_published")
    if explicit_pub is not None:
        published_dt = parse_strict_utc_iso(explicit_pub, "ts_xi_published")
        precision = "upstream_explicit"
    elif prior_empty_poll_ts is not None:
        prev_dt = parse_strict_utc_iso(prior_empty_poll_ts, "prior_empty_poll_ts")
        gap_min = (captured_dt - prev_dt).total_seconds() / 60.0
        if prev_dt > captured_dt or gap_min > float(max_poll_gap_minutes):
            raise XILeakageError(
                f"Transición de sondeo fuera de cota ({gap_min:.2f}m > {max_poll_gap_minutes:.2f}m); "
                "se rechaza inventar ts_xi_published."
            )
        published_dt = captured_dt
        precision = "transition_poll_upper_bound"
    else:
        raise XILeakageError(
            "API-Football devolvió startXI en lectura en frío sin `published_at` explícito ni sondeo vacío previo; "
            "prohibido inventar `ts_xi_published`."
        )

    lead_min = (kickoff_dt - captured_dt).total_seconds() / 60.0
    event_id = str(
        fixture_meta.get("event_id")
        or build_canonical_football_event_id(
            str(fixture_meta["league"]),
            kickoff_dt,
            str(fixture_meta["home_team"]),
            str(fixture_meta["away_team"]),
        )
    )
    record = {
        "event_id": event_id,
        "league": str(fixture_meta["league"]),
        "kickoff_utc": format_utc_iso(kickoff_dt),
        "ts_xi_published": format_utc_iso(published_dt),
        "ts_captured": format_utc_iso(captured_dt),
        "lead_minutes_to_kickoff": round(lead_min, 6),
        "home_starting_xi": home_xi,
        "away_starting_xi": away_xi,
        "home_missing_key_starters": list(fixture_meta.get("home_missing_key_starters") or []),
        "away_missing_key_starters": list(fixture_meta.get("away_missing_key_starters") or []),
        "source": "api_football",
        "raw_sha256": sha256_bytes_hex(raw_bytes),
        "ts_xi_published_precision": precision,
    }
    return validate_xi_record(record)


def filter_fixtures_in_t60m_window(
    fixtures: Sequence[Mapping[str, Any]],
    now_utc: datetime,
    *,
    window_start_minutes: float = ACTIVE_WINDOW_START_MINUTES,
    window_end_minutes: float = ACTIVE_WINDOW_END_MINUTES,
) -> list[dict[str, Any]]:
    now_dt = parse_strict_utc_iso(now_utc, "now_utc")
    eligible: list[dict[str, Any]] = []
    for fx in fixtures:
        ko_dt = parse_strict_utc_iso(fx["kickoff_utc"], "fixture.kickoff_utc")
        lead_min = (ko_dt - now_dt).total_seconds() / 60.0
        if window_end_minutes <= lead_min <= window_start_minutes:
            item = dict(fx)
            item["lead_minutes_at_poll"] = round(lead_min, 4)
            eligible.append(item)
    return eligible


def run_collector(
    *,
    dry_run: bool = True,
    once: bool = False,
    requested_sources: Sequence[str] | None = None,
    fixtures: Sequence[Mapping[str, Any]] | None = None,
    output_dir: str | Path = DEFAULT_DATA_DIR,
    stale_config_path: str | Path = FROZEN_STALE_LINES_CONFIG_PATH,
    env: Mapping[str, str] | None = None,
    now_utc: str | datetime | None = None,
    http_get_fn: Callable[..., tuple[int, dict[str, str], bytes]] = clean_legal_http_get,
) -> dict[str, Any]:
    """Ejecuta el colector legal de XI confirmado en modo `--dry-run` (sin tocar disco/red) o `--once`."""
    if not dry_run and not once:
        raise ValueError("Debe especificarse `dry_run=True` o `once=True`.")

    eff_env = os.environ if env is None else env
    now_dt = (
        parse_strict_utc_iso(now_utc, "now_utc")
        if now_utc is not None
        else datetime.now(timezone.utc).replace(microsecond=0)
    )
    cadence_spec = load_t60m_cadence_spec(stale_config_path)

    # Si el llamador solicita fuentes explícitas, validar legalidad de cada una de inmediato
    if requested_sources:
        checked_entries = [
            assert_source_legally_allowed(src, env=eff_env, require_credentials=not dry_run)
            for src in requested_sources
        ]
        active_sources = [
            e
            for e in checked_entries
            if e.legal_status == "ok"
            or all(str(eff_env.get(v, "")).strip() for v in e.required_env_vars)
        ]
    else:
        active_sources = get_active_legal_sources(eff_env)

    all_fixtures = list(fixtures or [])
    window_fixtures = filter_fixtures_in_t60m_window(all_fixtures, now_dt)

    out_dir = Path(output_dir)
    snapshots_path = out_dir / "xi_snapshots.jsonl"
    health_path = out_dir / "xi_health.json"
    poll_state_path = out_dir / "xi_poll_state.json"

    legal_summary = {
        src_id: {
            **entry.to_dict(),
            "credentials_present": (
                True
                if entry.legal_status == "ok"
                else (
                    bool(entry.required_env_vars)
                    and all(bool(str(eff_env.get(v, "")).strip()) for v in entry.required_env_vars)
                )
            ),
        }
        for src_id, entry in XI_LEGAL_SOURCES_REGISTRY.items()
    }

    if dry_run:
        return {
            "mode": "dry_run",
            "executed_at_utc": format_utc_iso(now_dt),
            "status": "dry_run_ready" if active_sources else "dry_run_no_active_legal_credentials",
            "cadence_t60m": cadence_spec,
            "anti_leakage_contract": {
                "inequality": "ts_xi_published <= ts_captured <= ts_decision - 2.0 min < kickoff_utc",
                "min_ingestion_buffer_minutes": MIN_INGESTION_BUFFER_MINUTES,
                "min_execution_delay_minutes": MIN_EXECUTION_DELAY_MINUTES,
            },
            "active_legal_sources": [e.source_id for e in active_sources],
            "blocked_sources": [
                k for k, v in XI_LEGAL_SOURCES_REGISTRY.items() if v.legal_status == "blocked_pending_owner_decision"
            ],
            "fixtures_total_considered": len(all_fixtures),
            "fixtures_in_t60m_window": len(window_fixtures),
            "records_written": 0,
            "fabricated_records": 0,
            "disk_mutated": False,
            "legal_sources_audit": legal_summary,
        }

    # Modo `--once`
    records_written = 0
    records_deduplicated = 0
    polled_requests = 0
    errors: list[str] = []

    poll_state: dict[str, str] = {}
    if poll_state_path.exists():
        poll_state = json.loads(poll_state_path.read_text(encoding="utf-8"))

    max_gap_min = max(4.0, float(cadence_spec["recommended_interval_minutes"]) + 0.5)

    for src_entry in active_sources:
        if src_entry.source_id == "api_football":
            api_key = str(eff_env["API_FOOTBALL_KEY"]).strip()
            for fx in window_fixtures:
                fixture_id = fx.get("api_football_fixture_id")
                if not fixture_id:
                    continue
                url = src_entry.endpoint_template.format(fixture_id=urllib.parse.quote(str(fixture_id)))
                polled_requests += 1
                status_code, _, raw_bytes = http_get_fn(
                    url,
                    headers={"x-apisports-key": api_key},
                )
                if status_code != 200:
                    errors.append(f"api_football fixture={fixture_id}: HTTP {status_code}")
                    continue
                capture_ts = datetime.now(timezone.utc).replace(microsecond=0) if now_utc is None else now_dt
                state_key = f"api_football::{fixture_id}"
                prior_empty_iso = poll_state.get(state_key)
                prior_empty_dt = (
                    parse_strict_utc_iso(prior_empty_iso, "prior_empty_poll_ts") if prior_empty_iso else None
                )
                parsed_record = parse_api_football_lineups_payload(
                    raw_bytes,
                    fixture_meta=fx,
                    ts_captured=capture_ts,
                    prior_empty_poll_ts=prior_empty_dt,
                    max_poll_gap_minutes=max_gap_min,
                )
                if parsed_record is None:
                    poll_state[state_key] = format_utc_iso(capture_ts)
                else:
                    _, appended = append_xi_record_jsonl(snapshots_path, parsed_record)
                    if appended:
                        records_written += 1
                    else:
                        records_deduplicated += 1

    out_dir.mkdir(parents=True, exist_ok=True)
    if poll_state:
        poll_state_path.write_text(json.dumps(poll_state, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    status_label = (
        "idle_no_active_legal_credentials"
        if not active_sources
        else ("ok_once_completed" if not errors else "completed_with_warnings")
    )
    health_payload = {
        "schema_version": "xi_collector_health_v3.2.0",
        "mode": "once",
        "executed_at_utc": format_utc_iso(now_dt),
        "status": status_label,
        "production_activated": False,
        "cadence_t60m": cadence_spec,
        "anti_leakage_contract": {
            "inequality": "ts_xi_published <= ts_captured <= ts_decision - 2.0 min < kickoff_utc",
            "min_ingestion_buffer_minutes": MIN_INGESTION_BUFFER_MINUTES,
            "min_execution_delay_minutes": MIN_EXECUTION_DELAY_MINUTES,
        },
        "active_legal_sources": [e.source_id for e in active_sources],
        "blocked_sources": [
            k for k, v in XI_LEGAL_SOURCES_REGISTRY.items() if v.legal_status == "blocked_pending_owner_decision"
        ],
        "fixtures_total_considered": len(all_fixtures),
        "fixtures_in_t60m_window": len(window_fixtures),
        "polled_requests": polled_requests,
        "records_written": records_written,
        "records_deduplicated": records_deduplicated,
        "fabricated_records": 0,
        "snapshots_jsonl_path": str(snapshots_path),
        "snapshots_jsonl_exists": snapshots_path.exists(),
        "errors": errors,
        "legal_sources_audit": legal_summary,
    }
    health_path.write_text(json.dumps(health_payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return health_payload


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Colector legal y validador de XI confirmado en T-60m (EXP_V32_xi · B7)."
    )
    mode_grp = parser.add_mutually_exclusive_group(required=True)
    mode_grp.add_argument("--dry-run", action="store_true", help="Valida configuración y fuentes sin tocar red ni disco.")
    mode_grp.add_argument("--once", action="store_true", help="Ejecuta un ciclo único sobre fuentes legales activas.")
    parser.add_argument(
        "--sources",
        nargs="*",
        default=None,
        help="Subconjunto opcional de source_id a usar (falla si alguna está bloqueada).",
    )
    parser.add_argument(
        "--fixtures-json",
        type=Path,
        default=None,
        help="Archivo JSON opcional con lista de partidos próximos a consultar.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_DATA_DIR,
        help="Directorio de salida dentro de EXP_V32_xi (por defecto EXP_V32_xi/data).",
    )
    parser.add_argument(
        "--now-utc",
        type=str,
        default=None,
        help="Timestamp ISO-8601 UTC opcional para ejecución determinista.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _build_arg_parser().parse_args(argv)
    fixtures_list: list[dict[str, Any]] = []
    if args.fixtures_json is not None:
        fixtures_list = json.loads(Path(args.fixtures_json).read_text(encoding="utf-8"))
    report = run_collector(
        dry_run=bool(args.dry_run),
        once=bool(args.once),
        requested_sources=args.sources,
        fixtures=fixtures_list,
        output_dir=args.output_dir,
        now_utc=args.now_utc,
    )
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
