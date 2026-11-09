#!/usr/bin/env python3
"""Descarga snapshots históricos de ClubElo (api.clubelo.com, gratuito CC-BY) y construye
una tabla de ratings inter-liga e inter-división para enriquecer los priors de Elo.

Si el endpoint remoto de ClubElo no está disponible (p.ej. HTTP 502), construye un
snapshot causal equivalente calibrado con anclas de liga UEFA y continuidad multi-división
sobre `data/processed/matches.parquet` para garantizar reproducibilidad 100% offline.

Uso:
    python etl/download_clubelo.py [--force] [--offline]

Salidas:
    data/raw/clubelo/<date>.csv              Snapshots semestrales (si API disponible)
    data/processed/clubelo_ratings.parquet   Tabla consolidada (snapshot_date, club_raw, club_norm, country, level, elo)
"""
from __future__ import annotations

import argparse
import glob
import os
import re
import subprocess
import sys
import unicodedata
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(ROOT, "data", "raw", "clubelo")
OUT_DIR = os.path.join(ROOT, "data", "processed")
MATCHES_PATH = os.path.join(OUT_DIR, "matches.parquet")

BASE_URL = "http://api.clubelo.com"
UA = "PitchLab-PredictionLab/2.0 (Academic Research)"

SNAPSHOT_DATES = sorted(
    {f"{yr}-08-15" for yr in range(2000, 2026)} | {f"{yr}-01-15" for yr in range(2000, 2026)}
)

# Anclas empíricas de fuerza base por división (escala ClubElo: Top-5 Tier 1 ~1600-1650, Tier 2 ~ -135 pts)
DIV_BASE_ELO: dict[str, tuple[str, int, float]] = {
    "E0": ("England", 1, 1650.0),
    "E1": ("England", 2, 1485.0),
    "SP1": ("Spain", 1, 1635.0),
    "SP2": ("Spain", 2, 1470.0),
    "D1": ("Germany", 1, 1620.0),
    "D2": ("Germany", 2, 1455.0),
    "I1": ("Italy", 1, 1615.0),
    "I2": ("Italy", 2, 1450.0),
    "F1": ("France", 1, 1575.0),
    "F2": ("France", 2, 1415.0),
    "P1": ("Portugal", 1, 1530.0),
    "N1": ("Netherlands", 1, 1525.0),
    "B1": ("Belgium", 1, 1500.0),
    "T1": ("Turkey", 1, 1490.0),
    "G1": ("Greece", 1, 1470.0),
    "SC0": ("Scotland", 1, 1450.0),
    "SC1": ("Scotland", 2, 1310.0),
    "BRA": ("Brazil", 1, 1545.0),
    "ARG": ("Argentina", 1, 1525.0),
    "MEX": ("Mexico", 1, 1510.0),
    "USA": ("USA", 1, 1475.0),
    "JPN": ("Japan", 1, 1465.0),
    "SWE": ("Sweden", 1, 1435.0),
}

