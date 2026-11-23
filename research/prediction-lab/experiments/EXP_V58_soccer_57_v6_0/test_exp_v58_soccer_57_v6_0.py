"""Unit, Mathematical Invariant & Red-Team Governance Tests for `EXP_V58` (`Soccer-53 v6.0`)."""

from __future__ import annotations

import sys

sys.dont_write_bytecode = True

import json
import unittest

from run_exp_v58_soccer_57_v6_0 import (
    CONFEDERATION_HIERARCHY_53,
    LEAGUE_TO_CONFEDERATION,
    MODEL_OUT_PATH,
    NON_FOOTBALL_US_LEAGUES,
    PLAYABLE_ODDS_MAX,
    PLAYABLE_ODDS_MIN,
    RESULTS_OUT_PATH,
    SNAPSHOT_OUT_PATH,
    calibrate_playable_venn_abers_logit_v60,
    cluster_bootstrap_diff_v60,
    derive_coherent_soccer_markets_v60,
    logit,
    normal_cdf,
    pava_non_decreasing,
    project_soccer_57_match_v60,
    recalibrate_soccer_57_prekickoff_v60,
    safe_ece_binary_v60,
    solve_diagonal_score_matrix_4param_v60,
)

FORBIDDEN_KEYS = frozenset({"stake", "kelly", "kellyFraction", "expectedEdge", "tier"})


def _collect_all_dict_keys(obj: object, found: set[str]) -> None:
    if isinstance(obj, dict):
        for k, v in obj.items():
            found.add(str(k))
            _collect_all_dict_keys(v, found)
    elif isinstance(obj, list):
        for item in obj:
            _collect_all_dict_keys(item, found)


