"""Unit, parity, causality, and Red-Team governance tests for `EXP_V61` (`PitchLab v6.0 Candidate`).

Compatible with both `python -B test_exp_v61_officials_freeze_v6_0.py` (standard library `unittest`)
and `pytest test_exp_v61_officials_freeze_v6_0.py` (`sys.dont_write_bytecode = True`).
"""

from __future__ import annotations

import sys

sys.dont_write_bytecode = True

import hashlib
import json
import math
from pathlib import Path
import unittest

EXP_DIR = Path(__file__).resolve().parent
if str(EXP_DIR) not in sys.path:
    sys.path.insert(0, str(EXP_DIR))

from run_exp_v61_officials_freeze_v6_0 import (  # noqa: E402
    BOOKING_POINTS_GAMMA_RED,
    BOOTSTRAP_RESAMPLES,
    BOOTSTRAP_SEED,
    FORBIDDEN_PUBLIC_KEYS,
    MODEL_OUT_PATH,
    PRED_DATA_DIR,
    REPO_ROOT,
    RESULTS_OUT_PATH,
    SNAPSHOT_OUT_PATH,
    audit_pre_kickoff_causality_v6,
    compute_conditional_booking_points_v6,
    evaluate_prospective_quotes_power_devig_v6,
    format_epoch_ms_utc,
    normalize_referee_name_v6,
    parse_iso_utc_epoch_ms,
    resolve_official_prior_v6,
    seal_pre_kickoff_outlook_v6,
    solve_power_devig_exact_v6,
)


def _scan_forbidden_keys(obj: object) -> list[str]:
    found: list[str] = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            if str(k) in FORBIDDEN_PUBLIC_KEYS:
                found.append(str(k))
            found.extend(_scan_forbidden_keys(v))
    elif isinstance(obj, (list, tuple)):
        for item in obj:
            found.extend(_scan_forbidden_keys(item))
    return found


