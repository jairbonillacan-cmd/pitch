#!/usr/bin/env python3
"""Entrena y evalúa un modelo GBM (`HistGradientBoostingClassifier` / `LightGBM`) calibrado para PitchLab Tachyon v3.1.

Soporta tres modos:
  1. Funciones reutilizables v3.1 (`fit_causal_gbm_and_logit_v31`, `fit_temperature_scaling`,
     `apply_temperature_3way`, `fit_logit_gbm_ensemble`) consumidas por `services/models/export_gbm_ts.py`:
     - Frontera temporal anti-fuga NO NEGOCIABLE: ninguna fila con `ts_event_start >= 2025-02-02T17:30:00Z`
       (`holdout_sealed`) puede tocarse jamás cuando `unlock_holdout=False` (valor obligatorio en Ola 3).
     - Calibración post-hoc de temperatura `T > 0` (`p_cal = softmax(log(p_raw) / T)`) y mezcla convexa o
       en espacio logit con `Logit` ajustadas estrictamente fuera de muestra en una ventana de calibración
       anterior a la ventana de validación.
  2. Modo CLI `tachyon` (por defecto cuando existe `research/prediction-lab/data/processed/features.parquet`):
     - Ejecuta el benchmark walk-forward sobre `walk_forward_dev` (`< 2025-02-02T17:30:00Z`, holdout sellado
       intacto) con intervalos de confianza bootstrap pareados al 95 % (`n_boot >= 1000`).
  3. Modo legado `asof-jsonl` (`--mode asof-jsonl --features Reportes/modelos/features-asof.jsonl`):
     - Mantiene compatibilidad con el benchmark JSONL exportado por TypeScript.

Uso:
    research/prediction-lab/.venv/Scripts/python.exe services/models/train_gbm.py
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import random
import sys
from typing import Any, Literal

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")

import numpy as np

try:
    import lightgbm as lgb  # type: ignore

    HAS_LGB = True
except ImportError:
    lgb = None  # type: ignore
    HAS_LGB = False

REPO_ROOT = Path(__file__).resolve().parents[2]
PRED_LAB_ROOT = REPO_ROOT / "research" / "prediction-lab"
DEFAULT_PARQUET = PRED_LAB_ROOT / "data" / "processed" / "features.parquet"
DEFAULT_MATCHES_PARQUET = PRED_LAB_ROOT / "data" / "processed" / "matches.parquet"
DEFAULT_V30_JSON = (
    PRED_LAB_ROOT / "experiments" / "EXP01_baselines_20261109" / "gbm_v30_metrics.json"
)

# Corte exacto del holdout sellado (20% final de eventos en `backtest.py`)
HOLDOUT_CUT_TS_ISO = "2025-02-02T17:30:00Z"
DEFAULT_TRAIN_CUT_TS_ISO = "2023-07-01T00:00:00Z"
DEFAULT_VAL_CUT_TS_ISO = "2024-07-01T00:00:00Z"

PROB_FLOOR = 1e-15

LEGACY_FEATURE_NAMES = [
    "elo_home",
    "elo_draw",
    "elo_away",
    "dc_home",
    "dc_draw",
    "dc_away",
    "rest_home",
    "rest_away",
    "form_home",
    "form_away",
    "shots_home",
    "shots_away",
    "xg_home",
    "xg_away",
]

TACHYON_V30_EXTRA_FEATURES = [
    "has_real_xg_history",
    "xg_elo_diff",
    "xg_elo_vs_elo_diff",
    "pts_minus_xpts_diff_r5",
    "pts_minus_xpts_diff_r10",
    "xpts_diff_r10",
    "ppda_diff_r5",
    "ppda_diff_r10",
    "deep_completions_diff_r5",
    "deep_completions_diff_r10",
    "npxgd_diff_r10",
    "altitude_diff_m",
    "altitude_shock_flag",
    "surface_pressure_diff",
]

TOP5_DIVS = ("E0", "SP1", "D1", "I1", "F1")


class HoldoutLeakageGuardError(RuntimeError):
    """Lanzado si cualquier conjunto de entrenamiento, calibración o validación invade el holdout sellado."""


def safe_log(value: float) -> float:
    return -math.log(max(value, PROB_FLOOR))


def multiclass_log_loss(y: np.ndarray, p: np.ndarray) -> float:
    p_norm = p / np.maximum(PROB_FLOOR, p.sum(axis=1, keepdims=True))
    p_clip = np.clip(p_norm, PROB_FLOOR, 1.0)
    return float(-np.mean(np.log(p_clip[np.arange(len(y)), y])))


def apply_temperature_3way(probs: np.ndarray, temperature: float) -> np.ndarray:
    """Escala probabilidades 1X2 por temperatura `T > 0` (`p_cal = softmax(log(max(p, 1e-15)) / T)`).

    Paridad IEEE-754 exacta (`< 1e-15`) con `applyTemperature3` en `src/domain/prediction/gbm.ts`.
    """
    t_val = float(temperature)
    if not math.isfinite(t_val) or t_val <= 0.0:
        raise ValueError(f"temperature debe ser finito y > 0; recibido {temperature!r}")
    p_arr = np.asarray(probs, dtype=np.float64)
    if t_val == 1.0:
        return p_arr / np.maximum(PROB_FLOOR, p_arr.sum(axis=-1, keepdims=True))
    scaled_logits = np.log(np.maximum(p_arr, PROB_FLOOR)) / t_val
    scaled_logits = scaled_logits - np.max(scaled_logits, axis=-1, keepdims=True)
    exp_z = np.exp(scaled_logits)
    return exp_z / np.sum(exp_z, axis=-1, keepdims=True)


def fit_temperature_scaling(
    probs_raw: np.ndarray,
    y: np.ndarray,
    bounds: tuple[float, float] = (0.5, 2.5),
) -> float:
    """Ajusta temperatura post-hoc `T > 0` minimizando log-loss multiclase en una muestra causal."""
    from scipy.optimize import minimize_scalar

    if len(y) < 100:
        return 1.0
    y_arr = np.asarray(y, dtype=np.int64)
    p_arr = np.asarray(probs_raw, dtype=np.float64)
    res = minimize_scalar(
        lambda t: multiclass_log_loss(y_arr, apply_temperature_3way(p_arr, float(t))),
        bounds=bounds,
        method="bounded",
    )
    return float(res.x)


def blend_logit_and_gbm_probs(
    p_logit: np.ndarray,
    p_gbm_cal: np.ndarray,
    w_logit: float,
    w_gbm: float,
    blend_space: Literal["probability", "logit"] = "logit",
) -> np.ndarray:
    """Mezcla probabilidades `Logit` y `GBM calibrado` con paridad exacta respecto a `blendLogitAndGbm` en TS."""
    wl = float(w_logit)
    wg = float(w_gbm)
    pl = np.asarray(p_logit, dtype=np.float64)
    pg = np.asarray(p_gbm_cal, dtype=np.float64)
    if blend_space == "logit":
        z = wl * np.log(np.maximum(pl, PROB_FLOOR)) + wg * np.log(np.maximum(pg, PROB_FLOOR))
        z = z - np.max(z, axis=-1, keepdims=True)
        ez = np.exp(z)
        return ez / np.sum(ez, axis=-1, keepdims=True)
    mix = wl * pl + wg * pg
    return mix / np.maximum(PROB_FLOOR, np.sum(mix, axis=-1, keepdims=True))


def fit_logit_gbm_ensemble_weights(
    p_logit_cal: np.ndarray,
    p_gbm_cal: np.ndarray,
    y_cal: np.ndarray,
    prefer_space: Literal["auto", "probability", "logit"] = "auto",
) -> dict[str, Any]:
    """Ajusta `(w_logit, w_gbm)` y espacio de mezcla estrictamente en la ventana de calibración."""
    from scipy.optimize import minimize_scalar

    if len(y_cal) < 200:
        return {"blend_space": "logit", "w_logit": 0.65, "w_gbm": 0.35}

    y_arr = np.asarray(y_cal, dtype=np.int64)
    pl = np.asarray(p_logit_cal, dtype=np.float64)
    pg = np.asarray(p_gbm_cal, dtype=np.float64)

    res_prob = minimize_scalar(
        lambda wg: multiclass_log_loss(y_arr, blend_logit_and_gbm_probs(pl, pg, 1.0 - wg, wg, "probability")),
        bounds=(0.0, 1.0),
        method="bounded",
    )
    wg_prob = round(float(res_prob.x), 6)
    wl_prob = round(1.0 - wg_prob, 6)
    ll_prob = multiclass_log_loss(y_arr, blend_logit_and_gbm_probs(pl, pg, wl_prob, wg_prob, "probability"))

    res_log = minimize_scalar(
        lambda wg: multiclass_log_loss(y_arr, blend_logit_and_gbm_probs(pl, pg, 1.0 - wg, wg, "logit")),
        bounds=(0.0, 1.0),
        method="bounded",
    )
    wg_log = round(float(res_log.x), 6)
    wl_log = round(1.0 - wg_log, 6)
    ll_log = multiclass_log_loss(y_arr, blend_logit_and_gbm_probs(pl, pg, wl_log, wg_log, "logit"))

    if prefer_space == "probability" or (prefer_space == "auto" and ll_prob < ll_log - 1e-7):
        return {
            "blend_space": "probability",
            "w_logit": wl_prob,
            "w_gbm": wg_prob,
            "val_log_loss_probability": ll_prob,
            "val_log_loss_logit": ll_log,
        }
    return {
        "blend_space": "logit",
        "w_logit": wl_log,
        "w_gbm": wg_log,
        "val_log_loss_probability": ll_prob,
        "val_log_loss_logit": ll_log,
    }


def compute_ece(y: np.ndarray, p: np.ndarray, n_bins: int = 10) -> float:
    if len(y) == 0:
        return 0.0
    conf = np.max(p, axis=1)
    pred = np.argmax(p, axis=1)
    acc = (pred == y).astype(float)
    bins = np.linspace(0.0, 1.0, n_bins + 1)
    ece = 0.0
    n = float(len(y))
    for b in range(n_bins):
        lo, hi = bins[b], bins[b + 1]
        mask = (conf >= lo) & (conf <= hi if b == n_bins - 1 else conf < hi)
        if np.any(mask):
            ece += (np.sum(mask) / n) * abs(float(np.mean(acc[mask])) - float(np.mean(conf[mask])))
    return float(ece)


def eval_prob_matrix(y: np.ndarray, p: np.ndarray) -> dict[str, Any]:
    if len(y) == 0:
        return {"n": 0, "log_loss": None, "brier": None, "ece": None, "accuracy": None}
    p_norm = p / np.maximum(PROB_FLOOR, p.sum(axis=1, keepdims=True))
    p_clip = np.clip(p_norm, PROB_FLOOR, 1.0)
    ll = float(-np.mean(np.log(p_clip[np.arange(len(y)), y])))
    oh = np.zeros_like(p_norm)
    oh[np.arange(len(y)), y] = 1.0
    brier = float(np.mean(np.sum((p_norm - oh) ** 2, axis=1)))
    acc = float(np.mean(np.argmax(p_norm, axis=1) == y))
    ece = compute_ece(y, p_norm, n_bins=10)
    return {
        "n": int(len(y)),
        "log_loss": ll,
        "brier": brier,
        "ece": ece,
        "accuracy": acc,
    }


def paired_bootstrap_ll_and_brier(
    y: np.ndarray,
    p_candidate: np.ndarray,
    p_ref: np.ndarray,
    n_boot: int = 2000,
    seed: int = 42,
) -> dict[str, Any]:
    """Bootstrap pareado sobre `loss(candidate) - loss(ref)` (`< 0` => candidate mejora a ref)."""
    if int(n_boot) < 1000:
        raise ValueError(f"n_boot debe ser >= 1000; recibido {n_boot}")
    n = len(y)
    if n == 0:
        return {
            "n": 0,
            "n_boot": int(n_boot),
            "seed": int(seed),
            "delta_log_loss": None,
            "ci95_log_loss": None,
            "log_loss_significant": False,
            "log_loss_significance": "no significativa",
            "delta_brier": None,
            "ci95_brier": None,
            "brier_significant": False,
            "brier_significance": "no significativa",
        }
    pc = np.clip(p_candidate / np.maximum(PROB_FLOOR, p_candidate.sum(axis=1, keepdims=True)), PROB_FLOOR, 1.0)
    pr = np.clip(p_ref / np.maximum(PROB_FLOOR, p_ref.sum(axis=1, keepdims=True)), PROB_FLOOR, 1.0)
    d_ll = -np.log(pc[np.arange(n), y]) - (-np.log(pr[np.arange(n), y]))

    oh = np.zeros_like(pc)
    oh[np.arange(n), y] = 1.0
    d_br = np.sum((pc - oh) ** 2, axis=1) - np.sum((pr - oh) ** 2, axis=1)

    rng = np.random.default_rng(seed)
    boot_ll = np.empty(n_boot, dtype=float)
    boot_br = np.empty(n_boot, dtype=float)
    for b in range(n_boot):
        idx = rng.integers(0, n, size=n)
        boot_ll[b] = float(np.mean(d_ll[idx]))
        boot_br[b] = float(np.mean(d_br[idx]))

    ci_ll = np.percentile(boot_ll, [2.5, 97.5])
    ci_br = np.percentile(boot_br, [2.5, 97.5])
    ll_sig = bool(ci_ll[1] < 0.0 or ci_ll[0] > 0.0)
    br_sig = bool(ci_br[1] < 0.0 or ci_br[0] > 0.0)
    return {
        "n": int(n),
        "n_boot": int(n_boot),
        "seed": int(seed),
        "delta_log_loss": float(np.mean(d_ll)),
        "ci95_log_loss": [float(ci_ll[0]), float(ci_ll[1])],
        "log_loss_significant": ll_sig,
        "log_loss_significance": "significativa" if ll_sig else "no significativa",
        "prob_candidate_better_ll": float(np.mean(boot_ll < 0.0)),
        "delta_brier": float(np.mean(d_br)),
        "ci95_brier": [float(ci_br[0]), float(ci_br[1])],
        "brier_significant": br_sig,
        "brier_significance": "significativa" if br_sig else "no significativa",
    }


def load_dev_soccer_features_strict(
    parquet_path: Path = DEFAULT_PARQUET,
    matches_parquet_path: Path = DEFAULT_MATCHES_PARQUET,
    *,
    holdout_cut_ts_iso: str = HOLDOUT_CUT_TS_ISO,
    unlock_holdout: bool = False,
):
    """Carga `features.parquet` con marca temporal UTC exacta `ts_event_start` y corta estrictamente
    `< holdout_cut_ts` cuando `unlock_holdout=False` (regla obligatoria anti-fuga)."""
    import pandas as pd

    if unlock_holdout:
        raise HoldoutLeakageGuardError(
            "PROHIBIDO ABRIR EL HOLDOUT SELLADO (`unlock_holdout=False` obligatorio en A7)."
        )

    holdout_cut_ts = pd.Timestamp(holdout_cut_ts_iso)
    df = pd.read_parquet(parquet_path)
    df = df[df["y"].notna()].copy()
    df["y"] = df["y"].astype(int)
    df["match_date"] = pd.to_datetime(df["match_date"])
    df["sstart"] = df["season"].astype(str).str[:4].astype(int)

    if matches_parquet_path.exists():
        matches = pd.read_parquet(matches_parquet_path, columns=["match_id", "kickoff_time"])
        if "kickoff_time" in df.columns:
            df = df.drop(columns=["kickoff_time"])
        df = df.merge(matches, on="match_id", how="left")
    else:
        if "kickoff_time" not in df.columns:
            df["kickoff_time"] = "15:00"

    ko_raw = df["kickoff_time"].fillna("15:00").astype(str).str.strip()
    valid_hhmm = ko_raw.str.len().eq(5) & ko_raw.str.slice(2, 3).eq(":")
    ko_clean = pd.Series(np.where(valid_hhmm, ko_raw, "15:00"), index=df.index)
    date_part = df["match_date"].dt.strftime("%Y-%m-%d")
    df["ts_event_start"] = pd.to_datetime(date_part + "T" + ko_clean + ":00Z", utc=True)

    dev_only = df[df["ts_event_start"] < holdout_cut_ts].copy()
    dev_only = dev_only.sort_values(["ts_event_start", "match_id"], kind="mergesort").reset_index(drop=True)
    if (dev_only["ts_event_start"] >= holdout_cut_ts).any():
        raise HoldoutLeakageGuardError("Se detectó al menos una fila >= holdout_cut_ts tras el filtrado.")
    return dev_only


def build_design_matrix_with_div_onehot(df_sub, base_cols: list[str], div_levels: list[str]) -> np.ndarray:
    """Construye la matriz `[...base_cols, ...div_onehot]` preservando `NaN` en `base_cols`."""
    import pandas as pd

    x_num = df_sub[base_cols].to_numpy(dtype=np.float64)
    x_div = (
        pd.get_dummies(df_sub["div"], prefix="div")
        .reindex(columns=[f"div_{dv}" for dv in div_levels], fill_value=0.0)
        .to_numpy(dtype=np.float64)
    )
    return np.hstack([x_num, x_div])


@dataclass
class CausalGbmV31Bundle:
    """Paquete causal completo entrenado, calibrado y validado estrictamente `< holdout_cut_ts`."""

    gbm_model: Any
    logit_imputer: Any
    logit_scaler: Any
    logit_model: Any
    base_feature_names: list[str]
    div_levels: list[str]
    all_feature_names: list[str]
    temperature: float
    blend_space: Literal["probability", "logit"]
    w_logit: float
    w_gbm: float
    train_start_ts_utc: str
    train_cut_ts_utc: str
    val_cut_ts_utc: str
    holdout_cut_ts_utc: str
    n_train_gbm: int
    n_train_logit: int
    n_calibration: int
    n_validation: int
    cal_metrics: dict[str, Any]
    val_df: Any
    X_val_exact: np.ndarray
    probs_gbm_raw_val: np.ndarray
    probs_gbm_cal_val: np.ndarray
    probs_logit_val: np.ndarray
    probs_ensemble_val: np.ndarray


def fit_causal_gbm_and_logit_v31(
    parquet_path: Path = DEFAULT_PARQUET,
    matches_parquet_path: Path = DEFAULT_MATCHES_PARQUET,
    *,
    train_cut_ts_iso: str = DEFAULT_TRAIN_CUT_TS_ISO,
    val_cut_ts_iso: str = DEFAULT_VAL_CUT_TS_ISO,
    holdout_cut_ts_iso: str = HOLDOUT_CUT_TS_ISO,
    gbm_rolling_years: int = 10,
    logit_rolling_years: int = 12,
    rounds: int = 120,
    learning_rate: float = 0.045,
    max_leaf_nodes: int = 15,
    min_samples_leaf: int = 140,
    l2_regularization: float = 10.0,
    logit_c: float = 0.02,
    seed: int = 42,
    unlock_holdout: bool = False,
) -> CausalGbmV31Bundle:
    """Entrena `HistGradientBoostingClassifier` + `Logit` compañero sin fuga temporal:
      - Árboles y Logit: `ts_event_start < train_cut_ts` (`2023-07-01T00:00:00Z`).
      - Temperatura `T` y pesos `(w_logit, w_gbm)`: `train_cut_ts <= ts_event_start < val_cut_ts` (`2024-07-01T00:00:00Z`).
      - Validación de paridad 100% OOS: `val_cut_ts <= ts_event_start < holdout_cut_ts` (`2025-02-02T17:30:00Z`).
    """
    import pandas as pd
    from sklearn.ensemble import HistGradientBoostingClassifier
    from sklearn.impute import SimpleImputer
    from sklearn.linear_model import LogisticRegression
    from sklearn.preprocessing import StandardScaler

    if str(PRED_LAB_ROOT / "models" / "a") not in sys.path:
        sys.path.insert(0, str(PRED_LAB_ROOT / "models" / "a"))
    import train_motor_a as tma  # type: ignore

    dev_df = load_dev_soccer_features_strict(
        parquet_path=parquet_path,
        matches_parquet_path=matches_parquet_path,
        holdout_cut_ts_iso=holdout_cut_ts_iso,
        unlock_holdout=unlock_holdout,
    )

    train_cut_ts = pd.Timestamp(train_cut_ts_iso)
    val_cut_ts = pd.Timestamp(val_cut_ts_iso)
    holdout_cut_ts = pd.Timestamp(holdout_cut_ts_iso)
    if not (train_cut_ts < val_cut_ts < holdout_cut_ts):
        raise ValueError("Se requiere train_cut_ts < val_cut_ts < holdout_cut_ts.")

    base_cols = list(tma.FEATURES)
    div_levels = sorted(dev_df["div"].unique().tolist())
    all_feature_names = base_cols + [f"div_{dv}" for dv in div_levels]

    gbm_min_ts = train_cut_ts - pd.DateOffset(years=int(gbm_rolling_years))
    logit_min_ts = train_cut_ts - pd.DateOffset(years=int(logit_rolling_years))

    tr_gbm_df = dev_df[(dev_df["ts_event_start"] >= gbm_min_ts) & (dev_df["ts_event_start"] < train_cut_ts)].copy()
    tr_logit_df = dev_df[(dev_df["ts_event_start"] >= logit_min_ts) & (dev_df["ts_event_start"] < train_cut_ts)].copy()
    cal_df = dev_df[(dev_df["ts_event_start"] >= train_cut_ts) & (dev_df["ts_event_start"] < val_cut_ts)].copy()
    val_df = dev_df[(dev_df["ts_event_start"] >= val_cut_ts) & (dev_df["ts_event_start"] < holdout_cut_ts)].copy()

    if tr_gbm_df.empty or cal_df.empty or val_df.empty:
        raise RuntimeError(
            f"Partición vacía: tr_gbm={len(tr_gbm_df)}, cal={len(cal_df)}, val={len(val_df)}"
        )
    if (val_df["ts_event_start"] >= holdout_cut_ts).any():
        raise HoldoutLeakageGuardError("val_df contiene eventos >= holdout_cut_ts.")

    # 1. Ajuste de HistGradientBoostingClassifier en `< train_cut_ts`
    X_tr_gbm = build_design_matrix_with_div_onehot(tr_gbm_df, base_cols, div_levels)
    y_tr_gbm = tr_gbm_df["y"].to_numpy(dtype=np.int64)
    days_gbm = (tr_gbm_df["match_date"].max() - tr_gbm_df["match_date"]).dt.days.to_numpy(dtype=np.float64)
    sw_gbm = 0.5 ** (days_gbm / 1460.0)

    hgb = HistGradientBoostingClassifier(
        max_iter=int(rounds),
        learning_rate=float(learning_rate),
        max_leaf_nodes=int(max_leaf_nodes),
        min_samples_leaf=int(min_samples_leaf),
        l2_regularization=float(l2_regularization),
        early_stopping=False,
        random_state=int(seed),
    )
    hgb.fit(X_tr_gbm, y_tr_gbm, sample_weight=sw_gbm)

    # 2. Ajuste del compañero Logit en `< train_cut_ts`
    X_tr_logit = build_design_matrix_with_div_onehot(tr_logit_df, base_cols, div_levels)
    y_tr_logit = tr_logit_df["y"].to_numpy(dtype=np.int64)
    days_logit = (tr_logit_df["match_date"].max() - tr_logit_df["match_date"]).dt.days.to_numpy(dtype=np.float64)
    sw_logit = 0.5 ** (days_logit / 1460.0)

    imputer = SimpleImputer(strategy="median").fit(X_tr_logit)
    X_tr_imp = imputer.transform(X_tr_logit)
    scaler = StandardScaler().fit(X_tr_imp)
    X_tr_std = scaler.transform(X_tr_imp)
    lr = LogisticRegression(max_iter=2000, tol=1e-4, C=float(logit_c))
    lr.fit(X_tr_std, y_tr_logit, sample_weight=sw_logit)

    # 3. Calibración de temperatura `T` + pesos `(w_logit, w_gbm)` en `[train_cut_ts, val_cut_ts)`
    X_cal = build_design_matrix_with_div_onehot(cal_df, base_cols, div_levels)
    y_cal = cal_df["y"].to_numpy(dtype=np.int64)
    p_gbm_raw_cal = np.asarray(hgb.predict_proba(X_cal), dtype=np.float64)
    p_logit_cal = np.asarray(lr.predict_proba(scaler.transform(imputer.transform(X_cal))), dtype=np.float64)

    temp_opt = round(fit_temperature_scaling(p_gbm_raw_cal, y_cal), 6)
    p_gbm_cal_cal = apply_temperature_3way(p_gbm_raw_cal, temp_opt)
    ens_fit = fit_logit_gbm_ensemble_weights(p_logit_cal, p_gbm_cal_cal, y_cal, prefer_space="auto")
    blend_space: Literal["probability", "logit"] = ens_fit["blend_space"]
    w_logit = float(ens_fit["w_logit"])
    w_gbm = float(ens_fit["w_gbm"])
    p_ens_cal = blend_logit_and_gbm_probs(p_logit_cal, p_gbm_cal_cal, w_logit, w_gbm, blend_space)

    # 4. Inferencia exacta de Python en el 100% del set de validación `[val_cut_ts, holdout_cut_ts)`
    X_val = build_design_matrix_with_div_onehot(val_df, base_cols, div_levels)
    p_gbm_raw_val = np.asarray(hgb.predict_proba(X_val), dtype=np.float64)
    p_gbm_cal_val = apply_temperature_3way(p_gbm_raw_val, temp_opt)
    p_logit_val = np.asarray(lr.predict_proba(scaler.transform(imputer.transform(X_val))), dtype=np.float64)
    p_ens_val = blend_logit_and_gbm_probs(p_logit_val, p_gbm_cal_val, w_logit, w_gbm, blend_space)

    cal_metrics = {
        "n_calibration": int(len(y_cal)),
        "temperature": temp_opt,
        "blend_space": blend_space,
        "w_logit": w_logit,
        "w_gbm": w_gbm,
        "gbm_raw": eval_prob_matrix(y_cal, p_gbm_raw_cal),
        "gbm_calibrated": eval_prob_matrix(y_cal, p_gbm_cal_cal),
        "logit": eval_prob_matrix(y_cal, p_logit_cal),
        "ensemble": eval_prob_matrix(y_cal, p_ens_cal),
    }

    return CausalGbmV31Bundle(
        gbm_model=hgb,
        logit_imputer=imputer,
        logit_scaler=scaler,
        logit_model=lr,
        base_feature_names=base_cols,
        div_levels=div_levels,
        all_feature_names=all_feature_names,
        temperature=temp_opt,
        blend_space=blend_space,
        w_logit=w_logit,
        w_gbm=w_gbm,
        train_start_ts_utc=tr_gbm_df["ts_event_start"].min().isoformat(),
        train_cut_ts_utc=train_cut_ts.isoformat(),
        val_cut_ts_utc=val_cut_ts.isoformat(),
        holdout_cut_ts_utc=holdout_cut_ts.isoformat(),
        n_train_gbm=int(len(tr_gbm_df)),
        n_train_logit=int(len(tr_logit_df)),
        n_calibration=int(len(cal_df)),
        n_validation=int(len(val_df)),
        cal_metrics=cal_metrics,
        val_df=val_df.reset_index(drop=True),
        X_val_exact=X_val,
        probs_gbm_raw_val=p_gbm_raw_val,
        probs_gbm_cal_val=p_gbm_cal_val,
        probs_logit_val=p_logit_val,
        probs_ensemble_val=p_ens_val,
    )


def _fit_predict_gbm_fold(
    tr_df,
    te_df,
    feature_cols: list[str],
    div_levels: list[str],
    rounds: int = 120,
) -> tuple[np.ndarray, np.ndarray]:
    X_tr = build_design_matrix_with_div_onehot(tr_df, feature_cols, div_levels)
    y_tr = tr_df["y"].to_numpy(dtype=int)
    X_te = build_design_matrix_with_div_onehot(te_df, feature_cols, div_levels)

    days = (tr_df["match_date"].max() - tr_df["match_date"]).dt.days.to_numpy(dtype=float)
    sw = 0.5 ** (days / 1460.0)

    if HAS_LGB:
        dtrain = lgb.Dataset(X_tr, label=y_tr, weight=sw, free_raw_data=True)
        params = {
            "objective": "multiclass",
            "num_class": 3,
            "learning_rate": 0.04,
            "num_leaves": 15,
            "min_data_in_leaf": 140,
            "feature_fraction": 0.75,
            "bagging_fraction": 0.85,
            "bagging_freq": 1,
            "lambda_l2": 10.0,
            "verbosity": -1,
            "num_threads": 1,
            "seed": 42,
        }
        booster = lgb.train(params, dtrain, num_boost_round=rounds)
        probs = np.asarray(booster.predict(X_te), dtype=float)
        imp = np.asarray(booster.feature_importance(importance_type="gain"), dtype=float)
        return probs, imp

    from sklearn.ensemble import HistGradientBoostingClassifier

    hgb = HistGradientBoostingClassifier(
        max_iter=rounds,
        learning_rate=0.045,
        max_leaf_nodes=15,
        min_samples_leaf=140,
        l2_regularization=10.0,
        early_stopping=False,
        random_state=42,
    )
    hgb.fit(X_tr, y_tr, sample_weight=sw)
    probs = hgb.predict_proba(X_te)
    imp = np.zeros(X_tr.shape[1], dtype=float)
    return probs, imp


def run_tachyon_v30_gbm_benchmark(
    parquet_path: Path = DEFAULT_PARQUET,
    out_json_path: Path = DEFAULT_V30_JSON,
    rounds: int = 120,
    rolling_seasons: int = 12,
    logit_c: float = 0.05,
    logit_features: list[str] | None = None,
    use_global_date_cut: bool = True,
    unlock_holdout: bool = False,
) -> dict[str, Any]:
    """Ejecuta walk-forward GBM vs Tachyon Logit estrictamente en `< 2025-02-02T17:30:00Z` (`unlock_holdout=False`)."""
    import pandas as pd
    from sklearn.impute import SimpleImputer
    from sklearn.linear_model import LogisticRegression
    from sklearn.preprocessing import StandardScaler

    if str(PRED_LAB_ROOT / "models" / "a") not in sys.path:
        sys.path.insert(0, str(PRED_LAB_ROOT / "models" / "a"))
    import train_motor_a as tma  # type: ignore

    df = load_dev_soccer_features_strict(
        parquet_path=parquet_path,
        unlock_holdout=unlock_holdout,
    )

    base_logit_feats = list(logit_features) if logit_features is not None else list(tma.FEATURES)
    gbm_feats = list(dict.fromkeys(base_logit_feats + [c for c in TACHYON_V30_EXTRA_FEATURES if c in df.columns]))
    div_levels = sorted(df["div"].unique().tolist())

    fold_preds: dict[int, pd.DataFrame] = {}
    importances = np.zeros(len(gbm_feats) + len(div_levels), dtype=float)
    n_models = 0

    for s in (2023, 2024, 2025):
        te = df[df["sstart"] == s].copy()
        if te.empty:
            continue
        tr = df[(df["sstart"] >= s - rolling_seasons) & (df["sstart"] < s)].copy()
        if use_global_date_cut:
            cut_ts = te["ts_event_start"].min()
            cut_date = te["match_date"].min()
            tr = tr[(tr["ts_event_start"] < cut_ts) & (tr["match_date"] < cut_date)].copy()

        X_tr_l = build_design_matrix_with_div_onehot(tr, base_logit_feats, div_levels)
        X_te_l = build_design_matrix_with_div_onehot(te, base_logit_feats, div_levels)
        imp = SimpleImputer(strategy="median").fit(X_tr_l)
        sc = StandardScaler().fit(imp.transform(X_tr_l))
        days = (tr["match_date"].max() - tr["match_date"]).dt.days.to_numpy(dtype=float)
        sw = 0.5 ** (days / 1460.0)
        lr = LogisticRegression(max_iter=2000, tol=1e-4, C=logit_c)
        lr.fit(sc.transform(imp.transform(X_tr_l)), tr["y"].to_numpy(), sample_weight=sw)
        p_logit = lr.predict_proba(sc.transform(imp.transform(X_te_l)))

        tr_gbm = df[(df["sstart"] >= s - 10) & (df["sstart"] < s)].copy()
        if use_global_date_cut:
            tr_gbm = tr_gbm[
                (tr_gbm["ts_event_start"] < te["ts_event_start"].min())
                & (tr_gbm["match_date"] < te["match_date"].min())
            ].copy()
        p_gbm, gain_imp = _fit_predict_gbm_fold(tr_gbm, te, gbm_feats, div_levels, rounds=rounds)
        importances += gain_imp
        n_models += 1

        part_df = te[["match_id", "div", "season", "sstart", "match_date", "ts_event_start", "y"]].copy()
        part_df["logit_h"], part_df["logit_d"], part_df["logit_a"] = p_logit[:, 0], p_logit[:, 1], p_logit[:, 2]
        part_df["gbm_h"], part_df["gbm_d"], part_df["gbm_a"] = p_gbm[:, 0], p_gbm[:, 1], p_gbm[:, 2]
        fold_preds[s] = part_df

    val_df = fold_preds[2023]
    test_parts = [fold_preds[k] for k in (2024, 2025) if k in fold_preds]
    test_df = pd.concat(test_parts, ignore_index=True)

    yv = val_df["y"].to_numpy(dtype=int)
    pl_v = val_df[["logit_h", "logit_d", "logit_a"]].to_numpy(dtype=float)
    pg_v_raw = val_df[["gbm_h", "gbm_d", "gbm_a"]].to_numpy(dtype=float)

    temp_v = round(fit_temperature_scaling(pg_v_raw, yv), 6)
    pg_v = apply_temperature_3way(pg_v_raw, temp_v)
    ens_info = fit_logit_gbm_ensemble_weights(pl_v, pg_v, yv, prefer_space="probability")
    w_logit = round(float(ens_info["w_logit"]), 4)
    w_gbm = round(float(ens_info["w_gbm"]), 4)

    def _eval_split(sdf: pd.DataFrame) -> dict[str, Any]:
        slices = {
            "global": np.ones(len(sdf), dtype=bool),
            "top5_europe": sdf["div"].isin(TOP5_DIVS).to_numpy(),
            "liga_mx": (sdf["div"] == "MEX").to_numpy(),
            "top5_plus_mex": sdf["div"].isin((*TOP5_DIVS, "MEX")).to_numpy(),
        }
        res_split: dict[str, Any] = {}
        for sname, mask in slices.items():
            sub = sdf.loc[mask]
            y_s = sub["y"].to_numpy(dtype=int)
            pl = sub[["logit_h", "logit_d", "logit_a"]].to_numpy(dtype=float)
            pg_raw_s = sub[["gbm_h", "gbm_d", "gbm_a"]].to_numpy(dtype=float)
            pg = apply_temperature_3way(pg_raw_s, temp_v)
            pb = blend_logit_and_gbm_probs(pl, pg, w_logit, w_gbm, "probability")
            res_split[sname] = {
                "logit_v30": eval_prob_matrix(y_s, pl),
                "gbm_v30_raw": eval_prob_matrix(y_s, pg_raw_s),
                "gbm_v30": eval_prob_matrix(y_s, pg),
                "ensemble_logit_gbm": eval_prob_matrix(y_s, pb),
                "paired_bootstrap_ensemble_vs_logit": paired_bootstrap_ll_and_brier(y_s, pb, pl, n_boot=2000, seed=42),
                "paired_bootstrap_gbm_vs_logit": paired_bootstrap_ll_and_brier(y_s, pg, pl, n_boot=2000, seed=42),
            }
        return res_split

    report = {
        "codename": "PitchLab Tachyon v3.1 — GBM Calibrado & Ensemble Benchmark (walk_forward_dev)",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "gbm_backend": "lightgbm" if HAS_LGB else "sklearn.HistGradientBoostingClassifier",
        "protocol": "walk_forward_global_cut" if use_global_date_cut else "walk_forward_season_split",
        "holdout_cut_ts_utc": HOLDOUT_CUT_TS_ISO,
        "holdout_sealed_untouched": True,
        "n_logit_features": len(base_logit_feats),
        "n_gbm_features": len(gbm_feats),
        "tachyon_v30_new_features_in_gbm": [c for c in TACHYON_V30_EXTRA_FEATURES if c in gbm_feats],
        "temperature_calibrated_on_val_2023": temp_v,
        "ensemble_weights_calibrated_on_val_2023": {
            "w_logit": w_logit,
            "w_gbm": w_gbm,
        },
        "val_2023": _eval_split(val_df),
        "test_2024_2025": _eval_split(test_df),
    }

    out_json_path.parent.mkdir(parents=True, exist_ok=True)
    out_json_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


# ---------------------------------------------------------------------------
# Modo legado JSONL (`Reportes/modelos/features-asof.jsonl`)
# ---------------------------------------------------------------------------
def metrics(rows: list[dict], key: str) -> dict:
    losses = []
    brier = 0.0
    hits = 0
    for row in rows:
        probs = row[key]
        outcome = row["outcome"]
        losses.append(safe_log(probs[outcome]))
        for index in range(3):
            brier += (probs[index] - (1 if index == outcome else 0)) ** 2
        best = max(range(3), key=lambda index: probs[index])
        if best == outcome:
            hits += 1
    n = len(rows)
    if n == 0:
        return {"n": 0, "log_loss": 0.0, "brier": 0.0, "accuracy": 0.0}
    return {
        "n": n,
        "log_loss": sum(losses) / n,
        "brier": brier / n,
        "accuracy": hits / n,
    }


def paired_bootstrap(a: list[float], b: list[float], iterations: int = 2000, seed: int = 42) -> dict:
    if not a or not b:
        return {"mean_diff": 0.0, "lower": 0.0, "upper": 0.0}
    n = min(len(a), len(b))
    diffs = np.array([b[i] - a[i] for i in range(n)], dtype=float)
    rng = np.random.default_rng(seed)
    means = np.empty(iterations)
    for it in range(iterations):
        idx = rng.integers(0, n, n)
        means[it] = diffs[idx].mean()
    means.sort()
    return {
        "mean_diff": float(diffs.mean()),
        "lower": float(means[int(iterations * 0.025)]),
        "upper": float(means[int(iterations * 0.975)]),
    }


def feature_row(row: dict, league_index: dict[str, int]) -> list[float]:
    one_hot = [0.0] * len(league_index)
    one_hot[league_index[row["league"]]] = 1.0
    return list(row["features"]) + one_hot


def train_pooled_jsonl(leagues: list[str], rows: list[dict], min_train_rows: int, rounds: int) -> dict:
    from sklearn.ensemble import HistGradientBoostingClassifier

    league_index = {league: index for index, league in enumerate(leagues)}
    season_rows: dict[str, list[dict]] = {}
    for row in rows:
        season_rows.setdefault(row["season"], []).append(row)
    seasons = sorted(season_rows)

    n_feat = len(rows[0]["features"]) if rows else len(LEGACY_FEATURE_NAMES)
    predictions: dict[str, list[dict]] = {league: [] for league in leagues}
    importance = np.zeros(n_feat + len(leagues))
    models = 0

    for season in seasons:
        train = [row for season_key, group in season_rows.items() if season_key < season for row in group]
        test = season_rows.get(season, [])
        if len(train) < min_train_rows or not test:
            continue
        x_train = np.array([feature_row(row, league_index) for row in train], dtype=float)
        y_train = np.array([row["outcome"] for row in train], dtype=int)
        x_test = np.array([feature_row(row, league_index) for row in test], dtype=float)

        if HAS_LGB:
            train_data = lgb.Dataset(x_train, label=y_train, free_raw_data=True)
            params = {
                "objective": "multiclass",
                "num_class": 3,
                "learning_rate": 0.03,
                "num_leaves": 7,
                "min_data_in_leaf": 150,
                "feature_fraction": 0.7,
                "bagging_fraction": 0.8,
                "bagging_freq": 1,
                "lambda_l2": 10.0,
                "verbosity": -1,
                "num_threads": 1,
                "seed": 42,
            }
            model = lgb.train(params, train_data, num_boost_round=rounds)
            importance += model.feature_importance(importance_type="gain")
            probabilities = model.predict(x_test)
        else:
            hgb = HistGradientBoostingClassifier(
                max_iter=rounds,
                learning_rate=0.03,
                max_leaf_nodes=7,
                min_samples_leaf=150,
                l2_regularization=10.0,
                early_stopping=False,
                random_state=42,
            )
            hgb.fit(x_train, y_train)
            probabilities = hgb.predict_proba(x_test)
        models += 1
        for row, probs in zip(test, probabilities, strict=True):
            predictions[row["league"]].append({**row, "gbm": [float(value) for value in probs]})

    results = []
    for league in leagues:
        predictions_league = predictions[league]
        if not predictions_league:
            results.append({"league": league, "rows": 0})
            continue
        gbm_metrics = metrics(predictions_league, "gbm")
        dc_metrics = metrics(predictions_league, "dc")
        elo_metrics = metrics(predictions_league, "elo")
        blend_metrics = metrics(predictions_league, "blend")
        with_market = [row for row in predictions_league if row.get("market")]
        market_metrics = metrics(with_market, "market") if with_market else {"n": 0}

        gbm_losses = [safe_log(row["gbm"][row["outcome"]]) for row in predictions_league]
        blend_losses = [safe_log(row["blend"][row["outcome"]]) for row in predictions_league]
        dc_losses = [safe_log(row["dc"][row["outcome"]]) for row in predictions_league]
        market_losses = [safe_log(row["market"][row["outcome"]]) for row in with_market]
        gbm_market_losses = [safe_log(row["gbm"][row["outcome"]]) for row in with_market]

        feat_labels = (
            LEGACY_FEATURE_NAMES
            if n_feat == len(LEGACY_FEATURE_NAMES)
            else [f"f_{i}" for i in range(n_feat)]
        )
        results.append(
            {
                "league": league,
                "rows": len(predictions_league),
                "seasons": models,
                "gbm": gbm_metrics,
                "dc": dc_metrics,
                "elo": elo_metrics,
                "blend": blend_metrics,
                "market": market_metrics,
                "gbm_vs_blend": paired_bootstrap(blend_losses, gbm_losses),
                "gbm_vs_dc": paired_bootstrap(dc_losses, gbm_losses),
                "gbm_vs_market": paired_bootstrap(market_losses, gbm_market_losses) if with_market else None,
                "importance": {
                    name: float(value / max(models, 1))
                    for name, value in zip(
                        feat_labels + [f"league_{league_name}" for league_name in leagues],
                        importance,
                        strict=True,
                    )
                },
            }
        )
    return {"leagues": results, "models": models}


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["tachyon", "asof-jsonl"], default="tachyon")
    parser.add_argument("--parquet", default=str(DEFAULT_PARQUET))
    parser.add_argument("--out-v30-json", default=str(DEFAULT_V30_JSON))
    parser.add_argument("--features", default="Reportes/modelos/features-asof.jsonl")
    parser.add_argument("--json", default=str(DEFAULT_V30_JSON))
    parser.add_argument("--min-train-rows", type=int, default=1200)
    parser.add_argument("--rounds", type=int, default=120)
    parser.add_argument("--season-split", action="store_true", help="Sin corte global inter-liga (estilo export_model)")
    args = parser.parse_args()

    if args.mode == "tachyon":
        report = run_tachyon_v30_gbm_benchmark(
            parquet_path=Path(args.parquet),
            out_json_path=Path(args.out_v30_json),
            rounds=args.rounds,
            use_global_date_cut=not args.season_split,
            unlock_holdout=False,
        )
        w = report["ensemble_weights_calibrated_on_val_2023"]
        v_g = report["val_2023"]["global"]
        t_g = report["test_2024_2025"]["global"]
        print(
            f"[Tachyon v3.1 GBM ({report['gbm_backend']})] T={report['temperature_calibrated_on_val_2023']} weights={w}\n"
            f"  VAL 2023  (n={v_g['logit_v30']['n']:,}): logit={v_g['logit_v30']['log_loss']:.5f} "
            f"gbm_cal={v_g['gbm_v30']['log_loss']:.5f} ens={v_g['ensemble_logit_gbm']['log_loss']:.5f} "
            f"Δens-logit={v_g['paired_bootstrap_ensemble_vs_logit']['delta_log_loss']:+.5f}\n"
            f"  VAL2 24-25(n={t_g['logit_v30']['n']:,}, <holdout): logit={t_g['logit_v30']['log_loss']:.5f} "
            f"gbm_cal={t_g['gbm_v30']['log_loss']:.5f} ens={t_g['ensemble_logit_gbm']['log_loss']:.5f} "
            f"Δens-logit={t_g['paired_bootstrap_ensemble_vs_logit']['delta_log_loss']:+.5f}",
            flush=True,
        )
        print(f"escrito -> {args.out_v30_json}", flush=True)
        return

    rows = []
    with Path(args.features).open(encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    if not rows:
        raise SystemExit(f"Sin filas en {args.features}")

    leagues = sorted({row["league"] for row in rows})
    pooled = train_pooled_jsonl(leagues, rows, args.min_train_rows, args.rounds)
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "gbm_backend": "lightgbm" if HAS_LGB else "sklearn.HistGradientBoostingClassifier",
        "features_file": args.features,
        "feature_names": LEGACY_FEATURE_NAMES,
        "models": pooled["models"],
        "leagues": pooled["leagues"],
    }
    Path(args.json).parent.mkdir(parents=True, exist_ok=True)
    Path(args.json).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    random.seed(42)
    main()
