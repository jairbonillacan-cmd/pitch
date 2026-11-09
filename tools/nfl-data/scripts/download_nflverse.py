"""Download nflverse-data release assets (parquet) with resume support.

Usage: python -I download_nflverse.py [--only dataset1,dataset2]

- Enumerates a static plan of (dataset, release tag, asset pattern, seasons).
- Skips assets whose destination file already exists with size > 0 (resume).
- Records every attempt (downloaded / skipped / missing) in a JSONL manifest.
"""

import argparse
import hashlib
import json
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
RAW_DIR = REPO_ROOT / "data" / "history" / "raw" / "nflverse"
MANIFEST_PATH = REPO_ROOT / "data" / "history" / "manifests" / "nfl-downloads-manifest.jsonl"
BASE_URL = "https://github.com/nflverse/nflverse-data/releases/download"

SOURCE_RELEASE = "https://github.com/nflverse/nflverse-data/releases/tag/{tag}"
LICENSE = "CC-BY-4.0 (https://github.com/nflverse/nflverse-data/blob/main/LICENSE)"

YEARS_1999_2026 = list(range(1999, 2027))
YEARS_2002_2026 = list(range(2002, 2027))
YEARS_2009_2026 = list(range(2009, 2027))
YEARS_2012_2026 = list(range(2012, 2027))
YEARS_2001_2026 = list(range(2001, 2027))
YEARS_1920_2026 = list(range(1920, 2027))
YEARS_2017_2026 = list(range(2017, 2027))
YEARS_2018_2026 = list(range(2018, 2027))

PLAN = [
    ("play_by_play", "pbp", ["play_by_play_{season}.parquet"], YEARS_1999_2026),
    ("player_stats", "player_stats", [
        "player_stats_{season}.parquet",
        "player_stats_season_{season}.parquet",
        "player_stats_kicking_{season}.parquet",
        "player_stats_kicking_season_{season}.parquet",
    ], YEARS_1999_2026),
    ("stats_player", "stats_player", [
        "stats_player_reg_{season}.parquet",
        "stats_player_post_{season}.parquet",
        "stats_player_regpost_{season}.parquet",
        "stats_player_week_{season}.parquet",
    ], YEARS_1999_2026),
    ("stats_team", "stats_team", [
        "stats_team_reg_{season}.parquet",
        "stats_team_post_{season}.parquet",
        "stats_team_regpost_{season}.parquet",
        "stats_team_week_{season}.parquet",
    ], YEARS_1999_2026),
    ("rosters", "rosters", ["roster_{season}.parquet"], YEARS_1920_2026),
    ("weekly_rosters", "weekly_rosters", ["roster_weekly_{season}.parquet"], YEARS_2002_2026),
    ("snap_counts", "snap_counts", ["snap_counts_{season}.parquet"], YEARS_2012_2026),
    ("injuries", "injuries", ["injuries_{season}.parquet"], YEARS_2009_2026),
    ("depth_charts", "depth_charts", ["depth_charts_{season}.parquet"], YEARS_2001_2026),
    ("officials", "officials", ["officials.parquet"], [None]),
    ("contracts", "contracts", ["historical_contracts.parquet"], [None]),
    ("combine", "combine", ["combine.parquet"], [None]),
    ("draft_picks", "draft_picks", ["draft_picks.parquet"], [None]),
    ("trades", "trades", ["trades.parquet"], [None]),
    ("nextgen_stats", "nextgen_stats", [
        "ngs_passing.parquet",
        "ngs_receiving.parquet",
        "ngs_rushing.parquet",
    ], [None]),
    ("pfr_advstats", "pfr_advstats", [
        "advstats_season_def.parquet",
        "advstats_season_pass.parquet",
        "advstats_season_rec.parquet",
        "advstats_season_rush.parquet",
    ] + [f"advstats_week_{stat}_{season}.parquet"
         for stat in ("def", "pass", "rec", "rush")
         for season in YEARS_2018_2026], [None]),
    ("espn_qbr", "espn_data", [
        "qbr_season_level.parquet",
        "qbr_week_level.parquet",
    ], [None]),
    ("misc", "misc", ["pfr_rosters.parquet"], [None]),
    ("players", "players", ["players.parquet"], [None]),
    ("teams", "teams", ["teams_colors_logos.parquet"], [None]),
]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def append_manifest(record: dict) -> None:
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    with MANIFEST_PATH.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def download_asset(dataset: str, tag: str, asset: str, season) -> dict:
    dest_dir = RAW_DIR / dataset
    dest = dest_dir / asset
    url = f"{BASE_URL}/{tag}/{asset}"
    record = {
        "dataset": dataset,
        "asset": asset,
        "season": season,
        "releaseTag": tag,
        "sourceUrl": url,
        "sourceRelease": SOURCE_RELEASE.format(tag=tag),
        "license": LICENSE,
        "downloadedAt": datetime.now(timezone.utc).isoformat(),
        "localPath": str(dest.relative_to(REPO_ROOT)),
    }

    if dest.exists() and dest.stat().st_size > 0:
        record["status"] = "skipped_existing"
        record["sizeBytes"] = dest.stat().st_size
        record["sha256"] = sha256_file(dest)
        print(f"[skip-exists] {asset} ({record['sizeBytes']:,} B)", flush=True)
        return record

    request = urllib.request.Request(url, headers={
        "User-Agent": "PitchLab-DataCollection/1.0 (free historical data; contact: pitchlab.mx)",
    })
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            dest_dir.mkdir(parents=True, exist_ok=True)
            tmp = dest.with_suffix(dest.suffix + ".part")
            with tmp.open("wb") as handle:
                while True:
                    chunk = response.read(1 << 20)
                    if not chunk:
                        break
                    handle.write(chunk)
            tmp.rename(dest)
    except urllib.error.HTTPError as error:
        tmp = dest.with_suffix(dest.suffix + ".part")
        if tmp.exists():
            tmp.unlink()
        if error.code == 404:
            record["status"] = "missing_404"
            record["error"] = "asset not found in release (expected for some season ranges)"
            print(f"[404] {asset}", flush=True)
        else:
            record["status"] = "error"
            record["error"] = f"HTTP {error.code}"
            print(f"[HTTP {error.code}] {asset}", flush=True)
        return record

    record["status"] = "downloaded"
    record["sizeBytes"] = dest.stat().st_size
    record["sha256"] = sha256_file(dest)
    print(f"[ok] {asset} ({record['sizeBytes']:,} B)", flush=True)
    return record


