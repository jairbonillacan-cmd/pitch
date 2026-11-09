"""Métricas de evaluación multiclase para PitchLab (tarea A08).

Este módulo implementa **exactamente** las definiciones de
`coordination/CONTRACT_PREDICTIONS.md` §2–3, de forma que dos modelos solo puedan
diferir por sus probabilidades y no por la implementación de la métrica.

Convenciones fijas
------------------
* Clases y etiqueta: ``y = 0`` (H, gana local), ``y = 1`` (D, empate), ``y = 2``
  (A, gana visitante). El orden ordinal es **H < D < A** y solo se usa en el RPS.
* ``p`` es una matriz ``(N, 3)`` con columnas ``(p_home, p_draw, p_away)``,
  sin NaN, entradas en ``[0, 1]`` y filas que suman ``1 ± 1e-6``.
* Logaritmo **natural** (ln) en log-loss y en los recortes.

Definiciones
------------
Sea ``p_i = (p_iH, p_iD, p_iA)``, ``o_i`` el one-hot de ``y_i`` y ``N`` el número
de partidos:

* **Log loss multiclase**::

      LL = -(1/N) * Σ_i log(p_i[y_i])

* **Brier multiclase**::

      BS = (1/N) * Σ_i Σ_k (p_ik - o_ik)^2        ∈ [0, 2]

* **Brier por clase** (media sobre partidos, una por clase)::

      BS_k = (1/N) * Σ_i (p_ik - o_ik)^2  ;  Σ_k BS_k = BS

* **RPS** con orden H < D < A y ``K = 3``::

      RPS = (1/N) * Σ_i [ 1/(K-1) * Σ_{k=1}^{K-1} (CDF_p,i(k) - CDF_o,i(k))^2 ]

  Es decir, se compara la CDF acumulada de la predicción con la de la etiqueta en
  los cortes H y H+D. El factor ``1/(K-1) = 1/2`` normaliza a ``[0, 1]``.
* **Accuracy** = fracción de ``argmax(p_i) == y_i``.
* **Balanced accuracy** = media del recall de las clases **con soporte > 0** en
  ``y`` (una clase ausente no tiene recall definido y se excluye; se documenta).
* **ECE** = ``Σ_b (n_b/N) * |acc_b - conf_b|`` sobre ``bins`` bins de igual
  anchura en ``[0, 1]`` de la confianza ``max_k p_ik`` de la clase predicha.
  Depende del binning y del tamaño muestral: se reporta junto a la curva de
  fiabilidad, nunca como medida única.
* **Calibración one-vs-rest**: para cada clase ``k`` se trata ``p_ik`` como
  probabilidad del evento ``{y_i = k}`` y se calcula la misma tabla/ECE.

Recorte numérico (decisión documentada)
---------------------------------------
El contrato pide "``p`` recortada a ``[1e-15, 1]`` y renormalizada". El orden
importa: si se recorta y **después** se renormaliza, una predicción one-hot
perfecta deja de dar log-loss 0 (da ~2e-15 por el redondeo). Para que las
propiedades matemáticas se cumplan de forma exacta se aplica:

1. renormalización por fila (``p_i / Σ_k p_ik``), que para entradas válidas es
   un no-op salvo redondeo de 1 ulp;
2. recorte inferior a ``1e-15`` para acotar ``log``;
3. nada más: no se vuelve a renormalizar (el recorte altera la suma en ≤ 3e-15,
   muy por debajo de la tolerancia del contrato ``1e-6``).

Así, ``p = (1, 0, 0)`` correctamente predicha da ``LL = 0`` exacto, y una
probabilidad 0 para la clase observada se penaliza con ``-ln(1e-15) ≈ 34.54``.

Las métricas acotadas (Brier, RPS, accuracy, balanced accuracy, calibración) usan
la matriz **renormalizada sin suelo**: el suelo de 1e-15 solo es necesario para
acotar ``log`` y, aplicado al Brier, convertiría el caso perfecto en 2e-30 en
lugar de 0. Esta separación está cubierta por tests.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

import numpy as np

__all__ = [
    "N_CLASSES",
    "CLASS_NAMES",
    "PROB_COLUMNS",
    "EPS",
    "SUM_TOL",
    "encode_result",
    "validate_probabilities",
    "validate_labels",
    "one_hot",
    "per_sample_log_loss",
    "multiclass_log_loss",
    "per_sample_brier",
    "brier_multiclass",
    "brier_per_class",
    "rps",
    "accuracy",
    "balanced_accuracy",
    "confusion_matrix",
    "per_class_report",
    "calibration_table",
    "ece",
    "ovr_calibration",
    "summary_metrics",
]

N_CLASSES = 3
CLASS_NAMES: Tuple[str, str, str] = ("H", "D", "A")
PROB_COLUMNS: Tuple[str, str, str] = ("p_home", "p_draw", "p_away")
EPS = 1e-15
SUM_TOL = 1e-6

_LABEL_MAP = {"H": 0, "D": 1, "A": 2, "0": 0, "1": 1, "2": 2}


# ---------------------------------------------------------------------------
# Validación y utilidades
# ---------------------------------------------------------------------------
def encode_result(values: Sequence[Any]) -> np.ndarray:
    """Convierte resultados ``H/D/A`` (o ``0/1/2``) a ``int64`` en ``{0,1,2}``.

    Acepta arrays/Series de cadenas o enteros. Es el único punto donde se
    permite la conversión desde la columna ``result`` de ``matches.parquet``.
    """
    arr = np.asarray(values)
    if arr.ndim != 1:
        raise ValueError(f"encode_result espera un vector 1-D, recibido shape={arr.shape}")
    if arr.size == 0:
        raise ValueError("encode_result recibió un vector vacío")
    if arr.dtype.kind in "iu":
        out = arr.astype(np.int64)
    elif arr.dtype.kind == "f":
        if not np.all(np.isfinite(arr)) or not np.all(arr == np.floor(arr)):
            raise ValueError("encode_result: etiquetas float no enteras")
        out = arr.astype(np.int64)
    else:
        out = np.empty(arr.size, dtype=np.int64)
        for i, value in enumerate(arr.tolist()):
            if value is None or (isinstance(value, float) and math.isnan(value)):
                raise ValueError(f"encode_result: valor nulo en posición {i}")
            key = str(value).strip().upper()
            if key not in _LABEL_MAP:
                raise ValueError(
                    f"encode_result: valor no reconocido {value!r} en posición {i}; "
                    "se espera H/D/A (o 0/1/2)"
                )
            out[i] = _LABEL_MAP[key]
    if out.min() < 0 or out.max() >= N_CLASSES:
        raise ValueError("encode_result: etiquetas fuera de {0,1,2}")
    return out


def validate_labels(y: Sequence[Any], n: Optional[int] = None) -> np.ndarray:
    """Valida ``y`` como vector 1-D de enteros en ``{0, 1, 2}``.

    Lanza ``ValueError`` si hay NaN, valores no enteros, fuera de rango o si
    ``n`` no coincide con la longitud.
    """
    arr = np.asarray(y)
    if arr.ndim != 1:
        raise ValueError(f"y debe ser 1-D, recibido shape={arr.shape}")
    if arr.size == 0:
        raise ValueError("y está vacío")
    if arr.dtype.kind == "f":
        if not np.all(np.isfinite(arr)):
            raise ValueError("y contiene NaN o infinitos")
        if not np.all(arr == np.floor(arr)):
            raise ValueError("y debe contener etiquetas enteras (0=H, 1=D, 2=A)")
    try:
        out = arr.astype(np.int64)
    except (TypeError, ValueError) as exc:  # etiquetas tipo cadena
        raise ValueError(
            "y debe ser entero 0/1/2; para etiquetas H/D/A use encode_result()"
        ) from exc
    if out.min() < 0 or out.max() >= N_CLASSES:
        raise ValueError(f"y fuera de {{0,1,2}}: min={out.min()}, max={out.max()}")
    if n is not None and out.size != n:
        raise ValueError(f"y tiene {out.size} filas y se esperaban {n}")
    return out


def validate_probabilities(
    p: Sequence[Sequence[float]],
    n_classes: int = N_CLASSES,
    tol: float = SUM_TOL,
    copy: bool = True,
) -> np.ndarray:
    """Valida ``p`` como matriz ``(N, 3)`` de probabilidades.

    Comprueba forma, finitud, rango ``[0, 1]`` (tolerancia 1e-12) y que cada
    fila sume ``1 ± tol`` (por defecto ``1e-6``, según contrato). Devuelve un
    ``np.ndarray`` float64 (copia por defecto).
    """
    arr = np.asarray(p, dtype=np.float64)
    if arr.ndim != 2:
        raise ValueError(f"p debe ser una matriz 2-D (N, {n_classes}), shape={arr.shape}")
    if arr.shape[1] != n_classes:
        raise ValueError(f"p debe tener {n_classes} columnas, shape={arr.shape}")
    if arr.shape[0] == 0:
        raise ValueError("p está vacía (N=0)")
    if not np.all(np.isfinite(arr)):
        bad = int((~np.isfinite(arr)).any(axis=1).sum())
        raise ValueError(f"p contiene NaN/inf en {bad} fila(s)")
    if arr.min() < -1e-12 or arr.max() > 1.0 + 1e-12:
        raise ValueError(
            f"p debe estar en [0,1]; min={arr.min():.3e}, max={arr.max():.3e}"
        )
    sums = arr.sum(axis=1)
    bad_rows = np.flatnonzero(np.abs(sums - 1.0) > tol)
    if bad_rows.size:
        i = int(bad_rows[0])
        raise ValueError(
            f"{bad_rows.size} fila(s) de p no suman 1±{tol:g}; "
            f"primera fila {i} suma {sums[i]:.9f}"
        )
    return arr.copy() if copy else arr


def one_hot(y: Sequence[Any], n_classes: int = N_CLASSES) -> np.ndarray:
    """Matriz one-hot ``(N, K)`` float64 a partir de etiquetas enteras."""
    y_arr = validate_labels(y)
    out = np.zeros((y_arr.size, n_classes), dtype=np.float64)
    out[np.arange(y_arr.size), y_arr] = 1.0
    return out


def _prepared(y: Sequence[Any], p: Sequence[Sequence[float]]) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Valida y devuelve ``(y, p_normalizada, p_recortada)``.

    ``p_normalizada`` son las filas divididas por su suma (sin suelo). Se usa en
    las métricas acotadas (Brier, RPS, accuracy, calibración), donde el suelo de
    1e-15 no aporta nada y sesgaría el resultado (p. ej. Brier perfecto pasaría
    de 0 a 2e-30). ``p_recortada`` añade el suelo ``1e-15`` y se usa solo en
    log-loss, donde sí es necesario para acotar ``log`` (ver nota del módulo).
    """
    y_arr = validate_labels(y)
    p_arr = validate_probabilities(p)
    if p_arr.shape[0] != y_arr.size:
        raise ValueError(
            f"y tiene {y_arr.size} filas y p {p_arr.shape[0]}; deben coincidir"
        )
    sums = p_arr.sum(axis=1, keepdims=True)
    p_norm = p_arr / sums
    p_clip = np.clip(p_norm, EPS, 1.0)
    return y_arr, p_norm, p_clip


