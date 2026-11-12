"""Quality checks for the derived games_with_weather layer.

Writes data/history/quality_reports/nfl/normalized_games_report.json
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import polars as pl

REPO_ROOT = Path(__file__).resolve().parents[3]
TABLE = REPO_ROOT / "data/history/normalized/nfl/games_with_weather.parquet"
GAMES = REPO_ROOT / "data/history/raw/nflverse/games.csv"
OUT = REPO_ROOT / "data/history/quality_reports/nfl/normalized_games_report.json"


def main() -> int:
    t = pl.read_parquet(TABLE)
    g = pl.read_csv(GAMES, infer_schema_length=0)

    checks = {}
    checks["rowParityWithGamesCsv"] = {"normalized": t.height, "gamesCsv": g.height,
                                       "ok": t.height == g.height}
    checks["uniqueGameIds"] = {"unique": t["game_id"].n_unique(), "rows": t.height,
                               "ok": t["game_id"].n_unique() == t.height}

    played = t.filter(pl.col("home_score").is_not_null())
    checks["playedGames"] = played.height

    # score sanity: totals match sum when both present
    bad_totals = played.filter(
        pl.col("total").is_not_null() &
        (pl.col("total") != (pl.col("away_score") + pl.col("home_score")))
    ).height
    checks["totalEqualsSumOfScores"] = {"violations": bad_totals, "ok": bad_totals == 0}

    # spread sign sanity: spread_line is home-favorite negative (nflverse convention)
    fav_consistent = played.filter(
        (pl.col("spread_line").is_not_null()) &
        (pl.col("home_score") > pl.col("away_score")) &
        (pl.col("spread_line") > 0)
    ).height  # home won but spread favored away by >0 → possible, spread is closing line not result
    checks["spreadIsClosingLineNote"] = {
        "homeWonWithPositiveSpreadRows": fav_consistent,
        "note": "spread_line es línea de CIERRE (pre-partido), no resultado; filas con home ganador y spread>0 son válidas",
    }

    cov = {
        "weatherStationAssigned": t.filter(pl.col("stationId").is_not_null()).height,
        "weatherTmaxPresent": t.filter(pl.col("tmax_c").is_not_null()).height,
        "weatherPrcpPresent": t.filter(pl.col("prcp_mm").is_not_null()).height,
        "oddsSpread": t.filter(pl.col("spread_line").is_not_null()).height,
        "oddsMoneyline": t.filter(
            pl.col("home_moneyline").is_not_null() | pl.col("away_moneyline").is_not_null()).height,
        "gamebookTempF": t.filter(pl.col("temp_gamebook_f").is_not_null()).height,
    }
    checks["coverage"] = cov

    # nulls preserved: no silent zeros in weather columns
    zero_tmax = t.filter(pl.col("tmax_c") == 0).height  # exact 0.0°C days exist naturally; just report
    checks["tmaxExactlyZeroC"] = zero_tmax

    # units spot-check: gamebook vs GHCN median abs diff after F->C (2023 open-air sample)
    sample = t.filter(
        (pl.col("season") == 2023) & (pl.col("roof") == "outdoors") &
        pl.col("temp_gamebook_f").is_not_null() & pl.col("tmax_c").is_not_null()
    )
    diffs = sample.select(
        ((pl.col("temp_gamebook_f") - 32) * 5 / 9 - pl.col("tmax_c")).abs().median().alias("med")
    ).item()
    checks["medianAbsDiffGamebookVsTmaxC_2023"] = round(diffs, 2) if diffs is not None else None

    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "table": "data/history/normalized/nfl/games_with_weather.parquet",
        "checks": checks,
        "status": "complete" if all(
            v.get("ok", True) for v in checks.values() if isinstance(v, dict)) else "issues",
    }
    OUT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report["checks"], indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
