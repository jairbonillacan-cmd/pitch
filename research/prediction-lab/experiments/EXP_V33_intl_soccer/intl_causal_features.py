"""Ingeniería de features causales (t' < t) y puente Club -> Selección para selecciones nacionales (EXP_V33_intl_soccer).

Garantías matemáticas y de gobernanza:
  1. Cero fuga temporal (`t' < t`): el vector de 38 features base de cada partido `m` se emite
     ANTES de actualizar cualquier acumulador (Elo, Pi-Rating, Ataque/Defensa, residuales EWM,
     ventanas r8/r10 o última sede).
  2. Cero sesgo entrenamiento-inferencia (`0` train-serve skew): la misma función pura
     `emit_prematch_feature_vector(...)` se usa tanto en el bucle histórico como en la síntesis viva
     desde `intl_soccer_causal_state.json`, y se replica 1:1 en `src/domain/prediction/intl_soccer.ts`.
  3. Puente Club -> Selección en dos capas:
     - Capa estructural histórica: último snapshot `clubelo_ratings.parquet` estrictamente `< match_date`.
     - Capa táctica `T-60m` (`compute_squad_club_adjustment`): ajuste acotado por convocatoria/XI confirmado
       sujeto al contrato `ts_published_utc <= ts_decision_utc - 2.0 min < kickoff_utc`.
"""

from __future__ import annotations

from bisect import bisect_left
from collections import deque
from datetime import datetime
import math
from pathlib import Path
from typing import Any, Mapping, Sequence

import numpy as np
import pandas as pd

from intl_geography import (
    CONFED_DEFAULT_CLUB_ELO,
    get_federation_profile,
    haversine_km,
    resolve_match_venue_physics,
    resolve_team_code,
)
from intl_ingest import (
    ARTIFACTS_DIR,
    HOLDOUT_CUT_TS,
    INTL_DIV_LEVELS,
    REPO_ROOT,
    assert_dates_strictly_before_holdout,
)

CLUBELO_PARQUET_PATH = REPO_ROOT / "research" / "prediction-lab" / "data" / "processed" / "clubelo_ratings.parquet"

# Constantes del sistema de ratings internacional (calibradas para dominio FIFA, congeladas antes de evaluar OOS)
ELO_HFA_POINTS: float = 58.0
ELO_K_BY_REGIME: dict[str, float] = {
    "INTL_WC": 58.0,
    "INTL_CONT": 48.0,
    "INTL_QUAL": 40.0,
    "INTL_NAT": 34.0,
    "INTL_REG": 26.0,
    "INTL_FRIENDLY": 18.0,
}

# Parámetros Pi-Ratings (Constantinou & Fenton, 2013) adaptados a frecuencia internacional
PI_LAMBDA: float = 0.042
PI_GAMMA: float = 0.68
PI_C: float = 3.0

# Parámetros online de tasas de gol y matriz Dixon-Coles por régimen internacional
REGIME_BASE_GOAL_MU: dict[str, float] = {
    "INTL_WC": 1.28,
    "INTL_CONT": 1.24,
    "INTL_QUAL": 1.38,
    "INTL_NAT": 1.32,
    "INTL_REG": 1.34,
    "INTL_FRIENDLY": 1.31,
}
REGIME_DC_RHO: dict[str, float] = {
    "INTL_WC": -0.11,
    "INTL_CONT": -0.12,
    "INTL_QUAL": -0.09,
    "INTL_NAT": -0.10,
    "INTL_REG": -0.10,
    "INTL_FRIENDLY": -0.07,
}

ATT_DEF_LR_OFFICIAL: float = 0.026
ATT_DEF_LR_FRIENDLY: float = 0.015
ATT_DEF_DECAY: float = 0.005

EWM_HALF_LIFE_DAYS: float = 270.0
EWM_ALPHA_NEW_OBS: float = 0.24

MAX_GOALS_DC_GRID: int = 10
_LOG_FACT_10 = np.array([math.lgamma(k + 1) for k in range(MAX_GOALS_DC_GRID + 1)], dtype=np.float64)
_K_GRID_10 = np.arange(MAX_GOALS_DC_GRID + 1, dtype=np.float64)

# Configuración auditable del ajuste prospectivo Club -> Selección (`T-60m`)
SQUAD_CLUB_BRIDGE_CONFIG: dict[str, float] = {
    "min_delay_minutes": 2.0,
    "starter_weight": 1.5,
    "bench_weight": 0.5,
    "minutes_cap_30d": 360.0,
    "chemistry_max_elo_bonus": 28.0,
    "elo_to_log_lambda_scale": 0.34,
    "max_abs_log_lambda_shift": 0.22,
}

# Las 38 features base en orden canónico inmutable
INTL_BASE_38_FEATURES: tuple[str, ...] = (
    "elo_diff_eff",
    "elo_diff_raw",
    "elo_prob_h_nodraw",
    "elo_closeness",
    "abs_elo_mismatch",
    "pi_home",
    "pi_away",
    "pi_diff",
    "pi_exp_gd",
    "att_strength_home",
    "def_strength_home",
    "att_strength_away",
    "def_strength_away",
    "dc_lam_home",
    "dc_lam_away",
    "dc_exp_total",
    "dc_exp_diff",
    "dc_prob_h",
    "dc_prob_d",
    "dc_logit_h",
    "dc_logit_d",
    "ewm_pts_res_diff_270d",
    "ewm_gd_res_diff_270d",
    "h_pts_r8",
    "a_pts_r8",
    "sos_elo_diff_r8",
    "comp_share_diff_r8",
    "draw_rate_sum_r10",
    "goal_env_sum_r10",
    "rest_diff_clamped",
    "window_match2_diff",
    "log_travel_km_diff",
    "inter_confed_flag",
    "effective_hfa",
    "is_neutral_pure",
    "altitude_diff_m",
    "surface_pressure_diff",
    "fed_club_elo_diff",
)


