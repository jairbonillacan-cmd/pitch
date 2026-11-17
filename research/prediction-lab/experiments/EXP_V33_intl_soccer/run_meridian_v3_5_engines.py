"""EXP_V38 — Mejora arquitectónica integral de Selecciones Nacionales (`PitchLab Meridian v3.5`):
  1. `PitchLab Meridian v3.5 Ensemble` (`1X2`):
     - Evaluación causal `walk_forward_dev` (`2010..2024`, `< 2025-02-02`, `n = 12,904`) seleccionando
       exclusivamente en `VAL 2010..2019` (`n = 8,690`) entre `v2.0 (49)` / `v3.0 (53)` y ensamble
       calibrado `Logit + HistGradientBoosting` (`gbm_intl_soccer_v3_5_candidate.json`).
  2. `Meridian Horizon-Goals v3.5` (`Totals 1.5/2.5/3.5`, `BTTS`, `AH`, `Top Scorelines`):
     - Regresor `Poisson` (`log` link) sobre el entorno de goles internacional + solver coherente
       Dixon-Coles de 3 parámetros `(lamHome*, lamAway*, rho_eff)` (`model_intl_goals_v3_5_candidate.json`),
       preservando exactamente `1X2` mientras alinea `lamHome* + lamAway*` con el total esperado real.
"""

from __future__ import annotations

import os

os.environ.setdefault("OMP_NUM_THREADS", "4")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("LOKY_MAX_CPU_COUNT", "4")

from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import sys
from typing import Any

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import PoissonRegressor
from sklearn.preprocessing import StandardScaler

EXP_DIR = Path(__file__).resolve().parent
REPO_ROOT = EXP_DIR.parents[3]
EXP_V37_DIR = REPO_ROOT / "research" / "prediction-lab" / "experiments" / "EXP_V37_club_v3_5_engines"

