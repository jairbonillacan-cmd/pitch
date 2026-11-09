#!/usr/bin/env python3
"""Monitorización en vivo (temporada 2026/27 parcial) del modelo congelado.

No es test: `live` es la temporada en curso y se usa para vigilar calibración y deriva,
nunca para elegir modelo. Genera `artifacts/FINAL/monitoring_live.{md,json}`.

Uso:
    ./.venv/bin/python pipeline/monitoring_report.py
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from eval.metrics import summary_metrics  # noqa: E402
from eval.compare import paired_bootstrap_delta  # noqa: E402

PROC = os.path.join(ROOT, "data", "processed")
FINAL = os.path.join(ROOT, "artifacts", "FINAL")
LIVE_YEAR = 2026
MODELS = ["base_rate", "logit", "hgb", "ensemble", "market_close_best_power",
          "market_open_best_power", "stack_logit"]


def load():
    p = pd.read_csv(os.path.join(FINAL, "predictions_all.csv"))
    p = p[p.season.astype(str).str[:4].astype(int) == LIVE_YEAR].copy()
    p = p[p.model_id.isin(MODELS)]
    p = p.drop_duplicates(["match_id", "model_id"])
    return p


def main():
    p = load()
    matches = pd.read_parquet(os.path.join(PROC, "matches.parquet"))
    matches["match_date"] = pd.to_datetime(matches["match_date"])
    ymap = matches.set_index("match_id").result.map({"H": 0, "D": 1, "A": 2})
    p["y"] = p.match_id.map(ymap)
    p = p[p.y.notna()]
    print(f"partidos live: {p.match_id.nunique():,} | filas: {len(p):,}")

    out = {}
    for m in MODELS:
        g = p[p.model_id == m]
        if len(g) < 100:
            continue
        probs = g[["p_home", "p_draw", "p_away"]].to_numpy(float)
        y = g.y.to_numpy(int)
        s = summary_metrics(y, probs, bins=10)
        s["n"] = int(len(g))
        s["coverage"] = round(len(g) / p.match_id.nunique(), 4)
        out[m] = s

    # comparaciones pareadas sobre la intersección
    comps = {}
    piv = {m: p[p.model_id == m].set_index("match_id") for m in out}
    pairs = [("ensemble", "logit"), ("logit", "market_close_best_power"),
             ("ensemble", "market_close_best_power"), ("stack_logit", "market_close_best_power")]
    for a, b in pairs:
        if a not in piv or b not in piv:
            continue
        ids = piv[a].index.intersection(piv[b].index)
        if len(ids) < 300:
            continue
        ya = piv[a].loc[ids, "y"].to_numpy(int)
        pa = piv[a].loc[ids, ["p_home", "p_draw", "p_away"]].to_numpy(float)
        pb = piv[b].loc[ids, ["p_home", "p_draw", "p_away"]].to_numpy(float)
        blocks = (piv[a].loc[ids, "season"].astype(str) + "|" + piv[a].loc[ids, "div"]).to_numpy()
        comps[f"{a} vs {b}"] = paired_bootstrap_delta(ya, pa, pb, blocks=blocks, B=2000, seed=20261109)

    # calibración por división (logit)
    by_div = {}
    gl = piv.get("logit")
    if gl is not None:
        for div, g in gl.groupby("div"):
            if len(g) < 80:
                continue
            s = summary_metrics(g.y.to_numpy(int),
                                g[["p_home", "p_draw", "p_away"]].to_numpy(float), bins=5)
            by_div[div] = {"n": int(len(g)), "log_loss": s["log_loss"],
                           "accuracy": s["accuracy"], "ece": s["ece"]}

    payload = {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
               "season": "2026/27 (parcial)", "n_matches": int(p.match_id.nunique()),
               "models": out, "comparisons": comps, "logit_by_division": by_div}
    with open(os.path.join(FINAL, "monitoring_live.json"), "w") as f:
        json.dump(payload, f, indent=1, default=float)

    lines = ["# Monitorización en vivo — 2026/27 (parcial)", "",
             f"Generado: {payload['generated_at']} · partidos: **{payload['n_matches']:,}**", "",
             "> `live` no es test: sirve para vigilar calibración y deriva del modelo congelado.", "",
             "| Modelo | n | Cobertura | Log-loss | Brier | RPS | Acc | ECE |", "|---|---:|---:|---:|---:|---:|---:|---:|"]
    for m, s in sorted(out.items(), key=lambda kv: kv[1]["log_loss"]):
        lines.append(f"| `{m}` | {s['n']:,} | {s['coverage']:.1%} | {s['log_loss']:.5f} | "
                     f"{s['brier']:.5f} | {s['rps']:.5f} | {s['accuracy']:.4f} | {s['ece']:.4f} |")
    lines += ["", "## Comparaciones pareadas (bootstrap por bloques)", "",
              "| A vs B | n | Δlog-loss | IC95 % | frac Δ>0 |", "|---|---:|---:|---|---:|"]
    for k, v in comps.items():
        lines.append(f"| {k} | {v['n_matches']} | {v['delta_logloss']:.5f} | "
                     f"[{v['ci95_logloss'][0]:.5f}, {v['ci95_logloss'][1]:.5f}] | {v['frac_gt0_logloss']:.3f} |")
    if by_div:
        lines += ["", "## `logit` por división (n ≥ 80)", "",
                  "| Div | n | Log-loss | Acc | ECE |", "|---|---:|---:|---:|---:|"]
        for div, s in sorted(by_div.items(), key=lambda kv: -kv[1]["n"]):
            lines.append(f"| {div} | {s['n']:,} | {s['log_loss']:.5f} | {s['accuracy']:.4f} | {s['ece']:.4f} |")
    lines += ["", "## Lectura",
              "- Si el log-loss live se separa >0,02 del val histórico en el mismo modelo, revisar deriva.",
              "- La cobertura de mercado en 2026/27 es parcial (Pinnacle ya no publica): el benchmark",
              "  de mercado se calcula con la cadena PS→B365→Avg y se reporta su cobertura.",
              "- Este informe se regenera con `pipeline/monitoring_report.py`; no altera candidatos."]
    with open(os.path.join(FINAL, "monitoring_live.md"), "w") as f:
        f.write("\n".join(lines) + "\n")
    print("\n".join(lines[:14]))
    print(f"\nescrito -> {FINAL}/monitoring_live.md")


if __name__ == "__main__":
    main()
