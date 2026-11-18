"""Tests de dependencia de cola Student-t, superposición estructural Jugador-Partido y gobernanza para EXP_V55."""

from __future__ import annotations

import json
from pathlib import Path
import sys

EXP_DIR = Path(__file__).resolve().parent
if str(EXP_DIR) not in sys.path:
    sys.path.insert(0, str(EXP_DIR))

from run_sgp_v5_0_student_t_player import (  # noqa: E402
    RESULTS_OUT,
    SGP_V5_MODEL_OUT,
    SGP_V5_SNAPSHOT_OUT,
    evaluate_player_linked_sgp_scalar,
)


def test_exp_v55_student_t_and_player_linked_sgp_governance() -> None:
    assert SGP_V5_MODEL_OUT.exists()
    assert SGP_V5_SNAPSHOT_OUT.exists()
    assert RESULTS_OUT.exists()

    art = json.loads(SGP_V5_MODEL_OUT.read_text(encoding="utf-8"))
    assert art["status"] == "candidate"
    assert art["production_activated"] is False

    pl_ev = evaluate_player_linked_sgp_scalar(0.38, 1.85, 1.05, "team_win", 2.5)
    # Condicionar a que el delantero anote incrementa estructuralmente `P(Equipo Gana n Over 2.5)` sobre independencia
    assert pl_ev["joint_probability"] > pl_ev["independent_probability"] * 1.25
    assert pl_ev["joint_probability"] <= pl_ev["p_player_scores"]

    res = json.loads(RESULTS_OUT.read_text(encoding="utf-8"))
    assert res["holdout_sealed_untouched"] is True
    assert res["player_linked_2leg_scorer_and_win_oos"]["delta_ll"] < 0.0
    assert res["player_linked_3leg_scorer_win_over25_oos"]["delta_ll"] < 0.0
    assert res["player_linked_3leg_scorer_win_over25_oos"]["significance"] == "significativa"
