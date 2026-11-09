#!/usr/bin/env python3
"""Opta-Proxies Tácticos: Post-Shot xGOT, Prevención de Arquero, Field Tilt y Régimen Táctico.

Inspirado en el análisis de ingeniería inversa de Statiskicks (OptaKeeperGoalmouthService,
OptaTeamAttributeService y OptaTeamXgTimelineService):
  1. Post-Shot Expected Goals on Target (xGOT / PSxG):
     Evalúa únicamente los tiros a puerta (SOT) y su dificultad de conversión.
  2. Goles Prevenidos por el Arquero (prevented = xgot_opponent - goals_conceded):
     Mide el rendimiento del guardameta y la defensa de línea ante tiros a portería.
  3. Territorial Field Tilt Proxy:
     Participación del equipo en acciones de peligro territorial (tiros + 1.5 * corners)
     sobre el total del partido (normalizado en [0, 1]).
  4. Sobre-rendimiento finalizador clínico (clinical_overperf = goals - xgot).
  5. Quiebres de régimen estructural (regime shifts) comparando ventanas cortas (r5)
     frente al baseline medio (r10).

Causalidad estricta:
  Las métricas de partido calculadas aquí son post-partido y SOLO se agregan hacia
  adelante en `build_features.py` y `fixture_features.py` mediante `.shift(1)`.
"""
from __future__ import annotations

import numpy as np
import pandas as pd


def compute_match_xgot_and_tactical_proxies(
    df: pd.DataFrame,
    xgf_h: np.ndarray,
    xgf_a: np.ndarray,
) -> dict[str, np.ndarray]:
    """Calcula métricas post-partido tácticas para cada encuentro de `df`.

    Parámetros:
      df: DataFrame con resultados y estadísticas de tiros/corners.
      xgf_h: expectativa pre-tiro xG sintético / real local.
      xgf_a: expectativa pre-tiro xG sintético / real visitante.

    Retorna:
      Diccionario con arrays de longitud n:
        - xgot_home, xgot_away: Post-shot xG en tiros a puerta.
        - gk_prevented_home, gk_prevented_away: Goles evitados por el arquero.
        - field_tilt_home, field_tilt_away: Dominio territorial [0, 1].
        - clinical_overperf_home, clinical_overperf_away: Sobre-rendimiento clínico.
    """
    n = len(df)
    hg = df["home_goals"].to_numpy(dtype=float) if "home_goals" in df.columns else np.full(n, np.nan)
    ag = df["away_goals"].to_numpy(dtype=float) if "away_goals" in df.columns else np.full(n, np.nan)

    sh_h = df["shots_home"].to_numpy(dtype=float) if "shots_home" in df.columns else np.full(n, np.nan)
    sh_a = df["shots_away"].to_numpy(dtype=float) if "shots_away" in df.columns else np.full(n, np.nan)
    sot_h = df["sot_home"].to_numpy(dtype=float) if "sot_home" in df.columns else np.full(n, np.nan)
    sot_a = df["sot_away"].to_numpy(dtype=float) if "sot_away" in df.columns else np.full(n, np.nan)

    cor_h = df["corners_home"].to_numpy(dtype=float) if "corners_home" in df.columns else np.full(n, np.nan)
    cor_a = df["corners_away"].to_numpy(dtype=float) if "corners_away" in df.columns else np.full(n, np.nan)

    # -------------------------------------------------------------------------
    # 1. Post-Shot xGOT (Expected Goals on Target)
    # -------------------------------------------------------------------------
    def _calc_team_xgot(
        sot: np.ndarray,
        shots: np.ndarray,
        goals: np.ndarray,
        xg_pre: np.ndarray,
    ) -> np.ndarray:
        has_sot = np.isfinite(sot) & np.isfinite(shots)
        safe_sot = np.maximum(0.0, np.nan_to_num(sot, nan=0.0))
        safe_shots = np.maximum(0.0, np.nan_to_num(shots, nan=0.0))
        safe_goals = np.maximum(0.0, np.nan_to_num(goals, nan=0.0))

        # Tiros a puerta que culminaron en gol vs atajados/bloqueados sobre la línea
        g_on_target = np.minimum(safe_goals, safe_sot)
        saved_on_target = np.maximum(0.0, safe_sot - g_on_target)

        # Calibración de dificultad de tiro: calidad pre-tiro promedio por disparo
        shot_quality = np.clip(
            xg_pre / np.maximum(1.0, safe_shots),
            0.05,
            0.40,
        )
        # En Opta / Statiskicks:
        # Tiros a puerta atajados promedian ~0.18 - 0.22 xGOT
        # Goles anotados promedian ~0.68 - 0.74 xGOT
        w_save = 0.18 + 0.10 * shot_quality
        w_goal = 0.68 + 0.15 * shot_quality

        xgot_detailed = w_goal * g_on_target + w_save * saved_on_target
        # Caso propio gol o discrepancia estadística donde goals > sot
        uncounted_goals = np.maximum(0.0, safe_goals - safe_sot)
        xgot_detailed = xgot_detailed + 0.70 * uncounted_goals

        # Fallback sin tiros (ligas menores o temporadas antiguas):
        # encogimiento bayesiano de xG pre-partido con los goles observados
        fallback_goals = np.where(np.isfinite(goals), safe_goals, xg_pre)
        xgot_fallback = 0.65 * xg_pre + 0.35 * fallback_goals

        return np.maximum(
            0.0,
            np.where(has_sot, xgot_detailed, xgot_fallback),
        )

    xgot_h = _calc_team_xgot(sot_h, sh_h, hg, xgf_h)
    xgot_a = _calc_team_xgot(sot_a, sh_a, ag, xgf_a)

    # -------------------------------------------------------------------------
    # 2. Goalkeeper Goals Prevented (prevented = xgot_opponent - opponent_goals)
    # -------------------------------------------------------------------------
    # Arquero local enfrenta el xgot visitante y los goles visitantes concedidos
    safe_ag = np.where(np.isfinite(ag), ag, xgf_a)
    safe_hg = np.where(np.isfinite(hg), hg, xgf_h)
    gk_prev_h = xgot_a - safe_ag
    gk_prev_a = xgot_h - safe_hg

    # -------------------------------------------------------------------------
    # 3. Territorial Field Tilt Proxy: acciones en tercio final / ataque
    #    field_tilt = (shots + 1.5 * corners) / total_actions in [0, 1]
    # -------------------------------------------------------------------------
    has_territorial = np.isfinite(sh_h) & np.isfinite(sh_a)
    c_h = np.nan_to_num(cor_h, nan=0.0)
    c_a = np.nan_to_num(cor_a, nan=0.0)

    act_h = np.maximum(0.0, np.nan_to_num(sh_h, nan=0.0)) + 1.5 * np.maximum(0.0, c_h)
    act_a = np.maximum(0.0, np.nan_to_num(sh_a, nan=0.0)) + 1.5 * np.maximum(0.0, c_a)
    tot_act = act_h + act_a

    valid_tilt = has_territorial & (tot_act > 0.0)
    tot_act_safe = np.where(valid_tilt, tot_act, 1.0)
    tilt_h = np.where(valid_tilt, act_h / tot_act_safe, 0.5)
    tilt_a = np.where(valid_tilt, act_a / tot_act_safe, 0.5)

    # -------------------------------------------------------------------------
    # 4. Clinical Finishing Overperformance (goals - xgot)
    # -------------------------------------------------------------------------
    clin_h = safe_hg - xgot_h
    clin_a = safe_ag - xgot_a

    return {
        "xgot_home": xgot_h,
        "xgot_away": xgot_a,
        "gk_prevented_home": gk_prev_h,
        "gk_prevented_away": gk_prev_a,
        "field_tilt_home": tilt_h,
        "field_tilt_away": tilt_a,
        "clinical_overperf_home": clin_h,
        "clinical_overperf_away": clin_a,
    }


