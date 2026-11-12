"""Suite de pruebas unitarias e integración para Ola 2 · Agente B6 (`nfl_sharp_closing.py`)."""

from __future__ import annotations

import json
from pathlib import Path
import sys

import numpy as np
import pandas as pd
import pytest

MODELS_DIR = Path(__file__).resolve().parent
WORKTREE_ROOT = MODELS_DIR.parent.parent

if str(WORKTREE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKTREE_ROOT))

from services.ingest.nfl_sharp_closing import (  # noqa: E402
    ALLOWED_SHARP_BOOKS,
    DEFAULT_OUTPUT_NFL_SHARP_PARQUET,
    DEFAULT_REPORT_MD,
    MIN_SETTLED_GAMES_FOR_EVAL,
    NFL_SHARP_CLOSING_COLUMNS,
    ORIGIN_SCRAPED_WS_LEGACY,
    ORIGIN_TIMESERIES_V3_2,
    UNMATCHED_FUTURE_GAME_ID,
    bootstrap_mean_ci95,
    build_nfl_sharp_closing_corpus,
    evaluate_nfl_corpus_gate,
    evaluate_settled_sharp_calibration,
    load_nfl_timeseries_jsonl,
    load_nflverse_schedule,
    resolve_nfl_franchise,
    run_nfl_sharp_closing_pipeline,
)

FORBIDDEN_PUBLIC_COLUMNS = {
    "stake",
    "stake_u",
    "kelly",
    "kelly_fraction",
    "kellyfraction",
    "ev",
    "expected_edge",
    "expectededge",
    "tier",
    "value",
}


def _make_tick(
    *,
    event_id: str = "ws:nfl:NFL:20261110:minnesota_vikings:buffalo_bills",
    sport: str = "nfl",
    league: str = "NFL",
    market: str = "moneyline",
    line: float | None = None,
    selection: str = "home",
    book: str = "pinnacle",
    price_decimal: float = 2.75,
    ts_captured: str = "2026-11-10T01:05:00Z",
    ts_event_start: str = "2026-11-10T01:15:00Z",
    source: str = "scraped_ws",
) -> dict[str, object]:
    return {
        "event_id": event_id,
        "sport": sport,
        "league": league,
        "market": market,
        "line": line,
        "selection": selection,
        "book": book,
        "price_decimal": price_decimal,
        "ts_captured": ts_captured,
        "ts_event_start": ts_event_start,
        "source": source,
    }


def _make_synthetic_schedule(rows: list[dict[str, object]]) -> pd.DataFrame:
    df = pd.DataFrame(rows)
    df["season"] = pd.to_numeric(df["season"], errors="coerce").astype("Int64")
    df["week"] = pd.to_numeric(df["week"], errors="coerce").astype("Int64")
    df["home_franchise"] = df["home_team"].map(resolve_nfl_franchise)
    df["away_franchise"] = df["away_team"].map(resolve_nfl_franchise)
    local_str = df["gameday"].astype(str) + " " + df["gametime"].astype(str) + ":00"
    df["kickoff_utc_ref"] = (
        pd.to_datetime(local_str, format="%Y-%m-%d %H:%M:%S")
        .dt.tz_localize("America/New_York")
        .dt.tz_convert("UTC")
    )
    df["home_score"] = pd.to_numeric(df["home_score"], errors="coerce")
    df["away_score"] = pd.to_numeric(df["away_score"], errors="coerce")
    df["is_settled"] = df["home_score"].notna() & df["away_score"].notna()
    df["in_nfl_games_parquet"] = df["is_settled"]
    return df


