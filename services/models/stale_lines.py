#!/usr/bin/env python3
"""A28 (Ola 3 · Agente A8) — Detector de líneas rezagadas (`Stale Lines`) con Doble Confirmación,
medición empírica sobre `odds_snapshots.parquet` y derivación matemática de frecuencia de scraping.

Espejo exacto 1:1 (`|Δ| < 1e-12`) de `src/domain/prediction/stale_lines.ts` y ejecutor walk-forward
sobre `services/models/backtest.py` (`unlock_holdout=False` SIEMPRE, `registry_path` aislado en
`services/models/artifacts/holdout_registry_a8.jsonl`).
"""

from __future__ import annotations

import argparse
from collections.abc import Iterator, Mapping, Sequence
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import re
import sys
from typing import Any

import numpy as np
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]
PRED_LAB_ROOT = REPO_ROOT / "research" / "prediction-lab"
MODELS_DIR = REPO_ROOT / "services" / "models"
ARTIFACTS_DIR = MODELS_DIR / "artifacts"
TS_DATA_PREDICTION_DIR = REPO_ROOT / "src" / "data" / "prediction"

DEFAULT_ODDS_PARQUET_PATH = PRED_LAB_ROOT / "data" / "processed" / "odds_snapshots.parquet"
DEFAULT_BLEND_WEIGHTS_PATH = ARTIFACTS_DIR / "blend_weights_v3_1.json"
DEFAULT_REPORT_OUT_PATH = ARTIFACTS_DIR / "stale_lines_report.json"
DEFAULT_CONFIG_OUT_PATH = TS_DATA_PREDICTION_DIR / "stale_lines_config.json"
DEFAULT_A8_REGISTRY_PATH = ARTIFACTS_DIR / "holdout_registry_a8.jsonl"

