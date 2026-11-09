"""Cross-source validation: nflverse games.csv weather vs NOAA GHCN-Daily.

Joins games (open-air stadiums) with the station mapping and GHCN daily rows,
computes match rate and temperature agreement between the two independent sources.

Writes: data/history/quality_reports/nfl/weather_cross_validation.json
"""

import csv
import json
import math
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
GAMES = REPO_ROOT / "data" / "history" / "raw" / "nflverse" / "games.csv"
MAPPING = REPO_ROOT / "data" / "history" / "manifests" / "nfl-station-mapping.csv"
STATIONS_DIR = REPO_ROOT / "data" / "history" / "raw" / "noaa-ghcn" / "stations"
OUT = REPO_ROOT / "data" / "history" / "quality_reports" / "nfl" / "weather_cross_validation.json"


def main() -> int:
    weather = {}
    for path in STATIONS_DIR.glob("*.csv"):
        with path.open(encoding="utf-8", errors="replace") as handle:
            for row in csv.DictReader(handle):
                weather[(path.stem, row["DATE"])] = {
                    v: (float(row[v]) if row.get(v) not in (None, "",) else None)
                    for v in ("TMAX", "TMIN")
                }

    mapping = {r["stadiumId"]: r["stationId"] for r in csv.DictReader(MAPPING.open(encoding="utf-8"))}

    matched = unmatched_venue = unmatched_day = 0
    diffs_max, diffs_min, pairs = [], [], 0
    open_rows = []
    with GAMES.open(encoding="utf-8") as handle:
        for g in csv.DictReader(handle):
            venue = g["stadium_id"] if g["stadium_id"] in {"BUF01", "SFO01"} else g["stadium_id"][:3]
            station = mapping.get(venue)
            if station is None:
                unmatched_venue += 1
                continue
            key = (station, g["gameday"])
            if key not in weather:
                unmatched_day += 1
                continue
            matched += 1
            ghcn = weather[key]
            try:
                game_temp = float(g["temp"]) if g["temp"] not in ("", None) else None
            except ValueError:
                game_temp = None
            if game_temp is not None and ghcn["TMAX"] is not None:
                pairs += 1
                # gamebook temp is Fahrenheit; GHCN metric is Celsius
                game_temp_c = (game_temp - 32) * 5 / 9
                diffs_max.append(abs(game_temp_c - ghcn["TMAX"]))
                if ghcn["TMIN"] is not None:
                    diffs_min.append(abs(game_temp_c - ghcn["TMIN"]))
            open_rows.append({
                "game_id": g["game_id"],
                "roof": g["roof"],
                "temp": game_temp,
                "tmax": ghcn["TMAX"],
                "tmin": ghcn["TMIN"],
            })

    # correlation for open-air stadiums (roof = outdoor), gamebook temp vs GHCN TMAX
    def corr(xs, ys):
        n = len(xs)
        mx, my = statistics.mean(xs), statistics.mean(ys)
        cov = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
        vx = math.sqrt(sum((x - mx) ** 2 for x in xs))
        vy = math.sqrt(sum((y - my) ** 2 for y in ys))
        return cov / (vx * vy) if vx and vy else None

    open_pairs = [(r["temp"], r["tmax"]) for r in open_rows
                  if r["roof"] == "outdoors" and r["temp"] is not None and r["tmax"] is not None]
    xs, ys = zip(*open_pairs) if open_pairs else ((), ())
    r_temp = corr(xs, ys) if open_pairs else None

    result = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "gamesTotal": matched + unmatched_venue + unmatched_day,
        "matchedWithStationAndDay": matched,
        "unmatchedVenueNoStation": unmatched_venue,
        "unmatchedVenueButStationKnown": 0,
        "unmatchedDayNoStationData": unmatched_day,
        "gamebookTempPairsVsTmax": pairs,
        "absDiffVsTmaxMedian": round(statistics.median(diffs_max), 2) if diffs_max else None,
        "absDiffVsTmaxP90": round(sorted(diffs_max)[int(0.9 * len(diffs_max))], 2) if diffs_max else None,
        "absDiffVsTminMedian": round(statistics.median(diffs_min), 2) if diffs_min else None,
        "openAirPairs": len(open_pairs),
        "pearsonGamebookVsTmaxOutdoor": round(r_temp, 4) if r_temp is not None else None,
        "note": "gamebook temp = kickoff observation; GHCN TMAX = daily max: differences expected "
                "when kickoff is far from daily max. Median |diff| small => sources agree.",
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
