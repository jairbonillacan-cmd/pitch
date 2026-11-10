#!/usr/bin/env python3
"""Modelo causal jerárquico de Expected Goals (`Real xG > Shot Proxy xG > DC Shrinkage`) y `xPTS` Poisson.

Jerarquía Tachyon v3.0:
  1. `Real xG` exacto (`is_exact_xg == True`) desde `ws_soccer_match_xg_2018_2026.parquet`
     (deduplicado por `match_id`, cubriendo Top-5 Europa `E0, SP1, D1, I1, F1` y Liga MX `MEX`
     `2018–2026`), o columnas nativas `xg_home`/`xg_away` si están disponibles -> `has_real_xg = 1.0`.
     REGLA ANTI-LEAKAGE: jamás carga ni utiliza `post_shot_forecast_p_*`.
  2. `Shot Proxy xG` calibrado en train (`season_start < 2020`) cuando existen tiros/córners -> `has_real_xg = 0.0`:
        xG_H = 0.075 + 0.288 * SOT_H + 0.022 * max(0, HS - SOT_H) + 0.015 * HC
        xG_A = 0.055 + 0.278 * SOT_A + 0.020 * max(0, AS - SOT_A) + 0.014 * AC
     mezclado `0.80 * shot_xg + 0.20 * goals`.
  3. Fallback sin tiros (divisiones secundarias o temporadas antiguas): encogimiento bayesiano hacia
     la expectativa pre-partido Dixon-Coles (`0.60 * goals + 0.40 * dc_lam`) -> `has_real_xg = 0.0`.

Causalidad estricta:
  Todos los valores calculados aquí resumen el rendimiento post-partido del encuentro `t'` y
  SOLO entran como features de partidos futuros `t > t'` mediante `.shift(1)` o actualización
  post-partido de `xG-Elo`.
"""
from __future__ import annotations

import math
import os

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WS_MATCH_XG_PATH = os.path.join(
    ROOT, "data", "processed", "web_scraping", "ws_soccer_match_xg_2018_2026.parquet"
)

# Coeficientes calibrados exclusivamente en train (season_start < 2020)
INTERCEPT_H = 0.075
W_SOT_H = 0.288
W_SOFF_H = 0.022
W_CORN_H = 0.015

INTERCEPT_A = 0.055
W_SOT_A = 0.278
W_SOFF_A = 0.020
W_CORN_A = 0.014

_EXACT_XG_CACHE: dict[str, tuple[float, float]] | None = None


def load_exact_match_xg_map(path: str = WS_MATCH_XG_PATH) -> dict[str, tuple[float, float]]:
    """Carga y cachea el mapa `match_id -> (real_home_xg, real_away_xg)` con `is_exact_xg == True`.

    Regla anti-leakage: lee únicamente `match_id`, `real_home_xg`, `real_away_xg`, `is_exact_xg`.
    """
    global _EXACT_XG_CACHE
    if _EXACT_XG_CACHE is not None and path == WS_MATCH_XG_PATH:
        return _EXACT_XG_CACHE

    if not os.path.exists(path):
        if path == WS_MATCH_XG_PATH:
            _EXACT_XG_CACHE = {}
        return {}

    ws = pd.read_parquet(
        path,
        columns=["match_id", "real_home_xg", "real_away_xg", "is_exact_xg"],
    )
    mask = (
        ws["is_exact_xg"].fillna(False).astype(bool)
        & ws["match_id"].notna()
        & np.isfinite(pd.to_numeric(ws["real_home_xg"], errors="coerce"))
        & np.isfinite(pd.to_numeric(ws["real_away_xg"], errors="coerce"))
    )
    ws = ws.loc[mask].drop_duplicates(subset=["match_id"], keep="first")
    mapping = {
        str(m_id): (float(xh), float(xa))
        for m_id, xh, xa in zip(
            ws["match_id"].tolist(),
            ws["real_home_xg"].to_numpy(dtype=float),
            ws["real_away_xg"].to_numpy(dtype=float),
        )
    }
    if path == WS_MATCH_XG_PATH:
        _EXACT_XG_CACHE = mapping
    return mapping


