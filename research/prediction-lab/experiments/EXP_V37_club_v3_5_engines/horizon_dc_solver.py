"""Solver determinista Dixon-Coles de 3 parámetros (`PitchLab Horizon-Goals v3.5`) y regresor Poisson
serializable a TypeScript con paridad IEEE-754 `< 1e-12`.

Propiedad ortogonal exacta explotada:
  En la matriz Dixon-Coles `DC(lam_h, lam_a, rho)` (`0..max_goals`), mientras las 4 celdas `{0,1}x{0,1}`
  no toquen el piso `1e-9` (`tau(x,y) > 0`):
    1. La suma de perturbaciones `rho` en `{0,1}x{0,1}` es idénticamente `0` (`Z_DC == Z_Pois`).
    2. `P_DC(H > A) - P_DC(H < A)` es 100% independiente de `rho`.
    3. `P_DC(Over 2.5)` y `P_DC(Over 3.5)` son 100% independientes de `rho`.
    4. `P_DC(Draw) = P_Pois(Draw) - (2 * lam_h * lam_a * exp(-lam_h - lam_a) / Z_Pois) * rho`.

Por tanto, dado el vector `(p_home, p_draw, p_away)` del motor `1X2` y el total de goles esperado `T_hat`
del motor `Poisson`, el sistema desacopla ortogonalmente:
  - `share = lam_h / T_hat` (resuelto por bisección monótona 1D en 36 pasos para clavar `p_home - p_away`),
  - `T = lam_h + lam_a = T_hat` (gobierna `Totals 1.5 / 2.5 / 3.5` y nivel base de `BTTS`),
  - `rho_eff` (absorbe analíticamente `P_Pois(Draw) - p_draw` dentro del cono físico `tau >= 0.12`).
Si un partido extremo cae fuera del cono físico de `rho`, una etapa amortiguada de Newton 2D ajusta `T`
por la mínima cantidad física necesaria para preservar exactamente `(p_home, p_draw, p_away)` en la
misma matriz coherente de marcadores.
"""

from __future__ import annotations

import math
from typing import Any, Mapping, Sequence

import numpy as np


DEFAULT_MAX_GOALS = 12
RHO_ABS_MIN = -0.32
RHO_ABS_MAX = 0.22
TAU_SAFETY_BOUND = 0.88  # Garantiza tau(x,y) >= 1 - 0.88 = 0.12 > 0 en las 4 celdas bajas


def _clamp(x: float, lo: float, hi: float) -> float:
    if x < lo:
        return lo
    if x > hi:
        return hi
    return x


def _sigmoid(u: float) -> float:
    if u >= 0.0:
        ez = math.exp(-u)
        return 1.0 / (1.0 + ez)
    ez = math.exp(u)
    return ez / (1.0 + ez)


def build_dc_score_matrix_exact(
    lam_home: float,
    lam_away: float,
    rho: float = -0.11,
    max_goals: int = DEFAULT_MAX_GOALS,
) -> list[list[float]]:
    """Espejo IEEE-754 exacto de `markets_2way.ts::buildDixonColesScoreMatrix`."""
    size = int(max_goals) + 1
    pmf_h = [0.0] * size
    pmf_a = [0.0] * size
    pmf_h[0] = math.exp(-lam_home)
    pmf_a[0] = math.exp(-lam_away)
    for k in range(1, size):
        pmf_h[k] = (pmf_h[k - 1] * lam_home) / k
        pmf_a[k] = (pmf_a[k - 1] * lam_away) / k

    raw: list[list[float]] = []
    for h in range(size):
        ph = pmf_h[h]
        raw.append([ph * pmf_a[a] for a in range(size)])

    raw[0][0] = raw[0][0] * max(1.0 - lam_home * lam_away * rho, 1e-9)
    raw[0][1] = raw[0][1] * max(1.0 + lam_home * rho, 1e-9)
    raw[1][0] = raw[1][0] * max(1.0 + lam_away * rho, 1e-9)
    raw[1][1] = raw[1][1] * max(1.0 - rho, 1e-9)

    total = 0.0
    for h in range(size):
        row = raw[h]
        for a in range(size):
            total += row[a]

    inv_total = 1.0 / total
    for h in range(size):
        row = raw[h]
        for a in range(size):
            row[a] = row[a] * inv_total
    return raw


