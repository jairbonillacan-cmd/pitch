#!/usr/bin/env python3
"""A28 (Ola 2 · Agente A4) — Combinación modelo-mercado en espacio logit y calibración walk-forward.

Implementa con paridad numérica estricta respecto a `src/domain/prediction/blend.ts` y `devig.ts`:
  1. Eliminación de margen (`proportional`, `power`, `shin`) en 3 vías (`1x2`) y 2 vías
     (`moneyline`, `ah`, `ou`/`totals`, `btts`, `dnb`, `spread`) con `|Δ| < 1e-9` (real `< 1e-14`).
  2. Comparación walk-forward fuera de muestra (`< fold_cut_ts`) de los 3 métodos de de-vig por
     segmento `league × market` en `walk_forward_dev` con IC 95% bootstrap (`>= 1000` remuestreos,
     `mulberry32` + cuantiles Type-7; `"no significativa"` cuando el IC 95% contra `proportional` cruza 0).
  3. Mezcla unificada en espacio logit con paridad exacta TS ↔ Python (`|Δ| < 1e-12`):
       `u_k = σ(w · logit(p_modelo_k) + (1 - w) · logit(p_mercado_sin_margen_k))`
       `p_final_k = u_k / sum_j(u_j)`
     (idéntica sin discontinuidad a `σ(w · logit(p_m) + (1 - w) · logit(p_mkt))` para `K = 2`),
     aprendida en walk-forward estricto sobre `w ∈ {0.00, 0.05, ..., 1.00}` con contracción empírica
     `w_shrunk_raw = w_oof_opt * (n_oos / (n_oos + n0_shrinkage))` (`n0_shrinkage = 300`).
  4. Regla Rectora #4: comparación contra cierre sharp de Pinnacle sin margen y apagado automático
     (`model_picks_enabled: false` + `disabled_reason`) cuando `w_effective <= 0.05`, `p_final` no
     supera a `w = 0` (`p_mercado_sin_margen`), o no existe benchmark sharp de cierre suficiente.
  5. Holdout sellado 100% intacto (`unlock_holdout=False` obligatorio).

Reproducción:
    research/prediction-lab/.venv/Scripts/python.exe services/models/blend_calibration.py
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import shutil
import sys
import tempfile
from typing import Any, Mapping, Sequence

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")

import numpy as np
import pandas as pd
from scipy.special import ndtr, ndtri
from scipy.stats import poisson

MODELS_DIR = Path(__file__).resolve().parent
REPO_ROOT = MODELS_DIR.parents[1]
PRED_LAB_ROOT = REPO_ROOT / "research" / "prediction-lab"

for _p in (str(REPO_ROOT), str(MODELS_DIR), str(PRED_LAB_ROOT)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import backtest as bt  # noqa: E402
import clv_report  # noqa: E402

DEFAULT_ARTIFACT_JSON = MODELS_DIR / "artifacts" / "blend_weights_v3_1.json"
DEFAULT_TS_MIRROR_JSON = REPO_ROOT / "src" / "data" / "prediction" / "blend_weights_v3_1.json"

BLEND_SCHEMA_VERSION: str = "blend_weights_v3.1.0"
PROB_CLIP_EPS: float = 1e-6
DEFAULT_N0_SHRINKAGE: int = 300
BLEND_WEIGHT_STEP: float = 0.05
MAX_DISABLED_WEIGHT_THRESHOLD: float = 0.05
MIN_PAIRED_CLOSING_FOR_ENABLEMENT: int = 100
MIN_LOG_LOSS_IMPROVEMENT_TOL: float = 1e-6
MIN_OVERROUND: float = 0.9
MAX_OVERROUND: float = 1.2

CORE_DEVIG_METHODS: tuple[str, ...] = ("proportional", "power", "shin")
BLEND_WEIGHT_GRID: tuple[float, ...] = tuple(round(i * 0.05, 2) for i in range(21))

# Orden determinista de libros reales pre-decisión para estimar `p_mercado_sin_margen` en apertura
OPEN_REFERENCE_BOOKS_PRIORITY: tuple[str, ...] = (
    "pinnacle",
    "smarkets",
    "b365",
    "bw",
    "wh",
    "bf",
    "caliente",
    "codere",
)


class InvalidOddsError(ValueError):
    """Error de cuotas inválidas o fuera de rango de overround `[0.9, 1.2]`, espejo de `devig.ts`."""

    code = "invalid_odds"


class BlendValidationError(ValueError):
    """Error de validación de entradas en mezcla logit, de-vig o política de segmento."""

    code = "blend_validation_error"


# ---------------------------------------------------------------------------
# Normalización de mercados y selecciones (espejo 1:1 con `blend.ts`)
# ---------------------------------------------------------------------------

_MARKET_CANONICAL_ALIASES: dict[str, str] = {
    "1x2": "1x2",
    "h2h_3way": "1x2",
    "match_odds": "1x2",
    "3way": "1x2",
    "moneyline": "moneyline",
    "ml": "moneyline",
    "h2h": "moneyline",
    "h2h_2way": "moneyline",
    "2way": "moneyline",
    "ah": "ah",
    "asian_handicap": "ah",
    "ou": "ou",
    "totals": "totals",
    "total": "totals",
    "over_under": "totals",
    "ou_2_5": "totals",
    "btts": "btts",
    "both_teams_to_score": "btts",
    "dnb": "dnb",
    "draw_no_bet": "dnb",
    "spread": "spread",
    "point_spread": "spread",
    "handicap": "spread",
}

_MARKET_SELECTIONS_MAP: dict[str, tuple[str, ...]] = {
    "1x2": ("home", "draw", "away"),
    "moneyline": ("home", "away"),
    "ah": ("home", "away"),
    "spread": ("home", "away"),
    "dnb": ("home", "away"),
    "totals": ("over", "under"),
    "ou": ("over", "under"),
    "btts": ("yes", "no"),
}


def canonicalize_blend_market(market: str) -> str:
    if not isinstance(market, str) or not market.strip():
        raise BlendValidationError(f"mercado inválido o vacío: {market!r}")
    mapped = _MARKET_CANONICAL_ALIASES.get(market.strip().lower())
    if mapped is None:
        raise BlendValidationError(f'mercado no soportado en blend/de-vig: "{market}"')
    return mapped


def normalize_artifact_market_key(market: str) -> str:
    canon = canonicalize_blend_market(market)
    return "totals" if canon == "ou" else canon


def format_segment_key(league: str, market: str) -> str:
    if not isinstance(league, str) or not league.strip():
        raise BlendValidationError("league no puede ser vacío")
    return f"{league.strip()}::{normalize_artifact_market_key(market)}"


def is_three_way_market(market: str) -> bool:
    return canonicalize_blend_market(market) == "1x2"


def get_market_selections(market: str) -> tuple[str, ...]:
    return _MARKET_SELECTIONS_MAP[canonicalize_blend_market(market)]


def _assert_core_devig_method(method: str) -> str:
    if method not in CORE_DEVIG_METHODS:
        raise BlendValidationError(
            f'método de de-vig inválido "{method}"; se esperaba proportional | power | shin'
        )
    return method


# ---------------------------------------------------------------------------
# Métodos puros de de-vig (`proportional`, `power`, `shin`) espejo de `devig.ts`
# ---------------------------------------------------------------------------


def overround_from_odds(odds: Sequence[float]) -> float:
    total = 0.0
    for idx, raw_o in enumerate(odds):
        if isinstance(raw_o, bool) or not isinstance(raw_o, (int, float, np.floating, np.integer)):
            raise InvalidOddsError(f"cuota no numérica en índice {idx}: {raw_o!r}")
        o = float(raw_o)
        if not math.isfinite(o) or o <= 0.0:
            raise InvalidOddsError(f"cuota no positiva en el índice {idx}: {raw_o!r}")
        total += 1.0 / o
    return total - 1.0


def _validate_odds_tuple(odds: Sequence[float], expected_k: int) -> tuple[float, ...]:
    if len(odds) != expected_k:
        raise InvalidOddsError(f"se esperan exactamente {expected_k} cuotas; recibido {len(odds)}")
    cleaned: list[float] = []
    for idx, raw_o in enumerate(odds):
        if isinstance(raw_o, bool) or not isinstance(raw_o, (int, float, np.floating, np.integer)):
            raise InvalidOddsError(f"cuota inválida en el índice {idx}: {raw_o!r}")
        o = float(raw_o)
        if not math.isfinite(o) or o <= 1.0:
            raise InvalidOddsError(f"cuota inválida en el índice {idx}: {raw_o!r}")
        cleaned.append(o)
    sum_imp = sum(1.0 / o for o in cleaned)
    if sum_imp < MIN_OVERROUND or sum_imp > MAX_OVERROUND:
        raise InvalidOddsError(
            f"Σ(1/cuota) implausible ({sum_imp:.4f}); se acepta [{MIN_OVERROUND}, {MAX_OVERROUND}]"
        )
    return tuple(cleaned)


def _solve_power_core(odds: tuple[float, ...], tolerance: float = 1e-12) -> list[float]:
    q = [1.0 / o for o in odds]
    lo = 1e-6
    hi = 5.0
    alpha = 1.0
    for _ in range(200):
        alpha = 0.5 * (lo + hi)
        s = sum(qi ** alpha for qi in q)
        if abs(s - 1.0) <= tolerance:
            break
        if s > 1.0:
            lo = alpha
        else:
            hi = alpha
    p = [qi ** alpha for qi in q]
    tot = sum(p)
    return [pi / tot for pi in p]


def _solve_shin_core(odds: tuple[float, ...], tolerance: float = 1e-12) -> list[float]:
    q = [1.0 / o for o in odds]
    q_sum = sum(q)

    def probs_for(z_val: float) -> list[float]:
        denom = 2.0 * (1.0 - z_val)
        z2 = z_val * z_val
        factor = 4.0 * (1.0 - z_val) / q_sum
        return [(math.sqrt(max(z2 + factor * qi * qi, 0.0)) - z_val) / denom for qi in q]

    lo = 0.0
    hi = 0.5
    z = 0.0
    for _ in range(200):
        z = 0.5 * (lo + hi)
        s = sum(probs_for(z))
        if abs(s - 1.0) <= tolerance:
            break
        if s > 1.0:
            lo = z
        else:
            hi = z
    p = probs_for(z)
    tot = sum(p)
    if not math.isfinite(tot) or tot <= 0.0:
        raise InvalidOddsError("Shin no convergió a probabilidades válidas")
    return [pi / tot for pi in p]


def devig_3way_odds(
    odds: Sequence[float],
    method: str = "power",
    tolerance: float = 1e-12,
) -> tuple[float, float, float]:
    """De-vig de 3 vías (`1x2`) con paridad exacta (`|Δ| < 1e-9`, real `< 1e-14`) frente a `devig.ts`."""
    _assert_core_devig_method(method)
    tup = _validate_odds_tuple(odds, 3)
    if method == "proportional":
        q = [1.0 / o for o in tup]
        s = sum(q)
        return (q[0] / s, q[1] / s, q[2] / s)
    if method == "power":
        res = _solve_power_core(tup, tolerance)
        return (res[0], res[1], res[2])
    res = _solve_shin_core(tup, tolerance)
    return (res[0], res[1], res[2])


def devig_2way_odds(
    odds_primary: float,
    odds_opposite: float,
    method: str = "power",
    tolerance: float = 1e-12,
) -> tuple[float, float]:
    """De-vig de 2 vías (`moneyline`, `ah`, `ou`/`totals`, `btts`, `dnb`, `spread`) espejo de `devig2Way`."""
    _assert_core_devig_method(method)
    tup = _validate_odds_tuple((odds_primary, odds_opposite), 2)
    if method == "proportional":
        q0 = 1.0 / tup[0]
        q1 = 1.0 / tup[1]
        s = q0 + q1
        return (q0 / s, q1 / s)
    if method == "power":
        res = _solve_power_core(tup, tolerance)
        return (res[0], res[1])
    res = _solve_shin_core(tup, tolerance)
    return (res[0], res[1])


def _extract_ordered_values(
    values: Sequence[float] | Mapping[str, float],
    market: str,
    label: str,
) -> list[float]:
    sels = get_market_selections(market)
    if isinstance(values, Mapping):
        out: list[float] = []
        for s in sels:
            if s not in values:
                raise BlendValidationError(f'{label}: falta la selección "{s}" para mercado "{market}"')
            out.append(float(values[s]))
        return out
    if isinstance(values, (list, tuple, np.ndarray)):
        if len(values) != len(sels):
            raise BlendValidationError(
                f'{label}: se esperaban {len(sels)} valores para mercado "{market}", recibido {len(values)}'
            )
        return [float(v) for v in values]
    raise BlendValidationError(f"{label}: formato de entrada inválido")


def devig_market_odds(
    odds: Sequence[float] | Mapping[str, float],
    market: str,
    method: str = "power",
    tolerance: float = 1e-12,
) -> list[float]:
    """Desvigoriza cualquier mercado soportado de 3 o 2 vías aceptando secuencia o diccionario por selección."""
    _assert_core_devig_method(method)
    canon = canonicalize_blend_market(market)
    ordered = _extract_ordered_values(odds, canon, "odds")
    if canon == "1x2":
        return list(devig_3way_odds(ordered, method, tolerance))
    return list(devig_2way_odds(ordered[0], ordered[1], method, tolerance))


# Versiones matriciales vectorizadas idénticas bit a bit a las bisecciones escalares (`|Δ| < 1e-15`)
def _devig_matrix_proportional(odds_mat: np.ndarray) -> np.ndarray:
    q = 1.0 / odds_mat
    return q / q.sum(axis=1, keepdims=True)


def _devig_matrix_power(odds_mat: np.ndarray, tolerance: float = 1e-12) -> np.ndarray:
    n = odds_mat.shape[0]
    if n == 0:
        return np.empty_like(odds_mat, dtype=np.float64)
    q = 1.0 / odds_mat
    lo = np.full(n, 1e-6, dtype=np.float64)
    hi = np.full(n, 5.0, dtype=np.float64)
    alpha = np.ones(n, dtype=np.float64)
    active = np.ones(n, dtype=bool)
    for _ in range(200):
        alpha = np.where(active, 0.5 * (lo + hi), alpha)
        s = (q ** alpha[:, None]).sum(axis=1)
        done = np.abs(s - 1.0) <= tolerance
        active &= ~done
        if not np.any(active):
            break
        gt = active & (s > 1.0)
        le = active & (s <= 1.0)
        lo = np.where(gt, alpha, lo)
        hi = np.where(le, alpha, hi)
    p = q ** alpha[:, None]
    return p / p.sum(axis=1, keepdims=True)


def _devig_matrix_shin(odds_mat: np.ndarray, tolerance: float = 1e-12) -> np.ndarray:
    n = odds_mat.shape[0]
    if n == 0:
        return np.empty_like(odds_mat, dtype=np.float64)
    q = 1.0 / odds_mat
    q2 = q * q
    q_sum = q.sum(axis=1, keepdims=True)
    lo = np.zeros(n, dtype=np.float64)
    hi = np.full(n, 0.5, dtype=np.float64)
    z = np.zeros(n, dtype=np.float64)
    active = np.ones(n, dtype=bool)
    for _ in range(200):
        z = np.where(active, 0.5 * (lo + hi), z)
        zc = z[:, None]
        inside = np.maximum(zc * zc + (4.0 * (1.0 - zc) * q2) / q_sum, 0.0)
        p_z = (np.sqrt(inside) - zc) / (2.0 * (1.0 - zc))
        s = p_z.sum(axis=1)
        done = np.abs(s - 1.0) <= tolerance
        active &= ~done
        if not np.any(active):
            break
        gt = active & (s > 1.0)
        le = active & (s <= 1.0)
        lo = np.where(gt, z, lo)
        hi = np.where(le, z, hi)
    zc = z[:, None]
    inside = np.maximum(zc * zc + (4.0 * (1.0 - zc) * q2) / q_sum, 0.0)
    p = (np.sqrt(inside) - zc) / (2.0 * (1.0 - zc))
    return p / p.sum(axis=1, keepdims=True)


# ---------------------------------------------------------------------------
# Mezcla en espacio logit (`p_final`) con paridad exacta TS ↔ Python (`|Δ| < 1e-12`)
# ---------------------------------------------------------------------------


def clip_probability(p: float, eps: float = PROB_CLIP_EPS) -> float:
    if isinstance(p, bool) or not isinstance(p, (int, float, np.floating, np.integer)):
        raise BlendValidationError(f"probabilidad no numérica: {p!r}")
    fp = float(p)
    if not math.isfinite(fp):
        raise BlendValidationError(f"probabilidad no finita: {p!r}")
    if not (0.0 < eps < 0.5):
        raise BlendValidationError(f"eps de recorte inválido: {eps!r}")
    return min(1.0 - eps, max(eps, fp))


def logit_clipped(p: float, eps: float = PROB_CLIP_EPS) -> float:
    pc = clip_probability(p, eps)
    return math.log(pc) - math.log(1.0 - pc)


def sigmoid(z: float) -> float:
    if isinstance(z, bool) or not isinstance(z, (int, float, np.floating, np.integer)):
        raise BlendValidationError(f"argumento no numérico en sigmoid: {z!r}")
    fz = float(z)
    if not math.isfinite(fz):
        raise BlendValidationError(f"argumento no finito en sigmoid: {z!r}")
    if fz >= 0.0:
        ez = math.exp(-fz)
        return 1.0 / (1.0 + ez)
    ez = math.exp(fz)
    return ez / (1.0 + ez)


def _validate_blend_weight(w: float) -> float:
    if isinstance(w, bool) or not isinstance(w, (int, float, np.floating, np.integer)):
        raise BlendValidationError(f"peso w no numérico: {w!r}")
    fw = float(w)
    if not math.isfinite(fw) or fw < -1e-12 or fw > 1.0 + 1e-12:
        raise BlendValidationError(f"peso de mezcla w fuera de [0, 1]: {w!r}")
    if fw <= 0.0:
        return 0.0
    if fw >= 1.0:
        return 1.0
    return fw


def _validate_simplex_vector(probs: Sequence[float], label: str) -> list[float]:
    if not isinstance(probs, (list, tuple, np.ndarray)) or len(probs) not in (2, 3):
        raise BlendValidationError(f"{label}: se esperaban 2 o 3 probabilidades")
    out: list[float] = []
    for idx, raw_v in enumerate(probs):
        if isinstance(raw_v, bool) or not isinstance(raw_v, (int, float, np.floating, np.integer)):
            raise BlendValidationError(f"{label}[{idx}] inválido: {raw_v!r}")
        fv = float(raw_v)
        if not math.isfinite(fv) or fv < -1e-9 or fv > 1.0 + 1e-9:
            raise BlendValidationError(f"{label}[{idx}] inválido: {raw_v!r}")
        out.append(fv)
    tot = sum(out)
    if abs(tot - 1.0) > 1e-3:
        raise BlendValidationError(f"{label}: las probabilidades deben sumar 1 (suma recibida = {tot:.6f})")
    if abs(tot - 1.0) > 1e-14:
        return [max(0.0, v) / tot for v in out]
    return out


def blend_logit_2way(
    p_model_primary: float,
    p_market_novig_primary: float,
    w: float,
    eps: float = PROB_CLIP_EPS,
) -> tuple[float, float]:
    """Mezcla binaria (2 vías): `p_final = σ(w · logit(p_modelo) + (1 - w) · logit(p_mercado_sin_margen))`."""
    weight = _validate_blend_weight(w)
    for lbl, val in (("p_model_primary", p_model_primary), ("p_market_novig_primary", p_market_novig_primary)):
        if isinstance(val, bool) or not math.isfinite(float(val)) or float(val) < -1e-9 or float(val) > 1.0 + 1e-9:
            raise BlendValidationError(f"{lbl} fuera de [0, 1]: {val!r}")
    z = weight * logit_clipped(float(p_model_primary), eps) + (1.0 - weight) * logit_clipped(
        float(p_market_novig_primary), eps
    )
    p0 = sigmoid(z)
    return (p0, 1.0 - p0)


def blend_logit_probs(
    model_probs: Sequence[float],
    market_novig_probs: Sequence[float],
    w: float,
    eps: float = PROB_CLIP_EPS,
) -> list[float]:
    """Fórmula unificada de mezcla en espacio logit para `K = 2` y `K = 3`:
      `u_k = σ(w · logit(p_modelo_k) + (1 - w) · logit(p_mercado_sin_margen_k))`
      `p_final_k = u_k / sum_j(u_j)`
    """
    weight = _validate_blend_weight(w)
    p_mod = _validate_simplex_vector(model_probs, "model_probs")
    p_mkt = _validate_simplex_vector(market_novig_probs, "market_novig_probs")
    if len(p_mod) != len(p_mkt):
        raise BlendValidationError(
            f"dimensiones incompatibles en blend_logit_probs: model={len(p_mod)}, market={len(p_mkt)}"
        )
    u = [
        sigmoid(weight * logit_clipped(pm, eps) + (1.0 - weight) * logit_clipped(pk, eps))
        for pm, pk in zip(p_mod, p_mkt)
    ]
    tot = sum(u)
    return [uk / tot for uk in u]


def blend_logit_3way(
    model_probs: Sequence[float],
    market_novig_probs: Sequence[float],
    w: float,
    eps: float = PROB_CLIP_EPS,
) -> tuple[float, float, float]:
    if len(model_probs) != 3 or len(market_novig_probs) != 3:
        raise BlendValidationError("blend_logit_3way requiere vectores de longitud 3 (home, draw, away)")
    res = blend_logit_probs(model_probs, market_novig_probs, w, eps)
    return (res[0], res[1], res[2])


def _blend_logit_matrix(
    p_model_mat: np.ndarray,
    p_mkt_mat: np.ndarray,
    w: float,
    eps: float = PROB_CLIP_EPS,
) -> np.ndarray:
    """Versión matricial vectorizada idéntica a `blend_logit_probs` (`|Δ| < 1e-15`)."""
    pm = np.clip(p_model_mat, eps, 1.0 - eps)
    pk = np.clip(p_mkt_mat, eps, 1.0 - eps)
    lm = np.log(pm) - np.log(1.0 - pm)
    lk = np.log(pk) - np.log(1.0 - pk)
    a = float(w) * lm + (1.0 - float(w)) * lk
    u = np.where(a >= 0.0, 1.0 / (1.0 + np.exp(-a)), np.exp(a) / (1.0 + np.exp(a)))
    return u / u.sum(axis=1, keepdims=True)


# ---------------------------------------------------------------------------
# Contracción empírica (`n0_shrinkage = 300`), cuantización y Regla Rectora #4
# ---------------------------------------------------------------------------


def round_weight_to_step(value: float, step: float = BLEND_WEIGHT_STEP) -> float:
    w = _validate_blend_weight(value)
    if not (0.0 < step <= 1.0):
        raise BlendValidationError(f"step inválido en round_weight_to_step: {step!r}")
    steps_count = math.floor(w / step + 0.5 + 1e-12)
    rounded = min(1.0, max(0.0, steps_count * step))
    return round(rounded, 6)


def shrink_blend_weight(
    w_oof_opt: float,
    n_oos: int | float,
    n0_shrinkage: float = DEFAULT_N0_SHRINKAGE,
    round_step: float | None = BLEND_WEIGHT_STEP,
) -> dict[str, float]:
    w_opt = _validate_blend_weight(w_oof_opt)
    if isinstance(n_oos, bool) or not math.isfinite(float(n_oos)) or float(n_oos) < 0.0:
        raise BlendValidationError(f"n_oos inválido: {n_oos!r}")
    if isinstance(n0_shrinkage, bool) or not math.isfinite(float(n0_shrinkage)) or float(n0_shrinkage) <= 0.0:
        raise BlendValidationError(f"n0_shrinkage inválido: {n0_shrinkage!r}")
    n_f = float(n_oos)
    if n_f == 0.0 or w_opt == 0.0:
        return {"w_shrunk_raw": 0.0, "w_effective": 0.0}
    w_shrunk_raw = w_opt * (n_f / (n_f + float(n0_shrinkage)))
    w_effective = round_weight_to_step(w_shrunk_raw, round_step) if round_step is not None else w_shrunk_raw
    return {
        "w_shrunk_raw": float(w_shrunk_raw),
        "w_effective": float(w_effective),
    }


def evaluate_model_picks_gate(
    *,
    w_effective: float,
    closing_benchmark_available: bool,
    n_events_paired_closing: int,
    log_loss_blend: float | None,
    log_loss_market_open_novig: float | None,
    log_loss_blend_wf_causal: float | None = None,
    min_paired_closing: int = MIN_PAIRED_CLOSING_FOR_ENABLEMENT,
    max_disabled_weight: float = MAX_DISABLED_WEIGHT_THRESHOLD,
    min_ll_improvement: float = MIN_LOG_LOSS_IMPROVEMENT_TOL,
) -> dict[str, Any]:
    """Regla Rectora #4 idéntica entre Python y TypeScript."""
    if not closing_benchmark_available or int(n_events_paired_closing) < int(min_paired_closing):
        return {
            "model_picks_enabled": False,
            "disabled_reason": "insufficient_sharp_closing_benchmark",
        }
    if not math.isfinite(float(w_effective)) or float(w_effective) <= float(max_disabled_weight) + 1e-12:
        return {
            "model_picks_enabled": False,
            "disabled_reason": "model_weight_near_zero_w_le_0_05",
        }
    if (
        log_loss_blend is None
        or log_loss_market_open_novig is None
        or not math.isfinite(float(log_loss_blend))
        or not math.isfinite(float(log_loss_market_open_novig))
        or not (float(log_loss_blend) < float(log_loss_market_open_novig) - float(min_ll_improvement))
    ):
        return {
            "model_picks_enabled": False,
            "disabled_reason": "blend_does_not_beat_open_market_novig",
        }
    if (
        log_loss_blend_wf_causal is not None
        and math.isfinite(float(log_loss_blend_wf_causal))
        and not (float(log_loss_blend_wf_causal) < float(log_loss_market_open_novig) - float(min_ll_improvement))
    ):
        return {
            "model_picks_enabled": False,
            "disabled_reason": "walk_forward_causal_blend_does_not_beat_open_market_novig",
        }
    return {
        "model_picks_enabled": True,
        "disabled_reason": None,
    }


