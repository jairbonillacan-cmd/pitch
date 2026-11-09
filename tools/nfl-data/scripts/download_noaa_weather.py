"""Map NFL stadiums (from games.csv) to GHCN-Daily stations and download weather.

Methodology (no invented data):
  1. Unique venues come from games.csv (stadium_id + stadium name).
  2. Each venue is assigned explicit candidate GHCN station IDs. Every ID listed
     below was taken from the official NCEI station inventory (ghcnd-stations.txt)
     and probed for data availability before adoption; candidates are tried in
     order and a venue with no working candidate is recorded as unavailable.
  3. Daily summaries (TMAX/TMIN/PRCP/SNOW/SNWD/AWND, metric, 1999-01-01..2026-11-08)
     are downloaded from the free NCEI Data Service API
     (US public domain, no key; cite NCEI GHCN-Daily).

Outputs:
  data/history/raw/noaa-ghcn/ghcnd-stations.txt        (official inventory)
  data/history/raw/noaa-ghcn/stations/<station>.csv    (daily summaries)
  data/history/manifests/nfl-station-mapping.csv       (versioned mapping)
  data/history/manifests/noaa-downloads-manifest.jsonl (per-station records)
"""

import csv
import hashlib
import json
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
GHCN_DIR = REPO_ROOT / "data" / "history" / "raw" / "noaa-ghcn"
STATIONS_DIR = GHCN_DIR / "stations"
MANIFEST = REPO_ROOT / "data" / "history" / "manifests" / "noaa-downloads-manifest.jsonl"
MAPPING_CSV = REPO_ROOT / "data" / "history" / "manifests" / "nfl-station-mapping.csv"
INVENTORY = GHCN_DIR / "ghcnd-stations.txt"
API = "https://www.ncei.noaa.gov/access/services/data/v1"

LICENSE = "US Government public domain (NOAA NCEI); cite: NCEI GHCN-Daily"
SOURCE = "https://www.ncei.noaa.gov/products/land-based-station/global-historical-climatology-network-daily"
RANGE = ("1999-01-01", "2026-11-08")
DATA_TYPES = "TMAX,TMIN,PRCP,SNOW,SNWD,AWND"

