"""Tests unitarios de ``eval.metrics`` (A08).

Se ejecutan con ``unittest`` porque ``pytest`` no está instalado en el entorno
del laboratorio::

    ./.venv/bin/python -m unittest discover -s research/prediction-lab/eval/tests -v
"""

from __future__ import annotations

import math
import sys
import unittest
from pathlib import Path

import numpy as np

LAB_ROOT = Path(__file__).resolve().parents[2]
if str(LAB_ROOT) not in sys.path:
    sys.path.insert(0, str(LAB_ROOT))

from eval import metrics as M  # noqa: E402

try:
    from sklearn.metrics import (
        accuracy_score,
        balanced_accuracy_score,
        brier_score_loss,
        confusion_matrix as sk_confusion_matrix,
        log_loss as sk_log_loss,
    )

    HAS_SKLEARN = True
except Exception:  # pragma: no cover
    HAS_SKLEARN = False


def _random_valid(rng: np.random.Generator, n: int) -> np.ndarray:
    """Probabilidades aleatorias válidas, lejos de los bordes (sin clipping)."""
    raw = rng.random((n, 3)) + 1e-3
    return raw / raw.sum(axis=1, keepdims=True)


class TestLogLoss(unittest.TestCase):
    def test_prediccion_perfecta_da_cero_exacto(self) -> None:
        y = np.array([0, 1, 2, 0, 2])
        p = np.eye(3)[y]
        self.assertEqual(M.multiclass_log_loss(y, p), 0.0)

    def test_uniforme_es_ln_3(self) -> None:
        y = np.array([0, 1, 2, 1, 0])
        p = np.full((y.size, 3), 1.0 / 3.0)
        self.assertAlmostEqual(M.multiclass_log_loss(y, p), math.log(3.0), places=12)

    def test_clip_de_probabilidad_cero(self) -> None:
        y = np.array([2])
        p = np.array([[1.0, 0.0, 0.0]])
        self.assertAlmostEqual(M.multiclass_log_loss(y, p), -math.log(1e-15), places=12)

    def test_log_loss_es_media_de_per_sample(self) -> None:
        rng = np.random.default_rng(7)
        y = rng.integers(0, 3, size=50)
        p = _random_valid(rng, 50)
        np.testing.assert_allclose(
            M.multiclass_log_loss(y, p), float(np.mean(M.per_sample_log_loss(y, p))), atol=1e-15
        )


class TestBrier(unittest.TestCase):
    def test_one_hot_perfecto_da_cero(self) -> None:
        y = np.array([0, 1, 2])
        self.assertEqual(M.brier_multiclass(y, np.eye(3)[y]), 0.0)

    def test_uniforme_da_dos_tercios(self) -> None:
        # A mano, para K=3 y cualquier y:
        #   clase correcta: (1/3 - 1)^2 = 4/9
        #   cada clase incorrecta: (1/3 - 0)^2 = 1/9
        #   suma por partido = 4/9 + 2*(1/9) = 6/9 = 2/3
        y = np.array([0, 1, 2, 1])
        p = np.full((y.size, 3), 1.0 / 3.0)
        self.assertAlmostEqual(M.brier_multiclass(y, p), 2.0 / 3.0, places=12)

    def test_brier_por_clase_suma_el_multiclase(self) -> None:
        rng = np.random.default_rng(11)
        y = rng.integers(0, 3, size=200)
        p = _random_valid(rng, 200)
        per_class = M.brier_per_class(y, p)
        self.assertEqual(per_class.shape, (3,))
        self.assertAlmostEqual(float(per_class.sum()), M.brier_multiclass(y, p), places=12)
        self.assertTrue(np.all(per_class >= 0.0))

    def test_rango_brier(self) -> None:
        # Peor caso: probabilidad 1 a una clase equivocada => 2.
        y = np.array([0])
        p = np.array([[0.0, 1.0, 0.0]])
        self.assertAlmostEqual(M.brier_multiclass(y, p), 2.0, places=12)


