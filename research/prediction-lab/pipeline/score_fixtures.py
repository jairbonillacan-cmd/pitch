#!/usr/bin/env python3
"""Ciclo 6 — Puntuación prospectiva de los fixtures pre-registrados (A19).

Toma las predicciones pre-registradas (`artifacts/FIXTURES/predictions_*.csv`), las une con los
resultados publicados después (`data/raw/2627_update/*.csv`) y calcula métricas del modelo y del
mercado del mismo snapshot, con bootstrap pareado.

Advertencia de honestidad: las predicciones se generaron el 2026-11-09 10:43 UTC, cuando la fuente
aún NO contenía estos resultados; el pre-registro es el hash del CSV. Sin embargo, los partidos ya
se habían jugado horas antes, así que esto es una evaluación **out-of-sample de pipeline**, no un
pronóstico en tiempo real. Se documenta en el informe.

Uso:
    ./.venv/bin/python pipeline/score_fixtures.py
"""
from __future__ import annotations

import glob
import json
import os
import sys

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "etl"))
from build_matches import canonical_team, parse_date, read_csv  # noqa: E402
from eval.compare import paired_bootstrap_delta  # noqa: E402
from eval.metrics import summary_metrics  # noqa: E402

OUT = os.path.join(ROOT, "artifacts", "FIXTURES")
UPD = os.path.join(ROOT, "data", "raw", "2627_update")


def load_results() -> pd.DataFrame:
    rows = []
    for path in sorted(glob.glob(os.path.join(UPD, "*.csv"))):
        div = os.path.splitext(os.path.basename(path))[0]
        df = read_csv(path)
        if df is None:
            continue
        for r in df.to_dict("records"):
            d = parse_date(r.get("Date", ""))
            home = canonical_team(div, str(r.get("HomeTeam", "")).strip())
            away = canonical_team(div, str(r.get("AwayTeam", "")).strip())
            ftr = str(r.get("FTR", "")).strip().upper()
            if d is None or ftr not in ("H", "D", "A"):
                continue
            rows.append({"div": div, "date": d.isoformat(), "home": home, "away": away,
                         "result": ftr})
    return pd.DataFrame(rows)


def main():
    pred_path = sorted(glob.glob(os.path.join(OUT, "predictions_*.csv")))[-1]
    preds = pd.read_csv(pred_path)
    results = load_results()
    df = preds.merge(results, on=["div", "date", "home", "away"], how="left", validate="one_to_one")
    matched = df[df.result.notna()].copy()
    ymap = {"H": 0, "D": 1, "A": 2}
    matched["y"] = matched.result.map(ymap).astype(int)
    print(f"predicciones: {len(preds):,} | con resultado: {len(matched):,}")

    pm = matched[["p_model_h", "p_model_d", "p_model_a"]].to_numpy(float)
    pk = matched[["p_market_h", "p_market_d", "p_market_a"]].to_numpy(float)
    y = matched.y.to_numpy(int)
    out = {"predictions_file": os.path.basename(pred_path), "n_predicted": int(len(preds)),
           "n_scored": int(len(matched)),
           "model": {k: v for k, v in summary_metrics(y, pm, bins=10).items()
                     if k in ("n", "log_loss", "brier", "rps", "accuracy", "ece")},
           "market": {k: v for k, v in summary_metrics(y, pk, bins=10).items()
                      if k in ("n", "log_loss", "brier", "rps", "accuracy", "ece")}}
    boot = paired_bootstrap_delta(y, pm, pk, blocks=matched["div"].astype(str).to_numpy(),
                                  B=2000, seed=20261109)
    out["model_vs_market"] = boot
    # por división
    by_div = {}
    for div, g in matched.groupby("div"):
        if len(g) < 5:
            continue
        yy = g.y.to_numpy(int)
        by_div[div] = {"n": int(len(g)),
                       "model_log_loss": float(summary_metrics(yy, g[["p_model_h", "p_model_d", "p_model_a"]].to_numpy(float), bins=5)["log_loss"]),
                       "market_log_loss": float(summary_metrics(yy, g[["p_market_h", "p_market_d", "p_market_a"]].to_numpy(float), bins=5)["log_loss"]),
                       "model_acc": float(summary_metrics(yy, g[["p_model_h", "p_model_d", "p_model_a"]].to_numpy(float), bins=5)["accuracy"]),
                       "market_acc": float(summary_metrics(yy, g[["p_market_h", "p_market_d", "p_market_a"]].to_numpy(float), bins=5)["accuracy"])}
    out["by_division"] = by_div
    path = os.path.join(OUT, "SCORE_" + os.path.basename(pred_path).replace("predictions_", "").replace(".csv", "") + ".json")
    with open(path, "w") as f:
        json.dump(out, f, indent=1, default=float)

    md = [f"# Scoring prospectivo — {os.path.basename(pred_path)}", "",
          f"Partidos predichos: **{len(preds)}** · con resultado publicado: **{len(matched)}**", "",
          "> **Advertencia:** predicciones generadas el 2026-11-09 10:43 UTC, antes de que la fuente",
          "> publicara estos resultados (pre-registro por hash). Los partidos ya se habían jugado: es una",
          "> evaluación out-of-sample del pipeline, no un pronóstico en tiempo real.", "",
          "| Sistema | n | Log-loss | Brier | RPS | Accuracy | ECE |", "|---|---:|---:|---:|---:|---:|---:|"]
    for name in ("model", "market"):
        s = out[name]
        md.append(f"| {'modelo' if name == 'model' else 'mercado'} | {s['n']} | {s['log_loss']:.5f} | "
                  f"{s['brier']:.5f} | {s['rps']:.5f} | {s['accuracy']:.4f} | {s['ece']:.4f} |")
    md += ["", "## Modelo − mercado (bootstrap pareado por división)", "",
           f"Δlog-loss = **{boot['delta_logloss']:+.5f}** "
           f"[{boot['ci95_logloss'][0]:+.5f}; {boot['ci95_logloss'][1]:+.5f}], "
           f"fracción Δ>0 = {boot['frac_gt0_logloss']:.3f}  (negativo ⇒ modelo mejor)", "",
           "## Por división", "", "| Div | n | LL modelo | LL mercado | Acc modelo | Acc mercado |",
           "|---|---:|---:|---:|---:|---:|"]
    for div, s in sorted(by_div.items(), key=lambda kv: -kv[1]["n"]):
        md.append(f"| {div} | {s['n']} | {s['model_log_loss']:.4f} | {s['market_log_loss']:.4f} | "
                  f"{s['model_acc']:.3f} | {s['market_acc']:.3f} |")
    md += ["", "## Lectura", "",
           "Si el modelo queda por detrás del mercado también en esta muestra, se refuerza la conclusión",
           "del ciclo 1: el mercado es el listón y el motor deportivo no lo bate. Si por el contrario",
           "ganara, sería evidencia nueva que exigiría auditoría antes de cualquier conclusión."]
    md_path = path.replace("SCORE_", "REPORT_SCORE_").replace(".json", ".md")
    with open(md_path, "w") as f:
        f.write("\n".join(md) + "\n")
    print("\n".join(md[:14]))
    print("escrito ->", path, "y", md_path)


if __name__ == "__main__":
    main()
