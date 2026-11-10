#!/usr/bin/env python3
"""Features causales de 3ª generación (`PitchLab Tachyon v3.0`) para fixtures futuros y paridad exacta.

Objetivo: cerrar el camino `match_id / fixture -> features` con paridad numérica `< 1e-12` respecto a
`features/build_features.py`, e implementar el prior prospectivo determinista de disponibilidad de
plantilla `compute_lineup_availability_delta(home_team_ctx, away_team_ctx)` (estrictamente aislado del
backtest histórico `2000–2025`).

Uso:
    ./.venv/bin/python pipeline/fixture_features.py --validate 200
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
from typing import Any

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "features"))
sys.path.insert(0, os.path.join(ROOT, "models", "a"))

from build_features import (  # noqa: E402
    DAYS_REST_MAX,
    DAYS_REST_MIN,
    ELO_HFA,
    ELO_SEASON_REGRESSION,
    EWM_COLS,
    ROLL_COLS,
    add_advanced_ratings_chronological,
    build_long,
    elo_block,
    load_matches,
    xg_elo_block,
)
from ratings_advanced import DIV_INFO, _dixon_coles_1x2, _pi_expected_gd  # noqa: E402
from tactical_optaproxies import (  # noqa: E402
    UNDERSTAT_ROLL_COLS,
    compute_altitude_physics_scalar,
    safe_zero_diff_scalar,
)
from train_motor_a import FEATURES  # noqa: E402

PROC = os.path.join(ROOT, "data", "processed")
WS_LIVE_CONTEXT_PATH = os.path.join(PROC, "web_scraping", "ws_live_inference_context.json")
SEED = 20261109

# Hiperparámetros exportables a `model_motor_a.json` para paridad exacta (< 1e-12) en TypeScript
PROSPECTIVE_AVAILABILITY_PRIOR_CONFIG: dict[str, Any] = {
    "enabled": True,
    "schema_version": "3.0.0",
    "clip_abs": 0.35,
    "weights": {
        "missing_market_value_diff": 0.85,
        "shrunk_log_squad_value_ratio": 0.06,
        "effective_absences_diff": 0.025,
    },
    "bounds": {
        "missing_market_value_ratio_max": 0.60,
        "log_squad_value_ratio_clip": 2.0,
        "max_effective_absences_per_team": 8.0,
        "effective_absences_diff_clip": 6.0,
    },
    "absence_weights": {
        "rotowire_injured_out": 0.65,
        "transfermarkt_injured_with_rotowire": 0.35,
        "transfermarkt_injured_without_rotowire": 0.55,
        "suspended_players": 0.80,
    },
    "logit_shift": {
        "home_multiplier": 0.5,
        "draw_multiplier": 0.0,
        "away_multiplier": -0.5,
        "description": "log(P_H / P_A) += lineup_availability_delta; > 0 favorece local, < 0 favorece visita.",
    },
}


def _safe_nonneg_float(ctx: dict[str, Any] | None, key: str, default: float = 0.0) -> float:
    if not ctx:
        return default
    raw = ctx.get(key)
    if raw is None:
        return default
    try:
        val = float(raw)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(val):
        return default
    return max(0.0, val)


def _team_effective_absences(ctx: dict[str, Any] | None, cfg: dict[str, Any]) -> float:
    if not ctx:
        return 0.0
    aw = cfg["absence_weights"]
    max_abs = float(cfg["bounds"]["max_effective_absences_per_team"])

    rw_raw = ctx.get("rotowire_injured_out_count")
    has_rw = rw_raw is not None and math.isfinite(float(rw_raw)) and float(rw_raw) > 0.0
    rw_out = _safe_nonneg_float(ctx, "rotowire_injured_out_count", 0.0)
    tm_inj = _safe_nonneg_float(ctx, "injured_players_count", 0.0)
    susp = _safe_nonneg_float(ctx, "suspended_players_count", 0.0)

    if has_rw:
        eff = float(aw["rotowire_injured_out"]) * rw_out + float(aw["transfermarkt_injured_with_rotowire"]) * tm_inj
    else:
        eff = float(aw["transfermarkt_injured_without_rotowire"]) * tm_inj
    eff += float(aw["suspended_players"]) * susp
    return min(max_abs, max(0.0, eff))


def _team_squad_value_ratio(ctx: dict[str, Any] | None) -> float:
    if not ctx:
        return 1.0
    vr = ctx.get("value_ratio_vs_league_median")
    if vr is not None:
        try:
            v = float(vr)
            if math.isfinite(v) and v > 0.0:
                return v
        except (TypeError, ValueError):
            pass
    return 1.0


def compute_lineup_availability_delta(
    home_team_ctx: dict[str, Any] | None,
    away_team_ctx: dict[str, Any] | None,
    config: dict[str, Any] | None = None,
) -> dict[str, float]:
    """Prior bayesiano prospectivo en log-odds para inferencia live (`[-0.35, +0.35]`).

    NUNCA se inyecta en `features.parquet` histórico (`2000–2025`).
    Positivo favorece al equipo local; negativo favorece al visitante.
    """
    cfg = config or PROSPECTIVE_AVAILABILITY_PRIOR_CONFIG
    if not cfg.get("enabled", True) or (not home_team_ctx and not away_team_ctx):
        return {
            "lineup_availability_delta": 0.0,
            "missing_value_term": 0.0,
            "squad_value_term": 0.0,
            "starter_absence_term": 0.0,
            "home_missing_market_value_ratio": 0.0,
            "away_missing_market_value_ratio": 0.0,
            "home_effective_absences": 0.0,
            "away_effective_absences": 0.0,
        }

    bounds = cfg["bounds"]
    weights = cfg["weights"]
    miss_cap = float(bounds["missing_market_value_ratio_max"])
    log_vr_clip = float(bounds["log_squad_value_ratio_clip"])
    abs_diff_clip = float(bounds["effective_absences_diff_clip"])
    clip_abs = float(cfg["clip_abs"])

    h_miss = min(miss_cap, _safe_nonneg_float(home_team_ctx, "missing_market_value_ratio", 0.0))
    a_miss = min(miss_cap, _safe_nonneg_float(away_team_ctx, "missing_market_value_ratio", 0.0))
    missing_diff = a_miss - h_miss
    missing_term = float(weights["missing_market_value_diff"]) * missing_diff

    h_vr = _team_squad_value_ratio(home_team_ctx)
    a_vr = _team_squad_value_ratio(away_team_ctx)
    # Si falta contexto de plantilla en uno de los dos lados, neutralizar el ratio para no sesgar
    if not home_team_ctx or not away_team_ctx:
        log_vr = 0.0
    else:
        log_vr = max(-log_vr_clip, min(log_vr_clip, math.log(h_vr / a_vr)))
    squad_term = float(weights["shrunk_log_squad_value_ratio"]) * log_vr

    h_abs = _team_effective_absences(home_team_ctx, cfg)
    a_abs = _team_effective_absences(away_team_ctx, cfg)
    abs_diff = max(-abs_diff_clip, min(abs_diff_clip, a_abs - h_abs))
    absence_term = float(weights["effective_absences_diff"]) * abs_diff

    raw_delta = missing_term + squad_term + absence_term
    delta = max(-clip_abs, min(clip_abs, raw_delta))
    return {
        "lineup_availability_delta": float(delta),
        "missing_value_term": float(missing_term),
        "squad_value_term": float(squad_term),
        "starter_absence_term": float(absence_term),
        "home_missing_market_value_ratio": float(h_miss),
        "away_missing_market_value_ratio": float(a_miss),
        "home_effective_absences": float(h_abs),
        "away_effective_absences": float(a_abs),
    }


def load_live_inference_team_map(path: str = WS_LIVE_CONTEXT_PATH) -> dict[tuple[str, str], dict[str, Any]]:
    """Carga el mapa prospectivo `(div, pl_team) -> ctx` exclusivamente para inferencia live."""
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        payload = json.load(f)
    teams = payload.get("teams", [])
    out: dict[tuple[str, str], dict[str, Any]] = {}
    if isinstance(teams, dict):
        iterable = teams.values()
    else:
        iterable = teams
    for item in iterable:
        if not isinstance(item, dict):
            continue
        div = str(item.get("div", "")).strip()
        team = str(item.get("pl_team") or item.get("team_canonical") or "").strip()
        if div and team:
            out[(div, team)] = item
    return out


def season_start_year(season: str) -> int:
    return int(str(season)[:4])


def build_state(matches: pd.DataFrame) -> dict:
    """Estado por equipo a partir de TODOS los partidos (se filtra por fecha al consultar)."""
    df = elo_block(matches, prefix="elo")
    df = add_advanced_ratings_chronological(df)
    df = xg_elo_block(df)
    df["match_id"] = df["match_id"].astype(str)
    long = build_long(df)

    # Añadir estados post-partido (Elo, xG-Elo, ClubElo, Pi-Rating y Ataque/Defensa) a `long`
    hp = df[
        [
            "match_id",
            "home_team",
            "elo_home_post",
            "elo_xg_home_post",
            "clubelo_home_post",
            "pi_hh_post",
            "pi_ha_post",
            "att_h_post",
            "def_h_post",
        ]
    ].rename(
        columns={
            "home_team": "team",
            "elo_home_post": "elo_post",
            "elo_xg_home_post": "elo_xg_post",
            "clubelo_home_post": "clubelo_post",
            "pi_hh_post": "pi_h_post",
            "pi_ha_post": "pi_a_post",
            "att_h_post": "att_post",
            "def_h_post": "def_post",
        }
    )
    ap = df[
        [
            "match_id",
            "away_team",
            "elo_away_post",
            "elo_xg_away_post",
            "clubelo_away_post",
            "pi_ah_post",
            "pi_aa_post",
            "att_a_post",
            "def_a_post",
        ]
    ].rename(
        columns={
            "away_team": "team",
            "elo_away_post": "elo_post",
            "elo_xg_away_post": "elo_xg_post",
            "clubelo_away_post": "clubelo_post",
            "pi_ah_post": "pi_h_post",
            "pi_aa_post": "pi_a_post",
            "att_a_post": "att_post",
            "def_a_post": "def_post",
        }
    )
    post = pd.concat([hp, ap], ignore_index=True)
    long = long.merge(post, on=["match_id", "team"], how="left")
    long = long.sort_values(["team", "match_date", "match_id"], kind="mergesort").reset_index(drop=True)
    long["gf"] = long.gf.astype(float)

    g = long.groupby("team", sort=False)
    for w in (5, 10):
        r_df = g[ROLL_COLS].rolling(w, min_periods=1).mean().reset_index(level=0, drop=True)
        for col in ROLL_COLS:
            long[f"{col}_post_r{w}"] = r_df[col]

    for w in (5, 10):
        u_df = g[UNDERSTAT_ROLL_COLS].rolling(w, min_periods=2).mean().reset_index(level=0, drop=True)
        for col in UNDERSTAT_ROLL_COLS:
            long[f"{col}_post_r{w}"] = u_df[col]

    ewm_df = g[EWM_COLS].ewm(halflife=5, min_periods=1).mean().reset_index(level=0, drop=True)
    for col in EWM_COLS:
        long[f"{col}_post_ewm5"] = ewm_df[col]

    v_cols = ["points", "gd", "xgd"]
    v_df = (
        long.groupby(["team", "is_home"], sort=False)[v_cols]
        .rolling(5, min_periods=1)
        .mean()
        .reset_index(level=[0, 1], drop=True)
    )
    for col in v_cols:
        long[f"venue_{col}_post_r5"] = v_df[col]

    # Priors de temporada por (div, team) con min_count=1 en sot
    agg = long.groupby(["div", "team", "season"], as_index=False).agg(
        n=("match_id", "size"),
        gf=("gf", "sum"),
        ga=("ga", "sum"),
        pts=("points", "sum"),
        sot=("sot", lambda s: s.sum(min_count=1)),
    )
    agg["ppg"], agg["gf_pg"], agg["ga_pg"] = agg.pts / agg.n, agg.gf / agg.n, agg.ga / agg.n
    agg["sot_pg"] = agg.sot / agg.n
    agg = agg.sort_values(["div", "team", "season"], kind="mergesort")
    stat_cols = ["n", "gf", "ga", "pts", "ppg", "gf_pg", "ga_pg", "sot", "sot_pg"]
    agg[stat_cols] = agg.groupby(["div", "team"])[stat_cols].shift(1)
    priors = {}
    for r in agg.itertuples(index=False):
        if pd.isna(r.ppg):
            continue
        priors[(r.div, r.team, r.season)] = {
            "ppg": r.ppg,
            "gf_pg": r.gf_pg,
            "ga_pg": r.ga_pg,
            "sot_pg": r.sot_pg,
        }

    ls = df.groupby(["div", "season"], as_index=False).agg(
        total=("home_goals", "sum"),
        n=("match_id", "size"),
        hw=("result", lambda x: (x == "H").mean()),
    )
    ls["avg_total"] = ls.total / ls.n
    ls = ls.sort_values(["div", "season"], kind="mergesort")
    ls["lg_avg_total_prev"] = ls.groupby("div").avg_total.shift(1)
    ls["lg_home_win_prev"] = ls.groupby("div").hw.shift(1)
    league = {
        (r.div, r.season): (r.lg_avg_total_prev, r.lg_home_win_prev)
        for r in ls.itertuples(index=False)
    }
    return {"long": long, "priors": priors, "league": league}


def state_before(state: dict, div: str, team: str, date: pd.Timestamp, season: str, is_home_side: int) -> dict | None:
    long = state["long"]
    hist = long[(long.team == team) & (long.match_date < date)]
    if hist.empty:
        return None
    last = hist.iloc[-1]
    in_div = hist[hist["div"] == div]
    elo_post = float(in_div.iloc[-1]["elo_post"]) if not in_div.empty else None
    elo_xg_post = float(in_div.iloc[-1]["elo_xg_post"]) if not in_div.empty else None
    last_div_match = in_div.iloc[-1] if not in_div.empty else None

    venue_hist = hist[hist["is_home"] == is_home_side]
    last_venue = venue_hist.iloc[-1] if not venue_hist.empty else None

    def col(row_obj, name):
        if row_obj is None:
            return np.nan
        v = row_obj.get(name)
        return float(v) if v is not None and pd.notna(v) else np.nan

    window = {}
    for w in (5, 10):
        for c in ROLL_COLS:
            window[f"{c}_r{w}"] = col(last, f"{c}_post_r{w}")
        for c in UNDERSTAT_ROLL_COLS:
            window[f"{c}_r{w}"] = col(last, f"{c}_post_r{w}")
    for c in EWM_COLS:
        window[f"{c}_ewm5"] = col(last, f"{c}_post_ewm5")
    for c in ("points", "gd", "xgd"):
        window[f"venue_{c}_r5"] = col(last_venue, f"venue_{c}_post_r5")

    recent = hist[hist.match_date >= date - pd.Timedelta(days=14)]
    same = hist[(hist["div"] == div) & (hist.season == season)]
    home_matches = int((same["is_home"] == 1).sum())
    away_matches = int((same["is_home"] == 0).sum())

    # Ajustar Pi-Rating y Ataque/Defensa si el equipo cambia de categoría respecto a su último partido
    prev_div = str(last["div"])
    prev_tier = DIV_INFO.get(prev_div, (prev_div, 1, 1500.0))[1]
    curr_tier = DIV_INFO.get(div, (div, 1, 1500.0))[1]
    tier_diff = prev_tier - curr_tier

    pi_h = float(last["pi_h_post"]) - 0.18 * tier_diff
    pi_a = float(last["pi_a_post"]) - 0.18 * tier_diff
    att = float(last["att_post"]) - 0.12 * tier_diff
    dfn = float(last["def_post"]) + 0.12 * tier_diff
    clubelo = float(last["clubelo_post"])

    return {
        "elo_post": elo_post,
        "elo_xg_post": elo_xg_post,
        "elo_div": div,
        "last_div": prev_div,
        "last_date": last.match_date,
        "last_season": last.season,
        "last_div_season": (last_div_match["season"] if last_div_match is not None else None),
        "window": window,
        "matches_last_14d": int(len(recent)),
        "home_matches_season": home_matches,
        "away_matches_season": away_matches,
        "div_change": int(prev_div != div),
        "pi_h": pi_h,
        "pi_a": pi_a,
        "att": att,
        "def": dfn,
        "clubelo": clubelo,
    }


def elo_for_fixture(state_row: dict | None, div: str, season: str) -> float:
    if state_row is None or state_row.get("elo_post") is None:
        return 1500.0
    r = state_row["elo_post"]
    if state_row.get("last_div_season") != season:
        r = 1500.0 + (r - 1500.0) * (1.0 - ELO_SEASON_REGRESSION)
    return r


def elo_xg_for_fixture(state_row: dict | None, div: str, season: str) -> float:
    if state_row is None or state_row.get("elo_xg_post") is None:
        return 1500.0
    r = state_row["elo_xg_post"]
    if state_row.get("last_div_season") != season:
        r = 1500.0 + (r - 1500.0) * (1.0 - ELO_SEASON_REGRESSION)
    return r


def season_progress(season: str, date: pd.Timestamp) -> float:
    y = season_start_year(season)
    if "/" in str(season):
        start, end = pd.Timestamp(y, 7, 1), pd.Timestamp(y + 1, 6, 30)
    else:
        start, end = pd.Timestamp(y, 1, 1), pd.Timestamp(y, 12, 31)
    span = (end - start).days
    return float(np.clip((date - start).days / span, 0, 1))


def features_for_fixture(
    state: dict,
    div: str,
    season: str,
    date: pd.Timestamp,
    home: str,
    away: str,
) -> dict:
    hs = state_before(state, div, home, date, season, is_home_side=1)
    as_ = state_before(state, div, away, date, season, is_home_side=0)
    eh = elo_for_fixture(hs, div, season)
    ea = elo_for_fixture(as_, div, season)
    elo_diff = eh + ELO_HFA - ea

    exh = elo_xg_for_fixture(hs, div, season)
    exa = elo_xg_for_fixture(as_, div, season)
    xg_elo_diff = exh - exa

    _, _, base_global = DIV_INFO.get(div, (div, 1, 1500.0))
    ch = hs["clubelo"] if hs else base_global
    ca = as_["clubelo"] if as_ else base_global

    r_hh = hs["pi_h"] if hs else 0.0
    r_ha = hs["pi_a"] if hs else 0.0
    r_ah = as_["pi_h"] if as_ else 0.0
    r_aa = as_["pi_a"] if as_ else 0.0
    pi_diff = r_hh - r_aa
    pi_exp_gd = _pi_expected_gd(r_hh) - _pi_expected_gd(r_aa)
    pi_overall_diff = 0.5 * (r_hh + r_ha) - 0.5 * (r_ah + r_aa)

    al_h = hs["att"] if hs else 0.0
    be_h = hs["def"] if hs else 0.0
    al_a = as_["att"] if as_ else 0.0
    be_a = as_["def"] if as_ else 0.0
    lam_h = 1.48 * math.exp(max(-1.2, min(1.2, al_h + be_a)))
    lam_a = 1.14 * math.exp(max(-1.2, min(1.2, al_a + be_h)))
    dc_h, dc_d, dc_a = _dixon_coles_1x2(lam_h, lam_a)

    f = {
        "elo_home": eh,
        "elo_away": ea,
        "elo_diff": elo_diff,
        "elo_diff_no_hfa": eh - ea,
        "elo_prob_home_nodraw": 1.0 / (1.0 + 10.0 ** (-elo_diff / 400.0)),
        "elo_xg_home": exh,
        "elo_xg_away": exa,
        "xg_elo_diff": xg_elo_diff,
        "xg_elo_vs_elo_diff": xg_elo_diff - (eh - ea),
        "clubelo_home": ch,
        "clubelo_away": ca,
        "clubelo_diff": ch - ca,
        "pi_home_h": r_hh,
        "pi_away_a": r_aa,
        "pi_diff": pi_diff,
        "pi_exp_gd": pi_exp_gd,
        "pi_overall_diff": pi_overall_diff,
        "att_strength_home": al_h,
        "def_strength_home": be_h,
        "att_strength_away": al_a,
        "def_strength_away": be_a,
        "dc_lam_home": lam_h,
        "dc_lam_away": lam_a,
        "dc_exp_total": lam_h + lam_a,
        "dc_exp_diff": lam_h - lam_a,
        "dc_prob_h": dc_h,
        "dc_prob_d": dc_d,
        "dc_prob_a": dc_a,
    }
    f["season_progress"] = season_progress(season, date)
    f["elo_diff_x_progress"] = elo_diff * f["season_progress"]

    for side, st in (("h", hs), ("a", as_)):
        w = (st or {}).get("window", {})
        for k, v in w.items():
            f[f"{side}_{k}"] = v
        dt = (date - st["last_date"]).days if st and st.get("last_date") is not None else np.nan
        dt_clipped = float(np.clip(dt, DAYS_REST_MIN, DAYS_REST_MAX)) if pd.notna(dt) else np.nan
        f[f"{side}_days_rest"] = dt_clipped
        f[f"{side}_short_rest"] = 1.0 if (pd.notna(dt_clipped) and dt_clipped < 4.0) else 0.0
        f[f"{side}_matches_last_14d"] = float(st["matches_last_14d"]) if st else 0.0
        pfx = "home" if side == "h" else "away"
        sm = (st["home_matches_season"] if side == "h" else st["away_matches_season"]) if st else None
        f[f"{pfx}_season_match_no"] = float(sm) if sm is not None else 0.0
        f[f"{side}_div_change"] = float(st["div_change"]) if st else 0.0
        f[f"{side}_season_break"] = float(int(st["last_season"] != season)) if st else 0.0
        pr = state["priors"].get((div, home if side == "h" else away, season), {})
        f[f"{pfx}_prev_ppg"] = pr.get("ppg", np.nan)
        f[f"{pfx}_prev_gf_pg"] = pr.get("gf_pg", np.nan)
        f[f"{pfx}_prev_ga_pg"] = pr.get("ga_pg", np.nan)
        f[f"{pfx}_prev_sot_pg"] = pr.get("sot_pg", np.nan)

    f["form_pts_diff_r5"] = f.get("h_points_r5", np.nan) - f.get("a_points_r5", np.nan)
    f["form_gd_diff_r5"] = f.get("h_gd_r5", np.nan) - f.get("a_gd_r5", np.nan)
    f["form_gd_diff_r10"] = f.get("h_gd_r10", np.nan) - f.get("a_gd_r10", np.nan)
    f["rest_diff"] = f.get("h_days_rest", np.nan) - f.get("a_days_rest", np.nan)
    f["congestion_diff"] = f.get("h_matches_last_14d", np.nan) - f.get("a_matches_last_14d", np.nan)

    f["xgd_diff_r5"] = f.get("h_xgd_r5", np.nan) - f.get("a_xgd_r5", np.nan)
    f["xgd_diff_r10"] = f.get("h_xgd_r10", np.nan) - f.get("a_xgd_r10", np.nan)
    f["xg_overperf_diff_r5"] = f.get("h_xg_overperf_r5", np.nan) - f.get("a_xg_overperf_r5", np.nan)
    f["form_pts_res_diff_r5"] = f.get("h_pts_res_r5", np.nan) - f.get("a_pts_res_r5", np.nan)
    f["form_gd_res_diff_r5"] = f.get("h_gd_res_r5", np.nan) - f.get("a_gd_res_r5", np.nan)
    f["sos_diff_r5"] = f.get("h_opp_elo_r5", np.nan) - f.get("a_opp_elo_r5", np.nan)
    f["venue_pts_diff_r5"] = f.get("h_venue_points_r5", np.nan) - f.get("a_venue_points_r5", np.nan)
    f["venue_gd_diff_r5"] = f.get("h_venue_gd_r5", np.nan) - f.get("a_venue_gd_r5", np.nan)
    f["venue_xgd_diff_r5"] = f.get("h_venue_xgd_r5", np.nan) - f.get("a_venue_xgd_r5", np.nan)
    h_has_sh = f.get("h_has_shots_r5", 0.0)
    f["has_shots_stats"] = 1.0 if (pd.notna(h_has_sh) and float(h_has_sh) > 0.0) else 0.0

    # Opta-proxies tácticos y quiebre de régimen estructural
    f["gk_prevented_diff_r5"] = f.get("h_gk_prevented_r5", np.nan) - f.get("a_gk_prevented_r5", np.nan)
    f["gk_prevented_diff_r10"] = f.get("h_gk_prevented_r10", np.nan) - f.get("a_gk_prevented_r10", np.nan)
    f["field_tilt_diff_r5"] = f.get("h_field_tilt_r5", np.nan) - f.get("a_field_tilt_r5", np.nan)
    f["field_tilt_diff_r10"] = f.get("h_field_tilt_r10", np.nan) - f.get("a_field_tilt_r10", np.nan)
    f["xgot_diff_r5"] = f.get("h_xgot_r5", np.nan) - f.get("a_xgot_r5", np.nan)
    f["xgot_diff_r10"] = f.get("h_xgot_r10", np.nan) - f.get("a_xgot_r10", np.nan)
    f["clinical_overperf_diff_r10"] = f.get("h_clinical_overperf_r10", np.nan) - f.get("a_clinical_overperf_r10", np.nan)
    h_shift = f.get("h_xgd_r5", np.nan) - f.get("h_xgd_r10", np.nan)
    a_shift = f.get("a_xgd_r5", np.nan) - f.get("a_xgd_r10", np.nan)
    f["h_xgd_regime_shift"] = h_shift
    f["a_xgd_regime_shift"] = a_shift
    f["xgd_regime_shift_diff"] = h_shift - a_shift

    # Diferenciales de 10 partidos, EWMA y probabilidades estructurales en espacio logit (v2.1)
    _eps = 1e-4
    f["dc_logit_h"] = math.log(max(_eps, min(1.0 - _eps, float(f["dc_prob_h"]))))
    f["dc_logit_d"] = math.log(max(_eps, min(1.0 - _eps, float(f["dc_prob_d"]))))
    f["dc_logit_a"] = math.log(max(_eps, min(1.0 - _eps, float(f["dc_prob_a"]))))
    p_elo_nd = max(_eps, min(1.0 - _eps, float(f["elo_prob_home_nodraw"])))
    f["elo_logit_h"] = math.log(p_elo_nd / (1.0 - p_elo_nd))
    f["pts_res_diff_r10"] = f.get("h_pts_res_r10", np.nan) - f.get("a_pts_res_r10", np.nan)
    f["gd_res_diff_r10"] = f.get("h_gd_res_r10", np.nan) - f.get("a_gd_res_r10", np.nan)
    f["sos_diff_r10"] = f.get("h_opp_elo_r10", np.nan) - f.get("a_opp_elo_r10", np.nan)
    f["xgd_ewm5_diff"] = f.get("h_xgd_ewm5", np.nan) - f.get("a_xgd_ewm5", np.nan)
    f["pts_res_ewm5_diff"] = f.get("h_pts_res_ewm5", np.nan) - f.get("a_pts_res_ewm5", np.nan)
    f["gd_res_ewm5_diff"] = f.get("h_gd_res_ewm5", np.nan) - f.get("a_gd_res_ewm5", np.nan)
    f["sot_diff_r10"] = f.get("h_sot_r10", np.nan) - f.get("a_sot_r10", np.nan)
    f["corners_diff_r10"] = f.get("h_corners_r10", np.nan) - f.get("a_corners_r10", np.nan)

    # Bloque Tachyon v3.0: Real xG History, xG-Elo, Clinical Luck Gap, Understat PPDA/Deep & Altitud
    h_hrx = f.get("h_has_real_xg_r10", np.nan)
    a_hrx = f.get("a_has_real_xg_r10", np.nan)
    f["has_real_xg_history"] = 0.5 * (
        (float(h_hrx) if pd.notna(h_hrx) else 0.0) + (float(a_hrx) if pd.notna(a_hrx) else 0.0)
    )
    f["pts_minus_xpts_diff_r5"] = f.get("h_pts_minus_xpts_r5", np.nan) - f.get("a_pts_minus_xpts_r5", np.nan)
    f["pts_minus_xpts_diff_r10"] = f.get("h_pts_minus_xpts_r10", np.nan) - f.get("a_pts_minus_xpts_r10", np.nan)
    f["pts_minus_xpts_ewm5_diff"] = f.get("h_pts_minus_xpts_ewm5", np.nan) - f.get("a_pts_minus_xpts_ewm5", np.nan)
    f["xpts_diff_r5"] = f.get("h_xpts_r5", np.nan) - f.get("a_xpts_r5", np.nan)
    f["xpts_diff_r10"] = f.get("h_xpts_r10", np.nan) - f.get("a_xpts_r10", np.nan)
    f["xpts_ewm5_diff"] = f.get("h_xpts_ewm5", np.nan) - f.get("a_xpts_ewm5", np.nan)

    f["ppda_diff_r5"] = safe_zero_diff_scalar(f.get("h_ppda_avg_r5"), f.get("a_ppda_avg_r5"))
    f["ppda_diff_r10"] = safe_zero_diff_scalar(f.get("h_ppda_avg_r10"), f.get("a_ppda_avg_r10"))
    f["deep_completions_diff_r5"] = safe_zero_diff_scalar(
        f.get("h_deep_completions_r5"), f.get("a_deep_completions_r5")
    )
    f["deep_completions_diff_r10"] = safe_zero_diff_scalar(
        f.get("h_deep_completions_r10"), f.get("a_deep_completions_r10")
    )
    f["npxgd_diff_r5"] = safe_zero_diff_scalar(f.get("h_npxgd_r5"), f.get("a_npxgd_r5"))
    f["npxgd_diff_r10"] = safe_zero_diff_scalar(f.get("h_npxgd_r10"), f.get("a_npxgd_r10"))

    f.update(compute_altitude_physics_scalar(div, home, away))

    f["abs_elo_diff"] = abs(elo_diff)
    f["elo_closeness"] = math.exp(-((elo_diff / 150.0) ** 2))
    f["low_scoring_tight_match"] = f["elo_closeness"] / max(1.5, f["dc_exp_total"])
    hd10 = f.get("h_draw_r10", np.nan)
    ad10 = f.get("a_draw_r10", np.nan)
    f["draw_rate_sum_r10"] = 0.5 * (
        (float(hd10) if pd.notna(hd10) else 0.26) + (float(ad10) if pd.notna(ad10) else 0.26)
    )

    lg = state["league"].get((div, season), (np.nan, np.nan))
    f["lg_avg_total_prev"], f["lg_home_win_prev"] = lg
    return f


def validate(n: int, feature_list: list[str] | None = None) -> dict:
    check_cols = feature_list if feature_list is not None else list(FEATURES)
    matches = load_matches()
    feats = pd.read_parquet(os.path.join(PROC, "features.parquet"))
    feats = feats[feats.y.notna()].copy()
    feats["match_date"] = pd.to_datetime(feats["match_date"])
    state = build_state(matches)
    sample = feats.sample(n=min(n, len(feats)), random_state=SEED)
    rows = []
    for r in sample.itertuples(index=False):
        f = features_for_fixture(state, r.div, r.season, r.match_date, r.home_team, r.away_team)
        expected = {k: getattr(r, k) for k in check_cols}
        diffs = {}
        for k in check_cols:
            a, b = f.get(k, np.nan), expected.get(k, np.nan)
            if pd.isna(a) and pd.isna(b):
                continue
            if pd.isna(a) or pd.isna(b):
                diffs[k] = None
            else:
                d = abs(float(a) - float(b))
                if d > 1e-9:
                    diffs[k] = d
        rows.append({"match_id": r.match_id, "n_diff": len(diffs), "diffs": diffs})
    bad = [x for x in rows if x["n_diff"] > 0]
    summary = {
        "n_sample": len(rows),
        "n_features_checked": len(check_cols),
        "n_exact": len(rows) - len(bad),
        "n_with_diff": len(bad),
        "examples": bad[:5],
    }
    return summary


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--validate", type=int, default=0)
    args = ap.parse_args()
    if args.validate:
        out = validate(args.validate)
        print(json.dumps(out, indent=1, default=float)[:3000], flush=True)
        path = os.path.join(ROOT, "experiments", "EXP01_baselines_20261109", "fixture_features_validation.json")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(out, f, indent=1, default=float)
        print("escrito ->", path, flush=True)
        return
    print("usa --validate N para validar contra features.parquet")


if __name__ == "__main__":
    main()
