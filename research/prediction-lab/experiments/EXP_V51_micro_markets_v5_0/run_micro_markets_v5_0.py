"""EXP_V51 — Micro-Mercados No Lineales `HGB-Poisson + GLM v5.0` + `Tarjetas Rojas` y `Booking Points`.

Supera las limitaciones de `EXP_V44 (v4.0)` bajo corte estricto `< 2025-02-02` (`holdout_sealed` intacto):
  1. Reemplaza el predictor puramente log-lineal por un ensamble en escala log-tasa entre `PoissonRegressor` (`GLM`)
     y `HistGradientBoostingRegressor(loss="poisson")` exportado como árboles compactos nativos a TypeScript
     (`evaluateMicroPoissonGbmExact` en `soccer_micro_markets.ts`), seleccionando `w_hgb` estrictamente en `VAL <= 2019`.
  2. Incorpora el mercado disciplinario **`red_cards` (`Over 0.5 Expulsiones / Sending Off`)** acoplado a:
       - Propensión histórica de expulsión de equipo y rival normalizada por liga (`t' < t`),
       - Amarillas esperadas del lado (`mu_yellow_side`, capturando dobles amarillas + intensidad física),
       - Rigor global de tarjetas rojas del árbitro (`eb_red_mult` con `kappa = 24`),
       - Presión de no favorito (`underdog_pressure`), `tightness` y `season_crunch`.
  3. Incorpora el mercado **`booking_points` (`10 * Amarillas + 25 * Rojas`, líneas `35.5, 45.5, 55.5`)**
     mediante convolución discreta exacta sobre unidades de 5 puntos acoplada con núcleo Sarmanov `(Y_tot, R_tot)`.
"""

from __future__ import annotations

import os

os.environ.setdefault("OMP_NUM_THREADS", "4")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")

from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import sys
from typing import Any

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import PoissonRegressor

EXP_DIR = Path(__file__).resolve().parent
REPO_ROOT = EXP_DIR.parents[3]
PRED_LAB_ROOT = REPO_ROOT / "research" / "prediction-lab"
EXP_V40_DIR = PRED_LAB_ROOT / "experiments" / "EXP_V40_soccer_micro_markets"
EXP_V44_DIR = PRED_LAB_ROOT / "experiments" / "EXP_V44_micro_markets_v4_0"
ARTIFACTS_DIR = EXP_DIR / "artifacts"

