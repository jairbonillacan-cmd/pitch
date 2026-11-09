"""Comparaciones pareadas entre sistemas de predicción (A08).

Todas las comparaciones del laboratorio se hacen **sobre exactamente los mismos
partidos** (intersección de ``match_id``) y **pareadas por partido**: nunca se
comparan intervalos de confianza de dos sistemas calculados por separado, porque
ignorarían la correlación entre predicciones.

Definiciones
------------
Para dos sistemas ``a`` y ``b`` y una pérdida por partido ``L`` (log-loss o
Brier), sea ``d_i = L_a,i - L_b,i`` y ``Δ = mean_i d_i`` (positivo ⇒ ``a`` es
peor). El bloque de remuestreo es ``temporada × división``: dentro de un bloque
los partidos comparten calendario y nivel competitivo, así que remuestrear
bloques preserva la estructura de dependencia temporal/entre ligas que un
bootstrap i.i.d. por partido destruiría.

* **Bootstrap por bloques** (``B=2000``, semilla fija): se remuestrean ``B``
  veces los ``G`` bloques con reemplazo (multiplicidades multinomiales) y se
  recalcula ``Δ*`` como media ponderada de las diferencias por partido. El
  IC95 % es el intervalo percentil 2.5–97.5 de ``Δ*``. ``frac_gt0`` es la
  fracción de remuestras con ``Δ* > 0`` (no es un p-valor; se reporta junto al
  test de permutación).
* **Test de permutación pareado**: bajo ``H0`` de intercambiabilidad, el signo
  de cada ``d_i`` es simétrico; se permutan los signos ``n`` veces y se compara
  ``|Δ*|`` con ``|Δ|``. p-valor bilateral ``(1 + #{|Δ*| ≥ |Δ|}) / (n + 1)``
  (convención conservadora que evita ``p = 0``). Con sistemas idénticos
  ``d_i = 0`` y ``p = 1`` exacto.

Nota metodológica: el bootstrap por bloques con pocos bloques (p. ej. 2
temporadas × 1 división) produce intervalos poco fiables; el informe debe
mostrar el número de bloques junto al IC.
"""

from __future__ import annotations

from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

import numpy as np
import pandas as pd

try:  # importable como paquete `eval.*` o como script dentro de eval/
    from eval import metrics as M
except ImportError:  # pragma: no cover - fallback para ejecución directa
    import metrics as M  # type: ignore

__all__ = [
    "make_blocks",
    "paired_bootstrap_delta",
    "permutation_test_delta",
    "compare_systems",
    "same_matches",
]

_DEFAULT_SEED = 20261109


def make_blocks(season: Sequence[Any], division: Sequence[Any]) -> np.ndarray:
    """Etiquetas de bloque ``temporada × división`` (una por partido)."""
    season_arr = np.asarray(season, dtype=object)
    div_arr = np.asarray(division, dtype=object)
    if season_arr.shape != div_arr.shape:
        raise ValueError("season y division deben tener la misma longitud")
    if season_arr.size == 0:
        raise ValueError("no se pueden construir bloques vacíos")
    labels = [
        f"{str(s).strip()}|{str(d).strip()}" for s, d in zip(season_arr.tolist(), div_arr.tolist())
    ]
    return np.asarray(labels, dtype=object)


def _block_codes(blocks: Sequence[Any]) -> Tuple[np.ndarray, np.ndarray]:
    """Convierte bloques (etiquetas, tuplas o Series) en códigos + etiquetas."""
    if isinstance(blocks, pd.Series):
        values = blocks.astype(str).tolist()
    elif isinstance(blocks, np.ndarray) and blocks.ndim == 1:
        values = [str(b) for b in blocks.tolist()]
    else:
        values = [str(b) for b in list(blocks)]
    if len(values) == 0:
        raise ValueError("blocks está vacío")
    labels, codes = np.unique(np.asarray(values, dtype=object), return_inverse=True)
    return codes.astype(np.int64), labels


def _validate_inputs(
    y: Sequence[Any],
    p_a: Sequence[Sequence[float]],
    p_b: Sequence[Sequence[float]],
    blocks: Optional[Sequence[Any]],
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, Optional[np.ndarray]]:
    y_arr = M.validate_labels(y)
    p_a_arr = M.validate_probabilities(p_a)
    p_b_arr = M.validate_probabilities(p_b)
    n = y_arr.size
    if p_a_arr.shape[0] != n or p_b_arr.shape[0] != n:
        raise ValueError(
            f"y, p_a y p_b deben tener el mismo número de filas: "
            f"{n}, {p_a_arr.shape[0]}, {p_b_arr.shape[0]}"
        )
    codes = None
    if blocks is not None:
        codes, _ = _block_codes(blocks)
        if codes.size != n:
            raise ValueError(f"blocks tiene {codes.size} filas y se esperaban {n}")
    return y_arr, p_a_arr, p_b_arr, codes