# ---------------------------------------------------------------------------
# Bootstrap pareado determinista (`mulberry32` + Type-7, paridad `< 1e-12` con TS)
# ---------------------------------------------------------------------------


def categorical_log_loss(probs: Sequence[float], outcome_index: int) -> float:
    if isinstance(outcome_index, bool) or not isinstance(outcome_index, (int, np.integer)):
        raise BlendValidationError(f"outcome_index inválido: {outcome_index!r}")
    idx = int(outcome_index)
    if idx < 0 or idx >= len(probs):
        raise BlendValidationError(f"outcome_index ({idx}) fuera de rango para K={len(probs)}")
    p_norm = _validate_simplex_vector(probs, "probs")
    p_chosen = min(1.0, max(1e-15, p_norm[idx]))
    return -math.log(p_chosen)


def _matrix_log_loss_vec(probs_mat: np.ndarray, y_vec: np.ndarray) -> np.ndarray:
    p_norm = probs_mat / np.maximum(1e-15, probs_mat.sum(axis=1, keepdims=True))
    chosen = np.clip(p_norm[np.arange(len(y_vec)), y_vec], 1e-15, 1.0)
    return -np.log(chosen)


def _matrix_brier_vec(probs_mat: np.ndarray, y_vec: np.ndarray) -> np.ndarray:
    p_norm = probs_mat / np.maximum(1e-15, probs_mat.sum(axis=1, keepdims=True))
    oh = np.zeros_like(p_norm)
    oh[np.arange(len(y_vec)), y_vec] = 1.0
    return np.sum((p_norm - oh) ** 2, axis=1)


