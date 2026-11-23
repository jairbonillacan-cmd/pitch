"""Unit, mathematical-invariant, and governance tests for `EXP_V60` (`PitchLab Multi-Sport v6.0`)."""

from __future__ import annotations

import sys

sys.dont_write_bytecode = True

import json
import math
import unittest

from run_exp_v60_multisport_v6_0 import (
    ARTIFACTS_DIR,
    PRED_DATA_DIR,
    evaluate_brownian_early_payout_v60,
    project_mlb_walkforward_outlook_v60,
    project_multisport_matchup_from_state_v60,
    project_nba_walkforward_outlook_v60,
    project_nfl_walkforward_outlook_v60,
    project_nhl_walkforward_outlook_v60,
    safe_ece_binary_pure,
    safe_promoted_ece_pure,
    solve_nfl_key_margin_pmf_v60,
)

FORBIDDEN_SUBSTRINGS = (
    '"stake"',
    '"kelly"',
    '"kellyFraction"',
    '"expectedEdge"',
    '"ev"',
    '"tier"',
)


class TestExpV60MultiSportV60(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.model_art = json.loads(
            (PRED_DATA_DIR / "model_multisport_v6_0_candidate.json").read_text(encoding="utf-8")
        )
        cls.snap = json.loads(
            (PRED_DATA_DIR / "multisport_v6_0_snapshot.json").read_text(encoding="utf-8")
        )
        cls.results = json.loads(
            (ARTIFACTS_DIR / "exp_v60_multisport_v6_0_results.json").read_text(encoding="utf-8")
        )

    def test_kepler_mlb_axiom_8_f5_manfred_and_monotonic_totals(self) -> None:
        elite_weak = project_mlb_walkforward_outlook_v60(
            {
                "home_woba_override": 0.345,
                "away_woba_override": 0.285,
                "neutral_site": True,
                "park_weather_mult_override": 1.0,
            },
            self.model_art,
        )
        ratio = elite_weak["full_game"]["mu_9inn_home"] / elite_weak["full_game"]["mu_9inn_away"]
        self.assertGreaterEqual(ratio, 1.38)

        avg_g = project_mlb_walkforward_outlook_v60(
            {
                "home_woba_override": 0.312,
                "away_woba_override": 0.312,
                "home_sp_fip_override": 4.08,
                "away_sp_fip_override": 4.08,
                "home_bp_fip_override": 4.08,
                "away_bp_fip_override": 4.08,
                "neutral_site": False,
                "park_weather_mult_override": 1.0,
            },
            self.model_art,
        )
        self.assertGreaterEqual(avg_g["full_game"]["expected_total_runs"], 8.65)
        self.assertLessEqual(avg_g["full_game"]["expected_total_runs"], 8.95)
        self.assertAlmostEqual(avg_g["p_home"] + avg_g["p_away"], 1.0, places=12)
        self.assertAlmostEqual(
            avg_g["f5"]["p_home"] + avg_g["f5"]["p_tie"] + avg_g["f5"]["p_away"],
            1.0,
            places=12,
        )
        self.assertGreater(avg_g["full_game"]["extra_innings_over_correction_pp"], 1.5)
        t_map = avg_g["full_game"]["totals_by_line"]
        self.assertGreaterEqual(t_map["7.5"]["p_over"], t_map["8.5"]["p_over"])
        self.assertGreaterEqual(t_map["8.5"]["p_over"], t_map["9.5"]["p_over"])

    def test_curvature_nhl_empty_net_exact_ot_conservation_and_unconfirmed_goalie(self) -> None:
        out = project_nhl_walkforward_outlook_v60(
            {
                "home_elo": 1545.0,
                "away_elo": 1475.0,
                "home_b2b": False,
                "away_b2b": True,
                "total_line": 6.0,
            },
            self.model_art,
        )
        self.assertFalse(out["goalie_confirmed_home"])
        self.assertFalse(out["goalie_confirmed_away"])
        self.assertEqual(out["goalie_quality_flag"], "unconfirmed_goalie_warning")
        self.assertLess(out["ot_conservation_residual"], 1e-13)
        self.assertAlmostEqual(out["p_home"] + out["p_away"], 1.0, places=12)
        self.assertAlmostEqual(
            out["p_home_reg"] + out["p_ot_reg"] + out["p_away_reg"],
            1.0,
            places=12,
        )
        self.assertGreater(out["totals_by_line"]["6.0"]["p_push"], 0.08)
        self.assertGreaterEqual(
            out["totals_by_line"]["5.5"]["p_over"],
            out["totals_by_line"]["6.0"]["p_over"],
        )
        self.assertGreaterEqual(
            out["totals_by_line"]["6.0"]["p_over"],
            out["totals_by_line"]["6.5"]["p_over"],
        )

    def test_tensor_nba_injuries_widen_sigma_and_b2b_shifts_margin(self) -> None:
        clean = project_nba_walkforward_outlook_v60(
            {"home_injuries_out": 0, "away_injuries_out": 0, "home_injuries_questionable": 0},
            self.model_art,
        )
        injured = project_nba_walkforward_outlook_v60(
            {"home_injuries_out": 3, "away_injuries_out": 0, "home_injuries_questionable": 2},
            self.model_art,
        )
        self.assertLess(injured["expected_margin"], clean["expected_margin"])
        self.assertGreater(injured["sigma_margin_effective"], clean["sigma_margin_effective"])

        b2b_home = project_nba_walkforward_outlook_v60(
            {"home_b2b": True, "home_3in4": True},
            self.model_art,
        )
        self.assertLess(b2b_home["expected_margin"], clean["expected_margin"])

    def test_minkowski_nfl_key_numbers_std_and_discrete_push_mass(self) -> None:
        sol50 = solve_nfl_key_margin_pmf_v60(0.0, 0.004, self.model_art["physics_config"]["nfl"])
        self.assertGreaterEqual(sol50["std_margin"], 13.0)
        self.assertLessEqual(sol50["std_margin"], 13.8)
        # Key numbers 3 and 7 strictly exceed adjacent non-key numbers 2, 4, 8
        c = sol50["max_abs_margin"]
        self.assertGreater(sol50["pmf"][c + 3], sol50["pmf"][c + 2])
        self.assertGreater(sol50["pmf"][c + 3], sol50["pmf"][c + 4])
        self.assertGreater(sol50["pmf"][c + 7], sol50["pmf"][c + 8])

        nfl_out = project_nfl_walkforward_outlook_v60(
            {"spread_line_home": -3.0, "total_line": 44.0},
            self.model_art,
        )
        self.assertGreater(nfl_out["p_spread_push"], 0.05)
        self.assertEqual(nfl_out["spreads_by_line"]["-3.5"]["p_push"], 0.0)
        self.assertGreater(nfl_out["p_push"], 0.02)
        self.assertEqual(nfl_out["totals_by_line"]["44.5"]["p_push"], 0.0)

    def test_early_payout_algebraic_dominance_and_extremes(self) -> None:
        for p_test in (0.0005, 0.01, 0.25, 0.50, 0.75, 0.99, 0.9998):
            ep = evaluate_brownian_early_payout_v60(
                sport="nba",
                p_home_win=p_test,
                p_away_win=1.0 - p_test,
                trigger_lead=20,
                sigma_margin=12.6,
                effective_barrier=18.8,
                intra_game_status="theoretical_reflection_intra_game_no_2026_pbp_trace",
            )
            self.assertGreaterEqual(ep["p_home_early_payout_win"], ep["p_home_regular_win"])
            self.assertGreaterEqual(ep["p_away_early_payout_win"], ep["p_away_regular_win"])

        self.assertEqual(self.results["governance"]["early_payout_dominance_violations"], 0)
        self.assertEqual(self.results["governance"]["early_payout_games_checked"], 2920)

    def test_governance_counts_empty_slices_and_zero_forbidden_fields(self) -> None:
        self.assertTrue(self.results["holdout_sealed_untouched"])
        self.assertFalse(self.results["production_activated"])
        self.assertFalse(self.results["hyperparameter_tuning_on_holdout"])
        self.assertEqual(
            self.results["governance"]["games_by_sport"],
            {"mlb": 2202, "nhl": 346, "nba": 222, "nfl": 150},
        )
        self.assertGreaterEqual(self.snap["parity_cases_count"], 40)
        self.assertIsNone(safe_ece_binary_pure([], []))
        self.assertIsNone(safe_promoted_ece_pure([0, 1], [0.40, 0.45], threshold=0.90)["promoted_ece"])

        for pth in (
            PRED_DATA_DIR / "model_multisport_v6_0_candidate.json",
            PRED_DATA_DIR / "multisport_v6_0_snapshot.json",
            ARTIFACTS_DIR / "exp_v60_multisport_v6_0_results.json",
        ):
            raw_txt = pth.read_text(encoding="utf-8")
            for bad in FORBIDDEN_SUBSTRINGS:
                self.assertNotIn(bad, raw_txt, f"Forbidden key {bad} found in {pth.name}")

        # Verify state matchup lookup works for Utah Mammoth (`nhl.utah-mammoth`) and Athletics (`mlb.athletics`)
        nhl_utah = project_multisport_matchup_from_state_v60(
            sport="nhl",
            home_team="nhl.utah-mammoth",
            away_team="nhl.colorado-avalanche",
            game_date="2026-11-20",
            neutral_site=False,
            artifact=self.model_art,
        )
        self.assertAlmostEqual(nhl_utah["p_home"] + nhl_utah["p_away"], 1.0, places=12)

        mlb_ath = project_multisport_matchup_from_state_v60(
            sport="mlb",
            home_team="mlb.athletics",
            away_team="mlb.seattle-mariners",
            game_date="2027-03-26",
            neutral_site=False,
            artifact=self.model_art,
        )
        self.assertAlmostEqual(mlb_ath["p_home"] + mlb_ath["p_away"], 1.0, places=12)


if __name__ == "__main__":
    unittest.main()