def _clamp(val: float, lo: float, hi: float) -> float:
    return lo if val < lo else (hi if val > hi else val)


def _logit_safe(p: float, eps: float = 1e-4) -> float:
    pc = _clamp(float(p), eps, 1.0 - eps)
    return math.log(pc / (1.0 - pc))


def pi_expected_gd(rating: float) -> float:
    r = float(rating)
    if r == 0.0:
        return 0.0
    mag = (10.0 ** (abs(r) / PI_C)) - 1.0
    return mag if r > 0.0 else -mag


def dixon_coles_1x2_exact(lam_h: float, lam_a: float, rho: float) -> tuple[float, float, float]:
    """Calcula `(p_home, p_draw, p_away)` con la misma formulación bivariada de `markets_2way.ts`."""
    lh = _clamp(float(lam_h), 0.05, 10.0)
    la = _clamp(float(lam_a), 0.05, 10.0)
    r = _clamp(float(rho), -0.99, 0.99)

    pmf_h = np.exp(_K_GRID_10 * math.log(lh) - lh - _LOG_FACT_10)
    pmf_a = np.exp(_K_GRID_10 * math.log(la) - la - _LOG_FACT_10)
    mat = np.outer(pmf_h, pmf_a)

    mat[0, 0] *= max(0.0, 1.0 - lh * la * r)
    mat[1, 0] *= max(0.0, 1.0 + la * r)
    mat[0, 1] *= max(0.0, 1.0 + lh * r)
    mat[1, 1] *= max(0.0, 1.0 - r)

    s = float(mat.sum())
    if s <= 0.0 or not math.isfinite(s):
        return 0.44, 0.26, 0.30
    mat /= s
    p_d = float(np.trace(mat))
    p_h = float(np.tril(mat, k=-1).sum())
    p_a = float(np.triu(mat, k=1).sum())
    tot = p_h + p_d + p_a
    return p_h / tot, p_d / tot, p_a / tot


def compute_online_intl_lambdas(
    *,
    regime: str,
    elo_diff_eff: float,
    eff_hfa: float,
    net_altitude_adv_m: float,
    att_h: float,
    def_h: float,
    att_a: float,
    def_a: float,
) -> tuple[float, float, float]:
    """Calcula `(lam_home, lam_away, rho)` pre-partido combinando ataque/defensa online,
    diferencial Elo internacional, ventaja de sede y aclimatación barométrica."""
    mu_base = REGIME_BASE_GOAL_MU.get(regime, 1.31)
    rho = REGIME_DC_RHO.get(regime, -0.09)

    elo_scaled = float(elo_diff_eff) / 400.0
    pos_mismatch = max(0.0, elo_scaled) ** 1.30
    neg_mismatch = max(0.0, -elo_scaled) ** 1.30
    alt_term = 0.045 * (float(net_altitude_adv_m) / 1000.0)

    log_lh = (
        math.log(mu_base)
        + 0.50 * (float(att_h) + float(def_a))
        + 0.44 * elo_scaled
        + 0.075 * float(eff_hfa)
        + alt_term
        + 0.055 * pos_mismatch
    )
    log_la = (
        math.log(mu_base)
        + 0.50 * (float(att_a) + float(def_h))
        - 0.44 * elo_scaled
        - 0.075 * float(eff_hfa)
        - alt_term
        + 0.055 * neg_mismatch
    )
    lam_h = _clamp(math.exp(_clamp(log_lh, -2.6, 2.1)), 0.08, 7.50)
    lam_a = _clamp(math.exp(_clamp(log_la, -2.6, 2.1)), 0.08, 7.50)
    return lam_h, lam_a, rho


class CausalClubEloBridge:
    """Índice temporal `t' < t` sobre `clubelo_ratings.parquet` para extraer la fuerza media
    de los clubes de primera división asociados a cada federación sin ninguna fuga futura."""

    def __init__(self, parquet_path: Path = CLUBELO_PARQUET_PATH) -> None:
        self._dates_ord: list[int] = []
        self._snapshots: list[dict[str, float]] = []
        if parquet_path.exists():
            df = pd.read_parquet(parquet_path)
            if not df.empty and {"snapshot_date", "country", "level", "elo"}.issubset(df.columns):
                lvl1 = df[df["level"] == 1].copy()
                lvl1["fed_code"] = lvl1["country"].astype(str).map(resolve_team_code)
                lvl1["snap_dt"] = pd.to_datetime(lvl1["snapshot_date"].astype(str).str.slice(0, 10), errors="coerce")
                lvl1 = lvl1[lvl1["snap_dt"].notna()].copy()
                for snap_dt, grp in lvl1.groupby("snap_dt", sort=True):
                    by_fed: dict[str, float] = {}
                    for fed_code, fgrp in grp.groupby("fed_code"):
                        elos = np.sort(fgrp["elo"].to_numpy(dtype=np.float64))[::-1]
                        top_k = elos[:8]
                        if len(top_k) > 0:
                            by_fed[str(fed_code)] = float(np.mean(top_k))
                    self._dates_ord.append(int(snap_dt.toordinal()))
                    self._snapshots.append(by_fed)

    def lookup_federation_club_elo(self, fed_code: str, match_date_ord: int, confed: str) -> float:
        default_val = CONFED_DEFAULT_CLUB_ELO.get(confed, 1400.0)
        if not self._dates_ord:
            return default_val
        # `bisect_left` garantiza estrictamente `snapshot_date < match_date`
        idx = bisect_left(self._dates_ord, int(match_date_ord)) - 1
        if idx < 0:
            return default_val
        raw_val = self._snapshots[idx].get(fed_code)
        if raw_val is None or not math.isfinite(raw_val):
            return default_val
        return 0.80 * float(raw_val) + 0.20 * default_val


