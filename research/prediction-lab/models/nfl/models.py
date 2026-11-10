"""Modelos y utilidades de probabilidad del motor NFL (A12 / PitchLab Minkowski v2.1).

Sistemas implementados
----------------------
* ``base_freq``   — frecuencia H/T/A de las temporadas de entrenamiento
  (suavizado de Laplace), constante para todos los partidos del fold.
* ``logit_elo``   — regresión logística con solo ``elo_diff``.
* ``logit``       — logit multinomial exacto con parametrización desacoplada
  2-vías + geometría hiperbólica de empate (evita sobreajustar 35 coeficientes
  sobre ~12 empates históricos y conserva el formato softmax 3xD exacto para TS).
* ``hgb``         — ``HistGradientBoostingClassifier`` regularizado con masa de empate.
* ``blend``       — combinación convexa 75/25 de ``logit`` y ``hgb``.
* ``market_prop`` — de-vig proporcional de las moneylines.
* ``market_power``— de-vig potencia (``k`` con ``Σ imp^k = 1``).
"""

from __future__ import annotations

import math
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from config import HGB_PARAMS, TIE_RATE_FLOOR
from features import CATEGORICAL_FEATURES, NUMERIC_FEATURES

SURFACE_LEVELS = ["grass", "turf", "unknown"]
PROB_CLIP = 1e-6


# ---------------------------------------------------------------------------
# Matriz de diseño
# ---------------------------------------------------------------------------
def design_columns() -> list[str]:
    return list(NUMERIC_FEATURES)


def make_design(df: pd.DataFrame) -> pd.DataFrame:
    """Matriz numérica estable (mismas columnas en todos los folds)."""
    X = df[NUMERIC_FEATURES].astype("float64").copy()
    return X[design_columns()]


# ---------------------------------------------------------------------------
# Probabilidades
# ---------------------------------------------------------------------------
def normalize_probs(p: np.ndarray, clip: float = PROB_CLIP) -> np.ndarray:
    """Recorta a ``[clip, 1]`` y renormaliza por fila (todas las filas suman 1)."""
    p = np.asarray(p, dtype="float64")
    p = np.clip(p, clip, None)
    p = p / p.sum(axis=1, keepdims=True)
    return p


def class_frequencies(y: np.ndarray, alpha: float = 1.0) -> np.ndarray:
    counts = np.bincount(np.asarray(y, dtype=int), minlength=3).astype("float64")
    return (counts + alpha) / (counts.sum() + 3.0 * alpha)


def market_three_way(
    home_devig: np.ndarray,
    away_devig: np.ndarray,
    tie_rate: float,
) -> np.ndarray:
    """Convierte un mercado 2-vías de-vigado en probabilidades H/T/A."""
    tau = float(max(tie_rate, TIE_RATE_FLOOR))
    p = np.column_stack([(1.0 - tau) * home_devig, np.full(len(home_devig), tau), (1.0 - tau) * away_devig])
    return normalize_probs(p)


class RegularizedNFLHGB:
    """Wrapper sobre HistGradientBoostingClassifier que entrena sobre H vs A y proyecta a 3 clases."""

    def __init__(self, tie_rate: float):
        self.tie_rate = float(max(tie_rate, TIE_RATE_FLOOR))
        self.hgb = HistGradientBoostingClassifier(**HGB_PARAMS)
        self.classes_ = np.array([0, 1, 2], dtype=int)

    def fit(self, X: np.ndarray, y: np.ndarray, sample_weight: np.ndarray | None = None) -> "RegularizedNFLHGB":
        nt = y != 1
        y_bin = (y[nt] == 0).astype(int)
        sw = sample_weight[nt] if sample_weight is not None else None
        self.hgb.fit(X[nt], y_bin, sample_weight=sw)
        return self

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        p_h = self.hgb.predict_proba(X)[:, 1]
        tau = self.tie_rate
        return np.column_stack([(1.0 - tau) * p_h, np.full(len(X), tau), (1.0 - tau) * (1.0 - p_h)])


# ---------------------------------------------------------------------------
# Modelos
# ---------------------------------------------------------------------------
def fit_logit(X: pd.DataFrame, y: np.ndarray, C: float, sample_weight: np.ndarray | None = None) -> Pipeline:
    """Ajusta el predictor logístico 2-vías (H vs A) y lo incrusta exactamente en un
    ``LogisticRegression`` multiclase (3xD) con geometría hiperbólica de empate.
    """
    X_arr = X.to_numpy(dtype="float64")
    scaler = StandardScaler().fit(X_arr)
    X_sc = scaler.transform(X_arr)

    nt = y != 1
    y_bin = (y[nt] == 0).astype(int)  # 1 = Home Win, 0 = Away Win
    sw = sample_weight[nt] if sample_weight is not None else None
    lr_bin = LogisticRegression(C=C, max_iter=5000, solver="lbfgs")
    lr_bin.fit(X_sc[nt], y_bin, sample_weight=sw)

    w_bin = lr_bin.coef_[0]
    b_bin = float(lr_bin.intercept_[0])
    tau = float(max(np.mean(y == 1), TIE_RATE_FLOOR))
    b_tie = math.log(2.0 * tau * math.cosh(0.32) / (1.0 - tau))

    clf = LogisticRegression(C=C, max_iter=5000, solver="lbfgs")
    clf.classes_ = np.array([0, 1, 2], dtype=int)
    clf.coef_ = np.vstack([0.5 * w_bin, np.zeros_like(w_bin), -0.5 * w_bin])
    clf.intercept_ = np.array([0.5 * b_bin, b_tie, -0.5 * b_bin], dtype="float64")
    clf.n_features_in_ = X_arr.shape[1]

    return Pipeline([("scale", scaler), ("clf", clf)])


def fit_logit_elo(X: pd.DataFrame, y: np.ndarray, C: float = 1.0) -> Pipeline:
    return fit_logit(X[["elo_diff"]], y, C=C)


def fit_hgb(X: pd.DataFrame, y: np.ndarray, sample_weight: np.ndarray | None = None) -> RegularizedNFLHGB:
    tau = float(max(np.mean(y == 1), TIE_RATE_FLOOR))
    model = RegularizedNFLHGB(tie_rate=tau)
    model.fit(X.to_numpy(dtype="float64"), y, sample_weight=sample_weight)
    return model


def predict_proba_3(model, X: pd.DataFrame, columns: list[str] | None = None) -> np.ndarray:
    """Predice y rellena clases ausentes en el entrenamiento con masa mínima."""
    data = X[columns].to_numpy(dtype="float64") if columns is not None else X.to_numpy(dtype="float64")
    raw = model.predict_proba(data)
    classes = list(getattr(model, "classes_", [0, 1, 2]))
    if isinstance(model, Pipeline):
        classes = list(model[-1].classes_)
    full = np.full((raw.shape[0], 3), PROB_CLIP, dtype="float64")
    for j, cls in enumerate(classes):
        full[:, int(cls)] = raw[:, j]
    return normalize_probs(full)
