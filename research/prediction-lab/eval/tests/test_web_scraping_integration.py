#!/usr/bin/env python3
"""A26 — Suite de Auditoría de Integración, Integridad Criptográfica y Anti-Leakage
de `PitchLab Spacetime Suite v3.0` (`web-scraping` Feature Store v2.0 -> `prediction-lab`).

Ejecutable tanto vía `unittest discover` (usado por `pipeline/validate_release.py`) como vía `pytest`.
"""
from __future__ import annotations

import json
import os
import sys
import unittest
from pathlib import Path

import pandas as pd

ROOT_PL = Path(__file__).resolve().parents[2]
REPO_ROOT = ROOT_PL.parents[1]
WS_ROOT = REPO_ROOT.parent / "web-scraping"
PROC_DIR = ROOT_PL / "data" / "processed"
WS_PROC_DIR = PROC_DIR / "web_scraping"
SRC_DATA_DIR = REPO_ROOT / "src" / "data" / "prediction"

sys.path.insert(0, str(ROOT_PL))
sys.path.insert(0, str(ROOT_PL / "etl"))
sys.path.insert(0, str(ROOT_PL / "models" / "a"))
sys.path.insert(0, str(ROOT_PL / "pipeline"))

from ingest_web_scraping import verify_web_scraping_manifest  # noqa: E402
from train_motor_a import FEATURES as MOTOR_A_FEATURES  # noqa: E402
from predict_live_matchday import load_default_artifacts, predict_live_edge_matrix  # noqa: E402