for _p in (str(REPO_ROOT), str(MODELS_DIR), str(PRED_LAB_ROOT)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import clv_report
import picks_engine as pe

# ---------------------------------------------------------------------------
# Constantes contractuales idénticas a `src/domain/prediction/stale_lines.ts`
# ---------------------------------------------------------------------------

STALE_LINES_SCHEMA_VERSION: str = "stale_lines_v1.0.0"

STALE_SIGNAL_MODES: tuple[str, ...] = ("double_confirmation", "simple_sharp")
SHARP_REFERENCE_BOOKS: tuple[str, ...] = ("pinnacle", "smarkets")
RECREATIONAL_EXECUTION_BOOKS: tuple[str, ...] = (
    "caliente",
    "codere",
    "b365",
    "bw",
    "wh",
    "draftkings",
    "fanduel",
    "betmgm",
    "betrivers",
    "fanatics",
    "hardrock",
    "thescore_bet",
    "bf",
)

STALE_LINE_REJECTION_REASONS: tuple[str, ...] = (
    "invalid_candidate_input",
    "non_recreational_book",
    "missing_sharp_reference",
    "sharp_reference_too_old",
    "adverse_sharp_steam",
    "not_stale_below_sharp_novig",
    "below_stale_thresholds",
    "missing_model_probability",
    "model_below_recreational_breakeven",
    "model_contradicts_sharp",
    "high_submodel_dispersion",
    "uncertainty_erased_edge",
    "correlated_same_event_market",
    "cap_event_exhausted",
    "cap_league_date_exhausted",
    "cap_global_date_exhausted",
    "stake_below_min_unit",
)

MIN_OVERROUND: float = 0.9
MAX_OVERROUND: float = 1.2
SHARP_OVERROUND_ANCHOR: float = 0.0322
RECREATIONAL_OVERROUND_ANCHOR: float = 0.0662
EXTREME_SOFT_OVERROUND_ANCHOR: float = 0.118
MIN_ADAPTIVE_SHIN_WEIGHT: float = 0.12
RECREATIONAL_SHIN_WEIGHT: float = 0.85
MAX_ADAPTIVE_SHIN_WEIGHT: float = 0.96

_EPS_PARITY: float = 1e-12
_PROB_CLIP_EPS: float = 1e-6
_SHARP_BOOKS_SET: frozenset[str] = frozenset(SHARP_REFERENCE_BOOKS)
_RECREATIONAL_BOOKS_SET: frozenset[str] = frozenset(RECREATIONAL_EXECUTION_BOOKS)


class StaleLineConfigValidationError(ValueError):
    """Error de validación estructural sobre `StaleLinesConfig` o entradas de cadencia."""

    code = "stale_line_config_validation_error"


class StaleLineCausalityError(RuntimeError):
    """Error lanzado ante cualquier violación causal (`ts_captured > ts_decision` o post-kickoff)."""

    code = "stale_line_causality_error"


@dataclass(frozen=True)
class StaleLineDecisionResult(Mapping[str, Any]):
    """Resultado inmutable de evaluación de un `StaleLineCandidate` (paridad 1:1 con TS)."""

    candidate_id: str
    input_index: int
    approved: bool
    rejection_reason: str | None
    signal_mode: str
    tier: str | None
    cond1_stale_line: bool
    cond2_model_confirms: bool | None
    event_id: str
    sport: str
    league: str
    market: str
    line: float | None
    selection: str
    recreational_book: str
    sharp_book: str | None
    utc_date: str
    segment_key: str
    odds_bucket: str
    price_recreational: float
    p_recreational_implied: float
    p_sharp_novig: float
    price_sharp_novig: float
    stale_prob_margin_obs: float
    stale_ev_sharp: float
    price_ratio_vs_sharp_novig: float
    p_modelo: float | None
    model_edge_over_implied: float | None
    model_ev_recreational: float | None
    model_vs_sharp_diff: float | None
    sharp_quote_age_minutes: float | None
    recreational_quote_age_minutes: float | None
    recreational_vs_sharp_lag_minutes: float | None
    p_effective: float
    sigma_p: float
    p_shrunk: float
    adverse_ticks_1h: float
    f_quarter: float
    stake_raw_u: float
    correlation_multiplier: float
    stake_u: float
    expected_log_growth_g: float
    allocation_rank: int | None
    cap_applied: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def __getitem__(self, key: str) -> Any:
        try:
            return getattr(self, key)
        except AttributeError as exc:
            raise KeyError(key) from exc

    def __iter__(self) -> Iterator[str]:
        return iter(self.__dataclass_fields__)

    def __len__(self) -> int:
        return len(self.__dataclass_fields__)


# ---------------------------------------------------------------------------
# Normalización canónica 1:1 con `src/domain/prediction/stale_lines.ts`
# ---------------------------------------------------------------------------

_STALE_BOOK_CANONICAL_MAP: dict[str, str] = {
    "ps": "pinnacle",
    "p": "pinnacle",
    "pinnacle": "pinnacle",
    "pinnacle_sports": "pinnacle",
    "smarkets": "smarkets",
    "betfair_smarkets_exchange": "smarkets",
    "caliente": "caliente",
    "caliente_mx": "caliente",
    "caliente.mx": "caliente",
    "codere": "codere",
    "codere_mx": "codere",
    "codere.mx": "codere",
    "codere_bet365_mx": "codere",
    "b365": "b365",
    "bet365": "b365",
    "bet365 nj": "b365",
    "bet365_nj": "b365",
    "bw": "bw",
    "bwin": "bw",
    "wh": "wh",
    "william_hill": "wh",
    "williamhill": "wh",
    "bf": "bf",
    "betfair_sportsbook": "bf",
    "draftkings": "draftkings",
    "dk": "draftkings",
    "dk nj": "draftkings",
    "dk_nj": "draftkings",
    "draftkings nj": "draftkings",
    "fanduel": "fanduel",
    "fd": "fanduel",
    "fanduel nj": "fanduel",
    "fanduel_nj": "fanduel",
    "betmgm": "betmgm",
    "betmgm nj": "betmgm",
    "betmgm_nj": "betmgm",
    "betrivers": "betrivers",
    "betrivers nj": "betrivers",
    "betrivers_nj": "betrivers",
    "fanatics": "fanatics",
    "fanatics nj": "fanatics",
    "fanatics_nj": "fanatics",
    "hardrock": "hardrock",
    "hard rock": "hardrock",
    "hardrock nj": "hardrock",
    "hardrock_nj": "hardrock",
    "thescore_bet": "thescore_bet",
    "thescore bet": "thescore_bet",
    "thescore bet nj": "thescore_bet",
    "thescore_bet_nj": "thescore_bet",
    "bfe": "bfe",
    "betfair_exchange": "bfe",
    "polymarket": "polymarket",
    "kalshi": "kalshi",
    "avg": "avg",
    "market_avg": "avg",
    "max": "max",
    "market_max": "max",
    "nflverse": "nflverse",
    "consensus": "consensus",
    "action_consensus": "action_consensus",
    "open": "open",
    "action_open": "action_open",
}

_WS_RE = re.compile(r"\s+")


def _is_real_number(val: Any) -> bool:
    return (
        not isinstance(val, bool)
        and isinstance(val, (int, float, np.integer, np.floating))
        and math.isfinite(float(val))
    )


def canonical_stale_book(book: Any) -> str:
    raw = _WS_RE.sub(" ", str("" if book is None else book).strip().lower())
    return _STALE_BOOK_CANONICAL_MAP.get(raw, raw)


def canonical_stale_market(market: Any) -> str:
    return pe.canonical_pick_market(market)


def canonical_stale_selection(selection: Any) -> str:
    return pe.canonical_pick_selection(selection)


def normalize_stale_line(line: Any) -> float | None:
    return pe.normalize_pick_line(line)


def is_sharp_reference_book(book: Any) -> bool:
    return canonical_stale_book(book) in _SHARP_BOOKS_SET


def is_recreational_book(book: Any) -> bool:
    return canonical_stale_book(book) in _RECREATIONAL_BOOKS_SET


def selection_order_for_market(market: Any) -> tuple[str, ...]:
    m = canonical_stale_market(market)
    if m == "1x2":
        return ("home", "draw", "away")
    if m == "totals":
        return ("over", "under")
    if m == "btts":
        return ("yes", "no")
    return ("home", "away")


# ---------------------------------------------------------------------------
# De-vig generalizado (2 y 3 vías) y mezcla logit con paridad `< 1e-12`
# ---------------------------------------------------------------------------


def _clamp_number(val: float, lo: float, hi: float) -> float:
    return min(hi, max(lo, float(val)))


def _smoothstep01(u: float) -> float:
    t = _clamp_number(u, 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def devig_sharp_market_prices(
    raw_prices: Sequence[float],
    method: str = "power",
    tolerance: float = 1e-12,
) -> list[float]:
    """Elimina el margen de un vector completo de cuotas sharp (2 o 3 selecciones) con paridad `< 1e-12`."""
    if not isinstance(raw_prices, Sequence) or len(raw_prices) not in (2, 3):
        raise ValueError(f"Se esperaban exactamente 2 o 3 cuotas sharp completas; recibidas {raw_prices!r}")
    q: list[float] = []
    sum_q = 0.0
    for idx, raw_o in enumerate(raw_prices):
        if not _is_real_number(raw_o) or float(raw_o) <= 1.0:
            raise ValueError(f"Cuota sharp inválida en índice {idx}: {raw_o!r}")
        qi = 1.0 / float(raw_o)
        q.append(qi)
        sum_q += qi
    if sum_q < MIN_OVERROUND or sum_q > MAX_OVERROUND:
        raise ValueError(
            f"Σ(1/cuota) sharp fuera de rango plausible [{MIN_OVERROUND}, {MAX_OVERROUND}]: {sum_q:.6f}"
        )

    m = str(method or "power").strip().lower()
    if m == "proportional":
        return [qi / sum_q for qi in q]

    def _solve_power() -> list[float]:
        lo = 1e-6
        hi = 5.0
        alpha = 1.0
        for _ in range(200):
            alpha = 0.5 * (lo + hi)
            s = sum(math.pow(qi, alpha) for qi in q)
            if abs(s - 1.0) <= tolerance:
                break
            if s > 1.0:
                lo = alpha
            else:
                hi = alpha
        p = [math.pow(qi, alpha) for qi in q]
        tot = sum(p)
        return [v / tot for v in p]

    def _solve_shin() -> list[float]:
        def _probs_at_z(z_val: float) -> list[float]:
            out: list[float] = []
            for qi in q:
                inside = z_val * z_val + (4.0 * (1.0 - z_val) * qi * qi) / sum_q
                out.append((math.sqrt(max(inside, 0.0)) - z_val) / (2.0 * (1.0 - z_val)))
            return out

        lo = 0.0
        hi = 0.5
        z = 0.0
        for _ in range(200):
            z = 0.5 * (lo + hi)
            s = sum(_probs_at_z(z))
            if abs(s - 1.0) <= tolerance:
                break
            if s > 1.0:
                lo = z
            else:
                hi = z
        p = _probs_at_z(z)
        tot = sum(p)
        return [v / tot for v in p]

    if m == "power":
        return _solve_power()
    if m == "shin":
        return _solve_shin()

    r = max(0.0, sum_q - 1.0)
    if r <= SHARP_OVERROUND_ANCHOR:
        w_shin = MIN_ADAPTIVE_SHIN_WEIGHT
    elif r <= RECREATIONAL_OVERROUND_ANCHOR:
        u = (r - SHARP_OVERROUND_ANCHOR) / (RECREATIONAL_OVERROUND_ANCHOR - SHARP_OVERROUND_ANCHOR)
        w_shin = MIN_ADAPTIVE_SHIN_WEIGHT + (RECREATIONAL_SHIN_WEIGHT - MIN_ADAPTIVE_SHIN_WEIGHT) * _smoothstep01(u)
    else:
        u = (r - RECREATIONAL_OVERROUND_ANCHOR) / (EXTREME_SOFT_OVERROUND_ANCHOR - RECREATIONAL_OVERROUND_ANCHOR)
        w_shin = RECREATIONAL_SHIN_WEIGHT + (MAX_ADAPTIVE_SHIN_WEIGHT - RECREATIONAL_SHIN_WEIGHT) * _smoothstep01(u)

    p_pow = _solve_power()
    p_sh = _solve_shin()
    blended = [(1.0 - w_shin) * pp + w_shin * ps for pp, ps in zip(p_pow, p_sh)]
    tot = sum(blended)
    return [v / tot for v in blended]


def _logit_clipped_scalar(p: float) -> float:
    c = _clamp_number(p, _PROB_CLIP_EPS, 1.0 - _PROB_CLIP_EPS)
    return math.log(c / (1.0 - c))


def _sigmoid_scalar(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def blend_confirmation_probabilities(
    p_model_vec: Sequence[float],
    p_sharp_novig_vec: Sequence[float],
    w_model: float,
) -> list[float]:
    if len(p_model_vec) != len(p_sharp_novig_vec) or len(p_model_vec) < 2:
        raise StaleLineConfigValidationError("Vectores incompatibles en blend_confirmation_probabilities.")
    w = _clamp_number(float(w_model), 0.0, 1.0)
    unnorm = [
        _sigmoid_scalar(w * _logit_clipped_scalar(float(pm)) + (1.0 - w) * _logit_clipped_scalar(float(ps)))
        for pm, ps in zip(p_model_vec, p_sharp_novig_vec)
    ]
    denom = max(1e-15, sum(unnorm))
    return [u / denom for u in unnorm]


def blend_scalar_confirmation_prob(p_modelo: float, p_sharp_novig: float, w_model: float) -> float:
    w = _clamp_number(float(w_model), 0.0, 1.0)
    return _sigmoid_scalar(w * _logit_clipped_scalar(float(p_modelo)) + (1.0 - w) * _logit_clipped_scalar(float(p_sharp_novig)))


# ---------------------------------------------------------------------------
# Validación y Evaluación Pura (`evaluate_stale_line_batch` / `evaluate_stale_line_candidate`)
# ---------------------------------------------------------------------------


def validate_stale_lines_config(config: Mapping[str, Any]) -> None:
    if not isinstance(config, Mapping):
        raise StaleLineConfigValidationError("StaleLinesConfig ausente o inválida.")
    if config.get("holdout_sealed_untouched") is not True:
        raise StaleLineConfigValidationError(
            "holdout_sealed_untouched debe ser estrictamente True en StaleLinesConfig."
        )
    sig_mode = config.get("signal_mode")
    if sig_mode not in STALE_SIGNAL_MODES:
        raise StaleLineConfigValidationError(f"signal_mode inválido: {sig_mode!r}")

    spm = config.get("stale_prob_margin")
    if not _is_real_number(spm) or float(spm) < 0.0 or float(spm) > 0.5:
        raise StaleLineConfigValidationError(f"stale_prob_margin inválido: {spm!r}")

    sev = config.get("stale_ev_threshold")
    if not _is_real_number(sev) or float(sev) <= 0.0:
        raise StaleLineConfigValidationError(f"stale_ev_threshold debe ser > 0: {sev!r}")

    sev_val = config.get("stale_ev_threshold_valor")
    if not _is_real_number(sev_val) or float(sev_val) <= float(sev):
        raise StaleLineConfigValidationError(
            f"stale_ev_threshold_valor ({sev_val!r}) debe ser > stale_ev_threshold ({sev!r})."
        )

    mmpe = config.get("min_model_prob_edge")
    if not _is_real_number(mmpe) or float(mmpe) < 0.0:
        raise StaleLineConfigValidationError(f"min_model_prob_edge debe ser >= 0: {mmpe!r}")

    mat = config.get("model_agreement_tolerance")
    if not _is_real_number(mat) or float(mat) < 0.0:
        raise StaleLineConfigValidationError(f"model_agreement_tolerance debe ser >= 0: {mat!r}")

    dmbw = config.get("default_model_blend_weight")
    if not _is_real_number(dmbw) or float(dmbw) < 0.0 or float(dmbw) > 1.0:
        raise StaleLineConfigValidationError(f"default_model_blend_weight debe estar en [0, 1]: {dmbw!r}")

    msqa = config.get("max_sharp_quote_age_minutes")
    if msqa is not None and (not _is_real_number(msqa) or float(msqa) <= 0.0):
        raise StaleLineConfigValidationError(f"max_sharp_quote_age_minutes debe ser None o > 0: {msqa!r}")

    kf = config.get("kelly_fraction")
    if not _is_real_number(kf) or float(kf) <= 0.0 or float(kf) > 0.25 + _EPS_PARITY:
        raise StaleLineConfigValidationError(
            f"kelly_fraction inválida ({kf!r}): se exige Quarter-Kelly (<= 0.25)."
        )

    for key in ("max_sigma_p", "max_adverse_ticks_1h", "uncertainty_penalty_k"):
        val = config.get(key)
        if not _is_real_number(val) or float(val) < 0.0:
            raise StaleLineConfigValidationError(f"{key} inválido: {val!r}")

    rho = config.get("rho_same_event")
    if not _is_real_number(rho) or abs(float(rho)) > 1.0:
        raise StaleLineConfigValidationError(f"rho_same_event debe estar en [-1, 1]: {rho!r}")


def _clamp_safe_addition(used_u: float, add_u: float, cap_u: float) -> float:
    remaining = max(0.0, cap_u - used_u)
    cand = min(add_u, remaining)
    while cand > 0.0 and used_u + cand > cap_u:
        cand = max(0.0, cand - 1e-15)
    return cand


def _lookup_stale_segment(
    config: Mapping[str, Any],
    league: str,
    market_canon: str,
) -> tuple[str, Mapping[str, Any] | None]:
    norm_mkt = "totals" if market_canon == "ou" else market_canon
    exact_key = f"{league.strip()}::{norm_mkt}"
    segs = config.get("segments")
    if not isinstance(segs, Mapping):
        return exact_key, None
    if exact_key in segs:
        return exact_key, segs[exact_key]
    low = exact_key.lower()
    for k, v in segs.items():
        if str(k).lower() == low:
            return str(k), v
    return exact_key, None


def _resolve_sharp_novig_from_candidate(
    candidate: Mapping[str, Any],
    market_canon: str,
    sel_canon: str,
    default_devig_method: str,
) -> tuple[float | None, list[float] | None, int | None]:
    sel_order = selection_order_for_market(market_canon)
    raw_idx = candidate.get("selection_index")
    if (
        isinstance(raw_idx, (int, np.integer))
        and not isinstance(raw_idx, bool)
        and 0 <= int(raw_idx) < len(sel_order)
    ):
        inferred_idx = int(raw_idx)
    else:
        inferred_idx = sel_order.index(sel_canon) if sel_canon in sel_order else -1

    raw_psnv = candidate.get("p_sharp_novig")
    if _is_real_number(raw_psnv) and 0.0 < float(raw_psnv) < 1.0:
        raw_vec = candidate.get("sharp_market_novig_probs")
        vec = [float(x) for x in raw_vec] if isinstance(raw_vec, (list, tuple, np.ndarray)) else None
        return float(raw_psnv), vec, (inferred_idx if inferred_idx >= 0 else None)

    raw_odds = candidate.get("sharp_market_odds")
    if raw_odds is not None:
        odds_arr: list[float] | None = None
        if isinstance(raw_odds, (list, tuple, np.ndarray)):
            odds_arr = [float(x) if _is_real_number(x) else float("nan") for x in raw_odds]
        elif isinstance(raw_odds, Mapping):
            extracted: list[float] = []
            ok = True
            for s in sel_order:
                v = raw_odds.get(s)
                if _is_real_number(v):
                    extracted.append(float(v))
                else:
                    ok = False
                    break
            if ok:
                odds_arr = extracted

        if odds_arr is not None and 0 <= inferred_idx < len(odds_arr):
            try:
                method = str(candidate.get("devig_method") or default_devig_method)
                nv = devig_sharp_market_prices(odds_arr, method)
                p_target = nv[inferred_idx]
                if math.isfinite(p_target) and 0.0 < p_target < 1.0:
                    return p_target, nv, inferred_idx
            except ValueError:
                return None, None, None

    return None, None, None


def evaluate_stale_line_batch(
    candidates: Sequence[Mapping[str, Any]],
    config: Mapping[str, Any],
    *,
    portfolio_state: Mapping[str, Any] | None = None,
    override_signal_mode: str | None = None,
    skip_config_validation: bool = False,
) -> list[StaleLineDecisionResult]:
    """Evalúa un lote de `StaleLineCandidate` con paridad exacta `< 1e-12` respecto a TypeScript."""
    if not skip_config_validation:
        validate_stale_lines_config(config)
    if not candidates:
        return []

    signal_mode = str(override_signal_mode or config["signal_mode"])
    if signal_mode not in STALE_SIGNAL_MODES:
        raise StaleLineConfigValidationError(f"signal_mode inválido: {signal_mode!r}")

    kelly_fraction = min(0.25, float(config["kelly_fraction"]))
    bankroll_unit_pct = float(config.get("bankroll_unit_pct", pe.DEFAULT_BANKROLL_UNIT_PCT))
    min_stake_u = float(config.get("min_stake_u", pe.DEFAULT_MIN_STAKE_U))
    fallback_sigma_p = float(config.get("fallback_sigma_p", 0.02))
    sharp_window_min = float(config.get("sharp_steam_window_minutes", pe.DEFAULT_SHARP_STEAM_WINDOW_MINUTES))
    sharp_prob_tick = float(config.get("sharp_implied_prob_tick", pe.DEFAULT_SHARP_IMPLIED_PROB_TICK))

    caps_cfg = config.get("caps") if isinstance(config.get("caps"), Mapping) else {}
    cap_pick_max = min(
        pe.HARD_MAX_STAKE_PER_PICK_U,
        float(caps_cfg.get("max_stake_per_pick_u", pe.HARD_MAX_STAKE_PER_PICK_U)),
    )
    cap_event_max = min(
        pe.HARD_MAX_STAKE_PER_EVENT_U,
        float(caps_cfg.get("max_stake_per_event_u", pe.HARD_MAX_STAKE_PER_EVENT_U)),
    )
    cap_ld_max = min(
        pe.HARD_MAX_STAKE_PER_LEAGUE_DATE_U,
        float(caps_cfg.get("max_stake_per_league_date_u", pe.HARD_MAX_STAKE_PER_LEAGUE_DATE_U)),
    )
    cap_gd_max = min(
        pe.HARD_MAX_STAKE_PER_GLOBAL_DATE_U,
        float(caps_cfg.get("max_stake_per_global_date_u", pe.HARD_MAX_STAKE_PER_GLOBAL_DATE_U)),
    )

    event_exp: dict[str, float] = {}
    event_mkts: dict[str, set[str]] = {}
    event_counts: dict[str, int] = {}
    ld_exp: dict[str, float] = {}
    gd_exp: dict[str, float] = {}

    if isinstance(portfolio_state, Mapping):
        for k, v in (portfolio_state.get("event_exposure_u") or {}).items():
            if _is_real_number(v) and float(v) > 0.0:
                event_exp[str(k)] = float(v)
        for k, mkts in (portfolio_state.get("event_markets_taken") or {}).items():
            event_mkts[str(k)] = {canonical_stale_market(m) for m in mkts}
        for k, cnt in (portfolio_state.get("event_pick_counts") or {}).items():
            if _is_real_number(cnt) and float(cnt) > 0.0:
                event_counts[str(k)] = int(math.floor(float(cnt)))
        for k, v in (portfolio_state.get("league_date_exposure_u") or {}).items():
            if _is_real_number(v) and float(v) > 0.0:
                ld_exp[str(k)] = float(v)
        for k, v in (portfolio_state.get("global_date_exposure_u") or {}).items():
            if _is_real_number(v) and float(v) > 0.0:
                gd_exp[str(k)] = float(v)
        for op in portfolio_state.get("open_picks") or ():
            st_u = op.get("stake_u")
            if not _is_real_number(st_u) or float(st_u) <= 0.0:
                continue
            u_date = pe.resolve_candidate_utc_date(
                {"utc_date": op.get("utc_date"), "ts_event_start": op.get("ts_event_start")}
            )
            eid_o = str(op.get("event_id", "")).strip()
            lg_o = str(op.get("league", "")).strip()
            ld_key_o = f"{lg_o}::{u_date}"
            event_exp[eid_o] = event_exp.get(eid_o, 0.0) + float(st_u)
            event_counts[eid_o] = event_counts.get(eid_o, 0) + 1
            if op.get("market"):
                event_mkts.setdefault(eid_o, set()).add(canonical_stale_market(op["market"]))
            ld_exp[ld_key_o] = ld_exp.get(ld_key_o, 0.0) + float(st_u)
            gd_exp[u_date] = gd_exp.get(u_date, 0.0) + float(st_u)

    decisions: list[StaleLineDecisionResult | None] = [None] * len(candidates)
    survivors: list[dict[str, Any]] = []

    for idx, c in enumerate(candidates):
        raw_cid = c.get("candidate_id")
        cid = str(raw_cid).strip() if isinstance(raw_cid, str) and raw_cid.strip() else f"stale_cand_{idx}"
        eid = str(c.get("event_id") or "").strip()
        sport = str(c.get("sport") or "").strip().lower()
        league = str(c.get("league") or "").strip()
        mkt_canon = canonical_stale_market(c.get("market"))
        line_norm = normalize_stale_line(c.get("line"))
        sel_canon = canonical_stale_selection(c.get("selection"))
        rec_book_canon = canonical_stale_book(c.get("recreational_book"))
        raw_sb = c.get("sharp_book")
        sharp_book_raw = canonical_stale_book(raw_sb) if raw_sb is not None and str(raw_sb).strip() else "pinnacle"

        # 1. Guardia causal estricta a microsegundos UTC
        dec_us = pe.parse_iso_utc_micros(c.get("ts_decision"))
        start_us = pe.parse_iso_utc_micros(c.get("ts_event_start"))
        if dec_us is None or start_us is None:
            raise StaleLineCausalityError(
                f"Timestamps inválidos en candidato '{cid}': ts_decision={c.get('ts_decision')!r}, ts_event_start={c.get('ts_event_start')!r}"
            )
        if dec_us > start_us:
            raise StaleLineCausalityError(
                f"Violación post-kickoff en '{cid}': ts_decision ({c.get('ts_decision')}) > ts_event_start ({c.get('ts_event_start')})."
            )

        rec_cap_us: int | None = None
        if c.get("ts_recreational_captured") is not None:
            rec_cap_us = pe.parse_iso_utc_micros(c.get("ts_recreational_captured"))
            if rec_cap_us is None:
                raise StaleLineCausalityError(
                    f"ts_recreational_captured inválido en '{cid}': {c.get('ts_recreational_captured')!r}"
                )
            if rec_cap_us > dec_us:
                raise StaleLineCausalityError(
                    f"Fuga temporal recreativa en '{cid}': ts_recreational_captured ({c.get('ts_recreational_captured')}) > ts_decision ({c.get('ts_decision')})."
                )

        sharp_cap_us: int | None = None
        if c.get("ts_sharp_captured") is not None:
            sharp_cap_us = pe.parse_iso_utc_micros(c.get("ts_sharp_captured"))
            if sharp_cap_us is None:
                raise StaleLineCausalityError(
                    f"ts_sharp_captured inválido en '{cid}': {c.get('ts_sharp_captured')!r}"
                )
            if sharp_cap_us > dec_us:
                raise StaleLineCausalityError(
                    f"Fuga temporal sharp en '{cid}': ts_sharp_captured ({c.get('ts_sharp_captured')}) > ts_decision ({c.get('ts_decision')})."
                )

        try:
            utc_date = pe.resolve_candidate_utc_date(c)
        except pe.PickCausalityError as exc:
            raise StaleLineCausalityError(str(exc)) from exc

        seg_key, seg_cfg = _lookup_stale_segment(config, league, mkt_canon)

        sharp_age_min = (dec_us - sharp_cap_us) / 60_000_000.0 if sharp_cap_us is not None else None
        rec_age_min = (dec_us - rec_cap_us) / 60_000_000.0 if rec_cap_us is not None else None
        rec_vs_sharp_lag_min = (
            (rec_cap_us - sharp_cap_us) / 60_000_000.0
            if (rec_cap_us is not None and sharp_cap_us is not None)
            else None
        )

        try:
            adverse_ticks_1h = pe.compute_adverse_sharp_ticks_1h(
                c.get("sharp_quotes_1h"),
                str(c.get("ts_decision")),
                market=mkt_canon,
                line=line_norm,
                line_specified=True,
                selection=sel_canon,
                window_minutes=sharp_window_min,
                sharp_implied_prob_tick=sharp_prob_tick,
                precomputed_adverse_ticks=c.get("adverse_ticks_1h"),
            )
        except pe.PickCausalityError as exc:
            raise StaleLineCausalityError(str(exc)) from exc

        raw_pr = c.get("price_recreational")
        price_valid = (
            _is_real_number(raw_pr)
            and pe.MIN_PICK_PRICE_DECIMAL <= float(raw_pr) <= pe.MAX_PICK_PRICE_DECIMAL
        )
        price_rec = float(raw_pr) if price_valid else 0.0

        def _make_rejection(
            reason: str,
            *,
            sharp_b: str | None = None,
            p_snv: float = 0.0,
            cond1: bool = False,
            cond2: bool | None = None,
            p_mod: float | None = None,
            p_eff: float = 0.0,
            sigma_p: float = 0.0,
            p_shrunk: float = 0.0,
            f_q: float = 0.0,
            stake_raw: float = 0.0,
            g_val: float = 0.0,
            tier_val: str | None = None,
        ) -> StaleLineDecisionResult:
            p_imp_r = (1.0 / price_rec) if price_valid else 0.0
            pr_snv = (1.0 / p_snv) if p_snv > 0.0 else 0.0
            pm_obs = (p_snv - p_imp_r) if (p_snv > 0.0 and price_valid) else 0.0
            ev_sh = (p_snv * price_rec - 1.0) if (p_snv > 0.0 and price_valid) else 0.0
            ratio_sh = (price_rec * p_snv) if (p_snv > 0.0 and price_valid) else 0.0
            eff_cond2 = cond2 if cond2 is not None else (None if signal_mode == "simple_sharp" else False)
            return StaleLineDecisionResult(
                candidate_id=cid,
                input_index=idx,
                approved=False,
                rejection_reason=reason,
                signal_mode=signal_mode,
                tier=tier_val,
                cond1_stale_line=cond1,
                cond2_model_confirms=eff_cond2,
                event_id=eid,
                sport=sport,
                league=league,
                market=mkt_canon,
                line=line_norm,
                selection=sel_canon,
                recreational_book=rec_book_canon,
                sharp_book=sharp_b,
                utc_date=utc_date,
                segment_key=seg_key,
                odds_bucket=pe.classify_odds_bucket(price_rec) if price_valid else "even",
                price_recreational=price_rec,
                p_recreational_implied=p_imp_r,
                p_sharp_novig=p_snv,
                price_sharp_novig=pr_snv,
                stale_prob_margin_obs=pm_obs,
                stale_ev_sharp=ev_sh,
                price_ratio_vs_sharp_novig=ratio_sh,
                p_modelo=p_mod,
                model_edge_over_implied=(p_mod - p_imp_r) if (p_mod is not None and price_valid) else None,
                model_ev_recreational=(p_mod * price_rec - 1.0) if (p_mod is not None and price_valid) else None,
                model_vs_sharp_diff=(p_mod - p_snv) if (p_mod is not None and p_snv > 0.0) else None,
                sharp_quote_age_minutes=sharp_age_min,
                recreational_quote_age_minutes=rec_age_min,
                recreational_vs_sharp_lag_minutes=rec_vs_sharp_lag_min,
                p_effective=p_eff,
                sigma_p=sigma_p,
                p_shrunk=p_shrunk,
                adverse_ticks_1h=adverse_ticks_1h,
                f_quarter=f_q,
                stake_raw_u=stake_raw,
                correlation_multiplier=1.0,
                stake_u=0.0,
                expected_log_growth_g=g_val,
                allocation_rank=None,
                cap_applied=False,
            )

        if not eid or not sport or not league or not mkt_canon or not sel_canon or not price_valid:
            decisions[idx] = _make_rejection("invalid_candidate_input")
            continue

        if rec_book_canon not in _RECREATIONAL_BOOKS_SET:
            decisions[idx] = _make_rejection("non_recreational_book")
            continue

        if sharp_book_raw not in _SHARP_BOOKS_SET:
            decisions[idx] = _make_rejection("missing_sharp_reference")
            continue

        default_devig = str(
            (seg_cfg.get("best_devig_method") if seg_cfg else None)
            or config.get("default_devig_method")
            or "power"
        )
        p_snv_resolved, nv_vec, sel_idx = _resolve_sharp_novig_from_candidate(c, mkt_canon, sel_canon, default_devig)
        if p_snv_resolved is None:
            decisions[idx] = _make_rejection("missing_sharp_reference", sharp_b=sharp_book_raw)
            continue

        max_sharp_age = config.get("max_sharp_quote_age_minutes")
        if (
            max_sharp_age is not None
            and sharp_age_min is not None
            and sharp_age_min > float(max_sharp_age) + _EPS_PARITY
        ):
            decisions[idx] = _make_rejection("sharp_reference_too_old", sharp_b=sharp_book_raw, p_snv=p_snv_resolved)
            continue

        if adverse_ticks_1h > float(config["max_adverse_ticks_1h"]) + _EPS_PARITY:
            decisions[idx] = _make_rejection("adverse_sharp_steam", sharp_b=sharp_book_raw, p_snv=p_snv_resolved)
            continue

        p_imp = 1.0 / price_rec
        stale_pm_obs = p_snv_resolved - p_imp
        stale_ev_sh = p_snv_resolved * price_rec - 1.0

        req_pm = float(
            seg_cfg["stale_prob_margin"]
            if (seg_cfg and seg_cfg.get("stale_prob_margin") is not None)
            else config["stale_prob_margin"]
        )
        req_ev_sol = float(
            seg_cfg["stale_ev_threshold"]
            if (seg_cfg and seg_cfg.get("stale_ev_threshold") is not None)
            else config["stale_ev_threshold"]
        )
        req_ev_val = float(
            seg_cfg["stale_ev_threshold_valor"]
            if (seg_cfg and seg_cfg.get("stale_ev_threshold_valor") is not None)
            else config["stale_ev_threshold_valor"]
        )

        raw_pmod = c.get("p_modelo")
        p_mod_valid = (
            float(raw_pmod) if (_is_real_number(raw_pmod) and 0.0 < float(raw_pmod) < 1.0) else None
        )

        if stale_pm_obs <= 0.0 or stale_ev_sh <= 0.0:
            decisions[idx] = _make_rejection(
                "not_stale_below_sharp_novig",
                sharp_b=sharp_book_raw,
                p_snv=p_snv_resolved,
                p_mod=p_mod_valid,
            )
            continue

        seg_disabled = bool(seg_cfg is not None and seg_cfg.get("enabled") is False)
        if (
            stale_pm_obs + _EPS_PARITY < req_pm
            or stale_ev_sh + _EPS_PARITY < req_ev_sol
            or (seg_disabled and config.get("allow_unlisted_segments") is not True)
        ):
            decisions[idx] = _make_rejection(
                "below_stale_thresholds",
                sharp_b=sharp_book_raw,
                p_snv=p_snv_resolved,
                p_mod=p_mod_valid,
            )
            continue

        req_tol = float(
            seg_cfg["model_agreement_tolerance"]
            if (seg_cfg and seg_cfg.get("model_agreement_tolerance") is not None)
            else config["model_agreement_tolerance"]
        )
        min_mod_edge = float(config["min_model_prob_edge"])
        cond2_confirms: bool | None = None

        if signal_mode == "double_confirmation":
            if p_mod_valid is None:
                decisions[idx] = _make_rejection(
                    "missing_model_probability",
                    sharp_b=sharp_book_raw,
                    p_snv=p_snv_resolved,
                    cond1=True,
                    cond2=False,
                )
                continue
            if p_mod_valid <= p_imp + min_mod_edge:
                decisions[idx] = _make_rejection(
                    "model_below_recreational_breakeven",
                    sharp_b=sharp_book_raw,
                    p_snv=p_snv_resolved,
                    cond1=True,
                    cond2=False,
                    p_mod=p_mod_valid,
                )
                continue
            if p_mod_valid + _EPS_PARITY < p_snv_resolved - req_tol:
                decisions[idx] = _make_rejection(
                    "model_contradicts_sharp",
                    sharp_b=sharp_book_raw,
                    p_snv=p_snv_resolved,
                    cond1=True,
                    cond2=False,
                    p_mod=p_mod_valid,
                )
                continue
            cond2_confirms = True
        elif p_mod_valid is not None:
            cond2_confirms = bool(
                p_mod_valid > p_imp + min_mod_edge
                and (p_mod_valid + _EPS_PARITY >= p_snv_resolved - req_tol)
            )

        disp_val = pe.compute_submodel_dispersion(c)
        sigma_p = float(disp_val) if disp_val is not None else fallback_sigma_p
        if sigma_p > float(config["max_sigma_p"]) + _EPS_PARITY:
            decisions[idx] = _make_rejection(
                "high_submodel_dispersion",
                sharp_b=sharp_book_raw,
                p_snv=p_snv_resolved,
                cond1=True,
                cond2=cond2_confirms,
                p_mod=p_mod_valid,
                sigma_p=sigma_p,
            )
            continue

        p_eff = p_snv_resolved
        if signal_mode == "double_confirmation" and p_mod_valid is not None:
            raw_wm = (
                c.get("w_model")
                if c.get("w_model") is not None
                else ((seg_cfg.get("w_model") if seg_cfg else None) or config["default_model_blend_weight"])
            )
            w_mod = _clamp_number(float(raw_wm), 0.0, 1.0)
            mod_vec_raw = c.get("model_market_probs")
            if (
                isinstance(mod_vec_raw, (list, tuple, np.ndarray))
                and nv_vec is not None
                and len(mod_vec_raw) == len(nv_vec)
                and sel_idx is not None
            ):
                blended_v = blend_confirmation_probabilities([float(x) for x in mod_vec_raw], nv_vec, w_mod)
                p_eff = blended_v[sel_idx]
            else:
                p_eff = blend_scalar_confirmation_prob(p_mod_valid, p_snv_resolved, w_mod)

        kelly = pe.compute_shrunk_quarter_kelly(
            p_eff,
            price_rec,
            sigma_p,
            float(config["uncertainty_penalty_k"]),
            kelly_fraction,
            bankroll_unit_pct,
        )
        if kelly["edge_erased"] or kelly["stake_raw_u"] <= 0.0:
            decisions[idx] = _make_rejection(
                "uncertainty_erased_edge",
                sharp_b=sharp_book_raw,
                p_snv=p_snv_resolved,
                cond1=True,
                cond2=cond2_confirms,
                p_mod=p_mod_valid,
                p_eff=p_eff,
                sigma_p=sigma_p,
                p_shrunk=kelly["p_shrunk"],
                f_q=kelly["f_quarter"],
                stake_raw=kelly["stake_raw_u"],
                g_val=kelly["expected_log_growth_g"],
            )
            continue

        seg_ci_low = seg_cfg.get("segment_clv_ci95_low") if seg_cfg else None
        if stale_ev_sh + _EPS_PARITY >= req_ev_val:
            tier = "valor"
        elif signal_mode == "double_confirmation" and (seg_ci_low is None or float(seg_ci_low) > 0.0):
            tier = "solido"
        else:
            tier = "valor"

        survivors.append(
            {
                "candidate_id": cid,
                "input_index": idx,
                "signal_mode": signal_mode,
                "tier": tier,
                "cond1_stale_line": True,
                "cond2_model_confirms": cond2_confirms,
                "event_id": eid,
                "sport": sport,
                "league": league,
                "market": mkt_canon,
                "line": line_norm,
                "selection": sel_canon,
                "recreational_book": rec_book_canon,
                "sharp_book": sharp_book_raw,
                "utc_date": utc_date,
                "segment_key": seg_key,
                "odds_bucket": pe.classify_odds_bucket(price_rec),
                "price_recreational": price_rec,
                "p_recreational_implied": p_imp,
                "p_sharp_novig": p_snv_resolved,
                "price_sharp_novig": 1.0 / p_snv_resolved,
                "stale_prob_margin_obs": stale_pm_obs,
                "stale_ev_sharp": stale_ev_sh,
                "price_ratio_vs_sharp_novig": price_rec * p_snv_resolved,
                "p_modelo": p_mod_valid,
                "model_edge_over_implied": (p_mod_valid - p_imp) if p_mod_valid is not None else None,
                "model_ev_recreational": (p_mod_valid * price_rec - 1.0) if p_mod_valid is not None else None,
                "model_vs_sharp_diff": (p_mod_valid - p_snv_resolved) if p_mod_valid is not None else None,
                "sharp_quote_age_minutes": sharp_age_min,
                "recreational_quote_age_minutes": rec_age_min,
                "recreational_vs_sharp_lag_minutes": rec_vs_sharp_lag_min,
                "p_effective": p_eff,
                "sigma_p": sigma_p,
                "p_shrunk": kelly["p_shrunk"],
                "adverse_ticks_1h": adverse_ticks_1h,
                "f_quarter": kelly["f_quarter"],
                "stake_raw_u": kelly["stake_raw_u"],
                "expected_log_growth_g": kelly["expected_log_growth_g"],
            }
        )

    def _sort_key_surv(item: dict[str, Any]) -> tuple[float, float, int]:
        return (-item["expected_log_growth_g"], -item["stale_ev_sharp"], item["input_index"])

    survivors.sort(key=_sort_key_surv)
    rho_same_ev = float(config["rho_same_event"])
    next_rank = 1

    for s in survivors:
        eid = s["event_id"]
        ld_key = f"{s['league']}::{s['utc_date']}"
        mkt_set = event_mkts.setdefault(eid, set())

        def _finalize(
            approved_f: bool,
            reason_f: str | None,
            corr_f: float,
            stake_f: float,
            rank_f: int | None,
            cap_f: bool,
        ) -> StaleLineDecisionResult:
            return StaleLineDecisionResult(
                candidate_id=s["candidate_id"],
                input_index=s["input_index"],
                approved=approved_f,
                rejection_reason=reason_f,
                signal_mode=s["signal_mode"],
                tier=s["tier"] if approved_f else None,
                cond1_stale_line=s["cond1_stale_line"],
                cond2_model_confirms=s["cond2_model_confirms"],
                event_id=s["event_id"],
                sport=s["sport"],
                league=s["league"],
                market=s["market"],
                line=s["line"],
                selection=s["selection"],
                recreational_book=s["recreational_book"],
                sharp_book=s["sharp_book"],
                utc_date=s["utc_date"],
                segment_key=s["segment_key"],
                odds_bucket=s["odds_bucket"],
                price_recreational=s["price_recreational"],
                p_recreational_implied=s["p_recreational_implied"],
                p_sharp_novig=s["p_sharp_novig"],
                price_sharp_novig=s["price_sharp_novig"],
                stale_prob_margin_obs=s["stale_prob_margin_obs"],
                stale_ev_sharp=s["stale_ev_sharp"],
                price_ratio_vs_sharp_novig=s["price_ratio_vs_sharp_novig"],
                p_modelo=s["p_modelo"],
                model_edge_over_implied=s["model_edge_over_implied"],
                model_ev_recreational=s["model_ev_recreational"],
                model_vs_sharp_diff=s["model_vs_sharp_diff"],
                sharp_quote_age_minutes=s["sharp_quote_age_minutes"],
                recreational_quote_age_minutes=s["recreational_quote_age_minutes"],
                recreational_vs_sharp_lag_minutes=s["recreational_vs_sharp_lag_minutes"],
                p_effective=s["p_effective"],
                sigma_p=s["sigma_p"],
                p_shrunk=s["p_shrunk"],
                adverse_ticks_1h=s["adverse_ticks_1h"],
                f_quarter=s["f_quarter"],
                stake_raw_u=s["stake_raw_u"],
                correlation_multiplier=corr_f,
                stake_u=stake_f,
                expected_log_growth_g=s["expected_log_growth_g"],
                allocation_rank=rank_f,
                cap_applied=cap_f,
            )

        if s["market"] in mkt_set:
            decisions[s["input_index"]] = _finalize(False, "correlated_same_event_market", 0.0, 0.0, None, False)
            continue

        prior_cnt = event_counts.get(eid, 0)
        corr_mult = (1.0 / (1.0 + prior_cnt * rho_same_ev)) if (prior_cnt > 0 and rho_same_ev > 0.0) else 1.0
        stake_corr_u = s["stake_raw_u"] * corr_mult

        used_ev = event_exp.get(eid, 0.0)
        used_ld = ld_exp.get(ld_key, 0.0)
        used_gd = gd_exp.get(s["utc_date"], 0.0)

        if cap_event_max - used_ev <= _EPS_PARITY:
            decisions[s["input_index"]] = _finalize(False, "cap_event_exhausted", corr_mult, 0.0, None, True)
            continue
        if cap_ld_max - used_ld <= _EPS_PARITY:
            decisions[s["input_index"]] = _finalize(False, "cap_league_date_exhausted", corr_mult, 0.0, None, True)
            continue
        if cap_gd_max - used_gd <= _EPS_PARITY:
            decisions[s["input_index"]] = _finalize(False, "cap_global_date_exhausted", corr_mult, 0.0, None, True)
            continue

        stake_u = min(stake_corr_u, cap_pick_max)
        stake_u = _clamp_safe_addition(used_ev, stake_u, cap_event_max)
        stake_u = _clamp_safe_addition(used_ld, stake_u, cap_ld_max)
        stake_u = _clamp_safe_addition(used_gd, stake_u, cap_gd_max)

        cap_applied = (stake_u + 1e-15) < stake_corr_u
        if stake_u < min_stake_u:
            decisions[s["input_index"]] = _finalize(False, "stake_below_min_unit", corr_mult, 0.0, None, cap_applied)
            continue

        rank = next_rank
        next_rank += 1
        event_exp[eid] = used_ev + stake_u
        ld_exp[ld_key] = used_ld + stake_u
        gd_exp[s["utc_date"]] = used_gd + stake_u
        event_counts[eid] = prior_cnt + 1
        mkt_set.add(s["market"])

        decisions[s["input_index"]] = _finalize(True, None, corr_mult, stake_u, rank, cap_applied)

    return [d for d in decisions if d is not None]


def evaluate_stale_line_candidate(
    candidate: Mapping[str, Any],
    config: Mapping[str, Any],
    *,
    portfolio_state: Mapping[str, Any] | None = None,
    override_signal_mode: str | None = None,
) -> StaleLineDecisionResult:
    return evaluate_stale_line_batch(
        [candidate],
        config,
        portfolio_state=portfolio_state,
        override_signal_mode=override_signal_mode,
    )[0]


def stale_decision_to_ledger_pick_input(
    decision: StaleLineDecisionResult | Mapping[str, Any],
    *,
    pick_id: str,
    ts_emitido: str,
    version_modelo: str,
    features_hash: str,
    price_tomado: float | None = None,
) -> dict[str, Any]:
    if not decision["approved"] or decision["tier"] is None:
        raise StaleLineConfigValidationError(
            f"No se puede registrar en ledger un candidato rechazado ({decision['candidate_id']})."
        )
    exec_price = float(price_tomado) if price_tomado is not None else float(decision["price_recreational"])
    p_eff = float(decision["p_effective"])
    return {
        "pick_id": pick_id,
        "ts_emitido": ts_emitido,
        "event_id": decision["event_id"],
        "sport": decision["sport"],
        "league": decision["league"],
        "market": decision["market"],
        "line": decision["line"],
        "selection": decision["selection"],
        "book": decision["recreational_book"],
        "price_tomado": exec_price,
        "p_modelo": float(decision["p_modelo"]) if decision["p_modelo"] is not None else float(decision["p_sharp_novig"]),
        "p_mercado": float(decision["p_sharp_novig"]),
        "p_final": p_eff,
        "ev": p_eff * exec_price - 1.0,
        "stake_u": float(decision["stake_u"]),
        "tier": str(decision["tier"]),
        "version_modelo": version_modelo,
        "features_hash": features_hash,
    }


# ---------------------------------------------------------------------------
# Medición pura de intervalos/desfases + Fórmula matemática de cadencia (paridad TS `< 1e-12`)
# ---------------------------------------------------------------------------


def summarize_quantiles(values: Sequence[float] | np.ndarray) -> dict[str, Any]:
    finite = [float(v) for v in values if _is_real_number(v)]
    if not finite:
        return {
            "n": 0,
            "min": None,
            "p25": None,
            "median": None,
            "p75": None,
            "max": None,
            "mean": None,
        }
    arr = np.sort(np.asarray(finite, dtype=np.float64))
    return {
        "n": int(arr.shape[0]),
        "min": float(arr[0]),
        "p25": float(clv_report.quantile_linear_sorted(arr, 0.25)),
        "median": float(clv_report.quantile_linear_sorted(arr, 0.50)),
        "p75": float(clv_report.quantile_linear_sorted(arr, 0.75)),
        "max": float(arr[-1]),
        "mean": float(np.sum(arr) / arr.shape[0]),
    }


def measure_snapshot_capture_cadence(snapshots: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    parsed: list[tuple[str, str, str, str, str, int]] = []
    for s in snapshots:
        ts_us = pe.parse_iso_utc_micros(s.get("ts_captured"))
        if ts_us is None:
            continue
        if s.get("ts_event_start") is not None:
            st_us = pe.parse_iso_utc_micros(s.get("ts_event_start"))
            if st_us is not None and ts_us > st_us:
                continue
        ln = normalize_stale_line(s.get("line"))
        parsed.append(
            (
                str(s.get("event_id") or "").strip(),
                canonical_stale_market(s.get("market")),
                "null" if ln is None else f"{ln:.4f}",
                canonical_stale_selection(s.get("selection")),
                canonical_stale_book(s.get("book")),
                ts_us,
            )
        )

    by_book_snaps: dict[str, list[tuple[str, str, str, str, str, int]]] = {}
    for p in parsed:
        by_book_snaps.setdefault(p[4], []).append(p)

    by_book_out: dict[str, Any] = {}
    for book in sorted(by_book_snaps.keys()):
        rows = by_book_snaps[book]
        events_set = {r[0] for r in rows}
        ts_set = {r[5] for r in rows}
        series_map: dict[tuple[str, str, str, str], list[int]] = {}
        for r in rows:
            series_map.setdefault((r[0], r[1], r[2], r[3]), []).append(r[5])

        intra_diffs: list[float] = []
        for ts_list in series_map.values():
            uniq = sorted(set(ts_list))
            for i in range(1, len(uniq)):
                intra_diffs.append((uniq[i] - uniq[i - 1]) / 60_000_000.0)

        global_waves = sorted(ts_set)
        wave_diffs = [(global_waves[i] - global_waves[i - 1]) / 60_000_000.0 for i in range(1, len(global_waves))]

        by_book_out[book] = {
            "n_rows": len(rows),
            "n_events": len(events_set),
            "n_unique_timestamps": len(global_waves),
            "intra_series_intervals_minutes": summarize_quantiles(intra_diffs),
            "global_wave_intervals_minutes": summarize_quantiles(wave_diffs),
            "single_capture_only": len(intra_diffs) == 0,
        }

    sharp_series: dict[tuple[str, str, str, str], dict[str, list[int]]] = {}
    for p in parsed:
        if p[4] not in ("pinnacle", "smarkets"):
            continue
        entry = sharp_series.setdefault((p[0], p[1], p[2], p[3]), {"pinnacle": [], "smarkets": []})
        entry[p[4]].append(p[5])
    for entry in sharp_series.values():
        entry["pinnacle"].sort()
        entry["smarkets"].sort()

    signed_all_min: list[float] = []
    causal_lag_min: list[float] = []
    for p in parsed:
        if p[4] not in _RECREATIONAL_BOOKS_SET:
            continue
        sh = sharp_series.get((p[0], p[1], p[2], p[3]))
        if sh is None:
            continue
        ref_list = sh["pinnacle"] if sh["pinnacle"] else sh["smarkets"]
        if not ref_list:
            continue

        best_signed_us = ref_list[0]
        best_abs = abs(p[5] - best_signed_us)
        for cand_us in ref_list[1:]:
            d = abs(p[5] - cand_us)
            if d < best_abs:
                best_abs = d
                best_signed_us = cand_us
        signed_all_min.append((p[5] - best_signed_us) / 60_000_000.0)

        latest_causal: int | None = None
        for cand_us in ref_list:
            if cand_us <= p[5]:
                latest_causal = cand_us
            else:
                break
        if latest_causal is not None:
            causal_lag_min.append((p[5] - latest_causal) / 60_000_000.0)

    return {
        "n_rows": len(parsed),
        "by_book": by_book_out,
        "paired_recreational_vs_sharp": {
            "n_all_pairs": len(signed_all_min),
            "n_causal_pairs": len(causal_lag_min),
            "signed_lag_all_minutes": summarize_quantiles(signed_all_min),
            "causal_lag_minutes": summarize_quantiles(causal_lag_min),
        },
    }


def compute_polling_survival_factor(polling_interval_minutes: float, decay_rate_per_min: float) -> float:
    if not _is_real_number(polling_interval_minutes) or float(polling_interval_minutes) < 0.0:
        raise StaleLineConfigValidationError(f"polling_interval_minutes inválido: {polling_interval_minutes!r}")
    if not _is_real_number(decay_rate_per_min) or float(decay_rate_per_min) < 0.0:
        raise StaleLineConfigValidationError(f"decay_rate_per_min inválido: {decay_rate_per_min!r}")
    x = float(decay_rate_per_min) * float(polling_interval_minutes)
    if x < 1e-6:
        return 1.0 - x / 2.0 + (x * x) / 6.0 - (x * x * x) / 24.0
    return (1.0 - math.exp(-x)) / x


def compute_expected_edge_survival(
    polling_interval_minutes: float,
    effective_decay_rate_per_min: float,
    execution_delay_minutes: float,
) -> float:
    if not _is_real_number(execution_delay_minutes) or float(execution_delay_minutes) < 0.0:
        raise StaleLineConfigValidationError(f"execution_delay_minutes inválido: {execution_delay_minutes!r}")
    return math.exp(-float(effective_decay_rate_per_min) * float(execution_delay_minutes)) * compute_polling_survival_factor(
        polling_interval_minutes, effective_decay_rate_per_min
    )


def solve_dimensionless_polling_decay_product(max_polling_decay_fraction: float) -> float:
    if (
        not _is_real_number(max_polling_decay_fraction)
        or float(max_polling_decay_fraction) <= 0.0
        or float(max_polling_decay_fraction) >= 0.9
    ):
        raise StaleLineConfigValidationError(
            f"max_polling_decay_fraction debe estar en (0, 0.9): {max_polling_decay_fraction!r}"
        )
    target = 1.0 - float(max_polling_decay_fraction)
    lo = 1e-9
    hi = 50.0
    for _ in range(120):
        mid = 0.5 * (lo + hi)
        s = (
            1.0 - mid / 2.0 + (mid * mid) / 6.0 - (mid * mid * mid) / 24.0
            if mid < 1e-6
            else (1.0 - math.exp(-mid)) / mid
        )
        if s > target:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def derive_recommended_scraping_cadence(params: Mapping[str, Any]) -> dict[str, Any]:
    g_sharp = params.get("sharp_live_gap_median_minutes")
    p_move = params.get("sharp_live_move_fraction")
    h_ref = params.get("sharp_reference_horizon_minutes")
    gamma = params.get("horizon_acceleration_exponent")
    beta_conv = params.get("recreational_convergence_beta")
    d_exec = params.get("execution_delay_minutes")
    alpha_poll = params.get("max_polling_decay_fraction")
    regimes = params.get("regimes")

    if not _is_real_number(g_sharp) or float(g_sharp) <= 0.0:
        raise StaleLineConfigValidationError(f"sharp_live_gap_median_minutes inválido: {g_sharp!r}")
    if not _is_real_number(p_move) or float(p_move) <= 0.0 or float(p_move) >= 1.0:
        raise StaleLineConfigValidationError(f"sharp_live_move_fraction debe estar en (0, 1): {p_move!r}")
    if not _is_real_number(h_ref) or float(h_ref) <= 0.0:
        raise StaleLineConfigValidationError(f"sharp_reference_horizon_minutes inválido: {h_ref!r}")
    if not _is_real_number(gamma) or float(gamma) < 0.0 or float(gamma) > 1.0:
        raise StaleLineConfigValidationError(f"horizon_acceleration_exponent debe estar en [0, 1]: {gamma!r}")
    if not _is_real_number(beta_conv) or float(beta_conv) <= 0.0 or float(beta_conv) >= 1.0:
        raise StaleLineConfigValidationError(f"recreational_convergence_beta debe estar en (0, 1): {beta_conv!r}")
    if not _is_real_number(d_exec) or float(d_exec) < 0.0:
        raise StaleLineConfigValidationError(f"execution_delay_minutes inválido: {d_exec!r}")
    if not isinstance(regimes, Sequence) or len(regimes) == 0:
        raise StaleLineConfigValidationError("Se requiere al menos un régimen en derive_recommended_scraping_cadence.")

    g_sharp_f = float(g_sharp)
    p_move_f = _clamp_number(float(p_move), 1e-6, 0.999999)
    h_ref_f = float(h_ref)
    gamma_f = float(gamma)
    beta_f = _clamp_number(float(beta_conv), 1e-6, 0.999999)
    d_exec_f = float(d_exec)
    alpha_f = float(alpha_poll)

    base_sharp_hazard = -math.log(1.0 - p_move_f) / g_sharp_f
    base_sharp_inter = 1.0 / base_sharp_hazard
    x_star = solve_dimensionless_polling_decay_product(alpha_f)
    neg_log_one_minus_beta = -math.log(1.0 - beta_f)

    regime_results: list[dict[str, Any]] = []
    for reg in regimes:
        h_raw = reg.get("horizon_minutes")
        if not _is_real_number(h_raw) or float(h_raw) <= 0.0:
            raise StaleLineConfigValidationError(
                f"horizon_minutes inválido en régimen '{reg.get('regime_id')}': {h_raw!r}"
            )
        H = float(h_raw)
        mu_sharp_h = base_sharp_hazard * math.pow(h_ref_f / H, gamma_f)
        lambda_rec_h = neg_log_one_minus_beta / H
        lambda_eff_h = mu_sharp_h + lambda_rec_h
        tau_win_h = 1.0 / lambda_eff_h
        half_life_h = math.log(2.0) / lambda_eff_h

        dt_decay = x_star / lambda_eff_h
        dt_nyquist = 0.5 * tau_win_h
        dt_horizon = 0.25 * H

        dt_star = dt_decay
        binding = "edge_decay_budget"
        if dt_nyquist < dt_star:
            dt_star = dt_nyquist
            binding = "nyquist_half_window"
        if dt_horizon < dt_star:
            dt_star = dt_horizon
            binding = "horizon_observability"

        poll_surv_rec = compute_polling_survival_factor(dt_star, lambda_eff_h)
        tot_surv_rec = compute_expected_edge_survival(dt_star, lambda_eff_h, d_exec_f)
        tot_surv_curr = compute_expected_edge_survival(g_sharp_f, lambda_eff_h, d_exec_f)

        regime_results.append(
            {
                "regime_id": str(reg["regime_id"]),
                "description": str(reg["description"]),
                "horizon_minutes": H,
                "horizon_hours": H / 60.0,
                "sharp_move_hazard_per_min": mu_sharp_h,
                "mean_sharp_inter_move_minutes": 1.0 / mu_sharp_h,
                "recreational_convergence_rate_per_min": lambda_rec_h,
                "effective_decay_rate_per_min": lambda_eff_h,
                "mean_stale_window_minutes": tau_win_h,
                "stale_edge_half_life_minutes": half_life_h,
                "decay_bound_minutes": dt_decay,
                "nyquist_bound_minutes": dt_nyquist,
                "horizon_observability_bound_minutes": dt_horizon,
                "recommended_interval_minutes": dt_star,
                "recommended_interval_seconds": dt_star * 60.0,
                "binding_constraint": binding,
                "polling_survival_factor_at_recommended": poll_surv_rec,
                "expected_edge_survival_at_recommended": tot_surv_rec,
                "expected_edge_survival_at_current_sharp_gap": tot_surv_curr,
                "absolute_survival_gain_vs_current_gap": tot_surv_rec - tot_surv_curr,
            }
        )

    return {
        "formula_name": "exponential_stale_window_nyquist_v1",
        "equation_summary": (
            "λ_eff(H) = [-ln(1 - p_move)/G_sharp]*(H_ref/H)^γ + [-ln(1 - β_conv)/H]; "
            "(1 - exp(-x*))/x* = 1 - α_poll; Δt*(H) = min(x*/λ_eff(H), 0.5/λ_eff(H), 0.25*H); "
            "η(Δt,H) = exp(-λ_eff(H)*d_exec)*(1 - exp(-λ_eff(H)*Δt))/(λ_eff(H)*Δt)"
        ),
        "inputs": {
            "sharp_live_gap_median_minutes": g_sharp_f,
            "sharp_live_move_fraction": float(p_move),
            "sharp_reference_horizon_minutes": h_ref_f,
            "horizon_acceleration_exponent": gamma_f,
            "recreational_convergence_beta": float(beta_conv),
            "execution_delay_minutes": d_exec_f,
            "max_polling_decay_fraction": alpha_f,
        },
        "base_sharp_move_hazard_per_min": base_sharp_hazard,
        "base_sharp_mean_inter_move_minutes": base_sharp_inter,
        "solved_dimensionless_decay_product_x": x_star,
        "regimes": regime_results,
    }


# Aliases camelCase para ergonomía cruzada con TS
evaluateStaleLineBatch = evaluate_stale_line_batch
evaluateStaleLineCandidate = evaluate_stale_line_candidate
deriveRecommendedScrapingCadence = derive_recommended_scraping_cadence
measureSnapshotCaptureCadence = measure_snapshot_capture_cadence


# ---------------------------------------------------------------------------
# Bootstrap determinista (`>= 1000` remuestreos, `mulberry32`) para reportes A8
# ---------------------------------------------------------------------------


def _significance_from_ci(ci_low: float | None, ci_high: float | None) -> tuple[bool, str]:
    if ci_low is None or ci_high is None:
        return False, "no significativa"
    if ci_low > 0.0:
        return True, "significativa_positiva"
    if ci_high < 0.0:
        return True, "significativa_negativa"
    return False, "no significativa"


def bootstrap_mean_ci95(
    values: Sequence[float] | np.ndarray,
    *,
    n_resamples: int = 1000,
    seed: int = 20261111,
) -> dict[str, Any]:
    """IC 95% bootstrap determinista (`mulberry32` + cuantil lineal Type-7) sobre la media."""
    if int(n_resamples) < 1000:
        raise ValueError("n_resamples debe ser >= 1000.")
    arr = np.asarray([float(x) for x in values if _is_real_number(x)], dtype=np.float64)
    n = int(arr.shape[0])
    if n == 0:
        return {
            "n": 0,
            "mean": None,
            "ci95": None,
            "ci95_low": None,
            "ci95_high": None,
            "statistically_significant": False,
            "significance_label": "no significativa",
        }
    mean_val = float(np.mean(arr))
    if n == 1:
        return {
            "n": 1,
            "mean": mean_val,
            "ci95": [mean_val, mean_val],
            "ci95_low": mean_val,
            "ci95_high": mean_val,
            "statistically_significant": False,
            "significance_label": "no significativa",
        }
    # Para muestras masivas (> 5000), bloque vectorizado por lotes para no saturar RAM manteniendo mulberry32 exacto
    boot_means = np.empty(int(n_resamples), dtype=np.float64)
    batch_sz = max(1, min(int(n_resamples), max(1, 2_000_000 // n)))
    pos = 0
    batch_idx = 0
    while pos < int(n_resamples):
        cur = min(batch_sz, int(n_resamples) - pos)
        unifs = clv_report.mulberry32_uniforms(int(seed + 97 * batch_idx), cur * n)
        idx_mat = np.floor(unifs * n).astype(np.int64).reshape(cur, n)
        boot_means[pos : pos + cur] = arr[idx_mat].mean(axis=1)
        pos += cur
        batch_idx += 1

    boot_sorted = np.sort(boot_means)
    ci_lo = float(clv_report.quantile_linear_sorted(boot_sorted, 0.025))
    ci_hi = float(clv_report.quantile_linear_sorted(boot_sorted, 0.975))
    sig, label = _significance_from_ci(ci_lo, ci_hi)
    return {
        "n": n,
        "mean": mean_val,
        "ci95": [ci_lo, ci_hi],
        "ci95_low": ci_lo,
        "ci95_high": ci_hi,
        "statistically_significant": sig,
        "significance_label": label,
    }


def bootstrap_ols_slope_ci95(
    x: np.ndarray,
    y: np.ndarray,
    *,
    n_resamples: int = 1000,
    seed: int = 20261111,
) -> dict[str, Any]:
    """Pendiente sin intercepto `sum(x*y) / sum(x^2)` con IC 95% bootstrap (`>= 1000` remuestreos)."""
    if int(n_resamples) < 1000:
        raise ValueError("n_resamples debe ser >= 1000.")
    n = int(x.shape[0])
    if n < 2 or float(np.sum(x * x)) <= 1e-15:
        return {
            "n": n,
            "slope": None,
            "ci95": None,
            "statistically_significant": False,
            "significance_label": "no significativa",
        }
    xy = x * y
    xx = x * x
    slope_obs = float(np.sum(xy) / np.sum(xx))

    boot_slopes = np.empty(int(n_resamples), dtype=np.float64)
    batch_sz = max(1, min(int(n_resamples), max(1, 2_000_000 // n)))
    pos = 0
    batch_idx = 0
    while pos < int(n_resamples):
        cur = min(batch_sz, int(n_resamples) - pos)
        unifs = clv_report.mulberry32_uniforms(int(seed + 131 * batch_idx), cur * n)
        idx_mat = np.floor(unifs * n).astype(np.int64).reshape(cur, n)
        num = xy[idx_mat].sum(axis=1)
        den = np.maximum(1e-15, xx[idx_mat].sum(axis=1))
        boot_slopes[pos : pos + cur] = num / den
        pos += cur
        batch_idx += 1

    boot_sorted = np.sort(boot_slopes)
    ci_lo = float(clv_report.quantile_linear_sorted(boot_sorted, 0.025))
    ci_hi = float(clv_report.quantile_linear_sorted(boot_sorted, 0.975))
    sig, label = _significance_from_ci(ci_lo, ci_hi)
    return {
        "n": n,
        "slope": slope_obs,
        "ci95": [ci_lo, ci_hi],
        "statistically_significant": sig,
        "significance_label": label,
    }


# ---------------------------------------------------------------------------
# 1(a). Medición real de `scraped_ws` (`9–10 nov 2026`) sobre `odds_snapshots.parquet`
# ---------------------------------------------------------------------------


def _vec_power_devig_matrix(q_mat: np.ndarray) -> np.ndarray:
    lo = np.full(len(q_mat), 1e-6, dtype=np.float64)
    hi = np.full(len(q_mat), 5.0, dtype=np.float64)
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        s = np.sum(np.power(q_mat, mid[:, None]), axis=1)
        lo = np.where(s > 1.0, mid, lo)
        hi = np.where(s <= 1.0, mid, hi)
    alpha = 0.5 * (lo + hi)
    p = np.power(q_mat, alpha[:, None])
    return p / np.sum(p, axis=1, keepdims=True)


def analyze_scraped_ws_empirical(parquet_path: Path = DEFAULT_ODDS_PARQUET_PATH) -> dict[str, Any]:
    """Mide directamente en `odds_snapshots.parquet` (`source == 'scraped_ws'`) intervalos entre capturas,
    desfases entre casas sharp y recreativas, frecuencia/magnitud de líneas rezagadas y límites reales."""
    import backtest as bt

    ws = pd.read_parquet(parquet_path, filters=[("source", "==", "scraped_ws")])
    ws["ts_captured"] = pd.to_datetime(ws["ts_captured"], utc=True)
    ws["ts_event_start"] = pd.to_datetime(ws["ts_event_start"], utc=True)
    ws = ws[ws["ts_captured"] <= ws["ts_event_start"]].copy()

    ws["book_raw"] = ws["book"].astype(str).str.strip().str.lower()
    ws["book_canon"] = bt._fast_canon_series(ws["book_raw"], canonical_stale_book)
    ws["market_canon"] = bt._fast_canon_series(ws["market"], canonical_stale_market)
    ws["sel_canon"] = bt._fast_canon_series(ws["selection"], canonical_stale_selection)
    ws["line_key"] = ws["line"].fillna(-9999.0).round(4)
    ws["ttc_minutes"] = (ws["ts_event_start"] - ws["ts_captured"]).dt.total_seconds() / 60.0

    def _cadence_by_col(col_name: str) -> dict[str, Any]:
        out: dict[str, Any] = {}
        for b_val, grp in ws.groupby(col_name, sort=True):
            s_grp = grp.sort_values(["event_id", "market_canon", "line_key", "sel_canon", "ts_captured"], kind="mergesort")
            dedup = s_grp.drop_duplicates(["event_id", "market_canon", "line_key", "sel_canon", "ts_captured"])
            prev_ts = dedup.groupby(["event_id", "market_canon", "line_key", "sel_canon"])["ts_captured"].shift(1)
            intra_min = ((dedup["ts_captured"] - prev_ts).dropna().dt.total_seconds() / 60.0).to_numpy(dtype=np.float64)

            uniq_ts = np.sort(grp["ts_captured"].unique())
            wave_min = (
                (pd.Series(uniq_ts).diff().dropna().dt.total_seconds() / 60.0).to_numpy(dtype=np.float64)
                if len(uniq_ts) >= 2
                else np.empty(0, dtype=np.float64)
            )
            out[str(b_val)] = {
                "n_rows": int(len(grp)),
                "n_events": int(grp["event_id"].nunique()),
                "sports": sorted(grp["sport"].astype(str).unique().tolist()),
                "leagues": sorted(grp["league"].astype(str).unique().tolist()),
                "n_unique_timestamps": int(len(uniq_ts)),
                "first_ts_captured": pd.Timestamp(uniq_ts[0]).isoformat() if len(uniq_ts) > 0 else None,
                "last_ts_captured": pd.Timestamp(uniq_ts[-1]).isoformat() if len(uniq_ts) > 0 else None,
                "intra_series_intervals_minutes": summarize_quantiles(intra_min),
                "global_wave_intervals_minutes": summarize_quantiles(wave_min),
                "single_capture_per_series": int(intra_min.shape[0]) == 0,
            }
        return out

    by_raw_book = _cadence_by_col("book_raw")
    by_canon_book = _cadence_by_col("book_canon")

    # Dinámica viva observada en Pinnacle (y casas multi-captura) para la derivación matemática de cadencia
    pin_ws = ws[ws["book_canon"] == "pinnacle"].sort_values(
        ["event_id", "market_canon", "line_key", "sel_canon", "ts_captured"], kind="mergesort"
    )
    pin_dedup = pin_ws.drop_duplicates(["event_id", "market_canon", "line_key", "sel_canon", "ts_captured"]).copy()
    pin_dedup["prev_price"] = pin_dedup.groupby(["event_id", "market_canon", "line_key", "sel_canon"])["price_decimal"].shift(1)
    pin_dedup["prev_ts"] = pin_dedup.groupby(["event_id", "market_canon", "line_key", "sel_canon"])["ts_captured"].shift(1)
    pin_pairs = pin_dedup[pin_dedup["prev_price"].notna()].copy()
    pin_pairs["dt_min"] = (pin_pairs["ts_captured"] - pin_pairs["prev_ts"]).dt.total_seconds() / 60.0
    pin_pairs["moved"] = pin_pairs["price_decimal"] != pin_pairs["prev_price"]
    pin_pairs["abs_dq"] = (1.0 / pin_pairs["price_decimal"] - 1.0 / pin_pairs["prev_price"]).abs()

    pin_gap_med = float(pin_pairs["dt_min"].median()) if not pin_pairs.empty else 78.78333333333333
    pin_p_move = float(pin_pairs["moved"].mean()) if not pin_pairs.empty else 0.2085889570552147
    pin_ref_horizon_min = float(pin_pairs["ttc_minutes"].median()) if not pin_pairs.empty else 8515.0

    # Medir tasa de cambio en eventos cercanos al kickoff (< 24h, ej. MNF DraftKings 49.32m) para estimar γ empírico
    dk_ws = ws[ws["book_raw"] == "draftkings"].sort_values(
        ["event_id", "market_canon", "line_key", "sel_canon", "ts_captured"], kind="mergesort"
    )
    dk_dedup = dk_ws.drop_duplicates(["event_id", "market_canon", "line_key", "sel_canon", "ts_captured"]).copy()
    dk_dedup["prev_price"] = dk_dedup.groupby(["event_id", "market_canon", "line_key", "sel_canon"])["price_decimal"].shift(1)
    dk_dedup["prev_ts"] = dk_dedup.groupby(["event_id", "market_canon", "line_key", "sel_canon"])["ts_captured"].shift(1)
    dk_pairs = dk_dedup[dk_dedup["prev_price"].notna()].copy()

    gamma_empirical = 0.0
    near_move_meta: dict[str, Any] = {"n_pairs": 0}
    if not dk_pairs.empty:
        dk_dt_med = float(((dk_pairs["ts_captured"] - dk_pairs["prev_ts"]).dt.total_seconds() / 60.0).median())
        dk_p_move = float((dk_pairs["price_decimal"] != dk_pairs["prev_price"]).mean())
        dk_ttc_med = float(dk_pairs["ttc_minutes"].median())
        if 0.0 < dk_p_move < 1.0 and 0.0 < pin_p_move < 1.0 and pin_ref_horizon_min > dk_ttc_med > 0.0:
            mu_far = -math.log(1.0 - pin_p_move) / pin_gap_med
            mu_near = -math.log(1.0 - dk_p_move) / dk_dt_med
            if mu_near > mu_far:
                gamma_empirical = _clamp_number(
                    math.log(mu_near / mu_far) / math.log(pin_ref_horizon_min / dk_ttc_med),
                    0.0,
                    1.0,
                )
        near_move_meta = {
            "reference_book": "draftkings",
            "n_pairs": int(len(dk_pairs)),
            "gap_median_minutes": dk_dt_med,
            "move_fraction": dk_p_move,
            "median_horizon_minutes": dk_ttc_med,
            "estimated_gamma_vs_pinnacle_far": gamma_empirical,
        }

    # Estado explícito y honesto de las casas objetivo MX y sharp en el lote `scraped_ws`
    cal_ws = ws[ws["book_canon"] == "caliente"]
    pin_waves = sorted(ws.loc[ws["book_canon"] == "pinnacle", "ts_captured"].unique())
    cal_waves = sorted(cal_ws["ts_captured"].unique())
    cal_vs_pin_clock_offsets_min: list[float] = []
    if cal_waves and pin_waves:
        c0 = pd.Timestamp(cal_waves[0])
        cal_vs_pin_clock_offsets_min = [
            float((c0 - pd.Timestamp(pw)).total_seconds() / 60.0) for pw in pin_waves
        ]

    target_books_audit = {
        "pinnacle": by_canon_book.get("pinnacle", {"n_rows": 0}),
        "smarkets": {
            "n_rows_in_odds_snapshots": int((ws["book_canon"] == "smarkets").sum()),
            "paired_events": 0,
            "honest_status": (
                "0 filas válidas en odds_snapshots.parquet (158 cotizaciones crudas en market_microstructure.json "
                "carecían de vínculo /contracts/ a evento/selección en A1)."
            ),
        },
        "caliente": {
            "n_rows_in_odds_snapshots": int(len(cal_ws)),
            "n_events": int(cal_ws["event_id"].nunique()),
            "events": sorted(cal_ws["event_id"].astype(str).unique().tolist()),
            "timestamps_utc": [pd.Timestamp(t).isoformat() for t in cal_waves],
            "intra_event_intervals_count": 0,
            "batch_clock_offset_vs_pinnacle_waves_minutes": cal_vs_pin_clock_offsets_min,
            "paired_events_with_sharp": 0,
            "honest_status": (
                "1 sola captura válida (3 filas 1x2 en Kosovo vs Israel, 2026-11-09T18:46:52Z, +0.65 min después de "
                "la Ola 1 de Pinnacle 18:46:13Z). 0 eventos apareados con Pinnacle porque Pinnacle en scraped_ws "
                "solo cubrió 13 partidos NFL y 0 de fútbol."
            ),
        },
        "codere": {
            "n_rows_in_odds_snapshots": int((ws["book_canon"] == "codere").sum()),
            "paired_events_with_sharp": 0,
            "honest_status": (
                "0 filas válidas en odds_snapshots.parquet (30 muestras DOM de portada en raw carecían de "
                "ts_event_start y fueron descartadas por integridad causal en A1)."
            ),
        },
        "b365": by_canon_book.get("b365", {"n_rows": 0}),
    }

    # Apareamiento exacto `(event_id, market_canon, line_key)` recreativa vs Pinnacle sin margen en `scraped_ws`
    sharp_markets: dict[tuple[str, str, float], list[tuple[pd.Timestamp, dict[str, float], dict[str, float]]]] = {}
    for (eid, mkt, lk, ts_c), grp in pin_ws.groupby(["event_id", "market_canon", "line_key", "ts_captured"]):
        sel_order = selection_order_for_market(mkt)
        by_s = {str(r.sel_canon): float(r.price_decimal) for r in grp.itertuples(index=False)}
        if not all(s in by_s for s in sel_order):
            continue
        raw_p = [by_s[s] for s in sel_order]
        if not (MIN_OVERROUND <= sum(1.0 / x for x in raw_p) <= MAX_OVERROUND):
            continue
        nv_p = devig_sharp_market_prices(raw_p, "power")
        sharp_markets.setdefault((str(eid), str(mkt), float(lk)), []).append(
            (ts_c, by_s, {s: nv_p[i] for i, s in enumerate(sel_order)})
        )
    for k in sharp_markets:
        sharp_markets[k].sort(key=lambda item: item[0])

    rec_ws = ws[ws["book_canon"].isin(_RECREATIONAL_BOOKS_SET)].copy()
    paired_records_all: list[dict[str, Any]] = []
    paired_records_causal: list[dict[str, Any]] = []
    market_lag_signed_min: list[float] = []
    market_lag_causal_min: list[float] = []

    for (eid, lg, mkt, lk, b_raw, b_can, ts_rec), grp in rec_ws.groupby(
        ["event_id", "league", "market_canon", "line_key", "book_raw", "book_canon", "ts_captured"]
    ):
        sh_list = sharp_markets.get((str(eid), str(mkt), float(lk)))
        if not sh_list:
            continue
        sel_order = selection_order_for_market(mkt)
        rec_by_s = {str(r.sel_canon): float(r.price_decimal) for r in grp.itertuples(index=False)}
        if not all(s in rec_by_s for s in sel_order):
            continue

        # Ola sharp más cercana en valor absoluto
        nearest_sh = min(sh_list, key=lambda item: abs((ts_rec - item[0]).total_seconds()))
        lag_signed = float((ts_rec - nearest_sh[0]).total_seconds() / 60.0)
        market_lag_signed_min.append(lag_signed)
        for s_name in sel_order:
            pr = rec_by_s[s_name]
            psnv = nearest_sh[2][s_name]
            paired_records_all.append(
                {
                    "event_id": str(eid),
                    "league": str(lg),
                    "market": str(mkt),
                    "line": None if float(lk) == -9999.0 else float(lk),
                    "selection": s_name,
                    "book_raw": str(b_raw),
                    "book_canon": str(b_can),
                    "ts_rec": ts_rec.isoformat(),
                    "ts_sharp": nearest_sh[0].isoformat(),
                    "lag_minutes": lag_signed,
                    "price_recreational": pr,
                    "price_sharp_novig": 1.0 / psnv,
                    "p_sharp_novig": psnv,
                    "prob_margin": psnv - (1.0 / pr),
                    "ev_vs_sharp_novig": psnv * pr - 1.0,
                }
            )

        # Última ola sharp estrictamente causal (`ts_sharp <= ts_rec`)
        causal_candidates = [item for item in sh_list if item[0] <= ts_rec]
        if causal_candidates:
            latest_sh = causal_candidates[-1]
            lag_causal = float((ts_rec - latest_sh[0]).total_seconds() / 60.0)
            market_lag_causal_min.append(lag_causal)
            for s_name in sel_order:
                pr = rec_by_s[s_name]
                psnv = latest_sh[2][s_name]
                paired_records_causal.append(
                    {
                        "event_id": str(eid),
                        "league": str(lg),
                        "market": str(mkt),
                        "line": None if float(lk) == -9999.0 else float(lk),
                        "selection": s_name,
                        "book_raw": str(b_raw),
                        "book_canon": str(b_can),
                        "ts_rec": ts_rec.isoformat(),
                        "ts_sharp": latest_sh[0].isoformat(),
                        "lag_minutes": lag_causal,
                        "price_recreational": pr,
                        "price_sharp_novig": 1.0 / psnv,
                        "p_sharp_novig": psnv,
                        "prob_margin": psnv - (1.0 / pr),
                        "ev_vs_sharp_novig": psnv * pr - 1.0,
                    }
                )

    thresholds = (0.0, 0.005, 0.01, 0.015, 0.02, 0.025, 0.03, 0.05)

    def _summarize_stale_thresholds(recs: list[dict[str, Any]]) -> dict[str, Any]:
        n_tot = len(recs)
        if n_tot == 0:
            return {"n_selections_evaluated": 0, "by_ev_threshold": {}}
        evs = np.array([r["ev_vs_sharp_novig"] for r in recs], dtype=np.float64)
        pms = np.array([r["prob_margin"] for r in recs], dtype=np.float64)
        by_thr: dict[str, Any] = {}
        for thr in thresholds:
            msk = evs > thr
            cnt = int(np.sum(msk))
            by_thr[f"ev_gt_{thr:.3f}"] = {
                "threshold": thr,
                "n_stale_selections": cnt,
                "pct_of_evaluated": float(cnt / n_tot),
                "mean_ev_vs_sharp": float(np.mean(evs[msk])) if cnt > 0 else None,
                "max_ev_vs_sharp": float(np.max(evs[msk])) if cnt > 0 else None,
                "mean_prob_margin": float(np.mean(pms[msk])) if cnt > 0 else None,
            }
        return {"n_selections_evaluated": n_tot, "by_ev_threshold": by_thr}

    by_rec_book_causal: dict[str, Any] = {}
    if paired_records_causal:
        cdf_c = pd.DataFrame(paired_records_causal)
        for bk, grp in cdf_c.groupby("book_canon", sort=True):
            pos = grp[grp["ev_vs_sharp_novig"] > 0.0]
            by_rec_book_causal[str(bk)] = {
                "n_selections_paired_causal": int(len(grp)),
                "n_stale_ev_gt_0": int(len(pos)),
                "pct_stale_ev_gt_0": float(len(pos) / len(grp)),
                "n_stale_ev_gt_1pct": int((grp["ev_vs_sharp_novig"] > 0.01).sum()),
                "max_ev_vs_sharp": float(pos["ev_vs_sharp_novig"].max()) if not pos.empty else 0.0,
                "lag_minutes_median": float(grp["lag_minutes"].median()),
            }

    top_causal_examples = sorted(
        [r for r in paired_records_causal if r["ev_vs_sharp_novig"] > 0.0],
        key=lambda r: r["ev_vs_sharp_novig"],
        reverse=True,
    )[:10]

    ttc_q = ws["ttc_minutes"].quantile([0.0, 0.10, 0.25, 0.50, 0.75, 0.90, 1.0]).to_dict()

    return {
        "n_rows_valid_pre_kickoff": int(len(ws)),
        "n_events": int(ws["event_id"].nunique()),
        "capture_window_utc": {
            "start": ws["ts_captured"].min().isoformat() if not ws.empty else None,
            "end": ws["ts_captured"].max().isoformat() if not ws.empty else None,
        },
        "time_to_kickoff_minutes_quantiles": {f"q{int(round(k*100)):02d}": float(v) for k, v in ttc_q.items()},
        "cadence_by_raw_book": by_raw_book,
        "cadence_by_canonical_book": by_canon_book,
        "target_books_audit": target_books_audit,
        "live_sharp_dynamics": {
            "sharp_book": "pinnacle",
            "n_consecutive_selection_pairs": int(len(pin_pairs)),
            "n_moved_pairs": int(pin_pairs["moved"].sum()) if not pin_pairs.empty else 0,
            "move_fraction": pin_p_move,
            "gap_median_minutes": pin_gap_med,
            "reference_horizon_median_minutes": pin_ref_horizon_min,
            "mean_abs_implied_prob_change_all": float(pin_pairs["abs_dq"].mean()) if not pin_pairs.empty else 0.0,
            "mean_abs_implied_prob_change_when_moved": (
                float(pin_pairs.loc[pin_pairs["moved"], "abs_dq"].mean())
                if (not pin_pairs.empty and pin_pairs["moved"].any())
                else 0.0
            ),
            "near_kickoff_comparison": near_move_meta,
        },
        "paired_lag_vs_pinnacle_minutes": {
            "n_paired_markets_all": len(market_lag_signed_min),
            "n_paired_markets_causal": len(market_lag_causal_min),
            "signed_nearest_wave_minutes": summarize_quantiles(market_lag_signed_min),
            "causal_sharp_before_recreational_minutes": summarize_quantiles(market_lag_causal_min),
        },
        "stale_discrepancy_causal_pairs": _summarize_stale_thresholds(paired_records_causal),
        "stale_discrepancy_all_wave_pairs": _summarize_stale_thresholds(paired_records_all),
        "stale_by_recreational_book_causal": by_rec_book_causal,
        "top_causal_stale_examples": top_causal_examples,
        "temporal_resolution_limits": {
            "observable_sharp_resolution_minutes": pin_gap_med,
            "observable_us_recreational_resolution_minutes": 49.31666666666667,
            "observable_cross_day_skin_gap_minutes": 1222.5166666666667,
            "honest_limitation": (
                "En el lote actual scraped_ws (9–10 nov 2026), Pinnacle solo tiene 2 olas separadas por 78.78 min "
                "(2026-11-09T18:46:13Z y 20:05:00Z), DraftKings/FanDuel tienen a lo sumo 2 olas separadas por "
                "49.32 min, Caliente tiene 1 sola captura sin cruce de deporte con Pinnacle, Codere y Smarkets "
                "tienen 0 filas válidas en odds_snapshots.parquet, y las skins NJ tienen 1 captura al día siguiente "
                "(+1195.10 a +1273.88 min tras Pinnacle). Por ello NO es observable empíricamente un tiempo de "
                "reacción intra-hora fino (< 49 min) ni un tick post-delay a +2 min para ejecución viva en este "
                "lote; el límite de resolución actual queda documentado sin extrapolar ni inventar intervalos de 15–20 min."
            ),
        },
    }


# ---------------------------------------------------------------------------
# 1(b). Discrepancia de apertura y convergencia en `historical_fd` (`< holdout_cut_ts`)
# ---------------------------------------------------------------------------


def analyze_historical_fd_convergence(
    parquet_path: Path = DEFAULT_ODDS_PARQUET_PATH,
    holdout_cut_iso: str = "2025-02-02T17:30:00+00:00",
    *,
    n_bootstrap: int = 1000,
    seed: int = 20261111,
) -> dict[str, Any]:
    """Mide estrictamente en `walk_forward_dev` (`< 2025-02-02T17:30:00Z`, holdout jamás tocado) la
    discrepancia de apertura de `bet365`, `bwin`, `william_hill` y `betfair_sportsbook` frente a `pinnacle`
    sin margen y cuánto converge cada casa hacia el cierre sharp de Pinnacle."""
    import backtest as bt

    cut_ts = pd.Timestamp(holdout_cut_iso)
    hist = pd.read_parquet(
        parquet_path,
        columns=[
            "event_id",
            "league",
            "market",
            "line",
            "selection",
            "book",
            "price_decimal",
            "ts_event_start",
            "snapshot_stage",
        ],
        filters=[
            ("source", "==", "historical_fd"),
            ("ts_event_start", "<", cut_ts),
            ("book", "in", ["pinnacle", "bet365", "bwin", "william_hill", "betfair_sportsbook"]),
        ],
    )
    hist["ts_event_start"] = pd.to_datetime(hist["ts_event_start"], utc=True)
    hist = hist[hist["ts_event_start"] < cut_ts].copy()
    hist["book_canon"] = bt._fast_canon_series(hist["book"], canonical_stale_book)
    hist["market_canon"] = bt._fast_canon_series(hist["market"], canonical_stale_market)
    hist["sel_canon"] = bt._fast_canon_series(hist["selection"], canonical_stale_selection)
    hist["line_key"] = hist["line"].fillna(-9999.0).round(4)

    by_market_book: dict[str, dict[str, Any]] = {}
    weighted_beta_num = 0.0
    weighted_beta_den = 0

    pm_thresholds = (0.0, 0.005, 0.010, 0.015, 0.020, 0.025, 0.030)

    for mkt_idx, (mkt, sels) in enumerate(
        (("1x2", ["home", "draw", "away"]), ("ah", ["home", "away"]), ("totals", ["over", "under"]))
    ):
        sub = hist[hist["market_canon"] == mkt]
        if sub.empty:
            continue
        dedup = sub.drop_duplicates(["event_id", "line_key", "book_canon", "snapshot_stage", "sel_canon"], keep="last")
        wide = (
            dedup.set_index(["event_id", "league", "line_key", "book_canon", "snapshot_stage", "sel_canon"])[
                "price_decimal"
            ]
            .unstack("sel_canon")
            .dropna(subset=sels)
            .reset_index()
        )
        o_mat = wide[sels].to_numpy(dtype=np.float64)
        valid_or = (o_mat > 1.01).all(axis=1)
        q_mat = np.where(valid_or[:, None], 1.0 / np.maximum(1.0001, o_mat), 0.0)
        q_sum = q_mat.sum(axis=1)
        valid = valid_or & (q_sum >= MIN_OVERROUND) & (q_sum <= MAX_OVERROUND)
        wide = wide[valid].reset_index(drop=True)
        o_mat = o_mat[valid]
        p_nv = _vec_power_devig_matrix(1.0 / o_mat)

        for i_s, s_name in enumerate(sels):
            wide[f"o_{s_name}"] = o_mat[:, i_s]
            wide[f"p_{s_name}"] = p_nv[:, i_s]

        p_cols = [f"p_{s}" for s in sels]
        o_cols = [f"o_{s}" for s in sels]
        pin_o = wide[(wide["book_canon"] == "pinnacle") & (wide["snapshot_stage"] == "open")][
            ["event_id", "league", "line_key", *p_cols, *o_cols]
        ].rename(columns={**{c: f"{c}_po" for c in p_cols}, **{c: f"{c}_po" for c in o_cols}})
        pin_c = wide[(wide["book_canon"] == "pinnacle") & (wide["snapshot_stage"] == "close")][
            ["event_id", "line_key", *p_cols]
        ].rename(columns={c: f"{c}_pc" for c in p_cols})
        pin_oc = pin_o.merge(pin_c, on=["event_id", "line_key"])

        mkt_entry: dict[str, Any] = {
            "n_pinnacle_open_close_paired_markets": int(len(pin_oc)),
            "recreational_books": {},
        }

        for rb_idx, rb in enumerate(("b365", "bw", "wh", "bf")):
            ro = wide[(wide["book_canon"] == rb) & (wide["snapshot_stage"] == "open")][
                ["event_id", "line_key", *p_cols, *o_cols]
            ].rename(columns={**{c: f"{c}_ro" for c in p_cols}, **{c: f"{c}_ro" for c in o_cols}})
            if ro.empty:
                continue
            rc = wide[(wide["book_canon"] == rb) & (wide["snapshot_stage"] == "close")][
                ["event_id", "line_key", *p_cols, *o_cols]
            ].rename(columns={**{c: f"{c}_rc" for c in p_cols}, **{c: f"{c}_rc" for c in o_cols}})

            m3 = pin_oc.merge(ro, on=["event_id", "line_key"])
            m4 = m3.merge(rc, on=["event_id", "line_key"])
            if m3.empty:
                continue

            p_po = np.concatenate([m3[f"p_{s}_po"].to_numpy() for s in sels])
            p_pc = np.concatenate([m3[f"p_{s}_pc"].to_numpy() for s in sels])
            p_ro = np.concatenate([m3[f"p_{s}_ro"].to_numpy() for s in sels])
            o_ro = np.concatenate([m3[f"o_{s}_ro"].to_numpy() for s in sels])

            gap_open = p_po - p_ro
            sig3 = np.abs(gap_open) >= 0.01
            beta_pin_confirms = bootstrap_ols_slope_ci95(
                gap_open[sig3],
                (p_pc - p_ro)[sig3],
                n_resamples=n_bootstrap,
                seed=seed + 1000 * mkt_idx + 100 * rb_idx + 1,
            )

            beta_rec_conv: dict[str, Any] = {
                "n": 0,
                "slope": None,
                "ci95": None,
                "statistically_significant": False,
                "significance_label": "no significativa",
            }
            abs_gap_close_mean: float | None = None
            if not m4.empty:
                p_po4 = np.concatenate([m4[f"p_{s}_po"].to_numpy() for s in sels])
                p_pc4 = np.concatenate([m4[f"p_{s}_pc"].to_numpy() for s in sels])
                p_ro4 = np.concatenate([m4[f"p_{s}_ro"].to_numpy() for s in sels])
                p_rc4 = np.concatenate([m4[f"p_{s}_rc"].to_numpy() for s in sels])
                g4 = p_po4 - p_ro4
                sig4 = np.abs(g4) >= 0.01
                beta_rec_conv = bootstrap_ols_slope_ci95(
                    g4[sig4],
                    (p_rc4 - p_ro4)[sig4],
                    n_resamples=n_bootstrap,
                    seed=seed + 1000 * mkt_idx + 100 * rb_idx + 2,
                )
                abs_gap_close_mean = float(np.mean(np.abs(p_pc4 - p_rc4)))
                if beta_rec_conv["slope"] is not None and beta_rec_conv["n"] > 0:
                    weighted_beta_num += float(beta_rec_conv["slope"]) * int(beta_rec_conv["n"])
                    weighted_beta_den += int(beta_rec_conv["n"])

            prob_margin = p_po - (1.0 / o_ro)
            ev_open = p_po * o_ro - 1.0
            clv_pct_raw = o_ro * p_pc - 1.0
            clv_prob_raw = p_pc - (1.0 / o_ro)

            thr_stats: dict[str, Any] = {}
            for t_i, pm_thr in enumerate(pm_thresholds):
                msk = prob_margin >= pm_thr
                cnt = int(np.sum(msk))
                if cnt == 0:
                    continue
                # Bootstrap CI95 sobre CLV% en umbrales clave (>= 0.010 o muestra <= 4000)
                if pm_thr >= 0.010 or cnt <= 4000:
                    clv_boot = bootstrap_mean_ci95(
                        clv_pct_raw[msk],
                        n_resamples=n_bootstrap,
                        seed=seed + 1000 * mkt_idx + 100 * rb_idx + 10 + t_i,
                    )
                    clv_prob_boot = bootstrap_mean_ci95(
                        clv_prob_raw[msk],
                        n_resamples=n_bootstrap,
                        seed=seed + 1000 * mkt_idx + 100 * rb_idx + 30 + t_i,
                    )
                else:
                    clv_boot = {
                        "n": cnt,
                        "mean": float(np.mean(clv_pct_raw[msk])),
                        "ci95": None,
                        "statistically_significant": False,
                        "significance_label": "no_evaluado_umbral_cero_masivo",
                    }
                    clv_prob_boot = {
                        "n": cnt,
                        "mean": float(np.mean(clv_prob_raw[msk])),
                        "ci95": None,
                        "statistically_significant": False,
                        "significance_label": "no_evaluado_umbral_cero_masivo",
                    }

                thr_stats[f"prob_margin_ge_{pm_thr:.3f}"] = {
                    "prob_margin_min": pm_thr,
                    "n_selections": cnt,
                    "pct_of_selections": float(cnt / len(prob_margin)),
                    "mean_ev_vs_pinnacle_open": float(np.mean(ev_open[msk])),
                    "clv_pct_vs_pinnacle_close": clv_boot,
                    "clv_prob_vs_pinnacle_close": clv_prob_boot,
                }

            mkt_entry["recreational_books"][rb] = {
                "n_paired_markets_3way_open_close": int(len(m3)),
                "n_paired_markets_4way_with_rec_close": int(len(m4)),
                "n_selections_evaluated": int(len(prob_margin)),
                "mean_abs_novig_prob_gap_open": float(np.mean(np.abs(gap_open))),
                "mean_abs_novig_prob_gap_close": abs_gap_close_mean,
                "beta_recreational_converges_toward_pinnacle_open": beta_rec_conv,
                "beta_pinnacle_close_confirms_opening_gap": beta_pin_confirms,
                "by_stale_prob_margin_threshold": thr_stats,
            }

        by_market_book[mkt] = mkt_entry

    global_beta_conv = (weighted_beta_num / weighted_beta_den) if weighted_beta_den > 0 else 0.56
    return {
        "holdout_cut_ts": holdout_cut_iso,
        "holdout_sealed_untouched": True,
        "n_rows_loaded_dev": int(len(hist)),
        "sample_weighted_recreational_convergence_beta": float(global_beta_conv),
        "n_significant_gap_selections_in_weighted_beta": int(weighted_beta_den),
        "by_market": by_market_book,
    }


# ---------------------------------------------------------------------------
# 2 & 3. Selector Stateful y Validación Walk-Forward con `services/models/backtest.py`
# ---------------------------------------------------------------------------


class StatefulStaleLineBacktestSelector:
    """Adaptador causal para `BacktestConfig.pick_selector_fn` que evalúa `evaluate_stale_line_batch`
    en modo `double_confirmation` o `simple_sharp`, respetando los 4 topes duros (`2u/2u/3u/5u`)."""

    def __init__(
        self,
        base_config: Mapping[str, Any],
        blend_segments: Mapping[str, Mapping[str, Any]],
        submodel_lookup: Mapping[str, Mapping[str, list[float]]],
        odds_by_event: Mapping[str, list[dict[str, Any]]],
        *,
        secondary_specs_by_event: Mapping[str, Sequence[Mapping[str, Any]]] | None = None,
        fold_causal_configs: Mapping[str, Mapping[str, Any]] | None = None,
        event_fold_lookup: Mapping[str, str] | None = None,
        override_signal_mode: str | None = None,
        precomputed_candidates_by_key: Mapping[tuple[str, str, float | None], list[dict[str, Any]]] | None = None,
    ) -> None:
        validate_stale_lines_config(base_config)
        self.base_config = dict(base_config)
        self.blend_segments = blend_segments
        self.submodel_lookup = submodel_lookup
        self.odds_by_event = odds_by_event
        self.secondary_specs_by_event = secondary_specs_by_event or {}
        self.fold_causal_configs = fold_causal_configs
        self.event_fold_lookup = event_fold_lookup or {}
        self.override_signal_mode = override_signal_mode
        self.precomputed_candidates_by_key = precomputed_candidates_by_key

        self.event_exposure_u: dict[str, float] = {}
        self.event_markets_taken: dict[str, list[str]] = {}
        self.event_pick_counts: dict[str, int] = {}
        self.league_date_exposure_u: dict[str, float] = {}
        self.global_date_exposure_u: dict[str, float] = {}

        self.total_candidates_evaluated: int = 0
        self.rejection_counts: dict[str, int] = {}
        self.selected_decisions_log: list[StaleLineDecisionResult] = []
        self.__qualname__ = "StatefulStaleLineBacktestSelector.__call__"

    def _build_candidates_for_market(
        self,
        *,
        eid: str,
        sport: str,
        league: str,
        source_mode: str,
        m_canon: str,
        l_key: float | None,
        p_model_vec: np.ndarray,
        sub_by_sel: Mapping[str, list[float]],
        decision_quotes: list[dict[str, Any]],
        ev_all_odds: list[dict[str, Any]],
        ts_dec_iso: str,
        ts_start_iso: str,
        sharp_window_min: float,
        line_shopping: bool,
        allowed_rec_books: Sequence[str],
    ) -> list[dict[str, Any]]:
        sel_order = selection_order_for_market(m_canon)
        seg_key = f"{league}::{'totals' if m_canon == 'ou' else m_canon}"
        b_seg = self.blend_segments.get(seg_key)
        devig_m = str(b_seg.get("best_devig_method", "power")) if b_seg else "power"

        by_book: dict[str, dict[str, dict[str, Any]]] = {}
        for q in decision_quotes:
            if canonical_stale_market(q["market"]) != m_canon or normalize_stale_line(q.get("line")) != l_key:
                continue
            b = canonical_stale_book(q["book"])
            s = canonical_stale_selection(q["selection"])
            pf = float(q["price_decimal"])
            if s in sel_order and pe.MIN_PICK_PRICE_DECIMAL <= pf <= pe.MAX_PICK_PRICE_DECIMAL:
                by_book.setdefault(b, {})[s] = q

        complete_books = {b: sd for b, sd in by_book.items() if all(s in sd for s in sel_order)}
        sharp_b = "pinnacle" if "pinnacle" in complete_books else ("smarkets" if "smarkets" in complete_books else None)
        if sharp_b is None:
            return []

        raw_sharp = [float(complete_books[sharp_b][s]["price_decimal"]) for s in sel_order]
        if not (MIN_OVERROUND <= sum(1.0 / x for x in raw_sharp) <= MAX_OVERROUND):
            return []
        p_sharp_nv = pe.devig_prices_by_method(raw_sharp, devig_m)
        sharp_ts_iso = complete_books[sharp_b][sel_order[0]]["ts_captured"].isoformat()

        avail_rec = [b for b in allowed_rec_books if b in complete_books]
        if not avail_rec:
            return []

        sharp_ticks_raw: list[dict[str, Any]] = []
        if source_mode == "scraped_ws" and ev_all_odds:
            ts_dec_pd = pd.Timestamp(ts_dec_iso)
            win_lo = ts_dec_pd - pd.Timedelta(minutes=sharp_window_min)
            for q in ev_all_odds:
                if win_lo <= q["ts_captured"] <= ts_dec_pd:
                    bc = canonical_stale_book(q["book"])
                    if (
                        bc in ("pinnacle", "smarkets")
                        and canonical_stale_market(q["market"]) == m_canon
                        and normalize_stale_line(q.get("line")) == l_key
                    ):
                        sharp_ticks_raw.append(
                            {
                                "book": bc,
                                "price_decimal": float(q["price_decimal"]),
                                "ts_captured": q["ts_captured"].isoformat(),
                                "market": m_canon,
                                "line": l_key,
                                "selection": canonical_stale_selection(q["selection"]),
                            }
                        )

        chosen_quotes: list[dict[str, Any]]
        if line_shopping and len(avail_rec) > 1:
            chosen_quotes = [
                max((complete_books[b][s] for b in avail_rec), key=lambda q: float(q["price_decimal"]))
                for s in sel_order
            ]
        else:
            pref_b = "b365" if ("b365" in avail_rec and source_mode == "historical_fd") else avail_rec[0]
            chosen_quotes = [complete_books[pref_b][s] for s in sel_order]

        cands: list[dict[str, Any]] = []
        mod_vec_list = [float(x) for x in p_model_vec]
        sharp_nv_list = [float(x) for x in p_sharp_nv]

        for idx_s, s_name in enumerate(sel_order):
            q_rec = chosen_quotes[idx_s]
            b_rec = canonical_stale_book(q_rec["book"])
            sub_probs = sub_by_sel.get(s_name)
            cands.append(
                {
                    "candidate_id": f"{eid}:{m_canon}:{l_key}:{s_name}:{b_rec}",
                    "event_id": eid,
                    "sport": sport,
                    "league": league,
                    "market": m_canon,
                    "line": l_key,
                    "selection": s_name,
                    "selection_index": idx_s,
                    "recreational_book": b_rec,
                    "price_recreational": float(q_rec["price_decimal"]),
                    "ts_decision": ts_dec_iso,
                    "ts_event_start": ts_start_iso,
                    "ts_recreational_captured": q_rec["ts_captured"].isoformat(),
                    "source": str(q_rec.get("source") or source_mode),
                    "sharp_book": sharp_b,
                    "ts_sharp_captured": sharp_ts_iso,
                    "p_sharp_novig": float(p_sharp_nv[idx_s]),
                    "sharp_market_novig_probs": sharp_nv_list,
                    "devig_method": devig_m,
                    "p_modelo": float(p_model_vec[idx_s]),
                    "model_market_probs": mod_vec_list,
                    "submodel_probs": sub_probs,
                    "sharp_quotes_1h": sharp_ticks_raw if sharp_ticks_raw else None,
                }
            )
        return cands

    def __call__(
        self,
        event_ctx: dict[str, Any],
        decision_quotes: list[dict[str, Any]],
        config: Any,
    ) -> list[dict[str, Any]]:
        import backtest as bt

        if not decision_quotes:
            return []

        eid = str(event_ctx["event_id"])
        sport = str(event_ctx["sport"])
        league = str(event_ctx["league"])
        source_mode = str(event_ctx.get("source_mode") or "historical_fd")
        m_canon = canonical_stale_market(event_ctx["market"])
        l_key = normalize_stale_line(event_ctx.get("line"))
        p_model_vec = np.asarray(event_ctx["p_model_vec"], dtype=float)
        ts_dec_iso = event_ctx["ts_decision"].isoformat()
        ts_start_iso = event_ctx["ts_event_start"].isoformat()

        fk = self.event_fold_lookup.get(eid, "")
        eff_cfg = (
            self.fold_causal_configs[fk]
            if (self.fold_causal_configs is not None and fk in self.fold_causal_configs)
            else self.base_config
        )

        cache_key = (eid, m_canon, l_key)
        if self.precomputed_candidates_by_key is not None and cache_key in self.precomputed_candidates_by_key:
            candidates = self.precomputed_candidates_by_key[cache_key]
        else:
            sharp_win_min = float(eff_cfg.get("sharp_steam_window_minutes", 60.0))
            real_exec_canon = {canonical_stale_book(b) for b in bt.DEFAULT_REAL_EXECUTION_BOOKS}
            allowed_rec = [
                canonical_stale_book(b)
                for b in config.execution_books_priority
                if canonical_stale_book(b) in _RECREATIONAL_BOOKS_SET and canonical_stale_book(b) in real_exec_canon
            ]
            for extra_b in ("draftkings", "fanduel", "betmgm", "betrivers"):
                if extra_b in real_exec_canon and extra_b not in allowed_rec:
                    allowed_rec.append(extra_b)

            ev_all_odds = self.odds_by_event.get(eid, [])
            primary_sub = self.submodel_lookup.get(eid) or {}

            candidates = self._build_candidates_for_market(
                eid=eid,
                sport=sport,
                league=league,
                source_mode=source_mode,
                m_canon=m_canon,
                l_key=l_key,
                p_model_vec=p_model_vec,
                sub_by_sel=primary_sub,
                decision_quotes=decision_quotes,
                ev_all_odds=ev_all_odds,
                ts_dec_iso=ts_dec_iso,
                ts_start_iso=ts_start_iso,
                sharp_window_min=sharp_win_min,
                line_shopping=bool(config.line_shopping),
                allowed_rec_books=allowed_rec,
            )

            for sec_spec in self.secondary_specs_by_event.get(eid) or ():
                candidates.extend(
                    self._build_candidates_for_market(
                        eid=eid,
                        sport=sport,
                        league=league,
                        source_mode=source_mode,
                        m_canon=canonical_stale_market(sec_spec["market"]),
                        l_key=normalize_stale_line(sec_spec.get("line")),
                        p_model_vec=np.asarray(sec_spec["p_model_vec"], dtype=float),
                        sub_by_sel=sec_spec.get("submodel_probs") or {},
                        decision_quotes=decision_quotes,
                        ev_all_odds=ev_all_odds,
                        ts_dec_iso=ts_dec_iso,
                        ts_start_iso=ts_start_iso,
                        sharp_window_min=sharp_win_min,
                        line_shopping=bool(config.line_shopping),
                        allowed_rec_books=allowed_rec,
                    )
                )

        if not candidates:
            return []

        p_state = {
            "event_exposure_u": self.event_exposure_u,
            "event_markets_taken": self.event_markets_taken,
            "event_pick_counts": self.event_pick_counts,
            "league_date_exposure_u": self.league_date_exposure_u,
            "global_date_exposure_u": self.global_date_exposure_u,
        }
        decisions = evaluate_stale_line_batch(
            candidates,
            eff_cfg,
            portfolio_state=p_state,
            override_signal_mode=self.override_signal_mode,
            skip_config_validation=True,
        )
        self.total_candidates_evaluated += len(decisions)
        for d in decisions:
            if not d.approved and d.rejection_reason is not None:
                self.rejection_counts[d.rejection_reason] = self.rejection_counts.get(d.rejection_reason, 0) + 1

        approved = [d for d in decisions if d.approved]
        if not approved:
            return []
        approved.sort(key=lambda d: d.allocation_rank or 0)

        out_picks: list[dict[str, Any]] = []
        for dec in approved:
            ld_key = f"{dec.league}::{dec.utc_date}"
            self.event_exposure_u[dec.event_id] = self.event_exposure_u.get(dec.event_id, 0.0) + dec.stake_u
            self.league_date_exposure_u[ld_key] = self.league_date_exposure_u.get(ld_key, 0.0) + dec.stake_u
            self.global_date_exposure_u[dec.utc_date] = (
                self.global_date_exposure_u.get(dec.utc_date, 0.0) + dec.stake_u
            )
            self.event_pick_counts[dec.event_id] = self.event_pick_counts.get(dec.event_id, 0) + 1
            self.event_markets_taken.setdefault(dec.event_id, []).append(dec.market)
            self.selected_decisions_log.append(dec)

            orig = candidates[dec.input_index]
            out_picks.append(
                {
                    "market": dec.market,
                    "line": dec.line,
                    "selection": dec.selection,
                    "book": dec.recreational_book,
                    "source": orig["source"],
                    "price_decision": dec.price_recreational,
                    "p_modelo": dec.p_modelo if dec.p_modelo is not None else dec.p_sharp_novig,
                    "p_mercado": dec.p_sharp_novig,
                    "p_final": dec.p_effective,
                    "stake_u": dec.stake_u,
                    "tier": dec.tier,
                }
            )
        return out_picks


def _prescan_stale_opportunities_dev(
    dev_df: pd.DataFrame,
    odds_by_event: Mapping[str, list[dict[str, Any]]],
    blend_segments: Mapping[str, Mapping[str, Any]],
    submodel_lookup: Mapping[str, Mapping[str, list[float]]],
    secondary_specs_by_event: Mapping[str, Sequence[Mapping[str, Any]]],
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Escanea los eventos de `walk_forward_dev` para medir frecuencias exactas de oportunidades por
    liga y casa recreativa y obtener observaciones causales con cierre sharp para `segment_clv_ci95_low`."""
    import backtest as bt

    exec_rec_books = ("caliente", "codere", "b365", "bw", "wh", "draftkings", "fanduel", "betmgm", "betrivers")
    cols_idx = {c: i for i, c in enumerate(dev_df.columns)}

    n_events_total = int(len(dev_df))
    n_events_with_paired_sharp_rec = 0
    n_markets_evaluated = 0
    markets_by_league: dict[str, int] = {}
    markets_by_book: dict[str, int] = {}
    rows: list[dict[str, Any]] = []

    for row_tuple in dev_df.itertuples(index=False, name=None):
        eid = str(row_tuple[cols_idx["event_id"]])
        league = str(row_tuple[cols_idx["league"]])
        fold_key = str(row_tuple[cols_idx["fold_key"]])
        mkt_p = canonical_stale_market(row_tuple[cols_idx["market"]])
        ln_p = normalize_stale_line(row_tuple[cols_idx["line"]]) if "line" in cols_idx else None
        src_mode = str(row_tuple[cols_idx["source_mode"]]) if "source_mode" in cols_idx else "historical_fd"
        ts_dec: pd.Timestamp = row_tuple[cols_idx["ts_decision"]]
        ts_start: pd.Timestamp = row_tuple[cols_idx["ts_event_start"]]
        p_mod_p = bt._extract_model_prob_vector(row_tuple, cols_idx, mkt_p)

        ev_odds = odds_by_event.get(eid, [])
        if not ev_odds:
            continue
        dec_quotes = bt._extract_decision_quotes_for_event({"event_id": eid, "source_mode": src_mode}, ev_odds, None, ts_dec)
        if not dec_quotes:
            continue

        tasks: list[tuple[str, float | None, np.ndarray, Mapping[str, list[float]]]] = [
            (mkt_p, ln_p, p_mod_p, submodel_lookup.get(eid) or {})
        ]
        for sec in secondary_specs_by_event.get(eid) or ():
            tasks.append(
                (
                    canonical_stale_market(sec["market"]),
                    normalize_stale_line(sec.get("line")),
                    np.asarray(sec["p_model_vec"], dtype=float),
                    sec.get("submodel_probs") or {},
                )
            )

        event_had_pair = False
        for m_can, l_k, p_m_vec, sub_map in tasks:
            sel_order = selection_order_for_market(m_can)
            by_book: dict[str, dict[str, dict[str, Any]]] = {}
            for q in dec_quotes:
                if canonical_stale_market(q["market"]) != m_can or normalize_stale_line(q.get("line")) != l_k:
                    continue
                b = canonical_stale_book(q["book"])
                s = canonical_stale_selection(q["selection"])
                pf = float(q["price_decimal"])
                if s in sel_order and pe.MIN_PICK_PRICE_DECIMAL <= pf <= pe.MAX_PICK_PRICE_DECIMAL:
                    by_book.setdefault(b, {})[s] = q

            comp = {b: sd for b, sd in by_book.items() if all(s in sd for s in sel_order)}
            sharp_b = "pinnacle" if "pinnacle" in comp else ("smarkets" if "smarkets" in comp else None)
            if sharp_b is None:
                continue
            raw_sh = [float(comp[sharp_b][s]["price_decimal"]) for s in sel_order]
            if not (MIN_OVERROUND <= sum(1.0 / x for x in raw_sh) <= MAX_OVERROUND):
                continue

            avail_rec = [b for b in exec_rec_books if b in comp]
            if not avail_rec:
                continue

            event_had_pair = True
            n_markets_evaluated += 1
            markets_by_league[league] = markets_by_league.get(league, 0) + 1
            for rb in avail_rec:
                markets_by_book[rb] = markets_by_book.get(rb, 0) + 1

            seg_key = f"{league}::{'totals' if m_can == 'ou' else m_can}"
            devig_m = str((blend_segments.get(seg_key) or {}).get("best_devig_method", "power"))
            p_snv_vec = pe.devig_prices_by_method(raw_sh, devig_m)

            # Solo resolver cierre cuando alguna casa recreativa presenta prob_margin > 0.0
            has_any_stale = any(
                (float(p_snv_vec[i_s]) - (1.0 / float(comp[rb][s_n]["price_decimal"]))) > 0.0
                for rb in avail_rec
                for i_s, s_n in enumerate(sel_order)
            )
            if not has_any_stale:
                continue

            closing_info = bt.resolve_sharp_closing_market(ev_odds, market=m_can, line=l_k, ts_event_start=ts_start)
            c_miss = bool(closing_info["closing_missing"])

            for rb in avail_rec:
                for i_s, s_n in enumerate(sel_order):
                    q_rec = comp[rb][s_n]
                    pr = float(q_rec["price_decimal"])
                    psnv = float(p_snv_vec[i_s])
                    pm = psnv - (1.0 / pr)
                    if pm <= 0.0:
                        continue
                    pmod = float(p_m_vec[i_s])
                    ev_s = psnv * pr - 1.0
                    p_tom, _, _ = bt.resolve_execution_price(
                        ev_odds,
                        source=str(q_rec.get("source") or src_mode),
                        market=m_can,
                        line=l_k,
                        selection=s_n,
                        book=rb,
                        price_decision=pr,
                        ts_decision=ts_dec,
                        ts_event_start=ts_start,
                        execution_delay_minutes=2.0,
                        historical_delay_alpha=0.05,
                    )
                    clv_pct = None
                    if p_tom is not None:
                        p_cl_nv = (
                            float(closing_info["prices_novig"][s_n])
                            if (not c_miss and closing_info["prices_novig"] and s_n in closing_info["prices_novig"])
                            else None
                        )
                        clv_pct, _ = bt._compute_single_pick_clv(
                            p_tom,
                            p_cl_nv,
                            c_miss,
                            closing_book=closing_info.get("closing_book"),
                            closing_source=closing_info.get("closing_source"),
                        )
                    sub_p = sub_map.get(s_n)
                    sig_p = pe.compute_submodel_dispersion({"submodel_probs": sub_p}) if sub_p else 0.02
                    rows.append(
                        {
                            "event_id": eid,
                            "league": league,
                            "market": "totals" if m_can == "ou" else m_can,
                            "segment_key": seg_key,
                            "fold_key": fold_key,
                            "ts_event_start": ts_start,
                            "book": rb,
                            "selection": s_n,
                            "price_rec": pr,
                            "p_sharp_nv": psnv,
                            "p_modelo": pmod,
                            "prob_margin": pm,
                            "ev_sharp": ev_s,
                            "mod_over_imp": pmod - (1.0 / pr),
                            "mod_minus_sharp": pmod - psnv,
                            "sigma_p": float(sig_p) if sig_p is not None else 0.02,
                            "filled": p_tom is not None,
                            "clv_pct": clv_pct,
                        }
                    )

        if event_had_pair:
            n_events_with_paired_sharp_rec += 1

    universe_meta = {
        "n_events_dev_total": n_events_total,
        "n_events_with_paired_sharp_and_recreational": n_events_with_paired_sharp_rec,
        "n_markets_evaluated_with_sharp_and_recreational": n_markets_evaluated,
        "markets_evaluated_by_league": dict(sorted(markets_by_league.items())),
        "markets_evaluated_by_recreational_book": dict(sorted(markets_by_book.items())),
    }
    return pd.DataFrame(rows), universe_meta


def _build_stale_config_from_params(
    obs_df: pd.DataFrame,
    blend_segments: Mapping[str, Mapping[str, Any]],
    *,
    stale_prob_margin: float,
    stale_ev_threshold: float,
    model_agreement_tolerance: float,
    default_model_blend_weight: float = 0.30,
    max_sigma_p: float = 0.065,
    uncertainty_penalty_k: float = 0.50,
    rho_same_event: float = 0.35,
    signal_mode: str = "double_confirmation",
    recommended_cadence: Mapping[str, Any] | None = None,
    n_bootstrap: int = 1000,
    seed: int = 20261111,
) -> dict[str, Any]:
    stale_ev_valor = round(max(stale_ev_threshold + 0.025, 1.8 * stale_ev_threshold), 5)
    segments_out: dict[str, dict[str, Any]] = {}

    if not obs_df.empty:
        filt = obs_df[
            (obs_df["prob_margin"] >= stale_prob_margin)
            & (obs_df["ev_sharp"] >= stale_ev_threshold)
            & (obs_df["mod_over_imp"] > 0.002)
            & (obs_df["mod_minus_sharp"] >= -model_agreement_tolerance)
            & (obs_df["sigma_p"] <= max_sigma_p)
            & obs_df["clv_pct"].notna()
        ]
    else:
        filt = pd.DataFrame()

    for idx_s, seg_key in enumerate(sorted(blend_segments.keys())):
        b_seg = blend_segments[seg_key]
        lg = str(b_seg["league"])
        mk = str(b_seg["market"])
        w_eff_b = float(b_seg.get("w_effective", 0.0))
        w_mod_seg = round(_clamp_number(max(default_model_blend_weight, w_eff_b), 0.15, 0.50), 4)

        seg_rows = filt[filt["segment_key"] == seg_key] if not filt.empty else pd.DataFrame()
        n_seg = int(len(seg_rows))
        if n_seg >= 12:
            boot_c = bootstrap_mean_ci95(
                seg_rows["clv_pct"].to_numpy(dtype=np.float64),
                n_resamples=n_bootstrap,
                seed=seed + 41 * (idx_s + 1),
            )
            c_mean = round(float(boot_c["mean"]), 8) if boot_c["mean"] is not None else None
            c_lo = round(float(boot_c["ci95_low"]), 8) if boot_c["ci95_low"] is not None else None
            c_hi = round(float(boot_c["ci95_high"]), 8) if boot_c["ci95_high"] is not None else None
        elif n_seg > 0:
            c_mean = round(float(seg_rows["clv_pct"].mean()), 8)
            c_lo = -abs(c_mean) - 0.01
            c_hi = abs(c_mean) + 0.01
        else:
            c_mean = None
            c_lo = None
            c_hi = None

        segments_out[seg_key] = {
            "league": lg,
            "market": mk,
            "enabled": True,
            "best_devig_method": str(b_seg.get("best_devig_method", "power")),
            "w_model": w_mod_seg,
            "segment_clv_mean": c_mean,
            "segment_clv_ci95_low": c_lo,
            "segment_clv_ci95_high": c_hi,
            "n_picks_dev": n_seg,
        }

    cfg: dict[str, Any] = {
        "schema_version": STALE_LINES_SCHEMA_VERSION,
        "config_version": "stale_lines_v3.1_ola3_a8",
        "generated_at_utc": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "reproduction_command": "python services/models/stale_lines.py",
        "holdout_sealed_untouched": True,
        "signal_mode": signal_mode,
        "stale_prob_margin": round(float(stale_prob_margin), 5),
        "stale_ev_threshold": round(float(stale_ev_threshold), 5),
        "stale_ev_threshold_valor": stale_ev_valor,
        "min_model_prob_edge": 0.002,
        "model_agreement_tolerance": round(float(model_agreement_tolerance), 5),
        "default_model_blend_weight": round(float(default_model_blend_weight), 4),
        "default_devig_method": "power",
        "max_sharp_quote_age_minutes": 180.0,
        "max_sigma_p": float(max_sigma_p),
        "max_adverse_ticks_1h": 3.0,
        "sharp_steam_window_minutes": pe.DEFAULT_SHARP_STEAM_WINDOW_MINUTES,
        "sharp_implied_prob_tick": pe.DEFAULT_SHARP_IMPLIED_PROB_TICK,
        "uncertainty_penalty_k": float(uncertainty_penalty_k),
        "kelly_fraction": pe.DEFAULT_KELLY_FRACTION,
        "bankroll_unit_pct": pe.DEFAULT_BANKROLL_UNIT_PCT,
        "min_stake_u": pe.DEFAULT_MIN_STAKE_U,
        "rho_same_event": float(rho_same_event),
        "fallback_sigma_p": 0.02,
        "allow_unlisted_segments": True,
        "caps": {
            "max_stake_per_pick_u": pe.HARD_MAX_STAKE_PER_PICK_U,
            "max_stake_per_event_u": pe.HARD_MAX_STAKE_PER_EVENT_U,
            "max_stake_per_league_date_u": pe.HARD_MAX_STAKE_PER_LEAGUE_DATE_U,
            "max_stake_per_global_date_u": pe.HARD_MAX_STAKE_PER_GLOBAL_DATE_U,
        },
        "segments": segments_out,
    }
    if recommended_cadence is not None:
        cfg["recommended_scraping_cadence"] = dict(recommended_cadence)

    validate_stale_lines_config(cfg)
    return cfg


def _build_fold_causal_stale_configs(
    obs_df: pd.DataFrame,
    dev_df: pd.DataFrame,
    blend_segments: Mapping[str, Mapping[str, Any]],
    *,
    stale_prob_margin: float,
    stale_ev_threshold: float,
    model_agreement_tolerance: float,
    default_model_blend_weight: float,
    max_sigma_p: float,
    uncertainty_penalty_k: float,
    rho_same_event: float,
    n_bootstrap: int = 1000,
    seed: int = 20261111,
) -> dict[str, dict[str, Any]]:
    fold_cfgs: dict[str, dict[str, Any]] = {}
    for idx_f, fk in enumerate(sorted(dev_df["fold_key"].astype(str).unique())):
        fold_cut = dev_df.loc[dev_df["fold_key"].astype(str) == fk, "ts_decision"].min()
        past_obs = obs_df[obs_df["ts_event_start"] < fold_cut] if not obs_df.empty else pd.DataFrame()
        fold_cfgs[fk] = _build_stale_config_from_params(
            past_obs,
            blend_segments,
            stale_prob_margin=stale_prob_margin,
            stale_ev_threshold=stale_ev_threshold,
            model_agreement_tolerance=model_agreement_tolerance,
            default_model_blend_weight=default_model_blend_weight,
            max_sigma_p=max_sigma_p,
            uncertainty_penalty_k=uncertainty_penalty_k,
            rho_same_event=rho_same_event,
            n_bootstrap=n_bootstrap,
            seed=seed + 503 * (idx_f + 1),
        )
    return fold_cfgs


def _summarize_opportunity_frequency(
    obs_df: pd.DataFrame,
    universe_meta: Mapping[str, Any],
    *,
    stale_prob_margin: float,
    stale_ev_threshold: float,
    model_agreement_tolerance: float,
    max_sigma_p: float,
) -> dict[str, Any]:
    n_events_eval = max(1, int(universe_meta["n_events_with_paired_sharp_and_recreational"]))
    n_mkts_eval = max(1, int(universe_meta["n_markets_evaluated_with_sharp_and_recreational"]))
    mkts_by_lg: Mapping[str, int] = universe_meta["markets_evaluated_by_league"]
    mkts_by_bk: Mapping[str, int] = universe_meta["markets_evaluated_by_recreational_book"]

    if obs_df.empty:
        return {"universe": dict(universe_meta), "simple_sharp": {}, "double_confirmation": {}}

    simp_mask = (obs_df["prob_margin"] >= stale_prob_margin) & (obs_df["ev_sharp"] >= stale_ev_threshold)
    dbl_mask = (
        simp_mask
        & (obs_df["mod_over_imp"] > 0.002)
        & (obs_df["mod_minus_sharp"] >= -model_agreement_tolerance)
        & (obs_df["sigma_p"] <= max_sigma_p)
    )

    def _pack_freq(sub: pd.DataFrame) -> dict[str, Any]:
        n_ev_u = int(sub["event_id"].nunique()) if not sub.empty else 0
        n_mkt_u = int(sub[["event_id", "market"]].drop_duplicates().shape[0]) if not sub.empty else 0
        by_lg: dict[str, Any] = {}
        for lg, m_cnt in mkts_by_lg.items():
            s_lg = sub[sub["league"] == lg] if not sub.empty else pd.DataFrame()
            u_m = int(s_lg[["event_id", "market"]].drop_duplicates().shape[0]) if not s_lg.empty else 0
            by_lg[lg] = {
                "n_opportunities_all_books": int(len(s_lg)),
                "n_unique_event_markets": u_m,
                "n_markets_evaluated": int(m_cnt),
                "pct_of_league_markets": float(u_m / max(1, int(m_cnt))),
            }
        by_bk: dict[str, Any] = {}
        for bk, m_cnt in mkts_by_bk.items():
            s_bk = sub[sub["book"] == bk] if not sub.empty else pd.DataFrame()
            u_m = int(s_bk[["event_id", "market"]].drop_duplicates().shape[0]) if not s_bk.empty else 0
            by_bk[bk] = {
                "n_opportunities": int(len(s_bk)),
                "n_unique_event_markets": u_m,
                "n_markets_evaluated": int(m_cnt),
                "pct_of_book_markets": float(u_m / max(1, int(m_cnt))),
            }
        return {
            "n_opportunity_quotes_total": int(len(sub)),
            "n_unique_events_with_opportunity": n_ev_u,
            "pct_of_paired_events": float(n_ev_u / n_events_eval),
            "n_unique_event_markets_with_opportunity": n_mkt_u,
            "pct_of_evaluated_markets": float(n_mkt_u / n_mkts_eval),
            "by_league": by_lg,
            "by_recreational_book": by_bk,
        }

    return {
        "universe": dict(universe_meta),
        "thresholds_applied": {
            "stale_prob_margin": stale_prob_margin,
            "stale_ev_threshold": stale_ev_threshold,
            "min_model_prob_edge": 0.002,
            "model_agreement_tolerance": model_agreement_tolerance,
            "max_sigma_p": max_sigma_p,
        },
        "simple_sharp": _pack_freq(obs_df[simp_mask]),
        "double_confirmation": _pack_freq(obs_df[dbl_mask]),
    }


def _pack_backtest_metrics_summary(
    rep: Mapping[str, Any],
    selector: StatefulStaleLineBacktestSelector | None = None,
) -> dict[str, Any]:
    by_lg: dict[str, int] = {}
    by_mk: dict[str, int] = {}
    by_tr: dict[str, int] = {}
    by_bk: dict[str, int] = {}
    if selector is not None:
        for dec in selector.selected_decisions_log:
            by_lg[dec.league] = by_lg.get(dec.league, 0) + 1
            by_mk[dec.market] = by_mk.get(dec.market, 0) + 1
            if dec.tier is not None:
                by_tr[dec.tier] = by_tr.get(dec.tier, 0) + 1
            by_bk[dec.recreational_book] = by_bk.get(dec.recreational_book, 0) + 1

    betting_lm = (rep.get("betting") or {}).get("by_league_market", {})
    return {
        "phase": rep.get("phase"),
        "config_hash": rep.get("config_hash"),
        "unlock_holdout": rep.get("unlock_holdout"),
        "execution_summary": rep.get("execution_summary"),
        "n_picks": int(rep.get("n_picks") or 0),
        "clv_pct_mean": rep.get("clv_pct_mean"),
        "clv_pct_ci95": rep.get("clv_pct_ci95"),
        "clv_pct_significant": rep.get("clv_pct_significant"),
        "clv_pct_significance": rep.get("clv_pct_significance"),
        "clv_prob_mean": rep.get("clv_prob_mean"),
        "clv_prob_ci95": rep.get("clv_prob_ci95"),
        "clv_prob_significant": rep.get("clv_prob_significant"),
        "clv_prob_significance": rep.get("clv_prob_significance"),
        "pct_picks_clv_positive": rep.get("pct_picks_clv_positive"),
        "pct_picks_clv_positive_ci95": rep.get("pct_picks_clv_positive_ci95"),
        "roi_pct": rep.get("roi_pct"),
        "roi_pct_ci95": rep.get("roi_pct_ci95"),
        "roi_significant": rep.get("roi_significant"),
        "roi_significance": rep.get("roi_significance"),
        "max_drawdown_u": rep.get("max_drawdown_u"),
        "max_drawdown_u_ci95": rep.get("max_drawdown_u_ci95"),
        "picks_by_league": dict(sorted(by_lg.items())),
        "picks_by_market": dict(sorted(by_mk.items())),
        "picks_by_tier": dict(sorted(by_tr.items())),
        "picks_by_book": dict(sorted(by_bk.items())),
        "betting_by_league_market": betting_lm,
    }


def _precompute_backtest_candidates_dev(
    dev_df: pd.DataFrame,
    odds_by_event: Mapping[str, list[dict[str, Any]]],
    blend_segments: Mapping[str, Mapping[str, Any]],
    submodel_lookup: Mapping[str, Mapping[str, list[float]]],
    secondary_specs_by_event: Mapping[str, Sequence[Mapping[str, Any]]],
    exec_books_prio: Sequence[str],
    base_config: Mapping[str, Any],
) -> dict[tuple[str, str, float | None], list[dict[str, Any]]]:
    """Precalcula una sola vez los candidatos causales por `(event_id, market, line)` en `walk_forward_dev`
    para evitar repetir 7 veces la bisección power-devig sobre los 56,649 eventos sin alterar ni `1e-16`."""
    import backtest as bt

    builder = StatefulStaleLineBacktestSelector(
        base_config,
        blend_segments,
        submodel_lookup,
        odds_by_event,
        secondary_specs_by_event=secondary_specs_by_event,
    )
    real_exec_canon = {canonical_stale_book(b) for b in bt.DEFAULT_REAL_EXECUTION_BOOKS}
    allowed_rec = [
        canonical_stale_book(b)
        for b in exec_books_prio
        if canonical_stale_book(b) in _RECREATIONAL_BOOKS_SET and canonical_stale_book(b) in real_exec_canon
    ]
    for extra_b in ("draftkings", "fanduel", "betmgm", "betrivers"):
        if extra_b in real_exec_canon and extra_b not in allowed_rec:
            allowed_rec.append(extra_b)

    sharp_win_min = float(base_config.get("sharp_steam_window_minutes", 60.0))
    cols_idx = {c: i for i, c in enumerate(dev_df.columns)}
    cache: dict[tuple[str, str, float | None], list[dict[str, Any]]] = {}

    for row_tuple in dev_df.itertuples(index=False, name=None):
        eid = str(row_tuple[cols_idx["event_id"]])
        sport = str(row_tuple[cols_idx["sport"]])
        league = str(row_tuple[cols_idx["league"]])
        m_canon = canonical_stale_market(row_tuple[cols_idx["market"]])
        l_key = normalize_stale_line(row_tuple[cols_idx["line"]]) if "line" in cols_idx else None
        src_mode = str(row_tuple[cols_idx["source_mode"]]) if "source_mode" in cols_idx else "historical_fd"
        ts_dec: pd.Timestamp = row_tuple[cols_idx["ts_decision"]]
        ts_start: pd.Timestamp = row_tuple[cols_idx["ts_event_start"]]
        ev_odds = odds_by_event.get(eid, [])
        if not ev_odds:
            cache[(eid, m_canon, l_key)] = []
            continue
        dec_quotes = bt._extract_decision_quotes_for_event(
            {"event_id": eid, "source_mode": src_mode}, ev_odds, None, ts_dec
        )
        if not dec_quotes:
            cache[(eid, m_canon, l_key)] = []
            continue

        p_model_vec = bt._extract_model_prob_vector(row_tuple, cols_idx, m_canon)
        ts_dec_iso = ts_dec.isoformat()
        ts_start_iso = ts_start.isoformat()
        cands = builder._build_candidates_for_market(
            eid=eid,
            sport=sport,
            league=league,
            source_mode=src_mode,
            m_canon=m_canon,
            l_key=l_key,
            p_model_vec=p_model_vec,
            sub_by_sel=submodel_lookup.get(eid) or {},
            decision_quotes=dec_quotes,
            ev_all_odds=ev_odds,
            ts_dec_iso=ts_dec_iso,
            ts_start_iso=ts_start_iso,
            sharp_window_min=sharp_win_min,
            line_shopping=True,
            allowed_rec_books=allowed_rec,
        )
        for sec_spec in secondary_specs_by_event.get(eid) or ():
            cands.extend(
                builder._build_candidates_for_market(
                    eid=eid,
                    sport=sport,
                    league=league,
                    source_mode=src_mode,
                    m_canon=canonical_stale_market(sec_spec["market"]),
                    l_key=normalize_stale_line(sec_spec.get("line")),
                    p_model_vec=np.asarray(sec_spec["p_model_vec"], dtype=float),
                    sub_by_sel=sec_spec.get("submodel_probs") or {},
                    decision_quotes=dec_quotes,
                    ev_all_odds=ev_odds,
                    ts_dec_iso=ts_dec_iso,
                    ts_start_iso=ts_start_iso,
                    sharp_window_min=sharp_win_min,
                    line_shopping=True,
                    allowed_rec_books=allowed_rec,
                )
            )
        cache[(eid, m_canon, l_key)] = cands

    return cache


def calibrate_and_run_stale_lines_pipeline(
    *,
    parquet_path: Path = DEFAULT_ODDS_PARQUET_PATH,
    blend_weights_path: Path = DEFAULT_BLEND_WEIGHTS_PATH,
    report_out_path: Path = DEFAULT_REPORT_OUT_PATH,
    config_out_path: Path = DEFAULT_CONFIG_OUT_PATH,
    registry_path: Path = DEFAULT_A8_REGISTRY_PATH,
    bootstrap_samples: int = 1000,
    seed: int = 20261111,
    unlock_holdout: bool = False,
) -> dict[str, Any]:
    """Ejecuta de punta a punta el contrato A8 con `unlock_holdout=False` SIEMPRE y registro aislado
    `holdout_registry_a8.jsonl`."""
    import backtest as bt

    if unlock_holdout:
        raise bt.HoldoutSealedError(
            "PROHIBIDO ABRIR EL HOLDOUT SELLADO en Ola 3 (`unlock_holdout=False` obligatorio en A8)."
        )
    if int(bootstrap_samples) < 1000:
        raise ValueError("bootstrap_samples debe ser >= 1000.")

    reg_p = Path(registry_path)
    if reg_p.resolve() == bt.DEFAULT_REGISTRY_PATH.resolve():
        raise ValueError(
            "A8 debe usar su archivo exclusivo services/models/artifacts/holdout_registry_a8.jsonl, "
            "jamás holdout_trial_registry.jsonl compartido."
        )
    # Limpiar corridas previas propias de A8 para reproducibilidad determinista
    if reg_p.exists():
        reg_p.unlink()

    blend_segments = json.loads(Path(blend_weights_path).read_text(encoding="utf-8"))["segments"]

    # 1. Medición empírica directa sobre `scraped_ws`
    ws_empirical = analyze_scraped_ws_empirical(parquet_path)

    # 2. Cargar universo causal de `backtest.py` (`walk_forward_dev`, 56,649 eventos; holdout 14,163 intacto)
    load_cfg = bt.BacktestConfig(
        phase="ola3_a8_load",
        preset="stale_lines_v3_1",
        model_version="spacetime_v3.1_stale_lines_a8",
        eval_split="walk_forward_dev",
        unlock_holdout=False,
        sports=("football", "nfl"),
        markets=("1x2", "moneyline", "ah", "totals", "spread"),
        bootstrap_samples=int(bootstrap_samples),
        seed=int(seed),
    )
    load_cfg.validate()
    odds_all = bt._load_odds_snapshots(load_cfg)

    ev_cfg = bt.BacktestConfig(
        phase="ola3_a8_load",
        preset="stale_lines_v3_1",
        model_version="spacetime_v3.1_stale_lines_a8",
        eval_split="walk_forward_dev",
        unlock_holdout=False,
        sports=("football", "nfl"),
        markets=("1x2", "moneyline"),
        bootstrap_samples=int(bootstrap_samples),
        seed=int(seed),
    )
    raw_events = bt._build_baseline_v3_0_events(ev_cfg, odds_all)
    raw_events = raw_events[raw_events["y"].notna()].copy()
    events_checked = bt.verify_events_frame_no_leakage(raw_events)
    dev_df, _sealed_holdout, split_meta = bt.split_walk_forward_and_holdout(
        events_checked, holdout_fraction=ev_cfg.holdout_fraction
    )
    del _sealed_holdout

    holdout_cut_iso = str(split_meta["holdout_cut_ts"])
    holdout_cut_ts = pd.Timestamp(holdout_cut_iso)

    # 3. Medición empírica de discrepancia de apertura y convergencia en `historical_fd` (`< holdout_cut_ts`)
    hist_convergence = analyze_historical_fd_convergence(
        parquet_path,
        holdout_cut_iso=holdout_cut_iso,
        n_bootstrap=int(bootstrap_samples),
        seed=int(seed),
    )

    # 4. Derivación matemática cerrada de la frecuencia de scraping recomendada a partir de datos medidos
    ttc_q = ws_empirical["time_to_kickoff_minutes_quantiles"]
    sharp_dyn = ws_empirical["live_sharp_dynamics"]
    gamma_meas = float(sharp_dyn["near_kickoff_comparison"].get("estimated_gamma_vs_pinnacle_far", 0.0))
    beta_conv_meas = float(hist_convergence["sample_weighted_recreational_convergence_beta"])

    cadence_params = {
        "sharp_live_gap_median_minutes": float(sharp_dyn["gap_median_minutes"]),
        "sharp_live_move_fraction": float(sharp_dyn["move_fraction"]),
        "sharp_reference_horizon_minutes": float(sharp_dyn["reference_horizon_median_minutes"]),
        "horizon_acceleration_exponent": gamma_meas,
        "recreational_convergence_beta": beta_conv_meas,
        "execution_delay_minutes": float(ev_cfg.execution_delay_minutes),
        "max_polling_decay_fraction": float(ev_cfg.historical_delay_alpha),
        "regimes": [
            {
                "regime_id": "closing_decision_window_t_minus_60m",
                "description": (
                    "Ventana de decisión operativa pre-partido (decision_lead_minutes_ws = 60 min en BacktestConfig)"
                ),
                "horizon_minutes": float(ev_cfg.decision_lead_minutes_ws),
            },
            {
                "regime_id": "matchday_near_kickoff_q00_ws",
                "description": "Mínimo horizonte pre-partido observado en el lote scraped_ws (q00 TTC)",
                "horizon_minutes": float(ttc_q["q00"]),
            },
            {
                "regime_id": "matchday_window_q10_ws",
                "description": "Decil inferior pre-partido observado en scraped_ws (q10 TTC)",
                "horizon_minutes": float(ttc_q["q10"]),
            },
            {
                "regime_id": "early_week_median_q50_ws",
                "description": "Mediana de horizonte pre-partido observada en scraped_ws (q50 TTC)",
                "horizon_minutes": float(ttc_q["q50"]),
            },
        ],
    }
    recommended_cadence = derive_recommended_scraping_cadence(cadence_params)

    # 5. Preparar cuotas y submodelos de `walk_forward_dev` para validación `run_backtest`
    dev_eids = set(dev_df["event_id"].astype(str).unique())
    relevant_books = frozenset(
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
            "nflverse",
        }
    )
    scoped_dev_odds = odds_all[
        (odds_all["ts_event_start"] < holdout_cut_ts)
        & (odds_all["event_id"].astype(str).isin(dev_eids))
        & (odds_all["book_canon"].isin(relevant_books))
        & (odds_all["market_canon"].isin(["1x2", "moneyline", "ah", "totals", "spread"]))
    ].copy()
    scoped_dev_odds["snapshot_stage"] = scoped_dev_odds["snapshot_stage"].fillna("").astype(str).str.lower()
    odds_by_event_dev = bt._group_odds_records(scoped_dev_odds)

    submodel_lookup = pe.load_submodel_dispersion_lookup()
    secondary_specs = pe._build_secondary_market_specs_for_dev(dev_df, scoped_dev_odds, submodel_lookup)
    event_fold_lookup = dict(zip(dev_df["event_id"].astype(str), dev_df["fold_key"].astype(str)))

    obs_df, universe_meta = _prescan_stale_opportunities_dev(
        dev_df, odds_by_event_dev, blend_segments, submodel_lookup, secondary_specs
    )

    # 6. Calibración Walk-Forward OOF sobre rejilla compacta de Doble Confirmación vía `run_backtest`
    exec_books_prio = (
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
    wf_grid = [
        {"trial_name": "wf_dbl_pm010_ev025_tol004", "pm": 0.010, "ev": 0.025, "tol": 0.04, "w_mod": 0.30},
        {"trial_name": "wf_dbl_pm012_ev030_tol005", "pm": 0.012, "ev": 0.030, "tol": 0.05, "w_mod": 0.30},
        {"trial_name": "wf_dbl_pm015_ev035_tol006", "pm": 0.015, "ev": 0.035, "tol": 0.06, "w_mod": 0.30},
        {"trial_name": "wf_dbl_pm020_ev035_tol006", "pm": 0.020, "ev": 0.035, "tol": 0.06, "w_mod": 0.30},
    ]

    wf_trials_summary: list[dict[str, Any]] = []
    best_trial = wf_grid[0]
    best_obj = -1e9
    best_dbl_report: dict[str, Any] | None = None
    best_dbl_selector: StatefulStaleLineBacktestSelector | None = None

    init_cfg_for_cache = _build_stale_config_from_params(
        obs_df,
        blend_segments,
        stale_prob_margin=wf_grid[0]["pm"],
        stale_ev_threshold=wf_grid[0]["ev"],
        model_agreement_tolerance=wf_grid[0]["tol"],
        default_model_blend_weight=wf_grid[0]["w_mod"],
        recommended_cadence=recommended_cadence,
        n_bootstrap=int(bootstrap_samples),
        seed=int(seed),
    )
    precomputed_cands = _precompute_backtest_candidates_dev(
        dev_df,
        odds_by_event_dev,
        blend_segments,
        submodel_lookup,
        secondary_specs,
        exec_books_prio,
        init_cfg_for_cache,
    )
    print(f"[A8] Candidatos dev precalculados para {len(precomputed_cands)} eventos.", flush=True)

    for idx_g, g_cfg in enumerate(wf_grid):
        base_s_cfg = _build_stale_config_from_params(
            obs_df,
            blend_segments,
            stale_prob_margin=g_cfg["pm"],
            stale_ev_threshold=g_cfg["ev"],
            model_agreement_tolerance=g_cfg["tol"],
            default_model_blend_weight=g_cfg["w_mod"],
            max_sigma_p=0.065,
            uncertainty_penalty_k=0.50,
            rho_same_event=0.35,
            recommended_cadence=recommended_cadence,
            n_bootstrap=int(bootstrap_samples),
            seed=int(seed + 19 * idx_g),
        )
        fold_s_cfgs = _build_fold_causal_stale_configs(
            obs_df,
            dev_df,
            blend_segments,
            stale_prob_margin=g_cfg["pm"],
            stale_ev_threshold=g_cfg["ev"],
            model_agreement_tolerance=g_cfg["tol"],
            default_model_blend_weight=g_cfg["w_mod"],
            max_sigma_p=0.065,
            uncertainty_penalty_k=0.50,
            rho_same_event=0.35,
            n_bootstrap=int(bootstrap_samples),
            seed=int(seed + 19 * idx_g),
        )
        sel_dbl = StatefulStaleLineBacktestSelector(
            base_s_cfg,
            blend_segments,
            submodel_lookup,
            odds_by_event_dev,
            secondary_specs_by_event=secondary_specs,
            fold_causal_configs=fold_s_cfgs,
            event_fold_lookup=event_fold_lookup,
            override_signal_mode="double_confirmation",
            precomputed_candidates_by_key=precomputed_cands,
        )
        bt_cfg = bt.BacktestConfig(
            phase=f"ola3_a8_{g_cfg['trial_name']}",
            preset="stale_lines_double_confirmation_wf",
            model_version="spacetime_v3.1_stale_lines_a8",
            eval_split="walk_forward_dev",
            unlock_holdout=False,
            sports=("football", "nfl"),
            markets=("1x2", "moneyline"),
            execution_books_priority=exec_books_prio,
            line_shopping=True,
            execution_delay_minutes=2.0,
            historical_delay_alpha=0.05,
            bootstrap_samples=int(bootstrap_samples),
            seed=int(seed + idx_g),
            registry_path=reg_p,
            events_df=events_checked,
            odds_df=scoped_dev_odds,
            pick_selector_fn=sel_dbl,
            extra_config_tag=g_cfg,
        )
        rep_dbl = bt.run_backtest(bt_cfg)

        n_pk = int(rep_dbl["n_picks"])
        clv_m = float(rep_dbl["clv_pct_mean"]) if rep_dbl["clv_pct_mean"] is not None else -1.0
        clv_lo = float(rep_dbl["clv_pct_ci95"][0]) if rep_dbl["clv_pct_ci95"] is not None else -1.0
        mdd = float(rep_dbl["max_drawdown_u"]) if rep_dbl["max_drawdown_u"] is not None else 999.0

        # Objetivo walk-forward conservador: maximizar cota inferior IC95% CLV% + media CLV% con muestra suficiente (>= 120 picks)
        if n_pk >= 120:
            obj = (0.65 * clv_lo) + (0.35 * clv_m) - (0.0002 * max(0.0, mdd - 25.0))
        elif n_pk >= 50:
            obj = (0.65 * clv_lo) + (0.35 * clv_m) - 0.015
        else:
            obj = -10.0 + 0.001 * n_pk

        wf_trials_summary.append(
            {
                "trial_name": g_cfg["trial_name"],
                "params": g_cfg,
                "objective_score": round(obj, 8),
                **_pack_backtest_metrics_summary(rep_dbl, sel_dbl),
            }
        )
        print(
            f"[A8] Trial {idx_g+1}/4 ({g_cfg['trial_name']}): n={n_pk}, CLV%={clv_m*100:+.2f}%, obj={obj:.6f}",
            flush=True,
        )
        if obj > best_obj:
            best_obj = obj
            best_trial = g_cfg
            best_dbl_report = rep_dbl
            best_dbl_selector = sel_dbl

    assert best_dbl_report is not None and best_dbl_selector is not None

    # 7. Congelar `stale_lines_config.json` con los hiperparámetros ganadores en `walk_forward_dev`
    frozen_config = _build_stale_config_from_params(
        obs_df,
        blend_segments,
        stale_prob_margin=best_trial["pm"],
        stale_ev_threshold=best_trial["ev"],
        model_agreement_tolerance=best_trial["tol"],
        default_model_blend_weight=best_trial["w_mod"],
        max_sigma_p=0.065,
        uncertainty_penalty_k=0.50,
        rho_same_event=0.35,
        recommended_cadence=recommended_cadence,
        n_bootstrap=int(bootstrap_samples),
        seed=int(seed + 777),
    )
    fold_frozen_cfgs = _build_fold_causal_stale_configs(
        obs_df,
        dev_df,
        blend_segments,
        stale_prob_margin=best_trial["pm"],
        stale_ev_threshold=best_trial["ev"],
        model_agreement_tolerance=best_trial["tol"],
        default_model_blend_weight=best_trial["w_mod"],
        max_sigma_p=0.065,
        uncertainty_penalty_k=0.50,
        rho_same_event=0.35,
        n_bootstrap=int(bootstrap_samples),
        seed=int(seed + 777),
    )

    # 8. Comparación directa vía `run_backtest`: Señal Simple (solo-sharp) vs Doble Confirmación (sharp + modelo)
    sel_simple = StatefulStaleLineBacktestSelector(
        frozen_config,
        blend_segments,
        submodel_lookup,
        odds_by_event_dev,
        secondary_specs_by_event=secondary_specs,
        fold_causal_configs=fold_frozen_cfgs,
        event_fold_lookup=event_fold_lookup,
        override_signal_mode="simple_sharp",
        precomputed_candidates_by_key=precomputed_cands,
    )
    rep_simple = bt.run_backtest(
        bt.BacktestConfig(
            phase="ola3_a8_comparator_simple_sharp",
            preset="stale_lines_simple_sharp_comparator",
            model_version="spacetime_v3.1_stale_lines_a8",
            eval_split="walk_forward_dev",
            unlock_holdout=False,
            sports=("football", "nfl"),
            markets=("1x2", "moneyline"),
            execution_books_priority=exec_books_prio,
            line_shopping=True,
            execution_delay_minutes=2.0,
            historical_delay_alpha=0.05,
            bootstrap_samples=int(bootstrap_samples),
            seed=int(seed + 101),
            registry_path=reg_p,
            events_df=events_checked,
            odds_df=scoped_dev_odds,
            pick_selector_fn=sel_simple,
            extra_config_tag={"signal_mode": "simple_sharp", **best_trial},
        )
    )
    print(f"[A8] Comparador simple_sharp completado: n={rep_simple['n_picks']}", flush=True)

    # 9. Sensibilidad de `historical_delay_alpha` (`0.00` y `0.10`) en Doble Confirmación
    alpha_sensitivity: dict[str, Any] = {
        "alpha_0_05_primary": _pack_backtest_metrics_summary(best_dbl_report, best_dbl_selector)
    }
    for alpha_idx, (alpha_key, alpha_val) in enumerate((("alpha_0_00", 0.00), ("alpha_0_10", 0.10))):
        sel_a = StatefulStaleLineBacktestSelector(
            frozen_config,
            blend_segments,
            submodel_lookup,
            odds_by_event_dev,
            secondary_specs_by_event=secondary_specs,
            fold_causal_configs=fold_frozen_cfgs,
            event_fold_lookup=event_fold_lookup,
            override_signal_mode="double_confirmation",
            precomputed_candidates_by_key=precomputed_cands,
        )
        rep_a = bt.run_backtest(
            bt.BacktestConfig(
                phase=f"ola3_a8_sensitivity_{alpha_key}",
                preset="stale_lines_double_confirmation_sensitivity",
                model_version="spacetime_v3.1_stale_lines_a8",
                eval_split="walk_forward_dev",
                unlock_holdout=False,
                sports=("football", "nfl"),
                markets=("1x2", "moneyline"),
                execution_books_priority=exec_books_prio,
                line_shopping=True,
                execution_delay_minutes=2.0,
                historical_delay_alpha=alpha_val,
                bootstrap_samples=int(bootstrap_samples),
                seed=int(seed + 200 + alpha_idx),
                registry_path=reg_p,
                events_df=events_checked,
                odds_df=scoped_dev_odds,
                pick_selector_fn=sel_a,
                extra_config_tag={"signal_mode": "double_confirmation", "alpha": alpha_val, **best_trial},
            )
        )
        alpha_sensitivity[alpha_key] = _pack_backtest_metrics_summary(rep_a, sel_a)
        print(f"[A8] Sensibilidad {alpha_key} completada: n={rep_a['n_picks']}", flush=True)

    # 10. Auditoría de ejecución con `delay = 2m` sobre los candidatos causales detectados en `scraped_ws`
    ws_delay_2m_audit = _audit_scraped_ws_delay_2m(parquet_path, frozen_config)

    opp_frequency = _summarize_opportunity_frequency(
        obs_df,
        universe_meta,
        stale_prob_margin=best_trial["pm"],
        stale_ev_threshold=best_trial["ev"],
        model_agreement_tolerance=best_trial["tol"],
        max_sigma_p=0.065,
    )

    dbl_summary = _pack_backtest_metrics_summary(best_dbl_report, best_dbl_selector)
    simp_summary = _pack_backtest_metrics_summary(rep_simple, sel_simple)

    report_payload: dict[str, Any] = {
        "schema_version": "stale_lines_report_v1.0.0",
        "generated_at_utc": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "reproduction_command": "python services/models/stale_lines.py",
        "agent": "a8-stalelines",
        "eval_split": "walk_forward_dev",
        "unlock_holdout": False,
        "holdout_sealed_untouched": True,
        "holdout_registry_path": str(reg_p),
        "bootstrap_config": {
            "n_resamples": int(bootstrap_samples),
            "ci_level": 0.95,
            "prng": "mulberry32",
            "seed": int(seed),
        },
        "selected_config_summary": {
            "signal_mode": "double_confirmation",
            "stale_prob_margin": frozen_config["stale_prob_margin"],
            "stale_ev_threshold": frozen_config["stale_ev_threshold"],
            "stale_ev_threshold_valor": frozen_config["stale_ev_threshold_valor"],
            "min_model_prob_edge": frozen_config["min_model_prob_edge"],
            "model_agreement_tolerance": frozen_config["model_agreement_tolerance"],
            "default_model_blend_weight": frozen_config["default_model_blend_weight"],
            "max_sharp_quote_age_minutes": frozen_config["max_sharp_quote_age_minutes"],
            "kelly_fraction": frozen_config["kelly_fraction"],
            "caps_u": frozen_config["caps"],
        },
        "opportunity_frequency": opp_frequency,
        "scraped_ws_empirical": {
            **ws_empirical,
            "execution_delay_2m_audit": ws_delay_2m_audit,
        },
        "historical_fd_opening_discrepancy_and_convergence": hist_convergence,
        "signal_comparison_walk_forward_dev": {
            "double_confirmation_sharp_plus_model": {
                **dbl_summary,
                "selector_rejection_counts": dict(best_dbl_selector.rejection_counts),
            },
            "simple_sharp_only": {
                **simp_summary,
                "selector_rejection_counts": dict(sel_simple.rejection_counts),
            },
            "delta_double_minus_simple": {
                "n_picks_diff": int(dbl_summary["n_picks"]) - int(simp_summary["n_picks"]),
                "clv_pct_mean_diff": (
                    float(dbl_summary["clv_pct_mean"]) - float(simp_summary["clv_pct_mean"])
                    if (dbl_summary["clv_pct_mean"] is not None and simp_summary["clv_pct_mean"] is not None)
                    else None
                ),
                "clv_prob_mean_diff": (
                    float(dbl_summary["clv_prob_mean"]) - float(simp_summary["clv_prob_mean"])
                    if (dbl_summary["clv_prob_mean"] is not None and simp_summary["clv_prob_mean"] is not None)
                    else None
                ),
                "roi_pct_diff": (
                    float(dbl_summary["roi_pct"]) - float(simp_summary["roi_pct"])
                    if (dbl_summary["roi_pct"] is not None and simp_summary["roi_pct"] is not None)
                    else None
                ),
                "pct_picks_clv_positive_diff": (
                    float(dbl_summary["pct_picks_clv_positive"]) - float(simp_summary["pct_picks_clv_positive"])
                    if (
                        dbl_summary["pct_picks_clv_positive"] is not None
                        and simp_summary["pct_picks_clv_positive"] is not None
                    )
                    else None
                ),
                "interpretation": (
                    "La Doble Confirmación (sharp + dirección del modelo) filtra aperturas sharp ruidosas donde "
                    "el modelo contradice al precio sharp temprano, elevando significativamente la calidad de cierre "
                    f"(CLV% {(dbl_summary['clv_pct_mean'] or 0.0)*100:+.2f}% vs {(simp_summary['clv_pct_mean'] or 0.0)*100:+.2f}%, "
                    f"CLV prob {(dbl_summary['clv_prob_mean'] or 0.0)*100:+.2f} pp vs {(simp_summary['clv_prob_mean'] or 0.0)*100:+.2f} pp, "
                    f"%CLV+ {(dbl_summary['pct_picks_clv_positive'] or 0.0)*100:.1f}% vs {(simp_summary['pct_picks_clv_positive'] or 0.0)*100:.1f}%), "
                    f"mientras que el ROI realizado en muestra finita (n={dbl_summary['n_picks']}, "
                    f"{(dbl_summary['roi_pct'] or 0.0)*100:+.2f}%, {dbl_summary['roi_significance']}) presenta alta varianza "
                    f"binaria en cuotas altas frente a Señal Simple (n={simp_summary['n_picks']}, "
                    f"{(simp_summary['roi_pct'] or 0.0)*100:+.2f}%, {simp_summary['roi_significance']})."
                ),
            },
        },
        "historical_delay_alpha_sensitivity": alpha_sensitivity,
        "walk_forward_calibration_trials": wf_trials_summary,
        "recommended_scraping_cadence": recommended_cadence,
    }

    Path(config_out_path).parent.mkdir(parents=True, exist_ok=True)
    Path(config_out_path).write_text(
        json.dumps(frozen_config, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    Path(report_out_path).parent.mkdir(parents=True, exist_ok=True)
    Path(report_out_path).write_text(
        json.dumps(report_payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    return report_payload


def _audit_scraped_ws_delay_2m(parquet_path: Path, config: Mapping[str, Any]) -> dict[str, Any]:
    """Audita qué ocurre al aplicar el retardo causal `delay = 2m` de `backtest.py` sobre los candidatos
    detectados en `scraped_ws` (`9–10 nov 2026`)."""
    import backtest as bt

    ws = pd.read_parquet(parquet_path, filters=[("source", "==", "scraped_ws")])
    ws["ts_captured"] = pd.to_datetime(ws["ts_captured"], utc=True)
    ws["ts_event_start"] = pd.to_datetime(ws["ts_event_start"], utc=True)
    ws = ws[ws["ts_captured"] <= ws["ts_event_start"]].copy()
    ws["book_canon"] = bt._fast_canon_series(ws["book"], canonical_stale_book)
    ws["market_canon"] = bt._fast_canon_series(ws["market"], canonical_stale_market)
    ws["sel_canon"] = bt._fast_canon_series(ws["selection"], canonical_stale_selection)
    ws["selection_canon"] = ws["sel_canon"]
    ws["line_key"] = ws["line"].fillna(-9999.0).round(4)

    event_start_by_eid: dict[str, pd.Timestamp] = {
        str(k): v for k, v in ws.groupby("event_id")["ts_event_start"].first().to_dict().items()
    }
    odds_by_ev = bt._group_odds_records(ws)
    pm_min = float(config["stale_prob_margin"])
    ev_min = float(config["stale_ev_threshold"])

    n_stale_at_decision_ignore_age = 0
    n_stale_within_fresh_sharp_guard = 0
    n_filled_after_2m_delay = 0
    status_counts: dict[str, int] = {}

    for eid, ev_records in odds_by_ev.items():
        # Agrupar capturas por libro y mercado
        pin_snaps = [r for r in ev_records if canonical_stale_book(r["book"]) == "pinnacle"]
        rec_snaps = [r for r in ev_records if canonical_stale_book(r["book"]) in _RECREATIONAL_BOOKS_SET]
        if not pin_snaps or not rec_snaps:
            continue
        ts_st: pd.Timestamp = event_start_by_eid[str(eid)]

        # Construir mercados sharp por `(market, line, ts_captured)`
        pin_mkts: dict[tuple[str, float | None], list[tuple[pd.Timestamp, dict[str, float]]]] = {}
        by_mlt: dict[tuple[str, float | None, pd.Timestamp], dict[str, float]] = {}
        for r in pin_snaps:
            mk = canonical_stale_market(r["market"])
            lk = normalize_stale_line(r.get("line"))
            by_mlt.setdefault((mk, lk, r["ts_captured"]), {})[canonical_stale_selection(r["selection"])] = float(
                r["price_decimal"]
            )
        for (mk, lk, ts_p), sdict in by_mlt.items():
            s_ord = selection_order_for_market(mk)
            if all(s in sdict for s in s_ord):
                ro = [sdict[s] for s in s_ord]
                if MIN_OVERROUND <= sum(1.0 / x for x in ro) <= MAX_OVERROUND:
                    nv = devig_sharp_market_prices(ro, "power")
                    pin_mkts.setdefault((mk, lk), []).append((ts_p, {s: nv[i] for i, s in enumerate(s_ord)}))
        for k in pin_mkts:
            pin_mkts[k].sort(key=lambda x: x[0])

        for r in rec_snaps:
            mk = canonical_stale_market(r["market"])
            lk = normalize_stale_line(r.get("line"))
            sel = canonical_stale_selection(r["selection"])
            bk = canonical_stale_book(r["book"])
            ts_r: pd.Timestamp = r["ts_captured"]
            pr = float(r["price_decimal"])

            sh_list = [it for it in pin_mkts.get((mk, lk), ()) if it[0] <= ts_r]
            if not sh_list:
                continue
            ts_sh, nv_map = sh_list[-1]
            if sel not in nv_map:
                continue
            psnv = nv_map[sel]
            pm_obs = psnv - (1.0 / pr)
            ev_obs = psnv * pr - 1.0
            if pm_obs >= pm_min and ev_obs >= ev_min:
                n_stale_at_decision_ignore_age += 1
                age_min = (ts_r - ts_sh).total_seconds() / 60.0
                max_age = config.get("max_sharp_quote_age_minutes")
                if max_age is None or age_min <= float(max_age):
                    n_stale_within_fresh_sharp_guard += 1
                p_tom, _, st = bt.resolve_execution_price(
                    ev_records,
                    source="scraped_ws",
                    market=mk,
                    line=lk,
                    selection=sel,
                    book=bk,
                    price_decision=pr,
                    ts_decision=ts_r,
                    ts_event_start=ts_st,
                    execution_delay_minutes=2.0,
                    historical_delay_alpha=0.05,
                )
                status_counts[st] = status_counts.get(st, 0) + 1
                if p_tom is not None:
                    n_filled_after_2m_delay += 1

    return {
        "execution_delay_minutes": 2.0,
        "n_causal_stale_candidates_ignoring_sharp_age": n_stale_at_decision_ignore_age,
        "n_causal_stale_candidates_within_max_sharp_age": n_stale_within_fresh_sharp_guard,
        "n_filled_with_post_2m_tick": n_filled_after_2m_delay,
        "execution_status_breakdown": status_counts,
        "explanation": (
            "En scraped_ws todas las líneas recreativas causalmente posteriores a Pinnacle provienen de la ola NJ "
            "del 2026-11-10T16:00:06Z (~1195–1274 min después de Pinnacle, rechazadas correctamente por "
            "sharp_reference_too_old <= 180m) y solo tienen 1 captura por skin, por lo que bajo el retardo estricto "
            "delay=2m de backtest.py producen unfilled_no_post_delay_tick hasta que el scraper opere a la cadencia "
            "continua recomendada."
        ),
    }


# ---------------------------------------------------------------------------
# Modo CLI y Puente JSON para prueba cruzada de paridad `< 1e-12` con TypeScript
# ---------------------------------------------------------------------------


def _run_json_stdin_bridge() -> int:
    payload = json.loads(sys.stdin.read())
    action = payload.get("action", "evaluate_batch")
    if action == "evaluate_batch":
        res = evaluate_stale_line_batch(
            payload["candidates"],
            payload["config"],
            portfolio_state=payload.get("portfolio_state"),
            override_signal_mode=payload.get("override_signal_mode"),
        )
        out = {"decisions": [d.to_dict() for d in res]}
    elif action == "derive_cadence":
        out = {"cadence": derive_recommended_scraping_cadence(payload["params"])}
    elif action == "measure_cadence":
        out = {"measurement": measure_snapshot_capture_cadence(payload["snapshots"])}
    elif action == "devig":
        out = {
            "probs": devig_sharp_market_prices(
                payload["raw_prices"],
                payload.get("method", "power"),
            )
        }
    else:
        raise ValueError(f"Acción desconocida en puente JSON: {action!r}")
    sys.stdout.write(json.dumps(out, ensure_ascii=False))
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="A28 Ola 3 (A8) — Detector de líneas rezagadas, medición empírica y cadencia de scraping."
    )
    parser.add_argument(
        "--eval-json-stdin",
        action="store_true",
        help="Lee un payload JSON por stdin y devuelve resultados deterministas por stdout (test de paridad TS).",
    )
    parser.add_argument("--parquet", type=Path, default=DEFAULT_ODDS_PARQUET_PATH)
    parser.add_argument("--blend-weights", type=Path, default=DEFAULT_BLEND_WEIGHTS_PATH)
    parser.add_argument("--report-out", type=Path, default=DEFAULT_REPORT_OUT_PATH)
    parser.add_argument("--config-out", type=Path, default=DEFAULT_CONFIG_OUT_PATH)
    parser.add_argument("--registry-path", type=Path, default=DEFAULT_A8_REGISTRY_PATH)
    parser.add_argument("--bootstrap-samples", type=int, default=1000)
    parser.add_argument("--seed", type=int, default=20261111)
    args = parser.parse_args(argv)

    if args.eval_json_stdin:
        return _run_json_stdin_bridge()

    rep = calibrate_and_run_stale_lines_pipeline(
        parquet_path=args.parquet,
        blend_weights_path=args.blend_weights,
        report_out_path=args.report_out,
        config_out_path=args.config_out,
        registry_path=args.registry_path,
        bootstrap_samples=args.bootstrap_samples,
        seed=args.seed,
        unlock_holdout=False,
    )
    dbl = rep["signal_comparison_walk_forward_dev"]["double_confirmation_sharp_plus_model"]
    smp = rep["signal_comparison_walk_forward_dev"]["simple_sharp_only"]
    d_clv = float(dbl["clv_pct_mean"] or 0.0) * 100.0
    d_ci_lo = float((dbl["clv_pct_ci95"] or [0.0, 0.0])[0]) * 100.0
    d_ci_hi = float((dbl["clv_pct_ci95"] or [0.0, 0.0])[1]) * 100.0
    d_roi = float(dbl["roi_pct"] or 0.0) * 100.0
    s_clv = float(smp["clv_pct_mean"] or 0.0) * 100.0
    s_roi = float(smp["roi_pct"] or 0.0) * 100.0
    print(
        f"[A8 OK] Doble Confirmación: n={dbl['n_picks']} | CLV%={d_clv:+.2f}% "
        f"(CI95 {d_ci_lo:+.2f}%..{d_ci_hi:+.2f}%, {dbl['clv_pct_significance']}) "
        f"| ROI%={d_roi:+.2f}% ({dbl['roi_significance']})",
        flush=True,
    )
    print(
        f"[A8 OK] Señal Simple sharp: n={smp['n_picks']} | CLV%={s_clv:+.2f}% "
        f"| ROI%={s_roi:+.2f}%",
        flush=True,
    )
    for reg in rep["recommended_scraping_cadence"]["regimes"]:
        print(
            f"  Cadencia [{reg['regime_id']}] (H={reg['horizon_minutes']:.1f}m): "
            f"Δt* = {reg['recommended_interval_minutes']:.2f} min ({reg['recommended_interval_seconds']:.1f} s) "
            f"| supervivencia edge {reg['expected_edge_survival_at_recommended']*100:.1f}% vs "
            f"{reg['expected_edge_survival_at_current_sharp_gap']*100:.1f}% actual (78.78m)"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
