"""Tests de leyes de primer paso, monotonía de Early Payout y gobernanza para EXP_V54 (`In-Play & Early Payout v5.0`)."""

from __future__ import annotations

import json
from pathlib import Path
import sys

EXP_DIR = Path(__file__).resolve().parent
if str(EXP_DIR) not in sys.path:
    sys.path.insert(0, str(EXP_DIR))

from run_inplay_early_payout_v5_0 import (  # noqa: E402
    INPLAY_MODEL_OUT,
    INPLAY_SNAPSHOT_OUT,
    RESULTS_OUT,
    evaluate_soccer_early_payout_and_inplay_scalar,
)


def test_exp_v54_early_payout_dominance_and_oos_validation() -> None:
    assert INPLAY_MODEL_OUT.exists()
    assert INPLAY_SNAPSHOT_OUT.exists()
    assert RESULTS_OUT.exists()

    art = json.loads(INPLAY_MODEL_OUT.read_text(encoding="utf-8"))
    assert art["status"] == "candidate"
    assert art["production_activated"] is False

    out = evaluate_soccer_early_payout_and_inplay_scalar(
        pregame_mu_home=1.65,
        pregame_mu_away=1.15,
        current_minute=0,
        current_home_goals=0,
        current_away_goals=0,
        red_cards_home=0,
        red_cards_away=0,
        home_already_hit_2=False,
        away_already_hit_2=False,
        soccer_cfg=art["soccer"],
    )
    assert abs((out["p_home"] + out["p_draw"] + out["p_away"]) - 1.0) < 1e-12
    assert out["p_home_early_payout"] > out["p_home"] + 0.015
    assert out["p_away_early_payout"] > out["p_away"] + 0.008

    res = json.loads(RESULTS_OUT.read_text(encoding="utf-8"))
    assert res["holdout_sealed_untouched"] is True
    assert res["club_early_payout_53k_tickets_oos"]["delta_ll"] < 0.0
    assert res["club_early_payout_53k_tickets_oos"]["significance"] == "significativa"
    assert res["inplay_halftime_to_fulltime_oos"]["delta_ll_vs_benchmark"] < 0.0
