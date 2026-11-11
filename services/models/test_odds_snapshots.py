"""Suite exhaustiva de pruebas unitarias e integración para Agente A1 (`odds_snapshots`)."""

from __future__ import annotations

import json
from pathlib import Path
import sys

import numpy as np
import pandas as pd
import pyarrow.parquet as pq
import pytest

WORKTREE_ROOT = Path(__file__).resolve().parents[2]
if str(WORKTREE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKTREE_ROOT))

from services.ingest import (  # noqa: E402
    ALL_SNAPSHOT_COLUMNS,
    DEDUP_KEY_COLUMNS,
    GAP_GROUP_COLUMNS,
    MAX_GAP_MINUTES,
    MAX_PRICE_DECIMAL,
    MIN_PRICE_DECIMAL,
    REQUIRED_COLUMNS,
    detect_snapshot_gaps,
    devig_market_prices,
    is_valid_price_decimal,
    resolve_closing_for_market,
    resolve_closing_odds,
    validate_and_deduplicate_snapshots,
)


def _row(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "event_id": "E0:20250510:arsenal:liverpool",
        "sport": "football",
        "league": "E0",
        "market": "1x2",
        "line": None,
        "selection": "home",
        "book": "pinnacle",
        "price_decimal": 2.05,
        "ts_captured": "2025-05-10T14:59:59Z",
        "ts_event_start": "2025-05-10T15:00:00Z",
        "source": "historical_fd",
        "snapshot_stage": "close",
    }
    base.update(overrides)
    return base


class TestOddsSnapshotsContract:
    def test_exact_11_required_columns_and_keys(self) -> None:
        assert REQUIRED_COLUMNS == (
            "event_id",
            "sport",
            "league",
            "market",
            "line",
            "selection",
            "book",
            "price_decimal",
            "ts_captured",
            "ts_event_start",
            "source",
        )
        assert len(REQUIRED_COLUMNS) == 11
        assert DEDUP_KEY_COLUMNS == (
            "event_id",
            "market",
            "line",
            "selection",
            "book",
            "ts_captured",
            "source",
        )
        assert GAP_GROUP_COLUMNS == ("event_id", "market", "line", "book")
        assert ALL_SNAPSHOT_COLUMNS[:11] == REQUIRED_COLUMNS

    def test_price_decimal_bounds(self) -> None:
        assert is_valid_price_decimal(MIN_PRICE_DECIMAL) is True
        assert is_valid_price_decimal(MAX_PRICE_DECIMAL) is True
        assert is_valid_price_decimal(1.9091) is True

        assert is_valid_price_decimal(1.0099) is False
        assert is_valid_price_decimal(1.0) is False
        assert is_valid_price_decimal(1000.01) is False
        assert is_valid_price_decimal(0.0) is False
        assert is_valid_price_decimal(-2.0) is False
        assert is_valid_price_decimal(float("nan")) is False
        assert is_valid_price_decimal(float("inf")) is False
        assert is_valid_price_decimal(True) is False
        assert is_valid_price_decimal(None) is False

    def test_validation_deduplication_and_mixed_iso8601_formats(self) -> None:
        rows = [
            # Bordes válidos [1.01, 1000.0]
            _row(selection="home", price_decimal=1.01),
            _row(selection="draw", price_decimal=15.0),
            _row(selection="away", price_decimal=1000.0),
            # Duplicado natural con formato ISO `.000Z` vs `Z` y `line=None`
            _row(selection="home", price_decimal=1.05, ts_captured="2025-05-10T14:59:59.000Z"),
            # Duplicado con `-0.0` vs `+0.0` en `line`
            _row(market="ah", line=-0.0, selection="home", price_decimal=1.92),
            _row(market="ah", line=0.0, selection="home", price_decimal=1.94),
            # Fuera de rango
            _row(book="bet365", selection="home", price_decimal=1.00),
            _row(book="bet365", selection="away", price_decimal=1000.5),
            # Post-kickoff en `scraped_ws` (`ts_captured > ts_event_start`) -> descartado
            _row(
                source="scraped_ws",
                snapshot_stage="intraday",
                ts_captured="2025-05-10T15:00:01Z",
                ts_event_start="2025-05-10T15:00:00.000Z",
                price_decimal=2.05,
            ),
            # Exacto en kickoff (`ts_captured == ts_event_start`) -> válido
            _row(
                source="scraped_ws",
                snapshot_stage="intraday",
                ts_captured="2025-05-10T15:00:00Z",
                ts_event_start="2025-05-10T15:00:00.000Z",
                price_decimal=2.05,
            ),
        ]

        clean_df, stats = validate_and_deduplicate_snapshots(rows)
        assert stats["n_raw"] == 10
        assert stats["n_missing_required"] == 0
        assert stats["n_out_of_range"] == 2
        assert stats["n_post_kickoff_discarded"] == 1
        assert stats["n_duplicates_removed"] == 2
        assert stats["n_valid"] == 5
        assert len(clean_df) == 5

    def test_gap_detection_strictly_greater_than_60_minutes(self) -> None:
        rows = [
            # Captura 1 a las 10:00Z (3 selecciones simultáneas = 1 sola captura)
            _row(source="scraped_ws", selection="home", ts_captured="2025-05-10T10:00:00Z", price_decimal=2.10),
            _row(source="scraped_ws", selection="draw", ts_captured="2025-05-10T10:00:00Z", price_decimal=3.40),
            _row(source="scraped_ws", selection="away", ts_captured="2025-05-10T10:00:00Z", price_decimal=3.60),
            # Captura 2 a las 11:00Z (exactamente 60.0 min -> NO debe reportarse)
            _row(source="scraped_ws", selection="home", ts_captured="2025-05-10T11:00:00Z", price_decimal=2.08),
            # Captura 3 a las 12:15Z (75.0 min > 60.0 min -> SÍ debe reportarse)
            _row(source="scraped_ws", selection="home", ts_captured="2025-05-10T12:15:00Z", price_decimal=2.04),
            # Otra casa con una única captura -> ignorada (< 2 capturas)
            _row(source="scraped_ws", book="smarkets", selection="home", ts_captured="2025-05-10T09:00:00Z"),
        ]
        gaps = detect_snapshot_gaps(rows, max_gap_minutes=MAX_GAP_MINUTES)
        assert len(gaps) == 1
        g = gaps.iloc[0]
        assert g["event_id"] == "E0:20250510:arsenal:liverpool"
        assert g["book"] == "pinnacle"
        assert g["n_captures"] == 3
        assert np.isclose(g["gap_minutes"], 75.0, atol=1e-9)