class TestRealParquetAndReportOnDisk:
    """Verifica el Parquet real `nfl_sharp_closing.parquet` y el reporte `A29_nfl_sharp_corpus.md`."""

    def test_parquet_exists_schema_invariants_and_zero_stakes(self) -> None:
        assert DEFAULT_OUTPUT_NFL_SHARP_PARQUET.exists(), f"Falta {DEFAULT_OUTPUT_NFL_SHARP_PARQUET}"
        assert DEFAULT_REPORT_MD.exists(), f"Falta {DEFAULT_REPORT_MD}"

        df = pd.read_parquet(DEFAULT_OUTPUT_NFL_SHARP_PARQUET)
        assert tuple(df.columns) == NFL_SHARP_CLOSING_COLUMNS
        assert FORBIDDEN_PUBLIC_COLUMNS.isdisjoint({c.lower() for c in df.columns})

        # Exactamente 13 eventos reales de Pinnacle (2026-11-09) x 3 mercados = 39 filas
        assert len(df) == 39
        assert df["game_id"].nunique() == 13
        assert (df["game_id"] != UNMATCHED_FUTURE_GAME_ID).all()
        assert not df.duplicated(subset=["game_id", "market"]).any()

        # Solo libros sharp homologados y cero fugas post-kickoff
        assert set(df["closing_book"].unique()).issubset(set(ALLOWED_SHARP_BOOKS))
        assert set(df["closing_book"].unique()) == {"pinnacle"}
        assert set(df["ingest_origin"].unique()) == {ORIGIN_SCRAPED_WS_LEGACY}
        assert (df["ts_closing"] <= df["ts_event_start"]).all()
        assert (df["lead_time_to_kickoff_minutes"] >= 0.0).all()

        # Coherencia de probabilidades sin margen (< 1e-12)
        ml_sp = df.loc[df["market"].isin(["moneyline", "spread"])]
        assert len(ml_sp) == 26
        assert np.allclose(ml_sp["p_home_novig"] + ml_sp["p_away_novig"], 1.0, atol=1e-12)
        assert ml_sp["p_over_novig"].isna().all()
        assert ml_sp["p_under_novig"].isna().all()
        assert ml_sp["price_home_decimal"].notna().all()
        assert ml_sp["price_away_decimal"].notna().all()

        tot = df.loc[df["market"] == "totals"]
        assert len(tot) == 13
        assert np.allclose(tot["p_over_novig"] + tot["p_under_novig"], 1.0, atol=1e-12)
        assert tot["p_home_novig"].isna().all()
        assert tot["p_away_novig"].isna().all()
        assert tot["price_over_decimal"].notna().all()
        assert tot["price_under_decimal"].notna().all()

        # Compuerta sobre el Parquet real: 0 partidos liquidados < 64 -> corpus insuficiente y NFL apagado
        gate = evaluate_nfl_corpus_gate(df)
        assert gate["n_settled_games_with_sharp_closing"] == 0
        assert gate["corpus_sufficient_for_eval"] is False
        assert gate["production_enabled"] is False

        report_txt = DEFAULT_REPORT_MD.read_text(encoding="utf-8")
        assert "OBSERVADO" in report_txt
        assert "corpus_sufficient_for_eval = False" in report_txt
        assert "production_enabled = False" in report_txt


