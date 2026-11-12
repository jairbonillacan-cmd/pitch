"""Evaluación causal `walk_forward_dev` (`A3`), registro de trial y exportación del candidato `EXP_V32_nfl_epa` (Agente B9).

Ejecuta:
1. Construcción estrictamente causal (`w' < w`, `< 2025-02-02T17:30:00Z`) de las 41 features (`29` base Minkowski + `12` EPA/Success%/Pressure/QB CPOE+EPA).
2. Selección de hiperparámetro `C` exclusivamente sobre pliegues `VAL` (`2010..2019`) dentro de `walk_forward_dev`.
3. Walk-forward anual (`2010..2024`, `< 2025-02-02T17:30:00Z`, `3,903` partidos totales / `3,890` sin empate) comparando:
   - `v3_0_live_4_of_29` (`PitchLab Minkowski v3.0` bajo cobertura en vivo actual `4/29 = 13.79%`)
   - `v3_0_logit_29` (`PitchLab Minkowski v3.0` Logit `29/29` histórico)
   - `v3_0_blend_29` (`PitchLab Minkowski v3.0` Blend `75% Logit + 25% HGB`, baseline `A3`/`B4`)
   - `v3_2_live_25_of_41` (`EXP_V32_nfl_epa` Logit simulando modo vivo solo-equipo `25/41 = 60.98%`)
   - `v3_2_live_35_of_41` (`EXP_V32_nfl_epa` Logit simulando modo vivo causal franquicia+QB `35/41 = 85.37%`)
   - `v3_2_epa_logit_41` (`EXP_V32_nfl_epa` Logit `41/41` exportable a TS)
   - `v3_2_epa_blend_41` (`EXP_V32_nfl_epa` Blend `75% Logit + 25% HGB` `41/41`)
4. Evaluación en el arnés oficial `A3` (`services/models/backtest.py`, `eval_split="walk_forward_dev"`, `unlock_holdout=False`), registrando apendizando en `services/models/artifacts/holdout_trial_registry.jsonl` cuando se pasa `--record-trial`.
5. Bootstrap determinista `mulberry32` (`1,000` remuestreos, semilla `20261111`) para `Log-Loss`, `Brier`, `RPS`, `ECE` y `ΔLL` pareado contra:
   - Baseline `v3.0` (`4/29` vivo y `29/29` histórico)
   - Línea de consenso de `nflverse` desvigorizada (**etiquetada explícitamente `"sin cierre sharp"`**)
   - Verificación contra `nfl_sharp_closing.parquet` de `B6` (`13` juegos prospectivos, `0 < 64` liquidados -> `DESCONOCIDO`).
6. Exportación del artefacto candidato `src/data/prediction/model_nfl_v3_2_candidate.json` marcado explícitamente `"status": "candidate"`, `"production_activated": false` (sin conectar a producción).
"""

from __future__ import annotations

import os

# Hilos moderados para HistGradientBoosting sin contención en Windows
os.environ.setdefault("OMP_NUM_THREADS", "4")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("NUMEXPR_NUM_THREADS", "1")
os.environ.setdefault("LOKY_MAX_CPU_COUNT", "1")

import argparse
import hashlib
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

EXP_DIR = Path(__file__).resolve().parent
REPO_ROOT = EXP_DIR.parents[3]
PRED_LAB_ROOT = REPO_ROOT / "research" / "prediction-lab"
CANDIDATE_JSON_OUT = REPO_ROOT / "src" / "data" / "prediction" / "model_nfl_v3_2_candidate.json"
FROZEN_V30_MODEL_JSON = REPO_ROOT / "src" / "data" / "prediction" / "model_nfl.json"
LIVE_SNAPSHOT_JSON = REPO_ROOT / "src" / "data" / "prediction" / "live_matchday_v3_snapshot.json"
SHARP_CLOSING_PARQUET = PRED_LAB_ROOT / "data" / "processed" / "nfl_sharp_closing.parquet"

