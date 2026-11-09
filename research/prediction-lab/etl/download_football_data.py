#!/usr/bin/env python3
"""Descarga el corpus histórico de football-data.co.uk (gratuito).

Uso:
    python etl/download_football_data.py [--force]

Salida:
    data/raw/main/<season>/<div>.csv   (divisiones principales, por temporada)
    data/raw/extra/<CODE>.csv          (ligas extra, un archivo con toda la historia)
    data/raw/manifest.json             (URL, estado HTTP, bytes, sha256, timestamp)

No se inventan temporadas: si la fuente no tiene el archivo, se registra el 404.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

BASE = "https://www.football-data.co.uk"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"

# Divisiones principales: se descargan todas las temporadas 2000/01..2026/27.
# tier1 = panel primario (primeras divisiones), tier2 = panel secundario.
MAIN = {
    "E0": ("Premier League", "England", 1),
    "E1": ("Championship", "England", 2),
    "D1": ("Bundesliga", "Germany", 1),
    "D2": ("2. Bundesliga", "Germany", 2),
    "I1": ("Serie A", "Italy", 1),
    "I2": ("Serie B", "Italy", 2),
    "SP1": ("La Liga", "Spain", 1),
    "SP2": ("Segunda Division", "Spain", 2),
    "F1": ("Ligue 1", "France", 1),
    "F2": ("Ligue 2", "France", 2),
    "N1": ("Eredivisie", "Netherlands", 1),
    "P1": ("Primeira Liga", "Portugal", 1),
    "T1": ("Super Lig", "Turkey", 1),
    "B1": ("Belgian Pro League", "Belgium", 1),
    "G1": ("Greek Super League", "Greece", 1),
    "SC0": ("Scottish Premiership", "Scotland", 1),
    "SC1": ("Scottish Championship", "Scotland", 2),
}
EXTRA = {
    "MEX": ("Liga MX", "Mexico"),
    "ARG": ("Liga Profesional", "Argentina"),
    "BRA": ("Serie A", "Brazil"),
    "USA": ("MLS", "USA"),
    "JPN": ("J1 League", "Japan"),
    "SWE": ("Allsvenskan", "Sweden"),
}
SEASONS = [f"{y % 100:02d}{(y + 1) % 100:02d}" for y in range(2000, 2027)]


def fetch(url: str, dest: str, force: bool = False, retries: int = 3) -> dict:
    """Descarga con curl (el Python del sistema no tiene CA bundle configurado)."""
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if os.path.exists(dest) and not force and os.path.getsize(dest) > 100:
        raw = open(dest, "rb").read()
        return {"url": url, "status": 200, "cached": True, "bytes": len(raw),
                "sha256": hashlib.sha256(raw).hexdigest()}
    last = "unknown"
    for attempt in range(retries):
        tmp = dest + ".part"
        proc = subprocess.run(
            ["curl", "-sSL", "--fail", "--max-time", "60", "-A", UA,
             "-H", "Accept: text/csv,*/*", "-o", tmp, "-w", "%{http_code}", url],
            capture_output=True, text=True,
        )
        code = (proc.stdout or "").strip()
        if proc.returncode == 0 and code.startswith("2") and os.path.exists(tmp):
            raw = open(tmp, "rb").read()
            if len(raw) > 100:
                os.replace(tmp, dest)
                return {"url": url, "status": int(code), "bytes": len(raw),
                        "sha256": hashlib.sha256(raw).hexdigest()}
        last = f"curl={proc.returncode} http={code} err={(proc.stderr or '').strip()[:120]}"
        if os.path.exists(tmp):
            os.remove(tmp)
        if code in ("403", "404", "410"):
            break
        time.sleep(1.0 * (attempt + 1))
    return {"url": url, "status": last, "bytes": 0, "sha256": None}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    raw = os.path.join(root, "data", "raw")
    manifest = {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "source": BASE, "files": {}}
    jobs = []
    for season in SEASONS:
        for div in MAIN:
            jobs.append((f"{BASE}/mmz4281/{season}/{div}.csv",
                         os.path.join(raw, "main", season, f"{div}.csv"),
                         f"main/{season}/{div}.csv"))
    for code in EXTRA:
        jobs.append((f"{BASE}/new/{code}.csv", os.path.join(raw, "extra", f"{code}.csv"),
                     f"extra/{code}.csv"))
    ok = fail = 0

    def run(job):
        url, dest, key = job
        return key, fetch(url, dest, args.force)

    with ThreadPoolExecutor(max_workers=8) as ex:
        for i, (key, res) in enumerate(ex.map(run, jobs), start=1):
            manifest["files"][key] = res
            if res.get("sha256"):
                ok += 1
            else:
                fail += 1
            if i % 50 == 0:
                print(f"{i}/{len(jobs)} ok={ok} fail={fail}", flush=True)
    with open(os.path.join(raw, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1, sort_keys=True)
    print(f"TOTAL ok={ok} fail={fail}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