def bootstrap_mean_ci(
    values: Sequence[float] | np.ndarray,
    *,
    n_resamples: int = 1000,
    seed: int = 42,
    ci_level: float = 0.95,
) -> dict[str, Any]:
    if int(n_resamples) < 1000:
        raise BlendValidationError(f"n_resamples debe ser >= 1000; recibido {n_resamples}")
    arr = np.asarray(values, dtype=np.float64)
    n = int(arr.shape[0])
    if n == 0:
        return {
            "n": 0,
            "mean": None,
            "ci95": None,
            "significant": False,
            "significance_label": "no significativa",
        }
    if not np.all(np.isfinite(arr)):
        raise BlendValidationError("valores no finitos en bootstrap_mean_ci")

    unifs = clv_report.mulberry32_uniforms(int(seed), int(n_resamples) * n)
    idx = np.floor(unifs * n).astype(np.int64).reshape(int(n_resamples), n)
    boot_means = np.sort(arr[idx].mean(axis=1))

    alpha_half = 0.5 * (1.0 - float(ci_level))
    lo = clv_report.quantile_linear_sorted(boot_means, alpha_half)
    hi = clv_report.quantile_linear_sorted(boot_means, 1.0 - alpha_half)
    sig = bool(lo > 0.0 or hi < 0.0)
    return {
        "n": n,
        "mean": float(arr.mean()),
        "ci95": [float(lo), float(hi)],
        "significant": sig,
        "significance_label": "significativa" if sig else "no significativa",
    }


def bootstrap_paired_loss_delta(
    loss_a: Sequence[float] | np.ndarray,
    loss_b: Sequence[float] | np.ndarray,
    *,
    n_resamples: int = 1000,
    seed: int = 42,
    ci_level: float = 0.95,
) -> dict[str, Any]:
    """Bootstrap pareado determinista `mulberry32` idéntico (`|Δ| < 1e-12`) a `bootstrapPairedLossDelta` en TS."""
    arr_a = np.asarray(loss_a, dtype=np.float64)
    arr_b = np.asarray(loss_b, dtype=np.float64)
    if arr_a.shape != arr_b.shape:
        raise BlendValidationError(
            f"bootstrap_paired_loss_delta requiere igual longitud ({arr_a.shape} vs {arr_b.shape})"
        )
    if int(n_resamples) < 1000:
        raise BlendValidationError(f"n_resamples debe ser >= 1000; recibido {n_resamples}")
    n = int(arr_a.shape[0])
    if n == 0:
        return {
            "n": 0,
            "mean_a": None,
            "mean_b": None,
            "delta_mean": None,
            "ci95": None,
            "significant": False,
            "significance_label": "no significativa",
        }
    if not (np.all(np.isfinite(arr_a)) and np.all(np.isfinite(arr_b))):
        raise BlendValidationError("valor no finito en bootstrap_paired_loss_delta")

    deltas = arr_a - arr_b
    res = bootstrap_mean_ci(deltas, n_resamples=n_resamples, seed=seed, ci_level=ci_level)
    return {
        "n": n,
        "mean_a": float(arr_a.mean()),
        "mean_b": float(arr_b.mean()),
        "delta_mean": float(deltas.mean()),
        "ci95": res["ci95"],
        "significant": res["significant"],
        "significance_label": res["significance_label"],
    }


# ---------------------------------------------------------------------------
# Consumo de `blend_weights_v3_1.json` desde Python (espejo de `blend.ts`)
# ---------------------------------------------------------------------------


def resolve_blend_segment(
    artifact: Mapping[str, Any],
    league: str,
    market: str,
) -> dict[str, Any]:
    norm_mkt = normalize_artifact_market_key(market)
    segments = artifact.get("segments") or {}
    exact_key = f"{league.strip()}::{norm_mkt}"
    if exact_key in segments:
        return {"key": exact_key, "found": True, "entry": segments[exact_key]}
    upper_key = f"{league.strip().upper()}::{norm_mkt}"
    if upper_key in segments:
        return {"key": upper_key, "found": True, "entry": segments[upper_key]}

    empty_m = {
        "log_loss": None,
        "log_loss_ci95": None,
        "brier": None,
        "delta_log_loss_vs_proportional": None,
        "delta_vs_proportional_ci95": None,
        "significant_vs_proportional": False,
        "significance_vs_proportional": "no significativa",
    }
    return {
        "key": exact_key,
        "found": False,
        "entry": {
            "league": league.strip(),
            "market": norm_mkt,
            "n_events_dev": 0,
            "n_events_paired_closing": 0,
            "closing_benchmark_available": False,
            "best_devig_method": "power",
            "devig_comparison": {
                "n_events_evaluated": 0,
                "best_method": "power",
                "walk_forward_causal_log_loss": None,
                "best_vs_proportional_delta_log_loss": None,
                "best_vs_proportional_ci95": None,
                "best_vs_proportional_significant": False,
                "best_vs_proportional_significance": "no significativa",
                "proportional": empty_m,
                "power": empty_m,
                "shin": empty_m,
            },
            "w_raw_opt": 0.0,
            "w_shrunk_raw": 0.0,
            "w_effective": 0.0,
            "log_loss_model": None,
            "log_loss_market_open_novig": None,
            "log_loss_blend": None,
            "log_loss_closing_novig": None,
            "delta_blend_vs_closing": None,
            "delta_blend_vs_closing_ci95": None,
            "delta_blend_vs_closing_significant": False,
            "delta_blend_vs_open_novig": None,
            "delta_blend_vs_open_novig_ci95": None,
            "model_picks_enabled": False,
            "disabled_reason": "unseen_segment_in_walk_forward_dev",
        },
    }


def compute_segment_blended_probs(
    *,
    artifact: Mapping[str, Any],
    league: str,
    market: str,
    model_probs: Sequence[float] | Mapping[str, float],
    market_novig_probs: Sequence[float] | Mapping[str, float] | None = None,
    market_raw_odds: Sequence[float] | Mapping[str, float] | None = None,
    override_weight: float | None = None,
    override_devig_method: str | None = None,
) -> dict[str, Any]:
    canon_mkt = canonicalize_blend_market(market)
    selections = get_market_selections(canon_mkt)
    resolved = resolve_blend_segment(artifact, league, canon_mkt)
    seg = resolved["entry"]

    devig_method = override_devig_method if override_devig_method is not None else str(seg["best_devig_method"])
    _assert_core_devig_method(devig_method)
    w_eff = _validate_blend_weight(override_weight) if override_weight is not None else float(seg["w_effective"])

    p_model = _validate_simplex_vector(_extract_ordered_values(model_probs, canon_mkt, "model_probs"), "model_probs")
    if market_novig_probs is not None:
        p_mkt = _validate_simplex_vector(
            _extract_ordered_values(market_novig_probs, canon_mkt, "market_novig_probs"),
            "market_novig_probs",
        )
    elif market_raw_odds is not None:
        p_mkt = devig_market_odds(market_raw_odds, canon_mkt, devig_method)
    else:
        raise BlendValidationError("compute_segment_blended_probs requiere market_novig_probs o market_raw_odds")

    eps = float(artifact.get("prob_clip_eps", PROB_CLIP_EPS))
    p_final = blend_logit_probs(p_model, p_mkt, w_eff, eps)

    return {
        "segment_key": resolved["key"],
        "segment_found": resolved["found"],
        "league": seg["league"],
        "market": canon_mkt,
        "selections": selections,
        "devig_method": devig_method,
        "w_effective": w_eff,
        "p_model": tuple(p_model),
        "p_market_novig": tuple(p_mkt),
        "p_final": tuple(p_final),
        "probabilities_by_selection": {s: p_final[i] for i, s in enumerate(selections)},
        "model_probs_by_selection": {s: p_model[i] for i, s in enumerate(selections)},
        "market_novig_by_selection": {s: p_mkt[i] for i, s in enumerate(selections)},
        "model_picks_enabled": bool(seg["model_picks_enabled"]),
        "disabled_reason": seg["disabled_reason"],
    }


# ---------------------------------------------------------------------------
# Modelos secundarios estrictamente causales (`ah`, `totals`, `spread`) sobre `walk_forward_dev`
# ---------------------------------------------------------------------------


