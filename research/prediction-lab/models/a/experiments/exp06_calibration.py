#!/usr/bin/env python3
"""EXP06 — Calibración de las predicciones 1X2 del Motor A (sin cuotas).

Entrada: predicciones walk-forward de EXP01 (`pred_elo_ordered`, `pred_logit`, `pred_hgb`),
que ya son out-of-sample por temporada (cada temporada se predijo con un modelo entrenado
solo con temporadas anteriores).

Métodos comparados:
  (a) identity      — sin calibrar
  (b) temperature   — p ∝ p^(1/T), 1 parámetro
  (c) vector        — z_k = a_k·log p_k + b_k, softmax (5 parámetros libres: 3 escalas + 2 sesgos)
  (d) isotonic      — isotónica one-vs-rest por clase + renormalización
  (e) dirichlet     — regresión logística multinomial sobre log p (equivalente MLR/Dirichlet)

Protocolo anti-trampa:
  - Para cada temporada evaluada S ∈ [2010, 2023] el calibrador se ajusta SOLO con
    predicciones OOS de temporadas < S y se evalúa en S (walk-forward estricto).
  - val = 2023/24 es la partición de decisión. Nunca se usa test (2024/25+).
  - Se reporta además, como diagnóstico de la trampa, el calibrador ajustado *en la misma
    temporada* (in-sample), que sobreestima la mejora.

Uso:
    ./.venv/bin/python models/a/experiments/exp06_calibration.py
"""
from __future__ import annotations

import os
import sys

import numpy as np
import pandas as pd
from scipy.optimize import minimize, minimize_scalar
from scipy.special import softmax
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression

LAB_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
sys.path.insert(0, LAB_ROOT)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from common import (ART, CALIB_FROM, SEED, VAL, brier, ece_class, ece_top,  # noqa: E402
                    exp01_dir, find_clean_predictions, load_exp01_predictions, log_loss, paired_bootstrap_blocks,
                    per_match_log_loss, reliability, rps, summarize, utc_now,
                    write_json)

TAG = "A06_EXP06_calibration_20261109"
OUT = os.path.join(ART, TAG)
BASES = ["elo_ordered", "logit", "hgb"]
METHODS = ["identity", "temperature", "vector", "isotonic", "dirichlet"]


# ------------------------------------------------------------------ calibradores
def fit_temperature(y, p) -> float:
    """T que minimiza la NLL de p^(1/T) (búsqueda 1-D acotada)."""
    lp = np.log(np.clip(p, 1e-15, 1.0))
    idx = np.arange(len(y))

    def nll(t):
        z = lp / t
        z = z - z.max(axis=1, keepdims=True)
        q = np.exp(z)
        q /= q.sum(axis=1, keepdims=True)
        return -np.mean(np.log(np.clip(q[idx, y], 1e-15, 1.0)))

    res = minimize_scalar(nll, bounds=(0.2, 5.0), method="bounded",
                          options={"xatol": 1e-6})
    return float(res.x)


def apply_temperature(p, t) -> np.ndarray:
    z = np.log(np.clip(p, 1e-15, 1.0)) / t
    z -= z.max(axis=1, keepdims=True)
    q = np.exp(z)
    return q / q.sum(axis=1, keepdims=True)


def fit_vector(y, p) -> np.ndarray:
    """z_k = a_k log p_k + b_k (b_A = 0 para identificar), softmax. Devuelve [a0,a1,a2,b0,b1]."""
    lp = np.log(np.clip(p, 1e-15, 1.0))
    n = len(y)
    oh = np.eye(3)[y]

    def fg(th):
        a = th[:3]
        b = np.array([th[3], th[4], 0.0])
        z = a * lp + b
        z -= z.max(axis=1, keepdims=True)
        q = np.exp(z)
        q /= q.sum(axis=1, keepdims=True)
        nll = -np.mean(np.log(np.clip(q[np.arange(n), y], 1e-15, 1.0)))
        gz = (q - oh) / n                       # dNLL/dz
        ga = np.sum(gz * lp, axis=0)
        gb = np.array([gz[:, 0].sum(), gz[:, 1].sum()])
        return nll, np.concatenate([ga, gb])

    res = minimize(fg, np.array([1.0, 1.0, 1.0, 0.0, 0.0]), jac=True, method="L-BFGS-B",
                   options={"maxiter": 500, "ftol": 1e-14})
    return res.x


