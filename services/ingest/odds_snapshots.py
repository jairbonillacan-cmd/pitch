"""Construcción unificada y auditoría de `odds_snapshots` (Agente A1 · Prediction Lab).

Unifica dos fuentes reales bajo contrato estricto anti-leakage:
  1. `historical_fd`: cuotas históricas `open` (`ts_event_start - 24h`) y `close` (`ts_event_start - 1s`)
     de `matches.parquet` (fútbol: 1X2, AH, O/U 2.5) y `nfl_games.parquet` + `data/nfl/raw/games.csv`
     (NFL: moneyline, spread, totals).
  2. `scraped_ws`: capturas reales fechadas (`captured_at_utc`) desde
     `../web-scraping/data/normalized/market_microstructure.json` (Pinnacle, Smarkets, Caliente,
     Codere, Action Network, etc.), descartando y contabilizando cualquier captura post-kickoff
     (`ts_captured > ts_event_start`) o registro sin evento/hora de inicio verificable.

Regla humana estricta de Cuota de Cierre:
  - `source == "historical_fd"`: ÚNICAMENTE el snapshot `close` de `book == "pinnacle"` con
    `ts_captured <= ts_event_start` (NUNCA `open` de Pinnacle, NUNCA `betfair_exchange` / `bfe`,
    NUNCA casas recreativas ni agregados `market_avg`/`market_max`/`nflverse`).
  - `source == "scraped_ws"`: último snapshot pre-partido (`ts_captured <= ts_event_start`) de
    `book == "pinnacle"`; fallback ÚNICAMENTE a `book == "smarkets"`; si faltan ambos,
    `closing_missing = True` (NUNCA rellenar con casas recreativas).

Uso CLI:
  .\\research\\prediction-lab\\.venv\\Scripts\\python.exe -m services.ingest.odds_snapshots
"""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import re
import sys
import unicodedata
from typing import Any, Mapping, Sequence

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Constantes públicas del contrato A1
# ---------------------------------------------------------------------------

REQUIRED_COLUMNS: tuple[str, ...] = (
    "event_id",
    "sport",
    "league",
    "market",
    "line",
    "selection",
    "book",
    "price_decimal",
    "ts_captured",
    "ts_event_start",
    "source",
)

AUXILIARY_COLUMNS: tuple[str, ...] = ("snapshot_stage",)
ALL_SNAPSHOT_COLUMNS: tuple[str, ...] = REQUIRED_COLUMNS + AUXILIARY_COLUMNS

DEDUP_KEY_COLUMNS: tuple[str, ...] = (
    "event_id",
    "market",
    "line",
    "selection",
    "book",
    "ts_captured",
    "source",
)

GAP_GROUP_COLUMNS: tuple[str, ...] = (
    "event_id",
    "market",
    "line",
    "book",
)

MIN_PRICE_DECIMAL: float = 1.01
MAX_PRICE_DECIMAL: float = 1000.0
MAX_GAP_MINUTES: float = 60.0

# Regla de plausibilidad de overround alineada 1:1 con `src/domain/prediction/devig.ts` (A13/A17)
MIN_OVERROUND: float = 0.9
MAX_OVERROUND: float = 1.2

SHARP_OVERROUND_ANCHOR: float = 0.0322
RECREATIONAL_OVERROUND_ANCHOR: float = 0.0662
EXTREME_SOFT_OVERROUND_ANCHOR: float = 0.118
MIN_ADAPTIVE_SHIN_WEIGHT: float = 0.12
RECREATIONAL_SHIN_WEIGHT: float = 0.85
MAX_ADAPTIVE_SHIN_WEIGHT: float = 0.96

SHARP_BOOKS_SCRAPED_FALLBACK_ORDER: tuple[str, ...] = ("pinnacle", "smarkets")
VALID_SNAPSHOT_STAGES: frozenset[str] = frozenset({"open", "intraday", "close"})

# Mapeo de casas en `matches.parquet` (`football-data.co.uk`)
SOCCER_1X2_BOOK_MAP: tuple[tuple[str, str], ...] = (
    ("ps", "pinnacle"),
    ("b365", "bet365"),
    ("bw", "bwin"),
    ("wh", "william_hill"),
    ("bf", "betfair_sportsbook"),
    ("bfe", "betfair_exchange"),
    ("avg", "market_avg"),
    ("max", "market_max"),
)

SOCCER_AH_BOOK_MAP: tuple[tuple[str, str], ...] = (
    ("p", "pinnacle"),
    ("b365", "bet365"),
    ("bfe", "betfair_exchange"),
    ("avg", "market_avg"),
    ("max", "market_max"),
)

SOCCER_TOTALS_BOOK_MAP: tuple[tuple[str, str], ...] = (
    ("p", "pinnacle"),
    ("b365", "bet365"),
    ("avg", "market_avg"),
    ("max", "market_max"),
)

ACTION_NETWORK_BOOK_ID_MAP: dict[str, str] = {
    "15": "action_consensus",
    "30": "action_open",
    "68": "draftkings",
    "69": "fanduel",
    "71": "betrivers",
    "75": "betmgm",
    "79": "bet365",
    "2724": "hardrock",
    "2988": "fanatics",
    "4620": "thescore_bet",
    "4727": "kalshi",
    "4795": "polymarket",
}

WS_LEAGUE_TO_CANONICAL: dict[str, tuple[str, str]] = {
    "nfl": ("nfl", "NFL"),
    "ncaaf": ("ncaaf", "NCAAF"),
    "nba": ("nba", "NBA"),
    "nhl": ("nhl", "NHL"),
    "mlb": ("mlb", "MLB"),
    "mls": ("football", "USA"),
    "epl": ("football", "E0"),
    "england-premier-league": ("football", "E0"),
    "premier league": ("football", "E0"),
    "laliga": ("football", "SP1"),
    "la liga": ("football", "SP1"),
    "spain-la-liga": ("football", "SP1"),
    "bundesliga": ("football", "D1"),
    "germany-bundesliga": ("football", "D1"),
    "serie-a": ("football", "I1"),
    "serie a": ("football", "I1"),
    "italy-serie-a": ("football", "I1"),
    "ligue-1": ("football", "F1"),
    "ligue 1": ("football", "F1"),
    "france-ligue-1": ("football", "F1"),
    "liga-mx": ("football", "MEX"),
    "liga mx": ("football", "MEX"),
    "mexico-liga-mx": ("football", "MEX"),
    "uefa-champions-league": ("football", "UCL"),
    "champions league": ("football", "UCL"),
}

PSEUDO_TEAM_LABELS: frozenset[str] = frozenset(
    {"over", "under", "yes", "no", "odd", "even", "home", "away", "draw"}
)

MARKET_REQUIRED_SELECTIONS: dict[str, tuple[str, ...]] = {
    "1x2": ("home", "draw", "away"),
    "moneyline": ("home", "away"),
    "ah": ("home", "away"),
    "spread": ("home", "away"),
    "totals": ("over", "under"),
}

WORKTREE_ROOT = Path(__file__).resolve().parents[2]
PRED_LAB_ROOT = WORKTREE_ROOT / "research" / "prediction-lab"
DEFAULT_MATCHES_PATH = PRED_LAB_ROOT / "data" / "processed" / "matches.parquet"
DEFAULT_NFL_GAMES_CANDIDATES: tuple[Path, ...] = (
    PRED_LAB_ROOT / "data" / "processed" / "nfl_games.parquet",
    PRED_LAB_ROOT / "data" / "nfl" / "processed" / "nfl_games.parquet",
)
DEFAULT_NFL_RAW_CSV = PRED_LAB_ROOT / "data" / "nfl" / "raw" / "games.csv"
DEFAULT_WS_MICROSTRUCTURE_PATH = (
    WORKTREE_ROOT.parent / "web-scraping" / "data" / "normalized" / "market_microstructure.json"
)
DEFAULT_WS_EDGE_MATRIX_PATH = (
    WORKTREE_ROOT.parent / "web-scraping" / "data" / "feature_store" / "live_matchups_edge_matrix.json"
)
DEFAULT_OUTPUT_PARQUET = PRED_LAB_ROOT / "data" / "processed" / "odds_snapshots.parquet"
DEFAULT_COVERAGE_JSON = WORKTREE_ROOT / "services" / "models" / "artifacts" / "odds_coverage_report.json"
DEFAULT_REPORT_MD = PRED_LAB_ROOT / "reports" / "A28_a1_odds_coverage.md"


# ---------------------------------------------------------------------------
# Utilidades puras de normalización y de-vig con paridad exacta frente a TS
# ---------------------------------------------------------------------------


def is_valid_price_decimal(price: Any) -> bool:
    """Valida que `price` sea finito y pertenezca al intervalo cerrado `[1.01, 1000.0]`."""
    if price is None or isinstance(price, bool):
        return False
    try:
        val = float(price)
    except (TypeError, ValueError):
        return False
    return math.isfinite(val) and (MIN_PRICE_DECIMAL <= val <= MAX_PRICE_DECIMAL)


def _normalize_line_scalar(line: Any) -> float:
    """Convierte `None`/`NaN` a `np.nan` y colapsa `-0.0` a `0.0`."""
    if line is None or isinstance(line, bool):
        return float("nan")
    try:
        val = float(line)
    except (TypeError, ValueError):
        return float("nan")
    if not math.isfinite(val):
        return float("nan")
    return 0.0 if val == 0.0 else val


def _to_utc_datetime(series: pd.Series) -> pd.Series:
    """Convierte cualquier serie temporal o ISO-8601 heterogénea (`Z`, `.000Z`, `+00:00`) a `datetime64[ns, UTC]`."""
    if isinstance(series.dtype, pd.DatetimeTZDtype):
        return series.dt.tz_convert("UTC")
    if pd.api.types.is_datetime64_dtype(series.dtype):
        return series.dt.tz_localize("UTC")
    return pd.to_datetime(series, format="ISO8601", utc=True, errors="coerce")


def _slugify_team(value: Any) -> str:
    if value is None:
        return ""
    norm = unicodedata.normalize("NFKD", str(value))
    ascii_txt = "".join(ch for ch in norm if not unicodedata.combining(ch)).lower()
    slug = re.sub(r"[^a-z0-9]+", "_", ascii_txt).strip("_")
    return slug


def _american_to_decimal_series(series: pd.Series) -> pd.Series:
    vals = pd.to_numeric(series, errors="coerce")
    out = pd.Series(np.nan, index=vals.index, dtype="float64")
    pos = vals >= 100.0
    neg = vals <= -100.0
    out.loc[pos] = 1.0 + (vals.loc[pos] / 100.0)
    out.loc[neg] = 1.0 + (100.0 / vals.loc[neg].abs())
    return out


