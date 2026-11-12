"""Blend del motor NFL (ratings) con un GBM situacional.

Lee las predicciones del benchmark (`nfl-ratings-predictions.jsonl`) y las features
pre-partido de `nfl-situational-features.jsonl`, entrena un LightGBM walk-forward por
temporada y evalúa el peso de mezcla con validación temporal.

Uso:
  python services/models/nfl_blend.py
  python services/models/nfl_blend.py --predictions <ruta> --features <ruta> --out-dir <dir>

Requiere LightGBM y numpy (ver `services/models/requirements.txt`).
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np

sys.stdout.reconfigure(encoding="utf-8")

import lightgbm as lgb

ROOT = Path(__file__).resolve().parents[2]

FEATURES = [
    "rest_diff", "home_rest", "away_rest", "home_post_bye", "away_post_bye",
    "div_game", "is_dome", "is_outdoors", "temp", "wind", "is_cold", "is_windy",
    "rolling4_pts_for_diff", "rolling4_pts_against_diff", "rolling4_net_diff",
    "home_qb_shrunk_epa_per_att", "away_qb_shrunk_epa_per_att", "qb_shrunk_epa_diff", "week",
]

PARAMS = {
    "objective": "multiclass",
    "num_class": 3,
    "learning_rate": 0.03,
    "num_leaves": 7,
    "min_data_in_leaf": 200,
    "feature_fraction": 0.8,
    "bagging_fraction": 0.8,
    "bagging_freq": 1,
    "lambda_l2": 5.0,
    "verbosity": -1,
    "num_threads": 2,
    "seed": 42,
}
SPLIT_SEASON = 2020


def load_predictions(path: Path) -> dict:
    predictions = {}
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                row = json.loads(line)
                predictions[row["id"]] = row
    return predictions


def load_games(features_path: Path, predictions: dict) -> list:
    games = []
    with features_path.open(encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            row = json.loads(line)
            if row.get("id") not in predictions:
                continue
            if row.get("result") is None:
                continue
            home_won = row["result"] > 0
            tie = row["result"] == 0
            y = 0 if home_won else (1 if tie else 2)
            x = [float("nan") if row.get(name) is None else float(row[name]) for name in FEATURES]
            market = None
            if row.get("implied_prob_home") is not None and row.get("implied_prob_away") is not None:
                total = row["implied_prob_home"] + row["implied_prob_away"]
                if total > 0:
                    market = row["implied_prob_home"] / total
            games.append(
                {
                    "id": row["id"],
                    "season": int(row["season"]),
                    "x": x,
                    "y": y,
                    "tie": tie,
                    "home_won": home_won,
                    "market": market,
                    "ratings": predictions[row["id"]]["pHome"],
                }
            )
    games.sort(key=lambda item: item["season"])
    return games


def add_gbm_predictions(games: list, rounds: int = 100) -> None:
    seasons = sorted({game["season"] for game in games})
    for game in games:
        game["gbm_home"] = None
        game["gbm_binary"] = None
    for season in seasons:
        train = [game for game in games if game["season"] < season]
        test = [game for game in games if game["season"] == season]
        if len(train) < 500 or not test:
            continue
        x_train = np.array([game["x"] for game in train], dtype=float)
        y_train = np.array([game["y"] for game in train], dtype=int)
        model = lgb.train(PARAMS, lgb.Dataset(x_train, label=y_train), num_boost_round=rounds)
        probabilities = model.predict(np.array([game["x"] for game in test], dtype=float))
        for game, probs in zip(test, probabilities, strict=True):
            game["gbm_home"] = float(probs[0])
            game["gbm_binary"] = float(probs[0] / max(probs[0] + probs[2], 1e-9))


def binary_loss(prob: float, y: int) -> float:
    return -np.log(min(max(prob if y == 0 else 1 - prob, 1e-9), 1 - 1e-9))


def evaluate(weight: float, subset: list, include_ties: bool = True) -> float:
    """LogLoss binario: gana local vs no gana local (los empates cuentan como no-local)."""
    losses = []
    for game in subset:
        if not include_ties and game["tie"]:
            continue
        gbm = game["gbm_home"] if include_ties else game["gbm_binary"]
        prob = weight * game["ratings"] + (1 - weight) * gbm
        losses.append(binary_loss(prob, 0 if game["home_won"] else 1))
    return float(np.mean(losses))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--predictions", default=str(ROOT / "Reportes" / "modelos" / "nfl-ratings-predictions.jsonl"))
    parser.add_argument("--features", default=str(ROOT / "data" / "history" / "nfl-situational-features.jsonl"))
    parser.add_argument("--out-dir", default=str(ROOT / "Reportes" / "modelos"))
    parser.add_argument("--save-artifact", action="store_true", help="Guarda el GBM final y su metadata")
    args = parser.parse_args()

    predictions = load_predictions(Path(args.predictions))
    games = load_games(Path(args.features), predictions)
    add_gbm_predictions(games)
    data = [game for game in games if game["gbm_home"] is not None]

    validation = [game for game in data if game["season"] < SPLIT_SEASON]
    test = [game for game in data if game["season"] >= SPLIT_SEASON]
    weights = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1.0]
    validation_losses = {weight: evaluate(weight, validation, include_ties=True) for weight in weights}
    best_weight = min(validation_losses, key=validation_losses.get)

    metrics = {
        "rows": len(data),
        "validation": len(validation),
        "test": len(test),
        "best_weight": best_weight,
        "moneyline": {
            "ratings_test": evaluate(1.0, test, include_ties=True),
            "gbm_test": evaluate(0.0, test, include_ties=True),
            "blend_test": evaluate(best_weight, test, include_ties=True),
            "market_test": float(
                np.mean([binary_loss(game["market"], 0 if game["home_won"] else 1) for game in test if game["market"] is not None])
            ),
        },
        "non_ties": {
            "ratings_test": evaluate(1.0, test, include_ties=False),
            "gbm_test": evaluate(0.0, test, include_ties=False),
            "blend_test": evaluate(best_weight, test, include_ties=False),
            "market_test": float(
                np.mean(
                    [
                        binary_loss(game["market"], 0 if game["home_won"] else 1)
                        for game in test
                        if game["market"] is not None and not game["tie"]
                    ]
                )
            ),
        },
        "validation_losses": validation_losses,
    }

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "nfl-blend.json").write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")
    ml = metrics["moneyline"]
    nt = metrics["non_ties"]
    lines = [
        "# Blend NFL: ratings + GBM situacional",
        "",
        f"Filas alineadas: {metrics['rows']} · validación: {metrics['validation']} · test: {metrics['test']}",
        "",
        "| Candidato | Moneyline (empates = no local) | Sin empates |",
        "|---|---:|---:|",
        f"| Ratings | {ml['ratings_test']:.4f} | {nt['ratings_test']:.4f} |",
        f"| GBM situacional | {ml['gbm_test']:.4f} | {nt['gbm_test']:.4f} |",
        f"| **Blend (peso {best_weight:.1f} ratings)** | **{ml['blend_test']:.4f}** | **{nt['blend_test']:.4f}** |",
        f"| Mercado | {ml['market_test']:.4f} | {nt['market_test']:.4f} |",
        "",
        f"Peso elegido en validación (temporadas < {SPLIT_SEASON}): **{best_weight:.1f}**.",
        "",
        "> El GBM usa features pre-partido del pipeline situacional (descanso, bye, clima, EPA de QB).",
        "> El blend es un experimento research-only; no está integrado en el producto.",
    ]
    (out_dir / "NFL-BLEND.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    if args.save_artifact:
        from datetime import datetime, timezone

        artifact_dir = ROOT / "services" / "models" / "artifacts" / "nfl_blend"
        artifact_dir.mkdir(parents=True, exist_ok=True)
        x_all = np.array([game["x"] for game in data], dtype=float)
        y_all = np.array([game["y"] for game in data], dtype=int)
        final_model = lgb.train(PARAMS, lgb.Dataset(x_all, label=y_all), num_boost_round=100)
        final_model.save_model(str(artifact_dir / "model.txt"))
        metadata = {
            "schemaVersion": 1,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "features": FEATURES,
            "params": PARAMS,
            "rounds": 100,
            "seed": PARAMS["seed"],
            "rows": len(data),
            "maxSeason": max(game["season"] for game in data),
            "weightRatings": best_weight,
            "metrics": {"moneyline": metrics["moneyline"], "nonTies": metrics["non_ties"]},
            "notes": [
                "Modelo research-only: mezcla con el motor NFL de ratings, no publicado en la app.",
                "Las features vienen del pipeline situacional (rest, bye, clima, EPA de QB).",
                "pHomeBinario = pHome / (pHome + pAway); el blend usa weightRatings.",
            ],
        }
        (artifact_dir / "metadata.json").write_text(
            json.dumps(metadata, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        print(f"artefacto guardado en {artifact_dir}")

    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