def _dixon_coles_bivariate_probs_for_lines(
    lam_home: np.ndarray,
    lam_away: np.ndarray,
    lines: np.ndarray,
    market: str,
    rho: float = -0.08,
    max_goals: int = 12,
) -> np.ndarray:
    """Calcula `(p_primary, p_opposite)` exactas condicionales a no-push sobre rejilla `0..max_goals`
    usando únicamente `dc_lam_home` y `dc_lam_away` online estrictamente pre-partido."""
    n = len(lam_home)
    out = np.full((n, 2), 0.5, dtype=np.float64)
    if n == 0:
        return out

    lh = np.clip(np.asarray(lam_home, dtype=np.float64), 0.05, 8.0)
    la = np.clip(np.asarray(lam_away, dtype=np.float64), 0.05, 8.0)
    ln_arr = np.asarray(lines, dtype=np.float64)

    g = np.arange(max_goals + 1, dtype=np.int64)
    pmf_h = poisson.pmf(g[None, :], lh[:, None])  # (N, G)
    pmf_a = poisson.pmf(g[None, :], la[:, None])  # (N, G)
    mat = pmf_h[:, :, None] * pmf_a[:, None, :]  # (N, G, G)

    # Corrección estructural Dixon-Coles en marcadores bajos (0-0, 1-0, 0-1, 1-1)
    tau_00 = np.clip(1.0 - lh * la * rho, 0.1, 2.5)
    tau_01 = np.clip(1.0 + lh * rho, 0.1, 2.5)
    tau_10 = np.clip(1.0 + la * rho, 0.1, 2.5)
    tau_11 = np.clip(1.0 - rho, 0.1, 2.5)
    mat[:, 0, 0] *= tau_00
    mat[:, 0, 1] *= tau_01
    mat[:, 1, 0] *= tau_10
    mat[:, 1, 1] *= tau_11
    mat /= np.maximum(1e-15, mat.sum(axis=(1, 2), keepdims=True))

    gh_grid = g[None, :, None].astype(np.float64)
    ga_grid = g[None, None, :].astype(np.float64)

    if market == "totals":
        diff = (gh_grid + ga_grid) - ln_arr[:, None, None]
    elif market == "ah":
        diff = (gh_grid - ga_grid) + ln_arr[:, None, None]
    else:
        raise ValueError(f"mercado no soportado en _dixon_coles_bivariate_probs_for_lines: {market}")

    p_pos = np.sum(np.where(diff > 1e-9, mat, 0.0), axis=(1, 2))
    p_neg = np.sum(np.where(diff < -1e-9, mat, 0.0), axis=(1, 2))
    denom = np.maximum(1e-12, p_pos + p_neg)
    p0 = np.clip(p_pos / denom, 1e-6, 1.0 - 1e-6)
    out[:, 0] = p0
    out[:, 1] = 1.0 - p0
    return out


def _fit_predict_nfl_spread_totals_walk_forward(
    nfl_dev_df: pd.DataFrame,
    nfl_market_rows: pd.DataFrame,
    market: str,
) -> np.ndarray:
    """Predicciones 2-vías estrictamente causales (`< fold_cut_ts`) para `NFL::spread` y `NFL::totals`."""
    nfl_feats_path = PRED_LAB_ROOT / "data" / "nfl" / "processed" / "nfl_features.parquet"
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
    nf = pd.read_parquet(nfl_feats_path, columns=nf_cols).drop_duplicates("game_id")

    merged = nfl_market_rows.merge(
        nfl_dev_df[["event_id", "raw_event_id", "p_model_home", "fold_key"]],
        on="event_id",
        how="left",
    )
    merged = merged.merge(nf, left_on="raw_event_id", right_on="game_id", how="left")

    n = len(merged)
    out = np.full((n, 2), 0.5, dtype=np.float64)
    if n == 0:
        return out

    folds = merged["fold_key"].astype(str).to_numpy()
    ts_starts = merged["ts_event_start"].to_numpy()
    ts_decs = merged["ts_decision"].to_numpy()
    lines = merged["line"].to_numpy(dtype=np.float64)
    h_scores = merged["home_score"].to_numpy(dtype=np.float64)
    a_scores = merged["away_score"].to_numpy(dtype=np.float64)

    if market == "spread":
        p_ml_home = np.clip(merged["p_model_home"].to_numpy(dtype=np.float64), 1e-4, 1.0 - 1e-4)
        z_ml = ndtri(p_ml_home)
        margins = h_scores - a_scores
        for fk in sorted(np.unique(folds)):
            te_mask = folds == fk
            cut_ts = ts_decs[te_mask].min()
            tr_mask = ts_starts < cut_ts
            if int(tr_mask.sum()) >= 100:
                # Ajusta escala `sigma` minimizando residual cuadrático de `margin ≈ sigma * z_ml` solo en pasado
                z_tr = z_ml[tr_mask]
                m_tr = margins[tr_mask]
                denom_z = float(np.dot(z_tr, z_tr))
                slope = float(np.dot(z_tr, m_tr) / denom_z) if denom_z > 1e-9 else 13.5
                slope = min(20.0, max(8.0, slope))
                resid_std = float(np.std(m_tr - slope * z_tr))
                sigma = min(20.0, max(10.0, resid_std))
            else:
                slope = 13.5
                sigma = 13.5
            mu_te = slope * z_ml[te_mask]
            p_cov = np.clip(ndtr((mu_te + lines[te_mask]) / sigma), 1e-6, 1.0 - 1e-6)
            out[te_mask, 0] = p_cov
            out[te_mask, 1] = 1.0 - p_cov
        return out

    if market == "totals":
        feat_cols = [
            "f5_pf_home",
            "f5_pa_home",
            "f5_pf_away",
            "f5_pa_away",
            "is_indoor",
            "wind_outdoor",
            "cold_outdoor",
        ]
        X_raw = merged[feat_cols].apply(pd.to_numeric, errors="coerce").to_numpy(dtype=np.float64)
        totals_actual = h_scores + a_scores
        for fk in sorted(np.unique(folds)):
            te_mask = folds == fk
            cut_ts = ts_decs[te_mask].min()
            tr_mask = ts_starts < cut_ts
            if int(tr_mask.sum()) >= 150:
                X_tr = X_raw[tr_mask].copy()
                col_med = np.nanmedian(X_tr, axis=0)
                col_med = np.where(np.isfinite(col_med), col_med, 0.0)
                inds_tr = np.where(np.isnan(X_tr))
                X_tr[inds_tr] = np.take(col_med, inds_tr[1])

                X_te = X_raw[te_mask].copy()
                inds_te = np.where(np.isnan(X_te))
                X_te[inds_te] = np.take(col_med, inds_te[1])

                mu_x = X_tr.mean(axis=0)
                sd_x = np.where(X_tr.std(axis=0) > 1e-8, X_tr.std(axis=0), 1.0)
                Z_tr = (X_tr - mu_x) / sd_x
                Z_te = (X_te - mu_x) / sd_x

                y_tr = totals_actual[tr_mask]
                y_mean = float(y_tr.mean())
                # Regresión Ridge cerrada (lambda = 50.0) estrictamente sobre pasado `< fold_cut_ts`
                gram = Z_tr.T @ Z_tr + 50.0 * np.eye(Z_tr.shape[1])
                beta = np.linalg.solve(gram, Z_tr.T @ (y_tr - y_mean))
                pred_tr = y_mean + Z_tr @ beta
                sigma_tot = min(18.0, max(9.0, float(np.std(y_tr - pred_tr))))
                mu_tot_te = y_mean + Z_te @ beta
            else:
                mu_tot_te = np.full(int(te_mask.sum()), 44.5, dtype=np.float64)
                sigma_tot = 13.5
            p_over = np.clip(1.0 - ndtr((lines[te_mask] - mu_tot_te) / sigma_tot), 1e-6, 1.0 - 1e-6)
            out[te_mask, 0] = p_over
            out[te_mask, 1] = 1.0 - p_over
        return out

    raise ValueError(f"mercado NFL no soportado: {market}")


# ---------------------------------------------------------------------------
# Calibración Walk-Forward por Segmento (`league × market`) sobre `walk_forward_dev`
# ---------------------------------------------------------------------------


