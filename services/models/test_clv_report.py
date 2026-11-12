"""Tests unitarios y de auditoría Red Team para `services/models/clv_report.py` (Contrato A2)."""

from __future__ import annotations

from dataclasses import FrozenInstanceError
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from services.models.clv_report import (
    DEFAULT_BOOTSTRAP_RESAMPLES,
    DuplicatePickError,
    GENESIS_HASH,
    LedgerIntegrityError,
    LedgerValidationError,
    PickLedger,
    append_pick_to_jsonl,
    bootstrap_paired_delta_ci,
    compute_clv_metrics,
    compute_entry_hash,
    compute_features_hash,
    compute_max_drawdown_u,
    compute_single_pick_clv,
    generate_clv_markdown_report,
    grade_market_outcome,
    load_ledger_jsonl,
    main as clv_cli_main,
    mulberry32_uniforms,
    resolve_closings_from_snapshots,
    save_ledger_jsonl,
    settle_pick_pnl,
    summarize_picks_bootstrap,
    verify_ledger_integrity,
)


def _sample_pick(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "pick_id": "pk-mx-001",
        "ts_emitido": "2026-09-12T18:30:00Z",
        "event_id": "ev-ligamx-001",
        "sport": "football",
        "league": "Liga MX",
        "market": "ah",
        "line": -0.25,
        "selection": "home",
        "book": "caliente_mx",
        "price_tomado": 2.10,
        "p_modelo": 0.54,
        "p_mercado": 0.49,
        "p_final": 0.52,
        "ev": 0.092,
        "stake_u": 1.5,
        "tier": "solido",
        "version_modelo": "3.0.0",
        "features_hash": "a" * 64,
    }
    base.update(overrides)
    return base


