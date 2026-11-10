#!/usr/bin/env python3
"""Motor B / Motor C (v2): Motor Anclado a Mercado Multi-Fuente y Predictor de Valor/Cierre.

Escenarios (mismos partidos, comparación pareada walk-forward):
  1. market                       mercado base de-vig (power)
  2. linear_pool                  mezcla lineal p = (1-w) pA + w pM, w ajustado en temporadas previas
  3. logit_pool                   mezcla en espacio logit con consenso multi-mercado (PS+Avg+AH+B365)
  4. stack_logit                  regresión logística multinomial sobre log pA, log pM, AH/Totales, Sharp-vs-Soft y features 2ª gen
  5. residual_logit               corrección residual calibrada sobre el consenso multi-mercado (sin doble conteo de prior)
  6. stack_hgb                    HistGradientBoosting regularizado sobre el vector extendido
  7. ensemble_b                   mezcla convexa óptima ajustada estrictamente en val (2023/24)

Uso:
  ./.venv/bin/python models/b/train_motor_b.py \
      --motor-a artifacts/EXP01_baselines_20261109 --base ensemble --tag EXP08_motor_b
"""
from __future__ import annotations

import argparse
import json
import os
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
    grid = np.linspace(0, 1, 81)
    best_w, best = 0.85, np.inf
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


def build_consensus_market_probs(df: pd.DataFrame, phase: str) -> tuple[np.ndarray, np.ndarray]:
    """Construye dos tensores (N, 3):
      - `p_base`: probabilidad primaria del mercado (cadena PS power -> B365 power -> Avg power)
      - `p_cons`: super-consenso multi-mercado ponderado (PS Shin + Avg Shin + BFE/BF + AH+Totales implícito + B365 Shin)
    """
    n = len(df)
    # 1. Cadena primaria compatible con v1
    chain = []
    for label, src, method in (
        ("ps_power", "ps", "power"),
        ("b365_power", "b365", "power"),
        ("avg_power", "avg", "power"),
        ("ps_prop", "ps", "proportional"),
        ("b365_prop", "b365", "proportional"),
    ):
        cols = [f"mkt_{phase}_{src}_{method}_{k}" for k in "hda"]
        if all(c in df.columns for c in cols):
            chain.append((label, cols))
    if not chain:
        raise SystemExit(f"sin cuotas {phase}")

    mh = pd.Series(np.nan, index=df.index)
    md = pd.Series(np.nan, index=df.index)
    ma = pd.Series(np.nan, index=df.index)
    src_used = pd.Series("", index=df.index)
    for label, cols in reversed(chain):
        ok = df[cols].notna().all(axis=1)
        mh.loc[ok], md.loc[ok], ma.loc[ok] = df.loc[ok, cols[0]], df.loc[ok, cols[1]], df.loc[ok, cols[2]]
        src_used.loc[ok] = label

    df["mh"], df["md"], df["ma"] = mh, md, ma
    df["market_src"] = src_used
    df["market_ok"] = df[["mh", "md", "ma"]].notna().all(axis=1)
    p_base = df[["mh", "md", "ma"]].to_numpy(dtype=float)

    # 2. Super-consenso multi-mercado v2.1 (Pondera Sharp PS Power, Max Power, Avg Power, Exchange BF/BFE, AH y B365)
    # Pesos relativos de eficiencia informacional cuando cada fuente está presente:
    sources_weights = [
        ([f"mkt_{phase}_ps_power_{k}" for k in "hda"], 0.56),
        ([f"mkt_{phase}_max_power_{k}" for k in "hda"], 0.22),
        ([f"mkt_{phase}_avg_power_{k}" for k in "hda"], 0.10),
        ([f"mkt_{phase}_bfe_power_{k}" for k in "hda"], 0.05),
        ([f"mkt_{phase}_bf_power_{k}" for k in "hda"], 0.03),
        ([f"mkt_{phase}_ah_implied_{k}" for k in "hda"], 0.02),
        ([f"mkt_{phase}_b365_power_{k}" for k in "hda"], 0.02),
    ]
    num = np.zeros((n, 3), dtype=float)
    den = np.zeros((n, 1), dtype=float)
    for cols, w in sources_weights:
        if all(c in df.columns for c in cols):
            mat = df[cols].to_numpy(dtype=float)
            ok = np.all(np.isfinite(mat), axis=1) & (mat.sum(axis=1) > 0.5)
            if ok.any():
                mat_norm = np.where(ok[:, None], mat / np.where(ok[:, None], mat.sum(axis=1, keepdims=True), 1.0), 0.0)
                num += w * mat_norm
                den += np.where(ok[:, None], w, 0.0)

    has_cons = den[:, 0] > 0.0
    p_cons = np.where(has_cons[:, None], num / np.maximum(1e-9, den), p_base)
    return p_base, p_cons


