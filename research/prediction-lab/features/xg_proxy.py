#!/usr/bin/env python3
"""Modelo causal de Synthetic xG (Expected Goals proxy) y sobre-rendimiento finalizador.

Construye:
  - `match_xg_home`, `match_xg_away`: estimación post-partido de xG generados en cada partido
    (solo se usa a través de `shift(1)` en ventanas móviles de partidos futuros, nunca del partido actual).
  - Si el CSV contiene `xg_home`/`xg_away` reales (`HxG`/`AxG`), los utiliza directamente.
  - Si contiene tiros (`shots`, `sot`, `corners`), aplica un modelo calibrado sobre el split
    de entrenamiento pre-2020 (sin leakage temporal):
        xG_H = 0.075 + 0.288 * SOT_H + 0.022 * max(0, HS - SOT_H) + 0.015 * HC
        xG_A = 0.055 + 0.278 * SOT_A + 0.020 * max(0, AS - SOT_A) + 0.014 * AC
  - Si el partido carece de estadísticas de tiros (p.ej. ligas extra o temporadas antiguas),
    usa encogimiento bayesiano hacia la expectativa pre-partido Dixon-Coles (`dc_lam_home`, `dc_lam_away`).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

# Coeficientes calibrados exclusivamente en train (season_start < 2020)
INTERCEPT_H = 0.075
W_SOT_H = 0.288
W_SOFF_H = 0.022
W_CORN_H = 0.015

INTERCEPT_A = 0.055
W_SOT_A = 0.278
W_SOFF_A = 0.020
W_CORN_A = 0.014


def compute_match_synthetic_xg(
    df: pd.DataFrame,
    dc_lam_home: np.ndarray | None = None,
    dc_lam_away: np.ndarray | None = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Devuelve `(match_xg_home, match_xg_away, has_shot_data)` para cada fila de `df`.

    Nota de causalidad: estos valores resumen el rendimiento del partido `i` una vez jugado y
    SOLO deben agregarse hacia adelante mediante `shift(1)` en `build_features.py`.
    """
    n = len(df)
    hg = df["home_goals"].to_numpy(dtype=float)
    ag = df["away_goals"].to_numpy(dtype=float)

    sh_h = df["shots_home"].to_numpy(dtype=float) if "shots_home" in df.columns else np.full(n, np.nan)
    sh_a = df["shots_away"].to_numpy(dtype=float) if "shots_away" in df.columns else np.full(n, np.nan)
    sot_h = df["sot_home"].to_numpy(dtype=float) if "sot_home" in df.columns else np.full(n, np.nan)
    sot_a = df["sot_away"].to_numpy(dtype=float) if "sot_away" in df.columns else np.full(n, np.nan)
    cor_h = df["corners_home"].to_numpy(dtype=float) if "corners_home" in df.columns else np.full(n, np.nan)
    cor_a = df["corners_away"].to_numpy(dtype=float) if "corners_away" in df.columns else np.full(n, np.nan)

    real_xgh = df["xg_home"].to_numpy(dtype=float) if "xg_home" in df.columns else np.full(n, np.nan)
    real_xga = df["xg_away"].to_numpy(dtype=float) if "xg_away" in df.columns else np.full(n, np.nan)

    if dc_lam_home is None:
        dc_lam_home = np.full(n, 1.45, dtype=float)
    if dc_lam_away is None:
        dc_lam_away = np.full(n, 1.12, dtype=float)

    has_shots = np.isfinite(sot_h) & np.isfinite(sot_a) & np.isfinite(sh_h) & np.isfinite(sh_a)
    has_real_xg = np.isfinite(real_xgh) & np.isfinite(real_xga)

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

    out_xgh = np.where(has_real_xg, real_xgh, np.where(has_shots, shot_xgh, fallback_xgh))
    out_xga = np.where(has_real_xg, real_xga, np.where(has_shots, shot_xga, fallback_xga))

    return out_xgh, out_xga, (has_shots | has_real_xg).astype(float)
