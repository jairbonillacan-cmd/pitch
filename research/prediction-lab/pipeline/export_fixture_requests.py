#!/usr/bin/env python3
"""Ciclo 9 — Exporta peticiones de inferencia por fixture para el servicio TypeScript.

Cierra el camino de producto: el pipeline Python calcula el vector de features para un fixture y
emite un `prediction_request` que `src/domain/prediction/service.ts` puede servir tal cual.
Incluye `probs_python` para verificar la paridad TS↔Python por fixture.

Uso:
    ./.venv/bin/python pipeline/export_fixture_requests.py
Salida:
    src/data/prediction/fixture_requests.json
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
sys.path.insert(0, os.path.join(ROOT, "pipeline"))
sys.path.insert(0, os.path.join(ROOT, "features"))
sys.path.insert(0, os.path.join(ROOT, "models", "a"))
sys.path.insert(0, os.path.join(ROOT, "etl"))

from build_features import load_matches  # noqa: E402
from build_matches import canonical_team  # noqa: E402
from fixture_features import build_state, features_for_fixture  # noqa: E402
from predict_fixtures import infer_season, power_devig  # noqa: E402
from train_motor_a import FEATURES  # noqa: E402

SRC = os.path.join(ROOT, "..", "..", "src", "data", "prediction")
OUT = os.path.join(SRC, "fixture_requests.json")


def predict(model: dict, features: dict, div: str) -> list[float]:
    x = np.array([np.nan if features.get(k) is None else features.get(k) for k in FEATURES], dtype=float)
    stats = np.array(model["imputer"]["statistics"][: len(FEATURES)], dtype=float)
    x = np.where(np.isnan(x), stats, x)
    onehot = np.zeros(len(model["div_levels"]))
    if div in model["div_levels"]:
        onehot[model["div_levels"].index(div)] = 1.0
    design = np.concatenate([x, onehot])
    mean = np.array(model["scaler"]["mean"])
    scale = np.array(model["scaler"]["scale"])
    scale = np.where(scale == 0, 1.0, scale)
    z = (design - mean) / scale
    logits = np.array(model["coef"]) @ z + np.array(model["intercept"])
    logits -= logits.max()
    p = np.exp(logits)
    return [float(v) for v in (p / p.sum())]


def main():
    snap = sorted(glob.glob(os.path.join(ROOT, "data", "snapshots", "odds_*.csv")))[-1]
    fixtures = pd.read_csv(snap)
    fixtures["match_date"] = pd.to_datetime(fixtures["Date"], dayfirst=True)
    matches = load_matches()
    state = build_state(matches)
    trained_divs = set(matches["div"].unique())
    with open(os.path.join(SRC, "model_motor_a.json")) as f:
        model = json.load(f)

    rows = {}
    for r in fixtures.itertuples(index=False):
        div = r.Div
        if div not in trained_divs:
            continue
        home = canonical_team(div, r.HomeTeam)
        away = canonical_team(div, r.AwayTeam)
        season = infer_season(div, r.match_date)
        f = features_for_fixture(state, div, season, r.match_date, home, away)
        known = all(
            ((state["long"].team == t) & (state["long"].match_date < r.match_date)).any()
            for t in (home, away)
        )
        if not known:
            continue
        odds = [getattr(r, c, np.nan) for c in ("B365H", "B365D", "B365A")]
        pm = power_devig(np.array(odds, dtype=float)) if all(np.isfinite(odds)) else None
        key = f"{div}:{r.match_date:%Y%m%d}:{home}:{away}"
        rows[key] = {
            "div": div, "season": season, "date": r.match_date.strftime("%Y-%m-%d"),
            "home": home, "away": away,
            "features": [None if pd.isna(f.get(k)) else round(float(f.get(k)), 12) for k in FEATURES],
            "divOnehot": [1.0 if div == d else 0.0 for d in model["div_levels"]],
            "marketProbs": None if pm is None else [round(float(x), 12) for x in pm],
            "probsPython": [round(x, 12) for x in predict(model, f, div)],
        }
    with open(OUT, "w") as f:
        json.dump({"generated_at": pd.Timestamp.utcnow().isoformat(),
                   "source_snapshot": os.path.basename(snap),
                   "n": len(rows), "requests": rows}, f, indent=1)
    print(f"peticiones: {len(rows)} -> {OUT} ({os.path.getsize(OUT)/1e6:.2f} MB)")


if __name__ == "__main__":
    main()