class TestExpV61OfficialsFreezeV60(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.model_art = json.loads(MODEL_OUT_PATH.read_text(encoding="utf-8"))
        cls.parity_snap = json.loads(SNAPSHOT_OUT_PATH.read_text(encoding="utf-8"))
        cls.results = json.loads(RESULTS_OUT_PATH.read_text(encoding="utf-8"))

    def test_01_referee_normalization_accents_initials_and_aliases(self) -> None:
        self.assertEqual(normalize_referee_name_v6("François Letexier")["canonicalKey"], "f letexier")
        self.assertEqual(normalize_referee_name_v6("César Soto Grado")["canonicalKey"], "c soto grado")
        self.assertEqual(normalize_referee_name_v6("Benoît Millot")["canonicalKey"], "b millot")
        self.assertEqual(normalize_referee_name_v6("Dr. Felix Brych")["canonicalKey"], "f brych")

        # Alias resolution in v5.1 (`empirical_tm_verified`)
        pt = resolve_official_prior_v6("Joao Pedro Pinheiro", "champions-league", self.model_art)
        self.assertEqual(pt["matchedV51Key"], "j pinheiro")
        self.assertEqual(pt["provenance"], "empirical_tm_verified")

        sp = resolve_official_prior_v6("Francisco Hernandez Maeso", "laliga", self.model_art)
        self.assertEqual(sp["matchedV51Key"], "f jose hernandez maeso")
        self.assertEqual(sp["provenance"], "empirical_tm_verified")

        tr = resolve_official_prior_v6("Oguzhan Cakir", "super-lig", self.model_art)
        self.assertEqual(tr["matchedV51Key"], "o cakr")
        self.assertEqual(tr["provenance"], "empirical_tm_verified")

        # Zero false cross-confederation homonyms (MLS/Conmebol referee must NOT match P1)
        mls_ref = resolve_official_prior_v6("Marcos de Oliveira", "mls", self.model_art)
        self.assertIsNone(mls_ref["matchedV51Key"])
        self.assertEqual(mls_ref["provenance"], "confederation_hierarchical_prior")
        self.assertEqual(mls_ref["confederation"], "CONCACAF")

    def test_02_confederation_hierarchical_priors_and_conditional_booking_points(self) -> None:
        mx = resolve_official_prior_v6("Luis Santander", "liga-mx", self.model_art)
        conmebol = resolve_official_prior_v6("Dario Herrera", "libertadores", self.model_art)
        afc = resolve_official_prior_v6("Akihiko Ikeuchi", "j1-league", self.model_art)
        caf = resolve_official_prior_v6("Omar Abdulkadir Artan", "caf-champions", self.model_art)
        cup = resolve_official_prior_v6("Martin Woods", "fa-cup", self.model_art)

        for r in (mx, conmebol, afc, caf, cup):
            self.assertEqual(r["provenance"], "confederation_hierarchical_prior")
            self.assertAlmostEqual(r["gammaRed"], BOOKING_POINTS_GAMMA_RED, places=12)
            self.assertGreater(r["yellowRatePrior"], 2.0)
            self.assertGreater(r["redCardRatePrior"], 0.05)
            self.assertGreater(r["bookingPointsExpected"], 25.0)

        # Conmebol > Liga MX > J1 League disciplinary ordering
        self.assertGreater(conmebol["bookingPointsExpected"], mx["bookingPointsExpected"])
        self.assertGreater(mx["bookingPointsExpected"], afc["bookingPointsExpected"])

        # Exact E[Y] conservation & positive conditional coupling under gamma_red = 0.1680
        bp = compute_conditional_booking_points_v6(4.45, 0.26, gamma_red=BOOKING_POINTS_GAMMA_RED)
        self.assertAlmostEqual(bp["expectedBookingPoints"], 10.0 * 4.45 + 25.0 * 0.26, places=2)
        self.assertGreater(bp["expectedYellowsGivenRedCard"], bp["expectedYellowsGivenNoRed"])
        self.assertGreaterEqual(bp["lines"]["35.5"]["pOver"], bp["lines"]["45.5"]["pOver"])
        self.assertGreaterEqual(bp["lines"]["45.5"]["pOver"], bp["lines"]["55.5"]["pOver"])

    def test_03_pre_kickoff_seal_immutability_and_post_kickoff_rejection(self) -> None:
        # Clean pre-kickoff seal
        s1 = seal_pre_kickoff_outlook_v6(
            match_id="nba-test-1",
            sport="nba",
            league="nba",
            home_team="celtics",
            away_team="knicks",
            kickoff_utc="2026-11-20T00:30:00Z",
            status="scheduled",
            incoming_analysis={
                "inputsAsOfUtc": "2026-11-19T18:00:00.000Z",
                "probabilities": {"pHome": 0.68, "pDraw": None, "pAway": 0.32},
                "projection": {"home": 117.2, "away": 109.8, "total": 227.0},
            },
        )
        self.assertTrue(s1["hasForecast"])
        self.assertEqual(s1["causalityStatus"], "strict_pre_kickoff_sealed")
        orig_hash = s1["sealedRecord"]["sealSha256"]
        self.assertEqual(len(orig_hash), 64)

        # Transition scheduled -> LIVE with missing upstream analysis
        s2 = seal_pre_kickoff_outlook_v6(
            match_id="nba-test-1",
            sport="nba",
            league="nba",
            home_team="celtics",
            away_team="knicks",
            kickoff_utc="2026-11-20T00:30:00Z",
            status="in_progress",
            incoming_analysis=None,
            existing_sealed_record=s1["sealedRecord"],
        )
        self.assertTrue(s2["hasForecast"])
        self.assertEqual(s2["lifecycleStatus"], "LIVE")
        self.assertEqual(s2["sealedRecord"]["sealSha256"], orig_hash)

        # Transition LIVE -> FT with contaminated post-kickoff regeneration (`inputsAsOf > kickoff`)
        s3 = seal_pre_kickoff_outlook_v6(
            match_id="nba-test-1",
            sport="nba",
            league="nba",
            home_team="celtics",
            away_team="knicks",
            kickoff_utc="2026-11-20T00:30:00Z",
            status="final",
            incoming_analysis={
                "inputsAsOfUtc": "2026-11-20T04:15:00Z",
                "probabilities": {"pHome": 0.99, "pDraw": None, "pAway": 0.01},
                "projection": {"home": 124.0, "away": 102.0, "total": 226.0},
            },
            existing_sealed_record=s2["sealedRecord"],
        )
        self.assertTrue(s3["hasForecast"])
        self.assertTrue(s3["incomingContaminatedRejected"])
        self.assertEqual(s3["incomingCausalityStatus"], "post_kickoff_contaminated")
        self.assertEqual(s3["sealedRecord"]["sealSha256"], orig_hash)
        self.assertAlmostEqual(s3["sealedRecord"]["probabilities"]["pHome"], 0.68, places=12)

        # Unsealed post-kickoff analysis with no prior seal must be rejected
        bad = seal_pre_kickoff_outlook_v6(
            match_id="mlb-oct-contaminated",
            sport="mlb",
            league="mlb",
            home_team="yankees",
            away_team="rays",
            kickoff_utc="2026-10-06T00:00:00.000Z",
            status="final",
            incoming_analysis={
                "inputsAsOfUtc": "2026-11-19T01:44:47.629Z",
                "probabilities": {"pHome": 0.58, "pDraw": None, "pAway": 0.42},
                "projection": {"home": 4.5, "away": 3.8, "total": 8.3},
            },
        )
        self.assertFalse(bad["hasForecast"])
        self.assertIsNone(bad["sealedRecord"])
        self.assertEqual(bad["causalityStatus"], "post_kickoff_contaminated")

    def test_04_utc_timestamp_normalization_parity(self) -> None:
        t1 = parse_iso_utc_epoch_ms("2026-11-20T20:30:00")
        t2 = parse_iso_utc_epoch_ms("2026-11-20T20:30Z")
        t3 = parse_iso_utc_epoch_ms("2026-11-20T20:30:00.000Z")
        t4 = parse_iso_utc_epoch_ms("2026-11-20T21:30:00+01:00")
        self.assertIsNotNone(t1)
        self.assertEqual(t1, t2)
        self.assertEqual(t2, t3)
        self.assertEqual(t3, t4)
        assert t1 is not None
        self.assertEqual(format_epoch_ms_utc(t1), "2026-11-20T20:30:00.000Z")

    def test_05_power_devig_and_prospective_quotes_evaluator(self) -> None:
        pwr3 = solve_power_devig_exact_v6([1.40, 4.75, 7.00])
        self.assertAlmostEqual(sum(pwr3["probsNoVig"]), 1.0, places=14)
        self.assertGreater(pwr3["overround"], 0.0)

        bundle = self.parity_snap["quotes_live_parity_bundle"]
        live_eval = evaluate_prospective_quotes_power_devig_v6(
            ticks=bundle["ticks"],
            engine_pre_kickoff_by_event=bundle["engine_pre_kickoff_by_event"],
            settled_scores_by_event={},
            n_resamples=BOOTSTRAP_RESAMPLES,
            seed=BOOTSTRAP_SEED,
        )
        self.assertEqual(live_eval["n_raw_ticks"], 128)
        self.assertEqual(live_eval["n_valid_prekickoff_ticks"], 128)
        self.assertEqual(live_eval["n_post_kickoff_discarded_ticks"], 0)
        self.assertEqual(live_eval["n_complete_markets"], 59)
        # Honest null on n == 0 settled outcomes
        self.assertEqual(live_eval["settled_outcome_calibration"]["n_settled_markets"], 0)
        self.assertIsNone(live_eval["settled_outcome_calibration"]["logloss_v6"])
        self.assertIsNone(live_eval["settled_outcome_calibration"]["ece_v6"])

        # Inject a post-kickoff tick and an incomplete market tick -> must be discarded cleanly
        contaminated_ticks = list(bundle["ticks"]) + [
            {
                "event_id": "ws:football:E0:20261121:manchester_city:fulham",
                "sport": "football",
                "league": "E0",
                "market": "1x2",
                "line": None,
                "selection": "home",
                "book": "late_book",
                "price_decimal": 1.35,
                "ts_captured": "2026-11-21T12:35:00Z",
                "ts_event_start": "2026-11-21T12:30:00Z",
            },
            {
                "event_id": "ws:football:E0:20261121:manchester_city:fulham",
                "sport": "football",
                "league": "E0",
                "market": "btts",
                "line": None,
                "selection": "yes",
                "book": "orphan_book",
                "price_decimal": 1.80,
                "ts_captured": "2026-11-20T10:00:00Z",
                "ts_event_start": "2026-11-21T12:30:00Z",
            },
        ]
        filtered_eval = evaluate_prospective_quotes_power_devig_v6(
            ticks=contaminated_ticks,
            engine_pre_kickoff_by_event=bundle["engine_pre_kickoff_by_event"],
        )
        self.assertEqual(filtered_eval["n_post_kickoff_discarded_ticks"], 1)
        self.assertEqual(filtered_eval["n_incomplete_or_invalid_ticks"], 1)
        self.assertEqual(filtered_eval["n_complete_markets"], 59)

    def test_06_live_audit_counts_governance_and_zero_forbidden_keys(self) -> None:
        self.assertTrue(self.results["holdout_sealed_untouched"])
        self.assertFalse(self.results["production_activated"])
        self.assertEqual(self.results["officials_registry_v6_0"]["v5_1_officials_loaded"], 839)
        self.assertEqual(self.results["officials_registry_v6_0"]["live_assignments_crossed"], 586)
        self.assertEqual(self.results["officials_registry_v6_0"]["total_leagues_covered"], 57)

        fa = self.results["pre_kickoff_freeze_audit_v6_0"]
        self.assertEqual(fa["raw_latest_ft_contaminated_count"], 24)
        self.assertEqual(fa["contaminated_accepted_into_ledger_count"], 0)
        self.assertEqual(fa["us_ft_forecast_coverage_before"]["nba"]["ft_with_valid_prekickoff_forecast"], 0)
        self.assertEqual(fa["us_ft_forecast_coverage_after"]["nba"]["ft_with_valid_prekickoff_forecast"], 5)
        self.assertEqual(fa["us_ft_forecast_coverage_before"]["nhl"]["ft_with_valid_prekickoff_forecast"], 0)
        self.assertEqual(fa["us_ft_forecast_coverage_after"]["nhl"]["ft_with_valid_prekickoff_forecast"], 14)

        self.assertEqual(_scan_forbidden_keys(self.model_art), [])
        self.assertEqual(_scan_forbidden_keys(self.parity_snap), [])
        self.assertEqual(_scan_forbidden_keys(self.results), [])

        # Prospective ledger untouched (0 bytes)
        ledger_p = REPO_ROOT / "data" / "ledger" / "picks_v3_2_prospective.jsonl"
        self.assertEqual(ledger_p.stat().st_size, 0)

        # Verify SHA-256 hashes recorded in results match disk artifacts & frozen v3..v5.2 untouched
        m_sha = hashlib.sha256(MODEL_OUT_PATH.read_bytes()).hexdigest()
        s_sha = hashlib.sha256(SNAPSHOT_OUT_PATH.read_bytes()).hexdigest()
        self.assertEqual(m_sha, self.results["artifact_hashes"]["model_officials_freeze_v6_0_candidate_sha256"])
        self.assertEqual(s_sha, self.results["artifact_hashes"]["officials_freeze_v6_0_snapshot_sha256"])

        expected_frozen_prefixes = {
            "src/domain/prediction/engine.ts": "77dc721430ff17b1",
            "src/domain/prediction/outlook.ts": "26933d21438d5298",
            "src/domain/prediction/service.ts": "53fbf32117ab6a64",
            "src/data/prediction/live_matchday_v3_snapshot.json": "1dace760d68442e7",
            "src/data/prediction/model_motor_a.json": "3c72967eddc79bb7",
            "src/data/prediction/model_nfl.json": "e74ae241875739d2",
            "services/models/artifacts/sealed_holdout_v3_1_eval.json": "5c9e550bfd7889e4",
        }
        for rel_p, pref in expected_frozen_prefixes.items():
            actual_sha = hashlib.sha256((REPO_ROOT / rel_p).read_bytes()).hexdigest()
            self.assertTrue(actual_sha.startswith(pref), f"Frozen artifact modified: {rel_p}")


if __name__ == "__main__":
    unittest.main()
