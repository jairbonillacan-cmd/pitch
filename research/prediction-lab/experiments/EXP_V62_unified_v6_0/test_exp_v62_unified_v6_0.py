"""EXP_V62 — Suite Pytest del Hub Unificado `UnifiedMatchIntelligenceV6`, Snapshot 57 Ligas y Registro `v6.0`."""

from __future__ import annotations

import sys

sys.dont_write_bytecode = True

import hashlib
import json
from pathlib import Path
from typing import Any
import unittest

EXP_DIR = Path(__file__).resolve().parent
REPO_ROOT = EXP_DIR.parents[3]
DATA_DIR = REPO_ROOT / "src" / "data" / "prediction"

if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
if str(REPO_ROOT / "services" / "models") not in sys.path:
    sys.path.insert(0, str(REPO_ROOT / "services" / "models"))

import regenerate_candidate_matchday_v6 as reg_v6  # noqa: E402

FORBIDDEN_KEYS = {
    "stake",
    "stake_u",
    "recommendedStake",
    "kelly",
    "kellyFraction",
    "expectedEdge",
    "edge",
    "ev",
    "tier",
    "valueStatus",
}


def _sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def _collect_forbidden_keys(node: Any) -> list[str]:
    found: list[str] = []
    if isinstance(node, dict):
        for k, v in node.items():
            if k in FORBIDDEN_KEYS:
                found.append(k)
            found.extend(_collect_forbidden_keys(v))
    elif isinstance(node, list):
        for item in node:
            found.extend(_collect_forbidden_keys(item))
    return found