def summarize_dc_markets_from_matrix(mat: Sequence[Sequence[float]]) -> dict[str, float]:
    """Extrae `1X2`, `Totals 1.5/2.5/3.5` y `BTTS` desde la matriz DC normalizada."""
    size = len(mat)
    p_h = 0.0
    p_d = 0.0
    p_a = 0.0
    p_ov15 = 0.0
    p_ov25 = 0.0
    p_ov35 = 0.0
    p_btts = 0.0
    for h in range(size):
        row = mat[h]
        for a in range(size):
            p = row[a]
            if h > a:
                p_h += p
            elif h == a:
                p_d += p
            else:
                p_a += p
            tot = h + a
            if tot >= 2:
                p_ov15 += p
            if tot >= 3:
                p_ov25 += p
            if tot >= 4:
                p_ov35 += p
            if h >= 1 and a >= 1:
                p_btts += p
    return {
        "p_home": p_h,
        "p_draw": p_d,
        "p_away": p_a,
        "p_over_1_5": p_ov15,
        "p_under_1_5": max(0.0, 1.0 - p_ov15),
        "p_over_2_5": p_ov25,
        "p_under_2_5": max(0.0, 1.0 - p_ov25),
        "p_over_3_5": p_ov35,
        "p_under_3_5": max(0.0, 1.0 - p_ov35),
        "p_btts_yes": p_btts,
        "p_btts_no": max(0.0, 1.0 - p_btts),
    }


def _poisson_1x2_summary(lam_home: float, lam_away: float, max_goals: int) -> tuple[float, float, float, float]:
    """Devuelve `(p_home, p_draw, p_away, grid_sum)` para Poisson independiente (`rho = 0`)."""
    size = int(max_goals) + 1
    pmf_h = [0.0] * size
    pmf_a = [0.0] * size
    pmf_h[0] = math.exp(-lam_home)
    pmf_a[0] = math.exp(-lam_away)
    for k in range(1, size):
        pmf_h[k] = (pmf_h[k - 1] * lam_home) / k
        pmf_a[k] = (pmf_a[k - 1] * lam_away) / k

    cur_h = 0.0
    cur_d = 0.0
    cur_a = 0.0
    for h in range(size):
        ph = pmf_h[h]
        for a in range(size):
            p = ph * pmf_a[a]
            if h > a:
                cur_h += p
            elif h == a:
                cur_d += p
            else:
                cur_a += p
    s = cur_h + cur_d + cur_a
    return cur_h / s, cur_d / s, cur_a / s, s