for p in (str(REPO_ROOT), str(EXP_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

from services.ingest.nfl_sharp_closing import evaluate_nfl_corpus_gate  # noqa: E402
from services.models import backtest as bt  # noqa: E402
from services.models import outlook_calibration as oc  # noqa: E402

from causal_epa_features import (  # noqa: E402
    BASE_29_FEATURES,
    CANDIDATE_41_FEATURES,
    EPA_12_FEATURES,
    build_causal_epa_dataset,
    canonical_franchise,
    load_dev_nfl_base_features,
    synthesize_live_row_from_causal_state,
)
from pbp_ingest import (  # noqa: E402
    ARTIFACTS_DIR,
    HOLDOUT_CUT_DATE,
    HOLDOUT_CUT_ISO,
    HOLDOUT_CUT_TS,
    HoldoutSealedAccessError,
    assert_dates_strictly_before_holdout,
    build_or_load_pbp_game_aggregates,
)

FIRST_TRAIN_SEASON = 1999
FIRST_EVAL_SEASON = 2010
VAL_MAX_SEASON = 2019
TIE_RATE_FLOOR = 0.002
PROB_CLIP = 1e-6
BOOTSTRAP_SAMPLES = 1000
BOOTSTRAP_SEED = 20261111

HGB_PARAMS: dict[str, Any] = {
    "loss": "log_loss",
    "max_depth": 3,
    "max_leaf_nodes": 7,
    "min_samples_leaf": 80,
    "learning_rate": 0.03,
    "max_iter": 100,
    "l2_regularization": 8.0,
    "random_state": 42,
}

LIVE_V30_OBSERVED_FEATURES = {"is_indoor", "neutral_site", "wind_outdoor", "cold_outdoor"}
LIVE_V32_MISSING_SCHEDULE_FEATURES = {
    "qb_change_home",
    "qb_change_away",
    "coach_change_home",
    "coach_change_away",
    "rest_diff",
    "prev_ot_diff",
}
LIVE_V32_TEAM_ONLY_EXTRA_MISSING = {
    "qb_elo_diff",
    "qb_val_over_team_home",
    "qb_val_over_team_away",
    "qb_starts_diff",
    "coach_elo_diff",
    "qb_epa_per_db_diff",
    "qb_cpoe_diff",
}

FORBIDDEN_PUBLIC_DICT_KEYS = {
    "stake",
    "kelly",
    "kellyfraction",
    "ev",
    "expectededge",
    "edge",
    "tier",
    "valuestatus",
}


def fit_minkowski_logit_pipeline(
    X_arr: np.ndarray,
    y_arr: np.ndarray,
    c_reg: float,
    sample_weight: np.ndarray | None = None,
) -> Pipeline:
    """Ajusta el predictor logístico 2-vías con geometría hiperbólica de empate, 100% compatible con `engine.ts::predictNFL`."""
    scaler = StandardScaler().fit(X_arr)
    X_sc = scaler.transform(X_arr)
    nt = y_arr != 1
    y_bin = (y_arr[nt] == 0).astype(int)
    sw = sample_weight[nt] if sample_weight is not None else None

    lr_bin = LogisticRegression(C=float(c_reg), max_iter=5000, solver="lbfgs")
    lr_bin.fit(X_sc[nt], y_bin, sample_weight=sw)

    w_bin = lr_bin.coef_[0]
    b_bin = float(lr_bin.intercept_[0])
    tau = float(max(np.mean(y_arr == 1), TIE_RATE_FLOOR))
    b_tie = math.log(2.0 * tau * math.cosh(0.32) / (1.0 - tau))

    clf = LogisticRegression(C=float(c_reg), max_iter=5000, solver="lbfgs")
    clf.classes_ = np.array([0, 1, 2], dtype=int)
    clf.coef_ = np.vstack([0.5 * w_bin, np.zeros_like(w_bin), -0.5 * w_bin])
    clf.intercept_ = np.array([0.5 * b_bin, b_tie, -0.5 * b_bin], dtype="float64")
    clf.n_features_in_ = X_arr.shape[1]
    return Pipeline([("scale", scaler), ("clf", clf)])


def fit_minkowski_hgb(
    X_arr: np.ndarray,
    y_arr: np.ndarray,
    sample_weight: np.ndarray | None = None,
) -> tuple[HistGradientBoostingClassifier, float]:
    tau = float(max(np.mean(y_arr == 1), TIE_RATE_FLOOR))
    nt = y_arr != 1
    y_bin = (y_arr[nt] == 0).astype(int)
    sw = sample_weight[nt] if sample_weight is not None else None
    hgb = HistGradientBoostingClassifier(**HGB_PARAMS)
    hgb.fit(X_arr[nt], y_bin, sample_weight=sw)
    return hgb, tau


def predict_logit_3way_exact(pipe: Pipeline, X_arr: np.ndarray, mask_imputed_cols: list[int] | None = None) -> np.ndarray:
    """Evalúa `softmax3(coef @ z + intercept)` idéntico a `engine.ts::predictNFL` (con imputación a media si aplica)."""
    scaler: StandardScaler = pipe.named_steps["scale"]
    clf: LogisticRegression = pipe.named_steps["clf"]
    mean = scaler.mean_.astype(np.float64)
    scale = np.where(scaler.scale_ == 0.0, 1.0, scaler.scale_.astype(np.float64))
    X_work = np.array(X_arr, dtype=np.float64, copy=True)
    if mask_imputed_cols:
        for col_idx in mask_imputed_cols:
            X_work[:, col_idx] = mean[col_idx]
    nan_mask = ~np.isfinite(X_work)
    if bool(nan_mask.any()):
        X_work = np.where(nan_mask, mean[np.newaxis, :], X_work)
    z = (X_work - mean[np.newaxis, :]) / scale[np.newaxis, :]
    logits = z @ clf.coef_.T + clf.intercept_[np.newaxis, :]
    logits_shift = logits - np.max(logits, axis=1, keepdims=True)
    exp_l = np.exp(logits_shift)
    probs = exp_l / np.sum(exp_l, axis=1, keepdims=True)
    return probs


def predict_hgb_3way(hgb: HistGradientBoostingClassifier, tau: float, X_arr: np.ndarray) -> np.ndarray:
    p_h = hgb.predict_proba(X_arr)[:, 1]
    raw = np.column_stack([(1.0 - tau) * p_h, np.full(len(X_arr), tau), (1.0 - tau) * (1.0 - p_h)])
    raw = np.clip(raw, PROB_CLIP, None)
    return raw / raw.sum(axis=1, keepdims=True)


def normalize_2way_from_3way(probs3: np.ndarray) -> np.ndarray:
    ph = probs3[:, 0]
    pa = probs3[:, 2]
    denom = np.maximum(1e-12, ph + pa)
    return np.column_stack([ph / denom, pa / denom])


def paired_delta_ll_mulberry32(
    probs_cand_2way: np.ndarray,
    probs_ref_2way: np.ndarray,
    y_bin: np.ndarray,
    *,
    n_bootstrap: int = BOOTSTRAP_SAMPLES,
    seed: int = BOOTSTRAP_SEED,
) -> dict[str, Any]:
    """Bootstrap pareado determinista `mulberry32` sobre `ΔLL = LL(cand) - LL(ref)` (`< 0` favorece al candidato)."""
    n = len(y_bin)
    p_c = np.clip(probs_cand_2way[np.arange(n), y_bin], 1e-15, 1.0)
    p_r = np.clip(probs_ref_2way[np.arange(n), y_bin], 1e-15, 1.0)
    ll_c = -np.log(p_c)
    ll_r = -np.log(p_r)
    diff_vec = ll_c - ll_r
    point_delta = float(np.mean(diff_vec))

    u = oc.mulberry32_uniforms(int(seed), int(n_bootstrap) * n)
    idx_mat = np.minimum(n - 1, np.floor(u * n).astype(np.int64)).reshape((int(n_bootstrap), n))
    boot_deltas = diff_vec[idx_mat].mean(axis=1)
    boot_sorted = np.sort(boot_deltas)
    lo = oc.quantile_linear_sorted(boot_sorted, 0.025)
    hi = oc.quantile_linear_sorted(boot_sorted, 0.975)
    crosses_zero = bool(lo <= 0.0 <= hi)
    sig_label = "no significativa" if crosses_zero else "significativa"
    frac_cand_better = float(np.mean(boot_deltas < 0.0))
    return {
        "n": int(n),
        "delta_ll": point_delta,
        "delta_ll_ci95": [lo, hi],
        "significant": not crosses_zero,
        "significance": sig_label,
        "frac_bootstrap_candidate_better": frac_cand_better,
    }


def select_c_on_val_2010_2019(
    wf_df: pd.DataFrame,
    feature_cols: list[str],
    c_grid: tuple[float, ...] = (0.002, 0.004, 0.006, 0.008, 0.012),
) -> tuple[float, dict[str, float]]:
    """Selecciona `C` minimizando log-loss 2-vías exclusivamente en `VAL` (`2010..2019` dentro de `walk_forward_dev`)."""
    val_seasons = [s for s in sorted(wf_df["season"].unique()) if FIRST_EVAL_SEASON <= int(s) <= VAL_MAX_SEASON]
    scores: dict[str, float] = {}
    best_c = 0.008
    best_ll = float("inf")

    for c_val in c_grid:
        ll_list: list[np.ndarray] = []
        for s in val_seasons:
            tr = wf_df[(wf_df["season"] >= FIRST_TRAIN_SEASON) & (wf_df["season"] < s)]
            te = wf_df[wf_df["season"] == s]
            X_tr = tr[feature_cols].to_numpy(dtype=np.float64)
            y_tr = tr["y"].to_numpy(dtype=int)
            sw = 0.5 ** ((s - 1 - tr["season"].to_numpy(dtype=np.float64)) / 10.0)
            pipe = fit_minkowski_logit_pipeline(X_tr, y_tr, c_val, sample_weight=sw)
            X_te = te[feature_cols].to_numpy(dtype=np.float64)
            p3 = predict_logit_3way_exact(pipe, X_te)
            p2 = normalize_2way_from_3way(p3)
            y_te = te["y"].to_numpy(dtype=int)
            nt = y_te != 1
            yb = np.where(y_te[nt] == 0, 0, 1)
            p_true = np.clip(p2[nt][np.arange(int(nt.sum())), yb], 1e-15, 1.0)
            ll_list.append(-np.log(p_true))
        mean_ll = float(np.mean(np.concatenate(ll_list)))
        scores[f"{c_val:.4f}"] = mean_ll
        if mean_ll < best_ll:
            best_ll = mean_ll
            best_c = float(c_val)
    return best_c, scores


def run_nfl_walk_forward_dev_models(
    wf_df: pd.DataFrame,
    best_c_cand: float,
) -> pd.DataFrame:
    """Ejecuta el walk-forward anual `2010..2024` (`< 2025-02-02`) para baseline `v3.0` y candidato `v3.2`."""
    assert_dates_strictly_before_holdout(wf_df["gameday"], context="run_nfl_walk_forward_dev_models")
    eval_seasons = [s for s in sorted(wf_df["season"].unique()) if int(s) >= FIRST_EVAL_SEASON]

    imp_v30_live = [i for i, f in enumerate(BASE_29_FEATURES) if f not in LIVE_V30_OBSERVED_FEATURES]
    imp_v32_live_35 = [i for i, f in enumerate(CANDIDATE_41_FEATURES) if f in LIVE_V32_MISSING_SCHEDULE_FEATURES]
    imp_v32_live_25 = [
        i
        for i, f in enumerate(CANDIDATE_41_FEATURES)
        if (f in LIVE_V32_MISSING_SCHEDULE_FEATURES or f in LIVE_V32_TEAM_ONLY_EXTRA_MISSING)
    ]

    # Baseline oficial `v3.0` Blend de `A3`/`B4` (estrictamente filtrado a `< 2025-02-02`)
    v30_preds_csv = pd.read_csv(PRED_LAB_ROOT / "models" / "nfl" / "artifacts" / "predictions.csv")
    v30_preds_dev = v30_preds_csv[
        (v30_preds_csv["model"] == "blend")
        & (v30_preds_csv["gameday"].astype(str).str[:10] < HOLDOUT_CUT_DATE)
    ].copy()
    assert_dates_strictly_before_holdout(v30_preds_dev["gameday"], context="v30_preds_dev")
    v30_blend_map: dict[str, tuple[float, float, float]] = {
        str(r.game_id): (float(r.p_home), float(r.p_draw), float(r.p_away))
        for r in v30_preds_dev.itertuples(index=False)
    }

    fold_frames: list[pd.DataFrame] = []
    for s in eval_seasons:
        tr = wf_df[(wf_df["season"] >= FIRST_TRAIN_SEASON) & (wf_df["season"] < s)]
        te = wf_df[wf_df["season"] == s].copy()
        if (tr["gameday"].astype(str) >= te["gameday"].astype(str).min()).any():
            raise bt.DataLeakageError(f"Fuga temporal en fold NFL {s}")

        y_tr = tr["y"].to_numpy(dtype=int)
        sw = 0.5 ** ((s - 1 - tr["season"].to_numpy(dtype=np.float64)) / 10.0)

        # Baseline v3.0 (29 features, C=0.008 fijo de v3.0)
        X_tr_29 = tr[BASE_29_FEATURES].to_numpy(dtype=np.float64)
        X_te_29 = te[BASE_29_FEATURES].to_numpy(dtype=np.float64)
        pipe_29 = fit_minkowski_logit_pipeline(X_tr_29, y_tr, 0.008, sample_weight=sw)

        p3_v30_live4 = predict_logit_3way_exact(pipe_29, X_te_29, mask_imputed_cols=imp_v30_live)
        p3_v30_logit = predict_logit_3way_exact(pipe_29, X_te_29)
        p3_v30_blend = np.array(
            [
                v30_blend_map.get(str(gid), (float(p3_v30_logit[i, 0]), float(p3_v30_logit[i, 1]), float(p3_v30_logit[i, 2])))
                for i, gid in enumerate(te["game_id"].astype(str).tolist())
            ],
            dtype=np.float64,
        )
        p3_v30_blend = np.clip(p3_v30_blend, PROB_CLIP, None)
        p3_v30_blend /= p3_v30_blend.sum(axis=1, keepdims=True)

        # Candidato v3.2 EPA (41 features, C seleccionado en VAL 2010..2019)
        X_tr_41 = tr[CANDIDATE_41_FEATURES].to_numpy(dtype=np.float64)
        X_te_41 = te[CANDIDATE_41_FEATURES].to_numpy(dtype=np.float64)
        pipe_41 = fit_minkowski_logit_pipeline(X_tr_41, y_tr, best_c_cand, sample_weight=sw)
        hgb_41, tau_41 = fit_minkowski_hgb(X_tr_41, y_tr, sample_weight=sw)

        p3_v32_live25 = predict_logit_3way_exact(pipe_41, X_te_41, mask_imputed_cols=imp_v32_live_25)
        p3_v32_live35 = predict_logit_3way_exact(pipe_41, X_te_41, mask_imputed_cols=imp_v32_live_35)
        p3_v32_logit = predict_logit_3way_exact(pipe_41, X_te_41)
        p3_v32_hgb = predict_hgb_3way(hgb_41, tau_41, X_te_41)
        p3_v32_blend = np.clip(0.75 * p3_v32_logit + 0.25 * p3_v32_hgb, PROB_CLIP, None)
        p3_v32_blend /= p3_v32_blend.sum(axis=1, keepdims=True)

        out_te = te[["game_id", "season", "week", "gameday", "home_team", "away_team", "home_score", "away_score", "y"]].copy()
        for tag, p3 in (
            ("v3_0_live_4_of_29", p3_v30_live4),
            ("v3_0_logit_29", p3_v30_logit),
            ("v3_0_blend_29", p3_v30_blend),
            ("v3_2_live_25_of_41", p3_v32_live25),
            ("v3_2_live_35_of_41", p3_v32_live35),
            ("v3_2_epa_logit_41", p3_v32_logit),
            ("v3_2_epa_blend_41", p3_v32_blend),
        ):
            p2 = normalize_2way_from_3way(p3)
            out_te[f"{tag}_ph3"] = p3[:, 0]
            out_te[f"{tag}_pt3"] = p3[:, 1]
            out_te[f"{tag}_pa3"] = p3[:, 2]
            out_te[f"{tag}_ph2"] = p2[:, 0]
            out_te[f"{tag}_pa2"] = p2[:, 1]
        fold_frames.append(out_te)

    return pd.concat(fold_frames, ignore_index=True)


def build_candidate_json_artifact(
    wf_df: pd.DataFrame,
    causal_state: dict[str, Any],
    best_c_cand: float,
    eval_summary: dict[str, Any],
) -> dict[str, Any]:
    """Entrena el artefacto candidato exclusivamente sobre `walk_forward_dev` (`< 2025-02-02T17:30:00Z`)
    y precomputa las filas en vivo para `live_matchday_v3_snapshot.json` sin activar producción.
    """
    assert_dates_strictly_before_holdout(wf_df["gameday"], context="build_candidate_json_artifact")
    train_dev = wf_df[wf_df["season"] >= FIRST_TRAIN_SEASON].copy()
    max_s = int(train_dev["season"].max())
    if max_s > 2024:
        raise HoldoutSealedAccessError(f"Temporada {max_s} prohibida en entrenamiento del candidato.")

    X_tr = train_dev[CANDIDATE_41_FEATURES].to_numpy(dtype=np.float64)
    y_tr = train_dev["y"].to_numpy(dtype=int)
    sw = 0.5 ** ((max_s - train_dev["season"].to_numpy(dtype=np.float64)) / 10.0)

    pipe = fit_minkowski_logit_pipeline(X_tr, y_tr, best_c_cand, sample_weight=sw)
    scaler: StandardScaler = pipe.named_steps["scale"]
    clf: LogisticRegression = pipe.named_steps["clf"]

    # Copiar `stadium_physics` en solo lectura desde `model_nfl.json` sin modificarlo
    frozen_v30 = json.loads(FROZEN_V30_MODEL_JSON.read_text(encoding="utf-8"))
    stadium_physics = frozen_v30.get("live_v3", {}).get("stadium_physics", {})

    # Precomputar filas causales en vivo para los 46 enfrentamientos NFL de `live_matchday_v3_snapshot.json`
    live_snap = json.loads(LIVE_SNAPSHOT_JSON.read_text(encoding="utf-8"))
    master_by_slug: dict[str, dict[str, Any]] = {}
    for tm in live_snap.get("team_master_records", []):
        if str(tm.get("league", "")).lower() == "nfl" or str(tm.get("sport", "")).lower() == "nfl":
            slug = "".join(ch for ch in str(tm.get("team_name", "")).lower() if ch.isalnum())
            master_by_slug[slug] = tm

    # Mapa slug nombre completo -> abreviatura NFL
    nfl_name_to_abbr: dict[str, str] = {
        "arizonacardinals": "ARI", "atlantafalcons": "ATL", "baltimoreravens": "BAL", "buffalobills": "BUF",
        "carolinapanthers": "CAR", "chicagobears": "CHI", "cincinnatibengals": "CIN", "clevelandbrowns": "CLE",
        "dallascowboys": "DAL", "denverbroncos": "DEN", "detroitlions": "DET", "greenbaypackers": "GB",
        "houstontexans": "HOU", "indianapoliscolts": "IND", "jacksonvillejaguars": "JAX", "kansascitychiefs": "KC",
        "lasvegasraiders": "LV", "losangeleschargers": "LAC", "losangelesrams": "LA", "miamidolphins": "MIA",
        "minnesotavikings": "MIN", "newenglandpatriots": "NE", "neworleanssaints": "NO", "newyorkgiants": "NYG",
        "newyorkjets": "NYJ", "philadelphiaeagles": "PHI", "pittsburghsteelers": "PIT", "sanfrancisco49ers": "SF",
        "seattleseahawks": "SEA", "tampabaybuccaneers": "TB", "tennesseetitans": "TEN", "washingtoncommanders": "WAS",
    }
    for ab in list(nfl_name_to_abbr.values()):
        nfl_name_to_abbr[ab.lower()] = ab

    precomputed_live_rows: dict[str, dict[str, Any]] = {}
    coverage_ratios_35: list[float] = []
    coverage_ratios_25: list[float] = []
    for rec in live_snap.get("edge_matrix_records", []):
        if str(rec.get("league", "")).lower() != "nfl" and str(rec.get("sport", "")).lower() != "nfl":
            continue
        mid = str(rec["matchup_id"])
        hs = "".join(ch for ch in str(rec.get("home_team", "")).lower() if ch.isalnum())
        as_ = "".join(ch for ch in str(rec.get("away_team", "")).lower() if ch.isalnum())
        h_abbr = nfl_name_to_abbr.get(hs, canonical_franchise(str(rec.get("home_team", ""))))
        a_abbr = nfl_name_to_abbr.get(as_, canonical_franchise(str(rec.get("away_team", ""))))
        hm = master_by_slug.get(hs, {})
        roof_raw = str(hm.get("roof_type") or stadium_physics.get(h_abbr, {}).get("roof_type") or "open").lower()
        is_ind = 1.0 if roof_raw in ("dome", "closed", "indoor", "retractable") else 0.0
        wind_mph = float(rec.get("home_max_wind_speed_mph_7d") or hm.get("max_wind_speed_mph_7d") or 0.0)

        row_35 = synthesize_live_row_from_causal_state(
            h_abbr,
            a_abbr,
            causal_state,
            is_indoor=is_ind,
            neutral_site=0.0,
            wind_mph=wind_mph,
            temp_f=None,
            include_incumbent_qb_coach=True,
        )
        row_25 = synthesize_live_row_from_causal_state(
            h_abbr,
            a_abbr,
            causal_state,
            is_indoor=is_ind,
            neutral_site=0.0,
            wind_mph=wind_mph,
            temp_f=None,
            include_incumbent_qb_coach=False,
        )
        present_35 = sum(1 for v in row_35 if v is not None and math.isfinite(float(v)))
        present_25 = sum(1 for v in row_25 if v is not None and math.isfinite(float(v)))
        coverage_ratios_35.append(present_35 / len(CANDIDATE_41_FEATURES))
        coverage_ratios_25.append(present_25 / len(CANDIDATE_41_FEATURES))

        precomputed_live_rows[mid] = {
            "home_team": h_abbr,
            "away_team": a_abbr,
            "features": row_35,
        }

    p_tr3 = predict_logit_3way_exact(pipe, X_tr)
    train_ll = float(-np.mean(np.log(np.clip(p_tr3[np.arange(len(y_tr)), y_tr], 1e-15, 1.0))))
    tie_rate_tr = float(np.mean(y_tr == 1))

    artifact: dict[str, Any] = {
        "sport": "nfl",
        "type": "multinomial_logistic",
        "model_id": "nfl_logistic_v3_2_epa_candidate",
        "codename": "PitchLab Minkowski v3.2 EPA Candidate",
        "version": "3.2.0-candidate",
        "status": "candidate",
        "production_activated": False,
        "created_at": "2026-11-12T17:00:00Z",
        "seed": BOOTSTRAP_SEED,
        "features": list(CANDIDATE_41_FEATURES),
        "base_features_count": len(BASE_29_FEATURES),
        "epa_features_added": list(EPA_12_FEATURES),
        "n_features": len(CANDIDATE_41_FEATURES),
        "classes": [int(c) for c in clf.classes_.tolist()],
        "class_map": {"0": "H", "1": "T", "2": "A"},
        "scaler": {
            "mean": [float(x) for x in scaler.mean_.tolist()],
            "scale": [float(x) for x in scaler.scale_.tolist()],
        },
        "coef": [[float(v) for v in row] for row in clf.coef_.tolist()],
        "intercept": [float(v) for v in clf.intercept_.tolist()],
        "metadata": {
            "source": "nflverse play_by_play + games 1999..2024 (< 2025-02-02T17:30:00Z, walk_forward_dev only)",
            "n_matches": int(len(train_dev)),
            "seasons": [int(s) for s in sorted(train_dev["season"].unique())],
            "train_log_loss": round(train_ll, 6),
            "tie_rate": round(tie_rate_tr, 6),
            "notes": "Hipotesis candidata B9 (status=candidate, production_activated=false). Cero lectura de holdout_sealed.",
        },
        "hyperparams": {
            "C": float(best_c_cand),
            "selected_on_split": "walk_forward_dev_val_2010_2019",
            "sample_weight_half_life_seasons": 10.0,
            "team_in_season_decay": 0.88,
            "team_offseason_retention": 0.45,
            "team_prior_kappa_games": 6.0,
            "qb_prior_kappa_dropbacks": 120.0,
            "qb_prior_kappa_cpoe_passes": 140.0,
        },
        "governance": {
            "status": "candidate",
            "production_activated": False,
            "production_enabled": False,
            "hypothesis_status": "hipotesis_no_probada_solo_walk_forward_dev",
            "eval_split": "walk_forward_dev",
            "holdout_cut_iso": HOLDOUT_CUT_ISO,
            "holdout_untouched": True,
            "train_rows_dev": int(len(train_dev)),
            "train_seasons": f"{int(train_dev['season'].min())}..{int(train_dev['season'].max())} (< {HOLDOUT_CUT_DATE})",
            "benchmark_consensus_note": "nflverse_consensus_novig (sin cierre sharp)",
            "sharp_closing_corpus_status": "DESCONOCIDO (n_settled=0 < 64 en nfl_sharp_closing.parquet)",
        },
        "live_coverage_audit": {
            "baseline_v3_0_live": {
                "present": 4,
                "total": 29,
                "ratio": round(4.0 / 29.0, 6),
                "data_quality_flag": "low_coverage",
            },
            "candidate_v3_2_live_snapshot_incumbent_causal": {
                "n_live_matchups": len(precomputed_live_rows),
                "mean_present": round(float(np.mean(coverage_ratios_35)) * len(CANDIDATE_41_FEATURES), 4),
                "total": len(CANDIDATE_41_FEATURES),
                "mean_ratio": round(float(np.mean(coverage_ratios_35)), 6),
                "min_ratio": round(float(np.min(coverage_ratios_35)), 6),
                "data_quality_flag": "ok",
                "honest_null_fields": sorted(LIVE_V32_MISSING_SCHEDULE_FEATURES) + ["cold_outdoor (outdoor sin temp_f)"],
            },
            "candidate_v3_2_live_team_only_conservative": {
                "mean_present": round(float(np.mean(coverage_ratios_25)) * len(CANDIDATE_41_FEATURES), 4),
                "total": len(CANDIDATE_41_FEATURES),
                "mean_ratio": round(float(np.mean(coverage_ratios_25)), 6),
                "data_quality_flag": "ok",
            },
            "candidate_v3_2_prekickoff_with_schedule_and_starter": {
                "present": len(CANDIDATE_41_FEATURES),
                "total": len(CANDIDATE_41_FEATURES),
                "ratio": 1.0,
                "data_quality_flag": "ok",
            },
        },
        "live_v3": {
            "priors": {
                "w_net_epa": 0.0,
                "w_net_success_pct": 0.0,
            },
            "stadium_physics": stadium_physics,
        },
        "walk_forward_dev_metrics": eval_summary,
        "causal_state_v3_2": causal_state,
        "precomputed_live_rows": precomputed_live_rows,
    }
    assert_no_forbidden_keys_recursive(artifact, path="model_nfl_v3_2_candidate")
    return artifact


def assert_no_forbidden_keys_recursive(obj: Any, path: str = "root") -> None:
    if isinstance(obj, dict):
        for k, v in obj.items():
            kl = str(k).strip().lower()
            if kl in FORBIDDEN_PUBLIC_DICT_KEYS:
                raise ValueError(f"Clave pública prohibida `{k}` detectada en `{path}`.")
            assert_no_forbidden_keys_recursive(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for idx, item in enumerate(obj):
            if isinstance(item, str) and "pick seguro" in item.lower():
                raise ValueError(f"Texto prohibido `pick seguro` en `{path}[{idx}]`.")
            assert_no_forbidden_keys_recursive(item, f"{path}[{idx}]")


def run_full_experiment(
    *,
    record_trial: bool = False,
    registry_path: Path | None = None,
    force_retrain: bool = False,
) -> dict[str, Any]:
    """Ejecuta el pipeline completo `EXP_V32_nfl_epa`, guarda resultados y exporta el candidato inactivo."""
    tg_df, qb_df, pbp_manifest = build_or_load_pbp_game_aggregates(force_rebuild=False)
    causal_feats_path = ARTIFACTS_DIR / "nfl_dev_causal_41_features.parquet"
    causal_state_path = ARTIFACTS_DIR / "causal_state_dev.json"
    if not force_retrain and causal_feats_path.exists() and causal_state_path.exists():
        wf_eligible = pd.read_parquet(causal_feats_path)
        assert_dates_strictly_before_holdout(wf_eligible["gameday"], context="wf_eligible_cached")
        causal_state = json.loads(causal_state_path.read_text(encoding="utf-8"))
    else:
        base_dev = load_dev_nfl_base_features()
        full_dev_41, causal_state = build_causal_epa_dataset(base_dev, tg_df, qb_df)
        # Filtro idéntico a `backtest.py::_load_nfl_v3_0_walk_forward`: `(n_prior_home >= 3) & (n_prior_away >= 3)`
        wf_eligible = full_dev_41[(full_dev_41["n_prior_home"] >= 3) & (full_dev_41["n_prior_away"] >= 3)].reset_index(
            drop=True
        )
        assert_dates_strictly_before_holdout(wf_eligible["gameday"], context="wf_eligible")
        wf_eligible.to_parquet(causal_feats_path, index=False)
        causal_state_path.write_text(json.dumps(causal_state, indent=2), encoding="utf-8")

    best_c, val_c_grid = select_c_on_val_2010_2019(wf_eligible, CANDIDATE_41_FEATURES)
    oof_csv_path = ARTIFACTS_DIR / "oof_predictions_walk_forward_dev.csv"
    c_meta_path = ARTIFACTS_DIR / "oof_selected_c.json"
    if not force_retrain and oof_csv_path.exists():
        prev_c = json.loads(c_meta_path.read_text(encoding="utf-8"))["best_c"] if c_meta_path.exists() else best_c
        if abs(float(prev_c) - float(best_c)) < 1e-12:
            oof_df = pd.read_csv(oof_csv_path)
            assert_dates_strictly_before_holdout(oof_df["gameday"], context="oof_cached")
        else:
            oof_df = run_nfl_walk_forward_dev_models(wf_eligible, best_c)
            oof_df.to_csv(oof_csv_path, index=False)
            c_meta_path.write_text(json.dumps({"best_c": best_c}), encoding="utf-8")
    else:
        oof_df = run_nfl_walk_forward_dev_models(wf_eligible, best_c)
        oof_df.to_csv(oof_csv_path, index=False)
        c_meta_path.write_text(json.dumps({"best_c": best_c}), encoding="utf-8")

    # Cargar universo oficial `A3` (`walk_forward_dev` < 2025-02-02T17:30:00Z, descartando `holdout_sealed` al instante)
    probe_cfg = bt.BacktestConfig()
    odds_all = bt._load_odds_snapshots(probe_cfg)
    wanted_mkts = {bt.canonical_market(m) for m in probe_cfg.markets}
    min_year = min(int(probe_cfg.first_eval_season_soccer), int(probe_cfg.first_eval_season_nfl)) - 1
    shared_odds = odds_all[
        (odds_all["ts_event_start"] >= pd.Timestamp(f"{min_year}-01-01T00:00:00Z"))
        & odds_all["market_canon"].isin(wanted_mkts)
    ].reset_index(drop=True)
    shared_events = bt._build_baseline_v3_0_events(probe_cfg, shared_odds)
    shared_events = shared_events[shared_events["y"].notna()].copy()
    events_checked = bt.verify_events_frame_no_leakage(shared_events)

    dev_events, _sealed_holdout_unused, split_meta = bt.split_walk_forward_and_holdout(
        events_checked, holdout_fraction=probe_cfg.holdout_fraction
    )
    n_holdout_untouched = int(len(_sealed_holdout_unused))
    del _sealed_holdout_unused
    holdout_cut_ts = pd.Timestamp(split_meta["holdout_cut_ts"])
    oc.assert_no_holdout_events(dev_events, holdout_cut_ts, context="EXP_V32_dev_events")

    nfl_dev = dev_events[dev_events["sport"] == "nfl"].copy().reset_index(drop=True)
    nfl_odds = shared_odds[
        (shared_odds["sport_canon"] == "nfl") & (shared_odds["ts_event_start"] < holdout_cut_ts)
    ].copy()
    oc.assert_no_holdout_events(nfl_odds, holdout_cut_ts, context="EXP_V32_nfl_odds")

    # Alinear predicciones OOF de los 7 modelos con los `3,903` eventos NFL de `A3` (`raw_event_id == game_id`)
    aligned = nfl_dev[["event_id", "raw_event_id", "season", "ts_event_start", "home_score", "away_score", "y"]].merge(
        oof_df.drop(columns=["season", "home_score", "away_score", "y"]),
        left_on="raw_event_id",
        right_on="game_id",
        how="inner",
    )
    if len(aligned) != len(nfl_dev):
        raise RuntimeError(f"Desalineación en eventos NFL dev: {len(aligned)} vs {len(nfl_dev)}")

    # Extraer cuotas de consenso `nflverse` ("sin cierre sharp") igual que `B4` (`outlook_calibration.py`)
    nfl_cons_ml, _ = bt.bc._pivot_market_quotes_for_events(
        nfl_odds, "moneyline", ("home", "away"), "close", ("nflverse",)
    ) if hasattr(bt, "bc") else oc.bc._pivot_market_quotes_for_events(
        nfl_odds, "moneyline", ("home", "away"), "close", ("nflverse",)
    )

    n_nfl = len(aligned)
    has_cons = np.zeros(n_nfl, dtype=bool)
    cons_odds = np.full((n_nfl, 2), 1.91, dtype=np.float64)
    for i, eid in enumerate(aligned["event_id"].astype(str)):
        q = nfl_cons_ml.get(eid)
        if q is not None:
            cons_odds[i] = q
            has_cons[i] = True
    p_cons_2way = oc._devig_matrix_by_method(cons_odds, "power")

    non_tie_mask = np.abs(aligned["home_score"].to_numpy(dtype=np.float64) - aligned["away_score"].to_numpy(dtype=np.float64)) > 1e-9
    paired_cons_mask = non_tie_mask & has_cons
    y_nt = np.where(aligned.loc[non_tie_mask, "home_score"].to_numpy() > aligned.loc[non_tie_mask, "away_score"].to_numpy(), 0, 1)
    w_nt = np.ones(int(non_tie_mask.sum()), dtype=np.float64)
    y_pc = np.where(aligned.loc[paired_cons_mask, "home_score"].to_numpy() > aligned.loc[paired_cons_mask, "away_score"].to_numpy(), 0, 1)
    w_pc = np.ones(int(paired_cons_mask.sum()), dtype=np.float64)

    model_tags = [
        "v3_0_live_4_of_29",
        "v3_0_logit_29",
        "v3_0_blend_29",
        "v3_2_live_25_of_41",
        "v3_2_live_35_of_41",
        "v3_2_epa_logit_41",
        "v3_2_epa_blend_41",
    ]

    metrics_by_model: dict[str, Any] = {}
    for idx_m, tag in enumerate(model_tags):
        p2_all = aligned[[f"{tag}_ph2", f"{tag}_pa2"]].to_numpy(dtype=np.float64)
        cal_nt = oc.evaluate_calibration_with_bootstrap(
            p2_all[non_tie_mask],
            y_nt,
            active_weights=w_nt,
            n_resamples=BOOTSTRAP_SAMPLES,
            seed=BOOTSTRAP_SEED + 101 * idx_m,
            include_bins=True,
        )
        cal_pc = oc.evaluate_calibration_with_bootstrap(
            p2_all[paired_cons_mask],
            y_pc,
            active_weights=w_pc,
            n_resamples=BOOTSTRAP_SAMPLES,
            seed=BOOTSTRAP_SEED + 201 * idx_m,
            include_bins=False,
        )
        # Sub-particiones diagnósticas VAL (2010..2019) y DEV_OOS (2020..2024)
        s_int = aligned.loc[non_tie_mask, "season"].astype(int).to_numpy()
        val_m = s_int <= VAL_MAX_SEASON
        oos_m = s_int > VAL_MAX_SEASON
        p2_nt = p2_all[non_tie_mask]
        ll_val = float(-np.mean(np.log(np.clip(p2_nt[val_m][np.arange(int(val_m.sum())), y_nt[val_m]], 1e-15, 1.0))))
        ll_oos = float(-np.mean(np.log(np.clip(p2_nt[oos_m][np.arange(int(oos_m.sum())), y_nt[oos_m]], 1e-15, 1.0))))

        metrics_by_model[tag] = {
            "walk_forward_dev_non_tie": cal_nt,
            "walk_forward_dev_paired_consensus_sin_cierre_sharp": cal_pc,
            "subsplits_non_tie": {
                "val_2010_2019_n": int(val_m.sum()),
                "val_2010_2019_ll": ll_val,
                "dev_oos_2020_2024_n": int(oos_m.sum()),
                "dev_oos_2020_2024_ll": ll_oos,
            },
        }

    # Consenso nflverse ("sin cierre sharp")
    cons_cal = oc.evaluate_calibration_with_bootstrap(
        p_cons_2way[paired_cons_mask],
        y_pc,
        active_weights=w_pc,
        n_resamples=BOOTSTRAP_SAMPLES,
        seed=BOOTSTRAP_SEED + 999,
        include_bins=True,
    )

    # Comparaciones pareadas `ΔLL` con `mulberry32` (1,000 réplicas) y etiqueta obligatoria `"no significativa"` si cruza 0
    p_v30_live4 = aligned[["v3_0_live_4_of_29_ph2", "v3_0_live_4_of_29_pa2"]].to_numpy(dtype=np.float64)
    p_v30_logit = aligned[["v3_0_logit_29_ph2", "v3_0_logit_29_pa2"]].to_numpy(dtype=np.float64)
    p_v30_blend = aligned[["v3_0_blend_29_ph2", "v3_0_blend_29_pa2"]].to_numpy(dtype=np.float64)
    p_v32_live35 = aligned[["v3_2_live_35_of_41_ph2", "v3_2_live_35_of_41_pa2"]].to_numpy(dtype=np.float64)
    p_v32_logit = aligned[["v3_2_epa_logit_41_ph2", "v3_2_epa_logit_41_pa2"]].to_numpy(dtype=np.float64)
    p_v32_blend = aligned[["v3_2_epa_blend_41_ph2", "v3_2_epa_blend_41_pa2"]].to_numpy(dtype=np.float64)

    s_nt = aligned.loc[non_tie_mask, "season"].astype(int).to_numpy()
    oos_nt = s_nt > VAL_MAX_SEASON

    paired_comparisons = {
        "cand_logit_41_vs_v3_0_live_4_of_29_dev": paired_delta_ll_mulberry32(
            p_v32_logit[non_tie_mask], p_v30_live4[non_tie_mask], y_nt, seed=BOOTSTRAP_SEED + 11
        ),
        "cand_live_35_vs_v3_0_live_4_of_29_dev": paired_delta_ll_mulberry32(
            p_v32_live35[non_tie_mask], p_v30_live4[non_tie_mask], y_nt, seed=BOOTSTRAP_SEED + 12
        ),
        "cand_logit_41_vs_v3_0_logit_29_dev": paired_delta_ll_mulberry32(
            p_v32_logit[non_tie_mask], p_v30_logit[non_tie_mask], y_nt, seed=BOOTSTRAP_SEED + 13
        ),
        "cand_logit_41_vs_v3_0_blend_29_dev": paired_delta_ll_mulberry32(
            p_v32_logit[non_tie_mask], p_v30_blend[non_tie_mask], y_nt, seed=BOOTSTRAP_SEED + 14
        ),
        "cand_blend_41_vs_v3_0_blend_29_dev": paired_delta_ll_mulberry32(
            p_v32_blend[non_tie_mask], p_v30_blend[non_tie_mask], y_nt, seed=BOOTSTRAP_SEED + 15
        ),
        "cand_logit_41_vs_v3_0_logit_29_oos_2020_2024": paired_delta_ll_mulberry32(
            p_v32_logit[non_tie_mask][oos_nt], p_v30_logit[non_tie_mask][oos_nt], y_nt[oos_nt], seed=BOOTSTRAP_SEED + 16
        ),
        "cand_blend_41_vs_v3_0_blend_29_oos_2020_2024": paired_delta_ll_mulberry32(
            p_v32_blend[non_tie_mask][oos_nt], p_v30_blend[non_tie_mask][oos_nt], y_nt[oos_nt], seed=BOOTSTRAP_SEED + 17
        ),
        "cand_logit_41_vs_nflverse_consensus_sin_cierre_sharp": {
            **paired_delta_ll_mulberry32(
                p_v32_logit[paired_cons_mask], p_cons_2way[paired_cons_mask], y_pc, seed=BOOTSTRAP_SEED + 18
            ),
            "benchmark_label": "nflverse_consensus_novig (sin cierre sharp)",
        },
        "cand_blend_41_vs_nflverse_consensus_sin_cierre_sharp": {
            **paired_delta_ll_mulberry32(
                p_v32_blend[paired_cons_mask], p_cons_2way[paired_cons_mask], y_pc, seed=BOOTSTRAP_SEED + 19
            ),
            "benchmark_label": "nflverse_consensus_novig (sin cierre sharp)",
        },
    }

    # Ejecutar arnés oficial `A3` (`bt.run_backtest`) en `walk_forward_dev` (`unlock_holdout=False`, `holdout_fraction=0.20`)
    # Conservando el universo multi-deporte oficial (`holdout_cut_ts == 2025-02-02T17:30:00Z`) e inyectando el candidato solo en filas NFL `dev`
    events_with_cand = events_checked.copy()
    ph_map = dict(zip(aligned["event_id"].astype(str), aligned["v3_2_epa_logit_41_ph2"].astype(float)))
    pa_map = dict(zip(aligned["event_id"].astype(str), aligned["v3_2_epa_logit_41_pa2"].astype(float)))
    is_nfl_dev_row = (events_with_cand["sport"] == "nfl") & (events_with_cand["ts_event_start"] < holdout_cut_ts)
    events_with_cand.loc[is_nfl_dev_row, "p_model_home"] = events_with_cand.loc[is_nfl_dev_row, "event_id"].astype(
        str
    ).map(ph_map)
    events_with_cand.loc[is_nfl_dev_row, "p_model_away"] = events_with_cand.loc[is_nfl_dev_row, "event_id"].astype(
        str
    ).map(pa_map)

    effective_reg_path = (
        registry_path
        if registry_path is not None
        else (bt.DEFAULT_REGISTRY_PATH if record_trial else (ARTIFACTS_DIR / "_local_dryrun_trial_registry.jsonl"))
    )
    a3_cfg = bt.BacktestConfig(
        phase="ola3_b9_nfl_epa_v3_2_candidate",
        preset="exp_v32_nfl_epa_logit_41",
        model_version="pitchlab_minkowski_v3_2_epa_candidate",
        eval_split="walk_forward_dev",
        unlock_holdout=False,
        holdout_fraction=probe_cfg.holdout_fraction,
        sports=("football", "nfl"),
        markets=("1x2", "moneyline"),
        historical_delay_alpha=0.05,
        execution_delay_minutes=2.0,
        bootstrap_samples=BOOTSTRAP_SAMPLES,
        seed=BOOTSTRAP_SEED,
        registry_path=effective_reg_path,
        odds_df=nfl_odds,
        events_df=events_with_cand,
        pick_selector_fn=lambda _ctx, _dec, _cfg: [],
    )
    a3_report = bt.run_backtest(a3_cfg)
    if int(a3_report["split_summary"]["n_dev"]) != int(len(dev_events)):
        raise RuntimeError(
            f"Partición dev en A3 ({a3_report['split_summary']['n_dev']}) != {len(dev_events)}"
        )
    if pd.Timestamp(a3_report["split_summary"]["holdout_cut_ts"]) != holdout_cut_ts:
        raise HoldoutSealedAccessError(
            f"Corte holdout inesperado en A3: {a3_report['split_summary']['holdout_cut_ts']}"
        )
    if pd.Timestamp(a3_report["split_summary"]["dev_end_ts"]) >= holdout_cut_ts:
        raise HoldoutSealedAccessError("Fuga en split_summary de A3 hacia holdout_sealed.")

    # Verificación obligatoria contra corpus `nfl_sharp_closing.parquet` de `B6`
    sharp_df = pd.read_parquet(SHARP_CLOSING_PARQUET)
    sharp_gate = evaluate_nfl_corpus_gate(sharp_df)

    # Correlación empírica observada entre `pressure_proxy` (`sack | qb_hit`) y `ngs_was_pressure` en `2016..2024` dev
    tg_2016_24 = tg_df[(tg_df["season"] >= 2016) & tg_df["off_ngs_pressure_rate"].notna() & tg_df["off_pressure_proxy_rate"].notna()]
    pressure_proxy_vs_ngs_corr = float(
        np.corrcoef(
            tg_2016_24["off_pressure_proxy_rate"].to_numpy(dtype=np.float64),
            tg_2016_24["off_ngs_pressure_rate"].to_numpy(dtype=np.float64),
        )[0, 1]
    )

    eval_summary = {
        "eval_split": "walk_forward_dev",
        "holdout_cut_iso": str(split_meta["holdout_cut_ts"]),
        "n_nfl_dev_events_total": int(n_nfl),
        "n_nfl_dev_non_tie": int(non_tie_mask.sum()),
        "n_nfl_dev_paired_consensus_sin_cierre_sharp": int(paired_cons_mask.sum()),
        "n_holdout_sealed_untouched": n_holdout_untouched,
        "selected_c_on_val_2010_2019": float(best_c),
        "val_2010_2019_c_grid_ll": val_c_grid,
        "nflverse_consensus_sin_cierre_sharp": {
            "benchmark_note": "nflverse_consensus_novig (sin cierre sharp)",
            "epistemic_status": "OBSERVADO",
            **cons_cal,
        },
        "sharp_closing_corpus_b6": {
            "parquet_path": "research/prediction-lab/data/processed/nfl_sharp_closing.parquet",
            "n_rows": int(len(sharp_df)),
            "n_prospective_games": int(sharp_df["game_id"].nunique()),
            "n_settled_games": int(sharp_gate["n_settled_games_with_sharp_closing"]),
            "min_required_settled_games": 64,
            "corpus_sufficient_for_eval": bool(sharp_gate["corpus_sufficient_for_eval"]),
            "sharp_calibration_status": "DESCONOCIDO",
            "reason": "0 < 64 partidos liquidados con cierre sharp real; evaluacion bloqueada honestamente hasta acumular >= 64 cierres liquidados.",
        },
        "pressure_proxy_audit": {
            "proxy_definition": "(sack == 1 | qb_hit == 1) / qb_dropbacks",
            "proxy_coverage_2006_2024": "OBSERVADO (100% de walk_forward_dev 2010..2024)",
            "proxy_coverage_1999_2005": "DESCONOCIDO (qb_hit no registrado sistematicamente por NFL antes de 2006)",
            "ngs_was_pressure_coverage_2016_2024": "OBSERVADO (pbp_participation)",
            "ngs_was_pressure_coverage_1999_2015": "DESCONOCIDO",
            "pearson_r_proxy_vs_ngs_2016_2024": round(pressure_proxy_vs_ngs_corr, 4),
            "n_team_games_2016_2024_compared": int(len(tg_2016_24)),
        },
        "models": metrics_by_model,
        "paired_comparisons_mulberry32": paired_comparisons,
        "a3_backtest_nfl_segment": a3_report["calibration"]["by_sport"].get("nfl", {}),
        "trial_registration": a3_report["holdout_audit"],
    }

    candidate_artifact = build_candidate_json_artifact(
        wf_eligible,
        causal_state,
        best_c,
        {
            "n_non_tie": int(non_tie_mask.sum()),
            "candidate_logit_41_ll": metrics_by_model["v3_2_epa_logit_41"]["walk_forward_dev_non_tie"]["log_loss"],
            "candidate_logit_41_ll_ci95": metrics_by_model["v3_2_epa_logit_41"]["walk_forward_dev_non_tie"]["log_loss_ci95"],
            "candidate_blend_41_ll": metrics_by_model["v3_2_epa_blend_41"]["walk_forward_dev_non_tie"]["log_loss"],
            "baseline_v3_0_live_4_of_29_ll": metrics_by_model["v3_0_live_4_of_29"]["walk_forward_dev_non_tie"]["log_loss"],
            "baseline_v3_0_logit_29_ll": metrics_by_model["v3_0_logit_29"]["walk_forward_dev_non_tie"]["log_loss"],
            "baseline_v3_0_blend_29_ll": metrics_by_model["v3_0_blend_29"]["walk_forward_dev_non_tie"]["log_loss"],
            "nflverse_consensus_sin_cierre_sharp_ll": cons_cal["log_loss"],
            "delta_ll_vs_v3_0_live_4_of_29": paired_comparisons["cand_logit_41_vs_v3_0_live_4_of_29_dev"],
            "delta_ll_vs_v3_0_logit_29": paired_comparisons["cand_logit_41_vs_v3_0_logit_29_dev"],
            "delta_ll_vs_v3_0_blend_29": paired_comparisons["cand_logit_41_vs_v3_0_blend_29_dev"],
            "delta_ll_vs_nflverse_consensus_sin_cierre_sharp": paired_comparisons[
                "cand_logit_41_vs_nflverse_consensus_sin_cierre_sharp"
            ],
        },
    )
    CANDIDATE_JSON_OUT.write_text(json.dumps(candidate_artifact, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    cand_sha256 = hashlib.sha256(CANDIDATE_JSON_OUT.read_bytes()).hexdigest()

    full_results = {
        "experiment_id": "EXP_V32_nfl_epa",
        "agent_id": "B9",
        "generated_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "candidate_artifact_path": "src/data/prediction/model_nfl_v3_2_candidate.json",
        "candidate_artifact_sha256": cand_sha256,
        "pbp_manifest_summary": pbp_manifest["epistemic_coverage"],
        "live_coverage_audit": candidate_artifact["live_coverage_audit"],
        "evaluation": eval_summary,
    }
    results_json_path = ARTIFACTS_DIR / "exp_v32_nfl_epa_results.json"
    results_json_path.write_text(json.dumps(full_results, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return full_results


def main() -> None:
    parser = argparse.ArgumentParser(description="EXP_V32_nfl_epa walk_forward_dev runner")
    parser.add_argument(
        "--record-trial",
        action="store_true",
        help="Registra oficialmente la corrida walk_forward_dev por append en holdout_trial_registry.jsonl.",
    )
    args = parser.parse_args()
    res = run_full_experiment(record_trial=bool(args.record_trial))
    ev = res["evaluation"]
    print("=== EXP_V32_nfl_epa COMPLETADO ===")
    print(f"Candidate SHA-256: {res['candidate_artifact_sha256']}")
    print(f"Trial registration: {ev['trial_registration']}")
    print("Live coverage audit:", json.dumps(res["live_coverage_audit"], indent=2))
    for tag, m in ev["models"].items():
        nt = m["walk_forward_dev_non_tie"]
        sub = m["subsplits_non_tie"]
        print(
            f"  {tag:22s}: LL={nt['log_loss']:.6f} {nt['log_loss_ci95']} | "
            f"Brier={nt['brier']:.6f} | ECE={nt['ece']:.6f} | "
            f"VAL={sub['val_2010_2019_ll']:.6f} | DEV_OOS={sub['dev_oos_2020_2024_ll']:.6f}"
        )
    print("Paired comparisons (mulberry32):")
    for cname, cval in ev["paired_comparisons_mulberry32"].items():
        print(f"  {cname}: ΔLL={cval['delta_ll']:+.6f} {cval['delta_ll_ci95']} ({cval['significance']})")


if __name__ == "__main__":
    main()
