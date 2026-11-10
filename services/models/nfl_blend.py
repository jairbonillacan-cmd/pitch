"""Blend del motor NFL (ratings) con un GBM situacional + invariantes físicos de sede (v3.0).

Lee las predicciones del benchmark (`nfl-ratings-predictions.jsonl`) y las features
pre-partido de `nfl-situational-features.jsonl` (o bien cae limpiamente a
`research/prediction-lab/data/nfl/processed/nfl_features.parquet` en `prediction-lab`),
incorpora invariantes físicos de sede (`altitude_diff_km`, `mile_high_shock`, `surface_turf`),
entrena un GBM walk-forward por temporada y evalúa el peso de mezcla con validación temporal.

Uso:
  python services/models/nfl_blend.py
  python services/models/nfl_blend.py --predictions <ruta> --features <ruta> --out-dir <dir>
  python services/models/nfl_blend.py --use-prediction-lab --dry-run

Soporta LightGBM cuando está instalado y cae limpiamente a `HistGradientBoostingClassifier`
de scikit-learn dentro del entorno `.venv` de `prediction-lab`.
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np

sys.stdout.reconfigure(encoding="utf-8")

try:
    import lightgbm as lgb  # type: ignore[import-untyped]
    HAS_LIGHTGBM = True
except ImportError:
    lgb = None
    HAS_LIGHTGBM = False
    from sklearn.ensemble import HistGradientBoostingClassifier

ROOT = Path(__file__).resolve().parents[2]

NFL_ELEVATION_M = {
    "ARI": 328.0, "ATL": 305.0, "BAL": 10.0, "BUF": 222.0, "CAR": 215.0, "CHI": 182.0,
    "CIN": 149.0, "CLE": 178.0, "DAL": 163.0, "DEN": 1588.0, "DET": 183.0, "GB": 195.0,
    "HOU": 15.0, "IND": 215.0, "JAX": 4.0, "KC": 250.0, "LA": 34.0, "LAC": 34.0,
    "LV": 615.0, "MIA": 3.0, "MIN": 254.0, "NE": 78.0, "NO": 1.0, "NYG": 2.0,
    "NYJ": 2.0, "PHI": 5.0, "PIT": 223.0, "SEA": 4.0, "SF": 14.0, "TB": 13.0,
    "TEN": 122.0, "WAS": 61.0, "STL": 142.0, "SD": 20.0, "OAK": 8.0,
}

FEATURES = [
    "rest_diff", "home_rest", "away_rest", "home_post_bye", "away_post_bye",
    "div_game", "is_dome", "is_outdoors", "temp", "wind", "is_cold", "is_windy",
    "rolling4_pts_for_diff", "rolling4_pts_against_diff", "rolling4_net_diff",
    "home_qb_shrunk_epa_per_att", "away_qb_shrunk_epa_per_att", "qb_shrunk_epa_diff", "week",
    "altitude_diff_km", "mile_high_shock", "surface_turf",
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


def _venue_invariants(home_team: str, away_team: str, neutral: bool, surface: str) -> tuple[float, float, float]:
    eh = NFL_ELEVATION_M.get(str(home_team or "").upper(), 100.0)
    ea = NFL_ELEVATION_M.get(str(away_team or "").upper(), 100.0)
    eh_eff = ea if neutral else eh
    alt_diff_km = (eh_eff - ea) / 1000.0
    mile_high = 1.0 if (not neutral and eh_eff >= 1500.0 and (eh_eff - ea) >= 1000.0) else 0.0
    is_turf = 1.0 if "turf" in str(surface or "").lower() else 0.0
    return alt_diff_km, mile_high, is_turf


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
            ht = row.get("home_team_abbr") or row.get("home_team") or ""
            at = row.get("away_team_abbr") or row.get("away_team") or ""
            neut = str(row.get("location", "Home")).lower() == "neutral"
            alt_km, mh_shock, surf_turf = _venue_invariants(ht, at, neut, str(row.get("surface") or ""))
            enriched = dict(row)
            enriched.setdefault("altitude_diff_km", alt_km)
            enriched.setdefault("mile_high_shock", mh_shock)
            enriched.setdefault("surface_turf", surf_turf)
            x = [float("nan") if enriched.get(name) is None else float(enriched[name]) for name in FEATURES]
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


def load_prediction_lab_games() -> list:
    """Carga el dataset canónico de `research/prediction-lab` cuando los `.jsonl` legacy no existen."""
    import pandas as pd

    pl_root = ROOT / "research" / "prediction-lab"
    sys.path.insert(0, str(pl_root / "models" / "nfl"))
    sys.path.insert(0, str(pl_root))
    from models import design_columns, fit_logit, make_design, predict_proba_3  # type: ignore[import-not-found]

    df = pd.read_parquet(pl_root / "data" / "nfl" / "processed" / "nfl_features.parquet")
    df = df[df["home_score"].notna() & df["away_score"].notna()].copy()
    df = df[(df["n_prior_home"] >= 3) & (df["n_prior_away"] >= 3)].reset_index(drop=True)
    df["y"] = df["result"].map({"H": 0, "T": 1, "A": 2}).astype(int)

    # Walk-forward ratings predictions (Minkowski v3.0 Logit)
    df["p_home_logit"] = np.nan
    cols = design_columns()
    for season in sorted(df["season"].unique()):
        if season < 2010:
            continue
        tr = df[(df["season"] >= 2002) & (df["season"] < season)]
        te = df[df["season"] == season]
        if len(tr) < 500 or len(te) == 0:
            continue
        X_tr, X_te = make_design(tr), make_design(te)
        y_tr = tr["y"].to_numpy(int)
        sw = 0.5 ** ((season - 1 - tr["season"].to_numpy(float)) / 10.0)
        p3 = predict_proba_3(fit_logit(X_tr, y_tr, C=0.008, sample_weight=sw), X_te, cols)
        df.loc[te.index, "p_home_logit"] = p3[:, 0]

    sub = df[df["p_home_logit"].notna()].copy()
    games = []
    for _, r in sub.iterrows():
        neut = float(r["neutral_site"]) > 0.5
        alt_km, mh_shock, surf_turf = _venue_invariants(str(r["home_team"]), str(r["away_team"]), neut, str(r["surface"]))
        is_dome = 1.0 if float(r["is_indoor"]) > 0.5 else 0.0
        temp_v = float(r["temp"]) if pd.notna(r.get("temp")) else 70.0
        wind_v = float(r["wind"]) if pd.notna(r.get("wind")) else 0.0
        x = [
            float(r["rest_diff"]),
            float(r["rest_home"]),
            float(r["rest_away"]),
            1.0 if float(r["rest_home"]) >= 13.0 else 0.0,
            1.0 if float(r["rest_away"]) >= 13.0 else 0.0,
            float(r["div_game"]),
            is_dome,
            1.0 - is_dome,
            temp_v,
            wind_v,
            1.0 if (is_dome == 0.0 and temp_v < 35.0) else 0.0,
            1.0 if (is_dome == 0.0 and wind_v >= 15.0) else 0.0,
            float(r["f5_pf_home"] - r["f5_pf_away"]),
            float(r["f5_pa_home"] - r["f5_pa_away"]),
            float(r["f5_diff_delta"]),
            float(r["qb_val_over_team_home"]) / 100.0,
            float(r["qb_val_over_team_away"]) / 100.0,
            float(r["qb_elo_diff"]) / 100.0,
            float(r["week"]),
            alt_km,
            mh_shock,
            surf_turf,
        ]
        mkt = None
        if pd.notna(r.get("home_moneyline")) and pd.notna(r.get("away_moneyline")):
            ml_h, ml_a = float(r["home_moneyline"]), float(r["away_moneyline"])
            ih = (-ml_h / (-ml_h + 100.0)) if ml_h < 0 else (100.0 / (ml_h + 100.0))
            ia = (-ml_a / (-ml_a + 100.0)) if ml_a < 0 else (100.0 / (ml_a + 100.0))
            if ih + ia > 0:
                mkt = ih / (ih + ia)
        y = int(r["y"])
        games.append(
            {
                "id": f"nfl:{r['game_id']}",
                "season": int(r["season"]),
                "x": x,
                "y": y,
                "tie": y == 1,
                "home_won": y == 0,
                "market": mkt,
                "ratings": float(r["p_home_logit"]),
            }
        )
    games.sort(key=lambda item: item["season"])
    return games


def _fit_predict_gbm(x_train: np.ndarray, y_train: np.ndarray, x_test: np.ndarray, rounds: int = 100) -> np.ndarray:
    if HAS_LIGHTGBM and lgb is not None:
        model = lgb.train(PARAMS, lgb.Dataset(x_train, label=y_train), num_boost_round=rounds)
        return np.asarray(model.predict(x_test), dtype=float)
    clf = HistGradientBoostingClassifier(
        learning_rate=0.03,
        max_leaf_nodes=7,
        min_samples_leaf=150,
        l2_regularization=5.0,
        max_iter=rounds,
        random_state=42,
    )
    clf.fit(x_train, y_train)
    probs = clf.predict_proba(x_test)
    if probs.shape[1] == 3:
        return probs
    out = np.zeros((len(x_test), 3), dtype=float)
    for col_idx, cls_id in enumerate(clf.classes_):
        out[:, int(cls_id)] = probs[:, col_idx]
    return out


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
        x_test = np.array([game["x"] for game in test], dtype=float)
        probabilities = _fit_predict_gbm(x_train, y_train, x_test, rounds=rounds)
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
    parser.add_argument("--use-prediction-lab", action="store_true", help="Evalúa directamente sobre nfl_features.parquet")
    parser.add_argument("--dry-run", action="store_true", help="Imprime métricas JSON sin sobreescribir reportes en disco")
    parser.add_argument("--save-artifact", action="store_true", help="Guarda el GBM final y su metadata")
    args = parser.parse_args()

    pred_p = Path(args.predictions)
    feat_p = Path(args.features)
    if args.use_prediction_lab or not (pred_p.exists() and feat_p.exists()):
        games = load_prediction_lab_games()
    else:
        predictions = load_predictions(pred_p)
        games = load_games(feat_p, predictions)

    add_gbm_predictions(games)
    data = [game for game in games if game["gbm_home"] is not None]

    validation = [game for game in data if game["season"] < SPLIT_SEASON]
    test = [game for game in data if game["season"] >= SPLIT_SEASON]
    weights = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 1.0]
    validation_losses = {weight: evaluate(weight, validation, include_ties=True) for weight in weights}
    best_weight = min(validation_losses, key=validation_losses.get)

    metrics = {
        "rows": len(data),
        "validation": len(validation),
        "test": len(test),
        "best_weight": best_weight,
        "backend": "lightgbm" if HAS_LIGHTGBM else "sklearn_hist_gbm",
        "venue_physics_features": ["altitude_diff_km", "mile_high_shock", "surface_turf"],
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

    if not args.dry_run:
        out_dir = Path(args.out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "nfl-blend.json").write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")
        ml = metrics["moneyline"]
        nt = metrics["non_ties"]
        lines = [
            "# Blend NFL: ratings + GBM situacional (Minkowski v3.0 Venue Physics)",
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
            "> El GBM usa features pre-partido del pipeline situacional + física de sede (altitud Mile High, domo, superficie).",
            "> El blend es un experimento research-only; no está integrado en el producto.",
        ]
        (out_dir / "NFL-BLEND.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    if args.save_artifact and HAS_LIGHTGBM and lgb is not None:
        from datetime import datetime, timezone

        artifact_dir = ROOT / "services" / "models" / "artifacts" / "nfl_blend"
        artifact_dir.mkdir(parents=True, exist_ok=True)
        x_all = np.array([game["x"] for game in data], dtype=float)
        y_all = np.array([game["y"] for game in data], dtype=int)
        final_model = lgb.train(PARAMS, lgb.Dataset(x_all, label=y_all), num_boost_round=100)
        final_model.save_model(str(artifact_dir / "model.txt"))
        metadata = {
            "schemaVersion": 2,
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
                "Modelo research-only: mezcla con el motor NFL Minkowski v3.0, no publicado en la app.",
                "Las features vienen del pipeline situacional + física de sede (rest, bye, clima, altitud, EPA de QB).",
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