def paired_bootstrap_delta(
    y: Sequence[Any],
    p_a: Sequence[Sequence[float]],
    p_b: Sequence[Sequence[float]],
    blocks: Sequence[Any],
    B: int = 2000,
    seed: int = _DEFAULT_SEED,
) -> Dict[str, Any]:
    """Bootstrap pareado por bloques de ``Δlog-loss`` y ``ΔBrier`` (``a - b``).

    Parámetros
    ----------
    y : etiquetas ``0/1/2`` (o ``H/D/A`` vía :func:`eval.metrics.encode_result`).
    p_a, p_b : matrices ``(N, 3)`` de los dos sistemas, mismo orden de partidos.
    blocks : etiqueta de bloque por partido (``temporada × división``); admite
        ``np.ndarray``, ``pd.Series`` o lista de tuplas/etiquetas.
    B : número de remuestras (por defecto 2000).
    seed : semilla del generador (por defecto 20261109, fija y documentada).

    Devuelve un dict con ``delta_logloss``, ``ci95_logloss``, ``frac_gt0_logloss``,
    ``delta_brier``, ``ci95_brier``, ``frac_gt0_brier``, ``B``, ``seed``,
    ``n_matches`` y ``n_blocks``. ``Δ > 0`` significa que ``a`` tiene mayor
    pérdida (peor) que ``b``.
    """
    if int(B) < 1:
        raise ValueError("B debe ser >= 1")
    y_arr, p_a_arr, p_b_arr, codes = _validate_inputs(y, p_a, p_b, blocks)
    assert codes is not None  # garantizado por _validate_inputs

    d_ll = M.per_sample_log_loss(y_arr, p_a_arr) - M.per_sample_log_loss(y_arr, p_b_arr)
    d_br = M.per_sample_brier(y_arr, p_a_arr) - M.per_sample_brier(y_arr, p_b_arr)

    n_blocks = int(codes.max()) + 1
    counts = np.bincount(codes, minlength=n_blocks).astype(np.float64)
    sum_ll = np.bincount(codes, weights=d_ll, minlength=n_blocks)
    sum_br = np.bincount(codes, weights=d_br, minlength=n_blocks)

    rng = np.random.default_rng(int(seed))
    multiplicities = rng.multinomial(
        n_blocks, np.full(n_blocks, 1.0 / n_blocks), size=int(B)
    ).astype(np.float64)  # (B, n_blocks)

    denom = multiplicities @ counts
    delta_ll = (multiplicities @ sum_ll) / denom
    delta_br = (multiplicities @ sum_br) / denom

    point_ll = float(np.sum(sum_ll) / np.sum(counts))
    point_br = float(np.sum(sum_br) / np.sum(counts))
    ci_ll = np.percentile(delta_ll, [2.5, 97.5])
    ci_br = np.percentile(delta_br, [2.5, 97.5])

    return {
        "n_matches": int(y_arr.size),
        "n_blocks": n_blocks,
        "B": int(B),
        "seed": int(seed),
        "delta_logloss": point_ll,
        "ci95_logloss": [float(ci_ll[0]), float(ci_ll[1])],
        "frac_gt0_logloss": float(np.mean(delta_ll > 0.0)),
        "delta_brier": point_br,
        "ci95_brier": [float(ci_br[0]), float(ci_br[1])],
        "frac_gt0_brier": float(np.mean(delta_br > 0.0)),
        "definition": "delta = loss(a) - loss(b) por partido; >0 => a peor",
    }


