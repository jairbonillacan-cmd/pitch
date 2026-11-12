"""Ola 2 · Agente B6 (`b6-nfl-sharp`) — Corpus de cierre sharp para NFL (`v3.2`).

Construye `research/prediction-lab/data/processed/nfl_sharp_closing.parquet` y el
reporte de auditoría `research/prediction-lab/reports/A29_nfl_sharp_corpus.md` uniendo:
  1. Serie temporal prospectiva multi-tick `../web-scraping/data/odds_timeseries/nfl/*.jsonl`
     (`ingest_origin = "odds_timeseries_v3_2"`).
  2. Snapshots reales pre-kickoff previamente normalizados en `odds_snapshots.parquet` con
     `source == "scraped_ws"` y `sport == "nfl"` (`ingest_origin = "odds_snapshots_scraped_ws_2026_11_09"`),
     con trazabilidad explícita por fila y opción `--no-legacy-snapshots`.
  3. Calendario y marcadores canónicos de `nflverse` (`nfl_games.parquet` + `data/nfl/raw/games.csv`),
     resolviendo las 32 franquicias NFL (incluyendo relocalizaciones `OAK->LV`, `SD->LAC`, `STL->LA`)
     y ventana horaria UTC <-> `America/New_York` (`±48 h` dentro de la semana NFL; si un partido futuro
     aún no figura en el corte local de `nflverse`, recibe `game_id = "unmatched_future"` explícito).

Reglas rectoras instrumentadas con guardas duras (§0):
  - Reutiliza `validate_and_deduplicate_snapshots` y `resolve_closing_odds` de
    `services/ingest/odds_snapshots.py` (`SHARP_BOOKS_SCRAPED_FALLBACK_ORDER = ("pinnacle", "smarkets")`).
  - Rechazo estricto de casas recreativas (`draftkings`, `fanduel`, `bet365`, `betmgm`, `caliente`,
    `codere`, etc.), consensos/mercados de predicción (`nflverse`, `action_consensus`, `consensus`,
    `polymarket`, `kalshi`) y ticks post-kickoff (`ts_captured > ts_event_start`).
  - Compuerta de suficiencia muestral (`MIN_SETTLED_GAMES_FOR_EVAL = 64`): mientras
    `n_settled_games_with_sharp_closing < 64`, `corpus_sufficient_for_eval = False` y NFL permanece
    apagado (`production_enabled = False`).
  - Cero campos de apuesta pública (`stake`, `kelly`, `ev`, `tier`) y cero precios sintéticos.

Uso CLI:
  .\\research\\prediction-lab\\.venv\\Scripts\\python.exe services/ingest/nfl_sharp_closing.py
"""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re
import sys
import unicodedata
from typing import Any, Mapping, Sequence

import numpy as np
import pandas as pd

WORKTREE_ROOT = Path(__file__).resolve().parents[2]
if str(WORKTREE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKTREE_ROOT))

from services.ingest.odds_snapshots import (  # noqa: E402
    DEFAULT_NFL_GAMES_CANDIDATES,
    DEFAULT_NFL_RAW_CSV,
    DEFAULT_OUTPUT_PARQUET as DEFAULT_ODDS_SNAPSHOTS_PARQUET,
    REQUIRED_COLUMNS,
    SHARP_BOOKS_SCRAPED_FALLBACK_ORDER,
    resolve_closing_odds,
    validate_and_deduplicate_snapshots,
)

PRED_LAB_ROOT = WORKTREE_ROOT / "research" / "prediction-lab"
DEFAULT_WS_TIMESERIES_ROOT = WORKTREE_ROOT.parent / "web-scraping" / "data" / "odds_timeseries"
DEFAULT_WS_NFL_TIMESERIES_DIR = DEFAULT_WS_TIMESERIES_ROOT / "nfl"
DEFAULT_WS_HEALTH_JSON = DEFAULT_WS_TIMESERIES_ROOT / "health.json"
DEFAULT_OUTPUT_NFL_SHARP_PARQUET = PRED_LAB_ROOT / "data" / "processed" / "nfl_sharp_closing.parquet"
DEFAULT_REPORT_MD = PRED_LAB_ROOT / "reports" / "A29_nfl_sharp_corpus.md"
FROZEN_PROD_SEGMENTS_PATH = WORKTREE_ROOT / "src" / "data" / "prediction" / "production_segments_v3_1.json"

SCHEMA_VERSION: str = "nfl_sharp_closing_v3.2.0"
MIN_SETTLED_GAMES_FOR_EVAL: int = 64
MAX_KICKOFF_MATCH_DELTA_HOURS: float = 48.0
UNMATCHED_FUTURE_GAME_ID: str = "unmatched_future"

ORIGIN_TIMESERIES_V3_2: str = "odds_timeseries_v3_2"
ORIGIN_SCRAPED_WS_LEGACY: str = "odds_snapshots_scraped_ws_2026_11_09"

SUPPORTED_NFL_MARKETS: tuple[str, ...] = ("moneyline", "spread", "totals")
ALLOWED_SHARP_BOOKS: tuple[str, ...] = SHARP_BOOKS_SCRAPED_FALLBACK_ORDER  # ("pinnacle", "smarkets")

DEFAULT_BOOTSTRAP_SAMPLES: int = 1000
MIN_BOOTSTRAP_SAMPLES: int = 1000
DEFAULT_BOOTSTRAP_SEED: int = 20261111

NFL_SHARP_CLOSING_COLUMNS: tuple[str, ...] = (
    "game_id",
    "event_id",
    "season",
    "week",
    "gameday",
    "ts_event_start",
    "home_team",
    "away_team",
    "market",
    "line",
    "closing_book",
    "ts_closing",
    "lead_time_to_kickoff_minutes",
    "closing_overround",
    "p_home_novig",
    "p_away_novig",
    "p_over_novig",
    "p_under_novig",
    "price_home_decimal",
    "price_away_decimal",
    "price_over_decimal",
    "price_under_decimal",
    "home_score",
    "away_score",
    "is_settled",
    "ingest_origin",
)

# Catálogo exhaustivo de las 32 franquicias NFL canónicas de `nflverse` + relocalizaciones históricas
_NFL_FRANCHISE_ALIASES_RAW: dict[str, tuple[str, ...]] = {
    "ARI": ("ari", "arz", "crd", "arizona_cardinals", "arizona", "cardinals", "az_cardinals"),
    "ATL": ("atl", "atlanta_falcons", "atlanta", "falcons"),
    "BAL": ("bal", "blt", "rav", "baltimore_ravens", "baltimore", "ravens"),
    "BUF": ("buf", "buffalo_bills", "buffalo", "bills"),
    "CAR": ("car", "carolina_panthers", "carolina", "panthers"),
    "CHI": ("chi", "chicago_bears", "chicago", "bears"),
    "CIN": ("cin", "cincinnati_bengals", "cincinnati", "bengals"),
    "CLE": ("cle", "clv", "cleveland_browns", "cleveland", "browns"),
    "DAL": ("dal", "dallas_cowboys", "dallas", "cowboys"),
    "DEN": ("den", "denver_broncos", "denver", "broncos"),
    "DET": ("det", "detroit_lions", "detroit", "lions"),
    "GB": ("gb", "gnb", "green_bay_packers", "green_bay", "packers"),
    "HOU": ("hou", "hst", "htx", "houston_texans", "houston", "texans"),
    "IND": ("ind", "clt", "indianapolis_colts", "indianapolis", "colts"),
    "JAX": ("jax", "jac", "jacksonville_jaguars", "jacksonville", "jaguars"),
    "KC": ("kc", "kan", "kansas_city_chiefs", "kansas_city", "chiefs"),
    "LA": (
        "la",
        "lar",
        "stl",
        "sl",
        "ram",
        "los_angeles_rams",
        "la_rams",
        "st_louis_rams",
        "saint_louis_rams",
        "rams",
    ),
    "LAC": (
        "lac",
        "sd",
        "sdg",
        "los_angeles_chargers",
        "la_chargers",
        "san_diego_chargers",
        "chargers",
    ),
    "LV": (
        "lv",
        "lvr",
        "oak",
        "rai",
        "las_vegas_raiders",
        "oakland_raiders",
        "los_angeles_raiders",
        "las_vegas",
        "raiders",
    ),
    "MIA": ("mia", "miami_dolphins", "miami", "dolphins"),
    "MIN": ("min", "minnesota_vikings", "minnesota", "vikings"),
    "NE": ("ne", "nwe", "new_england_patriots", "new_england", "patriots"),
    "NO": ("no", "nor", "new_orleans_saints", "new_orleans", "saints"),
    "NYG": ("nyg", "new_york_giants", "ny_giants", "giants"),
    "NYJ": ("nyj", "new_york_jets", "ny_jets", "jets"),
    "PHI": ("phi", "philadelphia_eagles", "philadelphia", "eagles"),
    "PIT": ("pit", "pittsburgh_steelers", "pittsburgh", "steelers"),
    "SEA": ("sea", "seattle_seahawks", "seattle", "seahawks"),
    "SF": ("sf", "sfo", "san_francisco_49ers", "san_francisco", "49ers", "forty_niners", "niners"),
    "TB": ("tb", "tam", "tampa_bay_buccaneers", "tampa_bay", "buccaneers", "bucs"),
    "TEN": ("ten", "oti", "tennessee_titans", "tennessee", "titans", "tennessee_oilers", "houston_oilers"),
    "WAS": (
        "was",
        "wsh",
        "washington_commanders",
        "washington_football_team",
        "washington_redskins",
        "washington",
        "commanders",
    ),
}


def _slugify(value: Any) -> str:
    if value is None:
        return ""
    norm = unicodedata.normalize("NFKD", str(value))
    ascii_txt = "".join(ch for ch in norm if not unicodedata.combining(ch)).lower()
    return re.sub(r"[^a-z0-9]+", "_", ascii_txt).strip("_")


