#!/usr/bin/env python3
"""Construye la tabla canónica `matches` a partir de los CSV crudos de football-data.co.uk.

Uso:
    ./.venv/bin/python etl/build_matches.py

Salidas (data/processed/):
    matches.parquet / matches.csv     tabla canónica (ver coordination/CONTRACT_DATASET.md)
    coverage.json                     cobertura por división/temporada/campo
    data_quality_report.md            auditoría de calidad con cifras reales
    team_names.csv                    nombres de equipo observados (para mapa de alias)
"""
from __future__ import annotations

import csv
import glob
import json
import os
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
OUT = os.path.join(ROOT, "data", "processed")

LEAGUES = {
    "E0": ("Premier League", "England", 1), "E1": ("Championship", "England", 2),
    "D1": ("Bundesliga", "Germany", 1), "D2": ("2. Bundesliga", "Germany", 2),
    "I1": ("Serie A", "Italy", 1), "I2": ("Serie B", "Italy", 2),
    "SP1": ("La Liga", "Spain", 1), "SP2": ("Segunda Division", "Spain", 2),
    "F1": ("Ligue 1", "France", 1), "F2": ("Ligue 2", "France", 2),
    "N1": ("Eredivisie", "Netherlands", 1), "P1": ("Primeira Liga", "Portugal", 1),
    "T1": ("Super Lig", "Turkey", 1), "B1": ("Belgian Pro League", "Belgium", 1),
    "G1": ("Greek Super League", "Greece", 1), "SC0": ("Scottish Premiership", "Scotland", 1),
    "SC1": ("Scottish Championship", "Scotland", 2),
    "MEX": ("Liga MX", "Mexico", 1), "ARG": ("Liga Profesional", "Argentina", 1),
    "BRA": ("Serie A", "Brazil", 1), "USA": ("MLS", "USA", 1),
    "JPN": ("J1 League", "Japan", 1), "SWE": ("Allsvenskan", "Sweden", 1),
}

# Columnas de cuotas: origen -> nombre canónico
OPEN_COLS = {
    "b365": ("B365H", "B365D", "B365A"), "ps": ("PSH", "PSD", "PSA"),
    "avg": ("AvgH", "AvgD", "AvgA"), "max": ("MaxH", "MaxD", "MaxA"),
    "bf": ("BFH", "BFD", "BFA"),
    "bfe": ("BFEH", "BFED", "BFEA"),
}
CLOSE_COLS = {
    "b365": ("B365CH", "B365CD", "B365CA"), "ps": ("PSCH", "PSCD", "PSCA"),
    "avg": ("AvgCH", "AvgCD", "AvgCA"), "max": ("MaxCH", "MaxCD", "MaxCA"),
    "bf": ("BFCH", "BFCD", "BFCA"),
    "bfe": ("BFECH", "BFECD", "BFECA"),
}
TOTALS = {
    ("b365", "open"): ("B365>2.5", "B365<2.5"), ("b365", "close"): ("B365C>2.5", "B365C<2.5"),
    ("p", "open"): ("P>2.5", "P<2.5"), ("p", "close"): ("PC>2.5", "PC<2.5"),
    ("avg", "open"): ("Avg>2.5", "Avg<2.5"), ("avg", "close"): ("AvgC>2.5", "AvgC<2.5"),
    ("max", "open"): ("Max>2.5", "Max<2.5"), ("max", "close"): ("MaxC>2.5", "MaxC<2.5"),
}

DATE_PATTERNS = ("%d/%m/%Y", "%d/%m/%y", "%Y-%m-%d", "%Y-%m-%d %H:%M:%S")

# Alias explícitos (A04 §5): solo fusiones documentadas de la misma entidad.
TEAM_ALIASES = {
    ("ARG", "Colon Santa FE"): "Colon Santa Fe",
    ("SP2", "U.Las Palmas"): "Las Palmas",
    ("SP2", "Extremadura UD"): "Extremadura",
    ("B1", "Lommel SK"): "Lommel",
}