def _default_team_state(code: str) -> dict[str, Any]:
    prof = get_federation_profile(code)
    return {
        "code": code,
        "confed": prof["confed"],
        "elo": float(prof["confed_base_elo"]),
        "pi_home": 0.0,
        "pi_away": 0.0,
        "att": 0.0,
        "dfn": 0.0,
        "ewm_pts_res": 0.0,
        "ewm_gd_res": 0.0,
        "last_date_ord": None,
        "last_date_iso": None,
        "last_lat": float(prof["lat"]),
        "last_lon": float(prof["lon"]),
        "base_lat": float(prof["lat"]),
        "base_lon": float(prof["lon"]),
        "base_elev_m": float(prof["base_elev_m"]),
        "fed_club_elo": float(prof["default_club_elo"]),
        "matches_played": 0,
        "pts_hist": deque(maxlen=8),
        "opp_elo_hist": deque(maxlen=8),
        "comp_hist": deque(maxlen=8),
        "draw_hist": deque(maxlen=10),
        "tot_goals_hist": deque(maxlen=10),
    }


def serialize_team_state_for_json(st: Mapping[str, Any]) -> dict[str, Any]:
    pts_list = list(st["pts_hist"])
    opp_list = list(st["opp_elo_hist"])
    comp_list = list(st["comp_hist"])
    draw_list = list(st["draw_hist"])
    tg_list = list(st["tot_goals_hist"])
    return {
        "code": str(st["code"]),
        "confed": str(st["confed"]),
        "elo": round(float(st["elo"]), 6),
        "pi_home": round(float(st["pi_home"]), 6),
        "pi_away": round(float(st["pi_away"]), 6),
        "att": round(float(st["att"]), 6),
        "dfn": round(float(st["dfn"]), 6),
        "ewm_pts_res": round(float(st["ewm_pts_res"]), 6),
        "ewm_gd_res": round(float(st["ewm_gd_res"]), 6),
        "last_date_iso": st["last_date_iso"],
        "last_lat": round(float(st["last_lat"]), 5),
        "last_lon": round(float(st["last_lon"]), 5),
        "base_lat": round(float(st["base_lat"]), 5),
        "base_lon": round(float(st["base_lon"]), 5),
        "base_elev_m": round(float(st["base_elev_m"]), 2),
        "fed_club_elo": round(float(st["fed_club_elo"]), 4),
        "matches_played": int(st["matches_played"]),
        "pts_r8_mean": round(float(np.mean(pts_list)) if pts_list else 1.35, 6),
        "opp_elo_r8_mean": round(float(np.mean(opp_list)) if opp_list else float(st["elo"]), 6),
        "comp_r8_mean": round(float(np.mean(comp_list)) if comp_list else 0.65, 6),
        "draw_r10_mean": round(float(np.mean(draw_list)) if draw_list else 0.24, 6),
        "tot_goals_r10_mean": round(float(np.mean(tg_list)) if tg_list else 2.55, 6),
    }


def _date_iso_to_ordinal(date_iso: str) -> int:
    s = str(date_iso).strip()[:10]
    y, m, d = (int(x) for x in s.split("-"))
    return datetime(y, m, d).toordinal()


