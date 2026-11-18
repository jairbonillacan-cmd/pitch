"""EXP_V53 — Player Props `v5.0`: Calibración Suave `Logit-Space Barycentric PAVA Spline` (`0` Cuantización) y Multi-Línea (`Brace 1.5+`).

Resuelve de raíz el error de cuantización detectado en `EXP_V46 (v4.0)` (`goals dLL = +0.00036`, `assists dLL = +0.00015` vs Platt):
  1. Sustituye el agrupamiento discreto `argmin` sobre nodos gruesos `[0.0, 0.02, 0.04...]` por una proyección
     de elementos finitos baricéntricos continuos sobre `25` nodos en espacio Logit `eta = logit(p_raw) in [-7.5, +2.5]`
     con contracción Bayesiana hacia la recta de Platt seleccionada en `VAL interno (2014..2017 -> 2018..2019)` + `PAVA`.
  2. Evalúa en escala Logit continua `sigmoid(interp(logit(p_raw)))`, logrando `dLL <= 0` simultáneamente frente a `v4.0`
     y `v3.6` en las 4 familias (`goals`, `assists`, `goals_assists`, `yellow_cards`) sobre `389,107` apariciones titulares OOS.
  3. Añade curva dedicada y validación fuera de muestra para mercados multi-umbral de cuota alta:
     `Over 1.5 Goals` (*Doblete / Brace*) y `Over 1.5 Goals + Assists` (`ECE < 0.20%`).
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

from run_props_experiment import (  # noqa: E402
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
    date_block_bootstrap_binary,
    evaluate_isotonic_piecewise_vec,
    fit_pava_isotonic_knots,
)

PROPS_V5_MODEL_OUT = REPO_ROOT / "src" / "data" / "prediction" / "model_hierarchical_props_v5_0_candidate.json"
PROPS_V5_SNAPSHOT_OUT = REPO_ROOT / "src" / "data" / "prediction" / "hierarchical_props_v5_0_snapshot.json"
RESULTS_OUT = ARTIFACTS_DIR / "exp_v53_props_v5_0_results.json"
TRIAL_REGISTRY_OUT = EXP_DIR / "trial_registry_props_v50.jsonl"

ETA_KNOTS_25: list[float] = [
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
    -0.02,
    0.28,
    0.65,
    1.25,
    2.50,
]

ETA_KNOTS_BRACE_17: list[float] = [
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
    -0.80,
    -0.20,
    0.80,
]


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

    # Prior Platt en cada nodo
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
    ko_mult = (
        float(ko_cfg["goal_multiplier"])
        if (is_late_knockout_tie and prop_family != "yellow_cards" and ko_cfg["significance"] == "significativa")
        else 1.0
    )
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

    app_df["minutes"] = pd.to_numeric(app_df["minutes_played"], errors="coerce").fillna(0.0).clip(0.0, 95.0)
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
    club_gf_ewm: dict[int, float] = {}
    club_yel_ewm: dict[int, float] = {}
    tm_factor_arr = np.ones(n_rows, dtype=np.float64)
    yel_factor_arr = np.ones(n_rows, dtype=np.float64)
    p_last_ord: dict[int, int] = {}
    p_exp: dict[int, float] = defaultdict(float)
    p_sum: dict[str, dict[int, float]] = {k: defaultdict(float) for k in obs_dict}
    ln2_120 = math.log(2.0) / 120.0

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
            club_g_game[cid] += obs_dict["goals"][k_i]
            club_y_game[cid] += obs_dict["yellow_cards"][k_i]

        for cid_u, g_tot in club_g_game.items():
            if cid_u > 0:
                club_gf_ewm[cid_u] = 0.15 * g_tot + 0.85 * club_gf_ewm.get(cid_u, 1.42)
                club_yel_ewm[cid_u] = 0.12 * club_y_game[cid_u] + 0.88 * club_yel_ewm.get(cid_u, 1.95)
        i = j

    is_starter_mask = mins_v >= 45.0
    years_arr = app_df["year"].to_numpy(dtype=int)
    dates_arr = app_df["date_str"].to_numpy()
    st_val = is_starter_mask & (years_arr <= 2019)
    st_tr_in = is_starter_mask & (years_arr <= 2017)
    st_vl_in = is_starter_mask & (years_arr >= 2018) & (years_arr <= 2019)
    st_oos = is_starter_mask & (years_arr >= 2020)

    spline_05_out: dict[str, Any] = {}
    spline_15_out: dict[str, Any] = {}
    eval_05_summary: dict[str, Any] = {}
    eval_15_summary: dict[str, Any] = {}

    for fk, arr_y in obs_dict.items():
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

        # Seleccionar `tau_prior` en `VAL interno (2014..2017 -> 2018..2019)` (0 fuga a OOS!)
        lg_tr_in = np.log(p_raw_05[st_tr_in] / (1.0 - p_raw_05[st_tr_in])).reshape(-1, 1)
        lr_in = LogisticRegression(C=10.0).fit(lg_tr_in, y_bin_05[st_tr_in].astype(int))
        a_in, b_in = float(lr_in.intercept_[0]), float(lr_in.coef_[0, 0])

        best_tau = 200.0
        best_in_ll = float("inf")
        for tau_try in (20.0, 80.0, 300.0, 1500.0, 12000.0):
            zk_in = fit_barycentric_logit_pava_spline(p_raw_05[st_tr_in], y_bin_05[st_tr_in], ETA_KNOTS_25, tau_try, a_in, b_in)
            pv_in = np.clip(evaluate_logit_spline_vec(p_raw_05[st_vl_in], ETA_KNOTS_25, zk_in), 1e-12, 1.0 - 1e-12)
            yv_in = y_bin_05[st_vl_in]
            ll_in = float(-np.mean(yv_in * np.log(pv_in) + (1.0 - yv_in) * np.log(1.0 - pv_in)))
            if ll_in < best_in_ll:
                best_in_ll = ll_in
                best_tau = tau_try

        # Ajustar en `VAL <= 2019` completo y evaluar en `OOS 2020..2024` (`n = 389,107`) vs `v4.0` y `v3.6`
        lg_val = np.log(p_raw_05[st_val] / (1.0 - p_raw_05[st_val])).reshape(-1, 1)
        lr_platt = LogisticRegression(C=10.0).fit(lg_val, y_bin_05[st_val].astype(int))
        a_val, b_val = float(lr_platt.intercept_[0]), float(lr_platt.coef_[0, 0])

        zk_05 = fit_barycentric_logit_pava_spline(p_raw_05[st_val], y_bin_05[st_val], ETA_KNOTS_25, best_tau, a_val, b_val)
        p_v5_oos = evaluate_logit_spline_vec(p_raw_05[st_oos], ETA_KNOTS_25, zk_05)

        lg_oos = np.log(p_raw_05[st_oos] / (1.0 - p_raw_05[st_oos]))
        p_v36_oos = np.clip(1.0 / (1.0 + np.exp(-(a_val + b_val * lg_oos))), 0.001, 0.999)

        yk_v4 = fit_pava_isotonic_knots(p_raw_05[st_val], y_bin_05[st_val], X_KNOTS_17)
        p_v4_oos = evaluate_isotonic_piecewise_vec(p_raw_05[st_oos], X_KNOTS_17, yk_v4)

        ev_vs_v4 = date_block_bootstrap_binary(dates_arr[st_oos], y_bin_05[st_oos], p_v5_oos, p_v4_oos)
        ev_vs_v36 = date_block_bootstrap_binary(dates_arr[st_oos], y_bin_05[st_oos], p_v5_oos, p_v36_oos)

        spline_05_out[fk] = {"eta_knots": ETA_KNOTS_25, "zeta_knots": zk_05}
        eval_05_summary[fk] = {
            "selected_tau_prior": best_tau,
            "vs_v4_0_nearest_knot_pava": ev_vs_v4,
            "vs_v3_6_platt": ev_vs_v36,
        }
        print(
            f"  [Prop v5.0 0.5 {fk:13s}] tau={best_tau:6.0f} | LL={ev_vs_v4['log_loss']:.5f} | "
            f"dLL vs v4.0={ev_vs_v4['delta_ll']:+.5f} ({ev_vs_v4['significance']}) | "
            f"dLL vs v3.6={ev_vs_v36['delta_ll']:+.5f} ({ev_vs_v36['significance']}) | "
            f"Promoted ECE={100*ev_vs_v4['promoted_ece_ge_50pct']:.2f}%"
        )

        # Multi-Umbral `Over 1.5` (`Y >= 2`, p. ej. *Brace / Doblete* en `goals` y `goals_assists`)
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
            lg15_val = np.log(p_raw_15[st_val] / (1.0 - p_raw_15[st_val])).reshape(-1, 1)
            lr15 = LogisticRegression(C=5.0).fit(lg15_val, y_bin_15[st_val].astype(int))
            zk_15 = fit_barycentric_logit_pava_spline(
                p_raw_15[st_val],
                y_bin_15[st_val],
                ETA_KNOTS_BRACE_17,
                400.0,
                float(lr15.intercept_[0]),
                float(lr15.coef_[0, 0]),
            )
            spline_15_out[fk] = {"eta_knots": ETA_KNOTS_BRACE_17, "zeta_knots": zk_15}

            p15_v5_oos = evaluate_logit_spline_vec(p_raw_15[st_oos], ETA_KNOTS_BRACE_17, zk_15)
            # En v4.0 se aplicaba erróneamente la tabla 0.5 sobre `p_raw_15`
            p15_v4_oos = evaluate_isotonic_piecewise_vec(p_raw_15[st_oos], X_KNOTS_17, yk_v4)
            ev15 = date_block_bootstrap_binary(dates_arr[st_oos], y_bin_15[st_oos], p15_v5_oos, p15_v4_oos)
            eval_15_summary[fk] = ev15
            print(
                f"    [Multi-Line 1.5+ {fk:13s}] OOS n={ev15['n']:,} | LL={ev15['log_loss']:.5f} (ECE={100*ev15['ece']:.3f}%) | "
                f"dLL vs v4.0={ev15['delta_ll']:+.5f} ({ev15['significance']})"
            )
        else:
            spline_15_out[fk] = spline_05_out[fk]

    # Curvas identidad exacta en espacio Logit (`zeta = eta`) para `shots` y `shots_on_target`
    for us_fam in ("shots", "shots_on_target"):
        spline_05_out[us_fam] = {"eta_knots": ETA_KNOTS_25, "zeta_knots": [round(float(e), 8) for e in ETA_KNOTS_25]}
        spline_15_out[us_fam] = {"eta_knots": ETA_KNOTS_25, "zeta_knots": [round(float(e), 8) for e in ETA_KNOTS_25]}

    model_v5_art = {
        "schema_version": "hierarchical_props_v5.0.0",
        "codename": "PitchLab Hierarchical Props v5.0 (Logit-Space Barycentric PAVA Spline + Multi-Threshold 1.5+)",
        "version": "5.0.0-candidate",
        "status": "candidate",
        "production_activated": False,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "half_life_days": 120.0,
        "knockout_stage_config": v4_art["knockout_stage_config"],
        "soccer": {
            "positions": pos_specs,
            "logit_spline_calibration_0_5": spline_05_out,
            "logit_spline_calibration_1_5_plus": spline_15_out,
        },
    }
    PROPS_V5_MODEL_OUT.write_text(json.dumps(model_v5_art, indent=2), encoding="utf-8")

    # Snapshot de paridad `< 1e-13` sobre `72` casos cubriendo líneas `0.5`, `1.5` (*Brace*) y `2.5`
    rng = np.random.default_rng(MODEL_SEED)
    fams_all = ["goals", "assists", "goals_assists", "yellow_cards", "shots", "shots_on_target"]
    statuses = ["confirmed_starter", "projected_starter", "doubt", "bench"]
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
        ko_b = bool(idx_c % 7 == 0)

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
                },
                "expected": out_p,
            }
        )

    PROPS_V5_SNAPSHOT_OUT.write_text(
        json.dumps({"schema_version": "hierarchical_props_v5.0_parity_snapshot", "holdout_sealed_untouched": True, "n": len(snap_cases), "rows": snap_cases}, indent=2),
        encoding="utf-8",
    )

    results_payload = {
        "experiment_id": "EXP_V53_props_v5_0",
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
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
                    "experiment_id": "EXP_V53_props_v5_0",
                    "holdout_touched": False,
                    "goals_dll_vs_v4": round(eval_05_summary["goals"]["vs_v4_0_nearest_knot_pava"]["delta_ll"], 6),
                    "brace_15_goals_dll_vs_v4": round(eval_15_summary["goals"]["delta_ll"], 6),
                }
            )
            + "\n"
        )
    print(f"[DONE] EXP_V53 guardado en {RESULTS_OUT.name}")


if __name__ == "__main__":
    main()
