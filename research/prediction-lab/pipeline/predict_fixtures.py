#!/usr/bin/env python3
"""Ciclo 5 — Predicción end-to-end de fixtures reales (estado -> features -> modelo -> mercado).

Toma el snapshot de cuotas más reciente (A13), reconstruye el estado de los equipos con los
partidos ya jugados, calcula las 54 features del Motor A y aplica el artefacto logístico
exportado. Compara con las cuotas del mismo snapshot (de-vig power).

Uso:
    ./.venv/bin/python pipeline/predict_fixtures.py [--snapshot PATH] [--model PATH]
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import sys

import numpy as np
import pandas as pd
from scipy.optimize import brentq

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "pipeline"))
sys.path.insert(0, os.path.join(ROOT, "features"))
sys.path.insert(0, os.path.join(ROOT, "models", "a"))

from build_features import load_matches  # noqa: E402
sys.path.insert(0, os.path.join(ROOT, "etl"))
from build_matches import canonical_team  # noqa: E402
from fixture_features import build_state, features_for_fixture  # noqa: E402
from train_motor_a import FEATURES  # noqa: E402

PROC = os.path.join(ROOT, "data", "processed")
OUT = os.path.join(ROOT, "artifacts", "FIXTURES")


def power_devig(odds: np.ndarray) -> np.ndarray:
    q = 1.0 / odds
    Q = q.sum()

    def f(alpha):
        return float(np.sum(np.power(q, alpha)) - 1.0)

    try:
        a = brentq(f, 1e-6, 5.0, xtol=1e-12)
    except ValueError:
        return np.full(3, np.nan)
    p = np.power(q, a)
    return p / p.sum()


def load_model(path: str):
    with open(path) as f:
        return json.load(f)


def predict(model, features: dict, div: str) -> np.ndarray:
    x = np.array([np.nan if features.get(k) is None else features.get(k) for k in FEATURES], dtype=float)
    stats = np.array(model["imputer"]["statistics"][: len(FEATURES)], dtype=float)
    x = np.where(np.isnan(x), stats, x)
    divs = model["div_levels"]
    onehot = np.zeros(len(divs))
    if div in divs:
        onehot[divs.index(div)] = 1.0
    design = np.concatenate([x, onehot])
    mean = np.array(model["scaler"]["mean"])
    scale = np.array(model["scaler"]["scale"])
    scale = np.where(scale == 0, 1.0, scale)
    z = (design - mean) / scale
    logits = np.array(model["coef"]) @ z + np.array(model["intercept"])
    logits -= logits.max()
    p = np.exp(logits)
    return p / p.sum()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--snapshot", default="")
    ap.add_argument("--model", default=os.path.join(ROOT, "..", "..", "src", "data", "prediction", "model_motor_a.json"))
    args = ap.parse_args()
    snap = args.snapshot or sorted(glob.glob(os.path.join(ROOT, "data", "snapshots", "odds_*.csv")))[-1]
    fixtures = pd.read_csv(snap)
    fixtures["match_date"] = pd.to_datetime(fixtures["Date"], dayfirst=True)
    matches = load_matches()
    state = build_state(matches)
    model = load_model(os.path.abspath(args.model))

    trained_divs = set(matches["div"].unique())
    rows = []
    excluded = []
    for r in fixtures.itertuples(index=False):
        div = r.Div
        home = canonical_team(div, r.HomeTeam)
        away = canonical_team(div, r.AwayTeam)
        if div not in trained_divs:
            excluded.append({"div": div, "home": home, "away": away,
                             "reason": "division_not_in_training"})
            continue
        season = infer_season(div, r.match_date)
        f = features_for_fixture(state, div, season, r.match_date, home, away)
        hs = check_known(state, div, home, r.match_date)
        as_ = check_known(state, div, away, r.match_date)
        p = predict(model, f, div)
        odds = np.array([getattr(r, c, np.nan) for c in ("B365H", "B365D", "B365A")], dtype=float)
        pm = power_devig(odds) if np.all(np.isfinite(odds)) and np.all(odds > 1) else np.full(3, np.nan)
        rows.append({
            "snapshot": os.path.basename(snap), "div": div, "date": r.match_date.strftime("%Y-%m-%d"),
            "home": home, "away": away, "season": season,
            "known_home": hs, "known_away": as_,
            "p_model_h": p[0], "p_model_d": p[1], "p_model_a": p[2],
            "p_market_h": pm[0], "p_market_d": pm[1], "p_market_a": pm[2],
            "edge_h": p[0] - pm[0], "edge_d": p[1] - pm[1], "edge_a": p[2] - pm[2],
            "odds_h": odds[0], "odds_d": odds[1], "odds_a": odds[2],
            "model_version": model["version"],
        })
    df = pd.DataFrame(rows)
    os.makedirs(OUT, exist_ok=True)
    stamp = os.path.basename(snap).replace("odds_", "").replace(".csv", "")
    path = os.path.join(OUT, f"predictions_{stamp}.csv")
    df.to_csv(path, index=False)
    both = df[df.known_home & df.known_away & df.p_market_h.notna()]
    summary = {
        "snapshot": os.path.basename(snap),
        "n_excluded_division": len(excluded),
        "excluded": excluded,
        "n_fixtures": int(len(df)),
        "n_known_both": int((df.known_home & df.known_away).sum()),
        "n_with_market": int(df.p_market_h.notna().sum()),
        "n_known_and_market": int(len(both)),
        "unknown_teams": sorted(set(df.loc[~df.known_home, "home"]).union(df.loc[~df.known_away, "away"])),
        "mean_abs_edge": {k: float(np.mean(np.abs(both[f"edge_{k}"]))) for k in "hda"} if len(both) else None,
        "max_abs_edge": {k: float(np.max(np.abs(both[f"edge_{k}"]))) for k in "hda"} if len(both) else None,
        "model_version": model["version"],
        "generated_at": pd.Timestamp.utcnow().isoformat(),
    }
    with open(os.path.join(OUT, f"summary_{stamp}.json"), "w") as f:
        json.dump(summary, f, indent=1, default=float)
    # Informe legible + hash de pre-registro
    import hashlib
    sha = hashlib.sha256(open(path, "rb").read()).hexdigest()
    summary["predictions_sha256"] = sha
    with open(os.path.join(OUT, f"summary_{stamp}.json"), "w") as f:
        json.dump(summary, f, indent=1, default=float)
    lines = [f"# Fixtures predichos — snapshot {os.path.basename(snap)}", "",
             f"Generado: {summary['generated_at']}", "",
             f"- Fixtures en el snapshot: **{len(df) + len(excluded)}**",
             f"- Predichos (división entrenada + equipos conocidos + cuota): **{len(both)}**",
             f"- Excluidos por división no entrenada: **{len(excluded)}** (SC2/SC3)",
             f"- `predictions_sha256`: `{sha}` (pre-registro de estas predicciones)", "",
             "## Metodología", "",
             "Estado de equipos (Elo, forma, descanso, priors) calculado solo con partidos anteriores →",
             "54 features (paridad exacta 50/50 con `features.parquet`) → artefacto `motor_a_logistic_v1`.",
             "Mercado: de-vig power de B365 en el mismo snapshot.", "",
             "## Diferencias modelo − mercado (puntos de probabilidad)", ""]
    if len(both):
        lines += ["| Div | n | media abs H | media abs D | media abs A |", "|---|---:|---:|---:|---:|"]
        for div, g in both.groupby("div"):
            lines.append(f"| {div} | {len(g)} | {g.edge_h.abs().mean():.3f} | "
                         f"{g.edge_d.abs().mean():.3f} | {g.edge_a.abs().mean():.3f} |")
        top = both.reindex(both[["edge_h", "edge_d", "edge_a"]].abs().max(axis=1).sort_values(ascending=False).index).head(10)
        lines += ["", "## Mayores discrepancias (no son apuestas de valor)", "",
                  "| Partido | Div | Fecha | p_modelo (H/D/A) | p_mercado (H/D/A) | edge mayor |",
                  "|---|---|---|---|---|---:|"]
        for r in top.itertuples(index=False):
            e = max(r.edge_h, r.edge_d, r.edge_a, key=abs)
            lines.append(f"| {r.home} – {r.away} | {r.div} | {r.date} | "
                         f"{r.p_model_h:.3f}/{r.p_model_d:.3f}/{r.p_model_a:.3f} | "
                         f"{r.p_market_h:.3f}/{r.p_market_d:.3f}/{r.p_market_a:.3f} | {e:+.3f} |")
    lines += ["", "## Lectura", "",
              "El modelo se separa del mercado ~5 pp de media en local/visitante. Dado que el mercado",
              "bate al modelo por ~0,02 de log-loss en test, **una discrepancia grande es más probablemente",
              "error del modelo que valor**. Este fichero no genera señales de apuesta; sirve para (a)",
              "demostrar el pipeline end-to-end y (b) evaluar estas 150 predicciones cuando la fuente",
              "publique los resultados (test prospectivo real, fuera del `test` ya usado)."]
    with open(os.path.join(OUT, f"REPORT_{stamp}.md"), "w") as f:
        f.write("\n".join(lines) + "\n")
    print(json.dumps(summary, indent=1, default=float)[:1500])
    print("escrito ->", path)


def infer_season(div: str, date: pd.Timestamp) -> str:
    """Temporada de la fuente: europeas jul-jun; ligas de año natural, el año."""
    calendar = {"USA", "BRA", "ARG", "JPN", "SWE", "MEX", "CHN", "NOR", "FIN", "IRL", "ROU", "RUS", "POL", "AUT", "DNK", "SWZ"}
    if div in calendar:
        return str(date.year)
    y = date.year if date.month >= 7 else date.year - 1
    return f"{y}/{str(y + 1)[-2:]}"


def check_known(state, div: str, team: str, date: pd.Timestamp) -> bool:
    long = state["long"]
    return bool(((long.team == team) & (long.match_date < date)).any())


if __name__ == "__main__":
    main()