def emit_prematch_feature_vector(
    *,
    st_h: Mapping[str, Any],
    st_a: Mapping[str, Any],
    regime: str,
    match_date_iso: str,
    venue_physics: Mapping[str, float],
    fed_club_elo_h: float,
    fed_club_elo_a: float,
) -> tuple[list[float], dict[str, float]]:
    """Emite las 38 features base en doble precisión IEEE-754 desde estados pre-partido congelados.
    Acepta tanto estados en memoria del bucle histórico como diccionarios deserializados de `intl_soccer_causal_state.json`."""
    cur_ord = _date_iso_to_ordinal(match_date_iso)

    eff_hfa = float(venue_physics["effective_hfa"])
    is_neutral_pure = float(venue_physics["is_neutral_pure"])
    alt_diff_m = float(venue_physics["altitude_diff_m"])
    surf_p_diff = float(venue_physics["surface_pressure_diff"])
    v_lat = float(venue_physics["venue_lat"])
    v_lon = float(venue_physics["venue_lon"])

    elo_h = float(st_h["elo"])
    elo_a = float(st_a["elo"])
    elo_diff_raw = elo_h - elo_a
    elo_diff_eff = elo_diff_raw + ELO_HFA_POINTS * eff_hfa
    elo_prob_h_nodraw = 1.0 / (1.0 + (10.0 ** (-elo_diff_eff / 400.0)))
    elo_closeness = math.exp(-abs(elo_diff_eff) / 220.0)
    abs_elo_mismatch = abs(elo_diff_eff) / 400.0

    w_home_ctx = 0.5 * (1.0 + eff_hfa)
    pi_h = w_home_ctx * float(st_h["pi_home"]) + (1.0 - w_home_ctx) * float(st_h["pi_away"])
    pi_a = (1.0 - w_home_ctx) * float(st_a["pi_home"]) + w_home_ctx * float(st_a["pi_away"])
    pi_diff = pi_h - pi_a
    pi_exp_gd_diff = pi_expected_gd(pi_h) - pi_expected_gd(pi_a)

    att_h = float(st_h["att"])
    def_h = float(st_h["dfn"])
    att_a = float(st_a["att"])
    def_a = float(st_a["dfn"])

    dc_lam_h, dc_lam_a, dc_rho = compute_online_intl_lambdas(
        regime=regime,
        elo_diff_eff=elo_diff_eff,
        eff_hfa=eff_hfa,
        net_altitude_adv_m=alt_diff_m,
        att_h=att_h,
        def_h=def_h,
        att_a=att_a,
        def_a=def_a,
    )
    dc_exp_total = dc_lam_h + dc_lam_a
    dc_exp_diff = dc_lam_h - dc_lam_a
    dc_p_h, dc_p_d, dc_p_a = dixon_coles_1x2_exact(dc_lam_h, dc_lam_a, dc_rho)
    dc_logit_h = _logit_safe(dc_p_h)
    dc_logit_d = _logit_safe(dc_p_d)

    # Descanso, fatiga de 2º partido en ventana FIFA, viaje y decaimiento exponencial de residuales
    def _resolve_rest_and_decay(st: Mapping[str, Any]) -> tuple[float, float, float, float]:
        last_iso = st.get("last_date_iso")
        if last_iso:
            raw_days = max(1.0, float(cur_ord - _date_iso_to_ordinal(str(last_iso))))
            decay = 0.5 ** (raw_days / EWM_HALF_LIFE_DAYS)
            win2 = 1.0 if (2.0 <= raw_days <= 6.0) else 0.0
            origin_lat = float(st["last_lat"]) if raw_days <= 10.0 else float(st["base_lat"])
            origin_lon = float(st["last_lon"]) if raw_days <= 10.0 else float(st["base_lon"])
            travel_km = haversine_km(origin_lat, origin_lon, v_lat, v_lon)
            return _clamp(raw_days, 2.0, 30.0), decay, win2, travel_km
        travel_km = haversine_km(float(st["base_lat"]), float(st["base_lon"]), v_lat, v_lon)
        return 30.0, 0.0, 0.0, travel_km

    rest_h, decay_h, win2_h, travel_h = _resolve_rest_and_decay(st_h)
    rest_a, decay_a, win2_a, travel_a = _resolve_rest_and_decay(st_a)

    ewm_pts_res_diff = float(st_h["ewm_pts_res"]) * decay_h - float(st_a["ewm_pts_res"]) * decay_a
    ewm_gd_res_diff = float(st_h["ewm_gd_res"]) * decay_h - float(st_a["ewm_gd_res"]) * decay_a

    # Extracción simétrica de medias r8 / r10 (tanto desde deques en bucle como desde JSON serializado)
    if "pts_hist" in st_h:
        h_pts_r8 = float(np.mean(st_h["pts_hist"])) if len(st_h["pts_hist"]) > 0 else 1.35
        a_pts_r8 = float(np.mean(st_a["pts_hist"])) if len(st_a["pts_hist"]) > 0 else 1.35
        sos_h = float(np.mean(st_h["opp_elo_hist"])) if len(st_h["opp_elo_hist"]) > 0 else elo_h
        sos_a = float(np.mean(st_a["opp_elo_hist"])) if len(st_a["opp_elo_hist"]) > 0 else elo_a
        comp_h = float(np.mean(st_h["comp_hist"])) if len(st_h["comp_hist"]) > 0 else 0.65
        comp_a = float(np.mean(st_a["comp_hist"])) if len(st_a["comp_hist"]) > 0 else 0.65
        dr_h = float(np.mean(st_h["draw_hist"])) if len(st_h["draw_hist"]) > 0 else 0.24
        dr_a = float(np.mean(st_a["draw_hist"])) if len(st_a["draw_hist"]) > 0 else 0.24
        tg_h = float(np.mean(st_h["tot_goals_hist"])) if len(st_h["tot_goals_hist"]) > 0 else 2.55
        tg_a = float(np.mean(st_a["tot_goals_hist"])) if len(st_a["tot_goals_hist"]) > 0 else 2.55
    else:
        h_pts_r8 = float(st_h.get("pts_r8_mean", 1.35))
        a_pts_r8 = float(st_a.get("pts_r8_mean", 1.35))
        sos_h = float(st_h.get("opp_elo_r8_mean", elo_h))
        sos_a = float(st_a.get("opp_elo_r8_mean", elo_a))
        comp_h = float(st_h.get("comp_r8_mean", 0.65))
        comp_a = float(st_a.get("comp_r8_mean", 0.65))
        dr_h = float(st_h.get("draw_r10_mean", 0.24))
        dr_a = float(st_a.get("draw_r10_mean", 0.24))
        tg_h = float(st_h.get("tot_goals_r10_mean", 2.55))
        tg_a = float(st_a.get("tot_goals_r10_mean", 2.55))

    sos_elo_diff_r8 = (sos_h - sos_a) / 100.0
    comp_share_diff_r8 = comp_h - comp_a
    draw_rate_sum_r10 = dr_h + dr_a
    goal_env_sum_r10 = tg_h + tg_a

    rest_diff_clamped = rest_h - rest_a
    window_match2_diff = win2_h - win2_a
    log_travel_km_diff = math.log1p(max(0.0, travel_a)) - math.log1p(max(0.0, travel_h))
    inter_confed_flag = 1.0 if str(st_h["confed"]) != str(st_a["confed"]) else 0.0
    fed_club_elo_diff = (float(fed_club_elo_h) - float(fed_club_elo_a)) / 100.0

    vec = [
        elo_diff_eff,
        elo_diff_raw,
        elo_prob_h_nodraw,
        elo_closeness,
        abs_elo_mismatch,
        pi_h,
        pi_a,
        pi_diff,
        pi_exp_gd_diff,
        att_h,
        def_h,
        att_a,
        def_a,
        dc_lam_h,
        dc_lam_a,
        dc_exp_total,
        dc_exp_diff,
        dc_p_h,
        dc_p_d,
        dc_logit_h,
        dc_logit_d,
        ewm_pts_res_diff,
        ewm_gd_res_diff,
        h_pts_r8,
        a_pts_r8,
        sos_elo_diff_r8,
        comp_share_diff_r8,
        draw_rate_sum_r10,
        goal_env_sum_r10,
        rest_diff_clamped,
        window_match2_diff,
        log_travel_km_diff,
        inter_confed_flag,
        eff_hfa,
        is_neutral_pure,
        alt_diff_m,
        surf_p_diff,
        fed_club_elo_diff,
    ]
    aux = {
        "dc_lam_home": dc_lam_h,
        "dc_lam_away": dc_lam_a,
        "dc_rho": dc_rho,
        "dc_prob_h": dc_p_h,
        "dc_prob_d": dc_p_d,
        "dc_prob_a": dc_p_a,
        "elo_home_pre": elo_h,
        "elo_away_pre": elo_a,
    }
    return vec, aux


