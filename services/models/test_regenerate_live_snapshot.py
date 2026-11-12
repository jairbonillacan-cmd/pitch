"""Pruebas end-to-end para `services/models/regenerate_live_snapshot.py` (Ola 2 · B8)."""

from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from services.models.regenerate_live_snapshot import (
    DEFAULT_SNAPSHOT_PATH,
    DEFAULT_TIMESERIES_DIR,
    OUTLOOK_SCHEMA_VERSION,
    SNAPSHOT_SCHEMA_VERSION,
    SnapshotRegenerationError,
    main,
    regenerate_live_snapshot_file,
    slugify_team,
    validate_snapshot_payload,
)


def _write_jsonl(path: Path, rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows)
    path.write_text(text, encoding="utf-8")


def test_official_live_snapshot_passes_check_and_preserves_legacy_compatibility() -> None:
    """Verifica el snapshot oficial regenerado en `src/data/prediction/live_matchday_v3_snapshot.json`."""
    assert DEFAULT_SNAPSHOT_PATH.exists()
    data = json.loads(DEFAULT_SNAPSHOT_PATH.read_text(encoding="utf-8"))

    assert data["schema_version"] == SNAPSHOT_SCHEMA_VERSION
    assert data["n_matchups"] == 242
    assert data["n_teams"] == 376
    assert data["executable_bets_count"] == 0
    assert len(data["edge_matrix_records"]) == 242
    assert len(data["team_master_records"]) == 376
    assert len(data["expected_predictions"]) == 242

    meta = data["outlooks_meta"]
    assert meta["schema_version"] == OUTLOOK_SCHEMA_VERSION
    assert meta["max_quote_age_hours"] == 72
    assert meta["n_outlooks_total"] == 130
    assert meta["n_football"] == 84
    assert meta["n_nfl"] == 46
    assert meta["counts_by_league"] == {
        "bundesliga": 17,
        "epl": 24,
        "laliga": 5,
        "liga-mx": 10,
        "ligue-1": 11,
        "nfl": 46,
        "serie-a": 17,
    }

    summary = validate_snapshot_payload(
        data,
        max_quote_age_hours=72.0,
        reference_now_utc=meta["generated_at_utc"],
    )
    assert summary["n_outlooks_total"] == 130
    assert summary["n_football"] == 84
    assert summary["n_nfl"] == 46
    assert summary["max_simplex_error"] < 1e-12

    # Con B3 en `prospective_capture_pending`, ningún partido inventa cuotas (`market: null`)
    if meta["capture_status"] == "prospective_capture_pending":
        assert meta["n_with_fresh_sharp_quotes_lt_72h"] == 0
        for outlook in data["outlooks"]:
            assert outlook["dataQuality"]["sharpMarketAvailable"] is False
            for mkt in outlook["markets"]:
                assert mkt["market"] is None
                for sel in mkt["selections"]:
                    assert sel["pSource"] in ("model", "base_rate")

    rc = main(
        [
            "--timeseries-dir",
            str(DEFAULT_TIMESERIES_DIR),
            "--max-quote-age-hours",
            "72",
            "--out",
            str(DEFAULT_SNAPSHOT_PATH),
            "--now-utc",
            str(meta["generated_at_utc"]),
            "--check",
        ]
    )
    assert rc == 0