# ---------------------------------------------------------------------------
# Pérdidas
# ---------------------------------------------------------------------------
def per_sample_log_loss(y: Sequence[Any], p: Sequence[Sequence[float]]) -> np.ndarray:
    """Log-loss por partido (vector de longitud N), con ln natural."""
    y_arr, _, p_clip = _prepared(y, p)
    return -np.log(p_clip[np.arange(y_arr.size), y_arr])


def multiclass_log_loss(y: Sequence[Any], p: Sequence[Sequence[float]]) -> float:
    """Log-loss multiclase medio (ln natural, clip 1e-15). Menor es mejor."""
    return float(np.mean(per_sample_log_loss(y, p)))


def per_sample_brier(y: Sequence[Any], p: Sequence[Sequence[float]]) -> np.ndarray:
    """Brier por partido: ``Σ_k (p_ik - o_ik)^2`` (vector de longitud N)."""
    y_arr, p_norm, _ = _prepared(y, p)
    return np.sum((p_norm - one_hot(y_arr)) ** 2, axis=1)


def brier_multiclass(y: Sequence[Any], p: Sequence[Sequence[float]]) -> float:
    """Brier multiclase: media de ``Σ_k (p_ik - o_ik)^2``. Rango [0, 2]."""
    return float(np.mean(per_sample_brier(y, p)))


