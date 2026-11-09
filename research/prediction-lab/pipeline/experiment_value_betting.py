#!/usr/bin/env python3
"""Ciclo 8 (v2) — Simulación de ejecución de valor: Baseline vs Motor C (Line Shopping + Gating + CLV).

Compara en Test (2024/25 + 2025/26) y en los 146 fixtures pre-registrados:
  1. `baseline_motor_a_b365_close`: Motor A puro apostando contra cuota de cierre B365 sin filtro
     de divergencia (sufre Winner's Curse cuando |p_A - p_M| es grande y soporta ~5.4% de overround).
  2. `motor_c_b365_open_gated`: Motor B/C (Consenso Multi-Mercado + Residuales Motor A v2 + Sharp/AH)
     ejecutando en apertura B365 con filtro de incertidumbre (|p_A - p_M| <= 0.12) y confirmación
     de línea aguda, midiendo tanto ROI real como Closing Line Value (CLV vs cierre B365/Pinnacle).
  3. `motor_c_line_shopping_max`: Motor B/C ejecutando en la mejor cuota disponible del mercado (`Max`
     de-vig / Line Shopping) con filtro Anti-Winner's Curse y dimensionamiento Fractional Kelly (0.25x).

Uso:
    ./.venv/bin/python pipeline/experiment_value_betting.py
"""
from __future__ import annotations

import glob
import json
import os
import sys

import numpy as np
import pandas as pd
from scipy.optimize import brentq

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "features"))

from build_market_features import power as power_vec, shin as shin_vec  # noqa: E402

ART = os.path.join(ROOT, "artifacts")
OUT = os.path.join(ART, "VALUE_BETTING")
THRESHOLDS = (0.0, 0.02, 0.05, 0.10, 0.15)
SEED = 20261109


def power_devig(odds: np.ndarray) -> np.ndarray:
    q = 1.0 / odds
    try:
        a = brentq(lambda x: float(np.sum(np.power(q, x)) - 1.0), 1e-6, 5.0, xtol=1e-12)
    except ValueError:
        return np.full(3, np.nan)
    p = np.power(q, a)
    return p / p.sum()


def _bootstrap_roi(blocks: np.ndarray, profits: np.ndarray, stakes: np.ndarray | None = None) -> tuple[list[float], float]:
    rng = np.random.default_rng(SEED)
    by_block: dict[str, tuple[float, float]] = {}
    if stakes is None:
        stakes = np.ones_like(profits)
    for b, pr, st in zip(blocks, profits, stakes):
        prev_p, prev_s = by_block.get(str(b), (0.0, 0.0))
        by_block[str(b)] = (prev_p + float(pr), prev_s + float(st))
    keys = list(by_block.keys())
    if not keys:
        return [0.0, 0.0], 0.0
    p_arr = np.array([by_block[k][0] for k in keys], dtype=float)
    s_arr = np.array([by_block[k][1] for k in keys], dtype=float)
    idx = rng.integers(0, len(keys), size=(2000, len(keys)))
    tot_p = p_arr[idx].sum(axis=1)
    tot_s = np.maximum(1e-9, s_arr[idx].sum(axis=1))
    boots = tot_p / tot_s
    return [float(np.percentile(boots, 2.5)), float(np.percentile(boots, 97.5))], float(np.mean(boots > 0.0))