def team_name(row, *names) -> str:
    for n in names:
        v = row.get(n)
        if v is not None and str(v).strip():
            return str(v).strip()
    return ""


def canonical_team(div, name):
    return TEAM_ALIASES.get((div, name), name)


def slug(s: str) -> str:
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "_", s).strip("_").lower()
    return s


def parse_date(value: str):
    v = str(value).strip()
    if not v or v.lower() == "nan":
        return None
    for fmt in DATE_PATTERNS:
        try:
            return datetime.strptime(v, fmt).date()
        except ValueError:
            continue
    return None


def season_label_main(code: str) -> str:
    """'2425' -> '2024/25'."""
    return f"20{code[:2]}/{code[2:]}"


def season_label_extra(v: str, date) -> str:
    v = str(v).strip()
    if "/" in v:
        a, b = v.split("/")[:2]
        a = a.strip()
        b = (b.strip())[-2:]
        return f"{int(a):04d}/{b}"
    if re.fullmatch(r"\d{4}", v):
        return v
    return str(date.year) if date else ""


def num(row, *names):
    for n in names:
        if n in row:
            v = row[n]
            if v is None:
                continue
            s = str(v).strip()
            if s == "" or s.lower() in ("nan", "na"):
                continue
            try:
                return float(s)
            except ValueError:
                continue
    return np.nan


def intif(x):
    return int(x) if pd.notna(x) else np.nan


def read_csv(path: str) -> pd.DataFrame | None:
    """Lector tolerante: football-data añade columnas extra al final en algunas filas.

    pandas descarta esas filas con on_bad_lines="skip"; aquí se normaliza la longitud de cada
    fila a la cabecera (padding/truncado) para no perder partidos.
    """
    rows = None
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            with open(path, newline="", encoding=enc) as f:
                rows = list(csv.reader(f))
            break
        except UnicodeDecodeError:
            continue
        except Exception:
            return None
    if not rows or len(rows) < 2:
        return None
    # Limpieza de cabecera: BOM (incluido el mojibake de cp1252) y nombres duplicados.
    raw_header = [h.strip().lstrip("\ufeff").replace("ï»¿", "").replace("\ufeff", "") for h in rows[0]]
    seen: dict[str, int] = {}
    header = []
    for h in raw_header:
        if h in seen:
            seen[h] += 1
            header.append(f"{h}__dup{seen[h]}")
        else:
            seen[h] = 0
            header.append(h)
    if len(header) < 5:
        return None
    data = []
    for r in rows[1:]:
        if not any(x.strip() for x in r):
            continue
        if len(r) < len(header):
            r = r + [""] * (len(header) - len(r))
        elif len(r) > len(header):
            r = r[: len(header)]
        data.append(r)
    return pd.DataFrame(data, columns=header)


