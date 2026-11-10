#!/usr/bin/env python3
"""Genera features causales (pre-partido) de 2ª generación para el Motor A.

Regla de oro: para predecir el partido m solo se usa información de partidos con
`match_date < m.match_date` (estrictamente anterior). Todas las ventanas se construyen con
`.shift(1)` dentro de la historia de cada equipo, y todos los sistemas de rating dinámicos
(Elo, ClubElo inter-división, Pi-Ratings y Ataque/Defensa Dixon-Coles) se actualizan
estrictamente después de emitir las features pre-partido.

Uso:
    ./.venv/bin/python features/build_features.py

Salida:
    data/processed/features.parquet   (una fila por partido, features pre-partido + target)
    data/processed/features.csv
    reports/A05_feature_dictionary.md (catálogo generado)
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "features"))

from ratings_advanced import compute_advanced_ratings  # noqa: E402
from tactical_optaproxies import (  # noqa: E402
    compute_match_xgot_and_tactical_proxies,
    compute_regime_shift_features,
)
from xg_proxy import compute_match_synthetic_xg  # noqa: E402

PROC = os.path.join(ROOT, "data", "processed")

# Parámetros óptimos del Elo (EXP02 demostró que season_reg = 0.0 mejora -0.00210 nats sobre 0.33)
ELO_START = 1500.0
ELO_K = 20.0
ELO_HFA = 65.0
ELO_SEASON_REGRESSION = 0.0
ELO_MOV = True

# Límite físico de días de descanso (evita outliers de hasta 8,477 días por reapariciones tras años)
DAYS_REST_MIN = 1.0
DAYS_REST_MAX = 35.0


def load_matches() -> pd.DataFrame:
    p = os.path.join(PROC, "matches.parquet")
    if not os.path.exists(p):
        raise SystemExit(f"Falta {p}: ejecuta antes etl/build_matches.py")
    df = pd.read_parquet(p)
    df["match_date"] = pd.to_datetime(df["match_date"])
    df = df[df.result.notna() & df.home_goals.notna()].copy()
    df["home_goals"] = df.home_goals.astype(int)
    df["away_goals"] = df.away_goals.astype(int)
    df["kickoff_time"] = df["kickoff_time"].fillna("")
    df = df.sort_values(["div", "match_date", "kickoff_time", "match_id"], kind="mergesort")
    return df.reset_index(drop=True)


def mov_multiplier(gd: int) -> float:
    gd = abs(int(gd))
    if gd <= 1:
        return 1.0
    if gd == 2:
        return 1.5
    return (11.0 + gd) / 8.0


def elo_block(
    df: pd.DataFrame,
    k: float = ELO_K,
    hfa: float = ELO_HFA,
    season_reg: float = ELO_SEASON_REGRESSION,
    mov: bool = ELO_MOV,
    prefix: str = "elo",
) -> pd.DataFrame:
    """Elo causal por (div, equipo). Devuelve columnas pre-partido y post-partido."""
    ratings: dict[tuple[str, str], float] = {}
    last_season: dict[tuple[str, str], str] = {}
    cols = {
        f"{prefix}_home": [],
        f"{prefix}_away": [],
        f"{prefix}_home_post": [],
        f"{prefix}_away_post": [],
        f"{prefix}_exp_home": [],
    }
    for row in df.itertuples(index=False):
        div, season = row.div, row.season
        hk, ak = (div, row.home_team), (div, row.away_team)
        for key in (hk, ak):
            if key not in ratings:
                ratings[key] = ELO_START
                last_season[key] = season
            elif last_season[key] != season:
                ratings[key] = ELO_START + (ratings[key] - ELO_START) * (1.0 - season_reg)
                last_season[key] = season
        rh, ra = ratings[hk], ratings[ak]
        exp_home = 1.0 / (1.0 + 10.0 ** (-((rh + hfa) - ra) / 400.0))
        gd = int(row.home_goals) - int(row.away_goals)
        score_home = 1.0 if gd > 0 else (0.5 if gd == 0 else 0.0)
        delta = k * (mov_multiplier(gd) if mov else 1.0) * (score_home - exp_home)
        cols[f"{prefix}_home"].append(rh)
        cols[f"{prefix}_away"].append(ra)
        cols[f"{prefix}_exp_home"].append(exp_home)
        cols[f"{prefix}_home_post"].append(rh + delta)
        cols[f"{prefix}_away_post"].append(ra - delta)
        ratings[hk], ratings[ak] = rh + delta, ra - delta
    out = df.copy()
    for c, v in cols.items():
        out[c] = v
    out[f"{prefix}_diff"] = out[f"{prefix}_home"] + hfa - out[f"{prefix}_away"]
    out[f"{prefix}_diff_no_hfa"] = out[f"{prefix}_home"] - out[f"{prefix}_away"]
    return out


def rest_and_congestion(long: pd.DataFrame, lookback_days: int = 14) -> pd.DataFrame:
    """Días de descanso (acotado a [1, 35]) y partidos en los últimos N días, estrictamente previos."""
    long = long.sort_values(["team", "match_date", "match_id"], kind="mergesort").copy()
    rest, cong = [], []
    for _team, g in long.groupby("team", sort=False):
        dates = g.match_date.values.astype("datetime64[D]")
        prev = np.empty(len(g), dtype=float)
        prev[0] = np.nan
        raw_days = (dates[1:] - dates[:-1]) / np.timedelta64(1, "D")
        prev[1:] = np.clip(raw_days, DAYS_REST_MIN, DAYS_REST_MAX)
        cnt = np.zeros(len(g), dtype=float)
        for i in range(1, len(g)):
            lo = dates[i] - np.timedelta64(lookback_days, "D")
            cnt[i] = int(((dates[:i] >= lo) & (dates[:i] < dates[i])).sum())
        rest.extend(zip(g.index, prev))
        cong.extend(zip(g.index, cnt))
    r = pd.Series(dict(rest))
    c = pd.Series(dict(cong))
    long["days_rest"] = r.reindex(long.index).astype(float)
    long["short_rest"] = (long["days_rest"] < 4.0).astype(float)
    long["matches_last_14d"] = c.reindex(long.index).astype(float)
    return long


ROLL_COLS = [
    "points",
    "gf",
    "ga",
    "gd",
    "shots",
    "sot",
    "corners",
    "win",
    "draw",
    "loss",
    "goals_per_shot",
    "sot_rate",
    # 2ª generación: xG sintético + sobre-rendimiento + ajuste por oponente
    "xgf",
    "xga",
    "xgd",
    "xg_overperf",
    "has_shots",
    "pts_res",
    "gd_res",
    "opp_elo",
    # Opta-proxies tácticos: xGOT, Prevención de arquero, Field Tilt y Efectividad clínica
    "xgot",
    "gk_prevented",
    "field_tilt",
    "clinical_overperf",
]


def build_long(df: pd.DataFrame) -> pd.DataFrame:
    dc_h = df["dc_lam_home"].to_numpy(dtype=float) if "dc_lam_home" in df.columns else None
    dc_a = df["dc_lam_away"].to_numpy(dtype=float) if "dc_lam_away" in df.columns else None
    xg_h, xg_a, has_shot_stats = compute_match_synthetic_xg(df, dc_h, dc_a)
    tactical = compute_match_xgot_and_tactical_proxies(df, xg_h, xg_a)

    home = pd.DataFrame(
        {
            "match_id": df.match_id,
            "div": df["div"],
            "season": df.season,
            "match_date": df.match_date,
            "team": df.home_team,
            "opponent": df.away_team,
            "is_home": 1,
            "gf": df.home_goals,
            "ga": df.away_goals,
            "shots": df.shots_home,
            "sot": df.sot_home,
            "corners": df.corners_home,
            "elo_pre": df.elo_home,
            "opp_elo_pre": df.elo_away,
            "xgf": xg_h,
            "xga": xg_a,
            "has_shots": has_shot_stats,
            "xgot": tactical["xgot_home"],
            "gk_prevented": tactical["gk_prevented_home"],
            "field_tilt": tactical["field_tilt_home"],
            "clinical_overperf": tactical["clinical_overperf_home"],
        }
    )
    away = pd.DataFrame(
        {
            "match_id": df.match_id,
            "div": df["div"],
            "season": df.season,
            "match_date": df.match_date,
            "team": df.away_team,
            "opponent": df.home_team,
            "is_home": 0,
            "gf": df.away_goals,
            "ga": df.home_goals,
            "shots": df.shots_away,
            "sot": df.sot_away,
            "corners": df.corners_away,
            "elo_pre": df.elo_away,
            "opp_elo_pre": df.elo_home,
            "xgf": xg_a,
            "xga": xg_h,
            "has_shots": has_shot_stats,
            "xgot": tactical["xgot_away"],
            "gk_prevented": tactical["gk_prevented_away"],
            "field_tilt": tactical["field_tilt_away"],
            "clinical_overperf": tactical["clinical_overperf_away"],
        }
    )
    long = pd.concat([home, away], ignore_index=True)
    long["points"] = np.where(long.gf > long.ga, 3, np.where(long.gf == long.ga, 1, 0))
    long["gd"] = long.gf - long.ga
    long["win"] = (long.gf > long.ga).astype(float)
    long["draw"] = (long.gf == long.ga).astype(float)
    long["loss"] = (long.gf < long.ga).astype(float)
    long["goals_per_shot"] = long.gf / long.shots.replace(0, np.nan)
    long["sot_rate"] = long.sot / long.shots.replace(0, np.nan)

    # xG diferencial y sobre-rendimiento finalizador (regresión a la media)
    long["xgd"] = long["xgf"] - long["xga"]
    long["xg_overperf"] = long["gf"] - long["xgf"]

    # Residuales ajustados por fuerza del rival (Opponent-Adjusted Form)
    eff_elo_diff = (long["elo_pre"] - long["opp_elo_pre"]) + np.where(long["is_home"] == 1, ELO_HFA, -ELO_HFA)
    exp_score = 1.0 / (1.0 + 10.0 ** (-eff_elo_diff / 400.0))
    exp_pts = 2.75 * exp_score
    exp_gd = eff_elo_diff / 180.0
    long["pts_res"] = long["points"] - exp_pts
    long["gd_res"] = long["gd"] - exp_gd
    long["opp_elo"] = long["opp_elo_pre"]

    long = long.sort_values(["team", "match_date", "match_id"], kind="mergesort")
    return long


def rolling_features(long: pd.DataFrame, windows=(5, 10)) -> pd.DataFrame:
    long = long.sort_values(["team", "match_date", "match_id"], kind="mergesort").reset_index(drop=True)
    shifted = long.groupby("team", sort=False)[ROLL_COLS].shift(1)
    g_shift = shifted.groupby(long["team"], sort=False)
    for w in windows:
        r_df = g_shift.rolling(w, min_periods=1).mean().reset_index(level=0, drop=True)
        for col in ROLL_COLS:
            long[f"{col}_r{w}"] = r_df[col]
    # Forma ponderada exponencial (halflife 5 partidos) sobre puntos, goles, xG y residuales
    ewm_cols = ["points", "gf", "ga", "gd", "xgd", "pts_res", "gd_res"]
    ewm_df = shifted[ewm_cols].groupby(long["team"], sort=False).ewm(halflife=5, min_periods=1).mean().reset_index(level=0, drop=True)
    for col in ewm_cols:
        long[f"{col}_ewm5"] = ewm_df[col]
    # Forma específica por condición de localía (casa cuando juega en casa, fuera cuando juega fuera)
    v_cols = ["points", "gd", "xgd"]
    v_shifted = long.groupby(["team", "is_home"], sort=False)[v_cols].shift(1)
    v_df = v_shifted.groupby([long["team"], long["is_home"]], sort=False).rolling(5, min_periods=1).mean().reset_index(level=[0, 1], drop=True)
    for col in v_cols:
        long[f"venue_{col}_r5"] = v_df[col]
    return long


def team_season_priors(long: pd.DataFrame) -> pd.DataFrame:
    """Agregados de la temporada ANTERIOR por equipo (causales: la temporada ya terminó).

    Corrige el bug detectado en A05: `sum(min_count=1)` evita convertir temporadas sin datos
    de tiros en falsos ceros `0.0`.
    """
    agg = long.groupby(["div", "team", "season"], as_index=False).agg(
        n=("match_id", "size"),
        gf=("gf", "sum"),
        ga=("ga", "sum"),
        pts=("points", "sum"),
        shots=("shots", lambda s: s.sum(min_count=1)),
        sot=("sot", lambda s: s.sum(min_count=1)),
    )
    agg["ppg"] = agg.pts / agg.n
    agg["gf_pg"] = agg.gf / agg.n
    agg["ga_pg"] = agg.ga / agg.n
    agg["sot_pg"] = agg.sot / agg.n
    agg = agg.sort_values(["div", "team", "season"], kind="mergesort")
    stat_cols = ["n", "gf", "ga", "pts", "shots", "sot", "ppg", "gf_pg", "ga_pg", "sot_pg"]
    agg[stat_cols] = agg.groupby(["div", "team"])[stat_cols].shift(1)
    agg = agg.rename(
        columns={
            "n": "prev_n",
            "gf": "prev_gf",
            "ga": "prev_ga",
            "pts": "prev_pts",
            "shots": "prev_shots",
            "sot": "prev_sot",
            "ppg": "prev_ppg",
            "gf_pg": "prev_gf_pg",
            "ga_pg": "prev_ga_pg",
            "sot_pg": "prev_sot_pg",
            "season": "target_season",
        }
    )
    keep = ["div", "team", "target_season", "prev_n", "prev_ppg", "prev_gf_pg", "prev_ga_pg", "prev_sot_pg"]
    return agg[keep]


def league_priors(df: pd.DataFrame) -> pd.DataFrame:
    """Media de goles totales de la temporada anterior por división (causal)."""
    s = df.groupby(["div", "season"], as_index=False).agg(
        total_goals=("home_goals", "sum"),
        n=("match_id", "size"),
        home_win=("result", lambda x: (x == "H").mean()),
    )
    s["avg_total"] = s.total_goals / s.n
    s = s.sort_values(["div", "season"], kind="mergesort")
    s["lg_avg_total_prev"] = s.groupby("div").avg_total.shift(1)
    s["lg_home_win_prev"] = s.groupby("div").home_win.shift(1)
    return s[["div", "season", "lg_avg_total_prev", "lg_home_win_prev"]]


def context_features(df: pd.DataFrame) -> pd.DataFrame:
    out = df.sort_values(
        ["div", "season", "match_date", "kickoff_time", "match_id"],
        kind="mergesort",
    ).copy()
    out["home_season_match_no"] = out.groupby(["div", "season", "home_team"]).cumcount()
    out["away_season_match_no"] = out.groupby(["div", "season", "away_team"]).cumcount()
    out["round_no"] = out[["home_season_match_no", "away_season_match_no"]].max(axis=1)
    bounds = {}
    for season in out.season.unique():
        y = int(str(season)[:4])
        if "/" in str(season):
            bounds[season] = (pd.Timestamp(y, 7, 1), pd.Timestamp(y + 1, 6, 30))
        else:
            bounds[season] = (pd.Timestamp(y, 1, 1), pd.Timestamp(y, 12, 31))
    starts = out.season.map(lambda s: bounds[s][0])
    ends = out.season.map(lambda s: bounds[s][1])
    span = (ends - starts).dt.days.replace(0, np.nan)
    out["season_progress"] = ((out.match_date - starts).dt.days / span).clip(0, 1)
    return out


def add_advanced_ratings_chronological(df: pd.DataFrame) -> pd.DataFrame:
    """Ejecuta compute_advanced_ratings en orden cronológico global para preservar ascensos/descensos."""
    chrono = df.sort_values(["match_date", "kickoff_time", "match_id"], kind="mergesort")
    adv = compute_advanced_ratings(chrono)
    # No sobrescribir elo_home/elo_away/elo_diff de elo_block para mantener paridad exacta en las columnas base,
    # pero exponer todas las nuevas columnas (pi_*, dc_*, clubelo_*, att_*, def_*, promoted_*, relegated_*)
    keep_adv = [
        c
        for c in adv.columns
        if c not in ("elo_home", "elo_away", "elo_diff", "elo_exp_h")
    ]
    out = df.copy()
    for c in keep_adv:
        out[c] = adv[c].reindex(out.index).values
    return out


def main():
    df = load_matches()
    print(f"partidos con resultado: {len(df):,}")
    # 1. Elo principal (con season_reg=0.0 de EXP02) + variantes
    df = elo_block(df, k=ELO_K, hfa=ELO_HFA, season_reg=ELO_SEASON_REGRESSION, mov=ELO_MOV, prefix="elo")
    df = elo_block(df, k=10, hfa=ELO_HFA, season_reg=ELO_SEASON_REGRESSION, mov=False, prefix="elo_k10")
    df = elo_block(df, k=40, hfa=ELO_HFA, season_reg=ELO_SEASON_REGRESSION, mov=True, prefix="elo_k40")

    # 2. Sistemas de rating de 2ª generación (Pi-Ratings, ClubElo inter-división, Ataque/Defensa Dixon-Coles)
    df = add_advanced_ratings_chronological(df)

    # 3. Historial en formato largo + xG sintético + forma ajustada por oponente + forma por localía
    long = build_long(df)
    long = rest_and_congestion(long)
    long = rolling_features(long)
    long = long.sort_values(["team", "match_date", "match_id"], kind="mergesort")
    long["prev_div"] = long.groupby("team")["div"].shift(1)
    long["prev_season"] = long.groupby("team").season.shift(1)
    long["div_change"] = ((long.prev_div.notna()) & (long.prev_div != long["div"])).astype(int)
    long["season_break"] = ((long.prev_season.notna()) & (long.prev_season != long.season)).astype(int)

    feat_cols = [
        c for c in long.columns if any(c.endswith(s) for s in ("_r5", "_r10", "_ewm5"))
    ] + ["days_rest", "short_rest", "matches_last_14d", "div_change", "season_break", "is_home"]
    base = ["match_id", "team", "is_home"] + feat_cols
    home_feats = long[long.is_home == 1][base].add_prefix("h_").rename(columns={"h_match_id": "match_id"})
    away_feats = long[long.is_home == 0][base].add_prefix("a_").rename(columns={"a_match_id": "match_id"})
    home_feats = home_feats.drop(columns=["h_team", "h_is_home"])
    away_feats = away_feats.drop(columns=["a_team", "a_is_home"])

    out = df.merge(home_feats, on="match_id", how="left").merge(away_feats, on="match_id", how="left")
    out = context_features(out)

    # Priors de temporada anterior (con min_count=1 para evitar falsos ceros en sot)
    tp = team_season_priors(long)
    for side, team in (("home", "home_team"), ("away", "away_team")):
        m = out[["match_id", "div", team, "season"]].merge(
            tp, left_on=["div", team, "season"], right_on=["div", "team", "target_season"], how="left"
        )
        m = m.set_index("match_id")
        for c in ("prev_n", "prev_ppg", "prev_gf_pg", "prev_ga_pg", "prev_sot_pg"):
            out[f"{side}_{c}"] = m[c].reindex(out.match_id).values
    lp = league_priors(df)
    out = out.merge(lp, on=["div", "season"], how="left")

    # Diferenciales clave (1ª y 2ª generación)
    for c in ("elo_diff", "elo_diff_no_hfa"):
        out[c] = out[c].astype(float)
    out["elo_prob_home_nodraw"] = 1.0 / (1.0 + 10.0 ** (-out.elo_diff / 400.0))
    out["elo_diff_x_progress"] = out.elo_diff * out.season_progress
    out["form_pts_diff_r5"] = out.h_points_r5 - out.a_points_r5
    out["form_gd_diff_r5"] = out.h_gd_r5 - out.a_gd_r5
    out["form_gd_diff_r10"] = out.h_gd_r10 - out.a_gd_r10
    out["rest_diff"] = out.h_days_rest - out.a_days_rest
    out["congestion_diff"] = out.h_matches_last_14d - out.a_matches_last_14d

    # Nuevos diferenciales de 2ª generación
    out["xgd_diff_r5"] = out["h_xgd_r5"] - out["a_xgd_r5"]
    out["xgd_diff_r10"] = out["h_xgd_r10"] - out["a_xgd_r10"]
    out["xg_overperf_diff_r5"] = out["h_xg_overperf_r5"] - out["a_xg_overperf_r5"]
    out["form_pts_res_diff_r5"] = out["h_pts_res_r5"] - out["a_pts_res_r5"]
    out["form_gd_res_diff_r5"] = out["h_gd_res_r5"] - out["a_gd_res_r5"]
    out["sos_diff_r5"] = out["h_opp_elo_r5"] - out["a_opp_elo_r5"]
    out["venue_pts_diff_r5"] = out["h_venue_points_r5"] - out["a_venue_points_r5"]
    out["venue_gd_diff_r5"] = out["h_venue_gd_r5"] - out["a_venue_gd_r5"]
    out["venue_xgd_diff_r5"] = out["h_venue_xgd_r5"] - out["a_venue_xgd_r5"]
    out["has_shots_stats"] = (out["h_has_shots_r5"].fillna(0.0) > 0.0).astype(float)

    # Opta-proxies tácticos y quiebre de régimen estructural
    out = compute_regime_shift_features(out)
    out["xgot_diff_r5"] = out["h_xgot_r5"] - out["a_xgot_r5"]
    out["xgot_diff_r10"] = out["h_xgot_r10"] - out["a_xgot_r10"]
    out["field_tilt_diff_r10"] = out["h_field_tilt_r10"] - out["a_field_tilt_r10"]
    out["clinical_overperf_diff_r10"] = out["h_clinical_overperf_r10"] - out["a_clinical_overperf_r10"]

    # Diferenciales de 10 partidos, EWMA y probabilidades estructurales en espacio logit (v2.1)
    _eps = 1e-4
    out["dc_logit_h"] = np.log(np.clip(out["dc_prob_h"], _eps, 1.0 - _eps))
    out["dc_logit_d"] = np.log(np.clip(out["dc_prob_d"], _eps, 1.0 - _eps))
    out["dc_logit_a"] = np.log(np.clip(out["dc_prob_a"], _eps, 1.0 - _eps))
    out["elo_logit_h"] = np.log(
        np.clip(out["elo_prob_home_nodraw"], _eps, 1.0 - _eps)
        / np.clip(1.0 - out["elo_prob_home_nodraw"], _eps, 1.0 - _eps)
    )
    out["pts_res_diff_r10"] = out["h_pts_res_r10"] - out["a_pts_res_r10"]
    out["gd_res_diff_r10"] = out["h_gd_res_r10"] - out["a_gd_res_r10"]
    out["sos_diff_r10"] = out["h_opp_elo_r10"] - out["a_opp_elo_r10"]
    out["xgd_ewm5_diff"] = out["h_xgd_ewm5"] - out["a_xgd_ewm5"]
    out["pts_res_ewm5_diff"] = out["h_pts_res_ewm5"] - out["a_pts_res_ewm5"]
    out["gd_res_ewm5_diff"] = out["h_gd_res_ewm5"] - out["a_gd_res_ewm5"]
    out["sot_diff_r10"] = out["h_sot_r10"] - out["a_sot_r10"]
    out["corners_diff_r10"] = out["h_corners_r10"] - out["a_corners_r10"]

    # Geometría del empate y competitividad
    out["abs_elo_diff"] = np.abs(out["elo_diff"])
    out["elo_closeness"] = np.exp(-((out["elo_diff"] / 150.0) ** 2))
    out["low_scoring_tight_match"] = out["elo_closeness"] / np.maximum(1.5, out["dc_exp_total"])
    out["draw_rate_sum_r10"] = 0.5 * (out["h_draw_r10"].fillna(0.26) + out["a_draw_r10"].fillna(0.26))

    # Target y metadatos
    out["y"] = out.result.map({"H": 0, "D": 1, "A": 2}).astype("Int64")
    out["season_start"] = pd.to_numeric(out.season_start, errors="coerce").astype("Int64")
    out["goals_total"] = out.home_goals + out.away_goals
    out = out.sort_values(["div", "match_date", "match_id"], kind="mergesort").reset_index(drop=True)

    # Comprobación de leakage básica
    assert not np.allclose(out.elo_home, out.elo_home_post), "Elo sin actualización"
    assert out[["h_points_r5", "a_points_r5"]].notna().any().all(), "rolling vacío"

    os.makedirs(PROC, exist_ok=True)
    out.to_parquet(os.path.join(PROC, "features.parquet"), index=False)
    out.to_csv(os.path.join(PROC, "features.csv"), index=False)
    # Diccionario generado
    num = out.select_dtypes(include=[np.number]).columns
    desc = out[num].describe().T
    lines = [
        "# Diccionario de features (generado)",
        "",
        f"Generado: {datetime.now(timezone.utc).isoformat(timespec='seconds')}",
        f"Filas: {len(out):,} · Columnas: {len(out.columns)}",
        "",
        "Todas las ventanas usan `.shift(1)` por equipo: solo partidos estrictamente anteriores.",
        "",
        "| Feature | n | media | std | min | max |",
        "|---|---|---|---|---|---|",
    ]
    for c in num:
        r = desc.loc[c]
        lines.append(
            f"| `{c}` | {int(r['count']):,} | {r['mean']:.4f} | {r['std']:.4f} | "
            f"{r['min']:.4f} | {r['max']:.4f} |"
        )
    with open(os.path.join(ROOT, "reports", "A05_feature_dictionary.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print(f"features: {len(out):,} filas x {len(out.columns)} columnas")
    print("nulls por bloque:")
    print(
        out[["elo_diff", "pi_diff", "dc_prob_h", "h_points_r5", "h_xgd_r5", "h_days_rest", "home_prev_sot_pg"]]
        .isna()
        .mean()
        .round(4)
        .to_string()
    )
    print(f"escrito -> {os.path.join(PROC, 'features.parquet')}")


if __name__ == "__main__":
    main()