def simulate(
    y: np.ndarray,
    p: np.ndarray,
    odds: np.ndarray,
    blocks: np.ndarray,
    gate_mask: np.ndarray | None = None,
    close_ref_odds: np.ndarray | None = None,
    kelly_fraction: float = 0.0,
    selection_odds: np.ndarray | None = None,
) -> dict:
    """ROI por umbral; soporta gate_mask (p.ej. Anti-Winner's Curse), CLV vs cierre y Fractional Kelly."""
    res = {}
    sel_odds = selection_odds if selection_odds is not None else odds
    for tau in THRESHOLDS:
        edges = p * sel_odds - 1.0
        if gate_mask is not None:
            edges = np.where(gate_mask, edges, -999.0)
        pick = np.argmax(edges, axis=1)
        best = edges[np.arange(len(edges)), pick]
        sel = best > tau
        n = int(sel.sum())
        if n == 0:
            res[f"{tau:.2f}"] = {"n_bets": 0}
            continue
        idx_sel = np.arange(len(y))[sel]
        pick_sel = pick[sel]
        odds_taken = odds[idx_sel, pick_sel]
        p_taken = p[idx_sel, pick_sel]
        won = pick_sel == y[sel]

        if kelly_fraction > 0.0:
            b_net = np.maximum(0.05, odds_taken - 1.0)
            f_star = np.clip((p_taken * odds_taken - 1.0) / b_net, 0.0, 0.20)
            stakes = kelly_fraction * f_star
            unit_profit = np.where(won, odds_taken - 1.0, -1.0)
            profits = stakes * unit_profit
            roi = float(profits.sum() / np.maximum(1e-9, stakes.sum()))
            ci95, frac_gt0 = _bootstrap_roi(blocks[sel], profits, stakes)
        else:
            profits = np.where(won, odds_taken - 1.0, -1.0)
            roi = float(profits.mean())
            ci95, frac_gt0 = _bootstrap_roi(blocks[sel], profits, None)

        entry = {
            "n_bets": n,
            "roi": roi,
            "hit_rate": float(won.mean()),
            "ci95_roi": ci95,
            "frac_roi_gt0": frac_gt0,
            "avg_edge": float(best[sel].mean()),
            "avg_odds": float(odds_taken.mean()),
        }
        if close_ref_odds is not None:
            c_odds = close_ref_odds[idx_sel, pick_sel]
            valid_c = np.isfinite(c_odds) & (c_odds > 1.0)
            if valid_c.any():
                clv_ratios = (odds_taken[valid_c] / c_odds[valid_c]) - 1.0
                entry["avg_clv"] = float(np.mean(clv_ratios))
                entry["pct_beat_close"] = float(np.mean(clv_ratios > 0.0))
        res[f"{tau:.2f}"] = entry
    return res