def register_existing_games_csv(manifest_seen: set[tuple[str, str]] | None = None) -> dict | None:
    """Register the pre-existing schedules CSV downloaded by services/ingest (once per manifest)."""
    games = RAW_DIR / "games.csv"
    if not games.exists():
        return None
    if manifest_seen is not None and ("schedules", "games.csv") in manifest_seen:
        return None
    record = {
        "dataset": "schedules",
        "asset": "games.csv",
        "season": "1999-2026",
        "releaseTag": "schedules",
        "sourceUrl": f"{BASE_URL}/schedules/games.csv",
        "sourceRelease": SOURCE_RELEASE.format(tag="schedules"),
        "license": LICENSE,
        "downloadedAt": datetime.now(timezone.utc).isoformat(),
        "localPath": str(games.relative_to(REPO_ROOT)),
        "status": "preexisting_registered",
        "sizeBytes": games.stat().st_size,
        "sha256": sha256_file(games),
        "note": "descargado previamente por services/ingest; registrado aqui sin re-descargar",
    }
    print(f"[preexisting] games.csv ({record['sizeBytes']:,} B)", flush=True)
    return record


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", help="comma-separated dataset names to process")
    args = parser.parse_args()

    only = set(args.only.split(",")) if args.only else None
    counts = {"downloaded": 0, "skipped_existing": 0, "missing_404": 0, "error": 0}

    manifest_seen: set[tuple[str, str]] = set()
    if MANIFEST_PATH.exists():
        for line in MANIFEST_PATH.read_text(encoding="utf-8").splitlines():
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            manifest_seen.add((record.get("dataset", ""), record.get("asset", "")))

    preexisting = register_existing_games_csv(manifest_seen)
    if preexisting:
        append_manifest(preexisting)

    for dataset, tag, patterns, seasons in PLAN:
        if only and dataset not in only:
            continue
        for season in seasons:
            for pattern in patterns:
                asset = pattern.format(season=season) if season is not None else pattern
                record = download_asset(dataset, tag, asset, season)
                append_manifest(record)
                counts[record["status"]] = counts.get(record["status"], 0) + 1
                if record["status"] == "error":
                    time.sleep(3)
        time.sleep(0.2)

    print("\n=== RESUMEN ===", flush=True)
    for status, count in sorted(counts.items()):
        print(f"{status}: {count}", flush=True)
    return 0 if counts["error"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
