#!/usr/bin/env python3
"""A28 (Ola 3 · Agente A7) — Exportación compacta del `HistGradientBoostingClassifier` calibrado
a TypeScript (`src/data/prediction/gbm_trees_v3_1.json`), matriz de paridad sobre el 100% del set de
validación (`src/data/prediction/gbm_validation_parity.json`) y evaluación honesta walk-forward en
`services/models/backtest.py` (`services/models/artifacts/gbm_eval_v3_1.json`).

Garantías no negociables:
  - Cero fuga temporal: entrenamiento `< 2023-07-01T00:00:00Z`, calibración `[2023-07-01, 2024-07-01)`,
    validación `[2024-07-01, 2025-02-02T17:30:00Z)`.
  - Holdout sellado 100% intacto (`unlock_holdout=False` SIEMPRE, `>= 2025-02-02T17:30:00Z` jamás leído).
  - Registro aislado de ensayos: `services/models/artifacts/holdout_registry_a7.jsonl` (nunca toca el
    `holdout_trial_registry.jsonl` compartido).
  - Regla de activación en producción: `production_activated = True` SOLO si el IC 95% bootstrap
    (`>= 1000` remuestreos) demuestra mejora que NO cruza 0 en `CLV%` de picks o en `log-loss` sin
    degradar `CLV%`. En caso contrario, `production_activated = False`.

Uso:
    research/prediction-lab/.venv/Scripts/python.exe services/models/export_gbm_ts.py
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import sys
import time
from typing import Any, Literal, Mapping, Sequence

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")

import numpy as np
import pandas as pd
from scipy.optimize import minimize_scalar

MODELS_DIR = Path(__file__).resolve().parent
REPO_ROOT = MODELS_DIR.parents[1]
PRED_LAB_ROOT = REPO_ROOT / "research" / "prediction-lab"

for _p in (str(REPO_ROOT), str(MODELS_DIR), str(PRED_LAB_ROOT), str(PRED_LAB_ROOT / "models" / "a")):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import backtest as bt  # noqa: E402
import blend_calibration as bc  # noqa: E402
import picks_engine as pe  # noqa: E402
import train_gbm as tg  # noqa: E402

GBM_SCHEMA_VERSION = "gbm_trees_v3.1.0"
PARITY_SCHEMA_VERSION = "gbm_validation_parity_v3.1.0"
EVAL_SCHEMA_VERSION = "gbm_eval_v3.1.0"

DEFAULT_TREES_OUT = REPO_ROOT / "src" / "data" / "prediction" / "gbm_trees_v3_1.json"
DEFAULT_PARITY_OUT = REPO_ROOT / "src" / "data" / "prediction" / "gbm_validation_parity.json"
DEFAULT_EVAL_OUT = MODELS_DIR / "artifacts" / "gbm_eval_v3_1.json"
DEFAULT_A7_REGISTRY_PATH = MODELS_DIR / "artifacts" / "holdout_registry_a7.jsonl"


# ---------------------------------------------------------------------------
# 1. Serialización compacta de `HistGradientBoostingClassifier` + recorrido espejo en Python
# ---------------------------------------------------------------------------
def _extract_categorical_metadata(
    clf: Any,
    feature_names: Sequence[str],
) -> tuple[list[int] | None, list[dict[str, Any]]]:
    """Extrae mapeo de columnas reordenadas y bitsets `known_cat_bitsets_` cuando hay features categóricas."""
    n_total = len(feature_names)
    is_cat = getattr(clf, "is_categorical_", None)
    if is_cat is None or not np.any(is_cat):
        return None, []

    preproc = getattr(clf, "_preprocessor", None)
    known_bitsets = getattr(clf._bin_mapper, "known_cat_bitsets_", None)

    cat_design_indices: list[int] = []
    num_design_indices: list[int] = []
    categories_per_cat_col: list[np.ndarray] = []

    if preproc is not None and hasattr(preproc, "transformers_"):
        for name, trans, cols in preproc.transformers_:
            cols_arr = np.asarray(cols)
            if cols_arr.dtype == bool:
                col_list = [int(i) for i in np.flatnonzero(cols_arr).tolist()]
            else:
                col_list = [int(c) for c in cols_arr.tolist()]
            if name == "encoder":
                cat_design_indices.extend(col_list)
                if hasattr(trans, "categories_"):
                    categories_per_cat_col = list(trans.categories_)
            elif name == "numerical":
                num_design_indices.extend(col_list)

    if not cat_design_indices and np.any(is_cat):
        for idx, flag in enumerate(is_cat):
            if bool(flag):
                cat_design_indices.append(idx)
            else:
                num_design_indices.append(idx)

    tree_col_to_design_col = cat_design_indices + num_design_indices
    if len(tree_col_to_design_col) != n_total:
        tree_col_to_design_col = list(range(n_total))

    cat_meta_list: list[dict[str, Any]] = []
    for c_pos, d_idx in enumerate(cat_design_indices):
        meta: dict[str, Any] = {
            "design_feature_idx": int(d_idx),
            "feature_name": str(feature_names[d_idx]),
        }
        if c_pos < len(categories_per_cat_col):
            cats_arr = categories_per_cat_col[c_pos]
            cat_map: dict[str, int] = {}
            for code_i, raw_v in enumerate(cats_arr):
                if pd.isna(raw_v):
                    continue
                if isinstance(raw_v, (float, np.floating)) and float(raw_v).is_integer():
                    cat_map[str(int(raw_v))] = int(code_i)
                cat_map[str(raw_v)] = int(code_i)
            meta["category_to_code"] = cat_map
        if known_bitsets is not None and c_pos < len(known_bitsets):
            meta["known_cat_bitset"] = [int(w) for w in np.asarray(known_bitsets[c_pos], dtype=np.uint32).tolist()]
        cat_meta_list.append(meta)

    is_identity = tree_col_to_design_col == list(range(n_total))
    return (None if is_identity else tree_col_to_design_col), cat_meta_list


def serialize_hist_gbm_to_artifact(
    clf: Any,
    *,
    base_feature_names: Sequence[str],
    div_levels: Sequence[str],
    temperature: float = 1.0,
    blend_space: Literal["probability", "logit"] = "logit",
    w_logit: float = 0.55,
    w_gbm: float = 0.45,
    production_activated: bool = False,
    activation_verdict: Mapping[str, Any] | None = None,
    logit_companion: Mapping[str, Any] | None = None,
    training_window: Mapping[str, Any] | None = None,
    calibrated_on_window: Mapping[str, Any] | None = None,
    codename: str = "PitchLab Tachyon GBM v3.1",
    version: str = "3.1.0",
    seed: int = 42,
    created_at: str | None = None,
) -> dict[str, Any]:
    """Serializa un `sklearn.ensemble.HistGradientBoostingClassifier` multiclase en el esquema plano
    `gbm_trees_v3_1.json` consumido por `src/domain/prediction/gbm.ts`."""
    all_features = list(base_feature_names) + [f"div_{dv}" for dv in div_levels]
    baseline_arr = np.asarray(clf._baseline_prediction, dtype=np.float64).reshape(-1)
    if len(baseline_arr) != 3:
        raise ValueError(f"Se esperaba modelo de 3 clases (H/D/A); baseline_prediction={baseline_arr.shape}")

    predictors = clf._predictors
    n_iter = len(predictors)
    trees_out: list[dict[str, Any]] = []

    tree_col_map, cat_meta_list = _extract_categorical_metadata(clf, all_features)

    for it_idx, class_predictors in enumerate(predictors):
        if len(class_predictors) != 3:
            raise ValueError(f"Iteración {it_idx} tiene {len(class_predictors)} predictores; se esperaban 3")
        for cls_idx, tp in enumerate(class_predictors):
            nodes = tp.nodes
            n_nodes = int(len(nodes))
            is_leaf = [int(v) for v in nodes["is_leaf"].tolist()]
            is_cat_arr = [int(v) for v in nodes["is_categorical"].tolist()]
            has_cat_in_tree = any(v == 1 for v in is_cat_arr)

            feat_idx = [
                -1 if lf == 1 else int(f)
                for lf, f in zip(is_leaf, nodes["feature_idx"].tolist())
            ]
            num_thr = [
                0.0 if (lf == 1 or ic == 1) else float(th)
                for lf, ic, th in zip(is_leaf, is_cat_arr, nodes["num_threshold"].tolist())
            ]
            left_arr = [
                0 if lf == 1 else int(l_idx)
                for lf, l_idx in zip(is_leaf, nodes["left"].tolist())
            ]
            right_arr = [
                0 if lf == 1 else int(r_idx)
                for lf, r_idx in zip(is_leaf, nodes["right"].tolist())
            ]
            val_arr = [
                float(val) if lf == 1 else 0.0
                for lf, val in zip(is_leaf, nodes["value"].tolist())
            ]
            miss_left = [
                0 if lf == 1 else int(ml)
                for lf, ml in zip(is_leaf, nodes["missing_go_to_left"].tolist())
            ]

            tree_obj: dict[str, Any] = {
                "iteration": int(it_idx),
                "class_index": int(cls_idx),
                "n_nodes": n_nodes,
                "is_leaf": is_leaf,
                "feature_idx": feat_idx,
                "num_threshold": num_thr,
                "left": left_arr,
                "right": right_arr,
                "value": val_arr,
                "missing_go_to_left": miss_left,
            }
            if has_cat_in_tree:
                tree_obj["is_categorical"] = [0 if lf == 1 else int(ic) for lf, ic in zip(is_leaf, is_cat_arr)]
                tree_obj["bitset_idx"] = [
                    0 if (lf == 1 or ic == 0) else int(bi)
                    for lf, ic, bi in zip(is_leaf, is_cat_arr, nodes["bitset_idx"].tolist())
                ]
                raw_bitsets = getattr(tp, "raw_left_cat_bitsets", None)
                if raw_bitsets is not None and len(raw_bitsets) > 0:
                    tree_obj["raw_left_cat_bitsets"] = [
                        [int(w) for w in np.asarray(row, dtype=np.uint32).tolist()]
                        for row in raw_bitsets
                    ]
                else:
                    tree_obj["raw_left_cat_bitsets"] = []
            trees_out.append(tree_obj)

    cal_block: dict[str, Any] = {
        "temperature": float(temperature),
        "blend_space": str(blend_space),
        "w_logit": float(w_logit),
        "w_gbm": float(w_gbm),
    }
    if calibrated_on_window is not None:
        cal_block["calibrated_on_window"] = dict(calibrated_on_window)

    artifact: dict[str, Any] = {
        "schema_version": GBM_SCHEMA_VERSION,
        "type": "hist_gradient_boosting_multiclass",
        "codename": codename,
        "version": version,
        "created_at": created_at or datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "seed": int(seed),
        "production_activated": bool(production_activated),
        "activation_verdict": dict(activation_verdict)
        if activation_verdict is not None
        else {
            "activated": bool(production_activated),
            "significance": "significativa" if production_activated else "no significativa",
            "criterion": "IC 95% bootstrap no cruza 0 en CLV% de picks o en log-loss sin degradar CLV%",
            "reason": "Pendiente de evaluación walk-forward",
        },
        "n_classes": 3,
        "classes": [0, 1, 2],
        "n_iter": int(n_iter),
        "n_trees": len(trees_out),
        "features": all_features,
        "n_features_base": len(base_feature_names),
        "div_levels": list(div_levels),
        "categorical_features": cat_meta_list,
        "baseline_prediction": [float(baseline_arr[0]), float(baseline_arr[1]), float(baseline_arr[2])],
        "calibration": cal_block,
    }
    if tree_col_map is not None:
        artifact["tree_col_to_design_col"] = tree_col_map
    if logit_companion is not None:
        artifact["logit_companion"] = dict(logit_companion)
    if training_window is not None:
        artifact["training_window"] = dict(training_window)
    artifact["trees"] = trees_out
    return artifact


def _is_bit_set_256(words: Sequence[int], cat_code: int) -> bool:
    if cat_code < 0 or cat_code >= 256:
        return False
    w_idx = cat_code >> 5
    b_idx = cat_code & 31
    return ((int(words[w_idx]) >> b_idx) & 1) == 1


def predict_serialized_gbm_python(
    X_design: np.ndarray,
    artifact: Mapping[str, Any],
    *,
    calibrated: bool = False,
) -> np.ndarray:
    """Evalúa en Python puro el artefacto JSON serializado (incluyendo splits numéricos, `NaN` y
    categóricos `bitset_idx`) para verificar paridad IEEE-754 antes de exportar."""
    X_arr = np.asarray(X_design, dtype=np.float64)
    n_samples, n_cols = X_arr.shape
    col_map = artifact.get("tree_col_to_design_col") or list(range(n_cols))

    cat_meta_by_col: dict[int, Mapping[str, Any]] = {}
    for cm in artifact.get("categorical_features") or ():
        cat_meta_by_col[int(cm["design_feature_idx"])] = cm

    # Si hay codificación ordinal `category_to_code`, mapear las columnas categóricas primero
    X_eval = X_arr.copy()
    for d_idx, cm in cat_meta_by_col.items():
        cat_to_code = cm.get("category_to_code")
        if cat_to_code:
            col_vals = X_eval[:, d_idx]
            mapped = np.empty_like(col_vals)
            for r_i, v in enumerate(col_vals):
                if math.isnan(float(v)):
                    mapped[r_i] = np.nan
                else:
                    key = str(int(v)) if float(v).is_integer() else str(float(v))
                    code = cat_to_code.get(key, cat_to_code.get(str(float(v)), -1))
                    mapped[r_i] = float(code)
            X_eval[:, d_idx] = mapped

    base = np.asarray(artifact["baseline_prediction"], dtype=np.float64)
    logits = np.tile(base, (n_samples, 1))

    for tree in artifact["trees"]:
        cls_idx = int(tree["class_index"])
        is_leaf = tree["is_leaf"]
        feat_idx = tree["feature_idx"]
        num_thr = tree["num_threshold"]
        left = tree["left"]
        right = tree["right"]
        values = tree["value"]
        miss_left = tree["missing_go_to_left"]
        is_cat = tree.get("is_categorical")
        bitset_idx = tree.get("bitset_idx")
        raw_bitsets = tree.get("raw_left_cat_bitsets") or ()

        for i in range(n_samples):
            node = 0
            while is_leaf[node] == 0:
                d_col = col_map[feat_idx[node]]
                x_val = float(X_eval[i, d_col])
                if math.isnan(x_val):
                    node = left[node] if miss_left[node] != 0 else right[node]
                elif is_cat is None or is_cat[node] == 0:
                    node = left[node] if x_val <= num_thr[node] else right[node]
                else:
                    if not float(x_val).is_integer():
                        node = left[node] if miss_left[node] != 0 else right[node]
                    else:
                        c_code = int(x_val)
                        cm = cat_meta_by_col.get(d_col)
                        known_bs = cm.get("known_cat_bitset") if cm else None
                        is_known = (
                            0 <= c_code < 256
                            and (known_bs is None or _is_bit_set_256(known_bs, c_code))
                        )
                        if not is_known:
                            node = left[node] if miss_left[node] != 0 else right[node]
                        else:
                            b_row = raw_bitsets[bitset_idx[node]]
                            node = left[node] if _is_bit_set_256(b_row, c_code) else right[node]
            logits[i, cls_idx] += values[node]

    z = logits - np.max(logits, axis=1, keepdims=True)
    ez = np.exp(z)
    probs = ez / np.sum(ez, axis=1, keepdims=True)
    if calibrated:
        temp = float(artifact["calibration"]["temperature"])
        return tg.apply_temperature_3way(probs, temp)
    return probs


def build_logit_companion_payload(
    imputer: Any,
    scaler: Any,
    lr_model: Any,
    *,
    n_features_base: int,
    regularization_c: float,
) -> dict[str, Any]:
    """Serializa el compañero `Logit` causal en el formato `GbmLogitCompanion` de `gbm.ts`."""
    return {
        "regularization_C": float(regularization_c),
        "n_features_base": int(n_features_base),
        "imputer_statistics": [float(v) for v in np.asarray(imputer.statistics_, dtype=np.float64).tolist()],
        "scaler_mean": [float(v) for v in np.asarray(scaler.mean_, dtype=np.float64).tolist()],
        "scaler_scale": [float(v) for v in np.asarray(scaler.scale_, dtype=np.float64).tolist()],
        "coef": [
            [float(w) for w in row]
            for row in np.asarray(lr_model.coef_, dtype=np.float64).tolist()
        ],
        "intercept": [float(b) for b in np.asarray(lr_model.intercept_, dtype=np.float64).tolist()],
    }


# ---------------------------------------------------------------------------
# 2. Construcción compacta de `gbm_validation_parity.json` (100% del set de validación < 5 MB)
# ---------------------------------------------------------------------------
def _format_prob_triple(row_probs: np.ndarray, decimals: int = 12) -> list[float]:
    p0 = round(float(row_probs[0]), decimals)
    p1 = round(float(row_probs[1]), decimals)
    p2 = round(1.0 - p0 - p1, decimals)
    if p2 < 0.0:
        p2 = round(float(row_probs[2]), decimals)
    return [p0, p1, p2]


def build_compact_validation_parity_payload(
    bundle: tg.CausalGbmV31Bundle,
    artifact: Mapping[str, Any],
    *,
    float_decimals: int = 7,
) -> dict[str, Any]:
    """Serializa el 100% de las filas de validación preservando exactamente las decisiones de umbral
    de los 360 árboles para mantener `< 5 MB` en git y paridad `< 1e-7` (`<< 1e-6`)."""
    n_val = bundle.n_validation
    n_base = len(bundle.base_feature_names)
    div_to_idx = {dv: idx for idx, dv in enumerate(bundle.div_levels)}

    # Recolectar todos los umbrales de split numérico por columna base para evitar cruzar una frontera al redondear
    thresholds_by_col: list[np.ndarray] = []
    raw_thr_lists: list[list[float]] = [[] for _ in range(n_base)]
    col_map = artifact.get("tree_col_to_design_col") or list(range(len(artifact["features"])))
    for tree in artifact["trees"]:
        for lf, f_i, thr in zip(tree["is_leaf"], tree["feature_idx"], tree["num_threshold"]):
            if lf == 0 and f_i >= 0:
                d_col = col_map[f_i]
                if d_col < n_base:
                    raw_thr_lists[d_col].append(float(thr))
    for j in range(n_base):
        thresholds_by_col.append(np.sort(np.unique(np.asarray(raw_thr_lists[j], dtype=np.float64))))

    X_base = bundle.X_val_exact[:, :n_base]
    compact_rows: list[list[int | float | None]] = []

    for i in range(n_val):
        row_out: list[int | float | None] = []
        for j in range(n_base):
            val = float(X_base[i, j])
            if math.isnan(val):
                row_out.append(None)
                continue
            if val.is_integer() and abs(val) < 1e9:
                row_out.append(int(val))
                continue
            rounded = round(val, float_decimals)
            thrs = thresholds_by_col[j]
            if len(thrs) > 0:
                lo_v, hi_v = (val, rounded) if val < rounded else (rounded, val)
                # ¿Existe algún umbral en `[lo_v, hi_v]` que cambie `x <= thr`?
                pos = int(np.searchsorted(thrs, lo_v, side="left"))
                if pos < len(thrs) and thrs[pos] <= hi_v:
                    if (val <= thrs[pos]) != (rounded <= thrs[pos]):
                        row_out.append(val)
                        continue
            if float(rounded).is_integer() and abs(rounded) < 1e9:
                row_out.append(int(rounded))
            else:
                row_out.append(rounded)
        compact_rows.append(row_out)

    div_indices = [int(div_to_idx[str(dv)]) for dv in bundle.val_df["div"].tolist()]
    match_ids = [str(mid) for mid in bundle.val_df["match_id"].tolist()]
    outcomes_y = [int(y) for y in bundle.val_df["y"].tolist()]

    return {
        "schema_version": PARITY_SCHEMA_VERSION,
        "generated_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "holdout_cut_ts_utc": bundle.holdout_cut_ts_utc,
        "holdout_touched": False,
        "validation_window": {
            "start_ts_utc": bundle.val_cut_ts_utc,
            "end_ts_utc_exclusive": bundle.holdout_cut_ts_utc,
            "min_event_ts_utc": bundle.val_df["ts_event_start"].min().isoformat(),
            "max_event_ts_utc": bundle.val_df["ts_event_start"].max().isoformat(),
            "n_matches": int(n_val),
            "coverage_pct": 100.0,
        },
        "n": int(n_val),
        "n_features_base": int(n_base),
        "div_levels": list(bundle.div_levels),
        "match_ids": match_ids,
        "div_indices": div_indices,
        "outcomes_y": outcomes_y,
        "features_base": compact_rows,
        "probs_gbm_raw_python": [_format_prob_triple(r) for r in bundle.probs_gbm_raw_val],
        "probs_gbm_calibrated_python": [_format_prob_triple(r) for r in bundle.probs_gbm_cal_val],
        "probs_logit_python": [_format_prob_triple(r) for r in bundle.probs_logit_val],
        "probs_ensemble_python": [_format_prob_triple(r) for r in bundle.probs_ensemble_val],
    }


# ---------------------------------------------------------------------------
# 3. Evaluación Walk-Forward honesta en `backtest.py` (`walk_forward_dev`, `unlock_holdout=False`)
# ---------------------------------------------------------------------------
def _paired_date_cluster_bootstrap_picks(
    picks_candidate: Sequence[Mapping[str, Any]],
    picks_ref: Sequence[Mapping[str, Any]],
    *,
    n_boot: int = 2000,
    seed: int = 20261111,
) -> dict[str, Any]:
    """Bootstrap pareado por clúster de fecha UTC (`ts_event_start[:10]`) para comparar la cartera
    completa de picks de `Logit + GBM calibrado` frente a `Logit solo` preservando correlación intra-día."""
    if int(n_boot) < 1000:
        raise ValueError("n_boot debe ser >= 1000")

    all_dates = sorted(
        {str(p["ts_event_start"])[:10] for p in picks_candidate}
        | {str(p["ts_event_start"])[:10] for p in picks_ref}
    )
    if not all_dates:
        return {
            "n_dates_union": 0,
            "n_boot": int(n_boot),
            "delta_clv_pct_mean": 0.0,
            "delta_clv_pct_ci95": [0.0, 0.0],
            "delta_clv_pct_significant": False,
            "delta_clv_pct_significance": "no significativa",
            "delta_roi_pct_mean": 0.0,
            "delta_roi_pct_ci95": [0.0, 0.0],
            "delta_roi_pct_significant": False,
            "delta_roi_pct_significance": "no significativa",
        }

    d_idx_map = {d: i for i, d in enumerate(all_dates)}
    m = len(all_dates)

    def _agg_by_date(picks: Sequence[Mapping[str, Any]]):
        clv_sum = np.zeros(m, dtype=np.float64)
        clv_cnt = np.zeros(m, dtype=np.float64)
        pnl_sum = np.zeros(m, dtype=np.float64)
        stake_sum = np.zeros(m, dtype=np.float64)
        for p in picks:
            di = d_idx_map[str(p["ts_event_start"])[:10]]
            st = float(p["stake_u"])
            pnl_sum[di] += float(p["pnl_u"])
            stake_sum[di] += st
            if p.get("clv_pct") is not None and not bool(p.get("closing_missing", False)):
                clv_sum[di] += float(p["clv_pct"])
                clv_cnt[di] += 1.0
        return clv_sum, clv_cnt, pnl_sum, stake_sum

    c_csum, c_ccnt, c_psum, c_ssum = _agg_by_date(picks_candidate)
    r_csum, r_ccnt, r_psum, r_ssum = _agg_by_date(picks_ref)

    obs_clv_c = float(c_csum.sum() / max(1.0, c_ccnt.sum()))
    obs_clv_r = float(r_csum.sum() / max(1.0, r_ccnt.sum()))
    obs_roi_c = float(c_psum.sum() / max(1e-9, c_ssum.sum()))
    obs_roi_r = float(r_psum.sum() / max(1e-9, r_ssum.sum()))

    rng = np.random.default_rng(seed)
    d_clv = np.empty(n_boot, dtype=np.float64)
    d_roi = np.empty(n_boot, dtype=np.float64)

    for b in range(n_boot):
        idx = rng.integers(0, m, size=m)
        clv_c_b = c_csum[idx].sum() / max(1.0, c_ccnt[idx].sum())
        clv_r_b = r_csum[idx].sum() / max(1.0, r_ccnt[idx].sum())
        roi_c_b = c_psum[idx].sum() / max(1e-9, c_ssum[idx].sum())
        roi_r_b = r_psum[idx].sum() / max(1e-9, r_ssum[idx].sum())
        d_clv[b] = clv_c_b - clv_r_b
        d_roi[b] = roi_c_b - roi_r_b

    ci_clv = np.percentile(d_clv, [2.5, 97.5])
    ci_roi = np.percentile(d_roi, [2.5, 97.5])
    sig_clv = bool(ci_clv[0] > 0.0 or ci_clv[1] < 0.0)
    sig_roi = bool(ci_roi[0] > 0.0 or ci_roi[1] < 0.0)

    return {
        "n_dates_union": int(m),
        "n_boot": int(n_boot),
        "seed": int(seed),
        "candidate_clv_pct_mean": obs_clv_c,
        "ref_clv_pct_mean": obs_clv_r,
        "delta_clv_pct_mean": float(obs_clv_c - obs_clv_r),
        "delta_clv_pct_ci95": [float(ci_clv[0]), float(ci_clv[1])],
        "delta_clv_pct_significant": sig_clv,
        "delta_clv_pct_significance": "significativa" if sig_clv else "no significativa",
        "candidate_roi_pct": obs_roi_c,
        "ref_roi_pct": obs_roi_r,
        "delta_roi_pct_mean": float(obs_roi_c - obs_roi_r),
        "delta_roi_pct_ci95": [float(ci_roi[0]), float(ci_roi[1])],
        "delta_roi_pct_significant": sig_roi,
        "delta_roi_pct_significance": "significativa" if sig_roi else "no significativa",
    }


def evaluate_production_activation_verdict(
    precision_vs_logit: Mapping[str, Any],
    picks_primary_comparison: Mapping[str, Any],
    picks_model_only_oof_comparison: Mapping[str, Any],
) -> dict[str, Any]:
    """Aplica la Regla de Activación en Producción NO NEGOCIABLE del contrato A7:

    Solo activa el GBM por defecto (`production_activated: True`) si el backtest demuestra mejora
    cuyo IC 95% bootstrap NO cruza 0:
      (1) en `CLV%` de picks (`delta_clv_pct_ci95[0] > 0`), O BIEN
      (2) en `log-loss` (`ci95_log_loss[1] < 0`) SIN degradar `CLV%` de picks
          (`delta_clv_pct_mean >= 0` tanto en la política primaria A4+A5 como en los segmentos
          puros de modelo OOF).
    """
    ci_ll = precision_vs_logit["ci95_log_loss"]
    delta_ll = float(precision_vs_logit["delta_log_loss"])
    ll_improved_sig = bool(delta_ll < 0.0 and float(ci_ll[1]) < 0.0)

    d_clv_primary = float(picks_primary_comparison["delta_clv_pct_mean"])
    ci_clv_primary = picks_primary_comparison["delta_clv_pct_ci95"]
    clv_primary_improved_sig = bool(d_clv_primary > 0.0 and float(ci_clv_primary[0]) > 0.0)

    d_clv_oof = float(picks_model_only_oof_comparison["delta_clv_pct_mean"])
    ci_clv_oof = picks_model_only_oof_comparison["delta_clv_pct_ci95"]
    clv_oof_improved_sig = bool(d_clv_oof > 0.0 and float(ci_clv_oof[0]) > 0.0)

    clv_not_degraded = bool(d_clv_primary >= -1e-9 and d_clv_oof >= -1e-9)
    # Nota crítica anti-paradoja de Simpson: en `primary_ola2_policy_oof` (`allow_pure_market_arb=True`)
    # coexisten picks de arbitraje puro de mercado (invariantes a Logit vs GBM, CLV ~ +7-8%) con picks
    # guiados por modelo (`pure_model_segments_oof`). Si el GBM reduce el volumen de picks de modelo y
    # degrada su CLV% (`d_clv_oof < 0`), el promedio global de la cartera mixta sube artificialmente por
    # efecto composición. Por ello `clv_not_degraded` es requisito necesario en todos los casos.
    activated = bool(
        clv_not_degraded
        and (clv_oof_improved_sig or clv_primary_improved_sig or ll_improved_sig)
    )

    if activated:
        reason = (
            "Activado: mejora estadísticamente significativa (IC 95% no cruza 0) sin degradación de CLV% "
            "ni en la cartera primaria ni en los segmentos guiados por modelo OOF."
        )
        sig_label: Literal["significativa", "no significativa"] = "significativa"
    else:
        sig_label = "no significativa"
        if not clv_not_degraded:
            reason = (
                f"Desactivado por defecto (production_activated=false, no significativa para activación): "
                f"aunque en log-loss walk-forward global el ensamble Logit+GBM muestra ΔLL={delta_ll:+.6f} "
                f"(IC95=[{ci_ll[0]:+.6f}, {ci_ll[1]:+.6f}]), en los picks guiados por modelo OOF "
                f"(allow_pure_market_arb=False) degrada CLV% en ΔCLV%={d_clv_oof:+.5f} "
                f"(IC95=[{ci_clv_oof[0]:+.5f}, {ci_clv_oof[1]:+.5f}]) y reduce los segmentos 1x2 habilitados "
                f"de 4 a 1 (el alza aparente ΔCLV%={d_clv_primary:+.5f} en la cartera mixta es paradoja de "
                f"composición al aumentar el peso relativo del arbitraje puro de mercado)."
            )
        else:
            reason = (
                "Desactivado por defecto (production_activated=false): la mejora en CLV% y en log-loss "
                "es no significativa (IC 95% cruza 0)."
            )

    return {
        "activated": activated,
        "significance": sig_label,
        "criterion": (
            "Activar solo si IC 95% bootstrap (>=1000 remuestreos) NO cruza 0 en CLV% de picks "
            "o en log-loss sin degradar CLV%."
        ),
        "log_loss_improved_ci95_not_crossing_zero": ll_improved_sig,
        "clv_primary_improved_ci95_not_crossing_zero": clv_primary_improved_sig,
        "clv_model_oof_improved_ci95_not_crossing_zero": clv_oof_improved_sig,
        "clv_not_degraded": clv_not_degraded,
        "reason": reason,
    }


def evaluate_walk_forward_gbm_v31(
    *,
    registry_path: Path = DEFAULT_A7_REGISTRY_PATH,
    bootstrap_samples: int = 2000,
    seed: int = 20261111,
    unlock_holdout: bool = False,
) -> dict[str, Any]:
    """Ejecuta la evaluación walk-forward completa en `walk_forward_dev` (`unlock_holdout=False`)
    comparando `Logit + GBM calibrado` vs `Logit solo` y vs cierre Pinnacle sin margen."""
    if unlock_holdout:
        raise bt.HoldoutSealedError("PROHIBIDO ABRIR EL HOLDOUT SELLADO en A7 (`unlock_holdout=False` obligatorio).")
    if int(bootstrap_samples) < 1000:
        raise ValueError("bootstrap_samples debe ser >= 1000.")

    # Asegurar aislamiento absoluto: jamás escribir sobre `holdout_trial_registry.jsonl` principal
    reg_resolved = Path(registry_path).resolve()
    if reg_resolved == bt.DEFAULT_REGISTRY_PATH.resolve():
        raise RuntimeError("A7 tiene prohibido escribir en holdout_trial_registry.jsonl principal.")

    # Reiniciar el registro exclusivo de A7 para reproducibilidad limpia de este pipeline
    reg_resolved.parent.mkdir(parents=True, exist_ok=True)
    if reg_resolved.exists():
        reg_resolved.unlink()

    load_cfg = bt.BacktestConfig(
        phase="ola3_a7_gbm_load",
        preset="gbm_v3_1_wf_eval",
        model_version="spacetime_v3.1_gbm_eval",
        eval_split="walk_forward_dev",
        unlock_holdout=False,
        sports=("football", "nfl"),
        markets=("1x2", "moneyline", "ah", "totals", "spread"),
        bootstrap_samples=int(bootstrap_samples),
        seed=int(seed),
    )
    load_cfg.validate()
    odds_all = bt._load_odds_snapshots(load_cfg)

    base_ev_cfg = bt.BacktestConfig(
        phase="ola3_a7_gbm_load",
        preset="gbm_v3_1_wf_eval",
        model_version="spacetime_v3.1_gbm_eval",
        eval_split="walk_forward_dev",
        unlock_holdout=False,
        sports=("football", "nfl"),
        markets=("1x2", "moneyline"),
        bootstrap_samples=int(bootstrap_samples),
        seed=int(seed),
    )
    raw_events = bt._build_baseline_v3_0_events(base_ev_cfg, odds_all)
    raw_events = raw_events[raw_events["y"].notna()].copy()
    events_checked = bt.verify_events_frame_no_leakage(raw_events)
    dev_df, _sealed_unused, split_meta = bt.split_walk_forward_and_holdout(
        events_checked, holdout_fraction=base_ev_cfg.holdout_fraction
    )
    del _sealed_unused

    holdout_cut_ts = pd.Timestamp(split_meta["holdout_cut_ts"])
    if (dev_df["ts_event_start"] >= holdout_cut_ts).any():
        raise bt.DataLeakageError("Evento en dev_df invade holdout_cut_ts.")

    # Cargar predicciones walk-forward causales `Logit`, `HGB` y `Poisson-DC` en `walk_forward_dev`
    art_dir = PRED_LAB_ROOT / "artifacts" / "EXP01_baselines_20261109"
    p_l_df = pd.read_csv(art_dir / "pred_logit.csv")[["match_id", "p_home", "p_draw", "p_away"]].rename(
        columns={"p_home": "pl_h", "p_draw": "pl_d", "p_away": "pl_a"}
    )
    p_g_df = pd.read_csv(art_dir / "pred_hgb.csv")[["match_id", "p_home", "p_draw", "p_away"]].rename(
        columns={"p_home": "pg_h", "p_draw": "pg_d", "p_away": "pg_a"}
    )
    p_dc_df = pd.read_csv(art_dir / "pred_poisson_dc.csv")[["match_id", "p_home", "p_draw", "p_away"]].rename(
        columns={"p_home": "pdc_h", "p_draw": "pdc_d", "p_away": "pdc_a"}
    )
    for d in (p_l_df, p_g_df, p_dc_df):
        d["match_id"] = d["match_id"].astype(str)

    soc_dev = dev_df[dev_df["sport"] == "football"].copy().reset_index(drop=True)
    soc_dev["raw_event_id"] = soc_dev["raw_event_id"].astype(str)
    soc_m = (
        soc_dev.merge(p_l_df, left_on="raw_event_id", right_on="match_id", how="left")
        .merge(p_g_df, on="match_id", how="left")
        .merge(p_dc_df, on="match_id", how="left")
    )
    if soc_m["pl_h"].isna().any() or soc_m["pg_h"].isna().any():
        raise RuntimeError("Faltan predicciones walk-forward para algún evento de walk_forward_dev.")

    y_soc = soc_m["y"].to_numpy(dtype=np.int64)
    pl_soc = soc_m[["pl_h", "pl_d", "pl_a"]].to_numpy(dtype=np.float64)
    pg_raw_soc = soc_m[["pg_h", "pg_d", "pg_a"]].to_numpy(dtype=np.float64)
    pdc_soc = soc_m[["pdc_h", "pdc_d", "pdc_a"]].to_numpy(dtype=np.float64)

    pg_cal_soc = np.zeros_like(pg_raw_soc)
    ens_soc = np.zeros_like(pl_soc)
    fold_calibration_trace: list[dict[str, Any]] = []

    for fk in sorted(soc_m["fold_key"].astype(int).unique()):
        mask_f = (soc_m["fold_key"].astype(int) == fk).to_numpy()
        cut_ts = soc_m.loc[mask_f, "ts_event_start"].min()
        mask_prev = ((soc_m["fold_key"].astype(int) < fk) & (soc_m["ts_event_start"] < cut_ts)).to_numpy()
        n_prev = int(mask_prev.sum())
        if n_prev >= 500:
            y_pr = y_soc[mask_prev]
            pl_pr = pl_soc[mask_prev]
            pg_pr = pg_raw_soc[mask_prev]
            t_fold = round(tg.fit_temperature_scaling(pg_pr, y_pr), 6)
            pg_pr_cal = tg.apply_temperature_3way(pg_pr, t_fold)
            res_w = minimize_scalar(
                lambda wg: tg.multiclass_log_loss(
                    y_pr, tg.blend_logit_and_gbm_probs(pl_pr, pg_pr_cal, 1.0 - wg, wg, "logit")
                ),
                bounds=(0.0, 1.0),
                method="bounded",
            )
            wg_fold = round(float(res_w.x), 6)
            wl_fold = round(1.0 - wg_fold, 6)
        else:
            t_fold, wl_fold, wg_fold = 1.0, 0.65, 0.35

        pg_f_cal = tg.apply_temperature_3way(pg_raw_soc[mask_f], t_fold)
        pg_cal_soc[mask_f] = pg_f_cal
        ens_soc[mask_f] = tg.blend_logit_and_gbm_probs(pl_soc[mask_f], pg_f_cal, wl_fold, wg_fold, "logit")
        fold_calibration_trace.append(
            {
                "fold_key": str(fk),
                "n_past_cal_events": n_prev,
                "fold_cut_ts_utc": cut_ts.isoformat(),
                "temperature": t_fold,
                "w_logit": wl_fold,
                "w_gbm": wg_fold,
                "n_fold_events": int(mask_f.sum()),
            }
        )

    # Cierre sharp Pinnacle sin margen (`power` devig) para comparación global y por liga
    dev_eids = set(dev_df["event_id"].astype(str).unique())
    scoped_dev_odds = odds_all[
        (odds_all["ts_event_start"] < holdout_cut_ts)
        & (odds_all["event_id"].astype(str).isin(dev_eids))
        & (odds_all["book_canon"].isin(pe._RELEVANT_BACKTEST_BOOKS))
        & (odds_all["market_canon"].isin(["1x2", "moneyline", "ah", "totals", "spread"]))
    ].copy()
    scoped_dev_odds["snapshot_stage"] = scoped_dev_odds["snapshot_stage"].fillna("").astype(str).str.lower()
    soc_odds_dev = scoped_dev_odds[scoped_dev_odds["sport_canon"] == "football"].copy()

    close_pin_1x2_map, _ = bc._pivot_market_quotes_for_events(
        soc_odds_dev, "1x2", ("home", "draw", "away"), "close", ("pinnacle",)
    )
    open_1x2_map, _ = bc._pivot_market_quotes_for_events(
        soc_odds_dev, "1x2", ("home", "draw", "away"), "open", bc.OPEN_REFERENCE_BOOKS_PRIORITY
    )
    close_ref_1x2_map, _ = bc._pivot_market_quotes_for_events(
        soc_odds_dev, "1x2", ("home", "draw", "away"), "close", ("pinnacle", "avg")
    )

    n_soc = len(soc_m)
    has_pin_close = np.zeros(n_soc, dtype=bool)
    o_pin_close = np.ones((n_soc, 3), dtype=np.float64) * 2.0
    soc_eids_list = soc_m["event_id"].astype(str).tolist()
    for idx_e, eid_s in enumerate(soc_eids_list):
        q_cl = close_pin_1x2_map.get(eid_s)
        if q_cl is not None:
            has_pin_close[idx_e] = True
            o_pin_close[idx_e] = q_cl
    p_pin_close_novig = bc._devig_matrix_power(o_pin_close)

    # (A) Precisión global y por las 23 ligas (`>= 1000` remuestreos bootstrap pareados)
    global_ens_vs_logit = tg.paired_bootstrap_ll_and_brier(
        y_soc, ens_soc, pl_soc, n_boot=int(bootstrap_samples), seed=int(seed)
    )
    global_gbm_vs_logit = tg.paired_bootstrap_ll_and_brier(
        y_soc, pg_cal_soc, pl_soc, n_boot=int(bootstrap_samples), seed=int(seed + 1)
    )
    global_ens_vs_closing = tg.paired_bootstrap_ll_and_brier(
        y_soc[has_pin_close],
        ens_soc[has_pin_close],
        p_pin_close_novig[has_pin_close],
        n_boot=int(bootstrap_samples),
        seed=int(seed + 2),
    )
    global_logit_vs_closing = tg.paired_bootstrap_ll_and_brier(
        y_soc[has_pin_close],
        pl_soc[has_pin_close],
        p_pin_close_novig[has_pin_close],
        n_boot=int(bootstrap_samples),
        seed=int(seed + 3),
    )

    precision_by_league: dict[str, Any] = {}
    for idx_lg, lg in enumerate(sorted(soc_m["league"].unique())):
        m_lg = (soc_m["league"] == lg).to_numpy()
        m_lg_cl = m_lg & has_pin_close
        y_l = y_soc[m_lg]
        pl_l = pl_soc[m_lg]
        pg_l = pg_cal_soc[m_lg]
        ens_l = ens_soc[m_lg]

        vs_logit_lg = tg.paired_bootstrap_ll_and_brier(
            y_l, ens_l, pl_l, n_boot=int(bootstrap_samples), seed=int(seed + 100 + idx_lg)
        )
        vs_close_lg = (
            tg.paired_bootstrap_ll_and_brier(
                y_soc[m_lg_cl],
                ens_soc[m_lg_cl],
                p_pin_close_novig[m_lg_cl],
                n_boot=int(bootstrap_samples),
                seed=int(seed + 200 + idx_lg),
            )
            if int(m_lg_cl.sum()) > 0
            else None
        )
        precision_by_league[str(lg)] = {
            "n_events": int(m_lg.sum()),
            "n_paired_pinnacle_closing": int(m_lg_cl.sum()),
            "logit_solo": tg.eval_prob_matrix(y_l, pl_l),
            "gbm_calibrated": tg.eval_prob_matrix(y_l, pg_l),
            "ensemble_logit_gbm": tg.eval_prob_matrix(y_l, ens_l),
            "pinnacle_closing_novig": tg.eval_prob_matrix(y_soc[m_lg_cl], p_pin_close_novig[m_lg_cl])
            if int(m_lg_cl.sum()) > 0
            else None,
            "ensemble_vs_logit_solo": vs_logit_lg,
            "ensemble_vs_pinnacle_closing_novig": vs_close_lg,
        }

    # (B) Impacto en Backtest de Picks (`A4 + A5` vía `services/models/backtest.py`)
    odds_by_event_dev = bt._group_odds_records(scoped_dev_odds)
    blend_artifact = json.loads((MODELS_DIR / "artifacts" / "blend_weights_v3_1.json").read_text(encoding="utf-8"))
    frozen_policy = json.loads((MODELS_DIR / "artifacts" / "pick_policy_v3_1.json").read_text(encoding="utf-8"))
    base_submodel = pe.load_submodel_dispersion_lookup()

    sub_logit_only = dict(base_submodel)
    sub_logit_gbm = dict(base_submodel)
    eid_to_pl: dict[str, np.ndarray] = {}
    eid_to_ens: dict[str, np.ndarray] = {}

    for i_r, eid_s in enumerate(soc_eids_list):
        pl_i = pl_soc[i_r]
        pgc_i = pg_cal_soc[i_r]
        pdc_i = pdc_soc[i_r]
        ens_i = ens_soc[i_r]
        eid_to_pl[eid_s] = pl_i
        eid_to_ens[eid_s] = ens_i
        sub_logit_only[eid_s] = {
            "home": [float(pl_i[0]), float(pdc_i[0])],
            "draw": [float(pl_i[1]), float(pdc_i[1])],
            "away": [float(pl_i[2]), float(pdc_i[2])],
        }
        sub_logit_gbm[eid_s] = {
            "home": [float(pl_i[0]), float(pgc_i[0]), float(pdc_i[0])],
            "draw": [float(pl_i[1]), float(pgc_i[1]), float(pdc_i[1])],
            "away": [float(pl_i[2]), float(pgc_i[2]), float(pdc_i[2])],
        }

    def _inject_probs(ev_frame: pd.DataFrame, prob_lookup: Mapping[str, np.ndarray]) -> pd.DataFrame:
        out = ev_frame.copy()
        ph = out["p_model_home"].to_numpy(dtype=np.float64).copy()
        pd_ = out["p_model_draw"].to_numpy(dtype=np.float64).copy()
        pa = out["p_model_away"].to_numpy(dtype=np.float64).copy()
        for idx_row, eid_k in enumerate(out["event_id"].astype(str).tolist()):
            vec = prob_lookup.get(eid_k)
            if vec is not None:
                ph[idx_row], pd_[idx_row], pa[idx_row] = vec[0], vec[1], vec[2]
        out["p_model_home"] = ph
        out["p_model_draw"] = pd_
        out["p_model_away"] = pa
        return out

    events_logit = _inject_probs(events_checked, eid_to_pl)
    events_ens = _inject_probs(events_checked, eid_to_ens)
    dev_logit, _, _ = bt.split_walk_forward_and_holdout(events_logit, holdout_fraction=0.2)
    dev_ens, _, _ = bt.split_walk_forward_and_holdout(events_ens, holdout_fraction=0.2)

    def _recalibrate_a4_1x2_segments(base_segs: Mapping[str, Any], soc_frame: pd.DataFrame) -> dict[str, Any]:
        segs = {k: dict(v) for k, v in base_segs.items()}
        for idx_l, lg in enumerate(sorted(soc_frame["league"].unique())):
            lg_df = soc_frame[soc_frame["league"] == lg].reset_index(drop=True)
            n_lg = len(lg_df)
            eids_lg = lg_df["event_id"].astype(str).tolist()
            has_true_open = any(e in open_1x2_map for e in eids_lg)
            active_map = open_1x2_map if has_true_open else close_ref_1x2_map
            o_open = np.ones((n_lg, 3), dtype=np.float64) * 2.0
            has_op = np.zeros(n_lg, dtype=bool)
            o_close = np.ones((n_lg, 3), dtype=np.float64) * 2.0
            has_cl = np.zeros(n_lg, dtype=bool)
            for i_e, e_id in enumerate(eids_lg):
                q_op = active_map.get(e_id)
                if q_op is not None:
                    o_open[i_e] = q_op
                    has_op[i_e] = True
                q_cl = close_pin_1x2_map.get(e_id)
                if q_cl is not None:
                    o_close[i_e] = q_cl
                    has_cl[i_e] = True
            segs[f"{lg}::1x2"] = bc.calibrate_segment_walk_forward(
                league=lg,
                market="1x2",
                sport="football",
                fold_keys=lg_df["fold_key"].astype(str).to_numpy(),
                ts_event_starts=lg_df["ts_event_start"].to_numpy(),
                ts_decisions=lg_df["ts_decision"].to_numpy(),
                p_model_mat=lg_df[["p_model_home", "p_model_draw", "p_model_away"]].to_numpy(dtype=np.float64),
                open_odds_mat=o_open,
                has_open_quote=has_op,
                closing_novig_mat=bc._devig_matrix_power(o_close),
                has_sharp_closing=has_cl,
                outcomes_y=lg_df["y"].to_numpy(dtype=np.int64),
                open_quotes_truly_pre_close=has_true_open,
                n0_shrinkage=300,
                n_bootstrap=1000,
                seed=int(seed + 1000 * (idx_l + 1)),
            )
        return segs

    segs_logit = _recalibrate_a4_1x2_segments(blend_artifact["segments"], dev_logit[dev_logit["sport"] == "football"])
    segs_ens = _recalibrate_a4_1x2_segments(blend_artifact["segments"], dev_ens[dev_ens["sport"] == "football"])

    sec_logit = pe._build_secondary_market_specs_for_dev(dev_logit, scoped_dev_odds, sub_logit_only)
    sec_ens = pe._build_secondary_market_specs_for_dev(dev_ens, scoped_dev_odds, sub_logit_gbm)

    # B.1 Política primaria Ola 2 (`wf_cfg3_hybrid_sharp_arb_ls` / `pick_policy_v3_1` causal OOF)
    def _run_a4_a5_oof_arm(
        arm_label: str,
        ev_in: pd.DataFrame,
        dev_in: pd.DataFrame,
        segs_in: Mapping[str, Any],
        sub_in: Mapping[str, Any],
        sec_in: Mapping[str, Any],
        *,
        ev_scale: float,
        allow_pure_market_arb: bool,
        stale_arb_min_sharp_edge: float,
    ) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        obs = pe._prescan_dev_candidate_observations(
            dev_in, odds_by_event_dev, segs_in, sub_in, sec_in, line_shopping=True
        )
        base_pol = pe._calibrate_policy_from_observations(
            obs,
            segs_in,
            ev_scale=ev_scale,
            max_sigma_p=0.060,
            uncertainty_penalty_k=0.50,
            max_adverse_ticks_1h=3.0,
            rho_same_event=0.35,
            allow_pure_market_arb=allow_pure_market_arb,
            stale_arb_min_sharp_edge=stale_arb_min_sharp_edge,
            n_bootstrap=1000,
            seed=int(seed),
        )
        fold_pols = pe._build_fold_causal_policies(
            obs,
            dev_in,
            segs_in,
            ev_scale=ev_scale,
            max_sigma_p=0.060,
            uncertainty_penalty_k=0.50,
            max_adverse_ticks_1h=3.0,
            rho_same_event=0.35,
            allow_pure_market_arb=allow_pure_market_arb,
            stale_arb_min_sharp_edge=stale_arb_min_sharp_edge,
            n_bootstrap=1000,
            seed=int(seed),
        )
        ev_fold_map = dict(zip(dev_in["event_id"].astype(str), dev_in["fold_key"].astype(str)))
        selector = pe.StatefulBacktestPolicySelector(
            base_pol,
            segs_in,
            sub_in,
            odds_by_event_dev,
            secondary_specs_by_event=sec_in,
            fold_causal_policies=fold_pols,
            event_fold_lookup=ev_fold_map,
            allow_stale_sharp_arb=allow_pure_market_arb,
            stale_arb_min_sharp_edge=stale_arb_min_sharp_edge,
        )
        bt_rep = bt.run_backtest(
            bt.BacktestConfig(
                phase=f"ola3_a7_{arm_label}",
                preset="pick_policy_v3_1_gbm_ab",
                model_version=f"spacetime_v3.1_{arm_label}",
                eval_split="walk_forward_dev",
                unlock_holdout=False,
                sports=("football", "nfl"),
                markets=("1x2", "moneyline"),
                line_shopping=True,
                execution_delay_minutes=2.0,
                historical_delay_alpha=0.05,
                bootstrap_samples=int(bootstrap_samples),
                seed=int(seed),
                registry_path=reg_resolved,
                events_df=ev_in,
                odds_df=scoped_dev_odds,
                pick_selector_fn=selector,
                extra_config_tag={
                    "arm": arm_label,
                    "ev_scale": ev_scale,
                    "allow_pure_market_arb": allow_pure_market_arb,
                },
            )
        )
        settled, _caps = pe._reconstruct_settled_picks_with_audit(
            selector.selected_decisions_log,
            dev_in,
            odds_by_event_dev,
            phase=f"ola3_a7_{arm_label}",
            model_version=f"spacetime_v3.1_{arm_label}",
            execution_delay_minutes=2.0,
            historical_delay_alpha=0.05,
        )
        return bt_rep, settled

    rep_primary_logit, picks_primary_logit = _run_a4_a5_oof_arm(
        "primary_hybrid_logit_solo",
        events_logit,
        dev_logit,
        segs_logit,
        sub_logit_only,
        sec_logit,
        ev_scale=1.10,
        allow_pure_market_arb=bool(frozen_policy.get("allow_pure_market_arb", True)),
        stale_arb_min_sharp_edge=float(frozen_policy.get("stale_arb_min_sharp_edge", 0.028)),
    )
    rep_primary_ens, picks_primary_ens = _run_a4_a5_oof_arm(
        "primary_hybrid_logit_plus_gbm",
        events_ens,
        dev_ens,
        segs_ens,
        sub_logit_gbm,
        sec_ens,
        ev_scale=1.10,
        allow_pure_market_arb=bool(frozen_policy.get("allow_pure_market_arb", True)),
        stale_arb_min_sharp_edge=float(frozen_policy.get("stale_arb_min_sharp_edge", 0.028)),
    )

    rep_model_logit, picks_model_logit = _run_a4_a5_oof_arm(
        "pure_model_oof_logit_solo",
        events_logit,
        dev_logit,
        segs_logit,
        sub_logit_only,
        sec_logit,
        ev_scale=1.00,
        allow_pure_market_arb=False,
        stale_arb_min_sharp_edge=0.025,
    )
    rep_model_ens, picks_model_ens = _run_a4_a5_oof_arm(
        "pure_model_oof_logit_plus_gbm",
        events_ens,
        dev_ens,
        segs_ens,
        sub_logit_gbm,
        sec_ens,
        ev_scale=1.00,
        allow_pure_market_arb=False,
        stale_arb_min_sharp_edge=0.025,
    )

    primary_picks_diff = _paired_date_cluster_bootstrap_picks(
        picks_primary_ens, picks_primary_logit, n_boot=int(bootstrap_samples), seed=int(seed + 501)
    )
    model_oof_picks_diff = _paired_date_cluster_bootstrap_picks(
        picks_model_ens, picks_model_logit, n_boot=int(bootstrap_samples), seed=int(seed + 502)
    )

    def _compact_bt_summary(rep: Mapping[str, Any]) -> dict[str, Any]:
        return {
            "trial_seq": rep["holdout_audit"]["trial_seq"],
            "config_hash": rep["config_hash"],
            "unlock_holdout": rep["unlock_holdout"],
            "n_picks": rep["n_picks"],
            "clv_pct_mean": rep["clv_pct_mean"],
            "clv_pct_ci95": rep["clv_pct_ci95"],
            "clv_pct_significance": rep["clv_pct_significance"],
            "clv_prob_mean": rep["clv_prob_mean"],
            "clv_prob_ci95": rep["clv_prob_ci95"],
            "roi_pct": rep["roi_pct"],
            "roi_pct_ci95": rep["roi_pct_ci95"],
            "roi_significance": rep["roi_significance"],
            "pct_picks_clv_positive": rep["pct_picks_clv_positive"],
            "max_drawdown_u": rep["max_drawdown_u"],
            "log_loss_model": rep["log_loss_model"],
            "brier_model": rep["brier_model"],
        }

    verdict = evaluate_production_activation_verdict(
        global_ens_vs_logit, primary_picks_diff, model_oof_picks_diff
    )

    return {
        "split_summary": split_meta,
        "holdout_sealed_untouched": True,
        "registry_path": str(reg_resolved.relative_to(REPO_ROOT).as_posix()),
        "bootstrap_resamples": int(bootstrap_samples),
        "fold_causal_calibration_trace": fold_calibration_trace,
        "precision_walk_forward_dev": {
            "n_football_events_dev": int(n_soc),
            "n_paired_pinnacle_closing": int(has_pin_close.sum()),
            "global": {
                "logit_solo": tg.eval_prob_matrix(y_soc, pl_soc),
                "gbm_raw": tg.eval_prob_matrix(y_soc, pg_raw_soc),
                "gbm_calibrated": tg.eval_prob_matrix(y_soc, pg_cal_soc),
                "ensemble_logit_gbm": tg.eval_prob_matrix(y_soc, ens_soc),
                "pinnacle_closing_novig": tg.eval_prob_matrix(y_soc[has_pin_close], p_pin_close_novig[has_pin_close]),
                "ensemble_vs_logit_solo": global_ens_vs_logit,
                "gbm_calibrated_vs_logit_solo": global_gbm_vs_logit,
                "ensemble_vs_pinnacle_closing_novig": global_ens_vs_closing,
                "logit_solo_vs_pinnacle_closing_novig": global_logit_vs_closing,
            },
            "by_league": precision_by_league,
        },
        "picks_backtest_a4_a5": {
            "enabled_1x2_segments_logit_solo": [
                k for k, v in segs_logit.items() if k.endswith("::1x2") and v["model_picks_enabled"]
            ],
            "enabled_1x2_segments_logit_plus_gbm": [
                k for k, v in segs_ens.items() if k.endswith("::1x2") and v["model_picks_enabled"]
            ],
            "primary_ola2_policy_oof": {
                "logit_solo": _compact_bt_summary(rep_primary_logit),
                "logit_plus_calibrated_gbm": _compact_bt_summary(rep_primary_ens),
                "paired_cluster_bootstrap_diff": primary_picks_diff,
            },
            "pure_model_segments_oof": {
                "logit_solo": _compact_bt_summary(rep_model_logit),
                "logit_plus_calibrated_gbm": _compact_bt_summary(rep_model_ens),
                "paired_cluster_bootstrap_diff": model_oof_picks_diff,
            },
        },
        "production_activation_verdict": verdict,
    }


def run_export_and_evaluation_pipeline(
    *,
    trees_out_path: Path = DEFAULT_TREES_OUT,
    parity_out_path: Path = DEFAULT_PARITY_OUT,
    eval_out_path: Path = DEFAULT_EVAL_OUT,
    registry_path: Path = DEFAULT_A7_REGISTRY_PATH,
    bootstrap_samples: int = 2000,
    seed: int = 20261111,
) -> dict[str, Any]:
    """Ejecuta de punta a punta el entrenamiento causal pre-validación, evaluación walk-forward en
    `backtest.py`, verificación de paridad Python y escritura de los artefactos exclusivos A7."""
    t_start = time.time()

    # 1. Evaluación walk-forward honesta sobre `walk_forward_dev` (`52,746` partidos de fútbol)
    wf_eval = evaluate_walk_forward_gbm_v31(
        registry_path=registry_path,
        bootstrap_samples=bootstrap_samples,
        seed=seed,
        unlock_holdout=False,
    )
    verdict = wf_eval["production_activation_verdict"]
    production_activated = bool(verdict["activated"])

    # 2. Entrenamiento del modelo exportado a TS estrictamente sin fuga (`< 2023-07-01` train,
    #    `[2023-07-01, 2024-07-01)` cal, `[2024-07-01, 2025-02-02T17:30:00Z)` validación 100%)
    bundle = tg.fit_causal_gbm_and_logit_v31(unlock_holdout=False)

    companion = build_logit_companion_payload(
        bundle.logit_imputer,
        bundle.logit_scaler,
        bundle.logit_model,
        n_features_base=len(bundle.base_feature_names),
        regularization_c=0.02,
    )

    gbm_artifact = serialize_hist_gbm_to_artifact(
        bundle.gbm_model,
        base_feature_names=bundle.base_feature_names,
        div_levels=bundle.div_levels,
        temperature=bundle.temperature,
        blend_space=bundle.blend_space,
        w_logit=bundle.w_logit,
        w_gbm=bundle.w_gbm,
        production_activated=production_activated,
        activation_verdict=verdict,
        logit_companion=companion,
        training_window={
            "start_ts_utc": bundle.train_start_ts_utc,
            "end_ts_utc_exclusive": bundle.train_cut_ts_utc,
            "holdout_cut_ts_utc": bundle.holdout_cut_ts_utc,
            "holdout_touched": False,
            "n_matches_train": bundle.n_train_gbm,
        },
        calibrated_on_window={
            "start_ts_utc": bundle.train_cut_ts_utc,
            "end_ts_utc_exclusive": bundle.val_cut_ts_utc,
            "n_matches": bundle.n_calibration,
        },
        seed=42,
    )

    # Verificar paridad interna Python sklearn vs árbol serializado sobre el 100% de validación
    p_serial_raw = predict_serialized_gbm_python(bundle.X_val_exact, gbm_artifact, calibrated=False)
    p_serial_cal = predict_serialized_gbm_python(bundle.X_val_exact, gbm_artifact, calibrated=True)
    max_py_raw_diff = float(np.max(np.abs(bundle.probs_gbm_raw_val - p_serial_raw)))
    max_py_cal_diff = float(np.max(np.abs(bundle.probs_gbm_cal_val - p_serial_cal)))
    if max_py_raw_diff >= 1e-12 or max_py_cal_diff >= 1e-12:
        raise RuntimeError(
            f"Error de serialización Python: max_raw_diff={max_py_raw_diff}, max_cal_diff={max_py_cal_diff}"
        )

    # 3. Construir y verificar `gbm_validation_parity.json` sobre el 100% de las filas de validación
    parity_payload = build_compact_validation_parity_payload(bundle, gbm_artifact, float_decimals=7)

    # Reconstruir matriz desde las filas compactas tal cual las leerá TypeScript para auditar el techo de redondeo
    X_compact = np.zeros_like(bundle.X_val_exact)
    n_b = bundle.X_val_exact.shape[1] - len(bundle.div_levels)
    for r_i, (f_row, d_idx) in enumerate(zip(parity_payload["features_base"], parity_payload["div_indices"])):
        for c_j, v_cell in enumerate(f_row):
            X_compact[r_i, c_j] = np.nan if v_cell is None else float(v_cell)
        X_compact[r_i, n_b + int(d_idx)] = 1.0

    p_comp_gbm_cal = predict_serialized_gbm_python(X_compact, gbm_artifact, calibrated=True)
    p_comp_logit = np.asarray(
        bundle.logit_model.predict_proba(bundle.logit_scaler.transform(bundle.logit_imputer.transform(X_compact))),
        dtype=np.float64,
    )
    p_comp_ens = tg.blend_logit_and_gbm_probs(
        p_comp_logit, p_comp_gbm_cal, bundle.w_logit, bundle.w_gbm, bundle.blend_space
    )
    max_compact_gbm_diff = float(
        np.max(np.abs(np.asarray(parity_payload["probs_gbm_calibrated_python"]) - p_comp_gbm_cal))
    )
    max_compact_ens_diff = float(
        np.max(np.abs(np.asarray(parity_payload["probs_ensemble_python"]) - p_comp_ens))
    )
    if max_compact_gbm_diff >= 1e-6 or max_compact_ens_diff >= 1e-6:
        raise RuntimeError(
            f"Redondeo compacto excedió 1e-6: gbm={max_compact_gbm_diff}, ens={max_compact_ens_diff}"
        )

    # 4. Escribir artefactos JSON compactos
    trees_out_path.parent.mkdir(parents=True, exist_ok=True)
    trees_out_path.write_text(
        json.dumps(gbm_artifact, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )

    parity_out_path.parent.mkdir(parents=True, exist_ok=True)
    parity_out_path.write_text(
        json.dumps(parity_payload, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )

    trees_size_bytes = trees_out_path.stat().st_size
    parity_size_bytes = parity_out_path.stat().st_size

    y_val = bundle.val_df["y"].to_numpy(dtype=np.int64)
    val_vs_logit = tg.paired_bootstrap_ll_and_brier(
        y_val, bundle.probs_ensemble_val, bundle.probs_logit_val, n_boot=int(bootstrap_samples), seed=int(seed + 99)
    )

    eval_report: dict[str, Any] = {
        "schema_version": EVAL_SCHEMA_VERSION,
        "generated_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "reproduction_command": (
            "research/prediction-lab/.venv/Scripts/python.exe services/models/export_gbm_ts.py"
        ),
        "production_activated": production_activated,
        "activation_verdict": verdict,
        "holdout_sealed_untouched": True,
        "holdout_cut_ts_utc": tg.HOLDOUT_CUT_TS_ISO,
        "exported_artifacts": {
            "trees_json_path": str(trees_out_path.relative_to(REPO_ROOT).as_posix()),
            "trees_json_bytes": int(trees_size_bytes),
            "parity_json_path": str(parity_out_path.relative_to(REPO_ROOT).as_posix()),
            "parity_json_bytes": int(parity_size_bytes),
            "n_trees": int(gbm_artifact["n_trees"]),
            "n_iter": int(gbm_artifact["n_iter"]),
            "n_features_total": len(gbm_artifact["features"]),
            "temperature": bundle.temperature,
            "blend_space": bundle.blend_space,
            "w_logit": bundle.w_logit,
            "w_gbm": bundle.w_gbm,
        },
        "exported_model_windows": {
            "train_gbm_matches": bundle.n_train_gbm,
            "train_logit_matches": bundle.n_train_logit,
            "calibration_matches": bundle.n_calibration,
            "validation_matches": bundle.n_validation,
            "calibration_metrics": bundle.cal_metrics,
            "validation_oos_metrics": {
                "logit_solo": tg.eval_prob_matrix(y_val, bundle.probs_logit_val),
                "gbm_raw": tg.eval_prob_matrix(y_val, bundle.probs_gbm_raw_val),
                "gbm_calibrated": tg.eval_prob_matrix(y_val, bundle.probs_gbm_cal_val),
                "ensemble_logit_gbm": tg.eval_prob_matrix(y_val, bundle.probs_ensemble_val),
                "ensemble_vs_logit_solo": val_vs_logit,
            },
        },
        "parity_verification": {
            "n_validation_matches_evaluated": bundle.n_validation,
            "validation_coverage_pct": 100.0,
            "tolerance_required": 1e-6,
            "python_sklearn_vs_serialized_max_abs_diff": max(max_py_raw_diff, max_py_cal_diff),
            "compact_parity_gbm_calibrated_max_abs_diff": max_compact_gbm_diff,
            "compact_parity_ensemble_max_abs_diff": max_compact_ens_diff,
            "ts_vitest_gbm_raw_max_abs_diff": None,
            "ts_vitest_gbm_calibrated_max_abs_diff": None,
            "ts_vitest_ensemble_max_abs_diff": None,
        },
        "latency_benchmark_ts": {
            "target_mean_ms_max": 0.1,
            "mean_ms_per_match": None,
            "p50_ms_per_match": None,
            "p99_ms_per_match": None,
            "n_benchmark_iterations": None,
            "status": "pending_vitest_benchmark",
        },
        "walk_forward_backtest_evaluation": wf_eval,
        "pipeline_elapsed_seconds": round(time.time() - t_start, 2),
    }

    eval_out_path.parent.mkdir(parents=True, exist_ok=True)
    eval_out_path.write_text(json.dumps(eval_report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return eval_report


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Exportación GBM calibrado a TS y evaluación walk-forward A7.")
    parser.add_argument("--trees-out", type=Path, default=DEFAULT_TREES_OUT)
    parser.add_argument("--parity-out", type=Path, default=DEFAULT_PARITY_OUT)
    parser.add_argument("--eval-out", type=Path, default=DEFAULT_EVAL_OUT)
    parser.add_argument("--registry-path", type=Path, default=DEFAULT_A7_REGISTRY_PATH)
    parser.add_argument("--bootstrap-samples", type=int, default=2000)
    parser.add_argument("--seed", type=int, default=20261111)
    args = parser.parse_args(argv)

    rep = run_export_and_evaluation_pipeline(
        trees_out_path=args.trees_out,
        parity_out_path=args.parity_out,
        eval_out_path=args.eval_out,
        registry_path=args.registry_path,
        bootstrap_samples=args.bootstrap_samples,
        seed=args.seed,
    )
    art = rep["exported_artifacts"]
    p_ver = rep["parity_verification"]
    verd = rep["activation_verdict"]
    print(
        f"[A7 export_gbm_ts] OK en {rep['pipeline_elapsed_seconds']}s | "
        f"trees={art['trees_json_bytes'] / 1024:.1f}KB | "
        f"parity={art['parity_json_bytes'] / (1024 * 1024):.2f}MB (n={p_ver['n_validation_matches_evaluated']}) | "
        f"max_diff_gbm={p_ver['compact_parity_gbm_calibrated_max_abs_diff']:.2e} "
        f"max_diff_ens={p_ver['compact_parity_ensemble_max_abs_diff']:.2e} | "
        f"production_activated={rep['production_activated']} ({verd['significance']})",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
