"""Informe reproducible de evaluación: ``metrics.json`` + ``metrics.md`` (A08).

Entrada
-------
* ``predictions.csv`` con el formato de ``CONTRACT_PREDICTIONS.md`` §1
  (una fila por partido y modelo, probabilidades ``p_home/p_draw/p_away``).
* ``matches.parquet`` con el esquema de ``CONTRACT_DATASET.md`` (se usan
  ``match_id``, ``div``, ``season``, ``match_date`` y ``result``).

Salida
------
En ``--out-dir``:

* ``metrics.json`` — todas las métricas por modelo y por partición canónica
  (``dev/val/test/live``), temporada, división, temporada×división y fold;
  cobertura; comparaciones pareadas con bootstrap por bloques y test de
  permutación; parámetros y hashes de las entradas (reproducibilidad).
* ``metrics.md`` — el mismo contenido en tablas legibles + metodología y
  limitaciones.

Reglas
------
* Solo se evalúan partidos con ``result`` en ``{H, D, A}``; las predicciones
  cuyo ``match_id`` no existe en el parquet se contabilizan y se excluyen.
* Se exige que ``(match_id, model_id)`` sea único y que ``div``/``season``/
  ``match_date`` de la predicción coincidan con el parquet (si no, error, salvo
  ``--allow-metadata-mismatch``; en ese caso manda el parquet).
* Las comparaciones usan la intersección exacta de ``match_id`` entre los dos
  modelos y bloques ``temporada × división``.

Uso::

    ./.venv/bin/python research/prediction-lab/eval/report.py \\
        --predictions artifacts/exp/predictions.csv \\
        --matches research/prediction-lab/data/processed/matches.parquet \\
        --out-dir artifacts/exp
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import subprocess
import sys
from datetime import datetime, timezone
from itertools import combinations
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd

_LAB_ROOT = Path(__file__).resolve().parents[1]
if str(_LAB_ROOT) not in sys.path:
    sys.path.insert(0, str(_LAB_ROOT))

from eval import compare as C  # noqa: E402
from eval import metrics as M  # noqa: E402
from eval import splits as S  # noqa: E402

__all__ = [
    "SCHEMA_VERSION",
    "REQUIRED_PREDICTION_COLUMNS",
    "load_predictions",
    "load_matches",
    "prepare_frame",
    "build_report",
    "write_report",
    "render_markdown",
    "main",
]

SCHEMA_VERSION = "a08-metrics/1.0"

REQUIRED_PREDICTION_COLUMNS: Tuple[str, ...] = (
    "match_id",
    "div",
    "season",
    "match_date",
    "model_id",
    "model_version",
    "p_home",
    "p_draw",
    "p_away",
    "fold_id",
    "generated_at",
    "data_quality_flag",
)
REQUIRED_MATCH_COLUMNS: Tuple[str, ...] = ("match_id", "div", "season", "match_date", "result")

_PARTITION_ORDER = list(S.PARTITIONS)


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------
def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _git_info() -> Dict[str, Any]:
    info: Dict[str, Any] = {"commit": None, "dirty": None}
    try:
        commit = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=str(_LAB_ROOT), stderr=subprocess.DEVNULL, text=True
        ).strip()
        status = subprocess.check_output(
            ["git", "status", "--porcelain"], cwd=str(_LAB_ROOT), stderr=subprocess.DEVNULL, text=True
        )
        info["commit"] = commit or None
        info["dirty"] = bool(status.strip())
    except Exception:  # git no disponible: no es bloqueante
        pass
    return info


def _json_safe(value: Any) -> Any:
    """Convierte tipos numpy/fechas y NaN a algo serializable estricto."""
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        out = float(value)
        return out if np.isfinite(out) else None
    if isinstance(value, (np.bool_,)):
        return bool(value)
    if isinstance(value, (pd.Timestamp, datetime)):
        return value.isoformat()
    if value is None or isinstance(value, (str, int, bool)):
        return value
    return str(value)


def _fmt(value: Any, digits: int = 4) -> str:
    if value is None:
        return "—"
    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value)
    if not np.isfinite(number):
        return "—"
    if abs(number) >= 1000:
        return f"{number:,.0f}"
    return f"{number:.{digits}f}"


# ---------------------------------------------------------------------------
# Carga y validación
# ---------------------------------------------------------------------------
def _read_table(path: Path) -> pd.DataFrame:
    suffix = path.suffix.lower()
    if suffix == ".csv":
        return pd.read_csv(path, dtype={"match_id": str})
    if suffix in (".parquet", ".pq"):
        return pd.read_parquet(path)
    raise ValueError(f"formato no soportado: {path} (use .csv o .parquet)")


def load_predictions(path: Path, only_ok: bool = False) -> pd.DataFrame:
    """Lee y valida ``predictions.csv`` según el contrato.

    Comprueba columnas obligatorias, NaN, probabilidades ``(N,3)``, fechas y
    unicidad de ``(match_id, model_id)``. Con ``only_ok=True`` descarta filas
    cuyo ``data_quality_flag`` no sea ``ok``.
    """
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"no existe predictions: {path}")
    df = _read_table(path)
    missing = [c for c in REQUIRED_PREDICTION_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"predictions.csv sin columnas obligatorias: {missing}")
    if df.empty:
        raise ValueError("predictions.csv está vacío")

    for col in ("match_id", "div", "season", "model_id", "model_version", "fold_id", "data_quality_flag"):
        df[col] = df[col].astype(str).str.strip()
    if (df["match_id"] == "").any() or (df["model_id"] == "").any():
        raise ValueError("predictions.csv: match_id/model_id vacíos")

    for col in M.PROB_COLUMNS:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    if df[list(M.PROB_COLUMNS)].isna().any().any():
        raise ValueError("predictions.csv: NaN en probabilidades")
    M.validate_probabilities(df[list(M.PROB_COLUMNS)].to_numpy())  # valida y lanza

    df["match_date"] = pd.to_datetime(df["match_date"], errors="coerce")
    if df["match_date"].isna().any():
        raise ValueError(
            f"predictions.csv: {int(df['match_date'].isna().sum())} match_date no parseables"
        )

    duplicates = df.duplicated(subset=["match_id", "model_id"], keep=False)
    if duplicates.any():
        example = df.loc[duplicates, ["match_id", "model_id"]].head(3).to_dict("records")
        raise ValueError(
            f"predictions.csv: {int(duplicates.sum())} filas duplicadas (match_id, model_id); "
            f"el contrato exige una por par. Ejemplos: {example}"
        )

    if only_ok:
        flag = df["data_quality_flag"].str.lower()
        df = df[flag == "ok"].copy()
        if df.empty:
            raise ValueError("predictions.csv: no quedan filas con data_quality_flag='ok'")
        df = df.reset_index(drop=True)
    return df


def load_matches(path: Path) -> pd.DataFrame:
    """Lee ``matches.parquet`` y devuelve el universo evaluable.

    Filtra filas sin resultado, valida ``result ∈ {H,D,A}``, deriva ``y`` y
    ``season_start`` y exige ``match_id`` único.
    """
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"no existe matches: {path}")
    raw = pd.read_parquet(path)
    missing = [c for c in REQUIRED_MATCH_COLUMNS if c not in raw.columns]
    if missing:
        raise ValueError(f"matches.parquet sin columnas obligatorias: {missing}")

    total = len(raw)
    df = raw.copy()
    df["match_id"] = df["match_id"].astype(str).str.strip()
    if df["match_id"].duplicated().any():
        dup = int(df["match_id"].duplicated().sum())
        raise ValueError(f"matches.parquet: {dup} match_id duplicados")

    result = df["result"].astype("string").str.strip().str.upper()
    valid = result.isin(["H", "D", "A"])
    df = df.loc[valid].copy()
    df["result"] = result.loc[valid].to_numpy()
    if df.empty:
        raise ValueError("matches.parquet: ningún partido con resultado H/D/A")

    df["div"] = df["div"].astype(str).str.strip()
    df["season"] = df["season"].astype(str).str.strip()
    df["match_date"] = pd.to_datetime(df["match_date"], errors="coerce")
    df = df.loc[df["match_date"].notna()].copy()
    if "season_start" in df.columns:
        df["season_start"] = df["season_start"].astype(np.int64)
    else:
        df["season_start"] = S.season_years(df, season_col="season", start_col="__missing__")
    df["y"] = M.encode_result(df["result"])

    out = df[["match_id", "div", "season", "season_start", "match_date", "result", "y"]].reset_index(drop=True)
    out.attrs["rows_total"] = total
    return out


def prepare_frame(
    predictions: pd.DataFrame,
    matches: pd.DataFrame,
    allow_metadata_mismatch: bool = False,
) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """Cruza predicciones con el parquet y añade ``y`` y ``partition``.

    Devuelve ``(frame, info)``. ``info`` resume filas sin match, desajustes de
    metadatos y distribución de ``data_quality_flag``. Los desajustes de
    metadatos son un error salvo ``allow_metadata_mismatch=True`` (entonces
    manda el parquet).
    """
    match_cols = matches.rename(
        columns={
            "div": "div_match",
            "season": "season_match",
            "match_date": "date_match",
        }
    )
    merged = predictions.merge(
        match_cols[["match_id", "div_match", "season_match", "season_start", "date_match", "result", "y"]],
        on="match_id",
        how="inner",
        validate="m:1",
    )
    info: Dict[str, Any] = {
        "predictions_rows": int(len(predictions)),
        "matched_rows": int(len(merged)),
        "unmatched_rows": int(len(predictions) - len(merged)),
    }
    if merged.empty:
        raise ValueError("ninguna predicción cruza con matches.parquet (match_id)")

    mismatches: Dict[str, int] = {}
    div_bad = merged["div"].astype(str) != merged["div_match"].astype(str)
    season_bad = merged["season"].astype(str) != merged["season_match"].astype(str)
    date_bad = pd.to_datetime(merged["match_date"]).dt.normalize() != pd.to_datetime(
        merged["date_match"]
    ).dt.normalize()
    if div_bad.any():
        mismatches["div"] = int(div_bad.sum())
    if season_bad.any():
        mismatches["season"] = int(season_bad.sum())
    if date_bad.any():
        mismatches["match_date"] = int(date_bad.sum())
    info["metadata_mismatches"] = mismatches
    if mismatches and not allow_metadata_mismatch:
        example = merged.loc[div_bad | season_bad | date_bad, ["match_id", "div", "div_match", "season", "season_match"]].head(3)
        raise ValueError(
            f"desajustes de metadatos entre predictions y matches.parquet: {mismatches}. "
            f"Ejemplos:\n{example.to_string(index=False)}\n"
            "Use --allow-metadata-mismatch para continuar usando el parquet como verdad."
        )

    merged["div"] = merged["div_match"].astype(str)
    merged["season"] = merged["season_match"].astype(str)
    merged["match_date"] = pd.to_datetime(merged["date_match"])
    merged["partition"] = [
        S.partition_for_year(int(year)) for year in merged["season_start"].to_numpy()
    ]
    info["quality_flags"] = (
        merged["data_quality_flag"].astype(str).value_counts().sort_index().to_dict()
    )
    info["partitions"] = merged["partition"].value_counts().to_dict()

    keep = [
        "match_id",
        "div",
        "season",
        "season_start",
        "match_date",
        "partition",
        "model_id",
        "model_version",
        "fold_id",
        "data_quality_flag",
        "p_home",
        "p_draw",
        "p_away",
        "result",
        "y",
    ]
    frame = merged[keep].reset_index(drop=True)
    return frame, info


# ---------------------------------------------------------------------------
# Métricas por grupo
# ---------------------------------------------------------------------------
_CORE_KEYS = (
    "n",
    "log_loss",
    "brier",
    "brier_per_class",
    "rps",
    "accuracy",
    "balanced_accuracy",
    "ece",
)


def _compact(summary: Dict[str, Any]) -> Dict[str, Any]:
    return {key: summary[key] for key in _CORE_KEYS if key in summary}


def _metrics_block(
    sub: pd.DataFrame, bins: int, include_tables: bool
) -> Dict[str, Any]:
    y = sub["y"].to_numpy()
    p = sub[list(M.PROB_COLUMNS)].to_numpy()
    return M.summary_metrics(y, p, bins=bins, include_tables=include_tables)


def _sorted_seasons(df: pd.DataFrame) -> List[Tuple[int, str]]:
    pairs = df[["season_start", "season"]].drop_duplicates()
    return [(int(row.season_start), str(row.season)) for row in pairs.sort_values(["season_start", "season"]).itertuples()]


def build_model_section(
    frame: pd.DataFrame, model_id: str, bins: int
) -> Dict[str, Any]:
    """Todas las métricas de un modelo: global, particiones, temporadas, divs."""
    sub = frame[frame["model_id"] == model_id]
    if sub.empty:
        raise ValueError(f"modelo {model_id!r} sin filas")
    section: Dict[str, Any] = {
        "model_version": str(sub["model_version"].mode().iloc[0]) if not sub["model_version"].mode().empty else None,
        "n_predictions": int(len(sub)),
        "overall": _metrics_block(sub, bins=bins, include_tables=True),
        "by_partition": {},
        "by_season": {},
        "by_division": {},
        "by_season_division": {},
        "by_fold": {},
    }

    for partition in _PARTITION_ORDER:
        part = sub[sub["partition"] == partition]
        if part.empty:
            continue
        section["by_partition"][partition] = _metrics_block(part, bins=bins, include_tables=True)

    for year, season in _sorted_seasons(sub):
        season_df = sub[(sub["season_start"] == year) & (sub["season"] == season)]
        if season_df.empty:
            continue
        section["by_season"][season] = _compact(_metrics_block(season_df, bins=bins, include_tables=False))

    for div in sorted(sub["div"].unique().tolist()):
        div_df = sub[sub["div"] == div]
        if div_df.empty:
            continue
        section["by_division"][div] = _compact(_metrics_block(div_df, bins=bins, include_tables=False))

    for year, season in _sorted_seasons(sub):
        for div in sorted(sub["div"].unique().tolist()):
            cell = sub[
                (sub["season_start"] == year) & (sub["season"] == season) & (sub["div"] == div)
            ]
            if cell.empty:
                continue
            section["by_season_division"][f"{season}|{div}"] = _compact(
                _metrics_block(cell, bins=bins, include_tables=False)
            )

    for fold_id in sorted(sub["fold_id"].unique().tolist()):
        fold_df = sub[sub["fold_id"] == fold_id]
        if fold_df.empty:
            continue
        section["by_fold"][fold_id] = _compact(_metrics_block(fold_df, bins=bins, include_tables=False))
    return section


def _comparison_entry(
    a_df: pd.DataFrame,
    b_df: pd.DataFrame,
    model_a: str,
    model_b: str,
    scope: str,
    B: int,
    n_permutations: int,
    seed: int,
) -> Optional[Dict[str, Any]]:
    aligned = C.same_matches(a_df, b_df, strict=False)
    n = aligned["n"]
    if n < 2:
        return None
    a_rows = a_df.iloc[aligned["idx_a"]]
    b_rows = b_df.iloc[aligned["idx_b"]]
    y_a = a_rows["y"].to_numpy()
    y_b = b_rows["y"].to_numpy()
    if not np.array_equal(y_a, y_b):
        raise ValueError(f"etiquetas distintas para los mismos match_id entre {model_a} y {model_b}")
    p_a = a_rows[list(M.PROB_COLUMNS)].to_numpy()
    p_b = b_rows[list(M.PROB_COLUMNS)].to_numpy()
    blocks = C.make_blocks(a_rows["season"].to_numpy(), a_rows["div"].to_numpy())

    boot = C.paired_bootstrap_delta(y_a, p_a, p_b, blocks, B=B, seed=seed)
    entry: Dict[str, Any] = {
        "model_a": model_a,
        "model_b": model_b,
        "scope": scope,
        "n_matches": int(n),
        "n_blocks": int(boot["n_blocks"]),
        "excluded_only_a": int(aligned["n_only_a"]),
        "excluded_only_b": int(aligned["n_only_b"]),
        "delta_logloss": boot["delta_logloss"],
        "ci95_logloss": boot["ci95_logloss"],
        "frac_gt0_logloss": boot["frac_gt0_logloss"],
        "delta_brier": boot["delta_brier"],
        "ci95_brier": boot["ci95_brier"],
        "frac_gt0_brier": boot["frac_gt0_brier"],
        "bootstrap_B": int(B),
        "seed": int(seed),
    }
    entry["permutation"] = (
        C.permutation_test_delta(y_a, p_a, p_b, n=n_permutations, seed=seed, metric="logloss")
        if n_permutations > 0
        else None
    )
    perm_p = entry["permutation"]["p_value"] if entry["permutation"] else None
    ci = entry["ci95_logloss"]
    excludes_zero = (ci[0] > 0.0) or (ci[1] < 0.0)
    significant = bool(excludes_zero and (perm_p is not None and perm_p < 0.05))
    entry["significant_95"] = significant
    if significant:
        entry["better_model"] = model_a if entry["delta_logloss"] < 0 else model_b
    else:
        entry["better_model"] = None
    entry["note"] = (
        "delta = log-loss(a) - log-loss(b); >0 => a peor"
        + ("" if n_permutations > 0 else "; test de permutación omitido")
    )
    return entry


def build_comparisons(
    frame: pd.DataFrame,
    model_ids: Sequence[str],
    B: int,
    n_permutations: int,
    seed: int,
) -> List[Dict[str, Any]]:
    """Comparaciones pareadas por par de modelos: global y por partición."""
    comparisons: List[Dict[str, Any]] = []
    for model_a, model_b in combinations(sorted(model_ids), 2):
        a_df = frame[frame["model_id"] == model_a]
        b_df = frame[frame["model_id"] == model_b]
        scopes: List[Tuple[str, pd.DataFrame, pd.DataFrame]] = [("all", a_df, b_df)]
        for partition in _PARTITION_ORDER:
            a_part = a_df[a_df["partition"] == partition]
            b_part = b_df[b_df["partition"] == partition]
            if a_part.empty or b_part.empty:
                continue
            scopes.append((partition, a_part, b_part))
        for scope, a_scope, b_scope in scopes:
            entry = _comparison_entry(
                a_scope, b_scope, model_a, model_b, scope, B, n_permutations, seed
            )
            if entry is not None:
                comparisons.append(entry)
    return comparisons


def build_coverage(
    frame: pd.DataFrame,
    predictions: pd.DataFrame,
    matches: pd.DataFrame,
    info: Dict[str, Any],
) -> Dict[str, Any]:
    """Cobertura real por partición (parquet) y de predicciones por modelo."""
    matches_by_partition = {name: 0 for name in _PARTITION_ORDER}
    for year in matches["season_start"].to_numpy():
        partition = S.partition_for_year(int(year))
        if partition in matches_by_partition:
            matches_by_partition[partition] += 1
    matches_by_partition["unknown"] = int(
        sum(1 for year in matches["season_start"].to_numpy() if S.partition_for_year(int(year)) == "unknown")
    )
    seasons = matches.groupby("season_start")["season"].agg(lambda values: values.iloc[0]).sort_index()
    per_model: Dict[str, Any] = {}
    for model_id, sub in frame.groupby("model_id"):
        counts = {name: 0 for name in _PARTITION_ORDER}
        for partition, count in sub["partition"].value_counts().items():
            if partition in counts:
                counts[partition] = int(count)
        per_model[str(model_id)] = {
            "n_predictions": int(len(sub)),
            "by_partition": counts,
        }
    return {
        "matches_rows_total": int(matches.attrs.get("rows_total", len(matches))),
        "matches_with_result": int(len(matches)),
        "matches_by_partition": matches_by_partition,
        "matches_by_season": {str(int(k)): int(v) for k, v in matches.groupby("season_start").size().items()},
        "seasons": {str(int(k)): str(v) for k, v in seasons.items()},
        "predictions_rows": int(info["predictions_rows"]),
        "matched_rows": int(info["matched_rows"]),
        "unmatched_rows": int(info["unmatched_rows"]),
        "per_model": per_model,
        "quality_flags": info.get("quality_flags", {}),
    }


# ---------------------------------------------------------------------------
# Construcción del informe
# ---------------------------------------------------------------------------
def build_report(
    predictions_path: Path,
    matches_path: Path,
    bins: int = 10,
    bootstrap_B: int = 2000,
    permutations: int = 10000,
    seed: int = 20261109,
    only_ok: bool = False,
    allow_metadata_mismatch: bool = False,
) -> Dict[str, Any]:
    """Carga, valida, calcula y devuelve el informe completo (dict JSON-safe)."""
    predictions_path = Path(predictions_path)
    matches_path = Path(matches_path)
    predictions = load_predictions(predictions_path, only_ok=only_ok)
    matches = load_matches(matches_path)
    frame, info = prepare_frame(
        predictions, matches, allow_metadata_mismatch=allow_metadata_mismatch
    )

    model_ids = sorted(frame["model_id"].unique().tolist())
    models = {model_id: build_model_section(frame, model_id, bins=bins) for model_id in model_ids}
    comparisons = (
        build_comparisons(frame, model_ids, B=bootstrap_B, n_permutations=permutations, seed=seed)
        if len(model_ids) > 1
        else []
    )
    coverage = build_coverage(frame, predictions, matches, info)

    warnings: List[str] = []
    if info["unmatched_rows"]:
        warnings.append(
            f"{info['unmatched_rows']} predicciones con match_id ausente en matches.parquet (excluidas)"
        )
    if info.get("metadata_mismatches"):
        warnings.append(
            f"desajustes de metadatos corregidos con el parquet: {info['metadata_mismatches']}"
        )
    if coverage["matches_by_partition"].get("live", 0) == 0:
        warnings.append("partición live vacía (temporada 2026/27 sin partidos en el parquet)")
    unknown = coverage["matches_by_partition"].get("unknown", 0)
    if unknown:
        warnings.append(f"{unknown} partidos con temporada fuera del calendario canónico (partition=unknown)")
    for model_id, section in models.items():
        missing = [p for p in _PARTITION_ORDER if p not in section["by_partition"]]
        if missing:
            warnings.append(f"{model_id}: sin predicciones en particiones {missing}")
    if not comparisons and len(model_ids) == 1:
        warnings.append("un solo modelo: no hay comparaciones pareadas")

    report: Dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "environment": {
            "python": platform.python_version(),
            "numpy": np.__version__,
            "pandas": pd.__version__,
            "platform": platform.platform(),
            **_git_info(),
        },
        "inputs": {
            "predictions": {
                "path": str(predictions_path),
                "sha256": _sha256(predictions_path),
                "rows": int(len(predictions)),
                "models": model_ids,
                "folds": sorted(predictions["fold_id"].unique().tolist()),
            },
            "matches": {
                "path": str(matches_path),
                "sha256": _sha256(matches_path),
                "rows_total": int(matches.attrs.get("rows_total", len(matches))),
                "rows_with_result": int(len(matches)),
            },
        },
        "config": {
            "bins": int(bins),
            "bootstrap_B": int(bootstrap_B),
            "permutations": int(permutations),
            "seed": int(seed),
            "only_ok": bool(only_ok),
            "allow_metadata_mismatch": bool(allow_metadata_mismatch),
            "block": "season x division",
            "partitions": list(_PARTITION_ORDER),
            "test_seasons": [f"{y}/{str(y + 1)[-2:]}" for y in S.TEST_SEASON_STARTS],
        },
        "coverage": coverage,
        "models": models,
        "comparisons": comparisons,
        "warnings": warnings,
    }
    return _json_safe(report)


# ---------------------------------------------------------------------------
# Markdown
# ---------------------------------------------------------------------------
def _table(headers: Sequence[str], rows: Iterable[Sequence[Any]]) -> str:
    lines = ["| " + " | ".join(headers) + " |", "|" + "|".join(["---"] * len(headers)) + "|"]
    for row in rows:
        lines.append("| " + " | ".join(str(cell) for cell in row) + " |")
    return "\n".join(lines)


def _partition_label(name: str) -> str:
    labels = {
        "dev": "dev (≤2022/23)",
        "val": "val (2023/24)",
        "test": "test (2024/25–2025/26)",
        "live": "live (2026/27)",
        "all": "global (todas)",
    }
    return labels.get(name, name)


def _metrics_rows(blocks: Dict[str, Dict[str, Any]]) -> List[List[str]]:
    rows: List[List[str]] = []
    for name, metrics in blocks.items():
        rows.append(
            [
                _partition_label(name),
                _fmt(metrics.get("n"), 0),
                _fmt(metrics.get("log_loss")),
                _fmt(metrics.get("brier")),
                _fmt(metrics.get("rps")),
                _fmt(metrics.get("accuracy")),
                _fmt(metrics.get("balanced_accuracy")),
                _fmt(metrics.get("ece")),
            ]
        )
    return rows


def render_markdown(report: Dict[str, Any]) -> str:
    """Renderiza el informe a Markdown (tablas legibles + metodología)."""
    env = report.get("environment", {})
    inputs = report.get("inputs", {})
    config = report.get("config", {})
    coverage = report.get("coverage", {})
    models = report.get("models", {})
    comparisons = report.get("comparisons", [])

    lines: List[str] = []
    lines.append("# Evaluación de modelos — PitchLab A08")
    lines.append("")
    lines.append(f"Generado: **{report.get('generated_at')}** · esquema `{report.get('schema_version')}`")
    lines.append("")
    lines.append(f"- Commit: `{env.get('commit')}` (dirty={env.get('dirty')})")
    lines.append(f"- Python {env.get('python')} · numpy {env.get('numpy')} · pandas {env.get('pandas')}")
    lines.append(
        f"- Predicciones: `{inputs.get('predictions', {}).get('path')}` "
        f"(sha256 `{str(inputs.get('predictions', {}).get('sha256'))[:16]}…`, "
        f"{inputs.get('predictions', {}).get('rows')} filas)"
    )
    lines.append(
        f"- Partidos: `{inputs.get('matches', {}).get('path')}` "
        f"(sha256 `{str(inputs.get('matches', {}).get('sha256'))[:16]}…`, "
        f"{inputs.get('matches', {}).get('rows_with_result')} con resultado)"
    )
    lines.append(
        f"- Config: bins={config.get('bins')}, B={config.get('bootstrap_B')}, "
        f"permutaciones={config.get('permutations')}, seed={config.get('seed')}, "
        f"bloques={config.get('block')}"
    )
    lines.append("")

    # Cobertura
    lines.append("## 1. Cobertura")
    lines.append("")
    cov_rows: List[List[Any]] = []
    for partition in list(_PARTITION_ORDER) + ["unknown"]:
        n_matches = coverage.get("matches_by_partition", {}).get(partition, 0)
        if partition == "unknown" and not n_matches:
            continue
        per_model = coverage.get("per_model", {})
        cells = [per_model.get(model_id, {}).get("by_partition", {}).get(partition, 0) for model_id in models]
        total_matches = coverage.get("matches_with_result") or 0
        share = f"{n_matches} ({100.0 * n_matches / total_matches:.1f}%)" if total_matches else str(n_matches)
        cov_rows.append([_partition_label(partition), share, *cells])
    headers = ["Partición", "Partidos (parquet)"] + [f"Predicciones `{model}`" for model in models]
    lines.append(_table(headers, cov_rows))
    lines.append("")
    lines.append(
        f"Partidos con resultado: **{coverage.get('matches_with_result')}** de "
        f"{coverage.get('matches_rows_total')} filas del parquet. "
        f"Predicciones: {coverage.get('predictions_rows')} filas, "
        f"{coverage.get('matched_rows')} emparejadas, {coverage.get('unmatched_rows')} sin partido."
    )
    lines.append("")
    if coverage.get("quality_flags"):
        flags = ", ".join(f"`{k}`={v}" for k, v in coverage["quality_flags"].items())
        lines.append(f"`data_quality_flag`: {flags}")
        lines.append("")

    # Métricas por modelo
    lines.append("## 2. Métricas por modelo y partición")
    for model_id, section in models.items():
        lines.append("")
        lines.append(f"### `{model_id}` (v{section.get('model_version')}, {section.get('n_predictions')} predicciones)")
        lines.append("")
        rows = [["global", _fmt(section["overall"].get("n"), 0), _fmt(section["overall"].get("log_loss")),
                 _fmt(section["overall"].get("brier")), _fmt(section["overall"].get("rps")),
                 _fmt(section["overall"].get("accuracy")), _fmt(section["overall"].get("balanced_accuracy")),
                 _fmt(section["overall"].get("ece"))]]
        rows += _metrics_rows(section.get("by_partition", {}))
        lines.append(_table(
            ["Ámbito", "N", "Log-loss", "Brier", "RPS", "Accuracy", "Bal. acc.", "ECE"], rows
        ))
        lines.append("")

        # Brier por clase + per-class
        bpc = section["overall"].get("brier_per_class", {})
        if bpc:
            lines.append(
                "Brier por clase: "
                + ", ".join(f"{name}={_fmt(value)}" for name, value in bpc.items())
                + ". Per-class en `metrics.json` (`models.<id>.overall.per_class`)."
            )
        # Calibración
        cal = section["overall"].get("calibration", [])
        if cal:
            lines.append("")
            lines.append("Curva de fiabilidad (clase predicha):")
            lines.append("")
            cal_rows = []
            for entry in cal:
                if entry.get("n"):
                    cal_rows.append(
                        [
                            f"[{entry['bin_lo']:.1f}, {entry['bin_hi']:.1f})",
                            entry["n"],
                            _fmt(entry.get("confidence"), 3),
                            _fmt(entry.get("accuracy"), 3),
                            _fmt(entry.get("gap"), 3),
                        ]
                    )
                else:
                    cal_rows.append([f"[{entry['bin_lo']:.1f}, {entry['bin_hi']:.1f})", 0, "—", "—", "—"])
            lines.append(_table(["Bin", "N", "Confianza media", "Acierto observado", "Gap"], cal_rows))
        ovr = section["overall"].get("ovr_calibration", {})
        if ovr:
            lines.append("")
            lines.append(
                "ECE one-vs-rest: "
                + ", ".join(f"{name}={_fmt(data.get('ece'))}" for name, data in ovr.get("classes", {}).items())
                + f" (media {_fmt(ovr.get('mean_ece'))})."
            )

    # Temporadas y divisiones (robustez)
    lines.append("")
    lines.append("## 3. Robustez por temporada y división")
    lines.append("")
    for model_id, section in models.items():
        by_season = section.get("by_season", {})
        if by_season:
            lines.append(f"### `{model_id}` — por temporada")
            lines.append("")
            rows = [
                [season, _fmt(m.get("n"), 0), _fmt(m.get("log_loss")), _fmt(m.get("brier")),
                 _fmt(m.get("rps")), _fmt(m.get("accuracy")), _fmt(m.get("balanced_accuracy")), _fmt(m.get("ece"))]
                for season, m in by_season.items()
            ]
            lines.append(_table(["Temporada", "N", "Log-loss", "Brier", "RPS", "Accuracy", "Bal. acc.", "ECE"], rows))
            lines.append("")
        by_div = section.get("by_division", {})
        if by_div:
            lines.append(f"### `{model_id}` — por división")
            lines.append("")
            rows = [
                [div, _fmt(m.get("n"), 0), _fmt(m.get("log_loss")), _fmt(m.get("brier")),
                 _fmt(m.get("rps")), _fmt(m.get("accuracy")), _fmt(m.get("ece"))]
                for div, m in sorted(by_div.items(), key=lambda item: -float(item[1].get("n", 0)))
            ]
            lines.append(_table(["División", "N", "Log-loss", "Brier", "RPS", "Accuracy", "ECE"], rows))
            lines.append("")

    # Comparaciones
    lines.append("## 4. Comparaciones pareadas")
    lines.append("")
    if not comparisons:
        lines.append("No hay comparaciones (se requieren ≥2 modelos).")
    else:
        lines.append(
            "Δ = pérdida(a) − pérdida(b); Δ>0 ⇒ `a` es peor. IC95 % bootstrap por bloques "
            "temporada×división; p-valor bilateral de permutación pareada "
            f"(n={config.get('permutations')}). "
            "Se declara superioridad solo si el IC95 % excluye 0 y p<0,05."
        )
        lines.append("")
        rows = []
        for entry in comparisons:
            perm = entry.get("permutation") or {}
            ci = entry.get("ci95_logloss") or [None, None]
            ci_b = entry.get("ci95_brier") or [None, None]
            rows.append(
                [
                    f"`{entry['model_a']}` vs `{entry['model_b']}`",
                    _partition_label(entry["scope"]),
                    entry["n_matches"],
                    entry.get("n_blocks", "—"),
                    f"{_fmt(entry['delta_logloss'])} [{_fmt(ci[0])}, {_fmt(ci[1])}]",
                    _fmt(entry.get("frac_gt0_logloss"), 3),
                    f"{_fmt(entry['delta_brier'])} [{_fmt(ci_b[0])}, {_fmt(ci_b[1])}]",
                    _fmt(perm.get("p_value"), 4) if perm else "—",
                    "sí" if entry.get("significant_95") else "no",
                    f"`{entry['better_model']}`" if entry.get("better_model") else "—",
                ]
            )
        lines.append(_table(
            ["A vs B", "Ámbito", "N", "Bloques", "Δlog-loss [IC95]", "frac Δ>0", "ΔBrier [IC95]", "p perm.", "Sig.", "Mejor"],
            rows,
        ))
    lines.append("")

    lines.append("## 5. Robustez comparada (log-loss)")
    lines.append("")
    if len(models) > 1:
        lines.append(
            "Comparación descriptiva por temporada y división. Las diferencias pareadas con IC y "
            "p-valor están en §4 y en `metrics.json`; esta tabla sirve para detectar si una mejora "
            "depende de una sola liga o temporada."
        )
        lines.append("")
        season_order: List[str] = []
        for section in models.values():
            for season in section.get("by_season", {}):
                if season not in season_order:
                    season_order.append(season)
        if season_order:
            headers = ["Temporada", "N"] + [f"`{model}`" for model in models]
            rows = []
            for season in season_order:
                n_season = next(
                    (
                        section["by_season"][season].get("n", 0)
                        for section in models.values()
                        if season in section.get("by_season", {})
                    ),
                    0,
                )
                cells = [
                    _fmt(section.get("by_season", {}).get(season, {}).get("log_loss"))
                    for section in models.values()
                ]
                rows.append([season, n_season, *cells])
            lines.append(_table(headers, rows))
            lines.append("")
        divisions: List[str] = []
        for section in models.values():
            for div in section.get("by_division", {}):
                if div not in divisions:
                    divisions.append(div)
        if divisions:
            headers = ["División", "N"] + [f"`{model}`" for model in models]
            rows = []
            for div in sorted(divisions):
                n_div = next(
                    (
                        section["by_division"][div].get("n", 0)
                        for section in models.values()
                        if div in section.get("by_division", {})
                    ),
                    0,
                )
                cells = [
                    _fmt(section.get("by_division", {}).get(div, {}).get("log_loss"))
                    for section in models.values()
                ]
                rows.append([div, n_div, *cells])
            lines.append(_table(headers, rows))
            lines.append("")
    else:
        lines.append("Con un solo modelo no hay comparación; ver métricas por temporada/división en §3.")
        lines.append("")

    warnings = report.get("warnings", [])
    lines.append("## 6. Advertencias")
    lines.append("")
    if warnings:
        for warning in warnings:
            lines.append(f"- {warning}")
    else:
        lines.append("Sin advertencias: cobertura completa y sin desajustes de metadatos.")
    lines.append("")

    lines.append("## 7. Metodología y convenciones")
    lines.append("")
    lines.append(
        "- Etiqueta: `0=H`, `1=D`, `2=A`. Log-loss con **ln natural**; `p` renormalizada por fila "
        "y recortada a `[1e-15, 1]` (sin renormalizar tras el recorte: así la predicción perfecta da 0 exacto)."
    )
    lines.append(
        "- Brier multiclase = media de `Σ_k (p_ik − o_ik)²` (rango [0,2]); Brier por clase = media por clase "
        "(su suma es el Brier multiclase)."
    )
    lines.append(
        "- RPS con orden **H < D < A**: `(1/N) Σ (1/(K−1)) Σ_{k=1}^{K−1} (CDF_p(k) − CDF_o(k))²`, `K=3`."
    )
    lines.append(
        "- ECE = `Σ_b (n_b/N)|acc_b − conf_b|` sobre 10 bins de igual anchura de `max_k p_ik`; "
        "depende del binning y del tamaño muestral, por eso se publica junto a la curva."
    )
    lines.append(
        "- Balanced accuracy: media del recall de las clases con soporte>0 (una clase ausente no tiene recall)."
    )
    lines.append(
        "- Comparaciones: bootstrap pareado por bloques temporada×división (B configurado) e IC percentil "
        "2,5–97,5; test de permutación de signos bilateral. Nunca se comparan IC de sistemas por separado."
    )
    lines.append(
        "- Particiones: dev ≤2022/23; val 2023/24; test 2024/25–2025/26; live 2026/27. `test` no se usa para elegir."
    )
    lines.append("")
    lines.append("## 8. Limitaciones")
    lines.append("")
    lines.append("- ECE es sensible al número de bins y al tamaño de cada bin; con N pequeño es sesgado y ruidoso.")
    lines.append(
        "- El bootstrap por bloques supone intercambiabilidad de bloques; con pocos bloques (p. ej. 2 temporadas) "
        "el IC es optimista. El número de bloques se reporta en `metrics.json`."
    )
    lines.append(
        "- El test de permutación asume simetría de los signos de las diferencias; no corrige comparaciones múltiples "
        "(varios modelos/particiones)."
    )
    lines.append(
        "- Comparar modelos con distinta cobertura usa la intersección de `match_id`; los descartes se reportan por comparación."
    )
    lines.append("- Los partidos sin resultado quedan fuera del parquet evaluable; la cobertura se reporta explícitamente.")
    lines.append("")
    lines.append("## 9. Reproducir")
    lines.append("")
    lines.append("```bash")
    lines.append(
        f"./.venv/bin/python research/prediction-lab/eval/report.py --predictions "
        f"{inputs.get('predictions', {}).get('path')} --matches {inputs.get('matches', {}).get('path')} "
        f"--out-dir <out-dir> --bins {config.get('bins')} --bootstrap-B {config.get('bootstrap_B')} "
        f"--permutations {config.get('permutations')} --seed {config.get('seed')}"
    )
    lines.append("```")
    lines.append("")
    return "\n".join(lines)


def write_report(report: Dict[str, Any], out_dir: Path) -> Dict[str, Path]:
    """Escribe ``metrics.json`` y ``metrics.md`` en ``out_dir``."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "metrics.json"
    md_path = out_dir / "metrics.md"
    with open(json_path, "w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2, allow_nan=False)
        handle.write("\n")
    md_path.write_text(render_markdown(report), encoding="utf-8")
    return {"metrics_json": json_path, "metrics_md": md_path}


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def _parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Informe de evaluación PitchLab (A08)")
    parser.add_argument("--predictions", required=True, type=Path)
    parser.add_argument("--matches", required=True, type=Path)
    parser.add_argument("--out-dir", required=True, type=Path)
    parser.add_argument("--bins", type=int, default=10)
    parser.add_argument("--bootstrap-B", type=int, default=2000)
    parser.add_argument("--permutations", type=int, default=10000)
    parser.add_argument("--seed", type=int, default=20261109)
    parser.add_argument("--only-ok", action="store_true")
    parser.add_argument("--allow-metadata-mismatch", action="store_true")
    parser.add_argument("--quiet", action="store_true")
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = _parse_args(argv)
    report = build_report(
        predictions_path=args.predictions,
        matches_path=args.matches,
        bins=args.bins,
        bootstrap_B=args.bootstrap_B,
        permutations=args.permutations,
        seed=args.seed,
        only_ok=args.only_ok,
        allow_metadata_mismatch=args.allow_metadata_mismatch,
    )
    paths = write_report(report, args.out_dir)
    if not args.quiet:
        models = report["models"]
        print(f"[A08] modelos: {', '.join(models)}")
        for model_id, section in models.items():
            for partition, metrics in section["by_partition"].items():
                print(
                    f"[A08] {model_id} {partition}: n={metrics['n']} "
                    f"logloss={metrics['log_loss']:.5f} brier={metrics['brier']:.5f} "
                    f"rps={metrics['rps']:.5f} acc={metrics['accuracy']:.4f} ece={metrics['ece']:.4f}"
                )
        print(f"[A08] comparaciones: {len(report['comparisons'])}")
        print(f"[A08] escrito: {paths['metrics_json']}")
        print(f"[A08] escrito: {paths['metrics_md']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