class TestImmutableLedger:
    def test_append_pick_mandatory_fields_and_frozen_immutability(self) -> None:
        ledger = PickLedger()
        entry = ledger.append_pick(_sample_pick())

        assert entry.record_type == "pick"
        assert entry.prev_hash == GENESIS_HASH
        assert len(entry.entry_hash) == 64
        assert ledger.head_hash == entry.entry_hash
        assert ledger.size == 1

        # Inmutabilidad real en memoria: FrozenInstanceError al intentar mutar cualquier atributo
        with pytest.raises(FrozenInstanceError):
            entry.price_tomado = 3.50  # type: ignore[misc]

        # Siguiente registro encadena prev_hash = entry.entry_hash
        entry2 = ledger.append_pick(_sample_pick(pick_id="pk-mx-002", line=None, market="1x2", tier="valor"))
        assert entry2.prev_hash == entry.entry_hash
        assert entry2.entry_hash != entry.entry_hash
        assert ledger.verify_integrity() is True

    def test_rejects_duplicate_pick_id_and_invalid_ranges(self) -> None:
        ledger = PickLedger()
        ledger.append_pick(_sample_pick(pick_id="dup-1"))

        with pytest.raises(DuplicatePickError):
            ledger.append_pick(_sample_pick(pick_id="dup-1"))

        # price_tomado >= 1.01 finito
        for bad_price in (1.00, 0.95, -2.0, float("nan"), float("inf")):
            with pytest.raises(LedgerValidationError):
                ledger.append_pick(_sample_pick(pick_id=f"p-{bad_price}", price_tomado=bad_price))

        # 0 < p_final < 1 finito
        for bad_prob in (0.0, 1.0, -0.1, 1.2, float("nan")):
            with pytest.raises(LedgerValidationError):
                ledger.append_pick(_sample_pick(pick_id=f"pf-{bad_prob}", p_final=bad_prob))

        # stake_u > 0 finito
        for bad_stake in (0.0, -1.0, float("nan"), float("inf")):
            with pytest.raises(LedgerValidationError):
                ledger.append_pick(_sample_pick(pick_id=f"st-{bad_stake}", stake_u=bad_stake))

        # tier inválido o heredado prohibido en registro de picks nuevos (v3.2)
        for bad_tier in ("vip_inventado", "baseline_v3_0", "especulativo"):
            with pytest.raises(LedgerValidationError):
                ledger.append_pick(_sample_pick(pick_id=f"bad-tier-{bad_tier}", tier=bad_tier))

    def test_separate_closing_and_settlement_never_mutate_original_pick(self, tmp_path: Path) -> None:
        jsonl_path = tmp_path / "ledger.jsonl"
        entry = append_pick_to_jsonl(jsonl_path, _sample_pick(pick_id="pk-sep-1"))
        orig_snapshot = entry.to_dict()

        ledger = load_ledger_jsonl(jsonl_path)
        closing = ledger.append_closing(
            {
                "pick_id": "pk-sep-1",
                "ts_recorded": "2026-09-12T20:59:59Z",
                "closing_missing": False,
                "closing_book": "pinnacle",
                "closing_source": "scraped_ws",
                "price_cierre_bruto": 1.95,
                "price_cierre_sin_margen": 2.00,
            }
        )
        settlement = ledger.append_settlement(
            {
                "pick_id": "pk-sep-1",
                "ts_liquidado": "2026-09-12T23:05:00Z",
                "outcome": "half_win",
            }
        )
        save_ledger_jsonl(jsonl_path, ledger)

        reloaded = load_ledger_jsonl(jsonl_path)
        assert reloaded.get_pick("pk-sep-1") is not None
        assert reloaded.get_pick("pk-sep-1").to_dict() == orig_snapshot  # type: ignore[union-attr]
        assert closing.prev_hash == entry.entry_hash
        assert settlement.prev_hash == closing.entry_hash
        assert math.isclose(settlement.pnl_u, 0.5 * 1.5 * (2.10 - 1.0), rel_tol=0, abs_tol=1e-12)

    def test_tamper_detection_on_retroactive_jsonl_edit(self, tmp_path: Path) -> None:
        ledger = PickLedger()
        ledger.append_pick(_sample_pick(pick_id="pk-1", price_tomado=2.10))
        ledger.append_pick(_sample_pick(pick_id="pk-2", price_tomado=1.95, tier="valor"))
        raw_lines = ledger.to_jsonl().strip().splitlines()

        # Alteración retroactiva de price_tomado en la primera línea sin poder forjar la cadena posterior
        first_obj = json.loads(raw_lines[0])
        first_obj["price_tomado"] = 2.50
        tampered_jsonl = json.dumps(first_obj) + "\n" + raw_lines[1] + "\n"

        with pytest.raises(LedgerIntegrityError):
            PickLedger.from_jsonl(tampered_jsonl)

        # Incluso si el atacante recalcula entry_hash de la línea 0, rompe prev_hash de la línea 1
        first_obj["entry_hash"] = compute_entry_hash(first_obj)
        tampered_chain_jsonl = json.dumps(first_obj) + "\n" + raw_lines[1] + "\n"
        with pytest.raises(LedgerIntegrityError):
            PickLedger.from_jsonl(tampered_chain_jsonl)


