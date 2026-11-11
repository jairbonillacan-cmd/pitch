#!/usr/bin/env python3
"""Suite de pruebas unitarias, Red-Team y paridad cruzada TS ↔ Python (`|Δ| < 1e-12`) para `picks_engine.py` (`A5`)."""

from __future__ import annotations

from datetime import timedelta
import json
import math
from pathlib import Path
import sys
from typing import Any

import numpy as np
import pandas as pd
import pytest

MODELS_DIR = Path(__file__).resolve().parent
REPO_ROOT = MODELS_DIR.parents[1]
for _p in (str(REPO_ROOT), str(MODELS_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from backtest import BacktestConfig, run_backtest
from clv_report import PickLedger, compute_features_hash
import picks_engine as pe
from picks_engine import (
    HARD_MAX_STAKE_PER_EVENT_U,
    HARD_MAX_STAKE_PER_GLOBAL_DATE_U,
    HARD_MAX_STAKE_PER_LEAGUE_DATE_U,
    HARD_MAX_STAKE_PER_PICK_U,
    ODDS_BUCKETS,
    PICK_TIERS,
    PickCausalityError,
    PickPolicyValidationError,
    StatefulBacktestPolicySelector,
    classify_odds_bucket,
    compute_adverse_sharp_ticks_1h,
    compute_shrunk_quarter_kelly,
    compute_submodel_dispersion,
    evaluate_pick_candidates,
    select_approved_picks,
    to_ledger_pick_input,
    validate_pick_policy,
)


def _make_test_policy(**overrides: Any) -> dict[str, Any]:
    policy: dict[str, Any] = {
        "schema_version": "pick_policy_v3_1",
        "policy_version": "geodesic_v3.1_test",
        "kelly_fraction": 0.25,
        "bankroll_unit_pct": 0.01,
        "sharp_steam_window_minutes": 60.0,
        "sharp_implied_prob_tick": 0.005,
        "max_sigma_p": 0.045,
        "max_adverse_ticks_1h": 3.5,
        "uncertainty_penalty_k": 0.5,
        "rho_same_event": 0.35,
        "min_stake_u": 0.05,
        "allow_pure_market_arb": True,
        "unknown_segment_model_picks_enabled": False,
        "caps": {
            "max_stake_per_pick_u": 2.0,
            "max_stake_per_event_u": 2.0,
            "max_stake_per_league_date_u": 3.0,
            "max_stake_per_global_date_u": 5.0,
        },
        "default_buckets": {
            "short": {"p_edge_min": 0.012, "ev_threshold_solido": 0.022, "ev_threshold_valor": 0.045},
            "even": {"p_edge_min": 0.014, "ev_threshold_solido": 0.028, "ev_threshold_valor": 0.055},
            "plus": {"p_edge_min": 0.015, "ev_threshold_solido": 0.035, "ev_threshold_valor": 0.068},
            "long": {"p_edge_min": 0.016, "ev_threshold_solido": 0.048, "ev_threshold_valor": 0.085},
        },
        "segments": {
            "MEX::1x2": {
                "league": "MEX",
                "market": "1x2",
                "model_picks_enabled": True,
                "w_effective": 0.20,
                "best_devig_method": "shin",
                "segment_clv_mean": 0.019,
                "segment_clv_ci95_low": 0.006,
                "segment_clv_ci95_high": 0.032,
                "buckets": {
                    "short": {"p_edge_min": 0.012, "ev_threshold_solido": 0.022, "ev_threshold_valor": 0.045},
                    "even": {"p_edge_min": 0.014, "ev_threshold_solido": 0.028, "ev_threshold_valor": 0.055},
                    "plus": {"p_edge_min": 0.015, "ev_threshold_solido": 0.035, "ev_threshold_valor": 0.068},
                    "long": {"p_edge_min": 0.016, "ev_threshold_solido": 0.048, "ev_threshold_valor": 0.085},
                },
            },
            "MEX::totals": {
                "league": "MEX",
                "market": "totals",
                "model_picks_enabled": True,
                "w_effective": 0.25,
                "best_devig_method": "power",
                "segment_clv_mean": 0.021,
                "segment_clv_ci95_low": 0.005,
                "segment_clv_ci95_high": 0.037,
            },
            "E0::1x2": {
                "league": "E0",
                "market": "1x2",
                "model_picks_enabled": True,
                "w_effective": 0.15,
                "best_devig_method": "power",
                "segment_clv_mean": 0.008,
                "segment_clv_ci95_low": -0.003,
                "segment_clv_ci95_high": 0.019,
            },
            "NFL::moneyline": {
                "league": "NFL",
                "market": "moneyline",
                "model_picks_enabled": False,
                "disabled_reason": "closing_benchmark_unavailable_or_w_zero",
                "w_effective": 0.0,
                "segment_clv_mean": None,
                "segment_clv_ci95_low": None,
            },
        },
    }
    policy.update(overrides)
    return policy


def _make_base_candidate(**overrides: Any) -> dict[str, Any]:
    cand: dict[str, Any] = {
        "candidate_id": "cand-base",
        "event_id": "ev-mex-001",
        "sport": "football",
        "league": "MEX",
        "market": "1x2",
        "line": None,
        "selection": "home",
        "book": "caliente_mx",
        "price_decimal": 2.00,
        "ts_decision": "2026-08-15T18:00:00Z",
        "ts_event_start": "2026-08-15T20:00:00Z",
        "ts_captured": "2026-08-15T17:58:00Z",
        "p_modelo": 0.54,
        "p_mercado": 0.515,
        "p_final": 0.52,
        "submodel_probs": [0.51, 0.525, 0.525],
        "sharp_quotes_1h": [
            {"book": "pinnacle", "price_decimal": 1.96, "ts_captured": "2026-08-15T17:10:00Z", "selection": "home"},
            {"book": "pinnacle", "price_decimal": 1.94, "ts_captured": "2026-08-15T17:55:00Z", "selection": "home"},
        ],
    }
    cand.update(overrides)
    return cand


def test_tiers_and_odds_buckets_contract() -> None:
    assert PICK_TIERS == ("solido", "valor")
    assert ODDS_BUCKETS == ("short", "even", "plus", "long")

    assert classify_odds_bucket(1.01) == "short"
    assert classify_odds_bucket(1.6499) == "short"
    assert classify_odds_bucket(1.65) == "even"
    assert classify_odds_bucket(2.1999) == "even"
    assert classify_odds_bucket(2.20) == "plus"
    assert classify_odds_bucket(2.8999) == "plus"
    assert classify_odds_bucket(2.90) == "long"
    assert classify_odds_bucket(1000.0) == "long"

    with pytest.raises(ValueError):
        classify_odds_bucket(1.005)
    with pytest.raises(ValueError):
        classify_odds_bucket(1000.5)


def test_segment_gate_and_pure_market_arb() -> None:
    policy = _make_test_policy()
    disabled_cand = _make_base_candidate(
        candidate_id="nfl-blocked",
        event_id="ev-nfl-10",
        sport="nfl",
        league="NFL",
        market="moneyline",
        price_decimal=2.10,
        p_modelo=0.53,
        p_mercado=0.52,
        p_final=0.525,
    )
    arb_cand = _make_base_candidate(
        candidate_id="nfl-pure-arb",
        event_id="ev-nfl-11",
        sport="nfl",
        league="NFL",
        market="moneyline",
        price_decimal=2.15,
        p_modelo=0.50,
        p_mercado=0.505,
        p_final=0.505,
        allow_pure_market_arb=True,
    )

    res_blocked, res_arb = evaluate_pick_candidates([disabled_cand, arb_cand], policy)
    assert res_blocked.approved is False
    assert res_blocked.rejection_reason == "segment_model_picks_disabled"
    assert res_arb.approved is True
    assert res_arb.tier == "valor"
    assert res_arb.stake_u > 0.0


def test_strict_breakeven_and_no_win_rate_bias() -> None:
    policy = _make_test_policy()
    high_winrate_neg_ev = _make_base_candidate(
        candidate_id="high-prob-bad-price",
        price_decimal=1.20,
        p_modelo=0.82,
        p_mercado=0.81,
        p_final=0.80,  # 80% prob pero <= 1 / 1.20 (0.8333...)
    )
    exact_breakeven = _make_base_candidate(
        candidate_id="exact-breakeven",
        price_decimal=2.00,
        p_final=0.50,
    )
    tiny_edge = _make_base_candidate(
        candidate_id="tiny-edge",
        price_decimal=2.00,
        p_final=0.51,
    )

    r0, r1, r2 = evaluate_pick_candidates([high_winrate_neg_ev, exact_breakeven, tiny_edge], policy)
    assert r0.rejection_reason == "below_breakeven"
    assert r1.rejection_reason == "below_breakeven"
    assert r2.rejection_reason == "below_calibrated_ev_threshold"


def test_tier_hierarchy_and_elimination_of_longshot_tier() -> None:
    policy = _make_test_policy()
    mex_solido = _make_base_candidate(
        candidate_id="mex-solido",
        event_id="ev-mex-sol",
        league="MEX",
        price_decimal=2.00,
        p_final=0.52,
    )
    epl_unproven_clv = _make_base_candidate(
        candidate_id="epl-no-solido",
        event_id="ev-epl-1",
        league="E0",
        price_decimal=2.00,
        p_final=0.52,
    )
    epl_long_valor = _make_base_candidate(
        candidate_id="epl-long-valor",
        event_id="ev-epl-2",
        league="E0",
        price_decimal=3.50,
        p_modelo=0.33,
        p_mercado=0.31,
        p_final=0.32,
        submodel_probs=[0.315, 0.32, 0.325],
        sharp_quotes_1h=[
            {"book": "pinnacle", "price_decimal": 3.40, "ts_captured": "2026-08-15T17:15:00Z", "selection": "home"},
            {"book": "pinnacle", "price_decimal": 3.35, "ts_captured": "2026-08-15T17:55:00Z", "selection": "home"},
        ],
    )

    r_mex, r_epl_rej, r_epl_long = evaluate_pick_candidates([mex_solido, epl_unproven_clv, epl_long_valor], policy)
    assert r_mex.approved is True
    assert r_mex.tier == "solido"

    assert r_epl_rej.approved is False
    assert r_epl_rej.rejection_reason == "solido_clv_ci95_not_positive"

    assert r_epl_long.approved is True
    assert r_epl_long.odds_bucket == "long"
    assert r_epl_long.tier == "valor"
    assert math.isclose(r_epl_long.stake_u, r_epl_long.stake_raw_u, abs_tol=1e-12)


def test_dispersion_sharp_steam_uncertainty_and_causality_guards() -> None:
    policy = _make_test_policy()

    high_disp = _make_base_candidate(
        candidate_id="disp-fail",
        event_id="ev-d1",
        price_decimal=2.05,
        p_final=0.53,
        submodel_probs={"p_logit": 0.44, "p_gbm": 0.52, "p_dixon_coles": 0.60},
    )
    assert math.isclose(compute_submodel_dispersion(high_disp) or 0.0, math.sqrt((0.0064 + 0.0064) / 3.0), abs_tol=1e-14)

    adverse_steam = _make_base_candidate(
        candidate_id="steam-fail",
        event_id="ev-s1",
        price_decimal=2.05,
        p_final=0.53,
        submodel_probs=[0.525, 0.53, 0.535],
        sharp_quotes_1h=[
            {"book": "pinnacle", "price_decimal": 1.95, "ts_captured": "2026-08-15T17:05:00Z", "selection": "home"},
            {"book": "pinnacle", "price_decimal": 2.06, "ts_captured": "2026-08-15T17:58:00Z", "selection": "home"},
        ],
    )

    erased_edge = _make_base_candidate(
        candidate_id="uncertainty-erased",
        event_id="ev-u1",
        price_decimal=2.00,
        p_final=0.515,
        sigma_p=0.035,
        submodel_probs=None,
    )

    r_disp, r_steam, r_erased = evaluate_pick_candidates([high_disp, adverse_steam, erased_edge], policy)
    assert r_disp.rejection_reason == "high_submodel_dispersion"
    assert r_steam.rejection_reason == "adverse_sharp_steam"
    assert math.isclose(r_steam.adverse_ticks_1h, (1.0 / 1.95 - 1.0 / 2.06) / 0.005, abs_tol=1e-12)
    assert r_erased.rejection_reason == "uncertainty_erased_edge"

    with pytest.raises(PickCausalityError):
        compute_adverse_sharp_ticks_1h(
            [{"book": "pinnacle", "price_decimal": 2.00, "ts_captured": "2026-08-15T18:00:01Z"}],
            "2026-08-15T18:00:00Z",
        )

    with pytest.raises(PickCausalityError):
        evaluate_pick_candidates(
            [_make_base_candidate(ts_decision="2026-08-15T20:01:00Z", ts_event_start="2026-08-15T20:00:00Z")],
            policy,
        )

    with pytest.raises(PickPolicyValidationError):
        evaluate_pick_candidates([_make_base_candidate()], _make_test_policy(kelly_fraction=0.50))


def test_intra_event_correlation_and_four_hard_portfolio_caps() -> None:
    base_segs = dict(_make_test_policy()["segments"])
    base_segs["MEX::btts"] = {
        "league": "MEX",
        "market": "btts",
        "model_picks_enabled": True,
        "segment_clv_mean": 0.02,
        "segment_clv_ci95_low": 0.004,
    }
    base_segs["BRA::1x2"] = {
        "league": "BRA",
        "market": "1x2",
        "model_picks_enabled": True,
        "segment_clv_mean": 0.025,
        "segment_clv_ci95_low": 0.01,
    }
    policy = _make_test_policy(
        caps={
            "max_stake_per_pick_u": 9.0,
            "max_stake_per_event_u": 9.0,
            "max_stake_per_league_date_u": 9.0,
            "max_stake_per_global_date_u": 9.0,
        },
        segments=base_segs,
    )

    candidates = [
        _make_base_candidate(
            candidate_id="ev100-1x2-weaker",
            event_id="ev-mex-100",
            league="MEX",
            market="1x2",
            selection="away",
            price_decimal=2.00,
            p_final=0.528,
            submodel_probs=[0.526, 0.528, 0.530],
        ),
        _make_base_candidate(
            candidate_id="ev100-1x2-strong",
            event_id="ev-mex-100",
            league="MEX",
            market="1x2",
            selection="home",
            price_decimal=2.00,
            p_final=0.532,
            submodel_probs=[0.530, 0.532, 0.534],
        ),
        _make_base_candidate(
            candidate_id="ev100-totals",
            event_id="ev-mex-100",
            league="MEX",
            market="totals",
            line=2.5,
            selection="over",
            price_decimal=2.00,
            p_final=0.530,
            submodel_probs=[0.528, 0.530, 0.532],
            sharp_quotes_1h=[],
        ),
        _make_base_candidate(
            candidate_id="ev100-btts-exhausted",
            event_id="ev-mex-100",
            league="MEX",
            market="btts",
            line=None,
            selection="yes",
            price_decimal=2.00,
            p_final=0.526,
            submodel_probs=[0.524, 0.526, 0.528],
            sharp_quotes_1h=[],
        ),
        _make_base_candidate(
            candidate_id="ev101-mex-daycap",
            event_id="ev-mex-101",
            league="MEX",
            market="1x2",
            selection="home",
            price_decimal=2.00,
            p_final=0.525,
            submodel_probs=[0.523, 0.525, 0.527],
        ),
        _make_base_candidate(
            candidate_id="ev102-mex-exhausted",
            event_id="ev-mex-102",
            league="MEX",
            market="1x2",
            selection="home",
            price_decimal=2.00,
            p_final=0.522,
            submodel_probs=[0.520, 0.522, 0.524],
        ),
        _make_base_candidate(
            candidate_id="ev201-bra-cap2u",
            event_id="ev-bra-201",
            league="BRA",
            market="1x2",
            selection="home",
            price_decimal=2.00,
            p_final=0.550,
            submodel_probs=[0.548, 0.550, 0.552],
        ),
        _make_base_candidate(
            candidate_id="ev202-bra-global-exhausted",
            event_id="ev-bra-202",
            league="BRA",
            market="1x2",
            selection="home",
            price_decimal=2.00,
            p_final=0.521,
            submodel_probs=[0.519, 0.521, 0.523],
        ),
    ]

    decisions = evaluate_pick_candidates(candidates, policy)
    by_id = {d.candidate_id: d for d in decisions}

    assert by_id["ev100-1x2-weaker"].rejection_reason == "correlated_same_event_market"
    assert by_id["ev100-1x2-strong"].approved is True
    assert by_id["ev100-totals"].approved is True
    assert math.isclose(by_id["ev100-totals"].correlation_multiplier, 0.65, abs_tol=1e-12)
    assert by_id["ev100-btts-exhausted"].rejection_reason == "cap_event_exhausted"

    ev100_sum = by_id["ev100-1x2-strong"].stake_u + by_id["ev100-totals"].stake_u
    assert ev100_sum <= HARD_MAX_STAKE_PER_EVENT_U
    assert math.isclose(ev100_sum, 2.0, abs_tol=1e-12)

    mex_day_sum = ev100_sum + by_id["ev101-mex-daycap"].stake_u
    assert mex_day_sum <= HARD_MAX_STAKE_PER_LEAGUE_DATE_U
    assert math.isclose(mex_day_sum, 3.0, abs_tol=1e-12)
    assert by_id["ev102-mex-exhausted"].rejection_reason == "cap_league_date_exhausted"

    assert by_id["ev201-bra-cap2u"].stake_u <= HARD_MAX_STAKE_PER_PICK_U
    assert math.isclose(by_id["ev201-bra-cap2u"].stake_u, 2.0, abs_tol=1e-12)

    global_day_sum = sum(d.stake_u for d in decisions)
    assert global_day_sum <= HARD_MAX_STAKE_PER_GLOBAL_DATE_U
    assert math.isclose(global_day_sum, 5.0, abs_tol=1e-12)
    assert by_id["ev202-bra-global-exhausted"].rejection_reason == "cap_global_date_exhausted"

    # Puente directo a `PickLedger` (`clv_report.py`)
    approved = select_approved_picks(candidates, policy)
    ledger = PickLedger()
    fh = compute_features_hash({"test": 1})
    entry = ledger.append_pick(
        to_ledger_pick_input(
            approved[0],
            pick_id="pk-a5-bridge-1",
            ts_emitido="2026-08-15T18:00:00Z",
            version_modelo="geodesic_v3.1",
            features_hash=fh,
        )
    )
    assert entry.tier == "valor"
    assert entry.stake_u == approved[0].stake_u


def test_golden_cross_language_parity_lt_1e12() -> None:
    policy = _make_test_policy()
    portfolio = {
        "open_picks": [
            {
                "event_id": "ev-prior-1",
                "league": "MEX",
                "market": "1x2",
                "utc_date": "2026-08-20",
                "stake_u": 1.25,
            }
        ]
    }
    golden_candidates = [
        {
            "candidate_id": "g1",
            "event_id": "ev-g-1",
            "sport": "football",
            "league": "MEX",
            "market": "1x2",
            "line": None,
            "selection": "home",
            "book": "caliente_mx",
            "price_decimal": 2.05,
            "ts_decision": "2026-08-20T18:00:00Z",
            "ts_event_start": "2026-08-20T20:00:00Z",
            "p_modelo": 0.545,
            "p_mercado": 0.515,
            "p_final": 0.525,
            "submodel_probs": [0.515, 0.525, 0.535],
            "sharp_quotes_1h": [
                {"book": "pinnacle", "price_decimal": 1.98, "ts_captured": "2026-08-20T17:10:00Z", "selection": "home"},
                {"book": "pinnacle", "price_decimal": 2.00, "ts_captured": "2026-08-20T17:55:00Z", "selection": "home"},
            ],
        },
        {
            "candidate_id": "g2",
            "event_id": "ev-g-1",
            "sport": "football",
            "league": "MEX",
            "market": "totals",
            "line": 2.5,
            "selection": "over",
            "book": "b365",
            "price_decimal": 1.95,
            "ts_decision": "2026-08-20T18:00:00Z",
            "ts_event_start": "2026-08-20T20:00:00Z",
            "p_modelo": 0.56,
            "p_mercado": 0.53,
            "p_final": 0.54,
            "submodel_probs": [0.535, 0.54, 0.545],
            "sharp_quotes_1h": [],
        },
        {
            "candidate_id": "g3",
            "event_id": "ev-g-2",
            "sport": "football",
            "league": "E0",
            "market": "1x2",
            "line": None,
            "selection": "away",
            "book": "b365",
            "price_decimal": 3.40,
            "ts_decision": "2026-08-20T18:00:00Z",
            "ts_event_start": "2026-08-20T20:00:00Z",
            "p_modelo": 0.34,
            "p_mercado": 0.315,
            "p_final": 0.325,
            "submodel_probs": [0.318, 0.325, 0.332],
            "sharp_quotes_1h": [
                {"book": "smarkets", "price_decimal": 3.25, "ts_captured": "2026-08-20T17:20:00Z", "selection": "away"},
                {"book": "smarkets", "price_decimal": 3.30, "ts_captured": "2026-08-20T17:50:00Z", "selection": "away"},
            ],
        },
    ]

    res = evaluate_pick_candidates(golden_candidates, policy, portfolio)
    k0 = compute_shrunk_quarter_kelly(0.525, 2.05, compute_submodel_dispersion(golden_candidates[0]) or 0.0, 0.5)

    assert math.isclose(res[0].sigma_p, 0.008164965809277268, abs_tol=1e-12)
    assert math.isclose(res[0].adverse_ticks_1h, 1.0101010101010166, abs_tol=1e-12)
    assert math.isclose(res[0].p_shrunk, 0.5209175170953614, abs_tol=1e-12)
    assert math.isclose(res[0].f_quarter, k0["f_quarter"], abs_tol=1e-12)
    assert math.isclose(res[0].stake_raw_u, 1.616212143940257, abs_tol=1e-12)
    assert math.isclose(res[0].expected_log_growth_g, 0.00095967427269585, abs_tol=1e-12)
    assert res[0].tier == "valor"
    assert res[0].allocation_rank == 1
    assert math.isclose(res[0].stake_u, 1.616212143940257, abs_tol=1e-12)

    assert res[1].approved is True
    assert res[1].tier == "solido"
    assert res[1].cap_applied is True
    assert res[1].allocation_rank == 3
    assert math.isclose(res[1].correlation_multiplier, 0.65, abs_tol=1e-12)
    assert math.isclose(res[1].stake_u, 0.13378785605974297, abs_tol=1e-12)
    assert math.isclose(res[1].expected_log_growth_g, 0.00035977556240808804, abs_tol=1e-12)

    assert res[2].approved is True
    assert res[2].odds_bucket == "long"
    assert res[2].tier == "valor"
    assert res[2].allocation_rank == 2
    assert math.isclose(res[2].adverse_ticks_1h, 0.9324009324009341, abs_tol=1e-12)
    assert math.isclose(res[2].stake_u, 0.9925384446558331, abs_tol=1e-12)
    assert math.isclose(res[2].expected_log_growth_g, 0.0008221440727986615, abs_tol=1e-12)


def test_stateful_backtest_selector_integration(tmp_path: Path) -> None:
    """Verifica que `StatefulBacktestPolicySelector` se integra limpiamente con `run_backtest` (`unlock_holdout=False`)."""
    t0 = pd.Timestamp("2024-03-01T18:00:00Z")
    ev_rows: list[dict[str, Any]] = []
    odds_rows: list[dict[str, Any]] = []

    for i in range(10):
        eid = f"ev_bt_{i:02d}"
        ts_start = t0 + timedelta(days=i * 3)
        ts_dec = ts_start - timedelta(hours=24)
        ts_disp = ts_dec - timedelta(hours=2)
        ev_rows.append(
            {
                "event_id": eid,
                "sport": "football",
                "league": "MEX",
                "season": "2024",
                "fold_key": "2024",
                "market": "1x2",
                "line": np.nan,
                "source_mode": "historical_fd",
                "ts_disponible": ts_disp,
                "ts_decision": ts_dec,
                "ts_event_start": ts_start,
                "home_score": 2.0,
                "away_score": 0.0,
                "y": 0,
                "p_model_home": 0.62,
                "p_model_draw": 0.22,
                "p_model_away": 0.16,
            }
        )
        for book, o_open, o_close in (
            ("b365", (2.04, 3.45, 3.75), (1.90, 3.50, 4.10)),
            ("pinnacle", (2.00, 3.55, 3.95), (1.88, 3.60, 4.30)),
        ):
            for sel, p_op, p_cl in zip(("home", "draw", "away"), o_open, o_close):
                odds_rows.append(
                    {
                        "event_id": eid,
                        "sport": "football",
                        "league": "MEX",
                        "market": "1x2",
                        "line": np.nan,
                        "selection": sel,
                        "book": book,
                        "price_decimal": p_op,
                        "ts_captured": ts_dec,
                        "ts_event_start": ts_start,
                        "source": "historical_fd",
                        "snapshot_stage": "open",
                    }
                )
                odds_rows.append(
                    {
                        "event_id": eid,
                        "sport": "football",
                        "league": "MEX",
                        "market": "1x2",
                        "line": np.nan,
                        "selection": sel,
                        "book": book,
                        "price_decimal": p_cl,
                        "ts_captured": ts_start - timedelta(seconds=1),
                        "ts_event_start": ts_start,
                        "source": "historical_fd",
                        "snapshot_stage": "close",
                    }
                )

    policy = _make_test_policy()
    blend_segs = {"MEX::1x2": {"best_devig_method": "power", "w_effective": 0.35, "model_picks_enabled": True}}
    sub_lookup = {f"ev_bt_{i:02d}": {"home": [0.61, 0.62, 0.63], "draw": [0.22, 0.22], "away": [0.16, 0.16]} for i in range(10)}
    selector = StatefulBacktestPolicySelector(policy, blend_segs, sub_lookup)

    cfg = BacktestConfig(
        phase="test_a5_selector",
        preset="a5_policy_v3_1",
        model_version="geodesic_v3.1_test",
        eval_split="walk_forward_dev",
        unlock_holdout=False,
        registry_path=tmp_path / "trial_reg.jsonl",
        events_df=pd.DataFrame(ev_rows),
        odds_df=pd.DataFrame(odds_rows),
        pick_selector_fn=selector,
        bootstrap_samples=1000,
        seed=42,
    )
    rep = run_backtest(cfg)
    assert rep["unlock_holdout"] is False
    assert rep["n_picks"] == 8  # 80% dev de 10 eventos = 8 eventos
    assert rep["clv_pct_mean"] is not None and rep["clv_pct_mean"] > 0.0


def test_frozen_policy_artifacts_match_byte_for_byte_if_present() -> None:
    """Cuando `pick_policy_v3_1.json` está materializado, verifica igualdad exacta y validez de esquema."""
    art_py = pe.DEFAULT_POLICY_ARTIFACT_PATH
    art_ts = pe.DEFAULT_TS_POLICY_COPY_PATH
    if art_py.exists() or art_ts.exists():
        assert art_py.exists() and art_ts.exists()
        raw_py = art_py.read_bytes()
        raw_ts = art_ts.read_bytes()
        assert raw_py == raw_ts
        parsed = json.loads(raw_py.decode("utf-8"))
        validate_pick_policy(parsed)
        assert parsed.get("holdout_sealed_untouched") is True


def test_calibrate_and_evaluate_ola2_picks_blocks_holdout_peek() -> None:
    """Verifica que cualquier intento de abrir el holdout sellado en Ola 2 lance `HoldoutSealedError`."""
    from backtest import HoldoutSealedError

    with pytest.raises(HoldoutSealedError):
        pe.calibrate_and_evaluate_ola2_picks(unlock_holdout=True)


def test_multi_market_stateful_selector_simultaneous_correlation(tmp_path: Path) -> None:
    """Verifica que `StatefulBacktestPolicySelector` evalúe mercados primarios y secundarios del mismo
    `event_id` en una sola llamada, aplicando el descuento `(1 - |rho|)` y el tope `<= 2.0u` por evento."""
    from backtest import BacktestConfig, run_backtest

    t0 = pd.Timestamp("2024-09-01T18:00:00Z")
    ev_rows: list[dict[str, Any]] = []
    odds_rows: list[dict[str, Any]] = []
    sec_specs: dict[str, list[dict[str, Any]]] = {}

    for i in range(5):
        eid = f"ev_mm_{i:02d}"
        ts_start = t0 + timedelta(days=i * 4)
        ts_dec = ts_start - timedelta(hours=24)
        ts_disp = ts_dec - timedelta(hours=2)
        ev_rows.append(
            {
                "event_id": eid,
                "sport": "football",
                "league": "MEX",
                "season": "2024",
                "fold_key": "2024",
                "market": "1x2",
                "line": np.nan,
                "source_mode": "historical_fd",
                "ts_disponible": ts_disp,
                "ts_decision": ts_dec,
                "ts_event_start": ts_start,
                "home_score": 2.0,
                "away_score": 1.0,
                "y": 0,
                "p_model_home": 0.555,
                "p_model_draw": 0.255,
                "p_model_away": 0.190,
            }
        )
        sec_specs[eid] = [
            {
                "market": "totals",
                "line": 2.5,
                "p_model_vec": (0.565, 0.435),
                "submodel_probs": {"over": [0.560, 0.565, 0.570], "under": [0.440, 0.435, 0.430]},
            }
        ]
        for book, o_open, o_close in (
            ("b365", (2.04, 3.45, 3.75), (1.90, 3.50, 4.10)),
            ("pinnacle", (2.00, 3.55, 3.95), (1.88, 3.60, 4.30)),
        ):
            for sel, p_op, p_cl in zip(("home", "draw", "away"), o_open, o_close):
                odds_rows.append(
                    {
                        "event_id": eid,
                        "sport": "football",
                        "league": "MEX",
                        "market": "1x2",
                        "line": np.nan,
                        "selection": sel,
                        "book": book,
                        "price_decimal": p_op,
                        "ts_captured": ts_dec,
                        "ts_event_start": ts_start,
                        "source": "historical_fd",
                        "snapshot_stage": "open",
                    }
                )
                odds_rows.append(
                    {
                        "event_id": eid,
                        "sport": "football",
                        "league": "MEX",
                        "market": "1x2",
                        "line": np.nan,
                        "selection": sel,
                        "book": book,
                        "price_decimal": p_cl,
                        "ts_captured": ts_start - timedelta(seconds=1),
                        "ts_event_start": ts_start,
                        "source": "historical_fd",
                        "snapshot_stage": "close",
                    }
                )
        for book, t_open, t_close in (
            ("b365", (2.00, 1.85), (1.85, 2.00)),
            ("pinnacle", (1.96, 1.94), (1.84, 2.06)),
        ):
            for sel, p_op, p_cl in zip(("over", "under"), t_open, t_close):
                odds_rows.append(
                    {
                        "event_id": eid,
                        "sport": "football",
                        "league": "MEX",
                        "market": "totals",
                        "line": 2.5,
                        "selection": sel,
                        "book": book,
                        "price_decimal": p_op,
                        "ts_captured": ts_dec,
                        "ts_event_start": ts_start,
                        "source": "historical_fd",
                        "snapshot_stage": "open",
                    }
                )
                odds_rows.append(
                    {
                        "event_id": eid,
                        "sport": "football",
                        "league": "MEX",
                        "market": "totals",
                        "line": 2.5,
                        "selection": sel,
                        "book": book,
                        "price_decimal": p_cl,
                        "ts_captured": ts_start - timedelta(seconds=1),
                        "ts_event_start": ts_start,
                        "source": "historical_fd",
                        "snapshot_stage": "close",
                    }
                )

    policy = _make_test_policy()
    blend_segs = {
        "MEX::1x2": {"best_devig_method": "power", "w_effective": 0.40, "model_picks_enabled": True},
        "MEX::totals": {"best_devig_method": "power", "w_effective": 0.40, "model_picks_enabled": True},
    }
    sub_lookup = {
        f"ev_mm_{i:02d}": {"home": [0.550, 0.555, 0.560], "draw": [0.255, 0.255], "away": [0.190, 0.190]}
        for i in range(5)
    }
    selector = StatefulBacktestPolicySelector(
        policy, blend_segs, sub_lookup, secondary_specs_by_event=sec_specs
    )

    rep = run_backtest(
        BacktestConfig(
            phase="test_a5_mm",
            preset="a5_policy_v3_1",
            model_version="geodesic_v3.1_test",
            eval_split="walk_forward_dev",
            unlock_holdout=False,
            registry_path=tmp_path / "trial_reg_mm.jsonl",
            events_df=pd.DataFrame(ev_rows),
            odds_df=pd.DataFrame(odds_rows),
            pick_selector_fn=selector,
            bootstrap_samples=1000,
            seed=7,
        )
    )
    assert rep["n_picks"] == 8  # 4 eventos dev × 2 mercados correlacionados = 8 picks
    for eid_k, exp_u in selector.event_exposure_u.items():
        assert exp_u <= 2.0 + 1e-12, f"Exposición por evento excedida en {eid_k}: {exp_u}"
