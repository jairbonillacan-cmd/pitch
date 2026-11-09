#!/usr/bin/env python3
"""A15 — ¿aportan las features EPA al motor NFL?

Construye EPA causales por equipo (semanas anteriores de la temporada, o temporada previa al
inicio) desde nflverse `stats_team_week` (CC BY 4.0) y compara `logit` base vs `logit + EPA`
con el mismo walk-forward de A12 (VAL 2010–2019, TEST 2020–2025).

Uso:
    ./.venv/bin/python models/nfl/epa_experiment.py
"""
from __future__ import annotations

import glob
import json
import os
import sys

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

HERE = os.path.dirname(os.path.abspath(__file__))
LAB = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
sys.path.insert(0, LAB)

from config import LOGIT_C_GRID  # noqa: E402
from features import NUMERIC_FEATURES  # noqa: E402
from models import make_design  # noqa: E402
from eval.compare import paired_bootstrap_delta  # noqa: E402
from eval.metrics import summary_metrics  # noqa: E402

RAW = os.path.join(LAB, "data", "nfl", "raw", "team_week")
PROC = os.path.join(LAB, "data", "nfl", "processed")
OUT = os.path.join(HERE, "artifacts")
SEED = 20261109
EPA_COLS = ["epa_off_home", "epa_off_away", "epa_def_home", "epa_def_away",
            "epa_net_home", "epa_net_away", "epa_net_diff"]


def load_team_week():
    files = sorted(glob.glob(os.path.join(RAW, "stats_team_week_*.csv")))
    if not files:
        raise SystemExit("faltan los CSV de stats_team_week")
    dfs = [pd.read_csv(f) for f in files]
    df = pd.concat(dfs, ignore_index=True)
    df = df[df.season_type == "REG"].copy()
    df["off_epa"] = df["passing_epa"].fillna(0) + df["rushing_epa"].fillna(0)
    df = df[["season", "week", "team", "opponent_team", "game_id", "off_epa"]]
    # EPA defensivo por partido = EPA ofensivo del rival en el mismo game_id
    opp = df[["game_id", "team", "off_epa"]].rename(columns={"team": "opponent_team", "off_epa": "def_epa"})
    df = df.merge(opp, on=["game_id", "opponent_team"], how="left")
    return df


def causal_features(tw: pd.DataFrame) -> pd.DataFrame:
    """Para cada equipo-partido, media de off/def EPA de semanas ANTERIORES de la temporada;
    al inicio, media de la temporada anterior completa."""
    tw = tw.sort_values(["team", "season", "week"]).copy()
    rows = []
    for team, g in tw.groupby("team", sort=False):
        prev_season_mean = None
        season_acc = {}
        cur_season = None
        for _, r in g.iterrows():
            s, w = int(r["season"]), int(r["week"])
            if s != cur_season:
                # cambio de temporada: el fallback pasa a ser la media completa de la anterior
                if season_acc:
                    prev_season_mean = (float(np.mean([v[0] for v in season_acc.values()])),
                                        float(np.mean([v[1] for v in season_acc.values()])))
                season_acc = {}
                cur_season = s
            prior = [v for wk, v in season_acc.items() if wk < w]
            if prior:
                off = float(np.mean([v[0] for v in prior]))
                de = float(np.mean([v[1] for v in prior]))
            elif prev_season_mean is not None:
                off, de = prev_season_mean
            else:
                off, de = np.nan, np.nan
            rows.append((r["game_id"], team, off, de))
            season_acc[w] = (float(r["off_epa"]), float(r["def_epa"]))
    out = pd.DataFrame(rows, columns=["game_id", "team", "epa_off_att", "epa_def_att"])
    return out