def calibrate_segment_walk_forward(
    *,
    league: str,
    market: str,
    sport: str,
    fold_keys: np.ndarray,
    ts_event_starts: np.ndarray,
    ts_decisions: np.ndarray,
    p_model_mat: np.ndarray,
    open_odds_mat: np.ndarray,
    has_open_quote: np.ndarray,
    closing_novig_mat: np.ndarray,
    has_sharp_closing: np.ndarray,
    outcomes_y: np.ndarray,
    open_quotes_truly_pre_close: bool,
    n0_shrinkage: int = DEFAULT_N0_SHRINKAGE,
    n_bootstrap: int = 1000,
    seed: int = 20261111,
) -> dict[str, Any]:
    """Ejecuta la comparación walk-forward de de-vig (`proportional`, `power`, `shin`),
    el aprendizaje causal de `w` sobre `0.00..1.00`, la contracción `n0=300` y la Regla Rectora #4."""
    canon_mkt = normalize_artifact_market_key(market)
    n_dev_total = int(len(outcomes_y))

    # Filtrar eventos con resultado categórico válido (`outcomes_y >= 0`, excluye pushes exactos en 2-way)
    # y cuota de mercado disponible para desvigorizar
    valid_eval_mask = (outcomes_y >= 0) & has_open_quote
    n_oos = int(valid_eval_mask.sum())

    paired_closing_mask = (outcomes_y >= 0) & has_sharp_closing
    n_paired_closing_all = int(paired_closing_mask.sum())

    if n_oos == 0:
        empty_m = {
            "log_loss": None,
            "log_loss_ci95": None,
            "brier": None,
            "delta_log_loss_vs_proportional": None,
            "delta_vs_proportional_ci95": None,
            "significant_vs_proportional": False,
            "significance_vs_proportional": "no significativa",
        }
        return {
            "league": league,
            "market": canon_mkt,
            "sport": sport,
            "n_events_dev": n_dev_total,
            "n_events_oos_evaluated": 0,
            "n_events_paired_closing": n_paired_closing_all,
            "closing_benchmark_available": bool(n_paired_closing_all >= MIN_PAIRED_CLOSING_FOR_ENABLEMENT),
            "open_quotes_available": bool(open_quotes_truly_pre_close),
            "best_devig_method": "power",
            "devig_comparison": {
                "n_events_evaluated": 0,
                "best_method": "power",
                "walk_forward_causal_log_loss": None,
                "best_vs_proportional_delta_log_loss": None,
                "best_vs_proportional_ci95": None,
                "best_vs_proportional_significant": False,
                "best_vs_proportional_significance": "no significativa",
                "proportional": empty_m,
                "power": empty_m,
                "shin": empty_m,
            },
            "w_raw_opt": 0.0,
            "w_shrunk_raw": 0.0,
            "w_effective": 0.0,
            "log_loss_model": None,
            "log_loss_market_open_novig": None,
            "log_loss_blend": None,
            "log_loss_blend_wf_causal": None,
            "log_loss_closing_novig": None,
            "delta_blend_vs_closing": None,
            "delta_blend_vs_closing_ci95": None,
            "delta_blend_vs_closing_significant": False,
            "delta_blend_vs_closing_significance": "no significativa",
            "delta_blend_vs_open_novig": None,
            "delta_blend_vs_open_novig_ci95": None,
            "delta_blend_vs_open_novig_significant": False,
            "delta_blend_vs_open_novig_significance": "no significativa",
            "model_picks_enabled": False,
            "disabled_reason": "no_evaluable_market_quotes_in_dev",
        }

    f_keys = fold_keys[valid_eval_mask]
    ts_st = ts_event_starts[valid_eval_mask]
    ts_dc = ts_decisions[valid_eval_mask]
    p_mod = p_model_mat[valid_eval_mask]
    o_open = open_odds_mat[valid_eval_mask]
    y_ev = outcomes_y[valid_eval_mask].astype(np.int64)
    has_cl = has_sharp_closing[valid_eval_mask]
    p_cl = closing_novig_mat[valid_eval_mask]

    # 1. Calcular los 3 métodos de de-vig fuera de muestra (`proportional`, `power`, `shin`)
    devig_probs: dict[str, np.ndarray] = {
        "proportional": _devig_matrix_proportional(o_open),
        "power": _devig_matrix_power(o_open),
        "shin": _devig_matrix_shin(o_open),
    }
    devig_ll: dict[str, np.ndarray] = {m: _matrix_log_loss_vec(devig_probs[m], y_ev) for m in CORE_DEVIG_METHODS}
    devig_br: dict[str, np.ndarray] = {m: _matrix_brier_vec(devig_probs[m], y_ev) for m in CORE_DEVIG_METHODS}

    # Selección walk-forward causal por pliegue (`< fold_cut_ts`) del método de-vig y del peso `w`
    unique_folds = sorted(np.unique(f_keys))
    wf_devig_ll = np.empty(n_oos, dtype=np.float64)
    wf_blend_probs = np.empty_like(p_mod, dtype=np.float64)

    for fk in unique_folds:
        te_idx = f_keys == fk
        fold_cut_ts = ts_dc[te_idx].min()
        tr_idx = ts_st < fold_cut_ts
        n_tr = int(tr_idx.sum())

        if n_tr > 0:
            best_m_past = min(CORE_DEVIG_METHODS, key=lambda m: float(devig_ll[m][tr_idx].mean()))
            # Buscar `w` óptimo sobre la rejilla `0.00..1.00` exclusivamente con datos pasados `< fold_cut_ts`
            p_mod_tr = p_mod[tr_idx]
            p_mkt_tr = devig_probs[best_m_past][tr_idx]
            y_tr = y_ev[tr_idx]
            best_w_past = 0.0
            best_ll_past = float("inf")
            for w_cand in BLEND_WEIGHT_GRID:
                ll_cand = float(_matrix_log_loss_vec(_blend_logit_matrix(p_mod_tr, p_mkt_tr, w_cand), y_tr).mean())
                if ll_cand < best_ll_past - 1e-12:
                    best_ll_past = ll_cand
                    best_w_past = w_cand
            w_fold_eff = shrink_blend_weight(best_w_past, n_tr, n0_shrinkage, BLEND_WEIGHT_STEP)["w_effective"]
        else:
            best_m_past = "power"
            w_fold_eff = 0.0

        wf_devig_ll[te_idx] = devig_ll[best_m_past][te_idx]
        wf_blend_probs[te_idx] = _blend_logit_matrix(p_mod[te_idx], devig_probs[best_m_past][te_idx], w_fold_eff)

    # Mejor método de de-vig sobre `walk_forward_dev` completo + IC 95% bootstrap contra `proportional`
    best_devig_method = min(CORE_DEVIG_METHODS, key=lambda m: float(devig_ll[m].mean()))
    devig_comp_entries: dict[str, Any] = {}
    for idx_m, m_name in enumerate(CORE_DEVIG_METHODS):
        ll_ci = bootstrap_mean_ci(devig_ll[m_name], n_resamples=n_bootstrap, seed=seed + 11 + idx_m)
        if m_name == "proportional":
            devig_comp_entries[m_name] = {
                "log_loss": float(devig_ll[m_name].mean()),
                "log_loss_ci95": ll_ci["ci95"],
                "brier": float(devig_br[m_name].mean()),
                "delta_log_loss_vs_proportional": 0.0,
                "delta_vs_proportional_ci95": [0.0, 0.0],
                "significant_vs_proportional": False,
                "significance_vs_proportional": "no significativa",
            }
        else:
            paired_m = bootstrap_paired_loss_delta(
                devig_ll[m_name],
                devig_ll["proportional"],
                n_resamples=n_bootstrap,
                seed=seed + 29 + idx_m,
            )
            devig_comp_entries[m_name] = {
                "log_loss": float(devig_ll[m_name].mean()),
                "log_loss_ci95": ll_ci["ci95"],
                "brier": float(devig_br[m_name].mean()),
                "delta_log_loss_vs_proportional": paired_m["delta_mean"],
                "delta_vs_proportional_ci95": paired_m["ci95"],
                "significant_vs_proportional": paired_m["significant"],
                "significance_vs_proportional": paired_m["significance_label"],
            }

    best_entry = devig_comp_entries[best_devig_method]
    devig_comparison = {
        "n_events_evaluated": n_oos,
        "best_method": best_devig_method,
        "walk_forward_causal_log_loss": float(wf_devig_ll.mean()),
        "best_vs_proportional_delta_log_loss": best_entry["delta_log_loss_vs_proportional"],
        "best_vs_proportional_ci95": best_entry["delta_vs_proportional_ci95"],
        "best_vs_proportional_significant": best_entry["significant_vs_proportional"],
        "best_vs_proportional_significance": best_entry["significance_vs_proportional"],
        "proportional": devig_comp_entries["proportional"],
        "power": devig_comp_entries["power"],
        "shin": devig_comp_entries["shin"],
    }

    # 2. Aprendizaje de `w` sobre las predicciones OOF de `walk_forward_dev` usando `best_devig_method`
    p_mkt_best = devig_probs[best_devig_method]
    ll_open_novig_vec = devig_ll[best_devig_method]
    ll_model_vec = _matrix_log_loss_vec(p_mod, y_ev)

    w_raw_opt = 0.0
    min_oof_ll = float(ll_open_novig_vec.mean())
    for w_cand in BLEND_WEIGHT_GRID:
        if w_cand == 0.0:
            continue
        ll_cand = float(_matrix_log_loss_vec(_blend_logit_matrix(p_mod, p_mkt_best, w_cand), y_ev).mean())
        if ll_cand < min_oof_ll - 1e-12:
            min_oof_ll = ll_cand
            w_raw_opt = w_cand

    shrunk_info = shrink_blend_weight(w_raw_opt, n_oos, n0_shrinkage, BLEND_WEIGHT_STEP)
    w_shrunk_raw = shrunk_info["w_shrunk_raw"]
    w_effective = shrunk_info["w_effective"]

    p_blend_eff = p_mkt_best.copy() if w_effective == 0.0 else _blend_logit_matrix(p_mod, p_mkt_best, w_effective)
    ll_blend_vec = _matrix_log_loss_vec(p_blend_eff, y_ev)
    ll_blend_wf_causal_vec = _matrix_log_loss_vec(wf_blend_probs, y_ev)

    paired_vs_open = bootstrap_paired_loss_delta(
        ll_blend_vec,
        ll_open_novig_vec,
        n_resamples=n_bootstrap,
        seed=seed + 71,
    )

    # 3. Benchmark contra cuota de cierre sharp de Pinnacle sin margen (`closing_novig`)
    n_paired_ev = int(has_cl.sum())
    closing_benchmark_available = bool(n_paired_ev >= MIN_PAIRED_CLOSING_FOR_ENABLEMENT)

    if n_paired_ev > 0:
        y_cl = y_ev[has_cl]
        ll_cl_vec = _matrix_log_loss_vec(p_cl[has_cl], y_cl)
        ll_bl_cl_vec = ll_blend_vec[has_cl]
        ll_md_cl_vec = ll_model_vec[has_cl]

        paired_vs_closing = bootstrap_paired_loss_delta(
            ll_bl_cl_vec,
            ll_cl_vec,
            n_resamples=n_bootstrap,
            seed=seed + 113,
        )
        paired_mod_vs_closing = bootstrap_paired_loss_delta(
            ll_md_cl_vec,
            ll_cl_vec,
            n_resamples=n_bootstrap,
            seed=seed + 149,
        )
        log_loss_closing_novig: float | None = float(ll_cl_vec.mean())
        log_loss_model_paired: float | None = float(ll_md_cl_vec.mean())
        log_loss_blend_paired: float | None = float(ll_bl_cl_vec.mean())
        delta_blend_vs_closing: float | None = paired_vs_closing["delta_mean"]
        delta_blend_vs_closing_ci95: list[float] | None = paired_vs_closing["ci95"]
        delta_blend_vs_closing_sig = bool(paired_vs_closing["significant"])
        delta_blend_vs_closing_lbl = str(paired_vs_closing["significance_label"])
        delta_model_vs_closing: float | None = paired_mod_vs_closing["delta_mean"]
        delta_model_vs_closing_ci95: list[float] | None = paired_mod_vs_closing["ci95"]
    else:
        log_loss_closing_novig = None
        log_loss_model_paired = None
        log_loss_blend_paired = None
        delta_blend_vs_closing = None
        delta_blend_vs_closing_ci95 = None
        delta_blend_vs_closing_sig = False
        delta_blend_vs_closing_lbl = "no significativa"
        delta_model_vs_closing = None
        delta_model_vs_closing_ci95 = None

    # 4. Regla Rectora #4 (Apagado automático de segmentos sin ventaja real de modelo)
    if not open_quotes_truly_pre_close and closing_benchmark_available:
        # En ligas históricas donde el proveedor solo publicó `close` (sin `open`), solo se habilitaría si el blend
        # supera genuinamente a Pinnacle `close` tanto en `w_effective` como en walk-forward causal.
        gate = evaluate_model_picks_gate(
            w_effective=w_effective,
            closing_benchmark_available=closing_benchmark_available,
            n_events_paired_closing=n_paired_ev,
            log_loss_blend=float(ll_blend_vec.mean()),
            log_loss_market_open_novig=float(ll_open_novig_vec.mean()),
            log_loss_blend_wf_causal=float(ll_blend_wf_causal_vec.mean()),
        )
    else:
        gate = evaluate_model_picks_gate(
            w_effective=w_effective,
            closing_benchmark_available=closing_benchmark_available,
            n_events_paired_closing=n_paired_ev,
            log_loss_blend=float(ll_blend_vec.mean()),
            log_loss_market_open_novig=float(ll_open_novig_vec.mean()),
            log_loss_blend_wf_causal=float(ll_blend_wf_causal_vec.mean()),
        )

    return {
        "league": league,
        "market": canon_mkt,
        "sport": sport,
        "n_events_dev": n_dev_total,
        "n_events_oos_evaluated": n_oos,
        "n_events_paired_closing": n_paired_ev,
        "closing_benchmark_available": closing_benchmark_available,
        "open_quotes_available": bool(open_quotes_truly_pre_close),
        "best_devig_method": best_devig_method,
        "devig_comparison": devig_comparison,
        "w_raw_opt": float(w_raw_opt),
        "w_shrunk_raw": float(w_shrunk_raw),
        "w_effective": float(w_effective),
        "log_loss_model": float(ll_model_vec.mean()),
        "log_loss_market_open_novig": float(ll_open_novig_vec.mean()),
        "log_loss_blend": float(ll_blend_vec.mean()),
        "log_loss_blend_wf_causal": float(ll_blend_wf_causal_vec.mean()),
        "log_loss_closing_novig": log_loss_closing_novig,
        "log_loss_model_paired_closing": log_loss_model_paired,
        "log_loss_blend_paired_closing": log_loss_blend_paired,
        "delta_model_vs_closing": delta_model_vs_closing,
        "delta_model_vs_closing_ci95": delta_model_vs_closing_ci95,
        "delta_blend_vs_closing": delta_blend_vs_closing,
        "delta_blend_vs_closing_ci95": delta_blend_vs_closing_ci95,
        "delta_blend_vs_closing_significant": delta_blend_vs_closing_sig,
        "delta_blend_vs_closing_significance": delta_blend_vs_closing_lbl,
        "delta_blend_vs_open_novig": paired_vs_open["delta_mean"],
        "delta_blend_vs_open_novig_ci95": paired_vs_open["ci95"],
        "delta_blend_vs_open_novig_significant": bool(paired_vs_open["significant"]),
        "delta_blend_vs_open_novig_significance": str(paired_vs_open["significance_label"]),
        "model_picks_enabled": bool(gate["model_picks_enabled"]),
        "disabled_reason": gate["disabled_reason"],
    }


# ---------------------------------------------------------------------------
# Extracción rápida y causal de cuotas por `(event_id, market)` desde `odds_snapshots`
# ---------------------------------------------------------------------------


