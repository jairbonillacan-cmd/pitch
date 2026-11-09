"""Tests de integración de ``eval.report`` (fixtures sintéticos, sin datos reales)."""

from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

LAB_ROOT = Path(__file__).resolve().parents[2]
if str(LAB_ROOT) not in sys.path:
    sys.path.insert(0, str(LAB_ROOT))

from eval import metrics as M  # noqa: E402
from eval import report as R  # noqa: E402

_RESULT_TO_Y = {"H": 0, "D": 1, "A": 2}
_GOALS = {"H": (2, 0), "D": (1, 1), "A": (0, 2)}
_SEASONS = [("2021/22", 2021), ("2023/24", 2023), ("2024/25", 2024)]
_DIVS = ["E0", "SP1"]
_MODEL_A = "elo_logistic_v1"
_MODEL_B = "market_baseline_v0"


def build_matches_frame() -> pd.DataFrame:
    rows = []
    for season, year in _SEASONS:
        start = pd.Timestamp(year=year, month=8, day=1)
        for k in range(30):
            div = _DIVS[k % 2]
            date = start + pd.Timedelta(days=k)
            result = ("H", "D", "A")[k % 3]
            home_goals, away_goals = _GOALS[result]
            rows.append(
                {
                    "match_id": f"{div}:{date:%Y%m%d}:home_{k}:away_{k}",
                    "source": "football-data.co.uk",
                    "div": div,
                    "league": f"League {div}",
                    "country": "England" if div == "E0" else "Spain",
                    "season": season,
                    "season_start": year,
                    "match_date": date,
                    "home_team": f"Home {k}",
                    "away_team": f"Away {k}",
                    "home_goals": home_goals,
                    "away_goals": away_goals,
                    "result": result,
                    "y": _RESULT_TO_Y[result],
                }
            )
    return pd.DataFrame(rows)


def build_predictions_frame(matches: pd.DataFrame, degraded_rows: int = 0) -> pd.DataFrame:
    base_a = np.array([0.55, 0.25, 0.20])
    base_b = np.array([1.0 / 3.0, 1.0 / 3.0, 1.0 / 3.0])
    rows = []
    for model_id, base, version in (
        (_MODEL_A, base_a, "1.0.0"),
        (_MODEL_B, base_b, "0.1.0"),
    ):
        for i, row in enumerate(matches.itertuples()):
            y = int(row.y)
            probs = base.copy()
            probs[y] += 0.15
            probs = probs / probs.sum()
            year = int(row.season_start)
            fold = f"test_{year}" if year >= 2024 else f"wf_{year}"
            flag = "ok"
            if degraded_rows and i < degraded_rows:
                flag = "degraded_no_odds"
            rows.append(
                {
                    "match_id": row.match_id,
                    "div": row.div,
                    "season": row.season,
                    "match_date": row.match_date,
                    "model_id": model_id,
                    "model_version": version,
                    "p_home": float(probs[0]),
                    "p_draw": float(probs[1]),
                    "p_away": float(probs[2]),
                    "fold_id": fold,
                    "generated_at": "2026-11-09T00:00:00Z",
                    "data_quality_flag": flag,
                }
            )
    return pd.DataFrame(rows)


def write_fixture(root: Path, degraded_rows: int = 0):
    root.mkdir(parents=True, exist_ok=True)
    matches = build_matches_frame()
    predictions = build_predictions_frame(matches, degraded_rows=degraded_rows)
    matches_path = root / "matches.parquet"
    predictions_path = root / "predictions.csv"
    matches.to_parquet(matches_path, index=False)
    predictions.to_csv(predictions_path, index=False)
    return {"matches": matches_path, "predictions": predictions_path}, matches, predictions


class ReportTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.tmp = Path(tempfile.mkdtemp(prefix="a08_report_"))
        cls.paths, cls.matches, cls.predictions = write_fixture(cls.tmp / "base")

    @classmethod
    def tearDownClass(cls) -> None:
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def _build(self, **kwargs):
        params = dict(bins=10, bootstrap_B=100, permutations=50, seed=7)
        params.update(kwargs)
        return R.build_report(self.paths["predictions"], self.paths["matches"], **params)