def _update_states_postmatch(
    *,
    st_h: dict[str, Any],
    st_a: dict[str, Any],
    regime: str,
    match_date_iso: str,
    home_goals: int,
    away_goals: int,
    went_to_shootout: bool,
    venue_physics: Mapping[str, float],
    pre_aux: Mapping[str, float],
    fed_club_elo_h: float,
    fed_club_elo_a: float,
) -> None:
    """Actualiza acumuladores dinámicos estrictamente DESPUÉS del partido."""
    cur_ord = _date_iso_to_ordinal(match_date_iso)
    hg = int(home_goals)
    ag = int(away_goals)
    is_draw = bool(went_to_shootout) or (hg == ag)

    s_home = 0.5 if is_draw else (1.0 if hg > ag else 0.0)
    pts_h = 1.0 if is_draw else (3.0 if hg > ag else 0.0)
    pts_a = 1.0 if is_draw else (3.0 if ag > hg else 0.0)

    eff_hfa = float(venue_physics["effective_hfa"])
    elo_h = float(st_h["elo"])
    elo_a = float(st_a["elo"])
    elo_diff_eff = (elo_h - elo_a) + ELO_HFA_POINTS * eff_hfa
    exp_s_home = 1.0 / (1.0 + (10.0 ** (-elo_diff_eff / 400.0)))

    gd_raw = 0 if is_draw else (hg - ag)
    mov_mult = 1.0 + 0.5 * math.log(1.0 + abs(gd_raw))
    k_reg = ELO_K_BY_REGIME.get(regime, 24.0)
    delta_elo = k_reg * mov_mult * (s_home - exp_s_home)

    st_h["elo"] = elo_h + delta_elo
    st_a["elo"] = elo_a - delta_elo

    # Pi-Ratings con interpolación continua por localía efectiva
    w_home_ctx = 0.5 * (1.0 + eff_hfa)
    pi_h_eff = w_home_ctx * float(st_h["pi_home"]) + (1.0 - w_home_ctx) * float(st_h["pi_away"])
    pi_a_eff = (1.0 - w_home_ctx) * float(st_a["pi_home"]) + w_home_ctx * float(st_a["pi_away"])
    exp_gd_pi = pi_expected_gd(pi_h_eff) - pi_expected_gd(pi_a_eff)
    obs_gd_capped = _clamp(float(gd_raw), -6.0, 6.0)
    err_gd = obs_gd_capped - exp_gd_pi
    psi = PI_C * math.log10(1.0 + abs(err_gd)) * (1.0 if err_gd >= 0.0 else -1.0)
    pi_step = PI_LAMBDA * (1.0 if regime != "INTL_FRIENDLY" else 0.60) * psi

    st_h["pi_home"] = float(st_h["pi_home"]) + pi_step * (w_home_ctx + PI_GAMMA * (1.0 - w_home_ctx))
    st_h["pi_away"] = float(st_h["pi_away"]) + pi_step * ((1.0 - w_home_ctx) + PI_GAMMA * w_home_ctx)
    st_a["pi_home"] = float(st_a["pi_home"]) - pi_step * ((1.0 - w_home_ctx) + PI_GAMMA * w_home_ctx)
    st_a["pi_away"] = float(st_a["pi_away"]) - pi_step * (w_home_ctx + PI_GAMMA * (1.0 - w_home_ctx))

    # Ataque / Defensa Poisson online (descontando prórroga si terminó en penales en fase final)
    et_scale = 0.75 if (went_to_shootout and regime in ("INTL_WC", "INTL_CONT") and (hg + ag) >= 2) else 1.0
    g_h_90 = min(7.0, float(hg) * et_scale)
    g_a_90 = min(7.0, float(ag) * et_scale)
    lam_h_pre = float(pre_aux["dc_lam_home"])
    lam_a_pre = float(pre_aux["dc_lam_away"])

    lr_ad = ATT_DEF_LR_FRIENDLY if regime == "INTL_FRIENDLY" else ATT_DEF_LR_OFFICIAL
    err_h = _clamp(g_h_90 - lam_h_pre, -3.0, 3.0)
    err_a = _clamp(g_a_90 - lam_a_pre, -3.0, 3.0)

    st_h["att"] = (1.0 - ATT_DEF_DECAY) * float(st_h["att"]) + lr_ad * err_h
    st_a["dfn"] = (1.0 - ATT_DEF_DECAY) * float(st_a["dfn"]) + lr_ad * err_h
    st_a["att"] = (1.0 - ATT_DEF_DECAY) * float(st_a["att"]) + lr_ad * err_a
    st_h["dfn"] = (1.0 - ATT_DEF_DECAY) * float(st_h["dfn"]) + lr_ad * err_a

    # Residuales EWM decaídos por días reales entre partidos
    exp_pts_h = 3.0 * float(pre_aux["dc_prob_h"]) + 1.0 * float(pre_aux["dc_prob_d"])
    exp_pts_a = 3.0 * float(pre_aux["dc_prob_a"]) + 1.0 * float(pre_aux["dc_prob_d"])
    exp_gd_h = lam_h_pre - lam_a_pre

    for st, pts_obs, exp_pts, gd_obs, exp_gd, opp_elo in (
        (st_h, pts_h, exp_pts_h, g_h_90 - g_a_90, exp_gd_h, elo_a),
        (st_a, pts_a, exp_pts_a, g_a_90 - g_h_90, -exp_gd_h, elo_h),
    ):
        if st["last_date_ord"] is not None:
            dt_days = max(1.0, float(cur_ord - int(st["last_date_ord"])))
            decay = 0.5 ** (dt_days / EWM_HALF_LIFE_DAYS)
        else:
            decay = 0.0
        st["ewm_pts_res"] = (1.0 - EWM_ALPHA_NEW_OBS) * (float(st["ewm_pts_res"]) * decay) + EWM_ALPHA_NEW_OBS * (
            pts_obs - exp_pts
        )
        st["ewm_gd_res"] = (1.0 - EWM_ALPHA_NEW_OBS) * (float(st["ewm_gd_res"]) * decay) + EWM_ALPHA_NEW_OBS * _clamp(
            gd_obs - exp_gd, -4.0, 4.0
        )
        st["last_date_ord"] = cur_ord
        st["last_date_iso"] = match_date_iso
        st["last_lat"] = float(venue_physics["venue_lat"])
        st["last_lon"] = float(venue_physics["venue_lon"])
        st["matches_played"] = int(st["matches_played"]) + 1
        st["pts_hist"].append(pts_obs)
        st["opp_elo_hist"].append(opp_elo)
        st["comp_hist"].append(0.0 if regime == "INTL_FRIENDLY" else 1.0)
        st["draw_hist"].append(1.0 if is_draw else 0.0)
        st["tot_goals_hist"].append(g_h_90 + g_a_90)

    st_h["fed_club_elo"] = float(fed_club_elo_h)
    st_a["fed_club_elo"] = float(fed_club_elo_a)


