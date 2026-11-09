#!/usr/bin/env python3
"""Exporta predicciones al contrato `CONTRACT_PREDICTIONS.md` e incluye el benchmark de mercado.

Uso:
    ./.venv/bin/python pipeline/export_predictions.py --artifact artifacts/EXP01_baselines_20261109

Salida (dentro del artefacto):
    predictions.csv   una fila por (match_id, model_id) con el esquema del contrato
"""
from __future__ import annotations

import argparse
import glob
import os
from datetime import datetime, timezone

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROC = os.path.join(ROOT, "data", "processed")
MARKET_MODELS = {
    "market_close_ps_power": ["mkt_close_ps_power_{k}"],
    "market_close_ps_proportional": ["mkt_close_ps_proportional_{k}"],
    "market_close_b365_power": ["mkt_close_b365_power_{k}"],
    "market_close_bfe_proportional": ["mkt_close_bfe_proportional_{k}"],
    "market_open_b365_proportional": ["mkt_open_b365_proportional_{k}"],
}


def load_market() -> pd.DataFrame:
    m = pd.read_parquet(os.path.join(PROC, "features_market.parquet"))
    return m[["match_id", "div", "season", "match_date", "y"] +
             [c for cols in MARKET_MODELS.values() for c in
              [x.format(k=k) for x in cols for k in "hda"]]].copy()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--artifact", required=True)
    ap.add_argument("--version", default="1.0.0")
    args = ap.parse_args()
    art = args.artifact if os.path.isabs(args.artifact) else os.path.join(ROOT, args.artifact)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    rows = []
    for path in sorted(glob.glob(os.path.join(art, "pred_*.csv"))):
        name = os.path.basename(path)[5:-4]
        df = pd.read_csv(path)
        if "y" in df.columns:
            df = df.drop(columns=["y"])
        df = df.rename(columns={"p_home": "p_home", "p_draw": "p_draw", "p_away": "p_away"})
        df["model_id"] = name
        df["model_version"] = args.version
        df["fold_id"] = df["season"].map(lambda s: f"wf_{str(s)[:4]}")
        df["generated_at"] = now
        df["data_quality_flag"] = "ok"
        rows.append(df)
    if not rows:
        raise SystemExit(f"no hay pred_*.csv en {art}")
    preds = pd.concat(rows, ignore_index=True)

    market = load_market()
    mrows = []
    for model_id, templates in MARKET_MODELS.items():
        cols = [t.format(k=k) for t in templates for k in "hda"]
        if not all(c in market.columns for c in cols):
            continue
        sub = market[["match_id", "div", "season", "match_date", "y"]].copy()
        p = market[cols].to_numpy(dtype=float)
        ok = np.all(np.isfinite(p), axis=1) & (p.sum(axis=1) > 0)
        p = p / p.sum(axis=1, keepdims=True)
        sub["p_home"], sub["p_draw"], sub["p_away"] = p[:, 0], p[:, 1], p[:, 2]
        sub = sub[ok]
        sub["model_id"] = model_id
        sub["model_version"] = "closing-odds"
        sub["fold_id"] = sub["season"].map(lambda s: f"wf_{str(s)[:4]}")
        sub["generated_at"] = now
        sub["data_quality_flag"] = "ok"
        sub = sub.drop(columns=["y"])
        mrows.append(sub)
    if mrows:
        preds = pd.concat([preds] + mrows, ignore_index=True)

    preds["match_date"] = pd.to_datetime(preds["match_date"]).dt.strftime("%Y-%m-%d")
    preds = preds[["match_id", "div", "season", "match_date", "model_id", "model_version",
                   "p_home", "p_draw", "p_away", "fold_id", "generated_at", "data_quality_flag"]]
    # Validación de contrato
    s = preds[["p_home", "p_draw", "p_away"]].sum(axis=1)
    bad = (~np.isfinite(s)) | ((s - 1).abs() > 1e-6)
    if bad.any():
        print(f"AVISO: {bad.sum()} filas fuera de simplex; se normalizan")
        preds.loc[bad, ["p_home", "p_draw", "p_away"]] = (
            preds.loc[bad, ["p_home", "p_draw", "p_away"]].div(s[bad], axis=0))
    dup = preds.duplicated(["match_id", "model_id"]).sum()
    out = os.path.join(art, "predictions.csv")
    preds.to_csv(out, index=False)
    print(f"modelos: {sorted(preds.model_id.unique())}")
    print(f"filas: {len(preds):,} | duplicados: {dup} | escrito -> {out}")


if __name__ == "__main__":
    main()
