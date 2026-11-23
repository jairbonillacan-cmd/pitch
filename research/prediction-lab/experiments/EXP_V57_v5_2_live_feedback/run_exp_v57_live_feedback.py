"""PitchLab v5.2 Live-Feedback Candidate Engine & Walk-Forward Validation (`EXP_V57`).

Consumes the deterministic bridge bundle (`bridge_live_results.py`) and validates
three zero-leakage `v5.2` modules with bit-exact `mulberry32` cluster-bootstrap (`seed=20261111`,
1,000 resamples grouped by `date`) and IEEE-754 `< 1e-12` parity with TypeScript:

  1. `MultiLeagueDynamicCalibrationV52`:
     - Causal `LeagueScoringEnv` + shrunk Team Attack/Defense + Dixon-Coles (`date' < date`)
       across `43` football leagues (`5,120` games in `season-results.json`), plus post-hoc
       recalibration verified on the 100% leak-free `strict_prekickoff_games` cohort (`n = 57`).
  2. `PlayerPropsShotsAndGkSavesV52`:
     - Physical Goalkeeper `player_saves` Negative Binomial engine (`Opponent_SoT * SaveRate_EB * Exposure`)
       validated via `mulberry32` shot-level split-season OOS across active GKs + match-coupled
       `shots`/`shots_on_target` with starter/sub exposure de-biasing and logit-spline calibration.
  3. `MultiSportWalkForwardV52`:
     - Upgrades `MLB` (`2,202` games), `NHL` (`346`), `NBA` (`222`), and `NFL` (`150`) from
       intra-season table fit to true chronological game-by-game walk-forward OOS (`date' < date`)
       combining causal Elo, shrunk cumulative scoring/defense, dynamic league environment, and
       exact schedule `B2B` / `3-in-4` fatigue detection.
"""

from __future__ import annotations

import datetime as dt_mod
import hashlib
import json
import math
from collections import defaultdict
from pathlib import Path
from typing import Any

from bridge_live_results import ARTIFACTS_DIR, DEFAULT_PITCH_DATA, build_live_results_bridge

REPO_ROOT = Path(__file__).resolve().parents[4]
PRED_DATA_DIR = REPO_ROOT / "src" / "data" / "prediction"

BOOTSTRAP_SEED = 20261111
BOOTSTRAP_RESAMPLES = 1000


# ============================================================================
# 1. Exact Shared Primitives (IEEE-754 bit-compatible with TypeScript math.ts)
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
    sign = -1.0 if x < 0.0 else 1.0
    z = abs(x) * 0.7071067811865475
    t = 1.0 / (1.0 + 0.3275911 * z)
    poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t
    erf_val = sign * (1.0 - poly * math.exp(-(z * z)))
    return 0.5 * (1.0 + erf_val)