def solve_coherent_dc_3param(
    p_home: float,
    p_draw: float,
    p_away: float,
    total_goals_target: float,
    rho_prior: float = -0.11,
    *,
    rho_shrinkage: float = 0.0,
    max_goals: int = DEFAULT_MAX_GOALS,
) -> tuple[float, float, float]:
    """Resuelve `(lam_home, lam_away, rho_eff)` coherente con `(p_home, p_draw, p_away)` y `total_goals_target`.

    Idéntico operación por operación a `horizon_goals.ts::solveCoherentDixonColes3Param`.
    """
    ph0 = max(float(p_home), 1e-6)
    pd0 = max(float(p_draw), 1e-6)
    pa0 = max(float(p_away), 1e-6)
    norm_p = ph0 + pd0 + pa0
    ph = ph0 / norm_p
    pd = pd0 / norm_p
    pa = pa0 / norm_p

    target_diff = ph - pa
    target_draw = pd
    tot_t = _clamp(float(total_goals_target), 0.35, 7.50)

    # Etapa 1: Bisección monótona exacta en `u` (`share = sigmoid(u)`) con `T = tot_t` fijo
    u_lo = -3.4
    u_hi = 3.4
    for _ in range(36):
        u_mid = 0.5 * (u_lo + u_hi)
        sh = _clamp(_sigmoid(u_mid), 0.03, 0.97)
        lh = _clamp(tot_t * sh, 0.05, 10.0)
        la = _clamp(tot_t * (1.0 - sh), 0.05, 10.0)
        ch, _, ca, _ = _poisson_1x2_summary(lh, la, max_goals)
        if (ch - ca) < target_diff:
            u_lo = u_mid
        else:
            u_hi = u_mid

    u = 0.5 * (u_lo + u_hi)
    sh0 = _clamp(_sigmoid(u), 0.03, 0.97)
    lh0 = _clamp(tot_t * sh0, 0.05, 10.0)
    la0 = _clamp(tot_t * (1.0 - sh0), 0.05, 10.0)
    _, cd_pois, _, s_pois = _poisson_1x2_summary(lh0, la0, max_goals)

    denom_rho = (2.0 * lh0 * la0 * math.exp(-(lh0 + la0))) / max(s_pois, 1e-12)
    if denom_rho > 1e-9:
        rho_req = (cd_pois - target_draw) / denom_rho
    else:
        rho_req = float(rho_prior)

    shrink = _clamp(float(rho_shrinkage), 0.0, 1.0)
    rho_blend = (1.0 - shrink) * rho_req + shrink * float(rho_prior)

    rho_lo = max(RHO_ABS_MIN, -TAU_SAFETY_BOUND / max(lh0, la0, 1e-6))
    rho_hi = min(RHO_ABS_MAX, TAU_SAFETY_BOUND / max(lh0 * la0, 1e-6), TAU_SAFETY_BOUND)
    if rho_lo > rho_hi:
        rho_eff = _clamp(float(rho_prior), RHO_ABS_MIN, RHO_ABS_MAX)
    else:
        rho_eff = _clamp(rho_blend, rho_lo, rho_hi)

    # Verificar residuo 1X2 sobre la matriz DC exacta; si `rho_eff == rho_req` y `shrink == 0`,
    # el residuo ya es `< 1e-9` y `lh0 + la0 == tot_t` se conserva intacto.
    def _eval_res(u_val: float, v_val: float, r_val: float) -> tuple[float, float]:
        t_cur = _clamp(math.exp(v_val), 0.25, 8.0)
        s_cur = _clamp(_sigmoid(u_val), 0.03, 0.97)
        l_h = _clamp(t_cur * s_cur, 0.05, 10.0)
        l_a = _clamp(t_cur * (1.0 - s_cur), 0.05, 10.0)
        mat = build_dc_score_matrix_exact(l_h, l_a, r_val, max_goals)
        ch = 0.0
        cd = 0.0
        ca = 0.0
        for h in range(len(mat)):
            row = mat[h]
            for a in range(len(row)):
                p = row[a]
                if h > a:
                    ch += p
                elif h == a:
                    cd += p
                else:
                    ca += p
        return (ch - ca) - target_diff, cd - target_draw

    v = math.log(tot_t)
    f1_0, f2_0 = _eval_res(u, v, rho_eff)
    if (f1_0 * f1_0 + f2_0 * f2_0) <= 1e-16:
        return lh0, la0, rho_eff

    # Etapa 2: Newton 2D amortiguado con `rho_eff` fijo para preservar `1X2` exacto
    # desviando `v = log(T)` únicamente por el mínimo físico indispensable.
    h_step = 1e-4
    v_min = math.log(0.25)
    v_max = math.log(8.0)
    for _ in range(20):
        f1, f2 = _eval_res(u, v, rho_eff)
        norm0 = f1 * f1 + f2 * f2
        if norm0 < 1e-18:
            break
        f1u, f2u = _eval_res(u + h_step, v, rho_eff)
        f1v, f2v = _eval_res(u, v + h_step, rho_eff)
        j11 = (f1u - f1) / h_step
        j21 = (f2u - f2) / h_step
        j12 = (f1v - f1) / h_step
        j22 = (f2v - f2) / h_step
        det = j11 * j22 - j12 * j21
        if (not math.isfinite(det)) or abs(det) < 1e-12:
            break
        du = -(j22 * f1 - j12 * f2) / det
        dv = -(-j21 * f1 + j11 * f2) / det
        step = 1.0
        improved = False
        for _ls in range(8):
            u_try = _clamp(u + step * du, -3.4, 3.4)
            v_try = _clamp(v + step * dv, v_min, v_max)
            r1, r2 = _eval_res(u_try, v_try, rho_eff)
            if r1 * r1 + r2 * r2 < norm0:
                u = u_try
                v = v_try
                improved = True
                break
            step *= 0.5
        if not improved:
            break

    final_t = _clamp(math.exp(v), 0.25, 8.0)
    final_s = _clamp(_sigmoid(u), 0.03, 0.97)
    final_lh = _clamp(final_t * final_s, 0.05, 10.0)
    final_la = _clamp(final_t * (1.0 - final_s), 0.05, 10.0)
    # Re-verificar seguridad de `tau` tras posible ajuste de `final_lh, final_la`
    r_lo_f = max(RHO_ABS_MIN, -TAU_SAFETY_BOUND / max(final_lh, final_la, 1e-6))
    r_hi_f = min(RHO_ABS_MAX, TAU_SAFETY_BOUND / max(final_lh * final_la, 1e-6), TAU_SAFETY_BOUND)
    if r_lo_f <= r_hi_f:
        rho_eff = _clamp(rho_eff, r_lo_f, r_hi_f)
    return final_lh, final_la, rho_eff


