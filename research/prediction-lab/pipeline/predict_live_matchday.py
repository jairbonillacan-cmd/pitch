#!/usr/bin/env python3
"""Fase 5 (A26) — Puente CLI `< 1 ms` de Inferencia en Tiempo Real (`PitchLab Spacetime Suite v3.0`).

Consume directamente los artefactos prospectivos generados por `.worktrees/web-scraping/scrapers/run_matchday_refresh.py`
(`live_matchups_edge_matrix.json` con `242` enfrentamientos activos en `11` ligas y `team_master_features.json`
con `376` equipos canónicos) y emite predicciones auditables y explicables con paridad IEEE-754 exacta
(`|Δ| < 1e-12`) frente a `src/domain/prediction/service.ts::predictLiveEdgeMatrix`.

Uso:
    ./.venv/Scripts/python.exe pipeline/predict_live_matchday.py
    ./.venv/Scripts/python.exe pipeline/predict_live_matchday.py --export-snapshot
    ./.venv/Scripts/python.exe pipeline/predict_live_matchday.py --league liga-mx
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT_PL = Path(__file__).resolve().parents[1]
REPO_ROOT = ROOT_PL.parents[1]
WS_ROOT = REPO_ROOT.parent / "web-scraping"
SRC_DATA_DIR = REPO_ROOT / "src" / "data" / "prediction"

sys.path.insert(0, str(ROOT_PL))
sys.path.insert(0, str(ROOT_PL / "pipeline"))
sys.path.insert(0, str(ROOT_PL / "models" / "b"))
sys.path.insert(0, str(ROOT_PL / "models" / "nfl"))
sys.path.insert(0, str(ROOT_PL / "models"))

from fixture_features import compute_lineup_availability_delta  # noqa: E402
from market_microstructure_v3 import (  # noqa: E402
    CODENAME_SINGULARITY_V3,
    apply_singularity_sharp_tilt_2way,
    apply_singularity_sharp_tilt_3way,
    debiase_recreational_liga_mx,
    devig_2way,
    devig_adaptive_1x2,
    evaluate_geodesic_v2_value_gate,
)
from live_context import apply_minkowski_v3_live_context  # noqa: E402
from multisport.train_multisport import predict_multisport  # noqa: E402

TACHYON_MODEL_NAME = "PitchLab Tachyon v3.0"
MINKOWSKI_MODEL_NAME = "PitchLab Minkowski v3.0"

SOCCER_LEAGUE_TO_DIV: dict[str, str] = {
    "liga-mx": "MEX",
    "epl": "E0",
    "laliga": "SP1",
    "bundesliga": "D1",
    "serie-a": "I1",
    "ligue-1": "F1",
}


def _slug_token(raw: Any) -> str:
    nfd = unicodedata.normalize("NFD", str(raw or ""))
    stripped = "".join(c for c in nfd if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", " ", stripped).strip()


def _clamp(v: float, lo: float, hi: float) -> float:
    return min(hi, max(lo, float(v)))


def _finite_or(v: Any, fallback: float) -> float:
    if v is None or isinstance(v, bool):
        return fallback
    try:
        f = float(v)
        return f if math.isfinite(f) else fallback
    except (TypeError, ValueError):
        return fallback


def _finite_or_none(v: Any) -> float | None:
    if v is None or isinstance(v, bool):
        return None
    try:
        f = float(v)
        return f if math.isfinite(f) else None
    except (TypeError, ValueError):
        return None


def _js_round(x: float) -> float:
    """Replica `Math.round(x)` de JavaScript (half towards +infinity)."""
    return float(math.floor(x + 0.5))


def _barometric_pressure_hpa(elev_m: float) -> float:
    h = max(0.0, float(elev_m))
    return 1013.25 * math.pow(1.0 - 2.25577e-5 * h, 5.25588)


def _dixon_coles_probs8(
    lam_home: float, lam_away: float, rho: float = -0.11
) -> tuple[float, float, float]:
    max_goals = 8
    p_h = [0.0] * (max_goals + 1)
    p_a = [0.0] * (max_goals + 1)
    p_h[0] = math.exp(-lam_home)
    p_a[0] = math.exp(-lam_away)
    for g in range(1, max_goals + 1):
        p_h[g] = (p_h[g - 1] * lam_home) / g
        p_a[g] = (p_a[g - 1] * lam_away) / g

    w_home = 0.0
    w_draw = 0.0
    w_away = 0.0
    for hg in range(max_goals + 1):
        for ag in range(max_goals + 1):
            tau = 1.0
            if hg == 0 and ag == 0:
                tau = 1.0 - lam_home * lam_away * rho
            elif hg == 0 and ag == 1:
                tau = 1.0 + lam_home * rho
            elif hg == 1 and ag == 0:
                tau = 1.0 + lam_away * rho
            elif hg == 1 and ag == 1:
                tau = 1.0 - rho
            w = max(0.0, tau) * p_h[hg] * p_a[ag]
            if hg > ag:
                w_home += w
            elif hg == ag:
                w_draw += w
            else:
                w_away += w
    tot = w_home + w_draw + w_away
    if not (tot > 0.0):
        return (0.44, 0.26, 0.30)
    return (w_home / tot, w_draw / tot, w_away / tot)


def _prob_logit(p: float) -> float:
    c = _clamp(p, 1e-6, 1.0 - 1e-6)
    return math.log(c / (1.0 - c))


def _softmax3(l0: float, l1: float, l2: float) -> tuple[float, float, float]:
    m = max(l0, l1, l2)
    e0 = math.exp(l0 - m)
    e1 = math.exp(l1 - m)
    e2 = math.exp(l2 - m)
    s = e0 + e1 + e2
    return (e0 / s, e1 / s, e2 / s)


def build_team_master_index(
    team_master: list[dict[str, Any]] | dict[str, Any],
    nfl_model: dict[str, Any] | None = None,
) -> dict[str, dict[str, Any]]:
    rows = team_master["records"] if isinstance(team_master, dict) else team_master
    by_league_slug: dict[str, dict[str, Any]] = {}
    by_sport_slug: dict[str, dict[str, Any]] = {}
    for r in rows:
        lg = str(r.get("league") or "").strip().lower()
        sp = str(r.get("sport") or "").strip().lower()
        s_name = _slug_token(r.get("team_name"))
        s_id = _slug_token(r.get("team_id"))
        if s_name:
            by_league_slug[f"{lg}::{s_name}"] = r
            by_sport_slug[f"{sp}::{s_name}"] = r
        if s_id:
            by_league_slug[f"{lg}::{s_id}"] = r
            by_sport_slug[f"{sp}::{s_id}"] = r

    nfl_slug_to_abbr: dict[str, str] = {}
    tlc = ((nfl_model or {}).get("live_v3") or {}).get("team_live_context") or {}
    for abbr, info in tlc.items():
        nfl_slug_to_abbr[_slug_token(abbr)] = abbr
        if isinstance(info, dict) and info.get("team_name"):
            nfl_slug_to_abbr[_slug_token(info["team_name"])] = abbr

    return {
        "by_league_slug": by_league_slug,
        "by_sport_slug": by_sport_slug,
        "nfl_slug_to_abbr": nfl_slug_to_abbr,
    }


def _lookup_team_master(
    index: dict[str, dict[str, Any]], sport_raw: str, league_raw: str, team_name: str
) -> dict[str, Any] | None:
    s = _slug_token(team_name)
    lg = str(league_raw or "").strip().lower()
    sp = str(sport_raw or "").strip().lower()
    return index["by_league_slug"].get(f"{lg}::{s}") or index["by_sport_slug"].get(f"{sp}::{s}")


def synthesize_football_snapshot_row(
    div: str,
    home_master: dict[str, Any] | None,
    away_master: dict[str, Any] | None,
    matchup: dict[str, Any],
    model: dict[str, Any],
) -> tuple[dict[str, Any], float, float]:
    ch = _finite_or((home_master or {}).get("club_elo_rating"), 1550.0)
    ca = _finite_or((away_master or {}).get("club_elo_rating"), 1550.0)
    elo_diff_no_hfa = ch - ca
    elo_diff = ch + 65.0 - ca
    elo_prob_home_nodraw = 1.0 / (1.0 + math.pow(10.0, -elo_diff / 400.0))
    elo_logit_h = _prob_logit(elo_prob_home_nodraw)
    elo_closeness = math.exp(-math.pow(elo_diff / 150.0, 2))
    season_progress = 0.35
    elo_diff_x_progress = elo_diff * season_progress

    gh = _clamp(_js_round(_finite_or((home_master or {}).get("xpts"), 20.0) / 1.38), 8.0, 38.0)
    ga = _clamp(_js_round(_finite_or((away_master or {}).get("xpts"), 20.0) / 1.38), 8.0, 38.0)

    h_xgf_pg = _finite_or((home_master or {}).get("xg_for"), 1.35 * gh) / gh
    h_xga_pg = _finite_or((home_master or {}).get("xg_against"), 1.25 * gh) / gh
    a_xgf_pg = _finite_or((away_master or {}).get("xg_for"), 1.30 * ga) / ga
    a_xga_pg = _finite_or((away_master or {}).get("xg_against"), 1.30 * ga) / ga

    h_xgd_pg = h_xgf_pg - h_xga_pg
    a_xgd_pg = a_xgf_pg - a_xga_pg
    xgd_diff = h_xgd_pg - a_xgd_pg

    h_xpts_pg = _finite_or((home_master or {}).get("xpts"), 1.38 * gh) / gh
    a_xpts_pg = _finite_or((away_master or {}).get("xpts"), 1.38 * ga) / ga
    xpts_diff = h_xpts_pg - a_xpts_pg

    h_xg_over_pg = _finite_or((home_master or {}).get("xg_overperformance"), 0.0) / gh
    a_xg_over_pg = _finite_or((away_master or {}).get("xg_overperformance"), 0.0) / ga
    xg_over_diff = h_xg_over_pg - a_xg_over_pg

    h_xpts_over_pg = _finite_or((home_master or {}).get("xpts_overperformance"), 0.0) / gh
    a_xpts_over_pg = _finite_or((away_master or {}).get("xpts_overperformance"), 0.0) / ga
    pts_minus_xpts_diff = h_xpts_over_pg - a_xpts_over_pg

    xg_elo_diff = elo_diff_no_hfa + 120.0 * xgd_diff
    xg_elo_vs_elo_diff = xg_elo_diff - elo_diff_no_hfa

    h_ppda = _finite_or_none((home_master or {}).get("ppda_avg"))
    a_ppda = _finite_or_none((away_master or {}).get("ppda_avg"))
    ppda_diff_r10 = (h_ppda - a_ppda) if (h_ppda is not None and a_ppda is not None) else 0.0

    h_deep = _finite_or_none((home_master or {}).get("deep_completions"))
    a_deep = _finite_or_none((away_master or {}).get("deep_completions"))
    deep_diff_r10 = (h_deep / gh - a_deep / ga) if (h_deep is not None and a_deep is not None) else 0.0

    dc_lam_home = _clamp(1.1 * math.sqrt(max(0.25, h_xgf_pg * a_xga_pg)), 0.35, 3.8)
    dc_lam_away = _clamp(0.92 * math.sqrt(max(0.25, a_xgf_pg * h_xga_pg)), 0.25, 3.5)
    dc_exp_total = dc_lam_home + dc_lam_away
    dc_exp_diff = dc_lam_home - dc_lam_away
    dc_prob_h, dc_prob_d, dc_prob_a = _dixon_coles_probs8(dc_lam_home, dc_lam_away, -0.11)
    dc_logit_h = _prob_logit(dc_prob_h)
    dc_logit_d = _prob_logit(dc_prob_d)
    dc_logit_a = _prob_logit(dc_prob_a)
    low_scoring_tight_match = elo_closeness / max(1.5, dc_exp_total)

    h_elev_src = matchup.get("home_stadium_elevation_m")
    if h_elev_src is None:
        h_elev_src = (home_master or {}).get("stadium_elevation_m")
    h_elev = _finite_or(h_elev_src, 100.0)
    a_elev = _finite_or(
        (away_master or {}).get("stadium_elevation_m"),
        h_elev - _finite_or(matchup.get("altitude_diff_m"), 0.0),
    )
    alt_diff_m = h_elev - a_elev
    alt_shock_flag = 1.0 if (h_elev >= 2100.0 and alt_diff_m >= 1000.0) else 0.0

    h_press_src = matchup.get("home_surface_pressure_hpa")
    if h_press_src is None:
        h_press_src = (home_master or {}).get("surface_pressure_hpa")
    h_press = _finite_or(h_press_src, _barometric_pressure_hpa(h_elev))
    a_press = _finite_or((away_master or {}).get("surface_pressure_hpa"), _barometric_pressure_hpa(a_elev))
    surf_press_diff = h_press - a_press

    has_real_xg = (
        1.0
        if (
            _finite_or_none((home_master or {}).get("xg_for")) is not None
            and _finite_or_none((away_master or {}).get("xg_for")) is not None
        )
        else 0.0
    )

    populated: dict[str, float] = {
        "elo_diff": elo_diff,
        "elo_diff_no_hfa": elo_diff_no_hfa,
        "elo_prob_home_nodraw": elo_prob_home_nodraw,
        "elo_diff_x_progress": elo_diff_x_progress,
        "season_progress": season_progress,
        "clubelo_diff": elo_diff_no_hfa,
        "att_strength_home": math.log(max(0.25, h_xgf_pg / 1.35)),
        "def_strength_home": math.log(max(0.25, h_xga_pg / 1.35)),
        "att_strength_away": math.log(max(0.25, a_xgf_pg / 1.35)),
        "def_strength_away": math.log(max(0.25, a_xga_pg / 1.35)),
        "dc_lam_home": dc_lam_home,
        "dc_lam_away": dc_lam_away,
        "dc_exp_total": dc_exp_total,
        "dc_exp_diff": dc_exp_diff,
        "dc_prob_h": dc_prob_h,
        "dc_prob_d": dc_prob_d,
        "dc_prob_a": dc_prob_a,
        "xgd_diff_r5": xgd_diff,
        "xgd_diff_r10": xgd_diff,
        "xgd_ewm5_diff": xgd_diff,
        "xg_overperf_diff_r5": xg_over_diff,
        "clinical_overperf_diff_r10": xg_over_diff,
        "elo_closeness": elo_closeness,
        "low_scoring_tight_match": low_scoring_tight_match,
        "dc_logit_h": dc_logit_h,
        "dc_logit_d": dc_logit_d,
        "dc_logit_a": dc_logit_a,
        "elo_logit_h": elo_logit_h,
        "has_real_xg_history": has_real_xg,
        "xg_elo_diff": xg_elo_diff,
        "xg_elo_vs_elo_diff": xg_elo_vs_elo_diff,
        "pts_minus_xpts_diff_r10": pts_minus_xpts_diff,
        "xpts_diff_r10": xpts_diff,
        "ppda_diff_r10": ppda_diff_r10,
        "deep_completions_diff_r10": deep_diff_r10,
        "altitude_diff_m": alt_diff_m,
        "altitude_shock_flag": alt_shock_flag,
        "surface_pressure_diff": surf_press_diff,
    }

    n_base = int(model["n_features_base"])
    base_features: list[float | None] = []
    for i in range(n_base):
        fname = model["features"][i]
        v = populated.get(fname)
        base_features.append(float(v) if (v is not None and math.isfinite(v)) else None)

    div_onehot = [1 if d == div else 0 for d in model["div_levels"]]
    return ({"div": div, "features": base_features, "div_onehot": div_onehot}, dc_exp_total, dc_exp_diff)


def _predict_motor_a_with_availability_py(
    row: dict[str, Any],
    model: dict[str, Any],
    availability_delta: float,
) -> tuple[float, float, float]:
    n_base = int(model["n_features_base"])
    stats = model["imputer"]["statistics"]
    mean = model["scaler"]["mean"]
    scale = model["scaler"]["scale"]

    design: list[float] = []
    for i in range(n_base):
        val = row["features"][i]
        v = float(stats[i]) if val is None else float(val)
        den = 1.0 if float(scale[i]) == 0.0 else float(scale[i])
        design.append((v - float(mean[i])) / den)
    for j, dv in enumerate(row["div_onehot"]):
        idx = n_base + j
        den = 1.0 if float(scale[idx]) == 0.0 else float(scale[idx])
        design.append((float(dv) - float(mean[idx])) / den)

    logits = [0.0, 0.0, 0.0]
    for k in range(3):
        coef_k = model["coef"][k]
        s = 0.0
        for i in range(len(design)):
            s += float(coef_k[i]) * design[i]
        logits[k] = s + float(model["intercept"][k])

    if math.isfinite(availability_delta) and availability_delta != 0.0:
        ls = ((model.get("prospective_availability_prior") or {}).get("logit_shift")) or {
            "home_multiplier": 0.5,
            "draw_multiplier": 0.0,
            "away_multiplier": -0.5,
        }
        logits[0] += float(ls["home_multiplier"]) * availability_delta
        logits[1] += float(ls["draw_multiplier"]) * availability_delta
        logits[2] += float(ls["away_multiplier"]) * availability_delta

    return _softmax3(logits[0], logits[1], logits[2])


def _predict_nfl_base_py(row: dict[str, Any], model: dict[str, Any]) -> tuple[float, float, float]:
    n = int(model["n_features"])
    mean = model["scaler"]["mean"]
    scale = model["scaler"]["scale"]
    design: list[float] = []
    for i in range(n):
        val = row["features"][i]
        v = float(mean[i]) if val is None else float(val)
        den = 1.0 if float(scale[i]) == 0.0 else float(scale[i])
        design.append((v - float(mean[i])) / den)

    logits = [0.0, 0.0, 0.0]
    for k in range(3):
        coef_k = model["coef"][k]
        s = 0.0
        for i in range(n):
            s += float(coef_k[i]) * design[i]
        logits[k] = s + float(model["intercept"][k])

    probs = _softmax3(logits[0], logits[1], logits[2])
    classes = list(model["classes"])
    return (probs[classes.index(0)], probs[classes.index(1)], probs[classes.index(2)])


def synthesize_nfl_snapshot_row(
    home_abbr: str,
    away_abbr: str,
    home_master: dict[str, Any] | None,
    away_master: dict[str, Any] | None,
    matchup: dict[str, Any],
    model: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    live_v3 = model.get("live_v3") or {}
    tlc_map = live_v3.get("team_live_context") or {}
    stad_map = live_v3.get("stadium_physics") or {}

    h_tlc = tlc_map.get(home_abbr) if home_abbr else None
    a_tlc = tlc_map.get(away_abbr) if away_abbr else None
    h_stad = stad_map.get(home_abbr) if home_abbr else None
    a_stad = stad_map.get(away_abbr) if away_abbr else None

    roof_src = (home_master or {}).get("roof_type")
    if roof_src is None and h_stad:
        roof_src = h_stad.get("roof_type")
    roof_raw = str(roof_src or "open").strip().lower()
    is_indoor = 1.0 if roof_raw in ("dome", "closed", "indoor", "retractable") else 0.0

    w_src = matchup.get("home_max_wind_speed_mph_7d")
    if w_src is None:
        w_src = (home_master or {}).get("max_wind_speed_mph_7d")
    if w_src is None and h_tlc:
        w_src = h_tlc.get("max_wind_speed_mph_7d")
    wind_mph = _finite_or(w_src, 0.0)

    p_src = (home_master or {}).get("total_precipitation_mm_7d")
    if p_src is None and h_tlc:
        p_src = h_tlc.get("total_precipitation_mm_7d")
    precip_mm = _finite_or(p_src, 0.0)

    wind_outdoor = 0.0 if is_indoor > 0.5 else max(0.0, wind_mph - 12.0)

    populated_nfl: dict[str, float] = {
        "is_indoor": is_indoor,
        "neutral_site": 0.0,
        "wind_outdoor": wind_outdoor,
        "cold_outdoor": 0.0,
    }
    feats: list[float | None] = []
    for fname in model["features"]:
        v = populated_nfl.get(fname)
        feats.append(float(v) if v is not None else None)

    he_src = matchup.get("home_stadium_elevation_m")
    if he_src is None:
        he_src = (home_master or {}).get("stadium_elevation_m")
    if he_src is None and h_stad:
        he_src = h_stad.get("stadium_elevation_m")
    h_elev = _finite_or(he_src, 100.0)

    ae_src = (away_master or {}).get("stadium_elevation_m")
    if ae_src is None and a_stad:
        ae_src = a_stad.get("stadium_elevation_m")
    a_elev = _finite_or(ae_src, h_elev - _finite_or(matchup.get("altitude_diff_m"), 0.0))

    def _pick2(a_val: Any, b_val: Any) -> float | None:
        res = _finite_or_none(a_val)
        return res if res is not None else _finite_or_none(b_val)

    live_ctx: dict[str, Any] = {
        "homeTeam": home_abbr,
        "awayTeam": away_abbr,
        "neutralSite": False,
        "roofType": roof_raw,
        "isDome": is_indoor > 0.5,
        "stadiumElevationM": h_elev,
        "awayElevationM": a_elev,
        "windMph": wind_mph,
        "precipitationMm": precip_mm,
        "homeOffEpaPerPlay": _pick2(
            (home_master or {}).get("nfl_off_epa_per_play"),
            (h_tlc or {}).get("off_epa_per_play"),
        ),
        "homeDefEpaPerPlay": _pick2(
            (home_master or {}).get("nfl_def_epa_per_play"),
            (h_tlc or {}).get("def_epa_per_play"),
        ),
        "awayOffEpaPerPlay": _pick2(
            (away_master or {}).get("nfl_off_epa_per_play"),
            (a_tlc or {}).get("off_epa_per_play"),
        ),
        "awayDefEpaPerPlay": _pick2(
            (away_master or {}).get("nfl_def_epa_per_play"),
            (a_tlc or {}).get("def_epa_per_play"),
        ),
        "homeOffSuccessPct": _pick2(
            (home_master or {}).get("nfl_off_success_pct"),
            (h_tlc or {}).get("off_success_pct"),
        ),
        "homeDefSuccessPct": _pick2(
            (home_master or {}).get("nfl_def_success_pct"),
            (h_tlc or {}).get("def_success_pct"),
        ),
        "awayOffSuccessPct": _pick2(
            (away_master or {}).get("nfl_off_success_pct"),
            (a_tlc or {}).get("off_success_pct"),
        ),
        "awayDefSuccessPct": _pick2(
            (away_master or {}).get("nfl_def_success_pct"),
            (a_tlc or {}).get("def_success_pct"),
        ),
        "homeQbInjured": _finite_or((h_tlc or {}).get("qb_injured"), 0.0),
        "awayQbInjured": _finite_or((a_tlc or {}).get("qb_injured"), 0.0),
        "homeInjuriesOutIr": _finite_or(
            (h_tlc or {}).get("injuries_out_ir")
            if (h_tlc or {}).get("injuries_out_ir") is not None
            else (home_master or {}).get("injured_players_count"),
            0.0,
        ),
        "awayInjuriesOutIr": _finite_or(
            (a_tlc or {}).get("injuries_out_ir")
            if (a_tlc or {}).get("injuries_out_ir") is not None
            else (away_master or {}).get("injured_players_count"),
            0.0,
        ),
        "homeInjuriesQuestionable": _finite_or((h_tlc or {}).get("injuries_questionable"), 0.0),
        "awayInjuriesQuestionable": _finite_or((a_tlc or {}).get("injuries_questionable"), 0.0),
        "homePenaltiesPerGame": _finite_or_none((h_tlc or {}).get("penalties_per_game")),
        "awayPenaltiesPerGame": _finite_or_none((a_tlc or {}).get("penalties_per_game")),
    }

    return (
        {
            "home_team": home_abbr or matchup.get("home_team"),
            "away_team": away_abbr or matchup.get("away_team"),
            "features": feats,
        },
        live_ctx,
    )


def _resolve_rlm_side(matchup: dict[str, Any]) -> str:
    explicit = matchup.get("reverse_line_movement_side")
    if explicit in ("home", "away", "none"):
        return str(explicit)
    sharp = _finite_or_none(matchup.get("sharp_money_divergence"))
    if sharp is None:
        return "none"
    if sharp >= 12.0:
        return "home"
    if sharp <= -12.0:
        return "away"
    return "none"


def _reconstruct_execution_odds(
    probs_novig: list[float],
    market_overround: float,
    explicit_odds: list[float] | None = None,
) -> list[float]:
    if (
        isinstance(explicit_odds, list)
        and len(explicit_odds) == len(probs_novig)
        and all(_finite_or_none(o) is not None and float(o) > 1.0 for o in explicit_odds)
    ):
        return [float(o) for o in explicit_odds]
    eff_ov = _clamp(market_overround if math.isfinite(market_overround) else 0.04, 0.0, 0.19)
    sum_implied = 1.0 + eff_ov
    out: list[float] = []
    for p in probs_novig:
        q = _clamp(p * sum_implied, 0.005, 0.99)
        out.append(max(1.01, 1.0 / q))
    return out


def predict_live_matchup(
    matchup: dict[str, Any],
    team_index: dict[str, dict[str, Any]],
    artifacts: dict[str, Any],
) -> dict[str, Any]:
    league = str(matchup.get("league") or "").strip().lower()
    sport_raw = str(matchup.get("sport") or "").strip().lower()

    home_master = _lookup_team_master(team_index, sport_raw, league, matchup["home_team"])
    away_master = _lookup_team_master(team_index, sport_raw, league, matchup["away_team"])

    sharp_div = _finite_or_none(matchup.get("sharp_money_divergence"))
    smarkets_home = _finite_or_none(matchup.get("smarkets_exchange_mid_prob_home"))
    raw_overround = _finite_or(matchup.get("market_overround"), 0.045)
    rlm_side = _resolve_rlm_side(matchup)
    mkt_srcs = matchup.get("market_sources")
    primary_book = str(mkt_srcs[0]) if isinstance(mkt_srcs, list) and len(mkt_srcs) > 0 else ""

    # 1. Fútbol / Soccer
    if sport_raw in ("soccer", "football_soccer") or league in SOCCER_LEAGUE_TO_DIV:
        div = SOCCER_LEAGUE_TO_DIV.get(league, "E0")
        fb_model = artifacts["footballModel"]
        synth_row, dc_exp_total, dc_exp_diff = synthesize_football_snapshot_row(
            div, home_master, away_master, matchup, fb_model
        )
        active_row = (artifacts.get("precomputedFootballRows") or {}).get(
            matchup["matchup_id"], synth_row
        )
        avail = compute_lineup_availability_delta(
            home_master,
            away_master,
            fb_model.get("prospective_availability_prior"),
        )
        avail_delta = float(avail["lineup_availability_delta"])
        ph, pd, pa = _predict_motor_a_with_availability_py(active_row, fb_model, avail_delta)
        sports_probs = {"pHome": ph, "pDraw": pd, "pAway": pa}

        he_src = matchup.get("home_stadium_elevation_m")
        if he_src is None:
            he_src = (home_master or {}).get("stadium_elevation_m")
        h_elev_drv = _finite_or(he_src, 100.0)
        drivers = [
            {
                "factor": "clubelo_and_xg_elo",
                "label": "ClubElo + Real xG-Elo Structural Differential",
                "impactLogit": (
                    _finite_or((home_master or {}).get("club_elo_rating"), 1550.0)
                    + 65.0
                    - _finite_or((away_master or {}).get("club_elo_rating"), 1550.0)
                )
                / 400.0,
            },
            {
                "factor": "lineup_availability_delta",
                "label": "Transfermarkt + RotoWire Prospective Availability Prior",
                "impactLogit": avail_delta,
            },
            {
                "factor": "stadium_altitude_physics",
                "label": "Open-Meteo Stadium Elevation & Barometric Pressure",
                "impactLogit": (
                    0.08 * max(0.0, _finite_or(matchup.get("altitude_diff_m"), 0.0) / 1000.0)
                    if h_elev_drv >= 2100.0
                    else 0.0
                ),
            },
        ]

        ph_nv = _finite_or_none(matchup.get("p_home_novig"))
        pd_nv = _finite_or_none(matchup.get("p_draw_novig"))
        pa_nv = _finite_or_none(matchup.get("p_away_novig"))

        if (
            ph_nv is not None
            and pd_nv is not None
            and pa_nv is not None
            and ph_nv > 0.0
            and pd_nv > 0.0
            and pa_nv > 0.0
        ):
            exec_odds = _reconstruct_execution_odds(
                [ph_nv, pd_nv, pa_nv], raw_overround, matchup.get("odds")
            )
            adaptive = devig_adaptive_1x2(exec_odds)
            mkt_probs = [adaptive["pHome"], adaptive["pDraw"], adaptive["pAway"]]
            mx_adj = False
            if league == "liga-mx":
                deb = debiase_recreational_liga_mx(
                    mkt_probs,
                    {
                        "homeTeam": matchup["home_team"],
                        "awayTeam": matchup["away_team"],
                        "overround": adaptive["overround"],
                        "bookmaker": primary_book,
                    },
                )
                mkt_probs = [deb["pHome"], deb["pDraw"], deb["pAway"]]
                mx_adj = bool(deb["biasDetected"])

            sing = apply_singularity_sharp_tilt_3way(
                {
                    "modelProbs": [ph, pd, pa],
                    "marketProbs": mkt_probs,
                    "marketOverround": adaptive["overround"],
                    "smarketsExchangeMidProbHome": smarkets_home,
                    "sharpMoneyDivergenceHomePct": sharp_div,
                    "reverseLineMovementSide": rlm_side,
                }
            )
            geodesic = evaluate_geodesic_v2_value_gate(
                {
                    "probs": [sing["pHome"], sing["pDraw"], sing["pAway"]],
                    "odds": exec_odds,
                    "marketProbs": mkt_probs,
                    "reverseLineMovementSide": rlm_side,
                    "sharpMoneyDivergenceHomePct": sharp_div,
                }
            )
            return {
                "matchupId": matchup["matchup_id"],
                "sport": "football",
                "league": league,
                "homeTeam": matchup["home_team"],
                "awayTeam": matchup["away_team"],
                "marketType": "3way",
                "sportsModelName": TACHYON_MODEL_NAME,
                "activeModelName": CODENAME_SINGULARITY_V3,
                "activeEngine": "singularity_v3",
                "sportsProbs": sports_probs,
                "marketProbsAdaptive": {
                    "pHome": mkt_probs[0],
                    "pDraw": mkt_probs[1],
                    "pAway": mkt_probs[2],
                    "overround": adaptive["overround"],
                    "ligaMxBiasAdjusted": mx_adj,
                },
                "finalProbs": {
                    "pHome": sing["pHome"],
                    "pDraw": sing["pDraw"],
                    "pAway": sing["pAway"],
                },
                "expectedTotal": dc_exp_total,
                "expectedMargin": dc_exp_diff,
                "lineupAvailabilityDelta": avail_delta,
                "sharpLogitTilt": sing["sharpLogitTilt"],
                "effectiveMarketAlpha": sing["effectiveMarketAlpha"],
                "geodesicV2": geodesic,
                "drivers": drivers,
            }

        if smarkets_home is not None and 0.01 < smarkets_home < 0.98:
            sing_ex = apply_singularity_sharp_tilt_3way(
                {
                    "modelProbs": [ph, pd, pa],
                    "marketProbs": [ph, pd, pa],
                    "baseMarketAlpha": 0.25,
                    "smarketsExchangeMidProbHome": smarkets_home,
                    "sharpMoneyDivergenceHomePct": sharp_div,
                    "reverseLineMovementSide": rlm_side,
                }
            )
            return {
                "matchupId": matchup["matchup_id"],
                "sport": "football",
                "league": league,
                "homeTeam": matchup["home_team"],
                "awayTeam": matchup["away_team"],
                "marketType": "3way",
                "sportsModelName": TACHYON_MODEL_NAME,
                "activeModelName": CODENAME_SINGULARITY_V3,
                "activeEngine": "smarkets_anchor_v3",
                "sportsProbs": sports_probs,
                "marketProbsAdaptive": None,
                "finalProbs": {
                    "pHome": sing_ex["pHome"],
                    "pDraw": sing_ex["pDraw"],
                    "pAway": sing_ex["pAway"],
                },
                "expectedTotal": dc_exp_total,
                "expectedMargin": dc_exp_diff,
                "lineupAvailabilityDelta": avail_delta,
                "sharpLogitTilt": sing_ex["sharpLogitTilt"],
                "effectiveMarketAlpha": sing_ex["effectiveMarketAlpha"],
                "geodesicV2": None,
                "drivers": drivers,
            }

        return {
            "matchupId": matchup["matchup_id"],
            "sport": "football",
            "league": league,
            "homeTeam": matchup["home_team"],
            "awayTeam": matchup["away_team"],
            "marketType": "3way",
            "sportsModelName": TACHYON_MODEL_NAME,
            "activeModelName": TACHYON_MODEL_NAME,
            "activeEngine": "sports_only",
            "sportsProbs": sports_probs,
            "marketProbsAdaptive": None,
            "finalProbs": sports_probs,
            "expectedTotal": dc_exp_total,
            "expectedMargin": dc_exp_diff,
            "lineupAvailabilityDelta": avail_delta,
            "sharpLogitTilt": 0.0,
            "effectiveMarketAlpha": None,
            "geodesicV2": None,
            "drivers": drivers,
        }

    # 2. NFL
    if league == "nfl":
        nfl_model = artifacts["nflModel"]
        home_abbr = team_index["nfl_slug_to_abbr"].get(_slug_token(matchup["home_team"]), "")
        away_abbr = team_index["nfl_slug_to_abbr"].get(_slug_token(matchup["away_team"]), "")
        synth_nfl, live_ctx = synthesize_nfl_snapshot_row(
            home_abbr, away_abbr, home_master, away_master, matchup, nfl_model
        )
        active_row = (artifacts.get("precomputedNflRows") or {}).get(
            matchup["matchup_id"], synth_nfl
        )
        b_ph, b_pd, b_pa = _predict_nfl_base_py(active_row, nfl_model)
        lv3 = nfl_model.get("live_v3") or {}
        live_nfl = apply_minkowski_v3_live_context(
            {"pHome": b_ph, "pDraw": b_pd, "pAway": b_pa},
            context=live_ctx,
            priors=lv3.get("priors"),
            referee_crews=lv3.get("referee_crews"),
            stadiums=lv3.get("stadium_physics"),
        )
        s2 = float(live_nfl["pHome"]) + float(live_nfl["pAway"])
        sports_h2 = float(live_nfl["pHome"]) / s2 if s2 > 0.0 else 0.5
        sports_a2 = 1.0 - sports_h2
        exp_margin_nfl = (
            13.5
            * math.log(_clamp(sports_h2, 1e-6, 1.0 - 1e-6) / _clamp(sports_a2, 1e-6, 1.0 - 1e-6))
            * 0.42
        )
        drivers = [
            {
                "factor": d["factor"],
                "label": d["label"],
                "impactLogit": float(d["impactLogit"]),
            }
            for d in live_nfl["delta"]["drivers"]
        ]

        ph_nv = _finite_or_none(matchup.get("p_home_novig"))
        pa_nv = _finite_or_none(matchup.get("p_away_novig"))
        if ph_nv is not None and pa_nv is not None and ph_nv > 0.0 and pa_nv > 0.0:
            sum_m2 = ph_nv + pa_nv
            exec_odds = _reconstruct_execution_odds(
                [ph_nv / sum_m2, pa_nv / sum_m2], raw_overround, matchup.get("odds")
            )
            adaptive2 = devig_2way(exec_odds[0], exec_odds[1], "adaptive")
            sing2 = apply_singularity_sharp_tilt_2way(
                {
                    "modelProbs": [sports_h2, sports_a2],
                    "marketProbs": [adaptive2["pHome"], adaptive2["pAway"]],
                    "marketOverround": adaptive2["overround"],
                    "smarketsExchangeMidProbHome": smarkets_home,
                    "sharpMoneyDivergenceHomePct": sharp_div,
                    "reverseLineMovementSide": rlm_side,
                }
            )
            geodesic2 = evaluate_geodesic_v2_value_gate(
                {
                    "probs": [sing2["pHome"], sing2["pAway"]],
                    "odds": exec_odds,
                    "marketProbs": [adaptive2["pHome"], adaptive2["pAway"]],
                    "reverseLineMovementSide": rlm_side,
                    "sharpMoneyDivergenceHomePct": sharp_div,
                }
            )
            return {
                "matchupId": matchup["matchup_id"],
                "sport": "nfl",
                "league": "nfl",
                "homeTeam": matchup["home_team"],
                "awayTeam": matchup["away_team"],
                "marketType": "2way",
                "sportsModelName": MINKOWSKI_MODEL_NAME,
                "activeModelName": CODENAME_SINGULARITY_V3,
                "activeEngine": "singularity_v3",
                "sportsProbs": {"pHome": sports_h2, "pDraw": 0.0, "pAway": sports_a2},
                "marketProbsAdaptive": {
                    "pHome": adaptive2["pHome"],
                    "pDraw": 0.0,
                    "pAway": adaptive2["pAway"],
                    "overround": adaptive2["overround"],
                    "ligaMxBiasAdjusted": False,
                },
                "finalProbs": {"pHome": sing2["pHome"], "pDraw": 0.0, "pAway": sing2["pAway"]},
                "expectedTotal": float(live_nfl["expectedTotalPoints"]),
                "expectedMargin": exp_margin_nfl,
                "lineupAvailabilityDelta": float(live_nfl["delta"]["injuryLogitDelta"]),
                "sharpLogitTilt": sing2["sharpLogitTilt"],
                "effectiveMarketAlpha": sing2["effectiveMarketAlpha"],
                "geodesicV2": geodesic2,
                "drivers": drivers,
            }

        return {
            "matchupId": matchup["matchup_id"],
            "sport": "nfl",
            "league": "nfl",
            "homeTeam": matchup["home_team"],
            "awayTeam": matchup["away_team"],
            "marketType": "2way",
            "sportsModelName": MINKOWSKI_MODEL_NAME,
            "activeModelName": MINKOWSKI_MODEL_NAME,
            "activeEngine": "sports_only",
            "sportsProbs": {"pHome": sports_h2, "pDraw": 0.0, "pAway": sports_a2},
            "marketProbsAdaptive": None,
            "finalProbs": {"pHome": sports_h2, "pDraw": 0.0, "pAway": sports_a2},
            "expectedTotal": float(live_nfl["expectedTotalPoints"]),
            "expectedMargin": exp_margin_nfl,
            "lineupAvailabilityDelta": float(live_nfl["delta"]["injuryLogitDelta"]),
            "sharpLogitTilt": 0.0,
            "effectiveMarketAlpha": None,
            "geodesicV2": None,
            "drivers": drivers,
        }

    # 3. Multi-Sport (NHL, MLB, NBA, NCAAF)
    if league in ("nhl", "mlb", "nba", "ncaaf"):
        ms_sport = league
    elif sport_raw == "hockey":
        ms_sport = "nhl"
    elif sport_raw == "baseball":
        ms_sport = "mlb"
    elif sport_raw == "basketball":
        ms_sport = "nba"
    else:
        ms_sport = "ncaaf"

    roof_type = str((home_master or {}).get("roof_type") or "").strip().lower()
    if roof_type in ("dome", "closed", "indoor", "indoor_arena"):
        is_dome_opt: bool | None = True
    elif roof_type == "open":
        is_dome_opt = False
    else:
        is_dome_opt = None

    if roof_type in ("open", "retractable"):
        roof_open_opt: bool | None = True
    elif is_dome_opt is True:
        roof_open_opt = False
    else:
        roof_open_opt = None

    he_src = matchup.get("home_stadium_elevation_m")
    if he_src is None:
        he_src = (home_master or {}).get("stadium_elevation_m")
    hp_src = matchup.get("home_surface_pressure_hpa")
    if hp_src is None:
        hp_src = (home_master or {}).get("surface_pressure_hpa")
    hw_src = matchup.get("home_max_wind_speed_mph_7d")
    if hw_src is None:
        hw_src = (home_master or {}).get("max_wind_speed_mph_7d")

    ms_input: dict[str, Any] = {
        "homeTeam": matchup["home_team"],
        "awayTeam": matchup["away_team"],
        "neutralSite": False,
        "isDome": is_dome_opt,
        "roofOpen": roof_open_opt,
        "stadiumElevationM": _finite_or_none(he_src),
        "awayElevationM": _finite_or_none((away_master or {}).get("stadium_elevation_m")),
        "surfacePressureHpa": _finite_or_none(hp_src),
        "windMph": _finite_or_none(hw_src),
        "precipitationMm": _finite_or_none((home_master or {}).get("total_precipitation_mm_7d")),
        "homeInjuriesOut": _finite_or_none((home_master or {}).get("injured_players_count")),
        "awayInjuriesOut": _finite_or_none((away_master or {}).get("injured_players_count")),
    }

    ms_pred = predict_multisport(ms_sport, ms_input, artifacts["multisportModel"])
    sports_probs2 = {"pHome": float(ms_pred["pHome"]), "pDraw": 0.0, "pAway": float(ms_pred["pAway"])}

    if ms_sport == "nhl":
        expected_total = float(ms_pred["expectedTotalGoals"])
        expected_margin = float(ms_pred["expectedGoalsHome"]) - float(ms_pred["expectedGoalsAway"])
    elif ms_sport == "mlb":
        expected_total = float(ms_pred["expectedTotalRuns"])
        expected_margin = float(ms_pred["expectedRunMargin"])
    else:
        expected_total = float(ms_pred["expectedTotalPoints"])
        expected_margin = float(ms_pred["expectedMargin"])

    drivers = [
        {
            "factor": d["factor"],
            "label": d["label"],
            "impactLogit": float(d["impactLogit"]),
        }
        for d in ms_pred["drivers"]
    ]

    ph_nv = _finite_or_none(matchup.get("p_home_novig"))
    pa_nv = _finite_or_none(matchup.get("p_away_novig"))
    if ph_nv is not None and pa_nv is not None and ph_nv > 0.0 and pa_nv > 0.0:
        sum_m2 = ph_nv + pa_nv
        exec_odds = _reconstruct_execution_odds(
            [ph_nv / sum_m2, pa_nv / sum_m2], raw_overround, matchup.get("odds")
        )
        adaptive2 = devig_2way(exec_odds[0], exec_odds[1], "adaptive")
        sing2 = apply_singularity_sharp_tilt_2way(
            {
                "modelProbs": [sports_probs2["pHome"], sports_probs2["pAway"]],
                "marketProbs": [adaptive2["pHome"], adaptive2["pAway"]],
                "marketOverround": adaptive2["overround"],
                "smarketsExchangeMidProbHome": smarkets_home,
                "sharpMoneyDivergenceHomePct": sharp_div,
                "reverseLineMovementSide": rlm_side,
            }
        )
        geodesic2 = evaluate_geodesic_v2_value_gate(
            {
                "probs": [sing2["pHome"], sing2["pAway"]],
                "odds": exec_odds,
                "marketProbs": [adaptive2["pHome"], adaptive2["pAway"]],
                "reverseLineMovementSide": rlm_side,
                "sharpMoneyDivergenceHomePct": sharp_div,
            }
        )
        return {
            "matchupId": matchup["matchup_id"],
            "sport": ms_sport,
            "league": league,
            "homeTeam": matchup["home_team"],
            "awayTeam": matchup["away_team"],
            "marketType": "2way",
            "sportsModelName": str(ms_pred["modelId"]),
            "activeModelName": CODENAME_SINGULARITY_V3,
            "activeEngine": "singularity_v3",
            "sportsProbs": sports_probs2,
            "marketProbsAdaptive": {
                "pHome": adaptive2["pHome"],
                "pDraw": 0.0,
                "pAway": adaptive2["pAway"],
                "overround": adaptive2["overround"],
                "ligaMxBiasAdjusted": False,
            },
            "finalProbs": {"pHome": sing2["pHome"], "pDraw": 0.0, "pAway": sing2["pAway"]},
            "expectedTotal": expected_total,
            "expectedMargin": expected_margin,
            "lineupAvailabilityDelta": None,
            "sharpLogitTilt": sing2["sharpLogitTilt"],
            "effectiveMarketAlpha": sing2["effectiveMarketAlpha"],
            "geodesicV2": geodesic2,
            "drivers": drivers,
        }

    return {
        "matchupId": matchup["matchup_id"],
        "sport": ms_sport,
        "league": league,
        "homeTeam": matchup["home_team"],
        "awayTeam": matchup["away_team"],
        "marketType": "2way",
        "sportsModelName": str(ms_pred["modelId"]),
        "activeModelName": str(ms_pred["modelId"]),
        "activeEngine": "sports_only",
        "sportsProbs": sports_probs2,
        "marketProbsAdaptive": None,
        "finalProbs": sports_probs2,
        "expectedTotal": expected_total,
        "expectedMargin": expected_margin,
        "lineupAvailabilityDelta": None,
        "sharpLogitTilt": 0.0,
        "effectiveMarketAlpha": None,
        "geodesicV2": None,
        "drivers": drivers,
    }


def predict_live_edge_matrix(
    edge_matrix: list[dict[str, Any]] | dict[str, Any],
    team_master: list[dict[str, Any]] | dict[str, Any],
    artifacts: dict[str, Any],
) -> dict[str, Any]:
    rows = edge_matrix["records"] if isinstance(edge_matrix, dict) else edge_matrix
    team_index = build_team_master_index(team_master, artifacts["nflModel"])

    counts_by_league: dict[str, int] = {}
    exec_bets = 0
    vetoed = 0
    confirmed = 0
    predictions: list[dict[str, Any]] = []

    for rec in rows:
        pred = predict_live_matchup(rec, team_index, artifacts)
        predictions.append(pred)
        lg = pred["league"]
        counts_by_league[lg] = counts_by_league.get(lg, 0) + 1
        geo = pred["geodesicV2"]
        if geo is not None:
            if float(geo["recommendedStake"]) > 0.0:
                exec_bets += 1
            if bool(geo["vetoedByRlm"]):
                vetoed += 1
            if bool(geo["institutionalConfirmation"]):
                confirmed += 1

    return {
        "count": len(predictions),
        "countsByLeague": counts_by_league,
        "executableBetsCount": exec_bets,
        "vetoedByRlmCount": vetoed,
        "institutionallyConfirmedCount": confirmed,
        "predictions": predictions,
    }


def load_default_artifacts() -> dict[str, Any]:
    with open(SRC_DATA_DIR / "model_motor_a.json", encoding="utf-8") as f:
        fb_model = json.load(f)
    with open(SRC_DATA_DIR / "model_nfl.json", encoding="utf-8") as f:
        nfl_model = json.load(f)
    with open(SRC_DATA_DIR / "model_multisport.json", encoding="utf-8") as f:
        ms_model = json.load(f)
    return {
        "footballModel": fb_model,
        "nflModel": nfl_model,
        "multisportModel": ms_model,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="PitchLab Spacetime Suite v3.0 — Live Matchday Inference")
    ap.add_argument(
        "--edge-matrix",
        default=str(WS_ROOT / "data" / "feature_store" / "live_matchups_edge_matrix.json"),
    )
    ap.add_argument(
        "--team-master",
        default=str(WS_ROOT / "data" / "feature_store" / "team_master_features.json"),
    )
    ap.add_argument("--league", default="", help="Filtrar salida por liga (ej. liga-mx, epl, nfl, nhl, nba, ncaaf)")
    ap.add_argument(
        "--export-snapshot",
        action="store_true",
        help="Exporta `src/data/prediction/live_matchday_v3_snapshot.json` para paridad Vitest.",
    )
    args = ap.parse_args()

    with open(args.edge_matrix, encoding="utf-8") as f:
        edge_matrix = json.load(f)
    with open(args.team_master, encoding="utf-8") as f:
        team_master = json.load(f)
    artifacts = load_default_artifacts()

    t0 = time.perf_counter()
    batch = predict_live_edge_matrix(edge_matrix, team_master, artifacts)
    elapsed_ms = (time.perf_counter() - t0) * 1000.0
    avg_ms = elapsed_ms / max(1, batch["count"])

    print(
        f"[Spacetime Suite v3.0 Live] {batch['count']} matchups en {len(batch['countsByLeague'])} ligas "
        f"| {elapsed_ms:.2f} ms total ({avg_ms:.4f} ms/matchup)"
    )
    print(
        f"  Geodesic v2.0 -> ejecutables: {batch['executableBetsCount']} | "
        f"confirmación institucional: {batch['institutionallyConfirmedCount']} | "
        f"bloqueadas Anti-RLM: {batch['vetoedByRlmCount']}"
    )
    print(f"  Conteo por liga: {batch['countsByLeague']}")

    if args.league:
        lg_f = args.league.strip().lower()
        sub = [p for p in batch["predictions"] if p["league"] == lg_f]
        for p in sub[:15]:
            fp = p["finalProbs"]
            print(
                f"  [{p['league']}] {p['homeTeam']} vs {p['awayTeam']} -> "
                f"H={fp['pHome']:.3f} D={fp['pDraw']:.3f} A={fp['pAway']:.3f} "
                f"({p['activeEngine']})"
            )

    if args.export_snapshot:
        snap_out = {
            "schema_version": "3.0.0",
            "suite_codename": "PitchLab Spacetime Suite v3.0",
            "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "n_matchups": batch["count"],
            "n_teams": len(team_master["records"] if isinstance(team_master, dict) else team_master),
            "python_total_latency_ms": round(elapsed_ms, 4),
            "python_avg_latency_ms": round(avg_ms, 6),
            "counts_by_league": batch["countsByLeague"],
            "executable_bets_count": batch["executableBetsCount"],
            "vetoed_by_rlm_count": batch["vetoedByRlmCount"],
            "institutionally_confirmed_count": batch["institutionallyConfirmedCount"],
            "edge_matrix_records": edge_matrix["records"] if isinstance(edge_matrix, dict) else edge_matrix,
            "team_master_records": team_master["records"] if isinstance(team_master, dict) else team_master,
            "expected_predictions": batch["predictions"],
        }
        out_path = SRC_DATA_DIR / "live_matchday_v3_snapshot.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(snap_out, f, ensure_ascii=False, indent=2)
        print(f"  Snapshot exportado -> {out_path}")


if __name__ == "__main__":
    main()
