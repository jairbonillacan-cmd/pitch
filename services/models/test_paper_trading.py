#!/usr/bin/env python3
"""PREDLAB-V3.2 (Ola 2 · Agente B5 `b5-paper`) — Suite Pytest exhaustiva y Red Team para
`services/models/paper_trading.py` y los artefactos `data/ledger/**`."""

from __future__ import annotations

import json
from pathlib import Path
import sys
from typing import Any

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
MODELS_DIR = REPO_ROOT / "services" / "models"
INGEST_DIR = REPO_ROOT / "services" / "ingest"

for _p in (str(REPO_ROOT), str(MODELS_DIR), str(INGEST_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import clv_report
import paper_trading as pt


def _make_tick(
    *,
    event_id: str,
    league: str,
    market: str,
    line: float | None,
    selection: str,
    book: str,
    price_decimal: float,
    ts_captured: str,
    ts_event_start: str,
    provenance: str | None = None,
) -> dict[str, Any]:
    raw_sha = clv_report.sha256_hex(
        f"{event_id}|{market}|{line}|{selection}|{book}|{price_decimal}|{ts_captured}"
    )
    row: dict[str, Any] = {
        "event_id": event_id,
        "sport": "football",
        "league": league,
        "market": market,
        "line": line,
        "selection": selection,
        "book": book,
        "price_decimal": price_decimal,
        "ts_captured": ts_captured,
        "ts_event_start": ts_event_start,
        "source": "scraped_ws",
        "raw_sha256": raw_sha,
    }
    if provenance is not None:
        row["provenance"] = provenance
    return row


def test_frozen_v3_1_artifacts_integrity_and_zero_production_enabled(tmp_path: Path) -> None:
    frozen = pt.load_and_verify_frozen_v3_1_artifacts(enforce_sha256=True)
    assert frozen["sha256"] == pt.FROZEN_V3_1_EXPECTED_SHA256

    prod = frozen["production_segments"]
    seg_summary = prod["portfolio_vs_segment_verdict"]["segment_level_summary"]
    assert seg_summary["n_segments_production_enabled"] == 0
    assert all(
        seg_cfg.get("production_enabled") is False
        for seg_cfg in prod["segments"].values()
    )

    # Simulacro Red Team: si alguien alterara un segmento a production_enabled=True, debe abortar
    for fname in pt.FROZEN_V3_1_EXPECTED_SHA256:
        src_file = pt.TS_DATA_PREDICTION_DIR / fname
        (tmp_path / fname).write_bytes(src_file.read_bytes())

    tampered = json.loads((tmp_path / "production_segments_v3_1.json").read_text(encoding="utf-8"))
    tampered["segments"]["B1::1x2"]["production_enabled"] = True
    (tmp_path / "production_segments_v3_1.json").write_text(
        json.dumps(tampered), encoding="utf-8"
    )

    with pytest.raises(pt.PaperTradingFrozenArtifactError):
        pt.load_and_verify_frozen_v3_1_artifacts(tmp_path, enforce_sha256=True)
    with pytest.raises(pt.PaperTradingFrozenArtifactError):
        pt.load_and_verify_frozen_v3_1_artifacts(tmp_path, enforce_sha256=False)


def test_real_b3_directory_honest_zero_picks_and_idempotency(tmp_path: Path) -> None:
    real_ledger_tmp = tmp_path / "picks_real_test.jsonl"
    res1 = pt.run_paper_trading(
        timeseries_path=pt.DEFAULT_B3_TIMESERIES_DIR,
        ledger_path=real_ledger_tmp,
        provenance="real",
    )
    res2 = pt.run_paper_trading(
        timeseries_path=pt.DEFAULT_B3_TIMESERIES_DIR,
        ledger_path=real_ledger_tmp,
        provenance="real",
    )

    assert res1["ledger_total_picks"] == 0
    assert res1["ledger_total_records"] == 0
    assert res1["ledger_head_hash"] == clv_report.GENESIS_HASH
    assert res1["ledger_sha256"] == res2["ledger_sha256"]
    assert isinstance(res1["b3_health"], dict)
    assert res1["b3_health"]["capture_status"] == "prospective_capture_pending"

    # Verifica también el archivo canónico real inicializado en disco
    assert pt.DEFAULT_PROSPECTIVE_LEDGER_PATH.exists()
    disk_real_ledger = clv_report.load_ledger_jsonl(pt.DEFAULT_PROSPECTIVE_LEDGER_PATH)
    assert disk_real_ledger.size == 0
    assert disk_real_ledger.head_hash == clv_report.GENESIS_HASH


def test_provenance_guard_blocks_mixing_real_and_synthetic(tmp_path: Path) -> None:
    # 1) Prohibido pasar archivo sintético en modo provenance='real'
    with pytest.raises(pt.PaperTradingProvenanceError):
        pt.run_paper_trading(
            timeseries_path=pt.DEFAULT_SYNTHETIC_TIMESERIES_PATH,
            ledger_path=tmp_path / "real_out.jsonl",
            provenance="real",
        )

    # 2) Prohibido pasar fila marcada synthetic fuera de /fixtures/ en modo provenance='real'
    mixed_ts = tmp_path / "football" / "2026-11-16.jsonl"
    mixed_ts.parent.mkdir(parents=True, exist_ok=True)
    mixed_row = _make_tick(
        event_id="ws:football:B1:20261116:team_a:team_b",
        league="B1",
        market="1x2",
        line=None,
        selection="home",
        book="pinnacle",
        price_decimal=1.95,
        ts_captured="2026-11-16T18:00:00Z",
        ts_event_start="2026-11-16T19:00:00Z",
        provenance="synthetic",
    )
    mixed_ts.write_text(json.dumps(mixed_row) + "\n", encoding="utf-8")

    with pytest.raises(pt.PaperTradingProvenanceError):
        pt.run_paper_trading(
            timeseries_path=tmp_path,
            ledger_path=tmp_path / "real_out2.jsonl",
            provenance="real",
        )

    # 3) Prohibido pasar filas sin 'provenance': 'synthetic' en modo provenance='synthetic'
    unmarked_ts = tmp_path / "unmarked.jsonl"
    unmarked_row = _make_tick(
        event_id="ws:football:B1:20261116:team_a:team_b",
        league="B1",
        market="1x2",
        line=None,
        selection="home",
        book="pinnacle",
        price_decimal=1.95,
        ts_captured="2026-11-16T18:00:00Z",
        ts_event_start="2026-11-16T19:00:00Z",
        provenance=None,
    )
    unmarked_ts.write_text(json.dumps(unmarked_row) + "\n", encoding="utf-8")

    with pytest.raises(pt.PaperTradingProvenanceError):
        pt.run_paper_trading(
            timeseries_path=unmarked_ts,
            ledger_path=tmp_path / "syn_out.jsonl",
            provenance="synthetic",
        )

    # 4) Prohibido apuntar provenance='synthetic' al ledger prospectivo real canónico
    with pytest.raises(pt.PaperTradingProvenanceError):
        pt.run_paper_trading(
            timeseries_path=pt.DEFAULT_SYNTHETIC_TIMESERIES_PATH,
            ledger_path=pt.DEFAULT_PROSPECTIVE_LEDGER_PATH,
            provenance="synthetic",
        )


def test_prospective_cutoff_and_strict_causality_guards(tmp_path: Path) -> None:
    # Delay menor a 2.0 min prohibido
    with pytest.raises(pt.PaperTradingCausalityError):
        pt.run_paper_trading(
            timeseries_path=pt.DEFAULT_B3_TIMESERIES_DIR,
            ledger_path=tmp_path / "bad_delay.jsonl",
            provenance="real",
            execution_delay_minutes=1.5,
        )

    # Evento exactamente en el corte 2026-11-08T20:30:00Z debe ser ignorado al 100%
    cutoff_ts_path = tmp_path / "cutoff_test.jsonl"
    rows = []
    for sel, pr in (("home", 1.85), ("draw", 3.60), ("away", 4.40)):
        rows.append(
            _make_tick(
                event_id="ws:football:B1:20261108:old_home:old_away",
                league="B1",
                market="1x2",
                line=None,
                selection=sel,
                book="pinnacle",
                price_decimal=pr,
                ts_captured="2026-11-08T19:50:00Z",
                ts_event_start="2026-11-08T20:30:00Z",
                provenance="synthetic",
            )
        )
    for sel, pr in (("home", 2.15), ("draw", 3.45), ("away", 3.45)):
        rows.append(
            _make_tick(
                event_id="ws:football:B1:20261108:old_home:old_away",
                league="B1",
                market="1x2",
                line=None,
                selection=sel,
                book="b365",
                price_decimal=pr,
                ts_captured="2026-11-08T19:50:00Z",
                ts_event_start="2026-11-08T20:30:00Z",
                provenance="synthetic",
            )
        )
        rows.append(
            _make_tick(
                event_id="ws:football:B1:20261108:old_home:old_away",
                league="B1",
                market="1x2",
                line=None,
                selection=sel,
                book="b365",
                price_decimal=pr,
                ts_captured="2026-11-08T19:53:00Z",
                ts_event_start="2026-11-08T20:30:00Z",
                provenance="synthetic",
            )
        )
    cutoff_ts_path.write_text(
        "\n".join(json.dumps(r) for r in rows) + "\n", encoding="utf-8"
    )
    probs_path = tmp_path / "cutoff_probs.json"
    probs_path.write_text(
        json.dumps(
            {
                "provenance": "synthetic",
                "events": {
                    "ws:football:B1:20261108:old_home:old_away": {
                        "provenance": "synthetic",
                        "ts_disponible": "2026-11-08T18:00:00Z",
                        "markets": {
                            "1x2": {
                                "line": None,
                                "probs": {"home": 0.55, "draw": 0.25, "away": 0.20},
                            }
                        },
                    }
                },
            }
        ),
        encoding="utf-8",
    )
    res_cut = pt.run_paper_trading(
        timeseries_path=cutoff_ts_path,
        model_probs_path=probs_path,
        ledger_path=tmp_path / "cutoff_ledger.jsonl",
        provenance="synthetic",
    )
    assert res_cut["events_skipped_pre_cutoff"] == 1
    assert res_cut["ledger_total_picks"] == 0

    # Fuga causal en model_probs (ts_disponible > ts_decision) debe lanzar PaperTradingCausalityError
    leaked_ts_path = tmp_path / "leaked_model.jsonl"
    leaked_rows = []
    for sel, pr in (("home", 1.88), ("draw", 3.65), ("away", 4.20)):
        leaked_rows.append(
            _make_tick(
                event_id="ws:football:B1:20261120:future_a:future_b",
                league="B1",
                market="1x2",
                line=None,
                selection=sel,
                book="pinnacle",
                price_decimal=pr,
                ts_captured="2026-11-20T18:00:00Z",
                ts_event_start="2026-11-20T19:00:00Z",
                provenance="synthetic",
            )
        )
    leaked_ts_path.write_text(
        "\n".join(json.dumps(r) for r in leaked_rows) + "\n", encoding="utf-8"
    )
    leaked_probs_path = tmp_path / "leaked_probs.json"
    leaked_probs_path.write_text(
        json.dumps(
            {
                "provenance": "synthetic",
                "events": {
                    "ws:football:B1:20261120:future_a:future_b": {
                        "provenance": "synthetic",
                        "ts_disponible": "2026-11-20T18:15:00Z",  # > 18:00:00Z!
                        "markets": {
                            "1x2": {
                                "line": None,
                                "probs": {"home": 0.53, "draw": 0.26, "away": 0.21},
                            }
                        },
                    }
                },
            }
        ),
        encoding="utf-8",
    )
    with pytest.raises(pt.PaperTradingCausalityError):
        pt.run_paper_trading(
            timeseries_path=leaked_ts_path,
            model_probs_path=leaked_probs_path,
            ledger_path=tmp_path / "leaked_ledger.jsonl",
            provenance="synthetic",
        )


def test_real_mode_two_phase_append_only_lifecycle_smarkets_and_recreational_closing(
    tmp_path: Path,
) -> None:
    """Prueba extremo a extremo en modo `real` (usando `append_pick_to_jsonl` directo) sobre
    un directorio aislado en `tmp_path`:
      - Evento A (`MEX::ah` away `+0.25` desde línea local `-0.25`): fill exacto `>= +2.0m`,
        cierre sharp fallback `smarkets`, empate `1-1` -> `half_win`!
      - Evento B (`B1::1x2` home): fill `+2.5m`, solo existe casa recreativa al cierre si se borra sharp ->
        verifica que cuando solo hay `smarkets`/`pinnacle` resuelve sharp y cuando no hay sharp marca `closing_missing=True`.
      - Verifica que la Fase 2 (`--settle`) JAMÁS muta los bytes previos escritos en la Fase 1
        y que correr Fase 2 dos veces es 100% idempotente."""
    ts_dir = tmp_path / "odds_ts" / "football"
    ts_dir.mkdir(parents=True, exist_ok=True)
    ts_file = ts_dir / "2026-11-18.jsonl"

    eid_ah = "ws:football:MEX:20261118:america:guadalajara"
    # En perspectiva local line=-0.25: away tiene hándicap +0.25
    # Smarkets en T-50m: home=2.12, away=1.80 -> p_snv_away ~ 0.5425
    # Codere en T-50m: home=1.78, away=2.04 -> stale en away!
    pre_match_rows = [
        _make_tick(
            event_id=eid_ah,
            league="MEX",
            market="ah",
            line=-0.25,
            selection="home",
            book="smarkets",
            price_decimal=2.12,
            ts_captured="2026-11-18T01:10:00Z",
            ts_event_start="2026-11-18T02:00:00Z",
        ),
        _make_tick(
            event_id=eid_ah,
            league="MEX",
            market="ah",
            line=-0.25,
            selection="away",
            book="smarkets",
            price_decimal=1.80,
            ts_captured="2026-11-18T01:10:00Z",
            ts_event_start="2026-11-18T02:00:00Z",
        ),
        _make_tick(
            event_id=eid_ah,
            league="MEX",
            market="ah",
            line=-0.25,
            selection="home",
            book="codere",
            price_decimal=1.78,
            ts_captured="2026-11-18T01:10:00Z",
            ts_event_start="2026-11-18T02:00:00Z",
        ),
        _make_tick(
            event_id=eid_ah,
            league="MEX",
            market="ah",
            line=-0.25,
            selection="away",
            book="codere",
            price_decimal=2.04,
            ts_captured="2026-11-18T01:10:00Z",
            ts_event_start="2026-11-18T02:00:00Z",
        ),
        # Tick prematuro en +1.5 min (01:11:30Z) con cuota 2.10 -> DEBE IGNORARSE
        _make_tick(
            event_id=eid_ah,
            league="MEX",
            market="ah",
            line=-0.25,
            selection="home",
            book="codere",
            price_decimal=1.74,
            ts_captured="2026-11-18T01:11:30Z",
            ts_event_start="2026-11-18T02:00:00Z",
        ),
        _make_tick(
            event_id=eid_ah,
            league="MEX",
            market="ah",
            line=-0.25,
            selection="away",
            book="codere",
            price_decimal=2.10,
            ts_captured="2026-11-18T01:11:30Z",
            ts_event_start="2026-11-18T02:00:00Z",
        ),
        # Primer tick >= +2.0 min (01:12:05Z) con cuota 2.01 -> DEBE LLENARSE A 2.01
        _make_tick(
            event_id=eid_ah,
            league="MEX",
            market="ah",
            line=-0.25,
            selection="home",
            book="codere",
            price_decimal=1.81,
            ts_captured="2026-11-18T01:12:05Z",
            ts_event_start="2026-11-18T02:00:00Z",
        ),
        _make_tick(
            event_id=eid_ah,
            league="MEX",
            market="ah",
            line=-0.25,
            selection="away",
            book="codere",
            price_decimal=2.01,
            ts_captured="2026-11-18T01:12:05Z",
            ts_event_start="2026-11-18T02:00:00Z",
        ),
    ]
    ts_file.write_text("\n".join(json.dumps(r) for r in pre_match_rows) + "\n", encoding="utf-8")

    probs_file = tmp_path / "real_probs.json"
    probs_file.write_text(
        json.dumps(
            {
                "provenance": "real",
                "events": {
                    eid_ah: {
                        "ts_disponible": "2026-11-17T23:00:00Z",
                        "markets": {
                            "ah::-0.25": {
                                "line": -0.25,
                                "probs": {"home": 0.445, "away": 0.555},
                                "submodel_probs": {
                                    "home": [0.44, 0.445, 0.45],
                                    "away": [0.56, 0.555, 0.55],
                                },
                            }
                        },
                    }
                },
            }
        ),
        encoding="utf-8",
    )

    ledger_file = tmp_path / "real_lifecycle_ledger.jsonl"

    # Fase 1: Corrida pre-partido (sin --settle ni --results) -> usa append_pick_to_jsonl
    run1 = pt.run_paper_trading(
        timeseries_path=ts_dir.parent,
        model_probs_path=probs_file,
        ledger_path=ledger_file,
        provenance="real",
        settle=False,
    )
    assert run1["n_picks_appended"] == 1
    assert run1["n_closings_appended"] == 0
    assert run1["n_settlements_appended"] == 0

    phase1_bytes = ledger_file.read_bytes()
    ledger_p1 = clv_report.load_ledger_jsonl(ledger_file)
    pick = ledger_p1.get_picks()[0]
    assert pick.selection == "away"
    assert pick.line == pytest.approx(0.25, abs=1e-12)  # away +0.25 convertido desde home -0.25
    assert pick.price_tomado == pytest.approx(2.01, abs=1e-12)  # tick +2m05s, jamás 2.04 ni 2.10
    assert pick.tier in ("solido", "valor")

    # Fase 2: Llega tick de cierre Smarkets en T-2m y resultado final 1-1 (away +0.25 -> half_win)
    closing_rows = [
        _make_tick(
            event_id=eid_ah,
            league="MEX",
            market="ah",
            line=-0.25,
            selection="home",
            book="smarkets",
            price_decimal=2.18,
            ts_captured="2026-11-18T01:58:00Z",
            ts_event_start="2026-11-18T02:00:00Z",
        ),
        _make_tick(
            event_id=eid_ah,
            league="MEX",
            market="ah",
            line=-0.25,
            selection="away",
            book="smarkets",
            price_decimal=1.76,
            ts_captured="2026-11-18T01:58:00Z",
            ts_event_start="2026-11-18T02:00:00Z",
        ),
    ]
    with ts_file.open("a", encoding="utf-8") as fh:
        for r in closing_rows:
            fh.write(json.dumps(r) + "\n")

    results_file = tmp_path / "real_results.json"
    results_file.write_text(
        json.dumps(
            {
                "provenance": "real",
                "results": {
                    eid_ah: {
                        "status": "final",
                        "home_score": 1,
                        "away_score": 1,
                        "ts_event_start": "2026-11-18T02:00:00Z",
                        "ts_settled": "2026-11-18T04:05:00Z",
                    }
                },
            }
        ),
        encoding="utf-8",
    )

    run2 = pt.run_paper_trading(
        timeseries_path=ts_dir.parent,
        model_probs_path=probs_file,
        results_path=results_file,
        ledger_path=ledger_file,
        provenance="real",
        settle=True,
    )
    assert run2["n_picks_appended"] == 0
    assert run2["n_closings_appended"] == 1
    assert run2["n_settlements_appended"] == 1

    phase2_bytes = ledger_file.read_bytes()
    # Inmutabilidad estricta: los bytes previos de la Fase 1 permanecen intactos bit a bit
    assert phase2_bytes.startswith(phase1_bytes)

    ledger_p2 = clv_report.load_ledger_jsonl(ledger_file)
    assert ledger_p2.verify_integrity() is True
    cl_rec = ledger_p2.get_closing(pick.pick_id)
    st_rec = ledger_p2.get_settlement(pick.pick_id)
    assert cl_rec is not None and cl_rec.closing_missing is False
    assert cl_rec.closing_book == "smarkets"
    assert st_rec is not None and st_rec.outcome == "half_win"
    assert st_rec.pnl_u == pytest.approx(0.5 * pick.stake_u * (2.01 - 1.0), abs=1e-12)

    # Fase 3: Idempotencia total al re-ejecutar una tercera vez
    run3 = pt.run_paper_trading(
        timeseries_path=ts_dir.parent,
        model_probs_path=probs_file,
        results_path=results_file,
        ledger_path=ledger_file,
        provenance="real",
        settle=True,
    )
    assert run3["n_picks_appended"] == 0
    assert run3["n_closings_appended"] == 0
    assert run3["n_settlements_appended"] == 0
    assert ledger_file.read_bytes() == phase2_bytes
    assert run3["ledger_head_hash"] == run2["ledger_head_hash"]


def test_recreational_only_closing_marks_closing_missing(tmp_path: Path) -> None:
    """Verifica que si al cierre de un pick registrado no existen capturas pre-kickoff de
    `pinnacle` ni `smarkets` (solo recreativas como `b365`), `closing_missing=True`."""
    ledger_file = tmp_path / "rec_only_close.jsonl"
    clv_report.append_pick_to_jsonl(
        ledger_file,
        {
            "pick_id": "pk_v32_test_rec_only",
            "ts_emitido": "2026-11-19T18:00:00Z",
            "event_id": "ws:football:E0:20261119:everton:fulham",
            "sport": "football",
            "league": "E0",
            "market": "1x2",
            "line": None,
            "selection": "home",
            "book": "b365",
            "price_tomado": 2.15,
            "p_modelo": 0.50,
            "p_mercado": 0.49,
            "p_final": 0.495,
            "ev": 0.06425,
            "stake_u": 1.0,
            "tier": "valor",
            "version_modelo": pt.MODEL_VERSION_REAL,
            "features_hash": "a" * 64,
        },
    )

    ts_file = tmp_path / "rec_only.jsonl"
    rec_rows = [
        _make_tick(
            event_id="ws:football:E0:20261119:everton:fulham",
            league="E0",
            market="1x2",
            line=None,
            selection=sel,
            book="b365",
            price_decimal=pr,
            ts_captured="2026-11-19T18:58:00Z",
            ts_event_start="2026-11-19T19:00:00Z",
        )
        for sel, pr in (("home", 2.05), ("draw", 3.40), ("away", 3.70))
    ]
    ts_file.write_text("\n".join(json.dumps(r) for r in rec_rows) + "\n", encoding="utf-8")

    df_val, _, _, _ = pt.load_prospective_timeseries(ts_file, provenance="real")
    stats = pt.settle_prospective_ledger(
        ledger_path=ledger_file,
        validated_df=df_val,
        results_catalog={
            "ws:football:E0:20261119:everton:fulham": {
                "status": "final",
                "home_score": 1,
                "away_score": 0,
                "ts_event_start": "2026-11-19T19:00:00Z",
                "ts_settled": "2026-11-19T21:00:00Z",
            }
        },
        provenance="real",
        settle_mode=True,
    )
    assert stats == {"n_closings_appended": 1, "n_settlements_appended": 1}

    loaded = clv_report.load_ledger_jsonl(ledger_file)
    cl_rec = loaded.get_closing("pk_v32_test_rec_only")
    assert cl_rec is not None
    assert cl_rec.closing_missing is True
    assert cl_rec.closing_book is None


def test_synthetic_fixture_on_disk_and_weekly_report_contract(tmp_path: Path) -> None:
    assert pt.DEFAULT_SYNTHETIC_LEDGER_PATH.exists()
    raw_lines = [
        json.loads(line)
        for line in pt.DEFAULT_SYNTHETIC_LEDGER_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    assert len(raw_lines) == 12
    assert all(obj.get("provenance") == "synthetic" for obj in raw_lines)

    syn_ledger = clv_report.load_ledger_jsonl(pt.DEFAULT_SYNTHETIC_LEDGER_PATH)
    assert syn_ledger.verify_integrity() is True
    assert syn_ledger.size == 4
    tiers = {p.tier for p in syn_ledger.get_picks()}
    assert tiers == {"solido", "valor"}
    assert all(p.ts_emitido > pt.PROSPECTIVE_CUTOFF_UTC for p in syn_ledger.get_picks())

    # Verificar que el reporte semanal exista y contenga ambas secciones claramente separadas
    report_tmp = tmp_path / "A29_test_week_1.md"
    pt.generate_weekly_prospective_report(
        week=1,
        real_ledger_path=pt.DEFAULT_PROSPECTIVE_LEDGER_PATH,
        real_timeseries_dir=pt.DEFAULT_B3_TIMESERIES_DIR,
        synthetic_ledger_path=pt.DEFAULT_SYNTHETIC_LEDGER_PATH,
        report_out_path=report_tmp,
    )
    md_text = report_tmp.read_text(encoding="utf-8")
    assert "0 / 150" in md_text
    assert "0 / 60" in md_text
    assert "prospective_capture_pending" in md_text
    assert 'provenance: "synthetic"' in md_text
    assert "no significativa" in md_text
    assert "OBSERVADO" in md_text
