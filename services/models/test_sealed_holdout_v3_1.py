"""Tests de integridad y gobernanza para la Evaluación Única del Holdout Sellado `v3.1` (`a10-holdout`)."""

from __future__ import annotations

import json
from pathlib import Path
import sys

import pandas as pd
import pytest

MODELS_DIR = Path(__file__).resolve().parent
WORKTREE_ROOT = MODELS_DIR.parent.parent

if str(MODELS_DIR) not in sys.path:
    sys.path.insert(0, str(MODELS_DIR))

import evaluate_sealed_holdout_v3_1 as ho_eval  # noqa: E402

SEALED_EVAL_PATH = MODELS_DIR / "artifacts" / "sealed_holdout_v3_1_eval.json"
REGISTRY_PATH = MODELS_DIR / "artifacts" / "holdout_trial_registry.jsonl"
PROD_SEGMENTS_PATH = WORKTREE_ROOT / "src" / "data" / "prediction" / "production_segments_v3_1.json"
BLEND_WEIGHTS_PATH = MODELS_DIR / "artifacts" / "blend_weights_v3_1.json"
PICK_POLICY_PATH = WORKTREE_ROOT / "src" / "data" / "prediction" / "pick_policy_v3_1.json"
STALE_CONFIG_PATH = WORKTREE_ROOT / "src" / "data" / "prediction" / "stale_lines_config.json"


