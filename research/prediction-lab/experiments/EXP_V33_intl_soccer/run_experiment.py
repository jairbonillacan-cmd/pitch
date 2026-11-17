"""Entrenamiento causal `walk_forward_dev`, ablación bootstrap `mulberry32` y exportación de `PitchLab Meridian v1.0` (EXP_V33_intl_soccer).

Ejecuta de punta a punta:
  1. Ingesta `CC0 1.0` (`martj42/international_results`) estrictamente `< 2025-02-02` para desarrollo y entrenamiento.
  2. Construcción causal `t' < t` de las 38 features base + 6 niveles one-hot de régimen internacional (`44` cols).
  3. Selección de hiperparámetros `(C, half_life_days)` exclusivamente en pliegues `VAL` (`2010..2019`).
  4. Evaluación anual `walk_forward_dev` (`2010..2024`, `< 2025-02-02`) y ventana reciente `DEV_OOS` (`2020..2024`)
     con `1,000` réplicas bootstrap `mulberry32` (`seed = 20261111`), comparando:
       - `base_rate_regime` (frecuencias causales por régimen + neutralidad)
       - `intl_elo_baseline` (Elo internacional con curva gaussiana de empate)
       - `intl_dc_online` (Dixon-Coles estructural online)
       - `meridian_v1_no_geo_club` (ablación sin física de altitud/viaje/diáspora ni puente ClubElo)
       - `meridian_v1_logit` (Logit Multinomial L2 exportable 1:1 a `engine.ts`)
       - `meridian_v1_hgb` (`HistGradientBoostingClassifier` regularizado)
  5. Generación de curvas de calibración de `10` deciles (`intl_outlook_calibration_v1.json`) compatibles
     con `src/domain/prediction/outlook.ts`.
  6. Exportación de `model_intl_soccer_v1.json`, `intl_soccer_snapshot.json` y `intl_soccer_causal_state.json`
     en `src/data/prediction/`, con `status = "candidate"` y `production_activated = false`.
"""

from __future__ import annotations

import os

os.environ.setdefault("OMP_NUM_THREADS", "4")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("NUMEXPR_NUM_THREADS", "1")
os.environ.setdefault("LOKY_MAX_CPU_COUNT", "1")

import argparse
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
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

EXP_DIR = Path(__file__).resolve().parent
REPO_ROOT = EXP_DIR.parents[3]

