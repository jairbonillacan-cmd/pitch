#!/usr/bin/env python3
"""Motor A (v2): modelos de predicción 1X2 SIN información de cuotas.

Diseño experimental:
  - Walk-forward expanding: para cada temporada S se entrena con temporadas < S y se predice S.
  - Fold canónico: dev <= 2022/23, val = 2023/24, test = 2024/25 + 2025/26, live = 2026/27.
  - Ninguna decisión de modelo usa test.

Mejoras de 2ª Generación (Motor A v2):
  - Incorpora Pi-Ratings (Constantinou & Fenton, 2013), ClubElo inter-división,
    Ataque/Defensa dinámico y probabilidades estructurales Dixon-Coles online (`dc_prob_*`),
    Synthetic xG + regresión a la media (`xg_overperf_diff_r5`), forma ajustada por fuerza
    del calendario (`form_pts_res_diff_r5`, `form_gd_res_diff_r5`), forma específica por
    localía (`venue_*`) y geometría del empate (`elo_closeness`, `low_scoring_tight_match`).
  - Pesos exponenciales de recencia (half-life 4 años) y regularización L2 calibrada en val.

Uso:
    ./.venv/bin/python models/a/train_motor_a.py --tag EXP01_baselines
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from scipy.stats import poisson
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression, PoissonRegressor
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PROC = os.path.join(ROOT, "data", "processed")
ART = os.path.join(ROOT, "artifacts")
sys.path.insert(0, ROOT)

SEED = 20261109
FEATURES = [
    # Bloque 1ª generación (54 features base)
    "elo_diff", "elo_diff_no_hfa", "elo_prob_home_nodraw", "elo_diff_x_progress",
    "h_points_r5", "a_points_r5", "h_gd_r5", "a_gd_r5", "h_gf_r5", "a_gf_r5", "h_ga_r5", "a_ga_r5",
    "h_points_r10", "a_points_r10", "h_gd_r10", "a_gd_r10",
    "h_points_ewm5", "a_points_ewm5", "h_gf_ewm5", "a_gf_ewm5", "h_ga_ewm5", "a_ga_ewm5",
    "h_shots_r5", "a_shots_r5", "h_sot_r5", "a_sot_r5", "h_corners_r5", "a_corners_r5",
    "form_pts_diff_r5", "form_gd_diff_r5", "form_gd_diff_r10",
    "h_days_rest", "a_days_rest", "rest_diff", "h_matches_last_14d", "a_matches_last_14d",
    "congestion_diff", "home_season_match_no", "away_season_match_no", "season_progress",
    "h_div_change", "a_div_change", "h_season_break", "a_season_break",
    "home_prev_ppg", "away_prev_ppg", "home_prev_gf_pg", "home_prev_ga_pg",
    "away_prev_gf_pg", "away_prev_ga_pg", "home_prev_sot_pg", "away_prev_sot_pg",
    "lg_avg_total_prev", "lg_home_win_prev",
    # Bloque 2ª generación (25 features estructurales y ajustadas por oponente)
    "clubelo_diff",
    "pi_home_h", "pi_away_a", "pi_diff", "pi_exp_gd", "pi_overall_diff",
    "att_strength_home", "def_strength_home", "att_strength_away", "def_strength_away",
    "dc_lam_home", "dc_lam_away", "dc_exp_total", "dc_exp_diff",
    "dc_prob_h", "dc_prob_d", "dc_prob_a",
    "xgd_diff_r5", "xgd_diff_r10", "xg_overperf_diff_r5",
    "form_pts_res_diff_r5", "form_gd_res_diff_r5", "sos_diff_r5",
    "venue_pts_diff_r5", "venue_gd_diff_r5", "venue_xgd_diff_r5",
    "elo_closeness", "low_scoring_tight_match", "draw_rate_sum_r10",
]
TARGET = "y"
DEV_END = 2022  # temporadas <= 2022/23
VAL = 2023
TEST = (2024, 2025)
LIVE = (2026,)
MIN_TRAIN_SEASONS = 3
FIRST_EVAL_SEASON = 2005


def _log_loss(y, p):
    p = np.clip(p, 1e-15, 1)
    p = p / p.sum(axis=1, keepdims=True)
    return float(-np.mean(np.log(p[np.arange(len(y)), y])))


def _brier(y, p):
    o = np.eye(3)[y]
    return float(np.mean(np.sum((p - o) ** 2, axis=1)))


def _rps(y, p):
    o = np.eye(3)[y]
    cp = np.cumsum(p, axis=1)[:, :2]
    co = np.cumsum(o, axis=1)[:, :2]
    return float(np.mean(np.sum((cp - co) ** 2, axis=1) / 2))


def _acc(y, p):
    return float(np.mean(np.argmax(p, axis=1) == y))


def _balanced_acc(y, p):
    pred = np.argmax(p, axis=1)
    recalls = [np.mean(pred[y == k] == k) for k in range(3) if (y == k).any()]
    return float(np.mean(recalls))


def summarize(y, p) -> dict:
    return {
        "n": int(len(y)),
        "log_loss": _log_loss(y, p),
        "brier": _brier(y, p),
        "rps": _rps(y, p),
        "accuracy": _acc(y, p),
        "balanced_accuracy": _balanced_acc(y, p),
    }


class BaseRateModel:
    """Frecuencias H/D/A con shrinkage hacia la frecuencia global (prior 50 partidos)."""

    def __init__(self, prior: float = 50.0):
        self.prior = prior

    def fit(self, df):
        y = df[TARGET].to_numpy()
        self.global_p = np.bincount(y, minlength=3) / len(y)
        self.div_p = {}
        for div, g in df.groupby("div"):
            c = np.bincount(g[TARGET].to_numpy(), minlength=3)
            self.div_p[div] = (c + self.prior * self.global_p) / (c.sum() + self.prior)
        return self

    def predict_proba(self, df):
        return np.vstack([self.div_p.get(d, self.global_p) for d in df["div"]])


class EloOrderedModel:
    """Logit ordenado con 2 umbrales sobre índice compuesto Elo + Pi-Rating."""

    def _score(self, df):
        elo_x = df.elo_diff.to_numpy(dtype=float) / 100.0
        if "pi_diff" in df.columns:
            pi_x = np.nan_to_num(df.pi_diff.to_numpy(dtype=float), nan=0.0)
            return 0.70 * elo_x + 0.30 * (pi_x * 2.5)
        return elo_x

    def fit(self, df):
        x = self._score(df)
        y = df[TARGET].to_numpy()

        def nll(params):
            b, c1, c2 = params
            if c1 >= c2:
                return 1e6 + (c1 - c2) ** 2 * 1e3
            s1 = 1 / (1 + np.exp(-(c1 - b * x)))
            s2 = 1 / (1 + np.exp(-(c2 - b * x)))
            p = np.where(y == 0, s1, np.where(y == 1, s2 - s1, 1 - s2))
            return -np.mean(np.log(np.clip(p, 1e-12, 1)))

        res = minimize(
            nll,
            x0=[1.0, -0.5, 0.6],
            method="Nelder-Mead",
            options={"maxiter": 3000, "xatol": 1e-6, "fatol": 1e-9},
        )
        self.b, self.c1, self.c2 = res.x
        return self

    def predict_proba(self, df):
        x = self._score(df)
        s1 = 1 / (1 + np.exp(-(self.c1 - self.b * x)))
        s2 = 1 / (1 + np.exp(-(self.c2 - self.b * x)))
        p = np.column_stack([s1, np.clip(s2 - s1, 1e-9, 1), 1 - s2])
        return p / p.sum(axis=1, keepdims=True)


class PoissonDC:
    """Poisson ataque/defensa por división (sklearn, L2) + corrección Dixon-Coles."""

    RHO_GRID = np.arange(-0.30, 0.301, 0.01)

    def __init__(self, half_life_days: float = 365.0, alpha: float = 0.01, max_goals: int = 10):
        self.half_life_days = half_life_days
        self.alpha = alpha
        self.max_goals = max_goals
        self.models: dict[str, dict] = {}
        self.rho: dict[str, float] = {}

    @staticmethod
    def _tau_matrix(lh, la, rho, K):
        m = np.outer(poisson.pmf(np.arange(K), lh), poisson.pmf(np.arange(K), la))
        m[0, 0] *= max(1 - lh * la * rho, 1e-9)
        m[0, 1] *= max(1 + lh * rho, 1e-9)
        m[1, 0] *= max(1 + la * rho, 1e-9)
        m[1, 1] *= max(1 - rho, 1e-9)
        return m

    def _fit_rho(self, df, lh, la):
        hg = df.home_goals.to_numpy()
        ag = df.away_goals.to_numpy()
        best, best_rho = -np.inf, 0.0
        for rho in self.RHO_GRID:
            t = np.ones(len(df))
            m00 = (hg == 0) & (ag == 0)
            m01 = (hg == 0) & (ag == 1)
            m10 = (hg == 1) & (ag == 0)
            m11 = (hg == 1) & (ag == 1)
            t[m00] = np.maximum(1 - lh[m00] * la[m00] * rho, 1e-9)
            t[m01] = np.maximum(1 + lh[m01] * rho, 1e-9)
            t[m10] = np.maximum(1 + la[m10] * rho, 1e-9)
            t[m11] = np.maximum(1 - rho, 1e-9)
            ll = np.sum(np.log(t))
            if ll > best:
                best, best_rho = ll, rho
        return best_rho

    def fit(self, df):
        self.models, self.rho = {}, {}
        y_all = df[TARGET].to_numpy()
        self.base_p = np.bincount(y_all, minlength=3) / len(y_all)
        for div, g in df.groupby("div"):
            teams = pd.Index(sorted(set(g.home_team) | set(g.away_team)))
            idx = {t: i for i, t in enumerate(teams)}
            n = len(teams)
            hi = g.home_team.map(idx).to_numpy()
            ai = g.away_team.map(idx).to_numpy()
            rows = np.arange(len(g))
            X = np.zeros((2 * len(g), 2 * n + 1))
            X[rows, hi] = 1.0
            X[rows, n + ai] = 1.0
            X[rows, -1] = 1.0
            X[len(g) + rows, ai] = 1.0
            X[len(g) + rows, n + hi] = 1.0
            X[len(g) + rows, -1] = 0.0
            y = np.concatenate([g.home_goals.to_numpy(), g.away_goals.to_numpy()])
            days = (g.match_date.max() - g.match_date).dt.days.to_numpy(dtype=float)
            w = 0.5 ** (days / self.half_life_days)
            w2 = np.concatenate([w, w])
            model = PoissonRegressor(alpha=self.alpha, max_iter=500, tol=1e-6)
            model.fit(X, y, sample_weight=w2)
            lh = model.predict(X[: len(g)])
            la = model.predict(X[len(g) :])
            rho = self._fit_rho(g, lh, la)
            self.models[div] = {"model": model, "teams": teams, "n": n}
            self.rho[div] = rho
        return self

    def predict_proba(self, df):
        out = np.full((len(df), 3), np.nan)
        for div, g in df.groupby("div"):
            if div not in self.models:
                out[df.index.get_indexer(g.index)] = self.base_p
                continue
            md = self.models[div]
            idx = {t: i for i, t in enumerate(md["teams"])}
            n = md["n"]
            rows = np.arange(len(g))
            X = np.zeros((2 * len(g), 2 * n + 1))
            hi = g.home_team.map(idx).to_numpy()
            ai = g.away_team.map(idx).to_numpy()
            hi_i = np.where(np.isfinite(hi.astype(float)), hi, -1).astype(int)
            ai_i = np.where(np.isfinite(ai.astype(float)), ai, -1).astype(int)
            X[rows, -1] = 1.0
            known_h = hi_i >= 0
            known_a = ai_i >= 0
            X[rows[known_h], hi_i[known_h]] = 1.0
            X[rows[known_a], n + ai_i[known_a]] = 1.0
            X[len(g) + rows[known_a], ai_i[known_a]] = 1.0
            X[len(g) + rows[known_h], n + hi_i[known_h]] = 1.0
            lh = md["model"].predict(X[: len(g)])
            la = md["model"].predict(X[len(g) :])
            rho = self.rho[div]
            for k, pos in enumerate(g.index):
                if not np.isfinite(lh[k]) or not np.isfinite(la[k]):
                    continue
                m = self._tau_matrix(lh[k], la[k], rho, self.max_goals + 1)
                m = np.clip(m, 0, None)
                m = m / m.sum()
                ph = np.tril(m, -1).sum()
                pd_ = np.trace(m)
                pa = np.triu(m, 1).sum()
                out[df.index.get_loc(pos)] = (ph, pd_, pa)
        if np.isnan(out).any():
            raise RuntimeError("PoissonDC produjo NaN; revisar fallback de división/equipo")
        return out


class HGBModel:
    def __init__(self, **kw):
        self.params = dict(
            max_iter=90,
            learning_rate=0.05,
            max_leaf_nodes=15,
            l2_regularization=5.0,
            min_samples_leaf=120,
            early_stopping=False,
            random_state=SEED,
        )
        self.params.update(kw)

    def fit(self, df):
        self.divs = pd.Index(sorted(df["div"].unique()))
        self.cat = self.divs.get_indexer(df["div"])
        self.model = HistGradientBoostingClassifier(**self.params)
        days = (df.match_date.max() - df.match_date).dt.days.to_numpy(dtype=float)
        sw = 0.5 ** (days / 1460.0)
        self.model.fit(self._X(df), df[TARGET].to_numpy(), sample_weight=sw)
        return self

    def _X(self, df):
        X = df[FEATURES].to_numpy(dtype=float)
        cat = self.divs.get_indexer(df["div"]).reshape(-1, 1)
        return np.hstack([X, cat])

    def predict_proba(self, df):
        return self.model.predict_proba(self._X(df))


def fit_logit(df):
    imp = SimpleImputer(strategy="median")
    sc = StandardScaler()
    lr = LogisticRegression(max_iter=3000, C=0.25)
    X_df = pd.concat([df[FEATURES], pd.get_dummies(df["div"], prefix="div").astype(float)], axis=1)
    X_mat = sc.fit_transform(imp.fit_transform(X_df))
    days = (df.match_date.max() - df.match_date).dt.days.to_numpy(dtype=float)
    sw = 0.5 ** (days / 1460.0)
    lr.fit(X_mat, df[TARGET].to_numpy(), sample_weight=sw)
    pipe = make_pipeline(imp, sc, lr)
    return pipe, X_df.columns


def predict_logit(model, cols, df):
    X = pd.concat([df[FEATURES], pd.get_dummies(df["div"], prefix="div").astype(float)], axis=1)
    X = X.reindex(columns=cols, fill_value=0.0)
    return model.predict_proba(X)


def season_of(s):
    return int(str(s)[:4])


def load_features():
    df = pd.read_parquet(os.path.join(PROC, "features.parquet"))
    df["match_date"] = pd.to_datetime(df["match_date"])
    df["sstart"] = df.season.map(season_of)
    df = df[df[TARGET].notna()].copy()
    df[TARGET] = df[TARGET].astype(int)
    return df


def fold_masks(df):
    s = df.sstart
    return {
        "dev": s <= DEV_END,
        "val": s == VAL,
        "test": s.isin(TEST),
        "live": s.isin(LIVE),
    }


def temperature_scale(p, y, grid=np.linspace(0.5, 2.5, 81)):
    best_t, best_ll = 1.0, np.inf
    logp = np.log(np.clip(p, 1e-15, 1))
    for t in grid:
        q = np.exp(logp / t)
        q = q / q.sum(axis=1, keepdims=True)
        ll = _log_loss(y, q)
        if ll < best_ll:
            best_ll, best_t = ll, float(t)
    return best_t


def apply_temperature(p, t):
    logp = np.log(np.clip(p, 1e-15, 1)) / t
    q = np.exp(logp - logp.max(axis=1, keepdims=True))
    return q / q.sum(axis=1, keepdims=True)


def ensemble_weights(preds: dict[str, np.ndarray], y, names):
    """Pesos convexos que minimizan log-loss (softmax reparam), ajustados SOLO en val."""
    P = np.stack([preds[n] for n in names], axis=0)

    def obj(z):
        w = np.exp(z - z.max())
        w = w / w.sum()
        mix = np.tensordot(w, P, axes=1)
        return _log_loss(y, mix)

    z0 = np.zeros(len(names))
    res = minimize(obj, z0, method="Nelder-Mead", options={"maxiter": 4000, "xatol": 1e-8})
    w = np.exp(res.x - res.x.max())
    return dict(zip(names, (w / w.sum()).round(4)))


def run_walk_forward(
    df,
    fit_fn,
    predict_fn,
    folds_from=FIRST_EVAL_SEASON,
    use_rolling=False,
    rolling_seasons=10,
    verbose=True,
):
    out = []
    seasons = sorted(df.sstart.unique())
    for s in seasons:
        if s < folds_from:
            continue
        train = df[df.sstart < s]
        if train.sstart.nunique() < MIN_TRAIN_SEASONS:
            continue
        if use_rolling:
            train = train[train.sstart >= s - rolling_seasons]
        test = df[df.sstart == s]
        cut = test.match_date.min()
        n_before = len(train)
        train = train[train.match_date < cut]
        dropped = n_before - len(train)
        t0 = time.time()
        model = fit_fn(train)
        p = predict_fn(model, test)
        out.append(
            pd.DataFrame(
                {
                    "match_id": test.match_id.values,
                    "div": test["div"].values,
                    "season": test.season.values,
                    "match_date": test.match_date.values,
                    "y": test[TARGET].values,
                    "p_home": p[:, 0],
                    "p_draw": p[:, 1],
                    "p_away": p[:, 2],
                    "fold": f"wf_{s}",
                }
            )
        )
        if verbose:
            okp = np.all(np.isfinite(p), axis=1)
            ll_txt = f"{_log_loss(test[TARGET].values[okp], p[okp]):.4f}" if okp.any() else "n/a"
            print(
                f"  season {s}: train={len(train):,} (drop_fut={dropped:,}) test={len(test):,} "
                f"ll={ll_txt} nan={int((~okp).sum())} ({time.time()-t0:.1f}s)",
                flush=True,
            )
    return pd.concat(out, ignore_index=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tag", default="EXP01_baselines")
    ap.add_argument("--models", default="all")
    ap.add_argument("--folds-from", type=int, default=FIRST_EVAL_SEASON)
    ap.add_argument("--no-test", action="store_true", help="no mostrar métricas de test/live (evita snooping)")
    args = ap.parse_args()
    tag = f"{args.tag}_{datetime.now().strftime('%Y%m%d')}"
    outdir = os.path.join(ART, tag)
    os.makedirs(outdir, exist_ok=True)

    bad = [
        f
        for f in FEATURES
        if f == "y"
        or f.endswith("_post")
        or f.startswith("ht_")
        or f in ("result", "home_goals", "away_goals", "goals_total")
    ]
    if bad:
        raise SystemExit(f"FEATURES contiene columnas post-partido/target: {bad}")
    df = load_features()
    masks = fold_masks(df)
    print(
        f"partidos: {len(df):,} | dev={masks['dev'].sum():,} val={masks['val'].sum():,} "
        f"test={masks['test'].sum():,} live={masks['live'].sum():,}"
    )
    print("temporadas:", sorted(df.sstart.unique()))
    models = (
        {m.strip() for m in args.models.split(",")}
        if args.models != "all"
        else {"base_rate", "elo_ordered", "logit", "poisson_dc", "hgb"}
    )

    results = {}

    if "base_rate" in models:
        print("\n[base_rate]")
        pred = run_walk_forward(
            df, lambda tr: BaseRateModel().fit(tr), lambda m, te: m.predict_proba(te), args.folds_from
        )
        results["base_rate"] = pred

    if "elo_ordered" in models:
        print("\n[elo_ordered]")
        pred = run_walk_forward(
            df, lambda tr: EloOrderedModel().fit(tr), lambda m, te: m.predict_proba(te), args.folds_from
        )
        results["elo_ordered"] = pred

    if "logit" in models:
        print("\n[logit]")

        def fit_fn(tr):
            m, cols = fit_logit(tr)
            return (m, cols)

        def pred_fn(mc, te):
            return predict_logit(mc[0], mc[1], te)

        pred = run_walk_forward(df, fit_fn, pred_fn, args.folds_from, use_rolling=True, rolling_seasons=12)
        results["logit"] = pred

    if "poisson_dc" in models:
        print("\n[poisson_dc]")
        pred = run_walk_forward(
            df,
            lambda tr: PoissonDC().fit(tr),
            lambda m, te: m.predict_proba(te),
            args.folds_from,
            use_rolling=True,
            rolling_seasons=12,
        )
        results["poisson_dc"] = pred

    if "hgb" in models:
        print("\n[hgb]")
        pred = run_walk_forward(
            df,
            lambda tr: HGBModel().fit(tr),
            lambda m, te: m.predict_proba(te),
            args.folds_from,
            use_rolling=True,
            rolling_seasons=10,
        )
        results["hgb"] = pred

    for name, pred in results.items():
        pred.to_csv(os.path.join(outdir, f"pred_{name}.csv"), index=False)

    metrics = {}
    parts = (
        [("dev", range(0, DEV_END + 1)), ("val", [VAL])]
        if args.no_test
        else [
            ("dev", range(0, DEV_END + 1)),
            ("val", [VAL]),
            ("test", list(TEST)),
            ("live", list(LIVE)),
        ]
    )
    for name, pred in results.items():
        p = pred[["p_home", "p_draw", "p_away"]].to_numpy()
        y = pred.y.to_numpy()
        m = {}
        for part, sset in parts:
            sel = pred.season.map(season_of).isin(sset).to_numpy()
            m[part] = summarize(y[sel], p[sel]) if sel.any() else None
        m["all"] = summarize(y, p)
        metrics[name] = m

    names = [n for n in ("base_rate", "elo_ordered", "logit", "poisson_dc", "hgb") if n in results]
    if len(names) >= 2:
        base = results[names[0]].set_index("match_id")
        ids = base.index
        for n in names[1:]:
            ids = ids.intersection(results[n].set_index("match_id").index)
        ids = base.index[base.index.isin(ids)]
        pivot = {n: results[n].set_index("match_id").reindex(ids)[["p_home", "p_draw", "p_away"]] for n in names}
        seasons_by_id = base.reindex(ids)["season"].map(season_of)
        val_ids = ids[seasons_by_id == VAL]
        y_val = base.reindex(val_ids)["y"].to_numpy()
        preds_val = {n: pivot[n].reindex(val_ids).to_numpy() for n in names}
        w = ensemble_weights(preds_val, y_val, names)
        print(f"\n[ensemble] pesos ajustados en val: {w}")
        mix = np.zeros((len(ids), 3))
        for n in names:
            mix += w[n] * pivot[n].to_numpy()
        ens = base.reindex(ids)[["div", "season", "match_date", "y"]].copy()
        ens["p_home"], ens["p_draw"], ens["p_away"] = mix[:, 0], mix[:, 1], mix[:, 2]
        ens = ens.reset_index()
        ens["fold"] = ens.season.map(lambda s: f"wf_{season_of(s)}")
        results["ensemble"] = ens
        y = ens.y.to_numpy()
        p = mix
        metrics["ensemble"] = {}
        for part, sset in (("dev", range(0, DEV_END + 1)), ("val", [VAL]), ("test", list(TEST)), ("live", list(LIVE))):
            sel = ens.season.map(season_of).isin(sset).to_numpy()
            metrics["ensemble"][part] = summarize(y[sel], p[sel]) if sel.any() else None
        metrics["ensemble"]["all"] = summarize(y, p)
    else:
        w = {}

    for name, pred in results.items():
        pred.to_csv(os.path.join(outdir, f"pred_{name}.csv"), index=False)

    print("\n[market] benchmark de cierre sobre los mismos partidos")
    mkt = pd.read_parquet(os.path.join(PROC, "features_market.parquet"))
    mkt = mkt[
        [
            "match_id",
            "mkt_close_ps_proportional_h",
            "mkt_close_ps_proportional_d",
            "mkt_close_ps_proportional_a",
            "mkt_close_ps_power_h",
            "mkt_close_ps_power_d",
            "mkt_close_ps_power_a",
            "mkt_close_ps_shin_h",
            "mkt_close_ps_shin_d",
            "mkt_close_ps_shin_a",
            "mkt_close_bf_proportional_h",
            "mkt_close_bf_proportional_d",
            "mkt_close_bf_proportional_a",
        ]
    ]
    ref = results[names[0]][["match_id", "season", "div", "y"]].merge(mkt, on="match_id", how="left")
    market_metrics = {}
    for label, cols in (
        ("market_ps_proportional", ["mkt_close_ps_proportional_" + k for k in "hda"]),
        ("market_ps_power", ["mkt_close_ps_power_" + k for k in "hda"]),
        ("market_ps_shin", ["mkt_close_ps_shin_" + k for k in "hda"]),
        ("market_bf_proportional", ["mkt_close_bf_proportional_" + k for k in "hda"]),
    ):
        q = ref[cols].to_numpy(dtype=float)
        ok = np.all(np.isfinite(q), axis=1)
        market_metrics[label] = {}
        for part, sset in parts:
            sel = ok & ref.season.map(season_of).isin(sset).to_numpy()
            market_metrics[label][part] = summarize(ref.y.to_numpy()[sel], q[sel]) if sel.any() else None
        market_metrics[label]["all"] = summarize(ref.y.to_numpy()[ok], q[ok])

    def fmt(m):
        return (
            f"{m['n']:>6,} ll={m['log_loss']:.4f} br={m['brier']:.4f} rps={m['rps']:.4f} acc={m['accuracy']:.3f}"
            if m
            else "-"
        )

    print("\n=== RESUMEN (partición) ===")
    for name, m in {**metrics, **market_metrics}.items():
        if args.no_test:
            print(f"{name:28s} val: {fmt(m['val'])}")
        else:
            print(f"{name:28s} val: {fmt(m['val'])}\n{'':28s} test:{fmt(m['test'])}")

    temp = {}
    for name in list(metrics.keys()):
        pred = results[name]
        sstart = pred.season.map(season_of)
        sel_val = (sstart == VAL).to_numpy()
        if sel_val.sum() < 100:
            continue
        p = pred[["p_home", "p_draw", "p_away"]].to_numpy()
        t = temperature_scale(p[sel_val], pred.y.to_numpy()[sel_val])
        temp[name] = t
        sel_test = sstart.isin(TEST).to_numpy()
        if sel_test.any() and not args.no_test:
            pt = apply_temperature(p[sel_test], t)
            metrics[name]["test_calibrated"] = summarize(pred.y.to_numpy()[sel_test], pt)
    print("\ntemperaturas (val):", temp)

    payload = {
        "tag": tag,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "n_matches": int(len(df)),
        "folds_from": args.folds_from,
        "features": FEATURES,
        "ensemble_weights": w,
        "temperatures": temp,
        "metrics": metrics,
        "market": market_metrics,
        "partitions": {"dev_end": DEV_END, "val": VAL, "test": list(TEST), "live": list(LIVE)},
    }
    with open(os.path.join(outdir, "metrics.json"), "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=1, default=float)
    with open(os.path.join(outdir, "config.json"), "w", encoding="utf-8") as f:
        json.dump(
            {
                "FEATURES": FEATURES,
                "SEED": SEED,
                "DEV_END": DEV_END,
                "VAL": VAL,
                "TEST": list(TEST),
                "MIN_TRAIN_SEASONS": MIN_TRAIN_SEASONS,
                "FIRST_EVAL_SEASON": args.folds_from,
                "models": sorted(models),
            },
            f,
            indent=1,
        )
    print(f"\nartefactos -> {outdir}")


if __name__ == "__main__":
    main()
