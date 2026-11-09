"""Tests del validador del dataset canónico.

Ejecutar desde research/prediction-lab:
    ./.venv/bin/python -m unittest discover -s etl/tests -v
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import pandas as pd

LAB_ROOT = Path(__file__).resolve().parents[2]
ETL_DIR = LAB_ROOT / "etl"
REAL_DATA = LAB_ROOT / "data" / "processed" / "matches.parquet"
VALIDATOR = ETL_DIR / "validators.py"

sys.path.insert(0, str(ETL_DIR))
import validators  # noqa: E402


def _check(report: dict, check_id: str) -> dict:
    for check in report["checks"]:
        if check["check_id"] == check_id:
            return check
    raise AssertionError(f"check no encontrado: {check_id}")


def _validate(df: pd.DataFrame, max_examples: int = 3) -> dict:
    return validators.validate_dataframe(df, data_path="<test>", max_examples=max_examples)


def _clean_subset() -> pd.DataFrame:
    """Subconjunto real y estable: 2024/25 Premier League (380 partidos)."""
    df = pd.read_parquet(REAL_DATA)
    subset = df[(df["div"] == "E0") & (df["season"] == "2024/25")].copy()
    return subset.reset_index(drop=True)


@unittest.skipUnless(REAL_DATA.exists(), "falta data/processed/matches.parquet")
class TestValidators(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.real_df = pd.read_parquet(REAL_DATA)

    def test_real_dataset_is_accepted(self) -> None:
        report = _validate(self.real_df)
        self.assertEqual(report["dataset"]["rows"], len(self.real_df))
        self.assertEqual(report["dataset"]["divisions"], 23)
        self.assertEqual(report["summary"]["critical_failures"], 0, report["summary"])
        self.assertEqual(report["summary"]["exit_code"], 0)
        self.assertEqual(_check(report, "match_id_unique")["count"], 0)
        self.assertEqual(_check(report, "match_id_deterministic")["count"], 0)
        self.assertEqual(_check(report, "result_consistency")["count"], 0)
        self.assertEqual(_check(report, "goals_range")["count"], 0)
        self.assertEqual(_check(report, "odds_le_one")["count"], 0)
        self.assertEqual(_check(report, "duplicate_fixture")["count"], 0)
        self.assertIn("coverage", report)
        # Avisos esperados que documentan limitaciones reales de la fuente.
        self.assertEqual(_check(report, "ht_without_ft")["count"], 2)
        self.assertEqual(_check(report, "team_intra_season_alias")["count"], 0)  # alias fusionados en v1.1
        self.assertEqual(_check(report, "team_alias_candidates")["count"], 1)  # solo Bastia/CA Bastia (clubes distintos, no se fusionan)
        self.assertEqual(_check(report, "season_history_gaps")["count"], 0)  # G1 2000-2005 recuperada en v1.1

    def test_duplicate_match_id_is_detected(self) -> None:
        df = _clean_subset()
        df = pd.concat([df, df.iloc[[0]]], ignore_index=True)
        report = _validate(df)
        self.assertGreater(_check(report, "match_id_unique")["count"], 0)
        self.assertEqual(report["summary"]["exit_code"], 1)

    def test_result_mismatch_is_detected(self) -> None:
        df = _clean_subset()
        df.loc[0, "result"] = "A" if df.loc[0, "result"] != "A" else "H"
        report = _validate(df)
        self.assertGreater(_check(report, "result_consistency")["count"], 0)
        self.assertEqual(report["summary"]["exit_code"], 1)

    def test_invalid_odds_is_detected(self) -> None:
        df = _clean_subset()
        df.loc[0, "odds_close_b365_h"] = 0.5
        report = _validate(df)
        self.assertGreaterEqual(_check(report, "odds_le_one")["count"], 1)
        self.assertEqual(report["summary"]["exit_code"], 1)

    def test_absurd_overround_is_detected(self) -> None:
        df = _clean_subset()
        for outcome in "hda":
            df.loc[0, f"odds_close_b365_{outcome}"] = 1.01
        report = _validate(df)
        self.assertGreaterEqual(_check(report, "overround_coherent_critical")["count"], 1)
        self.assertEqual(report["summary"]["exit_code"], 1)

    def test_date_outside_season_is_detected(self) -> None:
        df = _clean_subset()
        df.loc[0, "match_date"] = "1995-01-01"
        report = _validate(df)
        self.assertGreaterEqual(_check(report, "date_season_hard_window")["count"], 1)
        self.assertEqual(report["summary"]["exit_code"], 1)

    def test_negative_goals_are_detected(self) -> None:
        df = _clean_subset()
        df.loc[0, "home_goals"] = -1
        report = _validate(df)
        self.assertGreaterEqual(_check(report, "goals_range")["count"], 1)
        self.assertEqual(report["summary"]["exit_code"], 1)

    def test_empty_team_is_detected(self) -> None:
        df = _clean_subset()
        df.loc[0, "home_team"] = ""
        report = _validate(df)
        self.assertGreaterEqual(_check(report, "team_name_empty")["count"], 1)
        self.assertEqual(report["summary"]["exit_code"], 1)

    def test_ht_above_ft_is_detected(self) -> None:
        df = _clean_subset()
        df.loc[0, "ht_home_goals"] = df.loc[0, "home_goals"] + 1
        report = _validate(df)
        self.assertGreaterEqual(_check(report, "ht_le_ft")["count"], 1)
        self.assertEqual(report["summary"]["exit_code"], 1)

    def test_absurd_totals_margin_is_flagged(self) -> None:
        df = _clean_subset()
        df.loc[0, "totals_close_b365_over"] = 0.5
        df.loc[0, "totals_close_b365_under"] = 5.0
        report = _validate(df)
        self.assertGreaterEqual(_check(report, "totals_overround_critical")["count"], 1)
        self.assertEqual(report["summary"]["exit_code"], 1)

    def test_cli_exit_codes_and_report_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            clean_path = tmp_path / "clean.parquet"
            corrupt_path = tmp_path / "corrupt.parquet"
            clean_report = tmp_path / "clean.json"
            corrupt_report = tmp_path / "corrupt.json"

            clean = _clean_subset()
            clean.to_parquet(clean_path, index=False)

            corrupt = clean.copy()
            corrupt.loc[0, "result"] = "A" if corrupt.loc[0, "result"] != "A" else "H"
            corrupt.to_parquet(corrupt_path, index=False)

            clean_run = subprocess.run(
                [sys.executable, str(VALIDATOR), "--data", str(clean_path),
                 "--report", str(clean_report), "--quiet"],
                capture_output=True, text=True, timeout=120,
            )
            self.assertEqual(clean_run.returncode, 0, clean_run.stderr)
            self.assertTrue(clean_report.exists())
            clean_json = json.loads(clean_report.read_text())
            self.assertEqual(clean_json["summary"]["exit_code"], 0)

            corrupt_run = subprocess.run(
                [sys.executable, str(VALIDATOR), "--data", str(corrupt_path),
                 "--report", str(corrupt_report), "--quiet"],
                capture_output=True, text=True, timeout=120,
            )
            self.assertEqual(corrupt_run.returncode, 1, corrupt_run.stderr)
            self.assertTrue(corrupt_report.exists())
            corrupt_json = json.loads(corrupt_report.read_text())
            self.assertEqual(corrupt_json["summary"]["exit_code"], 1)
            self.assertGreater(corrupt_json["summary"]["critical_failures"], 0)


if __name__ == "__main__":
    unittest.main()