def brier_per_class(y: Sequence[Any], p: Sequence[Sequence[float]]) -> np.ndarray:
    """Brier por clase: ``(1/N) Σ_i (p_ik - o_ik)^2`` para ``k=H,D,A``.

    La suma de las tres componentes es ``brier_multiclass``.
    """
    y_arr, p_norm, _ = _prepared(y, p)
    err2 = (p_norm - one_hot(y_arr)) ** 2
    return err2.mean(axis=0)


def rps(y: Sequence[Any], p: Sequence[Sequence[float]]) -> float:
    """Ranked Probability Score con orden H < D < A y factor ``1/(K-1)``.

    ``RPS = (1/N) Σ_i (1/(K-1)) Σ_{k=1}^{K-1} (CDF_p(k) - CDF_o(k))^2``
    """
    y_arr, p_norm, _ = _prepared(y, p)
    cdf_p = np.cumsum(p_norm, axis=1)[:, : N_CLASSES - 1]
    cdf_o = np.cumsum(one_hot(y_arr), axis=1)[:, : N_CLASSES - 1]
    per_match = np.sum((cdf_p - cdf_o) ** 2, axis=1) / (N_CLASSES - 1)
    return float(np.mean(per_match))


# ---------------------------------------------------------------------------
# Clasificación
# ---------------------------------------------------------------------------
def _argmax_class(probs: np.ndarray) -> np.ndarray:
    """Clase predicha; en empate exacto gana la primera columna (H)."""
    return np.argmax(probs, axis=1)


