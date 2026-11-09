#!/usr/bin/env python3
"""Combina predicciones de varios artefactos en un único `predictions.csv` (contrato A08).

- Deduplica por (match_id, model_id).
- Añade el benchmark de mercado con preferencia por fuente (Pinnacle -> B365 -> Avg) para
  apertura y cierre, de modo que la comparación no pierda partidos cuando Pinnacle desaparece.
- Opcionalmente filtra a temporadas <= --max-season (para informes de selección sin tocar test).

Uso:
  ./.venv/bin/python pipeline/combine_predictions.py \
      --artifacts artifacts/EXP01_final_20261109,artifacts/EXP08_motor_b_final_20261109 \
      --out artifacts/FINAL/predictions.csv [--max-season 2023] [--no-market]
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


def load_artifact(art, now):
    rows = []
    for path in sorted(glob.glob(os.path.join(art, "pred_*.csv"))):
        name = os.path.basename(path)[5:-4]
        if name.endswith("_test") or name.startswith("ensemble_nan"):
            continue
        df = pd.read_csv(path)
        if "y" in df.columns:
            df = df.drop(columns=["y"])
        df["model_id"] = name
        df["model_version"] = "1.0.0"
        df["fold_id"] = df["season"].map(lambda s: f"wf_{str(s)[:4]}")
        df["generated_at"] = now
        df["data_quality_flag"] = "ok"
        rows.append(df)
    return rows


def market_rows(now):
    mk = pd.read_parquet(os.path.join(PROC, "features_market.parquet"))
    out = []
    for phase, label in (("open", "market_open_best_power"), ("close", "market_close_best_power")):
        mh = pd.Series(np.nan, index=mk.index)
        md = pd.Series(np.nan, index=mk.index)
        ma = pd.Series(np.nan, index=mk.index)
        for src in ("ps", "b365", "avg"):
            cols = [f"mkt_{phase}_{src}_power_{k}" for k in "hda"]
            if not all(c in mk.columns for c in cols):
                continue
            ok = mk[cols].notna().all(axis=1)
            mh.loc[ok], md.loc[ok], ma.loc[ok] = mk.loc[ok, cols[0]], mk.loc[ok, cols[1]], mk.loc[ok, cols[2]]
        p = np.column_stack([mh, md, ma]).astype(float)
        ok = np.all(np.isfinite(p), axis=1)
        p = p[ok] / p[ok].sum(axis=1, keepdims=True)
        sub = mk.loc[ok, ["match_id", "div", "season", "match_date"]].copy()
        sub["p_home"], sub["p_draw"], sub["p_away"] = p[:, 0], p[:, 1], p[:, 2]
        sub["model_id"] = label
        sub["model_version"] = "closing-odds" if phase == "close" else "opening-odds"
        sub["fold_id"] = sub.season.map(lambda s: f"wf_{str(s)[:4]}")
        sub["generated_at"] = now
        sub["data_quality_flag"] = "ok"
        out.append(sub)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--artifacts", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--max-season", type=int, default=None)
    ap.add_argument("--no-market", action="store_true")
    args = ap.parse_args()
    arts = [a.strip() for a in args.artifacts.split(",") if a.strip()]
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    rows = []
    for a in arts:
        art = a if os.path.isabs(a) else os.path.join(ROOT, a)
        if not os.path.isdir(art):
            print(f"AVISO: no existe {art}")
            continue
        rows += load_artifact(art, now)
    if not args.no_market:
        rows += market_rows(now)
    if not rows:
        raise SystemExit("sin predicciones")
    df = pd.concat(rows, ignore_index=True)
    df["match_date"] = pd.to_datetime(df["match_date"]).dt.strftime("%Y-%m-%d")
    if args.max_season is not None:
        df = df[df.season.astype(str).str[:4].astype(int) <= args.max_season]
    cols = ["match_id", "div", "season", "match_date", "model_id", "model_version",
            "p_home", "p_draw", "p_away", "fold_id", "generated_at", "data_quality_flag"]
    df = df[cols]
    s = df[["p_home", "p_draw", "p_away"]].sum(axis=1)
    bad = (~np.isfinite(s)) | ((s - 1).abs() > 1e-6)
    if bad.any():
        df.loc[bad, ["p_home", "p_draw", "p_away"]] = (
            df.loc[bad, ["p_home", "p_draw", "p_away"]].div(s[bad], axis=0))
    df = df.dropna(subset=["p_home", "p_draw", "p_away"])
    df = df.drop_duplicates(["match_id", "model_id"])
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    df.to_csv(args.out, index=False)
    print(f"modelos: {sorted(df.model_id.unique())}")
    print(f"filas: {len(df):,} | partidos: {df.match_id.nunique():,} | -> {args.out}")


if __name__ == "__main__":
    main()
