#!/usr/bin/env python3
"""Validadores ejecutables del dataset canónico de PitchLab.

Uso:
    ./.venv/bin/python etl/validators.py --data data/processed/matches.parquet

Salida:
    data/processed/validation_report.json  (resumen legible + detalle por check)
    código 0 si no hay violaciones críticas; 1 si las hay.

Diseño:
    - Los checks críticos son invariantes que el dataset debe cumplir para poder
      modelarse (unicidad, coherencia resultado/goles, rangos, fechas, cuotas
      válidas, duplicados de partido, esquema).
    - Los checks de aviso documentan limitaciones conocidas de la fuente
      (cobertura, alias de equipos, placeholders de casas de apuestas,
      temporadas en curso/cortas). No hacen fallar la validación.
    - El validador no modifica el parquet ni el ETL; es de solo lectura.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATA = ROOT / "data" / "processed" / "matches.parquet"
DEFAULT_REPORT = ROOT / "data" / "processed" / "validation_report.json"

BASE_COLUMNS = [
    "match_id", "source", "div", "league", "country", "season", "season_start",
    "match_date", "kickoff_time", "home_team", "away_team", "home_goals",
    "away_goals", "result", "ht_home_goals", "ht_away_goals", "ht_result",
    "shots_home", "shots_away", "sot_home", "sot_away", "corners_home",
    "corners_away", "fouls_home", "fouls_away", "yellows_home", "yellows_away",
    "reds_home", "reds_away", "source_season_file", "source_row", "ingested_at",
]
ODDS_SOURCES = ("b365", "ps", "avg", "max", "bf", "bfe")
TOTALS_SOURCES = ("b365", "p", "avg", "max")
ODDS_COLUMNS = [
    f"odds_{phase}_{src}_{outcome}"
    for phase in ("open", "close")
    for src in ODDS_SOURCES
    for outcome in ("h", "d", "a")
]
TOTALS_COLUMNS = [
    f"totals_{phase}_{src}_{side}"
    for phase in ("open", "close")
    for src in TOTALS_SOURCES
    for side in ("over", "under")
]
REQUIRED_COLUMNS = BASE_COLUMNS + ODDS_COLUMNS + TOTALS_COLUMNS

NUMERIC_COLUMNS = [
    "season_start", "home_goals", "away_goals", "ht_home_goals", "ht_away_goals",
    "shots_home", "shots_away", "sot_home", "sot_away", "corners_home",
    "corners_away", "fouls_home", "fouls_away", "yellows_home", "yellows_away",
    "reds_home", "reds_away", "source_row",
] + ODDS_COLUMNS + TOTALS_COLUMNS

COHERENT_BOOKS = ("b365", "ps", "avg")
UNRELIABLE_BOOKS = ("max", "bf", "bfe")
MAIN_DIVISIONS = {
    "E0", "E1", "D1", "D2", "I1", "I2", "SP1", "SP2", "F1", "F2",
    "N1", "P1", "T1", "B1", "G1", "SC0", "SC1",
}

# Palabras que no distinguen club en football-data: se eliminan para agrupar
# variantes del tipo "Lommel" / "Lommel SK" o "U.Las Palmas" / "Las Palmas".
ALIAS_STOPWORDS = {
    "fc", "cf", "afc", "sc", "ac", "club", "the", "de", "cd", "ud", "sv",
    "vfl", "vfb", "tsv", "fk", "bk", "if", "ff", "sk", "nk", "kfc", "calcio",
    "ss", "ssc", "as", "us", "acf", "rc", "rcd", "ca", "ec", "sd", "ce",
    "cfc", "u",
}

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
SEASON_RE = re.compile(r"^\d{4}(/\d{2})?$")


# --------------------------------------------------------------------------- #
# Utilidades
# --------------------------------------------------------------------------- #
def _strip_accents(value: str) -> str:
    return unicodedata.normalize("NFKD", str(value)).encode("ascii", "ignore").decode()


def slug(value: str) -> str:
    """Misma normalización que etl/build_matches.py (contrato, §1)."""
    text = _strip_accents(value)
    text = re.sub(r"[^a-zA-Z0-9]+", "_", text).strip("_").lower()
    return text


def team_core(value: str) -> str:
    """Clave laxa para detectar alias de equipo (no para reescribir el ETL)."""
    text = _strip_accents(value).lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    tokens = [tok for tok in text.split() if tok and tok not in ALIAS_STOPWORDS]
    return " ".join(tokens) or slug(value)


def _map_categorical(series: pd.Series, func: Any) -> pd.Series:
    """Aplica func() una vez por categoría y reconstruye por códigos."""
    categorical = pd.Categorical(series)
    codes = categorical.codes
    values = np.empty(len(categorical.categories), dtype=object)
    for i, category in enumerate(categorical.categories):
        values[i] = func(category)
    output = np.empty(len(series), dtype=object)
    valid = codes >= 0
    output[valid] = values[codes[valid]]
    output[~valid] = ""
    return pd.Series(output, index=series.index)


def _map_slug(series: pd.Series) -> pd.Series:
    """slug() vectorizado por categorías (mucho más rápido que apply)."""
    return _map_categorical(series, slug)


def _map_core(series: pd.Series) -> pd.Series:
    return _map_categorical(series, team_core)


def _clean(value: Any) -> Any:
    """Convierte escalares numpy/pandas a tipos JSON deterministas."""
    if value is None:
        return None
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        if math.isnan(float(value)) or math.isinf(float(value)):
            return None
        return float(value)
    if isinstance(value, (np.bool_, bool)):
        return bool(value)
    if isinstance(value, (pd.Timestamp,)):
        return value.strftime("%Y-%m-%d")
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return value
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    return value


def _records(
    frame: pd.DataFrame,
    columns: Sequence[str],
    limit: int,
    sort_by: Optional[str] = None,
    ascending: bool = True,
) -> List[Dict[str, Any]]:
    if frame is None or frame.empty:
        return []
    usable = [c for c in columns if c in frame.columns]
    if not usable:
        return []
    out = frame[usable].copy()
    if sort_by and sort_by in out.columns:
        out = out.sort_values(sort_by, ascending=ascending, kind="mergesort")
    if "match_id" in out.columns:
        out = out.sort_values("match_id", kind="mergesort")
    out = out.head(max(0, int(limit)))
    return [{k: _clean(v) for k, v in row.items()} for row in out.to_dict("records")]


def _check(
    checks: List[Dict[str, Any]],
    check_id: str,
    severity: str,
    message: str,
    count: int,
    examples: Optional[List[Dict[str, Any]]] = None,
) -> int:
    checks.append(
        {
            "check_id": check_id,
            "severity": severity,
            "message": message,
            "count": int(max(0, count)),
            "examples": examples or [],
        }
    )
    return int(max(0, count))


def _mask_check(
    checks: List[Dict[str, Any]],
    check_id: str,
    severity: str,
    message: str,
    mask: pd.Series,
    frame: pd.DataFrame,
    columns: Sequence[str],
    limit: int,
    sort_by: Optional[str] = None,
    ascending: bool = True,
) -> int:
    count = int(mask.fillna(False).sum())
    examples: List[Dict[str, Any]] = []
    if count:
        usable = [c for c in columns if c in frame.columns]
        examples = _records(
            frame.loc[mask, usable], usable, limit, sort_by=sort_by, ascending=ascending
        )
    return _check(checks, check_id, severity, message, count, examples)


def _coverage(df: pd.DataFrame) -> Dict[str, Any]:
    fields = {
        "result": ["result"],
        "goals": ["home_goals", "away_goals"],
        "ht": ["ht_home_goals", "ht_away_goals", "ht_result"],
        "shots": ["shots_home", "shots_away"],
        "sot": ["sot_home", "sot_away"],
        "open_b365": [f"odds_open_b365_{k}" for k in "hda"],
        "close_b365": [f"odds_close_b365_{k}" for k in "hda"],
        "open_ps": [f"odds_open_ps_{k}" for k in "hda"],
        "close_ps": [f"odds_close_ps_{k}" for k in "hda"],
        "close_avg": [f"odds_close_avg_{k}" for k in "hda"],
        "totals_open_b365": ["totals_open_b365_over", "totals_open_b365_under"],
        "totals_close_b365": ["totals_close_b365_over", "totals_close_b365_under"],
    }
    masks: Dict[str, pd.Series] = {}
    for name, cols in fields.items():
        usable = [c for c in cols if c in df.columns]
        masks[name] = (
            df[usable].notna().all(axis=1)
            if usable and len(df)
            else pd.Series(False, index=df.index)
        )

    overall = {
        name: round(float(mask.mean()), 6) if len(df) else 0.0
        for name, mask in masks.items()
    }

    mask_frame = pd.DataFrame(masks, index=df.index)
    div_means = mask_frame.groupby(df["div"], sort=True).mean()
    div_counts = df.groupby("div", sort=True).size()
    by_division: Dict[str, Any] = {}
    for div in div_counts.index:
        by_division[str(div)] = {
            "matches": int(div_counts.loc[div]),
            **{
                name: round(float(div_means.at[div, name]), 6)
                for name in masks
            },
        }

    season_order = (
        df.groupby("season")
        .agg(season_start=("season_start", "min"), first=("match_date", "min"))
        .sort_values(["season_start", "first"], kind="mergesort")
        .index
    )
    season_means = mask_frame.groupby(df["season"], sort=True).mean()
    season_counts = df.groupby("season", sort=True).size()
    by_season: Dict[str, Any] = {}
    for season in season_order:
        by_season[str(season)] = {
            "matches": int(season_counts.get(season, 0)),
            **{
                name: round(float(season_means.at[season, name]), 6)
                for name in masks
            },
        }

    return {"overall": overall, "by_field": overall, "by_division": by_division, "by_season": by_season}


# --------------------------------------------------------------------------- #
# Validación principal
# --------------------------------------------------------------------------- #
def validate_dataframe(
    df: pd.DataFrame,
    data_path: str = "<memory>",
    max_examples: int = 5,
) -> Dict[str, Any]:
    """Valida un DataFrame con el esquema del contrato. No modifica la entrada."""
    checks: List[Dict[str, Any]] = []
    limit = max(1, int(max_examples))
    df = df.copy(deep=False)

    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        _check(
            checks,
            "schema_required_columns",
            "critical",
            "Faltan columnas obligatorias del contrato.",
            len(missing),
            [{"missing_column": c} for c in missing[:limit]],
        )
        return _finish(df, data_path, checks)

    bad_types = [
        c for c in NUMERIC_COLUMNS
        if c in df.columns and not pd.api.types.is_numeric_dtype(df[c])
    ]
    _check(
        checks,
        "schema_numeric_types",
        "critical",
        "Columnas numéricas obligatorias con dtype no numérico.",
        len(bad_types),
        [{"column": c, "dtype": str(df[c].dtype)} for c in bad_types[:limit]],
    )
    # Se coercionan para que el resto de checks pueda operar; el aviso anterior
    # ya deja constancia del problema de esquema.
    for col in NUMERIC_COLUMNS:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # Fechas / temporada ----------------------------------------------------
    raw_dates = df["match_date"]
    if pd.api.types.is_datetime64_any_dtype(raw_dates):
        dates = pd.to_datetime(raw_dates, errors="coerce")
    else:
        dates = pd.to_datetime(raw_dates, format="%Y-%m-%d", errors="coerce")

    bad_date_format = pd.Series(False, index=df.index)
    if not pd.api.types.is_datetime64_any_dtype(raw_dates):
        bad_date_format = raw_dates.notna() & ~raw_dates.astype(str).str.match(DATE_RE)
    date_parse_fail = dates.isna()
    _mask_check(
        checks,
        "date_parseable",
        "critical",
        "match_date ausente o no parseable como fecha ISO.",
        date_parse_fail | bad_date_format,
        df,
        ["match_id", "div", "season", "match_date"],
        limit,
    )

    ss = pd.to_numeric(df["season_start"], errors="coerce")
    season_text = df["season"].astype(str)
    bad_season_start = ss.isna()
    _mask_check(
        checks,
        "season_start_numeric",
        "critical",
        "season_start ausente o no numérico.",
        bad_season_start,
        df,
        ["match_id", "season", "season_start"],
        limit,
    )
    year = dates.dt.year
    season_ok = ss.notna() & dates.notna()

    hard_out = season_ok & ((year < ss - 2) | (year > ss + 2))
    _mask_check(
        checks,
        "date_season_hard_window",
        "critical",
        "Fecha a más de 2 años del inicio de temporada declarado.",
        hard_out,
        df,
        ["match_id", "div", "season", "season_start", "match_date"],
        limit,
    )
    contract_out = season_ok & ((year < ss - 1) | (year > ss + 1))
    _mask_check(
        checks,
        "date_season_contract_window",
        "warning",
        "Fecha fuera de la ventana ±1 año del contrato (revisar etiquetado).",
        contract_out,
        df,
        ["match_id", "div", "season", "season_start", "match_date", "home_team", "away_team"],
        limit,
    )

    # Ventana estricta por meses: jul-jun para competiciones europeas; año
    # natural para ligas de calendario. Las extensiones COVID de 2019/20 se
    # reportan como aviso, no como error.
    slash_season = season_text.str.contains("/", na=False)
    strict_out = pd.Series(False, index=df.index)
    unique_years = sorted(int(y) for y in ss.dropna().unique())
    lo_map = {y: f"{y}-07-01" for y in unique_years}
    hi_map = {y: f"{y + 1}-06-30" for y in unique_years}
    lo = pd.to_datetime(ss.astype("Int64").map(lo_map), errors="coerce")
    hi = pd.to_datetime(ss.astype("Int64").map(hi_map), errors="coerce")
    strict_out |= slash_season & season_ok & ((dates < lo) | (dates > hi))
    strict_out |= (~slash_season) & season_ok & (year != ss)
    _mask_check(
        checks,
        "date_strict_month_window",
        "warning",
        "Fecha fuera de la ventana mensual estricta (incluye extensiones COVID).",
        strict_out,
        df,
        ["match_id", "div", "season", "match_date"],
        limit,
    )

    global_bad = dates.notna() & ((dates < pd.Timestamp("1990-01-01")) | (dates > pd.Timestamp("2035-12-31")))
    _mask_check(
        checks,
        "date_global_bounds",
        "critical",
        "Fecha fuera de [1990-01-01, 2035-12-31].",
        global_bad,
        df,
        ["match_id", "div", "season", "match_date"],
        limit,
    )

    span_frame = pd.DataFrame({"div": df["div"], "season": df["season"], "d": dates})
    span = span_frame.groupby(["div", "season"], sort=True).agg(
        first=("d", "min"), last=("d", "max"), matches=("d", "size")
    )
    span["span_days"] = (span["last"] - span["first"]).dt.days
    span = span.reset_index()
    span_bad = span["span_days"] > 1095
    span_warn = (span["span_days"] > 400) & ~span_bad
    _check(
        checks,
        "date_season_span_critical",
        "critical",
        "Una división/temporada abarca más de 3 años.",
        int(span_bad.sum()),
        _records(span.loc[span_bad], ["div", "season", "first", "last", "span_days", "matches"], limit),
    )
    _check(
        checks,
        "date_season_span_warning",
        "warning",
        "Una división/temporada abarca más de 400 días (revisar etiquetado).",
        int(span_warn.sum()),
        _records(span.loc[span_warn], ["div", "season", "first", "last", "span_days", "matches"], limit),
    )

    sorted_ok = bool(
        df.groupby("div", sort=False)["match_date"]
        .apply(lambda values: values.is_monotonic_increasing)
        .all()
    )
    _check(
        checks,
        "dataset_sorted_by_div_date",
        "warning",
        "El dataset no está ordenado por división y fecha (el ETL lo garantiza).",
        0 if sorted_ok else 1,
        [],
    )

    # Estacionalidad / catálogo -------------------------------------------
    season_invalid = ~season_text.str.match(SEASON_RE, na=False)
    _mask_check(
        checks,
        "season_format_valid",
        "critical",
        "Etiqueta de temporada con formato distinto de YYYY/YY o YYYY.",
        season_invalid,
        df,
        ["match_id", "div", "season"],
        limit,
    )
    season_bare = ~slash_season
    _mask_check(
        checks,
        "season_format_contract",
        "warning",
        "Etiqueta de temporada de año natural (YYYY) en vez de YYYY/YY (contrato §2; ligas de calendario).",
        season_bare,
        df,
        ["match_id", "div", "season"],
        limit,
    )
    label_year = pd.to_numeric(season_text.str.slice(0, 4), errors="coerce")
    season_start_bad = season_ok & label_year.notna() & (label_year != ss)
    _mask_check(
        checks,
        "season_start_consistency",
        "critical",
        "season_start no coincide con el año de la etiqueta de temporada.",
        season_start_bad,
        df,
        ["match_id", "div", "season", "season_start"],
        limit,
    )

    league_bad = df.groupby("div", sort=True)["league"].nunique(dropna=False) > 1
    country_bad = df.groupby("div", sort=True)["country"].nunique(dropna=False) > 1
    catalog_bad = league_bad | country_bad
    _check(
        checks,
        "division_catalog_consistency",
        "critical",
        "Una división mapea a más de una liga o país.",
        int(catalog_bad.sum()),
        [{"div": str(d), "league_nunique": int(league_bad.get(d, 0)), "country_nunique": int(country_bad.get(d, 0))}
         for d in catalog_bad.index[:limit]],
    )
    source_bad = df["source"].nunique(dropna=True) != 1
    _check(
        checks,
        "source_constant",
        "warning",
        "El dataset contiene más de un valor en source.",
        0 if not source_bad else 1,
        [{"source": str(s)} for s in sorted(df["source"].dropna().unique())[:limit]],
    )

    # Archivo y fila de origen ---------------------------------------------
    src_file = df["source_season_file"].astype(str)
    main_file = src_file.str.startswith("mmz4281/")
    expected_season_by_path: Dict[str, Optional[str]] = {}
    expected_div_by_path: Dict[str, str] = {}
    for path in src_file.unique():
        text = str(path)
        if text.startswith("mmz4281/"):
            parts = text.split("/")
            if len(parts) >= 3:
                code = parts[1]
                filename = parts[2]
                expected_season_by_path[text] = "20" + code[:2] + "/" + code[2:]
                expected_div_by_path[text] = filename[:-4] if filename.endswith(".csv") else filename
            else:
                expected_season_by_path[text] = None
                expected_div_by_path[text] = ""
        else:
            filename = text.rsplit("/", 1)[-1]
            expected_season_by_path[text] = None
            expected_div_by_path[text] = filename[:-4] if filename.endswith(".csv") else filename
    expected_season = src_file.map(expected_season_by_path)
    expected_div = src_file.map(expected_div_by_path)
    div_text = df["div"].astype(str)
    file_bad = (main_file & ((expected_season != season_text) | (expected_div != div_text))) | (
        ~main_file & (expected_div != div_text)
    )
    _mask_check(
        checks,
        "source_file_consistency",
        "critical",
        "source_season_file no corresponde a la división/temporada declarada.",
        file_bad,
        df,
        ["match_id", "div", "season", "source_season_file"],
        limit,
    )
    source_row_bad = df["source_row"].isna() | (df["source_row"] < 1)
    _mask_check(
        checks,
        "source_row_positive",
        "critical",
        "source_row ausente o menor que 1.",
        source_row_bad,
        df,
        ["match_id", "source_season_file", "source_row"],
        limit,
    )
    row_dup = df.duplicated(["source_season_file", "source_row"], keep=False)
    _mask_check(
        checks,
        "source_row_unique",
        "warning",
        "Dos filas comparten archivo y número de fila de origen.",
        row_dup,
        df,
        ["match_id", "source_season_file", "source_row"],
        limit,
    )
    ingested = pd.to_datetime(df["ingested_at"], errors="coerce", utc=True)
    _mask_check(
        checks,
        "ingested_at_valid",
        "warning",
        "ingested_at ausente o no parseable como ISO-8601.",
        ingested.isna(),
        df,
        ["match_id", "ingested_at"],
        limit,
    )
    if all(c in df.columns for c in ("has_result", "has_close_odds", "has_open_odds", "has_shots")):
        flag_bad = (
            (df["has_result"].fillna(False).astype(bool) != df["result"].notna())
            | (df["has_close_odds"].fillna(False).astype(bool) != df["odds_close_b365_h"].notna())
            | (df["has_open_odds"].fillna(False).astype(bool) != df["odds_open_b365_h"].notna())
            | (df["has_shots"].fillna(False).astype(bool) != df["shots_home"].notna())
        )
        _mask_check(
            checks,
            "derived_flags_consistency",
            "warning",
            "Columnas has_* no coinciden con sus campos de origen.",
            flag_bad,
            df,
            ["match_id", "has_result", "has_close_odds", "has_open_odds", "has_shots"],
            limit,
        )

    # Identidad de partido / duplicados ------------------------------------
    match_id_missing = df["match_id"].isna() | (df["match_id"].astype(str).str.strip() == "")
    _mask_check(
        checks,
        "match_id_present",
        "critical",
        "match_id ausente.",
        match_id_missing,
        df,
        ["match_id", "div", "season", "match_date", "home_team", "away_team"],
        limit,
    )
    match_id_dup = df.duplicated("match_id", keep=False)
    _mask_check(
        checks,
        "match_id_unique",
        "critical",
        "match_id duplicado (viola la clave primaria del contrato).",
        match_id_dup,
        df,
        ["match_id", "div", "season", "match_date", "home_team", "away_team"],
        limit,
    )

    home_slug = _map_slug(df["home_team"])
    away_slug = _map_slug(df["away_team"])
    valid_id = dates.notna() & home_slug.ne("") & away_slug.ne("")
    ymd = (
        dates.dt.year.astype("Int64") * 10000
        + dates.dt.month.astype("Int64") * 100
        + dates.dt.day.astype("Int64")
    )
    expected_id = (
        df["div"].astype(str) + ":" + ymd.astype(str) + ":" + home_slug + ":" + away_slug
    )
    bad_id = valid_id & (expected_id != df["match_id"].astype(str))
    _mask_check(
        checks,
        "match_id_deterministic",
        "critical",
        "match_id no reproducible como div:YYYYMMDD:home_slug:away_slug.",
        bad_id,
        df,
        ["match_id", "div", "match_date", "home_team", "away_team"],
        limit,
    )

    # Clave de contenido: cualquier duplicado exacto de las 88 columnas comparte
    # estos campos; usar las 84 columnas restantes multiplica el coste sin
    # aportar detección adicional sobre `duplicate_fixture`.
    dup_cols = [
        "div", "match_date", "home_team", "away_team", "home_goals", "away_goals",
        "result", "ht_home_goals", "ht_away_goals", "ht_result", "source_season_file",
    ]
    exact_dup = df.duplicated(dup_cols, keep=False)
    _mask_check(
        checks,
        "duplicate_exact_rows",
        "critical",
        "Filas exactamente duplicadas (ignorando match_id/source_row/ingested_at).",
        exact_dup,
        df,
        ["match_id", "div", "match_date", "home_team", "away_team"],
        limit,
    )
    fixture_dup = df.duplicated(["div", "match_date", "home_team", "away_team"], keep=False)
    _mask_check(
        checks,
        "duplicate_fixture",
        "critical",
        "Mismo partido repetido con división, fecha y equipos idénticos.",
        fixture_dup,
        df,
        ["match_id", "div", "match_date", "home_team", "away_team"],
        limit,
    )
    pair = pd.DataFrame({
        "div": df["div"], "match_date": df["match_date"],
        "a": np.minimum(home_slug, away_slug), "b": np.maximum(home_slug, away_slug),
    })
    rev_dup = pair.duplicated(["div", "match_date", "a", "b"], keep=False)
    _mask_check(
        checks,
        "duplicate_reversed_fixture",
        "critical",
        "Mismo partido repetido con local/visitante invertidos en la misma fecha.",
        rev_dup,
        df,
        ["match_id", "div", "match_date", "home_team", "away_team"],
        limit,
    )

    team_long = pd.concat(
        [
            df[["div", "match_date", "home_team"]].rename(columns={"home_team": "team"}),
            df[["div", "match_date", "away_team"]].rename(columns={"away_team": "team"}),
        ],
        ignore_index=True,
    )
    team_long["slug"] = _map_slug(team_long["team"])
    twice = team_long.duplicated(["div", "match_date", "slug"], keep=False)
    _mask_check(
        checks,
        "team_twice_same_date",
        "critical",
        "Un equipo aparece dos veces en la misma fecha y división.",
        twice,
        team_long.assign(match_id=team_long["team"]),
        ["div", "match_date", "team"],
        limit,
    )

    core_home = _map_core(df["home_team"])
    core_away = _map_core(df["away_team"])
    core_pair = pd.DataFrame({
        "div": df["div"], "match_date": df["match_date"],
        "core_home": core_home.where(core_home.ne(""), home_slug),
        "core_away": core_away.where(core_away.ne(""), away_slug),
    })
    near_dup = core_pair.duplicated(["div", "match_date", "core_home", "core_away"], keep=False)
    _mask_check(
        checks,
        "near_duplicate_fixture",
        "critical",
        "Posible mismo partido con nombres de equipo variantes en la misma fecha.",
        near_dup,
        df,
        ["match_id", "div", "match_date", "home_team", "away_team"],
        limit,
    )
    cross_dup = df.duplicated(["match_date", "home_team", "away_team"], keep=False)
    _mask_check(
        checks,
        "cross_division_duplicate",
        "warning",
        "Mismo partido (fecha y equipos) en más de una división.",
        cross_dup,
        df,
        ["match_id", "div", "match_date", "home_team", "away_team"],
        limit,
    )

    # Equipos --------------------------------------------------------------
    home_empty = df["home_team"].isna() | (df["home_team"].astype(str).str.strip().eq(""))
    away_empty = df["away_team"].isna() | (df["away_team"].astype(str).str.strip().eq(""))
    _mask_check(
        checks,
        "team_name_empty",
        "critical",
        "Nombre de equipo local o visitante vacío.",
        home_empty | away_empty,
        df,
        ["match_id", "home_team", "away_team"],
        limit,
    )
    _mask_check(
        checks,
        "team_slug_empty",
        "critical",
        "El slug de algún equipo queda vacío.",
        home_slug.eq("") | away_slug.eq(""),
        df,
        ["match_id", "home_team", "away_team"],
        limit,
    )
    whitespace = (
        df["home_team"].astype(str).ne(df["home_team"].astype(str).str.strip())
        | df["away_team"].astype(str).ne(df["away_team"].astype(str).str.strip())
    )
    _mask_check(
        checks,
        "team_name_whitespace",
        "warning",
        "Nombre de equipo con espacios al inicio/final.",
        whitespace,
        df,
        ["match_id", "home_team", "away_team"],
        limit,
    )

    team_season = pd.concat(
        [
            df[["div", "season", "home_team"]].rename(columns={"home_team": "team"}),
            df[["div", "season", "away_team"]].rename(columns={"away_team": "team"}),
        ],
        ignore_index=True,
    ).drop_duplicates()
    team_season["slug"] = _map_slug(team_season["team"])
    team_season["core"] = _map_core(team_season["team"])
    slug_counts = (
        team_season.groupby(["div", "season", "slug"], sort=True)["team"]
        .nunique()
        .reset_index(name="n_names")
    )
    slug_alias = slug_counts[slug_counts["n_names"] > 1]
    _check(
        checks,
        "team_intra_season_alias",
        "warning",
        "Un mismo slug de equipo tiene varios nombres en la misma división/temporada.",
        int(len(slug_alias)),
        _records(slug_alias, ["div", "season", "slug", "n_names"], limit),
    )
    core_counts = (
        team_season.groupby(["div", "core"], sort=True)["team"]
        .nunique()
        .reset_index(name="n_names")
    )
    core_alias = core_counts[core_counts["n_names"] > 1]
    # Se añaden los nombres observados para que el aviso sea accionable.
    if len(core_alias):
        names = (
            team_season.groupby(["div", "core"], sort=True)["team"]
            .apply(lambda s: " | ".join(sorted(set(s))))
            .reset_index(name="names")
        )
        core_alias = core_alias.merge(names, on=["div", "core"], how="left")
    _check(
        checks,
        "team_alias_candidates",
        "warning",
        "Posibles alias de equipo por normalización (revisar; no fusionar automáticamente).",
        int(len(core_alias)),
        _records(core_alias, ["div", "core", "n_names", "names"], limit),
    )

    appearances = pd.concat(
        [
            df[["div", "season", "home_team"]].rename(columns={"home_team": "team"}),
            df[["div", "season", "away_team"]].rename(columns={"away_team": "team"}),
        ],
        ignore_index=True,
    )
    low_matches = (
        appearances.groupby(["div", "season", "team"], sort=True).size().reset_index(name="n_matches")
    )
    low_matches = low_matches[low_matches["n_matches"] <= 2]
    _check(
        checks,
        "team_season_low_matches",
        "warning",
        "Equipos con 1-2 partidos en una temporada (playoffs o partidos sueltos).",
        int(len(low_matches)),
        _records(low_matches, ["div", "season", "team", "n_matches"], limit),
    )

    # Resultado y goles ----------------------------------------------------
    result = df["result"]
    hg = df["home_goals"]
    ag = df["away_goals"]
    bad_result_domain = result.notna() & ~result.isin(["H", "D", "A"])
    _mask_check(
        checks,
        "result_domain",
        "critical",
        "result fuera de {H, D, A}.",
        bad_result_domain,
        df,
        ["match_id", "result", "home_goals", "away_goals"],
        limit,
    )
    result_no_goals = result.notna() & (hg.isna() | ag.isna())
    _mask_check(
        checks,
        "result_without_goals",
        "critical",
        "Hay result pero falta home_goals o away_goals.",
        result_no_goals,
        df,
        ["match_id", "result", "home_goals", "away_goals"],
        limit,
    )
    derived = pd.Series(
        np.select([hg > ag, hg == ag, hg < ag], ["H", "D", "A"], default=None),
        index=df.index,
    )
    mismatch = hg.notna() & ag.notna() & (result.isna() | (derived != result))
    _mask_check(
        checks,
        "result_consistency",
        "critical",
        "result no coincide con home_goals/away_goals.",
        mismatch,
        df,
        ["match_id", "result", "home_goals", "away_goals"],
        limit,
    )
    goals_bad = ((hg < 0) | (hg > 15) | (ag < 0) | (ag > 15))
    _mask_check(
        checks,
        "goals_range",
        "critical",
        "Goles fuera de [0, 15].",
        goals_bad,
        df,
        ["match_id", "home_goals", "away_goals"],
        limit,
    )
    goals_frac = ((hg.notna() & (hg % 1 != 0)) | (ag.notna() & (ag % 1 != 0)))
    _mask_check(
        checks,
        "goals_integer",
        "critical",
        "Goles no enteros.",
        goals_frac,
        df,
        ["match_id", "home_goals", "away_goals"],
        limit,
    )
    goals_null_bad = (hg.isna() != ag.isna()) | (result.isna() != (hg.isna() & ag.isna()))
    _mask_check(
        checks,
        "goals_null_consistency",
        "critical",
        "Inconsistencia entre nulos de goles y de result.",
        goals_null_bad,
        df,
        ["match_id", "result", "home_goals", "away_goals"],
        limit,
    )

    # Descanso -------------------------------------------------------------
    hth = df["ht_home_goals"]
    hta = df["ht_away_goals"]
    htr = df["ht_result"]
    ht_bad = ((hth < 0) | (hth > 15) | (hta < 0) | (hta > 15))
    _mask_check(
        checks,
        "ht_goals_range",
        "critical",
        "Goles al descanso fuera de [0, 15].",
        ht_bad,
        df,
        ["match_id", "ht_home_goals", "ht_away_goals"],
        limit,
    )
    htr_bad = htr.notna() & ~htr.isin(["H", "D", "A"])
    _mask_check(
        checks,
        "ht_result_domain",
        "critical",
        "ht_result fuera de {H, D, A}.",
        htr_bad,
        df,
        ["match_id", "ht_result"],
        limit,
    )
    ht_derived = pd.Series(
        np.select([hth > hta, hth == hta, hth < hta], ["H", "D", "A"], default=None),
        index=df.index,
    )
    ht_mismatch = hth.notna() & hta.notna() & (htr.isna() | (ht_derived != htr))
    _mask_check(
        checks,
        "ht_result_consistency",
        "critical",
        "ht_result no coincide con los goles al descanso.",
        ht_mismatch,
        df,
        ["match_id", "ht_home_goals", "ht_away_goals", "ht_result"],
        limit,
    )
    ht_gt_ft = (
        hth.notna() & hta.notna() & hg.notna() & ag.notna()
        & ((hth > hg) | (hta > ag))
    )
    _mask_check(
        checks,
        "ht_le_ft",
        "critical",
        "Goles al descanso mayores que los goles finales.",
        ht_gt_ft,
        df,
        ["match_id", "ht_home_goals", "ht_away_goals", "home_goals", "away_goals"],
        limit,
    )
    ht_without_ft = (hg.isna() | ag.isna()) & (hth.notna() | hta.notna())
    _mask_check(
        checks,
        "ht_without_ft",
        "warning",
        "Hay marcador de descanso pero no marcador final (partido abandonado/aplazado).",
        ht_without_ft,
        df,
        ["match_id", "div", "season", "match_date", "ht_home_goals", "ht_away_goals", "result"],
        limit,
    )
    total_goals = hg + ag
    _mask_check(
        checks,
        "goals_ge_10",
        "warning",
        "Partidos con 10 o más goles totales (válidos, pero atípicos).",
        total_goals.notna() & (total_goals >= 10),
        df,
        ["match_id", "div", "season", "match_date", "home_team", "away_team", "home_goals", "away_goals"],
        limit,
    )

    # Estadísticas de partido ---------------------------------------------
    stat_cols = [
        "shots_home", "shots_away", "sot_home", "sot_away", "corners_home",
        "corners_away", "fouls_home", "fouls_away", "yellows_home", "yellows_away",
        "reds_home", "reds_away",
    ]
    negative_stats = pd.Series(False, index=df.index)
    for col in stat_cols:
        negative_stats |= df[col] < 0
    _mask_check(
        checks,
        "stats_negative",
        "critical",
        "Estadística de partido negativa.",
        negative_stats,
        df,
        ["match_id"] + stat_cols,
        limit,
    )
    _mask_check(
        checks,
        "sot_gt_shots",
        "warning",
        "Tiros a puerta mayores que tiros totales.",
        (df["sot_home"] > df["shots_home"]) | (df["sot_away"] > df["shots_away"]),
        df,
        ["match_id", "div", "season", "match_date", "home_team", "away_team", "shots_home", "sot_home", "shots_away", "sot_away"],
        limit,
    )
    _mask_check(
        checks,
        "fouls_gt_60",
        "warning",
        "Faltas superiores a 60 (posible error de fuente).",
        (df["fouls_home"] > 60) | (df["fouls_away"] > 60),
        df,
        ["match_id", "div", "season", "match_date", "home_team", "away_team", "fouls_home", "fouls_away"],
        limit,
    )
    _mask_check(
        checks,
        "reds_gt_4",
        "warning",
        "Tarjetas rojas superiores a 4 (posible error de fuente).",
        (df["reds_home"] > 4) | (df["reds_away"] > 4),
        df,
        ["match_id", "div", "season", "match_date", "home_team", "away_team", "reds_home", "reds_away"],
        limit,
    )
    _mask_check(
        checks,
        "yellows_gt_12",
        "warning",
        "Tarjetas amarillas superiores a 12.",
        (df["yellows_home"] > 12) | (df["yellows_away"] > 12),
        df,
        ["match_id", "div", "season", "match_date", "home_team", "away_team", "yellows_home", "yellows_away"],
        limit,
    )

    # Cuotas --------------------------------------------------------------
    odds_cols = [c for c in ODDS_COLUMNS + TOTALS_COLUMNS if c in df.columns]
    le_one_examples: List[Dict[str, Any]] = []
    gt_1000_examples: List[Dict[str, Any]] = []
    nonfinite_examples: List[Dict[str, Any]] = []
    n_le_one = n_gt_1000 = n_nonfinite = 0
    index_values = df.index.to_numpy()
    for col in odds_cols:
        values = df[col].to_numpy(dtype="float64", copy=False)
        le_one = values <= 1.0  # NaN compara como False
        gt_1000 = values > 1000.0
        nonfinite = np.isinf(values)
        n_le_one += int(le_one.sum())
        n_gt_1000 += int(gt_1000.sum())
        n_nonfinite += int(nonfinite.sum())
        if le_one.any() and len(le_one_examples) < limit:
            for pos in np.flatnonzero(le_one)[: limit - len(le_one_examples)]:
                idx = index_values[pos]
                le_one_examples.append({
                    "match_id": _clean(df.at[idx, "match_id"]),
                    "column": col,
                    "value": _clean(float(values[pos])),
                })
        if gt_1000.any() and len(gt_1000_examples) < limit:
            for pos in np.flatnonzero(gt_1000)[: limit - len(gt_1000_examples)]:
                idx = index_values[pos]
                gt_1000_examples.append({
                    "match_id": _clean(df.at[idx, "match_id"]),
                    "column": col,
                    "value": _clean(float(values[pos])),
                })
        if nonfinite.any() and len(nonfinite_examples) < limit:
            for pos in np.flatnonzero(nonfinite)[: limit - len(nonfinite_examples)]:
                idx = index_values[pos]
                nonfinite_examples.append({
                    "match_id": _clean(df.at[idx, "match_id"]),
                    "column": col,
                    "value": str(values[pos]),
                })
    _check(
        checks,
        "odds_le_one",
        "critical",
        "Cuotas decimales <= 1.0 (imposibles).",
        n_le_one,
        le_one_examples,
    )
    _check(
        checks,
        "odds_gt_1000",
        "critical",
        "Cuotas decimales > 1000 (fuera de rango razonable).",
        n_gt_1000,
        gt_1000_examples,
    )
    _check(
        checks,
        "odds_nonfinite",
        "critical",
        "Cuotas infinitas o no finitas.",
        n_nonfinite,
        nonfinite_examples,
    )

    partial_examples: List[Dict[str, Any]] = []
    n_partial = 0
    for phase in ("open", "close"):
        for src in ODDS_SOURCES:
            cols = [f"odds_{phase}_{src}_{k}" for k in "hda"]
            n_present = df[cols].notna().sum(axis=1)
            mask = (n_present > 0) & (n_present < 3)
            n_partial += int(mask.sum())
            if mask.any() and len(partial_examples) < limit:
                for idx in df.index[mask][: limit - len(partial_examples)]:
                    partial_examples.append({
                        "match_id": _clean(df.at[idx, "match_id"]),
                        "phase": phase,
                        "source": src,
                        "present": int(n_present.at[idx]),
                    })
    _check(
        checks,
        "odds_partial_triple",
        "warning",
        "Triplete 1X2 incompleto (1 o 2 cuotas de 3) por fuente/fase.",
        n_partial,
        partial_examples,
    )

    crit_margin_examples: List[Dict[str, Any]] = []
    warn_margin_examples: List[Dict[str, Any]] = []
    n_margin_crit = n_margin_warn = 0
    for phase in ("open", "close"):
        for src in COHERENT_BOOKS:
            cols = [f"odds_{phase}_{src}_{k}" for k in "hda"]
            complete = df[cols].notna().all(axis=1)
            margin = (1.0 / df[cols]).sum(axis=1) - 1.0
            crit = complete & ((margin > 1.0) | (margin < -0.5))
            warn = complete & ~crit & (((margin > 0.5) & (margin <= 1.0)) | ((margin < -0.02) & (margin >= -0.5)))
            n_margin_crit += int(crit.sum())
            n_margin_warn += int(warn.sum())
            if crit.any() and len(crit_margin_examples) < limit:
                for idx in df.index[crit][: limit - len(crit_margin_examples)]:
                    crit_margin_examples.append({
                        "match_id": _clean(df.at[idx, "match_id"]),
                        "phase": phase, "source": src,
                        "overround": _clean(round(float(margin.at[idx]), 4)),
                    })
            if warn.any() and len(warn_margin_examples) < limit:
                for idx in df.index[warn][: limit - len(warn_margin_examples)]:
                    warn_margin_examples.append({
                        "match_id": _clean(df.at[idx, "match_id"]),
                        "phase": phase, "source": src,
                        "overround": _clean(round(float(margin.at[idx]), 4)),
                    })
    _check(
        checks,
        "overround_coherent_critical",
        "critical",
        "Margen de mercado absurdo en b365/PS/avg (overround > 100% o < -50%).",
        n_margin_crit,
        crit_margin_examples,
    )
    _check(
        checks,
        "overround_coherent_warning",
        "warning",
        "Margen de mercado fuera de rango en b365/PS/avg (overround > 50% o < -2%).",
        n_margin_warn,
        warn_margin_examples,
    )

    unreliable_examples: List[Dict[str, Any]] = []
    n_unreliable = 0
    for phase in ("open", "close"):
        for src in UNRELIABLE_BOOKS:
            cols = [f"odds_{phase}_{src}_{k}" for k in "hda"]
            complete = df[cols].notna().all(axis=1)
            margin = (1.0 / df[cols]).sum(axis=1) - 1.0
            bad = complete & ((margin < -0.02) | (margin > 0.5))
            n_unreliable += int(bad.sum())
            if bad.any() and len(unreliable_examples) < limit:
                for idx in df.index[bad][: limit - len(unreliable_examples)]:
                    unreliable_examples.append({
                        "match_id": _clean(df.at[idx, "match_id"]),
                        "phase": phase, "source": src,
                        "overround": _clean(round(float(margin.at[idx]), 4)),
                    })
    _check(
        checks,
        "overround_unreliable_books",
        "warning",
        "Márgenes anómalos en max/bf/bfe (max puede ser negativo por construcción; bfe tiene placeholders 1.01/1.04).",
        n_unreliable,
        unreliable_examples,
    )

    n_max_lt_avg = 0
    max_lt_avg_examples: List[Dict[str, Any]] = []
    for phase in ("open", "close"):
        for outcome in "hda":
            avg = df[f"odds_{phase}_avg_{outcome}"]
            mx = df[f"odds_{phase}_max_{outcome}"]
            bad = avg.notna() & mx.notna() & (mx < avg - 1e-9)
            n_max_lt_avg += int(bad.sum())
            if bad.any() and len(max_lt_avg_examples) < limit:
                for idx in df.index[bad][: limit - len(max_lt_avg_examples)]:
                    max_lt_avg_examples.append({
                        "match_id": _clean(df.at[idx, "match_id"]),
                        "phase": phase, "outcome": outcome,
                        "avg": _clean(avg.at[idx]), "max": _clean(mx.at[idx]),
                    })
    _check(
        checks,
        "max_lt_avg",
        "warning",
        "Cuota máxima menor que la media del mercado (imposible si max incluye avg).",
        n_max_lt_avg,
        max_lt_avg_examples,
    )

    jump_coherent = jump_bfe = jump_crit = 0
    jump_records: List[Dict[str, Any]] = []
    bfe_records: List[Dict[str, Any]] = []
    crit_records: List[Dict[str, Any]] = []
    for src in ODDS_SOURCES:
        for outcome in "hda":
            op = df[f"odds_open_{src}_{outcome}"]
            cl = df[f"odds_close_{src}_{outcome}"]
            both = op.notna() & cl.notna() & (op > 0) & (cl > 0)
            rel = cl / op - 1.0
            jump = both & (rel > 1.0)
            crit = both & (rel > 10.0)
            if src in COHERENT_BOOKS:
                jump_coherent += int(jump.sum())
                jump_crit += int(crit.sum())
                for idx in df.index[jump]:
                    jump_records.append({
                        "match_id": _clean(df.at[idx, "match_id"]),
                        "source": src, "outcome": outcome,
                        "open": _clean(op.at[idx]), "close": _clean(cl.at[idx]),
                        "rel": round(float(rel.at[idx]), 4),
                    })
                for idx in df.index[crit]:
                    crit_records.append({
                        "match_id": _clean(df.at[idx, "match_id"]),
                        "source": src, "outcome": outcome,
                        "open": _clean(op.at[idx]), "close": _clean(cl.at[idx]),
                        "rel": round(float(rel.at[idx]), 4),
                    })
            elif src == "bfe":
                jump_bfe += int(jump.sum())
                for idx in df.index[jump]:
                    bfe_records.append({
                        "match_id": _clean(df.at[idx, "match_id"]),
                        "source": src, "outcome": outcome,
                        "open": _clean(op.at[idx]), "close": _clean(cl.at[idx]),
                        "rel": round(float(rel.at[idx]), 4),
                    })
    jump_examples = sorted(jump_records, key=lambda d: (-d["rel"], d["match_id"]))[:limit]
    bfe_examples = sorted(bfe_records, key=lambda d: (-d["rel"], d["match_id"]))[:limit]
    crit_jump_examples = sorted(crit_records, key=lambda d: (-d["rel"], d["match_id"]))[:limit]
    _check(
        checks,
        "odds_jumps_coherent",
        "warning",
        "Saltos apertura->cierre >100% en b365/PS/avg.",
        jump_coherent,
        jump_examples,
    )
    _check(
        checks,
        "odds_jumps_bfe",
        "warning",
        "Saltos apertura->cierre >100% en BFE (placeholders de fuente).",
        jump_bfe,
        bfe_examples,
    )
    _check(
        checks,
        "odds_jumps_critical",
        "critical",
        "Saltos apertura->cierre >1000% en b365/PS/avg.",
        jump_crit,
        crit_jump_examples,
    )

    stale = 0
    stale_examples: List[Dict[str, Any]] = []
    cols = [f"odds_open_b365_{k}" for k in "hda"]
    close_cols = [f"odds_close_b365_{k}" for k in "hda"]
    complete = df[cols].notna().all(axis=1) & df[close_cols].notna().all(axis=1)
    same = complete & (df[cols].to_numpy() == df[close_cols].to_numpy()).all(axis=1)
    stale = int(same.sum())
    if same.any():
        for idx in df.index[same][:limit]:
            stale_examples.append({
                "match_id": _clean(df.at[idx, "match_id"]),
                "open": [ _clean(df.at[idx, c]) for c in cols],
                "close": [ _clean(df.at[idx, c]) for c in close_cols],
            })
    _check(
        checks,
        "stale_close_b365",
        "warning",
        "Cierre B365 idéntico a apertura en las tres cuotas.",
        stale,
        stale_examples,
    )

    # Totales --------------------------------------------------------------
    totals_partial = 0
    totals_partial_examples: List[Dict[str, Any]] = []
    totals_without = 0
    totals_without_examples: List[Dict[str, Any]] = []
    for phase in ("open", "close"):
        for src in TOTALS_SOURCES:
            over = df[f"totals_{phase}_{src}_over"]
            under = df[f"totals_{phase}_{src}_under"]
            partial = over.notna() ^ under.notna()
            totals_partial += int(partial.sum())
            if partial.any() and len(totals_partial_examples) < limit:
                for idx in df.index[partial][: limit - len(totals_partial_examples)]:
                    totals_partial_examples.append({
                        "match_id": _clean(df.at[idx, "match_id"]),
                        "phase": phase, "source": src,
                        "over": _clean(over.at[idx]), "under": _clean(under.at[idx]),
                    })
            one_src = "b365" if src == "b365" else ("ps" if src == "p" else src)
            one_cols = [f"odds_{phase}_{one_src}_{k}" for k in "hda"]
            without = over.notna() & under.notna() & ~df[one_cols].notna().all(axis=1)
            totals_without += int(without.sum())
            if without.any() and len(totals_without_examples) < limit:
                for idx in df.index[without][: limit - len(totals_without_examples)]:
                    totals_without_examples.append({
                        "match_id": _clean(df.at[idx, "match_id"]),
                        "phase": phase, "source": src,
                    })
    _check(
        checks,
        "totals_partial_pair",
        "warning",
        "Totales con over/under incompletos (solo una de las dos cuotas).",
        totals_partial,
        totals_partial_examples,
    )
    _check(
        checks,
        "totals_without_1x2",
        "warning",
        "Totales presentes sin el 1X2 completo de la misma fuente/fase.",
        totals_without,
        totals_without_examples,
    )

    totals_crit = totals_warn = 0
    totals_crit_examples: List[Dict[str, Any]] = []
    totals_warn_examples: List[Dict[str, Any]] = []
    for phase in ("open", "close"):
        for src in ("b365", "p", "avg"):
            over = df[f"totals_{phase}_{src}_over"]
            under = df[f"totals_{phase}_{src}_under"]
            complete = over.notna() & under.notna()
            margin = 1.0 / over + 1.0 / under - 1.0
            crit = complete & ((margin > 1.0) | (margin < -0.5))
            warn = complete & ~crit & (((margin > 0.5) & (margin <= 1.0)) | ((margin < -0.02) & (margin >= -0.5)))
            totals_crit += int(crit.sum())
            totals_warn += int(warn.sum())
            if crit.any() and len(totals_crit_examples) < limit:
                for idx in df.index[crit][: limit - len(totals_crit_examples)]:
                    totals_crit_examples.append({
                        "match_id": _clean(df.at[idx, "match_id"]),
                        "phase": phase, "source": src,
                        "overround": _clean(round(float(margin.at[idx]), 4)),
                    })
            if warn.any() and len(totals_warn_examples) < limit:
                for idx in df.index[warn][: limit - len(totals_warn_examples)]:
                    totals_warn_examples.append({
                        "match_id": _clean(df.at[idx, "match_id"]),
                        "phase": phase, "source": src,
                        "overround": _clean(round(float(margin.at[idx]), 4)),
                    })
    _check(
        checks,
        "totals_overround_critical",
        "critical",
        "Margen absurdo en totales b365/P/avg (overround > 100% o < -50%).",
        totals_crit,
        totals_crit_examples,
    )
    _check(
        checks,
        "totals_overround_warning",
        "warning",
        "Margen fuera de rango en totales b365/P/avg (overround > 50% o < -2%).",
        totals_warn,
        totals_warn_examples,
    )

    # Cobertura ------------------------------------------------------------
    coverage = _coverage(df)
    result_cov = coverage["by_division"]
    # Recalcula por división/temporada para el check mínimo.
    cov_rows: List[Dict[str, Any]] = []
    for (div, season), group in df.groupby(["div", "season"], sort=True):
        n = len(group)
        if n < 20:
            continue
        result_ratio = float(group["result"].notna().mean())
        goals_ratio = float(group[["home_goals", "away_goals"]].notna().all(axis=1).mean())
        odds_ratios = []
        for phase, src in (("open", "b365"), ("open", "ps"), ("close", "b365"), ("close", "ps"), ("close", "avg")):
            cols = [f"odds_{phase}_{src}_{k}" for k in "hda"]
            odds_ratios.append(float(group[cols].notna().all(axis=1).mean()))
        cov_rows.append({
            "div": str(div), "season": str(season), "matches": int(n),
            "result": round(result_ratio, 4), "goals": round(goals_ratio, 4),
            "best_odds": round(max(odds_ratios), 4),
        })
    cov_frame = pd.DataFrame(cov_rows)
    low_result = cov_frame[(cov_frame["result"] < 0.90) | (cov_frame["goals"] < 0.90)]
    _check(
        checks,
        "coverage_result_division_season",
        "critical",
        "Cobertura de resultado/goles < 90% en una división/temporada con >=20 partidos.",
        int(len(low_result)),
        _records(low_result, ["div", "season", "matches", "result", "goals"], limit),
    )
    low_odds = cov_frame[cov_frame["best_odds"] < 0.50]
    _check(
        checks,
        "coverage_odds_division_season",
        "warning",
        "Ninguna fuente 1X2 alcanza 50% en una división/temporada.",
        int(len(low_odds)),
        _records(low_odds, ["div", "season", "matches", "best_odds"], limit),
    )

    if dates.notna().any():
        dataset_max = dates.max()
        last = df.assign(_d=dates).groupby(["div", "season"], sort=True)["_d"].max().reset_index(name="last")
        last["in_progress"] = last["last"] >= (dataset_max - pd.Timedelta(days=90))
        in_progress = last[last["in_progress"]]
        _check(
            checks,
            "season_in_progress",
            "warning",
            "Temporada en curso: último partido a <=90 días del máximo del dataset.",
            int(len(in_progress)),
            _records(in_progress, ["div", "season", "last"], limit),
        )
    else:
        in_progress = pd.DataFrame()

    # Temporadas severamente cortas (excluye las que están en curso).
    # Se usa partidos por equipo (no partidos totales) para no confundir
    # cambios de tamaño de liga (18->16 equipos) con temporadas incompletas.
    team_counts = (
        appearances.groupby(["div", "season", "team"], sort=True)
        .size()
        .reset_index(name="n_team_matches")
    )
    league_teams = (
        team_counts[team_counts["n_team_matches"] >= 5]
        .groupby(["div", "season"], sort=True)
        .size()
        .reset_index(name="teams")
    )
    counts = (
        df.groupby(["div", "season"], sort=True)
        .size()
        .reset_index(name="matches")
        .merge(league_teams, on=["div", "season"], how="left")
    )
    counts["mpt"] = 2.0 * counts["matches"] / counts["teams"]
    counts["baseline_mpt"] = counts.groupby("div")["mpt"].transform(lambda s: s.quantile(0.90))
    counts["ratio"] = counts["mpt"] / counts["baseline_mpt"]
    in_progress_keys = set()
    if len(in_progress):
        in_progress_keys = set(map(tuple, in_progress[["div", "season"]].itertuples(index=False, name=None)))
    short = counts[
        (counts["ratio"] < 0.80)
        & (~counts.set_index(["div", "season"]).index.isin(in_progress_keys))
    ]
    _check(
        checks,
        "season_short_format",
        "warning",
        "Temporada con <80% de partidos por equipo respecto al p90 de su división (acortada o formato reducido).",
        int(len(short)),
        _records(short, ["div", "season", "matches", "teams", "mpt", "baseline_mpt", "ratio"], limit),
    )

    # Huecos de temporadas completas en divisiones principales. No se puede
    # recuperar desde el parquet, pero sí detectar que una división empieza
    # tarde o salta un año (p. ej., G1 2000/01-2004/05 no se ingirió por usar
    # cabeceras HT/AT en el crudo).
    if df["div"].nunique() >= 10:
        main_df = df[df["div"].isin(MAIN_DIVISIONS)]
        gaps: List[Dict[str, Any]] = []
        for div, group in main_df.groupby("div", sort=True):
            years = sorted({int(y) for y in group["season_start"].dropna().unique()})
            if not years:
                continue
            for year in range(2000, max(years) + 1):
                if year not in years:
                    gaps.append({"div": str(div), "missing_season_start": year})
        _check(
            checks,
            "season_history_gaps",
            "warning",
            "Faltan años de temporada en divisiones principales (posible pérdida de ingesta; comparar con el crudo).",
            len(gaps),
            gaps[:limit],
        )

    return _finish(df, data_path, checks, coverage=coverage)


# --------------------------------------------------------------------------- #
# Cierre del informe
# --------------------------------------------------------------------------- #
def _finish(
    df: pd.DataFrame,
    data_path: str,
    checks: List[Dict[str, Any]],
    coverage: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    for check in checks:
        if check["count"] > 0:
            check["status"] = "fail" if check["severity"] == "critical" else "warn"
        else:
            check["status"] = "pass"

    critical = [c for c in checks if c["status"] == "fail"]
    warnings = [c for c in checks if c["status"] == "warn"]
    exit_code = 1 if critical else 0

    date_values = pd.to_datetime(df.get("match_date"), errors="coerce") if "match_date" in df else pd.Series(dtype="datetime64[ns]")
    goals = None
    if {"home_goals", "away_goals"}.issubset(df.columns):
        total = pd.to_numeric(df["home_goals"], errors="coerce") + pd.to_numeric(df["away_goals"], errors="coerce")
        goals = {
            "mean_total": round(float(total.mean()), 4) if total.notna().any() else None,
            "mean_home": round(float(pd.to_numeric(df["home_goals"], errors="coerce").mean()), 4),
            "mean_away": round(float(pd.to_numeric(df["away_goals"], errors="coerce").mean()), 4),
            "matches_ge_10_total": int((total >= 10).sum()),
            "max_total": int(total.max()) if total.notna().any() else None,
        }

    report: Dict[str, Any] = {
        "dataset": {
            "path": str(data_path),
            "rows": int(len(df)),
            "columns": int(len(df.columns)),
            "rows_with_result": int(df["result"].notna().sum()) if "result" in df else None,
            "rows_with_goals": int(df[["home_goals", "away_goals"]].notna().all(axis=1).sum())
            if {"home_goals", "away_goals"}.issubset(df.columns) else None,
            "divisions": int(df["div"].nunique()) if "div" in df else None,
            "seasons": int(df["season"].nunique()) if "season" in df else None,
            "date_min": date_values.min().strftime("%Y-%m-%d") if date_values.notna().any() else None,
            "date_max": date_values.max().strftime("%Y-%m-%d") if date_values.notna().any() else None,
            "goals": goals,
        },
        "summary": {
            "checks": len(checks),
            "critical_failures": len(critical),
            "warning_checks": len(warnings),
            "critical_checks": [c["check_id"] for c in critical],
            "warning_check_ids": [c["check_id"] for c in warnings],
            "status": "pass" if exit_code == 0 else "fail",
            "exit_code": exit_code,
        },
        "checks": checks,
    }
    if coverage is not None:
        report["coverage"] = coverage
    return report


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def load_dataset(path: Path) -> pd.DataFrame:
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(str(path))
    suffix = path.suffix.lower()
    if suffix in (".parquet", ".pq"):
        return pd.read_parquet(path)
    if suffix == ".csv":
        return pd.read_csv(path, low_memory=False)
    raise ValueError(f"Extensión no soportada: {path.suffix}")


def print_summary(report: Dict[str, Any], report_path: Path) -> None:
    dataset = report["dataset"]
    summary = report["summary"]
    print("=" * 78)
    print("PitchLab · validación del dataset canónico")
    print("=" * 78)
    print(
        f"filas={dataset['rows']:,} · divisiones={dataset['divisions']} · "
        f"temporadas={dataset['seasons']} · fechas={dataset['date_min']}..{dataset['date_max']}"
    )
    if dataset.get("goals"):
        goals = dataset["goals"]
        print(
            f"goles/partido={goals['mean_total']} · local={goals['mean_home']} · "
            f"visitante={goals['mean_away']} · partidos >=10 goles={goals['matches_ge_10_total']}"
        )
    print("-" * 78)
    for check in report["checks"]:
        if check["status"] == "fail":
            print(f"[FAIL] {check['check_id']}: {check['count']} · {check['message']}")
            for example in check["examples"][:3]:
                print(f"       {example}")
        elif check["status"] == "warn":
            print(f"[WARN] {check['check_id']}: {check['count']} · {check['message']}")
    passed = sum(1 for c in report["checks"] if c["status"] == "pass")
    print("-" * 78)
    print(
        f"checks={summary['checks']} · OK={passed} · "
        f"avisos={summary['warning_checks']} · críticos={summary['critical_failures']}"
    )
    if summary["exit_code"] == 0:
        print("RESULTADO: APTO — 0 violaciones críticas; los avisos están documentados.")
    else:
        print("RESULTADO: NO APTO — hay violaciones críticas.")
    print(f"informe: {report_path}")


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Valida el dataset canónico matches.parquet.")
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA, help="ruta del parquet o CSV")
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT, help="ruta del JSON de salida")
    parser.add_argument("--max-examples", type=int, default=5, help="ejemplos por check")
    parser.add_argument("--quiet", action="store_true", help="no imprime el resumen")
    args = parser.parse_args(argv)

    try:
        df = load_dataset(args.data)
    except Exception as exc:  # pragma: no cover - depende del entorno
        print(f"ERROR: no se pudo leer {args.data}: {exc}", file=sys.stderr)
        return 2

    report = validate_dataframe(df, data_path=str(args.data), max_examples=args.max_examples)
    try:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        with open(args.report, "w", encoding="utf-8") as fh:
            json.dump(report, fh, ensure_ascii=False, indent=2, allow_nan=False)
    except Exception as exc:  # pragma: no cover
        print(f"ERROR: no se pudo escribir {args.report}: {exc}", file=sys.stderr)
        return 2

    if not args.quiet:
        print_summary(report, args.report)
    return int(report["summary"]["exit_code"])


if __name__ == "__main__":
    sys.exit(main())