def test_regenerate_attaches_fresh_lt_72h_sharp_and_recreational_quotes_without_touching_legacy(
    tmp_path: Path,
) -> None:
    """Valida cruce `< 72 h` con `ws:<sport>:<league>:...`, casas sharp vs recreativas e invarianza legacy."""
    base_data = json.loads(DEFAULT_SNAPSHOT_PATH.read_text(encoding="utf-8"))
    edge_records = base_data["edge_matrix_records"]

    mex_rec = next(r for r in edge_records if r["league"] == "liga-mx")
    nfl_rec = next(
        r
        for r in edge_records
        if r["league"] == "nfl" and r.get("kickoff_utc") is None
    )

    now_utc = "2026-11-12T16:00:00Z"
    cap_fresh = "2026-11-12T13:30:00Z"  # 2.5 h de antigüedad (< 72 h)
    mex_kickoff = (
        mex_rec.get("kickoff_utc") or "2026-11-14T02:00:00Z"
    )
    # Si el registro base tenía kickoff pasado respecto a `now_utc`, usamos copia base con kickoff futuro
    custom_base_path = tmp_path / "base_snapshot.json"
    base_copy = copy.deepcopy(base_data)
    for r in base_copy["edge_matrix_records"]:
        if r["matchup_id"] == mex_rec["matchup_id"]:
            r["kickoff_utc"] = "2026-11-14T02:00:00Z"
            mex_kickoff = r["kickoff_utc"]
            break
    custom_base_path.write_text(
        json.dumps(base_copy, ensure_ascii=False), encoding="utf-8"
    )

    mex_event_id = (
        f"ws:football:MEX:20261114:"
        f"{slugify_team(mex_rec['home_team'])}:{slugify_team(mex_rec['away_team'])}"
    )
    nfl_kickoff = "2026-11-15T18:00:00Z"
    nfl_event_id = (
        f"ws:nfl:NFL:20261115:"
        f"{slugify_team(nfl_rec['home_team'])}:{slugify_team(nfl_rec['away_team'])}"
    )

    ts_dir = tmp_path / "odds_timeseries"
    (ts_dir / "football").mkdir(parents=True)
    (ts_dir / "nfl").mkdir(parents=True)
    (ts_dir / "health.json").write_text(
        json.dumps(
            {
                "capture_status": "active",
                "generated_at_utc": "2026-11-12T15:55:00Z",
                "events_tracked": 2,
                "total_rows_written": 13,
            }
        ),
        encoding="utf-8",
    )

    football_ticks = [
        # Pinnacle sharp 1X2 (< 72 h)
        {
            "event_id": mex_event_id,
            "sport": "football",
            "league": "MEX",
            "market": "1x2",
            "line": None,
            "selection": "home",
            "book": "pinnacle",
            "price_decimal": 2.05,
            "ts_captured": cap_fresh,
            "ts_event_start": mex_kickoff,
            "source": "scraped_ws",
        },
        {
            "event_id": mex_event_id,
            "sport": "football",
            "league": "MEX",
            "market": "1x2",
            "line": None,
            "selection": "draw",
            "book": "pinnacle",
            "price_decimal": 3.40,
            "ts_captured": cap_fresh,
            "ts_event_start": mex_kickoff,
            "source": "scraped_ws",
        },
        {
            "event_id": mex_event_id,
            "sport": "football",
            "league": "MEX",
            "market": "1x2",
            "line": None,
            "selection": "away",
            "book": "pinnacle",
            "price_decimal": 3.80,
            "ts_captured": cap_fresh,
            "ts_event_start": mex_kickoff,
            "source": "scraped_ws",
        },
        # Pinnacle sharp totals 2.5 (< 72 h)
        {
            "event_id": mex_event_id,
            "sport": "football",
            "league": "MEX",
            "market": "totals",
            "line": 2.5,
            "selection": "over",
            "book": "pinnacle",
            "price_decimal": 1.92,
            "ts_captured": cap_fresh,
            "ts_event_start": mex_kickoff,
            "source": "scraped_ws",
        },
        {
            "event_id": mex_event_id,
            "sport": "football",
            "league": "MEX",
            "market": "totals",
            "line": 2.5,
            "selection": "under",
            "book": "pinnacle",
            "price_decimal": 1.98,
            "ts_captured": cap_fresh,
            "ts_event_start": mex_kickoff,
            "source": "scraped_ws",
        },
        # Recreativa bet365 en BTTS: aporta contexto `market`, jamás modifica `p` (`pSource == 'model'`)
        {
            "event_id": mex_event_id,
            "sport": "football",
            "league": "MEX",
            "market": "btts",
            "line": None,
            "selection": "yes",
            "book": "bet365",
            "price_decimal": 1.80,
            "ts_captured": cap_fresh,
            "ts_event_start": mex_kickoff,
            "source": "scraped_ws",
        },
        {
            "event_id": mex_event_id,
            "sport": "football",
            "league": "MEX",
            "market": "btts",
            "line": None,
            "selection": "no",
            "book": "bet365",
            "price_decimal": 1.95,
            "ts_captured": cap_fresh,
            "ts_event_start": mex_kickoff,
            "source": "scraped_ws",
        },
    ]
    nfl_ticks = [
        {
            "event_id": nfl_event_id,
            "sport": "nfl",
            "league": "NFL",
            "market": "moneyline",
            "line": None,
            "selection": "home",
            "book": "pinnacle",
            "price_decimal": 1.65,
            "ts_captured": cap_fresh,
            "ts_event_start": nfl_kickoff,
            "source": "scraped_ws",
        },
        {
            "event_id": nfl_event_id,
            "sport": "nfl",
            "league": "NFL",
            "market": "moneyline",
            "line": None,
            "selection": "away",
            "book": "pinnacle",
            "price_decimal": 2.35,
            "ts_captured": cap_fresh,
            "ts_event_start": nfl_kickoff,
            "source": "scraped_ws",
        },
        {
            "event_id": nfl_event_id,
            "sport": "nfl",
            "league": "NFL",
            "market": "spread",
            "line": -3.5,
            "selection": "home",
            "book": "pinnacle",
            "price_decimal": 1.95,
            "ts_captured": cap_fresh,
            "ts_event_start": nfl_kickoff,
            "source": "scraped_ws",
        },
        {
            "event_id": nfl_event_id,
            "sport": "nfl",
            "league": "NFL",
            "market": "spread",
            "line": -3.5,
            "selection": "away",
            "book": "pinnacle",
            "price_decimal": 1.95,
            "ts_captured": cap_fresh,
            "ts_event_start": nfl_kickoff,
            "source": "scraped_ws",
        },
        {
            "event_id": nfl_event_id,
            "sport": "nfl",
            "league": "NFL",
            "market": "totals",
            "line": 47.5,
            "selection": "over",
            "book": "pinnacle",
            "price_decimal": 1.91,
            "ts_captured": cap_fresh,
            "ts_event_start": nfl_kickoff,
            "source": "scraped_ws",
        },
        {
            "event_id": nfl_event_id,
            "sport": "nfl",
            "league": "NFL",
            "market": "totals",
            "line": 47.5,
            "selection": "under",
            "book": "pinnacle",
            "price_decimal": 1.99,
            "ts_captured": cap_fresh,
            "ts_event_start": nfl_kickoff,
            "source": "scraped_ws",
        },
    ]
    _write_jsonl(ts_dir / "football" / f"{mex_event_id.replace(':', '_')}.jsonl", football_ticks)
    _write_jsonl(ts_dir / "nfl" / f"{nfl_event_id.replace(':', '_')}.jsonl", nfl_ticks)

    out_path = tmp_path / "regenerated_snapshot.json"
    result = regenerate_live_snapshot_file(
        out_path=out_path,
        base_snapshot_path=custom_base_path,
        timeseries_dir=ts_dir,
        max_quote_age_hours=72.0,
        now_utc=now_utc,
    )

    assert result["outlooks_meta"]["capture_status"] == "active"
    assert result["outlooks_meta"]["n_with_fresh_sharp_quotes_lt_72h"] == 2
    assert result["outlooks_meta"]["n_with_any_fresh_quotes_lt_72h"] == 2

    # Invarianza exacta de los bloques heredados
    assert result["edge_matrix_records"] == base_copy["edge_matrix_records"]
    assert result["team_master_records"] == base_copy["team_master_records"]
    assert result["counts_by_league"] == base_copy["counts_by_league"]
    assert result["expected_predictions"] == base_copy["expected_predictions"]

    by_id = {o["matchId"]: o for o in result["outlooks"]}
    mex_outlook = by_id[mex_rec["matchup_id"]]
    assert mex_outlook["dataQuality"]["sharpMarketAvailable"] is True
    assert mex_outlook["marketsByKey"]["1x2"]["market"]["book"] == "pinnacle"
    assert mex_outlook["marketsByKey"]["1x2"]["headline"]["pSource"] in (
        "market_sharp_novig",
        "blend_v3_1",
    )
    assert mex_outlook["marketsByKey"]["totals_2_5"]["market"]["book"] == "pinnacle"
    assert mex_outlook["marketsByKey"]["totals_2_5"]["headline"]["pSource"] in (
        "market_sharp_novig",
        "blend_v3_1",
    )
    # Doble oportunidad hereda aditividad de 1X2 aunque su propio market sea null
    assert mex_outlook["marketsByKey"]["double_chance"]["market"] is None
    assert (
        mex_outlook["marketsByKey"]["double_chance"]["headline"]["pSource"]
        == mex_outlook["marketsByKey"]["1x2"]["headline"]["pSource"]
    )
    # BTTS recreativo: market poblado, pero pSource estrictamente "model" y sharpMarketAvailable=False
    assert mex_outlook["marketsByKey"]["btts"]["market"]["book"] == "bet365"
    assert mex_outlook["marketsByKey"]["btts"]["market"]["overround"] > 0.0
    for sel in mex_outlook["marketsByKey"]["btts"]["selections"]:
        assert sel["pSource"] == "model"
        assert sel["dataQuality"]["sharpMarketAvailable"] is False

    nfl_outlook = by_id[nfl_rec["matchup_id"]]
    assert nfl_outlook["dataQuality"]["sharpMarketAvailable"] is True
    assert [m["marketKey"] for m in nfl_outlook["markets"]] == [
        "moneyline",
        "spread",
        "totals",
    ]
    for mkt in nfl_outlook["markets"]:
        assert mkt["market"]["book"] == "pinnacle"
        assert mkt["headline"]["pSource"] == "market_sharp_novig"

    # `--check` en el momento de generación pasa; `--check` 73 h después falla por expiración >= 72 h
    assert (
        main(
            [
                "--out",
                str(out_path),
                "--max-quote-age-hours",
                "72",
                "--now-utc",
                now_utc,
                "--check",
            ]
        )
        == 0
    )
    assert (
        main(
            [
                "--out",
                str(out_path),
                "--max-quote-age-hours",
                "72",
                "--now-utc",
                "2026-11-15T15:00:00Z",
                "--check",
            ]
        )
        == 1
    )


