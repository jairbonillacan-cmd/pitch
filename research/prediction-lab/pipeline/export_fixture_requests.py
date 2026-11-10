#!/usr/bin/env python3
"""Ciclo 9 (v3.0) — Exporta peticiones de inferencia por fixture para el servicio TypeScript.

Cierra el camino de producto (`PitchLab Tachyon v3.0`): el pipeline Python calcula el vector de features
causales de 3ª generación para cada fixture y emite `prediction_request` consumible por
`src/domain/prediction/service.ts`.
Incluye:
  - `probsPython`: probabilidades puras del modelo logístico (`paridad <= 1e-12` con `predictMotorA`).
  - `lineupAvailabilityDelta` y `probsPythonWithAvailability`: ajuste prospectivo live desde
    `ws_live_inference_context.json` (`compute_lineup_availability_delta`).

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
from fixture_features import (  # noqa: E402
    build_state,
    compute_lineup_availability_delta,
    features_for_fixture,
    load_live_inference_team_map,
)
from predict_fixtures import infer_season, power_devig  # noqa: E402
import train_motor_a as tma  # noqa: E402

SRC = os.path.join(ROOT, "..", "..", "src", "data", "prediction")
OUT = os.path.join(SRC, "fixture_requests.json")


def _compute_logits(model: dict, feat_list: list[float | None], div: str, n_base: int) -> np.ndarray:
    x = np.array([np.nan if v is None else v for v in feat_list], dtype=float)
    stats = np.array(model["imputer"]["statistics"][:n_base], dtype=float)
    x = np.where(np.isnan(x), stats, x)
    onehot = np.zeros(len(model["div_levels"]))
    if div in model["div_levels"]:
        onehot[model["div_levels"].index(div)] = 1.0
    design = np.concatenate([x, onehot])
    mean = np.array(model["scaler"]["mean"])
    scale = np.array(model["scaler"]["scale"])
    scale = np.where(scale == 0, 1.0, scale)
    z = (design - mean) / scale
    return np.array(model["coef"]) @ z + np.array(model["intercept"])


def _softmax(logits: np.ndarray) -> list[float]:
    shifted = logits - logits.max()
    p = np.exp(shifted)
    return [float(v) for v in (p / p.sum())]


def predict(model: dict, feat_list: list[float | None], div: str, n_base: int) -> list[float]:
    return _softmax(_compute_logits(model, feat_list, div, n_base))


def predict_with_availability(
    model: dict,
    feat_list: list[float | None],
    div: str,
    n_base: int,
    availability_delta: float,
) -> list[float]:
    logits = _compute_logits(model, feat_list, div, n_base)
    prior_cfg = model.get("prospective_availability_prior") or {}
    ls = prior_cfg.get("logit_shift") or {}
    mh = float(ls.get("home_multiplier", 0.5))
    md = float(ls.get("draw_multiplier", 0.0))
    ma = float(ls.get("away_multiplier", -0.5))
    adj = logits + np.array([mh * availability_delta, md * availability_delta, ma * availability_delta], dtype=float)
    return _softmax(adj)


def main():
    features_order = list(tma.FEATURES)
    n_base = len(features_order)

    snaps = sorted(glob.glob(os.path.join(ROOT, "data", "snapshots", "odds_*.csv")))
    matches = load_matches()
    state = build_state(matches)
    live_team_map = load_live_inference_team_map()
    trained_divs = set(matches["div"].unique())
    with open(os.path.join(SRC, "model_motor_a.json"), encoding="utf-8") as f:
        model = json.load(f)
    prior_cfg = model.get("prospective_availability_prior")

    def _build_entry(div: str, season: str, mdate: pd.Timestamp, home: str, away: str, pm) -> dict:
        f_map = features_for_fixture(state, div, season, mdate, home, away)
        feat_list = [None if pd.isna(f_map.get(k)) else round(float(f_map.get(k)), 12) for k in features_order]
        h_ctx = live_team_map.get((div, home))
        a_ctx = live_team_map.get((div, away))
        avail = compute_lineup_availability_delta(h_ctx, a_ctx, config=prior_cfg)
        delta = float(avail["lineup_availability_delta"])
        probs_pure = predict(model, feat_list, div, n_base)
        probs_live = predict_with_availability(model, feat_list, div, n_base, delta)
        return {
            "div": div,
            "season": season,
            "date": mdate.strftime("%Y-%m-%d"),
            "home": home,
            "away": away,
            "features": feat_list,
            "divOnehot": [1.0 if div == d else 0.0 for d in model["div_levels"]],
            "marketProbs": None if pm is None else [round(float(x), 12) for x in pm],
            "probsPython": [round(x, 12) for x in probs_pure],
            "lineupAvailabilityDelta": round(delta, 12),
            "probsPythonWithAvailability": [round(x, 12) for x in probs_live],
        }

    rows = {}
    if snaps:
        snap = snaps[-1]
        source_snapshot = os.path.basename(snap)
        fixtures = pd.read_csv(snap)
        fixtures["match_date"] = pd.to_datetime(fixtures["Date"], dayfirst=True)
        for r in fixtures.itertuples(index=False):
            div = r.Div
            if div not in trained_divs:
                continue
            home = canonical_team(div, r.HomeTeam)
            away = canonical_team(div, r.AwayTeam)
            season = infer_season(div, r.match_date)
            known = all(
                ((state["long"].team == t) & (state["long"].match_date < r.match_date)).any()
                for t in (home, away)
            )
            if not known:
                continue
            odds = [getattr(r, c, np.nan) for c in ("B365H", "B365D", "B365A")]
            pm = power_devig(np.array(odds, dtype=float)) if all(np.isfinite(odds)) else None
            key = f"{div}:{r.match_date:%Y%m%d}:{home}:{away}"
            rows[key] = _build_entry(div, season, r.match_date, home, away, pm)
    else:
        fix_csv = sorted(glob.glob(os.path.join(ROOT, "artifacts", "FIXTURES", "predictions_*.csv")))[-1]
        df_fix = pd.read_csv(fix_csv)
        source_snapshot = (
            str(df_fix["snapshot"].iloc[0]) if "snapshot" in df_fix.columns else os.path.basename(fix_csv)
        )
        for r in df_fix.itertuples(index=False):
            if not (getattr(r, "known_home", True) and getattr(r, "known_away", True)):
                continue
            div = str(r.div)
            if div not in trained_divs:
                continue
            home = str(r.home)
            away = str(r.away)
            season = str(r.season)
            mdate = pd.to_datetime(r.date)
            odds = [getattr(r, c, np.nan) for c in ("odds_h", "odds_d", "odds_a")]
            pm = (
                power_devig(np.array(odds, dtype=float))
                if all(np.isfinite(odds)) and all(x > 1 for x in odds)
                else None
            )
            key = f"{div}:{mdate:%Y%m%d}:{home}:{away}"
            rows[key] = _build_entry(div, season, mdate, home, away, pm)

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(
            {
                "generated_at": pd.Timestamp.utcnow().isoformat(),
                "source_snapshot": source_snapshot,
                "n": len(rows),
                "requests": rows,
            },
            f,
            indent=1,
        )
    print(f"peticiones: {len(rows)} -> {OUT} ({os.path.getsize(OUT)/1e6:.2f} MB)", flush=True)


if __name__ == "__main__":
    main()