class TestExpV58Soccer57V60(unittest.TestCase):
    def test_53_competitions_hierarchy_and_zero_2026_status(self) -> None:
        self.assertEqual(len(NON_FOOTBALL_US_LEAGUES), 4)
        self.assertEqual(len(LEAGUE_TO_CONFEDERATION), 53)
        self.assertEqual(len(CONFEDERATION_HIERARCHY_53), 6)

        art = json.loads(MODEL_OUT_PATH.read_text(encoding="utf-8"))
        self.assertEqual(art["total_platform_leagues"], 57)
        self.assertEqual(art["total_football_competitions"], 53)
        self.assertEqual(len(art["competitions"]), 53)
        self.assertTrue(art["holdout_sealed_untouched"])
        self.assertFalse(art["production_activated"])
        self.assertEqual(art["status"], "candidate")

        zero_comps = [
            lg
            for lg, meta in art["competitions"].items()
            if meta["competition_status"] == "confederation_prior_zero_2026_games"
        ]
        active_comps = [
            lg
            for lg, meta in art["competitions"].items()
            if meta["competition_status"] == "causal_walk_forward_2026_active"
        ]
        self.assertEqual(len(zero_comps), 10)
        self.assertEqual(len(active_comps), 43)
        for lg in zero_comps:
            self.assertEqual(art["competitions"][lg]["games_2026"], 0)
            self.assertIsNone(art["competitions"][lg]["mean_raw_goals_2026"])

    def test_4param_diagonal_nb_exact_cone_and_coherent_markets(self) -> None:
        for p_h, p_d, p_a, tot_t, disp_r in (
            (0.54, 0.24, 0.22, 2.85, 500.0),
            (0.18, 0.26, 0.56, 2.35, 120.0),
            (0.39, 0.31, 0.30, 2.15, 24.0),
            (0.76, 0.15, 0.09, 3.65, 500.0),
        ):
            solved = solve_diagonal_score_matrix_4param_v60(
                p_home=p_h,
                p_draw=p_d,
                p_away=p_a,
                total_goals_target=tot_t,
                rho_prior=-0.105,
                dispersion_r=disp_r,
                max_goals=12,
                rho_draw_blend_weight=0.0,
            )
            mk = derive_coherent_soccer_markets_v60(solved["matrix"])
            self.assertLess(abs(mk["1x2"]["home"] - p_h), 1e-12)
            self.assertLess(abs(mk["1x2"]["draw"] - p_d), 1e-12)
            self.assertLess(abs(mk["1x2"]["away"] - p_a), 1e-12)
            self.assertLess(abs(solved["expectedTotalImplied"] - tot_t), 1e-12)

            # Coherent partition & overlapping market invariants
            self.assertLess(abs((mk["1x2"]["home"] + mk["1x2"]["draw"] + mk["1x2"]["away"]) - 1.0), 1e-12)
            self.assertLess(
                abs((mk["double_chance"]["1X"] + mk["double_chance"]["12"] + mk["double_chance"]["X2"]) - 2.0),
                1e-12,
            )
            self.assertGreaterEqual(mk["totals_1_5"]["over"], mk["totals_2_5"]["over"])
            self.assertGreaterEqual(mk["totals_2_5"]["over"], mk["totals_3_5"]["over"])
            self.assertLess(abs((mk["totals_2_5"]["over"] + mk["totals_2_5"]["under"]) - 1.0), 1e-12)
            self.assertLess(abs((mk["btts"]["yes"] + mk["btts"]["no"]) - 1.0), 1e-12)
            self.assertLess(abs((mk["dnb"]["home"] + mk["dnb"]["away"]) - 1.0), 1e-12)
            self.assertEqual(len(mk["topScorelines"]), 3)
            self.assertGreaterEqual(mk["topScorelines"][0]["probability"], mk["topScorelines"][1]["probability"])
            self.assertGreaterEqual(mk["topScorelines"][1]["probability"], mk["topScorelines"][2]["probability"])

    def test_inductive_venn_abers_monotonicity_and_playable_zone(self) -> None:
        art = json.loads(MODEL_OUT_PATH.read_text(encoding="utf-8"))
        va_cfg = art["venn_abers_playable_calibrator"]

        grid = [0.05 + 0.03 * i for i in range(31)]
        for is_exp in (False, True):
            evals = [calibrate_playable_venn_abers_logit_v60(p, is_exp, va_cfg) for p in grid]
            for idx in range(len(evals)):
                ev = evals[idx]
                self.assertLessEqual(ev["p0Lower"], ev["p1Upper"])
                self.assertGreater(ev["pCalibrated"], 0.0)
                self.assertLess(ev["pCalibrated"], 1.0)
                fair_raw = 1.0 / grid[idx]
                self.assertEqual(ev["inPlayableZone"], PLAYABLE_ODDS_MIN <= fair_raw <= PLAYABLE_ODDS_MAX)
                if idx > 0:
                    self.assertGreaterEqual(ev["p0Lower"] + 1e-15, evals[idx - 1]["p0Lower"])
                    self.assertGreaterEqual(ev["p1Upper"] + 1e-15, evals[idx - 1]["p1Upper"])
                    self.assertGreaterEqual(ev["pCalibrated"] + 1e-15, evals[idx - 1]["pCalibrated"])

    def test_empty_slice_returns_null_and_math_primitives(self) -> None:
        empty_boot = cluster_bootstrap_diff_v60([], [], [])
        self.assertEqual(empty_boot["n_rows"], 0)
        self.assertIsNone(empty_boot["cand_mean"])
        self.assertIsNone(empty_boot["delta_mean"])
        self.assertIsNone(empty_boot["ci95_lo"])
        self.assertIsNone(empty_boot["ci95_hi"])
        self.assertIsNone(safe_ece_binary_v60([], []))

        # Abramowitz & Stegun 7.1.26 exact IEEE-754 value at x=0.0 (`0.5000000005`, matching `math.ts`)
        self.assertAlmostEqual(normal_cdf(0.0), 0.5000000005, places=15)
        self.assertLess(abs(normal_cdf(0.0) - 0.5), 1.5e-7)
        self.assertAlmostEqual(normal_cdf(1.96) + normal_cdf(-1.96), 1.0, places=15)
        self.assertAlmostEqual(logit(0.5), 0.0, places=12)
        iso = pava_non_decreasing([0.6, 0.2, 0.8], [1.0, 1.0, 1.0])
        self.assertAlmostEqual(iso[0], 0.4, places=12)
        self.assertAlmostEqual(iso[1], 0.4, places=12)
        self.assertAlmostEqual(iso[2], 0.8, places=12)

    def test_oos_governance_and_zero_forbidden_fields(self) -> None:
        res = json.loads(RESULTS_OUT_PATH.read_text(encoding="utf-8"))
        art = json.loads(MODEL_OUT_PATH.read_text(encoding="utf-8"))
        snap = json.loads(SNAPSHOT_OUT_PATH.read_text(encoding="utf-8"))

        self.assertTrue(res["governance"]["holdout_sealed_untouched"])
        self.assertFalse(res["governance"]["hyperparameter_tuning_on_holdout"])
        self.assertLess(res["hierarchy_coverage"]["matrix_max_1x2_cone_error"], 1e-12)
        self.assertLess(res["hierarchy_coverage"]["matrix_max_expected_total_error"], 1e-12)

        wf = res["season_results_walkforward_oos"]["post_burnin_10_games_43_leagues"]
        self.assertTrue(wf["1x2_logloss_vs_uncalibrated"]["significant_improvement"])
        self.assertTrue(wf["o25_logloss_vs_uncalibrated"]["significant_improvement"])

        intl_slice = res["season_results_walkforward_oos"]["by_confederation"]["INTERNATIONAL_NATIONAL_TEAMS"]
        self.assertEqual(intl_slice["games_evaluated_2026"], 0)
        self.assertIsNone(intl_slice["1x2_logloss_vs_uncalibrated"]["cand_mean"])
        self.assertIsNone(intl_slice["o25_ece"])

        sp = res["strict_prekickoff_57_cohort"]
        self.assertEqual(sp["n_games"], 57)
        self.assertTrue(sp["o25_logloss_diff"]["significant_improvement"])
        self.assertTrue(sp["playable_zone_1_55_to_2_60_venn_abers"]["logloss_diff_date_clustered"]["significant_improvement"])

        self.assertGreaterEqual(snap["total_parity_cases"], 50)

        found_keys: set[str] = set()
        _collect_all_dict_keys(art, found_keys)
        _collect_all_dict_keys(snap, found_keys)
        _collect_all_dict_keys(res, found_keys)
        self.assertEqual(len(found_keys & FORBIDDEN_KEYS), 0)

        # Verify projections work cleanly on zero-2026-game national team competition
        out_intl = project_soccer_57_match_v60(
            league="copa-del-mundo",
            home_elo=1710.0,
            away_elo=1640.0,
            home_att_ewm=1.55,
            home_def_ewm=0.95,
            home_games=10,
            away_att_ewm=1.35,
            away_def_ewm=1.10,
            away_games=10,
            league_env_goals=art["competitions"]["copa-del-mundo"]["causal_env_goals_final"],
            neutral_site=True,
            artifact=art,
        )
        self.assertEqual(out_intl["competitionStatus"], "confederation_prior_zero_2026_games")

        recal_out = recalibrate_soccer_57_prekickoff_v60(
            league="premier-league",
            raw_proj_home=1.82,
            raw_proj_away=1.24,
            raw_x12=[0.51, 0.25, 0.24],
            causal_league_env_goals=2.78,
            artifact=art,
        )
        self.assertLess(abs(recal_out["markets"]["1x2"]["home"] - 0.51), 1e-12)


if __name__ == "__main__":
    unittest.main()
