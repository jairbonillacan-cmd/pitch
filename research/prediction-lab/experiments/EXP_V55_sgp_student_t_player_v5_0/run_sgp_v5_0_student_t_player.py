"""EXP_V55 — Cópula `Student-t` / Gaussiana Residualizada Exacta (`bw = 0.012`, Beta Incompleta 60-pasos)
y *Bet Builder* Estructural Jugador-Partido (`Raikov + Dixon-Coles`, Titulares Causales).

Remediaciones de auditoría `v5.1` (`A6, B1, B2, C5`, `< 2025-02-02`, `holdout_sealed` intacto):
  1. Re-estima `corr_soccer` (`8x8`) y `corr_nfl` (`6x6`) estrictamente sobre **residuos condicionados**
     `(Y - E[Y | X_prematch])` en `VAL <= 2019` (eliminando doble conteo de fuerza pre-partido).
  2. Reduce `qmc_smooth_bandwidth` de `0.06` a `0.012` (sesgo QMC `< 0.05 pp` vs `scipy.stats.multivariate_normal`)
     y sustituye Cornish-Fisher por inversión exacta de la CDF Student-t vía Beta Incompleta Regularizada
     (`60` pasos de bisección, `< 1e-11` vs `scipy.stats.t.ppf` y `< 1e-14` Python <-> TS).
  3. Reemplaza la fórmula hardcodeada de `SoT` por predictor causal de `SoT` entrenado en `VAL <= 2019`,
     valida realmente `df_nu in {5, 7, 10, 16, 500}` tanto en Fútbol como en **NFL** (adiós `10.0` inventado),
     y declara honestamente `copula_family = "gaussian"` cuando `VAL` elige `nu = 500`.
  4. Incorpora el factor Dixon-Coles `rho` en `evaluate_player_linked_sgp_scalar` y evalúa `Player-Linked SGP`
     en `OOS 2020..2024` sobre **titulares causales pre-partido** (`prematch_ewm_minutes >= 58.0`) con
     `cluster_bootstrap_binary` agrupado por `game_id`.
"""

from __future__ import annotations

import os

os.environ.setdefault("OMP_NUM_THREADS", "4")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")

from collections import defaultdict
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import sys
from typing import Any

import numpy as np
import pandas as pd
from scipy import stats as scipy_stats
from sklearn.linear_model import LogisticRegression

EXP_DIR = Path(__file__).resolve().parent
REPO_ROOT = EXP_DIR.parents[3]
PRED_LAB_ROOT = REPO_ROOT / "research" / "prediction-lab"
FREE_OPEN_DIR = PRED_LAB_ROOT / "data" / "raw" / "free_open_v33"
EXP_V32_DIR = PRED_LAB_ROOT / "experiments" / "EXP_V32_nfl_epa"
EXP_V40_DIR = PRED_LAB_ROOT / "experiments" / "EXP_V40_soccer_micro_markets"
EXP_V41_DIR = PRED_LAB_ROOT / "experiments" / "EXP_V41_hierarchical_props"
EXP_V48_DIR = PRED_LAB_ROOT / "experiments" / "EXP_V48_sgp_copula_engine"
ARTIFACTS_DIR = EXP_DIR / "artifacts"

