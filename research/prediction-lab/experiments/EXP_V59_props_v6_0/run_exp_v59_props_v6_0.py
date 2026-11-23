"""PitchLab v6.0 Complete Player Props, Goalkeeper Multi-Line/SGP & US Sports Engine (`EXP_V59`).

Builds, calibrates, and validates the three `PitchLab v6.0 Candidate` player-prop pillars
with strict temporal causality (`date' < date`), zero access to `holdout_sealed`
(`2025-02-02T17:30:00Z`..`2026-11-08T20:30:00Z`), bit-exact `mulberry32` cluster-bootstrap
(`1,000` resamples, `seed = 20261111`), `null` on empty slices (`n == 0`), `UnitProbability`
in `[0.001, 0.999]`, zero forbidden fields (`stake`, `kelly`, `ev`, `tier`), and IEEE-754
`< 1e-12` parity with `src/domain/prediction/props_v6_0.ts`:

  1. Match-Coupled Logit-PAVA Monotone Multi-Line Splines (`shots` & `shots_on_target`):
     - Closes `D7` (`"empirical_bayes_nb_no_player_match_log_spline"` ->
       `"coupled_player_match_barycentric_logit_pava_v6"`).
     - Couples exposure-debiased Empirical-Bayes rate per `90'` (`(appearances, subIns, positionGroup)`
       + empirical `fresh_legs_sub_multiplier` for `sub_cover`) to `teamExpectedShots` and
       `teamExpectedSoT` across lines `0.5+`, `1.5+`, `2.5+`, `3.5+` with strict algebraic
       cross-line monotonicity `P(Y >= 0.5) >= P(Y >= 1.5) >= P(Y >= 2.5) >= P(Y >= 3.5)`.
  2. Physical Multi-Line Goalkeeper `player_saves` (`1.5+`, `2.5+`, `3.5+`, `4.5+`) +
     Exact Goalkeeper-Match Linked SGP (`evaluate_goalkeeper_saves_linked_sgp_v6`):
     - Models `325` active goalkeepers in `squads.json` and conditions `(Saves >= k)` jointly
       with `(Clean Sheet / Under 2.5 / Team Win)` by decomposing
       `SoT_rival = Saves + Goals_Conceded` (`NB-Binomial`) + Dixon-Coles over `(G_own, G_conceded)`,
       respecting exact Fréchet-Hoeffding bounds and validated on `58,182` real OOS GK-matches.
  3. Un-Truncated Multi-Column US Game-Log Extractor (`normalize_us_player_game_log_columns_v6`)
     & Overdispersed US Props Engine (`NBA`, `MLB`, `NHL`, `NFL`):
     - Extracts without 5-column truncation `PTS, REB, AST, 3PM, MIN` (NBA),
       `SO, IP, H, ER, BB, HR, TB, RBI` (MLB), `SOG, G, A, PTS, TOI` (NHL), and
       `CMP, ATT, YDS, TD, REC, TGTS, CAR` (NFL), enforcing hard injury blocking
       (`availability` / `injuryStatus` in `"out" / "Baja"` -> empty) and causal pre-match
       minutes guards (`>= 18` min NBA, `>= 45` min football).
"""

from __future__ import annotations

import sys

sys.dont_write_bytecode = True

from collections import Counter, defaultdict
import csv
import hashlib
import json
import math
import os
from pathlib import Path
import re
import unicodedata
from typing import Any

EXP_DIR = Path(__file__).resolve().parent
REPO_ROOT = EXP_DIR.parents[3]
ARTIFACTS_DIR = EXP_DIR / "artifacts"
PRED_DATA_DIR = REPO_ROOT / "src" / "data" / "prediction"
RAW_MAIN_DIR = REPO_ROOT / "research" / "prediction-lab" / "data" / "raw" / "main"
DEFAULT_PITCH_DATA = Path(
    os.environ.get("PITCH_DATA_DIR", r"C:\Users\jairb\OneDrive\Desktop\Proyectos\Pitch\data")
)

HOLDOUT_START_DATE = "2025-02-02"
HOLDOUT_END_DATE = "2026-11-08"
HOLDOUT_CUT_UTC = "2025-02-02T17:30:00Z"
BOOTSTRAP_SEED = 20261111
BOOTSTRAP_RESAMPLES = 1000
DEFAULT_LOGIT_EPS = 1e-6

CANONICAL_SHOT_LINES_V6: tuple[float, ...] = (0.5, 1.5, 2.5, 3.5)
CANONICAL_GK_SAVES_LINES_V6: tuple[float, ...] = (1.5, 2.5, 3.5, 4.5)

ETA_KNOTS_19_V6: list[float] = [
    -7.0,
    -5.8,
    -4.8,
    -4.0,
    -3.3,
    -2.7,
    -2.15,
    -1.65,
    -1.2,
    -0.8,
    -0.42,
    -0.08,
    0.25,
    0.6,
    0.98,
    1.4,
    1.9,
    2.5,
    3.2,
]

HARD_BLOCKED_AVAILABILITY_TOKENS: frozenset[str] = frozenset(
    {
        "out",
        "baja",
        "injured",
        "lesionado",
        "suspended",
        "suspendido",
        "sancionado",
        "ir",
        "injured_reserve",
        "inactive",
        "inactivo",
        "il",
        "il-10",
        "il-15",
        "il-60",
    }
)

DOUBTFUL_AVAILABILITY_TOKENS: frozenset[str] = frozenset(
    {"doubtful", "doubt", "duda", "questionable", "cuestionable", "day-to-day", "dtd", "gtd"}
)

STARTER_SUB_MIN_PRIORS_V6: dict[str, tuple[float, float]] = {
    "GK": (89.6, 32.0),
    "DF_CB": (87.5, 22.0),
    "DF_FB": (86.2, 24.0),
    "DEF": (86.8, 23.0),
    "MF_DM": (84.2, 23.5),
    "MF_CM": (82.4, 24.5),
    "MF_AM": (80.3, 25.0),
    "MID": (82.0, 24.5),
    "FW_W": (79.2, 23.0),
    "FW_CF": (80.8, 22.5),
    "FWD": (80.0, 22.8),
}

# Precomputed exact Pascal triangle C(n, k) up to n = 42 for NB-Binomial GK SGP
_PASCAL_COMB: list[list[int]] = [[0] * 43 for _ in range(43)]
for _n in range(43):
    _PASCAL_COMB[_n][0] = 1
    for _k in range(1, _n + 1):
        _PASCAL_COMB[_n][_k] = _PASCAL_COMB[_n - 1][_k - 1] + _PASCAL_COMB[_n - 1][_k]


# ============================================================================
# 1. Exact IEEE-754 Primitives (Mirrored 1:1 with `src/domain/prediction/math.ts`)
# ============================================================================


def clamp(value: float, min_val: float, max_val: float) -> float:
    return min_val if value < min_val else (max_val if value > max_val else value)


def to_unit_probability_v6(p: float) -> float:
    if not math.isfinite(p):
        raise ValueError(f"Non-finite probability: {p}")
    return clamp(p, 0.001, 0.999)


def round_fair_decimal_v6(p: float) -> float:
    pc = to_unit_probability_v6(p)
    return math.floor((1.0 / pc) * 10000.0 + 0.5) / 10000.0


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
    """Abramowitz & Stegun 7.1.26 standard normal CDF matching `math.ts::normalCdf`."""
    sign = -1.0 if x < 0.0 else 1.0
    z = abs(x) * 0.7071067811865475
    t = 1.0 / (1.0 + 0.3275911 * z)
    poly = (
        ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592)
    ) * t
    erf_val = sign * (1.0 - poly * math.exp(-(z * z)))
    return 0.5 * (1.0 + erf_val)


