#!/usr/bin/env python3
"""Opta-Proxies Tácticos, Presión/Invasión Real Understat y Física Invariante de Altitud (Tachyon v3.0).

Contiene:
  1. Post-Shot Expected Goals on Target (xGOT / PSxG), Prevención de Arquero,
     Territorial Field Tilt Proxy, Sobre-rendimiento Clínico y Quiebres de Régimen (`v2.1`).
  2. Carga causal de `ws_understat_team_match_tactical.parquet` (`PPDA`, `Deep Completions`,
     `npxGD`, `xPTS`) con ventanas `.shift(1)` (`min_periods=2`) y tratamiento 100 % simétrico
     de `NaN -> 0.0` entre `build_features.py` y `fixture_features.py`.
  3. Física invariante de estadio desde `ws_stadium_physics.parquet` (`altitude_diff_m`,
     `altitude_shock_flag`, `surface_pressure_diff`), con desambiguación exacta
     `Mazatlan FC = 12 m` vs `Atlante = 2245 m` y atmósfera estándar ISA.

Causalidad estricta:
  Las métricas de partido calculadas aquí son post-partido y SOLO se agregan hacia
  adelante en `build_features.py` y `fixture_features.py` mediante `.shift(1)`.
  La física de estadio depende únicamente de `(div, home_team)` y `(div, away_team)`.
"""
from __future__ import annotations

import json
import os

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WS_UNDERSTAT_PATH = os.path.join(
    ROOT, "data", "processed", "web_scraping", "ws_understat_team_match_tactical.parquet"
)
WS_STADIUM_PHYSICS_PATH = os.path.join(
    ROOT, "data", "processed", "web_scraping", "ws_stadium_physics.parquet"
)

UNDERSTAT_ROLL_COLS = [
    "ppda_avg",
    "ppda_allowed_avg",
    "deep_completions",
    "deep_allowed",
    "npxgd",
]

_UNDERSTAT_CACHE: pd.DataFrame | None = None
_STADIUM_INDEX_CACHE: tuple[dict[tuple[str, str], tuple[float, float]], dict[str, tuple[float, float]]] | None = None


def isa_pressure_hpa(elev_m: float) -> float:
    """Presión barométrica estándar ISA (hPa) para una elevación `elev_m` en metros."""
    e = float(elev_m)
    return float(1013.25 * ((1.0 - 2.25577e-5 * e) ** 5.25588))


# Desambiguación histórica explícita e invariantes físicos de clubes Liga MX sin fila en team_master actual
HISTORICAL_CLUB_ALTITUDE_OVERRIDES: dict[tuple[str, str], tuple[float, float]] = {
    ("MEX", "Mazatlan FC"): (12.0, round(isa_pressure_hpa(12.0), 2)),
    ("MEX", "Atlante"): (2245.0, round(isa_pressure_hpa(2245.0), 2)),
    ("MEX", "Chiapas"): (522.0, round(isa_pressure_hpa(522.0), 2)),
    ("MEX", "Dorados de Sinaloa"): (55.0, round(isa_pressure_hpa(55.0), 2)),
    ("MEX", "Leones Negros"): (1558.0, round(isa_pressure_hpa(1558.0), 2)),
}


def load_understat_tactical_df(path: str = WS_UNDERSTAT_PATH) -> pd.DataFrame:
    """Carga y cachea métricas tácticas Understat indexables por `(match_id, is_home)`."""
    global _UNDERSTAT_CACHE
    if _UNDERSTAT_CACHE is not None and path == WS_UNDERSTAT_PATH:
        return _UNDERSTAT_CACHE

    cols = [
        "match_id",
        "is_home",
        "xpts",
        "npxgd",
        "ppda_avg",
        "ppda_allowed_avg",
        "deep_completions",
        "deep_allowed",
    ]
    if not os.path.exists(path):
        empty = pd.DataFrame(columns=cols)
        if path == WS_UNDERSTAT_PATH:
            _UNDERSTAT_CACHE = empty
        return empty

    u = pd.read_parquet(path, columns=cols).copy()
    u = u[u["match_id"].notna()].copy()
    u["match_id"] = u["match_id"].astype(str)
    u["is_home"] = u["is_home"].astype(int)
    # Acotar outliers extremos de PPDA en partidos con expulsiones tempranas / casi 0 acciones defensivas
    u["ppda_avg"] = pd.to_numeric(u["ppda_avg"], errors="coerce").clip(2.0, 40.0)
    u["ppda_allowed_avg"] = pd.to_numeric(u["ppda_allowed_avg"], errors="coerce").clip(2.0, 40.0)
    u["deep_completions"] = pd.to_numeric(u["deep_completions"], errors="coerce")
    u["deep_allowed"] = pd.to_numeric(u["deep_allowed"], errors="coerce")
    u["npxgd"] = pd.to_numeric(u["npxgd"], errors="coerce")
    u["xpts"] = pd.to_numeric(u["xpts"], errors="coerce")
    u = u.drop_duplicates(subset=["match_id", "is_home"], keep="first").reset_index(drop=True)

    if path == WS_UNDERSTAT_PATH:
        _UNDERSTAT_CACHE = u
    return u