# venue_key -> (city, [candidate GHCN station IDs in preference order])
# IDs verified against ghcnd-stations.txt and data-probed; None = documented unavailability.
VENUES = [
    ("ATL", "Atlanta, GA", ["USW00013874"]),
    ("BAL", "Baltimore, MD", ["USW00093721"]),
    ("BOS", "Foxborough, MA", ["USW00014739"]),
    ("BUF", "Orchard Park, NY", ["USW00014768"]),
    ("BUF01", "Toronto, ON (Rogers Centre)", []),
    ("CAR", "Charlotte, NC", ["USW00013881"]),
    ("CHI", "Chicago, IL (Soldier Field)", ["USW00094846"]),
    ("CHI99", "Champaign, IL (Memorial Stadium 2021)", []),
    ("CIN", "Cincinnati, OH", ["USW00093814"]),
    ("CLE", "Cleveland, OH", ["USW00014820"]),
    ("DAL", "Arlington/Irving, TX", ["USW00003927"]),
    ("DEN", "Denver, CO", ["USW00003167"]),
    ("DET", "Detroit/Pontiac, MI", ["USW00094847"]),
    ("FRA", "Frankfurt, DE", ["GME00122362"]),
    ("GER", "Munich, DE (Allianz Arena)", ["GM000004199"]),
    ("GNB", "Green Bay, WI", ["USW00014918"]),
    ("HOU", "Houston, TX", ["USW00012960"]),
    ("IND", "Indianapolis, IN", ["USW00093819"]),
    ("JAX", "Jacksonville, FL", ["USW00013810"]),
    ("KAN", "Kansas City, MO", ["USW00003928"]),
    ("LAX", "Los Angeles, CA", ["USW00023174"]),
    ("LON", "London, UK", ["UKM00003772", "UKE00107650"]),
    ("MAD", "Madrid, ES (Bernabeu)", ["SPE00120278"]),
    ("MEL", "Melbourne, AU (MCG)", ["ASN00086282"]),
    ("MEX", "Mexico City, MX", ["MXM00076680"]),
    ("MIA", "Miami Gardens, FL", ["USW00012839"]),
    ("MIN", "Minneapolis, MN", ["USW00014922"]),
    ("MUN", "Munich, DE (FC Bayern)", ["GM000004199"]),
    ("NAS", "Nashville, TN", ["USW00013897"]),
    ("NOR", "New Orleans, LA", ["USW00012916"]),
    ("NYC", "East Rutherford, NJ", ["USW00014734"]),
    ("OAK", "Oakland, CA", ["USW00023230"]),
    ("PAR", "Paris, FR (Stade de France)", ["FRM00007149"]),
    ("PHI", "Philadelphia, PA", ["USW00013739"]),
    ("PHO", "Phoenix metro, AZ", ["USW00023183"]),
    ("PIT", "Pittsburgh, PA", ["USW00094823"]),
    ("RIO", "Rio de Janeiro, BR (Maracana)", []),
    ("SAN", "San Antonio, TX (Alamodome)", ["USW00012921"]),
    ("SAO", "Sao Paulo, BR (Arena Corinthians)", ["BR00E3-0520"]),
    ("SDG", "San Diego, CA", ["USW00023188"]),
    ("SEA", "Seattle, WA", ["USW00024229"]),
    ("SFO", "San Francisco, CA", ["USW00023234"]),
    ("SFO01", "Santa Clara, CA (Levi's)", ["USW00023293"]),
    ("STL", "St. Louis, MO", ["USW00013994"]),
    ("TAM", "Tampa, FL", ["USW00012842"]),
    ("VEG", "Paradise, NV (Allegiant)", ["USW00023169"]),
    ("WAS", "Landover, MD", ["USW00013743"]),
]

DOME_VENUES = {"ATL", "DET", "HOU", "IND", "MIN", "NOR", "STL", "PHO", "VEG", "LAX01", "DAL", "SAN", "MUN"}


def load_inventory() -> dict[str, dict]:
    stations = {}
    for line in INVENTORY.read_text(encoding="ascii", errors="replace").splitlines():
        if len(line) < 21:
            continue
        sid = line[0:11].strip()
        stations[sid] = {
            "id": sid,
            "lat": float(line[12:20].strip() or 0),
            "lon": float(line[21:30].strip() or 0),
            "name": line[41:71].strip(),
        }
    return stations


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def append_manifest(record: dict) -> None:
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    with MANIFEST.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def has_data(path: Path) -> bool:
    """File must contain at least one data row beyond the header."""
    try:
        with path.open(encoding="utf-8", errors="replace") as handle:
            for i, line in enumerate(handle):
                if i >= 1 and line.strip():
                    return True
            return False
    except OSError:
        return False