class TestStrictClosingResolution:
    def test_historical_fd_uses_only_pinnacle_close(self) -> None:
        rows = [
            # Open de Pinnacle (-24h)
            _row(selection="home", price_decimal=2.20, ts_captured="2025-05-09T15:00:00Z", snapshot_stage="open"),
            _row(selection="draw", price_decimal=3.50, ts_captured="2025-05-09T15:00:00Z", snapshot_stage="open"),
            _row(selection="away", price_decimal=3.30, ts_captured="2025-05-09T15:00:00Z", snapshot_stage="open"),
            # Close de Pinnacle (-1s)
            _row(selection="home", price_decimal=2.05, ts_captured="2025-05-10T14:59:59Z", snapshot_stage="close"),
            _row(selection="draw", price_decimal=3.50, ts_captured="2025-05-10T14:59:59Z", snapshot_stage="close"),
            _row(selection="away", price_decimal=3.85, ts_captured="2025-05-10T14:59:59Z", snapshot_stage="close"),
        ]
        res = resolve_closing_for_market(rows, devig_method="power")
        assert res["closing_missing"] is False
        assert res["closing_book"] == "pinnacle"
        assert res["ts_closing"] == "2025-05-10T14:59:59Z"

        probs = [res["selections"][s]["p_novig"] for s in ("home", "draw", "away")]
        assert np.isclose(sum(probs), 1.0, atol=1e-12)
        for s in ("home", "draw", "away"):
            assert np.isclose(
                res["selections"][s]["price_novig"],
                1.0 / res["selections"][s]["p_novig"],
                atol=1e-12,
            )

    def test_historical_fd_never_uses_pinnacle_open_when_close_is_missing(self) -> None:
        open_only = [
            _row(selection="home", price_decimal=2.10, ts_captured="2025-05-09T15:00:00Z", snapshot_stage="open"),
            _row(selection="draw", price_decimal=3.40, ts_captured="2025-05-09T15:00:00Z", snapshot_stage="open"),
            _row(selection="away", price_decimal=3.60, ts_captured="2025-05-09T15:00:00Z", snapshot_stage="open"),
        ]
        res_explicit = resolve_closing_for_market(open_only)
        assert res_explicit["closing_missing"] is True
        assert res_explicit["closing_book"] is None

        # Incluso pasando solo las 11 columnas exactas (sin `snapshot_stage`), `-24h` jamás se toma como cierre
        raw_11_cols = [{k: r[k] for k in REQUIRED_COLUMNS} for r in open_only]
        res_11 = resolve_closing_for_market(raw_11_cols)
        assert res_11["closing_missing"] is True
        assert res_11["closing_book"] is None

    def test_historical_fd_never_uses_bfe_or_recreational_or_nflverse(self) -> None:
        non_pinnacle = [
            _row(book="betfair_exchange", selection="home", price_decimal=2.08),
            _row(book="betfair_exchange", selection="draw", price_decimal=3.55),
            _row(book="betfair_exchange", selection="away", price_decimal=3.90),
            _row(book="bet365", selection="home", price_decimal=2.00),
            _row(book="bet365", selection="draw", price_decimal=3.40),
            _row(book="bet365", selection="away", price_decimal=3.75),
            _row(book="nflverse", market="moneyline", selection="home", price_decimal=1.80),
            _row(book="nflverse", market="moneyline", selection="away", price_decimal=2.10),
        ]
        res_df = resolve_closing_odds(non_pinnacle)
        assert bool(res_df["closing_missing"].all()) is True
        assert res_df["closing_book"].isna().all()

    def test_scraped_ws_pinnacle_latest_prematch_and_smarkets_only_fallback(self) -> None:
        # 1. Múltiples snapshots Pinnacle + 1 post-kickoff -> toma el último `<= ts_event_start`
        pin_rows = [
            _row(
                event_id="ws:nfl:NFL:20261115:saints:panthers",
                sport="nfl",
                league="NFL",
                market="moneyline",
                source="scraped_ws",
                snapshot_stage="intraday",
                book="pinnacle",
                selection="home",
                price_decimal=1.90,
                ts_captured="2026-11-15T16:30:00Z",
                ts_event_start="2026-11-15T18:00:00Z",
            ),
            _row(
                event_id="ws:nfl:NFL:20261115:saints:panthers",
                sport="nfl",
                league="NFL",
                market="moneyline",
                source="scraped_ws",
                snapshot_stage="intraday",
                book="pinnacle",
                selection="away",
                price_decimal=2.00,
                ts_captured="2026-11-15T16:30:00Z",
                ts_event_start="2026-11-15T18:00:00Z",
            ),
            _row(
                event_id="ws:nfl:NFL:20261115:saints:panthers",
                sport="nfl",
                league="NFL",
                market="moneyline",
                source="scraped_ws",
                snapshot_stage="intraday",
                book="pinnacle",
                selection="home",
                price_decimal=1.8547,
                ts_captured="2026-11-15T17:55:00Z",
                ts_event_start="2026-11-15T18:00:00Z",
            ),
            _row(
                event_id="ws:nfl:NFL:20261115:saints:panthers",
                sport="nfl",
                league="NFL",
                market="moneyline",
                source="scraped_ws",
                snapshot_stage="intraday",
                book="pinnacle",
                selection="away",
                price_decimal=2.04,
                ts_captured="2026-11-15T17:55:00Z",
                ts_event_start="2026-11-15T18:00:00Z",
            ),
            # Tick post-kickoff ignorado
            _row(
                event_id="ws:nfl:NFL:20261115:saints:panthers",
                sport="nfl",
                league="NFL",
                market="moneyline",
                source="scraped_ws",
                snapshot_stage="intraday",
                book="pinnacle",
                selection="home",
                price_decimal=1.40,
                ts_captured="2026-11-15T18:02:00Z",
                ts_event_start="2026-11-15T18:00:00Z",
            ),
            _row(
                event_id="ws:nfl:NFL:20261115:saints:panthers",
                sport="nfl",
                league="NFL",
                market="moneyline",
                source="scraped_ws",
                snapshot_stage="intraday",
                book="pinnacle",
                selection="away",
                price_decimal=3.10,
                ts_captured="2026-11-15T18:02:00Z",
                ts_event_start="2026-11-15T18:00:00Z",
            ),
        ]
        res_pin = resolve_closing_for_market(pin_rows)
        assert res_pin["closing_missing"] is False
        assert res_pin["closing_book"] == "pinnacle"
        assert res_pin["ts_closing"] == "2026-11-15T17:55:00Z"

        # 2. Sin Pinnacle pero con Smarkets -> fallback a `smarkets`
        sm_rows = [
            _row(source="scraped_ws", snapshot_stage="intraday", book="smarkets", selection="home", price_decimal=1.98),
            _row(source="scraped_ws", snapshot_stage="intraday", book="smarkets", selection="draw", price_decimal=3.60),
            _row(source="scraped_ws", snapshot_stage="intraday", book="smarkets", selection="away", price_decimal=4.10),
            _row(source="scraped_ws", snapshot_stage="intraday", book="caliente", selection="home", price_decimal=1.85),
        ]
        res_sm = resolve_closing_for_market(sm_rows)
        assert res_sm["closing_missing"] is False
        assert res_sm["closing_book"] == "smarkets"

        # 3. Ni Pinnacle ni Smarkets (solo recreativas Caliente / DraftKings / Bet365) -> `closing_missing = True`
        rec_rows = [
            _row(source="scraped_ws", snapshot_stage="intraday", book="caliente", selection="home", price_decimal=1.90),
            _row(source="scraped_ws", snapshot_stage="intraday", book="caliente", selection="draw", price_decimal=3.40),
            _row(source="scraped_ws", snapshot_stage="intraday", book="caliente", selection="away", price_decimal=3.80),
            _row(source="scraped_ws", snapshot_stage="intraday", book="draftkings", selection="home", price_decimal=1.92),
            _row(source="scraped_ws", snapshot_stage="intraday", book="draftkings", selection="draw", price_decimal=3.45),
            _row(source="scraped_ws", snapshot_stage="intraday", book="draftkings", selection="away", price_decimal=3.85),
        ]
        res_rec = resolve_closing_for_market(rec_rows)
        assert res_rec["closing_missing"] is True
        assert res_rec["closing_book"] is None

    def test_devig_methods_consistency(self) -> None:
        for method in ("proportional", "power", "shin", "adaptive"):
            out = devig_market_prices({"home": 1.95, "draw": 3.60, "away": 4.20}, "1x2", method=method)
            probs = list(out["probabilities"].values())
            assert np.isclose(sum(probs), 1.0, atol=1e-12)
            assert all(0.0 < p < 1.0 for p in probs)

        with pytest.raises(ValueError, match="implausible"):
            # Overround corrupto 2.13 (> 1.2) como el glitch BFE documentado en A13
            devig_market_prices({"home": 1.20, "draw": 1.50, "away": 1.60}, "1x2", method="power")


