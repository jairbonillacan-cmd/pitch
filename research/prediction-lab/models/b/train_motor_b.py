#!/usr/bin/env python3
"""Motor B / Motor C v3.0 (`PitchLab Singularity v3.0` & `PitchLab Geodesic v2.0`):
Motor Anclado a Microestructura de Mercado Multi-Fuente, De-Vig Adaptativo MX y Ejecución Anti-RLM.

Escenarios (mismos partidos, comparación pareada walk-forward estrictamente out-of-sample):
  1. market                       mercado base con de-vig adaptativo Power/Shin (y corrección MX)
  2. linear_pool                  mezcla lineal p = (1-w) pA + w pC, w ajustado en temporadas previas
  3. logit_pool                   mezcla en espacio logit con super-consenso multi-mercado v3.0
  4. stack_logit                  regresión logística multinomial regularizada con microestructura v3.0
  5. residual_logit               corrección residual calibrada (`Singularity v3.0`) sobre consenso + Exchange + MX
  6. stack_hgb                    HistGradientBoosting fuertemente regularizado sobre el vector extendido v3.0
  7. ensemble_b / singularity_v3  combinación convexa óptima ajustada estrictamente en validación (2023/24)
                                  + evaluación de ejecución Quarter-Kelly / Gate Anti-RLM (`Geodesic v2.0`)

Uso:
  ./.venv/Scripts/python.exe models/b/train_motor_b.py \
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

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from market_microstructure_v3 import (  # noqa: E402
    CODENAME_GEODESIC_V2,
    CODENAME_SINGULARITY_V3,
    MODEL_VERSION_V3,
    evaluate_geodesic_v2_value_gate,
)

PROC = os.path.join(ROOT, "data", "processed")
ART = os.path.join(ROOT, "artifacts")
SEED = 20261109
FIRST = 2005


def logloss(y, p):
    p = np.clip(p, 1e-15, 1)
    p = p / p.sum(axis=1, keepdims=True)
    return float(-np.mean(np.log(p[np.arange(len(y)), y])))


def brier_multi(y, p):
    p = np.clip(p, 1e-15, 1)
    p = p / p.sum(axis=1, keepdims=True)
    oh = np.zeros_like(p)
    oh[np.arange(len(y)), y] = 1.0
    return float(np.mean(np.sum((p - oh) ** 2, axis=1)))


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
    """Peso w de la mezcla que minimiza log-loss en los datos históricos de ajuste."""
    grid = np.linspace(0, 1, 81)
    best_w, best = 0.85, np.inf
    for w in grid:
        if space == "prob":
            mix_p = (1 - w) * pA + w * pM
        else:
            mix_p = softmax((1 - w) * logit(pA) + w * logit(pM))
        ll = logloss(y, mix_p)
        if ll < best:
            best, best_w = ll, float(w)
    return best_w


def mix(pA, pM, w, space="prob"):
    if space == "prob":
        out = (1 - w) * pA + w * pM
    else:
        out = softmax((1 - w) * logit(pA) + w * logit(pM))
    return out / out.sum(axis=1, keepdims=True)


def _first_available_triple(df: pd.DataFrame, candidates: list[list[str]]) -> list[str] | None:
    for cols in candidates:
        if all(c in df.columns for c in cols):
            return cols
    return None


def build_consensus_market_probs(df: pd.DataFrame, phase: str) -> tuple[np.ndarray, np.ndarray]:
    """Construye dos tensores `(N, 3)` para `PitchLab Singularity v3.0`:
      - `p_base`: probabilidad primaria del mercado (prioriza `ps_adaptive` -> `b365_mx_debiased`/`b365_adaptive`
                  -> `avg_mx_debiased`/`avg_adaptive`, con fallback retrocompatible a `*_power` / `*_proportional`).
      - `p_cons`: super-consenso multi-mercado v3.0 ponderando Pinnacle Adaptativo, Best-Line Max Adaptativo,
                  Consenso Avg des-sesgado MX, Liquidez Exchange (`BFE`/`BF`), Handicap Asiático+Totales
                  implícito (Dixon-Coles) y B365 des-sesgado MX.
    """
    n = len(df)
    chain = []
    candidate_chain = (
        ("ps_adaptive", [f"mkt_{phase}_ps_adaptive_{k}" for k in "hda"]),
        ("ps_power", [f"mkt_{phase}_ps_power_{k}" for k in "hda"]),
        ("b365_mx_debiased", [f"mkt_{phase}_b365_mx_debiased_{k}" for k in "hda"]),
        ("b365_adaptive", [f"mkt_{phase}_b365_adaptive_{k}" for k in "hda"]),
        ("b365_power", [f"mkt_{phase}_b365_power_{k}" for k in "hda"]),
        ("avg_mx_debiased", [f"mkt_{phase}_avg_mx_debiased_{k}" for k in "hda"]),
        ("avg_adaptive", [f"mkt_{phase}_avg_adaptive_{k}" for k in "hda"]),
        ("avg_power", [f"mkt_{phase}_avg_power_{k}" for k in "hda"]),
        ("ps_prop", [f"mkt_{phase}_ps_proportional_{k}" for k in "hda"]),
        ("b365_prop", [f"mkt_{phase}_b365_proportional_{k}" for k in "hda"]),
    )
    for label, cols in candidate_chain:
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

    # 2. Super-consenso multi-mercado v3.0 (`Singularity v3.0`):
    #    Prioriza de-vig adaptativo Power/Shin, corrección recreativa MX y ancla Exchange (BFE/BF).
    source_specs = [
        (
            [
                [f"mkt_{phase}_ps_adaptive_{k}" for k in "hda"],
                [f"mkt_{phase}_ps_power_{k}" for k in "hda"],
            ],
            0.54,
        ),
        (
            [
                [f"mkt_{phase}_max_adaptive_{k}" for k in "hda"],
                [f"mkt_{phase}_max_power_{k}" for k in "hda"],
            ],
            0.20,
        ),
        (
            [
                [f"mkt_{phase}_avg_mx_debiased_{k}" for k in "hda"],
                [f"mkt_{phase}_avg_adaptive_{k}" for k in "hda"],
                [f"mkt_{phase}_avg_power_{k}" for k in "hda"],
            ],
            0.10,
        ),
        (
            [
                [f"mkt_{phase}_bfe_adaptive_{k}" for k in "hda"],
                [f"mkt_{phase}_bfe_power_{k}" for k in "hda"],
            ],
            0.07,
        ),
        (
            [
                [f"mkt_{phase}_bf_adaptive_{k}" for k in "hda"],
                [f"mkt_{phase}_bf_power_{k}" for k in "hda"],
            ],
            0.04,
        ),
        (
            [
                [f"mkt_{phase}_ah_implied_{k}" for k in "hda"],
            ],
            0.03,
        ),
        (
            [
                [f"mkt_{phase}_b365_mx_debiased_{k}" for k in "hda"],
                [f"mkt_{phase}_b365_adaptive_{k}" for k in "hda"],
                [f"mkt_{phase}_b365_power_{k}" for k in "hda"],
            ],
            0.02,
        ),
    ]

    num = np.zeros((n, 3), dtype=float)
    den = np.zeros((n, 1), dtype=float)
    for candidates, w in source_specs:
        cols = _first_available_triple(df, candidates)
        if cols is not None:
            mat = df[cols].to_numpy(dtype=float)
            ok = np.all(np.isfinite(mat), axis=1) & (mat.sum(axis=1) > 0.5)
            if ok.any():
                mat_norm = np.where(
                    ok[:, None],
                    mat / np.where(ok[:, None], mat.sum(axis=1, keepdims=True), 1.0),
                    0.0,
                )
                num += w * mat_norm
                den += np.where(ok[:, None], w, 0.0)

    has_cons = den[:, 0] > 0.0
    p_cons = np.where(has_cons[:, None], num / np.maximum(1e-9, den), p_base)
    return p_base, p_cons


def stack_features(pA: np.ndarray, pM: np.ndarray, pCons: np.ndarray, df: pd.DataFrame, phase: str) -> np.ndarray:
    """Construye la matriz de features para `PitchLab Singularity v3.0` combinando logits,
    divergencias Sharp/Exchange/AH, régimen de overround (`w_shin`), sesgo MX y señales tácticas."""
    log_pA = logit(pA)
    log_pM = logit(pM)
    log_pC = logit(pCons)
    res_CA = log_pC - log_pA
    res_CM = log_pC - log_pM

    def col_or_zero(name: str, scale: float = 1.0, fill: float = 0.0) -> np.ndarray:
        if name in df.columns:
            return np.nan_to_num(df[name].to_numpy(dtype=float) / scale, nan=fill)
        return np.full(len(df), fill, dtype=float)

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
        col_or_zero(f"mkt_{phase}_exchange_vs_b365_h", 1.0),
        col_or_zero(f"mkt_{phase}_exchange_vs_b365_d", 1.0),
        col_or_zero(f"mkt_{phase}_exchange_vs_b365_a", 1.0),
        col_or_zero(f"mkt_{phase}_ah_vs_b365_h", 1.0),
        col_or_zero(f"mkt_{phase}_ah_vs_b365_a", 1.0),
        col_or_zero(f"mkt_{phase}_max_over_avg_h", 1.0),
        col_or_zero(f"mkt_{phase}_max_over_avg_a", 1.0),
        col_or_zero(f"mkt_{phase}_b365_w_shin", 1.0, fill=0.5),
        col_or_zero(f"mkt_{phase}_best_overround", 1.0, fill=0.0),
        col_or_zero("mkt_mx_popular_diff", 1.0),
        col_or_zero(f"tot_{phase}_implied_goals", 3.0, fill=2.65 / 3.0),
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
        np.nan_to_num(
            df.get(f"mkt_{phase}_sharp_vs_b365_{k}", pd.Series(0.0, index=df.index)).to_numpy(dtype=float),
            nan=0.0,
        )
        for k in "hda"
    ])
    exch = np.column_stack([
        np.nan_to_num(
            df.get(f"mkt_{phase}_exchange_vs_b365_{k}", pd.Series(0.0, index=df.index)).to_numpy(dtype=float),
            nan=0.0,
        )
        for k in "hda"
    ])
    ah = np.column_stack([
        np.nan_to_num(
            df.get(f"mkt_{phase}_ah_vs_b365_{k}", pd.Series(0.0, index=df.index)).to_numpy(dtype=float),
            nan=0.0,
        )
        for k in "hda"
    ])
    tot_goals = np.nan_to_num(
        df.get(f"tot_{phase}_implied_goals", pd.Series(2.65, index=df.index)).to_numpy(dtype=float),
        nan=2.65,
    )
    elo_cl = np.nan_to_num(
        df.get("elo_closeness", pd.Series(0.5, index=df.index)).to_numpy(dtype=float),
        nan=0.5,
    )
    low_tot_draw = (2.65 - np.clip(tot_goals, 1.6, 3.8)) * elo_cl
    draw_vec = np.column_stack([np.zeros(len(df)), low_tot_draw, np.zeros(len(df))])

    tact = (
        0.35 * np.nan_to_num(df.get("xgd_diff_r10", pd.Series(0.0, index=df.index)).to_numpy(dtype=float), nan=0.0)
        + 0.25 * np.nan_to_num(df.get("gk_prevented_diff_r10", pd.Series(0.0, index=df.index)).to_numpy(dtype=float), nan=0.0)
        + 0.25 * np.nan_to_num(df.get("pi_diff", pd.Series(0.0, index=df.index)).to_numpy(dtype=float), nan=0.0)
        + 0.15 * np.nan_to_num(df.get("xgd_regime_shift_diff", pd.Series(0.0, index=df.index)).to_numpy(dtype=float), nan=0.0)
    )
    tact_vec = np.column_stack([tact, np.zeros(len(df)), -tact])

    mx_pop = np.nan_to_num(
        df.get("mkt_mx_popular_diff", pd.Series(0.0, index=df.index)).to_numpy(dtype=float),
        nan=0.0,
    )
    mx_vec = np.column_stack([-mx_pop, 0.45 * np.abs(mx_pop), mx_pop])
    return logC, diffBase, diffA, diffDC, sh, exch, ah, draw_vec, tact_vec, mx_vec


def fit_residual_tilting(y: np.ndarray, pA: np.ndarray, pCons: np.ndarray, df: pd.DataFrame, phase: str):
    """Ajusta el modelo de corrección residual `PitchLab Singularity v3.0` anclado al super-consenso:
    Combina temperatura, diferencial Base-vs-Consenso, Motor A (`Tachyon v3.0`), Dixon-Coles,
    Sharp-vs-Soft, Ancla Exchange, Handicap Asiático, Geometría del Empate, proxies tácticos y residual MX.
    """
    logC, diffBase, diffA, diffDC, sh, exch, ah, draw_vec, tact_vec, mx_vec = _residual_components(
        pA, pCons, df, phase
    )

    def loss(params):
        tau, w_base, alpha_a, alpha_dc, w_sh, w_exch, w_ah, w_tot, w_tact, w_mx, b0, b1 = params
        bias = np.array([b0, b1, -(b0 + b1)])
        z = (
            tau * logC
            + w_base * diffBase
            + alpha_a * diffA
            + alpha_dc * diffDC
            + w_sh * sh
            + w_exch * exch
            + w_ah * ah
            + w_tot * draw_vec
            + w_tact * tact_vec
            + w_mx * mx_vec
            + bias
        )
        p = softmax(z)
        nll = -np.mean(np.log(np.clip(p[np.arange(len(y)), y], 1e-15, 1.0)))
        reg = 2e-3 * (
            (tau - 1.0) ** 2
            + w_base ** 2
            + alpha_a ** 2
            + alpha_dc ** 2
            + w_sh ** 2
            + w_exch ** 2
            + w_ah ** 2
            + w_tot ** 2
            + w_tact ** 2
            + w_mx ** 2
            + b0 ** 2
            + b1 ** 2
        )
        return float(nll + reg)

    x0 = [1.0, 0.20, 0.06, 0.02, 0.20, 0.06, 0.10, 0.05, 0.01, 0.02, 0.0, 0.0]
    res = minimize(loss, x0=x0, method="BFGS")
    return res.x


def predict_residual_tilting(params, pA: np.ndarray, pCons: np.ndarray, df: pd.DataFrame, phase: str) -> np.ndarray:
    tau, w_base, alpha_a, alpha_dc, w_sh, w_exch, w_ah, w_tot, w_tact, w_mx, b0, b1 = params
    bias = np.array([b0, b1, -(b0 + b1)])
    logC, diffBase, diffA, diffDC, sh, exch, ah, draw_vec, tact_vec, mx_vec = _residual_components(
        pA, pCons, df, phase
    )
    z = (
        tau * logC
        + w_base * diffBase
        + alpha_a * diffA
        + alpha_dc * diffDC
        + w_sh * sh
        + w_exch * exch
        + w_ah * ah
        + w_tot * draw_vec
        + w_tact * tact_vec
        + w_mx * mx_vec
        + bias
    )
    return softmax(z)


def fallback(pA, pM, out):
    """Sustituye NaN del mercado por pA (fallback) y devuelve máscara de fallback."""
    fb = ~np.all(np.isfinite(pM), axis=1) | (np.nansum(pM, axis=1) <= 0)
    out = out.copy()
    out[fb] = pA[fb]
    return out, fb


def evaluate_geodesic_v2_oos(pred_df: pd.DataFrame, full_df: pd.DataFrame, phase: str) -> dict:
    """Evalúa out-of-sample el selector `PitchLab Geodesic v2.0` (Quarter-Kelly + Gate Anti-RLM/Sharp)
    sobre las cuotas históricas de ejecución (`b365` -> `avg` -> `ps`)."""
    odds_triples = [
        ("b365", [f"odds_{phase}_b365_{k}" for k in "hda"]),
        ("avg", [f"odds_{phase}_avg_{k}" for k in "hda"]),
        ("ps", [f"odds_{phase}_ps_{k}" for k in "hda"]),
    ]
    chosen_src, chosen_odds_cols = None, None
    for src, cols in odds_triples:
        if all(c in full_df.columns for c in cols):
            chosen_src, chosen_odds_cols = src, cols
            break
    if chosen_odds_cols is None or pred_df.empty:
        return {
            "codename": CODENAME_GEODESIC_V2,
            "evaluated_matches": 0,
            "odds_source": None,
        }

    keep_cols = ["match_id", "mh", "md", "ma"] + chosen_odds_cols
    for k in "hda":
        sh_col = f"mkt_{phase}_sharp_vs_b365_{k}"
        if sh_col in full_df.columns:
            keep_cols.append(sh_col)
    if "ah_supremacy_move" in full_df.columns and phase == "close":
        keep_cols.append("ah_supremacy_move")

    merged = pred_df.merge(full_df[keep_cols].drop_duplicates("match_id"), on="match_id", how="inner")
    odds_mat = merged[chosen_odds_cols].to_numpy(dtype=float)
    probs_mat = merged[["p_home", "p_draw", "p_away"]].to_numpy(dtype=float)
    mkt_mat = merged[["mh", "md", "ma"]].to_numpy(dtype=float)
    y_arr = merged["y"].to_numpy(dtype=int)

    valid = (
        np.all(np.isfinite(odds_mat), axis=1)
        & np.all(odds_mat > 1.0, axis=1)
        & np.all(np.isfinite(probs_mat), axis=1)
    )
    if not np.any(valid):
        return {
            "codename": CODENAME_GEODESIC_V2,
            "evaluated_matches": 0,
            "odds_source": chosen_src,
        }

    # Proxy histórico de divergencia Sharp-vs-Soft (puntos porcentuales escalados: 1 pp prob ≈ 3.0 pp split gap)
    sh_h = (
        np.nan_to_num(merged[f"mkt_{phase}_sharp_vs_b365_h"].to_numpy(dtype=float), nan=0.0) * 300.0
        if f"mkt_{phase}_sharp_vs_b365_h" in merged.columns
        else np.zeros(len(merged), dtype=float)
    )
    sh_d = (
        np.nan_to_num(merged[f"mkt_{phase}_sharp_vs_b365_d"].to_numpy(dtype=float), nan=0.0) * 300.0
        if f"mkt_{phase}_sharp_vs_b365_d" in merged.columns
        else np.zeros(len(merged), dtype=float)
    )
    sh_a = (
        np.nan_to_num(merged[f"mkt_{phase}_sharp_vs_b365_a"].to_numpy(dtype=float), nan=0.0) * 300.0
        if f"mkt_{phase}_sharp_vs_b365_a" in merged.columns
        else np.zeros(len(merged), dtype=float)
    )

    # Pre-filtro rápido sobre candidatos con EV bruto positivo para evaluar `evaluate_geodesic_v2_value_gate`
    raw_ev_mat = probs_mat * odds_mat - 1.0
    max_raw_ev = np.where(valid, raw_ev_mat.max(axis=1), -1.0)
    cand_indices = np.where(valid & (max_raw_ev >= 0.02))[0]

    side_to_idx = {"home": 0, "draw": 1, "away": 2}
    raw_value_count = 0
    vetoed_count = 0
    exec_count = 0
    confirmed_count = 0
    total_staked = 0.0
    total_pnl = 0.0
    vetoed_unit_pnl = 0.0

    for idx in cand_indices:
        mkt_p = mkt_mat[idx].tolist() if np.all(np.isfinite(mkt_mat[idx])) else None
        rlm_side = "none"
        if sh_h[idx] >= 12.0:
            rlm_side = "home"
        elif sh_a[idx] >= 12.0:
            rlm_side = "away"

        gate = evaluate_geodesic_v2_value_gate(
            {
                "probs": probs_mat[idx].tolist(),
                "odds": odds_mat[idx].tolist(),
                "marketProbs": mkt_p,
                "reverseLineMovementSide": rlm_side,
                "sharpMoneyDivergenceHomePct": float(sh_h[idx]),
                "sharpMoneyDivergenceDrawPct": float(sh_d[idx]),
                "sharpMoneyDivergenceAwayPct": float(sh_a[idx]),
            }
        )
        if not gate["uncertaintyGatePassed"]:
            continue
        raw_value_count += 1
        best_bet = gate["bestBet"]
        if best_bet is not None and best_bet["recommendedStake"] > 0.0:
            exec_count += 1
            if best_bet["institutionalConfirmation"]:
                confirmed_count += 1
            stake = float(best_bet["recommendedStake"])
            s_idx = side_to_idx[best_bet["side"]]
            won = 1.0 if y_arr[idx] == s_idx else 0.0
            total_staked += stake
            total_pnl += stake * (odds_mat[idx, s_idx] * won - 1.0)
        elif gate["vetoedByRlm"] and gate["topRawValueSide"] in side_to_idx:
            vetoed_count += 1
            v_idx = side_to_idx[gate["topRawValueSide"]]
            won_v = 1.0 if y_arr[idx] == v_idx else 0.0
            vetoed_unit_pnl += odds_mat[idx, v_idx] * won_v - 1.0

    return {
        "codename": CODENAME_GEODESIC_V2,
        "odds_source": chosen_src,
        "evaluated_matches": int(valid.sum()),
        "actionable_candidates_after_uncertainty_gate": raw_value_count,
        "vetoed_by_anti_rlm_or_adverse_sharp": vetoed_count,
        "executable_bets": exec_count,
        "institutionally_confirmed_bets": confirmed_count,
        "mean_quarter_kelly_stake": round(float(total_staked / exec_count), 6) if exec_count > 0 else 0.0,
        "realized_roi_executable": round(float(total_pnl / total_staked), 6) if total_staked > 0 else 0.0,
        "realized_flat_roi_vetoed_bets": round(float(vetoed_unit_pnl / vetoed_count), 6) if vetoed_count > 0 else 0.0,
    }


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
        c
        for c in mk.columns
        if (
            c.startswith("mkt_")
            or c.startswith("tot_")
            or c.startswith("ah_")
            or c.startswith(f"odds_{phase}_")
        )
        and c not in pa.columns
    ]
    df = pa.merge(mk[mk_cols], on="match_id", how="left")

    p_base_all, p_cons_all = build_consensus_market_probs(df, phase)
    df["cons_h"], df["cons_d"], df["cons_a"] = p_cons_all[:, 0], p_cons_all[:, 1], p_cons_all[:, 2]
    print(
        f"[{CODENAME_SINGULARITY_V3}] fase {phase}: mercado disponible en {df.market_ok.mean():.1%} de los partidos; "
        f"fuentes primarias: {df.loc[df.market_ok,'market_src'].value_counts().to_dict()}"
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
            "singularity_v3",
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

        # 1. mercado puro (benchmark de referencia con de-vig adaptativo v3.0)
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

        # 4. stacking logístico regularizado con señales multi-mercado v3.0
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

        # 5. corrección residual anclada a mercado (`Singularity v3.0`, sin doble conteo de prior)
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
        if len(val) == 0:
            # Fallback seguro para particiones sintéticas o ventanas sin temporada 2023
            latest_val_s = int(meta["season"].map(season_of).max())
            val = ids[meta["season"].map(season_of) == latest_val_s]
        yv = meta.reindex(val)["y"].to_numpy()
        Pv = np.stack([pivot[k].reindex(val).to_numpy() for k in members])

        def obj(z):
            w = np.exp(z - z.max())
            w /= w.sum()
            return logloss(yv, np.tensordot(w, Pv, axes=1))

        z = minimize(obj, np.zeros(len(members)), method="Nelder-Mead", options={"maxiter": 4000}).x
        w = np.exp(z - z.max())
        w /= w.sum()
        print(f"[{CODENAME_SINGULARITY_V3}] pesos óptimos en val:", dict(zip(members, w.round(3))))
        mixp = np.zeros((len(ids), 3))
        for wk, k in zip(w, members):
            mixp += wk * pivot[k].reindex(ids).to_numpy()
        ens = meta[["div", "season", "match_date", "y"]].copy()
        ens["p_home"], ens["p_draw"], ens["p_away"] = mixp[:, 0], mixp[:, 1], mixp[:, 2]
        ens_reset = ens.reset_index()
        dfs["ensemble_b"] = ens_reset
        dfs["singularity_v3"] = ens_reset.copy()
        W = dict(zip(members, w.round(4).tolist()))
    else:
        W = {}

    geodesic_target = dfs.get("singularity_v3", dfs.get("residual_logit", pd.DataFrame()))
    geodesic_summary = evaluate_geodesic_v2_oos(geodesic_target, df, phase)

    for name, p in dfs.items():
        p.to_csv(os.path.join(outdir, f"pred_{name}.csv"), index=False)

    scenario_metrics = {}
    for name, p in dfs.items():
        probs_arr = p[["p_home", "p_draw", "p_away"]].to_numpy()
        y_vec = p.y.to_numpy()
        scenario_metrics[name] = {
            "n": int(len(p)),
            "logloss": round(logloss(y_vec, probs_arr), 6),
            "brier": round(brier_multi(y_vec, probs_arr), 6),
        }

    cfg = {
        "codename_singularity": CODENAME_SINGULARITY_V3,
        "codename_geodesic": CODENAME_GEODESIC_V2,
        "version": MODEL_VERSION_V3,
        "base_motor_a": args.base,
        "market_phase": phase,
        "ensemble_weights": W,
        "first_season": FIRST,
        "market_coverage": float(df.market_ok.mean()),
        "market_sources": df.loc[df.market_ok, "market_src"].value_counts().to_dict(),
        "scenario_metrics": scenario_metrics,
        "geodesic_v2_oos_evaluation": geodesic_summary,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    with open(os.path.join(outdir, "config.json"), "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)
    print(f"escrito -> {outdir}")
    for name, m in scenario_metrics.items():
        print(f"  {name:<16s} n={m['n']:,}  logloss={m['logloss']:.4f}  brier={m['brier']:.4f}")
    print(f"  [{CODENAME_GEODESIC_V2}] {geodesic_summary}")


if __name__ == "__main__":
    main()