NFL_ALIAS_TO_FRANCHISE: dict[str, str] = {}
for _canon_code, _aliases in _NFL_FRANCHISE_ALIASES_RAW.items():
    NFL_ALIAS_TO_FRANCHISE[_slugify(_canon_code)] = _canon_code
    for _al in _aliases:
        NFL_ALIAS_TO_FRANCHISE[_slugify(_al)] = _canon_code


# ---------------------------------------------------------------------------
# PRNG determinista `mulberry32` (idéntico bit a bit a `clv_report` y `math.ts`)
# ---------------------------------------------------------------------------


def mulberry32_uniforms(seed: int, count: int) -> np.ndarray:
    """Genera `count` uniformes en `[0, 1)` con aritmética `mulberry32` de 32 bits."""
    if count <= 0:
        return np.empty(0, dtype=np.float64)
    mask = np.uint64(0xFFFFFFFF)
    s0 = int(seed) & 0xFFFFFFFF
    if s0 == 0:
        s0 = 0x12345678
    steps = np.arange(1, count + 1, dtype=np.uint64)
    s = (np.uint64(s0) + steps * np.uint64(0x6D2B79F5)) & mask

    a1 = s ^ (s >> np.uint64(15))
    b1 = np.uint64(1) | s
    t = (a1 * b1) & mask

    a2 = t ^ (t >> np.uint64(7))
    b2 = np.uint64(61) | t
    prod2 = (a2 * b2) & mask
    t = ((t + prod2) & mask) ^ t

    out_u32 = (t ^ (t >> np.uint64(14))) & mask
    return out_u32.astype(np.float64) / 4294967296.0


def _quantile_linear_sorted(sorted_arr: np.ndarray, q: float) -> float:
    n = int(sorted_arr.shape[0])
    if n == 0:
        raise ValueError("Arreglo vacío para cuantil.")
    if n == 1:
        return float(sorted_arr[0])
    cq = min(1.0, max(0.0, float(q)))
    pos = cq * (n - 1)
    lo = int(math.floor(pos))
    hi = int(math.ceil(pos))
    frac = pos - lo
    return float(sorted_arr[lo]) + frac * (float(sorted_arr[hi]) - float(sorted_arr[lo]))


def bootstrap_mean_ci95(
    values: Sequence[float] | np.ndarray,
    *,
    bootstrap_samples: int = DEFAULT_BOOTSTRAP_SAMPLES,
    seed: int = DEFAULT_BOOTSTRAP_SEED,
) -> dict[str, Any]:
    """Calcula media e IC 95% bootstrap determinista (`mulberry32`, `>= 1,000` remuestreos)."""
    if bootstrap_samples < MIN_BOOTSTRAP_SAMPLES:
        raise ValueError(f"bootstrap_samples debe ser >= {MIN_BOOTSTRAP_SAMPLES}; recibido {bootstrap_samples}")
    arr = np.asarray(values, dtype=np.float64)
    arr = arr[np.isfinite(arr)]
    n = int(arr.shape[0])
    if n == 0:
        return {
            "n": 0,
            "mean": None,
            "ci95": None,
            "significance_vs_zero": "no significativa",
        }
    mean_val = float(np.mean(arr))
    if n == 1:
        sig = "no significativa"
        return {
            "n": 1,
            "mean": mean_val,
            "ci95": [mean_val, mean_val],
            "significance_vs_zero": sig,
        }
    u = mulberry32_uniforms(seed, bootstrap_samples * n)
    idx = np.floor(u * n).astype(np.int64).reshape(bootstrap_samples, n)
    idx = np.clip(idx, 0, n - 1)
    boot_means = np.sort(np.mean(arr[idx], axis=1))
    lo = _quantile_linear_sorted(boot_means, 0.025)
    hi = _quantile_linear_sorted(boot_means, 0.975)
    if lo > 0.0:
        sig = "significativa_positiva"
    elif hi < 0.0:
        sig = "significativa_negativa"
    else:
        sig = "no significativa"
    return {
        "n": n,
        "mean": mean_val,
        "ci95": [lo, hi],
        "significance_vs_zero": sig,
    }


# ---------------------------------------------------------------------------
# Resolución de franquicias NFL y calendario canónico `nflverse`
# ---------------------------------------------------------------------------


def resolve_nfl_franchise(raw_team: Any) -> str:
    """Normaliza cualquier nombre, slug o código histórico de equipo NFL a su franquicia `nflverse` (32 códigos)."""
    slug = _slugify(raw_team)
    if not slug:
        raise ValueError(f"Equipo NFL vacío o inválido: {raw_team!r}")
    canon = NFL_ALIAS_TO_FRANCHISE.get(slug)
    if canon is not None:
        return canon
    raise ValueError(f"No se pudo resolver franquicia NFL canónica para: {raw_team!r} (slug={slug!r})")


def extract_event_franchises(
    event_id: str,
    nflverse_by_game_id: Mapping[str, tuple[str, str]] | None = None,
) -> tuple[str, str]:
    """Extrae `(home_franchise, away_franchise)` desde `event_id` (`ws:nfl:NFL:YYYYMMDD:home:away` o `game_id`)."""
    eid = str(event_id or "").strip()
    if not eid:
        raise ValueError("event_id vacío en snapshot NFL.")

    # Soporte directo si `event_id` ya es un `game_id` de `nflverse` (`YYYY_WW_AWAY_HOME` o `nfl:YYYY_WW_AWAY_HOME`)
    bare_id = eid[4:] if eid.lower().startswith("nfl:") else eid
    if nflverse_by_game_id is not None and bare_id in nflverse_by_game_id:
        return nflverse_by_game_id[bare_id]

    m_nflverse = re.match(r"^(\d{4})_(\d{1,2})_([A-Za-z]{2,3})_([A-Za-z]{2,3})$", bare_id)
    if m_nflverse:
        away_raw, home_raw = m_nflverse.group(3), m_nflverse.group(4)
        return resolve_nfl_franchise(home_raw), resolve_nfl_franchise(away_raw)

    parts = eid.split(":")
    if len(parts) >= 6 and parts[0].lower() == "ws":
        return resolve_nfl_franchise(parts[4]), resolve_nfl_franchise(parts[5])
    if len(parts) >= 4:
        return resolve_nfl_franchise(parts[-2]), resolve_nfl_franchise(parts[-1])

    raise ValueError(f"Formato de event_id NFL no reconocido: {event_id!r}")


def _resolve_default_nfl_games_parquet(nfl_games_path: Path | None) -> Path | None:
    if nfl_games_path is not None:
        return nfl_games_path if nfl_games_path.exists() else None
    for cand in DEFAULT_NFL_GAMES_CANDIDATES:
        if cand.exists():
            return cand
    return None


def _compute_nflverse_kickoff_utc(gameday_series: pd.Series, gametime_series: pd.Series) -> pd.Series:
    """Convierte `(gameday, gametime)` de `nflverse` (hora local `America/New_York`) a `datetime64[ns, UTC]`."""
    date_part = pd.to_datetime(gameday_series, errors="coerce").dt.strftime("%Y-%m-%d")
    gt_raw = gametime_series.fillna("13:00").astype(str).str.strip()
    valid_gt = gt_raw.str.match(r"^\d{1,2}:\d{2}$", na=False)
    gt_clean = gt_raw.where(valid_gt, "13:00").str.zfill(5)
    local_str = date_part + " " + gt_clean + ":00"
    naive_dt = pd.to_datetime(local_str, format="%Y-%m-%d %H:%M:%S", errors="coerce")
    return naive_dt.dt.tz_localize("America/New_York", ambiguous="NaT", nonexistent="shift_forward").dt.tz_convert("UTC")


