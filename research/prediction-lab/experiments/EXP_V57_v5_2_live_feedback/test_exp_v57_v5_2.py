"""Unit and governance tests for `EXP_V57` (`PitchLab v5.2 Live-Feedback`)."""

from __future__ import annotations

import json
from pathlib import Path
import unittest

from run_exp_v57_live_feedback import (
    ARTIFACTS_DIR,
    PRED_DATA_DIR,
    dixon_coles_markets_exact,
    estimate_effective_exposure_90,
    project_goalkeeper_saves_outlook_v52,
    recalibrate_playable_binary_prob_v52,
)


class TestExpV57LiveFeedback(unittest.TestCase):
    def test_dixon_coles_probability_simplex_and_monotonicity(self) -> None:
        dc = dixon_coles_markets_exact(1.58, 1.12, -0.105, 12)
        self.assertAlmostEqual(dc["pHome"] + dc["pDraw"] + dc["pAway"], 1.0, places=12)
        self.assertGreaterEqual(dc["pOver15"], dc["pOver25"])
        self.assertGreaterEqual(dc["pOver25"], dc["pOver35"])

    def test_goalkeeper_saves_bounds_and_exposure(self) -> None:
        art = json.loads((PRED_DATA_DIR / "model_v5_2_live_feedback_candidate.json").read_text(encoding="utf-8"))
        out = project_goalkeeper_saves_outlook_v52(
            saves=34,
            shots_faced=46,
            goals_conceded=12,
            appearances=11,
            sub_ins=0,
            opp_expected_sot=4.8,
            line=2.5,
            expected_minutes=90.0,
            config=art,
        )
        self.assertGreater(out["pOver"], 0.01)
        self.assertLess(out["pOver"], 0.99)
        self.assertAlmostEqual(out["pOver"] + out["pUnder"], 1.0, places=12)
        self.assertLess(estimate_effective_exposure_90(12, 8, "FWD"), estimate_effective_exposure_90(12, 0, "FWD"))

    def test_artifacts_and_holdout_governance(self) -> None:
        res = json.loads((ARTIFACTS_DIR / "exp_v57_v5_2_results.json").read_text(encoding="utf-8"))
        self.assertTrue(res["holdout_sealed_untouched"])
        self.assertFalse(res["production_activated"])
        self.assertTrue(
            res["multi_league_football_v52"]["season_results_43_leagues_1x2_walkforward"]["significant_improvement"]
        )
        self.assertTrue(
            res["us_multisport_walkforward_oos_v52"]["mlb"]["moneyline_vs_coin_oos"]["significant_improvement"]
        )
        self.assertTrue(
            res["us_multisport_walkforward_oos_v52"]["nba"]["moneyline_vs_coin_oos"]["significant_improvement"]
        )

        art = json.loads((PRED_DATA_DIR / "model_v5_2_live_feedback_candidate.json").read_text(encoding="utf-8"))
        p_exp = recalibrate_playable_binary_prob_v52(0.64, True, art["football_calibration"])
        p_core = recalibrate_playable_binary_prob_v52(0.64, False, art["football_calibration"])
        self.assertLess(p_exp, p_core)


if __name__ == "__main__":
    unittest.main()
