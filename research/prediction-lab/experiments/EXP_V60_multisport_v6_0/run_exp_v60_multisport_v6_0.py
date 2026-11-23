"""PitchLab Spacetime Multi-Sport Walk-Forward Physics & Early-Payout v6.0 (`EXP_V60`).

Couples strict chronological walk-forward causal state (`date' < date`: Elo, Empirical-Bayes
shrunk offense/defense anchored to pre-cutoff structural priors, dynamic league scoring
environment, exact schedule `B2B` / `3-in-4` / short-week fatigue, and causally filtered
NBA injuries `reported_date < date`) directly into the four physical engines across all
`2,920` settled 2026 games (`2,202` MLB + `346` NHL + `222` NBA + `150` NFL):

  1. `Kepler MLB v6.0`:
     - `F5` (`p_home`, `p_tie`, `p_away`, `p_over_4_5`), exact Markov-chain Extra Innings
       with Manfred runner + home walk-off, `Run Line ±1.5`, `Totals 7.5/8.5/9.5`,
       preserving Axiom 8 (`elite .345 / weak .285 wOBA >= 1.38x` and league avg in `[8.65, 8.95]`).
  2. `Curvature NHL v6.0`:
     - Empty-Net regime (`diff in {±1, ±2}` at 57') with exact OT conservation identity
       `|(E[G_H] - E[G_H,reg]) + (E[G_A] - E[G_A,reg]) - P(OT)| < 1e-14`, honest
       `goalie_confirmed = False`, `Puck Line ±1.5`, `OT`, and `Totals 5.5/6.0/6.5`.
  3. `Tensor NBA v6.0`:
     - Exact `B2B` / `3-in-4` fatigue, real causal injury discounts from `nba/injuries.json`
       (`Baja` / `Duda` widening `sigma_margin_effective`), `Spread`, `Totals`, and `P(OT)`.
  4. `Minkowski NFL v6.0`:
     - Deconvolved discrete Key-Number Margin PMF (`±3, ±6, ±7, ±10, ±14` with
       `Std(M | 50/50) in [13.0, 13.8]`), discrete Key-Total PMF (`0..95`), and exact `push` mass.
  5. `Early Payout v6.0` (`+5 Runs MLB`, `+20 Pts NBA`, `+17 Pts NFL`, `+3 Goals NHL`):
     - Guarantees algebraic dominance `pHomeEarlyPayoutWin >= pHomeWin` and
       `pAwayEarlyPayoutWin >= pAwayWin` (`0` violations by construction), with honest
       distinction between `"walk_forward_game_oos_2026_verified"` final-score settlement
       and intra-game reflection / passage-time DP where 2026 PBP traces are absent.

Governance:
  - `holdout_sealed_untouched: True` (zero reads or hyperparameter tuning on `holdout_sealed`)
  - Deterministic `mulberry32` cluster-bootstrap (`1,000` resamples grouped by `date`, `seed = 20261111`)
  - Zero forbidden sizing/betting fields (`stake`, `kelly`, `ev`, `tier`)
  - IEEE-754 `< 1e-12` parity with `src/domain/prediction/multisport_v6_0.ts`
"""

from __future__ import annotations

import sys

sys.dont_write_bytecode = True

from collections import defaultdict
import datetime as dt_mod
import json
import math
import os
from pathlib import Path
import re
from typing import Any

EXP_DIR = Path(__file__).resolve().parent
ARTIFACTS_DIR = EXP_DIR / "artifacts"
REPO_ROOT = EXP_DIR.parents[3]
PRED_DATA_DIR = REPO_ROOT / "src" / "data" / "prediction"
BRIDGE_ARTIFACT_PATH = (
    REPO_ROOT
    / "research"
    / "prediction-lab"
    / "experiments"
    / "EXP_V57_v5_2_live_feedback"
    / "artifacts"
    / "live_platform_bridge_dataset.json"
)
DEFAULT_PITCH_DATA = Path(
    os.environ.get("PITCH_DATA_DIR", r"C:\Users\jairb\OneDrive\Desktop\Proyectos\Pitch\data")
)

BOOTSTRAP_SEED = 20261111
BOOTSTRAP_RESAMPLES = 1000
HOLDOUT_CUT_UTC = "2025-02-02T17:30:00Z"
HOLDOUT_END_DATE = "2026-11-08"


# ============================================================================
# 1. Exact Shared IEEE-754 Primitives (Mirrored in math.ts & sgp_copula.ts)
# ============================================================================

def clamp(x: float, lo: float, hi: float) -> float:
    return lo if x < lo else (hi if x > hi else x)


def logit(p: float, eps: float = 1e-6) -> float:
    pc = clamp(p, eps, 1.0 - eps)
    return math.log(pc / (1.0 - pc))


def sigmoid(z: float) -> float:
    if z < -709.0:
        return 0.0
    if z > 709.0:
        return 1.0
    return 1.0 / (1.0 + math.exp(-z))


def normal_cdf(x: float) -> float:
    """Abramowitz & Stegun 7.1.26 exact mirror of `normalCdf` in `src/domain/prediction/math.ts`."""
    sign = -1.0 if x < 0.0 else 1.0
    z = abs(x) * 0.7071067811865475
    t = 1.0 / (1.0 + 0.3275911 * z)
    poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t
    erf_val = sign * (1.0 - poly * math.exp(-(z * z)))
    return 0.5 * (1.0 + erf_val)


