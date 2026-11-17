"""Suite de pruebas de causalidad, física, anti-fuga y artefactos de EXP_V33_intl_soccer (PitchLab Meridian v1.0)."""

from __future__ import annotations

import json
from pathlib import Path
import sys

import numpy as np
import pandas as pd
import pytest

EXP_DIR = Path(__file__).resolve().parent
REPO_ROOT = EXP_DIR.parents[3]
for _p in (str(REPO_ROOT), str(EXP_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from services.models import outlook_calibration as oc  # noqa: E402

from intl_causal_features import (  # noqa: E402
    INTL_BASE_38_FEATURES,
    build_intl_causal_dataset,
    compute_squad_club_adjustment,
    synthesize_live_intl_row,
)
from intl_geography import (  # noqa: E402
    haversine_km,
    isa_pressure_hpa,
    resolve_match_venue_physics,
    resolve_team_code,
)
from intl_ingest import (  # noqa: E402
    HoldoutSealedAccessError,
    assert_dates_strictly_before_holdout,
    classify_intl_tournament,
)
from intl_free_data_v2 import (  # noqa: E402
    build_goalscorers_match_summary,
    compute_thermal_climate_mismatch,
)
from run_ablation_v2 import (  # noqa: E402
    ALL_V2_EXTRA_COLS,
    build_intl_v2_causal_dataset,
    synthesize_live_intl_v2_row,
)
from intl_wave2_sources import CausalWorldBankMacroBridge  # noqa: E402
from run_meridian_v3_experiment import synthesize_live_intl_v3_row  # noqa: E402


def _synthetic_intl_matches() -> pd.DataFrame:
    rows = [
        ("INTL_1", "2023-03-24", 2023, "INTL_QUAL", "WC Qual", "ARG", "URU", 2, 0, 0, "Buenos Aires", "Argentina", False, False),
        ("INTL_2", "2023-03-28", 2023, "INTL_FRIENDLY", "Friendly", "ARG", "CRC", 3, 1, 0, "Los Angeles", "United States", True, False),
        ("INTL_3", "2023-06-15", 2023, "INTL_NAT", "Nations League", "MEX", "USA", 1, 1, 1, "Las Vegas", "United States", True, True),
        ("INTL_4", "2023-09-08", 2023, "INTL_QUAL", "WC Qual", "BOL", "BRA", 1, 0, 0, "El Alto", "Bolivia", False, False),
        ("INTL_5", "2023-09-12", 2023, "INTL_QUAL", "WC Qual", "ARG", "BOL", 3, 0, 0, "Buenos Aires", "Argentina", False, False),
        ("INTL_6", "2023-10-12", 2023, "INTL_QUAL", "WC Qual", "BRA", "URU", 1, 2, 2, "Sao Paulo", "Brazil", False, False),
        ("INTL_7", "2023-11-16", 2023, "INTL_QUAL", "WC Qual", "ARG", "URU", 0, 2, 2, "Buenos Aires", "Argentina", False, False),
    ]
    cols = [
        "match_id", "date_str", "year", "div", "tournament_raw",
        "home_code", "away_code", "home_goals", "away_goals", "y",
        "city", "country", "neutral", "went_to_shootout",
    ]
    df = pd.DataFrame(rows, columns=cols)
    df["match_date"] = pd.to_datetime(df["date_str"])
    df["season"] = df["year"].astype(str)
    df["home_team_raw"] = df["home_code"]
    df["away_team_raw"] = df["away_code"]
    return df


def test_strict_temporal_causality_no_future_leakage() -> None:
    df_orig = _synthetic_intl_matches()
    feat_orig, _ = build_intl_causal_dataset(df_orig, enforce_before_holdout=True)

    # Mutar de forma extrema el marcador del partido índice 4 (`INTL_5`) y posteriores
    df_mut = df_orig.copy()
    df_mut.loc[4, "home_goals"] = 0
    df_mut.loc[4, "away_goals"] = 9
    df_mut.loc[4, "y"] = 2

    feat_mut, _ = build_intl_causal_dataset(df_mut, enforce_before_holdout=True)

    cols = list(INTL_BASE_38_FEATURES)
    # Filas 0..4 (INCLUYENDO el propio partido 4 pre-kickoff) deben ser idénticas a 0.0 bits
    diff_pre = np.max(np.abs(feat_orig.loc[:4, cols].to_numpy() - feat_mut.loc[:4, cols].to_numpy()))
    assert diff_pre == 0.0

    # El partido posterior `INTL_7` (índice 6, donde vuelve a jugar ARG) SÍ debe reflejar el cambio
    diff_post = np.max(np.abs(feat_orig.loc[6, cols].to_numpy() - feat_mut.loc[6, cols].to_numpy()))
    assert diff_post > 1e-3


def test_holdout_sealed_guard_blocks_post_cut_dates() -> None:
    df = _synthetic_intl_matches()
    df.loc[len(df) - 1, "date_str"] = "2025-02-02"
    df.loc[len(df) - 1, "match_date"] = pd.Timestamp("2025-02-02")

    with pytest.raises(HoldoutSealedAccessError):
        assert_dates_strictly_before_holdout(df)

    with pytest.raises(HoldoutSealedAccessError):
        build_intl_causal_dataset(df, enforce_before_holdout=True)


def test_geography_altitude_diaspora_and_host_away_column() -> None:
    # 1. Bolivia en El Alto (4150 m) vs Brasil (760 m): ventaja de aclimatación = (4150-760) - (4150-3640) = 2880 m
    bol_phys = resolve_match_venue_physics("BOL", "BRA", "El Alto", "Bolivia", False)
    assert bol_phys["venue_elev_m"] == 4150.0
    assert bol_phys["effective_hfa"] == 1.0
    assert bol_phys["altitude_diff_m"] == pytest.approx(2880.0, abs=1e-9)
    assert bol_phys["altitude_shock_flag"] == 1.0
    assert isa_pressure_hpa(4150.0) < isa_pressure_hpa(0.0)

    # 2. México vs Colombia en Arlington (EE.UU., neutral): diáspora mexicana activa +0.35
    mex_diasp = resolve_match_venue_physics("MEX", "COL", "Arlington", "United States", True)
    assert mex_diasp["effective_hfa"] == pytest.approx(0.35, abs=1e-9)
    assert mex_diasp["is_neutral_pure"] == 0.0

    # 3. Cuando el anfitrión real aparece en la columna `away_code` (ej. torneo en Alemania: ESP vs GER)
    host_away = resolve_match_venue_physics("ESP", "GER", "Munich", "Germany", False)
    assert host_away["effective_hfa"] == -1.0
    assert host_away["is_neutral_pure"] == 0.0

    # 4. Clasificador de torneos y alias
    assert classify_intl_tournament("FIFA World Cup qualification") == "INTL_QUAL"
    assert classify_intl_tournament("FIFA World Cup") == "INTL_WC"
    assert classify_intl_tournament("Copa América") == "INTL_CONT"
    assert classify_intl_tournament("UEFA Nations League") == "INTL_NAT"
    assert classify_intl_tournament("Friendly") == "INTL_FRIENDLY"
    assert resolve_team_code("México") == "MEX"
    assert resolve_team_code("West Germany") == "GER"
    assert haversine_km(19.3029, -99.1505, 32.7473, -97.0945) > 1400.0


def test_squad_club_bridge_anti_leakage_and_chemistry() -> None:
    elite_xi = [{"clubElo": 1840.0, "recentClubMinutes30d": 320.0, "isStarter": True, "clubCode": "RMA"} for _ in range(5)] + [
        {"clubElo": 1810.0, "recentClubMinutes30d": 300.0, "isStarter": True, "clubCode": "BAR"} for _ in range(6)
    ]
    b_squad = [{"clubElo": 1460.0, "recentClubMinutes30d": 120.0, "isStarter": True, "clubCode": f"C{i}"} for i in range(11)]

    # Caso causal válido: publicado a T-55m, decisión a T-45m (delay 10 min >= 2 min)
    ok_res = compute_squad_club_adjustment(
        ts_published_utc="2026-11-18T19:05:00Z",
        ts_decision_utc="2026-11-18T19:15:00Z",
        kickoff_utc="2026-11-18T20:00:00Z",
        home_players=elite_xi,
        away_players=b_squad,
        home_baseline_club_elo=1600.0,
        away_baseline_club_elo=1600.0,
    )
    assert ok_res["applied"] is True
    assert ok_res["net_elo_delta"] > 300.0
    assert ok_res["lam_home_multiplier"] > 1.05
    assert ok_res["lam_away_multiplier"] < 0.96

    # Caso no causal rechazado: publicado 30s antes de `ts_decision_utc` (< 2.0 min exigidos)
    late_res = compute_squad_club_adjustment(
        ts_published_utc="2026-11-18T19:14:30Z",
        ts_decision_utc="2026-11-18T19:15:00Z",
        kickoff_utc="2026-11-18T20:00:00Z",
        home_players=elite_xi,
        away_players=b_squad,
        home_baseline_club_elo=1600.0,
        away_baseline_club_elo=1600.0,
    )
    assert late_res["applied"] is False
    assert late_res["lam_home_multiplier"] == 1.0
    assert late_res["lam_away_multiplier"] == 1.0


def test_exported_meridian_artifacts_governance() -> None:
    pred_dir = REPO_ROOT / "src" / "data" / "prediction"
    model_p = pred_dir / "model_intl_soccer_v1.json"
    state_p = pred_dir / "intl_soccer_causal_state.json"
    cal_p = pred_dir / "intl_outlook_calibration_v1.json"
    snap_p = pred_dir / "intl_soccer_snapshot.json"

    assert model_p.exists() and state_p.exists() and cal_p.exists() and snap_p.exists()

    model_j = json.loads(model_p.read_text(encoding="utf-8"))
    assert model_j["codename"] == "PitchLab Meridian v1.0"
    assert model_j["status"] == "candidate"
    assert model_j["production_activated"] is False
    assert model_j["n_features_base"] == 38
    assert len(model_j["div_levels"]) == 6
    assert len(model_j["features"]) == 44

    cal_j = json.loads(cal_p.read_text(encoding="utf-8"))
    assert cal_j["holdout_sealed_untouched"] is True
    assert cal_j["eval_split"] == "walk_forward_dev"
    oc.assert_no_forbidden_public_fields(cal_j)

    state_j = json.loads(state_p.read_text(encoding="utf-8"))
    assert state_j["weights_trained_strictly_before"] == "2025-02-02"
    live_row = synthesize_live_intl_row(
        home_team="México",
        away_team="Estados Unidos",
        regime="INTL_NAT",
        match_date_iso="2026-11-18",
        causal_states=state_j["teams"],
        city="Ciudad de México",
        country="Mexico",
        is_neutral=False,
    )
    assert len(live_row["features"]) == 38
    assert all(np.isfinite(live_row["features"]))


def test_meridian_v2_causality_goalscorers_and_artifacts(tmp_path: Path) -> None:
    # 1. Prueba exacta de Time-in-Lead sobre CSV sintético de goalscorers
    gs_csv = tmp_path / "goalscorers_synth.csv"
    gs_csv.write_text(
        "date,home_team,away_team,team,scorer,minute,own_goal,penalty\n"
        "2023-03-24,Argentina,Uruguay,Argentina,Lionel Messi,30,FALSE,TRUE\n"
        "2023-03-24,Argentina,Uruguay,Argentina,Julian Alvarez,60,FALSE,FALSE\n",
        encoding="utf-8",
    )
    gs_map = build_goalscorers_match_summary(gs_csv, max_date_exclusive="2025-02-02")
    rec = gs_map[("2023-03-24", "ARG", "URU")]
    assert rec["pk_h"] == 1
    assert rec["og_h"] == 0
    assert rec["n_unique_scorers_h"] == 2
    # Argentina anota en el 30' y lidera los 60 minutos restantes de 90' -> ratio = 60/90 = 2/3
    assert rec["time_in_lead_ratio"] == pytest.approx(60.0 / 90.0, abs=1e-12)

    # 2. Invarianza temporal estricta (`0.0` bits) en las 49 features de Meridian v2.0
    tm_pl_csv = tmp_path / "tm_players_synth.csv"
    tm_pl_csv.write_text(
        "player_id,country_of_citizenship,date_of_birth,position\n"
        "10,Argentina,1997-08-22,Attack\n"
        "11,Brazil,2000-07-12,Attack\n"
        "12,Uruguay,1998-07-22,Midfield\n",
        encoding="utf-8",
    )
    tm_val_csv = tmp_path / "tm_vals_synth.csv"
    tm_val_csv.write_text(
        "player_id,date,market_value_in_eur,player_club_domestic_competition_id\n"
        "10,2022-11-01,80000000,IT1\n"
        "11,2022-11-01,120000000,ES1\n"
        "12,2022-11-01,90000000,ES1\n",
        encoding="utf-8",
    )

    df_orig = _synthetic_intl_matches()
    v2_orig, _ = build_intl_v2_causal_dataset(
        df_orig,
        enforce_before_holdout=True,
        goalscorers_path=gs_csv,
        tm_players_path=tm_pl_csv,
        tm_valuations_path=tm_val_csv,
    )

    df_mut = df_orig.copy()
    df_mut.loc[4, "home_goals"] = 0
    df_mut.loc[4, "away_goals"] = 8
    df_mut.loc[4, "y"] = 2
    v2_mut, _ = build_intl_v2_causal_dataset(
        df_mut,
        enforce_before_holdout=True,
        goalscorers_path=gs_csv,
        tm_players_path=tm_pl_csv,
        tm_valuations_path=tm_val_csv,
    )

    cols49 = list(INTL_BASE_38_FEATURES) + list(ALL_V2_EXTRA_COLS)
    diff_pre_v2 = np.max(np.abs(v2_orig.loc[:4, cols49].to_numpy() - v2_mut.loc[:4, cols49].to_numpy()))
    assert diff_pre_v2 == 0.0
    diff_post_v2 = np.max(np.abs(v2_orig.loc[6, cols49].to_numpy() - v2_mut.loc[6, cols49].to_numpy()))
    assert diff_post_v2 > 1e-3

    # 3. Artefactos exportados de Meridian v2.0
    pred_dir = REPO_ROOT / "src" / "data" / "prediction"
    m2_j = json.loads((pred_dir / "model_intl_soccer_v2.json").read_text(encoding="utf-8"))
    st2_j = json.loads((pred_dir / "intl_soccer_causal_state_v2.json").read_text(encoding="utf-8"))
    cal2_j = json.loads((pred_dir / "intl_outlook_calibration_v2.json").read_text(encoding="utf-8"))

    assert m2_j["codename"] == "PitchLab Meridian v2.0"
    assert m2_j["status"] == "candidate"
    assert m2_j["production_activated"] is False
    assert m2_j["n_features_base"] == 49
    assert len(m2_j["features"]) == 55
    assert st2_j["weights_trained_strictly_before"] == "2025-02-02"
    assert cal2_j["holdout_sealed_untouched"] is True
    oc.assert_no_forbidden_public_fields(cal2_j)

    live_v2 = synthesize_live_intl_v2_row(
        home_team="Colombia",
        away_team="Inglaterra",
        regime="INTL_WC",
        match_date_iso="2026-07-04",
        causal_states_v2=st2_j["teams"],
        city="Miami Gardens",
        country="United States",
        is_neutral=True,
    )
    assert len(live_v2["features"]) == 49
    assert all(np.isfinite(live_v2["features"]))
    assert compute_thermal_climate_mismatch(
        home_base_lat=10.9231, away_base_lat=51.556, venue_lat=25.958, venue_elev_m=3.0, match_month=7
    ) > 0.0


def test_meridian_v3_worldbank_strict_lag_and_artifacts(tmp_path: Path) -> None:
    # Verificar que un salto extremo de PIB/población en 2024 jamás se filtre a un partido de 2024 (`Year <= match_year - 1`)
    pop_csv = tmp_path / "wb_pop_synth.csv"
    pop_csv.write_text(
        "Country Name,Country Code,Year,Value\n"
        "Argentina,ARG,2023,46000000\n"
        "Argentina,ARG,2024,900000000\n",
        encoding="utf-8",
    )
    gdp_csv = tmp_path / "wb_gdp_synth.csv"
    gdp_csv.write_text(
        "Country Name,Country Code,Year,Value\n"
        "Argentina,ARG,2023,640000000000\n"
        "Argentina,ARG,2024,99000000000000\n",
        encoding="utf-8",
    )
    wb = CausalWorldBankMacroBridge(pop_path=pop_csv, gdp_path=gdp_csv, max_year_inclusive=2024)
    m_2024 = wb.lookup_macro("ARG", 2024, "CONMEBOL")
    assert m_2024["wb_log10_pop"] == pytest.approx(np.log10(46000000.0), abs=1e-12)

    pred_dir = REPO_ROOT / "src" / "data" / "prediction"
    m3_j = json.loads((pred_dir / "model_intl_soccer_v3.json").read_text(encoding="utf-8"))
    st3_j = json.loads((pred_dir / "intl_soccer_causal_state_v3.json").read_text(encoding="utf-8"))
    cal3_j = json.loads((pred_dir / "intl_outlook_calibration_v3.json").read_text(encoding="utf-8"))

    assert m3_j["codename"] == "PitchLab Meridian v3.0"
    assert m3_j["status"] == "candidate"
    assert m3_j["production_activated"] is False
    assert m3_j["n_features_base"] == 53
    assert cal3_j["holdout_sealed_untouched"] is True
    oc.assert_no_forbidden_public_fields(cal3_j)

    live_v3 = synthesize_live_intl_v3_row(
        home_team="Marruecos",
        away_team="España",
        regime="INTL_WC",
        match_date_iso="2026-07-02",
        causal_states_v3=st3_j["teams"],
        selected_extra_v3_cols=tuple(st3_j["v3_extra_features"]),
        city="East Rutherford",
        country="United States",
        is_neutral=True,
    )
    assert len(live_v3["features"]) == 53
    assert all(np.isfinite(live_v3["features"]))
