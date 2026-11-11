#!/usr/bin/env python3
"""Tests unitarios y de integración para A7 (`train_gbm.py` y `export_gbm_ts.py`)."""

from __future__ import annotations

import json
from pathlib import Path
import sys

import numpy as np
import pandas as pd
import pytest
from sklearn.ensemble import HistGradientBoostingClassifier

MODELS_DIR = Path(__file__).resolve().parent
REPO_ROOT = MODELS_DIR.parents[1]
for _p in (str(REPO_ROOT), str(MODELS_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import export_gbm_ts as eg  # noqa: E402
import train_gbm as tg  # noqa: E402


def test_numerical_and_missing_exact_parity_with_boundary_thresholds() -> None:
    """Verifica paridad IEEE-754 (< 1e-14) en splits numéricos, valores NaN y fronteras exactas `x == threshold`."""
    rng = np.random.default_rng(12345)
    n_train = 900
    X_tr = rng.normal(size=(n_train, 8))
    # Introducir NaNs en entrenamiento para ejercitar `missing_go_to_left` en ambas direcciones
    mask_nan = rng.random(X_tr.shape) < 0.18
    X_tr[mask_nan] = np.nan
    logits_true = np.column_stack(
        [
            0.9 * np.nan_to_num(X_tr[:, 0], nan=-0.6) - 0.5 * np.nan_to_num(X_tr[:, 1], nan=0.4),
            -0.3 * np.nan_to_num(X_tr[:, 2], nan=0.8) + 0.4 * np.nan_to_num(X_tr[:, 3], nan=-0.2),
            -0.6 * np.nan_to_num(X_tr[:, 0], nan=0.5) + 0.8 * np.nan_to_num(X_tr[:, 4], nan=-0.7),
        ]
    )
    probs_true = tg.apply_temperature_3way(np.exp(logits_true), 1.0)
    y_tr = np.array([rng.choice(3, p=row) for row in probs_true], dtype=int)

    clf = HistGradientBoostingClassifier(
        max_iter=25,
        learning_rate=0.08,
        max_leaf_nodes=11,
        min_samples_leaf=20,
        early_stopping=False,
        random_state=42,
    )
    clf.fit(X_tr, y_tr)

    artifact = eg.serialize_hist_gbm_to_artifact(
        clf,
        base_feature_names=[f"f_{i}" for i in range(6)],
        div_levels=["E0", "MEX"],
        temperature=1.12,
        blend_space="logit",
        w_logit=0.6,
        w_gbm=0.4,
    )

    # Construir matriz de test incluyendo valores EXACTAMENTE iguales a `num_threshold` y `NaN`
    X_te = rng.normal(size=(250, 8))
    X_te[rng.random(X_te.shape) < 0.22] = np.nan
    first_tree = artifact["trees"][0]
    for node_i, lf in enumerate(first_tree["is_leaf"]):
        if lf == 0:
            col_i = first_tree["feature_idx"][node_i]
            thr_v = first_tree["num_threshold"][node_i]
            X_te[0, col_i] = thr_v
            X_te[1, col_i] = np.nextafter(thr_v, -np.inf)
            X_te[2, col_i] = np.nextafter(thr_v, np.inf)
            break

    expected_raw = clf.predict_proba(X_te)
    actual_raw = eg.predict_serialized_gbm_python(X_te, artifact, calibrated=False)
    assert np.max(np.abs(expected_raw - actual_raw)) < 1e-14
    assert np.allclose(actual_raw.sum(axis=1), 1.0, atol=1e-12)

    expected_cal = tg.apply_temperature_3way(expected_raw, 1.12)
    actual_cal = eg.predict_serialized_gbm_python(X_te, artifact, calibrated=True)
    assert np.max(np.abs(expected_cal - actual_cal)) < 1e-14
    assert np.allclose(actual_cal.sum(axis=1), 1.0, atol=1e-12)


def test_categorical_bitset_idx_and_unseen_category_exact_parity() -> None:
    """Verifica paridad exacta (< 1e-14) cuando sklearn usa `bitset_idx`, `raw_left_cat_bitsets` y reordenamiento."""
    rng = np.random.default_rng(9876)
    n_train = 1000
    X_tr = rng.normal(size=(n_train, 5))
    cats = np.array([10.0, 20.0, 30.0, 40.0, 50.0, 60.0])
    X_tr[:, 2] = rng.choice(cats, size=n_train)
    X_tr[rng.random(n_train) < 0.10, 2] = np.nan
    X_tr[rng.random(n_train) < 0.12, 0] = np.nan

    y_tr = np.where(
        np.isin(X_tr[:, 2], [10.0, 30.0]),
        0,
        np.where(np.nan_to_num(X_tr[:, 0], nan=0.0) > 0.2, 1, 2),
    )
    flip = rng.random(n_train) < 0.20
    y_tr[flip] = rng.integers(0, 3, size=int(flip.sum()))

    clf = HistGradientBoostingClassifier(
        categorical_features=[2],
        max_iter=20,
        learning_rate=0.07,
        max_leaf_nodes=9,
        min_samples_leaf=20,
        early_stopping=False,
        random_state=7,
    )
    clf.fit(X_tr, y_tr)

    artifact = eg.serialize_hist_gbm_to_artifact(
        clf,
        base_feature_names=["f0", "f1", "cat_league", "f3"],
        div_levels=["E0"],
        temperature=1.0,
    )
    assert len(artifact["categorical_features"]) == 1
    assert any("raw_left_cat_bitsets" in t for t in artifact["trees"])

    X_te = rng.normal(size=(200, 5))
    # Incluye categorías conocidas, NaN y categorías jamás vistas (99.0, -5.0)
    X_te[:, 2] = rng.choice([10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 99.0, -5.0, np.nan], size=200)
    X_te[rng.random(200) < 0.15, 0] = np.nan

    expected = clf.predict_proba(X_te)
    actual = eg.predict_serialized_gbm_python(X_te, artifact, calibrated=False)
    assert np.max(np.abs(expected - actual)) < 1e-14


def test_holdout_leakage_guard_rejects_unlock() -> None:
    """Garantiza que `unlock_holdout=True` lance excepción inmediata en `train_gbm` y `export_gbm_ts`."""
    with pytest.raises(tg.HoldoutLeakageGuardError):
        tg.load_dev_soccer_features_strict(unlock_holdout=True)

    with pytest.raises(Exception):
        eg.evaluate_walk_forward_gbm_v31(unlock_holdout=True)


def test_production_activation_rule_cases() -> None:
    """Verifica la regla NO NEGOCIABLE de activación en producción (IC 95% no cruza 0 y no degrada CLV%)."""
    # 1. Mejora significativa en CLV% -> Activa
    v1 = eg.evaluate_production_activation_verdict(
        {"delta_log_loss": -0.0002, "ci95_log_loss": [-0.0006, 0.0002]},
        {"delta_clv_pct_mean": 0.012, "delta_clv_pct_ci95": [0.003, 0.021]},
        {"delta_clv_pct_mean": 0.005, "delta_clv_pct_ci95": [-0.001, 0.011]},
    )
    assert v1["activated"] is True
    assert v1["significance"] == "significativa"

    # 2. Mejora significativa en log-loss SIN degradar CLV% -> Activa
    v2 = eg.evaluate_production_activation_verdict(
        {"delta_log_loss": -0.0007, "ci95_log_loss": [-0.0011, -0.0003]},
        {"delta_clv_pct_mean": 0.001, "delta_clv_pct_ci95": [-0.004, 0.006]},
        {"delta_clv_pct_mean": 0.0005, "delta_clv_pct_ci95": [-0.003, 0.004]},
    )
    assert v2["activated"] is True
    assert v2["significance"] == "significativa"

    # 3. Mejora en log-loss PERO degrada CLV% en picks -> Desactiva (`production_activated = False`)
    v3 = eg.evaluate_production_activation_verdict(
        {"delta_log_loss": -0.0007, "ci95_log_loss": [-0.0011, -0.0003]},
        {"delta_clv_pct_mean": -0.002, "delta_clv_pct_ci95": [-0.012, 0.008]},
        {"delta_clv_pct_mean": -0.014, "delta_clv_pct_ci95": [-0.028, -0.001]},
    )
    assert v3["activated"] is False
    assert v3["significance"] == "no significativa"

    # 4. Ambos IC 95% cruzan 0 -> Desactiva (`production_activated = False`)
    v4 = eg.evaluate_production_activation_verdict(
        {"delta_log_loss": -0.0003, "ci95_log_loss": [-0.0008, 0.0002]},
        {"delta_clv_pct_mean": 0.002, "delta_clv_pct_ci95": [-0.006, 0.010]},
        {"delta_clv_pct_mean": 0.001, "delta_clv_pct_ci95": [-0.005, 0.007]},
    )
    assert v4["activated"] is False
    assert v4["significance"] == "no significativa"

    # 5. Paradoja de composición (alza aparente en cartera mixta con arb puro, pero degradación real en picks de modelo OOF) -> Desactiva
    v5 = eg.evaluate_production_activation_verdict(
        {"delta_log_loss": -0.00069, "ci95_log_loss": [-0.00108, -0.00033]},
        {"delta_clv_pct_mean": 0.0143, "delta_clv_pct_ci95": [0.0006, 0.0298]},
        {"delta_clv_pct_mean": -0.0146, "delta_clv_pct_ci95": [-0.0270, -0.0029]},
    )
    assert v5["activated"] is False
    assert v5["clv_not_degraded"] is False
    assert v5["significance"] == "no significativa"


def test_exported_artifacts_integrity_and_no_holdout_leakage() -> None:
    """Audita los artefactos reales generados por `export_gbm_ts.py` y el registro aislado `holdout_registry_a7.jsonl`."""
    assert eg.DEFAULT_TREES_OUT.exists(), "Falta src/data/prediction/gbm_trees_v3_1.json"
    assert eg.DEFAULT_PARITY_OUT.exists(), "Falta src/data/prediction/gbm_validation_parity.json"
    assert eg.DEFAULT_EVAL_OUT.exists(), "Falta services/models/artifacts/gbm_eval_v3_1.json"
    assert eg.DEFAULT_A7_REGISTRY_PATH.exists(), "Falta services/models/artifacts/holdout_registry_a7.jsonl"

    trees_size = eg.DEFAULT_TREES_OUT.stat().st_size
    parity_size = eg.DEFAULT_PARITY_OUT.stat().st_size
    assert trees_size < 2 * 1024 * 1024, f"gbm_trees_v3_1.json demasiado grande: {trees_size}"
    assert parity_size < 8 * 1024 * 1024, f"gbm_validation_parity.json excede 8 MB: {parity_size}"

    gbm_art = json.loads(eg.DEFAULT_TREES_OUT.read_text(encoding="utf-8"))
    parity = json.loads(eg.DEFAULT_PARITY_OUT.read_text(encoding="utf-8"))
    eval_rep = json.loads(eg.DEFAULT_EVAL_OUT.read_text(encoding="utf-8"))

    holdout_cut = pd.Timestamp("2025-02-02T17:30:00Z")
    assert gbm_art["training_window"]["holdout_touched"] is False
    assert pd.Timestamp(gbm_art["training_window"]["end_ts_utc_exclusive"]) < holdout_cut
    assert parity["holdout_touched"] is False
    assert pd.Timestamp(parity["validation_window"]["max_event_ts_utc"]) < holdout_cut
    assert parity["validation_window"]["coverage_pct"] == 100.0
    assert parity["n"] >= 4000
    assert len(parity["features_base"]) == parity["n"]

    # Consistencia del flag de activación en producción
    assert gbm_art["production_activated"] == eval_rep["production_activated"]
    assert eval_rep["holdout_sealed_untouched"] is True
    assert eval_rep["walk_forward_backtest_evaluation"]["bootstrap_resamples"] >= 1000

    # Registro exclusivo A7: todos los ensayos deben tener unlock_holdout == False
    reg_lines = [
        json.loads(line)
        for line in eg.DEFAULT_A7_REGISTRY_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    assert len(reg_lines) >= 2
    for entry in reg_lines:
        assert entry["unlock_holdout"] is False
