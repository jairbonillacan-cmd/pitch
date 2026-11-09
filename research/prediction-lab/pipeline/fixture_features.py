#!/usr/bin/env python3
"""Ciclo 5 — Features para fixtures futuros desde el estado de los equipos.

Objetivo: cerrar el hueco "match_id -> features" sin reentrenar. Dado un fixture
(div, temporada, fecha, local, visitante) y el histórico, se calculan las 54 features del
Motor A con las mismas definiciones que `features/build_features.py`.

Validación: para N partidos históricos se reconstruye su estado (solo partidos anteriores),
se calculan las features y se comparan con `features.parquet`. Si la paridad se cumple,
el mismo código sirve para fixtures futuros.

Uso:
    ./.venv/bin/python pipeline/fixture_features.py --validate 200
    ./.venv/bin/python pipeline/fixture_features.py --fixtures data/snapshots/odds_*.csv
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "features"))
sys.path.insert(0, os.path.join(ROOT, "models", "a"))

from build_features import (  # noqa: E402
    ELO_HFA, ELO_K, ELO_SEASON_REGRESSION, ROLL_COLS, build_long, elo_block, load_matches,
)
from train_motor_a import FEATURES  # noqa: E402

PROC = os.path.join(ROOT, "data", "processed")
SEED = 20261109


def season_start_year(season: str) -> int:
    return int(str(season)[:4])


def build_state(matches: pd.DataFrame) -> dict:
    """Estado por equipo a partir de TODOS los partidos (se filtra por fecha al consultar)."""
    df = elo_block(matches, prefix="elo")
    long = build_long(df)
    # elo post-partido por (match_id, team), que build_long no conserva
    hp = df[["match_id", "home_team", "elo_home_post"]].rename(
        columns={"home_team": "team", "elo_home_post": "elo_post"})
    ap = df[["match_id", "away_team", "elo_away_post"]].rename(
        columns={"away_team": "team", "elo_away_post": "elo_post"})
    post = pd.concat([hp, ap], ignore_index=True)
    long = long.merge(post, on=["match_id", "team"], how="left")
    long = long.sort_values(["team", "match_date", "match_id"], kind="mergesort").copy()
    long["gf"] = long.gf.astype(float)
    g = long.groupby("team", sort=False)
    for w in (5, 10):
        for col in ROLL_COLS:
            long[f"{col}_post_r{w}"] = g[col].transform(lambda s, w=w: s.rolling(w, min_periods=1).mean())
    for col in ("points", "gf", "ga", "gd"):
        long[f"{col}_post_ewm5"] = g[col].transform(lambda s: s.ewm(halflife=5, min_periods=1).mean())
    # Priors de temporada por (div, team): fila T con estadísticas de T-1 aplicables a T.
    agg = (long.groupby(["div", "team", "season"], as_index=False)
           .agg(n=("match_id", "size"), gf=("gf", "sum"), ga=("ga", "sum"),
                pts=("points", "sum"), sot=("sot", "sum")))
    agg["ppg"], agg["gf_pg"], agg["ga_pg"] = agg.pts / agg.n, agg.gf / agg.n, agg.ga / agg.n
    agg["sot_pg"] = agg.sot / agg.n
    agg = agg.sort_values(["div", "team", "season"])
    agg["target"] = agg.groupby(["div", "team"]).season.shift(0)
    stat_cols = ["n", "gf", "ga", "pts", "ppg", "gf_pg", "ga_pg", "sot", "sot_pg"]
    agg[stat_cols] = agg.groupby(["div", "team"])[stat_cols].shift(1)
    priors = {}
    for r in agg.itertuples(index=False):
        if pd.isna(r.ppg):
            continue
        priors[(r.div, r.team, r.season)] = {"ppg": r.ppg, "gf_pg": r.gf_pg,
                                             "ga_pg": r.ga_pg, "sot_pg": r.sot_pg}
    # Priors de liga: para cada (div, season), la media de goles de la temporada anterior.
    ls = (df.groupby(["div", "season"], as_index=False)
          .agg(total=("home_goals", "sum"), n=("match_id", "size"),
               hw=("result", lambda x: (x == "H").mean())))
    ls["avg_total"] = ls.total / ls.n
    ls = ls.sort_values(["div", "season"])
    ls["lg_avg_total_prev"] = ls.groupby("div").avg_total.shift(1)
    ls["lg_home_win_prev"] = ls.groupby("div").hw.shift(1)
    league = {(r.div, r.season): (r.lg_avg_total_prev, r.lg_home_win_prev)
              for r in ls.itertuples(index=False)}
    return {"long": long, "priors": priors, "league": league}


def state_before(state: dict, div: str, team: str, date: pd.Timestamp, season: str) -> dict | None:
    long = state["long"]
    hist = long[(long.team == team) & (long.match_date < date)]
    if hist.empty:
        return None
    last = hist.iloc[-1]
    in_div = hist[hist["div"] == div]
    # elo post del último partido EN ESA DIVISIÓN (el Elo se reinicia si cambia de división)
    elo_post = float(in_div.iloc[-1]["elo_post"]) if not in_div.empty else None
    last_div_match = in_div.iloc[-1] if not in_div.empty else None
    # ventanas: último partido global (la forma es por equipo, cruza divisiones)
    def col(name):
        v = last.get(name)
        return float(v) if v is not None and pd.notna(v) else np.nan
    window = {f"points_r5": col("points_post_r5"), "gd_r5": col("gd_post_r5"),
              "gf_r5": col("gf_post_r5"), "ga_r5": col("ga_post_r5"),
              "points_r10": col("points_post_r10"), "gd_r10": col("gd_post_r10"),
              "points_ewm5": col("points_post_ewm5"), "gf_ewm5": col("gf_post_ewm5"),
              "ga_ewm5": col("ga_post_ewm5"), "shots_r5": col("shots_post_r5"),
              "sot_r5": col("sot_post_r5"), "corners_r5": col("corners_post_r5")}
    recent = hist[hist.match_date >= date - pd.Timedelta(days=14)]
    same = hist[(hist["div"] == div) & (hist.season == season)]
    home_matches = int((same["is_home"] == 1).sum())
    away_matches = int((same["is_home"] == 0).sum())
    return {
        "elo_post": elo_post, "elo_div": div, "last_div": last["div"],
        "last_date": last.match_date, "last_season": last.season,
        "last_div_season": (last_div_match["season"] if last_div_match is not None else None),
        "window": window,
        "matches_last_14d": int(len(recent)),
        "home_matches_season": home_matches,
        "away_matches_season": away_matches,
        "div_change": int(last["div"] != div),
        "season_break": 0,  # se rellena con la temporada del fixture
    }


def elo_for_fixture(state_row: dict, div: str, season: str) -> float:
    """Elo pre-partido: post del último partido en la división, con regresión si cambia temporada."""
    if state_row is None or state_row.get("elo_post") is None:
        return 1500.0
    r = state_row["elo_post"]
    if state_row.get("last_div_season") != season:
        r = 1500.0 + (r - 1500.0) * (1.0 - ELO_SEASON_REGRESSION)
    return r


def season_progress(season: str, date: pd.Timestamp) -> float:
    y = season_start_year(season)
    if "/" in str(season):
        start, end = pd.Timestamp(y, 7, 1), pd.Timestamp(y + 1, 6, 30)
    else:
        start, end = pd.Timestamp(y, 1, 1), pd.Timestamp(y, 12, 31)
    span = (end - start).days
    return float(np.clip((date - start).days / span, 0, 1))


def features_for_fixture(state: dict, div: str, season: str, date: pd.Timestamp,
                         home: str, away: str) -> dict:
    hs = state_before(state, div, home, date, season)
    as_ = state_before(state, div, away, date, season)
    eh = elo_for_fixture(hs, div, season)
    ea = elo_for_fixture(as_, div, season)
    elo_diff = eh + ELO_HFA - ea
    f = {"elo_home": eh, "elo_away": ea, "elo_diff": elo_diff,
         "elo_diff_no_hfa": eh - ea,
         "elo_prob_home_nodraw": 1.0 / (1.0 + 10.0 ** (-elo_diff / 400.0))}
    f["season_progress"] = season_progress(season, date)
    f["elo_diff_x_progress"] = elo_diff * f["season_progress"]
    for side, st in (("h", hs), ("a", as_)):
        w = (st or {}).get("window", {})
        for k in ("points_r5", "gd_r5", "gf_r5", "ga_r5", "points_r10", "gd_r10",
                  "points_ewm5", "gf_ewm5", "ga_ewm5", "shots_r5", "sot_r5", "corners_r5"):
            f[f"{side}_{k}"] = w.get(k, np.nan)
        dt = (date - st["last_date"]).days if st and st.get("last_date") is not None else np.nan
        f[f"{side}_days_rest"] = float(dt) if pd.notna(dt) else np.nan
        # Sin historia previa, Python asigna 0 a contadores y flags (no NaN).
        f[f"{side}_matches_last_14d"] = float(st["matches_last_14d"]) if st else 0.0
        # FEATURES mezcla prefijos: rolling usa h_/a_, priors y season_match_no usan home_/away_.
        pfx = "home" if side == "h" else "away"
        sm = (st["home_matches_season"] if side == "h" else st["away_matches_season"]) if st else None
        f[f"{pfx}_season_match_no"] = float(sm) if sm is not None else 0.0
        f[f"{side}_div_change"] = float(st["div_change"]) if st else 0.0
        f[f"{side}_season_break"] = float(int(st["last_season"] != season)) if st else 0.0
        pr = state["priors"].get((div, home if side == "h" else away, season), {})
        f[f"{pfx}_prev_ppg"] = pr.get("ppg", np.nan)
        f[f"{pfx}_prev_gf_pg"] = pr.get("gf_pg", np.nan)
        f[f"{pfx}_prev_ga_pg"] = pr.get("ga_pg", np.nan)
        f[f"{pfx}_prev_sot_pg"] = pr.get("sot_pg", np.nan)
    f["form_pts_diff_r5"] = f["h_points_r5"] - f["a_points_r5"]
    f["form_gd_diff_r5"] = f["h_gd_r5"] - f["a_gd_r5"]
    f["form_gd_diff_r10"] = f["h_gd_r10"] - f["a_gd_r10"]
    f["rest_diff"] = f["h_days_rest"] - f["a_days_rest"]
    f["congestion_diff"] = f["h_matches_last_14d"] - f["a_matches_last_14d"]
    lg = state["league"].get((div, season), (np.nan, np.nan))
    f["lg_avg_total_prev"], f["lg_home_win_prev"] = lg
    return f


def validate(n: int) -> dict:
    matches = load_matches()
    feats = pd.read_parquet(os.path.join(PROC, "features.parquet"))
    feats = feats[feats.y.notna()].copy()
    feats["match_date"] = pd.to_datetime(feats["match_date"])
    state = build_state(matches)
    sample = feats.sample(n=min(n, len(feats)), random_state=SEED)
    rows = []
    for r in sample.itertuples(index=False):
        f = features_for_fixture(state, r.div, r.season, r.match_date, r.home_team, r.away_team)
        expected = {k: getattr(r, k) for k in FEATURES}
        diffs = {}
        for k in FEATURES:
            a, b = f.get(k, np.nan), expected.get(k, np.nan)
            if pd.isna(a) and pd.isna(b):
                continue
            if pd.isna(a) or pd.isna(b):
                diffs[k] = None
            else:
                d = abs(float(a) - float(b))
                if d > 1e-9:
                    diffs[k] = d
        rows.append({"match_id": r.match_id, "n_diff": len(diffs), "diffs": diffs})
    bad = [x for x in rows if x["n_diff"] > 0]
    summary = {"n_sample": len(rows), "n_exact": len(rows) - len(bad),
               "n_with_diff": len(bad), "examples": bad[:5]}
    return summary


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--validate", type=int, default=0)
    args = ap.parse_args()
    if args.validate:
        out = validate(args.validate)
        print(json.dumps(out, indent=1, default=float)[:3000])
        path = os.path.join(ROOT, "artifacts", "fixture_features_validation.json")
        with open(path, "w") as f:
            json.dump(out, f, indent=1, default=float)
        print("escrito ->", path)
        return
    print("usa --validate N para validar contra features.parquet")


if __name__ == "__main__":
    main()
