#!/usr/bin/env python3
"""Utilidades compartidas del Motor B — inteligencia de mercado (tareas A07).

Este módulo **no entrena** nada del pipeline: solo carga datos ya procesados,
calcula métricas con las definiciones canónicas de `eval.metrics` y ofrece
utilidades de inferencia (bootstrap por bloques, intervalos de Wilson, curvas
de fiabilidad).

Reglas duras que se verifican en tiempo de ejecución
----------------------------------------------------
* Nunca se lee la partición ``test`` (2024/25, 2025/26) ni ``live`` (2026/27):
  :func:`dev_val` lanza ``AssertionError`` si queda alguna fila fuera de
  ``dev``/``val``. `artifacts/EXP01_*/pred_*.csv` contienen folds de test: aquí
  se filtran por temporada **antes** de cualquier uso.
* Todas las métricas usan ``eval.metrics`` (ln natural, RPS con H<D<A y
  factor 1/2). El bootstrap por bloques reproduce exactamente
  `eval.compare.paired_bootstrap_delta` (se comprueba en
  :func:`self_check`).
* Semilla única :data:`SEED` para todo remuestreo.

Convenciones
------------
``y = 0`` (H) · ``1`` (D) · ``2`` (A). Las probabilidades se normalizan por
fila antes de usarse (las del parquet ya suman 1 salvo error de redondeo).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd
from scipy.stats import binomtest

# ---------------------------------------------------------------------------
# Rutas e import del árbitro de métricas
# ---------------------------------------------------------------------------
LAB = Path(__file__).resolve().parents[3]  # research/prediction-lab
if str(LAB) not in sys.path:
    sys.path.insert(0, str(LAB))

from eval import compare as C  # noqa: E402
from eval import metrics as M  # noqa: E402

SEED = 20261109
PROC = LAB / "data" / "processed"
ARTIFACTS_EXP01 = LAB / "artifacts" / "EXP01_baselines_20261109"
ART = Path(__file__).resolve().parent / "artifacts"

DEV_MAX_SEASON = 2022
VAL_SEASON = 2023
TEST_SEASONS = (2024, 2025)
LIVE_SEASONS = (2026,)

PHASES = ("open", "close")
SOURCES = ("b365", "ps", "avg", "max", "bf", "bfe")
METHODS = ("proportional", "power", "shin")
OUTCOMES = ("h", "d", "a")

#: Umbral mínimo de muestra para que una celda entre en las conclusiones.
MIN_CELL_N = 500

#: Bandas por probabilidad implícita de un resultado (curva de calibración y
#: sesgo favorito-longshot). La última tiene borde superior 1.01 por inclusión.
PROB_EDGES = (0.00, 0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 1.01)
PROB_LABELS = ("<0.10", "0.10-0.20", "0.20-0.30", "0.30-0.40",
               "0.40-0.50", "0.50-0.60", ">=0.60")

#: Bandas por favorito del partido (p_max del 1X2 sin margen).
#: ``favorito_claro`` = 30.6 % de los partidos, ``igualado`` = 21 %, etc.
FAV_EDGES = (0.0, 0.38, 0.45, 0.55, 1.01)
FAV_LABELS = ("muy_abierto", "igualado", "favorito_moderado", "favorito_claro")
FAV_PRETTY = {
    "muy_abierto": "Muy abierto (p_max < 0.38)",
    "igualado": "Igualado (0.38–0.45)",
    "favorito_moderado": "Favorito moderado (0.45–0.55)",
    "favorito_claro": "Favorito claro (≥ 0.55)",
}


# ---------------------------------------------------------------------------
# Carga y particiones
# ---------------------------------------------------------------------------
def season_year(value: Any) -> int:
    """Año de inicio de temporada (acepta ``"2023/24"`` y ``"2023"``)."""
    text = str(value).strip().replace("-", "/").split("/")[0]
    return int(text)


def partition_for_year(year: int) -> str:
    if year <= DEV_MAX_SEASON:
        return "dev"
    if year == VAL_SEASON:
        return "val"
    if year in TEST_SEASONS:
        return "test"
    if year in LIVE_SEASONS:
        return "live"
    return "unknown"


def load_market(columns: Optional[Sequence[str]] = None) -> pd.DataFrame:
    """Carga `features_market.parquet` y añade ``season_start``/``partition``.

    No filtra: la selección dev/val la hace :func:`dev_val` (a propósito, para
    que quede explícito en cada script qué población se usa).
    """
    df = pd.read_parquet(PROC / "features_market.parquet", columns=list(columns) if columns else None)
    df = df.copy()
    df["season_start"] = df["season"].map(season_year).astype(int)
    df["partition"] = df["season_start"].map(partition_for_year)
    return df


def dev_val(df: pd.DataFrame) -> pd.DataFrame:
    """Devuelve solo ``dev`` + ``val`` y aborta si aparece ``test``/``live``."""
    out = df[df["partition"].isin(("dev", "val"))].copy()
    bad = set(out["partition"].unique()) - {"dev", "val"}
    assert not bad, f"partición prohibida en el análisis: {sorted(bad)}"
    assert (out["season_start"] <= VAL_SEASON).all(), "hay temporadas posteriores a val"
    return out


def subset(df: pd.DataFrame, part: Optional[str] = None, method: Optional[str] = None,
           src: Optional[str] = None, phase: Optional[str] = None) -> pd.DataFrame:
    """Filtro cómodo por partición/fuente/fase (método se aplica a las columnas)."""
    out = df
    if part is not None:
        out = out[out["partition"] == part]
    return out


# ---------------------------------------------------------------------------
# Probabilidades
# ---------------------------------------------------------------------------
def valid_mask(df: pd.DataFrame, phase: str, src: str) -> np.ndarray:
    return df[f"mkt_{phase}_{src}_valid"].to_numpy(dtype=int) == 1


def probs(df: pd.DataFrame, phase: str, src: str, method: str) -> np.ndarray:
    """Matriz ``(N, 3)`` de probabilidades sin margen (sin normalizar aquí)."""
    cols = [f"mkt_{phase}_{src}_{method}_{k}" for k in OUTCOMES]
    return df[cols].to_numpy(dtype=float)


def available(df: pd.DataFrame, phase: str, src: str, method: str = "power") -> np.ndarray:
    """Máscara de filas con cuotas válidas y probabilidad finita para el método."""
    p = probs(df, phase, src, method)
    return valid_mask(df, phase, src) & np.all(np.isfinite(p), axis=1)


def rows(y: Sequence[Any], p: Sequence[Sequence[float]]) -> Tuple[np.ndarray, np.ndarray]:
    """Valida y normaliza ``(y, p)``; ``p`` renormalizada por fila."""
    y_arr = np.asarray(y).astype(np.int64)
    p_arr = np.asarray(p, dtype=float)
    if p_arr.ndim != 2 or p_arr.shape[1] != 3:
        raise ValueError(f"p debe ser (N,3), recibido {p_arr.shape}")
    if y_arr.size != p_arr.shape[0]:
        raise ValueError("y y p tienen longitudes distintas")
    if np.any(y_arr < 0) or np.any(y_arr > 2):
        raise ValueError("y fuera de {0,1,2}")
    if not np.all(np.isfinite(p_arr)):
        raise ValueError("p contiene NaN/inf")
    total = p_arr.sum(axis=1, keepdims=True)
    if np.any(total <= 0):
        raise ValueError("fila de p con suma <= 0")
    return y_arr, p_arr / total


def per_sample_log_loss(y, p) -> np.ndarray:
    y_arr, p_norm = rows(y, p)
    picked = np.clip(p_norm[np.arange(y_arr.size), y_arr], 1e-15, 1.0)
    return -np.log(picked)


def per_sample_brier(y, p) -> np.ndarray:
    y_arr, p_norm = rows(y, p)
    onehot = np.zeros_like(p_norm)
    onehot[np.arange(y_arr.size), y_arr] = 1.0
    return np.sum((p_norm - onehot) ** 2, axis=1)


def per_sample_rps(y, p) -> np.ndarray:
    """RPS por partido con orden H < D < A y factor ``1/(K-1)``."""
    y_arr, p_norm = rows(y, p)
    onehot = np.zeros_like(p_norm)
    onehot[np.arange(y_arr.size), y_arr] = 1.0
    cdf_p = np.cumsum(p_norm, axis=1)[:, :2]
    cdf_o = np.cumsum(onehot, axis=1)[:, :2]
    return np.sum((cdf_p - cdf_o) ** 2, axis=1) / 2.0


PER_SAMPLE = {
    "logloss": per_sample_log_loss,
    "brier": per_sample_brier,
    "rps": per_sample_rps,
}


def metrics_bundle(y, p, bins: int = 10) -> Dict[str, Any]:
    """Escalares listos para JSON (sin tablas)."""
    y_arr, p_norm = rows(y, p)
    return {
        "n": int(y_arr.size),
        "log_loss": float(M.multiclass_log_loss(y_arr, p_norm)),
        "brier": float(M.brier_multiclass(y_arr, p_norm)),
        "rps": float(M.rps(y_arr, p_norm)),
        "accuracy": float(M.accuracy(y_arr, p_norm)),
        "ece10": float(M.ece(y_arr, p_norm, bins)),
        "mean_pmax": float(p_norm.max(axis=1).mean()),
    }


def brier_components(y, p) -> Dict[str, float]:
    comp = M.brier_per_class(y, p)
    return {f"brier_{k}": float(v) for k, v in zip(OUTCOMES, comp)}


# ---------------------------------------------------------------------------
# Bandas y curvas de fiabilidad
# ---------------------------------------------------------------------------
def fav_band(p: np.ndarray) -> np.ndarray:
    """Etiqueta de banda de favoritismo por partido, a partir de ``p_max``."""
    pmax = np.max(p, axis=1)
    idx = np.clip(np.searchsorted(FAV_EDGES[1:], pmax, side="right"), 0, len(FAV_LABELS) - 1)
    return np.asarray([FAV_LABELS[i] for i in idx], dtype=object)


def prob_band(values: np.ndarray) -> np.ndarray:
    """Etiqueta de banda de probabilidad implícita (a nivel de resultado)."""
    idx = np.clip(np.searchsorted(PROB_EDGES[1:], values, side="right"), 0, len(PROB_LABELS) - 1)
    return np.asarray([PROB_LABELS[i] for i in idx], dtype=object)


def wilson_ci(k: int, n: int, z: float = 1.96) -> Tuple[float, float]:
    """Intervalo de Wilson (95 %) para una proporción."""
    if n <= 0:
        return (float("nan"), float("nan"))
    ph = k / n
    denom = 1.0 + z * z / n
    centre = (ph + z * z / (2 * n)) / denom
    half = z * np.sqrt(ph * (1 - ph) / n + z * z / (4.0 * n * n)) / denom
    return (float(max(0.0, centre - half)), float(min(1.0, centre + half)))


def reliability_table(y, p, edges: Sequence[float] = PROB_EDGES,
                      labels: Sequence[str] = PROB_LABELS) -> List[Dict[str, Any]]:
    """Fiabilidad **agrupando los tres resultados**: (p_ik, 1{y_i=k}).

    Cada partido aporta 3 observaciones (una por resultado), que es la forma
    estándar de dibujar la curva de calibración de un mercado 1X2. El
    ``gap`` es ``observado - implícito`` (>0 ⇒ el mercado infravalora esa
    banda, típico de los favoritos) y lleva IC de Wilson al 95 %.
    """
    y_arr, p_norm = rows(y, p)
    implied = p_norm.ravel()
    observed = np.zeros_like(p_norm)
    observed[np.arange(y_arr.size), y_arr] = 1.0
    observed = observed.ravel()
    bands = prob_band(implied)
    out: List[Dict[str, Any]] = []
    for label in labels:
        mask = bands == label
        n = int(mask.sum())
        if n == 0:
            out.append({"band": label, "n": 0})
            continue
        hit = int(observed[mask].sum())
        imp = float(implied[mask].mean())
        obs = hit / n
        lo, hi = wilson_ci(hit, n)
        out.append({
            "band": label,
            "n": n,
            "implied": imp,
            "observed": float(obs),
            "gap": float(obs - imp),
            "ci95_obs": [lo, hi],
        })
    return out


def calibration_slope(y, p) -> Dict[str, float]:
    """Pendiente de calibración: logit(observado) ~ a + b·logit(implícito).

    Agrupa los tres resultados (como :func:`reliability_table`). ``b < 1``
    indica el sesgo favorito-longshot clásico: las probabilidades extremas
    observadas son menos extremas que las implícitas. Se ajusta por máxima
    verosimilitud (regresión logística de una sola covariable) sin
    regularización, con ``sklearn``.
    """
    from sklearn.linear_model import LogisticRegression

    y_arr, p_norm = rows(y, p)
    implied = np.clip(p_norm.ravel(), 1e-6, 1 - 1e-6)
    observed = np.zeros_like(p_norm)
    observed[np.arange(y_arr.size), y_arr] = 1.0
    observed = observed.ravel()
    x = np.log(implied / (1.0 - implied)).reshape(-1, 1)
    model = LogisticRegression(C=1e6, solver="lbfgs", max_iter=1000, fit_intercept=True)
    model.fit(x, observed)
    return {"intercept": float(model.intercept_[0]), "slope": float(model.coef_[0][0]),
            "n_obs": int(observed.size)}


# ---------------------------------------------------------------------------
# Bootstrap por bloques (temporada × división) — genérico para LL/Brier/RPS
# ---------------------------------------------------------------------------
def blocks_season_div(df: pd.DataFrame) -> np.ndarray:
    """Etiquetas de bloque ``temporada × división`` (objetos comparables)."""
    return np.asarray([f"{s}|{d}" for s, d in zip(df["season"].astype(str), df["div"].astype(str))],
                      dtype=object)


def blocks_season(df: pd.DataFrame) -> np.ndarray:
    return np.asarray(df["season"].astype(str), dtype=object)


def block_bootstrap_delta(y, p_a, p_b, blocks: Sequence[Any],
                          metric: str = "logloss", B: int = 2000,
                          seed: int = SEED) -> Dict[str, Any]:
    """Δ = pérdida(a) − pérdida(b) con bootstrap de bloques.

    Réplica exacta de `eval.compare.paired_bootstrap_delta` (misma construcción
    de multiplicidades multinomiales y mismos percentiles) generalizada a RPS.
    ``Δ > 0`` ⇒ ``a`` es peor. Se reporta ``n_blocks`` porque con pocos bloques
    el IC es poco fiable.
    """
    if metric not in PER_SAMPLE:
        raise ValueError(f"métrica desconocida: {metric}")
    fn = PER_SAMPLE[metric]
    d = fn(y, p_a) - fn(y, p_b)
    labels = np.asarray(blocks, dtype=object)
    if labels.size != d.size:
        raise ValueError("blocks y pérdidas con longitudes distintas")
    codes, uniques = pd.factorize(labels, sort=True)
    n_blocks = int(len(uniques))
    counts = np.bincount(codes, minlength=n_blocks).astype(float)
    sums = np.bincount(codes, weights=d, minlength=n_blocks)
    rng = np.random.default_rng(int(seed))
    mult = rng.multinomial(n_blocks, np.full(n_blocks, 1.0 / n_blocks), size=int(B)).astype(float)
    deltas = (mult @ sums) / (mult @ counts)
    point = float(np.sum(sums) / np.sum(counts))
    lo, hi = np.percentile(deltas, [2.5, 97.5])
    return {
        "metric": metric,
        "n": int(d.size),
        "n_blocks": n_blocks,
        "delta": point,
        "ci95": [float(lo), float(hi)],
        "frac_gt0": float(np.mean(deltas > 0)),
        "B": int(B),
        "seed": int(seed),
    }


def bootstrap_metric_ci(y, p, blocks: Sequence[Any], metric: str = "logloss",
                        B: int = 2000, seed: int = SEED) -> Dict[str, Any]:
    """IC95 % de la pérdida absoluta de un sistema (mismo bootstrap de bloques)."""
    fn = PER_SAMPLE[metric]
    loss = fn(y, p)
    codes, uniques = pd.factorize(np.asarray(blocks, dtype=object), sort=True)
    n_blocks = len(uniques)
    counts = np.bincount(codes, minlength=n_blocks).astype(float)
    sums = np.bincount(codes, weights=loss, minlength=n_blocks)
    rng = np.random.default_rng(int(seed))
    mult = rng.multinomial(n_blocks, np.full(n_blocks, 1.0 / n_blocks), size=int(B)).astype(float)
    draws = (mult @ sums) / (mult @ counts)
    lo, hi = np.percentile(draws, [2.5, 97.5])
    return {"metric": metric, "value": float(loss.mean()), "ci95": [float(lo), float(hi)],
            "n": int(loss.size), "n_blocks": int(n_blocks)}


def sign_test(wins: int, n: int) -> float:
    """p-valor bilateral del test de signos (H0: p = 0.5)."""
    if n <= 0:
        return float("nan")
    return float(binomtest(int(wins), int(n), 0.5).pvalue)


# ---------------------------------------------------------------------------
# Salidas
# ---------------------------------------------------------------------------
def jsonify(obj: Any) -> Any:
    """Convierte tipos numpy a nativos para ``json.dump``."""
    if isinstance(obj, dict):
        return {str(k): jsonify(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [jsonify(v) for v in obj]
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return float(obj)
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    if isinstance(obj, np.ndarray):
        return jsonify(obj.tolist())
    if isinstance(obj, (pd.Timestamp,)):
        return obj.isoformat()
    return obj


def write_json(obj: Any, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(jsonify(obj), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


def write_csv(df: pd.DataFrame, path: Path, digits: int = 6) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    out = df.copy()
    for col in out.columns:
        if out[col].dtype.kind == "f":
            out[col] = out[col].round(digits)
    out.to_csv(path, index=False)
    return path


def md_table(df: pd.DataFrame, headers: Optional[Sequence[str]] = None,
             digits: int = 3, flag_small_n: Optional[str] = "n") -> str:
    """Tabla markdown compacta con alineación a la derecha.

    Si ``flag_small_n`` es una columna, las filas con ``n < MIN_CELL_N`` se
    marcan con ``†`` para que el informe nunca las use como evidencia.
    """
    cols = list(df.columns)
    head = list(headers) if headers else cols
    align = ["---:" if df[c].dtype.kind in "ifu" else ":---" for c in cols]
    lines = ["| " + " | ".join(head) + " |",
             "|" + "|".join(align) + "|"]
    values = df[cols].to_numpy(dtype=object)  # preserva el dtype de cada celda
    for i in range(len(df)):
        cells = []
        for j, col in enumerate(cols):
            val = values[i, j]
            if isinstance(val, (float, np.floating)):
                cells.append(f"{val:.{digits}f}")
            else:
                cells.append(str(val))
        if flag_small_n and flag_small_n in cols:
            n_val = values[i, cols.index(flag_small_n)]
            try:
                if float(n_val) < MIN_CELL_N:
                    cells[-1] = cells[-1] + " †"
            except (TypeError, ValueError):
                pass
        lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines)


def self_check() -> None:
    """Comprueba que el bootstrap y las métricas coinciden con ``eval``."""
    rng = np.random.default_rng(SEED)
    n = 500
    y = rng.integers(0, 3, size=n)
    p_a = rng.dirichlet(np.ones(3), size=n)
    p_b = np.clip(p_a + rng.normal(0, 0.02, size=p_a.shape), 1e-4, None)
    p_b = p_b / p_b.sum(axis=1, keepdims=True)
    blocks = np.asarray([f"{i // 50}|E0" for i in range(n)], dtype=object)

    ref = C.paired_bootstrap_delta(y, p_a, p_b, blocks, B=500, seed=SEED)
    mine = block_bootstrap_delta(y, p_a, p_b, blocks, metric="logloss", B=500)
    assert abs(ref["delta_logloss"] - mine["delta"]) < 1e-12
    assert np.allclose(ref["ci95_logloss"], mine["ci95"], atol=1e-12)
    assert abs(ref["delta_brier"] - block_bootstrap_delta(
        y, p_a, p_b, blocks, metric="brier", B=500)["delta"]) < 1e-12

    # RPS: per-sample medio == métrica agregada canónica
    assert abs(per_sample_rps(y, p_a).mean() - M.rps(y, p_a)) < 1e-12
    assert abs(per_sample_log_loss(y, p_a).mean() - M.multiclass_log_loss(y, p_a)) < 1e-12
    assert abs(per_sample_brier(y, p_a).mean() - M.brier_multiclass(y, p_a)) < 1e-12


if __name__ == "__main__":
    self_check()
    print("market_common: self_check OK")
