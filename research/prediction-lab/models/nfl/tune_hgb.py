"""Ajuste pequeño de HistGradientBoosting en VAL (2010-2019).

El HGB con la configuración inicial rinde claramente peor que el logit; antes de
reportarlo como resultado se busca en una rejilla modesta (8 configuraciones)
elegida por log-loss de VAL. Si ninguna mejora, el hallazgo es real y se
documenta como tal.

Escribe ``models/nfl/artifacts/hgb_tuning.json`` con la rejilla y el ganador.

Uso::

    ./.venv/bin/python models/nfl/tune_hgb.py
"""

from __future__ import annotations

import itertools
import json
import sys

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier

from config import ARTIFACTS_DIR, DATASET, FIRST_TRAIN_SEASON, LAB_ROOT, SEED, VAL_SEASONS
from features import build_features, drop_warmup
from models import make_design, predict_proba_3

if str(LAB_ROOT) not in sys.path:
    sys.path.insert(0, str(LAB_ROOT))

import eval.metrics as M  # noqa: E402

GRID = {
    "max_iter": (100, 200),
    "learning_rate": (0.03, 0.08),
    "max_leaf_nodes": (7, 15),
    "min_samples_leaf": (40,),
    "l2_regularization": (1.0,),
}


def main() -> int:
    sens = json.loads((ARTIFACTS_DIR / "sensitivity.json").read_text(encoding="utf-8"))
    cfg = sens["best"]
    games = pd.read_parquet(DATASET)
    feats = drop_warmup(build_features(games, elo_k=float(cfg["elo_k"]), elo_hfa=float(cfg["elo_hfa"])))

    folds = []
    for season in VAL_SEASONS:
        train = feats[(feats["season"] >= FIRST_TRAIN_SEASON) & (feats["season"] < season)]
        test = feats[feats["season"] == season]
        folds.append((make_design(train), train["y"].to_numpy(int), make_design(test), test["y"].to_numpy(int)))

    keys = list(GRID)
    rows = []
    for values in itertools.product(*(GRID[k] for k in keys)):
        params = dict(zip(keys, values))
        params.update({"early_stopping": False, "random_state": SEED})
        per_sample = []
        for X_train, y_train, X_test, y_test in folds:
            model = HistGradientBoostingClassifier(**params)
            model.fit(X_train.to_numpy(), y_train)
            p = predict_proba_3(model, X_test)
            per_sample.append(M.per_sample_log_loss(y_test, p))
        ll = float(np.mean(np.concatenate(per_sample)))
        rows.append({**params, "val_log_loss": ll})
        print(f"{params} -> {ll:.5f}")

    table = pd.DataFrame(rows).sort_values("val_log_loss").reset_index(drop=True)
    best = table.iloc[0].to_dict()
    best.pop("val_log_loss")
    payload = {
        "criterion": "log-loss medio en walk-forward VAL 2010-2019",
        "grid": {k: list(v) for k, v in GRID.items()},
        "n_configs": len(rows),
        "best_params": {k: (int(v) if float(v).is_integer() and k != "learning_rate" else float(v))
                        for k, v in best.items()},
        "best_val_log_loss": float(table.iloc[0]["val_log_loss"]),
        "baseline_val_log_loss": 0.72681,
        "full_table": table.to_dict(orient="records"),
    }
    (ARTIFACTS_DIR / "hgb_tuning.json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print("mejor:", payload["best_params"], payload["best_val_log_loss"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
