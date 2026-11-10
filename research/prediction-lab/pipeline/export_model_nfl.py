#!/usr/bin/env python3
"""Exporta `PitchLab Minkowski v3.0` (NFL) y su snapshot de validación + casos live.

Integra:
  1. Base histórica multinomial 3-way (`H`, `T`, `A`) con invariante físico de altitud
     (`apply_venue_physics_hfa`, `alt_elo=18.0`) sobre las 29 features canónicas.
  2. Bloque prospectivo Bayesiano `live_v3` (`SumerSports EPA/Success%`, `Ourlads + Official Injuries`,
     `NFLPenalties` 54 registros de cuadrillas arbitrales / disciplina por equipo, y `Open-Meteo`
     clima + física de los 32 estadios).
  3. Snapshot `src/data/prediction/nfl_snapshot.json` con:
     - `rows`: 200 partidos de 2025 para el contrato `tests/prediction/nfl.test.ts` (`|Δ| <= 1e-11`).
     - `live_v3_cases`: 40 casos dorados prospectivos para verificar `src/domain/prediction/nfl_live.ts`
       con `|Δ| < 1e-12`.

Uso:
    ./.venv/Scripts/python.exe pipeline/export_model_nfl.py
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
WORKTREE_ROOT = ROOT.parents[1]
WEB_SCRAPING_ROOT = WORKTREE_ROOT.parent / "web-scraping"
NFL = ROOT / "models" / "nfl"
if str(NFL) not in sys.path:
    sys.path.insert(0, str(NFL))
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from features import NFL_STADIUM_ELEVATION_M, NUMERIC_FEATURES  # noqa: E402,F401
from live_context import (  # noqa: E402
    MINKOWSKI_V3_DEFAULT_PRIORS,
    MINKOWSKI_V3_MODEL_ID,
    apply_minkowski_v3_live_context,
    compute_nfl_live_context_delta,
)
from models import design_columns, fit_logit, make_design, predict_proba_3  # noqa: E402

SEED = 20261109

NFL_CITY_NICKNAME_TO_ABBR: dict[str, str] = {
    "arizona": "ARI", "cardinals": "ARI", "arz": "ARI", "ari": "ARI",
    "atlanta": "ATL", "falcons": "ATL", "atl": "ATL",
    "baltimore": "BAL", "ravens": "BAL", "bal": "BAL",
    "buffalo": "BUF", "bills": "BUF", "buf": "BUF",
    "carolina": "CAR", "panthers": "CAR", "car": "CAR",
    "chicago": "CHI", "bears": "CHI", "chi": "CHI",
    "cincinnati": "CIN", "bengals": "CIN", "cin": "CIN",
    "cleveland": "CLE", "browns": "CLE", "cle": "CLE",
    "dallas": "DAL", "cowboys": "DAL", "dal": "DAL",
    "denver": "DEN", "broncos": "DEN", "den": "DEN",
    "detroit": "DET", "lions": "DET", "det": "DET",
    "green bay": "GB", "packers": "GB", "gb": "GB", "gnb": "GB",
    "houston": "HOU", "texans": "HOU", "hou": "HOU",
    "indianapolis": "IND", "colts": "IND", "ind": "IND",
    "jacksonville": "JAX", "jaguars": "JAX", "jax": "JAX", "jac": "JAX",
    "kansas city": "KC", "chiefs": "KC", "kc": "KC", "kan": "KC",
    "las vegas": "LV", "raiders": "LV", "lv": "LV", "lvr": "LV", "oak": "LV",
    "la chargers": "LAC", "los angeles chargers": "LAC", "chargers": "LAC", "lac": "LAC",
    "la rams": "LA", "los angeles rams": "LA", "rams": "LA", "lar": "LA", "la": "LA",
    "miami": "MIA", "dolphins": "MIA", "mia": "MIA",
    "minnesota": "MIN", "vikings": "MIN", "min": "MIN",
    "new england": "NE", "patriots": "NE", "ne": "NE", "nwe": "NE",
    "new orleans": "NO", "saints": "NO", "no": "NO", "nor": "NO",
    "ny giants": "NYG", "new york giants": "NYG", "giants": "NYG", "nyg": "NYG",
    "ny jets": "NYJ", "new york jets": "NYJ", "jets": "NYJ", "nyj": "NYJ",
    "philadelphia": "PHI", "eagles": "PHI", "phi": "PHI",
    "pittsburgh": "PIT", "steelers": "PIT", "pit": "PIT",
    "san francisco": "SF", "49ers": "SF", "sf": "SF", "sfo": "SF",
    "seattle": "SEA", "seahawks": "SEA", "sea": "SEA",
    "tampa bay": "TB", "buccaneers": "TB", "tb": "TB", "tam": "TB",
    "tennessee": "TEN", "titans": "TEN", "ten": "TEN",
    "washington": "WAS", "commanders": "WAS", "was": "WAS", "wsh": "WAS",
}


def _resolve_nfl_abbr(raw: str | None) -> str | None:
    if not raw:
        return None
    s = str(raw).strip().lower()
    if s in NFL_CITY_NICKNAME_TO_ABBR:
        return NFL_CITY_NICKNAME_TO_ABBR[s]
    for k, v in NFL_CITY_NICKNAME_TO_ABBR.items():
        if len(k) >= 4 and k in s:
            return v
    return None


def chosen_c() -> float:
    p = NFL / "artifacts" / "config_used.json"
    with p.open(encoding="utf-8") as f:
        return float(json.load(f)["logit_c"])


def build_live_v3_catalog() -> tuple[dict[str, Any], list[dict[str, Any]]]:
    ws_dir = ROOT / "data" / "processed" / "web_scraping"
    live_ctx = json.loads((ws_dir / "ws_live_inference_context.json").read_text(encoding="utf-8"))

    ne_path = WEB_SCRAPING_ROOT / "data" / "normalized" / "news_and_environment.json"
    ra_path = WEB_SCRAPING_ROOT / "data" / "normalized" / "roster_availability.json"
    ne_records = json.loads(ne_path.read_text(encoding="utf-8"))["records"] if ne_path.exists() else []
    ra_records = json.loads(ra_path.read_text(encoding="utf-8"))["records"] if ra_path.exists() else []

    # 1. Agregar las 54 filas de cuadrillas arbitrales NFLPenalties ponderadas por partidos pitados
    crew_acc: dict[str, dict[str, float]] = {}
    crew_rows_count = 0
    for r in ne_records:
        if r.get("record_type") != "worldfootball_nflpenalties_referees_nfl_referee_crews":
            continue
        crew_rows_count += 1
        name = str(r.get("referee_name") or "").strip()
        if not name:
            continue
        g = max(1.0, float(r.get("games_officiated") or 1.0))
        flags_pg = float(r.get("total_flags_per_game") or 15.6)
        pen_pg = float(r.get("nfl_penalties_per_game") or 12.8)
        h_pen = float(r.get("home_penalties_per_game") or 6.2)
        a_pen = float(r.get("away_penalties_per_game") or 6.5)
        entry = crew_acc.setdefault(
            name,
            {"g": 0.0, "flags_w": 0.0, "pen_w": 0.0, "h_w": 0.0, "a_w": 0.0},
        )
        entry["g"] += g
        entry["flags_w"] += g * flags_pg
        entry["pen_w"] += g * pen_pg
        entry["h_w"] += g * h_pen
        entry["a_w"] += g * a_pen

    referee_crews: dict[str, dict[str, Any]] = {}
    for name, acc in sorted(crew_acc.items()):
        g = acc["g"]
        h_pg = acc["h_w"] / g
        a_pg = acc["a_w"] / g
        referee_crews[name] = {
            "referee_name": name,
            "games_officiated": int(round(g)),
            "nfl_penalties_per_game": round(acc["pen_w"] / g, 4),
            "total_flags_per_game": round(acc["flags_w"] / g, 4),
            "home_penalties_per_game": round(h_pg, 4),
            "away_penalties_per_game": round(a_pg, 4),
            "home_penalty_bias": round(a_pg - h_pg, 4),
        }

    # 2. Disciplina de castigos por equipo (66 registros NFLPenalties)
    team_pen_acc: dict[str, dict[str, float]] = {}
    for r in ne_records:
        if r.get("record_type") != "worldfootball_nflpenalties_referees_nfl_team_penalties":
            continue
        ab = _resolve_nfl_abbr(r.get("team"))
        if not ab:
            continue
        g = max(1.0, float(r.get("games") or 1.0))
        ppg = float(r.get("penalties_per_game") or 6.3)
        acc = team_pen_acc.setdefault(ab, {"g": 0.0, "w": 0.0})
        acc["g"] += g
        acc["w"] += g * ppg

    # 3. Ourlads QB1 + NFL Official Injuries por equipo
    qb1_by_team: dict[str, str] = {}
    for r in ra_records:
        if r.get("record_type") == "nfl_official_injuries_depth_ourlads_depth_charts":
            if str(r.get("position") or "").upper() == "QB":
                ab = _resolve_nfl_abbr(r.get("team"))
                s1 = str(r.get("starter_rank_1") or "").strip()
                if ab and s1 and ab not in qb1_by_team:
                    last_name = s1.split(",")[0].strip().lower()
                    qb1_by_team[ab] = last_name

    inj_by_team: dict[str, dict[str, float]] = {}
    for r in ra_records:
        rt = r.get("record_type")
        if rt not in ("nfl_official_injuries_depth_nfl_official_injuries", "rotowire_nfl_injury_designation"):
            continue
        ab = _resolve_nfl_abbr(r.get("team"))
        if not ab:
            continue
        bucket = inj_by_team.setdefault(ab, {"qb_injured": 0.0, "out_ir": 0.0, "questionable": 0.0})
        status = f"{r.get('game_status_designation') or ''} {r.get('practice_status') or ''} {r.get('status') or ''}".lower()
        pos = str(r.get("position") or "").upper()
        pname = str(r.get("player_name") or "").lower()
        is_out = any(k in status for k in ("out", "ir", "injured reserve", "did not participate", "doubtful"))
        is_q = any(k in status for k in ("questionable", "limited")) and not is_out
        if is_out:
            bucket["out_ir"] += 1.0
            if pos == "QB":
                qb1_last = qb1_by_team.get(ab, "")
                if not qb1_last or qb1_last in pname:
                    bucket["qb_injured"] = 1.0
                else:
                    bucket["qb_injured"] = max(bucket["qb_injured"], 0.35)
        elif is_q:
            bucket["questionable"] += 1.0
            if pos == "QB" and qb1_by_team.get(ab, "__none__") in pname:
                bucket["qb_injured"] = max(bucket["qb_injured"], 0.40)

    # 4. Catálogo de los 32 estadios + contexto live de los 32 equipos NFL
    stadium_physics: dict[str, dict[str, Any]] = {}
    team_live_context: dict[str, dict[str, Any]] = {}
    for t in live_ctx.get("teams", []):
        if t.get("league") != "nfl":
            continue
        ab = str(t.get("pl_team") or _resolve_nfl_abbr(t.get("team_name")) or "").upper()
        if ab == "LAR":
            ab = "LA"
        if not ab:
            continue
        elev = float(NFL_STADIUM_ELEVATION_M.get(ab, t.get("stadium_elevation_m") or 100.0))
        roof = str(t.get("roof_type") or "open").lower()
        is_dome = roof in ("dome", "indoor", "closed", "retractable")
        stadium_physics[ab] = {
            "team_abbr": ab,
            "stadium_name": str(t.get("stadium_name") or ""),
            "stadium_elevation_m": elev,
            "structural_pressure_hpa": round(float(t.get("structural_pressure_hpa") or 1001.0), 2),
            "roof_type": roof,
            "is_dome": is_dome,
        }
        pen_pg = (
            round(team_pen_acc[ab]["w"] / team_pen_acc[ab]["g"], 3)
            if ab in team_pen_acc
            else 6.30
        )
        inj = inj_by_team.get(ab, {"qb_injured": 0.0, "out_ir": 0.0, "questionable": 0.0})
        team_live_context[ab] = {
            "team_abbr": ab,
            "team_name": str(t.get("team_name") or ab),
            "off_epa_per_play": t.get("nfl_off_epa_per_play"),
            "def_epa_per_play": t.get("nfl_def_epa_per_play"),
            "off_success_pct": t.get("nfl_off_success_pct"),
            "def_success_pct": t.get("nfl_def_success_pct"),
            "qb_injured": round(float(inj["qb_injured"]), 3),
            "injuries_out_ir": int(min(12.0, inj["out_ir"])),
            "injuries_questionable": int(min(14.0, inj["questionable"])),
            "penalties_per_game": pen_pg,
            "max_wind_speed_mph_7d": float(t.get("max_wind_speed_mph_7d") or 0.0),
            "total_precipitation_mm_7d": float(t.get("total_precipitation_mm_7d") or 0.0),
        }

    live_v3_block = {
        "model_id": MINKOWSKI_V3_MODEL_ID,
        "source_referee_season_rows": crew_rows_count,
        "priors": MINKOWSKI_V3_DEFAULT_PRIORS,
        "referee_crews": referee_crews,
        "stadium_physics": stadium_physics,
        "team_live_context": team_live_context,
    }
    nfl_matchups = [m for m in live_ctx.get("matchups", []) if m.get("league") == "nfl"]
    return live_v3_block, nfl_matchups


def build_live_v3_golden_cases(
    live_v3: dict[str, Any],
    nfl_matchups: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    crews = live_v3["referee_crews"]
    stadiums = live_v3["stadium_physics"]
    team_ctx = live_v3["team_live_context"]
    priors = live_v3["priors"]
    crew_names = sorted(crews.keys())

    raw_specs: list[tuple[str, str, dict[str, float], dict[str, Any]]] = []

    # 1) Matchups reales activos de ws_live_inference_context.json
    for idx, m in enumerate(nfl_matchups[:18]):
        h_ab = str(m.get("pl_home_team") or _resolve_nfl_abbr(m.get("home_team")) or "BUF").upper()
        a_ab = str(m.get("pl_away_team") or _resolve_nfl_abbr(m.get("away_team")) or "MIN").upper()
        if h_ab == "LAR":
            h_ab = "LA"
        if a_ab == "LAR":
            a_ab = "LA"
        ht = team_ctx.get(h_ab, {})
        at = team_ctx.get(a_ab, {})
        crew_pick = crew_names[idx % len(crew_names)] if crew_names else None
        p_h_base = float(m.get("p_home_novig") or 0.535)
        p_h_base = min(max(p_h_base, 0.18), 0.82)
        base_probs = {
            "pHome": round(p_h_base * 0.996, 6),
            "pDraw": 0.004,
            "pAway": round(1.0 - p_h_base * 0.996 - 0.004, 6),
            "expectedTotal": 45.5,
        }
        ctx = {
            "homeTeam": h_ab,
            "awayTeam": a_ab,
            "sampleGames": 9,
            "homeOffEpaPerPlay": ht.get("off_epa_per_play", 0.02),
            "homeDefEpaPerPlay": ht.get("def_epa_per_play", 0.0),
            "awayOffEpaPerPlay": at.get("off_epa_per_play", 0.0),
            "awayDefEpaPerPlay": at.get("def_epa_per_play", 0.0),
            "homeOffSuccessPct": ht.get("off_success_pct", 44.0),
            "homeDefSuccessPct": ht.get("def_success_pct", 44.0),
            "awayOffSuccessPct": at.get("off_success_pct", 44.0),
            "awayDefSuccessPct": at.get("def_success_pct", 44.0),
            "homeQbInjured": ht.get("qb_injured", 0.0),
            "awayQbInjured": at.get("qb_injured", 0.0),
            "homeInjuriesOutIr": ht.get("injuries_out_ir", 2),
            "awayInjuriesOutIr": at.get("injuries_out_ir", 2),
            "homeInjuriesQuestionable": ht.get("injuries_questionable", 3),
            "awayInjuriesQuestionable": at.get("injuries_questionable", 3),
            "refereeCrew": crew_pick,
            "homePenaltiesPerGame": ht.get("penalties_per_game", 6.2),
            "awayPenaltiesPerGame": at.get("penalties_per_game", 6.4),
            "maxWindSpeedMph": float(m.get("home_max_wind_speed_mph_7d") or ht.get("max_wind_speed_mph_7d") or 8.0),
            "precipitationMm": min(18.0, float(m.get("home_total_precipitation_mm_7d") or 0.0) * 0.25),
            "baseIncludesVenueAltitude": True,
        }
        raw_specs.append((f"nfl_live_matchup_{idx+1:02d}_{h_ab.lower()}_{a_ab.lower()}", "active_live_matchup", base_probs, ctx))

    # 2) Escenarios físicos, arbitrales, lesiones QB1 y altitud Mile High hasta completar 40 casos
    special_scenarios: list[tuple[str, str, dict[str, float], dict[str, Any]]] = [
        (
            "nfl_mile_high_live_only_den_mia",
            "denver_1588m_altitude_sea_level_visitor_live_only",
            {"pHome": 0.540, "pDraw": 0.004, "pAway": 0.456, "expectedTotal": 46.0},
            {"homeTeam": "DEN", "awayTeam": "MIA", "baseIncludesVenueAltitude": False, "homeOffEpaPerPlay": 0.05, "homeDefEpaPerPlay": -0.08, "awayOffEpaPerPlay": 0.07, "awayDefEpaPerPlay": 0.02, "maxWindSpeedMph": 11.0},
        ),
        (
            "nfl_mile_high_residual_den_kc",
            "denver_1588m_altitude_with_base_venue_hfa",
            {"pHome": 0.485, "pDraw": 0.005, "pAway": 0.510, "expectedTotal": 44.5},
            {"homeTeam": "DEN", "awayTeam": "KC", "baseIncludesVenueAltitude": True, "homeOffEpaPerPlay": 0.03, "homeDefEpaPerPlay": -0.09, "awayOffEpaPerPlay": 0.11, "awayDefEpaPerPlay": -0.05, "refereeCrew": crew_names[0] if crew_names else None, "homePenaltiesPerGame": 5.8, "awayPenaltiesPerGame": 6.4},
        ),
        (
            "nfl_buffalo_lake_erie_gale_snow",
            "outdoor_28mph_wind_and_12mm_snow_compression",
            {"pHome": 0.640, "pDraw": 0.004, "pAway": 0.356, "expectedTotal": 48.5},
            {"homeTeam": "BUF", "awayTeam": "SF", "isDome": False, "maxWindSpeedMph": 28.5, "precipitationMm": 12.0, "homeOffEpaPerPlay": 0.14, "homeDefEpaPerPlay": -0.04, "awayOffEpaPerPlay": 0.10, "awayDefEpaPerPlay": -0.06},
        ),
        (
            "nfl_detroit_dome_storm_immunity",
            "dome_immunity_despite_outside_storm",
            {"pHome": 0.660, "pDraw": 0.004, "pAway": 0.336, "expectedTotal": 51.0},
            {"homeTeam": "DET", "awayTeam": "GB", "isDome": True, "maxWindSpeedMph": 31.0, "precipitationMm": 18.0, "homeOffEpaPerPlay": 0.16, "homeDefEpaPerPlay": -0.07, "awayOffEpaPerPlay": 0.08, "awayDefEpaPerPlay": -0.02},
        ),
        (
            "nfl_retractable_open_ari_sea",
            "retractable_roof_open_windy_rain",
            {"pHome": 0.490, "pDraw": 0.005, "pAway": 0.505, "expectedTotal": 47.0},
            {"homeTeam": "ARI", "awayTeam": "SEA", "roofType": "retractable", "roofOpen": True, "maxWindSpeedMph": 21.0, "precipitationMm": 6.5},
        ),
        (
            "nfl_retractable_closed_dal_phi",
            "retractable_roof_closed_default",
            {"pHome": 0.460, "pDraw": 0.004, "pAway": 0.536, "expectedTotal": 49.0},
            {"homeTeam": "DAL", "awayTeam": "PHI", "roofType": "retractable", "roofOpen": False, "maxWindSpeedMph": 24.0, "precipitationMm": 9.0},
        ),
        (
            "nfl_home_qb1_out_shock",
            "starting_home_qb_out_and_heavy_ir",
            {"pHome": 0.610, "pDraw": 0.004, "pAway": 0.386, "expectedTotal": 47.5},
            {"homeTeam": "CIN", "awayTeam": "BAL", "homeQbInjured": 1.0, "awayQbInjured": 0.0, "homeInjuriesOutIr": 6, "awayInjuriesOutIr": 1, "homeInjuriesQuestionable": 4, "awayInjuriesQuestionable": 1},
        ),
        (
            "nfl_away_qb1_out_shock",
            "starting_away_qb_out",
            {"pHome": 0.515, "pDraw": 0.005, "pAway": 0.480, "expectedTotal": 45.0},
            {"homeTeam": "PIT", "awayTeam": "CLE", "homeQbInjured": 0.0, "awayQbInjured": 1.0, "homeInjuriesOutIr": 1, "awayInjuriesOutIr": 5},
        ),
        (
            "nfl_both_qbs_injured_ugly_under",
            "backup_qb_bowl_low_total",
            {"pHome": 0.520, "pDraw": 0.006, "pAway": 0.474, "expectedTotal": 41.5},
            {"homeTeam": "NYG", "awayTeam": "NYJ", "homeQbInjured": 1.0, "awayQbInjured": 1.0, "homeInjuriesOutIr": 7, "awayInjuriesOutIr": 6, "maxWindSpeedMph": 19.5, "precipitationMm": 4.0},
        ),
        (
            "nfl_strict_referee_undisciplined_visitor",
            "high_flag_crew_vs_undisciplined_away_team",
            {"pHome": 0.530, "pDraw": 0.005, "pAway": 0.465, "expectedTotal": 45.5},
            {"homeTeam": "LAC", "awayTeam": "LV", "crewFlagsPerGame": 19.4, "crewHomePenaltyBias": 0.85, "homePenaltiesPerGame": 4.9, "awayPenaltiesPerGame": 8.4},
        ),
        (
            "nfl_lenient_referee_road_friendly",
            "low_flag_crew_road_friendly_bias",
            {"pHome": 0.560, "pDraw": 0.004, "pAway": 0.436, "expectedTotal": 46.0},
            {"homeTeam": "NO", "awayTeam": "TB", "crewFlagsPerGame": 12.8, "crewHomePenaltyBias": -0.45, "homePenaltiesPerGame": 7.8, "awayPenaltiesPerGame": 5.1},
        ),
        (
            "nfl_neutral_london_international",
            "neutral_site_international_series",
            {"pHome": 0.505, "pDraw": 0.005, "pAway": 0.490, "expectedTotal": 44.0},
            {"homeTeam": "JAX", "awayTeam": "CHI", "neutralSite": True, "stadiumElevationM": 1600.0, "maxWindSpeedMph": 16.5, "precipitationMm": 2.5},
        ),
        (
            "nfl_decimal_success_pct_normalization",
            "decimal_0_to_1_success_pct_input",
            {"pHome": 0.550, "pDraw": 0.004, "pAway": 0.446, "expectedTotal": 46.5},
            {"homeTeam": "HOU", "awayTeam": "IND", "homeOffEpaPerPlay": 0.09, "homeDefEpaPerPlay": -0.06, "awayOffEpaPerPlay": -0.03, "awayDefEpaPerPlay": 0.04, "homeOffSuccessPct": 0.475, "homeDefSuccessPct": 0.410, "awayOffSuccessPct": 0.415, "awayDefSuccessPct": 0.455, "sampleGames": 12},
        ),
        (
            "nfl_early_season_strong_shrinkage",
            "week_2_small_sample_bayesian_shrinkage",
            {"pHome": 0.525, "pDraw": 0.005, "pAway": 0.470, "expectedTotal": 45.0},
            {"homeTeam": "ATL", "awayTeam": "CAR", "sampleGames": 2, "netEpaDiff": 0.28, "netSuccessPctDiff": 8.5},
        ),
        (
            "nfl_zero_context_identity_check",
            "empty_live_context_preserves_base_simplex",
            {"pHome": 0.612345, "pDraw": 0.004321, "pAway": 0.383334, "expectedTotal": 45.2},
            {},
        ),
    ]
    raw_specs.extend(special_scenarios)

    # Completar hasta exactamente 40 casos con rotaciones divisionales y cuadrillas reales
    div_extras = [
        ("KC", "LV"), ("PHI", "WAS"), ("BAL", "PIT"), ("SF", "SEA"),
        ("GB", "MIN"), ("BUF", "MIA"), ("TEN", "JAX"), ("LA", "ARI"),
        ("NE", "NYJ"), ("DEN", "LAC"), ("TB", "ATL"), ("DET", "CHI"),
    ]
    idx_extra = 0
    while len(raw_specs) < 40 and idx_extra < len(div_extras):
        h_ab, a_ab = div_extras[idx_extra]
        idx_extra += 1
        ht = team_ctx.get(h_ab, {})
        at = team_ctx.get(a_ab, {})
        crew_pick = crew_names[(idx_extra * 3) % len(crew_names)] if crew_names else None
        base_probs = {"pHome": 0.565, "pDraw": 0.005, "pAway": 0.430, "expectedTotal": 45.8}
        ctx = {
            "homeTeam": h_ab,
            "awayTeam": a_ab,
            "sampleGames": 10,
            "homeOffEpaPerPlay": ht.get("off_epa_per_play", 0.01),
            "homeDefEpaPerPlay": ht.get("def_epa_per_play", 0.0),
            "awayOffEpaPerPlay": at.get("off_epa_per_play", 0.0),
            "awayDefEpaPerPlay": at.get("def_epa_per_play", 0.01),
            "homeQbInjured": ht.get("qb_injured", 0.0),
            "awayQbInjured": at.get("qb_injured", 0.0),
            "homeInjuriesOutIr": ht.get("injuries_out_ir", 2),
            "awayInjuriesOutIr": at.get("injuries_out_ir", 2),
            "refereeCrew": crew_pick,
            "homePenaltiesPerGame": ht.get("penalties_per_game", 6.1),
            "awayPenaltiesPerGame": at.get("penalties_per_game", 6.3),
            "maxWindSpeedMph": ht.get("max_wind_speed_mph_7d", 9.0),
            "precipitationMm": min(12.0, float(ht.get("total_precipitation_mm_7d", 0.0)) * 0.2),
            "baseIncludesVenueAltitude": True,
        }
        raw_specs.append((f"nfl_div_live_{len(raw_specs)+1:02d}_{h_ab.lower()}_{a_ab.lower()}", "division_live_context", base_probs, ctx))

    cases: list[dict[str, Any]] = []
    for cid, scenario, b_probs, ctx in raw_specs[:40]:
        delta_py = compute_nfl_live_context_delta(ctx, priors=priors, referee_crews=crews, stadiums=stadiums)
        pred_py = apply_minkowski_v3_live_context(b_probs, ctx, priors=priors, referee_crews=crews, stadiums=stadiums)
        cases.append(
            {
                "caseId": cid,
                "scenario": scenario,
                "baseProbs": b_probs,
                "context": ctx,
                "expected_delta_python": delta_py,
                "expected_prediction_python": pred_py,
            }
        )
    return cases


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--out-dir",
        default=str(WORKTREE_ROOT / "src" / "data" / "prediction"),
        help="Directorio de salida para model_nfl.json y nfl_snapshot.json",
    )
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    df = pd.read_parquet(ROOT / "data" / "nfl" / "processed" / "nfl_features.parquet")
    df = df[df["home_score"].notna() & df["away_score"].notna()].copy()
    ymap = {"H": 0, "T": 1, "A": 2}
    df["y"] = df["result"].map(ymap)
    df = df[df["y"].notna()].copy()
    df["y"] = df["y"].astype(int)
    df["season"] = df["season"].astype(int)

    train = df[(df.season >= 2002) & (df.season <= 2025)].copy()
    X = make_design(train)
    y = train["y"].to_numpy()
    sw = 0.5 ** ((2025 - train["season"].to_numpy(dtype=float)) / 10.0)
    model = fit_logit(X, y, C=chosen_c(), sample_weight=sw)
    probs = predict_proba_3(model, X, design_columns())

    live_v3_block, nfl_matchups = build_live_v3_catalog()

    scaler = model.named_steps["scale"]
    clf = model.named_steps["clf"]
    artifact = {
        "sport": "nfl",
        "type": "multinomial_logistic",
        "codename": "PitchLab Minkowski v3.0",
        "version": "3.0.0",
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "seed": SEED,
        "features": design_columns(),
        "n_features": len(design_columns()),
        "scaler": {"mean": scaler.mean_.tolist(), "scale": scaler.scale_.tolist()},
        "coef": clf.coef_.tolist(),
        "intercept": clf.intercept_.tolist(),
        "classes": [int(c) for c in clf.classes_],
        "class_map": {"0": "H", "1": "T", "2": "A"},
        "venue_physics": {
            "alt_elo": 18.0,
            "dome_elo": 0.0,
            "mile_high_elevation_m": 1588.0,
            "stadium_elevation_m": NFL_STADIUM_ELEVATION_M,
        },
        "live_v3": live_v3_block,
        "metadata": {
            "source": "nflverse games.csv + nfl_features.parquet + SumerSports/Ourlads/NFLPenalties/Open-Meteo",
            "n_matches": int(len(train)),
            "seasons": [int(train.season.min()), int(train.season.max())],
            "train_log_loss": float(-np.mean(np.log(probs[np.arange(len(y)), y]))),
            "tie_rate": float((y == 1).mean()),
            "notes": (
                "PitchLab Minkowski v3.0: Base multinomial con invariante físico de altitud (Mile High HFA Elo), "
                "QB/Coach Elo, EWMA ajustada por calendario y capa prospectiva Bayesiana en vivo "
                "(SumerSports EPA/Success%, Ourlads + Official Injuries, NFLPenalties cuadrillas y clima Open-Meteo)."
            ),
        },
    }

    model_path = out_dir / "model_nfl.json"
    model_path.write_text(json.dumps(artifact, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")

    snap = df[df.season == 2025].sample(n=min(200, int((df.season == 2025).sum())), random_state=SEED)
    Xs = make_design(snap)
    ps = predict_proba_3(model, Xs, design_columns())
    rows: dict[str, Any] = {}
    for i, (_, r) in enumerate(snap.iterrows()):
        rows[r.game_id] = {
            "season": int(r.season),
            "week": int(r.week),
            "home_team": r.home_team,
            "away_team": r.away_team,
            "features": [None if pd.isna(v) else float(v) for v in Xs.iloc[i].tolist()],
            "probs_python": [round(float(x), 12) for x in ps[i]],
        }

    live_v3_cases = build_live_v3_golden_cases(live_v3_block, nfl_matchups)
    snapshot_payload = {
        "schema_version": "3.0.0",
        "codename": "PitchLab Minkowski v3.0",
        "generated_at": artifact["created_at"],
        "n": len(rows),
        "rows": rows,
        "n_live_v3_cases": len(live_v3_cases),
        "live_v3_cases": live_v3_cases,
    }
    snap_path = out_dir / "nfl_snapshot.json"
    snap_path.write_text(json.dumps(snapshot_payload, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")

    print(
        f"NFL Minkowski v3.0: {len(train):,} partidos | train log-loss={artifact['metadata']['train_log_loss']:.5f} "
        f"| tie_rate={artifact['metadata']['tie_rate']:.4f} | crews={len(live_v3_block['referee_crews'])}"
    )
    print(f"escrito -> {model_path} y {snap_path} ({len(rows)} partidos 2025 + {len(live_v3_cases)} casos live_v3)")


if __name__ == "__main__":
    main()