def build_intl_causal_dataset(
    matches_df: pd.DataFrame,
    *,
    enforce_before_holdout: bool = True,
) -> tuple[pd.DataFrame, dict[str, dict[str, Any]]]:
    """Ejecuta el pase causal secuencial `t' < t` sobre `matches_df` y devuelve:
    1. DataFrame con metadatos del partido, las 38 features base y columnas auxiliares online (`dc_prob_*`, `elo_*`).
    2. Diccionario serializable de estado causal final por selección nacional."""
    if enforce_before_holdout:
        assert_dates_strictly_before_holdout(matches_df, col="match_date", context="build_intl_causal_dataset")

    ordered = matches_df.sort_values(["match_date", "match_id"], kind="mergesort").reset_index(drop=True)
    club_bridge = CausalClubEloBridge()

    states: dict[str, dict[str, Any]] = {}
    n = len(ordered)
    feat_matrix = np.empty((n, len(INTL_BASE_38_FEATURES)), dtype=np.float64)
    elo_h_arr = np.empty(n, dtype=np.float64)
    elo_a_arr = np.empty(n, dtype=np.float64)
    dc_ph_arr = np.empty(n, dtype=np.float64)
    dc_pd_arr = np.empty(n, dtype=np.float64)
    dc_pa_arr = np.empty(n, dtype=np.float64)
    dc_rho_arr = np.empty(n, dtype=np.float64)

    for idx, row in enumerate(ordered.itertuples(index=False)):
        h_code = str(row.home_code)
        a_code = str(row.away_code)
        if h_code not in states:
            states[h_code] = _default_team_state(h_code)
        if a_code not in states:
            states[a_code] = _default_team_state(a_code)

        st_h = states[h_code]
        st_a = states[a_code]
        d_iso = str(row.date_str)[:10]
        d_ord = _date_iso_to_ordinal(d_iso)

        fed_ce_h = club_bridge.lookup_federation_club_elo(h_code, d_ord, str(st_h["confed"]))
        fed_ce_a = club_bridge.lookup_federation_club_elo(a_code, d_ord, str(st_a["confed"]))
        st_h["fed_club_elo"] = fed_ce_h
        st_a["fed_club_elo"] = fed_ce_a

        v_phys = resolve_match_venue_physics(
            home_code=h_code,
            away_code=a_code,
            match_city=str(row.city),
            match_country=str(row.country),
            is_neutral_flag=bool(row.neutral),
        )

        vec, aux = emit_prematch_feature_vector(
            st_h=st_h,
            st_a=st_a,
            regime=str(row.div),
            match_date_iso=d_iso,
            venue_physics=v_phys,
            fed_club_elo_h=fed_ce_h,
            fed_club_elo_a=fed_ce_a,
        )
        feat_matrix[idx, :] = vec
        elo_h_arr[idx] = aux["elo_home_pre"]
        elo_a_arr[idx] = aux["elo_away_pre"]
        dc_ph_arr[idx] = aux["dc_prob_h"]
        dc_pd_arr[idx] = aux["dc_prob_d"]
        dc_pa_arr[idx] = aux["dc_prob_a"]
        dc_rho_arr[idx] = aux["dc_rho"]

        _update_states_postmatch(
            st_h=st_h,
            st_a=st_a,
            regime=str(row.div),
            match_date_iso=d_iso,
            home_goals=int(row.home_goals),
            away_goals=int(row.away_goals),
            went_to_shootout=bool(row.went_to_shootout),
            venue_physics=v_phys,
            pre_aux=aux,
            fed_club_elo_h=fed_ce_h,
            fed_club_elo_a=fed_ce_a,
        )

    feat_df = pd.DataFrame(feat_matrix, columns=list(INTL_BASE_38_FEATURES))
    out_df = pd.concat([ordered.reset_index(drop=True), feat_df], axis=1)
    out_df["elo_home_pre"] = elo_h_arr
    out_df["elo_away_pre"] = elo_a_arr
    out_df["online_dc_prob_h"] = dc_ph_arr
    out_df["online_dc_prob_d"] = dc_pd_arr
    out_df["online_dc_prob_a"] = dc_pa_arr
    out_df["online_dc_rho"] = dc_rho_arr

    serialized_states = {k: serialize_team_state_for_json(v) for k, v in sorted(states.items())}
    return out_df, serialized_states


