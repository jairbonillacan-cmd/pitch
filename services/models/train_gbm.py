#!/usr/bin/env python3
"""Entrena y evalúa un modelo GBM (LightGBM / HistGradientBoosting) para PitchLab Tachyon v3.0.

Soporta dos modos:
  1. Modo `tachyon` (por defecto cuando existe `research/prediction-lab/data/processed/features.parquet`):
     - Entrena walk-forward por temporada sobre la matriz causal `Tachyon v3.0`, incorporando
       explícitamente `Real xG` (`has_real_xg_history`, `xpts_diff_r10`, `pts_minus_xpts_diff_r5/r10`),
       `xG-Elo` (`xg_elo_diff`, `xg_elo_vs_elo_diff`), presión e invasión real Understat
       (`ppda_diff_r5/r10`, `deep_completions_diff_r5/r10`, `npxgd_diff_r10`) y física invariante
       de altitud (`altitude_diff_m`, `altitude_shock_flag`, `surface_pressure_diff`).
     - Calibra el peso convexo de ensamble `w * P_logit + (1 - w) * P_gbm` estrictamente en `VAL 2023`
       y evalúa sin snooping en `TEST 2024–25` (Global, Top-5 Europa y Liga MX) con intervalos de
       confianza bootstrap pareados al 95 % (`n_boot=2000`, `seed=42`).
  2. Modo legado `asof-jsonl` (`--mode asof-jsonl --features Reportes/modelos/features-asof.jsonl`):
     - Mantiene compatibilidad con el benchmark JSONL exportado por TypeScript.

Uso:
    research/prediction-lab/.venv/Scripts/python.exe services/models/train_gbm.py
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")

import numpy as np

try:
    import lightgbm as lgb  # type: ignore

    HAS_LGB = True
except ImportError:
    lgb = None  # type: ignore
    HAS_LGB = False

REPO_ROOT = Path(__file__).resolve().parents[2]
PRED_LAB_ROOT = REPO_ROOT / "research" / "prediction-lab"
DEFAULT_PARQUET = PRED_LAB_ROOT / "data" / "processed" / "features.parquet"
DEFAULT_V30_JSON = (
    PRED_LAB_ROOT / "experiments" / "EXP01_baselines_20261109" / "gbm_v30_metrics.json"
)

LEGACY_FEATURE_NAMES = [
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

TACHYON_V30_EXTRA_FEATURES = [
    "has_real_xg_history",
    "xg_elo_diff",
    "xg_elo_vs_elo_diff",
    "pts_minus_xpts_diff_r5",
    "pts_minus_xpts_diff_r10",
    "xpts_diff_r10",
    "ppda_diff_r5",
    "ppda_diff_r10",
    "deep_completions_diff_r5",
    "deep_completions_diff_r10",
    "npxgd_diff_r10",
    "altitude_diff_m",
    "altitude_shock_flag",
    "surface_pressure_diff",
]

TOP5_DIVS = ("E0", "SP1", "D1", "I1", "F1")


def safe_log(value: float) -> float:
    return -math.log(max(value, 1e-15))


def compute_ece(y: np.ndarray, p: np.ndarray, n_bins: int = 10) -> float:
    if len(y) == 0:
        return 0.0
    conf = np.max(p, axis=1)
    pred = np.argmax(p, axis=1)
    acc = (pred == y).astype(float)
    bins = np.linspace(0.0, 1.0, n_bins + 1)
    ece = 0.0
    n = float(len(y))
    for b in range(n_bins):
        lo, hi = bins[b], bins[b + 1]
        mask = (conf >= lo) & (conf <= hi if b == n_bins - 1 else conf < hi)
        if np.any(mask):
            ece += (np.sum(mask) / n) * abs(float(np.mean(acc[mask])) - float(np.mean(conf[mask])))
    return float(ece)


def eval_prob_matrix(y: np.ndarray, p: np.ndarray) -> dict[str, Any]:
    if len(y) == 0:
        return {"n": 0, "log_loss": None, "brier": None, "ece": None, "accuracy": None}
    p_norm = p / np.maximum(1e-15, p.sum(axis=1, keepdims=True))
    p_clip = np.clip(p_norm, 1e-15, 1.0)
    ll = float(-np.mean(np.log(p_clip[np.arange(len(y)), y])))
    oh = np.zeros_like(p_norm)
    oh[np.arange(len(y)), y] = 1.0
    brier = float(np.mean(np.sum((p_norm - oh) ** 2, axis=1)))
    acc = float(np.mean(np.argmax(p_norm, axis=1) == y))
    ece = compute_ece(y, p_norm, n_bins=10)
    return {
        "n": int(len(y)),
        "log_loss": ll,
        "brier": brier,
        "ece": ece,
        "accuracy": acc,
    }


def paired_bootstrap_ll_and_brier(
    y: np.ndarray,
    p_candidate: np.ndarray,
    p_ref: np.ndarray,
    n_boot: int = 2000,
    seed: int = 42,
) -> dict[str, Any]:
    """Bootstrap pareado sobre `loss(candidate) - loss(ref)` (`< 0` => candidate mejora a ref)."""
    n = len(y)
    if n == 0:
        return {"n": 0}
    pc = np.clip(p_candidate / np.maximum(1e-15, p_candidate.sum(axis=1, keepdims=True)), 1e-15, 1.0)
    pr = np.clip(p_ref / np.maximum(1e-15, p_ref.sum(axis=1, keepdims=True)), 1e-15, 1.0)
    d_ll = -np.log(pc[np.arange(n), y]) - (-np.log(pr[np.arange(n), y]))

    oh = np.zeros_like(pc)
    oh[np.arange(n), y] = 1.0
    d_br = np.sum((pc - oh) ** 2, axis=1) - np.sum((pr - oh) ** 2, axis=1)

    rng = np.random.default_rng(seed)
    boot_ll = np.empty(n_boot, dtype=float)
    boot_br = np.empty(n_boot, dtype=float)
    for b in range(n_boot):
        idx = rng.integers(0, n, size=n)
        boot_ll[b] = float(np.mean(d_ll[idx]))
        boot_br[b] = float(np.mean(d_br[idx]))

    ci_ll = np.percentile(boot_ll, [2.5, 97.5])
    ci_br = np.percentile(boot_br, [2.5, 97.5])
    return {
        "n": int(n),
        "n_boot": int(n_boot),
        "seed": int(seed),
        "delta_log_loss": float(np.mean(d_ll)),
        "ci95_log_loss": [float(ci_ll[0]), float(ci_ll[1])],
        "prob_candidate_better_ll": float(np.mean(boot_ll < 0.0)),
        "delta_brier": float(np.mean(d_br)),
        "ci95_brier": [float(ci_br[0]), float(ci_br[1])],
    }


def _fit_predict_gbm_fold(
    tr_df,
    te_df,
    feature_cols: list[str],
    div_levels: list[str],
    rounds: int = 120,
) -> tuple[np.ndarray, np.ndarray]:
    import pandas as pd

    def _design(d) -> np.ndarray:
        x_num = d[feature_cols].to_numpy(dtype=float)
        x_div = (
            pd.get_dummies(d["div"], prefix="div")
            .reindex(columns=[f"div_{dv}" for dv in div_levels], fill_value=0)
            .to_numpy(dtype=float)
        )
        return np.hstack([x_num, x_div])

    X_tr = _design(tr_df)
    y_tr = tr_df["y"].to_numpy(dtype=int)
    X_te = _design(te_df)

    days = (tr_df["match_date"].max() - tr_df["match_date"]).dt.days.to_numpy(dtype=float)
    sw = 0.5 ** (days / 1460.0)

    if HAS_LGB:
        dtrain = lgb.Dataset(X_tr, label=y_tr, weight=sw, free_raw_data=True)
        params = {
            "objective": "multiclass",
            "num_class": 3,
            "learning_rate": 0.04,
            "num_leaves": 15,
            "min_data_in_leaf": 140,
            "feature_fraction": 0.75,
            "bagging_fraction": 0.85,
            "bagging_freq": 1,
            "lambda_l2": 10.0,
            "verbosity": -1,
            "num_threads": 4,
            "seed": 42,
        }
        booster = lgb.train(params, dtrain, num_boost_round=rounds)
        probs = np.asarray(booster.predict(X_te), dtype=float)
        imp = np.asarray(booster.feature_importance(importance_type="gain"), dtype=float)
        return probs, imp

    from sklearn.ensemble import HistGradientBoostingClassifier

    hgb = HistGradientBoostingClassifier(
        max_iter=rounds,
        learning_rate=0.045,
        max_leaf_nodes=15,
        min_samples_leaf=140,
        l2_regularization=10.0,
        early_stopping=False,
        random_state=42,
    )
    hgb.fit(X_tr, y_tr, sample_weight=sw)
    probs = hgb.predict_proba(X_te)
    imp = np.zeros(X_tr.shape[1], dtype=float)
    return probs, imp


def run_tachyon_v30_gbm_benchmark(
    parquet_path: Path = DEFAULT_PARQUET,
    out_json_path: Path = DEFAULT_V30_JSON,
    rounds: int = 120,
    rolling_seasons: int = 12,
    logit_c: float = 0.05,
    logit_features: list[str] | None = None,
    use_global_date_cut: bool = True,
) -> dict[str, Any]:
    """Ejecuta walk-forward GBM vs Tachyon v3.0 Logit en `VAL 2023` y `TEST 2024–25`."""
    import pandas as pd
    from scipy.optimize import minimize_scalar
    from sklearn.impute import SimpleImputer
    from sklearn.linear_model import LogisticRegression
    from sklearn.preprocessing import StandardScaler

    sys.path.insert(0, str(PRED_LAB_ROOT / "models" / "a"))
    import train_motor_a as tma  # type: ignore

    df = pd.read_parquet(parquet_path)
    df["match_date"] = pd.to_datetime(df["match_date"])
    df["sstart"] = df["season"].astype(str).str[:4].astype(int)
    df = df[df["y"].notna()].copy()
    df["y"] = df["y"].astype(int)

    base_logit_feats = list(logit_features) if logit_features is not None else list(tma.FEATURES)
    gbm_feats = list(dict.fromkeys(base_logit_feats + [c for c in TACHYON_V30_EXTRA_FEATURES if c in df.columns]))
    div_levels = sorted(df[df["sstart"] <= 2025]["div"].unique().tolist())

    fold_preds: dict[int, pd.DataFrame] = {}
    importances = np.zeros(len(gbm_feats) + len(div_levels), dtype=float)
    n_models = 0

    for s in (2023, 2024, 2025):
        tr = df[(df["sstart"] >= s - rolling_seasons) & (df["sstart"] < s)].copy()
        te = df[df["sstart"] == s].copy()
        if use_global_date_cut:
            cut = te["match_date"].min()
            tr = tr[tr["match_date"] < cut].copy()

        # 1. Tachyon v3.0 pure Logit
        def _design_logit(d) -> np.ndarray:
            xn = d[base_logit_feats].to_numpy(dtype=float)
            xd = (
                pd.get_dummies(d["div"], prefix="div")
                .reindex(columns=[f"div_{dv}" for dv in div_levels], fill_value=0)
                .to_numpy(dtype=float)
            )
            return np.hstack([xn, xd])

        X_tr_l = _design_logit(tr)
        X_te_l = _design_logit(te)
        imp = SimpleImputer(strategy="median").fit(X_tr_l)
        sc = StandardScaler().fit(imp.transform(X_tr_l))
        days = (tr["match_date"].max() - tr["match_date"]).dt.days.to_numpy(dtype=float)
        sw = 0.5 ** (days / 1460.0)
        lr = LogisticRegression(max_iter=2000, tol=1e-4, C=logit_c)
        lr.fit(sc.transform(imp.transform(X_tr_l)), tr["y"].to_numpy(), sample_weight=sw)
        p_logit = lr.predict_proba(sc.transform(imp.transform(X_te_l)))

        # 2. GBM (LightGBM / HistGradientBoosting)
        tr_gbm = df[(df["sstart"] >= s - 10) & (df["sstart"] < s)].copy()
        if use_global_date_cut:
            tr_gbm = tr_gbm[tr_gbm["match_date"] < te["match_date"].min()].copy()
        p_gbm, gain_imp = _fit_predict_gbm_fold(tr_gbm, te, gbm_feats, div_levels, rounds=rounds)
        importances += gain_imp
        n_models += 1

        part_df = te[["match_id", "div", "season", "sstart", "match_date", "y"]].copy()
        part_df["logit_h"], part_df["logit_d"], part_df["logit_a"] = p_logit[:, 0], p_logit[:, 1], p_logit[:, 2]
        part_df["gbm_h"], part_df["gbm_d"], part_df["gbm_a"] = p_gbm[:, 0], p_gbm[:, 1], p_gbm[:, 2]
        fold_preds[s] = part_df

    val_df = fold_preds[2023]
    test_df = pd.concat([fold_preds[2024], fold_preds[2025]], ignore_index=True)

    yv = val_df["y"].to_numpy(dtype=int)
    pl_v = val_df[["logit_h", "logit_d", "logit_a"]].to_numpy(dtype=float)
    pg_v = val_df[["gbm_h", "gbm_d", "gbm_a"]].to_numpy(dtype=float)

    def _blend_ll(w: float) -> float:
        mix = w * pl_v + (1.0 - w) * pg_v
        mix = np.clip(mix / mix.sum(axis=1, keepdims=True), 1e-15, 1.0)
        return float(-np.mean(np.log(mix[np.arange(len(yv)), yv])))

    opt = minimize_scalar(_blend_ll, bounds=(0.0, 1.0), method="bounded")
    w_logit = round(float(opt.x), 4)
    w_gbm = round(1.0 - w_logit, 4)

    def _eval_split(sdf: pd.DataFrame) -> dict[str, Any]:
        slices = {
            "global": np.ones(len(sdf), dtype=bool),
            "top5_europe": sdf["div"].isin(TOP5_DIVS).to_numpy(),
            "liga_mx": (sdf["div"] == "MEX").to_numpy(),
            "top5_plus_mex": sdf["div"].isin((*TOP5_DIVS, "MEX")).to_numpy(),
        }
        res_split: dict[str, Any] = {}
        for sname, mask in slices.items():
            sub = sdf.loc[mask]
            y_s = sub["y"].to_numpy(dtype=int)
            pl = sub[["logit_h", "logit_d", "logit_a"]].to_numpy(dtype=float)
            pg = sub[["gbm_h", "gbm_d", "gbm_a"]].to_numpy(dtype=float)
            pb = w_logit * pl + w_gbm * pg
            res_split[sname] = {
                "logit_v30": eval_prob_matrix(y_s, pl),
                "gbm_v30": eval_prob_matrix(y_s, pg),
                "ensemble_logit_gbm": eval_prob_matrix(y_s, pb),
                "paired_bootstrap_ensemble_vs_logit": paired_bootstrap_ll_and_brier(y_s, pb, pl, n_boot=2000, seed=42),
                "paired_bootstrap_gbm_vs_logit": paired_bootstrap_ll_and_brier(y_s, pg, pl, n_boot=2000, seed=42),
            }
        return res_split

    report = {
        "codename": "PitchLab Tachyon v3.0 — GBM & Ensemble Benchmark",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "gbm_backend": "lightgbm" if HAS_LGB else "sklearn.HistGradientBoostingClassifier",
        "protocol": "walk_forward_global_cut" if use_global_date_cut else "walk_forward_season_split",
        "n_logit_features": len(base_logit_feats),
        "n_gbm_features": len(gbm_feats),
        "tachyon_v30_new_features_in_gbm": [c for c in TACHYON_V30_EXTRA_FEATURES if c in gbm_feats],
        "ensemble_weights_calibrated_on_val_2023": {
            "w_logit": w_logit,
            "w_gbm": w_gbm,
        },
        "val_2023": _eval_split(val_df),
        "test_2024_2025": _eval_split(test_df),
    }

    out_json_path.parent.mkdir(parents=True, exist_ok=True)
    out_json_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


# ---------------------------------------------------------------------------
# Modo legado JSONL (`Reportes/modelos/features-asof.jsonl`)
# ---------------------------------------------------------------------------
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


def train_pooled_jsonl(leagues: list[str], rows: list[dict], min_train_rows: int, rounds: int) -> dict:
    from sklearn.ensemble import HistGradientBoostingClassifier

    league_index = {league: index for index, league in enumerate(leagues)}
    season_rows: dict[str, list[dict]] = {}
    for row in rows:
        season_rows.setdefault(row["season"], []).append(row)
    seasons = sorted(season_rows)

    n_feat = len(rows[0]["features"]) if rows else len(LEGACY_FEATURE_NAMES)
    predictions: dict[str, list[dict]] = {league: [] for league in leagues}
    importance = np.zeros(n_feat + len(leagues))
    models = 0

    for season in seasons:
        train = [row for season_key, group in season_rows.items() if season_key < season for row in group]
        test = season_rows.get(season, [])
        if len(train) < min_train_rows or not test:
            continue
        x_train = np.array([feature_row(row, league_index) for row in train], dtype=float)
        y_train = np.array([row["outcome"] for row in train], dtype=int)
        x_test = np.array([feature_row(row, league_index) for row in test], dtype=float)

        if HAS_LGB:
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
            probabilities = model.predict(x_test)
        else:
            hgb = HistGradientBoostingClassifier(
                max_iter=rounds,
                learning_rate=0.03,
                max_leaf_nodes=7,
                min_samples_leaf=150,
                l2_regularization=10.0,
                early_stopping=False,
                random_state=42,
            )
            hgb.fit(x_train, y_train)
            probabilities = hgb.predict_proba(x_test)
        models += 1
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

        feat_labels = (
            LEGACY_FEATURE_NAMES
            if n_feat == len(LEGACY_FEATURE_NAMES)
            else [f"f_{i}" for i in range(n_feat)]
        )
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
                        feat_labels + [f"league_{league_name}" for league_name in leagues],
                        importance,
                        strict=True,
                    )
                },
            }
        )
    return {"leagues": results, "models": models}


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["tachyon", "asof-jsonl"], default="tachyon")
    parser.add_argument("--parquet", default=str(DEFAULT_PARQUET))
    parser.add_argument("--out-v30-json", default=str(DEFAULT_V30_JSON))
    parser.add_argument("--features", default="Reportes/modelos/features-asof.jsonl")
    parser.add_argument("--json", default=str(DEFAULT_V30_JSON))
    parser.add_argument("--min-train-rows", type=int, default=1200)
    parser.add_argument("--rounds", type=int, default=120)
    parser.add_argument("--season-split", action="store_true", help="Sin corte global inter-liga (estilo export_model)")
    args = parser.parse_args()

    if args.mode == "tachyon":
        report = run_tachyon_v30_gbm_benchmark(
            parquet_path=Path(args.parquet),
            out_json_path=Path(args.out_v30_json),
            rounds=args.rounds,
            use_global_date_cut=not args.season_split,
        )
        w = report["ensemble_weights_calibrated_on_val_2023"]
        v_g = report["val_2023"]["global"]
        t_g = report["test_2024_2025"]["global"]
        print(
            f"[Tachyon v3.0 GBM ({report['gbm_backend']})] weights={w}\n"
            f"  VAL 2023  (n={v_g['logit_v30']['n']:,}): logit={v_g['logit_v30']['log_loss']:.5f} "
            f"gbm={v_g['gbm_v30']['log_loss']:.5f} ens={v_g['ensemble_logit_gbm']['log_loss']:.5f} "
            f"Δens-logit={v_g['paired_bootstrap_ensemble_vs_logit']['delta_log_loss']:+.5f}\n"
            f"  TEST 24-25(n={t_g['logit_v30']['n']:,}): logit={t_g['logit_v30']['log_loss']:.5f} "
            f"gbm={t_g['gbm_v30']['log_loss']:.5f} ens={t_g['ensemble_logit_gbm']['log_loss']:.5f} "
            f"Δens-logit={t_g['paired_bootstrap_ensemble_vs_logit']['delta_log_loss']:+.5f}",
            flush=True,
        )
        print(f"escrito -> {args.out_v30_json}", flush=True)
        return

    rows = []
    with Path(args.features).open(encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    if not rows:
        raise SystemExit(f"Sin filas en {args.features}")

    leagues = sorted({row["league"] for row in rows})
    pooled = train_pooled_jsonl(leagues, rows, args.min_train_rows, args.rounds)
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "gbm_backend": "lightgbm" if HAS_LGB else "sklearn.HistGradientBoostingClassifier",
        "features_file": args.features,
        "feature_names": LEGACY_FEATURE_NAMES,
        "models": pooled["models"],
        "leagues": pooled["leagues"],
    }
    Path(args.json).parent.mkdir(parents=True, exist_ok=True)
    Path(args.json).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    random.seed(42)
    main()
