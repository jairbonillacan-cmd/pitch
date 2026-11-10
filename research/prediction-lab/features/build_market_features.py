#!/usr/bin/env python3
"""Features de mercado de 3ª generación (`PitchLab Singularity v3.0` & `Geodesic v2.0`):
  - Probabilidades 1X2 sin margen (`proportional`, `power`, `shin`, `adaptive`) en todas las casas
  - Peso dinámico `w_shin` gobernado por el overround (`Pinnacle ~3.22%` -> `Caliente.mx / Soft ~6.62%+`)
  - Detector y corrector determinista de sesgo público recreativo en clubes populares de Liga MX (`MEX`)
  - Totales (Over/Under 2.5) y Handicap Asiático (AH) con desvigorización 2-way proporcional y adaptativa
  - Probabilidades 1X2 implícitas cruzadas desde Handicap Asiático + Totales (Dixon-Coles)
  - Divergencia Sharp-vs-Soft (`Pinnacle`/`Betfair` vs `Bet365`) y Dispersión (`Max`/`Avg`, Best-Line Overround)

Uso:
    ./.venv/Scripts/python.exe features/build_market_features.py
Salida:
    data/processed/features_market.parquet / .csv
    reports/A07_market_features.md
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "features"))
sys.path.insert(0, os.path.join(ROOT, "models", "b"))

from ratings_advanced import _dixon_coles_1x2  # noqa: E402
from market_microstructure_v3 import (  # noqa: E402
    compute_adaptive_shin_weight_vec,
    debiase_recreational_liga_mx_vec,
    detect_popular_ligamx_weight,
)

PROC = os.path.join(ROOT, "data", "processed")


def proportional(odds: np.ndarray) -> np.ndarray:
    q = 1.0 / odds
    return q / q.sum(axis=-1, keepdims=True)


def power(odds: np.ndarray) -> np.ndarray:
    """De-vig Power vectorizado mediante bisección exacta de 60 pasos en [1e-6, 5.0] (precisión < 1e-15)."""
    q = 1.0 / odds
    valid = np.all(np.isfinite(q), axis=1) & np.all((q > 0.0) & (q < 1.0), axis=1)
    out = np.full_like(q, np.nan, dtype=float)
    if not valid.any():
        return out
    qv = q[valid]
    lo = np.full((len(qv), 1), 1e-6, dtype=float)
    hi = np.full((len(qv), 1), 5.0, dtype=float)
    for _ in range(60):
        alpha = 0.5 * (lo + hi)
        s = np.power(qv, alpha).sum(axis=1, keepdims=True)
        lo = np.where(s > 1.0, alpha, lo)
        hi = np.where(s <= 1.0, alpha, hi)
    alpha = 0.5 * (lo + hi)
    res = np.power(qv, alpha)
    res /= res.sum(axis=1, keepdims=True)
    out[valid] = res
    return out


def shin(odds: np.ndarray) -> np.ndarray:
    """De-vig de Shin (1993) vectorizado mediante bisección exacta de 60 pasos en [0.0, 0.5] (precisión < 1e-15)."""
    q = 1.0 / odds
    valid = np.all(np.isfinite(q), axis=1) & np.all((q > 0.0) & (q < 1.0), axis=1)
    out = np.full_like(q, np.nan, dtype=float)
    if not valid.any():
        return out
    qv = q[valid]
    Q = qv.sum(axis=1, keepdims=True)
    lo = np.zeros((len(qv), 1), dtype=float)
    hi = np.full((len(qv), 1), 0.5, dtype=float)
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        inside = np.maximum(mid * mid + 4.0 * (1.0 - mid) * (qv * qv) / Q, 0.0)
        term = (np.sqrt(inside) - mid) / (2.0 * (1.0 - mid))
        f_mid = term.sum(axis=1, keepdims=True) - 1.0
        lo = np.where(f_mid > 0.0, mid, lo)
        hi = np.where(f_mid <= 0.0, mid, hi)
    z = 0.5 * (lo + hi)
    inside = np.maximum(z * z + 4.0 * (1.0 - z) * (qv * qv) / Q, 0.0)
    res = (np.sqrt(inside) - z) / (2.0 * (1.0 - z))
    res /= res.sum(axis=1, keepdims=True)
    out[valid] = res
    return out


def adaptive(odds: np.ndarray) -> np.ndarray:
    """De-vig adaptativo Power/Shin (v3.0) gobernado por el overround observado (2-way o 3-way)."""
    p_pow = power(odds)
    p_shi = shin(odds)
    valid = np.all(np.isfinite(p_pow), axis=1) & np.all(np.isfinite(p_shi), axis=1)
    out = np.full_like(p_pow, np.nan, dtype=float)
    if not valid.any():
        return out
    ov = (1.0 / odds[valid]).sum(axis=1) - 1.0
    w_shin = compute_adaptive_shin_weight_vec(ov)[:, None]
    raw = (1.0 - w_shin) * p_pow[valid] + w_shin * p_shi[valid]
    out[valid] = raw / raw.sum(axis=1, keepdims=True)
    return out


def add_source(df: pd.DataFrame, phase: str, src: str, method: str = "proportional") -> pd.DataFrame:
    cols = [f"odds_{phase}_{src}_{k}" for k in "hda"]
    if not all(c in df.columns for c in cols):
        return df
    odds = df[cols].to_numpy(dtype=float)
    sum_imp = np.where(np.all(odds > 1.0, axis=1), (1.0 / np.where(odds > 1.0, odds, np.nan)).sum(axis=1), np.nan)
    valid = np.all(np.isfinite(odds), axis=1) & np.all(odds > 1.0, axis=1) & (sum_imp >= 0.90) & (sum_imp <= 1.25)
    probs = np.full((len(df), 3), np.nan)
    if valid.any():
        fn = {"proportional": proportional, "power": power, "shin": shin, "adaptive": adaptive}[method]
        probs[valid] = fn(odds[valid])
    for j, k in enumerate("hda"):
        df[f"mkt_{phase}_{src}_{method}_{k}"] = probs[:, j]
    margin = np.where(valid, sum_imp - 1.0, np.nan)
    df[f"mkt_{phase}_{src}_margin"] = margin
    df[f"mkt_{phase}_{src}_valid"] = valid.astype(int)
    if method == "adaptive":
        df[f"mkt_{phase}_{src}_w_shin"] = compute_adaptive_shin_weight_vec(margin)
    return df


def add_recreational_ligamx_features(df: pd.DataFrame) -> pd.DataFrame:
    """Detecta y corrige el sesgo público recreativo en clubes populares de Liga MX (`MEX`)
    cuando la fuente proviene de un libro recreativo o presenta `overround >= 0.050`."""
    n = len(df)
    if "home_team" not in df.columns or "away_team" not in df.columns:
        df["mkt_mx_popular_diff"] = np.zeros(n, dtype=float)
        return df

    h_teams = df["home_team"].fillna("").astype(str).tolist()
    a_teams = df["away_team"].fillna("").astype(str).tolist()
    w_h = np.array([detect_popular_ligamx_weight(t) for t in h_teams], dtype=float)
    w_a = np.array([detect_popular_ligamx_weight(t) for t in a_teams], dtype=float)
    is_mex = (df["div"].astype(str) == "MEX").to_numpy() if "div" in df.columns else np.ones(n, dtype=bool)
    df["mkt_mx_popular_diff"] = np.where(is_mex, w_h - w_a, 0.0)

    for phase in ("open", "close"):
        for src, book_tag in (("b365", "b365"), ("avg", ""), ("bw", "soft"), ("wh", "soft")):
            ad_cols = [f"mkt_{phase}_{src}_adaptive_{k}" for k in "hda"]
            m_col = f"mkt_{phase}_{src}_margin"
            if not all(c in df.columns for c in ad_cols) or m_col not in df.columns:
                continue
            probs_in = df[ad_cols].to_numpy(dtype=float)
            margins = df[m_col].to_numpy(dtype=float)
            # Aplicar solo a partidos de Liga MX (evitando falsas coincidencias en otras divisiones)
            h_eff = [ht if mx else "" for ht, mx in zip(h_teams, is_mex)]
            a_eff = [at if mx else "" for at, mx in zip(a_teams, is_mex)]
            deb_probs, _, active_flag = debiase_recreational_liga_mx_vec(
                probs_in, margins, h_eff, a_eff, bookmaker=book_tag
            )
            for j, k in enumerate("hda"):
                df[f"mkt_{phase}_{src}_mx_debiased_{k}"] = deb_probs[:, j]
            df[f"mkt_{phase}_{src}_mx_bias_flag"] = active_flag
    return df


def implied_poisson_lambda_from_over25(p_over: np.ndarray) -> np.ndarray:
    """Invierte P(Total >= 3) = 1 - exp(-L)*(1 + L + L^2/2) respecto a L mediante Newton."""
    out = np.full_like(p_over, np.nan, dtype=float)
    valid = np.isfinite(p_over) & (p_over > 0.02) & (p_over < 0.98)
    if not valid.any():
        return out
    pv = p_over[valid]
    lam = np.clip(2.6 + 1.8 * (pv - 0.50), 0.5, 6.0)
    for _ in range(10):
        exp_l = np.exp(-lam)
        cdf2 = exp_l * (1.0 + lam + 0.5 * lam * lam)
        f_val = (1.0 - cdf2) - pv
        # Derivada de 1 - e^-L(1 + L + L^2/2) respecto a L es e^-L * (L^2 / 2)
        df_val = exp_l * (0.5 * lam * lam)
        lam = np.clip(lam - f_val / np.maximum(1e-9, df_val), 0.35, 6.5)
    out[valid] = lam
    return out


def add_totals_and_ah_features(df: pd.DataFrame) -> pd.DataFrame:
    """De-vig 2-way (proporcional + adaptativo v3.0) de Totales (O/U 2.5) y Handicap Asiático."""
    n = len(df)
    for phase in ("open", "close"):
        # 1. Totales Over/Under 2.5
        for src in ("b365", "p", "avg", "max"):
            ov_col, un_col = f"totals_{phase}_{src}_over", f"totals_{phase}_{src}_under"
            if ov_col in df.columns and un_col in df.columns:
                pair = df[[ov_col, un_col]].to_numpy(dtype=float)
                sum_q = np.where(np.all(pair > 1.0, axis=1), (1.0 / np.where(pair > 1.0, pair, np.nan)).sum(axis=1), np.nan)
                val = np.all(np.isfinite(pair), axis=1) & np.all(pair > 1.0, axis=1) & (sum_q >= 0.90) & (sum_q <= 1.25)
                probs = np.full((n, 2), np.nan)
                probs_ad = np.full((n, 2), np.nan)
                if val.any():
                    probs[val] = proportional(pair[val])
                    probs_ad[val] = adaptive(pair[val])
                df[f"tot_{phase}_{src}_p_over"] = probs[:, 0]
                df[f"tot_{phase}_{src}_p_under"] = probs[:, 1]
                df[f"tot_{phase}_{src}_adaptive_p_over"] = probs_ad[:, 0]
                df[f"tot_{phase}_{src}_adaptive_p_under"] = probs_ad[:, 1]
                df[f"tot_{phase}_{src}_margin"] = np.where(val, sum_q - 1.0, np.nan)

        # Consenso de probabilidad Over 2.5 (priorizando Pinnacle adaptativo -> Avg -> B365)
        p_over_cons = np.full(n, np.nan, dtype=float)
        for src in ("b365", "avg", "p"):
            col = f"tot_{phase}_{src}_adaptive_p_over"
            if col not in df.columns:
                col = f"tot_{phase}_{src}_p_over"
            if col in df.columns:
                v = df[col].to_numpy(dtype=float)
                p_over_cons = np.where(np.isfinite(v), v, p_over_cons)
        df[f"tot_{phase}_consensus_p_over"] = p_over_cons
        lam_tot = implied_poisson_lambda_from_over25(p_over_cons)
        df[f"tot_{phase}_implied_goals"] = lam_tot

        # 2. Handicap Asiático (AH)
        for src in ("b365", "p", "avg", "max"):
            h_col, a_col = f"ah_{phase}_{src}_h", f"ah_{phase}_{src}_a"
            if h_col in df.columns and a_col in df.columns:
                pair = df[[h_col, a_col]].to_numpy(dtype=float)
                sum_q = np.where(np.all(pair > 1.0, axis=1), (1.0 / np.where(pair > 1.0, pair, np.nan)).sum(axis=1), np.nan)
                val = np.all(np.isfinite(pair), axis=1) & np.all(pair > 1.0, axis=1) & (sum_q >= 0.90) & (sum_q <= 1.25)
                probs = np.full((n, 2), np.nan)
                probs_ad = np.full((n, 2), np.nan)
                if val.any():
                    probs[val] = proportional(pair[val])
                    probs_ad[val] = adaptive(pair[val])
                df[f"ah_{phase}_{src}_p_home"] = probs[:, 0]
                df[f"ah_{phase}_{src}_p_away"] = probs[:, 1]
                df[f"ah_{phase}_{src}_adaptive_p_home"] = probs_ad[:, 0]
                df[f"ah_{phase}_{src}_adaptive_p_away"] = probs_ad[:, 1]
                df[f"ah_{phase}_{src}_margin"] = np.where(val, sum_q - 1.0, np.nan)

        # Línea AH y probabilidad de cubrir consenso (priorizando Pinnacle -> Avg -> B365)
        line_col = f"ah_{phase}_line"
        if line_col in df.columns:
            ah_line = df[line_col].to_numpy(dtype=float)
            if phase == "close" and "ah_open_line" in df.columns:
                ah_line = np.where(np.isfinite(ah_line), ah_line, df["ah_open_line"].to_numpy(dtype=float))
        else:
            ah_line = np.full(n, np.nan, dtype=float)

        p_ah_home = np.full(n, np.nan, dtype=float)
        for src in ("b365", "avg", "p"):
            col = f"ah_{phase}_{src}_adaptive_p_home"
            if col not in df.columns:
                col = f"ah_{phase}_{src}_p_home"
            if col in df.columns:
                v = df[col].to_numpy(dtype=float)
                p_ah_home = np.where(np.isfinite(v), v, p_ah_home)
        df[f"ah_{phase}_consensus_p_home"] = p_ah_home

        # Supremacía esperada de goles desde Handicap Asiático:
        p_clip = np.clip(p_ah_home, 0.03, 0.97)
        logit_ah = np.log(p_clip / (1.0 - p_clip))
        supremacy = -ah_line + 0.72 * logit_ah
        df[f"ah_{phase}_implied_supremacy"] = supremacy

        # Probabilidades 1X2 implícitas desde (tot_implied_goals, ah_implied_supremacy) vía Dixon-Coles
        tot_g = np.where(np.isfinite(lam_tot), lam_tot, 2.62)
        valid_ah = np.isfinite(supremacy)
        imp_h = np.full(n, np.nan, dtype=float)
        imp_d = np.full(n, np.nan, dtype=float)
        imp_a = np.full(n, np.nan, dtype=float)
        idxs = np.where(valid_ah)[0]
        for idx in idxs:
            lh = max(0.20, min(5.0, 0.5 * (tot_g[idx] + supremacy[idx])))
            la = max(0.20, min(5.0, 0.5 * (tot_g[idx] - supremacy[idx])))
            ph, pd_v, pa = _dixon_coles_1x2(lh, la)
            imp_h[idx] = ph
            imp_d[idx] = pd_v
            imp_a[idx] = pa
        df[f"mkt_{phase}_ah_implied_h"] = imp_h
        df[f"mkt_{phase}_ah_implied_d"] = imp_d
        df[f"mkt_{phase}_ah_implied_a"] = imp_a

        # Divergencia entre el mercado de Handicap Asiático/Totales y las cuotas 1X2 de B365
        for k in "hda":
            b365_col = f"mkt_{phase}_b365_adaptive_{k}"
            if b365_col not in df.columns:
                b365_col = f"mkt_{phase}_b365_proportional_{k}"
            if b365_col in df.columns:
                df[f"mkt_{phase}_ah_vs_b365_{k}"] = df[f"mkt_{phase}_ah_implied_{k}"] - df[b365_col]

    # Movimiento de línea en Handicap Asiático (apertura -> cierre)
    if "ah_open_implied_supremacy" in df.columns and "ah_close_implied_supremacy" in df.columns:
        df["ah_supremacy_move"] = df["ah_close_implied_supremacy"] - df["ah_open_implied_supremacy"]
    return df


def add_sharp_and_dispersion_features(df: pd.DataFrame) -> pd.DataFrame:
    """Añade señales Sharp-vs-Soft (`Pinnacle`/`Exchange` vs `B365`) y dispersión de cuotas (`Max`/`Avg`)."""
    for phase in ("open", "close"):
        for k in "hda":
            ps_col = f"mkt_{phase}_ps_adaptive_{k}"
            if ps_col not in df.columns:
                ps_col = f"mkt_{phase}_ps_shin_{k}"
            avg_col = f"mkt_{phase}_avg_adaptive_{k}"
            if avg_col not in df.columns:
                avg_col = f"mkt_{phase}_avg_shin_{k}"
            b365_col = f"mkt_{phase}_b365_proportional_{k}"
            if ps_col in df.columns and b365_col in df.columns:
                sharp_p = df[ps_col].to_numpy(dtype=float)
                if avg_col in df.columns:
                    avg_p = df[avg_col].to_numpy(dtype=float)
                    sharp_p = np.where(np.isfinite(sharp_p), sharp_p, avg_p)
                df[f"mkt_{phase}_sharp_prob_{k}"] = sharp_p
                df[f"mkt_{phase}_sharp_vs_b365_{k}"] = sharp_p - df[b365_col].to_numpy(dtype=float)

            # Ancla Exchange (Betfair Exchange BFE/BF cuando está disponible) frente a B365/Avg
            bfe_col = f"mkt_{phase}_bfe_adaptive_{k}"
            bf_col = f"mkt_{phase}_bf_adaptive_{k}"
            if bfe_col in df.columns or bf_col in df.columns:
                exch_p = np.full(len(df), np.nan, dtype=float)
                if bf_col in df.columns:
                    exch_p = df[bf_col].to_numpy(dtype=float)
                if bfe_col in df.columns:
                    v_bfe = df[bfe_col].to_numpy(dtype=float)
                    exch_p = np.where(np.isfinite(v_bfe), v_bfe, exch_p)
                df[f"mkt_{phase}_exchange_prob_{k}"] = exch_p
                if b365_col in df.columns:
                    df[f"mkt_{phase}_exchange_vs_b365_{k}"] = exch_p - df[b365_col].to_numpy(dtype=float)

            # Ratio de la mejor cuota del mercado (Max) frente al consenso (Avg) y frente a B365
            mx_o = f"odds_{phase}_max_{k}"
            av_o = f"odds_{phase}_avg_{k}"
            b3_o = f"odds_{phase}_b365_{k}"
            if mx_o in df.columns and av_o in df.columns:
                df[f"mkt_{phase}_max_over_avg_{k}"] = (df[mx_o] / df[av_o]) - 1.0
            if mx_o in df.columns and b3_o in df.columns:
                df[f"mkt_{phase}_max_over_b365_{k}"] = (df[mx_o] / df[b3_o]) - 1.0

        # Margen sintético de la mejor cuota disponible (Best-Line Overround)
        mx_cols = [f"odds_{phase}_max_{k}" for k in "hda"]
        if all(c in df.columns for c in mx_cols):
            mx_mat = df[mx_cols].to_numpy(dtype=float)
            val_mx = np.all(np.isfinite(mx_mat), axis=1) & np.all(mx_mat > 1.0, axis=1)
            df[f"mkt_{phase}_best_overround"] = np.where(val_mx, (1.0 / mx_mat).sum(axis=1) - 1.0, np.nan)
    return df


def build() -> pd.DataFrame:
    feats = pd.read_parquet(os.path.join(PROC, "features.parquet"))
    matches = pd.read_parquet(os.path.join(PROC, "matches.parquet"))
    mkt_raw_cols = [
        c
        for c in matches.columns
        if c.startswith("odds_") or c.startswith("totals_") or c.startswith("ah_") or c.startswith("n_books_")
    ]
    team_cols = [c for c in ("home_team", "away_team") if c in matches.columns and c not in feats.columns]
    base_feat_cols = [c for c in ("match_id", "div", "season", "match_date", "home_team", "away_team", "result", "y") if c in feats.columns]
    mm = matches[["match_id"] + team_cols + mkt_raw_cols]
    df = feats[base_feat_cols].merge(mm, on="match_id", how="left")

    for phase in ("open", "close"):
        for src in ("b365", "ps", "avg", "max", "bf", "bfe", "bw", "wh"):
            for method in ("proportional", "power", "shin", "adaptive"):
                df = add_source(df, phase, src, method)
            df = df.copy()

    # Corrección determinista de sesgo público recreativo en clubes populares de Liga MX (`MEX`)
    df = add_recreational_ligamx_features(df.copy())

    # Margen medio y dispersión entre B365 / Pinnacle / Betfair (método adaptativo)
    for phase in ("open", "close"):
        mat = np.stack(
            [df[f"mkt_{phase}_{s}_adaptive_{k}"].to_numpy() for s in ("b365", "ps", "bf") for k in "hda"],
            axis=1,
        ).reshape(len(df), 3, 3)
        df[f"mkt_{phase}_book_std"] = np.nanstd(mat, axis=1).mean(axis=1)
        df[f"mkt_{phase}_books_available"] = np.sum(np.all(np.isfinite(mat), axis=2), axis=1)

    # Señales multi-mercado: Totales, Handicap Asiático, Sharp-vs-Soft, Exchange y Dispersión
    df = add_totals_and_ah_features(df.copy())
    df = add_sharp_and_dispersion_features(df.copy())

    # Movimiento apertura -> cierre (solo escenario closing-line)
    for src in ("ps", "b365", "avg"):
        for k in "hda":
            o = df[f"mkt_open_{src}_adaptive_{k}"]
            c = df[f"mkt_close_{src}_adaptive_{k}"]
            df[f"mkt_move_{src}_{k}"] = np.log(c / o)
        df[f"mkt_move_{src}_l1"] = sum(df[f"mkt_move_{src}_{k}"].abs() for k in "hda")

    df["mkt_close_ps_fav_prob"] = df[[f"mkt_close_ps_adaptive_{k}" for k in "hda"]].max(axis=1)
    df["mkt_close_ps_entropy"] = -(
        df[[f"mkt_close_ps_adaptive_{k}" for k in "hda"]].clip(1e-9, 1)
        * np.log(df[[f"mkt_close_ps_adaptive_{k}" for k in "hda"]].clip(1e-9, 1))
    ).sum(axis=1)
    return df


def report(df: pd.DataFrame) -> str:
    lines = [
        "# Features de mercado (3ª Generación — `Singularity v3.0` & `Geodesic v2.0`) — generación y validación",
        "",
        f"Generado: {datetime.now(timezone.utc).isoformat(timespec='seconds')}",
        "",
        "## Cobertura de cuotas 1X2",
        "",
        "| Bloque | Partidos | % del total |",
        "|---|---|---|",
    ]
    for phase in ("open", "close"):
        for src in ("b365", "ps", "avg", "max", "bf", "bfe"):
            c = f"mkt_{phase}_{src}_valid"
            if c in df:
                lines.append(f"| {phase} {src} | {int(df[c].sum()):,} | {df[c].mean():.2%} |")
    lines += [
        "",
        "## Cobertura de mercados secundarios y corrección recreativa Liga MX",
        "",
        "| Señal / Mercado | Partidos | % del total |",
        "|---|---|---|",
    ]
    for col, label in (
        ("tot_open_consensus_p_over", "Totales O/U 2.5 Adaptativo (Apertura)"),
        ("tot_close_consensus_p_over", "Totales O/U 2.5 Adaptativo (Cierre)"),
        ("ah_open_consensus_p_home", "Handicap Asiático Adaptativo (Apertura)"),
        ("ah_close_consensus_p_home", "Handicap Asiático Adaptativo (Cierre)"),
        ("mkt_open_ah_implied_h", "1X2 Implícito desde AH+Totales (Apertura)"),
        ("mkt_close_avg_mx_bias_flag", "Partidos Liga MX con corrección de sesgo recreativo (Cierre)"),
    ):
        if col in df:
            if col.endswith("_flag"):
                cnt = int((df[col] > 0).sum())
                lines.append(f"| {label} | {cnt:,} | {cnt / max(1, len(df)):.2%} |")
            else:
                s = df[col].notna()
                lines.append(f"| {label} | {int(s.sum()):,} | {s.mean():.2%} |")
    lines += [
        "",
        "## Propiedades de los métodos de de-vig (cierre, B365)",
        "",
        "| Método | Suma media | Error máx. de suma | % válidos |",
        "|---|---|---|---|",
    ]
    for method in ("proportional", "power", "shin", "adaptive"):
        cols = [f"mkt_close_b365_{method}_{k}" for k in "hda"]
        if all(c in df.columns for c in cols):
            s = df[cols].sum(axis=1, min_count=3)
            lines.append(f"| {method} | {s.mean():.8f} | {np.nanmax(np.abs(s - 1)):.2e} | {s.notna().mean():.1%} |")
    lines += [
        "",
        "## Margen medio de la casa (overround, 1X2) y peso medio `w_shin` adaptativo",
        "",
        "| Fuente | Apertura | Cierre | `w_shin` medio (Cierre) |",
        "|---|---|---|---|",
    ]
    for src in ("b365", "ps", "avg", "max", "bf", "bfe"):
        o = df[f"mkt_open_{src}_margin"].mean() if f"mkt_open_{src}_margin" in df else np.nan
        c = df[f"mkt_close_{src}_margin"].mean() if f"mkt_close_{src}_margin" in df else np.nan
        ws = df[f"mkt_close_{src}_w_shin"].mean() if f"mkt_close_{src}_w_shin" in df else np.nan
        lines.append(f"| {src} | {o:.3%} | {c:.3%} | {ws:.3f} |")
    lines += [
        "",
        "## Nota de disponibilidad",
        "",
        "`open` se supone disponible antes del partido (no hay timestamp en la fuente). "
        "`close` es la última cuota previa al inicio: se usa como benchmark de mercado y como "
        "escenario de línea de cierre, nunca como feature de un modelo operable con antelación. "
        "Los movimientos apertura->cierre se evalúan solo en ese escenario (EXP13).",
    ]
    return "\n".join(lines) + "\n"


def main():
    df = build()
    df.to_parquet(os.path.join(PROC, "features_market.parquet"), index=False)
    df.to_csv(os.path.join(PROC, "features_market.csv"), index=False)
    rep = report(df)
    with open(os.path.join(ROOT, "reports", "A07_market_features.md"), "w", encoding="utf-8") as f:
        f.write(rep)
    print(rep[:2600])
    print(f"escrito -> {os.path.join(PROC, 'features_market.parquet')} ({len(df):,} filas)")


if __name__ == "__main__":
    main()