def stack_features(pA: np.ndarray, pM: np.ndarray, pCons: np.ndarray, df: pd.DataFrame, phase: str) -> np.ndarray:
    """Construye la matriz de features para Motor B/C combinando logits, divergencias Sharp/AH y señales v2.1."""
    log_pA = logit(pA)
    log_pM = logit(pM)
    log_pC = logit(pCons)
    res_CA = log_pC - log_pA
    res_CM = log_pC - log_pM

    def col_or_zero(name: str, scale: float = 1.0) -> np.ndarray:
        if name in df.columns:
            return np.nan_to_num(df[name].to_numpy(dtype=float) / scale, nan=0.0)
        return np.zeros(len(df), dtype=float)

    extras = [
        col_or_zero("elo_diff", 100.0),
        col_or_zero("pi_diff", 1.0),
        col_or_zero("form_gd_diff_r10", 1.0),
        col_or_zero("xgd_diff_r10", 1.0),
        col_or_zero("xg_overperf_diff_r5", 1.0),
        col_or_zero("form_gd_res_diff_r5", 1.0),
        col_or_zero("elo_closeness", 1.0),
        col_or_zero("gk_prevented_diff_r10", 1.0),
        col_or_zero("field_tilt_diff_r5", 1.0),
        col_or_zero("xgd_regime_shift_diff", 1.0),
        col_or_zero(f"mkt_{phase}_sharp_vs_b365_h", 1.0),
        col_or_zero(f"mkt_{phase}_sharp_vs_b365_d", 1.0),
        col_or_zero(f"mkt_{phase}_sharp_vs_b365_a", 1.0),
        col_or_zero(f"mkt_{phase}_ah_vs_b365_h", 1.0),
        col_or_zero(f"mkt_{phase}_ah_vs_b365_a", 1.0),
        col_or_zero(f"mkt_{phase}_max_over_avg_h", 1.0),
        col_or_zero(f"mkt_{phase}_max_over_avg_a", 1.0),
        col_or_zero(f"tot_{phase}_implied_goals", 3.0),
    ]
    return np.column_stack([log_pC, log_pM, log_pA, res_CA, res_CM] + extras)