def build_main() -> pd.DataFrame:
    rows = []
    files = sorted(glob.glob(os.path.join(RAW, "main", "*", "*.csv")))
    for path in files:
        season_code = os.path.basename(os.path.dirname(path))
        div = os.path.splitext(os.path.basename(path))[0]
        df = read_csv(path)
        if df is None:
            continue
        for i, r in enumerate(df.to_dict("records"), start=1):
            d = parse_date(r.get("Date", ""))
            if d is None:
                continue
            hg, ag = num(r, "FTHG", "HG"), num(r, "FTAG", "AG")
            res = (str(r.get("FTR", "")).strip() or str(r.get("Res", "")).strip()).upper()
            if res not in ("H", "D", "A"):
                res = None
            home = canonical_team(div, team_name(r, "HomeTeam", "HT", "Home"))
            away = canonical_team(div, team_name(r, "AwayTeam", "AT", "Away"))
            if not home or not away:
                continue
            rec = {
                "match_id": f"{div}:{d:%Y%m%d}:{slug(home)}:{slug(away)}",
                "source": "football-data.co.uk",
                "div": div, "league": LEAGUES.get(div, (div, "", 0))[0],
                "country": LEAGUES.get(div, (div, "", 0))[1],
                "season": season_label_main(season_code), "season_start": 2000 + int(season_code[:2]),
                "match_date": d, "kickoff_time": (str(r.get("Time", "")).strip() or None),
                "home_team": home, "away_team": away,
                "home_goals": intif(hg), "away_goals": intif(ag), "result": res,
                "ht_home_goals": intif(num(r, "HTHG")), "ht_away_goals": intif(num(r, "HTAG")),
                "ht_result": (str(r.get("HTR", "")).strip().upper() or None),
                "shots_home": num(r, "HS"), "shots_away": num(r, "AS"),
                "sot_home": num(r, "HST"), "sot_away": num(r, "AST"),
                "corners_home": num(r, "HC"), "corners_away": num(r, "AC"),
                "fouls_home": num(r, "HF"), "fouls_away": num(r, "AF"),
                "yellows_home": num(r, "HY"), "yellows_away": num(r, "AY"),
                "reds_home": num(r, "HR"), "reds_away": num(r, "AR"),
                "source_season_file": f"mmz4281/{season_code}/{div}.csv", "source_row": i,
            }
            for src, cols in OPEN_COLS.items():
                for k, c in zip("hda", cols):
                    rec[f"odds_open_{src}_{k}"] = num(r, c)
            for src, cols in CLOSE_COLS.items():
                for k, c in zip("hda", cols):
                    rec[f"odds_close_{src}_{k}"] = num(r, c)
            for (src, phase), (ov, un) in TOTALS.items():
                rec[f"totals_{phase}_{src}_over"] = num(r, ov)
                rec[f"totals_{phase}_{src}_under"] = num(r, un)
            rows.append(rec)
    return pd.DataFrame(rows)


def build_extra() -> pd.DataFrame:
    rows = []
    for path in sorted(glob.glob(os.path.join(RAW, "extra", "*.csv"))):
        code = os.path.splitext(os.path.basename(path))[0]
        df = read_csv(path)
        if df is None:
            continue
        for i, r in enumerate(df.to_dict("records"), start=1):
            d = parse_date(r.get("Date", ""))
            if d is None:
                continue
            home = canonical_team(code, team_name(r, "Home", "HomeTeam", "HT"))
            away = canonical_team(code, team_name(r, "Away", "AwayTeam", "AT"))
            if not home or not away:
                continue
            hg, ag = num(r, "HG"), num(r, "AG")
            res = str(r.get("Res", "")).strip().upper()
            if res not in ("H", "D", "A"):
                res = None
            season = season_label_extra(r.get("Season", ""), d)
            rec = {
                "match_id": f"{code}:{d:%Y%m%d}:{slug(home)}:{slug(away)}",
                "source": "football-data.co.uk", "div": code,
                "league": LEAGUES.get(code, (str(r.get("League", "")).strip(), "", 0))[0],
                "country": LEAGUES.get(code, ("", str(r.get("Country", "")).strip(), 0))[1],
                "season": season,
                "season_start": int(season[:4]) if season[:4].isdigit() else np.nan,
                "match_date": d, "kickoff_time": (str(r.get("Time", "")).strip() or None),
                "home_team": home, "away_team": away,
                "home_goals": intif(hg), "away_goals": intif(ag), "result": res,
                "ht_home_goals": np.nan, "ht_away_goals": np.nan, "ht_result": None,
                "shots_home": np.nan, "shots_away": np.nan, "sot_home": np.nan, "sot_away": np.nan,
                "corners_home": np.nan, "corners_away": np.nan, "fouls_home": np.nan,
                "fouls_away": np.nan, "yellows_home": np.nan, "yellows_away": np.nan,
                "reds_home": np.nan, "reds_away": np.nan,
                "source_season_file": f"new/{code}.csv", "source_row": i,
            }
            for src, cols in OPEN_COLS.items():
                for k in "hda":
                    rec[f"odds_open_{src}_{k}"] = np.nan
            for src, cols in CLOSE_COLS.items():
                for k, c in zip("hda", cols):
                    rec[f"odds_close_{src}_{k}"] = num(r, c)
            for (src, phase), (ov, un) in TOTALS.items():
                rec[f"totals_{phase}_{src}_over"] = np.nan
                rec[f"totals_{phase}_{src}_under"] = np.nan
            rows.append(rec)
    return pd.DataFrame(rows)


