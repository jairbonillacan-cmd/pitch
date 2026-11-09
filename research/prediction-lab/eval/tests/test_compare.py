"""Tests unitarios de ``eval.compare`` (bootstrap por bloques, permutación, alineación)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

LAB_ROOT = Path(__file__).resolve().parents[2]
if str(LAB_ROOT) not in sys.path:
    sys.path.insert(0, str(LAB_ROOT))

from eval import compare as C  # noqa: E402
from eval import metrics as M  # noqa: E402


def make_case(n: int = 300, seed: int = 5):
    rng = np.random.default_rng(seed)
    y = rng.integers(0, 3, size=n)
    good = np.full((n, 3), 0.1)
    good[np.arange(n), y] = 0.8
    bad = np.full((n, 3), 1.0 / 3.0)
    noise = rng.random((n, 3)) + 1e-3
    noise = noise / noise.sum(axis=1, keepdims=True)
    seasons = np.array(["2021/22", "2022/23", "2023/24"])[np.arange(n) % 3]
    divs = np.array(["E0", "SP1"])[np.arange(n) % 2]
    blocks = C.make_blocks(seasons, divs)
    return y, good, bad, noise, blocks


class TestBootstrap(unittest.TestCase):
    def test_sistemas_identicos_delta_cero(self) -> None:
        y, good, bad, noise, blocks = make_case()
        result = C.paired_bootstrap_delta(y, noise, noise.copy(), blocks, B=500, seed=11)
        self.assertEqual(result["delta_logloss"], 0.0)
        self.assertEqual(result["ci95_logloss"], [0.0, 0.0])
        self.assertEqual(result["frac_gt0_logloss"], 0.0)
        self.assertEqual(result["delta_brier"], 0.0)
        self.assertEqual(result["ci95_brier"], [0.0, 0.0])
        self.assertEqual(result["n_matches"], 300)
        self.assertEqual(result["n_blocks"], 6)
        self.assertEqual(result["B"], 500)
        self.assertEqual(result["seed"], 11)

    def test_sistema_mejor_tiene_delta_negativo(self) -> None:
        y, good, bad, _, blocks = make_case()
        result = C.paired_bootstrap_delta(y, good, bad, blocks, B=500, seed=3)
        self.assertLess(result["delta_logloss"], 0.0)
        self.assertLess(result["ci95_logloss"][1], 0.0)  # IC entero bajo 0
        self.assertEqual(result["frac_gt0_logloss"], 0.0)
        self.assertLess(result["delta_brier"], 0.0)
        self.assertLess(result["ci95_brier"][1], 0.0)

    def test_delta_coincide_con_la_diferencia_de_medias(self) -> None:
        y, good, bad, _, blocks = make_case()
        result = C.paired_bootstrap_delta(y, good, bad, blocks, B=100, seed=9)
        esperado = M.multiclass_log_loss(y, good) - M.multiclass_log_loss(y, bad)
        self.assertAlmostEqual(result["delta_logloss"], esperado, places=12)

    def test_reproducible_con_la_misma_semilla(self) -> None:
        y, _, bad, noise, blocks = make_case()
        first = C.paired_bootstrap_delta(y, noise, bad, blocks, B=200, seed=42)
        second = C.paired_bootstrap_delta(y, noise, bad, blocks, B=200, seed=42)
        self.assertEqual(first, second)
        other = C.paired_bootstrap_delta(y, noise, bad, blocks, B=200, seed=43)
        # El estimador puntual no depende de la semilla; el IC sí (con pérdidas
        # por partido heterogéneas, no en el caso degenerado good-vs-bad).
        self.assertAlmostEqual(first["delta_logloss"], other["delta_logloss"], places=15)
        self.assertNotEqual(first["ci95_logloss"], other["ci95_logloss"])
        self.assertLess(first["ci95_logloss"][0], first["ci95_logloss"][1])

    def test_acepta_tuplas_como_bloques(self) -> None:
        y, good, bad, _, blocks = make_case()
        tuples = [(str(block).split("|")[0], str(block).split("|")[1]) for block in blocks]
        as_tuples = C.paired_bootstrap_delta(y, good, bad, tuples, B=100, seed=1)
        as_labels = C.paired_bootstrap_delta(y, good, bad, blocks, B=100, seed=1)
        self.assertEqual(as_tuples["n_blocks"], 6)
        self.assertEqual(as_tuples["delta_logloss"], as_labels["delta_logloss"])

    def test_b_uno_ic_degenerado(self) -> None:
        y, good, bad, _, blocks = make_case()
        result = C.paired_bootstrap_delta(y, good, bad, blocks, B=1, seed=0)
        self.assertEqual(result["ci95_logloss"], [result["delta_logloss"]] * 2)

    def test_validacion(self) -> None:
        y, good, bad, _, blocks = make_case()
        with self.assertRaises(ValueError):
            C.paired_bootstrap_delta(y, good, bad, blocks[:10], B=10)
        with self.assertRaises(ValueError):
            C.paired_bootstrap_delta(y, good[:-1], bad, blocks, B=10)
        with self.assertRaises(ValueError):
            C.paired_bootstrap_delta(y, good, bad, blocks, B=0)


class TestPermutation(unittest.TestCase):
    def test_sistemas_identicos_p_uno(self) -> None:
        y, _, _, noise, blocks = make_case()
        result = C.permutation_test_delta(y, noise, noise.copy(), n=1000, seed=5)
        self.assertEqual(result["observed_delta"], 0.0)
        self.assertEqual(result["p_value"], 1.0)
        self.assertEqual(result["n_permutations"], 1000)

    def test_diferencia_grande_p_pequeno(self) -> None:
        y, good, bad, _, blocks = make_case()
        result = C.permutation_test_delta(y, good, bad, n=2000, seed=5)
        self.assertLess(result["observed_delta"], 0.0)
        self.assertLess(result["p_value"], 0.01)
        self.assertGreaterEqual(result["p_value"], 1.0 / 2001.0 - 1e-12)

    def test_reproducible(self) -> None:
        y, good, bad, _, _ = make_case()
        first = C.permutation_test_delta(y, good, bad, n=500, seed=17)
        second = C.permutation_test_delta(y, good, bad, n=500, seed=17)
        self.assertEqual(first, second)

    def test_metrica_brier(self) -> None:
        y, good, bad, _, _ = make_case()
        result = C.permutation_test_delta(y, good, bad, n=500, seed=2, metric="brier")
        self.assertEqual(result["metric"], "brier")

    def test_parametros_invalidos(self) -> None:
        y, good, bad, _, _ = make_case()
        with self.assertRaises(ValueError):
            C.permutation_test_delta(y, good, bad, n=0)
        with self.assertRaises(ValueError):
            C.permutation_test_delta(y, good, bad, n=10, metric="accuracy")

    def test_compare_systems_combina(self) -> None:
        y, good, bad, _, blocks = make_case()
        combined = C.compare_systems(y, good, bad, blocks, B=100, n_permutations=200, seed=4)
        self.assertIn("bootstrap", combined)
        self.assertIn("permutation", combined)
        self.assertAlmostEqual(
            combined["bootstrap"]["delta_logloss"],
            combined["permutation"]["observed_delta"],
            places=12,
        )


class TestSameMatches(unittest.TestCase):
    def _frames(self):
        ids = [f"m{i:03d}" for i in range(20)]
        rng = np.random.default_rng(1)
        probs = rng.random((20, 3))
        probs = probs / probs.sum(axis=1, keepdims=True)
        a = pd.DataFrame({"match_id": ids, "p_home": probs[:, 0], "p_draw": probs[:, 1], "p_away": probs[:, 2]})
        order = rng.permutation(20)
        b = pd.DataFrame(
            {
                "match_id": [ids[i] for i in order],
                "p_home": probs[order, 0],
                "p_draw": probs[order, 1],
                "p_away": probs[order, 2],
            }
        )
        return a, b

    def test_alinea_aunque_el_orden_difiera(self) -> None:
        a, b = self._frames()
        aligned = C.same_matches(a, b)
        self.assertEqual(aligned["n"], 20)
        self.assertEqual(aligned["n_only_a"], 0)
        self.assertEqual(aligned["n_only_b"], 0)
        np.testing.assert_array_equal(aligned["match_ids"], np.sort(a["match_id"].to_numpy()))
        a_probs = a.iloc[aligned["idx_a"]][["p_home", "p_draw", "p_away"]].to_numpy()
        b_probs = b.iloc[aligned["idx_b"]][["p_home", "p_draw", "p_away"]].to_numpy()
        np.testing.assert_allclose(a_probs, b_probs, atol=0.0)

    def test_estricto_falla_si_los_conjuntos_difieren(self) -> None:
        a, b = self._frames()
        b2 = b.iloc[:-2].copy()
        with self.assertRaises(ValueError) as ctx:
            C.same_matches(a, b2)
        self.assertIn("no son idénticos", str(ctx.exception))
        self.assertIn("solo en a: 2", str(ctx.exception))

    def test_no_estricto_usa_interseccion(self) -> None:
        a, b = self._frames()
        b2 = b.iloc[:-2].copy()
        aligned = C.same_matches(a, b2, strict=False)
        self.assertEqual(aligned["n"], 18)
        self.assertEqual(aligned["n_only_a"], 2)
        self.assertEqual(aligned["n_only_b"], 0)

    def test_duplicados_fallan(self) -> None:
        a, b = self._frames()
        duplicated = pd.concat([a, a.iloc[[0]]], ignore_index=True)
        with self.assertRaises(ValueError):
            C.same_matches(duplicated, b)

    def test_columna_ausente_y_nulos(self) -> None:
        a, b = self._frames()
        with self.assertRaises(ValueError):
            C.same_matches(a.drop(columns=["match_id"]), b)
        a_null = a.copy()
        a_null.loc[0, "match_id"] = np.nan
        with self.assertRaises(ValueError):
            C.same_matches(a_null, b)


class TestMakeBlocks(unittest.TestCase):
    def test_etiquetas(self) -> None:
        blocks = C.make_blocks(["2024/25", "2024/25", "2023/24"], ["E0", "SP1", "E0"])
        self.assertEqual(blocks.tolist(), ["2024/25|E0", "2024/25|SP1", "2023/24|E0"])

    def test_longitudes(self) -> None:
        with self.assertRaises(ValueError):
            C.make_blocks(["2024/25"], ["E0", "SP1"])
        with self.assertRaises(ValueError):
            C.make_blocks([], [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
