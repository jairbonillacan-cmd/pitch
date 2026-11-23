"""PitchLab v6.0 Candidate — Causal 53-Competition Football Engine (`EXP_V58`).

Scales PitchLab football intelligence across all 53 platform football competitions
(`57` leagues minus `mlb`, `nba`, `nhl`, `nfl`), organized into 6 confederation/format
hierarchies (`UEFA_TOP`, `UEFA_SECOND_AND_CUPS`, `CONMEBOL_LEAGUE_AND_CUPS`,
`CONCACAF_AND_MX`, `AFC_CAF_EXPANSION`, `INTERNATIONAL_NATIONAL_TEAMS`):

  1. Strict Pre-2025 Physics & Hyperparameter Fixing (`< 2025-02-02`):
     - `holdout_sealed_untouched = True` (`0` tuning in `[2025-02-02, 2026-11-08]`).
     - Confederation priors, club Elo/Attack/Defense warm-starts, and the Monotone
       Inductive Venn-Abers Logit Calibrator for playable odds `[1.55, 2.60]` are
       derived strictly from `< 2025-02-02` artifacts (`club_state_v5_1.json` and
       `Pitch/data/history/*.jsonl` filtered with `date < "2025-02-02"`).
  2. Strict Date-Causal Rolling State (`date' < date`):
     - Tracks `LeagueScoringEnvEWM` + Elo + Club Attack/Defense across `season-results.json`
       (`5,120` matches in `43` active leagues), updating state strictly after all matches
       of `date` conclude.
     - Explicitly assigns `"confederation_prior_zero_2026_games"` to the `10` national-team
       competitions with zero 2026 games in `season-results.json`.
  3. Exact 4-Param Diagonal-NB Score Matrix (`< 1e-12` 1X2 cone & total error):
     - Coherently derives `1x2`, `double_chance`, `totals_1_5`, `totals_2_5`, `totals_3_5`,
       `btts`, `dnb`, and `topScorelines[3]` from a single `13 x 13` bivariate matrix,
       plus Inductive Venn-Abers monotone recalibration in logit space for `[1.55, 2.60]`.
  4. Zero external package dependencies (100% Python 3.12 standard library) and IEEE-754
     `< 1e-12` parity with `src/domain/prediction/soccer_57_v6_0.ts`.
"""

from __future__ import annotations

import sys

sys.dont_write_bytecode = True

from collections import defaultdict
import hashlib
import json
import math
import os
from pathlib import Path
import re
from typing import Any

EXP_DIR = Path(__file__).resolve().parent
REPO_ROOT = EXP_DIR.parents[3]
ARTIFACTS_DIR = EXP_DIR / "artifacts"
PRED_DATA_DIR = REPO_ROOT / "src" / "data" / "prediction"

BRIDGE_DATASET_PATH = (
    REPO_ROOT
    / "research"
    / "prediction-lab"
    / "experiments"
    / "EXP_V57_v5_2_live_feedback"
    / "artifacts"
    / "live_platform_bridge_dataset.json"
)
CLUB_STATE_V51_PATH = PRED_DATA_DIR / "club_state_v5_1.json"
INTL_GOALS_V50_PATH = PRED_DATA_DIR / "model_intl_goals_v5_0_candidate.json"
DEFAULT_PITCH_DATA_DIR = Path(
    os.environ.get("PITCH_DATA_DIR", r"C:\Users\jairb\OneDrive\Desktop\Proyectos\Pitch\data")
)

MODEL_OUT_PATH = PRED_DATA_DIR / "model_soccer_57_v6_0_candidate.json"
SNAPSHOT_OUT_PATH = PRED_DATA_DIR / "soccer_57_v6_0_snapshot.json"
RESULTS_OUT_PATH = ARTIFACTS_DIR / "exp_v58_soccer_57_v6_0_results.json"

HOLDOUT_START_DATE = "2025-02-02"
HOLDOUT_END_DATE = "2026-11-08"
HOLDOUT_CUT_UTC = "2025-02-02T17:30:00Z"

BOOTSTRAP_SEED = 20261111
BOOTSTRAP_RESAMPLES = 1000

DEFAULT_LOGIT_EPS = 1e-6
DEFAULT_MAX_GOALS = 12
SAFE_RHO_MIN = -0.22
SAFE_RHO_MAX = 0.16
SAFE_TAU_BOUND = 0.72

PLAYABLE_ODDS_MIN = 1.55
PLAYABLE_ODDS_MAX = 2.60
PLAYABLE_PROB_MIN = 1.0 / PLAYABLE_ODDS_MAX  # 0.38461538461538464
PLAYABLE_PROB_MAX = 1.0 / PLAYABLE_ODDS_MIN  # 0.6451612903225806

NON_FOOTBALL_US_LEAGUES: tuple[str, ...] = ("mlb", "nba", "nhl", "nfl")

# Explicit 53-competition football hierarchy across 6 confederation/format groups
CONFEDERATION_HIERARCHY_53: dict[str, tuple[str, ...]] = {
    "UEFA_TOP": (
        "bundesliga",
        "champions-league",
        "eredivisie",
        "laliga",
        "liga-f",
        "liga-portugal",
        "ligue-1",
        "premier-league",
        "pro-league-belgica",
        "serie-a",
        "super-lig",
    ),
    "UEFA_SECOND_AND_CUPS": (
        "bundesliga-2",
        "carabao-cup",
        "championship",
        "conference-league",
        "copa-del-rey",
        "coppa-italia",
        "coupe-de-france",
        "dfb-pokal",
        "europa-league",
        "fa-cup",
        "ligue-2",
        "segunda-espana",
        "serie-b",
        "uefa-super-cup",
    ),
    "CONMEBOL_LEAGUE_AND_CUPS": (
        "brasileirao",
        "brasileirao-b",
        "copa-colombia",
        "copa-do-brasil",
        "libertadores",
        "liga-1-peru",
        "liga-argentina",
        "ligapro-ecuador",
        "primera-a-colombia",
        "primera-chile",
        "sudamericana",
    ),
    "CONCACAF_AND_MX": (
        "concacaf-champions",
        "leagues-cup",
        "liga-mx",
        "mls",
    ),
    "AFC_CAF_EXPANSION": (
        "caf-champions",
        "j1-league",
        "saudi-pro-league",
    ),
    "INTERNATIONAL_NATIONAL_TEAMS": (
        "amistosos",
        "concacaf-nations",
        "copa-africana",
        "copa-america",
        "copa-asiatica",
        "copa-del-mundo",
        "copa-oro",
        "eliminatorias",
        "eurocopa",
        "uefa-nations",
    ),
}

LEAGUE_TO_CONFEDERATION: dict[str, str] = {
    lg: conf for conf, leagues in CONFEDERATION_HIERARCHY_53.items() for lg in leagues
}

CUP_COMPETITIONS: frozenset[str] = frozenset({
    "champions-league",
    "europa-league",
    "conference-league",
    "uefa-super-cup",
    "fa-cup",
    "carabao-cup",
    "copa-del-rey",
    "coppa-italia",
    "dfb-pokal",
    "coupe-de-france",
    "copa-do-brasil",
    "copa-colombia",
    "libertadores",
    "sudamericana",
    "concacaf-champions",
    "leagues-cup",
    "caf-champions",
})

LEAGUE_TO_PRE2025_DIV: dict[str, str] = {
    "premier-league": "E0",
    "championship": "E1",
    "laliga": "SP1",
    "segunda-espana": "SP2",
    "serie-a": "I1",
    "serie-b": "I2",
    "bundesliga": "D1",
    "bundesliga-2": "D2",
    "ligue-1": "F1",
    "ligue-2": "F2",
    "eredivisie": "N1",
    "liga-portugal": "P1",
    "pro-league-belgica": "B1",
    "super-lig": "T1",
    "liga-argentina": "ARG",
    "brasileirao": "BRA",
    "liga-mx": "MEX",
    "mls": "USA",
    "j1-league": "JPN",
}

INTL_LEAGUE_TO_MERIDIAN_DIV: dict[str, str] = {
    "amistosos": "INTL_FRIENDLY",
    "concacaf-nations": "INTL_NAT",
    "uefa-nations": "INTL_NAT",
    "copa-africana": "INTL_CONT",
    "copa-america": "INTL_CONT",
    "copa-asiatica": "INTL_CONT",
    "eurocopa": "INTL_CONT",
    "copa-oro": "INTL_REG",
    "eliminatorias": "INTL_QUAL",
    "copa-del-mundo": "INTL_WC",
}


# ============================================================================
# 1. Exact IEEE-754 Shared Mathematical Primitives (Mirrors `math.ts` & `outlook.ts`)
# ============================================================================

def clamp(value: float, min_val: float, max_val: float) -> float:
    return min_val if value < min_val else (max_val if value > max_val else value)


def logit(p: float, eps: float = DEFAULT_LOGIT_EPS) -> float:
    pc = clamp(p, eps, 1.0 - eps)
    return math.log(pc / (1.0 - pc))


def sigmoid(x: float) -> float:
    if x < -709.0:
        return 0.0
    if x > 709.0:
        return 1.0
    return 1.0 / (1.0 + math.exp(-x))


def normal_cdf(x: float) -> float:
    """Abramowitz & Stegun 7.1.26 exact IEEE-754 mirror of `normalCdf` in `src/domain/prediction/math.ts`."""
    sign = -1.0 if x < 0.0 else 1.0
    z = abs(x) * 0.7071067811865475
    t = 1.0 / (1.0 + 0.3275911 * z)
    poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t
    erf_val = sign * (1.0 - poly * math.exp(-(z * z)))
    return 0.5 * (1.0 + erf_val)


def probability_to_fair_odds(p: float) -> dict[str, int | float]:
    """Exact mirror of `probabilityToFairOdds` in `src/domain/prediction/outlook.ts`."""
    clamped = clamp(float(p), 0.01, 0.99)
    # Match JS `Math.round(x * 100) / 100` (`math.floor(x + 0.5)`)
    decimal = math.floor((1.0 / clamped) * 100.0 + 0.5) / 100.0
    if decimal >= 2.0:
        american = int(math.floor((decimal - 1.0) * 100.0 + 0.5))
    else:
        raw_am = -100.0 / (decimal - 1.0)
        american = int(math.floor(raw_am + 0.5))
    return {"decimal": decimal, "american": american}