for _p in (str(REPO_ROOT), str(EXP_DIR), str(EXP_V37_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from services.models import export_gbm_ts as eg  # noqa: E402
from services.models import outlook_calibration as oc  # noqa: E402

from horizon_dc_solver import (  # noqa: E402
    DEFAULT_MAX_GOALS,
    build_dc_score_matrix_exact,
    predict_poisson_log_link_exact,
    solve_coherent_dc_3param,
    solve_coherent_dc_3param_batch,
    solve_dc_2param_from_1x2,
    summarize_dc_markets_batch,
    summarize_dc_markets_from_matrix,
)
from intl_causal_features import INTL_BASE_38_FEATURES, REGIME_DC_RHO  # noqa: E402
from intl_ingest import (  # noqa: E402
    ARTIFACTS_DIR,
    FIRST_EVAL_YEAR,
    HOLDOUT_CUT_DATE,
    HOLDOUT_CUT_ISO,
    INTL_DIV_LEVELS,
    MODERN_TRAIN_MIN_YEAR,
    VAL_MAX_YEAR,
    load_intl_matches_dev,
)
from run_ablation_v2 import ALL_V2_EXTRA_COLS, TRIAL_REGISTRY_OUT, build_intl_v2_causal_dataset  # noqa: E402
from run_experiment import (  # noqa: E402
    BOOTSTRAP_SAMPLES,
    BOOTSTRAP_SEED,
    DATA_PRED_DIR,
    MODEL_SEED,
    compute_elo_baseline_probs,
    fit_logit_bundle,
    predict_logit_bundle_exact,
)
from run_meridian_v3_experiment import attach_wave2_intl_features  # noqa: E402

PROB_LOG_FLOOR = 1e-15

INTL_V2_49_COLS: tuple[str, ...] = INTL_BASE_38_FEATURES + ALL_V2_EXTRA_COLS
INTL_V3_SELECTED_4_COLS: tuple[str, ...] = (
    "tm_elite_cup_90s_diff",
    "tm_match_fit_share_diff",
    "wb_log10_pop_diff",
    "wb_log10_gdp_pc_diff",
)
INTL_V3_53_COLS: tuple[str, ...] = INTL_V2_49_COLS + INTL_V3_SELECTED_4_COLS

# Subconjunto simétrico extraído directamente de `INTL_V2_49_COLS` (+ 2 términos derivados deterministas)
INTL_GOALS_SOURCE_COLS: tuple[str, ...] = (
    "dc_exp_total",
    "elo_closeness",
    "abs_elo_mismatch",
    "att_strength_home",
    "def_strength_home",
    "att_strength_away",
    "def_strength_away",
    "draw_rate_sum_r10",
    "goal_env_sum_r10",
    "inter_confed_flag",
    "is_neutral_pure",
    "effective_hfa",
    "altitude_diff_m",
    "tm_pool_cov_min",
)

INTL_GOALS_16_BASE_COLS: tuple[str, ...] = INTL_GOALS_SOURCE_COLS + (
    "abs_elo_mismatch_sq",
    "att_plus_def_sum",
)

GBM_INTL_V35_OUT = DATA_PRED_DIR / "gbm_intl_soccer_v3_5_candidate.json"
GOALS_INTL_V35_OUT = DATA_PRED_DIR / "model_intl_goals_v3_5_candidate.json"
SNAP_INTL_V35_OUT = DATA_PRED_DIR / "intl_soccer_v3_5_snapshot.json"
RESULTS_INTL_V35_OUT = ARTIFACTS_DIR / "exp_v38_meridian_v3_5_results.json"


def _apply_temperature_3way_exact(probs: np.ndarray, temperature: float) -> np.ndarray:
    if abs(float(temperature) - 1.0) < 1e-12:
        return np.asarray(probs, dtype=np.float64)
    inv_t = 1.0 / float(temperature)
    lg = np.log(np.maximum(np.asarray(probs, dtype=np.float64), PROB_LOG_FLOOR)) * inv_t
    lg -= np.max(lg, axis=1, keepdims=True)
    ez = np.exp(lg)
    return ez / np.sum(ez, axis=1, keepdims=True)


def _blend_3way_exact(
    probs_logit: np.ndarray,
    probs_gbm_cal: np.ndarray,
    w_logit: float,
    w_gbm: float,
    blend_space: str,
) -> np.ndarray:
    pl = np.asarray(probs_logit, dtype=np.float64)
    pg = np.asarray(probs_gbm_cal, dtype=np.float64)
    if blend_space == "logit":
        lg = float(w_logit) * np.log(np.maximum(pl, PROB_LOG_FLOOR)) + float(w_gbm) * np.log(
            np.maximum(pg, PROB_LOG_FLOOR)
        )
        lg -= np.max(lg, axis=1, keepdims=True)
        ez = np.exp(lg)
        return ez / np.sum(ez, axis=1, keepdims=True)
    raw = float(w_logit) * pl + float(w_gbm) * pg
    return raw / np.sum(raw, axis=1, keepdims=True)


def extract_intl_goals_features_from_v2_matrix(X_v2_49: np.ndarray) -> np.ndarray:
    """Extrae de forma determinista las `16` features base del modelo de goles desde las `49` de Meridian v2.0."""
    idx_map = {nm: i for i, nm in enumerate(INTL_V2_49_COLS)}
    src = np.column_stack([X_v2_49[:, idx_map[nm]] for nm in INTL_GOALS_SOURCE_COLS])
    abs_mm = X_v2_49[:, idx_map["abs_elo_mismatch"]]
    att_h = X_v2_49[:, idx_map["att_strength_home"]]
    def_h = X_v2_49[:, idx_map["def_strength_home"]]
    att_a = X_v2_49[:, idx_map["att_strength_away"]]
    def_a = X_v2_49[:, idx_map["def_strength_away"]]
    mm_sq = np.minimum(abs_mm * abs_mm, 16.0)
    att_def_sum = (att_h + def_a) + (att_a + def_h)
    return np.column_stack([src, mm_sq, att_def_sum])


def _estimate_causal_regime_rho(
    hg_tr: np.ndarray,
    ag_tr: np.ndarray,
    lh_tr: np.ndarray,
    la_tr: np.ndarray,
    regimes_tr: np.ndarray,
) -> dict[str, float]:
    valid = np.isfinite(lh_tr) & np.isfinite(la_tr) & (lh_tr > 0.05) & (la_tr > 0.05)
    hg_v, ag_v, lh_v, la_v, rg_v = hg_tr[valid], ag_tr[valid], lh_tr[valid], la_tr[valid], regimes_tr[valid]
    obs_low_draw = ((hg_v == 0) & (ag_v == 0)) | ((hg_v == 1) & (ag_v == 1))
    exp_low_draw = np.exp(-(lh_v + la_v)) * (1.0 + lh_v * la_v)
    sens = 2.0 * lh_v * la_v * np.exp(-(lh_v + la_v))

    out: dict[str, float] = {}
    for rg in INTL_DIV_LEVELS:
        prior_r = float(REGIME_DC_RHO.get(rg, -0.10))
        m = rg_v == rg
        n_m = float(np.sum(m))
        if n_m < 40.0:
            out[rg] = round(prior_r, 5)
            continue
        diff_s = float(np.sum(obs_low_draw[m].astype(np.float64) - exp_low_draw[m]))
        sens_s = float(np.sum(sens[m]))
        raw_r = max(-0.22, min(0.02, -diff_s / max(sens_s, 1.0)))
        shrunk = (n_m * raw_r + 250.0 * prior_r) / (n_m + 250.0)
        out[rg] = round(float(max(-0.20, min(-0.02, shrunk))), 5)
    return out


def main() -> None:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    dev_matches_df, _ = load_intl_matches_dev(force_download=False)
    v2_df, _ = build_intl_v2_causal_dataset(
        dev_matches_df,
        enforce_before_holdout=True,
        max_source_date_exclusive=HOLDOUT_CUT_DATE,
    )
    v3_df, _, _ = attach_wave2_intl_features(
        v2_df,
        max_date_exclusive=HOLDOUT_CUT_DATE,
        max_wb_year_inclusive=2024,
    )
    modern_df = v3_df[v3_df["year"] >= MODERN_TRAIN_MIN_YEAR].copy().reset_index(drop=True)
    if bool((modern_df["date_str"].astype(str).str[:10] >= HOLDOUT_CUT_DATE).any()):
        raise RuntimeError("HoldoutSealedAccessError en modern_df")

    div_levels = list(INTL_DIV_LEVELS)
    reg_vals = modern_df["div"].astype(str).to_numpy()
    dummies_all = np.column_stack([(reg_vals == lvl).astype(np.float64) for lvl in div_levels])
    years = modern_df["year"].to_numpy(dtype=int)
    y_all = modern_df["y"].to_numpy(dtype=np.int64)
    hg_all = pd.to_numeric(modern_df["home_goals"], errors="coerce").to_numpy(dtype=np.float64)
    ag_all = pd.to_numeric(modern_df["away_goals"], errors="coerce").to_numpy(dtype=np.float64)
    tot_all = hg_all + ag_all
    dates_ts = pd.to_datetime(modern_df["date_str"].astype(str).str[:10], format="%Y-%m-%d")

    X_v2_base = modern_df[list(INTL_V2_49_COLS)].to_numpy(dtype=np.float64)
    X_v3_base = modern_df[list(INTL_V3_53_COLS)].to_numpy(dtype=np.float64)
    X_v1_base = modern_df[list(INTL_BASE_38_FEATURES)].to_numpy(dtype=np.float64)
    X_goals_base = extract_intl_goals_features_from_v2_matrix(X_v2_base)

    hgb_params = {
        "loss": "log_loss",
        "max_depth": 3,
        "max_leaf_nodes": 9,
        "min_samples_leaf": 90,
        "learning_rate": 0.035,
        "max_iter": 115,
        "l2_regularization": 12.0,
        "early_stopping": False,
        "random_state": MODEL_SEED,
    }

    eval_years = sorted(set(years[years >= FIRST_EVAL_YEAR]))
    oof_v1: list[np.ndarray] = []
    oof_v2: list[np.ndarray] = []
    oof_v3: list[np.ndarray] = []
    oof_hgb_v2_raw: list[np.ndarray] = []
    oof_hgb_v3_raw: list[np.ndarray] = []
    oof_pois_by_alpha: dict[float, list[np.ndarray]] = {0.01: [], 0.05: [], 0.20: []}
    oof_reg_rho: list[np.ndarray] = []
    meta_parts: list[pd.DataFrame] = []

    for yr in eval_years:
        tr_m = years < yr
        ev_m = years == yr
        if not np.any(tr_m) or not np.any(ev_m):
            continue
        max_dt = dates_ts[tr_m].max()
        sw = 0.5 ** ((max_dt - dates_ts[tr_m]).dt.days.to_numpy(dtype=np.float64) / 4380.0)

        X1_tr = np.hstack([X_v1_base[tr_m], dummies_all[tr_m]])
        X1_ev = np.hstack([X_v1_base[ev_m], dummies_all[ev_m]])
        imp1, sc1, lr1 = fit_logit_bundle(X1_tr, y_all[tr_m], 0.02, sw)
        oof_v1.append(predict_logit_bundle_exact(imp1, sc1, lr1, X1_ev))

        X2_tr = np.hstack([X_v2_base[tr_m], dummies_all[tr_m]])
        X2_ev = np.hstack([X_v2_base[ev_m], dummies_all[ev_m]])
        imp2, sc2, lr2 = fit_logit_bundle(X2_tr, y_all[tr_m], 0.02, sw)
        oof_v2.append(predict_logit_bundle_exact(imp2, sc2, lr2, X2_ev))

        X3_tr = np.hstack([X_v3_base[tr_m], dummies_all[tr_m]])
        X3_ev = np.hstack([X_v3_base[ev_m], dummies_all[ev_m]])
        imp3, sc3, lr3 = fit_logit_bundle(X3_tr, y_all[tr_m], 0.02, sw)
        oof_v3.append(predict_logit_bundle_exact(imp3, sc3, lr3, X3_ev))

        hgb2 = HistGradientBoostingClassifier(**hgb_params)
        hgb2.fit(X2_tr, y_all[tr_m], sample_weight=sw)
        oof_hgb_v2_raw.append(hgb2.predict_proba(X2_ev))

        hgb3 = HistGradientBoostingClassifier(**hgb_params)
        hgb3.fit(X3_tr, y_all[tr_m], sample_weight=sw)
        oof_hgb_v3_raw.append(hgb3.predict_proba(X3_ev))

        Xg_tr = np.hstack([X_goals_base[tr_m], dummies_all[tr_m]])
        Xg_ev = np.hstack([X_goals_base[ev_m], dummies_all[ev_m]])
        imp_g = SimpleImputer(strategy="median").fit(Xg_tr)
        Xg_tr_i = imp_g.transform(Xg_tr)
        Xg_ev_i = imp_g.transform(Xg_ev)
        sc_g = StandardScaler().fit(Xg_tr_i)
        sc_g.scale_ = np.where(sc_g.scale_ == 0.0, 1.0, sc_g.scale_)
        Zg_tr = sc_g.transform(Xg_tr_i)
        Zg_ev = sc_g.transform(Xg_ev_i)

        for a_val in oof_pois_by_alpha:
            pr = PoissonRegressor(alpha=a_val, max_iter=1000)
            pr.fit(Zg_tr, np.clip(tot_all[tr_m], 0.0, 16.0), sample_weight=sw)
            eta_ev = np.clip(float(pr.intercept_) + Zg_ev @ pr.coef_, math.log(0.45), math.log(7.50))
            oof_pois_by_alpha[a_val].append(np.exp(eta_ev))

        lh_tr_dc = modern_df.loc[tr_m, "dc_lam_home"].to_numpy(dtype=np.float64)
        la_tr_dc = modern_df.loc[tr_m, "dc_lam_away"].to_numpy(dtype=np.float64)
        r_map = _estimate_causal_regime_rho(hg_all[tr_m], ag_all[tr_m], lh_tr_dc, la_tr_dc, reg_vals[tr_m])
        oof_reg_rho.append(np.array([r_map.get(rg, -0.10) for rg in reg_vals[ev_m]], dtype=np.float64))

        meta_parts.append(
            modern_df.loc[
                ev_m,
                ["match_id", "date_str", "year", "div", "y", "home_goals", "away_goals", "elo_diff_eff", "dc_lam_home", "dc_lam_away"],
            ].copy()
        )

    oof_meta = pd.concat(meta_parts, ignore_index=True)
    y_oof = oof_meta["y"].to_numpy(dtype=np.int64)
    val_m = oof_meta["year"].to_numpy(dtype=int) <= VAL_MAX_YEAR
    rec_m = oof_meta["year"].to_numpy(dtype=int) >= 2020

    P_v1 = np.vstack(oof_v1)
    P_v2 = np.vstack(oof_v2)
    P_v3 = np.vstack(oof_v3)
    P_hgb2_raw = np.vstack(oof_hgb_v2_raw)
    P_hgb3_raw = np.vstack(oof_hgb_v3_raw)
    T_pois_map = {a: np.concatenate(v) for a, v in oof_pois_by_alpha.items()}
    rho_reg_oof = np.concatenate(oof_reg_rho)
    P_elo = compute_elo_baseline_probs(oof_meta["elo_diff_eff"].to_numpy(dtype=np.float64))

    # Selección estricta en `VAL 2010..2019` para `1X2` (`v2 49` vs `v3 53` + `T` + `w_gbm`)
    best_cfg = None
    best_val_1x2 = float("inf")
    val_1x2_grid: dict[str, float] = {}

    for feat_tag, P_log_k, P_hgb_rk in (("v2_49", P_v2, P_hgb2_raw), ("v3_53", P_v3, P_hgb3_raw)):
        t_best_k = min(
            (0.90, 1.0, 1.08, 1.15, 1.25, 1.35),
            key=lambda t: float(
                np.mean(oc.compute_categorical_log_loss_vec(_apply_temperature_3way_exact(P_hgb_rk[val_m], t), y_oof[val_m]))
            ),
        )
        P_hgb_ck = _apply_temperature_3way_exact(P_hgb_rk, t_best_k)
        for b_sp in ("logit", "probability"):
            for wg in (0.0, 0.10, 0.18, 0.25, 0.35):
                wl = round(1.0 - wg, 6)
                p_try = _blend_3way_exact(P_log_k[val_m], P_hgb_ck[val_m], wl, wg, b_sp)
                ll_try = float(np.mean(oc.compute_categorical_log_loss_vec(p_try, y_oof[val_m])))
                val_1x2_grid[f"{feat_tag}:{b_sp}:T={t_best_k}:w_gbm={wg:.2f}"] = round(ll_try, 6)
                if ll_try < best_val_1x2 - 1e-7:
                    best_val_1x2 = ll_try
                    best_cfg = (feat_tag, t_best_k, b_sp, wl, wg, P_log_k, P_hgb_ck)

    assert best_cfg is not None
    chosen_tag, best_temp, best_bspace, best_wl, best_wg, P_log_sel, P_hgb_sel = best_cfg
    chosen_cols = INTL_V3_53_COLS if chosen_tag == "v3_53" else INTL_V2_49_COLS
    P_v35_ens = _blend_3way_exact(P_log_sel, P_hgb_sel, best_wl, best_wg, best_bspace)

    ll_v1_vec = oc.compute_categorical_log_loss_vec(P_v1, y_oof)
    ll_v2_vec = oc.compute_categorical_log_loss_vec(P_v2, y_oof)
    ll_elo_vec = oc.compute_categorical_log_loss_vec(P_elo, y_oof)

    ev_v35_vs_v1 = oc.evaluate_calibration_with_bootstrap(
        P_v35_ens, y_oof, benchmark_ll_vec=ll_v1_vec, n_resamples=BOOTSTRAP_SAMPLES, seed=BOOTSTRAP_SEED, include_bins=False
    )
    ev_v35_vs_v2 = oc.evaluate_calibration_with_bootstrap(
        P_v35_ens, y_oof, benchmark_ll_vec=ll_v2_vec, n_resamples=BOOTSTRAP_SAMPLES, seed=BOOTSTRAP_SEED, include_bins=False
    )
    ev_v35_vs_elo = oc.evaluate_calibration_with_bootstrap(
        P_v35_ens, y_oof, benchmark_ll_vec=ll_elo_vec, n_resamples=BOOTSTRAP_SAMPLES, seed=BOOTSTRAP_SEED, include_bins=False
    )
    ev_v35_rec_vs_v2 = oc.evaluate_calibration_with_bootstrap(
        P_v35_ens[rec_m], y_oof[rec_m], benchmark_ll_vec=ll_v2_vec[rec_m], n_resamples=BOOTSTRAP_SAMPLES, seed=BOOTSTRAP_SEED, include_bins=False
    )
    ev_v35_rec_vs_v1 = oc.evaluate_calibration_with_bootstrap(
        P_v35_ens[rec_m], y_oof[rec_m], benchmark_ll_vec=ll_v1_vec[rec_m], n_resamples=BOOTSTRAP_SAMPLES, seed=BOOTSTRAP_SEED, include_bins=False
    )

    print(
        f"\n=== SELECCIONES 1X2 MERIDIAN v3.5 ({chosen_tag}, {best_bspace}, T={best_temp}, w_gbm={best_wg}) ===\n"
        f"  2010..2024 (n={len(y_oof)}) LL={ev_v35_vs_v2['log_loss']:.5f} | ECE={ev_v35_vs_v2['ece']:.5f}\n"
        f"    ΔLL vs v1.0 = {ev_v35_vs_v1['delta_ll_vs_benchmark']:+.5f} {ev_v35_vs_v1['delta_ll_ci95']} ({ev_v35_vs_v1['significance']})\n"
        f"    ΔLL vs v2.0 = {ev_v35_vs_v2['delta_ll_vs_benchmark']:+.5f} {ev_v35_vs_v2['delta_ll_ci95']} ({ev_v35_vs_v2['significance']})\n"
        f"    ΔLL vs Elo  = {ev_v35_vs_elo['delta_ll_vs_benchmark']:+.5f} {ev_v35_vs_elo['delta_ll_ci95']} ({ev_v35_vs_elo['significance']})\n"
        f"  2020..2024 (n={int(np.sum(rec_m))}) LL={ev_v35_rec_vs_v2['log_loss']:.5f}\n"
        f"    ΔLL vs v1.0 = {ev_v35_rec_vs_v1['delta_ll_vs_benchmark']:+.5f} {ev_v35_rec_vs_v1['delta_ll_ci95']} ({ev_v35_rec_vs_v1['significance']})\n"
        f"    ΔLL vs v2.0 = {ev_v35_rec_vs_v2['delta_ll_vs_benchmark']:+.5f} {ev_v35_rec_vs_v2['delta_ll_ci95']} ({ev_v35_rec_vs_v2['significance']})"
    )

    # -----------------------------------------------------------------------
    # PARTE 2: Meridian Horizon-Goals v3.5 (`Totals 1.5/2.5/3.5`, `BTTS`)
    # -----------------------------------------------------------------------
    hg_oof = oof_meta["home_goals"].to_numpy(dtype=np.float64)
    ag_oof = oof_meta["away_goals"].to_numpy(dtype=np.float64)
    tot_oof = hg_oof + ag_oof
    y_ov15 = np.where(tot_oof >= 2.0, 0, 1).astype(np.int64)
    y_ov25 = np.where(tot_oof >= 3.0, 0, 1).astype(np.int64)
    y_ov35 = np.where(tot_oof >= 4.0, 0, 1).astype(np.int64)
    y_btts = np.where((hg_oof >= 1.0) & (ag_oof >= 1.0), 0, 1).astype(np.int64)

    # Baseline `Meridian v2.0` actual en `intl_soccer.ts` (`fitDixonColesLambdasFrom1X2` con `REGIME_DC_RHO`)
    reg_oof = oof_meta["div"].astype(str).to_numpy()
    rho_v2_fixed = np.array([float(REGIME_DC_RHO.get(rg, -0.10)) for rg in reg_oof], dtype=np.float64)
    lh_2p = np.empty(len(y_oof), dtype=np.float64)
    la_2p = np.empty(len(y_oof), dtype=np.float64)
    for i in range(len(y_oof)):
        lh_2p[i], la_2p[i] = solve_dc_2param_from_1x2(
            float(P_v2[i, 0]), float(P_v2[i, 1]), float(P_v2[i, 2]), rho=float(rho_v2_fixed[i]), max_goals=DEFAULT_MAX_GOALS
        )
    mkt_v2_2p = summarize_dc_markets_batch(lh_2p, la_2p, rho_v2_fixed)
    tot_2p = lh_2p + la_2p

    best_alpha_pois = min(
        T_pois_map.keys(),
        key=lambda a: float(np.mean((tot_oof[val_m] - T_pois_map[a][val_m]) ** 2)),
    )
    T_pois_sel = T_pois_map[best_alpha_pois]

    best_w_tot = 1.0
    best_val_g_ll = float("inf")
    goals_val_grid: dict[str, float] = {}
    for w_tot in (0.40, 0.65, 0.80, 0.90, 1.00):
        T_try = w_tot * T_pois_sel[val_m] + (1.0 - w_tot) * tot_2p[val_m]
        lh_g, la_g, rh_g = solve_coherent_dc_3param_batch(P_v35_ens[val_m], T_try, rho_reg_oof[val_m], rho_shrinkage=0.0)
        mk_g = summarize_dc_markets_batch(lh_g, la_g, rh_g)
        ll_25 = float(np.mean(oc.compute_categorical_log_loss_vec(np.column_stack([mk_g["p_over_2_5"], mk_g["p_under_2_5"]]), y_ov25[val_m])))
        ll_bt = float(np.mean(oc.compute_categorical_log_loss_vec(np.column_stack([mk_g["p_btts_yes"], mk_g["p_btts_no"]]), y_btts[val_m])))
        comb = 0.60 * ll_25 + 0.40 * ll_bt
        goals_val_grid[f"w_total={w_tot:.2f}"] = round(comb, 6)
        if comb < best_val_g_ll:
            best_val_g_ll = comb
            best_w_tot = w_tot

    T_v35_intl = best_w_tot * T_pois_sel + (1.0 - best_w_tot) * tot_2p
    lh_v35, la_v35, rh_v35 = solve_coherent_dc_3param_batch(P_v35_ens, T_v35_intl, rho_reg_oof, rho_shrinkage=0.0)
    mkt_v35 = summarize_dc_markets_batch(lh_v35, la_v35, rh_v35)

    P_ov25_v2 = np.column_stack([mkt_v2_2p["p_over_2_5"], mkt_v2_2p["p_under_2_5"]])
    P_ov25_v35 = np.column_stack([mkt_v35["p_over_2_5"], mkt_v35["p_under_2_5"]])
    P_btts_v2 = np.column_stack([mkt_v2_2p["p_btts_yes"], mkt_v2_2p["p_btts_no"]])
    P_btts_v35 = np.column_stack([mkt_v35["p_btts_yes"], mkt_v35["p_btts_no"]])

    ev_intl_tot25 = oc.evaluate_calibration_with_bootstrap(
        P_ov25_v35, y_ov25, benchmark_ll_vec=oc.compute_categorical_log_loss_vec(P_ov25_v2, y_ov25), n_resamples=BOOTSTRAP_SAMPLES, seed=BOOTSTRAP_SEED, include_bins=False
    )
    ev_intl_btts = oc.evaluate_calibration_with_bootstrap(
        P_btts_v35, y_btts, benchmark_ll_vec=oc.compute_categorical_log_loss_vec(P_btts_v2, y_btts), n_resamples=BOOTSTRAP_SAMPLES, seed=BOOTSTRAP_SEED, include_bins=False
    )
    ev_intl_tot15 = oc.evaluate_calibration_with_bootstrap(
        np.column_stack([mkt_v35["p_over_1_5"], mkt_v35["p_under_1_5"]]),
        y_ov15,
        benchmark_ll_vec=oc.compute_categorical_log_loss_vec(np.column_stack([mkt_v2_2p["p_over_1_5"], mkt_v2_2p["p_under_1_5"]]), y_ov15),
        n_resamples=BOOTSTRAP_SAMPLES,
        seed=BOOTSTRAP_SEED,
        include_bins=False,
    )
    ev_intl_tot35 = oc.evaluate_calibration_with_bootstrap(
        np.column_stack([mkt_v35["p_over_3_5"], mkt_v35["p_under_3_5"]]),
        y_ov35,
        benchmark_ll_vec=oc.compute_categorical_log_loss_vec(np.column_stack([mkt_v2_2p["p_over_3_5"], mkt_v2_2p["p_under_3_5"]]), y_ov35),
        n_resamples=BOOTSTRAP_SAMPLES,
        seed=BOOTSTRAP_SEED,
        include_bins=False,
    )
    max_1x2_dc_diff = float(np.max(np.abs(np.column_stack([mkt_v35["p_home"], mkt_v35["p_draw"], mkt_v35["p_away"]]) - P_v35_ens)))

    print(
        f"\n=== SELECCIONES HORIZON-GOALS v3.5 (n={len(y_oof)}, alpha={best_alpha_pois}, w_total={best_w_tot}) ===\n"
        f"  Totals 2.5 | v2.0(2p)={float(np.mean(oc.compute_categorical_log_loss_vec(P_ov25_v2, y_ov25))):.5f} -> "
        f"v3.5={ev_intl_tot25['log_loss']:.5f} (ECE={ev_intl_tot25['ece']:.5f}) | "
        f"ΔLL={ev_intl_tot25['delta_ll_vs_benchmark']:+.5f} {ev_intl_tot25['delta_ll_ci95']} ({ev_intl_tot25['significance']})\n"
        f"  BTTS       | v2.0(2p)={float(np.mean(oc.compute_categorical_log_loss_vec(P_btts_v2, y_btts))):.5f} -> "
        f"v3.5={ev_intl_btts['log_loss']:.5f} (ECE={ev_intl_btts['ece']:.5f}) | "
        f"ΔLL={ev_intl_btts['delta_ll_vs_benchmark']:+.5f} {ev_intl_btts['delta_ll_ci95']} ({ev_intl_btts['significance']})\n"
        f"  Totals 1.5 | ΔLL={ev_intl_tot15['delta_ll_vs_benchmark']:+.5f} ({ev_intl_tot15['significance']}) | "
        f"Totals 3.5 | ΔLL={ev_intl_tot35['delta_ll_vs_benchmark']:+.5f} ({ev_intl_tot35['significance']})\n"
        f"  1X2 Coherent Matrix max |P_dc - P_ens| = {max_1x2_dc_diff:.2e}"
    )

    # -----------------------------------------------------------------------
    # PARTE 3: Exportar artefactos finales `< 2025-02-02`
    # -----------------------------------------------------------------------
    max_dt_f = dates_ts.max()
    sw_f = 0.5 ** ((max_dt_f - dates_ts).dt.days.to_numpy(dtype=np.float64) / 4380.0)
    X_sel_base = X_v3_base if chosen_tag == "v3_53" else X_v2_base
    X_f_1x2 = np.hstack([X_sel_base, dummies_all])

    imp_f = SimpleImputer(strategy="median").fit(X_f_1x2)
    X_fi = imp_f.transform(X_f_1x2)
    sc_f = StandardScaler().fit(X_fi)
    sc_f.scale_ = np.where(sc_f.scale_ == 0.0, 1.0, sc_f.scale_)
    Z_f = sc_f.transform(X_fi)
    from sklearn.linear_model import LogisticRegression

    lr_f = LogisticRegression(C=0.02, solver="lbfgs", max_iter=1500, random_state=MODEL_SEED)
    lr_f.fit(Z_f, y_all, sample_weight=sw_f)

    hgb_f = HistGradientBoostingClassifier(**hgb_params)
    hgb_f.fit(X_f_1x2, y_all, sample_weight=sw_f)

    logit_comp = eg.build_logit_companion_payload(
        imp_f, sc_f, lr_f, n_features_base=len(chosen_cols), regularization_c=0.02
    )
    gbm_intl_art = eg.serialize_hist_gbm_to_artifact(
        hgb_f,
        base_feature_names=list(chosen_cols),
        div_levels=div_levels,
        temperature=best_temp,
        blend_space=best_bspace,
        w_logit=best_wl,
        w_gbm=best_wg,
        production_activated=False,
        activation_verdict={
            "activated": False,
            "status": "candidate",
            "significance": ev_v35_vs_v1["significance"],
            "criterion": "Candidato Meridian v3.5 validado en walk_forward_dev < 2025-02-02",
            "reason": (
                f"LL={ev_v35_vs_v2['log_loss']:.5f}, delta_ll_vs_v1={ev_v35_vs_v1['delta_ll_vs_benchmark']:+.5f} "
                f"({ev_v35_vs_v1['significance']}), delta_ll_vs_v2={ev_v35_vs_v2['delta_ll_vs_benchmark']:+.5f} "
                f"({ev_v35_vs_v2['significance']})."
            ),
        },
        logit_companion=logit_comp,
        training_window={
            "min_year": int(MODERN_TRAIN_MIN_YEAR),
            "max_date_exclusive": HOLDOUT_CUT_ISO,
            "n_matches": int(len(modern_df)),
            "holdout_sealed_untouched": True,
        },
        calibrated_on_window={"val_years": "2010..2019", "n_val": int(np.sum(val_m))},
        codename="PitchLab Meridian v3.5 Ensemble",
        version="3.5.0-candidate",
        seed=MODEL_SEED,
    )
    GBM_INTL_V35_OUT.write_text(json.dumps(gbm_intl_art, separators=(",", ":")), encoding="utf-8")

    # Entrenar y exportar `Meridian Horizon-Goals v3.5`
    Xg_f = np.hstack([X_goals_base, dummies_all])
    imp_gf = SimpleImputer(strategy="median").fit(Xg_f)
    Xg_fi = imp_gf.transform(Xg_f)
    sc_gf = StandardScaler().fit(Xg_fi)
    sc_gf.scale_ = np.where(sc_gf.scale_ == 0.0, 1.0, sc_gf.scale_)
    Zg_f = sc_gf.transform(Xg_fi)
    pr_f = PoissonRegressor(alpha=best_alpha_pois, max_iter=1000)
    pr_f.fit(Zg_f, np.clip(tot_all, 0.0, 16.0), sample_weight=sw_f)
    final_reg_rho = _estimate_causal_regime_rho(
        hg_all,
        ag_all,
        modern_df["dc_lam_home"].to_numpy(dtype=np.float64),
        modern_df["dc_lam_away"].to_numpy(dtype=np.float64),
        reg_vals,
    )

    goals_intl_art = {
        "schema_version": "horizon_goals_v3.5.0",
        "type": "poisson_log_link_3param_dc",
        "codename": "PitchLab Meridian Horizon-Goals v3.5 (National Teams)",
        "version": "3.5.0-candidate",
        "status": "candidate",
        "production_activated": False,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "seed": MODEL_SEED,
        "alpha": float(best_alpha_pois),
        "w_total_poisson": float(best_w_tot),
        "rho_shrinkage": 0.0,
        "default_rho": -0.10,
        "min_total_goals": 0.45,
        "max_total_goals": 7.50,
        "max_goals_grid": DEFAULT_MAX_GOALS,
        "features": list(INTL_GOALS_16_BASE_COLS) + [f"div_{lvl}" for lvl in div_levels],
        "n_features_base": len(INTL_GOALS_16_BASE_COLS),
        "base_features": list(INTL_GOALS_16_BASE_COLS),
        "source_v2_feature_indices": [INTL_V2_49_COLS.index(nm) for nm in INTL_GOALS_SOURCE_COLS],
        "div_levels": div_levels,
        "div_rho_map": final_reg_rho,
        "imputer_statistics": [float(v) for v in imp_gf.statistics_.tolist()],
        "scaler_mean": [float(v) for v in sc_gf.mean_.tolist()],
        "scaler_scale": [float(v) for v in sc_gf.scale_.tolist()],
        "coef": [float(v) for v in pr_f.coef_.tolist()],
        "intercept": float(pr_f.intercept_),
        "training_window": {
            "min_year": int(MODERN_TRAIN_MIN_YEAR),
            "max_date_exclusive": HOLDOUT_CUT_ISO,
            "n_matches": int(len(modern_df)),
            "holdout_sealed_untouched": True,
        },
    }
    GOALS_INTL_V35_OUT.write_text(json.dumps(goals_intl_art, indent=2), encoding="utf-8")

    # Snapshot de paridad `150` filas `< 2025-02-02`
    rng = np.random.default_rng(MODEL_SEED)
    rec_indices = np.where(years >= 2021)[0]
    ch_idx = np.sort(rng.choice(rec_indices, size=min(150, len(rec_indices)), replace=False))
    X_sn_1x2 = X_f_1x2[ch_idx]
    Xg_sn = Xg_f[ch_idx]

    p_gbm_skl = hgb_f.predict_proba(X_sn_1x2)
    p_gbm_ser = eg.predict_serialized_gbm_python(X_sn_1x2, gbm_intl_art, calibrated=False)
    max_ser_diff = float(np.max(np.abs(p_gbm_skl - p_gbm_ser)))
    if max_ser_diff > 1e-12:
        raise RuntimeError(f"Desviación serialización GBM Selecciones: {max_ser_diff:.3e}")

    p_gbm_cal_sn = _apply_temperature_3way_exact(p_gbm_ser, best_temp)
    Z_sn = (imp_f.transform(X_sn_1x2) - sc_f.mean_) / sc_f.scale_
    lg_sn = Z_sn @ lr_f.coef_.T + lr_f.intercept_
    ex_sn = np.exp(lg_sn - np.max(lg_sn, axis=1, keepdims=True))
    p_log_sn = ex_sn / np.sum(ex_sn, axis=1, keepdims=True)
    p_ens_sn = _blend_3way_exact(p_log_sn, p_gbm_cal_sn, best_wl, best_wg, best_bspace)
    t_pois_sn = predict_poisson_log_link_exact(Xg_sn, goals_intl_art)

    snap_rows: list[dict[str, Any]] = []
    for k_i, row_idx in enumerate(ch_idx):
        dv_r = str(reg_vals[row_idx])
        rho_p = float(final_reg_rho.get(dv_r, -0.10))
        ph_r, pd_r, pa_r = float(p_ens_sn[k_i, 0]), float(p_ens_sn[k_i, 1]), float(p_ens_sn[k_i, 2])
        lh_2r, la_2r = solve_dc_2param_from_1x2(ph_r, pd_r, pa_r, rho=float(REGIME_DC_RHO.get(dv_r, -0.10)), max_goals=DEFAULT_MAX_GOALS)
        t_eff = float(best_w_tot) * float(t_pois_sn[k_i]) + (1.0 - float(best_w_tot)) * (lh_2r + la_2r)
        lh_3r, la_3r, rh_3r = solve_coherent_dc_3param(ph_r, pd_r, pa_r, t_eff, rho_p, rho_shrinkage=0.0, max_goals=DEFAULT_MAX_GOALS)
        mk_3r = summarize_dc_markets_from_matrix(build_dc_score_matrix_exact(lh_3r, la_3r, rh_3r, max_goals=DEFAULT_MAX_GOALS))
        snap_rows.append(
            {
                "match_id": str(modern_df.iloc[row_idx]["match_id"]),
                "div": dv_r,
                "features": [float(v) for v in X_sel_base[row_idx].tolist()],
                "v2_49_features": [float(v) for v in X_v2_base[row_idx].tolist()],
                "goals_features": [float(v) for v in X_goals_base[row_idx].tolist()],
                "div_onehot": [int(v) for v in dummies_all[row_idx].tolist()],
                "python_ensemble_probs": [ph_r, pd_r, pa_r],
                "python_t_poisson": float(t_pois_sn[k_i]),
                "python_dc_3param": {
                    "lam_home": lh_3r,
                    "lam_away": la_3r,
                    "rho_eff": rh_3r,
                    "p_over_2_5": mk_3r["p_over_2_5"],
                    "p_btts_yes": mk_3r["p_btts_yes"],
                },
            }
        )

    SNAP_INTL_V35_OUT.write_text(
        json.dumps(
            {
                "schema_version": "intl_v3.5_parity_snapshot",
                "codename": "PitchLab Meridian v3.5 + Horizon-Goals v3.5",
                "holdout_sealed_untouched": True,
                "n": len(snap_rows),
                "rows": snap_rows,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    summary = {
        "experiment_id": "EXP_V38_meridian_v3_5_engines",
        "eval_split": "walk_forward_dev",
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "selected_1x2_config": {
            "feature_set": chosen_tag,
            "n_features_base": len(chosen_cols),
            "hgb_temperature": float(best_temp),
            "blend_space": best_bspace,
            "w_logit": float(best_wl),
            "w_gbm": float(best_wg),
            "val_2010_2019_grid": val_1x2_grid,
        },
        "selected_horizon_goals_config": {
            "n_features_base": len(INTL_GOALS_16_BASE_COLS),
            "poisson_alpha": float(best_alpha_pois),
            "w_total_poisson": float(best_w_tot),
            "val_2010_2019_grid": goals_val_grid,
        },
        "metrics_1x2": {
            "v3_5_vs_v1_2010_2024": ev_v35_vs_v1,
            "v3_5_vs_v2_2010_2024": ev_v35_vs_v2,
            "v3_5_vs_elo_2010_2024": ev_v35_vs_elo,
            "v3_5_vs_v1_2020_2024": ev_v35_rec_vs_v1,
            "v3_5_vs_v2_2020_2024": ev_v35_rec_vs_v2,
            "max_1x2_dc_coherence_diff": max_1x2_dc_diff,
        },
        "metrics_horizon_goals": {
            "totals_2_5_vs_v2_2param": ev_intl_tot25,
            "btts_vs_v2_2param": ev_intl_btts,
            "totals_1_5_vs_v2_2param": ev_intl_tot15,
            "totals_3_5_vs_v2_2param": ev_intl_tot35,
        },
    }
    RESULTS_INTL_V35_OUT.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    with TRIAL_REGISTRY_OUT.open("a", encoding="utf-8") as fh:
        fh.write(
            json.dumps(
                {
                    "recorded_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "experiment_id": "EXP_V38_meridian_v3_5_engines",
                    "eval_split": "walk_forward_dev",
                    "holdout_touched": False,
                    "ll_1x2_v35": round(ev_v35_vs_v2["log_loss"], 6),
                    "ll_totals_2_5_v35": round(ev_intl_tot25["log_loss"], 6),
                    "delta_ll_totals_2_5_vs_v2": round(ev_intl_tot25["delta_ll_vs_benchmark"], 6),
                    "ll_btts_v35": round(ev_intl_btts["log_loss"], 6),
                    "delta_ll_btts_vs_v2": round(ev_intl_btts["delta_ll_vs_benchmark"], 6),
                }
            )
            + "\n"
        )
    print(f"\n[DONE] EXP_V38 guardado en {RESULTS_INTL_V35_OUT.name}")


if __name__ == "__main__":
    main()