def _smoothstep01_vec(u: np.ndarray) -> np.ndarray:
    t = np.clip(u, 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def _compute_adaptive_shin_weight_vec(overround_vals: np.ndarray) -> np.ndarray:
    r = np.asarray(overround_vals, dtype="float64")
    out = np.full_like(r, MIN_ADAPTIVE_SHIN_WEIGHT)
    mid_mask = np.isfinite(r) & (r > SHARP_OVERROUND_ANCHOR) & (r < RECREATIONAL_OVERROUND_ANCHOR)
    if np.any(mid_mask):
        span = max(1e-9, RECREATIONAL_OVERROUND_ANCHOR - SHARP_OVERROUND_ANCHOR)
        s = _smoothstep01_vec((r[mid_mask] - SHARP_OVERROUND_ANCHOR) / span)
        out[mid_mask] = MIN_ADAPTIVE_SHIN_WEIGHT + (RECREATIONAL_SHIN_WEIGHT - MIN_ADAPTIVE_SHIN_WEIGHT) * s
    hi_mask = np.isfinite(r) & (r >= RECREATIONAL_OVERROUND_ANCHOR)
    if np.any(hi_mask):
        span_ext = max(1e-9, EXTREME_SOFT_OVERROUND_ANCHOR - RECREATIONAL_OVERROUND_ANCHOR)
        s_ext = _smoothstep01_vec((r[hi_mask] - RECREATIONAL_OVERROUND_ANCHOR) / span_ext)
        out[hi_mask] = RECREATIONAL_SHIN_WEIGHT + (MAX_ADAPTIVE_SHIN_WEIGHT - RECREATIONAL_SHIN_WEIGHT) * s_ext
    return out


def _solve_power_matrix(odds_mat: np.ndarray, tolerance: float = 1e-12) -> np.ndarray:
    """Bisección vectorizada idéntica a `solvePowerCore` en `src/domain/prediction/devig.ts`."""
    q = 1.0 / odds_mat
    n = q.shape[0]
    if n == 0:
        return np.empty_like(q)
    lo = np.full(n, 1e-6, dtype="float64")
    hi = np.full(n, 5.0, dtype="float64")
    alpha = np.ones(n, dtype="float64")
    active = np.ones(n, dtype=bool)
    for _ in range(200):
        if not np.any(active):
            break
        alpha_cand = 0.5 * (lo[active] + hi[active])
        alpha[active] = alpha_cand
        s = np.sum(np.power(q[active], alpha_cand[:, None]), axis=1)
        done = np.abs(s - 1.0) <= tolerance
        act_idx = np.flatnonzero(active)
        still_idx = act_idx[~done]
        s_still = s[~done]
        alpha_still = alpha_cand[~done]
        gt = s_still > 1.0
        lo[still_idx[gt]] = alpha_still[gt]
        hi[still_idx[~gt]] = alpha_still[~gt]
        active[act_idx[done]] = False
    p = np.power(q, alpha[:, None])
    return p / np.sum(p, axis=1, keepdims=True)


def _solve_shin_matrix(odds_mat: np.ndarray, tolerance: float = 1e-12) -> np.ndarray:
    """Bisección vectorizada idéntica a `solveShinCore` en `src/domain/prediction/devig.ts`."""
    q = 1.0 / odds_mat
    n = q.shape[0]
    if n == 0:
        return np.empty_like(q)
    q_sum = np.sum(q, axis=1, keepdims=True)
    lo = np.zeros(n, dtype="float64")
    hi = np.full(n, 0.5, dtype="float64")
    z = np.zeros(n, dtype="float64")
    active = np.ones(n, dtype=bool)

    for _ in range(200):
        if not np.any(active):
            break
        z_cand = 0.5 * (lo[active] + hi[active])
        z[active] = z_cand
        z_col = z_cand[:, None]
        q_act = q[active]
        qs_act = q_sum[active]
        inside = z_col * z_col + (4.0 * (1.0 - z_col) * q_act * q_act) / qs_act
        probs = (np.sqrt(np.maximum(inside, 0.0)) - z_col) / (2.0 * (1.0 - z_col))
        s = np.sum(probs, axis=1)
        done = np.abs(s - 1.0) <= tolerance
        act_idx = np.flatnonzero(active)
        still_idx = act_idx[~done]
        s_still = s[~done]
        z_still = z_cand[~done]
        gt = s_still > 1.0
        lo[still_idx[gt]] = z_still[gt]
        hi[still_idx[~gt]] = z_still[~gt]
        active[act_idx[done]] = False

    z_col = z[:, None]
    inside = z_col * z_col + (4.0 * (1.0 - z_col) * q * q) / q_sum
    p = (np.sqrt(np.maximum(inside, 0.0)) - z_col) / (2.0 * (1.0 - z_col))
    return p / np.sum(p, axis=1, keepdims=True)


def _devig_matrix(odds_mat: np.ndarray, method: str = "power", tolerance: float = 1e-12) -> np.ndarray:
    """Aplica de-vig vectorizado sobre una matriz `(N, K)` ya validada en `[MIN_OVERROUND, MAX_OVERROUND]`."""
    if odds_mat.shape[0] == 0:
        return np.empty_like(odds_mat)
    if method == "proportional":
        q = 1.0 / odds_mat
        return q / np.sum(q, axis=1, keepdims=True)
    if method == "power":
        return _solve_power_matrix(odds_mat, tolerance=tolerance)
    if method == "shin":
        return _solve_shin_matrix(odds_mat, tolerance=tolerance)
    if method == "adaptive":
        q = 1.0 / odds_mat
        overround_vals = np.sum(q, axis=1) - 1.0
        w_shin = _compute_adaptive_shin_weight_vec(overround_vals)[:, None]
        p_pow = _solve_power_matrix(odds_mat, tolerance=tolerance)
        p_shi = _solve_shin_matrix(odds_mat, tolerance=tolerance)
        raw = (1.0 - w_shin) * p_pow + w_shin * p_shi
        return raw / np.sum(raw, axis=1, keepdims=True)
    raise ValueError(f"Método de de-vig desconocido: {method!r}")


def devig_market_prices(
    selection_prices: Mapping[str, float],
    market: str,
    method: str = "power",
    tolerance: float = 1e-12,
) -> dict[str, Any]:
    """Calcula probabilidades y cuotas justas sin margen para un mercado individual.

    Lanza `ValueError` si faltan selecciones, si alguna cuota es `<= 1.0` o fuera de
    `[1.01, 1000.0]`, o si `Σ(1/cuota)` cae fuera de `[0.9, 1.2]` (paridad con `devig.ts`).
    """
    m_norm = str(market or "").strip().lower()
    req_sels = MARKET_REQUIRED_SELECTIONS.get(m_norm)
    if req_sels is None:
        raise ValueError(f"Mercado no soportado para de-vig: {market!r}")

    prices_arr: list[float] = []
    for sel in req_sels:
        raw_p = selection_prices.get(sel)
        if not is_valid_price_decimal(raw_p):
            raise ValueError(f"Cuota inválida o faltante para selección {sel!r}: {raw_p!r}")
        prices_arr.append(float(raw_p))

    mat = np.asarray([prices_arr], dtype="float64")
    sum_implied = float(np.sum(1.0 / mat[0]))
    if sum_implied < MIN_OVERROUND or sum_implied > MAX_OVERROUND:
        raise ValueError(
            f"Σ(1/cuota) implausible ({sum_implied:.4f}); se acepta [{MIN_OVERROUND}, {MAX_OVERROUND}]"
        )

    probs = _devig_matrix(mat, method=method, tolerance=tolerance)[0]
    fair_prices = 1.0 / probs
    return {
        "market": m_norm,
        "method": method,
        "overround": sum_implied - 1.0,
        "probabilities": {sel: float(probs[i]) for i, sel in enumerate(req_sels)},
        "fair_prices": {sel: float(fair_prices[i]) for i, sel in enumerate(req_sels)},
    }


# ---------------------------------------------------------------------------
# Validación, deduplicación y detección de huecos > 60 min
# ---------------------------------------------------------------------------


def validate_and_deduplicate_snapshots(
    df: pd.DataFrame | Sequence[Mapping[str, Any]],
) -> tuple[pd.DataFrame, dict[str, int]]:
    """Valida esquema, rango `[1.01, 1000.0]`, pre-kickoff (`ts_captured <= ts_event_start`) y deduplica.

    Clave natural exacta de deduplicación:
      `(event_id, market, line, selection, book, ts_captured, source)`
    """
    work = df.copy() if isinstance(df, pd.DataFrame) else pd.DataFrame(list(df))
    n_raw = int(len(work))

    if n_raw == 0:
        empty = pd.DataFrame(columns=list(ALL_SNAPSHOT_COLUMNS))
        empty["line"] = empty["line"].astype("float64")
        empty["price_decimal"] = empty["price_decimal"].astype("float64")
        empty["ts_captured"] = pd.to_datetime(empty["ts_captured"], utc=True)
        empty["ts_event_start"] = pd.to_datetime(empty["ts_event_start"], utc=True)
        return empty, {
            "n_raw": 0,
            "n_missing_required": 0,
            "n_out_of_range": 0,
            "n_post_kickoff_discarded": 0,
            "n_duplicates_removed": 0,
            "n_valid": 0,
        }

    missing_cols = [col for col in REQUIRED_COLUMNS if col not in work.columns]
    if missing_cols:
        raise ValueError(f"Faltan columnas requeridas en odds_snapshots: {missing_cols}")

    if "snapshot_stage" not in work.columns:
        work["snapshot_stage"] = np.where(work["source"] == "scraped_ws", "intraday", None)

    # 1. Campos obligatorios no vacíos y timestamps parseables
    str_cols = ("event_id", "sport", "league", "market", "selection", "book", "source")
    req_mask = pd.Series(True, index=work.index)
    for col in str_cols:
        s = work[col]
        req_mask &= s.notna() & (s.astype(str).str.strip() != "")

    ts_cap = _to_utc_datetime(work["ts_captured"])
    ts_start = _to_utc_datetime(work["ts_event_start"])
    req_mask &= ts_cap.notna() & ts_start.notna()

    n_missing_required = int((~req_mask).sum())
    work = work.loc[req_mask].copy()
    ts_cap = ts_cap.loc[req_mask]
    ts_start = ts_start.loc[req_mask]
    work["ts_captured"] = ts_cap
    work["ts_event_start"] = ts_start

    # Normalizar tipos numéricos y colapsar `-0.0 -> 0.0` en `line`
    line_num = pd.to_numeric(work["line"], errors="coerce").astype("float64")
    line_num = line_num.where(~np.isinf(line_num), np.nan)
    line_num = line_num.mask(line_num == 0.0, 0.0)
    work["line"] = line_num

    price_num = pd.to_numeric(work["price_decimal"], errors="coerce").astype("float64")
    work["price_decimal"] = price_num

    # 2. Rango estricto `[1.01, 1000.0]`
    range_mask = (
        np.isfinite(price_num.to_numpy(dtype="float64", na_value=np.nan))
        & (price_num >= MIN_PRICE_DECIMAL)
        & (price_num <= MAX_PRICE_DECIMAL)
    )
    n_out_of_range = int((~range_mask).sum())
    work = work.loc[range_mask].copy()

    # 3. Anti-leakage pre-partido: descartar `ts_captured > ts_event_start`
    pre_match_mask = work["ts_captured"] <= work["ts_event_start"]
    n_post_kickoff_discarded = int((~pre_match_mask).sum())
    work = work.loc[pre_match_mask].copy()

    # Normalización limpia de strings clave antes de deduplicar
    for col in ("event_id", "sport", "league", "source"):
        work[col] = work[col].astype(str).str.strip()
    for col in ("market", "selection", "book"):
        work[col] = work[col].astype(str).str.strip().str.lower()

    # Inferir `snapshot_stage` cuando sea nulo sin romper las 11 columnas requeridas
    stage_raw = work["snapshot_stage"]
    missing_stage = stage_raw.isna() | (~stage_raw.isin(VALID_SNAPSHOT_STAGES))
    if missing_stage.any():
        delta_sec = (work.loc[missing_stage, "ts_event_start"] - work.loc[missing_stage, "ts_captured"]).dt.total_seconds()
        inferred = np.where(
            work.loc[missing_stage, "source"] == "scraped_ws",
            "intraday",
            np.where(delta_sec <= 3600.0, "close", "open"),
        )
        work.loc[missing_stage, "snapshot_stage"] = inferred
    work["snapshot_stage"] = work["snapshot_stage"].astype(str)

    # 4. Deduplicación exacta por clave natural `(event_id, market, line, selection, book, ts_captured, source)`
    before_dedup = int(len(work))
    work = work.drop_duplicates(subset=list(DEDUP_KEY_COLUMNS), keep="first")
    n_duplicates_removed = before_dedup - int(len(work))

    work = (
        work.loc[:, list(ALL_SNAPSHOT_COLUMNS)]
        .sort_values(["source", "ts_event_start", "event_id", "market", "book", "ts_captured", "selection"], kind="mergesort")
        .reset_index(drop=True)
    )

    stats = {
        "n_raw": n_raw,
        "n_missing_required": n_missing_required,
        "n_out_of_range": n_out_of_range,
        "n_post_kickoff_discarded": n_post_kickoff_discarded,
        "n_duplicates_removed": n_duplicates_removed,
        "n_valid": int(len(work)),
    }
    return work, stats


def detect_snapshot_gaps(
    df: pd.DataFrame | Sequence[Mapping[str, Any]],
    max_gap_minutes: float = MAX_GAP_MINUTES,
) -> pd.DataFrame:
    """Detecta huecos estrictamente mayores a `max_gap_minutes` (`> 60 min`) entre capturas consecutivas.

    Agrupa por `(event_id, market, line, book)` sobre los instantes únicos de captura `ts_captured`
    cuando existen `>= 2` capturas distintas para esa combinación.
    """
    out_cols = [
        "event_id",
        "source",
        "sport",
        "league",
        "market",
        "line",
        "book",
        "n_captures",
        "prev_ts_captured",
        "next_ts_captured",
        "gap_minutes",
    ]
    work = df.copy() if isinstance(df, pd.DataFrame) else pd.DataFrame(list(df))
    if len(work) == 0:
        return pd.DataFrame(columns=out_cols)

    work["ts_captured"] = _to_utc_datetime(work["ts_captured"])
    work["line"] = pd.to_numeric(work["line"], errors="coerce").astype("float64")
    work["line"] = work["line"].mask(work["line"] == 0.0, 0.0)

    # Colapsar selecciones simultáneas de una misma captura `(event_id, market, line, book, ts_captured)`
    captures = (
        work.loc[:, ["event_id", "source", "sport", "league", "market", "line", "book", "ts_captured"]]
        .drop_duplicates(subset=["event_id", "market", "line", "book", "ts_captured"], keep="first")
        .copy()
    )
    if len(captures) < 2:
        return pd.DataFrame(columns=out_cols)

    # Centinela numérico para agrupar `line = NaN` de forma exacta y ultrarrápida en C/Pandas
    captures["_line_key"] = captures["line"].fillna(-999999.125)
    group_cols = ["event_id", "market", "_line_key", "book"]
    captures = captures.sort_values(group_cols + ["ts_captured"], kind="mergesort").reset_index(drop=True)

    grp = captures.groupby(group_cols, sort=False)
    n_caps = grp["ts_captured"].transform("size")
    multi_mask = n_caps >= 2
    if not multi_mask.any():
        return pd.DataFrame(columns=out_cols)

    sub = captures.loc[multi_mask].copy()
    sub["n_captures"] = n_caps.loc[multi_mask].to_numpy()
    sub_grp = sub.groupby(group_cols, sort=False)
    sub["prev_ts_captured"] = sub_grp["ts_captured"].shift(1)
    sub["next_ts_captured"] = sub["ts_captured"]
    sub["gap_minutes"] = (sub["next_ts_captured"] - sub["prev_ts_captured"]).dt.total_seconds() / 60.0

    flagged = sub.loc[sub["gap_minutes"].notna() & (sub["gap_minutes"] > (max_gap_minutes + 1e-9)), out_cols].copy()
    return flagged.reset_index(drop=True)


# ---------------------------------------------------------------------------
# Resolución ESTRICTA de Cuota de Cierre + Probabilidad/Precio sin margen
# ---------------------------------------------------------------------------


def resolve_closing_odds(
    df: pd.DataFrame | Sequence[Mapping[str, Any]],
    devig_method: str = "power",
) -> pd.DataFrame:
    """Resuelve de forma vectorizada la cuota de cierre sharp por `(event_id, source, market, line)`.

    Reglas estrictas (decisión humana confirmada):
      - `source == "historical_fd"`:
          ÚNICAMENTE el snapshot `close` de `book == "pinnacle"` con `ts_captured <= ts_event_start`.
          NUNCA usa `open` de Pinnacle, NUNCA `betfair_exchange` (`bfe`), NUNCA casas recreativas ni
          consensos (`market_avg`, `market_max`, `nflverse`).
      - `source == "scraped_ws"`:
          Último snapshot pre-partido (`ts_captured <= ts_event_start`) de `book == "pinnacle"`;
          fallback ÚNICAMENTE al último snapshot pre-partido de `book == "smarkets"`.
          NUNCA rellena con casas recreativas (`caliente`, `codere`, `bet365`, `draftkings`, etc.).
    """
    base_cols = [
        "event_id",
        "source",
        "sport",
        "league",
        "market",
        "line",
        "ts_event_start",
        "closing_missing",
        "closing_book",
        "ts_closing",
        "missing_reason",
        "closing_overround",
        "price_closing_home",
        "price_closing_draw",
        "price_closing_away",
        "price_closing_over",
        "price_closing_under",
        "p_closing_novig_home",
        "p_closing_novig_draw",
        "p_closing_novig_away",
        "p_closing_novig_over",
        "p_closing_novig_under",
        "price_closing_novig_home",
        "price_closing_novig_draw",
        "price_closing_novig_away",
        "price_closing_novig_over",
        "price_closing_novig_under",
    ]
    work = df.copy() if isinstance(df, pd.DataFrame) else pd.DataFrame(list(df))
    if len(work) == 0:
        return pd.DataFrame(columns=base_cols)

    work["ts_captured"] = _to_utc_datetime(work["ts_captured"])
    work["ts_event_start"] = _to_utc_datetime(work["ts_event_start"])
    work["line"] = pd.to_numeric(work["line"], errors="coerce").astype("float64")
    work["line"] = work["line"].mask(work["line"] == 0.0, 0.0)
    work["price_decimal"] = pd.to_numeric(work["price_decimal"], errors="coerce").astype("float64")
    work["market"] = work["market"].astype(str).str.strip().str.lower()
    work["selection"] = work["selection"].astype(str).str.strip().str.lower()
    work["book"] = work["book"].astype(str).str.strip().str.lower()
    work["source"] = work["source"].astype(str).str.strip()
    work["_line_key"] = work["line"].fillna(-999999.125)

    # Universo completo de mercados presentes en el dataset
    mkt_key_cols = ["event_id", "source", "market", "_line_key"]
    universe = (
        work.loc[:, ["event_id", "source", "sport", "league", "market", "line", "_line_key", "ts_event_start"]]
        .drop_duplicates(subset=mkt_key_cols, keep="first")
        .sort_values(["source", "ts_event_start", "event_id", "market", "_line_key"], kind="mergesort")
        .reset_index(drop=True)
    )

    # Filtrar candidatos válidos pre-partido en `[1.01, 1000.0]`
    valid_cand_mask = (
        work["ts_captured"].notna()
        & work["ts_event_start"].notna()
        & (work["ts_captured"] <= work["ts_event_start"])
        & np.isfinite(work["price_decimal"].to_numpy(dtype="float64", na_value=np.nan))
        & (work["price_decimal"] >= MIN_PRICE_DECIMAL)
        & (work["price_decimal"] <= MAX_PRICE_DECIMAL)
    )
    cands = work.loc[valid_cand_mask].copy()

    # Regla estricta por fuente:
    # 1) En `historical_fd`, SOLO `book == "pinnacle"` y etapa `close` (si `snapshot_stage` está presente
    #    exige `== "close"`; si no está presente, exige `ts_event_start - ts_captured <= 3600s` para jamás
    #    tomar el `open` de `-24h` como cierre).
    has_stage_col = "snapshot_stage" in cands.columns
    if has_stage_col:
        st_series = cands["snapshot_stage"]
        has_explicit_stage = st_series.notna() & st_series.astype(str).isin(VALID_SNAPSHOT_STAGES)
        delta_sec = (cands["ts_event_start"] - cands["ts_captured"]).dt.total_seconds()
        is_hist_close = np.where(
            has_explicit_stage,
            st_series.astype(str) == "close",
            delta_sec <= 3600.0,
        )
    else:
        delta_sec = (cands["ts_event_start"] - cands["ts_captured"]).dt.total_seconds()
        is_hist_close = (delta_sec <= 3600.0).to_numpy()

    hist_ok = (cands["source"] == "historical_fd") & (cands["book"] == "pinnacle") & is_hist_close
    ws_ok = (cands["source"] == "scraped_ws") & cands["book"].isin(SHARP_BOOKS_SCRAPED_FALLBACK_ORDER)
    sharp_cands = cands.loc[hist_ok | ws_ok].copy()

    # Inicializar columnas resultado en `universe`
    n_u = len(universe)
    universe["closing_missing"] = True
    universe["closing_book"] = None
    universe["ts_closing"] = pd.NaT
    universe["ts_closing"] = pd.to_datetime(universe["ts_closing"], utc=True)
    universe["missing_reason"] = np.where(
        universe["source"] == "historical_fd",
        "missing_pinnacle_close",
        "missing_pinnacle_and_smarkets",
    )
    float_cols = [
        "closing_overround",
        "price_closing_home",
        "price_closing_draw",
        "price_closing_away",
        "price_closing_over",
        "price_closing_under",
        "p_closing_novig_home",
        "p_closing_novig_draw",
        "p_closing_novig_away",
        "p_closing_novig_over",
        "p_closing_novig_under",
        "price_closing_novig_home",
        "price_closing_novig_draw",
        "price_closing_novig_away",
        "price_closing_novig_over",
        "price_closing_novig_under",
    ]
    for fc in float_cols:
        universe[fc] = np.full(n_u, np.nan, dtype="float64")

    if len(sharp_cands) == 0:
        return universe.loc[:, base_cols]

    # Para cada `(event_id, source, market, _line_key, book)`, tomar el último `ts_captured`
    bk_key_cols = ["event_id", "source", "market", "_line_key", "book"]
    max_ts_per_book = sharp_cands.groupby(bk_key_cols, sort=False)["ts_captured"].transform("max")
    latest_sharp = sharp_cands.loc[sharp_cands["ts_captured"] == max_ts_per_book].copy()
    latest_sharp = latest_sharp.drop_duplicates(subset=bk_key_cols + ["selection"], keep="last")

    # Resolver libro por prioridad: `"pinnacle"` primero, luego `"smarkets"` (solo en `scraped_ws`)
    resolved_frames: list[pd.DataFrame] = []
    invalid_overround_keys: set[tuple[Any, ...]] = set()

    for book_name in ("pinnacle", "smarkets"):
        bk_rows = latest_sharp.loc[latest_sharp["book"] == book_name]
        if len(bk_rows) == 0:
            continue

        for mkt_name, req_sels in MARKET_REQUIRED_SELECTIONS.items():
            m_rows = bk_rows.loc[bk_rows["market"] == mkt_name]
            if len(m_rows) == 0:
                continue

            piv = m_rows.pivot(
                index=["event_id", "source", "market", "_line_key", "ts_captured"],
                columns="selection",
                values="price_decimal",
            )
            if not all(sel in piv.columns for sel in req_sels):
                for idx_tup in piv.index:
                    invalid_overround_keys.add((idx_tup[0], idx_tup[1], idx_tup[2], idx_tup[3]))
                continue

            piv = piv.loc[:, list(req_sels)].copy()
            complete_mask = piv.notna().all(axis=1)
            for idx_tup in piv.index[~complete_mask]:
                invalid_overround_keys.add((idx_tup[0], idx_tup[1], idx_tup[2], idx_tup[3]))

            piv_ok = piv.loc[complete_mask]
            if len(piv_ok) == 0:
                continue

            odds_mat = piv_ok.to_numpy(dtype="float64")
            sum_imp = np.sum(1.0 / odds_mat, axis=1)
            plausible_mask = (sum_imp >= MIN_OVERROUND) & (sum_imp <= MAX_OVERROUND)
            for idx_tup in piv_ok.index[~plausible_mask]:
                invalid_overround_keys.add((idx_tup[0], idx_tup[1], idx_tup[2], idx_tup[3]))

            if not np.any(plausible_mask):
                continue

            piv_valid = piv_ok.loc[plausible_mask].reset_index()
            valid_mat = odds_mat[plausible_mask]
            probs_mat = _devig_matrix(valid_mat, method=devig_method)
            fair_mat = 1.0 / probs_mat
            over_arr = sum_imp[plausible_mask] - 1.0

            chunk = pd.DataFrame(
                {
                    "event_id": piv_valid["event_id"],
                    "source": piv_valid["source"],
                    "market": piv_valid["market"],
                    "_line_key": piv_valid["_line_key"],
                    "closing_book": book_name,
                    "ts_closing": piv_valid["ts_captured"],
                    "closing_overround": over_arr,
                    "_priority": 0 if book_name == "pinnacle" else 1,
                }
            )
            for s_idx, sel in enumerate(req_sels):
                chunk[f"price_closing_{sel}"] = valid_mat[:, s_idx]
                chunk[f"p_closing_novig_{sel}"] = probs_mat[:, s_idx]
                chunk[f"price_closing_novig_{sel}"] = fair_mat[:, s_idx]
            resolved_frames.append(chunk)

    if resolved_frames:
        all_res = pd.concat(resolved_frames, ignore_index=True)
        all_res = (
            all_res.sort_values(["_priority"], kind="mergesort")
            .drop_duplicates(subset=mkt_key_cols, keep="first")
            .drop(columns=["_priority"])
        )
        merged = universe.drop(
            columns=[
                "closing_book",
                "ts_closing",
                "closing_overround",
                "price_closing_home",
                "price_closing_draw",
                "price_closing_away",
                "price_closing_over",
                "price_closing_under",
                "p_closing_novig_home",
                "p_closing_novig_draw",
                "p_closing_novig_away",
                "p_closing_novig_over",
                "p_closing_novig_under",
                "price_closing_novig_home",
                "price_closing_novig_draw",
                "price_closing_novig_away",
                "price_closing_novig_over",
                "price_closing_novig_under",
            ]
        ).merge(all_res, on=mkt_key_cols, how="left")

        for fc in float_cols:
            if fc not in merged.columns:
                merged[fc] = np.nan

        resolved_ok = merged["closing_book"].notna()
        merged["closing_missing"] = ~resolved_ok
        merged.loc[resolved_ok, "missing_reason"] = None
        if invalid_overround_keys:
            unresolved = ~resolved_ok
            if unresolved.any():
                unres_sub = merged.loc[unresolved, mkt_key_cols]
                key_tuples = list(
                    zip(
                        unres_sub["event_id"],
                        unres_sub["source"],
                        unres_sub["market"],
                        unres_sub["_line_key"],
                    )
                )
                bad_flags = np.array([kt in invalid_overround_keys for kt in key_tuples], dtype=bool)
                if bad_flags.any():
                    unres_idx = merged.index[unresolved][bad_flags]
                    merged.loc[unres_idx, "missing_reason"] = "incomplete_or_implausible_overround"
        return merged.loc[:, base_cols]

    if invalid_overround_keys:
        key_tuples = list(
            zip(
                universe["event_id"],
                universe["source"],
                universe["market"],
                universe["_line_key"],
            )
        )
        bad_flags = np.array([kt in invalid_overround_keys for kt in key_tuples], dtype=bool)
        if bad_flags.any():
            universe.loc[bad_flags, "missing_reason"] = "incomplete_or_implausible_overround"
    return universe.loc[:, base_cols]


def resolve_closing_for_market(
    rows: Sequence[Mapping[str, Any]] | pd.DataFrame,
    devig_method: str = "power",
) -> dict[str, Any]:
    """Helper ergonómico para resolver un único mercado `(event_id, market, line)` y devolver un `dict`."""
    res_df = resolve_closing_odds(rows, devig_method=devig_method)
    if len(res_df) == 0:
        return {
            "closing_missing": True,
            "closing_book": None,
            "ts_closing": None,
            "missing_reason": "empty_input",
            "closing_overround": None,
            "selections": {},
        }
    row = res_df.iloc[0]
    mkt = str(row["market"])
    req_sels = MARKET_REQUIRED_SELECTIONS.get(mkt, ())
    selections_out: dict[str, dict[str, float]] = {}
    if not bool(row["closing_missing"]):
        for sel in req_sels:
            selections_out[sel] = {
                "price_decimal": float(row[f"price_closing_{sel}"]),
                "p_novig": float(row[f"p_closing_novig_{sel}"]),
                "price_novig": float(row[f"price_closing_novig_{sel}"]),
            }
    return {
        "event_id": str(row["event_id"]),
        "source": str(row["source"]),
        "sport": str(row["sport"]),
        "league": str(row["league"]),
        "market": mkt,
        "line": None if pd.isna(row["line"]) else float(row["line"]),
        "closing_missing": bool(row["closing_missing"]),
        "closing_book": None if pd.isna(row["closing_book"]) or row["closing_book"] is None else str(row["closing_book"]),
        "ts_closing": None if pd.isna(row["ts_closing"]) else pd.Timestamp(row["ts_closing"]).isoformat().replace("+00:00", "Z"),
        "missing_reason": None if pd.isna(row["missing_reason"]) or row["missing_reason"] is None else str(row["missing_reason"]),
        "closing_overround": None if pd.isna(row["closing_overround"]) else float(row["closing_overround"]),
        "selections": selections_out,
    }


# ---------------------------------------------------------------------------
# Ingesta 1: `historical_fd` (`matches.parquet` + `nfl_games.parquet`)
# ---------------------------------------------------------------------------


def _resolve_nfl_games_path(nfl_games_path: Path | None) -> Path:
    if nfl_games_path is not None and nfl_games_path.exists():
        return nfl_games_path
    for cand in DEFAULT_NFL_GAMES_CANDIDATES:
        if cand.exists():
            return cand
    raise FileNotFoundError(
        f"No se encontró nfl_games.parquet en {[str(p) for p in DEFAULT_NFL_GAMES_CANDIDATES]}"
    )


def _parse_soccer_kickoff_utc(match_date: pd.Series, kickoff_time: pd.Series) -> pd.Series:
    date_part = match_date.astype(str).str.slice(0, 10)
    ko_raw = kickoff_time.fillna("15:00").astype(str).str.strip()
    valid_ko = ko_raw.str.match(r"^\d{1,2}:\d{2}$", na=False)
    ko_clean = ko_raw.where(valid_ko, "15:00")
    ko_padded = ko_clean.str.zfill(5)
    dt = pd.to_datetime(date_part + "T" + ko_padded + ":00Z", utc=True, errors="coerce")
    fallback_mask = dt.isna()
    if fallback_mask.any():
        dt.loc[fallback_mask] = pd.to_datetime(
            date_part.loc[fallback_mask] + "T15:00:00Z", utc=True, errors="coerce"
        )
    return dt


def ingest_historical_fd(
    matches_path: Path = DEFAULT_MATCHES_PATH,
    nfl_games_path: Path | None = None,
    nfl_raw_csv_path: Path | None = DEFAULT_NFL_RAW_CSV,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Extrae snapshots `open` (`-24h`) y `close` (`-1s`) de fútbol (`matches.parquet`) y NFL."""
    resolved_nfl_path = _resolve_nfl_games_path(nfl_games_path)

    # 1. Leer solo columnas relevantes de `matches.parquet`
    soccer_needed_cols = ["match_id", "div", "match_date", "kickoff_time", "ah_open_line", "ah_close_line"]
    for stage in ("open", "close"):
        for src, _ in SOCCER_1X2_BOOK_MAP:
            for sel in ("h", "d", "a"):
                soccer_needed_cols.append(f"odds_{stage}_{src}_{sel}")
        for src, _ in SOCCER_AH_BOOK_MAP:
            for sel in ("h", "a"):
                soccer_needed_cols.append(f"ah_{stage}_{src}_{sel}")
        for src, _ in SOCCER_TOTALS_BOOK_MAP:
            for sel in ("over", "under"):
                soccer_needed_cols.append(f"totals_{stage}_{src}_{sel}")

    m_df = pd.read_parquet(matches_path)
    present_cols = [c for c in soccer_needed_cols if c in m_df.columns]
    m_df = m_df.loc[:, present_cols].copy()

    ts_start_soccer = _parse_soccer_kickoff_utc(m_df["match_date"], m_df["kickoff_time"])
    ts_open_soccer = ts_start_soccer - pd.Timedelta(hours=24)
    ts_close_soccer = ts_start_soccer - pd.Timedelta(seconds=1)

    chunks: list[pd.DataFrame] = []
    sel_1x2_map = {"h": "home", "d": "draw", "a": "away"}
    sel_ah_map = {"h": "home", "a": "away"}

    for stage, ts_cap_series in (("open", ts_open_soccer), ("close", ts_close_soccer)):
        # 1A. Fútbol 1X2 (`line = NaN`)
        for src_code, book_name in SOCCER_1X2_BOOK_MAP:
            for sel_code, sel_name in sel_1x2_map.items():
                col = f"odds_{stage}_{src_code}_{sel_code}"
                if col not in m_df.columns:
                    continue
                prices = pd.to_numeric(m_df[col], errors="coerce")
                mask = prices.notna()
                if not mask.any():
                    continue
                chunks.append(
                    pd.DataFrame(
                        {
                            "event_id": m_df.loc[mask, "match_id"].to_numpy(),
                            "sport": "football",
                            "league": m_df.loc[mask, "div"].to_numpy(),
                            "market": "1x2",
                            "line": np.nan,
                            "selection": sel_name,
                            "book": book_name,
                            "price_decimal": prices.loc[mask].to_numpy(dtype="float64"),
                            "ts_captured": ts_cap_series.loc[mask].to_numpy(),
                            "ts_event_start": ts_start_soccer.loc[mask].to_numpy(),
                            "source": "historical_fd",
                            "snapshot_stage": stage,
                        }
                    )
                )

        # 1B. Fútbol Asian Handicap (`line = ah_{stage}_line`, perspectiva local canónica)
        line_col = f"ah_{stage}_line"
        if line_col in m_df.columns:
            ah_lines = pd.to_numeric(m_df[line_col], errors="coerce")
            for src_code, book_name in SOCCER_AH_BOOK_MAP:
                for sel_code, sel_name in sel_ah_map.items():
                    col = f"ah_{stage}_{src_code}_{sel_code}"
                    if col not in m_df.columns:
                        continue
                    prices = pd.to_numeric(m_df[col], errors="coerce")
                    mask = prices.notna() & ah_lines.notna()
                    if not mask.any():
                        continue
                    chunks.append(
                        pd.DataFrame(
                            {
                                "event_id": m_df.loc[mask, "match_id"].to_numpy(),
                                "sport": "football",
                                "league": m_df.loc[mask, "div"].to_numpy(),
                                "market": "ah",
                                "line": ah_lines.loc[mask].to_numpy(dtype="float64"),
                                "selection": sel_name,
                                "book": book_name,
                                "price_decimal": prices.loc[mask].to_numpy(dtype="float64"),
                                "ts_captured": ts_cap_series.loc[mask].to_numpy(),
                                "ts_event_start": ts_start_soccer.loc[mask].to_numpy(),
                                "source": "historical_fd",
                                "snapshot_stage": stage,
                            }
                        )
                    )

        # 1C. Fútbol Totals O/U 2.5 (`line = 2.5`)
        for src_code, book_name in SOCCER_TOTALS_BOOK_MAP:
            for sel_code in ("over", "under"):
                col = f"totals_{stage}_{src_code}_{sel_code}"
                if col not in m_df.columns:
                    continue
                prices = pd.to_numeric(m_df[col], errors="coerce")
                mask = prices.notna()
                if not mask.any():
                    continue
                chunks.append(
                    pd.DataFrame(
                        {
                            "event_id": m_df.loc[mask, "match_id"].to_numpy(),
                            "sport": "football",
                            "league": m_df.loc[mask, "div"].to_numpy(),
                            "market": "totals",
                            "line": 2.5,
                            "selection": sel_code,
                            "book": book_name,
                            "price_decimal": prices.loc[mask].to_numpy(dtype="float64"),
                            "ts_captured": ts_cap_series.loc[mask].to_numpy(),
                            "ts_event_start": ts_start_soccer.loc[mask].to_numpy(),
                            "source": "historical_fd",
                            "snapshot_stage": stage,
                        }
                    )
                )

    # 2. NFL histórico (`nfl_games.parquet` + enriquecimiento read-only de spread/total odds desde `games.csv`)
    nfl_df = pd.read_parquet(resolved_nfl_path).copy()
    nfl_raw_joined = False
    if nfl_raw_csv_path is not None and nfl_raw_csv_path.exists():
        raw_cols = ["game_id", "gametime", "home_spread_odds", "away_spread_odds", "over_odds", "under_odds"]
        raw_nfl = pd.read_csv(nfl_raw_csv_path, usecols=lambda c: c in raw_cols)
        raw_nfl = raw_nfl.drop_duplicates(subset=["game_id"], keep="first")
        nfl_df = nfl_df.merge(raw_nfl, on="game_id", how="left")
        nfl_raw_joined = True

    nfl_date_str = pd.to_datetime(nfl_df["gameday"], errors="coerce").dt.strftime("%Y-%m-%d")
    gametime_col = nfl_df["gametime"] if "gametime" in nfl_df.columns else pd.Series("18:00", index=nfl_df.index)
    ts_start_nfl = _parse_soccer_kickoff_utc(nfl_date_str, gametime_col)
    ts_close_nfl = ts_start_nfl - pd.Timedelta(seconds=1)

    # 2A. NFL Moneyline (`home_ml_dec`, `away_ml_dec`, `book = "nflverse"`, `snapshot_stage = "close"`)
    for sel_name, col_name in (("home", "home_ml_dec"), ("away", "away_ml_dec")):
        if col_name in nfl_df.columns:
            prices = pd.to_numeric(nfl_df[col_name], errors="coerce")
            mask = prices.notna()
            if mask.any():
                chunks.append(
                    pd.DataFrame(
                        {
                            "event_id": nfl_df.loc[mask, "game_id"].to_numpy(),
                            "sport": "nfl",
                            "league": "NFL",
                            "market": "moneyline",
                            "line": np.nan,
                            "selection": sel_name,
                            "book": "nflverse",
                            "price_decimal": prices.loc[mask].to_numpy(dtype="float64"),
                            "ts_captured": ts_close_nfl.loc[mask].to_numpy(),
                            "ts_event_start": ts_start_nfl.loc[mask].to_numpy(),
                            "source": "historical_fd",
                            "snapshot_stage": "close",
                        }
                    )
                )

    # 2B. NFL Spread (`line = -spread_line` para mantener convención estándar local negativo = favorito)
    if "spread_line" in nfl_df.columns and "home_spread_odds" in nfl_df.columns:
        # En `nflverse`, `spread_line > 0` indica que el local es favorito por `spread_line` puntos.
        home_spread_pts = -pd.to_numeric(nfl_df["spread_line"], errors="coerce")
        home_spread_pts = home_spread_pts.mask(home_spread_pts == 0.0, 0.0)
        for sel_name, am_col in (("home", "home_spread_odds"), ("away", "away_spread_odds")):
            if am_col not in nfl_df.columns:
                continue
            dec_prices = _american_to_decimal_series(nfl_df[am_col])
            mask = dec_prices.notna() & home_spread_pts.notna()
            if mask.any():
                chunks.append(
                    pd.DataFrame(
                        {
                            "event_id": nfl_df.loc[mask, "game_id"].to_numpy(),
                            "sport": "nfl",
                            "league": "NFL",
                            "market": "spread",
                            "line": home_spread_pts.loc[mask].to_numpy(dtype="float64"),
                            "selection": sel_name,
                            "book": "nflverse",
                            "price_decimal": dec_prices.loc[mask].to_numpy(dtype="float64"),
                            "ts_captured": ts_close_nfl.loc[mask].to_numpy(),
                            "ts_event_start": ts_start_nfl.loc[mask].to_numpy(),
                            "source": "historical_fd",
                            "snapshot_stage": "close",
                        }
                    )
                )

    # 2C. NFL Totals (`line = total_line`)
    if "total_line" in nfl_df.columns and "over_odds" in nfl_df.columns:
        tot_pts = pd.to_numeric(nfl_df["total_line"], errors="coerce")
        for sel_name, am_col in (("over", "over_odds"), ("under", "under_odds")):
            if am_col not in nfl_df.columns:
                continue
            dec_prices = _american_to_decimal_series(nfl_df[am_col])
            mask = dec_prices.notna() & tot_pts.notna()
            if mask.any():
                chunks.append(
                    pd.DataFrame(
                        {
                            "event_id": nfl_df.loc[mask, "game_id"].to_numpy(),
                            "sport": "nfl",
                            "league": "NFL",
                            "market": "totals",
                            "line": tot_pts.loc[mask].to_numpy(dtype="float64"),
                            "selection": sel_name,
                            "book": "nflverse",
                            "price_decimal": dec_prices.loc[mask].to_numpy(dtype="float64"),
                            "ts_captured": ts_close_nfl.loc[mask].to_numpy(),
                            "ts_event_start": ts_start_nfl.loc[mask].to_numpy(),
                            "source": "historical_fd",
                            "snapshot_stage": "close",
                        }
                    )
                )

    raw_df = pd.concat(chunks, ignore_index=True) if chunks else pd.DataFrame(columns=list(ALL_SNAPSHOT_COLUMNS))
    meta = {
        "matches_path": str(matches_path),
        "soccer_matches_count": int(len(m_df)),
        "nfl_games_path": str(resolved_nfl_path),
        "nfl_games_count": int(len(nfl_df)),
        "nfl_raw_csv_joined": nfl_raw_joined,
        "raw_extracted_rows": int(len(raw_df)),
    }
    return raw_df, meta


# ---------------------------------------------------------------------------
# Ingesta 2: `scraped_ws` (`../web-scraping/data/normalized/market_microstructure.json`)
# ---------------------------------------------------------------------------


def _resolve_ws_sport_league(sport_raw: Any, league_raw: Any) -> tuple[str, str]:
    lg_key = str(league_raw or "").strip().lower()
    if lg_key in WS_LEAGUE_TO_CANONICAL:
        return WS_LEAGUE_TO_CANONICAL[lg_key]
    sp_key = str(sport_raw or "").strip().lower()
    if sp_key in ("football", "american_football", "nfl") and lg_key == "nfl":
        return ("nfl", "NFL")
    if sp_key in ("soccer", "football_match"):
        return ("football", lg_key.upper() if lg_key else "SOCCER")
    if sp_key in ("basketball", "nba"):
        return ("nba", lg_key.upper() if lg_key else "NBA")
    if sp_key in ("hockey", "ice_hockey_match", "nhl"):
        return ("nhl", lg_key.upper() if lg_key else "NHL")
    if sp_key in ("baseball", "mlb"):
        return ("mlb", lg_key.upper() if lg_key else "MLB")
    if sp_key in ("ncaaf", "college-football"):
        return ("ncaaf", "NCAAF")
    return (sp_key or "unknown", lg_key.upper() if lg_key else "UNKNOWN")


def _build_ws_event_id(sport: str, league: str, ts_event_start_iso: str, home_team: str, away_team: str) -> str:
    dt = pd.Timestamp(ts_event_start_iso)
    if dt.tzinfo is None:
        dt = dt.tz_localize("UTC")
    else:
        dt = dt.tz_convert("UTC")
    ymd = dt.strftime("%Y%m%d")
    return f"ws:{sport}:{league}:{ymd}:{_slugify_team(home_team)}:{_slugify_team(away_team)}"


def ingest_scraped_ws(
    market_microstructure_path: Path = DEFAULT_WS_MICROSTRUCTURE_PATH,
    live_edge_matrix_path: Path | None = DEFAULT_WS_EDGE_MATRIX_PATH,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Extrae snapshots `scraped_ws` en solo lectura desde `market_microstructure.json`."""
    payload = json.loads(market_microstructure_path.read_text(encoding="utf-8"))
    records: list[dict[str, Any]] = payload["records"] if isinstance(payload, dict) and "records" in payload else payload

    # Índice auxiliar solo lectura `(home_slug, away_slug) -> (sport, league, kickoff_utc)` para Caliente/Smarkets
    known_pair_kickoff: dict[tuple[str, str], tuple[str, str, str]] = {}
    if live_edge_matrix_path is not None and live_edge_matrix_path.exists():
        edge_data = json.loads(live_edge_matrix_path.read_text(encoding="utf-8"))
        for em in edge_data.get("records", []):
            ko = em.get("kickoff_utc")
            ht = em.get("home_team")
            at = em.get("away_team")
            if ko and ht and at:
                sp, lg = _resolve_ws_sport_league(em.get("sport"), em.get("league"))
                known_pair_kickoff[(_slugify_team(ht), _slugify_team(at))] = (sp, lg, str(ko))

    for rec in records:
        rt = rec.get("record_type")
        if rt in ("pinnacle_market", "pinnacle_matchup"):
            ht = str(rec.get("home_team") or "")
            at = str(rec.get("away_team") or "")
            ko = rec.get("kickoff_utc")
            if ko and ht and at and ht.strip().lower() not in PSEUDO_TEAM_LABELS:
                sp, lg = _resolve_ws_sport_league(rec.get("sport_name"), rec.get("league_name"))
                known_pair_kickoff[(_slugify_team(ht), _slugify_team(at))] = (sp, lg, str(ko))
        elif rt in ("action_network_game_summary", "action_network_split_outcome"):
            ht = str(rec.get("home_team") or "")
            at = str(rec.get("away_team") or "")
            ko = rec.get("start_time_utc")
            if ko and ht and at:
                sp, lg = _resolve_ws_sport_league(rec.get("sport"), rec.get("league"))
                known_pair_kickoff.setdefault((_slugify_team(ht), _slugify_team(at)), (sp, lg, str(ko)))
        elif rt == "smarkets_exchange_event":
            ev_name = str(rec.get("event_name") or "")
            ko = rec.get("start_datetime_utc")
            if ko and " vs " in ev_name:
                parts = ev_name.split(" vs ", 1)
                slug_full = str(rec.get("full_slug") or "")
                lg_guess = slug_full.split("/")[3] if len(slug_full.split("/")) > 3 else "SOCCER"
                sp, lg = _resolve_ws_sport_league(rec.get("event_type"), lg_guess)
                known_pair_kickoff.setdefault((_slugify_team(parts[0]), _slugify_team(parts[1])), (sp, lg, str(ko)))

    extracted_rows: list[dict[str, Any]] = []
    record_audit_counts: Counter[str] = Counter()

    for rec in records:
        rt = str(rec.get("record_type") or "unknown")
        cap_utc = rec.get("captured_at_utc")

        # 1. Registros de metadatos/rutas sin cuota seleccionable
        if rt in (
            "action_network_game_summary",
            "smarkets_exchange_event",
            "smarkets_exchange_market",
            "smarkets_exchange_route",
            "smarkets_api_probe",
            "codere_mx_network_endpoint",
            "oddsportal_match_link",
        ):
            record_audit_counts["non_quote_metadata_records"] += 1
            continue

        # 2. Pinnacle Market (`book = "pinnacle"`)
        if rt == "pinnacle_market":
            if bool(rec.get("is_live", False)):
                record_audit_counts["discarded_live_inplay"] += 1
                continue
            ht = str(rec.get("home_team") or "").strip()
            at = str(rec.get("away_team") or "").strip()
            ko = rec.get("kickoff_utc")
            if not ht or not at or not ko or ht.lower() in PSEUDO_TEAM_LABELS or at.lower() in PSEUDO_TEAM_LABELS:
                record_audit_counts["discarded_missing_event_or_kickoff"] += 1
                continue
            period = rec.get("period", 0)
            mtype = str(rec.get("market_type") or "").strip().lower()
            if period != 0 or mtype not in ("moneyline", "1x2", "spread", "total"):
                record_audit_counts["discarded_unsupported_market_or_period"] += 1
                continue

            sp, lg = _resolve_ws_sport_league(rec.get("sport_name"), rec.get("league_name"))
            eid = _build_ws_event_id(sp, lg, str(ko), ht, at)
            prices = rec.get("prices") or []
            designations = {str(p.get("designation") or "").lower() for p in prices if isinstance(p, dict)}

            if mtype in ("moneyline", "1x2"):
                canon_mkt = "1x2" if ("draw" in designations or mtype == "1x2") else "moneyline"
                canon_line = float("nan")
            elif mtype == "spread":
                canon_mkt = "spread"
                home_p = next(
                    (p.get("points") for p in prices if isinstance(p, dict) and str(p.get("designation") or "").lower() == "home"),
                    None,
                )
                if home_p is None:
                    away_p = next(
                        (p.get("points") for p in prices if isinstance(p, dict) and str(p.get("designation") or "").lower() == "away"),
                        None,
                    )
                    home_p = -float(away_p) if away_p is not None else None
                canon_line = _normalize_line_scalar(home_p)
                if math.isnan(canon_line):
                    record_audit_counts["discarded_unsupported_market_or_period"] += 1
                    continue
            else:  # total
                canon_mkt = "totals"
                tot_p = next((p.get("points") for p in prices if isinstance(p, dict) and p.get("points") is not None), rec.get("line_points"))
                canon_line = _normalize_line_scalar(tot_p)
                if math.isnan(canon_line):
                    record_audit_counts["discarded_unsupported_market_or_period"] += 1
                    continue

            emitted = 0
            for p in prices:
                if not isinstance(p, dict):
                    continue
                desig = str(p.get("designation") or "").strip().lower()
                if desig not in ("home", "draw", "away", "over", "under"):
                    continue
                extracted_rows.append(
                    {
                        "event_id": eid,
                        "sport": sp,
                        "league": lg,
                        "market": canon_mkt,
                        "line": canon_line,
                        "selection": desig,
                        "book": "pinnacle",
                        "price_decimal": p.get("decimal_odds"),
                        "ts_captured": cap_utc,
                        "ts_event_start": ko,
                        "source": "scraped_ws",
                        "snapshot_stage": "intraday",
                    }
                )
                emitted += 1
            if emitted > 0:
                record_audit_counts["ingested_quote_records"] += 1
            else:
                record_audit_counts["discarded_unsupported_market_or_period"] += 1
            continue

        # 3. Pinnacle Matchup (`book = "pinnacle"`, cuando incluye cuotas moneyline/1x2 directas)
        if rt == "pinnacle_matchup":
            if rec.get("decimal_odds_home") is None and rec.get("decimal_odds_away") is None:
                record_audit_counts["non_quote_metadata_records"] += 1
                continue
            if bool(rec.get("is_live", False)):
                record_audit_counts["discarded_live_inplay"] += 1
                continue
            ht = str(rec.get("home_team") or "").strip()
            at = str(rec.get("away_team") or "").strip()
            ko = rec.get("kickoff_utc")
            if not ht or not at or not ko or ht.lower() in PSEUDO_TEAM_LABELS or at.lower() in PSEUDO_TEAM_LABELS:
                record_audit_counts["discarded_missing_event_or_kickoff"] += 1
                continue
            sp, lg = _resolve_ws_sport_league(rec.get("sport_name"), rec.get("league_name"))
            eid = _build_ws_event_id(sp, lg, str(ko), ht, at)
            has_draw = rec.get("decimal_odds_draw") is not None
            canon_mkt = "1x2" if has_draw else "moneyline"
            for sel_name, field_name in (
                ("home", "decimal_odds_home"),
                ("draw", "decimal_odds_draw"),
                ("away", "decimal_odds_away"),
            ):
                val = rec.get(field_name)
                if val is None:
                    continue
                extracted_rows.append(
                    {
                        "event_id": eid,
                        "sport": sp,
                        "league": lg,
                        "market": canon_mkt,
                        "line": float("nan"),
                        "selection": sel_name,
                        "book": "pinnacle",
                        "price_decimal": val,
                        "ts_captured": cap_utc,
                        "ts_event_start": ko,
                        "source": "scraped_ws",
                        "snapshot_stage": "intraday",
                    }
                )
            record_audit_counts["ingested_quote_records"] += 1
            continue

        # 4. Action Network Split Outcomes (`draftkings`, `fanduel`, `betmgm`, `bet365`, etc.)
        if rt == "action_network_split_outcome":
            if bool(rec.get("is_live", False)):
                record_audit_counts["discarded_live_inplay"] += 1
                continue
            mtype = str(rec.get("market_type") or "").strip().lower()
            if mtype not in ("moneyline", "1x2", "spread", "total"):
                record_audit_counts["discarded_unsupported_market_or_period"] += 1
                continue
            ht = str(rec.get("home_team") or "").strip()
            at = str(rec.get("away_team") or "").strip()
            ko = rec.get("start_time_utc")
            side = str(rec.get("side") or "").strip().lower()
            if not ht or not at or not ko or side not in ("home", "draw", "away", "over", "under"):
                record_audit_counts["discarded_missing_event_or_kickoff"] += 1
                continue

            sp, lg = _resolve_ws_sport_league(rec.get("sport"), rec.get("league"))
            eid = _build_ws_event_id(sp, lg, str(ko), ht, at)
            book_id = str(rec.get("book_id") or "").strip()
            book_name = str(rec.get("book_name") or ACTION_NETWORK_BOOK_ID_MAP.get(book_id) or f"an_book_{book_id}").strip().lower()

            if mtype in ("moneyline", "1x2"):
                canon_mkt = "1x2" if (sp == "football" and side == "draw") or mtype == "1x2" else "moneyline"
                canon_line = float("nan")
            elif mtype == "spread":
                canon_mkt = "spread"
                raw_lv = _normalize_line_scalar(rec.get("line_value"))
                if math.isnan(raw_lv):
                    record_audit_counts["discarded_unsupported_market_or_period"] += 1
                    continue
                canon_line = raw_lv if side == "home" else _normalize_line_scalar(-raw_lv)
            else:
                canon_mkt = "totals"
                canon_line = _normalize_line_scalar(rec.get("line_value"))
                if math.isnan(canon_line):
                    record_audit_counts["discarded_unsupported_market_or_period"] += 1
                    continue

            extracted_rows.append(
                {
                    "event_id": eid,
                    "sport": sp,
                    "league": lg,
                    "market": canon_mkt,
                    "line": canon_line,
                    "selection": side,
                    "book": book_name,
                    "price_decimal": rec.get("decimal_odds"),
                    "ts_captured": cap_utc,
                    "ts_event_start": ko,
                    "source": "scraped_ws",
                    "snapshot_stage": "intraday",
                }
            )
            record_audit_counts["ingested_quote_records"] += 1
            continue

        # 5. Caliente MX (`book = "caliente"`, solo cuando tiene `kickoff_utc` verificable por par de equipos o campo explícito)
        if rt == "caliente_mx_event_odds":
            ht = str(rec.get("home_team") or "").strip()
            at = str(rec.get("away_team") or "").strip()
            ko_explicit = rec.get("kickoff_utc") or rec.get("start_time_utc")
            matched_ctx = known_pair_kickoff.get((_slugify_team(ht), _slugify_team(at)))
            if ko_explicit:
                sp, lg = _resolve_ws_sport_league(rec.get("sport"), rec.get("league") or "MEX")
                ko_use = str(ko_explicit)
            elif matched_ctx is not None:
                sp, lg, ko_use = matched_ctx
            else:
                record_audit_counts["discarded_missing_event_or_kickoff"] += 1
                continue

            mtype = str(rec.get("market_type") or "").strip().lower()
            if mtype not in ("moneyline_1x2", "moneyline", "1x2"):
                record_audit_counts["discarded_unsupported_market_or_period"] += 1
                continue

            eid = _build_ws_event_id(sp, lg, ko_use, ht, at)
            has_draw = rec.get("decimal_odds_draw") is not None
            canon_mkt = "1x2" if has_draw else "moneyline"
            emitted = 0
            for sel_name, field_name in (
                ("home", "decimal_odds_home"),
                ("draw", "decimal_odds_draw"),
                ("away", "decimal_odds_away"),
            ):
                val = rec.get(field_name)
                if val is None:
                    continue
                extracted_rows.append(
                    {
                        "event_id": eid,
                        "sport": sp,
                        "league": lg,
                        "market": canon_mkt,
                        "line": float("nan"),
                        "selection": sel_name,
                        "book": "caliente",
                        "price_decimal": val,
                        "ts_captured": cap_utc,
                        "ts_event_start": ko_use,
                        "source": "scraped_ws",
                        "snapshot_stage": "intraday",
                    }
                )
                emitted += 1
            if emitted > 0:
                record_audit_counts["ingested_quote_records"] += 1
            else:
                record_audit_counts["discarded_missing_event_or_kickoff"] += 1
            continue

        # 6. Smarkets Exchange Quote (`book = "smarkets"`)
        #    Si el registro incluye `event_id`, `selection`, `market` y `kickoff_utc` (en feeds enriquecidos),
        #    se ingiere; si carece de mapeo `contract_id -> selection/event_id` (como ocurre en los 158 quotes
        #    crudos de Ola 3 sin endpoint `/contracts/`), se descarta honestamente sin inventar etiquetas.
        if rt == "smarkets_exchange_quote":
            ev_id_raw = rec.get("event_id")
            sel_raw = str(rec.get("selection") or "").strip().lower()
            mkt_raw = str(rec.get("market") or "").strip().lower()
            ko_raw = rec.get("start_datetime_utc") or rec.get("kickoff_utc")
            back_odds = rec.get("best_back_decimal_odds")
            if ev_id_raw and sel_raw in ("home", "draw", "away", "over", "under") and mkt_raw in MARKET_REQUIRED_SELECTIONS and ko_raw and back_odds is not None:
                sp, lg = _resolve_ws_sport_league(rec.get("sport"), rec.get("league"))
                extracted_rows.append(
                    {
                        "event_id": str(ev_id_raw),
                        "sport": sp,
                        "league": lg,
                        "market": mkt_raw,
                        "line": _normalize_line_scalar(rec.get("line")),
                        "selection": sel_raw,
                        "book": "smarkets",
                        "price_decimal": back_odds,
                        "ts_captured": cap_utc,
                        "ts_event_start": ko_raw,
                        "source": "scraped_ws",
                        "snapshot_stage": "intraday",
                    }
                )
                record_audit_counts["ingested_quote_records"] += 1
            else:
                record_audit_counts["discarded_unlinked_contract_or_dom_sample"] += 1
            continue

        # 7. Fragmentos DOM sin equipos ni hora de inicio (`codere_mx_odds_selection`, `oddsportal_oddschecker_price_sample`)
        if rt in ("codere_mx_odds_selection", "oddsportal_oddschecker_price_sample"):
            record_audit_counts["discarded_unlinked_contract_or_dom_sample"] += 1
            continue

        record_audit_counts["discarded_unknown_record_type"] += 1

    raw_df = pd.DataFrame(extracted_rows) if extracted_rows else pd.DataFrame(columns=list(ALL_SNAPSHOT_COLUMNS))
    meta = {
        "market_microstructure_path": str(market_microstructure_path),
        "total_source_records": int(len(records)),
        "record_audit_counts": dict(record_audit_counts),
        "candidate_snapshot_rows_emitted": int(len(raw_df)),
    }
    return raw_df, meta


# ---------------------------------------------------------------------------
# Pipeline principal + generación de `odds_coverage_report.json` y `A28_a1_odds_coverage.md`
# ---------------------------------------------------------------------------


def _build_markdown_report(report: dict[str, Any]) -> str:
    totals = report["totals"]
    val_hist = report["validation_by_source"]["historical_fd"]
    val_ws = report["validation_by_source"]["scraped_ws"]
    ws_audit = report["scraped_ws_source_audit"]["record_audit_counts"]
    closing_global = report["closing_coverage_by_source"]
    gaps_summary = report["gaps_gt_60m"]

    lines: list[str] = [
        "# A28 (Ola 1 · A1) — Cobertura y Calidad de `odds_snapshots`",
        "",
        f"**Generado (UTC):** `{report['generated_at_utc']}` · **Esquema:** `{report['schema_version']}`",
        "",
        "## 1. Resumen Ejecutivo",
        "",
        f"- **Snapshots válidos totales (`odds_snapshots.parquet`):** `{totals['n_valid_rows']:,}` filas "
        f"(`{totals['n_unique_events']:,}` eventos únicos, `{totals['n_unique_markets']:,}` mercados `(event_id, market, line)`).",
        f"- **`historical_fd` (`matches.parquet` + `nfl_games.parquet`):** `{val_hist['n_valid']:,}` filas válidas "
        f"(`{totals['n_events_historical_fd']:,}` eventos: `{ report['historical_fd_source_audit']['soccer_matches_count']:,}` fútbol + "
        f"`{report['historical_fd_source_audit']['nfl_games_count']:,}` NFL).",
        f"- **`scraped_ws` (`market_microstructure.json`):** `{val_ws['n_valid']:,}` filas pre-partido válidas "
        f"(`{totals['n_events_scraped_ws']:,}` eventos únicos), tras descartar `{val_ws['n_post_kickoff_discarded']:,}` "
        f"capturas post-kickoff (`ts_captured > ts_event_start`) y `{val_ws['n_duplicates_removed']:,}` duplicados exactos.",
        f"- **Validación de rango `[1.01, 1000.0]`:** `{totals['n_out_of_range_discarded']:,}` filas fuera de rango descartadas y contabilizadas "
        f"(`historical_fd`: `{val_hist['n_out_of_range']:,}`, `scraped_ws`: `{val_ws['n_out_of_range']:,}`).",
        f"- **Deduplicación natural `(event_id, market, line, selection, book, ts_captured, source)`:** "
        f"`{totals['n_duplicates_removed']:,}` duplicados eliminados (`0` duplicados remanentes).",
        "",
        "## 2. Regla Estricta de Cuota de Cierre Sharp",
        "",
        "- **`historical_fd`:** cierre = **ÚNICAMENTE** el snapshot `close` de `book == \"pinnacle\"` con `ts_captured <= ts_event_start` "
        "(jamás `open` de Pinnacle, jamás `betfair_exchange` / `bfe`, jamás casas recreativas ni `nflverse`).",
        "- **`scraped_ws`:** cierre = último snapshot pre-partido (`ts_captured <= ts_event_start`) de `book == \"pinnacle\"`, "
        "con fallback **ÚNICAMENTE** a `book == \"smarkets\"` (`closing_missing = True` en cualquier otro caso).",
        "",
        "| Fuente (`source`) | Mercados totales | Con cierre sharp | `closing_missing` | % Cobertura cierre sharp | Desglose `closing_book` |",
        "|---|---:|---:|---:|---:|---|",
    ]

    for src_key in ("historical_fd", "scraped_ws"):
        cg = closing_global.get(src_key, {})
        n_m = cg.get("n_markets", 0)
        n_ok = cg.get("n_with_sharp_closing", 0)
        n_miss = cg.get("n_closing_missing", 0)
        pct = cg.get("pct_with_sharp_closing", 0.0)
        books_str = ", ".join(f"`{k}`: {v:,}" for k, v in (cg.get("by_closing_book") or {}).items()) or "—"
        lines.append(f"| `{src_key}` | {n_m:,} | {n_ok:,} | {n_miss:,} | {pct:.2f}% | {books_str} |")

    lines.extend(
        [
            "",
            "> **Nota de honestidad sobre NFL histórico (`nfl_games.parquet`) y Smarkets (`scraped_ws`):**",
            "> 1. En `nfl_games.parquet` (`nflverse/nfldata`), la fuente original no atribuye explícitamente la columna a Pinnacle, "
            "por lo que se etiqueta fielmente `book = \"nflverse\"` y bajo la regla humana estricta de cierre sharp se reporta "
            "`closing_missing = True` en `historical_fd` NFL (sin disfrazar consenso `nflverse` como `pinnacle`). En cambio, en `scraped_ws` "
            "los partidos de NFL capturados desde Pinnacle Arcadia sí resuelven cierre sharp real `book = \"pinnacle\"`.",
            "> 2. En `market_microstructure.json`, los `158` registros `smarkets_exchange_quote` provienen de `/quotes/` por `contract_id` "
            "sin metadatos `/contracts/` (`selection`/`event_id`), y los `30` registros de Codere + `43` de OddsPortal son muestras DOM de portada "
            "sin hora de inicio; se contabilizan en `discarded_unlinked_contract_or_dom_sample` sin inventar etiquetas.",
            "",
            "## 3. Auditoría de Descartes y Deduplicación por Fuente",
            "",
            "| Métrica | `historical_fd` | `scraped_ws` | Total |",
            "|---|---:|---:|---:|",
            f"| Filas candidatas emitidas (`n_raw`) | {val_hist['n_raw']:,} | {val_ws['n_raw']:,} | {totals['n_raw_candidate_rows']:,} |",
            f"| Fuera de rango `[1.01, 1000.0]` (`n_out_of_range`) | {val_hist['n_out_of_range']:,} | {val_ws['n_out_of_range']:,} | {totals['n_out_of_range_discarded']:,} |",
            f"| Post-kickoff `ts_captured > ts_event_start` | {val_hist['n_post_kickoff_discarded']:,} | {val_ws['n_post_kickoff_discarded']:,} | {totals['n_post_kickoff_discarded']:,} |",
            f"| Duplicados clave natural eliminados | {val_hist['n_duplicates_removed']:,} | {val_ws['n_duplicates_removed']:,} | {totals['n_duplicates_removed']:,} |",
            f"| **Filas válidas finales (`n_valid`)** | **{val_hist['n_valid']:,}** | **{val_ws['n_valid']:,}** | **{totals['n_valid_rows']:,}** |",
            "",
            "### Desglose de los `22,412` registros crudos de `market_microstructure.json` (`scraped_ws`)",
            "",
            f"- `ingested_quote_records`: `{ws_audit.get('ingested_quote_records', 0):,}`",
            f"- `non_quote_metadata_records` (resúmenes, eventos/mercados sin precio, probes): `{ws_audit.get('non_quote_metadata_records', 0):,}`",
            f"- `discarded_unsupported_market_or_period` (`team_total`, mitades/cuartos `period != 0`): `{ws_audit.get('discarded_unsupported_market_or_period', 0):,}`",
            f"- `discarded_missing_event_or_kickoff` (eventos sin `kickoff_utc` verificable o pseudo-equipos): `{ws_audit.get('discarded_missing_event_or_kickoff', 0):,}`",
            f"- `discarded_unlinked_contract_or_dom_sample` (`smarkets_exchange_quote` sin `/contracts/`, muestras DOM Codere/OddsPortal): `{ws_audit.get('discarded_unlinked_contract_or_dom_sample', 0):,}`",
            f"- `discarded_live_inplay`: `{ws_audit.get('discarded_live_inplay', 0):,}`",
            "",
            "## 4. Detección de Huecos `> 60 min` entre Capturas Consecutivas",
            "",
            f"- **Total intervalos `> 60 min` detectados:** `{gaps_summary['total_gaps_gt_60m']:,}`",
            f"  - **`scraped_ws` (capturas reales intra-día/multi-ola):** `{gaps_summary['by_source'].get('scraped_ws', {}).get('n_gaps', 0):,}` huecos "
            f"(mediana `{gaps_summary['by_source'].get('scraped_ws', {}).get('median_gap_minutes')}` min, "
            f"máximo `{gaps_summary['by_source'].get('scraped_ws', {}).get('max_gap_minutes')}` min).",
            f"  - **`historical_fd` (cadencia sintética `open = -24h` → `close = -1s` = `1439.98 min`):** "
            f"`{gaps_summary['by_source'].get('historical_fd', {}).get('n_gaps', 0):,}` pares `open → close`.",
            "",
            "## 5. Cobertura por Liga × Mercado (% con Cierre Sharp)",
            "",
            "| Fuente | Deporte | Liga | Mercado | Mercados `(event, line)` | Con cierre sharp | % Cierre sharp |",
            "|---|---|---|---|---:|---:|---:|",
        ]
    )

    for item in report["coverage_by_league_market"]:
        lines.append(
            f"| `{item['source']}` | `{item['sport']}` | `{item['league']}` | `{item['market']}` | "
            f"{item['n_markets']:,} | {item['n_with_sharp_closing']:,} | {item['pct_with_sharp_closing']:.2f}% |"
        )

    lines.extend(
        [
            "",
            "## 6. Cobertura por Casa (`book`) y Fuente",
            "",
            "| Fuente | Casa (`book`) | Filas válidas | Eventos únicos | Mercados cubiertos |",
            "|---|---|---:|---:|---:|",
        ]
    )

    for b_item in report["coverage_by_book"]:
        lines.append(
            f"| `{b_item['source']}` | `{b_item['book']}` | {b_item['n_rows']:,} | "
            f"{b_item['n_events']:,} | {b_item['n_markets']:,} |"
        )

    lines.append("")
    return "\n".join(lines)


def build_odds_snapshots(
    matches_path: Path = DEFAULT_MATCHES_PATH,
    nfl_games_path: Path | None = None,
    nfl_raw_csv_path: Path | None = DEFAULT_NFL_RAW_CSV,
    ws_microstructure_path: Path = DEFAULT_WS_MICROSTRUCTURE_PATH,
    ws_edge_matrix_path: Path | None = DEFAULT_WS_EDGE_MATRIX_PATH,
    output_parquet_path: Path = DEFAULT_OUTPUT_PARQUET,
    coverage_json_path: Path = DEFAULT_COVERAGE_JSON,
    report_md_path: Path = DEFAULT_REPORT_MD,
    devig_method: str = "power",
) -> dict[str, Any]:
    """Ejecuta el pipeline end-to-end A1 y escribe Parquet + JSON + reporte Markdown."""
    hist_raw, hist_meta = ingest_historical_fd(
        matches_path=matches_path,
        nfl_games_path=nfl_games_path,
        nfl_raw_csv_path=nfl_raw_csv_path,
    )
    ws_raw, ws_meta = ingest_scraped_ws(
        market_microstructure_path=ws_microstructure_path,
        live_edge_matrix_path=ws_edge_matrix_path,
    )

    hist_clean, hist_stats = validate_and_deduplicate_snapshots(hist_raw)
    ws_clean, ws_stats = validate_and_deduplicate_snapshots(ws_raw)

    unified = pd.concat([hist_clean, ws_clean], ignore_index=True)
    # Garantizar deduplicación global exacta sobre la tabla final unificada
    unified, global_post_stats = validate_and_deduplicate_snapshots(unified)

    # Detectar huecos > 60 min y resolver cuotas de cierre sharp sobre el dataset íntegro
    gaps_df = detect_snapshot_gaps(unified, max_gap_minutes=MAX_GAP_MINUTES)
    closing_df = resolve_closing_odds(unified, devig_method=devig_method)

    # Persistir Parquet con las 11 columnas exactas primero + `snapshot_stage` auxiliar
    output_parquet_path.parent.mkdir(parents=True, exist_ok=True)
    unified.to_parquet(output_parquet_path, index=False)

    # Agregaciones de cobertura
    closing_by_source: dict[str, Any] = {}
    for src_name, grp in closing_df.groupby("source", sort=True):
        n_m = int(len(grp))
        n_ok = int((~grp["closing_missing"]).sum())
        n_miss = int(grp["closing_missing"].sum())
        by_bk = grp.loc[~grp["closing_missing"], "closing_book"].value_counts().to_dict()
        by_reason = grp.loc[grp["closing_missing"], "missing_reason"].value_counts(dropna=False).to_dict()
        closing_by_source[str(src_name)] = {
            "n_markets": n_m,
            "n_with_sharp_closing": n_ok,
            "n_closing_missing": n_miss,
            "pct_with_sharp_closing": round((100.0 * n_ok / n_m), 4) if n_m > 0 else 0.0,
            "by_closing_book": {str(k): int(v) for k, v in by_bk.items()},
            "missing_reasons": {str(k): int(v) for k, v in by_reason.items()},
        }

    coverage_by_league_market: list[dict[str, Any]] = []
    for (src_v, sp_v, lg_v, mkt_v), grp in closing_df.groupby(["source", "sport", "league", "market"], sort=True):
        n_m = int(len(grp))
        n_ok = int((~grp["closing_missing"]).sum())
        coverage_by_league_market.append(
            {
                "source": str(src_v),
                "sport": str(sp_v),
                "league": str(lg_v),
                "market": str(mkt_v),
                "n_markets": n_m,
                "n_with_sharp_closing": n_ok,
                "n_closing_missing": int(n_m - n_ok),
                "pct_with_sharp_closing": round((100.0 * n_ok / n_m), 2) if n_m > 0 else 0.0,
            }
        )

    unified_mkt_key = unified["line"].fillna(-999999.125)
    unified_with_mk = unified.assign(_mk=unified["event_id"] + "|" + unified["market"] + "|" + unified_mkt_key.astype(str))
    coverage_by_book: list[dict[str, Any]] = []
    for (src_v, bk_v), grp in unified_with_mk.groupby(["source", "book"], sort=True):
        coverage_by_book.append(
            {
                "source": str(src_v),
                "book": str(bk_v),
                "n_rows": int(len(grp)),
                "n_events": int(grp["event_id"].nunique()),
                "n_markets": int(grp["_mk"].nunique()),
            }
        )
    coverage_by_book.sort(key=lambda x: (x["source"], -x["n_rows"], x["book"]))

    gaps_by_source: dict[str, Any] = {}
    for src_v in ("historical_fd", "scraped_ws"):
        g_sub = gaps_df.loc[gaps_df["source"] == src_v]
        if len(g_sub) > 0:
            by_bk_gaps = g_sub["book"].value_counts().to_dict()
            gaps_by_source[src_v] = {
                "n_gaps": int(len(g_sub)),
                "n_distinct_series_affected": int(
                    g_sub.assign(_l=g_sub["line"].fillna(-999999.125))
                    .drop_duplicates(subset=["event_id", "market", "_l", "book"])
                    .shape[0]
                ),
                "min_gap_minutes": round(float(g_sub["gap_minutes"].min()), 2),
                "median_gap_minutes": round(float(g_sub["gap_minutes"].median()), 2),
                "max_gap_minutes": round(float(g_sub["gap_minutes"].max()), 2),
                "by_book": {str(k): int(v) for k, v in by_bk_gaps.items()},
            }
        else:
            gaps_by_source[src_v] = {
                "n_gaps": 0,
                "n_distinct_series_affected": 0,
                "min_gap_minutes": None,
                "median_gap_minutes": None,
                "max_gap_minutes": None,
                "by_book": {},
            }

    report: dict[str, Any] = {
        "schema_version": "1.0.0",
        "generated_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "contract": {
            "required_11_columns": list(REQUIRED_COLUMNS),
            "auxiliary_columns": list(AUXILIARY_COLUMNS),
            "parquet_columns": list(unified.columns),
            "price_decimal_bounds": [MIN_PRICE_DECIMAL, MAX_PRICE_DECIMAL],
            "dedup_natural_key": list(DEDUP_KEY_COLUMNS),
            "gap_threshold_minutes": MAX_GAP_MINUTES,
            "devig_method": devig_method,
            "strict_closing_policy": {
                "historical_fd": "ONLY pinnacle snapshot_stage=='close' with ts_captured <= ts_event_start (never open, never betfair_exchange, never recreational/consensus)",
                "scraped_ws": "Latest pinnacle with ts_captured <= ts_event_start; fallback ONLY to smarkets; else closing_missing=True",
            },
        },
        "outputs": {
            "odds_snapshots_parquet": str(output_parquet_path),
            "odds_coverage_report_json": str(coverage_json_path),
            "coverage_markdown_report": str(report_md_path),
        },
        "totals": {
            "n_raw_candidate_rows": int(hist_stats["n_raw"] + ws_stats["n_raw"]),
            "n_missing_required_discarded": int(hist_stats["n_missing_required"] + ws_stats["n_missing_required"]),
            "n_out_of_range_discarded": int(hist_stats["n_out_of_range"] + ws_stats["n_out_of_range"]),
            "n_post_kickoff_discarded": int(hist_stats["n_post_kickoff_discarded"] + ws_stats["n_post_kickoff_discarded"]),
            "n_duplicates_removed": int(
                hist_stats["n_duplicates_removed"]
                + ws_stats["n_duplicates_removed"]
                + global_post_stats["n_duplicates_removed"]
            ),
            "n_valid_rows": int(len(unified)),
            "n_unique_events": int(unified["event_id"].nunique()),
            "n_events_historical_fd": int(hist_clean["event_id"].nunique()),
            "n_events_scraped_ws": int(ws_clean["event_id"].nunique()),
            "n_unique_markets": int(len(closing_df)),
        },
        "validation_by_source": {
            "historical_fd": hist_stats,
            "scraped_ws": ws_stats,
        },
        "historical_fd_source_audit": hist_meta,
        "scraped_ws_source_audit": ws_meta,
        "closing_coverage_by_source": closing_by_source,
        "gaps_gt_60m": {
            "threshold_minutes": MAX_GAP_MINUTES,
            "total_gaps_gt_60m": int(len(gaps_df)),
            "by_source": gaps_by_source,
        },
        "coverage_by_league_market": coverage_by_league_market,
        "coverage_by_book": coverage_by_book,
    }

    coverage_json_path.parent.mkdir(parents=True, exist_ok=True)
    coverage_json_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    report_md_path.parent.mkdir(parents=True, exist_ok=True)
    report_md_path.write_text(_build_markdown_report(report), encoding="utf-8")

    return report


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Construye odds_snapshots.parquet y reportes de cobertura (A1).")
    parser.add_argument("--devig-method", default="power", choices=["proportional", "power", "shin", "adaptive"])
    args = parser.parse_args(argv)

    sys.stdout.reconfigure(encoding="utf-8")
    report = build_odds_snapshots(devig_method=args.devig_method)
    print(
        json.dumps(
            {
                "status": "ok",
                "totals": report["totals"],
                "closing_coverage_by_source": report["closing_coverage_by_source"],
                "gaps_gt_60m_by_source": report["gaps_gt_60m"]["by_source"],
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