def apply_vector(p, th) -> np.ndarray:
    lp = np.log(np.clip(p, 1e-15, 1.0))
    a = th[:3]
    b = np.array([th[3], th[4], 0.0])
    return softmax(a * lp + b, axis=1)


def fit_isotonic(y, p):
    models = []
    for k in range(3):
        iso = IsotonicRegression(y_min=0.0, y_max=1.0, out_of_bounds="clip")
        iso.fit(p[:, k], (y == k).astype(float))
        models.append(iso)
    return models


def apply_isotonic(p, models) -> np.ndarray:
    q = np.column_stack([models[k].predict(p[:, k]) for k in range(3)])
    q = np.clip(q, 1e-6, 1.0)
    return q / q.sum(axis=1, keepdims=True)


def fit_dirichlet(y, p):
    lp = np.log(np.clip(p, 1e-15, 1.0))
    m = LogisticRegression(C=1e6, max_iter=2000, tol=1e-10)
    m.fit(lp, y)
    return m


def apply_dirichlet(p, m) -> np.ndarray:
    lp = np.log(np.clip(p, 1e-15, 1.0))
    q = m.predict_proba(lp)
    return np.clip(q, 1e-9, 1.0) / np.clip(q, 1e-9, 1.0).sum(axis=1, keepdims=True)


def fit_apply(method, y, p):
    """Ajusta el calibrador y devuelve una función p -> p'."""
    if method == "identity":
        return lambda q: q
    if method == "temperature":
        t = fit_temperature(y, p)
        return lambda q: apply_temperature(q, t)
    if method == "vector":
        th = fit_vector(y, p)
        return lambda q: apply_vector(q, th)
    if method == "isotonic":
        mods = fit_isotonic(y, p)
        return lambda q: apply_isotonic(q, mods)
    if method == "dirichlet":
        m = fit_dirichlet(y, p)
        return lambda q: apply_dirichlet(q, m)
    raise ValueError(method)


# ------------------------------------------------------------------ evaluación
def evaluate(y, p) -> dict:
    o = np.eye(3)[y]
    cp = np.cumsum(p, axis=1)[:, :2]
    co = np.cumsum(o, axis=1)[:, :2]
    return {
        "n": int(len(y)),
        "log_loss": log_loss(y, p),
        "brier": brier(y, p),
        "rps": rps(y, p),
        "ece_top": ece_top(y, p),
        "ece_home": ece_class(y, p, 0),
        "ece_draw": ece_class(y, p, 1),
        "ece_away": ece_class(y, p, 2),
        "accuracy": float(np.mean(np.argmax(p, axis=1) == y)),
        "draw_pred_mean": float(p[:, 1].mean()),
        "draw_obs_rate": float(np.mean(y == 1)),
        "_ll": -np.log(np.clip(p[np.arange(len(y)), y], 1e-15, 1.0)),
        "_rps": np.sum((cp - co) ** 2, axis=1) / 2.0,
    }


