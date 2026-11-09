"""Descarga reproducible de nflverse games.csv + manifiesto con sha256.

Uso::

    ./.venv/bin/python models/nfl/download.py            # descarga si falta
    ./.venv/bin/python models/nfl/download.py --force    # re-descarga

Escribe ``data/nfl/raw/games.csv`` y ``data/nfl/raw/manifest.json``. El
manifiesto incluye sha256, bytes, filas, fecha UTC de descarga, URL, licencia y
atribución. El script es idempotente: si el CSV existe y el sha256 coincide con
el manifiesto, no vuelve a descargar.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import urllib.request
from datetime import datetime, timezone

import pandas as pd

from config import (
    MANIFEST,
    RAW_CSV,
    RAW_DIR,
    SEED,
    SOURCE_ATTRIBUTION,
    SOURCE_LICENSE,
    SOURCE_NAME,
    SOURCE_URL,
)


def sha256_of(path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch(force: bool = False) -> dict:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    previous = {}
    if MANIFEST.exists():
        previous = json.loads(MANIFEST.read_text(encoding="utf-8"))

    need = force or not RAW_CSV.exists()
    if not need and previous.get("sha256"):
        if sha256_of(RAW_CSV) != previous["sha256"]:
            need = True  # fichero corrupto o cambiado: re-descargar

    if need:
        tmp = RAW_CSV.with_suffix(".csv.tmp")
        req = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "pitchlab-a12/1.0"})
        with urllib.request.urlopen(req, timeout=120) as resp, open(tmp, "wb") as out:
            out.write(resp.read())
        tmp.replace(RAW_CSV)

    digest = sha256_of(RAW_CSV)
    df = pd.read_csv(RAW_CSV)
    manifest = {
        "source_name": SOURCE_NAME,
        "source_url": SOURCE_URL,
        "license": SOURCE_LICENSE,
        "attribution": SOURCE_ATTRIBUTION,
        "license_url": "https://creativecommons.org/licenses/by/4.0/",
        "file": str(RAW_CSV.relative_to(RAW_CSV.parents[3])),
        "sha256": digest,
        "bytes": RAW_CSV.stat().st_size,
        "rows": int(len(df)),
        "columns": int(df.shape[1]),
        "season_min": int(df["season"].min()),
        "season_max": int(df["season"].max()),
        "downloaded_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "download_mode": "http_get" if need else "cached",
        "seed": SEED,
        "notes": (
            "games.csv de nflverse/nfldata (rama master). Incluye temporada regular, "
            "playoffs y calendario futuro (2026) sin marcador. Uso no comercial con "
            "atribución a nflverse (CC BY 4.0)."
        ),
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return manifest


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Descarga games.csv de nflverse y registra sha256")
    ap.add_argument("--force", action="store_true", help="re-descargar aunque exista")
    args = ap.parse_args(argv)
    man = fetch(force=args.force)
    print(f"OK {man['file']} rows={man['rows']} cols={man['columns']}")
    print(f"sha256={man['sha256']} bytes={man['bytes']} mode={man['download_mode']}")
    print(f"licencia={man['license']} — {SOURCE_ATTRIBUTION}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
