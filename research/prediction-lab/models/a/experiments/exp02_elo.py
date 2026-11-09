#!/usr/bin/env python3
"""EXP02 — Elo dinámico: barrido de (K, HFA, regresión entre temporadas, MOV).

Objetivo: cuantificar cuánto importa cada parámetro del Elo causal cuando la predicción 1X2
se hace con un logit ordenado de 3 parámetros (mismo esquema que `EloOrderedModel`).

Protocolo:
  - Elo recalculado causalmente con `features.build_features.elo_block` (importado, no editado),
    sobre toda la historia <= 2023/24.
  - Walk-forward expanding desde 2008/09: para cada temporada S se ajusta el logit ordenado con
    temporadas < S y se predice S. Nunca se toca 2024/25 ni 2025/26.
  - 4 x 3 x 4 x 2 = 96 configuraciones.
  - Selección por log-loss de **val (2023/24)**; dev (2008-2022) se reporta como estabilidad.

Uso:
    ./.venv/bin/python models/a/experiments/exp02_elo.py            # barrido completo
    ./.venv/bin/python models/a/experiments/exp02_elo.py --quick    # 12 configs (smoke)
"""
from __future__ import annotations

import argparse
import itertools
import json
import os
import sys
import time
import multiprocessing as mp
from concurrent.futures import ProcessPoolExecutor

import numpy as np
import pandas as pd

LAB_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
sys.path.insert(0, LAB_ROOT)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from common import (ART, EVAL_FROM, SEED, VAL, fit_ordered_logit, load_features,  # noqa: E402
                    log_loss, paired_bootstrap_blocks, per_match_log_loss,
                    predict_ordered_logit, reliability, rps, brier, accuracy,
                    summarize, utc_now, write_json, write_predictions)
from features.build_features import elo_block  # noqa: E402  (se importa, NO se edita)

TAG = "A06_EXP02_elo_20261109"
OUT = os.path.join(ART, TAG)
KS = [10, 20, 30, 40]
HFAS = [40, 65, 90]
REGS = [0.0, 0.2, 0.33, 0.5]
MOVS = [False, True]
COLS = ["match_id", "div", "season", "match_date", "home_team", "away_team",
        "home_goals", "away_goals", "y"]

_DF: pd.DataFrame | None = None


def _init(df):
    global _DF
    _DF = df


def _season_metrics(y, p) -> dict:
    return {"n": int(len(y)), "log_loss": log_loss(y, p), "brier": brier(y, p),
            "rps": rps(y, p), "accuracy": accuracy(y, p)}


