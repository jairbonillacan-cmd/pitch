"""Tests unitarios de los Opta-Proxies Tácticos (xGOT, GK Prevented, Field Tilt y Regime Shift).

Verifica:
  1. Identidades matemáticas:
     - Partición de la unidad: field_tilt_home + field_tilt_away == 1.0 (en [0, 1]).
     - Identidad de prevención de arquero: gk_prevented_home == xgot_away - away_goals.
     - Identidad clínica: clinical_overperf_home == home_goals - xgot_home == -gk_prevented_away.
     - No negatividad de xGOT.
     - Fallback robusto ante NaNs en tiros/sot.
  2. Identidades de quiebre de régimen estructural (regime shifts y diferenciales).
  3. Causalidad estricta (Zero Temporal Leakage):
     - Modificar el partido t nunca altera las features móviles (r5, r10) en t o antes.
  4. Integración y presencia de columnas en `data/processed/features.parquet`.
"""
from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

LAB_ROOT = Path(__file__).resolve().parents[2]
if str(LAB_ROOT) not in sys.path:
    sys.path.insert(0, str(LAB_ROOT))
sys.path.insert(0, str(LAB_ROOT / "features"))

from features.tactical_optaproxies import (  # noqa: E402
    compute_match_xgot_and_tactical_proxies,
    compute_regime_shift_features,
)
from features.build_features import build_long, rolling_features, ROLL_COLS  # noqa: E402


class TestTacticalMathematicalIdentities(unittest.TestCase):
    """Verificación de invariantes algebraicos de los Opta-proxies."""

    def setUp(self) -> None:
        self.df = pd.DataFrame(
            {
                "match_id": [1, 2, 3, 4],
                "div": ["E0", "E0", "SP1", "D1"],
                "season": ["2023/24", "2023/24", "2023/24", "2023/24"],
                "match_date": pd.to_datetime(["2023-09-01", "2023-09-02", "2023-09-03", "2023-09-04"]),
                "home_team": ["Arsenal", "Chelsea", "Real Madrid", "Bayern"],
                "away_team": ["Liverpool", "Fulham", "Barcelona", "Dortmund"],
                "home_goals": [2, 0, 3, 1],
                "away_goals": [1, 0, 1, 1],
                "shots_home": [14.0, 8.0, 20.0, np.nan],
                "shots_away": [9.0, 3.0, 12.0, np.nan],
                "sot_home": [5.0, 0.0, 8.0, np.nan],
                "sot_away": [3.0, 1.0, 4.0, np.nan],
                "corners_home": [6.0, 2.0, 7.0, np.nan],
                "corners_away": [4.0, 1.0, 3.0, np.nan],
                "elo_home": [1800.0, 1700.0, 1900.0, 1850.0],
                "elo_away": [1780.0, 1600.0, 1880.0, 1800.0],
            }
        )
        self.xg_h = np.array([1.8, 0.6, 2.4, 1.5])
        self.xg_a = np.array([1.1, 0.3, 1.2, 1.2])

    def test_field_tilt_sum_equals_one(self) -> None:
        res = compute_match_xgot_and_tactical_proxies(self.df, self.xg_h, self.xg_a)
        fth = res["field_tilt_home"]
        fta = res["field_tilt_away"]

        # Suma exactamente 1.0 en todas las filas (incluyendo NaN en shots/corners)
        np.testing.assert_allclose(fth + fta, 1.0, rtol=1e-12, atol=1e-12)
        # Todos los valores en el intervalo cerrado [0, 1]
        self.assertTrue(np.all((fth >= 0.0) & (fth <= 1.0)))
        self.assertTrue(np.all((fta >= 0.0) & (fta <= 1.0)))
        # Fila 4 con NaNs debe caer al prior territorial neutro 0.5
        self.assertAlmostEqual(fth[3], 0.5, places=9)
        self.assertAlmostEqual(fta[3], 0.5, places=9)

    def test_gk_prevented_exact_identity(self) -> None:
        res = compute_match_xgot_and_tactical_proxies(self.df, self.xg_h, self.xg_a)
        # Identidad Statiskicks / Opta: prevented = xgot_opponent - goals_conceded
        np.testing.assert_allclose(
            res["gk_prevented_home"],
            res["xgot_away"] - self.df["away_goals"].to_numpy(dtype=float),
            rtol=1e-12,
            atol=1e-12,
        )
        np.testing.assert_allclose(
            res["gk_prevented_away"],
            res["xgot_home"] - self.df["home_goals"].to_numpy(dtype=float),
            rtol=1e-12,
            atol=1e-12,
        )

    def test_clinical_overperformance_exact_identity(self) -> None:
        res = compute_match_xgot_and_tactical_proxies(self.df, self.xg_h, self.xg_a)
        # clinical_overperf = goals - xgot
        np.testing.assert_allclose(
            res["clinical_overperf_home"],
            self.df["home_goals"].to_numpy(dtype=float) - res["xgot_home"],
            rtol=1e-12,
            atol=1e-12,
        )
        np.testing.assert_allclose(
            res["clinical_overperf_away"],
            self.df["away_goals"].to_numpy(dtype=float) - res["xgot_away"],
            rtol=1e-12,
            atol=1e-12,
        )
        # Relación de dualidad: clinical_overperf_attack + gk_prevented_defense == 0
        np.testing.assert_allclose(
            res["clinical_overperf_home"] + res["gk_prevented_away"],
            0.0,
            rtol=1e-12,
            atol=1e-12,
        )
        np.testing.assert_allclose(
            res["clinical_overperf_away"] + res["gk_prevented_home"],
            0.0,
            rtol=1e-12,
            atol=1e-12,
        )

    def test_xgot_non_negative(self) -> None:
        res = compute_match_xgot_and_tactical_proxies(self.df, self.xg_h, self.xg_a)
        self.assertTrue(np.all(res["xgot_home"] >= 0.0))
        self.assertTrue(np.all(res["xgot_away"] >= 0.0))

    def test_zero_sot_and_zero_goals_gives_zero_xgot(self) -> None:
        # Fila 1 Chelsea tuvo 0 SOT y 0 goles -> xGOT local debe ser 0.0 exacto
        res = compute_match_xgot_and_tactical_proxies(self.df, self.xg_h, self.xg_a)
        self.assertAlmostEqual(res["xgot_home"][1], 0.0, places=9)


