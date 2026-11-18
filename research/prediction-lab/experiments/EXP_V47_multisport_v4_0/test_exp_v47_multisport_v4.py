"""Tests de integridad matemática y gobernanza para EXP_V47 (`Multi-Sport v4.0`)."""

from __future__ import annotations

import json
from pathlib import Path
import sys

EXP_DIR = Path(__file__).resolve().parent
if str(EXP_DIR) not in sys.path:
    sys.path.insert(0, str(EXP_DIR))

from run_multisport_v4_0 import (  # noqa: E402
    RESULTS_OUT,
    SNAP_V40_OUT,
    STATE_V40_OUT,
    project_ncaaf_v40_exact,
)


def test_ncaaf_horizon_v40_altitude_and_key_numbers() -> None:
    sea = project_ncaaf_v40_exact(
        {
            "home_power_rating": 5.0,
            "away_power_rating": 5.0,
            "home_elevation_m": 50.0,
            "away_elevation_m": 50.0,
            "spread_line_home": -3.0,
        }
    )
    high_alt = project_ncaaf_v40_exact(
        {
            "home_power_rating": 5.0,
            "away_power_rating": 5.0,
            "home_elevation_m": 2199.0,  # Laramie, Wyoming
            "away_elevation_m": 50.0,
            "spread_line_home": -3.0,
        }
    )
    assert high_alt["altitude_hypoxia_adv_pts"] > 2.0
    assert high_alt["p_home"] > sea["p_home"]
    assert sea["p_spread_push"] > 0.03  # masa discreta en -3.0


def test_exp_v47_governance_and_rmse_lifts() -> None:
    assert STATE_V40_OUT.exists()
    assert SNAP_V40_OUT.exists()
    assert RESULTS_OUT.exists()

    st = json.loads(STATE_V40_OUT.read_text(encoding="utf-8"))
    assert st["status"] == "candidate"
    assert st["production_activated"] is False
    assert st["holdout_sealed_untouched"] is True
    assert st["n_total_teams"] >= 220

    res = json.loads(RESULTS_OUT.read_text(encoding="utf-8"))
    assert res["pre_holdout_validation"]["mlb_2024"]["win_pct_rmse_v4"] < res["pre_holdout_validation"]["mlb_2024"]["win_pct_rmse_flat"]
    assert res["pre_holdout_validation"]["nhl_2023_24"]["pts_pct_rmse_v4"] < res["pre_holdout_validation"]["nhl_2023_24"]["pts_pct_rmse_flat"]
    assert res["pre_holdout_validation"]["ncaaf_2024"]["win_pct_rmse_v4"] < res["pre_holdout_validation"]["ncaaf_2024"]["win_pct_rmse_flat"]
    assert res["pre_holdout_validation"]["nhl_2023_24"]["max_ot_conservation_residual"] < 1e-12
