#!/usr/bin/env python3
"""EXP10 — Empates: fiabilidad de P(D), sesgo de argmax y modelo especializado.

Preguntas:
  1. ¿Está bien calibrada P(empate) del Motor A? (fiabilidad por deciles, ECE por clase)
  2. ¿El argmax predice empates alguna vez? (sesgo estructural)
  3. ¿Un umbral sobre P(empate) mejora accuracy / balanced accuracy?
  4. ¿Un modelo binario especializado en empates mejora log-loss / RPS / Brier del 1X2?

Protocolo: walk-forward desde 2010/11 (entrena con temporadas < S, evalúa S) sobre las
predicciones OOS de EXP01 (hgb por defecto) y el modelo binario de empate entrenado con
features deportivas causales. val = 2023/24; test nunca se toca.

Uso:
    ./.venv/bin/python models/a/experiments/exp10_draws.py
"""
from __future__ import annotations

import json
import os
import sys

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score

LAB_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
sys.path.insert(0, LAB_ROOT)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from common import (ART, SEED, VAL, brier, ece_class, exp01_dir,  # noqa: E402
                    find_clean_predictions, load_features,
                    load_exp01_predictions, log_loss, paired_bootstrap_blocks,
                    per_match_log_loss, rps, summarize, utc_now, write_json)

TAG = "A06_EXP10_draws_20261109"
OUT = os.path.join(ART, TAG)
EVAL_FROM = 2010
BASE_MODEL = "hgb"
COLS = ["match_id", "div", "season", "match_date", "y"]


def load_feature_list():
    with open(os.path.join(ART, "EXP01_baselines_20261109", "config.json")) as f:
        return json.load(f)["FEATURES"]


def draw_reliability(y, pd_, n_bins=10) -> pd.DataFrame:
    bins = np.clip((pd_ * n_bins).astype(int), 0, n_bins - 1)
    rows = []
    for b in range(n_bins):
        m = bins == b
        if m.sum() == 0:
            continue
        rows.append({"bin": b, "lo": b / n_bins, "hi": (b + 1) / n_bins, "n": int(m.sum()),
                     "p_mean": float(pd_[m].mean()), "obs_draw": float((y[m] == 1).mean()),
                     "gap": float((y[m] == 1).mean() - pd_[m].mean())})
    return pd.DataFrame(rows)


def combine_replace(p, p_spec) -> np.ndarray:
    """Sustituye P(D) por la del modelo especializado y reasigna H/A proporcionalmente."""
    d = np.clip(p_spec, 0.02, 0.98)
    rest = 1.0 - d
    ph, pa = p[:, 0].copy(), p[:, 2].copy()
    pha = np.clip(ph + pa, 1e-9, None)
    out = np.column_stack([rest * ph / pha, d, rest * pa / pha])
    return out / out.sum(axis=1, keepdims=True)


def combine_blend(p, p_spec, w=0.5) -> np.ndarray:
    d = np.clip((1 - w) * p[:, 1] + w * p_spec, 0.02, 0.98)
    rest = 1.0 - d
    ph, pa = p[:, 0].copy(), p[:, 2].copy()
    pha = np.clip(ph + pa, 1e-9, None)
    out = np.column_stack([rest * ph / pha, d, rest * pa / pha])
    return out / out.sum(axis=1, keepdims=True)