def main():
    global BASES
    os.makedirs(OUT, exist_ok=True)
    missing = [b for b in BASES if find_clean_predictions(b)[0] is None]
    BASES = [b for b in BASES if b not in missing]
    if missing:
        print(f"[EXP06] AVISO: sin predicciones limpias para {missing}; se omiten "
              f"(pendiente reejecutar cuando existan)")
    sources = {b: find_clean_predictions(b)[1] for b in BASES}
    src_label = ", ".join(sorted(set(sources.values())))
    contaminated = any(v.startswith("EXP01_baselines") for v in sources.values())
    print(f"[EXP06] fuentes por modelo: {sources}")
    rows = []            # métricas por (base, método, temporada)
    params = {}          # calibradores por temporada
    pred_store = {}      # predicciones calibradas OOS (para bootstrap y artefacto)
    y_store, block_store, season_store = {}, {}, {}

    for base in BASES:
        d = load_exp01_predictions(base)
        d = d[d.sstart >= 2005].reset_index(drop=True)
        p_raw = d[["p_home", "p_draw", "p_away"]].to_numpy(float)
        y = d["y"].to_numpy(int)
        s = d["sstart"].to_numpy()
        lo = np.log(np.clip(p_raw, 1e-15, 1.0))
        params[base] = {"p_min": float(p_raw.min()), "p_max": float(p_raw.max()),
                        "logp_min": float(lo.min())}
        print(f"[EXP06] {base}: {len(d):,} partidos OOS {s.min()}-{s.max()}", flush=True)

        calib = {m: {} for m in METHODS}
        for method in METHODS:
            for season in range(CALIB_FROM, VAL + 1):
                tr = s < season
                te = s == season
                ytr, ptr = y[tr], p_raw[tr]
                fn = fit_apply(method, ytr, ptr)
                q = fn(p_raw[te])
                mt = evaluate(y[te], q)
                mt.update({"base": base, "method": method, "season": int(season)})
                rows.append(mt)
                calib[method][season] = fn
                pred_store[(base, method, season)] = q
                if method == "identity":
                    y_store[season] = y[te]
                    block_store[season] = d.loc[te, "div"].to_numpy()
                    season_store[season] = np.full(int(te.sum()), season)
            print(f"   {method:12s} listo", flush=True)

        # guardar T y parámetros por temporada de forma explícita (reajustando, es barato)
        temps, vecs = {}, {}
        for season in range(CALIB_FROM, VAL + 1):
            tr = s < season
            temps[str(season)] = float(fit_temperature(y[tr], p_raw[tr]))
            vecs[str(season)] = [float(v) for v in fit_vector(y[tr], p_raw[tr])]
        params[base]["temperature_by_season"] = temps
        params[base]["vector_by_season"] = vecs

        # diagnóstico de trampa: calibrador ajustado en la MISMA temporada de evaluación
        for method in ("temperature", "isotonic"):
            for season in (2022, VAL):
                te = s == season
                fn_ins = fit_apply(method, y[te], p_raw[te])
                q = fn_ins(p_raw[te])
                mt = evaluate(y[te], q)
                mt.update({"base": base, "method": f"{method}_inseason", "season": int(season)})
                rows.append(mt)

    res = pd.DataFrame(rows)
    res.drop(columns=["_ll", "_rps"]).to_csv(os.path.join(OUT, "metrics_by_season.csv"), index=False)

    # ---------------------------------------------------------------- agregados
    def agg(df):
        n = df.n.sum()
        return {
            "n": int(n),
            "log_loss": float(np.average(df.log_loss, weights=df.n)),
            "brier": float(np.average(df.brier, weights=df.n)),
            "rps": float(np.average(df.rps, weights=df.n)),
            "ece_top": float(np.average(df.ece_top, weights=df.n)),
            "ece_home": float(np.average(df.ece_home, weights=df.n)),
            "ece_draw": float(np.average(df.ece_draw, weights=df.n)),
            "ece_away": float(np.average(df.ece_away, weights=df.n)),
            "accuracy": float(np.average(df.accuracy, weights=df.n)),
            "draw_pred_mean": float(np.average(df.draw_pred_mean, weights=df.n)),
            "draw_obs_rate": float(np.average(df.draw_obs_rate, weights=df.n)),
        }

    wf = res[~res.method.str.endswith("inseason") & (res.season >= CALIB_FROM)]
    summary, deltas, boot = {}, {}, {}
    for base in BASES:
        summary[base] = {}
        for method in METHODS:
            sub = wf[(wf.base == base) & (wf.method == method)]
            summary[base][method] = {"walk_forward_2010_2023": agg(sub),
                                     "val_2023": agg(sub[sub.season == VAL])}
        # deltas vs identity con bootstrap pareado
        ident = pred_store[(base, "identity", VAL)]
        yv = y_store[VAL]
        blk = block_store[VAL]
        for method in METHODS[1:]:
            q = pred_store[(base, method, VAL)]
            ll_id, ll_m = per_match_log_loss(yv, ident), per_match_log_loss(yv, q)
            # ventana walk-forward completa
            ll_id_all, ll_m_all, blk_all, sea_all = [], [], [], []
            for season in range(CALIB_FROM, VAL + 1):
                yi = y_store[season]
                ll_id_all.append(per_match_log_loss(yi, pred_store[(base, "identity", season)]))
                ll_m_all.append(per_match_log_loss(yi, pred_store[(base, method, season)]))
                blk_all.append(block_store[season])
                sea_all.append(season_store[season])
            ll_id_all = np.concatenate(ll_id_all)
            ll_m_all = np.concatenate(ll_m_all)
            blk_all = np.concatenate(blk_all)
            sea_all = np.concatenate(sea_all)
            blocks_wf = np.array([f"{a}_{b}" for a, b in zip(sea_all, blk_all)])
            deltas.setdefault(base, {})[method] = {
                # convención: d = método - identidad (negativo = el calibrador mejora)
                "val_2023": {"d_log_loss_vs_identity": float(ll_m.mean() - ll_id.mean()),
                             "bootstrap": paired_bootstrap_blocks(ll_m, ll_id, blk, B=2000)},
                "walk_forward": {
                    "d_log_loss_vs_identity": float(ll_m_all.mean() - ll_id_all.mean()),
                    "bootstrap": paired_bootstrap_blocks(ll_m_all, ll_id_all, blocks_wf,
                                                         B=2000)},
            }
        summary[base]["delta_vs_identity"] = deltas[base]

    # ---------------------------------------------------------------- fiabilidad val
    rel_rows = []
    for base in BASES:
        for method in METHODS:
            q = pred_store[(base, method, VAL)]
            r = reliability(y_store[VAL], q)
            r["base"], r["method"] = base, method
            rel_rows.append(r)
    pd.concat(rel_rows, ignore_index=True).to_csv(
        os.path.join(OUT, "reliability_val.csv"), index=False)

    # ---------------------------------------------------------------- artefacto predicciones
    best_by_base, best_pred = {}, []
    for base in BASES:
        vals = {m: summary[base][m]["val_2023"]["log_loss"] for m in METHODS}
        bm = min(vals, key=vals.get)
        best_by_base[base] = {"method": bm, "val_log_loss": vals[bm],
                              "val_log_loss_uncalibrated": vals["identity"]}
        d = load_exp01_predictions(base)
        d = d[d.sstart >= CALIB_FROM].reset_index(drop=True)
        p_all = d[["p_home", "p_draw", "p_away"]].to_numpy(float)
        q_all = np.full_like(p_all, np.nan)
        for season in range(CALIB_FROM, VAL + 1):
            m = (d.sstart == season).to_numpy()
            if m.any():
                q_all[m] = pred_store[(base, bm, season)]
        assert np.isfinite(q_all).all()
        best_pred.append((d, q_all, f"{base}_{bm}_v1"))

    frames = []
    for d, q, mid in best_pred:
        t = d[["match_id", "div", "season", "match_date", "sstart"]].copy()
        t["model_id"] = mid
        t["model_version"] = "exp06_v1"
        t[["p_home", "p_draw", "p_away"]] = q
        t["fold_id"] = t["sstart"].map(lambda x: f"wf_{x}")
        t["generated_at"] = utc_now()
        t["data_quality_flag"] = "ok"
        frames.append(t[["match_id", "div", "season", "match_date", "model_id", "model_version",
                         "p_home", "p_draw", "p_away", "fold_id", "generated_at",
                         "data_quality_flag"]])
    pred_out = pd.concat(frames, ignore_index=True)
    assert np.allclose(pred_out[["p_home", "p_draw", "p_away"]].sum(axis=1), 1.0, atol=1e-6)
    assert not pred_out.duplicated(["match_id", "model_id"]).any()
    pred_out.to_csv(os.path.join(OUT, "predictions.csv"), index=False)

    # ---------------------------------------------------------------- payload
    best_overall = min(((b, summary[b][m]["val_2023"]["log_loss"], m)
                        for b in BASES for m in METHODS), key=lambda t: t[1])
    payload = {
        "experiment": "EXP06_calibration",
        "generated_at": utc_now(),
        "seed": SEED,
        "inputs": f"{src_label}/pred_{{elo_ordered,logit,hgb}}.csv",
        "inputs_source": src_label,
        "sources_by_model": sources,
        "bases_included": BASES,
        "bases_pending": missing,
        "status": ("pending_rerun_on_EXP01_final" if contaminated else "final"),
        "protocol": {"walk_forward_calibration": f"fit temporadas < S, evaluar S, S={CALIB_FROM}..{VAL}",
                     "val": VAL, "test_used": False,
                     "note": "calibrador ajustado con predicciones OOS de EXP01"},
        "summary": summary,
        "best_method_per_base": best_by_base,
        "best_overall": {"base": best_overall[0], "method": best_overall[2],
                         "val_log_loss": float(best_overall[1])},
        "params": params,
        "inseason_trap": res[res.method.str.endswith("inseason")][
            ["base", "method", "season", "n", "log_loss", "ece_top"]].to_dict(orient="records"),
    }
    write_json(os.path.join(OUT, "metrics.json"), payload)
    write_json(os.path.join(OUT, "config.json"), {
        "bases": BASES, "methods": METHODS, "calib_from": CALIB_FROM, "val": VAL,
        "seed": SEED, "test_used": False,
        "vector_scaling": "z_k = a_k*log p_k + b_k, b_A=0 (5 params)",
        "dirichlet": "LogisticRegression multinomial sobre log p, C=1e6",
        "isotonic": "IsotonicRegression OvR por clase + renormalización",
    })

    print("\n=== EXP06 resumen (walk-forward 2010-2023 y val 2023) ===")
    for base in BASES:
        print(f"\n[{base}]")
        for method in METHODS:
            a = summary[base][method]
            print(f"  {method:12s} WF ll={a['walk_forward_2010_2023']['log_loss']:.5f} "
                  f"rps={a['walk_forward_2010_2023']['rps']:.5f} | "
                  f"val ll={a['val_2023']['log_loss']:.5f} br={a['val_2023']['brier']:.5f} "
                  f"rps={a['val_2023']['rps']:.5f} ece={a['val_2023']['ece_top']:.4f} "
                  f"eceD={a['val_2023']['ece_draw']:.4f}")
        for method in METHODS[1:]:
            dlt = deltas[base][method]
            print(f"    Δval {method:12s} {dlt['val_2023']['d_log_loss_vs_identity']:+.5f} "
                  f"CI[{dlt['val_2023']['bootstrap']['ci95_lo']:+.5f},"
                  f"{dlt['val_2023']['bootstrap']['ci95_hi']:+.5f}] | "
                  f"ΔWF {dlt['walk_forward']['d_log_loss_vs_identity']:+.5f}")
    print(f"\n[EXP06] mejor: {best_overall[0]} + {best_overall[2]} "
          f"val log-loss={best_overall[1]:.5f}")
    print(f"[EXP06] artefactos -> {OUT}")


if __name__ == "__main__":
    main()
