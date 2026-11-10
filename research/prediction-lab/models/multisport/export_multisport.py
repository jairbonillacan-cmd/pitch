#!/usr/bin/env python3
"""Exporta `model_multisport.json` y `multisport_snapshot.json` (>= 120 casos dorados).

Genera:
  - `src/data/prediction/model_multisport.json`
  - `src/data/prediction/multisport_snapshot.json` (140 casos dorados cubriendo NHL, MLB, NBA, NCAAF)

Uso:
  python research/prediction-lab/models/multisport/export_multisport.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
ROOT_PL = HERE.parents[1]
WORKTREE_ROOT = ROOT_PL.parents[1]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
if str(ROOT_PL) not in sys.path:
    sys.path.insert(0, str(ROOT_PL))

from train_multisport import (  # noqa: E402
    build_multisport_artifact,
    load_normalized_sources,
    predict_multisport,
)


def _build_golden_cases(artifact: dict[str, Any], live_ctx: dict[str, Any]) -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []
    matchups = live_ctx.get("matchups", [])

    # ------------------------------------------------------------------
    # 1. NHL — 35 casos dorados (13 matchups reales activos + 22 escenarios de porteros/altitud/bajas)
    # ------------------------------------------------------------------
    nhl_live = [m for m in matchups if m.get("league") == "nhl"]
    for idx, m in enumerate(nhl_live):
        inp: dict[str, Any] = {
            "homeTeam": m["home_team"],
            "awayTeam": m["away_team"],
        }
        cases.append({"caseId": f"nhl_live_{idx+1:02d}", "sport": "nhl", "scenario": "active_live_matchup", "input": inp})

    nhl_specials = [
        ("nhl_alt_col_bos", "mile_high_altitude_confirmed_goalies", {"homeTeam": "COL", "awayTeam": "BOS", "homeGoalieSvPct": 0.916, "awayGoalieSvPct": 0.918, "homeGoalieConfirmed": True, "awayGoalieConfirmed": True}),
        ("nhl_alt_uta_fla", "utah_altitude_confirmed_starter_vs_backup", {"homeTeam": "UTA", "awayTeam": "FLA", "homeGoalieSvPct": 0.913, "homeGoalieGaa": 2.48, "awayGoalieSvPct": 0.893, "awayGoalieGaa": 3.35, "homeGoalieConfirmed": True, "awayGoalieConfirmed": False}),
        ("nhl_elite_goalie_duel", "vezina_goalie_duel_wpg_nyr", {"homeTeam": "WPG", "awayTeam": "NYR", "homeGoalieSvPct": 0.924, "homeGoalieGaa": 2.12, "awayGoalieSvPct": 0.921, "awayGoalieGaa": 2.24, "homeGoalieConfirmed": True, "awayGoalieConfirmed": True}),
        ("nhl_backup_shootout", "high_event_edm_tor_backups", {"homeTeam": "EDM", "awayTeam": "TOR", "homeGoalieSvPct": 0.889, "awayGoalieSvPct": 0.891, "homeGoalieConfirmed": True, "awayGoalieConfirmed": True}),
        ("nhl_injury_shock_home", "car_vs_dal_heavy_home_injuries", {"homeTeam": "CAR", "awayTeam": "DAL", "homeInjuriesOut": 6, "homeInjuriesQuestionable": 2, "awayInjuriesOut": 0}),
        ("nhl_neutral_global_series", "neutral_ice_global_series_njd_buf", {"homeTeam": "NJD", "awayTeam": "BUF", "neutralSite": True, "homeGoalieSvPct": 0.911, "awayGoalieSvPct": 0.908}),
        ("nhl_override_live_xg", "adhoc_xg_corsi_override_vgk_lak", {"homeTeam": "VGK", "awayTeam": "LAK", "homeXgPct": 55.4, "homeCorsiPct": 54.1, "homeFenwickPct": 54.8, "homeHighDangerXgFor": 1.58, "homePythag215": 0.62, "awayXgPct": 48.2, "awayCorsiPct": 49.0, "awayFenwickPct": 48.7, "awayHighDangerXgFor": 1.18, "awayPythag215": 0.47}),
    ]
    for cid, scen, inp in nhl_specials:
        cases.append({"caseId": cid, "sport": "nhl", "scenario": scen, "input": inp})

    nhl_pairs_extra = [
        ("TBL", "FLA"), ("MTL", "OTT"), ("PIT", "WSH"), ("MIN", "STL"), ("CGY", "VAN"),
        ("SEA", "SJS"), ("ANA", "CBJ"), ("DET", "CHI"), ("NSH", "COL"), ("PHI", "NYI"),
        ("BOS", "TOR"), ("DAL", "WPG"), ("LAK", "EDM"), ("UTA", "VGK"), ("CAR", "NYR"),
    ]
    idx_nhl = len([c for c in cases if c["sport"] == "nhl"])
    for h_ab, a_ab in nhl_pairs_extra:
        if idx_nhl >= 35:
            break
        idx_nhl += 1
        cases.append({
            "caseId": f"nhl_div_{idx_nhl:02d}_{h_ab.lower()}_{a_ab.lower()}",
            "sport": "nhl",
            "scenario": "division_calibration",
            "input": {"homeTeam": h_ab, "awayTeam": a_ab},
        })

    # ------------------------------------------------------------------
    # 2. MLB — 35 casos dorados (matchup activo + Coors Field abierto/cerrado + abridores + viento)
    # ------------------------------------------------------------------
    mlb_live = [m for m in matchups if m.get("league") == "mlb"]
    for idx, m in enumerate(mlb_live):
        cases.append({
            "caseId": f"mlb_live_{idx+1:02d}",
            "sport": "mlb",
            "scenario": "active_live_matchup",
            "input": {"homeTeam": m["home_team"], "awayTeam": m["away_team"]},
        })

    mlb_specials = [
        ("mlb_coors_open_col_lad", "coors_field_open_842hpa_high_run_env", {"homeTeam": "COL", "awayTeam": "LAD", "isDome": False, "surfacePressureHpa": 842.19, "stadiumElevationM": 1580.0, "homeStarterFip": 4.55, "awayStarterFip": 3.25, "homeStarterConfirmed": True, "awayStarterConfirmed": True}),
        ("mlb_coors_closed_roof_counterfactual", "coors_counterfactual_dome_control", {"homeTeam": "COL", "awayTeam": "LAD", "isDome": True, "surfacePressureHpa": 842.19, "stadiumElevationM": 1580.0, "homeStarterFip": 4.55, "awayStarterFip": 3.25, "homeStarterConfirmed": True, "awayStarterConfirmed": True}),
        ("mlb_wrigley_wind_blowing_out", "wrigley_22mph_wind_out_chc_stl", {"homeTeam": "CHC", "awayTeam": "STL", "windMph": 22.5, "windBlowingOut": True, "homeStarterFip": 3.60, "awayStarterFip": 3.95}),
        ("mlb_wrigley_wind_in_rain", "wrigley_20mph_wind_in_and_rain_chc_stl", {"homeTeam": "CHC", "awayTeam": "STL", "windMph": 20.0, "windBlowingOut": False, "precipitationMm": 6.5, "homeStarterFip": 3.60, "awayStarterFip": 3.95}),
        ("mlb_ace_duel_sea_tex", "pitchers_duel_skubal_vs_ace", {"homeTeam": "SEA", "awayTeam": "TEX", "homeStarterFip": 2.55, "homeStarterEra": 2.40, "awayStarterFip": 2.68, "awayStarterEra": 2.62, "homeStarterConfirmed": True, "awayStarterConfirmed": True}),
        ("mlb_fifth_starters_nyy_bos", "back_end_rotation_slugfest", {"homeTeam": "NYY", "awayTeam": "BOS", "homeStarterFip": 5.05, "homeStarterEra": 5.30, "awayStarterFip": 4.95, "awayStarterEra": 5.15, "homeStarterConfirmed": False, "awayStarterConfirmed": True}),
        ("mlb_chase_retractable_open", "chase_field_roof_open_ari_sd", {"homeTeam": "ARI", "awayTeam": "SDP", "roofOpen": True, "stadiumElevationM": 331.0, "homeStarterFip": 3.70, "awayStarterFip": 3.50}),
        ("mlb_neutral_world_series", "neutral_site_classic_lad_nyy", {"homeTeam": "LAD", "awayTeam": "NYY", "neutralSite": True, "homeStarterFip": 3.05, "awayStarterFip": 3.15}),
        ("mlb_injury_depleted_atl_phi", "heavy_lineup_il_atl_vs_phi", {"homeTeam": "ATL", "awayTeam": "PHI", "homeInjuriesOut": 7, "homeInjuriesQuestionable": 2, "awayInjuriesOut": 1}),
    ]
    for cid, scen, inp in mlb_specials:
        cases.append({"caseId": cid, "sport": "mlb", "scenario": scen, "input": inp})

    mlb_pairs_extra = [
        ("CLE", "DET"), ("BAL", "TOR"), ("HOU", "LAA"), ("MIN", "KCR"), ("NYM", "ATL"),
        ("MIL", "CIN"), ("SFG", "LAD"), ("SDP", "ARI"), ("TBR", "NYY"), ("BOS", "BAL"),
        ("PHI", "WSN"), ("STL", "PIT"), ("CHW", "CLE"), ("ATH", "SEA"), ("MIA", "NYM"),
        ("TEX", "HOU"), ("COL", "SFG"), ("KCR", "DET"), ("CIN", "CHC"), ("TOR", "TBR"),
        ("PIT", "MIL"), ("LAA", "ATH"), ("WSN", "MIA"), ("MIN", "CHW"), ("SDP", "COL"),
    ]
    idx_mlb = len([c for c in cases if c["sport"] == "mlb"])
    for h_ab, a_ab in mlb_pairs_extra:
        if idx_mlb >= 35:
            break
        idx_mlb += 1
        cases.append({
            "caseId": f"mlb_reg_{idx_mlb:02d}_{h_ab.lower()}_{a_ab.lower()}",
            "sport": "mlb",
            "scenario": "regular_season_series",
            "input": {"homeTeam": h_ab, "awayTeam": a_ab},
        })

    # ------------------------------------------------------------------
    # 3. NBA — 35 casos dorados (matchups reales activos + altitud Denver/Utah + lesiones/ritmo)
    # ------------------------------------------------------------------
    nba_live = [m for m in matchups if m.get("league") == "nba"][:27]
    for idx, m in enumerate(nba_live):
        cases.append({
            "caseId": f"nba_live_{idx+1:02d}",
            "sport": "nba",
            "scenario": "active_live_matchup",
            "input": {"homeTeam": m["home_team"], "awayTeam": m["away_team"]},
        })

    nba_specials = [
        ("nba_denver_altitude_bos", "denver_1609m_altitude_vs_sea_level_bos", {"homeTeam": "DEN", "awayTeam": "BOS", "awayInjuriesOut": 1}),
        ("nba_utah_altitude_mia", "utah_1288m_altitude_vs_sea_level_mia", {"homeTeam": "UTA", "awayTeam": "MIA"}),
        ("nba_denver_vs_utah_high_alt", "high_altitude_visitor_acclimated_den_uta", {"homeTeam": "DEN", "awayTeam": "UTA"}),
        ("nba_fast_pace_ind_atl", "track_meet_high_pace_override", {"homeTeam": "IND", "awayTeam": "ATL", "homePace": 104.5, "awayPace": 103.8}),
        ("nba_slow_grind_nyk_orl", "half_court_grind_low_pace", {"homeTeam": "NYK", "awayTeam": "ORL", "homePace": 94.8, "awayPace": 95.2}),
        ("nba_star_injuries_okc_dal", "heavy_injury_absence_shock", {"homeTeam": "OKC", "awayTeam": "DAL", "homeInjuriesOut": 0, "awayInjuriesOut": 5, "awayInjuriesQuestionable": 2}),
        ("nba_neutral_cup_final_vegas", "nba_cup_neutral_court_gsw_cle", {"homeTeam": "GSW", "awayTeam": "CLE", "neutralSite": True}),
        ("nba_lakers_suns_division", "pacific_rivalry_lal_phx", {"homeTeam": "LAL", "awayTeam": "PHX", "homeInjuriesQuestionable": 1, "awayInjuriesOut": 2}),
    ]
    for cid, scen, inp in nba_specials:
        if len([c for c in cases if c["sport"] == "nba"]) < 35:
            cases.append({"caseId": cid, "sport": "nba", "scenario": scen, "input": inp})

    # ------------------------------------------------------------------
    # 4. NCAAF — 35 casos dorados (matchups reales activos + altitud WYO/AFA/BYU/COL/UTA/UNM/UTEP + clima)
    # ------------------------------------------------------------------
    ncaaf_live = [m for m in matchups if m.get("league") == "ncaaf"][:24]
    for idx, m in enumerate(ncaaf_live):
        inp_cfb: dict[str, Any] = {
            "homeTeam": m["home_team"],
            "awayTeam": m["away_team"],
        }
        if m.get("home_max_wind_speed_mph_7d") is not None:
            inp_cfb["windMph"] = float(m["home_max_wind_speed_mph_7d"])
        if m.get("home_total_precipitation_mm_7d") is not None:
            inp_cfb["precipitationMm"] = float(m["home_total_precipitation_mm_7d"])
        cases.append({
            "caseId": f"ncaaf_live_{idx+1:02d}",
            "sport": "ncaaf",
            "scenario": "active_live_matchup",
            "input": inp_cfb,
        })

    ncaaf_specials = [
        ("ncaaf_wyoming_2199m_gale", "laramie_2199m_altitude_and_26mph_wind", {"homeTeam": "Wyoming Cowboys", "awayTeam": "San Diego State Aztecs", "windMph": 26.0, "precipitationMm": 3.5}),
        ("ncaaf_air_force_2029m", "falcon_stadium_2029m_altitude_vs_navy", {"homeTeam": "Air Force Falcons", "awayTeam": "Navy Midshipmen", "windMph": 14.0}),
        ("ncaaf_colorado_1634m", "folsom_field_1634m_altitude", {"homeTeam": "Colorado Buffaloes", "awayTeam": "UCF Knights"}),
        ("ncaaf_byu_1417m", "provo_1417m_night_altitude", {"homeTeam": "BYU Cougars", "awayTeam": "Kansas Jayhawks"}),
        ("ncaaf_utah_1415m", "salt_lake_1415m_altitude", {"homeTeam": "Utah Utes", "awayTeam": "Iowa State Cyclones"}),
        ("ncaaf_new_mexico_1554m", "albuquerque_1554m_altitude", {"homeTeam": "New Mexico Lobos", "awayTeam": "Hawaii Rainbow Warriors"}),
        ("ncaaf_utep_1190m", "sun_bowl_1190m_altitude", {"homeTeam": "UTEP Miners", "awayTeam": "Louisiana Tech Bulldogs"}),
        ("ncaaf_p4_vs_g5_sos_test", "sec_vs_g5_strength_of_schedule_correction", {"homeTeam": "Georgia Bulldogs", "awayTeam": "Liberty Flames"}),
        ("ncaaf_cfp_neutral_bowl", "cfp_neutral_dome_ohio_state_oregon", {"homeTeam": "Ohio State Buckeyes", "awayTeam": "Oregon Ducks", "neutralSite": True, "isDome": True, "windMph": 25.0, "precipitationMm": 15.0}),
        ("ncaaf_outdoor_downpour_gale", "midwest_november_storm_michigan_penn_state", {"homeTeam": "Michigan Wolverines", "awayTeam": "Penn State Nittany Lions", "windMph": 29.5, "precipitationMm": 16.0}),
        ("ncaaf_qb1_out_shock", "starting_qb_out_texas_vs_texas_am", {"homeTeam": "Texas Longhorns", "awayTeam": "Texas A&M Aggies", "homeQbInjured": 1.0, "homeInjuriesOut": 4}),
    ]
    for cid, scen, inp in ncaaf_specials:
        cases.append({"caseId": cid, "sport": "ncaaf", "scenario": scen, "input": inp})

    return cases


def main() -> None:
    artifact, oos_metrics = build_multisport_artifact()
    artifact["oos_summary"] = {
        sp: {
            "n_team_seasons": m["n_team_seasons"],
            "total_team_games": m["total_team_games"],
            "model": m["model"],
            "naive_win_pct_s1": m["naive_win_pct_s1"],
            "legacy_static_heuristic": m["legacy_static_heuristic"],
            "bootstrap_95_ci": m["bootstrap_95_ci"],
        }
        for sp, m in oos_metrics.items()
    }

    out_dir = WORKTREE_ROOT / "src" / "data" / "prediction"
    out_dir.mkdir(parents=True, exist_ok=True)
    model_path = out_dir / "model_multisport.json"
    snap_path = out_dir / "multisport_snapshot.json"

    model_path.write_text(json.dumps(artifact, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    sources = load_normalized_sources()
    raw_cases = _build_golden_cases(artifact, sources["live_ctx"])
    golden_rows: list[dict[str, Any]] = []
    counts_by_sport: dict[str, int] = {"nhl": 0, "mlb": 0, "nba": 0, "ncaaf": 0}

    for c in raw_cases:
        pred = predict_multisport(c["sport"], c["input"], artifact)
        counts_by_sport[c["sport"]] = counts_by_sport.get(c["sport"], 0) + 1
        golden_rows.append(
            {
                "caseId": c["caseId"],
                "sport": c["sport"],
                "scenario": c["scenario"],
                "input": c["input"],
                "expected_python": pred,
            }
        )

    snapshot = {
        "schema_version": "3.0.0",
        "generated_at": artifact["created_at"],
        "n_cases": len(golden_rows),
        "counts_by_sport": counts_by_sport,
        "cases": golden_rows,
    }
    snap_path.write_text(json.dumps(snapshot, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"Escrito -> {model_path} ({len(artifact['sports'])} deportes)")
    print(f"Escrito -> {snap_path} ({len(golden_rows)} casos dorados: {counts_by_sport})")


if __name__ == "__main__":
    main()
