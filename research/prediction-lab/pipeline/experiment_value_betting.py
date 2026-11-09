#!/usr/bin/env python3
"""Ciclo 8 — Simulación de apuestas por valor (¿algún umbral de edge da ROI positivo?).

Usa las predicciones del modelo y las cuotas de cierre de B365 (el precio al que se apostaría).
Estrategia: por partido, apostar 1 unidad al resultado con mayor `edge = p_modelo * cuota − 1`
si supera un umbral. ROI plano y bootstrap por bloques.

Se ejecuta sobre:
  - test 2024/25 + 2025/26 (con cuotas B365 de cierre),
  - los 146 fixtures pre-registrados (cuotas B365 del snapshot).

Uso:
    ./.venv/bin/python pipeline/experiment_value_betting.py
"""
from __future__ import annotations

import glob
import json
import os
import sys

import numpy as np
import pandas as pd
from scipy.optimize import brentq

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

ART = os.path.join(ROOT, "artifacts")
OUT = os.path.join(ART, "VALUE_BETTING")
THRESHOLDS = (0.0, 0.02, 0.05, 0.10, 0.15)
SEED = 20261109


def power_devig(odds: np.ndarray) -> np.ndarray:
    q = 1.0 / odds
    try:
        a = brentq(lambda x: float(np.sum(np.power(q, x)) - 1.0), 1e-6, 5.0, xtol=1e-12)
    except ValueError:
        return np.full(3, np.nan)
    p = np.power(q, a)
    return p / p.sum()


def simulate(y: np.ndarray, p: np.ndarray, odds: np.ndarray, blocks: np.ndarray) -> dict:
    """ROI por umbral; y en {0,1,2}; odds (n,3)."""
    res = {}
    for tau in THRESHOLDS:
        edges = p * odds - 1.0
        pick = np.argmax(edges, axis=1)
        best = edges[np.arange(len(edges)), pick]
        sel = best > tau
        n = int(sel.sum())
        if n == 0:
            res[f"{tau:.2f}"] = {"n_bets": 0}
            continue
        won = (pick[sel] == y[sel])
        profit = np.where(won, odds[np.arange(len(y))[sel], pick[sel]] - 1.0, -1.0)
        roi = float(profit.mean())
        # bootstrap por bloques
        rng = np.random.default_rng(SEED)
        by_block = {}
        for b, pr in zip(blocks[sel], profit):
            by_block.setdefault(b, []).append(pr)
        keys = list(by_block)
        boots = []
        for _ in range(2000):
            sample = rng.choice(len(keys), len(keys), replace=True)
            vals = np.concatenate([by_block[keys[i]] for i in sample])
            boots.append(float(vals.mean()))
        res[f"{tau:.2f}"] = {
            "n_bets": n, "roi": roi, "hit_rate": float(won.mean()),
            "ci95_roi": [float(np.percentile(boots, 2.5)), float(np.percentile(boots, 97.5))],
            "frac_roi_gt0": float(np.mean(np.array(boots) > 0)),
            "avg_edge": float(best[sel].mean()),
        }
    return res


