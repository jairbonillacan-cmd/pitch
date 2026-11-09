#!/usr/bin/env python3
"""Experimento v1.2 de priors: usar la última temporada del EQUIPO, no de (div, equipo).

Motivación (A09b): los priors S-1 solo son exactos en el 88,5% de las filas; el 11,5% usa una
temporada ≥2 atrás o NaN porque el join agrupa por (div, team) y un ascenso/descenso rompe la
cadena. Aquí se reconstruyen los priors con la clave `team` y se mide el efecto SOLO en val
(2023/24). No se toca test ni se modifica `features.parquet`.

Uso:
    ./.venv/bin/python pipeline/experiment_priors_v12.py
"""
from __future__ import annotations

import json
import os
import sys

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "models", "a"))
from eval.compare import paired_bootstrap_delta  # noqa: E402
from eval.metrics import multiclass_log_loss  # noqa: E402
from train_motor_a import FEATURES, fit_logit, predict_logit  # noqa: E402

PROC = os.path.join(ROOT, "data", "processed")
PRIOR_COLS = ["prev_ppg", "prev_gf_pg", "prev_ga_pg"]


def season_start(s):
    return int(str(s)[:4])


def build_team_priors(matches):
    """Última temporada completada (< S) por equipo, cruzando divisiones."""
    home = matches[["season", "home_team", "home_goals", "away_goals"]].rename(
        columns={"home_team": "team", "home_goals": "gf", "away_goals": "ga"})
    away = matches[["season", "away_team", "away_goals", "home_goals"]].rename(
        columns={"away_team": "team", "away_goals": "gf", "home_goals": "ga"})
    long = pd.concat([home, away], ignore_index=True)
    long["pts"] = np.where(long.gf > long.ga, 3, np.where(long.gf == long.ga, 1, 0))
    agg = (long.groupby(["team", "season"], as_index=False)
           .agg(n=("gf", "size"), gf=("gf", "sum"), ga=("ga", "sum"), pts=("pts", "sum")))
    agg["s"] = agg.season.map(season_start)
    agg["ppg"] = agg.pts / agg.n
    agg["gf_pg"] = agg.gf / agg.n
    agg["ga_pg"] = agg.ga / agg.n
    # Para cada equipo y temporada S, buscar la temporada T < S más reciente con datos.
    out = {}
    for team, g in agg.groupby("team"):
        g = g.sort_values("s")
        for _, r in g.iterrows():
            earlier = g[g.s < r["s"]]
            if earlier.empty:
                out[(team, r["s"])] = (np.nan, np.nan, np.nan, np.nan)
            else:
                e = earlier.iloc[-1]
                out[(team, r["s"])] = (r["s"] - e["s"], e["ppg"], e["gf_pg"], e["ga_pg"])
    return out


def main():
    matches = pd.read_parquet(os.path.join(PROC, "matches.parquet"))
    matches = matches[matches.result.notna()].copy()
    feats = pd.read_parquet(os.path.join(PROC, "features.parquet"))
    feats["sstart"] = feats.season.map(season_start)

    pri = build_team_priors(matches)
    for side in ("home", "away"):
        vals = [pri.get((t, s), (np.nan,) * 4) for t, s in zip(feats[f"{side}_team"], feats.sstart)]
        arr = np.array(vals, dtype=float)
        feats[f"{side}_prev_age"] = arr[:, 0]
        feats[f"{side}_prev_ppg_v12"] = arr[:, 1]
        feats[f"{side}_prev_gf_pg_v12"] = arr[:, 2]
        feats[f"{side}_prev_ga_pg_v12"] = arr[:, 3]

    # sustituir priors por la versión v1.2
    v12 = feats.copy()
    for c in PRIOR_COLS:
        v12[f"home_{c}"] = v12[f"home_{c}_v12"]
        v12[f"away_{c}"] = v12[f"away_{c}_v12"]

    train_mask = feats.sstart < 2023
    val_mask = feats.sstart == 2023
    y_tr = feats.loc[train_mask, "y"].astype(int).to_numpy()
    y_val = feats.loc[val_mask, "y"].astype(int).to_numpy()
    results = {}
    for name, data in (("v1.1_div_team", feats), ("v1.2_team", v12)):
        model, cols = fit_logit(data[train_mask])
        p = predict_logit(model, cols, data[val_mask])
        ll = multiclass_log_loss(y_val, p)
        acc = float(np.mean(np.argmax(p, axis=1) == y_val))
        results[name] = {"n": int(val_mask.sum()), "log_loss": ll, "accuracy": acc,
                         "probs": p}
        print(f"{name}: val log-loss={ll:.6f} acc={acc:.4f} n={int(val_mask.sum()):,}")

    # cobertura del prior
    cov = {
        "v1.1_null": float(feats.loc[val_mask, "home_prev_ppg"].isna().mean()),
        "v1.2_null": float(v12.loc[val_mask, "home_prev_ppg"].isna().mean()),
        "v1.2_exact_s1": float((v12.loc[val_mask, "home_prev_age"] == 1).mean()),
        "v1.1_exact_s1_proxy": float((feats.loc[val_mask, "home_prev_age"] == 1).mean()),
    }
    a, b = results["v1.2_team"], results["v1.1_div_team"]
    blocks = (v12.loc[val_mask, "season"].astype(str) + "|" + v12.loc[val_mask, "div"]).to_numpy()
    boot = paired_bootstrap_delta(y_val, a["probs"], b["probs"], blocks=blocks, B=2000, seed=20261109)
    out = {"results": {k: {kk: vv for kk, vv in v.items() if kk != "probs"} for k, v in results.items()},
           "delta_v12_minus_v11": boot, "coverage": cov}
    path = os.path.join(ROOT, "artifacts", "experiment_priors_v12.json")
    with open(path, "w") as f:
        json.dump(out, f, indent=1, default=float)
    print("\ncobertura:", json.dumps(cov, indent=1))
    print("bootstrap v1.2 vs v1.1:", json.dumps({k: boot[k] for k in
                                                 ("delta_logloss", "ci95_logloss", "frac_gt0_logloss")},
                                                indent=1, default=float))
    print("escrito ->", path)


if __name__ == "__main__":
    main()