CLUBELO_TO_FD_ALIASES = {
    "man united": "man united",
    "manchester united": "man united",
    "man city": "man city",
    "manchester city": "man city",
    "newcastle": "newcastle",
    "newcastle united": "newcastle",
    "tottenham": "tottenham",
    "spurs": "tottenham",
    "wolverhampton": "wolves",
    "wolves": "wolves",
    "west brom": "west brom",
    "west bromwich": "west brom",
    "sheffield united": "sheffield united",
    "sheffield wednesday": "sheffield weds",
    "nottingham forest": "nott'm forest",
    "nottm forest": "nott'm forest",
    "queens park rangers": "qpr",
    "qpr": "qpr",
    "bayern munich": "bayern munich",
    "bayern munchen": "bayern munich",
    "borussia dortmund": "dortmund",
    "bayer leverkusen": "leverkusen",
    "borussia monchengladbach": "m'gladbach",
    "eintracht frankfurt": "ein frankfurt",
    "vfb stuttgart": "stuttgart",
    "vfl wolfsburg": "wolfsburg",
    "mainz 05": "mainz",
    "hertha bsc": "hertha",
    "inter milan": "inter",
    "internazionale": "inter",
    "ac milan": "milan",
    "as roma": "roma",
    "hellas verona": "verona",
    "atletico madrid": "ath madrid",
    "athletic bilbao": "ath bilbao",
    "real sociedad": "sociedad",
    "real betis": "betis",
    "celta vigo": "celta",
    "espanyol": "espanol",
    "deportivo la coruna": "la coruna",
    "sporting gijon": "sp gijon",
    "rayo vallecano": "vallecano",
    "paris saint germain": "paris sg",
    "saint etienne": "st etienne",
    "psv": "psv eindhoven",
    "az alkmaar": "az alkmaar",
    "fc porto": "porto",
    "sporting cp": "sp lisbon",
    "sporting lisbon": "sp lisbon",
    "braga": "sp braga",
    "vitoria guimaraes": "guimaraes",
    "standard liege": "standard",
    "olympiacos": "olympiakos",
    "aek athens": "aek",
}


def normalize_name(name: str) -> str:
    s = unicodedata.normalize("NFKD", str(name)).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9']+", " ", s).strip().lower()
    return CLUBELO_TO_FD_ALIASES.get(s, s)


def fetch_snapshot(date_str: str, force: bool = False) -> dict:
    os.makedirs(RAW_DIR, exist_ok=True)
    dest = os.path.join(RAW_DIR, f"{date_str}.csv")
    url = f"{BASE_URL}/{date_str}"
    if os.path.exists(dest) and not force and os.path.getsize(dest) > 200:
        return {"date": date_str, "status": 200, "cached": True, "bytes": os.path.getsize(dest)}

    tmp = dest + ".part"
    proc = subprocess.run(
        ["curl", "-sSL", "--fail", "--max-time", "8", "-A", UA, "-o", tmp, "-w", "%{http_code}", url],
        capture_output=True,
        text=True,
    )
    code = (proc.stdout or "").strip()
    if proc.returncode == 0 and code.startswith("2") and os.path.exists(tmp) and os.path.getsize(tmp) > 200:
        os.replace(tmp, dest)
        return {"date": date_str, "status": int(code), "cached": False, "bytes": os.path.getsize(dest)}
    if os.path.exists(tmp):
        os.remove(tmp)
    return {"date": date_str, "status": f"err:{code}", "cached": False, "bytes": 0}


def build_from_matches_fallback() -> pd.DataFrame:
    """Construye snapshots causales multi-división (escala ClubElo) a partir de matches.parquet."""
    if not os.path.exists(MATCHES_PATH):
        return pd.DataFrame(columns=["snapshot_date", "club_raw", "club_norm", "country", "level", "elo"])
    df = pd.read_parquet(MATCHES_PATH)
    df = df.sort_values(["match_date", "kickoff_time", "match_id"], kind="mergesort").reset_index(drop=True)
    dates = pd.to_datetime(df["match_date"]).dt.strftime("%Y-%m-%d").to_numpy()
    divs = df["div"].to_numpy()
    homes = df["home_team"].to_numpy()
    aways = df["away_team"].to_numpy()
    hg = df["home_goals"].to_numpy(dtype=float)
    ag = df["away_goals"].to_numpy(dtype=float)

    # Estado por (country, club_raw): (elo, last_level, last_div)
    state: dict[tuple[str, str], tuple[float, int, str]] = {}
    snapshots = sorted(SNAPSHOT_DATES)
    snap_idx = 0
    rows = []

    def record_snapshot(snap_date: str):
        for (country, club), (elo_val, lvl, _div) in state.items():
            rows.append(
                {
                    "snapshot_date": snap_date,
                    "club_raw": club,
                    "club_norm": normalize_name(club),
                    "country": country,
                    "level": int(lvl),
                    "elo": round(float(elo_val), 3),
                }
            )

    for i in range(len(df)):
        d_str = dates[i]
        while snap_idx < len(snapshots) and snapshots[snap_idx] <= d_str:
            record_snapshot(snapshots[snap_idx])
            snap_idx += 1

        div = str(divs[i])
        country, level, base_elo = DIV_BASE_ELO.get(div, ("Unknown", 1, 1500.0))
        h = str(homes[i])
        a = str(aways[i])
        kh = (country, h)
        ka = (country, a)
        if kh not in state:
            state[kh] = (base_elo, level, div)
        if ka not in state:
            state[ka] = (base_elo, level, div)

        eh, lh, dh = state[kh]
        ea, la, da = state[ka]
        # Si el equipo cambió de división dentro del país, conserva su Elo continuo
        state[kh] = (eh, level, div)
        state[ka] = (ea, level, div)

        if np.isfinite(hg[i]) and np.isfinite(ag[i]):
            exp_h = 1.0 / (1.0 + 10.0 ** (-(eh - ea + 65.0) / 400.0))
            if hg[i] > ag[i]:
                s_h = 1.0
            elif hg[i] == ag[i]:
                s_h = 0.5
            else:
                s_h = 0.0
            gd = abs(hg[i] - ag[i])
            mult = np.log(gd + 1.0) if gd > 1 else 1.0
            delta = 20.0 * mult * (s_h - exp_h)
            state[kh] = (eh + delta, level, div)
            state[ka] = (ea - delta, level, div)

    while snap_idx < len(snapshots):
        record_snapshot(snapshots[snap_idx])
        snap_idx += 1

    return pd.DataFrame(rows)


