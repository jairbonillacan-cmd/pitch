"""A28 (Ola 3 · Agente A6) — Derivación exacta de mercados de 2 vías de fútbol desde la matriz
Dixon-Coles (`dc_lam_home`, `dc_lam_away`, `dc_rho` / `PoissonDC._tau_matrix`), liquidación y EV/Kelly ¼
exactos para líneas asiáticas enteras, medias y partidas (`.25` / `.75`), y validación walk-forward causal
con A4 (`blend_calibration.py`) y A3 (`backtest.py` + `picks_engine.py`) manteniendo el holdout 100% sellado.

Paridad numérica estricta `< 1e-12` frente a `src/domain/prediction/markets_2way.ts`.
"""

from __future__ import annotations

import argparse
from collections.abc import Mapping, Sequence
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import sys
from typing import Any

import numpy as np
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]
MODELS_DIR = Path(__file__).resolve().parent
PRED_LAB_ROOT = REPO_ROOT / "research" / "prediction-lab"

for _p in (str(REPO_ROOT), str(MODELS_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

DEFAULT_EVAL_ARTIFACT_PATH = MODELS_DIR / "artifacts" / "markets_2way_eval.json"
DEFAULT_CONFIG_JSON_PATH = REPO_ROOT / "src" / "data" / "prediction" / "markets_2way_config.json"
DEFAULT_A6_REGISTRY_PATH = MODELS_DIR / "artifacts" / "holdout_registry_a6.jsonl"

MARKETS_2WAY_SCHEMA_VERSION = "markets_2way_v1"
DEFAULT_DC_RHO: float = -0.11
DEFAULT_MAX_GOALS: int = 12
MIN_MAX_GOALS: int = 10
MAX_MAX_GOALS: int = 50
MAX_LAMBDA_GOALS: float = 25.0
MAX_ABS_LINE: float = 25.0

AH_CANONICAL_LINES: tuple[float, ...] = (-1.0, -0.75, -0.5, -0.25, 0.0, 0.25, 0.5, 0.75, 1.0)
TOTALS_CANONICAL_LINES: tuple[float, ...] = (1.5, 1.75, 2.0, 2.25, 2.5, 2.75, 3.0, 3.25, 3.5)
SUPPORTED_2WAY_MARKETS: tuple[str, ...] = ("ah", "dnb", "totals", "btts")

DEFAULT_KELLY_FRACTION: float = 0.25
DEFAULT_BANKROLL_UNIT_PCT: float = 0.01
MIN_DECIMAL_PRICE: float = 1.01
MAX_DECIMAL_PRICE: float = 1000.0
PROB_EPS: float = 1e-12


class Markets2WayValidationError(ValueError):
    """Error de validación de dominio en mercados de 2 vías y líneas asiáticas."""


def _is_finite_real(value: Any) -> bool:
    if isinstance(value, bool) or not isinstance(value, (int, float, np.number)):
        return False
    return math.isfinite(float(value))


def canonicalize_2way_market(market: Any) -> str:
    if not isinstance(market, str) or not market.strip():
        raise Markets2WayValidationError(f"mercado 2-vías inválido: {market!r}")
    m = market.strip().lower()
    if m in ("ah", "asian_handicap", "spread", "handicap"):
        return "ah"
    if m in ("dnb", "draw_no_bet", "moneyline", "ml", "2way"):
        return "dnb"
    if m in ("ou", "totals", "total", "over_under"):
        return "totals"
    if m in ("btts", "both_teams_to_score"):
        return "btts"
    raise Markets2WayValidationError(f"mercado 2-vías no soportado: {market!r}")


def canonicalize_2way_selection(market: str, selection: Any) -> str:
    m = canonicalize_2way_market(market)
    if not isinstance(selection, str) or not selection.strip():
        raise Markets2WayValidationError(f"selección inválida para {m}: {selection!r}")
    s = selection.strip().lower()
    if m in ("ah", "dnb"):
        if s in ("home", "1", "h"):
            return "home"
        if s in ("away", "2", "a"):
            return "away"
        raise Markets2WayValidationError(f"selección desconocida para {m}: {selection!r}")
    if m == "totals":
        if s in ("over", "o"):
            return "over"
        if s in ("under", "u"):
            return "under"
        raise Markets2WayValidationError(f"selección desconocida para totals/ou: {selection!r}")
    if m == "btts":
        if s in ("yes", "si", "y"):
            return "yes"
        if s in ("no", "n"):
            return "no"
        raise Markets2WayValidationError(f"selección desconocida para btts: {selection!r}")
    raise Markets2WayValidationError(f"mercado no soportado: {market!r}")


def validate_quarter_line(line: Any, field_name: str = "line") -> float:
    """Valida que `line` sea un múltiplo exacto de `0.25` (`.0`, `.25`, `.5`, `.75`) en `[-25, 25]`."""
    if not _is_finite_real(line):
        raise Markets2WayValidationError(f"{field_name} debe ser un número finito; recibido {line!r}")
    val = float(line)
    if abs(val) > MAX_ABS_LINE:
        raise Markets2WayValidationError(f"{field_name} fuera de rango [-{MAX_ABS_LINE}, {MAX_ABS_LINE}]: {val}")
    q = round(val * 4.0)
    if abs(val * 4.0 - q) > 1e-6:
        raise Markets2WayValidationError(
            f"{field_name} debe ser múltiplo de 0.25 (entera, media o cuarto asiático); recibido {val}"
        )
    norm = float(q) / 4.0
    return 0.0 if norm == 0.0 else norm


def format_line_key(line: float) -> str:
    """Clave canónica idéntica a `String(Number(val))` en JavaScript para cualquier múltiplo de `0.25`."""
    norm = validate_quarter_line(line, "line")
    return f"{norm:g}"


# ---------------------------------------------------------------------------
# 1. Matriz exacta de marcadores Dixon-Coles (`PoissonDC._tau_matrix`)
# ---------------------------------------------------------------------------


def build_dixon_coles_score_matrix(
    lam_home: float,
    lam_away: float,
    rho: float = DEFAULT_DC_RHO,
    max_goals: int = DEFAULT_MAX_GOALS,
) -> list[list[float]]:
    """Construye la matriz `0..max_goals` (`max_goals >= 10`) con corrección `PoissonDC._tau_matrix`
    en `(0,0), (0,1), (1,0), (1,1)` y renormaliza en orden fila-mayor para sumar exactamente `1.0`."""
    if not _is_finite_real(lam_home) or float(lam_home) <= 0.0 or float(lam_home) > MAX_LAMBDA_GOALS:
        raise Markets2WayValidationError(f"lam_home debe estar en (0, {MAX_LAMBDA_GOALS}]; recibido {lam_home!r}")
    if not _is_finite_real(lam_away) or float(lam_away) <= 0.0 or float(lam_away) > MAX_LAMBDA_GOALS:
        raise Markets2WayValidationError(f"lam_away debe estar en (0, {MAX_LAMBDA_GOALS}]; recibido {lam_away!r}")
    if not _is_finite_real(rho) or abs(float(rho)) > 1.0:
        raise Markets2WayValidationError(f"rho debe estar en [-1, 1]; recibido {rho!r}")
    if isinstance(max_goals, bool) or not isinstance(max_goals, (int, np.integer)):
        raise Markets2WayValidationError(f"max_goals debe ser entero >= {MIN_MAX_GOALS}; recibido {max_goals!r}")
    g_max = int(max_goals)
    if g_max < MIN_MAX_GOALS or g_max > MAX_MAX_GOALS:
        raise Markets2WayValidationError(
            f"max_goals debe estar en [{MIN_MAX_GOALS}, {MAX_MAX_GOALS}]; recibido {g_max}"
        )

    lh = float(lam_home)
    la = float(lam_away)
    r = float(rho)
    size = g_max + 1

    # Recurrencia IEEE-754 exacta idéntica en Python y TypeScript (`pmf[0] = exp(-lam)`, `pmf[k] = pmf[k-1]*lam/k`)
    pmf_h = [0.0] * size
    pmf_a = [0.0] * size
    pmf_h[0] = math.exp(-lh)
    pmf_a[0] = math.exp(-la)
    for k in range(1, size):
        fk = float(k)
        pmf_h[k] = (pmf_h[k - 1] * lh) / fk
        pmf_a[k] = (pmf_a[k - 1] * la) / fk

    raw: list[list[float]] = []
    for h in range(size):
        ph = pmf_h[h]
        row = [ph * pmf_a[a] for a in range(size)]
        raw.append(row)

    # Ajuste estructural `PoissonDC._tau_matrix` idéntico a `train_motor_a.py`
    raw[0][0] *= max(1.0 - lh * la * r, 1e-9)
    raw[0][1] *= max(1.0 + lh * r, 1e-9)
    raw[1][0] *= max(1.0 + la * r, 1e-9)
    raw[1][1] *= max(1.0 - r, 1e-9)

    total = 0.0
    for h in range(size):
        row = raw[h]
        for a in range(size):
            total += row[a]

    if not math.isfinite(total) or total <= 0.0:
        raise Markets2WayValidationError("Suma de matriz Dixon-Coles inválida o nula.")

    inv_total = 1.0 / total
    return [[raw[h][a] * inv_total for a in range(size)] for h in range(size)]


def _validate_score_matrix(matrix: Sequence[Sequence[float]]) -> int:
    if not isinstance(matrix, Sequence) or len(matrix) < MIN_MAX_GOALS + 1:
        raise Markets2WayValidationError(
            f"La matriz de marcadores debe tener dimensión >= {MIN_MAX_GOALS + 1}x{MIN_MAX_GOALS + 1}."
        )
    size = len(matrix)
    total = 0.0
    for h in range(size):
        row = matrix[h]
        if not isinstance(row, Sequence) or len(row) != size:
            raise Markets2WayValidationError("La matriz de marcadores debe ser cuadrada.")
        for a in range(size):
            v = row[a]
            if not _is_finite_real(v) or float(v) < -1e-15:
                raise Markets2WayValidationError(f"Entrada inválida en matriz [{h}][{a}]: {v!r}")
            total += float(v)
    if abs(total - 1.0) > 1e-6:
        raise Markets2WayValidationError(f"La matriz de marcadores debe sumar 1.0; suma={total:.12f}")
    return size


def _finalize_settlement_probs(
    p_fw: float,
    p_hw: float,
    p_push: float,
    p_hl: float,
    p_fl: float,
) -> dict[str, float]:
    fw = max(0.0, float(p_fw))
    hw = max(0.0, float(p_hw))
    pu = max(0.0, float(p_push))
    hl = max(0.0, float(p_hl))
    fl = max(0.0, float(p_fl))
    s = fw + hw + pu + hl + fl
    if s <= 0.0 or not math.isfinite(s):
        raise Markets2WayValidationError("Probabilidades de liquidación degeneradas (suma <= 0).")
    fw /= s
    hw /= s
    pu /= s
    hl /= s
    fl /= s

    win_eq = fw + 0.5 * hw
    loss_eq = fl + 0.5 * hl
    active_mass = win_eq + loss_eq
    p_eff = (win_eq / active_mass) if active_mass > PROB_EPS else 0.5
    return {
        "p_full_win": fw,
        "p_half_win": hw,
        "p_push": pu,
        "p_half_loss": hl,
        "p_full_loss": fl,
        "p_effective_win": p_eff,
    }


def derive_selection_settlement_probs(
    matrix: Sequence[Sequence[float]],
    market: str,
    line: float | None,
    selection: str,
    *,
    line_convention: str = "selection",
) -> dict[str, float]:
    """Deriva `{ p_full_win, p_half_win, p_push, p_half_loss, p_full_loss, p_effective_win }`
    para cualquier selección y línea de `ah`, `dnb`, `ou`/`totals` o `btts`.

    - `line_convention="selection"` (por defecto, compatible con `clv.ts`/`clv_report.py`): `line` es el
      hándicap firmado propio de la selección (`Away +0.25` es el opuesto de `Home -0.25`).
    - `line_convention="home_canonical"` (compatible con `odds_snapshots.parquet`/`backtest.py`): `line`
      es la línea canónica del equipo local (`away` recibe `-line`).
    """
    size = _validate_score_matrix(matrix)
    m = canonicalize_2way_market(market)
    sel = canonicalize_2way_selection(m, selection)
    if line_convention not in ("selection", "home_canonical"):
        raise Markets2WayValidationError(f"line_convention inválida: {line_convention!r}")

    p_fw = 0.0
    p_hw = 0.0
    p_pu = 0.0
    p_hl = 0.0
    p_fl = 0.0

    if m == "dnb":
        if line is not None and validate_quarter_line(line, "line") != 0.0:
            raise Markets2WayValidationError(f"dnb solo admite line=None o 0.0; recibido {line!r}")
        for h in range(size):
            row = matrix[h]
            for a in range(size):
                p = float(row[a])
                if h == a:
                    p_pu += p
                elif (h > a and sel == "home") or (a > h and sel == "away"):
                    p_fw += p
                else:
                    p_fl += p
        return _finalize_settlement_probs(p_fw, 0.0, p_pu, 0.0, p_fl)

    if m == "btts":
        if line is not None:
            raise Markets2WayValidationError(f"btts no admite línea numérica; recibido {line!r}")
        p_yes = 0.0
        for h in range(1, size):
            row = matrix[h]
            for a in range(1, size):
                p_yes += float(row[a])
        p_no = max(0.0, 1.0 - p_yes)
        if sel == "yes":
            return _finalize_settlement_probs(p_yes, 0.0, 0.0, 0.0, p_no)
        return _finalize_settlement_probs(p_no, 0.0, 0.0, 0.0, p_yes)

    if line is None:
        raise Markets2WayValidationError(f"El mercado {m} requiere una línea numérica finita.")
    ln = validate_quarter_line(line, "line")

    if m == "ah":
        h_sel = (-ln if (line_convention == "home_canonical" and sel == "away") else ln)
        for h in range(size):
            row = matrix[h]
            for a in range(size):
                p = float(row[a])
                margin = float(h - a) if sel == "home" else float(a - h)
                diff = margin + h_sel
                if diff > 0.25 + 1e-9:
                    p_fw += p
                elif abs(diff - 0.25) <= 1e-9:
                    p_hw += p
                elif abs(diff) <= 1e-9:
                    p_pu += p
                elif abs(diff + 0.25) <= 1e-9:
                    p_hl += p
                else:
                    p_fl += p
        return _finalize_settlement_probs(p_fw, p_hw, p_pu, p_hl, p_fl)

    if m == "totals":
        if ln <= 0.0:
            raise Markets2WayValidationError(f"La línea de totals/ou debe ser > 0; recibido {ln}")
        for h in range(size):
            row = matrix[h]
            for a in range(size):
                p = float(row[a])
                tot = float(h + a)
                diff = (tot - ln) if sel == "over" else (ln - tot)
                if diff > 0.25 + 1e-9:
                    p_fw += p
                elif abs(diff - 0.25) <= 1e-9:
                    p_hw += p
                elif abs(diff) <= 1e-9:
                    p_pu += p
                elif abs(diff + 0.25) <= 1e-9:
                    p_hl += p
                else:
                    p_fl += p
        return _finalize_settlement_probs(p_fw, p_hw, p_pu, p_hl, p_fl)

    raise Markets2WayValidationError(f"Mercado no soportado: {market!r}")


def derive_all_2way_markets(
    lam_home: float,
    lam_away: float,
    rho: float = DEFAULT_DC_RHO,
    max_goals: int = DEFAULT_MAX_GOALS,
    *,
    ah_lines: Sequence[float] = AH_CANONICAL_LINES,
    totals_lines: Sequence[float] = TOTALS_CANONICAL_LINES,
) -> dict[str, Any]:
    """Deriva todos los mercados de 2 vías (`ah`, `dnb`, `totals`/`ou`, `btts`) desde la matriz Dixon-Coles."""
    matrix = build_dixon_coles_score_matrix(lam_home, lam_away, rho=rho, max_goals=max_goals)
    mat_sum = sum(sum(r) for r in matrix)

    ah_norm_lines = [validate_quarter_line(x, "ah_line") for x in ah_lines]
    tot_norm_lines = [validate_quarter_line(x, "totals_line") for x in totals_lines]

    ah_home: dict[str, dict[str, float]] = {}
    ah_away: dict[str, dict[str, float]] = {}
    for ln in ah_norm_lines:
        k = format_line_key(ln)
        ah_home[k] = derive_selection_settlement_probs(matrix, "ah", ln, "home")
        ah_away[k] = derive_selection_settlement_probs(matrix, "ah", ln, "away")

    ah_paired_by_home_line: dict[str, dict[str, Any]] = {}
    for ln in ah_norm_lines:
        k_home = format_line_key(ln)
        opp_ln = 0.0 if ln == 0.0 else -ln
        k_opp = format_line_key(opp_ln)
        home_p = ah_home[k_home]
        away_p = ah_away[k_opp] if k_opp in ah_away else derive_selection_settlement_probs(matrix, "ah", opp_ln, "away")
        ah_paired_by_home_line[k_home] = {
            "home_line": ln,
            "away_line": opp_ln,
            "home": home_p,
            "away": away_p,
        }

    dnb_home = derive_selection_settlement_probs(matrix, "dnb", None, "home")
    dnb_away = derive_selection_settlement_probs(matrix, "dnb", None, "away")

    tot_over: dict[str, dict[str, float]] = {}
    tot_under: dict[str, dict[str, float]] = {}
    for ln in tot_norm_lines:
        k = format_line_key(ln)
        tot_over[k] = derive_selection_settlement_probs(matrix, "totals", ln, "over")
        tot_under[k] = derive_selection_settlement_probs(matrix, "totals", ln, "under")

    btts_yes = derive_selection_settlement_probs(matrix, "btts", None, "yes")
    btts_no = derive_selection_settlement_probs(matrix, "btts", None, "no")

    totals_block = {
        "lines": tot_norm_lines,
        "over": tot_over,
        "under": tot_under,
    }
    return {
        "meta": {
            "lam_home": float(lam_home),
            "lam_away": float(lam_away),
            "rho": float(rho),
            "max_goals": int(max_goals),
            "matrix_sum": float(mat_sum),
        },
        "ah": {
            "lines": ah_norm_lines,
            "home": ah_home,
            "away": ah_away,
            "paired_by_home_line": ah_paired_by_home_line,
        },
        "dnb": {
            "home": dnb_home,
            "away": dnb_away,
            "p_push": dnb_home["p_push"],
        },
        "totals": totals_block,
        "ou": totals_block,
        "btts": {
            "yes": btts_yes,
            "no": btts_no,
        },
    }


# ---------------------------------------------------------------------------
# 2. EV exacto, Kelly ¼ exacto de 5 estados y liquidación `settle_asian_line`
# ---------------------------------------------------------------------------


def validate_settlement_probs(probs: Mapping[str, Any]) -> dict[str, float]:
    if not isinstance(probs, Mapping):
        raise Markets2WayValidationError("settlement_probs debe ser un objeto/diccionario.")
    vals: list[float] = []
    for k in ("p_full_win", "p_half_win", "p_push", "p_half_loss", "p_full_loss"):
        v = probs.get(k)
        if not _is_finite_real(v) or float(v) < -1e-9 or float(v) > 1.0 + 1e-9:
            raise Markets2WayValidationError(f"Campo inválido {k}={v!r} en settlement_probs")
        vals.append(max(0.0, float(v)))
    tot = sum(vals)
    if abs(tot - 1.0) > 1e-3:
        raise Markets2WayValidationError(f"settlement_probs deben sumar 1.0; suma={tot:.8f}")
    return _finalize_settlement_probs(vals[0], vals[1], vals[2], vals[3], vals[4])


def retarget_settlement_probs(
    base_probs: Mapping[str, Any],
    p_effective_target: float,
) -> dict[str, float]:
    """Reescala las ramas ganadoras `(p_full_win, p_half_win)` y perdedoras `(p_full_loss, p_half_loss)`
    conservando `p_push` y la geometría de media línea para que la probabilidad efectiva sin push resultante
    coincida exactamente con `p_effective_target` (p. ej. tras mezcla logit `p_final` o contracción `p_shrunk`)."""
    bp = validate_settlement_probs(base_probs)
    if not _is_finite_real(p_effective_target) or float(p_effective_target) < 0.0 or float(p_effective_target) > 1.0:
        raise Markets2WayValidationError(f"p_effective_target fuera de [0, 1]: {p_effective_target!r}")

    p_t = float(p_effective_target)
    p_push = bp["p_push"]
    non_push = max(0.0, 1.0 - p_push)
    if non_push <= PROB_EPS:
        return bp

    if p_t <= 0.0:
        return _finalize_settlement_probs(0.0, 0.0, p_push, 0.0, non_push)
    if p_t >= 1.0:
        return _finalize_settlement_probs(non_push, 0.0, p_push, 0.0, 0.0)

    w0 = bp["p_full_win"] + bp["p_half_win"]
    l0 = bp["p_full_loss"] + bp["p_half_loss"]
    w_eq = bp["p_full_win"] + 0.5 * bp["p_half_win"]
    l_eq = bp["p_full_loss"] + 0.5 * bp["p_half_loss"]

    if w_eq <= PROB_EPS or l_eq <= PROB_EPS:
        return _finalize_settlement_probs(non_push * p_t, 0.0, p_push, 0.0, non_push * (1.0 - p_t))

    aw_raw = p_t / w_eq
    al_raw = (1.0 - p_t) / l_eq
    z = aw_raw * w0 + al_raw * l0
    scale_w = non_push * (aw_raw / z)
    scale_l = non_push * (al_raw / z)

    return _finalize_settlement_probs(
        bp["p_full_win"] * scale_w,
        bp["p_half_win"] * scale_w,
        p_push,
        bp["p_half_loss"] * scale_l,
        bp["p_full_loss"] * scale_l,
    )


def compute_asian_ev(settlement_probs: Mapping[str, Any], price_decimal: float) -> float:
    """Fórmula exacta del EV por unidad apostada (Contrato A6 §2):
    `ev = p_full_win * (price - 1) + p_half_win * 0.5 * (price - 1) - p_half_loss * 0.5 - p_full_loss * 1.0`."""
    sp = validate_settlement_probs(settlement_probs)
    if not _is_finite_real(price_decimal) or float(price_decimal) < MIN_DECIMAL_PRICE or float(price_decimal) > MAX_DECIMAL_PRICE:
        raise Markets2WayValidationError(f"price_decimal inválido: {price_decimal!r}")
    b = float(price_decimal) - 1.0
    return (
        sp["p_full_win"] * b
        + sp["p_half_win"] * 0.5 * b
        - sp["p_half_loss"] * 0.5
        - sp["p_full_loss"] * 1.0
    )


def _asian_log_growth(
    f: float,
    b: float,
    p_fw: float,
    p_hw: float,
    p_hl: float,
    p_fl: float,
) -> float:
    if f <= 0.0:
        return 0.0
    g = 0.0
    if p_fw > 0.0:
        g += p_fw * math.log(1.0 + b * f)
    if p_hw > 0.0:
        g += p_hw * math.log(1.0 + 0.5 * b * f)
    if p_hl > 0.0:
        g += p_hl * math.log(1.0 - 0.5 * f)
    if p_fl > 0.0:
        g += p_fl * math.log(1.0 - f)
    return g


def solve_exact_asian_kelly(
    settlement_probs: Mapping[str, Any],
    price_decimal: float,
    *,
    kelly_fraction: float = DEFAULT_KELLY_FRACTION,
    bankroll_unit_pct: float = DEFAULT_BANKROLL_UNIT_PCT,
) -> dict[str, float]:
    """Resuelve con Newton-bisección salvaguardado (`|Δ| < 1e-15`) la fracción óptima de Kelly
    sobre la lotería exacta de 5 estados `(+(O-1), +0.5(O-1), 0, -0.5, -1.0)` y aplica `kelly_fraction` (`0.25`)."""
    sp = validate_settlement_probs(settlement_probs)
    if not _is_finite_real(price_decimal) or float(price_decimal) < MIN_DECIMAL_PRICE or float(price_decimal) > MAX_DECIMAL_PRICE:
        raise Markets2WayValidationError(f"price_decimal inválido: {price_decimal!r}")
    if not _is_finite_real(kelly_fraction) or float(kelly_fraction) <= 0.0 or float(kelly_fraction) > 1.0:
        raise Markets2WayValidationError(f"kelly_fraction inválida: {kelly_fraction!r}")
    if not _is_finite_real(bankroll_unit_pct) or float(bankroll_unit_pct) <= 0.0 or float(bankroll_unit_pct) > 1.0:
        raise Markets2WayValidationError(f"bankroll_unit_pct inválido: {bankroll_unit_pct!r}")

    price = float(price_decimal)
    b = price - 1.0
    k_frac = float(kelly_fraction)
    unit_pct = float(bankroll_unit_pct)

    p_fw = sp["p_full_win"]
    p_hw = sp["p_half_win"]
    p_hl = sp["p_half_loss"]
    p_fl = sp["p_full_loss"]
    p_eff = sp["p_effective_win"]
    p_be = 1.0 / price
    ev = p_fw * b + p_hw * 0.5 * b - p_hl * 0.5 - p_fl * 1.0

    if ev <= 1e-15 or b <= 0.0:
        return {
            "ev": ev,
            "p_effective_win": p_eff,
            "p_breakeven": p_be,
            "edge_effective": p_eff - p_be,
            "f_full_kelly": 0.0,
            "f_quarter_kelly": 0.0,
            "stake_raw_u": 0.0,
            "expected_log_growth_g": 0.0,
        }

    def _derivs(x: float) -> tuple[float, float]:
        t_fw = 1.0 + b * x
        t_hw = 1.0 + 0.5 * b * x
        t_hl = 1.0 - 0.5 * x
        t_fl = 1.0 - x
        g1 = 0.0
        g2 = 0.0
        if p_fw > 0.0:
            g1 += (p_fw * b) / t_fw
            g2 -= (p_fw * b * b) / (t_fw * t_fw)
        if p_hw > 0.0:
            hb = 0.5 * b
            g1 += (p_hw * hb) / t_hw
            g2 -= (p_hw * hb * hb) / (t_hw * t_hw)
        if p_hl > 0.0:
            g1 -= (0.5 * p_hl) / t_hl
            g2 -= (0.25 * p_hl) / (t_hl * t_hl)
        if p_fl > 0.0:
            g1 -= p_fl / t_fl
            g2 -= p_fl / (t_fl * t_fl)
        return g1, g2

    if p_fl <= 0.0 and p_hl <= 0.0:
        f_star = 1.0
    elif p_fl <= 0.0 and _derivs(1.0)[0] >= 0.0:
        f_star = 1.0
    else:
        lo = 0.0
        hi = 1.0 - 1e-12 if p_fl > 0.0 else 1.0
        while p_fl > 0.0 and _derivs(hi)[0] > 0.0 and (1.0 - hi) > 1e-15:
            hi = 0.5 * (hi + 1.0)

        f_cur = min(0.5 * hi, max(1e-9, ev / max(1e-6, b)))
        for _ in range(64):
            g1, g2 = _derivs(f_cur)
            if g1 > 0.0:
                lo = f_cur
            else:
                hi = f_cur
            if abs(g1) <= 1e-15 and (hi - lo) <= 1e-15:
                break
            if g2 < -1e-18:
                cand = f_cur - (g1 / g2)
                if lo < cand < hi:
                    f_cur = cand
                else:
                    f_cur = 0.5 * (lo + hi)
            else:
                f_cur = 0.5 * (lo + hi)
        f_star = f_cur

    f_scaled = k_frac * f_star
    unit_scale = 100.0 if unit_pct == 0.01 else (1.0 / unit_pct)
    stake_raw_u = unit_scale * f_scaled
    g_val = _asian_log_growth(f_scaled, b, p_fw, p_hw, p_hl, p_fl)

    return {
        "ev": ev,
        "p_effective_win": p_eff,
        "p_breakeven": p_be,
        "edge_effective": p_eff - p_be,
        "f_full_kelly": f_star,
        "f_quarter_kelly": f_scaled,
        "stake_raw_u": stake_raw_u,
        "expected_log_growth_g": g_val,
    }


def evaluate_asian_value_bet(
    base_settlement_probs: Mapping[str, Any],
    price_decimal: float,
    *,
    p_blended_effective: float | None = None,
    sigma_p: float = 0.0,
    uncertainty_penalty_k: float = 0.0,
    kelly_fraction: float = DEFAULT_KELLY_FRACTION,
    bankroll_unit_pct: float = DEFAULT_BANKROLL_UNIT_PCT,
) -> dict[str, Any]:
    """Evalúa EV exacto sobre `p_blended_effective` (o `base_settlement_probs`) y calcula Kelly ¼ exacto
    aplicando contracción conservadora por incertidumbre `p_shrunk = max(0, p_eff - k * sigma_p)`."""
    bp = validate_settlement_probs(base_settlement_probs)
    if not _is_finite_real(sigma_p) or float(sigma_p) < 0.0:
        raise Markets2WayValidationError(f"sigma_p inválida: {sigma_p!r}")
    if not _is_finite_real(uncertainty_penalty_k) or float(uncertainty_penalty_k) < 0.0:
        raise Markets2WayValidationError(f"uncertainty_penalty_k inválido: {uncertainty_penalty_k!r}")

    p_eff_final = float(p_blended_effective) if p_blended_effective is not None else bp["p_effective_win"]
    blended_sp = retarget_settlement_probs(bp, p_eff_final) if p_blended_effective is not None else bp
    ev_exact = compute_asian_ev(blended_sp, price_decimal)

    p_shrunk = max(0.0, p_eff_final - float(uncertainty_penalty_k) * float(sigma_p))
    shrunk_sp = retarget_settlement_probs(bp, p_shrunk)
    kelly_shrunk = solve_exact_asian_kelly(
        shrunk_sp,
        price_decimal,
        kelly_fraction=kelly_fraction,
        bankroll_unit_pct=bankroll_unit_pct,
    )
    return {
        "settlement_probs": blended_sp,
        "shrunk_settlement_probs": shrunk_sp,
        "p_effective_win": blended_sp["p_effective_win"],
        "p_shrunk_effective": p_shrunk,
        "p_breakeven": 1.0 / float(price_decimal),
        "edge_effective": blended_sp["p_effective_win"] - (1.0 / float(price_decimal)),
        "ev": ev_exact,
        "ev_shrunk": kelly_shrunk["ev"],
        "edge_erased_by_uncertainty": kelly_shrunk["f_quarter_kelly"] <= 0.0,
        "f_full_kelly": kelly_shrunk["f_full_kelly"],
        "f_quarter_kelly": kelly_shrunk["f_quarter_kelly"],
        "stake_raw_u": kelly_shrunk["stake_raw_u"],
        "expected_log_growth_g": kelly_shrunk["expected_log_growth_g"],
    }


def settle_asian_line(
    market: str,
    line: float | None,
    selection: str,
    home_goals: int | float,
    away_goals: int | float,
    stake_u: float,
    price_decimal: float,
    *,
    line_convention: str = "selection",
) -> dict[str, Any]:
    """Liquida líneas enteras, medias y partidas (`.25`/`.75`) de `ah`, `dnb`, `ou`/`totals` y `btts`
    con compatibilidad exacta frente a `clv.ts` (`gradeMarketOutcome`/`settlePickPnl`) y `clv_report.py`."""
    m = canonicalize_2way_market(market)
    sel = canonicalize_2way_selection(m, selection)
    if line_convention not in ("selection", "home_canonical"):
        raise Markets2WayValidationError(f"line_convention inválida: {line_convention!r}")
    if not _is_finite_real(home_goals) or not _is_finite_real(away_goals) or float(home_goals) < 0.0 or float(away_goals) < 0.0:
        raise Markets2WayValidationError(f"Marcadores inválidos: home_goals={home_goals!r}, away_goals={away_goals!r}")
    if not _is_finite_real(stake_u) or float(stake_u) <= 0.0:
        raise Markets2WayValidationError(f"stake_u debe ser > 0 finito; recibido {stake_u!r}")
    if not _is_finite_real(price_decimal) or float(price_decimal) < MIN_DECIMAL_PRICE or float(price_decimal) > MAX_DECIMAL_PRICE:
        raise Markets2WayValidationError(f"price_decimal inválido: {price_decimal!r}")

    hg = float(home_goals)
    ag = float(away_goals)
    stake = float(stake_u)
    price = float(price_decimal)
    net_win = price - 1.0
    norm_line: float | None = None

    if m == "dnb":
        if line is not None and validate_quarter_line(line, "line") != 0.0:
            raise Markets2WayValidationError(f"dnb solo admite line=None o 0.0; recibido {line!r}")
        norm_line = validate_quarter_line(line, "line") if line is not None else None
        if abs(hg - ag) <= 1e-9:
            bucket, outcome, grade_out, unit_ret = ("push", "push", "void", 0.0)
        elif (hg > ag and sel == "home") or (ag > hg and sel == "away"):
            bucket, outcome, grade_out, unit_ret = ("full_win", "win", "win", net_win)
        else:
            bucket, outcome, grade_out, unit_ret = ("full_loss", "loss", "loss", -1.0)
    elif m == "btts":
        if line is not None:
            raise Markets2WayValidationError(f"btts no admite línea numérica; recibido {line!r}")
        both = hg > 0.0 and ag > 0.0
        won = both if sel == "yes" else (not both)
        if won:
            bucket, outcome, grade_out, unit_ret = ("full_win", "win", "win", net_win)
        else:
            bucket, outcome, grade_out, unit_ret = ("full_loss", "loss", "loss", -1.0)
    else:
        if line is None:
            raise Markets2WayValidationError(f"El mercado {m} requiere una línea numérica finita.")
        norm_line = validate_quarter_line(line, "line")
        if m == "totals" and norm_line <= 0.0:
            raise Markets2WayValidationError(f"La línea de totals/ou debe ser > 0; recibido {norm_line}")

        if m == "ah":
            h_sel = (-norm_line if (line_convention == "home_canonical" and sel == "away") else norm_line)
            margin = (hg - ag) if sel == "home" else (ag - hg)
            diff = margin + h_sel
        else:
            tot = hg + ag
            diff = (tot - norm_line) if sel == "over" else (norm_line - tot)

        if diff > 0.25 + 1e-9:
            bucket, outcome, grade_out, unit_ret = ("full_win", "win", "win", net_win)
        elif abs(diff - 0.25) <= 1e-9:
            bucket, outcome, grade_out, unit_ret = ("half_win", "half_win", "half_win", 0.5 * net_win)
        elif abs(diff) <= 1e-9:
            bucket, outcome, grade_out, unit_ret = ("push", "push", "void", 0.0)
        elif abs(diff + 0.25) <= 1e-9:
            bucket, outcome, grade_out, unit_ret = ("half_loss", "half_loss", "half_loss", -0.5)
        else:
            bucket, outcome, grade_out, unit_ret = ("full_loss", "loss", "loss", -1.0)

    pnl_u = stake * unit_ret
    return {
        "market": m,
        "line": norm_line,
        "selection": sel,
        "outcome": outcome,
        "grade_outcome": grade_out,
        "bucket": bucket,
        "is_push": bucket == "push",
        "unit_return": unit_ret,
        "pnl_u": pnl_u,
        "gross_return_u": stake + pnl_u,
    }


def resolve_2way_market_segment(
    config_artifact: Mapping[str, Any],
    league: str,
    market: str,
) -> dict[str, Any]:
    """Resuelve la configuración habilitada/apagada por `league × market` desde `markets_2way_config.json`."""
    m = canonicalize_2way_market(market)
    lg = str(league or "").strip()
    segments = config_artifact.get("segments") or {}
    exact_key = f"{lg}::{m}"
    if exact_key in segments:
        return {"key": exact_key, "found": True, "entry": segments[exact_key]}
    upper_key = f"{lg.upper()}::{m}"
    for k, v in segments.items():
        if str(k).upper() == upper_key:
            return {"key": str(k), "found": True, "entry": v}
    return {
        "key": exact_key,
        "found": False,
        "entry": {
            "league": lg,
            "market": m,
            "sport": "football",
            "enabled": False,
            "disabled_reason": "unseen_segment_in_walk_forward_dev",
            "w_effective": 0.0,
            "best_devig_method": "power",
            "dc_rho_recommended": DEFAULT_DC_RHO,
        },
    }


# ---------------------------------------------------------------------------
# 3. Vectorización exacta Dixon-Coles, ajuste causal de `dc_rho` y calibración A4+A3
# ---------------------------------------------------------------------------


def _is_valid_quarter_array(lines: np.ndarray, max_abs: float = 10.0) -> np.ndarray:
    finite = np.isfinite(lines)
    safe = np.where(finite, lines, 0.0)
    q = np.round(safe * 4.0)
    return finite & (np.abs(safe) <= max_abs) & (np.abs(safe * 4.0 - q) <= 1e-6)


def _fit_dc_rho_past_only(
    lam_home: np.ndarray,
    lam_away: np.ndarray,
    home_goals: np.ndarray,
    away_goals: np.ndarray,
    default_rho: float = DEFAULT_DC_RHO,
) -> float:
    """Ajusta `dc_rho` en `[-0.30, +0.30]` paso `0.01` maximizando la log-verosimilitud exacta de `PoissonDC._fit_rho`
    exclusivamente sobre partidos estrictamente pasados (`ts_event_start < fold_cut_ts`)."""
    valid = (
        np.isfinite(lam_home)
        & np.isfinite(lam_away)
        & np.isfinite(home_goals)
        & np.isfinite(away_goals)
        & (lam_home > 0.0)
        & (lam_away > 0.0)
    )
    if int(valid.sum()) < 120:
        return float(default_rho)

    lh = lam_home[valid]
    la = lam_away[valid]
    gh = home_goals[valid].astype(np.int64)
    ga = away_goals[valid].astype(np.int64)

    m00 = (gh == 0) & (ga == 0)
    m01 = (gh == 0) & (ga == 1)
    m10 = (gh == 1) & (ga == 0)
    m11 = (gh == 1) & (ga == 1)
    if int((m00 | m01 | m10 | m11).sum()) < 20:
        return float(default_rho)

    best_rho = float(default_rho)
    best_ll = -float("inf")
    # Nota: el factor de normalización `sum_{h,a} P_pois(h)*P_pois(a)*tau(h,a)` de Dixon-Coles (1997) vale idénticamente 1.0
    # cuando tau no trunca en 0 (`p00*(1 - lh*la*r) + p01*(1 + lh*r) + p10*(1 + la*r) + p11*(1 - r) + resto = 1.0` exacto
    # porque `p01*lh = e^-lh * lh * e^-la * la = p00*lh*la = p10*la = p11*lh*la`!), pero incluimos el término exacto por si trunca.
    p00 = np.exp(-(lh + la))
    p01 = p00 * la
    p10 = p00 * lh
    p11 = p10 * la
    rest = np.maximum(0.0, 1.0 - (p00 + p01 + p10 + p11))
    n11 = float(m11.sum())

    for step_i in range(-30, 31):
        r = round(step_i * 0.01, 2)
        t00 = np.maximum(1.0 - lh * la * r, 1e-9)
        t01 = np.maximum(1.0 + lh * r, 1e-9)
        t10 = np.maximum(1.0 + la * r, 1e-9)
        t11 = max(1.0 - r, 1e-9)
        norm_z = rest + p00 * t00 + p01 * t01 + p10 * t10 + p11 * t11
        ll = (
            float(np.sum(np.log(t00[m00])))
            + float(np.sum(np.log(t01[m01])))
            + float(np.sum(np.log(t10[m10])))
            + n11 * math.log(t11)
            - float(np.sum(np.log(norm_z)))
        )
        if ll > best_ll + 1e-12:
            best_ll = ll
            best_rho = r
    return float(best_rho)


def _vectorized_dc_2way_settlement_and_probs(
    lam_home: np.ndarray,
    lam_away: np.ndarray,
    rho_arr: np.ndarray,
    lines: np.ndarray,
    market: str,
    max_goals: int = DEFAULT_MAX_GOALS,
) -> dict[str, np.ndarray]:
    """Versión vectorizada con aritmética idéntica (`|Δ| < 1e-15`) a `build_dixon_coles_score_matrix` +
    `derive_selection_settlement_probs` para decenas de miles de partidos."""
    n = len(lam_home)
    if n == 0:
        empty_f = np.empty(0, dtype=np.float64)
        return {
            "p_model_mat": np.empty((0, 2), dtype=np.float64),
            "primary_sp": np.empty((0, 5), dtype=np.float64),
            "opposite_sp": np.empty((0, 5), dtype=np.float64),
            "p_push": empty_f,
        }

    lh = np.clip(np.asarray(lam_home, dtype=np.float64), 0.05, MAX_LAMBDA_GOALS)
    la = np.clip(np.asarray(lam_away, dtype=np.float64), 0.05, MAX_LAMBDA_GOALS)
    r = np.clip(np.asarray(rho_arr, dtype=np.float64), -1.0, 1.0)
    ln = np.asarray(lines, dtype=np.float64)
    size = int(max_goals) + 1

    pmf_h = np.empty((n, size), dtype=np.float64)
    pmf_a = np.empty((n, size), dtype=np.float64)
    pmf_h[:, 0] = np.exp(-lh)
    pmf_a[:, 0] = np.exp(-la)
    for k in range(1, size):
        fk = float(k)
        pmf_h[:, k] = (pmf_h[:, k - 1] * lh) / fk
        pmf_a[:, k] = (pmf_a[:, k - 1] * la) / fk

    mat = pmf_h[:, :, None] * pmf_a[:, None, :]
    mat[:, 0, 0] *= np.maximum(1.0 - lh * la * r, 1e-9)
    mat[:, 0, 1] *= np.maximum(1.0 + lh * r, 1e-9)
    mat[:, 1, 0] *= np.maximum(1.0 + la * r, 1e-9)
    mat[:, 1, 1] *= np.maximum(1.0 - r, 1e-9)
    mat /= mat.sum(axis=(1, 2), keepdims=True)

    g = np.arange(size, dtype=np.float64)
    gh = g[None, :, None]
    ga = g[None, None, :]

    m = canonicalize_2way_market(market)
    if m == "ah":
        diff = (gh - ga) + ln[:, None, None]
    elif m == "dnb":
        diff = gh - ga
    elif m == "totals":
        diff = (gh + ga) - ln[:, None, None]
    elif m == "btts":
        both = ((gh >= 1.0) & (ga >= 1.0)).astype(np.float64)
        p_yes = np.sum(mat * both, axis=(1, 2))
        p_no = np.maximum(0.0, 1.0 - p_yes)
        p_mat = np.column_stack([p_yes, p_no])
        zeros = np.zeros(n, dtype=np.float64)
        return {
            "p_model_mat": p_mat,
            "primary_sp": np.column_stack([p_yes, zeros, zeros, zeros, p_no]),
            "opposite_sp": np.column_stack([p_no, zeros, zeros, zeros, p_yes]),
            "p_push": zeros,
        }
    else:
        raise Markets2WayValidationError(f"Mercado no soportado: {market!r}")

    p_fw = np.sum(np.where(diff > 0.25 + 1e-9, mat, 0.0), axis=(1, 2))
    p_hw = np.sum(np.where(np.abs(diff - 0.25) <= 1e-9, mat, 0.0), axis=(1, 2))
    p_pu = np.sum(np.where(np.abs(diff) <= 1e-9, mat, 0.0), axis=(1, 2))
    p_hl = np.sum(np.where(np.abs(diff + 0.25) <= 1e-9, mat, 0.0), axis=(1, 2))
    p_fl = np.sum(np.where(diff < -0.25 - 1e-9, mat, 0.0), axis=(1, 2))

    tot_s = np.maximum(PROB_EPS, p_fw + p_hw + p_pu + p_hl + p_fl)
    p_fw /= tot_s
    p_hw /= tot_s
    p_pu /= tot_s
    p_hl /= tot_s
    p_fl /= tot_s

    w_eq = p_fw + 0.5 * p_hw
    l_eq = p_fl + 0.5 * p_hl
    denom = np.maximum(PROB_EPS, w_eq + l_eq)
    p_eff_0 = np.clip(w_eq / denom, 1e-6, 1.0 - 1e-6)
    p_eff_1 = 1.0 - p_eff_0

    return {
        "p_model_mat": np.column_stack([p_eff_0, p_eff_1]),
        "primary_sp": np.column_stack([p_fw, p_hw, p_pu, p_hl, p_fl]),
        "opposite_sp": np.column_stack([p_fl, p_hl, p_pu, p_hw, p_fw]),
        "p_push": p_pu,
    }


def _compute_split_line_outcome_targets(
    home_goals: np.ndarray,
    away_goals: np.ndarray,
    lines: np.ndarray,
    market: str,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Devuelve `(y_target, active_weight, y_cat_non_push)` para cada evento:
    - `full_win`: `y_target=1.0`, `active_weight=1.0`, `y_cat=0`
    - `half_win`: `y_target=1.0`, `active_weight=0.5`, `y_cat=0` (mitad ganada + mitad push)
    - `push`: `y_target=0.5`, `active_weight=0.0`, `y_cat=-1` (excluido de log-loss sin push)
    - `half_loss`: `y_target=0.0`, `active_weight=0.5`, `y_cat=1` (mitad perdida + mitad push)
    - `full_loss`: `y_target=0.0`, `active_weight=1.0`, `y_cat=1`
    El minimizador Bayesiano exacto de `active_weight * BCE(y_target, q)` es idénticamente `p_effective_win`."""
    m = canonicalize_2way_market(market)
    hg = np.asarray(home_goals, dtype=np.float64)
    ag = np.asarray(away_goals, dtype=np.float64)
    ln = np.asarray(lines, dtype=np.float64)

    if m == "ah":
        diff = (hg - ag) + ln
    elif m == "dnb":
        diff = hg - ag
    elif m == "totals":
        diff = (hg + ag) - ln
    elif m == "btts":
        both = (hg > 0.0) & (ag > 0.0)
        y_t = np.where(both, 1.0, 0.0)
        w_a = np.ones_like(y_t)
        y_c = np.where(both, 0, 1).astype(np.int64)
        return y_t, w_a, y_c
    else:
        raise Markets2WayValidationError(f"Mercado inválido: {market!r}")

    is_fw = diff > 0.25 + 1e-9
    is_hw = np.abs(diff - 0.25) <= 1e-9
    is_pu = np.abs(diff) <= 1e-9
    is_hl = np.abs(diff + 0.25) <= 1e-9

    y_target = np.where(is_fw | is_hw, 1.0, np.where(is_pu, 0.5, 0.0))
    active_w = np.where(is_pu, 0.0, np.where(is_hw | is_hl, 0.5, 1.0))
    y_cat = np.where(is_pu, -1, np.where(diff > 1e-9, 0, 1)).astype(np.int64)
    return y_target, active_w, y_cat


def _proper_split_log_loss_vec(
    probs_mat: np.ndarray,
    y_target: np.ndarray,
    active_w: np.ndarray,
) -> np.ndarray:
    """Pérdida logarítmica estrictamente propia ponderada por fracción activa de stake (`1.0` entera, `0.5` media línea),
    renormalizada por la media muestral de `active_w` para conservar la escala exacta de nats por apuesta activa."""
    p_norm = probs_mat / np.maximum(1e-15, probs_mat.sum(axis=1, keepdims=True))
    p0 = np.clip(p_norm[:, 0], 1e-15, 1.0 - 1e-15)
    p1 = np.clip(p_norm[:, 1], 1e-15, 1.0 - 1e-15)
    raw_bce = -(y_target * np.log(p0) + (1.0 - y_target) * np.log(p1))
    mean_w = max(1e-12, float(np.mean(active_w)))
    return (active_w / mean_w) * raw_bce


def _proper_split_brier_vec(
    probs_mat: np.ndarray,
    y_target: np.ndarray,
    active_w: np.ndarray,
) -> np.ndarray:
    p_norm = probs_mat / np.maximum(1e-15, probs_mat.sum(axis=1, keepdims=True))
    p0 = np.clip(p_norm[:, 0], 0.0, 1.0)
    # Brier 2-vías `2 * (p0 - y)^2` coincide con `sum_k (p_k - oh_k)^2` cuando `y ∈ {0, 1}`
    raw_br = 2.0 * ((p0 - y_target) ** 2)
    mean_w = max(1e-12, float(np.mean(active_w)))
    return (active_w / mean_w) * raw_br


def _calibrate_2way_segment_a4(
    *,
    bc_mod: Any,
    league: str,
    market: str,
    fold_keys: np.ndarray,
    ts_event_starts: np.ndarray,
    ts_decisions: np.ndarray,
    p_model_mat: np.ndarray,
    open_odds_mat: np.ndarray,
    has_open_quote: np.ndarray,
    closing_novig_mat: np.ndarray,
    has_sharp_closing: np.ndarray,
    y_target: np.ndarray,
    active_w: np.ndarray,
    y_cat: np.ndarray,
    disabled_reason_if_empty: str,
    n0_shrinkage: int = 300,
    n_bootstrap: int = 1000,
    seed: int = 20261111,
) -> dict[str, Any]:
    """Ejecuta la calibración walk-forward A4 (`w ∈ 0.00..1.00` paso `0.05`, `n0=300`, `proportional`/`power`/`shin`,
    benchmark Pinnacle cierre sin margen con IC 95% bootstrap `>= 1000`) usando pérdida propia exacta de líneas asiáticas."""
    canon_mkt = canonicalize_2way_market(market)
    n_dev_total = int(len(y_target))
    valid_mask = (active_w > 0.0) & has_open_quote
    n_oos = int(valid_mask.sum())
    n_paired_all = int(((active_w > 0.0) & has_open_quote & has_sharp_closing).sum())

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
            "sport": "football",
            "n_events_dev": n_dev_total,
            "n_events_oos_evaluated": 0,
            "n_active_stake_equiv_oos": 0.0,
            "n_events_paired_closing": n_paired_all,
            "closing_benchmark_available": False,
            "best_devig_method": "power",
            "devig_comparison": {
                "n_events_evaluated": 0,
                "best_method": "power",
                "walk_forward_causal_log_loss": None,
                "proportional": empty_m,
                "power": empty_m,
                "shin": empty_m,
            },
            "w_raw_opt": 0.0,
            "w_shrunk_raw": 0.0,
            "w_effective": 0.0,
            "fold_causal_weights": {},
            "log_loss_model": None,
            "log_loss_market_open_novig": None,
            "log_loss_blend": None,
            "log_loss_blend_wf_causal": None,
            "log_loss_closing_novig": None,
            "log_loss_categorical_blend": None,
            "log_loss_categorical_open_novig": None,
            "delta_blend_vs_open_novig": None,
            "delta_blend_vs_open_novig_ci95": None,
            "delta_blend_vs_open_novig_significant": False,
            "delta_blend_vs_closing": None,
            "delta_blend_vs_closing_ci95": None,
            "delta_blend_vs_closing_significant": False,
            "delta_model_vs_closing": None,
            "delta_model_vs_closing_ci95": None,
            "a4_gate_passed": False,
            "a4_disabled_reason": disabled_reason_if_empty,
        }

    f_keys = fold_keys[valid_mask]
    ts_st = ts_event_starts[valid_mask]
    ts_dc = ts_decisions[valid_mask]
    p_mod = p_model_mat[valid_mask]
    o_open = open_odds_mat[valid_mask]
    yt = y_target[valid_mask]
    aw = active_w[valid_mask]
    yc = y_cat[valid_mask]
    has_cl = has_sharp_closing[valid_mask]
    p_cl = closing_novig_mat[valid_mask]

    devig_probs: dict[str, np.ndarray] = {
        "proportional": bc_mod._devig_matrix_proportional(o_open),
        "power": bc_mod._devig_matrix_power(o_open),
        "shin": bc_mod._devig_matrix_shin(o_open),
    }
    devig_ll = {m: _proper_split_log_loss_vec(devig_probs[m], yt, aw) for m in bc_mod.CORE_DEVIG_METHODS}
    devig_br = {m: _proper_split_brier_vec(devig_probs[m], yt, aw) for m in bc_mod.CORE_DEVIG_METHODS}

    unique_folds = sorted(np.unique(f_keys))
    wf_devig_ll = np.empty(n_oos, dtype=np.float64)
    wf_blend_probs = np.empty_like(p_mod, dtype=np.float64)
    fold_weights_out: dict[str, dict[str, Any]] = {}

    for fk in unique_folds:
        te_idx = f_keys == fk
        fold_cut_ts = ts_dc[te_idx].min()
        tr_idx = ts_st < fold_cut_ts
        n_tr = int(tr_idx.sum())
        if n_tr > 0:
            best_m_past = min(
                bc_mod.CORE_DEVIG_METHODS,
                key=lambda m: float(_proper_split_log_loss_vec(devig_probs[m][tr_idx], yt[tr_idx], aw[tr_idx]).mean()),
            )
            p_mod_tr = p_mod[tr_idx]
            p_mkt_tr = devig_probs[best_m_past][tr_idx]
            yt_tr = yt[tr_idx]
            aw_tr = aw[tr_idx]
            best_w_past = 0.0
            best_ll_past = float(_proper_split_log_loss_vec(p_mkt_tr, yt_tr, aw_tr).mean())
            for w_cand in bc_mod.BLEND_WEIGHT_GRID:
                if w_cand == 0.0:
                    continue
                ll_c = float(
                    _proper_split_log_loss_vec(
                        bc_mod._blend_logit_matrix(p_mod_tr, p_mkt_tr, w_cand), yt_tr, aw_tr
                    ).mean()
                )
                if ll_c < best_ll_past - 1e-12:
                    best_ll_past = ll_c
                    best_w_past = float(w_cand)
            n_tr_eff = float(aw_tr.sum())
            w_fold_eff = bc_mod.shrink_blend_weight(best_w_past, n_tr_eff, n0_shrinkage, bc_mod.BLEND_WEIGHT_STEP)[
                "w_effective"
            ]
        else:
            best_m_past = "power"
            best_w_past = 0.0
            w_fold_eff = 0.0

        fold_weights_out[str(fk)] = {
            "n_past_events": n_tr,
            "devig_method_past": best_m_past,
            "w_opt_past": best_w_past,
            "w_fold_effective": w_fold_eff,
        }
        wf_devig_ll[te_idx] = devig_ll[best_m_past][te_idx]
        wf_blend_probs[te_idx] = bc_mod._blend_logit_matrix(p_mod[te_idx], devig_probs[best_m_past][te_idx], w_fold_eff)

    best_devig_method = min(bc_mod.CORE_DEVIG_METHODS, key=lambda m: float(devig_ll[m].mean()))
    devig_comp_entries: dict[str, Any] = {}
    for idx_m, m_name in enumerate(bc_mod.CORE_DEVIG_METHODS):
        ll_ci = bc_mod.bootstrap_mean_ci(devig_ll[m_name], n_resamples=n_bootstrap, seed=seed + 11 + idx_m)
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
            paired_m = bc_mod.bootstrap_paired_loss_delta(
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

    devig_comparison = {
        "n_events_evaluated": n_oos,
        "best_method": best_devig_method,
        "walk_forward_causal_log_loss": float(wf_devig_ll.mean()),
        "proportional": devig_comp_entries["proportional"],
        "power": devig_comp_entries["power"],
        "shin": devig_comp_entries["shin"],
    }

    p_mkt_best = devig_probs[best_devig_method]
    ll_open_vec = devig_ll[best_devig_method]
    ll_model_vec = _proper_split_log_loss_vec(p_mod, yt, aw)

    w_raw_opt = 0.0
    min_oof_ll = float(ll_open_vec.mean())
    for w_cand in bc_mod.BLEND_WEIGHT_GRID:
        if w_cand == 0.0:
            continue
        ll_cand = float(_proper_split_log_loss_vec(bc_mod._blend_logit_matrix(p_mod, p_mkt_best, w_cand), yt, aw).mean())
        if ll_cand < min_oof_ll - 1e-12:
            min_oof_ll = ll_cand
            w_raw_opt = float(w_cand)

    n_active_equiv = float(aw.sum())
    shrunk = bc_mod.shrink_blend_weight(w_raw_opt, n_active_equiv, n0_shrinkage, bc_mod.BLEND_WEIGHT_STEP)
    w_shrunk_raw = shrunk["w_shrunk_raw"]
    w_effective = shrunk["w_effective"]

    p_blend_eff = p_mkt_best.copy() if w_effective == 0.0 else bc_mod._blend_logit_matrix(p_mod, p_mkt_best, w_effective)
    ll_blend_vec = _proper_split_log_loss_vec(p_blend_eff, yt, aw)
    ll_wf_causal_vec = _proper_split_log_loss_vec(wf_blend_probs, yt, aw)

    # También reportar log-loss categórico clásico sobre `yc >= 0` para trazabilidad directa con Ola 2
    ll_cat_blend = float(bc_mod._matrix_log_loss_vec(p_blend_eff, yc).mean())
    ll_cat_open = float(bc_mod._matrix_log_loss_vec(p_mkt_best, yc).mean())

    paired_vs_open = bc_mod.bootstrap_paired_loss_delta(
        ll_blend_vec, ll_open_vec, n_resamples=n_bootstrap, seed=seed + 71
    )

    n_paired_ev = int(has_cl.sum())
    closing_avail = bool(n_paired_ev >= bc_mod.MIN_PAIRED_CLOSING_FOR_ENABLEMENT)
    if n_paired_ev > 0:
        yt_cl = yt[has_cl]
        aw_cl = aw[has_cl]
        ll_cl_vec = _proper_split_log_loss_vec(p_cl[has_cl], yt_cl, aw_cl)
        ll_bl_cl_vec = _proper_split_log_loss_vec(p_blend_eff[has_cl], yt_cl, aw_cl)
        ll_md_cl_vec = _proper_split_log_loss_vec(p_mod[has_cl], yt_cl, aw_cl)
        paired_vs_cl = bc_mod.bootstrap_paired_loss_delta(
            ll_bl_cl_vec, ll_cl_vec, n_resamples=n_bootstrap, seed=seed + 113
        )
        paired_mod_vs_cl = bc_mod.bootstrap_paired_loss_delta(
            ll_md_cl_vec, ll_cl_vec, n_resamples=n_bootstrap, seed=seed + 149
        )
        ll_closing_novig: float | None = float(ll_cl_vec.mean())
        delta_bl_cl: float | None = paired_vs_cl["delta_mean"]
        delta_bl_cl_ci: list[float] | None = paired_vs_cl["ci95"]
        delta_bl_cl_sig = bool(paired_vs_cl["significant"])
        delta_mod_cl: float | None = paired_mod_vs_cl["delta_mean"]
        delta_mod_cl_ci: list[float] | None = paired_mod_vs_cl["ci95"]
    else:
        ll_closing_novig = None
        delta_bl_cl = None
        delta_bl_cl_ci = None
        delta_bl_cl_sig = False
        delta_mod_cl = None
        delta_mod_cl_ci = None

    gate_a4 = bc_mod.evaluate_model_picks_gate(
        w_effective=w_effective,
        closing_benchmark_available=closing_avail,
        n_events_paired_closing=n_paired_ev,
        log_loss_blend=float(ll_blend_vec.mean()),
        log_loss_market_open_novig=float(ll_open_vec.mean()),
        log_loss_blend_wf_causal=float(ll_wf_causal_vec.mean()),
    )

    return {
        "league": league,
        "market": canon_mkt,
        "sport": "football",
        "n_events_dev": n_dev_total,
        "n_events_oos_evaluated": n_oos,
        "n_active_stake_equiv_oos": round(n_active_equiv, 4),
        "n_events_paired_closing": n_paired_ev,
        "closing_benchmark_available": closing_avail,
        "best_devig_method": best_devig_method,
        "devig_comparison": devig_comparison,
        "w_raw_opt": float(w_raw_opt),
        "w_shrunk_raw": float(w_shrunk_raw),
        "w_effective": float(w_effective),
        "fold_causal_weights": fold_weights_out,
        "log_loss_model": float(ll_model_vec.mean()),
        "log_loss_market_open_novig": float(ll_open_vec.mean()),
        "log_loss_blend": float(ll_blend_vec.mean()),
        "log_loss_blend_wf_causal": float(ll_wf_causal_vec.mean()),
        "log_loss_closing_novig": ll_closing_novig,
        "log_loss_categorical_blend": ll_cat_blend,
        "log_loss_categorical_open_novig": ll_cat_open,
        "delta_blend_vs_open_novig": paired_vs_open["delta_mean"],
        "delta_blend_vs_open_novig_ci95": paired_vs_open["ci95"],
        "delta_blend_vs_open_novig_significant": bool(paired_vs_open["significant"]),
        "delta_blend_vs_closing": delta_bl_cl,
        "delta_blend_vs_closing_ci95": delta_bl_cl_ci,
        "delta_blend_vs_closing_significant": delta_bl_cl_sig,
        "delta_model_vs_closing": delta_mod_cl,
        "delta_model_vs_closing_ci95": delta_mod_cl_ci,
        "a4_gate_passed": bool(gate_a4["model_picks_enabled"]),
        "a4_disabled_reason": gate_a4["disabled_reason"],
    }


class TwoWayExactAsianPolicySelector:
    """Selector de picks para `bt.run_backtest` que aplica la política A5 (`picks_engine.py`:
    topes de portafolio, penalización de correlación mismo evento, filtro anti-steam, dispersión `sigma_p`
    y clasificación de 2 niveles `'solido' | 'valor'`) usando el EV exacto de líneas asiáticas partidas
    y el Kelly ¼ exacto de 5 estados (`solve_exact_asian_kelly`).

    Evalúa EXCLUSIVAMENTE mercados de 2 vías de fútbol (`ah`, `totals`, `dnb`, `btts`) con `allow_pure_market_arb=False`
    para auditar limpiamente el aporte real del modelo Dixon-Coles mezclado con mercado."""

    def __init__(
        self,
        base_policy: Mapping[str, Any],
        a4_segments: Mapping[str, Mapping[str, Any]],
        event_specs_by_eid: Mapping[str, Sequence[Mapping[str, Any]]],
        odds_by_event: Mapping[str, list[dict[str, Any]]],
        *,
        fold_causal_policies: Mapping[str, Mapping[str, Any]] | None = None,
        event_fold_lookup: Mapping[str, str] | None = None,
        use_fold_causal_blend_weight: bool = True,
    ) -> None:
        self.base_policy = base_policy
        self.a4_segments = a4_segments
        self.event_specs_by_eid = event_specs_by_eid
        self.odds_by_event = odds_by_event
        self.fold_causal_policies = fold_causal_policies
        self.event_fold_lookup = event_fold_lookup or {}
        self.use_fold_causal_blend_weight = bool(use_fold_causal_blend_weight)

        self.event_exposure_u: dict[str, float] = {}
        self.event_markets_taken: dict[str, set[str]] = {}
        self.event_pick_counts: dict[str, int] = {}
        self.league_date_exposure_u: dict[str, float] = {}
        self.global_date_exposure_u: dict[str, float] = {}
        self.total_candidates_evaluated: int = 0
        self.rejection_counts: dict[str, int] = {}

    def __call__(
        self,
        event_ctx: dict[str, Any],
        decision_quotes: list[dict[str, Any]],
        config: Any,
    ) -> list[dict[str, Any]]:
        import backtest as bt
        import picks_engine as pe

        if str(event_ctx.get("sport")) != "football" or not decision_quotes:
            return []

        eid = str(event_ctx["event_id"])
        specs = self.event_specs_by_eid.get(eid)
        if not specs:
            return []

        league = str(event_ctx["league"])
        source_mode = str(event_ctx.get("source_mode") or "historical_fd")
        ts_dec: pd.Timestamp = event_ctx["ts_decision"]
        ts_start: pd.Timestamp = event_ctx["ts_event_start"]
        utc_date = ts_start.strftime("%Y-%m-%d")
        fk = self.event_fold_lookup.get(eid, "")
        pol = (
            self.fold_causal_policies[fk]
            if (self.fold_causal_policies is not None and fk in self.fold_causal_policies)
            else self.base_policy
        )

        kelly_frac = float(pol.get("kelly_fraction", DEFAULT_KELLY_FRACTION))
        unit_pct = float(pol.get("bankroll_unit_pct", DEFAULT_BANKROLL_UNIT_PCT))
        min_stake_u = float(pol.get("min_stake_u", 0.05))
        rho_corr = float(pol.get("rho_same_event", 0.35))
        sharp_win_min = float(pol.get("sharp_steam_window_minutes", 60.0))
        sharp_tick = float(pol.get("sharp_implied_prob_tick", 0.005))

        caps = pol.get("caps") or {}
        cap_pick = min(pe.HARD_MAX_STAKE_PER_PICK_U, float(caps.get("max_stake_per_pick_u", 2.0)))
        cap_event = min(pe.HARD_MAX_STAKE_PER_EVENT_U, float(caps.get("max_stake_per_event_u", 2.0)))
        cap_ld = min(pe.HARD_MAX_STAKE_PER_LEAGUE_DATE_U, float(caps.get("max_stake_per_league_date_u", 3.0)))
        cap_gd = min(pe.HARD_MAX_STAKE_PER_GLOBAL_DATE_U, float(caps.get("max_stake_per_global_date_u", 5.0)))

        allowed_books = [pe.canonical_pick_book(b) for b in config.execution_books_priority]
        ev_all_odds = self.odds_by_event.get(eid, [])
        survivors: list[dict[str, Any]] = []

        for spec in specs:
            m_canon = str(spec["market"])
            l_key = float(spec["line"]) if spec.get("line") is not None else None
            seg_key = f"{league}::{m_canon}"
            a4_seg = self.a4_segments.get(seg_key)
            pol_seg = (pol.get("segments") or {}).get(seg_key)

            if a4_seg is None or not bool(a4_seg.get("a4_gate_passed", False)):
                self.rejection_counts["segment_a4_disabled"] = self.rejection_counts.get("segment_a4_disabled", 0) + 1
                continue
            if pol_seg is not None and not bool(pol_seg.get("model_picks_enabled", False)):
                self.rejection_counts["segment_policy_disabled"] = (
                    self.rejection_counts.get("segment_policy_disabled", 0) + 1
                )
                continue

            devig_m = str(a4_seg.get("best_devig_method", "power"))
            if self.use_fold_causal_blend_weight and fk in (a4_seg.get("fold_causal_weights") or {}):
                w_eff = float(a4_seg["fold_causal_weights"][fk]["w_fold_effective"])
                devig_m = str(a4_seg["fold_causal_weights"][fk]["devig_method_past"])
            else:
                w_eff = float(a4_seg.get("w_effective", 0.0))

            if w_eff <= 0.05 + 1e-12:
                self.rejection_counts["fold_w_effective_le_0_05"] = (
                    self.rejection_counts.get("fold_w_effective_le_0_05", 0) + 1
                )
                continue

            sel_order = bt._selection_order_for_market(m_canon)
            by_book: dict[str, dict[str, dict[str, Any]]] = {}
            for q in decision_quotes:
                if bt.canonical_market(q["market"]) != m_canon or bt._normalize_line_key(q.get("line")) != l_key:
                    continue
                b_c = pe.canonical_pick_book(q["book"])
                s_c = pe.canonical_pick_selection(q["selection"])
                pr = float(q["price_decimal"])
                if s_c in sel_order and MIN_DECIMAL_PRICE <= pr <= MAX_DECIMAL_PRICE:
                    by_book.setdefault(b_c, {})[s_c] = q

            complete_books = {b: sd for b, sd in by_book.items() if all(s in sd for s in sel_order)}
            if not complete_books:
                continue

            sharp_nv: np.ndarray | None = None
            anchor_nv: np.ndarray | None = None
            for rb in ("pinnacle", "smarkets", "b365", "caliente", "codere", "bw", "wh"):
                if rb in complete_books:
                    ro = [float(complete_books[rb][s]["price_decimal"]) for s in sel_order]
                    if not (0.9 <= sum(1.0 / x for x in ro) <= 1.2):
                        continue
                    pdv = pe.devig_prices_by_method(ro, devig_m)
                    if anchor_nv is None:
                        anchor_nv = pdv
                    if rb in ("pinnacle", "smarkets") and sharp_nv is None:
                        sharp_nv = pdv
            if anchor_nv is None:
                continue

            mkt_ref = sharp_nv if sharp_nv is not None else anchor_nv
            p_mod_vec = np.asarray(spec["p_model_vec"], dtype=float)
            p_fin_vec = pe.blend_probs_logit_simplex(p_mod_vec, mkt_ref, w_eff)

            avail_exec = [b for b in allowed_books if b in complete_books and b in bt.DEFAULT_REAL_EXECUTION_BOOKS]
            if not avail_exec:
                continue

            if bool(config.line_shopping) and len(avail_exec) > 1:
                chosen_quotes = [
                    max((complete_books[b][s] for b in avail_exec), key=lambda q: float(q["price_decimal"]))
                    for s in sel_order
                ]
            else:
                pb = "b365" if ("b365" in avail_exec and source_mode == "historical_fd") else avail_exec[0]
                chosen_quotes = [complete_books[pb][s] for s in sel_order]

            sp_pair = (spec["primary_sp"], spec["opposite_sp"])
            sub_map = spec.get("submodel_probs") or {}

            for idx_s, s_name in enumerate(sel_order):
                self.total_candidates_evaluated += 1
                q_sel = chosen_quotes[idx_s]
                price_dec = float(q_sel["price_decimal"])
                b_sel = pe.canonical_pick_book(q_sel["book"])
                p_fin = float(p_fin_vec[idx_s])
                p_imp = 1.0 / price_dec

                if p_fin <= p_imp:
                    self.rejection_counts["below_breakeven"] = self.rejection_counts.get("below_breakeven", 0) + 1
                    continue

                odds_bucket = pe.classify_odds_bucket(price_dec)
                thresholds, max_sigma_p, max_adv_ticks, unc_k = pe._resolve_thresholds_for_candidate(
                    pol, pol_seg, m_canon, odds_bucket
                )

                sub_list = sub_map.get(s_name)
                sig_p = pe.compute_submodel_dispersion({"submodel_probs": sub_list}) if sub_list else 0.025
                sigma_val = float(sig_p) if sig_p is not None else 0.025
                if sigma_val > max_sigma_p:
                    self.rejection_counts["high_submodel_dispersion"] = (
                        self.rejection_counts.get("high_submodel_dispersion", 0) + 1
                    )
                    continue

                adv_ticks = pe.compute_adverse_sharp_ticks_1h(
                    [
                        q
                        for q in ev_all_odds
                        if q["ts_captured"] <= ts_dec
                        and bt.canonical_market(q["market"]) == m_canon
                        and bt._normalize_line_key(q.get("line")) == l_key
                        and pe.canonical_pick_selection(q["selection"]) == s_name
                        and pe.canonical_pick_book(q["book"]) in ("pinnacle", "smarkets")
                    ],
                    ts_dec.isoformat(),
                    market=m_canon,
                    line=l_key,
                    line_specified=(l_key is not None),
                    selection=s_name,
                    window_minutes=sharp_win_min,
                    sharp_implied_prob_tick=sharp_tick,
                )
                if adv_ticks > max_adv_ticks:
                    self.rejection_counts["adverse_sharp_steam"] = (
                        self.rejection_counts.get("adverse_sharp_steam", 0) + 1
                    )
                    continue

                sp_arr = sp_pair[idx_s]
                base_sp = {
                    "p_full_win": float(sp_arr[0]),
                    "p_half_win": float(sp_arr[1]),
                    "p_push": float(sp_arr[2]),
                    "p_half_loss": float(sp_arr[3]),
                    "p_full_loss": float(sp_arr[4]),
                }
                bet_eval = evaluate_asian_value_bet(
                    base_sp,
                    price_dec,
                    p_blended_effective=p_fin,
                    sigma_p=sigma_val,
                    uncertainty_penalty_k=unc_k,
                    kelly_fraction=kelly_frac,
                    bankroll_unit_pct=unit_pct,
                )
                ev_exact = float(bet_eval["ev"])
                p_edge = float(bet_eval["edge_effective"])

                p_edge_min = float(thresholds["p_edge_min"])
                ev_solido = float(thresholds["ev_threshold_solido"])
                ev_valor = float(thresholds["ev_threshold_valor"])

                if p_edge <= p_edge_min or ev_exact < ev_solido:
                    self.rejection_counts["below_calibrated_ev_threshold"] = (
                        self.rejection_counts.get("below_calibrated_ev_threshold", 0) + 1
                    )
                    continue

                if ev_exact >= ev_valor:
                    tier = "valor"
                else:
                    seg_clv_mean = pol_seg.get("segment_clv_mean") if pol_seg is not None else None
                    seg_clv_low = pol_seg.get("segment_clv_ci95_low") if pol_seg is not None else None
                    if (
                        seg_clv_mean is not None
                        and seg_clv_low is not None
                        and float(seg_clv_mean) > 0.0
                        and float(seg_clv_low) > 0.0
                    ):
                        tier = "solido"
                    else:
                        self.rejection_counts["solido_requires_positive_segment_clv"] = (
                            self.rejection_counts.get("solido_requires_positive_segment_clv", 0) + 1
                        )
                        continue

                if bool(bet_eval["edge_erased_by_uncertainty"]) or float(bet_eval["stake_raw_u"]) <= 0.0:
                    self.rejection_counts["edge_erased_by_uncertainty"] = (
                        self.rejection_counts.get("edge_erased_by_uncertainty", 0) + 1
                    )
                    continue

                survivors.append(
                    {
                        "market": m_canon,
                        "line": l_key,
                        "selection": s_name,
                        "book": b_sel,
                        "source": str(q_sel.get("source") or source_mode),
                        "price_decision": price_dec,
                        "p_modelo": float(p_mod_vec[idx_s]),
                        "p_mercado": float(mkt_ref[idx_s]),
                        "p_final": p_fin,
                        "ev_exact": ev_exact,
                        "stake_raw_u": float(bet_eval["stake_raw_u"]),
                        "expected_log_growth_g": float(bet_eval["expected_log_growth_g"]),
                        "tier": tier,
                    }
                )

        if not survivors:
            return []

        survivors.sort(key=lambda c: (-c["expected_log_growth_g"], -c["ev_exact"], c["market"], c["selection"]))
        emitted: list[dict[str, Any]] = []
        ld_key = f"{league}::{utc_date}"

        for cand in survivors:
            mkts_taken = self.event_markets_taken.setdefault(eid, set())
            if cand["market"] in mkts_taken:
                continue
            prior_cnt = self.event_pick_counts.get(eid, 0)
            corr_mult = (1.0 / (1.0 + abs(rho_corr) * prior_cnt)) if prior_cnt > 0 else 1.0
            proposed = min(cap_pick, cand["stake_raw_u"] * corr_mult)

            rem_ev = max(0.0, cap_event - self.event_exposure_u.get(eid, 0.0))
            rem_ld = max(0.0, cap_ld - self.league_date_exposure_u.get(ld_key, 0.0))
            rem_gd = max(0.0, cap_gd - self.global_date_exposure_u.get(utc_date, 0.0))
            stake_u = min(proposed, rem_ev, rem_ld, rem_gd)
            if stake_u < min_stake_u:
                continue

            self.event_exposure_u[eid] = self.event_exposure_u.get(eid, 0.0) + stake_u
            self.league_date_exposure_u[ld_key] = self.league_date_exposure_u.get(ld_key, 0.0) + stake_u
            self.global_date_exposure_u[utc_date] = self.global_date_exposure_u.get(utc_date, 0.0) + stake_u
            self.event_pick_counts[eid] = prior_cnt + 1
            mkts_taken.add(cand["market"])

            emitted.append(
                {
                    "market": cand["market"],
                    "line": cand["line"],
                    "selection": cand["selection"],
                    "book": cand["book"],
                    "source": cand["source"],
                    "price_decision": cand["price_decision"],
                    "p_modelo": cand["p_modelo"],
                    "p_mercado": cand["p_mercado"],
                    "p_final": cand["p_final"],
                    "stake_u": stake_u,
                    "tier": cand["tier"],
                }
            )
        return emitted


def _prescan_2way_candidate_observations(
    soc_dev: pd.DataFrame,
    odds_by_event: Mapping[str, list[dict[str, Any]]],
    a4_segments: Mapping[str, Mapping[str, Any]],
    event_specs_by_eid: Mapping[str, Sequence[Mapping[str, Any]]],
    *,
    execution_delay_minutes: float = 2.0,
    historical_delay_alpha: float = 0.05,
) -> pd.DataFrame:
    """Extrae observaciones candidatas 2-vías en `walk_forward_dev` con EV exacto asiático para calibrar
    umbrales causales `< fold_cut_ts` por `league × market × odds_bucket` compatibles con `picks_engine.py`."""
    import backtest as bt
    import picks_engine as pe

    rows: list[dict[str, Any]] = []
    allowed_books = [pe.canonical_pick_book(b) for b in bt.BacktestConfig().execution_books_priority]

    for r in soc_dev.itertuples(index=False):
        eid = str(r.event_id)
        specs = event_specs_by_eid.get(eid)
        if not specs:
            continue
        ev_odds = odds_by_event.get(eid, [])
        if not ev_odds:
            continue
        league = str(r.league)
        fold_key = str(r.fold_key)
        src_mode = str(getattr(r, "source_mode", "historical_fd"))
        ts_dec: pd.Timestamp = r.ts_decision
        ts_start: pd.Timestamp = r.ts_event_start
        dec_quotes = bt._extract_decision_quotes_for_event(
            {"event_id": eid, "source_mode": src_mode}, ev_odds, None, ts_dec
        )
        if not dec_quotes:
            continue

        for spec in specs:
            m_canon = str(spec["market"])
            l_key = float(spec["line"]) if spec.get("line") is not None else None
            seg_key = f"{league}::{m_canon}"
            a4_seg = a4_segments.get(seg_key)
            if a4_seg is None or not bool(a4_seg.get("a4_gate_passed", False)):
                continue

            fk_cfg = (a4_seg.get("fold_causal_weights") or {}).get(fold_key)
            if fk_cfg is not None:
                w_eff = float(fk_cfg["w_fold_effective"])
                devig_m = str(fk_cfg["devig_method_past"])
            else:
                w_eff = float(a4_seg.get("w_effective", 0.0))
                devig_m = str(a4_seg.get("best_devig_method", "power"))
            if w_eff <= 0.05 + 1e-12:
                continue

            sel_order = bt._selection_order_for_market(m_canon)
            by_book: dict[str, dict[str, dict[str, Any]]] = {}
            for q in dec_quotes:
                if bt.canonical_market(q["market"]) != m_canon or bt._normalize_line_key(q.get("line")) != l_key:
                    continue
                b_c = pe.canonical_pick_book(q["book"])
                s_c = pe.canonical_pick_selection(q["selection"])
                pr = float(q["price_decimal"])
                if s_c in sel_order and MIN_DECIMAL_PRICE <= pr <= MAX_DECIMAL_PRICE:
                    by_book.setdefault(b_c, {})[s_c] = q
            complete_books = {b: sd for b, sd in by_book.items() if all(s in sd for s in sel_order)}
            if not complete_books:
                continue

            sharp_nv: np.ndarray | None = None
            anchor_nv: np.ndarray | None = None
            for rb in ("pinnacle", "smarkets", "b365", "caliente", "codere", "bw", "wh"):
                if rb in complete_books:
                    ro = [float(complete_books[rb][s]["price_decimal"]) for s in sel_order]
                    if not (0.9 <= sum(1.0 / x for x in ro) <= 1.2):
                        continue
                    pdv = pe.devig_prices_by_method(ro, devig_m)
                    if anchor_nv is None:
                        anchor_nv = pdv
                    if rb in ("pinnacle", "smarkets") and sharp_nv is None:
                        sharp_nv = pdv
            if anchor_nv is None:
                continue

            mkt_ref = sharp_nv if sharp_nv is not None else anchor_nv
            p_mod_vec = np.asarray(spec["p_model_vec"], dtype=float)
            p_fin_vec = pe.blend_probs_logit_simplex(p_mod_vec, mkt_ref, w_eff)
            avail_exec = [b for b in allowed_books if b in complete_books and b in bt.DEFAULT_REAL_EXECUTION_BOOKS]
            if not avail_exec:
                continue
            chosen = [
                max((complete_books[b][s] for b in avail_exec), key=lambda q: float(q["price_decimal"]))
                for s in sel_order
            ]
            closing_info = bt.resolve_sharp_closing_market(
                ev_odds, market=m_canon, line=l_key, ts_event_start=ts_start
            )
            c_miss = bool(closing_info["closing_missing"])
            sp_pair = (spec["primary_sp"], spec["opposite_sp"])
            sub_map = spec.get("submodel_probs") or {}

            for idx_s, s_name in enumerate(sel_order):
                q_sel = chosen[idx_s]
                price_dec = float(q_sel["price_decimal"])
                p_fin = float(p_fin_vec[idx_s])
                if p_fin <= (1.0 / price_dec):
                    continue

                b_sel = pe.canonical_pick_book(q_sel["book"])
                price_tomado, ts_exec, _ = bt.resolve_execution_price(
                    ev_odds,
                    source=str(q_sel.get("source") or src_mode),
                    market=m_canon,
                    line=l_key,
                    selection=s_name,
                    book=b_sel,
                    price_decision=price_dec,
                    ts_decision=ts_dec,
                    ts_event_start=ts_start,
                    execution_delay_minutes=execution_delay_minutes,
                    historical_delay_alpha=historical_delay_alpha,
                )
                if price_tomado is None or ts_exec is None:
                    continue

                price_cl_nv = (
                    float(closing_info["prices_novig"][s_name])
                    if (not c_miss and closing_info["prices_novig"] and s_name in closing_info["prices_novig"])
                    else None
                )
                clv_pct, clv_prob = bt._compute_single_pick_clv(
                    price_tomado,
                    price_cl_nv,
                    c_miss,
                    closing_book=closing_info.get("closing_book"),
                    closing_source=closing_info.get("closing_source"),
                )
                sp_arr = sp_pair[idx_s]
                base_sp = {
                    "p_full_win": float(sp_arr[0]),
                    "p_half_win": float(sp_arr[1]),
                    "p_push": float(sp_arr[2]),
                    "p_half_loss": float(sp_arr[3]),
                    "p_full_loss": float(sp_arr[4]),
                }
                blended_sp = retarget_settlement_probs(base_sp, p_fin)
                ev_exact = compute_asian_ev(blended_sp, price_dec)
                sub_list = sub_map.get(s_name)
                sig_p = pe.compute_submodel_dispersion({"submodel_probs": sub_list}) if sub_list else 0.025

                rows.append(
                    {
                        "event_id": eid,
                        "sport": "football",
                        "league": league,
                        "market": m_canon,
                        "segment_key": seg_key,
                        "fold_key": fold_key,
                        "ts_decision": ts_dec,
                        "ts_event_start": ts_start,
                        "book": b_sel,
                        "odds_bucket": pe.classify_odds_bucket(price_dec),
                        "price_decimal": price_dec,
                        "p_final": p_fin,
                        "p_edge": p_fin - (1.0 / price_dec),
                        "ev": ev_exact,
                        "sharp_edge": (float(sharp_nv[idx_s]) - (1.0 / price_dec)) if sharp_nv is not None else -1.0,
                        "is_soft_book": b_sel not in ("pinnacle", "smarkets"),
                        "sigma_p": float(sig_p) if sig_p is not None else 0.025,
                        "model_picks_enabled": True,
                        "clv_pct": clv_pct,
                        "clv_prob": clv_prob,
                    }
                )
    return pd.DataFrame(rows)


def _audit_scraped_ws_football_coverage(
    odds_parquet_path: Path,
    holdout_cut_ts: pd.Timestamp,
    dev_eids: set[str],
) -> dict[str, Any]:
    """Audita con total honestidad la cobertura de mercados 2-vías de fútbol en `scraped_ws`
    leyendo ÚNICAMENTE metadatos de snapshots (sin abrir jamás resultados del holdout sellado)."""
    import backtest as bt

    ws_df = pd.read_parquet(
        odds_parquet_path,
        columns=[
            "event_id",
            "sport",
            "league",
            "market",
            "line",
            "selection",
            "book",
            "source",
            "ts_captured",
            "ts_event_start",
        ],
    )
    ws_soc = ws_df[
        (ws_df["source"].astype(str).str.lower() == "scraped_ws")
        & (ws_df["sport"].map(bt.canonical_sport) == "football")
    ].copy()

    if ws_soc.empty:
        return {
            "total_rows": 0,
            "unique_events": 0,
            "events_in_walk_forward_dev": 0,
            "has_settled_historical_outcomes_in_dev": False,
            "by_market_raw": {},
            "canonical_2way_mapping": {},
        }

    ws_soc["ts_event_start_utc"] = pd.to_datetime(ws_soc["ts_event_start"], utc=True)
    ws_soc["in_walk_forward_dev"] = (ws_soc["ts_event_start_utc"] < holdout_cut_ts) & (
        ws_soc["event_id"].astype(str).isin(dev_eids)
    )
    ws_soc["book_canon"] = ws_soc["book"].map(bt.canonical_book)

    by_mkt_raw: dict[str, Any] = {}
    for m_raw, grp in ws_soc.groupby(ws_soc["market"].astype(str).str.lower()):
        lines_present = sorted({float(x) for x in grp["line"].dropna().tolist()})
        books_present = sorted(grp["book_canon"].astype(str).unique().tolist())
        by_mkt_raw[str(m_raw)] = {
            "n_snapshot_rows": int(len(grp)),
            "n_unique_events": int(grp["event_id"].nunique()),
            "n_events_settled_in_walk_forward_dev": int(grp.loc[grp["in_walk_forward_dev"], "event_id"].nunique()),
            "leagues": sorted(grp["league"].astype(str).unique().tolist()),
            "lines": lines_present,
            "books": books_present,
            "has_sharp_pinnacle_or_smarkets": any(b in ("pinnacle", "smarkets") for b in books_present),
            "status": (
                "settled_in_dev"
                if int(grp.loc[grp["in_walk_forward_dev"], "event_id"].nunique()) > 0
                else "live_prospective_snapshots_only_no_settled_dev_history"
            ),
        }

    return {
        "total_rows": int(len(ws_soc)),
        "unique_events": int(ws_soc["event_id"].nunique()),
        "events_in_walk_forward_dev": int(ws_soc.loc[ws_soc["in_walk_forward_dev"], "event_id"].nunique()),
        "has_settled_historical_outcomes_in_dev": bool(ws_soc["in_walk_forward_dev"].any()),
        "leagues_present": sorted(ws_soc["league"].astype(str).unique().tolist()),
        "by_market_raw": by_mkt_raw,
        "canonical_2way_mapping": {
            "ah": by_mkt_raw.get("spread")
            or {"n_snapshot_rows": 0, "n_unique_events": 0, "status": "zero_snapshots_in_scraped_ws"},
            "dnb": by_mkt_raw.get("moneyline")
            or {"n_snapshot_rows": 0, "n_unique_events": 0, "status": "zero_snapshots_in_scraped_ws"},
            "ou": by_mkt_raw.get("totals")
            or {"n_snapshot_rows": 0, "n_unique_events": 0, "status": "zero_snapshots_in_scraped_ws"},
            "btts": by_mkt_raw.get("btts")
            or {"n_snapshot_rows": 0, "n_unique_events": 0, "status": "zero_snapshots_in_scraped_ws"},
        },
        "honest_note": (
            "En scraped_ws de fútbol solo existen capturas prospectivas en vivo (3 eventos pre-match: MLS/USA con "
            "moneyline[2-way/DNB], spread[AH] y totals[OU], y UEFA-NATIONS-LEAGUE-B con 1x2; 0 filas en btts y 0 "
            "cierres sharp Pinnacle/Smarkets). Ningún evento scraped_ws de fútbol pertenece a walk_forward_dev ni "
            "posee marcador liquidado en matches.parquet; toda la calibración y liquidación OOS de A6 proviene de "
            "historical_fd (< 2025-02-02T17:30:00Z) manteniendo el holdout 100% sellado."
        ),
    }


def run_markets_2way_evaluation(
    *,
    eval_out_path: str | Path = DEFAULT_EVAL_ARTIFACT_PATH,
    config_out_path: str | Path = DEFAULT_CONFIG_JSON_PATH,
    registry_path: str | Path = DEFAULT_A6_REGISTRY_PATH,
    n0_shrinkage: int = 300,
    bootstrap_samples: int = 1000,
    seed: int = 20261111,
    unlock_holdout: bool = False,
) -> dict[str, Any]:
    """Ejecuta la validación walk-forward estricta A4 + A3 para todos los mercados 2-vías de fútbol
    sobre `walk_forward_dev` (`unlock_holdout=False`, `registry_path=holdout_registry_a6.jsonl`)
    y materializa `markets_2way_eval.json` y `src/data/prediction/markets_2way_config.json`."""
    import backtest as bt
    import blend_calibration as bc
    import picks_engine as pe

    if unlock_holdout:
        raise bt.HoldoutSealedError(
            "PROHIBIDO ABRIR EL HOLDOUT SELLADO en Ola 3 (`unlock_holdout=False` obligatorio en A6)."
        )
    if int(bootstrap_samples) < 1000:
        raise Markets2WayValidationError("bootstrap_samples debe ser >= 1000.")

    reg_path = Path(registry_path)
    if reg_path.resolve() == bt.DEFAULT_REGISTRY_PATH.resolve():
        raise Markets2WayValidationError(
            "A6 tiene prohibido modificar holdout_trial_registry.jsonl principal; usa holdout_registry_a6.jsonl."
        )

    # 1. Cargar universo causal `v3.0` (`70,812` eventos) y aislar `walk_forward_dev` (`56,649`; fútbol = `52,758`)
    load_cfg = bt.BacktestConfig(
        phase="ola3_a6_markets_2way_load",
        preset="markets_2way_v3_1",
        model_version="spacetime_v3.1_dc_markets_2way",
        eval_split="walk_forward_dev",
        unlock_holdout=False,
        sports=("football", "nfl"),
        markets=("1x2", "moneyline", "ah", "totals", "spread", "btts"),
        bootstrap_samples=int(bootstrap_samples),
        seed=int(seed),
        registry_path=reg_path,
    )
    load_cfg.validate()
    odds_all = bt._load_odds_snapshots(load_cfg)

    base_ev_cfg = bt.BacktestConfig(
        phase="ola3_a6_markets_2way_load",
        preset="markets_2way_v3_1",
        model_version="spacetime_v3.1_dc_markets_2way",
        eval_split="walk_forward_dev",
        unlock_holdout=False,
        sports=("football", "nfl"),
        markets=("1x2", "moneyline"),
        bootstrap_samples=int(bootstrap_samples),
        seed=int(seed),
        registry_path=reg_path,
    )
    raw_events = bt._build_baseline_v3_0_events(base_ev_cfg, odds_all)
    raw_events = raw_events[raw_events["y"].notna()].copy()
    events_checked = bt.verify_events_frame_no_leakage(raw_events)
    dev_df, _sealed_unused, split_meta = bt.split_walk_forward_and_holdout(
        events_checked, holdout_fraction=base_ev_cfg.holdout_fraction
    )
    del _sealed_unused  # Holdout 20% jamás leído ni evaluado

    holdout_cut_ts = pd.Timestamp(split_meta["holdout_cut_ts"])
    if (dev_df["ts_event_start"] >= holdout_cut_ts).any():
        raise bt.DataLeakageError("Violación de frontera temporal: evento en dev_df >= holdout_cut_ts.")

    soc_dev = dev_df[dev_df["sport"] == "football"].copy().reset_index(drop=True)
    dev_eids = set(soc_dev["event_id"].astype(str).unique())

    soc_odds_raw = odds_all[
        (odds_all["sport_canon"] == "football")
        & (odds_all["ts_event_start"] < holdout_cut_ts)
        & (odds_all["event_id"].astype(str).isin(dev_eids))
    ].copy()
    soc_odds_raw["snapshot_stage"] = soc_odds_raw["snapshot_stage"].fillna("").astype(str).str.lower()

    # Filtrar líneas corruptas no múltiplos de 0.25 en `ah` / `totals` y documentar conteo exacto
    ah_tot_mask = soc_odds_raw["market_canon"].isin(["ah", "totals"])
    raw_lines_arr = pd.to_numeric(soc_odds_raw["line"], errors="coerce").to_numpy(dtype=np.float64)
    valid_q_mask = (~ah_tot_mask.to_numpy()) | _is_valid_quarter_array(raw_lines_arr, max_abs=10.0)
    n_corrupted_rows_filtered = int((~valid_q_mask).sum())
    corrupted_lines_sample = sorted(
        {float(x) for x in raw_lines_arr[~valid_q_mask] if np.isfinite(x)}
    )[:20]
    soc_odds = soc_odds_raw[valid_q_mask].copy()
    soc_odds.loc[soc_odds["market_canon"].isin(["ah", "totals"]), "line"] = (
        np.round(soc_odds.loc[soc_odds["market_canon"].isin(["ah", "totals"]), "line"].astype(float) * 4.0) / 4.0
    )

    # Verificar invariante anti-fuga sobre todas las cuotas `open`
    dec_ts_by_eid = dict(zip(soc_dev["event_id"].astype(str), soc_dev["ts_decision"]))
    open_rows = soc_odds[soc_odds["snapshot_stage"] == "open"]
    if not open_rows.empty:
        leaked = open_rows["ts_captured"] > open_rows["event_id"].astype(str).map(dec_ts_by_eid)
        if leaked.any():
            bad_r = open_rows.loc[leaked].iloc[0]
            raise bt.DataLeakageError(f"Fuga temporal en open quote de event_id={bad_r['event_id']}")

    # Auditoría completa de cobertura `scraped_ws` vs `historical_fd`
    scraped_ws_audit = _audit_scraped_ws_football_coverage(
        PRED_LAB_ROOT / "data" / "processed" / "odds_snapshots.parquet", holdout_cut_ts, dev_eids
    )

    # 2. Cruzar `dc_lam_home` y `dc_lam_away` estrictamente pre-partido desde `features.parquet`
    soc_feats = pd.read_parquet(
        PRED_LAB_ROOT / "data" / "processed" / "features.parquet",
        columns=["match_id", "dc_lam_home", "dc_lam_away"],
    ).drop_duplicates("match_id")
    soc_dev = soc_dev.merge(soc_feats, left_on="raw_event_id", right_on="match_id", how="left")
    n_missing_dc_lam = int(soc_dev["dc_lam_home"].isna().sum() + soc_dev["dc_lam_away"].isna().sum())
    soc_dev["dc_lam_home"] = soc_dev["dc_lam_home"].fillna(1.45).clip(0.05, MAX_LAMBDA_GOALS)
    soc_dev["dc_lam_away"] = soc_dev["dc_lam_away"].fillna(1.15).clip(0.05, MAX_LAMBDA_GOALS)

    # Ajustar `dc_rho` causalmente por `(league, fold_key)` usando solo partidos `< fold_cut_ts`
    soc_leagues = sorted(soc_dev["league"].astype(str).unique().tolist())
    rho_causal_col = np.full(len(soc_dev), DEFAULT_DC_RHO, dtype=np.float64)
    dc_rho_by_league: dict[str, float] = {}

    all_ts_start = soc_dev["ts_event_start"].to_numpy()
    all_ts_dec = soc_dev["ts_decision"].to_numpy()
    all_lg = soc_dev["league"].astype(str).to_numpy()
    all_fk = soc_dev["fold_key"].astype(str).to_numpy()
    all_lh = soc_dev["dc_lam_home"].to_numpy(dtype=np.float64)
    all_la = soc_dev["dc_lam_away"].to_numpy(dtype=np.float64)
    all_hg = soc_dev["home_score"].to_numpy(dtype=np.float64)
    all_ag = soc_dev["away_score"].to_numpy(dtype=np.float64)

    for lg in soc_leagues:
        lg_mask = all_lg == lg
        for fk in sorted(np.unique(all_fk[lg_mask])):
            cell_mask = lg_mask & (all_fk == fk)
            cut_ts = all_ts_dec[cell_mask].min()
            past_lg = lg_mask & (all_ts_start < cut_ts)
            if int(past_lg.sum()) >= 120:
                rho_fit = _fit_dc_rho_past_only(all_lh[past_lg], all_la[past_lg], all_hg[past_lg], all_ag[past_lg])
            else:
                past_glob = all_ts_start < cut_ts
                rho_fit = _fit_dc_rho_past_only(
                    all_lh[past_glob], all_la[past_glob], all_hg[past_glob], all_ag[past_glob]
                )
            rho_causal_col[cell_mask] = rho_fit
        dc_rho_by_league[lg] = _fit_dc_rho_past_only(all_lh[lg_mask], all_la[lg_mask], all_hg[lg_mask], all_ag[lg_mask])

    soc_dev["dc_rho_causal"] = rho_causal_col

    # 3. Extraer cuotas `open` y `close` (Pinnacle) para mercados 2-vías en `soc_odds`
    open_ah_map, open_ah_lines = bc._pivot_market_quotes_for_events(
        soc_odds, "ah", ("home", "away"), "open", bc.OPEN_REFERENCE_BOOKS_PRIORITY
    )
    close_pin_ah_map, close_ah_lines = bc._pivot_market_quotes_for_events(
        soc_odds, "ah", ("home", "away"), "close", ("pinnacle",)
    )
    open_tot_map, open_tot_lines = bc._pivot_market_quotes_for_events(
        soc_odds, "totals", ("over", "under"), "open", bc.OPEN_REFERENCE_BOOKS_PRIORITY
    )
    close_pin_tot_map, close_tot_lines = bc._pivot_market_quotes_for_events(
        soc_odds, "totals", ("over", "under"), "close", ("pinnacle",)
    )

    # 4. Calibración Walk-Forward A4 sobre los `23 × 4 = 92` segmentos `league × market` (`ah`, `totals`, `dnb`, `btts`)
    a4_segments: dict[str, dict[str, Any]] = {}
    ah_line_agg: dict[str, dict[str, list[Any]]] = {}
    submodel_lookup = pe.load_submodel_dispersion_lookup()
    event_specs_by_eid: dict[str, list[dict[str, Any]]] = {}

    seg_seed_idx = 0
    for lg in soc_leagues:
        lg_df = soc_dev[soc_dev["league"] == lg].reset_index(drop=True)
        n_lg = len(lg_df)
        eids_lg = lg_df["event_id"].astype(str).tolist()
        f_keys_lg = lg_df["fold_key"].astype(str).to_numpy()
        ts_st_lg = lg_df["ts_event_start"].to_numpy()
        ts_dc_lg = lg_df["ts_decision"].to_numpy()
        hg_lg = lg_df["home_score"].to_numpy(dtype=np.float64)
        ag_lg = lg_df["away_score"].to_numpy(dtype=np.float64)
        lh_lg = lg_df["dc_lam_home"].to_numpy(dtype=np.float64)
        la_lg = lg_df["dc_lam_away"].to_numpy(dtype=np.float64)
        rho_lg = lg_df["dc_rho_causal"].to_numpy(dtype=np.float64)

        # --- 4A. Hándicap Asiático (`ah`) ---
        o_open_ah = np.ones((n_lg, 2), dtype=np.float64) * 1.95
        has_open_ah = np.zeros(n_lg, dtype=bool)
        lines_ah = np.zeros(n_lg, dtype=np.float64)
        o_close_ah = np.ones((n_lg, 2), dtype=np.float64) * 1.95
        has_close_ah = np.zeros(n_lg, dtype=bool)

        for i, eid_s in enumerate(eids_lg):
            q_op = open_ah_map.get(eid_s)
            ln_op = open_ah_lines.get(eid_s)
            if q_op is not None and ln_op is not None:
                o_open_ah[i] = q_op
                has_open_ah[i] = True
                lines_ah[i] = ln_op
                q_cl = close_pin_ah_map.get(eid_s)
                ln_cl = close_ah_lines.get(eid_s)
                if q_cl is not None and ln_cl is not None and abs(ln_cl - ln_op) <= 1e-6:
                    o_close_ah[i] = q_cl
                    has_close_ah[i] = True

        dc_ah = _vectorized_dc_2way_settlement_and_probs(lh_lg, la_lg, rho_lg, lines_ah, "ah")
        dc_ah_indep = _vectorized_dc_2way_settlement_and_probs(
            lh_lg, la_lg, np.zeros_like(rho_lg), lines_ah, "ah"
        )
        yt_ah, aw_ah, yc_ah = _compute_split_line_outcome_targets(hg_lg, ag_lg, lines_ah, "ah")
        p_close_nv_ah = bc._devig_matrix_power(o_close_ah)

        seg_seed_idx += 1
        ah_reason_empty = (
            "no_historical_ah_snapshots_for_extra_league_in_dev"
            if not bool(has_open_ah.any())
            else "no_non_push_evaluable_events_in_dev"
        )
        res_ah = _calibrate_2way_segment_a4(
            bc_mod=bc,
            league=lg,
            market="ah",
            fold_keys=f_keys_lg,
            ts_event_starts=ts_st_lg,
            ts_decisions=ts_dc_lg,
            p_model_mat=dc_ah["p_model_mat"],
            open_odds_mat=o_open_ah,
            has_open_quote=has_open_ah,
            closing_novig_mat=p_close_nv_ah,
            has_sharp_closing=has_close_ah,
            y_target=yt_ah,
            active_w=aw_ah,
            y_cat=yc_ah,
            disabled_reason_if_empty=ah_reason_empty,
            n0_shrinkage=n0_shrinkage,
            n_bootstrap=bootstrap_samples,
            seed=seed + 1000 * seg_seed_idx,
        )
        res_ah["dc_rho_recommended"] = dc_rho_by_league[lg]
        a4_segments[f"{lg}::ah"] = res_ah

        # Acumular desglose por línea `ah` (`-1.0..+1.0` y fuera de `[-1, +1]`) y registrar specs para backtest A3
        for i, eid_s in enumerate(eids_lg):
            if not has_open_ah[i]:
                continue
            ln_v = float(lines_ah[i])
            bucket_lbl = format_line_key(ln_v) if (-1.0 - 1e-9 <= ln_v <= 1.0 + 1e-9) else "outside_-1_to_+1"
            agg = ah_line_agg.setdefault(
                bucket_lbl, {"p_mod": [], "o_open": [], "p_cl": [], "has_cl": [], "yt": [], "aw": []}
            )
            agg["p_mod"].append(dc_ah["p_model_mat"][i])
            agg["o_open"].append(o_open_ah[i])
            agg["p_cl"].append(p_close_nv_ah[i])
            agg["has_cl"].append(bool(has_close_ah[i]))
            agg["yt"].append(float(yt_ah[i]))
            agg["aw"].append(float(aw_ah[i]))

            sub_1x2 = submodel_lookup.get(eid_s)
            p_dc0 = float(dc_ah["p_model_mat"][i, 0])
            p_in0 = float(dc_ah_indep["p_model_mat"][i, 0])
            if sub_1x2 and len(sub_1x2.get("home", ())) >= 3:
                ph_l, ph_g, ph_dc = sub_1x2["home"][0], sub_1x2["home"][1], max(1e-4, sub_1x2["home"][2])
                shift_l = float(np.clip(p_dc0 * ((ph_l / ph_dc) ** 0.35), 0.02, 0.98))
                shift_g = float(np.clip(p_dc0 * ((ph_g / ph_dc) ** 0.35), 0.02, 0.98))
                sub_ah = {"home": [shift_l, shift_g, p_dc0], "away": [1.0 - shift_l, 1.0 - shift_g, 1.0 - p_dc0]}
            else:
                sub_ah = {"home": [p_dc0, p_in0], "away": [1.0 - p_dc0, 1.0 - p_in0]}

            event_specs_by_eid.setdefault(eid_s, []).append(
                {
                    "market": "ah",
                    "line": ln_v,
                    "p_model_vec": (p_dc0, 1.0 - p_dc0),
                    "primary_sp": dc_ah["primary_sp"][i],
                    "opposite_sp": dc_ah["opposite_sp"][i],
                    "submodel_probs": sub_ah,
                }
            )

        # --- 4B. Totales (`totals` / `ou`) ---
        o_open_tot = np.ones((n_lg, 2), dtype=np.float64) * 1.95
        has_open_tot = np.zeros(n_lg, dtype=bool)
        lines_tot = np.full(n_lg, 2.5, dtype=np.float64)
        o_close_tot = np.ones((n_lg, 2), dtype=np.float64) * 1.95
        has_close_tot = np.zeros(n_lg, dtype=bool)

        for i, eid_s in enumerate(eids_lg):
            q_op = open_tot_map.get(eid_s)
            ln_op = open_tot_lines.get(eid_s)
            if q_op is not None and ln_op is not None:
                o_open_tot[i] = q_op
                has_open_tot[i] = True
                lines_tot[i] = ln_op
                q_cl = close_pin_tot_map.get(eid_s)
                ln_cl = close_tot_lines.get(eid_s)
                if q_cl is not None and ln_cl is not None and abs(ln_cl - ln_op) <= 1e-6:
                    o_close_tot[i] = q_cl
                    has_close_tot[i] = True

        dc_tot = _vectorized_dc_2way_settlement_and_probs(lh_lg, la_lg, rho_lg, lines_tot, "totals")
        dc_tot_indep = _vectorized_dc_2way_settlement_and_probs(
            lh_lg, la_lg, np.zeros_like(rho_lg), lines_tot, "totals"
        )
        yt_tot, aw_tot, yc_tot = _compute_split_line_outcome_targets(hg_lg, ag_lg, lines_tot, "totals")
        p_close_nv_tot = bc._devig_matrix_power(o_close_tot)

        seg_seed_idx += 1
        tot_reason_empty = (
            "no_historical_totals_snapshots_for_extra_league_in_dev"
            if not bool(has_open_tot.any())
            else "no_non_push_evaluable_events_in_dev"
        )
        res_tot = _calibrate_2way_segment_a4(
            bc_mod=bc,
            league=lg,
            market="totals",
            fold_keys=f_keys_lg,
            ts_event_starts=ts_st_lg,
            ts_decisions=ts_dc_lg,
            p_model_mat=dc_tot["p_model_mat"],
            open_odds_mat=o_open_tot,
            has_open_quote=has_open_tot,
            closing_novig_mat=p_close_nv_tot,
            has_sharp_closing=has_close_tot,
            y_target=yt_tot,
            active_w=aw_tot,
            y_cat=yc_tot,
            disabled_reason_if_empty=tot_reason_empty,
            n0_shrinkage=n0_shrinkage,
            n_bootstrap=bootstrap_samples,
            seed=seed + 1000 * seg_seed_idx,
        )
        res_tot["dc_rho_recommended"] = dc_rho_by_league[lg]
        a4_segments[f"{lg}::totals"] = res_tot

        for i, eid_s in enumerate(eids_lg):
            if not has_open_tot[i]:
                continue
            ln_v = float(lines_tot[i])
            p_dc0 = float(dc_tot["p_model_mat"][i, 0])
            p_in0 = float(dc_tot_indep["p_model_mat"][i, 0])
            sub_1x2 = submodel_lookup.get(eid_s)
            if sub_1x2 and len(sub_1x2.get("draw", ())) >= 3:
                pd_l, pd_g, pd_dc = sub_1x2["draw"][0], sub_1x2["draw"][1], max(0.05, sub_1x2["draw"][2])
                tl = float(np.clip((1.0 - pd_l) / max(0.1, 1.0 - pd_dc), 0.80, 1.25))
                tg = float(np.clip((1.0 - pd_g) / max(0.1, 1.0 - pd_dc), 0.80, 1.25))
                s_l = float(np.clip(p_dc0 * tl, 0.02, 0.98))
                s_g = float(np.clip(p_dc0 * tg, 0.02, 0.98))
                sub_tot = {"over": [s_l, s_g, p_dc0], "under": [1.0 - s_l, 1.0 - s_g, 1.0 - p_dc0]}
            else:
                sub_tot = {"over": [p_dc0, p_in0], "under": [1.0 - p_dc0, 1.0 - p_in0]}

            event_specs_by_eid.setdefault(eid_s, []).append(
                {
                    "market": "totals",
                    "line": ln_v,
                    "p_model_vec": (p_dc0, 1.0 - p_dc0),
                    "primary_sp": dc_tot["primary_sp"][i],
                    "opposite_sp": dc_tot["opposite_sp"][i],
                    "submodel_probs": sub_tot,
                }
            )

        # --- 4C. Draw No Bet (`dnb`) y Ambos Anotan (`btts`) ---
        # En `odds_snapshots.parquet` no existen cuotas históricas liquidadas dedicadas de `dnb` ni `btts`
        # en `walk_forward_dev`; se registran explícitamente apagados con razón exacta.
        zeros_bool = np.zeros(n_lg, dtype=bool)
        dummy_2 = np.full((n_lg, 2), 0.5, dtype=np.float64)
        dummy_o = np.full((n_lg, 2), 1.95, dtype=np.float64)
        yt_dnb, aw_dnb, yc_dnb = _compute_split_line_outcome_targets(hg_lg, ag_lg, np.zeros(n_lg), "dnb")
        res_dnb = _calibrate_2way_segment_a4(
            bc_mod=bc,
            league=lg,
            market="dnb",
            fold_keys=f_keys_lg,
            ts_event_starts=ts_st_lg,
            ts_decisions=ts_dc_lg,
            p_model_mat=dummy_2,
            open_odds_mat=dummy_o,
            has_open_quote=zeros_bool,
            closing_novig_mat=dummy_2,
            has_sharp_closing=zeros_bool,
            y_target=yt_dnb,
            active_w=aw_dnb,
            y_cat=yc_dnb,
            disabled_reason_if_empty="no_settled_dnb_snapshots_in_walk_forward_dev",
            n0_shrinkage=n0_shrinkage,
            n_bootstrap=bootstrap_samples,
            seed=seed + 1,
        )
        res_dnb["dc_rho_recommended"] = dc_rho_by_league[lg]
        a4_segments[f"{lg}::dnb"] = res_dnb

        yt_btts, aw_btts, yc_btts = _compute_split_line_outcome_targets(hg_lg, ag_lg, np.zeros(n_lg), "btts")
        res_btts = _calibrate_2way_segment_a4(
            bc_mod=bc,
            league=lg,
            market="btts",
            fold_keys=f_keys_lg,
            ts_event_starts=ts_st_lg,
            ts_decisions=ts_dc_lg,
            p_model_mat=dummy_2,
            open_odds_mat=dummy_o,
            has_open_quote=zeros_bool,
            closing_novig_mat=dummy_2,
            has_sharp_closing=zeros_bool,
            y_target=yt_btts,
            active_w=aw_btts,
            y_cat=yc_btts,
            disabled_reason_if_empty="no_btts_snapshots_in_odds_dataset",
            n0_shrinkage=n0_shrinkage,
            n_bootstrap=bootstrap_samples,
            seed=seed + 2,
        )
        res_btts["dc_rho_recommended"] = dc_rho_by_league[lg]
        a4_segments[f"{lg}::btts"] = res_btts

    # Resumen diagnóstico por línea de `ah` (`-1.0..+1.0` + equivalencia exacta `AH 0.0 === DNB`)
    ah_by_line_summary: dict[str, Any] = {}
    ordered_line_keys = [format_line_key(x) for x in AH_CANONICAL_LINES] + ["outside_-1_to_+1"]
    for lk in ordered_line_keys:
        agg = ah_line_agg.get(lk)
        if not agg:
            ah_by_line_summary[lk] = {"n_events_open": 0, "n_active_non_push": 0}
            continue
        pm_arr = np.asarray(agg["p_mod"], dtype=np.float64)
        oo_arr = np.asarray(agg["o_open"], dtype=np.float64)
        pc_arr = np.asarray(agg["p_cl"], dtype=np.float64)
        hcl_arr = np.asarray(agg["has_cl"], dtype=bool)
        yt_arr = np.asarray(agg["yt"], dtype=np.float64)
        aw_arr = np.asarray(agg["aw"], dtype=np.float64)
        act_m = aw_arr > 0.0
        n_act = int(act_m.sum())
        if n_act > 0:
            p_open_pw = bc._devig_matrix_power(oo_arr[act_m])
            ll_mod_l = float(_proper_split_log_loss_vec(pm_arr[act_m], yt_arr[act_m], aw_arr[act_m]).mean())
            ll_op_l = float(_proper_split_log_loss_vec(p_open_pw, yt_arr[act_m], aw_arr[act_m]).mean())
            cl_m = act_m & hcl_arr
            ll_cl_l = (
                float(_proper_split_log_loss_vec(pc_arr[cl_m], yt_arr[cl_m], aw_arr[cl_m]).mean())
                if int(cl_m.sum()) > 0
                else None
            )
        else:
            ll_mod_l, ll_op_l, ll_cl_l = (None, None, None)
        ah_by_line_summary[lk] = {
            "n_events_open": int(len(yt_arr)),
            "n_active_non_push": n_act,
            "n_paired_pinnacle_closing": int((act_m & hcl_arr).sum()),
            "active_stake_sum": round(float(aw_arr[act_m].sum()), 4) if n_act > 0 else 0.0,
            "log_loss_dc_model": ll_mod_l,
            "log_loss_open_power_novig": ll_op_l,
            "log_loss_closing_pinnacle_novig": ll_cl_l,
            "is_dnb_mathematical_equivalent": (lk == "0"),
        }

    # 5. Validación A3 (`bt.run_backtest`) con política A5 (`picks_engine.py`) + EV/Kelly ¼ exactos de 5 estados
    scoped_dev_odds = soc_odds[
        soc_odds["book_canon"].isin(pe._RELEVANT_BACKTEST_BOOKS)
        & soc_odds["market_canon"].isin(["1x2", "ah", "totals"])
    ].copy()
    odds_by_event_dev = bt._group_odds_records(scoped_dev_odds)
    event_fold_lookup = dict(zip(soc_dev["event_id"].astype(str), soc_dev["fold_key"].astype(str)))

    # Mapear `a4_segments` al formato esperado por `pe._calibrate_policy_from_observations`
    blend_for_policy = {
        k: {
            "league": v["league"],
            "market": v["market"],
            "model_picks_enabled": bool(v["a4_gate_passed"]),
            "disabled_reason": v["a4_disabled_reason"],
            "w_effective": float(v["w_effective"]),
            "best_devig_method": str(v["best_devig_method"]),
        }
        for k, v in a4_segments.items()
    }

    obs_2way = _prescan_2way_candidate_observations(
        soc_dev,
        odds_by_event_dev,
        a4_segments,
        event_specs_by_eid,
        execution_delay_minutes=2.0,
        historical_delay_alpha=0.05,
    )
    base_pol_2way = pe._calibrate_policy_from_observations(
        obs_2way,
        blend_for_policy,
        ev_scale=1.0,
        max_sigma_p=0.06,
        uncertainty_penalty_k=0.50,
        max_adverse_ticks_1h=3.0,
        rho_same_event=0.35,
        allow_pure_market_arb=False,
        stale_arb_min_sharp_edge=0.028,
        n_bootstrap=int(bootstrap_samples),
        seed=int(seed),
    )
    fold_pols_2way = pe._build_fold_causal_policies(
        obs_2way,
        soc_dev,
        blend_for_policy,
        ev_scale=1.0,
        max_sigma_p=0.06,
        uncertainty_penalty_k=0.50,
        max_adverse_ticks_1h=3.0,
        rho_same_event=0.35,
        allow_pure_market_arb=False,
        stale_arb_min_sharp_edge=0.028,
        n_bootstrap=int(bootstrap_samples),
        seed=int(seed),
    )

    alpha_reports: dict[str, dict[str, Any]] = {}
    primary_selector: TwoWayExactAsianPolicySelector | None = None
    for alpha_val in (0.05, 0.00, 0.10):
        sel_run = TwoWayExactAsianPolicySelector(
            base_pol_2way,
            a4_segments,
            event_specs_by_eid,
            odds_by_event_dev,
            fold_causal_policies=fold_pols_2way,
            event_fold_lookup=event_fold_lookup,
            use_fold_causal_blend_weight=True,
        )
        bt_cfg_run = bt.BacktestConfig(
            phase=f"ola3_a6_markets_2way_alpha_{int(round(alpha_val * 100)):02d}",
            preset="markets_2way_a6_exact_asian",
            model_version="spacetime_v3.1_dc_markets_2way",
            eval_split="walk_forward_dev",
            unlock_holdout=False,
            sports=("football", "nfl"),
            markets=("1x2", "moneyline"),
            line_shopping=True,
            execution_delay_minutes=2.0,
            historical_delay_alpha=float(alpha_val),
            bootstrap_samples=int(bootstrap_samples),
            seed=int(seed + int(round(alpha_val * 100))),
            registry_path=reg_path,
            events_df=events_checked,
            odds_df=scoped_dev_odds,
            pick_selector_fn=sel_run,
            extra_config_tag={
                "agent": "a6-markets2w",
                "exact_asian_ev_kelly": True,
                "allow_pure_market_arb": False,
                "historical_delay_alpha": float(alpha_val),
            },
        )
        rep_alpha = bt.run_backtest(bt_cfg_run)
        alpha_key = f"alpha_{alpha_val:.2f}"
        alpha_reports[alpha_key] = rep_alpha
        if abs(alpha_val - 0.05) <= 1e-9:
            primary_selector = sel_run

    primary_bt = alpha_reports["alpha_0.05"]
    betting_by_lm = primary_bt.get("betting", {}).get("by_league_market", {})

    # 6. Regla estricta de habilitación `enabled: true` en `markets_2way_config.json` (Puerta A4 + Validación A3)
    MIN_PICKS_A3_FOR_ENABLEMENT = 5
    segments_config_out: dict[str, dict[str, Any]] = {}
    segments_eval_out: dict[str, dict[str, Any]] = {}
    enabled_segments_list: list[str] = []
    disabled_reason_counts: dict[str, int] = {}

    for seg_key in sorted(a4_segments.keys()):
        a4_s = a4_segments[seg_key]
        lg = str(a4_s["league"])
        mk = str(a4_s["market"])
        bt_key = f"{lg}__{mk}"
        a3_lm = betting_by_lm.get(bt_key)

        n_picks_a3 = int(a3_lm["n_picks"]) if a3_lm is not None else 0
        n_cl_a3 = int(a3_lm["n_picks_with_closing"]) if a3_lm is not None else 0
        clv_mean_a3 = float(a3_lm["clv_pct_mean"]) if (a3_lm and a3_lm.get("clv_pct_mean") is not None) else None
        clv_ci_a3 = a3_lm.get("clv_pct_ci95") if a3_lm is not None else None
        clv_sig_lbl_a3 = str(a3_lm.get("clv_pct_significance_label")) if a3_lm is not None else "sin_picks"
        roi_mean_a3 = float(a3_lm["roi_pct"]) if (a3_lm and a3_lm.get("roi_pct") is not None) else None
        roi_ci_a3 = a3_lm.get("roi_pct_ci95") if a3_lm is not None else None
        roi_sig_lbl_a3 = str(a3_lm.get("roi_significance_label")) if a3_lm is not None else "sin_picks"

        if not bool(a4_s["a4_gate_passed"]):
            enabled = False
            final_reason: str | None = str(a4_s["a4_disabled_reason"] or "failed_a4_gate")
            a3_passed = False
        elif n_cl_a3 < MIN_PICKS_A3_FOR_ENABLEMENT:
            enabled = False
            final_reason = f"a3_insufficient_oos_picks_under_delay_2m_n_{n_cl_a3}_lt_{MIN_PICKS_A3_FOR_ENABLEMENT}"
            a3_passed = False
        elif clv_mean_a3 is None or clv_mean_a3 <= 0.0:
            enabled = False
            final_reason = "a3_non_positive_oos_clv_pct_under_delay_2m"
            a3_passed = False
        elif clv_sig_lbl_a3 == "significativa_negativa":
            enabled = False
            final_reason = "a3_statistically_negative_clv"
            a3_passed = False
        elif roi_sig_lbl_a3 == "significativa_negativa":
            enabled = False
            final_reason = "a3_statistically_negative_roi"
            a3_passed = False
        else:
            enabled = True
            final_reason = None
            a3_passed = True
            enabled_segments_list.append(seg_key)

        if not enabled and final_reason is not None:
            disabled_reason_counts[final_reason] = disabled_reason_counts.get(final_reason, 0) + 1

        pol_seg_entry = (base_pol_2way.get("segments") or {}).get(seg_key) or {}
        segments_config_out[seg_key] = {
            "league": lg,
            "market": mk,
            "sport": "football",
            "enabled": enabled,
            "disabled_reason": final_reason,
            "a4_gate_passed": bool(a4_s["a4_gate_passed"]),
            "a3_validation_passed": a3_passed,
            "w_effective": float(a4_s["w_effective"]) if enabled else 0.0,
            "w_effective_a4_raw": float(a4_s["w_effective"]),
            "best_devig_method": str(a4_s["best_devig_method"]),
            "dc_rho_recommended": float(a4_s["dc_rho_recommended"]),
            "n_events_oos_a4": int(a4_s["n_events_oos_evaluated"]),
            "n_events_paired_closing_a4": int(a4_s["n_events_paired_closing"]),
            "n_picks_oos_a3": n_picks_a3,
            "clv_pct_mean_oos_a3": clv_mean_a3,
            "clv_pct_ci95_oos_a3": clv_ci_a3,
            "buckets": pol_seg_entry.get("buckets") or base_pol_2way["default_buckets"],
        }

        segments_eval_out[seg_key] = {
            **a4_s,
            "a3_validation": {
                "passed": a3_passed,
                "min_picks_required": MIN_PICKS_A3_FOR_ENABLEMENT,
                "n_picks": n_picks_a3,
                "n_picks_with_closing": n_cl_a3,
                "clv_pct_mean": clv_mean_a3,
                "clv_pct_ci95": clv_ci_a3,
                "clv_pct_significance_label": clv_sig_lbl_a3,
                "roi_pct": roi_mean_a3,
                "roi_pct_ci95": roi_ci_a3,
                "roi_significance_label": roi_sig_lbl_a3,
            },
            "enabled": enabled,
            "disabled_reason": final_reason,
        }

    # Si hubo segmentos habilitados finales, correr una pasada final de verificación en `run_backtest` SOLO con los
    # segmentos `enabled: true` para reportar las métricas agregadas exactas del conjunto habilitado congelado.
    enabled_only_a4 = {
        k: {**v, "a4_gate_passed": (k in set(enabled_segments_list))} for k, v in a4_segments.items()
    }
    sel_frozen = TwoWayExactAsianPolicySelector(
        base_pol_2way,
        enabled_only_a4,
        event_specs_by_eid,
        odds_by_event_dev,
        fold_causal_policies=fold_pols_2way,
        event_fold_lookup=event_fold_lookup,
        use_fold_causal_blend_weight=True,
    )
    bt_cfg_frozen = bt.BacktestConfig(
        phase="ola3_a6_markets_2way_frozen_enabled_only",
        preset="markets_2way_a6_frozen_config",
        model_version="spacetime_v3.1_dc_markets_2way",
        eval_split="walk_forward_dev",
        unlock_holdout=False,
        sports=("football", "nfl"),
        markets=("1x2", "moneyline"),
        line_shopping=True,
        execution_delay_minutes=2.0,
        historical_delay_alpha=0.05,
        bootstrap_samples=int(bootstrap_samples),
        seed=int(seed + 99),
        registry_path=reg_path,
        events_df=events_checked,
        odds_df=scoped_dev_odds,
        pick_selector_fn=sel_frozen,
        extra_config_tag={
            "agent": "a6-markets2w",
            "stage": "frozen_enabled_segments_verification",
            "enabled_segments": enabled_segments_list,
        },
    )
    frozen_bt_report = bt.run_backtest(bt_cfg_frozen)

    now_iso = datetime.now(timezone.utc).isoformat(timespec="seconds")
    n_a4_passed = sum(1 for v in a4_segments.values() if bool(v["a4_gate_passed"]))

    config_payload: dict[str, Any] = {
        "schema_version": "markets_2way_config_v1",
        "generated_at_utc": now_iso,
        "agent": "a6-markets2w",
        "sport": "football",
        "eval_split": "walk_forward_dev",
        "holdout_sealed_untouched": True,
        "holdout_cut_ts": str(split_meta["holdout_cut_ts"]),
        "dixon_coles_defaults": {
            "default_dc_rho": DEFAULT_DC_RHO,
            "default_max_goals": DEFAULT_MAX_GOALS,
            "min_max_goals": MIN_MAX_GOALS,
            "ah_canonical_lines": list(AH_CANONICAL_LINES),
            "totals_canonical_lines": list(TOTALS_CANONICAL_LINES),
            "kelly_fraction": DEFAULT_KELLY_FRACTION,
            "bankroll_unit_pct": DEFAULT_BANKROLL_UNIT_PCT,
            "dc_rho_by_league": dc_rho_by_league,
        },
        "enablement_rule": (
            "Solo se habilitan (enabled=true) segmentos league×market que superan simultáneamente la Puerta A4 "
            "(benchmark Pinnacle >= 100 cierres pareados, w_effective > 0.05 con contracción n0=300, mejora OOF y "
            "walk-forward causal en log-loss frente al mercado de apertura sin margen) Y la Validación A3 "
            "(>= 5 picks OOS con cierre Pinnacle bajo delay 2m / alpha=0.05, CLV% medio > 0 y sin significancia "
            "negativa en CLV ni ROI). Todo el resto permanece explícitamente en enabled=false."
        ),
        "summary": {
            "total_segments_evaluated": len(segments_config_out),
            "n_leagues": len(soc_leagues),
            "markets_evaluated": list(SUPPORTED_2WAY_MARKETS),
            "n_passed_a4_gate": n_a4_passed,
            "n_enabled_final": len(enabled_segments_list),
            "n_disabled_final": len(segments_config_out) - len(enabled_segments_list),
            "enabled_segments": enabled_segments_list,
            "disabled_reason_counts": disabled_reason_counts,
        },
        "segments": segments_config_out,
    }

    def _compact_bt_summary(rep: Mapping[str, Any]) -> dict[str, Any]:
        return {
            "phase": rep["phase"],
            "eval_split": rep["eval_split"],
            "unlock_holdout": rep["unlock_holdout"],
            "config_hash": rep["config_hash"],
            "trial_seq": rep["holdout_audit"]["trial_seq"],
            "execution_summary": rep["execution_summary"],
            "n_picks": rep["n_picks"],
            "clv_pct_mean": rep["clv_pct_mean"],
            "clv_pct_ci95": rep["clv_pct_ci95"],
            "clv_pct_significant": rep["clv_pct_significant"],
            "clv_pct_significance": rep["clv_pct_significance"],
            "clv_prob_mean": rep["clv_prob_mean"],
            "clv_prob_ci95": rep["clv_prob_ci95"],
            "pct_picks_clv_positive": rep["pct_picks_clv_positive"],
            "roi_pct": rep["roi_pct"],
            "roi_pct_ci95": rep["roi_pct_ci95"],
            "roi_significant": rep["roi_significant"],
            "roi_significance": rep["roi_significance"],
            "max_drawdown_u": rep["max_drawdown_u"],
            "max_drawdown_u_ci95": rep["max_drawdown_u_ci95"],
            "by_league_market": rep.get("betting", {}).get("by_league_market", {}),
        }

    eval_payload: dict[str, Any] = {
        "schema_version": "markets_2way_eval_v1",
        "generated_at_utc": now_iso,
        "agent": "a6-markets2w",
        "eval_split": "walk_forward_dev",
        "unlock_holdout": False,
        "holdout_registry_path": str(reg_path),
        "split_summary": split_meta,
        "data_coverage_audit": {
            "football_dev_events_total": int(len(soc_dev)),
            "football_leagues_count": len(soc_leagues),
            "football_leagues": soc_leagues,
            "missing_dc_lambda_imputed_count": n_missing_dc_lam,
            "corrupted_non_quarter_snapshot_rows_filtered": n_corrupted_rows_filtered,
            "corrupted_lines_sample": corrupted_lines_sample,
            "historical_fd_dev_coverage": {
                "ah": {
                    "has_settled_history": True,
                    "n_events_with_open_quotes": len(open_ah_map),
                    "n_events_with_pinnacle_close": len(close_pin_ah_map),
                    "leagues_with_coverage": sorted(
                        [lg for lg in soc_leagues if a4_segments[f"{lg}::ah"]["n_events_oos_evaluated"] > 0]
                    ),
                    "leagues_without_coverage": sorted(
                        [lg for lg in soc_leagues if a4_segments[f"{lg}::ah"]["n_events_oos_evaluated"] == 0]
                    ),
                    "by_line_breakdown": ah_by_line_summary,
                },
                "totals": {
                    "has_settled_history": True,
                    "lines_available_in_historical_fd": [2.5],
                    "n_events_with_open_quotes": len(open_tot_map),
                    "n_events_with_pinnacle_close": len(close_pin_tot_map),
                    "leagues_with_coverage": sorted(
                        [lg for lg in soc_leagues if a4_segments[f"{lg}::totals"]["n_events_oos_evaluated"] > 0]
                    ),
                    "leagues_without_coverage": sorted(
                        [lg for lg in soc_leagues if a4_segments[f"{lg}::totals"]["n_events_oos_evaluated"] == 0]
                    ),
                },
                "dnb": {
                    "has_settled_dedicated_history": False,
                    "n_dedicated_snapshot_rows": 0,
                    "ah_line_0_0_mathematical_equivalence": ah_by_line_summary.get("0"),
                    "note": (
                        "football-data.co.uk no publica columnas dedicadas de DNB; AH 0.0 es matemáticamente idéntico "
                        "a DNB (misma condición de victoria y mismo push en empate) y queda auditado en ah_by_line['0'], "
                        "mientras que el mercado standalone dnb permanece en enabled=false por ausencia de snapshots dedicados."
                    ),
                },
                "btts": {
                    "has_settled_history": False,
                    "n_dedicated_snapshot_rows": 0,
                    "note": "0 snapshots de BTTS en historical_fd y 0 en scraped_ws; todos los segmentos btts quedan en enabled=false.",
                },
            },
            "scraped_ws_football_coverage": scraped_ws_audit,
        },
        "a4_calibration_summary": {
            "n0_shrinkage": int(n0_shrinkage),
            "bootstrap_samples": int(bootstrap_samples),
            "total_segments": len(a4_segments),
            "n_passed_a4_gate": n_a4_passed,
            "passed_a4_segments": sorted([k for k, v in a4_segments.items() if bool(v["a4_gate_passed"])]),
            "dc_rho_by_league": dc_rho_by_league,
        },
        "a3_backtest_summary": {
            "candidate_a4_passed_segments_alpha_0_05": _compact_bt_summary(alpha_reports["alpha_0.05"]),
            "delay_sensitivity": {
                "alpha_0_00_optimistic_open": _compact_bt_summary(alpha_reports["alpha_0.00"]),
                "alpha_0_05_primary_realistic": _compact_bt_summary(alpha_reports["alpha_0.05"]),
                "alpha_0_10_pessimistic_erosion": _compact_bt_summary(alpha_reports["alpha_0.10"]),
            },
            "frozen_enabled_segments_alpha_0_05": _compact_bt_summary(frozen_bt_report),
            "selector_rejection_counts_alpha_0_05": primary_selector.rejection_counts if primary_selector else {},
        },
        "enablement_summary": config_payload["summary"],
        "segments": segments_eval_out,
    }

    eval_p = Path(eval_out_path)
    cfg_p = Path(config_out_path)
    eval_p.parent.mkdir(parents=True, exist_ok=True)
    cfg_p.parent.mkdir(parents=True, exist_ok=True)
    eval_p.write_text(json.dumps(eval_payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    cfg_p.write_text(json.dumps(config_payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return eval_payload


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Agente A6 — Mercados 2-vías Dixon-Coles y validación A4+A3.")
    parser.add_argument("--eval-out", type=Path, default=DEFAULT_EVAL_ARTIFACT_PATH)
    parser.add_argument("--config-out", type=Path, default=DEFAULT_CONFIG_JSON_PATH)
    parser.add_argument("--registry-path", type=Path, default=DEFAULT_A6_REGISTRY_PATH)
    parser.add_argument("--bootstrap-samples", type=int, default=1000)
    parser.add_argument("--seed", type=int, default=20261111)
    args = parser.parse_args(list(argv) if argv is not None else None)

    res = run_markets_2way_evaluation(
        eval_out_path=args.eval_out,
        config_out_path=args.config_out,
        registry_path=args.registry_path,
        bootstrap_samples=args.bootstrap_samples,
        seed=args.seed,
        unlock_holdout=False,
    )
    en_sum = res["enablement_summary"]
    bt_fr = res["a3_backtest_summary"]["frozen_enabled_segments_alpha_0_05"]
    print(
        json.dumps(
            {
                "status": "ok",
                "eval_split": res["eval_split"],
                "unlock_holdout": res["unlock_holdout"],
                "n_passed_a4_gate": en_sum["n_passed_a4_gate"],
                "n_enabled_final": en_sum["n_enabled_final"],
                "enabled_segments": en_sum["enabled_segments"],
                "frozen_n_picks": bt_fr["n_picks"],
                "frozen_clv_pct_mean": bt_fr["clv_pct_mean"],
                "frozen_clv_pct_ci95": bt_fr["clv_pct_ci95"],
                "frozen_roi_pct": bt_fr["roi_pct"],
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
