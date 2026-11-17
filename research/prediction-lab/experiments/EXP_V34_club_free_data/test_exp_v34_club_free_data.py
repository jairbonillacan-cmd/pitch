"""Suite de pruebas de causalidad estricta, StatsBomb P1-1, puente Transfermarkt CC0 (Ola 1 y Ola 2) y gobernanza de EXP_V34 / EXP_V36."""

from __future__ import annotations

import json
from pathlib import Path
import sys

import numpy as np
import pandas as pd
import pytest

EXP_DIR = Path(__file__).resolve().parent
REPO_ROOT = EXP_DIR.parents[3]
PRED_LAB_ROOT = REPO_ROOT / "research" / "prediction-lab"

for _p in (str(REPO_ROOT), str(PRED_LAB_ROOT / "models" / "a"), str(EXP_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from club_free_sources import (  # noqa: E402
    ARTIFACTS_DIR,
    CausalClubTransfermarktBridge,
    extract_matches_parquet_free_signals,
)
from club_wave2_sources import CausalClubWave2Bridge  # noqa: E402
from export_club_live_state_v3_4 import compute_live_club_free_14_vector  # noqa: E402
from run_club_experiment import _compute_statsbomb_ewm_feature  # noqa: E402


def _synthetic_club_matches() -> pd.DataFrame:
    rows = [
        ("M1", "2023-08-12", "15:00", "E0", "2023-2024", "Arsenal", "Everton", 2, 0, 1, 0, 15, 6, 7, 2, 8, 3, 1, 2, 0, 1, "M Oliver"),
        ("M2", "2023-08-19", "15:00", "E0", "2023-2024", "Everton", "Chelsea", 0, 1, 0, 0, 8, 14, 2, 5, 4, 7, 3, 1, 0, 0, "A Taylor"),
        ("M3", "2023-08-26", "15:00", "E0", "2023-2024", "Arsenal", "Chelsea", 3, 1, 2, 0, 17, 9, 8, 3, 9, 4, 2, 2, 1, 0, "M Oliver"),
        ("M4", "2023-09-02", "15:00", "E0", "2023-2024", "Chelsea", "Arsenal", 1, 1, 0, 1, 11, 12, 4, 5, 5, 6, 2, 3, 0, 0, "M Oliver"),
    ]
    cols = [
        "match_id", "match_date", "kickoff_time", "div", "season", "home_team", "away_team",
        "home_goals", "away_goals", "ht_home_goals", "ht_away_goals",
        "shots_home", "shots_away", "sot_home", "sot_away",
        "corners_home", "corners_away", "yellows_home", "yellows_away",
        "reds_home", "reds_away", "referee",
    ]
    df = pd.DataFrame(rows, columns=cols)
    df["match_date"] = pd.to_datetime(df["match_date"])
    return df


def test_club_internal_and_statsbomb_signals_strict_causality() -> None:
    df_orig = _synthetic_club_matches()
    sb_cal = json.loads((ARTIFACTS_DIR / "statsbomb_p1_1_xg_calibration.json").read_text(encoding="utf-8"))
    assert sb_cal["home"]["r2_vs_statsbomb_xg"] > 0.45
    assert sb_cal["away"]["r2_vs_statsbomb_xg"] > 0.45

    int_orig = extract_matches_parquet_free_signals(df_orig)
    sb_orig = _compute_statsbomb_ewm_feature(df_orig, sb_cal)

    assert int_orig.loc[1, "prev_reds_diff"] == pytest.approx(-1.0, abs=1e-12)

    df_mut = df_orig.copy()
    df_mut.loc[2, "home_goals"] = 0
    df_mut.loc[2, "away_goals"] = 7
    df_mut.loc[2, "reds_home"] = 3
    df_mut.loc[2, "sot_home"] = 0
    df_mut.loc[2, "sot_away"] = 14
    df_mut.loc[2, "shots_away"] = 22

    int_mut = extract_matches_parquet_free_signals(df_mut)
    sb_mut = _compute_statsbomb_ewm_feature(df_mut, sb_cal)

    int_cols = [c for c in int_orig.columns if c != "match_id"]
    assert np.max(np.abs(int_orig.loc[:2, int_cols].to_numpy() - int_mut.loc[:2, int_cols].to_numpy())) == 0.0
    assert np.max(np.abs(sb_orig.loc[:2, ["sb_xg_diff_ewm8"]].to_numpy() - sb_mut.loc[:2, ["sb_xg_diff_ewm8"]].to_numpy())) == 0.0
    assert np.max(np.abs(int_orig.loc[3, int_cols].to_numpy() - int_mut.loc[3, int_cols].to_numpy())) > 1e-2


def test_transfermarkt_wave1_wave2_and_v34_live_complete_governance() -> None:
    br = CausalClubTransfermarktBridge(max_date_exclusive="2025-02-02")
    cid_mc = br.resolve_club_id("E0", "Man City")
    assert cid_mc is not None
    assert br.resolve_club_id("SP1", "Ath Madrid") is not None
    assert br.resolve_club_id("D1", "Hamburg") is not None
    assert br.resolve_club_id("BRA", "Flamengo RJ") is not None

    w2 = CausalClubWave2Bridge(max_date_exclusive="2025-02-02")
    w2_mc = w2.lookup_club_wave2(cid_mc, pd.Timestamp("2024-04-20").toordinal())
    assert w2_mc["has_realized_xi"] == 1.0
    assert w2_mc["realized_xi_log_val"] > 5.0

    pred_dir = REPO_ROOT / "src" / "data" / "prediction"
    for fname, expected_code, expected_base in (
        ("model_club_v3_3_candidate.json", "PitchLab Tachyon v3.3 Candidate", 120),
        ("model_club_v3_4_candidate.json", "PitchLab Tachyon v3.4 Candidate", 127),
        ("model_club_v3_4_live_candidate.json", "PitchLab Tachyon v3.4 Live-Complete", 52),
    ):
        mj = json.loads((pred_dir / fname).read_text(encoding="utf-8"))
        assert mj["codename"] == expected_code
        assert mj["status"] == "candidate"
        assert mj["production_activated"] is False
        assert mj["n_features_base"] == expected_base

    st_live = json.loads((pred_dir / "club_free_open_state_v3_4.json").read_text(encoding="utf-8"))
    assert st_live["weights_trained_strictly_before"] == "2025-02-02"
    v14 = compute_live_club_free_14_vector(
        div="E0",
        home_team="Arsenal",
        away_team="Man City",
        elo_diff_no_hfa=35.0,
        h_div_change=0.0,
        a_div_change=0.0,
        club_state_art=st_live,
    )
    assert len(v14) == 14
    assert all(np.isfinite(v14))