def add_epa(df: pd.DataFrame, twf: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    home = twf.rename(columns={"team": "home_team", "epa_off_att": "epa_off_home",
                               "epa_def_att": "epa_def_home"})
    away = twf.rename(columns={"team": "away_team", "epa_off_att": "epa_off_away",
                               "epa_def_att": "epa_def_away"})
    df = df.merge(home[["game_id", "home_team", "epa_off_home", "epa_def_home"]],
                  on=["game_id", "home_team"], how="left")
    df = df.merge(away[["game_id", "away_team", "epa_off_away", "epa_def_away"]],
                  on=["game_id", "away_team"], how="left")
    df["epa_net_home"] = df["epa_off_home"] - df["epa_def_home"]
    df["epa_net_away"] = df["epa_off_away"] - df["epa_def_away"]
    df["epa_net_diff"] = df["epa_net_home"] - df["epa_net_away"]
    # Sin historia (primer año de la liga en el dataset) -> 0 = media de liga tras estandarizar
    df[EPA_COLS] = df[EPA_COLS].fillna(0.0)
    return df


def fit_predict(train, test, columns):
    Xtr = train[columns].to_numpy(float)
    Xte = test[columns].to_numpy(float)
    model = Pipeline([("scale", StandardScaler()),
                      ("clf", LogisticRegression(C=0.003, max_iter=5000, solver="lbfgs"))])
    model.fit(Xtr, train["y"].to_numpy(int))
    return model.predict_proba(Xte)


def main():
    games = pd.read_parquet(os.path.join(PROC, "nfl_features.parquet"))
    games = games[games["home_score"].notna() & games["away_score"].notna()].copy()
    games["y"] = games["result"].map({"H": 0, "T": 1, "A": 2})
    games = games[games["y"].notna()].copy()
    games["y"] = games["y"].astype(int)
    games["season"] = games["season"].astype(int)
    tw = load_team_week()
    twf = causal_features(tw)
    games = add_epa(games, twf)

    base_cols = list(make_design(games).columns)
    X = make_design(games)
    X[EPA_COLS] = games[EPA_COLS].astype(float)
    games = games.reset_index(drop=True)
    X = X.reset_index(drop=True)
    base_cols = [c for c in X.columns if c not in EPA_COLS]

    seasons = sorted(s for s in games.season.unique() if s >= 2010)
    preds = {k: [] for k in ("base", "epa")}
    for s in seasons:
        tr = games[games.season < s]
        te = games[games.season == s]
        if len(tr) < 500 or len(te) == 0:
            continue
        idx_tr, idx_te = tr.index, te.index
        for name, cols in (("base", base_cols), ("epa", base_cols + EPA_COLS)):
            p = fit_predict(X.loc[idx_tr].assign(y=tr.y.values), X.loc[idx_te].assign(y=te.y.values), cols)
            preds[name].append(pd.DataFrame({
                "game_id": te.game_id.values, "season": te.season.values,
                "y": te.y.values, "p_home": p[:, 0], "p_draw": p[:, 1], "p_away": p[:, 2]}))
    res = {k: pd.concat(v, ignore_index=True) for k, v in preds.items()}
    out = {"val": {}, "test": {}, "comparisons": {}}
    for period, lo, hi in (("val", 2010, 2019), ("test", 2020, 2025)):
        mask = (res["base"].season >= lo) & (res["base"].season <= hi)
        for name in ("base", "epa"):
            g = res[name][mask]
            s = summary_metrics(g.y.to_numpy(int), g[["p_home", "p_draw", "p_away"]].to_numpy(float), bins=10)
            out[period][name] = {k: v for k, v in s.items() if k in
                                 ("n", "log_loss", "brier", "rps", "accuracy", "ece")}
            print(f"{period} {name}: ll={s['log_loss']:.5f} brier={s['brier']:.5f} acc={s['accuracy']:.4f} n={s['n']}")
        a = res["epa"][mask]
        b = res["base"][mask]
        boot = paired_bootstrap_delta(a.y.to_numpy(int), a[["p_home", "p_draw", "p_away"]].to_numpy(float),
                                      b[["p_home", "p_draw", "p_away"]].to_numpy(float),
                                      blocks=a.season.astype(str).to_numpy(), B=2000, seed=SEED)
        out["comparisons"][period] = boot
        print(f"{period} Δ(EPA−base)={boot['delta_logloss']:+.5f} "
              f"CI[{boot['ci95_logloss'][0]:+.5f},{boot['ci95_logloss'][1]:+.5f}] "
              f"frac>0={boot['frac_gt0_logloss']:.3f}")
    for k, v in res.items():
        v.to_csv(os.path.join(OUT, f"pred_{k}.csv"), index=False)
    # comparación con mercado en los mismos partidos
    mk = games[["game_id", "home_moneyline", "away_moneyline"]].copy()
    mk = mk.dropna()
    in_game = res["base"].merge(mk, on="game_id", how="inner")
    if len(in_game) > 0:
        home_ml = in_game.home_moneyline.astype(float)
        away_ml = in_game.away_moneyline.astype(float)
        # Americanas -> decimal: favorito (negativo) 1 + 100/|ml|; underdog 1 + ml/100
        dec_h = np.where(home_ml > 0, 1 + home_ml / 100.0, 1 + 100.0 / np.abs(home_ml))
        dec_a = np.where(away_ml > 0, 1 + away_ml / 100.0, 1 + 100.0 / np.abs(away_ml))
        p_h = 1.0 / dec_h
        p_a = 1.0 / dec_a
        q = (p_h + p_a)
        tie = 0.002
        p = np.column_stack([(1 - tie) * p_h / q, np.full(len(in_game), tie), (1 - tie) * p_a / q])
        out["market"] = {k: v for k, v in summary_metrics(in_game.y.to_numpy(int), p, bins=10).items()
                         if k in ("n", "log_loss", "brier", "rps", "accuracy", "ece")}
        print(f"market (mismos partidos): ll={out['market']['log_loss']:.5f} n={out['market']['n']}")
    with open(os.path.join(OUT, "epa_experiment.json"), "w") as f:
        json.dump(out, f, indent=1, default=float)
    print("escrito ->", os.path.join(OUT, "epa_experiment.json"))


if __name__ == "__main__":
    main()