class TestRegimeShiftFeatures(unittest.TestCase):
    """Verificación de quiebre de régimen estructural y diferenciales."""

    def test_regime_shift_math(self) -> None:
        df_feats = pd.DataFrame(
            {
                "h_xgd_r5": [0.8, -0.2],
                "h_xgd_r10": [0.3, 0.4],
                "a_xgd_r5": [-0.5, 0.6],
                "a_xgd_r10": [-0.1, 0.2],
                "h_gk_prevented_r5": [0.25, -0.10],
                "a_gk_prevented_r5": [-0.15, 0.30],
                "h_gk_prevented_r10": [0.10, 0.05],
                "a_gk_prevented_r10": [-0.05, 0.15],
                "h_field_tilt_r5": [0.58, 0.42],
                "a_field_tilt_r5": [0.42, 0.58],
            }
        )
        out = compute_regime_shift_features(df_feats)

        # h_xgd_regime_shift = h_xgd_r5 - h_xgd_r10
        np.testing.assert_allclose(out["h_xgd_regime_shift"], [0.5, -0.6])
        # a_xgd_regime_shift = a_xgd_r5 - a_xgd_r10
        np.testing.assert_allclose(out["a_xgd_regime_shift"], [-0.4, 0.4])
        # xgd_regime_shift_diff = h_shift - a_shift
        np.testing.assert_allclose(out["xgd_regime_shift_diff"], [0.9, -1.0])

        # gk_prevented_diff_r5 = h_gk_prevented_r5 - a_gk_prevented_r5
        np.testing.assert_allclose(out["gk_prevented_diff_r5"], [0.40, -0.40])
        # gk_prevented_diff_r10 = h_gk_prevented_r10 - a_gk_prevented_r10
        np.testing.assert_allclose(out["gk_prevented_diff_r10"], [0.15, -0.10])
        # field_tilt_diff_r5 = h_field_tilt_r5 - a_field_tilt_r5
        np.testing.assert_allclose(out["field_tilt_diff_r5"], [0.16, -0.16])


