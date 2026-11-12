"""Ingesta legal y agregación semanal compacta de play-by-play nflverse (`1999..2024`, `< 2025-02-02T17:30:00Z`).

Reglas rectoras aplicadas (§0):
- Licencia abierta CC BY 4.0 / MIT desde releases estáticos oficiales de `github.com/nflverse/nflverse-data` (cero anti-bot).
- Blindaje total del holdout sellado (`>= 2025-02-02T17:30:00Z`): prohibido descargar o leer temporadas `>= 2025` o jugadas con `game_date >= 2025-02-02`.
- Transparencia epistémica (`OBSERVADO` vs `DESCONOCIDO`):
  * `Dropback EPA`, `Rush EPA`, `Success%` (global y early-down) y `Sack%`: `OBSERVADO` `1999..2024`.
  * `Pressure proxy` (`(sack | qb_hit) / dropbacks`) y `CPOE`: `OBSERVADO` `2006..2024` (`100%` de `walk_forward_dev` `2010..2024`); `DESCONOCIDO` (`NaN`) en `1999..2005` porque NFL no registraba `qb_hit` ni `air_yards` de forma sistemática antes de 2006.
  * `NGS/FTN was_pressure` (`pbp_participation`): `OBSERVADO` `2016..2024`; `DESCONOCIDO` (`NaN`) en `1999..2015`.
"""

from __future__ import annotations

import concurrent.futures
import hashlib
import io
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

EXP_DIR = Path(__file__).resolve().parent
RAW_CACHE_DIR = EXP_DIR / "raw_cache"
ARTIFACTS_DIR = EXP_DIR / "artifacts"

HOLDOUT_CUT_ISO = "2025-02-02T17:30:00Z"
HOLDOUT_CUT_TS = pd.Timestamp(HOLDOUT_CUT_ISO)
HOLDOUT_CUT_DATE = "2025-02-02"
MIN_SEASON = 1999
MAX_DEV_SEASON = 2024
QBHIT_CPOE_MIN_SEASON = 2006
PARTICIPATION_MIN_SEASON = 2016

PBP_URL_TEMPLATE = "https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_{year}.parquet"
PART_URL_TEMPLATE = (
    "https://github.com/nflverse/nflverse-data/releases/download/pbp_participation/pbp_participation_{year}.parquet"
)

PBP_COLUMNS = [
    "game_id",
    "play_id",
    "season",
    "season_type",
    "week",
    "game_date",
    "posteam",
    "defteam",
    "play_type",
    "down",
    "aborted_play",
    "two_point_attempt",
    "qb_dropback",
    "pass",
    "rush",
    "qb_scramble",
    "epa",
    "qb_epa",
    "success",
    "cpoe",
    "sack",
    "qb_hit",
    "pass_attempt",
    "complete_pass",
    "rush_attempt",
    "passer_player_id",
    "rusher_player_id",
    "wp",
]

PART_COLUMNS = [
    "nflverse_game_id",
    "play_id",
    "was_pressure",
]

# Normalización de franquicias reubicadas para alinear con `nfl_games.parquet`
TEAM_CODE_ALIASES: dict[str, str] = {
    "LAR": "LA",
    "JAC": "JAX",
    "WSH": "WAS",
    "ARZ": "ARI",
    "BLT": "BAL",
    "CLV": "CLE",
    "HST": "HOU",
    "SL": "STL",
}


class HoldoutSealedAccessError(RuntimeError):
    """Error lanzado ante cualquier intento de leer o descargar datos del holdout sellado (`>= 2025-02-02T17:30:00Z`)."""


def assert_season_allowed(season: int) -> None:
    if int(season) > MAX_DEV_SEASON:
        raise HoldoutSealedAccessError(
            f"Acceso bloqueado a season={season}: supera MAX_DEV_SEASON={MAX_DEV_SEASON} (holdout_sealed >= {HOLDOUT_CUT_ISO})."
        )


def assert_dates_strictly_before_holdout(dates: pd.Series, context: str) -> None:
    s = dates.dropna().astype(str).str[:10]
    bad = s >= HOLDOUT_CUT_DATE
    if bool(bad.any()):
        sample = s[bad].iloc[0]
        raise HoldoutSealedAccessError(
            f"Fuga hacia holdout_sealed detectada en {context}: fecha={sample} >= {HOLDOUT_CUT_DATE}."
        )