def _pivot_market_quotes_for_events(
    odds_sub: pd.DataFrame,
    market: str,
    sel_order: tuple[str, ...],
    stage_filter: str,
    books_priority: tuple[str, ...],
) -> tuple[dict[str, tuple[float, ...]], dict[str, float]]:
    """Devuelve `({event_id: (price_sel0, ...)}, {event_id: line})` eligiendo el libro de mayor prioridad
    con todas las selecciones válidas en `[1.01, 1000]` y overround plausible `[0.9, 1.2]`."""
    sub = odds_sub[
        (odds_sub["market_canon"] == market)
        & (odds_sub["snapshot_stage"] == stage_filter)
        & (odds_sub["book_canon"].isin(books_priority))
        & (odds_sub["selection_canon"].isin(sel_order))
    ]
    if sub.empty:
        return {}, {}

    # Si hubiera >1 captura del mismo `(event_id, book, selection)`, tomar la última captura pre-etapa
    sub_sorted = sub.sort_values("ts_captured", kind="mergesort")
    dedup = sub_sorted.drop_duplicates(["event_id", "book_canon", "selection_canon"], keep="last")

    piv_price = dedup.pivot(index=["event_id", "book_canon"], columns="selection_canon", values="price_decimal")
    if not all(s in piv_price.columns for s in sel_order):
        return {}, {}
    piv_price = piv_price[list(sel_order)].dropna()
    if piv_price.empty:
        return {}, {}

    arr = piv_price.to_numpy(dtype=np.float64)
    sum_imp = np.sum(1.0 / arr, axis=1)
    valid_mask = np.all((arr >= 1.01) & (arr <= 1000.0), axis=1) & (sum_imp >= MIN_OVERROUND) & (sum_imp <= MAX_OVERROUND)
    piv_price = piv_price.loc[valid_mask]
    if piv_price.empty:
        return {}, {}

    # Prioridad determinista de casa (`pinnacle` -> `smarkets` -> `b365` -> ...)
    book_rank = {b: idx for idx, b in enumerate(books_priority)}
    idx_df = piv_price.index.to_frame(index=False)
    idx_df["_rank"] = idx_df["book_canon"].map(lambda b: book_rank.get(str(b), 999))
    for i, s in enumerate(sel_order):
        idx_df[s] = piv_price[s].to_numpy(dtype=np.float64)

    best_per_event = idx_df.sort_values(["event_id", "_rank"], kind="mergesort").drop_duplicates("event_id", keep="first")

    quotes_map: dict[str, tuple[float, ...]] = {}
    eids_list = best_per_event["event_id"].astype(str).tolist()
    vals_mat = best_per_event[list(sel_order)].to_numpy(dtype=np.float64)
    for eid_s, row_v in zip(eids_list, vals_mat):
        quotes_map[eid_s] = tuple(float(x) for x in row_v)

    line_map: dict[str, float] = {}
    if "line" in dedup.columns and dedup["line"].notna().any():
        chosen_keys = set(zip(best_per_event["event_id"].astype(str), best_per_event["book_canon"].astype(str)))
        line_rows = dedup.drop_duplicates(["event_id", "book_canon"], keep="last")[["event_id", "book_canon", "line"]]
        for eid_s, bk_s, ln_v in zip(
            line_rows["event_id"].astype(str).tolist(),
            line_rows["book_canon"].astype(str).tolist(),
            line_rows["line"].tolist(),
        ):
            if (eid_s, bk_s) in chosen_keys and pd.notna(ln_v):
                line_map[eid_s] = float(ln_v)

    return quotes_map, line_map


# ---------------------------------------------------------------------------
# Pipeline Principal Reproducible (`walk_forward_dev`, Holdout 100% Sellado)
# ---------------------------------------------------------------------------