def test_rejects_stale_72h_boundary_future_post_kickoff_blocked_books_and_forbidden_stake_keys(
    tmp_path: Path,
) -> None:
    """Verifica frontera estricta `< 72 h`, causalidad, fuentes bloqueadas y prohibición de stake/Kelly."""
    base_data = json.loads(DEFAULT_SNAPSHOT_PATH.read_text(encoding="utf-8"))
    nfl_rec = next(
        r
        for r in base_data["edge_matrix_records"]
        if r["league"] == "nfl" and r.get("kickoff_utc") is None
    )

    now_utc = "2026-11-12T16:00:00Z"
    kickoff = "2026-11-15T20:00:00Z"
    nfl_event_id = (
        f"ws:nfl:NFL:20261115:"
        f"{slugify_team(nfl_rec['home_team'])}:{slugify_team(nfl_rec['away_team'])}"
    )

    ts_dir = tmp_path / "odds_timeseries_edge_cases"
    (ts_dir / "nfl").mkdir(parents=True)
    (ts_dir / "health.json").write_text(
        json.dumps({"capture_status": "active", "generated_at_utc": now_utc}),
        encoding="utf-8",
    )

    rejected_ticks = [
        # Exactamente 72.0 h de antigüedad -> rechazado porque la regla es estricta `< 72 h`
        {
            "event_id": nfl_event_id,
            "sport": "nfl",
            "league": "NFL",
            "market": "moneyline",
            "line": None,
            "selection": "home",
            "book": "pinnacle",
            "price_decimal": 1.80,
            "ts_captured": "2026-11-09T16:00:00Z",
            "ts_event_start": kickoff,
            "source": "scraped_ws",
        },
        {
            "event_id": nfl_event_id,
            "sport": "nfl",
            "league": "NFL",
            "market": "moneyline",
            "line": None,
            "selection": "away",
            "book": "pinnacle",
            "price_decimal": 2.10,
            "ts_captured": "2026-11-09T16:00:00Z",
            "ts_event_start": kickoff,
            "source": "scraped_ws",
        },
        # Captura futura (`ts_captured > now_utc`) -> rechazada
        {
            "event_id": nfl_event_id,
            "sport": "nfl",
            "league": "NFL",
            "market": "moneyline",
            "line": None,
            "selection": "home",
            "book": "smarkets",
            "price_decimal": 1.82,
            "ts_captured": "2026-11-12T16:05:00Z",
            "ts_event_start": kickoff,
            "source": "scraped_ws",
        },
        {
            "event_id": nfl_event_id,
            "sport": "nfl",
            "league": "NFL",
            "market": "moneyline",
            "line": None,
            "selection": "away",
            "book": "smarkets",
            "price_decimal": 2.08,
            "ts_captured": "2026-11-12T16:05:00Z",
            "ts_event_start": kickoff,
            "source": "scraped_ws",
        },
        # Captura post-kickoff (`ts_captured > ts_event_start`) -> rechazada
        {
            "event_id": nfl_event_id,
            "sport": "nfl",
            "league": "NFL",
            "market": "moneyline",
            "line": None,
            "selection": "home",
            "book": "pinnacle",
            "price_decimal": 1.75,
            "ts_captured": "2026-11-12T15:00:00Z",
            "ts_event_start": "2026-11-12T14:00:00Z",
            "source": "scraped_ws",
        },
        {
            "event_id": nfl_event_id,
            "sport": "nfl",
            "league": "NFL",
            "market": "moneyline",
            "line": None,
            "selection": "away",
            "book": "pinnacle",
            "price_decimal": 2.20,
            "ts_captured": "2026-11-12T15:00:00Z",
            "ts_event_start": "2026-11-12T14:00:00Z",
            "source": "scraped_ws",
        },
        # Fuentes bloqueadas (`caliente`, `action_consensus`) -> descartadas en ingesta
        {
            "event_id": nfl_event_id,
            "sport": "nfl",
            "league": "NFL",
            "market": "moneyline",
            "line": None,
            "selection": "home",
            "book": "caliente",
            "price_decimal": 1.75,
            "ts_captured": "2026-11-12T15:00:00Z",
            "ts_event_start": kickoff,
            "source": "scraped_ws",
        },
        {
            "event_id": nfl_event_id,
            "sport": "nfl",
            "league": "NFL",
            "market": "moneyline",
            "line": None,
            "selection": "away",
            "book": "action_consensus",
            "price_decimal": 2.15,
            "ts_captured": "2026-11-12T15:00:00Z",
            "ts_event_start": kickoff,
            "source": "scraped_ws",
        },
    ]
    _write_jsonl(ts_dir / "nfl" / "rejected.jsonl", rejected_ticks)

    out_path = tmp_path / "clean_rejected_snapshot.json"
    regenerated = regenerate_live_snapshot_file(
        out_path=out_path,
        timeseries_dir=ts_dir,
        max_quote_age_hours=72.0,
        now_utc=now_utc,
    )

    assert regenerated["outlooks_meta"]["n_with_fresh_sharp_quotes_lt_72h"] == 0
    assert regenerated["outlooks_meta"]["n_with_any_fresh_quotes_lt_72h"] == 0
    nfl_outlook = next(
        o for o in regenerated["outlooks"] if o["matchId"] == nfl_rec["matchup_id"]
    )
    assert nfl_outlook["marketsByKey"]["moneyline"]["market"] is None
    assert nfl_outlook["marketsByKey"]["moneyline"]["headline"]["pSource"] == "model"

    # Contaminar con un campo prohibido (`kellyFraction` o `"pick seguro"`) dispara error en auditoría
    tampered_key = copy.deepcopy(regenerated)
    tampered_key["outlooks"][0]["kellyFraction"] = 0.05
    with pytest.raises(SnapshotRegenerationError, match="kellyFraction"):
        validate_snapshot_payload(tampered_key, reference_now_utc=now_utc)

    tampered_text = copy.deepcopy(regenerated)
    tampered_text["outlooks"][0]["markets"][0]["headline"]["label"] = "Pick seguro garantizado"
    tampered_path = tmp_path / "tampered.json"
    tampered_path.write_text(json.dumps(tampered_text), encoding="utf-8")
    assert main(["--out", str(tampered_path), "--now-utc", now_utc, "--check"]) == 1
