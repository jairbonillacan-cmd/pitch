#!/usr/bin/env python3
"""Experimento: calibración por división del Motor A (solo val 2023/24).

Motivación: el ECE del `logit` varía mucho por liga en la monitorización live (E0 ~0,10, I1 ~0,15).
Se prueba una temperatura por división ajustada con predicciones walk-forward de temporadas
anteriores a 2023 y se evalúa en val. No se toca test.

Uso:
    ./.venv/bin/python pipeline/experiment_calibration_division.py
"""
from __future__ import annotations

import json
import os
import sys

import numpy as np
import pandas as pd
from scipy.optimize import minimize_scalar

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from eval.compare import paired_bootstrap_delta  # noqa: E402
from eval.metrics import multiclass_log_loss, brier_multiclass, rps, ece  # noqa: E402

ART = os.path.join(ROOT, "artifacts", "EXP01_final_20261109", "pred_logit.csv")
SEED = 20261109
VAL = 2023
MIN_TRAIN_DIV = 500


def year(s):
    return int(str(s)[:4])


def apply_temp(p, t):
    q = np.exp(np.log(np.clip(p, 1e-15, 1)) / t)
    return q / q.sum(axis=1, keepdims=True)


def fit_temp(p, y):
    def nll(t):
        q = apply_temp(p, t)
        return -np.mean(np.log(q[np.arange(len(y)), y]))
    res = minimize_scalar(nll, bounds=(0.5, 2.5), method="bounded")
    return float(res.x)


def metrics(y, p):
    return {"n": int(len(y)), "log_loss": multiclass_log_loss(y, p),
            "brier": brier_multiclass(y, p), "rps": rps(y, p),
            "ece": ece(y, p, bins=10),
            "accuracy": float(np.mean(p.argmax(1) == y))}


def main():
    df = pd.read_csv(ART)
    df["yr"] = df.season.map(year)
    df = df[df.y.notna()].copy()
    train = df[df.yr <= 2022]
    val = df[df.yr == VAL].copy()
    y_val = val.y.to_numpy(int)
    p_val = val[["p_home", "p_draw", "p_away"]].to_numpy(float)
    print(f"val n={len(val):,} | train n={len(train):,}")

    # temperatura global
    pg = train[["p_home", "p_draw", "p_away"]].to_numpy(float)
    yg = train.y.to_numpy(int)
    t_global = fit_temp(pg, yg)
    # temperatura por división
    temps = {}
    for div, g in train.groupby("div"):
        if len(g) < MIN_TRAIN_DIV:
            continue
        temps[div] = fit_temp(g[["p_home", "p_draw", "p_away"]].to_numpy(float),
                              g.y.to_numpy(int))
    n_div_train = int(train["div"].nunique())
    print(f"T global={t_global:.4f} | divisiones con T propia={len(temps)} (de {n_div_train})")

    p_global = apply_temp(p_val, t_global)
    p_div = np.vstack([
        apply_temp(np.asarray(row, dtype=float)[None, :], temps.get(div, t_global))[0]
        for row, div in zip(val[["p_home", "p_draw", "p_away"]].to_numpy(float), val["div"])
    ])

    base = metrics(y_val, p_val)
    glob = metrics(y_val, p_global)
    divm = metrics(y_val, p_div)
    print("base :", {k: round(v, 5) if isinstance(v, float) else v for k, v in base.items()})
    print("global:", {k: round(v, 5) if isinstance(v, float) else v for k, v in glob.items()})
    print("por div:", {k: round(v, 5) if isinstance(v, float) else v for k, v in divm.items()})

    blocks = val["div"].astype(str).to_numpy()
    boot_div = paired_bootstrap_delta(y_val, p_div, p_val, blocks=blocks, B=2000, seed=SEED)
    boot_glob = paired_bootstrap_delta(y_val, p_global, p_val, blocks=blocks, B=2000, seed=SEED)

    # ECE por división (base vs por división) para ver si la calibración local ayuda donde importa
    per_div = {}
    for div, g in val.groupby("div"):
        idx = g.index
        pos = val.index.get_indexer(idx)
        yv = g.y.to_numpy(int)
        per_div[div] = {
            "n": int(len(g)),
            "ece_base": ece(yv, p_val[pos], bins=5),
            "ece_div": ece(yv, p_div[pos], bins=5),
            "ll_base": multiclass_log_loss(yv, p_val[pos]),
            "ll_div": multiclass_log_loss(yv, p_div[pos]),
            "temp": temps.get(div, t_global),
        }
    out = {"temps": temps, "t_global": t_global,
           "metrics": {"base": base, "global": glob, "per_division": divm},
           "bootstrap": {"per_division": boot_div, "global": boot_glob},
           "per_division": per_div}
    path = os.path.join(ROOT, "artifacts", "experiment_calibration_division.json")
    with open(path, "w") as f:
        json.dump(out, f, indent=1, default=float)
    print(f"\nbootstrap por división − base: Δ={boot_div['delta_logloss']:+.5f} "
          f"CI[{boot_div['ci95_logloss'][0]:+.5f},{boot_div['ci95_logloss'][1]:+.5f}] "
          f"frac>0={boot_div['frac_gt0_logloss']:.3f}")
    print(f"bootstrap global − base:      Δ={boot_glob['delta_logloss']:+.5f} "
          f"CI[{boot_glob['ci95_logloss'][0]:+.5f},{boot_glob['ci95_logloss'][1]:+.5f}]")
    ece_b = np.mean([v["ece_base"] for v in per_div.values() if v["n"] >= 80])
    ece_d = np.mean([v["ece_div"] for v in per_div.values() if v["n"] >= 80])
    print(f"ECE medio por división (n>=80): base={ece_b:.4f} -> por_div={ece_d:.4f}")
    print("escrito ->", path)


if __name__ == "__main__":
    main()