@pytest.fixture(scope="module")
def eval_artifact() -> dict:
    assert SEALED_EVAL_PATH.exists(), f"Falta artefacto {SEALED_EVAL_PATH}"
    return json.loads(SEALED_EVAL_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def prod_segments() -> dict:
    assert PROD_SEGMENTS_PATH.exists(), f"Falta artefacto {PROD_SEGMENTS_PATH}"
    return json.loads(PROD_SEGMENTS_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def registry_entries() -> list[dict]:
    assert REGISTRY_PATH.exists(), f"Falta registro {REGISTRY_PATH}"
    return [
        json.loads(line)
        for line in REGISTRY_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def test_consolidated_multiple_testing_registry_integrity(registry_entries: list[dict], eval_artifact: dict) -> None:
    """Verifica las 24 corridas de Olas 1-3 + 1 referencia dev integrada = 25 pre-holdout,
    seguidas únicamente por las 4 evaluaciones congeladas de apertura única del holdout."""
    assert len(registry_entries) == 29
    seqs = [int(e["trial_seq"]) for e in registry_entries]
    assert seqs == list(range(1, 30))

    pre_holdout = registry_entries[:25]
    holdout_runs = registry_entries[25:]

    for entry in pre_holdout:
        assert entry["eval_split"] == "walk_forward_dev"
        assert entry["unlock_holdout"] is False

    olas_1_3 = pre_holdout[:24]
    by_src: dict[str, int] = {}
    for entry in olas_1_3:
        src = str(entry["source_registry"])
        by_src[src] = by_src.get(src, 0) + 1
    assert by_src == {
        "holdout_trial_registry.jsonl": 9,
        "holdout_registry_a6.jsonl": 4,
        "holdout_registry_a7.jsonl": 4,
        "holdout_registry_a8.jsonl": 7,
    }
    assert pre_holdout[24]["phase"] == "ola4_pre_holdout_integrated_v3_1_dev"

    expected_holdout_phases = [
        "holdout_sealed_phase0_baseline_v3_0",
        "holdout_sealed_phase1_ola2_picks_v3_1",
        "holdout_sealed_phase2a_ola3_stale_lines_a8",
        "holdout_sealed_phase2b_integrated_v3_1",
    ]
    assert [e["phase"] for e in holdout_runs] == expected_holdout_phases
    for entry in holdout_runs:
        assert entry["eval_split"] == "holdout_sealed"
        assert entry["unlock_holdout"] is True
        assert int(entry["n_configs_tested_before_this_call"]) == 25

    mt = eval_artifact["multiple_testing_control"]
    assert mt["n_olas_1_to_3_run_backtest_trials"] == 24
    assert mt["n_pre_holdout_run_backtest_trials_including_integrated_dev"] == 25
    assert mt["n_sealed_holdout_single_pass_runs"] == 4


def test_sealed_holdout_split_and_governance(eval_artifact: dict) -> None:
    """Verifica frontera exacta del holdout sellado (14,163 eventos >= 2025-02-02T17:30:00+00:00) y gobernanza."""
    sp = eval_artifact["split_summary"]
    assert sp["n_total"] == 70812
    assert sp["n_dev"] == 56649
    assert sp["n_holdout"] == 14163
    assert sp["holdout_cut_ts"] == "2025-02-02T17:30:00+00:00"

    gov = eval_artifact["governance"]
    assert gov["single_pass_holdout_evaluation"] is True
    assert gov["zero_post_holdout_retuning"] is True
    assert gov["execution_delay_minutes"] == 2.0
    assert gov["historical_delay_alpha"] == 0.05
    assert gov["bootstrap_samples"] == 1000
    assert gov["seed"] == 20261111


def test_portfolio_caps_and_subgroup_conservation_all_v3_1_phases(eval_artifact: dict) -> None:
    """Verifica cumplimiento estricto de los 4 topes duros (2u/2u/3u/5u), <= 1 pick por (event_id, mercado),
    exclusividad de niveles ('solido' y 'valor', jamás 'tiro_cuota_alta') y conservación exacta de conteos."""
    for split_block_key in ("walk_forward_dev_phases", "holdout_sealed_phases"):
        phases = eval_artifact[split_block_key]
        assert set(phases.keys()) >= {
            "phase0_baseline_v3_0",
            "phase1_ola2_picks_v3_1",
            "phase2a_ola3_stale_lines_a8",
            "phase2b_integrated_v3_1",
        }
        for pk in ("phase1_ola2_picks_v3_1", "phase2a_ola3_stale_lines_a8", "phase2b_integrated_v3_1"):
            ph = phases[pk]
            caps = ph["portfolio_caps_audit"]
            assert caps["all_caps_respected"] is True
            assert caps["n_violations"] == 0
            obs = caps["observed_max"]
            assert obs["per_pick_u"] <= 2.0 + 1e-9
            assert obs["per_event_u"] <= 2.0 + 1e-9
            assert obs["per_league_date_u"] <= 3.0 + 1e-9
            assert obs["per_global_date_u"] <= 5.0 + 1e-9
            assert obs["max_picks_per_event_market"] <= 1

            by_tier = ph["by_tier"]
            assert set(by_tier.keys()) == {"solido", "valor"}
            assert by_tier["solido"]["n_picks"] + by_tier["valor"]["n_picks"] == ph["n_picks"]

            by_origin = ph["by_origin"]
            assert sum(v["n_picks"] for v in by_origin.values()) == ph["n_picks"]


def test_frozen_weights_not_refitted_and_production_segments_coherence(
    eval_artifact: dict,
    prod_segments: dict,
) -> None:
    """Verifica que ningún peso `w_effective` ni método de-vig fue re-ajustado tras ver el holdout
    y que `production_segments_v3_1.json` coincide 1:1 con `sealed_holdout_v3_1_eval.json`."""
    frozen_blend = json.loads(BLEND_WEIGHTS_PATH.read_text(encoding="utf-8"))["segments"]
    lm_table = eval_artifact["league_market_table"]
    prod_map = prod_segments["segments"]

    assert set(lm_table.keys()) == set(prod_map.keys())
    assert set(frozen_blend.keys()).issubset(set(lm_table.keys()))

    comp = prod_segments["component_status"]
    assert comp["a6_dixon_coles_2way_pure"]["production_activated"] is False
    assert comp["a6_dixon_coles_2way_pure"]["n_segments_enabled"] == 0
    assert comp["a7_gbm_calibrated_1x2"]["production_activated"] is False

    enabled_observed: list[str] = []
    min_n = int(eval_artifact["governance"]["min_segment_picks_for_valid_ci95"])

    for seg_k, f_seg in frozen_blend.items():
        t_row = lm_table[seg_k]
        p_row = prod_map[seg_k]
        assert t_row["best_devig_method"] == f_seg["best_devig_method"]
        assert abs(float(t_row["w_effective"]) - float(f_seg["w_effective"])) < 1e-12
        assert p_row["best_devig_method"] == f_seg["best_devig_method"]
        assert abs(float(p_row["w_effective"]) - float(f_seg["w_effective"])) < 1e-12

    for seg_k, p_row in prod_map.items():
        t_row = lm_table[seg_k]
        ho_int = t_row["holdout_sealed"]["picks_integrated_v3_1"]
        assert p_row["production_enabled"] is t_row["production_enabled"]
        assert p_row["disabled_reason"] == t_row["production_disabled_reason"]
        assert p_row["holdout_n_picks"] == ho_int["n_picks"]
        assert p_row["holdout_n_picks_with_closing"] == ho_int["n_picks_with_closing"]

        n_clv = int(p_row["holdout_n_picks_with_closing"])
        clv_m = p_row["holdout_clv_pct_mean"]
        clv_ci = p_row["holdout_clv_pct_ci95"]
        expected_enabled = bool(
            n_clv >= min_n
            and clv_m is not None
            and float(clv_m) > 0.0
            and clv_ci is not None
            and float(clv_ci[0]) > 0.0
        )
        assert p_row["production_enabled"] is expected_enabled
        if expected_enabled:
            enabled_observed.append(seg_k)
            assert p_row["disabled_reason"] is None
        else:
            assert isinstance(p_row["disabled_reason"], str) and len(p_row["disabled_reason"]) > 0

    seg_sum = prod_segments["portfolio_vs_segment_verdict"]["segment_level_summary"]
    assert seg_sum["n_segments_production_enabled"] == len(enabled_observed)
    assert seg_sum["enabled_segments"] == sorted(enabled_observed)


def test_integrated_selector_deduplicates_ou_vs_totals_and_enforces_caps() -> None:
    """Verifica en memoria que `IntegratedV31BacktestSelector` normaliza `'ou'` == `'totals'`,
    impide apostar 2 veces el mismo mercado en un evento y respeta los topes `2u/2u/3u/5u`."""
    frozen_blend = json.loads(BLEND_WEIGHTS_PATH.read_text(encoding="utf-8"))["segments"]
    frozen_pol = json.loads(PICK_POLICY_PATH.read_text(encoding="utf-8"))
    frozen_stale = json.loads(STALE_CONFIG_PATH.read_text(encoding="utf-8"))

    pol_mod_only = ho_eval._build_model_only_a5_policy(frozen_pol)
    assert pol_mod_only["allow_pure_market_arb"] is False
    assert all(v["allow_pure_market_arb"] is False for v in pol_mod_only["segments"].values())

    assert ho_eval._canonical_portfolio_market("ou") == "totals"
    assert ho_eval._canonical_portfolio_market("totals") == "totals"

    eid = "football:syn_test_1"
    ts_dec = pd.Timestamp("2025-05-10T13:00:00Z")
    ts_st = pd.Timestamp("2025-05-10T14:00:00Z")
    quotes = [
        # Pinnacle sharp en totals 2.5 (~60% over)
        {"event_id": eid, "market": "totals", "line": 2.5, "selection": "over", "book": "pinnacle", "price_decimal": 1.66, "ts_captured": ts_dec, "source": "scraped_ws"},
        {"event_id": eid, "market": "totals", "line": 2.5, "selection": "under", "book": "pinnacle", "price_decimal": 2.38, "ts_captured": ts_dec, "source": "scraped_ws"},
        # Casa recreativa b365 rezagada en over 2.5 (1.95 -> gran EV tanto para A5 como para A8)
        {"event_id": eid, "market": "totals", "line": 2.5, "selection": "over", "book": "b365", "price_decimal": 1.95, "ts_captured": ts_dec, "source": "scraped_ws"},
        {"event_id": eid, "market": "totals", "line": 2.5, "selection": "under", "book": "b365", "price_decimal": 1.90, "ts_captured": ts_dec, "source": "scraped_ws"},
        # 1x2 equilibrado para el contexto primario
        {"event_id": eid, "market": "1x2", "line": None, "selection": "home", "book": "pinnacle", "price_decimal": 2.10, "ts_captured": ts_dec, "source": "scraped_ws"},
        {"event_id": eid, "market": "1x2", "line": None, "selection": "draw", "book": "pinnacle", "price_decimal": 3.40, "ts_captured": ts_dec, "source": "scraped_ws"},
        {"event_id": eid, "market": "1x2", "line": None, "selection": "away", "book": "pinnacle", "price_decimal": 3.80, "ts_captured": ts_dec, "source": "scraped_ws"},
        {"event_id": eid, "market": "1x2", "line": None, "selection": "home", "book": "b365", "price_decimal": 2.60, "ts_captured": ts_dec, "source": "scraped_ws"},
        {"event_id": eid, "market": "1x2", "line": None, "selection": "draw", "book": "b365", "price_decimal": 3.20, "ts_captured": ts_dec, "source": "scraped_ws"},
        {"event_id": eid, "market": "1x2", "line": None, "selection": "away", "book": "b365", "price_decimal": 2.80, "ts_captured": ts_dec, "source": "scraped_ws"},
    ]
    sec_specs = {
        eid: [
            {
                "market": "totals",
                "line": 2.5,
                "p_model_vec": (0.61, 0.39),
                "submodel_probs": {"over": [0.60, 0.61, 0.62], "under": [0.40, 0.39, 0.38]},
            }
        ]
    }
    sub_lookup = {eid: {"home": [0.48, 0.49, 0.47], "draw": [0.28, 0.28, 0.29], "away": [0.24, 0.23, 0.24]}}

    # B1::totals tiene model_picks_enabled=True en blend_weights_v3_1.json
    sel = ho_eval.IntegratedV31BacktestSelector(
        frozen_pol,
        frozen_stale,
        frozen_blend,
        sub_lookup,
        {eid: quotes},
        secondary_specs_by_event=sec_specs,
    )

    class _DummyCfg:
        line_shopping = True

    picks = sel(
        {
            "event_id": eid,
            "sport": "football",
            "league": "B1",
            "market": "1x2",
            "line": None,
            "source_mode": "scraped_ws",
            "ts_decision": ts_dec,
            "ts_event_start": ts_st,
            "p_model_vec": [0.48, 0.28, 0.24],
        },
        quotes,
        _DummyCfg(),
    )
    mkts_emitted = [p["market"] for p in picks]
    assert len(mkts_emitted) == len(set(mkts_emitted)), f"Mercado duplicado emitido: {mkts_emitted}"
    assert sum(p["stake_u"] for p in picks) <= 2.0 + 1e-9