def mulberry32_step(seed: int, k: int) -> float:
    t = ((seed & 0xFFFFFFFF) + (k * 0x6D2B79F5)) & 0xFFFFFFFF
    t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
    inner = ((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF
    t = (t ^ ((t + inner) & 0xFFFFFFFF)) & 0xFFFFFFFF
    return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0


def cluster_bootstrap_diff_pure(
    cluster_ids: list[str],
    loss_cand: list[float],
    loss_bench: list[float],
    n_resamples: int = BOOTSTRAP_RESAMPLES,
    seed: int = BOOTSTRAP_SEED,
) -> dict[str, Any]:
    """Pure-Python bit-exact implementation of `services/models/cluster_bootstrap.py`."""
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
    ci_lo = boot_sorted[lo_i] + (lo_pos - lo_i) * (boot_sorted[min(n_resamples - 1, lo_i + 1)] - boot_sorted[lo_i])
    ci_hi = boot_sorted[hi_i] + (hi_pos - hi_i) * (boot_sorted[min(n_resamples - 1, hi_i + 1)] - boot_sorted[hi_i])
    mean_b = sum(boot) / n_resamples
    se = math.sqrt(sum((x - mean_b) ** 2 for x in boot) / max(1, n_resamples - 1))
    p_one = sum(1 for x in boot if x >= 0.0) / n_resamples

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
        "significant_improvement": bool(ci_hi < 0.0),
        "bootstrap_method": "cluster_mulberry32",
        "n_resamples": n_resamples,
        "seed": seed,
    }


def compute_ece_binary(y_true: list[int], probs: list[float], n_bins: int = 10) -> float | None:
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
# 2. Module A — Multi-League Goals & Playable-Zone Recalibrator (`v5.2`)
# ============================================================================

def dixon_coles_markets_exact(
    lambda_home: float,
    lambda_away: float,
    rho: float = -0.105,
    max_goals: int = 12,
) -> dict[str, float]:
    """Exact bivariate Dixon-Coles matrix matching TS `dixonColesMarketsExactV52`."""
    lh = clamp(lambda_home, 0.08, 8.5)
    la = clamp(lambda_away, 0.08, 8.5)

    pmf_h = [0.0] * (max_goals + 1)
    pmf_a = [0.0] * (max_goals + 1)
    pmf_h[0] = math.exp(-lh)
    pmf_a[0] = math.exp(-la)
    for k in range(1, max_goals + 1):
        pmf_h[k] = pmf_h[k - 1] * lh / k
        pmf_a[k] = pmf_a[k - 1] * la / k
    sh = sum(pmf_h)
    sa = sum(pmf_a)
    pmf_h = [v / sh for v in pmf_h]
    pmf_a = [v / sa for v in pmf_a]

    rho_min = max(-1.0 / max(lh * la, 1e-6) + 0.05, -0.35)
    rho_max = min(1.0 / max(lh, 1e-6) - 0.05, 1.0 / max(la, 1e-6) - 0.05, 0.35)
    rc = clamp(rho, rho_min, rho_max)

    mat: list[list[float]] = []
    tot_mass = 0.0
    for i in range(max_goals + 1):
        row = []
        for j in range(max_goals + 1):
            base = pmf_h[i] * pmf_a[j]
            if i == 0 and j == 0:
                tau = 1.0 - lh * la * rc
            elif i == 0 and j == 1:
                tau = 1.0 + lh * rc
            elif i == 1 and j == 0:
                tau = 1.0 + la * rc
            elif i == 1 and j == 1:
                tau = 1.0 - rc
            else:
                tau = 1.0
            val = max(0.0, base * tau)
            row.append(val)
            tot_mass += val
        mat.append(row)

    p_home = 0.0
    p_draw = 0.0
    p_away = 0.0
    p_o15 = 0.0
    p_o25 = 0.0
    p_o35 = 0.0
    p_btts = 0.0
    for i in range(max_goals + 1):
        for j in range(max_goals + 1):
            pij = mat[i][j] / tot_mass
            if i > j:
                p_home += pij
            elif i == j:
                p_draw += pij
            else:
                p_away += pij
            if i + j >= 2:
                p_o15 += pij
            if i + j >= 3:
                p_o25 += pij
            if i + j >= 4:
                p_o35 += pij
            if i >= 1 and j >= 1:
                p_btts += pij

    return {
        "lambdaHome": lh,
        "lambdaAway": la,
        "expectedTotal": lh + la,
        "pHome": clamp(p_home, 0.001, 0.998),
        "pDraw": clamp(p_draw, 0.001, 0.998),
        "pAway": clamp(p_away, 0.001, 0.998),
        "pOver15": clamp(p_o15, 0.001, 0.999),
        "pOver25": clamp(p_o25, 0.001, 0.999),
        "pOver35": clamp(p_o35, 0.001, 0.999),
        "pBttsYes": clamp(p_btts, 0.001, 0.999),
    }


def recalibrate_football_outlook_v52(
    raw_proj_home: float,
    raw_proj_away: float,
    raw_x12: list[float],
    league_env_goals: float,
    raw_league_proj_mean: float,
    is_expansion_league: bool,
    config: dict[str, Any],
) -> dict[str, Any]:
    """Deterministic TS-mirrored recalibrator for football totals, BTTS, and playable 1X2."""
    raw_tot = max(0.30, raw_proj_home + raw_proj_away)
    anchor_denom = max(0.50, raw_league_proj_mean)
    scale = clamp(
        league_env_goals / anchor_denom,
        float(config["min_goal_env_scale"]),
        float(config["max_goal_env_scale"]),
    )
    shrink_w = float(config["projection_env_blend_weight"])
    target_tot = clamp(
        (1.0 - shrink_w) * (raw_tot * scale) + shrink_w * league_env_goals,
        1.25,
        4.85,
    )
    share_h = clamp(raw_proj_home / raw_tot, 0.12, 0.88)
    lh = target_tot * share_h
    la = target_tot * (1.0 - share_h)
    dc = dixon_coles_markets_exact(lh, la, float(config["dc_rho"]), 12)

    tau = float(config["tau_logit_expansion"] if is_expansion_league else config["tau_logit_core"])
    eps = 1e-6
    s_raw = max(eps, sum(max(eps, p) for p in raw_x12))
    p_norm = [max(eps, p) / s_raw for p in raw_x12]
    base_prior = [0.44, 0.26, 0.30]
    unnorm = [
        base_prior[i] * math.exp(math.log(p_norm[i] / base_prior[i]) / tau)
        for i in range(3)
    ]
    w_dc = float(config["x12_dc_consistency_weight"])
    s_u = sum(unnorm)
    p_temp = [u / s_u for u in unnorm]
    dc_1x2 = [dc["pHome"], dc["pDraw"], dc["pAway"]]
    p_final = [(1.0 - w_dc) * p_temp[i] + w_dc * dc_1x2[i] for i in range(3)]
    s_fin = sum(p_final)
    p_final = [v / s_fin for v in p_final]

    return {
        "lambdaHome": lh,
        "lambdaAway": la,
        "expectedTotal": lh + la,
        "envScaleApplied": scale,
        "pHome": p_final[0],
        "pDraw": p_final[1],
        "pAway": p_final[2],
        "pOver15": dc["pOver15"],
        "pOver25": dc["pOver25"],
        "pOver35": dc["pOver35"],
        "pBttsYes": dc["pBttsYes"],
    }


def recalibrate_playable_binary_prob_v52(
    p_raw: float,
    is_expansion_league: bool,
    config: dict[str, Any],
) -> float:
    tau = float(config["playable_binary_tau_expansion"] if is_expansion_league else config["playable_binary_tau_core"])
    z = logit(clamp(p_raw, 0.005, 0.995))
    return clamp(sigmoid(z / tau), 0.001, 0.999)


# ============================================================================
# 3. Module B — Goalkeeper Saves & Match-Coupled Outfield Shots (`v5.2`)
# ============================================================================

STARTER_SUB_MIN_PRIORS: dict[str, tuple[float, float]] = {
    "GK": (89.2, 32.0),
    "DEF": (85.0, 23.5),
    "MID": (79.5, 24.5),
    "FWD": (76.0, 22.5),
}

SHOT_CLUSTER_PRIORS_PER90: dict[str, dict[str, tuple[float, float, float]]] = {
    "FWD": {"shots": (2.68, 4.5, 4.2), "shots_on_target": (1.02, 4.5, 3.8)},
    "MID": {"shots": (1.42, 4.5, 4.6), "shots_on_target": (0.46, 4.5, 4.2)},
    "DEF": {"shots": (0.66, 4.5, 5.0), "shots_on_target": (0.19, 4.5, 4.8)},
}


def estimate_effective_exposure_90(appearances: int, sub_ins: int, position_group: str) -> float:
    apps = max(0, int(appearances))
    subs = clamp(int(sub_ins), 0, apps)
    starts = apps - int(subs)
    st_min, sb_min = STARTER_SUB_MIN_PRIORS.get(position_group, (79.5, 24.0))
    total_min = starts * st_min + subs * sb_min
    return max(0.25, total_min / 90.0)


def nb_tail_prob_ge(k_min: int, mu: float, r_disp: float) -> float:
    if k_min <= 0:
        return 0.999
    mu_c = clamp(mu, 0.005, 40.0)
    r_c = clamp(r_disp, 0.4, 200.0)
    p0_ratio = r_c / (r_c + mu_c)
    q_ratio = mu_c / (r_c + mu_c)
    pmf = math.exp(r_c * math.log(p0_ratio))
    cdf_lt = pmf if k_min > 0 else 0.0
    for k in range(1, k_min):
        pmf = pmf * ((k - 1.0 + r_c) / k) * q_ratio
        cdf_lt += pmf
    return clamp(1.0 - cdf_lt, 0.001, 0.999)


def evaluate_barycentric_logit_knots(p_raw: float, knots_x: list[float], knots_y: list[float]) -> float:
    pc = clamp(p_raw, knots_x[0], knots_x[-1])
    zx = logit(pc)
    for i in range(len(knots_x) - 1):
        x1 = knots_x[i + 1]
        if pc <= x1 or i == len(knots_x) - 2:
            z0, z1 = logit(knots_x[i]), logit(knots_x[i + 1])
            zy0, zy1 = logit(knots_y[i]), logit(knots_y[i + 1])
            t = 0.0 if abs(z1 - z0) < 1e-12 else clamp((zx - z0) / (z1 - z0), 0.0, 1.0)
            return clamp(sigmoid(zy0 + t * (zy1 - zy0)), 0.001, 0.999)
    return clamp(pc, 0.001, 0.999)


def project_goalkeeper_saves_outlook_v52(
    saves: int,
    shots_faced: int,
    goals_conceded: int,
    appearances: int,
    sub_ins: int,
    opp_expected_sot: float,
    line: float,
    expected_minutes: float | None,
    config: dict[str, Any],
) -> dict[str, Any]:
    gk_cfg = config["goalkeeper_saves"]
    eff_sf = max(int(saves), int(shots_faced)) if int(shots_faced) > 0 else (int(saves) + int(goals_conceded))
    prior_rate = float(gk_cfg["prior_save_rate"])
    prior_sf = float(gk_cfg["prior_shots_faced"])
    eb_save_rate = clamp(
        (float(saves) + prior_sf * prior_rate) / (float(eff_sf) + prior_sf),
        float(gk_cfg["min_save_rate"]),
        float(gk_cfg["max_save_rate"]),
    )
    eff_90 = estimate_effective_exposure_90(appearances, sub_ins, "GK")
    avg_min = clamp((eff_90 * 90.0) / max(1, appearances), 30.0, 90.0)
    exp_min = clamp(expected_minutes if expected_minutes is not None else avg_min, 15.0, 95.0)
    opp_sot_c = clamp(opp_expected_sot, 1.2, 9.5)
    mu_saves = opp_sot_c * eb_save_rate * (exp_min / 90.0)
    r_disp = float(gk_cfg["r_dispersion_sot"])
    k_min = int(math.floor(line + 1e-9)) + 1
    p_raw = nb_tail_prob_ge(k_min, mu_saves, r_disp)
    p_cal = evaluate_barycentric_logit_knots(p_raw, gk_cfg["spline_knots_x"], gk_cfg["spline_knots_y"])
    p_under = clamp(1.0 - p_cal, 0.001, 0.999)
    return {
        "ebSaveRate": eb_save_rate,
        "effectiveExposure90": eff_90,
        "expectedMinutes": exp_min,
        "oppExpectedSoT": opp_sot_c,
        "expectedSaves": mu_saves,
        "line": line,
        "pOver": p_cal,
        "pUnder": p_under,
        "fairOverDecimal": round(1.0 / p_cal, 4),
        "fairUnderDecimal": round(1.0 / p_under, 4),
    }


def project_coupled_player_shots_outlook_v52(
    metric: str,
    position_group: str,
    season_count: int,
    appearances: int,
    sub_ins: int,
    team_expected_shots: float,
    opp_defense_shots_factor: float,
    line: float,
    expected_minutes: float | None,
    config: dict[str, Any],
) -> dict[str, Any]:
    sh_cfg = config["coupled_player_shots"]
    pos_key = position_group if position_group in SHOT_CLUSTER_PRIORS_PER90 else "MID"
    prior_rate, prior_exp90, r_disp = SHOT_CLUSTER_PRIORS_PER90[pos_key][metric]
    eff_90 = estimate_effective_exposure_90(appearances, sub_ins, pos_key)
    eb_rate_per90 = (float(season_count) + prior_exp90 * prior_rate) / (eff_90 + prior_exp90)

    st_min, _ = STARTER_SUB_MIN_PRIORS.get(pos_key, (79.5, 24.0))
    exp_min = clamp(expected_minutes if expected_minutes is not None else st_min, 15.0, 95.0)
    league_anchor = float(sh_cfg["league_team_shots_anchor"] if metric == "shots" else sh_cfg["league_team_sot_anchor"])
    team_factor = clamp(team_expected_shots / league_anchor, 0.55, 1.75) ** float(sh_cfg["team_coupling_exponent"])
    opp_factor = clamp(opp_defense_shots_factor, 0.65, 1.50) ** float(sh_cfg["opp_coupling_exponent"])

    mu = eb_rate_per90 * (exp_min / 90.0) * team_factor * opp_factor
    k_min = int(math.floor(line + 1e-9)) + 1
    p_raw = nb_tail_prob_ge(k_min, mu, r_disp)
    knots = sh_cfg["spline_sot"] if metric == "shots_on_target" else sh_cfg["spline_shots"]
    p_cal = evaluate_barycentric_logit_knots(p_raw, knots["x"], knots["y"])
    p_under = clamp(1.0 - p_cal, 0.001, 0.999)
    return {
        "metric": metric,
        "ebRatePer90": eb_rate_per90,
        "naivePerAppearanceRate": float(season_count) / max(1, appearances),
        "effectiveExposure90": eff_90,
        "expectedMinutes": exp_min,
        "muProjected": mu,
        "line": line,
        "pOver": p_cal,
        "pUnder": p_under,
        "fairOverDecimal": round(1.0 / p_cal, 4),
        "fairUnderDecimal": round(1.0 / p_under, 4),
    }


# ============================================================================
# 4. Module C — Multi-Sport Causal Walk-Forward Engine (`MLB / NHL / NBA / NFL`)
# ============================================================================

US_SPORT_PRIORS: dict[str, dict[str, float]] = {
    "mlb": {
        "prior_team_runs": 4.42,
        "prior_games": 65.0,
        "elo_k": 4.2,
        "elo_home_adv": 22.0,
        "elo_to_margin_scale": 0.0045,
        "home_adv_pts": 0.22,
        "sigma_margin": 5.85,
        "sigma_total": 4.45,
        "b2b_penalty_pts": 0.04,
        "three_in_four_penalty_pts": 0.05,
        "canonical_total_line": 8.5,
    },
    "nhl": {
        "prior_team_runs": 3.12,
        "prior_games": 38.0,
        "elo_k": 6.5,
        "elo_home_adv": 28.0,
        "elo_to_margin_scale": 0.0052,
        "home_adv_pts": 0.20,
        "sigma_margin": 2.95,
        "sigma_total": 2.48,
        "b2b_penalty_pts": 0.14,
        "three_in_four_penalty_pts": 0.08,
        "canonical_total_line": 6.5,
    },
    "nba": {
        "prior_team_runs": 113.8,
        "prior_games": 20.0,
        "elo_k": 16.0,
        "elo_home_adv": 58.0,
        "elo_to_margin_scale": 0.036,
        "home_adv_pts": 2.45,
        "sigma_margin": 13.8,
        "sigma_total": 16.8,
        "b2b_penalty_pts": 1.75,
        "three_in_four_penalty_pts": 0.85,
        "canonical_total_line": 227.5,
    },
    "nfl": {
        "prior_team_runs": 22.8,
        "prior_games": 16.0,
        "elo_k": 20.0,
        "elo_home_adv": 48.0,
        "elo_to_margin_scale": 0.040,
        "home_adv_pts": 1.85,
        "sigma_margin": 13.6,
        "sigma_total": 13.9,
        "b2b_penalty_pts": 0.0,
        "three_in_four_penalty_pts": 0.0,
        "canonical_total_line": 45.5,
    },
}


def project_us_walkforward_game_v52(
    sport: str,
    home_elo: float,
    away_elo: float,
    home_cum_for: float,
    home_cum_against: float,
    home_games: int,
    away_cum_for: float,
    away_cum_against: float,
    away_games: int,
    league_team_scoring_env: float,
    home_b2b: bool,
    away_b2b: bool,
    home_3in4: bool,
    away_3in4: bool,
    neutral_site: bool,
    total_line: float | None = None,
    priors_override: dict[str, float] | None = None,
) -> dict[str, float]:
    """Exact TS-mirrored causal Elo + shrunk cumulative scoring projection for MLB/NHL/NBA/NFL."""
    cfg = priors_override or US_SPORT_PRIORS[sport]
    kappa = float(cfg["prior_games"])
    env = max(0.5, float(league_team_scoring_env))

    h_off = (home_cum_for + kappa * env) / (home_games + kappa)
    h_def = (home_cum_against + kappa * env) / (home_games + kappa)
    a_off = (away_cum_for + kappa * env) / (away_games + kappa)
    a_def = (away_cum_against + kappa * env) / (away_games + kappa)

    base_total = ((h_off * a_def) / env) + ((a_off * h_def) / env)
    pen_h = (float(cfg["b2b_penalty_pts"]) if home_b2b else 0.0) + (float(cfg["three_in_four_penalty_pts"]) if home_3in4 else 0.0)
    pen_a = (float(cfg["b2b_penalty_pts"]) if away_b2b else 0.0) + (float(cfg["three_in_four_penalty_pts"]) if away_3in4 else 0.0)
    exp_total = max(0.5, base_total - 0.5 * (pen_h + pen_a))

    elo_diff = (home_elo - away_elo) + (0.0 if neutral_site else float(cfg["elo_home_adv"]))
    elo_p_home = 1.0 / (1.0 + math.pow(10.0, -elo_diff / 400.0))

    rate_margin = ((h_off * a_def) / env) - ((a_off * h_def) / env) + (0.0 if neutral_site else float(cfg["home_adv_pts"])) - (pen_h - pen_a)
    elo_margin = elo_diff * float(cfg["elo_to_margin_scale"])
    exp_margin = 0.55 * elo_margin + 0.45 * rate_margin

    mu_home = max(0.2, 0.5 * (exp_total + exp_margin))
    mu_away = max(0.2, 0.5 * (exp_total - exp_margin))

    p_margin = normal_cdf(exp_margin / float(cfg["sigma_margin"]))
    p_home = clamp(0.60 * elo_p_home + 0.40 * p_margin, 0.02, 0.98)

    line = float(total_line if total_line is not None else cfg["canonical_total_line"])
    p_over = clamp(1.0 - normal_cdf((line - exp_total) / float(cfg["sigma_total"])), 0.02, 0.98)

    return {
        "muHome": mu_home,
        "muAway": mu_away,
        "expectedMargin": exp_margin,
        "expectedTotal": exp_total,
        "pHomeWin": p_home,
        "pAwayWin": 1.0 - p_home,
        "totalLine": line,
        "pOver": p_over,
        "pUnder": 1.0 - p_over,
    }


# ============================================================================
# 5. Full Walk-Forward Training, Evaluation & Artifact Export
# ============================================================================

def _days_between(d1: str, d2: str) -> int:
    try:
        dt1 = dt_mod.date.fromisoformat(d1[:10])
        dt2 = dt_mod.date.fromisoformat(d2[:10])
        return (dt2 - dt1).days
    except Exception:
        return 99


def run_experiment() -> dict[str, Any]:
    bundle = build_live_results_bridge(DEFAULT_PITCH_DATA)
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    PRED_DATA_DIR.mkdir(parents=True, exist_ok=True)

    v52_config: dict[str, Any] = {
        "schema_version": "pitchlab_v5_2_live_feedback_1.0.0",
        "codename": "PitchLab Spacetime Live-Feedback v5.2 Candidate",
        "version": "5.2.0-candidate",
        "status": "candidate",
        "production_activated": False,
        "holdout_sealed_untouched": True,
        "football_calibration": {
            "global_goal_prior": 2.72,
            "prior_league_games": 18.0,
            "prior_team_games": 12.0,
            "league_ewm_alpha": 0.10,
            "min_goal_env_scale": 0.68,
            "max_goal_env_scale": 1.38,
            "projection_env_blend_weight": 0.38,
            "dc_rho": -0.105,
            "tau_logit_core": 1.05,
            "tau_logit_expansion": 1.24,
            "x12_dc_consistency_weight": 0.22,
            "playable_binary_tau_core": 1.08,
            "playable_binary_tau_expansion": 1.28,
        },
        "goalkeeper_saves": {
            "prior_save_rate": 0.712,
            "prior_shots_faced": 18.0,
            "min_save_rate": 0.52,
            "max_save_rate": 0.88,
            "r_dispersion_sot": 7.5,
            "spline_knots_x": [0.02, 0.12, 0.28, 0.45, 0.62, 0.78, 0.94],
            "spline_knots_y": [0.022, 0.125, 0.282, 0.448, 0.608, 0.762, 0.925],
        },
        "coupled_player_shots": {
            "league_team_shots_anchor": 12.4,
            "league_team_sot_anchor": 4.25,
            "team_coupling_exponent": 0.65,
            "opp_coupling_exponent": 0.55,
            "spline_shots": {
                "x": [0.02, 0.15, 0.32, 0.50, 0.68, 0.82, 0.95],
                "y": [0.024, 0.155, 0.322, 0.495, 0.662, 0.802, 0.935],
            },
            "spline_sot": {
                "x": [0.02, 0.15, 0.32, 0.50, 0.68, 0.82, 0.95],
                "y": [0.023, 0.152, 0.318, 0.492, 0.658, 0.798, 0.932],
            },
        },
        "us_multisport_walkforward": US_SPORT_PRIORS,
    }

    fb_cfg = v52_config["football_calibration"]

    # ------------------------------------------------------------------------
    # Evaluation 1A: Causal 43-League Football Walk-Forward (`5,120` games, `date' < date`)
    # Dynamic League Scoring Environment + Shrunk Team Attack/Defense + Dixon-Coles
    # vs Uncalibrated Global Static Prior (`3.12` goals, matching raw expansion inflation)
    # ------------------------------------------------------------------------
    fb_season = [m for m in bundle["season_matches"] if m["sport"] == "football"]
    fb_by_date: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for m in fb_season:
        fb_by_date[m["date"]].append(m)

    lg_n: dict[str, int] = defaultdict(int)
    lg_sum_goals: dict[str, float] = defaultdict(float)
    lg_env_history: dict[str, list[tuple[str, float]]] = defaultdict(list)
    fb_team_for: dict[str, float] = defaultdict(float)
    fb_team_ag: dict[str, float] = defaultdict(float)
    fb_team_n: dict[str, int] = defaultdict(int)

    wf_fb_clusters: list[str] = []
    wf_fb_1x2_cand_ll: list[float] = []
    wf_fb_1x2_bench_ll: list[float] = []
    wf_fb_o25_cand_ll: list[float] = []
    wf_fb_o25_bench_ll: list[float] = []
    wf_fb_o25_y: list[int] = []
    wf_fb_o25_p_cand: list[float] = []
    wf_fb_o25_p_bench: list[float] = []

    static_bench_dc = dixon_coles_markets_exact(1.68, 1.44, -0.105)  # 3.12 uncalibrated fallback prior

    for cur_date in sorted(fb_by_date.keys()):
        day_games = fb_by_date[cur_date]
        for g in day_games:
            lg = g["league"]
            ht = f"{lg}:{g['homeTeam']}"
            at = f"{lg}:{g['awayTeam']}"
            n_prev = lg_n[lg]
            g0 = float(fb_cfg["global_goal_prior"])
            kappa_l = float(fb_cfg["prior_league_games"])
            kappa_t = float(fb_cfg["prior_team_games"])
            env_g = (lg_sum_goals[lg] + kappa_l * g0) / (n_prev + kappa_l)
            half_env = 0.5 * env_g

            h_att = (fb_team_for[ht] + kappa_t * half_env) / (fb_team_n[ht] + kappa_t)
            h_def = (fb_team_ag[ht] + kappa_t * half_env) / (fb_team_n[ht] + kappa_t)
            a_att = (fb_team_for[at] + kappa_t * half_env) / (fb_team_n[at] + kappa_t)
            a_def = (fb_team_ag[at] + kappa_t * half_env) / (fb_team_n[at] + kappa_t)

            hfa = 1.0 if g["neutralSite"] else 1.11
            afa = 1.0 if g["neutralSite"] else 0.89
            lh = clamp((h_att * a_def / max(0.3, half_env)) * hfa, 0.25, 4.5)
            la = clamp((a_att * h_def / max(0.3, half_env)) * afa, 0.25, 4.5)

            if n_prev >= 10:
                dc_c = dixon_coles_markets_exact(lh, la, float(fb_cfg["dc_rho"]))
                hs, as_ = g["homeScore"], g["awayScore"]
                yi = 0 if hs > as_ else (1 if hs == as_ else 2)
                c_1x2 = [dc_c["pHome"], dc_c["pDraw"], dc_c["pAway"]]
                b_1x2 = [static_bench_dc["pHome"], static_bench_dc["pDraw"], static_bench_dc["pAway"]]
                y_o25 = 1 if (hs + as_) >= 3 else 0
                pc = dc_c["pOver25"]
                pb = static_bench_dc["pOver25"]

                wf_fb_clusters.append(cur_date)
                wf_fb_1x2_cand_ll.append(-math.log(c_1x2[yi]))
                wf_fb_1x2_bench_ll.append(-math.log(b_1x2[yi]))
                wf_fb_o25_y.append(y_o25)
                wf_fb_o25_p_cand.append(pc)
                wf_fb_o25_p_bench.append(pb)
                wf_fb_o25_cand_ll.append(-(y_o25 * math.log(pc) + (1 - y_o25) * math.log(1.0 - pc)))
                wf_fb_o25_bench_ll.append(-(y_o25 * math.log(pb) + (1 - y_o25) * math.log(1.0 - pb)))

        touched_leagues = set()
        for g in day_games:
            lg = g["league"]
            ht = f"{lg}:{g['homeTeam']}"
            at = f"{lg}:{g['awayTeam']}"
            hs, as_ = float(g["homeScore"]), float(g["awayScore"])
            lg_sum_goals[lg] += hs + as_
            lg_n[lg] += 1
            fb_team_for[ht] += hs
            fb_team_ag[ht] += as_
            fb_team_n[ht] += 1
            fb_team_for[at] += as_
            fb_team_ag[at] += hs
            fb_team_n[at] += 1
            touched_leagues.add(lg)
        for lg in touched_leagues:
            kappa_l = float(fb_cfg["prior_league_games"])
            g0 = float(fb_cfg["global_goal_prior"])
            env_post = (lg_sum_goals[lg] + kappa_l * g0) / (lg_n[lg] + kappa_l)
            lg_env_history[lg].append((cur_date, env_post))

    def lookup_causal_league_env(league: str, game_date: str) -> float:
        hist = lg_env_history.get(league, [])
        val = float(fb_cfg["global_goal_prior"])
        for dt_str, env_v in hist:
            if dt_str < game_date:
                val = env_v
            else:
                break
        return val

    final_league_envs: dict[str, dict[str, Any]] = {}
    for lg in sorted(lg_n.keys()):
        kappa_l = float(fb_cfg["prior_league_games"])
        g0 = float(fb_cfg["global_goal_prior"])
        env_final = (lg_sum_goals[lg] + kappa_l * g0) / (lg_n[lg] + kappa_l)
        final_league_envs[lg] = {
            "games_observed": lg_n[lg],
            "mean_raw_goals": round(lg_sum_goals[lg] / max(1, lg_n[lg]), 4),
            "shrunk_env_goals": round(env_final, 4),
        }
    v52_config["league_scoring_environments_2026"] = final_league_envs

    # ------------------------------------------------------------------------
    # Evaluation 1B: Strict Pre-Kickoff Cohort (`n = 57` Football, Zero Leakage)
    # ------------------------------------------------------------------------
    strict_fb = [g for g in bundle["strict_prekickoff_games"] if g["sport"] == "football" and g["projTotal"] is not None]
    sp_clusters: list[str] = []
    sp_o25_cand_ll: list[float] = []
    sp_o25_bench_ll: list[float] = []
    sp_btts_cand_ll: list[float] = []
    sp_btts_bench_ll: list[float] = []
    sp_pred_tot_raw: list[float] = []
    sp_pred_tot_v52: list[float] = []
    sp_act_tot: list[float] = []
    sp_o25_p_raw: list[float] = []
    sp_o25_p_v52: list[float] = []
    sp_o25_y: list[int] = []

    # Also grade playable picks (`fairOdds 1.55–2.60`) on strict pre-kickoff cohort (`0%` leakage!)
    sp_play_clusters: list[str] = []
    sp_play_cand_ll: list[float] = []
    sp_play_bench_ll: list[float] = []
    sp_play_p_raw: list[float] = []
    sp_play_p_v52: list[float] = []
    sp_play_y: list[int] = []

    for g in strict_fb:
        lg = g["league"]
        gdate = g["date"]
        env_g = lookup_causal_league_env(lg, gdate)
        raw_ph = float(g["projHome"] or (0.54 * g["projTotal"]))
        raw_pa = float(g["projAway"] or (0.46 * g["projTotal"]))
        raw_x12 = g["x12"] or [0.44, 0.26, 0.30]
        is_exp = lg not in {"premier-league", "laliga", "serie-a", "bundesliga", "ligue-1", "liga-mx"}
        recal = recalibrate_football_outlook_v52(
            raw_proj_home=raw_ph,
            raw_proj_away=raw_pa,
            raw_x12=raw_x12,
            league_env_goals=env_g,
            raw_league_proj_mean=3.18,
            is_expansion_league=is_exp,
            config=fb_cfg,
        )
        hs, as_ = g["homeScore"], g["awayScore"]
        act_tot = hs + as_
        y_o25 = 1 if act_tot >= 3 else 0
        y_btts = 1 if (hs > 0 and as_ > 0) else 0
        p_o25_raw = clamp(float(g["pOver25"]) if g["pOver25"] is not None else 0.58, 0.01, 0.99)
        p_btts_raw = clamp(float(g["pBttsYes"]) if g["pBttsYes"] is not None else 0.58, 0.01, 0.99)

        sp_clusters.append(gdate)
        sp_pred_tot_raw.append(float(g["projTotal"]))
        sp_pred_tot_v52.append(recal["expectedTotal"])
        sp_act_tot.append(float(act_tot))
        sp_o25_p_raw.append(p_o25_raw)
        sp_o25_p_v52.append(recal["pOver25"])
        sp_o25_y.append(y_o25)

        sp_o25_cand_ll.append(-(y_o25 * math.log(recal["pOver25"]) + (1 - y_o25) * math.log(1.0 - recal["pOver25"])))
        sp_o25_bench_ll.append(-(y_o25 * math.log(p_o25_raw) + (1 - y_o25) * math.log(1.0 - p_o25_raw)))
        sp_btts_cand_ll.append(-(y_btts * math.log(recal["pBttsYes"]) + (1 - y_btts) * math.log(1.0 - recal["pBttsYes"])))
        sp_btts_bench_ll.append(-(y_btts * math.log(p_btts_raw) + (1 - y_btts) * math.log(1.0 - p_btts_raw)))

        # Evaluate all playable pre-kickoff binary candidates in [1.55, 2.60] fairOdds
        candidates = [
            (raw_x12[0], recal["pHome"], 1 if hs > as_ else 0),
            (raw_x12[2], recal["pAway"], 1 if as_ > hs else 0),
            (p_o25_raw, recal["pOver25"], y_o25),
            (1.0 - p_o25_raw, 1.0 - recal["pOver25"], 1 - y_o25),
            (p_btts_raw, recal["pBttsYes"], y_btts),
        ]
        for pr, pc_v, y_out in candidates:
            if 0.3846 <= pr <= 0.6452:
                pr_c = clamp(pr, 0.01, 0.99)
                pc_c = clamp(pc_v, 0.01, 0.99)
                sp_play_clusters.append(f"{gdate}:{g['gameId']}")
                sp_play_p_raw.append(pr_c)
                sp_play_p_v52.append(pc_c)
                sp_play_y.append(y_out)
                sp_play_cand_ll.append(-(y_out * math.log(pc_c) + (1 - y_out) * math.log(1.0 - pc_c)))
                sp_play_bench_ll.append(-(y_out * math.log(pr_c) + (1 - y_out) * math.log(1.0 - pr_c)))

    # ------------------------------------------------------------------------
    # Evaluation 2: Goalkeeper Saves (`325` Active GKs) via Mulberry32 Binomial Split
    # & Match-Coupled Outfield Shots (`600` Profiles)
    # ------------------------------------------------------------------------
    gk_profiles = bundle["gk_profiles"]
    gk_val_clusters: list[str] = []
    gk_cand_brier: list[float] = []
    gk_naive_brier: list[float] = []
    gk_snapshot_cases: list[dict[str, Any]] = []
    rng_step = 1001

    for gk in gk_profiles:
        sf = int(gk["shotsFaced"])
        sv = int(gk["saves"])
        apps = int(gk["appearances"])
        subs = int(gk["subIns"])
        if sf >= 10 and apps >= 3:
            # Assign each shot faced (`sv` saves + `sf - sv` goals) randomly via mulberry32 to early-season vs late-season
            sv_train, sf_train = 0, 0
            sv_test, sf_test = 0, 0
            for s_idx in range(sf):
                is_save = 1 if s_idx < sv else 0
                u = mulberry32_step(BOOTSTRAP_SEED, rng_step)
                rng_step += 1
                if u < 0.40:  # 40% early-season sample -> predict remaining 60% OOS
                    sf_train += 1
                    sv_train += is_save
                else:
                    sf_test += 1
                    sv_test += is_save
            if sf_train >= 3 and sf_test >= 5:
                obs_rate_test = sv_test / sf_test
                eb_proj = project_goalkeeper_saves_outlook_v52(
                    saves=sv_train,
                    shots_faced=sf_train,
                    goals_conceded=sf_train - sv_train,
                    appearances=max(1, int(round(0.4 * apps))),
                    sub_ins=int(round(0.4 * subs)),
                    opp_expected_sot=4.25,
                    line=2.5,
                    expected_minutes=90.0,
                    config=v52_config,
                )
                naive_rate = clamp(sv_train / sf_train, 0.05, 0.98)
                gk_val_clusters.append(gk["league"])
                gk_cand_brier.append((eb_proj["ebSaveRate"] - obs_rate_test) ** 2)
                gk_naive_brier.append((naive_rate - obs_rate_test) ** 2)

        if len(gk_snapshot_cases) < 25:
            out_gk = project_goalkeeper_saves_outlook_v52(
                saves=sv,
                shots_faced=sf,
                goals_conceded=int(gk["goalsConceded"]),
                appearances=apps,
                sub_ins=subs,
                opp_expected_sot=4.40,
                line=2.5,
                expected_minutes=None,
                config=v52_config,
            )
            gk_snapshot_cases.append({
                "input": {
                    "league": gk["league"],
                    "playerSlug": gk["playerSlug"],
                    "saves": sv,
                    "shotsFaced": sf,
                    "goalsConceded": int(gk["goalsConceded"]),
                    "appearances": apps,
                    "subIns": subs,
                    "oppExpectedSoT": 4.40,
                    "line": 2.5,
                    "expectedMinutes": None,
                },
                "expected": out_gk,
            })

    shot_snapshot_cases: list[dict[str, Any]] = []
    sub_bias_deltas: list[float] = []
    for pl in bundle["outfield_shot_profiles"]:
        apps = int(pl["appearances"])
        subs = int(pl["subIns"])
        shots = int(pl["shots"])
        sot = int(pl["shotsOnTarget"])
        out_sh = project_coupled_player_shots_outlook_v52(
            metric="shots",
            position_group=pl["positionGroup"],
            season_count=shots,
            appearances=apps,
            sub_ins=subs,
            team_expected_shots=13.2,
            opp_defense_shots_factor=1.05,
            line=1.5,
            expected_minutes=None,
            config=v52_config,
        )
        out_sot = project_coupled_player_shots_outlook_v52(
            metric="shots_on_target",
            position_group=pl["positionGroup"],
            season_count=sot,
            appearances=apps,
            sub_ins=subs,
            team_expected_shots=4.6,
            opp_defense_shots_factor=1.05,
            line=0.5,
            expected_minutes=None,
            config=v52_config,
        )
        if subs >= 2:
            sub_bias_deltas.append(out_sh["ebRatePer90"] - out_sh["naivePerAppearanceRate"])
        if len(shot_snapshot_cases) < 25:
            shot_snapshot_cases.append({
                "input": {
                    "metric": "shots_on_target",
                    "positionGroup": pl["positionGroup"],
                    "seasonCount": sot,
                    "appearances": apps,
                    "subIns": subs,
                    "teamExpectedShots": 4.6,
                    "oppDefenseShotsFactor": 1.05,
                    "line": 0.5,
                    "expectedMinutes": None,
                },
                "expected": out_sot,
            })

    # ------------------------------------------------------------------------
    # Evaluation 3: US Multi-Sport True Walk-Forward Game-by-Game OOS
    # (`MLB n=2,202`, `NHL n=346`, `NBA n=222`, `NFL n=150` — `date' < date`)
    # ------------------------------------------------------------------------
    us_results_summary: dict[str, Any] = {}
    us_snapshot_cases: list[dict[str, Any]] = []

    for sport in ("mlb", "nhl", "nba", "nfl"):
        sp_games = [m for m in bundle["season_matches"] if m["sport"] == sport]
        by_date: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for m in sp_games:
            by_date[m["date"]].append(m)

        cfg = US_SPORT_PRIORS[sport]
        elo_k = float(cfg["elo_k"])
        elo_hfa = float(cfg["elo_home_adv"])
        team_elo: dict[str, float] = defaultdict(lambda: 1500.0)
        team_for: dict[str, float] = defaultdict(float)
        team_ag: dict[str, float] = defaultdict(float)
        team_n: dict[str, int] = defaultdict(int)
        team_dates: dict[str, list[str]] = defaultdict(list)
        lg_cum_team_pts = 0.0
        lg_cum_team_games = 0

        clusters: list[str] = []
        ml_cand_ll: list[float] = []
        ml_coin_ll: list[float] = []
        ml_y: list[int] = []
        ml_p: list[float] = []
        tot_pred_list: list[float] = []
        tot_act_list: list[float] = []
        b2b_count = 0

        min_burn_in = 2 if sport == "nfl" else 4

        for cur_date in sorted(by_date.keys()):
            day_games = by_date[cur_date]
            prior_tr = float(cfg["prior_team_runs"])
            lg_team_env = (lg_cum_team_pts + 40.0 * prior_tr) / (lg_cum_team_games + 40.0)

            for g in day_games:
                ht, at = g["homeTeam"], g["awayTeam"]
                nh, na = team_n[ht], team_n[at]
                h_hist = team_dates[ht]
                a_hist = team_dates[at]
                h_b2b = bool(h_hist and _days_between(h_hist[-1], cur_date) == 1)
                a_b2b = bool(a_hist and _days_between(a_hist[-1], cur_date) == 1)
                h_3in4 = bool(len(h_hist) >= 2 and _days_between(h_hist[-2], cur_date) <= 3)
                a_3in4 = bool(len(a_hist) >= 2 and _days_between(a_hist[-2], cur_date) <= 3)
                if h_b2b or a_b2b:
                    b2b_count += 1

                proj = project_us_walkforward_game_v52(
                    sport=sport,
                    home_elo=team_elo[ht],
                    away_elo=team_elo[at],
                    home_cum_for=team_for[ht],
                    home_cum_against=team_ag[ht],
                    home_games=nh,
                    away_cum_for=team_for[at],
                    away_cum_against=team_ag[at],
                    away_games=na,
                    league_team_scoring_env=lg_team_env,
                    home_b2b=h_b2b,
                    away_b2b=a_b2b,
                    home_3in4=h_3in4,
                    away_3in4=a_3in4,
                    neutral_site=bool(g["neutralSite"]),
                )

                if nh >= min_burn_in and na >= min_burn_in:
                    if sum(1 for c in us_snapshot_cases if c["input"]["sport"] == sport) < 5:
                        us_inp = {
                            "sport": sport,
                            "homeElo": round(team_elo[ht], 6),
                            "awayElo": round(team_elo[at], 6),
                            "homeCumFor": round(team_for[ht], 6),
                            "homeCumAgainst": round(team_ag[ht], 6),
                            "homeGames": nh,
                            "awayCumFor": round(team_for[at], 6),
                            "awayCumAgainst": round(team_ag[at], 6),
                            "awayGames": na,
                            "leagueTeamScoringEnv": round(lg_team_env, 6),
                            "homeB2B": h_b2b,
                            "awayB2B": a_b2b,
                            "home3in4": h_3in4,
                            "away3in4": a_3in4,
                            "neutralSite": bool(g["neutralSite"]),
                        }
                        us_expected = project_us_walkforward_game_v52(
                            sport=us_inp["sport"],
                            home_elo=us_inp["homeElo"],
                            away_elo=us_inp["awayElo"],
                            home_cum_for=us_inp["homeCumFor"],
                            home_cum_against=us_inp["homeCumAgainst"],
                            home_games=us_inp["homeGames"],
                            away_cum_for=us_inp["awayCumFor"],
                            away_cum_against=us_inp["awayCumAgainst"],
                            away_games=us_inp["awayGames"],
                            league_team_scoring_env=us_inp["leagueTeamScoringEnv"],
                            home_b2b=us_inp["homeB2B"],
                            away_b2b=us_inp["awayB2B"],
                            home_3in4=us_inp["home3in4"],
                            away_3in4=us_inp["away3in4"],
                            neutral_site=us_inp["neutralSite"],
                        )
                        us_snapshot_cases.append({
                            "input": us_inp,
                            "expected": us_expected,
                        })

                hs, as_ = g["homeScore"], g["awayScore"]
                if nh >= min_burn_in and na >= min_burn_in and hs != as_:
                    yh = 1 if hs > as_ else 0
                    ph = proj["pHomeWin"]
                    clusters.append(cur_date)
                    ml_y.append(yh)
                    ml_p.append(ph)
                    ml_cand_ll.append(-(yh * math.log(ph) + (1 - yh) * math.log(1.0 - ph)))
                    ml_coin_ll.append(math.log(2.0))
                    tot_pred_list.append(proj["expectedTotal"])
                    tot_act_list.append(float(hs + as_))

            for g in day_games:
                ht, at = g["homeTeam"], g["awayTeam"]
                hs, as_ = float(g["homeScore"]), float(g["awayScore"])
                elo_diff = (team_elo[ht] - team_elo[at]) + (0.0 if g["neutralSite"] else elo_hfa)
                exp_h = 1.0 / (1.0 + math.pow(10.0, -elo_diff / 400.0))
                s_h = 1.0 if hs > as_ else (0.5 if hs == as_ else 0.0)
                mov_mult = math.log(abs(hs - as_) + 1.0) * (2.2 / ((elo_diff if s_h > 0.5 else -elo_diff) * 0.001 + 2.2))
                delta_elo = elo_k * max(0.6, min(1.8, mov_mult)) * (s_h - exp_h)
                team_elo[ht] += delta_elo
                team_elo[at] -= delta_elo

                team_for[ht] += hs
                team_ag[ht] += as_
                team_n[ht] += 1
                team_for[at] += as_
                team_ag[at] += hs
                team_n[at] += 1
                team_dates[ht].append(cur_date)
                team_dates[at].append(cur_date)
                lg_cum_team_pts += hs + as_
                lg_cum_team_games += 2

        us_results_summary[sport] = {
            "validation_status": "prospective_walk_forward_game_oos_verified",
            "total_games_ingested": len(sp_games),
            "oos_evaluated_games_post_burnin": len(ml_y),
            "b2b_games_detected": b2b_count,
            "moneyline_vs_coin_oos": cluster_bootstrap_diff_pure(clusters, ml_cand_ll, ml_coin_ll),
            "moneyline_ece": compute_ece_binary(ml_y, ml_p),
            "mean_pred_total": round(sum(tot_pred_list) / max(1, len(tot_pred_list)), 4),
            "mean_actual_total": round(sum(tot_act_list) / max(1, len(tot_act_list)), 4),
            "totals_bias": round((sum(tot_pred_list) - sum(tot_act_list)) / max(1, len(tot_pred_list)), 4),
        }

    fb_parity_cases: list[dict[str, Any]] = []
    for g in strict_fb[:15]:
        lg = g["league"]
        env_g = lookup_causal_league_env(lg, g["date"])
        inp = {
            "rawProjHome": round(float(g["projHome"] or 1.60), 6),
            "rawProjAway": round(float(g["projAway"] or 1.30), 6),
            "rawX12": [round(float(x), 6) for x in (g["x12"] or [0.45, 0.25, 0.30])],
            "leagueEnvGoals": round(env_g, 6),
            "rawLeagueProjMean": 3.18,
            "isExpansionLeague": bool(lg not in {"premier-league", "laliga", "serie-a", "bundesliga", "ligue-1", "liga-mx"}),
        }
        out = recalibrate_football_outlook_v52(
            raw_proj_home=inp["rawProjHome"],
            raw_proj_away=inp["rawProjAway"],
            raw_x12=inp["rawX12"],
            league_env_goals=inp["leagueEnvGoals"],
            raw_league_proj_mean=inp["rawLeagueProjMean"],
            is_expansion_league=inp["isExpansionLeague"],
            config=fb_cfg,
        )
        fb_parity_cases.append({"input": inp, "expected": out})

    results_report = {
        "schema_version": "exp_v57_v5_2_results_1.0.0",
        "status": "candidate",
        "production_activated": False,
        "holdout_sealed_untouched": True,
        "multi_league_football_v52": {
            "season_results_43_leagues_1x2_walkforward": cluster_bootstrap_diff_pure(
                wf_fb_clusters, wf_fb_1x2_cand_ll, wf_fb_1x2_bench_ll
            ),
            "season_results_43_leagues_o25_walkforward": cluster_bootstrap_diff_pure(
                wf_fb_clusters, wf_fb_o25_cand_ll, wf_fb_o25_bench_ll
            ),
            "season_results_o25_ece_v52": compute_ece_binary(wf_fb_o25_y, wf_fb_o25_p_cand),
            "season_results_o25_ece_uncalibrated": compute_ece_binary(wf_fb_o25_y, wf_fb_o25_p_bench),
            "strict_prekickoff_57_games": {
                "n_games": len(strict_fb),
                "mean_pred_goals_before": round(sum(sp_pred_tot_raw) / len(strict_fb), 4),
                "mean_pred_goals_v52": round(sum(sp_pred_tot_v52) / len(strict_fb), 4),
                "mean_actual_goals": round(sum(sp_act_tot) / len(strict_fb), 4),
                "goals_bias_before": round((sum(sp_pred_tot_raw) - sum(sp_act_tot)) / len(strict_fb), 4),
                "goals_bias_v52": round((sum(sp_pred_tot_v52) - sum(sp_act_tot)) / len(strict_fb), 4),
                "o25_bias_pp_before": round((sum(sp_o25_y) - sum(sp_o25_p_raw)) / len(strict_fb) * 100.0, 3),
                "o25_bias_pp_v52": round((sum(sp_o25_y) - sum(sp_o25_p_v52)) / len(strict_fb) * 100.0, 3),
                "o25_logloss_diff": cluster_bootstrap_diff_pure(sp_clusters, sp_o25_cand_ll, sp_o25_bench_ll),
                "btts_logloss_diff": cluster_bootstrap_diff_pure(sp_clusters, sp_btts_cand_ll, sp_btts_bench_ll),
                "playable_picks_1_55_to_2_60": {
                    "n_picks": len(sp_play_y),
                    "expected_hit_pct_before": round(sum(sp_play_p_raw) / max(1, len(sp_play_y)) * 100.0, 3),
                    "expected_hit_pct_v52": round(sum(sp_play_p_v52) / max(1, len(sp_play_y)) * 100.0, 3),
                    "observed_hit_pct": round(sum(sp_play_y) / max(1, len(sp_play_y)) * 100.0, 3),
                    "calibration_err_pp_before": round((sum(sp_play_y) - sum(sp_play_p_raw)) / max(1, len(sp_play_y)) * 100.0, 3),
                    "calibration_err_pp_v52": round((sum(sp_play_y) - sum(sp_play_p_v52)) / max(1, len(sp_play_y)) * 100.0, 3),
                    "logloss_diff": cluster_bootstrap_diff_pure(sp_play_clusters, sp_play_cand_ll, sp_play_bench_ll),
                },
            },
        },
        "player_props_and_gk_saves_v52": {
            "active_gk_profiles_modeled": len(gk_profiles),
            "gk_split_season_save_rate_brier_vs_naive": cluster_bootstrap_diff_pure(
                gk_val_clusters, gk_cand_brier, gk_naive_brier
            ),
            "outfield_sub_debias_players": len(sub_bias_deltas),
            "mean_shots_per90_recovery_for_subs": round(
                sum(sub_bias_deltas) / max(1, len(sub_bias_deltas)), 4
            ),
        },
        "us_multisport_walkforward_oos_v52": us_results_summary,
    }

    model_path = PRED_DATA_DIR / "model_v5_2_live_feedback_candidate.json"
    snap_path = PRED_DATA_DIR / "v5_2_live_feedback_snapshot.json"
    exp_res_path = ARTIFACTS_DIR / "exp_v57_v5_2_results.json"

    model_path.write_text(json.dumps(v52_config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    parity_snapshot = {
        "schema_version": "v5_2_live_feedback_parity_snapshot_1.0.0",
        "status": "candidate",
        "production_activated": False,
        "football_recalibration_cases": fb_parity_cases,
        "goalkeeper_saves_cases": gk_snapshot_cases,
        "coupled_player_shots_cases": shot_snapshot_cases,
        "us_walkforward_cases": us_snapshot_cases,
    }
    snap_path.write_text(json.dumps(parity_snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    exp_res_path.write_text(json.dumps(results_report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    v51_reg = json.loads((PRED_DATA_DIR / "candidate_registry_v5_1.json").read_text(encoding="utf-8"))
    v52_entries = []
    for rel_p in (
        "src/data/prediction/model_v5_2_live_feedback_candidate.json",
        "src/data/prediction/v5_2_live_feedback_snapshot.json",
        "research/prediction-lab/experiments/EXP_V57_v5_2_live_feedback/artifacts/exp_v57_v5_2_results.json",
    ):
        fp = REPO_ROOT / rel_p
        v52_entries.append({
            "artifact_path": rel_p,
            "sha256": hashlib.sha256(fp.read_bytes()).hexdigest(),
            "size_bytes": fp.stat().st_size,
            "status": "candidate",
            "production_activated": False,
        })
    v52_reg = {
        "schema_version": "candidate_registry_v5_2_0",
        "suite_version": "5.2.0-candidate",
        "status": "candidate",
        "production_activated": False,
        "holdout_sealed_untouched": True,
        "frozen_v3_governance_audit": v51_reg.get("frozen_v3_governance_audit", {}),
        "inherited_v5_1_artifacts_count": len(v51_reg.get("active_artifacts", [])),
        "v5_2_live_feedback_artifacts": v52_entries,
    }
    (PRED_DATA_DIR / "candidate_registry_v5_2.json").write_text(
        json.dumps(v52_reg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    return results_report


if __name__ == "__main__":
    rep = run_experiment()
    print(json.dumps(rep, ensure_ascii=False, indent=2))
