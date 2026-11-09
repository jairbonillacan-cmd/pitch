"""Build the derived per-game query layer: games + closing odds + stadium weather.

Reads ONLY from raw sources (games.csv, nfl-station-mapping.csv, GHCN station CSVs)
and writes ONE parquet plus a provenance manifest:
  data/history/normalized/nfl/games_with_weather.parquet
  data/history/normalized/nfl/build_manifest.json   (versioned)

Nothing in raw/ is modified. Nulls are preserved (never coerced to 0).
Units: temp_gamebook_f = nflverse gamebook Fahrenheit (as published);
       weather columns *_c come from GHCN metric.
"""

import csv
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import polars as pl

REPO_ROOT = Path(__file__).resolve().parents[3]
GAMES = REPO_ROOT / "data/history/raw/nflverse/games.csv"
MAPPING = REPO_ROOT / "data/history/manifests/nfl-station-mapping.csv"
STATIONS_DIR = REPO_ROOT / "data/history/raw/noaa-ghcn/stations"
OUT_DIR = REPO_ROOT / "data/history/normalized/nfl"
OUT_PARQUET = OUT_DIR / "games_with_weather.parquet"
OUT_MANIFEST = OUT_DIR / "build_manifest.json"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    games = pl.read_csv(GAMES, infer_schema_length=0)
    games = games.with_columns([
        pl.col("season").cast(pl.Int32),
        pl.col("week").cast(pl.Int32),
        pl.col("away_score").cast(pl.Int32),
        pl.col("home_score").cast(pl.Int32),
        pl.col("total").cast(pl.Int32),
        pl.col("spread_line").cast(pl.Float64),
        pl.col("total_line").cast(pl.Float64),
        pl.col("away_moneyline").cast(pl.Int32),
        pl.col("home_moneyline").cast(pl.Int32),
        pl.col("away_spread_odds").cast(pl.Int32),
        pl.col("home_spread_odds").cast(pl.Int32),
        pl.col("under_odds").cast(pl.Int32),
        pl.col("over_odds").cast(pl.Int32),
        pl.col("div_game").cast(pl.Int32),
        pl.col("overtime").cast(pl.Int32),
        pl.col("away_rest").cast(pl.Int32),
        pl.col("home_rest").cast(pl.Int32),
        pl.col("temp").cast(pl.Float64).alias("temp_gamebook_f"),
        pl.col("wind").cast(pl.Float64),
    ])

    mapping = pl.read_csv(MAPPING).select(["stadiumId", "stationId"]).unique()
    # venue key: first 3 chars of stadium_id (exceptions BUF01/SFO01 keep 5)
    games = games.with_columns(
        pl.when(pl.col("stadium_id").is_in(["BUF01", "SFO01"]))
        .then(pl.col("stadium_id"))
        .otherwise(pl.col("stadium_id").str.slice(0, 3))
        .alias("venue")
    )

    weather_frames = []
    for path in STATIONS_DIR.glob("*.csv"):
        wx = pl.read_csv(path, infer_schema_length=0, null_values=[""])
        wx = wx.with_columns([
            pl.col("TMAX").cast(pl.Float64),
            pl.col("TMIN").cast(pl.Float64),
            pl.col("PRCP").cast(pl.Float64),
            pl.col("SNOW").cast(pl.Float64),
            pl.col("SNWD").cast(pl.Float64),
            pl.col("AWND").cast(pl.Float64),
        ])
        weather_frames.append(wx.select(["STATION", "DATE", "TMAX", "TMIN", "PRCP", "SNOW", "SNWD", "AWND"]))
    weather = pl.concat(weather_frames, how="vertical")

    joined = (
        games.join(mapping.select(["stadiumId", "stationId"]), left_on="venue", right_on="stadiumId", how="left")
             .join(weather, left_on=["stationId", "gameday"], right_on=["STATION", "DATE"], how="left")
    )

    select_cols = [
        "game_id", "season", "game_type", "week", "gameday", "weekday", "gametime",
        "away_team", "home_team", "away_score", "home_score", "total", "overtime", "result",
        "stadium_id", "stadium", "venue", "roof", "surface",
        "location", "div_game", "away_rest", "home_rest",
        "away_qb_name", "home_qb_name", "away_coach", "home_coach", "referee",
        "spread_line", "total_line", "away_moneyline", "home_moneyline",
        "away_spread_odds", "home_spread_odds", "under_odds", "over_odds",
        "temp_gamebook_f", "wind",
        "stationId", "TMAX", "TMIN", "PRCP", "SNOW", "SNWD", "AWND",
    ]
    table = joined.select([c for c in select_cols if c in joined.columns])
    table = table.rename({
        "TMAX": "tmax_c", "TMIN": "tmin_c", "PRCP": "prcp_mm", "SNOW": "snow_mm",
        "SNWD": "snwd_mm", "AWND": "awnd_ms",
    })
    table = table.sort(["season", "week", "gameday", "game_id"])
    table.write_parquet(OUT_PARQUET)

    # ---- build manifest (provenance) ----
    inputs = {
        "games.csv": sha256_file(GAMES),
        "nfl-station-mapping.csv": sha256_file(MAPPING),
    }
    station_digests = {p.stem: sha256_file(p) for p in sorted(STATIONS_DIR.glob("*.csv"))}

    rows = table.height
    if rows != games.height:
        raise SystemExit(f"FALLO de unicidad: {rows} filas tras join vs {games.height} juegos — abortado")
    played = table.filter(pl.col("home_score").is_not_null()).height
    weather_rows = table.filter(pl.col("tmax_c").is_not_null()).height
    odds = {
        "spreadNonNull": table.filter(pl.col("spread_line").is_not_null()).height,
        "totalNonNull": table.filter(pl.col("total_line").is_not_null()).height,
        "moneylineNonNull": table.filter(
            pl.col("home_moneyline").is_not_null() | pl.col("away_moneyline").is_not_null()).height,
    }
    manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "output": str(OUT_PARQUET.relative_to(REPO_ROOT)),
        "rows": rows,
        "cols": table.width,
        "playedGames": played,
        "gamesWithWeatherC": weather_rows,
        "gamesWithOdds": odds,
        "inputChecksums": inputs,
        "stationChecksums": station_digests,
        "sources": {
            "games": "nflverse-data schedules (CC-BY-4.0)",
            "mapping": "tools/nfl-data/scripts/download_noaa_weather.py (curated, IDs from official GHCN inventory)",
            "weather": "NOAA NCEI GHCN-Daily (US public domain)",
        },
        "notes": [
            "Capa derivada de consulta: raw/ permanece intacto.",
            "Nulos preservados (nunca convertidos a 0).",
            "temp_gamebook_f en Fahrenheit (origen); columnas *_c en Celsius (GHCN).",
            "Los cuotas son de cierre (spread/total/ML publicadas por nflverse).",
        ],
    }
    OUT_MANIFEST.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps({k: manifest[k] for k in ("rows", "cols", "playedGames", "gamesWithWeatherC", "gamesWithOdds")}, indent=1))
    print("parquet:", OUT_PARQUET)
    return 0


if __name__ == "__main__":
    sys.exit(main())
