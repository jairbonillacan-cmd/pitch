"""Tests de gobernanza y coherencia probabilística para EXP_V51 (`Micro-Markets v5.0` HGB-Poisson + Red Cards + Booking Points)."""

from __future__ import annotations

import json
from pathlib import Path
import sys

EXP_DIR = Path(__file__).resolve().parent
if str(EXP_DIR) not in sys.path:
    sys.path.insert(0, str(EXP_DIR))

from run_micro_markets_v5_0 import MICRO_V5_MODEL_OUT, MICRO_V5_SNAPSHOT_OUT, RESULTS_OUT  # noqa: E402


def test_exp_v51_hgb_poisson_and_disciplinary_markets_governance() -> None:
    assert MICRO_V5_MODEL_OUT.exists()
    assert MICRO_V5_SNAPSHOT_OUT.exists()
    assert RESULTS_OUT.exists()

    art = json.loads(MICRO_V5_MODEL_OUT.read_text(encoding="utf-8"))
    assert art["status"] == "candidate"
    assert art["production_activated"] is False
    assert art["holdout_sealed_untouched"] is True
    assert "red_cards_model" in art

    res = json.loads(RESULTS_OUT.read_text(encoding="utf-8"))
    assert res["oos_red_cards_over_0_5_vs_climatology"]["delta_ll"] < 0.0
    assert res["oos_booking_points_vs_climatology"]["45.5"]["delta_ll"] < 0.0
    assert res["oos_booking_points_vs_climatology"]["45.5"]["significance"] == "significativa"