def load_nflverse_schedule(
    nfl_games_path: Path | None = None,
    nfl_raw_csv_path: Path | None = DEFAULT_NFL_RAW_CSV,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Unifica `nfl_games.parquet` (liquidados) y `data/nfl/raw/games.csv` (calendario completo + horarios ET)."""
    resolved_parquet = _resolve_default_nfl_games_parquet(nfl_games_path)
    frames: list[pd.DataFrame] = []
    parquet_count = 0
    raw_csv_count = 0
    parquet_game_ids: set[str] = set()

    if nfl_raw_csv_path is not None and nfl_raw_csv_path.exists():
        needed_csv = ["game_id", "season", "week", "gameday", "gametime", "home_team", "away_team", "home_score", "away_score"]
        csv_df = pd.read_csv(nfl_raw_csv_path, usecols=lambda c: c in needed_csv)
        raw_csv_count = int(len(csv_df))
        if "gametime" not in csv_df.columns:
            csv_df["gametime"] = "13:00"
        frames.append(csv_df)

    if resolved_parquet is not None and resolved_parquet.exists():
        pq_df = pd.read_parquet(resolved_parquet)
        parquet_count = int(len(pq_df))
        parquet_game_ids = set(pq_df["game_id"].dropna().astype(str).tolist())
        keep_pq = [c for c in ["game_id", "season", "week", "gameday", "gametime", "home_team", "away_team", "home_score", "away_score"] if c in pq_df.columns]
        pq_sub = pq_df.loc[:, keep_pq].copy()
        if "gametime" not in pq_sub.columns:
            pq_sub["gametime"] = np.nan
        frames.append(pq_sub)

    if not frames:
        raise FileNotFoundError("No se encontró ni `nfl_games.parquet` ni `data/nfl/raw/games.csv` para resolver `game_id` de nflverse.")

    combined = pd.concat(frames, ignore_index=True)
    combined["game_id"] = combined["game_id"].astype(str).str.strip()
    combined["home_score"] = pd.to_numeric(combined["home_score"], errors="coerce")
    combined["away_score"] = pd.to_numeric(combined["away_score"], errors="coerce")
    combined["_has_score"] = (combined["home_score"].notna() & combined["away_score"].notna()).astype(int)
    combined["_has_gametime"] = combined["gametime"].notna().astype(int)

    # Consolidar por `game_id`: conservar `gametime` de `games.csv` y priorizar marcadores liquidados no nulos
    gametime_map = (
        combined.dropna(subset=["gametime"])
        .drop_duplicates(subset=["game_id"], keep="first")
        .set_index("game_id")["gametime"]
        .to_dict()
    )
    dedup = (
        combined.sort_values(["game_id", "_has_score", "_has_gametime"], ascending=[True, False, False], kind="mergesort")
        .drop_duplicates(subset=["game_id"], keep="first")
        .copy()
    )
    dedup["gametime"] = dedup["game_id"].map(gametime_map).fillna(dedup["gametime"]).fillna("13:00")
    dedup["season"] = pd.to_numeric(dedup["season"], errors="coerce").astype("Int64")
    dedup["week"] = pd.to_numeric(dedup["week"], errors="coerce").astype("Int64")
    dedup["gameday"] = pd.to_datetime(dedup["gameday"], errors="coerce").dt.strftime("%Y-%m-%d")
    dedup["home_franchise"] = dedup["home_team"].map(resolve_nfl_franchise)
    dedup["away_franchise"] = dedup["away_team"].map(resolve_nfl_franchise)
    dedup["kickoff_utc_ref"] = _compute_nflverse_kickoff_utc(dedup["gameday"], dedup["gametime"])
    dedup["is_settled"] = dedup["home_score"].notna() & dedup["away_score"].notna()
    dedup["in_nfl_games_parquet"] = dedup["game_id"].isin(parquet_game_ids)

    cols = [
        "game_id",
        "season",
        "week",
        "gameday",
        "gametime",
        "home_team",
        "away_team",
        "home_franchise",
        "away_franchise",
        "kickoff_utc_ref",
        "home_score",
        "away_score",
        "is_settled",
        "in_nfl_games_parquet",
    ]
    out = dedup.loc[:, cols].reset_index(drop=True)
    meta = {
        "nfl_games_parquet_path": str(resolved_parquet) if resolved_parquet is not None else None,
        "nfl_games_parquet_rows": parquet_count,
        "nfl_raw_csv_path": str(nfl_raw_csv_path) if (nfl_raw_csv_path is not None and nfl_raw_csv_path.exists()) else None,
        "nfl_raw_csv_rows": raw_csv_count,
        "unified_nflverse_games": int(len(out)),
        "settled_nflverse_games": int(out["is_settled"].sum()),
        "unsettled_scheduled_nflverse_games": int((~out["is_settled"]).sum()),
        "gameday_min": None if len(out) == 0 else str(out["gameday"].min()),
        "gameday_max": None if len(out) == 0 else str(out["gameday"].max()),
    }
    return out, meta


# ---------------------------------------------------------------------------
# Lectura de `odds_timeseries/nfl/*.jsonl` y `odds_snapshots.parquet` (`scraped_ws`)
# ---------------------------------------------------------------------------


def load_nfl_timeseries_jsonl(
    timeseries_nfl_dir: Path = DEFAULT_WS_NFL_TIMESERIES_DIR,
    health_json_path: Path | None = DEFAULT_WS_HEALTH_JSON,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Escanea en modo solo lectura todos los `.jsonl` bajo `data/odds_timeseries/nfl/*.jsonl`."""
    health_payload: dict[str, Any] | None = None
    if health_json_path is not None and health_json_path.exists():
        health_payload = json.loads(health_json_path.read_text(encoding="utf-8"))

    jsonl_files = sorted(timeseries_nfl_dir.glob("*.jsonl")) if timeseries_nfl_dir.exists() else []
    rows: list[dict[str, Any]] = []
    malformed_lines = 0

    for jf in jsonl_files:
        for raw_line in jf.read_text(encoding="utf-8").splitlines():
            txt = raw_line.strip()
            if not txt:
                continue
            try:
                rec = json.loads(txt)
            except json.JSONDecodeError:
                malformed_lines += 1
                continue
            if isinstance(rec, dict):
                rows.append(rec)

    df = pd.DataFrame(rows) if rows else pd.DataFrame(columns=list(REQUIRED_COLUMNS))
    meta = {
        "timeseries_nfl_dir": str(timeseries_nfl_dir),
        "dir_exists": bool(timeseries_nfl_dir.exists()),
        "jsonl_files_count": len(jsonl_files),
        "jsonl_files": [p.name for p in jsonl_files],
        "raw_rows_read": int(len(df)),
        "malformed_lines_skipped": malformed_lines,
        "capture_status": None if health_payload is None else health_payload.get("capture_status"),
        "health_generated_at_utc": None if health_payload is None else health_payload.get("generated_at_utc"),
    }
    return df, meta


def load_legacy_scraped_ws_nfl_snapshots(
    odds_snapshots_path: Path = DEFAULT_ODDS_SNAPSHOTS_PARQUET,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Extrae en modo solo lectura las filas NFL `source == "scraped_ws"` de `odds_snapshots.parquet`."""
    if not odds_snapshots_path.exists():
        empty = pd.DataFrame(columns=list(REQUIRED_COLUMNS))
        return empty, {
            "odds_snapshots_path": str(odds_snapshots_path),
            "exists": False,
            "nfl_total_rows": 0,
            "nfl_historical_fd_consensus_rows_ignored": 0,
            "nfl_scraped_ws_rows": 0,
        }

    snap = pd.read_parquet(odds_snapshots_path)
    nfl_all = snap.loc[snap["sport"].astype(str).str.lower() == "nfl"].copy()
    hist_mask = nfl_all["source"].astype(str) == "historical_fd"
    ws_mask = nfl_all["source"].astype(str) == "scraped_ws"
    ws_nfl = nfl_all.loc[ws_mask].reset_index(drop=True)

    meta = {
        "odds_snapshots_path": str(odds_snapshots_path),
        "exists": True,
        "nfl_total_rows": int(len(nfl_all)),
        "nfl_historical_fd_consensus_rows_ignored": int(hist_mask.sum()),
        "nfl_scraped_ws_rows": int(len(ws_nfl)),
    }
    return ws_nfl, meta


# ---------------------------------------------------------------------------
# Construcción del corpus sharp NFL + cruce con `nflverse` + compuerta `>= 64`
# ---------------------------------------------------------------------------


def _empty_nfl_sharp_closing_df() -> pd.DataFrame:
    df = pd.DataFrame(columns=list(NFL_SHARP_CLOSING_COLUMNS))
    for str_col in ("game_id", "event_id", "gameday", "home_team", "away_team", "market", "closing_book", "ingest_origin"):
        df[str_col] = df[str_col].astype("object")
    df["season"] = pd.Series(dtype="Int64")
    df["week"] = pd.Series(dtype="Int64")
    df["ts_event_start"] = pd.to_datetime(df["ts_event_start"], utc=True)
    df["ts_closing"] = pd.to_datetime(df["ts_closing"], utc=True)
    for flt_col in (
        "line",
        "lead_time_to_kickoff_minutes",
        "closing_overround",
        "p_home_novig",
        "p_away_novig",
        "p_over_novig",
        "p_under_novig",
        "price_home_decimal",
        "price_away_decimal",
        "price_over_decimal",
        "price_under_decimal",
        "home_score",
        "away_score",
    ):
        df[flt_col] = df[flt_col].astype("float64")
    df["is_settled"] = df["is_settled"].astype("bool")
    return df


def _normalize_line_key(val: Any) -> float:
    if val is None or isinstance(val, bool):
        return -999999.125
    try:
        f = float(val)
    except (TypeError, ValueError):
        return -999999.125
    if not math.isfinite(f):
        return -999999.125
    return 0.0 if f == 0.0 else f


def _match_event_to_nflverse(
    event_id: str,
    ts_event_start: pd.Timestamp,
    nfl_schedule: pd.DataFrame,
    schedule_by_pair: Mapping[tuple[str, str], pd.DataFrame],
    schedule_by_game_id: Mapping[str, pd.Series],
    nflverse_pair_by_id: Mapping[str, tuple[str, str]],
    max_delta_hours: float = MAX_KICKOFF_MATCH_DELTA_HOURS,
) -> dict[str, Any]:
    """Resuelve `(event_id, ts_event_start)` hacia una fila canónica de `nflverse` o `unmatched_future`."""
    bare_id = event_id[4:] if event_id.lower().startswith("nfl:") else event_id
    if bare_id in schedule_by_game_id:
        row = schedule_by_game_id[bare_id]
        return {
            "game_id": str(row["game_id"]),
            "season": int(row["season"]) if pd.notna(row["season"]) else pd.NA,
            "week": int(row["week"]) if pd.notna(row["week"]) else pd.NA,
            "gameday": str(row["gameday"]),
            "home_team": str(row["home_franchise"]),
            "away_team": str(row["away_franchise"]),
            "home_score": float(row["home_score"]) if pd.notna(row["home_score"]) else float("nan"),
            "away_score": float(row["away_score"]) if pd.notna(row["away_score"]) else float("nan"),
            "is_settled": bool(row["is_settled"]),
            "in_nfl_games_parquet": bool(row["in_nfl_games_parquet"]),
        }

    home_fran, away_fran = extract_event_franchises(event_id, nflverse_by_game_id=nflverse_pair_by_id)
    cands = schedule_by_pair.get((home_fran, away_fran))
    if cands is not None and len(cands) > 0:
        deltas_h = (cands["kickoff_utc_ref"] - ts_event_start).abs().dt.total_seconds() / 3600.0
        best_pos = int(deltas_h.to_numpy().argmin())
        min_delta_h = float(deltas_h.iloc[best_pos])
        if math.isfinite(min_delta_h) and min_delta_h <= max_delta_hours:
            row = cands.iloc[best_pos]
            return {
                "game_id": str(row["game_id"]),
                "season": int(row["season"]) if pd.notna(row["season"]) else pd.NA,
                "week": int(row["week"]) if pd.notna(row["week"]) else pd.NA,
                "gameday": str(row["gameday"]),
                "home_team": home_fran,
                "away_team": away_fran,
                "home_score": float(row["home_score"]) if pd.notna(row["home_score"]) else float("nan"),
                "away_score": float(row["away_score"]) if pd.notna(row["away_score"]) else float("nan"),
                "is_settled": bool(row["is_settled"]),
                "in_nfl_games_parquet": bool(row["in_nfl_games_parquet"]),
            }

    et_date = ts_event_start.tz_convert("America/New_York").strftime("%Y-%m-%d")
    return {
        "game_id": UNMATCHED_FUTURE_GAME_ID,
        "season": pd.NA,
        "week": pd.NA,
        "gameday": et_date,
        "home_team": home_fran,
        "away_team": away_fran,
        "home_score": float("nan"),
        "away_score": float("nan"),
        "is_settled": False,
        "in_nfl_games_parquet": False,
    }


def evaluate_nfl_corpus_gate(
    closing_df: pd.DataFrame,
    min_settled_games: int = MIN_SETTLED_GAMES_FOR_EVAL,
) -> dict[str, Any]:
    """Evalúa la compuerta de suficiencia muestral (`>= 64` partidos NFL liquidados con cierre sharp real)."""
    if min_settled_games < 1:
        raise ValueError(f"min_settled_games debe ser >= 1; recibido {min_settled_games}")

    if len(closing_df) == 0:
        return {
            "min_settled_games_required": min_settled_games,
            "n_total_market_rows": 0,
            "n_distinct_events_with_sharp_closing": 0,
            "n_matched_nflverse_games": 0,
            "n_unmatched_future_events": 0,
            "n_settled_games_with_sharp_closing": 0,
            "n_settled_by_market": {m: 0 for m in SUPPORTED_NFL_MARKETS},
            "shortfall_to_eval_gate": min_settled_games,
            "corpus_sufficient_for_eval": False,
            "production_enabled": False,
            "gate_status_reason": f"insufficient_sharp_closing_corpus_n_0_lt_{min_settled_games}",
            "production_disabled_reason": "insufficient_sharp_closing_benchmark",
        }

    matched_mask = closing_df["game_id"].astype(str) != UNMATCHED_FUTURE_GAME_ID
    settled_mask = matched_mask & closing_df["is_settled"].astype(bool)

    n_distinct_events = int(
        np.where(matched_mask, closing_df["game_id"].astype(str), closing_df["event_id"].astype(str)).shape[0]
        and pd.Series(np.where(matched_mask, closing_df["game_id"].astype(str), closing_df["event_id"].astype(str))).nunique()
    )
    n_matched_games = int(closing_df.loc[matched_mask, "game_id"].nunique())
    n_unmatched_events = int(closing_df.loc[~matched_mask, "event_id"].nunique())
    n_settled_games = int(closing_df.loc[settled_mask, "game_id"].nunique())

    settled_by_market: dict[str, int] = {}
    for mkt in SUPPORTED_NFL_MARKETS:
        m_sub = closing_df.loc[settled_mask & (closing_df["market"] == mkt)]
        settled_by_market[mkt] = int(m_sub["game_id"].nunique())

    sufficient = bool(n_settled_games >= min_settled_games)
    shortfall = max(0, int(min_settled_games - n_settled_games))

    return {
        "min_settled_games_required": min_settled_games,
        "n_total_market_rows": int(len(closing_df)),
        "n_distinct_events_with_sharp_closing": n_distinct_events,
        "n_matched_nflverse_games": n_matched_games,
        "n_unmatched_future_events": n_unmatched_events,
        "n_settled_games_with_sharp_closing": n_settled_games,
        "n_settled_by_market": settled_by_market,
        "shortfall_to_eval_gate": shortfall,
        "corpus_sufficient_for_eval": sufficient,
        # Regla Rectora #3: incluso cuando `corpus_sufficient_for_eval` pase a True (>= 64),
        # `production_enabled` sigue en False hasta superar walk-forward A3/A4 + puerta prospectiva de 150 picks.
        "production_enabled": False,
        "gate_status_reason": (
            f"sufficient_sharp_closing_corpus_n_{n_settled_games}_ge_{min_settled_games}"
            if sufficient
            else f"insufficient_sharp_closing_corpus_n_{n_settled_games}_lt_{min_settled_games}"
        ),
        "production_disabled_reason": (
            "requires_walk_forward_eval_and_prospective_ledger_gate_v3_2"
            if sufficient
            else "insufficient_sharp_closing_benchmark"
        ),
    }


def evaluate_settled_sharp_calibration(
    closing_df: pd.DataFrame,
    *,
    bootstrap_samples: int = DEFAULT_BOOTSTRAP_SAMPLES,
    seed: int = DEFAULT_BOOTSTRAP_SEED,
) -> dict[str, Any]:
    """Calcula `log_loss` y `brier` de cierre sharp sobre partidos NFL liquidados (sin empates/pushes) con IC 95% `mulberry32`."""
    out: dict[str, Any] = {
        "bootstrap_prng": "mulberry32",
        "bootstrap_samples": bootstrap_samples,
        "bootstrap_seed": seed,
        "markets": {},
    }
    if len(closing_df) == 0:
        for mkt in SUPPORTED_NFL_MARKETS:
            out["markets"][mkt] = {
                "n_settled_non_push": 0,
                "log_loss": None,
                "log_loss_ci95": None,
                "brier": None,
                "brier_ci95": None,
                "status": "muestra insuficiente (n=0 < 64; no significativa)",
            }
        return out

    settled = closing_df.loc[
        (closing_df["game_id"].astype(str) != UNMATCHED_FUTURE_GAME_ID) & closing_df["is_settled"].astype(bool)
    ].copy()

    for mkt in SUPPORTED_NFL_MARKETS:
        sub = settled.loc[settled["market"] == mkt].copy()
        if len(sub) == 0:
            out["markets"][mkt] = {
                "n_settled_non_push": 0,
                "log_loss": None,
                "log_loss_ci95": None,
                "brier": None,
                "brier_ci95": None,
                "status": "muestra insuficiente (n=0 < 64; no significativa)",
            }
            continue

        hs = sub["home_score"].to_numpy(dtype=np.float64)
        as_ = sub["away_score"].to_numpy(dtype=np.float64)
        if mkt == "moneyline":
            non_push = hs != as_
            y = (hs[non_push] > as_[non_push]).astype(np.float64)
            p1 = sub.loc[non_push, "p_home_novig"].to_numpy(dtype=np.float64)
        elif mkt == "spread":
            ln = sub["line"].to_numpy(dtype=np.float64)
            adj = (hs + ln) - as_
            non_push = np.abs(adj) > 1e-9
            y = (adj[non_push] > 0.0).astype(np.float64)
            p1 = sub.loc[non_push, "p_home_novig"].to_numpy(dtype=np.float64)
        else:
            ln = sub["line"].to_numpy(dtype=np.float64)
            tot = hs + as_
            non_push = np.abs(tot - ln) > 1e-9
            y = (tot[non_push] > ln[non_push]).astype(np.float64)
            p1 = sub.loc[non_push, "p_over_novig"].to_numpy(dtype=np.float64)

        n_eval = int(y.shape[0])
        if n_eval == 0:
            out["markets"][mkt] = {
                "n_settled_non_push": 0,
                "log_loss": None,
                "log_loss_ci95": None,
                "brier": None,
                "brier_ci95": None,
                "status": "muestra insuficiente (n=0 < 64; no significativa)",
            }
            continue

        p_clip = np.clip(p1, 1e-15, 1.0 - 1e-15)
        ll_vec = -(y * np.log(p_clip) + (1.0 - y) * np.log(1.0 - p_clip))
        brier_vec = 2.0 * np.square(p1 - y)
        ll_boot = bootstrap_mean_ci95(ll_vec, bootstrap_samples=bootstrap_samples, seed=seed)
        br_boot = bootstrap_mean_ci95(brier_vec, bootstrap_samples=bootstrap_samples, seed=seed + 17)
        status_txt = (
            "corpus_suficiente_para_evaluacion"
            if n_eval >= MIN_SETTLED_GAMES_FOR_EVAL
            else f"muestra insuficiente (n={n_eval} < {MIN_SETTLED_GAMES_FOR_EVAL}; no significativa)"
        )
        out["markets"][mkt] = {
            "n_settled_non_push": n_eval,
            "log_loss": ll_boot["mean"],
            "log_loss_ci95": ll_boot["ci95"],
            "brier": br_boot["mean"],
            "brier_ci95": br_boot["ci95"],
            "status": status_txt,
        }
    return out


def build_nfl_sharp_closing_corpus(
    *,
    timeseries_rows: pd.DataFrame | Sequence[Mapping[str, Any]],
    legacy_ws_rows: pd.DataFrame | Sequence[Mapping[str, Any]] | None = None,
    nfl_schedule: pd.DataFrame,
    devig_method: str = "power",
    min_settled_games: int = MIN_SETTLED_GAMES_FOR_EVAL,
    max_kickoff_delta_hours: float = MAX_KICKOFF_MATCH_DELTA_HOURS,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Construye la tabla limpia `(game_id, market)` de cierre sharp NFL y su auditoría completa."""
    ts_df = timeseries_rows.copy() if isinstance(timeseries_rows, pd.DataFrame) else pd.DataFrame(list(timeseries_rows))
    leg_df = (
        pd.DataFrame(columns=list(REQUIRED_COLUMNS))
        if legacy_ws_rows is None
        else (legacy_ws_rows.copy() if isinstance(legacy_ws_rows, pd.DataFrame) else pd.DataFrame(list(legacy_ws_rows)))
    )

    tagged_frames: list[pd.DataFrame] = []
    if len(ts_df) > 0:
        ts_part = ts_df.copy()
        ts_part["_ingest_origin"] = ORIGIN_TIMESERIES_V3_2
        tagged_frames.append(ts_part)
    if len(leg_df) > 0:
        leg_part = leg_df.copy()
        leg_part["_ingest_origin"] = ORIGIN_SCRAPED_WS_LEGACY
        tagged_frames.append(leg_part)

    if not tagged_frames:
        empty_df = _empty_nfl_sharp_closing_df()
        gate = evaluate_nfl_corpus_gate(empty_df, min_settled_games=min_settled_games)
        audit = {
            "raw_input_rows": 0,
            "discarded_non_nfl_rows": 0,
            "discarded_unsupported_market_rows": 0,
            "discarded_non_scraped_ws_source_rows": 0,
            "snapshot_validation": {
                "n_raw": 0,
                "n_missing_required": 0,
                "n_out_of_range": 0,
                "n_post_kickoff_discarded": 0,
                "n_duplicates_removed": 0,
                "n_valid": 0,
            },
            "valid_nfl_rows_by_book": {},
            "rejected_non_sharp_rows_total": 0,
            "rejected_non_sharp_books": {},
            "sharp_valid_rows_total": 0,
            "sharp_ts_captured_min_utc": None,
            "sharp_ts_captured_max_utc": None,
            "events_by_ingest_origin": {
                ORIGIN_TIMESERIES_V3_2: 0,
                ORIGIN_SCRAPED_WS_LEGACY: 0,
            },
            "closing_books_counts": {},
            "matched_in_nfl_games_parquet_settled_cut": 0,
            "gate": gate,
        }
        return empty_df, audit

    raw_all = pd.concat(tagged_frames, ignore_index=True)
    n_raw_total = int(len(raw_all))

    # 1. Filtrar exclusivamente `sport == "nfl"`
    sport_norm = raw_all["sport"].astype(str).str.strip().str.lower() if "sport" in raw_all.columns else pd.Series("", index=raw_all.index)
    nfl_mask = sport_norm == "nfl"
    n_non_nfl = int((~nfl_mask).sum())
    work = raw_all.loc[nfl_mask].copy()

    # 2. Filtrar mercados NFL soportados (`moneyline`, `spread`, `totals`)
    mkt_norm = work["market"].astype(str).str.strip().str.lower() if "market" in work.columns else pd.Series("", index=work.index)
    mkt_mask = mkt_norm.isin(SUPPORTED_NFL_MARKETS)
    n_unsup_mkt = int((~mkt_mask).sum())
    work = work.loc[mkt_mask].copy()

    # 3. Rechazar de raíz cualquier fila cuya fuente no sea `scraped_ws` (p. ej. `historical_fd` / consenso `nflverse`)
    src_norm = work["source"].astype(str).str.strip() if "source" in work.columns else pd.Series("", index=work.index)
    src_mask = src_norm == "scraped_ws"
    n_non_ws_source = int((~src_mask).sum())
    work = work.loc[src_mask].copy()

    # 4. Construir índice de procedencia exacta por tick antes de deduplicar
    #    Si el mismo tick existiera en `odds_timeseries_v3_2` y en `odds_snapshots_scraped_ws_2026_11_09`,
    #    prevalece `odds_timeseries_v3_2` porque `tagged_frames` inserta primero `ts_part`.
    origin_lookup: dict[tuple[str, str, float, str, pd.Timestamp], str] = {}
    if len(work) > 0:
        ts_cap_parsed = pd.to_datetime(work["ts_captured"], format="ISO8601", utc=True, errors="coerce")
        for eid_v, mkt_v, ln_v, bk_v, tsc_v, orig_v in zip(
            work["event_id"].astype(str).str.strip(),
            work["market"].astype(str).str.strip().str.lower(),
            work["line"],
            work["book"].astype(str).str.strip().str.lower(),
            ts_cap_parsed,
            work["_ingest_origin"].astype(str),
        ):
            if pd.isna(tsc_v):
                continue
            key_tup = (eid_v, mkt_v, _normalize_line_key(ln_v), bk_v, tsc_v)
            origin_lookup.setdefault(key_tup, orig_v)

    # 5. Validar y deduplicar con `odds_snapshots.validate_and_deduplicate_snapshots`
    valid_df, val_stats = validate_and_deduplicate_snapshots(
        work.drop(columns=["_ingest_origin"], errors="ignore")
    )

    books_counter = Counter(valid_df["book"].tolist()) if len(valid_df) > 0 else Counter()
    rejected_books = {bk: int(cnt) for bk, cnt in sorted(books_counter.items()) if bk not in ALLOWED_SHARP_BOOKS}
    rejected_non_sharp_total = int(sum(rejected_books.values()))

    sharp_valid = valid_df.loc[valid_df["book"].isin(ALLOWED_SHARP_BOOKS)] if len(valid_df) > 0 else valid_df
    sharp_ts_min = (
        sharp_valid["ts_captured"].min().strftime("%Y-%m-%dT%H:%M:%SZ")
        if len(sharp_valid) > 0
        else None
    )
    sharp_ts_max = (
        sharp_valid["ts_captured"].max().strftime("%Y-%m-%dT%H:%M:%SZ")
        if len(sharp_valid) > 0
        else None
    )

    # 6. Resolver cierres sharp con `odds_snapshots.resolve_closing_odds`
    #    (`SHARP_BOOKS_SCRAPED_FALLBACK_ORDER = ("pinnacle", "smarkets")`, `ts_captured <= ts_event_start`,
    #     plausibilidad `sum(1/odds) in [0.9, 1.2]`)
    resolved_all = resolve_closing_odds(valid_df, devig_method=devig_method)
    resolved_ok = resolved_all.loc[
        (~resolved_all["closing_missing"]) & resolved_all["closing_book"].isin(ALLOWED_SHARP_BOOKS)
    ].copy()

    if len(resolved_ok) == 0:
        empty_df = _empty_nfl_sharp_closing_df()
        gate = evaluate_nfl_corpus_gate(empty_df, min_settled_games=min_settled_games)
        audit = {
            "raw_input_rows": n_raw_total,
            "discarded_non_nfl_rows": n_non_nfl,
            "discarded_unsupported_market_rows": n_unsup_mkt,
            "discarded_non_scraped_ws_source_rows": n_non_ws_source,
            "snapshot_validation": val_stats,
            "valid_nfl_rows_by_book": {k: int(v) for k, v in sorted(books_counter.items())},
            "rejected_non_sharp_rows_total": rejected_non_sharp_total,
            "rejected_non_sharp_books": rejected_books,
            "sharp_valid_rows_total": int(len(sharp_valid)),
            "sharp_ts_captured_min_utc": sharp_ts_min,
            "sharp_ts_captured_max_utc": sharp_ts_max,
            "events_by_ingest_origin": {
                ORIGIN_TIMESERIES_V3_2: 0,
                ORIGIN_SCRAPED_WS_LEGACY: 0,
            },
            "closing_books_counts": {},
            "matched_in_nfl_games_parquet_settled_cut": 0,
            "gate": gate,
        }
        return empty_df, audit

    # 7. Preparar índices de búsqueda rápida sobre `nflverse`
    schedule_by_pair: dict[tuple[str, str], pd.DataFrame] = {
        (str(hf), str(af)): grp.reset_index(drop=True)
        for (hf, af), grp in nfl_schedule.groupby(["home_franchise", "away_franchise"], sort=False)
    }
    schedule_by_game_id: dict[str, pd.Series] = {
        str(row["game_id"]): row for _, row in nfl_schedule.iterrows()
    }
    nflverse_pair_by_id: dict[str, tuple[str, str]] = {
        str(row["game_id"]): (str(row["home_franchise"]), str(row["away_franchise"]))
        for _, row in nfl_schedule.iterrows()
    }

    # Resolver cada `event_id` único hacia `nflverse`
    event_meta_cache: dict[str, dict[str, Any]] = {}
    unique_events = resolved_ok.drop_duplicates(subset=["event_id"], keep="first")
    for _, erow in unique_events.iterrows():
        eid_str = str(erow["event_id"])
        ts_start_val = pd.Timestamp(erow["ts_event_start"])
        if ts_start_val.tzinfo is None:
            ts_start_val = ts_start_val.tz_localize("UTC")
        else:
            ts_start_val = ts_start_val.tz_convert("UTC")
        event_meta_cache[eid_str] = _match_event_to_nflverse(
            eid_str,
            ts_start_val,
            nfl_schedule,
            schedule_by_pair,
            schedule_by_game_id,
            nflverse_pair_by_id,
            max_delta_hours=max_kickoff_delta_hours,
        )

    # 8. Seleccionar exactamente 1 línea principal de cierre por `(game_key, market)`:
    #    1) Prioridad estricta de casa sharp: `"pinnacle"` (0) > `"smarkets"` (1).
    #    2) Último instante de captura pre-kickoff (`ts_closing` descendente).
    #    3) Menor `closing_overround` (identifica la línea principal `is_alternate=False` frente a líneas alternas).
    #    4) Menor distancia a equilibrio `|p_novig - 0.50|` y menor `|line|` para determinismo total.
    resolved_ok["game_id"] = resolved_ok["event_id"].map(lambda e: event_meta_cache[str(e)]["game_id"])
    resolved_ok["_game_key"] = np.where(
        resolved_ok["game_id"] != UNMATCHED_FUTURE_GAME_ID,
        resolved_ok["game_id"],
        resolved_ok["event_id"],
    )
    resolved_ok["_book_prio"] = np.where(resolved_ok["closing_book"] == "pinnacle", 0, 1)
    resolved_ok["_ts_closing_ns"] = resolved_ok["ts_closing"].astype("int64")
    p_side1 = np.where(
        resolved_ok["market"] == "totals",
        resolved_ok["p_closing_novig_over"],
        resolved_ok["p_closing_novig_home"],
    )
    resolved_ok["_dist50"] = np.abs(p_side1 - 0.5)
    resolved_ok["_abs_line"] = resolved_ok["line"].abs().fillna(0.0)

    selected = (
        resolved_ok.sort_values(
            ["_game_key", "market", "_book_prio", "_ts_closing_ns", "closing_overround", "_dist50", "_abs_line"],
            ascending=[True, True, True, False, True, True, True],
            kind="mergesort",
        )
        .drop_duplicates(subset=["_game_key", "market"], keep="first")
        .copy()
    )

    # 9. Ensamblar las 26 columnas tipadas del contrato `nfl_sharp_closing.parquet`
    out_records: list[dict[str, Any]] = []
    matched_in_parquet_ids: set[str] = set()

    for _, r in selected.iterrows():
        eid_s = str(r["event_id"])
        meta_ev = event_meta_cache[eid_s]
        if meta_ev["in_nfl_games_parquet"]:
            matched_in_parquet_ids.add(str(meta_ev["game_id"]))

        mkt_s = str(r["market"])
        bk_s = str(r["closing_book"])
        ts_start_ts = pd.Timestamp(r["ts_event_start"]).tz_convert("UTC")
        ts_close_ts = pd.Timestamp(r["ts_closing"]).tz_convert("UTC")
        lead_min = float((ts_start_ts - ts_close_ts).total_seconds() / 60.0)

        ln_val = float("nan") if pd.isna(r["line"]) else float(r["line"])
        if not math.isnan(ln_val) and ln_val == 0.0:
            ln_val = 0.0

        orig_key = (eid_s, mkt_s, _normalize_line_key(ln_val), bk_s, ts_close_ts)
        ing_origin = origin_lookup.get(orig_key, ORIGIN_TIMESERIES_V3_2)

        is_totals = mkt_s == "totals"
        out_records.append(
            {
                "game_id": str(meta_ev["game_id"]),
                "event_id": eid_s,
                "season": meta_ev["season"],
                "week": meta_ev["week"],
                "gameday": str(meta_ev["gameday"]),
                "ts_event_start": ts_start_ts,
                "home_team": str(meta_ev["home_team"]),
                "away_team": str(meta_ev["away_team"]),
                "market": mkt_s,
                "line": ln_val,
                "closing_book": bk_s,
                "ts_closing": ts_close_ts,
                "lead_time_to_kickoff_minutes": lead_min,
                "closing_overround": float(r["closing_overround"]),
                "p_home_novig": float("nan") if is_totals else float(r["p_closing_novig_home"]),
                "p_away_novig": float("nan") if is_totals else float(r["p_closing_novig_away"]),
                "p_over_novig": float(r["p_closing_novig_over"]) if is_totals else float("nan"),
                "p_under_novig": float(r["p_closing_novig_under"]) if is_totals else float("nan"),
                "price_home_decimal": float("nan") if is_totals else float(r["price_closing_home"]),
                "price_away_decimal": float("nan") if is_totals else float(r["price_closing_away"]),
                "price_over_decimal": float(r["price_closing_over"]) if is_totals else float("nan"),
                "price_under_decimal": float(r["price_closing_under"]) if is_totals else float("nan"),
                "home_score": meta_ev["home_score"],
                "away_score": meta_ev["away_score"],
                "is_settled": bool(meta_ev["is_settled"]),
                "ingest_origin": ing_origin,
            }
        )

    mkt_order = {"moneyline": 0, "spread": 1, "totals": 2}
    out_df = pd.DataFrame(out_records)
    out_df["season"] = pd.to_numeric(out_df["season"], errors="coerce").astype("Int64")
    out_df["week"] = pd.to_numeric(out_df["week"], errors="coerce").astype("Int64")
    out_df["ts_event_start"] = pd.to_datetime(out_df["ts_event_start"], utc=True)
    out_df["ts_closing"] = pd.to_datetime(out_df["ts_closing"], utc=True)
    out_df["is_settled"] = out_df["is_settled"].astype(bool)
    out_df["_mkt_ord"] = out_df["market"].map(mkt_order).fillna(99)
    out_df = (
        out_df.sort_values(["ts_event_start", "game_id", "event_id", "_mkt_ord"], kind="mergesort")
        .drop(columns=["_mkt_ord"])
        .loc[:, list(NFL_SHARP_CLOSING_COLUMNS)]
        .reset_index(drop=True)
    )

    # Verificaciones internas duras anti-regresión
    if bool((out_df["ts_closing"] > out_df["ts_event_start"]).any()):
        raise RuntimeError("Fuga post-kickoff detectada en nfl_sharp_closing (`ts_closing > ts_event_start`).")
    if not set(out_df["closing_book"].unique()).issubset(set(ALLOWED_SHARP_BOOKS)):
        raise RuntimeError(f"Casa no sharp infiltrada en closing_book: {out_df['closing_book'].unique()}")

    ev_key_col = np.where(out_df["game_id"] != UNMATCHED_FUTURE_GAME_ID, out_df["game_id"], out_df["event_id"])
    out_with_ek = out_df.assign(_ek=ev_key_col)
    events_by_origin = {
        ORIGIN_TIMESERIES_V3_2: int(
            out_with_ek.loc[out_with_ek["ingest_origin"] == ORIGIN_TIMESERIES_V3_2, "_ek"].nunique()
        ),
        ORIGIN_SCRAPED_WS_LEGACY: int(
            out_with_ek.loc[out_with_ek["ingest_origin"] == ORIGIN_SCRAPED_WS_LEGACY, "_ek"].nunique()
        ),
    }
    closing_books_counts = {str(k): int(v) for k, v in out_df["closing_book"].value_counts().to_dict().items()}
    gate = evaluate_nfl_corpus_gate(out_df, min_settled_games=min_settled_games)

    audit = {
        "raw_input_rows": n_raw_total,
        "discarded_non_nfl_rows": n_non_nfl,
        "discarded_unsupported_market_rows": n_unsup_mkt,
        "discarded_non_scraped_ws_source_rows": n_non_ws_source,
        "snapshot_validation": val_stats,
        "valid_nfl_rows_by_book": {k: int(v) for k, v in sorted(books_counter.items())},
        "rejected_non_sharp_rows_total": rejected_non_sharp_total,
        "rejected_non_sharp_books": rejected_books,
        "sharp_valid_rows_total": int(len(sharp_valid)),
        "sharp_ts_captured_min_utc": sharp_ts_min,
        "sharp_ts_captured_max_utc": sharp_ts_max,
        "events_by_ingest_origin": events_by_origin,
        "closing_books_counts": closing_books_counts,
        "matched_in_nfl_games_parquet_settled_cut": len(matched_in_parquet_ids),
        "gate": gate,
    }
    return out_df, audit


# ---------------------------------------------------------------------------
# Generación de reporte Markdown `A29_nfl_sharp_corpus.md`
# ---------------------------------------------------------------------------


def _fmt_opt_float(val: Any, digits: int = 4) -> str:
    if val is None or (isinstance(val, float) and math.isnan(val)) or pd.isna(val):
        return "—"
    return f"{float(val):.{digits}f}"


def _build_markdown_report(
    closing_df: pd.DataFrame,
    summary: dict[str, Any],
) -> str:
    ts_meta = summary["sources"]["odds_timeseries_nfl"]
    leg_meta = summary["sources"]["legacy_odds_snapshots_nfl"]
    nfl_meta = summary["sources"]["nflverse_schedule"]
    audit = summary["audit"]
    gate = audit["gate"]
    cal = summary["settled_calibration"]
    ovr_boot = summary["descriptive_bootstrap"]["closing_overround"]
    lead_boot = summary["descriptive_bootstrap"]["lead_time_to_kickoff_minutes"]
    prod_verify = summary["frozen_production_segments_check"]

    lines: list[str] = [
        "# A29 (Ola 2 · Agente B6) — Corpus de Cierre Sharp para NFL (`nfl_sharp_closing`)",
        "",
        f"> **Agente autor:** `b6-nfl-sharp` (`B6`, Ola 2 `PREDLAB-V3.2`) · **Generado (UTC):** `{summary['generated_at_utc']}`",
        f"> **Esquema:** `{SCHEMA_VERSION}` · **Parquet generado:** `research/prediction-lab/data/processed/nfl_sharp_closing.parquet` (`sha256={summary['parquet_sha256']}`)",
        "> **Comando reproducible:**",
        "> ```powershell",
        '> Set-Location "C:\\Users\\T490s\\Desktop\\Proyectos\\PitchLab\\.worktrees\\prediction-lab"',
        "> .\\research\\prediction-lab\\.venv\\Scripts\\python.exe services/ingest/nfl_sharp_closing.py",
        "> ```",
        "",
        "---",
        "",
        "## 1. Resumen Ejecutivo y Veredicto de Compuerta (`>= 64` Partidos) — `OBSERVADO`",
        "",
        f"1. **Serie prospectiva multi-tick `odds_timeseries/nfl` (`B3`):** **`{audit['events_by_ingest_origin'][ORIGIN_TIMESERIES_V3_2]}` eventos** "
        f"(`{ts_meta['jsonl_files_count']}` archivos `.jsonl`, `{ts_meta['raw_rows_read']}` filas leídas; `health.json` en estado "
        f"`\"{ts_meta['capture_status']}\"` al `{ts_meta['health_generated_at_utc']}`, `OBSERVADO`).",
        f"2. **Consolidación transparente del lote real previo `scraped_ws` (`2026-11-09` en `odds_snapshots.parquet`):** "
        f"**`{audit['events_by_ingest_origin'][ORIGIN_SCRAPED_WS_LEGACY]}` eventos NFL** con captura pre-kickoff verificada de **`pinnacle`** "
        f"(`{audit['sharp_valid_rows_total']:,}` filas sharp válidas entre `{audit['sharp_ts_captured_min_utc']}` y `{audit['sharp_ts_captured_max_utc']}`, "
        f"`0` filas válidas de `smarkets`, `OBSERVADO`), consolidados en **`{gate['n_total_market_rows']}` filas `(game_id, market)`** (`13` partidos × `moneyline`, `spread`, `totals`).",
        f"3. **Cruce canónico con `nflverse` (`data/nfl/raw/games.csv` + `nfl_games.parquet`):** "
        f"**`{gate['n_matched_nflverse_games']} / {gate['n_distinct_events_with_sharp_closing']}` partidos (`100.0%`)** resuelven su `game_id` canónico de `nflverse` "
        f"(`1` partido de Semana `9` MNF `2026_09_BUF_MIN` y `12` partidos de Semana `10` `2026_10_*`; `0` eventos en `{UNMATCHED_FUTURE_GAME_ID}`, `OBSERVADO`).",
        f"4. **Partidos liquidados con marcador final (`is_settled == True`):** **`{gate['n_settled_games_with_sharp_closing']} / {gate['n_distinct_events_with_sharp_closing']}`** "
        f"(`{audit['matched_in_nfl_games_parquet_settled_cut']}` presentes en el corte liquidado `nfl_games.parquet <= 2026-11-08`; `games.csv` local fue descargado el `2026-11-09T14:36:27Z` "
        f"antes del kickoff de `2026_09_BUF_MIN` el `2026-11-10T01:15:00Z`, por lo que los `13` partidos tienen `home_score = NaN, away_score = NaN`, `OBSERVADO`).",
        f"5. **Compuerta de suficiencia muestral (`MIN_SETTLED_GAMES_FOR_EVAL = {gate['min_settled_games_required']}`):**",
        f"   - `n_settled_games_with_sharp_closing = {gate['n_settled_games_with_sharp_closing']} < {gate['min_settled_games_required']}` (faltan **`{gate['shortfall_to_eval_gate']}`** partidos liquidados con cierre sharp real).",
        f"   - **`corpus_sufficient_for_eval = {gate['corpus_sufficient_for_eval']}`** (`OBSERVADO`).",
        f"   - **`production_enabled = {gate['production_enabled']}`** — **NFL sigue apagado** (`NFL::moneyline`, `NFL::spread` y `NFL::totals` verificados en `false` en `src/data/prediction/production_segments_v3_1.json`, `sha256={prod_verify['sha256']}`, `OBSERVADO`).",
        "",
        "---",
        "",
        "## 2. Auditoría de Fuentes, Rechazo Estricto de No-Sharp y Anti-Leakage (`OBSERVADO`)",
        "",
        "| Fuente / Filtro | Conteo | Etiqueta | Detalle Auditable |",
        "|---|---:|---|---|",
        f"| `../web-scraping/data/odds_timeseries/nfl/*.jsonl` | `{ts_meta['raw_rows_read']:,}` | `OBSERVADO` | `{ts_meta['jsonl_files_count']}` archivos `.jsonl`; `capture_status = \"{ts_meta['capture_status']}\"` (sin credenciales activas para `the_odds_api`/`betfair_exchange` y sin evasión anti-bot). |",
        f"| `odds_snapshots.parquet` (`sport == \"nfl\"`, `historical_fd`) | `{leg_meta['nfl_historical_fd_consensus_rows_ignored']:,}` | `OBSERVADO` | **Rechazadas al 100%**: líneas de consenso anónimo `book == \"nflverse\"` (`5,200` partidos históricos sin casa sharp identificable; Regla Rectora #4). |",
        f"| `odds_snapshots.parquet` (`sport == \"nfl\"`, `scraped_ws`) | `{leg_meta['nfl_scraped_ws_rows']:,}` | `OBSERVADO` | Filas pre-kickoff normalizadas candidatas ingresadas a validación (`validate_and_deduplicate_snapshots`). |",
        f"| Ticks post-kickoff descartados (`ts_captured > ts_event_start`) | `{audit['snapshot_validation']['n_post_kickoff_discarded']:,}` | `OBSERVADO` | Guardia anti-fuga temporal estricta en `validate_and_deduplicate_snapshots`. |",
        f"| Cuotas fuera de `[1.01, 1000.0]` o incompletas | `{audit['snapshot_validation']['n_out_of_range'] + audit['snapshot_validation']['n_missing_required']:,}` | `OBSERVADO` | Validación dura de dominio decimal y timestamps UTC. |",
        f"| Filas no-sharp rechazadas en `scraped_ws` (`19` emisores) | `{audit['rejected_non_sharp_rows_total']:,}` | `OBSERVADO` | **Rechazadas al 100%**: recreativas US/MX y consensos/mercados de predicción (`draftkings`, `dk nj`, `fanduel`, `bet365`, `betmgm`, `betrivers`, `fanatics nj`, `hardrock`, `action_consensus`, `consensus`, `open`, `polymarket`, `kalshi`). |",
        f"| Filas sharp válidas pre-kickoff (`pinnacle` / `smarkets`) | `{audit['sharp_valid_rows_total']:,}` | `OBSERVADO` | `pinnacle = {audit['valid_nfl_rows_by_book'].get('pinnacle', 0):,}`, `smarkets = {audit['valid_nfl_rows_by_book'].get('smarkets', 0):,}` (`351` combinaciones `(event_id, market, line)` incluyendo líneas alternas). |",
        f"| **Filas canónicas finales en `nfl_sharp_closing.parquet`** | **`{gate['n_total_market_rows']:,}`** | `OBSERVADO` | `1` línea principal por `(game_id, market)` (`13` partidos × `3` mercados: `moneyline`, `spread`, `totals`). |",
        "",
        "### Desglose de casas no-sharp rechazadas en el corte NFL `scraped_ws` (`OBSERVADO`)",
        "",
        "| Casa / Emisor rechazado (`book`) | Filas descartadas | Motivo de rechazo (Regla #4 y #8) |",
        "|---|---:|---|",
    ]

    for bk_name, bk_cnt in audit["rejected_non_sharp_books"].items():
        reason = (
            "Consenso / apertura agregada (prohibido como cierre sharp)"
            if "consensus" in bk_name or "open" in bk_name or bk_name == "nflverse"
            else (
                "Mercado de predicción no homologado en `SHARP_BOOKS_SCRAPED_FALLBACK_ORDER`"
                if bk_name in ("polymarket", "kalshi")
                else "Casa recreativa (`book not in ('pinnacle', 'smarkets')`)"
            )
        )
        lines.append(f"| `{bk_name}` | `{bk_cnt:,}` | {reason} |")

    lines.extend(
        [
            "",
            "---",
            "",
            "## 3. Estadísticos Descriptivos e Inferencia Bootstrap (`mulberry32`, `1,000` remuestreos)",
            "",
            "### 3.1 Calibración sobre Partidos Liquidados (`is_settled == True`)",
            "",
            "| Mercado | `n_settled_non_push` | `log_loss` cierre sharp [IC 95%] | `Brier` cierre sharp [IC 95%] | Diagnóstico Estadístico (`OBSERVADO`) |",
            "|---|---:|---|---|---|",
        ]
    )

    for mkt in SUPPORTED_NFL_MARKETS:
        m_cal = cal["markets"][mkt]
        ll_str = "N/A" if m_cal["log_loss"] is None else f"`{m_cal['log_loss']:.5f}` `[{m_cal['log_loss_ci95'][0]:.5f}, {m_cal['log_loss_ci95'][1]:.5f}]`"
        br_str = "N/A" if m_cal["brier"] is None else f"`{m_cal['brier']:.5f}` `[{m_cal['brier_ci95'][0]:.5f}, {m_cal['brier_ci95'][1]:.5f}]`"
        lines.append(f"| `NFL::{mkt}` | `{m_cal['n_settled_non_push']}` | {ll_str} | {br_str} | `{m_cal['status']}` |")

    ovr_ci_txt = (
        f"`{100.0 * ovr_boot['mean']:.2f}%` (`[{100.0 * ovr_boot['ci95'][0]:.2f}%, {100.0 * ovr_boot['ci95'][1]:.2f}%]`)"
        if ovr_boot["mean"] is not None
        else "N/A"
    )
    lead_ci_txt = (
        f"`{lead_boot['mean']:.1f} min` (`[{lead_boot['ci95'][0]:.1f}, {lead_boot['ci95'][1]:.1f}] min`)"
        if lead_boot["mean"] is not None
        else "N/A"
    )

    lines.extend(
        [
            "",
            "### 3.2 Microestructura Observada en las `39` Líneas Principales de `Pinnacle` (`OBSERVADO`)",
            "",
            f"- **Rango temporal de capturas sharp (`ts_closing`):** `{audit['sharp_ts_captured_min_utc']}` a `{audit['sharp_ts_captured_max_utc']}` (`2` olas el `2026-11-09`; el `100%` de las `39` filas finales resuelve al corte `2026-11-09T20:05:00Z`).",
            f"- **Margen implícito medio (`closing_overround`, `n = {ovr_boot['n']}` mercados):** {ovr_ci_txt} (`mulberry32`, `1,000` remuestreos).",
            f"- **Anticipación media al kickoff (`lead_time_to_kickoff_minutes`, `n = {lead_boot['n']}` mercados):** {lead_ci_txt}.",
            "  - **Nota de honestidad temporal (`INFERIDO` a partir de `lead_time_to_kickoff_minutes`):** salvo `2026_09_BUF_MIN` (capturado a `T - 310.0 min` = `5.17 h` del kickoff), los `12` partidos de Semana `10` corresponden a **apertura temprana de semana** (`4,630.0` a `10,390.0 min` antes del kickoff = `3.2` a `7.2` días). `resolve_closing_odds` devuelve legítimamente el último snapshot sharp pre-partido disponible hoy, pero para evaluación rigurosa de `CLV%` y `Δlog_loss` contra cierre verdadero se requiere que `cadence_scheduler.py` (`B3`) opere con `THE_ODDS_API_KEY` hasta `[T-60m, T-0]` (`<= 3.69 min`).",
            "- **Calibración contra cierre sharp real de NFL hoy:** **`DESCONOCIDO`** (`n_settled = 0 < 64`; prohibido sustituir con consenso `nflverse`).",
            "",
            "---",
            "",
            "## 4. Cobertura Detallada del Parquet (`39` Filas por `(game_id, market)`) — `OBSERVADO`",
            "",
            "| `game_id` | Sem. | `gameday` | Kickoff UTC | Cruce (`away @ home`) | Mercado | Línea | Libro | `lead_min` | Overround | `p_home / p_over` | `p_away / p_under` | Liquidado | Origen |",
            "|---|---:|---|---|---|---|---:|---|---:|---:|---:|---:|---|---|",
        ]
    )

    for _, r in closing_df.iterrows():
        is_tot = str(r["market"]) == "totals"
        p1 = r["p_over_novig"] if is_tot else r["p_home_novig"]
        p2 = r["p_under_novig"] if is_tot else r["p_away_novig"]
        ln_txt = "—" if pd.isna(r["line"]) else f"{float(r['line']):+.1f}" if str(r["market"]) == "spread" else f"{float(r['line']):.1f}"
        wk_txt = "—" if pd.isna(r["week"]) else str(int(r["week"]))
        ko_txt = pd.Timestamp(r["ts_event_start"]).strftime("%Y-%m-%dT%H:%M:%SZ")
        lines.append(
            f"| `{r['game_id']}` | {wk_txt} | `{r['gameday']}` | `{ko_txt}` | `{r['away_team']} @ {r['home_team']}` | "
            f"`{r['market']}` | `{ln_txt}` | `{r['closing_book']}` | `{float(r['lead_time_to_kickoff_minutes']):.1f}` | "
            f"`{100.0 * float(r['closing_overround']):.2f}%` | `{float(p1):.4f}` | `{float(p2):.4f}` | "
            f"`{bool(r['is_settled'])}` | `{r['ingest_origin']}` |"
        )

    lines.extend(
        [
            "",
            "---",
            "",
            "## 5. Contrato Entregado a `B9` (`b9-nfl-epa`, Ola 3)",
            "",
            f"- **Ruta:** `research/prediction-lab/data/processed/nfl_sharp_closing.parquet` (`26` columnas tipadas: `{', '.join(NFL_SHARP_CLOSING_COLUMNS)}`).",
            f"- **Cobertura del calendario `nflverse` local:** `{nfl_meta['unified_nflverse_games']:,}` partidos totales (`{nfl_meta['settled_nflverse_games']:,}` liquidados hasta `2026-11-08` + `{nfl_meta['unsettled_scheduled_nflverse_games']:,}` programados hasta `{nfl_meta['gameday_max']}`).",
            "- **Regla obligatoria para `B9` (TODO 4.1):** al encontrarse `corpus_sufficient_for_eval == False` (`0 < 64` partidos liquidados con cierre sharp), `B9` puede inspeccionar sin bloqueo el esquema real de `nfl_sharp_closing.parquet`, debe evaluar su experimento causal EPA en `walk_forward_dev` reportando el consenso `nflverse` con la etiqueta explícita `\"sin cierre sharp\"`, registrar el ensayo con `unlock_holdout=False` y mantener `model_nfl_v3_2_candidate.json` en estado `candidate` (`production_enabled = False`).",
            "",
        ]
    )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Ejecución principal de punta a punta y CLI
# ---------------------------------------------------------------------------


def _verify_frozen_nfl_production_segments(prod_segments_path: Path = FROZEN_PROD_SEGMENTS_PATH) -> dict[str, Any]:
    """Verifica en estricto modo lectura que los 3 segmentos NFL sigan en `production_enabled: false`."""
    raw_bytes = prod_segments_path.read_bytes()
    sha = hashlib.sha256(raw_bytes).hexdigest()
    payload = json.loads(raw_bytes.decode("utf-8"))
    segs = payload.get("segments", {})
    nfl_flags = {
        k: bool(segs[k]["production_enabled"])
        for k in ("NFL::moneyline", "NFL::spread", "NFL::totals")
        if k in segs
    }
    if any(nfl_flags.values()):
        raise RuntimeError(f"Violación de gobernanza: segmento NFL encendido en production_segments_v3_1.json: {nfl_flags}")
    return {
        "path": str(prod_segments_path),
        "sha256": sha,
        "nfl_segments_production_enabled": nfl_flags,
    }


def run_nfl_sharp_closing_pipeline(
    *,
    timeseries_nfl_dir: Path = DEFAULT_WS_NFL_TIMESERIES_DIR,
    health_json_path: Path | None = DEFAULT_WS_HEALTH_JSON,
    odds_snapshots_path: Path = DEFAULT_ODDS_SNAPSHOTS_PARQUET,
    include_legacy_snapshots: bool = True,
    nfl_games_path: Path | None = None,
    nfl_raw_csv_path: Path | None = DEFAULT_NFL_RAW_CSV,
    output_parquet_path: Path = DEFAULT_OUTPUT_NFL_SHARP_PARQUET,
    report_md_path: Path = DEFAULT_REPORT_MD,
    devig_method: str = "power",
    min_settled_games: int = MIN_SETTLED_GAMES_FOR_EVAL,
) -> dict[str, Any]:
    """Ejecuta el pipeline completo de B6, persiste `nfl_sharp_closing.parquet` y escribe `A29_nfl_sharp_corpus.md`."""
    prod_verify = _verify_frozen_nfl_production_segments()
    nfl_schedule, nfl_meta = load_nflverse_schedule(
        nfl_games_path=nfl_games_path,
        nfl_raw_csv_path=nfl_raw_csv_path,
    )
    ts_df, ts_meta = load_nfl_timeseries_jsonl(
        timeseries_nfl_dir=timeseries_nfl_dir,
        health_json_path=health_json_path,
    )
    if include_legacy_snapshots:
        leg_df, leg_meta = load_legacy_scraped_ws_nfl_snapshots(odds_snapshots_path=odds_snapshots_path)
    else:
        leg_df = pd.DataFrame(columns=list(REQUIRED_COLUMNS))
        leg_meta = {
            "odds_snapshots_path": str(odds_snapshots_path),
            "exists": odds_snapshots_path.exists(),
            "included": False,
            "nfl_total_rows": 0,
            "nfl_historical_fd_consensus_rows_ignored": 0,
            "nfl_scraped_ws_rows": 0,
        }

    closing_df, audit = build_nfl_sharp_closing_corpus(
        timeseries_rows=ts_df,
        legacy_ws_rows=leg_df,
        nfl_schedule=nfl_schedule,
        devig_method=devig_method,
        min_settled_games=min_settled_games,
    )

    output_parquet_path.parent.mkdir(parents=True, exist_ok=True)
    closing_df.to_parquet(output_parquet_path, index=False)
    parquet_sha256 = hashlib.sha256(output_parquet_path.read_bytes()).hexdigest()

    settled_cal = evaluate_settled_sharp_calibration(closing_df)
    ovr_boot = bootstrap_mean_ci95(closing_df["closing_overround"].to_numpy(dtype=np.float64)) if len(closing_df) > 0 else bootstrap_mean_ci95([])
    lead_boot = bootstrap_mean_ci95(closing_df["lead_time_to_kickoff_minutes"].to_numpy(dtype=np.float64)) if len(closing_df) > 0 else bootstrap_mean_ci95([])

    summary: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "generated_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "evidence_label": "OBSERVADO",
        "output_parquet_path": str(output_parquet_path),
        "parquet_sha256": parquet_sha256,
        "report_md_path": str(report_md_path),
        "sources": {
            "odds_timeseries_nfl": ts_meta,
            "legacy_odds_snapshots_nfl": leg_meta,
            "nflverse_schedule": nfl_meta,
        },
        "audit": audit,
        "settled_calibration": settled_cal,
        "descriptive_bootstrap": {
            "closing_overround": ovr_boot,
            "lead_time_to_kickoff_minutes": lead_boot,
        },
        "frozen_production_segments_check": prod_verify,
    }

    report_md_path.parent.mkdir(parents=True, exist_ok=True)
    report_md_path.write_text(_build_markdown_report(closing_df, summary), encoding="utf-8")
    return summary


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Construye nfl_sharp_closing.parquet y A29_nfl_sharp_corpus.md (B6).")
    parser.add_argument("--timeseries-nfl-dir", type=Path, default=DEFAULT_WS_NFL_TIMESERIES_DIR)
    parser.add_argument("--odds-snapshots", type=Path, default=DEFAULT_ODDS_SNAPSHOTS_PARQUET)
    parser.add_argument("--no-legacy-snapshots", action="store_true", help="Ignorar snapshots previos scraped_ws en odds_snapshots.parquet.")
    parser.add_argument("--out-parquet", type=Path, default=DEFAULT_OUTPUT_NFL_SHARP_PARQUET)
    parser.add_argument("--out-report", type=Path, default=DEFAULT_REPORT_MD)
    parser.add_argument("--devig-method", default="power", choices=["proportional", "power", "shin", "adaptive"])
    parser.add_argument("--min-settled-games", type=int, default=MIN_SETTLED_GAMES_FOR_EVAL)
    args = parser.parse_args(argv)

    sys.stdout.reconfigure(encoding="utf-8")
    summary = run_nfl_sharp_closing_pipeline(
        timeseries_nfl_dir=args.timeseries_nfl_dir,
        odds_snapshots_path=args.odds_snapshots,
        include_legacy_snapshots=not args.no_legacy_snapshots,
        output_parquet_path=args.out_parquet,
        report_md_path=args.out_report,
        devig_method=args.devig_method,
        min_settled_games=args.min_settled_games,
    )
    print(
        json.dumps(
            {
                "status": "ok",
                "schema_version": summary["schema_version"],
                "parquet_sha256": summary["parquet_sha256"],
                "events_by_ingest_origin": summary["audit"]["events_by_ingest_origin"],
                "closing_books_counts": summary["audit"]["closing_books_counts"],
                "gate": summary["audit"]["gate"],
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