def compute_regime_shift_features(df_out: pd.DataFrame) -> pd.DataFrame:
    """Calcula quiebres de régimen estructural y diferenciales pre-partido.

    Features producidas:
      - h_xgd_regime_shift = h_xgd_r5 - h_xgd_r10
      - a_xgd_regime_shift = a_xgd_r5 - a_xgd_r10
      - xgd_regime_shift_diff = h_xgd_regime_shift - a_xgd_regime_shift
      - gk_prevented_diff_r5 = h_gk_prevented_r5 - a_gk_prevented_r5
      - gk_prevented_diff_r10 = h_gk_prevented_r10 - a_gk_prevented_r10
      - field_tilt_diff_r5 = h_field_tilt_r5 - a_field_tilt_r5
    """
    out = df_out.copy()

    h_r5 = out["h_xgd_r5"] if "h_xgd_r5" in out.columns else np.nan
    h_r10 = out["h_xgd_r10"] if "h_xgd_r10" in out.columns else np.nan
    a_r5 = out["a_xgd_r5"] if "a_xgd_r5" in out.columns else np.nan
    a_r10 = out["a_xgd_r10"] if "a_xgd_r10" in out.columns else np.nan

    h_shift = h_r5 - h_r10
    a_shift = a_r5 - a_r10
    out["h_xgd_regime_shift"] = h_shift
    out["a_xgd_regime_shift"] = a_shift
    out["xgd_regime_shift_diff"] = h_shift - a_shift

    h_gk_r5 = out["h_gk_prevented_r5"] if "h_gk_prevented_r5" in out.columns else np.nan
    a_gk_r5 = out["a_gk_prevented_r5"] if "a_gk_prevented_r5" in out.columns else np.nan
    h_gk_r10 = out["h_gk_prevented_r10"] if "h_gk_prevented_r10" in out.columns else np.nan
    a_gk_r10 = out["a_gk_prevented_r10"] if "a_gk_prevented_r10" in out.columns else np.nan

    out["gk_prevented_diff_r5"] = h_gk_r5 - a_gk_r5
    out["gk_prevented_diff_r10"] = h_gk_r10 - a_gk_r10

    h_ft_r5 = out["h_field_tilt_r5"] if "h_field_tilt_r5" in out.columns else np.nan
    a_ft_r5 = out["a_field_tilt_r5"] if "a_field_tilt_r5" in out.columns else np.nan
    out["field_tilt_diff_r5"] = h_ft_r5 - a_ft_r5

    return out