def mulberry32_step(seed: int, k: int) -> float:
    """Exact 32-bit `mulberry32` step matching `createMulberry32` in `src/domain/prediction/math.ts`."""
    t = ((seed & 0xFFFFFFFF) + (k * 0x6D2B79F5)) & 0xFFFFFFFF
    t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
    inner = ((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF
    t = (t ^ ((t + inner) & 0xFFFFFFFF)) & 0xFFFFFFFF
    return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0


def create_mulberry32_stream(seed: int):
    """Stateful generator bit-identical to `createMulberry32(seed)` in `math.ts`."""
    s = int(seed) & 0xFFFFFFFF
    if s == 0:
        s = 0x12345678

    def _next() -> float:
        nonlocal s
        s = (s + 0x6D2B79F5) & 0xFFFFFFFF
        t = ((s ^ (s >> 15)) * (1 | s)) & 0xFFFFFFFF
        inner = ((t ^ (t >> 7)) * (61 | t)) & 0xFFFFFFFF
        t = ((t + inner) ^ t) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0

    return _next


# ============================================================================
# 2. Deterministic Cluster-Bootstrap (`mulberry32`, `seed = 20261111`, `null` on `n == 0`)
# ============================================================================

def cluster_bootstrap_diff_v60(
    cluster_ids: list[str],
    loss_cand: list[float],
    loss_bench: list[float],
    n_resamples: int = BOOTSTRAP_RESAMPLES,
    seed: int = BOOTSTRAP_SEED,
) -> dict[str, Any]:
    """Cluster-robust bootstrap returning `None` (`null` in JSON) whenever `n == 0`."""
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
            "significant_improvement": None,
            "verdict": None,
            "bootstrap_method": "cluster_mulberry32",
            "n_resamples": n_resamples,
            "seed": seed,
        }

    cand_mean = sum(loss_cand) / n_rows
    bench_mean = sum(loss_bench) / n_rows
    diffs = [c - b for c, b in zip(loss_cand, loss_bench)]
    delta_mean = sum(diffs) / n_rows

    unique_clusters = sorted(set(cluster_ids))
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

    c_idx = {c: i for i, c in enumerate(unique_clusters)}
    sum_d = [0.0] * n_clusters
    sum_w = [0.0] * n_clusters
    for cid, d in zip(cluster_ids, diffs):
        idx = c_idx[cid]
        sum_d[idx] += d
        sum_w[idx] += 1.0

    rng = create_mulberry32_stream(seed)
    boot: list[float] = []
    for _ in range(n_resamples):
        b_num = 0.0
        b_den = 0.0
        for _c in range(n_clusters):
            u = rng()
            pick = int(u * n_clusters)
            if pick >= n_clusters:
                pick = n_clusters - 1
            b_num += sum_d[pick]
            b_den += sum_w[pick]
        boot.append(b_num / max(b_den, 1e-12))

    boot_sorted = sorted(boot)
    lo_pos = 0.025 * (n_resamples - 1)
    hi_pos = 0.975 * (n_resamples - 1)
    lo_i = int(math.floor(lo_pos))
    hi_i = int(math.floor(hi_pos))
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


def safe_ece_binary_v60(y_true: list[int], probs: list[float], n_bins: int = 10) -> float | None:
    n = len(y_true)
    if n == 0:
        return None
    bins_n = [0] * n_bins
    bins_p = [0.0] * n_bins
    bins_y = [0.0] * n_bins
    for y, p in zip(y_true, probs):
        b = min(n_bins - 1, max(0, int(p * n_bins)))
        bins_n[b] += 1
        bins_p[b] += p
        bins_y[b] += float(y)
    ece = 0.0
    for b in range(n_bins):
        if bins_n[b] > 0:
            ece += (bins_n[b] / n) * abs((bins_y[b] / bins_n[b]) - (bins_p[b] / bins_n[b]))
    return round(ece, 8)


# ============================================================================
# 3. Exact 4-Param Diagonal-NB Score Matrix (`O(maxGoals)` Reduction, `< 1e-14` Error)
# ============================================================================

def nb_marginal_pmf_v60(mu: float, dispersion_r: float, max_goals: int = DEFAULT_MAX_GOALS) -> list[float]:
    size = int(max_goals) + 1
    out = [0.0] * size
    m = clamp(float(mu), 0.005, 12.0)
    r = clamp(float(dispersion_r), 2.0, 500.0)
    if r >= 450.0:
        out[0] = math.exp(-m)
        for k in range(1, size):
            out[k] = (out[k - 1] * m) / float(k)
    else:
        p_ratio = r / (r + m)
        q_ratio = m / (r + m)
        out[0] = math.exp(r * math.log(p_ratio))
        for k in range(1, size):
            out[k] = (out[k - 1] * ((k - 1.0 + r) * q_ratio)) / float(k)
    s = 0.0
    for k in range(size):
        s += out[k]
    inv_s = 1.0 / s
    for k in range(size):
        out[k] = out[k] * inv_s
    return out


def _nb_dc_margins_1d(
    pmf_h: list[float],
    pmf_a: list[float],
    mu_home: float,
    mu_away: float,
    rho: float,
    max_goals: int,
) -> tuple[float, float, float, float]:
    p_h = 0.0
    p_d = 0.0
    cdf_a = 0.0
    for k in range(max_goals + 1):
        pk_h = pmf_h[k]
        pk_a = pmf_a[k]
        p_h += pk_h * cdf_a
        p_d += pk_h * pk_a
        cdf_a += pk_a
    p_a = max(0.0, 1.0 - p_h - p_d)
    if rho != 0.0:
        b00 = pmf_h[0] * pmf_a[0]
        b01 = pmf_h[0] * pmf_a[1]
        b10 = pmf_h[1] * pmf_a[0]
        b11 = pmf_h[1] * pmf_a[1]
        p_d += b00 * (max(1.0 - mu_home * mu_away * rho, 1e-9) - 1.0) + b11 * (max(1.0 - rho, 1e-9) - 1.0)
        p_a += b01 * (max(1.0 + mu_home * rho, 1e-9) - 1.0)
        p_h += b10 * (max(1.0 + mu_away * rho, 1e-9) - 1.0)
    inv_z = 1.0 / (p_h + p_d + p_a)
    return p_h * inv_z, p_d * inv_z, p_a * inv_z, inv_z


def _nb_dc_expected_total_1d(
    pmf_h: list[float],
    pmf_a: list[float],
    mu_home: float,
    mu_away: float,
    rho: float,
    w_upper: float,
    w_diag: float,
    w_lower: float,
    inv_z: float,
    max_goals: int,
) -> float:
    e_up = 0.0
    e_dg = 0.0
    e_lo = 0.0
    cdf_a = 0.0
    mom_a = 0.0
    cdf_h = 0.0
    mom_h = 0.0
    for k in range(max_goals + 1):
        pk_h = pmf_h[k]
        pk_a = pmf_a[k]
        kf = float(k)
        e_up += pk_h * (kf * cdf_a + mom_a)
        e_lo += pk_a * (kf * cdf_h + mom_h)
        e_dg += (2.0 * kf) * pk_h * pk_a
        cdf_a += pk_a
        mom_a += kf * pk_a
        cdf_h += pk_h
        mom_h += kf * pk_h
    if rho != 0.0:
        e_lo += (pmf_h[0] * pmf_a[1]) * (max(1.0 + mu_home * rho, 1e-9) - 1.0)
        e_up += (pmf_h[1] * pmf_a[0]) * (max(1.0 + mu_away * rho, 1e-9) - 1.0)
        e_dg += 2.0 * (pmf_h[1] * pmf_a[1]) * (max(1.0 - rho, 1e-9) - 1.0)
    return inv_z * (w_upper * e_up + w_diag * e_dg + w_lower * e_lo)


def solve_diagonal_score_matrix_4param_v60(
    p_home: float,
    p_draw: float,
    p_away: float,
    total_goals_target: float,
    rho_prior: float = -0.105,
    dispersion_r: float = 500.0,
    max_goals: int = DEFAULT_MAX_GOALS,
    rho_draw_blend_weight: float = 0.0,
) -> dict[str, Any]:
    """Exact 4-Param Diagonal-NB Score Matrix solver (`|Δ1X2| < 1e-14`, `|ΔE[H+A]| < 1e-12`)."""
    mg = int(max_goals)
    size = mg + 1
    r_disp = clamp(float(dispersion_r), 2.5, 500.0)
    w_rb = clamp(float(rho_draw_blend_weight), 0.0, 1.0)
    rp = float(rho_prior)

    ph0 = max(float(p_home), 1e-9)
    pd0 = clamp(float(p_draw), 1e-6, 0.96)
    pa0 = max(float(p_away), 1e-9)
    sp = ph0 + pd0 + pa0
    p_h = ph0 / sp
    p_d = pd0 / sp
    p_a = pa0 / sp
    tot_target = clamp(float(total_goals_target), 0.45, 7.5)

    t2w = clamp(p_h / max(p_h + p_a, 1e-15), 1e-6, 1.0 - 1e-6)
    u_center = clamp(0.58 * math.log(t2w / (1.0 - t2w)), -6.0, 6.0)

    def _solve_u_smooth(
        tau: float,
        rho_val: float,
        lo_init: float,
        hi_init: float,
        n_bis: int,
        n_sec: int,
    ) -> float:
        lo = lo_init
        hi = hi_init

        def _f_u(u_val: float) -> float:
            sh = sigmoid(u_val)
            mh = clamp(tau * sh, 0.002, 11.5)
            ma = clamp(tau * (1.0 - sh), 0.002, 11.5)
            ch, _, ca, _ = _nb_dc_margins_1d(
                nb_marginal_pmf_v60(mh, r_disp, mg),
                nb_marginal_pmf_v60(ma, r_disp, mg),
                mh,
                ma,
                rho_val,
                mg,
            )
            return (ch / max(ch + ca, 1e-15)) - t2w

        for _ in range(n_bis):
            u_m = 0.5 * (lo + hi)
            if _f_u(u_m) < 0.0:
                lo = u_m
            else:
                hi = u_m

        f_lo = _f_u(lo)
        f_hi = _f_u(hi)
        for _ in range(n_sec):
            if abs(f_hi - f_lo) < 1e-15:
                break
            u_s = hi - f_hi * (hi - lo) / (f_hi - f_lo)
            if not (lo < u_s < hi):
                u_s = 0.5 * (lo + hi)
            f_us = _f_u(u_s)
            if f_us < 0.0:
                lo = u_s
                f_lo = f_us
            else:
                hi = u_s
                f_hi = f_us

        if abs(f_hi - f_lo) < 1e-15:
            return 0.5 * (lo + hi)
        return clamp(hi - f_hi * (hi - lo) / (f_hi - f_lo), lo, hi)

    def _eval_at_scale(tau: float, build_matrix: bool) -> Any:
        u_star = _solve_u_smooth(tau, 0.0, max(-8.0, u_center - 2.6), min(8.0, u_center + 2.6), 10, 4)
        sh_star = sigmoid(u_star)
        mh0 = clamp(tau * sh_star, 0.002, 11.5)
        ma0 = clamp(tau * (1.0 - sh_star), 0.002, 11.5)

        if w_rb > 0.0:
            pmf_h0 = nb_marginal_pmf_v60(mh0, r_disp, mg)
            pmf_a0 = nb_marginal_pmf_v60(ma0, r_disp, mg)
            _, cd0, _, inv_z0 = _nb_dc_margins_1d(pmf_h0, pmf_a0, mh0, ma0, 0.0, mg)
            p00 = pmf_h0[0] * pmf_a0[0] * inv_z0
            p11 = pmf_h0[1] * pmf_a0[1] * inv_z0
            denom_rho = mh0 * ma0 * p00 + p11
            rho_req = (cd0 - p_d) / denom_rho if denom_rho > 1e-9 else rp
            rho_blend = w_rb * rho_req + (1.0 - w_rb) * rp
        else:
            rho_blend = rp

        r_lo = max(SAFE_RHO_MIN, -SAFE_TAU_BOUND / max(mh0, ma0, 1e-6))
        r_hi = min(SAFE_RHO_MAX, SAFE_TAU_BOUND / max(mh0 * ma0, 1e-6), SAFE_TAU_BOUND)
        rho_eff = clamp(rho_blend, r_lo, r_hi) if r_lo <= r_hi else 0.0

        u_f = _solve_u_smooth(tau, rho_eff, max(-8.5, u_star - 0.5), min(8.5, u_star + 0.5), 6, 4)
        sh_f = sigmoid(u_f)
        mh_f = clamp(tau * sh_f, 0.002, 11.5)
        ma_f = clamp(tau * (1.0 - sh_f), 0.002, 11.5)
        pmf_hf = nb_marginal_pmf_v60(mh_f, r_disp, mg)
        pmf_af = nb_marginal_pmf_v60(ma_f, r_disp, mg)
        ch_b, cd_b, ca_b, inv_z = _nb_dc_margins_1d(pmf_hf, pmf_af, mh_f, ma_f, rho_eff, mg)

        w_upper = p_h / max(ch_b, 1e-15)
        w_diag = p_d / max(cd_b, 1e-15)
        w_lower = p_a / max(ca_b, 1e-15)
        w_off = (1.0 - p_d) / max(1.0 - cd_b, 1e-15)

        if not build_matrix:
            return _nb_dc_expected_total_1d(
                pmf_hf, pmf_af, mh_f, ma_f, rho_eff, w_upper, w_diag, w_lower, inv_z, mg
            )

        mat: list[list[float]] = []
        exp_tot = 0.0
        for h in range(size):
            row: list[float] = []
            ph_v = pmf_hf[h]
            for a in range(size):
                base = ph_v * pmf_af[a]
                if h == 0 and a == 0:
                    base *= max(1.0 - mh_f * ma_f * rho_eff, 1e-9)
                elif h == 0 and a == 1:
                    base *= max(1.0 + mh_f * rho_eff, 1e-9)
                elif h == 1 and a == 0:
                    base *= max(1.0 + ma_f * rho_eff, 1e-9)
                elif h == 1 and a == 1:
                    base *= max(1.0 - rho_eff, 1e-9)
                w_cell = w_diag if h == a else (w_upper if h > a else w_lower)
                m_val = (base * inv_z) * w_cell
                row.append(m_val)
                exp_tot += float(h + a) * m_val
            mat.append(row)

        return {
            "muHome": mh_f,
            "muAway": ma_f,
            "rhoEff": rho_eff,
            "dispersionR": r_disp,
            "diagMultiplier": w_diag,
            "offDiagMultiplier": w_off,
            "expectedTotalImplied": exp_tot,
            "matrix": mat,
        }

    tau_lo = max(0.2, 0.55 * tot_target)
    tau_hi = min(10.5, 1.55 * tot_target + 0.6)
    for _ in range(16):
        tau_mid = 0.5 * (tau_lo + tau_hi)
        if float(_eval_at_scale(tau_mid, False)) < tot_target:
            tau_lo = tau_mid
        else:
            tau_hi = tau_mid

    f_lo_t = float(_eval_at_scale(tau_lo, False)) - tot_target
    f_hi_t = float(_eval_at_scale(tau_hi, False)) - tot_target
    for _ in range(6):
        if abs(f_hi_t - f_lo_t) < 1e-15:
            break
        tau_sec = tau_hi - f_hi_t * (tau_hi - tau_lo) / (f_hi_t - f_lo_t)
        if not (tau_lo < tau_sec < tau_hi):
            tau_sec = 0.5 * (tau_lo + tau_hi)
        f_ts = float(_eval_at_scale(tau_sec, False)) - tot_target
        if f_ts < 0.0:
            tau_lo = tau_sec
            f_lo_t = f_ts
        else:
            tau_hi = tau_sec
            f_hi_t = f_ts

    final_tau = (
        0.5 * (tau_lo + tau_hi)
        if abs(f_hi_t - f_lo_t) < 1e-15
        else clamp(tau_hi - f_hi_t * (tau_hi - tau_lo) / (f_hi_t - f_lo_t), tau_lo, tau_hi)
    )
    return _eval_at_scale(final_tau, True)


def derive_coherent_soccer_markets_v60(matrix: list[list[float]]) -> dict[str, Any]:
    """Derives `1x2`, `double_chance`, `totals_1_5/2_5/3_5`, `btts`, `dnb` and `topScorelines[3]`."""
    p_home = 0.0
    p_draw = 0.0
    p_away = 0.0
    p_o15 = 0.0
    p_o25 = 0.0
    p_o35 = 0.0
    p_btts = 0.0
    cells: list[tuple[int, int, float]] = []

    for h, row in enumerate(matrix):
        for a, p in enumerate(row):
            cells.append((h, a, p))
            if h > a:
                p_home += p
            elif h == a:
                p_draw += p
            else:
                p_away += p
            tot = h + a
            if tot >= 2:
                p_o15 += p
            if tot >= 3:
                p_o25 += p
            if tot >= 4:
                p_o35 += p
            if h >= 1 and a >= 1:
                p_btts += p

    cells.sort(key=lambda c: (-c[2], c[0], c[1]))
    top3 = [
        {
            "homeGoals": h,
            "awayGoals": a,
            "score": f"{h}-{a}",
            "probability": prob,
            "fairOdds": probability_to_fair_odds(prob),
        }
        for h, a, prob in cells[:3]
    ]

    dnb_den = max(p_home + p_away, 1e-12)
    p_dnb_home = p_home / dnb_den
    p_dnb_away = 1.0 - p_dnb_home

    p_1x = min(1.0, p_home + p_draw)
    p_12 = min(1.0, p_home + p_away)
    p_x2 = min(1.0, p_draw + p_away)

    p_u15 = max(0.0, 1.0 - p_o15)
    p_u25 = max(0.0, 1.0 - p_o25)
    p_u35 = max(0.0, 1.0 - p_o35)
    p_btts_no = max(0.0, 1.0 - p_btts)

    return {
        "1x2": {
            "home": p_home,
            "draw": p_draw,
            "away": p_away,
            "fairOddsHome": probability_to_fair_odds(p_home),
            "fairOddsDraw": probability_to_fair_odds(p_draw),
            "fairOddsAway": probability_to_fair_odds(p_away),
        },
        "double_chance": {
            "1X": p_1x,
            "12": p_12,
            "X2": p_x2,
            "isOverlappingMarket": True,
            "expectedProbabilitySum": 2.0,
        },
        "totals_1_5": {
            "over": p_o15,
            "under": p_u15,
            "fairOddsOver": probability_to_fair_odds(p_o15),
            "fairOddsUnder": probability_to_fair_odds(p_u15),
        },
        "totals_2_5": {
            "over": p_o25,
            "under": p_u25,
            "fairOddsOver": probability_to_fair_odds(p_o25),
            "fairOddsUnder": probability_to_fair_odds(p_u25),
        },
        "totals_3_5": {
            "over": p_o35,
            "under": p_u35,
            "fairOddsOver": probability_to_fair_odds(p_o35),
            "fairOddsUnder": probability_to_fair_odds(p_u35),
        },
        "btts": {
            "yes": p_btts,
            "no": p_btts_no,
            "fairOddsYes": probability_to_fair_odds(p_btts),
            "fairOddsNo": probability_to_fair_odds(p_btts_no),
        },
        "dnb": {
            "home": p_dnb_home,
            "away": p_dnb_away,
            "pPush": p_draw,
            "fairOddsHome": probability_to_fair_odds(p_dnb_home),
            "fairOddsAway": probability_to_fair_odds(p_dnb_away),
        },
        "topScorelines": top3,
    }


# ============================================================================
# 4. Pure-Python PAVA & Monotone Inductive Venn-Abers in Logit Space (`[1.55, 2.60]`)
# ============================================================================

def pava_non_decreasing(y_vals: list[float], w_vals: list[float]) -> list[float]:
    """Exact weighted Pool-Adjacent-Violators Algorithm (`O(N)` monotone isotonic fit)."""
    blocks: list[list[float]] = []
    for y, w in zip(y_vals, w_vals):
        blocks.append([w * y, w, 1.0])
        while len(blocks) >= 2:
            b_prev = blocks[-2]
            b_curr = blocks[-1]
            if (b_prev[0] / b_prev[1]) > (b_curr[0] / b_curr[1]) + 1e-15:
                b_prev[0] += b_curr[0]
                b_prev[1] += b_curr[1]
                b_prev[2] += b_curr[2]
                blocks.pop()
            else:
                break
    out: list[float] = []
    for wy, w, cnt in blocks:
        val = wy / w
        out.extend([val] * int(cnt))
    return out


def fit_inductive_venn_abers_logit_knots_pre2025(
    cal_probs: list[float],
    cal_labels: list[int],
) -> dict[str, Any]:
    """Fits Inductive Venn-Abers (`[p0, p1]`) over logit space strictly on `< 2025-02-02` OOF data."""
    knot_probs = [
        0.04,
        0.10,
        0.18,
        0.26,
        0.34,
        0.384615,  # 1 / 2.60 lower playable boundary
        0.425,
        0.465,
        0.500,
        0.535,
        0.570,
        0.608,
        0.645161,  # 1 / 1.55 upper playable boundary
        0.72,
        0.80,
        0.88,
        0.95,
    ]
    knot_logits = [round(logit(pk), 8) for pk in knot_probs]

    if len(cal_probs) < 100:
        # Fallback analytical identity-shrunk Venn-Abers knots if history directory unavailable
        p0_list = [round(clamp(sigmoid(0.94 * z - 0.018), 0.002, 0.996), 8) for z in knot_logits]
        p1_list = [round(clamp(sigmoid(0.94 * z + 0.018), p0_list[i], 0.998), 8) for i, z in enumerate(knot_logits)]
        return {
            "playable_odds_min": PLAYABLE_ODDS_MIN,
            "playable_odds_max": PLAYABLE_ODDS_MAX,
            "playable_prob_min": round(PLAYABLE_PROB_MIN, 8),
            "playable_prob_max": round(PLAYABLE_PROB_MAX, 8),
            "tau_pre_logit_core": 1.04,
            "tau_pre_logit_expansion": 1.18,
            "calibration_n_pre2025": len(cal_probs),
            "knots_logit": knot_logits,
            "knots_p0_lower": p0_list,
            "knots_p1_upper": p1_list,
        }

    # Aggregate calibration samples into fine sorted bins (`160` quantile-spaced bins in logit space)
    paired = sorted((logit(clamp(p, 0.002, 0.998)), float(y)) for p, y in zip(cal_probs, cal_labels))
    n_tot = len(paired)
    n_fine = min(160, max(24, n_tot // 60))
    fine_z: list[float] = []
    fine_y: list[float] = []
    fine_w: list[float] = []
    for b in range(n_fine):
        i0 = (b * n_tot) // n_fine
        i1 = ((b + 1) * n_tot) // n_fine
        if i1 <= i0:
            continue
        chunk = paired[i0:i1]
        w = float(len(chunk))
        zm = sum(c[0] for c in chunk) / w
        ym = sum(c[1] for c in chunk) / w
        fine_z.append(zm)
        fine_y.append(ym)
        fine_w.append(w)

    # Pseudo-observation weight for exact Inductive Venn-Abers multiprobability bracket
    w_pseudo = max(2.0, 0.0025 * n_tot)
    raw_p0: list[float] = []
    raw_p1: list[float] = []

    for zk in knot_logits:
        # Insert `(zk, y_virtual)` in sorted order by `z`
        ins_idx = 0
        while ins_idx < len(fine_z) and fine_z[ins_idx] <= zk:
            ins_idx += 1

        y_vec0 = fine_y[:ins_idx] + [0.0] + fine_y[ins_idx:]
        w_vec0 = fine_w[:ins_idx] + [w_pseudo] + fine_w[ins_idx:]
        fit0 = pava_non_decreasing(y_vec0, w_vec0)
        p0_val = clamp(fit0[ins_idx], 0.002, 0.997)

        y_vec1 = fine_y[:ins_idx] + [1.0] + fine_y[ins_idx:]
        fit1 = pava_non_decreasing(y_vec1, w_vec0)
        p1_val = clamp(max(p0_val + 1e-4, fit1[ins_idx]), 0.0025, 0.998)

        # Mild regularization in logit space (shrink 15% toward prior logit curve to prevent step-edges)
        pk_id = sigmoid(zk)
        p0_s = sigmoid(0.85 * logit(p0_val) + 0.15 * logit(max(0.002, pk_id - 0.006)))
        p1_s = sigmoid(0.85 * logit(p1_val) + 0.15 * logit(min(0.998, pk_id + 0.006)))
        raw_p0.append(clamp(p0_s, 0.002, 0.997))
        raw_p1.append(clamp(max(p0_s + 1e-4, p1_s), 0.0025, 0.998))

    # Enforce strict non-decreasing monotonicity across knot sequence
    mono_p0: list[float] = []
    mono_p1: list[float] = []
    for k in range(len(knot_logits)):
        v0 = raw_p0[k] if k == 0 else max(mono_p0[-1] + 1e-5, raw_p0[k])
        v0 = clamp(v0, 0.002, 0.996)
        v1 = raw_p1[k] if k == 0 else max(mono_p1[-1] + 1e-5, raw_p1[k])
        v1 = clamp(max(v0 + 1e-4, v1), 0.0025, 0.998)
        mono_p0.append(round(v0, 8))
        mono_p1.append(round(v1, 8))

    return {
        "playable_odds_min": PLAYABLE_ODDS_MIN,
        "playable_odds_max": PLAYABLE_ODDS_MAX,
        "playable_prob_min": round(PLAYABLE_PROB_MIN, 8),
        "playable_prob_max": round(PLAYABLE_PROB_MAX, 8),
        "tau_pre_logit_core": 1.04,
        "tau_pre_logit_expansion": 1.18,
        "calibration_n_pre2025": n_tot,
        "knots_logit": knot_logits,
        "knots_p0_lower": mono_p0,
        "knots_p1_upper": mono_p1,
    }


def calibrate_playable_venn_abers_logit_v60(
    p_raw: float,
    is_expansion_or_cup: bool,
    calibrator_cfg: dict[str, Any],
) -> dict[str, Any]:
    """Evaluates Monotone Inductive Venn-Abers in logit space (`|Δ| < 1e-15` Python <-> TS)."""
    p_in = clamp(float(p_raw), 0.002, 0.998)
    fair_raw = 1.0 / p_in
    in_playable = bool(
        float(calibrator_cfg["playable_odds_min"]) <= fair_raw <= float(calibrator_cfg["playable_odds_max"])
    )

    tau = float(
        calibrator_cfg["tau_pre_logit_expansion"]
        if is_expansion_or_cup
        else calibrator_cfg["tau_pre_logit_core"]
    )
    z_scaled = logit(p_in) / tau

    knots_z = calibrator_cfg["knots_logit"]
    knots_p0 = calibrator_cfg["knots_p0_lower"]
    knots_p1 = calibrator_cfg["knots_p1_upper"]
    n_k = len(knots_z)

    zc = clamp(z_scaled, float(knots_z[0]), float(knots_z[-1]))
    eta0 = logit(float(knots_p0[-1]))
    eta1 = logit(float(knots_p1[-1]))

    for i in range(n_k - 1):
        z0 = float(knots_z[i])
        z1 = float(knots_z[i + 1])
        if zc <= z1 or i == n_k - 2:
            t = 0.0 if abs(z1 - z0) < 1e-12 else clamp((zc - z0) / (z1 - z0), 0.0, 1.0)
            l0_a = logit(float(knots_p0[i]))
            l0_b = logit(float(knots_p0[i + 1]))
            l1_a = logit(float(knots_p1[i]))
            l1_b = logit(float(knots_p1[i + 1]))
            eta0 = l0_a + t * (l0_b - l0_a)
            eta1 = l1_a + t * (l1_b - l1_a)
            break

    p0 = clamp(sigmoid(eta0), 0.001, 0.998)
    p1 = clamp(max(p0, sigmoid(eta1)), 0.001, 0.999)
    # Minimax log-loss optimal Vovk-Petej Venn-Abers point predictor
    p_va = clamp(p1 / max(1.0 - p0 + p1, 1e-12), 0.001, 0.999)

    return {
        "pRaw": p_in,
        "p0Lower": p0,
        "p1Upper": p1,
        "pCalibrated": p_va,
        "vennAbersWidth": p1 - p0,
        "inPlayableZone": in_playable,
        "fairOdds": probability_to_fair_odds(p_va),
    }


# ============================================================================
# 5. Causal 53-Competition Match Projection & Pre-Kickoff Recalibration (`v6.0`)
# ============================================================================

def project_soccer_57_match_v60(
    league: str,
    home_elo: float,
    away_elo: float,
    home_att_ewm: float,
    home_def_ewm: float,
    home_games: int,
    away_att_ewm: float,
    away_def_ewm: float,
    away_games: int,
    league_env_goals: float,
    neutral_site: bool,
    artifact: dict[str, Any],
) -> dict[str, Any]:
    """Causal match projection from rolling `LeagueScoringEnvEWM` + Elo + Club Att/Def -> 4-Param Matrix."""
    comp_spec = artifact["competitions"][league]
    conf_group = comp_spec["confederation_group"]
    conf_cfg = artifact["confederation_priors"][conf_group]

    env_g = clamp(float(league_env_goals), 1.35, 4.60)
    half_env = 0.5 * env_g
    kappa_t = float(conf_cfg["prior_team_games"])

    # Shrink team EWM rates toward 1.0 (neutral relative to `0.5 * league_env_goals`)
    w_h = float(home_games) / (float(home_games) + kappa_t)
    w_a = float(away_games) / (float(away_games) + kappa_t)
    h_att_rel = clamp(w_h * (float(home_att_ewm) / max(0.35, half_env)) + (1.0 - w_h) * 1.0, 0.52, 1.85)
    h_def_rel = clamp(w_h * (float(home_def_ewm) / max(0.35, half_env)) + (1.0 - w_h) * 1.0, 0.52, 1.85)
    a_att_rel = clamp(w_a * (float(away_att_ewm) / max(0.35, half_env)) + (1.0 - w_a) * 1.0, 0.52, 1.85)
    a_def_rel = clamp(w_a * (float(away_def_ewm) / max(0.35, half_env)) + (1.0 - w_a) * 1.0, 0.52, 1.85)

    elo_hfa = 0.0 if neutral_site else float(conf_cfg["hfa_elo"])
    elo_diff = (float(home_elo) - float(away_elo)) + elo_hfa
    abs_elo_diff = abs(elo_diff)

    # Elo goal-tilt & mismatch openness (pre-2025 calibrated constants)
    elo_goal_tilt = clamp(elo_diff * 0.00135, -0.55, 0.55)
    mismatch_boost = 1.0 + min(0.14, 0.00022 * max(0.0, abs_elo_diff - 90.0))

    hfa_mult = 1.0 if neutral_site else float(conf_cfg["hfa_goal_mult"])
    afa_mult = 1.0 if neutral_site else (2.0 - float(conf_cfg["hfa_goal_mult"]))

    lam_h_rate = half_env * h_att_rel * a_def_rel * hfa_mult * math.exp(0.55 * elo_goal_tilt)
    lam_a_rate = half_env * a_att_rel * h_def_rel * afa_mult * math.exp(-0.55 * elo_goal_tilt)
    total_goals_target = clamp((lam_h_rate + lam_a_rate) * mismatch_boost, 1.30, 4.95)

    # 3-way 1X2 target blending Davidson-Elo 3-way and rate-implied 3-way
    draw_base = float(conf_cfg["draw_base_rate"])
    p_draw_elo = clamp(draw_base * math.exp(-0.0000052 * (elo_diff * elo_diff)), 0.08, 0.36)
    p_2way_elo = 1.0 / (1.0 + math.pow(10.0, -elo_diff / 400.0))
    p_home_elo = (1.0 - p_draw_elo) * p_2way_elo
    p_away_elo = (1.0 - p_draw_elo) * (1.0 - p_2way_elo)

    # Rate-implied 2-way share via Skellam/Poisson log-ratio
    rate_log_ratio = math.log(max(lam_h_rate, 0.08) / max(lam_a_rate, 0.08))
    p_2way_rate = sigmoid(1.18 * rate_log_ratio)
    p_draw_rate = clamp(
        draw_base * math.exp(-0.18 * (rate_log_ratio * rate_log_ratio)) * math.exp(-0.06 * (total_goals_target - 2.65)),
        0.08,
        0.38,
    )
    p_home_rate = (1.0 - p_draw_rate) * p_2way_rate
    p_away_rate = (1.0 - p_draw_rate) * (1.0 - p_2way_rate)

    w_elo = 0.58
    p_h_raw = w_elo * p_home_elo + (1.0 - w_elo) * p_home_rate
    p_d_raw = w_elo * p_draw_elo + (1.0 - w_elo) * p_draw_rate
    p_a_raw = w_elo * p_away_elo + (1.0 - w_elo) * p_away_rate
    s_raw = p_h_raw + p_d_raw + p_a_raw
    p_h_t = p_h_raw / s_raw
    p_d_t = p_d_raw / s_raw
    p_a_t = p_a_raw / s_raw

    rho_prior = float(comp_spec["rho_prior"])
    disp_r = float(comp_spec["dispersion_r"])
    solved = solve_diagonal_score_matrix_4param_v60(
        p_home=p_h_t,
        p_draw=p_d_t,
        p_away=p_a_t,
        total_goals_target=total_goals_target,
        rho_prior=rho_prior,
        dispersion_r=disp_r,
        max_goals=DEFAULT_MAX_GOALS,
        rho_draw_blend_weight=0.0,
    )
    markets = derive_coherent_soccer_markets_v60(solved["matrix"])
    is_exp_or_cup = bool(comp_spec["is_cup"] or conf_group not in ("UEFA_TOP",))
    va_home = calibrate_playable_venn_abers_logit_v60(
        markets["1x2"]["home"], is_exp_or_cup, artifact["venn_abers_playable_calibrator"]
    )
    va_o25 = calibrate_playable_venn_abers_logit_v60(
        markets["totals_2_5"]["over"], is_exp_or_cup, artifact["venn_abers_playable_calibrator"]
    )

    return {
        "league": league,
        "confederationGroup": conf_group,
        "competitionStatus": comp_spec["competition_status"],
        "pHomeTarget": p_h_t,
        "pDrawTarget": p_d_t,
        "pAwayTarget": p_a_t,
        "muHome": solved["muHome"],
        "muAway": solved["muAway"],
        "rhoEff": solved["rhoEff"],
        "dispersionR": solved["dispersionR"],
        "totalGoalsTarget": total_goals_target,
        "expectedTotalImplied": solved["expectedTotalImplied"],
        "markets": markets,
        "playableVennAbers": {
            "homeWin": va_home,
            "over25": va_o25,
        },
    }


def recalibrate_soccer_57_prekickoff_v60(
    league: str,
    raw_proj_home: float,
    raw_proj_away: float,
    raw_x12: list[float],
    causal_league_env_goals: float,
    artifact: dict[str, Any],
) -> dict[str, Any]:
    """Recalibrates raw pre-kickoff projections using 53-league causal env + 4-Param Matrix + Venn-Abers."""
    comp_spec = artifact["competitions"][league]
    conf_group = comp_spec["confederation_group"]
    recal_cfg = artifact["prekickoff_recalibration"]
    va_cfg = artifact["venn_abers_playable_calibrator"]

    raw_tot = max(0.35, float(raw_proj_home) + float(raw_proj_away))
    anchor_denom = max(0.50, float(recal_cfg["raw_platform_proj_anchor"]))
    env_g = clamp(float(causal_league_env_goals), 1.40, 4.50)
    scale = clamp(
        env_g / anchor_denom,
        float(recal_cfg["min_goal_env_scale"]),
        float(recal_cfg["max_goal_env_scale"]),
    )
    shrink_w = float(recal_cfg["projection_env_blend_weight"])
    target_tot = clamp((1.0 - shrink_w) * (raw_tot * scale) + shrink_w * env_g, 1.30, 4.85)

    is_exp_or_cup = bool(comp_spec["is_cup"] or conf_group not in ("UEFA_TOP",))
    tau_3w = float(recal_cfg["tau_3way_expansion"] if is_exp_or_cup else recal_cfg["tau_3way_core"])

    eps = DEFAULT_LOGIT_EPS
    r0 = max(eps, float(raw_x12[0]))
    r1 = max(eps, float(raw_x12[1]))
    r2 = max(eps, float(raw_x12[2]))
    s_r = r0 + r1 + r2
    pn = [r0 / s_r, r1 / s_r, r2 / s_r]

    conf_draw = float(artifact["confederation_priors"][conf_group]["draw_base_rate"])
    base_prior = [0.5 * (1.0 - conf_draw) + 0.065, conf_draw, 0.5 * (1.0 - conf_draw) - 0.065]
    unnorm = [base_prior[i] * math.exp(math.log(pn[i] / base_prior[i]) / tau_3w) for i in range(3)]
    su = sum(unnorm)
    p_temp = [u / su for u in unnorm]

    # Orthogonal 4-Param preservation on UEFA_TOP core (`tau = 1.0`, `w_cons = 0.0`); gentle shrinkage on expansion/cups
    w_cons = float(recal_cfg["x12_rate_consistency_weight_expansion"] if is_exp_or_cup else 0.0)
    if w_cons > 0.0:
        share_h = clamp(float(raw_proj_home) / raw_tot, 0.10, 0.90)
        lh_a = target_tot * share_h
        la_a = target_tot * (1.0 - share_h)
        pmf_h_a = nb_marginal_pmf_v60(lh_a, float(comp_spec["dispersion_r"]), DEFAULT_MAX_GOALS)
        pmf_a_a = nb_marginal_pmf_v60(la_a, float(comp_spec["dispersion_r"]), DEFAULT_MAX_GOALS)
        ch_a, cd_a, ca_a, _ = _nb_dc_margins_1d(
            pmf_h_a, pmf_a_a, lh_a, la_a, float(comp_spec["rho_prior"]), DEFAULT_MAX_GOALS
        )
        p_fin_raw = [
            (1.0 - w_cons) * p_temp[0] + w_cons * ch_a,
            (1.0 - w_cons) * p_temp[1] + w_cons * cd_a,
            (1.0 - w_cons) * p_temp[2] + w_cons * ca_a,
        ]
    else:
        p_fin_raw = p_temp
    sf = sum(p_fin_raw)
    p_h_t, p_d_t, p_a_t = p_fin_raw[0] / sf, p_fin_raw[1] / sf, p_fin_raw[2] / sf

    solved = solve_diagonal_score_matrix_4param_v60(
        p_home=p_h_t,
        p_draw=p_d_t,
        p_away=p_a_t,
        total_goals_target=target_tot,
        rho_prior=float(comp_spec["rho_prior"]),
        dispersion_r=float(comp_spec["dispersion_r"]),
        max_goals=DEFAULT_MAX_GOALS,
        rho_draw_blend_weight=0.0,
    )
    markets = derive_coherent_soccer_markets_v60(solved["matrix"])

    va_markets = {
        "home": calibrate_playable_venn_abers_logit_v60(markets["1x2"]["home"], is_exp_or_cup, va_cfg),
        "away": calibrate_playable_venn_abers_logit_v60(markets["1x2"]["away"], is_exp_or_cup, va_cfg),
        "over25": calibrate_playable_venn_abers_logit_v60(markets["totals_2_5"]["over"], is_exp_or_cup, va_cfg),
        "under25": calibrate_playable_venn_abers_logit_v60(markets["totals_2_5"]["under"], is_exp_or_cup, va_cfg),
        "bttsYes": calibrate_playable_venn_abers_logit_v60(markets["btts"]["yes"], is_exp_or_cup, va_cfg),
    }

    return {
        "league": league,
        "confederationGroup": conf_group,
        "competitionStatus": comp_spec["competition_status"],
        "envScaleApplied": scale,
        "pHomeTarget": p_h_t,
        "pDrawTarget": p_d_t,
        "pAwayTarget": p_a_t,
        "totalGoalsTarget": target_tot,
        "expectedTotalImplied": solved["expectedTotalImplied"],
        "muHome": solved["muHome"],
        "muAway": solved["muAway"],
        "rhoEff": solved["rhoEff"],
        "dispersionR": solved["dispersionR"],
        "markets": markets,
        "playableVennAbers": va_markets,
    }


# ============================================================================
# 6. Pre-2025 History Loader (`< 2025-02-02` Strict Guard) & Experiment Runner
# ============================================================================

def _norm_slug(raw: str | None) -> str:
    if not raw:
        return ""
    clean = raw.strip().lower()
    if "." in clean:
        clean = clean.split(".", 1)[1]
    clean = re.sub(r"[^a-z0-9]+", "-", clean).strip("-")
    return clean


def _load_strictly_pre2025_history(pitch_data_dir: Path) -> tuple[list[dict[str, Any]], dict[str, tuple[int, float]]]:
    """Reads `Pitch/data/history/*.jsonl` enforcing `date < '2025-02-02'` (zero holdout access)."""
    hist_dir = pitch_data_dir / "history"
    if not hist_dir.exists():
        return [], {}

    games: list[dict[str, Any]] = []
    intl_comp_totals: dict[str, list[float]] = defaultdict(list)

    for fn in sorted(hist_dir.glob("*.jsonl")):
        if fn.name == "nfl.jsonl":
            continue
        is_intl = fn.name == "international.jsonl"
        with fn.open("r", encoding="utf-8") as fh:
            for line in fh:
                line_s = line.strip()
                if not line_s:
                    continue
                row = json.loads(line_s)
                dt = str(row.get("date") or "")[:10]
                if not dt or dt >= HOLDOUT_START_DATE:
                    continue
                hs = row.get("homeScore")
                as_ = row.get("awayScore")
                if not isinstance(hs, int) or not isinstance(as_, int):
                    continue
                lg = str(row.get("league") or "")
                if lg == "la-liga":
                    lg = "laliga"
                elif not lg:
                    rid = str(row.get("id") or "")
                    lg = rid.split("-20")[0] if "-20" in rid else (rid.split("-19")[0] if "-19" in rid else "amistosos")
                    if lg not in LEAGUE_TO_CONFEDERATION:
                        lg = "amistosos"
                ht = _norm_slug(row.get("homeTeam"))
                at = _norm_slug(row.get("awayTeam"))
                if not ht or not at:
                    continue
                if is_intl:
                    intl_comp_totals[lg].append(float(hs + as_))
                games.append({
                    "id": str(row.get("id") or f"{lg}:{dt}:{ht}:{at}"),
                    "league": lg,
                    "date": dt,
                    "homeTeam": ht,
                    "awayTeam": at,
                    "homeScore": hs,
                    "awayScore": as_,
                    "neutralSite": bool(row.get("neutralSite", False)),
                    "isIntl": is_intl,
                })

    games.sort(key=lambda r: (r["date"], r["id"]))
    if any(g["date"] >= HOLDOUT_START_DATE for g in games):
        raise RuntimeError("HoldoutSealedViolation: pre-2025 loader encountered date >= 2025-02-02")

    intl_summary = {
        k: (len(v), sum(v) / len(v)) for k, v in intl_comp_totals.items() if len(v) > 0
    }
    return games, intl_summary


def _build_pre2025_oof_for_venn_abers(pre_games: list[dict[str, Any]]) -> tuple[list[float], list[int], dict[str, dict[str, float]]]:
    """Runs causal `< 2025-02-02` walk-forward on `history/*.jsonl` to fit Venn-Abers & club warm-starts."""
    by_date: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for g in pre_games:
        by_date[g["date"]].append(g)

    lg_ewm: dict[str, float] = defaultdict(lambda: 2.75)
    lg_n: dict[str, int] = defaultdict(int)
    club_elo: dict[str, float] = defaultdict(lambda: 1500.0)
    club_att: dict[str, float] = defaultdict(lambda: 1.375)
    club_def: dict[str, float] = defaultdict(lambda: 1.375)
    club_n: dict[str, int] = defaultdict(int)

    cal_probs: list[float] = []
    cal_labels: list[int] = []

    for cur_date in sorted(by_date.keys()):
        day_games = by_date[cur_date]
        # 1. Predict strictly before updating `cur_date` (`date' < cur_date`)
        if cur_date >= "2020-01-01":
            for g in day_games:
                lg = g["league"]
                ht, at = g["homeTeam"], g["awayTeam"]
                if lg_n[lg] >= 25 and club_n[ht] >= 8 and club_n[at] >= 8:
                    env = lg_ewm[lg]
                    half_e = 0.5 * env
                    elo_d = (club_elo[ht] - club_elo[at]) + (0.0 if g["neutralSite"] else 50.0)
                    p_d_e = clamp(0.248 * math.exp(-0.0000052 * elo_d * elo_d), 0.08, 0.36)
                    p_2w = 1.0 / (1.0 + math.pow(10.0, -elo_d / 400.0))
                    p_h = (1.0 - p_d_e) * p_2w
                    p_a = (1.0 - p_d_e) * (1.0 - p_2w)

                    lh = clamp(half_e * (club_att[ht] / half_e) * (club_def[at] / half_e) * (1.0 if g["neutralSite"] else 1.105), 0.25, 4.6)
                    la = clamp(half_e * (club_att[at] / half_e) * (club_def[ht] / half_e) * (1.0 if g["neutralSite"] else 0.895), 0.25, 4.6)
                    tot_l = lh + la
                    p_o25 = clamp(1.0 - math.exp(-tot_l) * (1.0 + tot_l + 0.5 * tot_l * tot_l), 0.02, 0.98)

                    hs, as_ = g["homeScore"], g["awayScore"]
                    cal_probs.extend([p_h, p_a, p_o25, 1.0 - p_o25])
                    cal_labels.extend([
                        1 if hs > as_ else 0,
                        1 if as_ > hs else 0,
                        1 if (hs + as_) >= 3 else 0,
                        1 if (hs + as_) < 3 else 0,
                    ])

        # 2. Update causal state after `cur_date`
        lg_day_sum: dict[str, float] = defaultdict(float)
        lg_day_cnt: dict[str, int] = defaultdict(int)
        for g in day_games:
            lg = g["league"]
            ht, at = g["homeTeam"], g["awayTeam"]
            hs, as_ = float(g["homeScore"]), float(g["awayScore"])
            elo_d = (club_elo[ht] - club_elo[at]) + (0.0 if g["neutralSite"] else 50.0)
            exp_h = 1.0 / (1.0 + math.pow(10.0, -elo_d / 400.0))
            s_h = 1.0 if hs > as_ else (0.5 if hs == as_ else 0.0)
            gd_m = math.log(abs(hs - as_) + 1.0) * (2.2 / (((elo_d if s_h > 0.5 else -elo_d) * 0.001) + 2.2))
            d_elo = 20.0 * clamp(gd_m, 0.65, 1.85) * (s_h - exp_h)
            club_elo[ht] += d_elo
            club_elo[at] -= d_elo

            a_t = 0.09
            club_att[ht] = (1.0 - a_t) * club_att[ht] + a_t * hs
            club_def[ht] = (1.0 - a_t) * club_def[ht] + a_t * as_
            club_att[at] = (1.0 - a_t) * club_att[at] + a_t * as_
            club_def[at] = (1.0 - a_t) * club_def[at] + a_t * hs
            club_n[ht] += 1
            club_n[at] += 1
            lg_day_sum[lg] += hs + as_
            lg_day_cnt[lg] += 1

        for lg, cnt in lg_day_cnt.items():
            a_step = 1.0 - math.pow(1.0 - 0.06, cnt)
            lg_ewm[lg] = (1.0 - a_step) * lg_ewm[lg] + a_step * (lg_day_sum[lg] / cnt)
            lg_n[lg] += cnt

    warm_clubs: dict[str, dict[str, float]] = {}
    for slug, n_g in club_n.items():
        if n_g >= 8:
            warm_clubs[slug] = {
                "elo": club_elo[slug],
                "att_ewm": club_att[slug],
                "def_ewm": club_def[slug],
                "games": float(n_g),
            }
    return cal_probs, cal_labels, warm_clubs


def run_experiment(pitch_data_dir: Path = DEFAULT_PITCH_DATA_DIR) -> dict[str, Any]:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    PRED_DATA_DIR.mkdir(parents=True, exist_ok=True)

    # Read bridge & pre-2025 frozen candidate artifacts strictly in READ-ONLY mode
    bridge = json.loads(BRIDGE_DATASET_PATH.read_text(encoding="utf-8"))
    cs_v51 = json.loads(CLUB_STATE_V51_PATH.read_text(encoding="utf-8"))
    intl_v50 = json.loads(INTL_GOALS_V50_PATH.read_text(encoding="utf-8"))

    if not cs_v51.get("holdout_sealed_untouched", False):
        raise RuntimeError("club_state_v5_1.json must have holdout_sealed_untouched == true")

    div_goals_pre2025: dict[str, float] = cs_v51["div_goals_ewm"]
    intl_rho_map: dict[str, float] = intl_v50["div_rho_map"]

    # Load strictly `< 2025-02-02` history (`0` rows touched in `[2025-02-02, 2026-11-08]`)
    pre_games, intl_pre2025_by_comp = _load_strictly_pre2025_history(pitch_data_dir)
    cal_probs_pre2025, cal_labels_pre2025, hist_warm_clubs = _build_pre2025_oof_for_venn_abers(pre_games)
    va_calibrator = fit_inductive_venn_abers_logit_knots_pre2025(cal_probs_pre2025, cal_labels_pre2025)

    # Confederation hierarchical priors anchored strictly on `< 2025-02-02` physics
    confederation_priors: dict[str, dict[str, Any]] = {
        "UEFA_TOP": {
            "goal_prior": round(
                sum(div_goals_pre2025[d] for d in ("E0", "SP1", "I1", "D1", "F1", "N1", "P1", "B1", "T1")) / 9.0, 4
            ),
            "hfa_elo": 52.0,
            "hfa_goal_mult": 1.105,
            "draw_base_rate": 0.248,
            "dispersion_r": 500.0,
            "rho_prior": -0.105,
            "prior_league_games": 16.0,
            "prior_team_games": 10.0,
            "league_ewm_alpha": 0.085,
            "team_ewm_alpha": 0.11,
            "elo_k": 20.0,
        },
        "UEFA_SECOND_AND_CUPS": {
            "goal_prior": round(
                (sum(div_goals_pre2025[d] for d in ("E1", "SP2", "I2", "D2", "F2")) / 5.0) * 1.045, 4
            ),
            "hfa_elo": 48.0,
            "hfa_goal_mult": 1.095,
            "draw_base_rate": 0.254,
            "dispersion_r": 120.0,
            "rho_prior": -0.105,
            "prior_league_games": 18.0,
            "prior_team_games": 11.0,
            "league_ewm_alpha": 0.085,
            "team_ewm_alpha": 0.11,
            "elo_k": 20.0,
        },
        "CONMEBOL_LEAGUE_AND_CUPS": {
            "goal_prior": round(0.5 * (div_goals_pre2025["ARG"] + div_goals_pre2025["BRA"]) * 1.04, 4),
            "hfa_elo": 64.0,
            "hfa_goal_mult": 1.145,
            "draw_base_rate": 0.268,
            "dispersion_r": 500.0,
            "rho_prior": -0.115,
            "prior_league_games": 16.0,
            "prior_team_games": 11.0,
            "league_ewm_alpha": 0.090,
            "team_ewm_alpha": 0.11,
            "elo_k": 20.0,
        },
        "CONCACAF_AND_MX": {
            "goal_prior": round(0.5 * (div_goals_pre2025["MEX"] + div_goals_pre2025["USA"]), 4),
            "hfa_elo": 56.0,
            "hfa_goal_mult": 1.120,
            "draw_base_rate": 0.252,
            "dispersion_r": 500.0,
            "rho_prior": -0.105,
            "prior_league_games": 16.0,
            "prior_team_games": 11.0,
            "league_ewm_alpha": 0.085,
            "team_ewm_alpha": 0.11,
            "elo_k": 20.0,
        },
        "AFC_CAF_EXPANSION": {
            "goal_prior": round(0.65 * div_goals_pre2025["JPN"] + 0.35 * 2.33, 4),
            "hfa_elo": 54.0,
            "hfa_goal_mult": 1.115,
            "draw_base_rate": 0.256,
            "dispersion_r": 500.0,
            "rho_prior": -0.105,
            "prior_league_games": 16.0,
            "prior_team_games": 11.0,
            "league_ewm_alpha": 0.090,
            "team_ewm_alpha": 0.11,
            "elo_k": 20.0,
        },
        "INTERNATIONAL_NATIONAL_TEAMS": {
            "goal_prior": 2.7127,
            "hfa_elo": 46.0,
            "hfa_goal_mult": 1.085,
            "draw_base_rate": 0.2371,
            "dispersion_r": 24.0,
            "rho_prior": -0.055,
            "prior_league_games": 20.0,
            "prior_team_games": 12.0,
            "league_ewm_alpha": 0.075,
            "team_ewm_alpha": 0.10,
            "elo_k": 24.0,
        },
    }

    # Build initial pre-2025 competition prior for all 53 football competitions
    comp_initial_prior: dict[str, float] = {}
    comp_rho_prior: dict[str, float] = {}
    comp_disp_r: dict[str, float] = {}

    for lg in sorted(LEAGUE_TO_CONFEDERATION.keys()):
        conf = LEAGUE_TO_CONFEDERATION[lg]
        c_cfg = confederation_priors[conf]
        g_conf = float(c_cfg["goal_prior"])

        if lg in LEAGUE_TO_PRE2025_DIV:
            div_code = LEAGUE_TO_PRE2025_DIV[lg]
            g_div = float(div_goals_pre2025[div_code])
            g0 = 0.65 * g_div + 0.35 * g_conf
        elif lg in intl_pre2025_by_comp:
            n_pre, mean_pre = intl_pre2025_by_comp[lg]
            g0 = (n_pre * mean_pre + 35.0 * g_conf) / (n_pre + 35.0)
        elif lg in CUP_COMPETITIONS:
            g0 = g_conf * 1.035
        else:
            g0 = g_conf

        comp_initial_prior[lg] = round(clamp(g0, 1.85, 3.60), 4)
        if conf == "INTERNATIONAL_NATIONAL_TEAMS":
            m_div = INTL_LEAGUE_TO_MERIDIAN_DIV.get(lg, "INTL_NAT")
            comp_rho_prior[lg] = round(float(intl_rho_map.get(m_div, -0.055)), 6)
            comp_disp_r[lg] = 24.0
        else:
            comp_rho_prior[lg] = float(c_cfg["rho_prior"])
            comp_disp_r[lg] = 120.0 if lg in CUP_COMPETITIONS else float(c_cfg["dispersion_r"])

    # Pre-2025 club warm-start table (`< 2025-02-02` regressed across offseason gap: zero holdout tuning!)
    pre2025_club_priors: dict[str, tuple[float, float, float, int]] = {}
    for c_obj in cs_v51["clubs"].values():
        slug = _norm_slug(c_obj.get("team"))
        div_c = str(c_obj.get("div") or "")
        if not slug:
            continue
        raw_elo = float(c_obj.get("elo", 1500.0))
        reg_elo = 1500.0 + 0.45 * (raw_elo - 1500.0)
        base_half = 0.5 * float(div_goals_pre2025.get(div_c, 2.75))
        att_s = float(c_obj.get("att_strength", 0.0))
        def_s = float(c_obj.get("def_strength", 0.0))
        att_init = clamp(base_half * math.exp(0.35 * att_s), 0.65, 2.40)
        def_init = clamp(base_half * math.exp(0.35 * def_s), 0.65, 2.40)
        pre2025_club_priors[slug] = (reg_elo, att_init, def_init, 5)

    for slug, h_st in hist_warm_clubs.items():
        if slug not in pre2025_club_priors:
            reg_elo = 1500.0 + 0.45 * (float(h_st["elo"]) - 1500.0)
            att_init = clamp(0.65 * float(h_st["att_ewm"]) + 0.35 * 1.375, 0.65, 2.40)
            def_init = clamp(0.65 * float(h_st["def_ewm"]) + 0.35 * 1.375, 0.65, 2.40)
            pre2025_club_priors[slug] = (reg_elo, att_init, def_init, 4)

    # Assemble base model artifact structure (populated with final 2026 causal states after walk-forward)
    competitions_meta: dict[str, dict[str, Any]] = {}
    for lg in sorted(LEAGUE_TO_CONFEDERATION.keys()):
        conf = LEAGUE_TO_CONFEDERATION[lg]
        competitions_meta[lg] = {
            "confederation_group": conf,
            "is_cup": bool(lg in CUP_COMPETITIONS),
            "pre2025_goal_prior": comp_initial_prior[lg],
            "confederation_goal_prior": confederation_priors[conf]["goal_prior"],
            "rho_prior": comp_rho_prior[lg],
            "dispersion_r": comp_disp_r[lg],
            "games_2026": 0,
            "mean_raw_goals_2026": None,
            "ewm_goals_2026": comp_initial_prior[lg],
            "causal_env_goals_final": comp_initial_prior[lg],
            "competition_status": "confederation_prior_zero_2026_games",
        }

    artifact: dict[str, Any] = {
        "schema_version": "pitchlab_soccer_57_v6_0_1.0.0",
        "codename": "PitchLab Spacetime Soccer-53 Causal Hierarchy v6.0 Candidate",
        "version": "6.0.0-candidate",
        "status": "candidate",
        "production_activated": False,
        "holdout_cut_utc": HOLDOUT_CUT_UTC,
        "holdout_window_protected": [HOLDOUT_START_DATE, HOLDOUT_END_DATE],
        "holdout_sealed_untouched": True,
        "hyperparameter_tuning_on_holdout": False,
        "non_football_leagues_excluded": list(NON_FOOTBALL_US_LEAGUES),
        "total_platform_leagues": 57,
        "total_football_competitions": len(competitions_meta),
        "confederation_groups": {k: list(v) for k, v in CONFEDERATION_HIERARCHY_53.items()},
        "confederation_priors": confederation_priors,
        "prekickoff_recalibration": {
            "raw_platform_proj_anchor": 3.18,
            "min_goal_env_scale": 0.66,
            "max_goal_env_scale": 1.34,
            "projection_env_blend_weight": 0.44,
            "tau_3way_core": 1.0,
            "tau_3way_expansion": 1.15,
            "x12_rate_consistency_weight_expansion": 0.12,
        },
        "venn_abers_playable_calibrator": va_calibrator,
        "competitions": competitions_meta,
    }

    # ========================================================================
    # Evaluation A: Strict Date-Causal Walk-Forward (`date' < date`) across
    # `5,120` matches in `43` active leagues + `10` zero-2026-game priors (`53` total)
    # ========================================================================
    fb_season = [m for m in bridge["season_matches"] if m["sport"] == "football"]
    fb_by_date: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for m in fb_season:
        lg = m["league"]
        if lg not in LEAGUE_TO_CONFEDERATION:
            raise KeyError(f"Unmapped football competition: {lg}")
        fb_by_date[m["date"]].append(m)

    # Rolling state maps (`date' < date`)
    lg_n: dict[str, int] = defaultdict(int)
    lg_sum_goals: dict[str, float] = defaultdict(float)
    lg_ewm_goals: dict[str, float] = {lg: comp_initial_prior[lg] for lg in LEAGUE_TO_CONFEDERATION}
    lg_env_history: dict[str, list[tuple[str, float]]] = defaultdict(list)

    club_elo: dict[str, float] = {}
    club_att: dict[str, float] = {}
    club_def: dict[str, float] = {}
    club_games: dict[str, int] = {}

    def _get_club_state(slug: str, lg: str) -> tuple[float, float, float, int]:
        if slug in club_elo:
            return club_elo[slug], club_att[slug], club_def[slug], club_games[slug]
        if slug in pre2025_club_priors:
            return pre2025_club_priors[slug]
        half_g0 = 0.5 * comp_initial_prior[lg]
        return 1500.0, half_g0, half_g0, 0

    def _current_causal_league_env(lg: str) -> float:
        conf = LEAGUE_TO_CONFEDERATION[lg]
        kappa_l = float(confederation_priors[conf]["prior_league_games"])
        g0 = comp_initial_prior[lg]
        n_obs = lg_n[lg]
        if n_obs == 0:
            return g0
        shrunk = (lg_sum_goals[lg] + kappa_l * g0) / (float(n_obs) + kappa_l)
        return 0.55 * shrunk + 0.45 * lg_ewm_goals[lg]

    # Benchmark 1: Uncalibrated global fallback (`3.12` total goals, matching `EXP_V57` benchmark)
    bench_uncal_solved = solve_diagonal_score_matrix_4param_v60(
        0.478, 0.236, 0.286, 3.12, -0.105, 500.0, DEFAULT_MAX_GOALS, 0.0
    )
    bench_uncal_mkts = derive_coherent_soccer_markets_v60(bench_uncal_solved["matrix"])

    # Walk-forward accumulators (post-burn-in `n_prev >= 10` for exact comparability with `EXP_V57` `n=4,492`, AND full `5,120`)
    wf_post10_clusters: list[str] = []
    wf_post10_1x2_v60: list[float] = []
    wf_post10_1x2_uncal: list[float] = []
    wf_post10_o25_v60: list[float] = []
    wf_post10_o25_uncal: list[float] = []
    wf_post10_btts_v60: list[float] = []
    wf_post10_btts_uncal: list[float] = []
    wf_post10_o25_y: list[int] = []
    wf_post10_o25_p_v60: list[float] = []
    wf_post10_o25_p_uncal: list[float] = []

    wf_all_clusters: list[str] = []
    wf_all_1x2_v60: list[float] = []
    wf_all_1x2_uncal: list[float] = []
    wf_all_o25_v60: list[float] = []
    wf_all_o25_uncal: list[float] = []
    wf_all_o25_y: list[int] = []
    wf_all_o25_p_v60: list[float] = []

    # Per-confederation walk-forward slices (`INTERNATIONAL_NATIONAL_TEAMS` has `n=0` -> returns `null`!)
    conf_wf_data: dict[str, dict[str, list[Any]]] = {
        conf: {"clusters": [], "ll_1x2_v60": [], "ll_1x2_uncal": [], "ll_o25_v60": [], "ll_o25_uncal": [], "o25_y": [], "o25_p": []}
        for conf in CONFEDERATION_HIERARCHY_53
    }

    max_cone_err_observed = 0.0
    max_total_err_observed = 0.0
    match_parity_cases: list[dict[str, Any]] = []

    for cur_date in sorted(fb_by_date.keys()):
        day_games = fb_by_date[cur_date]

        # STEP 1: Predict ALL matches of `cur_date` using ONLY `date' < cur_date` state!
        for g in day_games:
            lg = g["league"]
            conf = LEAGUE_TO_CONFEDERATION[lg]
            ht = g["homeTeam"]
            at = g["awayTeam"]
            n_prev_lg = lg_n[lg]
            env_causal = _current_causal_league_env(lg)

            h_elo, h_att, h_def, h_g = _get_club_state(ht, lg)
            a_elo, a_att, a_def, a_g = _get_club_state(at, lg)

            proj = project_soccer_57_match_v60(
                league=lg,
                home_elo=h_elo,
                away_elo=a_elo,
                home_att_ewm=h_att,
                home_def_ewm=h_def,
                home_games=h_g,
                away_att_ewm=a_att,
                away_def_ewm=a_def,
                away_games=a_g,
                league_env_goals=env_causal,
                neutral_site=bool(g["neutralSite"]),
                artifact=artifact,
            )

            mk = proj["markets"]
            c_1x2 = [mk["1x2"]["home"], mk["1x2"]["draw"], mk["1x2"]["away"]]
            b_1x2 = [
                bench_uncal_mkts["1x2"]["home"],
                bench_uncal_mkts["1x2"]["draw"],
                bench_uncal_mkts["1x2"]["away"],
            ]
            max_cone_err_observed = max(
                max_cone_err_observed,
                abs(c_1x2[0] - proj["pHomeTarget"]),
                abs(c_1x2[1] - proj["pDrawTarget"]),
                abs(c_1x2[2] - proj["pAwayTarget"]),
                abs(sum(c_1x2) - 1.0),
            )
            max_total_err_observed = max(
                max_total_err_observed, abs(proj["expectedTotalImplied"] - proj["totalGoalsTarget"])
            )

            # Capture diverse parity vectors across all active confederations (`24` match projection cases)
            if len(match_parity_cases) < 24 and (
                sum(1 for c in match_parity_cases if c["input"]["confederationGroup"] == conf) < 5
            ):
                p_inp = {
                    "league": lg,
                    "confederationGroup": conf,
                    "homeElo": round(h_elo, 6),
                    "awayElo": round(a_elo, 6),
                    "homeAttEwm": round(h_att, 6),
                    "homeDefEwm": round(h_def, 6),
                    "homeGames": int(h_g),
                    "awayAttEwm": round(a_att, 6),
                    "awayDefEwm": round(a_def, 6),
                    "awayGames": int(a_g),
                    "leagueEnvGoals": round(env_causal, 6),
                    "neutralSite": bool(g["neutralSite"]),
                }
                p_exp = project_soccer_57_match_v60(
                    league=p_inp["league"],
                    home_elo=p_inp["homeElo"],
                    away_elo=p_inp["awayElo"],
                    home_att_ewm=p_inp["homeAttEwm"],
                    home_def_ewm=p_inp["homeDefEwm"],
                    home_games=p_inp["homeGames"],
                    away_att_ewm=p_inp["awayAttEwm"],
                    away_def_ewm=p_inp["awayDefEwm"],
                    away_games=p_inp["awayGames"],
                    league_env_goals=p_inp["leagueEnvGoals"],
                    neutral_site=p_inp["neutralSite"],
                    artifact=artifact,
                )
                match_parity_cases.append({"input": p_inp, "expected": p_exp})

            hs, as_ = int(g["homeScore"]), int(g["awayScore"])
            yi = 0 if hs > as_ else (1 if hs == as_ else 2)
            y_o25 = 1 if (hs + as_) >= 3 else 0
            y_btts = 1 if (hs > 0 and as_ > 0) else 0

            pc_o25 = clamp(mk["totals_2_5"]["over"], 0.001, 0.999)
            pb_o25 = clamp(bench_uncal_mkts["totals_2_5"]["over"], 0.001, 0.999)
            pc_btts = clamp(mk["btts"]["yes"], 0.001, 0.999)
            pb_btts = clamp(bench_uncal_mkts["btts"]["yes"], 0.001, 0.999)

            ll_1x2_c = -math.log(clamp(c_1x2[yi], 1e-6, 0.999999))
            ll_1x2_b = -math.log(clamp(b_1x2[yi], 1e-6, 0.999999))
            ll_o25_c = -(y_o25 * math.log(pc_o25) + (1 - y_o25) * math.log(1.0 - pc_o25))
            ll_o25_b = -(y_o25 * math.log(pb_o25) + (1 - y_o25) * math.log(1.0 - pb_o25))
            ll_btts_c = -(y_btts * math.log(pc_btts) + (1 - y_btts) * math.log(1.0 - pc_btts))
            ll_btts_b = -(y_btts * math.log(pb_btts) + (1 - y_btts) * math.log(1.0 - pb_btts))

            wf_all_clusters.append(cur_date)
            wf_all_1x2_v60.append(ll_1x2_c)
            wf_all_1x2_uncal.append(ll_1x2_b)
            wf_all_o25_v60.append(ll_o25_c)
            wf_all_o25_uncal.append(ll_o25_b)
            wf_all_o25_y.append(y_o25)
            wf_all_o25_p_v60.append(pc_o25)

            c_slice = conf_wf_data[conf]
            c_slice["clusters"].append(cur_date)
            c_slice["ll_1x2_v60"].append(ll_1x2_c)
            c_slice["ll_1x2_uncal"].append(ll_1x2_b)
            c_slice["ll_o25_v60"].append(ll_o25_c)
            c_slice["ll_o25_uncal"].append(ll_o25_b)
            c_slice["o25_y"].append(y_o25)
            c_slice["o25_p"].append(pc_o25)

            if n_prev_lg >= 10:
                wf_post10_clusters.append(cur_date)
                wf_post10_1x2_v60.append(ll_1x2_c)
                wf_post10_1x2_uncal.append(ll_1x2_b)
                wf_post10_o25_v60.append(ll_o25_c)
                wf_post10_o25_uncal.append(ll_o25_b)
                wf_post10_btts_v60.append(ll_btts_c)
                wf_post10_btts_uncal.append(ll_btts_b)
                wf_post10_o25_y.append(y_o25)
                wf_post10_o25_p_v60.append(pc_o25)
                wf_post10_o25_p_uncal.append(pb_o25)

        # STEP 2: Update rolling causal states ONLY AFTER all `cur_date` predictions are complete!
        day_lg_goals: dict[str, float] = defaultdict(float)
        day_lg_cnt: dict[str, int] = defaultdict(int)

        for g in day_games:
            lg = g["league"]
            conf = LEAGUE_TO_CONFEDERATION[lg]
            c_cfg = confederation_priors[conf]
            ht, at = g["homeTeam"], g["awayTeam"]
            hs, as_ = float(g["homeScore"]), float(g["awayScore"])

            h_elo, h_att, h_def, h_g = _get_club_state(ht, lg)
            a_elo, a_att, a_def, a_g = _get_club_state(at, lg)

            elo_hfa = 0.0 if g["neutralSite"] else float(c_cfg["hfa_elo"])
            elo_diff = (h_elo - a_elo) + elo_hfa
            exp_h = 1.0 / (1.0 + math.pow(10.0, -elo_diff / 400.0))
            s_h = 1.0 if hs > as_ else (0.5 if hs == as_ else 0.0)
            mov = math.log(abs(hs - as_) + 1.0) * (
                2.2 / (((elo_diff if s_h > 0.5 else -elo_diff) * 0.001) + 2.2)
            )
            delta_elo = float(c_cfg["elo_k"]) * clamp(mov, 0.65, 1.85) * (s_h - exp_h)

            club_elo[ht] = h_elo + delta_elo
            club_elo[at] = a_elo - delta_elo

            a_team = float(c_cfg["team_ewm_alpha"])
            club_att[ht] = (1.0 - a_team) * h_att + a_team * hs
            club_def[ht] = (1.0 - a_team) * h_def + a_team * as_
            club_att[at] = (1.0 - a_team) * a_att + a_team * as_
            club_def[at] = (1.0 - a_team) * a_def + a_team * hs
            club_games[ht] = h_g + 1
            club_games[at] = a_g + 1

            day_lg_goals[lg] += hs + as_
            day_lg_cnt[lg] += 1

        for lg, cnt in day_lg_cnt.items():
            conf = LEAGUE_TO_CONFEDERATION[lg]
            alpha_lg = float(confederation_priors[conf]["league_ewm_alpha"])
            alpha_step = 1.0 - math.pow(1.0 - alpha_lg, cnt)
            day_mean = day_lg_goals[lg] / float(cnt)
            lg_ewm_goals[lg] = (1.0 - alpha_step) * lg_ewm_goals[lg] + alpha_step * day_mean
            lg_sum_goals[lg] += day_lg_goals[lg]
            lg_n[lg] += cnt
            lg_env_history[lg].append((cur_date, _current_causal_league_env(lg)))

    # Add explicit `INTERNATIONAL_NATIONAL_TEAMS` zero-2026-game parity vectors (`6` cases) -> `30` match cases!
    for intl_idx, intl_lg in enumerate(CONFEDERATION_HIERARCHY_53["INTERNATIONAL_NATIONAL_TEAMS"][:6]):
        inp_intl = {
            "league": intl_lg,
            "confederationGroup": "INTERNATIONAL_NATIONAL_TEAMS",
            "homeElo": round(1620.0 + 25.0 * (intl_idx % 3), 6),
            "awayElo": round(1545.0 - 18.0 * (intl_idx % 2), 6),
            "homeAttEwm": round(1.48 + 0.05 * (intl_idx % 3), 6),
            "homeDefEwm": round(1.12, 6),
            "homeGames": 8,
            "awayAttEwm": round(1.22, 6),
            "awayDefEwm": round(1.36, 6),
            "awayGames": 8,
            "leagueEnvGoals": round(comp_initial_prior[intl_lg], 6),
            "neutralSite": bool(intl_lg in ("copa-del-mundo", "eurocopa", "copa-america", "copa-oro")),
        }
        exp_intl = project_soccer_57_match_v60(
            league=inp_intl["league"],
            home_elo=inp_intl["homeElo"],
            away_elo=inp_intl["awayElo"],
            home_att_ewm=inp_intl["homeAttEwm"],
            home_def_ewm=inp_intl["homeDefEwm"],
            home_games=inp_intl["homeGames"],
            away_att_ewm=inp_intl["awayAttEwm"],
            away_def_ewm=inp_intl["awayDefEwm"],
            away_games=inp_intl["awayGames"],
            league_env_goals=inp_intl["leagueEnvGoals"],
            neutral_site=inp_intl["neutralSite"],
            artifact=artifact,
        )
        match_parity_cases.append({"input": inp_intl, "expected": exp_intl})

    # Finalize competition status across all 53 competitions (`43` active + `10` `"confederation_prior_zero_2026_games"`)
    active_2026_count = 0
    zero_2026_count = 0
    for lg in sorted(competitions_meta.keys()):
        n_obs = lg_n[lg]
        if n_obs > 0:
            active_2026_count += 1
            competitions_meta[lg]["games_2026"] = int(n_obs)
            competitions_meta[lg]["mean_raw_goals_2026"] = round(lg_sum_goals[lg] / float(n_obs), 4)
            competitions_meta[lg]["ewm_goals_2026"] = round(lg_ewm_goals[lg], 4)
            competitions_meta[lg]["causal_env_goals_final"] = round(_current_causal_league_env(lg), 4)
            competitions_meta[lg]["competition_status"] = "causal_walk_forward_2026_active"
        else:
            zero_2026_count += 1
            competitions_meta[lg]["games_2026"] = 0
            competitions_meta[lg]["mean_raw_goals_2026"] = None
            competitions_meta[lg]["ewm_goals_2026"] = comp_initial_prior[lg]
            competitions_meta[lg]["causal_env_goals_final"] = comp_initial_prior[lg]
            competitions_meta[lg]["competition_status"] = "confederation_prior_zero_2026_games"

    if active_2026_count != 43 or zero_2026_count != 10:
        raise RuntimeError(f"Expected 43 active + 10 zero-2026 competitions; got {active_2026_count} + {zero_2026_count}")

    # Re-evaluate `expected` on `match_parity_cases` against finalized `artifact` so `competitionStatus` matches 100%
    for m_case in match_parity_cases:
        m_inp = m_case["input"]
        m_case["expected"] = project_soccer_57_match_v60(
            league=m_inp["league"],
            home_elo=m_inp["homeElo"],
            away_elo=m_inp["awayElo"],
            home_att_ewm=m_inp["homeAttEwm"],
            home_def_ewm=m_inp["homeDefEwm"],
            home_games=m_inp["homeGames"],
            away_att_ewm=m_inp["awayAttEwm"],
            away_def_ewm=m_inp["awayDefEwm"],
            away_games=m_inp["awayGames"],
            league_env_goals=m_inp["leagueEnvGoals"],
            neutral_site=m_inp["neutralSite"],
            artifact=artifact,
        )

    def _lookup_causal_env_before_date(lg: str, game_date: str) -> float:
        val = comp_initial_prior[lg]
        for dt_s, env_v in lg_env_history.get(lg, []):
            if dt_s < game_date:
                val = env_v
            else:
                break
        return val

    # ========================================================================
    # Evaluation B: Strict Pre-Kickoff Cohort (`n = 57` Football, `date' < date`)
    # + Inductive Venn-Abers Calibration in Playable Zone `[1.55, 2.60]`
    # ========================================================================
    strict_fb = [
        g for g in bridge["strict_prekickoff_games"] if g["sport"] == "football" and g["projTotal"] is not None
    ]

    sp_clusters: list[str] = []
    sp_1x2_cand_ll: list[float] = []
    sp_1x2_bench_ll: list[float] = []
    sp_o25_cand_ll: list[float] = []
    sp_o25_bench_ll: list[float] = []
    sp_btts_cand_ll: list[float] = []
    sp_btts_bench_ll: list[float] = []
    sp_pred_tot_raw: list[float] = []
    sp_pred_tot_v60: list[float] = []
    sp_act_tot: list[float] = []
    sp_o25_p_raw: list[float] = []
    sp_o25_p_v60: list[float] = []
    sp_o25_y: list[int] = []

    sp_play_clusters: list[str] = []
    sp_play_cand_ll: list[float] = []
    sp_play_bench_ll: list[float] = []
    sp_play_p_raw: list[float] = []
    sp_play_p_v60: list[float] = []
    sp_play_y: list[int] = []

    prekickoff_parity_cases: list[dict[str, Any]] = []

    for g in strict_fb:
        lg = g["league"]
        gdate = g["date"]
        env_causal = _lookup_causal_env_before_date(lg, gdate)
        raw_ph = float(g["projHome"] if g["projHome"] is not None else 0.54 * g["projTotal"])
        raw_pa = float(g["projAway"] if g["projAway"] is not None else 0.46 * g["projTotal"])
        raw_x12 = [float(x) for x in (g["x12"] or [0.44, 0.26, 0.30])]

        recal = recalibrate_soccer_57_prekickoff_v60(
            league=lg,
            raw_proj_home=raw_ph,
            raw_proj_away=raw_pa,
            raw_x12=raw_x12,
            causal_league_env_goals=env_causal,
            artifact=artifact,
        )

        if len(prekickoff_parity_cases) < 20:
            pk_inp = {
                "league": lg,
                "rawProjHome": round(raw_ph, 6),
                "rawProjAway": round(raw_pa, 6),
                "rawX12": [round(v, 6) for v in raw_x12],
                "causalLeagueEnvGoals": round(env_causal, 6),
            }
            pk_exp = recalibrate_soccer_57_prekickoff_v60(
                league=pk_inp["league"],
                raw_proj_home=pk_inp["rawProjHome"],
                raw_proj_away=pk_inp["rawProjAway"],
                raw_x12=pk_inp["rawX12"],
                causal_league_env_goals=pk_inp["causalLeagueEnvGoals"],
                artifact=artifact,
            )
            prekickoff_parity_cases.append({"input": pk_inp, "expected": pk_exp})

        hs, as_ = int(g["homeScore"]), int(g["awayScore"])
        act_tot = hs + as_
        yi = 0 if hs > as_ else (1 if hs == as_ else 2)
        y_o25 = 1 if act_tot >= 3 else 0
        y_btts = 1 if (hs > 0 and as_ > 0) else 0

        s_rx = sum(max(1e-6, v) for v in raw_x12)
        raw_1x2_norm = [max(1e-6, v) / s_rx for v in raw_x12]
        cand_1x2 = [
            recal["markets"]["1x2"]["home"],
            recal["markets"]["1x2"]["draw"],
            recal["markets"]["1x2"]["away"],
        ]

        p_o25_raw = clamp(float(g["pOver25"]) if g["pOver25"] is not None else 0.58, 0.01, 0.99)
        p_btts_raw = clamp(float(g["pBttsYes"]) if g["pBttsYes"] is not None else 0.58, 0.01, 0.99)
        p_o25_c = clamp(recal["markets"]["totals_2_5"]["over"], 0.001, 0.999)
        p_btts_c = clamp(recal["markets"]["btts"]["yes"], 0.001, 0.999)

        sp_clusters.append(gdate)
        sp_pred_tot_raw.append(float(g["projTotal"]))
        sp_pred_tot_v60.append(recal["expectedTotalImplied"])
        sp_act_tot.append(float(act_tot))
        sp_o25_p_raw.append(p_o25_raw)
        sp_o25_p_v60.append(p_o25_c)
        sp_o25_y.append(y_o25)

        sp_1x2_cand_ll.append(-math.log(clamp(cand_1x2[yi], 1e-6, 0.999999)))
        sp_1x2_bench_ll.append(-math.log(clamp(raw_1x2_norm[yi], 1e-6, 0.999999)))
        sp_o25_cand_ll.append(-(y_o25 * math.log(p_o25_c) + (1 - y_o25) * math.log(1.0 - p_o25_c)))
        sp_o25_bench_ll.append(-(y_o25 * math.log(p_o25_raw) + (1 - y_o25) * math.log(1.0 - p_o25_raw)))
        sp_btts_cand_ll.append(-(y_btts * math.log(p_btts_c) + (1 - y_btts) * math.log(1.0 - p_btts_c)))
        sp_btts_bench_ll.append(-(y_btts * math.log(p_btts_raw) + (1 - y_btts) * math.log(1.0 - p_btts_raw)))

        # Playable zone `[1.55, 2.60]` fairOdds (`p in [0.384615, 0.645161]`) with Inductive Venn-Abers!
        va_m = recal["playableVennAbers"]
        playable_candidates = [
            (raw_1x2_norm[0], va_m["home"]["pCalibrated"], 1 if hs > as_ else 0),
            (raw_1x2_norm[2], va_m["away"]["pCalibrated"], 1 if as_ > hs else 0),
            (p_o25_raw, va_m["over25"]["pCalibrated"], y_o25),
            (1.0 - p_o25_raw, va_m["under25"]["pCalibrated"], 1 - y_o25),
            (p_btts_raw, va_m["bttsYes"]["pCalibrated"], y_btts),
        ]
        for pr, pc_va, y_out in playable_candidates:
            fair_r = 1.0 / max(pr, 1e-6)
            if PLAYABLE_ODDS_MIN <= fair_r <= PLAYABLE_ODDS_MAX:
                pr_c = clamp(pr, 0.005, 0.995)
                pc_c = clamp(pc_va, 0.005, 0.995)
                sp_play_clusters.append(gdate)
                sp_play_p_raw.append(pr_c)
                sp_play_p_v60.append(pc_c)
                sp_play_y.append(y_out)
                sp_play_cand_ll.append(-(y_out * math.log(pc_c) + (1 - y_out) * math.log(1.0 - pc_c)))
                sp_play_bench_ll.append(-(y_out * math.log(pr_c) + (1 - y_out) * math.log(1.0 - pr_c)))

    # Dedicated Inductive Venn-Abers parity cases across the `[0, 1]` simplex (`10` cases -> `60` total parity vectors!)
    va_parity_cases: list[dict[str, Any]] = []
    for idx_v, p_probe in enumerate((0.08, 0.22, 0.384615, 0.42, 0.48, 0.52, 0.58, 0.645161, 0.76, 0.91)):
        is_exp_v = bool(idx_v % 2 == 1)
        va_out = calibrate_playable_venn_abers_logit_v60(p_probe, is_exp_v, va_calibrator)
        va_parity_cases.append({
            "input": {"pRaw": p_probe, "isExpansionOrCup": is_exp_v},
            "expected": va_out,
        })

    # Per-confederation summary (`INTERNATIONAL_NATIONAL_TEAMS` has `n == 0` -> returns `None`/`null`)
    confederation_walkforward_summary: dict[str, Any] = {}
    for conf, c_data in conf_wf_data.items():
        confederation_walkforward_summary[conf] = {
            "competitions_count": len(CONFEDERATION_HIERARCHY_53[conf]),
            "games_evaluated_2026": len(c_data["clusters"]),
            "1x2_logloss_vs_uncalibrated": cluster_bootstrap_diff_v60(
                c_data["clusters"], c_data["ll_1x2_v60"], c_data["ll_1x2_uncal"]
            ),
            "o25_logloss_vs_uncalibrated": cluster_bootstrap_diff_v60(
                c_data["clusters"], c_data["ll_o25_v60"], c_data["ll_o25_uncal"]
            ),
            "o25_ece": safe_ece_binary_v60(c_data["o25_y"], c_data["o25_p"]),
        }

    results_report: dict[str, Any] = {
        "experiment_id": "EXP_V58_soccer_57_v6_0",
        "schema_version": "exp_v58_soccer_57_v6_0_results_1.0.0",
        "status": "candidate",
        "production_activated": False,
        "governance": {
            "holdout_cut_utc": HOLDOUT_CUT_UTC,
            "holdout_window_protected": [HOLDOUT_START_DATE, HOLDOUT_END_DATE],
            "holdout_sealed_untouched": True,
            "hyperparameter_tuning_on_holdout": False,
            "strict_date_causality_enforced": "date_prime < date",
            "pre2025_history_games_used": len(pre_games),
            "pre2025_venn_abers_oof_samples": va_calibrator["calibration_n_pre2025"],
            "forbidden_fields_present": False,
        },
        "hierarchy_coverage": {
            "total_platform_leagues": 57,
            "excluded_us_leagues": list(NON_FOOTBALL_US_LEAGUES),
            "total_football_competitions": 53,
            "active_2026_walk_forward_competitions": active_2026_count,
            "confederation_prior_zero_2026_competitions": zero_2026_count,
            "zero_2026_competitions_list": [
                lg
                for lg, meta in sorted(competitions_meta.items())
                if meta["competition_status"] == "confederation_prior_zero_2026_games"
            ],
            "matrix_max_1x2_cone_error": max_cone_err_observed,
            "matrix_max_expected_total_error": max_total_err_observed,
        },
        "season_results_walkforward_oos": {
            "post_burnin_10_games_43_leagues": {
                "1x2_logloss_vs_uncalibrated": cluster_bootstrap_diff_v60(
                    wf_post10_clusters, wf_post10_1x2_v60, wf_post10_1x2_uncal
                ),
                "o25_logloss_vs_uncalibrated": cluster_bootstrap_diff_v60(
                    wf_post10_clusters, wf_post10_o25_v60, wf_post10_o25_uncal
                ),
                "btts_logloss_vs_uncalibrated": cluster_bootstrap_diff_v60(
                    wf_post10_clusters, wf_post10_btts_v60, wf_post10_btts_uncal
                ),
                "o25_ece_v60": safe_ece_binary_v60(wf_post10_o25_y, wf_post10_o25_p_v60),
                "o25_ece_uncalibrated": safe_ece_binary_v60(wf_post10_o25_y, wf_post10_o25_p_uncal),
            },
            "all_5120_games_from_day1": {
                "1x2_logloss_vs_uncalibrated": cluster_bootstrap_diff_v60(
                    wf_all_clusters, wf_all_1x2_v60, wf_all_1x2_uncal
                ),
                "o25_logloss_vs_uncalibrated": cluster_bootstrap_diff_v60(
                    wf_all_clusters, wf_all_o25_v60, wf_all_o25_uncal
                ),
                "o25_ece_v60": safe_ece_binary_v60(wf_all_o25_y, wf_all_o25_p_v60),
            },
            "by_confederation": confederation_walkforward_summary,
        },
        "strict_prekickoff_57_cohort": {
            "n_games": len(strict_fb),
            "mean_pred_goals_before": round(sum(sp_pred_tot_raw) / len(strict_fb), 4),
            "mean_pred_goals_v60": round(sum(sp_pred_tot_v60) / len(strict_fb), 4),
            "mean_actual_goals": round(sum(sp_act_tot) / len(strict_fb), 4),
            "goals_bias_before": round((sum(sp_pred_tot_raw) - sum(sp_act_tot)) / len(strict_fb), 4),
            "goals_bias_v60": round((sum(sp_pred_tot_v60) - sum(sp_act_tot)) / len(strict_fb), 4),
            "o25_bias_pp_before": round((sum(sp_o25_y) - sum(sp_o25_p_raw)) / len(strict_fb) * 100.0, 3),
            "o25_bias_pp_v60": round((sum(sp_o25_y) - sum(sp_o25_p_v60)) / len(strict_fb) * 100.0, 3),
            "1x2_logloss_diff": cluster_bootstrap_diff_v60(sp_clusters, sp_1x2_cand_ll, sp_1x2_bench_ll),
            "o25_logloss_diff": cluster_bootstrap_diff_v60(sp_clusters, sp_o25_cand_ll, sp_o25_bench_ll),
            "btts_logloss_diff": cluster_bootstrap_diff_v60(sp_clusters, sp_btts_cand_ll, sp_btts_bench_ll),
            "playable_zone_1_55_to_2_60_venn_abers": {
                "n_picks": len(sp_play_y),
                "expected_hit_pct_before": round(sum(sp_play_p_raw) / max(1, len(sp_play_y)) * 100.0, 3),
                "expected_hit_pct_v60": round(sum(sp_play_p_v60) / max(1, len(sp_play_y)) * 100.0, 3),
                "observed_hit_pct": round(sum(sp_play_y) / max(1, len(sp_play_y)) * 100.0, 3),
                "ece_before": safe_ece_binary_v60(sp_play_y, sp_play_p_raw, n_bins=5),
                "ece_v60": safe_ece_binary_v60(sp_play_y, sp_play_p_v60, n_bins=5),
                "logloss_diff_date_clustered": cluster_bootstrap_diff_v60(
                    sp_play_clusters, sp_play_cand_ll, sp_play_bench_ll
                ),
            },
        },
    }

    parity_snapshot: dict[str, Any] = {
        "schema_version": "soccer_57_v6_0_parity_snapshot_1.0.0",
        "status": "candidate",
        "production_activated": False,
        "holdout_sealed_untouched": True,
        "total_parity_cases": len(match_parity_cases) + len(prekickoff_parity_cases) + len(va_parity_cases),
        "match_projection_cases": match_parity_cases,
        "prekickoff_recalibration_cases": prekickoff_parity_cases,
        "venn_abers_playable_cases": va_parity_cases,
    }

    # Write ONLY our 3 assigned JSON artifacts
    MODEL_OUT_PATH.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    SNAPSHOT_OUT_PATH.write_text(json.dumps(parity_snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    results_report["artifact_hashes"] = {
        "model_soccer_57_v6_0_candidate_sha256": hashlib.sha256(MODEL_OUT_PATH.read_bytes()).hexdigest(),
        "soccer_57_v6_0_snapshot_sha256": hashlib.sha256(SNAPSHOT_OUT_PATH.read_bytes()).hexdigest(),
    }
    RESULTS_OUT_PATH.write_text(json.dumps(results_report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    return results_report


if __name__ == "__main__":
    report = run_experiment()
    print(json.dumps(report["hierarchy_coverage"], ensure_ascii=False, indent=2))
    print(json.dumps(report["season_results_walkforward_oos"]["post_burnin_10_games_43_leagues"], ensure_ascii=False, indent=2))
    print(json.dumps(report["strict_prekickoff_57_cohort"], ensure_ascii=False, indent=2))