class TestCarga(ReportTestCase):
    def test_load_predictions_valida(self) -> None:
        loaded = R.load_predictions(self.paths["predictions"])
        self.assertEqual(len(loaded), 180)
        self.assertEqual(set(loaded["model_id"]), {_MODEL_A, _MODEL_B})

    def test_columnas_obligatorias(self) -> None:
        broken = pd.read_csv(self.paths["predictions"]).drop(columns=["p_draw"])
        path = self.tmp / "sin_p_draw.csv"
        broken.to_csv(path, index=False)
        with self.assertRaises(ValueError):
            R.load_predictions(path)

    def test_duplicados_predicciones(self) -> None:
        df = pd.read_csv(self.paths["predictions"])
        dup = pd.concat([df, df.iloc[[0]]], ignore_index=True)
        path = self.tmp / "duplicado.csv"
        dup.to_csv(path, index=False)
        with self.assertRaises(ValueError) as ctx:
            R.load_predictions(path)
        self.assertIn("duplicadas", str(ctx.exception))

    def test_matches_filtra_sin_resultado(self) -> None:
        df = pd.read_parquet(self.paths["matches"])
        df.loc[0, "result"] = np.nan
        path = self.tmp / "matches_sin_resultado.parquet"
        df.to_parquet(path, index=False)
        loaded = R.load_matches(path)
        self.assertEqual(len(loaded), 89)
        self.assertEqual(loaded.attrs["rows_total"], 90)

    def test_matches_duplicados(self) -> None:
        df = pd.read_parquet(self.paths["matches"])
        dup = pd.concat([df, df.iloc[[0]]], ignore_index=True)
        path = self.tmp / "matches_duplicado.parquet"
        dup.to_parquet(path, index=False)
        with self.assertRaises(ValueError):
            R.load_matches(path)


class TestBuildReport(ReportTestCase):
    def test_cobertura_por_particion(self) -> None:
        report = self._build()
        coverage = report["coverage"]
        self.assertEqual(coverage["matches_with_result"], 90)
        self.assertEqual(
            coverage["matches_by_partition"],
            {"dev": 30, "val": 30, "test": 30, "live": 0, "unknown": 0},
        )
        self.assertEqual(coverage["predictions_rows"], 180)
        self.assertEqual(coverage["matched_rows"], 180)
        self.assertEqual(coverage["unmatched_rows"], 0)
        self.assertEqual(coverage["per_model"][_MODEL_A]["by_partition"]["dev"], 30)

    def test_metricas_por_particion_y_modelo(self) -> None:
        report = self._build()
        self.assertEqual(set(report["models"]), {_MODEL_A, _MODEL_B})
        for model_id in (_MODEL_A, _MODEL_B):
            section = report["models"][model_id]
            self.assertEqual(section["n_predictions"], 90)
            self.assertEqual(section["overall"]["n"], 90)
            self.assertEqual(set(section["by_partition"]), {"dev", "val", "test"})
            for metrics in section["by_partition"].values():
                self.assertEqual(metrics["n"], 30)
            self.assertEqual(len(section["by_season"]), 3)
            self.assertEqual(len(section["by_division"]), 2)
            self.assertEqual(len(section["by_season_division"]), 6)

    def test_metricas_coinciden_con_el_motor(self) -> None:
        report = self._build()
        loaded = R.load_predictions(self.paths["predictions"])
        matches = R.load_matches(self.paths["matches"])
        merged = loaded.merge(
            matches[["match_id", "y", "season_start"]], on="match_id", how="inner", validate="m:1"
        )
        for model_id in (_MODEL_A, _MODEL_B):
            sub = merged[merged["model_id"] == model_id]
            expected = M.summary_metrics(
                sub["y"].to_numpy(), sub[list(M.PROB_COLUMNS)].to_numpy(), bins=10
            )
            got = report["models"][model_id]["overall"]
            for key in ("log_loss", "brier", "rps", "accuracy", "balanced_accuracy", "ece"):
                self.assertAlmostEqual(got[key], expected[key], places=12, msg=key)
            self.assertAlmostEqual(got["brier"], sum(got["brier_per_class"].values()), places=12)

            dev = sub[sub["season_start"] == 2021]
            expected_dev = M.summary_metrics(
                dev["y"].to_numpy(), dev[list(M.PROB_COLUMNS)].to_numpy(), bins=10
            )
            self.assertAlmostEqual(
                report["models"][model_id]["by_partition"]["dev"]["log_loss"],
                expected_dev["log_loss"],
                places=12,
            )

    def test_comparaciones(self) -> None:
        report = self._build()
        comparisons = report["comparisons"]
        # Un par de modelos x (global + dev + val + test).
        self.assertEqual(len(comparisons), 4)
        self.assertEqual({entry["scope"] for entry in comparisons}, {"all", "dev", "val", "test"})
        for entry in comparisons:
            self.assertEqual(entry["model_a"], _MODEL_A)
            self.assertEqual(entry["model_b"], _MODEL_B)
            self.assertIn("ci95_logloss", entry)
            self.assertIn("ci95_brier", entry)
            self.assertIn("frac_gt0_logloss", entry)
            self.assertIn("p_value", entry["permutation"])
            expected_blocks = 3 * 2 if entry["scope"] == "all" else 1 * 2
            self.assertEqual(entry["n_blocks"], expected_blocks)

    def test_advertencias_y_json_estricto(self) -> None:
        report = self._build()
        self.assertTrue(any("live" in warning for warning in report["warnings"]))
        text = json.dumps(report, ensure_ascii=False, allow_nan=False)
        self.assertGreater(len(text), 1000)
        self.assertEqual(report["config"]["block"], "season x division")

    def test_write_report(self) -> None:
        report = self._build()
        out = self.tmp / "out_base"
        paths = R.write_report(report, out)
        self.assertTrue(paths["metrics_json"].exists())
        self.assertTrue(paths["metrics_md"].exists())
        loaded = json.loads(paths["metrics_json"].read_text(encoding="utf-8"))
        self.assertEqual(loaded["schema_version"], R.SCHEMA_VERSION)
        markdown = paths["metrics_md"].read_text(encoding="utf-8")
        for needle in ("## 1. Cobertura", "## 4. Comparaciones pareadas", "## 8. Limitaciones", _MODEL_A):
            self.assertIn(needle, markdown)

    def test_tablas_markdown_bien_formadas(self) -> None:
        # Cada bloque de tabla debe tener el mismo número de celdas en todas
        # sus filas (cabecera, separador y datos); si no, el Markdown se rompe.
        markdown = R.render_markdown(self._build())
        block = []
        blocks = []
        for line in markdown.splitlines() + [""]:
            if line.startswith("|"):
                block.append(line)
            elif block:
                blocks.append(block)
                block = []
        self.assertGreater(len(blocks), 5)
        for table in blocks:
            widths = {len(row.strip("|").split("|")) for row in table}
            self.assertEqual(len(widths), 1, msg=f"tabla inconsistente: {table[:3]}")

    def test_permutaciones_omitidas(self) -> None:
        report = self._build(permutations=0)
        self.assertTrue(all(entry["permutation"] is None for entry in report["comparisons"]))
        self.assertTrue(all(not entry["significant_95"] for entry in report["comparisons"]))
        self.assertTrue(all("omitido" in entry["note"] for entry in report["comparisons"]))


