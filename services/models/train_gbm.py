#!/usr/bin/env python3
"""Entrena un GBM (LightGBM) sobre las features as-of exportadas por el benchmark.

Flujo:
  1. El benchmark de TypeScript exporta `Reportes/modelos/features-asof.jsonl` con una
     fila por partido evaluado: features, probabilidades de Dixon-Coles/Elo/mezcla,
     resultado y cuota de mercado sin vig.
  2. Este script entrena por liga con **walk-forward por temporada**: para la temporada S
     solo usa temporadas anteriores. Nunca ve el futuro.
  3. Compara el GBM contra Dixon-Coles, Elo, la mezcla 50/50 y el mercado en los mismos
     partidos, con bootstrap pareado para saber si la diferencia es concluyente.

Uso (con las dependencias locales de `services/models/.deps`):
    PYTHONPATH=services/models/.deps python services/models/train_gbm.py
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
from pathlib import Path

import numpy as np
import lightgbm as lgb

FEATURE_NAMES = [
    "elo_home",
    "elo_draw",
    "elo_away",
    "dc_home",
    "dc_draw",
    "dc_away",
    "rest_home",
    "rest_away",
    "form_home",
    "form_away",
    "shots_home",
    "shots_away",
    "xg_home",
    "xg_away",
]

TARGETS = ["home", "draw", "away"]


def safe_log(value: float) -> float:
    return -math.log(max(value, 1e-12))


def metrics(rows: list[dict], key: str) -> dict:
    losses = []
    brier = 0.0
    hits = 0
    for row in rows:
        probs = row[key]
        outcome = row["outcome"]
        losses.append(safe_log(probs[outcome]))
        for index in range(3):
            brier += (probs[index] - (1 if index == outcome else 0)) ** 2
        best = max(range(3), key=lambda index: probs[index])
        if best == outcome:
            hits += 1
    n = len(rows)
    if n == 0:
        return {"n": 0, "log_loss": 0.0, "brier": 0.0, "accuracy": 0.0}
    return {
        "n": n,
        "log_loss": sum(losses) / n,
        "brier": brier / n,
        "accuracy": hits / n,
    }


def paired_bootstrap(a: list[float], b: list[float], iterations: int = 2000, seed: int = 42) -> dict:
    if not a or not b:
        return {"mean_diff": 0.0, "lower": 0.0, "upper": 0.0}
    n = min(len(a), len(b))
    diffs = np.array([b[i] - a[i] for i in range(n)], dtype=float)
    rng = np.random.default_rng(seed)
    means = np.empty(iterations)
    for it in range(iterations):
        idx = rng.integers(0, n, n)
        means[it] = diffs[idx].mean()
    means.sort()
    return {
        "mean_diff": float(diffs.mean()),
        "lower": float(means[int(iterations * 0.025)]),
        "upper": float(means[int(iterations * 0.975)]),
    }


def feature_row(row: dict, league_index: dict[str, int]) -> list[float]:
    one_hot = [0.0] * len(league_index)
    one_hot[league_index[row["league"]]] = 1.0
    return list(row["features"]) + one_hot


def train_pooled(leagues: list[str], rows: list[dict], min_train_rows: int, rounds: int) -> dict:
    league_index = {league: index for index, league in enumerate(leagues)}
    season_rows: dict[str, list[dict]] = {}
    for row in rows:
        season_rows.setdefault(row["season"], []).append(row)
    seasons = sorted(season_rows)

    predictions: dict[str, list[dict]] = {league: [] for league in leagues}
    importance = np.zeros(len(FEATURE_NAMES) + len(leagues))
    models = 0

    for season in seasons:
        train = [row for season_key, group in season_rows.items() if season_key < season for row in group]
        test = season_rows.get(season, [])
        if len(train) < min_train_rows or not test:
            continue
        x_train = np.array([feature_row(row, league_index) for row in train], dtype=float)
        y_train = np.array([row["outcome"] for row in train], dtype=int)
        train_data = lgb.Dataset(x_train, label=y_train, free_raw_data=True)
        params = {
            "objective": "multiclass",
            "num_class": 3,
            "learning_rate": 0.03,
            "num_leaves": 7,
            "min_data_in_leaf": 150,
            "feature_fraction": 0.7,
            "bagging_fraction": 0.8,
            "bagging_freq": 1,
            "lambda_l2": 10.0,
            "verbosity": -1,
            "num_threads": 2,
            "seed": 42,
        }
        model = lgb.train(params, train_data, num_boost_round=rounds)
        importance += model.feature_importance(importance_type="gain")
        models += 1
        x_test = np.array([feature_row(row, league_index) for row in test], dtype=float)
        probabilities = model.predict(x_test)
        for row, probs in zip(test, probabilities, strict=True):
            predictions[row["league"]].append({**row, "gbm": [float(value) for value in probs]})

    results = []
    for league in leagues:
        predictions_league = predictions[league]
        if not predictions_league:
            results.append({"league": league, "rows": 0})
            continue
        gbm_metrics = metrics(predictions_league, "gbm")
        dc_metrics = metrics(predictions_league, "dc")
        elo_metrics = metrics(predictions_league, "elo")
        blend_metrics = metrics(predictions_league, "blend")
        with_market = [row for row in predictions_league if row.get("market")]
        market_metrics = metrics(with_market, "market") if with_market else {"n": 0}

        gbm_losses = [safe_log(row["gbm"][row["outcome"]]) for row in predictions_league]
        blend_losses = [safe_log(row["blend"][row["outcome"]]) for row in predictions_league]
        dc_losses = [safe_log(row["dc"][row["outcome"]]) for row in predictions_league]
        market_losses = [safe_log(row["market"][row["outcome"]]) for row in with_market]
        gbm_market_losses = [safe_log(row["gbm"][row["outcome"]]) for row in with_market]

        results.append(
            {
                "league": league,
                "rows": len(predictions_league),
                "seasons": models,
                "gbm": gbm_metrics,
                "dc": dc_metrics,
                "elo": elo_metrics,
                "blend": blend_metrics,
                "market": market_metrics,
                "gbm_vs_blend": paired_bootstrap(blend_losses, gbm_losses),
                "gbm_vs_dc": paired_bootstrap(dc_losses, gbm_losses),
                "gbm_vs_market": paired_bootstrap(market_losses, gbm_market_losses) if with_market else None,
                "importance": {
                    name: float(value / max(models, 1))
                    for name, value in zip(
                        FEATURE_NAMES + [f"league_{league_name}" for league_name in leagues],
                        importance,
                        strict=True,
                    )
                },
            }
        )
    return {"leagues": results, "models": models}


def render(report: dict) -> str:
    lines = [
        "# Benchmark GBM (LightGBM) sobre features as-of",
        "",
        f"Generado: {report['generated_at']}",
        "",
        "> Entrenamiento walk-forward por temporada: para cada temporada solo se usan las anteriores.",
        "> Evaluación retro: no cuenta como track record (`PREDICTION_ARCHITECTURE.md` §2).",
        "",
        "| Liga | n | GBM | DC | Elo | Mezcla | Mercado | Δ GBM−mezcla | Δ GBM−mercado |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for row in report["leagues"]:
        if row.get("rows", 0) == 0:
            continue
        delta_blend = row["gbm_vs_blend"]
        delta_market = row["gbm_vs_market"]
        market = row["market"].get("log_loss")
        lines.append(
            "| {league} | {n} | {gbm:.4f} | {dc:.4f} | {elo:.4f} | {blend:.4f} | {market} | {db:.4f} [{dl:.4f}, {du:.4f}] | {dm} |".format(
                league=row["league"],
                n=row["rows"],
                gbm=row["gbm"]["log_loss"],
                dc=row["dc"]["log_loss"],
                elo=row["elo"]["log_loss"],
                blend=row["blend"]["log_loss"],
                market=f"{market:.4f}" if market else "—",
                db=delta_blend["mean_diff"],
                dl=delta_blend["lower"],
                du=delta_blend["upper"],
                dm=(
                    f"{delta_market['mean_diff']:.4f} [{delta_market['lower']:.4f}, {delta_market['upper']:.4f}]"
                    if delta_market
                    else "—"
                ),
            )
        )
    lines.extend(
        [
            "",
            "## Importancia media de features (gain)",
            "",
            "| Feature | Ganancia media |",
            "|---|---:|",
        ]
    )
    total_importance = {}
    for row in report["leagues"]:
        for name, value in row.get("importance", {}).items():
            total_importance[name] = total_importance.get(name, 0.0) + value
    for name, value in sorted(total_importance.items(), key=lambda item: -item[1]):
        lines.append(f"| {name} | {value:.1f} |")
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--features", default="Reportes/modelos/features-asof.jsonl")
    parser.add_argument("--json", default="Reportes/modelos/backtest-gbm.json")
    parser.add_argument("--md", default="Reportes/modelos/BACKTEST-GBM.md")
    parser.add_argument("--min-train-rows", type=int, default=1200)
    parser.add_argument("--rounds", type=int, default=200)
    args = parser.parse_args()

    rows = []
    with Path(args.features).open(encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    if not rows:
        raise SystemExit(f"Sin filas en {args.features}")

    leagues = sorted({row["league"] for row in rows})
    pooled = train_pooled(leagues, rows, args.min_train_rows, args.rounds)
    report = {
        "generated_at": __import__("datetime").datetime.now(
            __import__("datetime").timezone.utc
        ).isoformat(),
        "features_file": args.features,
        "feature_names": FEATURE_NAMES,
        "models": pooled["models"],
        "leagues": pooled["leagues"],
    }

    Path(args.json).parent.mkdir(parents=True, exist_ok=True)
    Path(args.json).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    Path(args.md).parent.mkdir(parents=True, exist_ok=True)
    Path(args.md).write_text(render(report), encoding="utf-8")

    for row in report["leagues"]:
        if row.get("rows", 0) == 0:
            continue
        print(
            f"{row['league']}: n={row['rows']} GBM={row['gbm']['log_loss']:.4f} "
            f"blend={row['blend']['log_loss']:.4f} DC={row['dc']['log_loss']:.4f} "
            f"ΔGBM-blend={row['gbm_vs_blend']['mean_diff']:.4f} "
            f"[{row['gbm_vs_blend']['lower']:.4f}, {row['gbm_vs_blend']['upper']:.4f}]"
        )


if __name__ == "__main__":
    random.seed(42)
    main()
