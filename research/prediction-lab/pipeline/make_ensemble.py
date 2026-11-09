#!/usr/bin/env python3
"""Ensemble convexo con pesos walk-forward (sin contaminar dev/val).

Para cada temporada S, los pesos se ajustan SOLO con las predicciones de temporadas < S
(predicciones que a su vez son out-of-fold del Motor A) y se aplican a S. Si no hay historia
suficiente, se usan pesos iguales. Los pesos se suavizan 50/50 hacia la cartera equiponderada
para reducir varianza (se documenta).

Uso:
    ./.venv/bin/python pipeline/make_ensemble.py --artifact artifacts/EXP01_final_20261109 \
        --members base_rate,elo_ordered,logit,poisson_dc,hgb --out ensemble
"""
from __future__ import annotations

import argparse
import json
import os

import numpy as np
import pandas as pd
from scipy.optimize import minimize

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIN_ROWS = 5000


def season_of(s):
    return int(str(s)[:4])


def logloss(y, p):
    p = np.clip(p, 1e-15, 1)
    p = p / p.sum(axis=1, keepdims=True)
    return float(-np.mean(np.log(p[np.arange(len(y)), y])))


def fit_weights(P, y, max_rows=30000, smoothing=0.0):
    """P: (M, N, 3). Pesos convexos que minimizan log-loss + suavizado 50/50.

    Para que el walk-forward sea barato, se ajusta sobre una submuestra determinista
    (como máximo `max_rows` filas) cuando hay muchas.
    """
    n = P.shape[0]
    N = P.shape[1]
    if N > max_rows:
        idx = np.linspace(0, N - 1, max_rows).astype(int)
        P, y = P[:, idx, :], y[idx]

    def obj(z):
        w = np.exp(z - z.max())
        w = w / w.sum()
        return logloss(y, np.tensordot(w, P, axes=1))

    res = minimize(obj, np.zeros(n), method="Nelder-Mead",
                   options={"maxiter": 800, "xatol": 1e-6, "fatol": 1e-9})
    w = np.exp(res.x - res.x.max())
    w = w / w.sum()
    if smoothing > 0:
        w = (1 - smoothing) * w + smoothing * np.full(n, 1.0 / n)
    return w / w.sum()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--artifact", required=True)
    ap.add_argument("--members", default="base_rate,elo_ordered,logit,poisson_dc,hgb")
    ap.add_argument("--out", default="ensemble")
    ap.add_argument("--smoothing", type=float, default=0.0)
    args = ap.parse_args()
    art = args.artifact if os.path.isabs(args.artifact) else os.path.join(ROOT, args.artifact)
    names = [n.strip() for n in args.members.split(",") if n.strip()]
    frames = {}
    for n in names:
        p = os.path.join(art, f"pred_{n}.csv")
        if not os.path.exists(p):
            print(f"AVISO: falta {p}; se omite")
            continue
        frames[n] = pd.read_csv(p).set_index("match_id")
    names = list(frames)
    if len(names) < 2:
        raise SystemExit("se necesitan >=2 modelos")
    ids = frames[names[0]].index
    for n in names[1:]:
        ids = ids.intersection(frames[n].index)
    meta = frames[names[0]].loc[ids, ["div", "season", "match_date", "y"]].copy()
    P = {}
    ok = np.ones(len(ids), dtype=bool)
    for n in names:
        arr = frames[n].loc[ids, ["p_home", "p_draw", "p_away"]].to_numpy(dtype=float)
        ok &= np.all(np.isfinite(arr), axis=1) & (arr.sum(axis=1) > 0)
        P[n] = arr
    ids = ids[ok]
    meta = meta.loc[ids]
    P = {n: P[n][ok] for n in names}
    years = meta["season"].map(season_of).to_numpy()
    y = meta["y"].to_numpy()
    seasons = sorted(np.unique(years))
    mix = np.zeros((len(ids), 3))
    history = {}
    for s in seasons:
        te = years == s
        tr = years < s
        if tr.sum() >= MIN_ROWS:
            Ptr = np.stack([P[n][tr] for n in names])
            w = fit_weights(Ptr, y[tr], smoothing=args.smoothing)
        else:
            w = np.full(len(names), 1.0 / len(names))
        history[str(s)] = {n: round(float(x), 4) for n, x in zip(names, w)}
        for wi, n in zip(w, names):
            mix[te] += wi * P[n][te]
    out = meta.copy()
    out["p_home"], out["p_draw"], out["p_away"] = mix[:, 0], mix[:, 1], mix[:, 2]
    out = out.reset_index()
    out.to_csv(os.path.join(art, f"pred_{args.out}.csv"), index=False)
    # métrica val (informativa; los pesos de val se ajustan con temporadas < val)
    val = years == 2023
    val_ll = logloss(y[val], mix[val]) if val.any() else None
    with open(os.path.join(art, "ensemble_weights.json"), "w") as f:
        json.dump({"members": names, "method": "walk_forward_softened_50_50",
                   "weights_by_season": history, "val_logloss": val_ll,
                   "n": int(len(out))}, f, indent=1)
    print(f"ensemble walk-forward: n={len(out):,} val_logloss={val_ll}")
    print("pesos última temporada:", history[str(seasons[-1])])
    print("escrito:", os.path.join(art, f"pred_{args.out}.csv"))


if __name__ == "__main__":
    main()