class TestExpV62UnifiedV60(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.snapshot = json.loads(
            (DATA_DIR / "live_matchday_v6_candidate_snapshot.json").read_text(encoding="utf-8")
        )
        cls.registry = json.loads(
            (DATA_DIR / "candidate_registry_v6_0.json").read_text(encoding="utf-8")
        )
        cls.results = json.loads(
            (EXP_DIR / "artifacts" / "exp_v62_unified_v6_0_results.json").read_text(encoding="utf-8")
        )
        cls.soc_art = json.loads(
            (DATA_DIR / "model_soccer_57_v6_0_candidate.json").read_text(encoding="utf-8")
        )
        cls.props_art = json.loads(
            (DATA_DIR / "model_props_v6_0_candidate.json").read_text(encoding="utf-8")
        )
        cls.ms_art = json.loads(
            (DATA_DIR / "model_multisport_v6_0_candidate.json").read_text(encoding="utf-8")
        )
        cls.off_art = json.loads(
            (DATA_DIR / "model_officials_freeze_v6_0_candidate.json").read_text(encoding="utf-8")
        )
        cls.ep_art = json.loads(
            (DATA_DIR / "model_epistemic_conformal_v5_1_candidate.json").read_text(encoding="utf-8")
        )
        cls.inplay_art = json.loads(
            (DATA_DIR / "model_inplay_early_payout_v5_0_candidate.json").read_text(encoding="utf-8")
        )
        cls.bundle = {
            "soccer57ArtifactV6": cls.soc_art,
            "propsArtifactV6": cls.props_art,
            "multisportArtifactV6": cls.ms_art,
            "officialsArtifactV6": cls.off_art,
            "epistemicArtifactV51": cls.ep_art,
            "inplayArtifactV5": cls.inplay_art,
        }

    def test_universal_57_league_coverage_and_4param_cone(self) -> None:
        self.assertEqual(self.snapshot["status"], "candidate")
        self.assertFalse(self.snapshot["production_activated"])
        self.assertTrue(self.snapshot["holdout_sealed_untouched"])
        self.assertEqual(self.snapshot["n_leagues_covered"], 57)
        self.assertEqual(self.snapshot["n_soccer_leagues_covered"], 53)
        self.assertEqual(self.snapshot["n_us_leagues_covered"], 4)

        covered_leagues = set(self.snapshot["counts_by_league"].keys())
        expected_53 = set(self.soc_art["competitions"].keys())
        expected_us = {"mlb", "nhl", "nba", "nfl"}
        self.assertEqual(covered_leagues, expected_53 | expected_us)

        for row in self.snapshot["entries"]:
            out = row["outlook"]
            if out["sport"] == "soccer":
                self.assertLess(out["soccerV6"]["coneError1x2"], 1e-12)
                self.assertLess(out["soccerV6"]["totalImpliedError"], 1e-12)

    def test_early_payout_epistemic_bands_and_guardrail_zero_violations(self) -> None:
        entries = self.snapshot["entries"]
        self.assertGreaterEqual(len(entries), 180)
        for row in entries:
            out = row["outlook"]
            cp = out["coreProbabilities"]
            ep = out["earlyPayout"]
            self.assertGreaterEqual(ep["pHomeEarlyPayoutWin"] + 1e-12, cp["pHome"])
            self.assertGreaterEqual(ep["pAwayEarlyPayoutWin"] + 1e-12, cp["pAway"])

            for side_key in ("homeBand90", "awayBand90"):
                b = out["epistemicUncertainty90"][side_key]
                self.assertGreater(b["pLower90"], 0.0)
                self.assertLess(b["pUpper90"], 1.0)
                self.assertLessEqual(b["pLower90"], b["pPoint"] + 1e-12)
                self.assertLessEqual(b["pPoint"], b["pUpper90"] + 1e-12)

            self.assertTrue(out["guardrailAudit"]["passed"])
            self.assertEqual(len(out["guardrailAudit"]["violations"]), 0)

        self.assertEqual(_collect_forbidden_keys(self.snapshot), [])
        self.assertEqual(_collect_forbidden_keys(self.registry), [])
        self.assertEqual(_collect_forbidden_keys(self.results), [])

    def test_integrated_props_v6_monotonicity_and_frechet_bounds(self) -> None:
        n_fp = 0
        n_gk = 0
        n_us = 0
        for row in self.snapshot["entries"]:
            fp = row["outlook"]["featuredPropsV6"]
            if fp["fieldPlayerShots"] is not None:
                n_fp += 1
                for m_key in ("shotsOutlook", "shotsOnTargetOutlook"):
                    lines = fp["fieldPlayerShots"][m_key]["lines"]
                    self.assertEqual(len(lines), 4)
                    for i in range(3):
                        self.assertGreaterEqual(
                            lines[i]["pOverCalibrated"] + 1e-12,
                            lines[i + 1]["pOverCalibrated"],
                        )
                    for ln in lines:
                        self.assertGreaterEqual(
                            ln["pOverSubCover"] + 1e-12, ln["pOverCalibrated"]
                        )
            if fp["goalkeeperSaves"] is not None:
                n_gk += 1
                sv_lines = fp["goalkeeperSaves"]["savesOutlook"]["lines"]
                self.assertEqual(len(sv_lines), 4)
                for i in range(3):
                    self.assertGreaterEqual(
                        sv_lines[i]["pOverCalibrated"] + 1e-12,
                        sv_lines[i + 1]["pOverCalibrated"],
                    )
                sgp = fp["goalkeeperSaves"]["linkedCleanSheetSgp"]
                self.assertIsNotNone(sgp)
                self.assertGreaterEqual(sgp["jointProbability"] + 1e-12, sgp["frechetLowerBound"])
                self.assertLessEqual(sgp["jointProbability"] - 1e-12, sgp["frechetUpperBound"])
            if fp["usPlayerProp"] is not None:
                n_us += 1
                po = fp["usPlayerProp"]["propOutlook"]
                self.assertAlmostEqual(
                    po["pOverCalibrated"] + po["pUnderCalibrated"], 1.0, places=12
                )

        self.assertGreater(n_fp, 20)
        self.assertGreater(n_gk, 20)
        self.assertGreater(n_us, 20)

    def test_prekickoff_seal_determinism_and_contaminated_rejection(self) -> None:
        self.assertEqual(
            self.snapshot["invariants_audit"]["post_kickoff_contaminated_accepted"], 0
        )
        self.assertGreater(
            self.snapshot["invariants_audit"]["ft_matches_with_preserved_prekickoff_forecast"], 0
        )
        # Re-evaluate 15 diverse entries across soccer and US sports for bit-exact SHA-256 reproducibility
        step = max(1, len(self.snapshot["entries"]) // 15)
        for row in self.snapshot["entries"][::step]:
            rebuilt = reg_v6.build_unified_match_intelligence_v6_py(
                row["canonicalInput"], self.bundle
            )
            self.assertEqual(
                rebuilt["preKickoffSeal"]["preKickoffSealSha256"],
                row["outlook"]["preKickoffSeal"]["preKickoffSealSha256"],
            )
            self.assertEqual(rebuilt["verifiedSummaryEs"], row["outlook"]["verifiedSummaryEs"])
            self.assertLessEqual(
                rebuilt["preKickoffSeal"]["inputsAsOfUtc"],
                rebuilt["preKickoffSeal"]["kickoffUtc"],
            )

    def test_candidate_registry_v6_0_verifies_25_prior_and_14_v6_artifacts(self) -> None:
        self.assertEqual(self.registry["status"], "candidate")
        self.assertFalse(self.registry["production_activated"])
        self.assertTrue(self.registry["holdout_sealed_untouched"])
        self.assertEqual(self.registry["prior_immutable_artifacts_verified_count"], 25)
        self.assertEqual(self.registry["n_active_v6_0_candidate_artifacts"], 14)

        for audit_key, expected_cnt in (
            ("frozen_v3_governance_audit", 11),
            ("inherited_v5_1_governance_audit", 11),
            ("inherited_v5_2_governance_audit", 3),
        ):
            grp = self.registry[audit_key]
            self.assertEqual(len(grp), expected_cnt)
            for rel_p, meta in grp.items():
                fp = REPO_ROOT / rel_p
                self.assertTrue(meta["intact"])
                self.assertEqual(_sha256(fp), meta["sha256"])

        for ent in self.registry["active_v6_0_artifacts"]:
            fp = REPO_ROOT / ent["artifact_path"]
            self.assertEqual(_sha256(fp), ent["sha256"])
            self.assertEqual(fp.stat().st_size, ent["size_bytes"])


if __name__ == "__main__":
    unittest.main()