def _residual_components(pA: np.ndarray, pCons: np.ndarray, df: pd.DataFrame, phase: str):
    logC = logit(pCons)
    pBase = df[["mh", "md", "ma"]].fillna(1.0 / 3.0).to_numpy(dtype=float)
    diffBase = logit(pBase) - logC
    diffA = logit(pA) - logC
    if all(c in df.columns for c in ("dc_prob_h", "dc_prob_d", "dc_prob_a")):
        dc_p = df[["dc_prob_h", "dc_prob_d", "dc_prob_a"]].fillna(1.0 / 3.0).to_numpy(dtype=float)
    else:
        dc_p = pA
    diffDC = logit(dc_p) - logC

    sh = np.column_stack([
        np.nan_to_num(df.get(f"mkt_{phase}_sharp_vs_b365_{k}", pd.Series(0.0, index=df.index)).to_numpy(dtype=float), nan=0.0)
        for k in "hda"
    ])
    ah = np.column_stack([
        np.nan_to_num(df.get(f"mkt_{phase}_ah_vs_b365_{k}", pd.Series(0.0, index=df.index)).to_numpy(dtype=float), nan=0.0)
        for k in "hda"
    ])
    tot_goals = np.nan_to_num(df.get(f"tot_{phase}_implied_goals", pd.Series(2.65, index=df.index)).to_numpy(dtype=float), nan=2.65)
    elo_cl = np.nan_to_num(df.get("elo_closeness", pd.Series(0.5, index=df.index)).to_numpy(dtype=float), nan=0.5)
    low_tot_draw = (2.65 - np.clip(tot_goals, 1.6, 3.8)) * elo_cl
    draw_vec = np.column_stack([np.zeros(len(df)), low_tot_draw, np.zeros(len(df))])

    tact = (
        0.35 * np.nan_to_num(df.get("xgd_diff_r10", pd.Series(0.0, index=df.index)).to_numpy(dtype=float), nan=0.0)
        + 0.25 * np.nan_to_num(df.get("gk_prevented_diff_r10", pd.Series(0.0, index=df.index)).to_numpy(dtype=float), nan=0.0)
        + 0.25 * np.nan_to_num(df.get("pi_diff", pd.Series(0.0, index=df.index)).to_numpy(dtype=float), nan=0.0)
        + 0.15 * np.nan_to_num(df.get("xgd_regime_shift_diff", pd.Series(0.0, index=df.index)).to_numpy(dtype=float), nan=0.0)
    )
    tact_vec = np.column_stack([tact, np.zeros(len(df)), -tact])
    return logC, diffBase, diffA, diffDC, sh, ah, draw_vec, tact_vec


def fit_residual_tilting(y: np.ndarray, pA: np.ndarray, pCons: np.ndarray, df: pd.DataFrame, phase: str):
    """Ajusta un modelo de corrección residual v2.1 anclado al super-consenso:
    Combina temperatura, diferencial PS-vs-Consenso, Motor A (Tachyon), Dixon-Coles,
    Sharp-vs-Soft, Handicap Asiático, Totales implícitos (geometría del empate) y Opta-proxies tácticos.
    """
    logC, diffBase, diffA, diffDC, sh, ah, draw_vec, tact_vec = _residual_components(pA, pCons, df, phase)

    def loss(params):
        tau, w_base, alpha_a, alpha_dc, w_sh, w_ah, w_tot, w_tact, b0, b1 = params
        bias = np.array([b0, b1, -(b0 + b1)])
        z = (
            tau * logC
            + w_base * diffBase
            + alpha_a * diffA
            + alpha_dc * diffDC
            + w_sh * sh
            + w_ah * ah
            + w_tot * draw_vec
            + w_tact * tact_vec
            + bias
        )
        p = softmax(z)
        nll = -np.mean(np.log(np.clip(p[np.arange(len(y)), y], 1e-15, 1.0)))
        reg = 2e-3 * (
            (tau - 1.0) ** 2 + w_base ** 2 + alpha_a ** 2 + alpha_dc ** 2
            + w_sh ** 2 + w_ah ** 2 + w_tot ** 2 + w_tact ** 2 + b0 ** 2 + b1 ** 2
        )
        return float(nll + reg)

    res = minimize(loss, x0=[1.0, 0.20, 0.06, 0.02, 0.20, 0.10, 0.05, 0.01, 0.0, 0.0], method="BFGS")
    return res.x


