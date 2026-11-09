#!/usr/bin/env python3
"""Exporta el modelo de inferencia (Motor A) a JSON para consumirlo desde TypeScript.

Contenido de `model_motor_a.json`:
  - type: "multinomial_logistic"
  - features: nombres en orden
  - imputer: mediana por feature
  - scaler: media y escala por feature
  - coef: matriz 3 x (n_features + n_divs)
  - intercept: 3
  - div_levels: niveles de división (one-hot al final, en orden)
  - metadata: fecha, n, temporadas, semilla, métricas de validación, versión

Contenido de `features_snapshot.json`:
  - match_id -> {features: [...], probs_python: [...], div, season, match_date}
  para un conjunto de partidos (por defecto 2026/27) que permite verificar en TS que la
  implementación reproduce las probabilidades de Python.

Uso:
    ./.venv/bin/python pipeline/export_model.py --out artifacts/model_v1
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROC = os.path.join(ROOT, "data", "processed")
sys.path.insert(0, os.path.join(ROOT, "models", "a"))
from train_motor_a import FEATURES  # noqa: E402

SEED = 20261109


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="artifacts/model_v1")
    ap.add_argument("--snapshot-season", type=int, default=2026)
    ap.add_argument("--snapshot-n", type=int, default=200)
    args = ap.parse_args()
    outdir = args.out if os.path.isabs(args.out) else os.path.join(ROOT, args.out)
    os.makedirs(outdir, exist_ok=True)

    df = pd.read_parquet(os.path.join(PROC, "features.parquet"))
    df = df[df.y.notna()].copy()
    df["y"] = df.y.astype(int)
    df["sstart"] = df.season.astype(str).str[:4].astype(int)
    train = df[df.sstart <= 2026].copy()
    div_levels = sorted(train["div"].unique().tolist())

    def design(d):
        X = d[FEATURES].to_numpy(dtype=float)
        dummies = pd.get_dummies(d["div"], prefix="div").reindex(
            columns=[f"div_{x}" for x in div_levels], fill_value=0).to_numpy(dtype=float)
        return np.hstack([X, dummies])

    X = design(train)
    y = train.y.to_numpy()
    imp = SimpleImputer(strategy="median").fit(X)
    sc = StandardScaler().fit(imp.transform(X))
    lr = LogisticRegression(max_iter=5000, C=1.0).fit(sc.transform(imp.transform(X)), y)
    probs_train = lr.predict_proba(sc.transform(imp.transform(X)))

    cols = FEATURES + [f"div_{x}" for x in div_levels]
    model = {
        "type": "multinomial_logistic",
        "version": "1.0.0",
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "seed": SEED,
        "features": cols,
        "n_features_base": len(FEATURES),
        "div_levels": div_levels,
        "imputer": {"strategy": "median", "statistics": imp.statistics_.tolist()},
        "scaler": {"mean": sc.mean_.tolist(), "scale": sc.scale_.tolist()},
        "coef": lr.coef_.tolist(),
        "intercept": lr.intercept_.tolist(),
        "classes": [int(c) for c in lr.classes_],
        "metadata": {
            "trained_on": "features.parquet v1.1 (priors causales)",
            "n_matches": int(len(train)),
            "seasons": [str(train.season.min()), str(train.season.max())],
            "target": "0=H, 1=D, 2=A",
            "train_log_loss": float(-np.mean(np.log(probs_train[np.arange(len(y)), y]))),
            "notes": "Features precalculadas por el pipeline Python; TS solo aplica imputer+scaler+softmax.",
        },
    }
    model["dataset_sha256"] = hashlib.sha256(
        open(os.path.join(PROC, "features.parquet"), "rb").read(1 << 20)).hexdigest()
    with open(os.path.join(outdir, "model_motor_a.json"), "w") as f:
        json.dump(model, f, indent=1)

    # Snapshot verificable (partidos de la temporada en curso)
    snap = df[df.sstart == args.snapshot_season].copy()
    if len(snap) > args.snapshot_n:
        snap = snap.sample(n=args.snapshot_n, random_state=SEED)
    Xs = design(snap)
    ps = lr.predict_proba(sc.transform(imp.transform(Xs)))
    rows = {}
    for i, (_, r) in enumerate(snap.iterrows()):
        rows[r.match_id] = {
            "div": r["div"], "season": str(r.season), "match_date": str(r.match_date)[:10],
            "features": [None if pd.isna(v) else float(v) for v in r[FEATURES].tolist()],
            "div_onehot": [1.0 if r["div"] == d else 0.0 for d in div_levels],
            "probs_python": [round(float(x), 12) for x in ps[i]],
        }
    with open(os.path.join(outdir, "features_snapshot.json"), "w") as f:
        json.dump({"generated_at": model["created_at"], "n": len(rows), "rows": rows}, f, indent=1)
    print(f"modelo: {len(train):,} partidos, {len(cols)} columnas | train log-loss={model['metadata']['train_log_loss']:.5f}")
    print(f"escrito -> {outdir}/model_motor_a.json ({os.path.getsize(os.path.join(outdir,'model_motor_a.json'))/1e6:.2f} MB)")
    print(f"snapshot -> {outdir}/features_snapshot.json ({len(rows)} partidos)")


if __name__ == "__main__":
    main()