def accuracy(y: Sequence[Any], p: Sequence[Sequence[float]]) -> float:
    """Fracción de aciertos de ``argmax_k p_ik`` (empates → H, documentado)."""
    y_arr, p_norm, _ = _prepared(y, p)
    return float(np.mean(_argmax_class(p_norm) == y_arr))


def balanced_accuracy(y: Sequence[Any], p: Sequence[Sequence[float]]) -> float:
    """Media del recall de las clases con soporte > 0 (documentado)."""
    y_arr, p_norm, _ = _prepared(y, p)
    pred = _argmax_class(p_norm)
    recalls: List[float] = []
    for k in range(N_CLASSES):
        support = int(np.sum(y_arr == k))
        if support == 0:
            continue
        recalls.append(float(np.sum((y_arr == k) & (pred == k)) / support))
    return float(np.mean(recalls)) if recalls else float("nan")


def confusion_matrix(
    y: Sequence[Any],
    p: Sequence[Sequence[float]],
    normalize: Optional[str] = None,
) -> np.ndarray:
    """Matriz de confusión 3×3 (filas = verdad, columnas = predicción).

    ``normalize=None`` devuelve conteos enteros; ``"true"`` normaliza por fila
    (recall), ``"pred"`` por columna (precision) y ``"all"`` por el total.
    """
    y_arr, p_norm, _ = _prepared(y, p)
    pred = _argmax_class(p_norm)
    cm = np.zeros((N_CLASSES, N_CLASSES), dtype=np.int64)
    np.add.at(cm, (y_arr, pred), 1)
    if normalize is None:
        return cm
    cmf = cm.astype(np.float64)
    with np.errstate(invalid="ignore", divide="ignore"):
        if normalize == "true":
            denom = cmf.sum(axis=1, keepdims=True)
        elif normalize == "pred":
            denom = cmf.sum(axis=0, keepdims=True)
        elif normalize == "all":
            denom = np.full((1, 1), cmf.sum())
        else:
            raise ValueError("normalize debe ser None, 'true', 'pred' o 'all'")
        out = np.divide(cmf, denom, out=np.zeros_like(cmf), where=denom != 0)
    return out


