#!/usr/bin/env python3
"""Exporta el modelo de inferencia (`PitchLab Tachyon v3.0`) a JSON para consumirlo desde TypeScript.

Contenido de `model_motor_a.json`:
  - type: "multinomial_logistic"
  - codename: "PitchLab Tachyon v3.0"
  - version: "3.0.0"
  - features: nombres en orden (`n_features_base` + niveles de división)
  - imputer: mediana por feature
  - scaler: media y escala por feature
  - coef: matriz 3 x (n_features + n_divs)
  - intercept: 3
  - div_levels: niveles de división (one-hot al final, en orden)
  - prospective_availability_prior: hiperparámetros exactos de `compute_lineup_availability_delta`
    para paridad `< 1e-12` entre Python y TypeScript (`engine.ts` / `service.ts`)
  - metadata: fecha, n, temporadas, semilla, métricas de entrenamiento, versión

Uso:
    ./.venv/bin/python pipeline/export_model.py --out ../../src/data/prediction
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")

import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROC = os.path.join(ROOT, "data", "processed")
sys.path.insert(0, os.path.join(ROOT, "models", "a"))
sys.path.insert(0, os.path.join(ROOT, "pipeline"))

from fixture_features import PROSPECTIVE_AVAILABILITY_PRIOR_CONFIG  # noqa: E402
import train_motor_a as tma  # noqa: E402

SEED = 20261109


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join("..", "..", "src", "data", "prediction"))
    ap.add_argument("--snapshot-season", type=int, default=2026)
    ap.add_argument("--snapshot-n", type=int, default=200)
    args = ap.parse_args()
    outdir = args.out if os.path.isabs(args.out) else os.path.join(ROOT, args.out)
    os.makedirs(outdir, exist_ok=True)

    features = list(tma.FEATURES)
    logit_c = float(getattr(tma, "LOGIT_C", 0.05))

    df = pd.read_parquet(os.path.join(PROC, "features.parquet"))
    df = df[df.y.notna()].copy()
    df["y"] = df.y.astype(int)
    df["sstart"] = df.season.astype(str).str[:4].astype(int)
    div_levels = sorted(df[df.sstart <= 2026]["div"].unique().tolist())
    train = df[(df.sstart >= 2014) & (df.sstart <= 2026)].copy()

    def design(d):
        X = d[features].to_numpy(dtype=float)
        dummies = (
            pd.get_dummies(d["div"], prefix="div")
            .reindex(columns=[f"div_{x}" for x in div_levels], fill_value=0)
            .to_numpy(dtype=float)
        )
        return np.hstack([X, dummies])

    X = design(train)
    y = train.y.to_numpy()
    train["match_date"] = pd.to_datetime(train["match_date"])
    days = (train.match_date.max() - train.match_date).dt.days.to_numpy(dtype=float)
    sw = 0.5 ** (days / 1460.0)
    imp = SimpleImputer(strategy="median").fit(X)
    sc = StandardScaler().fit(imp.transform(X))
    lr = LogisticRegression(max_iter=2000, tol=1e-4, C=logit_c).fit(
        sc.transform(imp.transform(X)), y, sample_weight=sw
    )
    probs_train = lr.predict_proba(sc.transform(imp.transform(X)))

    cols = features + [f"div_{x}" for x in div_levels]
    model = {
        "type": "multinomial_logistic",
        "codename": "PitchLab Tachyon v3.0",
        "version": "3.0.0",
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "seed": SEED,
        "regularization_C": logit_c,
        "features": cols,
        "n_features_base": len(features),
        "div_levels": div_levels,
        "imputer": {"strategy": "median", "statistics": imp.statistics_.tolist()},
        "scaler": {"mean": sc.mean_.tolist(), "scale": sc.scale_.tolist()},
        "coef": lr.coef_.tolist(),
        "intercept": lr.intercept_.tolist(),
        "classes": [int(c) for c in lr.classes_],
        "prospective_availability_prior": PROSPECTIVE_AVAILABILITY_PRIOR_CONFIG,
        "metadata": {
            "trained_on": (
                "features.parquet v3.0 (Real xG > Shot Proxy + xG-Elo + Clinical xPTS Luck Gap + "
                "Understat PPDA/Deep-Completions + Invariant Stadium Altitude Physics + "
                "Pi-Ratings + Log-Dixon-Coles + Opta-Proxies)"
            ),
            "n_matches": int(len(train)),
            "seasons": [str(train.season.min()), str(train.season.max())],
            "target": "0=H, 1=D, 2=A",
            "train_log_loss": float(-np.mean(np.log(probs_train[np.arange(len(y)), y]))),
            "notes": (
                "PitchLab Tachyon v3.0: features causales precalculadas por Python; "
                "TS aplica imputer+scaler+softmax (+ prospective_availability_prior opcional en live) "
                "con paridad <=1e-12."
            ),
        },
    }
    model["dataset_sha256"] = hashlib.sha256(
        open(os.path.join(PROC, "features.parquet"), "rb").read(1 << 20)
    ).hexdigest()
    with open(os.path.join(outdir, "model_motor_a.json"), "w", encoding="utf-8") as f:
        json.dump(model, f, indent=1)

    snap = df[df.sstart == args.snapshot_season].copy()
    if len(snap) > args.snapshot_n:
        snap = snap.sample(n=args.snapshot_n, random_state=SEED)
    Xs = design(snap)
    ps = lr.predict_proba(sc.transform(imp.transform(Xs)))
    rows = {}
    for i, (_, r) in enumerate(snap.iterrows()):
        rows[r.match_id] = {
            "div": r["div"],
            "season": str(r.season),
            "match_date": str(r.match_date)[:10],
            "features": [None if pd.isna(v) else float(v) for v in r[features].tolist()],
            "div_onehot": [1.0 if r["div"] == d else 0.0 for d in div_levels],
            "probs_python": [round(float(x), 12) for x in ps[i]],
        }
    with open(os.path.join(outdir, "features_snapshot.json"), "w", encoding="utf-8") as f:
        json.dump({"generated_at": model["created_at"], "n": len(rows), "rows": rows}, f, indent=1)
    print(
        f"modelo: {len(train):,} partidos, {len(cols)} columnas ({len(features)} base + {len(div_levels)} divs) "
        f"| C={logit_c} | train log-loss={model['metadata']['train_log_loss']:.5f}",
        flush=True,
    )
    print(
        f"escrito -> {outdir}/model_motor_a.json ({os.path.getsize(os.path.join(outdir,'model_motor_a.json'))/1e6:.2f} MB)",
        flush=True,
    )
    print(f"snapshot -> {outdir}/features_snapshot.json ({len(rows)} partidos)", flush=True)


if __name__ == "__main__":
    main()
