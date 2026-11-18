"""Suite Pytest de verificación para EXP_V41 (`hierarchical_props` v3.6)."""

from __future__ import annotations

import json
from pathlib import Path
import sys

EXP_DIR = Path(__file__).resolve().parent
if str(EXP_DIR) not in sys.path:
    sys.path.insert(0, str(EXP_DIR))

from run_props_experiment import (  # noqa: E402
    HOLDOUT_CUT_ISO,
    PROPS_MODEL_OUT,
    PROPS_SNAPSHOT_OUT,
    RESULTS_OUT,
    project_soccer_player_prop_exact,
)


def test_3_of_3_shrinkage_prevents_100pct_scoutpicks_bug() -> None:
    """Caso real documentado en Cap. 14/17: 3 aciertos en 3 juegos jamás debe producir P = 100%."""
    out = project_soccer_player_prop_exact(
        weighted_sum_y=3.0,
        weighted_exposure_90=2.6,
        prior_rate_per90=0.22,
        prior_beta_90=10.0,
        phi_dispersion=18.0,
        expected_minutes_starter=78.0,
        lineup_status="confirmed_starter",
        team_goal_factor=1.0,
        opp_def_factor=1.0,
        referee_factor=1.0,
        context_weight=1.0,
        cal_slope=1.0,
        cal_intercept=0.0,
        line=0.5,
    )
    assert 0.001 < out["p_over_calibrated"] < 0.75
    assert abs(out["p_over_calibrated"] + out["p_under_calibrated"] - 1.0) < 1e-13
    assert out["p_over_sub_cover"] >= out["p_over_calibrated"]


def test_exp_v41_artifacts_and_scoutpicks_victory() -> None:
    assert PROPS_MODEL_OUT.exists(), "Falta model_hierarchical_props_v3_6_candidate.json"
    assert PROPS_SNAPSHOT_OUT.exists(), "Falta hierarchical_props_v3_6_snapshot.json"
    assert RESULTS_OUT.exists(), "Falta exp_v41_hierarchical_props_results.json"

    art = json.loads(PROPS_MODEL_OUT.read_text(encoding="utf-8"))
    assert art["status"] == "candidate"
    assert art["production_activated"] is False
    assert art["holdout_sealed_untouched"] is True
    assert art["holdout_cut_utc"] == HOLDOUT_CUT_ISO

    res = json.loads(RESULTS_OUT.read_text(encoding="utf-8"))
    for pf in ("goals", "goals_assists", "yellow_cards"):
        cmp_sp = res["soccer_props_oos_2020_2024"][pf]["vs_scoutpicks_multilens_all"]
        assert cmp_sp["delta_ll"] < 0.0
        assert cmp_sp["significance"] == "significativa"
        assert cmp_sp["cand_ece"] < cmp_sp["bench_ece"]
