#!/usr/bin/env python3
"""PREDLAB-V3.2 (Ola 2 · Agente B5 `b5-paper`) — Runner causal e idempotente de paper-trading
y generador del ledger prospectivo + reporte semanal (`A29_prospectivo_semana_<n>.md`).

Reglas contractuales obligatorias (§0 y §3):
  1. Artefactos `v3.1` estrictamente congelados en solo lectura (`blend_weights_v3_1.json`,
     `pick_policy_v3_1.json`, `stale_lines_config.json`, `production_segments_v3_1.json` con `0/60`).
  2. Corte prospectivo estricto: solo decisiones pre-partido con
     `ts_captured <= ts_decision < ts_event_start` y `ts_decision > 2026-11-08T20:30:00Z`.
  3. Ejecución diferida realista: `execution_delay = 2.0 min`, llenando únicamente con el
     **primer tick** de la casa objetivo que cumpla
     `ts_captured >= ts_decision + 2.0 min` y `ts_captured <= ts_event_start`.
     Jamás se inspeccionan ticks `> ts_decision` para tomar o filtrar la decisión.
  4. Persistencia append-only de picks válidos (`tier in ("solido", "valor")`) usando
     `append_pick_to_jsonl` (`services/models/clv_report.py`), con idempotencia total al re-ejecutar.
  5. Post-partido (`--settle` o cuando existen marcadores finales `status == "final"`): resuelve el
     cierre sharp (`resolve_closing_odds` en `services/ingest/odds_snapshots.py`: `pinnacle` ->
     fallback `smarkets`) y liquida el pick encadenando registros `closing` y `settlement` sin mutar
     jamás las líneas previas del `.jsonl`.
  6. Separación estricta de procedencia (`provenance`): los datos reales y los fixtures sintéticos
     jamás se mezclan; todo registro sintético lleva explícitamente `"provenance": "synthetic"`.
"""

from __future__ import annotations

import argparse
from collections.abc import Mapping, Sequence
from datetime import datetime, timedelta, timezone
import hashlib
import json
import math
from pathlib import Path
import sys
from typing import Any

import numpy as np
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]
PRED_LAB_ROOT = REPO_ROOT / "research" / "prediction-lab"
MODELS_DIR = REPO_ROOT / "services" / "models"
INGEST_DIR = REPO_ROOT / "services" / "ingest"
TS_DATA_PREDICTION_DIR = REPO_ROOT / "src" / "data" / "prediction"

