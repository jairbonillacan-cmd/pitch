#!/usr/bin/env python3
"""Exporta el modelo NFL (PitchLab Minkowski v2.0) a JSON para inferencia TypeScript.

Reutiliza el pipeline de A12 (`models/nfl/{config,features,models}.py`) sin modificarlo.
Entrena con todas las temporadas <= 2025 y guarda:
  artifacts/model_nfl/model_nfl.json
  artifacts/model_nfl/nfl_snapshot.json   (200 partidos de 2025 con probs de Python)

Uso:
    ./.venv/bin/python pipeline/export_model_nfl.py
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NFL = os.path.join(ROOT, "models", "nfl")
sys.path.insert(0, NFL)
sys.path.insert(0, ROOT)


from features import NUMERIC_FEATURES  # noqa: E402
from models import design_columns, fit_logit, make_design, predict_proba_3  # noqa: E402

SEED = 20261109


def chosen_c() -> float:
    p = os.path.join(NFL, "artifacts", "config_used.json")
    with open(p) as f:
        return float(json.load(f)["logit_c"])


def main():
    out = os.path.join(ROOT, "artifacts", "model_nfl")
    os.makedirs(out, exist_ok=True)
    df = pd.read_parquet(os.path.join(ROOT, "data", "nfl", "processed", "nfl_features.parquet"))
    df = df[df["home_score"].notna() & df["away_score"].notna()].copy()
    ymap = {"H": 0, "T": 1, "A": 2}
    df["y"] = df["result"].map(ymap)
    df = df[df["y"].notna()].copy()
    df["y"] = df["y"].astype(int)
    df["season"] = df["season"].astype(int)
    train = df[df.season <= 2025].copy()
    X = make_design(train)
    y = train["y"].to_numpy()
    model = fit_logit(X, y, C=chosen_c())
    probs = predict_proba_3(model, X, design_columns())

    scaler = model.named_steps["scale"]
    clf = model.named_steps["clf"]
    artifact = {
        "sport": "nfl",
        "type": "multinomial_logistic",
        "codename": "PitchLab Minkowski v2.0",
        "version": "1.0.0",
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "seed": SEED,
        "features": design_columns(),
        "n_features": len(design_columns()),
        "scaler": {"mean": scaler.mean_.tolist(), "scale": scaler.scale_.tolist()},
        "coef": clf.coef_.tolist(),
        "intercept": clf.intercept_.tolist(),
        "classes": [int(c) for c in clf.classes_],
        "class_map": {"0": "H", "1": "T", "2": "A"},
        "metadata": {
            "source": "nflverse games.csv + nfl_features.parquet (CC BY 4.0)",
            "n_matches": int(len(train)),
            "seasons": [int(train.season.min()), int(train.season.max())],
            "train_log_loss": float(-np.mean(np.log(probs[np.arange(len(y)), y]))),
            "tie_rate": float((y == 1).mean()),
            "notes": "PitchLab Minkowski v2.0: Features precalculadas por models/nfl/features.py con QB Elo y continuidad.",
        },
    }
    with open(os.path.join(out, "model_nfl.json"), "w", encoding="utf-8") as f:
        json.dump(artifact, f, indent=1)

    snap = df[df.season == 2025].sample(n=min(200, int((df.season == 2025).sum())), random_state=SEED)
    Xs = make_design(snap)
    ps = predict_proba_3(model, Xs, design_columns())
    rows = {}
    for i, (_, r) in enumerate(snap.iterrows()):
        rows[r.game_id] = {
            "season": int(r.season), "week": int(r.week), "home_team": r.home_team,
            "away_team": r.away_team,
            "features": [None if pd.isna(v) else float(v) for v in Xs.iloc[i].tolist()],
            "probs_python": [round(float(x), 12) for x in ps[i]],
        }
    with open(os.path.join(out, "nfl_snapshot.json"), "w", encoding="utf-8") as f:
        json.dump({"generated_at": artifact["created_at"], "n": len(rows), "rows": rows}, f, indent=1)
    print(f"NFL modelo: {len(train):,} partidos | train log-loss={artifact['metadata']['train_log_loss']:.5f} "
          f"| tie_rate={artifact['metadata']['tie_rate']:.4f}")
    print(f"escrito -> {out}/model_nfl.json y nfl_snapshot.json ({len(rows)} partidos)")


if __name__ == "__main__":
    main()
