"""Modelos y utilidades de probabilidad del motor NFL (A12).

Sistemas implementados
----------------------
* ``base_freq``   — frecuencia H/T/A de las temporadas de entrenamiento
  (suavizado de Laplace), constante para todos los partidos del fold.
* ``logit_elo``   — regresión logística multinomial con solo ``elo_diff``.
* ``logit``       — logit multinomial con todas las features deportivas
  (estandarizadas; ``C`` se elige en VAL y se congela).
* ``hgb``         — ``HistGradientBoostingClassifier`` multiclase.
* ``blend``       — media aritmética 50/50 de ``logit`` y ``hgb`` (sin ajuste).
* ``market_prop`` — de-vig proporcional de las moneylines.
* ``market_power``— de-vig potencia (``k`` con ``Σ imp^k = 1``).

El mercado es 2-vías (local/visitante) y la evaluación es 3-clases (H/T/A), así
que la masa de empate se inyecta con la tasa de empate de las temporadas de
**entrenamiento** del fold::

    p = [(1-τ)·p_H, τ, (1-τ)·p_A]

con ``τ = max(tasa_empate_train, TIE_RATE_FLOOR)``. Se documenta porque es una
decisión de modelado, no un dato del mercado.
"""

from __future__ import annotations

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
    return NUMERIC_FEATURES + [f"surface_{level}" for level in SURFACE_LEVELS[1:]]


def make_design(df: pd.DataFrame) -> pd.DataFrame:
    """Matriz numérica estable (mismas columnas en todos los folds)."""
    X = df[NUMERIC_FEATURES].astype("float64").copy()
    surface = df["surface"].fillna("unknown").astype(str)
    for level in SURFACE_LEVELS[1:]:  # grass es la referencia
        X[f"surface_{level}"] = (surface == level).astype("float64")
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


# ---------------------------------------------------------------------------
# Modelos
# ---------------------------------------------------------------------------
def fit_logit(X: pd.DataFrame, y: np.ndarray, C: float) -> Pipeline:
    model = Pipeline(
        [
            ("scale", StandardScaler()),
            ("clf", LogisticRegression(C=C, max_iter=5000, solver="lbfgs")),
        ]
    )
    model.fit(X.to_numpy(), y)
    return model


def fit_logit_elo(X: pd.DataFrame, y: np.ndarray, C: float = 1.0) -> Pipeline:
    model = Pipeline(
        [
            ("scale", StandardScaler()),
            ("clf", LogisticRegression(C=C, max_iter=5000, solver="lbfgs")),
        ]
    )
    model.fit(X[["elo_diff"]].to_numpy(), y)
    return model


def fit_hgb(X: pd.DataFrame, y: np.ndarray) -> HistGradientBoostingClassifier:
    model = HistGradientBoostingClassifier(**HGB_PARAMS)
    model.fit(X.to_numpy(), y)
    return model


def predict_proba_3(model, X: pd.DataFrame, columns: list[str] | None = None) -> np.ndarray:
    """Predice y rellena clases ausentes en el entrenamiento con masa mínima."""
    data = X[columns].to_numpy() if columns is not None else X.to_numpy()
    raw = model.predict_proba(data)
    classes = list(getattr(model, "classes_", [0, 1, 2]))
    if isinstance(model, Pipeline):
        classes = list(model[-1].classes_)
    full = np.full((raw.shape[0], 3), PROB_CLIP, dtype="float64")
    for j, cls in enumerate(classes):
        full[:, int(cls)] = raw[:, j]
    return normalize_probs(full)