for _p in (str(REPO_ROOT), str(EXP_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from services.models import outlook_calibration as oc  # noqa: E402

from intl_causal_features import (  # noqa: E402
    ELO_HFA_POINTS,
    ELO_K_BY_REGIME,
    INTL_BASE_38_FEATURES,
    REGIME_BASE_GOAL_MU,
    REGIME_DC_RHO,
    SQUAD_CLUB_BRIDGE_CONFIG,
    build_intl_causal_dataset,
)
from intl_ingest import (  # noqa: E402
    ARTIFACTS_DIR,
    FIRST_EVAL_YEAR,
    HOLDOUT_CUT_DATE,
    HOLDOUT_CUT_ISO,
    HOLDOUT_CUT_TS,
    INTL_DIV_LEVELS,
    MODERN_TRAIN_MIN_YEAR,
    VAL_MAX_YEAR,
    assert_dates_strictly_before_holdout,
    fetch_and_normalize_all_intl_matches,
    load_intl_matches_dev,
)

MODEL_SEED = 20261109
BOOTSTRAP_SEED = 20261111
BOOTSTRAP_SAMPLES = 1000

DATA_PRED_DIR = REPO_ROOT / "src" / "data" / "prediction"
MODEL_JSON_OUT = DATA_PRED_DIR / "model_intl_soccer_v1.json"
CAUSAL_STATE_JSON_OUT = DATA_PRED_DIR / "intl_soccer_causal_state.json"
CALIBRATION_JSON_OUT = DATA_PRED_DIR / "intl_outlook_calibration_v1.json"
SNAPSHOT_JSON_OUT = DATA_PRED_DIR / "intl_soccer_snapshot.json"
TRIAL_REGISTRY_OUT = EXP_DIR / "trial_registry_intl.jsonl"
RESULTS_JSON_OUT = ARTIFACTS_DIR / "exp_v33_intl_soccer_results.json"

GEO_CLUB_ABLATION_COLS = {
    "window_match2_diff",
    "log_travel_km_diff",
    "effective_hfa",
    "altitude_diff_m",
    "surface_pressure_diff",
    "fed_club_elo_diff",
}

HGB_PARAMS: dict[str, Any] = {
    "loss": "log_loss",
    "max_depth": 3,
    "max_leaf_nodes": 7,
    "min_samples_leaf": 100,
    "learning_rate": 0.035,
    "max_iter": 110,
    "l2_regularization": 10.0,
    "random_state": MODEL_SEED,
}


def build_design_matrix(df: pd.DataFrame, base_cols: tuple[str, ...] = INTL_BASE_38_FEATURES) -> np.ndarray:
    X_base = df[list(base_cols)].to_numpy(dtype=np.float64)
    div_vals = df["div"].astype(str).to_numpy()
    n = len(df)
    dummies = np.zeros((n, len(INTL_DIV_LEVELS)), dtype=np.float64)
    for j, lvl in enumerate(INTL_DIV_LEVELS):
        dummies[:, j] = (div_vals == lvl).astype(np.float64)
    return np.hstack([X_base, dummies])


def fit_logit_bundle(
    X_train: np.ndarray,
    y_train: np.ndarray,
    c_reg: float,
    sample_weight: np.ndarray,
) -> tuple[SimpleImputer, StandardScaler, LogisticRegression]:
    imp = SimpleImputer(strategy="median").fit(X_train)
    X_imp = imp.transform(X_train)
    sc = StandardScaler().fit(X_imp)
    X_sc = sc.transform(X_imp)
    # Escala 0 sustituida por 1 para paridad exacta con `engine.ts`
    sc.scale_ = np.where(sc.scale_ == 0.0, 1.0, sc.scale_)
    X_sc = (X_imp - sc.mean_) / sc.scale_

    lr = LogisticRegression(
        C=float(c_reg),
        max_iter=3000,
        tol=1e-5,
        solver="lbfgs",
        random_state=MODEL_SEED,
    )
    lr.fit(X_sc, y_train, sample_weight=sample_weight)
    return imp, sc, lr


def predict_logit_bundle_exact(
    imp: SimpleImputer,
    sc: StandardScaler,
    lr: LogisticRegression,
    X_eval: np.ndarray,
    zero_base_col_indices: list[int] | None = None,
) -> np.ndarray:
    """Reproduce exactamente el pipeline IEEE-754 de `src/domain/prediction/engine.ts`:
    `imputer -> (x - mean)/scale -> coef @ z + intercept -> stable softmax`."""
    X_work = np.array(X_eval, dtype=np.float64, copy=True)
    if zero_base_col_indices:
        for col_i in zero_base_col_indices:
            X_work[:, col_i] = imp.statistics_[col_i]
    nan_mask = ~np.isfinite(X_work)
    if np.any(nan_mask):
        rows_na, cols_na = np.where(nan_mask)
        X_work[rows_na, cols_na] = imp.statistics_[cols_na]

    scale_safe = np.where(sc.scale_ == 0.0, 1.0, sc.scale_)
    Z = (X_work - sc.mean_) / scale_safe
    logits = Z @ lr.coef_.T + lr.intercept_
    max_l = np.max(logits, axis=1, keepdims=True)
    exps = np.exp(logits - max_l)
    return exps / np.sum(exps, axis=1, keepdims=True)


def compute_elo_baseline_probs(elo_diff_eff: np.ndarray, draw_peak: float = 0.275) -> np.ndarray:
    p_draw = draw_peak * np.exp(-0.5 * ((elo_diff_eff / 290.0) ** 2))
    p_draw = np.clip(p_draw, 0.04, 0.36)
    p_win_cond = 1.0 / (1.0 + (10.0 ** (-elo_diff_eff / 400.0)))
    rem = 1.0 - p_draw
    p_h = rem * p_win_cond
    p_a = rem * (1.0 - p_win_cond)
    return np.column_stack([p_h, p_draw, p_a])


def compute_causal_base_rate_probs(train_df: pd.DataFrame, eval_df: pd.DataFrame) -> np.ndarray:
    """Frecuencia empírica H/D/A causal por `(div, is_neutral_pure)` con suavizado Dirichlet `m0 = 30`."""
    y_tr = train_df["y"].to_numpy(dtype=int)
    g_counts = np.bincount(y_tr, minlength=3).astype(np.float64)
    g_prior = g_counts / max(1.0, float(g_counts.sum()))

    m0 = 30.0
    table: dict[tuple[str, int], np.ndarray] = {}
    for (div_k, neut_k), grp in train_df.groupby(["div", train_df["is_neutral_pure"].astype(int)]):
        cnt = np.bincount(grp["y"].to_numpy(dtype=int), minlength=3).astype(np.float64)
        probs = (cnt + m0 * g_prior) / (float(cnt.sum()) + m0)
        table[(str(div_k), int(neut_k))] = probs

    out = np.empty((len(eval_df), 3), dtype=np.float64)
    for i, (div_v, neut_v) in enumerate(zip(eval_df["div"].astype(str), eval_df["is_neutral_pure"].astype(int))):
        out[i, :] = table.get((div_v, neut_v), g_prior)
    return out


def _fit_dc_lambdas_from_1x2_row(p_h: float, p_d: float, p_a: float, rho: float, max_goals: int = 10) -> tuple[float, float]:
    """Espejo exacto de `outlook.ts::fitDixonColesLambdasFrom1X2` para evaluar totales 2.5 y BTTS coherentes."""
    s = p_h + p_d + p_a
    ph = min(0.96, max(0.02, p_h / s))
    pd_val = min(0.90, max(0.02, p_d / s))
    pa = min(0.96, max(0.02, 1.0 - ph - pd_val))

    sh_init = min(0.92, max(0.08, ph / (ph + pa)))
    u = math.log(sh_init / (1.0 - sh_init))
    v = math.log(2.55)
    target_diff = ph - pa
    target_draw = pd_val

    k_grid = np.arange(max_goals + 1, dtype=np.float64)
    log_fact = np.array([math.lgamma(k + 1) for k in range(max_goals + 1)], dtype=np.float64)

    def _eval_res(u_v: float, v_v: float) -> tuple[float, float]:
        tot = min(8.0, max(0.25, math.exp(v_v)))
        sh = min(0.96, max(0.04, 1.0 / (1.0 + math.exp(-u_v))))
        lh = min(10.0, max(0.05, tot * sh))
        la = min(10.0, max(0.05, tot * (1.0 - sh)))
        pmf_h = np.exp(k_grid * math.log(lh) - lh - log_fact)
        pmf_a = np.exp(k_grid * math.log(la) - la - log_fact)
        mat = np.outer(pmf_h, pmf_a)
        mat[0, 0] *= max(0.0, 1.0 - lh * la * rho)
        mat[1, 0] *= max(0.0, 1.0 + la * rho)
        mat[0, 1] *= max(0.0, 1.0 + lh * rho)
        mat[1, 1] *= max(0.0, 1.0 - rho)
        ms = float(mat.sum())
        mat /= ms
        cur_d = float(np.trace(mat))
        cur_h = float(np.tril(mat, k=-1).sum())
        cur_a = float(np.triu(mat, k=1).sum())
        return (cur_h - cur_a - target_diff, cur_d - target_draw)

    h_step = 1e-4
    for _ in range(24):
        f1, f2 = _eval_res(u, v)
        n0 = f1 * f1 + f2 * f2
        if n0 < 1e-20:
            break
        f1u, f2u = _eval_res(u + h_step, v)
        f1v, f2v = _eval_res(u, v + h_step)
        j11, j21 = (f1u - f1) / h_step, (f2u - f2) / h_step
        j12, j22 = (f1v - f1) / h_step, (f2v - f2) / h_step
        det = j11 * j22 - j12 * j21
        if not math.isfinite(det) or abs(det) < 1e-12:
            break
        du = -(j22 * f1 - j12 * f2) / det
        dv = -(-j21 * f1 + j11 * f2) / det
        improved = False
        step = 1.0
        for _ in range(8):
            ut = min(3.2, max(-3.2, u + step * du))
            vt = min(math.log(8.0), max(math.log(0.25), v + step * dv))
            r1, r2 = _eval_res(ut, vt)
            if r1 * r1 + r2 * r2 < n0:
                u, v = ut, vt
                improved = True
                break
            step *= 0.5
        if not improved:
            break

    tot_f = min(8.0, max(0.25, math.exp(v)))
    sh_f = min(0.96, max(0.04, 1.0 / (1.0 + math.exp(-u))))
    return min(10.0, max(0.05, tot_f * sh_f)), min(10.0, max(0.05, tot_f * (1.0 - sh_f)))


def derive_2way_probs_from_1x2(probs_1x2: np.ndarray, regimes: Sequence[str], max_goals: int = 10) -> tuple[np.ndarray, np.ndarray]:
    """Deriva probabilidades 2-vías `[p_over_25, p_under_25]` y `[p_btts_yes, p_btts_no]` desde la matriz DC única."""
    n = len(probs_1x2)
    p_ou25 = np.empty((n, 2), dtype=np.float64)
    p_btts = np.empty((n, 2), dtype=np.float64)
    k_grid = np.arange(max_goals + 1, dtype=np.float64)
    log_fact = np.array([math.lgamma(k + 1) for k in range(max_goals + 1)], dtype=np.float64)
    g_sum_grid = k_grid[:, None] + k_grid[None, :]
    over25_mask = g_sum_grid > 2.5

    for i in range(n):
        rho = REGIME_DC_RHO.get(str(regimes[i]), -0.09)
        lh, la = _fit_dc_lambdas_from_1x2_row(
            float(probs_1x2[i, 0]), float(probs_1x2[i, 1]), float(probs_1x2[i, 2]), rho, max_goals
        )
        pmf_h = np.exp(k_grid * math.log(lh) - lh - log_fact)
        pmf_a = np.exp(k_grid * math.log(la) - la - log_fact)
        mat = np.outer(pmf_h, pmf_a)
        mat[0, 0] *= max(0.0, 1.0 - lh * la * rho)
        mat[1, 0] *= max(0.0, 1.0 + la * rho)
        mat[0, 1] *= max(0.0, 1.0 + lh * rho)
        mat[1, 1] *= max(0.0, 1.0 - rho)
        mat /= float(mat.sum())

        po = float(mat[over25_mask].sum())
        p_ou25[i, 0] = po
        p_ou25[i, 1] = 1.0 - po

        pyes = float(mat[1:, 1:].sum())
        p_btts[i, 0] = pyes
        p_btts[i, 1] = 1.0 - pyes

    return p_ou25, p_btts


def run_pipeline(*, record_trial: bool = False, force_download: bool = False) -> dict[str, Any]:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    DATA_PRED_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Ingesta y features estrictamente `< 2025-02-02` (`walk_forward_dev`)
    dev_matches_df, manifest = load_intl_matches_dev(force_download=force_download)
    assert_dates_strictly_before_holdout(dev_matches_df, col="match_date", context="run_pipeline_dev")

    dev_feat_df, dev_causal_states = build_intl_causal_dataset(dev_matches_df, enforce_before_holdout=True)
    assert_dates_strictly_before_holdout(dev_feat_df, col="match_date", context="dev_feat_df")

    modern_df = dev_feat_df[dev_feat_df["year"] >= MODERN_TRAIN_MIN_YEAR].copy().reset_index(drop=True)
    X_all = build_design_matrix(modern_df)
    y_all = modern_df["y"].to_numpy(dtype=np.int64)
    years_all = modern_df["year"].to_numpy(dtype=int)
    dates_all = pd.to_datetime(modern_df["match_date"])

    ablation_indices = [i for i, col in enumerate(INTL_BASE_38_FEATURES) if col in GEO_CLUB_ABLATION_COLS]

    # 2. Selección de `(C, half_life_days)` exclusivamente en pliegues `VAL` (`2010..2019`)
    c_grid = (0.02, 0.05, 0.12, 0.30)
    hl_grid = (1460.0, 2555.0, 4380.0)
    val_scores: list[dict[str, float]] = []
    best_cfg = (0.05, 2555.0)
    best_val_ll = float("inf")

    val_years = sorted(set(years_all[(years_all >= FIRST_EVAL_YEAR) & (years_all <= VAL_MAX_YEAR)]))
    for c_cand in c_grid:
        for hl_cand in hl_grid:
            ll_parts: list[np.ndarray] = []
            for yr in val_years:
                tr_mask = years_all < yr
                ev_mask = years_all == yr
                if not np.any(tr_mask) or not np.any(ev_mask):
                    continue
                max_dt = dates_all[tr_mask].max()
                age_days = (max_dt - dates_all[tr_mask]).dt.days.to_numpy(dtype=np.float64)
                sw = 0.5 ** (age_days / hl_cand)
                imp_v, sc_v, lr_v = fit_logit_bundle(X_all[tr_mask], y_all[tr_mask], c_cand, sw)
                p_ev = predict_logit_bundle_exact(imp_v, sc_v, lr_v, X_all[ev_mask])
                ll_parts.append(oc.compute_categorical_log_loss_vec(p_ev, y_all[ev_mask]))
            mean_ll = float(np.mean(np.concatenate(ll_parts)))
            val_scores.append({"C": c_cand, "half_life_days": hl_cand, "val_log_loss": round(mean_ll, 6)})
            if mean_ll < best_val_ll:
                best_val_ll = mean_ll
                best_cfg = (c_cand, hl_cand)

    best_c, best_hl = best_cfg

    # 3. Evaluación anual `walk_forward_dev` (`2010..2025` estrictamente `< 2025-02-02`)
    eval_years = sorted(set(years_all[years_all >= FIRST_EVAL_YEAR]))
    oof_rows: list[pd.DataFrame] = []
    p_base_list: list[np.ndarray] = []
    p_elo_list: list[np.ndarray] = []
    p_dc_list: list[np.ndarray] = []
    p_abl_list: list[np.ndarray] = []
    p_logit_list: list[np.ndarray] = []
    p_hgb_list: list[np.ndarray] = []

    for yr in eval_years:
        tr_mask = years_all < yr
        ev_mask = years_all == yr
        if not np.any(tr_mask) or not np.any(ev_mask):
            continue
        tr_df = modern_df.loc[tr_mask]
        ev_df = modern_df.loc[ev_mask]

        max_dt = dates_all[tr_mask].max()
        age_days = (max_dt - dates_all[tr_mask]).dt.days.to_numpy(dtype=np.float64)
        sw = 0.5 ** (age_days / best_hl)

        p_base = compute_causal_base_rate_probs(tr_df, ev_df)
        p_elo = compute_elo_baseline_probs(ev_df["elo_diff_eff"].to_numpy(dtype=np.float64))
        p_dc = ev_df[["online_dc_prob_h", "online_dc_prob_d", "online_dc_prob_a"]].to_numpy(dtype=np.float64)

        # Ablación sin geografía/altitud/ClubElo (entrenada sin esas columnas)
        X_tr_abl = np.array(X_all[tr_mask], copy=True)
        X_ev_abl = np.array(X_all[ev_mask], copy=True)
        X_tr_abl[:, ablation_indices] = 0.0
        X_ev_abl[:, ablation_indices] = 0.0
        imp_a, sc_a, lr_a = fit_logit_bundle(X_tr_abl, y_all[tr_mask], best_c, sw)
        p_abl = predict_logit_bundle_exact(imp_a, sc_a, lr_a, X_ev_abl)

        # Meridian v1.0 Logit completo (44 columnas)
        imp_m, sc_m, lr_m = fit_logit_bundle(X_all[tr_mask], y_all[tr_mask], best_c, sw)
        p_logit = predict_logit_bundle_exact(imp_m, sc_m, lr_m, X_all[ev_mask])

        # Control HistGradientBoosting
        hgb = HistGradientBoostingClassifier(**HGB_PARAMS)
        hgb.fit(X_all[tr_mask], y_all[tr_mask], sample_weight=sw)
        p_hgb = hgb.predict_proba(X_all[ev_mask])

        oof_rows.append(ev_df[["match_id", "date_str", "year", "div", "home_code", "away_code", "home_goals", "away_goals", "y"]].copy())
        p_base_list.append(p_base)
        p_elo_list.append(p_elo)
        p_dc_list.append(p_dc)
        p_abl_list.append(p_abl)
        p_logit_list.append(p_logit)
        p_hgb_list.append(p_hgb)

    oof_meta = pd.concat(oof_rows, ignore_index=True)
    y_oof = oof_meta["y"].to_numpy(dtype=np.int64)
    P_base = np.vstack(p_base_list)
    P_elo = np.vstack(p_elo_list)
    P_dc = np.vstack(p_dc_list)
    P_abl = np.vstack(p_abl_list)
    P_logit = np.vstack(p_logit_list)
    P_hgb = np.vstack(p_hgb_list)

    ll_base_vec = oc.compute_categorical_log_loss_vec(P_base, y_oof)
    ll_elo_vec = oc.compute_categorical_log_loss_vec(P_elo, y_oof)
    ll_abl_vec = oc.compute_categorical_log_loss_vec(P_abl, y_oof)

    models_oof = {
        "base_rate_regime": (P_base, ll_base_vec, True),
        "intl_elo_baseline": (P_elo, ll_base_vec, False),
        "intl_dc_online": (P_dc, ll_base_vec, False),
        "meridian_v1_no_geo_club": (P_abl, ll_elo_vec, False),
        "meridian_v1_logit": (P_logit, ll_elo_vec, False),
        "meridian_v1_hgb": (P_hgb, ll_elo_vec, False),
    }

    metrics_dev_full: dict[str, Any] = {}
    for m_name, (P_m, bench_ll, is_self) in models_oof.items():
        metrics_dev_full[m_name] = oc.evaluate_calibration_with_bootstrap(
            P_m,
            y_oof,
            benchmark_ll_vec=bench_ll,
            benchmark_is_self=is_self,
            n_resamples=BOOTSTRAP_SAMPLES,
            seed=BOOTSTRAP_SEED,
            include_bins=(m_name == "meridian_v1_logit"),
        )

    # Ganancia directa de ablación: Meridian v1.0 completo vs sin geografía/altitud/ClubElo
    ablation_eval = oc.evaluate_calibration_with_bootstrap(
        P_logit,
        y_oof,
        benchmark_ll_vec=ll_abl_vec,
        benchmark_is_self=False,
        n_resamples=BOOTSTRAP_SAMPLES,
        seed=BOOTSTRAP_SEED,
        include_bins=False,
    )
    logit_vs_base_eval = oc.evaluate_calibration_with_bootstrap(
        P_logit,
        y_oof,
        benchmark_ll_vec=ll_base_vec,
        benchmark_is_self=False,
        n_resamples=BOOTSTRAP_SAMPLES,
        seed=BOOTSTRAP_SEED,
        include_bins=True,
    )

    # Subventana reciente `DEV_OOS 2020..2024` (`< 2025-02-02`)
    recent_mask = (oof_meta["year"].to_numpy(dtype=int) >= 2020)
    metrics_dev_2020_2024 = {
        "meridian_v1_logit_vs_elo": oc.evaluate_calibration_with_bootstrap(
            P_logit[recent_mask],
            y_oof[recent_mask],
            benchmark_ll_vec=ll_elo_vec[recent_mask],
            n_resamples=BOOTSTRAP_SAMPLES,
            seed=BOOTSTRAP_SEED,
            include_bins=False,
        ),
        "meridian_v1_logit_vs_base_rate": oc.evaluate_calibration_with_bootstrap(
            P_logit[recent_mask],
            y_oof[recent_mask],
            benchmark_ll_vec=ll_base_vec[recent_mask],
            n_resamples=BOOTSTRAP_SAMPLES,
            seed=BOOTSTRAP_SEED,
            include_bins=False,
        ),
        "meridian_v1_hgb_vs_logit": oc.evaluate_calibration_with_bootstrap(
            P_hgb[recent_mask],
            y_oof[recent_mask],
            benchmark_ll_vec=oc.compute_categorical_log_loss_vec(P_logit[recent_mask], y_oof[recent_mask]),
            n_resamples=BOOTSTRAP_SAMPLES,
            seed=BOOTSTRAP_SEED,
            include_bins=False,
        ),
    }

    # 4. Construcción del artefacto de calibración `intl_outlook_calibration_v1.json` (10 bins por régimen + mercados 2-vías)
    P_ou25, P_btts = derive_2way_probs_from_1x2(P_logit, oof_meta["div"].tolist())
    y_ou25 = np.where((oof_meta["home_goals"] + oof_meta["away_goals"]).to_numpy() > 2.5, 0, 1).astype(np.int64)
    y_btts = np.where(
        (oof_meta["home_goals"].to_numpy() > 0) & (oof_meta["away_goals"].to_numpy() > 0), 0, 1
    ).astype(np.int64)

    p_ou25_base_rate = float(np.mean(y_ou25 == 0))
    P_ou25_base = np.tile(np.array([p_ou25_base_rate, 1.0 - p_ou25_base_rate]), (len(y_ou25), 1))
    ll_ou25_base = oc.compute_categorical_log_loss_vec(P_ou25_base, y_ou25)

    p_btts_base_rate = float(np.mean(y_btts == 0))
    P_btts_base = np.tile(np.array([p_btts_base_rate, 1.0 - p_btts_base_rate]), (len(y_btts), 1))
    ll_btts_base = oc.compute_categorical_log_loss_vec(P_btts_base, y_btts)

    cal_segments: dict[str, Any] = {}

    def _make_cal_seg(sport_s: str, league_s: str, market_s: str, cal_res: dict[str, Any], note: str) -> dict[str, Any]:
        return {
            "sport": sport_s,
            "league": league_s,
            "market": market_s,
            "selected_source_when_sharp_present": "market_sharp_novig",
            "fallback_order": ["market_sharp_novig", "model", "base_rate"],
            "benchmark_note": note,
            "n": cal_res["n"],
            "ece": cal_res["ece"],
            "ece_ci95": cal_res["ece_ci95"],
            "log_loss": cal_res["log_loss"],
            "log_loss_ci95": cal_res["log_loss_ci95"],
            "brier": cal_res["brier"],
            "brier_ci95": cal_res["brier_ci95"],
            "rps": cal_res["rps"],
            "rps_ci95": cal_res["rps_ci95"],
            "delta_ll_vs_benchmark": cal_res["delta_ll_vs_benchmark"],
            "delta_ll_ci95": cal_res["delta_ll_ci95"],
            "significance": cal_res["significance"],
            "reliability_bins": cal_res["reliability_bins"],
        }

    cal_segments["GLOBAL::football::1x2"] = _make_cal_seg(
        "football",
        "GLOBAL",
        "1x2",
        logit_vs_base_eval,
        "sin cierre sharp (selecciones CC0 vs base_rate causal)",
    )
    cal_ou_global = oc.evaluate_calibration_with_bootstrap(
        P_ou25, y_ou25, benchmark_ll_vec=ll_ou25_base, n_resamples=BOOTSTRAP_SAMPLES, seed=BOOTSTRAP_SEED, include_bins=True
    )
    cal_btts_global = oc.evaluate_calibration_with_bootstrap(
        P_btts, y_btts, benchmark_ll_vec=ll_btts_base, n_resamples=BOOTSTRAP_SAMPLES, seed=BOOTSTRAP_SEED, include_bins=True
    )
    cal_segments["GLOBAL::football::totals"] = _make_cal_seg(
        "football", "GLOBAL", "totals", cal_ou_global, "sin cierre sharp (matriz única Dixon-Coles vs base_rate)"
    )
    cal_segments["GLOBAL::football::btts"] = _make_cal_seg(
        "football", "GLOBAL", "btts", cal_btts_global, "sin cierre sharp (matriz única Dixon-Coles vs base_rate)"
    )

    regime_breakdown: dict[str, Any] = {}
    div_arr = oof_meta["div"].astype(str).to_numpy()
    for reg in INTL_DIV_LEVELS:
        rmask = div_arr == reg
        if int(np.sum(rmask)) < 25:
            continue
        r_cal_1x2 = oc.evaluate_calibration_with_bootstrap(
            P_logit[rmask],
            y_oof[rmask],
            benchmark_ll_vec=ll_base_vec[rmask],
            n_resamples=BOOTSTRAP_SAMPLES,
            seed=BOOTSTRAP_SEED,
            include_bins=True,
        )
        r_cal_ou = oc.evaluate_calibration_with_bootstrap(
            P_ou25[rmask],
            y_ou25[rmask],
            benchmark_ll_vec=ll_ou25_base[rmask],
            n_resamples=BOOTSTRAP_SAMPLES,
            seed=BOOTSTRAP_SEED,
            include_bins=True,
        )
        r_cal_btts = oc.evaluate_calibration_with_bootstrap(
            P_btts[rmask],
            y_btts[rmask],
            benchmark_ll_vec=ll_btts_base[rmask],
            n_resamples=BOOTSTRAP_SAMPLES,
            seed=BOOTSTRAP_SEED,
            include_bins=True,
        )
        cal_segments[f"{reg}::1x2"] = _make_cal_seg(
            "football", reg, "1x2", r_cal_1x2, f"sin cierre sharp ({reg} vs base_rate)"
        )
        cal_segments[f"{reg}::totals"] = _make_cal_seg(
            "football", reg, "totals", r_cal_ou, f"sin cierre sharp ({reg} totals 2.5 vs base_rate)"
        )
        cal_segments[f"{reg}::btts"] = _make_cal_seg(
            "football", reg, "btts", r_cal_btts, f"sin cierre sharp ({reg} btts vs base_rate)"
        )
        regime_breakdown[reg] = {
            "n": r_cal_1x2["n"],
            "log_loss": r_cal_1x2["log_loss"],
            "log_loss_ci95": r_cal_1x2["log_loss_ci95"],
            "ece": r_cal_1x2["ece"],
            "delta_ll_vs_base_rate": r_cal_1x2["delta_ll_vs_benchmark"],
            "delta_ll_ci95": r_cal_1x2["delta_ll_ci95"],
            "significance": r_cal_1x2["significance"],
        }

    calibration_artifact = {
        "schema_version": oc.SCHEMA_VERSION,
        "eval_split": "walk_forward_dev",
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "bootstrap_samples": BOOTSTRAP_SAMPLES,
        "max_sharp_age_minutes": oc.MAX_SHARP_AGE_MINUTES,
        "segments": cal_segments,
    }
    oc.assert_no_forbidden_public_fields(calibration_artifact, path="intl_outlook_calibration_v1")
    CALIBRATION_JSON_OUT.write_text(json.dumps(calibration_artifact, indent=2), encoding="utf-8")

    # 5. Entrenamiento final estrictamente sobre `< 2025-02-02` y exportación de `model_intl_soccer_v1.json`
    max_dt_final = dates_all.max()
    age_final = (max_dt_final - dates_all).dt.days.to_numpy(dtype=np.float64)
    sw_final = 0.5 ** (age_final / best_hl)
    imp_f, sc_f, lr_f = fit_logit_bundle(X_all, y_all, best_c, sw_final)
    P_train_final = predict_logit_bundle_exact(imp_f, sc_f, lr_f, X_all)
    train_ll = float(-np.mean(np.log(np.clip(P_train_final[np.arange(len(y_all)), y_all], 1e-15, 1.0))))

    feature_names_full = list(INTL_BASE_38_FEATURES) + [f"div_{d}" for d in INTL_DIV_LEVELS]
    dataset_sha = hashlib.sha256(
        json.dumps(manifest["files"], sort_keys=True).encode("utf-8")
    ).hexdigest()

    model_artifact = {
        "type": "multinomial_logistic",
        "codename": "PitchLab Meridian v1.0",
        "version": "1.0.0",
        "status": "candidate",
        "production_activated": False,
        "production_enabled": False,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "seed": MODEL_SEED,
        "regularization_C": float(best_c),
        "sample_half_life_days": float(best_hl),
        "features": feature_names_full,
        "n_features_base": len(INTL_BASE_38_FEATURES),
        "div_levels": list(INTL_DIV_LEVELS),
        "imputer": {
            "strategy": "median",
            "statistics": [float(v) for v in imp_f.statistics_.tolist()],
        },
        "scaler": {
            "mean": [float(v) for v in sc_f.mean_.tolist()],
            "scale": [float(v) for v in sc_f.scale_.tolist()],
        },
        "coef": [[float(x) for x in row] for row in lr_f.coef_.tolist()],
        "intercept": [float(x) for x in lr_f.intercept_.tolist()],
        "classes": [int(c) for c in lr_f.classes_.tolist()],
        "intl_physics_config": {
            "elo_hfa_points": ELO_HFA_POINTS,
            "elo_k_by_regime": ELO_K_BY_REGIME,
            "regime_base_goal_mu": REGIME_BASE_GOAL_MU,
            "regime_dc_rho": REGIME_DC_RHO,
            "squad_club_bridge": SQUAD_CLUB_BRIDGE_CONFIG,
        },
        "metadata": {
            "trained_on": (
                f"martj42/international_results (CC0 1.0) warmup 1960..1997 + train {MODERN_TRAIN_MIN_YEAR}..2025-02-01 "
                "(strictly < 2025-02-02 holdout cut) + ClubElo causal bridge + ISA altitude/diaspora physics"
            ),
            "n_matches": int(len(modern_df)),
            "seasons": [str(modern_df["season"].min()), str(modern_df["season"].max())],
            "target": "0=H, 1=D, 2=A (90-min regulation)",
            "train_log_loss": round(train_ll, 6),
            "notes": (
                "PitchLab Meridian v1.0: motor de selecciones compatible 1:1 con engine.ts::ModelArtifact "
                "y outlook.ts::MatchOutlook. Cero apuestas activadas (status=candidate, production_activated=false)."
            ),
        },
        "dataset_sha256": dataset_sha,
    }
    MODEL_JSON_OUT.write_text(json.dumps(model_artifact, indent=1), encoding="utf-8")

    # 6. Exportar snapshot de paridad TS <-> Python (`200` partidos `< 2025-02-02`)
    rng = np.random.default_rng(MODEL_SEED)
    recent_dev_pool = modern_df[modern_df["year"] >= 2022].copy()
    if len(recent_dev_pool) > 200:
        chosen_idx = np.sort(rng.choice(len(recent_dev_pool), size=200, replace=False))
        snap_df = recent_dev_pool.iloc[chosen_idx].copy()
    else:
        snap_df = recent_dev_pool.copy()

    X_snap = build_design_matrix(snap_df)
    P_snap = predict_logit_bundle_exact(imp_f, sc_f, lr_f, X_snap)
    snap_rows: dict[str, Any] = {}
    for idx_s, row_s in enumerate(snap_df.itertuples(index=False)):
        reg_s = str(row_s.div)
        feats_s = [float(getattr(row_s, col)) for col in INTL_BASE_38_FEATURES]
        div_oh_s = [1 if lvl == reg_s else 0 for lvl in INTL_DIV_LEVELS]
        rho_s = REGIME_DC_RHO.get(reg_s, -0.09)
        lh_s, la_s = _fit_dc_lambdas_from_1x2_row(
            float(P_snap[idx_s, 0]), float(P_snap[idx_s, 1]), float(P_snap[idx_s, 2]), rho_s
        )
        snap_rows[str(row_s.match_id)] = {
            "div": reg_s,
            "season": str(row_s.season),
            "match_date": str(row_s.date_str),
            "home_code": str(row_s.home_code),
            "away_code": str(row_s.away_code),
            "features": feats_s,
            "div_onehot": div_oh_s,
            "probs_python": [float(P_snap[idx_s, 0]), float(P_snap[idx_s, 1]), float(P_snap[idx_s, 2])],
            "dc_lam_home_python": float(lh_s),
            "dc_lam_away_python": float(la_s),
            "dc_rho": float(rho_s),
        }
    snapshot_payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "model_version": "1.0.0",
        "holdout_cut_respected": True,
        "n": len(snap_rows),
        "rows": snap_rows,
    }
    SNAPSHOT_JSON_OUT.write_text(json.dumps(snapshot_payload, indent=1), encoding="utf-8")

    # 7. Estado causal vivo para inferencia actual (proyecta únicamente acumuladores online hacia adelante
    #    con fórmulas congeladas, SIN re-entrenar ni re-escalar ningún peso del modelo!)
    (ARTIFACTS_DIR / "causal_state_dev_pre_holdout.json").write_text(
        json.dumps({"as_of_cut": HOLDOUT_CUT_DATE, "teams": dev_causal_states}, indent=1),
        encoding="utf-8",
    )
    all_matches_df, _ = fetch_and_normalize_all_intl_matches(export_history_jsonl=False)
    _, live_causal_states = build_intl_causal_dataset(all_matches_df, enforce_before_holdout=False)
    max_obs_date = str(all_matches_df["date_str"].max()) if not all_matches_df.empty else HOLDOUT_CUT_DATE
    live_state_payload = {
        "schema_version": "intl_causal_state_v1.0.0",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "max_observed_match_date": max_obs_date,
        "weights_trained_strictly_before": HOLDOUT_CUT_DATE,
        "n_federations": len(live_causal_states),
        "regime_dc_rho": REGIME_DC_RHO,
        "regime_base_goal_mu": REGIME_BASE_GOAL_MU,
        "teams": live_causal_states,
    }
    CAUSAL_STATE_JSON_OUT.write_text(json.dumps(live_state_payload, indent=1), encoding="utf-8")

    model_sha = hashlib.sha256(MODEL_JSON_OUT.read_bytes()).hexdigest()
    state_sha = hashlib.sha256(CAUSAL_STATE_JSON_OUT.read_bytes()).hexdigest()
    cal_sha = hashlib.sha256(CALIBRATION_JSON_OUT.read_bytes()).hexdigest()
    snap_sha = hashlib.sha256(SNAPSHOT_JSON_OUT.read_bytes()).hexdigest()

    results_summary = {
        "experiment_id": "EXP_V33_intl_soccer",
        "codename": "PitchLab Meridian v1.0",
        "eval_split": "walk_forward_dev",
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "n_dev_matches_total": int(len(dev_matches_df)),
        "n_modern_train_1998_pre_cut": int(len(modern_df)),
        "n_walk_forward_eval_2010_2024": int(len(oof_meta)),
        "selected_hyperparams_val_2010_2019": {
            "regularization_C": best_c,
            "sample_half_life_days": best_hl,
            "val_log_loss": round(best_val_ll, 6),
            "grid_search": val_scores,
        },
        "walk_forward_dev_2010_2024": {
            k: {mk: mv for mk, mv in v.items() if mk != "reliability_bins"}
            for k, v in metrics_dev_full.items()
        },
        "ablation_geo_altitude_club_bridge": ablation_eval,
        "meridian_v1_vs_base_rate": {
            k: v for k, v in logit_vs_base_eval.items() if k != "reliability_bins"
        },
        "dev_oos_2020_2024": metrics_dev_2020_2024,
        "regime_breakdown_1x2": regime_breakdown,
        "artifacts_sha256": {
            "model_intl_soccer_v1.json": model_sha,
            "intl_soccer_causal_state.json": state_sha,
            "intl_outlook_calibration_v1.json": cal_sha,
            "intl_soccer_snapshot.json": snap_sha,
        },
    }
    RESULTS_JSON_OUT.write_text(json.dumps(results_summary, indent=2), encoding="utf-8")

    if record_trial:
        trial_entry = {
            "timestamp_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "experiment_id": "EXP_V33_intl_soccer",
            "eval_split": "walk_forward_dev",
            "unlock_holdout": False,
            "n_eval": int(len(oof_meta)),
            "log_loss": metrics_dev_full["meridian_v1_logit"]["log_loss"],
            "log_loss_ci95": metrics_dev_full["meridian_v1_logit"]["log_loss_ci95"],
            "delta_ll_vs_elo": metrics_dev_full["meridian_v1_logit"]["delta_ll_vs_benchmark"],
            "delta_ll_vs_elo_ci95": metrics_dev_full["meridian_v1_logit"]["delta_ll_ci95"],
            "model_sha256": model_sha,
        }
        with TRIAL_REGISTRY_OUT.open("a", encoding="utf-8") as rfh:
            rfh.write(json.dumps(trial_entry) + "\n")

    return results_summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Ejecuta EXP_V33_intl_soccer (PitchLab Meridian v1.0).")
    parser.add_argument("--record-trial", action="store_true", help="Registra corrida en trial_registry_intl.jsonl")
    parser.add_argument("--force-download", action="store_true", help="Re-descarga CSVs crudos de GitHub")
    args = parser.parse_args()

    res = run_pipeline(record_trial=args.record_trial, force_download=args.force_download)
    m_logit = res["walk_forward_dev_2010_2024"]["meridian_v1_logit"]
    m_elo = res["walk_forward_dev_2010_2024"]["intl_elo_baseline"]
    m_base = res["walk_forward_dev_2010_2024"]["base_rate_regime"]
    abl = res["ablation_geo_altitude_club_bridge"]
    print(f"[EXP_V33_intl_soccer] n_eval={res['n_walk_forward_eval_2010_2024']} (< {HOLDOUT_CUT_DATE})")
    print(f"  base_rate_regime   LL = {m_base['log_loss']:.5f} {m_base['log_loss_ci95']}")
    print(f"  intl_elo_baseline  LL = {m_elo['log_loss']:.5f} {m_elo['log_loss_ci95']}")
    print(
        f"  meridian_v1_logit  LL = {m_logit['log_loss']:.5f} {m_logit['log_loss_ci95']} "
        f"| ECE = {m_logit['ece']:.5f} | ΔLL vs Elo = {m_logit['delta_ll_vs_benchmark']:+.5f} {m_logit['delta_ll_ci95']} ({m_logit['significance']})"
    )
    print(
        f"  Ablación Geo+Alt+ClubElo: ΔLL = {abl['delta_ll_vs_benchmark']:+.5f} {abl['delta_ll_ci95']} ({abl['significance']})"
    )


if __name__ == "__main__":
    main()