def safe_zero_diff_scalar(h_val: float | None, a_val: float | None) -> float:
    """Diferencial escalar idéntico a `build_features.py`: `0.0` cuando cualquiera de los dos lados es `NaN`."""
    if h_val is None or a_val is None or pd.isna(h_val) or pd.isna(a_val):
        return 0.0
    return float(h_val) - float(a_val)


def compute_understat_diff_features(df_out: pd.DataFrame) -> pd.DataFrame:
    """Añade diferenciales causales `ppda_diff_r*`, `deep_completions_diff_r*` y `npxgd_diff_r*`.

    Cuando un partido pertenece a una división o periodo sin datos Understat (o algún equipo tiene `< 2`
    partidos con Understat en la ventana), el diferencial toma exactamente `0.0`, preservando paridad
    100 % exacta con `fixture_features.py` y neutralidad en divisiones secundarias.
    """
    out = df_out.copy()
    specs = [
        ("ppda_diff_r5", "h_ppda_avg_r5", "a_ppda_avg_r5"),
        ("ppda_diff_r10", "h_ppda_avg_r10", "a_ppda_avg_r10"),
        ("deep_completions_diff_r5", "h_deep_completions_r5", "a_deep_completions_r5"),
        ("deep_completions_diff_r10", "h_deep_completions_r10", "a_deep_completions_r10"),
        ("npxgd_diff_r5", "h_npxgd_r5", "a_npxgd_r5"),
        ("npxgd_diff_r10", "h_npxgd_r10", "a_npxgd_r10"),
    ]
    n = len(out)
    for dst, hc, ac in specs:
        h = out[hc].to_numpy(dtype=float) if hc in out.columns else np.full(n, np.nan)
        a = out[ac].to_numpy(dtype=float) if ac in out.columns else np.full(n, np.nan)
        valid = np.isfinite(h) & np.isfinite(a)
        out[dst] = np.where(valid, h - a, 0.0)
    return out


def load_stadium_physics_index(
    path: str = WS_STADIUM_PHYSICS_PATH,
) -> tuple[dict[tuple[str, str], tuple[float, float]], dict[str, tuple[float, float]]]:
    """Construye y cachea `(team_map, div_fallback_map)` con `(elev_m, pressure_hpa)`."""
    global _STADIUM_INDEX_CACHE
    if _STADIUM_INDEX_CACHE is not None and path == WS_STADIUM_PHYSICS_PATH:
        return _STADIUM_INDEX_CACHE

    team_map: dict[tuple[str, str], tuple[float, float]] = dict(HISTORICAL_CLUB_ALTITUDE_OVERRIDES)
    div_elevs: dict[str, list[float]] = {}

    if os.path.exists(path):
        sp = pd.read_parquet(path).copy()
        prio_map = {
            "historical_club_invariant": 0,
            "stadium_primary": 1,
            "team_master_supplement": 2,
        }
        sp["_prio"] = sp["record_scope"].map(lambda s: prio_map.get(str(s), 9))
        sp["_idx"] = np.arange(len(sp))
        sp = sp.sort_values(["_prio", "_idx"], kind="mergesort")

        for r in sp.itertuples(index=False):
            div = str(r.div)
            elev = float(r.stadium_elevation_m)
            pres = (
                float(r.structural_pressure_hpa)
                if pd.notna(r.structural_pressure_hpa)
                else round(isa_pressure_hpa(elev), 2)
            )
            div_elevs.setdefault(div, []).append(elev)

            primary = str(r.primary_pl_team)
            mapped: list[str] = []
            if isinstance(r.mapped_teams_json, str) and r.mapped_teams_json.strip():
                try:
                    parsed = json.loads(r.mapped_teams_json)
                    if isinstance(parsed, list):
                        mapped = [str(x) for x in parsed]
                except json.JSONDecodeError:
                    mapped = []
            # Priorizar coincidencia primaria antes que co-inquilinos secundarios
            ordered_teams = [primary] + [t for t in mapped if t != primary]
            for t in ordered_teams:
                key = (div, t)
                if key not in team_map:
                    team_map[key] = (elev, pres)

    div_fallback: dict[str, tuple[float, float]] = {}
    for div, vals in div_elevs.items():
        if vals and div != "MEX":
            med_elev = float(np.median(np.asarray(vals, dtype=float)))
            div_fallback[div] = (med_elev, round(isa_pressure_hpa(med_elev), 2))
        else:
            div_fallback[div] = (50.0, round(isa_pressure_hpa(50.0), 2))

    res = (team_map, div_fallback)
    if path == WS_STADIUM_PHYSICS_PATH:
        _STADIUM_INDEX_CACHE = res
    return res