class TestCasosEspeciales(ReportTestCase):
    def test_metadata_mismatch(self) -> None:
        df = pd.read_csv(self.paths["predictions"])
        df.loc[0, "div"] = "XX"
        path = self.tmp / "div_mala.csv"
        df.to_csv(path, index=False)
        with self.assertRaises(ValueError):
            R.build_report(path, self.paths["matches"], bins=10, bootstrap_B=10, permutations=5)
        report = R.build_report(
            path,
            self.paths["matches"],
            bins=10,
            bootstrap_B=10,
            permutations=5,
            allow_metadata_mismatch=True,
        )
        self.assertTrue(any("desajustes" in warning for warning in report["warnings"]))

    def test_prediccion_sin_partido(self) -> None:
        df = pd.read_csv(self.paths["predictions"])
        extra = df.iloc[[0]].copy()
        extra["match_id"] = "E0:19000101:nadie:nadie"
        path = self.tmp / "huerfana.csv"
        pd.concat([df, extra], ignore_index=True).to_csv(path, index=False)
        report = R.build_report(path, self.paths["matches"], bins=10, bootstrap_B=10, permutations=5)
        self.assertEqual(report["coverage"]["unmatched_rows"], 1)
        self.assertEqual(report["models"][_MODEL_A]["n_predictions"], 90)
        self.assertTrue(any("match_id ausente" in warning for warning in report["warnings"]))

    def test_un_solo_modelo(self) -> None:
        df = pd.read_csv(self.paths["predictions"])
        path = self.tmp / "un_modelo.csv"
        df[df["model_id"] == _MODEL_A].to_csv(path, index=False)
        report = R.build_report(path, self.paths["matches"], bins=10, bootstrap_B=10, permutations=5)
        self.assertEqual(report["comparisons"], [])
        self.assertTrue(any("un solo modelo" in warning for warning in report["warnings"]))

    def test_only_ok(self) -> None:
        paths, _, _ = write_fixture(self.tmp / "degradado", degraded_rows=2)
        full = R.build_report(
            paths["predictions"], paths["matches"], bins=10, bootstrap_B=10, permutations=5
        )
        filtered = R.build_report(
            paths["predictions"], paths["matches"], bins=10, bootstrap_B=10, permutations=5, only_ok=True
        )
        self.assertEqual(full["models"][_MODEL_A]["n_predictions"], 90)
        # 2 filas degradadas por modelo (una por cada temporada con i>=28).
        self.assertEqual(filtered["models"][_MODEL_A]["n_predictions"], 88)
        self.assertEqual(filtered["coverage"]["quality_flags"], {"ok": 176})


if __name__ == "__main__":
    unittest.main(verbosity=2)
