"""Data-quality checks for downloaded nflverse parquet datasets.

Usage: python -I quality_check_nflverse.py

Reads every parquet under data/history/raw/nflverse/ (plus the preexisting
games.csv) and writes:
  - data/history/quality_reports/nfl/quality_report.json  (per-file metrics)
  - data/history/quality_reports/nfl/schemas.json         (column name -> dtype)
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import polars as pl

REPO_ROOT = Path(__file__).resolve().parents[3]
RAW_DIR = REPO_ROOT / "data" / "history" / "raw" / "nflverse"
REPORT_DIR = REPO_ROOT / "data" / "history" / "quality_reports" / "nfl"

DUP_KEYS = {
    "play_by_play": ["game_id", "play_id"],
    "player_stats": ["season", "week", "player_id"],
    "stats_player_reg": ["season", "player_id"],
    "stats_player_post": ["season", "player_id"],
    "stats_player_regpost": ["season", "player_id"],
    "stats_player_week": ["season", "week", "player_id"],
    "stats_team": ["season", "team"],
    "stats_team_post": ["season", "team"],
    "rosters": ["season", "team", "player"],
    "weekly_rosters": ["season", "week", "team", "player_id"],
    "nextgen_stats": ["season", "week", "player_display_name"],
    "espn_qbr": ["season", "game_id", "player_id"],
}


def dup_key_for(rel_path: Path):
    parts = rel_path.parts
    dataset = parts[-2] if len(parts) >= 2 else ""
    stem = parts[-1]
    if stem.startswith("player_stats_kicking"):
        return ["season", "week", "player_id"]
    if stem.startswith("player_stats_season"):
        return ["season", "player_id"]
    if stem.startswith("injuries"):
        return None  # multiples reportes por semana por jugador: se usa full-row dup
    if stem.startswith("snap_counts"):
        return ["season", "week", "team", "pfr_id"]
    if stem.startswith("advstats_week"):
        return ["season", "week", "player"]
    if stem.startswith("advstats_season"):
        return ["season", "player"]
    if stem.startswith("depth_charts"):
        return None
    if stem.startswith("roster_weekly"):
        return DUP_KEYS["weekly_rosters"]
    if stem.startswith("roster_"):
        return DUP_KEYS["rosters"]
    return DUP_KEYS.get(dataset)


def check_parquet(path: Path) -> dict:
    rel = path.relative_to(REPO_ROOT)
    lazy = pl.scan_parquet(path)
    schema = lazy.collect_schema()
    row_count = lazy.select(pl.len()).collect().item()

    entry = {
        "file": str(rel),
        "sizeBytes": path.stat().st_size,
        "rows": row_count,
        "cols": len(schema.names()),
    }

    if "season" in schema.names():
        agg = lazy.select(
            pl.col("season").min().alias("min_season"),
            pl.col("season").max().alias("max_season"),
        ).collect().row(0)
        entry["minSeason"] = agg[0]
        entry["maxSeason"] = agg[1]

    nulls = lazy.null_count().collect().transpose(include_header=True, header_name="col", column_names=["nulls"])
    null_df = pl.DataFrame(nulls)
    worst = null_df.filter(pl.col("nulls") > 0).sort("nulls", descending=True).head(10)
    entry["topNullColumns"] = [
        {"col": row["col"], "nulls": row["nulls"]} for row in worst.iter_rows(named=True)
    ]

    dup_keys = dup_key_for(rel)
    if dup_keys and all(k in schema.names() for k in dup_keys):
        dup_count = (
            lazy.group_by(dup_keys).agg(pl.len().alias("n")).filter(pl.col("n") > 1)
            .select(pl.len()).collect().item()
        )
        entry["duplicateKeyGroups"] = int(dup_count)
        entry["duplicateKeysUsed"] = dup_keys
    full_dups = (
        lazy.group_by(schema.names()).agg(pl.len().alias("n")).filter(pl.col("n") > 1)
        .select(pl.len()).collect().item()
    )
    entry["duplicateFullRows"] = int(full_dups)

    entry["schema"] = {name: str(dtype) for name, dtype in schema.items()}
    entry["status"] = "complete" if row_count > 0 else "empty"
    return entry


def check_games_csv() -> dict:
    path = RAW_DIR / "games.csv"
    if not path.exists():
        return {"file": "games.csv", "status": "missing"}
    df = pl.read_csv(path)
    entry = {
        "file": "data/history/raw/nflverse/games.csv",
        "sizeBytes": path.stat().st_size,
        "rows": df.height,
        "cols": df.width,
        "minSeason": int(df["season"].min()),
        "maxSeason": int(df["season"].max()),
        "gamesPerSeason": {
            str(int(s)): int(n) for s, n in df.group_by("season").len().sort("season").iter_rows()
        },
        "oddsCoverage": {
            "moneylineNonNull": int((df["home_moneyline"].is_not_null() | df["away_moneyline"].is_not_null()).sum()),
            "spreadNonNull": int(df["spread_line"].is_not_null().sum()),
            "totalNonNull": int(df["total_line"].is_not_null().sum()),
        },
        "duplicateFullRows": int(df.height - df.n_unique()),
        "schema": {name: str(dtype) for name, dtype in df.schema.items()},
        "status": "complete",
    }
    return entry


def main() -> int:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(RAW_DIR.rglob("*.parquet"))
    results, schemas = [], {}
    for i, path in enumerate(files, 1):
        rel = path.relative_to(RAW_DIR)
        print(f"[{i}/{len(files)}] {rel}", flush=True)
        try:
            entry = check_parquet(path)
        except Exception as error:  # noqa: BLE001 - reportar y continuar
            entry = {"file": str(path.relative_to(REPO_ROOT)), "status": "invalid", "error": str(error)}
        results.append(entry)
        if "schema" in entry:
            schemas[str(path.relative_to(REPO_ROOT))] = entry["schema"]

    games = check_games_csv()
    results.append(games)
    if "schema" in games:
        schemas["data/history/raw/nflverse/games.csv"] = games["schema"]

    now = datetime.now(timezone.utc).isoformat()
    report = {
        "generatedAt": now,
        "source": "nflverse-data (CC-BY-4.0)",
        "filesChecked": len(results),
        "totalRows": sum(r.get("rows", 0) for r in results),
        "totalSizeBytes": sum(r.get("sizeBytes", 0) for r in results),
        "invalidFiles": [r["file"] for r in results if r.get("status") == "invalid"],
        "results": results,
    }
    (REPORT_DIR / "quality_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    (REPORT_DIR / "schemas.json").write_text(json.dumps(schemas, indent=2), encoding="utf-8")

    invalid = report["invalidFiles"]
    print(f"\nArchivos: {len(results)} · filas: {report['totalRows']:,} · bytes: {report['totalSizeBytes']:,}")
    if invalid:
        print(f"INVALIDOS: {invalid}")
        return 1
    print("Todos los archivos legibles y consistentes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
