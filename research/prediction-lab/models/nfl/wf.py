"""Walk-forward NFL: entrena con temporadas anteriores y predice la siguiente.

Un fold por temporada objetivo ``S``:
``train = [FIRST_TRAIN_SEASON, S-1]`` (expanding), ``test = S``. No hay
barajado, no hay ``train_test_split`` aleatorio y ninguna decisión de un fold
mira la temporada evaluada.

Incluye ``market_hybrid`` (Motor C NFL): combina moneyline de-vig (Power),
probabilidad implícita del point spread (``spread_line``), geometría condicional
de empate en partidos cerrados y las predicciones del modelo deportivo ``logit``
con valor de Quarterback.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from config import FIRST_TRAIN_SEASON, TIE_RATE_FLOOR
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

MODELS = ("base_freq", "logit_elo", "logit", "hgb", "blend", "market_prop", "market_power", "market_hybrid")


def _build_market_hybrid(
    train: pd.DataFrame,
    test: pd.DataFrame,
    p_logit: np.ndarray,
    p_mkt_power: np.ndarray,
    tie_rate: float,
) -> np.ndarray:
    """Construye el predictor híbrido NFL (Spread + Moneyline Power + QB-Logit)."""
    n = len(test)
    out = p_logit.copy()
    has_mkt = np.isfinite(p_mkt_power).all(axis=1)
    if not has_mkt.any():
        return out

    # Calibrar pendiente de spread_line -> P(Home win | no tie) en train
    tr_sp = train["spread_line"].to_numpy(dtype=float)
    tr_y = train["y"].to_numpy(dtype=int)
    ok_tr = np.isfinite(tr_sp) & (tr_y != 1)
    # En la NFL, 1 punto de spread equivale a ~0.148 en log-odds
    beta_sp = 0.148
    if ok_tr.sum() > 200:
        # Ajuste fino de escala en train
        sp_v = tr_sp[ok_tr]
        hw_v = (tr_y[ok_tr] == 0).astype(float)
        best_b, best_ll = 0.148, 1e9
        for b in np.linspace(0.12, 0.18, 25):
            ph = 1.0 / (1.0 + np.exp(-b * sp_v))
            ll = -float(np.mean(hw_v * np.log(np.clip(ph, 1e-6, 1 - 1e-6)) + (1 - hw_v) * np.log(np.clip(1 - ph, 1e-6, 1 - 1e-6))))
            if ll < best_ll:
                best_ll, best_b = ll, float(b)
        beta_sp = best_b

    te_sp = test["spread_line"].to_numpy(dtype=float)
    p_sp_h = np.where(np.isfinite(te_sp), 1.0 / (1.0 + np.exp(-beta_sp * te_sp)), np.nan)

    # Tasa de empate condicional: los empates en NFL ocurren más en spreads cerrados (|spread| <= 3)
    tau_base = max(tie_rate, TIE_RATE_FLOOR)
    sp_abs = np.where(np.isfinite(te_sp), np.abs(te_sp), 5.0)
    closeness = np.exp(-((sp_abs / 6.5) ** 2))
    closeness_norm = closeness / max(1e-6, float(np.mean(closeness)))
    tau_vec = np.clip(tau_base * (0.5 + 0.5 * closeness_norm), TIE_RATE_FLOOR, 0.012)

    for i in np.where(has_mkt)[0]:
        pm = p_mkt_power[i]
        pm_2way_h = pm[0] / max(1e-9, pm[0] + pm[2])
        pa_2way_h = p_logit[i, 0] / max(1e-9, p_logit[i, 0] + p_logit[i, 2])
        if np.isfinite(p_sp_h[i]):
            # Consenso en espacio logit: 58% Moneyline Power + 34% Point Spread + 8% QB-Logit
            eps = 1e-6
            lm = np.log(np.clip(pm_2way_h, eps, 1 - eps) / np.clip(1 - pm_2way_h, eps, 1 - eps))
            ls = np.log(np.clip(p_sp_h[i], eps, 1 - eps) / np.clip(1 - p_sp_h[i], eps, 1 - eps))
            la = np.log(np.clip(pa_2way_h, eps, 1 - eps) / np.clip(1 - pa_2way_h, eps, 1 - eps))
            l_mix = 0.58 * lm + 0.34 * ls + 0.08 * la
            p_h_2way = 1.0 / (1.0 + np.exp(-l_mix))
        else:
            p_h_2way = 0.90 * pm_2way_h + 0.10 * pa_2way_h
        t_i = tau_vec[i]
        out[i, 0] = (1.0 - t_i) * p_h_2way
        out[i, 1] = t_i
        out[i, 2] = (1.0 - t_i) * (1.0 - p_h_2way)

    return normalize_probs(out)


def run_fold(feats: pd.DataFrame, season: int, logit_c: float) -> pd.DataFrame:
    """Predicciones de una temporada; devuelve un DataFrame largo por modelo."""
    train = feats[(feats["season"] >= FIRST_TRAIN_SEASON) & (feats["season"] < season)]
    test = feats[feats["season"] == season]
    if len(train) < 500 or len(test) == 0:
        raise ValueError(f"fold {season}: train={len(train)} test={len(test)} insuficiente")

    X_train, X_test = make_design(train), make_design(test)
    y_train = train["y"].to_numpy(dtype=int)
    sw = 0.5 ** ((season - 1 - train["season"].to_numpy(dtype=float)) / 10.0)

    preds: dict[str, np.ndarray] = {}
    preds["base_freq"] = np.tile(class_frequencies(y_train), (len(test), 1))

    preds["logit_elo"] = predict_proba_3(fit_logit_elo(X_train, y_train), X_test, ["elo_diff"])
    preds["logit"] = predict_proba_3(fit_logit(X_train, y_train, logit_c, sample_weight=sw), X_test)
    preds["hgb"] = predict_proba_3(fit_hgb(X_train, y_train, sample_weight=sw), X_test)
    preds["blend"] = normalize_probs(0.75 * preds["logit"] + 0.25 * preds["hgb"])

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

    preds["market_hybrid"] = _build_market_hybrid(
        train, test, preds["logit"], preds["market_power"], tie_rate
    )

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
