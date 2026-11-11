"""Evaluación Única Reproducible del Holdout Sellado (`v3.1`) — Agente `a10-holdout`.

Reglas de Gobernanza Científica (NO NEGOCIABLES):
1. Antes de desbloquear `unlock_holdout=True`, consolida de forma determinista e idempotente
   las `24` corridas `run_backtest` ejecutadas sobre `walk_forward_dev` en Olas 1–3
   (`holdout_trial_registry.jsonl` [9] + `holdout_registry_a6.jsonl` [4] +
   `holdout_registry_a7.jsonl` [4] + `holdout_registry_a8.jsonl` [7]), más la línea base
   integrada pre-holdout (`walk_forward_dev`, `unlock_holdout=False` -> `25` corridas pre-holdout).
2. Evalúa UNA SOLA VEZ cada configuración congelada sobre `eval_split="holdout_sealed"`
   (`14,163` eventos `>= 2025-02-02T17:30:00+00:00`), con `execution_delay_minutes=2.0`,
   `historical_delay_alpha=0.05`, `bootstrap_samples=1000`, `seed=20261111`, sin re-ajustar
   jamás ningún parámetro tras observar el holdout:
   - Fase 0: Línea Base `v3.0` (`Geodesic v2.0`, congelada en `a852528`).
   - Fase 1 (Ola 2): Política de Picks `v3.1` (`A4 + A5`, `blend_weights_v3_1.json` +
     `pick_policy_v3_1.json` congelados en `5b3df2c` y `ce348e0`), con desglose exacto
     `model_driven` vs `sharp_arb` y por nivel `solido` / `valor`.
   - Fase 2a (Ola 3 — A8): Detector de Líneas Rezagadas Doble Confirmación (`stale_lines_config.json`,
     congelado en `700dd24`).
   - Fase 2b (Sistema Integrado Final `v3.1` — `A4 + A5 + A8`): Combina `A4 + A5` en los `12/60`
     segmentos con ventaja de modelo (`model_picks_enabled=True`) + `A8` Doble Confirmación en
     cuotas recreativas rezagadas, con `A6` DC puro (`0/92`) desactivado y `A7` GBM
     (`production_activated=False`) apagado, respetando estrictamente los 4 topes duros
     (`2.0u` pick, `2.0u` evento, `3.0u` liga-día, `5.0u` día global) y correlación intra-evento
     `(1 - 0.35)^k`.
3. Construye la tabla completa `liga × mercado` en `walk_forward_dev` y `holdout_sealed` y
   materializa `src/data/prediction/production_segments_v3_1.json` activando (`production_enabled=True`)
   ÚNICAMENTE los segmentos que demuestran `CLV% > 0` con IC 95% bootstrap válido que NO cruza 0
   en el `holdout_sealed`.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import sys
import tempfile
from typing import Any, Mapping, Sequence

import numpy as np
import pandas as pd
from scipy.special import ndtr, ndtri

MODELS_DIR = Path(__file__).resolve().parent
WORKTREE_ROOT = MODELS_DIR.parent.parent
PRED_LAB_ROOT = WORKTREE_ROOT / "research" / "prediction-lab"

if str(MODELS_DIR) not in sys.path:
    sys.path.insert(0, str(MODELS_DIR))

import backtest as bt  # noqa: E402
import blend_calibration as bc  # noqa: E402
import clv_report  # noqa: E402
import picks_engine as pe  # noqa: E402
import stale_lines as sl  # noqa: E402

ARTIFACTS_DIR = MODELS_DIR / "artifacts"
TS_DATA_DIR = WORKTREE_ROOT / "src" / "data" / "prediction"

DEFAULT_SEALED_EVAL_JSON = ARTIFACTS_DIR / "sealed_holdout_v3_1_eval.json"
DEFAULT_CONSOLIDATED_REGISTRY_JSONL = ARTIFACTS_DIR / "holdout_trial_registry.jsonl"
DEFAULT_PRODUCTION_SEGMENTS_JSON = TS_DATA_DIR / "production_segments_v3_1.json"

BLEND_WEIGHTS_JSON = ARTIFACTS_DIR / "blend_weights_v3_1.json"
PICK_POLICY_JSON = TS_DATA_DIR / "pick_policy_v3_1.json"
OLA2_DEV_JSON = ARTIFACTS_DIR / "ola2_picks_backtest_dev.json"
MARKETS_2WAY_EVAL_JSON = ARTIFACTS_DIR / "markets_2way_eval.json"
GBM_EVAL_JSON = ARTIFACTS_DIR / "gbm_eval_v3_1.json"
STALE_LINES_REPORT_JSON = ARTIFACTS_DIR / "stale_lines_report.json"
STALE_LINES_CONFIG_JSON = TS_DATA_DIR / "stale_lines_config.json"

REGISTRY_A6_JSONL = ARTIFACTS_DIR / "holdout_registry_a6.jsonl"
REGISTRY_A7_JSONL = ARTIFACTS_DIR / "holdout_registry_a7.jsonl"
REGISTRY_A8_JSONL = ARTIFACTS_DIR / "holdout_registry_a8.jsonl"

DEFAULT_SEED = 20261111
DEFAULT_BOOTSTRAP_SAMPLES = 1000
DEFAULT_EXECUTION_DELAY_MINUTES = 2.0
DEFAULT_HISTORICAL_DELAY_ALPHA = 0.05

# Mismo umbral mínimo de muestra pre-registrado en `picks_engine.py:2235` para evitar falsos positivos
# por degeneración de soporte discreto del bootstrap en muestras diminutas (`n < 15`).
MIN_SEGMENT_PICKS_FOR_VALID_CI95 = 15

A5_EXEC_BOOKS_PRIORITY: tuple[str, ...] = (
    "caliente",
    "codere",
    "b365",
    "bw",
    "wh",
    "pinnacle",
    "smarkets",
)
A8_EXEC_BOOKS_PRIORITY: tuple[str, ...] = (
    "caliente",
    "codere",
    "b365",
    "bw",
    "wh",
    "draftkings",
    "fanduel",
    "betmgm",
    "betrivers",
)
INTEGRATED_EXEC_BOOKS_PRIORITY: tuple[str, ...] = (
    "caliente",
    "codere",
    "b365",
    "bw",
    "wh",
    "pinnacle",
    "smarkets",
    "draftkings",
    "fanduel",
    "betmgm",
    "betrivers",
)
RELEVANT_ALL_BOOKS: frozenset[str] = frozenset(
    {
        "pinnacle",
        "smarkets",
        "b365",
        "caliente",
        "codere",
        "bw",
        "wh",
        "draftkings",
        "fanduel",
        "betmgm",
        "betrivers",
        "avg",
        "nflverse",
    }
)


def _canonical_portfolio_market(market: str) -> str:
    m = str(market or "").strip().lower()
    if m in ("ou", "over_under", "total", "totals"):
        return "totals"
    return bt.canonical_market(m)


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(f"No existe el archivo de registro requerido: {path}")
    out: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            s = line.strip()
            if s:
                out.append(json.loads(s))
    return out


def consolidate_pre_holdout_trial_registries(
    out_registry_path: Path = DEFAULT_CONSOLIDATED_REGISTRY_JSONL,
) -> dict[str, Any]:
    """Consolida de forma idempotente las `24` corridas `run_backtest` de Olas 1–3 antes de abrir el holdout."""
    raw_main = _read_jsonl(out_registry_path)
    # Filtrar solo las 9 corridas originales de Olas 1–2 para garantizar idempotencia si se re-ejecuta el script
    olas_1_2: list[dict[str, Any]] = []
    for entry in raw_main:
        src_reg = entry.get("source_registry")
        ph = str(entry.get("phase", ""))
        if src_reg is not None:
            if src_reg == "holdout_trial_registry.jsonl" and (ph.startswith("ola1_") or ph.startswith("ola2_")):
                olas_1_2.append(entry)
        elif ph.startswith("ola1_") or ph.startswith("ola2_"):
            olas_1_2.append(entry)

    raw_a6 = _read_jsonl(REGISTRY_A6_JSONL)
    raw_a7 = _read_jsonl(REGISTRY_A7_JSONL)
    raw_a8 = _read_jsonl(REGISTRY_A8_JSONL)

    if len(olas_1_2) != 9:
        raise RuntimeError(f"Se esperaban exactamente 9 corridas Olas 1-2; encontradas: {len(olas_1_2)}")
    if len(raw_a6) != 4:
        raise RuntimeError(f"Se esperaban exactamente 4 corridas en holdout_registry_a6.jsonl; encontradas: {len(raw_a6)}")
    if len(raw_a7) != 4:
        raise RuntimeError(f"Se esperaban exactamente 4 corridas en holdout_registry_a7.jsonl; encontradas: {len(raw_a7)}")
    if len(raw_a8) != 7:
        raise RuntimeError(f"Se esperaban exactamente 7 corridas en holdout_registry_a8.jsonl; encontradas: {len(raw_a8)}")

    tagged: list[dict[str, Any]] = []
    for src_name, items in (
        ("holdout_trial_registry.jsonl", olas_1_2),
        ("holdout_registry_a6.jsonl", raw_a6),
        ("holdout_registry_a7.jsonl", raw_a7),
        ("holdout_registry_a8.jsonl", raw_a8),
    ):
        for item in items:
            if bool(item.get("unlock_holdout", False)):
                raise bt.HoldoutSealedError(
                    f"Violación pre-holdout detectada en {src_name}: corrida previa tenía unlock_holdout=True ({item})"
                )
            if str(item.get("eval_split")) != "walk_forward_dev":
                raise bt.HoldoutSealedError(
                    f"Violación pre-holdout detectada en {src_name}: eval_split={item.get('eval_split')!r}"
                )
            src_seq = int(item.get("source_trial_seq", item["trial_seq"]))
            copy_item = dict(item)
            copy_item["source_registry"] = src_name
            copy_item["source_trial_seq"] = src_seq
            tagged.append(copy_item)

    tagged.sort(key=lambda e: (str(e["timestamp_utc"]), str(e["source_registry"]), int(e["source_trial_seq"])))

    consolidated: list[dict[str, Any]] = []
    seen_hashes: set[str] = set()
    for idx, item in enumerate(tagged, start=1):
        h = str(item["config_hash"])
        n_before = len(seen_hashes)
        seen_hashes.add(h)
        rec = {
            "trial_seq": idx,
            "timestamp_utc": str(item["timestamp_utc"]),
            "phase": str(item["phase"]),
            "preset": str(item["preset"]),
            "model_version": str(item["model_version"]),
            "eval_split": "walk_forward_dev",
            "unlock_holdout": False,
            "config_hash": h,
            "execution_delay_minutes": float(item["execution_delay_minutes"]),
            "historical_delay_alpha": float(item["historical_delay_alpha"]),
            "n_configs_tested_before_this_call": n_before,
            "n_distinct_configs_cumulative": len(seen_hashes),
            "source_registry": str(item["source_registry"]),
            "source_trial_seq": int(item["source_trial_seq"]),
        }
        consolidated.append(rec)

    out_registry_path.parent.mkdir(parents=True, exist_ok=True)
    with out_registry_path.open("w", encoding="utf-8") as fh:
        for rec in consolidated:
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")

    return {
        "n_olas_1_to_3_run_backtest_trials": len(consolidated),
        "n_distinct_config_hashes_olas_1_to_3": len(seen_hashes),
        "all_olas_1_to_3_unlock_holdout_false": True,
        "by_source_registry": {
            "holdout_trial_registry.jsonl (A3=3, A5=6)": len(olas_1_2),
            "holdout_registry_a6.jsonl (A6=4)": len(raw_a6),
            "holdout_registry_a7.jsonl (A7=4)": len(raw_a7),
            "holdout_registry_a8.jsonl (A8=7)": len(raw_a8),
        },
        "by_agent_breakdown": {
            "A3_baseline_v3_0": {
                "n_run_backtest_calls": 3,
                "n_hyperparameter_configs_searched": 1,
                "description": "1 preset congelado baseline_v3_0 evaluado en alpha = 0.05, 0.00, 0.10 (0 búsqueda).",
            },
            "A4_blend_calibration": {
                "n_run_backtest_calls_ephemeral": 1,
                "n_segment_devig_weight_cells_walk_forward": 60 * 3 * 21,
                "description": (
                    "60 segmentos liga×mercado × 3 métodos de-vig (proportional, power, shin) × "
                    "21 pesos w in {0.00..1.00} con contracción n0=300 estrictamente en walk_forward_dev "
                    "(-> 12 segmentos habilitados, 48 apagados por Regla #4) + 1 corrida efímera de arnés."
                ),
            },
            "A5_pick_policy_kelly": {
                "n_run_backtest_calls": 6,
                "n_global_wf_configs_searched": 3,
                "n_bucket_threshold_candidates_per_cell": 8,
                "description": (
                    "3 configuraciones globales OOF (wf_cfg1..3) con contracción empírica m0=60 sobre 8 umbrales "
                    "EV (0.018..0.110) por liga×mercado×bucket + 3 corridas de sensibilidad alpha = 0.05, 0.00, 0.10."
                ),
            },
            "A6_dixon_coles_2way": {
                "n_run_backtest_calls": 4,
                "n_segment_weight_cells_walk_forward": 92 * 21,
                "description": (
                    "92 segmentos 2-vías (AH -1.5..+1.5, OU 1.5/2.5/3.5, DNB) × 21 pesos w -> "
                    "0/92 habilitados con DC puro (Regla #4) + 4 corridas de verificación walk_forward_dev."
                ),
            },
            "A7_gbm_1x2_calibrated": {
                "n_run_backtest_calls": 4,
                "n_temperature_grid": 43,
                "n_simplex_blend_grid": 231,
                "description": (
                    "5 pliegues causales ajustando T (43 valores) y simplex (231 tripletas) + 4 corridas A/B -> "
                    "production_activated=false (-1.46 pp en CLV OOF por paradoja de composición)."
                ),
            },
            "A8_stale_lines_double_confirmation": {
                "n_run_backtest_calls": 7,
                "n_global_wf_configs_searched": 4,
                "description": (
                    "4 configuraciones OOF Doble Confirmación (wf_dbl_pm010..020) + 1 comparador simple_sharp + "
                    "2 corridas sensibilidad alpha = 0.00, 0.10."
                ),
            },
        },
        "consolidated_entries_olas_1_to_3": consolidated,
    }


def _build_model_only_a5_policy(frozen_policy: Mapping[str, Any]) -> dict[str, Any]:
    """Crea una copia en memoria de `pick_policy_v3_1.json` con `allow_pure_market_arb=False`
    para que en el Sistema Integrado `v3.1` (`A4 + A5 + A8`), `A5` emita exclusivamente picks
    impulsados por modelo en los `12/60` segmentos `model_picks_enabled=True`, mientras que TODA
    ejecución sobre líneas recreativas rezagadas pase obligatoriamente por la Doble Confirmación de `A8`."""
    pol = dict(frozen_policy)
    pol["allow_pure_market_arb"] = False
    segs_new: dict[str, Any] = {}
    for k, v in (frozen_policy.get("segments") or {}).items():
        s_copy = dict(v)
        s_copy["allow_pure_market_arb"] = False
        segs_new[str(k)] = s_copy
    pol["segments"] = segs_new
    pe.validate_pick_policy(pol)
    return pol


@dataclass(frozen=True)
class UnifiedIntegratedDecision:
    engine_source: str  # "a5_model_driven" | "a8_stale_double_conf"
    event_id: str
    sport: str
    league: str
    market: str  # canonical ("1x2", "moneyline", "ah", "totals", "spread")
    line: float | None
    selection: str
    book: str
    utc_date: str
    segment_key: str
    odds_bucket: str
    tier: str
    price_decimal: float
    p_modelo: float
    p_mercado: float
    p_final: float
    ev: float
    sigma_p: float
    p_shrunk: float
    adverse_ticks_1h: float
    stake_raw_u: float
    correlation_multiplier: float
    stake_u: float
    expected_log_growth_g: float
    allocation_rank: int
    cap_applied: bool
    quote_source: str


class IntegratedV31BacktestSelector:
    """Selector integrado `v3.1` (`A4 + A5 + A8`) congelado y sin fugas:
    - `A4 + A5`: evalúa candidatos de modelo+mercado en los `12/60` segmentos `model_picks_enabled=True`.
    - `A8`: evalúa cuotas recreativas rezagadas bajo Doble Confirmación (`double_confirmation`).
    - `A6` (`0/92`) y `A7` (`production_activated=False`) permanecen apagados.
    - Unifica exposición de cartera respetando estrictamente `<= 2.0u` pick, `<= 2.0u` evento,
      `<= 3.0u` liga-día, `<= 5.0u` día global, máximo 1 pick por `(event_id, mercado_canónico)` y
      penalización de correlación intra-evento `(1 - 0.35)^k`."""

    def __init__(
        self,
        frozen_pick_policy: Mapping[str, Any],
        frozen_stale_config: Mapping[str, Any],
        blend_segments: Mapping[str, Mapping[str, Any]],
        submodel_lookup: Mapping[str, Mapping[str, list[float]]],
        odds_by_event: Mapping[str, list[dict[str, Any]]],
        *,
        secondary_specs_by_event: Mapping[str, Sequence[Mapping[str, Any]]] | None = None,
    ) -> None:
        self.a5_model_only_policy = _build_model_only_a5_policy(frozen_pick_policy)
        sl.validate_stale_lines_config(frozen_stale_config)
        self.a8_config = dict(frozen_stale_config)
        self.blend_segments = blend_segments
        self.submodel_lookup = submodel_lookup
        self.odds_by_event = odds_by_event
        self.secondary_specs_by_event = secondary_specs_by_event or {}

        self.a5_builder = pe.StatefulBacktestPolicySelector(
            self.a5_model_only_policy,
            blend_segments,
            submodel_lookup,
            odds_by_event,
            secondary_specs_by_event=self.secondary_specs_by_event,
            allow_stale_sharp_arb=False,
        )
        self.a8_builder = sl.StatefulStaleLineBacktestSelector(
            self.a8_config,
            blend_segments,
            submodel_lookup,
            odds_by_event,
            secondary_specs_by_event=self.secondary_specs_by_event,
            override_signal_mode="double_confirmation",
        )

        self.rho_same_event = float(self.a5_model_only_policy.get("rho_same_event", 0.35))
        self.min_stake_u = float(self.a5_model_only_policy.get("min_stake_u", 0.05))
        caps = self.a5_model_only_policy["caps"]
        self.cap_pick_max = min(float(caps["max_stake_per_pick_u"]), pe.HARD_MAX_STAKE_PER_PICK_U)
        self.cap_event_max = min(float(caps["max_stake_per_event_u"]), pe.HARD_MAX_STAKE_PER_EVENT_U)
        self.cap_ld_max = min(float(caps["max_stake_per_league_date_u"]), pe.HARD_MAX_STAKE_PER_LEAGUE_DATE_U)
        self.cap_gd_max = min(float(caps["max_stake_per_global_date_u"]), pe.HARD_MAX_STAKE_PER_GLOBAL_DATE_U)

        self.event_exposure_u: dict[str, float] = {}
        self.event_markets_taken: dict[str, set[str]] = {}
        self.event_pick_counts: dict[str, int] = {}
        self.league_date_exposure_u: dict[str, float] = {}
        self.global_date_exposure_u: dict[str, float] = {}

        self.total_candidates_evaluated: int = 0
        self.rejection_counts: dict[str, int] = {}
        self.selected_decisions_log: list[UnifiedIntegratedDecision] = []
        self.__qualname__ = "IntegratedV31BacktestSelector.__call__"

    def __call__(
        self,
        event_ctx: dict[str, Any],
        decision_quotes: list[dict[str, Any]],
        config: Any,
    ) -> list[dict[str, Any]]:
        if not decision_quotes:
            return []

        eid = str(event_ctx["event_id"])
        sport = str(event_ctx["sport"])
        league = str(event_ctx["league"])
        source_mode = str(event_ctx.get("source_mode") or "historical_fd")
        m_primary_pe = pe.canonical_pick_market(event_ctx["market"])
        m_primary_sl = sl.canonical_stale_market(event_ctx["market"])
        l_key_pe = pe.normalize_pick_line(event_ctx.get("line"))
        l_key_sl = sl.normalize_stale_line(event_ctx.get("line"))
        p_model_vec = np.asarray(event_ctx["p_model_vec"], dtype=float)
        ts_dec: pd.Timestamp = event_ctx["ts_decision"]
        ts_start: pd.Timestamp = event_ctx["ts_event_start"]
        ts_dec_iso = ts_dec.isoformat()
        ts_start_iso = ts_start.isoformat()

        ev_all_odds = self.odds_by_event.get(eid, [])
        primary_sub = self.submodel_lookup.get(eid) or {}
        line_shopping = bool(config.line_shopping)

        # 1. Construir y pre-filtrar candidatos A5 (solo segmentos con ventaja de modelo en A4)
        sharp_win_a5 = float(self.a5_model_only_policy.get("sharp_steam_window_minutes", 60.0))
        a5_allowed_books = [pe.canonical_pick_book(b) for b in A5_EXEC_BOOKS_PRIORITY]
        a5_cands = self.a5_builder._build_market_candidates_for_event(
            eid=eid,
            sport=sport,
            league=league,
            source_mode=source_mode,
            m_canon=m_primary_pe,
            l_key=l_key_pe,
            p_model_vec=p_model_vec,
            sub_by_sel=primary_sub,
            decision_quotes=decision_quotes,
            ev_all_odds=ev_all_odds,
            ts_dec=ts_dec,
            ts_dec_iso=ts_dec_iso,
            ts_start_iso=ts_start_iso,
            sharp_window_minutes=sharp_win_a5,
            allowed_books=a5_allowed_books,
            line_shopping=line_shopping,
            real_exec_books=bt.DEFAULT_REAL_EXECUTION_BOOKS,
        )
        for sec_spec in self.secondary_specs_by_event.get(eid) or ():
            a5_cands.extend(
                self.a5_builder._build_market_candidates_for_event(
                    eid=eid,
                    sport=sport,
                    league=league,
                    source_mode=source_mode,
                    m_canon=pe.canonical_pick_market(sec_spec["market"]),
                    l_key=pe.normalize_pick_line(sec_spec.get("line")),
                    p_model_vec=np.asarray(sec_spec["p_model_vec"], dtype=float),
                    sub_by_sel=sec_spec.get("submodel_probs") or {},
                    decision_quotes=decision_quotes,
                    ev_all_odds=ev_all_odds,
                    ts_dec=ts_dec,
                    ts_dec_iso=ts_dec_iso,
                    ts_start_iso=ts_start_iso,
                    sharp_window_minutes=sharp_win_a5,
                    allowed_books=a5_allowed_books,
                    line_shopping=line_shopping,
                    real_exec_books=bt.DEFAULT_REAL_EXECUTION_BOOKS,
                )
            )

        # 2. Construir y pre-filtrar candidatos A8 (Doble Confirmación sobre casas recreativas)
        sharp_win_a8 = float(self.a8_config.get("sharp_steam_window_minutes", 60.0))
        real_exec_canon = {sl.canonical_stale_book(b) for b in bt.DEFAULT_REAL_EXECUTION_BOOKS}
        a8_allowed_rec = [
            sl.canonical_stale_book(b)
            for b in A8_EXEC_BOOKS_PRIORITY
            if sl.canonical_stale_book(b) in real_exec_canon
        ]
        a8_cands = self.a8_builder._build_candidates_for_market(
            eid=eid,
            sport=sport,
            league=league,
            source_mode=source_mode,
            m_canon=m_primary_sl,
            l_key=l_key_sl,
            p_model_vec=p_model_vec,
            sub_by_sel=primary_sub,
            decision_quotes=decision_quotes,
            ev_all_odds=ev_all_odds,
            ts_dec_iso=ts_dec_iso,
            ts_start_iso=ts_start_iso,
            sharp_window_min=sharp_win_a8,
            line_shopping=line_shopping,
            allowed_rec_books=a8_allowed_rec,
        )
        for sec_spec in self.secondary_specs_by_event.get(eid) or ():
            a8_cands.extend(
                self.a8_builder._build_candidates_for_market(
                    eid=eid,
                    sport=sport,
                    league=league,
                    source_mode=source_mode,
                    m_canon=sl.canonical_stale_market(sec_spec["market"]),
                    l_key=sl.normalize_stale_line(sec_spec.get("line")),
                    p_model_vec=np.asarray(sec_spec["p_model_vec"], dtype=float),
                    sub_by_sel=sec_spec.get("submodel_probs") or {},
                    decision_quotes=decision_quotes,
                    ev_all_odds=ev_all_odds,
                    ts_dec_iso=ts_dec_iso,
                    ts_start_iso=ts_start_iso,
                    sharp_window_min=sharp_win_a8,
                    line_shopping=line_shopping,
                    allowed_rec_books=a8_allowed_rec,
                )
            )

        survivors: list[dict[str, Any]] = []
        seq_idx = 0

        for cand in a5_cands:
            self.total_candidates_evaluated += 1
            dec_a5 = pe.evaluate_pick_candidates(
                [cand], self.a5_model_only_policy, portfolio_state=None, _trusted_validated_policy=True
            )[0]
            if not dec_a5.approved or dec_a5.tier is None:
                if dec_a5.rejection_reason:
                    k = f"a5:{dec_a5.rejection_reason}"
                    self.rejection_counts[k] = self.rejection_counts.get(k, 0) + 1
                continue
            mkt_c = _canonical_portfolio_market(dec_a5.market)
            survivors.append(
                {
                    "seq_idx": seq_idx,
                    "source_prio": 0,
                    "engine_source": "a5_model_driven",
                    "event_id": eid,
                    "sport": dec_a5.sport,
                    "league": dec_a5.league,
                    "market": mkt_c,
                    "line": dec_a5.line,
                    "selection": dec_a5.selection,
                    "book": dec_a5.book,
                    "utc_date": dec_a5.utc_date,
                    "segment_key": f"{dec_a5.league}::{mkt_c}",
                    "odds_bucket": dec_a5.odds_bucket,
                    "tier": str(dec_a5.tier),
                    "price_decimal": float(dec_a5.price_decimal),
                    "p_modelo": float(dec_a5.p_modelo),
                    "p_mercado": float(dec_a5.p_mercado),
                    "p_final": float(dec_a5.p_final),
                    "ev": float(dec_a5.ev),
                    "sigma_p": float(dec_a5.sigma_p),
                    "p_shrunk": float(dec_a5.p_shrunk),
                    "adverse_ticks_1h": float(dec_a5.adverse_ticks_1h),
                    "stake_raw_u": float(dec_a5.stake_raw_u),
                    "expected_log_growth_g": float(dec_a5.expected_log_growth_g),
                    "quote_source": str(cand.get("source") or source_mode),
                }
            )
            seq_idx += 1

        for cand in a8_cands:
            self.total_candidates_evaluated += 1
            dec_a8 = sl.evaluate_stale_line_batch(
                [cand],
                self.a8_config,
                portfolio_state=None,
                override_signal_mode="double_confirmation",
                skip_config_validation=True,
            )[0]
            if not dec_a8.approved or dec_a8.tier is None:
                if dec_a8.rejection_reason:
                    k = f"a8:{dec_a8.rejection_reason}"
                    self.rejection_counts[k] = self.rejection_counts.get(k, 0) + 1
                continue
            mkt_c = _canonical_portfolio_market(dec_a8.market)
            p_mod_val = float(dec_a8.p_modelo) if dec_a8.p_modelo is not None else float(dec_a8.p_sharp_novig)
            survivors.append(
                {
                    "seq_idx": seq_idx,
                    "source_prio": 1,
                    "engine_source": "a8_stale_double_conf",
                    "event_id": eid,
                    "sport": dec_a8.sport,
                    "league": dec_a8.league,
                    "market": mkt_c,
                    "line": dec_a8.line,
                    "selection": dec_a8.selection,
                    "book": dec_a8.recreational_book,
                    "utc_date": dec_a8.utc_date,
                    "segment_key": f"{dec_a8.league}::{mkt_c}",
                    "odds_bucket": dec_a8.odds_bucket,
                    "tier": str(dec_a8.tier),
                    "price_decimal": float(dec_a8.price_recreational),
                    "p_modelo": p_mod_val,
                    "p_mercado": float(dec_a8.p_sharp_novig),
                    "p_final": float(dec_a8.p_effective),
                    "ev": float(dec_a8.p_effective * dec_a8.price_recreational - 1.0),
                    "sigma_p": float(dec_a8.sigma_p or 0.025),
                    "p_shrunk": float(dec_a8.p_shrunk or dec_a8.p_effective),
                    "adverse_ticks_1h": float(dec_a8.adverse_ticks_1h or 0.0),
                    "stake_raw_u": float(dec_a8.stake_raw_u),
                    "expected_log_growth_g": float(dec_a8.expected_log_growth_g),
                    "quote_source": str(cand.get("source") or source_mode),
                }
            )
            seq_idx += 1

        if not survivors:
            return []

        # Ordenar por crecimiento logarítmico esperado `g` (Kelly con incertidumbre)
        survivors.sort(
            key=lambda s: (-s["expected_log_growth_g"], -s["ev"], s["source_prio"], s["seq_idx"])
        )

        out_picks: list[dict[str, Any]] = []
        rank_next = 1
        eps = 1e-9

        for s in survivors:
            mkt_set = self.event_markets_taken.setdefault(eid, set())
            if s["market"] in mkt_set:
                self.rejection_counts["integrated:correlated_same_event_market"] = (
                    self.rejection_counts.get("integrated:correlated_same_event_market", 0) + 1
                )
                continue

            prior_cnt = self.event_pick_counts.get(eid, 0)
            corr_mult = ((1.0 - abs(self.rho_same_event)) ** prior_cnt) if prior_cnt > 0 else 1.0
            stake_corr_u = s["stake_raw_u"] * corr_mult

            ld_key = f"{s['league']}::{s['utc_date']}"
            used_ev = self.event_exposure_u.get(eid, 0.0)
            used_ld = self.league_date_exposure_u.get(ld_key, 0.0)
            used_gd = self.global_date_exposure_u.get(s["utc_date"], 0.0)

            if self.cap_event_max - used_ev <= eps:
                self.rejection_counts["integrated:cap_event_exhausted"] = (
                    self.rejection_counts.get("integrated:cap_event_exhausted", 0) + 1
                )
                continue
            if self.cap_ld_max - used_ld <= eps:
                self.rejection_counts["integrated:cap_league_date_exhausted"] = (
                    self.rejection_counts.get("integrated:cap_league_date_exhausted", 0) + 1
                )
                continue
            if self.cap_gd_max - used_gd <= eps:
                self.rejection_counts["integrated:cap_global_date_exhausted"] = (
                    self.rejection_counts.get("integrated:cap_global_date_exhausted", 0) + 1
                )
                continue

            stake_u = min(stake_corr_u, self.cap_pick_max)
            stake_u = pe._clamp_safe_addition(used_ev, stake_u, self.cap_event_max)
            stake_u = pe._clamp_safe_addition(used_ld, stake_u, self.cap_ld_max)
            stake_u = pe._clamp_safe_addition(used_gd, stake_u, self.cap_gd_max)

            cap_applied = (stake_u + 1e-15) < stake_corr_u
            if stake_u < self.min_stake_u:
                self.rejection_counts["integrated:stake_below_min_unit"] = (
                    self.rejection_counts.get("integrated:stake_below_min_unit", 0) + 1
                )
                continue

            self.event_exposure_u[eid] = used_ev + stake_u
            self.league_date_exposure_u[ld_key] = used_ld + stake_u
            self.global_date_exposure_u[s["utc_date"]] = used_gd + stake_u
            self.event_pick_counts[eid] = prior_cnt + 1
            mkt_set.add(s["market"])

            u_dec = UnifiedIntegratedDecision(
                engine_source=s["engine_source"],
                event_id=eid,
                sport=s["sport"],
                league=s["league"],
                market=s["market"],
                line=s["line"],
                selection=s["selection"],
                book=s["book"],
                utc_date=s["utc_date"],
                segment_key=s["segment_key"],
                odds_bucket=s["odds_bucket"],
                tier=s["tier"],
                price_decimal=s["price_decimal"],
                p_modelo=s["p_modelo"],
                p_mercado=s["p_mercado"],
                p_final=s["p_final"],
                ev=s["ev"],
                sigma_p=s["sigma_p"],
                p_shrunk=s["p_shrunk"],
                adverse_ticks_1h=s["adverse_ticks_1h"],
                stake_raw_u=s["stake_raw_u"],
                correlation_multiplier=corr_mult,
                stake_u=stake_u,
                expected_log_growth_g=s["expected_log_growth_g"] * corr_mult,
                allocation_rank=rank_next,
                cap_applied=cap_applied,
                quote_source=s["quote_source"],
            )
            rank_next += 1
            self.selected_decisions_log.append(u_dec)

            out_picks.append(
                {
                    "market": u_dec.market,
                    "line": u_dec.line,
                    "selection": u_dec.selection,
                    "book": u_dec.book,
                    "source": u_dec.quote_source,
                    "price_decision": u_dec.price_decimal,
                    "p_modelo": u_dec.p_modelo,
                    "p_mercado": u_dec.p_mercado,
                    "p_final": u_dec.p_final,
                    "stake_u": u_dec.stake_u,
                    "tier": u_dec.tier,
                }
            )

        return out_picks


def _reconstruct_and_audit_settled_picks(
    *,
    phase: str,
    model_version: str,
    selected_decisions: Sequence[Any],
    active_df: pd.DataFrame,
    odds_by_event: Mapping[str, list[dict[str, Any]]],
    enabled_model_segments: frozenset[str],
    bt_report: Mapping[str, Any],
    execution_delay_minutes: float = DEFAULT_EXECUTION_DELAY_MINUTES,
    historical_delay_alpha: float = DEFAULT_HISTORICAL_DELAY_ALPHA,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Reconstruye de forma 100% exacta los picks liquidados por `run_backtest`, verifica paridad 1:1
    con `bt_report['n_picks']` y `total_pnl_u`, y audita los 4 topes duros (`2u/2u/3u/5u`)."""
    ev_meta: dict[str, tuple[pd.Timestamp, pd.Timestamp, str, float, float, int]] = {}
    for r in active_df.itertuples(index=False):
        ev_meta[str(r.event_id)] = (
            r.ts_decision,
            r.ts_event_start,
            str(getattr(r, "source_mode", "historical_fd")),
            float(r.home_score),
            float(r.away_score),
            int(r.y),
        )

    settled: list[dict[str, Any]] = []
    event_totals: dict[str, float] = {}
    ld_totals: dict[str, float] = {}
    gd_totals: dict[str, float] = {}
    event_mkt_counts: dict[tuple[str, str], int] = {}
    max_pick_u = 0.0

    for idx_d, dec in enumerate(selected_decisions):
        eid = str(dec.event_id)
        meta = ev_meta.get(eid)
        if meta is None:
            continue
        ts_dec, ts_start, src_mode, h_sc, a_sc, y_raw = meta
        ev_odds = odds_by_event.get(eid, [])

        c_mkt = _canonical_portfolio_market(dec.market)
        c_line = bt._normalize_line_key(dec.line)
        c_sel = bt.canonical_selection(dec.selection)
        c_book = bt.canonical_book(getattr(dec, "book", None) or getattr(dec, "recreational_book"))
        price_dec = float(getattr(dec, "price_decimal", None) or getattr(dec, "price_recreational"))
        p_mod = float(dec.p_modelo) if dec.p_modelo is not None else float(getattr(dec, "p_sharp_novig"))
        p_mkt = float(getattr(dec, "p_mercado", None) or getattr(dec, "p_sharp_novig"))
        p_fin = float(getattr(dec, "p_final", None) or getattr(dec, "p_effective"))
        stake_u = float(dec.stake_u)
        utc_date = str(dec.utc_date)
        league = str(dec.league)
        sport = str(dec.sport)
        seg_key = f"{league}::{c_mkt}"

        if hasattr(dec, "quote_source"):
            q_src = str(dec.quote_source)
        else:
            q_src = src_mode
            for q in ev_odds:
                if (
                    _canonical_portfolio_market(q["market"]) == c_mkt
                    and bt._normalize_line_key(q.get("line")) == c_line
                    and bt.canonical_selection(q["selection"]) == c_sel
                    and bt.canonical_book(q["book"]) == c_book
                    and q["ts_captured"] <= ts_dec
                ):
                    q_src = str(q.get("source") or src_mode)
                    break

        price_tomado, ts_exec, exec_status = bt.resolve_execution_price(
            ev_odds,
            source=q_src,
            market=c_mkt,
            line=c_line,
            selection=c_sel,
            book=c_book,
            price_decision=price_dec,
            ts_decision=ts_dec,
            ts_event_start=ts_start,
            execution_delay_minutes=execution_delay_minutes,
            historical_delay_alpha=historical_delay_alpha,
        )
        if price_tomado is None or ts_exec is None or price_tomado < 1.01:
            continue

        pick_cl = bt.resolve_sharp_closing_market(ev_odds, market=c_mkt, line=c_line, ts_event_start=ts_start)
        c_miss = bool(pick_cl["closing_missing"])
        p_cl_nv = (
            float(pick_cl["prices_novig"][c_sel])
            if (not c_miss and pick_cl["prices_novig"] and c_sel in pick_cl["prices_novig"])
            else None
        )
        clv_pct, clv_prob = bt._compute_single_pick_clv(
            price_tomado,
            p_cl_nv,
            c_miss,
            closing_book=pick_cl.get("closing_book"),
            closing_source=pick_cl.get("closing_source"),
        )
        status_s, unit_ret = bt.settle_selection_unit_return(
            c_mkt, c_sel, c_line, price_tomado, h_sc, a_sc, outcome_label=y_raw
        )
        pnl_u = stake_u * unit_ret

        max_pick_u = max(max_pick_u, stake_u)
        event_totals[eid] = event_totals.get(eid, 0.0) + stake_u
        ld_k = f"{league}::{utc_date}"
        ld_totals[ld_k] = ld_totals.get(ld_k, 0.0) + stake_u
        gd_totals[utc_date] = gd_totals.get(utc_date, 0.0) + stake_u
        event_mkt_counts[(eid, c_mkt)] = event_mkt_counts.get((eid, c_mkt), 0) + 1

        if hasattr(dec, "engine_source"):
            origin = str(dec.engine_source)
        elif hasattr(dec, "signal_mode"):
            origin = f"a8_{dec.signal_mode}"
        else:
            origin = "a5_model_driven" if seg_key in enabled_model_segments else "a5_sharp_arb"

        settled.append(
            {
                "pick_id": f"{phase}:{eid}:{c_mkt}:{c_sel}:{idx_d}",
                "ts_emitido": ts_dec.isoformat(),
                "ts_executed": ts_exec.isoformat(),
                "ts_event_start": ts_start.isoformat(),
                "event_id": eid,
                "sport": sport,
                "league": league,
                "market": c_mkt,
                "segment_key": seg_key,
                "line": c_line,
                "selection": c_sel,
                "book": c_book,
                "source": q_src,
                "execution_status": exec_status,
                "price_decision": price_dec,
                "price_tomado": price_tomado,
                "price_cierre_sin_margen": p_cl_nv,
                "closing_missing": c_miss,
                "p_modelo": p_mod,
                "p_mercado": p_mkt,
                "p_final": p_fin,
                "ev": p_fin * price_tomado - 1.0,
                "stake_u": stake_u,
                "outcome": status_s,
                "settlement": status_s,
                "pnl_u": pnl_u,
                "clv_pct": clv_pct,
                "clv_prob": clv_prob,
                "tier": str(dec.tier),
                "odds_bucket": str(dec.odds_bucket),
                "origin": origin,
                "version_modelo": model_version,
            }
        )

    expected_n = int(bt_report["n_picks"])
    if len(settled) != expected_n:
        raise RuntimeError(
            f"Desajuste de paridad en {phase}: reconstruidos={len(settled)} != run_backtest={expected_n}"
        )
    expected_pnl = float(bt_report["betting"]["global"]["total_pnl_u"])
    obs_pnl = float(sum(p["pnl_u"] for p in settled))
    if abs(obs_pnl - expected_pnl) > 1e-7:
        raise RuntimeError(f"Desajuste PnL en {phase}: reconstruido={obs_pnl} != run_backtest={expected_pnl}")

    max_ev_u = max(event_totals.values(), default=0.0)
    max_ld_u = max(ld_totals.values(), default=0.0)
    max_gd_u = max(gd_totals.values(), default=0.0)
    max_per_em = max(event_mkt_counts.values(), default=0)
    tol = 1e-9
    n_viol = (
        int(max_pick_u > pe.HARD_MAX_STAKE_PER_PICK_U + tol)
        + sum(1 for v in event_totals.values() if v > pe.HARD_MAX_STAKE_PER_EVENT_U + tol)
        + sum(1 for v in ld_totals.values() if v > pe.HARD_MAX_STAKE_PER_LEAGUE_DATE_U + tol)
        + sum(1 for v in gd_totals.values() if v > pe.HARD_MAX_STAKE_PER_GLOBAL_DATE_U + tol)
        + sum(1 for c in event_mkt_counts.values() if c > 1)
    )
    caps_audit = {
        "hard_limits_u": {
            "per_pick": pe.HARD_MAX_STAKE_PER_PICK_U,
            "per_event": pe.HARD_MAX_STAKE_PER_EVENT_U,
            "per_league_date": pe.HARD_MAX_STAKE_PER_LEAGUE_DATE_U,
            "per_global_date": pe.HARD_MAX_STAKE_PER_GLOBAL_DATE_U,
            "max_picks_per_event_market": 1,
        },
        "observed_max": {
            "per_pick_u": round(max_pick_u, 8),
            "per_event_u": round(max_ev_u, 8),
            "per_league_date_u": round(max_ld_u, 8),
            "per_global_date_u": round(max_gd_u, 8),
            "max_picks_per_event_market": int(max_per_em),
        },
        "n_violations": int(n_viol),
        "all_caps_respected": bool(n_viol == 0),
    }
    if n_viol != 0:
        raise RuntimeError(f"Violación de topes duros detectada en {phase}: {caps_audit}")

    return settled, caps_audit


