"""Walk-forward NFL: entrena con temporadas anteriores y predice la siguiente.

Un fold por temporada objetivo ``S``:
``train = [FIRST_TRAIN_SEASON, S-1]`` (expanding), ``test = S``. No hay
barajado, no hay ``train_test_split`` aleatorio y ninguna decisión de un fold
mira la temporada evaluada.

La tasa de empate que se inyecta al mercado 2-vías se calcula **en el train del
fold**, nunca en el test.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from config import FIRST_TRAIN_SEASON
from models import (
    class_frequencies,
    fit_hgb,
    fit_logit,
    fit_logit_elo,
    make_design,
    market_three_way,
    normalize_probs,
    predict_proba_3,
)

MODELS = ("base_freq", "logit_elo", "logit", "hgb", "blend", "market_prop", "market_power")


def run_fold(feats: pd.DataFrame, season: int, logit_c: float) -> pd.DataFrame:
    """Predicciones de una temporada; devuelve un DataFrame largo por modelo."""
    train = feats[(feats["season"] >= FIRST_TRAIN_SEASON) & (feats["season"] < season)]
    test = feats[feats["season"] == season]
    if len(train) < 500 or len(test) == 0:
        raise ValueError(f"fold {season}: train={len(train)} test={len(test)} insuficiente")

    X_train, X_test = make_design(train), make_design(test)
    y_train = train["y"].to_numpy(dtype=int)

    preds: dict[str, np.ndarray] = {}
    preds["base_freq"] = np.tile(class_frequencies(y_train), (len(test), 1))

    preds["logit_elo"] = predict_proba_3(fit_logit_elo(X_train, y_train), X_test, ["elo_diff"])
    preds["logit"] = predict_proba_3(fit_logit(X_train, y_train, logit_c), X_test)
    preds["hgb"] = predict_proba_3(fit_hgb(X_train, y_train), X_test)
    preds["blend"] = normalize_probs(0.5 * preds["logit"] + 0.5 * preds["hgb"])

    tie_rate = float(train["tie"].mean())
    for name, home_col, away_col in (
        ("market_prop", "home_ml_devig_prop", "away_ml_devig_prop"),
        ("market_power", "home_ml_devig_power", "away_ml_devig_power"),
    ):
        p = np.full((len(test), 3), np.nan)
        mask = test[home_col].notna().to_numpy() & test[away_col].notna().to_numpy()
        if mask.any():
            p[mask] = market_three_way(
                test[home_col].to_numpy()[mask], test[away_col].to_numpy()[mask], tie_rate
            )
        preds[name] = p

    frames = []
    base = test[["game_id", "season", "week", "gameday", "home_team", "away_team", "y", "result", "tie"]].copy()
    for name in MODELS:
        block = base.copy()
        block["model"] = name
        block["p_home"] = preds[name][:, 0]
        block["p_draw"] = preds[name][:, 1]
        block["p_away"] = preds[name][:, 2]
        frames.append(block)
    return pd.concat(frames, ignore_index=True)


def run_walk_forward(
    feats: pd.DataFrame,
    seasons,
    logit_c: float,
    progress: bool = False,
) -> pd.DataFrame:
    out = []
    for season in seasons:
        out.append(run_fold(feats, int(season), logit_c))
        if progress:
            print(f"  fold {season} ok ({len(out[-1])} filas)")
    return pd.concat(out, ignore_index=True)
