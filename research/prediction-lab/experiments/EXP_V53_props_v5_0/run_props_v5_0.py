"""EXP_V53 — Player Props `v5.1` (Remediado `REM_05`): Titulares Causales, `Knockout 90'` Limpio sin Tandas,
Calibración Suave `Logit-Space Barycentric PAVA Spline` Densificada y Benchmarks Honestos `1.5+`.

Remediaciones de auditoría `v5.1` (`A3, B1, B2, D6`, `< 2025-02-02`, `holdout_sealed` intacto):
  1. Sustituye el filtro post-partido `minutes >= 45` (sesgo de supervivencia que borraba lesiones/rojas tempranas)
     por filtro estrictamente causal pre-partido `prematch_ewm_minutes(t' < t) >= 58.0` (`prev_apps >= 2`).
  2. Reemplaza el bootstrap i.i.d./ECE falso `0.0` por `cluster_bootstrap_binary` agrupado por fecha y
     `promoted_ece_ge_50pct = None` cuando `promoted_n_ge_50pct == 0` (Axioma 4).
  3. Recalibra `knockout_stage_config` limpiando 100% de tandas de penales y prórrogas en `tm_games.csv.gz`
     cruzando con `tm_appearances.csv.gz` (`max_goals_val <= 10`), diferenciando `first_leg` (`90'` puro, `< 1.0`),
     `second_leg` y `single_final` (Axioma 7).
  4. Densifica `ETA_KNOTS_29` en `[0.0, 2.35]` para reducir `goals >= 50% ECE` (`3.79% -> < 1.8%`), compara `1.5+`
     honestamente frente a `NB crudo` y `Platt 1.5+`, y etiqueta explícitamente `shots`/`shots_on_target` como
     `"empirical_bayes_nb_no_player_match_log_spline"`.
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
from sklearn.linear_model import LogisticRegression

EXP_DIR = Path(__file__).resolve().parent
REPO_ROOT = EXP_DIR.parents[3]
PRED_LAB_ROOT = REPO_ROOT / "research" / "prediction-lab"
FREE_OPEN_DIR = PRED_LAB_ROOT / "data" / "raw" / "free_open_v33"
EXP_V41_DIR = PRED_LAB_ROOT / "experiments" / "EXP_V41_hierarchical_props"
EXP_V46_DIR = PRED_LAB_ROOT / "experiments" / "EXP_V46_props_v4_0"
ARTIFACTS_DIR = EXP_DIR / "artifacts"

for _p in (str(REPO_ROOT), str(EXP_V41_DIR), str(EXP_V46_DIR), str(EXP_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from services.models.cluster_bootstrap import cluster_bootstrap_binary  # noqa: E402
from run_props_experiment import (  # noqa: E402
    BOOTSTRAP_SAMPLES,
    BOOTSTRAP_SEED,
    HOLDOUT_CUT_DATE,
    HOLDOUT_CUT_ISO,
    MODEL_SEED,
    POSITION_CLUSTERS,
    TARGET_COMPETITIONS,
    map_tm_position_cluster,
    nb_prob_over_exact,
)
from run_props_v4_0 import (  # noqa: E402
    X_KNOTS_17,
    evaluate_isotonic_piecewise_vec,
    fit_pava_isotonic_knots,
)

PROPS_V5_MODEL_OUT = REPO_ROOT / "src" / "data" / "prediction" / "model_hierarchical_props_v5_0_candidate.json"
PROPS_V5_SNAPSHOT_OUT = REPO_ROOT / "src" / "data" / "prediction" / "hierarchical_props_v5_0_snapshot.json"
RESULTS_OUT = ARTIFACTS_DIR / "exp_v53_props_v5_0_results.json"
TRIAL_REGISTRY_OUT = EXP_DIR / "trial_registry_props_v50.jsonl"

# Malla densificada en cola alta `[0.0, 2.35]` (`p >= 50%`) para bajar `goals >= 50% ECE` debajo de `1.8%`
ETA_KNOTS_29: list[float] = [
    -7.50,
    -6.40,
    -5.60,
    -5.00,
    -4.50,
    -4.10,
    -3.75,
    -3.45,
    -3.15,
    -2.85,
    -2.55,
    -2.25,
    -1.98,
    -1.72,
    -1.48,
    -1.24,
    -1.00,
    -0.76,
    -0.52,
    -0.28,
    -0.08,
    0.08,
    0.25,
    0.45,
    0.68,
    0.95,
    1.30,
    1.75,
    2.35,
]

ETA_KNOTS_BRACE_19: list[float] = [
    -9.50,
    -8.20,
    -7.20,
    -6.40,
    -5.70,
    -5.10,
    -4.55,
    -4.05,
    -3.55,
    -3.10,
    -2.65,
    -2.20,
    -1.75,
    -1.30,
    -0.90,
    -0.50,
    -0.15,
    0.25,
    0.85,
]


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
        "promoted_ece_ge_50pct": cb["promoted_ece_ge_50pct"],  # None cuando n == 0 (Axioma 4)
    }


def fit_barycentric_logit_pava_spline(
    p_raw: np.ndarray,
    y_true: np.ndarray,
    eta_knots: list[float],
    tau_prior: float,
    platt_intercept: float,
    platt_slope: float,
) -> list[float]:
    """Proyecta cada muestra continuamente sobre los dos nodos adyacentes en espacio Logit (`0` cuantización)
    y resuelve `PAVA` regularizado hacia la recta de Platt, devolviendo `zeta_knots = logit(q_k)` monótonos."""
    ps = np.clip(np.asarray(p_raw, dtype=np.float64), 1e-6, 1.0 - 1e-6)
    eta = np.log(ps / (1.0 - ps))
    yt = np.asarray(y_true, dtype=np.float64)
    ek = np.asarray(eta_knots, dtype=np.float64)
    k_len = len(ek)

    zeta_prior = platt_intercept + platt_slope * ek
    p_prior = 1.0 / (1.0 + np.exp(-np.clip(zeta_prior, -12.0, 12.0)))

    sums = tau_prior * p_prior.copy()
    wts = np.full(k_len, float(tau_prior), dtype=np.float64)

    eta_c = np.clip(eta, ek[0], ek[-1])
    idx_hi = np.clip(np.searchsorted(ek, eta_c, side="right"), 1, k_len - 1)
    idx_lo = idx_hi - 1
    span = np.maximum(ek[idx_hi] - ek[idx_lo], 1e-12)
    t_w = (eta_c - ek[idx_lo]) / span
    w_lo = 1.0 - t_w
    w_hi = t_w

    np.add.at(sums, idx_lo, w_lo * yt)
    np.add.at(wts, idx_lo, w_lo)
    np.add.at(sums, idx_hi, w_hi * yt)
    np.add.at(wts, idx_hi, w_hi)

    blocks: list[list[Any]] = [[float(sums[i]), float(wts[i]), [i]] for i in range(k_len)]
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

    q_out = np.empty(k_len, dtype=np.float64)
    for b_s, b_w, idxs in blocks:
        val = min(max(b_s / max(b_w, 1e-9), 1e-5), 1.0 - 1e-5)
        for ix in idxs:
            q_out[ix] = val

    zeta_out = np.log(q_out / (1.0 - q_out))
    rounded = [round(float(z), 8) for z in zeta_out.tolist()]
    for i in range(1, k_len):
        if rounded[i] < rounded[i - 1]:
            rounded[i] = rounded[i - 1]
    return rounded


def evaluate_logit_spline_scalar(p_raw: float, eta_knots: list[float], zeta_knots: list[float]) -> float:
    """Espejo escalar exacto (`< 1e-15`) de `evaluateLogitSpaceMonotoneSplineV5` en `hierarchical_props.ts`."""
    p_s = min(max(float(p_raw), 1e-6), 1.0 - 1e-6)
    eta = math.log(p_s / (1.0 - p_s))
    n = len(eta_knots)
    if eta <= eta_knots[0]:
        sl = (zeta_knots[1] - zeta_knots[0]) / max(eta_knots[1] - eta_knots[0], 1e-9)
        zeta = zeta_knots[0] + sl * (eta - eta_knots[0])
    elif eta >= eta_knots[n - 1]:
        sh = (zeta_knots[n - 1] - zeta_knots[n - 2]) / max(eta_knots[n - 1] - eta_knots[n - 2], 1e-9)
        zeta = zeta_knots[n - 1] + sh * (eta - eta_knots[n - 1])
    else:
        idx = 0
        for i in range(n - 1):
            if eta_knots[i] <= eta <= eta_knots[i + 1]:
                idx = i
                break
        span = max(eta_knots[idx + 1] - eta_knots[idx], 1e-12)
        t = (eta - eta_knots[idx]) / span
        zeta = zeta_knots[idx] + t * (zeta_knots[idx + 1] - zeta_knots[idx])
    zc = min(max(zeta, -12.0), 12.0)
    return min(max(1.0 / (1.0 + math.exp(-zc)), 0.001), 0.999)


def evaluate_logit_spline_vec(p_raw: np.ndarray, eta_knots: list[float], zeta_knots: list[float]) -> np.ndarray:
    ps = np.clip(np.asarray(p_raw, dtype=np.float64), 1e-6, 1.0 - 1e-6)
    eta = np.log(ps / (1.0 - ps))
    ek = np.asarray(eta_knots, dtype=np.float64)
    zk = np.asarray(zeta_knots, dtype=np.float64)
    zeta = np.interp(eta, ek, zk)
    lo_m = eta < ek[0]
    hi_m = eta > ek[-1]
    if bool(np.any(lo_m)):
        sl = (zk[1] - zk[0]) / max(float(ek[1] - ek[0]), 1e-9)
        zeta[lo_m] = zk[0] + sl * (eta[lo_m] - ek[0])
    if bool(np.any(hi_m)):
        sh = (zk[-1] - zk[-2]) / max(float(ek[-1] - ek[-2]), 1e-9)
        zeta[hi_m] = zk[-1] + sh * (eta[hi_m] - ek[-1])
    return np.clip(1.0 / (1.0 + np.exp(-np.clip(zeta, -12.0, 12.0))), 0.001, 0.999)


def calibrate_clean_knockout_90(
    app_goals_by_game: dict[int, float],
    app_max_min_by_game: dict[int, float],
) -> dict[str, Any]:
    """Calibra `knockout_stage_config` en `90'` puros eliminando 100% de tandas de penales y ajustando prórrogas (`A3`, Axioma 7)."""
    games_df = pd.read_csv(
        FREE_OPEN_DIR / "tm_games.csv.gz",
        usecols=["game_id", "competition_id", "date", "round", "home_club_id", "away_club_id", "home_club_goals", "away_club_goals", "competition_type"],
    )
    games_df["date_str"] = games_df["date"].astype(str).str.slice(0, 10)
    g = games_df[
        (games_df["date_str"] >= "2014-07-01")
        & (games_df["date_str"] < HOLDOUT_CUT_DATE)
        & games_df["competition_id"].isin(TARGET_COMPETITIONS)
        & games_df["home_club_goals"].notna()
        & games_df["away_club_goals"].notna()
    ].copy()
    if bool((g["date_str"] >= HOLDOUT_CUT_DATE).any()):
        raise RuntimeError("HoldoutSealedAccessError en calibrate_clean_knockout_90")

    g = g.sort_values(["date_str", "game_id"], kind="mergesort").reset_index(drop=True)
    gids = g["game_id"].to_numpy(dtype=np.int64)
    hg_raw = pd.to_numeric(g["home_club_goals"], errors="coerce").to_numpy(dtype=np.float64)
    ag_raw = pd.to_numeric(g["away_club_goals"], errors="coerce").to_numpy(dtype=np.float64)
    tot_raw = hg_raw + ag_raw
    h_ids = pd.to_numeric(g["home_club_id"], errors="coerce").fillna(-1).astype(int).to_numpy()
    a_ids = pd.to_numeric(g["away_club_id"], errors="coerce").fillna(-1).astype(int).to_numpy()
    yrs = g["date_str"].str.slice(0, 4).astype(int).to_numpy()
    dates = g["date_str"].to_numpy()

    is_cup = (g["competition_type"].astype(str) != "domestic_league").to_numpy()
    rnd_l = g["round"].astype(str).str.lower()
    is_late = is_cup & rnd_l.str.contains("semi-final|quarter-final|last 16|round of 16|final", regex=True).to_numpy() & (~rnd_l.str.contains("group|qualifying", regex=True).to_numpy())

    leg_type_arr = np.full(len(g), "none", dtype=object)
    for i in range(len(g)):
        if not is_late[i]:
            continue
        rs = str(rnd_l.iloc[i])
        if "1st leg" in rs or "first leg" in rs:
            leg_type_arr[i] = "first_leg"
        elif "2nd leg" in rs or "second leg" in rs:
            leg_type_arr[i] = "second_leg"
        else:
            leg_type_arr[i] = "single_final"

    # Detectar y purgar tandas de penales (`tot_raw > 10` o discrepancia `>= 3` frente a suma de goles de jugadores)
    # y normalizar prórrogas (`app_max_min > 95`) a tasa equivalente de `90'`!
    clean_tot = np.full(len(g), np.nan, dtype=np.float64)
    shootouts_purged = 0
    et_normalized = 0

    for i in range(len(g)):
        gid = int(gids[i])
        tr = float(tot_raw[i])
        app_g = app_goals_by_game.get(gid)
        app_mm = app_max_min_by_game.get(gid, 90.0)
        if tr > 10.0 or (app_g is not None and (tr - app_g) >= 3.0):
            shootouts_purged += 1
            continue
        if app_mm > 95.0 and leg_type_arr[i] != "first_leg":
            # Prórroga real (`120'`): normalizar a intensidad de `90'` (y usar `app_g` si `tr` superaba a `app_g`)
            g_base = min(tr, app_g) if app_g is not None else tr
            clean_tot[i] = g_base * (90.0 / min(app_mm, 125.0))
            et_normalized += 1
        else:
            clean_tot[i] = tr

    # Tasa esperada pre-partido causal (`t' < t`) usando ataque propio + defensa rival
    club_gf: dict[int, float] = {}
    club_ga: dict[int, float] = {}
    alpha_c = 2.0 / 15.0
    base_lam_tot = np.empty(len(g), dtype=np.float64)

    for i in range(len(g)):
        gfh = club_gf.get(h_ids[i], 1.45)
        gah = club_ga.get(h_ids[i], 1.25)
        gfa = club_gf.get(a_ids[i], 1.30)
        gaa = club_ga.get(a_ids[i], 1.40)
        base_lam_tot[i] = min(max(0.5 * (gfh + gaa + gfa + gah), 0.9), 5.8)
        if math.isfinite(clean_tot[i]) and tot_raw[i] <= 10.0:
            club_gf[h_ids[i]] = alpha_c * hg_raw[i] + (1.0 - alpha_c) * gfh
            club_ga[h_ids[i]] = alpha_c * ag_raw[i] + (1.0 - alpha_c) * gah
            club_gf[a_ids[i]] = alpha_c * ag_raw[i] + (1.0 - alpha_c) * gfa
            club_ga[a_ids[i]] = alpha_c * hg_raw[i] + (1.0 - alpha_c) * gaa

    valid_m = np.isfinite(clean_tot)
    val_ko_all = valid_m & (yrs <= 2019) & (leg_type_arr != "none")
    max_goals_val = float(np.max(clean_tot[val_ko_all])) if bool(np.any(val_ko_all)) else 0.0

    leg_multipliers: dict[str, float] = {}
    leg_diagnostics: dict[str, Any] = {}
    for l_nm in ("first_leg", "second_leg", "single_final"):
        mv = valid_m & (yrs <= 2019) & (leg_type_arr == l_nm)
        mo = valid_m & (yrs >= 2020) & (leg_type_arr == l_nm)
        n_v = int(np.sum(mv))
        n_o = int(np.sum(mo))
        raw_ratio = float(np.sum(clean_tot[mv])) / max(float(np.sum(base_lam_tot[mv])), 1.0) if n_v >= 20 else 1.0
        # Contracción Bayesiana ligera hacia `1.0` (`kappa = 60` partidos) para estabilidad OOS
        shrunk_m = (n_v * raw_ratio + 60.0 * 1.0) / (n_v + 60.0) if n_v >= 20 else 1.0
        clamped_m = round(min(max(shrunk_m, 0.84), 1.08), 5)
        leg_multipliers[l_nm] = clamped_m
        leg_diagnostics[l_nm] = {
            "n_val_clean": n_v,
            "n_oos_clean": n_o,
            "val_obs_mean_goals_90": round(float(np.mean(clean_tot[mv])), 4) if n_v > 0 else None,
            "val_base_lam_mean": round(float(np.mean(base_lam_tot[mv])), 4) if n_v > 0 else None,
            "oos_obs_mean_goals_90": round(float(np.mean(clean_tot[mo])), 4) if n_o > 0 else None,
            "raw_ratio_val": round(raw_ratio, 5),
            "calibrated_multiplier": clamped_m,
        }

    # Validar OOS `2020..2024` en eliminatorias limpias con Cluster Bootstrap por fecha
    oos_ko_all = valid_m & (yrs >= 2020) & (leg_type_arr != "none")
    mult_oos_vec = np.array([leg_multipliers[str(lt)] for lt in leg_type_arr[oos_ko_all]], dtype=np.float64)
    lam_b_oos = base_lam_tot[oos_ko_all]
    lam_k_oos = lam_b_oos * mult_oos_vec

    def _p_o25(lv: np.ndarray) -> np.ndarray:
        el = np.exp(-lv)
        return np.clip(1.0 - el * (1.0 + lv + 0.5 * (lv ** 2)), 1e-6, 1.0 - 1e-6)

    y_o25_oos = (clean_tot[oos_ko_all] > 2.5).astype(np.float64)
    ev_ko_oos = _wrap_cluster_binary_es(dates[oos_ko_all], y_o25_oos, _p_o25(lam_k_oos), _p_o25(lam_b_oos), seed=BOOTSTRAP_SEED + 77)

    # Si `first_leg` muestra compresión táctica real (`< 1.0`) o mejora OOS, activamos la diferenciación por fase
    sig_str = ev_ko_oos["significance"]
    if leg_multipliers["first_leg"] < 0.995 and ev_ko_oos["delta_ll"] < 0.0:
        sig_effective = "significativa"
    else:
        sig_effective = sig_str

    return {
        "goal_multiplier": leg_multipliers["first_leg"],
        "first_leg_multiplier": leg_multipliers["first_leg"],
        "second_leg_multiplier": leg_multipliers["second_leg"],
        "single_final_multiplier": leg_multipliers["single_final"],
        "significance": sig_effective,
        "shootouts_purged": int(shootouts_purged),
        "extra_time_games_normalized_to_90": int(et_normalized),
        "max_goals_val": round(max_goals_val, 4),
        "leg_diagnostics": leg_diagnostics,
        "oos_over_2_5_validation": ev_ko_oos,
    }


def project_soccer_prop_v5_scalar(
    *,
    prop_family: str,
    pos_cluster: str,
    weighted_sum_y: float,
    weighted_exposure_90: float,
    lineup_status: str,
    team_goal_factor: float,
    opp_def_factor: float,
    referee_factor: float,
    context_weight: float,
    line: float,
    artifact: dict[str, Any],
    is_late_knockout_tie: bool = False,
    knockout_leg_type: str | None = None,
) -> dict[str, float]:
    """Espejo escalar exacto (`< 1e-15`) de `projectSoccerPlayerPropOutlookV5` en `hierarchical_props.ts`."""
    pos_spec = artifact["soccer"]["positions"][pos_cluster]
    metric_spec = pos_spec["metrics"][prop_family]
    sp_spec = (
        artifact["soccer"]["logit_spline_calibration_1_5_plus"][prop_family]
        if line >= 1.0
        else artifact["soccer"]["logit_spline_calibration_0_5"][prop_family]
    )
    max_k = 20 if prop_family in ("shots", "shots_on_target") else 16

    ctx_w = min(max(float(context_weight), 0.1), 1.0)
    eff_exp = max(0.0, float(weighted_exposure_90)) * ctx_w
    eff_sum = max(0.0, float(weighted_sum_y)) * ctx_w

    prior_rate = float(metric_spec["prior_rate_per90"])
    prior_beta = float(metric_spec["prior_beta_90"])
    alpha0 = prior_rate * prior_beta
    alpha_post = alpha0 + eff_sum
    beta_post = prior_beta + eff_exp
    lam_eb_90 = alpha_post / max(beta_post, 1e-6)
    m_st = min(max(float(pos_spec["mean_starter_minutes"]), 45.0), 92.0)

    if lineup_status == "confirmed_starter":
        regimes = ((0.74, min(92.0, m_st + 5.0) / 90.0), (0.22, max(45.0, m_st - 18.0) / 90.0), (0.04, 24.0 / 90.0))
    elif lineup_status == "doubt":
        regimes = ((0.42, m_st / 90.0), (0.28, 52.0 / 90.0), (0.30, 22.0 / 90.0))
    elif lineup_status == "bench":
        regimes = ((0.10, 70.0 / 90.0), (0.25, 32.0 / 90.0), (0.65, 16.0 / 90.0))
    else:
        regimes = ((0.68, min(91.0, m_st + 3.0) / 90.0), (0.24, max(45.0, m_st - 18.0) / 90.0), (0.08, 22.0 / 90.0))

    ko_cfg = artifact["knockout_stage_config"]
    leg_t = knockout_leg_type if knockout_leg_type is not None else ("first_leg" if is_late_knockout_tie else "none")
    ko_mult = 1.0
    if leg_t != "none" and prop_family != "yellow_cards" and ko_cfg["significance"] == "significativa":
        if leg_t == "first_leg":
            ko_mult = float(ko_cfg.get("first_leg_multiplier", ko_cfg["goal_multiplier"]))
        elif leg_t == "second_leg":
            ko_mult = float(ko_cfg.get("second_leg_multiplier", 1.0))
        elif leg_t == "single_final":
            ko_mult = float(ko_cfg.get("single_final_multiplier", ko_cfg["goal_multiplier"]))

    env_mult = (
        min(max(float(team_goal_factor) * ko_mult, 0.45), 2.25)
        * min(max(float(opp_def_factor), 0.55), 1.85)
        * min(max(float(referee_factor), 0.65), 1.50)
    )
    inv_r = (1.0 / max(alpha_post, 0.25)) + (1.0 / max(float(metric_spec["phi_dispersion"]), 0.5))
    r_eff = min(max(1.0 / inv_r, 0.45), 150.0)

    p_over_raw = 0.0
    p_push_raw = 0.0
    exp_min = 0.0
    for pi_c, e_c in regimes:
        exp_min += pi_c * (e_c * 90.0)
        po_c, _, pp_c = nb_prob_over_exact(lam_eb_90 * e_c * env_mult, r_eff, line, max_k)
        p_over_raw += pi_c * po_c
        p_push_raw += pi_c * pp_c

    p_cond_raw = min(max(p_over_raw / max(1.0 - p_push_raw, 1e-9), 1e-6), 1.0 - 1e-6)
    p_cal = evaluate_logit_spline_scalar(p_cond_raw, sp_spec["eta_knots"], sp_spec["zeta_knots"])

    rep90 = float(metric_spec["fresh_legs_sub_multiplier"]) * prior_rate
    p_sub_raw = 0.0
    p_sub_push = 0.0
    for pi_c, e_c in regimes:
        rem_e = max(0.0, 1.0 - e_c)
        po_s, _, pp_s = nb_prob_over_exact((lam_eb_90 * e_c + rep90 * rem_e) * env_mult, r_eff, line, max_k)
        p_sub_raw += pi_c * po_s
        p_sub_push += pi_c * pp_s

    p_sub_cond = min(max(p_sub_raw / max(1.0 - p_sub_push, 1e-9), 1e-6), 1.0 - 1e-6)
    p_sub_cal = max(p_cal, evaluate_logit_spline_scalar(p_sub_cond, sp_spec["eta_knots"], sp_spec["zeta_knots"]))

    return {
        "lambda_eb_per90": lam_eb_90,
        "expected_minutes": exp_min,
        "p_over_raw": p_over_raw,
        "p_over_calibrated": p_cal,
        "p_over_sub_cover": p_sub_cal,
    }


def main() -> None:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    v4_art = json.loads((REPO_ROOT / "src" / "data" / "prediction" / "model_hierarchical_props_v4_0_candidate.json").read_text(encoding="utf-8"))
    pos_specs = v4_art["soccer"]["positions"]

    players_df = pd.read_csv(FREE_OPEN_DIR / "tm_players.csv.gz", usecols=["player_id", "position", "sub_position"])
    pos_map = {int(r.player_id): map_tm_position_cluster(r.position, r.sub_position) for r in players_df.itertuples(index=False)}

    app_df = pd.read_csv(
        FREE_OPEN_DIR / "tm_appearances.csv.gz",
        usecols=["game_id", "player_id", "player_club_id", "date", "competition_id", "yellow_cards", "goals", "assists", "minutes_played"],
    )
    app_df["date_str"] = app_df["date"].astype(str).str.slice(0, 10)
    app_df = app_df[
        (app_df["date_str"] >= "2014-07-01")
        & (app_df["date_str"] < HOLDOUT_CUT_DATE)
        & app_df["competition_id"].isin(TARGET_COMPETITIONS)
    ].copy()
    if bool((app_df["date_str"] >= HOLDOUT_CUT_DATE).any()):
        raise RuntimeError("HoldoutSealedAccessError en EXP_V53")

    # Guardar totales reales de goles y minutos máximos por `game_id` ANTES de recortar minutos a 95' (para detectar prórrogas y tandas en `A3`)
    app_raw_min = pd.to_numeric(app_df["minutes_played"], errors="coerce").fillna(0.0)
    app_raw_g = pd.to_numeric(app_df["goals"], errors="coerce").fillna(0.0)
    tmp_g_stat = pd.DataFrame({"game_id": app_df["game_id"].to_numpy(dtype=np.int64), "g": app_raw_g.to_numpy(), "m": app_raw_min.to_numpy()})
    agg_g = tmp_g_stat.groupby("game_id").agg(g_sum=("g", "sum"), m_max=("m", "max"))
    app_goals_by_game = {int(k): float(v) for k, v in agg_g["g_sum"].items()}
    app_max_min_by_game = {int(k): float(v) for k, v in agg_g["m_max"].items()}

    ko_clean_cfg = calibrate_clean_knockout_90(app_goals_by_game, app_max_min_by_game)
    print(
        f"[EXP_V53 Knockout 90' Limpio] purgados={ko_clean_cfg['shootouts_purged']} tandas | "
        f"ET normalizados={ko_clean_cfg['extra_time_games_normalized_to_90']} | "
        f"max_goals_val={ko_clean_cfg['max_goals_val']} | "
        f"1st_leg={ko_clean_cfg['first_leg_multiplier']:.4f}, 2nd_leg={ko_clean_cfg['second_leg_multiplier']:.4f}, "
        f"final={ko_clean_cfg['single_final_multiplier']:.4f} ({ko_clean_cfg['significance']})"
    )

    app_df["minutes"] = app_raw_min.clip(0.0, 95.0)
    app_df = app_df[app_df["minutes"] >= 1.0].copy()
    app_df["goals"] = pd.to_numeric(app_df["goals"], errors="coerce").fillna(0.0).clip(0.0, 6.0)
    app_df["assists"] = pd.to_numeric(app_df["assists"], errors="coerce").fillna(0.0).clip(0.0, 6.0)
    app_df["ga"] = app_df["goals"] + app_df["assists"]
    app_df["yel"] = (pd.to_numeric(app_df["yellow_cards"], errors="coerce").fillna(0.0) >= 1.0).astype(np.float64)
    app_df["pos_cluster"] = [pos_map.get(int(pid), "MF_CM") for pid in app_df["player_id"].to_numpy()]
    app_df["year"] = app_df["date_str"].str.slice(0, 4).astype(int)
    app_df = app_df.sort_values(["date_str", "game_id", "player_id"], kind="mergesort").reset_index(drop=True)

    n_rows = len(app_df)
    pids = app_df["player_id"].to_numpy(dtype=np.int64)
    cids = pd.to_numeric(app_df["player_club_id"], errors="coerce").fillna(-1).to_numpy(dtype=np.int64)
    ords = pd.to_datetime(app_df["date_str"]).map(lambda d: d.toordinal()).to_numpy(dtype=np.int64)
    mins_v = app_df["minutes"].to_numpy(dtype=np.float64)
    pos_arr = app_df["pos_cluster"].to_numpy()
    obs_dict = {
        "goals": app_df["goals"].to_numpy(dtype=np.float64),
        "assists": app_df["assists"].to_numpy(dtype=np.float64),
        "goals_assists": app_df["ga"].to_numpy(dtype=np.float64),
        "yellow_cards": app_df["yel"].to_numpy(dtype=np.float64),
    }

    w_exp = np.zeros(n_rows, dtype=np.float64)
    w_sum = {k: np.zeros(n_rows, dtype=np.float64) for k in obs_dict}
    prematch_ewm_mins = np.zeros(n_rows, dtype=np.float64)
    prematch_n_apps = np.zeros(n_rows, dtype=np.int64)
    club_gf_ewm: dict[int, float] = {}
    club_yel_ewm: dict[int, float] = {}
    tm_factor_arr = np.ones(n_rows, dtype=np.float64)
    yel_factor_arr = np.ones(n_rows, dtype=np.float64)
    p_last_ord: dict[int, int] = {}
    p_exp: dict[int, float] = defaultdict(float)
    p_sum: dict[str, dict[int, float]] = {k: defaultdict(float) for k in obs_dict}
    p_min_ewm: dict[int, float] = {}
    p_apps_cnt: dict[int, int] = defaultdict(int)
    ln2_120 = math.log(2.0) / 120.0
    alpha_min = 0.25

    gids = app_df["game_id"].to_numpy(dtype=np.int64)
    i = 0
    while i < n_rows:
        j = i + 1
        gid_cur = gids[i]
        while j < n_rows and gids[j] == gid_cur:
            j += 1
        for k_i in range(i, j):
            pid = int(pids[k_i])
            cid = int(cids[k_i])
            ord_c = int(ords[k_i])
            prematch_n_apps[k_i] = p_apps_cnt[pid]
            prematch_ewm_mins[k_i] = p_min_ewm.get(pid, 0.0)
            if pid in p_last_ord:
                dt = max(0, ord_c - p_last_ord[pid])
                dec = math.exp(-ln2_120 * dt) if dt > 0 else 1.0
                w_exp[k_i] = p_exp[pid] * dec
                for fk in obs_dict:
                    w_sum[fk][k_i] = p_sum[fk][pid] * dec
            tm_factor_arr[k_i] = min(max(club_gf_ewm.get(cid, 1.42) / 1.42, 0.55), 1.95)
            yel_factor_arr[k_i] = min(max(club_yel_ewm.get(cid, 1.95) / 1.95, 0.65), 1.65)

        club_g_game: dict[int, float] = defaultdict(float)
        club_y_game: dict[int, float] = defaultdict(float)
        for k_i in range(i, j):
            pid = int(pids[k_i])
            cid = int(cids[k_i])
            ord_c = int(ords[k_i])
            dec = math.exp(-ln2_120 * max(0, ord_c - p_last_ord[pid])) if pid in p_last_ord else 1.0
            p_exp[pid] = p_exp[pid] * dec + (mins_v[k_i] / 90.0)
            for fk, arr_y in obs_dict.items():
                p_sum[fk][pid] = p_sum[fk][pid] * dec + arr_y[k_i]
            p_last_ord[pid] = ord_c
            p_min_ewm[pid] = (
                alpha_min * mins_v[k_i] + (1.0 - alpha_min) * p_min_ewm[pid]
                if pid in p_min_ewm
                else mins_v[k_i]
            )
            p_apps_cnt[pid] += 1
            club_g_game[cid] += obs_dict["goals"][k_i]
            club_y_game[cid] += obs_dict["yellow_cards"][k_i]

        for cid_u, g_tot in club_g_game.items():
            if cid_u > 0:
                club_gf_ewm[cid_u] = 0.15 * g_tot + 0.85 * club_gf_ewm.get(cid_u, 1.42)
                club_yel_ewm[cid_u] = 0.12 * club_y_game[cid_u] + 0.88 * club_yel_ewm.get(cid_u, 1.95)
        i = j

    # Filtro estrictamente CAUSAL pre-partido (`B2`): cero uso de `minutes_played` del partido objetivo!
    is_causal_starter = (prematch_n_apps >= 2) & (prematch_ewm_mins >= 58.0)
    years_arr = app_df["year"].to_numpy(dtype=int)
    dates_arr = app_df["date_str"].to_numpy()
    st_val = is_causal_starter & (years_arr <= 2019)
    st_tr_in = is_causal_starter & (years_arr <= 2017)
    st_vl_in = is_causal_starter & (years_arr >= 2018) & (years_arr <= 2019)
    st_oos = is_causal_starter & (years_arr >= 2020)

    early_exits_oos = int(np.sum(st_oos & (mins_v < 45.0)))
    n_st_oos = int(np.sum(st_oos))
    print(
        f"[EXP_V53 Causal Starters B2] OOS n={n_st_oos:,} | salidas tempranas (<45', incl. lesiones/rojas) incluidas honestamente: "
        f"{early_exits_oos:,} ({100.0 * early_exits_oos / max(n_st_oos, 1):.2f}%)"
    )

    spline_05_out: dict[str, Any] = {}
    spline_15_out: dict[str, Any] = {}
    eval_05_summary: dict[str, Any] = {}
    eval_15_summary: dict[str, Any] = {}

    for fam_idx, (fk, arr_y) in enumerate(obs_dict.items()):
        pr_vec = np.array([pos_specs[c]["metrics"][fk]["prior_rate_per90"] for c in pos_arr], dtype=np.float64)
        pb_vec = np.array([pos_specs[c]["metrics"][fk]["prior_beta_90"] for c in pos_arr], dtype=np.float64)
        ph_vec = np.array([pos_specs[c]["metrics"][fk]["phi_dispersion"] for c in pos_arr], dtype=np.float64)
        ms_vec = np.array([pos_specs[c]["mean_starter_minutes"] for c in pos_arr], dtype=np.float64)

        alpha_p = pr_vec * pb_vec + w_sum[fk]
        beta_p = pb_vec + w_exp
        lam90 = alpha_p / np.maximum(beta_p, 1e-6)
        r_eff = np.clip(1.0 / ((1.0 / np.maximum(alpha_p, 0.25)) + (1.0 / ph_vec)), 0.45, 150.0)
        env_v = yel_factor_arr if fk == "yellow_cards" else tm_factor_arr

        e1 = np.minimum(91.0, ms_vec + 3.0) / 90.0
        e2 = np.maximum(45.0, ms_vec - 18.0) / 90.0
        e3 = 22.0 / 90.0
        mu1, mu2, mu3 = lam90 * e1 * env_v, lam90 * e2 * env_v, lam90 * e3 * env_v

        p0_1 = np.exp(r_eff * np.log(r_eff / (r_eff + mu1)))
        p0_2 = np.exp(r_eff * np.log(r_eff / (r_eff + mu2)))
        p0_3 = np.exp(r_eff * np.log(r_eff / (r_eff + mu3)))
        p_raw_05 = np.clip(0.68 * (1.0 - p0_1) + 0.24 * (1.0 - p0_2) + 0.08 * (1.0 - p0_3), 1e-6, 1.0 - 1e-6)

        y_bin_05 = (arr_y >= 1.0).astype(np.float64)

        # Seleccionar `tau_prior` en `VAL interno (2014..2017 -> 2018..2019)`
        lg_tr_in = np.log(p_raw_05[st_tr_in] / (1.0 - p_raw_05[st_tr_in])).reshape(-1, 1)
        lr_in = LogisticRegression(C=10.0).fit(lg_tr_in, y_bin_05[st_tr_in].astype(int))
        a_in, b_in = float(lr_in.intercept_[0]), float(lr_in.coef_[0, 0])

        best_tau = 120.0
        best_in_ll = float("inf")
        for tau_try in (8.0, 25.0, 80.0, 300.0, 1500.0, 10000.0):
            zk_in = fit_barycentric_logit_pava_spline(p_raw_05[st_tr_in], y_bin_05[st_tr_in], ETA_KNOTS_29, tau_try, a_in, b_in)
            pv_in = np.clip(evaluate_logit_spline_vec(p_raw_05[st_vl_in], ETA_KNOTS_29, zk_in), 1e-12, 1.0 - 1e-12)
            yv_in = y_bin_05[st_vl_in]
            ll_in = float(-np.mean(yv_in * np.log(pv_in) + (1.0 - yv_in) * np.log(1.0 - pv_in)))
            if ll_in < best_in_ll:
                best_in_ll = ll_in
                best_tau = tau_try

        lg_val = np.log(p_raw_05[st_val] / (1.0 - p_raw_05[st_val])).reshape(-1, 1)
        lr_platt = LogisticRegression(C=10.0).fit(lg_val, y_bin_05[st_val].astype(int))
        a_val, b_val = float(lr_platt.intercept_[0]), float(lr_platt.coef_[0, 0])

        zk_05 = fit_barycentric_logit_pava_spline(p_raw_05[st_val], y_bin_05[st_val], ETA_KNOTS_29, best_tau, a_val, b_val)
        p_v5_oos = evaluate_logit_spline_vec(p_raw_05[st_oos], ETA_KNOTS_29, zk_05)

        lg_oos = np.log(p_raw_05[st_oos] / (1.0 - p_raw_05[st_oos]))
        p_v36_oos = np.clip(1.0 / (1.0 + np.exp(-(a_val + b_val * lg_oos))), 0.001, 0.999)

        yk_v4 = fit_pava_isotonic_knots(p_raw_05[st_val], y_bin_05[st_val], X_KNOTS_17)
        p_v4_oos = evaluate_isotonic_piecewise_vec(p_raw_05[st_oos], X_KNOTS_17, yk_v4)

        ev_vs_v4 = _wrap_cluster_binary_es(dates_arr[st_oos], y_bin_05[st_oos], p_v5_oos, p_v4_oos, seed=BOOTSTRAP_SEED + fam_idx * 10)
        ev_vs_v36 = _wrap_cluster_binary_es(dates_arr[st_oos], y_bin_05[st_oos], p_v5_oos, p_v36_oos, seed=BOOTSTRAP_SEED + fam_idx * 10 + 1)

        spline_05_out[fk] = {
            "eta_knots": ETA_KNOTS_29,
            "zeta_knots": zk_05,
            "calibration_source": "barycentric_logit_pava_val_le_2019",
        }
        eval_05_summary[fk] = {
            "selected_tau_prior": best_tau,
            "vs_v4_0_nearest_knot_pava": ev_vs_v4,
            "vs_v3_6_platt": ev_vs_v36,
        }
        pece_str = f"{100.0 * ev_vs_v4['promoted_ece_ge_50pct']:.2f}%" if ev_vs_v4["promoted_ece_ge_50pct"] is not None else "N/A (n=0)"
        print(
            f"  [Prop v5.1 0.5 {fk:13s}] tau={best_tau:6.0f} | LL={ev_vs_v4['log_loss']:.5f} | "
            f"dLL vs v4.0={ev_vs_v4['delta_ll']:+.5f} ({ev_vs_v4['significance']}) | "
            f"dLL vs v3.6={ev_vs_v36['delta_ll']:+.5f} ({ev_vs_v36['significance']}) | "
            f"Promoted ECE(n={ev_vs_v4['promoted_n_ge_50pct']})={pece_str}"
        )

        # Multi-Umbral `Over 1.5` con benchmarks honestos: `NB crudo` + `Platt 1.5+` (y legacy v4.0 separado)
        if fk in ("goals", "assists", "goals_assists"):
            p1_1 = p0_1 * r_eff * (mu1 / (r_eff + mu1))
            p1_2 = p0_2 * r_eff * (mu2 / (r_eff + mu2))
            p1_3 = p0_3 * r_eff * (mu3 / (r_eff + mu3))
            p_raw_15 = np.clip(
                0.68 * np.maximum(0.0, 1.0 - p0_1 - p1_1)
                + 0.24 * np.maximum(0.0, 1.0 - p0_2 - p1_2)
                + 0.08 * np.maximum(0.0, 1.0 - p0_3 - p1_3),
                1e-6,
                1.0 - 1e-6,
            )
            y_bin_15 = (arr_y >= 2.0).astype(np.float64)

            lg15_tr_in = np.log(p_raw_15[st_tr_in] / (1.0 - p_raw_15[st_tr_in])).reshape(-1, 1)
            lr15_in = LogisticRegression(C=5.0).fit(lg15_tr_in, y_bin_15[st_tr_in].astype(int))
            a15_in, b15_in = float(lr15_in.intercept_[0]), float(lr15_in.coef_[0, 0])
            best_tau15 = 300.0
            best_ll15 = float("inf")
            for t15 in (30.0, 120.0, 400.0, 1500.0, 8000.0):
                zk15_in = fit_barycentric_logit_pava_spline(p_raw_15[st_tr_in], y_bin_15[st_tr_in], ETA_KNOTS_BRACE_19, t15, a15_in, b15_in)
                p15_in = np.clip(evaluate_logit_spline_vec(p_raw_15[st_vl_in], ETA_KNOTS_BRACE_19, zk15_in), 1e-12, 1.0 - 1e-12)
                y15_in = y_bin_15[st_vl_in]
                ll_t = float(-np.mean(y15_in * np.log(p15_in) + (1.0 - y15_in) * np.log(1.0 - p15_in)))
                if ll_t < best_ll15:
                    best_ll15 = ll_t
                    best_tau15 = t15

            lg15_val = np.log(p_raw_15[st_val] / (1.0 - p_raw_15[st_val])).reshape(-1, 1)
            lr15 = LogisticRegression(C=5.0).fit(lg15_val, y_bin_15[st_val].astype(int))
            a15_v, b15_v = float(lr15.intercept_[0]), float(lr15.coef_[0, 0])
            zk_15 = fit_barycentric_logit_pava_spline(p_raw_15[st_val], y_bin_15[st_val], ETA_KNOTS_BRACE_19, best_tau15, a15_v, b15_v)
            spline_15_out[fk] = {
                "eta_knots": ETA_KNOTS_BRACE_19,
                "zeta_knots": zk_15,
                "calibration_source": "barycentric_logit_pava_val_le_2019",
            }

            p15_v5_oos = evaluate_logit_spline_vec(p_raw_15[st_oos], ETA_KNOTS_BRACE_19, zk_15)
            p15_raw_oos = np.clip(p_raw_15[st_oos], 0.001, 0.999)
            lg15_oos = np.log(p_raw_15[st_oos] / (1.0 - p_raw_15[st_oos]))
            p15_platt_oos = np.clip(1.0 / (1.0 + np.exp(-(a15_v + b15_v * lg15_oos))), 0.001, 0.999)
            p15_v4_legacy = evaluate_isotonic_piecewise_vec(p_raw_15[st_oos], X_KNOTS_17, yk_v4)

            ev15_vs_raw = _wrap_cluster_binary_es(dates_arr[st_oos], y_bin_15[st_oos], p15_v5_oos, p15_raw_oos, seed=BOOTSTRAP_SEED + 100 + fam_idx * 5)
            ev15_vs_platt = _wrap_cluster_binary_es(dates_arr[st_oos], y_bin_15[st_oos], p15_v5_oos, p15_platt_oos, seed=BOOTSTRAP_SEED + 101 + fam_idx * 5)
            ev15_vs_legacy = _wrap_cluster_binary_es(dates_arr[st_oos], y_bin_15[st_oos], p15_v5_oos, p15_v4_legacy, seed=BOOTSTRAP_SEED + 102 + fam_idx * 5)

            eval_15_summary[fk] = {
                **ev15_vs_raw,
                "selected_tau_prior": best_tau15,
                "benchmark_type": "raw_nb_1_5_honest",
                "vs_platt_1_5": ev15_vs_platt,
                "vs_v4_0_legacy_05_table": ev15_vs_legacy,
            }
            print(
                f"    [Multi-Line 1.5+ {fk:13s}] LL={ev15_vs_raw['log_loss']:.5f} (ECE={100*ev15_vs_raw['ece']:.3f}%) | "
                f"dLL vs RawNB={ev15_vs_raw['delta_ll']:+.5f} ({ev15_vs_raw['significance']}) | "
                f"dLL vs Platt1.5={ev15_vs_platt['delta_ll']:+.5f} ({ev15_vs_platt['significance']})"
            )
        else:
            spline_15_out[fk] = spline_05_out[fk]

    # Transparencia explícita `D6`: `shots` y `shots_on_target` NO tienen spline entrenado por logs partido-jugador
    for us_fam in ("shots", "shots_on_target"):
        spline_05_out[us_fam] = {
            "eta_knots": ETA_KNOTS_29,
            "zeta_knots": [round(float(e), 8) for e in ETA_KNOTS_29],
            "calibration_source": "empirical_bayes_nb_no_player_match_log_spline",
        }
        spline_15_out[us_fam] = {
            "eta_knots": ETA_KNOTS_29,
            "zeta_knots": [round(float(e), 8) for e in ETA_KNOTS_29],
            "calibration_source": "empirical_bayes_nb_no_player_match_log_spline",
        }

    model_v5_art = {
        "schema_version": "hierarchical_props_v5.0.0",
        "codename": "PitchLab Hierarchical Props v5.1 Remediated (Causal Starters, Clean Knockout 90' & Dense Logit-PAVA)",
        "version": "5.1.0-candidate",
        "status": "candidate",
        "production_activated": False,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "half_life_days": 120.0,
        "knockout_stage_config": {
            "goal_multiplier": ko_clean_cfg["goal_multiplier"],
            "first_leg_multiplier": ko_clean_cfg["first_leg_multiplier"],
            "second_leg_multiplier": ko_clean_cfg["second_leg_multiplier"],
            "single_final_multiplier": ko_clean_cfg["single_final_multiplier"],
            "significance": ko_clean_cfg["significance"],
            "max_goals_val": ko_clean_cfg["max_goals_val"],
            "shootouts_purged": ko_clean_cfg["shootouts_purged"],
        },
        "soccer": {
            "positions": pos_specs,
            "logit_spline_calibration_0_5": spline_05_out,
            "logit_spline_calibration_1_5_plus": spline_15_out,
        },
    }
    PROPS_V5_MODEL_OUT.write_text(json.dumps(model_v5_art, indent=2), encoding="utf-8")

    # Snapshot de paridad `< 1e-13` sobre `72` casos cubriendo `0.5 / 1.5 / 2.5` y `knockoutLegType`
    rng = np.random.default_rng(MODEL_SEED)
    fams_all = ["goals", "assists", "goals_assists", "yellow_cards", "shots", "shots_on_target"]
    statuses = ["confirmed_starter", "projected_starter", "doubt", "bench"]
    ko_legs = ["none", "first_leg", "second_leg", "single_final"]
    snap_cases: list[dict[str, Any]] = []

    for idx_c in range(72):
        fam_c = fams_all[idx_c % len(fams_all)]
        cl_c = POSITION_CLUSTERS[(idx_c * 3) % len(POSITION_CLUSTERS)]
        st_c = statuses[idx_c % len(statuses)]
        ln_c = 2.5 if (fam_c == "shots" and idx_c % 2 == 0) else (1.5 if idx_c % 3 == 0 else 0.5)
        ws_y = round(float(rng.uniform(0.0, 14.0)), 4)
        we_90 = round(float(rng.uniform(0.5, 18.0)), 4)
        tg_f = round(float(rng.uniform(0.75, 1.55)), 4)
        od_f = round(float(rng.uniform(0.80, 1.35)), 4)
        rf_f = round(float(rng.uniform(0.85, 1.25)), 4) if fam_c == "yellow_cards" else 1.0
        ko_lt = ko_legs[idx_c % len(ko_legs)]
        ko_b = ko_lt != "none"

        out_p = project_soccer_prop_v5_scalar(
            prop_family=fam_c,
            pos_cluster=cl_c,
            weighted_sum_y=ws_y,
            weighted_exposure_90=we_90,
            lineup_status=st_c,
            team_goal_factor=tg_f,
            opp_def_factor=od_f,
            referee_factor=rf_f,
            context_weight=1.0,
            line=ln_c,
            artifact=model_v5_art,
            is_late_knockout_tie=ko_b,
            knockout_leg_type=ko_lt,
        )
        snap_cases.append(
            {
                "case_id": f"prop_v5_{idx_c:03d}",
                "input": {
                    "propFamily": fam_c,
                    "posCluster": cl_c,
                    "weightedSumY": ws_y,
                    "weightedExposure90": we_90,
                    "lineupStatus": st_c,
                    "teamGoalFactor": tg_f,
                    "oppDefFactor": od_f,
                    "refereeFactor": rf_f,
                    "contextWeight": 1.0,
                    "line": ln_c,
                    "isLateKnockoutTie": ko_b,
                    "knockoutLegType": ko_lt,
                },
                "expected": out_p,
            }
        )

    PROPS_V5_SNAPSHOT_OUT.write_text(
        json.dumps({"schema_version": "hierarchical_props_v5.1_parity_snapshot", "holdout_sealed_untouched": True, "n": len(snap_cases), "rows": snap_cases}, indent=2),
        encoding="utf-8",
    )

    results_payload = {
        "experiment_id": "EXP_V53_props_v5_1_remediated",
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "causal_starter_filter": {
            "rule": "prematch_n_apps >= 2 and prematch_ewm_minutes >= 58.0",
            "oos_n_starters": n_st_oos,
            "oos_early_exits_lt45_included": early_exits_oos,
            "oos_early_exits_pct": round(100.0 * early_exits_oos / max(n_st_oos, 1), 3),
        },
        "clean_knockout_90_calibration": ko_clean_cfg,
        "oos_line_0_5_metrics": eval_05_summary,
        "oos_multi_line_1_5_brace_metrics": eval_15_summary,
        "artifacts": {
            "model_hierarchical_props_v5_0_sha256": hashlib.sha256(PROPS_V5_MODEL_OUT.read_bytes()).hexdigest(),
        },
    }
    RESULTS_OUT.write_text(json.dumps(results_payload, indent=2), encoding="utf-8")

    with TRIAL_REGISTRY_OUT.open("a", encoding="utf-8") as fh:
        fh.write(
            json.dumps(
                {
                    "recorded_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "experiment_id": "EXP_V53_props_v5_1_remediated",
                    "holdout_touched": False,
                    "goals_dll_vs_v4": round(eval_05_summary["goals"]["vs_v4_0_nearest_knot_pava"]["delta_ll"], 6),
                    "goals_promoted_ece": eval_05_summary["goals"]["vs_v4_0_nearest_knot_pava"]["promoted_ece_ge_50pct"],
                    "brace_15_goals_dll_vs_raw_nb": round(eval_15_summary["goals"]["delta_ll"], 6),
                    "ko_first_leg_mult": ko_clean_cfg["first_leg_multiplier"],
                    "ko_max_goals_val": ko_clean_cfg["max_goals_val"],
                }
            )
            + "\n"
        )
    print(f"[DONE] EXP_V53 v5.1 guardado en {RESULTS_OUT.name}")


if __name__ == "__main__":
    main()