class TestStrictCausalityAndZeroLeakage(unittest.TestCase):
    """Verificación formal de causalidad temporal (Zero Temporal Leakage)."""

    def _make_team_history(self, n_matches: int = 10, team: str = "Liverpool") -> pd.DataFrame:
        dates = pd.date_range("2023-01-01", periods=n_matches, freq="7D")
        rows = []
        for i, dt in enumerate(dates):
            rows.append(
                {
                    "match_id": i + 1,
                    "div": "E0",
                    "season": "2022/23",
                    "match_date": dt,
                    "kickoff_time": "15:00",
                    "home_team": team,
                    "away_team": f"Rival_{i}",
                    "home_goals": 2 if i % 2 == 0 else 1,
                    "away_goals": 0 if i % 2 == 0 else 2,
                    "shots_home": 15.0,
                    "shots_away": 10.0,
                    "sot_home": 6.0,
                    "sot_away": 3.0,
                    "corners_home": 5.0,
                    "corners_away": 4.0,
                    "elo_home": 1750.0,
                    "elo_away": 1600.0,
                    "result": "H" if (2 if i % 2 == 0 else 1) > (0 if i % 2 == 0 else 2) else "A",
                }
            )
        return pd.DataFrame(rows)

    def test_perturbation_at_match_t_does_not_affect_features_at_or_before_t(self) -> None:
        """Modificar el partido 6 (índice 5) NO debe alterar las features en los partidos <= 6."""
        df_base = self._make_team_history(10)
        long_base = build_long(df_base)
        roll_base = rolling_features(long_base)

        target_team_base = roll_base[roll_base.team == "Liverpool"].sort_values("match_date").reset_index(drop=True)

        # Ahora modificamos drásticamente el partido en el índice 5 (el 6º partido)
        df_perturbed = self._make_team_history(10)
        df_perturbed.loc[5, "home_goals"] = 9
        df_perturbed.loc[5, "shots_home"] = 35.0
        df_perturbed.loc[5, "sot_home"] = 18.0
        df_perturbed.loc[5, "corners_home"] = 15.0

        long_pert = build_long(df_perturbed)
        roll_pert = rolling_features(long_pert)
        target_team_pert = roll_pert[roll_pert.team == "Liverpool"].sort_values("match_date").reset_index(drop=True)

        features_to_check = [
            "xgot_r5",
            "gk_prevented_r5",
            "field_tilt_r5",
            "clinical_overperf_r5",
            "xgot_r10",
            "gk_prevented_r10",
            "field_tilt_r10",
        ]

        for feat in features_to_check:
            # Para los partidos 0, 1, 2, 3, 4, 5 (partidos 1 a 6): las features pre-partido
            # deben ser EXACTAMENTE IDÉNTICAS porque solo ven partidos estrictamente anteriores (< t)
            base_vals = target_team_base.loc[0:5, feat].to_numpy(dtype=float)
            pert_vals = target_team_pert.loc[0:5, feat].to_numpy(dtype=float)

            # Manejar NaNs en partidos tempranos donde no hay ventana previa
            np.testing.assert_allclose(
                np.nan_to_num(base_vals, nan=-999.0),
                np.nan_to_num(pert_vals, nan=-999.0),
                rtol=1e-12,
                atol=1e-12,
                err_msg=f"Leakage detectado en {feat}: el partido 6 alteró features en k <= 6!",
            )

            # En el partido 7 (índice 6), la perturbación del partido 6 SÍ debe reflejarse
            # (al menos en xgot_r5 o field_tilt_r5)
            val_base_next = target_team_base.loc[6, feat]
            val_pert_next = target_team_pert.loc[6, feat]
            if feat in ("xgot_r5", "field_tilt_r5"):
                self.assertNotEqual(
                    val_base_next,
                    val_pert_next,
                    f"Se esperaba cambio en el partido posterior para {feat}",
                )


class TestParquetFeaturesIntegrity(unittest.TestCase):
    """Comprueba que features.parquet contiene las nuevas columnas con rangos válidos."""

    @classmethod
    def setUpClass(cls) -> None:
        p = LAB_ROOT / "data" / "processed" / "features.parquet"
        if not p.exists():
            raise unittest.SkipTest(f"Falta {p}: ejecuta build_features.py primero")
        cls.df = pd.read_parquet(p)

    def test_required_tactical_columns_exist(self) -> None:
        required = [
            "h_xgot_r5",
            "a_xgot_r5",
            "h_gk_prevented_r5",
            "a_gk_prevented_r5",
            "h_gk_prevented_r10",
            "a_gk_prevented_r10",
            "h_field_tilt_r5",
            "a_field_tilt_r5",
            "gk_prevented_diff_r5",
            "gk_prevented_diff_r10",
            "field_tilt_diff_r5",
            "xgd_regime_shift_diff",
        ]
        for col in required:
            self.assertIn(col, self.df.columns, f"Falta la columna requerida: {col}")

    def test_tactical_columns_ranges(self) -> None:
        # field tilt promedio por equipo debe estar en [0, 1]
        valid_tilt_h = self.df["h_field_tilt_r5"].dropna()
        valid_tilt_a = self.df["a_field_tilt_r5"].dropna()
        self.assertTrue((valid_tilt_h >= 0.0).all() and (valid_tilt_h <= 1.0).all())
        self.assertTrue((valid_tilt_a >= 0.0).all() and (valid_tilt_a <= 1.0).all())

        # xgot debe ser no negativo
        valid_xgot_h = self.df["h_xgot_r5"].dropna()
        self.assertTrue((valid_xgot_h >= 0.0).all())


if __name__ == "__main__":
    unittest.main()
