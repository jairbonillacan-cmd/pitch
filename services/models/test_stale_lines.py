"""Tests unitarios, de causalidad, paridad matemática y auditoría de artefactos para `stale_lines.py` (Agente A8)."""

from __future__ import annotations

import json
import math
from pathlib import Path
import sys

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
MODELS_DIR = REPO_ROOT / "services" / "models"
PRED_LAB_ROOT = REPO_ROOT / "research" / "prediction-lab"

for _p in (str(REPO_ROOT), str(MODELS_DIR), str(PRED_LAB_ROOT)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import backtest as bt
import stale_lines as sl


def _make_config(**overrides: object) -> dict[str, object]:
    cfg: dict[str, object] = {
        "schema_version": "stale_lines_v1.0.0",
        "config_version": "stale_lines_pytest_v1",
        "holdout_sealed_untouched": True,
        "signal_mode": "double_confirmation",
        "stale_prob_margin": 0.015,
        "stale_ev_threshold": 0.035,
        "stale_ev_threshold_valor": 0.065,
        "min_model_prob_edge": 0.002,
        "model_agreement_tolerance": 0.05,
        "default_model_blend_weight": 0.30,
        "default_devig_method": "power",
        "max_sharp_quote_age_minutes": 180.0,
        "max_sigma_p": 0.06,
        "max_adverse_ticks_1h": 3.0,
        "sharp_steam_window_minutes": 60.0,
        "sharp_implied_prob_tick": 0.005,
        "uncertainty_penalty_k": 0.50,
        "kelly_fraction": 0.25,
        "bankroll_unit_pct": 0.01,
        "min_stake_u": 0.05,
        "rho_same_event": 0.35,
        "fallback_sigma_p": 0.02,
        "allow_unlisted_segments": True,
        "caps": {
            "max_stake_per_pick_u": 2.0,
            "max_stake_per_event_u": 2.0,
            "max_stake_per_league_date_u": 3.0,
            "max_stake_per_global_date_u": 5.0,
        },
        "segments": {
            "E0::1x2": {
                "league": "E0",
                "market": "1x2",
                "enabled": True,
                "best_devig_method": "power",
                "w_model": 0.25,
                "segment_clv_mean": 0.052,
                "segment_clv_ci95_low": 0.018,
                "segment_clv_ci95_high": 0.086,
            }
        },
    }
    cfg.update(overrides)
    return cfg


def _make_candidate(**overrides: object) -> dict[str, object]:
    cand: dict[str, object] = {
        "candidate_id": "cand-py-1",
        "event_id": "football:e0_ars_che_2024",
        "sport": "football",
        "league": "E0",
        "market": "1x2",
        "line": None,
        "selection": "home",
        "recreational_book": "bet365",
        "price_recreational": 2.15,
        "ts_decision": "2024-11-10T15:30:00Z",
        "ts_event_start": "2024-11-10T16:30:00Z",
        "ts_recreational_captured": "2024-11-10T15:25:00Z",
        "sharp_book": "pinnacle",
        "ts_sharp_captured": "2024-11-10T15:28:00Z",
        "sharp_market_odds": [1.95, 3.60, 4.10],
        "devig_method": "power",
        "p_modelo": 0.51,
        "model_market_probs": [0.51, 0.27, 0.22],
        "submodel_probs": [0.50, 0.51, 0.52],
    }
    cand.update(overrides)
    return cand


def test_canonical_books_and_strict_recreational_guard() -> None:
    assert sl.canonical_stale_book("Caliente_MX") == "caliente"
    assert sl.canonical_stale_book("codere.mx") == "codere"
    assert sl.canonical_stale_book("bet365 nj") == "b365"
    assert sl.canonical_stale_book("dk nj") == "draftkings"
    assert sl.is_sharp_reference_book("pinnacle") is True
    assert sl.is_sharp_reference_book("smarkets") is True
    assert sl.is_recreational_book("caliente") is True
    assert sl.is_recreational_book("pinnacle") is False
    assert sl.is_recreational_book("bfe") is False

    cfg = _make_config()
    dec_pin = sl.evaluate_stale_line_candidate(_make_candidate(recreational_book="pinnacle"), cfg)
    assert dec_pin.approved is False
    assert dec_pin.rejection_reason == "non_recreational_book"


def test_causality_and_sealed_holdout_guards() -> None:
    cfg = _make_config()

    with pytest.raises(sl.StaleLineCausalityError):
        sl.evaluate_stale_line_candidate(_make_candidate(ts_sharp_captured="2024-11-10T15:30:00.000001Z"), cfg)

    with pytest.raises(sl.StaleLineCausalityError):
        sl.evaluate_stale_line_candidate(_make_candidate(ts_recreational_captured="2024-11-10T15:30:01Z"), cfg)

    with pytest.raises(sl.StaleLineCausalityError):
        sl.evaluate_stale_line_candidate(
            _make_candidate(ts_decision="2024-11-10T16:30:01Z", ts_event_start="2024-11-10T16:30:00Z"),
            cfg,
        )

    with pytest.raises(bt.HoldoutSealedError):
        sl.calibrate_and_run_stale_lines_pipeline(unlock_holdout=True)

    with pytest.raises(ValueError, match="holdout_registry_a8.jsonl"):
        sl.calibrate_and_run_stale_lines_pipeline(registry_path=bt.DEFAULT_REGISTRY_PATH)


def test_double_confirmation_vs_simple_sharp_and_portfolio_caps() -> None:
    cfg = _make_config()

    ok = sl.evaluate_stale_line_candidate(_make_candidate(), cfg)
    assert ok.approved is True
    assert ok.cond1_stale_line is True
    assert ok.cond2_model_confirms is True
    assert ok.tier in ("solido", "valor")

    # Candidato rezagado frente a Pinnacle, pero rechazado por el modelo (< breakeven)
    cand_disagree = _make_candidate(p_modelo=0.45, model_market_probs=[0.45, 0.30, 0.25])
    dbl = sl.evaluate_stale_line_candidate(cand_disagree, cfg, override_signal_mode="double_confirmation")
    smp = sl.evaluate_stale_line_candidate(cand_disagree, cfg, override_signal_mode="simple_sharp")
    assert dbl.approved is False
    assert dbl.rejection_reason == "model_below_recreational_breakeven"
    assert smp.approved is True
    assert smp.cond1_stale_line is True
    assert smp.cond2_model_confirms is False

    # Verificar topes duros de portafolio (2u pick / 2u evento / 3u liga-fecha / 5u fecha global)
    cands = [
        _make_candidate(
            candidate_id=f"c-{i}",
            event_id=f"ev-{i}",
            price_recreational=2.35,
            p_sharp_novig=0.56,
            sharp_market_novig_probs=[0.56, 0.24, 0.20],
            p_modelo=0.58,
            model_market_probs=[0.58, 0.23, 0.19],
        )
        for i in range(4)
    ]
    batch = sl.evaluate_stale_line_batch(cands, cfg)
    approved = [d for d in batch if d.approved]
    assert sum(d.stake_u for d in approved) <= 3.0 + 1e-12
    assert all(d.stake_u <= 2.0 + 1e-12 for d in approved)
    assert any(d.rejection_reason == "cap_league_date_exhausted" for d in batch)


def test_cadence_derivation_and_snapshot_lag_measurement() -> None:
    snaps = [
        {
            "event_id": "ws:nfl:1",
            "market": "moneyline",
            "line": None,
            "selection": "home",
            "book": "pinnacle",
            "price_decimal": 4.35,
            "ts_captured": "2026-11-09T18:46:13Z",
            "ts_event_start": "2026-11-15T21:05:00Z",
        },
        {
            "event_id": "ws:nfl:1",
            "market": "moneyline",
            "line": None,
            "selection": "home",
            "book": "pinnacle",
            "price_decimal": 4.42,
            "ts_captured": "2026-11-09T20:05:00Z",
            "ts_event_start": "2026-11-15T21:05:00Z",
        },
        {
            "event_id": "ws:nfl:1",
            "market": "moneyline",
            "line": None,
            "selection": "home",
            "book": "bet365 nj",
            "price_decimal": 4.65,
            "ts_captured": "2026-11-10T16:00:06Z",
            "ts_event_start": "2026-11-15T21:05:00Z",
        },
    ]
    m = sl.measure_snapshot_capture_cadence(snaps)
    assert abs(m["by_book"]["pinnacle"]["intra_series_intervals_minutes"]["median"] - (4727.0 / 60.0)) < 1e-12
    assert abs(m["paired_recreational_vs_sharp"]["causal_lag_minutes"]["median"] - 1195.1) < 1e-12

    cad = sl.derive_recommended_scraping_cadence(
        {
            "sharp_live_gap_median_minutes": 4727.0 / 60.0,
            "sharp_live_move_fraction": 68.0 / 326.0,
            "sharp_reference_horizon_minutes": 8515.0,
            "horizon_acceleration_exponent": 0.25,
            "recreational_convergence_beta": 0.56,
            "execution_delay_minutes": 2.0,
            "max_polling_decay_fraction": 0.05,
            "regimes": [
                {"regime_id": "t60", "description": "T-60m", "horizon_minutes": 60.0},
                {"regime_id": "t510", "description": "Matchday", "horizon_minutes": 510.0},
            ],
        }
    )
    r0, r1 = cad["regimes"]
    assert r0["recommended_interval_minutes"] < r1["recommended_interval_minutes"]
    assert r0["expected_edge_survival_at_recommended"] > r0["expected_edge_survival_at_current_sharp_gap"]
    assert abs(sl.compute_expected_edge_survival(0.0, 0.05, 2.0) - math.exp(-0.10)) < 1e-12


def test_generated_a8_artifacts_and_isolated_holdout_registry() -> None:
    rep_path = sl.DEFAULT_REPORT_OUT_PATH
    cfg_path = sl.DEFAULT_CONFIG_OUT_PATH
    reg_path = sl.DEFAULT_A8_REGISTRY_PATH

    assert rep_path.exists(), f"Falta {rep_path}"
    assert cfg_path.exists(), f"Falta {cfg_path}"
    assert reg_path.exists(), f"Falta {reg_path}"

    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    sl.validate_stale_lines_config(cfg)
    assert cfg["holdout_sealed_untouched"] is True

    rep = json.loads(rep_path.read_text(encoding="utf-8"))
    assert rep["unlock_holdout"] is False
    assert rep["holdout_sealed_untouched"] is True
    assert rep["bootstrap_config"]["n_resamples"] >= 1000

    # Verificar mediana empírica real de 78.78 min en Pinnacle scraped_ws (sin valores mágicos inventados)
    pin_cad = rep["scraped_ws_empirical"]["cadence_by_canonical_book"]["pinnacle"]
    assert abs(pin_cad["intra_series_intervals_minutes"]["median"] - (4727.0 / 60.0)) < 1e-9

    # Verificar comparación Doble Confirmación vs Señal Simple solo-sharp
    cmp_block = rep["signal_comparison_walk_forward_dev"]
    dbl = cmp_block["double_confirmation_sharp_plus_model"]
    smp = cmp_block["simple_sharp_only"]
    assert dbl["n_picks"] > 0
    assert smp["n_picks"] > dbl["n_picks"]
    assert dbl["clv_pct_mean"] > smp["clv_pct_mean"]

    # Verificar que si algún IC95% cruza 0, se etiqueta explícitamente como "no significativa"
    for block in (dbl, smp):
        roi_ci = block["roi_pct_ci95"]
        if roi_ci is not None and roi_ci[0] <= 0.0 <= roi_ci[1]:
            assert block["roi_significance"] == "no significativa"

    # Verificar que TODAS las entradas en holdout_registry_a8.jsonl tienen unlock_holdout=False
    reg_lines = [json.loads(line) for line in reg_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    assert len(reg_lines) >= 6
    assert all(entry["unlock_holdout"] is False for entry in reg_lines)
    assert all(entry["eval_split"] == "walk_forward_dev" for entry in reg_lines)