def lookup_stadium_physics(div: str, team: str) -> tuple[float, float]:
    """Devuelve `(stadium_elevation_m, structural_pressure_hpa)` para `(div, team)`."""
    team_map, div_fallback = load_stadium_physics_index()
    key = (str(div), str(team))
    if key in team_map:
        return team_map[key]
    if str(div) in div_fallback:
        return div_fallback[str(div)]
    return (50.0, round(isa_pressure_hpa(50.0), 2))


def compute_altitude_physics_scalar(div: str, home_team: str, away_team: str) -> dict[str, float]:
    """Calcula las 3 variables físicas de altitud para un fixture individual."""
    h_elev, h_pres = lookup_stadium_physics(div, home_team)
    a_elev, a_pres = lookup_stadium_physics(div, away_team)
    alt_diff = float(h_elev - a_elev)
    shock = 1.0 if (h_elev >= 2100.0 and alt_diff >= 1000.0) else 0.0
    pres_diff = float(h_pres - a_pres)
    return {
        "altitude_diff_m": alt_diff,
        "altitude_shock_flag": shock,
        "surface_pressure_diff": pres_diff,
    }


def compute_altitude_physics_features(df_out: pd.DataFrame) -> pd.DataFrame:
    """Añade `altitude_diff_m`, `altitude_shock_flag` y `surface_pressure_diff` a `df_out`."""
    out = df_out.copy()
    n = len(out)
    h_elev = np.empty(n, dtype=float)
    h_pres = np.empty(n, dtype=float)
    a_elev = np.empty(n, dtype=float)
    a_pres = np.empty(n, dtype=float)

    divs = out["div"].astype(str).tolist()
    homes = out["home_team"].astype(str).tolist()
    aways = out["away_team"].astype(str).tolist()

    for i in range(n):
        he, hp = lookup_stadium_physics(divs[i], homes[i])
        ae, ap = lookup_stadium_physics(divs[i], aways[i])
        h_elev[i] = he
        h_pres[i] = hp
        a_elev[i] = ae
        a_pres[i] = ap

    alt_diff = h_elev - a_elev
    out["altitude_diff_m"] = alt_diff
    out["altitude_shock_flag"] = ((h_elev >= 2100.0) & (alt_diff >= 1000.0)).astype(float)
    out["surface_pressure_diff"] = h_pres - a_pres
    return out


def compute_match_xgot_and_tactical_proxies(
    df: pd.DataFrame,
    xgf_h: np.ndarray,
    xgf_a: np.ndarray,
) -> dict[str, np.ndarray]:
    """Calcula métricas post-partido tácticas para cada encuentro de `df`."""
    n = len(df)
    hg = df["home_goals"].to_numpy(dtype=float) if "home_goals" in df.columns else np.full(n, np.nan)
    ag = df["away_goals"].to_numpy(dtype=float) if "away_goals" in df.columns else np.full(n, np.nan)

    sh_h = df["shots_home"].to_numpy(dtype=float) if "shots_home" in df.columns else np.full(n, np.nan)
    sh_a = df["shots_away"].to_numpy(dtype=float) if "shots_away" in df.columns else np.full(n, np.nan)
    sot_h = df["sot_home"].to_numpy(dtype=float) if "sot_home" in df.columns else np.full(n, np.nan)
    sot_a = df["sot_away"].to_numpy(dtype=float) if "sot_away" in df.columns else np.full(n, np.nan)

    cor_h = df["corners_home"].to_numpy(dtype=float) if "corners_home" in df.columns else np.full(n, np.nan)
    cor_a = df["corners_away"].to_numpy(dtype=float) if "corners_away" in df.columns else np.full(n, np.nan)

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

        g_on_target = np.minimum(safe_goals, safe_sot)
        saved_on_target = np.maximum(0.0, safe_sot - g_on_target)

        shot_quality = np.clip(
            xg_pre / np.maximum(1.0, safe_shots),
            0.05,
            0.40,
        )
        w_save = 0.18 + 0.10 * shot_quality
        w_goal = 0.68 + 0.15 * shot_quality

        xgot_detailed = w_goal * g_on_target + w_save * saved_on_target
        uncounted_goals = np.maximum(0.0, safe_goals - safe_sot)
        xgot_detailed = xgot_detailed + 0.70 * uncounted_goals

        fallback_goals = np.where(np.isfinite(goals), safe_goals, xg_pre)
        xgot_fallback = 0.65 * xg_pre + 0.35 * fallback_goals

        return np.maximum(
            0.0,
            np.where(has_sot, xgot_detailed, xgot_fallback),
        )

    xgot_h = _calc_team_xgot(sot_h, sh_h, hg, xgf_h)
    xgot_a = _calc_team_xgot(sot_a, sh_a, ag, xgf_a)

    safe_ag = np.where(np.isfinite(ag), ag, xgf_a)
    safe_hg = np.where(np.isfinite(hg), hg, xgf_h)
    gk_prev_h = xgot_a - safe_ag
    gk_prev_a = xgot_h - safe_hg

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
    """Calcula quiebres de régimen estructural y diferenciales pre-partido."""
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