def run_blend_calibration_pipeline(
    *,
    out_artifact_path: str | Path = DEFAULT_ARTIFACT_JSON,
    ts_mirror_path: str | Path | None = DEFAULT_TS_MIRROR_JSON,
    n0_shrinkage: int = DEFAULT_N0_SHRINKAGE,
    bootstrap_samples: int = 1000,
    seed: int = 20261111,
    unlock_holdout: bool = False,
    record_backtest_trial: bool = True,
    registry_path: str | Path | None = None,
) -> dict[str, Any]:
    """Ejecuta la calibración walk-forward completa sobre `walk_forward_dev` y materializa
    `blend_weights_v3_1.json` (y su espejo exacto en `src/data/prediction/blend_weights_v3_1.json`)."""
    if unlock_holdout:
        raise bt.HoldoutSealedError(
            "PROHIBIDO ABRIR EL HOLDOUT SELLADO en Ola 2 (`unlock_holdout=False` obligatorio en A4)."
        )

    # 1. Cargar cuotas completas (incluyendo `1x2`, `moneyline`, `ah`, `totals`, `spread`)
    all_markets_cfg = bt.BacktestConfig(
        phase="ola2_a4_blend_calibration",
        preset="blend_v3_1_calibration",
        model_version="spacetime_v3.1_logit_blend",
        eval_split="walk_forward_dev",
        unlock_holdout=False,
        sports=("football", "nfl"),
        markets=("1x2", "moneyline", "ah", "totals", "spread"),
        bootstrap_samples=int(bootstrap_samples),
        seed=int(seed),
    )
    all_markets_cfg.validate()
    odds_all = bt._load_odds_snapshots(all_markets_cfg)

    # 2. Construir exactamente el universo causal `v3.0` (`70,812` eventos) y aislar `walk_forward_dev` (`56,649`)
    base_cfg = bt.BacktestConfig(
        phase="ola2_a4_blend_calibration",
        preset="blend_v3_1_calibration",
        model_version="spacetime_v3.1_logit_blend",
        eval_split="walk_forward_dev",
        unlock_holdout=False,
        sports=("football", "nfl"),
        markets=("1x2", "moneyline"),
        bootstrap_samples=int(bootstrap_samples),
        seed=int(seed),
    )
    raw_events = bt._build_baseline_v3_0_events(base_cfg, odds_all)
    raw_events = raw_events[raw_events["y"].notna()].copy()
    events_checked = bt.verify_events_frame_no_leakage(raw_events)
    dev_df, _sealed_unused, split_meta = bt.split_walk_forward_and_holdout(
        events_checked, holdout_fraction=base_cfg.holdout_fraction
    )
    del _sealed_unused  # Jamás se lee ni evalúa ninguna fila del holdout sellado

    holdout_cut_ts = pd.Timestamp(split_meta["holdout_cut_ts"])
    if (dev_df["ts_event_start"] >= holdout_cut_ts).any():
        raise bt.DataLeakageError("Violación de frontera temporal: evento de dev_df >= holdout_cut_ts.")

    dev_eids = set(dev_df["event_id"].astype(str).unique())
    dev_odds = odds_all[
        (odds_all["ts_event_start"] < holdout_cut_ts) & (odds_all["event_id"].astype(str).isin(dev_eids))
    ].copy()
    dev_odds["snapshot_stage"] = dev_odds["snapshot_stage"].fillna("").astype(str).str.lower()

    # Verificación explícita anti-fuga sobre todas las cuotas `open` en `dev_odds`
    dec_ts_by_eid = dict(zip(dev_df["event_id"].astype(str), dev_df["ts_decision"]))
    open_rows = dev_odds[dev_odds["snapshot_stage"] == "open"]
    if not open_rows.empty:
        mapped_dec = open_rows["event_id"].astype(str).map(dec_ts_by_eid)
        leaked_open = open_rows["ts_captured"] > mapped_dec
        if leaked_open.any():
            bad_r = open_rows.loc[leaked_open].iloc[0]
            raise bt.DataLeakageError(
                f"Fuga temporal en cuota open de event_id={bad_r['event_id']}: ts_captured > ts_decision"
            )

    segments_out: dict[str, dict[str, Any]] = {}

    # -----------------------------------------------------------------------
    # A. Segmentos de Fútbol: `1x2` (23 ligas) + `ah` y `totals` (17 ligas europeas)
    # -----------------------------------------------------------------------
    soc_dev = dev_df[dev_df["sport"] == "football"].copy().reset_index(drop=True)
    soc_odds = dev_odds[dev_odds["sport_canon"] == "football"].copy()

    # Mapas vectorizados de cuotas para fútbol `1x2`
    open_1x2_map, _ = _pivot_market_quotes_for_events(
        soc_odds, "1x2", ("home", "draw", "away"), "open", OPEN_REFERENCE_BOOKS_PRIORITY
    )
    close_pin_1x2_map, _ = _pivot_market_quotes_for_events(
        soc_odds, "1x2", ("home", "draw", "away"), "close", ("pinnacle",)
    )
    # Para ligas Extra (`ARG`, `BRA`, `JPN`, `MEX`, `SWE`, `USA`) donde football-data solo publica `close`:
    close_ref_1x2_map, _ = _pivot_market_quotes_for_events(
        soc_odds, "1x2", ("home", "draw", "away"), "close", ("pinnacle", "avg")
    )

    # Cargar `dc_lam_home` y `dc_lam_away` estrictamente pre-partido desde `features.parquet` para `ah` y `totals`
    soc_feats = pd.read_parquet(
        PRED_LAB_ROOT / "data" / "processed" / "features.parquet",
        columns=["match_id", "dc_lam_home", "dc_lam_away"],
    ).drop_duplicates("match_id")
    soc_dev = soc_dev.merge(soc_feats, left_on="raw_event_id", right_on="match_id", how="left")

    open_ah_map, open_ah_lines = _pivot_market_quotes_for_events(
        soc_odds, "ah", ("home", "away"), "open", OPEN_REFERENCE_BOOKS_PRIORITY
    )
    close_pin_ah_map, close_ah_lines = _pivot_market_quotes_for_events(
        soc_odds, "ah", ("home", "away"), "close", ("pinnacle",)
    )

    open_tot_map, open_tot_lines = _pivot_market_quotes_for_events(
        soc_odds, "totals", ("over", "under"), "open", OPEN_REFERENCE_BOOKS_PRIORITY
    )
    close_pin_tot_map, close_tot_lines = _pivot_market_quotes_for_events(
        soc_odds, "totals", ("over", "under"), "close", ("pinnacle",)
    )

    soc_leagues = sorted(soc_dev["league"].unique())
    seg_counter = 0

    for lg in soc_leagues:
        lg_df = soc_dev[soc_dev["league"] == lg].reset_index(drop=True)
        n_lg = len(lg_df)
        eids_lg = lg_df["event_id"].astype(str).tolist()
        f_keys_lg = lg_df["fold_key"].astype(str).to_numpy()
        ts_st_lg = lg_df["ts_event_start"].to_numpy()
        ts_dc_lg = lg_df["ts_decision"].to_numpy()
        h_goals_lg = lg_df["home_score"].to_numpy(dtype=np.float64)
        a_goals_lg = lg_df["away_score"].to_numpy(dtype=np.float64)

        # 1) Fútbol `1x2`
        p_mod_1x2 = lg_df[["p_model_home", "p_model_draw", "p_model_away"]].to_numpy(dtype=np.float64)
        y_1x2 = lg_df["y"].to_numpy(dtype=np.int64)

        n_with_open_1x2 = sum(1 for e in eids_lg if e in open_1x2_map)
        has_true_open_1x2 = n_with_open_1x2 > 0
        active_mkt_1x2_map = open_1x2_map if has_true_open_1x2 else close_ref_1x2_map

        o_open_1x2 = np.ones((n_lg, 3), dtype=np.float64) * 2.0
        has_open_1x2 = np.zeros(n_lg, dtype=bool)
        o_close_1x2 = np.ones((n_lg, 3), dtype=np.float64) * 2.0
        has_close_1x2 = np.zeros(n_lg, dtype=bool)

        for i, eid_s in enumerate(eids_lg):
            q_op = active_mkt_1x2_map.get(eid_s)
            if q_op is not None:
                o_open_1x2[i] = q_op
                has_open_1x2[i] = True
            q_cl = close_pin_1x2_map.get(eid_s)
            if q_cl is not None:
                o_close_1x2[i] = q_cl
                has_close_1x2[i] = True

        p_close_novig_1x2 = _devig_matrix_power(o_close_1x2)
        seg_counter += 1
        seg_key_1x2 = format_segment_key(lg, "1x2")
        segments_out[seg_key_1x2] = calibrate_segment_walk_forward(
            league=lg,
            market="1x2",
            sport="football",
            fold_keys=f_keys_lg,
            ts_event_starts=ts_st_lg,
            ts_decisions=ts_dc_lg,
            p_model_mat=p_mod_1x2,
            open_odds_mat=o_open_1x2,
            has_open_quote=has_open_1x2,
            closing_novig_mat=p_close_novig_1x2,
            has_sharp_closing=has_close_1x2,
            outcomes_y=y_1x2,
            open_quotes_truly_pre_close=has_true_open_1x2,
            n0_shrinkage=n0_shrinkage,
            n_bootstrap=bootstrap_samples,
            seed=seed + 1000 * seg_counter,
        )

        # 2) Fútbol `ah` (solo en las 17 ligas que poseen mercado `ah` en `odds_snapshots`)
        if any(e in open_ah_map for e in eids_lg):
            o_open_ah = np.ones((n_lg, 2), dtype=np.float64) * 1.95
            has_open_ah = np.zeros(n_lg, dtype=bool)
            lines_ah = np.zeros(n_lg, dtype=np.float64)
            o_close_ah = np.ones((n_lg, 2), dtype=np.float64) * 1.95
            has_close_ah = np.zeros(n_lg, dtype=bool)
            y_ah = np.full(n_lg, -1, dtype=np.int64)

            for i, eid_s in enumerate(eids_lg):
                q_op = open_ah_map.get(eid_s)
                ln_op = open_ah_lines.get(eid_s)
                if q_op is not None and ln_op is not None:
                    o_open_ah[i] = q_op
                    has_open_ah[i] = True
                    lines_ah[i] = ln_op
                    diff = (h_goals_lg[i] - a_goals_lg[i]) + ln_op
                    if abs(diff) > 1e-9:
                        y_ah[i] = 0 if diff > 0.0 else 1

                    # Parear cierre Pinnacle únicamente cuando coincide la misma línea asiática `ln_op`
                    q_cl = close_pin_ah_map.get(eid_s)
                    ln_cl = close_ah_lines.get(eid_s)
                    if q_cl is not None and ln_cl is not None and abs(ln_cl - ln_op) <= 1e-6:
                        o_close_ah[i] = q_cl
                        has_close_ah[i] = True

            lam_h = lg_df["dc_lam_home"].fillna(1.45).to_numpy(dtype=np.float64)
            lam_a = lg_df["dc_lam_away"].fillna(1.15).to_numpy(dtype=np.float64)
            p_mod_ah = _dixon_coles_bivariate_probs_for_lines(lam_h, lam_a, lines_ah, "ah")
            p_close_novig_ah = _devig_matrix_power(o_close_ah)

            seg_counter += 1
            segments_out[format_segment_key(lg, "ah")] = calibrate_segment_walk_forward(
                league=lg,
                market="ah",
                sport="football",
                fold_keys=f_keys_lg,
                ts_event_starts=ts_st_lg,
                ts_decisions=ts_dc_lg,
                p_model_mat=p_mod_ah,
                open_odds_mat=o_open_ah,
                has_open_quote=has_open_ah,
                closing_novig_mat=p_close_novig_ah,
                has_sharp_closing=has_close_ah,
                outcomes_y=y_ah,
                open_quotes_truly_pre_close=True,
                n0_shrinkage=n0_shrinkage,
                n_bootstrap=bootstrap_samples,
                seed=seed + 1000 * seg_counter,
            )

        # 3) Fútbol `totals` (Over/Under 2.5 en las 17 ligas con mercado `totals`)
        if any(e in open_tot_map for e in eids_lg):
            o_open_tot = np.ones((n_lg, 2), dtype=np.float64) * 1.95
            has_open_tot = np.zeros(n_lg, dtype=bool)
            lines_tot = np.full(n_lg, 2.5, dtype=np.float64)
            o_close_tot = np.ones((n_lg, 2), dtype=np.float64) * 1.95
            has_close_tot = np.zeros(n_lg, dtype=bool)
            y_tot = np.full(n_lg, -1, dtype=np.int64)

            for i, eid_s in enumerate(eids_lg):
                q_op = open_tot_map.get(eid_s)
                ln_op = open_tot_lines.get(eid_s, 2.5)
                if q_op is not None:
                    o_open_tot[i] = q_op
                    has_open_tot[i] = True
                    lines_tot[i] = ln_op
                    diff = (h_goals_lg[i] + a_goals_lg[i]) - ln_op
                    if abs(diff) > 1e-9:
                        y_tot[i] = 0 if diff > 0.0 else 1

                    q_cl = close_pin_tot_map.get(eid_s)
                    ln_cl = close_tot_lines.get(eid_s, 2.5)
                    if q_cl is not None and abs(ln_cl - ln_op) <= 1e-6:
                        o_close_tot[i] = q_cl
                        has_close_tot[i] = True

            lam_h = lg_df["dc_lam_home"].fillna(1.45).to_numpy(dtype=np.float64)
            lam_a = lg_df["dc_lam_away"].fillna(1.15).to_numpy(dtype=np.float64)
            p_mod_tot = _dixon_coles_bivariate_probs_for_lines(lam_h, lam_a, lines_tot, "totals")
            p_close_novig_tot = _devig_matrix_power(o_close_tot)

            seg_counter += 1
            segments_out[format_segment_key(lg, "totals")] = calibrate_segment_walk_forward(
                league=lg,
                market="totals",
                sport="football",
                fold_keys=f_keys_lg,
                ts_event_starts=ts_st_lg,
                ts_decisions=ts_dc_lg,
                p_model_mat=p_mod_tot,
                open_odds_mat=o_open_tot,
                has_open_quote=has_open_tot,
                closing_novig_mat=p_close_novig_tot,
                has_sharp_closing=has_close_tot,
                outcomes_y=y_tot,
                open_quotes_truly_pre_close=True,
                n0_shrinkage=n0_shrinkage,
                n_bootstrap=bootstrap_samples,
                seed=seed + 1000 * seg_counter,
            )

    # -----------------------------------------------------------------------
    # B. Segmentos NFL: `moneyline`, `spread` y `totals` (`nflverse`, `closing_missing=True`)
    # -----------------------------------------------------------------------
    nfl_dev = dev_df[dev_df["sport"] == "nfl"].copy().reset_index(drop=True)
    nfl_odds = dev_odds[dev_odds["sport_canon"] == "nfl"].copy()

    if not nfl_dev.empty:
        n_nfl = len(nfl_dev)
        eids_nfl = nfl_dev["event_id"].astype(str).tolist()
        f_keys_nfl = nfl_dev["fold_key"].astype(str).to_numpy()
        ts_st_nfl = nfl_dev["ts_event_start"].to_numpy()
        ts_dc_nfl = nfl_dev["ts_decision"].to_numpy()
        h_sc_nfl = nfl_dev["home_score"].to_numpy(dtype=np.float64)
        a_sc_nfl = nfl_dev["away_score"].to_numpy(dtype=np.float64)

        # En `historical_fd`, `nflverse` provee únicamente cuotas consenso pre-partido (`closing_missing=True`)
        nfl_ml_map, _ = _pivot_market_quotes_for_events(
            nfl_odds, "moneyline", ("home", "away"), "close", ("pinnacle", "nflverse")
        )
        nfl_sp_map, nfl_sp_lines = _pivot_market_quotes_for_events(
            nfl_odds, "spread", ("home", "away"), "close", ("pinnacle", "nflverse")
        )
        nfl_tot_map, nfl_tot_lines = _pivot_market_quotes_for_events(
            nfl_odds, "totals", ("over", "under"), "close", ("pinnacle", "nflverse")
        )
        # Cierre sharp Pinnacle estricto (`0` en `nflverse` histórico -> `closing_benchmark_available = False`)
        nfl_pin_ml_map, _ = _pivot_market_quotes_for_events(
            nfl_odds, "moneyline", ("home", "away"), "close", ("pinnacle",)
        )

        # 1) NFL `moneyline`
        p_mod_nfl_ml = nfl_dev[["p_model_home", "p_model_away"]].to_numpy(dtype=np.float64)
        p_mod_nfl_ml = p_mod_nfl_ml / np.maximum(1e-12, p_mod_nfl_ml.sum(axis=1, keepdims=True))
        o_nfl_ml = np.ones((n_nfl, 2), dtype=np.float64) * 1.91
        has_nfl_ml = np.zeros(n_nfl, dtype=bool)
        has_nfl_pin_ml = np.zeros(n_nfl, dtype=bool)
        o_nfl_pin_ml = np.ones((n_nfl, 2), dtype=np.float64) * 1.91
        y_nfl_ml = np.full(n_nfl, -1, dtype=np.int64)

        for i, eid_s in enumerate(eids_nfl):
            if abs(h_sc_nfl[i] - a_sc_nfl[i]) > 1e-9:
                y_nfl_ml[i] = 0 if h_sc_nfl[i] > a_sc_nfl[i] else 1
            q_ml = nfl_ml_map.get(eid_s)
            if q_ml is not None:
                o_nfl_ml[i] = q_ml
                has_nfl_ml[i] = True
            q_pin = nfl_pin_ml_map.get(eid_s)
            if q_pin is not None:
                o_nfl_pin_ml[i] = q_pin
                has_nfl_pin_ml[i] = True

        seg_counter += 1
        segments_out[format_segment_key("NFL", "moneyline")] = calibrate_segment_walk_forward(
            league="NFL",
            market="moneyline",
            sport="nfl",
            fold_keys=f_keys_nfl,
            ts_event_starts=ts_st_nfl,
            ts_decisions=ts_dc_nfl,
            p_model_mat=p_mod_nfl_ml,
            open_odds_mat=o_nfl_ml,
            has_open_quote=has_nfl_ml,
            closing_novig_mat=_devig_matrix_power(o_nfl_pin_ml),
            has_sharp_closing=has_nfl_pin_ml,
            outcomes_y=y_nfl_ml,
            open_quotes_truly_pre_close=False,
            n0_shrinkage=n0_shrinkage,
            n_bootstrap=bootstrap_samples,
            seed=seed + 1000 * seg_counter,
        )

        # 2) NFL `spread`
        o_nfl_sp = np.ones((n_nfl, 2), dtype=np.float64) * 1.91
        has_nfl_sp = np.zeros(n_nfl, dtype=bool)
        lines_nfl_sp = np.zeros(n_nfl, dtype=np.float64)
        y_nfl_sp = np.full(n_nfl, -1, dtype=np.int64)
        for i, eid_s in enumerate(eids_nfl):
            q_sp = nfl_sp_map.get(eid_s)
            ln_sp = nfl_sp_lines.get(eid_s)
            if q_sp is not None and ln_sp is not None:
                o_nfl_sp[i] = q_sp
                has_nfl_sp[i] = True
                lines_nfl_sp[i] = ln_sp
                diff = (h_sc_nfl[i] - a_sc_nfl[i]) + ln_sp
                if abs(diff) > 1e-9:
                    y_nfl_sp[i] = 0 if diff > 0.0 else 1

        nfl_sp_frame = pd.DataFrame(
            {
                "event_id": eids_nfl,
                "ts_event_start": ts_st_nfl,
                "ts_decision": ts_dc_nfl,
                "line": lines_nfl_sp,
                "home_score": h_sc_nfl,
                "away_score": a_sc_nfl,
            }
        )
        p_mod_nfl_sp = _fit_predict_nfl_spread_totals_walk_forward(nfl_dev, nfl_sp_frame, "spread")
        seg_counter += 1
        segments_out[format_segment_key("NFL", "spread")] = calibrate_segment_walk_forward(
            league="NFL",
            market="spread",
            sport="nfl",
            fold_keys=f_keys_nfl,
            ts_event_starts=ts_st_nfl,
            ts_decisions=ts_dc_nfl,
            p_model_mat=p_mod_nfl_sp,
            open_odds_mat=o_nfl_sp,
            has_open_quote=has_nfl_sp,
            closing_novig_mat=np.full((n_nfl, 2), 0.5, dtype=np.float64),
            has_sharp_closing=np.zeros(n_nfl, dtype=bool),
            outcomes_y=y_nfl_sp,
            open_quotes_truly_pre_close=False,
            n0_shrinkage=n0_shrinkage,
            n_bootstrap=bootstrap_samples,
            seed=seed + 1000 * seg_counter,
        )

        # 3) NFL `totals`
        o_nfl_tot = np.ones((n_nfl, 2), dtype=np.float64) * 1.91
        has_nfl_tot = np.zeros(n_nfl, dtype=bool)
        lines_nfl_tot = np.full(n_nfl, 44.5, dtype=np.float64)
        y_nfl_tot = np.full(n_nfl, -1, dtype=np.int64)
        for i, eid_s in enumerate(eids_nfl):
            q_tot = nfl_tot_map.get(eid_s)
            ln_tot = nfl_tot_lines.get(eid_s)
            if q_tot is not None and ln_tot is not None:
                o_nfl_tot[i] = q_tot
                has_nfl_tot[i] = True
                lines_nfl_tot[i] = ln_tot
                diff = (h_sc_nfl[i] + a_sc_nfl[i]) - ln_tot
                if abs(diff) > 1e-9:
                    y_nfl_tot[i] = 0 if diff > 0.0 else 1

        nfl_tot_frame = pd.DataFrame(
            {
                "event_id": eids_nfl,
                "ts_event_start": ts_st_nfl,
                "ts_decision": ts_dc_nfl,
                "line": lines_nfl_tot,
                "home_score": h_sc_nfl,
                "away_score": a_sc_nfl,
            }
        )
        p_mod_nfl_tot = _fit_predict_nfl_spread_totals_walk_forward(nfl_dev, nfl_tot_frame, "totals")
        seg_counter += 1
        segments_out[format_segment_key("NFL", "totals")] = calibrate_segment_walk_forward(
            league="NFL",
            market="totals",
            sport="nfl",
            fold_keys=f_keys_nfl,
            ts_event_starts=ts_st_nfl,
            ts_decisions=ts_dc_nfl,
            p_model_mat=p_mod_nfl_tot,
            open_odds_mat=o_nfl_tot,
            has_open_quote=has_nfl_tot,
            closing_novig_mat=np.full((n_nfl, 2), 0.5, dtype=np.float64),
            has_sharp_closing=np.zeros(n_nfl, dtype=bool),
            outcomes_y=y_nfl_tot,
            open_quotes_truly_pre_close=False,
            n0_shrinkage=n0_shrinkage,
            n_bootstrap=bootstrap_samples,
            seed=seed + 1000 * seg_counter,
        )

    # Ordenar segmentos determinísticamente por llave `"league::market"`
    ordered_segments = {k: segments_out[k] for k in sorted(segments_out.keys())}

    # 3. Verificación integrada con `run_backtest` (`unlock_holdout=False`) para trazabilidad en `holdout_trial_registry.jsonl`
    backtest_verification_summary: dict[str, Any] | None = None
    if record_backtest_trial:
        def _causal_logit_blend_model_fn(
            train_df: pd.DataFrame,
            test_fold_df: pd.DataFrame,
            _cfg: bt.BacktestConfig,
        ) -> pd.DataFrame:
            out_fold = test_fold_df.copy()
            # Ajustar `(best_devig, w_eff)` únicamente con eventos de `train_df` (`ts_event_start < fold_cut_ts`)
            tr_soc = train_df[train_df["sport"] == "football"]
            w_by_lg: dict[str, tuple[str, float]] = {}
            if not tr_soc.empty:
                for lg_k, grp in tr_soc.groupby("league", sort=False):
                    eids_tr = grp["event_id"].astype(str).tolist()
                    valid_idx = [idx for idx, e in enumerate(eids_tr) if e in open_1x2_map]
                    if len(valid_idx) >= 50:
                        o_mat = np.array([open_1x2_map[eids_tr[idx]] for idx in valid_idx], dtype=np.float64)
                        p_m_mat = grp.iloc[valid_idx][["p_model_home", "p_model_draw", "p_model_away"]].to_numpy(dtype=np.float64)
                        y_tr_v = grp.iloc[valid_idx]["y"].to_numpy(dtype=np.int64)
                        dv_tr = {
                            "proportional": _devig_matrix_proportional(o_mat),
                            "power": _devig_matrix_power(o_mat),
                            "shin": _devig_matrix_shin(o_mat),
                        }
                        m_best = min(CORE_DEVIG_METHODS, key=lambda m: float(_matrix_log_loss_vec(dv_tr[m], y_tr_v).mean()))
                        w_best = 0.0
                        ll_best = float(_matrix_log_loss_vec(dv_tr[m_best], y_tr_v).mean())
                        for w_c in BLEND_WEIGHT_GRID:
                            if w_c == 0.0:
                                continue
                            ll_c = float(_matrix_log_loss_vec(_blend_logit_matrix(p_m_mat, dv_tr[m_best], w_c), y_tr_v).mean())
                            if ll_c < ll_best - 1e-12:
                                ll_best = ll_c
                                w_best = w_c
                        w_eff_tr = shrink_blend_weight(w_best, len(valid_idx), n0_shrinkage, BLEND_WEIGHT_STEP)["w_effective"]
                        w_by_lg[str(lg_k)] = (m_best, w_eff_tr)

            soc_mask = out_fold["sport"] == "football"
            if soc_mask.any():
                soc_te = out_fold.loc[soc_mask]
                p_h = soc_te["p_model_home"].to_numpy(dtype=np.float64).copy()
                p_d = soc_te["p_model_draw"].to_numpy(dtype=np.float64).copy()
                p_a = soc_te["p_model_away"].to_numpy(dtype=np.float64).copy()
                for i_row, (eid_s, lg_s) in enumerate(zip(soc_te["event_id"].astype(str), soc_te["league"].astype(str))):
                    q_op = open_1x2_map.get(eid_s)
                    if q_op is not None:
                        m_use, w_use = w_by_lg.get(lg_s, ("power", 0.0))
                        p_mkt = devig_3way_odds(q_op, m_use)
                        p_bl = blend_logit_3way((p_h[i_row], p_d[i_row], p_a[i_row]), p_mkt, w_use)
                        p_h[i_row], p_d[i_row], p_a[i_row] = p_bl
                out_fold.loc[soc_mask, "p_model_home"] = p_h
                out_fold.loc[soc_mask, "p_model_draw"] = p_d
                out_fold.loc[soc_mask, "p_model_away"] = p_a
            return out_fold

        with tempfile.TemporaryDirectory() as tmp_reg_dir:
            eff_reg_path = (
                Path(registry_path)
                if registry_path is not None
                else Path(tmp_reg_dir) / "ephemeral_a4_trial_registry.jsonl"
            )
            bt_cfg = bt.BacktestConfig(
                phase="ola2_a4_blend_calibration",
                preset="blend_v3_1_logit_wf",
                model_version="spacetime_v3.1_logit_blend",
                eval_split="walk_forward_dev",
                unlock_holdout=False,
                sports=("football", "nfl"),
                markets=("1x2", "moneyline"),
                bootstrap_samples=int(bootstrap_samples),
                seed=int(seed),
                registry_path=eff_reg_path,
                events_df=events_checked,
                odds_df=odds_all,
                model_fn=_causal_logit_blend_model_fn,
                pick_selector_fn=lambda _ctx, _quotes, _c: [],
                extra_config_tag={"n0_shrinkage": int(n0_shrinkage), "grid_step": BLEND_WEIGHT_STEP},
            )
            bt_rep = bt.run_backtest(bt_cfg)
        backtest_verification_summary = {
            "trial_seq": bt_rep["holdout_audit"]["trial_seq"],
            "config_hash": bt_rep["config_hash"],
            "unlock_holdout": bt_rep["unlock_holdout"],
            "eval_split": bt_rep["eval_split"],
            "log_loss_blend_paired_vs_closing": bt_rep["log_loss_model"],
            "log_loss_closing_novig": bt_rep["log_loss_closing_novig"],
            "delta_log_loss_vs_closing": bt_rep["delta_log_loss"],
            "delta_log_loss_ci95": bt_rep["delta_log_loss_ci95"],
            "brier_blend_paired_vs_closing": bt_rep["brier_model"],
            "brier_closing_novig": bt_rep["brier_closing_novig"],
        }

    # 4. Resumen global
    enabled_keys = [k for k, v in ordered_segments.items() if v["model_picks_enabled"]]
    disabled_reasons_count: dict[str, int] = {}
    best_devig_counts: dict[str, int] = {m: 0 for m in CORE_DEVIG_METHODS}
    for v in ordered_segments.values():
        best_devig_counts[str(v["best_devig_method"])] = best_devig_counts.get(str(v["best_devig_method"]), 0) + 1
        if not v["model_picks_enabled"]:
            reason = str(v["disabled_reason"] or "unknown")
            disabled_reasons_count[reason] = disabled_reasons_count.get(reason, 0) + 1

    artifact: dict[str, Any] = {
        "schema_version": BLEND_SCHEMA_VERSION,
        "generated_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "reproduction_command": (
            "research/prediction-lab/.venv/Scripts/python.exe services/models/blend_calibration.py "
            "--out services/models/artifacts/blend_weights_v3_1.json "
            "--ts-out src/data/prediction/blend_weights_v3_1.json"
        ),
        "holdout_sealed_untouched": True,
        "n0_shrinkage": int(n0_shrinkage),
        "w_grid_step": BLEND_WEIGHT_STEP,
        "prob_clip_eps": PROB_CLIP_EPS,
        "min_paired_closing_for_enablement": MIN_PAIRED_CLOSING_FOR_ENABLEMENT,
        "bootstrap_resamples": int(bootstrap_samples),
        "bootstrap_seed": int(seed),
        "split_summary": split_meta,
        "global_summary": {
            "n_segments_total": len(ordered_segments),
            "n_segments_enabled": len(enabled_keys),
            "n_segments_disabled": len(ordered_segments) - len(enabled_keys),
            "enabled_segments": enabled_keys,
            "disabled_reasons_count": disabled_reasons_count,
            "best_devig_method_counts": best_devig_counts,
            "n_events_primary_dev": int(len(dev_df)),
            "n_events_all_segment_evals": int(sum(int(v["n_events_oos_evaluated"]) for v in ordered_segments.values())),
            "n_events_paired_closing_total": int(sum(int(v["n_events_paired_closing"]) for v in ordered_segments.values())),
            "backtest_harness_verification": backtest_verification_summary,
        },
        "segments": ordered_segments,
    }

    out_p = Path(out_artifact_path)
    out_p.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(artifact, indent=2, ensure_ascii=False) + "\n"
    out_p.write_text(serialized, encoding="utf-8")

    if ts_mirror_path is not None:
        mirror_p = Path(ts_mirror_path)
        mirror_p.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(out_p, mirror_p)

    return artifact