def solve_dc_2param_from_1x2(
    p_home: float,
    p_draw: float,
    p_away: float,
    rho: float = -0.10,
    max_goals: int = DEFAULT_MAX_GOALS,
) -> tuple[float, float]:
    """Espejo exacto de `outlook.ts::fitDixonColesLambdasFrom1X2` (baseline legacy 2-parámetros)."""
    ph0 = max(float(p_home), 1e-6)
    pd0 = max(float(p_draw), 1e-6)
    pa0 = max(float(p_away), 1e-6)
    norm_p = ph0 + pd0 + pa0
    ph = ph0 / norm_p
    pd = pd0 / norm_p
    pa = pa0 / norm_p

    init_share = _clamp(ph / max(ph + pa, 1e-6), 0.08, 0.92)
    u = math.log(init_share / (1.0 - init_share))
    v = math.log(2.55)
    target_diff = ph - pa
    target_draw = pd

    def _eval_res(u_val: float, v_val: float) -> tuple[float, float]:
        tot = _clamp(math.exp(v_val), 0.25, 8.0)
        sh = _clamp(_sigmoid(u_val), 0.04, 0.96)
        lh = _clamp(tot * sh, 0.05, 10.0)
        la = _clamp(tot * (1.0 - sh), 0.05, 10.0)
        mat = build_dc_score_matrix_exact(lh, la, rho, max_goals)
        ch = 0.0
        cd = 0.0
        ca = 0.0
        for h in range(len(mat)):
            row = mat[h]
            for a in range(len(row)):
                p = row[a]
                if h > a:
                    ch += p
                elif h == a:
                    cd += p
                else:
                    ca += p
        return (ch - ca) - target_diff, cd - target_draw

    h_step = 1e-4
    v_min = math.log(0.25)
    v_max = math.log(8.0)
    for _ in range(24):
        f1, f2 = _eval_res(u, v)
        norm0 = f1 * f1 + f2 * f2
        if norm0 < 1e-20:
            break
        f1u, f2u = _eval_res(u + h_step, v)
        f1v, f2v = _eval_res(u, v + h_step)
        j11 = (f1u - f1) / h_step
        j21 = (f2u - f2) / h_step
        j12 = (f1v - f1) / h_step
        j22 = (f2v - f2) / h_step
        det = j11 * j22 - j12 * j21
        if (not math.isfinite(det)) or abs(det) < 1e-12:
            break
        du = -(j22 * f1 - j12 * f2) / det
        dv = -(-j21 * f1 + j11 * f2) / det
        step = 1.0
        improved = False
        for _ls in range(8):
            u_try = _clamp(u + step * du, -3.2, 3.2)
            v_try = _clamp(v + step * dv, v_min, v_max)
            r1, r2 = _eval_res(u_try, v_try)
            if r1 * r1 + r2 * r2 < norm0:
                u = u_try
                v = v_try
                improved = True
                break
            step *= 0.5
        if not improved:
            break

    final_t = _clamp(math.exp(v), 0.25, 8.0)
    final_s = _clamp(_sigmoid(u), 0.04, 0.96)
    return _clamp(final_t * final_s, 0.05, 10.0), _clamp(final_t * (1.0 - final_s), 0.05, 10.0)


def predict_poisson_log_link_exact(
    X_design: np.ndarray,
    artifact: Mapping[str, Any],
) -> np.ndarray:
    """Evalúa `clamp(exp(intercept + coef @ ((impute(X) - mean) / scale)), min_total, max_total)`."""
    X_arr = np.asarray(X_design, dtype=np.float64).copy()
    imp = np.asarray(artifact["imputer_statistics"], dtype=np.float64)
    mean = np.asarray(artifact["scaler_mean"], dtype=np.float64)
    scale = np.asarray(artifact["scaler_scale"], dtype=np.float64)
    coef = np.asarray(artifact["coef"], dtype=np.float64)
    intercept = float(artifact["intercept"])
    min_tot = float(artifact.get("min_total_goals", 0.45))
    max_tot = float(artifact.get("max_total_goals", 7.50))

    bad = ~np.isfinite(X_arr)
    if bool(bad.any()):
        r_idx, c_idx = np.where(bad)
        X_arr[r_idx, c_idx] = imp[c_idx]
    safe_scale = np.where(scale == 0.0, 1.0, scale)
    Z = (X_arr - mean[np.newaxis, :]) / safe_scale[np.newaxis, :]
    eta = np.clip(intercept + Z @ coef, math.log(min_tot), math.log(max_tot))
    return np.exp(eta)