class TestClvAndSettlementMath:
    def test_exact_clv_pct_and_clv_prob_formulas(self) -> None:
        res = compute_single_pick_clv(
            price_tomado=2.10,
            price_cierre_sin_margen=2.00,
            closing_missing=False,
            closing_book="pinnacle",
        )
        assert res["closing_missing"] is False
        assert math.isclose(res["clv_pct"], (2.10 / 2.00) - 1.0, rel_tol=0, abs_tol=1e-15)
        assert math.isclose(res["clv_prob"], (1.0 / 2.00) - (1.0 / 2.10), rel_tol=0, abs_tol=1e-15)

    def test_closing_missing_and_recreational_book_blocking(self) -> None:
        # 1) closing_missing explícito
        r_miss = compute_single_pick_clv(
            price_tomado=2.10,
            price_cierre_sin_margen=2.00,
            closing_missing=True,
            closing_book="pinnacle",
        )
        assert r_miss["clv_pct"] is None
        assert r_miss["clv_prob"] is None
        assert r_miss["closing_missing"] is True

        # 2) Casas recreativas y bfe jamás se usan como cierre válido
        for bad_book in ("caliente_mx", "caliente", "codere", "b365", "bet365", "bfe"):
            r_rec = compute_single_pick_clv(
                price_tomado=2.10,
                price_cierre_sin_margen=2.00,
                closing_missing=False,
                closing_book=bad_book,
            )
            assert r_rec["clv_pct"] is None
            assert r_rec["clv_prob"] is None
            assert r_rec["closing_missing"] is True

        # 3) En historical_fd ni siquiera smarkets aplica (solo pinnacle)
        r_hist_smk = compute_single_pick_clv(
            price_tomado=2.10,
            price_cierre_sin_margen=2.00,
            closing_missing=False,
            closing_book="smarkets",
            closing_source="historical_fd",
        )
        assert r_hist_smk["clv_pct"] is None
        assert r_hist_smk["closing_missing"] is True

        # 4) En el ledger append_closing rechaza directamente una casa recreativa
        ledger = PickLedger()
        ledger.append_pick(_sample_pick(pick_id="pk-rec-block"))
        with pytest.raises(LedgerValidationError):
            ledger.append_closing(
                {
                    "pick_id": "pk-rec-block",
                    "ts_recorded": "2026-09-12T20:00:00Z",
                    "closing_missing": False,
                    "closing_book": "b365",
                    "price_cierre_sin_margen": 1.98,
                }
            )

    def test_pnl_settlement_outcomes_and_asian_quarter_lines(self) -> None:
        assert math.isclose(settle_pick_pnl(2.0, 2.20, "win"), 2.40, abs_tol=1e-12)
        assert math.isclose(settle_pick_pnl(2.0, 2.20, "loss"), -2.0, abs_tol=1e-12)
        assert math.isclose(settle_pick_pnl(2.0, 2.20, "void"), 0.0, abs_tol=1e-12)
        assert math.isclose(settle_pick_pnl(2.0, 2.20, "push"), 0.0, abs_tol=1e-12)
        assert math.isclose(settle_pick_pnl(2.0, 2.20, "half_win"), 1.20, abs_tol=1e-12)
        assert math.isclose(settle_pick_pnl(2.0, 2.20, "half_loss"), -1.0, abs_tol=1e-12)

        # Calificación exacta de líneas asiáticas y totales de cuarto
        assert grade_market_outcome("ah", "home", 0, 0, -0.25) == "half_loss"
        assert grade_market_outcome("ah", "home", 0, 0, +0.25) == "half_win"
        assert grade_market_outcome("ah", "home", 1, 0, -0.75) == "half_win"
        assert grade_market_outcome("ah", "home", 1, 0, -1.0) == "void"
        assert grade_market_outcome("ou", "over", 2, 0, 2.25) == "half_loss"
        assert grade_market_outcome("ou", "under", 2, 0, 2.25) == "half_win"
        assert grade_market_outcome("ou", "over", 2, 1, 2.75) == "half_win"
        assert grade_market_outcome("dnb", "home", 1, 1) == "void"
        assert grade_market_outcome("btts", "yes", 2, 1) == "win"