for _p in (str(REPO_ROOT), str(EXP_V40_DIR), str(EXP_V44_DIR), str(EXP_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from services.models import outlook_calibration as oc  # noqa: E402
from run_micro_markets_experiment import (  # noqa: E402
    BOOTSTRAP_SAMPLES,
    BOOTSTRAP_SEED,
    HOLDOUT_CUT_DATE,
    HOLDOUT_CUT_ISO,
    METRIC_SPECS,
    MIN_MODERN_SEASON,
    MODEL_SEED,
    OOS_MIN_SEASON,
    VAL_MAX_SEASON,
    _estimate_nb_dispersion_mom,
    line_probs_from_pmf,
    nb_pmf_exact,
    normalize_referee_name,
    paired_bootstrap_binary,
)
from run_micro_markets_v4_0 import (  # noqa: E402
    FEATURE_NAMES_V4_8,
    HANDICAP_LINES_BY_METRIC,
    _batch_sarmanov_over_and_1x2_probs,
    bivariate_sarmanov_summary_exact,
    build_centered_sarmanov_basis_exact,
)

MICRO_V5_MODEL_OUT = REPO_ROOT / "src" / "data" / "prediction" / "model_soccer_micro_v5_0_candidate.json"
MICRO_V5_SNAPSHOT_OUT = REPO_ROOT / "src" / "data" / "prediction" / "soccer_micro_v5_0_snapshot.json"
RESULTS_OUT = ARTIFACTS_DIR / "exp_v51_micro_markets_v5_0_results.json"
TRIAL_REGISTRY_OUT = EXP_DIR / "trial_registry_micro_v50.jsonl"

RED_FEATURE_NAMES_6: list[str] = [
    "log_venue_opp_adj_red_base",
    "log_expected_yellows_side",
    "underdog_pressure",
    "match_tightness_index",
    "season_crunch_tension",
    "log_global_referee_red_mult",
]
BOOKING_POINTS_LINES: list[float] = [35.5, 45.5, 55.5]


def serialize_poisson_hgb_regressor(reg: HistGradientBoostingRegressor) -> dict[str, Any]:
    """Serializa `HistGradientBoostingRegressor(loss='poisson')` al formato compacto leído por `soccer_micro_markets.ts`."""
    base_val = float(np.asarray(reg._baseline_prediction, dtype=np.float64).reshape(-1)[0])
    trees_out: list[dict[str, Any]] = []
    for iter_preds in reg._predictors:
        tp = iter_preds[0]
        nodes = tp.nodes
        is_leaf = [int(v) for v in nodes["is_leaf"].tolist()]
        trees_out.append(
            {
                "n_nodes": int(len(nodes)),
                "is_leaf": is_leaf,
                "feature_idx": [-1 if lf == 1 else int(f) for lf, f in zip(is_leaf, nodes["feature_idx"].tolist())],
                "num_threshold": [0.0 if lf == 1 else float(th) for lf, th in zip(is_leaf, nodes["num_threshold"].tolist())],
                "left": [0 if lf == 1 else int(l_i) for lf, l_i in zip(is_leaf, nodes["left"].tolist())],
                "right": [0 if lf == 1 else int(r_i) for lf, r_i in zip(is_leaf, nodes["right"].tolist())],
                "value": [float(val) if lf == 1 else 0.0 for lf, val in zip(is_leaf, nodes["value"].tolist())],
                "missing_go_to_left": [0 if lf == 1 else int(ml) for lf, ml in zip(is_leaf, nodes["missing_go_to_left"].tolist())],
            }
        )
    return {"baseline_prediction": base_val, "trees": trees_out}


def evaluate_poisson_gbm_eta_scalar(features: list[float], model: dict[str, Any]) -> float:
    """Espejo escalar exacto (`< 1e-15`) de `evaluateMicroPoissonGbmExact` en `soccer_micro_markets.ts`."""
    eta = float(model["baseline_prediction"])
    n_f = len(features)
    for tr in model["trees"]:
        is_leaf = tr["is_leaf"]
        f_idx = tr["feature_idx"]
        thr = tr["num_threshold"]
        left = tr["left"]
        right = tr["right"]
        val = tr["value"]
        miss_l = tr["missing_go_to_left"]
        node = 0
        while is_leaf[node] == 0:
            fi = f_idx[node]
            xv = float(features[fi]) if 0 <= fi < n_f else float("nan")
            if math.isnan(xv):
                node = left[node] if miss_l[node] != 0 else right[node]
            else:
                node = left[node] if xv <= thr[node] else right[node]
        eta += val[node]
    return eta


def _poisson_deviance_loss(y_true: np.ndarray, mu_pred: np.ndarray) -> float:
    mu_c = np.clip(mu_pred, 1e-6, 100.0)
    yt = np.maximum(y_true, 0.0)
    yt_safe = np.maximum(yt, 1e-12)
    term = np.where(yt > 0.0, yt * np.log(yt_safe / mu_c) - (yt - mu_c), mu_c)
    return float(2.0 * np.mean(term))


def build_booking_points_outlook_scalar(
    pmf_yel_tot: np.ndarray,
    mu_yel_tot: float,
    r_yel_eff: float,
    pmf_red_tot: np.ndarray,
    mu_red_tot: float,
    r_red_eff: float,
    omega_yr: float,
    lines: list[float],
) -> dict[str, Any]:
    """Espejo escalar exacto (`< 1e-15`) de `buildBookingPointsOutlookV5` en `soccer_micro_markets.ts`."""
    ny = len(pmf_yel_tot)
    nr = len(pmf_red_tot)
    phi_y = build_centered_sarmanov_basis_exact(pmf_yel_tot, mu_yel_tot, r_yel_eff)
    phi_r = build_centered_sarmanov_basis_exact(pmf_red_tot, mu_red_tot, r_red_eff)
    om = min(max(float(omega_yr), -0.85), 0.85)

    max_u5 = 2 * (ny - 1) + 5 * (nr - 1)
    pmf_u5 = np.zeros(max_u5 + 1, dtype=np.float64)
    tot_mass = 0.0

    for y in range(ny):
        py = float(pmf_yel_tot[y])
        if py <= 0.0:
            continue
        fy = float(phi_y[y])
        for r in range(nr):
            pr = float(pmf_red_tot[r])
            if pr <= 0.0:
                continue
            w = max(0.0, 1.0 + om * fy * float(phi_r[r]))
            pj = py * pr * w
            tot_mass += pj
            pmf_u5[2 * y + 5 * r] += pj

    inv_m = 1.0 / tot_mass if tot_mass > 0.0 else 1.0
    pmf_u5 *= inv_m
    exp_bp = float(sum(5.0 * u * float(pmf_u5[u]) for u in range(max_u5 + 1)))

    lines_out: dict[str, dict[str, float]] = {}
    for ln in lines:
        p_ov = 0.0
        p_un = 0.0
        p_ps = 0.0
        for u in range(max_u5 + 1):
            p = float(pmf_u5[u])
            if p <= 0.0:
                continue
            pts = 5.0 * float(u)
            if abs(pts - ln) < 1e-9:
                p_ps += p
            elif pts > ln:
                p_ov += p
            else:
                p_un += p
        act = p_ov + p_un
        po_c = min(max(p_ov / act, 0.001), 0.999) if act > 1e-12 else 0.5
        lines_out[str(ln)] = {"pOver": p_ov, "pUnder": p_un, "pPush": p_ps, "pOverCond": po_c}

    return {"expectedBookingPoints": exp_bp, "lines": lines_out}


def main() -> None:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    matches_path = PRED_LAB_ROOT / "data" / "processed" / "matches.parquet"
    features_path = PRED_LAB_ROOT / "data" / "processed" / "features.parquet"

    m_df = pd.read_parquet(matches_path)
    m_df["match_date_str"] = m_df["match_date"].astype(str).str.slice(0, 10)
    m_df = m_df[m_df["match_date_str"] < HOLDOUT_CUT_DATE].copy()
    if bool((m_df["match_date_str"] >= HOLDOUT_CUT_DATE).any()):
        raise RuntimeError("HoldoutSealedAccessError en EXP_V51")

    f_cols = pd.read_parquet(
        features_path,
        columns=["match_id", "dc_lam_home", "dc_lam_away", "elo_diff_no_hfa", "season_progress"],
    )
    m_df = m_df.merge(f_cols, on="match_id", how="left")
    m_df["sstart"] = pd.to_numeric(m_df["season_start"], errors="coerce").fillna(2000).astype(int)
    m_df = m_df.sort_values(["match_date_str", "kickoff_time", "match_id"], kind="mergesort").reset_index(drop=True)

    n_all = len(m_df)
    print(f"[EXP_V51] Partidos pre-holdout (< {HOLDOUT_CUT_DATE}): {n_all:,}")

    alpha_all = 2.0 / 19.0
    alpha_venue = 2.0 / 17.0
    alpha_div = 2.0 / 181.0
    alpha_red_tm = 2.0 / 31.0
    kappa_all = 8.0
    kappa_venue = 10.0
    kappa_ref_global = 14.0
    kappa_ref_red = 32.0
    kappa_red_tm = 65.0

    div_stat_ewm: dict[tuple[str, str], float] = {}
    tm_att_all: dict[tuple[str, str], float] = {}
    tm_def_all: dict[tuple[str, str], float] = {}
    tm_n_all: dict[tuple[str, str], int] = {}
    tm_att_home: dict[tuple[str, str], float] = {}
    tm_def_home: dict[tuple[str, str], float] = {}
    tm_n_home: dict[tuple[str, str], int] = {}
    tm_att_away: dict[tuple[str, str], float] = {}
    tm_def_away: dict[tuple[str, str], float] = {}
    tm_n_away: dict[tuple[str, str], int] = {}

    # Acumuladores causales `t' < t` específicos de Tarjetas Rojas (`reds_home`, `reds_away`)
    div_red_h_ewm: dict[str, float] = {}
    div_red_a_ewm: dict[str, float] = {}
    tm_red_for_ewm: dict[str, float] = {}
    tm_red_opp_ewm: dict[str, float] = {}
    tm_red_n: dict[str, int] = {}

    gref_yel_n: dict[str, int] = {}
    gref_yel_ratio_sum: dict[str, float] = {}
    gref_red_n: dict[str, int] = {}
    gref_red_ratio_sum: dict[str, float] = {}
    gref_fls_n: dict[str, int] = {}
    gref_fls_ratio_sum: dict[str, float] = {}
    gref_cpf_n: dict[str, int] = {}
    gref_cpf_ratio_sum: dict[str, float] = {}

    gf_ewm: dict[str, float] = {}
    ga_ewm: dict[str, float] = {}
    div_ht_share_ewm: dict[str, float] = {}

    blk_att_all: dict[str, float] = {}
    blk_def_all: dict[str, float] = {}
    blk_n_all: dict[str, int] = {}
    div_blk_h: dict[str, float] = {}
    div_blk_a: dict[str, float] = {}

    lam_h_arr = np.empty(n_all, dtype=np.float64)
    lam_a_arr = np.empty(n_all, dtype=np.float64)
    sprog_arr = pd.to_numeric(m_df["season_progress"], errors="coerce").fillna(0.5).to_numpy(dtype=np.float64)

    gref_yel_mult_arr = np.ones(n_all, dtype=np.float64)
    gref_red_mult_arr = np.ones(n_all, dtype=np.float64)
    gref_fls_mult_arr = np.ones(n_all, dtype=np.float64)
    gref_cpf_mult_arr = np.ones(n_all, dtype=np.float64)
    blk_ratio_h_arr = np.ones(n_all, dtype=np.float64)
    blk_ratio_a_arr = np.ones(n_all, dtype=np.float64)

    base_v4_h: dict[str, np.ndarray] = {q: np.empty(n_all, dtype=np.float64) for q in METRIC_SPECS}
    base_v4_a: dict[str, np.ndarray] = {q: np.empty(n_all, dtype=np.float64) for q in METRIC_SPECS}
    ratio_v4_h: dict[str, np.ndarray] = {q: np.ones(n_all, dtype=np.float64) for q in METRIC_SPECS}
    ratio_v4_a: dict[str, np.ndarray] = {q: np.ones(n_all, dtype=np.float64) for q in METRIC_SPECS}
    div_mean_h_arr: dict[str, np.ndarray] = {q: np.empty(n_all, dtype=np.float64) for q in METRIC_SPECS}
    div_mean_a_arr: dict[str, np.ndarray] = {q: np.empty(n_all, dtype=np.float64) for q in METRIC_SPECS}

    base_red_h_arr = np.full(n_all, 0.095, dtype=np.float64)
    base_red_a_arr = np.full(n_all, 0.125, dtype=np.float64)
    div_red_h_arr = np.full(n_all, 0.095, dtype=np.float64)
    div_red_a_arr = np.full(n_all, 0.125, dtype=np.float64)

    divs = m_df["div"].astype(str).to_numpy()
    homes = m_df["home_team"].astype(str).to_numpy()
    aways = m_df["away_team"].astype(str).to_numpy()
    refs = [normalize_referee_name(x) for x in m_df["referee"].tolist()]
    hg_vec = pd.to_numeric(m_df["home_goals"], errors="coerce").to_numpy(dtype=np.float64)
    ag_vec = pd.to_numeric(m_df["away_goals"], errors="coerce").to_numpy(dtype=np.float64)
    ht_hg_vec = pd.to_numeric(m_df["ht_home_goals"], errors="coerce").to_numpy(dtype=np.float64)
    ht_ag_vec = pd.to_numeric(m_df["ht_away_goals"], errors="coerce").to_numpy(dtype=np.float64)
    dc_lh_vec = pd.to_numeric(m_df["dc_lam_home"], errors="coerce").to_numpy(dtype=np.float64)
    dc_la_vec = pd.to_numeric(m_df["dc_lam_away"], errors="coerce").to_numpy(dtype=np.float64)
    reds_h_vec = pd.to_numeric(m_df["reds_home"], errors="coerce").to_numpy(dtype=np.float64)
    reds_a_vec = pd.to_numeric(m_df["reds_away"], errors="coerce").to_numpy(dtype=np.float64)

    obs_cols_h: dict[str, np.ndarray] = {}
    obs_cols_a: dict[str, np.ndarray] = {}
    for q, sp in METRIC_SPECS.items():
        obs_cols_h[q] = pd.to_numeric(m_df[sp["h_col"]], errors="coerce").to_numpy(dtype=np.float64)
        obs_cols_a[q] = pd.to_numeric(m_df[sp["a_col"]], errors="coerce").to_numpy(dtype=np.float64)

    for i in range(n_all):
        dv = divs[i]
        hk = f"{dv}::{homes[i]}"
        ak = f"{dv}::{aways[i]}"
        rf = refs[i]

        gfh = gf_ewm.get(hk, 1.45)
        gah = ga_ewm.get(hk, 1.18)
        gfa = gf_ewm.get(ak, 1.18)
        gaa = ga_ewm.get(ak, 1.45)
        fb_lh = min(max(0.5 * (gfh + gaa), 0.25), 4.5)
        fb_la = min(max(0.5 * (gfa + gah), 0.25), 4.5)
        lh = float(dc_lh_vec[i]) if math.isfinite(float(dc_lh_vec[i])) and dc_lh_vec[i] > 0.05 else fb_lh
        la = float(dc_la_vec[i]) if math.isfinite(float(dc_la_vec[i])) and dc_la_vec[i] > 0.05 else fb_la
        lam_h_arr[i] = lh
        lam_a_arr[i] = la

        div_yel_tot = div_stat_ewm.get((dv, "yellow_cards_h"), 1.85) + div_stat_ewm.get((dv, "yellow_cards_a"), 2.15)
        div_fls_tot = div_stat_ewm.get((dv, "fouls_h"), 11.80) + div_stat_ewm.get((dv, "fouls_a"), 12.20)
        div_cpf = div_yel_tot / max(div_fls_tot, 6.0)
        drh = div_red_h_ewm.get(dv, 0.095)
        dra = div_red_a_ewm.get(dv, 0.125)
        div_red_tot = drh + dra
        div_red_h_arr[i] = drh
        div_red_a_arr[i] = dra

        if rf:
            ny = gref_yel_n.get(rf, 0)
            if ny > 0:
                gref_yel_mult_arr[i] = min(max((gref_yel_ratio_sum[rf] + kappa_ref_global) / (ny + kappa_ref_global), 0.66), 1.45)
            nr_ref = gref_red_n.get(rf, 0)
            if nr_ref > 0:
                gref_red_mult_arr[i] = min(max((gref_red_ratio_sum[rf] + kappa_ref_red) / (nr_ref + kappa_ref_red), 0.65), 1.65)
            nf = gref_fls_n.get(rf, 0)
            if nf > 0:
                gref_fls_mult_arr[i] = min(max((gref_fls_ratio_sum[rf] + kappa_ref_global) / (nf + kappa_ref_global), 0.74), 1.34)
            nc = gref_cpf_n.get(rf, 0)
            if nc > 0:
                gref_cpf_mult_arr[i] = min(max((gref_cpf_ratio_sum[rf] + kappa_ref_global) / (nc + kappa_ref_global), 0.68), 1.44)

        # Base causal EB de rojas por lado
        nrh = tm_red_n.get(hk, 0)
        nra = tm_red_n.get(ak, 0)
        rf_h = (nrh * tm_red_for_ewm.get(hk, 1.0) + kappa_red_tm) / (nrh + kappa_red_tm)
        ro_h = (nrh * tm_red_opp_ewm.get(hk, 1.0) + kappa_red_tm) / (nrh + kappa_red_tm)
        rf_a = (nra * tm_red_for_ewm.get(ak, 1.0) + kappa_red_tm) / (nra + kappa_red_tm)
        ro_a = (nra * tm_red_opp_ewm.get(ak, 1.0) + kappa_red_tm) / (nra + kappa_red_tm)
        base_red_h_arr[i] = min(max(drh * (rf_h ** 0.65) * (ro_a ** 0.55), 0.015), 0.65)
        base_red_a_arr[i] = min(max(dra * (rf_a ** 0.65) * (ro_h ** 0.55), 0.015), 0.65)

        nb_h = blk_n_all.get(hk, 0)
        nb_a = blk_n_all.get(ak, 0)
        ba_h = (nb_h * blk_att_all.get(hk, 1.0) + kappa_all) / (nb_h + kappa_all)
        bd_h = (nb_h * blk_def_all.get(hk, 1.0) + kappa_all) / (nb_h + kappa_all)
        ba_a = (nb_a * blk_att_all.get(ak, 1.0) + kappa_all) / (nb_a + kappa_all)
        bd_a = (nb_a * blk_def_all.get(ak, 1.0) + kappa_all) / (nb_a + kappa_all)
        blk_ratio_h_arr[i] = min(max(math.sqrt(max(ba_h * bd_a, 0.15)), 0.45), 2.10)
        blk_ratio_a_arr[i] = min(max(math.sqrt(max(ba_a * bd_h, 0.15)), 0.45), 2.10)

        pre_att_eb: dict[tuple[str, str], float] = {}
        pre_def_eb: dict[tuple[str, str], float] = {}

        for q, sp in METRIC_SPECS.items():
            dh = div_stat_ewm.get((dv, f"{q}_h"), sp["default_h"])
            da = div_stat_ewm.get((dv, f"{q}_a"), sp["default_a"])
            div_mean_h_arr[q][i] = dh
            div_mean_a_arr[q][i] = da

            nh_all = tm_n_all.get((hk, q), 0)
            na_all = tm_n_all.get((ak, q), 0)
            nh_hm = tm_n_home.get((hk, q), 0)
            na_aw = tm_n_away.get((ak, q), 0)

            att_h_all_eb = (nh_all * tm_att_all.get((hk, q), 1.0) + kappa_all) / (nh_all + kappa_all)
            def_h_all_eb = (nh_all * tm_def_all.get((hk, q), 1.0) + kappa_all) / (nh_all + kappa_all)
            att_a_all_eb = (na_all * tm_att_all.get((ak, q), 1.0) + kappa_all) / (na_all + kappa_all)
            def_a_all_eb = (na_all * tm_def_all.get((ak, q), 1.0) + kappa_all) / (na_all + kappa_all)

            att_h_ven_eb = (nh_hm * tm_att_home.get((hk, q), 1.0) + kappa_venue) / (nh_hm + kappa_venue)
            def_h_ven_eb = (nh_hm * tm_def_home.get((hk, q), 1.0) + kappa_venue) / (nh_hm + kappa_venue)
            att_a_ven_eb = (na_aw * tm_att_away.get((ak, q), 1.0) + kappa_venue) / (na_aw + kappa_venue)
            def_a_ven_eb = (na_aw * tm_def_away.get((ak, q), 1.0) + kappa_venue) / (na_aw + kappa_venue)

            att_h_comb = 0.62 * att_h_all_eb + 0.38 * att_h_ven_eb
            def_h_comb = 0.62 * def_h_all_eb + 0.38 * def_h_ven_eb
            att_a_comb = 0.62 * att_a_all_eb + 0.38 * att_a_ven_eb
            def_a_comb = 0.62 * def_a_all_eb + 0.38 * def_a_ven_eb

            pre_att_eb[(hk, q)] = att_h_all_eb
            pre_def_eb[(hk, q)] = def_h_all_eb
            pre_att_eb[(ak, q)] = att_a_all_eb
            pre_def_eb[(ak, q)] = def_a_all_eb

            rh_mult = (max(att_h_comb, 0.25) ** 0.72) * (max(def_a_comb, 0.25) ** 0.62)
            ra_mult = (max(att_a_comb, 0.25) ** 0.72) * (max(def_h_comb, 0.25) ** 0.62)
            ratio_v4_h[q][i] = min(max(rh_mult, 0.40), 2.35)
            ratio_v4_a[q][i] = min(max(ra_mult, 0.40), 2.35)
            base_v4_h[q][i] = min(max(dh * ratio_v4_h[q][i], 0.15), 32.0)
            base_v4_a[q][i] = min(max(da * ratio_v4_a[q][i], 0.15), 32.0)

        # --- Post-match updates (`t' < t`) ---
        if math.isfinite(hg_vec[i]) and math.isfinite(ag_vec[i]):
            hg_v, ag_v = float(hg_vec[i]), float(ag_vec[i])
            gf_ewm[hk] = alpha_all * hg_v + (1.0 - alpha_all) * gf_ewm.get(hk, 1.45)
            ga_ewm[hk] = alpha_all * ag_v + (1.0 - alpha_all) * ga_ewm.get(hk, 1.18)
            gf_ewm[ak] = alpha_all * ag_v + (1.0 - alpha_all) * gf_ewm.get(ak, 1.18)
            ga_ewm[ak] = alpha_all * hg_v + (1.0 - alpha_all) * ga_ewm.get(ak, 1.45)
            if math.isfinite(ht_hg_vec[i]) and math.isfinite(ht_ag_vec[i]) and (hg_v + ag_v) > 0.0:
                obs_sh = min(max((float(ht_hg_vec[i]) + float(ht_ag_vec[i])) / (hg_v + ag_v), 0.0), 1.0)
                div_ht_share_ewm[dv] = alpha_div * obs_sh + (1.0 - alpha_div) * div_ht_share_ewm.get(dv, 0.442)

        if math.isfinite(reds_h_vec[i]) and math.isfinite(reds_a_vec[i]) and reds_h_vec[i] >= 0.0 and reds_a_vec[i] >= 0.0:
            rh_o = float(reds_h_vec[i])
            ra_o = float(reds_a_vec[i])
            r_rh = min(max(rh_o / max(drh, 0.03), 0.0), 6.0)
            r_ra = min(max(ra_o / max(dra, 0.03), 0.0), 6.0)
            tm_red_for_ewm[hk] = alpha_red_tm * r_rh + (1.0 - alpha_red_tm) * tm_red_for_ewm.get(hk, 1.0)
            tm_red_opp_ewm[hk] = alpha_red_tm * r_ra + (1.0 - alpha_red_tm) * tm_red_opp_ewm.get(hk, 1.0)
            tm_red_for_ewm[ak] = alpha_red_tm * r_ra + (1.0 - alpha_red_tm) * tm_red_for_ewm.get(ak, 1.0)
            tm_red_opp_ewm[ak] = alpha_red_tm * r_rh + (1.0 - alpha_red_tm) * tm_red_opp_ewm.get(ak, 1.0)
            tm_red_n[hk] = tm_red_n.get(hk, 0) + 1
            tm_red_n[ak] = tm_red_n.get(ak, 0) + 1
            div_red_h_ewm[dv] = alpha_div * rh_o + (1.0 - alpha_div) * drh
            div_red_a_ewm[dv] = alpha_div * ra_o + (1.0 - alpha_div) * dra
            if rf:
                gref_red_n[rf] = gref_red_n.get(rf, 0) + 1
                gref_red_ratio_sum[rf] = gref_red_ratio_sum.get(rf, 0.0) + min(max((rh_o + ra_o) / max(div_red_tot, 0.08), 0.0), 6.0)

        sh_hv, sh_av = obs_cols_h["shots"][i], obs_cols_a["shots"][i]
        st_hv, st_av = obs_cols_h["shots_on_target"][i], obs_cols_a["shots_on_target"][i]
        if math.isfinite(sh_hv) and math.isfinite(sh_av) and math.isfinite(st_hv) and math.isfinite(st_av):
            bh_obs = max(0.0, float(sh_hv) - float(st_hv))
            ba_obs = max(0.0, float(sh_av) - float(st_av))
            dbh = div_blk_h.get(dv, 8.75)
            dba = div_blk_a.get(dv, 7.05)
            rh_b = min(max(bh_obs / max(dbh, 1.0), 0.2), 3.0)
            ra_b = min(max(ba_obs / max(dba, 1.0), 0.2), 3.0)
            blk_att_all[hk] = alpha_all * rh_b + (1.0 - alpha_all) * blk_att_all.get(hk, 1.0)
            blk_def_all[hk] = alpha_all * ra_b + (1.0 - alpha_all) * blk_def_all.get(hk, 1.0)
            blk_att_all[ak] = alpha_all * ra_b + (1.0 - alpha_all) * blk_att_all.get(ak, 1.0)
            blk_def_all[ak] = alpha_all * rh_b + (1.0 - alpha_all) * blk_def_all.get(ak, 1.0)
            blk_n_all[hk] = blk_n_all.get(hk, 0) + 1
            blk_n_all[ak] = blk_n_all.get(ak, 0) + 1
            div_blk_h[dv] = alpha_div * bh_obs + (1.0 - alpha_div) * dbh
            div_blk_a[dv] = alpha_div * ba_obs + (1.0 - alpha_div) * dba

        yel_tot_obs = float("nan")
        fls_tot_obs = float("nan")
        for q, sp in METRIC_SPECS.items():
            vh = obs_cols_h[q][i]
            va = obs_cols_a[q][i]
            if math.isfinite(vh) and math.isfinite(va) and vh >= 0.0 and va >= 0.0:
                vh_f, va_f = float(vh), float(va)
                dh_cur = div_stat_ewm.get((dv, f"{q}_h"), sp["default_h"])
                da_cur = div_stat_ewm.get((dv, f"{q}_a"), sp["default_a"])
                opp_def_for_h = math.sqrt(max(pre_def_eb[(ak, q)], 0.4))
                opp_att_for_h = math.sqrt(max(pre_att_eb[(ak, q)], 0.4))
                opp_def_for_a = math.sqrt(max(pre_def_eb[(hk, q)], 0.4))
                opp_att_for_a = math.sqrt(max(pre_att_eb[(hk, q)], 0.4))

                r_att_h = min(max((vh_f / max(dh_cur, 0.25)) / opp_def_for_h, 0.15), 3.20)
                r_def_h = min(max((va_f / max(da_cur, 0.25)) / opp_att_for_h, 0.15), 3.20)
                r_att_a = min(max((va_f / max(da_cur, 0.25)) / opp_def_for_a, 0.15), 3.20)
                r_def_a = min(max((vh_f / max(dh_cur, 0.25)) / opp_att_for_a, 0.15), 3.20)

                tm_att_all[(hk, q)] = alpha_all * r_att_h + (1.0 - alpha_all) * tm_att_all.get((hk, q), 1.0)
                tm_def_all[(hk, q)] = alpha_all * r_def_h + (1.0 - alpha_all) * tm_def_all.get((hk, q), 1.0)
                tm_att_all[(ak, q)] = alpha_all * r_att_a + (1.0 - alpha_all) * tm_att_all.get((ak, q), 1.0)
                tm_def_all[(ak, q)] = alpha_all * r_def_a + (1.0 - alpha_all) * tm_def_all.get((ak, q), 1.0)
                tm_n_all[(hk, q)] = tm_n_all.get((hk, q), 0) + 1
                tm_n_all[(ak, q)] = tm_n_all.get((ak, q), 0) + 1

                tm_att_home[(hk, q)] = alpha_venue * r_att_h + (1.0 - alpha_venue) * tm_att_home.get((hk, q), 1.0)
                tm_def_home[(hk, q)] = alpha_venue * r_def_h + (1.0 - alpha_venue) * tm_def_home.get((hk, q), 1.0)
                tm_n_home[(hk, q)] = tm_n_home.get((hk, q), 0) + 1

                tm_att_away[(ak, q)] = alpha_venue * r_att_a + (1.0 - alpha_venue) * tm_att_away.get((ak, q), 1.0)
                tm_def_away[(ak, q)] = alpha_venue * r_def_a + (1.0 - alpha_venue) * tm_def_away.get((ak, q), 1.0)
                tm_n_away[(ak, q)] = tm_n_away.get((ak, q), 0) + 1

                div_stat_ewm[(dv, f"{q}_h")] = alpha_div * vh_f + (1.0 - alpha_div) * dh_cur
                div_stat_ewm[(dv, f"{q}_a")] = alpha_div * va_f + (1.0 - alpha_div) * da_cur

                if q == "yellow_cards":
                    yel_tot_obs = vh_f + va_f
                elif q == "fouls":
                    fls_tot_obs = vh_f + va_f

        if rf:
            if math.isfinite(yel_tot_obs):
                gref_yel_n[rf] = gref_yel_n.get(rf, 0) + 1
                gref_yel_ratio_sum[rf] = gref_yel_ratio_sum.get(rf, 0.0) + min(max(yel_tot_obs / max(div_yel_tot, 0.8), 0.1), 3.5)
            if math.isfinite(fls_tot_obs):
                gref_fls_n[rf] = gref_fls_n.get(rf, 0) + 1
                gref_fls_ratio_sum[rf] = gref_fls_ratio_sum.get(rf, 0.0) + min(max(fls_tot_obs / max(div_fls_tot, 6.0), 0.3), 2.5)
            if math.isfinite(yel_tot_obs) and math.isfinite(fls_tot_obs) and fls_tot_obs >= 6.0:
                gref_cpf_n[rf] = gref_cpf_n.get(rf, 0) + 1
                gref_cpf_ratio_sum[rf] = gref_cpf_ratio_sum.get(rf, 0.0) + min(max((yel_tot_obs / fls_tot_obs) / max(div_cpf, 0.05), 0.2), 3.2)

    sup_h = lam_h_arr - lam_a_arr
    sup_a = -sup_h
    siege_h = np.maximum(0.0, sup_h) ** 1.4 - 0.5 * (np.maximum(0.0, -sup_h) ** 1.2)
    siege_a = np.maximum(0.0, sup_a) ** 1.4 - 0.5 * (np.maximum(0.0, -sup_a) ** 1.2)
    tempo_exc = (lam_h_arr + lam_a_arr) - 2.65
    tightness = np.exp(-np.abs(sup_h)) - 0.55
    season_crunch = np.maximum(0.0, sprog_arr - 0.70) * np.exp(-np.abs(sup_h))
    sstart = m_df["sstart"].to_numpy(dtype=int)

    def _build_8_features(q: str) -> tuple[np.ndarray, np.ndarray]:
        log_bh = np.log(np.maximum(base_v4_h[q], 0.12))
        log_ba = np.log(np.maximum(base_v4_a[q], 0.12))
        if q == "corners":
            cr_h, cr_a, rf_v = np.log(blk_ratio_h_arr), np.log(blk_ratio_a_arr), np.zeros(n_all, dtype=np.float64)
        elif q == "yellow_cards":
            cr_h = np.log(np.clip(ratio_v4_h["fouls"] * gref_cpf_mult_arr, 0.35, 2.80))
            cr_a = np.log(np.clip(ratio_v4_a["fouls"] * gref_cpf_mult_arr, 0.35, 2.80))
            rf_v = np.log(gref_yel_mult_arr)
        elif q == "fouls":
            cr_h, cr_a, rf_v = np.log(ratio_v4_a["shots"]), np.log(ratio_v4_h["shots"]), np.log(gref_fls_mult_arr)
        elif q == "shots_on_target":
            cr_h, cr_a, rf_v = np.log(ratio_v4_h["shots"]), np.log(ratio_v4_a["shots"]), np.zeros(n_all, dtype=np.float64)
        else:
            cr_h, cr_a, rf_v = np.log(ratio_v4_h["corners"]), np.log(ratio_v4_a["corners"]), np.zeros(n_all, dtype=np.float64)

        Xh = np.column_stack([log_bh, sup_h, siege_h, tempo_exc, tightness, cr_h, season_crunch, rf_v])
        Xa = np.column_stack([log_ba, sup_a, siege_a, tempo_exc, tightness, cr_a, season_crunch, rf_v])
        return Xh, Xa

    hgb_params = {
        "loss": "poisson",
        "max_depth": 3,
        "max_leaf_nodes": 9,
        "min_samples_leaf": 240,
        "learning_rate": 0.04,
        "max_iter": 60,
        "l2_regularization": 15.0,
        "early_stopping": False,
        "random_state": MODEL_SEED,
    }

    v4_art_prev = json.loads((REPO_ROOT / "src" / "data" / "prediction" / "model_soccer_micro_v4_0_candidate.json").read_text(encoding="utf-8"))
    metric_models_v5: dict[str, Any] = {}
    eval_summary_v5: dict[str, Any] = {}
    cached_X: dict[str, tuple[np.ndarray, np.ndarray]] = {}
    yel_mu_h_full_arr = np.copy(base_v4_h["yellow_cards"])
    yel_mu_a_full_arr = np.copy(base_v4_a["yellow_cards"])

    for q, sp in METRIC_SPECS.items():
        Xh_all, Xa_all = _build_8_features(q)
        cached_X[q] = (Xh_all, Xa_all)
        yh = obs_cols_h[q]
        ya = obs_cols_a[q]
        valid = (sstart >= MIN_MODERN_SEASON) & np.isfinite(yh) & np.isfinite(ya) & (yh >= 0.0) & (ya >= 0.0)
        idx_v = np.where(valid)[0]
        ss_v = sstart[idx_v]
        yh_v = yh[idx_v]
        ya_v = ya[idx_v]
        ytot_v = yh_v + ya_v
        Xh_v = Xh_all[idx_v]
        Xa_v = Xa_all[idx_v]

        val_m = ss_v <= VAL_MAX_SEASON
        oos_m = ss_v >= OOS_MIN_SEASON
        sub_tr = ss_v <= 2017
        sub_vl = (ss_v >= 2018) & (ss_v <= 2019)

        best_alpha = 0.02
        best_mse = float("inf")
        for a_try in (0.005, 0.02, 0.10):
            mh_t = PoissonRegressor(alpha=a_try, max_iter=600).fit(Xh_v[sub_tr], yh_v[sub_tr]).predict(Xh_v[sub_vl])
            ma_t = PoissonRegressor(alpha=a_try, max_iter=600).fit(Xa_v[sub_tr], ya_v[sub_tr]).predict(Xa_v[sub_vl])
            mse_t = float(np.mean(((mh_t + ma_t) - ytot_v[sub_vl]) ** 2))
            if mse_t < best_mse:
                best_mse = mse_t
                best_alpha = a_try

        # Seleccionar peso `w_hgb` en escala log-tasa estrictamente en `2018..2019` (`VAL <= 2019`)
        glm_h_sub = PoissonRegressor(alpha=best_alpha, max_iter=600).fit(Xh_v[sub_tr], yh_v[sub_tr])
        glm_a_sub = PoissonRegressor(alpha=best_alpha, max_iter=600).fit(Xa_v[sub_tr], ya_v[sub_tr])
        hgb_h_sub = HistGradientBoostingRegressor(**hgb_params).fit(Xh_v[sub_tr], np.maximum(yh_v[sub_tr], 0.0))
        hgb_a_sub = HistGradientBoostingRegressor(**hgb_params).fit(Xa_v[sub_tr], np.maximum(ya_v[sub_tr], 0.0))

        eta_gh_vl = np.log(np.clip(glm_h_sub.predict(Xh_v[sub_vl]), 0.12, 40.0))
        eta_ga_vl = np.log(np.clip(glm_a_sub.predict(Xa_v[sub_vl]), 0.12, 40.0))
        eta_hh_vl = np.log(np.clip(hgb_h_sub.predict(Xh_v[sub_vl]), 0.12, 40.0))
        eta_ha_vl = np.log(np.clip(hgb_a_sub.predict(Xa_v[sub_vl]), 0.12, 40.0))

        best_wh = 0.0
        best_dev_h = float("inf")
        for w_try in (0.0, 0.15, 0.30, 0.45, 0.65):
            dv_h = _poisson_deviance_loss(yh_v[sub_vl], np.exp((1.0 - w_try) * eta_gh_vl + w_try * eta_hh_vl))
            if dv_h < best_dev_h - 1e-6:
                best_dev_h = dv_h
                best_wh = w_try

        best_wa = 0.0
        best_dev_a = float("inf")
        for w_try in (0.0, 0.15, 0.30, 0.45, 0.65):
            dv_a = _poisson_deviance_loss(ya_v[sub_vl], np.exp((1.0 - w_try) * eta_ga_vl + w_try * eta_ha_vl))
            if dv_a < best_dev_a - 1e-6:
                best_dev_a = dv_a
                best_wa = w_try

        r_h = float(v4_art_prev["metrics"][q]["dispersion_r_home"])
        r_a = float(v4_art_prev["metrics"][q]["dispersion_r_away"])
        best_omega = float(v4_art_prev["metrics"][q]["copula_omega"])
        cline = float(sp["canonical_total_line"])
        max_k = int(sp["max_k_side"])

        # Walk-forward anual `s < yr -> yr` en `OOS 2020..2024`: `v5.0 (HGB+GLM)` vs `v4.0 (GLM)`
        n_oos = int(np.sum(oos_m))
        mu5_h_oos = np.empty(n_oos, dtype=np.float64)
        mu5_a_oos = np.empty(n_oos, dtype=np.float64)
        mu4_h_oos = np.empty(n_oos, dtype=np.float64)
        mu4_a_oos = np.empty(n_oos, dtype=np.float64)

        pos = 0
        for yr in sorted(set(int(x) for x in ss_v[oos_m].tolist())):
            tr_f = ss_v < yr
            te_f = ss_v == yr
            cnt = int(np.sum(te_f))
            if cnt == 0:
                continue
            gh = PoissonRegressor(alpha=best_alpha, max_iter=600).fit(Xh_v[tr_f], yh_v[tr_f])
            ga = PoissonRegressor(alpha=best_alpha, max_iter=600).fit(Xa_v[tr_f], ya_v[tr_f])
            m4h = np.clip(gh.predict(Xh_v[te_f]), 0.15, 35.0)
            m4a = np.clip(ga.predict(Xa_v[te_f]), 0.15, 35.0)
            mu4_h_oos[pos : pos + cnt] = m4h
            mu4_a_oos[pos : pos + cnt] = m4a

            if best_wh > 0.0:
                hh = HistGradientBoostingRegressor(**hgb_params).fit(Xh_v[tr_f], np.maximum(yh_v[tr_f], 0.0))
                eh = (1.0 - best_wh) * (Xh_v[te_f] @ gh.coef_ + gh.intercept_) + best_wh * np.log(np.clip(hh.predict(Xh_v[te_f]), 1e-4, 60.0))
                mu5_h_oos[pos : pos + cnt] = np.clip(np.exp(eh), 0.15, 35.0)
            else:
                mu5_h_oos[pos : pos + cnt] = m4h

            if best_wa > 0.0:
                ha = HistGradientBoostingRegressor(**hgb_params).fit(Xa_v[tr_f], np.maximum(ya_v[tr_f], 0.0))
                ea = (1.0 - best_wa) * (Xa_v[te_f] @ ga.coef_ + ga.intercept_) + best_wa * np.log(np.clip(ha.predict(Xa_v[te_f]), 1e-4, 60.0))
                mu5_a_oos[pos : pos + cnt] = np.clip(np.exp(ea), 0.15, 35.0)
            else:
                mu5_a_oos[pos : pos + cnt] = m4a
            pos += cnt

        y_over_oos = (ytot_v[oos_m] > cline).astype(np.float64)
        p_over_v5, _ = _batch_sarmanov_over_and_1x2_probs(mu5_h_oos, mu5_a_oos, r_h, r_a, max_k, best_omega, cline)
        p_over_v4, _ = _batch_sarmanov_over_and_1x2_probs(mu4_h_oos, mu4_a_oos, r_h, r_a, max_k, best_omega, cline)
        p_over_clim, _ = _batch_sarmanov_over_and_1x2_probs(div_mean_h_arr[q][idx_v[oos_m]], div_mean_a_arr[q][idx_v[oos_m]], r_h, r_a, max_k, 0.0, cline)

        boot_v5_vs_v4 = paired_bootstrap_binary(y_over_oos, p_over_v5, p_over_v4)
        boot_v5_vs_clim = paired_bootstrap_binary(y_over_oos, p_over_v5, p_over_clim)
        mae_v5 = float(np.mean(np.abs((mu5_h_oos + mu5_a_oos) - ytot_v[oos_m])))
        mae_v4 = float(np.mean(np.abs((mu4_h_oos + mu4_a_oos) - ytot_v[oos_m])))

        print(
            f"  [{q:15s}] OOS n={n_oos:,} | w_hgb=({best_wh:.2f},{best_wa:.2f}) | MAE: v4.0={mae_v4:.4f} -> v5.0={mae_v5:.4f} | "
            f"dLL vs v4.0={boot_v5_vs_v4['delta_ll']:+.5f} ({boot_v5_vs_v4['significance']}) | "
            f"dLL vs Clim={boot_v5_vs_clim['delta_ll']:+.5f} ({boot_v5_vs_clim['significance']})"
        )

        # Ajuste final `< 2025-02-02` y verificación exacta de serialización de árboles Poisson
        pr_h_full = PoissonRegressor(alpha=best_alpha, max_iter=600).fit(Xh_v, yh_v)
        pr_a_full = PoissonRegressor(alpha=best_alpha, max_iter=600).fit(Xa_v, ya_v)
        hgb_h_full = HistGradientBoostingRegressor(**hgb_params).fit(Xh_v, np.maximum(yh_v, 0.0))
        hgb_a_full = HistGradientBoostingRegressor(**hgb_params).fit(Xa_v, np.maximum(ya_v, 0.0))
        ser_h = serialize_poisson_hgb_regressor(hgb_h_full)
        ser_a = serialize_poisson_hgb_regressor(hgb_a_full)

        # Paridad árbol serializado vs sklearn (`< 1e-12`)
        for chk_i in range(min(25, len(Xh_v))):
            p_sk = float(hgb_h_full.predict(Xh_v[chk_i : chk_i + 1])[0])
            p_sr = math.exp(evaluate_poisson_gbm_eta_scalar(Xh_v[chk_i].tolist(), ser_h))
            if abs(p_sk - p_sr) > 1e-11:
                raise RuntimeError(f"Error de serialización HGB-Poisson en {q}: |{p_sk} - {p_sr}|")

        if q == "yellow_cards":
            eh_all = (1.0 - best_wh) * (Xh_all @ pr_h_full.coef_ + pr_h_full.intercept_) + (
                best_wh * np.log(np.clip(hgb_h_full.predict(Xh_all), 1e-4, 60.0)) if best_wh > 0.0 else 0.0
            )
            ea_all = (1.0 - best_wa) * (Xa_all @ pr_a_full.coef_ + pr_a_full.intercept_) + (
                best_wa * np.log(np.clip(hgb_a_full.predict(Xa_all), 1e-4, 60.0)) if best_wa > 0.0 else 0.0
            )
            yel_mu_h_full_arr = np.clip(np.exp(eh_all), 0.15, 35.0)
            yel_mu_a_full_arr = np.clip(np.exp(ea_all), 0.15, 35.0)

        metric_models_v5[q] = {
            **v4_art_prev["metrics"][q],
            "home_coef": [float(v) for v in pr_h_full.coef_.tolist()],
            "home_intercept": float(pr_h_full.intercept_),
            "away_coef": [float(v) for v in pr_a_full.coef_.tolist()],
            "away_intercept": float(pr_a_full.intercept_),
            "w_hgb_home": best_wh,
            "w_hgb_away": best_wa,
            "home_hgb": ser_h,
            "away_hgb": ser_a,
        }
        eval_summary_v5[q] = {
            "n_oos": n_oos,
            "w_hgb_home": best_wh,
            "w_hgb_away": best_wa,
            "mae_v5_0": round(mae_v5, 4),
            "mae_v4_0": round(mae_v4, 4),
            "vs_v4_0": boot_v5_vs_v4,
            "vs_climatology": boot_v5_vs_clim,
        }

    # =========================================================================
    # 2. Nuevos Mercados Disciplinarios v5.0: `red_cards` (`Over 0.5`) y `booking_points` (`35.5 / 45.5 / 55.5`)
    # =========================================================================
    yh_yel = obs_cols_h["yellow_cards"]
    ya_yel = obs_cols_a["yellow_cards"]
    valid_disc = (
        (sstart >= MIN_MODERN_SEASON)
        & np.isfinite(reds_h_vec)
        & np.isfinite(reds_a_vec)
        & (reds_h_vec >= 0.0)
        & (reds_a_vec >= 0.0)
        & np.isfinite(yh_yel)
        & np.isfinite(ya_yel)
    )
    idx_d = np.where(valid_disc)[0]
    ss_d = sstart[idx_d]
    val_d = ss_d <= VAL_MAX_SEASON
    oos_d = ss_d >= OOS_MIN_SEASON

    # Amarillas esperadas causales walk-forward para alimentar `red_cards` sin fuga
    Xh_yel_d = cached_X["yellow_cards"][0][idx_d]
    Xa_yel_d = cached_X["yellow_cards"][1][idx_d]
    yh_yel_d = yh_yel[idx_d]
    ya_yel_d = ya_yel[idx_d]
    mu_yel_h_wf = np.copy(base_v4_h["yellow_cards"][idx_d])
    mu_yel_a_wf = np.copy(base_v4_a["yellow_cards"][idx_d])

    for yr in sorted(set(int(x) for x in ss_d.tolist() if int(x) >= 2014)):
        tr_y = ss_d < yr
        te_y = ss_d == yr
        if int(np.sum(tr_y)) < 500 or int(np.sum(te_y)) == 0:
            continue
        gy_h = PoissonRegressor(alpha=0.02, max_iter=600).fit(Xh_yel_d[tr_y], yh_yel_d[tr_y])
        gy_a = PoissonRegressor(alpha=0.02, max_iter=600).fit(Xa_yel_d[tr_y], ya_yel_d[tr_y])
        mu_yel_h_wf[te_y] = np.clip(gy_h.predict(Xh_yel_d[te_y]), 0.25, 15.0)
        mu_yel_a_wf[te_y] = np.clip(gy_a.predict(Xa_yel_d[te_y]), 0.25, 15.0)

    X_red_h = np.column_stack(
        [
            np.log(np.maximum(base_red_h_arr[idx_d], 0.015)),
            np.log(np.maximum(mu_yel_h_wf, 0.25)),
            np.maximum(0.0, -sup_h[idx_d]),
            tightness[idx_d],
            season_crunch[idx_d],
            np.log(gref_red_mult_arr[idx_d]),
        ]
    )
    X_red_a = np.column_stack(
        [
            np.log(np.maximum(base_red_a_arr[idx_d], 0.015)),
            np.log(np.maximum(mu_yel_a_wf, 0.25)),
            np.maximum(0.0, sup_h[idx_d]),
            tightness[idx_d],
            season_crunch[idx_d],
            np.log(gref_red_mult_arr[idx_d]),
        ]
    )
    rh_d = reds_h_vec[idx_d]
    ra_d = reds_a_vec[idx_d]
    rtot_d = rh_d + ra_d

    # Seleccionar `alpha_red` en `VAL <= 2019` (`2012..2017 -> 2018..2019`) sin sobre-penalizar el offset de liga (`coef[0]`)
    red_sub_tr = ss_d <= 2017
    red_sub_vl = (ss_d >= 2018) & (ss_d <= 2019)
    best_alpha_red = 0.001
    best_red_dev = float("inf")
    for ar_try in (0.0003, 0.001, 0.004, 0.015):
        sw_r_sub = 0.5 ** ((2017.0 - ss_d[red_sub_tr].astype(np.float64)) / 4.5)
        mrh_t = PoissonRegressor(alpha=ar_try, max_iter=800).fit(X_red_h[red_sub_tr], rh_d[red_sub_tr], sample_weight=sw_r_sub).predict(X_red_h[red_sub_vl])
        mra_t = PoissonRegressor(alpha=ar_try, max_iter=800).fit(X_red_a[red_sub_tr], ra_d[red_sub_tr], sample_weight=sw_r_sub).predict(X_red_a[red_sub_vl])
        dv_r = _poisson_deviance_loss(rtot_d[red_sub_vl], mrh_t + mra_t)
        if dv_r < best_red_dev:
            best_red_dev = dv_r
            best_alpha_red = ar_try

    sw_val_d = 0.5 ** ((2019.0 - ss_d[val_d].astype(np.float64)) / 4.5)
    pr_rh_val = PoissonRegressor(alpha=best_alpha_red, max_iter=800).fit(X_red_h[val_d], rh_d[val_d], sample_weight=sw_val_d)
    pr_ra_val = PoissonRegressor(alpha=best_alpha_red, max_iter=800).fit(X_red_a[val_d], ra_d[val_d], sample_weight=sw_val_d)
    mu_rh_val = np.clip(pr_rh_val.predict(X_red_h[val_d]), 0.01, 1.5)
    mu_ra_val = np.clip(pr_ra_val.predict(X_red_a[val_d]), 0.01, 1.5)
    r_red_h = min(max(_estimate_nb_dispersion_mom(rh_d[val_d], mu_rh_val), 1.2), 25.0)
    r_red_a = min(max(_estimate_nb_dispersion_mom(ra_d[val_d], mu_ra_val), 1.2), 25.0)

    # Calibrar `omega_red` (contagio de expulsiones entre equipos) y `omega_yr` (acoplamiento amarillas-rojas) en `VAL <= 2019`
    best_om_red = 0.08
    best_red_ll = float("inf")
    y_red_val_bin = (rtot_d[val_d] > 0.5).astype(np.float64)
    for om_r_try in (0.0, 0.06, 0.12, 0.20):
        po_rv, _ = _batch_sarmanov_over_and_1x2_probs(mu_rh_val, mu_ra_val, r_red_h, r_red_a, 4, om_r_try, 0.5)
        po_rc = np.clip(po_rv, 1e-12, 1.0 - 1e-12)
        ll_r = float(-np.mean(y_red_val_bin * np.log(po_rc) + (1.0 - y_red_val_bin) * np.log(1.0 - po_rc)))
        if ll_r < best_red_ll:
            best_red_ll = ll_r
            best_om_red = om_r_try

    # Calibrar `omega_yr` sobre `Booking Points Over 45.5` en `2018..2019` (`VAL <= 2019`)
    vl_sub = val_d & (ss_d >= 2018)
    bp_obs_d = 10.0 * (yh_yel_d + ya_yel_d) + 25.0 * rtot_d
    r_yel_eff = 0.5 * (metric_models_v5["yellow_cards"]["dispersion_r_home"] + metric_models_v5["yellow_cards"]["dispersion_r_away"])
    r_red_eff = 0.5 * (r_red_h + r_red_a)
    om_yel = float(metric_models_v5["yellow_cards"]["copula_omega"])

    best_om_yr = 0.16
    best_bp_ll = float("inf")
    vl_indices = np.where(vl_sub)[0]
    for om_yr_try in (0.0, 0.10, 0.18, 0.28):
        p_bp45_list: list[float] = []
        for ii in vl_indices:
            by = bivariate_sarmanov_summary_exact(float(mu_yel_h_wf[ii]), float(mu_yel_a_wf[ii]), metric_models_v5["yellow_cards"]["dispersion_r_home"], metric_models_v5["yellow_cards"]["dispersion_r_away"], 12, om_yel, [])
            br = bivariate_sarmanov_summary_exact(float(pr_rh_val.predict(X_red_h[ii : ii + 1])[0]), float(pr_ra_val.predict(X_red_a[ii : ii + 1])[0]), r_red_h, r_red_a, 4, best_om_red, [])
            bp_o = build_booking_points_outlook_scalar(
                by["pmf_total"],
                float(mu_yel_h_wf[ii] + mu_yel_a_wf[ii]),
                r_yel_eff,
                br["pmf_total"],
                float(pr_rh_val.predict(X_red_h[ii : ii + 1])[0] + pr_ra_val.predict(X_red_a[ii : ii + 1])[0]),
                r_red_eff,
                om_yr_try,
                [45.5],
            )
            p_bp45_list.append(bp_o["lines"]["45.5"]["pOver"])
        yb_v = (bp_obs_d[vl_indices] > 45.5).astype(np.float64)
        pb_v = np.clip(np.array(p_bp45_list, dtype=np.float64), 1e-12, 1.0 - 1e-12)
        ll_b = float(-np.mean(yb_v * np.log(pb_v) + (1.0 - yb_v) * np.log(1.0 - pb_v)))
        if ll_b < best_bp_ll:
            best_bp_ll = ll_b
            best_om_yr = om_yr_try

    # Walk-forward `OOS 2020..2024` de `red_cards` y `booking_points`
    n_oos_d = int(np.sum(oos_d))
    mu_rh_oos = np.empty(n_oos_d, dtype=np.float64)
    mu_ra_oos = np.empty(n_oos_d, dtype=np.float64)
    pos = 0
    for yr in sorted(set(int(x) for x in ss_d[oos_d].tolist())):
        tr_f = ss_d < yr
        te_f = ss_d == yr
        cnt = int(np.sum(te_f))
        sw_yr = 0.5 ** ((float(yr - 1) - ss_d[tr_f].astype(np.float64)) / 4.5)
        pr_h_y = PoissonRegressor(alpha=best_alpha_red, max_iter=800).fit(X_red_h[tr_f], rh_d[tr_f], sample_weight=sw_yr)
        pr_a_y = PoissonRegressor(alpha=best_alpha_red, max_iter=800).fit(X_red_a[tr_f], ra_d[tr_f], sample_weight=sw_yr)
        mu_rh_oos[pos : pos + cnt] = np.clip(pr_h_y.predict(X_red_h[te_f]), 0.01, 1.5)
        mu_ra_oos[pos : pos + cnt] = np.clip(pr_a_y.predict(X_red_a[te_f]), 0.01, 1.5)
        pos += cnt

    y_red_oos = (rtot_d[oos_d] > 0.5).astype(np.float64)
    p_red_v5, _ = _batch_sarmanov_over_and_1x2_probs(mu_rh_oos, mu_ra_oos, r_red_h, r_red_a, 4, best_om_red, 0.5)
    p_red_clim, _ = _batch_sarmanov_over_and_1x2_probs(div_red_h_arr[idx_d[oos_d]], div_red_a_arr[idx_d[oos_d]], r_red_h, r_red_a, 4, 0.0, 0.5)
    ev_red_vs_clim = paired_bootstrap_binary(y_red_oos, p_red_v5, p_red_clim)

    # Booking points OOS (`35.5, 45.5, 55.5`) vs Climatología de Liga
    oos_d_indices = np.where(oos_d)[0]
    p_bp_v5_map: dict[float, np.ndarray] = {ln: np.empty(n_oos_d, dtype=np.float64) for ln in BOOKING_POINTS_LINES}
    p_bp_clim_map: dict[float, np.ndarray] = {ln: np.empty(n_oos_d, dtype=np.float64) for ln in BOOKING_POINTS_LINES}

    dh_yel_oos = div_mean_h_arr["yellow_cards"][idx_d[oos_d]]
    da_yel_oos = div_mean_a_arr["yellow_cards"][idx_d[oos_d]]
    drh_oos = div_red_h_arr[idx_d[oos_d]]
    dra_oos = div_red_a_arr[idx_d[oos_d]]
    uy_h_oos = mu_yel_h_wf[oos_d]
    uy_a_oos = mu_yel_a_wf[oos_d]

    for k_i in range(n_oos_d):
        by5 = bivariate_sarmanov_summary_exact(float(uy_h_oos[k_i]), float(uy_a_oos[k_i]), metric_models_v5["yellow_cards"]["dispersion_r_home"], metric_models_v5["yellow_cards"]["dispersion_r_away"], 12, om_yel, [])
        br5 = bivariate_sarmanov_summary_exact(float(mu_rh_oos[k_i]), float(mu_ra_oos[k_i]), r_red_h, r_red_a, 4, best_om_red, [])
        bp5 = build_booking_points_outlook_scalar(by5["pmf_total"], float(uy_h_oos[k_i] + uy_a_oos[k_i]), r_yel_eff, br5["pmf_total"], float(mu_rh_oos[k_i] + mu_ra_oos[k_i]), r_red_eff, best_om_yr, BOOKING_POINTS_LINES)

        byc = bivariate_sarmanov_summary_exact(float(dh_yel_oos[k_i]), float(da_yel_oos[k_i]), metric_models_v5["yellow_cards"]["dispersion_r_home"], metric_models_v5["yellow_cards"]["dispersion_r_away"], 12, 0.0, [])
        brc = bivariate_sarmanov_summary_exact(float(drh_oos[k_i]), float(dra_oos[k_i]), r_red_h, r_red_a, 4, 0.0, [])
        bpc = build_booking_points_outlook_scalar(byc["pmf_total"], float(dh_yel_oos[k_i] + da_yel_oos[k_i]), r_yel_eff, brc["pmf_total"], float(drh_oos[k_i] + dra_oos[k_i]), r_red_eff, 0.0, BOOKING_POINTS_LINES)

        for ln in BOOKING_POINTS_LINES:
            p_bp_v5_map[ln][k_i] = bp5["lines"][str(ln)]["pOver"]
            p_bp_clim_map[ln][k_i] = bpc["lines"][str(ln)]["pOver"]

    bp_oos_obs = bp_obs_d[oos_d]
    bp_evals: dict[str, Any] = {}
    for ln in BOOKING_POINTS_LINES:
        ev_ln = paired_bootstrap_binary((bp_oos_obs > ln).astype(np.float64), p_bp_v5_map[ln], p_bp_clim_map[ln])
        bp_evals[str(ln)] = ev_ln

    print(
        f"\n=== EXP_V51 NEW DISCIPLINARY MARKETS OOS (2020..2024, n={n_oos_d:,}) ===\n"
        f"  Red Cards Over 0.5: LL={ev_red_vs_clim['log_loss']:.5f} (ECE={ev_red_vs_clim['ece']:.5f}) | "
        f"dLL vs League Clim={ev_red_vs_clim['delta_ll']:+.5f} ({ev_red_vs_clim['significance']})\n"
        f"  Booking Points Over 35.5: dLL vs Clim={bp_evals['35.5']['delta_ll']:+.5f} ({bp_evals['35.5']['significance']}) | ECE={bp_evals['35.5']['ece']:.5f}\n"
        f"  Booking Points Over 45.5: dLL vs Clim={bp_evals['45.5']['delta_ll']:+.5f} ({bp_evals['45.5']['significance']}) | ECE={bp_evals['45.5']['ece']:.5f}\n"
        f"  Booking Points Over 55.5: dLL vs Clim={bp_evals['55.5']['delta_ll']:+.5f} ({bp_evals['55.5']['significance']}) | ECE={bp_evals['55.5']['ece']:.5f}"
    )

    # Ajuste final `red_cards_model` sobre `< 2025-02-02`
    X_red_h_full = np.column_stack(
        [
            np.log(np.maximum(base_red_h_arr[idx_d], 0.015)),
            np.log(np.maximum(yel_mu_h_full_arr[idx_d], 0.25)),
            np.maximum(0.0, -sup_h[idx_d]),
            tightness[idx_d],
            season_crunch[idx_d],
            np.log(gref_red_mult_arr[idx_d]),
        ]
    )
    X_red_a_full = np.column_stack(
        [
            np.log(np.maximum(base_red_a_arr[idx_d], 0.015)),
            np.log(np.maximum(yel_mu_a_full_arr[idx_d], 0.25)),
            np.maximum(0.0, sup_h[idx_d]),
            tightness[idx_d],
            season_crunch[idx_d],
            np.log(gref_red_mult_arr[idx_d]),
        ]
    )
    sw_full_d = 0.5 ** ((float(np.max(ss_d)) - ss_d.astype(np.float64)) / 4.5)
    pr_rh_full = PoissonRegressor(alpha=best_alpha_red, max_iter=800).fit(X_red_h_full, rh_d, sample_weight=sw_full_d)
    pr_ra_full = PoissonRegressor(alpha=best_alpha_red, max_iter=800).fit(X_red_a_full, ra_d, sample_weight=sw_full_d)
    hgb_rh_full = HistGradientBoostingRegressor(**hgb_params).fit(X_red_h_full, rh_d)
    hgb_ra_full = HistGradientBoostingRegressor(**hgb_params).fit(X_red_a_full, ra_d)

    red_model_spec = {
        "default_home_rate": 0.095,
        "default_away_rate": 0.125,
        "dispersion_r_home": round(r_red_h, 6),
        "dispersion_r_away": round(r_red_a, 6),
        "max_k_side": 4,
        "copula_omega": best_om_red,
        "booking_points_omega_yr": best_om_yr,
        "booking_points_lines": BOOKING_POINTS_LINES,
        "feature_names": RED_FEATURE_NAMES_6,
        "home_coef": [float(v) for v in pr_rh_full.coef_.tolist()],
        "home_intercept": float(pr_rh_full.intercept_),
        "away_coef": [float(v) for v in pr_ra_full.coef_.tolist()],
        "away_intercept": float(pr_ra_full.intercept_),
        "w_hgb_home": 0.0,
        "w_hgb_away": 0.0,
        "home_hgb": serialize_poisson_hgb_regressor(hgb_rh_full),
        "away_hgb": serialize_poisson_hgb_regressor(hgb_ra_full),
    }

    div_priors_v5: dict[str, Any] = {}
    for dv_k, dp_v in v4_art_prev["div_priors"].items():
        div_priors_v5[dv_k] = {
            **dp_v,
            "red_cards": {
                "home_mean": round(div_red_h_ewm.get(dv_k, 0.095), 5),
                "away_mean": round(div_red_a_ewm.get(dv_k, 0.125), 5),
            },
        }

    model_v5_art = {
        "schema_version": "soccer_micro_markets_v5.0.0",
        "codename": "PitchLab Non-Linear HGB-Poisson & Disciplinary Micro-Markets v5.0",
        "version": "5.0.0-candidate",
        "status": "candidate",
        "production_activated": False,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "halves_config": v4_art_prev["halves_config"],
        "div_priors": div_priors_v5,
        "metrics": metric_models_v5,
        "red_cards_model": red_model_spec,
    }
    MICRO_V5_MODEL_OUT.write_text(json.dumps(model_v5_art, separators=(",", ":")), encoding="utf-8")

    # Snapshot de paridad `< 1e-12` (`60` partidos OOS reales verificando HGB-Poisson + Red Cards + Booking Points)
    rng = np.random.default_rng(MODEL_SEED)
    oos_global_idx = idx_d[oos_d]
    chosen_rows = np.sort(rng.choice(oos_global_idx, size=min(60, len(oos_global_idx)), replace=False))
    snap_rows: list[dict[str, Any]] = []

    for ri in chosen_rows:
        r_row = m_df.iloc[ri]
        dv = str(r_row["div"])
        lh_i = min(max(float(lam_h_arr[ri]), 0.05), 8.0)
        la_i = min(max(float(lam_a_arr[ri]), 0.05), 8.0)
        feats_by_m: dict[str, Any] = {}
        expected_m: dict[str, Any] = {}
        yel_pmf_tot = None
        yel_tot_mu = 0.0

        for q in METRIC_SPECS:
            sp5 = metric_models_v5[q]
            xh8 = [round(float(x), 8) for x in cached_X[q][0][ri].tolist()]
            xa8 = [round(float(x), 8) for x in cached_X[q][1][ri].tolist()]
            feats_by_m[q] = {"homeFeatures8": xh8, "awayFeatures8": xa8}

            eg_h = float(sp5["home_intercept"]) + sum(float(sp5["home_coef"][j]) * xh8[j] for j in range(8))
            eg_a = float(sp5["away_intercept"]) + sum(float(sp5["away_coef"][j]) * xa8[j] for j in range(8))
            eh_h = evaluate_poisson_gbm_eta_scalar(xh8, sp5["home_hgb"]) if sp5["w_hgb_home"] > 0.0 else eg_h
            eh_a = evaluate_poisson_gbm_eta_scalar(xa8, sp5["away_hgb"]) if sp5["w_hgb_away"] > 0.0 else eg_a
            mh = min(max(math.exp((1.0 - sp5["w_hgb_home"]) * eg_h + sp5["w_hgb_home"] * eh_h), 0.15), 35.0)
            ma = min(max(math.exp((1.0 - sp5["w_hgb_away"]) * eg_a + sp5["w_hgb_away"] * eh_a), 0.15), 35.0)

            biv = bivariate_sarmanov_summary_exact(mh, ma, sp5["dispersion_r_home"], sp5["dispersion_r_away"], sp5["max_k_side"], sp5["copula_omega"], sp5["handicap_lines"])
            if q == "yellow_cards":
                yel_pmf_tot = biv["pmf_total"]
                yel_tot_mu = mh + ma
            po_c, _, _ = line_probs_from_pmf(biv["pmf_total"], sp5["canonical_total_line"])
            expected_m[q] = {"mu_home": mh, "mu_away": ma, "p_over_canonical": po_c}

        # Red cards default features (`buildSoccerMicroMatchOutlookV5` sin `redCardFeatures` explícito)
        dp_red = div_priors_v5.get(dv, {}).get("red_cards", {})
        brh = float(dp_red.get("home_mean", red_model_spec["default_home_rate"]))
        bra = float(dp_red.get("away_mean", red_model_spec["default_away_rate"]))
        sup_hi = lh_i - la_i
        tight_i = math.exp(-abs(sup_hi)) - 0.55
        crunch_i = feats_by_m["yellow_cards"]["homeFeatures8"][6]
        lref_i = feats_by_m["yellow_cards"]["homeFeatures8"][7]
        rf_h6 = [math.log(max(brh, 0.015)), math.log(max(expected_m["yellow_cards"]["mu_home"], 0.25)), max(0.0, -sup_hi), tight_i, crunch_i, lref_i]
        rf_a6 = [math.log(max(bra, 0.015)), math.log(max(expected_m["yellow_cards"]["mu_away"], 0.25)), max(0.0, sup_hi), tight_i, crunch_i, lref_i]

        er_h = float(red_model_spec["home_intercept"]) + sum(float(red_model_spec["home_coef"][j]) * rf_h6[j] for j in range(6))
        er_a = float(red_model_spec["away_intercept"]) + sum(float(red_model_spec["away_coef"][j]) * rf_a6[j] for j in range(6))
        mrh = min(max(math.exp(er_h), 0.01), 1.5)
        mra = min(max(math.exp(er_a), 0.01), 1.5)
        biv_r = bivariate_sarmanov_summary_exact(mrh, mra, red_model_spec["dispersion_r_home"], red_model_spec["dispersion_r_away"], 4, red_model_spec["copula_omega"], [-0.5, 0.5])
        pr_match = min(max(line_probs_from_pmf(biv_r["pmf_total"], 0.5)[0], 0.001), 0.999)
        assert yel_pmf_tot is not None
        bp_out = build_booking_points_outlook_scalar(yel_pmf_tot, yel_tot_mu, r_yel_eff, biv_r["pmf_total"], mrh + mra, r_red_eff, best_om_yr, BOOKING_POINTS_LINES)

        snap_rows.append(
            {
                "match_id": str(r_row["match_id"]),
                "div": dv,
                "home_team": str(r_row["home_team"]),
                "away_team": str(r_row["away_team"]),
                "lam_home": lh_i,
                "lam_away": la_i,
                "features_by_metric": feats_by_m,
                "expected_metrics": expected_m,
                "expected_red_cards": {
                    "mu_home": mrh,
                    "mu_away": mra,
                    "p_red_card_match": pr_match,
                },
                "expected_booking_points": {
                    "expected_bp": bp_out["expectedBookingPoints"],
                    "p_over_45_5": bp_out["lines"]["45.5"]["pOver"],
                },
            }
        )

    MICRO_V5_SNAPSHOT_OUT.write_text(
        json.dumps({"schema_version": "soccer_micro_v5.0_parity_snapshot", "holdout_sealed_untouched": True, "n": len(snap_rows), "rows": snap_rows}, indent=2),
        encoding="utf-8",
    )

    results_payload = {
        "experiment_id": "EXP_V51_micro_markets_v5_0",
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "oos_metrics_v5_vs_v4": eval_summary_v5,
        "oos_red_cards_over_0_5_vs_climatology": ev_red_vs_clim,
        "oos_booking_points_vs_climatology": bp_evals,
        "selected_booking_points_omega_yr": best_om_yr,
        "artifacts": {
            "model_soccer_micro_v5_0_sha256": hashlib.sha256(MICRO_V5_MODEL_OUT.read_bytes()).hexdigest(),
        },
    }
    RESULTS_OUT.write_text(json.dumps(results_payload, indent=2), encoding="utf-8")

    with TRIAL_REGISTRY_OUT.open("a", encoding="utf-8") as fh:
        fh.write(
            json.dumps(
                {
                    "recorded_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "experiment_id": "EXP_V51_micro_markets_v5_0",
                    "holdout_touched": False,
                    "red_cards_dll_vs_clim": round(ev_red_vs_clim["delta_ll"], 6),
                    "bp_45_5_dll_vs_clim": round(bp_evals["45.5"]["delta_ll"], 6),
                }
            )
            + "\n"
        )
    print(f"[DONE] EXP_V51 guardado en {RESULTS_OUT.name}")


if __name__ == "__main__":
    main()