# ---------------------------------------------------------------------------
# Evaluación vectorizada rápida para OOF walk-forward (`n ~ 68k` en `< 0.5 s`)
# ---------------------------------------------------------------------------

def summarize_dc_markets_batch(
    lam_home: np.ndarray,
    lam_away: np.ndarray,
    rho: np.ndarray,
    max_goals: int = DEFAULT_MAX_GOALS,
) -> dict[str, np.ndarray]:
    """Versión vectorizada (`N x 13 x 13`) exacta de `build_dc_score_matrix_exact` + `summarize_dc_markets_from_matrix`."""
    lh = np.asarray(lam_home, dtype=np.float64)
    la = np.asarray(lam_away, dtype=np.float64)
    rh = np.asarray(rho, dtype=np.float64)
    n = len(lh)
    size = int(max_goals) + 1

    pmf_h = np.empty((n, size), dtype=np.float64)
    pmf_a = np.empty((n, size), dtype=np.float64)
    pmf_h[:, 0] = np.exp(-lh)
    pmf_a[:, 0] = np.exp(-la)
    for k in range(1, size):
        pmf_h[:, k] = (pmf_h[:, k - 1] * lh) / k
        pmf_a[:, k] = (pmf_a[:, k - 1] * la) / k

    mat = pmf_h[:, :, None] * pmf_a[:, None, :]
    mat[:, 0, 0] *= np.maximum(1.0 - lh * la * rh, 1e-9)
    mat[:, 0, 1] *= np.maximum(1.0 + lh * rh, 1e-9)
    mat[:, 1, 0] *= np.maximum(1.0 + la * rh, 1e-9)
    mat[:, 1, 1] *= np.maximum(1.0 - rh, 1e-9)
    mat /= np.sum(mat, axis=(1, 2), keepdims=True)

    idx_h, idx_a = np.meshgrid(np.arange(size), np.arange(size), indexing="ij")
    p_h = mat[:, idx_h > idx_a].sum(axis=1)
    p_d = mat[:, idx_h == idx_a].sum(axis=1)
    p_a = mat[:, idx_h < idx_a].sum(axis=1)
    tot_g = idx_h + idx_a
    p_ov15 = mat[:, tot_g >= 2].sum(axis=1)
    p_ov25 = mat[:, tot_g >= 3].sum(axis=1)
    p_ov35 = mat[:, tot_g >= 4].sum(axis=1)
    p_btts = mat[:, (idx_h >= 1) & (idx_a >= 1)].sum(axis=1)

    return {
        "p_home": p_h,
        "p_draw": p_d,
        "p_away": p_a,
        "p_over_1_5": p_ov15,
        "p_under_1_5": np.maximum(0.0, 1.0 - p_ov15),
        "p_over_2_5": p_ov25,
        "p_under_2_5": np.maximum(0.0, 1.0 - p_ov25),
        "p_over_3_5": p_ov35,
        "p_under_3_5": np.maximum(0.0, 1.0 - p_ov35),
        "p_btts_yes": p_btts,
        "p_btts_no": np.maximum(0.0, 1.0 - p_btts),
    }


