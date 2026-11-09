#!/usr/bin/env python3
"""Motor B: incorporación de información de mercado (cuotas) al Motor A.

Escenarios (mismos partidos, comparación pareada):
  1. market_open / market_close   mercado puro de-vig (power)
  2. linear_pool                  mezcla lineal p = (1-w) pA + w pM, w ajustado en temporadas previas
  3. logit_pool                   mezcla en espacio logit
  4. stack_logit                  regresión logística multinomial sobre log pA, log pM y features
  5. residual_logit               corrección multiplicativa sobre pM: softmax(log pM + g(x))
  6. stack_hgb                    HistGradientBoosting sobre las mismas features
  7. ensemble_b                   mezcla de linear_pool + stack_logit + residual (pesos en val)

Regla de disponibilidad: `open` = cuotas de apertura (pre-partido, supuesto documentado).
`close` = cuotas de cierre: benchmark/closing-line, NO operable con antelación.
Si no hay cuota para un partido, el Motor B cae al Motor A y se marca `fallback_motor_a`.

Uso:
  ./.venv/bin/python models/b/train_motor_b.py \
      --motor-a artifacts/EXP01_baselines_20261109 --base ensemble --tag EXP08_motor_b
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PROC = os.path.join(ROOT, "data", "processed")
ART = os.path.join(ROOT, "artifacts")
SEED = 20261109
FIRST = 2005


def logloss(y, p):
    p = np.clip(p, 1e-15, 1)
    p = p / p.sum(axis=1, keepdims=True)
    return float(-np.mean(np.log(p[np.arange(len(y)), y])))


def season_of(s):
    return int(str(s)[:4])


def logit(p, eps=1e-6):
    p = np.clip(p, eps, 1 - eps)
    return np.log(p)


def softmax(z):
    z = z - z.max(axis=1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=1, keepdims=True)


def fit_weight(y, pA, pM, space="prob"):
    """Peso w de la mezcla que minimiza log-loss en los datos de ajuste."""
    grid = np.linspace(0, 1, 41)
    best_w, best = 0.5, np.inf
    for w in grid:
        if space == "prob":
            mix = (1 - w) * pA + w * pM
        else:
            mix = softmax((1 - w) * logit(pA) + w * logit(pM))
        ll = logloss(y, mix)
        if ll < best:
            best, best_w = ll, float(w)
    return best_w


def mix(pA, pM, w, space="prob"):
    if space == "prob":
        out = (1 - w) * pA + w * pM
    else:
        out = softmax((1 - w) * logit(pA) + w * logit(pM))
    return out / out.sum(axis=1, keepdims=True)


def stack_features(pA, pM, df):
    f = np.column_stack([
        logit(pA), logit(pM),
        df.elo_diff.to_numpy(dtype=float) / 100.0,
        df.form_gd_diff_r10.to_numpy(dtype=float),
        df.h_points_r5.to_numpy(dtype=float) - df.a_points_r5.to_numpy(dtype=float),
    ])
    return f


def fallback(pA, pM, out):
    """Sustituye NaN del mercado por pA (fallback) y devuelve máscara de fallback."""
    fb = ~np.all(np.isfinite(pM), axis=1) | (np.nansum(pM, axis=1) <= 0)
    out = out.copy()
    out[fb] = pA[fb]
    return out, fb


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--motor-a", default="artifacts/EXP01_baselines_20261109")
    ap.add_argument("--base", default="ensemble")
    ap.add_argument("--phase", default="open", choices=["open", "close"])
    ap.add_argument("--tag", default="EXP08_motor_b")
    args = ap.parse_args()
    art_a = args.motor_a if os.path.isabs(args.motor_a) else os.path.join(ROOT, args.motor_a)
    outdir = os.path.join(ART, f"{args.tag}_{datetime.now().strftime('%Y%m%d')}")
    os.makedirs(outdir, exist_ok=True)

    pa = pd.read_csv(os.path.join(art_a, f"pred_{args.base}.csv"))
    pa = pa[["match_id", "div", "season", "match_date", "y", "p_home", "p_draw", "p_away"]].copy()
    pa["sstart"] = pa.season.map(season_of)
    pa = pa[pa.sstart >= FIRST].reset_index(drop=True)
    feats = pd.read_parquet(os.path.join(PROC, "features.parquet"))[
        ["match_id", "elo_diff", "form_gd_diff_r10", "h_points_r5", "a_points_r5"]]
    pa = pa.merge(feats, on="match_id", how="left")

    mk = pd.read_parquet(os.path.join(PROC, "features_market.parquet"))
    phase = args.phase
    # Preferencia por partido (no por bloque): Pinnacle power -> B365 power -> Avg power.
    # Así la cobertura no se desploma cuando Pinnacle desaparece (2026/27) o es parcial (2025/26).
    mk = mk[["match_id"] + [c for c in mk.columns if c.startswith("mkt_")]]
    df = pa.merge(mk, on="match_id", how="left")
    chain = []
    for label, src, method in (("ps_power", "ps", "power"), ("b365_power", "b365", "power"),
                               ("avg_power", "avg", "power"), ("ps_prop", "ps", "proportional"),
                               ("b365_prop", "b365", "proportional")):
        cols = [f"mkt_{phase}_{src}_{method}_{k}" for k in "hda"]
        if all(c in df.columns for c in cols):
            chain.append((label, cols))
    if not chain:
        raise SystemExit(f"sin cuotas {phase}")
    mh = pd.Series(np.nan, index=df.index)
    md = pd.Series(np.nan, index=df.index)
    ma = pd.Series(np.nan, index=df.index)
    src_used = pd.Series("", index=df.index)
    for label, cols in reversed(chain):  # el primero de la cadena sobrescribe
        ok = df[cols].notna().all(axis=1)
        mh.loc[ok], md.loc[ok], ma.loc[ok] = df.loc[ok, cols[0]], df.loc[ok, cols[1]], df.loc[ok, cols[2]]
        src_used.loc[ok] = label
    df["mh"], df["md"], df["ma"] = mh, md, ma
    df["market_src"] = src_used
    df["market_ok"] = df[["mh", "md", "ma"]].notna().all(axis=1)
    print(f"fase {phase}: mercado disponible en {df.market_ok.mean():.1%} de los partidos; "
          f"fuentes: {df.loc[df.market_ok,'market_src'].value_counts().to_dict()}")

    seasons = sorted(df.sstart.unique())
    results = {k: [] for k in ("market", "linear_pool", "logit_pool", "stack_logit",
                               "residual_logit", "stack_hgb", "ensemble_b")}
    weights = {}
    for s in seasons:
        if s < FIRST:
            continue
        train = df[df.sstart < s]
        test = df[df.sstart == s].copy()
        if len(train) == 0 or len(test) == 0:
            continue
        tr = train[train.market_ok]
        y_tr = tr.y.to_numpy()
        pA_tr = tr[["p_home", "p_draw", "p_away"]].to_numpy()
        pM_tr = tr[["mh", "md", "ma"]].to_numpy()
        pA_te = test[["p_home", "p_draw", "p_away"]].to_numpy()
        pM_te = test[["mh", "md", "ma"]].to_numpy()
        row = {"match_id": test.match_id.values, "div": test["div"].values,
               "season": test.season.values, "match_date": test.match_date.values,
               "y": test.y.values, "p_home": np.nan, "p_draw": np.nan, "p_away": np.nan}
        if len(tr) < 200:
            continue

        # 1. mercado puro
        if test.market_ok.any():
            mm = test[test.market_ok]
            results["market"].append(pd.DataFrame({
                **{k: row[k][test.market_ok.values] for k in ("match_id", "div", "season", "match_date", "y")},
                "p_home": pM_te[test.market_ok.values, 0],
                "p_draw": pM_te[test.market_ok.values, 1],
                "p_away": pM_te[test.market_ok.values, 2],
            }))

        # 2-3. mezclas con peso ajustado en el pasado
        w_prob = fit_weight(y_tr, pA_tr, pM_tr, "prob")
        w_logit = fit_weight(y_tr, pA_tr, pM_tr, "logit")
        if s == seasons[0]:
            weights["prob"], weights["logit"] = w_prob, w_logit
        out, fb = fallback(pA_te, pM_te, mix(pA_te, pM_te, w_prob, "prob"))
        results["linear_pool"].append(pd.DataFrame({**{k: row[k] for k in row if k != "p_home" and k != "p_draw" and k != "p_away"},
                                                    "p_home": out[:, 0], "p_draw": out[:, 1], "p_away": out[:, 2]}))
        out, _ = fallback(pA_te, pM_te, mix(pA_te, pM_te, w_logit, "logit"))
        results["logit_pool"].append(pd.DataFrame({**{k: row[k] for k in row if k not in ("p_home", "p_draw", "p_away")},
                                                   "p_home": out[:, 0], "p_draw": out[:, 1], "p_away": out[:, 2]}))

        Xtr = stack_features(pA_tr, pM_tr, tr)
        Xte = stack_features(pA_te, np.where(np.isfinite(pM_te), pM_te, pA_te), test)
        # 4. stacking logístico
        lr = make_pipeline(SimpleImputer(strategy="median"), StandardScaler(),
                           LogisticRegression(max_iter=3000, C=0.5))
        lr.fit(Xtr, y_tr)
        out, _ = fallback(pA_te, pM_te, lr.predict_proba(Xte))
        results["stack_logit"].append(pd.DataFrame({**{k: row[k] for k in row if k not in ("p_home", "p_draw", "p_away")},
                                                    "p_home": out[:, 0], "p_draw": out[:, 1], "p_away": out[:, 2]}))
        # 5. corrección residual: log pM + g(x)
        Rtr = logit(pM_tr) - logit(pA_tr)
        Rte = logit(np.where(np.isfinite(pM_te), pM_te, pA_te)) - logit(pA_te)
        Ftr = np.column_stack([Rtr, tr[["elo_diff"]].to_numpy() / 100.0,
                               tr[["form_gd_diff_r10"]].to_numpy()])
        Fte = np.column_stack([Rte, test[["elo_diff"]].to_numpy() / 100.0,
                               test[["form_gd_diff_r10"]].to_numpy()])
        lr2 = make_pipeline(SimpleImputer(strategy="median"), StandardScaler(),
                            LogisticRegression(max_iter=3000, C=0.5))
        lr2.fit(Ftr, y_tr)
        corr = lr2.predict_proba(Fte)
        out = softmax(logit(np.where(np.isfinite(pM_te), pM_te, pA_te)) + np.log(np.clip(corr, 1e-9, 1)))
        out, _ = fallback(pA_te, pM_te, out)
        results["residual_logit"].append(pd.DataFrame({**{k: row[k] for k in row if k not in ("p_home", "p_draw", "p_away")},
                                                       "p_home": out[:, 0], "p_draw": out[:, 1], "p_away": out[:, 2]}))
        # 6. stacking HGB
        hgb = HistGradientBoostingClassifier(max_iter=120, learning_rate=0.06, max_leaf_nodes=15,
                                             l2_regularization=2.0, min_samples_leaf=60,
                                             early_stopping=False, random_state=SEED)
        hgb.fit(Xtr, y_tr)
        out, _ = fallback(pA_te, pM_te, hgb.predict_proba(Xte))
        results["stack_hgb"].append(pd.DataFrame({**{k: row[k] for k in row if k not in ("p_home", "p_draw", "p_away")},
                                                  "p_home": out[:, 0], "p_draw": out[:, 1], "p_away": out[:, 2]}))
        print(f"  season {s}: n={len(test):,} market_ok={test.market_ok.mean():.1%} "
              f"w_prob={w_prob:.2f} w_logit={w_logit:.2f}", flush=True)

    dfs = {k: pd.concat(v, ignore_index=True) for k, v in results.items() if v}
    # 7. ensemble_b: pesos ajustados en val sobre linear_pool + stack_logit + residual
    members = [k for k in ("linear_pool", "stack_logit", "residual_logit", "stack_hgb") if k in dfs]
    if len(members) >= 2:
        pivot = {k: dfs[k].set_index("match_id")[["p_home", "p_draw", "p_away"]] for k in members}
        ids = pivot[members[0]].index
        for k in members[1:]:
            ids = ids.intersection(pivot[k].index)
        meta = dfs[members[0]].set_index("match_id").reindex(ids)
        val = ids[meta["season"].map(season_of) == 2023]
        yv = meta.reindex(val)["y"].to_numpy()
        Pv = np.stack([pivot[k].reindex(val).to_numpy() for k in members])
        def obj(z):
            w = np.exp(z - z.max()); w /= w.sum()
            return logloss(yv, np.tensordot(w, Pv, axes=1))
        z = minimize(obj, np.zeros(len(members)), method="Nelder-Mead").x
        w = np.exp(z - z.max()); w /= w.sum()
        print("ensemble_b pesos:", dict(zip(members, w.round(3))))
        mixp = np.zeros((len(ids), 3))
        for wk, k in zip(w, members):
            mixp += wk * pivot[k].reindex(ids).to_numpy()
        ens = meta[["div", "season", "match_date", "y"]].copy()
        ens["p_home"], ens["p_draw"], ens["p_away"] = mixp[:, 0], mixp[:, 1], mixp[:, 2]
        dfs["ensemble_b"] = ens.reset_index()
        W = dict(zip(members, w.round(4).tolist()))
    else:
        W = {}

    for name, p in dfs.items():
        p.to_csv(os.path.join(outdir, f"pred_{name}.csv"), index=False)
    cfg = {"base_motor_a": args.base, "market_phase": phase,
           "ensemble_weights": W, "first_season": FIRST,
           "market_coverage": float(df.market_ok.mean()),
           "market_sources": df.loc[df.market_ok, "market_src"].value_counts().to_dict(),
           "generated_at":
           datetime.now(timezone.utc).isoformat(timespec="seconds")}
    with open(os.path.join(outdir, "config.json"), "w") as f:
        json.dump(cfg, f, indent=1)
    print(f"escrito -> {outdir}")
    for name, p in dfs.items():
        print(name, len(p), round(logloss(p.y.to_numpy(), p[['p_home','p_draw','p_away']].to_numpy()), 4))


if __name__ == "__main__":
    main()