class TestNflverseMatchingAndFranchiseResolution:
    """Verifica resolución de las 32 franquicias, relocalizaciones y ventana horaria UTC <-> ET."""

    def test_all_32_franchises_and_historical_relocations(self) -> None:
        assert resolve_nfl_franchise("Oakland Raiders") == "LV"
        assert resolve_nfl_franchise("OAK") == "LV"
        assert resolve_nfl_franchise("las_vegas_raiders") == "LV"
        assert resolve_nfl_franchise("San Diego Chargers") == "LAC"
        assert resolve_nfl_franchise("SD") == "LAC"
        assert resolve_nfl_franchise("los_angeles_chargers") == "LAC"
        assert resolve_nfl_franchise("St. Louis Rams") == "LA"
        assert resolve_nfl_franchise("STL") == "LA"
        assert resolve_nfl_franchise("LAR") == "LA"
        assert resolve_nfl_franchise("Washington Football Team") == "WAS"
        assert resolve_nfl_franchise("WSH") == "WAS"
        assert resolve_nfl_franchise("JAC") == "JAX"

        schedule, meta = load_nflverse_schedule()
        assert meta["unified_nflverse_games"] >= 7548
        assert set(schedule["home_franchise"].unique()).__len__() == 32
        assert set(schedule["away_franchise"].unique()).__len__() == 32

    def test_primetime_utc_next_day_rollover_and_unmatched_future(self) -> None:
        sched = _make_synthetic_schedule(
            [
                {
                    "game_id": "2026_09_BUF_MIN",
                    "season": 2026,
                    "week": 9,
                    "gameday": "2026-11-09",
                    "gametime": "20:15",
                    "home_team": "MIN",
                    "away_team": "BUF",
                    "home_score": 24,
                    "away_score": 27,
                },
            ]
        )
        ticks = [
            # MNF 2026-11-09 20:15 ET == 2026-11-10T01:15:00Z (día siguiente en UTC)
            _make_tick(
                event_id="ws:nfl:NFL:20261110:minnesota_vikings:buffalo_bills",
                market="moneyline",
                selection="home",
                price_decimal=2.70,
                ts_captured="2026-11-10T01:10:00Z",
                ts_event_start="2026-11-10T01:15:00Z",
            ),
            _make_tick(
                event_id="ws:nfl:NFL:20261110:minnesota_vikings:buffalo_bills",
                market="moneyline",
                selection="away",
                price_decimal=1.52,
                ts_captured="2026-11-10T01:10:00Z",
                ts_event_start="2026-11-10T01:15:00Z",
            ),
            # Partido futuro fuera del corte local de nflverse -> `unmatched_future`
            _make_tick(
                event_id="ws:nfl:NFL:20270912:kansas_city_chiefs:denver_broncos",
                market="moneyline",
                selection="home",
                price_decimal=1.45,
                ts_captured="2027-09-12T19:50:00Z",
                ts_event_start="2027-09-12T20:25:00Z",
            ),
            _make_tick(
                event_id="ws:nfl:NFL:20270912:kansas_city_chiefs:denver_broncos",
                market="moneyline",
                selection="away",
                price_decimal=2.95,
                ts_captured="2027-09-12T19:50:00Z",
                ts_event_start="2027-09-12T20:25:00Z",
            ),
        ]
        closing_df, audit = build_nfl_sharp_closing_corpus(timeseries_rows=ticks, nfl_schedule=sched)
        assert len(closing_df) == 2

        matched = closing_df.loc[closing_df["game_id"] == "2026_09_BUF_MIN"].iloc[0]
        assert matched["home_team"] == "MIN"
        assert matched["away_team"] == "BUF"
        assert int(matched["season"]) == 2026
        assert int(matched["week"]) == 9
        assert matched["gameday"] == "2026-11-09"
        assert bool(matched["is_settled"]) is True
        assert matched["home_score"] == 24.0
        assert matched["away_score"] == 27.0
        assert np.isclose(matched["lead_time_to_kickoff_minutes"], 5.0)
        assert matched["ingest_origin"] == ORIGIN_TIMESERIES_V3_2

        unmatched = closing_df.loc[closing_df["game_id"] == UNMATCHED_FUTURE_GAME_ID].iloc[0]
        assert unmatched["home_team"] == "KC"
        assert unmatched["away_team"] == "DEN"
        assert pd.isna(unmatched["season"])
        assert pd.isna(unmatched["week"])
        assert bool(unmatched["is_settled"]) is False
        assert np.isnan(unmatched["home_score"])
        assert audit["gate"]["n_matched_nflverse_games"] == 1
        assert audit["gate"]["n_unmatched_future_events"] == 1
        assert audit["gate"]["n_settled_games_with_sharp_closing"] == 1


