"""EXP_V54 — Motor Exacto `v5.1` (Remediado `REM_06`) de `Pago Anticipado` (*Early Payout*) e `In-Play Spacetime`.

Remediaciones de auditoría `v5.1` (`A1, B1, C4, D4`, `< 2025-02-02`, `holdout_sealed` intacto):
  1. Ancla algebraicamente `Early Payout` pre-partido (`curMin == 0`) a `(corePHome, corePDraw, corePAway)` de la
     matriz 4-Param (`P_EP = corePWin + P_DP(max_t lead >= 2 & not win FT)`), garantizando `0` violaciones `A1`.
  2. Calibra empíricamente `own_red_card_rate_mult` y `opp_red_card_rate_mult` en `matches.parquet` (`VAL <= 2019`)
     con regresión Poisson con offset `log(dc_lam)` (controlando fuerza pre-partido, adiós `0.66 / 1.36` inventados).
  3. Reemplaza el `-0.5 * trail_push` arbitrario por física empírica calibrada en `VAL <= 2019` (`HT -> FT`):
     `second_half_tied_damping`, `second_half_lead_openness`, `second_half_trailing_push` y `tempo_gamma_prior_weight`.
  4. Vectoriza el paso DP en NumPy (`< 4 ms/partido` manteniendo paridad `< 1e-13` frente a `inplay_and_early_payout.ts`)
     y aplica `cluster_bootstrap_binary` / `cluster_bootstrap_multiclass` agrupado por `match_id` / `game_id`.
  5. Valida OOS `NFL +17` e `In-Play` si hay acceso a las columnas `nflverse` (`< 2025-02-02`) con caché local, o
     declara honestamente `"theoretical_reflection_unvalidated"` (siempre explícito en `NBA +20` y `MLB +5`).
"""

from __future__ import annotations

import os

os.environ.setdefault("OMP_NUM_THREADS", "4")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")

from datetime import datetime, timezone
import hashlib
import io
import json
import math
from pathlib import Path
import sys
import time
from typing import Any
import urllib.request

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from sklearn.linear_model import LogisticRegression

EXP_DIR = Path(__file__).resolve().parent
REPO_ROOT = EXP_DIR.parents[3]
PRED_LAB_ROOT = REPO_ROOT / "research" / "prediction-lab"
FREE_OPEN_DIR = PRED_LAB_ROOT / "data" / "raw" / "free_open_v33"
EXP_V32_DIR = PRED_LAB_ROOT / "experiments" / "EXP_V32_nfl_epa"
EXP_V40_DIR = PRED_LAB_ROOT / "experiments" / "EXP_V40_soccer_micro_markets"
EXP_V45_DIR = PRED_LAB_ROOT / "experiments" / "EXP_V45_nfl_v4_0_complete"
EXP_V48_DIR = PRED_LAB_ROOT / "experiments" / "EXP_V48_sgp_copula_engine"
ARTIFACTS_DIR = EXP_DIR / "artifacts"
RAW_CACHE_DIR = EXP_DIR / "raw_cache"

