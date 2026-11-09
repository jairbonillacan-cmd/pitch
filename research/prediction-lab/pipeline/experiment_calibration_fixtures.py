#!/usr/bin/env python3
"""Ciclo 7 — ¿Corrige una temperatura (ajustada fuera de muestra) la sobreconfianza de los fixtures?

T = 1,0766 se ajustó en el ciclo 4 con predicciones walk-forward ≤2022 (independiente de los fixtures).
Aquí se aplica a las 146 predicciones pre-registradas y se comparan log-loss y ECE, con bootstrap.

Uso:
    ./.venv/bin/python pipeline/experiment_calibration_fixtures.py
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
from eval.metrics import summary_metrics  # noqa: E402

ART = os.path.join(ROOT, "artifacts", "FIXTURES")
SEED = 20261109


def load_temp() -> float:
    p = os.path.join(ROOT, "artifacts", "experiment_calibration_division.json")
    with open(p) as f:
        return float(json.load(f)["t_global"])


def apply_temp(p, t):
    q = np.exp(np.log(np.clip(p, 1e-15, 1)) / t)
    return q / q.sum(axis=1, keepdims=True)


def ece(y, p, bins=10):
    return summary_metrics(y, p, bins=bins)["ece"]


def boot_delta(y, pa, pb, metric="log_loss", B=2000, seed=SEED):
    rng = np.random.default_rng(seed)
    n = len(y)
    vals = []
    for _ in range(B):
        idx = rng.integers(0, n, n)
        ma = summary_metrics(y[idx], pa[idx], bins=10)[metric]
        mb = summary_metrics(y[idx], pb[idx], bins=10)[metric]
        vals.append(ma - mb)
    vals = np.array(vals)
    return {"delta": float(np.mean(vals)), "ci95": [float(np.percentile(vals, 2.5)),
                                                    float(np.percentile(vals, 97.5))],
            "frac_gt0": float(np.mean(vals > 0))}


def main():
    pred = pd.read_csv(sorted(__import__("glob").glob(os.path.join(ART, "predictions_*.csv")))[-1])
    results = pd.read_csv(os.path.join(ROOT, "data", "raw", "2627_update", "results_merged.csv")) \
        if os.path.exists(os.path.join(ROOT, "data", "raw", "2627_update", "results_merged.csv")) else None
    if results is None:
        # reconstruye resultados desde los CSV actualizados (misma lógica que score_fixtures)
        sys.path.insert(0, os.path.join(ROOT, "etl"))
        import importlib
        score = importlib.import_module("pipeline.score_fixtures")
        results = score.load_results()
    df = pred.merge(results, on=["div", "date", "home", "away"], how="inner")
    y = df.result.map({"H": 0, "D": 1, "A": 2}).to_numpy(int)
    p = df[["p_model_h", "p_model_d", "p_model_a"]].to_numpy(float)
    t = load_temp()
    pt = apply_temp(p, t)
    print(f"n={len(df)} | T={t:.4f} (ajustada con datos ≤2022, independiente de estos fixtures)")
    base = summary_metrics(y, p, bins=10)
    cal = summary_metrics(y, pt, bins=10)
    print(f"sin calibrar : LL={base['log_loss']:.5f} Brier={base['brier']:.5f} ECE={base['ece']:.4f} acc={base['accuracy']:.4f}")
    print(f"temperatura  : LL={cal['log_loss']:.5f} Brier={cal['brier']:.5f} ECE={cal['ece']:.4f} acc={cal['accuracy']:.4f}")
    out = {
        "n": int(len(df)), "temperature": t,
        "base": {k: base[k] for k in ("log_loss", "brier", "rps", "accuracy", "ece")},
        "calibrated": {k: cal[k] for k in ("log_loss", "brier", "rps", "accuracy", "ece")},
        "bootstrap_ll": boot_delta(y, pt, p, "log_loss"),
        "bootstrap_ece": boot_delta(y, pt, p, "ece"),
    }
    # calibración por bins
    from eval.metrics import calibration_table
    out["bins_base"] = calibration_table(y, p, bins=5)
    out["bins_cal"] = calibration_table(y, pt, bins=5)
    path = os.path.join(ART, "calibration_fixtures.json")
    with open(path, "w") as f:
        json.dump(out, f, indent=1, default=float)
    print(f"bootstrap LL (cal − base): {out['bootstrap_ll']}")
    print(f"bootstrap ECE (cal − base): {out['bootstrap_ece']}")
    print("escrito ->", path)


if __name__ == "__main__":
    main()
