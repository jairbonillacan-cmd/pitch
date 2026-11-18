"""Tests de integridad matemática y gobernanza para EXP_V52 (`NFL Minkowski v5.0`)."""

from __future__ import annotations

import json
from pathlib import Path
import sys

EXP_DIR = Path(__file__).resolve().parent
if str(EXP_DIR) not in sys.path:
    sys.path.insert(0, str(EXP_DIR))

from run_nfl_v5_0_complete import NFL_V5_MODEL_OUT, NFL_V5_SNAPSHOT_OUT, RESULTS_OUT  # noqa: E402


def test_exp_v52_nfl_v5_drift_free_totals_real_ats_and_props() -> None:
    assert NFL_V5_MODEL_OUT.exists()
    assert NFL_V5_SNAPSHOT_OUT.exists()
    assert RESULTS_OUT.exists()

    art = json.loads(NFL_V5_MODEL_OUT.read_text(encoding="utf-8"))
    assert art["status"] == "candidate"
    assert art["production_activated"] is False
    assert set(art["prop_markets"].keys()) >= {
        "pass_attempts",
        "completions",
        "rush_attempts",
        "qb_sacks_taken",
        "qb_rush_attempts",
    }

    res = json.loads(RESULTS_OUT.read_text(encoding="utf-8"))
    assert res["holdout_sealed_untouched"] is True
    # Verificar corrección sustancial del ECE en líneas objetivas (< 2.5% y menor que v4.0 = 4.71%)
    assert res["totals_v5_objective_ece"] < res["totals_v4_objective_ece"]
    assert res["totals_v5_objective_ece"] < 0.025
    assert res["new_pbp_player_props_oos"]["qb_sacks_taken"]["vs_naive_ewma_poisson"]["delta_ll"] < 0.0
    assert res["new_pbp_player_props_oos"]["qb_rush_attempts"]["vs_naive_ewma_poisson"]["delta_ll"] < 0.0