for _p in (str(REPO_ROOT), str(EXP_V40_DIR), str(EXP_V45_DIR), str(EXP_V48_DIR), str(EXP_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from services.models.cluster_bootstrap import cluster_bootstrap_binary, cluster_bootstrap_multiclass  # noqa: E402
from run_micro_markets_experiment import (  # noqa: E402
    BOOTSTRAP_SAMPLES,
    BOOTSTRAP_SEED,
    HOLDOUT_CUT_DATE,
    HOLDOUT_CUT_ISO,
    MODEL_SEED,
)
from run_nfl_v4_0_complete import normal_cdf_scalar  # noqa: E402
from run_sgp_copula_experiment import acklam_normal_quantile_scalar  # noqa: E402

INPLAY_MODEL_OUT = REPO_ROOT / "src" / "data" / "prediction" / "model_inplay_early_payout_v5_0_candidate.json"
INPLAY_SNAPSHOT_OUT = REPO_ROOT / "src" / "data" / "prediction" / "inplay_early_payout_v5_0_snapshot.json"
RESULTS_OUT = ARTIFACTS_DIR / "exp_v54_inplay_early_payout_v5_0_results.json"
TRIAL_REGISTRY_OUT = EXP_DIR / "trial_registry_inplay_v50.jsonl"

SOCCER_DP_MAX_GOALS = 10


def _wrap_cluster_binary_es(
    cluster_ids: np.ndarray,
    y_true: np.ndarray,
    p_cand: np.ndarray,
    p_bench: np.ndarray,
    seed: int = BOOTSTRAP_SEED,
) -> dict[str, Any]:
    cb = cluster_bootstrap_binary(cluster_ids, y_true, p_cand, p_bench, n_resamples=BOOTSTRAP_SAMPLES, seed=seed)
    ci_lo, ci_hi = cb["ci95_lo"], cb["ci95_hi"]
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
        "ece": float(cb["ece_cand"]) if cb["ece_cand"] is not None else None,
    }


def evaluate_soccer_early_payout_and_inplay_scalar(
    *,
    pregame_mu_home: float,
    pregame_mu_away: float,
    current_minute: int,
    current_home_goals: int,
    current_away_goals: int,
    red_cards_home: int,
    red_cards_away: int,
    home_already_hit_2: bool,
    away_already_hit_2: bool,
    soccer_cfg: dict[str, Any],
    core_p_home: float | None = None,
    core_p_draw: float | None = None,
    core_p_away: float | None = None,
) -> dict[str, Any]:
    """Espejo exacto (`< 1e-13`) y vectorizado (`< 4 ms/partido`) de `evaluateSoccerEarlyPayoutAndInPlay` en `inplay_and_early_payout.ts`."""
    max_g = int(soccer_cfg["max_goals_dp"])
    g_size = max_g + 1

    cur_min = int(min(max(current_minute, 0), 90))
    h0 = int(min(max(current_home_goals, 0), max_g))
    a0 = int(min(max(current_away_goals, 0), max_g))
    rh = int(min(max(red_cards_home, 0), 4))
    ra = int(min(max(red_cards_away, 0), 4))

    mu_h0 = min(max(float(pregame_mu_home), 0.05), 7.5)
    mu_a0 = min(max(float(pregame_mu_away), 0.05), 7.5)

    own_m = float(soccer_cfg["own_red_card_rate_mult"])
    opp_m = float(soccer_cfg["opp_red_card_rate_mult"])
    red_mult_h = (own_m ** rh) * (opp_m ** ra)
    red_mult_a = (own_m ** ra) * (opp_m ** rh)

    init_mask = 0
    if home_already_hit_2 or (h0 - a0 >= 2):
        init_mask |= 1
    if away_already_hit_2 or (a0 - h0 >= 2):
        init_mask |= 2

    w_buckets = [float(x) for x in soccer_cfg["minute_bucket_weights_6"]]
    trail_push = float(soccer_cfg["second_half_trailing_push"])
    use_v51 = ("second_half_tied_damping" in soccer_cfg) or ("second_half_lead_openness" in soccer_cfg)
    tied_damp = float(soccer_cfg.get("second_half_tied_damping", 0.0))
    lead_open = float(soccer_cfg.get("second_half_lead_openness", 0.0))
    tempo_prior_w = float(soccer_cfg.get("tempo_gamma_prior_weight", 0.0))

    live_tempo_mult = 1.0
    if cur_min > 0 and tempo_prior_w > 0.0:
        elapsed_share = sum(w_buckets[min(5, mm // 15)] / 15.0 for mm in range(cur_min))
        exp_elapsed = (mu_h0 + mu_a0) * elapsed_share
        live_tempo_mult = min(max((tempo_prior_w + (h0 + a0)) / max(tempo_prior_w + exp_elapsed, 1e-6), 0.78), 1.28)

    # Precomputar multiplicadores de estado 2T sobre malla `(g_size, g_size)` (0 bucles internos en Python!)
    h_idx = np.arange(g_size)[:, None]
    a_idx = np.arange(g_size)[None, :]
    abs_diff = np.abs(h_idx - a_idx)
    mult_h_2h = np.ones((g_size, g_size), dtype=np.float64)
    mult_a_2h = np.ones((g_size, g_size), dtype=np.float64)
    if use_v51:
        dm = max(0.65, 1.0 + tied_damp)
        open_sc = 1.0 + lead_open * np.minimum(abs_diff, 2)
        mult_h_2h = np.where(abs_diff == 0, dm, np.where(h_idx < a_idx, open_sc * (1.0 + trail_push), open_sc))
        mult_a_2h = np.where(abs_diff == 0, dm, np.where(a_idx < h_idx, open_sc * (1.0 + trail_push), open_sc))
    else:
        mult_h_2h = np.where(h_idx < a_idx, 1.0 + trail_push, np.where(h_idx > a_idx, max(0.5, 1.0 - 0.5 * trail_push), 1.0))
        mult_a_2h = np.where(a_idx < h_idx, 1.0 + trail_push, np.where(a_idx > h_idx, max(0.5, 1.0 - 0.5 * trail_push), 1.0))

    # Mapeo precomputado de bits de máscara en destino `(nh, na)`
    b_dst = np.where((h_idx - a_idx) >= 2, 1, 0) | np.where((a_idx - h_idx) >= 2, 2, 0)
    dp = np.zeros((g_size, g_size, 4), dtype=np.float64)
    dp[h0, a0, init_mask] = 1.0

    rem_lam_h = 0.0
    rem_lam_a = 0.0

    for m in range(cur_min, 90):
        u_min = w_buckets[min(5, m // 15)] / 15.0
        base_dh = mu_h0 * u_min * red_mult_h * live_tempo_mult
        base_da = mu_a0 * u_min * red_mult_a * live_tempo_mult
        rem_lam_h += base_dh
        rem_lam_a += base_da

        if m >= 45:
            dh = base_dh * mult_h_2h
            da = base_da * mult_a_2h
        else:
            dh = np.full((g_size, g_size), base_dh, dtype=np.float64)
            da = np.full((g_size, g_size), base_da, dtype=np.float64)

        p0h = np.exp(-dh)
        p1h = dh * p0h
        p2h = np.maximum(0.0, 1.0 - p0h - p1h)
        p0a = np.exp(-da)
        p1a = da * p0a
        p2a = np.maximum(0.0, 1.0 - p0a - p1a)

        # Desplazamiento exacto `3 x 3` con acumulación saturada en `max_g`
        acc = np.zeros_like(dp)
        ph_arr = (p0h, p1h, p2h)
        pa_arr = (p0a, p1a, p2a)
        for gh in range(3):
            ph_g = ph_arr[gh]
            for ga in range(3):
                w_step = (ph_g * pa_arr[ga])[:, :, None] * dp
                if gh == 0:
                    tmp_h = w_step
                else:
                    tmp_h = np.zeros_like(dp)
                    tmp_h[gh:max_g, :, :] = w_step[: max_g - gh, :, :]
                    tmp_h[max_g, :, :] = np.sum(w_step[max_g - gh :, :, :], axis=0)
                if ga == 0:
                    acc += tmp_h
                else:
                    acc[:, ga:max_g, :] += tmp_h[:, : max_g - ga, :]
                    acc[:, max_g, :] += np.sum(tmp_h[:, max_g - ga :, :], axis=1)

        # Actualizar bits `hit_h2 (1)` y `hit_a2 (2)` en los estados destino
        dp_next = np.zeros_like(dp)
        for mk_old in range(4):
            mk_new = mk_old | b_dst
            sl_m = acc[:, :, mk_old]
            for mk_dst in range(4):
                mask_eq = mk_new == mk_dst
                if bool(np.any(mask_eq)):
                    dp_next[:, :, mk_dst] += np.where(mask_eq, sl_m, 0.0)
        dp = dp_next

    cell_tot = np.sum(dp, axis=2)
    p_home = float(np.sum(cell_tot[h_idx > a_idx]))
    p_draw = float(np.sum(cell_tot[h_idx == a_idx]))
    p_away = float(np.sum(cell_tot[h_idx < a_idx]))

    m_bits = np.arange(4)[None, None, :]
    p_home_ep = float(np.sum(dp[((m_bits & 1) != 0) | ((h_idx > a_idx)[:, :, None])]))
    p_away_ep = float(np.sum(dp[((m_bits & 2) != 0) | ((a_idx > h_idx)[:, :, None])]))
    p_home_lift_only = float(np.sum(dp[((m_bits & 1) != 0) & ((h_idx <= a_idx)[:, :, None])]))
    p_away_lift_only = float(np.sum(dp[((m_bits & 2) != 0) & ((a_idx <= h_idx)[:, :, None])]))
    p_both_ep = float(np.sum(dp[:, :, 3]))

    tot_grid = (h_idx + a_idx).astype(np.float64)
    exp_tot = float(np.sum(cell_tot * tot_grid))
    p_o25 = float(np.sum(cell_tot[tot_grid >= 3]))

    # Ancla algebraica `A1` pre-partido contra la matriz 4-Param (`P_EP >= corePWin` exacto!)
    out_ph, out_pd, out_pa = p_home, p_draw, p_away
    out_ph_ep = max(p_home, p_home_ep)
    out_pa_ep = max(p_away, p_away_ep)
    if cur_min == 0 and core_p_home is not None and core_p_away is not None:
        out_ph = min(max(float(core_p_home), 0.001), 0.999)
        out_pa = min(max(float(core_p_away), 0.001), 0.999)
        out_pd = min(max(float(core_p_draw), 0.001), 0.999) if core_p_draw is not None else max(0.0, 1.0 - out_ph - out_pa)
        out_ph_ep = min(max(out_ph + max(0.0, p_home_lift_only), out_ph), 0.999)
        out_pa_ep = min(max(out_pa + max(0.0, p_away_lift_only), out_pa), 0.999)

    ph_ep_c = min(max(max(out_ph, out_ph_ep), 0.001), 0.999)
    pa_ep_c = min(max(max(out_pa, out_pa_ep), 0.001), 0.999)
    return {
        "remaining_lambda_home": rem_lam_h,
        "remaining_lambda_away": rem_lam_a,
        "p_home": out_ph,
        "p_draw": out_pd,
        "p_away": out_pa,
        "p_home_early_payout": ph_ep_c,
        "p_away_early_payout": pa_ep_c,
        "home_ep_lift": max(0.0, ph_ep_c - out_ph),
        "p_both_trigger_ep": p_both_ep,
        "expected_final_total": exp_tot,
        "p_over_2_5": p_o25,
    }


def evaluate_points_sport_ep_scalar(sport: str, p_home_win: float, artifact: dict[str, Any]) -> dict[str, float]:
    """Espejo escalar exacto (`< 1e-14`) de `evaluatePointsSportEarlyPayout` en `inplay_and_early_payout.ts`."""
    cfg = artifact["points_sports_early_payout"][sport]
    ph = min(max(float(p_home_win), 0.002), 0.998)
    pa = 1.0 - ph
    sigma = float(cfg["sigma_margin"])
    b_eff = float(cfg["effective_barrier"])

    mu_h = sigma * acklam_normal_quantile_scalar(ph)
    mu_a = -mu_h
    lt_h = min(max((2.0 * mu_h * b_eff) / (sigma * sigma), -40.0), 40.0)
    lift_h = math.exp(lt_h) * normal_cdf_scalar((-2.0 * b_eff - mu_h) / sigma)

    lt_a = min(max((2.0 * mu_a * b_eff) / (sigma * sigma), -40.0), 40.0)
    lift_a = math.exp(lt_a) * normal_cdf_scalar((-2.0 * b_eff - mu_a) / sigma)

    ph_ep = min(max(ph + max(0.0, lift_h), ph), 0.999)
    pa_ep = min(max(pa + max(0.0, lift_a), pa), 0.999)
    return {
        "p_home_ep": ph_ep,
        "p_away_ep": pa_ep,
        "home_lift": ph_ep - ph,
        "away_lift": pa_ep - pa,
    }


def evaluate_nfl_inplay_scalar(
    seconds_remaining: float,
    home_score: float,
    away_score: float,
    pregame_exp_margin: float,
    pregame_exp_total: float,
    possession: str,
    artifact: dict[str, Any],
) -> dict[str, float]:
    """Espejo escalar exacto (`< 1e-14`) de `evaluateNflInPlayState` en `inplay_and_early_payout.ts`."""
    cfg = artifact["nfl_inplay"]
    sec_rem = min(max(float(seconds_remaining), 0.0), 3600.0)
    tau = sec_rem / 3600.0
    cur_diff = float(home_score - away_score)
    cur_tot = float(home_score + away_score)
    pv = float(cfg["possession_value_points"])
    poss_adj = pv if possession == "home" else (-pv if possession == "away" else 0.0)
    eff_poss = poss_adj * (tau ** 0.25)

    live_m = cur_diff + tau * float(pregame_exp_margin) + eff_poss
    live_t = cur_tot + tau * float(pregame_exp_total) + abs(eff_poss) * 0.35
    sig_rem = max(0.65, float(cfg["sigma_full_game"]) * math.sqrt(max(tau, 1e-4)))
    if sec_rem <= 0.0:
        p_hw = 0.999 if cur_diff > 0 else (0.001 if cur_diff < 0 else 0.5)
    else:
        p_hw = min(max(normal_cdf_scalar(live_m / sig_rem), 0.001), 0.999)
    return {
        "live_expected_margin": live_m,
        "live_expected_total": live_t,
        "p_home_win_live": p_hw,
    }


def _calibrate_empirical_red_card_multipliers(m_val: pd.DataFrame) -> dict[str, float]:
    """Calibra `own_red_card_rate_mult` y `opp_red_card_rate_mult` con Poisson MLE + offset `log(dc_lam)` en `VAL <= 2019` (`C4`)."""
    req = ["home_goals", "away_goals", "reds_home", "reds_away", "dc_lam_home", "dc_lam_away"]
    sub = m_val[m_val[req].notna().all(axis=1)].copy()
    if len(sub) < 1000:
        return {"own_mult_instant": 0.68, "opp_mult_instant": 1.34, "n_team_games_val": 0}

    # Apilar lado local y visitante controlando exactamente por `log(dc_lam)` pre-partido!
    y_g = np.concatenate([sub["home_goals"].to_numpy(dtype=np.float64), sub["away_goals"].to_numpy(dtype=np.float64)])
    off = np.log(np.clip(np.concatenate([sub["dc_lam_home"].to_numpy(dtype=np.float64), sub["dc_lam_away"].to_numpy(dtype=np.float64)]), 0.15, 6.0))
    r_own = np.clip(np.concatenate([sub["reds_home"].to_numpy(dtype=np.float64), sub["reds_away"].to_numpy(dtype=np.float64)]), 0.0, 3.0)
    r_opp = np.clip(np.concatenate([sub["reds_away"].to_numpy(dtype=np.float64), sub["reds_home"].to_numpy(dtype=np.float64)]), 0.0, 3.0)

    def _neg_ll(params: np.ndarray) -> float:
        b0, b_own, b_opp = float(params[0]), float(params[1]), float(params[2])
        eta = np.clip(off + b0 + b_own * r_own + b_opp * r_opp, -4.0, 3.0)
        mu = np.exp(eta)
        return float(np.mean(mu - y_g * eta) + 1e-5 * (b_own ** 2 + b_opp ** 2))

    res = minimize(_neg_ll, x0=np.array([0.0, -0.15, 0.15], dtype=np.float64), method="BFGS")
    b0_hat, b_own_hat, b_opp_hat = [float(x) for x in res.x]
    full_own = math.exp(b_own_hat)
    full_opp = math.exp(b_opp_hat)

    # En fútbol europeo una tarjeta roja ocurre en promedio ~58'-60' (fracción de intensidad restante `f_rem ≈ 0.38` de 90')
    # Despejar tasa instantánea: `full_mult = (1 - f_rem) + f_rem * instant_mult`
    f_rem = 0.38
    inst_own = min(max((full_own - (1.0 - f_rem)) / f_rem, 0.45), 0.90)
    inst_opp = min(max((full_opp - (1.0 - f_rem)) / f_rem, 1.08), 1.75)

    return {
        "n_team_games_val": int(len(y_g)),
        "intercept_offset_bias": round(b0_hat, 5),
        "full_match_own_red_mult": round(full_own, 5),
        "full_match_opp_red_mult": round(full_opp, 5),
        "assumed_remaining_intensity_share": f_rem,
        "own_mult_instant": round(inst_own, 4),
        "opp_mult_instant": round(inst_opp, 4),
    }


def _try_validate_nfl_inplay_and_ep17() -> dict[str, Any]:
    """Intenta validar OOS `NFL +17` e `In-Play` vía columnas `nflverse` CC-BY-4.0 (`< 2025-02-02`) con caché y fallback honesto."""
    RAW_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_p = RAW_CACHE_DIR / "nfl_inplay_diff_2014_2024.parquet"
    df_sum: pd.DataFrame | None = None

    if cache_p.exists():
        try:
            df_sum = pd.read_parquet(cache_p)
        except Exception:
            df_sum = None

    if df_sum is None:
        rows_all: list[dict[str, Any]] = []
        try:
            for yr in range(2014, 2025):
                url = f"https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_{yr}.parquet"
                req = urllib.request.Request(url, headers={"User-Agent": "PitchLab-Research/5.1"})
                with urllib.request.urlopen(req, timeout=18) as resp:
                    raw_bytes = resp.read()
                p = pd.read_parquet(
                    io.BytesIO(raw_bytes),
                    columns=[
                        "game_id",
                        "game_date",
                        "season",
                        "home_team",
                        "away_team",
                        "posteam",
                        "game_seconds_remaining",
                        "total_home_score",
                        "total_away_score",
                        "spread_line",
                        "total_line",
                    ],
                )
                p["gd"] = p["game_date"].astype(str).str.slice(0, 10)
                p = p[p["gd"] < HOLDOUT_CUT_DATE].copy()
                if len(p) == 0:
                    continue
                for gid, grp in p.groupby("game_id", sort=False):
                    hs = pd.to_numeric(grp["total_home_score"], errors="coerce").ffill().fillna(0.0).to_numpy(dtype=np.float64)
                    as_ = pd.to_numeric(grp["total_away_score"], errors="coerce").ffill().fillna(0.0).to_numpy(dtype=np.float64)
                    sec = pd.to_numeric(grp["game_seconds_remaining"], errors="coerce").fillna(0.0).to_numpy(dtype=np.float64)
                    diff = hs - as_
                    ht_ix = int(np.argmin(np.abs(sec - 1800.0)))
                    q3_ix = int(np.argmin(np.abs(sec - 900.0)))
                    ht_tm = str(grp["home_team"].iloc[0])
                    q3_pos_raw = str(grp["posteam"].iloc[q3_ix] or "")
                    q3_pos = "home" if q3_pos_raw == ht_tm else ("away" if q3_pos_raw else "neutral")
                    rows_all.append(
                        {
                            "game_id": str(gid),
                            "season": int(yr),
                            "game_date": str(grp["gd"].iloc[0]),
                            "final_home": float(hs[-1]),
                            "final_away": float(as_[-1]),
                            "max_home_lead": float(np.max(diff)),
                            "max_away_lead": float(np.max(-diff)),
                            "ht_home": float(hs[ht_ix]),
                            "ht_away": float(as_[ht_ix]),
                            "q3_home": float(hs[q3_ix]),
                            "q3_away": float(as_[q3_ix]),
                            "q3_sec": float(sec[q3_ix]),
                            "q3_poss": q3_pos,
                            "spread_line": float(pd.to_numeric(grp["spread_line"].iloc[0], errors="coerce") or 0.0),
                            "total_line": float(pd.to_numeric(grp["total_line"].iloc[0], errors="coerce") or 44.5),
                        }
                    )
            if len(rows_all) >= 1500:
                df_sum = pd.DataFrame(rows_all)
                df_sum.to_parquet(cache_p, index=False)
        except Exception as exc:
            print(f"[EXP_V54 NFL nflverse] Descarga no disponible ({type(exc).__name__}: {exc}) -> fallback honesto theoretical_reflection_unvalidated")
            df_sum = None

    if df_sum is None or len(df_sum) < 1500:
        return {
            "validation_status": "theoretical_reflection_unvalidated",
            "nfl_ep17_params": {"trigger_lead": 17, "sigma_margin": 13.31, "effective_barrier": 15.6, "validation_status": "theoretical_reflection_unvalidated"},
            "nfl_inplay_params": {"sigma_full_game": 13.31, "sigma_total_full_game": 13.4, "possession_value_points": 2.15, "validation_status": "theoretical_reflection_unvalidated"},
        }

    # Filtrar estrictamente `< HOLDOUT_CUT_DATE`
    df_sum = df_sum[df_sum["game_date"].astype(str).str.slice(0, 10) < HOLDOUT_CUT_DATE].copy()
    obs_m = (df_sum["final_home"] - df_sum["final_away"]).to_numpy(dtype=np.float64)
    sp_r = pd.to_numeric(df_sum["spread_line"], errors="coerce").fillna(0.0).to_numpy(dtype=np.float64)
    sp_sign = 1.0 if float(np.corrcoef(sp_r, obs_m)[0, 1]) >= 0.0 else -1.0
    exp_m = sp_sign * sp_r
    exp_t = pd.to_numeric(df_sum["total_line"], errors="coerce").fillna(44.5).to_numpy(dtype=np.float64)
    val_m = df_sum["season"].to_numpy(dtype=int) <= 2019
    oos_m = df_sum["season"].to_numpy(dtype=int) >= 2020

    # Calibrar `sigma_margin` y `effective_barrier` en `VAL 2014..2019` sobre `NFL +17 Early Payout`
    sig_val = float(np.std(obs_m[val_m] - exp_m[val_m]))
    sig_cal = round(min(max(sig_val, 12.2), 14.5), 3)
    p_hw_all = np.clip(np.array([normal_cdf_scalar(m / sig_cal) for m in exp_m]), 0.01, 0.99)

    y_ep_h = ((df_sum["max_home_lead"].to_numpy() >= 17.0) | (obs_m > 0)).astype(np.float64)
    y_ep_a = ((df_sum["max_away_lead"].to_numpy() >= 17.0) | (obs_m < 0)).astype(np.float64)
    y_ep_both = np.concatenate([y_ep_h, y_ep_a])
    p_reg_both = np.concatenate([p_hw_all, 1.0 - p_hw_all])
    gids_both = np.concatenate([df_sum["game_id"].to_numpy(), df_sum["game_id"].to_numpy()])
    val_both = np.concatenate([val_m, val_m])
    oos_both = np.concatenate([oos_m, oos_m])

    best_beff = 15.6
    best_ep_ll = float("inf")
    for b_try in np.linspace(12.5, 17.5, 26):
        dummy_art = {"points_sports_early_payout": {"nfl": {"sigma_margin": sig_cal, "effective_barrier": float(b_try)}}}
        preds_v = np.array(
            [evaluate_points_sport_ep_scalar("nfl", float(pw), dummy_art)["p_home_ep"] for pw in p_reg_both[val_both]],
            dtype=np.float64,
        )
        pc = np.clip(preds_v, 1e-12, 1.0 - 1e-12)
        yv = y_ep_both[val_both]
        ll = float(-np.mean(yv * np.log(pc) + (1.0 - yv) * np.log(1.0 - pc)))
        if ll < best_ep_ll:
            best_ep_ll = ll
            best_beff = round(float(b_try), 3)

    cal_ep_art = {"points_sports_early_payout": {"nfl": {"sigma_margin": sig_cal, "effective_barrier": best_beff}}}
    p_ep_oos = np.array([evaluate_points_sport_ep_scalar("nfl", float(pw), cal_ep_art)["p_home_ep"] for pw in p_reg_both[oos_both]], dtype=np.float64)
    ev_nfl_ep17_oos = _wrap_cluster_binary_es(gids_both[oos_both], y_ep_both[oos_both], p_ep_oos, p_reg_both[oos_both], seed=BOOTSTRAP_SEED + 88)

    # Calibrar `possession_value_points` en `VAL` y validar `NFL In-Play` (Q3 -> Final) en `OOS 2020..2024`
    best_pv = 2.15
    best_q3_ll = float("inf")
    y_hw_all = (obs_m > 0).astype(np.float64)
    for pv_try in (0.5, 1.25, 2.0, 2.5, 3.2):
        d_art = {"nfl_inplay": {"sigma_full_game": sig_cal, "sigma_total_full_game": 13.4, "possession_value_points": pv_try}}
        pv_v = np.array(
            [
                evaluate_nfl_inplay_scalar(float(r.q3_sec), float(r.q3_home), float(r.q3_away), float(exp_m[ix]), float(exp_t[ix]), str(r.q3_poss), d_art)["p_home_win_live"]
                for ix, r in enumerate(df_sum.itertuples(index=False))
                if val_m[ix]
            ],
            dtype=np.float64,
        )
        pc = np.clip(pv_v, 1e-12, 1.0 - 1e-12)
        yv = y_hw_all[val_m]
        ll = float(-np.mean(yv * np.log(pc) + (1.0 - yv) * np.log(1.0 - pc)))
        if ll < best_q3_ll:
            best_q3_ll = ll
            best_pv = float(pv_try)

    ip_art = {"nfl_inplay": {"sigma_full_game": sig_cal, "sigma_total_full_game": 13.4, "possession_value_points": best_pv}}
    p_q3_oos = np.array(
        [
            evaluate_nfl_inplay_scalar(float(r.q3_sec), float(r.q3_home), float(r.q3_away), float(exp_m[ix]), float(exp_t[ix]), str(r.q3_poss), ip_art)["p_home_win_live"]
            for ix, r in enumerate(df_sum.itertuples(index=False))
            if oos_m[ix]
        ],
        dtype=np.float64,
    )
    ev_nfl_q3_oos = _wrap_cluster_binary_es(df_sum["game_id"].to_numpy()[oos_m], y_hw_all[oos_m], p_q3_oos, p_hw_all[oos_m], seed=BOOTSTRAP_SEED + 89)
    print(
        f"[EXP_V54 NFL nflverse OOS VALIDATED (n={int(np.sum(oos_m)):,} games)] "
        f"+17 EP (b_eff={best_beff}, sig={sig_cal}) dLL vs reg={ev_nfl_ep17_oos['delta_ll']:+.5f} ({ev_nfl_ep17_oos['significance']}) | "
        f"In-Play Q3 (pv={best_pv}) LL={ev_nfl_q3_oos['log_loss']:.5f} (ECE={100*ev_nfl_q3_oos['ece']:.2f}%)"
    )

    return {
        "validation_status": "oos_validated_nflverse_2020_2024",
        "nfl_ep17_params": {"trigger_lead": 17, "sigma_margin": sig_cal, "effective_barrier": best_beff, "validation_status": "oos_validated_nflverse_2020_2024"},
        "nfl_inplay_params": {"sigma_full_game": sig_cal, "sigma_total_full_game": 13.4, "possession_value_points": best_pv, "validation_status": "oos_validated_nflverse_2020_2024"},
        "nfl_ep17_oos_validation": ev_nfl_ep17_oos,
        "nfl_q3_inplay_oos_validation": ev_nfl_q3_oos,
    }


def main() -> None:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

    # =========================================================================
    # 1. Extraer perfil empírico minuto a minuto de `goalscorers.csv` (`VAL <= 2019 < 2025-02-02`)
    # =========================================================================
    gs = pd.read_csv(FREE_OPEN_DIR / "goalscorers.csv")
    gs["date_str"] = gs["date"].astype(str).str.slice(0, 10)
    gs = gs[(gs["date_str"] >= "1990-01-01") & (gs["date_str"] < HOLDOUT_CUT_DATE)].copy()
    if bool((gs["date_str"] >= HOLDOUT_CUT_DATE).any()):
        raise RuntimeError("HoldoutSealedAccessError en goalscorers.csv")
    gs["minute_num"] = pd.to_numeric(gs["minute"], errors="coerce").fillna(45.0).clip(1.0, 90.0)
    gs["year"] = gs["date_str"].str.slice(0, 4).astype(int)

    gs_val = gs[gs["year"] <= 2019]
    b_idx_val = np.minimum(5, ((gs_val["minute_num"].to_numpy(dtype=np.float64) - 1.0) // 15.0).astype(int))
    b_counts = np.bincount(b_idx_val, minlength=6).astype(np.float64)
    w_buckets_6 = [round(float(c / np.sum(b_counts)), 6) for c in b_counts]
    w_buckets_6[-1] = round(1.0 - sum(w_buckets_6[:-1]), 6)
    print(f"[EXP_V54 v5.1] Perfil empírico 15m (VAL<=2019, n={len(gs_val):,} goles): {w_buckets_6}")

    # =========================================================================
    # 2. Calibrar Empíricamente Rojas (`C4`) y Física `2H` (`D4`) en `matches.parquet` (`VAL <= 2019`)
    # =========================================================================
    m_df = pd.read_parquet(PRED_LAB_ROOT / "data" / "processed" / "matches.parquet")
    m_df["md_str"] = m_df["match_date"].astype(str).str.slice(0, 10)
    m_df = m_df[m_df["md_str"] < HOLDOUT_CUT_DATE].copy()
    if bool((m_df["md_str"] >= HOLDOUT_CUT_DATE).any()):
        raise RuntimeError("HoldoutSealedAccessError en EXP_V54 matches")

    f_cols = pd.read_parquet(PRED_LAB_ROOT / "data" / "processed" / "features.parquet", columns=["match_id", "dc_lam_home", "dc_lam_away"])
    m_df = m_df.merge(f_cols, on="match_id", how="left")
    m_df["sstart"] = pd.to_numeric(m_df["season_start"], errors="coerce").fillna(2000).astype(int)
    for c in ("home_goals", "away_goals", "ht_home_goals", "ht_away_goals", "reds_home", "reds_away", "dc_lam_home", "dc_lam_away"):
        m_df[c] = pd.to_numeric(m_df[c], errors="coerce")

    red_cal = _calibrate_empirical_red_card_multipliers(m_df[(m_df["sstart"] >= 2012) & (m_df["sstart"] <= 2019)])
    print(
        f"[EXP_V54 Red Cards C4 Empirical VAL<=2019 (n={red_cal['n_team_games_val']:,})] "
        f"full_own={red_cal['full_match_own_red_mult']:.4f} -> inst_own={red_cal['own_mult_instant']:.4f} | "
        f"full_opp={red_cal['full_match_opp_red_mult']:.4f} -> inst_opp={red_cal['opp_mult_instant']:.4f}"
    )

    req_ht = ["home_goals", "away_goals", "ht_home_goals", "ht_away_goals", "dc_lam_home", "dc_lam_away"]
    ht_df = m_df[m_df[req_ht].notna().all(axis=1) & (m_df["sstart"] >= 2014)].copy().reset_index(drop=True)
    sh_2h_emp = sum(w_buckets_6[3:])
    sh_1h_emp = 1.0 - sh_2h_emp
    sh_2h_naive = 0.50

    val_ht = ht_df[ht_df["sstart"] <= 2019]
    oos_ht = ht_df[ht_df["sstart"] >= 2020]

    def _eval_ht_v51_fast(
        sub: pd.DataFrame,
        share_2h: float,
        tied_damp: float,
        lead_open: float,
        trail_push: float,
        tempo_prior_w: float,
    ) -> tuple[np.ndarray, np.ndarray]:
        mh0 = np.clip(sub["dc_lam_home"].to_numpy(dtype=np.float64), 0.15, 5.5)
        ma0 = np.clip(sub["dc_lam_away"].to_numpy(dtype=np.float64), 0.15, 5.5)
        hth = sub["ht_home_goals"].to_numpy(dtype=int)
        hta = sub["ht_away_goals"].to_numpy(dtype=int)
        abs_d = np.abs(hth - hta)

        if tempo_prior_w > 0.0:
            exp_1h = (mh0 + ma0) * (1.0 - share_2h)
            t_mult = np.clip((tempo_prior_w + (hth + hta)) / np.maximum(tempo_prior_w + exp_1h, 1e-6), 0.78, 1.28)
        else:
            t_mult = np.ones(len(sub), dtype=np.float64)

        lh = mh0 * share_2h * t_mult
        la = ma0 * share_2h * t_mult
        dm = max(0.65, 1.0 + tied_damp)
        open_sc = 1.0 + lead_open * np.minimum(abs_d, 2)
        lh = np.where(abs_d == 0, lh * dm, np.where(hth < hta, lh * open_sc * (1.0 + trail_push), lh * open_sc))
        la = np.where(abs_d == 0, la * dm, np.where(hta < hth, la * open_sc * (1.0 + trail_push), la * open_sc))

        ks = np.arange(9, dtype=np.float64)
        facts = np.array([math.factorial(int(k)) for k in ks], dtype=np.float64)[None, :]
        ph = np.exp(-lh[:, None]) * (lh[:, None] ** ks[None, :]) / facts
        pa = np.exp(-la[:, None]) * (la[:, None] ** ks[None, :]) / facts
        ph /= np.sum(ph, axis=1, keepdims=True)
        pa /= np.sum(pa, axis=1, keepdims=True)
        mat = ph[:, :, None] * pa[:, None, :]
        fh = hth[:, None, None] + ks[None, :, None]
        fa = hta[:, None, None] + ks[None, None, :]
        p_h = np.sum(mat * (fh > fa), axis=(1, 2))
        p_d = np.sum(mat * (fh == fa), axis=(1, 2))
        p_a = np.sum(mat * (fh < fa), axis=(1, 2))
        p_o25 = np.sum(mat * ((fh + fa) >= 3), axis=(1, 2))
        return np.clip(np.column_stack([p_h, p_d, p_a]), 1e-6, 1.0 - 1e-6), np.clip(p_o25, 1e-6, 1.0 - 1e-6)

    y_ht_val = np.where(val_ht["home_goals"] > val_ht["away_goals"], 0, np.where(val_ht["home_goals"] == val_ht["away_goals"], 1, 2)).astype(np.int64)
    y_o25_val = ((val_ht["home_goals"] + val_ht["away_goals"]) >= 3).astype(np.float64)

    best_2h = (-0.02, 0.03, 0.05, 18.0)
    best_2h_sc = float("inf")
    for td in (-0.06, -0.03, 0.0):
        for lo in (0.0, 0.03, 0.06):
            for tp in (0.0, 0.04, 0.08):
                for tw in (0.0, 12.0, 24.0):
                    p3, po = _eval_ht_v51_fast(val_ht, sh_2h_emp, td, lo, tp, tw)
                    ll3 = float(-np.mean(np.log(p3[np.arange(len(y_ht_val)), y_ht_val])))
                    llo = float(-np.mean(y_o25_val * np.log(po) + (1.0 - y_o25_val) * np.log(1.0 - po)))
                    sc = ll3 + 0.5 * llo
                    if sc < best_2h_sc:
                        best_2h_sc = sc
                        best_2h = (td, lo, tp, tw)

    sel_td, sel_lo, sel_tp, sel_tw = best_2h
    print(f"[EXP_V54 2H Physics D4 VAL<=2019] tied_damp={sel_td:+.3f}, lead_open={sel_lo:+.3f}, trail_push={sel_tp:+.3f}, tempo_prior_w={sel_tw:.1f}")

    y_ht_oos = np.where(oos_ht["home_goals"] > oos_ht["away_goals"], 0, np.where(oos_ht["home_goals"] == oos_ht["away_goals"], 1, 2)).astype(np.int64)
    y_o25_oos = ((oos_ht["home_goals"] + oos_ht["away_goals"]) >= 3).astype(np.float64)
    P_inplay_v51_oos, po25_v51_oos = _eval_ht_v51_fast(oos_ht, sh_2h_emp, sel_td, sel_lo, sel_tp, sel_tw)
    P_inplay_naive_oos, po25_naive_oos = _eval_ht_v51_fast(oos_ht, sh_2h_naive, 0.0, 0.0, 0.0, 0.0)

    cb_ht_1x2 = cluster_bootstrap_multiclass(
        oos_ht["md_str"].to_numpy(),
        y_ht_oos,
        P_inplay_v51_oos,
        P_inplay_naive_oos,
        n_resamples=BOOTSTRAP_SAMPLES,
        seed=BOOTSTRAP_SEED,
    )
    ev_inplay_ht_oos = {
        **cb_ht_1x2,
        "log_loss": cb_ht_1x2["logloss_cand"],
        "benchmark_log_loss": cb_ht_1x2["logloss_bench"],
        "delta_ll_vs_benchmark": cb_ht_1x2["delta_logloss"],
        "ece": cb_ht_1x2["ece_cand"],
        "significance": "significativa" if cb_ht_1x2["significant_improvement"] else "no significativa",
    }
    ev_inplay_ht_o25 = _wrap_cluster_binary_es(oos_ht["md_str"].to_numpy(), y_o25_oos, po25_v51_oos, po25_naive_oos, seed=BOOTSTRAP_SEED + 2)

    # =========================================================================
    # 3. Validación OOS `Early Payout +2` en Selecciones (`goalscorers.csv`) y Clubes (`53k` boletos, clustered por `match_id`!)
    # =========================================================================
    soccer_cfg_final = {
        "minute_bucket_weights_6": w_buckets_6,
        "own_red_card_rate_mult": red_cal["own_mult_instant"],
        "opp_red_card_rate_mult": red_cal["opp_mult_instant"],
        "second_half_trailing_push": sel_tp,
        "second_half_tied_damping": sel_td,
        "second_half_lead_openness": sel_lo,
        "tempo_gamma_prior_weight": sel_tw,
        "max_goals_dp": SOCCER_DP_MAX_GOALS,
    }

    res_intl = pd.read_csv(PRED_LAB_ROOT / "experiments" / "EXP_V33_intl_soccer" / "raw_cache" / "results.csv")
    res_intl["date_str"] = res_intl["date"].astype(str).str.slice(0, 10)
    res_intl = res_intl[(res_intl["date_str"] >= "2010-01-01") & (res_intl["date_str"] < HOLDOUT_CUT_DATE)].copy()
    res_intl["year"] = res_intl["date_str"].str.slice(0, 4).astype(int)
    res_intl = res_intl.sort_values(["date_str", "home_team", "away_team"], kind="mergesort").reset_index(drop=True)

    gs_keys_val = set(zip(gs_val["date_str"], gs_val["home_team"], gs_val["away_team"]))
    res_val_pos = res_intl[(res_intl["year"] <= 2019) & ((res_intl["home_score"] + res_intl["away_score"]) > 0)].copy()
    res_val_pos["in_gs"] = [(str(r.date_str), str(r.home_team), str(r.away_team)) in gs_keys_val for r in res_val_pos.itertuples(index=False)]
    tourn_cov = res_val_pos.groupby("tournament")["in_gs"].agg(["count", "mean"])
    covered_tournaments = set(tourn_cov[(tourn_cov["count"] >= 40) & (tourn_cov["mean"] >= 0.92)].index.tolist())

    val_cov = res_intl[(res_intl["year"] <= 2019) & res_intl["tournament"].isin(covered_tournaments)]
    val_h_non_neut = val_cov[~val_cov["neutral"]]
    emp_hfa_ratio = float(val_h_non_neut["home_score"].mean()) / max(float(val_h_non_neut["away_score"].mean()), 0.5) if len(val_h_non_neut) > 50 else 1.20
    hfa_sqrt = min(max(math.sqrt(emp_hfa_ratio), 1.02), 1.22)

    g0_anchor = 1.30
    tm_gf: dict[str, float] = {}
    tm_ga: dict[str, float] = {}
    mu_h_intl = np.empty(len(res_intl), dtype=np.float64)
    mu_a_intl = np.empty(len(res_intl), dtype=np.float64)
    for idx_r, r in enumerate(res_intl.itertuples(index=False)):
        ht, at = str(r.home_team), str(r.away_team)
        hm_f = 1.0 if bool(r.neutral) else hfa_sqrt
        att_h = max(tm_gf.get(ht, g0_anchor) / g0_anchor, 0.22)
        def_h = max(tm_ga.get(ht, g0_anchor) / g0_anchor, 0.22)
        att_a = max(tm_gf.get(at, g0_anchor) / g0_anchor, 0.22)
        def_a = max(tm_ga.get(at, g0_anchor) / g0_anchor, 0.22)
        mu_h_intl[idx_r] = min(max(g0_anchor * ((att_h * def_a) ** 0.68) * hm_f, 0.15), 5.2)
        mu_a_intl[idx_r] = min(max(g0_anchor * ((att_a * def_h) ** 0.68) / hm_f, 0.15), 5.2)
        if pd.notna(r.home_score) and pd.notna(r.away_score):
            hs_i, as_i = float(r.home_score), float(r.away_score)
            tm_gf[ht] = 0.14 * (hs_i / max(def_a ** 0.5 * hm_f, 0.4)) + 0.86 * tm_gf.get(ht, g0_anchor)
            tm_ga[ht] = 0.14 * (as_i * max(hm_f / max(att_a ** 0.5, 0.4), 0.4)) + 0.86 * tm_ga.get(ht, g0_anchor)
            tm_gf[at] = 0.14 * (as_i * max(hm_f / max(def_h ** 0.5, 0.4), 0.4)) + 0.86 * tm_gf.get(at, g0_anchor)
            tm_ga[at] = 0.14 * (hs_i / max(att_h ** 0.5 * hm_f, 0.4)) + 0.86 * tm_ga.get(at, g0_anchor)

    res_intl["mu_h"] = mu_h_intl
    res_intl["mu_a"] = mu_a_intl

    gs_oos = gs[gs["year"] >= 2020].sort_values(["date_str", "home_team", "away_team", "minute_num"], kind="mergesort")
    gs_by_match: dict[tuple[str, str, str], list[tuple[float, str]]] = {}
    for r in gs_oos.itertuples(index=False):
        gs_by_match.setdefault((str(r.date_str), str(r.home_team), str(r.away_team)), []).append((float(r.minute_num), str(r.team)))

    res_oos = res_intl[(res_intl["year"] >= 2020) & res_intl["tournament"].isin(covered_tournaments)]
    y_ep2_h_l, y_reg_h_l, y_ep2_a_l, y_reg_a_l = [], [], [], []
    p_reg_h_l, p_ep_h_l, p_reg_a_l, p_ep_a_l = [], [], [], []
    mkeys_ep: list[str] = []

    t_dp_start = time.perf_counter()
    for r in res_oos.itertuples(index=False):
        hs_f, as_f = int(r.home_score), int(r.away_score)
        key = (str(r.date_str), str(r.home_team), str(r.away_team))
        ev_list = gs_by_match.get(key, [])
        if len(ev_list) != (hs_f + as_f):
            continue
        ch, ca, hit_h2, hit_a2 = 0, 0, False, False
        for _, stm in ev_list:
            if stm == str(r.home_team):
                ch += 1
            else:
                ca += 1
            if ch - ca >= 2:
                hit_h2 = True
            if ca - ch >= 2:
                hit_a2 = True

        dp_out = evaluate_soccer_early_payout_and_inplay_scalar(
            pregame_mu_home=float(r.mu_h),
            pregame_mu_away=float(r.mu_a),
            current_minute=0,
            current_home_goals=0,
            current_away_goals=0,
            red_cards_home=0,
            red_cards_away=0,
            home_already_hit_2=False,
            away_already_hit_2=False,
            soccer_cfg=soccer_cfg_final,
        )
        mkeys_ep.append(f"{r.date_str}::{r.home_team}::{r.away_team}")
        y_reg_h_l.append(1.0 if hs_f > as_f else 0.0)
        y_ep2_h_l.append(1.0 if (hit_h2 or hs_f > as_f) else 0.0)
        y_reg_a_l.append(1.0 if as_f > hs_f else 0.0)
        y_ep2_a_l.append(1.0 if (hit_a2 or as_f > hs_f) else 0.0)
        p_reg_h_l.append(dp_out["p_home"])
        p_ep_h_l.append(dp_out["p_home_early_payout"])
        p_reg_a_l.append(dp_out["p_away"])
        p_ep_a_l.append(dp_out["p_away_early_payout"])

    dp_ms_per_match = ((time.perf_counter() - t_dp_start) * 1000.0) / max(len(mkeys_ep), 1)
    print(f"[EXP_V54 Vectorized DP Speed] {dp_ms_per_match:.3f} ms/partido sobre {len(mkeys_ep):,} partidos reales!")

    # Calibrar base regular en VAL <= 2019 y aplicar lift estricto de primer paso (agrupado por `match_key` en bootstrap!)
    val_c_sub = res_intl[(res_intl["year"] >= 2012) & (res_intl["year"] <= 2019) & res_intl["tournament"].isin(covered_tournaments)]
    ks_11 = np.arange(11, dtype=np.float64)
    fac_11 = np.array([math.factorial(int(k)) for k in ks_11], dtype=np.float64)[None, :]
    vh_m = val_c_sub["mu_h"].to_numpy(dtype=np.float64)[:, None]
    va_m = val_c_sub["mu_a"].to_numpy(dtype=np.float64)[:, None]
    pmh_v = np.exp(-vh_m) * (vh_m ** ks_11) / fac_11
    pma_v = np.exp(-va_m) * (va_m ** ks_11) / fac_11
    pmh_v /= np.sum(pmh_v, axis=1, keepdims=True)
    pma_v /= np.sum(pma_v, axis=1, keepdims=True)
    mat_v = pmh_v[:, :, None] * pma_v[:, None, :]
    pr_hv = np.clip(np.sum(mat_v[:, ks_11[:, None] > ks_11[None, :]], axis=1), 1e-5, 1.0 - 1e-5)
    pr_av = np.clip(np.sum(mat_v[:, ks_11[:, None] < ks_11[None, :]], axis=1), 1e-5, 1.0 - 1e-5)
    X_cal_reg = np.log(np.concatenate([pr_hv, pr_av]) / (1.0 - np.concatenate([pr_hv, pr_av]))).reshape(-1, 1)
    y_cal_reg = np.concatenate(
        [
            (val_c_sub["home_score"].to_numpy() > val_c_sub["away_score"].to_numpy()).astype(int),
            (val_c_sub["away_score"].to_numpy() > val_c_sub["home_score"].to_numpy()).astype(int),
        ]
    )
    lr_reg = LogisticRegression(C=5.0).fit(X_cal_reg, y_cal_reg)

    raw_reg_oos = np.clip(np.concatenate([p_reg_h_l, p_reg_a_l]), 1e-5, 1.0 - 1e-5)
    lg_reg_oos = np.log(raw_reg_oos / (1.0 - raw_reg_oos))
    p_reg_cal_oos = np.clip(1.0 / (1.0 + np.exp(-(float(lr_reg.intercept_[0]) + float(lr_reg.coef_[0, 0]) * lg_reg_oos))), 0.001, 0.998)
    dp_lift_oos = np.maximum(0.0, np.concatenate([np.array(p_ep_h_l) - np.array(p_reg_h_l), np.array(p_ep_a_l) - np.array(p_reg_a_l)]))
    p_ep2_cal_oos = np.clip(p_reg_cal_oos + dp_lift_oos, p_reg_cal_oos, 0.999)

    y_ep_intl = np.concatenate([y_ep2_h_l, y_ep2_a_l])
    y_reg_intl = np.concatenate([y_reg_h_l, y_reg_a_l])
    cl_ep_intl = np.array(mkeys_ep + mkeys_ep)
    ev_ep2_oos = _wrap_cluster_binary_es(cl_ep_intl, y_ep_intl, p_ep2_cal_oos, p_reg_cal_oos, seed=BOOTSTRAP_SEED + 5)
    emp_ep_lift = float(np.mean(y_ep_intl) - np.mean(y_reg_intl))
    pred_ep_lift = float(np.mean(p_ep2_cal_oos - p_reg_cal_oos))

    # Clubes `OOS 2020..2024` (`n = 53,300` boletos agrupados en clusters por `match_id`!)
    ht_up2 = oos_ht[(oos_ht["ht_home_goals"] - oos_ht["ht_away_goals"]) >= 2]
    blown_ht2_rate = float(np.mean(ht_up2["home_goals"] <= ht_up2["away_goals"])) if len(ht_up2) > 0 else 0.0

    lh_c = np.clip(oos_ht["dc_lam_home"].to_numpy(dtype=np.float64), 0.15, 5.5)
    la_c = np.clip(oos_ht["dc_lam_away"].to_numpy(dtype=np.float64), 0.15, 5.5)
    ks_c = np.arange(9, dtype=np.float64)
    fac_c = np.array([math.factorial(int(k)) for k in ks_c], dtype=np.float64)[None, :]

    def _dc_grid_batch(mh_v: np.ndarray, ma_v: np.ndarray, rho_v: float) -> np.ndarray:
        ph = np.exp(-mh_v[:, None]) * (mh_v[:, None] ** ks_c) / fac_c
        pa = np.exp(-ma_v[:, None]) * (ma_v[:, None] ** ks_c) / fac_c
        ph /= np.sum(ph, axis=1, keepdims=True)
        pa /= np.sum(pa, axis=1, keepdims=True)
        mat = ph[:, :, None] * pa[:, None, :]
        mat[:, 0, 0] *= np.maximum(1.0 - mh_v * ma_v * rho_v, 1e-6)
        mat[:, 0, 1] *= np.maximum(1.0 + mh_v * rho_v, 1e-6)
        mat[:, 1, 0] *= np.maximum(1.0 + ma_v * rho_v, 1e-6)
        mat[:, 1, 1] *= np.maximum(1.0 - rho_v, 1e-6)
        mat /= np.sum(mat, axis=(1, 2), keepdims=True)
        return mat

    mat_ft_c = _dc_grid_batch(lh_c, la_c, -0.105)
    p_ft_h_c = np.sum(mat_ft_c[:, ks_c[:, None] > ks_c[None, :]], axis=1)
    p_ft_a_c = np.sum(mat_ft_c[:, ks_c[:, None] < ks_c[None, :]], axis=1)
    mat_1h_c = _dc_grid_batch(lh_c * sh_1h_emp, la_c * sh_1h_emp, -0.07)
    mat_2h_c = _dc_grid_batch(lh_c * sh_2h_emp, la_c * sh_2h_emp, -0.04)

    extra_ht_ep_h = np.zeros(len(oos_ht), dtype=np.float64)
    extra_ht_ep_a = np.zeros(len(oos_ht), dtype=np.float64)
    diff_2h_grid = ks_c[:, None] - ks_c[None, :]
    for h1 in range(9):
        for a1 in range(9):
            d1 = h1 - a1
            if d1 >= 2:
                extra_ht_ep_h += mat_1h_c[:, h1, a1] * np.sum(mat_2h_c[:, diff_2h_grid <= -d1], axis=1)
            elif d1 <= -2:
                extra_ht_ep_a += mat_1h_c[:, h1, a1] * np.sum(mat_2h_c[:, diff_2h_grid >= -d1], axis=1)

    hg_co = oos_ht["home_goals"].to_numpy()
    ag_co = oos_ht["away_goals"].to_numpy()
    hth_co = oos_ht["ht_home_goals"].to_numpy()
    hta_co = oos_ht["ht_away_goals"].to_numpy()
    mids_co = oos_ht["match_id"].astype(str).to_numpy()

    y_club_ep_53k = np.concatenate([(((hth_co - hta_co) >= 2) | (hg_co > ag_co)).astype(np.float64), (((hta_co - hth_co) >= 2) | (ag_co > hg_co)).astype(np.float64)])
    p_club_reg_53k = np.clip(np.concatenate([p_ft_h_c, p_ft_a_c]), 0.001, 0.998)
    p_club_ep_53k = np.clip(np.concatenate([p_ft_h_c + extra_ht_ep_h, p_ft_a_c + extra_ht_ep_a]), p_club_reg_53k, 0.999)
    ev_club_ep_53k = _wrap_cluster_binary_es(np.concatenate([mids_co, mids_co]), y_club_ep_53k, p_club_ep_53k, p_club_reg_53k, seed=BOOTSTRAP_SEED + 15)

    print(
        f"\n=== EXP_V54 IN-PLAY SPACETIME v5.1 & EARLY PAYOUT (OOS 2020..2024, n={len(oos_ht):,}) ===\n"
        f"  HT->FT 1X2: Naive={ev_inplay_ht_oos['benchmark_log_loss']:.5f} -> Spacetime v5.1={ev_inplay_ht_oos['log_loss']:.5f} "
        f"(dLL={ev_inplay_ht_oos['delta_ll_vs_benchmark']:+.5f}, {ev_inplay_ht_oos['significance']})\n"
        f"  HT->FT O2.5: Naive={ev_inplay_ht_o25['benchmark_log_loss']:.5f} -> Spacetime v5.1={ev_inplay_ht_o25['log_loss']:.5f} "
        f"(dLL={ev_inplay_ht_o25['delta_ll']:+.5f}, {ev_inplay_ht_o25['significance']})\n"
        f"  Club EP 53k (clustered by match_id={ev_club_ep_53k['n_clusters']:,}): dLL={ev_club_ep_53k['delta_ll']:+.5f} ({ev_club_ep_53k['significance']})"
    )

    # =========================================================================
    # 4. Deportes de Puntos (`NFL +17` con validación `nflverse` / fallback honesto; `NBA/MLB` etiquetados)
    # =========================================================================
    nfl_val_res = _try_validate_nfl_inplay_and_ep17()

    inplay_art = {
        "schema_version": "inplay_early_payout_v5.0.0",
        "codename": "PitchLab Early-Payout Passage-Time DP & In-Play Spacetime v5.1 Remediated",
        "version": "5.1.0-candidate",
        "status": "candidate",
        "production_activated": False,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "soccer": soccer_cfg_final,
        "points_sports_early_payout": {
            "nfl": nfl_val_res["nfl_ep17_params"],
            "nba": {"trigger_lead": 20, "sigma_margin": 12.2, "effective_barrier": 18.8, "validation_status": "theoretical_reflection_unvalidated"},
            "mlb": {"trigger_lead": 5, "sigma_margin": 4.25, "effective_barrier": 4.55, "validation_status": "theoretical_reflection_unvalidated"},
        },
        "nfl_inplay": nfl_val_res["nfl_inplay_params"],
    }
    INPLAY_MODEL_OUT.write_text(json.dumps(inplay_art, indent=2), encoding="utf-8")

    # Snapshot de paridad `< 1e-13` (`24` escenarios Fútbol incl. ancla 4-Param pre-partido + `12` Points EP + `4` NFL In-Play)
    rng = np.random.default_rng(MODEL_SEED)
    soccer_cases: list[dict[str, Any]] = []
    for idx_s in range(24):
        mh = round(float(rng.uniform(0.75, 2.65)), 4)
        ma = round(float(rng.uniform(0.65, 2.35)), 4)
        c_min = 0 if idx_s < 10 else int(rng.choice([18, 45, 62, 78]))
        chg = 0 if c_min == 0 else int(rng.choice([0, 1, 2]))
        cag = 0 if c_min == 0 else int(rng.choice([0, 1, 2]))
        rch = 1 if idx_s % 6 == 0 and c_min > 0 else 0
        rca = 1 if idx_s % 7 == 0 and c_min > 0 else 0

        # Probar ancla 4-Param en casos pre-partido impares para validar paridad exacta de `A1`
        c_ph = round(float(rng.uniform(0.28, 0.62)), 4) if (c_min == 0 and idx_s % 2 == 1) else None
        c_pd = round(float(rng.uniform(0.20, 0.30)), 4) if c_ph is not None else None
        c_pa = round(1.0 - c_ph - c_pd, 4) if (c_ph is not None and c_pd is not None) else None

        out_s = evaluate_soccer_early_payout_and_inplay_scalar(
            pregame_mu_home=mh,
            pregame_mu_away=ma,
            current_minute=c_min,
            current_home_goals=chg,
            current_away_goals=cag,
            red_cards_home=rch,
            red_cards_away=rca,
            home_already_hit_2=False,
            away_already_hit_2=False,
            soccer_cfg=soccer_cfg_final,
            core_p_home=c_ph,
            core_p_draw=c_pd,
            core_p_away=c_pa,
        )
        inp_sc: dict[str, Any] = {
            "pregameMuHome": mh,
            "pregameMuAway": ma,
            "currentMinute": c_min,
            "currentHomeGoals": chg,
            "currentAwayGoals": cag,
            "redCardsHome": rch,
            "redCardsAway": rca,
        }
        if c_ph is not None:
            inp_sc["corePHome"] = c_ph
            inp_sc["corePDraw"] = c_pd
            inp_sc["corePAway"] = c_pa
        soccer_cases.append({"input": inp_sc, "expected": out_s})

    points_ep_cases = [
        {"sport": sp_nm, "p_home_win": pw, "expected": evaluate_points_sport_ep_scalar(sp_nm, pw, inplay_art)}
        for sp_nm in ("nfl", "nba", "mlb")
        for pw in (0.34, 0.50, 0.66, 0.78)
    ]
    nfl_live_cases = [
        {
            "seconds_remaining": sec_r,
            "home_score": hs_l,
            "away_score": as_l,
            "pregame_exp_margin": 2.5,
            "pregame_exp_total": 46.5,
            "possession": poss_l,
            "expected": evaluate_nfl_inplay_scalar(sec_r, hs_l, as_l, 2.5, 46.5, poss_l, inplay_art),
        }
        for sec_r, hs_l, as_l, poss_l in [
            (3600.0, 0, 0, "neutral"),
            (1800.0, 17, 7, "away"),
            (900.0, 20, 24, "home"),
            (180.0, 27, 24, "away"),
        ]
    ]

    INPLAY_SNAPSHOT_OUT.write_text(
        json.dumps(
            {
                "schema_version": "inplay_early_payout_v5.1_parity_snapshot",
                "holdout_sealed_untouched": True,
                "soccer_cases": soccer_cases,
                "points_ep_cases": points_ep_cases,
                "nfl_live_cases": nfl_live_cases,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    results_payload = {
        "experiment_id": "EXP_V54_inplay_early_payout_v5_1_remediated",
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "vectorized_dp_ms_per_match": round(dp_ms_per_match, 4),
        "minute_bucket_weights_6_val": w_buckets_6,
        "empirical_red_card_calibration_val": red_cal,
        "second_half_physics_calibration_val": {
            "second_half_tied_damping": sel_td,
            "second_half_lead_openness": sel_lo,
            "second_half_trailing_push": sel_tp,
            "tempo_gamma_prior_weight": sel_tw,
        },
        "early_payout_2_goals_minute_trajectory_oos": {
            "n_tickets": int(len(y_ep_intl)),
            "n_matches_clusters": int(ev_ep2_oos["n_clusters"]),
            "observed_extra_win_lift": round(emp_ep_lift, 5),
            "predicted_dp_extra_win_lift": round(pred_ep_lift, 5),
            "vs_naive_regular_win_prob": ev_ep2_oos,
        },
        "club_early_payout_53k_tickets_oos": ev_club_ep_53k,
        "inplay_halftime_to_fulltime_oos": ev_inplay_ht_oos,
        "inplay_halftime_to_fulltime_over25_oos": ev_inplay_ht_o25,
        "club_ht_plus2_blown_lead_rate_oos": round(blown_ht2_rate, 5),
        "points_sports_validation": {
            "nfl_status": nfl_val_res["validation_status"],
            "nfl_ep17_oos": nfl_val_res.get("nfl_ep17_oos_validation"),
            "nfl_q3_inplay_oos": nfl_val_res.get("nfl_q3_inplay_oos_validation"),
            "nba_status": "theoretical_reflection_unvalidated",
            "mlb_status": "theoretical_reflection_unvalidated",
        },
        "artifacts": {
            "model_inplay_early_payout_v5_0_sha256": hashlib.sha256(INPLAY_MODEL_OUT.read_bytes()).hexdigest(),
        },
    }
    RESULTS_OUT.write_text(json.dumps(results_payload, indent=2), encoding="utf-8")

    with TRIAL_REGISTRY_OUT.open("a", encoding="utf-8") as fh:
        fh.write(
            json.dumps(
                {
                    "recorded_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "experiment_id": "EXP_V54_inplay_early_payout_v5_1_remediated",
                    "holdout_touched": False,
                    "dp_ms_per_match": round(dp_ms_per_match, 3),
                    "own_red_mult": red_cal["own_mult_instant"],
                    "opp_red_mult": red_cal["opp_mult_instant"],
                    "ep2_dll_vs_regular": round(ev_ep2_oos["delta_ll"], 6),
                    "inplay_ht_dll_vs_homog": round(ev_inplay_ht_oos["delta_ll_vs_benchmark"], 6),
                    "nfl_validation_status": nfl_val_res["validation_status"],
                }
            )
            + "\n"
        )
    print(f"[DONE] EXP_V54 v5.1 guardado en {RESULTS_OUT.name}")


if __name__ == "__main__":
    main()