def _normalize_team(series: pd.Series) -> pd.Series:
    s = series.astype(str).str.strip().str.upper()
    return s.replace(TEAM_CODE_ALIASES)


def _fetch_or_cache_pruned_parquet(
    url: str,
    cache_path: Path,
    columns: list[str],
    date_col: str | None = None,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    RAW_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    meta_path = cache_path.with_suffix(".meta.json")
    if cache_path.exists() and meta_path.exists():
        df = pd.read_parquet(cache_path)
        if date_col and date_col in df.columns:
            assert_dates_strictly_before_holdout(df[date_col], context=str(cache_path.name))
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        return df, meta

    req = urllib.request.Request(url, headers={"User-Agent": "PitchLab-Research-V32/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw_bytes = resp.read()
    raw_sha256 = hashlib.sha256(raw_bytes).hexdigest()
    df = pd.read_parquet(io.BytesIO(raw_bytes), columns=columns)

    n_raw = int(len(df))
    n_excluded_holdout = 0
    if date_col and date_col in df.columns:
        gdate = df[date_col].astype(str).str[:10]
        keep_mask = gdate < HOLDOUT_CUT_DATE
        n_excluded_holdout = int((~keep_mask).sum())
        df = df.loc[keep_mask].copy()
        assert_dates_strictly_before_holdout(df[date_col], context=url)

    df.to_parquet(cache_path, index=False)
    meta = {
        "url": url,
        "raw_bytes": len(raw_bytes),
        "raw_sha256": raw_sha256,
        "rows_raw": n_raw,
        "rows_excluded_holdout_ge_2025_02_02": n_excluded_holdout,
        "rows_kept_dev": int(len(df)),
        "fetched_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return df, meta


def _process_single_season(season: int) -> tuple[pd.DataFrame, pd.DataFrame, dict[str, Any]]:
    assert_season_allowed(season)
    pbp_url = PBP_URL_TEMPLATE.format(year=season)
    pbp_cache = RAW_CACHE_DIR / f"pbp_pruned_{season}.parquet"
    pbp, pbp_meta = _fetch_or_cache_pruned_parquet(pbp_url, pbp_cache, PBP_COLUMNS, date_col="game_date")

    part_meta: dict[str, Any] | None = None
    if season >= PARTICIPATION_MIN_SEASON:
        part_url = PART_URL_TEMPLATE.format(year=season)
        part_cache = RAW_CACHE_DIR / f"part_pruned_{season}.parquet"
        part_df, part_meta = _fetch_or_cache_pruned_parquet(part_url, part_cache, PART_COLUMNS, date_col=None)
        # Restringir estrictamente a `game_id` presentes en PBP dev (< 2025-02-02)
        allowed_gids = set(pbp["game_id"].dropna().astype(str).unique())
        part_df = part_df[part_df["nflverse_game_id"].astype(str).isin(allowed_gids)].copy()
        part_df["play_id_int"] = part_df["play_id"].astype("int64")
        part_df["game_id_str"] = part_df["nflverse_game_id"].astype(str)
        part_df["was_pressure_f"] = part_df["was_pressure"].astype("float64")
        part_dedup = part_df[["game_id_str", "play_id_int", "was_pressure_f"]].drop_duplicates(
            subset=["game_id_str", "play_id_int"]
        )
        pbp["game_id_str"] = pbp["game_id"].astype(str)
        pbp["play_id_int"] = pbp["play_id"].astype("int64")
        pbp = pbp.merge(part_dedup, on=["game_id_str", "play_id_int"], how="left")
    else:
        pbp["was_pressure_f"] = np.nan

    # Filtrar jugadas reales de scrimmage (estándar nflfastR / Ben Baldwin):
    # posteam/defteam presentes, epa finito, no abortadas, no conversión de 2 puntos, pass==1 o rush==1
    valid_mask = (
        pbp["posteam"].notna()
        & pbp["defteam"].notna()
        & (pbp["posteam"].astype(str).str.len() > 0)
        & (pbp["defteam"].astype(str).str.len() > 0)
        & pbp["epa"].notna()
        & (pbp["aborted_play"].fillna(0) == 0)
        & (pbp["two_point_attempt"].fillna(0) == 0)
        & ((pbp["pass"].fillna(0) == 1) | (pbp["rush"].fillna(0) == 1))
    )
    scrim = pbp.loc[valid_mask].copy()
    scrim["posteam_norm"] = _normalize_team(scrim["posteam"])
    scrim["defteam_norm"] = _normalize_team(scrim["defteam"])
    scrim["game_date_str"] = scrim["game_date"].astype(str).str[:10]
    assert_dates_strictly_before_holdout(scrim["game_date_str"], context=f"scrim_{season}")

    is_db = scrim["qb_dropback"].fillna(0).to_numpy(dtype=np.float64) == 1.0
    is_rush = (scrim["rush"].fillna(0).to_numpy(dtype=np.float64) == 1.0) & (~is_db)
    down_arr = scrim["down"].fillna(0).to_numpy(dtype=np.float64)
    is_ed = (down_arr == 1.0) | (down_arr == 2.0)
    wp_arr = scrim["wp"].to_numpy(dtype=np.float64)
    is_wp_neutral = np.isfinite(wp_arr) & (wp_arr >= 0.05) & (wp_arr <= 0.95)

    epa_arr = scrim["epa"].to_numpy(dtype=np.float64)
    succ_arr = scrim["success"].fillna(0.0).to_numpy(dtype=np.float64)
    sack_arr = scrim["sack"].fillna(0.0).to_numpy(dtype=np.float64)
    qbhit_arr = scrim["qb_hit"].fillna(0.0).to_numpy(dtype=np.float64)
    disrupt_arr = np.where((sack_arr >= 1.0) | (qbhit_arr >= 1.0), 1.0, 0.0)
    cpoe_arr = scrim["cpoe"].to_numpy(dtype=np.float64) if season >= QBHIT_CPOE_MIN_SEASON else np.full(len(scrim), np.nan)
    ngs_press_arr = scrim["was_pressure_f"].to_numpy(dtype=np.float64)

    scrim["is_db"] = is_db.astype(np.float64)
    scrim["is_rush"] = is_rush.astype(np.float64)
    scrim["is_ed"] = is_ed.astype(np.float64)
    scrim["is_db_wp"] = (is_db & is_wp_neutral).astype(np.float64)
    scrim["db_epa"] = np.where(is_db, epa_arr, 0.0)
    scrim["db_wp_epa"] = np.where(is_db & is_wp_neutral, epa_arr, 0.0)
    scrim["rush_epa"] = np.where(is_rush, epa_arr, 0.0)
    scrim["ed_epa"] = np.where(is_ed, epa_arr, 0.0)
    scrim["ed_succ"] = np.where(is_ed, succ_arr, 0.0)
    scrim["db_sack"] = np.where(is_db, sack_arr, 0.0)
    scrim["db_disrupt"] = np.where(is_db, disrupt_arr, 0.0)
    scrim["has_cpoe"] = np.isfinite(cpoe_arr).astype(np.float64)
    scrim["cpoe_val"] = np.where(np.isfinite(cpoe_arr), cpoe_arr, 0.0)
    scrim["has_ngs_press"] = (is_db & np.isfinite(ngs_press_arr)).astype(np.float64)
    scrim["ngs_press_val"] = np.where(is_db & np.isfinite(ngs_press_arr), ngs_press_arr, 0.0)

    agg_spec = {
        "season": ("season", "first"),
        "season_type": ("season_type", "first"),
        "week": ("week", "first"),
        "game_date": ("game_date_str", "first"),
        "n_plays": ("epa", "count"),
        "epa_sum": ("epa", "sum"),
        "succ_sum": ("success", "sum"),
        "n_db": ("is_db", "sum"),
        "db_epa_sum": ("db_epa", "sum"),
        "n_db_wp": ("is_db_wp", "sum"),
        "db_wp_epa_sum": ("db_wp_epa", "sum"),
        "n_rush": ("is_rush", "sum"),
        "rush_epa_sum": ("rush_epa", "sum"),
        "n_ed": ("is_ed", "sum"),
        "ed_epa_sum": ("ed_epa", "sum"),
        "ed_succ_sum": ("ed_succ", "sum"),
        "db_sack_sum": ("db_sack", "sum"),
        "db_disrupt_sum": ("db_disrupt", "sum"),
        "n_cpoe": ("has_cpoe", "sum"),
        "cpoe_sum": ("cpoe_val", "sum"),
        "n_ngs_db": ("has_ngs_press", "sum"),
        "ngs_press_sum": ("ngs_press_val", "sum"),
    }

    off_g = scrim.groupby(["game_id", "posteam_norm"], as_index=False).agg(**agg_spec).rename(columns={"posteam_norm": "team"})
    def_g = (
        scrim.groupby(["game_id", "defteam_norm"], as_index=False)
        .agg(
            def_n_plays=("epa", "count"),
            def_epa_sum=("epa", "sum"),
            def_succ_sum=("success", "sum"),
            def_n_db=("is_db", "sum"),
            def_db_epa_sum=("db_epa", "sum"),
            def_n_db_wp=("is_db_wp", "sum"),
            def_db_wp_epa_sum=("db_wp_epa", "sum"),
            def_n_rush=("is_rush", "sum"),
            def_rush_epa_sum=("rush_epa", "sum"),
            def_n_ed=("is_ed", "sum"),
            def_ed_epa_sum=("ed_epa", "sum"),
            def_ed_succ_sum=("ed_succ", "sum"),
            def_db_sack_sum=("db_sack", "sum"),
            def_db_disrupt_sum=("db_disrupt", "sum"),
            def_n_cpoe=("has_cpoe", "sum"),
            def_cpoe_sum=("cpoe_val", "sum"),
            def_n_ngs_db=("has_ngs_press", "sum"),
            def_ngs_press_sum=("ngs_press_val", "sum"),
        )
        .rename(columns={"defteam_norm": "team"})
    )

    tg = off_g.merge(def_g, on=["game_id", "team"], how="outer")

    def _safe_div(num: pd.Series, den: pd.Series) -> np.ndarray:
        n_a = num.to_numpy(dtype=np.float64)
        d_a = den.to_numpy(dtype=np.float64)
        return np.where(d_a > 0, n_a / np.maximum(d_a, 1.0), np.nan)

    tg["off_epa_pp"] = _safe_div(tg["epa_sum"], tg["n_plays"])
    tg["def_epa_pp"] = _safe_div(tg["def_epa_sum"], tg["def_n_plays"])
    tg["off_dropback_epa_pp"] = _safe_div(tg["db_epa_sum"], tg["n_db"])
    tg["def_dropback_epa_pp"] = _safe_div(tg["def_db_epa_sum"], tg["def_n_db"])
    tg["off_dropback_epa_wp_pp"] = _safe_div(tg["db_wp_epa_sum"], tg["n_db_wp"])
    tg["def_dropback_epa_wp_pp"] = _safe_div(tg["def_db_wp_epa_sum"], tg["def_n_db_wp"])
    tg["off_rush_epa_pp"] = _safe_div(tg["rush_epa_sum"], tg["n_rush"])
    tg["def_rush_epa_pp"] = _safe_div(tg["def_rush_epa_sum"], tg["def_n_rush"])
    tg["off_success_rate"] = _safe_div(tg["succ_sum"], tg["n_plays"])
    tg["def_success_rate"] = _safe_div(tg["def_succ_sum"], tg["def_n_plays"])
    tg["off_ed_success_rate"] = _safe_div(tg["ed_succ_sum"], tg["n_ed"])
    tg["def_ed_success_rate"] = _safe_div(tg["def_ed_succ_sum"], tg["def_n_ed"])
    tg["off_ed_epa_pp"] = _safe_div(tg["ed_epa_sum"], tg["n_ed"])
    tg["def_ed_epa_pp"] = _safe_div(tg["def_ed_epa_sum"], tg["def_n_ed"])
    tg["off_sack_rate"] = _safe_div(tg["db_sack_sum"], tg["n_db"])
    tg["def_sack_rate"] = _safe_div(tg["def_db_sack_sum"], tg["def_n_db"])

    if season >= QBHIT_CPOE_MIN_SEASON:
        tg["off_pressure_proxy_rate"] = _safe_div(tg["db_disrupt_sum"], tg["n_db"])
        tg["def_pressure_proxy_rate"] = _safe_div(tg["def_db_disrupt_sum"], tg["def_n_db"])
        tg["team_cpoe"] = _safe_div(tg["cpoe_sum"], tg["n_cpoe"])
        tg["def_cpoe_allowed"] = _safe_div(tg["def_cpoe_sum"], tg["def_n_cpoe"])
    else:
        tg["off_pressure_proxy_rate"] = np.nan
        tg["def_pressure_proxy_rate"] = np.nan
        tg["team_cpoe"] = np.nan
        tg["def_cpoe_allowed"] = np.nan

    if season >= PARTICIPATION_MIN_SEASON:
        tg["off_ngs_pressure_rate"] = _safe_div(tg["ngs_press_sum"], tg["n_ngs_db"])
        tg["def_ngs_pressure_rate"] = _safe_div(tg["def_ngs_press_sum"], tg["def_n_ngs_db"])
    else:
        tg["off_ngs_pressure_rate"] = np.nan
        tg["def_ngs_pressure_rate"] = np.nan

    # Agregación por QB-partido (`passer_player_id` en pases/sacks y `rusher_player_id` en acarreos/scrambles)
    passer_id = scrim["passer_player_id"].fillna("").astype(str).str.strip()
    rusher_id = scrim["rusher_player_id"].fillna("").astype(str).str.strip()
    qb_id = np.where(passer_id != "", passer_id, np.where(is_db & (rusher_id != ""), rusher_id, rusher_id))
    scrim["actor_id"] = qb_id
    qb_plays_df = scrim[scrim["actor_id"] != ""].copy()
    qb_plays_df["qb_epa_clean"] = qb_plays_df["qb_epa"].fillna(qb_plays_df["epa"])

    qb_g = (
        qb_plays_df.groupby(["game_id", "posteam_norm", "actor_id"], as_index=False)
        .agg(
            season=("season", "first"),
            week=("week", "first"),
            game_date=("game_date_str", "first"),
            qb_plays=("qb_epa_clean", "count"),
            qb_dropbacks=("is_db", "sum"),
            qb_epa_sum=("qb_epa_clean", "sum"),
            qb_db_epa_sum=("db_epa", "sum"),
            qb_cpoe_n=("has_cpoe", "sum"),
            qb_cpoe_sum=("cpoe_val", "sum"),
            qb_sacks=("db_sack", "sum"),
            qb_disrupts=("db_disrupt", "sum"),
        )
        .rename(columns={"posteam_norm": "team", "actor_id": "qb_id"})
    )
    # Conservar actores con al menos 1 dropback (evita inflar la tabla con RB puros sin pases)
    qb_g = qb_g[qb_g["qb_dropbacks"] >= 1.0].reset_index(drop=True)
    qb_g["qb_epa_pp"] = np.where(qb_g["qb_plays"] > 0, qb_g["qb_epa_sum"] / qb_g["qb_plays"], np.nan)
    qb_g["qb_db_epa_pp"] = np.where(qb_g["qb_dropbacks"] > 0, qb_g["qb_db_epa_sum"] / qb_g["qb_dropbacks"], np.nan)
    if season >= QBHIT_CPOE_MIN_SEASON:
        qb_g["qb_cpoe_mean"] = np.where(qb_g["qb_cpoe_n"] > 0, qb_g["qb_cpoe_sum"] / qb_g["qb_cpoe_n"], np.nan)
        qb_g["qb_pressure_proxy_rate"] = np.where(
            qb_g["qb_dropbacks"] > 0, qb_g["qb_disrupts"] / qb_g["qb_dropbacks"], np.nan
        )
    else:
        qb_g["qb_cpoe_mean"] = np.nan
        qb_g["qb_pressure_proxy_rate"] = np.nan

    season_meta = {
        "season": int(season),
        "pbp": pbp_meta,
        "participation": part_meta,
        "n_team_game_rows": int(len(tg)),
        "n_qb_game_rows": int(len(qb_g)),
    }
    return tg, qb_g, season_meta


def build_or_load_pbp_game_aggregates(force_rebuild: bool = False) -> tuple[pd.DataFrame, pd.DataFrame, dict[str, Any]]:
    """Construye o carga los agregados compactos `1999..2024` (`< 2025-02-02T17:30:00Z`)."""
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    tg_path = ARTIFACTS_DIR / "nfl_pbp_team_game_1999_2024_dev.parquet"
    qb_path = ARTIFACTS_DIR / "nfl_pbp_qb_game_1999_2024_dev.parquet"
    manifest_path = ARTIFACTS_DIR / "manifest_pbp_dev.json"

    if not force_rebuild and tg_path.exists() and qb_path.exists() and manifest_path.exists():
        tg = pd.read_parquet(tg_path)
        qb = pd.read_parquet(qb_path)
        assert_dates_strictly_before_holdout(tg["game_date"], context="loaded_team_game")
        assert_dates_strictly_before_holdout(qb["game_date"], context="loaded_qb_game")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        return tg, qb, manifest

    seasons = list(range(MIN_SEASON, MAX_DEV_SEASON + 1))
    results_by_season: dict[int, tuple[pd.DataFrame, pd.DataFrame, dict[str, Any]]] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        fut_map = {pool.submit(_process_single_season, yr): yr for yr in seasons}
        for fut in concurrent.futures.as_completed(fut_map):
            yr = fut_map[fut]
            results_by_season[yr] = fut.result()

    tg_frames: list[pd.DataFrame] = []
    qb_frames: list[pd.DataFrame] = []
    season_metas: list[dict[str, Any]] = []
    for yr in seasons:
        t_df, q_df, m = results_by_season[yr]
        tg_frames.append(t_df)
        qb_frames.append(q_df)
        season_metas.append(m)

    tg_all = pd.concat(tg_frames, ignore_index=True).sort_values(
        ["season", "week", "game_date", "game_id", "team"], kind="mergesort"
    ).reset_index(drop=True)
    qb_all = pd.concat(qb_frames, ignore_index=True).sort_values(
        ["season", "week", "game_date", "game_id", "team", "qb_id"], kind="mergesort"
    ).reset_index(drop=True)

    assert_dates_strictly_before_holdout(tg_all["game_date"], context="tg_all")
    assert_dates_strictly_before_holdout(qb_all["game_date"], context="qb_all")

    tg_all.to_parquet(tg_path, index=False)
    qb_all.to_parquet(qb_path, index=False)

    tg_sha = hashlib.sha256(tg_path.read_bytes()).hexdigest()
    qb_sha = hashlib.sha256(qb_path.read_bytes()).hexdigest()

    manifest = {
        "schema_version": "1.0.0",
        "experiment": "EXP_V32_nfl_epa",
        "license": "CC BY 4.0 / MIT (github.com/nflverse/nflverse-data static releases)",
        "holdout_cut_iso": HOLDOUT_CUT_ISO,
        "holdout_cut_date": HOLDOUT_CUT_DATE,
        "holdout_untouched": True,
        "seasons_included": seasons,
        "max_game_date_observed": str(tg_all["game_date"].max()),
        "team_game_parquet": {
            "filename": tg_path.name,
            "rows": int(len(tg_all)),
            "bytes": int(tg_path.stat().st_size),
            "sha256": tg_sha,
        },
        "qb_game_parquet": {
            "filename": qb_path.name,
            "rows": int(len(qb_all)),
            "bytes": int(qb_path.stat().st_size),
            "sha256": qb_sha,
        },
        "epistemic_coverage": {
            "dropback_epa_and_rush_epa_and_success": {
                "status": "OBSERVADO",
                "seasons": "1999..2024 (< 2025-02-02)",
                "walk_forward_dev_coverage": 1.0,
            },
            "pressure_proxy_sack_or_qbhit_and_cpoe": {
                "status_2006_2024": "OBSERVADO",
                "status_1999_2005": "DESCONOCIDO",
                "reason_1999_2005": "NFL no registraba qb_hit ni air_yards/cpoe sistematicamente antes de 2006.",
                "walk_forward_dev_2010_2024_coverage": 1.0,
            },
            "ngs_ftn_was_pressure_participation": {
                "status_2016_2024": "OBSERVADO",
                "status_1999_2015": "DESCONOCIDO",
                "reason_1999_2015": "nflverse pbp_participation comienza en la temporada 2016.",
                "walk_forward_dev_2010_2024_coverage": float(
                    (tg_all[tg_all["season"] >= 2010]["off_ngs_pressure_rate"].notna()).mean()
                ),
            },
        },
        "seasons_detail": season_metas,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return tg_all, qb_all, manifest


if __name__ == "__main__":
    tg, qb, man = build_or_load_pbp_game_aggregates(force_rebuild=True)
    print(
        f"OK: team_game={len(tg)} ({man['team_game_parquet']['bytes']/1e6:.2f} MB), "
        f"qb_game={len(qb)} ({man['qb_game_parquet']['bytes']/1e6:.2f} MB), "
        f"max_date={man['max_game_date_observed']}"
    )
    print("Epistemic coverage:", json.dumps(man["epistemic_coverage"], indent=2))