def decision_metrics(y, p, threshold=None) -> dict:
    """Accuracy del argmax y de la regla 'empate si p_D > umbral'."""
    out = {}
    pred = np.argmax(p, axis=1)
    out["acc_argmax"] = float(np.mean(pred == y))
    out["draws_called_argmax"] = int((pred == 1).sum())
    if threshold is not None:
        pred_t = np.where(p[:, 1] > threshold, 1, np.where(p[:, 0] >= p[:, 2], 0, 2))
        out[f"acc_thr_{threshold:.2f}"] = float(np.mean(pred_t == y))
        out[f"draws_thr_{threshold:.2f}"] = int((pred_t == 1).sum())
        rec = [float(np.mean(pred_t[y == k] == k)) for k in range(3)]
        out[f"balacc_thr_{threshold:.2f}"] = float(np.mean(rec))
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    global BASE_MODEL
    if find_clean_predictions(BASE_MODEL)[0] is None:
        for alt in ("logit", "elo_ordered"):
            if find_clean_predictions(alt)[0] is not None:
                BASE_MODEL = alt
                break
    src, src_label = exp01_dir()
    contaminated = src_label.startswith("EXP01_baselines")
    print(f"[EXP10] fuente base: {src_label}"
          + ("  (CONTAMINADA: pendiente reejecutar sobre EXP01_final)" if contaminated else ""))
    feats = load_feature_list()
    df = load_features(["match_id", "div", "season", "match_date", "y"] + feats)
    base = load_exp01_predictions(BASE_MODEL)
    base = base[base.sstart >= EVAL_FROM].reset_index(drop=True)
    m = base.merge(df[["match_id"] + feats], on="match_id", how="left")
    assert len(m) == len(base) and m[feats].notna().any(axis=1).mean() > 0.99
    print(f"[EXP10] base={BASE_MODEL} | {len(m):,} partidos {m.sstart.min()}-{m.sstart.max()}")

    y = m["y"].to_numpy(int)
    p = m[["p_home", "p_draw", "p_away"]].to_numpy(float)
    s = m["sstart"].to_numpy()
    X = m[feats].to_numpy(dtype=float)

    # ---------------------------------------------------------------- 1) fiabilidad de P(D)
    rel_all = draw_reliability(y, p[:, 1])
    rel_val = draw_reliability(y[s == VAL], p[s == VAL, 1])
    rel_all.to_csv(os.path.join(OUT, "draw_reliability_wf.csv"), index=False)
    rel_val.to_csv(os.path.join(OUT, "draw_reliability_val.csv"), index=False)
    print("\n[EXP10] fiabilidad P(empate) — val 2023/24")
    print(rel_val.to_string(index=False))
    print(f"[EXP10] ECE draw val={ece_class(y[s == VAL], p[s == VAL], 1):.4f} | "
          f"P(D) media={p[s == VAL, 1].mean():.4f} vs observado={(y[s == VAL] == 1).mean():.4f}")

    # ---------------------------------------------------------------- 2) sesgo de argmax
    dec_all = decision_metrics(y, p)
    dec_val = decision_metrics(y[s == VAL], p[s == VAL])
    print(f"\n[EXP10] argmax: empates predichos {dec_all['draws_called_argmax']} "
          f"de {len(y):,} (val: {dec_val['draws_called_argmax']} de {(s == VAL).sum():,}); "
          f"empates reales {(y == 1).mean():.3%}")

    # ---------------------------------------------------------------- 3) umbrales
    thr_rows = []
    for t in np.round(np.arange(0.18, 0.401, 0.01), 2):
        d = decision_metrics(y, p, float(t))
        # umbral ajustado por temporada: elegir t en temporadas previas, aplicar en S
        thr_rows.append({"threshold": float(t),
                         "acc_all": d[f"acc_thr_{t:.2f}"],
                         "draws_all": d[f"draws_thr_{t:.2f}"],
                         "balacc_all": d[f"balacc_thr_{t:.2f}"]})
    thr_df = pd.DataFrame(thr_rows)
    thr_df.to_csv(os.path.join(OUT, "threshold_sweep.csv"), index=False)
    best_thr_row = thr_df.loc[thr_df.acc_all.idxmax()]
    print(f"[EXP10] mejor umbral global (in-sample, solo diagnóstico): t={best_thr_row.threshold:.2f} "
          f"acc={best_thr_row.acc_all:.4f} vs argmax={dec_all['acc_argmax']:.4f}")

    # umbral honesto: elegido en el walk-forward con temporadas anteriores
    oos_thr = []
    for season in range(EVAL_FROM + 2, VAL + 1):
        tr = s < season
        te = s == season
        ytr, ptr = y[tr], p[tr]
        best_t, best_acc = 0.5, -1.0
        for t in np.round(np.arange(0.18, 0.401, 0.01), 2):
            acc = decision_metrics(ytr, ptr, float(t))[f"acc_thr_{t:.2f}"]
            if acc > best_acc:
                best_acc, best_t = acc, float(t)
        pred_t = np.where(p[te, 1] > best_t, 1, np.where(p[te, 0] >= p[te, 2], 0, 2))
        oos_thr.append({"season": int(season), "t": best_t, "n": int(te.sum()),
                        "acc": float(np.mean(pred_t == y[te])),
                        "acc_argmax": float(np.mean(np.argmax(p[te], axis=1) == y[te])),
                        "draws_called": int((pred_t == 1).sum())})
    oos_thr_df = pd.DataFrame(oos_thr)
    oos_thr_df.to_csv(os.path.join(OUT, "threshold_walk_forward.csv"), index=False)
    d_acc = oos_thr_df.acc - oos_thr_df.acc_argmax
    print(f"[EXP10] umbral walk-forward: Δaccuracy medio={d_acc.mean():+.4f} "
          f"(IC bootstrap por temporada [{np.percentile(d_acc, 2.5):+.4f},"
          f"{np.percentile(d_acc, 97.5):+.4f}]), empates llamados="
          f"{oos_thr_df.draws_called.sum()}")

    # ---------------------------------------------------------------- 4) modelo especializado
    print("\n[EXP10] modelo binario de empate (HGB), walk-forward...", flush=True)
    p_spec = np.full(len(m), np.nan)
    auc_by_season = {}
    for season in range(EVAL_FROM, VAL + 1):
        tr = s < season
        te = s == season
        if tr.sum() < 20000:
            continue
        clf = HistGradientBoostingClassifier(
            max_iter=120, learning_rate=0.06, max_leaf_nodes=15, min_samples_leaf=80,
            l2_regularization=1.0, early_stopping=False, random_state=SEED)
        clf.fit(X[tr], (y[tr] == 1).astype(int))
        p_spec[te] = clf.predict_proba(X[te])[:, 1]
        if te.sum() > 100:
            auc_by_season[int(season)] = float(roc_auc_score((y[te] == 1).astype(int), p_spec[te]))
        print(f"  season {season}: n={int(te.sum()):,} auc={auc_by_season.get(int(season), np.nan):.4f}",
              flush=True)
    ok = np.isfinite(p_spec)
    print(f"[EXP10] AUC media WF={np.mean(list(auc_by_season.values())):.4f} "
          f"(climatología = 0.5)")

    # sistemas combinados
    systems = {
        "base": p,
        "replace_spec": np.where(ok[:, None], combine_replace(p, np.nan_to_num(p_spec, nan=0.27)), p),
        "blend50_spec": np.where(ok[:, None], combine_blend(p, np.nan_to_num(p_spec, nan=0.27), 0.5), p),
    }
    evals = {}
    for name, q in systems.items():
        evals[name] = {"walk_forward_2010_2023": summarize(y[ok], q[ok]),
                       "val_2023": summarize(y[ok & (s == VAL)], q[ok & (s == VAL)])}
        print(f"  {name:14s} WF ll={evals[name]['walk_forward_2010_2023']['log_loss']:.5f} "
              f"rps={evals[name]['walk_forward_2010_2023']['rps']:.5f} | "
              f"val ll={evals[name]['val_2023']['log_loss']:.5f} "
              f"rps={evals[name]['val_2023']['rps']:.5f}")

    # bootstrap val de la diferencia de log-loss y RPS
    sel_val = ok & (s == VAL)
    boot = {}
    for name in ("replace_spec", "blend50_spec"):
        boot[name] = {
            "log_loss": paired_bootstrap_blocks(
                per_match_log_loss(y[sel_val], systems["base"][sel_val]),
                per_match_log_loss(y[sel_val], systems[name][sel_val]),
                m.loc[sel_val, "div"].to_numpy(), B=2000),
        }
    # RPS por partido
    def rps_pm(yy, pp):
        o = np.eye(3)[yy]
        cp = np.cumsum(pp, axis=1)[:, :2]
        co = np.cumsum(o, axis=1)[:, :2]
        return np.sum((cp - co) ** 2, axis=1) / 2.0

    for name in ("replace_spec", "blend50_spec"):
        boot[name]["rps"] = paired_bootstrap_blocks(
            rps_pm(y[sel_val], systems["base"][sel_val]),
            rps_pm(y[sel_val], systems[name][sel_val]),
            m.loc[sel_val, "div"].to_numpy(), B=2000)

    # calibración del modelo especializado
    spec_pd = p_spec[ok]
    print(f"[EXP10] P(D) especializado: media={spec_pd.mean():.4f} vs observado="
          f"{(y[ok] == 1).mean():.4f}")
    spec_rel = draw_reliability(y[ok], spec_pd)
    spec_rel.to_csv(os.path.join(OUT, "spec_draw_reliability.csv"), index=False)

    payload = {
        "experiment": "EXP10_draws",
        "generated_at": utc_now(), "seed": SEED,
        "base_model": BASE_MODEL,
        "inputs_source": src_label,
        "status": ("pending_rerun_on_EXP01_final" if contaminated else "final"),
        "protocol": {"walk_forward_from": EVAL_FROM, "val": VAL, "test_used": False},
        "n": int(len(m)),
        "draw_rate": float((y == 1).mean()),
        "draw_reliability_val": rel_val.to_dict(orient="records"),
        "calibration": {"p_draw_mean_val": float(p[s == VAL, 1].mean()),
                        "draw_rate_val": float((y[s == VAL] == 1).mean()),
                        "ece_draw_val": float(ece_class(y[s == VAL], p[s == VAL], 1))},
        "argmax": {"draws_called_all": dec_all["draws_called_argmax"],
                   "draws_called_val": dec_val["draws_called_argmax"],
                   "acc_all": dec_all["acc_argmax"],
                   "threshold_best_in_sample": float(best_thr_row.threshold),
                   "acc_best_in_sample": float(best_thr_row.acc_all)},
        "threshold_walk_forward": {
            "mean_delta_acc_vs_argmax": float(d_acc.mean()),
            "seasons": oos_thr_df.to_dict(orient="records"),
        },
        "specialized_model": {
            "auc_by_season": auc_by_season,
            "auc_mean_wf": float(np.mean(list(auc_by_season.values()))),
            "p_draw_mean": float(spec_pd.mean()),
            "observed_draw_rate": float((y[ok] == 1).mean()),
        },
        "systems": evals,
        "bootstrap_val": boot,
    }
    write_json(os.path.join(OUT, "metrics.json"), payload)
    write_json(os.path.join(OUT, "config.json"), {
        "base_model": BASE_MODEL, "features": feats, "eval_from": EVAL_FROM, "val": VAL,
        "seed": SEED, "draw_model": "HistGradientBoostingClassifier binario",
        "combination": "replace y blend50 sobre P(D), reasignación proporcional H/A",
        "test_used": False,
    })

    print("\n=== EXP10 conclusión numérica ===")
    print(f"  P(D) media val={payload['calibration']['p_draw_mean_val']:.4f} vs "
          f"observado={payload['calibration']['draw_rate_val']:.4f} "
          f"(ECE={payload['calibration']['ece_draw_val']:.4f})")
    print(f"  argmax llama empate {dec_all['draws_called_argmax']} veces "
          f"(reales {(y == 1).mean():.1%})")
    print(f"  modelo especializado AUC={payload['specialized_model']['auc_mean_wf']:.4f}")
    print(f"  Δ ll val (replace)={boot['replace_spec']['log_loss']['mean_diff']:+.5f} "
          f"CI[{boot['replace_spec']['log_loss']['ci95_lo']:+.5f},"
          f"{boot['replace_spec']['log_loss']['ci95_hi']:+.5f}]")
    print(f"  Δ ll val (blend50)={boot['blend50_spec']['log_loss']['mean_diff']:+.5f} "
          f"CI[{boot['blend50_spec']['log_loss']['ci95_lo']:+.5f},"
          f"{boot['blend50_spec']['log_loss']['ci95_hi']:+.5f}]")
    print(f"[EXP10] artefactos -> {OUT}")


if __name__ == "__main__":
    main()