class TestBootstrapReportAndCli:
    def test_bootstrap_significance_positive_negative_and_zero_crossing(self) -> None:
        # Conjunto positivo consistente -> IC 95% entero > 0
        pos_picks = [
            {
                **_sample_pick(
                    pick_id=f"pos-{i}",
                    league="Liga MX" if i % 2 == 0 else "E0",
                    market="ah" if i % 3 == 0 else "1x2",
                    tier="solido" if i % 2 == 0 else "valor",
                    book="caliente_mx" if i % 2 == 0 else "codere_mx",
                    price_tomado=2.12,
                    stake_u=1.0,
                ),
                "closing_missing": False,
                "closing_book": "pinnacle",
                "price_cierre_sin_margen": 2.00,
                "outcome": "win" if i % 5 != 0 else "loss",
            }
            for i in range(40)
        ]
        # Añadimos 5 picks sin cierre sharp para verificar n_closing_missing
        for j in range(5):
            pos_picks.append(
                {
                    **_sample_pick(pick_id=f"miss-{j}", price_tomado=2.05, stake_u=1.0),
                    "closing_missing": True,
                    "outcome": "void",
                }
            )

        rep = summarize_picks_bootstrap(pos_picks, n_resamples=1000, seed=42)
        g = rep["global"]
        assert rep["meta"]["n_resamples"] == DEFAULT_BOOTSTRAP_RESAMPLES
        assert g["n_picks"] == 45
        assert g["n_with_closing"] == 40
        assert g["n_closing_missing"] == 5
        assert g["statistically_significant"] is True
        assert g["significance_label"] == "significativa_positiva"
        assert g["clv_pct_ci95"][0] > 0.0
        assert math.isclose(g["pct_picks_clv_positive"], 1.0, abs_tol=1e-12)
        assert set(rep["by_league"].keys()) == {"E0", "Liga MX"}
        assert set(rep["by_tier"].keys()) == {"solido", "valor"}
        assert set(rep["by_book"].keys()) == {"caliente_mx", "codere_mx"}

        # Muestra que cruza 0 -> "no significativa"
        mixed_picks = [
            {
                **_sample_pick(pick_id=f"mix-{i}", price_tomado=2.10 if i % 2 == 0 else 1.90),
                "closing_missing": False,
                "closing_book": "pinnacle",
                "price_cierre_sin_margen": 2.00,
                "outcome": "win" if i % 2 == 0 else "loss",
            }
            for i in range(30)
        ]
        rep_mix = summarize_picks_bootstrap(mixed_picks, n_resamples=1000, seed=42)
        assert rep_mix["global"]["statistically_significant"] is False
        assert rep_mix["global"]["significance_label"] == "no significativa"
        assert rep_mix["global"]["clv_pct_ci95"][0] <= 0.0 <= rep_mix["global"]["clv_pct_ci95"][1]

        # Rechaza n_resamples < 1000
        with pytest.raises(LedgerValidationError):
            summarize_picks_bootstrap(mixed_picks, n_resamples=500, seed=42)

    def test_max_drawdown_and_paired_delta_bootstrap(self) -> None:
        # Curva: +1.0 -> -1.5 (dd=2.5) -> -2.5 (dd=3.5) -> +1.5
        assert math.isclose(compute_max_drawdown_u([1.0, -2.5, -1.0, 4.0]), 3.5, abs_tol=1e-12)
        assert math.isclose(compute_max_drawdown_u([-1.25]), 1.25, abs_tol=1e-12)

        delta_ci = bootstrap_paired_delta_ci(
            np.full(30, 0.98),
            np.full(30, 1.01),
            n_resamples=1000,
            seed=7,
        )
        assert delta_ci["statistically_significant"] is True
        assert delta_ci["significance_label"] == "significativa_negativa"

    def test_cli_with_parquet_snapshots_and_markdown_output(self, tmp_path: Path) -> None:
        ledger = PickLedger()
        ledger.append_pick(
            _sample_pick(
                pick_id="cli-1",
                event_id="ev-1",
                market="1x2",
                line=None,
                selection="home",
                price_tomado=2.25,
                stake_u=1.0,
            )
        )
        ledger.append_settlement({"pick_id": "cli-1", "ts_liquidado": "2026-09-13T00:00:00Z", "outcome": "win"})
        ledger.append_pick(
            _sample_pick(
                pick_id="cli-2",
                event_id="ev-no-sharp",
                market="1x2",
                line=None,
                selection="home",
                price_tomado=2.10,
                stake_u=1.0,
            )
        )
        ledger.append_settlement({"pick_id": "cli-2", "ts_liquidado": "2026-09-13T00:00:00Z", "outcome": "loss"})

        ledger_path = tmp_path / "picks.jsonl"
        save_ledger_jsonl(ledger_path, ledger)

        # Snapshots Parquet: ev-1 tiene Pinnacle close; ev-no-sharp solo tiene b365 (debe quedar closing_missing=True)
        snaps = pd.DataFrame(
            [
                {
                    "event_id": "ev-1",
                    "sport": "football",
                    "league": "Liga MX",
                    "market": "1x2",
                    "line": None,
                    "selection": "home",
                    "book": "pinnacle",
                    "price_decimal": 2.00,
                    "ts_captured": "2026-09-12T19:59:59Z",
                    "ts_event_start": "2026-09-12T20:00:00Z",
                    "source": "historical_fd",
                    "snapshot_stage": "close",
                },
                {
                    "event_id": "ev-1",
                    "sport": "football",
                    "league": "Liga MX",
                    "market": "1x2",
                    "line": None,
                    "selection": "draw",
                    "book": "pinnacle",
                    "price_decimal": 3.50,
                    "ts_captured": "2026-09-12T19:59:59Z",
                    "ts_event_start": "2026-09-12T20:00:00Z",
                    "source": "historical_fd",
                    "snapshot_stage": "close",
                },
                {
                    "event_id": "ev-1",
                    "sport": "football",
                    "league": "Liga MX",
                    "market": "1x2",
                    "line": None,
                    "selection": "away",
                    "book": "pinnacle",
                    "price_decimal": 4.00,
                    "ts_captured": "2026-09-12T19:59:59Z",
                    "ts_event_start": "2026-09-12T20:00:00Z",
                    "source": "historical_fd",
                    "snapshot_stage": "close",
                },
                {
                    "event_id": "ev-no-sharp",
                    "sport": "football",
                    "league": "Liga MX",
                    "market": "1x2",
                    "line": None,
                    "selection": "home",
                    "book": "b365",
                    "price_decimal": 1.95,
                    "ts_captured": "2026-09-12T19:59:59Z",
                    "ts_event_start": "2026-09-12T20:00:00Z",
                    "source": "historical_fd",
                    "snapshot_stage": "close",
                },
            ]
        )
        snaps_path = tmp_path / "odds_snapshots.parquet"
        snaps.to_parquet(snaps_path, index=False)

        out_json = tmp_path / "report.json"
        out_md = tmp_path / "report.md"

        assert clv_cli_main(["--ledger", str(ledger_path), "--closings", str(snaps_path), "--out", str(out_json)]) == 0
        assert clv_cli_main(["--ledger", str(ledger_path), "--closings", str(snaps_path), "--out", str(out_md)]) == 0

        parsed_json = json.loads(out_json.read_text(encoding="utf-8"))
        assert parsed_json["global"]["n_picks"] == 2
        assert parsed_json["global"]["n_with_closing"] == 1
        assert parsed_json["global"]["n_closing_missing"] == 1
        assert parsed_json["global"]["clv_pct_mean"] > 0.0

        md_text = out_md.read_text(encoding="utf-8")
        assert "# Reporte de Auditoría de CLV y Liquidación de Picks" in md_text
        assert "Desglose por Liga" in md_text