def _summarize_pick_groups(
    settled_picks: Sequence[dict[str, Any]],
    group_field: str,
    expected_keys: Sequence[str],
    *,
    n_boot: int = DEFAULT_BOOTSTRAP_SAMPLES,
    seed: int = DEFAULT_SEED,
) -> dict[str, dict[str, Any]]:
    buckets: dict[str, list[dict[str, Any]]] = {k: [] for k in expected_keys}
    for pk in settled_picks:
        gk = str(pk.get(group_field, "other"))
        buckets.setdefault(gk, []).append(pk)

    out: dict[str, dict[str, Any]] = {}
    for idx, k in enumerate(buckets.keys()):
        out[k] = bt.compute_picks_summary_bootstrap(
            buckets[k], n_boot=n_boot, seed=seed + 313 * (idx + 1), use_ledger_bridge=False
        )
    return out


def _pack_phase_summary(
    bt_report: Mapping[str, Any],
    *,
    caps_audit: Mapping[str, Any] | None = None,
    by_origin: Mapping[str, Any] | None = None,
    by_tier: Mapping[str, Any] | None = None,
    by_odds_bucket: Mapping[str, Any] | None = None,
    by_source: Mapping[str, Any] | None = None,
    selector_stats: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    bet_glob = bt_report["betting"]["global"]
    return {
        "phase": bt_report["phase"],
        "preset": bt_report["preset"],
        "model_version": bt_report["model_version"],
        "eval_split": bt_report["eval_split"],
        "unlock_holdout": bt_report["unlock_holdout"],
        "config_hash": bt_report["config_hash"],
        "holdout_audit": bt_report["holdout_audit"],
        "execution_summary": bt_report["execution_summary"],
        "log_loss_model": bt_report["log_loss_model"],
        "log_loss_model_ci95": bt_report["log_loss_model_ci95"],
        "log_loss_closing_novig": bt_report["log_loss_closing_novig"],
        "log_loss_closing_novig_ci95": bt_report["log_loss_closing_novig_ci95"],
        "delta_log_loss": bt_report["delta_log_loss"],
        "delta_log_loss_ci95": bt_report["delta_log_loss_ci95"],
        "delta_log_loss_significance": bt_report["delta_log_loss_significance"],
        "brier_model": bt_report["brier_model"],
        "brier_closing_novig": bt_report["brier_closing_novig"],
        "delta_brier": bt_report["delta_brier"],
        "delta_brier_ci95": bt_report["delta_brier_ci95"],
        "n_picks": bet_glob["n_picks"],
        "n_picks_with_closing": bet_glob["n_picks_with_closing"],
        "n_closing_missing": bet_glob["n_closing_missing"],
        "total_staked_u": bet_glob["total_staked_u"],
        "total_pnl_u": bet_glob["total_pnl_u"],
        "roi_pct": bet_glob["roi_pct"],
        "roi_pct_ci95": bet_glob["roi_pct_ci95"],
        "roi_significant": bet_glob["roi_significant"],
        "roi_significance": bet_glob["roi_significance_label"],
        "clv_pct_mean": bet_glob["clv_pct_mean"],
        "clv_pct_ci95": bet_glob["clv_pct_ci95"],
        "clv_pct_significant": bet_glob["clv_pct_significant"],
        "clv_pct_significance": bet_glob["clv_pct_significance_label"],
        "clv_prob_mean": bet_glob["clv_prob_mean"],
        "clv_prob_ci95": bet_glob["clv_prob_ci95"],
        "clv_prob_significant": bet_glob["clv_prob_significant"],
        "clv_prob_significance": bet_glob["clv_prob_significance_label"],
        "pct_picks_clv_positive": bet_glob["pct_picks_clv_positive"],
        "pct_picks_clv_positive_ci95": bet_glob["pct_picks_clv_positive_ci95"],
        "max_drawdown_u": bet_glob["max_drawdown_u"],
        "max_drawdown_u_ci95": bet_glob["max_drawdown_u_ci95"],
        "portfolio_caps_audit": caps_audit,
        "by_origin": by_origin,
        "by_tier": by_tier,
        "by_odds_bucket": by_odds_bucket,
        "by_source": by_source,
        "selector_stats": selector_stats,
        "by_league_market_betting": bt_report["betting"]["by_league_market"],
    }


def _fit_frozen_nfl_2way_models_on_dev(nfl_dev: pd.DataFrame) -> dict[str, Any]:
    """Ajusta los parámetros de NFL `spread` y `totals` ESTRICTAMENTE sobre `nfl_dev` (`< holdout_cut_ts`)
    y los congela para predecir sobre `nfl_holdout` sin tocar jamás etiquetas del holdout."""
    nf_cols = [
        "game_id",
        "f5_pf_home",
        "f5_pa_home",
        "f5_pf_away",
        "f5_pa_away",
        "is_indoor",
        "wind_outdoor",
        "cold_outdoor",
    ]
    nfl_feats = pd.read_parquet(
        PRED_LAB_ROOT / "data" / "nfl" / "processed" / "nfl_features.parquet",
        columns=nf_cols,
    ).drop_duplicates("game_id")
    merged = nfl_dev.merge(nfl_feats, left_on="raw_event_id", right_on="game_id", how="left")
    h_sc = merged["home_score"].to_numpy(dtype=np.float64)
    a_sc = merged["away_score"].to_numpy(dtype=np.float64)

    p_ml = np.clip(merged["p_model_home"].to_numpy(dtype=np.float64), 1e-4, 1.0 - 1e-4)
    z_ml = ndtri(p_ml)
    margins = h_sc - a_sc
    denom_z = float(np.dot(z_ml, z_ml))
    slope = float(np.dot(z_ml, margins) / denom_z) if denom_z > 1e-9 else 13.5
    slope = min(20.0, max(8.0, slope))
    sigma_sp = min(20.0, max(10.0, float(np.std(margins - slope * z_ml))))

    feat_cols = [
        "f5_pf_home",
        "f5_pa_home",
        "f5_pf_away",
        "f5_pa_away",
        "is_indoor",
        "wind_outdoor",
        "cold_outdoor",
    ]
    X_tr = merged[feat_cols].apply(pd.to_numeric, errors="coerce").to_numpy(dtype=np.float64, copy=True)
    col_med = np.nanmedian(X_tr, axis=0)
    col_med = np.where(np.isfinite(col_med), col_med, 0.0)
    inds = np.where(np.isnan(X_tr))
    X_tr[inds] = np.take(col_med, inds[1])
    mu_x = X_tr.mean(axis=0)
    sd_x = np.where(X_tr.std(axis=0) > 1e-8, X_tr.std(axis=0), 1.0)
    Z_tr = (X_tr - mu_x) / sd_x
    y_tot = h_sc + a_sc
    y_mean = float(y_tot.mean())
    gram = Z_tr.T @ Z_tr + 50.0 * np.eye(Z_tr.shape[1])
    beta = np.linalg.solve(gram, Z_tr.T @ (y_tot - y_mean))
    sigma_tot = min(18.0, max(9.0, float(np.std(y_tot - (y_mean + Z_tr @ beta)))))

    return {
        "spread": {"slope": slope, "sigma": sigma_sp},
        "totals": {
            "feat_cols": feat_cols,
            "col_med": col_med,
            "mu_x": mu_x,
            "sd_x": sd_x,
            "y_mean": y_mean,
            "beta": beta,
            "sigma": sigma_tot,
        },
        "nfl_feats_df": nfl_feats,
    }


def _extract_pre_decision_market_quote(
    dec_quotes: list[dict[str, Any]],
    market_canon: str,
    sel_order: tuple[str, ...],
    books_priority: tuple[str, ...],
) -> tuple[tuple[float, ...] | None, float | None]:
    """Extrae `(cuotas_decimales, line)` de la casa de mayor prioridad disponible en `ts_decision`."""
    grouped: dict[tuple[str, float | None], dict[str, float]] = {}
    for q in dec_quotes:
        if _canonical_portfolio_market(q["market"]) != market_canon:
            continue
        b = bt.canonical_book(q["book"])
        if b not in books_priority:
            continue
        s = bt.canonical_selection(q["selection"])
        if s not in sel_order:
            continue
        pf = float(q["price_decimal"])
        if not (1.01 <= pf <= 1000.0):
            continue
        ln = bt._normalize_line_key(q.get("line"))
        grouped.setdefault((b, ln), {})[s] = pf

    if not grouped:
        return None, None

    rank_map = {b: idx for idx, b in enumerate(books_priority)}
    candidates: list[tuple[int, float, tuple[float, ...], float | None]] = []
    for (b, ln), sd in grouped.items():
        if all(s in sd for s in sel_order):
            vec = tuple(float(sd[s]) for s in sel_order)
            overround = sum(1.0 / x for x in vec)
            if 0.90 <= overround <= 1.20:
                balance = abs(vec[0] - vec[-1])
                candidates.append((rank_map.get(b, 999), balance, vec, ln))

    if not candidates:
        return None, None
    candidates.sort(key=lambda item: (item[0], item[1]))
    best = candidates[0]
    return best[2], best[3]


def evaluate_holdout_calibration_by_segment(
    *,
    dev_df: pd.DataFrame,
    holdout_df: pd.DataFrame,
    odds_by_event_holdout: Mapping[str, list[dict[str, Any]]],
    blend_segments: Mapping[str, Mapping[str, Any]],
    n_bootstrap: int = DEFAULT_BOOTSTRAP_SAMPLES,
    seed: int = DEFAULT_SEED,
) -> dict[str, dict[str, Any]]:
    """Evalúa todos los segmentos `liga × mercado` en `holdout_sealed` aplicando SIN RE-AJUSTE
    el `best_devig_method` y `w_effective` congelados en `blend_weights_v3_1.json`."""
    soc_feats = pd.read_parquet(
        PRED_LAB_ROOT / "data" / "processed" / "features.parquet",
        columns=["match_id", "dc_lam_home", "dc_lam_away"],
    ).drop_duplicates("match_id")

    soc_ho = holdout_df[holdout_df["sport"] == "football"].copy().reset_index(drop=True)
    soc_ho = soc_ho.merge(soc_feats, left_on="raw_event_id", right_on="match_id", how="left")

    nfl_dev = dev_df[dev_df["sport"] == "nfl"].copy().reset_index(drop=True)
    nfl_ho = holdout_df[holdout_df["sport"] == "nfl"].copy().reset_index(drop=True)
    nfl_frozen_models = _fit_frozen_nfl_2way_models_on_dev(nfl_dev)

    open_prio_soc = ("pinnacle", "smarkets", "b365", "caliente", "codere", "bw", "wh", "avg")
    open_prio_nfl = ("pinnacle", "smarkets", "draftkings", "fanduel", "betmgm", "betrivers", "nflverse")

    out_cal: dict[str, dict[str, Any]] = {}

    def _compute_seg_metrics(
        seg_key: str,
        league: str,
        market: str,
        sport: str,
        p_mod_list: list[np.ndarray],
        p_open_nv_list: list[np.ndarray | None],
        p_close_nv_list: list[np.ndarray | None],
        y_list: list[int],
        seg_idx: int,
    ) -> dict[str, Any]:
        b_seg = blend_segments.get(seg_key) or {}
        devig_m = str(b_seg.get("best_devig_method", "power"))
        w_eff = float(b_seg.get("w_effective", 0.0))

        ll_mod_all: list[float] = []
        ll_bl_open: list[float] = []
        ll_mod_paired: list[float] = []
        ll_bl_paired: list[float] = []
        ll_cl_paired: list[float] = []

        for pm, pop, pcl, yv in zip(p_mod_list, p_open_nv_list, p_close_nv_list, y_list):
            if yv < 0:
                continue
            pm_c = np.clip(pm / max(1e-15, float(pm.sum())), 1e-6, 1.0 - 1e-6)
            ll_m = float(-math.log(float(pm_c[yv])))
            ll_mod_all.append(ll_m)

            if pop is not None:
                p_bl = pe.blend_probs_logit_simplex(pm_c, pop, w_eff)
            else:
                p_bl = pm_c
            p_bl_c = np.clip(p_bl / max(1e-15, float(p_bl.sum())), 1e-6, 1.0 - 1e-6)
            if pop is not None:
                ll_bl_open.append(float(-math.log(float(p_bl_c[yv]))))

            if pcl is not None:
                pcl_c = np.clip(pcl / max(1e-15, float(pcl.sum())), 1e-6, 1.0 - 1e-6)
                ll_mod_paired.append(ll_m)
                ll_bl_paired.append(float(-math.log(float(p_bl_c[yv]))))
                ll_cl_paired.append(float(-math.log(float(pcl_c[yv]))))

        n_eval = len(ll_mod_all)
        n_paired = len(ll_cl_paired)

        if n_paired >= 2:
            arr_m = np.asarray(ll_mod_paired, dtype=np.float64)
            arr_b = np.asarray(ll_bl_paired, dtype=np.float64)
            arr_c = np.asarray(ll_cl_paired, dtype=np.float64)
            d_mod = clv_report.bootstrap_paired_delta_ci(arr_m, arr_c, n_resamples=n_bootstrap, seed=seed + 17 * seg_idx)
            d_bl = clv_report.bootstrap_paired_delta_ci(arr_b, arr_c, n_resamples=n_bootstrap, seed=seed + 29 * seg_idx)
            return {
                "league": league,
                "market": market,
                "sport": sport,
                "n_events_holdout": n_eval,
                "n_events_paired_closing": n_paired,
                "closing_benchmark_available": True,
                "best_devig_method": devig_m,
                "w_effective": w_eff,
                "log_loss_model_all": float(np.mean(ll_mod_all)) if ll_mod_all else None,
                "log_loss_model": float(arr_m.mean()),
                "log_loss_blend": float(arr_b.mean()),
                "log_loss_closing_novig": float(arr_c.mean()),
                "delta_model_vs_closing": d_mod["mean"],
                "delta_model_vs_closing_ci95": d_mod["ci95"],
                "delta_model_vs_closing_significance": d_mod["significance_label"],
                "delta_blend_vs_closing": d_bl["mean"],
                "delta_blend_vs_closing_ci95": d_bl["ci95"],
                "delta_blend_vs_closing_significance": d_bl["significance_label"],
            }

        return {
            "league": league,
            "market": market,
            "sport": sport,
            "n_events_holdout": n_eval,
            "n_events_paired_closing": n_paired,
            "closing_benchmark_available": False,
            "best_devig_method": devig_m,
            "w_effective": w_eff,
            "log_loss_model_all": float(np.mean(ll_mod_all)) if ll_mod_all else None,
            "log_loss_model": float(ll_mod_paired[0]) if n_paired == 1 else None,
            "log_loss_blend": (
                float(ll_bl_paired[0]) if n_paired == 1 else (float(np.mean(ll_bl_open)) if ll_bl_open else None)
            ),
            "log_loss_closing_novig": float(ll_cl_paired[0]) if n_paired == 1 else None,
            "delta_model_vs_closing": (ll_mod_paired[0] - ll_cl_paired[0]) if n_paired == 1 else None,
            "delta_model_vs_closing_ci95": None,
            "delta_model_vs_closing_significance": "no significativa",
            "delta_blend_vs_closing": (ll_bl_paired[0] - ll_cl_paired[0]) if n_paired == 1 else None,
            "delta_blend_vs_closing_ci95": None,
            "delta_blend_vs_closing_significance": "no significativa",
        }

    # 1. Segmentos de Fútbol
    all_soc_leagues = sorted(
        {str(v["league"]) for v in blend_segments.values() if v["sport"] == "football"}
        | set(soc_ho["league"].astype(str).unique())
    )
    seg_counter = 0

    for lg in all_soc_leagues:
        lg_df = soc_ho[soc_ho["league"] == lg].reset_index(drop=True)

        # preparar listas por mercado
        m1_pm, m1_op, m1_cl, m1_y = [], [], [], []
        ah_pm, ah_op, ah_cl, ah_y = [], [], [], []
        tot_pm, tot_op, tot_cl, tot_y = [], [], [], []

        devig_1x2 = str((blend_segments.get(f"{lg}::1x2") or {}).get("best_devig_method", "power"))
        devig_ah = str((blend_segments.get(f"{lg}::ah") or {}).get("best_devig_method", "power"))
        devig_tot = str((blend_segments.get(f"{lg}::totals") or {}).get("best_devig_method", "power"))

        for r in lg_df.itertuples(index=False):
            eid = str(r.event_id)
            src_mode = str(getattr(r, "source_mode", "historical_fd"))
            ev_odds = odds_by_event_holdout.get(eid, [])
            dec_q = bt._extract_decision_quotes_for_event(
                {"event_id": eid, "source_mode": src_mode}, ev_odds, None, r.ts_decision
            )
            h_g = float(r.home_score)
            a_g = float(r.away_score)
            lh = float(r.dc_lam_home) if pd.notna(r.dc_lam_home) else 1.45
            la = float(r.dc_lam_away) if pd.notna(r.dc_lam_away) else 1.15

            # a) 1x2
            pm_1x2 = np.array([float(r.p_model_home), float(r.p_model_draw), float(r.p_model_away)], dtype=np.float64)
            q_op_1x2, _ = _extract_pre_decision_market_quote(dec_q, "1x2", ("home", "draw", "away"), open_prio_soc)
            pop_1x2 = pe.devig_prices_by_method(q_op_1x2, devig_1x2) if q_op_1x2 is not None else None
            cl_1x2 = bt.resolve_sharp_closing_market(ev_odds, market="1x2", line=None, ts_event_start=r.ts_event_start)
            pcl_1x2 = (
                np.array([cl_1x2["probs_novig"][s] for s in ("home", "draw", "away")], dtype=np.float64)
                if not cl_1x2["closing_missing"]
                else None
            )
            m1_pm.append(pm_1x2)
            m1_op.append(pop_1x2)
            m1_cl.append(pcl_1x2)
            m1_y.append(int(r.y))

            # b) ah
            q_op_ah, ln_ah = _extract_pre_decision_market_quote(dec_q, "ah", ("home", "away"), open_prio_soc)
            if q_op_ah is not None and ln_ah is not None:
                diff_ah = (h_g - a_g) + ln_ah
                if abs(diff_ah) > 1e-9:
                    y_ah = 0 if diff_ah > 0.0 else 1
                    pm_ah = pe._dixon_coles_2way_matrix(np.array([lh]), np.array([la]), np.array([ln_ah]), "ah")[0]
                    pop_ah = pe.devig_prices_by_method(q_op_ah, devig_ah)
                    cl_ah = bt.resolve_sharp_closing_market(
                        ev_odds, market="ah", line=ln_ah, ts_event_start=r.ts_event_start
                    )
                    pcl_ah = (
                        np.array([cl_ah["probs_novig"][s] for s in ("home", "away")], dtype=np.float64)
                        if not cl_ah["closing_missing"]
                        else None
                    )
                    ah_pm.append(pm_ah)
                    ah_op.append(pop_ah)
                    ah_cl.append(pcl_ah)
                    ah_y.append(y_ah)

            # c) totals
            q_op_tot, ln_tot = _extract_pre_decision_market_quote(dec_q, "totals", ("over", "under"), open_prio_soc)
            if q_op_tot is not None and ln_tot is not None:
                diff_tot = (h_g + a_g) - ln_tot
                if abs(diff_tot) > 1e-9:
                    y_tot = 0 if diff_tot > 0.0 else 1
                    pm_tot = pe._dixon_coles_2way_matrix(np.array([lh]), np.array([la]), np.array([ln_tot]), "totals")[0]
                    pop_tot = pe.devig_prices_by_method(q_op_tot, devig_tot)
                    cl_tot = bt.resolve_sharp_closing_market(
                        ev_odds, market="totals", line=ln_tot, ts_event_start=r.ts_event_start
                    )
                    pcl_tot = (
                        np.array([cl_tot["probs_novig"][s] for s in ("over", "under")], dtype=np.float64)
                        if not cl_tot["closing_missing"]
                        else None
                    )
                    tot_pm.append(pm_tot)
                    tot_op.append(pop_tot)
                    tot_cl.append(pcl_tot)
                    tot_y.append(y_tot)

        seg_counter += 1
        out_cal[f"{lg}::1x2"] = _compute_seg_metrics(
            f"{lg}::1x2", lg, "1x2", "football", m1_pm, m1_op, m1_cl, m1_y, seg_counter
        )
        if f"{lg}::ah" in blend_segments or len(ah_y) > 0:
            seg_counter += 1
            out_cal[f"{lg}::ah"] = _compute_seg_metrics(
                f"{lg}::ah", lg, "ah", "football", ah_pm, ah_op, ah_cl, ah_y, seg_counter
            )
        if f"{lg}::totals" in blend_segments or len(tot_y) > 0:
            seg_counter += 1
            out_cal[f"{lg}::totals"] = _compute_seg_metrics(
                f"{lg}::totals", lg, "totals", "football", tot_pm, tot_op, tot_cl, tot_y, seg_counter
            )

    # 2. Segmentos NFL (`moneyline`, `spread`, `totals`)
    nfl_ho_merged = nfl_ho.merge(nfl_frozen_models["nfl_feats_df"], left_on="raw_event_id", right_on="game_id", how="left")
    ml_pm, ml_op, ml_cl, ml_y = [], [], [], []
    sp_pm, sp_op, sp_cl, sp_y = [], [], [], []
    nt_pm, nt_op, nt_cl, nt_y = [], [], [], []

    sp_cfg = nfl_frozen_models["spread"]
    tot_cfg = nfl_frozen_models["totals"]
    feat_cols_nfl = tot_cfg["feat_cols"]

    for _, row in nfl_ho_merged.iterrows():
        eid = str(row["event_id"])
        src_mode = str(row.get("source_mode") or "historical_fd")
        ts_dec = row["ts_decision"]
        ts_st = row["ts_event_start"]
        h_s = float(row["home_score"])
        a_s = float(row["away_score"])
        ev_odds = odds_by_event_holdout.get(eid, [])
        dec_q = bt._extract_decision_quotes_for_event({"event_id": eid, "source_mode": src_mode}, ev_odds, None, ts_dec)

        # En `nflverse` histórico las cuotas vienen marcadas como `close` consenso pre-partido (no sharp Pinnacle)
        p_home_ml = float(np.clip(row["p_model_home"], 1e-4, 1.0 - 1e-4))
        pm_v_ml = np.array([p_home_ml, 1.0 - p_home_ml], dtype=np.float64)
        q_op_ml, _ = _extract_pre_decision_market_quote(dec_q, "moneyline", ("home", "away"), open_prio_nfl)
        pop_ml = pe.devig_prices_by_method(q_op_ml, "power") if q_op_ml is not None else None
        cl_ml = bt.resolve_sharp_closing_market(ev_odds, market="moneyline", line=None, ts_event_start=ts_st)
        pcl_ml = (
            np.array([cl_ml["probs_novig"][s] for s in ("home", "away")], dtype=np.float64)
            if not cl_ml["closing_missing"]
            else None
        )
        y_m = -1 if abs(h_s - a_s) <= 1e-9 else (0 if h_s > a_s else 1)
        ml_pm.append(pm_v_ml)
        ml_op.append(pop_ml)
        ml_cl.append(pcl_ml)
        ml_y.append(y_m)

        # spread
        q_op_sp, ln_sp = _extract_pre_decision_market_quote(dec_q, "spread", ("home", "away"), open_prio_nfl)
        if ln_sp is None:
            for q in ev_odds:
                if _canonical_portfolio_market(q["market"]) == "spread" and q.get("line") is not None:
                    ln_sp = bt._normalize_line_key(q.get("line"))
                    break
        if ln_sp is not None:
            diff_sp = (h_s - a_s) + ln_sp
            if abs(diff_sp) > 1e-9:
                mu_sp = sp_cfg["slope"] * float(ndtri(p_home_ml))
                p_cov = float(np.clip(ndtr((mu_sp + ln_sp) / sp_cfg["sigma"]), 1e-6, 1.0 - 1e-6))
                pop_sp = pe.devig_prices_by_method(q_op_sp, "power") if q_op_sp is not None else None
                cl_sp = bt.resolve_sharp_closing_market(ev_odds, market="spread", line=ln_sp, ts_event_start=ts_st)
                pcl_sp = (
                    np.array([cl_sp["probs_novig"][s] for s in ("home", "away")], dtype=np.float64)
                    if not cl_sp["closing_missing"]
                    else None
                )
                sp_pm.append(np.array([p_cov, 1.0 - p_cov], dtype=np.float64))
                sp_op.append(pop_sp)
                sp_cl.append(pcl_sp)
                sp_y.append(0 if diff_sp > 0.0 else 1)

        # totals
        q_op_nt, ln_nt = _extract_pre_decision_market_quote(dec_q, "totals", ("over", "under"), open_prio_nfl)
        if ln_nt is None:
            for q in ev_odds:
                if _canonical_portfolio_market(q["market"]) == "totals" and q.get("line") is not None:
                    ln_nt = bt._normalize_line_key(q.get("line"))
                    break
        if ln_nt is not None:
            diff_nt = (h_s + a_s) - ln_nt
            if abs(diff_nt) > 1e-9:
                x_vec = np.array(
                    [
                        float(row[c]) if (c in row and pd.notna(row[c])) else float(tot_cfg["col_med"][i])
                        for i, c in enumerate(feat_cols_nfl)
                    ],
                    dtype=np.float64,
                )
                z_vec = (x_vec - tot_cfg["mu_x"]) / tot_cfg["sd_x"]
                mu_tot = float(tot_cfg["y_mean"] + np.dot(z_vec, tot_cfg["beta"]))
                p_ov = float(np.clip(1.0 - ndtr((ln_nt - mu_tot) / tot_cfg["sigma"]), 1e-6, 1.0 - 1e-6))
                pop_nt = pe.devig_prices_by_method(q_op_nt, "power") if q_op_nt is not None else None
                cl_nt = bt.resolve_sharp_closing_market(ev_odds, market="totals", line=ln_nt, ts_event_start=ts_st)
                pcl_nt = (
                    np.array([cl_nt["probs_novig"][s] for s in ("over", "under")], dtype=np.float64)
                    if not cl_nt["closing_missing"]
                    else None
                )
                nt_pm.append(np.array([p_ov, 1.0 - p_ov], dtype=np.float64))
                nt_op.append(pop_nt)
                nt_cl.append(pcl_nt)
                nt_y.append(0 if diff_nt > 0.0 else 1)

    for mk_n, pm_l, op_l, cl_l, y_l in (
        ("moneyline", ml_pm, ml_op, ml_cl, ml_y),
        ("spread", sp_pm, sp_op, sp_cl, sp_y),
        ("totals", nt_pm, nt_op, nt_cl, nt_y),
    ):
        seg_counter += 1
        out_cal[f"NFL::{mk_n}"] = _compute_seg_metrics(
            f"NFL::{mk_n}", "NFL", mk_n, "nfl", pm_l, op_l, cl_l, y_l, seg_counter
        )

    return out_cal


def _empty_pick_seg_summary() -> dict[str, Any]:
    return {
        "n_picks": 0,
        "n_picks_with_closing": 0,
        "n_closing_missing": 0,
        "total_staked_u": 0.0,
        "total_pnl_u": 0.0,
        "roi_pct": 0.0,
        "roi_pct_ci95": [0.0, 0.0],
        "roi_significant": False,
        "roi_significance_label": "no significativa",
        "clv_pct_mean": None,
        "clv_pct_ci95": [0.0, 0.0],
        "clv_pct_significant": False,
        "clv_pct_significance_label": "no significativa",
        "clv_prob_mean": None,
        "clv_prob_ci95": [0.0, 0.0],
        "clv_prob_significant": False,
        "clv_prob_significance_label": "no significativa",
        "pct_picks_clv_positive": None,
        "pct_picks_clv_positive_ci95": [0.0, 0.0],
        "max_drawdown_u": 0.0,
    }


def run_sealed_holdout_evaluation(
    *,
    out_eval_path: Path = DEFAULT_SEALED_EVAL_JSON,
    registry_path: Path = DEFAULT_CONSOLIDATED_REGISTRY_JSONL,
    out_production_segments_path: Path = DEFAULT_PRODUCTION_SEGMENTS_JSON,
    bootstrap_samples: int = DEFAULT_BOOTSTRAP_SAMPLES,
    seed: int = DEFAULT_SEED,
) -> dict[str, Any]:
    """Ejecuta la apertura única y reproducible del `holdout_sealed` y genera los artefactos finales `v3.1`."""
    print("[A10] Paso 1/6 — Consolidando registro de pruebas múltiples pre-holdout (Olas 1-3)...", flush=True)
    mt_consolidation = consolidate_pre_holdout_trial_registries(registry_path)
    print(
        f"[A10] Registro consolidado OK: {mt_consolidation['n_olas_1_to_3_run_backtest_trials']} corridas "
        "walk_forward_dev (100% con unlock_holdout=False).",
        flush=True,
    )

    # Cargar configuraciones estrictamente congeladas en walk_forward_dev
    blend_artifact = json.loads(BLEND_WEIGHTS_JSON.read_text(encoding="utf-8"))
    blend_segments: dict[str, dict[str, Any]] = blend_artifact["segments"]
    enabled_model_segments = frozenset(k for k, v in blend_segments.items() if bool(v.get("model_picks_enabled")))

    frozen_pick_policy = json.loads(PICK_POLICY_JSON.read_text(encoding="utf-8"))
    pe.validate_pick_policy(frozen_pick_policy)

    frozen_stale_config = json.loads(STALE_LINES_CONFIG_JSON.read_text(encoding="utf-8"))
    sl.validate_stale_lines_config(frozen_stale_config)

    ola2_dev_ref = json.loads(OLA2_DEV_JSON.read_text(encoding="utf-8"))
    a6_eval_ref = json.loads(MARKETS_2WAY_EVAL_JSON.read_text(encoding="utf-8"))
    a7_eval_ref = json.loads(GBM_EVAL_JSON.read_text(encoding="utf-8"))
    a8_report_ref = json.loads(STALE_LINES_REPORT_JSON.read_text(encoding="utf-8"))

    print("[A10] Paso 2/6 — Cargando universo completo (70,812 eventos) y cuotas multimercado...", flush=True)
    loader_cfg = bt.BacktestConfig(
        phase="ola4_universe_load",
        preset="universe_load_v3_1",
        model_version="spacetime_v3.1",
        eval_split="walk_forward_dev",
        unlock_holdout=False,
        sports=("football", "nfl"),
        markets=("1x2", "moneyline", "ah", "totals", "spread"),
        bootstrap_samples=int(bootstrap_samples),
        seed=int(seed),
    )
    odds_all = bt._load_odds_snapshots(loader_cfg)

    base_ev_cfg = bt.BacktestConfig(
        phase="ola4_universe_load",
        preset="baseline_v3_0",
        model_version="spacetime_v3.0+geodesic_v2.0",
        eval_split="walk_forward_dev",
        unlock_holdout=False,
        sports=("football", "nfl"),
        markets=("1x2", "moneyline"),
        bootstrap_samples=int(bootstrap_samples),
        seed=int(seed),
    )
    raw_events = bt._build_baseline_v3_0_events(base_ev_cfg, odds_all)
    raw_events = raw_events[raw_events["y"].notna()].copy()
    events_checked = bt.verify_events_frame_no_leakage(raw_events)
    dev_df, holdout_df, split_meta = bt.split_walk_forward_and_holdout(events_checked, holdout_fraction=0.20)

    holdout_cut_ts = pd.Timestamp(split_meta["holdout_cut_ts"])
    if len(dev_df) != 56649 or len(holdout_df) != 14163:
        raise RuntimeError(f"Partición inesperada: dev={len(dev_df)}, holdout={len(holdout_df)}")
    if (dev_df["ts_event_start"] >= holdout_cut_ts).any() or (holdout_df["ts_event_start"] < holdout_cut_ts).any():
        raise bt.DataLeakageError("Frontera temporal violada entre walk_forward_dev y holdout_sealed.")
    if set(dev_df["event_id"].astype(str)) & set(holdout_df["event_id"].astype(str)):
        raise bt.DataLeakageError("Solapamiento de event_id entre walk_forward_dev y holdout_sealed.")

    submodel_lookup = pe.load_submodel_dispersion_lookup()

    # Cuotas de `walk_forward_dev` para referencia pre-holdout
    dev_eids = set(dev_df["event_id"].astype(str).unique())
    scoped_dev_odds = odds_all[
        (odds_all["ts_event_start"] < holdout_cut_ts)
        & (odds_all["event_id"].astype(str).isin(dev_eids))
        & (odds_all["book_canon"].isin(RELEVANT_ALL_BOOKS))
        & (odds_all["market_canon"].isin(["1x2", "moneyline", "ah", "totals", "spread"]))
    ].copy()
    scoped_dev_odds["snapshot_stage"] = scoped_dev_odds["snapshot_stage"].fillna("").astype(str).str.lower()
    odds_by_event_dev = bt._group_odds_records(scoped_dev_odds)
    secondary_specs_dev = pe._build_secondary_market_specs_for_dev(dev_df, scoped_dev_odds, submodel_lookup)

    print("[A10] Paso 3/6 — Ejecutando referencias walk_forward_dev (unlock_holdout=False) antes de abrir holdout...", flush=True)
    # Reproducir en registro efímero las 3 fases dev ya registradas en Olas 1-3 (sin duplicar trial_seq 1..24)
    with tempfile.TemporaryDirectory() as tmp_dir:
        eph_reg = Path(tmp_dir) / "ephemeral_dev_repro.jsonl"
        rep_dev_p0 = bt.run_backtest(
            bt.BacktestConfig(
                phase="ola1_puerta1_baseline_v3_0",
                preset="baseline_v3_0",
                model_version="spacetime_v3.0+geodesic_v2.0",
                eval_split="walk_forward_dev",
                unlock_holdout=False,
                execution_delay_minutes=DEFAULT_EXECUTION_DELAY_MINUTES,
                historical_delay_alpha=DEFAULT_HISTORICAL_DELAY_ALPHA,
                bootstrap_samples=int(bootstrap_samples),
                seed=int(seed),
                registry_path=eph_reg,
                events_df=events_checked,
                odds_df=scoped_dev_odds,
            )
        )

        sel_dev_a5 = pe.StatefulBacktestPolicySelector(
            frozen_pick_policy,
            blend_segments,
            submodel_lookup,
            odds_by_event_dev,
            secondary_specs_by_event=secondary_specs_dev,
            allow_stale_sharp_arb=bool(frozen_pick_policy.get("allow_pure_market_arb", False)),
            stale_arb_min_sharp_edge=float(frozen_pick_policy.get("stale_arb_min_sharp_edge", 0.028)),
        )
        rep_dev_p1 = bt.run_backtest(
            bt.BacktestConfig(
                phase="ola2_puerta2_picks_v3_1",
                preset="pick_policy_v3_1",
                model_version="spacetime_v3.1_geodesic_picks",
                eval_split="walk_forward_dev",
                unlock_holdout=False,
                execution_books_priority=A5_EXEC_BOOKS_PRIORITY,
                line_shopping=True,
                execution_delay_minutes=DEFAULT_EXECUTION_DELAY_MINUTES,
                historical_delay_alpha=DEFAULT_HISTORICAL_DELAY_ALPHA,
                bootstrap_samples=int(bootstrap_samples),
                seed=int(seed),
                registry_path=eph_reg,
                events_df=events_checked,
                odds_df=scoped_dev_odds,
                pick_selector_fn=sel_dev_a5,
                extra_config_tag={"policy_version": "pick_policy_v3.1_ola2", "alpha": 0.05},
            )
        )
        settled_dev_p1, caps_dev_p1 = _reconstruct_and_audit_settled_picks(
            phase="ola2_puerta2_picks_v3_1",
            model_version="spacetime_v3.1_geodesic_picks",
            selected_decisions=sel_dev_a5.selected_decisions_log,
            active_df=dev_df,
            odds_by_event=odds_by_event_dev,
            enabled_model_segments=enabled_model_segments,
            bt_report=rep_dev_p1,
        )

        sel_dev_a8 = sl.StatefulStaleLineBacktestSelector(
            frozen_stale_config,
            blend_segments,
            submodel_lookup,
            odds_by_event_dev,
            secondary_specs_by_event=secondary_specs_dev,
            override_signal_mode="double_confirmation",
        )
        rep_dev_p2a = bt.run_backtest(
            bt.BacktestConfig(
                phase="ola3_a8_frozen_double_confirmation_dev",
                preset="stale_lines_double_confirmation_frozen",
                model_version="spacetime_v3.1_stale_lines_a8",
                eval_split="walk_forward_dev",
                unlock_holdout=False,
                execution_books_priority=A8_EXEC_BOOKS_PRIORITY,
                line_shopping=True,
                execution_delay_minutes=DEFAULT_EXECUTION_DELAY_MINUTES,
                historical_delay_alpha=DEFAULT_HISTORICAL_DELAY_ALPHA,
                bootstrap_samples=int(bootstrap_samples),
                seed=int(seed),
                registry_path=eph_reg,
                events_df=events_checked,
                odds_df=scoped_dev_odds,
                pick_selector_fn=sel_dev_a8,
            )
        )
        settled_dev_p2a, caps_dev_p2a = _reconstruct_and_audit_settled_picks(
            phase="ola3_a8_frozen_double_confirmation_dev",
            model_version="spacetime_v3.1_stale_lines_a8",
            selected_decisions=sel_dev_a8.selected_decisions_log,
            active_df=dev_df,
            odds_by_event=odds_by_event_dev,
            enabled_model_segments=enabled_model_segments,
            bt_report=rep_dev_p2a,
        )

    # Registrar en `holdout_trial_registry.jsonl` (`trial_seq=25`, `unlock_holdout=False`) la línea base integrada en dev
    sel_dev_int = IntegratedV31BacktestSelector(
        frozen_pick_policy,
        frozen_stale_config,
        blend_segments,
        submodel_lookup,
        odds_by_event_dev,
        secondary_specs_by_event=secondary_specs_dev,
    )
    rep_dev_int = bt.run_backtest(
        bt.BacktestConfig(
            phase="ola4_pre_holdout_integrated_v3_1_dev",
            preset="integrated_v3_1_a4_a5_a8",
            model_version="spacetime_v3.1_integrated_a4_a5_a8",
            eval_split="walk_forward_dev",
            unlock_holdout=False,
            execution_books_priority=INTEGRATED_EXEC_BOOKS_PRIORITY,
            line_shopping=True,
            execution_delay_minutes=DEFAULT_EXECUTION_DELAY_MINUTES,
            historical_delay_alpha=DEFAULT_HISTORICAL_DELAY_ALPHA,
            bootstrap_samples=int(bootstrap_samples),
            seed=int(seed),
            registry_path=registry_path,
            events_df=events_checked,
            odds_df=scoped_dev_odds,
            pick_selector_fn=sel_dev_int,
            extra_config_tag={"components": "A4+A5(model_12)+A8(double_conf)", "a6_enabled": False, "a7_enabled": False},
        )
    )
    settled_dev_int, caps_dev_int = _reconstruct_and_audit_settled_picks(
        phase="ola4_pre_holdout_integrated_v3_1_dev",
        model_version="spacetime_v3.1_integrated_a4_a5_a8",
        selected_decisions=sel_dev_int.selected_decisions_log,
        active_df=dev_df,
        odds_by_event=odds_by_event_dev,
        enabled_model_segments=enabled_model_segments,
        bt_report=rep_dev_int,
    )
    print(
        f"[A10] Referencia dev integrada (trial_seq={rep_dev_int['holdout_audit']['trial_seq']}): "
        f"n_picks={rep_dev_int['n_picks']}, CLV%={(rep_dev_int['clv_pct_mean'] or 0.0)*100:+.2f}%, "
        f"ROI%={rep_dev_int['roi_pct']*100:+.2f}%.",
        flush=True,
    )

    # -----------------------------------------------------------------------
    # Paso 4/6 — APERTURA ÚNICA DEL HOLDOUT SELLADO (`unlock_holdout=True`)
    # -----------------------------------------------------------------------
    print(
        "[A10] Paso 4/6 — ABRIENDO HOLDOUT SELLADO POR ÚNICA VEZ (14,163 eventos >= 2025-02-02T17:30:00Z)...",
        flush=True,
    )
    holdout_eids = set(holdout_df["event_id"].astype(str).unique())
    scoped_holdout_odds = odds_all[
        (odds_all["ts_event_start"] >= holdout_cut_ts)
        & (odds_all["event_id"].astype(str).isin(holdout_eids))
        & (odds_all["book_canon"].isin(RELEVANT_ALL_BOOKS))
        & (odds_all["market_canon"].isin(["1x2", "moneyline", "ah", "totals", "spread"]))
    ].copy()
    scoped_holdout_odds["snapshot_stage"] = scoped_holdout_odds["snapshot_stage"].fillna("").astype(str).str.lower()

    # Verificación anti-fuga explícita en todas las cuotas `open` del holdout
    ho_dec_map = dict(zip(holdout_df["event_id"].astype(str), holdout_df["ts_decision"]))
    ho_open_rows = scoped_holdout_odds[scoped_holdout_odds["snapshot_stage"] == "open"]
    if not ho_open_rows.empty:
        leaked_ho = ho_open_rows["ts_captured"] > ho_open_rows["event_id"].astype(str).map(ho_dec_map)
        if leaked_ho.any():
            bad_r = ho_open_rows.loc[leaked_ho].iloc[0]
            raise bt.DataLeakageError(
                f"Fuga temporal en open de holdout event_id={bad_r['event_id']}: ts_captured > ts_decision"
            )

    odds_by_event_holdout = bt._group_odds_records(scoped_holdout_odds)
    secondary_specs_holdout = pe._build_secondary_market_specs_for_dev(
        holdout_df, scoped_holdout_odds, submodel_lookup
    )

    # 4a) Fase 0 — Línea Base `v3.0` (`Geodesic v2.0`)
    rep_ho_p0 = bt.run_backtest(
        bt.BacktestConfig(
            phase="holdout_sealed_phase0_baseline_v3_0",
            preset="baseline_v3_0",
            model_version="spacetime_v3.0+geodesic_v2.0",
            eval_split="holdout_sealed",
            unlock_holdout=True,
            execution_delay_minutes=DEFAULT_EXECUTION_DELAY_MINUTES,
            historical_delay_alpha=DEFAULT_HISTORICAL_DELAY_ALPHA,
            bootstrap_samples=int(bootstrap_samples),
            seed=int(seed),
            registry_path=registry_path,
            events_df=events_checked,
            odds_df=scoped_holdout_odds,
        )
    )
    print(
        f"[A10] Holdout Fase 0 (Baseline v3.0): n_picks={rep_ho_p0['n_picks']}, "
        f"CLV%={(rep_ho_p0['clv_pct_mean'] or 0.0)*100:+.2f}%, ROI%={rep_ho_p0['roi_pct']*100:+.2f}%",
        flush=True,
    )

    # 4b) Fase 1 (Ola 2) — Política de Picks `v3.1` (`A4 + A5` congelada tal cual en `ce348e0`)
    sel_ho_a5 = pe.StatefulBacktestPolicySelector(
        frozen_pick_policy,
        blend_segments,
        submodel_lookup,
        odds_by_event_holdout,
        secondary_specs_by_event=secondary_specs_holdout,
        allow_stale_sharp_arb=bool(frozen_pick_policy.get("allow_pure_market_arb", False)),
        stale_arb_min_sharp_edge=float(frozen_pick_policy.get("stale_arb_min_sharp_edge", 0.028)),
    )
    rep_ho_p1 = bt.run_backtest(
        bt.BacktestConfig(
            phase="holdout_sealed_phase1_ola2_picks_v3_1",
            preset="pick_policy_v3_1",
            model_version="spacetime_v3.1_geodesic_picks",
            eval_split="holdout_sealed",
            unlock_holdout=True,
            execution_books_priority=A5_EXEC_BOOKS_PRIORITY,
            line_shopping=True,
            execution_delay_minutes=DEFAULT_EXECUTION_DELAY_MINUTES,
            historical_delay_alpha=DEFAULT_HISTORICAL_DELAY_ALPHA,
            bootstrap_samples=int(bootstrap_samples),
            seed=int(seed),
            registry_path=registry_path,
            events_df=events_checked,
            odds_df=scoped_holdout_odds,
            pick_selector_fn=sel_ho_a5,
            extra_config_tag={"policy_version": "pick_policy_v3.1_ola2", "alpha": 0.05},
        )
    )
    settled_ho_p1, caps_ho_p1 = _reconstruct_and_audit_settled_picks(
        phase="holdout_sealed_phase1_ola2_picks_v3_1",
        model_version="spacetime_v3.1_geodesic_picks",
        selected_decisions=sel_ho_a5.selected_decisions_log,
        active_df=holdout_df,
        odds_by_event=odds_by_event_holdout,
        enabled_model_segments=enabled_model_segments,
        bt_report=rep_ho_p1,
    )
    print(
        f"[A10] Holdout Fase 1 (Ola 2 A4+A5): n_picks={rep_ho_p1['n_picks']}, "
        f"CLV%={(rep_ho_p1['clv_pct_mean'] or 0.0)*100:+.2f}%, ROI%={rep_ho_p1['roi_pct']*100:+.2f}%",
        flush=True,
    )

    # 4c) Fase 2a (Ola 3) — Detector de Líneas Rezagadas Doble Confirmación (`A8` congelado en `700dd24`)
    sel_ho_a8 = sl.StatefulStaleLineBacktestSelector(
        frozen_stale_config,
        blend_segments,
        submodel_lookup,
        odds_by_event_holdout,
        secondary_specs_by_event=secondary_specs_holdout,
        override_signal_mode="double_confirmation",
    )
    rep_ho_p2a = bt.run_backtest(
        bt.BacktestConfig(
            phase="holdout_sealed_phase2a_ola3_stale_lines_a8",
            preset="stale_lines_double_confirmation_frozen",
            model_version="spacetime_v3.1_stale_lines_a8",
            eval_split="holdout_sealed",
            unlock_holdout=True,
            execution_books_priority=A8_EXEC_BOOKS_PRIORITY,
            line_shopping=True,
            execution_delay_minutes=DEFAULT_EXECUTION_DELAY_MINUTES,
            historical_delay_alpha=DEFAULT_HISTORICAL_DELAY_ALPHA,
            bootstrap_samples=int(bootstrap_samples),
            seed=int(seed),
            registry_path=registry_path,
            events_df=events_checked,
            odds_df=scoped_holdout_odds,
            pick_selector_fn=sel_ho_a8,
            extra_config_tag={"signal_mode": "double_confirmation", "alpha": 0.05},
        )
    )
    settled_ho_p2a, caps_ho_p2a = _reconstruct_and_audit_settled_picks(
        phase="holdout_sealed_phase2a_ola3_stale_lines_a8",
        model_version="spacetime_v3.1_stale_lines_a8",
        selected_decisions=sel_ho_a8.selected_decisions_log,
        active_df=holdout_df,
        odds_by_event=odds_by_event_holdout,
        enabled_model_segments=enabled_model_segments,
        bt_report=rep_ho_p2a,
    )
    print(
        f"[A10] Holdout Fase 2a (Ola 3 A8): n_picks={rep_ho_p2a['n_picks']}, "
        f"CLV%={(rep_ho_p2a['clv_pct_mean'] or 0.0)*100:+.2f}%, ROI%={rep_ho_p2a['roi_pct']*100:+.2f}%",
        flush=True,
    )

    # 4d) Fase 2b (Sistema Integrado Final `v3.1`) — `A4 + A5(model_12) + A8(double_conf)`
    sel_ho_int = IntegratedV31BacktestSelector(
        frozen_pick_policy,
        frozen_stale_config,
        blend_segments,
        submodel_lookup,
        odds_by_event_holdout,
        secondary_specs_by_event=secondary_specs_holdout,
    )
    rep_ho_int = bt.run_backtest(
        bt.BacktestConfig(
            phase="holdout_sealed_phase2b_integrated_v3_1",
            preset="integrated_v3_1_a4_a5_a8",
            model_version="spacetime_v3.1_integrated_a4_a5_a8",
            eval_split="holdout_sealed",
            unlock_holdout=True,
            execution_books_priority=INTEGRATED_EXEC_BOOKS_PRIORITY,
            line_shopping=True,
            execution_delay_minutes=DEFAULT_EXECUTION_DELAY_MINUTES,
            historical_delay_alpha=DEFAULT_HISTORICAL_DELAY_ALPHA,
            bootstrap_samples=int(bootstrap_samples),
            seed=int(seed),
            registry_path=registry_path,
            events_df=events_checked,
            odds_df=scoped_holdout_odds,
            pick_selector_fn=sel_ho_int,
            extra_config_tag={"components": "A4+A5(model_12)+A8(double_conf)", "a6_enabled": False, "a7_enabled": False},
        )
    )
    settled_ho_int, caps_ho_int = _reconstruct_and_audit_settled_picks(
        phase="holdout_sealed_phase2b_integrated_v3_1",
        model_version="spacetime_v3.1_integrated_a4_a5_a8",
        selected_decisions=sel_ho_int.selected_decisions_log,
        active_df=holdout_df,
        odds_by_event=odds_by_event_holdout,
        enabled_model_segments=enabled_model_segments,
        bt_report=rep_ho_int,
    )
    print(
        f"[A10] Holdout Fase 2b (Sistema Integrado v3.1): n_picks={rep_ho_int['n_picks']}, "
        f"CLV%={(rep_ho_int['clv_pct_mean'] or 0.0)*100:+.2f}%, ROI%={rep_ho_int['roi_pct']*100:+.2f}%",
        flush=True,
    )

    # -----------------------------------------------------------------------
    # Paso 5/6 — Tabla Completa `liga × mercado` en `walk_forward_dev` y `holdout_sealed`
    # -----------------------------------------------------------------------
    print("[A10] Paso 5/6 — Calculando tabla completa liga × mercado en holdout_sealed...", flush=True)
    holdout_cal_by_seg = evaluate_holdout_calibration_by_segment(
        dev_df=dev_df,
        holdout_df=holdout_df,
        odds_by_event_holdout=odds_by_event_holdout,
        blend_segments=blend_segments,
        n_bootstrap=int(bootstrap_samples),
        seed=int(seed),
    )

    all_seg_keys = sorted(set(blend_segments.keys()) | set(holdout_cal_by_seg.keys()))
    dev_int_by_lm = rep_dev_int["betting"]["by_league_market"]
    ho_int_by_lm = rep_ho_int["betting"]["by_league_market"]
    ho_a5_by_lm = rep_ho_p1["betting"]["by_league_market"]
    ho_a8_by_lm = rep_ho_p2a["betting"]["by_league_market"]

    league_market_table: dict[str, dict[str, Any]] = {}
    production_segments_map: dict[str, dict[str, Any]] = {}
    enabled_prod_keys: list[str] = []
    raw_ci_pos_any_n_keys: list[str] = []
    raw_ci_pos_ge6_keys: list[str] = []
    disabled_reasons_prod: dict[str, int] = {}

    for seg_k in all_seg_keys:
        lg, mk = seg_k.split("::", 1)
        lm_bt_key = f"{lg}__{mk}"
        b_dev = blend_segments.get(seg_k) or {}
        pol_seg = (frozen_pick_policy.get("segments") or {}).get(seg_k) or {}
        buckets_pol = pol_seg.get("buckets") or frozen_pick_policy.get("default_buckets") or {}

        ev_sol_map = {b: float(buckets_pol[b]["ev_threshold_solido"]) for b in pe.ODDS_BUCKETS if b in buckets_pol}
        ev_val_map = {b: float(buckets_pol[b]["ev_threshold_valor"]) for b in pe.ODDS_BUCKETS if b in buckets_pol}
        p_edge_map = {b: float(buckets_pol[b]["p_edge_min"]) for b in pe.ODDS_BUCKETS if b in buckets_pol}

        ho_cal = holdout_cal_by_seg.get(seg_k) or {
            "league": lg,
            "market": mk,
            "sport": str(b_dev.get("sport", "football")),
            "n_events_holdout": 0,
            "n_events_paired_closing": 0,
            "closing_benchmark_available": False,
            "best_devig_method": str(b_dev.get("best_devig_method", "power")),
            "w_effective": float(b_dev.get("w_effective", 0.0)),
            "log_loss_model_all": None,
            "log_loss_model": None,
            "log_loss_blend": None,
            "log_loss_closing_novig": None,
            "delta_model_vs_closing": None,
            "delta_model_vs_closing_ci95": None,
            "delta_model_vs_closing_significance": "no significativa",
            "delta_blend_vs_closing": None,
            "delta_blend_vs_closing_ci95": None,
            "delta_blend_vs_closing_significance": "no significativa",
        }

        dev_pk = dev_int_by_lm.get(lm_bt_key) or _empty_pick_seg_summary()
        ho_pk_int = ho_int_by_lm.get(lm_bt_key) or _empty_pick_seg_summary()
        ho_pk_a5 = ho_a5_by_lm.get(lm_bt_key) or _empty_pick_seg_summary()
        ho_pk_a8 = ho_a8_by_lm.get(lm_bt_key) or _empty_pick_seg_summary()

        n_ho_picks = int(ho_pk_int["n_picks"])
        n_ho_clv = int(ho_pk_int["n_picks_with_closing"])
        ho_clv_mean = ho_pk_int["clv_pct_mean"]
        ho_clv_ci = ho_pk_int["clv_pct_ci95"]
        ho_ci_low = float(ho_clv_ci[0]) if (ho_clv_ci is not None and len(ho_clv_ci) == 2) else 0.0

        raw_boot_pos_ge2 = bool(n_ho_clv >= 2 and ho_clv_mean is not None and float(ho_clv_mean) > 0.0 and ho_ci_low > 0.0)
        raw_boot_pos_ge6 = bool(n_ho_clv >= 6 and raw_boot_pos_ge2)
        if raw_boot_pos_ge2:
            raw_ci_pos_any_n_keys.append(seg_k)
        if raw_boot_pos_ge6:
            raw_ci_pos_ge6_keys.append(seg_k)

        if n_ho_picks == 0:
            prod_enabled = False
            prod_reason: str | None = (
                "disabled_in_dev_and_zero_holdout_stale_picks"
                if not bool(b_dev.get("model_picks_enabled", False))
                else "zero_holdout_picks_emitted"
            )
        elif n_ho_clv == 0 or ho_clv_mean is None:
            prod_enabled = False
            prod_reason = "missing_sharp_closing_benchmark_in_holdout"
        elif float(ho_clv_mean) <= 0.0:
            prod_enabled = False
            prod_reason = "holdout_clv_negative_or_zero"
        elif ho_ci_low <= 0.0:
            prod_enabled = False
            prod_reason = "holdout_clv_ci95_crosses_zero"
        elif n_ho_clv < MIN_SEGMENT_PICKS_FOR_VALID_CI95:
            prod_enabled = False
            prod_reason = f"insufficient_holdout_sample_for_valid_ci95_n_lt_{MIN_SEGMENT_PICKS_FOR_VALID_CI95}"
        else:
            prod_enabled = True
            prod_reason = None
            enabled_prod_keys.append(seg_k)

        if not prod_enabled and prod_reason is not None:
            disabled_reasons_prod[prod_reason] = disabled_reasons_prod.get(prod_reason, 0) + 1

        row_entry = {
            "segment_key": seg_k,
            "league": lg,
            "market": mk,
            "sport": str(ho_cal["sport"]),
            "best_devig_method": str(b_dev.get("best_devig_method", ho_cal["best_devig_method"])),
            "w_effective": float(b_dev.get("w_effective", ho_cal["w_effective"])),
            "dev_model_picks_enabled": bool(b_dev.get("model_picks_enabled", False)),
            "dev_disabled_reason": b_dev.get("disabled_reason"),
            "ev_thresholds_solido": ev_sol_map,
            "ev_thresholds_valor": ev_val_map,
            "p_edge_min_by_bucket": p_edge_map,
            "walk_forward_dev": {
                "n_events_evaluated": int(b_dev.get("n_events_oos_evaluated", 0)),
                "n_events_paired_closing": int(b_dev.get("n_events_paired_closing", 0)),
                "log_loss_model": b_dev.get("log_loss_model_paired_closing") or b_dev.get("log_loss_model"),
                "log_loss_blend": b_dev.get("log_loss_blend_paired_closing") or b_dev.get("log_loss_blend"),
                "log_loss_closing_novig": b_dev.get("log_loss_closing_novig"),
                "delta_model_vs_closing": b_dev.get("delta_model_vs_closing"),
                "delta_model_vs_closing_ci95": b_dev.get("delta_model_vs_closing_ci95"),
                "delta_blend_vs_closing": b_dev.get("delta_blend_vs_closing"),
                "delta_blend_vs_closing_ci95": b_dev.get("delta_blend_vs_closing_ci95"),
                "delta_blend_vs_closing_significance": b_dev.get("delta_blend_vs_closing_significance", "no significativa"),
                "picks_integrated_v3_1": dev_pk,
            },
            "holdout_sealed": {
                "n_events_evaluated": ho_cal["n_events_holdout"],
                "n_events_paired_closing": ho_cal["n_events_paired_closing"],
                "closing_benchmark_available": ho_cal["closing_benchmark_available"],
                "log_loss_model_all": ho_cal["log_loss_model_all"],
                "log_loss_model": ho_cal["log_loss_model"],
                "log_loss_blend": ho_cal["log_loss_blend"],
                "log_loss_closing_novig": ho_cal["log_loss_closing_novig"],
                "delta_model_vs_closing": ho_cal["delta_model_vs_closing"],
                "delta_model_vs_closing_ci95": ho_cal["delta_model_vs_closing_ci95"],
                "delta_model_vs_closing_significance": ho_cal["delta_model_vs_closing_significance"],
                "delta_blend_vs_closing": ho_cal["delta_blend_vs_closing"],
                "delta_blend_vs_closing_ci95": ho_cal["delta_blend_vs_closing_ci95"],
                "delta_blend_vs_closing_significance": ho_cal["delta_blend_vs_closing_significance"],
                "picks_integrated_v3_1": ho_pk_int,
                "picks_ola2_a5_standalone": ho_pk_a5,
                "picks_ola3_a8_standalone": ho_pk_a8,
            },
            "production_enabled": prod_enabled,
            "production_disabled_reason": prod_reason,
            "raw_bootstrap_ci95_above_zero_n_ge_2": raw_boot_pos_ge2,
            "raw_bootstrap_ci95_above_zero_n_ge_6": raw_boot_pos_ge6,
        }
        league_market_table[seg_k] = row_entry

        production_segments_map[seg_k] = {
            "league": lg,
            "market": mk,
            "sport": str(ho_cal["sport"]),
            "production_enabled": prod_enabled,
            "disabled_reason": prod_reason,
            "dev_model_picks_enabled": bool(b_dev.get("model_picks_enabled", False)),
            "dev_disabled_reason": b_dev.get("disabled_reason"),
            "best_devig_method": str(b_dev.get("best_devig_method", ho_cal["best_devig_method"])),
            "w_effective": float(b_dev.get("w_effective", ho_cal["w_effective"])),
            "ev_thresholds_solido": ev_sol_map,
            "ev_thresholds_valor": ev_val_map,
            "holdout_n_picks": n_ho_picks,
            "holdout_n_picks_with_closing": n_ho_clv,
            "holdout_roi_pct": ho_pk_int["roi_pct"],
            "holdout_roi_pct_ci95": ho_pk_int["roi_pct_ci95"],
            "holdout_roi_significance": ho_pk_int["roi_significance_label"],
            "holdout_clv_pct_mean": ho_clv_mean,
            "holdout_clv_pct_ci95": ho_clv_ci,
            "holdout_clv_pct_significance": (
                ho_pk_int["clv_pct_significance_label"]
                if n_ho_clv >= MIN_SEGMENT_PICKS_FOR_VALID_CI95
                else "no significativa"
            ),
            "holdout_clv_prob_mean": ho_pk_int["clv_prob_mean"],
            "holdout_clv_prob_ci95": ho_pk_int["clv_prob_ci95"],
            "holdout_pct_picks_clv_positive": ho_pk_int["pct_picks_clv_positive"],
            "raw_bootstrap_ci95_above_zero_n_ge_2": raw_boot_pos_ge2,
            "raw_bootstrap_ci95_above_zero_n_ge_6": raw_boot_pos_ge6,
        }

    # Leer el registro final completo tras las corridas del holdout
    final_registry_entries = _read_jsonl(registry_path)
    n_pre_holdout_total = sum(1 for e in final_registry_entries if not bool(e.get("unlock_holdout", False)))
    n_holdout_runs = sum(1 for e in final_registry_entries if bool(e.get("unlock_holdout", False)))

    ho_int_clv_ci = rep_ho_int["clv_pct_ci95"]
    portfolio_clv_sig_pos = bool(
        int(rep_ho_int["betting"]["global"]["n_picks_with_closing"]) >= MIN_SEGMENT_PICKS_FOR_VALID_CI95
        and rep_ho_int["clv_pct_mean"] is not None
        and float(rep_ho_int["clv_pct_mean"]) > 0.0
        and ho_int_clv_ci is not None
        and float(ho_int_clv_ci[0]) > 0.0
    )

    generated_ts = datetime.now(timezone.utc).isoformat(timespec="seconds")

    # -----------------------------------------------------------------------
    # Paso 6/6 — Materializar `production_segments_v3_1.json` y `sealed_holdout_v3_1_eval.json`
    # -----------------------------------------------------------------------
    print("[A10] Paso 6/6 — Guardando artefactos finales auditables...", flush=True)
    production_segments_artifact: dict[str, Any] = {
        "schema_version": "production_segments_v3.1.0",
        "generated_at_utc": generated_ts,
        "reproduction_command": (
            "research/prediction-lab/.venv/Scripts/python.exe services/models/evaluate_sealed_holdout_v3_1.py"
        ),
        "holdout_cut_ts": split_meta["holdout_cut_ts"],
        "holdout_events_evaluated": int(split_meta["n_holdout"]),
        "activation_criterion": (
            f"production_enabled = true SI Y SOLO SI en holdout_sealed (Sistema Integrado v3.1: A4 + A5 + A8) "
            f"el segmento liga × mercado logra n_picks_with_closing >= {MIN_SEGMENT_PICKS_FOR_VALID_CI95} "
            "(mismo piso muestral pre-registrado en picks_engine.py:2235), clv_pct_mean > 0.0 y "
            "clv_pct_ci95[0] > 0.0 (IC 95% bootstrap de 1,000 remuestreos que NO cruza 0). "
            "Cualquier otro segmento queda explícitamente apagado (production_enabled = false) con disabled_reason."
        ),
        "multiple_testing_audit": {
            "n_olas_1_to_3_dev_run_backtest_trials": mt_consolidation["n_olas_1_to_3_run_backtest_trials"],
            "n_pre_holdout_dev_run_backtest_trials_total": n_pre_holdout_total,
            "n_sealed_holdout_single_pass_runs": n_holdout_runs,
            "zero_post_holdout_retuning": True,
        },
        "component_status": {
            "a4_logit_blend_devig": {
                "production_activated": True,
                "n_segments_model_enabled_dev": len(enabled_model_segments),
                "n_segments_model_disabled_dev": len(blend_segments) - len(enabled_model_segments),
            },
            "a5_pick_policy_shrunk_kelly_caps": {
                "production_activated": True,
                "tiers": ["solido", "valor"],
                "high_odds_tier_eliminated": True,
                "caps_u": {"per_pick": 2.0, "per_event": 2.0, "per_league_date": 3.0, "per_global_date": 5.0},
            },
            "a6_dixon_coles_2way_pure": {
                "production_activated": False,
                "n_segments_enabled": 0,
                "n_segments_evaluated": 92,
                "disabled_reason": "0/92 segmentos superan cierre Pinnacle sin margen con DC bivariado puro (Regla #4)",
            },
            "a7_gbm_calibrated_1x2": {
                "production_activated": False,
                "disabled_reason": (
                    "Paradoja de composición: mejora log-loss puro (-0.01105 nats) pero degrada CLV OOF en -1.46 pp"
                ),
            },
            "a8_stale_lines_double_confirmation": {
                "production_activated": True,
                "signal_mode": "double_confirmation",
                "recommended_cadence_minutes": {
                    str(reg["regime_id"]): round(float(reg["recommended_interval_minutes"]), 4)
                    for reg in a8_report_ref["recommended_scraping_cadence"]["regimes"]
                },
            },
        },
        "portfolio_vs_segment_verdict": {
            "portfolio_integrated_v3_1_holdout": {
                "n_picks": rep_ho_int["n_picks"],
                "n_picks_with_closing": rep_ho_int["betting"]["global"]["n_picks_with_closing"],
                "roi_pct": rep_ho_int["roi_pct"],
                "roi_pct_ci95": rep_ho_int["roi_pct_ci95"],
                "roi_significance": rep_ho_int["roi_significance"],
                "clv_pct_mean": rep_ho_int["clv_pct_mean"],
                "clv_pct_ci95": rep_ho_int["clv_pct_ci95"],
                "clv_pct_significance": rep_ho_int["clv_pct_significance"],
                "clv_prob_mean": rep_ho_int["clv_prob_mean"],
                "clv_prob_ci95": rep_ho_int["clv_prob_ci95"],
                "pct_picks_clv_positive": rep_ho_int["pct_picks_clv_positive"],
                "max_drawdown_u": rep_ho_int["max_drawdown_u"],
                "portfolio_clv_ci95_strictly_above_zero": portfolio_clv_sig_pos,
            },
            "segment_level_summary": {
                "min_picks_required_for_valid_ci95": MIN_SEGMENT_PICKS_FOR_VALID_CI95,
                "n_segments_total": len(production_segments_map),
                "n_segments_production_enabled": len(enabled_prod_keys),
                "n_segments_production_disabled": len(production_segments_map) - len(enabled_prod_keys),
                "enabled_segments": enabled_prod_keys,
                "segments_with_raw_bootstrap_ci95_gt_0_n_ge_6": raw_ci_pos_ge6_keys,
                "segments_with_raw_bootstrap_ci95_gt_0_n_ge_2": raw_ci_pos_any_n_keys,
                "disabled_reasons_count": disabled_reasons_prod,
            },
        },
        "segments": production_segments_map,
    }

    eval_artifact: dict[str, Any] = {
        "schema_version": "sealed_holdout_v3_1_eval_v1.0.0",
        "generated_at_utc": generated_ts,
        "agent": "a10-holdout",
        "reproduction_command": (
            "research/prediction-lab/.venv/Scripts/python.exe services/models/evaluate_sealed_holdout_v3_1.py"
        ),
        "governance": {
            "single_pass_holdout_evaluation": True,
            "zero_post_holdout_retuning": True,
            "execution_delay_minutes": DEFAULT_EXECUTION_DELAY_MINUTES,
            "historical_delay_alpha": DEFAULT_HISTORICAL_DELAY_ALPHA,
            "bootstrap_samples": int(bootstrap_samples),
            "seed": int(seed),
            "min_segment_picks_for_valid_ci95": MIN_SEGMENT_PICKS_FOR_VALID_CI95,
        },
        "split_summary": split_meta,
        "multiple_testing_control": {
            **mt_consolidation,
            "n_pre_holdout_run_backtest_trials_including_integrated_dev": n_pre_holdout_total,
            "n_sealed_holdout_single_pass_runs": n_holdout_runs,
            "n_total_registry_entries": len(final_registry_entries),
            "registry_path": str(registry_path),
        },
        "walk_forward_dev_phases": {
            "phase0_baseline_v3_0": _pack_phase_summary(rep_dev_p0),
            "phase1_ola2_picks_v3_1": _pack_phase_summary(
                rep_dev_p1,
                caps_audit=caps_dev_p1,
                by_origin=_summarize_pick_groups(settled_dev_p1, "origin", ("a5_model_driven", "a5_sharp_arb")),
                by_tier=_summarize_pick_groups(settled_dev_p1, "tier", ("solido", "valor")),
                by_odds_bucket=_summarize_pick_groups(settled_dev_p1, "odds_bucket", pe.ODDS_BUCKETS),
                by_source=_summarize_pick_groups(settled_dev_p1, "source", ("historical_fd", "scraped_ws")),
                selector_stats={
                    "total_candidates_evaluated": sel_dev_a5.total_candidates_evaluated,
                    "rejection_counts": sel_dev_a5.rejection_counts,
                    "oof_reference_from_ola2_artifact": ola2_dev_ref["causal_oof_verification"],
                },
            ),
            "phase2a_ola3_stale_lines_a8": _pack_phase_summary(
                rep_dev_p2a,
                caps_audit=caps_dev_p2a,
                by_origin=_summarize_pick_groups(settled_dev_p2a, "origin", ("a8_double_confirmation",)),
                by_tier=_summarize_pick_groups(settled_dev_p2a, "tier", ("solido", "valor")),
                by_odds_bucket=_summarize_pick_groups(settled_dev_p2a, "odds_bucket", pe.ODDS_BUCKETS),
                by_source=_summarize_pick_groups(settled_dev_p2a, "source", ("historical_fd", "scraped_ws")),
                selector_stats={
                    "total_candidates_evaluated": sel_dev_a8.total_candidates_evaluated,
                    "rejection_counts": sel_dev_a8.rejection_counts,
                    "oof_reference_from_a8_report": a8_report_ref["signal_comparison_walk_forward_dev"][
                        "double_confirmation_sharp_plus_model"
                    ],
                },
            ),
            "phase2b_integrated_v3_1": _pack_phase_summary(
                rep_dev_int,
                caps_audit=caps_dev_int,
                by_origin=_summarize_pick_groups(
                    settled_dev_int, "origin", ("a5_model_driven", "a8_stale_double_conf")
                ),
                by_tier=_summarize_pick_groups(settled_dev_int, "tier", ("solido", "valor")),
                by_odds_bucket=_summarize_pick_groups(settled_dev_int, "odds_bucket", pe.ODDS_BUCKETS),
                by_source=_summarize_pick_groups(settled_dev_int, "source", ("historical_fd", "scraped_ws")),
                selector_stats={
                    "total_candidates_evaluated": sel_dev_int.total_candidates_evaluated,
                    "rejection_counts": sel_dev_int.rejection_counts,
                },
            ),
            "disabled_ola3_components_dev": {
                "a6_dixon_coles_2way": {
                    "n_segments_evaluated": a6_eval_ref["enablement_summary"]["total_segments_evaluated"],
                    "n_segments_enabled": a6_eval_ref["enablement_summary"]["n_enabled_final"],
                    "backtest_all_candidates_dev": a6_eval_ref["a3_backtest_summary"][
                        "candidate_a4_passed_segments_alpha_0_05"
                    ],
                },
                "a7_gbm_calibrated_1x2": {
                    "production_activated": a7_eval_ref["production_activated"],
                    "decision_rationale": a7_eval_ref["activation_verdict"],
                },
            },
        },
        "holdout_sealed_phases": {
            "phase0_baseline_v3_0": _pack_phase_summary(rep_ho_p0),
            "phase1_ola2_picks_v3_1": _pack_phase_summary(
                rep_ho_p1,
                caps_audit=caps_ho_p1,
                by_origin=_summarize_pick_groups(settled_ho_p1, "origin", ("a5_model_driven", "a5_sharp_arb")),
                by_tier=_summarize_pick_groups(settled_ho_p1, "tier", ("solido", "valor")),
                by_odds_bucket=_summarize_pick_groups(settled_ho_p1, "odds_bucket", pe.ODDS_BUCKETS),
                by_source=_summarize_pick_groups(settled_ho_p1, "source", ("historical_fd", "scraped_ws")),
                selector_stats={
                    "total_candidates_evaluated": sel_ho_a5.total_candidates_evaluated,
                    "rejection_counts": sel_ho_a5.rejection_counts,
                },
            ),
            "phase2a_ola3_stale_lines_a8": _pack_phase_summary(
                rep_ho_p2a,
                caps_audit=caps_ho_p2a,
                by_origin=_summarize_pick_groups(settled_ho_p2a, "origin", ("a8_double_confirmation",)),
                by_tier=_summarize_pick_groups(settled_ho_p2a, "tier", ("solido", "valor")),
                by_odds_bucket=_summarize_pick_groups(settled_ho_p2a, "odds_bucket", pe.ODDS_BUCKETS),
                by_source=_summarize_pick_groups(settled_ho_p2a, "source", ("historical_fd", "scraped_ws")),
                selector_stats={
                    "total_candidates_evaluated": sel_ho_a8.total_candidates_evaluated,
                    "rejection_counts": sel_ho_a8.rejection_counts,
                },
            ),
            "phase2b_integrated_v3_1": _pack_phase_summary(
                rep_ho_int,
                caps_audit=caps_ho_int,
                by_origin=_summarize_pick_groups(
                    settled_ho_int, "origin", ("a5_model_driven", "a8_stale_double_conf")
                ),
                by_tier=_summarize_pick_groups(settled_ho_int, "tier", ("solido", "valor")),
                by_odds_bucket=_summarize_pick_groups(settled_ho_int, "odds_bucket", pe.ODDS_BUCKETS),
                by_source=_summarize_pick_groups(settled_ho_int, "source", ("historical_fd", "scraped_ws")),
                selector_stats={
                    "total_candidates_evaluated": sel_ho_int.total_candidates_evaluated,
                    "rejection_counts": sel_ho_int.rejection_counts,
                },
            ),
        },
        "scraping_cadence_summary": {
            "recommended_scraping_cadence": a8_report_ref["recommended_scraping_cadence"],
            "scraped_ws_empirical": a8_report_ref["scraped_ws_empirical"],
        },
        "production_segments_summary": production_segments_artifact["portfolio_vs_segment_verdict"],
        "league_market_table": league_market_table,
    }

    out_production_segments_path.parent.mkdir(parents=True, exist_ok=True)
    out_production_segments_path.write_text(
        json.dumps(production_segments_artifact, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    out_eval_path.parent.mkdir(parents=True, exist_ok=True)
    out_eval_path.write_text(
        json.dumps(eval_artifact, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    print(
        f"[A10] COMPLETADO — Segmentos habilitados en producción tras holdout sellado: "
        f"{len(enabled_prod_keys)}/{len(production_segments_map)} ({enabled_prod_keys}).",
        flush=True,
    )
    return eval_artifact


def _parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluación única del Holdout Sellado v3.1 (a10-holdout).")
    parser.add_argument("--out", type=Path, default=DEFAULT_SEALED_EVAL_JSON)
    parser.add_argument("--registry", type=Path, default=DEFAULT_CONSOLIDATED_REGISTRY_JSONL)
    parser.add_argument("--prod-segments-out", type=Path, default=DEFAULT_PRODUCTION_SEGMENTS_JSON)
    parser.add_argument("--bootstrap-samples", type=int, default=DEFAULT_BOOTSTRAP_SAMPLES)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = _parse_args(argv)
    run_sealed_holdout_evaluation(
        out_eval_path=args.out,
        registry_path=args.registry,
        out_production_segments_path=args.prod_segments_out,
        bootstrap_samples=args.bootstrap_samples,
        seed=args.seed,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