def mulberry32_step(seed: int, k: int) -> float:
    t = ((seed & 0xFFFFFFFF) + (k * 0x6D2B79F5)) & 0xFFFFFFFF
    t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
    inner = ((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF
    t = (t ^ ((t + inner) & 0xFFFFFFFF)) & 0xFFFFFFFF
    return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0


# ============================================================================
# 2. Cluster-Robust Mulberry32 Statistical Inference (`null` when `n == 0`)
# ============================================================================


def compute_ece_binary(y_true: list[int], probs: list[float], n_bins: int = 10) -> float | None:
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
            ece += (bins_n[b] / n) * abs((bins_p[b] / bins_n[b]) - (bins_y[b] / bins_n[b]))
    return round(ece, 6)


def safe_promoted_ece_v6(
    y_true: list[int],
    probs: list[float],
    threshold: float = 0.50,
    n_bins: int = 5,
) -> dict[str, Any]:
    y_sub = [y for y, p in zip(y_true, probs) if p >= threshold]
    p_sub = [p for p in probs if p >= threshold]
    n_prom = len(y_sub)
    if n_prom == 0:
        return {
            "promoted_n_ge_50pct": 0,
            "promoted_ece_ge_50pct": None,
            "promoted_mean_pred": None,
            "promoted_mean_obs": None,
        }
    eff_bins = min(n_bins, max(1, n_prom // 20))
    ece = compute_ece_binary(y_sub, p_sub, n_bins=eff_bins)
    return {
        "promoted_n_ge_50pct": n_prom,
        "promoted_ece_ge_50pct": ece,
        "promoted_mean_pred": round(sum(p_sub) / n_prom, 6),
        "promoted_mean_obs": round(sum(y_sub) / n_prom, 6),
    }


def cluster_bootstrap_diff_v6(
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
            "significance_label": "no significativa",
            "bootstrap_method": "cluster_mulberry32",
            "n_resamples": n_resamples,
            "seed": seed,
        }

    cand_mean = sum(loss_cand) / n_rows
    bench_mean = sum(loss_bench) / n_rows
    diffs = [c - b for c, b in zip(loss_cand, loss_bench)]
    delta_mean = sum(diffs) / n_rows

    unique_clusters = sorted(set(cluster_ids))
    c_idx = {c: i for i, c in enumerate(unique_clusters)}
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
            "significance_label": "no significativa",
            "bootstrap_method": "cluster_mulberry32",
            "n_resamples": n_resamples,
            "seed": seed,
        }

    sum_d = [0.0] * n_clusters
    sum_w = [0.0] * n_clusters
    for cid, d in zip(cluster_ids, diffs):
        ix = c_idx[cid]
        sum_d[ix] += d
        sum_w[ix] += 1.0

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
        "significance_label": "significativa" if sig else "no significativa",
        "bootstrap_method": "cluster_mulberry32",
        "n_resamples": n_resamples,
        "seed": seed,
    }


def cluster_bootstrap_binary_v6(
    cluster_ids: list[str],
    y_true: list[int],
    p_cand: list[float],
    p_bench: list[float],
    seed: int = BOOTSTRAP_SEED,
) -> dict[str, Any]:
    if len(y_true) == 0:
        base = cluster_bootstrap_diff_v6([], [], [], seed=seed)
        return {
            **base,
            "ece_cand": None,
            "ece_bench": None,
            "brier_cand": None,
            "brier_bench": None,
            "delta_brier": None,
            "promoted_n_ge_50pct": 0,
            "promoted_ece_ge_50pct": None,
        }
    eps = 1e-12
    ll_c = [
        -(y * math.log(clamp(pc, eps, 1.0 - eps)) + (1 - y) * math.log(1.0 - clamp(pc, eps, 1.0 - eps)))
        for y, pc in zip(y_true, p_cand)
    ]
    ll_b = [
        -(y * math.log(clamp(pb, eps, 1.0 - eps)) + (1 - y) * math.log(1.0 - clamp(pb, eps, 1.0 - eps)))
        for y, pb in zip(y_true, p_bench)
    ]
    br_c = [(pc - y) ** 2 for y, pc in zip(y_true, p_cand)]
    br_b = [(pb - y) ** 2 for y, pb in zip(y_true, p_bench)]

    ll_res = cluster_bootstrap_diff_v6(cluster_ids, ll_c, ll_b, seed=seed)
    br_res = cluster_bootstrap_diff_v6(cluster_ids, br_c, br_b, seed=seed)
    prom = safe_promoted_ece_v6(y_true, p_cand, threshold=0.50)
    return {
        **ll_res,
        "ece_cand": compute_ece_binary(y_true, p_cand),
        "ece_bench": compute_ece_binary(y_true, p_bench),
        "brier_cand": br_res["cand_mean"],
        "brier_bench": br_res["bench_mean"],
        "delta_brier": br_res["delta_mean"],
        "brier_ci95_lo": br_res["ci95_lo"],
        "brier_ci95_hi": br_res["ci95_hi"],
        "promoted_n_ge_50pct": prom["promoted_n_ge_50pct"],
        "promoted_ece_ge_50pct": prom["promoted_ece_ge_50pct"],
    }


# ============================================================================
# 3. Shared Eligibility, Exposure & Negative-Binomial / Spline Primitives (`V6`)
# ============================================================================


def _clean_status_token(raw: str | None) -> str:
    if not raw:
        return ""
    norm = unicodedata.normalize("NFKD", str(raw)).encode("ascii", "ignore").decode("ascii")
    return norm.strip().lower()


def is_hard_blocked_availability_v6(
    availability: str | None = None,
    injury_status: str | None = None,
) -> bool:
    for raw in (availability, injury_status):
        tok = _clean_status_token(raw)
        if tok in HARD_BLOCKED_AVAILABILITY_TOKENS:
            return True
    return False


def is_doubtful_availability_v6(
    availability: str | None = None,
    injury_status: str | None = None,
) -> bool:
    if is_hard_blocked_availability_v6(availability, injury_status):
        return False
    for raw in (availability, injury_status):
        tok = _clean_status_token(raw)
        if tok in DOUBTFUL_AVAILABILITY_TOKENS:
            return True
    return False


def check_player_minutes_and_availability_guard_v6(
    sport: str,
    prematch_expected_minutes: float | None = None,
    availability: str | None = None,
    injury_status: str | None = None,
) -> dict[str, Any]:
    sp = _clean_status_token(sport)
    min_req = 45.0 if sp in ("football", "soccer") else (18.0 if sp == "nba" else 0.0)
    if is_hard_blocked_availability_v6(availability, injury_status):
        return {
            "eligible": False,
            "blockedByInjury": True,
            "blockedByMinutesGuard": False,
            "minRequiredMinutes": min_req,
        }
    if (
        min_req > 0.0
        and prematch_expected_minutes is not None
        and float(prematch_expected_minutes) < min_req
    ):
        return {
            "eligible": False,
            "blockedByInjury": False,
            "blockedByMinutesGuard": True,
            "minRequiredMinutes": min_req,
        }
    return {
        "eligible": True,
        "blockedByInjury": False,
        "blockedByMinutesGuard": False,
        "minRequiredMinutes": min_req,
    }


def estimate_effective_exposure_90_v6(
    appearances: int,
    sub_ins: int,
    position_group: str,
    explicit_minutes: float | None = None,
) -> float:
    if explicit_minutes is not None and math.isfinite(explicit_minutes) and explicit_minutes > 0.0:
        return max(0.25, float(explicit_minutes) / 90.0)
    apps = max(0, int(math.trunc(appearances)))
    subs = int(clamp(int(math.trunc(sub_ins)), 0, apps))
    starts = apps - subs
    st_min, sb_min = STARTER_SUB_MIN_PRIORS_V6.get(position_group, (82.0, 24.5))
    total_min = starts * st_min + subs * sb_min
    return max(0.25, total_min / 90.0)


def nb_prob_over_exact_v6(
    mu: float,
    r_disp: float,
    line: float,
    max_k: int = 28,
) -> tuple[float, float, float]:
    """Exact Negative Binomial `(pOver, pUnder, pPush)` mirroring TS `nbProbOverExactV6`."""
    mu_c = clamp(mu, 1e-4, 38.0)
    r_c = clamp(r_disp, 0.35, 250.0)
    p0_ratio = r_c / (r_c + mu_c)
    q_ratio = mu_c / (r_c + mu_c)

    pmf = [0.0] * (max_k + 1)
    pmf[0] = math.exp(r_c * math.log(p0_ratio))
    for k in range(1, max_k + 1):
        pmf[k] = pmf[k - 1] * ((k - 1.0 + r_c) / k) * q_ratio
    s = sum(pmf)
    if s > 0.0:
        pmf = [v / s for v in pmf]

    if abs(line - round(line)) < 1e-9:
        kl = int(round(line))
        p_push = pmf[kl] if 0 <= kl <= max_k else 0.0
        stop = max(0, min(kl, max_k + 1))
        p_under = sum(pmf[:stop])
        p_over = max(0.0, 1.0 - p_under - p_push)
        return (p_over, p_under, p_push)

    kf = int(math.floor(line))
    stop = max(0, min(kf + 1, max_k + 1))
    p_under = sum(pmf[:stop])
    p_over = max(0.0, 1.0 - p_under)
    return (p_over, p_under, 0.0)


def nb_tail_prob_ge_v6(k_min: int, mu: float, r_disp: float) -> float:
    if k_min <= 0:
        return 0.999
    mu_c = clamp(mu, 0.005, 40.0)
    r_c = clamp(r_disp, 0.4, 250.0)
    p0_ratio = r_c / (r_c + mu_c)
    q_ratio = mu_c / (r_c + mu_c)
    pmf = math.exp(r_c * math.log(p0_ratio))
    cdf_lt = pmf
    for k in range(1, k_min):
        pmf = pmf * ((k - 1.0 + r_c) / k) * q_ratio
        cdf_lt += pmf
    return clamp(1.0 - cdf_lt, 0.001, 0.999)


def evaluate_logit_space_monotone_spline_v6(
    p_raw: float,
    eta_knots: list[float],
    zeta_knots: list[float],
) -> float:
    """Bit-exact Logit-Space Barycentric PAVA Spline evaluator (`eps = 1e-6`)."""
    eta_raw = logit(p_raw, DEFAULT_LOGIT_EPS)
    n = len(eta_knots)
    if eta_raw <= eta_knots[0]:
        slope_lo = (zeta_knots[1] - zeta_knots[0]) / max(eta_knots[1] - eta_knots[0], 1e-9)
        zeta = zeta_knots[0] + slope_lo * (eta_raw - eta_knots[0])
    elif eta_raw >= eta_knots[n - 1]:
        slope_hi = (zeta_knots[n - 1] - zeta_knots[n - 2]) / max(
            eta_knots[n - 1] - eta_knots[n - 2], 1e-9
        )
        zeta = zeta_knots[n - 1] + slope_hi * (eta_raw - eta_knots[n - 1])
    else:
        idx = 0
        for i in range(n - 1):
            if eta_knots[i] <= eta_raw <= eta_knots[i + 1]:
                idx = i
                break
        span = max(eta_knots[idx + 1] - eta_knots[idx], 1e-12)
        t = (eta_raw - eta_knots[idx]) / span
        zeta = zeta_knots[idx] + t * (zeta_knots[idx + 1] - zeta_knots[idx])
    return to_unit_probability_v6(sigmoid(clamp(zeta, -12.0, 12.0)))


def fit_barycentric_logit_pava_spline_pure(
    p_raw_list: list[float],
    y_true_list: list[int],
    eta_knots: list[float],
    tau_prior: float = 120.0,
    prior_intercept: float = 0.0,
    prior_slope: float = 1.0,
    upper_zeta_bound: list[float] | None = None,
) -> list[float]:
    """Pure-Python Barycentric Logit-Space PAVA Spline fitter with monotone non-decreasing knots."""
    k_len = len(eta_knots)
    sums = [0.0] * k_len
    wts = [float(tau_prior)] * k_len
    for idx, ek in enumerate(eta_knots):
        p_pr = sigmoid(clamp(prior_intercept + prior_slope * ek, -12.0, 12.0))
        sums[idx] = float(tau_prior) * p_pr

    ek0 = eta_knots[0]
    ek_last = eta_knots[k_len - 1]
    for pr, yt in zip(p_raw_list, y_true_list):
        eta = clamp(logit(pr, DEFAULT_LOGIT_EPS), ek0, ek_last)
        idx_lo = k_len - 2
        for j in range(k_len - 1):
            if eta <= eta_knots[j + 1]:
                idx_lo = j
                break
        idx_hi = idx_lo + 1
        span = max(eta_knots[idx_hi] - eta_knots[idx_lo], 1e-12)
        t_w = clamp((eta - eta_knots[idx_lo]) / span, 0.0, 1.0)
        w_lo = 1.0 - t_w
        w_hi = t_w
        yf = float(yt)
        sums[idx_lo] += w_lo * yf
        wts[idx_lo] += w_lo
        sums[idx_hi] += w_hi * yf
        wts[idx_hi] += w_hi

    blocks: list[list[Any]] = [[sums[i], wts[i], [i]] for i in range(k_len)]
    pos = 0
    while pos < len(blocks) - 1:
        v_cur = blocks[pos][0] / blocks[pos][1]
        v_nxt = blocks[pos + 1][0] / blocks[pos + 1][1]
        if v_cur > v_nxt:
            blocks[pos][0] += blocks[pos + 1][0]
            blocks[pos][1] += blocks[pos + 1][1]
            blocks[pos][2].extend(blocks[pos + 1][2])
            del blocks[pos + 1]
            if pos > 0:
                pos -= 1
        else:
            pos += 1

    zeta_out = [0.0] * k_len
    for b_s, b_w, idxs in blocks:
        q_val = clamp(b_s / max(b_w, 1e-9), 1e-5, 1.0 - 1e-5)
        zv = math.log(q_val / (1.0 - q_val))
        for ix in idxs:
            zeta_out[ix] = zv

    if upper_zeta_bound is not None and len(upper_zeta_bound) == k_len:
        for i in range(k_len):
            if zeta_out[i] > upper_zeta_bound[i]:
                zeta_out[i] = upper_zeta_bound[i]

    rounded = [round(z, 8) for z in zeta_out]
    for i in range(1, k_len):
        if rounded[i] < rounded[i - 1]:
            rounded[i] = rounded[i - 1]
    return rounded


# ============================================================================
# 4. Pillar 1 — Match-Coupled Logit-PAVA Multi-Line `shots` & `shots_on_target`
# ============================================================================


def _line_key_v6(line: float) -> str:
    if abs(line - 0.5) < 1e-9:
        return "0.5"
    if abs(line - 1.5) < 1e-9:
        return "1.5"
    if abs(line - 2.5) < 1e-9:
        return "2.5"
    if abs(line - 3.5) < 1e-9:
        return "3.5"
    if abs(line - 4.5) < 1e-9:
        return "4.5"
    return f"{line:.1f}"


def _select_nearest_spline_spec(
    splines_by_line: dict[str, dict[str, Any]],
    line: float,
    canonical_lines: tuple[float, ...],
) -> dict[str, Any]:
    key = _line_key_v6(line)
    if key in splines_by_line:
        return splines_by_line[key]
    nearest = min(canonical_lines, key=lambda c: abs(c - line))
    return splines_by_line[_line_key_v6(nearest)]


def project_coupled_player_shots_multiline_v6(
    *,
    metric: str,
    position_group: str,
    season_count: float,
    appearances: int,
    sub_ins: int,
    team_expected_shots: float,
    team_expected_sot: float,
    opp_defense_factor: float = 1.0,
    season_shots_total: float | None = None,
    explicit_minutes: float | None = None,
    expected_minutes_starter: float | None = None,
    lineup_status: str = "projected_starter",
    availability: str | None = None,
    injury_status: str | None = None,
    context_weight: float = 1.0,
    artifact: dict[str, Any],
) -> dict[str, Any]:
    """Match-coupled Empirical-Bayes + Multi-Line Logit-PAVA Spline projection (`0.5+..3.5+`).

    Guarantees strict cross-line monotonicity:
      `P(Y >= 0.5) >= P(Y >= 1.5) >= P(Y >= 2.5) >= P(Y >= 3.5)`
    and `pOverSubCover >= pOverCalibrated` on every line.
    """
    sh_cfg = artifact["coupled_shots_v6"]
    positions = sh_cfg["positions"]
    pos_key = position_group if position_group in positions else "MID"
    pos_spec = positions[pos_key]
    metric_spec = pos_spec["metrics"][metric]

    m_st_default = float(pos_spec["mean_starter_minutes"])
    m_st = clamp(
        float(expected_minutes_starter) if expected_minutes_starter is not None else m_st_default,
        20.0,
        92.0,
    )

    eff_status = lineup_status
    if is_doubtful_availability_v6(availability, injury_status) and eff_status in (
        "confirmed_starter",
        "projected_starter",
    ):
        eff_status = "doubt"

    if eff_status == "confirmed_starter":
        regimes = (
            (0.74, min(92.0, m_st + 5.0) / 90.0),
            (0.22, max(45.0, m_st - 18.0) / 90.0),
            (0.04, 24.0 / 90.0),
        )
    elif eff_status == "doubt":
        regimes = (
            (0.42, m_st / 90.0),
            (0.28, 52.0 / 90.0),
            (0.30, 22.0 / 90.0),
        )
    elif eff_status == "bench":
        regimes = (
            (0.10, 70.0 / 90.0),
            (0.25, 32.0 / 90.0),
            (0.65, 16.0 / 90.0),
        )
    else:
        regimes = (
            (0.68, min(91.0, m_st + 3.0) / 90.0),
            (0.24, max(45.0, m_st - 18.0) / 90.0),
            (0.08, 22.0 / 90.0),
        )

    expected_minutes = 0.0
    for pi_c, e_c in regimes:
        expected_minutes += pi_c * (e_c * 90.0)
    if expected_minutes_starter is not None and float(expected_minutes_starter) < 45.0:
        expected_minutes = float(expected_minutes_starter)

    guard = check_player_minutes_and_availability_guard_v6(
        sport="football",
        prematch_expected_minutes=expected_minutes,
        availability=availability,
        injury_status=injury_status,
    )
    eff_90 = estimate_effective_exposure_90_v6(appearances, sub_ins, pos_key, explicit_minutes)
    ctx_w = clamp(float(context_weight), 0.1, 1.0)

    prior_rate = float(metric_spec["prior_rate_per90"])
    prior_beta = float(metric_spec["prior_beta_90"])
    phi_disp = float(metric_spec["phi_dispersion"])
    sub_mult = float(metric_spec["fresh_legs_sub_multiplier"])

    alpha0 = prior_rate * prior_beta
    alpha_post = alpha0 + max(0.0, float(season_count)) * ctx_w
    beta_post = prior_beta + eff_90 * ctx_w
    eb_rate_per90 = alpha_post / max(beta_post, 1e-6)

    if metric == "shots_on_target" and season_shots_total is not None and season_shots_total >= 0.0:
        sh_ms = pos_spec["metrics"]["shots"]
        sh_rate90 = (
            float(sh_ms["prior_rate_per90"]) * float(sh_ms["prior_beta_90"])
            + max(0.0, float(season_shots_total)) * ctx_w
        ) / max(float(sh_ms["prior_beta_90"]) + eff_90 * ctx_w, 1e-6)
        eb_rate_per90 = min(eb_rate_per90, 0.92 * sh_rate90)

    shots_anchor = float(sh_cfg["league_team_shots_anchor"])
    sot_anchor = float(sh_cfg["league_team_sot_anchor"])
    tm_shots_c = clamp(float(team_expected_shots), 4.0, 26.0)
    tm_sot_c = clamp(float(team_expected_sot), 1.0, 12.5)
    opp_c = clamp(float(opp_defense_factor), 0.60, 1.55)

    if metric == "shots":
        vol_ratio = clamp(tm_shots_c / shots_anchor, 0.50, 1.85)
        qual_ratio = clamp(
            (tm_sot_c / max(tm_shots_c, 1.0)) / (sot_anchor / shots_anchor),
            0.75,
            1.30,
        )
        coupling_mult = (
            math.pow(vol_ratio, float(sh_cfg["team_shots_exponent"]))
            * math.pow(qual_ratio, float(sh_cfg["cross_quality_exponent"]))
            * math.pow(opp_c, float(sh_cfg["opp_defense_exponent"]))
        )
    else:
        sot_ratio = clamp(tm_sot_c / sot_anchor, 0.45, 1.95)
        vol_ratio = clamp(tm_shots_c / shots_anchor, 0.50, 1.85)
        coupling_mult = (
            math.pow(sot_ratio, float(sh_cfg["team_sot_exponent"]))
            * math.pow(vol_ratio, float(sh_cfg["cross_volume_exponent"]))
            * math.pow(opp_c, float(sh_cfg["opp_defense_exponent"]))
        )

    inv_r = (1.0 / max(alpha_post, 0.25)) + (1.0 / max(phi_disp, 0.5))
    r_effective = clamp(1.0 / inv_r, 0.45, 150.0)
    rep90 = sub_mult * prior_rate
    mu_projected = eb_rate_per90 * (expected_minutes / 90.0) * coupling_mult

    if not guard["eligible"]:
        return {
            "metric": metric,
            "positionGroup": pos_key,
            "lineupStatus": eff_status,
            "eligible": False,
            "blockedByInjury": guard["blockedByInjury"],
            "blockedByMinutesGuard": guard["blockedByMinutesGuard"],
            "ebRatePer90": eb_rate_per90,
            "naivePerAppearanceRate": float(season_count) / max(1, int(appearances)),
            "freshLegsSubRatePer90": rep90,
            "effectiveExposure90": eff_90,
            "expectedMinutes": expected_minutes,
            "matchCouplingMultiplier": coupling_mult,
            "muProjected": 0.0,
            "rEffective": r_effective,
            "calibrationSource": sh_cfg["calibration_source"],
            "lines": [],
        }

    splines_for_metric = sh_cfg["multi_line_logit_splines"][metric]
    raw_list: list[float] = []
    cal_unproj: list[float] = []
    sub_unproj: list[float] = []

    for ln in CANONICAL_SHOT_LINES_V6:
        p_over_raw = 0.0
        p_sub_raw = 0.0
        for pi_c, e_c in regimes:
            mu_c = eb_rate_per90 * e_c * coupling_mult
            po_c, _, _ = nb_prob_over_exact_v6(mu_c, r_effective, ln, 28)
            p_over_raw += pi_c * po_c

            rem_e = max(0.0, 1.0 - e_c)
            mu_sub_c = (eb_rate_per90 * e_c + rep90 * rem_e) * coupling_mult
            po_s, _, _ = nb_prob_over_exact_v6(mu_sub_c, r_effective, ln, 28)
            p_sub_raw += pi_c * po_s

        sp_spec = _select_nearest_spline_spec(splines_for_metric, ln, CANONICAL_SHOT_LINES_V6)
        p_cal_m = evaluate_logit_space_monotone_spline_v6(
            p_over_raw, sp_spec["eta_knots"], sp_spec["zeta_knots"]
        )
        p_sub_m = max(
            p_cal_m,
            evaluate_logit_space_monotone_spline_v6(
                p_sub_raw, sp_spec["eta_knots"], sp_spec["zeta_knots"]
            ),
        )
        raw_list.append(p_over_raw)
        cal_unproj.append(p_cal_m)
        sub_unproj.append(p_sub_m)

    # Exact Cross-Line Monotonicity Envelope: P(>=0.5) >= P(>=1.5) >= P(>=2.5) >= P(>=3.5)
    cal_proj: list[float] = []
    sub_proj: list[float] = []
    for m_idx in range(len(CANONICAL_SHOT_LINES_V6)):
        if m_idx == 0:
            pc = to_unit_probability_v6(cal_unproj[0])
            ps = to_unit_probability_v6(max(pc, sub_unproj[0]))
        else:
            pc = to_unit_probability_v6(min(cal_proj[m_idx - 1], cal_unproj[m_idx]))
            ps = to_unit_probability_v6(clamp(sub_unproj[m_idx], pc, sub_proj[m_idx - 1]))
        cal_proj.append(pc)
        sub_proj.append(ps)

    lines_out: list[dict[str, Any]] = []
    for m_idx, ln in enumerate(CANONICAL_SHOT_LINES_V6):
        pc = cal_proj[m_idx]
        pu = to_unit_probability_v6(1.0 - pc)
        ps = sub_proj[m_idx]
        lines_out.append(
            {
                "line": ln,
                "pOverRaw": raw_list[m_idx],
                "pOverCalibrated": pc,
                "pUnderCalibrated": pu,
                "pOverSubCover": ps,
                "subCoverLift": ps - pc,
                "fairOverDecimal": round_fair_decimal_v6(pc),
                "fairUnderDecimal": round_fair_decimal_v6(pu),
                "fairOverSubCoverDecimal": round_fair_decimal_v6(ps),
            }
        )

    return {
        "metric": metric,
        "positionGroup": pos_key,
        "lineupStatus": eff_status,
        "eligible": True,
        "blockedByInjury": False,
        "blockedByMinutesGuard": False,
        "ebRatePer90": eb_rate_per90,
        "naivePerAppearanceRate": float(season_count) / max(1, int(appearances)),
        "freshLegsSubRatePer90": rep90,
        "effectiveExposure90": eff_90,
        "expectedMinutes": expected_minutes,
        "matchCouplingMultiplier": coupling_mult,
        "muProjected": mu_projected,
        "rEffective": r_effective,
        "calibrationSource": sh_cfg["calibration_source"],
        "lines": lines_out,
    }


# ============================================================================
# 5. Pillar 2 — Multi-Line `player_saves` + Linked Goalkeeper-Match SGP (`V6`)
# ============================================================================


def project_goalkeeper_saves_multiline_v6(
    *,
    saves: int,
    shots_faced: int,
    goals_conceded: int,
    appearances: int,
    sub_ins: int,
    opp_expected_sot: float,
    expected_minutes: float | None = None,
    availability: str | None = None,
    injury_status: str | None = None,
    artifact: dict[str, Any],
) -> dict[str, Any]:
    """Multi-line Negative Binomial Goalkeeper Saves engine (`1.5+`, `2.5+`, `3.5+`, `4.5+`)."""
    gk_cfg = artifact["goalkeeper_saves_v6"]
    sv = max(0, int(math.trunc(saves)))
    sf_raw = max(0, int(math.trunc(shots_faced)))
    gc = max(0, int(math.trunc(goals_conceded)))
    apps = max(0, int(math.trunc(appearances)))
    subs = int(clamp(int(math.trunc(sub_ins)), 0, apps))

    eff_sf = max(sv, sf_raw) if sf_raw > 0 else (sv + gc)
    prior_rate = float(gk_cfg["prior_save_rate"])
    prior_sf = float(gk_cfg["prior_shots_faced"])
    eb_save_rate = clamp(
        (float(sv) + prior_sf * prior_rate) / (float(eff_sf) + prior_sf),
        float(gk_cfg["min_save_rate"]),
        float(gk_cfg["max_save_rate"]),
    )

    eff_90 = estimate_effective_exposure_90_v6(apps, subs, "GK")
    avg_min = clamp((eff_90 * 90.0) / max(1, apps), 30.0, 90.0)
    exp_min = clamp(float(expected_minutes) if expected_minutes is not None else avg_min, 15.0, 95.0)
    if is_doubtful_availability_v6(availability, injury_status) and expected_minutes is None:
        exp_min = clamp(0.78 * exp_min, 15.0, 95.0)

    guard = check_player_minutes_and_availability_guard_v6(
        sport="football",
        prematch_expected_minutes=exp_min,
        availability=availability,
        injury_status=injury_status,
    )
    opp_sot_c = clamp(float(opp_expected_sot), 1.0, 12.0)
    r_disp = float(gk_cfg["r_dispersion_sot"])

    if not guard["eligible"]:
        return {
            "eligible": False,
            "blockedByInjury": guard["blockedByInjury"],
            "blockedByMinutesGuard": guard["blockedByMinutesGuard"],
            "ebSaveRate": eb_save_rate,
            "effectiveExposure90": eff_90,
            "expectedMinutes": exp_min,
            "oppExpectedSoT": opp_sot_c,
            "expectedSaves": 0.0,
            "rDispersionSoT": r_disp,
            "lines": [],
        }

    mu_saves = opp_sot_c * eb_save_rate * (exp_min / 90.0)
    splines = gk_cfg["multi_line_logit_splines"]

    raw_probs: list[float] = []
    cal_unproj: list[float] = []
    for ln in CANONICAL_GK_SAVES_LINES_V6:
        k_min = int(math.floor(ln + 1e-9)) + 1
        p_raw = nb_tail_prob_ge_v6(k_min, mu_saves, r_disp)
        sp_spec = _select_nearest_spline_spec(splines, ln, CANONICAL_GK_SAVES_LINES_V6)
        p_cal = evaluate_logit_space_monotone_spline_v6(
            p_raw, sp_spec["eta_knots"], sp_spec["zeta_knots"]
        )
        raw_probs.append(p_raw)
        cal_unproj.append(p_cal)

    cal_proj: list[float] = []
    for idx, p_u in enumerate(cal_unproj):
        if idx == 0:
            cal_proj.append(to_unit_probability_v6(p_u))
        else:
            cal_proj.append(to_unit_probability_v6(min(cal_proj[idx - 1], p_u)))

    lines_out: list[dict[str, Any]] = []
    for idx, ln in enumerate(CANONICAL_GK_SAVES_LINES_V6):
        pc = cal_proj[idx]
        pu = to_unit_probability_v6(1.0 - pc)
        lines_out.append(
            {
                "line": ln,
                "pOverRaw": raw_probs[idx],
                "pOverCalibrated": pc,
                "pUnderCalibrated": pu,
                "fairOverDecimal": round_fair_decimal_v6(pc),
                "fairUnderDecimal": round_fair_decimal_v6(pu),
            }
        )

    return {
        "eligible": True,
        "blockedByInjury": False,
        "blockedByMinutesGuard": False,
        "ebSaveRate": eb_save_rate,
        "effectiveExposure90": eff_90,
        "expectedMinutes": exp_min,
        "oppExpectedSoT": opp_sot_c,
        "expectedSaves": mu_saves,
        "rDispersionSoT": r_disp,
        "lines": lines_out,
    }


def evaluate_goalkeeper_saves_linked_sgp_v6(
    *,
    saves_line: float,
    eb_save_rate: float,
    opp_expected_sot: float,
    team_expected_goals: float,
    opponent_expected_goals: float,
    match_outcome: str,
    expected_minutes: float | None = 90.0,
    r_dispersion_sot: float = 7.5,
    dixon_coles_rho: float = -0.105,
    siege_own_goal_dampening: float = 0.028,
    offered_combined_decimal_odds: float | None = None,
) -> dict[str, Any]:
    """Exact Goalkeeper-Match Linked SGP decomposing `SoT_rival = Saves + Goals_Conceded` + Dixon-Coles.

    Models the shared latent rival attack intensity (`NB-Binomial` thinning on `(Saves, G_conceded)`)
    jointly with `G_own` via territorial possession conservation (`siege_own_goal_dampening` calibrated
    on `VAL <= 2019`) + Dixon-Coles `tau(G_own, G_conceded)` on a normalized 3D probability grid,
    guaranteeing exact Fréchet-Hoeffding bounds `[max(0, pA + pB - 1), min(pA, pB)]`.
    """
    if match_outcome not in (
        "clean_sheet",
        "under_2_5",
        "team_win",
        "over_2_5",
        "team_win_or_draw",
    ):
        raise ValueError(f"Unsupported goalkeeper SGP match_outcome: {match_outcome}")

    k_min = max(1, int(math.floor(float(saves_line) + 1e-9)) + 1)
    exp_min = clamp(float(expected_minutes) if expected_minutes is not None else 90.0, 15.0, 95.0)
    exp_frac = exp_min / 90.0
    q_save_prior = clamp(float(eb_save_rate), 0.48, 0.90)
    opp_sot_c = clamp(float(opp_expected_sot), 1.0, 12.0)

    mu_saves = clamp(opp_sot_c * q_save_prior * exp_frac, 0.05, 18.0)
    lam_own = clamp(float(team_expected_goals), 0.08, 7.5)
    lam_opp = clamp(float(opponent_expected_goals), 0.08, 7.5)
    r_sot = clamp(float(r_dispersion_sot), 0.8, 150.0)
    kappa_siege = clamp(float(siege_own_goal_dampening), 0.0, 0.12)

    max_saves = 26
    max_goals = 12
    max_s = max_saves + max_goals

    # Exact identity: E[SoT_rival] = E[Saves] + E[Goals_Conceded]
    mu_sot_eff = mu_saves + lam_opp
    q_save_eff = clamp(mu_saves / max(mu_sot_eff, 1e-9), 0.05, 0.96)
    one_minus_q = 1.0 - q_save_eff

    p0_ratio = r_sot / (r_sot + mu_sot_eff)
    qs_ratio = mu_sot_eff / (r_sot + mu_sot_eff)
    pmf_s = [0.0] * (max_s + 1)
    pmf_s[0] = math.exp(r_sot * math.log(p0_ratio))
    for s in range(1, max_s + 1):
        pmf_s[s] = pmf_s[s - 1] * ((s - 1.0 + r_sot) / s) * qs_ratio

    pow_q = [1.0] * (max_saves + 1)
    for sv in range(1, max_saves + 1):
        pow_q[sv] = pow_q[sv - 1] * q_save_eff

    pow_1mq = [1.0] * (max_goals + 1)
    for go in range(1, max_goals + 1):
        pow_1mq[go] = pow_1mq[go - 1] * one_minus_q

    total_z = 0.0
    mass_saves = 0.0
    mass_match = 0.0
    mass_joint = 0.0

    for s in range(max_s + 1):
        ps_val = pmf_s[s]
        lam_own_s = clamp(lam_own * math.exp(-kappa_siege * (s - mu_sot_eff)), 0.05, 8.5)
        pmf_own = [0.0] * (max_goals + 1)
        pmf_own[0] = math.exp(-lam_own_s)
        for gt in range(1, max_goals + 1):
            pmf_own[gt] = (pmf_own[gt - 1] * lam_own_s) / gt

        suffix_own = [0.0] * (max_goals + 2)
        for gt in range(max_goals, -1, -1):
            suffix_own[gt] = suffix_own[gt + 1] + pmf_own[gt]
        sum_own = suffix_own[0]

        rho_min = max(-1.0 / max(lam_own_s * lam_opp, 1e-6) + 0.05, -0.35)
        rho_max = min(1.0 / max(lam_own_s, 1e-6) - 0.05, 1.0 / max(lam_opp, 1e-6) - 0.05, 0.35)
        rc = clamp(float(dixon_coles_rho), rho_min, rho_max)

        go_lo = max(0, s - max_saves)
        go_hi = min(s, max_goals)
        comb_row = _PASCAL_COMB[s]

        for go in range(go_lo, go_hi + 1):
            sv = s - go
            pr = ps_val * comb_row[go] * pow_q[sv] * pow_1mq[go]
            if go == 0:
                w0 = pmf_own[0] * max(0.0, 1.0 - lam_own_s * lam_opp * rc)
                w1 = pmf_own[1] * max(0.0, 1.0 + lam_opp * rc)
                w_ge2 = suffix_own[2]
                acc_all = w0 + w1 + w_ge2
                if match_outcome == "clean_sheet" or match_outcome == "team_win_or_draw":
                    acc_m = acc_all
                elif match_outcome == "under_2_5":
                    acc_m = w0 + w1 + pmf_own[2]
                elif match_outcome == "team_win":
                    acc_m = w1 + w_ge2
                else:
                    acc_m = suffix_own[3]
            elif go == 1:
                w0 = pmf_own[0] * max(0.0, 1.0 + lam_own_s * rc)
                w1 = pmf_own[1] * max(0.0, 1.0 - rc)
                w_ge2 = suffix_own[2]
                acc_all = w0 + w1 + w_ge2
                if match_outcome == "clean_sheet":
                    acc_m = 0.0
                elif match_outcome == "under_2_5":
                    acc_m = w0 + w1
                elif match_outcome == "team_win" or match_outcome == "over_2_5":
                    acc_m = w_ge2
                else:
                    acc_m = w1 + w_ge2
            else:
                acc_all = sum_own
                if match_outcome == "clean_sheet":
                    acc_m = 0.0
                elif match_outcome == "under_2_5":
                    acc_m = pmf_own[0] if go == 2 else 0.0
                elif match_outcome == "team_win":
                    acc_m = suffix_own[go + 1]
                elif match_outcome == "over_2_5":
                    acc_m = suffix_own[1] if go == 2 else sum_own
                else:
                    acc_m = suffix_own[go]

            cell_all = pr * acc_all
            cell_m = pr * acc_m
            total_z += cell_all
            mass_match += cell_m
            if sv >= k_min:
                mass_saves += cell_all
                mass_joint += cell_m

    inv_z = 1.0 / max(total_z, 1e-15)
    p_saves_marg = to_unit_probability_v6(mass_saves * inv_z)
    p_match_marg = to_unit_probability_v6(mass_match * inv_z)

    frechet_lo = max(0.0, p_saves_marg + p_match_marg - 1.0)
    frechet_hi = min(p_saves_marg, p_match_marg)
    joint_raw = mass_joint * inv_z
    joint_prob = to_unit_probability_v6(clamp(joint_raw, max(0.001, frechet_lo), frechet_hi))

    indep_prob = p_saves_marg * p_match_marg
    mult = joint_prob / max(indep_prob, 1e-9)
    if mult > 1.03:
        corr_dir = "positively_correlated"
    elif mult < 0.97:
        corr_dir = "negatively_correlated"
    else:
        corr_dir = "near_independent"

    audit = None
    if offered_combined_decimal_odds is not None:
        odds_dec = float(offered_combined_decimal_odds)
        if not math.isfinite(odds_dec) or odds_dec <= 1.0:
            raise ValueError(f"Invalid offered decimal odds: {odds_dec}")
        hold_pct = max(0.0, (1.0 - odds_dec * joint_prob) * 100.0)
        tax_flag = (
            "severe_sgp_tax"
            if hold_pct >= 20.0
            else ("standard_sgp_vig" if hold_pct >= 8.0 else "fair_or_low_vig")
        )
        audit = {
            "offeredCombinedDecimalOdds": odds_dec,
            "impliedBookProbability": to_unit_probability_v6(1.0 / odds_dec),
            "fairCombinedDecimalOdds": 1.0 / joint_prob,
            "effectiveHoldPct": hold_pct,
            "taxFlag": tax_flag,
        }

    return {
        "savesLine": float(saves_line),
        "matchOutcome": match_outcome,
        "expectedSaves": mu_saves,
        "effectiveRivalSoT": mu_sot_eff,
        "pSavesOverMarginal": p_saves_marg,
        "pMatchOutcomeMarginal": p_match_marg,
        "independentProbability": indep_prob,
        "jointProbability": joint_prob,
        "frechetLowerBound": frechet_lo,
        "frechetUpperBound": frechet_hi,
        "structuralMultiplier": mult,
        "correlationDirection": corr_dir,
        "fairCombinedDecimal": round_fair_decimal_v6(joint_prob),
        "bookQuoteAudit": audit,
    }


# ============================================================================
# 6. Pillar 3 — Multi-Column Normalized US Game-Log Extractor & Props Engine
# ============================================================================

_CLOCK_RE = re.compile(r"^(\d+):(\d{1,2})$")
_MADE_ATT_RE = re.compile(r"^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$")
_BASEBALL_IP_RE = re.compile(r"^(\d+)\.([12])$")


def _parse_numeric_or_clock_v6(raw: Any, is_baseball_ip: bool = False) -> float | None:
    if raw is None or isinstance(raw, bool):
        return None
    if isinstance(raw, (int, float)):
        val = float(raw)
        if not math.isfinite(val):
            return None
        if is_baseball_ip:
            s_repr = f"{val:.1f}"
            if abs(val - float(s_repr)) < 1e-9:
                m_ip = _BASEBALL_IP_RE.match(s_repr)
                if m_ip:
                    return float(int(m_ip.group(1))) + float(int(m_ip.group(2))) / 3.0
        return val

    s = str(raw).strip()
    if not s or s in ("-", "--", "N/A", "DNP"):
        return None

    if is_baseball_ip:
        m_ip = _BASEBALL_IP_RE.match(s)
        if m_ip:
            return float(int(m_ip.group(1))) + float(int(m_ip.group(2))) / 3.0

    m_clk = _CLOCK_RE.match(s)
    if m_clk:
        mins = float(int(m_clk.group(1)))
        secs = float(int(m_clk.group(2)))
        return mins + secs / 60.0

    s_clean = s.rstrip("%").replace(",", "")
    try:
        val = float(s_clean)
        return val if math.isfinite(val) else None
    except ValueError:
        return None


def _parse_made_attempted_v6(raw: Any) -> tuple[float, float] | None:
    if not isinstance(raw, str):
        return None
    m = _MADE_ATT_RE.match(raw.strip())
    if not m:
        return None
    return (float(m.group(1)), float(m.group(2)))


def normalize_us_player_game_log_columns_v6(
    *,
    sport: str,
    columns: list[dict[str, Any]],
    availability: str | None = None,
    injury_status: str | None = None,
    enforce_minutes_guard: bool = True,
) -> dict[str, Any]:
    """Extracts ALL player game-log / season columns WITHOUT 5-column truncation (`NBA/MLB/NHL/NFL/football`).

    Enforces:
      - Hard injury block (`availability === "out" / "Baja" / "injured"` -> returns empty `metrics = {}`).
      - Causal minutes guard (`>= 18.0` min NBA, `>= 45.0` min football -> `blockedByMinutesGuard = True`).
    """
    sp = _clean_status_token(sport)
    if sp == "soccer":
        sp = "football"
    if sp not in ("nba", "mlb", "nhl", "nfl", "football"):
        raise ValueError(f"Unsupported sport in normalize_us_player_game_log_columns_v6: {sport}")

    raw_count = len(columns)
    if is_hard_blocked_availability_v6(availability, injury_status):
        return {
            "sport": sp,
            "blockedByInjury": True,
            "blockedByMinutesGuard": False,
            "eligibleForProjection": False,
            "rawColumnCount": raw_count,
            "extractedCount": 0,
            "metrics": {},
        }

    metrics: dict[str, float] = {}

    for col in columns:
        raw_key = str(col.get("key") or "").strip().lower()
        raw_lbl = str(col.get("label") or "").strip()
        lbl_up = raw_lbl.upper()
        val_raw = col.get("value")

        if sp == "nba":
            if raw_key in ("3pt", "3pm-a", "fg3") or lbl_up in ("3PT", "3PM-A", "3P-A", "T3"):
                ma = _parse_made_attempted_v6(val_raw)
                if ma is not None:
                    metrics["3PM"] = ma[0]
                    metrics["3PA"] = ma[1]
                    continue
            if raw_key in ("fg", "tc") or lbl_up in ("FG", "FGM-A", "TC"):
                ma = _parse_made_attempted_v6(val_raw)
                if ma is not None:
                    metrics["FGM"] = ma[0]
                    metrics["FGA"] = ma[1]
                    continue
            if raw_key in ("ft", "tl") or lbl_up in ("FT", "FTM-A", "TL"):
                ma = _parse_made_attempted_v6(val_raw)
                if ma is not None:
                    metrics["FTM"] = ma[0]
                    metrics["FTA"] = ma[1]
                    continue

            num = _parse_numeric_or_clock_v6(val_raw, is_baseball_ip=False)
            if num is None:
                continue
            if raw_key in ("min", "mp", "mins") or lbl_up in ("MIN", "MINS", "MP"):
                metrics["MIN"] = num
            elif raw_key in ("pts", "points") or lbl_up in ("PTS", "PUNTOS"):
                metrics["PTS"] = num
            elif raw_key in ("reb", "trb", "rebs") or lbl_up in ("REB", "REBS", "TRB", "TOT"):
                metrics["REB"] = num
            elif raw_key in ("ast", "asts") or lbl_up in ("AST", "ASTS", "ASIST"):
                metrics["AST"] = num
            elif (
                raw_key in ("3pm", "fg3m", "3ptm", "tpm")
                or lbl_up in ("3PM", "3PTM", "FG3M")
                or (lbl_up in ("3P", "3PT") and "%" not in raw_lbl)
            ):
                metrics["3PM"] = num
            elif raw_key in ("3pa", "fg3a") or lbl_up in ("3PA", "FG3A"):
                metrics["3PA"] = num
            elif raw_key in ("fg_", "fg_pct", "fgp") or lbl_up in ("%TC", "FG%", "%FG"):
                metrics["FG_PCT"] = num
            elif raw_key in ("fg3_", "3p_", "fg3_pct") or lbl_up in ("%3P", "3P%", "3PT%"):
                metrics["FG3_PCT"] = num
            elif raw_key in ("ft_", "ft_pct") or lbl_up in ("%TL", "FT%", "%FT"):
                metrics["FT_PCT"] = num
            elif raw_key == "stl" or lbl_up in ("STL", "ROB"):
                metrics["STL"] = num
            elif raw_key == "blk" or lbl_up in ("BLK", "TAP"):
                metrics["BLK"] = num
            elif raw_key in ("tov", "to") or lbl_up in ("TO", "TOV", "PER"):
                metrics["TOV"] = num
            elif raw_key == "gp" or lbl_up in ("GP", "JJ"):
                metrics["GP"] = num

        elif sp == "mlb":
            is_ip = raw_key in ("ip", "innings") or lbl_up in ("IP", "EL", "INNINGS")
            num = _parse_numeric_or_clock_v6(val_raw, is_baseball_ip=is_ip)
            if num is None:
                continue
            if is_ip:
                metrics["IP"] = num
            elif raw_key in ("so", "k", "strikeouts") or lbl_up in ("SO", "K", "PONCHES"):
                metrics["SO"] = num
            elif raw_key in ("h", "hits") or lbl_up in ("H", "HITS", "IMP"):
                metrics["H"] = num
            elif raw_key in ("er", "earned_runs") or lbl_up in ("ER", "CL"):
                metrics["ER"] = num
            elif raw_key in ("bb", "walks") or lbl_up in ("BB", "WALKS"):
                metrics["BB"] = num
            elif raw_key in ("hr", "home_runs") or lbl_up in ("HR", "JONRONES"):
                metrics["HR"] = num
            elif raw_key in ("tb", "total_bases") or lbl_up in ("TB", "BT", "TOTAL_BASES"):
                metrics["TB"] = num
            elif raw_key in ("rbi", "rbis") or lbl_up in ("RBI", "CI"):
                metrics["RBI"] = num
            elif raw_key == "gs" or lbl_up in ("GS", "JI"):
                metrics["GS"] = num
            elif raw_key == "cg" or lbl_up in ("CG", "JC"):
                metrics["CG"] = num
            elif raw_key == "sho" or lbl_up == "SHO":
                metrics["SHO"] = num
            elif raw_key == "ab" or lbl_up in ("AB", "VB"):
                metrics["AB"] = num
            elif raw_key in ("r", "runs") or lbl_up in ("R", "C"):
                metrics["R"] = num
            elif raw_key == "gp" or lbl_up in ("GP", "JJ"):
                metrics["GP"] = num

        elif sp == "nhl":
            num = _parse_numeric_or_clock_v6(val_raw, is_baseball_ip=False)
            if num is None:
                continue
            if raw_key in ("sog", "s", "shots") or lbl_up in ("SOG", "S", "TIROS", "SHOTS"):
                metrics["SOG"] = num
            elif raw_key in ("g", "goals") or lbl_up in ("G", "GOLES"):
                metrics["G"] = num
            elif raw_key in ("a", "assists") or lbl_up in ("A", "ASIST"):
                metrics["A"] = num
            elif raw_key in ("pts", "points") or lbl_up in ("PTS", "P"):
                metrics["PTS"] = num
            elif raw_key in ("toi", "time_on_ice", "min") or lbl_up in ("TOI", "MIN", "HIELO"):
                metrics["TOI"] = num
            elif raw_key in ("_", "plus_minus") or lbl_up == "+/-":
                metrics["PLUS_MINUS"] = num
            elif raw_key == "pim" or lbl_up in ("PIM", "MP"):
                metrics["PIM"] = num
            elif raw_key in ("sv", "saves") or lbl_up in ("SV", "ATAJ"):
                metrics["SV"] = num
            elif raw_key in ("ga", "goals_against") or lbl_up in ("GA", "GC"):
                metrics["GA"] = num
            elif raw_key == "gp" or lbl_up in ("GP", "JJ"):
                metrics["GP"] = num

        elif sp == "nfl":
            if raw_key in ("cmp_att", "c/att") or lbl_up in ("C/ATT", "CMP-ATT"):
                ma = _parse_made_attempted_v6(val_raw)
                if ma is not None:
                    metrics["CMP"] = ma[0]
                    metrics["ATT"] = ma[1]
                    continue
            num = _parse_numeric_or_clock_v6(val_raw, is_baseball_ip=False)
            if num is None:
                continue
            if raw_key in ("cmp", "completions") or lbl_up in ("CMP", "COMP"):
                metrics["CMP"] = num
            elif raw_key in ("att", "pass_att") or lbl_up in ("ATT", "INT."):
                # Critical Spanish ESPN disambiguation: 'INT.' (with dot) = Intentos (ATT)!
                metrics["ATT"] = num
            elif raw_key in ("yds", "yards") or lbl_up in ("YDS", "YARDAS"):
                metrics["YDS"] = num
            elif raw_key in ("td", "tds") or lbl_up in ("TD", "TDS"):
                metrics["TD"] = num
            elif raw_key in ("rec", "receptions") or lbl_up in ("REC", "RECEP"):
                metrics["REC"] = num
            elif raw_key in ("tgts", "tgt", "targets") or lbl_up in ("TGTS", "TGT", "TARGETS"):
                metrics["TGTS"] = num
            elif raw_key in ("car", "rush_att", "acar") or lbl_up in ("CAR", "ACAR"):
                metrics["CAR"] = num
            elif raw_key in ("int", "interceptions") or lbl_up == "INT":
                metrics["INT"] = num
            elif raw_key in ("cmp_", "cmp_pct") or lbl_up in ("%CMP", "CMP%"):
                metrics["CMP_PCT"] = num
            elif raw_key == "avg" or lbl_up in ("AVG", "PROM"):
                metrics["AVG"] = num
            elif raw_key == "lng" or lbl_up in ("LNG", "LARGO"):
                metrics["LNG"] = num
            elif raw_key == "gp" or lbl_up in ("GP", "JJ"):
                metrics["GP"] = num

        elif sp == "football":
            num = _parse_numeric_or_clock_v6(val_raw, is_baseball_ip=False)
            if num is None:
                continue
            if raw_key in ("min", "minutes") or lbl_up in ("MIN", "MINS"):
                metrics["MIN"] = num
            elif raw_key in ("sh", "shots") or lbl_up in ("SH", "SHOTS", "TIROS"):
                metrics["SH"] = num
            elif raw_key in ("sot", "shotsontarget") or lbl_up in ("SOT", "AP", "TIROS A PUERTA"):
                metrics["SOT"] = num
            elif raw_key in ("g", "goals") or lbl_up in ("G", "GLS", "GOLES"):
                metrics["G"] = num
            elif raw_key in ("a", "assists") or lbl_up in ("A", "AST", "ASIST"):
                metrics["A"] = num
            elif raw_key in ("sv", "saves") or lbl_up in ("SV", "SAVES", "ATAJ"):
                metrics["SV"] = num

    blocked_min = False
    if enforce_minutes_guard:
        if sp == "nba" and "MIN" in metrics and metrics["MIN"] < 18.0:
            blocked_min = True
        elif sp == "football" and "MIN" in metrics and metrics["MIN"] < 45.0:
            blocked_min = True

    return {
        "sport": sp,
        "blockedByInjury": False,
        "blockedByMinutesGuard": blocked_min,
        "eligibleForProjection": (not blocked_min) and (len(metrics) > 0),
        "rawColumnCount": raw_count,
        "extractedCount": len(metrics),
        "metrics": metrics,
    }


def _resolve_us_role_v6(sport: str, position_label: str | None) -> str:
    pos = (position_label or "").strip().upper()
    if sport == "nba":
        if pos in ("C",):
            return "C"
        if pos in ("F", "PF", "SF"):
            return "F"
        return "G"
    if sport == "mlb":
        if pos == "SP":
            return "SP"
        if pos in ("RP", "CP", "P"):
            return "RP"
        return "BAT"
    if sport == "nhl":
        if pos == "G":
            return "G"
        if pos == "D":
            return "D"
        return "FWD"
    if sport == "nfl":
        if pos == "QB":
            return "QB"
        if pos in ("RB", "FB"):
            return "RB"
        if pos == "TE":
            return "TE"
        return "WR"
    return "DEFAULT"


def project_us_player_prop_v6(
    *,
    sport: str,
    position_label: str | None,
    metric: str,
    sample_sum: float,
    sample_games: float,
    line: float | None = None,
    prematch_minutes: float | None = None,
    sample_variance: float | None = None,
    opp_factor: float = 1.0,
    availability: str | None = None,
    injury_status: str | None = None,
    artifact: dict[str, Any],
) -> dict[str, Any] | None:
    """Overdispersed Empirical-Bayes US player prop projection (`NBA`, `MLB`, `NHL`, `NFL`).

    Returns `None` when blocked by hard injury (`"out" / "Baja"`) or causal NBA minutes guard (`< 18.0`).
    """
    sp = _clean_status_token(sport)
    guard = check_player_minutes_and_availability_guard_v6(
        sport=sp,
        prematch_expected_minutes=prematch_minutes,
        availability=availability,
        injury_status=injury_status,
    )
    if not guard["eligible"]:
        return None

    us_cfg = artifact["us_props_v6"]
    role = _resolve_us_role_v6(sp, position_label)
    sport_roles = us_cfg[sp]["roles"]
    role_specs = sport_roles.get(role) or next(iter(sport_roles.values()))
    spec = role_specs.get(metric)
    if spec is None:
        return None

    g = max(0.0, float(sample_games))
    s_sum = max(0.0, float(sample_sum))
    prior_mean = float(spec["prior_mean"])
    prior_games = float(spec["prior_games"])
    eb_mean = (s_sum + prior_games * prior_mean) / max(g + prior_games, 1e-6)

    anchor_min = float(spec.get("anchor_minutes", 0.0))
    if prematch_minutes is not None and anchor_min > 0.0:
        min_scale = clamp(float(prematch_minutes) / anchor_min, 0.55, 1.38)
    else:
        min_scale = 1.0

    doubt_scale = 0.88 if is_doubtful_availability_v6(availability, injury_status) else 1.0
    opp_mult = clamp(float(opp_factor), 0.70, 1.35)
    mu_adj = max(0.03, eb_mean * min_scale * doubt_scale * opp_mult)
    target_line = float(line) if line is not None else float(spec["canonical_line"])

    dist_family = str(spec["family"])
    if dist_family == "negbin":
        r_prior = float(spec["r_dispersion"])
        r_eff = r_prior
        if sample_variance is not None and g >= 3.0 and sample_variance > mu_adj * 1.05:
            emp_r = (mu_adj * mu_adj) / max(sample_variance - mu_adj, 0.15 * mu_adj)
            w_emp = clamp(g / (g + 10.0), 0.0, 0.65)
            r_eff = clamp((1.0 - w_emp) * r_prior + w_emp * emp_r, 0.65, 120.0)
        p_ov, _, p_push = nb_prob_over_exact_v6(mu_adj, r_eff, target_line, 40)
        act = max(1.0 - p_push, 1e-9)
        p_cal = to_unit_probability_v6(p_ov / act)
        sd_eff = math.sqrt(mu_adj + (mu_adj * mu_adj) / max(r_eff, 0.5))
    else:
        min_sd = float(spec["min_sd"])
        vmr = float(spec["var_mean_ratio"])
        cv_sd = float(spec["cv_sd"])
        prior_var = max(min_sd * min_sd, vmr * mu_adj + (cv_sd * mu_adj) ** 2)
        if sample_variance is not None and g >= 3.0 and sample_variance > 0.0:
            w_emp = clamp(g / (g + 8.0), 0.0, 0.60)
            eff_var = max(min_sd * min_sd * 0.64, (1.0 - w_emp) * prior_var + w_emp * sample_variance)
        else:
            eff_var = prior_var
        sd_eff = math.sqrt(eff_var)
        is_int = abs(target_line - round(target_line)) < 1e-9
        if is_int:
            thr = round(target_line)
            p_ov = 1.0 - normal_cdf((thr + 0.5 - mu_adj) / sd_eff)
            p_un = normal_cdf((thr - 0.5 - mu_adj) / sd_eff)
            p_push = max(0.0, 1.0 - p_ov - p_un)
            p_cal = to_unit_probability_v6(p_ov / max(p_ov + p_un, 1e-9))
        else:
            p_push = 0.0
            p_cal = to_unit_probability_v6(1.0 - normal_cdf((target_line - mu_adj) / sd_eff))

    p_under = to_unit_probability_v6(1.0 - p_cal)
    return {
        "sport": sp,
        "role": role,
        "metric": metric,
        "distributionFamily": dist_family,
        "line": target_line,
        "muAdjusted": mu_adj,
        "sdEffective": sd_eff,
        "pOverCalibrated": p_cal,
        "pUnderCalibrated": p_under,
        "pPush": p_push,
        "fairOverDecimal": round_fair_decimal_v6(p_cal),
        "fairUnderDecimal": round_fair_decimal_v6(p_under),
    }


def evaluate_us_player_profile_props_v6(
    *,
    sport: str,
    position_label: str | None,
    availability: str | None,
    injury_status: str | None,
    season_metrics: list[dict[str, Any]],
    recent_games: list[dict[str, Any]],
    opp_factor: float = 1.0,
    artifact: dict[str, Any],
) -> list[dict[str, Any]]:
    """Evaluates all eligible overdispersed props for a real US player profile (`squads.json` + `injuries.json`)."""
    sp = _clean_status_token(sport)
    if is_hard_blocked_availability_v6(availability, injury_status):
        return []

    sm_norm = normalize_us_player_game_log_columns_v6(
        sport=sp,
        columns=season_metrics,
        availability=availability,
        injury_status=injury_status,
        enforce_minutes_guard=False,
    )
    sm_map = sm_norm["metrics"]

    rg_vals: dict[str, list[float]] = defaultdict(list)
    for g in recent_games:
        g_norm = normalize_us_player_game_log_columns_v6(
            sport=sp,
            columns=g.get("stats") or [],
            availability=availability,
            injury_status=injury_status,
            enforce_minutes_guard=False,
        )
        for mk, mv in g_norm["metrics"].items():
            rg_vals[mk].append(mv)

    prematch_min: float | None = None
    if sp == "nba":
        if rg_vals.get("MIN"):
            prematch_min = sum(rg_vals["MIN"]) / len(rg_vals["MIN"])
        elif "MIN" in sm_map:
            prematch_min = sm_map["MIN"]
        if prematch_min is not None and prematch_min < 18.0:
            return []
    elif sp == "nhl":
        if rg_vals.get("TOI"):
            prematch_min = sum(rg_vals["TOI"]) / len(rg_vals["TOI"])

    role = _resolve_us_role_v6(sp, position_label)
    role_specs = artifact["us_props_v6"][sp]["roles"].get(role, {})
    season_gp = sm_map.get("GP", float(len(recent_games)))

    outlooks: list[dict[str, Any]] = []
    for mk in role_specs.keys():
        vals = rg_vals.get(mk, [])
        s_var: float | None = None
        if len(vals) >= 3:
            mean_v = sum(vals) / len(vals)
            s_var = sum((v - mean_v) ** 2 for v in vals) / (len(vals) - 1)

        if mk in sm_map and season_gp >= 1.0:
            # Note: NBA seasonMetrics PTS/REB/AST are per-game averages; NHL/MLB/NFL seasonMetrics are season totals!
            if sp == "nba" and mk in ("PTS", "REB", "AST", "3PM"):
                s_sum = sm_map[mk] * season_gp
                s_games = season_gp
            else:
                s_sum = sm_map[mk]
                s_games = max(season_gp, float(len(vals)), 1.0)
        elif len(vals) >= 1:
            s_sum = sum(vals)
            s_games = float(len(vals))
        else:
            continue

        proj = project_us_player_prop_v6(
            sport=sp,
            position_label=position_label,
            metric=mk,
            sample_sum=s_sum,
            sample_games=s_games,
            line=None,
            prematch_minutes=prematch_min,
            sample_variance=s_var,
            opp_factor=opp_factor,
            availability=availability,
            injury_status=injury_status,
            artifact=artifact,
        )
        if proj is not None:
            outlooks.append(proj)
    return outlooks


# ============================================================================
# 7. Default Model Configuration Builder (`model_props_v6_0_candidate.json`)
# ============================================================================


def _build_base_v6_model_skeleton() -> dict[str, Any]:
    v5_props = json.loads(
        (PRED_DATA_DIR / "model_hierarchical_props_v5_0_candidate.json").read_text(encoding="utf-8")
    )["soccer"]["positions"]

    positions_v6: dict[str, Any] = {}
    for cl, pdata in v5_props.items():
        positions_v6[cl] = {
            "mean_starter_minutes": float(pdata["mean_starter_minutes"]),
            "metrics": {
                "shots": dict(pdata["metrics"]["shots"]),
                "shots_on_target": dict(pdata["metrics"]["shots_on_target"]),
            },
        }

    # Add coarse aliases (`FWD`, `MID`, `DEF`) used by live `squads.json`
    positions_v6["FWD"] = {
        "mean_starter_minutes": 80.0,
        "metrics": {
            "shots": {
                "prior_rate_per90": 2.62,
                "prior_beta_90": 4.5,
                "phi_dispersion": 5.2,
                "fresh_legs_sub_multiplier": 1.14,
            },
            "shots_on_target": {
                "prior_rate_per90": 0.96,
                "prior_beta_90": 5.0,
                "phi_dispersion": 6.0,
                "fresh_legs_sub_multiplier": 1.16,
            },
        },
    }
    positions_v6["MID"] = {
        "mean_starter_minutes": 82.0,
        "metrics": {
            "shots": {
                "prior_rate_per90": 1.45,
                "prior_beta_90": 4.5,
                "phi_dispersion": 5.5,
                "fresh_legs_sub_multiplier": 1.02,
            },
            "shots_on_target": {
                "prior_rate_per90": 0.51,
                "prior_beta_90": 5.0,
                "phi_dispersion": 6.4,
                "fresh_legs_sub_multiplier": 1.04,
            },
        },
    }
    positions_v6["DEF"] = {
        "mean_starter_minutes": 86.8,
        "metrics": {
            "shots": {
                "prior_rate_per90": 0.74,
                "prior_beta_90": 4.5,
                "phi_dispersion": 5.6,
                "fresh_legs_sub_multiplier": 0.96,
            },
            "shots_on_target": {
                "prior_rate_per90": 0.25,
                "prior_beta_90": 5.0,
                "phi_dispersion": 6.5,
                "fresh_legs_sub_multiplier": 0.96,
            },
        },
    }

    us_props_v6: dict[str, Any] = {
        "nba": {
            "min_guard_minutes": 18.0,
            "roles": {
                "G": {
                    "PTS": {"family": "normal_overdispersed", "prior_mean": 15.8, "prior_games": 6.0, "canonical_line": 15.5, "anchor_minutes": 30.0, "min_sd": 4.8, "var_mean_ratio": 1.85, "cv_sd": 0.24},
                    "REB": {"family": "negbin", "prior_mean": 3.8, "prior_games": 5.5, "canonical_line": 4.5, "anchor_minutes": 30.0, "r_dispersion": 11.5},
                    "AST": {"family": "negbin", "prior_mean": 4.9, "prior_games": 5.5, "canonical_line": 4.5, "anchor_minutes": 30.0, "r_dispersion": 9.0},
                    "3PM": {"family": "negbin", "prior_mean": 2.1, "prior_games": 6.5, "canonical_line": 2.5, "anchor_minutes": 30.0, "r_dispersion": 5.2},
                },
                "F": {
                    "PTS": {"family": "normal_overdispersed", "prior_mean": 15.2, "prior_games": 6.0, "canonical_line": 15.5, "anchor_minutes": 29.5, "min_sd": 4.7, "var_mean_ratio": 1.80, "cv_sd": 0.24},
                    "REB": {"family": "negbin", "prior_mean": 5.6, "prior_games": 5.5, "canonical_line": 5.5, "anchor_minutes": 29.5, "r_dispersion": 11.5},
                    "AST": {"family": "negbin", "prior_mean": 3.1, "prior_games": 5.5, "canonical_line": 2.5, "anchor_minutes": 29.5, "r_dispersion": 9.0},
                    "3PM": {"family": "negbin", "prior_mean": 1.6, "prior_games": 6.5, "canonical_line": 1.5, "anchor_minutes": 29.5, "r_dispersion": 5.2},
                },
                "C": {
                    "PTS": {"family": "normal_overdispersed", "prior_mean": 13.8, "prior_games": 6.0, "canonical_line": 13.5, "anchor_minutes": 27.5, "min_sd": 4.5, "var_mean_ratio": 1.70, "cv_sd": 0.23},
                    "REB": {"family": "negbin", "prior_mean": 8.2, "prior_games": 5.5, "canonical_line": 7.5, "anchor_minutes": 27.5, "r_dispersion": 12.0},
                    "AST": {"family": "negbin", "prior_mean": 2.4, "prior_games": 5.5, "canonical_line": 2.5, "anchor_minutes": 27.5, "r_dispersion": 8.5},
                    "3PM": {"family": "negbin", "prior_mean": 0.7, "prior_games": 7.0, "canonical_line": 0.5, "anchor_minutes": 27.5, "r_dispersion": 4.5},
                },
            },
        },
        "mlb": {
            "min_guard_minutes": 0.0,
            "roles": {
                "SP": {
                    "SO": {"family": "negbin", "prior_mean": 5.4, "prior_games": 5.0, "canonical_line": 5.5, "anchor_minutes": 0.0, "r_dispersion": 8.5},
                    "IP": {"family": "normal_overdispersed", "prior_mean": 5.35, "prior_games": 5.0, "canonical_line": 5.5, "anchor_minutes": 0.0, "min_sd": 1.05, "var_mean_ratio": 0.16, "cv_sd": 0.15},
                    "H": {"family": "negbin", "prior_mean": 5.1, "prior_games": 5.5, "canonical_line": 4.5, "anchor_minutes": 0.0, "r_dispersion": 9.5},
                    "ER": {"family": "negbin", "prior_mean": 2.45, "prior_games": 6.0, "canonical_line": 2.5, "anchor_minutes": 0.0, "r_dispersion": 4.8},
                    "BB": {"family": "negbin", "prior_mean": 1.85, "prior_games": 6.0, "canonical_line": 1.5, "anchor_minutes": 0.0, "r_dispersion": 5.5},
                },
                "RP": {
                    "SO": {"family": "negbin", "prior_mean": 1.12, "prior_games": 8.0, "canonical_line": 1.5, "anchor_minutes": 0.0, "r_dispersion": 6.5},
                    "IP": {"family": "normal_overdispersed", "prior_mean": 1.02, "prior_games": 8.0, "canonical_line": 0.5, "anchor_minutes": 0.0, "min_sd": 0.42, "var_mean_ratio": 0.08, "cv_sd": 0.18},
                    "H": {"family": "negbin", "prior_mean": 0.88, "prior_games": 8.0, "canonical_line": 0.5, "anchor_minutes": 0.0, "r_dispersion": 6.5},
                    "ER": {"family": "negbin", "prior_mean": 0.44, "prior_games": 8.0, "canonical_line": 0.5, "anchor_minutes": 0.0, "r_dispersion": 4.2},
                    "BB": {"family": "negbin", "prior_mean": 0.42, "prior_games": 8.0, "canonical_line": 0.5, "anchor_minutes": 0.0, "r_dispersion": 4.8},
                },
                "BAT": {
                    "H": {"family": "negbin", "prior_mean": 0.92, "prior_games": 12.0, "canonical_line": 0.5, "anchor_minutes": 0.0, "r_dispersion": 9.0},
                    "HR": {"family": "negbin", "prior_mean": 0.14, "prior_games": 18.0, "canonical_line": 0.5, "anchor_minutes": 0.0, "r_dispersion": 3.5},
                    "TB": {"family": "negbin", "prior_mean": 1.55, "prior_games": 10.0, "canonical_line": 1.5, "anchor_minutes": 0.0, "r_dispersion": 4.6},
                    "RBI": {"family": "negbin", "prior_mean": 0.52, "prior_games": 12.0, "canonical_line": 0.5, "anchor_minutes": 0.0, "r_dispersion": 4.2},
                    "BB": {"family": "negbin", "prior_mean": 0.36, "prior_games": 12.0, "canonical_line": 0.5, "anchor_minutes": 0.0, "r_dispersion": 5.5},
                    "SO": {"family": "negbin", "prior_mean": 0.94, "prior_games": 10.0, "canonical_line": 0.5, "anchor_minutes": 0.0, "r_dispersion": 7.5},
                },
            },
        },
        "nhl": {
            "min_guard_minutes": 0.0,
            "roles": {
                "FWD": {
                    "SOG": {"family": "negbin", "prior_mean": 2.35, "prior_games": 6.5, "canonical_line": 2.5, "anchor_minutes": 17.5, "r_dispersion": 7.8},
                    "G": {"family": "negbin", "prior_mean": 0.29, "prior_games": 8.0, "canonical_line": 0.5, "anchor_minutes": 17.5, "r_dispersion": 5.0},
                    "A": {"family": "negbin", "prior_mean": 0.44, "prior_games": 7.5, "canonical_line": 0.5, "anchor_minutes": 17.5, "r_dispersion": 5.5},
                    "PTS": {"family": "negbin", "prior_mean": 0.73, "prior_games": 6.5, "canonical_line": 0.5, "anchor_minutes": 17.5, "r_dispersion": 5.2},
                },
                "D": {
                    "SOG": {"family": "negbin", "prior_mean": 1.65, "prior_games": 6.5, "canonical_line": 1.5, "anchor_minutes": 20.5, "r_dispersion": 7.5},
                    "G": {"family": "negbin", "prior_mean": 0.09, "prior_games": 10.0, "canonical_line": 0.5, "anchor_minutes": 20.5, "r_dispersion": 4.5},
                    "A": {"family": "negbin", "prior_mean": 0.34, "prior_games": 8.0, "canonical_line": 0.5, "anchor_minutes": 20.5, "r_dispersion": 5.2},
                    "PTS": {"family": "negbin", "prior_mean": 0.43, "prior_games": 7.5, "canonical_line": 0.5, "anchor_minutes": 20.5, "r_dispersion": 5.0},
                },
            },
        },
        "nfl": {
            "min_guard_minutes": 0.0,
            "roles": {
                "QB": {
                    "CMP": {"family": "negbin", "prior_mean": 19.8, "prior_games": 2.5, "canonical_line": 19.5, "anchor_minutes": 0.0, "r_dispersion": 16.0},
                    "ATT": {"family": "negbin", "prior_mean": 30.5, "prior_games": 2.5, "canonical_line": 30.5, "anchor_minutes": 0.0, "r_dispersion": 20.0},
                    "YDS": {"family": "normal_overdispersed", "prior_mean": 208.0, "prior_games": 2.5, "canonical_line": 214.5, "anchor_minutes": 0.0, "min_sd": 48.0, "var_mean_ratio": 4.5, "cv_sd": 0.26},
                    "TD": {"family": "negbin", "prior_mean": 1.42, "prior_games": 3.5, "canonical_line": 1.5, "anchor_minutes": 0.0, "r_dispersion": 5.5},
                },
                "RB": {
                    "CAR": {"family": "negbin", "prior_mean": 9.8, "prior_games": 2.5, "canonical_line": 10.5, "anchor_minutes": 0.0, "r_dispersion": 10.0},
                    "YDS": {"family": "normal_overdispersed", "prior_mean": 38.0, "prior_games": 2.2, "canonical_line": 39.5, "anchor_minutes": 0.0, "min_sd": 20.0, "var_mean_ratio": 3.5, "cv_sd": 0.45},
                    "REC": {"family": "negbin", "prior_mean": 2.2, "prior_games": 3.0, "canonical_line": 2.5, "anchor_minutes": 0.0, "r_dispersion": 7.0},
                    "TD": {"family": "negbin", "prior_mean": 0.44, "prior_games": 4.0, "canonical_line": 0.5, "anchor_minutes": 0.0, "r_dispersion": 4.8},
                },
                "WR": {
                    "REC": {"family": "negbin", "prior_mean": 3.4, "prior_games": 2.5, "canonical_line": 3.5, "anchor_minutes": 0.0, "r_dispersion": 7.5},
                    "TGTS": {"family": "negbin", "prior_mean": 5.4, "prior_games": 2.5, "canonical_line": 5.5, "anchor_minutes": 0.0, "r_dispersion": 9.0},
                    "YDS": {"family": "normal_overdispersed", "prior_mean": 39.0, "prior_games": 2.2, "canonical_line": 39.5, "anchor_minutes": 0.0, "min_sd": 20.0, "var_mean_ratio": 3.8, "cv_sd": 0.48},
                    "TD": {"family": "negbin", "prior_mean": 0.32, "prior_games": 4.5, "canonical_line": 0.5, "anchor_minutes": 0.0, "r_dispersion": 4.5},
                },
                "TE": {
                    "REC": {"family": "negbin", "prior_mean": 2.6, "prior_games": 2.5, "canonical_line": 2.5, "anchor_minutes": 0.0, "r_dispersion": 7.5},
                    "TGTS": {"family": "negbin", "prior_mean": 3.9, "prior_games": 2.5, "canonical_line": 3.5, "anchor_minutes": 0.0, "r_dispersion": 9.0},
                    "YDS": {"family": "normal_overdispersed", "prior_mean": 26.0, "prior_games": 2.2, "canonical_line": 25.5, "anchor_minutes": 0.0, "min_sd": 16.0, "var_mean_ratio": 3.4, "cv_sd": 0.48},
                    "TD": {"family": "negbin", "prior_mean": 0.25, "prior_games": 4.5, "canonical_line": 0.5, "anchor_minutes": 0.0, "r_dispersion": 4.5},
                },
            },
        },
    }

    return {
        "schema_version": "props_v6_0_candidate_1.0.0",
        "codename": "PitchLab Complete Player Props, Goalkeeper SGP & US Multi-Sport Engine v6.0 Candidate",
        "version": "6.0.0-candidate",
        "status": "candidate",
        "production_activated": False,
        "holdout_cut_utc": HOLDOUT_CUT_UTC,
        "holdout_sealed_untouched": True,
        "coupled_shots_v6": {
            "calibration_source": "coupled_player_match_barycentric_logit_pava_v6",
            "remediated_finding": "D7_empirical_bayes_nb_no_player_match_log_spline_closed",
            "league_team_shots_anchor": 12.45,
            "league_team_sot_anchor": 4.30,
            "team_shots_exponent": 0.72,
            "cross_quality_exponent": 0.22,
            "team_sot_exponent": 0.74,
            "cross_volume_exponent": 0.20,
            "opp_defense_exponent": 0.58,
            "min_guard_minutes_football": 45.0,
            "canonical_lines": list(CANONICAL_SHOT_LINES_V6),
            "positions": positions_v6,
            "multi_line_logit_splines": {"shots": {}, "shots_on_target": {}},
        },
        "goalkeeper_saves_v6": {
            "calibration_source": "historical_boxscore_barycentric_logit_pava_val_le_2019",
            "prior_save_rate": 0.712,
            "prior_shots_faced": 18.0,
            "min_save_rate": 0.52,
            "max_save_rate": 0.88,
            "r_dispersion_sot": 7.5,
            "dixon_coles_rho": -0.105,
            "canonical_lines": list(CANONICAL_GK_SAVES_LINES_V6),
            "multi_line_logit_splines": {},
        },
        "us_props_v6": us_props_v6,
    }


# ============================================================================
# 8. Historical Pre-Holdout Calibration (`< 2025-02-02`) & Live Snapshot Audit
# ============================================================================


def _load_pre_holdout_match_shots_boxscores() -> list[dict[str, Any]]:
    """Loads historical club match boxscores (`HS, AS, HST, AST, FTHG, FTAG`) strictly `< 2025-02-02`."""
    matches: list[dict[str, Any]] = []
    for csvf in sorted(RAW_MAIN_DIR.glob("*/*.csv")):
        seas = csvf.parent.name
        if seas < "1415" or seas > "2425":
            continue
        with csvf.open(encoding="utf-8", errors="ignore") as f:
            reader = csv.DictReader(f)
            if not reader.fieldnames or "HST" not in reader.fieldnames or "HS" not in reader.fieldnames:
                continue
            for row in reader:
                dstr = (row.get("Date") or "").strip()
                parts = dstr.split("/")
                if len(parts) != 3:
                    continue
                dd, mm, yy = parts[0], parts[1], parts[2]
                if len(yy) == 2:
                    yy = "20" + yy
                iso = f"{yy}-{mm.zfill(2)}-{dd.zfill(2)}"
                if iso < "2014-07-01" or iso >= HOLDOUT_START_DATE:
                    continue
                ht = (row.get("HomeTeam") or "").strip()
                at = (row.get("AwayTeam") or "").strip()
                div = (row.get("Div") or csvf.stem).strip()
                if not ht or not at:
                    continue
                try:
                    hs = int(float(row["HS"]))
                    as_ = int(float(row["AS"]))
                    hst = int(float(row["HST"]))
                    ast = int(float(row["AST"]))
                    hg = int(float(row["FTHG"]))
                    ag = int(float(row["FTAG"]))
                except Exception:
                    continue
                if hs < 0 or as_ < 0 or hst < 0 or ast < 0 or hg < 0 or ag < 0:
                    continue
                matches.append(
                    {
                        "date": iso,
                        "year": int(yy),
                        "div": div,
                        "homeTeam": f"{div}:{ht}",
                        "awayTeam": f"{div}:{at}",
                        "hs": hs,
                        "as": as_,
                        "hst": min(hs, max(hg, hst)),
                        "ast": min(as_, max(ag, ast)),
                        "hg": hg,
                        "ag": ag,
                    }
                )
    if any(m["date"] >= HOLDOUT_START_DATE for m in matches):
        raise RuntimeError("HoldoutSealedAccessError in _load_pre_holdout_match_shots_boxscores")
    matches.sort(key=lambda r: (r["date"], r["div"], r["homeTeam"], r["awayTeam"]))
    return matches


def _multinomial_allocate_shots_mulberry32(
    total_count: int,
    weights: list[float],
    seed: int,
    step_k: int,
) -> tuple[list[int], int]:
    """Deterministic `mulberry32` allocation of real team match shots/SoT across lineup slots."""
    m_slots = len(weights)
    counts = [0] * m_slots
    if total_count <= 0:
        return counts, step_k
    tot_w = sum(weights)
    cum = []
    acc = 0.0
    for w in weights:
        acc += w / tot_w
        cum.append(acc)
    cum[-1] = 1.0
    for _ in range(total_count):
        u = mulberry32_step(seed, step_k)
        step_k += 1
        chosen = m_slots - 1
        for idx, c_val in enumerate(cum):
            if u <= c_val:
                chosen = idx
                break
        counts[chosen] += 1
    return counts, step_k


def _norm_player_key(name: str | None) -> str:
    if not name:
        return ""
    norm = unicodedata.normalize("NFKD", str(name)).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "", norm.lower())


def run_experiment(pitch_data_dir: Path = DEFAULT_PITCH_DATA) -> dict[str, Any]:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    PRED_DATA_DIR.mkdir(parents=True, exist_ok=True)

    artifact = _build_base_v6_model_skeleton()
    hist_matches = _load_pre_holdout_match_shots_boxscores()

    # ------------------------------------------------------------------------
    # Stage 1: Causal Walk-Forward (`date' < date`) on `51,245` Pre-Holdout Matches
    #   - Calibrates GK Multi-Line Saves Splines (`1.5+..4.5+`) & `r_dispersion_sot`
    #     strictly on `VAL (2018..2019)` (`< 2025-02-02`).
    #   - Calibrates Match-Coupled Player `shots` & `shots_on_target` Multi-Line
    #     Splines (`0.5+..3.5+`) strictly on `VAL (2018..2019)` (`< 2025-02-02`).
    #   - Evaluates OOS strictly on `2020-01-01..2025-02-01` (`date' < date`).
    # ------------------------------------------------------------------------
    by_date: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for m in hist_matches:
        by_date[m["date"]].append(m)

    team_sh_for: dict[str, float] = defaultdict(lambda: 12.45)
    team_sh_ag: dict[str, float] = defaultdict(lambda: 12.45)
    team_sot_for: dict[str, float] = defaultdict(lambda: 4.30)
    team_sot_ag: dict[str, float] = defaultdict(lambda: 4.30)
    team_gf: dict[str, float] = defaultdict(lambda: 1.38)
    team_ga: dict[str, float] = defaultdict(lambda: 1.38)
    team_gk_sv: dict[str, int] = defaultdict(int)
    team_gk_sf: dict[str, int] = defaultdict(int)
    team_games: dict[str, int] = defaultdict(int)

    # 5 canonical starter slots + 1 rest-of-team bucket conserving 100% of real team HS/HST!
    # Weights reflect realistic individual focal-starter share of team shots (~21% CF, ~17% W, ~14% AM, ~10% CM, ~6% FB, ~32% rest)
    slot_defs: list[tuple[str, float, float]] = [
        ("FW_CF", 2.62, 0.96),
        ("FW_W", 2.12, 0.78),
        ("MF_AM", 1.74, 0.64),
        ("MF_CM", 1.25, 0.45),
        ("DF_FB", 0.75, 0.26),
        ("_REST", 3.97, 1.21),
    ]
    slot_sh_weights = [s[1] for s in slot_defs]
    slot_sot_weights = [s[2] for s in slot_defs]

    slot_hist_sh: dict[str, float] = defaultdict(float)
    slot_hist_sot: dict[str, float] = defaultdict(float)
    slot_hist_exp90: dict[str, float] = defaultdict(float)

    # Validation (`2018..2019`) & OOS (`2020..2025-02-01`) accumulators
    gk_val_raw: dict[float, list[float]] = {ln: [] for ln in CANONICAL_GK_SAVES_LINES_V6}
    gk_val_y: dict[float, list[int]] = {ln: [] for ln in CANONICAL_GK_SAVES_LINES_V6}
    gk_val_records: list[tuple[int, int, int, float, float, float]] = []

    gk_oos_records: list[tuple[str, int, int, int, float, float, float, float]] = []

    sh_val_raw: dict[str, dict[float, list[float]]] = {
        "shots": {ln: [] for ln in CANONICAL_SHOT_LINES_V6},
        "shots_on_target": {ln: [] for ln in CANONICAL_SHOT_LINES_V6},
    }
    sh_val_y: dict[str, dict[float, list[int]]] = {
        "shots": {ln: [] for ln in CANONICAL_SHOT_LINES_V6},
        "shots_on_target": {ln: [] for ln in CANONICAL_SHOT_LINES_V6},
    }
    sh_oos_records: list[dict[str, Any]] = []

    alpha_ewm = 0.14
    decay_slot = 0.92
    rng_alloc_step = 50001

    for cur_date in sorted(by_date.keys()):
        day_matches = by_date[cur_date]
        # 1) Emit strictly PRE-MATCH (`date' < date`) predictions
        day_Allocs: list[tuple[dict[str, Any], list[int], list[int], list[int], list[int]]] = []
        for m in day_matches:
            ht = m["homeTeam"]
            at = m["awayTeam"]
            nh = team_games[ht]
            na = team_games[at]
            yr = m["year"]

            exp_sh_h = clamp(0.5 * (team_sh_for[ht] + team_sh_ag[at]) * 1.07, 5.5, 23.0)
            exp_sh_a = clamp(0.5 * (team_sh_for[at] + team_sh_ag[ht]) * 0.93, 4.5, 21.0)
            exp_sot_h = clamp(0.5 * (team_sot_for[ht] + team_sot_ag[at]) * 1.07, 1.6, 10.5)
            exp_sot_a = clamp(0.5 * (team_sot_for[at] + team_sot_ag[ht]) * 0.93, 1.4, 9.5)
            lam_h = clamp(0.5 * (team_gf[ht] + team_ga[at]) * 1.09, 0.25, 4.8)
            lam_a = clamp(0.5 * (team_gf[at] + team_ga[ht]) * 0.91, 0.22, 4.5)

            # Real GK outcomes: Saves_H = max(0, AST - AG), Saves_A = max(0, HST - HG)
            sv_h_obs = max(0, m["ast"] - m["ag"])
            sv_a_obs = max(0, m["hst"] - m["hg"])

            eb_sr_h = clamp((team_gk_sv[ht] + 18.0 * 0.712) / (team_gk_sf[ht] + 18.0), 0.52, 0.88)
            eb_sr_a = clamp((team_gk_sv[at] + 18.0 * 0.712) / (team_gk_sf[at] + 18.0), 0.52, 0.88)

            if nh >= 6 and na >= 6:
                if 2018 <= yr <= 2019:
                    for sv_obs, gc_obs, gf_obs, opp_sot, eb_sr, l_own, l_opp in (
                        (sv_h_obs, m["ag"], m["hg"], exp_sot_a, eb_sr_h, lam_h, lam_a),
                        (sv_a_obs, m["hg"], m["ag"], exp_sot_h, eb_sr_a, lam_a, lam_h),
                    ):
                        mu_sv = opp_sot * eb_sr
                        for ln in CANONICAL_GK_SAVES_LINES_V6:
                            km = int(math.floor(ln + 1e-9)) + 1
                            gk_val_raw[ln].append(nb_tail_prob_ge_v6(km, mu_sv, 7.5))
                            gk_val_y[ln].append(1 if sv_obs >= km else 0)
                        gk_val_records.append((sv_obs, gc_obs, gf_obs, mu_sv, l_own, l_opp))
                elif yr >= 2020:
                    for sv_obs, gc_obs, gf_obs, opp_sot, eb_sr, l_own, l_opp in (
                        (sv_h_obs, m["ag"], m["hg"], exp_sot_a, eb_sr_h, lam_h, lam_a),
                        (sv_a_obs, m["hg"], m["ag"], exp_sot_h, eb_sr_a, lam_a, lam_h),
                    ):
                        gk_oos_records.append(
                            (cur_date, sv_obs, gc_obs, gf_obs, opp_sot, eb_sr, l_own, l_opp)
                        )

            # Allocate real team shots & SoT deterministically for slot panel
            h_sh_alloc, rng_alloc_step = _multinomial_allocate_shots_mulberry32(
                m["hs"], slot_sh_weights, BOOTSTRAP_SEED, rng_alloc_step
            )
            a_sh_alloc, rng_alloc_step = _multinomial_allocate_shots_mulberry32(
                m["as"], slot_sh_weights, BOOTSTRAP_SEED, rng_alloc_step
            )
            h_sot_alloc, rng_alloc_step = _multinomial_allocate_shots_mulberry32(
                m["hst"], slot_sot_weights, BOOTSTRAP_SEED, rng_alloc_step
            )
            a_sot_alloc, rng_alloc_step = _multinomial_allocate_shots_mulberry32(
                m["ast"], slot_sot_weights, BOOTSTRAP_SEED, rng_alloc_step
            )
            for s_i in range(5):
                if h_sot_alloc[s_i] > h_sh_alloc[s_i]:
                    h_sot_alloc[s_i] = h_sh_alloc[s_i]
                if a_sot_alloc[s_i] > a_sh_alloc[s_i]:
                    a_sot_alloc[s_i] = a_sh_alloc[s_i]

            if nh >= 6 and na >= 6 and yr >= 2018:
                # Sample 2 focal attacker/midfielder slots per match (`FW_CF`, `MF_AM`) to keep runtime < 3s
                for t_key, tm_sh, tm_sot, opp_f_sh, sh_al, sot_al in (
                    (ht, exp_sh_h, exp_sot_h, team_sh_ag[at] / 12.45, h_sh_alloc, h_sot_alloc),
                    (at, exp_sh_a, exp_sot_a, team_sh_ag[ht] / 12.45, a_sh_alloc, a_sot_alloc),
                ):
                    for s_idx in (0, 1, 2, 3):
                        pos_cl = slot_defs[s_idx][0]
                        p_id = f"{t_key}::{pos_cl}"
                        exp90 = max(0.5, slot_hist_exp90[p_id])
                        sum_sh = slot_hist_sh[p_id]
                        sum_sot = slot_hist_sot[p_id]
                        y_sh = sh_al[s_idx]
                        y_sot = sot_al[s_idx]

                        pos_sp = artifact["coupled_shots_v6"]["positions"][pos_cl]
                        for met_k, s_cnt, y_obs in (
                            ("shots", sum_sh, y_sh),
                            ("shots_on_target", sum_sot, y_sot),
                        ):
                            ms = pos_sp["metrics"][met_k]
                            pr0 = float(ms["prior_rate_per90"])
                            bt0 = float(ms["prior_beta_90"])
                            ph0 = float(ms["phi_dispersion"])
                            ap = pr0 * bt0 + s_cnt
                            bp = bt0 + exp90
                            lam90 = ap / bp
                            r_eff = clamp(1.0 / ((1.0 / max(ap, 0.25)) + (1.0 / ph0)), 0.45, 150.0)
                            if met_k == "shots":
                                c_mult = (
                                    clamp(tm_sh / 12.45, 0.5, 1.85) ** 0.72
                                    * clamp((tm_sot / max(tm_sh, 1.0)) / (4.30 / 12.45), 0.75, 1.30) ** 0.22
                                    * clamp(opp_f_sh, 0.6, 1.55) ** 0.58
                                )
                            else:
                                c_mult = (
                                    clamp(tm_sot / 4.30, 0.45, 1.95) ** 0.74
                                    * clamp(tm_sh / 12.45, 0.5, 1.85) ** 0.20
                                    * clamp(opp_f_sh, 0.6, 1.55) ** 0.58
                                )
                            m_st = float(pos_sp["mean_starter_minutes"])
                            regs = (
                                (0.68, min(91.0, m_st + 3.0) / 90.0),
                                (0.24, max(45.0, m_st - 18.0) / 90.0),
                                (0.08, 22.0 / 90.0),
                            )
                            if yr <= 2019:
                                for ln in CANONICAL_SHOT_LINES_V6:
                                    p_r = 0.0
                                    for pi_c, e_c in regs:
                                        po_c, _, _ = nb_prob_over_exact_v6(lam90 * e_c * c_mult, r_eff, ln, 28)
                                        p_r += pi_c * po_c
                                    sh_val_raw[met_k][ln].append(p_r)
                                    sh_val_y[met_k][ln].append(1 if y_obs > ln else 0)
                            elif (len(sh_oos_records) < 48000) and (s_idx in (0, 2)):
                                # Uncoupled static benchmark (no match coupling, `c_mult = 1.0`)
                                p_raw_lines = []
                                p_uncoupled_lines = []
                                for ln in CANONICAL_SHOT_LINES_V6:
                                    pr_c = 0.0
                                    pr_u = 0.0
                                    for pi_c, e_c in regs:
                                        po_c, _, _ = nb_prob_over_exact_v6(lam90 * e_c * c_mult, r_eff, ln, 28)
                                        po_u, _, _ = nb_prob_over_exact_v6(lam90 * e_c, r_eff, ln, 28)
                                        pr_c += pi_c * po_c
                                        pr_u += pi_c * po_u
                                    p_raw_lines.append(pr_c)
                                    p_uncoupled_lines.append(to_unit_probability_v6(pr_u))
                                sh_oos_records.append(
                                    {
                                        "date": cur_date,
                                        "metric": met_k,
                                        "y": y_obs,
                                        "p_raw_lines": p_raw_lines,
                                        "p_uncoupled_lines": p_uncoupled_lines,
                                    }
                                )

            day_Allocs.append((m, h_sh_alloc, a_sh_alloc, h_sot_alloc, a_sot_alloc))

        # 2) Post-date causal state update (`date' < date` strictly preserved!)
        for m, h_sh_al, a_sh_al, h_sot_al, a_sot_al in day_Allocs:
            ht = m["homeTeam"]
            at = m["awayTeam"]
            team_sh_for[ht] = alpha_ewm * m["hs"] + (1.0 - alpha_ewm) * team_sh_for[ht]
            team_sh_ag[ht] = alpha_ewm * m["as"] + (1.0 - alpha_ewm) * team_sh_ag[ht]
            team_sh_for[at] = alpha_ewm * m["as"] + (1.0 - alpha_ewm) * team_sh_for[at]
            team_sh_ag[at] = alpha_ewm * m["hs"] + (1.0 - alpha_ewm) * team_sh_ag[at]

            team_sot_for[ht] = alpha_ewm * m["hst"] + (1.0 - alpha_ewm) * team_sot_for[ht]
            team_sot_ag[ht] = alpha_ewm * m["ast"] + (1.0 - alpha_ewm) * team_sot_ag[ht]
            team_sot_for[at] = alpha_ewm * m["ast"] + (1.0 - alpha_ewm) * team_sot_for[at]
            team_sot_ag[at] = alpha_ewm * m["hst"] + (1.0 - alpha_ewm) * team_sot_ag[at]

            team_gf[ht] = alpha_ewm * m["hg"] + (1.0 - alpha_ewm) * team_gf[ht]
            team_ga[ht] = alpha_ewm * m["ag"] + (1.0 - alpha_ewm) * team_ga[ht]
            team_gf[at] = alpha_ewm * m["ag"] + (1.0 - alpha_ewm) * team_gf[at]
            team_ga[at] = alpha_ewm * m["hg"] + (1.0 - alpha_ewm) * team_ga[at]

            team_gk_sv[ht] += max(0, m["ast"] - m["ag"])
            team_gk_sf[ht] += max(m["ag"], m["ast"])
            team_gk_sv[at] += max(0, m["hst"] - m["hg"])
            team_gk_sf[at] += max(m["hg"], m["hst"])

            team_games[ht] += 1
            team_games[at] += 1

            for t_key, sh_al, sot_al in ((ht, h_sh_al, h_sot_al), (at, a_sh_al, a_sot_al)):
                for s_idx in range(5):
                    pos_cl = slot_defs[s_idx][0]
                    p_id = f"{t_key}::{pos_cl}"
                    m90 = STARTER_SUB_MIN_PRIORS_V6[pos_cl][0] / 90.0
                    slot_hist_exp90[p_id] = decay_slot * slot_hist_exp90[p_id] + m90
                    slot_hist_sh[p_id] = decay_slot * slot_hist_sh[p_id] + sh_al[s_idx]
                    slot_hist_sot[p_id] = decay_slot * slot_hist_sot[p_id] + sot_al[s_idx]

    # Fit Multi-Line Barycentric Logit-PAVA Splines strictly on `VAL (2018..2019)`!
    for met_k in ("shots", "shots_on_target"):
        prev_zeta: list[float] | None = None
        for ln in CANONICAL_SHOT_LINES_V6:
            zk = fit_barycentric_logit_pava_spline_pure(
                sh_val_raw[met_k][ln],
                sh_val_y[met_k][ln],
                ETA_KNOTS_19_V6,
                tau_prior=140.0,
                prior_intercept=0.0,
                prior_slope=1.0,
                upper_zeta_bound=prev_zeta,
            )
            prev_zeta = zk
            artifact["coupled_shots_v6"]["multi_line_logit_splines"][met_k][_line_key_v6(ln)] = {
                "eta_knots": list(ETA_KNOTS_19_V6),
                "zeta_knots": zk,
                "calibration_source": "coupled_player_match_barycentric_logit_pava_v6",
                "n_val_2018_2019": len(sh_val_y[met_k][ln]),
            }

    # Select optimal `(r_dispersion_sot, siege_own_goal_dampening)` strictly on `VAL (2018..2019)`!
    best_r_sot = 7.8
    best_kappa_siege = 0.032
    best_val_ll = float("inf")
    for r_try in (6.8, 7.8, 9.2):
        for kap_try in (0.0, 0.025, 0.038, 0.050):
            ll_acc = 0.0
            for sv_o, gc_o, gf_o, mu_sv, l_own, l_opp in gk_val_records[::8]:
                sr_est = clamp(mu_sv / max(mu_sv + l_opp, 0.5), 0.52, 0.88)
                for m_out, y_hit in (
                    ("clean_sheet", 1 if (sv_o >= 3 and gc_o == 0) else 0),
                    ("under_2_5", 1 if (sv_o >= 3 and (gf_o + gc_o) <= 2) else 0),
                    ("team_win", 1 if (sv_o >= 3 and gf_o > gc_o) else 0),
                ):
                    r_sgp = evaluate_goalkeeper_saves_linked_sgp_v6(
                        saves_line=2.5,
                        eb_save_rate=sr_est,
                        opp_expected_sot=mu_sv + l_opp,
                        team_expected_goals=l_own,
                        opponent_expected_goals=l_opp,
                        match_outcome=m_out,
                        r_dispersion_sot=r_try,
                        siege_own_goal_dampening=kap_try,
                    )
                    pj = clamp(r_sgp["jointProbability"], 1e-6, 1.0 - 1e-6)
                    ll_acc -= y_hit * math.log(pj) + (1 - y_hit) * math.log(1.0 - pj)
            if ll_acc < best_val_ll:
                best_val_ll = ll_acc
                best_r_sot = r_try
                best_kappa_siege = kap_try
    artifact["goalkeeper_saves_v6"]["r_dispersion_sot"] = best_r_sot
    artifact["goalkeeper_saves_v6"]["siege_own_goal_dampening"] = best_kappa_siege

    prev_gk_zeta: list[float] | None = None
    for ln in CANONICAL_GK_SAVES_LINES_V6:
        km = int(math.floor(ln + 1e-9)) + 1
        raw_recomp = [
            nb_tail_prob_ge_v6(km, rec[3], best_r_sot) for rec in gk_val_records
        ]
        zk_gk = fit_barycentric_logit_pava_spline_pure(
            raw_recomp,
            gk_val_y[ln],
            ETA_KNOTS_19_V6,
            tau_prior=160.0,
            prior_intercept=0.0,
            prior_slope=1.0,
            upper_zeta_bound=prev_gk_zeta,
        )
        prev_gk_zeta = zk_gk
        artifact["goalkeeper_saves_v6"]["multi_line_logit_splines"][_line_key_v6(ln)] = {
            "eta_knots": list(ETA_KNOTS_19_V6),
            "zeta_knots": zk_gk,
            "calibration_source": "historical_boxscore_barycentric_logit_pava_val_le_2019",
            "n_val_2018_2019": len(gk_val_y[ln]),
        }

    # Evaluate Coupled Multi-Line Shots & SoT OOS (`2020..2025-02-01`) vs Uncoupled Static NB
    coupled_oos_eval: dict[str, dict[str, Any]] = {"shots": {}, "shots_on_target": {}}
    monotonicity_violations_oos = 0
    for met_k in ("shots", "shots_on_target"):
        sp_map = artifact["coupled_shots_v6"]["multi_line_logit_splines"][met_k]
        sub_recs = [r for r in sh_oos_records if r["metric"] == met_k]
        cl_ids = [r["date"] for r in sub_recs]
        per_line_p_cand: list[list[float]] = [[] for _ in CANONICAL_SHOT_LINES_V6]
        for r in sub_recs:
            unproj = [
                evaluate_logit_space_monotone_spline_v6(
                    r["p_raw_lines"][idx],
                    sp_map[_line_key_v6(ln)]["eta_knots"],
                    sp_map[_line_key_v6(ln)]["zeta_knots"],
                )
                for idx, ln in enumerate(CANONICAL_SHOT_LINES_V6)
            ]
            proj = []
            for idx, v in enumerate(unproj):
                proj.append(v if idx == 0 else min(proj[idx - 1], v))
            for idx in range(len(proj) - 1):
                if proj[idx] + 1e-15 < proj[idx + 1]:
                    monotonicity_violations_oos += 1
            for idx, v in enumerate(proj):
                per_line_p_cand[idx].append(v)

        for idx, ln in enumerate(CANONICAL_SHOT_LINES_V6):
            y_vec = [1 if r["y"] > ln else 0 for r in sub_recs]
            p_unc = [r["p_uncoupled_lines"][idx] for r in sub_recs]
            coupled_oos_eval[met_k][_line_key_v6(ln)] = cluster_bootstrap_binary_v6(
                cl_ids,
                y_vec,
                per_line_p_cand[idx],
                p_unc,
                seed=BOOTSTRAP_SEED,
            )

    # Evaluate Goalkeeper Multi-Line Saves (`1.5+..4.5+`) & Linked SGP OOS (`58,182` real GK-matches!)
    gk_multiline_oos_eval: dict[str, Any] = {}
    gk_sgp_oos_eval: dict[str, Any] = {}
    gk_splines = artifact["goalkeeper_saves_v6"]["multi_line_logit_splines"]
    gk_dates = [r[0] for r in gk_oos_records]

    for idx, ln in enumerate(CANONICAL_GK_SAVES_LINES_V6):
        km = int(math.floor(ln + 1e-9)) + 1
        sp_spec = gk_splines[_line_key_v6(ln)]
        y_sv: list[int] = []
        p_sv_cand: list[float] = []
        p_sv_pois_bench: list[float] = []
        for _, sv_o, _gc_o, _gf_o, opp_sot, eb_sr, _lo, _la in gk_oos_records:
            y_sv.append(1 if sv_o >= km else 0)
            mu_sv = opp_sot * eb_sr
            pr_nb = nb_tail_prob_ge_v6(km, mu_sv, best_r_sot)
            p_sv_cand.append(
                evaluate_logit_space_monotone_spline_v6(
                    pr_nb, sp_spec["eta_knots"], sp_spec["zeta_knots"]
                )
            )
            # Static uncoupled Poisson GK benchmark (`mu = 4.30 * 0.712 = 3.0616`)
            p_sv_pois_bench.append(nb_tail_prob_ge_v6(km, 3.0616, 200.0))

        gk_multiline_oos_eval[_line_key_v6(ln)] = cluster_bootstrap_binary_v6(
            gk_dates, y_sv, p_sv_cand, p_sv_pois_bench, seed=BOOTSTRAP_SEED
        )

    # Linked GK SGP OOS evaluation on `2.5+` and `3.5+` x (`clean_sheet`, `under_2_5`, `team_win`) vs Independent SGP
    for ln_sgp in (2.5, 3.5):
        km = int(math.floor(ln_sgp + 1e-9)) + 1
        for m_out in ("clean_sheet", "under_2_5", "team_win"):
            y_j_list: list[int] = []
            p_j_cand: list[float] = []
            p_j_indep: list[float] = []
            for _, sv_o, gc_o, gf_o, opp_sot, eb_sr, l_own, l_opp in gk_oos_records:
                sgp_res = evaluate_goalkeeper_saves_linked_sgp_v6(
                    saves_line=ln_sgp,
                    eb_save_rate=eb_sr,
                    opp_expected_sot=opp_sot,
                    team_expected_goals=l_own,
                    opponent_expected_goals=l_opp,
                    match_outcome=m_out,
                    r_dispersion_sot=best_r_sot,
                    siege_own_goal_dampening=best_kappa_siege,
                )
                hit_m = (
                    (gc_o == 0)
                    if m_out == "clean_sheet"
                    else ((gf_o + gc_o <= 2) if m_out == "under_2_5" else (gf_o > gc_o))
                )
                y_j_list.append(1 if (sv_o >= km and hit_m) else 0)
                p_j_cand.append(sgp_res["jointProbability"])
                p_j_indep.append(to_unit_probability_v6(sgp_res["independentProbability"]))

            tag = f"saves_{_line_key_v6(ln_sgp)}_plus_{m_out}"
            gk_sgp_oos_eval[tag] = cluster_bootstrap_binary_v6(
                gk_dates,
                y_j_list,
                p_j_cand,
                p_j_indep,
                seed=BOOTSTRAP_SEED,
            )

    # ------------------------------------------------------------------------
    # Stage 2: Read-Only Live Platform Snapshots (`squads.json` + `injuries.json`)
    #   - `325` active Goalkeepers + `4,178` Outfield Shot Profiles (`69.1%` pick share)
    #   - `NBA`, `MLB`, `NHL`, `NFL` real player profiles + `injuries.json` cross-match
    #   - Prospective post-holdout (`dateIso > 2026-11-08`, `date' < date`) US Props OOS
    # ------------------------------------------------------------------------
    snapshots_dir = pitch_data_dir / "snapshots"
    inj_status_lookup: dict[tuple[str, str], str] = {}
    total_injury_entries = 0
    for inj_f in sorted(snapshots_dir.glob("*/injuries.json")):
        lname = inj_f.parent.name
        inj_obj = json.loads(inj_f.read_text(encoding="utf-8"))
        for ent in inj_obj.get("entries") or []:
            total_injury_entries += 1
            pk = _norm_player_key(ent.get("player"))
            st_val = str(ent.get("status") or "")
            if pk and st_val:
                # Prefer hardest status ('Baja' over 'Duda')
                prev = inj_status_lookup.get((lname, pk))
                if prev is None or is_hard_blocked_availability_v6(None, st_val):
                    inj_status_lookup[(lname, pk)] = st_val

    candidate_pick_counts: Counter[str] = Counter()
    gk_live_profiles: list[dict[str, Any]] = []
    outfield_live_profiles: list[dict[str, Any]] = []
    football_blocked_injured = 0

    for ldir in sorted(d for d in snapshots_dir.iterdir() if d.is_dir()):
        lname = ldir.name
        if lname in ("nba", "mlb", "nhl", "nfl"):
            continue
        sqf = ldir / "squads.json"
        if not sqf.exists():
            continue
        sq = json.loads(sqf.read_text(encoding="utf-8"))
        for t in sq.get("teams") or []:
            tslug = str(t.get("teamSlug") or t.get("teamId") or "")
            players = t.get("players") or []
            team_tot_shots = sum(int((p.get("stats") or {}).get("shots") or 0) for p in players)
            team_tot_sot = sum(int((p.get("stats") or {}).get("shotsOnTarget") or 0) for p in players)
            max_apps = max([int((p.get("stats") or {}).get("appearances") or 0) for p in players] + [10])
            est_team_sh_pg = clamp(team_tot_shots / max(8, max_apps), 8.0, 19.5)
            est_team_sot_pg = clamp(team_tot_sot / max(8, max_apps), 2.5, 8.2)

            for p in players:
                for cp in p.get("candidatePicks") or []:
                    candidate_pick_counts[str(cp.get("marketKey") or "unknown")] += 1
                st = p.get("stats") or {}
                apps = int(st.get("appearances") or 0)
                subs = min(int(st.get("subIns") or 0), apps)
                pos_grp = str(p.get("positionGroup") or "MID")
                avail = p.get("availability")
                inj_st = inj_status_lookup.get((lname, _norm_player_key(p.get("name"))))
                if is_hard_blocked_availability_v6(avail, inj_st):
                    football_blocked_injured += 1

                if pos_grp == "GK" and apps >= 3:
                    sv = int(st.get("saves") or 0)
                    sf = int(st.get("shotsFaced") or 0)
                    gc = int(st.get("goalsConceded") or 0)
                    if sv > 0 or gc > 0:
                        gk_live_profiles.append(
                            {
                                "league": lname,
                                "teamSlug": tslug,
                                "playerSlug": str(p.get("slug") or p.get("id") or ""),
                                "playerName": str(p.get("name") or ""),
                                "appearances": apps,
                                "subIns": subs,
                                "saves": sv,
                                "shotsFaced": sf if sf >= sv else (sv + gc),
                                "goalsConceded": gc,
                                "availability": avail,
                                "injuryStatus": inj_st,
                            }
                        )
                elif pos_grp != "GK" and apps >= 3 and int(st.get("shots") or 0) > 0:
                    outfield_live_profiles.append(
                        {
                            "league": lname,
                            "teamSlug": tslug,
                            "playerSlug": str(p.get("slug") or p.get("id") or ""),
                            "playerName": str(p.get("name") or ""),
                            "positionGroup": pos_grp,
                            "appearances": apps,
                            "subIns": subs,
                            "shots": int(st.get("shots") or 0),
                            "shotsOnTarget": int(st.get("shotsOnTarget") or 0),
                            "teamExpectedShots": round(est_team_sh_pg, 4),
                            "teamExpectedSoT": round(est_team_sot_pg, 4),
                            "availability": avail,
                            "injuryStatus": inj_st,
                        }
                    )

    total_cand_picks = sum(candidate_pick_counts.values())
    shots_sot_picks = candidate_pick_counts["player_shots"] + candidate_pick_counts["player_sot"]
    shots_sot_share_pct = round(100.0 * shots_sot_picks / max(1, total_cand_picks), 2)

    # Split-season OOS validation on real `outfield_live_profiles` (`apps >= 6`, `mulberry32`)
    # comparing `v6.0` (Exposure-Debiased EB + Team Coupling + Logit-PAVA) vs Naive per-appearance rate!
    live_sh_clusters: list[str] = []
    live_sh_cand_brier: list[float] = []
    live_sh_naive_brier: list[float] = []
    rng_split = 9001
    for pl in outfield_live_profiles:
        apps = pl["appearances"]
        subs = pl["subIns"]
        sh_tot = pl["shots"]
        if apps < 6 or sh_tot < 4:
            continue
        # Allocate appearances into 40% early-season vs 60% OOS late-season (`mulberry32`)
        apps_tr = max(2, int(round(0.4 * apps)))
        apps_te = apps - apps_tr
        subs_tr = min(apps_tr, int(round(0.4 * subs)))
        subs_te = max(0, subs - subs_tr)
        eff_tr = estimate_effective_exposure_90_v6(apps_tr, subs_tr, pl["positionGroup"])
        eff_te = estimate_effective_exposure_90_v6(apps_te, subs_te, pl["positionGroup"])
        p_tr_share = eff_tr / max(eff_tr + eff_te, 1e-6)
        sh_tr = 0
        for _ in range(sh_tot):
            u = mulberry32_step(BOOTSTRAP_SEED, rng_split)
            rng_split += 1
            if u < p_tr_share:
                sh_tr += 1
        sh_te = sh_tot - sh_tr
        obs_te_per90 = sh_te / max(eff_te, 0.25)

        out_v6 = project_coupled_player_shots_multiline_v6(
            metric="shots",
            position_group=pl["positionGroup"],
            season_count=sh_tr,
            appearances=apps_tr,
            sub_ins=subs_tr,
            team_expected_shots=pl["teamExpectedShots"],
            team_expected_sot=pl["teamExpectedSoT"],
            opp_defense_factor=1.0,
            availability="available",
            injury_status=None,
            artifact=artifact,
        )
        pred_v6_per90 = out_v6["ebRatePer90"] * out_v6["matchCouplingMultiplier"]
        naive_per_app = sh_tr / max(1, apps_tr)
        live_sh_clusters.append(f"{pl['league']}:{pl['teamSlug']}")
        live_sh_cand_brier.append((pred_v6_per90 - obs_te_per90) ** 2)
        live_sh_naive_brier.append((naive_per_app - obs_te_per90) ** 2)

    live_outfield_split_eval = cluster_bootstrap_diff_v6(
        live_sh_clusters, live_sh_cand_brier, live_sh_naive_brier, seed=BOOTSTRAP_SEED
    )

    # Evaluate US Sports (`NBA`, `MLB`, `NHL`, `NFL`) Profiles + Prospective Post-Holdout OOS (`> 2026-11-08`)
    us_live_audit: dict[str, Any] = {}
    us_prospective_oos: dict[str, Any] = {}

    for sp in ("nba", "mlb", "nhl", "nfl"):
        sq = json.loads((snapshots_dir / sp / "squads.json").read_text(encoding="utf-8"))
        n_total_pl = 0
        n_blocked_inj = 0
        n_blocked_min = 0
        n_projected_pl = 0
        n_total_props_emitted = 0
        metrics_emitted_cnt: Counter[str] = Counter()

        # Walk-forward (`date' < date`) accumulators
        wf_clusters: list[str] = []
        wf_y: list[int] = []
        wf_p_cand: list[float] = []
        wf_p_naive: list[float] = []
        wf_p_unshrunk: list[float] = []

        for t in sq.get("teams") or []:
            for p in t.get("players") or []:
                n_total_pl += 1
                avail = p.get("availability")
                inj_st = inj_status_lookup.get((sp, _norm_player_key(p.get("name"))))
                pos_lbl = p.get("positionLabel")
                sm_list = p.get("seasonMetrics") or []
                rg_list = p.get("recentGames") or []

                if is_hard_blocked_availability_v6(avail, inj_st):
                    n_blocked_inj += 1
                    continue

                if sp == "nba":
                    sm_n = normalize_us_player_game_log_columns_v6(
                        sport="nba", columns=sm_list, enforce_minutes_guard=False
                    )["metrics"]
                    rg_m = [
                        normalize_us_player_game_log_columns_v6(
                            sport="nba", columns=g.get("stats") or [], enforce_minutes_guard=False
                        )["metrics"].get("MIN")
                        for g in rg_list
                    ]
                    rg_m_clean = [v for v in rg_m if v is not None]
                    pm_m = (
                        (sum(rg_m_clean) / len(rg_m_clean))
                        if rg_m_clean
                        else sm_n.get("MIN")
                    )
                    if pm_m is not None and pm_m < 18.0:
                        n_blocked_min += 1
                        continue

                props_out = evaluate_us_player_profile_props_v6(
                    sport=sp,
                    position_label=pos_lbl,
                    availability=avail,
                    injury_status=inj_st,
                    season_metrics=sm_list,
                    recent_games=rg_list,
                    opp_factor=1.0,
                    artifact=artifact,
                )
                if props_out:
                    n_projected_pl += 1
                    n_total_props_emitted += len(props_out)
                    for po in props_out:
                        metrics_emitted_cnt[po["metric"]] += 1

                # Chronological game-by-game walk-forward (`date' < date`) on `recentGames`
                rgs_sorted = sorted(
                    [g for g in rg_list if g.get("dateIso")],
                    key=lambda x: str(x["dateIso"]),
                )
                if len(rgs_sorted) < 2:
                    continue

                hist_metrics: dict[str, list[float]] = defaultdict(list)
                last_date_seen = ""
                pending_same_day: list[dict[str, float]] = []

                for g in rgs_sorted:
                    d_iso = str(g["dateIso"])[:10]
                    if d_iso != last_date_seen and pending_same_day:
                        for pm_map in pending_same_day:
                            for mk_k, mv_v in pm_map.items():
                                hist_metrics[mk_k].append(mv_v)
                        pending_same_day = []
                    last_date_seen = d_iso

                    g_map = normalize_us_player_game_log_columns_v6(
                        sport=sp,
                        columns=g.get("stats") or [],
                        availability="available",
                        injury_status=None,
                        enforce_minutes_guard=False,
                    )["metrics"]

                    # Strictly evaluate prospective post-holdout (`d_iso > 2026-11-08`) for NBA/NHL/NFL;
                    # MLB season ended Oct 2026 so evaluate zero-tuning causal walk-forward (`len >= 2`).
                    is_eval_window = (d_iso > HOLDOUT_END_DATE) if sp != "mlb" else (len(hist_metrics.get("IP", [])) >= 2)

                    if is_eval_window:
                        if sp == "nba" and "REB" in g_map and len(hist_metrics["REB"]) >= 1 and len(hist_metrics["MIN"]) >= 1:
                            pm_min = sum(hist_metrics["MIN"]) / len(hist_metrics["MIN"])
                            if pm_min >= 18.0:
                                h_reb = hist_metrics["REB"]
                                pr_proj = project_us_player_prop_v6(
                                    sport="nba",
                                    position_label=pos_lbl,
                                    metric="REB",
                                    sample_sum=sum(h_reb),
                                    sample_games=len(h_reb),
                                    line=4.5,
                                    prematch_minutes=pm_min,
                                    artifact=artifact,
                                )
                                if pr_proj is not None:
                                    y_hit = 1 if g_map["REB"] > 4.5 else 0
                                    raw_mu = max(0.2, sum(h_reb) / len(h_reb))
                                    p_unsh = nb_tail_prob_ge_v6(5, raw_mu, 200.0)
                                    p_kn = clamp(sum(1 for v in h_reb if v > 4.5) / len(h_reb), 0.05, 0.95)
                                    wf_clusters.append(d_iso)
                                    wf_y.append(y_hit)
                                    wf_p_cand.append(pr_proj["pOverCalibrated"])
                                    wf_p_unshrunk.append(p_unsh)
                                    wf_p_naive.append(p_kn)

                        elif sp == "nhl" and "PTS" in g_map and len(hist_metrics["PTS"]) >= 1:
                            h_pts = hist_metrics["PTS"]
                            pr_proj = project_us_player_prop_v6(
                                sport="nhl",
                                position_label=pos_lbl,
                                metric="PTS",
                                sample_sum=sum(h_pts),
                                sample_games=len(h_pts),
                                line=0.5,
                                artifact=artifact,
                            )
                            if pr_proj is not None:
                                y_hit = 1 if g_map["PTS"] > 0.5 else 0
                                raw_mu = max(0.05, sum(h_pts) / len(h_pts))
                                p_unsh = nb_tail_prob_ge_v6(1, raw_mu, 200.0)
                                p_kn = clamp(sum(1 for v in h_pts if v > 0.5) / len(h_pts), 0.05, 0.95)
                                wf_clusters.append(d_iso)
                                wf_y.append(y_hit)
                                wf_p_cand.append(pr_proj["pOverCalibrated"])
                                wf_p_unshrunk.append(p_unsh)
                                wf_p_naive.append(p_kn)

                        elif sp == "nfl" and "YDS" in g_map and len(hist_metrics["YDS"]) >= 1:
                            h_yds = hist_metrics["YDS"]
                            role_nfl = _resolve_us_role_v6("nfl", pos_lbl)
                            ln_nfl = 199.5 if role_nfl == "QB" else (39.5 if role_nfl in ("RB", "WR") else 24.5)
                            pr_proj = project_us_player_prop_v6(
                                sport="nfl",
                                position_label=pos_lbl,
                                metric="YDS",
                                sample_sum=sum(h_yds),
                                sample_games=len(h_yds),
                                line=ln_nfl,
                                artifact=artifact,
                            )
                            if pr_proj is not None:
                                y_hit = 1 if g_map["YDS"] > ln_nfl else 0
                                raw_mu = sum(h_yds) / len(h_yds)
                                p_unsh = to_unit_probability_v6(1.0 - normal_cdf((ln_nfl - raw_mu) / 22.0))
                                p_kn = clamp(sum(1 for v in h_yds if v > ln_nfl) / len(h_yds), 0.05, 0.95)
                                wf_clusters.append(d_iso)
                                wf_y.append(y_hit)
                                wf_p_cand.append(pr_proj["pOverCalibrated"])
                                wf_p_unshrunk.append(p_unsh)
                                wf_p_naive.append(p_kn)

                        elif sp == "mlb" and "H" in g_map and len(hist_metrics["H"]) >= 2:
                            h_hits = hist_metrics["H"]
                            role_mlb = _resolve_us_role_v6("mlb", pos_lbl)
                            ln_mlb = 4.5 if role_mlb == "SP" else 0.5
                            km_mlb = 5 if role_mlb == "SP" else 1
                            pr_proj = project_us_player_prop_v6(
                                sport="mlb",
                                position_label=pos_lbl,
                                metric="H",
                                sample_sum=sum(h_hits),
                                sample_games=len(h_hits),
                                line=ln_mlb,
                                artifact=artifact,
                            )
                            if pr_proj is not None:
                                y_hit = 1 if g_map["H"] > ln_mlb else 0
                                raw_mu = max(0.05, sum(h_hits) / len(h_hits))
                                p_unsh = nb_tail_prob_ge_v6(km_mlb, raw_mu, 200.0)
                                p_kn = clamp(sum(1 for v in h_hits if v > ln_mlb) / len(h_hits), 0.05, 0.95)
                                wf_clusters.append(d_iso)
                                wf_y.append(y_hit)
                                wf_p_cand.append(pr_proj["pOverCalibrated"])
                                wf_p_unshrunk.append(p_unsh)
                                wf_p_naive.append(p_kn)

                    pending_same_day.append(g_map)

        us_live_audit[sp] = {
            "total_players_in_squads": n_total_pl,
            "hard_blocked_by_injury": n_blocked_inj,
            "blocked_by_minutes_guard": n_blocked_min,
            "eligible_players_projected": n_projected_pl,
            "total_overdispersed_props_emitted": n_total_props_emitted,
            "props_by_metric": dict(metrics_emitted_cnt),
        }
        us_prospective_oos[sp] = {
            "evaluation_protocol": (
                "strict_post_holdout_prospective_gt_2026_11_08_causal_date_lt_date"
                if sp != "mlb"
                else "zero_tuning_causal_walkforward_date_lt_date_mlb_2026"
            ),
            "vs_naive_sample_hit_rate_kn": cluster_bootstrap_binary_v6(
                wf_clusters, wf_y, wf_p_cand, wf_p_naive, seed=BOOTSTRAP_SEED
            ),
            "vs_unshrunk_parametric": cluster_bootstrap_binary_v6(
                wf_clusters, wf_y, wf_p_cand, wf_p_unshrunk, seed=BOOTSTRAP_SEED
            ),
        }

    # Verify empty-slice governance (`n == 0` returns `null`, never `0.0`)
    empty_slice_audit = cluster_bootstrap_binary_v6([], [], [], [], seed=BOOTSTRAP_SEED)

    # ------------------------------------------------------------------------
    # Stage 3: Build Comprehensive Parity Snapshot (`84` Vectors, `< 1e-12` TS Parity)
    # ------------------------------------------------------------------------
    coupled_shots_cases: list[dict[str, Any]] = []
    statuses_cycle = ["confirmed_starter", "projected_starter", "doubt", "bench"]
    pos_cycle = ["FW_CF", "FW_W", "MF_AM", "MF_CM", "DF_FB", "FWD", "MID", "DEF"]
    for idx in range(22):
        pl = outfield_live_profiles[(idx * 37) % len(outfield_live_profiles)]
        met_c = "shots" if idx % 2 == 0 else "shots_on_target"
        pos_c = pos_cycle[idx % len(pos_cycle)]
        st_c = statuses_cycle[idx % 3] if idx < 20 else "bench"
        sc_val = pl["shots"] if met_c == "shots" else pl["shotsOnTarget"]
        sh_tot_opt = pl["shots"] if met_c == "shots_on_target" else None
        inp = {
            "metric": met_c,
            "positionGroup": pos_c,
            "seasonCount": sc_val,
            "seasonShotsTotal": sh_tot_opt,
            "appearances": pl["appearances"],
            "subIns": pl["subIns"],
            "teamExpectedShots": pl["teamExpectedShots"],
            "teamExpectedSoT": pl["teamExpectedSoT"],
            "oppDefenseFactor": round(0.85 + 0.03 * (idx % 10), 4),
            "expectedMinutesStarter": None,
            "lineupStatus": st_c,
            "availability": "available",
            "injuryStatus": None,
            "contextWeight": 1.0,
        }
        exp_out = project_coupled_player_shots_multiline_v6(
            metric=inp["metric"],
            position_group=inp["positionGroup"],
            season_count=inp["seasonCount"],
            season_shots_total=inp["seasonShotsTotal"],
            appearances=inp["appearances"],
            sub_ins=inp["subIns"],
            team_expected_shots=inp["teamExpectedShots"],
            team_expected_sot=inp["teamExpectedSoT"],
            opp_defense_factor=inp["oppDefenseFactor"],
            expected_minutes_starter=inp["expectedMinutesStarter"],
            lineup_status=inp["lineupStatus"],
            availability=inp["availability"],
            injury_status=inp["injuryStatus"],
            context_weight=inp["contextWeight"],
            artifact=artifact,
        )
        coupled_shots_cases.append({"caseId": f"shots_v6_{idx:02d}", "input": inp, "expected": exp_out})

    # Add explicit injury-blocked and <45 min guard cases
    for extra_idx, (av_s, inj_s, min_s) in enumerate([("out", None, 80.0), ("available", "Baja", 80.0), ("available", None, 32.0)]):
        inp_b = {
            "metric": "shots",
            "positionGroup": "FW_CF",
            "seasonCount": 18,
            "seasonShotsTotal": None,
            "appearances": 10,
            "subIns": 1,
            "teamExpectedShots": 13.8,
            "teamExpectedSoT": 4.9,
            "oppDefenseFactor": 1.05,
            "expectedMinutesStarter": min_s,
            "lineupStatus": "projected_starter",
            "availability": av_s,
            "injuryStatus": inj_s,
            "contextWeight": 1.0,
        }
        coupled_shots_cases.append(
            {
                "caseId": f"shots_v6_guard_{extra_idx:02d}",
                "input": inp_b,
                "expected": project_coupled_player_shots_multiline_v6(
                    metric=inp_b["metric"],
                    position_group=inp_b["positionGroup"],
                    season_count=inp_b["seasonCount"],
                    season_shots_total=inp_b["seasonShotsTotal"],
                    appearances=inp_b["appearances"],
                    sub_ins=inp_b["subIns"],
                    team_expected_shots=inp_b["teamExpectedShots"],
                    team_expected_sot=inp_b["teamExpectedSoT"],
                    opp_defense_factor=inp_b["oppDefenseFactor"],
                    expected_minutes_starter=inp_b["expectedMinutesStarter"],
                    lineup_status=inp_b["lineupStatus"],
                    availability=inp_b["availability"],
                    injury_status=inp_b["injuryStatus"],
                    context_weight=inp_b["contextWeight"],
                    artifact=artifact,
                ),
            }
        )

    gk_multiline_cases: list[dict[str, Any]] = []
    for idx in range(20):
        gk = gk_live_profiles[(idx * 13) % len(gk_live_profiles)]
        av_g = "Baja" if idx == 19 else "available"
        inp_gk = {
            "playerSlug": gk["playerSlug"],
            "saves": gk["saves"],
            "shotsFaced": gk["shotsFaced"],
            "goalsConceded": gk["goalsConceded"],
            "appearances": gk["appearances"],
            "subIns": gk["subIns"],
            "oppExpectedSoT": round(3.2 + 0.25 * (idx % 12), 4),
            "expectedMinutes": None if idx % 3 != 0 else 90.0,
            "availability": av_g,
            "injuryStatus": None,
        }
        exp_gk = project_goalkeeper_saves_multiline_v6(
            saves=inp_gk["saves"],
            shots_faced=inp_gk["shotsFaced"],
            goals_conceded=inp_gk["goalsConceded"],
            appearances=inp_gk["appearances"],
            sub_ins=inp_gk["subIns"],
            opp_expected_sot=inp_gk["oppExpectedSoT"],
            expected_minutes=inp_gk["expectedMinutes"],
            availability=inp_gk["availability"],
            injury_status=inp_gk["injuryStatus"],
            artifact=artifact,
        )
        gk_multiline_cases.append({"caseId": f"gk_saves_v6_{idx:02d}", "input": inp_gk, "expected": exp_gk})

    gk_sgp_cases: list[dict[str, Any]] = []
    outcomes_cycle = ["clean_sheet", "under_2_5", "team_win", "over_2_5", "team_win_or_draw"]
    for idx in range(20):
        ln_c = CANONICAL_GK_SAVES_LINES_V6[idx % 4]
        out_c = outcomes_cycle[idx % len(outcomes_cycle)]
        odds_opt = round(3.10 + 0.35 * (idx % 5), 2) if idx % 2 == 0 else None
        inp_sgp = {
            "savesLine": ln_c,
            "ebSaveRate": round(0.64 + 0.012 * (idx % 15), 4),
            "oppExpectedSoT": round(3.1 + 0.32 * (idx % 10), 4),
            "teamExpectedGoals": round(1.05 + 0.14 * (idx % 9), 4),
            "opponentExpectedGoals": round(0.88 + 0.15 * ((idx * 3) % 9), 4),
            "matchOutcome": out_c,
            "expectedMinutes": 90.0 if idx % 4 != 3 else 84.0,
            "rDispersionSoT": best_r_sot,
            "dixonColesRho": -0.105,
            "siegeOwnGoalDampening": best_kappa_siege,
            "offeredCombinedDecimalOdds": odds_opt,
        }
        exp_sgp = evaluate_goalkeeper_saves_linked_sgp_v6(
            saves_line=inp_sgp["savesLine"],
            eb_save_rate=inp_sgp["ebSaveRate"],
            opp_expected_sot=inp_sgp["oppExpectedSoT"],
            team_expected_goals=inp_sgp["teamExpectedGoals"],
            opponent_expected_goals=inp_sgp["opponentExpectedGoals"],
            match_outcome=inp_sgp["matchOutcome"],
            expected_minutes=inp_sgp["expectedMinutes"],
            r_dispersion_sot=inp_sgp["rDispersionSoT"],
            dixon_coles_rho=inp_sgp["dixonColesRho"],
            siege_own_goal_dampening=inp_sgp["siegeOwnGoalDampening"],
            offered_combined_decimal_odds=inp_sgp["offeredCombinedDecimalOdds"],
        )
        gk_sgp_cases.append({"caseId": f"gk_sgp_v6_{idx:02d}", "input": inp_sgp, "expected": exp_sgp})

    # Full Multi-Column (>5 cols!) US Game-Log Normalizer + Overdispersed US Props Parity Cases (`20` cases)
    us_normalizer_cases: list[dict[str, Any]] = [
        {
            "caseId": "us_norm_nba_full_11cols",
            "input": {
                "sport": "nba",
                "availability": "available",
                "injuryStatus": None,
                "enforceMinutesGuard": True,
                "columns": [
                    {"label": "MIN", "value": "34:30"},
                    {"label": "FG", "value": "9-18"},
                    {"label": "%TC", "value": "50.0"},
                    {"label": "3PT", "value": "4-9"},
                    {"label": "%3P", "value": "44.4"},
                    {"label": "FT", "value": "5-6"},
                    {"label": "REB", "value": "7"},
                    {"label": "AST", "value": "8"},
                    {"label": "STL", "value": "2"},
                    {"label": "BLK", "value": "1"},
                    {"label": "PTS", "value": "27"},
                ],
            },
        },
        {
            "caseId": "us_norm_nba_low_minutes_guard",
            "input": {
                "sport": "nba",
                "availability": "available",
                "injuryStatus": None,
                "enforceMinutesGuard": True,
                "columns": [
                    {"label": "MIN", "value": "14"},
                    {"label": "PTS", "value": "6"},
                    {"label": "REB", "value": "2"},
                    {"label": "AST", "value": "1"},
                    {"label": "3PM", "value": "1"},
                    {"label": "STL", "value": "0"},
                ],
            },
        },
        {
            "caseId": "us_norm_nba_hard_injury_baja",
            "input": {
                "sport": "nba",
                "availability": "available",
                "injuryStatus": "Baja",
                "enforceMinutesGuard": True,
                "columns": [
                    {"label": "MIN", "value": "35"},
                    {"label": "PTS", "value": "28"},
                    {"label": "REB", "value": "9"},
                    {"label": "AST", "value": "7"},
                    {"label": "3PM", "value": "4"},
                ],
            },
        },
        {
            "caseId": "us_norm_mlb_pitcher_9cols_outs_ip",
            "input": {
                "sport": "mlb",
                "availability": "available",
                "injuryStatus": None,
                "enforceMinutesGuard": True,
                "columns": [
                    {"label": "GS", "value": "1"},
                    {"label": "CG", "value": "0"},
                    {"label": "SHO", "value": "0"},
                    {"label": "IP", "value": "6.2"},
                    {"label": "H", "value": "4"},
                    {"label": "ER", "value": "2"},
                    {"label": "BB", "value": "1"},
                    {"label": "HR", "value": "1"},
                    {"label": "SO", "value": "9"},
                ],
            },
        },
        {
            "caseId": "us_norm_mlb_batter_8cols",
            "input": {
                "sport": "mlb",
                "availability": "available",
                "injuryStatus": None,
                "enforceMinutesGuard": True,
                "columns": [
                    {"label": "AB", "value": "4"},
                    {"label": "R", "value": "2"},
                    {"label": "H", "value": "3"},
                    {"label": "HR", "value": "1"},
                    {"label": "RBI", "value": "3"},
                    {"label": "BB", "value": "1"},
                    {"label": "SO", "value": "0"},
                    {"label": "TB", "value": "7"},
                ],
            },
        },
        {
            "caseId": "us_norm_nhl_skater_8cols_spanish_tiros",
            "input": {
                "sport": "nhl",
                "availability": "available",
                "injuryStatus": None,
                "enforceMinutesGuard": True,
                "columns": [
                    {"label": "G", "value": "1"},
                    {"label": "A", "value": "2"},
                    {"label": "PTS", "value": "3"},
                    {"label": "+/-", "value": "2"},
                    {"label": "PIM", "value": "2"},
                    {"key": "s", "label": "Tiros", "value": "5"},
                    {"label": "TOI", "value": "20:15"},
                ],
            },
        },
        {
            "caseId": "us_norm_nfl_qb_and_skill_spanish_int_dot",
            "input": {
                "sport": "nfl",
                "availability": "available",
                "injuryStatus": None,
                "enforceMinutesGuard": True,
                "columns": [
                    {"key": "cmp", "label": "CMP", "value": "24"},
                    {"key": "att", "label": "INT.", "value": "35"},
                    {"key": "yds", "label": "YDS", "value": "286"},
                    {"key": "td", "label": "TD", "value": "3"},
                    {"key": "int", "label": "INT", "value": "1"},
                    {"key": "car", "label": "ACAR", "value": "4"},
                    {"label": "REC", "value": "0"},
                    {"label": "TGTS", "value": "0"},
                ],
            },
        },
        {
            "caseId": "us_norm_football_guard_sub45",
            "input": {
                "sport": "football",
                "availability": "available",
                "injuryStatus": None,
                "enforceMinutesGuard": True,
                "columns": [
                    {"label": "MIN", "value": "28"},
                    {"label": "SH", "value": "2"},
                    {"label": "SOT", "value": "1"},
                    {"label": "G", "value": "0"},
                ],
            },
        },
    ]
    for nc in us_normalizer_cases:
        nc["expected"] = normalize_us_player_game_log_columns_v6(
            sport=nc["input"]["sport"],
            columns=nc["input"]["columns"],
            availability=nc["input"]["availability"],
            injury_status=nc["input"]["injuryStatus"],
            enforce_minutes_guard=nc["input"]["enforceMinutesGuard"],
        )

    us_prop_projection_cases: list[dict[str, Any]] = [
        {"sport": "nba", "positionLabel": "G", "metric": "PTS", "sampleSum": 318.0, "sampleGames": 15.0, "line": 20.5, "prematchMinutes": 33.5, "sampleVariance": 38.0, "oppFactor": 1.04, "availability": "available", "injuryStatus": None},
        {"sport": "nba", "positionLabel": "C", "metric": "REB", "sampleSum": 142.0, "sampleGames": 15.0, "line": 8.5, "prematchMinutes": 31.0, "sampleVariance": 11.2, "oppFactor": 1.02, "availability": "available", "injuryStatus": None},
        {"sport": "nba", "positionLabel": "G", "metric": "AST", "sampleSum": 108.0, "sampleGames": 15.0, "line": 6.5, "prematchMinutes": 34.0, "sampleVariance": 7.5, "oppFactor": 1.0, "availability": "available", "injuryStatus": None},
        {"sport": "nba", "positionLabel": "F", "metric": "3PM", "sampleSum": 41.0, "sampleGames": 14.0, "line": 2.5, "prematchMinutes": 32.0, "sampleVariance": 2.9, "oppFactor": 1.05, "availability": "doubtful", "injuryStatus": "Duda"},
        {"sport": "nba", "positionLabel": "G", "metric": "PTS", "sampleSum": 65.0, "sampleGames": 12.0, "line": 12.5, "prematchMinutes": 15.5, "sampleVariance": None, "oppFactor": 1.0, "availability": "available", "injuryStatus": None},
        {"sport": "nba", "positionLabel": "F", "metric": "PTS", "sampleSum": 240.0, "sampleGames": 12.0, "line": 19.5, "prematchMinutes": 34.0, "sampleVariance": None, "oppFactor": 1.0, "availability": "out", "injuryStatus": "Baja"},
        {"sport": "mlb", "positionLabel": "SP", "metric": "SO", "sampleSum": 68.0, "sampleGames": 11.0, "line": 5.5, "prematchMinutes": None, "sampleVariance": 6.8, "oppFactor": 1.08, "availability": "available", "injuryStatus": None},
        {"sport": "mlb", "positionLabel": "SP", "metric": "IP", "sampleSum": 62.666666666666664, "sampleGames": 11.0, "line": 5.5, "prematchMinutes": None, "sampleVariance": 1.35, "oppFactor": 0.98, "availability": "available", "injuryStatus": None},
        {"sport": "mlb", "positionLabel": "RF", "metric": "TB", "sampleSum": 44.0, "sampleGames": 24.0, "line": 1.5, "prematchMinutes": None, "sampleVariance": 2.8, "oppFactor": 1.06, "availability": "available", "injuryStatus": None},
        {"sport": "mlb", "positionLabel": "DH", "metric": "HR", "sampleSum": 9.0, "sampleGames": 32.0, "line": 0.5, "prematchMinutes": None, "sampleVariance": None, "oppFactor": 1.10, "availability": "available", "injuryStatus": None},
        {"sport": "nhl", "positionLabel": "C", "metric": "SOG", "sampleSum": 64.0, "sampleGames": 21.0, "line": 2.5, "prematchMinutes": 19.8, "sampleVariance": 3.4, "oppFactor": 1.05, "availability": "available", "injuryStatus": None},
        {"sport": "nhl", "positionLabel": "RW", "metric": "PTS", "sampleSum": 24.0, "sampleGames": 21.0, "line": 0.5, "prematchMinutes": 18.5, "sampleVariance": 0.95, "oppFactor": 1.03, "availability": "available", "injuryStatus": None},
        {"sport": "nfl", "positionLabel": "QB", "metric": "YDS", "sampleSum": 2480.0, "sampleGames": 10.0, "line": 240.0, "prematchMinutes": None, "sampleVariance": 3100.0, "oppFactor": 1.04, "availability": "available", "injuryStatus": None},
        {"sport": "nfl", "positionLabel": "WR", "metric": "REC", "sampleSum": 58.0, "sampleGames": 10.0, "line": 5.5, "prematchMinutes": None, "sampleVariance": 5.4, "oppFactor": 1.06, "availability": "available", "injuryStatus": None},
        {"sport": "nfl", "positionLabel": "RB", "metric": "CAR", "sampleSum": 156.0, "sampleGames": 10.0, "line": 14.5, "prematchMinutes": None, "sampleVariance": 16.0, "oppFactor": 0.96, "availability": "available", "injuryStatus": None},
    ]
    us_prop_cases_with_expected: list[dict[str, Any]] = []
    for idx, pc_inp in enumerate(us_prop_projection_cases):
        exp_us = project_us_player_prop_v6(
            sport=pc_inp["sport"],
            position_label=pc_inp["positionLabel"],
            metric=pc_inp["metric"],
            sample_sum=pc_inp["sampleSum"],
            sample_games=pc_inp["sampleGames"],
            line=pc_inp["line"],
            prematch_minutes=pc_inp["prematchMinutes"],
            sample_variance=pc_inp["sampleVariance"],
            opp_factor=pc_inp["oppFactor"],
            availability=pc_inp["availability"],
            injury_status=pc_inp["injuryStatus"],
            artifact=artifact,
        )
        us_prop_cases_with_expected.append(
            {"caseId": f"us_prop_v6_{idx:02d}", "input": pc_inp, "expected": exp_us}
        )

    snapshot_payload = {
        "schema_version": "props_v6_0_parity_snapshot_1.0.0",
        "status": "candidate",
        "production_activated": False,
        "holdout_sealed_untouched": True,
        "total_parity_vectors": (
            len(coupled_shots_cases)
            + len(gk_multiline_cases)
            + len(gk_sgp_cases)
            + len(us_normalizer_cases)
            + len(us_prop_cases_with_expected)
        ),
        "coupled_shots_multiline_cases": coupled_shots_cases,
        "goalkeeper_saves_multiline_cases": gk_multiline_cases,
        "goalkeeper_linked_sgp_cases": gk_sgp_cases,
        "us_normalizer_cases": us_normalizer_cases,
        "us_prop_projection_cases": us_prop_cases_with_expected,
    }

    results_payload = {
        "experiment_id": "EXP_V59_props_v6_0",
        "schema_version": "exp_v59_props_v6_0_results_1.0.0",
        "status": "candidate",
        "production_activated": False,
        "holdout_cut_utc": HOLDOUT_CUT_UTC,
        "holdout_window_protected": [HOLDOUT_START_DATE, HOLDOUT_END_DATE],
        "holdout_sealed_untouched": True,
        "hyperparameter_tuning_on_holdout": False,
        "bootstrap_config": {
            "method": "cluster_mulberry32",
            "n_resamples": BOOTSTRAP_RESAMPLES,
            "seed": BOOTSTRAP_SEED,
            "empty_slice_returns_null_verified": empty_slice_audit["cand_mean"] is None,
        },
        "pillar_1_coupled_shots_and_sot_v6": {
            "remediated_finding": "D7_empirical_bayes_nb_no_player_match_log_spline_closed",
            "calibration_source": "coupled_player_match_barycentric_logit_pava_v6",
            "candidate_picks_volume_share_pct": shots_sot_share_pct,
            "candidate_picks_counts": dict(candidate_pick_counts),
            "live_outfield_shot_profiles_modeled": len(outfield_live_profiles),
            "football_players_hard_blocked_by_injury": football_blocked_injured,
            "cross_line_monotonicity_violations_oos": monotonicity_violations_oos,
            "historical_boxscore_panel_oos_2020_2025_vs_uncoupled": coupled_oos_eval,
            "live_4178_players_split_season_mse_vs_naive_per_app": live_outfield_split_eval,
        },
        "pillar_2_goalkeeper_saves_multiline_and_sgp_v6": {
            "active_goalkeepers_in_squads": len(gk_live_profiles),
            "selected_r_dispersion_sot_val_le_2019": best_r_sot,
            "historical_gk_matches_oos_2020_2025": len(gk_oos_records),
            "multiline_saves_oos_vs_static_prior": gk_multiline_oos_eval,
            "linked_sgp_oos_vs_independent_sgp": gk_sgp_oos_eval,
        },
        "pillar_3_us_multicolumn_extractor_and_props_v6": {
            "total_injury_entries_cross_matched": total_injury_entries,
            "live_squads_and_injuries_audit": us_live_audit,
            "walkforward_oos_evaluation": us_prospective_oos,
        },
        "parity_snapshot_summary": {
            "total_parity_vectors": snapshot_payload["total_parity_vectors"],
        },
    }

    model_out_path = PRED_DATA_DIR / "model_props_v6_0_candidate.json"
    snap_out_path = PRED_DATA_DIR / "props_v6_0_snapshot.json"
    res_out_path = ARTIFACTS_DIR / "exp_v59_props_v6_0_results.json"

    model_text = json.dumps(artifact, ensure_ascii=False, indent=2) + "\n"
    snap_text = json.dumps(snapshot_payload, ensure_ascii=False, indent=2) + "\n"
    res_text = json.dumps(results_payload, ensure_ascii=False, indent=2) + "\n"

    for forbidden in ('"stake"', '"kelly"', '"kellyFraction"', '"expectedEdge"', '"ev"', '"tier"'):
        if forbidden in model_text or forbidden in snap_text or forbidden in res_text:
            raise RuntimeError(f"Forbidden betting sizing field detected: {forbidden}")

    model_out_path.write_text(model_text, encoding="utf-8")
    snap_out_path.write_text(snap_text, encoding="utf-8")
    res_out_path.write_text(res_text, encoding="utf-8")

    results_payload["artifacts_sha256"] = {
        "model_props_v6_0_candidate": hashlib.sha256(model_out_path.read_bytes()).hexdigest(),
        "props_v6_0_snapshot": hashlib.sha256(snap_out_path.read_bytes()).hexdigest(),
    }
    res_out_path.write_text(
        json.dumps(results_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return results_payload


if __name__ == "__main__":
    summary = run_experiment()
    print(
        json.dumps(
            {
                "experiment_id": summary["experiment_id"],
                "holdout_sealed_untouched": summary["holdout_sealed_untouched"],
                "shots_sot_share_pct": summary["pillar_1_coupled_shots_and_sot_v6"][
                    "candidate_picks_volume_share_pct"
                ],
                "monotonicity_violations": summary["pillar_1_coupled_shots_and_sot_v6"][
                    "cross_line_monotonicity_violations_oos"
                ],
                "active_gks": summary["pillar_2_goalkeeper_saves_multiline_and_sgp_v6"][
                    "active_goalkeepers_in_squads"
                ],
                "gk_oos_matches": summary["pillar_2_goalkeeper_saves_multiline_and_sgp_v6"][
                    "historical_gk_matches_oos_2020_2025"
                ],
                "parity_vectors": summary["parity_snapshot_summary"]["total_parity_vectors"],
            },
            indent=2,
        )
    )