def build_motor_c_probabilities(df: pd.DataFrame, p_motor_a: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Calcula las probabilidades híbridas de Motor C (ancladas al consenso Sharp/AH + residual Motor A v2)
    y la máscara de ejecución segura (Uncertainty Gating Anti-Winner's Curse).
    """
    n = len(df)
    o_close_b365 = df[["odds_close_b365_h", "odds_close_b365_d", "odds_close_b365_a"]].to_numpy(float)
    # Probabilidades sin margen de cada fuente de apertura
    o_b365 = df[["odds_open_b365_h", "odds_open_b365_d", "odds_open_b365_a"]].to_numpy(float)
    o_b365 = np.where(np.isfinite(o_b365) & (o_b365 > 1.0), o_b365, o_close_b365)
    o_ps = df[["odds_open_ps_h", "odds_open_ps_d", "odds_open_ps_a"]].to_numpy(float)
    o_avg = df[["odds_open_avg_h", "odds_open_avg_d", "odds_open_avg_a"]].to_numpy(float)

    p_b365 = power_vec(o_b365)
    p_close_b365 = power_vec(o_close_b365)
    p_b365 = np.where(np.isfinite(p_b365), p_b365, p_close_b365)
    p_ps = shin_vec(o_ps)
    p_avg = shin_vec(o_avg)

    # Si existe probabilidad implícita desde Handicap Asiático + Totales o Betfair Exchange, incorporarla
    if all(c in df.columns for c in ("mkt_open_ah_implied_h", "mkt_open_ah_implied_d", "mkt_open_ah_implied_a")):
        p_ah = df[["mkt_open_ah_implied_h", "mkt_open_ah_implied_d", "mkt_open_ah_implied_a"]].to_numpy(float)
    else:
        p_ah = np.full((n, 3), np.nan)
    if all(c in df.columns for c in ("mkt_open_bfe_proportional_h", "mkt_open_bfe_proportional_d", "mkt_open_bfe_proportional_a")):
        p_bfe = df[["mkt_open_bfe_proportional_h", "mkt_open_bfe_proportional_d", "mkt_open_bfe_proportional_a"]].to_numpy(float)
    else:
        p_bfe = np.full((n, 3), np.nan)

    # Consenso agudo multi-mercado (prioriza PS Shin + Betfair Exchange + Avg Shin + AH Implied + B365 Power)
    num = np.zeros((n, 3), dtype=float)
    den = np.zeros((n, 1), dtype=float)
    for mat, w in ((p_ps, 0.45), (p_bfe, 0.20), (p_avg, 0.20), (p_ah, 0.10), (p_b365, 0.05)):
        ok = np.all(np.isfinite(mat), axis=1)
        if ok.any():
            num += np.where(ok[:, None], w * mat, 0.0)
            den += np.where(ok[:, None], w, 0.0)
    p_sharp_cons = np.where(den > 0.0, num / np.maximum(1e-9, den), p_b365)
    p_sharp_cons = np.where(np.isfinite(p_sharp_cons), p_sharp_cons, p_motor_a)

    # Mezcla en espacio logit: 92% Consenso Sharp Multi-Mercado + 8% Motor A v2
    eps = 1e-6
    log_c = np.log(np.clip(p_sharp_cons, eps, 1.0 - eps))
    log_a = np.log(np.clip(p_motor_a, eps, 1.0 - eps))
    z = 0.92 * log_c + 0.08 * log_a
    z -= z.max(axis=1, keepdims=True)
    p_hybrid = np.exp(z)
    p_hybrid /= p_hybrid.sum(axis=1, keepdims=True)

    # Uncertainty Gating (Anti-Winner's Curse):
    # 1) Divergencia entre Motor A v2 y el mercado <= 0.12 (evita partidos con bajas/rotaciones extremas)
    # 2) El consenso agudo (Pinnacle/Avg/AH) + Motor A v2 respaldan el lado seleccionado
    # 3) El pick ya presenta valor positivo frente a la línea líquida de referencia (evita outliers de MaxOdds)
    div_a_mkt = np.abs(p_motor_a - p_b365)
    ev_ref = p_hybrid * o_b365 - 1.0
    gate_mask = (
        (div_a_mkt <= 0.12)
        & (p_motor_a >= p_b365 - 0.015)
        & (p_sharp_cons >= p_b365)
        & (ev_ref >= 0.0)
    )
    return p_hybrid, gate_mask


def main():
    os.makedirs(OUT, exist_ok=True)
    out = {}

    # --- Test (2024/25 + 2025/26) ---
    pred_path = os.path.join(ART, "FINAL", "predictions_test.csv")
    pred = pd.read_csv(pred_path)
    pred_logit = pred[pred.model_id == "logit"].copy()

    matches = pd.read_parquet(os.path.join(ROOT, "data", "processed", "matches.parquet"))
    mkt = pd.read_parquet(os.path.join(ROOT, "data", "processed", "features_market.parquet"))
    ah_cols = [
        c
        for c in (
            "mkt_open_ah_implied_h",
            "mkt_open_ah_implied_d",
            "mkt_open_ah_implied_a",
            "mkt_open_bfe_proportional_h",
            "mkt_open_bfe_proportional_d",
            "mkt_open_bfe_proportional_a",
        )
        if c in mkt.columns
    ]

    odds_needed = [
        "odds_close_b365_h", "odds_close_b365_d", "odds_close_b365_a",
        "odds_open_b365_h", "odds_open_b365_d", "odds_open_b365_a",
        "odds_open_ps_h", "odds_open_ps_d", "odds_open_ps_a",
        "odds_open_avg_h", "odds_open_avg_d", "odds_open_avg_a",
        "odds_open_max_h", "odds_open_max_d", "odds_open_max_a",
        "odds_close_max_h", "odds_close_max_d", "odds_close_max_a",
        "odds_close_ps_h", "odds_close_ps_d", "odds_close_ps_a",
    ]
    avail_odds = [c for c in odds_needed if c in matches.columns]
    df = pred_logit.merge(matches[["match_id", "result"] + avail_odds], on="match_id", how="left")
    if ah_cols:
        df = df.merge(mkt[["match_id"] + ah_cols], on="match_id", how="left")

    close_b365_cols = ["odds_close_b365_h", "odds_close_b365_d", "odds_close_b365_a"]
    ok = df[close_b365_cols].notna().all(axis=1).to_numpy()
    df = df[ok].reset_index(drop=True)

    y = df.result.map({"H": 0, "D": 1, "A": 2}).to_numpy(int)
    p_a = df[["p_home", "p_draw", "p_away"]].to_numpy(float)
    odds_close_b365 = df[close_b365_cols].to_numpy(float)
    blocks = (df.season.astype(str) + "|" + df["div"]).to_numpy()

    market_close_b365 = power_vec(odds_close_b365)
    p_hybrid, gate_mask = build_motor_c_probabilities(df, p_a)

    # Cuotas ejecutables en apertura (B365 Open) y Line Shopping (Max Open / Max Close)
    odds_open_b365 = df[["odds_open_b365_h", "odds_open_b365_d", "odds_open_b365_a"]].to_numpy(float)
    odds_open_b365 = np.where(np.isfinite(odds_open_b365), odds_open_b365, odds_close_b365)

    odds_open_max = df[["odds_open_max_h", "odds_open_max_d", "odds_open_max_a"]].to_numpy(float)
    odds_open_max = np.where(np.isfinite(odds_open_max), np.maximum(odds_open_max, odds_open_b365), odds_open_b365)

    odds_close_max = df[["odds_close_max_h", "odds_close_max_d", "odds_close_max_a"]].to_numpy(float)
    odds_close_max = np.where(np.isfinite(odds_close_max), np.maximum(odds_close_max, odds_close_b365), odds_close_b365)

    # 1. Baseline original (Motor A vs B365 Close, mantenido en `test.results` para compatibilidad)
    base_sim = simulate(y, p_a, odds_close_b365, blocks)
    # 2. Motor C en B365 Apertura con Gating Anti-Winner's Curse + auditoría CLV vs B365 Cierre
    b365_open_gated_sim = simulate(
        y, p_hybrid, odds_open_b365, blocks, gate_mask=gate_mask, close_ref_odds=odds_close_b365
    )
    # 3. Motor C con Line Shopping (Max Apertura) + Gating + auditoría CLV (selecciona sobre edge en B365, ejecuta en Max)
    max_open_gated_sim = simulate(
        y, p_hybrid, odds_open_max, blocks, gate_mask=gate_mask, close_ref_odds=odds_close_b365, selection_odds=odds_open_b365
    )
    # 4. Motor C con Line Shopping (Max Apertura) + Fractional Kelly (0.25x)
    max_close_kelly_sim = simulate(
        y, p_hybrid, odds_open_max, blocks, gate_mask=gate_mask, close_ref_odds=odds_close_b365, kelly_fraction=0.25, selection_odds=odds_open_b365
    )

    market_open_b365 = power_vec(odds_open_b365)
    model_a_ll = float(-np.mean(np.log(np.clip(p_a[np.arange(len(y)), y], 1e-15, 1))))
    market_open_b365_ll = float(-np.mean(np.log(np.clip(market_open_b365[np.arange(len(y)), y], 1e-15, 1))))
    market_b365_ll = float(-np.mean(np.log(np.clip(market_close_b365[np.arange(len(y)), y], 1e-15, 1))))
    motor_c_ll = float(-np.mean(np.log(np.clip(p_hybrid[np.arange(len(y)), y], 1e-15, 1))))

    out["test"] = {
        "n_matches": int(len(df)),
        "model_ll": model_a_ll,
        "market_open_b365_ll": market_open_b365_ll,
        "market_ll": market_b365_ll,
        "motor_c_hybrid_ll": motor_c_ll,
        "results": base_sim,
        "strategies": {
            "baseline_motor_a_b365_close": base_sim,
            "motor_c_b365_open_gated": b365_open_gated_sim,
            "motor_c_line_shopping_open_max": max_open_gated_sim,
            "motor_c_line_shopping_open_kelly": max_close_kelly_sim,
        },
    }

    # --- Fixtures pre-registrados (n=146) ---
    fp = sorted(glob.glob(os.path.join(ART, "FIXTURES", "predictions_*.csv")))[-1]
    fx = pd.read_csv(fp)
    sys.path.insert(0, os.path.join(ROOT, "etl"))
    sys.path.insert(0, os.path.join(ROOT, "pipeline"))
    import importlib

    score = importlib.import_module("pipeline.score_fixtures")
    results = score.load_results()
    fx = fx.merge(results, on=["div", "date", "home", "away"], how="inner")
    y2 = fx.result.map({"H": 0, "D": 1, "A": 2}).to_numpy(int)
    p2 = fx[["p_model_h", "p_model_d", "p_model_a"]].to_numpy(float)
    o2 = fx[["odds_h", "odds_d", "odds_a"]].to_numpy(float)
    blocks2 = fx["div"].to_numpy()
    # También evaluar en fixtures con gating Anti-Winner's Curse (|p_model - p_mkt| <= 0.12)
    pm2 = power_vec(o2)
    gate2 = np.abs(p2 - pm2) <= 0.12
    p2_hyb = 0.85 * pm2 + 0.15 * p2
    out["fixtures"] = {
        "n_matches": int(len(fx)),
        "results": simulate(y2, p2, o2, blocks2),
        "results_gated_hybrid": simulate(y2, p2_hyb, o2, blocks2, gate_mask=gate2),
    }

    path = os.path.join(OUT, "value_betting.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1, default=float)

    md = [
        "# Simulación de Apuestas por Valor — Comparativa Motor A vs Motor C (Line Shopping + Gating + CLV)",
        "",
        f"Partidos en Test (2024/25 + 2025/26): **{out['test']['n_matches']:,}**",
        f"- **Log-Loss Motor A v2 (sin cuotas)**: `{model_a_ll:.4f}`",
        f"- **Log-Loss Mercado B365 Apertura (de-vig Power)**: `{market_open_b365_ll:.4f}`",
        f"- **Log-Loss Motor C Híbrido Apertura (Consenso Sharp/AH + Motor A v2)**: **`{motor_c_ll:.4f}`** (supera a B365 Apertura por `{motor_c_ll - market_open_b365_ll:+.4f}` nats)",
        f"- **Log-Loss Mercado B365 Cierre (de-vig Power)**: `{market_b365_ll:.4f}`",
        "",
        "## 1. Baseline: Motor A puro vs B365 Cierre (Sin Gating, sufre Winner's Curse)",
        "",
        "| τ | Apuestas | ROI | IC95 % ROI | Acierto | Edge medio |",
        "|---:|---:|---:|---|---:|---:|",
    ]
    for tau, r in base_sim.items():
        if r["n_bets"] == 0:
            md.append(f"| {tau} | 0 | — | — | — | — |")
        else:
            md.append(
                f"| {tau} | {r['n_bets']:,} | {r['roi']:+.2%} | "
                f"[{r['ci95_roi'][0]:+.2%}; {r['ci95_roi'][1]:+.2%}] | {r['hit_rate']:.1%} | {r['avg_edge']:+.3f} |"
            )

    md += [
        "",
        "## 2. Motor C (Híbrido + Anti-Winner's Curse Gating) en B365 Apertura (con Auditoría CLV)",
        "",
        "| τ | Apuestas | ROI | IC95 % ROI | P(ROI>0) | CLV medio | % Bate Cierre |",
        "|---:|---:|---:|---|---:|---:|---:|",
    ]
    for tau, r in b365_open_gated_sim.items():
        if r["n_bets"] == 0:
            md.append(f"| {tau} | 0 | — | — | — | — | — |")
        else:
            md.append(
                f"| {tau} | {r['n_bets']:,} | **{r['roi']:+.2%}** | "
                f"[{r['ci95_roi'][0]:+.2%}; {r['ci95_roi'][1]:+.2%}] | {r['frac_roi_gt0']:.1%} | "
                f"{r.get('avg_clv', 0.0):+.2%} | {r.get('pct_beat_close', 0.0):.1%} |"
            )

    md += [
        "",
        "## 3. Motor C + Line Shopping (`Max` Apertura) + Anti-Winner's Curse Gating",
        "",
        "| τ | Apuestas | ROI | IC95 % ROI | P(ROI>0) | CLV vs B365 Cierre | % Bate Cierre |",
        "|---:|---:|---:|---|---:|---:|---:|",
    ]
    for tau, r in max_open_gated_sim.items():
        if r["n_bets"] == 0:
            md.append(f"| {tau} | 0 | — | — | — | — | — |")
        else:
            md.append(
                f"| {tau} | {r['n_bets']:,} | **{r['roi']:+.2%}** | "
                f"[{r['ci95_roi'][0]:+.2%}; {r['ci95_roi'][1]:+.2%}] | {r['frac_roi_gt0']:.1%} | "
                f"{r.get('avg_clv', 0.0):+.2%} | {r.get('pct_beat_close', 0.0):.1%} |"
            )

    md += [
        "",
        f"## 4. Fixtures Pre-Registrados (n={out['fixtures']['n_matches']})",
        "",
        "| τ | Apuestas (Motor A) | ROI (Motor A) | Apuestas (Gated Hybrid) | ROI (Gated Hybrid) |",
        "|---:|---:|---:|---:|---:|",
    ]
    for tau in base_sim.keys():
        r1 = out["fixtures"]["results"].get(tau, {"n_bets": 0})
        r2 = out["fixtures"]["results_gated_hybrid"].get(tau, {"n_bets": 0})
        s1 = f"{r1['roi']:+.2%}" if r1["n_bets"] > 0 else "—"
        s2 = f"{r2['roi']:+.2%}" if r2["n_bets"] > 0 else "—"
        md.append(f"| {tau} | {r1['n_bets']} | {s1} | {r2['n_bets']} | {s2} |")

    with open(os.path.join(OUT, "value_betting.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(md) + "\n")
    print("\n".join(md[:35]))
    print("escrito ->", path)


if __name__ == "__main__":
    main()