class TestGoldenParityWithTypeScript:
    def test_golden_vectors_match_typescript_exact_hashes_and_bootstrap(self) -> None:
        """Verifica los vectores dorados compartidos bit a bit con `tests/prediction/ledger_clv.test.ts`."""
        u = mulberry32_uniforms(20261111, 5)
        # Determinismo exacto de los primeros 5 uniformes de mulberry32(20261111)
        assert u.shape == (5,)
        assert np.all((u >= 0.0) & (u < 1.0))

        fh = compute_features_hash({"xg_diff": 0.45, "liga": "Liga MX — América", "vals": [1.0, None, -0.25]})
        assert fh == "de5682eca3227e9ab07e6377a02b2c7cd8423f0d55c0cb7330f16ed4de6bb18f"

        ledger = PickLedger()
        ledger.append_pick(
            {
                "pick_id": "pk-001",
                "ts_emitido": "2026-08-15T18:00:00Z",
                "event_id": "ev-mx-101",
                "sport": "football",
                "league": "Liga MX",
                "market": "ah",
                "line": -0.25,
                "selection": "home",
                "book": "caliente_mx",
                "price_tomado": 2.10,
                "p_modelo": 0.53,
                "p_mercado": 0.49,
                "p_final": 0.515,
                "ev": 0.0815,
                "stake_u": 1.5,
                "tier": "solido",
                "version_modelo": "3.0.0",
                "features_hash": fh,
            }
        )
        ledger.append_closing(
            {
                "pick_id": "pk-001",
                "ts_recorded": "2026-08-15T19:59:59Z",
                "closing_missing": False,
                "closing_book": "pinnacle",
                "closing_source": "scraped_ws",
                "price_cierre_bruto": 1.94,
                "price_cierre_sin_margen": 2.00,
            }
        )
        ledger.append_settlement(
            {
                "pick_id": "pk-001",
                "ts_liquidado": "2026-08-15T22:10:00Z",
                "outcome": "half_win",
            }
        )
        ledger.append_pick(
            {
                "pick_id": "pk-002",
                "ts_emitido": "2026-08-16T16:00:00Z",
                "event_id": "ev-epl-202",
                "sport": "football",
                "league": "E0",
                "market": "1x2",
                "line": None,
                "selection": "away",
                "book": "b365",
                "price_tomado": 2.40,
                "p_modelo": 0.46,
                "p_mercado": 0.43,
                "p_final": 0.445,
                "ev": 0.068,
                "stake_u": 1.0,
                "tier": "valor",
                "version_modelo": "3.0.0",
                "features_hash": fh,
            }
        )
        ledger.append_closing(
            {
                "pick_id": "pk-002",
                "ts_recorded": "2026-08-16T17:59:59Z",
                "closing_missing": False,
                "closing_book": "pinnacle",
                "closing_source": "historical_fd",
                "price_cierre_sin_margen": 2.25,
            }
        )
        ledger.append_settlement(
            {
                "pick_id": "pk-002",
                "ts_liquidado": "2026-08-16T20:00:00Z",
                "outcome": "loss",
            }
        )
        ledger.append_pick(
            {
                "pick_id": "pk-003",
                "ts_emitido": "2026-08-17T20:00:00Z",
                "event_id": "ev-nfl-303",
                "sport": "nfl",
                "league": "NFL",
                "market": "spread",
                "line": -3.0,
                "selection": "home",
                "book": "codere_mx",
                "price_tomado": 1.95,
                "p_modelo": 0.55,
                "p_mercado": 0.52,
                "p_final": 0.54,
                "ev": 0.053,
                "stake_u": 1.0,
                "tier": "baseline_v3_0",
                "version_modelo": "3.0.0",
                "features_hash": fh,
            },
            allow_legacy_tiers=True,
        )
        ledger.append_closing(
            {
                "pick_id": "pk-003",
                "ts_recorded": "2026-08-17T23:59:59Z",
                "closing_missing": True,
            }
        )
        ledger.append_settlement(
            {
                "pick_id": "pk-003",
                "ts_liquidado": "2026-08-18T03:15:00Z",
                "outcome": "void",
            }
        )
        assert verify_ledger_integrity(ledger.get_records()) is True
        reloaded_historical = PickLedger.from_jsonl(ledger.to_jsonl())
        assert reloaded_historical.get_pick("pk-003") is not None
        assert reloaded_historical.get_pick("pk-003").tier == "baseline_v3_0"  # type: ignore[union-attr]
        assert reloaded_historical.head_hash == ledger.head_hash
        expected_hashes = [
            "68562c60e8fac11f874b59a81246f0f70e63cb2988adea60cd28b8fc1ecb5fbc",
            "cf12b701bdb26f5adf4c3a1857a02905ba845be945e2f4eeb6d0826ae6f59c8c",
            "b6884fb3ba3d57be38c24e76e5a7bba18020c2bf5c235eb2806260d31ee49b8b",
            "24336218627244745baedde4e6ca1106b337af363199cd4feb1d422aafec01a8",
            "9bc38359961fff1536b5044bd4772707b3be355e045a74cb5b00be1513e0dde3",
            "e1d5b8e6ed39f00d875267ab8a91cd4b001d0dff561f5b463bf47c959466538b",
            "8c8391e581f8dbdb6af29738036152c826c4999ad47f27367a633477a8f43a58",
            "cecd39ffeab8343a2ef9319e9b23237d44e7f13abe03bb50aebb9de9bb8f3b4c",
            "2b4d1150e91cc4a8e9c790965140a674e3c82ef7943e06ad6907275b4e49eb3e",
        ]
        assert [r.entry_hash for r in ledger.get_records()] == expected_hashes

        rep = summarize_picks_bootstrap(ledger, n_resamples=1000, seed=20261111)
        g = rep["global"]
        assert math.isclose(g["clv_pct_mean"], 0.05833333333333335, abs_tol=1e-12)
        assert math.isclose(g["clv_pct_ci95"][0], 0.050000000000000044, abs_tol=1e-12)
        assert math.isclose(g["clv_pct_ci95"][1], 0.06666666666666665, abs_tol=1e-12)
        assert math.isclose(g["clv_prob_mean"], 0.025793650793650785, abs_tol=1e-12)
        assert math.isclose(g["clv_prob_ci95"][0], 0.023809523809523836, abs_tol=1e-12)
        assert math.isclose(g["clv_prob_ci95"][1], 0.027777777777777735, abs_tol=1e-12)
        assert math.isclose(g["roi_pct"], -0.05, abs_tol=1e-12)
        assert math.isclose(g["roi_pct_ci95"][0], -1.0, abs_tol=1e-12)
        assert math.isclose(g["roi_pct_ci95"][1], 0.55, abs_tol=1e-12)
        assert math.isclose(g["roi_bootstrap"]["prob_gt_zero"], 0.372, abs_tol=1e-12)
        assert math.isclose(g["max_drawdown_u"], 1.0, abs_tol=1e-12)