class TestRPS(unittest.TestCase):
    def test_rps_calculado_a_mano(self) -> None:
        """Cuenta documentada (orden H < D < A, K=3, factor 1/(K-1) = 1/2).

        Fila 1: y=H (0), p=(0.6, 0.3, 0.1)
            CDF_p = (0.6, 0.9), CDF_o = (1, 1)
            diffs = (-0.4, -0.1) -> 0.16 + 0.01 = 0.17 -> /2 = 0.085
        Fila 2: y=D (1), p=(0.2, 0.5, 0.3)
            CDF_p = (0.2, 0.7), CDF_o = (0, 1)
            diffs = (0.2, -0.3) -> 0.04 + 0.09 = 0.13 -> /2 = 0.065
        Media = (0.085 + 0.065) / 2 = 0.075
        """
        y = np.array([0, 1])
        p = np.array([[0.6, 0.3, 0.1], [0.2, 0.5, 0.3]])
        self.assertAlmostEqual(M.rps(y, p), 0.075, places=12)

    def test_rps_uniforme(self) -> None:
        # y=H, p uniforme: CDF_p=(1/3, 2/3), CDF_o=(1,1)
        # diffs=(-2/3,-1/3) -> 4/9+1/9=5/9 -> /2 = 5/18
        self.assertAlmostEqual(
            M.rps(np.array([0]), np.full((1, 3), 1.0 / 3.0)), 5.0 / 18.0, places=12
        )

    def test_rps_perfecto_da_cero(self) -> None:
        y = np.array([0, 1, 2])
        self.assertAlmostEqual(M.rps(y, np.eye(3)[y]), 0.0, places=15)


class TestClasificacion(unittest.TestCase):
    def test_accuracy_mayoritaria_igual_a_su_frecuencia(self) -> None:
        y = np.array([0] * 50 + [1] * 30 + [2] * 20)
        p_mayoritaria = np.tile(np.array([1.0, 0.0, 0.0]), (y.size, 1))
        frecuencia = float(np.bincount(y, minlength=3).max()) / y.size
        self.assertAlmostEqual(M.accuracy(y, p_mayoritaria), frecuencia, places=12)
        self.assertAlmostEqual(frecuencia, 0.5, places=12)

    def test_balanced_accuracy_recall_medio(self) -> None:
        # H: 2/2 aciertos; D: 0/1; A: 1/1 -> (1 + 0 + 1)/3 = 2/3
        y = np.array([0, 0, 1, 2])
        p = np.array(
            [
                [0.8, 0.1, 0.1],
                [0.6, 0.2, 0.2],
                [0.1, 0.2, 0.7],  # predice A, era D
                [0.1, 0.1, 0.8],
            ]
        )
        self.assertAlmostEqual(M.balanced_accuracy(y, p), 2.0 / 3.0, places=12)

    def test_confusion_matrix_filas_verdad(self) -> None:
        y = np.array([0, 0, 1, 2])
        p = np.eye(3)[np.array([0, 1, 1, 2])]
        cm = M.confusion_matrix(y, p)
        expected = np.array([[1, 1, 0], [0, 1, 0], [0, 0, 1]])
        np.testing.assert_array_equal(cm, expected)
        self.assertEqual(int(cm.sum()), y.size)

    def test_per_class_precision_recall_f1(self) -> None:
        y = np.array([0, 0, 1, 2, 2, 2])
        p = np.eye(3)[np.array([0, 1, 1, 2, 2, 0])]
        report = M.per_class_report(y, p)
        cls = report["classes"]
        # H: tp=1, predichos=2, soporte=2 -> precision=.5, recall=.5, f1=.5
        self.assertAlmostEqual(cls["H"]["precision"], 0.5)
        self.assertAlmostEqual(cls["H"]["recall"], 0.5)
        self.assertAlmostEqual(cls["H"]["f1"], 0.5)
        # D: tp=1, predicho=2 (una H predicha como D), soporte=1
        #    -> precision=0.5, recall=1, f1=2*(0.5*1)/1.5=2/3
        self.assertAlmostEqual(cls["D"]["precision"], 0.5)
        self.assertAlmostEqual(cls["D"]["recall"], 1.0)
        self.assertAlmostEqual(cls["D"]["f1"], 2.0 / 3.0)
        # A: tp=2, predicho=2, soporte=3 -> precision=1, recall=2/3
        self.assertAlmostEqual(cls["A"]["precision"], 1.0)
        self.assertAlmostEqual(cls["A"]["recall"], 2.0 / 3.0)
        self.assertEqual(report["n"], 6)
        self.assertAlmostEqual(report["macro"]["precision"], (0.5 + 0.5 + 1.0) / 3.0)