def build_parquet() -> pd.DataFrame:
    os.makedirs(OUT_DIR, exist_ok=True)
    files = sorted(glob.glob(os.path.join(RAW_DIR, "*.csv")))
    rows = []
    for path in files:
        snap_date = os.path.splitext(os.path.basename(path))[0]
        try:
            df = pd.read_csv(path)
        except Exception:
            continue
        if "Club" not in df.columns or "Elo" not in df.columns:
            continue
        for r in df.to_dict("records"):
            club = str(r.get("Club", "")).strip()
            if not club:
                continue
            try:
                elo = float(r.get("Elo", np.nan))
            except (TypeError, ValueError):
                continue
            if not np.isfinite(elo):
                continue
            level = r.get("Level", 1)
            try:
                level = int(float(level))
            except (TypeError, ValueError):
                level = 1
            rows.append(
                {
                    "snapshot_date": snap_date,
                    "club_raw": club,
                    "club_norm": normalize_name(club),
                    "country": str(r.get("Country", "")).strip(),
                    "level": level,
                    "elo": elo,
                }
            )
    if rows:
        out_df = pd.DataFrame(rows).sort_values(["snapshot_date", "club_norm"]).reset_index(drop=True)
    else:
        out_df = build_from_matches_fallback()
    out_path = os.path.join(OUT_DIR, "clubelo_ratings.parquet")
    out_df.to_parquet(out_path, index=False)
    return out_df


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--offline", action="store_true", help="Usar caché o fallback causal desde matches.parquet")
    args = ap.parse_args()

    if not args.offline:
        # Probar primero un snapshot para detectar si api.clubelo.com está operativo
        probe = fetch_snapshot(SNAPSHOT_DATES[-1], args.force)
        if probe["bytes"] > 0:
            with ThreadPoolExecutor(max_workers=6) as ex:
                results = list(ex.map(lambda d: fetch_snapshot(d, args.force), SNAPSHOT_DATES[:-1])) + [probe]
            ok = sum(1 for r in results if r["bytes"] > 0)
            print(f"[clubelo] snapshots descargados/cacheados: {ok}/{len(SNAPSHOT_DATES)}")
        else:
            print(f"[clubelo] API remota devolvió {probe['status']}; usando constructor causal multi-división.")

    df = build_parquet()
    print(f"[clubelo] clubelo_ratings.parquet: {len(df):,} filas")
    return 0


if __name__ == "__main__":
    sys.exit(main())
