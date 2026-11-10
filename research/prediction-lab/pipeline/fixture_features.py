#!/usr/bin/env python3
"""Ciclo 5 (v2) — Features de 1ª y 2ª generación para fixtures futuros desde el estado de los equipos.

Objetivo: cerrar el hueco "match_id -> features" sin reentrenar. Dado un fixture
(div, temporada, fecha, local, visitante) y el histórico, se calculan todas las features del
Motor A v2 con las mismas definiciones exactas que `features/build_features.py`.

Validación: para N partidos históricos se reconstruye su estado (solo partidos anteriores),
se calculan las features y se comparan con `features.parquet`. Si la paridad se cumple,
el mismo código sirve para fixtures futuros.

Uso:
    ./.venv/bin/python pipeline/fixture_features.py --validate 200
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys

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
    ROLL_COLS,
    add_advanced_ratings_chronological,
    build_long,
    elo_block,
    load_matches,
)
from ratings_advanced import DIV_INFO, _dixon_coles_1x2, _pi_expected_gd  # noqa: E402
from train_motor_a import FEATURES  # noqa: E402

PROC = os.path.join(ROOT, "data", "processed")
SEED = 20261109


def season_start_year(season: str) -> int:
    return int(str(season)[:4])


def build_state(matches: pd.DataFrame) -> dict:
    """Estado por equipo a partir de TODOS los partidos (se filtra por fecha al consultar)."""
    df = elo_block(matches, prefix="elo")
    df = add_advanced_ratings_chronological(df)
    long = build_long(df)

    # Añadir estados post-partido (Elo local, ClubElo, Pi-Rating y Ataque/Defensa) a `long`
    hp = df[
        [
            "match_id",
            "home_team",
            "elo_home_post",
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

    ewm_cols = ["points", "gf", "ga", "gd", "xgd", "pts_res", "gd_res"]
    ewm_df = g[ewm_cols].ewm(halflife=5, min_periods=1).mean().reset_index(level=0, drop=True)
    for col in ewm_cols:
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
    agg = agg.sort_values(["div", "team", "season"])
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
    ls = ls.sort_values(["div", "season"])
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
    for c in ("points", "gf", "ga", "gd", "xgd", "pts_res", "gd_res"):
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


def elo_for_fixture(state_row: dict, div: str, season: str) -> float:
    if state_row is None or state_row.get("elo_post") is None:
        return 1500.0
    r = state_row["elo_post"]
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

    f["form_pts_diff_r5"] = f["h_points_r5"] - f["a_points_r5"]
    f["form_gd_diff_r5"] = f["h_gd_r5"] - f["a_gd_r5"]
    f["form_gd_diff_r10"] = f["h_gd_r10"] - f["a_gd_r10"]
    f["rest_diff"] = f["h_days_rest"] - f["a_days_rest"]
    f["congestion_diff"] = f["h_matches_last_14d"] - f["a_matches_last_14d"]

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


def validate(n: int) -> dict:
    matches = load_matches()
    feats = pd.read_parquet(os.path.join(PROC, "features.parquet"))
    feats = feats[feats.y.notna()].copy()
    feats["match_date"] = pd.to_datetime(feats["match_date"])
    state = build_state(matches)
    sample = feats.sample(n=min(n, len(feats)), random_state=SEED)
    rows = []
    for r in sample.itertuples(index=False):
        f = features_for_fixture(state, r.div, r.season, r.match_date, r.home_team, r.away_team)
        expected = {k: getattr(r, k) for k in FEATURES}
        diffs = {}
        for k in FEATURES:
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
        print(json.dumps(out, indent=1, default=float)[:3000])
        path = os.path.join(ROOT, "artifacts", "fixture_features_validation.json")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(out, f, indent=1, default=float)
        print("escrito ->", path)
        return
    print("usa --validate N para validar contra features.parquet")


if __name__ == "__main__":
    main()
