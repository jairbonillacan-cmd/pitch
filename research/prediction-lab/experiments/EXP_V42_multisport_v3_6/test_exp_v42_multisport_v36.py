"""Suite Pytest de verificación para EXP_V42 (`multisport_v3_6`)."""

from __future__ import annotations

import json
from pathlib import Path
import sys

EXP_DIR = Path(__file__).resolve().parent
if str(EXP_DIR) not in sys.path:
    sys.path.insert(0, str(EXP_DIR))

from run_multisport_v3_6 import (  # noqa: E402
    CONFIG_OUT,
    RESULTS_OUT,
    SNAPSHOT_OUT,
    project_mlb_v36_exact,
    project_nba_v36_exact,
    project_nhl_v36_exact,
)


def test_mlb_extra_innings_eliminates_truncation_bias_and_handles_openers() -> None:
    cfg = json.loads(CONFIG_OUT.read_text(encoding="utf-8"))
    out = project_mlb_v36_exact(
        {
            "home_is_opener": True,
            "away_is_opener": False,
            "total_line": 7.5,
        },
        cfg,
    )
    assert abs((out["p_home"] + out["p_away"]) - 1.0) < 1e-12
    assert abs((out["f5"]["p_home"] + out["f5"]["p_tie"] + out["f5"]["p_away"]) - 1.0) < 1e-12
    # El juego completo con extra innings SIEMPRE supera al truncado de 9 entradas de Astra AI
    assert out["full_game"]["p_over_cond_no_push"] > out["full_game"]["p_over_9inn_truncated_astra_bug"]
    assert out["full_game"]["extra_innings_over_correction_pp"] > 1.5


def test_nhl_ot_conservation_and_nba_star_injury_sensitivity() -> None:
    cfg = json.loads(CONFIG_OUT.read_text(encoding="utf-8"))
    nhl = project_nhl_v36_exact({"home_goalie_confirmed": True, "away_goalie_confirmed": False, "total_line": 6.0}, cfg)
    assert nhl["goalie_quality_flag"] == "unconfirmed_goalie_warning"
    assert nhl["ot_conservation_residual"] < 1e-11
    assert nhl["p_push"] > 0.0

    nba_healthy = project_nba_v36_exact({"structural_margin_with_hca": 3.0, "home_missing_impact_pts": 0.0}, cfg)
    nba_star_out = project_nba_v36_exact({"structural_margin_with_hca": 3.0, "home_missing_impact_pts": 6.5}, cfg)
    assert nba_star_out["p_home"] < nba_healthy["p_home"] - 0.15


def test_exp_v42_artifacts_governance() -> None:
    assert CONFIG_OUT.exists()
    assert SNAPSHOT_OUT.exists()
    assert RESULTS_OUT.exists()
    cfg = json.loads(CONFIG_OUT.read_text(encoding="utf-8"))
    assert cfg["status"] == "candidate"
    assert cfg["production_activated"] is False
    assert cfg["holdout_sealed_untouched"] is True