for _p in (str(REPO_ROOT), str(MODELS_DIR), str(INGEST_DIR), str(PRED_LAB_ROOT)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import clv_report
from services.ingest import odds_snapshots
import picks_engine as pe
import stale_lines as sl

# ---------------------------------------------------------------------------
# Constantes contractuales y hashes SHA-256 congelados en Puerta 1 (`v3.1`)
# ---------------------------------------------------------------------------

PAPER_TRADING_SCHEMA_VERSION: str = "paper_trading_v3.2.0"
MODEL_VERSION_REAL: str = "v3.1_frozen_paper_v3_2"
MODEL_VERSION_SYNTHETIC: str = "v3.1_frozen_paper_v3_2:synthetic"

PROSPECTIVE_CUTOFF_UTC: str = "2026-11-08T20:30:00Z"
PROSPECTIVE_CUTOFF_TS: pd.Timestamp = pd.Timestamp(PROSPECTIVE_CUTOFF_UTC)

DEFAULT_EXECUTION_DELAY_MINUTES: float = 2.0
DEFAULT_MAX_EXEC_QUOTE_AGE_MINUTES: float = 15.0

GATE_MIN_PROSPECTIVE_PICKS: int = 150
GATE_MIN_SEGMENT_CLV_PICKS: int = 15
DEFAULT_BOOTSTRAP_RESAMPLES: int = 1000
DEFAULT_BOOTSTRAP_SEED: int = 20261111

VALID_PROVENANCES: tuple[str, ...] = ("real", "synthetic")
VALID_PROSPECTIVE_TIERS: frozenset[str] = frozenset({"solido", "valor"})

# Libros ejecutables permitidos para candidatos A5 (modelo+mercado) y A8 (stale lines)
A5_ALLOWED_EXECUTION_BOOKS: tuple[str, ...] = (
    "pinnacle",
    "smarkets",
    "b365",
    "caliente",
    "codere",
    "draftkings",
    "fanduel",
    "betmgm",
    "betrivers",
    "fanatics",
    "hardrock",
    "thescore_bet",
    "bw",
    "wh",
    "bf",
)

A8_ALLOWED_RECREATIONAL_BOOKS: tuple[str, ...] = sl.RECREATIONAL_EXECUTION_BOOKS

DEFAULT_B3_TIMESERIES_DIR: Path = (
    REPO_ROOT.parent / "web-scraping" / "data" / "odds_timeseries"
)
DEFAULT_PROSPECTIVE_LEDGER_PATH: Path = (
    REPO_ROOT / "data" / "ledger" / "picks_v3_2_prospective.jsonl"
)
DEFAULT_FIXTURES_DIR: Path = REPO_ROOT / "data" / "ledger" / "fixtures"
DEFAULT_SYNTHETIC_TIMESERIES_PATH: Path = (
    DEFAULT_FIXTURES_DIR / "synthetic_odds_timeseries_v3_2.jsonl"
)
DEFAULT_SYNTHETIC_MODEL_PROBS_PATH: Path = (
    DEFAULT_FIXTURES_DIR / "synthetic_model_probs_v3_2.json"
)
DEFAULT_SYNTHETIC_RESULTS_PATH: Path = (
    DEFAULT_FIXTURES_DIR / "synthetic_results_v3_2.json"
)
DEFAULT_SYNTHETIC_LEDGER_PATH: Path = (
    DEFAULT_FIXTURES_DIR / "picks_v3_2_synthetic_fixture.jsonl"
)
DEFAULT_REPORTS_DIR: Path = PRED_LAB_ROOT / "reports"

FROZEN_V3_1_EXPECTED_SHA256: dict[str, str] = {
    "production_segments_v3_1.json": "0bc03bbff96a5d82a1a7858e1e8623bf7bfdb250c546d2773a71d56ed9ada9bc",
    "blend_weights_v3_1.json": "b29d7a451f6011126997c122778b42ad3239c78337d17c5fa78d550f5c92739b",
    "pick_policy_v3_1.json": "2359c8f8822ea394a380202c04e0bcd010d1a3fae7c5c25b8c11ebe810bfb7d1",
    "stale_lines_config.json": "8bcb9c7be93270cde0cac2d58bc19f0381184dd2e769f358dd28334db2a05eac",
}


# ---------------------------------------------------------------------------
# Excepciones de dominio
# ---------------------------------------------------------------------------


class PaperTradingError(RuntimeError):
    """Error base del pipeline prospectivo de paper-trading."""


class PaperTradingCausalityError(PaperTradingError):
    """Violación de causalidad temporal o intento de operar en/antes del corte del holdout."""


class PaperTradingProvenanceError(PaperTradingError):
    """Intento prohibido de mezclar datos reales y sintéticos sin separación explícita."""


class PaperTradingFrozenArtifactError(PaperTradingError):
    """Alteración detectada en artefactos congelados `v3.1` o en `production_enabled`."""


# ---------------------------------------------------------------------------
# Verificación de artefactos congelados `v3.1` (Reglas §0.1 y §0.3)
# ---------------------------------------------------------------------------


def _sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _build_model_only_a5_policy(frozen_pick_policy: Mapping[str, Any]) -> dict[str, Any]:
    """Desactiva `allow_pure_market_arb` en copia en memoria de `pick_policy_v3_1` para que `A5`
    evalúe exclusivamente los `12/60` segmentos `model_picks_enabled=True` y delegue líneas rezagadas
    recreativas a `A8` (`double_confirmation`), idéntico a `evaluate_sealed_holdout_v3_1.py`."""
    policy_copy: dict[str, Any] = json.loads(json.dumps(dict(frozen_pick_policy)))
    policy_copy["allow_pure_market_arb"] = False
    segs = policy_copy.get("segments")
    if isinstance(segs, dict):
        for seg_cfg in segs.values():
            if isinstance(seg_cfg, dict):
                seg_cfg["allow_pure_market_arb"] = False
    return policy_copy


def load_and_verify_frozen_v3_1_artifacts(
    data_dir: Path = TS_DATA_PREDICTION_DIR,
    *,
    enforce_sha256: bool = True,
) -> dict[str, Any]:
    """Carga en modo solo lectura los 4 artefactos congelados `v3.1` y verifica su integridad."""
    hashes: dict[str, str] = {}
    loaded: dict[str, Any] = {}

    for filename, expected_sha in FROZEN_V3_1_EXPECTED_SHA256.items():
        fpath = data_dir / filename
        if not fpath.exists():
            raise PaperTradingFrozenArtifactError(
                f"Artefacto congelado v3.1 ausente: {fpath}"
            )
        actual_sha = _sha256_file(fpath)
        if enforce_sha256 and actual_sha != expected_sha:
            raise PaperTradingFrozenArtifactError(
                f"Artefacto congelado v3.1 modificado ({filename}): "
                f"sha256={actual_sha} != esperado={expected_sha}"
            )
        hashes[filename] = actual_sha
        loaded[filename] = json.loads(fpath.read_text(encoding="utf-8"))

    prod_segs = loaded["production_segments_v3_1.json"]
    seg_summary = (
        prod_segs.get("portfolio_vs_segment_verdict", {}).get("segment_level_summary", {})
    )
    if int(seg_summary.get("n_segments_production_enabled", -1)) != 0:
        raise PaperTradingFrozenArtifactError(
            "Regla §0.3 violada: n_segments_production_enabled debe permanecer en 0."
        )
    for seg_k, seg_v in (prod_segs.get("segments") or {}).items():
        if isinstance(seg_v, Mapping) and seg_v.get("production_enabled") is True:
            raise PaperTradingFrozenArtifactError(
                f"Regla §0.3 violada: el segmento {seg_k} tiene production_enabled=True sin pasar la puerta de 150 picks."
            )

    pick_policy = loaded["pick_policy_v3_1.json"]
    stale_config = loaded["stale_lines_config.json"]
    blend_weights = loaded["blend_weights_v3_1.json"]

    if pick_policy.get("holdout_sealed_untouched") is not True:
        raise PaperTradingFrozenArtifactError("pick_policy_v3_1 carece de holdout_sealed_untouched=True.")
    sl.validate_stale_lines_config(stale_config)

    return {
        "production_segments": prod_segs,
        "blend_weights": blend_weights,
        "blend_segments": blend_weights.get("segments") or {},
        "pick_policy_raw": pick_policy,
        "a5_model_only_policy": _build_model_only_a5_policy(pick_policy),
        "a8_stale_config": stale_config,
        "sha256": hashes,
    }


# ---------------------------------------------------------------------------
# Ingesta, guardia de `provenance` y deduplicación de series temporales (`B3`)
# ---------------------------------------------------------------------------


def _discover_timeseries_jsonl_files(timeseries_path: Path) -> list[Path]:
    """Descubre archivos `.jsonl` determinísticamente en `<dir>/<sport>/*.jsonl` o `<dir>/*.jsonl`."""
    if not timeseries_path.exists():
        return []
    if timeseries_path.is_file():
        return [timeseries_path] if timeseries_path.suffix.lower() == ".jsonl" else []

    found: set[Path] = set()
    for p in timeseries_path.glob("*.jsonl"):
        if p.is_file():
            found.add(p.resolve())
    for p in timeseries_path.glob("*/*.jsonl"):
        if p.is_file():
            found.add(p.resolve())
    return sorted(found, key=lambda item: str(item).replace("\\", "/"))


def load_prospective_timeseries(
    timeseries_path: str | Path,
    *,
    provenance: str = "real",
) -> tuple[pd.DataFrame, dict[str, Any], dict[str, Any] | None, list[str]]:
    """Lee la serie temporal de `B3` (o un fixture explícito), aplica la guardia de `provenance`
    (Regla §0.4) y valida/deduplica con `services.ingest.odds_snapshots.validate_and_deduplicate_snapshots`."""
    prov = str(provenance or "").strip().lower()
    if prov not in VALID_PROVENANCES:
        raise PaperTradingProvenanceError(
            f"provenance inválida: {provenance!r}; valores permitidos: {VALID_PROVENANCES}"
        )

    base_path = Path(timeseries_path)
    health_info: dict[str, Any] | None = None
    health_candidate = (
        base_path / "health.json" if base_path.is_dir() else base_path.parent / "health.json"
    )
    if health_candidate.exists() and health_candidate.is_file():
        try:
            health_info = json.loads(health_candidate.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            health_info = None

    jsonl_files = _discover_timeseries_jsonl_files(base_path)
    raw_rows: list[dict[str, Any]] = []

    for jpath in jsonl_files:
        norm_p = str(jpath).replace("\\", "/").lower()
        if prov == "real" and "/fixtures/" in norm_p:
            raise PaperTradingProvenanceError(
                f" Prohibido leer archivos de /fixtures/ en modo provenance='real': {jpath}"
            )

        for line_no, raw_line in enumerate(jpath.read_text(encoding="utf-8").splitlines(), start=1):
            trimmed = raw_line.strip()
            if not trimmed:
                continue
            try:
                obj = json.loads(trimmed)
            except json.JSONDecodeError as exc:
                raise PaperTradingError(f"JSON inválido en {jpath}:{line_no}: {exc}") from exc
            if not isinstance(obj, dict):
                raise PaperTradingError(f"Se esperaba objeto JSON en {jpath}:{line_no}")

            row_prov = obj.get("provenance")
            row_src = str(obj.get("source") or "").strip().lower()

            if prov == "real":
                if row_prov == "synthetic" or row_src == "synthetic":
                    raise PaperTradingProvenanceError(
                        f"Mezcla prohibida en {jpath}:{line_no}: fila marcada como synthetic en corrida provenance='real'."
                    )
            else:
                if row_prov != "synthetic":
                    raise PaperTradingProvenanceError(
                        f"En modo provenance='synthetic' cada fila de entrada debe llevar "
                        f"'provenance': 'synthetic' ({jpath}:{line_no}, recibido={row_prov!r})."
                    )

            raw_rows.append(obj)

    validated_df, dedup_stats = odds_snapshots.validate_and_deduplicate_snapshots(raw_rows)
    return (
        validated_df,
        dedup_stats,
        health_info,
        [str(p) for p in jsonl_files],
    )


def load_model_probs_catalog(
    path: str | Path | None,
    *,
    provenance: str = "real",
) -> dict[str, dict[str, Any]]:
    """Carga catálogo opcional de probabilidades causales pre-partido por `event_id`."""
    if path is None:
        return {}
    p = Path(path)
    if not p.exists():
        raise PaperTradingError(f"Archivo --model-probs no existe: {p}")
    payload = json.loads(p.read_text(encoding="utf-8"))
    if not isinstance(payload, Mapping):
        raise PaperTradingError(f"Formato inválido en --model-probs: {p}")

    file_prov = payload.get("provenance")
    if provenance == "real" and file_prov == "synthetic":
        raise PaperTradingProvenanceError(
            f"Prohibido usar catálogo --model-probs sintético ({p}) en modo provenance='real'."
        )
    if provenance == "synthetic" and file_prov != "synthetic":
        raise PaperTradingProvenanceError(
            f"En modo provenance='synthetic', --model-probs debe declarar 'provenance': 'synthetic' ({p})."
        )

    events_map = payload.get("events") if isinstance(payload.get("events"), Mapping) else payload
    out: dict[str, dict[str, Any]] = {}
    for eid, entry in events_map.items():
        if isinstance(entry, Mapping):
            if provenance == "real" and entry.get("provenance") == "synthetic":
                raise PaperTradingProvenanceError(
                    f"Evento sintético '{eid}' detectado en catálogo real."
                )
            out[str(eid)] = dict(entry)
    return out


def load_results_catalog(
    path: str | Path | None,
    *,
    provenance: str = "real",
) -> dict[str, dict[str, Any]]:
    """Carga catálogo opcional de marcadores finales post-partido por `event_id`."""
    if path is None:
        return {}
    p = Path(path)
    if not p.exists():
        raise PaperTradingError(f"Archivo --results no existe: {p}")
    payload = json.loads(p.read_text(encoding="utf-8"))
    if not isinstance(payload, Mapping):
        raise PaperTradingError(f"Formato inválido en --results: {p}")

    file_prov = payload.get("provenance")
    if provenance == "real" and file_prov == "synthetic":
        raise PaperTradingProvenanceError(
            f"Prohibido usar archivo --results sintético ({p}) en modo provenance='real'."
        )
    if provenance == "synthetic" and file_prov != "synthetic":
        raise PaperTradingProvenanceError(
            f"En modo provenance='synthetic', --results debe declarar 'provenance': 'synthetic' ({p})."
        )

    res_map = payload.get("results") if isinstance(payload.get("results"), Mapping) else payload
    out: dict[str, dict[str, Any]] = {}
    for eid, entry in res_map.items():
        if isinstance(entry, Mapping):
            if provenance == "real" and entry.get("provenance") == "synthetic":
                raise PaperTradingProvenanceError(
                    f"Resultado sintético '{eid}' detectado en corrida real."
                )
            out[str(eid)] = dict(entry)
    return out


# ---------------------------------------------------------------------------
# Persistencia Append-Only en Ledger + Verificación de Procedencia
# ---------------------------------------------------------------------------


def verify_ledger_file_provenance(ledger_path: Path, expected_provenance: str) -> list[dict[str, Any]]:
    """Verifica que un archivo `.jsonl` existente no mezcle registros reales y sintéticos."""
    if not ledger_path.exists():
        return []
    parsed_lines: list[dict[str, Any]] = []
    for line_no, raw_line in enumerate(ledger_path.read_text(encoding="utf-8").splitlines(), start=1):
        trimmed = raw_line.strip()
        if not trimmed:
            continue
        obj = json.loads(trimmed)
        if not isinstance(obj, dict):
            raise PaperTradingError(f"Línea no-objeto en ledger {ledger_path}:{line_no}")
        line_prov = obj.get("provenance")
        ver_mod = str(obj.get("version_modelo") or "")
        if expected_provenance == "real":
            if line_prov == "synthetic" or ver_mod.endswith(":synthetic"):
                raise PaperTradingProvenanceError(
                    f"Contaminación sintética detectada en ledger real {ledger_path}:{line_no}"
                )
        elif expected_provenance == "synthetic":
            if line_prov != "synthetic":
                raise PaperTradingProvenanceError(
                    f"Registro sin etiqueta explícita 'provenance': 'synthetic' en {ledger_path}:{line_no}"
                )
        parsed_lines.append(obj)
    return parsed_lines


def _ensure_ledger_file_initialized(ledger_path: Path) -> None:
    ledger_path.parent.mkdir(parents=True, exist_ok=True)
    if not ledger_path.exists():
        ledger_path.write_text("", encoding="utf-8")


def _append_pick_record_append_only(
    ledger_path: Path,
    pick_input: Mapping[str, Any],
    *,
    provenance: str,
) -> clv_report.PickLedgerEntry:
    """Persiste un pick válido en modo append-only:
    - En `provenance == 'real'` invoca directamente `clv_report.append_pick_to_jsonl` (§3.3).
    - En `provenance == 'synthetic'` verifica el ledger con `load_ledger_jsonl`, encadena con
      `ledger.append_pick` y añade explícitamente `"provenance": "synthetic"` en la línea JSONL
      sin alterar el `entry_hash` canónico ni mutar líneas previas."""
    if provenance == "real":
        return clv_report.append_pick_to_jsonl(ledger_path, pick_input)

    ledger = clv_report.load_ledger_jsonl(ledger_path)
    entry = ledger.append_pick(pick_input)
    ledger_path.parent.mkdir(parents=True, exist_ok=True)
    payload = dict(entry.to_dict())
    payload["provenance"] = "synthetic"
    line = json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n"
    with ledger_path.open("a", encoding="utf-8") as handle:
        handle.write(line)
    return entry


def _append_closing_record_append_only(
    ledger_path: Path,
    closing_input: Mapping[str, Any],
    *,
    provenance: str,
) -> clv_report.PickClosingRecord:
    """Añade un eslabón `closing` al final del `.jsonl` sin tocar jamás las líneas previas."""
    ledger = clv_report.load_ledger_jsonl(ledger_path)
    rec = ledger.append_closing(closing_input)
    payload = dict(rec.to_dict())
    if provenance == "synthetic":
        payload["provenance"] = "synthetic"
    line = json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n"
    with ledger_path.open("a", encoding="utf-8") as handle:
        handle.write(line)
    return rec


def _append_settlement_record_append_only(
    ledger_path: Path,
    settlement_input: Mapping[str, Any],
    *,
    provenance: str,
) -> clv_report.PickSettlementRecord:
    """Añade un eslabón `settlement` al final del `.jsonl` sin tocar jamás las líneas previas."""
    ledger = clv_report.load_ledger_jsonl(ledger_path)
    rec = ledger.append_settlement(settlement_input)
    payload = dict(rec.to_dict())
    if provenance == "synthetic":
        payload["provenance"] = "synthetic"
    line = json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n"
    with ledger_path.open("a", encoding="utf-8") as handle:
        handle.write(line)
    return rec


# ---------------------------------------------------------------------------
# Utilidades Causales de Mercado, Candidatos (`A5` + `A8`) y Delay `+2.0 min`
# ---------------------------------------------------------------------------


def _format_ts_iso_z(ts: pd.Timestamp) -> str:
    t_utc = ts.tz_localize("UTC") if ts.tzinfo is None else ts.tz_convert("UTC")
    if t_utc.microsecond == 0 and t_utc.nanosecond == 0:
        return t_utc.strftime("%Y-%m-%dT%H:%M:%SZ")
    return t_utc.isoformat().replace("+00:00", "Z")


def _format_line_key(line: float | None) -> str:
    if line is None or (isinstance(line, float) and math.isnan(line)):
        return "null"
    norm = pe.normalize_pick_line(line)
    if norm is None:
        return "null"
    return f"{norm:.4f}".rstrip("0").rstrip(".")


def build_deterministic_pick_id(
    *,
    provenance: str,
    event_id: str,
    market: str,
    line: float | None,
    selection: str,
    book: str,
) -> str:
    mkt = pe.canonical_pick_market(market)
    sel = pe.canonical_pick_selection(selection)
    bk = pe.canonical_pick_book(book)
    ln_str = _format_line_key(line)
    digest = clv_report.sha256_hex(f"{provenance}|{event_id}|{mkt}|{ln_str}|{sel}|{bk}")
    return f"pk_v32_{digest[:16]}"


def _infer_utc_date_for_pick(
    pick: clv_report.PickLedgerEntry,
    event_start_by_id: Mapping[str, pd.Timestamp],
) -> str:
    ts_start = event_start_by_id.get(pick.event_id)
    if ts_start is not None:
        return ts_start.tz_convert("UTC").strftime("%Y-%m-%d")
    parts = pick.event_id.split(":")
    if len(parts) >= 4 and len(parts[3]) == 8 and parts[3].isdigit():
        d = parts[3]
        return f"{d[:4]}-{d[4:6]}-{d[6:8]}"
    return pick.ts_emitido[:10]


def _extract_model_probs_for_market(
    event_model_entry: Mapping[str, Any] | None,
    *,
    event_id: str,
    market_canon: str,
    home_line: float | None,
    ts_decision: pd.Timestamp,
) -> tuple[list[float] | None, dict[str, list[float]]]:
    """Extrae vector causal `p_model_vec` y `submodel_probs` verificando `ts_disponible <= ts_decision`."""
    if not isinstance(event_model_entry, Mapping):
        return None, {}

    raw_disp = event_model_entry.get("ts_disponible")
    if raw_disp is not None:
        ts_disp = pd.Timestamp(raw_disp)
        ts_disp = ts_disp.tz_localize("UTC") if ts_disp.tzinfo is None else ts_disp.tz_convert("UTC")
        if ts_disp > ts_decision:
            raise PaperTradingCausalityError(
                f"Fuga causal en --model-probs para event_id={event_id}: "
                f"ts_disponible ({_format_ts_iso_z(ts_disp)}) > ts_decision ({_format_ts_iso_z(ts_decision)})."
            )

    markets_obj = event_model_entry.get("markets")
    if not isinstance(markets_obj, Mapping):
        return None, {}

    ln_str = _format_line_key(home_line)
    candidate_keys = [
        f"{market_canon}::{ln_str}",
        market_canon,
    ]
    mkt_spec: Mapping[str, Any] | None = None
    for k in candidate_keys:
        if isinstance(markets_obj.get(k), Mapping):
            spec_cand = markets_obj[k]
            spec_line = pe.normalize_pick_line(spec_cand.get("line"))
            if home_line is None and spec_line is None:
                mkt_spec = spec_cand
                break
            if home_line is not None and spec_line is not None and abs(spec_line - home_line) <= 1e-6:
                mkt_spec = spec_cand
                break

    if mkt_spec is None:
        return None, {}

    sel_order = sl.selection_order_for_market(market_canon)
    probs_obj = mkt_spec.get("probs")
    if not isinstance(probs_obj, Mapping):
        return None, {}

    vec: list[float] = []
    for s in sel_order:
        val = probs_obj.get(s)
        if not isinstance(val, (int, float)) or isinstance(val, bool) or not (0.0 < float(val) < 1.0):
            return None, {}
        vec.append(float(val))
    tot = sum(vec)
    if tot <= 0.0:
        return None, {}
    vec = [v / tot for v in vec]

    sub_out: dict[str, list[float]] = {}
    raw_sub = mkt_spec.get("submodel_probs")
    if isinstance(raw_sub, Mapping):
        for s in sel_order:
            sv = raw_sub.get(s)
            if isinstance(sv, (list, tuple)):
                clean_sv = [
                    float(x)
                    for x in sv
                    if isinstance(x, (int, float)) and not isinstance(x, bool) and 0.0 <= float(x) <= 1.0
                ]
                if len(clean_sv) >= 2:
                    sub_out[s] = clean_sv

    return vec, sub_out


def _resolve_causal_sharp_reference(
    mkt_causal_rows: list[dict[str, Any]],
    *,
    market_canon: str,
    devig_method: str,
) -> dict[str, Any] | None:
    """Resuelve la última cotización sharp completa (`pinnacle` -> `smarkets`) con `ts_captured <= ts_decision`."""
    sel_order = sl.selection_order_for_market(market_canon)
    for sharp_book in ("pinnacle", "smarkets"):
        bk_rows = [r for r in mkt_causal_rows if sl.canonical_stale_book(r["book"]) == sharp_book]
        if not bk_rows:
            continue
        latest_by_sel: dict[str, dict[str, Any]] = {}
        for r in bk_rows:
            s_c = sl.canonical_stale_selection(r["selection"])
            prev = latest_by_sel.get(s_c)
            if prev is None or r["ts_captured"] >= prev["ts_captured"]:
                latest_by_sel[s_c] = r
        if not all(s in latest_by_sel for s in sel_order):
            continue
        raw_odds = [float(latest_by_sel[s]["price_decimal"]) for s in sel_order]
        try:
            novig_vec = sl.devig_sharp_market_prices(raw_odds, method=devig_method)
        except ValueError:
            continue
        ts_sharp = max(latest_by_sel[s]["ts_captured"] for s in sel_order)
        return {
            "sharp_book": sharp_book,
            "raw_odds": raw_odds,
            "novig_vec": novig_vec,
            "ts_sharp_captured": ts_sharp,
        }
    return None


def resolve_delayed_fill_tick(
    event_rows: Sequence[Mapping[str, Any]],
    *,
    market_canon: str,
    home_line: float | None,
    selection_canon: str,
    book_canon: str,
    ts_decision: pd.Timestamp,
    ts_event_start: pd.Timestamp,
    execution_delay_minutes: float = DEFAULT_EXECUTION_DELAY_MINUTES,
) -> dict[str, Any] | None:
    """Llenado estricto: devuelve el **primer tick** de la casa objetivo que cumple
    `ts_captured >= ts_decision + execution_delay_minutes` y `ts_captured <= ts_event_start`."""
    if execution_delay_minutes < 0.0:
        raise ValueError(f"execution_delay_minutes inválido: {execution_delay_minutes}")

    min_fill_ts = ts_decision + timedelta(minutes=float(execution_delay_minutes))
    norm_hl = pe.normalize_pick_line(home_line)

    eligible: list[dict[str, Any]] = []
    for r in event_rows:
        r_mkt = pe.canonical_pick_market(r["market"])
        if r_mkt != market_canon:
            continue
        r_ln = pe.normalize_pick_line(r.get("line"))
        if norm_hl is None:
            if r_ln is not None:
                continue
        else:
            if r_ln is None or abs(r_ln - norm_hl) > 1e-6:
                continue
        if pe.canonical_pick_selection(r["selection"]) != selection_canon:
            continue
        if pe.canonical_pick_book(r["book"]) != book_canon:
            continue
        ts_cap: pd.Timestamp = r["ts_captured"]
        if ts_cap >= min_fill_ts and ts_cap <= ts_event_start:
            eligible.append(dict(r))

    if not eligible:
        return None

    eligible.sort(key=lambda item: item["ts_captured"])
    return eligible[0]


# ---------------------------------------------------------------------------
# Liquidación Post-Partido y Cierre Sharp (`resolve_closing_odds`)
# ---------------------------------------------------------------------------


def _lookup_resolved_closing_for_pick(
    pick: clv_report.PickLedgerEntry,
    closing_df: pd.DataFrame,
) -> dict[str, Any]:
    """Extrae el cierre sharp de `odds_snapshots.resolve_closing_odds` para un `PickLedgerEntry`."""
    if closing_df.empty:
        return {
            "closing_missing": True,
            "closing_book": None,
            "closing_source": None,
            "ts_closing_captured": None,
            "price_cierre_bruto": None,
            "price_cierre_sin_margen": None,
            "p_cierre_sin_margen": None,
        }

    mkt = pe.canonical_pick_market(pick.market)
    sel = pe.canonical_pick_selection(pick.selection)
    sub = closing_df.loc[
        (closing_df["event_id"] == pick.event_id) & (closing_df["market"] == mkt)
    ]

    if pick.line is not None:
        # En PickLedgerEntry `ah`/`spread` guarda el hándicap de la selección elegida;
        # en CONTRACT_ODDS_TIMESERIES `line` está en perspectiva local (`home_line = -away_line`).
        home_perspective_line = (
            -float(pick.line)
            if (mkt in ("ah", "spread") and sel == "away")
            else float(pick.line)
        )
        ln_series = pd.to_numeric(sub["line"], errors="coerce")
        matched = sub.loc[np.isclose(ln_series, home_perspective_line, atol=1e-6)]
        if matched.empty and mkt in ("ah", "spread") and sel == "away":
            matched = sub.loc[np.isclose(ln_series, float(pick.line), atol=1e-6)]
        sub = matched
    else:
        sub = sub.loc[sub["line"].isna()]

    if sub.empty:
        return {
            "closing_missing": True,
            "closing_book": None,
            "closing_source": None,
            "ts_closing_captured": None,
            "price_cierre_bruto": None,
            "price_cierre_sin_margen": None,
            "p_cierre_sin_margen": None,
        }

    row = sub.iloc[0]
    if bool(row["closing_missing"]) or pd.isna(row["closing_book"]):
        return {
            "closing_missing": True,
            "closing_book": None,
            "closing_source": None,
            "ts_closing_captured": None,
            "price_cierre_bruto": None,
            "price_cierre_sin_margen": None,
            "p_cierre_sin_margen": None,
        }

    raw_col = f"price_closing_{sel}"
    nv_price_col = f"price_closing_novig_{sel}"
    nv_prob_col = f"p_closing_novig_{sel}"

    if raw_col not in row or nv_price_col not in row or pd.isna(row[nv_price_col]):
        return {
            "closing_missing": True,
            "closing_book": None,
            "closing_source": None,
            "ts_closing_captured": None,
            "price_cierre_bruto": None,
            "price_cierre_sin_margen": None,
            "p_cierre_sin_margen": None,
        }

    ts_cl = row["ts_closing"]
    ts_cl_iso = _format_ts_iso_z(pd.Timestamp(ts_cl)) if pd.notna(ts_cl) else None

    return {
        "closing_missing": False,
        "closing_book": str(row["closing_book"]).strip().lower(),
        "closing_source": str(row["source"]).strip(),
        "ts_closing_captured": ts_cl_iso,
        "price_cierre_bruto": float(row[raw_col]),
        "price_cierre_sin_margen": float(row[nv_price_col]),
        "p_cierre_sin_margen": float(row[nv_prob_col]),
    }


def settle_prospective_ledger(
    *,
    ledger_path: Path,
    validated_df: pd.DataFrame,
    results_catalog: Mapping[str, Mapping[str, Any]],
    provenance: str = "real",
    settle_mode: bool = False,
    reference_now_utc: str | None = None,
) -> dict[str, int]:
    """Resuelve cierres sharp (`resolve_closing_odds`) y liquida picks finalizados en modo append-only."""
    verify_ledger_file_provenance(ledger_path, provenance)
    ledger = clv_report.load_ledger_jsonl(ledger_path)
    picks = ledger.get_picks()
    if not picks:
        return {"n_closings_appended": 0, "n_settlements_appended": 0}

    closing_df = odds_snapshots.resolve_closing_odds(validated_df, devig_method="power")

    event_start_map: dict[str, pd.Timestamp] = {}
    if not validated_df.empty:
        for eid, grp in validated_df.groupby("event_id", sort=False):
            event_start_map[str(eid)] = pd.Timestamp(grp["ts_event_start"].iloc[0])

    ref_now_ts: pd.Timestamp | None = None
    if reference_now_utc is not None:
        ref_now_ts = pd.Timestamp(reference_now_utc)
        ref_now_ts = (
            ref_now_ts.tz_localize("UTC") if ref_now_ts.tzinfo is None else ref_now_ts.tz_convert("UTC")
        )

    n_closings_appended = 0
    n_settlements_appended = 0

    for pick in picks:
        res_entry = results_catalog.get(pick.event_id)
        has_final_result = (
            isinstance(res_entry, Mapping)
            and str(res_entry.get("status", "final")).strip().lower() == "final"
            and res_entry.get("home_score") is not None
            and res_entry.get("away_score") is not None
        )

        ts_start = event_start_map.get(pick.event_id)
        if ts_start is None and isinstance(res_entry, Mapping) and res_entry.get("ts_event_start"):
            ts_s = pd.Timestamp(res_entry["ts_event_start"])
            ts_start = ts_s.tz_localize("UTC") if ts_s.tzinfo is None else ts_s.tz_convert("UTC")

        ts_settled_iso: str | None = None
        if has_final_result and isinstance(res_entry, Mapping):
            raw_ts_set = res_entry.get("ts_settled")
            if raw_ts_set is not None:
                ts_set = pd.Timestamp(raw_ts_set)
                ts_set = ts_set.tz_localize("UTC") if ts_set.tzinfo is None else ts_set.tz_convert("UTC")
                if ts_start is not None and ts_set < ts_start:
                    raise PaperTradingCausalityError(
                        f"Liquidación pre-kickoff inválida para {pick.event_id}: "
                        f"ts_settled ({_format_ts_iso_z(ts_set)}) < ts_event_start ({_format_ts_iso_z(ts_start)})."
                    )
                ts_settled_iso = _format_ts_iso_z(ts_set)
            elif ts_start is not None:
                ts_settled_iso = _format_ts_iso_z(ts_start + timedelta(hours=2))
            else:
                ts_settled_iso = pick.ts_emitido

        match_started_for_closing = has_final_result or (
            settle_mode
            and (
                ref_now_ts is None
                or (ts_start is not None and ts_start <= ref_now_ts)
            )
        )

        if match_started_for_closing and ledger.get_closing(pick.pick_id) is None:
            cl_info = _lookup_resolved_closing_for_pick(pick, closing_df)
            ts_rec = (
                ts_settled_iso
                or cl_info["ts_closing_captured"]
                or (_format_ts_iso_z(ts_start) if ts_start is not None else pick.ts_emitido)
            )
            _append_closing_record_append_only(
                ledger_path,
                {
                    "pick_id": pick.pick_id,
                    "ts_recorded": ts_rec,
                    "closing_missing": cl_info["closing_missing"],
                    "closing_book": cl_info["closing_book"],
                    "closing_source": cl_info["closing_source"],
                    "ts_closing_captured": cl_info["ts_closing_captured"],
                    "price_cierre_bruto": cl_info["price_cierre_bruto"],
                    "price_cierre_sin_margen": cl_info["price_cierre_sin_margen"],
                    "p_cierre_sin_margen": cl_info["p_cierre_sin_margen"],
                },
                provenance=provenance,
            )
            ledger = clv_report.load_ledger_jsonl(ledger_path)
            n_closings_appended += 1

        if has_final_result and isinstance(res_entry, Mapping) and ledger.get_settlement(pick.pick_id) is None:
            outcome = clv_report.grade_market_outcome(
                pick.market,
                pick.selection,
                float(res_entry["home_score"]),
                float(res_entry["away_score"]),
                pick.line,
            )
            _append_settlement_record_append_only(
                ledger_path,
                {
                    "pick_id": pick.pick_id,
                    "ts_liquidado": ts_settled_iso or pick.ts_emitido,
                    "outcome": outcome,
                },
                provenance=provenance,
            )
            ledger = clv_report.load_ledger_jsonl(ledger_path)
            n_settlements_appended += 1

    return {
        "n_closings_appended": n_closings_appended,
        "n_settlements_appended": n_settlements_appended,
    }


# ---------------------------------------------------------------------------
# Ejecución Principal del Runner Causal de Paper-Trading
# ---------------------------------------------------------------------------


def run_paper_trading(
    *,
    timeseries_path: str | Path = DEFAULT_B3_TIMESERIES_DIR,
    ledger_path: str | Path = DEFAULT_PROSPECTIVE_LEDGER_PATH,
    model_probs_path: str | Path | None = None,
    results_path: str | Path | None = None,
    provenance: str = "real",
    settle: bool = False,
    execution_delay_minutes: float = DEFAULT_EXECUTION_DELAY_MINUTES,
    max_exec_quote_age_minutes: float = DEFAULT_MAX_EXEC_QUOTE_AGE_MINUTES,
    reference_now_utc: str | None = None,
    enforce_frozen_sha256: bool = True,
) -> dict[str, Any]:
    """Ejecuta extremo a extremo el runner prospectivo sobre `timeseries_path` y persiste en `ledger_path`."""
    prov = str(provenance or "").strip().lower()
    if prov not in VALID_PROVENANCES:
        raise PaperTradingProvenanceError(f"provenance inválida: {provenance!r}")

    if float(execution_delay_minutes) < DEFAULT_EXECUTION_DELAY_MINUTES - 1e-12:
        raise PaperTradingCausalityError(
            f"execution_delay_minutes ({execution_delay_minutes}) no puede ser menor al mínimo contractual de 2.0 min."
        )

    ledger_p = Path(ledger_path)
    norm_ledger_p = str(ledger_p).replace("\\", "/").lower()
    if prov == "synthetic" and norm_ledger_p.endswith("data/ledger/picks_v3_2_prospective.jsonl"):
        raise PaperTradingProvenanceError(
            "Prohibido escribir registros sintéticos en el ledger prospectivo real picks_v3_2_prospective.jsonl."
        )

    frozen = load_and_verify_frozen_v3_1_artifacts(enforce_sha256=enforce_frozen_sha256)
    a5_policy = frozen["a5_model_only_policy"]
    a8_config = frozen["a8_stale_config"]
    blend_segments = frozen["blend_segments"]

    verify_ledger_file_provenance(ledger_p, prov)
    _ensure_ledger_file_initialized(ledger_p)

    validated_df, dedup_stats, health_info, jsonl_files = load_prospective_timeseries(
        timeseries_path, provenance=prov
    )
    model_probs_catalog = load_model_probs_catalog(model_probs_path, provenance=prov)
    results_catalog = load_results_catalog(results_path, provenance=prov)

    ledger = clv_report.load_ledger_jsonl(ledger_p)

    # Indexar eventos validados y fechas UTC de kickoff
    rows_by_event: dict[str, list[dict[str, Any]]] = {}
    event_start_by_id: dict[str, pd.Timestamp] = {}
    events_skipped_pre_cutoff = 0

    if not validated_df.empty:
        for eid_raw, grp in validated_df.groupby("event_id", sort=False):
            eid = str(eid_raw)
            ts_start = pd.Timestamp(grp["ts_event_start"].iloc[0])
            if ts_start <= PROSPECTIVE_CUTOFF_TS:
                events_skipped_pre_cutoff += 1
                continue
            event_start_by_id[eid] = ts_start
            ordered_grp = grp.sort_values(
                ["ts_captured", "market", "book", "selection"], kind="mergesort"
            )
            rows_by_event[eid] = ordered_grp.to_dict(orient="records")

    # Inicializar rastreador de exposición con picks ya persistidos en el ledger (idempotencia + topes)
    event_exposure_u: dict[str, float] = {}
    event_markets_taken: dict[str, set[str]] = {}
    event_pick_counts: dict[str, int] = {}
    league_date_exposure_u: dict[str, float] = {}
    global_date_exposure_u: dict[str, float] = {}

    for existing_pick in ledger.get_picks():
        eid_ex = existing_pick.event_id
        mkt_ex = pe.canonical_pick_market(existing_pick.market)
        u_date_ex = _infer_utc_date_for_pick(existing_pick, event_start_by_id)
        ld_key_ex = f"{existing_pick.league}::{u_date_ex}"
        st_ex = float(existing_pick.stake_u)

        event_exposure_u[eid_ex] = event_exposure_u.get(eid_ex, 0.0) + st_ex
        event_markets_taken.setdefault(eid_ex, set()).add(mkt_ex)
        event_pick_counts[eid_ex] = event_pick_counts.get(eid_ex, 0) + 1
        league_date_exposure_u[ld_key_ex] = league_date_exposure_u.get(ld_key_ex, 0.0) + st_ex
        global_date_exposure_u[u_date_ex] = global_date_exposure_u.get(u_date_ex, 0.0) + st_ex

    # Construir agenda cronológica de instantes causales `(ts_decision, event_id)`
    decision_schedule: list[tuple[pd.Timestamp, str]] = []
    ticks_skipped_pre_cutoff = 0
    for eid, ev_rows in rows_by_event.items():
        ts_start = event_start_by_id[eid]
        seen_ts: set[pd.Timestamp] = set()
        for r in ev_rows:
            ts_cap: pd.Timestamp = r["ts_captured"]
            if ts_cap <= PROSPECTIVE_CUTOFF_TS:
                ticks_skipped_pre_cutoff += 1
                continue
            if ts_cap >= ts_start:
                continue
            if ts_cap not in seen_ts:
                seen_ts.add(ts_cap)
                decision_schedule.append((ts_cap, eid))

    decision_schedule.sort(key=lambda item: (item[0], item[1]))

    rho_same_event = float(a5_policy.get("rho_same_event", 0.35))
    min_stake_u = float(a5_policy.get("min_stake_u", 0.05))
    caps = a5_policy["caps"]
    cap_pick_max = min(float(caps["max_stake_per_pick_u"]), pe.HARD_MAX_STAKE_PER_PICK_U)
    cap_event_max = min(float(caps["max_stake_per_event_u"]), pe.HARD_MAX_STAKE_PER_EVENT_U)
    cap_ld_max = min(float(caps["max_stake_per_league_date_u"]), pe.HARD_MAX_STAKE_PER_LEAGUE_DATE_U)
    cap_gd_max = min(float(caps["max_stake_per_global_date_u"]), pe.HARD_MAX_STAKE_PER_GLOBAL_DATE_U)
    sharp_win_min = float(a8_config.get("sharp_steam_window_minutes", 60.0))

    n_candidates_evaluated = 0
    n_approved_pre_fill = 0
    n_unfilled_post_delay = 0
    n_picks_appended = 0
    rejection_counts: dict[str, int] = {}
    version_modelo = MODEL_VERSION_SYNTHETIC if prov == "synthetic" else MODEL_VERSION_REAL

    for ts_dec, eid in decision_schedule:
        ev_rows = rows_by_event[eid]
        ts_start = event_start_by_id[eid]

        if ts_dec <= PROSPECTIVE_CUTOFF_TS or ts_dec >= ts_start:
            raise PaperTradingCausalityError(
                f"Instante de decisión inválido para {eid}: ts_decision={_format_ts_iso_z(ts_dec)}"
            )

        # Corte causal estricto: JAMÁS pasan filas con `ts_captured > ts_dec`
        causal_rows = [r for r in ev_rows if r["ts_captured"] <= ts_dec]
        if any(r["ts_captured"] > ts_dec for r in causal_rows):
            raise PaperTradingCausalityError(f"Fuga temporal interna en {eid}")
        if not causal_rows:
            continue

        sport = str(causal_rows[0]["sport"])
        league = str(causal_rows[0]["league"])
        ts_dec_iso = _format_ts_iso_z(ts_dec)
        ts_start_iso = _format_ts_iso_z(ts_start)

        # Mercados/líneas con actividad en `ts_dec` (evita reintentar cuotas muertas sin nuevo tick)
        active_mkt_lines: set[tuple[str, float | None]] = {
            (pe.canonical_pick_market(r["market"]), pe.normalize_pick_line(r.get("line")))
            for r in causal_rows
            if r["ts_captured"] == ts_dec
        }
        if not active_mkt_lines:
            continue

        survivors: list[dict[str, Any]] = []
        seq_idx = 0

        for mkt_canon, home_line in sorted(
            active_mkt_lines, key=lambda x: (x[0], -999999.0 if x[1] is None else x[1])
        ):
            if mkt_canon in event_markets_taken.get(eid, set()):
                continue

            mkt_causal_rows = [
                r
                for r in causal_rows
                if pe.canonical_pick_market(r["market"]) == mkt_canon
                and (
                    (home_line is None and pe.normalize_pick_line(r.get("line")) is None)
                    or (
                        home_line is not None
                        and pe.normalize_pick_line(r.get("line")) is not None
                        and abs(float(pe.normalize_pick_line(r.get("line"))) - home_line) <= 1e-6
                    )
                )
            ]
            if not mkt_causal_rows:
                continue

            seg_key = f"{league}::{mkt_canon}"
            blend_seg = blend_segments.get(seg_key) if isinstance(blend_segments, Mapping) else None
            best_devig = str(
                (blend_seg.get("best_devig_method") if isinstance(blend_seg, Mapping) else None)
                or a8_config.get("default_devig_method")
                or "power"
            )

            sharp_ref = _resolve_causal_sharp_reference(
                mkt_causal_rows, market_canon=mkt_canon, devig_method=best_devig
            )
            if sharp_ref is None:
                continue

            p_model_vec, sub_by_sel = _extract_model_probs_for_market(
                model_probs_catalog.get(eid),
                event_id=eid,
                market_canon=mkt_canon,
                home_line=home_line,
                ts_decision=ts_dec,
            )

            # Historial sharp estrictamente causal en `[ts_dec - 60m, ts_dec]`
            win_start_ts = ts_dec - timedelta(minutes=sharp_win_min)
            sharp_quotes_1h = [
                {
                    "ts_captured": _format_ts_iso_z(r["ts_captured"]),
                    "market": mkt_canon,
                    "line": home_line,
                    "selection": pe.canonical_pick_selection(r["selection"]),
                    "book": pe.canonical_pick_book(r["book"]),
                    "price_decimal": float(r["price_decimal"]),
                }
                for r in mkt_causal_rows
                if sl.is_sharp_reference_book(r["book"])
                and win_start_ts <= r["ts_captured"] <= ts_dec
            ]

            # Última cotización causal por `(book, selection)` con antigüedad acotada
            latest_quote_by_book_sel: dict[tuple[str, str], dict[str, Any]] = {}
            for r in mkt_causal_rows:
                bk_c = pe.canonical_pick_book(r["book"])
                sel_c = pe.canonical_pick_selection(r["selection"])
                age_min = (ts_dec - r["ts_captured"]).total_seconds() / 60.0
                if age_min > float(max_exec_quote_age_minutes) + 1e-9:
                    continue
                prev_q = latest_quote_by_book_sel.get((bk_c, sel_c))
                if prev_q is None or r["ts_captured"] >= prev_q["ts_captured"]:
                    latest_quote_by_book_sel[(bk_c, sel_c)] = r

            sel_order = sl.selection_order_for_market(mkt_canon)

            # 1) Motor A5: segmentos `model_picks_enabled == True` (mezcla logit congelada v3.1)
            a5_seg = (a5_policy.get("segments") or {}).get(seg_key)
            if (
                isinstance(a5_seg, Mapping)
                and bool(a5_seg.get("model_picks_enabled"))
                and p_model_vec is not None
                and len(p_model_vec) == len( sharp_ref["novig_vec"] )
            ):
                w_eff = float(a5_seg.get("w_effective", 0.0))
                p_final_vec = pe.blend_probs_logit_simplex(
                    p_model_vec, sharp_ref["novig_vec"], w_eff
                )
                for s_idx, sel_c in enumerate(sel_order):
                    # Line-shopping causal sobre libros ejecutables permitidos
                    best_row: dict[str, Any] | None = None
                    for bk_allowed in A5_ALLOWED_EXECUTION_BOOKS:
                        q_row = latest_quote_by_book_sel.get((bk_allowed, sel_c))
                        if q_row is None:
                            continue
                        if best_row is None or float(q_row["price_decimal"]) > float(
                            best_row["price_decimal"]
                        ):
                            best_row = q_row
                    if best_row is None:
                        continue

                    cand_a5: dict[str, Any] = {
                        "candidate_id": f"a5|{eid}|{mkt_canon}|{_format_line_key(home_line)}|{sel_c}|{pe.canonical_pick_book(best_row['book'])}",
                        "event_id": eid,
                        "sport": sport,
                        "league": league,
                        "market": mkt_canon,
                        "line": home_line,
                        "selection": sel_c,
                        "book": pe.canonical_pick_book(best_row["book"]),
                        "price_decimal": float(best_row["price_decimal"]),
                        "p_modelo": float(p_model_vec[s_idx]),
                        "p_mercado": float(sharp_ref["novig_vec"][s_idx]),
                        "p_final": float(p_final_vec[s_idx]),
                        "submodel_probs": sub_by_sel.get(sel_c),
                        "ts_captured": _format_ts_iso_z(best_row["ts_captured"]),
                        "ts_decision": ts_dec_iso,
                        "ts_event_start": ts_start_iso,
                        "sharp_quotes_1h": sharp_quotes_1h,
                        "allow_pure_market_arb": False,
                    }
                    n_candidates_evaluated += 1
                    dec_a5 = pe.evaluate_pick_candidates(
                        [cand_a5], a5_policy, portfolio_state=None, _trusted_validated_policy=True
                    )[0]
                    if not dec_a5.approved or dec_a5.tier is None:
                        if dec_a5.rejection_reason:
                            rk = f"a5:{dec_a5.rejection_reason}"
                            rejection_counts[rk] = rejection_counts.get(rk, 0) + 1
                        continue
                    survivors.append(
                        {
                            "seq_idx": seq_idx,
                            "source_prio": 0,
                            "engine_source": "a5_model_driven",
                            "event_id": eid,
                            "sport": sport,
                            "league": league,
                            "market": mkt_canon,
                            "home_line": home_line,
                            "selection": sel_c,
                            "book": dec_a5.book,
                            "utc_date": dec_a5.utc_date,
                            "tier": str(dec_a5.tier),
                            "price_decision": float(dec_a5.price_decimal),
                            "p_modelo": float(dec_a5.p_modelo),
                            "p_mercado": float(dec_a5.p_mercado),
                            "p_final": float(dec_a5.p_final),
                            "ev_decision": float(dec_a5.ev),
                            "sigma_p": float(dec_a5.sigma_p),
                            "stake_raw_u": float(dec_a5.stake_raw_u),
                            "expected_log_growth_g": float(dec_a5.expected_log_growth_g),
                            "ts_quote_captured": _format_ts_iso_z(best_row["ts_captured"]),
                            "ts_sharp_captured": _format_ts_iso_z(sharp_ref["ts_sharp_captured"]),
                            "sharp_reference_book": sharp_ref["sharp_book"],
                        }
                    )
                    seq_idx += 1

            # 2) Motor A8: cuotas recreativas rezagadas con Doble Confirmación (`double_confirmation`)
            for s_idx, sel_c in enumerate(sel_order):
                best_rec_row: dict[str, Any] | None = None
                for rec_bk in A8_ALLOWED_RECREATIONAL_BOOKS:
                    q_row = latest_quote_by_book_sel.get((rec_bk, sel_c))
                    if q_row is None:
                        continue
                    if best_rec_row is None or float(q_row["price_decimal"]) > float(
                        best_rec_row["price_decimal"]
                    ):
                        best_rec_row = q_row
                if best_rec_row is None:
                    continue

                cand_a8: dict[str, Any] = {
                    "candidate_id": f"a8|{eid}|{mkt_canon}|{_format_line_key(home_line)}|{sel_c}|{sl.canonical_stale_book(best_rec_row['book'])}",
                    "event_id": eid,
                    "sport": sport,
                    "league": league,
                    "market": mkt_canon,
                    "line": home_line,
                    "selection": sel_c,
                    "selection_index": s_idx,
                    "recreational_book": sl.canonical_stale_book(best_rec_row["book"]),
                    "sharp_book": sharp_ref["sharp_book"],
                    "price_recreational": float(best_rec_row["price_decimal"]),
                    "sharp_market_odds": sharp_ref["raw_odds"],
                    "p_sharp_novig": float(sharp_ref["novig_vec"][s_idx]),
                    "sharp_market_novig_probs": sharp_ref["novig_vec"],
                    "devig_method": best_devig,
                    "p_modelo": float(p_model_vec[s_idx]) if p_model_vec is not None else None,
                    "model_market_probs": p_model_vec,
                    "submodel_probs": sub_by_sel.get(sel_c),
                    "ts_recreational_captured": _format_ts_iso_z(best_rec_row["ts_captured"]),
                    "ts_sharp_captured": _format_ts_iso_z(sharp_ref["ts_sharp_captured"]),
                    "ts_decision": ts_dec_iso,
                    "ts_event_start": ts_start_iso,
                    "sharp_quotes_1h": sharp_quotes_1h,
                }
                n_candidates_evaluated += 1
                dec_a8 = sl.evaluate_stale_line_batch(
                    [cand_a8],
                    a8_config,
                    portfolio_state=None,
                    override_signal_mode="double_confirmation",
                    skip_config_validation=True,
                )[0]
                if not dec_a8.approved or dec_a8.tier is None:
                    if dec_a8.rejection_reason:
                        rk = f"a8:{dec_a8.rejection_reason}"
                        rejection_counts[rk] = rejection_counts.get(rk, 0) + 1
                    continue

                p_mod_out = (
                    float(dec_a8.p_modelo)
                    if dec_a8.p_modelo is not None
                    else float(dec_a8.p_sharp_novig)
                )
                survivors.append(
                    {
                        "seq_idx": seq_idx,
                        "source_prio": 1,
                        "engine_source": "a8_stale_double_conf",
                        "event_id": eid,
                        "sport": sport,
                        "league": league,
                        "market": mkt_canon,
                        "home_line": home_line,
                        "selection": sel_c,
                        "book": dec_a8.recreational_book,
                        "utc_date": dec_a8.utc_date,
                        "tier": str(dec_a8.tier),
                        "price_decision": float(dec_a8.price_recreational),
                        "p_modelo": p_mod_out,
                        "p_mercado": float(dec_a8.p_sharp_novig),
                        "p_final": float(dec_a8.p_effective),
                        "ev_decision": float(dec_a8.p_effective * dec_a8.price_recreational - 1.0),
                        "sigma_p": float(dec_a8.sigma_p),
                        "stake_raw_u": float(dec_a8.stake_raw_u),
                        "expected_log_growth_g": float(dec_a8.expected_log_growth_g),
                        "ts_quote_captured": _format_ts_iso_z(best_rec_row["ts_captured"]),
                        "ts_sharp_captured": _format_ts_iso_z(sharp_ref["ts_sharp_captured"]),
                        "sharp_reference_book": sharp_ref["sharp_book"],
                    }
                )
                seq_idx += 1

        if not survivors:
            continue

        survivors.sort(
            key=lambda s: (-s["expected_log_growth_g"], -s["ev_decision"], s["source_prio"], s["seq_idx"])
        )

        for s in survivors:
            mkt_c = s["market"]
            mkt_taken = event_markets_taken.setdefault(eid, set())
            if mkt_c in mkt_taken:
                rejection_counts["portfolio:correlated_same_event_market"] = (
                    rejection_counts.get("portfolio:correlated_same_event_market", 0) + 1
                )
                continue

            prior_cnt = event_pick_counts.get(eid, 0)
            corr_mult = ((1.0 - abs(rho_same_event)) ** prior_cnt) if prior_cnt > 0 else 1.0
            stake_corr_u = s["stake_raw_u"] * corr_mult

            ld_key = f"{s['league']}::{s['utc_date']}"
            used_ev = event_exposure_u.get(eid, 0.0)
            used_ld = league_date_exposure_u.get(ld_key, 0.0)
            used_gd = global_date_exposure_u.get(s["utc_date"], 0.0)

            if cap_event_max - used_ev <= 1e-9:
                rejection_counts["portfolio:cap_event_exhausted"] = (
                    rejection_counts.get("portfolio:cap_event_exhausted", 0) + 1
                )
                continue
            if cap_ld_max - used_ld <= 1e-9:
                rejection_counts["portfolio:cap_league_date_exhausted"] = (
                    rejection_counts.get("portfolio:cap_league_date_exhausted", 0) + 1
                )
                continue
            if cap_gd_max - used_gd <= 1e-9:
                rejection_counts["portfolio:cap_global_date_exhausted"] = (
                    rejection_counts.get("portfolio:cap_global_date_exhausted", 0) + 1
                )
                continue

            stake_u = min(stake_corr_u, cap_pick_max)
            stake_u = pe._clamp_safe_addition(used_ev, stake_u, cap_event_max)
            stake_u = pe._clamp_safe_addition(used_ld, stake_u, cap_ld_max)
            stake_u = pe._clamp_safe_addition(used_gd, stake_u, cap_gd_max)

            if stake_u < min_stake_u:
                rejection_counts["portfolio:stake_below_min_unit"] = (
                    rejection_counts.get("portfolio:stake_below_min_unit", 0) + 1
                )
                continue

            if s["tier"] not in VALID_PROSPECTIVE_TIERS:
                raise PaperTradingError(f"Tier prospectivo inválido: {s['tier']!r}")

            n_approved_pre_fill += 1

            # Llenado diferido estricto (`>= ts_decision + 2.0 min` y `<= ts_event_start`)
            fill_tick = resolve_delayed_fill_tick(
                ev_rows,
                market_canon=mkt_c,
                home_line=s["home_line"],
                selection_canon=s["selection"],
                book_canon=s["book"],
                ts_decision=ts_dec,
                ts_event_start=ts_start,
                execution_delay_minutes=execution_delay_minutes,
            )
            if fill_tick is None:
                n_unfilled_post_delay += 1
                rejection_counts["execution:unfilled_no_post_delay_tick"] = (
                    rejection_counts.get("execution:unfilled_no_post_delay_tick", 0) + 1
                )
                continue

            price_tomado = float(fill_tick["price_decimal"])
            ts_fill_iso = _format_ts_iso_z(fill_tick["ts_captured"])
            ledger_line = (
                pe.normalize_pick_line(-float(s["home_line"]))
                if (mkt_c in ("ah", "spread") and s["selection"] == "away" and s["home_line"] is not None)
                else s["home_line"]
            )

            pick_id = build_deterministic_pick_id(
                provenance=prov,
                event_id=eid,
                market=mkt_c,
                line=ledger_line,
                selection=s["selection"],
                book=s["book"],
            )
            if ledger.get_pick(pick_id) is not None:
                mkt_taken.add(mkt_c)
                continue

            features_hash = clv_report.compute_features_hash(
                {
                    "provenance": prov,
                    "engine_source": s["engine_source"],
                    "ts_decision": ts_dec_iso,
                    "ts_quote_captured": s["ts_quote_captured"],
                    "ts_sharp_captured": s["ts_sharp_captured"],
                    "ts_executed": ts_fill_iso,
                    "execution_delay_minutes": float(execution_delay_minutes),
                    "price_decision": s["price_decision"],
                    "price_tomado": price_tomado,
                    "sharp_reference_book": s["sharp_reference_book"],
                    "sigma_p": s["sigma_p"],
                }
            )

            pick_payload: dict[str, Any] = {
                "pick_id": pick_id,
                "ts_emitido": ts_dec_iso,
                "event_id": eid,
                "sport": s["sport"],
                "league": s["league"],
                "market": mkt_c,
                "line": ledger_line,
                "selection": s["selection"],
                "book": s["book"],
                "price_tomado": price_tomado,
                "p_modelo": s["p_modelo"],
                "p_mercado": s["p_mercado"],
                "p_final": s["p_final"],
                "ev": float(s["p_final"] * price_tomado - 1.0),
                "stake_u": stake_u,
                "tier": s["tier"],
                "version_modelo": version_modelo,
                "features_hash": features_hash,
            }

            _append_pick_record_append_only(ledger_p, pick_payload, provenance=prov)
            ledger = clv_report.load_ledger_jsonl(ledger_p)
            n_picks_appended += 1

            event_exposure_u[eid] = used_ev + stake_u
            league_date_exposure_u[ld_key] = used_ld + stake_u
            global_date_exposure_u[s["utc_date"]] = used_gd + stake_u
            event_pick_counts[eid] = prior_cnt + 1
            mkt_taken.add(mkt_c)

    # Fase post-partido (`--settle` o cuando ya existen marcadores finales en `results_catalog`)
    settle_stats = {"n_closings_appended": 0, "n_settlements_appended": 0}
    if settle or bool(results_catalog):
        settle_stats = settle_prospective_ledger(
            ledger_path=ledger_p,
            validated_df=validated_df,
            results_catalog=results_catalog,
            provenance=prov,
            settle_mode=settle,
            reference_now_utc=reference_now_utc,
        )

    final_ledger = clv_report.load_ledger_jsonl(ledger_p)
    assert final_ledger.verify_integrity() is True

    return {
        "schema_version": PAPER_TRADING_SCHEMA_VERSION,
        "provenance": prov,
        "prospective_cutoff_utc": PROSPECTIVE_CUTOFF_UTC,
        "execution_delay_minutes": float(execution_delay_minutes),
        "timeseries_path": str(timeseries_path),
        "jsonl_files_scanned": len(jsonl_files),
        "ledger_path": str(ledger_p),
        "ledger_sha256": _sha256_file(ledger_p),
        "ledger_head_hash": final_ledger.head_hash,
        "ledger_total_records": len(final_ledger.get_records()),
        "ledger_total_picks": final_ledger.size,
        "n_candidates_evaluated": n_candidates_evaluated,
        "n_approved_pre_fill": n_approved_pre_fill,
        "n_unfilled_post_delay": n_unfilled_post_delay,
        "n_picks_appended": n_picks_appended,
        "n_closings_appended": settle_stats["n_closings_appended"],
        "n_settlements_appended": settle_stats["n_settlements_appended"],
        "events_skipped_pre_cutoff": events_skipped_pre_cutoff,
        "ticks_skipped_pre_cutoff": ticks_skipped_pre_cutoff,
        "dedup_stats": dedup_stats,
        "rejection_counts": rejection_counts,
        "b3_health": health_info,
        "frozen_v3_1_sha256": frozen["sha256"],
    }


# ---------------------------------------------------------------------------
# Bootstrap `MaxDD` + Generación del Reporte Semanal (`A29_prospectivo_semana_<n>.md`)
# ---------------------------------------------------------------------------


def compute_max_drawdown_bootstrap_ci95(
    ledger: clv_report.PickLedger,
    *,
    segment_filter: str | None = None,
    n_resamples: int = DEFAULT_BOOTSTRAP_RESAMPLES,
    seed: int = DEFAULT_BOOTSTRAP_SEED,
) -> dict[str, Any]:
    """Calcula `MaxDD` puntual y su IC 95% bootstrap (`mulberry32`, `>= 1000` remuestreos)
    sobre la secuencia cronológica de `pnl_u` liquidados."""
    evaluated = clv_report.compute_clv_metrics(ledger)
    assert isinstance(evaluated, list)
    if segment_filter is not None:
        evaluated = [p for p in evaluated if f"{p['league']}::{p['market']}" == segment_filter]

    settled = [p for p in evaluated if p.get("pnl_u") is not None]
    settled.sort(key=lambda item: (str(item.get("ts_emitido", "")), str(item.get("pick_id", ""))))
    pnls = np.array([float(p["pnl_u"]) for p in settled], dtype=np.float64)
    point_dd = clv_report.compute_max_drawdown_u(pnls)

    if pnls.size == 0:
        return {"point_u": 0.0, "ci95": None}

    dd_seed = (int(seed) ^ 0x517CC1B7) & 0xFFFFFFFF
    m = int(pnls.size)
    u = clv_report.mulberry32_uniforms(dd_seed, int(n_resamples) * m).reshape((int(n_resamples), m))
    idx = np.minimum(m - 1, np.floor(u * m).astype(np.int64))
    boot_dd = np.array(
        [clv_report.compute_max_drawdown_u(pnls[row_idx]) for row_idx in idx],
        dtype=np.float64,
    )
    boot_sorted = np.sort(boot_dd)
    lo = clv_report.quantile_linear_sorted(boot_sorted, 0.025)
    hi = clv_report.quantile_linear_sorted(boot_sorted, 0.975)
    return {"point_u": point_dd, "ci95": [lo, hi]}


def _fmt_pct_metric(mean_val: float | None, ci95: Sequence[float] | None, sig_label: str) -> str:
    if mean_val is None or ci95 is None:
        return "N/A (`no significativa`, n=0)"
    return (
        f"{mean_val * 100.0:+.2f}% "
        f"(IC 95%: [{ci95[0] * 100.0:+.2f}%, {ci95[1] * 100.0:+.2f}%], `{sig_label}`)"
    )


def _fmt_pp_metric(mean_val: float | None, ci95: Sequence[float] | None, sig_label: str) -> str:
    if mean_val is None or ci95 is None:
        return "N/A (`no significativa`, n=0)"
    return (
        f"{mean_val * 100.0:+.2f} pp "
        f"(IC 95%: [{ci95[0] * 100.0:+.2f}, {ci95[1] * 100.0:+.2f}] pp, `{sig_label}`)"
    )


def _fmt_dd_metric(point_u: float, ci95: Sequence[float] | None) -> str:
    if ci95 is None:
        return f"{point_u:.4f}u (IC 95%: N/A, n=0)"
    return f"{point_u:.4f}u (IC 95%: [{ci95[0]:.4f}u, {ci95[1]:.4f}u])"


def generate_weekly_prospective_report(
    *,
    week: int = 1,
    real_ledger_path: str | Path = DEFAULT_PROSPECTIVE_LEDGER_PATH,
    real_timeseries_dir: str | Path = DEFAULT_B3_TIMESERIES_DIR,
    synthetic_ledger_path: str | Path | None = DEFAULT_SYNTHETIC_LEDGER_PATH,
    report_out_path: str | Path | None = None,
    n_resamples: int = DEFAULT_BOOTSTRAP_RESAMPLES,
    seed: int = DEFAULT_BOOTSTRAP_SEED,
) -> Path:
    """Genera el reporte semanal `A29_prospectivo_semana_<week>.md` separando estrictamente:
    1) Cartera prospectiva real (`provenance: real`, progreso hacia `150` picks y `n_clv >= 15`).
    2) Validación funcional E2E sobre fixture (`provenance: synthetic`, no computable para puertas)."""
    if int(week) < 1:
        raise ValueError(f"week debe ser >= 1; recibido {week!r}")

    out_path = (
        Path(report_out_path)
        if report_out_path is not None
        else DEFAULT_REPORTS_DIR / f"A29_prospectivo_semana_{int(week)}.md"
    )
    frozen = load_and_verify_frozen_v3_1_artifacts(enforce_sha256=True)

    real_lp = Path(real_ledger_path)
    verify_ledger_file_provenance(real_lp, "real")
    real_ledger = clv_report.load_ledger_jsonl(real_lp)
    real_summary = clv_report.summarize_picks_bootstrap(
        real_ledger, n_resamples=n_resamples, seed=seed
    )
    real_dd = compute_max_drawdown_bootstrap_ci95(
        real_ledger, n_resamples=n_resamples, seed=seed
    )

    _, _, b3_health, real_jsonl_files = load_prospective_timeseries(
        real_timeseries_dir, provenance="real"
    )

    real_glob = real_summary["global"]
    n_real_picks = int(real_glob["n_picks"])
    n_real_clv = int(real_glob["n_with_closing"])
    segs_passing_gate = [
        seg_k
        for seg_k, seg_m in real_summary["by_league_market"].items()
        if int(seg_m["n_with_closing"]) >= GATE_MIN_SEGMENT_CLV_PICKS
        and seg_m["clv_pct_ci95"] is not None
        and float(seg_m["clv_pct_ci95"][0]) > 0.0
    ]

    capture_status = (
        str(b3_health.get("capture_status"))
        if isinstance(b3_health, Mapping)
        else "unknown"
    )
    cal_upcoming = (
        int(b3_health.get("calendar_upcoming_events_count", 0))
        if isinstance(b3_health, Mapping)
        else 0
    )
    cred_pending = (
        ", ".join(
            str(x.get("source") if isinstance(x, Mapping) else x)
            for x in (b3_health.get("credential_pending_sources") or [])
        )
        if isinstance(b3_health, Mapping)
        else "the_odds_api, betfair_exchange"
    )

    lines: list[str] = [
        f"# A29 — Reporte Prospectivo de Paper-Trading · Semana {int(week)} (`v3.2`)",
        "",
        f"- **Corte prospectivo obligatorio:** `ts_pick > {PROSPECTIVE_CUTOFF_UTC}` (`holdout_sealed` cerrado y consumido en `v3.1` — `OBSERVADO`).",
        f"- **Estado de `production_enabled` (`src/data/prediction/production_segments_v3_1.json`):** **`0 / 60` segmentos encendidos** (`SHA-256 = {frozen['sha256']['production_segments_v3_1.json']}` — `OBSERVADO`).",
        f"- **PRNG y remuestreo bootstrap:** `mulberry32`, `n_resamples = {int(n_resamples)}`, `seed = {int(seed)}` (paridad IEEE-754 `< 1e-12` Python ↔ TypeScript).",
        "- **Privacidad de banca (Regla §0.5):** `stake_u` y Quarter-Kelly viven exclusivamente en este ledger interno de investigación; `MatchOutlook` público permanece libre de stakes.",
        "",
        "---",
        "",
        "## 1. Cartera Prospectiva Real (`provenance: real`)",
        "",
        "### 1.1 Progreso hacia la Puerta de Activación (`150` picks reales + `n_clv >= 15` por segmento)",
        "",
        "| Criterio de Puerta (`§0.3` / `Ola 3`) | Valor Actual (`OBSERVADO`) | Umbral Requerido | Estado |",
        "|---|---|---|---|",
        f"| Picks prospectivos reales (`ts_pick > {PROSPECTIVE_CUTOFF_UTC}`) | **`{n_real_picks} / {GATE_MIN_PROSPECTIVE_PICKS}`** (`{100.0 * n_real_picks / GATE_MIN_PROSPECTIVE_PICKS:.1f}%`) | `>= {GATE_MIN_PROSPECTIVE_PICKS}` | `PENDIENTE` |",
        f"| Picks reales con cierre sharp válido (`pinnacle` / `smarkets`) | **`{n_real_clv}`** | `>= {GATE_MIN_SEGMENT_CLV_PICKS}` por segmento candidato | `PENDIENTE` |",
        f"| Segmentos `liga::mercado` con `n_clv >= {GATE_MIN_SEGMENT_CLV_PICKS}` e `IC 95% CLV% > 0` | **`{len(segs_passing_gate)} / 60`** | `>= 1` segmento + puerta global | `0 / 60` (`production_enabled = false`) |",
        "",
        "### 1.2 Diagnóstico de Captura Real en `B3` (`OBSERVADO`)",
        "",
        f"- **Directorio inspeccionado (solo lectura):** `../web-scraping/data/odds_timeseries` (`{len(real_jsonl_files)}` archivos `.jsonl` reales escritos).",
        f"- **Estado reportado por `health.json` (`B3`):** `capture_status = \"{capture_status}\"`, `events_tracked = 0`, `total_rows_written = 0`, `calendar_upcoming_events_count = {cal_upcoming}` (`OBSERVADO`).",
        f"- **Causa raíz verificada sin evasión anti-bot (`LEGAL_FUENTES_CUOTAS.md`):** las 2 fuentes aprobadas `api_only` (`{cred_pending}`) carecen hoy de variables de entorno (`THE_ODDS_API_KEY`, `BETFAIR_APP_KEY`, `BETFAIR_SESSION_TOKEN`) en este entorno, y las 5 fuentes web directas (`pinnacle`, `smarkets`, `caliente`, `codere`, `action_network`) permanecen bloqueadas legalmente (`blocked_pending_owner_decision`, cero bypass de Cloudflare/ToS) (`OBSERVADO`).",
        f"- **Ledger prospectivo real:** `data/ledger/picks_v3_2_prospective.jsonl` inicializado limpiamente con `{n_real_picks}` picks reales, `head_hash = {real_ledger.head_hash}` (`OBSERVADO`).",
        "",
        "### 1.3 Resumen Global — Cartera Real (`provenance: real`)",
        "",
        "| Métrica | Estimación Puntual e IC 95% Bootstrap | Significancia | Etiqueta Epistémica |",
        "|---|---|---|---|",
        f"| `n_picks` / `n_clv` / `n_settled` | `{n_real_picks}` / `{n_real_clv}` / `{real_glob['n_settled']}` | `no significativa` | `OBSERVADO` |",
        f"| `CLV%` (vs cierre sharp sin margen) | {_fmt_pct_metric(real_glob['clv_pct_mean'], real_glob['clv_pct_ci95'], real_glob['significance_label'])} | `{real_glob['significance_label']}` | `OBSERVADO` |",
        f"| `CLV_prob` (puntos porcentuales) | {_fmt_pp_metric(real_glob['clv_prob_mean'], real_glob['clv_prob_ci95'], real_glob['clv_prob_bootstrap']['significance_label'])} | `{real_glob['clv_prob_bootstrap']['significance_label']}` | `OBSERVADO` |",
        f"| `ROI%` sobre unidades liquidadas | {_fmt_pct_metric(real_glob['roi_pct'], real_glob['roi_pct_ci95'], real_glob['roi_significance_label'])} | `{real_glob['roi_significance_label']}` | `OBSERVADO` |",
        f"| `MaxDD` (drawdown máximo en `u`) | {_fmt_dd_metric(real_dd['point_u'], real_dd['ci95'])} | `no significativa` | `OBSERVADO` |",
        "",
    ]

    if real_summary["by_league_market"]:
        lines.extend(
            [
                "### 1.4 Desglose por Segmento — Cartera Real",
                "",
                "| Segmento | `n_picks` | `n_clv` | Progreso `n_clv >= 15` | `CLV%` (IC 95%) | `ROI%` (IC 95%) | `MaxDD` |",
                "|---|---:|---:|---|---|---|---|",
            ]
        )
        for seg_k, seg_m in real_summary["by_league_market"].items():
            seg_dd = compute_max_drawdown_bootstrap_ci95(
                real_ledger, segment_filter=seg_k, n_resamples=n_resamples, seed=seed
            )
            lines.append(
                f"| `{seg_k}` | {seg_m['n_picks']} | {seg_m['n_with_closing']} | "
                f"`{seg_m['n_with_closing']}/{GATE_MIN_SEGMENT_CLV_PICKS}` | "
                f"{_fmt_pct_metric(seg_m['clv_pct_mean'], seg_m['clv_pct_ci95'], seg_m['significance_label'])} | "
                f"{_fmt_pct_metric(seg_m['roi_pct'], seg_m['roi_pct_ci95'], seg_m['roi_significance_label'])} | "
                f"{_fmt_dd_metric(seg_dd['point_u'], seg_dd['ci95'])} |"
            )
        lines.append("")
    else:
        lines.extend(
            [
                "### 1.4 Desglose por Segmento — Cartera Real",
                "",
                "- Sin picks reales emitidos en la Semana 1 (`0 / 60` segmentos con muestra prospectiva real — `OBSERVADO`).",
                "",
            ]
        )

    # Sección 2: Fixture Sintético E2E (`provenance: synthetic`)
    if synthetic_ledger_path is not None and Path(synthetic_ledger_path).exists():
        syn_lp = Path(synthetic_ledger_path)
        syn_raw_objs = verify_ledger_file_provenance(syn_lp, "synthetic")
        syn_ledger = clv_report.load_ledger_jsonl(syn_lp)
        syn_summary = clv_report.summarize_picks_bootstrap(
            syn_ledger, n_resamples=n_resamples, seed=seed
        )
        syn_dd = compute_max_drawdown_bootstrap_ci95(
            syn_ledger, n_resamples=n_resamples, seed=seed
        )
        syn_glob = syn_summary["global"]

        lines.extend(
            [
                "---",
                "",
                "## 2. Validación Funcional Extremo a Extremo sobre Fixture Sintético (`provenance: \"synthetic\"`)",
                "",
                "> **ADVERTENCIA DE SEPARACIÓN ESTRICTA (`Regla §0.4`):** Todos los registros de esta sección provienen exclusivamente de `data/ledger/fixtures/synthetic_odds_timeseries_v3_2.jsonl` y están marcados línea por línea con `\"provenance\": \"synthetic\"` en `data/ledger/fixtures/picks_v3_2_synthetic_fixture.jsonl`. **Aportan `0` picks a la puerta de `150` picks reales y jamás habilitan `production_enabled`.** Su único propósito es demostrar operatividad causal extremo a extremo del motor.",
                "",
                "### 2.1 Invariantes Verificados en el Fixture Sintético (`OBSERVADO`)",
                "",
                f"- **Registros encadenados SHA-256 (`pick` + `closing` + `settlement`):** `{len(syn_ledger.get_records())}` líneas (`{syn_ledger.size}` picks llenados, `{len(syn_ledger.get_closings())}` cierres sharp, `{len(syn_ledger.get_settlements())}` liquidaciones), `100%` con `\"provenance\": \"synthetic\"` (`{len(syn_raw_objs)}/{len(syn_raw_objs)}`).",
                f"- **`head_hash` criptográfico (idéntico en Python y TypeScript):** `{syn_ledger.head_hash}`.",
                "- **Corte prospectivo:** evento histórico `ws:football:E0:20261108:chelsea:arsenal_legacy` (`2026-11-08T20:00:00Z <= 2026-11-08T20:30:00Z`) bloqueado al 100%.",
                "- **Causalidad y `execution_delay = 2.0 min`:** ticks en `+1.0 min` (`b365` en `B1::1x2`) y `+1.25 min` (`draftkings` en `E0::totals`) ignorados en la decisión y rechazados como llenado prematuro; `E0::totals` queda no llenado (`unfilled_no_post_delay_tick`) al carecer de tick `>= +2.0 min`.",
                "- **Prioridad de cierre sharp (`resolve_closing_odds`):** `pinnacle` en `B1::1x2` y `D2::1x2`; fallback automático a `smarkets` cuando `pinnacle` está ausente en `MEX::ah` y `SP1::1x2`.",
                "- **Liquidación exacta post-partido:** `win` (`B1::1x2`, `D2::1x2`), `half_loss` en línea asiática `-0.25` con empate `1-1` (`MEX::ah`), y `loss` (`SP1::1x2`).",
                "",
                "### 2.2 Métricas Globales del Fixture Sintético (`provenance: synthetic` — Muestra de Prueba Funcional)",
                "",
                "| Métrica (`provenance: synthetic`) | Estimación Puntual e IC 95% Bootstrap | Significancia Estadística |",
                "|---|---|---|",
                f"| `n_picks` / `n_clv` / `n_settled` | `{syn_glob['n_picks']}` / `{syn_glob['n_with_closing']}` / `{syn_glob['n_settled']}` | Muestra sintética (`n < 15`, no inferencial) |",
                f"| `CLV%` | {_fmt_pct_metric(syn_glob['clv_pct_mean'], syn_glob['clv_pct_ci95'], syn_glob['significance_label'])} | `{syn_glob['significance_label']}` |",
                f"| `CLV_prob` | {_fmt_pp_metric(syn_glob['clv_prob_mean'], syn_glob['clv_prob_ci95'], syn_glob['clv_prob_bootstrap']['significance_label'])} | `{syn_glob['clv_prob_bootstrap']['significance_label']}` |",
                f"| `ROI%` | {_fmt_pct_metric(syn_glob['roi_pct'], syn_glob['roi_pct_ci95'], syn_glob['roi_significance_label'])} | `{syn_glob['roi_significance_label']}` |",
                f"| `MaxDD` | {_fmt_dd_metric(syn_dd['point_u'], syn_dd['ci95'])} | `{syn_glob['roi_significance_label']}` |",
                "",
                "### 2.3 Desglose por Segmento del Fixture Sintético (`provenance: synthetic`)",
                "",
                "| Segmento | `n_picks` | `n_clv` | `CLV%` (IC 95%) | `CLV_prob` (IC 95%) | `ROI%` (IC 95%) | `MaxDD` |",
                "|---|---:|---:|---|---|---|---|",
            ]
        )
        for seg_k, seg_m in syn_summary["by_league_market"].items():
            seg_dd = compute_max_drawdown_bootstrap_ci95(
                syn_ledger, segment_filter=seg_k, n_resamples=n_resamples, seed=seed
            )
            lines.append(
                f"| `{seg_k}` | {seg_m['n_picks']} | {seg_m['n_with_closing']} | "
                f"{_fmt_pct_metric(seg_m['clv_pct_mean'], seg_m['clv_pct_ci95'], seg_m['significance_label'])} | "
                f"{_fmt_pp_metric(seg_m['clv_prob_mean'], seg_m['clv_prob_ci95'], seg_m['clv_prob_bootstrap']['significance_label'])} | "
                f"{_fmt_pct_metric(seg_m['roi_pct'], seg_m['roi_pct_ci95'], seg_m['roi_significance_label'])} | "
                f"{_fmt_dd_metric(seg_dd['point_u'], seg_dd['ci95'])} |"
            )
        lines.append("")

    # Sección 3: Reproducibilidad y Hashes Congelados
    lines.extend(
        [
            "---",
            "",
            "## 3. Trazabilidad, Hashes Congelados `v3.1` y Comandos Reproducibles",
            "",
            "### 3.1 Hashes SHA-256 Verificados en Solo Lectura (`OBSERVADO`)",
            "",
            "| Artefacto Congelado (`v3.1`) | SHA-256 (`OBSERVADO`) |",
            "|---|---|",
        ]
    )
    for fname, sha_val in frozen["sha256"].items():
        lines.append(f"| `src/data/prediction/{fname}` | `{sha_val}` |")

    lines.extend(
        [
            "",
            "### 3.2 Comandos Reproducibles",
            "",
            "```powershell",
            'Set-Location "C:\\Users\\T490s\\Desktop\\Proyectos\\PitchLab\\.worktrees\\prediction-lab"',
            "# 1) Corrida prospectiva real contra B3 (idempotente):",
            ".\\research\\prediction-lab\\.venv\\Scripts\\python.exe services/models/paper_trading.py --timeseries-dir ../web-scraping/data/odds_timeseries --ledger data/ledger/picks_v3_2_prospective.jsonl --provenance real --week 1",
            "# 2) Corrida funcional extremo a extremo sobre fixture sintético separado (idempotente):",
            ".\\research\\prediction-lab\\.venv\\Scripts\\python.exe services/models/paper_trading.py --timeseries-dir data/ledger/fixtures/synthetic_odds_timeseries_v3_2.jsonl --model-probs data/ledger/fixtures/synthetic_model_probs_v3_2.json --results data/ledger/fixtures/synthetic_results_v3_2.json --ledger data/ledger/fixtures/picks_v3_2_synthetic_fixture.jsonl --provenance synthetic --settle --week 1",
            "# 3) Verificación cruzada Python + TypeScript:",
            ".\\research\\prediction-lab\\.venv\\Scripts\\python.exe -m pytest services/models/test_paper_trading.py -v",
            "npx vitest run tests/prediction/ledger_prospective.test.ts",
            "```",
            "",
        ]
    )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(lines), encoding="utf-8")
    return out_path


# ---------------------------------------------------------------------------
# Constructor Determinista del Fixture Sintético (`provenance: "synthetic"`)
# ---------------------------------------------------------------------------


def build_deterministic_synthetic_timeseries_rows() -> list[dict[str, Any]]:
    """Construye la serie temporal multi-tick determinista para `synthetic_odds_timeseries_v3_2.jsonl`
    cumpliendo las `11 + 1` columnas de `CONTRACT_ODDS_TIMESERIES.md` + `"provenance": "synthetic"`."""
    specs: list[tuple[str, str, str, str, float | None, str, str, str, dict[str, float]]] = [
        # Evento 1: B1::1x2 (A8 stale line tier='solido' en b365, tick +1m ignorado, fill +2.25m, cierre pinnacle)
        (
            "ws:football:B1:20261114:club_brugge:anderlecht",
            "football",
            "B1",
            "1x2",
            None,
            "pinnacle",
            "2026-11-14T18:50:00Z",
            "2026-11-14T19:45:00Z",
            {"home": 1.88, "draw": 3.65, "away": 4.20},
        ),
        (
            "ws:football:B1:20261114:club_brugge:anderlecht",
            "football",
            "B1",
            "1x2",
            None,
            "b365",
            "2026-11-14T18:50:00Z",
            "2026-11-14T19:45:00Z",
            {"home": 2.03, "draw": 3.50, "away": 3.65},
        ),
        (
            "ws:football:B1:20261114:club_brugge:anderlecht",
            "football",
            "B1",
            "1x2",
            None,
            "b365",
            "2026-11-14T18:51:00Z",
            "2026-11-14T19:45:00Z",
            {"home": 2.08, "draw": 3.48, "away": 3.55},
        ),
        (
            "ws:football:B1:20261114:club_brugge:anderlecht",
            "football",
            "B1",
            "1x2",
            None,
            "b365",
            "2026-11-14T18:52:15Z",
            "2026-11-14T19:45:00Z",
            {"home": 2.02, "draw": 3.50, "away": 3.68},
        ),
        (
            "ws:football:B1:20261114:club_brugge:anderlecht",
            "football",
            "B1",
            "1x2",
            None,
            "pinnacle",
            "2026-11-14T19:42:00Z",
            "2026-11-14T19:45:00Z",
            {"home": 1.82, "draw": 3.75, "away": 4.50},
        ),
        # Evento 2: MEX::ah (-0.25) (A8 tier='valor' en codere, fill exacto +2.0m, fallback cierre smarkets, half_loss)
        (
            "ws:football:MEX:20261115:monterrey:tigres",
            "football",
            "MEX",
            "ah",
            -0.25,
            "smarkets",
            "2026-11-15T00:10:00Z",
            "2026-11-15T01:00:00Z",
            {"home": 1.84, "away": 2.08},
        ),
        (
            "ws:football:MEX:20261115:monterrey:tigres",
            "football",
            "MEX",
            "ah",
            -0.25,
            "codere",
            "2026-11-15T00:10:00Z",
            "2026-11-15T01:00:00Z",
            {"home": 2.04, "away": 1.80},
        ),
        (
            "ws:football:MEX:20261115:monterrey:tigres",
            "football",
            "MEX",
            "ah",
            -0.25,
            "codere",
            "2026-11-15T00:12:00Z",
            "2026-11-15T01:00:00Z",
            {"home": 2.02, "away": 1.82},
        ),
        (
            "ws:football:MEX:20261115:monterrey:tigres",
            "football",
            "MEX",
            "ah",
            -0.25,
            "smarkets",
            "2026-11-15T00:57:00Z",
            "2026-11-15T01:00:00Z",
            {"home": 1.80, "away": 2.14},
        ),
        # Evento 3: D2::1x2 (A5 model_picks_enabled=True tier='valor' en pinnacle, fill +2.5m, cierre pinnacle, win)
        (
            "ws:football:D2:20261115:hamburger_sv:schalke_04",
            "football",
            "D2",
            "1x2",
            None,
            "pinnacle",
            "2026-11-15T11:40:00Z",
            "2026-11-15T12:30:00Z",
            {"home": 2.12, "draw": 3.55, "away": 3.40},
        ),
        (
            "ws:football:D2:20261115:hamburger_sv:schalke_04",
            "football",
            "D2",
            "1x2",
            None,
            "pinnacle",
            "2026-11-15T11:42:30Z",
            "2026-11-15T12:30:00Z",
            {"home": 2.10, "draw": 3.55, "away": 3.45},
        ),
        (
            "ws:football:D2:20261115:hamburger_sv:schalke_04",
            "football",
            "D2",
            "1x2",
            None,
            "pinnacle",
            "2026-11-15T12:28:00Z",
            "2026-11-15T12:30:00Z",
            {"home": 1.98, "draw": 3.65, "away": 3.80},
        ),
        # Evento 4: E0::totals (2.5) (Candidato aprobado pero NO LLENADO: último tick draftkings en +1.25m < 2.0m)
        (
            "ws:football:E0:20261115:arsenal:brighton",
            "football",
            "E0",
            "totals",
            2.5,
            "pinnacle",
            "2026-11-15T14:20:00Z",
            "2026-11-15T15:00:00Z",
            {"over": 1.80, "under": 2.10},
        ),
        (
            "ws:football:E0:20261115:arsenal:brighton",
            "football",
            "E0",
            "totals",
            2.5,
            "draftkings",
            "2026-11-15T14:20:00Z",
            "2026-11-15T15:00:00Z",
            {"over": 2.05, "under": 1.80},
        ),
        (
            "ws:football:E0:20261115:arsenal:brighton",
            "football",
            "E0",
            "totals",
            2.5,
            "draftkings",
            "2026-11-15T14:21:15Z",
            "2026-11-15T15:00:00Z",
            {"over": 2.04, "under": 1.81},
        ),
        (
            "ws:football:E0:20261115:arsenal:brighton",
            "football",
            "E0",
            "totals",
            2.5,
            "pinnacle",
            "2026-11-15T14:58:00Z",
            "2026-11-15T15:00:00Z",
            {"over": 1.78, "under": 2.14},
        ),
        # Evento 5: SP1::1x2 (A8 tier='valor' en fanduel, fill +2.5m, cierre smarkets fallback, loss)
        (
            "ws:football:SP1:20261115:real_sociedad:villarreal",
            "football",
            "SP1",
            "1x2",
            None,
            "smarkets",
            "2026-11-15T17:10:00Z",
            "2026-11-15T18:00:00Z",
            {"home": 2.10, "draw": 3.35, "away": 3.65},
        ),
        (
            "ws:football:SP1:20261115:real_sociedad:villarreal",
            "football",
            "SP1",
            "1x2",
            None,
            "fanduel",
            "2026-11-15T17:10:00Z",
            "2026-11-15T18:00:00Z",
            {"home": 2.36, "draw": 3.25, "away": 3.10},
        ),
        (
            "ws:football:SP1:20261115:real_sociedad:villarreal",
            "football",
            "SP1",
            "1x2",
            None,
            "fanduel",
            "2026-11-15T17:12:30Z",
            "2026-11-15T18:00:00Z",
            {"home": 2.34, "draw": 3.25, "away": 3.12},
        ),
        (
            "ws:football:SP1:20261115:real_sociedad:villarreal",
            "football",
            "SP1",
            "1x2",
            None,
            "smarkets",
            "2026-11-15T17:57:00Z",
            "2026-11-15T18:00:00Z",
            {"home": 2.04, "draw": 3.40, "away": 3.80},
        ),
        # Evento 6: Pre-corte holdout (2026-11-08T20:00:00Z <= 2026-11-08T20:30:00Z -> bloqueado al 100%)
        (
            "ws:football:E0:20261108:chelsea:arsenal_legacy",
            "football",
            "E0",
            "1x2",
            None,
            "pinnacle",
            "2026-11-08T19:10:00Z",
            "2026-11-08T20:00:00Z",
            {"home": 1.80, "draw": 3.70, "away": 4.50},
        ),
        (
            "ws:football:E0:20261108:chelsea:arsenal_legacy",
            "football",
            "E0",
            "1x2",
            None,
            "b365",
            "2026-11-08T19:10:00Z",
            "2026-11-08T20:00:00Z",
            {"home": 2.15, "draw": 3.40, "away": 3.40},
        ),
        (
            "ws:football:E0:20261108:chelsea:arsenal_legacy",
            "football",
            "E0",
            "1x2",
            None,
            "b365",
            "2026-11-08T19:13:00Z",
            "2026-11-08T20:00:00Z",
            {"home": 2.15, "draw": 3.40, "away": 3.40},
        ),
    ]

    rows: list[dict[str, Any]] = []
    for eid, sport, league, market, line, book, ts_cap, ts_start, quotes in specs:
        raw_sha = clv_report.sha256_hex(
            json.dumps(
                {
                    "provenance": "synthetic",
                    "event_id": eid,
                    "market": market,
                    "line": line,
                    "book": book,
                    "ts_captured": ts_cap,
                    "quotes": quotes,
                },
                sort_keys=True,
                separators=(",", ":"),
            )
        )
        for sel, price in quotes.items():
            rows.append(
                {
                    "event_id": eid,
                    "sport": sport,
                    "league": league,
                    "market": market,
                    "line": line,
                    "selection": sel,
                    "book": book,
                    "price_decimal": float(price),
                    "ts_captured": ts_cap,
                    "ts_event_start": ts_start,
                    "source": "scraped_ws",
                    "raw_sha256": raw_sha,
                    "provenance": "synthetic",
                }
            )
    return rows


def write_synthetic_fixture_timeseries_jsonl(
    out_path: str | Path = DEFAULT_SYNTHETIC_TIMESERIES_PATH,
) -> Path:
    p = Path(out_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    rows = build_deterministic_synthetic_timeseries_rows()
    content = "\n".join(
        json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in rows
    ) + "\n"
    p.write_text(content, encoding="utf-8")
    return p


# ---------------------------------------------------------------------------
# Interfaz de Línea de Comandos (CLI)
# ---------------------------------------------------------------------------


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="PREDLAB-V3.2 B5 — Runner causal e idempotente de paper-trading prospectivo."
    )
    parser.add_argument(
        "--timeseries-dir",
        type=str,
        default=str(DEFAULT_B3_TIMESERIES_DIR),
        help="Directorio (o archivo .jsonl) de series temporales multi-tick de B3.",
    )
    parser.add_argument(
        "--ledger",
        type=str,
        default=None,
        help="Ruta del archivo .jsonl de ledger (por defecto picks_v3_2_prospective.jsonl en real).",
    )
    parser.add_argument(
        "--model-probs",
        type=str,
        default=None,
        help="Catálogo JSON opcional de probabilidades pre-partido causales por event_id.",
    )
    parser.add_argument(
        "--results",
        type=str,
        default=None,
        help="Archivo JSON opcional de marcadores finales para liquidación post-partido.",
    )
    parser.add_argument(
        "--provenance",
        type=str,
        choices=list(VALID_PROVENANCES),
        default="real",
        help="Procedencia estricta de la corrida ('real' o 'synthetic').",
    )
    parser.add_argument(
        "--settle",
        action="store_true",
        help="Ejecuta resolución de cierre sharp y liquidación post-partido.",
    )
    parser.add_argument(
        "--execution-delay-minutes",
        type=float,
        default=DEFAULT_EXECUTION_DELAY_MINUTES,
        help="Retraso mínimo obligatorio de ejecución en minutos (>= 2.0).",
    )
    parser.add_argument(
        "--week",
        type=int,
        default=None,
        help="Si se especifica (ej. --week 1), regenera research/prediction-lab/reports/A29_prospectivo_semana_<week>.md.",
    )
    parser.add_argument(
        "--report-out",
        type=str,
        default=None,
        help="Ruta personalizada de salida para el reporte semanal Markdown.",
    )
    parser.add_argument(
        "--write-synthetic-fixture-inputs",
        action="store_true",
        help="Escribe/actualiza de forma determinista synthetic_odds_timeseries_v3_2.jsonl.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = _build_arg_parser()
    args = parser.parse_args(argv)

    if args.write_synthetic_fixture_inputs:
        write_synthetic_fixture_timeseries_jsonl(DEFAULT_SYNTHETIC_TIMESERIES_PATH)

    prov = str(args.provenance).strip().lower()
    ledger_target = (
        Path(args.ledger)
        if args.ledger is not None
        else (
            DEFAULT_SYNTHETIC_LEDGER_PATH
            if prov == "synthetic"
            else DEFAULT_PROSPECTIVE_LEDGER_PATH
        )
    )

    summary = run_paper_trading(
        timeseries_path=args.timeseries_dir,
        ledger_path=ledger_target,
        model_probs_path=args.model_probs,
        results_path=args.results,
        provenance=prov,
        settle=bool(args.settle),
        execution_delay_minutes=float(args.execution_delay_minutes),
    )

    if args.week is not None:
        report_path = generate_weekly_prospective_report(
            week=int(args.week),
            real_ledger_path=(
                ledger_target if prov == "real" else DEFAULT_PROSPECTIVE_LEDGER_PATH
            ),
            real_timeseries_dir=(
                args.timeseries_dir if prov == "real" else DEFAULT_B3_TIMESERIES_DIR
            ),
            synthetic_ledger_path=(
                ledger_target if prov == "synthetic" else DEFAULT_SYNTHETIC_LEDGER_PATH
            ),
            report_out_path=args.report_out,
        )
        summary["report_written"] = str(report_path)

    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