class TestWebScrapingIntegrationV3(unittest.TestCase):
    """Verifica criptografía SHA-256, 0 fuga temporal, joins y cobertura multi-deporte v3.0."""

    def test_01_cryptographic_sha256_envelopes_verified(self) -> None:
        """Los 55 snapshots JSON crudos en `.worktrees/web-scraping/data/raw` pasan verificación SHA-256."""
        res = verify_web_scraping_manifest(WS_ROOT)
        self.assertEqual(res["snapshots_total"], 55)
        self.assertEqual(res["snapshots_verified"], 55)
        self.assertTrue(res["all_sha256_verified"])

    def test_02_strict_anti_leakage_in_historical_features(self) -> None:
        """Ningún snapshot prospectivo 2026 ni `forecast_p_*` post-tiro contamina `features.parquet` o `FEATURES`."""
        forbidden_substrings = (
            "forecast_p_",
            "missing_market_value",
            "rotowire_injured",
            "sharp_money_divergence",
            "smarkets_exchange",
            "caliente_mx",
            "max_wind_speed_mph_7d",
            "total_precipitation_mm_7d",
            "lineup_availability_delta",
        )
        for feat in MOTOR_A_FEATURES:
            for bad in forbidden_substrings:
                self.assertNotIn(
                    bad,
                    feat,
                    f"Feature histórica prohibida (posible leakage prospectivo/post-partido): {feat}",
                )

        # Verificar en `ws_soccer_match_xg_2018_2026.parquet` que las imputaciones transversales 2026
        # están estrictamente excluidas de `is_exact_xg`
        xg_df = pd.read_parquet(WS_PROC_DIR / "ws_soccer_match_xg_2018_2026.parquet")
        self.assertNotIn("forecast_p_home", MOTOR_A_FEATURES)
        if "is_exact_xg" in xg_df.columns and "source_id" in xg_df.columns:
            cross_sec = xg_df[
                xg_df["source_id"].astype(str).str.contains("statiskicks_fallback|cross_section", case=False, na=False)
            ]
            if len(cross_sec) > 0:
                self.assertFalse(
                    bool(cross_sec["is_exact_xg"].any()),
                    "Ninguna fila con fallback transversal 2026 puede marcarse como `is_exact_xg=True`.",
                )

        # Verificar que `features.parquet` tampoco contenga columnas prospectivas 2026
        feats_schema = pd.read_parquet(PROC_DIR / "features.parquet", columns=["match_id"]).columns
        self.assertIn("match_id", feats_schema)
        with open(PROC_DIR / "feature_manifest.json", encoding="utf-8") as f:
            fman = json.load(f)
        all_cols = fman.get("columns", [])
        for col in all_cols:
            self.assertNotIn("sharp_money_divergence", col)
            self.assertNotIn("missing_market_value_ratio", col)

    def test_03_entity_resolution_and_join_integrity(self) -> None:
        """Tasa de cruce >= 99.9% en xG histórico, 100% en Understat táctico y física de altitud Liga MX."""
        with open(WS_PROC_DIR / "ws_ingestion_manifest.json", encoding="utf-8") as f:
            manifest = json.load(f)

        xg_stats = manifest["outputs"]["ws_soccer_match_xg_2018_2026"]
        self.assertGreaterEqual(xg_stats["match_rate_pct"], 99.9)
        self.assertGreaterEqual(xg_stats["exact_real_xg_rows"], 14000)

        tact_stats = manifest["outputs"]["ws_understat_team_match_tactical"]
        self.assertEqual(tact_stats["rows"], 21560)
        self.assertAlmostEqual(tact_stats["match_rate_pct"], 100.0, places=4)

        stad_df = pd.read_parquet(WS_PROC_DIR / "ws_stadium_physics.parquet")
        maz = stad_df[
            (stad_df["div"] == "MEX")
            & (stad_df["primary_pl_team"].astype(str).str.contains("Mazatlan", case=False, na=False))
        ]
        mon = stad_df[
            (stad_df["div"] == "MEX")
            & (stad_df["primary_pl_team"].astype(str).str.contains("Monarcas", case=False, na=False))
        ]
        tol = stad_df[
            (stad_df["div"] == "MEX")
            & (stad_df["primary_pl_team"].astype(str).str.contains("Toluca", case=False, na=False))
        ]
        self.assertGreaterEqual(len(maz), 1)
        self.assertGreaterEqual(len(mon), 1)
        self.assertGreaterEqual(len(tol), 1)
        self.assertLess(float(maz.iloc[0]["stadium_elevation_m"]), 100.0)
        self.assertGreater(float(mon.iloc[0]["stadium_elevation_m"]), 1800.0)
        self.assertGreater(float(tol.iloc[0]["stadium_elevation_m"]), 2500.0)
        self.assertTrue(bool(tol.iloc[0]["altitude_shock_venue_flag"]))

    def test_04_multisport_causality_and_coverage(self) -> None:
        """Cobertura completa de Liga MX, Top-5 Europa, NFL (32), NHL (32), MLB (30), NBA (30) y NCAAF (138)."""
        with open(SRC_DATA_DIR / "model_motor_a.json", encoding="utf-8") as f:
            fb_art = json.load(f)
        self.assertEqual(fb_art["codename"], "PitchLab Tachyon v3.0")
        self.assertEqual(fb_art["version"], "3.0.0")
        self.assertEqual(fb_art["n_features_base"], 113)
        self.assertEqual(len(fb_art["div_levels"]), 23)
        for req_div in ("MEX", "E0", "SP1", "D1", "I1", "F1"):
            self.assertIn(req_div, fb_art["div_levels"])

        with open(SRC_DATA_DIR / "model_nfl.json", encoding="utf-8") as f:
            nfl_art = json.load(f)
        self.assertEqual(nfl_art["codename"], "PitchLab Minkowski v3.0")
        self.assertEqual(nfl_art["version"], "3.0.0")
        self.assertEqual(len(nfl_art["live_v3"]["team_live_context"]), 32)
        self.assertEqual(len(nfl_art["live_v3"]["stadium_physics"]), 32)

        with open(SRC_DATA_DIR / "model_multisport.json", encoding="utf-8") as f:
            ms_art = json.load(f)
        self.assertEqual(ms_art["version"], "3.0.0")
        self.assertIn("S_minus_1_to_S", ms_art["anti_leakage_contract"])
        self.assertEqual(len(ms_art["sports"]["nhl"]["teams"]), 32)
        self.assertEqual(len(ms_art["sports"]["mlb"]["teams"]), 30)
        self.assertEqual(len(ms_art["sports"]["nba"]["teams"]), 30)
        self.assertEqual(len(ms_art["sports"]["ncaaf"]["teams"]), 138)

    def test_05_live_edge_matrix_242_matchups_11_leagues(self) -> None:
        """Inferencia prospectiva completa sobre los 242 enfrentamientos activos en las 11 ligas."""
        with open(WS_ROOT / "data" / "feature_store" / "live_matchups_edge_matrix.json", encoding="utf-8") as f:
            edge_matrix = json.load(f)
        with open(WS_ROOT / "data" / "feature_store" / "team_master_features.json", encoding="utf-8") as f:
            team_master = json.load(f)

        artifacts = load_default_artifacts()
        batch = predict_live_edge_matrix(edge_matrix, team_master, artifacts)
        self.assertEqual(batch["count"], 242)
        self.assertEqual(len(batch["countsByLeague"]), 11)
        for pred in batch["predictions"]:
            fp = pred["finalProbs"]
            total = fp["pHome"] + fp["pDraw"] + fp["pAway"]
            self.assertAlmostEqual(total, 1.0, places=12)
            self.assertGreaterEqual(fp["pHome"], 0.0)
            self.assertGreaterEqual(fp["pDraw"], 0.0)
            self.assertGreaterEqual(fp["pAway"], 0.0)


if __name__ == "__main__":
    unittest.main()