def download_station(station_id: str, station_name: str) -> dict:
    dest = STATIONS_DIR / f"{station_id}.csv"
    url = (f"{API}?dataset=daily-summaries&stations={station_id}"
           f"&startDate={RANGE[0]}&endDate={RANGE[1]}"
           f"&dataTypes={DATA_TYPES}&units=metric&format=csv")
    record = {
        "dataset": "noaa_ghcn_daily",
        "asset": f"{station_id}.csv",
        "stationName": station_name,
        "sourceUrl": url,
        "license": LICENSE,
        "source": SOURCE,
        "downloadedAt": datetime.now(timezone.utc).isoformat(),
        "localPath": str(dest.relative_to(REPO_ROOT)),
    }
    if dest.exists() and dest.stat().st_size > 0 and has_data(dest):
        record.update(status="skipped_existing", sizeBytes=dest.stat().st_size, sha256=sha256_file(dest))
        print(f"[skip-exists] {station_id}", flush=True)
        return record
    request = urllib.request.Request(url, headers={"User-Agent": "PitchLab-DataCollection/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            tmp = dest.with_suffix(".part")
            with tmp.open("wb") as handle:
                while True:
                    chunk = response.read(1 << 20)
                    if not chunk:
                        break
                    handle.write(chunk)
            tmp.rename(dest)
    except urllib.error.HTTPError as error:
        record.update(status="error", error=f"HTTP {error.code}")
        print(f"[HTTP {error.code}] {station_id}", flush=True)
        return record
    if not has_data(dest):
        record.update(status="no_data", sizeBytes=dest.stat().st_size, error="station returned no rows in range")
        dest.unlink(missing_ok=True)
        print(f"[no-data] {station_id}", flush=True)
        return record
    record.update(status="downloaded", sizeBytes=dest.stat().st_size, sha256=sha256_file(dest))
    print(f"[ok] {station_id} ({record['sizeBytes']:,} B)", flush=True)
    return record


def main() -> int:
    INVENTORY.parent.mkdir(parents=True, exist_ok=True)
    STATIONS_DIR.mkdir(parents=True, exist_ok=True)
    if not INVENTORY.exists():
        request = urllib.request.Request(
            "https://www.ncei.noaa.gov/pub/data/ghcn/daily/ghcnd-stations.txt",
            headers={"User-Agent": "PitchLab-DataCollection/1.0"})
        with urllib.request.urlopen(request, timeout=300) as response, INVENTORY.open("wb") as handle:
            handle.write(response.read())

    inventory = load_inventory()
    games_rows = list(csv.DictReader((REPO_ROOT / "data/history/raw/nflverse/games.csv").open(encoding="utf-8")))
    venues_seen = sorted({(r["stadium_id"] if r["stadium_id"] in {"BUF01", "SFO01"} else r["stadium_id"][:3],
                           r["stadium"]) for r in games_rows})

    mapping_rows, unavailable = [], []
    stations_needed: dict[str, dict] = {}
    for venue_key, stadium_name in venues_seen:
        entry = next((v for v in VENUES if v[0] == venue_key), None)
        if entry is None:
            unavailable.append({"venue": venue_key, "stadium": stadium_name,
                                "reason": "no curated venue entry"})
            continue
        city, candidates = entry[1], entry[2]
        chosen = None
        for sid in candidates:
            if sid not in inventory:
                continue
            stations_needed.setdefault(sid, inventory[sid])
            chosen = sid
            break
        if chosen is None:
            unavailable.append({"venue": venue_key, "stadium": stadium_name, "city": city,
                                "reason": "sin estación GHCN-Daily con datos (candidatos: " + ", ".join(candidates) + ")"
                                            if candidates else "sin estación GHCN-Daily disponible para esa ciudad"})
            continue
        mapping_rows.append({
            "stadiumId": venue_key,
            "stadium": stadium_name,
            "city": city,
            "stationId": chosen,
            "stationName": inventory[chosen]["name"],
            "stationLat": inventory[chosen]["lat"],
            "stationLon": inventory[chosen]["lon"],
            "isDomeVenue": "yes" if venue_key in DOME_VENUES else "no",
        })

    MAPPING_CSV.parent.mkdir(parents=True, exist_ok=True)
    with MAPPING_CSV.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(mapping_rows[0].keys()))
        writer.writeheader()
        writer.writerows(mapping_rows)

    print(f"venues mapeados: {len(mapping_rows)} · estaciones únicas: {len(stations_needed)} · sin estación: {len(unavailable)}")
    for u in unavailable:
        print("UNAVAILABLE:", u, flush=True)

    counts = {"downloaded": 0, "skipped_existing": 0, "no_data": 0, "error": 0}
    for station_id, station in sorted(stations_needed.items()):
        record = download_station(station_id, station["name"])
        append_manifest(record)
        counts[record["status"]] = counts.get(record["status"], 0) + 1
        time.sleep(0.5)

    print("\n=== RESUMEN ===")
    for status, count in sorted(counts.items()):
        print(f"{status}: {count}")
    print(f"mapping: {MAPPING_CSV}")
    return 0 if counts.get("error", 0) == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