class TestCalibracion(unittest.TestCase):
    def test_ovr_perfectamente_calibrado(self) -> None:
        # 100 partidos con p=(0.3, 0.4, 0.3): 30 H, 30 D, 40 A.
        # Clase H: p_H=0.3 y frecuencia observada 0.30 -> ECE_H = 0.
        # Clase D: p_D=0.4 y frecuencia 0.30 -> |0.3-0.4| = 0.1.
        # Clase A: p_A=0.3 y frecuencia 0.40 -> 0.1.
        p = np.tile(np.array([0.3, 0.4, 0.3]), (100, 1))
        y = np.array([0] * 30 + [1] * 30 + [2] * 40)
        ovr = M.ovr_calibration(y, p, bins=10)
        self.assertAlmostEqual(ovr["classes"]["H"]["ece"], 0.0, places=12)
        self.assertAlmostEqual(ovr["classes"]["D"]["ece"], 0.1, places=12)
        self.assertAlmostEqual(ovr["classes"]["A"]["ece"], 0.1, places=12)
        # Clase predicha = D (0.4) en el 100 % de los casos, acierta 30 %.
        self.assertAlmostEqual(M.ece(y, p, bins=10), 0.1, places=12)

    def test_calibration_table_estructura_y_pesos(self) -> None:
        rng = np.random.default_rng(3)
        y = rng.integers(0, 3, size=500)
        p = _random_valid(rng, 500)
        table = M.calibration_table(y, p, bins=5)
        self.assertEqual(len(table), 5)
        self.assertEqual(sum(row["n"] for row in table), 500)
        self.assertAlmostEqual(table[0]["bin_lo"], 0.0)
        self.assertAlmostEqual(table[-1]["bin_hi"], 1.0)
        # ECE coincide con la suma ponderada de la tabla.
        manual = sum(row["n"] * abs(row["accuracy"] - row["confidence"]) for row in table if row["n"]) / 500
        self.assertAlmostEqual(M.ece(y, p, bins=5), manual, places=12)

    def test_bin_superior_incluye_uno(self) -> None:
        y = np.array([0])
        p = np.array([[1.0, 0.0, 0.0]])
        table = M.calibration_table(y, p, bins=10)
        self.assertEqual(table[-1]["n"], 1)
        self.assertAlmostEqual(table[-1]["accuracy"], 1.0)


class TestValidacion(unittest.TestCase):
    def test_forma_incorrecta(self) -> None:
        with self.assertRaises(ValueError):
            M.multiclass_log_loss(np.array([0]), np.array([[0.5, 0.5]]))
        with self.assertRaises(ValueError):
            M.multiclass_log_loss(np.array([0]), np.array([0.2, 0.3, 0.5]))

    def test_filas_no_suman_uno(self) -> None:
        with self.assertRaises(ValueError):
            M.multiclass_log_loss(np.array([0]), np.array([[0.5, 0.3, 0.1]]))

    def test_nan(self) -> None:
        with self.assertRaises(ValueError):
            M.multiclass_log_loss(np.array([0]), np.array([[np.nan, 0.5, 0.5]]))

    def test_fuera_de_rango(self) -> None:
        with self.assertRaises(ValueError):
            M.multiclass_log_loss(np.array([0]), np.array([[1.2, -0.1, -0.1]]))

    def test_longitudes_distintas(self) -> None:
        with self.assertRaises(ValueError):
            M.multiclass_log_loss(np.array([0, 1]), np.eye(3)[[0]])

    def test_etiqueta_invalida(self) -> None:
        with self.assertRaises(ValueError):
            M.multiclass_log_loss(np.array([3]), np.full((1, 3), 1.0 / 3.0))
        with self.assertRaises(ValueError):
            M.multiclass_log_loss(np.array([0.5]), np.full((1, 3), 1.0 / 3.0))
        with self.assertRaises(ValueError):
            M.multiclass_log_loss(np.array(["H"]), np.full((1, 3), 1.0 / 3.0))

    def test_encode_result(self) -> None:
        np.testing.assert_array_equal(
            M.encode_result(["H", "D", "A", " h "]), np.array([0, 1, 2, 0])
        )
        np.testing.assert_array_equal(M.encode_result([0, 1, 2]), np.array([0, 1, 2]))
        with self.assertRaises(ValueError):
            M.encode_result(["X"])