class TestMaterializedArtifactsSmoke:
    def test_parquet_and_coverage_report_exist_and_satisfy_invariants(self) -> None:
        parquet_path = WORKTREE_ROOT / "research" / "prediction-lab" / "data" / "processed" / "odds_snapshots.parquet"
        report_json_path = WORKTREE_ROOT / "services" / "models" / "artifacts" / "odds_coverage_report.json"
        report_md_path = WORKTREE_ROOT / "research" / "prediction-lab" / "reports" / "A28_a1_odds_coverage.md"

        assert parquet_path.exists(), "odds_snapshots.parquet debe estar materializado"
        assert report_json_path.exists(), "odds_coverage_report.json debe estar materializado"
        assert report_md_path.exists(), "A28_a1_odds_coverage.md debe estar materializado"

        schema = pq.read_schema(parquet_path)
        assert tuple(schema.names[:11]) == REQUIRED_COLUMNS

        report = json.loads(report_json_path.read_text(encoding="utf-8"))
        assert report["totals"]["n_valid_rows"] > 5_000_000
        assert report["totals"]["n_events_historical_fd"] > 180_000
        assert report["totals"]["n_events_scraped_ws"] >= 100
        assert report["closing_coverage_by_source"]["historical_fd"]["n_with_sharp_closing"] > 150_000
        assert report["closing_coverage_by_source"]["scraped_ws"]["n_with_sharp_closing"] > 0

        # Verificar una muestra real de `scraped_ws` y `historical_fd` directamente en el Parquet
        sample_ws = pd.read_parquet(parquet_path, filters=[("source", "==", "scraped_ws")])
        assert len(sample_ws) > 10_000
        assert bool((sample_ws["price_decimal"] >= MIN_PRICE_DECIMAL).all())
        assert bool((sample_ws["price_decimal"] <= MAX_PRICE_DECIMAL).all())
        assert bool((sample_ws["ts_captured"] <= sample_ws["ts_event_start"]).all())
        assert int(sample_ws.duplicated(subset=list(DEDUP_KEY_COLUMNS)).sum()) == 0
        assert "pinnacle" in set(sample_ws["book"].unique())