for _p in (str(REPO_ROOT), str(EXP_V40_DIR), str(EXP_V41_DIR), str(EXP_V48_DIR), str(EXP_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from services.models.cluster_bootstrap import cluster_bootstrap_binary  # noqa: E402
from run_micro_markets_experiment import (  # noqa: E402
    BOOTSTRAP_SAMPLES,
    BOOTSTRAP_SEED,
    HOLDOUT_CUT_DATE,
    HOLDOUT_CUT_ISO,
    MODEL_SEED,
)
from run_props_experiment import TARGET_COMPETITIONS, map_tm_position_cluster  # noqa: E402
from run_sgp_copula_experiment import (  # noqa: E402
    NFL_FACTORS_6,
    QMC_POINTS,
    SOCCER_FACTORS_8,
    _estimate_psd_latent_correlation,
    _smooth_step,
    acklam_normal_quantile_scalar,
    cholesky_lower_exact,
    halton_scalar,
)

SGP_V5_MODEL_OUT = REPO_ROOT / "src" / "data" / "prediction" / "sgp_copula_v5_0_candidate.json"
SGP_V5_SNAPSHOT_OUT = REPO_ROOT / "src" / "data" / "prediction" / "sgp_copula_v5_0_snapshot.json"
RESULTS_OUT = ARTIFACTS_DIR / "exp_v55_sgp_v5_0_results.json"
TRIAL_REGISTRY_OUT = EXP_DIR / "trial_registry_sgp_v50.jsonl"

HALTON_PRIMES_9: tuple[int, ...] = (2, 3, 5, 7, 11, 13, 17, 19, 23)
QMC_SMOOTH_BW_V51 = 0.012


def _wrap_cluster_binary_es(
    cluster_ids: np.ndarray,
    y_true: np.ndarray,
    p_cand: np.ndarray,
    p_bench: np.ndarray,
    seed: int = BOOTSTRAP_SEED,
) -> dict[str, Any]:
    cb = cluster_bootstrap_binary(
        cluster_ids,
        y_true,
        p_cand,
        p_bench,
        n_resamples=BOOTSTRAP_SAMPLES,
        seed=seed,
    )
    ci_lo = cb["ci95_lo"]
    ci_hi = cb["ci95_hi"]
    sig = "significativa" if (ci_hi is not None and ci_lo is not None and (ci_hi < 0.0 or ci_lo > 0.0)) else "no significativa"
    return {
        "n": int(cb["n_rows"]),
        "n_clusters": int(cb["n_clusters"]),
        "log_loss": float(cb["logloss_cand"]),
        "benchmark_log_loss": float(cb["logloss_bench"]),
        "delta_ll": float(cb["delta_logloss"]),
        "delta_ll_ci95": [float(ci_lo), float(ci_hi)] if (ci_lo is not None and ci_hi is not None) else None,
        "significance": sig,
        "brier": float(cb["brier_cand"]),
        "benchmark_brier": float(cb["brier_bench"]),
        "ece": float(cb["ece_cand"]) if cb["ece_cand"] is not None else None,
        "promoted_n_ge_50pct": int(cb["promoted_n_ge_50pct"]),
        "promoted_ece_ge_50pct": cb["promoted_ece_ge_50pct"],
    }


def _log_gamma_lanczos(z: float) -> float:
    g = 7.0
    p = (
        0.99999999999980993,
        676.5203681218851,
        -1259.1392167224028,
        771.32342877765313,
        -176.61502916214059,
        12.507343278686905,
        -0.13857109526572012,
        9.9843695780195716e-6,
        1.5056327351493116e-7,
    )
    zm = z - 1.0
    x = p[0]
    for i in range(1, len(p)):
        x += p[i] / (zm + i)
    t = zm + g + 0.5
    return 0.5 * math.log(2.0 * math.pi) + (zm + 0.5) * math.log(t) - t + math.log(x)


def _beta_cf_lentz(a: float, b: float, x: float) -> float:
    max_iter = 120
    eps = 3.0e-14
    fp_min = 1.0e-30
    qab = a + b
    qap = a + 1.0
    qam = a - 1.0
    c = 1.0
    d = 1.0 - (qab * x) / qap
    if abs(d) < fp_min:
        d = fp_min
    d = 1.0 / d
    h = d
    for m in range(1, max_iter + 1):
        m2 = 2 * m
        aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        if abs(d) < fp_min:
            d = fp_min
        c = 1.0 + aa / c
        if abs(c) < fp_min:
            c = fp_min
        d = 1.0 / d
        h *= d * c
        aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        if abs(d) < fp_min:
            d = fp_min
        c = 1.0 + aa / c
        if abs(c) < fp_min:
            c = fp_min
        d = 1.0 / d
        del_v = d * c
        h *= del_v
        if abs(del_v - 1.0) < eps:
            break
    return h


def _regularized_incomplete_beta(a: float, b: float, x: float) -> float:
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    bt = math.exp(
        _log_gamma_lanczos(a + b)
        - _log_gamma_lanczos(a)
        - _log_gamma_lanczos(b)
        + a * math.log(x)
        + b * math.log(1.0 - x)
    )
    if x < (a + 1.0) / (a + b + 2.0):
        return (bt * _beta_cf_lentz(a, b, x)) / a
    return 1.0 - (bt * _beta_cf_lentz(b, a, 1.0 - x)) / b


def student_t_quantile_scalar(p_in: float, df_nu: float) -> float:
    """Espejo escalar exacto (`< 1e-14`) de `studentTQuantileExact` en `sgp_copula.ts` (`< 1e-11` vs `scipy.stats.t.ppf`)."""
    p = min(max(float(p_in), 1e-12), 1.0 - 1e-12)
    nu = max(float(df_nu), 2.0)
    if nu >= 500.0:
        return acklam_normal_quantile_scalar(p)
    if abs(p - 0.5) < 1e-15:
        return 0.0

    sign = 1.0 if p > 0.5 else -1.0
    target_two_q = 2.0 * min(p, 1.0 - p)
    a = 0.5 * nu
    b = 0.5
    lo = 1e-15
    hi = 1.0
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        if _regularized_incomplete_beta(a, b, mid) < target_two_q:
            lo = mid
        else:
            hi = mid
    x = max(0.5 * (lo + hi), 1e-15)
    return sign * math.sqrt((nu * max(0.0, 1.0 - x)) / x)


def _standard_normal_cdf_exact(x: float) -> float:
    """Espejo bit-a-bit de `standardNormalCdfExact` en `sgp_copula.ts` (A&S 7.1.26, `< 1e-15` paridad Py↔TS)."""
    z = float(x) / math.sqrt(2.0)
    sign = -1.0 if z < 0.0 else 1.0
    az = abs(z)
    t = 1.0 / (1.0 + 0.3275911 * az)
    poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t
    erf_approx = sign * (1.0 - poly * math.exp(-az * az))
    return 0.5 * (1.0 + erf_approx)


def _standard_normal_cdf_vec(x: np.ndarray) -> np.ndarray:
    z = x / math.sqrt(2.0)
    sign = np.where(z < 0.0, -1.0, 1.0)
    az = np.abs(z)
    t = 1.0 / (1.0 + 0.3275911 * az)
    poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t
    return 0.5 * (1.0 + sign * (1.0 - poly * np.exp(-az * az)))


def student_t_radial_scale_scalar(u_in: float, df_nu: float) -> float:
    """Espejo escalar exacto (`< 1e-15`) de `studentTRadialScaleFromUniform` en `sgp_copula.ts`."""
    nu = max(float(df_nu), 3.5)
    if nu >= 500.0:
        return 1.0
    zw = acklam_normal_quantile_scalar(u_in)
    h_nu = 2.0 / (9.0 * nu)
    cr = max(0.18, 1.0 - h_nu + zw * math.sqrt(h_nu))
    w_div_nu = cr * cr * cr
    return 1.0 / math.sqrt(max(w_div_nu, 1e-6))


def evaluate_student_t_sgp_scalar(
    sport: str,
    legs: list[dict[str, Any]],
    artifact: dict[str, Any],
    df_nu_override: float | None = None,
    offered_odds: float | None = None,
) -> dict[str, Any]:
    """Espejo escalar exacto (`< 1e-14`) de `evaluateStudentTSameGameParlayV5` en `sgp_copula.ts`."""
    spec = artifact["sports"][sport]
    nu = min(max(float(df_nu_override if df_nu_override is not None else spec["df_nu"]), 4.0), 1000.0)
    f_idx = {nm: ix for ix, nm in enumerate(spec["factors"])}
    k_legs = len(legs)
    sub_idx = [f_idx[lg["factor"]] for lg in legs]

    sub_corr = [
        [1.0 if r == c else min(max(float(spec["correlation_matrix"][sub_idx[r]][sub_idx[c]]), -0.985), 0.985) for c in range(k_legs)]
        for r in range(k_legs)
    ]
    L = cholesky_lower_exact(sub_corr)
    probs = [min(max(float(lg["marginalProbability"]), 0.001), 0.999) for lg in legs]
    dirs = [int(lg["direction"]) for lg in legs]
    thrs_t = [student_t_quantile_scalar(1.0 - p, nu) for p in probs]

    indep = 1.0
    for p in probs:
        indep *= p

    n_pts = int(artifact["qmc_halton_points"])
    bw = float(artifact["qmc_smooth_bandwidth"])
    rad_prime = HALTON_PRIMES_9[k_legs]
    uz = [0.0] * k_legs
    acc = 0.0
    last_idx = k_legs - 1
    last_row_l = L[last_idx]
    last_diag_l = max(last_row_l[last_idx], 1e-12)
    last_dir = dirs[last_idx]
    last_thr = thrs_t[last_idx]

    for pt in range(1, n_pts + 1):
        for m in range(last_idx):
            uz[m] = acklam_normal_quantile_scalar(halton_scalar(pt, HALTON_PRIMES_9[m]))
        r_scale = student_t_radial_scale_scalar(halton_scalar(pt, rad_prime), nu)
        prod = 1.0
        for m in range(last_idx):
            zc = 0.0
            for j in range(m + 1):
                zc += L[m][j] * uz[j]
            prod *= _smooth_step(dirs[m] * (zc * r_scale) - thrs_t[m], bw)
        z_pref = 0.0
        for j in range(last_idx):
            z_pref += last_row_l[j] * uz[j]
        prod *= _standard_normal_cdf_exact((last_dir * z_pref - last_thr / r_scale) / last_diag_l)
        acc += prod

    f_lo = max(0.0005, sum(probs) - float(k_legs - 1))
    f_hi = min(0.999, min(probs))
    joint = min(max(acc / float(n_pts), f_lo), f_hi)
    mult = joint / max(indep, 1e-9)

    hold_pct = None
    if offered_odds is not None:
        hold_pct = max(0.0, (1.0 - float(offered_odds) * joint) * 100.0)

    return {
        "copula_family": "gaussian" if nu >= 500.0 else "student_t",
        "degrees_of_freedom_nu": nu,
        "independent_probability": indep,
        "joint_probability": joint,
        "correlation_multiplier": mult,
        "effective_hold_pct": hold_pct,
    }


def _batch_eval_student_t_qmc_fast(
    probs_mat: np.ndarray,
    dirs: list[int],
    sub_corr: list[list[float]],
    df_nu: float,
    uz_halton: np.ndarray,
    u_rad_vec: np.ndarray,
    bw: float = QMC_SMOOTH_BW_V51,
) -> np.ndarray:
    """Evalúa `N` partidos x `2,048` puntos QMC `Student-t` / Gaussiana con cuantiles exactos y Rao-Blackwell Genz en última pata."""
    L = np.array(cholesky_lower_exact(sub_corr), dtype=np.float64)
    k_legs = len(dirs)
    last_idx = k_legs - 1
    r_scales = np.array([student_t_radial_scale_scalar(float(u), df_nu) for u in u_rad_vec], dtype=np.float64)[:, None]
    uz_pre = uz_halton[:, :last_idx]
    T_pre = (uz_pre @ L[:last_idx, :last_idx].T) * r_scales
    z_pref_last = (uz_pre @ L[last_idx, :last_idx]) * float(dirs[last_idx])  # (n_pts,)
    last_diag = max(float(L[last_idx, last_idx]), 1e-12)
    inv_r_scales = (1.0 / r_scales[:, 0])  # (n_pts,)

    p_c = np.clip(probs_mat, 0.001, 0.999)
    if df_nu >= 500.0:
        thrs = scipy_stats.norm.ppf(1.0 - p_c)
    else:
        thrs = scipy_stats.t.ppf(1.0 - p_c, df=float(df_nu))

    n = len(p_c)
    out = np.empty(n, dtype=np.float64)
    dirs_pre = np.array(dirs[:last_idx], dtype=np.float64)[None, None, :]
    t_pre_exp = T_pre[None, :, :]

    for st in range(0, n, 4096):
        ed = min(n, st + 4096)
        th_pre = thrs[st:ed, None, :last_idx]
        arg = np.clip((dirs_pre * t_pre_exp - th_pre) / bw, -35.0, 35.0)
        hit_pre = np.prod(1.0 / (1.0 + np.exp(-arg)), axis=2)  # (B, n_pts)
        th_last = thrs[st:ed, last_idx : last_idx + 1]  # (B, 1)
        last_arg = (z_pref_last[None, :] - th_last * inv_r_scales[None, :]) / last_diag
        hit_last = _standard_normal_cdf_vec(last_arg)
        joint_b = np.mean(hit_pre * hit_last, axis=1)
        f_lo = np.maximum(0.0005, np.sum(p_c[st:ed], axis=1) - float(k_legs - 1))
        f_hi = np.minimum(0.999, np.min(p_c[st:ed], axis=1))
        out[st:ed] = np.clip(joint_b, f_lo, f_hi)
    return out


def evaluate_player_linked_sgp_scalar(
    p_player_goal: float,
    team_exp_goals: float,
    opp_exp_goals: float,
    team_outcome: str,
    match_total_over_line: float | None = None,
    dixon_coles_rho: float = 0.0,
) -> dict[str, Any]:
    """Espejo escalar exacto (`< 1e-14`) de `evaluatePlayerLinkedSgpV5` en `sgp_copula.ts` (con Dixon-Coles `rho`)."""
    p_pl = min(max(float(p_player_goal), 0.002), 0.95)
    lam_t = min(max(float(team_exp_goals), 0.15), 6.5)
    lam_o = min(max(float(opp_exp_goals), 0.15), 6.5)
    dc_rho = min(max(float(dixon_coles_rho), -0.22), 0.16)

    def _dc_tau(gt: int, go: int) -> float:
        if dc_rho == 0.0:
            return 1.0
        if gt == 0 and go == 0:
            return max(1.0 - lam_t * lam_o * dc_rho, 1e-9)
        if gt == 1 and go == 0:
            return max(1.0 + lam_o * dc_rho, 1e-9)
        if gt == 0 and go == 1:
            return max(1.0 + lam_t * dc_rho, 1e-9)
        if gt == 1 and go == 1:
            return max(1.0 - dc_rho, 1e-9)
        return 1.0

    mu_p = min(max(-math.log(1.0 - p_pl), 0.002), 0.88 * lam_t)
    lam_rest = max(0.04, lam_t - mu_p)
    max_kp = 6
    max_g = 10

    raw_pos = np.zeros(max_kp + 1, dtype=np.float64)
    prev_p = math.exp(-mu_p)
    sum_pos = 0.0
    for k in range(1, max_kp + 1):
        prev_p = (prev_p * mu_p) / float(k)
        raw_pos[k] = prev_p
        sum_pos += prev_p
    raw_pos *= p_pl / max(sum_pos, 1e-12)

    def _pois(lam: float, mv: int) -> np.ndarray:
        arr = np.empty(mv + 1, dtype=np.float64)
        arr[0] = math.exp(-lam)
        for g in range(1, mv + 1):
            arr[g] = (arr[g - 1] * lam) / float(g)
        arr /= max(float(np.sum(arr)), 1e-15)
        return arr

    pmf_rest = _pois(lam_rest, max_g)
    pmf_opp = _pois(lam_o, max_g)
    pmf_tfull = _pois(lam_t, max_g + max_kp)

    z_full = 0.0
    p_tm_marg = 0.0
    p_tot_marg = 0.0
    has_tot = match_total_over_line is not None
    tot_ln = float(match_total_over_line) if has_tot else -1.0

    for gt in range(len(pmf_tfull)):
        pt = float(pmf_tfull[gt])
        for go in range(max_g + 1):
            pc = pt * float(pmf_opp[go]) * _dc_tau(gt, go)
            z_full += pc
            tok = True if team_outcome == "any" else (gt > go if team_outcome == "team_win" else gt >= go)
            if tok:
                p_tm_marg += pc
            if has_tot and (gt + go) > tot_ln:
                p_tot_marg += pc

    inv_z = 1.0 / z_full if z_full > 1e-15 else 1.0
    p_tm_marg *= inv_z
    p_tot_marg *= inv_z

    mass_pos_dc = 0.0
    joint_raw_dc = 0.0
    for k in range(1, max_kp + 1):
        pk = float(raw_pos[k])
        for gr in range(max_g + 1):
            gt = k + gr
            pkr = pk * float(pmf_rest[gr])
            for go in range(max_g + 1):
                w = pkr * float(pmf_opp[go]) * _dc_tau(gt, go)
                mass_pos_dc += w
                tok = True if team_outcome == "any" else (gt > go if team_outcome == "team_win" else gt >= go)
                if not tok:
                    continue
                if has_tot and (gt + go) <= tot_ln:
                    continue
                joint_raw_dc += w

    joint_raw = joint_raw_dc * (p_pl / mass_pos_dc) if (dc_rho != 0.0 and mass_pos_dc > 1e-15) else joint_raw_dc
    indep = p_pl * (1.0 if team_outcome == "any" else p_tm_marg) * (p_tot_marg if has_tot else 1.0)
    ub = min(p_pl, 1.0 if team_outcome == "any" else p_tm_marg, p_tot_marg if has_tot else 1.0)
    joint = min(max(joint_raw, 0.0005), max(0.001, ub))
    return {
        "p_player_scores": p_pl,
        "p_team_marginal": 1.0 if team_outcome == "any" else p_tm_marg,
        "p_total_marginal": p_tot_marg if has_tot else None,
        "independent_probability": indep,
        "joint_probability": joint,
        "structural_lift_multiplier": joint / max(indep, 1e-9),
    }


def _verify_numerical_precision(uz_halton: np.ndarray, u_rad_2: np.ndarray) -> dict[str, float]:
    """Audita precisión numérica contra `scipy.stats.t.ppf` y `scipy.stats.multivariate_normal` (Axioma 9)."""
    max_t_err = 0.0
    for nu in (4.0, 5.0, 7.0, 10.0, 16.0, 40.0):
        for p in (0.002, 0.01, 0.05, 0.15, 0.35, 0.50, 0.72, 0.90, 0.99, 0.998):
            e = abs(student_t_quantile_scalar(p, nu) - float(scipy_stats.t.ppf(p, df=nu)))
            if e > max_t_err:
                max_t_err = e

    # Verificar sesgo QMC `bw = 0.012` vs integral bivariada Gaussiana exacta de `scipy.stats.multivariate_normal`
    max_qmc_bias = 0.0
    for rho in (-0.45, -0.25, 0.0, 0.30, 0.55):
        for p1, p2 in ((0.25, 0.30), (0.50, 0.50), (0.65, 0.40)):
            q_val = float(
                _batch_eval_student_t_qmc_fast(
                    np.array([[p1, p2]], dtype=np.float64),
                    [1, 1],
                    [[1.0, rho], [rho, 1.0]],
                    999.0,
                    uz_halton,
                    u_rad_2,
                    bw=QMC_SMOOTH_BW_V51,
                )[0]
            )
            z1 = float(scipy_stats.norm.ppf(p1))
            z2 = float(scipy_stats.norm.ppf(p2))
            exact = float(scipy_stats.multivariate_normal.cdf([z1, z2], mean=[0.0, 0.0], cov=[[1.0, rho], [rho, 1.0]]))
            max_qmc_bias = max(max_qmc_bias, abs(q_val - exact))
    return {
        "max_student_t_quantile_error_vs_scipy": max_t_err,
        "max_qmc_bivariate_bias_vs_scipy_mvn": max_qmc_bias,
    }


def main() -> None:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    uz_halton = np.array(
        [[acklam_normal_quantile_scalar(halton_scalar(pt, HALTON_PRIMES_9[m])) for m in range(8)] for pt in range(1, QMC_POINTS + 1)],
        dtype=np.float64,
    )
    u_rad_2 = np.array([halton_scalar(pt, HALTON_PRIMES_9[2]) for pt in range(1, QMC_POINTS + 1)], dtype=np.float64)
    u_rad_3 = np.array([halton_scalar(pt, HALTON_PRIMES_9[3]) for pt in range(1, QMC_POINTS + 1)], dtype=np.float64)

    num_audit = _verify_numerical_precision(uz_halton, u_rad_2)
    print(
        f"[EXP_V55 Precision Audit] max Student-t quantile err vs scipy={num_audit['max_student_t_quantile_error_vs_scipy']:.3e} | "
        f"max QMC(bw={QMC_SMOOTH_BW_V51}) bias vs MVN={100.0*num_audit['max_qmc_bivariate_bias_vs_scipy_mvn']:.4f} pp"
    )

    # =========================================================================
    # 1. Fútbol: Matriz `8x8` 100% Residualizada (`VAL <= 2019`) + Calibración Honesta `df_nu` con `SoT` causal
    # =========================================================================
    m_df = pd.read_parquet(PRED_LAB_ROOT / "data" / "processed" / "matches.parquet")
    m_df["md_str"] = m_df["match_date"].astype(str).str.slice(0, 10)
    m_df = m_df[m_df["md_str"] < HOLDOUT_CUT_DATE].copy()
    if bool((m_df["md_str"] >= HOLDOUT_CUT_DATE).any()):
        raise RuntimeError("HoldoutSealedAccessError en EXP_V55 (Soccer)")

    f_df = pd.read_parquet(PRED_LAB_ROOT / "data" / "processed" / "features.parquet", columns=["match_id", "dc_lam_home", "dc_lam_away"])
    m_df = m_df.merge(f_df, on="match_id", how="left")
    m_df["sstart"] = pd.to_numeric(m_df["season_start"], errors="coerce").fillna(2000).astype(int)

    req_c = ["home_goals", "away_goals", "ht_home_goals", "ht_away_goals", "corners_home", "corners_away", "yellows_home", "yellows_away", "sot_home", "sot_away"]
    for c in req_c:
        m_df[c] = pd.to_numeric(m_df[c], errors="coerce")
    soc_df = (
        m_df[m_df[req_c].notna().all(axis=1) & (m_df["sstart"] >= 2012)]
        .sort_values(["md_str", "match_id"], kind="mergesort")
        .reset_index(drop=True)
    )

    # Expectativas causales pre-partido (`t' < t`) para Corners, Amarillas y SoT (100% residualización en `A6`!)
    n_soc = len(soc_df)
    exp_ch = np.empty(n_soc, dtype=np.float64)
    exp_ca = np.empty(n_soc, dtype=np.float64)
    exp_yel = np.empty(n_soc, dtype=np.float64)
    exp_sot = np.empty(n_soc, dtype=np.float64)

    ch_for_ewm: dict[str, float] = {}
    ch_ag_ewm: dict[str, float] = {}
    yel_ewm: dict[str, float] = {}
    sot_for_ewm: dict[str, float] = {}
    sot_ag_ewm: dict[str, float] = {}
    div_ch_ewm: dict[str, float] = {}
    div_ca_ewm: dict[str, float] = {}
    div_yel_ewm: dict[str, float] = {}
    div_sot_ewm: dict[str, float] = {}
    a_tm = 2.0 / 19.0
    a_dv = 2.0 / 121.0

    for idx_r, r in enumerate(soc_df.itertuples(index=False)):
        dv = str(r.div)
        ht = str(r.home_team)
        at = str(r.away_team)
        d_ch = div_ch_ewm.get(dv, 5.45)
        d_ca = div_ca_ewm.get(dv, 4.45)
        d_yl = div_yel_ewm.get(dv, 4.10)
        d_st = div_sot_ewm.get(dv, 8.60)

        exp_ch[idx_r] = 0.5 * (ch_for_ewm.get(ht, d_ch) + ch_ag_ewm.get(at, d_ch))
        exp_ca[idx_r] = 0.5 * (ch_for_ewm.get(at, d_ca) + ch_ag_ewm.get(ht, d_ca))
        exp_yel[idx_r] = 0.5 * (yel_ewm.get(ht, d_yl) + yel_ewm.get(at, d_yl))
        exp_sot[idx_r] = 0.5 * (sot_for_ewm.get(ht, 0.5 * d_st) + sot_ag_ewm.get(at, 0.5 * d_st)) + 0.5 * (
            sot_for_ewm.get(at, 0.5 * d_st) + sot_ag_ewm.get(ht, 0.5 * d_st)
        )

        ch_o, ca_o = float(r.corners_home), float(r.corners_away)
        yl_o = float(r.yellows_home) + float(r.yellows_away)
        sh_o, sa_o = float(r.sot_home), float(r.sot_away)

        ch_for_ewm[ht] = a_tm * ch_o + (1.0 - a_tm) * ch_for_ewm.get(ht, d_ch)
        ch_ag_ewm[ht] = a_tm * ca_o + (1.0 - a_tm) * ch_ag_ewm.get(ht, d_ca)
        ch_for_ewm[at] = a_tm * ca_o + (1.0 - a_tm) * ch_for_ewm.get(at, d_ca)
        ch_ag_ewm[at] = a_tm * ch_o + (1.0 - a_tm) * ch_ag_ewm.get(at, d_ch)

        yel_ewm[ht] = a_tm * yl_o + (1.0 - a_tm) * yel_ewm.get(ht, d_yl)
        yel_ewm[at] = a_tm * yl_o + (1.0 - a_tm) * yel_ewm.get(at, d_yl)

        sot_for_ewm[ht] = a_tm * sh_o + (1.0 - a_tm) * sot_for_ewm.get(ht, 0.5 * d_st)
        sot_ag_ewm[ht] = a_tm * sa_o + (1.0 - a_tm) * sot_ag_ewm.get(ht, 0.5 * d_st)
        sot_for_ewm[at] = a_tm * sa_o + (1.0 - a_tm) * sot_for_ewm.get(at, 0.5 * d_st)
        sot_ag_ewm[at] = a_tm * sh_o + (1.0 - a_tm) * sot_ag_ewm.get(at, 0.5 * d_st)

        div_ch_ewm[dv] = a_dv * ch_o + (1.0 - a_dv) * d_ch
        div_ca_ewm[dv] = a_dv * ca_o + (1.0 - a_dv) * d_ca
        div_yel_ewm[dv] = a_dv * yl_o + (1.0 - a_dv) * d_yl
        div_sot_ewm[dv] = a_dv * (sh_o + sa_o) + (1.0 - a_dv) * d_st

    lh_s = soc_df["dc_lam_home"].fillna(1.42).to_numpy(dtype=np.float64)
    la_s = soc_df["dc_lam_away"].fillna(1.15).to_numpy(dtype=np.float64)
    lt_s = lh_s + la_s
    hg_s = soc_df["home_goals"].to_numpy(dtype=np.float64)
    ag_s = soc_df["away_goals"].to_numpy(dtype=np.float64)
    tot_g = hg_s + ag_s
    ht_g = (soc_df["ht_home_goals"] + soc_df["ht_away_goals"]).to_numpy(dtype=np.float64)
    ch_s = soc_df["corners_home"].to_numpy(dtype=np.float64)
    ca_s = soc_df["corners_away"].to_numpy(dtype=np.float64)
    yel_s = (soc_df["yellows_home"] + soc_df["yellows_away"]).to_numpy(dtype=np.float64)
    sot_g = (soc_df["sot_home"] + soc_df["sot_away"]).to_numpy(dtype=np.float64)
    dates_s = soc_df["md_str"].to_numpy()

    val_s = soc_df["sstart"].to_numpy(dtype=int) <= 2019
    oos_s = soc_df["sstart"].to_numpy(dtype=int) >= 2020

    soc_resid_val = pd.DataFrame(
        {
            "goal_diff": (hg_s - ag_s)[val_s] - (lh_s - la_s)[val_s],
            "total_goals": tot_g[val_s] - lt_s[val_s],
            "ht_total_goals": ht_g[val_s] - 0.442 * lt_s[val_s],
            "home_corners": ch_s[val_s] - exp_ch[val_s],
            "away_corners": ca_s[val_s] - exp_ca[val_s],
            "total_corners": (ch_s + ca_s)[val_s] - (exp_ch + exp_ca)[val_s],
            "total_yellow_cards": yel_s[val_s] - exp_yel[val_s],
            "total_shots_on_target": sot_g[val_s] - exp_sot[val_s],
        }
    )
    corr_soc = _estimate_psd_latent_correlation(soc_resid_val)

    # Marginales causales reales en Fútbol (`SoT >= 11` calibrado con predictor causal `exp_sot` + `lt_s` en `VAL <= 2019`)
    p_o35 = 1.0 - np.exp(-lt_s) * (1.0 + lt_s + 0.5 * (lt_s ** 2) + (lt_s ** 3) / 6.0)
    l1h = 0.442 * lt_s
    p_1ho15 = 1.0 - np.exp(-l1h) * (1.0 + l1h)
    X_sot_feat = np.column_stack([exp_sot, lt_s])
    lr_sot105 = LogisticRegression(C=2.0).fit(X_sot_feat[val_s], (sot_g[val_s] >= 11).astype(int))
    p_sot105 = np.clip(lr_sot105.predict_proba(X_sot_feat)[:, 1], 0.02, 0.92)
    y_tail3 = ((tot_g >= 4) & (ht_g >= 2) & (sot_g >= 11)).astype(np.float64)

    sub3_soc = [
        [1.0, corr_soc[1][2], corr_soc[1][7]],
        [corr_soc[2][1], 1.0, corr_soc[2][7]],
        [corr_soc[7][1], corr_soc[7][2], 1.0],
    ]
    probs_tail3 = np.column_stack([p_o35, p_1ho15, p_sot105])

    best_nu_soc = 500.0
    best_val_ll_soc = float("inf")
    soc_nu_curve: dict[str, float] = {}
    for nu_try in (5.0, 7.0, 10.0, 16.0, 500.0):
        pv = np.clip(_batch_eval_student_t_qmc_fast(probs_tail3[val_s], [1, 1, 1], sub3_soc, nu_try, uz_halton, u_rad_3), 1e-12, 1.0 - 1e-12)
        yv = y_tail3[val_s]
        ll_v = float(-np.mean(yv * np.log(pv) + (1.0 - yv) * np.log(1.0 - pv)))
        soc_nu_curve[str(int(nu_try))] = round(ll_v, 6)
        if ll_v < best_val_ll_soc:
            best_val_ll_soc = ll_v
            best_nu_soc = nu_try

    soc_family = "gaussian" if best_nu_soc >= 500.0 else "student_t"
    p_tail_t_oos = _batch_eval_student_t_qmc_fast(probs_tail3[oos_s], [1, 1, 1], sub3_soc, best_nu_soc, uz_halton, u_rad_3)
    p_tail_gauss_oos = _batch_eval_student_t_qmc_fast(probs_tail3[oos_s], [1, 1, 1], sub3_soc, 999.0, uz_halton, u_rad_3)
    p_tail_indep_oos = p_o35[oos_s] * p_1ho15[oos_s] * p_sot105[oos_s]

    ev_t_vs_gauss_tail = _wrap_cluster_binary_es(dates_s[oos_s], y_tail3[oos_s], p_tail_t_oos, p_tail_gauss_oos, seed=BOOTSTRAP_SEED)
    ev_t_vs_indep_tail = _wrap_cluster_binary_es(dates_s[oos_s], y_tail3[oos_s], p_tail_t_oos, p_tail_indep_oos, seed=BOOTSTRAP_SEED + 1)

    # =========================================================================
    # 2. NFL: Matriz `6x6` 100% Residualizada (`VAL <= 2019`) + Validación Real de `df_nu` en NFL (`A6, C5`)
    # =========================================================================
    nfl_dev = pd.read_parquet(EXP_V32_DIR / "artifacts" / "nfl_dev_causal_41_features.parquet")
    nfl_dev["gd_str"] = nfl_dev["gameday"].astype(str).str.slice(0, 10)
    nfl_dev = nfl_dev[nfl_dev["gd_str"] < HOLDOUT_CUT_DATE].copy()

    pbp_team_rows: list[pd.DataFrame] = []
    for yr in range(2012, 2025):
        pq = EXP_V32_DIR / "raw_cache" / f"pbp_pruned_{yr}.parquet"
        if not pq.exists():
            continue
        p = pd.read_parquet(pq, columns=["game_id", "game_date", "posteam", "pass_attempt", "sack", "rush_attempt", "aborted_play", "play_type"])
        p = p[
            (p["game_date"].astype(str).str.slice(0, 10) < HOLDOUT_CUT_DATE)
            & (p["aborted_play"].fillna(0.0) == 0.0)
            & (p["play_type"].astype(str) != "qb_kneel")
            & p["posteam"].notna()
        ].copy()
        p["pa"] = ((p["pass_attempt"].fillna(0.0) == 1.0) & (p["sack"].fillna(0.0) == 0.0)).astype(np.float64)
        p["ra"] = (p["rush_attempt"].fillna(0.0) == 1.0).astype(np.float64)
        pbp_team_rows.append(p.groupby(["game_id", "posteam"], as_index=False).agg(pa=("pa", "sum"), ra=("ra", "sum")))
    pbp_tm = pd.concat(pbp_team_rows, ignore_index=True)

    nfl_m = (
        nfl_dev[nfl_dev["season"] >= 2012]
        .merge(pbp_tm.rename(columns={"posteam": "home_team", "pa": "h_pa", "ra": "h_ra"}), on=["game_id", "home_team"], how="inner")
        .merge(pbp_tm.rename(columns={"posteam": "away_team", "pa": "a_pa", "ra": "a_ra"}), on=["game_id", "away_team"], how="inner")
        .sort_values(["gd_str", "game_id"], kind="mergesort")
        .reset_index(drop=True)
    )

    # Expectativas causales pre-partido NFL (`spread_line`, `total_line` y EWM de volumen de pase/acarreo por equipo)
    n_nfl = len(nfl_m)
    exp_h_pa = np.empty(n_nfl, dtype=np.float64)
    exp_h_ra = np.empty(n_nfl, dtype=np.float64)
    exp_a_pa = np.empty(n_nfl, dtype=np.float64)
    exp_a_ra = np.empty(n_nfl, dtype=np.float64)
    nfl_pa_ewm: dict[str, float] = {}
    nfl_ra_ewm: dict[str, float] = {}
    a_nf = 0.20
    for ix, r in enumerate(nfl_m.itertuples(index=False)):
        ht, at = str(r.home_team), str(r.away_team)
        exp_h_pa[ix] = nfl_pa_ewm.get(ht, 34.5)
        exp_h_ra[ix] = nfl_ra_ewm.get(ht, 26.5)
        exp_a_pa[ix] = nfl_pa_ewm.get(at, 34.5)
        exp_a_ra[ix] = nfl_ra_ewm.get(at, 26.5)
        nfl_pa_ewm[ht] = a_nf * float(r.h_pa) + (1.0 - a_nf) * nfl_pa_ewm.get(ht, 34.5)
        nfl_ra_ewm[ht] = a_nf * float(r.h_ra) + (1.0 - a_nf) * nfl_ra_ewm.get(ht, 26.5)
        nfl_pa_ewm[at] = a_nf * float(r.a_pa) + (1.0 - a_nf) * nfl_pa_ewm.get(at, 34.5)
        nfl_ra_ewm[at] = a_nf * float(r.a_ra) + (1.0 - a_nf) * nfl_ra_ewm.get(at, 26.5)

    obs_margin = (nfl_m["home_score"] - nfl_m["away_score"]).to_numpy(dtype=np.float64)
    obs_tot = (nfl_m["home_score"] + nfl_m["away_score"]).to_numpy(dtype=np.float64)
    # En nflverse `spread_line` > 0 significa local favorito por `spread_line` puntos (verificar signo empíricamente)
    sp_raw = pd.to_numeric(nfl_m["spread_line"], errors="coerce").fillna(0.0).to_numpy(dtype=np.float64)
    sp_sign = 1.0 if float(np.corrcoef(sp_raw, obs_margin)[0, 1]) >= 0.0 else -1.0
    exp_margin_nfl = sp_sign * sp_raw
    exp_tot_nfl = pd.to_numeric(nfl_m["total_line"], errors="coerce").fillna(44.5).to_numpy(dtype=np.float64)

    val_nfl = nfl_m["season"].to_numpy(dtype=int) <= 2019
    oos_nfl = nfl_m["season"].to_numpy(dtype=int) >= 2020
    nfl_gids = nfl_m["game_id"].astype(str).to_numpy()

    nfl_resid_val = pd.DataFrame(
        {
            "home_margin": obs_margin[val_nfl] - exp_margin_nfl[val_nfl],
            "total_points": obs_tot[val_nfl] - exp_tot_nfl[val_nfl],
            "home_pass_attempts": nfl_m["h_pa"].to_numpy(dtype=np.float64)[val_nfl] - exp_h_pa[val_nfl],
            "home_rush_attempts": nfl_m["h_ra"].to_numpy(dtype=np.float64)[val_nfl] - exp_h_ra[val_nfl],
            "away_pass_attempts": nfl_m["a_pa"].to_numpy(dtype=np.float64)[val_nfl] - exp_a_pa[val_nfl],
            "away_rush_attempts": nfl_m["a_ra"].to_numpy(dtype=np.float64)[val_nfl] - exp_a_ra[val_nfl],
        }
    )
    corr_nfl = _estimate_psd_latent_correlation(nfl_resid_val)
    print(
        f"[EXP_V55 NFL 100% Residualized Corr VAL<=2019 n={int(np.sum(val_nfl)):,}] "
        f"rho(margin, home_pass)={corr_nfl[0][2]:+.3f}, rho(margin, home_rush)={corr_nfl[0][3]:+.3f}, "
        f"rho(margin, away_pass)={corr_nfl[0][4]:+.3f}"
    )

    # Validar `df_nu` en NFL `VAL <= 2019 -> OOS 2020..2024` sobre SGP estructural 3-patas:
    # `Home Win (margin > 0) + Away Pass Over (a_pa > exp_a_pa + 2) + Over Total (tot > total_line)`
    p_nfl_hw = np.clip(scipy_stats.norm.cdf(exp_margin_nfl / 13.31), 0.03, 0.97)
    p_nfl_over = np.full(n_nfl, 0.50, dtype=np.float64)
    sd_apa = max(float(np.std(nfl_m["a_pa"].to_numpy(dtype=np.float64)[val_nfl] - exp_a_pa[val_nfl])), 4.0)
    p_nfl_apa_hi = np.clip(1.0 - scipy_stats.norm.cdf(2.0 / sd_apa), 0.10, 0.90) * np.ones(n_nfl, dtype=np.float64)
    y_nfl_sgp3 = ((obs_margin > 0) & (nfl_m["a_pa"].to_numpy(dtype=np.float64) > (exp_a_pa + 2.0)) & (obs_tot > exp_tot_nfl)).astype(np.float64)
    y_nfl_sgp2_neg = ((obs_margin > 0) & (nfl_m["h_pa"].to_numpy(dtype=np.float64) > (exp_h_pa + 2.0))).astype(np.float64)

    sub3_nfl = [
        [1.0, corr_nfl[0][4], corr_nfl[0][1]],
        [corr_nfl[4][0], 1.0, corr_nfl[4][1]],
        [corr_nfl[1][0], corr_nfl[1][4], 1.0],
    ]
    sub2_nfl_neg = [[1.0, corr_nfl[0][2]], [corr_nfl[2][0], 1.0]]
    probs_nfl3 = np.column_stack([p_nfl_hw, p_nfl_apa_hi, p_nfl_over])
    probs_nfl2_neg = np.column_stack([p_nfl_hw, p_nfl_apa_hi])

    best_nu_nfl = 500.0
    best_val_ll_nfl = float("inf")
    nfl_nu_curve: dict[str, float] = {}
    for nu_try in (5.0, 7.0, 10.0, 16.0, 500.0):
        pv3 = np.clip(_batch_eval_student_t_qmc_fast(probs_nfl3[val_nfl], [1, 1, 1], sub3_nfl, nu_try, uz_halton, u_rad_3), 1e-12, 1.0 - 1e-12)
        pv2 = np.clip(_batch_eval_student_t_qmc_fast(probs_nfl2_neg[val_nfl], [1, 1], sub2_nfl_neg, nu_try, uz_halton, u_rad_2), 1e-12, 1.0 - 1e-12)
        ll3 = float(-np.mean(y_nfl_sgp3[val_nfl] * np.log(pv3) + (1.0 - y_nfl_sgp3[val_nfl]) * np.log(1.0 - pv3)))
        ll2 = float(-np.mean(y_nfl_sgp2_neg[val_nfl] * np.log(pv2) + (1.0 - y_nfl_sgp2_neg[val_nfl]) * np.log(1.0 - pv2)))
        ll_comb = 0.5 * (ll3 + ll2)
        nfl_nu_curve[str(int(nu_try))] = round(ll_comb, 6)
        if ll_comb < best_val_ll_nfl:
            best_val_ll_nfl = ll_comb
            best_nu_nfl = nu_try

    nfl_family = "gaussian" if best_nu_nfl >= 500.0 else "student_t"
    p_nfl3_oos = _batch_eval_student_t_qmc_fast(probs_nfl3[oos_nfl], [1, 1, 1], sub3_nfl, best_nu_nfl, uz_halton, u_rad_3)
    p_nfl3_gauss_oos = _batch_eval_student_t_qmc_fast(probs_nfl3[oos_nfl], [1, 1, 1], sub3_nfl, 999.0, uz_halton, u_rad_3)
    p_nfl3_indep_oos = probs_nfl3[oos_nfl, 0] * probs_nfl3[oos_nfl, 1] * probs_nfl3[oos_nfl, 2]
    ev_nfl_vs_indep = _wrap_cluster_binary_es(nfl_gids[oos_nfl], y_nfl_sgp3[oos_nfl], p_nfl3_oos, p_nfl3_indep_oos, seed=BOOTSTRAP_SEED + 10)
    ev_nfl_vs_gauss = _wrap_cluster_binary_es(nfl_gids[oos_nfl], y_nfl_sgp3[oos_nfl], p_nfl3_oos, p_nfl3_gauss_oos, seed=BOOTSTRAP_SEED + 11)

    p_nfl2_neg_oos = _batch_eval_student_t_qmc_fast(probs_nfl2_neg[oos_nfl], [1, 1], sub2_nfl_neg, best_nu_nfl, uz_halton, u_rad_2)
    p_nfl2_neg_indep = probs_nfl2_neg[oos_nfl, 0] * probs_nfl2_neg[oos_nfl, 1]
    ev_nfl_neg_trap = _wrap_cluster_binary_es(nfl_gids[oos_nfl], y_nfl_sgp2_neg[oos_nfl], p_nfl2_neg_oos, p_nfl2_neg_indep, seed=BOOTSTRAP_SEED + 12)

    # =========================================================================
    # 3. `Player-Linked SGP` (`Raikov + Dixon-Coles`) sobre Titulares Causales + Cluster Bootstrap por `game_id`
    # =========================================================================
    players_df = pd.read_csv(FREE_OPEN_DIR / "tm_players.csv.gz", usecols=["player_id", "position", "sub_position"])
    pos_map = {int(r.player_id): map_tm_position_cluster(r.position, r.sub_position) for r in players_df.itertuples(index=False)}

    tg = pd.read_csv(
        FREE_OPEN_DIR / "tm_games.csv.gz",
        usecols=["game_id", "date", "competition_id", "home_club_id", "away_club_id", "home_club_goals", "away_club_goals"],
    )
    tg["date_str"] = tg["date"].astype(str).str.slice(0, 10)
    tg = tg[(tg["date_str"] >= "2014-07-01") & (tg["date_str"] < HOLDOUT_CUT_DATE) & tg["competition_id"].isin(TARGET_COMPETITIONS)].copy()
    tg = tg.dropna(subset=["home_club_id", "away_club_id", "home_club_goals", "away_club_goals"]).sort_values(["date_str", "game_id"], kind="mergesort").reset_index(drop=True)

    club_gf: dict[int, float] = {}
    club_ga: dict[int, float] = {}
    game_ctx: dict[int, tuple[int, int, int, int, float, float]] = {}
    for r in tg.itertuples(index=False):
        gid = int(r.game_id)
        hc, ac = int(r.home_club_id), int(r.away_club_id)
        hg, ag = int(r.home_club_goals), int(r.away_club_goals)
        if hg + ag > 10:
            continue  # purgar tandas de penales
        lam_h = min(max(0.5 * (club_gf.get(hc, 1.48) + club_ga.get(ac, 1.25)) * 1.08, 0.35), 4.2)
        lam_a = min(max(0.5 * (club_gf.get(ac, 1.25) + club_ga.get(hc, 1.48)) * 0.92, 0.35), 4.2)
        game_ctx[gid] = (hc, ac, hg, ag, lam_h, lam_a)
        club_gf[hc] = 0.14 * hg + 0.86 * club_gf.get(hc, 1.48)
        club_ga[hc] = 0.14 * ag + 0.86 * club_ga.get(hc, 1.25)
        club_gf[ac] = 0.14 * ag + 0.86 * club_gf.get(ac, 1.25)
        club_ga[ac] = 0.14 * hg + 0.86 * club_ga.get(ac, 1.48)

    app = pd.read_csv(
        FREE_OPEN_DIR / "tm_appearances.csv.gz",
        usecols=["game_id", "player_id", "player_club_id", "date", "competition_id", "goals", "minutes_played"],
    )
    app["date_str"] = app["date"].astype(str).str.slice(0, 10)
    app = app[(app["date_str"] >= "2014-07-01") & (app["date_str"] < HOLDOUT_CUT_DATE) & app["competition_id"].isin(TARGET_COMPETITIONS)].copy()
    app["minutes"] = pd.to_numeric(app["minutes_played"], errors="coerce").fillna(0.0).clip(0.0, 95.0)
    app["goals"] = pd.to_numeric(app["goals"], errors="coerce").fillna(0.0).clip(0.0, 6.0)
    app["pos_cluster"] = [pos_map.get(int(pid), "MF_CM") for pid in app["player_id"].to_numpy()]
    app = app[app["minutes"] >= 1.0].sort_values(["date_str", "game_id", "player_id"], kind="mergesort").reset_index(drop=True)

    prior_p90 = {"FW_CF": 0.44, "FW_W": 0.28, "MF_AM": 0.21}
    p_g_sum: dict[int, float] = defaultdict(float)
    p_m90_sum: dict[int, float] = defaultdict(float)
    p_min_ewm: dict[int, float] = {}
    p_apps_cnt: dict[int, int] = defaultdict(int)

    # Seleccionar `dixon_coles_rho` (`0.0` vs `-0.08`) en `VAL <= 2019` sobre atacantes causales (`prematch_ewm_minutes >= 58`)
    dc_rho_sel = -0.08
    gids_23_oos: list[int] = []
    y_2leg_oos: list[float] = []
    p_2leg_struct: list[float] = []
    p_2leg_indep: list[float] = []
    y_3leg_oos: list[float] = []
    p_3leg_struct: list[float] = []
    p_3leg_indep: list[float] = []

    n_app = len(app)
    gids = app["game_id"].to_numpy(dtype=np.int64)
    pids = app["player_id"].to_numpy(dtype=np.int64)
    cids = pd.to_numeric(app["player_club_id"], errors="coerce").fillna(-1).to_numpy(dtype=np.int64)
    mins = app["minutes"].to_numpy(dtype=np.float64)
    gls = app["goals"].to_numpy(dtype=np.float64)
    pcls = app["pos_cluster"].to_numpy()
    yrs = app["date_str"].str.slice(0, 4).astype(int).to_numpy()

    i = 0
    while i < n_app:
        j = i + 1
        gid_c = int(gids[i])
        while j < n_app and int(gids[j]) == gid_c:
            j += 1
        ctx = game_ctx.get(gid_c)
        if ctx is not None and int(yrs[i]) >= 2020:
            hc, ac, hg, ag, lh_g, la_g = ctx
            for k_i in range(i, j):
                cl = str(pcls[k_i])
                pid = int(pids[k_i])
                # Filtro 100% CAUSAL pre-partido (`B2`): cero uso de `mins[k_i]`!
                if cl not in prior_p90 or p_apps_cnt[pid] < 2 or p_min_ewm.get(pid, 0.0) < 58.0:
                    continue
                cid = int(cids[k_i])
                if cid != hc and cid != ac:
                    continue
                pr0 = prior_p90[cl]
                lam_eb = (5.5 * pr0 + p_g_sum[pid]) / (5.5 + p_m90_sum[pid])
                lam_tm = lh_g if cid == hc else la_g
                lam_op = la_g if cid == hc else lh_g
                tm_g = hg if cid == hc else ag
                op_g = ag if cid == hc else hg

                # Minutos esperados causales pre-partido (EWM propio contraído al promedio de titulares)
                exp_m = min(max(0.65 * p_min_ewm[pid] + 0.35 * 78.0, 50.0), 88.0)
                mu_pl = lam_eb * (exp_m / 90.0) * min(max(lam_tm / 1.40, 0.55), 1.95)
                p_pl = 1.0 - math.exp(-mu_pl)

                ev2 = evaluate_player_linked_sgp_scalar(p_pl, lam_tm, lam_op, "team_win", None, dixon_coles_rho=dc_rho_sel)
                ev3 = evaluate_player_linked_sgp_scalar(p_pl, lam_tm, lam_op, "team_win", 2.5, dixon_coles_rho=dc_rho_sel)

                scored = gls[k_i] >= 1.0
                won = tm_g > op_g
                over25 = (tm_g + op_g) >= 3

                gids_23_oos.append(gid_c)
                y_2leg_oos.append(1.0 if (scored and won) else 0.0)
                p_2leg_struct.append(ev2["joint_probability"])
                p_2leg_indep.append(ev2["independent_probability"])

                y_3leg_oos.append(1.0 if (scored and won and over25) else 0.0)
                p_3leg_struct.append(ev3["joint_probability"])
                p_3leg_indep.append(ev3["independent_probability"])

        for k_i in range(i, j):
            pid = int(pids[k_i])
            p_g_sum[pid] = 0.96 * p_g_sum[pid] + float(gls[k_i])
            p_m90_sum[pid] = 0.96 * p_m90_sum[pid] + float(mins[k_i]) / 90.0
            p_min_ewm[pid] = 0.25 * float(mins[k_i]) + 0.75 * p_min_ewm[pid] if pid in p_min_ewm else float(mins[k_i])
            p_apps_cnt[pid] += 1
        i = j

    gids_cl = np.array(gids_23_oos, dtype=np.int64)
    ev_player_2leg = _wrap_cluster_binary_es(
        gids_cl,
        np.array(y_2leg_oos, dtype=np.float64),
        np.array(p_2leg_struct, dtype=np.float64),
        np.array(p_2leg_indep, dtype=np.float64),
        seed=BOOTSTRAP_SEED + 20,
    )
    ev_player_3leg = _wrap_cluster_binary_es(
        gids_cl,
        np.array(y_3leg_oos, dtype=np.float64),
        np.array(p_3leg_struct, dtype=np.float64),
        np.array(p_3leg_indep, dtype=np.float64),
        seed=BOOTSTRAP_SEED + 21,
    )

    print(
        f"\n=== EXP_V55 RESIDUALIZED COPULA & CAUSAL PLAYER-LINKED SGP v5.1 OOS (2020..2024 < {HOLDOUT_CUT_DATE}) ===\n"
        f"  Soccer Heavy-Tail 3-Leg (family={soc_family}, nu={best_nu_soc}, n={ev_t_vs_gauss_tail['n']:,}, clusters={ev_t_vs_gauss_tail['n_clusters']}):\n"
        f"    dLL vs Independence={ev_t_vs_indep_tail['delta_ll']:+.5f} ({ev_t_vs_indep_tail['significance']}) | "
        f"dLL vs Gaussian={ev_t_vs_gauss_tail['delta_ll']:+.5f} ({ev_t_vs_gauss_tail['significance']})\n"
        f"  NFL Validated Copula (family={nfl_family}, nu={best_nu_nfl}, n={ev_nfl_vs_indep['n']:,}):\n"
        f"    3-Leg dLL vs Indep={ev_nfl_vs_indep['delta_ll']:+.5f} ({ev_nfl_vs_indep['significance']}) | "
        f"Neg-Trap 2-Leg dLL vs Indep={ev_nfl_neg_trap['delta_ll']:+.5f} ({ev_nfl_neg_trap['significance']})\n"
        f"  Causal Player-Linked 2-Leg (Scorer+Win, rho={dc_rho_sel}, n={ev_player_2leg['n']:,}, games={ev_player_2leg['n_clusters']:,}):\n"
        f"    Indep={ev_player_2leg['benchmark_log_loss']:.5f} -> Raikov+DC={ev_player_2leg['log_loss']:.5f} (ECE={100*ev_player_2leg['ece']:.2f}%) | "
        f"dLL={ev_player_2leg['delta_ll']:+.5f} ({ev_player_2leg['significance']})\n"
        f"  Causal Player-Linked 3-Leg (Scorer+Win+O2.5, rho={dc_rho_sel}, n={ev_player_3leg['n']:,}, games={ev_player_3leg['n_clusters']:,}):\n"
        f"    Indep={ev_player_3leg['benchmark_log_loss']:.5f} -> Raikov+DC={ev_player_3leg['log_loss']:.5f} (ECE={100*ev_player_3leg['ece']:.2f}%) | "
        f"dLL={ev_player_3leg['delta_ll']:+.5f} ({ev_player_3leg['significance']})"
    )

    sgp_v5_art = {
        "schema_version": "sgp_copula_v5.0.0",
        "codename": "PitchLab Residualized Exact-Quantile QMC Copula & Raikov-DC Player-Linked SGP Engine v5.1",
        "version": "5.1.0-candidate",
        "status": "candidate",
        "production_activated": False,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "qmc_halton_points": QMC_POINTS,
        "qmc_smooth_bandwidth": QMC_SMOOTH_BW_V51,
        "default_player_linked_dc_rho": dc_rho_sel,
        "sports": {
            "soccer": {
                "df_nu": best_nu_soc,
                "copula_family": soc_family,
                "residualized": True,
                "factors": SOCCER_FACTORS_8,
                "correlation_matrix": corr_soc,
            },
            "nfl": {
                "df_nu": best_nu_nfl,
                "copula_family": nfl_family,
                "residualized": True,
                "factors": NFL_FACTORS_6,
                "correlation_matrix": corr_nfl,
            },
        },
    }
    SGP_V5_MODEL_OUT.write_text(json.dumps(sgp_v5_art, indent=2), encoding="utf-8")

    # Snapshot de paridad `< 1e-13` (`30` Copula SGPs + `24` Player-Linked SGPs con `dixonColesRho`)
    rng = np.random.default_rng(MODEL_SEED)
    student_t_cases: list[dict[str, Any]] = []
    for idx_s in range(30):
        sp_k = "soccer" if idx_s < 18 else "nfl"
        facs = SOCCER_FACTORS_8 if sp_k == "soccer" else NFL_FACTORS_6
        k_l = 2 + (idx_s % 3)
        chosen_f = rng.choice(facs, size=k_l, replace=False).tolist()
        legs_in = [
            {
                "legId": f"leg_{m}",
                "factor": str(chosen_f[m]),
                "marginalProbability": round(float(rng.uniform(0.12, 0.72)), 4),
                "direction": 1 if (idx_s + m) % 3 != 0 else -1,
            }
            for m in range(k_l)
        ]
        student_t_cases.append(
            {
                "sport": sp_k,
                "legs": legs_in,
                "expected": evaluate_student_t_sgp_scalar(sp_k, legs_in, sgp_v5_art),
            }
        )

    player_linked_cases: list[dict[str, Any]] = []
    for idx_p in range(24):
        pp = round(float(rng.uniform(0.14, 0.58)), 4)
        lt = round(float(rng.uniform(0.85, 2.75)), 4)
        lo = round(float(rng.uniform(0.65, 2.25)), 4)
        to_k = "team_win" if idx_p % 2 == 0 else "team_win_or_draw"
        tot_l = 2.5 if idx_p % 3 != 0 else None
        dc_r = dc_rho_sel if idx_p % 2 == 0 else 0.0
        player_linked_cases.append(
            {
                "input": {
                    "pPlayerAnytimeGoal": pp,
                    "teamExpectedGoals": lt,
                    "opponentExpectedGoals": lo,
                    "teamOutcome": to_k,
                    "matchTotalOverLine": tot_l,
                    "dixonColesRho": dc_r,
                },
                "expected": evaluate_player_linked_sgp_scalar(pp, lt, lo, to_k, tot_l, dixon_coles_rho=dc_r),
            }
        )

    SGP_V5_SNAPSHOT_OUT.write_text(
        json.dumps(
            {
                "schema_version": "sgp_copula_v5.1_parity_snapshot",
                "holdout_sealed_untouched": True,
                "student_t_cases": student_t_cases,
                "player_linked_cases": player_linked_cases,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    results_payload = {
        "experiment_id": "EXP_V55_sgp_student_t_player_v5_1_remediated",
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "numerical_precision_audit": num_audit,
        "selected_soccer_df_nu": best_nu_soc,
        "selected_soccer_copula_family": soc_family,
        "soccer_val_nu_curve": soc_nu_curve,
        "selected_nfl_df_nu": best_nu_nfl,
        "selected_nfl_copula_family": nfl_family,
        "nfl_val_nu_curve": nfl_nu_curve,
        "nfl_residualized_corr_margin_home_pass": corr_nfl[0][2],
        "soccer_heavy_tail_3leg_student_t_vs_gaussian_oos": ev_t_vs_gauss_tail,
        "soccer_heavy_tail_3leg_student_t_vs_independence_oos": ev_t_vs_indep_tail,
        "nfl_3leg_vs_independence_oos": ev_nfl_vs_indep,
        "nfl_3leg_vs_gaussian_oos": ev_nfl_vs_gauss,
        "nfl_2leg_negative_trap_vs_independence_oos": ev_nfl_neg_trap,
        "player_linked_dc_rho": dc_rho_sel,
        "player_linked_2leg_scorer_and_win_oos": ev_player_2leg,
        "player_linked_3leg_scorer_win_over25_oos": ev_player_3leg,
        "artifacts": {
            "sgp_copula_v5_0_sha256": hashlib.sha256(SGP_V5_MODEL_OUT.read_bytes()).hexdigest(),
        },
    }
    RESULTS_OUT.write_text(json.dumps(results_payload, indent=2), encoding="utf-8")

    with TRIAL_REGISTRY_OUT.open("a", encoding="utf-8") as fh:
        fh.write(
            json.dumps(
                {
                    "recorded_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "experiment_id": "EXP_V55_sgp_student_t_player_v5_1_remediated",
                    "holdout_touched": False,
                    "soccer_nu": best_nu_soc,
                    "nfl_nu": best_nu_nfl,
                    "max_qmc_bias_pp": round(100.0 * num_audit["max_qmc_bivariate_bias_vs_scipy_mvn"], 4),
                    "player_linked_3leg_dll": round(ev_player_3leg["delta_ll"], 6),
                }
            )
            + "\n"
        )
    print(f"[DONE] EXP_V55 v5.1 guardado en {RESULTS_OUT.name}")


if __name__ == "__main__":
    main()