def per_class_report(
    y: Sequence[Any], p: Sequence[Sequence[float]]
) -> Dict[str, Any]:
    """Precisión, recall, F1 y soporte por clase + medias macro y weighted.

    Las clases sin soporte ni predicciones reportan 0.0 (documentado); no se
    usan ``nan`` para que el JSON sea estricto.
    """
    y_arr, p_norm, _ = _prepared(y, p)
    pred = _argmax_class(p_norm)
    cm = confusion_matrix(y_arr, p_norm)
    total = int(cm.sum())
    per_class: Dict[str, Any] = {}
    precisions: List[float] = []
    recalls: List[float] = []
    f1s: List[float] = []
    supports: List[int] = []
    for k, name in enumerate(CLASS_NAMES):
        tp = float(cm[k, k])
        support = int(cm[k, :].sum())
        predicted = int(cm[:, k].sum())
        precision = tp / predicted if predicted else 0.0
        recall = tp / support if support else 0.0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
        per_class[name] = {
            "precision": float(precision),
            "recall": float(recall),
            "f1": float(f1),
            "support": support,
            "predicted": predicted,
        }
        precisions.append(precision)
        recalls.append(recall)
        f1s.append(f1)
        supports.append(support)
    weights = np.asarray(supports, dtype=np.float64)
    weight_sum = float(weights.sum())
    weighted = {
        "precision": float(np.dot(precisions, weights) / weight_sum),
        "recall": float(np.dot(recalls, weights) / weight_sum),
        "f1": float(np.dot(f1s, weights) / weight_sum),
    } if weight_sum else {"precision": 0.0, "recall": 0.0, "f1": 0.0}
    return {
        "classes": per_class,
        "macro": {
            "precision": float(np.mean(precisions)),
            "recall": float(np.mean(recalls)),
            "f1": float(np.mean(f1s)),
        },
        "weighted": weighted,
        "accuracy": float(np.trace(cm) / total) if total else 0.0,
        "n": total,
    }


# ---------------------------------------------------------------------------
# Calibración
# ---------------------------------------------------------------------------
def _bin_index(confidence: np.ndarray, bins: int) -> np.ndarray:
    """Índice de bin de igual anchura en [0,1] (el 1.0 cae en el último bin)."""
    edges = np.linspace(0.0, 1.0, bins + 1)
    idx = np.searchsorted(edges, confidence, side="right") - 1
    return np.clip(idx, 0, bins - 1)


def _reliability_bins(
    confidence: np.ndarray, outcome: np.ndarray, bins: int
) -> Tuple[List[Dict[str, Any]], float]:
    """Tabla de fiabilidad y ECE para un par (confianza, indicador 0/1)."""
    idx = _bin_index(confidence, bins)
    edges = np.linspace(0.0, 1.0, bins + 1)
    n_total = int(confidence.size)
    table: List[Dict[str, Any]] = []
    ece_value = 0.0
    for b in range(bins):
        mask = idx == b
        n_b = int(mask.sum())
        if n_b:
            conf_b = float(confidence[mask].mean())
            acc_b = float(outcome[mask].mean())
            gap = acc_b - conf_b
            ece_value += (n_b / n_total) * abs(gap)
        else:
            conf_b = None
            acc_b = None
            gap = None
        table.append(
            {
                "bin": b,
                "bin_lo": float(edges[b]),
                "bin_hi": float(edges[b + 1]),
                "n": n_b,
                "confidence": conf_b,
                "accuracy": acc_b,
                "gap": gap,
            }
        )
    return table, float(ece_value)