def run_config(cfg) -> dict:
    """Ajusta un Elo y evalúa walk-forward desde 2008/09. Devuelve métricas agregadas."""
    k, hfa, reg, mov = cfg
    df = _DF
    t0 = time.time()
    e = elo_block(df, k=k, hfa=hfa, season_reg=reg, mov=mov)
    x_all = e["elo_diff"].to_numpy(dtype=float) / 100.0
    y_all = df["y"].to_numpy(dtype=int)
    s_all = df["sstart"].to_numpy()

    per_season = {}
    ll_parts, br_parts, rps_parts, acc_parts, seasons = [], [], [], [], []
    for s in range(EVAL_FROM, VAL + 1):
        tr = s_all < s
        te = s_all == s
        if tr.sum() < 2000 or te.sum() == 0:
            continue
        params = fit_ordered_logit(x_all[tr], y_all[tr])
        p = predict_ordered_logit(params, x_all[te])
        y = y_all[te]
        per_season[s] = {"n": int(te.sum()), "log_loss": log_loss(y, p),
                         "brier": brier(y, p), "rps": rps(y, p),
                         "accuracy": accuracy(y, p), "b": float(params[0]),
                         "c1": float(params[1]), "c2": float(params[2])}
        ll_parts.append(per_match_log_loss(y, p))
        o = np.eye(3)[y]
        br_parts.append(np.sum((p - o) ** 2, axis=1))
        cp = np.cumsum(p, axis=1)[:, :2]
        co = np.cumsum(o, axis=1)[:, :2]
        rps_parts.append(np.sum((cp - co) ** 2, axis=1) / 2.0)
        acc_parts.append(float(np.mean(np.argmax(p, axis=1) == y)))
        seasons.append(np.full(int(te.sum()), s))

    ll = np.concatenate(ll_parts)
    br = np.concatenate(br_parts)
    rp = np.concatenate(rps_parts)
    seasons = np.concatenate(seasons)
    dev = seasons <= 2022
    val = seasons == VAL
    return {
        "K": k, "HFA": hfa, "season_reg": reg, "MOV": mov,
        "dev_n": int(dev.sum()), "val_n": int(val.sum()),
        "dev_log_loss": float(ll[dev].mean()), "val_log_loss": float(ll[val].mean()),
        "dev_brier": float(br[dev].mean()), "val_brier": float(br[val].mean()),
        "dev_rps": float(rp[dev].mean()), "val_rps": float(rp[val].mean()),
        "val_accuracy": float(np.mean(acc_parts[-1])),
        "per_season": per_season,
        "seconds": time.time() - t0,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true", help="subconjunto 12 configs")
    ap.add_argument("--workers", type=int, default=max(1, min(8, mp.cpu_count() - 1)))
    args = ap.parse_args()

    df = load_features(COLS)
    print(f"[EXP02] partidos dev+val: {len(df):,} | temporadas {df.sstart.min()}-{df.sstart.max()}")
    assert df.sstart.max() == VAL
    os.makedirs(OUT, exist_ok=True)

    if args.quick:
        configs = [(20, 65, 0.33, True), (20, 65, 0.33, False), (10, 65, 0.33, True),
                   (40, 65, 0.33, True), (20, 40, 0.33, True), (20, 90, 0.33, True),
                   (20, 65, 0.0, True), (20, 65, 0.5, True), (30, 40, 0.2, False),
                   (40, 90, 0.5, True), (10, 40, 0.0, False), (30, 90, 0.2, True)]
    else:
        configs = list(itertools.product(KS, HFAS, REGS, MOVS))
    print(f"[EXP02] configuraciones: {len(configs)} | workers={args.workers}")

    t0 = time.time()
    results = []
    if args.workers > 1:
        ctx = mp.get_context("fork")
        with ProcessPoolExecutor(max_workers=args.workers, mp_context=ctx,
                                 initializer=_init, initargs=(df,)) as ex:
            for i, r in enumerate(ex.map(run_config, configs), 1):
                results.append(r)
                print(f"  [{i:3d}/{len(configs)}] K={r['K']:>2} HFA={r['HFA']:>2} "
                      f"reg={r['season_reg']:.2f} mov={int(r['MOV'])} "
                      f"dev={r['dev_log_loss']:.5f} val={r['val_log_loss']:.5f} "
                      f"({r['seconds']:.1f}s)", flush=True)
    else:
        _init(df)
        for i, cfg in enumerate(configs, 1):
            r = run_config(cfg)
            results.append(r)
            print(f"  [{i:3d}/{len(configs)}] K={r['K']:>2} HFA={r['HFA']:>2} "
                  f"reg={r['season_reg']:.2f} mov={int(r['MOV'])} "
                  f"dev={r['dev_log_loss']:.5f} val={r['val_log_loss']:.5f}", flush=True)
    elapsed = time.time() - t0

    sweep = pd.DataFrame([{k: v for k, v in r.items() if k != "per_season"} for r in results])
    sweep = sweep.sort_values("val_log_loss").reset_index(drop=True)
    sweep.to_csv(os.path.join(OUT, "sweep_val.csv"), index=False)

    best = results[int(np.argmin([r["val_log_loss"] for r in results]))]
    # Config de referencia = la que usa features.parquet / EXP01
    ref = [r for r in results if (r["K"], r["HFA"], r["season_reg"], r["MOV"]) == (20, 65, 0.33, True)][0]

    # ------------------------------------------------------------- márgenes por parámetro
    marginals = {}
    for name, levels in (("K", KS), ("HFA", HFAS), ("season_reg", REGS), ("MOV", MOVS)):
        rows = []
        for lev in levels:
            sel = [r for r in results if r[name] == lev]
            rows.append({"level": lev,
                         "val_log_loss_mean": float(np.mean([r["val_log_loss"] for r in sel])),
                         "val_log_loss_min": float(np.min([r["val_log_loss"] for r in sel])),
                         "val_log_loss_max": float(np.max([r["val_log_loss"] for r in sel])),
                         "n_configs": len(sel)})
        marginals[name] = rows

    # ------------------------------------------------------------- detalle del ganador
    print("\n[EXP02] recalculando ganador con predicciones por partido...")
    _init(df)
    e = elo_block(df, k=best["K"], hfa=best["HFA"], season_reg=best["season_reg"],
                  mov=best["MOV"])
    x_all = e["elo_diff"].to_numpy(dtype=float) / 100.0
    y_all = df["y"].to_numpy(dtype=int)
    s_all = df["sstart"].to_numpy()
    rows_pred, loss_best, block_best, y_eval, season_eval = [], [], [], [], []
    for s in range(EVAL_FROM, VAL + 1):
        tr, te = s_all < s, s_all == s
        if tr.sum() < 2000 or te.sum() == 0:
            continue
        params = fit_ordered_logit(x_all[tr], y_all[tr])
        p = predict_ordered_logit(params, x_all[te])
        d = df.loc[te, ["match_id", "div", "season", "match_date", "y", "sstart"]].copy()
        d[["p_home", "p_draw", "p_away"]] = p
        rows_pred.append(d)
        loss_best.append(per_match_log_loss(y_all[te], p))
        block_best.append(df.loc[te, "div"].to_numpy())
        y_eval.append(y_all[te])
        season_eval.append(np.full(int(te.sum()), s))
    pred = pd.concat(rows_pred, ignore_index=True)
    loss_best = np.concatenate(loss_best)
    y_eval = np.concatenate(y_eval)
    season_eval = np.concatenate(season_eval)
    blocks_val = np.concatenate(block_best)[season_eval == VAL]

    # Referencia 1: EXP01 elo_ordered (mismo esquema Elo por defecto)
    exp01 = pd.read_csv(os.path.join(ART, "EXP01_baselines_20261109", "pred_elo_ordered.csv"))
    exp01["sstart"] = exp01.season.map(lambda s: int(str(s)[:4]))
    exp01 = exp01[(exp01.sstart >= EVAL_FROM) & (exp01.sstart <= VAL)]
    m = pred.merge(exp01[["match_id", "p_home", "p_draw", "p_away"]], on="match_id",
                   suffixes=("", "_exp01"), how="inner")
    mv = m[m.sstart == VAL]
    p_best_val = mv[["p_home", "p_draw", "p_away"]].to_numpy()
    p_ref_val = mv[["p_home_exp01", "p_draw_exp01", "p_away_exp01"]].to_numpy()
    ll_best_val = per_match_log_loss(mv.y.to_numpy(), p_best_val)
    ll_ref_val = per_match_log_loss(mv.y.to_numpy(), p_ref_val)
    boot_vs_exp01 = paired_bootstrap_blocks(ll_ref_val, ll_best_val, mv["div"].to_numpy(), B=2000)
    boot_ref_vs_exp01 = None
    # bootstrap ganador vs config de referencia, sobre val
    _init(df)
    e_ref = elo_block(df, k=20, hfa=65, season_reg=0.33, mov=True)
    xr = e_ref["elo_diff"].to_numpy(dtype=float) / 100.0
    loss_ref = []
    for s in range(EVAL_FROM, VAL + 1):
        tr, te = s_all < s, s_all == s
        if tr.sum() < 2000 or te.sum() == 0:
            continue
        pp = predict_ordered_logit(fit_ordered_logit(xr[tr], y_all[tr]), xr[te])
        loss_ref.append(per_match_log_loss(y_all[te], pp))
    loss_ref = np.concatenate(loss_ref)
    sel_val = season_eval == VAL
    boot_best_vs_ref = paired_bootstrap_blocks(loss_ref[sel_val], loss_best[sel_val],
                                               blocks_val, B=2000)

    best_metrics = {
        "val": summarize(y_eval[sel_val], pred.loc[sel_val, ["p_home", "p_draw", "p_away"]].to_numpy()),
        "dev": summarize(y_eval[~sel_val],
                         pred.loc[~sel_val, ["p_home", "p_draw", "p_away"]].to_numpy()),
    }
    rel = reliability(y_eval[sel_val], pred.loc[sel_val, ["p_home", "p_draw", "p_away"]].to_numpy())
    rel.to_csv(os.path.join(OUT, "reliability_val_best.csv"), index=False)

    write_predictions(os.path.join(OUT, "predictions.csv"), pred,
                      pred[["p_home", "p_draw", "p_away"]].to_numpy(),
                      model_id="elo_ordered_sweep_best", version="exp02_v1")

    payload = {
        "experiment": "EXP02_elo_dynamic_sweep",
        "generated_at": utc_now(),
        "seed": SEED,
        "n_configs": len(results),
        "protocol": {
            "elo": "features.build_features.elo_block (importado)",
            "model": "logit ordenado 3 parametros (esquema EloOrderedModel, L-BFGS+gradiente)",
            "walk_forward_from": EVAL_FROM, "select_on": "val 2023/24",
            "test_used": False,
        },
        "default_config": {"K": 20, "HFA": 65, "season_reg": 0.33, "MOV": True,
                           "dev_log_loss": ref["dev_log_loss"],
                           "val_log_loss": ref["val_log_loss"],
                           "note": "configuración de features.parquet y EXP01"},
        "best_config": {"K": best["K"], "HFA": best["HFA"], "season_reg": best["season_reg"],
                        "MOV": bool(best["MOV"]), "dev_log_loss": best["dev_log_loss"],
                        "val_log_loss": best["val_log_loss"]},
        "best_metrics": best_metrics,
        "marginals": marginals,
        "bootstrap_val": {
            "best_vs_default": boot_best_vs_ref,
            "best_vs_exp01_elo_ordered": boot_vs_exp01,
        },
        "per_season_best": {str(k): v for k, v in best["per_season"].items()},
        "per_season_default": {str(k): v for k, v in ref["per_season"].items()},
        "elapsed_seconds": elapsed,
        "sweep_top10": sweep.head(10).to_dict(orient="records"),
        "sweep_bottom5": sweep.tail(5).to_dict(orient="records"),
    }
    write_json(os.path.join(OUT, "metrics.json"), payload)
    write_json(os.path.join(OUT, "config.json"), {
        "grid": {"K": KS, "HFA": HFAS, "season_reg": REGS, "MOV": MOVS},
        "eval_from": EVAL_FROM, "val": VAL, "seed": SEED,
        "features": ["elo_diff (incluye HFA)"], "test_used": False,
    })

    print(f"\n[EXP02] mejor: K={best['K']} HFA={best['HFA']} reg={best['season_reg']} "
          f"MOV={best['MOV']} | dev={best['dev_log_loss']:.4f} val={best['val_log_loss']:.4f}")
    print(f"[EXP02] default: dev={ref['dev_log_loss']:.4f} val={ref['val_log_loss']:.4f}")
    print("[EXP02] margen val por parámetro:")
    for name, rows in marginals.items():
        txt = "  ".join(f"{r['level']}:{r['val_log_loss_mean']:.4f}" for r in rows)
        print(f"  {name:10s} {txt}")
    print(f"[EXP02] bootstrap val best-vs-default: {boot_best_vs_ref}")
    print(f"[EXP02] bootstrap val best-vs-EXP01:    {boot_vs_exp01}")
    print(f"[EXP02] artefactos -> {OUT} ({elapsed:.0f}s)")


if __name__ == "__main__":
    main()