def main():
    os.makedirs(OUT, exist_ok=True)
    out = {}

    # --- Test ---
    pred = pd.read_csv(os.path.join(ART, "FINAL", "predictions_test.csv"))
    pred = pred[pred.model_id == "logit"]
    matches = pd.read_parquet(os.path.join(ROOT, "data", "processed", "matches.parquet"))
    odds_cols = ["odds_close_b365_h", "odds_close_b365_d", "odds_close_b365_a"]
    df = pred.merge(matches[["match_id", "result"] + odds_cols], on="match_id", how="left")
    ok = df[odds_cols].notna().all(axis=1).to_numpy()
    df = df[ok].copy()
    y = df.result.map({"H": 0, "D": 1, "A": 2}).to_numpy(int)
    p = df[["p_home", "p_draw", "p_away"]].to_numpy(float)
    odds = df[odds_cols].to_numpy(float)
    blocks = (df.season.astype(str) + "|" + df["div"]).to_numpy()
    # sanity: mercado de-vig vs modelo
    market = np.vstack([power_devig(o) for o in odds])
    out["test"] = {"n_matches": int(len(df)), "results": simulate(y, p, odds, blocks),
                   "model_ll": float(-np.mean(np.log(np.clip(p[np.arange(len(y)), y], 1e-15, 1)))),
                   "market_ll": float(-np.mean(np.log(np.clip(market[np.arange(len(y)), y], 1e-15, 1))))}

    # --- Fixtures ---
    fp = sorted(glob.glob(os.path.join(ART, "FIXTURES", "predictions_*.csv")))[-1]
    fx = pd.read_csv(fp)
    sys.path.insert(0, os.path.join(ROOT, "etl"))
    sys.path.insert(0, os.path.join(ROOT, "pipeline"))
    import importlib
    score = importlib.import_module("pipeline.score_fixtures")
    results = score.load_results()
    fx = fx.merge(results, on=["div", "date", "home", "away"], how="inner")
    y2 = fx.result.map({"H": 0, "D": 1, "A": 2}).to_numpy(int)
    p2 = fx[["p_model_h", "p_model_d", "p_model_a"]].to_numpy(float)
    o2 = fx[["odds_h", "odds_d", "odds_a"]].to_numpy(float)
    blocks2 = fx["div"].to_numpy()
    out["fixtures"] = {"n_matches": int(len(fx)), "results": simulate(y2, p2, o2, blocks2)}

    path = os.path.join(OUT, "value_betting.json")
    with open(path, "w") as f:
        json.dump(out, f, indent=1, default=float)

    md = ["# Simulación de apuestas por valor", "",
          "Estrategia: 1 unidad al resultado con mayor `edge = p_modelo·cuota − 1` si supera τ.",
          "Cuotas: B365 de cierre (test) y B365 del snapshot (fixtures).", "",
          "## Test 2024/25 + 2025/26", "",
          f"Partidos con cuota: **{out['test']['n_matches']:,}** · log-loss modelo "
          f"{out['test']['model_ll']:.4f} vs mercado {out['test']['market_ll']:.4f}", "",
          "| τ | Apuestas | ROI | IC95 % ROI | Acierto | Edge medio |", "|---:|---:|---:|---|---:|---:|"]
    for tau, r in out["test"]["results"].items():
        if r["n_bets"] == 0:
            md.append(f"| {tau} | 0 | — | — | — | — |")
        else:
            md.append(f"| {tau} | {r['n_bets']:,} | {r['roi']:+.2%} | "
                      f"[{r['ci95_roi'][0]:+.2%}; {r['ci95_roi'][1]:+.2%}] | {r['hit_rate']:.1%} | {r['avg_edge']:+.3f} |")
    md += ["", f"## Fixtures pre-registrados (n={out['fixtures']['n_matches']})", "",
           "| τ | Apuestas | ROI | IC95 % ROI | Acierto |", "|---:|---:|---:|---|---:|"]
    for tau, r in out["fixtures"]["results"].items():
        if r["n_bets"] == 0:
            md.append(f"| {tau} | 0 | — | — | — |")
        else:
            md.append(f"| {tau} | {r['n_bets']} | {r['roi']:+.2%} | "
                      f"[{r['ci95_roi'][0]:+.2%}; {r['ci95_roi'][1]:+.2%}] | {r['hit_rate']:.1%} |")
    md += ["", "## Lectura", "",
           "Si ningún umbral produce ROI positivo con IC que excluya 0, no hay estrategia de valor.",
           "Un ROI positivo aislado con IC amplio no es evidencia (selección de umbral); se exige",
           "consistencia entre test y fixtures y significancia."]
    with open(os.path.join(OUT, "value_betting.md"), "w") as f:
        f.write("\n".join(md) + "\n")
    print("\n".join(md[:20]))
    print("escrito ->", path)


if __name__ == "__main__":
    main()
