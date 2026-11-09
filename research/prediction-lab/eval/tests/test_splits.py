"""Tests unitarios de ``eval.splits`` (particiones y walk-forward)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

LAB_ROOT = Path(__file__).resolve().parents[2]
if str(LAB_ROOT) not in sys.path:
    sys.path.insert(0, str(LAB_ROOT))

from eval import splits as S  # noqa: E402

SEASONS = [
    ("2018/19", 2018),
    ("2019/20", 2019),
    ("2020/21", 2020),
    ("2021/22", 2021),
    ("2022/23", 2022),
    ("2023/24", 2023),
    ("2024/25", 2024),
    ("2025/26", 2025),
    ("2026/27", 2026),
]
# Fechas dentro de cada temporada (una por "jornada" simulada).
_DAYS = ("08-10", "12-15", "04-10")


def make_season_frame(extra_postponed: bool = False) -> pd.DataFrame:
    """DataFrame sintético: 3 partidos por temporada y división (E0, SP1)."""
    rows = []
    for season, year in SEASONS:
        for div in ("E0", "SP1"):
            for i, day in enumerate(_DAYS):
                month = int(day.split("-")[0])
                date_year = year + 1 if month < 8 else year
                date = pd.Timestamp(f"{date_year}-{day}")
                rows.append(
                    {
                        "match_id": f"{div}:{date:%Y%m%d}:home_{i}:away_{i}",
                        "div": div,
                        "season": season,
                        "season_start": year,
                        "match_date": date,
                        "result": "H",
                        "y": 0,
                    }
                )
    if extra_postponed:
        # Partido de 2019/20 aplazado y jugado el 2020-09-05, después del
        # primer partido de 2020/21 (2020-08-10): debe quedar fuera del train
        # del fold wf_2021 por el corte temporal.
        rows.append(
            {
                "match_id": "E0:20200905:home_x:away_x",
                "div": "E0",
                "season": "2019/20",
                "season_start": 2019,
                "match_date": pd.Timestamp("2020-09-05"),
                "result": "D",
                "y": 1,
            }
        )
    return pd.DataFrame(rows)


class TestSeasonParsing(unittest.TestCase):
    def test_formatos(self) -> None:
        self.assertEqual(S.season_start_year("2024/25"), 2024)
        self.assertEqual(S.season_start_year("2024-25"), 2024)
        self.assertEqual(S.season_start_year("2024"), 2024)
        self.assertEqual(S.season_start_year(2024), 2024)
        self.assertEqual(S.season_start_year(np.int64(2024)), 2024)

    def test_invalidos(self) -> None:
        for value in ("", "abc", None, 1800, 2200):
            with self.assertRaises((ValueError, TypeError)):
                S.season_start_year(value)

    def test_particiones(self) -> None:
        self.assertEqual(S.partition_for_year(2001), "dev")
        self.assertEqual(S.partition_for_year(2022), "dev")
        self.assertEqual(S.partition_for_year(2023), "val")
        self.assertEqual(S.partition_for_year(2024), "test")
        self.assertEqual(S.partition_for_year(2025), "test")
        self.assertEqual(S.partition_for_year(2026), "live")
        self.assertEqual(S.partition_for_year(2027), "unknown")


class TestCanonicalMasks(unittest.TestCase):
    def test_conteos_y_exclusividad(self) -> None:
        df = make_season_frame()
        masks = S.canonical_masks(df)
        self.assertEqual(set(masks), {"dev", "val", "test", "live"})
        # Exclusividad: cada fila cae en exactamente una partición.
        total = sum(mask.astype(int) for mask in masks.values())
        np.testing.assert_array_equal(total, np.ones(len(df), dtype=int))
        self.assertEqual(int(masks["dev"].sum()), 5 * 6)  # 2018/19..2022/23
        self.assertEqual(int(masks["val"].sum()), 6)
        self.assertEqual(int(masks["test"].sum()), 12)
        self.assertEqual(int(masks["live"].sum()), 6)

    def test_alineadas_con_el_indice(self) -> None:
        df = make_season_frame().sample(frac=1.0, random_state=7).reset_index(drop=True)
        masks = S.canonical_masks(df)
        series = S.canonical_partition_series(df)
        for name, mask in masks.items():
            np.testing.assert_array_equal(mask, (series == name).to_numpy())

    def test_fuera_de_calendario(self) -> None:
        df = pd.DataFrame(
            {
                "season": ["2030/31"],
                "season_start": [2030],
                "match_date": [pd.Timestamp("2030-08-01")],
            }
        )
        masks = S.canonical_masks(df)
        self.assertFalse(any(mask.any() for mask in masks.values()))
        self.assertEqual(S.canonical_partition_series(df).iloc[0], "unknown")


class TestWalkForward(unittest.TestCase):
    def setUp(self) -> None:
        self.df = make_season_frame()

    def test_expanding_cubre_dev_y_val(self) -> None:
        folds = S.walk_forward_splits(self.df)
        ids = [fold["fold_id"] for fold in folds]
        # No hay fold para la primera temporada (sin datos previos) y nunca
        # para test/live.
        self.assertEqual(ids, [f"wf_{year}" for year in range(2019, 2024)])
        seasons = [fold["test_season"] for fold in folds]
        self.assertNotIn("2024/25", seasons)
        self.assertNotIn("2026/27", seasons)
        for fold in folds:
            self.assertIsInstance(fold["train_idx"], np.ndarray)
            self.assertIsInstance(fold["test_idx"], np.ndarray)
            self.assertEqual(fold["train_idx"].dtype, np.int64)
            self.assertEqual(fold["test_idx"].dtype, np.int64)
            # Índices posicionales, sin solape.
            self.assertEqual(np.intersect1d(fold["train_idx"], fold["test_idx"]).size, 0)
            # El test corresponde exactamente a la temporada objetivo.
            self.assertTrue(
                (self.df.iloc[fold["test_idx"]]["season"] == fold["test_season"]).all()
            )
            # Expanding: todo lo anterior a S está en train.
            prior = self.df["season_start"] < fold["season_start"]
            np.testing.assert_array_equal(
                np.sort(fold["train_idx"]), np.flatnonzero(prior)
            )

    def test_rolling_usa_ultimas_temporadas(self) -> None:
        folds = S.walk_forward_splits(self.df, mode="rolling", rolling_seasons=2)
        by_id = {fold["fold_id"]: fold for fold in folds}
        self.assertEqual(by_id["wf_2023"]["train_seasons"], ["2021/22", "2022/23"])
        self.assertEqual(by_id["wf_2019"]["train_seasons"], ["2018/19"])  # menos de 2
        for fold in folds:
            self.assertLessEqual(len(fold["train_seasons"]), 2)
            self.assertTrue(
                (self.df.iloc[fold["train_idx"]]["season_start"] < fold["season_start"]).all()
            )

    def test_min_train_seasons(self) -> None:
        folds = S.walk_forward_splits(self.df, min_train_seasons=3)
        self.assertEqual(folds[0]["fold_id"], "wf_2021")
        self.assertEqual(len(folds), 3)  # 2021, 2022, 2023

    def test_sin_leakage_temporal(self) -> None:
        folds = S.walk_forward_splits(self.df)
        self.assertEqual(S.check_no_leakage(self.df, folds), [])
        for fold in folds:
            train_dates = self.df.iloc[fold["train_idx"]]["match_date"]
            test_dates = self.df.iloc[fold["test_idx"]]["match_date"]
            self.assertLess(train_dates.max(), test_dates.min())

    def test_corte_por_fecha_de_aplazados(self) -> None:
        df = make_season_frame(extra_postponed=True)
        folds = S.walk_forward_splits(df, date_cut=True)
        fold_2020 = next(fold for fold in folds if fold["fold_id"] == "wf_2020")
        self.assertEqual(fold_2020["n_train_dropped_date"], 1)
        train_seasons = set(df.iloc[fold_2020["train_idx"]]["match_id"])
        self.assertNotIn("E0:20200905:home_x:away_x", train_seasons)
        self.assertEqual(S.check_no_leakage(df, folds), [])

        # Sin corte temporal, el aplazado entra en train y se detecta el solape.
        folds_raw = S.walk_forward_splits(df, date_cut=False)
        fold_raw = next(fold for fold in folds_raw if fold["fold_id"] == "wf_2020")
        self.assertIn("E0:20200905:home_x:away_x", set(df.iloc[fold_raw["train_idx"]]["match_id"]))
        problems = S.check_no_leakage(df, folds_raw)
        self.assertTrue(any("wf_2020" in problem for problem in problems))

    def test_parametros_invalidos(self) -> None:
        with self.assertRaises(ValueError):
            S.walk_forward_splits(self.df, mode="random")
        with self.assertRaises(ValueError):
            S.walk_forward_splits(self.df, mode="rolling", rolling_seasons=0)
        with self.assertRaises(ValueError):
            S.walk_forward_splits(self.df, min_train_seasons=0)
        with self.assertRaises(ValueError):
            S.walk_forward_splits(self.df, include_partitions=("dev", "test"))

    def test_dataframe_vacio(self) -> None:
        empty = self.df.iloc[0:0]
        self.assertEqual(S.walk_forward_splits(empty), [])

    def test_fechas_en_los_folds(self) -> None:
        # Primer fold: wf_2019 predice la temporada 2019/20 (ago-2019..abr-2020)
        # entrenando con 2018/19 (ago-2018..abr-2019).
        fold = S.walk_forward_splits(self.df)[0]
        self.assertEqual(str(fold["test_start"]), "2019-08-10")
        self.assertEqual(str(fold["test_end"]), "2020-04-10")
        self.assertEqual(str(fold["train_start"]), "2018-08-10")
        self.assertEqual(str(fold["train_end"]), "2019-04-10")


if __name__ == "__main__":
    unittest.main(verbosity=2)