def _parse_cli_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Calibración walk-forward A4 (de-vig + mezcla logit + Regla #4).")
    parser.add_argument("--out", type=Path, default=DEFAULT_ARTIFACT_JSON, help="Ruta de salida de blend_weights_v3_1.json")
    parser.add_argument(
        "--ts-out",
        type=Path,
        default=DEFAULT_TS_MIRROR_JSON,
        help="Ruta espejo exacta para consumo TypeScript",
    )
    parser.add_argument("--n0-shrinkage", type=int, default=DEFAULT_N0_SHRINKAGE)
    parser.add_argument("--bootstrap-samples", type=int, default=1000)
    parser.add_argument("--seed", type=int, default=20261111)
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = _parse_cli_args(argv)
    art = run_blend_calibration_pipeline(
        out_artifact_path=args.out,
        ts_mirror_path=args.ts_out,
        n0_shrinkage=args.n0_shrinkage,
        bootstrap_samples=args.bootstrap_samples,
        seed=args.seed,
        unlock_holdout=False,
    )
    gs = art["global_summary"]
    print(
        f"[A4 blend_calibration] OK — segmentos={gs['n_segments_total']} "
        f"(enabled={gs['n_segments_enabled']}, disabled={gs['n_segments_disabled']}), "
        f"devig_counts={gs['best_devig_method_counts']}, holdout_sealed_untouched={art['holdout_sealed_untouched']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