def permutation_test_delta(
    y: Sequence[Any],
    p_a: Sequence[Sequence[float]],
    p_b: Sequence[Sequence[float]],
    n: int = 10000,
    seed: int = _DEFAULT_SEED,
    metric: str = "logloss",
) -> Dict[str, Any]:
    """Test de permutación pareado (signos) sobre ``Δ`` de log-loss o Brier.

    ``H0``: los dos sistemas son intercambiables partido a partido. Se permutan
    los signos de ``d_i = L_a,i - L_b,i`` y se compara la media permutada con la
    observada. p-valor bilateral ``(1 + #{|Δ*| ≥ |Δ|}) / (n + 1)``.

    Con ``p_a == p_b`` devuelve ``p = 1.0`` exacto (todos los ``d_i`` son 0).
    """
    if int(n) < 1:
        raise ValueError("n debe ser >= 1")
    if metric not in ("logloss", "brier"):
        raise ValueError("metric debe ser 'logloss' o 'brier'")
    y_arr, p_a_arr, p_b_arr, _ = _validate_inputs(y, p_a, p_b, None)

    if metric == "logloss":
        d = M.per_sample_log_loss(y_arr, p_a_arr) - M.per_sample_log_loss(y_arr, p_b_arr)
    else:
        d = M.per_sample_brier(y_arr, p_a_arr) - M.per_sample_brier(y_arr, p_b_arr)

    observed = float(d.mean())
    n_total = int(d.size)
    rng = np.random.default_rng(int(seed))
    threshold = abs(observed)
    extreme = 0

    # Chunking para no materializar n × N signos (N puede ser 50k+).
    chunk = max(1, min(int(n), int(5_000_000 // max(n_total, 1))))
    remaining = int(n)
    while remaining > 0:
        size = min(chunk, remaining)
        signs = rng.integers(0, 2, size=(size, n_total), dtype=np.int8)
        signs = signs.astype(np.float64) * 2.0 - 1.0
        permuted = (signs @ d) / n_total
        extreme += int(np.sum(np.abs(permuted) >= threshold - 1e-18))
        remaining -= size

    p_value = (1.0 + extreme) / (float(n) + 1.0)
    return {
        "metric": metric,
        "observed_delta": observed,
        "p_value": float(min(1.0, p_value)),
        "n_permutations": int(n),
        "n_matches": n_total,
        "seed": int(seed),
        "alternative": "two-sided",
        "definition": "delta = loss(a) - loss(b); >0 => a peor",
    }


def compare_systems(
    y: Sequence[Any],
    p_a: Sequence[Sequence[float]],
    p_b: Sequence[Sequence[float]],
    blocks: Sequence[Any],
    B: int = 2000,
    n_permutations: int = 10000,
    seed: int = _DEFAULT_SEED,
) -> Dict[str, Any]:
    """Bootstrap por bloques + permutación en una sola llamada (mismo seed)."""
    boot = paired_bootstrap_delta(y, p_a, p_b, blocks, B=B, seed=seed)
    perm = permutation_test_delta(y, p_a, p_b, n=n_permutations, seed=seed)
    return {"bootstrap": boot, "permutation": perm}


def same_matches(
    pred_a: pd.DataFrame,
    pred_b: pd.DataFrame,
    id_col: str = "match_id",
    strict: bool = True,
) -> Dict[str, Any]:
    """Alinea dos tablas de predicciones por ``match_id`` exacto.

    Exige ``match_id`` presente, único y no nulo en ambas tablas. Con
    ``strict=True`` (por defecto) exige además que **los conjuntos de
    ``match_id`` sean idénticos**; si difieren lanza ``ValueError`` indicando
    cuántos y cuáles sobran. Con ``strict=False`` usa la intersección y reporta
    los descartes (``n_only_a``/``n_only_b``) para que el informe los muestre.

    Devuelve ``{"match_ids", "idx_a", "idx_b", "n", "n_only_a", "n_only_b"}``
    con índices **posicionales** (0..N-1) listos para ``.iloc``.
    """
    if not isinstance(pred_a, pd.DataFrame) or not isinstance(pred_b, pd.DataFrame):
        raise TypeError("same_matches espera dos pandas.DataFrame")
    pos: List[Dict[str, int]] = []
    ids_list: List[np.ndarray] = []
    for name, frame in (("pred_a", pred_a), ("pred_b", pred_b)):
        if id_col not in frame.columns:
            raise ValueError(f"{name} no tiene la columna {id_col!r}")
        ids = frame[id_col]
        if ids.isna().any():
            raise ValueError(f"{name}: {int(ids.isna().sum())} match_id nulos")
        values = ids.astype(str).to_numpy()
        if len(set(values)) != len(values):
            duplicated = int(len(values) - len(set(values)))
            raise ValueError(f"{name}: {duplicated} match_id duplicados; el contrato lo prohíbe")
        pos.append({mid: i for i, mid in enumerate(values.tolist())})
        ids_list.append(values)

    set_a = set(pos[0])
    set_b = set(pos[1])
    only_a = set_a - set_b
    only_b = set_b - set_a
    if strict and (only_a or only_b):
        sample_a = sorted(only_a)[:3]
        sample_b = sorted(only_b)[:3]
        raise ValueError(
            "same_matches: los conjuntos de match_id no son idénticos "
            f"(solo en a: {len(only_a)}, solo en b: {len(only_b)}; "
            f"ejemplos a={sample_a}, b={sample_b}). Use strict=False para "
            "comparar sobre la intersección."
        )

    common = sorted(set_a & set_b)
    idx_a = np.asarray([pos[0][m] for m in common], dtype=np.int64)
    idx_b = np.asarray([pos[1][m] for m in common], dtype=np.int64)
    return {
        "match_ids": np.asarray(common, dtype=object),
        "idx_a": idx_a,
        "idx_b": idx_b,
        "n": int(len(common)),
        "n_only_a": int(len(only_a)),
        "n_only_b": int(len(only_b)),
    }