def validate(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    report = {"n_rows": int(len(df)), "checks": {}}
    # Resultado coherente
    derived = np.select(
        [df.home_goals > df.away_goals, df.home_goals == df.away_goals, df.home_goals < df.away_goals],
        ["H", "D", "A"], default=None,
    )
    has = df.result.notna() & df.home_goals.notna()
    mismatch = has & (derived != df.result)
    report["checks"]["result_mismatch"] = int(mismatch.sum())
    # Duplicados
    dup = df.duplicated("match_id", keep=False)
    report["checks"]["duplicate_match_id_rows"] = int(dup.sum())
    report["checks"]["duplicate_match_id_groups"] = int(df[dup].match_id.nunique())
    # Goles
    bad_goals = ((df.home_goals < 0) | (df.home_goals > 15) | (df.away_goals < 0) | (df.away_goals > 15))
    report["checks"]["goals_out_of_range"] = int(bad_goals.sum())
    # Cuotas <= 1
    odds_cols = [c for c in df.columns if c.startswith("odds_") or c.startswith("totals_")]
    invalid = 0
    for c in odds_cols:
        s = df[c]
        invalid += int(((s.notna()) & (s <= 1.0)).sum())
    report["checks"]["odds_le_1"] = invalid
    # Fechas fuera de temporada
    season_start = pd.to_numeric(df.season_start, errors="coerce")
    yr = pd.to_datetime(df.match_date).dt.year
    out_of_season = ((yr < season_start) | (yr > season_start + 1)) & season_start.notna()
    report["checks"]["date_outside_season_window"] = int(out_of_season.sum())
    report["checks"]["missing_result"] = int(df.result.isna().sum())
    report["checks"]["missing_goals"] = int(df.home_goals.isna().sum())
    report["checks"]["missing_close_b365"] = int(df.odds_close_b365_h.isna().sum())
    report["checks"]["missing_open_b365"] = int(df.odds_open_b365_h.isna().sum())
    report["checks"]["missing_shots"] = int(df.shots_home.isna().sum())
    report["checks"]["duplicate_rows_dropped"] = int(dup.sum())
    # Se conserva la primera aparición; se documenta la pérdida.
    df = df.drop_duplicates("match_id", keep="first").copy()
    df["has_result"] = df.result.notna()
    df["has_close_odds"] = df.odds_close_b365_h.notna()
    df["has_open_odds"] = df.odds_open_b365_h.notna()
    df["has_shots"] = df.shots_home.notna()
    df["ingested_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    return df, report


def coverage(df: pd.DataFrame) -> dict:
    out = {}
    for div, g in df.groupby("div"):
        per = {}
        for season, h in g.groupby("season"):
            per[season] = {
                "matches": int(len(h)),
                "with_result": int(h.has_result.sum()),
                "close_odds_b365": round(float(h.has_close_odds.mean()), 4),
                "open_odds_b365": round(float(h.has_open_odds.mean()), 4),
                "close_odds_pinnacle": round(float(h.odds_close_ps_h.notna().mean()), 4),
                "shots": round(float(h.has_shots.mean()), 4),
                "first_date": str(h.match_date.min()),
                "last_date": str(h.match_date.max()),
            }
        out[div] = {"league": LEAGUES.get(div, (div, "", 0))[0],
                    "season_start_year": int(g.season_start.min()),
                    "seasons": len(per), "matches": int(len(g)), "detail": per}
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    main_df = build_main()
    extra_df = build_extra()
    df = pd.concat([main_df, extra_df], ignore_index=True)
    # Cuotas no válidas (<=1) se tratan como ausentes; se cuantifican antes.
    odds_cols = [c for c in df.columns if c.startswith("odds_") or c.startswith("totals_")]
    n_invalid = int(sum(((df[c].notna()) & (df[c] <= 1.0)).sum() for c in odds_cols))
    for c in odds_cols:
        df.loc[df[c] <= 1.0, c] = np.nan
    df, report = validate(df)
    report["checks"]["odds_le_1_set_to_nan"] = n_invalid
    df = df.sort_values(["div", "match_date", "kickoff_time"], kind="mergesort").reset_index(drop=True)
    # Orden estable de columnas
    front = ["match_id", "source", "div", "league", "country", "season", "season_start",
             "match_date", "kickoff_time", "home_team", "away_team", "home_goals", "away_goals",
             "result", "ht_home_goals", "ht_away_goals", "ht_result", "shots_home", "shots_away",
             "sot_home", "sot_away", "corners_home", "corners_away", "fouls_home", "fouls_away",
             "yellows_home", "yellows_away", "reds_home", "reds_away"]
    rest = [c for c in df.columns if c not in front]
    df = df[front + rest]
    for c in df.columns:
        if df[c].dtype == object:
            df[c] = df[c].astype(str).where(df[c].notna(), None)
    df.to_parquet(os.path.join(OUT, "matches.parquet"), index=False)
    df.to_csv(os.path.join(OUT, "matches.csv"), index=False, encoding="utf-8")
    cov = coverage(df)
    with open(os.path.join(OUT, "coverage.json"), "w") as f:
        json.dump({"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                   "rows": int(len(df)), "divisions": cov}, f, indent=1, sort_keys=True)
    # Nombres de equipo observados (para mapa de alias)
    names = (df.groupby(["div", "home_team"]).size().reset_index(name="n")
             .rename(columns={"home_team": "team"}))
    away = (df.groupby(["div", "away_team"]).size().reset_index(name="n")
            .rename(columns={"away_team": "team"}))
    t = (pd.concat([names, away]).groupby(["div", "team"], as_index=False).n.sum()
         .sort_values(["div", "team"]))
    t["slug"] = t.team.map(slug)
    t.to_csv(os.path.join(OUT, "team_names.csv"), index=False, encoding="utf-8")
    # Reporte de calidad
    n_div = int(df["div"].nunique())
    n_season = int(df.season.nunique())
    n_result = int(df.has_result.sum())
    lines = ["# Auditoría de calidad de datos — generación automática", "",
             f"Generado: {datetime.now(timezone.utc).isoformat(timespec='seconds')}",
             f"Filas: **{len(df):,}** · Divisiones: **{n_div}** · "
             f"Temporadas: **{n_season}** · Partidos con resultado: **{n_result:,}**", "",
             "## Comprobaciones", "", "| Comprobación | Valor |", "|---|---|"]
    for k, v in report["checks"].items():
        lines.append(f"| {k} | {v:,} |" if isinstance(v, int) else f"| {k} | {v} |")
    lines += ["", "## Cobertura por división", "",
              "| Div | Liga | Temporadas | Partidos | % cierre B365 | % apertura B365 | % Pinnacle cierre | % tiros |",
              "|---|---|---|---|---|---|---|---|"]
    for div, d in sorted(cov.items(), key=lambda kv: -kv[1]["matches"]):
        detail = d["detail"]
        n = sum(x["matches"] for x in detail.values())
        def wavg(key):
            return sum(x[key] * x["matches"] for x in detail.values()) / n if n else 0.0
        lines.append(f"| {div} | {d['league']} | {d['seasons']} | {n:,} | "
                     f"{wavg('close_odds_b365'):.1%} | {wavg('open_odds_b365'):.1%} | "
                     f"{wavg('close_odds_pinnacle'):.1%} | {wavg('shots'):.1%} |")
    with open(os.path.join(OUT, "data_quality_report.md"), "w") as f:
        f.write("\n".join(lines) + "\n")
    print(f"matches: {len(df):,} rows | divisions: {n_div} | seasons: {n_season}")
    print(json.dumps(report["checks"], indent=1))
    print(f"written -> {OUT}")


if __name__ == "__main__":
    main()
