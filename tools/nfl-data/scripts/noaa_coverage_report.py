"""Per-station, per-year coverage report for the NOAA GHCN-Daily weather data.

Usage: tools/nfl-data/.venv/Scripts/python.exe -I noaa_coverage_report.py

For every station CSV: counts days with non-null TMAX/TMIN/PRCP/SNOW/SNWD/AWND,
by year and station-wide. Writes:
  data/history/quality_reports/nfl/noaa_coverage.json
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import polars as pl

REPO_ROOT = Path(__file__).resolve().parents[3]
STATIONS_DIR = REPO_ROOT / "data" / "history" / "raw" / "noaa-ghcn" / "stations"
MAPPING = REPO_ROOT / "data" / "history" / "manifests" / "nfl-station-mapping.csv"
OUT = REPO_ROOT / "data" / "history" / "quality_reports" / "nfl" / "noaa_coverage.json"
VARS = ["TMAX", "TMIN", "PRCP", "SNOW", "SNWD", "AWND"]


def read_station(path: Path) -> pl.DataFrame:
    df = pl.read_csv(path, infer_schema_length=0, null_values=[""])
    df = df.with_columns(pl.exclude("STATION", "DATE").cast(pl.Float64, strict=False))
    df = df.with_columns(pl.col("DATE").str.slice(0, 4).alias("year"))
    return df


def main() -> int:
    mapping_rows = list(csv_mapping := __import__("csv").DictReader(MAPPING.open(encoding="utf-8")))
    station_to_city = {}
    station_to_venues = {}
    for row in mapping_rows:
        station_to_city.setdefault(row["stationId"], row["city"])
        station_to_venues.setdefault(row["stationId"], set()).add(f"{row['stadiumId']}:{row['stadium']}")

    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "NOAA NCEI GHCN-Daily (US public domain; cite NCEI)",
        "range": "1999-01-01..2026-11-08",
        "expectedDaysPerYear": {str(y): (366 if (y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)) else 365)
                                 for y in range(1999, 2027)},
        "stations": {},
    }

    for path in sorted(STATIONS_DIR.glob("*.csv")):
        sid = path.stem
        df = read_station(path)
        years = sorted(set(df["year"].to_list()))
        per_year = {}
        for year in years:
            dfy = df.filter(pl.col("year") == year)
            per_year[year] = {
                "rows": dfy.height,
                **{v: int(dfy.filter(pl.col(v).is_not_null()).height) for v in VARS if v in dfy.columns},
            }
        totals = {v: int(df.filter(pl.col(v).is_not_null()).height) for v in VARS if v in df.columns}
        report["stations"][sid] = {
            "city": station_to_city.get(sid),
            "venues": sorted(station_to_venues.get(sid, [])),
            "firstDate": df["DATE"].min(),
            "lastDate": df["DATE"].max(),
            "totalRows": df.height,
            "nonNullTotals": totals,
            "perYear": per_year,
        }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"escrito: {OUT}")
    print(f"estaciones: {len(report['stations'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