class TestSharpBookPriorityAndStrictRejections:
    """Verifica prioridad `pinnacle` > `smarkets` y rechazo total de recreativas, consenso y post-kickoff."""

    def test_pinnacle_strictly_beats_smarkets_and_smarkets_is_clean_fallback(self) -> None:
        sched = _make_synthetic_schedule(
            [
                {
                    "game_id": "2026_08_DAL_SF",
                    "season": 2026,
                    "week": 8,
                    "gameday": "2026-11-01",
                    "gametime": "20:20",
                    "home_team": "SF",
                    "away_team": "DAL",
                    "home_score": 30,
                    "away_score": 24,
                },
                {
                    "game_id": "2026_08_NYJ_NE",
                    "season": 2026,
                    "week": 8,
                    "gameday": "2026-11-01",
                    "gametime": "13:00",
                    "home_team": "NE",
                    "away_team": "NYJ",
                    "home_score": 17,
                    "away_score": 20,
                },
            ]
        )
        ticks = [
            # Juego 1 (SF vs DAL): Pinnacle en T-15m (-4.5) y Smarkets más reciente en T-2m (-5.0) -> Pinnacle DEBE ganar
            _make_tick(
                event_id="ws:nfl:NFL:20261102:san_francisco_49ers:dallas_cowboys",
                market="spread",
                line=-4.5,
                selection="home",
                book="pinnacle",
                price_decimal=1.93,
                ts_captured="2026-11-02T01:05:00Z",
                ts_event_start="2026-11-02T01:20:00Z",
            ),
            _make_tick(
                event_id="ws:nfl:NFL:20261102:san_francisco_49ers:dallas_cowboys",
                market="spread",
                line=-4.5,
                selection="away",
                book="pinnacle",
                price_decimal=1.97,
                ts_captured="2026-11-02T01:05:00Z",
                ts_event_start="2026-11-02T01:20:00Z",
            ),
            _make_tick(
                event_id="ws:nfl:NFL:20261102:san_francisco_49ers:dallas_cowboys",
                market="spread",
                line=-5.0,
                selection="home",
                book="smarkets",
                price_decimal=1.98,
                ts_captured="2026-11-02T01:18:00Z",
                ts_event_start="2026-11-02T01:20:00Z",
            ),
            _make_tick(
                event_id="ws:nfl:NFL:20261102:san_francisco_49ers:dallas_cowboys",
                market="spread",
                line=-5.0,
                selection="away",
                book="smarkets",
                price_decimal=1.98,
                ts_captured="2026-11-02T01:18:00Z",
                ts_event_start="2026-11-02T01:20:00Z",
            ),
            # Juego 2 (NE vs NYJ): Pinnacle ausente (solo post-kickoff descartado), Smarkets válido pre-kickoff -> Smarkets gana
            _make_tick(
                event_id="ws:nfl:NFL:20261101:new_england_patriots:new_york_jets",
                market="moneyline",
                selection="home",
                book="pinnacle",
                price_decimal=2.10,
                ts_captured="2026-11-01T18:00:01Z",  # 1s post-kickoff -> descartado
                ts_event_start="2026-11-01T18:00:00Z",
            ),
            _make_tick(
                event_id="ws:nfl:NFL:20261101:new_england_patriots:new_york_jets",
                market="moneyline",
                selection="away",
                book="pinnacle",
                price_decimal=1.82,
                ts_captured="2026-11-01T18:00:01Z",  # 1s post-kickoff -> descartado
                ts_event_start="2026-11-01T18:00:00Z",
            ),
            _make_tick(
                event_id="ws:nfl:NFL:20261101:new_england_patriots:new_york_jets",
                market="moneyline",
                selection="home",
                book="smarkets",
                price_decimal=2.14,
                ts_captured="2026-11-01T17:58:00Z",
                ts_event_start="2026-11-01T18:00:00Z",
            ),
            _make_tick(
                event_id="ws:nfl:NFL:20261101:new_england_patriots:new_york_jets",
                market="moneyline",
                selection="away",
                book="smarkets",
                price_decimal=1.84,
                ts_captured="2026-11-01T17:58:00Z",
                ts_event_start="2026-11-01T18:00:00Z",
            ),
        ]
        closing_df, audit = build_nfl_sharp_closing_corpus(timeseries_rows=ticks, nfl_schedule=sched)
        assert audit["snapshot_validation"]["n_post_kickoff_discarded"] == 2
        assert len(closing_df) == 2

        sf_row = closing_df.loc[closing_df["game_id"] == "2026_08_DAL_SF"].iloc[0]
        assert sf_row["closing_book"] == "pinnacle"
        assert np.isclose(sf_row["line"], -4.5)

        ne_row = closing_df.loc[closing_df["game_id"] == "2026_08_NYJ_NE"].iloc[0]
        assert ne_row["closing_book"] == "smarkets"
        assert np.isclose(ne_row["lead_time_to_kickoff_minutes"], 2.0)

    def test_strict_rejection_of_recreational_consensus_nflverse_and_post_kickoff(self) -> None:
        sched = _make_synthetic_schedule(
            [
                {
                    "game_id": "2026_09_BUF_MIN",
                    "season": 2026,
                    "week": 9,
                    "gameday": "2026-11-09",
                    "gametime": "20:15",
                    "home_team": "MIN",
                    "away_team": "BUF",
                    "home_score": 20,
                    "away_score": 28,
                },
            ]
        )
        forbidden_books = (
            "nflverse",
            "action_consensus",
            "consensus",
            "draftkings",
            "dk nj",
            "fanduel",
            "bet365",
            "betmgm",
            "caliente",
            "codere",
            "betfair_exchange",
            "polymarket",
            "kalshi",
        )
        ticks: list[dict[str, object]] = []
        for bk in forbidden_books:
            ticks.append(_make_tick(book=bk, selection="home", price_decimal=2.60))
            ticks.append(_make_tick(book=bk, selection="away", price_decimal=1.55))

        # Añadir además consenso histórico `historical_fd` (`nflverse`) y un tick post-kickoff de Pinnacle
        ticks.append(_make_tick(book="nflverse", source="historical_fd", selection="home", price_decimal=2.60))
        ticks.append(_make_tick(book="nflverse", source="historical_fd", selection="away", price_decimal=1.55))
        ticks.append(
            _make_tick(
                book="pinnacle",
                selection="home",
                price_decimal=2.70,
                ts_captured="2026-11-10T01:15:01Z",
                ts_event_start="2026-11-10T01:15:00Z",
            )
        )
        ticks.append(
            _make_tick(
                book="pinnacle",
                selection="away",
                price_decimal=1.52,
                ts_captured="2026-11-10T01:15:01Z",
                ts_event_start="2026-11-10T01:15:00Z",
            )
        )

        closing_df, audit = build_nfl_sharp_closing_corpus(timeseries_rows=ticks, nfl_schedule=sched)
        assert len(closing_df) == 0
        assert audit["discarded_non_scraped_ws_source_rows"] == 2
        assert audit["snapshot_validation"]["n_post_kickoff_discarded"] == 2
        assert audit["rejected_non_sharp_rows_total"] == len(forbidden_books) * 2
        assert audit["gate"]["corpus_sufficient_for_eval"] is False
        assert audit["gate"]["production_enabled"] is False

    def test_jsonl_timeseries_loader_and_origin_precedence(self, tmp_path: Path) -> None:
        nfl_dir = tmp_path / "nfl"
        nfl_dir.mkdir(parents=True)
        jsonl_file = nfl_dir / "2026-11-10.jsonl"
        recs = [
            _make_tick(selection="home", price_decimal=2.80, ts_captured="2026-11-10T01:12:00Z"),
            _make_tick(selection="away", price_decimal=1.50, ts_captured="2026-11-10T01:12:00Z"),
        ]
        jsonl_file.write_text("\n".join(json.dumps(r) for r in recs) + "\n", encoding="utf-8")

        ts_df, ts_meta = load_nfl_timeseries_jsonl(timeseries_nfl_dir=nfl_dir, health_json_path=None)
        assert ts_meta["jsonl_files_count"] == 1
        assert len(ts_df) == 2

        legacy_older = [
            _make_tick(selection="home", price_decimal=2.65, ts_captured="2026-11-09T20:05:00Z"),
            _make_tick(selection="away", price_decimal=1.55, ts_captured="2026-11-09T20:05:00Z"),
        ]
        sched = _make_synthetic_schedule(
            [
                {
                    "game_id": "2026_09_BUF_MIN",
                    "season": 2026,
                    "week": 9,
                    "gameday": "2026-11-09",
                    "gametime": "20:15",
                    "home_team": "MIN",
                    "away_team": "BUF",
                    "home_score": None,
                    "away_score": None,
                },
            ]
        )
        closing_df, audit = build_nfl_sharp_closing_corpus(
            timeseries_rows=ts_df,
            legacy_ws_rows=legacy_older,
            nfl_schedule=sched,
        )
        assert len(closing_df) == 1
        row = closing_df.iloc[0]
        assert row["ingest_origin"] == ORIGIN_TIMESERIES_V3_2
        assert np.isclose(row["price_home_decimal"], 2.80)
        assert np.isclose(row["lead_time_to_kickoff_minutes"], 3.0)
        assert audit["events_by_ingest_origin"][ORIGIN_TIMESERIES_V3_2] == 1