class TestResumen(unittest.TestCase):
    def test_summary_metrics_claves(self) -> None:
        rng = np.random.default_rng(5)
        y = rng.integers(0, 3, size=60)
        p = _random_valid(rng, 60)
        summary = M.summary_metrics(y, p, bins=10)
        for key in (
            "n",
            "log_loss",
            "brier",
            "brier_per_class",
            "rps",
            "accuracy",
            "balanced_accuracy",
            "ece",
            "confusion_matrix",
            "per_class",
            "calibration",
            "ovr_calibration",
        ):
            self.assertIn(key, summary)
        self.assertEqual(summary["n"], 60)
        self.assertEqual(len(summary["calibration"]), 10)
        self.assertEqual(summary["confusion_matrix"], M.confusion_matrix(y, p).tolist())

    def test_summary_sin_tablas(self) -> None:
        y = np.array([0, 1, 2])
        p = np.eye(3)[y]
        summary = M.summary_metrics(y, p, include_tables=False)
        self.assertNotIn("calibration", summary)
        self.assertNotIn("ovr_calibration", summary)
        self.assertIn("log_loss", summary)


@unittest.skipUnless(HAS_SKLEARN, "scikit-learn no disponible")
class TestContraSklearn(unittest.TestCase):
    """Comparación numérica contra scikit-learn sobre 200 predicciones fijas."""

    @classmethod
    def setUpClass(cls) -> None:
        rng = np.random.default_rng(20261109)
        cls.y = rng.integers(0, 3, size=200)
        cls.p = _random_valid(rng, 200)
        # Garantía de que el clipping no interviene en la comparación.
        assert cls.p.min() > 1e-9

    def test_log_loss(self) -> None:
        expected = sk_log_loss(self.y, self.p, labels=[0, 1, 2])
        self.assertAlmostEqual(M.multiclass_log_loss(self.y, self.p), expected, places=9)

    def test_brier_multiclase_contra_ovr(self) -> None:
        # sklearn no tiene Brier multiclase: se calcula one-vs-rest por clase y
        # se promedian las 3. Esa media es brier/3 porque cada partido aporta
        # 3 términos; por eso se multiplica por 3.
        ovr = np.mean(
            [brier_score_loss((self.y == k).astype(int), self.p[:, k]) for k in range(3)]
        )
        self.assertAlmostEqual(M.brier_multiclass(self.y, self.p), 3.0 * ovr, places=9)

    def test_brier_por_clase(self) -> None:
        expected = np.array(
            [brier_score_loss((self.y == k).astype(int), self.p[:, k]) for k in range(3)]
        )
        np.testing.assert_allclose(M.brier_per_class(self.y, self.p), expected, atol=1e-9)

    def test_accuracy_y_balanced_accuracy(self) -> None:
        pred = self.p.argmax(axis=1)
        self.assertAlmostEqual(M.accuracy(self.y, self.p), accuracy_score(self.y, pred), places=12)
        self.assertAlmostEqual(
            M.balanced_accuracy(self.y, self.p), balanced_accuracy_score(self.y, pred), places=12
        )

    def test_confusion_matrix(self) -> None:
        np.testing.assert_array_equal(
            M.confusion_matrix(self.y, self.p),
            sk_confusion_matrix(self.y, self.p.argmax(axis=1), labels=[0, 1, 2]),
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