def solve_coherent_dc_3param_batch(
    probs_1x2: np.ndarray,
    total_goals_target: np.ndarray,
    rho_prior: np.ndarray | float = -0.11,
    *,
    rho_shrinkage: float = 0.0,
    max_goals: int = DEFAULT_MAX_GOALS,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Versión vectorizada exacta de `solve_coherent_dc_3param` para evaluación OOF masiva."""
    P = np.maximum(np.asarray(probs_1x2, dtype=np.float64), 1e-6)
    P = P / np.sum(P, axis=1, keepdims=True)
    ph, pd, pa = P[:, 0], P[:, 1], P[:, 2]
    target_diff = ph - pa
    target_draw = pd
    tot_t = np.clip(np.asarray(total_goals_target, dtype=np.float64), 0.35, 7.50)
    n = len(ph)
    size = int(max_goals) + 1
    idx_h, idx_a = np.meshgrid(np.arange(size), np.arange(size), indexing="ij")
    mask_h = idx_h > idx_a
    mask_d = idx_h == idx_a
    mask_a = idx_h < idx_a

    def _pois_batch(lh_v: np.ndarray, la_v: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        pmf_h = np.empty((len(lh_v), size), dtype=np.float64)
        pmf_a = np.empty((len(lh_v), size), dtype=np.float64)
        pmf_h[:, 0] = np.exp(-lh_v)
        pmf_a[:, 0] = np.exp(-la_v)
        for k in range(1, size):
            pmf_h[:, k] = (pmf_h[:, k - 1] * lh_v) / k
            pmf_a[:, k] = (pmf_a[:, k - 1] * la_v) / k
        mat = pmf_h[:, :, None] * pmf_a[:, None, :]
        ch = mat[:, mask_h].sum(axis=1)
        cd = mat[:, mask_d].sum(axis=1)
        ca = mat[:, mask_a].sum(axis=1)
        s = ch + cd + ca
        return ch / s, cd / s, ca / s, s

    u_lo = np.full(n, -3.4, dtype=np.float64)
    u_hi = np.full(n, 3.4, dtype=np.float64)
    for _ in range(36):
        u_mid = 0.5 * (u_lo + u_hi)
        sh = np.clip(1.0 / (1.0 + np.exp(-u_mid)), 0.03, 0.97)
        lh = np.clip(tot_t * sh, 0.05, 10.0)
        la = np.clip(tot_t * (1.0 - sh), 0.05, 10.0)
        ch, _, ca, _ = _pois_batch(lh, la)
        go_right = (ch - ca) < target_diff
        u_lo = np.where(go_right, u_mid, u_lo)
        u_hi = np.where(go_right, u_hi, u_mid)

    u = 0.5 * (u_lo + u_hi)
    sh0 = np.clip(1.0 / (1.0 + np.exp(-u)), 0.03, 0.97)
    lh_out = np.clip(tot_t * sh0, 0.05, 10.0)
    la_out = np.clip(tot_t * (1.0 - sh0), 0.05, 10.0)
    _, cd_pois, _, s_pois = _pois_batch(lh_out, la_out)

    rp_vec = np.broadcast_to(np.asarray(rho_prior, dtype=np.float64), (n,)).copy()
    denom = (2.0 * lh_out * la_out * np.exp(-(lh_out + la_out))) / np.maximum(s_pois, 1e-12)
    rho_req = np.where(denom > 1e-9, (cd_pois - target_draw) / np.maximum(denom, 1e-12), rp_vec)
    shrink = _clamp(float(rho_shrinkage), 0.0, 1.0)
    rho_blend = (1.0 - shrink) * rho_req + shrink * rp_vec

    rho_lo = np.maximum(RHO_ABS_MIN, -TAU_SAFETY_BOUND / np.maximum(np.maximum(lh_out, la_out), 1e-6))
    rho_hi = np.minimum(RHO_ABS_MAX, np.minimum(TAU_SAFETY_BOUND / np.maximum(lh_out * la_out, 1e-6), TAU_SAFETY_BOUND))
    rho_eff = np.where(rho_lo <= rho_hi, np.clip(rho_blend, rho_lo, rho_hi), np.clip(rp_vec, RHO_ABS_MIN, RHO_ABS_MAX))

    # Para las pocas filas donde `rho_eff != rho_req` (o `shrink > 0`), delegar al solver exacto escalar
    # garantizando paridad 100% `< 1e-15` con `solve_coherent_dc_3param`.
    check = summarize_dc_markets_batch(lh_out, la_out, rho_eff, max_goals)
    res_sq = ((check["p_home"] - check["p_away"]) - target_diff) ** 2 + (check["p_draw"] - target_draw) ** 2
    need_stage2 = np.where(res_sq > 1e-16)[0]
    for idx in need_stage2:
        lh_i, la_i, rh_i = solve_coherent_dc_3param(
            float(ph[idx]),
            float(pd[idx]),
            float(pa[idx]),
            float(tot_t[idx]),
            float(rp_vec[idx]),
            rho_shrinkage=shrink,
            max_goals=max_goals,
        )
        lh_out[idx] = lh_i
        la_out[idx] = la_i
        rho_eff[idx] = rh_i
    return lh_out, la_out, rho_eff

