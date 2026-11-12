"""Deep cross-validations over the nflverse NFL data warehouse.

Usage: tools/nfl-data/.venv/Scripts/python.exe -I deep_validation_nflverse.py

Writes data/history/quality_reports/nfl/deep_validation.json
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import polars as pl

REPO_ROOT = Path(__file__).resolve().parents[3]
RAW = REPO_ROOT / "data" / "history" / "raw" / "nflverse"
OUT = REPO_ROOT / "data" / "history" / "quality_reports" / "nfl" / "deep_validation.json"

results: dict = {"generatedAt": datetime.now(timezone.utc).isoformat(), "checks": {}}


def check(name: str, value) -> None:
    results["checks"][name] = value
    print(f"[check] {name}: {json.dumps(value, ensure_ascii=False, default=str)[:220]}", flush=True)


def main() -> int:
    # 1) games.csv base
    games = pl.read_csv(RAW / "games.csv")
    games_reg = games.filter(pl.col("game_type") == "REG")

    # 2) pbp distinct games per season vs games.csv (REG+POST with scores)
    played = games.filter(pl.col("home_score").is_not_null())
    rows = []
    for year in range(1999, 2027):
        n_games = played.filter(pl.col("season") == year).height
        pbp = pl.scan_parquet(RAW / "play_by_play" / f"play_by_play_{year}.parquet")
        n_pbp_games = pbp.select(pl.col("game_id").n_unique()).collect().item()
        n_plays = pbp.select(pl.len()).collect().item()
        rows.append({
            "season": year,
            "gamesPlayed": n_games,
            "pbpGames": n_pbp_games,
            "plays": n_plays,
            "playsPerGame": round(n_plays / n_pbp_games, 1) if n_pbp_games else None,
            "gamesMissingPbp": n_games - n_pbp_games,
        })
    check("pbp_vs_games_per_season", rows)
    check("pbp_seasons_with_missing_games",
          [r["season"] for r in rows if r["gamesMissingPbp"] > 0])

    # 3) EPA era coverage (1999-2005 vs 2006+)
    era = {}
    for label, lo, hi in (("1999-2005", 1999, 2005), ("2006-2013", 2006, 2013), ("2014-2026", 2014, 2026)):
        total, non_null = 0, 0
        for year in range(lo, hi + 1):
            pbp = pl.scan_parquet(RAW / "play_by_play" / f"play_by_play_{year}.parquet")
            stats = pbp.select(
                pl.len().alias("n"),
                pl.col("epa").is_not_null().sum().alias("epa_nn"),
            ).collect().row(0)
            total += stats[0]
            non_null += stats[1]
        era[label] = {"plays": total, "epaNonNull": non_null, "epaPct": round(100 * non_null / total, 1)}
    check("epa_era_coverage", era)

    # 4) 2026 season-in-progress coverage
    cov2026 = {}
    cov2026["gamesCsvPlayed"] = played.filter(pl.col("season") == 2026).height
    cov2026["gamesCsvTotal"] = games.filter(pl.col("season") == 2026).height
    cov2026["pbpMaxWeek"] = pl.scan_parquet(RAW / "play_by_play" / "play_by_play_2026.parquet") \
        .select(pl.col("week").max()).collect().item()
    cov2026["statsPlayerWeekMax"] = pl.scan_parquet(RAW / "stats_player" / "stats_player_week_2026.parquet") \
        .select(pl.col("week").max()).collect().item()
    cov2026["snapCountsMax"] = pl.scan_parquet(RAW / "snap_counts" / "snap_counts_2026.parquet") \
        .select(pl.col("week").max()).collect().item()
    cov2026["injuriesMax"] = pl.scan_parquet(RAW / "injuries" / "injuries_2026.parquet") \
        .select(pl.col("week").max()).collect().item()
    cov2026["weeklyRostersMax"] = pl.scan_parquet(RAW / "weekly_rosters" / "roster_weekly_2026.parquet") \
        .select(pl.col("week").max()).collect().item()
    cov2026["depth2025SchemaMaxDt"] = str(
        pl.scan_parquet(RAW / "depth_charts" / "depth_charts_2026.parquet")
        .select(pl.col("dt").max()).collect().item())
    check("season2026_in_progress", cov2026)

    # 5) snap_counts_2012 content
    check("snapCounts2012Rows", pl.scan_parquet(RAW / "snap_counts" / "snap_counts_2012.parquet")
          .select(pl.len()).collect().item())

    # 6) nfl.jsonl difference explanation (7,548 vs 7,407)
    future_or_unplayed = games.filter(pl.col("home_score").is_null())
    check("gamesCsv_unplayedRows", {
        "total": future_or_unplayed.height,
        "bySeason": {str(k): v for k, v in future_or_unplayed.group_by("season").len().sort("season").iter_rows()},
    })

    # 7) moneyline era coverage per season
    ml = games.with_columns(
        pl.col("home_moneyline").is_not_null().or_(pl.col("away_moneyline").is_not_null()).alias("has_ml")
    ).group_by("season").agg(
        (pl.col("has_ml").sum() * 100 // pl.len()).alias("mlPct").cast(pl.Int64)
    ).sort("season")
    check("moneylinePctBySeason", {str(k): v for k, v in ml.iter_rows()})

    # 8) players.parquet crosswalk
    players = pl.scan_parquet(RAW / "players" / "players.parquet")
    cols = players.collect_schema().names()
    check("playersCrosswalk", {
        "rows": players.select(pl.len()).collect().item(),
        "idColumns": [c for c in cols if c.endswith(("_id", "_ids", "pfr_id", "gsis_id", "espn_id",
                                                      "yahoo_id", "sleeper_id", "fantasy_pros_id",
                                                      "ktc_id", "rotowire_id", "rotoworld_id",
                                                      "_stats_id", "gridzone_id", "oddsjack_id"))],
        "hasDisplayName": "display_name" in cols,
    })

    # 9) injuries weekly sanity (avg reports per season-week, 2024)
    inj = pl.scan_parquet(RAW / "injuries" / "injuries_2024.parquet")
    check("injuries2024", {
        "rows": inj.select(pl.len()).collect().item(),
        "weeks": inj.select(pl.col("week").n_unique()).collect().item(),
        "players": inj.select(pl.col("gsis_id").n_unique()).collect().item(),
    })

    # 10) roster crosswalk misses breakdown (who fails to resolve in players.parquet?)
    gsis_set = set(x for x in players.select("gsis_id").collect()["gsis_id"].to_list() if x)
    roster = pl.scan_parquet(RAW / "rosters" / "roster_2024.parquet") \
        .select(["gsis_id", "status"]).collect()
    roster = roster.with_columns(pl.col("gsis_id").is_in(list(gsis_set)).alias("resuelto"))
    un = roster.filter(~pl.col("resuelto"))
    by_status = dict(un.group_by("status").agg(pl.len()).sort("len", descending=True).iter_rows())
    check("roster2024_crosswalk_misses", {
        "unresolved": un.height,
        "ofTotal": roster.height,
        "byStatus": by_status,
        "note": "CUT = campamento pre-temporada, sin down regular -> sin GSIS en crosswalk; "
                "irrelevante para modelado de temporada regular",
    })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(results, indent=2, default=str), encoding="utf-8")
    print(f"\nEscrito: {OUT}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