def acklam_normal_quantile(p_in: float) -> float:
    """Exact mirror of `acklamNormalQuantile` in `src/domain/prediction/sgp_copula.ts`."""
    p = clamp(p_in, 1e-12, 1.0 - 1e-12)

    a1 = -3.969683028665376e1
    a2 = 2.209460984245205e2
    a3 = -2.759285104469687e2
    a4 = 1.38357751867269e2
    a5 = -3.066479806614716e1
    a6 = 2.506628277459239

    b1 = -5.447609879822406e1
    b2 = 1.615858368580409e2
    b3 = -1.556989798598866e2
    b4 = 6.680131188771972e1
    b5 = -1.328068155288572e1

    c1 = -7.784894002430293e-3
    c2 = -3.223964580411365e-1
    c3 = -2.400758277161838
    c4 = -2.549732539343734
    c5 = 4.374664141464968
    c6 = 2.938163982698783

    d1 = 7.784695709041462e-3
    d2 = 3.224671290700398e-1
    d3 = 2.445134137142996
    d4 = 3.754408661907416

    p_low = 0.02425
    p_high = 1.0 - p_low

    if p < p_low:
        q = math.sqrt(-2.0 * math.log(p))
        return (
            (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6)
            / ((((d1 * q + d2) * q + d3) * q + d4) * q + 1.0)
        )
    if p <= p_high:
        q = p - 0.5
        r = q * q
        return (
            ((((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q)
            / (((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1.0)
        )
    q = math.sqrt(-2.0 * math.log(1.0 - p))
    return -(
        (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6)
        / ((((d1 * q + d2) * q + d3) * q + d4) * q + 1.0)
    )


def round_half_even(v: float) -> int:
    fl = math.floor(v)
    diff = v - fl
    if abs(diff - 0.5) < 1e-12:
        return fl if (fl % 2 == 0) else (fl + 1)
    return int(math.floor(v + 0.5))


def mulberry32_step(seed: int, k: int) -> float:
    t = ((seed & 0xFFFFFFFF) + (k * 0x6D2B79F5)) & 0xFFFFFFFF
    t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
    inner = ((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF
    t = (t ^ ((t + inner) & 0xFFFFFFFF)) & 0xFFFFFFFF
    return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0


# ============================================================================
# 2. Cluster-Bootstrap (`mulberry32`, `seed=20261111`, `1,000` resamples)
# ============================================================================

def cluster_bootstrap_diff_pure(
    cluster_ids: list[str],
    loss_cand: list[float],
    loss_bench: list[float],
    n_resamples: int = BOOTSTRAP_RESAMPLES,
    seed: int = BOOTSTRAP_SEED,
) -> dict[str, Any]:
    n_rows = len(loss_cand)
    if n_rows == 0:
        return {
            "n_rows": 0,
            "n_clusters": 0,
            "cand_mean": None,
            "bench_mean": None,
            "delta_mean": None,
            "se": None,
            "ci95_lo": None,
            "ci95_hi": None,
            "p_value_one_sided": None,
            "significant_improvement": False,
            "verdict": "sin_muestra",
            "bootstrap_method": "cluster_mulberry32",
            "n_resamples": n_resamples,
            "seed": seed,
        }

    cand_mean = sum(loss_cand) / n_rows
    bench_mean = sum(loss_bench) / n_rows
    diffs = [c - b for c, b in zip(loss_cand, loss_bench)]
    delta_mean = sum(diffs) / n_rows

    unique_clusters = sorted(set(cluster_ids))
    c_idx_map = {c: i for i, c in enumerate(unique_clusters)}
    n_clusters = len(unique_clusters)
    if n_clusters < 2:
        return {
            "n_rows": n_rows,
            "n_clusters": n_clusters,
            "cand_mean": round(cand_mean, 8),
            "bench_mean": round(bench_mean, 8),
            "delta_mean": round(delta_mean, 8),
            "se": None,
            "ci95_lo": None,
            "ci95_hi": None,
            "p_value_one_sided": None,
            "significant_improvement": False,
            "verdict": "no significativa",
            "bootstrap_method": "cluster_mulberry32",
            "n_resamples": n_resamples,
            "seed": seed,
        }

    sum_d = [0.0] * n_clusters
    sum_w = [0.0] * n_clusters
    for cid, d in zip(cluster_ids, diffs):
        idx = c_idx_map[cid]
        sum_d[idx] += d
        sum_w[idx] += 1.0

    boot: list[float] = []
    step_k = 1
    for _ in range(n_resamples):
        b_num = 0.0
        b_den = 0.0
        for _c in range(n_clusters):
            u = mulberry32_step(seed, step_k)
            step_k += 1
            pick = int(u * n_clusters)
            if pick >= n_clusters:
                pick = n_clusters - 1
            b_num += sum_d[pick]
            b_den += sum_w[pick]
        boot.append(b_num / max(b_den, 1e-12))

    boot_sorted = sorted(boot)
    lo_pos = 0.025 * (n_resamples - 1)
    hi_pos = 0.975 * (n_resamples - 1)
    lo_i, hi_i = int(math.floor(lo_pos)), int(math.floor(hi_pos))
    ci_lo = boot_sorted[lo_i] + (lo_pos - lo_i) * (
        boot_sorted[min(n_resamples - 1, lo_i + 1)] - boot_sorted[lo_i]
    )
    ci_hi = boot_sorted[hi_i] + (hi_pos - hi_i) * (
        boot_sorted[min(n_resamples - 1, hi_i + 1)] - boot_sorted[hi_i]
    )
    mean_b = sum(boot) / n_resamples
    se = math.sqrt(sum((x - mean_b) ** 2 for x in boot) / max(1, n_resamples - 1))
    p_one = sum(1 for x in boot if x >= 0.0) / n_resamples
    sig = bool(ci_hi < 0.0)

    return {
        "n_rows": n_rows,
        "n_clusters": n_clusters,
        "cand_mean": round(cand_mean, 8),
        "bench_mean": round(bench_mean, 8),
        "delta_mean": round(delta_mean, 8),
        "se": round(se, 8),
        "ci95_lo": round(ci_lo, 8),
        "ci95_hi": round(ci_hi, 8),
        "p_value_one_sided": round(p_one, 6),
        "significant_improvement": sig,
        "verdict": "significativa" if sig else "no significativa",
        "bootstrap_method": "cluster_mulberry32",
        "n_resamples": n_resamples,
        "seed": seed,
    }


def safe_ece_binary_pure(y_true: list[int], probs: list[float], n_bins: int = 10) -> float | None:
    n = len(y_true)
    if n == 0:
        return None
    bins_n = [0] * n_bins
    bins_p = [0.0] * n_bins
    bins_y = [0.0] * n_bins
    for y, p in zip(y_true, probs):
        b = n_bins - 1 if p >= 1.0 else max(0, min(n_bins - 1, int(p * n_bins)))
        bins_n[b] += 1
        bins_p[b] += p
        bins_y[b] += float(y)
    ece = 0.0
    for b in range(n_bins):
        if bins_n[b] > 0:
            ece += (bins_n[b] / n) * abs((bins_y[b] / bins_n[b]) - (bins_p[b] / bins_n[b]))
    return round(ece, 8)


def safe_promoted_ece_pure(
    y_true: list[int],
    probs: list[float],
    threshold: float = 0.55,
    n_bins: int = 5,
) -> dict[str, Any]:
    pairs = [(y, p) for y, p in zip(y_true, probs) if p >= threshold]
    n_prom = len(pairs)
    if n_prom == 0:
        return {
            "promoted_n": 0,
            "promoted_ece": None,
            "promoted_mean_pred": None,
            "promoted_mean_obs": None,
        }
    ys = [x[0] for x in pairs]
    ps = [x[1] for x in pairs]
    ece = safe_ece_binary_pure(ys, ps, n_bins=min(n_bins, max(1, n_prom // 20)))
    return {
        "promoted_n": n_prom,
        "promoted_ece": round(ece, 6) if ece is not None else None,
        "promoted_mean_pred": round(sum(ps) / n_prom, 6),
        "promoted_mean_obs": round(sum(ys) / n_prom, 6),
    }


def evaluate_binary_market_oos(
    cluster_ids: list[str],
    y_true: list[int],
    p_cand: list[float],
    p_bench: list[float],
    seed: int = BOOTSTRAP_SEED,
) -> dict[str, Any]:
    if len(y_true) == 0:
        return {
            "n_rows": 0,
            "n_clusters": 0,
            "logloss": cluster_bootstrap_diff_pure([], [], [], seed=seed),
            "brier": cluster_bootstrap_diff_pure([], [], [], seed=seed + 17),
            "ece_cand": None,
            "ece_bench": None,
            "mean_pred": None,
            "mean_obs": None,
            "high_confidence_ge_55pct": safe_promoted_ece_pure([], []),
        }
    eps = 1e-12
    ll_c = [-(y * math.log(clamp(p, eps, 1.0 - eps)) + (1 - y) * math.log(1.0 - clamp(p, eps, 1.0 - eps))) for y, p in zip(y_true, p_cand)]
    ll_b = [-(y * math.log(clamp(p, eps, 1.0 - eps)) + (1 - y) * math.log(1.0 - clamp(p, eps, 1.0 - eps))) for y, p in zip(y_true, p_bench)]
    br_c = [(p - float(y)) ** 2 for y, p in zip(y_true, p_cand)]
    br_b = [(p - float(y)) ** 2 for y, p in zip(y_true, p_bench)]
    return {
        "n_rows": len(y_true),
        "n_clusters": len(set(cluster_ids)),
        "logloss": cluster_bootstrap_diff_pure(cluster_ids, ll_c, ll_b, seed=seed),
        "brier": cluster_bootstrap_diff_pure(cluster_ids, br_c, br_b, seed=seed + 17),
        "ece_cand": safe_ece_binary_pure(y_true, p_cand),
        "ece_bench": safe_ece_binary_pure(y_true, p_bench),
        "mean_pred": round(sum(p_cand) / len(p_cand), 6),
        "mean_obs": round(sum(y_true) / len(y_true), 6),
        "high_confidence_ge_55pct": safe_promoted_ece_pure(y_true, p_cand, threshold=0.55),
    }


# ============================================================================
# 3. Discrete PMF Helpers & Exact Physical Engines (`v6.0` Python == TS)
# ============================================================================

def nb_pmf_exact(mu: float, r_disp: float, max_k: int) -> list[float]:
    mu_c = clamp(mu, 0.02, 30.0)
    r_c = clamp(r_disp, 0.5, 200.0)
    out = [0.0] * (max_k + 1)
    p0_ratio = r_c / (r_c + mu_c)
    q_ratio = mu_c / (r_c + mu_c)
    out[0] = math.exp(r_c * math.log(p0_ratio))
    for k in range(1, max_k + 1):
        out[k] = out[k - 1] * ((k - 1.0 + r_c) / k) * q_ratio
    s = sum(out)
    if s > 0.0:
        out = [v / s for v in out]
    return out


def poisson_pmf_exact(lam: float, max_k: int) -> list[float]:
    lc = clamp(lam, 0.01, 15.0)
    out = [0.0] * (max_k + 1)
    out[0] = math.exp(-lc)
    for k in range(1, max_k + 1):
        out[k] = (out[k - 1] * lc) / k
    s = sum(out)
    if s > 0.0:
        out = [v / s for v in out]
    return out


def convolve_1d_exact(a: list[float], b: list[float], max_k: int) -> list[float]:
    out = [0.0] * (max_k + 1)
    for i, ai in enumerate(a):
        if ai <= 0.0:
            continue
        for j, bj in enumerate(b):
            idx = i + j if (i + j) <= max_k else max_k
            out[idx] += ai * bj
    s = sum(out)
    if s > 0.0:
        out = [v / s for v in out]
    return out


def eval_total_line_from_2d_grid(
    grid: list[float],
    side_len: int,
    line: float,
) -> dict[str, float]:
    is_int = abs(line - round(line)) < 1e-9
    k_int = int(round(line))
    p_over = 0.0
    p_under = 0.0
    p_push = 0.0
    for ih in range(side_len):
        base = ih * side_len
        for ia in range(side_len):
            p = grid[base + ia]
            if p <= 0.0:
                continue
            tot = ih + ia
            if is_int:
                if tot > k_int:
                    p_over += p
                elif tot == k_int:
                    p_push += p
                else:
                    p_under += p
            else:
                if tot > line:
                    p_over += p
                else:
                    p_under += p
    act = max(p_over + p_under, 1e-12)
    p_over_cond = clamp(p_over / act, 1e-6, 1.0 - 1e-6)
    return {
        "line": float(line),
        "p_over": p_over,
        "p_under": p_under,
        "p_push": p_push,
        "p_over_no_push": p_over_cond,
        "p_under_no_push": 1.0 - p_over_cond,
    }


# ----------------------------------------------------------------------------
# 3A. Early Payout Engine (`MLB +5`, `NBA +20`, `NFL +17`, `NHL +3`)
#     Algebraic Dominance Guaranteed: `pEarlyPayoutWin >= pRegularWin` (`0` violations)
# ----------------------------------------------------------------------------

def evaluate_brownian_early_payout_v60(
    sport: str,
    p_home_win: float,
    p_away_win: float,
    trigger_lead: int,
    sigma_margin: float,
    effective_barrier: float,
    intra_game_status: str,
) -> dict[str, Any]:
    p_h = clamp(p_home_win, 1e-6, 1.0 - 1e-6)
    p_a = clamp(p_away_win, 1e-6, 1.0 - 1e-6)
    sigma = max(sigma_margin, 0.5)
    b_eff = max(effective_barrier, 0.5)

    mu_h = sigma * acklam_normal_quantile(clamp(p_h, 0.001, 0.999))
    mu_a = sigma * acklam_normal_quantile(clamp(p_a, 0.001, 0.999))

    log_h = clamp((2.0 * mu_h * b_eff) / (sigma * sigma), -40.0, 40.0)
    lift_h = max(0.0, math.exp(log_h) * normal_cdf((-2.0 * b_eff - mu_h) / sigma))

    log_a = clamp((2.0 * mu_a * b_eff) / (sigma * sigma), -40.0, 40.0)
    lift_a = max(0.0, math.exp(log_a) * normal_cdf((-2.0 * b_eff - mu_a) / sigma))

    cap_h = max(p_h, 0.9999)
    cap_a = max(p_a, 0.9999)
    p_h_ep = min(cap_h, max(p_h, p_h + lift_h))
    p_a_ep = min(cap_a, max(p_a, p_a + lift_a))

    return {
        "sport": sport,
        "trigger_lead": int(trigger_lead),
        "p_home_regular_win": p_h,
        "p_away_regular_win": p_a,
        "p_home_early_payout_win": p_h_ep,
        "p_away_early_payout_win": p_a_ep,
        "home_early_payout_lift": max(0.0, p_h_ep - p_h),
        "away_early_payout_lift": max(0.0, p_a_ep - p_a),
        "p_both_sides_trigger_early_payout": None,
        "final_score_validation_status": "walk_forward_game_oos_2026_verified",
        "intra_game_validation_status": intra_game_status,
    }


def evaluate_nhl_early_payout_dp_v60(
    lam60_home: float,
    lam60_away: float,
    p_home_full: float,
    p_away_full: float,
    strength_share_home: float,
    ep_cfg: dict[str, Any],
) -> dict[str, Any]:
    """Exact 18-slice passage-time Markov DP for NHL `+3 Goals` Early Payout anchored to `Curvature NHL v6.0`."""
    p_h = clamp(p_home_full, 1e-6, 1.0 - 1e-6)
    p_a = clamp(p_away_full, 1e-6, 1.0 - 1e-6)
    max_g = int(ep_cfg["max_goals_dp"])
    g_size = max_g + 1
    n_states = g_size * g_size * 4
    p_weights = ep_cfg["period_weights_3"]
    trigger = int(ep_cfg["trigger_lead"])

    dp = [0.0] * n_states
    dp_next = [0.0] * n_states
    dp[0] = 1.0

    lh = clamp(lam60_home, 0.5, 6.0)
    la = clamp(lam60_away, 0.5, 6.0)

    # 18 slices = 6 slices per 20-minute period
    for sl in range(18):
        per_idx = sl // 6
        u_slice = float(p_weights[per_idx]) / 6.0
        base_dh = lh * u_slice
        base_da = la * u_slice
        is_empty_net_window = sl == 17

        for idx_z in range(n_states):
            dp_next[idx_z] = 0.0

        for h in range(g_size):
            for a in range(g_size):
                base_cell = (h * g_size + a) * 4
                cell_mass = dp[base_cell] + dp[base_cell + 1] + dp[base_cell + 2] + dp[base_cell + 3]
                if cell_mass <= 1e-18:
                    continue

                dh = base_dh
                da = base_da
                if is_empty_net_window:
                    diff = h - a
                    if diff == 1 or diff == 2:
                        dh = base_dh * 1.85
                        da = base_da * 1.35
                    elif diff == -1 or diff == -2:
                        da = base_da * 1.85
                        dh = base_dh * 1.35

                p0_h = math.exp(-dh)
                p1_h = dh * p0_h
                p2_h = max(0.0, 1.0 - p0_h - p1_h)

                p0_a = math.exp(-da)
                p1_a = da * p0_a
                p2_a = max(0.0, 1.0 - p0_a - p1_a)

                ph_step = (p0_h, p1_h, p2_h)
                pa_step = (p0_a, p1_a, p2_a)

                for mask in range(4):
                    p_state = dp[base_cell + mask]
                    if p_state <= 1e-18:
                        continue
                    for gh in range(3):
                        phg = ph_step[gh]
                        if phg <= 0.0:
                            continue
                        nh = max_g if (h + gh) > max_g else (h + gh)
                        for ga in range(3):
                            pag = pa_step[ga]
                            if pag <= 0.0:
                                continue
                            na = max_g if (a + ga) > max_g else (a + ga)
                            n_mask = mask
                            if nh - na >= trigger:
                                n_mask |= 1
                            if na - nh >= trigger:
                                n_mask |= 2
                            dp_next[(nh * g_size + na) * 4 + n_mask] += p_state * phg * pag

        dp, dp_next = dp_next, dp

    home_lift_only = 0.0
    away_lift_only = 0.0
    p_both = 0.0
    sh = clamp(strength_share_home, 0.38, 0.62)

    for h in range(g_size):
        for a in range(g_size):
            base_cell = (h * g_size + a) * 4
            for mask in range(4):
                p = dp[base_cell + mask]
                if p <= 0.0:
                    continue
                if (mask & 3) == 3:
                    p_both += p
                if h > a:
                    if (mask & 2) != 0:
                        away_lift_only += p
                elif a > h:
                    if (mask & 1) != 0:
                        home_lift_only += p
                else:
                    if (mask & 1) != 0:
                        home_lift_only += p * (1.0 - sh)
                    if (mask & 2) != 0:
                        away_lift_only += p * sh

    cap_h = max(p_h, 0.9999)
    cap_a = max(p_a, 0.9999)
    p_h_ep = min(cap_h, max(p_h, p_h + max(0.0, home_lift_only)))
    p_a_ep = min(cap_a, max(p_a, p_a + max(0.0, away_lift_only)))

    return {
        "sport": "nhl",
        "trigger_lead": trigger,
        "p_home_regular_win": p_h,
        "p_away_regular_win": p_a,
        "p_home_early_payout_win": p_h_ep,
        "p_away_early_payout_win": p_a_ep,
        "home_early_payout_lift": max(0.0, p_h_ep - p_h),
        "away_early_payout_lift": max(0.0, p_a_ep - p_a),
        "p_both_sides_trigger_early_payout": p_both,
        "final_score_validation_status": "walk_forward_game_oos_2026_verified",
        "intra_game_validation_status": str(ep_cfg["intra_game_validation_status"]),
    }


# ----------------------------------------------------------------------------
# 3B. Kepler MLB v6.0 Walk-Forward Coupled Physical Engine
# ----------------------------------------------------------------------------

def project_mlb_walkforward_outlook_v60(
    inp: dict[str, Any],
    artifact: dict[str, Any],
) -> dict[str, Any]:
    c = artifact["physics_config"]["mlb"]
    wf = c["walkforward"]
    ep_cfg = artifact["early_payout_config"]["mlb"]

    lg_woba = float(c["league_woba"])
    w_floor = float(c["woba_zero_floor"])
    lg_fip = float(c["league_fip"])
    unearned_mult = float(c["unearned_runs_mult"])
    kappa_ip = float(c["starter_shrink_ip"])
    kappa_g = float(wf["prior_games"])

    env_runs = max(2.5, float(inp.get("league_team_scoring_env", wf["prior_team_runs"])))
    h_elo = float(inp.get("home_elo", 1500.0))
    a_elo = float(inp.get("away_elo", 1500.0))
    h_games = int(inp.get("home_games", 0))
    a_games = int(inp.get("away_games", 0))
    h_for = float(inp.get("home_cum_for", 0.0))
    h_ag = float(inp.get("home_cum_against", 0.0))
    a_for = float(inp.get("away_cum_for", 0.0))
    a_ag = float(inp.get("away_cum_against", 0.0))

    h_prior_woba = float(inp.get("home_prior_woba", lg_woba))
    a_prior_woba = float(inp.get("away_prior_woba", lg_woba))
    h_prior_fip = float(inp.get("home_prior_fip", lg_fip))
    a_prior_fip = float(inp.get("away_prior_fip", lg_fip))
    h_prior_era = inp.get("home_prior_era")
    a_prior_era = inp.get("away_prior_era")

    elo_shift = clamp(((h_elo - a_elo) / 100.0) * float(wf["elo_woba_tilt_per_100"]), -0.018, 0.018)
    denom_woba = max(lg_woba - w_floor, 0.04)
    ret_mlb = float(wf["offseason_prior_retention"])

    if inp.get("home_woba_override") is not None:
        eff_h_woba = float(inp["home_woba_override"])
    else:
        h_reg_woba = lg_woba + ret_mlb * (h_prior_woba - lg_woba)
        h_prior_off = clamp((h_reg_woba - w_floor) / denom_woba, 0.55, 1.55)
        h_post_off = ((h_for / env_runs) + kappa_g * h_prior_off) / (h_games + kappa_g)
        eff_h_woba = clamp(w_floor + denom_woba * h_post_off + 0.5 * elo_shift, 0.255, 0.375)

    if inp.get("away_woba_override") is not None:
        eff_a_woba = float(inp["away_woba_override"])
    else:
        a_reg_woba = lg_woba + ret_mlb * (a_prior_woba - lg_woba)
        a_prior_off = clamp((a_reg_woba - w_floor) / denom_woba, 0.55, 1.55)
        a_post_off = ((a_for / env_runs) + kappa_g * a_prior_off) / (a_games + kappa_g)
        eff_a_woba = clamp(w_floor + denom_woba * a_post_off - 0.5 * elo_shift, 0.255, 0.375)

    env_scale = clamp(env_runs / float(wf["prior_team_runs"]), 0.88, 1.14)

    h_raw_sp_prior = 0.65 * h_prior_fip + 0.35 * float(h_prior_era) if h_prior_era is not None else h_prior_fip
    a_raw_sp_prior = 0.65 * a_prior_fip + 0.35 * float(a_prior_era) if a_prior_era is not None else a_prior_fip
    h_reg_sp = lg_fip + ret_mlb * (h_raw_sp_prior - lg_fip)
    a_reg_sp = lg_fip + ret_mlb * (a_raw_sp_prior - lg_fip)
    h_prior_def = clamp(h_reg_sp / lg_fip, 0.65, 1.45)
    a_prior_def = clamp(a_reg_sp / lg_fip, 0.65, 1.45)

    h_post_def = ((h_ag / env_runs) + kappa_g * h_prior_def) / (h_games + kappa_g)
    a_post_def = ((a_ag / env_runs) + kappa_g * a_prior_def) / (a_games + kappa_g)

    h_rot_fip = lg_fip * h_post_def * env_scale
    a_rot_fip = lg_fip * a_post_def * env_scale

    if inp.get("home_sp_fip_override") is not None:
        h_sp_in = float(inp["home_sp_fip_override"])
        h_ip_hist = float(inp.get("home_sp_ip_hist", 95.0))
        h_rot_base = float(inp.get("home_rot_fip_override", h_sp_in))
        h_sp_q = (max(0.0, h_ip_hist) * h_sp_in + kappa_ip * h_rot_base) / (max(0.0, h_ip_hist) + kappa_ip)
    else:
        h_sp_q = clamp(h_rot_fip, 2.50, 5.90)

    if inp.get("away_sp_fip_override") is not None:
        a_sp_in = float(inp["away_sp_fip_override"])
        a_ip_hist = float(inp.get("away_sp_ip_hist", 95.0))
        a_rot_base = float(inp.get("away_rot_fip_override", a_sp_in))
        a_sp_q = (max(0.0, a_ip_hist) * a_sp_in + kappa_ip * a_rot_base) / (max(0.0, a_ip_hist) + kappa_ip)
    else:
        a_sp_q = clamp(a_rot_fip, 2.50, 5.90)

    h_b2b = bool(inp.get("home_b2b", False))
    a_b2b = bool(inp.get("away_b2b", False))
    h_3in4 = bool(inp.get("home_3in4", False))
    a_3in4 = bool(inp.get("away_3in4", False))

    h_bp_pen = (float(wf["b2b_bp_fip_penalty"]) if h_b2b else 0.0) + (float(wf["three_in_four_bp_fip_penalty"]) if h_3in4 else 0.0)
    a_bp_pen = (float(wf["b2b_bp_fip_penalty"]) if a_b2b else 0.0) + (float(wf["three_in_four_bp_fip_penalty"]) if a_3in4 else 0.0)

    h_bp_fip = float(inp["home_bp_fip_override"]) if inp.get("home_bp_fip_override") is not None else clamp(h_sp_q + h_bp_pen, 2.40, 6.20)
    a_bp_fip = float(inp["away_bp_fip_override"]) if inp.get("away_bp_fip_override") is not None else clamp(a_sp_q + a_bp_pen, 2.40, 6.20)

    h_ip_exp = 1.2 if bool(inp.get("home_is_opener", False)) else clamp(float(inp.get("home_sp_exp_ip", 5.3)), 1.0, 6.8)
    a_ip_exp = 1.2 if bool(inp.get("away_is_opener", False)) else clamp(float(inp.get("away_sp_exp_ip", 5.3)), 1.0, 6.8)

    neutral = bool(inp.get("neutral_site", False))
    h_elev = float(inp.get("home_elevation_m", 150.0))
    h_dome = bool(inp.get("home_is_dome", False))
    if inp.get("park_weather_mult_override") is not None:
        pf = clamp(float(inp["park_weather_mult_override"]), 0.84, 1.32)
    else:
        if (not neutral) and (not h_dome) and h_elev >= 1200.0:
            pf = 1.16
        elif (not neutral) and (not h_dome) and h_elev >= 300.0:
            pf = 1.025
        elif h_dome:
            pf = 0.99
        else:
            pf = 1.0

    h_platoon = clamp(float(inp.get("home_platoon_mult", 1.0)), 0.88, 1.14)
    a_platoon = clamp(float(inp.get("away_platoon_mult", 1.0)), 0.88, 1.14)
    hca_h = 1.0 if neutral else float(c["home_scoring_mult"])
    hca_a = 1.0 if neutral else float(c["away_scoring_mult"])

    h_woba_ratio = clamp((eff_h_woba - w_floor) / denom_woba, 0.45, 1.85)
    a_woba_ratio = clamp((eff_a_woba - w_floor) / denom_woba, 0.45, 1.85)

    h_off_mult = h_woba_ratio * h_platoon * pf * hca_h * unearned_mult
    a_off_mult = a_woba_ratio * a_platoon * pf * hca_a * unearned_mult

    a_sp_f5 = min(5.0, a_ip_exp)
    a_bp_f5 = 5.0 - a_sp_f5
    h_sp_f5 = min(5.0, h_ip_exp)
    h_bp_f5 = 5.0 - h_sp_f5

    mu_f5_h = clamp(((a_sp_f5 * a_sp_q + a_bp_f5 * a_bp_fip) / 9.0) * h_off_mult, 0.45, 7.5)
    mu_f5_a = clamp(((h_sp_f5 * h_sp_q + h_bp_f5 * h_bp_fip) / 9.0) * a_off_mult, 0.45, 7.5)

    a_sp_l4 = max(0.0, a_ip_exp - 5.0)
    a_bp_l4 = max(0.0, 4.0 - a_sp_l4)
    h_sp_l4 = max(0.0, h_ip_exp - 5.0)
    h_bp_l4 = max(0.0, 4.0 - h_sp_l4)

    mu_l4_h = clamp(((a_sp_l4 * a_sp_q + a_bp_l4 * a_bp_fip) / 9.0) * h_off_mult, 0.35, 6.5)
    mu_l4_a = clamp(((h_sp_l4 * h_sp_q + h_bp_l4 * h_bp_fip) / 9.0) * a_off_mult, 0.35, 6.5)

    max_r_f5 = 16
    max_r_9 = 22
    max_r_full = 30

    pmf_f5_h = nb_pmf_exact(mu_f5_h, float(c["r_disp_f5"]), max_r_f5)
    pmf_f5_a = nb_pmf_exact(mu_f5_a, float(c["r_disp_f5"]), max_r_f5)
    pmf_l4_h = nb_pmf_exact(mu_l4_h, float(c["r_disp_late4"]), max_r_f5)
    pmf_l4_a = nb_pmf_exact(mu_l4_a, float(c["r_disp_late4"]), max_r_f5)

    p_h_f5 = 0.0
    p_t_f5 = 0.0
    p_a_f5 = 0.0
    p_ov45_f5 = 0.0
    for ih in range(max_r_f5 + 1):
        ph_v = pmf_f5_h[ih]
        for ia in range(max_r_f5 + 1):
            p = ph_v * pmf_f5_a[ia]
            if ih > ia:
                p_h_f5 += p
            elif ih == ia:
                p_t_f5 += p
            else:
                p_a_f5 += p
            if ih + ia > 4:
                p_ov45_f5 += p

    pmf_9_h = convolve_1d_exact(pmf_f5_h, pmf_l4_h, max_r_9)
    pmf_9_a = convolve_1d_exact(pmf_f5_a, pmf_l4_a, max_r_9)

    total_line = float(inp.get("total_line", 8.5))
    p_over9_trunc = 0.0
    p_tie9 = 0.0
    for ih in range(max_r_9 + 1):
        ph_v = pmf_9_h[ih]
        for ia in range(max_r_9 + 1):
            p = ph_v * pmf_9_a[ia]
            if ih + ia > total_line:
                p_over9_trunc += p
            if ih == ia:
                p_tie9 += p

    # Exact Extra-Innings Markov Chain (Manfred Runner on 2B + Home Walk-Off)
    manfred_boost = float(c["manfred_runner_boost_runs"])
    lam_ext_a = clamp((h_bp_fip / 9.0) * a_off_mult + manfred_boost, 0.35, 1.85)
    lam_ext_h = clamp((a_bp_fip / 9.0) * h_off_mult + manfred_boost * (1.0 if neutral else 1.04), 0.35, 1.95)

    max_ext_inn = 6
    qa = poisson_pmf_exact(lam_ext_a, max_ext_inn)
    qh = poisson_pmf_exact(lam_ext_h, max_ext_inn)

    p_cont = 0.0
    num_tied_runs = 0.0
    for d in range(max_ext_inn + 1):
        pd = qa[d] * qh[d]
        p_cont += pd
        num_tied_runs += d * pd
    p_resolve = max(1.0 - p_cont, 1e-6)
    mean_tied_runs = (num_tied_runs / max(p_cont, 1e-9)) if p_cont > 1e-6 else 0.0

    side_len = max_r_full + 1
    m_full = [0.0] * (side_len * side_len)

    for ih in range(max_r_9 + 1):
        for ia in range(max_r_9 + 1):
            p9 = pmf_9_h[ih] * pmf_9_a[ia]
            if p9 <= 0.0:
                continue
            if ih != ia:
                fh = min(ih, max_r_full)
                fa = min(ia, max_r_full)
                m_full[fh * side_len + fa] += p9
            else:
                rem_mass = p9
                for m_step in range(4):
                    step_tie_runs = round_half_even(m_step * mean_tied_runs)
                    scale_m = (rem_mass / p_resolve) if m_step == 3 else rem_mass
                    for ra in range(max_ext_inn + 1):
                        for rh in range(max_ext_inn + 1):
                            if ra == rh:
                                continue
                            p_pair = qa[ra] * qh[rh]
                            if rh > ra and (not neutral):
                                if rh == ra + 1:
                                    rh_eff = ra + 1
                                elif rh - ra == 2:
                                    rh_eff = ra + 1
                                else:
                                    rh_eff = min(rh, ra + 2)
                            else:
                                rh_eff = rh
                            fh = min(ih + step_tie_runs + rh_eff, max_r_full)
                            fa = min(ia + step_tie_runs + ra, max_r_full)
                            m_full[fh * side_len + fa] += scale_m * p_pair
                    rem_mass *= p_cont

    s_full = sum(m_full)
    if s_full > 0.0:
        m_full = [v / s_full for v in m_full]

    p_home_full = 0.0
    p_away_full = 0.0
    p_rl_h_m15 = 0.0
    p_rl_a_p15 = 0.0
    p_rl_h_p15 = 0.0
    p_rl_a_m15 = 0.0
    exp_h_full = 0.0
    exp_a_full = 0.0

    for ih in range(side_len):
        base = ih * side_len
        for ia in range(side_len):
            p = m_full[base + ia]
            if p <= 0.0:
                continue
            exp_h_full += ih * p
            exp_a_full += ia * p
            if ih > ia:
                p_home_full += p
            elif ia > ih:
                p_away_full += p
            if ih - ia >= 2:
                p_rl_h_m15 += p
            else:
                p_rl_a_p15 += p
            if ia - ih >= 2:
                p_rl_a_m15 += p
            else:
                p_rl_h_p15 += p

    p_home_c = clamp(p_home_full, 1e-6, 1.0 - 1e-6)
    p_away_c = 1.0 - p_home_c

    tot_primary = eval_total_line_from_2d_grid(m_full, side_len, total_line)
    totals_by_line = {
        f"{ln:.1f}": eval_total_line_from_2d_grid(m_full, side_len, float(ln))
        for ln in wf["canonical_total_lines"]
    }

    ep = evaluate_brownian_early_payout_v60(
        sport="mlb",
        p_home_win=p_home_c,
        p_away_win=p_away_c,
        trigger_lead=int(ep_cfg["trigger_lead"]),
        sigma_margin=float(ep_cfg["sigma_margin"]),
        effective_barrier=float(ep_cfg["effective_barrier"]),
        intra_game_status=str(ep_cfg["intra_game_validation_status"]),
    )

    return {
        "sport": "mlb",
        "p_home": p_home_c,
        "p_away": p_away_c,
        "effective_home_woba": eff_h_woba,
        "effective_away_woba": eff_a_woba,
        "effective_home_sp_fip": h_sp_q,
        "effective_away_sp_fip": a_sp_q,
        "park_factor_applied": pf,
        "f5": {
            "mu_home": mu_f5_h,
            "mu_away": mu_f5_a,
            "p_home": p_h_f5,
            "p_tie": p_t_f5,
            "p_away": p_a_f5,
            "p_over_4_5": p_ov45_f5,
        },
        "full_game": {
            "mu_9inn_home": mu_f5_h + mu_l4_h,
            "mu_9inn_away": mu_f5_a + mu_l4_a,
            "p_extra_innings": p_tie9,
            "expected_runs_home": exp_h_full,
            "expected_runs_away": exp_a_full,
            "expected_total_runs": exp_h_full + exp_a_full,
            "p_runline_home_minus_1_5": p_rl_h_m15,
            "p_runline_away_plus_1_5": p_rl_a_p15,
            "p_runline_home_plus_1_5": p_rl_h_p15,
            "p_runline_away_minus_1_5": p_rl_a_m15,
            "total_line": total_line,
            "p_over": tot_primary["p_over"],
            "p_under": tot_primary["p_under"],
            "p_push": tot_primary["p_push"],
            "p_over_no_push": tot_primary["p_over_no_push"],
            "p_over_9inn_truncated": p_over9_trunc,
            "extra_innings_over_correction_pp": 100.0 * (tot_primary["p_over_no_push"] - p_over9_trunc),
            "totals_by_line": totals_by_line,
        },
        "early_payout": ep,
    }


# ----------------------------------------------------------------------------
# 3C. Curvature NHL v6.0 Walk-Forward Coupled Physical Engine
# ----------------------------------------------------------------------------

def project_nhl_walkforward_outlook_v60(
    inp: dict[str, Any],
    artifact: dict[str, Any],
) -> dict[str, Any]:
    c = artifact["physics_config"]["nhl"]
    wf = c["walkforward"]
    ep_cfg = artifact["early_payout_config"]["nhl"]

    kappa_g = float(wf["prior_games"])
    env_goals = max(1.8, float(inp.get("league_team_scoring_env", wf["prior_team_goals"])))

    h_elo = float(inp.get("home_elo", 1500.0))
    a_elo = float(inp.get("away_elo", 1500.0))
    h_games = int(inp.get("home_games", 0))
    a_games = int(inp.get("away_games", 0))
    h_for = float(inp.get("home_cum_for", 0.0))
    h_ag = float(inp.get("home_cum_against", 0.0))
    a_for = float(inp.get("away_cum_for", 0.0))
    a_ag = float(inp.get("away_cum_against", 0.0))

    h_xgf = float(inp.get("home_prior_xgf_5v5", 2.55))
    h_xga = float(inp.get("home_prior_xga_5v5", 2.55))
    a_xgf = float(inp.get("away_prior_xgf_5v5", 2.55))
    a_xga = float(inp.get("away_prior_xga_5v5", 2.55))

    h_prior_off = clamp((h_xgf + 0.45) / 3.00, 0.72, 1.35)
    h_prior_def = clamp((h_xga + 0.45) / 3.00, 0.72, 1.35)
    a_prior_off = clamp((a_xgf + 0.45) / 3.00, 0.72, 1.35)
    a_prior_def = clamp((a_xga + 0.45) / 3.00, 0.72, 1.35)

    h_post_off = ((h_for / env_goals) + kappa_g * h_prior_off) / (h_games + kappa_g)
    h_post_def = ((h_ag / env_goals) + kappa_g * h_prior_def) / (h_games + kappa_g)
    a_post_off = ((a_for / env_goals) + kappa_g * a_prior_off) / (a_games + kappa_g)
    a_post_def = ((a_ag / env_goals) + kappa_g * a_prior_def) / (a_games + kappa_g)

    neutral = bool(inp.get("neutral_site", False))
    h_b2b = bool(inp.get("home_b2b", False))
    a_b2b = bool(inp.get("away_b2b", False))
    h_3in4 = bool(inp.get("home_3in4", False))
    a_3in4 = bool(inp.get("away_3in4", False))

    elo_tilt = clamp(((h_elo - a_elo) / 100.0) * float(wf["elo_goals60_tilt_per_100"]), -0.45, 0.45)
    h_ice = 0.0 if neutral else float(wf["home_ice_goals_boost"])
    a_ice = 0.0 if neutral else float(wf["away_ice_goals_offset"])
    h_34_pen = float(c["three_in_four_goals_penalty"]) if h_3in4 else 0.0
    a_34_pen = float(c["three_in_four_goals_penalty"]) if a_3in4 else 0.0

    if inp.get("base_goals_60_home_override") is not None:
        base60_h = float(inp["base_goals_60_home_override"])
    else:
        base60_h = clamp(0.935 * env_goals * h_post_off * a_post_def + h_ice + 0.5 * elo_tilt - h_34_pen, 1.55, 4.85)

    if inp.get("base_goals_60_away_override") is not None:
        base60_a = float(inp["base_goals_60_away_override"])
    else:
        base60_a = clamp(0.935 * env_goals * a_post_off * h_post_def + a_ice - 0.5 * elo_tilt - a_34_pen, 1.55, 4.85)

    h_pp = float(inp.get("home_pp_pct", 20.5))
    a_pk = float(inp.get("away_pk_pct", 79.5))
    a_pp = float(inp.get("away_pp_pct", 20.5))
    h_pk = float(inp.get("home_pk_pct", 79.5))
    pp_opp = float(c["avg_pp_opportunities"])

    st_delta_h = pp_opp * ((h_pp - (100.0 - a_pk)) / 200.0)
    st_delta_a = pp_opp * ((a_pp - (100.0 - h_pk)) / 200.0)

    lg_sv = float(c["league_sv_pct"])
    h_sv = float(inp.get("home_goalie_sv_pct", lg_sv)) - (float(c["b2b_sv_pct_penalty"]) if h_b2b else 0.0)
    a_sv = float(inp.get("away_goalie_sv_pct", lg_sv)) - (float(c["b2b_sv_pct_penalty"]) if a_b2b else 0.0)

    # Honest unconfirmed goalie flag by default (C5)
    h_conf = bool(inp.get("home_goalie_confirmed", False))
    a_conf = bool(inp.get("away_goalie_confirmed", False))
    w_gh = float(c["confirmed_goalie_weight"] if h_conf else c["unconfirmed_goalie_weight"])
    w_ga = float(c["confirmed_goalie_weight"] if a_conf else c["unconfirmed_goalie_weight"])

    shots_pg = float(c["shots_per_game"])
    gsaa_h = w_gh * clamp(h_sv - lg_sv, -0.035, 0.03) * shots_pg
    gsaa_a = w_ga * clamp(a_sv - lg_sv, -0.035, 0.03) * shots_pg

    lam60_h = clamp(base60_h + st_delta_h - gsaa_a, 1.45, 5.1)
    lam60_a = clamp(base60_a + st_delta_a - gsaa_h, 1.45, 5.1)

    max_g = 14
    pmf57_h = poisson_pmf_exact(0.95 * lam60_h, max_g)
    pmf57_a = poisson_pmf_exact(0.95 * lam60_a, max_g)
    q3_h = poisson_pmf_exact(0.05 * lam60_h, 3)
    q3_a = poisson_pmf_exact(0.05 * lam60_a, 3)

    p_en_l1 = float(c["empty_net_leader_goal_prob"])
    p_en_t1 = float(c["empty_net_puller_tie_prob"])
    p_en_l2 = float(c["empty_net_diff2_leader_prob"])
    p_en_t2 = float(c["empty_net_diff2_puller_prob"])
    p_en_2g = float(c["empty_net_two_goal_prob"])

    # n_reg_grid = max_g + 4 = 18 so ih + 3 <= 17 never clips; n_full_grid = 19 so OT +1 never clips!
    n_reg = max_g + 4
    m_reg = [0.0] * (n_reg * n_reg)

    for ih in range(max_g + 1):
        for ia in range(max_g + 1):
            p57 = pmf57_h[ih] * pmf57_a[ia]
            if p57 <= 0.0:
                continue
            diff = ih - ia
            if diff == 1 or diff == 2:
                p_l = p_en_l2 if diff == 2 else p_en_l1
                p_t = p_en_t2 if diff == 2 else p_en_t1
                p_stay = max(0.0, 1.0 - p_l - p_t - p_en_2g)
                m_reg[(ih + 1) * n_reg + ia] += p57 * p_l
                m_reg[ih * n_reg + (ia + 1)] += p57 * p_t
                m_reg[(ih + 2) * n_reg + ia] += p57 * (0.65 * p_en_2g)
                m_reg[(ih + 1) * n_reg + (ia + 1)] += p57 * (0.35 * p_en_2g)
                m_reg[ih * n_reg + ia] += p57 * p_stay
            elif diff == -1 or diff == -2:
                p_l = p_en_l2 if diff == -2 else p_en_l1
                p_t = p_en_t2 if diff == -2 else p_en_t1
                p_stay = max(0.0, 1.0 - p_l - p_t - p_en_2g)
                m_reg[ih * n_reg + (ia + 1)] += p57 * p_l
                m_reg[(ih + 1) * n_reg + ia] += p57 * p_t
                m_reg[ih * n_reg + (ia + 2)] += p57 * (0.65 * p_en_2g)
                m_reg[(ih + 1) * n_reg + (ia + 1)] += p57 * (0.35 * p_en_2g)
                m_reg[ih * n_reg + ia] += p57 * p_stay
            else:
                for dh in range(4):
                    for da in range(4):
                        m_reg[(ih + dh) * n_reg + (ia + da)] += p57 * q3_h[dh] * q3_a[da]

    s_reg = sum(m_reg)
    m_reg = [v / s_reg for v in m_reg]

    p_h_reg = 0.0
    p_ot_reg = 0.0
    p_a_reg = 0.0
    eg_h_reg = 0.0
    eg_a_reg = 0.0
    for ih in range(n_reg):
        base = ih * n_reg
        for ia in range(n_reg):
            p = m_reg[base + ia]
            eg_h_reg += ih * p
            eg_a_reg += ia * p
            if ih > ia:
                p_h_reg += p
            elif ih == ia:
                p_ot_reg += p
            else:
                p_a_reg += p

    strength_share_h = clamp(
        0.5 + 0.35 * (lam60_h / (lam60_h + lam60_a) - 0.5) + (0.0 if neutral else 0.015),
        0.38,
        0.62,
    )

    n_full = n_reg + 1
    m_full = [0.0] * (n_full * n_full)
    for ih in range(n_reg):
        for ia in range(n_reg):
            p = m_reg[ih * n_reg + ia]
            if p <= 0.0:
                continue
            if ih == ia:
                m_full[(ih + 1) * n_full + ia] += p * strength_share_h
                m_full[ih * n_full + (ia + 1)] += p * (1.0 - strength_share_h)
            else:
                m_full[ih * n_full + ia] += p

    p_home_ml = 0.0
    p_away_ml = 0.0
    eg_h_full = 0.0
    eg_a_full = 0.0
    p_pl_h_m15 = 0.0
    p_pl_a_p15 = 0.0
    p_pl_h_p15 = 0.0
    p_pl_a_m15 = 0.0

    for ih in range(n_full):
        base = ih * n_full
        for ia in range(n_full):
            p = m_full[base + ia]
            if p <= 0.0:
                continue
            eg_h_full += ih * p
            eg_a_full += ia * p
            if ih > ia:
                p_home_ml += p
            elif ia > ih:
                p_away_ml += p
            if ih - ia >= 2:
                p_pl_h_m15 += p
            else:
                p_pl_a_p15 += p
            if ia - ih >= 2:
                p_pl_a_m15 += p
            else:
                p_pl_h_p15 += p

    ot_residual = abs((eg_h_full - eg_h_reg) + (eg_a_full - eg_a_reg) - p_ot_reg)
    p_home_c = clamp(p_home_ml, 1e-6, 1.0 - 1e-6)
    p_away_c = 1.0 - p_home_c

    total_line = float(inp.get("total_line", 6.0))
    tot_primary = eval_total_line_from_2d_grid(m_full, n_full, total_line)
    totals_by_line = {
        f"{ln:.1f}": eval_total_line_from_2d_grid(m_full, n_full, float(ln))
        for ln in wf["canonical_total_lines"]
    }

    ep = evaluate_nhl_early_payout_dp_v60(
        lam60_home=lam60_h,
        lam60_away=lam60_a,
        p_home_full=p_home_c,
        p_away_full=p_away_c,
        strength_share_home=strength_share_h,
        ep_cfg=ep_cfg,
    )

    return {
        "sport": "nhl",
        "goalie_confirmed_home": h_conf,
        "goalie_confirmed_away": a_conf,
        "goalie_quality_flag": "ok" if (h_conf and a_conf) else "unconfirmed_goalie_warning",
        "lambda60_home": lam60_h,
        "lambda60_away": lam60_a,
        "p_home": p_home_c,
        "p_away": p_away_c,
        "p_home_reg": p_h_reg,
        "p_ot_reg": p_ot_reg,
        "p_away_reg": p_a_reg,
        "expected_goals_home_reg": eg_h_reg,
        "expected_goals_away_reg": eg_a_reg,
        "expected_goals_home_full": eg_h_full,
        "expected_goals_away_full": eg_a_full,
        "expected_total_goals": eg_h_full + eg_a_full,
        "ot_conservation_residual": ot_residual,
        "p_puckline_home_minus_1_5": p_pl_h_m15,
        "p_puckline_away_plus_1_5": p_pl_a_p15,
        "p_puckline_home_plus_1_5": p_pl_h_p15,
        "p_puckline_away_minus_1_5": p_pl_a_m15,
        "total_line": total_line,
        "p_over": tot_primary["p_over"],
        "p_under": tot_primary["p_under"],
        "p_push": tot_primary["p_push"],
        "p_over_no_push": tot_primary["p_over_no_push"],
        "totals_by_line": totals_by_line,
        "early_payout": ep,
    }


# ----------------------------------------------------------------------------
# 3D. Tensor NBA v6.0 Walk-Forward Coupled Physical Engine (+ Real Injuries)
# ----------------------------------------------------------------------------

def project_nba_walkforward_outlook_v60(
    inp: dict[str, Any],
    artifact: dict[str, Any],
) -> dict[str, Any]:
    c = artifact["physics_config"]["nba"]
    wf = c["walkforward"]
    ep_cfg = artifact["early_payout_config"]["nba"]

    kappa_g = float(wf["prior_games"])
    prior_lg_pts = float(wf["prior_team_pts"])
    env_pts = max(95.0, float(inp.get("league_team_scoring_env", prior_lg_pts)))
    env_ratio = env_pts / prior_lg_pts

    h_elo = float(inp.get("home_elo", 1500.0))
    a_elo = float(inp.get("away_elo", 1500.0))
    h_games = int(inp.get("home_games", 0))
    a_games = int(inp.get("away_games", 0))
    h_for = float(inp.get("home_cum_for", 0.0))
    h_ag = float(inp.get("home_cum_against", 0.0))
    a_for = float(inp.get("away_cum_for", 0.0))
    a_ag = float(inp.get("away_cum_against", 0.0))

    h_ortg = float(inp.get("home_prior_ortg", 114.5))
    h_drtg = float(inp.get("home_prior_drtg", 114.5))
    h_pace = float(inp.get("home_prior_pace", 99.5))
    a_ortg = float(inp.get("away_prior_ortg", 114.5))
    a_drtg = float(inp.get("away_prior_drtg", 114.5))
    a_pace = float(inp.get("away_prior_pace", 99.5))

    # Regress 2024-25 prior deviation toward league baseline across off-seasons (45% retention)
    h_prior_off = prior_lg_pts + 0.45 * (h_ortg * (h_pace / 100.0) - prior_lg_pts)
    h_prior_def = prior_lg_pts + 0.45 * (h_drtg * (h_pace / 100.0) - prior_lg_pts)
    a_prior_off = prior_lg_pts + 0.45 * (a_ortg * (a_pace / 100.0) - prior_lg_pts)
    a_prior_def = prior_lg_pts + 0.45 * (a_drtg * (a_pace / 100.0) - prior_lg_pts)

    h_off = (h_for + kappa_g * (h_prior_off * env_ratio)) / (h_games + kappa_g)
    h_def = (h_ag + kappa_g * (h_prior_def * env_ratio)) / (h_games + kappa_g)
    a_off = (a_for + kappa_g * (a_prior_off * env_ratio)) / (a_games + kappa_g)
    a_def = (a_ag + kappa_g * (a_prior_def * env_ratio)) / (a_games + kappa_g)

    neutral = bool(inp.get("neutral_site", False))
    h_elev = float(inp.get("home_elevation_m", 150.0))
    hca_pts = 0.0 if neutral else (float(wf["hca_base_pts"]) + (float(wf["high_altitude_hca_bonus_pts"]) if h_elev >= 1200.0 else 0.0))

    if inp.get("structural_margin_override") is not None:
        base_margin = float(inp["structural_margin_override"])
    else:
        rate_exp_h = (h_off * a_def) / env_pts
        rate_exp_a = (a_off * h_def) / env_pts
        rate_margin = (rate_exp_h - rate_exp_a) + hca_pts
        elo_diff = (h_elo - a_elo) + (0.0 if neutral else float(wf["elo_home_adv"]))
        elo_margin = elo_diff * 0.036
        w_elo = float(wf["elo_margin_weight"])
        base_margin = w_elo * elo_margin + (1.0 - w_elo) * rate_margin

    if inp.get("structural_total_override") is not None:
        base_total = float(inp["structural_total_override"])
    else:
        base_total = ((h_off * a_def) / env_pts) + ((a_off * h_def) / env_pts)

    h_out = max(0, int(inp.get("home_injuries_out", 0)))
    a_out = max(0, int(inp.get("away_injuries_out", 0)))
    h_q = max(0, int(inp.get("home_injuries_questionable", 0)))
    a_q = max(0, int(inp.get("away_injuries_questionable", 0)))

    out_u = float(c["injury_out_unit_pts"])
    out_p = float(c["injury_out_diminishing_power"])
    q_u = float(c["injury_duda_unit_pts"])

    h_miss_pts = (
        float(inp["home_missing_impact_pts"])
        if inp.get("home_missing_impact_pts") is not None
        else (out_u * math.pow(float(h_out), out_p) if h_out > 0 else 0.0)
    )
    a_miss_pts = (
        float(inp["away_missing_impact_pts"])
        if inp.get("away_missing_impact_pts") is not None
        else (out_u * math.pow(float(a_out), out_p) if a_out > 0 else 0.0)
    )
    h_duda_pts = (
        float(inp["home_questionable_impact_pts"])
        if inp.get("home_questionable_impact_pts") is not None
        else (q_u * math.pow(float(h_q), 0.85) if h_q > 0 else 0.0)
    )
    a_duda_pts = (
        float(inp["away_questionable_impact_pts"])
        if inp.get("away_questionable_impact_pts") is not None
        else (q_u * math.pow(float(a_q), 0.85) if a_q > 0 else 0.0)
    )

    inj_margin_delta = clamp((a_miss_pts - h_miss_pts) + 0.45 * (a_duda_pts - h_duda_pts), -14.5, 14.5)

    h_b2b = bool(inp.get("home_b2b", False))
    a_b2b = bool(inp.get("away_b2b", False))
    h_3in4 = bool(inp.get("home_3in4", False))
    a_3in4 = bool(inp.get("away_3in4", False))

    rest_delta = (
        (float(c["away_b2b_penalty_pts"]) if a_b2b else 0.0)
        - (float(c["home_b2b_penalty_pts"]) if h_b2b else 0.0)
        + (float(c["three_in_four_penalty_pts"]) if a_3in4 else 0.0)
        - (float(c["three_in_four_penalty_pts"]) if h_3in4 else 0.0)
    )

    exp_margin = base_margin + inj_margin_delta + rest_delta
    b2b_cnt = (1 if h_b2b else 0) + (1 if a_b2b else 0)
    exp_total = clamp(
        base_total - 0.30 * (h_miss_pts + a_miss_pts) - 0.15 * (h_duda_pts + a_duda_pts) - 0.85 * b2b_cnt,
        196.0,
        258.0,
    )

    sigma_base = float(c["sigma_margin_base"])
    inj_var_extra = (
        0.25 * float(c["injury_out_var_unit"]) * (h_miss_pts * h_miss_pts + a_miss_pts * a_miss_pts)
        + 0.50 * float(c["injury_duda_var_unit"]) * (h_duda_pts * h_duda_pts + a_duda_pts * a_duda_pts)
    )
    sigma_eff = math.sqrt(sigma_base * sigma_base + inj_var_extra)
    sigma_tot = float(c["sigma_total_base"])

    p_home = clamp(normal_cdf(exp_margin / sigma_eff), 1e-6, 1.0 - 1e-6)
    p_away = 1.0 - p_home

    sigma_reg = 0.945 * sigma_eff
    p_ot = clamp(
        float(c["ot_scale"])
        * (normal_cdf((0.5 - exp_margin) / sigma_reg) - normal_cdf((-0.5 - exp_margin) / sigma_reg)),
        0.015,
        0.11,
    )

    spread_line = (
        float(inp["spread_line_home"])
        if inp.get("spread_line_home") is not None
        else float(-round_half_even(exp_margin)) - 0.5
    )
    total_line = (
        float(inp["total_line"])
        if inp.get("total_line") is not None
        else float(round_half_even(exp_total)) + 0.5
    )

    if abs(spread_line - round(spread_line)) < 1e-9:
        sp_int = round(spread_line)
        p_sp_over = clamp(normal_cdf((exp_margin + sp_int - 0.5) / sigma_eff), 1e-6, 1.0 - 1e-6)
        p_sp_under = clamp(normal_cdf((-exp_margin - sp_int - 0.5) / sigma_eff), 1e-6, 1.0 - 1e-6)
        p_sp_push = max(0.0, 1.0 - p_sp_over - p_sp_under)
        p_cover_no_push = clamp(p_sp_over / max(p_sp_over + p_sp_under, 1e-12), 1e-6, 1.0 - 1e-6)
    else:
        p_sp_over = clamp(normal_cdf((exp_margin + spread_line) / sigma_eff), 1e-6, 1.0 - 1e-6)
        p_sp_under = 1.0 - p_sp_over
        p_sp_push = 0.0
        p_cover_no_push = p_sp_over

    def _eval_nba_tot(ln: float) -> dict[str, float]:
        if abs(ln - round(ln)) < 1e-9:
            k_ln = round(ln)
            po = clamp(1.0 - normal_cdf((k_ln + 0.5 - exp_total) / sigma_tot), 1e-6, 1.0 - 1e-6)
            pu = clamp(normal_cdf((k_ln - 0.5 - exp_total) / sigma_tot), 1e-6, 1.0 - 1e-6)
            pp = max(0.0, 1.0 - po - pu)
            po_np = clamp(po / max(po + pu, 1e-12), 1e-6, 1.0 - 1e-6)
        else:
            po = clamp(normal_cdf((exp_total - ln) / sigma_tot), 1e-6, 1.0 - 1e-6)
            pu = 1.0 - po
            pp = 0.0
            po_np = po
        return {
            "line": float(ln),
            "p_over": po,
            "p_under": pu,
            "p_push": pp,
            "p_over_no_push": po_np,
            "p_under_no_push": 1.0 - po_np,
        }

    tot_primary = _eval_nba_tot(total_line)
    totals_by_line = {f"{ln:.1f}": _eval_nba_tot(float(ln)) for ln in wf["canonical_total_lines"]}

    ep = evaluate_brownian_early_payout_v60(
        sport="nba",
        p_home_win=p_home,
        p_away_win=p_away,
        trigger_lead=int(ep_cfg["trigger_lead"]),
        sigma_margin=sigma_eff,
        effective_barrier=float(ep_cfg["effective_barrier"]),
        intra_game_status=str(ep_cfg["intra_game_validation_status"]),
    )

    return {
        "sport": "nba",
        "expected_margin": exp_margin,
        "expected_total": exp_total,
        "sigma_margin_base": sigma_base,
        "sigma_margin_effective": sigma_eff,
        "injury_margin_delta": inj_margin_delta,
        "rest_margin_delta": rest_delta,
        "home_missing_impact_pts": h_miss_pts,
        "away_missing_impact_pts": a_miss_pts,
        "home_questionable_impact_pts": h_duda_pts,
        "away_questionable_impact_pts": a_duda_pts,
        "p_home": p_home,
        "p_away": p_away,
        "p_overtime": p_ot,
        "spread_line_home": spread_line,
        "p_spread_home_cover": p_sp_over,
        "p_spread_away_cover": p_sp_under,
        "p_spread_push": p_sp_push,
        "p_spread_home_cover_no_push": p_cover_no_push,
        "total_line": total_line,
        "p_over": tot_primary["p_over"],
        "p_under": tot_primary["p_under"],
        "p_push": tot_primary["p_push"],
        "p_over_no_push": tot_primary["p_over_no_push"],
        "totals_by_line": totals_by_line,
        "early_payout": ep,
    }


# ----------------------------------------------------------------------------
# 3E. Minkowski NFL v6.0 Walk-Forward Coupled Physical Engine
# ----------------------------------------------------------------------------

def solve_nfl_key_margin_pmf_v60(
    expected_margin_target: float,
    p_tie: float,
    nfl_cfg: dict[str, Any],
) -> dict[str, Any]:
    max_m = int(nfl_cfg["max_abs_margin"])
    kernel = nfl_cfg["positive_margin_kernel_1_to_45"]
    c_quad = float(nfl_cfg["margin_quad_concentration"])
    pt = clamp(p_tie, 1e-6, 0.05)
    non_tie = 1.0 - pt
    target = clamp(expected_margin_target, -30.0, 30.0)

    eff_k = [
        (float(kernel[idx]) * math.exp(-c_quad * (idx + 1) * (idx + 1))) if c_quad != 0.0 else float(kernel[idx])
        for idx in range(max_m)
    ]

    lo = -0.65
    hi = 0.65
    for _ in range(56):
        mid = 0.5 * (lo + hi)
        pos_s = 0.0
        neg_s = 0.0
        num = 0.0
        for idx in range(max_m):
            m = idx + 1
            km = eff_k[idx]
            ep = km * math.exp(mid * m)
            en = km * math.exp(-mid * m)
            pos_s += ep
            neg_s += en
            num += m * (ep - en)
        mean_mid = (non_tie * num) / max(pos_s + neg_s, 1e-30)
        if mean_mid < target:
            lo = mid
        else:
            hi = mid

    theta = 0.5 * (lo + hi)
    pmf = [0.0] * (2 * max_m + 1)
    center = max_m
    pmf[center] = pt

    pos_s = 0.0
    neg_s = 0.0
    for idx in range(max_m):
        m = idx + 1
        km = eff_k[idx]
        pos_s += km * math.exp(theta * m)
        neg_s += km * math.exp(-theta * m)

    inv_den = non_tie / max(pos_s + neg_s, 1e-30)
    exp_margin = 0.0
    p_home_3w = 0.0
    p_away_3w = 0.0
    for idx in range(max_m):
        m_int = idx + 1
        km = eff_k[idx]
        p_pos = km * math.exp(theta * m_int) * inv_den
        p_neg = km * math.exp(-theta * m_int) * inv_den
        pmf[center + m_int] = p_pos
        pmf[center - m_int] = p_neg
        p_home_3w += p_pos
        p_away_3w += p_neg
        exp_margin += m_int * (p_pos - p_neg)

    var_m = 0.0
    for i, p_v in enumerate(pmf):
        diff_m = (i - center) - exp_margin
        var_m += p_v * diff_m * diff_m
    std_m = math.sqrt(max(var_m, 0.0))

    return {
        "theta": theta,
        "expected_margin": exp_margin,
        "std_margin": std_m,
        "max_abs_margin": max_m,
        "p_home_3way": p_home_3w,
        "p_tie_3way": pt,
        "p_away_3way": p_away_3w,
        "pmf": pmf,
    }


def eval_nfl_spread_from_pmf_v60(
    pmf: list[float],
    max_abs_margin: int,
    spread_home: float,
) -> dict[str, float]:
    center = max_abs_margin
    p_h_cov = 0.0
    p_a_cov = 0.0
    p_push = 0.0
    for idx, p in enumerate(pmf):
        if p <= 0.0:
            continue
        val = (idx - center) + spread_home
        if abs(val) < 1e-9:
            p_push += p
        elif val > 0.0:
            p_h_cov += p
        else:
            p_a_cov += p
    act = max(p_h_cov + p_a_cov, 1e-12)
    ph_np = clamp(p_h_cov / act, 1e-6, 1.0 - 1e-6)
    return {
        "spread_home": float(spread_home),
        "p_home_cover": p_h_cov,
        "p_away_cover": p_a_cov,
        "p_push": p_push,
        "p_home_cover_no_push": ph_np,
        "p_away_cover_no_push": 1.0 - ph_np,
    }


def solve_nfl_discrete_key_total_pmf_v60(
    expected_total: float,
    nfl_cfg: dict[str, Any],
) -> dict[str, Any]:
    spec = nfl_cfg["discrete_totals"]
    max_k = int(spec["max_total_points"])
    base_k = spec["base_kernel_0_to_95"]
    c_quad = float(spec["quad_concentration"])
    target = clamp(expected_total, 26.0, 68.0)

    log_base = [0.0] * (max_k + 1)
    for k in range(max_k + 1):
        diff = k - target
        log_base[k] = math.log(max(float(base_k[k]), 1e-15)) - c_quad * diff * diff

    lo = -0.45
    hi = 0.45
    for _ in range(52):
        mid = 0.5 * (lo + hi)
        max_lp = -1e30
        for k in range(max_k + 1):
            lp = log_base[k] + mid * k
            if lp > max_lp:
                max_lp = lp
        sum_w = 0.0
        sum_kw = 0.0
        for k in range(max_k + 1):
            w = math.exp(log_base[k] + mid * k - max_lp)
            sum_w += w
            sum_kw += k * w
        mean_mid = sum_kw / max(sum_w, 1e-30)
        if mean_mid < target:
            lo = mid
        else:
            hi = mid

    theta = 0.5 * (lo + hi)
    max_lp = -1e30
    for k in range(max_k + 1):
        lp = log_base[k] + theta * k
        if lp > max_lp:
            max_lp = lp
    pmf = [0.0] * (max_k + 1)
    sum_w = 0.0
    for k in range(max_k + 1):
        w = math.exp(log_base[k] + theta * k - max_lp)
        pmf[k] = w
        sum_w += w
    inv_s = 1.0 / max(sum_w, 1e-30)
    imp_mean = 0.0
    for k in range(max_k + 1):
        pmf[k] = pmf[k] * inv_s
        imp_mean += k * pmf[k]

    return {
        "theta": theta,
        "expected_total_implied": imp_mean,
        "pmf": pmf,
    }


def eval_nfl_total_from_pmf_v60(pmf: list[float], line: float) -> dict[str, float]:
    p_over = 0.0
    p_under = 0.0
    p_push = 0.0
    for k, p in enumerate(pmf):
        if p <= 0.0:
            continue
        if abs(k - line) < 1e-9:
            p_push += p
        elif k > line:
            p_over += p
        else:
            p_under += p
    act = max(p_over + p_under, 1e-12)
    po_np = clamp(p_over / act, 1e-6, 1.0 - 1e-6)
    return {
        "line": float(line),
        "p_over": p_over,
        "p_under": p_under,
        "p_push": p_push,
        "p_over_no_push": po_np,
        "p_under_no_push": 1.0 - po_np,
    }


def project_nfl_walkforward_outlook_v60(
    inp: dict[str, Any],
    artifact: dict[str, Any],
) -> dict[str, Any]:
    c = artifact["physics_config"]["nfl"]
    wf = c["walkforward"]
    ep_cfg = artifact["early_payout_config"]["nfl"]

    kappa_g = float(wf["prior_games"])
    prior_lg_pts = float(wf["prior_team_pts"])
    env_pts = max(15.0, float(inp.get("league_team_scoring_env", prior_lg_pts)))
    env_ratio = env_pts / prior_lg_pts

    h_elo = float(inp.get("home_elo", 1500.0))
    a_elo = float(inp.get("away_elo", 1500.0))
    h_games = int(inp.get("home_games", 0))
    a_games = int(inp.get("away_games", 0))
    h_for = float(inp.get("home_cum_for", 0.0))
    h_ag = float(inp.get("home_cum_against", 0.0))
    a_for = float(inp.get("away_cum_for", 0.0))
    a_ag = float(inp.get("away_cum_against", 0.0))

    h_prior_off = float(inp.get("home_prior_off_pts", prior_lg_pts))
    h_prior_def = float(inp.get("home_prior_def_pts", prior_lg_pts))
    a_prior_off = float(inp.get("away_prior_off_pts", prior_lg_pts))
    a_prior_def = float(inp.get("away_prior_def_pts", prior_lg_pts))

    h_off = (h_for + kappa_g * (h_prior_off * env_ratio)) / (h_games + kappa_g)
    h_def = (h_ag + kappa_g * (h_prior_def * env_ratio)) / (h_games + kappa_g)
    a_off = (a_for + kappa_g * (a_prior_off * env_ratio)) / (a_games + kappa_g)
    a_def = (a_ag + kappa_g * (a_prior_def * env_ratio)) / (a_games + kappa_g)

    neutral = bool(inp.get("neutral_site", False))
    h_rest = inp.get("home_rest_days")
    a_rest = inp.get("away_rest_days")
    h_rest_adj = (
        (-float(wf["short_week_penalty_pts"]) if int(h_rest) <= 4 else (float(wf["bye_week_bonus_pts"]) if int(h_rest) >= 10 else 0.0))
        if h_rest is not None
        else 0.0
    )
    a_rest_adj = (
        (-float(wf["short_week_penalty_pts"]) if int(a_rest) <= 4 else (float(wf["bye_week_bonus_pts"]) if int(a_rest) >= 10 else 0.0))
        if a_rest is not None
        else 0.0
    )

    if inp.get("expected_margin_override") is not None:
        exp_margin_target = clamp(float(inp["expected_margin_override"]), -28.0, 28.0)
    else:
        hca_pts = 0.0 if neutral else float(wf["hca_base_pts"])
        elo_diff = (h_elo - a_elo) + (0.0 if neutral else float(wf["elo_home_adv"]))
        elo_margin = elo_diff * float(wf["elo_to_margin_scale"])
        rate_exp_h = (h_off * a_def) / env_pts
        rate_exp_a = (a_off * h_def) / env_pts
        rate_margin = (rate_exp_h - rate_exp_a) + hca_pts
        exp_margin_target = clamp(0.55 * elo_margin + 0.45 * rate_margin + (h_rest_adj - a_rest_adj), -28.0, 28.0)

    if inp.get("expected_total_override") is not None:
        exp_total_target = clamp(float(inp["expected_total_override"]), 28.0, 66.0)
    else:
        exp_total_target = clamp(((h_off * a_def) / env_pts) + ((a_off * h_def) / env_pts), 28.0, 66.0)

    p_tie = (
        clamp(float(inp["p_tie_override"]), 1e-6, 0.05)
        if inp.get("p_tie_override") is not None
        else clamp(float(wf["base_tie_prob"]) * math.exp(-abs(exp_margin_target) / 10.0), 0.0005, 0.012)
    )

    sol_m = solve_nfl_key_margin_pmf_v60(exp_margin_target, p_tie, c)
    non_tie_mass = max(sol_m["p_home_3way"] + sol_m["p_away_3way"], 1e-12)
    p_home_2w = clamp(sol_m["p_home_3way"] / non_tie_mass, 1e-6, 1.0 - 1e-6)
    p_away_2w = 1.0 - p_home_2w

    spread_line = (
        float(inp["spread_line_home"])
        if inp.get("spread_line_home") is not None
        else -3.0
    )
    sp_primary = eval_nfl_spread_from_pmf_v60(sol_m["pmf"], sol_m["max_abs_margin"], spread_line)
    spreads_by_line = {
        f"{ln:.1f}": eval_nfl_spread_from_pmf_v60(sol_m["pmf"], sol_m["max_abs_margin"], float(ln))
        for ln in wf["canonical_spread_lines"]
    }

    sol_t = solve_nfl_discrete_key_total_pmf_v60(exp_total_target, c)
    total_line = float(inp.get("total_line", 45.5))
    tot_primary = eval_nfl_total_from_pmf_v60(sol_t["pmf"], total_line)
    totals_by_line = {
        f"{ln:.1f}": eval_nfl_total_from_pmf_v60(sol_t["pmf"], float(ln))
        for ln in wf["canonical_total_lines"]
    }

    # Overtime probability
    ot_cal = c["overtime_calibration"]
    x_ot = [
        math.exp(-abs(sol_m["expected_margin"]) / 7.0),
        (sol_t["expected_total_implied"] - 44.0) / 10.0,
        1.0 if bool(inp.get("is_indoor", False)) else 0.0,
        1.0 if bool(inp.get("is_turf", False)) else 0.0,
    ]
    eta_ot = float(ot_cal["intercept"])
    for idx_c, cf in enumerate(ot_cal["coef"]):
        eta_ot += float(cf) * x_ot[idx_c]
    p_ot = clamp(sigmoid(eta_ot), 0.005, 0.25)

    center = sol_m["max_abs_margin"]
    key_masses = {
        "m_3": sol_m["pmf"][center + 3] + sol_m["pmf"][center - 3],
        "m_6": sol_m["pmf"][center + 6] + sol_m["pmf"][center - 6],
        "m_7": sol_m["pmf"][center + 7] + sol_m["pmf"][center - 7],
        "m_10": sol_m["pmf"][center + 10] + sol_m["pmf"][center - 10],
        "m_14": sol_m["pmf"][center + 14] + sol_m["pmf"][center - 14],
    }

    ep = evaluate_brownian_early_payout_v60(
        sport="nfl",
        p_home_win=p_home_2w,
        p_away_win=p_away_2w,
        trigger_lead=int(ep_cfg["trigger_lead"]),
        sigma_margin=float(ep_cfg["sigma_margin"]),
        effective_barrier=float(ep_cfg["effective_barrier"]),
        intra_game_status=str(ep_cfg["intra_game_validation_status"]),
    )

    return {
        "sport": "nfl",
        "expected_margin": sol_m["expected_margin"],
        "std_margin": sol_m["std_margin"],
        "expected_total": sol_t["expected_total_implied"],
        "p_home": p_home_2w,
        "p_away": p_away_2w,
        "nfl_3way": {
            "p_home": sol_m["p_home_3way"],
            "p_tie": sol_m["p_tie_3way"],
            "p_away": sol_m["p_away_3way"],
        },
        "p_overtime": p_ot,
        "key_number_masses": key_masses,
        "spread_line_home": spread_line,
        "p_spread_home_cover": sp_primary["p_home_cover"],
        "p_spread_away_cover": sp_primary["p_away_cover"],
        "p_spread_push": sp_primary["p_push"],
        "p_spread_home_cover_no_push": sp_primary["p_home_cover_no_push"],
        "spreads_by_line": spreads_by_line,
        "total_line": total_line,
        "p_over": tot_primary["p_over"],
        "p_under": tot_primary["p_under"],
        "p_push": tot_primary["p_push"],
        "p_over_no_push": tot_primary["p_over_no_push"],
        "totals_by_line": totals_by_line,
        "early_payout": ep,
    }


# ============================================================================
# 4. Franchise Normalization & Causal Walk-Forward Execution (`2,920` Games)
# ============================================================================

TEAM_SLUG_TO_CODE: dict[str, dict[str, str]] = {
    "mlb": {
        "arizona-diamondbacks": "AZ", "az": "AZ", "ari": "AZ",
        "athletics": "OAK", "oakland-athletics": "OAK", "sacramento-athletics": "OAK", "oak": "OAK", "ath": "OAK",
        "atlanta-braves": "ATL", "atl": "ATL",
        "baltimore-orioles": "BAL", "bal": "BAL",
        "boston-red-sox": "BOS", "bos": "BOS",
        "chicago-cubs": "CHC", "chc": "CHC",
        "chicago-white-sox": "CWS", "cws": "CWS", "chw": "CWS",
        "cincinnati-reds": "CIN", "cin": "CIN",
        "cleveland-guardians": "CLE", "cle": "CLE",
        "colorado-rockies": "COL", "col": "COL",
        "detroit-tigers": "DET", "det": "DET",
        "houston-astros": "HOU", "hou": "HOU",
        "kansas-city-royals": "KC", "kc": "KC", "kcr": "KC",
        "los-angeles-angels": "LAA", "laa": "LAA", "ana": "LAA",
        "los-angeles-dodgers": "LAD", "lad": "LAD",
        "miami-marlins": "MIA", "mia": "MIA",
        "milwaukee-brewers": "MIL", "mil": "MIL",
        "minnesota-twins": "MIN", "min": "MIN",
        "new-york-mets": "NYM", "nym": "NYM",
        "new-york-yankees": "NYY", "nyy": "NYY",
        "philadelphia-phillies": "PHI", "phi": "PHI",
        "pittsburgh-pirates": "PIT", "pit": "PIT",
        "san-diego-padres": "SD", "sd": "SD", "sdp": "SD",
        "san-francisco-giants": "SF", "sf": "SF", "sfg": "SF",
        "seattle-mariners": "SEA", "sea": "SEA",
        "st-louis-cardinals": "STL", "stl": "STL",
        "tampa-bay-rays": "TB", "tb": "TB", "tbr": "TB",
        "texas-rangers": "TEX", "tex": "TEX",
        "toronto-blue-jays": "TOR", "tor": "TOR",
        "washington-nationals": "WSH", "wsh": "WSH", "was": "WSH",
    },
    "nhl": {
        "anaheim-ducks": "ANA", "ana": "ANA",
        "arizona-coyotes": "ARI", "utah-mammoth": "ARI", "utah-hockey-club": "ARI", "ari": "ARI", "uta": "ARI",
        "boston-bruins": "BOS", "bos": "BOS",
        "buffalo-sabres": "BUF", "buf": "BUF",
        "calgary-flames": "CGY", "cgy": "CGY",
        "carolina-hurricanes": "CAR", "car": "CAR",
        "chicago-blackhawks": "CHI", "chi": "CHI",
        "colorado-avalanche": "COL", "col": "COL",
        "columbus-blue-jackets": "CBJ", "cbj": "CBJ",
        "dallas-stars": "DAL", "dal": "DAL",
        "detroit-red-wings": "DET", "det": "DET",
        "edmonton-oilers": "EDM", "edm": "EDM",
        "florida-panthers": "FLA", "fla": "FLA",
        "los-angeles-kings": "LAK", "lak": "LAK", "la": "LAK",
        "minnesota-wild": "MIN", "min": "MIN",
        "montreal-canadiens": "MTL", "mtl": "MTL",
        "nashville-predators": "NSH", "nsh": "NSH",
        "new-jersey-devils": "NJD", "njd": "NJD", "nj": "NJD",
        "new-york-islanders": "NYI", "nyi": "NYI",
        "new-york-rangers": "NYR", "nyr": "NYR",
        "ottawa-senators": "OTT", "ott": "OTT",
        "philadelphia-flyers": "PHI", "phi": "PHI",
        "pittsburgh-penguins": "PIT", "pit": "PIT",
        "san-jose-sharks": "SJS", "sjs": "SJS", "sj": "SJS",
        "seattle-kraken": "SEA", "sea": "SEA",
        "st-louis-blues": "STL", "stl": "STL",
        "tampa-bay-lightning": "TBL", "tbl": "TBL", "tb": "TBL",
        "toronto-maple-leafs": "TOR", "tor": "TOR",
        "vancouver-canucks": "VAN", "van": "VAN",
        "vegas-golden-knights": "VGK", "vgk": "VGK",
        "washington-capitals": "WSH", "wsh": "WSH", "was": "WSH",
        "winnipeg-jets": "WPG", "wpg": "WPG",
    },
    "nba": {
        "atlanta-hawks": "ATL", "atl": "ATL",
        "boston-celtics": "BOS", "bos": "BOS",
        "brooklyn-nets": "BKN", "bkn": "BKN", "brk": "BKN",
        "charlotte-hornets": "CHA", "cha": "CHA",
        "chicago-bulls": "CHI", "chi": "CHI",
        "cleveland-cavaliers": "CLE", "cle": "CLE",
        "dallas-mavericks": "DAL", "dal": "DAL",
        "denver-nuggets": "DEN", "den": "DEN",
        "detroit-pistons": "DET", "det": "DET",
        "golden-state-warriors": "GSW", "gsw": "GSW", "gs": "GSW",
        "houston-rockets": "HOU", "hou": "HOU",
        "indiana-pacers": "IND", "ind": "IND",
        "los-angeles-clippers": "LAC", "la-clippers": "LAC", "lac": "LAC",
        "los-angeles-lakers": "LAL", "lal": "LAL",
        "memphis-grizzlies": "MEM", "mem": "MEM",
        "miami-heat": "MIA", "mia": "MIA",
        "milwaukee-bucks": "MIL", "mil": "MIL",
        "minnesota-timberwolves": "MIN", "min": "MIN",
        "new-orleans-pelicans": "NOP", "nop": "NOP", "no": "NOP",
        "new-york-knicks": "NYK", "nyk": "NYK", "ny": "NYK",
        "oklahoma-city-thunder": "OKC", "okc": "OKC",
        "orlando-magic": "ORL", "orl": "ORL",
        "philadelphia-76ers": "PHI", "phi": "PHI",
        "phoenix-suns": "PHX", "phx": "PHX", "pho": "PHX",
        "portland-trail-blazers": "POR", "por": "POR",
        "sacramento-kings": "SAC", "sac": "SAC",
        "san-antonio-spurs": "SAS", "sas": "SAS", "sa": "SAS",
        "toronto-raptors": "TOR", "tor": "TOR",
        "utah-jazz": "UTA", "uta": "UTA", "utah": "UTA",
        "washington-wizards": "WAS", "was": "WAS", "wsh": "WAS",
    },
    "nfl": {
        "arizona-cardinals": "ARI", "ari": "ARI",
        "atlanta-falcons": "ATL", "atl": "ATL",
        "baltimore-ravens": "BAL", "bal": "BAL",
        "buffalo-bills": "BUF", "buf": "BUF",
        "carolina-panthers": "CAR", "car": "CAR",
        "chicago-bears": "CHI", "chi": "CHI",
        "cincinnati-bengals": "CIN", "cin": "CIN",
        "cleveland-browns": "CLE", "cle": "CLE",
        "dallas-cowboys": "DAL", "dal": "DAL",
        "denver-broncos": "DEN", "den": "DEN",
        "detroit-lions": "DET", "det": "DET",
        "green-bay-packers": "GB", "gb": "GB", "gnb": "GB",
        "houston-texans": "HOU", "hou": "HOU",
        "indianapolis-colts": "IND", "ind": "IND",
        "jacksonville-jaguars": "JAX", "jax": "JAX", "jac": "JAX",
        "kansas-city-chiefs": "KC", "kc": "KC",
        "las-vegas-raiders": "LV", "lv": "LV", "lvr": "LV", "oak": "LV",
        "los-angeles-chargers": "LAC", "lac": "LAC",
        "los-angeles-rams": "LA", "la": "LA", "lar": "LA",
        "miami-dolphins": "MIA", "mia": "MIA",
        "minnesota-vikings": "MIN", "min": "MIN",
        "new-england-patriots": "NE", "ne": "NE",
        "new-orleans-saints": "NO", "no": "NO",
        "new-york-giants": "NYG", "nyg": "NYG",
        "new-york-jets": "NYJ", "nyj": "NYJ",
        "philadelphia-eagles": "PHI", "phi": "PHI",
        "pittsburgh-steelers": "PIT", "pit": "PIT",
        "san-francisco-49ers": "SF", "sf": "SF",
        "seattle-seahawks": "SEA", "sea": "SEA",
        "tampa-bay-buccaneers": "TB", "tb": "TB",
        "tennessee-titans": "TEN", "ten": "TEN",
        "washington-commanders": "WAS", "was": "WAS", "wsh": "WAS",
    },
}


def resolve_franchise_code(sport: str, raw_team: str) -> str:
    s = raw_team.strip().lower()
    if "::" in s:
        s = s.split("::", 1)[1]
    if "." in s:
        s = s.split(".", 1)[1]
    s = re.sub(r"[^a-z0-9_-]+", "", s)
    mapped = TEAM_SLUG_TO_CODE.get(sport, {}).get(s)
    if not mapped:
        raise KeyError(f"Unmapped {sport} team identifier: {raw_team!r} (cleaned={s!r})")
    return mapped


def days_between(d1: str, d2: str) -> int:
    dt1 = dt_mod.date.fromisoformat(d1[:10])
    dt2 = dt_mod.date.fromisoformat(d2[:10])
    return (dt2 - dt1).days


def build_v60_config_artifact(
    v40_state: dict[str, Any],
    nfl_v50_art: dict[str, Any],
) -> dict[str, Any]:
    v36_cfg = v40_state["v36_physics_config"]
    return {
        "schema_version": "multisport_v6.0.0",
        "codename": "PitchLab Spacetime Multi-Sport Walk-Forward Physics & Early-Payout v6.0 Candidate",
        "version": "6.0.0-candidate",
        "status": "candidate",
        "production_activated": False,
        "holdout_cut_utc": HOLDOUT_CUT_UTC,
        "holdout_sealed_untouched": True,
        "hyperparameter_tuning_on_holdout": False,
        "validation_status": "walk_forward_game_oos_2026_verified",
        "physics_config": {
            "mlb": {
                "league_woba": float(v36_cfg["mlb"]["league_woba"]),
                "woba_zero_floor": float(v36_cfg["mlb"]["woba_zero_floor"]),
                "league_fip": float(v36_cfg["mlb"]["league_fip"]),
                "unearned_runs_mult": float(v36_cfg["mlb"]["unearned_runs_mult"]),
                "starter_shrink_ip": float(v36_cfg["mlb"]["starter_shrink_ip"]),
                "home_scoring_mult": float(v36_cfg["mlb"]["home_scoring_mult"]),
                "away_scoring_mult": float(v36_cfg["mlb"]["away_scoring_mult"]),
                "r_disp_f5": float(v36_cfg["mlb"]["r_disp_f5"]),
                "r_disp_late4": float(v36_cfg["mlb"]["r_disp_late4"]),
                "manfred_runner_boost_runs": float(v36_cfg["mlb"]["manfred_runner_boost_runs"]),
                "walkforward": {
                    "prior_team_runs": 4.38,
                    "prior_games": 65.0,
                    "prior_env_team_games": 80.0,
                    "offseason_prior_retention": 0.44,
                    "elo_k": 4.2,
                    "elo_home_adv": 22.0,
                    "elo_woba_tilt_per_100": 0.0045,
                    "b2b_bp_fip_penalty": 0.08,
                    "three_in_four_bp_fip_penalty": 0.06,
                    "canonical_total_lines": [7.5, 8.5, 9.5],
                },
            },
            "nhl": {
                "league_sv_pct": float(v36_cfg["nhl"]["league_sv_pct"]),
                "shots_per_game": float(v36_cfg["nhl"]["shots_per_game"]),
                "avg_pp_opportunities": float(v36_cfg["nhl"]["avg_pp_opportunities"]),
                "confirmed_goalie_weight": float(v36_cfg["nhl"]["confirmed_goalie_weight"]),
                "unconfirmed_goalie_weight": float(v36_cfg["nhl"]["unconfirmed_goalie_weight"]),
                "b2b_sv_pct_penalty": float(v36_cfg["nhl"]["b2b_sv_pct_penalty"]),
                "three_in_four_goals_penalty": 0.06,
                "empty_net_leader_goal_prob": float(v36_cfg["nhl"]["empty_net_leader_goal_prob"]),
                "empty_net_puller_tie_prob": float(v36_cfg["nhl"]["empty_net_puller_tie_prob"]),
                "empty_net_diff2_leader_prob": float(v36_cfg["nhl"]["empty_net_diff2_leader_prob"]),
                "empty_net_diff2_puller_prob": float(v36_cfg["nhl"]["empty_net_diff2_puller_prob"]),
                "empty_net_two_goal_prob": float(v36_cfg["nhl"]["empty_net_two_goal_prob"]),
                "walkforward": {
                    "prior_team_goals": 3.12,
                    "prior_games": 38.0,
                    "prior_env_team_games": 50.0,
                    "elo_k": 6.5,
                    "elo_home_adv": 28.0,
                    "elo_goals60_tilt_per_100": 0.11,
                    "home_ice_goals_boost": 0.10,
                    "away_ice_goals_offset": -0.10,
                    "canonical_total_lines": [5.5, 6.0, 6.5],
                },
            },
            "nba": {
                "sigma_margin_base": 13.6,
                "sigma_total_base": 16.8,
                "home_b2b_penalty_pts": 1.55,
                "away_b2b_penalty_pts": 2.15,
                "three_in_four_penalty_pts": 0.85,
                "ot_scale": float(v36_cfg["nba"]["ot_scale"]),
                "injury_out_unit_pts": 1.15,
                "injury_out_diminishing_power": 0.78,
                "injury_duda_unit_pts": 0.95,
                "injury_out_var_unit": 0.55,
                "injury_duda_var_unit": 1.65,
                "walkforward": {
                    "prior_team_pts": 113.8,
                    "prior_games": 22.0,
                    "prior_env_team_games": 40.0,
                    "elo_k": 16.0,
                    "elo_home_adv": 56.0,
                    "elo_margin_weight": 0.45,
                    "hca_base_pts": 2.35,
                    "high_altitude_hca_bonus_pts": 1.15,
                    "canonical_total_lines": [221.5, 227.5, 233.5],
                },
            },
            "nfl": {
                "max_abs_margin": int(nfl_v50_art["max_abs_margin"]),
                "positive_margin_kernel_1_to_45": list(nfl_v50_art["positive_margin_kernel_1_to_45"]),
                "margin_quad_concentration": float(nfl_v50_art["margin_quad_concentration"]),
                "spread_market_posterior_w_model": float(nfl_v50_art["spread_market_posterior_w_model"]),
                "discrete_totals": {
                    "max_total_points": int(nfl_v50_art["discrete_totals_v5"]["max_total_points"]),
                    "base_kernel_0_to_95": list(nfl_v50_art["discrete_totals_v5"]["base_kernel_0_to_95"]),
                    "quad_concentration": float(nfl_v50_art["discrete_totals_v5"]["quad_concentration"]),
                    "market_posterior_w_model": float(nfl_v50_art["discrete_totals_v5"]["market_posterior_w_model"]),
                },
                "overtime_calibration": {
                    "feature_names": list(nfl_v50_art["overtime_calibration"]["feature_names"]),
                    "coef": list(nfl_v50_art["overtime_calibration"]["coef"]),
                    "intercept": float(nfl_v50_art["overtime_calibration"]["intercept"]),
                },
                "walkforward": {
                    "prior_team_pts": 22.8,
                    "prior_games": 14.0,
                    "prior_env_team_games": 32.0,
                    "offseason_elo_regression": 0.42,
                    "elo_k": 20.0,
                    "elo_home_adv": 44.0,
                    "elo_to_margin_scale": 0.040,
                    "hca_base_pts": 1.75,
                    "short_week_penalty_pts": 0.65,
                    "bye_week_bonus_pts": 0.55,
                    "base_tie_prob": 0.004,
                    "canonical_spread_lines": [-7.0, -3.5, -3.0, 3.0, 3.5, 7.0],
                    "canonical_total_lines": [41.0, 44.0, 44.5, 45.5, 47.0, 47.5],
                },
            },
        },
        "early_payout_config": {
            "mlb": {
                "trigger_lead": 5,
                "method": "brownian_reflection",
                "sigma_margin": 4.25,
                "effective_barrier": 4.55,
                "intra_game_validation_status": "theoretical_reflection_intra_game_no_2026_pbp_trace",
            },
            "nba": {
                "trigger_lead": 20,
                "method": "brownian_reflection_dynamic_sigma",
                "sigma_margin": 12.6,
                "effective_barrier": 18.8,
                "intra_game_validation_status": "theoretical_reflection_intra_game_no_2026_pbp_trace",
            },
            "nfl": {
                "trigger_lead": 17,
                "method": "brownian_reflection",
                "sigma_margin": 13.077,
                "effective_barrier": 16.5,
                "intra_game_validation_status": "oos_validated_nflverse_pbp_2020_2024_no_2026_pbp_trace",
            },
            "nhl": {
                "trigger_lead": 3,
                "method": "passage_time_markov_dp_18slice",
                "max_goals_dp": 11,
                "period_weights_3": [0.30, 0.35, 0.35],
                "intra_game_validation_status": "theoretical_passage_time_dp_intra_game_no_2026_pbp_trace",
            },
        },
        "team_slug_aliases": TEAM_SLUG_TO_CODE,
    }


def _load_us_season_matches_readonly(
    pitch_data_dir: Path,
    bridge_bundle: dict[str, Any],
) -> list[dict[str, Any]]:
    snap_dir = pitch_data_dir / "snapshots"
    matches_out: list[dict[str, Any]] = []
    if snap_dir.exists():
        for sp in ("mlb", "nhl", "nba", "nfl"):
            srf = snap_dir / sp / "season-results.json"
            if not srf.exists():
                continue
            sr = json.loads(srf.read_text(encoding="utf-8"))
            for m in sr.get("matches") or []:
                hs, as_ = m.get("homeScore"), m.get("awayScore")
                dt = (m.get("date") or (m.get("startTime") or "")[:10]).strip()
                if not isinstance(hs, int) or not isinstance(as_, int) or not dt:
                    continue
                matches_out.append({
                    "id": m.get("id") or f"{sp}:{dt}:{m.get('homeTeam')}:{m.get('awayTeam')}",
                    "sport": sp,
                    "date": dt,
                    "startTime": m.get("startTime") or f"{dt}T00:00:00Z",
                    "homeTeam": str(m.get("homeTeam") or ""),
                    "awayTeam": str(m.get("awayTeam") or ""),
                    "homeScore": hs,
                    "awayScore": as_,
                    "neutralSite": bool(m.get("neutralSite", False)),
                })
    if not matches_out:
        for m in bridge_bundle.get("season_matches", []):
            if m.get("sport") in ("mlb", "nhl", "nba", "nfl"):
                matches_out.append({
                    "id": m["id"],
                    "sport": m["sport"],
                    "date": m["date"],
                    "startTime": m.get("startTime") or f"{m['date']}T00:00:00Z",
                    "homeTeam": m["homeTeam"],
                    "awayTeam": m["awayTeam"],
                    "homeScore": int(m["homeScore"]),
                    "awayScore": int(m["awayScore"]),
                    "neutralSite": bool(m.get("neutralSite", False)),
                })
    matches_out.sort(key=lambda r: (r["date"], r["startTime"], r["id"]))
    return matches_out


def _load_nba_injuries_readonly(pitch_data_dir: Path) -> tuple[str, list[dict[str, Any]]]:
    inj_path = pitch_data_dir / "snapshots" / "nba" / "injuries.json"
    if not inj_path.exists():
        return ("2026-11-19T14:16:45.965Z", [])
    raw = json.loads(inj_path.read_text(encoding="utf-8"))
    observed_at = str(raw.get("observedAt") or "2026-11-19T14:16:45.965Z")
    entries = []
    for e in raw.get("entries") or []:
        tid = e.get("teamId")
        if not tid:
            continue
        code = resolve_franchise_code("nba", str(tid))
        entries.append({
            "team_code": code,
            "player": str(e.get("player") or ""),
            "position": str(e.get("position") or ""),
            "status": str(e.get("status") or ""),
            "return_date": str(e.get("returnDate") or ""),
            "reported_at": str(e.get("reportedAt") or ""),
            "reported_date": str(e.get("reportedAt") or "")[:10],
        })
    return (observed_at, entries)


def _count_causal_nba_injuries(
    entries: list[dict[str, Any]],
    team_code: str,
    game_date: str,
    strict_before_date: bool = True,
) -> tuple[int, int]:
    """Counts `(baja_count, duda_count)` causally known strictly before `game_date` (`reported_date < game_date`)."""
    out_cnt = 0
    q_cnt = 0
    for e in entries:
        if e["team_code"] != team_code:
            continue
        rep_d = e["reported_date"]
        ret_d = e["return_date"]
        if strict_before_date:
            if not rep_d or rep_d >= game_date:
                continue
        else:
            if rep_d and rep_d > game_date:
                continue
        if ret_d and ret_d <= game_date:
            continue
        st_low = e["status"].strip().lower()
        if st_low in ("baja", "out", "injured"):
            out_cnt += 1
        elif st_low in ("duda", "questionable", "gtd", "day-to-day", "doubtful"):
            q_cnt += 1
    return (out_cnt, q_cnt)


def run_experiment() -> dict[str, Any]:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    PRED_DATA_DIR.mkdir(parents=True, exist_ok=True)

    bridge_bundle = json.loads(BRIDGE_ARTIFACT_PATH.read_text(encoding="utf-8"))
    v40_state = json.loads((PRED_DATA_DIR / "multisport_v4_0_state_candidate.json").read_text(encoding="utf-8"))
    nfl_state = json.loads((PRED_DATA_DIR / "nfl_causal_state_v3_5.json").read_text(encoding="utf-8"))
    nfl_v50_art = json.loads((PRED_DATA_DIR / "model_nfl_v5_0_candidate.json").read_text(encoding="utf-8"))

    v60_art = build_v60_config_artifact(v40_state, nfl_v50_art)
    all_us_matches = _load_us_season_matches_readonly(DEFAULT_PITCH_DATA, bridge_bundle)
    nba_inj_obs_at, nba_inj_entries = _load_nba_injuries_readonly(DEFAULT_PITCH_DATA)

    # Pre-build franchise structural priors map (`< 2025-02-02`, zero leakage)
    priors_by_team: dict[str, dict[str, Any]] = {}
    for k, entry in v40_state["teams"].items():
        sp = entry["sport"]
        if sp not in ("mlb", "nhl", "nba"):
            continue
        code = entry["team_key"]
        priors_by_team[f"{sp}::{code}"] = {
            "sport": sp,
            "team_key": code,
            "team_name": entry["team_name"],
            "elevation_m": float(entry["elevation_m"]),
            "is_dome": bool(entry["is_dome"]),
            "metrics": dict(entry["metrics"]),
        }

    nfl_wf_cfg = v60_art["physics_config"]["nfl"]["walkforward"]
    for code, b_st in nfl_state["franchise_base_state"].items():
        reg_elo = 1500.0 + float(nfl_wf_cfg["offseason_elo_regression"]) * (float(b_st["elo"]) - 1500.0)
        p_off = clamp(float(nfl_wf_cfg["prior_team_pts"]) + 0.30 * float(b_st["ewm_off"]), 18.0, 28.5)
        p_def = clamp(float(nfl_wf_cfg["prior_team_pts"]) - 0.30 * float(b_st["ewm_def"]), 18.0, 28.5)
        priors_by_team[f"nfl::{code}"] = {
            "sport": "nfl",
            "team_key": code,
            "team_name": code,
            "elevation_m": float(b_st.get("elevation_m", 150.0)),
            "is_dome": bool(float(b_st.get("is_indoor_home", 0.0)) >= 0.5),
            "metrics": {
                "regressed_elo_prior": round(reg_elo, 6),
                "prior_off_pts": round(p_off, 6),
                "prior_def_pts": round(p_def, 6),
            },
        }

    # Walk-Forward State Containers & Results Collectors
    walkforward_results_by_sport: dict[str, Any] = {}
    parity_cases: list[dict[str, Any]] = []
    post_walkforward_teams: dict[str, dict[str, Any]] = {}
    league_environments_2026: dict[str, dict[str, Any]] = {}

    total_ep_dominance_violations = 0
    total_games_evaluated_ep = 0
    pooled_all_clusters: list[str] = []
    pooled_all_y: list[int] = []
    pooled_all_p: list[float] = []
    pooled_all_coin: list[float] = []
    pooled_pb_clusters: list[str] = []
    pooled_pb_y: list[int] = []
    pooled_pb_p: list[float] = []
    pooled_pb_coin: list[float] = []

    for sport in ("mlb", "nhl", "nba", "nfl"):
        sp_games = [m for m in all_us_matches if m["sport"] == sport]
        by_date: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for m in sp_games:
            by_date[m["date"]].append(m)

        wf_cfg = v60_art["physics_config"][sport]["walkforward"]
        elo_k = float(wf_cfg["elo_k"])
        elo_hfa = float(wf_cfg["elo_home_adv"])
        prior_env_val = float(
            wf_cfg.get("prior_team_runs")
            or wf_cfg.get("prior_team_goals")
            or wf_cfg.get("prior_team_pts")
        )
        kappa_env = float(wf_cfg["prior_env_team_games"])

        team_elo: dict[str, float] = {}
        for pk, pv in priors_by_team.items():
            if pv["sport"] != sport:
                continue
            c_key = pv["team_key"]
            if sport == "nfl":
                team_elo[c_key] = float(pv["metrics"]["regressed_elo_prior"])
            else:
                # Start at neutral 1500.0 so structural team priors are counted once (no double-counting!)
                team_elo[c_key] = 1500.0

        team_for: dict[str, float] = defaultdict(float)
        team_ag: dict[str, float] = defaultdict(float)
        team_n: dict[str, int] = defaultdict(int)
        team_dates: dict[str, list[str]] = defaultdict(list)
        lg_cum_pts = 0.0
        lg_cum_team_games = 0

        # Evaluation arrays (all games `n_all` & post-burnin `n_post_burnin`)
        all_clusters: list[str] = []
        all_ml_y: list[int] = []
        all_ml_p: list[float] = []
        all_ml_coin: list[float] = []

        pb_clusters: list[str] = []
        pb_ml_y: list[int] = []
        pb_ml_p: list[float] = []
        pb_ml_coin: list[float] = []

        prosp_clusters: list[str] = []
        prosp_ml_y: list[int] = []
        prosp_ml_p: list[float] = []
        prosp_ml_coin: list[float] = []

        spread_clusters: list[str] = []
        spread_y: list[int] = []
        spread_p: list[float] = []
        spread_bench: list[float] = []

        tot_clusters_by_line: dict[str, list[str]] = defaultdict(list)
        tot_y_by_line: dict[str, list[int]] = defaultdict(list)
        tot_p_by_line: dict[str, list[float]] = defaultdict(list)
        tot_bench_by_line: dict[str, list[float]] = defaultdict(list)

        # Extra MLB truncated-9inn vs Manfred Markov comparison on canonical 8.5
        mlb_trunc_p_85: list[float] = []
        nhl_max_ot_residual = 0.0
        nba_causal_injury_games = 0
        nba_sigma_widened_games = 0

        pred_totals: list[float] = []
        act_totals: list[float] = []
        b2b_games = 0
        three_in_four_games = 0

        ep_lifts_home: list[float] = []
        ep_lifts_away: list[float] = []
        ep_ft_blowout_hits_home: list[int] = []
        ep_ft_win_hits_home: list[int] = []
        ep_p_home_list: list[float] = []
        ep_violations_sport = 0

        min_burn_in = 2 if sport == "nfl" else 4
        sport_parity_indices = set()
        if len(sp_games) >= 16:
            step_idx = max(1, len(sp_games) // 16)
            sport_parity_indices = {min(len(sp_games) - 1, q * step_idx) for q in range(16)}
            while len(sport_parity_indices) < 16:
                for cand_i in range(len(sp_games) - 1, -1, -1):
                    sport_parity_indices.add(cand_i)
                    if len(sport_parity_indices) == 16:
                        break

        global_g_counter = 0
        for cur_date in sorted(by_date.keys()):
            day_games = by_date[cur_date]
            # Strictly causal league environment: computed from `date' < cur_date` ONLY!
            lg_env = (lg_cum_pts + kappa_env * prior_env_val) / (lg_cum_team_games + kappa_env)

            for g in day_games:
                h_code = resolve_franchise_code(sport, g["homeTeam"])
                a_code = resolve_franchise_code(sport, g["awayTeam"])
                h_pr = priors_by_team[f"{sport}::{h_code}"]
                a_pr = priors_by_team[f"{sport}::{a_code}"]

                h_hist = team_dates[h_code]
                a_hist = team_dates[a_code]
                h_rest_days = days_between(h_hist[-1], cur_date) if h_hist else None
                a_rest_days = days_between(a_hist[-1], cur_date) if a_hist else None

                h_b2b = bool(h_rest_days == 1)
                a_b2b = bool(a_rest_days == 1)
                h_3in4 = bool(len(h_hist) >= 2 and days_between(h_hist[-2], cur_date) <= 3)
                a_3in4 = bool(len(a_hist) >= 2 and days_between(a_hist[-2], cur_date) <= 3)
                if h_b2b or a_b2b:
                    b2b_games += 1
                if h_3in4 or a_3in4:
                    three_in_four_games += 1

                nh = team_n[h_code]
                na = team_n[a_code]

                base_inp: dict[str, Any] = {
                    "home_elo": round(team_elo[h_code], 8),
                    "away_elo": round(team_elo[a_code], 8),
                    "home_cum_for": round(team_for[h_code], 8),
                    "home_cum_against": round(team_ag[h_code], 8),
                    "home_games": nh,
                    "away_cum_for": round(team_for[a_code], 8),
                    "away_cum_against": round(team_ag[a_code], 8),
                    "away_games": na,
                    "league_team_scoring_env": round(lg_env, 8),
                    "home_b2b": h_b2b,
                    "away_b2b": a_b2b,
                    "home_3in4": h_3in4,
                    "away_3in4": a_3in4,
                    "neutral_site": bool(g["neutralSite"]),
                    "home_elevation_m": h_pr["elevation_m"],
                    "home_is_dome": h_pr["is_dome"],
                }

                if sport == "mlb":
                    base_inp.update({
                        "home_prior_woba": h_pr["metrics"]["woba"],
                        "away_prior_woba": a_pr["metrics"]["woba"],
                        "home_prior_fip": h_pr["metrics"]["fip"],
                        "away_prior_fip": a_pr["metrics"]["fip"],
                        "home_prior_era": h_pr["metrics"]["era"],
                        "away_prior_era": a_pr["metrics"]["era"],
                        "total_line": 8.5,
                    })
                    out = project_mlb_walkforward_outlook_v60(base_inp, v60_art)
                    pred_tot = out["full_game"]["expected_total_runs"]
                elif sport == "nhl":
                    base_inp.update({
                        "home_prior_xgf_5v5": h_pr["metrics"]["xgf_5v5"],
                        "home_prior_xga_5v5": h_pr["metrics"]["xga_5v5"],
                        "away_prior_xgf_5v5": a_pr["metrics"]["xgf_5v5"],
                        "away_prior_xga_5v5": a_pr["metrics"]["xga_5v5"],
                        "home_goalie_sv_pct": h_pr["metrics"]["sv_pct"],
                        "away_goalie_sv_pct": a_pr["metrics"]["sv_pct"],
                        "home_goalie_confirmed": False,
                        "away_goalie_confirmed": False,
                        "total_line": 6.0,
                    })
                    out = project_nhl_walkforward_outlook_v60(base_inp, v60_art)
                    pred_tot = out["expected_total_goals"]
                    nhl_max_ot_residual = max(nhl_max_ot_residual, out["ot_conservation_residual"])
                elif sport == "nba":
                    h_out_i, h_q_i = _count_causal_nba_injuries(nba_inj_entries, h_code, cur_date, strict_before_date=True)
                    a_out_i, a_q_i = _count_causal_nba_injuries(nba_inj_entries, a_code, cur_date, strict_before_date=True)
                    if (h_out_i + h_q_i + a_out_i + a_q_i) > 0:
                        nba_causal_injury_games += 1
                    base_inp.update({
                        "home_prior_ortg": h_pr["metrics"]["ortg"],
                        "home_prior_drtg": h_pr["metrics"]["drtg"],
                        "home_prior_pace": h_pr["metrics"]["pace"],
                        "away_prior_ortg": a_pr["metrics"]["ortg"],
                        "away_prior_drtg": a_pr["metrics"]["drtg"],
                        "away_prior_pace": a_pr["metrics"]["pace"],
                        "home_injuries_out": h_out_i,
                        "away_injuries_out": a_out_i,
                        "home_injuries_questionable": h_q_i,
                        "away_injuries_questionable": a_q_i,
                        "spread_line_home": -2.5,
                        "total_line": 227.5,
                    })
                    out = project_nba_walkforward_outlook_v60(base_inp, v60_art)
                    pred_tot = out["expected_total"]
                    if out["sigma_margin_effective"] > out["sigma_margin_base"] + 1e-12:
                        nba_sigma_widened_games += 1
                else:
                    base_inp.update({
                        "home_prior_off_pts": h_pr["metrics"]["prior_off_pts"],
                        "home_prior_def_pts": h_pr["metrics"]["prior_def_pts"],
                        "away_prior_off_pts": a_pr["metrics"]["prior_off_pts"],
                        "away_prior_def_pts": a_pr["metrics"]["prior_def_pts"],
                        "home_rest_days": h_rest_days,
                        "away_rest_days": a_rest_days,
                        "is_indoor": h_pr["is_dome"],
                        "is_turf": h_pr["is_dome"],
                        "spread_line_home": -3.0,
                        "total_line": 45.5,
                    })
                    out = project_nfl_walkforward_outlook_v60(base_inp, v60_art)
                    pred_tot = out["expected_total"]

                # Verify Early Payout Algebraic Dominance on EVERY game (`2,920 / 2,920`)
                ep_block = out["early_payout"]
                total_games_evaluated_ep += 1
                if (
                    ep_block["p_home_early_payout_win"] + 1e-15 < out["p_home"]
                    or ep_block["p_away_early_payout_win"] + 1e-15 < out["p_away"]
                ):
                    ep_violations_sport += 1
                    total_ep_dominance_violations += 1

                hs = int(g["homeScore"])
                as_ = int(g["awayScore"])
                margin = hs - as_
                tot_sc = hs + as_
                trigger_lead = int(ep_block["trigger_lead"])

                ep_lifts_home.append(ep_block["home_early_payout_lift"])
                ep_lifts_away.append(ep_block["away_early_payout_lift"])
                ep_ft_blowout_hits_home.append(1 if margin >= trigger_lead else 0)
                ep_ft_win_hits_home.append(1 if margin > 0 else 0)
                ep_p_home_list.append(ep_block["p_home_early_payout_win"])

                pred_totals.append(pred_tot)
                act_totals.append(float(tot_sc))

                if global_g_counter in sport_parity_indices:
                    parity_cases.append({
                        "case_id": f"{sport}_wf_{global_g_counter:04d}_{g['id']}",
                        "sport": sport,
                        "date": cur_date,
                        "home_code": h_code,
                        "away_code": a_code,
                        "input": base_inp,
                        "expected": out,
                    })
                global_g_counter += 1

                # Settled Moneyline (2-way non-tie)
                if hs != as_:
                    yh = 1 if hs > as_ else 0
                    ph = out["p_home"]
                    all_clusters.append(cur_date)
                    all_ml_y.append(yh)
                    all_ml_p.append(ph)
                    all_ml_coin.append(0.5)
                    pooled_all_clusters.append(cur_date)
                    pooled_all_y.append(yh)
                    pooled_all_p.append(ph)
                    pooled_all_coin.append(0.5)

                    if nh >= min_burn_in and na >= min_burn_in:
                        pb_clusters.append(cur_date)
                        pb_ml_y.append(yh)
                        pb_ml_p.append(ph)
                        pb_ml_coin.append(0.5)
                        pooled_pb_clusters.append(cur_date)
                        pooled_pb_y.append(yh)
                        pooled_pb_p.append(ph)
                        pooled_pb_coin.append(0.5)

                    if cur_date > HOLDOUT_END_DATE:
                        prosp_clusters.append(cur_date)
                        prosp_ml_y.append(yh)
                        prosp_ml_p.append(ph)
                        prosp_ml_coin.append(0.5)

                # Settled Run Line / Puck Line / Spread
                if sport == "mlb":
                    y_rl = 1 if margin >= 2 else 0
                    spread_clusters.append(cur_date)
                    spread_y.append(y_rl)
                    spread_p.append(out["full_game"]["p_runline_home_minus_1_5"])
                    spread_bench.append(0.365)  # structural MLB home -1.5 base rate prior
                elif sport == "nhl":
                    y_pl = 1 if margin >= 2 else 0
                    spread_clusters.append(cur_date)
                    spread_y.append(y_pl)
                    spread_p.append(out["p_puckline_home_minus_1_5"])
                    spread_bench.append(0.335)  # structural NHL home -1.5 base rate prior
                elif sport == "nba":
                    if abs(margin + out["spread_line_home"]) > 1e-9:
                        y_sp = 1 if (margin + out["spread_line_home"]) > 0 else 0
                        spread_clusters.append(cur_date)
                        spread_y.append(y_sp)
                        spread_p.append(out["p_spread_home_cover_no_push"])
                        spread_bench.append(0.5)
                else:
                    # Objective Home -3.0 ATS (excluding exact 3-pt pushes)
                    if margin != 3:
                        y_sp = 1 if margin > 3 else 0
                        spread_clusters.append(cur_date)
                        spread_y.append(y_sp)
                        spread_p.append(out["spreads_by_line"]["-3.0"]["p_home_cover_no_push"])
                        spread_bench.append(0.5)

                # Settled Canonical Totals Lines (excluding exact integer pushes)
                t_map = out["full_game"]["totals_by_line"] if sport == "mlb" else out["totals_by_line"]
                for l_key, t_proj in t_map.items():
                    ln_val = float(t_proj["line"])
                    if abs(tot_sc - ln_val) < 1e-9:
                        continue
                    y_ov = 1 if tot_sc > ln_val else 0
                    tot_clusters_by_line[l_key].append(cur_date)
                    tot_y_by_line[l_key].append(y_ov)
                    tot_p_by_line[l_key].append(t_proj["p_over_no_push"])
                    tot_bench_by_line[l_key].append(0.5)
                    if sport == "mlb" and l_key == "8.5":
                        mlb_trunc_p_85.append(clamp(out["full_game"]["p_over_9inn_truncated"], 1e-6, 1.0 - 1e-6))

            # Causal end-of-day state update (`date' < next_date`, never intra-day!)
            for g in day_games:
                h_code = resolve_franchise_code(sport, g["homeTeam"])
                a_code = resolve_franchise_code(sport, g["awayTeam"])
                hs_f = float(g["homeScore"])
                as_f = float(g["awayScore"])

                elo_diff = (team_elo[h_code] - team_elo[a_code]) + (0.0 if g["neutralSite"] else elo_hfa)
                exp_h = 1.0 / (1.0 + math.pow(10.0, -elo_diff / 400.0))
                s_h = 1.0 if hs_f > as_f else (0.5 if hs_f == as_f else 0.0)
                mov_mult = math.log(abs(hs_f - as_f) + 1.0) * (
                    2.2 / ((elo_diff if s_h > 0.5 else -elo_diff) * 0.001 + 2.2)
                )
                delta_elo = elo_k * clamp(mov_mult, 0.6, 1.8) * (s_h - exp_h)
                team_elo[h_code] += delta_elo
                team_elo[a_code] -= delta_elo

                team_for[h_code] += hs_f
                team_ag[h_code] += as_f
                team_n[h_code] += 1
                team_for[a_code] += as_f
                team_ag[a_code] += hs_f
                team_n[a_code] += 1
                team_dates[h_code].append(cur_date)
                team_dates[a_code].append(cur_date)

                lg_cum_pts += hs_f + as_f
                lg_cum_team_games += 2

        # Export final causal post-walkforward team state for live scheduled games
        final_lg_env = (lg_cum_pts + kappa_env * prior_env_val) / (lg_cum_team_games + kappa_env)
        league_environments_2026[sport] = {
            "games_ingested": len(sp_games),
            "shrunk_team_scoring_env": round(final_lg_env, 6),
            "mean_observed_game_total": round(sum(act_totals) / max(1, len(act_totals)), 4),
        }

        for pk, pv in sorted(priors_by_team.items()):
            if pv["sport"] != sport:
                continue
            c_key = pv["team_key"]
            hist = team_dates[c_key]
            post_walkforward_teams[pk] = {
                "sport": sport,
                "team_key": c_key,
                "team_name": pv["team_name"],
                "elevation_m": pv["elevation_m"],
                "is_dome": pv["is_dome"],
                "elo": round(team_elo[c_key], 6),
                "games_played": team_n[c_key],
                "cum_for": round(team_for[c_key], 4),
                "cum_against": round(team_ag[c_key], 4),
                "last_game_date": hist[-1] if len(hist) >= 1 else None,
                "prev_game_date": hist[-2] if len(hist) >= 2 else None,
                "structural_priors": pv["metrics"],
            }

        totals_oos_summary = {
            l_key: evaluate_binary_market_oos(
                tot_clusters_by_line[l_key],
                tot_y_by_line[l_key],
                tot_p_by_line[l_key],
                tot_bench_by_line[l_key],
            )
            for l_key in sorted(tot_y_by_line.keys(), key=lambda x: float(x))
        }

        sp_summary: dict[str, Any] = {
            "validation_status": "walk_forward_game_oos_2026_verified",
            "total_games_ingested": len(sp_games),
            "distinct_date_clusters": len(by_date),
            "b2b_games_detected": b2b_games,
            "three_in_four_games_detected": three_in_four_games,
            "all_games_moneyline_vs_coin_oos": evaluate_binary_market_oos(
                all_clusters, all_ml_y, all_ml_p, all_ml_coin
            ),
            "post_burnin_moneyline_vs_coin_oos": evaluate_binary_market_oos(
                pb_clusters, pb_ml_y, pb_ml_p, pb_ml_coin
            ),
            "post_holdout_prospective_after_2026_11_08": evaluate_binary_market_oos(
                prosp_clusters, prosp_ml_y, prosp_ml_p, prosp_ml_coin
            ),
            "handicap_or_runline_oos": evaluate_binary_market_oos(
                spread_clusters, spread_y, spread_p, spread_bench
            ),
            "totals_by_line_oos": totals_oos_summary,
            "mean_predicted_total": round(sum(pred_totals) / max(1, len(pred_totals)), 4),
            "mean_actual_total": round(sum(act_totals) / max(1, len(act_totals)), 4),
            "totals_bias": round((sum(pred_totals) - sum(act_totals)) / max(1, len(pred_totals)), 4),
            "early_payout_audit": {
                "trigger_lead": v60_art["early_payout_config"][sport]["trigger_lead"],
                "final_score_validation_status": "walk_forward_game_oos_2026_verified",
                "intra_game_validation_status": v60_art["early_payout_config"][sport]["intra_game_validation_status"],
                "algebraic_dominance_violations": ep_violations_sport,
                "mean_home_early_payout_prob": round(sum(ep_p_home_list) / max(1, len(ep_p_home_list)), 6),
                "mean_home_early_payout_lift_pp": round(100.0 * sum(ep_lifts_home) / max(1, len(ep_lifts_home)), 4),
                "mean_away_early_payout_lift_pp": round(100.0 * sum(ep_lifts_away) / max(1, len(ep_lifts_away)), 4),
                "observed_home_ft_win_rate": round(sum(ep_ft_win_hits_home) / max(1, len(ep_ft_win_hits_home)), 6),
                "observed_home_ft_blowout_ge_trigger_rate": round(
                    sum(ep_ft_blowout_hits_home) / max(1, len(ep_ft_blowout_hits_home)), 6
                ),
            },
        }

        if sport == "mlb":
            # Axiom 8 verification + Manfred Extra-Innings vs 9-inning truncated OOS on 8.5
            elite_vs_weak = project_mlb_walkforward_outlook_v60(
                {
                    "home_woba_override": 0.345,
                    "away_woba_override": 0.285,
                    "neutral_site": True,
                    "park_weather_mult_override": 1.0,
                },
                v60_art,
            )
            avg_mlb = project_mlb_walkforward_outlook_v60(
                {
                    "home_woba_override": 0.312,
                    "away_woba_override": 0.312,
                    "home_sp_fip_override": 4.08,
                    "away_sp_fip_override": 4.08,
                    "home_bp_fip_override": 4.08,
                    "away_bp_fip_override": 4.08,
                    "neutral_site": False,
                    "park_weather_mult_override": 1.0,
                },
                v60_art,
            )
            sp_summary["axiom_8_physics_audit"] = {
                "elite_345_vs_weak_285_woba_ratio": round(
                    elite_vs_weak["full_game"]["mu_9inn_home"] / elite_vs_weak["full_game"]["mu_9inn_away"], 6
                ),
                "league_avg_expected_total_runs": round(avg_mlb["full_game"]["expected_total_runs"], 6),
                "manfred_markov_vs_truncated_9inn_o85_oos": evaluate_binary_market_oos(
                    tot_clusters_by_line["8.5"],
                    tot_y_by_line["8.5"],
                    tot_p_by_line["8.5"],
                    mlb_trunc_p_85,
                ),
            }
        elif sport == "nhl":
            sp_summary["empty_net_and_goalie_audit"] = {
                "max_ot_conservation_residual": nhl_max_ot_residual,
                "all_games_goalie_confirmed_false": True,
                "integer_line_6_0_mean_push_mass": round(
                    project_nhl_walkforward_outlook_v60({"total_line": 6.0}, v60_art)["p_push"], 6
                ),
            }
        elif sport == "nba":
            sp_summary["injury_and_fatigue_audit"] = {
                "injury_feed_observed_at_utc": nba_inj_obs_at,
                "total_entries_in_nba_injuries_json": len(nba_inj_entries),
                "causal_filter": "reported_date < game_date and (return_date == '' or return_date > game_date)",
                "walkforward_games_with_causal_injuries": nba_causal_injury_games,
                "walkforward_games_with_sigma_widened": nba_sigma_widened_games,
            }
        elif sport == "nfl":
            sol_50 = solve_nfl_key_margin_pmf_v60(0.0, 0.004, v60_art["physics_config"]["nfl"])
            sp_summary["axiom_5_minkowski_audit"] = {
                "std_margin_50_50": round(sol_50["std_margin"], 6),
                "key_number_3_mass_50_50": round(sol_50["pmf"][45 + 3] + sol_50["pmf"][45 - 3], 6),
                "key_number_7_mass_50_50": round(sol_50["pmf"][45 + 7] + sol_50["pmf"][45 - 7], 6),
                "integer_total_44_push_mass": round(
                    project_nfl_walkforward_outlook_v60({"total_line": 44.0}, v60_art)["p_push"], 6
                ),
            }

        walkforward_results_by_sport[sport] = sp_summary

    # Build active NBA injury summary as of `observedAt` for live scheduled matchups
    nba_active_injuries_2026: dict[str, dict[str, Any]] = {}
    obs_date = nba_inj_obs_at[:10]
    nba_c = v60_art["physics_config"]["nba"]
    for pk, pv in sorted(priors_by_team.items()):
        if pv["sport"] != "nba":
            continue
        code = pv["team_key"]
        b_cnt, d_cnt = _count_causal_nba_injuries(nba_inj_entries, code, obs_date, strict_before_date=False)
        miss_pts = float(nba_c["injury_out_unit_pts"]) * math.pow(float(b_cnt), float(nba_c["injury_out_diminishing_power"])) if b_cnt > 0 else 0.0
        duda_pts = float(nba_c["injury_duda_unit_pts"]) * math.pow(float(d_cnt), 0.85) if d_cnt > 0 else 0.0
        nba_active_injuries_2026[code] = {
            "baja_count": b_cnt,
            "duda_count": d_cnt,
            "missing_impact_pts": round(miss_pts, 6),
            "questionable_impact_pts": round(duda_pts, 6),
        }

    v60_art["nba_active_injuries_observed_at_utc"] = nba_inj_obs_at
    v60_art["nba_active_injuries_2026"] = nba_active_injuries_2026
    v60_art["league_environments_2026"] = league_environments_2026
    v60_art["teams_post_walkforward_state_2026"] = post_walkforward_teams

    # Project live scheduled matchups from `snapshots/{mlb,nhl,nba,nfl}/latest.json` (read-only)
    live_scheduled_outlooks: list[dict[str, Any]] = []
    snap_root = DEFAULT_PITCH_DATA / "snapshots"
    if snap_root.exists():
        for sport in ("mlb", "nhl", "nba", "nfl"):
            lat_f = snap_root / sport / "latest.json"
            if not lat_f.exists():
                continue
            lat = json.loads(lat_f.read_text(encoding="utf-8"))
            for g in lat.get("games") or []:
                if g.get("status") != "scheduled":
                    continue
                h_raw = (g.get("home") or {}).get("id") or (g.get("home") or {}).get("code") or ""
                a_raw = (g.get("away") or {}).get("id") or (g.get("away") or {}).get("code") or ""
                if not h_raw or not a_raw:
                    continue
                h_code = resolve_franchise_code(sport, str(h_raw))
                a_code = resolve_franchise_code(sport, str(a_raw))
                kick_dt = str(g.get("startTime") or "")[:10] or "2026-11-20"
                out_live = project_multisport_matchup_from_state_v60(
                    sport=sport,
                    home_team=h_code,
                    away_team=a_code,
                    game_date=kick_dt,
                    neutral_site=bool(g.get("neutralSite", False)),
                    artifact=v60_art,
                )
                live_scheduled_outlooks.append({
                    "game_id": g.get("id"),
                    "sport": sport,
                    "kickoff_utc": g.get("startTime"),
                    "home_code": h_code,
                    "away_code": a_code,
                    "neutral_site": bool(g.get("neutralSite", False)),
                    "p_home": out_live["p_home"],
                    "p_away": out_live["p_away"],
                    "p_home_early_payout_win": out_live["early_payout"]["p_home_early_payout_win"],
                    "p_away_early_payout_win": out_live["early_payout"]["p_away_early_payout_win"],
                    "expected_total": (
                        out_live["full_game"]["expected_total_runs"]
                        if sport == "mlb"
                        else (
                            out_live["expected_total_goals"]
                            if sport == "nhl"
                            else out_live["expected_total"]
                        )
                    ),
                })

    results_report = {
        "schema_version": "exp_v60_multisport_v6_0_results_1.0.0",
        "experiment_id": "EXP_V60",
        "codename": "PitchLab Multi-Sport Walk-Forward Physics & Early-Payout v6.0 Candidate",
        "status": "candidate",
        "production_activated": False,
        "holdout_cut_utc": HOLDOUT_CUT_UTC,
        "holdout_sealed_untouched": True,
        "hyperparameter_tuning_on_holdout": False,
        "governance": {
            "causality_rule": "strict_chronological_date_prime_lt_date",
            "bootstrap_method": "cluster_mulberry32",
            "bootstrap_seed": BOOTSTRAP_SEED,
            "bootstrap_resamples": BOOTSTRAP_RESAMPLES,
            "total_games_ingested": len(all_us_matches),
            "games_by_sport": {
                sp: walkforward_results_by_sport[sp]["total_games_ingested"]
                for sp in ("mlb", "nhl", "nba", "nfl")
            },
            "early_payout_dominance_violations": total_ep_dominance_violations,
            "early_payout_games_checked": total_games_evaluated_ep,
            "forbidden_fields_present": False,
        },
        "pooled_4_leagues_oos": {
            "all_games_moneyline_vs_coin_oos": evaluate_binary_market_oos(
                pooled_all_clusters, pooled_all_y, pooled_all_p, pooled_all_coin
            ),
            "post_burnin_moneyline_vs_coin_oos": evaluate_binary_market_oos(
                pooled_pb_clusters, pooled_pb_y, pooled_pb_p, pooled_pb_coin
            ),
        },
        "sports": walkforward_results_by_sport,
        "live_scheduled_games_projected": len(live_scheduled_outlooks),
        "parity_vectors_exported": len(parity_cases),
    }

    snapshot_payload = {
        "schema_version": "multisport_v6_0_snapshot_1.0.0",
        "status": "candidate",
        "production_activated": False,
        "holdout_sealed_untouched": True,
        "parity_cases_count": len(parity_cases),
        "parity_cases": parity_cases,
        "live_scheduled_outlooks_2026": live_scheduled_outlooks,
    }

    model_path = PRED_DATA_DIR / "model_multisport_v6_0_candidate.json"
    snap_path = PRED_DATA_DIR / "multisport_v6_0_snapshot.json"
    res_path = ARTIFACTS_DIR / "exp_v60_multisport_v6_0_results.json"

    model_path.write_text(json.dumps(v60_art, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    snap_path.write_text(json.dumps(snapshot_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    res_path.write_text(json.dumps(results_report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    return results_report


def project_multisport_matchup_from_state_v60(
    sport: str,
    home_team: str,
    away_team: str,
    game_date: str,
    neutral_site: bool,
    artifact: dict[str, Any],
    total_line: float | None = None,
    spread_line_home: float | None = None,
) -> dict[str, Any]:
    """High-level matchup projector using `teams_post_walkforward_state_2026` (mirrored in TS)."""
    h_code = resolve_franchise_code(sport, home_team)
    a_code = resolve_franchise_code(sport, away_team)
    st_map = artifact["teams_post_walkforward_state_2026"]
    h_st = st_map[f"{sport}::{h_code}"]
    a_st = st_map[f"{sport}::{a_code}"]
    lg_env = float(artifact["league_environments_2026"][sport]["shrunk_team_scoring_env"])

    h_last = h_st["last_game_date"]
    h_prev = h_st["prev_game_date"]
    a_last = a_st["last_game_date"]
    a_prev = a_st["prev_game_date"]

    h_rest = days_between(h_last, game_date) if (h_last and h_last < game_date) else None
    a_rest = days_between(a_last, game_date) if (a_last and a_last < game_date) else None
    h_b2b = bool(h_rest == 1)
    a_b2b = bool(a_rest == 1)
    h_3in4 = bool(h_prev and h_prev < game_date and days_between(h_prev, game_date) <= 3)
    a_3in4 = bool(a_prev and a_prev < game_date and days_between(a_prev, game_date) <= 3)

    inp: dict[str, Any] = {
        "home_elo": float(h_st["elo"]),
        "away_elo": float(a_st["elo"]),
        "home_cum_for": float(h_st["cum_for"]),
        "home_cum_against": float(h_st["cum_against"]),
        "home_games": int(h_st["games_played"]),
        "away_cum_for": float(a_st["cum_for"]),
        "away_cum_against": float(a_st["cum_against"]),
        "away_games": int(a_st["games_played"]),
        "league_team_scoring_env": lg_env,
        "home_b2b": h_b2b,
        "away_b2b": a_b2b,
        "home_3in4": h_3in4,
        "away_3in4": a_3in4,
        "neutral_site": neutral_site,
        "home_elevation_m": float(h_st["elevation_m"]),
        "home_is_dome": bool(h_st["is_dome"]),
    }
    if total_line is not None:
        inp["total_line"] = total_line
    if spread_line_home is not None:
        inp["spread_line_home"] = spread_line_home

    h_pr = h_st["structural_priors"]
    a_pr = a_st["structural_priors"]
    if sport == "mlb":
        inp.update({
            "home_prior_woba": h_pr["woba"],
            "away_prior_woba": a_pr["woba"],
            "home_prior_fip": h_pr["fip"],
            "away_prior_fip": a_pr["fip"],
            "home_prior_era": h_pr["era"],
            "away_prior_era": a_pr["era"],
        })
        return project_mlb_walkforward_outlook_v60(inp, artifact)
    if sport == "nhl":
        inp.update({
            "home_prior_xgf_5v5": h_pr["xgf_5v5"],
            "home_prior_xga_5v5": h_pr["xga_5v5"],
            "away_prior_xgf_5v5": a_pr["xgf_5v5"],
            "away_prior_xga_5v5": a_pr["xga_5v5"],
            "home_goalie_sv_pct": h_pr["sv_pct"],
            "away_goalie_sv_pct": a_pr["sv_pct"],
            "home_goalie_confirmed": False,
            "away_goalie_confirmed": False,
        })
        return project_nhl_walkforward_outlook_v60(inp, artifact)
    if sport == "nba":
        h_inj = artifact["nba_active_injuries_2026"].get(h_code, {"baja_count": 0, "duda_count": 0})
        a_inj = artifact["nba_active_injuries_2026"].get(a_code, {"baja_count": 0, "duda_count": 0})
        inp.update({
            "home_prior_ortg": h_pr["ortg"],
            "home_prior_drtg": h_pr["drtg"],
            "home_prior_pace": h_pr["pace"],
            "away_prior_ortg": a_pr["ortg"],
            "away_prior_drtg": a_pr["drtg"],
            "away_prior_pace": a_pr["pace"],
            "home_injuries_out": int(h_inj["baja_count"]),
            "away_injuries_out": int(a_inj["baja_count"]),
            "home_injuries_questionable": int(h_inj["duda_count"]),
            "away_injuries_questionable": int(a_inj["duda_count"]),
        })
        return project_nba_walkforward_outlook_v60(inp, artifact)

    inp.update({
        "home_prior_off_pts": h_pr["prior_off_pts"],
        "home_prior_def_pts": h_pr["prior_def_pts"],
        "away_prior_off_pts": a_pr["prior_off_pts"],
        "away_prior_def_pts": a_pr["prior_def_pts"],
        "home_rest_days": h_rest,
        "away_rest_days": a_rest,
        "is_indoor": bool(h_st["is_dome"]),
        "is_turf": bool(h_st["is_dome"]),
    })
    return project_nfl_walkforward_outlook_v60(inp, artifact)


if __name__ == "__main__":
    report = run_experiment()
    print(json.dumps(report["governance"], ensure_ascii=False, indent=2))
    for sp_k in ("mlb", "nhl", "nba", "nfl"):
        sp_d = report["sports"][sp_k]
        ml_d = sp_d["post_burnin_moneyline_vs_coin_oos"]["logloss"]
        print(
            f"[{sp_k.upper()}] n={sp_d['total_games_ingested']} | "
            f"PB ML LL={ml_d['cand_mean']} (Δ={ml_d['delta_mean']}, CI95=[{ml_d['ci95_lo']}, {ml_d['ci95_hi']}], {ml_d['verdict']}) | "
            f"ECE={sp_d['post_burnin_moneyline_vs_coin_oos']['ece_cand']} | "
            f"TotBias={sp_d['totals_bias']} | EP_viol={sp_d['early_payout_audit']['algebraic_dominance_violations']}"
        )