def calibration_table(
    y: Sequence[Any], p: Sequence[Sequence[float]], bins: int = 10
) -> List[Dict[str, Any]]:
    """Curva de fiabilidad sobre la confianza de la clase predicha.

    Bins de igual anchura en ``[0,1]``; cada entrada incluye ``n``,
    ``confidence`` (media de ``max_k p_ik``), ``accuracy`` observada y ``gap``
    (``accuracy - confidence``). Los bins vacíos se incluyen con ``n=0`` y
    valores ``None``.
    """
    if bins < 1:
        raise ValueError("bins debe ser >= 1")
    y_arr, p_norm, _ = _prepared(y, p)
    confidence = p_norm.max(axis=1)
    outcome = (_argmax_class(p_norm) == y_arr).astype(np.float64)
    table, _ = _reliability_bins(confidence, outcome, bins)
    return table


def ece(y: Sequence[Any], p: Sequence[Sequence[float]], bins: int = 10) -> float:
    """Expected Calibration Error de la clase predicha (ponderada por bin).

    ``ECE = Σ_b (n_b/N) |acc_b - conf_b|``. Depende del binning y del tamaño
    muestral; se reporta siempre junto a :func:`calibration_table`.
    """
    if bins < 1:
        raise ValueError("bins debe ser >= 1")
    y_arr, p_norm, _ = _prepared(y, p)
    confidence = p_norm.max(axis=1)
    outcome = (_argmax_class(p_norm) == y_arr).astype(np.float64)
    _, value = _reliability_bins(confidence, outcome, bins)
    return value


def ovr_calibration(
    y: Sequence[Any], p: Sequence[Sequence[float]], bins: int = 10
) -> Dict[str, Any]:
    """Calibración one-vs-rest por clase (fiabilidad de cada ``p_k``).

    Para cada clase ``k`` se binariza el resultado ``{y_i = k}``, se usan bins
    de igual anchura sobre ``p_ik`` y se calcula ECE con pesos ``n_b/N``.
    Devuelve ``{"classes": {H: {...}, D: {...}, A: {...}}, "mean_ece": ...}``.
    """
    if bins < 1:
        raise ValueError("bins debe ser >= 1")
    y_arr, p_norm, _ = _prepared(y, p)
    classes: Dict[str, Any] = {}
    eces: List[float] = []
    for k, name in enumerate(CLASS_NAMES):
        table, value = _reliability_bins(
            p_norm[:, k], (y_arr == k).astype(np.float64), bins
        )
        classes[name] = {"ece": value, "bins": table}
        eces.append(value)
    return {"classes": classes, "mean_ece": float(np.mean(eces))}


# ---------------------------------------------------------------------------
# Agregado
# ---------------------------------------------------------------------------
def summary_metrics(
    y: Sequence[Any],
    p: Sequence[Sequence[float]],
    bins: int = 10,
    include_tables: bool = True,
) -> Dict[str, Any]:
    """Todas las métricas escalares en un dict listo para JSON.

    Con ``include_tables=False`` omite las curvas de calibración (útil para
    desgloses por temporada/división, donde solo interesan los escalares).
    """
    y_arr, p_norm, _ = _prepared(y, p)
    n = int(y_arr.size)
    out: Dict[str, Any] = {
        "n": n,
        "log_loss": multiclass_log_loss(y_arr, p_norm),
        "brier": brier_multiclass(y_arr, p_norm),
        "brier_per_class": {
            name: float(value)
            for name, value in zip(CLASS_NAMES, brier_per_class(y_arr, p_norm))
        },
        "rps": rps(y_arr, p_norm),
        "accuracy": accuracy(y_arr, p_norm),
        "balanced_accuracy": balanced_accuracy(y_arr, p_norm),
        "ece": ece(y_arr, p_norm, bins=bins),
        "confusion_matrix": confusion_matrix(y_arr, p_norm).tolist(),
        "per_class": per_class_report(y_arr, p_norm),
    }
    if include_tables:
        out["calibration"] = calibration_table(y_arr, p_norm, bins=bins)
        out["ovr_calibration"] = ovr_calibration(y_arr, p_norm, bins=bins)
    return out
