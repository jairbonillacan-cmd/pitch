"""Particiones temporales canónicas y walk-forward para PitchLab (A08).

Particiones del contrato (`CONTRACT_PREDICTIONS.md` §4)
-------------------------------------------------------
=========  ==================  ==============================
Partición  Temporadas          Uso
=========  ==================  ==============================
``dev``    ≤ 2022/23           entrenamiento, features,
                               selección interna
``val``    2023/24             elección de candidato
``test``   2024/25 y 2025/26   evaluación final (una sola vez)
``live``   2026/27 (parcial)   monitorización; nunca test
=========  ==================  ==============================

Reglas duras implementadas
--------------------------
* **Nunca split aleatorio**: todos los cortes son por temporada y, además, se
  exige que la fecha del último partido de entrenamiento sea estrictamente
  anterior a la del primero de test (los aplazamientos de una temporada previa
  jugados más tarde se descartan del entrenamiento y se contabilizan en
  ``n_train_dropped_date``).
* Las funciones devuelven **índices posicionales** (``np.int64``) sobre el
  ``DataFrame`` de entrada y fechas; nunca copias de los datos.
* ``test`` no interviene en ninguna decisión: ``walk_forward_splits`` solo
  recorre temporadas de ``dev`` ∪ ``val``.
* ``live`` puede quedarse vacía si la temporada 2026/27 aún no tiene partidos.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

import numpy as np
import pandas as pd

__all__ = [
    "DEV_MAX_SEASON_START",
    "VAL_SEASON_START",
    "TEST_SEASON_STARTS",
    "LIVE_SEASON_STARTS",
    "PARTITIONS",
    "season_start_year",
    "partition_for_year",
    "season_years",
    "canonical_masks",
    "canonical_partition_series",
    "walk_forward_splits",
    "check_no_leakage",
]

DEV_MAX_SEASON_START = 2022
VAL_SEASON_START = 2023
TEST_SEASON_STARTS: Tuple[int, ...] = (2024, 2025)
LIVE_SEASON_STARTS: Tuple[int, ...] = (2026,)
PARTITIONS: Tuple[str, ...] = ("dev", "val", "test", "live")


# ---------------------------------------------------------------------------
# Temporadas
# ---------------------------------------------------------------------------
def season_start_year(season: Any) -> int:
    """Año de inicio de temporada a partir de ``"2024/25"`` (o de un entero).

    Acepta ``"2024/25"``, ``"2024-25"``, ``"2024"`` y ``2024``. Lanza
    ``ValueError`` si el formato no es reconocible o el año es absurdo.
    """
    if isinstance(season, (int, np.integer)):
        year = int(season)
    elif isinstance(season, float):
        if not np.isfinite(season) or season != int(season):
            raise ValueError(f"temporada no válida: {season!r}")
        year = int(season)
    else:
        text = str(season).strip()
        if not text:
            raise ValueError("temporada vacía")
        head = text.replace("-", "/").split("/")[0].strip()
        try:
            year = int(head)
        except ValueError as exc:
            raise ValueError(f"temporada no reconocible: {season!r}") from exc
    if not 1900 <= year <= 2100:
        raise ValueError(f"año de temporada fuera de rango: {year}")
    return year


def partition_for_year(year: int) -> str:
    """Partición canónica para un año de inicio de temporada.

    ``≤2022 → dev``, ``2023 → val``, ``2024–2025 → test``, ``2026 → live``;
    cualquier otro año devuelve ``"unknown"`` y no entra en ninguna partición.
    """
    if year <= DEV_MAX_SEASON_START:
        return "dev"
    if year == VAL_SEASON_START:
        return "val"
    if year in TEST_SEASON_STARTS:
        return "test"
    if year in LIVE_SEASON_STARTS:
        return "live"
    return "unknown"


def season_years(df: pd.DataFrame, season_col: str = "season", start_col: str = "season_start") -> np.ndarray:
    """Vector de años de inicio de temporada alineado con las filas de ``df``.

    Usa ``season_start`` si existe; si no, lo deriva de ``season``.
    """
    if start_col in df.columns:
        values = df[start_col].to_numpy()
        if np.issubdtype(values.dtype, np.number):
            years = values.astype(np.int64)
            if years.size and (years.min() < 1900 or years.max() > 2100):
                raise ValueError("season_start fuera de rango [1900, 2100]")
            return years
        return np.array([season_start_year(v) for v in values], dtype=np.int64)
    if season_col not in df.columns:
        raise ValueError(f"falta la columna {season_col!r} (o {start_col!r})")
    return np.array([season_start_year(v) for v in df[season_col].tolist()], dtype=np.int64)


def canonical_masks(
    df: pd.DataFrame,
    season_col: str = "season",
    start_col: str = "season_start",
) -> Dict[str, np.ndarray]:
    """Máscaras booleanas alineadas con ``df`` para ``dev/val/test/live``.

    Devuelve ``{partición: np.ndarray[bool]}`` del mismo largo que ``df``; las
    filas con temporada no reconocida quedan fuera de las cuatro máscaras (se
    pueden identificar con ``canonical_partition_series``).
    """
    years = season_years(df, season_col=season_col, start_col=start_col)
    masks: Dict[str, np.ndarray] = {}
    for name in PARTITIONS:
        if name == "dev":
            masks[name] = years <= DEV_MAX_SEASON_START
        elif name == "val":
            masks[name] = years == VAL_SEASON_START
        elif name == "test":
            masks[name] = np.isin(years, TEST_SEASON_STARTS)
        else:  # live
            masks[name] = np.isin(years, LIVE_SEASON_STARTS)
    return masks


def canonical_partition_series(
    df: pd.DataFrame,
    season_col: str = "season",
    start_col: str = "season_start",
) -> pd.Series:
    """Serie de particiones (``dev/val/test/live/unknown``) alineada con ``df``."""
    years = season_years(df, season_col=season_col, start_col=start_col)
    labels = [partition_for_year(int(y)) for y in years]
    return pd.Series(labels, index=df.index, name="partition")


# ---------------------------------------------------------------------------
# Walk-forward
# ---------------------------------------------------------------------------
def _dates(df: pd.DataFrame, idx: np.ndarray, date_col: str) -> Tuple[Optional[Any], Optional[Any]]:
    if date_col not in df.columns or idx.size == 0:
        return None, None
    values = pd.to_datetime(df.iloc[idx][date_col], errors="coerce")
    if values.isna().all():
        return None, None
    return values.min().date(), values.max().date()


def walk_forward_splits(
    df: pd.DataFrame,
    mode: str = "expanding",
    rolling_seasons: int = 5,
    season_col: str = "season",
    start_col: str = "season_start",
    date_col: str = "match_date",
    min_train_seasons: int = 1,
    include_partitions: Sequence[str] = ("dev", "val"),
    date_cut: bool = True,
) -> List[Dict[str, Any]]:
    """Folds walk-forward temporales, con índices y fechas (sin copiar datos).

    Para cada temporada ``S`` de ``dev`` ∪ ``val`` con al menos
    ``min_train_seasons`` temporadas anteriores:

    * ``mode="expanding"``: entrena con **todas** las temporadas < ``S``.
    * ``mode="rolling"``: entrena con las últimas ``rolling_seasons``
      temporadas < ``S`` (si hay menos, usa las disponibles; documentado).

    El fold predice las filas de ``S``. Con ``date_cut=True`` (por defecto) se
    eliminan además del entrenamiento las filas cuya ``match_date`` sea
    posterior o igual a la fecha del primer partido de ``S`` (protección frente
    a aplazamientos); el número descartado se guarda en
    ``n_train_dropped_date``.

    Devuelve una lista de dicts::

        {"fold_id": "wf_2023", "mode": "expanding", "test_season": "2023/24",
         "season_start": 2023, "train_idx": array, "test_idx": array,
         "n_train": int, "n_test": int, "train_seasons": [...],
         "train_start": date|None, "train_end": date|None,
         "test_start": date|None, "test_end": date|None,
         "n_train_dropped_date": int}

    No se generan folds para temporadas sin datos previos suficientes; el
    primer fold posible de ``dev`` suele ser la segunda temporada disponible.
    ``include_partitions`` solo admite subconjuntos de ``dev``/``val``: ``test``
    se evalúa una única vez con artefactos congelados y ``live`` solo se
    monitoriza, así que pedirlos lanza ``ValueError``.
    """
    if mode not in ("expanding", "rolling"):
        raise ValueError("mode debe ser 'expanding' o 'rolling'")
    if mode == "rolling" and int(rolling_seasons) < 1:
        raise ValueError("rolling_seasons debe ser >= 1")
    if int(min_train_seasons) < 1:
        raise ValueError("min_train_seasons debe ser >= 1")
    allowed = set(include_partitions)
    unknown = allowed - set(PARTITIONS)
    if unknown:
        raise ValueError(f"particiones desconocidas en include_partitions: {sorted(unknown)}")
    forbidden = allowed & {"test", "live"}
    if forbidden:
        raise ValueError(
            "walk_forward_splits no genera folds para test/live "
            f"({sorted(forbidden)}): test se evalúa una sola vez con artefactos "
            "congelados y live solo se monitoriza"
        )

    years = season_years(df, season_col=season_col, start_col=start_col)
    if years.size == 0:
        return []
    if date_col in df.columns:
        dates = pd.to_datetime(df[date_col], errors="coerce")
    else:
        dates = None

    season_label: Dict[int, str] = {}
    if season_col in df.columns:
        for year, label in zip(years, df[season_col].astype(str).tolist()):
            season_label.setdefault(int(year), label)
    else:
        for year in np.unique(years):
            season_label[int(year)] = f"{int(year)}/{str(int(year) + 1)[-2:]}"

    unique_years = sorted({int(y) for y in np.unique(years)})
    folds: List[Dict[str, Any]] = []
    for target in unique_years:
        if partition_for_year(target) not in allowed:
            continue
        prior = [y for y in unique_years if y < target]
        if len(prior) < int(min_train_seasons):
            continue
        if mode == "rolling":
            train_years = prior[-int(rolling_seasons):]
        else:
            train_years = prior

        train_mask = np.isin(years, train_years)
        test_mask = years == target
        test_idx = np.flatnonzero(test_mask).astype(np.int64)
        if test_idx.size == 0:
            continue

        # Corte temporal estricto: nada jugado en/después del primer partido de S.
        dropped_date = 0
        if date_cut and dates is not None:
            test_dates = dates.iloc[test_idx]
            if test_dates.notna().any():
                first_test = test_dates.min()
                before = (dates < first_test).to_numpy()
                keep = train_mask & before
                dropped_date = int((train_mask & ~before).sum())
                train_mask = keep

        train_idx = np.flatnonzero(train_mask).astype(np.int64)
        if train_idx.size == 0:
            continue

        train_start, train_end = _dates(df, train_idx, date_col)
        test_start, test_end = _dates(df, test_idx, date_col)
        folds.append(
            {
                "fold_id": f"wf_{target}",
                "mode": mode,
                "test_season": season_label.get(target, f"{target}"),
                "season_start": target,
                "train_idx": train_idx,
                "test_idx": test_idx,
                "n_train": int(train_idx.size),
                "n_test": int(test_idx.size),
                "train_seasons": [season_label.get(y, f"{y}") for y in train_years],
                "train_start": train_start,
                "train_end": train_end,
                "test_start": test_start,
                "test_end": test_end,
                "n_train_dropped_date": dropped_date,
            }
        )
    return folds


def check_no_leakage(df: pd.DataFrame, folds: Sequence[Mapping[str, Any]], date_col: str = "match_date") -> List[str]:
    """Verifica que ningún fold solape entrenamiento y test en el tiempo.

    Devuelve una lista de violaciones legibles (vacía si todo está bien). Se
    comprueba (a) intersección de índices y (b) ``max(train_date) <
    min(test_date)``. No lanza por sí sola: el llamador decide.
    """
    problems: List[str] = []
    dates = pd.to_datetime(df[date_col], errors="coerce") if date_col in df.columns else None
    for fold in folds:
        train_idx = np.asarray(fold["train_idx"], dtype=np.int64)
        test_idx = np.asarray(fold["test_idx"], dtype=np.int64)
        if np.intersect1d(train_idx, test_idx).size:
            problems.append(f"{fold.get('fold_id')}: índices de train y test se solapan")
        if dates is not None and train_idx.size and test_idx.size:
            train_dates = dates.iloc[train_idx]
            test_dates = dates.iloc[test_idx]
            if train_dates.notna().any() and test_dates.notna().any():
                if train_dates.max() >= test_dates.min():
                    problems.append(
                        f"{fold.get('fold_id')}: train max {train_dates.max().date()} >= "
                        f"test min {test_dates.min().date()}"
                    )
    return problems