def synthesize_live_intl_row(
    *,
    home_team: str,
    away_team: str,
    regime: str,
    match_date_iso: str,
    causal_states: Mapping[str, Mapping[str, Any]],
    city: str | None = None,
    country: str | None = None,
    is_neutral: bool | None = None,
    explicit_lat: float | None = None,
    explicit_lon: float | None = None,
    explicit_elev_m: float | None = None,
) -> dict[str, Any]:
    """Sintetiza en vivo (`< 0.1 ms`) el `SnapshotRow` completo (`features` + `div_onehot`) y tasas DC
    desde `intl_soccer_causal_state.json`, idéntico bit a bit a `src/domain/prediction/intl_soccer.ts`."""
    h_code = resolve_team_code(home_team)
    a_code = resolve_team_code(away_team)
    if h_code == a_code:
        raise ValueError(f"home_team y away_team resuelven a la misma selección ({h_code})")

    st_h = causal_states.get(h_code) or serialize_team_state_for_json(_default_team_state(h_code))
    st_a = causal_states.get(a_code) or serialize_team_state_for_json(_default_team_state(a_code))

    reg = regime if regime in INTL_DIV_LEVELS else "INTL_FRIENDLY"
    v_phys = resolve_match_venue_physics(
        home_code=h_code,
        away_code=a_code,
        match_city=city,
        match_country=country,
        is_neutral_flag=is_neutral,
        explicit_lat=explicit_lat,
        explicit_lon=explicit_lon,
        explicit_elev_m=explicit_elev_m,
    )

    vec, aux = emit_prematch_feature_vector(
        st_h=st_h,
        st_a=st_a,
        regime=reg,
        match_date_iso=str(match_date_iso)[:10],
        venue_physics=v_phys,
        fed_club_elo_h=float(st_h.get("fed_club_elo", 1400.0)),
        fed_club_elo_a=float(st_a.get("fed_club_elo", 1400.0)),
    )
    div_onehot = [1 if lvl == reg else 0 for lvl in INTL_DIV_LEVELS]
    return {
        "home_code": h_code,
        "away_code": a_code,
        "div": reg,
        "match_date": str(match_date_iso)[:10],
        "features": vec,
        "div_onehot": div_onehot,
        "dc_lam_home": aux["dc_lam_home"],
        "dc_lam_away": aux["dc_lam_away"],
        "dc_rho": aux["dc_rho"],
        "venue_physics": v_phys,
    }