def compute_match_xg_proxy(
    df: pd.DataFrame,
    dc_lam_home: np.ndarray | None = None,
    dc_lam_away: np.ndarray | None = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Calcula únicamente el fallback `Shot Proxy xG > DC Shrinkage` para cada fila de `df`."""
    n = len(df)
    hg = df["home_goals"].to_numpy(dtype=float)
    ag = df["away_goals"].to_numpy(dtype=float)

    sh_h = df["shots_home"].to_numpy(dtype=float) if "shots_home" in df.columns else np.full(n, np.nan)
    sh_a = df["shots_away"].to_numpy(dtype=float) if "shots_away" in df.columns else np.full(n, np.nan)
    sot_h = df["sot_home"].to_numpy(dtype=float) if "sot_home" in df.columns else np.full(n, np.nan)
    sot_a = df["sot_away"].to_numpy(dtype=float) if "sot_away" in df.columns else np.full(n, np.nan)
    cor_h = df["corners_home"].to_numpy(dtype=float) if "corners_home" in df.columns else np.full(n, np.nan)
    cor_a = df["corners_away"].to_numpy(dtype=float) if "corners_away" in df.columns else np.full(n, np.nan)

    if dc_lam_home is None:
        dc_lam_home = np.full(n, 1.45, dtype=float)
    if dc_lam_away is None:
        dc_lam_away = np.full(n, 1.12, dtype=float)

    has_shots = np.isfinite(sot_h) & np.isfinite(sot_a) & np.isfinite(sh_h) & np.isfinite(sh_a)

    soff_h = np.maximum(0.0, np.where(has_shots, sh_h - sot_h, 0.0))
    soff_a = np.maximum(0.0, np.where(has_shots, sh_a - sot_a, 0.0))
    c_h = np.where(np.isfinite(cor_h), cor_h, 4.8)
    c_a = np.where(np.isfinite(cor_a), cor_a, 4.0)

    shot_xgh = INTERCEPT_H + W_SOT_H * np.nan_to_num(sot_h, nan=0.0) + W_SOFF_H * soff_h + W_CORN_H * c_h
    shot_xga = INTERCEPT_A + W_SOT_A * np.nan_to_num(sot_a, nan=0.0) + W_SOFF_A * soff_a + W_CORN_A * c_a

    # Mezcla con goles reales (80% modelo de tiros + 20% goles observados para capturar calidad de tiro)
    shot_xgh = np.where(np.isfinite(hg), 0.80 * shot_xgh + 0.20 * hg, shot_xgh)
    shot_xga = np.where(np.isfinite(ag), 0.80 * shot_xga + 0.20 * ag, shot_xga)

    # Fallback sin tiros: encogimiento de goles observados hacia lambda pre-partido
    fallback_xgh = np.where(np.isfinite(hg), 0.60 * hg + 0.40 * dc_lam_home, np.nan)
    fallback_xga = np.where(np.isfinite(ag), 0.60 * ag + 0.40 * dc_lam_away, np.nan)

    proxy_xgh = np.where(has_shots, shot_xgh, fallback_xgh)
    proxy_xga = np.where(has_shots, shot_xga, fallback_xga)
    return proxy_xgh, proxy_xga, has_shots


def compute_match_xg_hierarchical(
    df: pd.DataFrame,
    dc_lam_home: np.ndarray | None = None,
    dc_lam_away: np.ndarray | None = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Devuelve `(xg_home, xg_away, has_shots_or_xg, has_real_xg)` con reemplazo jerárquico `Real xG > Proxy xG`."""
    n = len(df)
    proxy_xgh, proxy_xga, has_shots = compute_match_xg_proxy(df, dc_lam_home, dc_lam_away)

    csv_xgh = df["xg_home"].to_numpy(dtype=float) if "xg_home" in df.columns else np.full(n, np.nan)
    csv_xga = df["xg_away"].to_numpy(dtype=float) if "xg_away" in df.columns else np.full(n, np.nan)

    ws_xgh = np.full(n, np.nan, dtype=float)
    ws_xga = np.full(n, np.nan, dtype=float)
    if "match_id" in df.columns:
        xg_map = load_exact_match_xg_map()
        if xg_map:
            mids = df["match_id"].astype(str).tolist()
            for idx, mid in enumerate(mids):
                pair = xg_map.get(mid)
                if pair is not None:
                    ws_xgh[idx] = pair[0]
                    ws_xga[idx] = pair[1]

    has_ws_xg = np.isfinite(ws_xgh) & np.isfinite(ws_xga)
    has_csv_xg = np.isfinite(csv_xgh) & np.isfinite(csv_xga)
    has_real_xg = has_ws_xg | has_csv_xg

    real_xgh = np.where(has_ws_xg, ws_xgh, csv_xgh)
    real_xga = np.where(has_ws_xg, ws_xga, csv_xga)

    out_xgh = np.where(has_real_xg, np.maximum(0.0, real_xgh), proxy_xgh)
    out_xga = np.where(has_real_xg, np.maximum(0.0, real_xga), proxy_xga)

    return out_xgh, out_xga, (has_shots | has_real_xg).astype(float), has_real_xg.astype(float)


def compute_match_synthetic_xg(
    df: pd.DataFrame,
    dc_lam_home: np.ndarray | None = None,
    dc_lam_away: np.ndarray | None = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Compatibilidad hacia atrás: devuelve `(match_xg_home, match_xg_away, has_shot_or_xg_data)`."""
    out_xgh, out_xga, has_shots_or_xg, _ = compute_match_xg_hierarchical(df, dc_lam_home, dc_lam_away)
    return out_xgh, out_xga, has_shots_or_xg


def compute_poisson_xpts_and_score(
    xg_for: np.ndarray,
    xg_against: np.ndarray,
    max_goals: int = 10,
) -> tuple[np.ndarray, np.ndarray]:
    """Calcula `xPTS` exacto (`3*P_win + 1*P_draw`) y `exp_score` (`P_win + 0.5*P_draw`) vía Poisson truncado `0..max_goals`.

    Vectorizado `O((max_goals + 1) * N)`. Preserva `NaN` donde `xg_for` o `xg_against` no son finitos.
    """
    xf = np.asarray(xg_for, dtype=float)
    xa = np.asarray(xg_against, dtype=float)
    valid = np.isfinite(xf) & np.isfinite(xa)

    lam_f = np.clip(np.where(valid, xf, 1.25), 1e-4, 8.5)
    lam_a = np.clip(np.where(valid, xa, 1.25), 1e-4, 8.5)

    ks = np.arange(max_goals + 1, dtype=float)
    log_fact = np.array([math.lgamma(k + 1.0) for k in ks], dtype=float)

    # P(G = k) = exp(-lam + k * log(lam) - log(k!)), normalizado en 0..max_goals
    log_pf = -lam_f[:, None] + ks[None, :] * np.log(lam_f)[:, None] - log_fact[None, :]
    log_pa = -lam_a[:, None] + ks[None, :] * np.log(lam_a)[:, None] - log_fact[None, :]

    pf = np.exp(log_pf)
    pa = np.exp(log_pa)
    pf /= np.maximum(1e-15, pf.sum(axis=1, keepdims=True))
    pa /= np.maximum(1e-15, pa.sum(axis=1, keepdims=True))

    p_draw = np.sum(pf * pa, axis=1)
    cdf_a_less = np.zeros_like(pa)
    cdf_a_less[:, 1:] = np.cumsum(pa[:, :-1], axis=1)
    p_win = np.sum(pf * cdf_a_less, axis=1)

    xpts = np.where(valid, 3.0 * p_win + 1.0 * p_draw, np.nan)
    exp_score = np.where(valid, p_win + 0.5 * p_draw, np.nan)
    return xpts, exp_score