def predict_residual_tilting(params, pA: np.ndarray, pCons: np.ndarray, df: pd.DataFrame, phase: str) -> np.ndarray:
    tau, w_base, alpha_a, alpha_dc, w_sh, w_ah, w_tot, w_tact, b0, b1 = params
    bias = np.array([b0, b1, -(b0 + b1)])
    logC, diffBase, diffA, diffDC, sh, ah, draw_vec, tact_vec = _residual_components(pA, pCons, df, phase)
    z = (
        tau * logC
        + w_base * diffBase
        + alpha_a * diffA
        + alpha_dc * diffDC
        + w_sh * sh
        + w_ah * ah
        + w_tot * draw_vec
        + w_tact * tact_vec
        + bias
    )
    return softmax(z)


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

    feat_cols_needed = [
        "match_id",
        "elo_diff",
        "pi_diff",
        "clubelo_diff",
        "dc_prob_h",
        "dc_prob_d",
        "dc_prob_a",
        "form_gd_diff_r10",
        "xgd_diff_r10",
        "xg_overperf_diff_r5",
        "form_gd_res_diff_r5",
        "elo_closeness",
        "low_scoring_tight_match",
        "gk_prevented_diff_r10",
        "field_tilt_diff_r5",
        "xgd_regime_shift_diff",
        "h_points_r5",
        "a_points_r5",
    ]
    feats_all = pd.read_parquet(os.path.join(PROC, "features.parquet"))
    avail_f = [c for c in feat_cols_needed if c in feats_all.columns]
    pa = pa.merge(feats_all[avail_f], on="match_id", how="left")

    mk = pd.read_parquet(os.path.join(PROC, "features_market.parquet"))
    phase = args.phase
    mk_cols = ["match_id"] + [
        c for c in mk.columns if c.startswith("mkt_") or c.startswith("tot_") or c.startswith("ah_")
    ]
    df = pa.merge(mk[mk_cols], on="match_id", how="left")

    p_base_all, p_cons_all = build_consensus_market_probs(df, phase)
    df["cons_h"], df["cons_d"], df["cons_a"] = p_cons_all[:, 0], p_cons_all[:, 1], p_cons_all[:, 2]
    print(
        f"fase {phase}: mercado disponible en {df.market_ok.mean():.1%} de los partidos; "
        f"fuentes: {df.loc[df.market_ok,'market_src'].value_counts().to_dict()}"
    )

    seasons = sorted(df.sstart.unique())
    results = {
        k: []
        for k in (
            "market",
            "linear_pool",
            "logit_pool",
            "stack_logit",
            "residual_logit",
            "stack_hgb",
            "ensemble_b",
        )
    }
    weights = {}
    for s in seasons:
        if s < FIRST:
            continue
        train = df[df.sstart < s]
        test = df[df.sstart == s].copy()
        if len(train) == 0 or len(test) == 0:
            continue
        tr = train[train.market_ok]
        if len(tr) < 200:
            continue
        y_tr = tr.y.to_numpy()
        pA_tr = tr[["p_home", "p_draw", "p_away"]].to_numpy()
        pM_tr = tr[["mh", "md", "ma"]].to_numpy()
        pC_tr = tr[["cons_h", "cons_d", "cons_a"]].to_numpy()

        pA_te = test[["p_home", "p_draw", "p_away"]].to_numpy()
        pM_te = test[["mh", "md", "ma"]].to_numpy()
        pC_te = test[["cons_h", "cons_d", "cons_a"]].to_numpy()
        pM_te_safe = np.where(np.isfinite(pM_te), pM_te, pA_te)
        pC_te_safe = np.where(np.isfinite(pC_te), pC_te, pA_te)

        row_meta = {
            k: test[k].values for k in ("match_id", "div", "season", "match_date", "y")
        }

        # 1. mercado puro (benchmark de referencia)
        if test.market_ok.any():
            m_mask = test.market_ok.values
            results["market"].append(
                pd.DataFrame(
                    {
                        **{k: row_meta[k][m_mask] for k in row_meta},
                        "p_home": pM_te[m_mask, 0],
                        "p_draw": pM_te[m_mask, 1],
                        "p_away": pM_te[m_mask, 2],
                    }
                )
            )

        # 2-3. mezclas en espacio de probabilidad y logit usando el super-consenso multi-mercado pC
        w_prob = fit_weight(y_tr, pA_tr, pC_tr, "prob")
        w_logit = fit_weight(y_tr, pA_tr, pC_tr, "logit")
        if s == seasons[0]:
            weights["prob"], weights["logit"] = w_prob, w_logit

        out, _ = fallback(pA_te, pC_te, mix(pA_te, pC_te_safe, w_prob, "prob"))
        results["linear_pool"].append(
            pd.DataFrame({**row_meta, "p_home": out[:, 0], "p_draw": out[:, 1], "p_away": out[:, 2]})
        )
        out, _ = fallback(pA_te, pC_te, mix(pA_te, pC_te_safe, w_logit, "logit"))
        results["logit_pool"].append(
            pd.DataFrame({**row_meta, "p_home": out[:, 0], "p_draw": out[:, 1], "p_away": out[:, 2]})
        )

        # 4. stacking logístico regularizado con señales multi-mercado
        Xtr = stack_features(pA_tr, pM_tr, pC_tr, tr, phase)
        Xte = stack_features(pA_te, pM_te_safe, pC_te_safe, test, phase)
        lr = make_pipeline(
            SimpleImputer(strategy="median"),
            StandardScaler(),
            LogisticRegression(max_iter=3000, C=0.15),
        )
        lr.fit(Xtr, y_tr)
        out, _ = fallback(pA_te, pC_te, lr.predict_proba(Xte))
        results["stack_logit"].append(
            pd.DataFrame({**row_meta, "p_home": out[:, 0], "p_draw": out[:, 1], "p_away": out[:, 2]})
        )

        # 5. corrección residual anclada a mercado (sin doble conteo de prior)
        tilt_params = fit_residual_tilting(y_tr, pA_tr, pC_tr, tr, phase)
        out_res = predict_residual_tilting(tilt_params, pA_te, pC_te_safe, test, phase)
        out, _ = fallback(pA_te, pC_te, out_res)
        results["residual_logit"].append(
            pd.DataFrame({**row_meta, "p_home": out[:, 0], "p_draw": out[:, 1], "p_away": out[:, 2]})
        )

        # 6. stacking HGB muy regularizado
        hgb = HistGradientBoostingClassifier(
            max_iter=80,
            learning_rate=0.04,
            max_leaf_nodes=12,
            l2_regularization=10.0,
            min_samples_leaf=150,
            early_stopping=False,
            random_state=SEED,
        )
        hgb.fit(Xtr, y_tr)
        out, _ = fallback(pA_te, pC_te, hgb.predict_proba(Xte))
        results["stack_hgb"].append(
            pd.DataFrame({**row_meta, "p_home": out[:, 0], "p_draw": out[:, 1], "p_away": out[:, 2]})
        )
        print(
            f"  season {s}: n={len(test):,} market_ok={test.market_ok.mean():.1%} "
            f"w_prob={w_prob:.2f} w_logit={w_logit:.2f}",
            flush=True,
        )

    dfs = {k: pd.concat(v, ignore_index=True) for k, v in results.items() if v}
    members = [k for k in ("linear_pool", "logit_pool", "stack_logit", "residual_logit", "stack_hgb") if k in dfs]
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
            w = np.exp(z - z.max())
            w /= w.sum()
            return logloss(yv, np.tensordot(w, Pv, axes=1))

        z = minimize(obj, np.zeros(len(members)), method="Nelder-Mead", options={"maxiter": 4000}).x
        w = np.exp(z - z.max())
        w /= w.sum()
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
    cfg = {
        "base_motor_a": args.base,
        "market_phase": phase,
        "ensemble_weights": W,
        "first_season": FIRST,
        "market_coverage": float(df.market_ok.mean()),
        "market_sources": df.loc[df.market_ok, "market_src"].value_counts().to_dict(),
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    with open(os.path.join(outdir, "config.json"), "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=1)
    print(f"escrito -> {outdir}")
    for name, p in dfs.items():
        print(name, len(p), round(logloss(p.y.to_numpy(), p[["p_home", "p_draw", "p_away"]].to_numpy()), 4))


if __name__ == "__main__":
    main()