def _parse_iso_epoch_seconds(ts_iso: str) -> float | None:
    s = str(ts_iso or "").strip()
    if not s:
        return None
    try:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        return float(dt.timestamp())
    except ValueError:
        return None


def compute_squad_club_adjustment(
    *,
    ts_published_utc: str | None,
    ts_decision_utc: str,
    kickoff_utc: str | None,
    home_players: Sequence[Mapping[str, Any]] | None,
    away_players: Sequence[Mapping[str, Any]] | None,
    home_baseline_club_elo: float,
    away_baseline_club_elo: float,
    config: Mapping[str, float] = SQUAD_CLUB_BRIDGE_CONFIG,
) -> dict[str, Any]:
    """Calcula el ajuste causal Club -> Selección cuando existe convocatoria o XI titular confirmado.

    Contrato anti-fuga (`CONTRACT_XI_PUBLISHED`):
      - Si falta `ts_published_utc`, o `ts_published_utc > ts_decision_utc - min_delay_minutes`,
        o `ts_decision_utc > kickoff_utc`, o alguna plantilla está vacía, devuelve `applied = False`
        y multiplicadores neutros `1.0` exactos (cero ruido sintético).
    """
    neutral = {
        "applied": False,
        "reason": "missing_or_non_causal_timestamp",
        "home_effective_club_elo": float(home_baseline_club_elo),
        "away_effective_club_elo": float(away_baseline_club_elo),
        "net_elo_delta": 0.0,
        "log_lambda_shift": 0.0,
        "lam_home_multiplier": 1.0,
        "lam_away_multiplier": 1.0,
    }
    ts_pub = _parse_iso_epoch_seconds(ts_published_utc or "")
    ts_dec = _parse_iso_epoch_seconds(ts_decision_utc)
    if ts_pub is None or ts_dec is None:
        return neutral

    min_delay_sec = float(config["min_delay_minutes"]) * 60.0
    if ts_pub > ts_dec - min_delay_sec + 1e-6:
        return {**neutral, "reason": "published_after_decision_cutoff"}

    if kickoff_utc:
        ts_ko = _parse_iso_epoch_seconds(kickoff_utc)
        if ts_ko is not None and (ts_dec > ts_ko + 1e-6 or ts_pub > ts_ko + 1e-6):
            return {**neutral, "reason": "post_kickoff_timestamp"}

    if not home_players or not away_players:
        return {**neutral, "reason": "empty_squad_list"}

    w_starter = float(config["starter_weight"])
    w_bench = float(config["bench_weight"])
    min_cap = float(config["minutes_cap_30d"])
    chem_max = float(config["chemistry_max_elo_bonus"])

    def _score_squad(players: Sequence[Mapping[str, Any]], base_elo: float) -> float:
        w_sum = 0.0
        elo_acc = 0.0
        clubs: list[str] = []
        for p in players:
            c_elo = float(p.get("clubElo", p.get("club_elo", base_elo)))
            mins = _clamp(float(p.get("recentClubMinutes30d", p.get("recent_club_minutes_30d", 180.0))), 0.0, min_cap)
            is_st = bool(p.get("isStarter", p.get("is_starter", True)))
            role_w = w_starter if is_st else w_bench
            min_factor = 0.35 + 0.65 * (mins / min_cap)
            w = role_w * min_factor
            w_sum += w
            elo_acc += w * c_elo
            cc = str(p.get("clubCode", p.get("club_code", "")) or "").strip().upper()
            if is_st and cc:
                clubs.append(cc)

        mean_elo = (elo_acc / w_sum) if w_sum > 1e-9 else float(base_elo)
        # Bono de química táctica por pares de titulares que comparten club
        n_c = len(clubs)
        chem_bonus = 0.0
        if n_c >= 2:
            same_pairs = 0
            total_pairs = n_c * (n_c - 1) // 2
            for i in range(n_c):
                for j in range(i + 1, n_c):
                    if clubs[i] == clubs[j]:
                        same_pairs += 1
            chem_bonus = chem_max * min(1.0, (same_pairs / max(1, total_pairs)) * 4.0)
        return mean_elo + chem_bonus

    eff_h = _score_squad(home_players, float(home_baseline_club_elo))
    eff_a = _score_squad(away_players, float(away_baseline_club_elo))
    net_elo_delta = (eff_h - float(home_baseline_club_elo)) - (eff_a - float(away_baseline_club_elo))

    scale = float(config["elo_to_log_lambda_scale"])
    max_shift = float(config["max_abs_log_lambda_shift"])
    # Compresión suave hiperbólica acotada en `[-max_shift, +max_shift]`
    raw_shift = (net_elo_delta / 400.0) * scale
    log_shift = max_shift * math.tanh(raw_shift / max_shift) if max_shift > 0 else 0.0

    return {
        "applied": True,
        "reason": "ok",
        "home_effective_club_elo": float(eff_h),
        "away_effective_club_elo": float(eff_a),
        "net_elo_delta": float(net_elo_delta),
        "log_lambda_shift": float(log_shift),
        "lam_home_multiplier": float(math.exp(0.5 * log_shift)),
        "lam_away_multiplier": float(math.exp(-0.5 * log_shift)),
    }