class TestSampleSufficiencyGate64AndBootstrap:
    """Verifica la compuerta exacta `>= 64` partidos liquidados y el bootstrap `mulberry32`."""

    @staticmethod
    def _build_settled_fixture(n_games: int, settled: bool = True) -> pd.DataFrame:
        rows = []
        for idx in range(n_games):
            gid = f"2025_{(idx // 16) + 1:02d}_BUF_MIA_{idx}"
            rows.append(
                {
                    "game_id": gid,
                    "event_id": f"ws:nfl:NFL:20250907:miami_dolphins:buffalo_bills:{idx}",
                    "season": 2025,
                    "week": (idx // 16) + 1,
                    "gameday": "2025-09-07",
                    "ts_event_start": pd.Timestamp("2025-09-07T17:00:00Z"),
                    "home_team": "MIA",
                    "away_team": "BUF",
                    "market": "moneyline",
                    "line": float("nan"),
                    "closing_book": "pinnacle" if idx % 2 == 0 else "smarkets",
                    "ts_closing": pd.Timestamp("2025-09-07T16:58:00Z"),
                    "lead_time_to_kickoff_minutes": 2.0,
                    "closing_overround": 0.025,
                    "p_home_novig": 0.60,
                    "p_away_novig": 0.40,
                    "p_over_novig": float("nan"),
                    "p_under_novig": float("nan"),
                    "price_home_decimal": 1.625,
                    "price_away_decimal": 2.44,
                    "price_over_decimal": float("nan"),
                    "price_under_decimal": float("nan"),
                    "home_score": 24.0 if (settled and idx % 3 != 0) else (17.0 if settled else float("nan")),
                    "away_score": 20.0 if (settled and idx % 3 != 0) else (27.0 if settled else float("nan")),
                    "is_settled": settled,
                    "ingest_origin": ORIGIN_TIMESERIES_V3_2,
                }
            )
        return pd.DataFrame(rows)

    def test_gate_boundary_63_vs_64_and_unsettled_exclusion(self) -> None:
        assert MIN_SETTLED_GAMES_FOR_EVAL == 64

        # 80 partidos NO liquidados siguen teniendo `n_settled == 0 < 64` -> `False`
        df_unsettled_80 = self._build_settled_fixture(80, settled=False)
        gate_unsettled = evaluate_nfl_corpus_gate(df_unsettled_80)
        assert gate_unsettled["n_settled_games_with_sharp_closing"] == 0
        assert gate_unsettled["corpus_sufficient_for_eval"] is False
        assert gate_unsettled["production_enabled"] is False

        # 63 partidos liquidados -> `False` (faltante = 1)
        df_63 = self._build_settled_fixture(63, settled=True)
        gate_63 = evaluate_nfl_corpus_gate(df_63)
        assert gate_63["n_settled_games_with_sharp_closing"] == 63
        assert gate_63["shortfall_to_eval_gate"] == 1
        assert gate_63["corpus_sufficient_for_eval"] is False
        assert gate_63["production_enabled"] is False

        # Exactamente 64 partidos liquidados -> `corpus_sufficient_for_eval = True`,
        # pero `production_enabled` sigue en `False` por Regla Rectora #3 (requiere A3/A4 + 150 picks prospectivos)
        df_64 = self._build_settled_fixture(64, settled=True)
        gate_64 = evaluate_nfl_corpus_gate(df_64)
        assert gate_64["n_settled_games_with_sharp_closing"] == 64
        assert gate_64["shortfall_to_eval_gate"] == 0
        assert gate_64["corpus_sufficient_for_eval"] is True
        assert gate_64["production_enabled"] is False

        cal_64 = evaluate_settled_sharp_calibration(df_64, bootstrap_samples=1000, seed=20261111)
        ml_cal = cal_64["markets"]["moneyline"]
        assert ml_cal["n_settled_non_push"] == 64
        assert ml_cal["status"] == "corpus_suficiente_para_evaluacion"
        assert ml_cal["log_loss_ci95"][0] <= ml_cal["log_loss"] <= ml_cal["log_loss_ci95"][1]

    def test_bootstrap_requires_at_least_1000_resamples_and_is_deterministic(self) -> None:
        with pytest.raises(ValueError, match=">= 1000"):
            bootstrap_mean_ci95([0.1, 0.2, 0.3], bootstrap_samples=999, seed=20261111)

        r1 = bootstrap_mean_ci95([0.02, 0.03, 0.025, 0.04], bootstrap_samples=1000, seed=20261111)
        r2 = bootstrap_mean_ci95([0.02, 0.03, 0.025, 0.04], bootstrap_samples=1000, seed=20261111)
        assert r1 == r2
        assert r1["significance_vs_zero"] == "significativa_positiva"

    def test_no_legacy_snapshots_mode_produces_valid_empty_parquet(self, tmp_path: Path) -> None:
        empty_ts_dir = tmp_path / "empty_nfl"
        out_pq = tmp_path / "nfl_sharp_closing_empty.parquet"
        out_md = tmp_path / "A29_empty.md"
        summary = run_nfl_sharp_closing_pipeline(
            timeseries_nfl_dir=empty_ts_dir,
            health_json_path=None,
            include_legacy_snapshots=False,
            output_parquet_path=out_pq,
            report_md_path=out_md,
        )
        assert out_pq.exists()
        assert out_md.exists()
        reloaded = pd.read_parquet(out_pq)
        assert len(reloaded) == 0
        assert tuple(reloaded.columns) == NFL_SHARP_CLOSING_COLUMNS
        assert summary["audit"]["gate"]["corpus_sufficient_for_eval"] is False
        assert summary["audit"]["gate"]["production_enabled"] is False
