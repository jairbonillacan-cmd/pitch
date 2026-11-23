"""Unit, physical-invariant, and Red-Team governance tests for `EXP_V59` (`PitchLab Props v6.0`)."""

from __future__ import annotations

import sys

sys.dont_write_bytecode = True

import hashlib
import json
from pathlib import Path
import unittest

EXP_DIR = Path(__file__).resolve().parent
if str(EXP_DIR) not in sys.path:
    sys.path.insert(0, str(EXP_DIR))

from run_exp_v59_props_v6_0 import (  # noqa: E402
    ARTIFACTS_DIR,
    BOOTSTRAP_RESAMPLES,
    BOOTSTRAP_SEED,
    CANONICAL_GK_SAVES_LINES_V6,
    CANONICAL_SHOT_LINES_V6,
    PRED_DATA_DIR,
    REPO_ROOT,
    cluster_bootstrap_binary_v6,
    estimate_effective_exposure_90_v6,
    evaluate_goalkeeper_saves_linked_sgp_v6,
    evaluate_us_player_profile_props_v6,
    normalize_us_player_game_log_columns_v6,
    project_coupled_player_shots_multiline_v6,
    project_goalkeeper_saves_multiline_v6,
    project_us_player_prop_v6,
)


class TestExpV59PropsV6(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.artifact = json.loads(
            (PRED_DATA_DIR / "model_props_v6_0_candidate.json").read_text(encoding="utf-8")
        )
        cls.snapshot = json.loads(
            (PRED_DATA_DIR / "props_v6_0_snapshot.json").read_text(encoding="utf-8")
        )
        cls.results = json.loads(
            (ARTIFACTS_DIR / "exp_v59_props_v6_0_results.json").read_text(encoding="utf-8")
        )

    def test_d7_closed_and_coupled_shots_multiline_monotonicity(self) -> None:
        sh_cfg = self.artifact["coupled_shots_v6"]
        self.assertEqual(
            sh_cfg["calibration_source"],
            "coupled_player_match_barycentric_logit_pava_v6",
        )
        for met in ("shots", "shots_on_target"):
            for ln in CANONICAL_SHOT_LINES_V6:
                sp = sh_cfg["multi_line_logit_splines"][met][f"{ln:.1f}"]
                self.assertEqual(
                    sp["calibration_source"],
                    "coupled_player_match_barycentric_logit_pava_v6",
                )
                zk = sp["zeta_knots"]
                for i in range(1, len(zk)):
                    self.assertGreaterEqual(zk[i], zk[i - 1])

        for met in ("shots", "shots_on_target"):
            for pos in ("FW_CF", "FW_W", "MF_AM", "MF_CM", "DF_FB", "FWD", "MID", "DEF"):
                out = project_coupled_player_shots_multiline_v6(
                    metric=met,
                    position_group=pos,
                    season_count=22.0 if met == "shots" else 9.0,
                    appearances=12,
                    sub_ins=3,
                    team_expected_shots=14.6,
                    team_expected_sot=5.2,
                    opp_defense_factor=1.12,
                    lineup_status="confirmed_starter",
                    availability="available",
                    artifact=self.artifact,
                )
                self.assertTrue(out["eligible"])
                self.assertEqual(len(out["lines"]), 4)
                probs = [row["pOverCalibrated"] for row in out["lines"]]
                subs = [row["pOverSubCover"] for row in out["lines"]]
                for idx in range(3):
                    self.assertGreaterEqual(probs[idx], probs[idx + 1])
                    self.assertGreaterEqual(subs[idx], subs[idx + 1])
                for idx in range(4):
                    self.assertGreaterEqual(subs[idx], probs[idx])
                    self.assertGreaterEqual(probs[idx], 0.001)
                    self.assertLessEqual(probs[idx], 0.999)

        # Higher teamExpectedShots increases projected player shots probability
        low_tm = project_coupled_player_shots_multiline_v6(
            metric="shots",
            position_group="FW_CF",
            season_count=18,
            appearances=10,
            sub_ins=0,
            team_expected_shots=8.5,
            team_expected_sot=2.9,
            artifact=self.artifact,
        )
        high_tm = project_coupled_player_shots_multiline_v6(
            metric="shots",
            position_group="FW_CF",
            season_count=18,
            appearances=10,
            sub_ins=0,
            team_expected_shots=17.5,
            team_expected_sot=6.2,
            artifact=self.artifact,
        )
        self.assertGreater(high_tm["lines"][1]["pOverCalibrated"], low_tm["lines"][1]["pOverCalibrated"])

        # Exposure de-biasing: 12 apps with 9 sub-ins has smaller exposure than 12 starts
        self.assertLess(
            estimate_effective_exposure_90_v6(12, 9, "FWD"),
            estimate_effective_exposure_90_v6(12, 0, "FWD") * 0.55,
        )

    def test_goalkeeper_saves_multiline_and_exact_frechet_sgp(self) -> None:
        self.assertEqual(
            self.results["pillar_2_goalkeeper_saves_multiline_and_sgp_v6"][
                "active_goalkeepers_in_squads"
            ],
            325,
        )
        gk_out = project_goalkeeper_saves_multiline_v6(
            saves=34,
            shots_faced=47,
            goals_conceded=13,
            appearances=11,
            sub_ins=0,
            opp_expected_sot=4.8,
            expected_minutes=90.0,
            availability="available",
            artifact=self.artifact,
        )
        self.assertTrue(gk_out["eligible"])
        self.assertEqual([r["line"] for r in gk_out["lines"]], list(CANONICAL_GK_SAVES_LINES_V6))
        for idx in range(3):
            self.assertGreaterEqual(
                gk_out["lines"][idx]["pOverCalibrated"],
                gk_out["lines"][idx + 1]["pOverCalibrated"],
            )

        for outcome in ("clean_sheet", "under_2_5", "team_win"):
            prev_joint = 1.0
            for ln in CANONICAL_GK_SAVES_LINES_V6:
                sgp = evaluate_goalkeeper_saves_linked_sgp_v6(
                    saves_line=ln,
                    eb_save_rate=0.73,
                    opp_expected_sot=4.7,
                    team_expected_goals=1.48,
                    opponent_expected_goals=1.26,
                    match_outcome=outcome,
                    r_dispersion_sot=self.artifact["goalkeeper_saves_v6"]["r_dispersion_sot"],
                    siege_own_goal_dampening=self.artifact["goalkeeper_saves_v6"].get(
                        "siege_own_goal_dampening", 0.028
                    ),
                    offered_combined_decimal_odds=4.50,
                )
                self.assertGreaterEqual(sgp["jointProbability"] + 1e-15, sgp["frechetLowerBound"])
                self.assertLessEqual(sgp["jointProbability"] - 1e-15, sgp["frechetUpperBound"])
                self.assertLessEqual(sgp["jointProbability"], prev_joint + 1e-15)
                prev_joint = sgp["jointProbability"]
                self.assertIsNotNone(sgp["bookQuoteAudit"])

        # Negative correlation physics: GK 3.5+ Saves + Clean Sheet has structuralMultiplier < 1.0
        sgp_cs = evaluate_goalkeeper_saves_linked_sgp_v6(
            saves_line=3.5,
            eb_save_rate=0.72,
            opp_expected_sot=4.5,
            team_expected_goals=1.4,
            opponent_expected_goals=1.25,
            match_outcome="clean_sheet",
        )
        self.assertLess(sgp_cs["structuralMultiplier"], 0.96)
        self.assertEqual(sgp_cs["correlationDirection"], "negatively_correlated")

    def test_us_multicolumn_extractor_minutes_guard_and_injury_hard_block(self) -> None:
        # 11-column NBA log without 5-column truncation
        nba_norm = normalize_us_player_game_log_columns_v6(
            sport="nba",
            columns=[
                {"label": "MIN", "value": "35:30"},
                {"label": "FG", "value": "10-19"},
                {"label": "%TC", "value": "52.6"},
                {"label": "3PT", "value": "5-11"},
                {"label": "%3P", "value": "45.5"},
                {"label": "FT", "value": "4-4"},
                {"label": "REB", "value": "8"},
                {"label": "AST", "value": "9"},
                {"label": "STL", "value": "2"},
                {"label": "BLK", "value": "1"},
                {"label": "PTS", "value": "29"},
            ],
        )
        self.assertTrue(nba_norm["eligibleForProjection"])
        self.assertAlmostEqual(nba_norm["metrics"]["MIN"], 35.5, places=12)
        self.assertEqual(nba_norm["metrics"]["PTS"], 29.0)
        self.assertEqual(nba_norm["metrics"]["REB"], 8.0)
        self.assertEqual(nba_norm["metrics"]["AST"], 9.0)
        self.assertEqual(nba_norm["metrics"]["3PM"], 5.0)

        # MLB 9-column pitcher + batter metrics and baseball outs (.2 = 2/3)
        mlb_norm = normalize_us_player_game_log_columns_v6(
            sport="mlb",
            columns=[
                {"label": "IP", "value": "6.2"},
                {"label": "H", "value": "4"},
                {"label": "ER", "value": "1"},
                {"label": "BB", "value": "2"},
                {"label": "HR", "value": "1"},
                {"label": "SO", "value": "10"},
                {"label": "TB", "value": "6"},
                {"label": "RBI", "value": "3"},
            ],
        )
        self.assertAlmostEqual(mlb_norm["metrics"]["IP"], 6.0 + 2.0 / 3.0, places=12)
        self.assertEqual(mlb_norm["metrics"]["SO"], 10.0)
        self.assertEqual(mlb_norm["metrics"]["TB"], 6.0)
        self.assertEqual(mlb_norm["metrics"]["RBI"], 3.0)

        # NHL Spanish 'Tiros' -> SOG and clock TOI
        nhl_norm = normalize_us_player_game_log_columns_v6(
            sport="nhl",
            columns=[
                {"label": "G", "value": "1"},
                {"label": "A", "value": "2"},
                {"label": "PTS", "value": "3"},
                {"label": "+/-", "value": "1"},
                {"label": "PIM", "value": "0"},
                {"key": "s", "label": "Tiros", "value": "6"},
                {"label": "TOI", "value": "21:15"},
            ],
        )
        self.assertEqual(nhl_norm["metrics"]["SOG"], 6.0)
        self.assertAlmostEqual(nhl_norm["metrics"]["TOI"], 21.25, places=12)

        # NFL Spanish 'INT.' (ATT) vs 'INT' (interceptions) and 'ACAR' (CAR)
        nfl_norm = normalize_us_player_game_log_columns_v6(
            sport="nfl",
            columns=[
                {"key": "cmp", "label": "CMP", "value": "22"},
                {"key": "att", "label": "INT.", "value": "31"},
                {"key": "yds", "label": "YDS", "value": "265"},
                {"key": "td", "label": "TD", "value": "2"},
                {"key": "int", "label": "INT", "value": "1"},
                {"label": "REC", "value": "4"},
                {"label": "TGTS", "value": "6"},
                {"key": "car", "label": "ACAR", "value": "5"},
            ],
        )
        self.assertEqual(nfl_norm["metrics"]["CMP"], 22.0)
        self.assertEqual(nfl_norm["metrics"]["ATT"], 31.0)
        self.assertEqual(nfl_norm["metrics"]["INT"], 1.0)
        self.assertEqual(nfl_norm["metrics"]["CAR"], 5.0)
        self.assertEqual(nfl_norm["metrics"]["TGTS"], 6.0)

        # Hard injury block ('out' and 'Baja') returns empty
        for av, inj in (("out", None), ("available", "Baja")):
            blocked = normalize_us_player_game_log_columns_v6(
                sport="nba",
                columns=[{"label": "MIN", "value": "34"}, {"label": "PTS", "value": "26"}],
                availability=av,
                injury_status=inj,
            )
            self.assertTrue(blocked["blockedByInjury"])
            self.assertEqual(blocked["metrics"], {})
            self.assertEqual(
                evaluate_us_player_profile_props_v6(
                    sport="nba",
                    position_label="G",
                    availability=av,
                    injury_status=inj,
                    season_metrics=[{"key": "gp", "value": "12"}, {"key": "pts", "value": "24.0"}],
                    recent_games=[{"stats": [{"label": "MIN", "value": "34"}]}],
                    artifact=self.artifact,
                ),
                [],
            )

        # Minutes guard: < 18 min NBA and < 45 min football blocked
        low_nba = project_us_player_prop_v6(
            sport="nba",
            position_label="G",
            metric="PTS",
            sample_sum=80.0,
            sample_games=10.0,
            prematch_minutes=17.5,
            artifact=self.artifact,
        )
        self.assertIsNone(low_nba)
        low_fb = project_coupled_player_shots_multiline_v6(
            metric="shots",
            position_group="FWD",
            season_count=10,
            appearances=10,
            sub_ins=8,
            team_expected_shots=13.0,
            team_expected_sot=4.4,
            lineup_status="bench",
            artifact=self.artifact,
        )
        self.assertFalse(low_fb["eligible"])
        self.assertTrue(low_fb["blockedByMinutesGuard"])
        self.assertEqual(low_fb["lines"], [])

    def test_governance_bootstrap_null_slices_and_frozen_integrity(self) -> None:
        self.assertTrue(self.results["holdout_sealed_untouched"])
        self.assertFalse(self.results["production_activated"])
        self.assertEqual(self.results["status"], "candidate")
        self.assertGreaterEqual(self.snapshot["total_parity_vectors"], 50)

        # Empty slice returns None / JSON null, never 0.0
        empty = cluster_bootstrap_binary_v6([], [], [], [], seed=BOOTSTRAP_SEED)
        self.assertIsNone(empty["cand_mean"])
        self.assertIsNone(empty["ece_cand"])
        self.assertIsNone(empty["promoted_ece_ge_50pct"])
        self.assertEqual(empty["seed"], BOOTSTRAP_SEED)
        self.assertEqual(empty["n_resamples"], BOOTSTRAP_RESAMPLES)

        # Zero forbidden betting fields across all 3 JSON outputs
        for pth in (
            PRED_DATA_DIR / "model_props_v6_0_candidate.json",
            PRED_DATA_DIR / "props_v6_0_snapshot.json",
            ARTIFACTS_DIR / "exp_v59_props_v6_0_results.json",
        ):
            txt = pth.read_text(encoding="utf-8")
            for bad in ('"stake"', '"kelly"', '"kellyFraction"', '"expectedEdge"', '"ev"', '"tier"'):
                self.assertNotIn(bad, txt)

        # Frozen v5.2 artifacts SHA-256 intact
        reg52 = json.loads(
            (PRED_DATA_DIR / "candidate_registry_v5_2.json").read_text(encoding="utf-8")
        )
        for ent in reg52["v5_2_live_feedback_artifacts"]:
            actual = hashlib.sha256((REPO_ROOT / ent["artifact_path"]).read_bytes()).hexdigest()
            self.assertEqual(actual, ent["sha256"])


if __name__ == "__main__":
    unittest.main()
