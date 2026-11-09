"""Descarga reproducible de nflverse ``stats_team_week`` (A15, ciclo 3).

Fuente: release ``stats_team`` de ``nflverse/nflverse-data``.
Un CSV por temporada, una fila por **equipo-partido** (incluye playoffs):

    https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_week_<YEAR>.csv

Licencia: CC BY 4.0. Atribución obligatoria a nflverse.
Verificado con ``curl -I`` (302 -> release-assets, 200, ~200-230 KB/año).

Escribe ``data/nfl/raw/team_week/stats_team_week_<YEAR>.csv`` y un
``manifest.json`` con URL, HTTP status, bytes, sha256, filas y columnas.

Uso::

    ./.venv/bin/python models/nfl/epa_download.py            # 1999..2025
    ./.venv/bin/python models/nfl/epa_download.py --verify    # solo comprueba sha256
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from config import DATA_DIR

TEAM_WEEK_DIR = DATA_DIR / "raw" / "team_week"
MANIFEST = TEAM_WEEK_DIR / "manifest.json"

URL_TEMPLATE = (
    "https://github.com/nflverse/nflverse-data/releases/download/stats_team/"
    "stats_team_week_{year}.csv"
)
YEARS = tuple(range(1999, 2026))
LICENSE = "CC BY 4.0"
ATTRIBUTION = (
    "nflverse (https://github.com/nflverse/nflverse-data), release 'stats_team', "
    "dataset stats_team_week. Licencia CC BY 4.0."
)
USER_AGENT = "PitchLab-research/1.0 (research use; contact: local)"


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch(year: int, dest: Path, retries: int = 3) -> dict:
    url = URL_TEMPLATE.format(year=year)
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=120) as resp:
                status = int(resp.status)
                payload = resp.read()
                final_url = resp.geturl()
            dest.write_bytes(payload)
            return {
                "year": year,
                "url": url,
                "final_url": final_url,
                "http_status": status,
                "bytes": len(payload),
                "attempt": attempt,
            }
        except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:  # pragma: no cover
            last_err = repr(exc)
            time.sleep(1.5 * attempt)
    raise RuntimeError(f"{year}: descarga fallida tras {retries} intentos: {last_err}")


def describe(path: Path) -> dict:
    df = pd.read_csv(path, low_memory=False)
    return {
        "rows": int(len(df)),
        "cols": int(df.shape[1]),
        "seasons": sorted({int(s) for s in df["season"].dropna().unique()}),
        "weeks_min": int(df["week"].min()),
        "weeks_max": int(df["week"].max()),
        "n_teams": int(df["team"].nunique()),
        "n_games": int(df["game_id"].nunique()),
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Descarga stats_team_week de nflverse")
    ap.add_argument("--verify", action="store_true", help="solo verifica sha256 del manifest")
    ap.add_argument("--years", type=int, nargs="*", default=list(YEARS))
    args = ap.parse_args(argv)

    TEAM_WEEK_DIR.mkdir(parents=True, exist_ok=True)

    if args.verify:
        man = json.loads(MANIFEST.read_text(encoding="utf-8"))
        bad = []
        for rec in man["files"]:
            path = TEAM_WEEK_DIR / rec["file"]
            got = sha256_of(path) if path.exists() else "MISSING"
            if got != rec["sha256"]:
                bad.append({"file": rec["file"], "expected": rec["sha256"], "got": got})
        print(f"verify: {len(man['files'])} ficheros, {len(bad)} discrepancias")
        for b in bad:
            print("  ", b)
        return 0 if not bad else 1

    records = []
    for year in args.years:
        dest = TEAM_WEEK_DIR / f"stats_team_week_{year}.csv"
        meta = fetch(year, dest)
        digest = sha256_of(dest)
        info = describe(dest)
        rec = {
            "year": year,
            "file": dest.name,
            "sha256": digest,
            "bytes": meta["bytes"],
            "http_status": meta["http_status"],
            "url": meta["url"],
            **info,
        }
        records.append(rec)
        print(
            f"{year}: HTTP {meta['http_status']} {meta['bytes']:>7} B  "
            f"rows={info['rows']:>4} cols={info['cols']:>3} games={info['n_games']:>3} "
            f"sha256={digest[:16]}…"
        )

    manifest = {
        "dataset": "nflverse stats_team_week",
        "source": "https://github.com/nflverse/nflverse-data/releases/tag/stats_team",
        "url_template": URL_TEMPLATE,
        "license": LICENSE,
        "attribution": ATTRIBUTION,
        "downloaded_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "years": sorted(r["year"] for r in records),
        "n_files": len(records),
        "total_bytes": int(sum(r["bytes"] for r in records)),
        "files": records,
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"manifest -> {MANIFEST}  ({len(records)} ficheros, {manifest['total_bytes']} B)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
