#!/usr/bin/env python3
"""Suite de pruebas A28 (Ola 2 · Agente A4) — Paridad de-vig, mezcla logit, walk-forward y Regla Rectora #4."""

from __future__ import annotations

import json
import math
from pathlib import Path
import sys

import numpy as np
import pytest

MODELS_DIR = Path(__file__).resolve().parent
REPO_ROOT = MODELS_DIR.parents[1]
for _p in (str(REPO_ROOT), str(MODELS_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import backtest as bt  # noqa: E402
import blend_calibration as bc  # noqa: E402


class TestDevigParityAndProperties:
    """1. Paridad y propiedades matemáticas de `proportional`, `power` y `shin` en 3 y 2 vías."""

    def test_golden_vectors_3way_and_2way(self) -> None:
        # Vectores dorados idénticos a `tests/prediction/blend.test.ts` (`|Δ| < 1e-13`, contrato `< 1e-9`)
        g3_prop = bc.devig_3way_odds([1.85, 3.60, 4.40], "proportional")
        g3_pow = bc.devig_3way_odds([1.85, 3.60, 4.40], "power")
        g3_shin = bc.devig_3way_odds([1.85, 3.60, 4.40], "shin")

        expected_3_prop = (0.5169712793733681, 0.26566579634464754, 0.21736292428198434)
        expected_3_pow = (0.5255777072925967, 0.2620069509834349, 0.2124153417239684)
        expected_3_shin = (0.5231975166318525, 0.26335691069852923, 0.21344557266961828)
        assert np.max(np.abs(np.array(g3_prop) - np.array(expected_3_prop))) < 1e-13
        assert np.max(np.abs(np.array(g3_pow) - np.array(expected_3_pow))) < 1e-13
        assert np.max(np.abs(np.array(g3_shin) - np.array(expected_3_shin))) < 1e-13

        assert abs(sum(g3_prop) - 1.0) < 1e-15
        assert abs(sum(g3_pow) - 1.0) < 1e-15
        assert abs(sum(g3_shin) - 1.0) < 1e-15

        # Sesgo favorito-longshot en cuotas asimétricas
        asym_prop = bc.devig_3way_odds([1.35, 5.20, 9.50], "proportional")
        asym_pow = bc.devig_3way_odds([1.35, 5.20, 9.50], "power")
        asym_shin = bc.devig_3way_odds([1.35, 5.20, 9.50], "shin")
        assert asym_pow[0] > asym_prop[0] and asym_shin[0] > asym_prop[0]
        assert asym_pow[2] < asym_prop[2] and asym_shin[2] < asym_prop[2]

        g2_prop = bc.devig_2way_odds(1.62, 2.38, "proportional")
        g2_pow = bc.devig_2way_odds(1.62, 2.38, "power")
        g2_shin = bc.devig_2way_odds(1.62, 2.38, "shin")
        assert np.max(np.abs(np.array(g2_prop) - np.array((0.595, 0.405)))) < 1e-13
        assert np.max(np.abs(np.array(g2_pow) - np.array((0.6003373915085037, 0.39966260849149626)))) < 1e-13
        assert np.max(np.abs(np.array(g2_shin) - np.array((0.5985579416952497, 0.4014420583047503)))) < 1e-13
        assert abs(sum(g2_prop) - 1.0) < 1e-15
        assert abs(sum(g2_pow) - 1.0) < 1e-15
        assert abs(sum(g2_shin) - 1.0) < 1e-15

    def test_scalar_vs_vectorized_matrix_parity(self) -> None:
        rng = np.random.default_rng(20261111)
        # Generar 40 mercados válidos de 3 vías con overround en [1.02, 1.12]
        raw_p3 = rng.dirichlet([2.5, 1.5, 1.8], size=40)
        margins3 = rng.uniform(1.02, 1.12, size=(40, 1))
        odds3 = np.clip(1.0 / (raw_p3 * margins3), 1.05, 50.0)

        m_prop3 = bc._devig_matrix_proportional(odds3)
        m_pow3 = bc._devig_matrix_power(odds3)
        m_shin3 = bc._devig_matrix_shin(odds3)

        for i in range(40):
            row = odds3[i].tolist()
            assert np.max(np.abs(m_prop3[i] - np.array(bc.devig_3way_odds(row, "proportional")))) < 1e-14
            assert np.max(np.abs(m_pow3[i] - np.array(bc.devig_3way_odds(row, "power")))) < 1e-14
            assert np.max(np.abs(m_shin3[i] - np.array(bc.devig_3way_odds(row, "shin")))) < 1e-14

        # Generar 40 mercados válidos de 2 vías
        raw_p2 = rng.dirichlet([2.0, 2.0], size=40)
        margins2 = rng.uniform(1.02, 1.10, size=(40, 1))
        odds2 = np.clip(1.0 / (raw_p2 * margins2), 1.05, 25.0)

        m_prop2 = bc._devig_matrix_proportional(odds2)
        m_pow2 = bc._devig_matrix_power(odds2)
        m_shin2 = bc._devig_matrix_shin(odds2)

        for i in range(40):
            o0, o1 = float(odds2[i, 0]), float(odds2[i, 1])
            assert np.max(np.abs(m_prop2[i] - np.array(bc.devig_2way_odds(o0, o1, "proportional")))) < 1e-14
            assert np.max(np.abs(m_pow2[i] - np.array(bc.devig_2way_odds(o0, o1, "power")))) < 1e-14
            assert np.max(np.abs(m_shin2[i] - np.array(bc.devig_2way_odds(o0, o1, "shin")))) < 1e-14

    def test_all_supported_markets_and_validation(self) -> None:
        for mkt in ("moneyline", "ah", "ou", "totals", "btts", "dnb", "spread"):
            for method in bc.CORE_DEVIG_METHODS:
                res = bc.devig_market_odds([1.82, 2.02], mkt, method)
                assert len(res) == 2
                assert abs(sum(res) - 1.0) < 1e-15

        res_dict_1x2 = bc.devig_market_odds({"home": 2.10, "draw": 3.40, "away": 3.60}, "1x2", "shin")
        res_seq_1x2 = bc.devig_market_odds([2.10, 3.40, 3.60], "1x2", "shin")
        assert np.max(np.abs(np.array(res_dict_1x2) - np.array(res_seq_1x2))) < 1e-15

        res_dict_ou = bc.devig_market_odds({"over": 1.91, "under": 1.95}, "ou", "power")
        res_dict_tot = bc.devig_market_odds({"over": 1.91, "under": 1.95}, "totals", "power")
        assert np.max(np.abs(np.array(res_dict_ou) - np.array(res_dict_tot))) < 1e-15

        with pytest.raises(bc.InvalidOddsError):
            bc.devig_3way_odds([1.0, 3.4, 3.8], "power")
        with pytest.raises(bc.InvalidOddsError):
            bc.devig_2way_odds(1.10, 1.10, "shin")
        with pytest.raises(bc.InvalidOddsError):
            bc.devig_2way_odds(3.50, 3.50, "proportional")
        with pytest.raises(bc.BlendValidationError):
            bc.devig_market_odds([1.9, 1.9], "corners", "power")


class TestLogitBlendAndShrinkage:
    """2 & 3. Mezcla unificada en espacio logit, contracción `n0=300` y Regla Rectora #4."""

    def test_unified_k2_identity_without_discontinuity(self) -> None:
        # Verifica σ(a)/(σ(a)+σ(-a)) == σ(a) para toda la rejilla
        for pm in (0.01, 0.15, 0.37, 0.50, 0.68, 0.94):
            for pk in (0.05, 0.24, 0.50, 0.73, 0.91):
                for w in bc.BLEND_WEIGHT_GRID:
                    b_bin = bc.blend_logit_2way(pm, pk, w)
                    b_uni = bc.blend_logit_probs([pm, 1.0 - pm], [pk, 1.0 - pk], w)
                    assert abs(b_bin[0] - b_uni[0]) < 1e-15
                    assert abs(b_bin[1] - b_uni[1]) < 1e-15

    def test_boundaries_clipping_and_matrix_parity(self) -> None:
        p_mod3 = [0.58, 0.24, 0.18]
        p_mkt3 = [0.51, 0.27, 0.22]

        at_w0 = bc.blend_logit_3way(p_mod3, p_mkt3, 0.0)
        at_w1 = bc.blend_logit_3way(p_mod3, p_mkt3, 1.0)
        assert np.max(np.abs(np.array(at_w0) - np.array(p_mkt3))) < 1e-15
        assert np.max(np.abs(np.array(at_w1) - np.array(p_mod3))) < 1e-15

        # Recorte simétrico en extremos [0, 1] -> [1e-6, 1 - 1e-6]
        assert bc.clip_probability(0.0) == 1e-6
        assert bc.clip_probability(1.0) == 1.0 - 1e-6
        assert abs(bc.logit_clipped(0.0) + bc.logit_clipped(1.0)) < 1e-10

        # Vectores dorados de mezcla logit idénticos a `tests/prediction/blend.test.ts` (`|Δ| < 1e-13`)
        b2_gold = bc.blend_logit_2way(0.63, 0.54, 0.35)
        assert np.max(np.abs(np.array(b2_gold) - np.array((0.5721181958843937, 0.4278818041156063)))) < 1e-13
        b3_gold = bc.blend_logit_3way([0.58, 0.24, 0.18], [0.51, 0.27, 0.22], 0.30)
        assert (
            np.max(
                np.abs(
                    np.array(b3_gold)
                    - np.array((0.5315447988453039, 0.26094137631726405, 0.20751382483743197))
                )
            )
            < 1e-13
        )

        ext3 = bc.blend_logit_3way([1.0, 0.0, 0.0], [0.5, 0.3, 0.2], 0.5)
        assert abs(sum(ext3) - 1.0) < 1e-15
        assert all(0.0 < x < 1.0 for x in ext3)

        # Paridad escalar vs matricial vectorizada
        mat_mod = np.array([p_mod3, [0.33, 0.34, 0.33]], dtype=np.float64)
        mat_mkt = np.array([p_mkt3, [0.45, 0.28, 0.27]], dtype=np.float64)
        mat_out = bc._blend_logit_matrix(mat_mod, mat_mkt, 0.35)
        for r in range(2):
            sc = bc.blend_logit_3way(mat_mod[r].tolist(), mat_mkt[r].tolist(), 0.35)
            assert np.max(np.abs(mat_out[r] - np.array(sc))) < 1e-15

    def test_shrinkage_and_regla_rectora_4(self) -> None:
        assert bc.shrink_blend_weight(0.40, 0) == {"w_shrunk_raw": 0.0, "w_effective": 0.0}
        s_300 = bc.shrink_blend_weight(0.40, 300, 300)
        assert abs(s_300["w_shrunk_raw"] - 0.20) < 1e-15
        assert s_300["w_effective"] == 0.20

        # Desempate exacto half-up determinista: 0.30 * (100/400) = 0.075 -> 0.10
        s_tie = bc.shrink_blend_weight(0.30, 100, 300)
        assert abs(s_tie["w_shrunk_raw"] - 0.075) < 1e-15
        assert s_tie["w_effective"] == 0.10

        # Regla Rectora #4
        assert bc.evaluate_model_picks_gate(
            w_effective=0.25,
            closing_benchmark_available=False,
            n_events_paired_closing=0,
            log_loss_blend=0.635,
            log_loss_market_open_novig=0.642,
        ) == {
            "model_picks_enabled": False,
            "disabled_reason": "insufficient_sharp_closing_benchmark",
        }

        assert bc.evaluate_model_picks_gate(
            w_effective=0.05,
            closing_benchmark_available=True,
            n_events_paired_closing=1200,
            log_loss_blend=0.980,
            log_loss_market_open_novig=0.985,
        ) == {
            "model_picks_enabled": False,
            "disabled_reason": "model_weight_near_zero_w_le_0_05",
        }

        assert bc.evaluate_model_picks_gate(
            w_effective=0.15,
            closing_benchmark_available=True,
            n_events_paired_closing=1200,
            log_loss_blend=0.985,
            log_loss_market_open_novig=0.985,
        ) == {
            "model_picks_enabled": False,
            "disabled_reason": "blend_does_not_beat_open_market_novig",
        }

        assert bc.evaluate_model_picks_gate(
            w_effective=0.15,
            closing_benchmark_available=True,
            n_events_paired_closing=1200,
            log_loss_blend=0.981,
            log_loss_market_open_novig=0.985,
            log_loss_blend_wf_causal=0.982,
        ) == {
            "model_picks_enabled": True,
            "disabled_reason": None,
        }


class TestBootstrapWalkForwardAndHoldoutSeal:
    """4 & 5. Bootstrap determinista, causalidad walk-forward estricta y sello del holdout."""

    def test_bootstrap_paired_loss_delta_rules(self) -> None:
        with pytest.raises(bc.BlendValidationError):
            bc.bootstrap_paired_loss_delta([0.5, 0.6], [0.5, 0.6], n_resamples=999)

        loss_a = [0.68, 0.72, 0.65, 0.70, 0.69, 0.71, 0.66, 0.73]
        loss_b = [0.69, 0.71, 0.66, 0.69, 0.68, 0.72, 0.65, 0.74]
        res_noisy = bc.bootstrap_paired_loss_delta(loss_a, loss_b, n_resamples=1000, seed=42)
        assert res_noisy["significant"] is False
        assert res_noisy["significance_label"] == "no significativa"
        assert res_noisy["ci95"][0] <= 0.0 <= res_noisy["ci95"][1]

        better_a = [0.61, 0.64, 0.58, 0.62, 0.60, 0.63, 0.59, 0.65]
        base_b = [0.66, 0.68, 0.63, 0.67, 0.64, 0.69, 0.62, 0.70]
        res_sig = bc.bootstrap_paired_loss_delta(better_a, base_b, n_resamples=1000, seed=20261111)
        assert res_sig["significant"] is True
        assert res_sig["significance_label"] == "significativa"
        assert abs(res_sig["delta_mean"] - (-0.04625000000000001)) < 1e-13
        assert abs(res_sig["ci95"][0] - (-0.05125000000000002)) < 1e-13
        assert abs(res_sig["ci95"][1] - (-0.04000000000000002)) < 1e-13

    def test_synthetic_walk_forward_causality_and_skill_detection(self) -> None:
        rng = np.random.default_rng(12345)
        n = 900
        # 3 pliegues temporales estrictamente ordenados (300 por pliegue)
        fold_keys = np.array(["2021"] * 300 + ["2022"] * 300 + ["2023"] * 300)
        base_ts = np.datetime64("2021-01-01T12:00:00")
        ts_starts = np.array([base_ts + np.timedelta64(i * 12, "h") for i in range(n)])
        ts_decs = ts_starts - np.timedelta64(2, "h")

        p_true = rng.uniform(0.25, 0.75, size=n)
        y = (rng.uniform(0.0, 1.0, size=n) >= p_true).astype(np.int64)  # 0 si gana primary, 1 si gana opposite

        # Mercado open ruidoso con margen 5%, modelo muy cercano a `p_true`, cierre Pinnacle cercano a `p_true`
        p_open = np.clip(p_true + rng.normal(0.0, 0.11, size=n), 0.10, 0.90)
        open_odds = np.column_stack([1.0 / (p_open * 1.05), 1.0 / ((1.0 - p_open) * 1.05)])
        p_mod_skilled = np.column_stack([p_true, 1.0 - p_true])
        p_close_novig = np.column_stack([p_true, 1.0 - p_true])

        seg_skilled = bc.calibrate_segment_walk_forward(
            league="TEST_LG",
            market="ah",
            sport="football",
            fold_keys=fold_keys,
            ts_event_starts=ts_starts,
            ts_decisions=ts_decs,
            p_model_mat=p_mod_skilled,
            open_odds_mat=open_odds,
            has_open_quote=np.ones(n, dtype=bool),
            closing_novig_mat=p_close_novig,
            has_sharp_closing=np.ones(n, dtype=bool),
            outcomes_y=y,
            open_quotes_truly_pre_close=True,
            n0_shrinkage=300,
            n_bootstrap=1000,
            seed=99,
        )
        assert seg_skilled["w_effective"] >= 0.30
        assert seg_skilled["model_picks_enabled"] is True
        assert seg_skilled["disabled_reason"] is None
        assert seg_skilled["log_loss_blend"] < seg_skilled["log_loss_market_open_novig"]

        # Cuando el modelo es puro ruido frente a un mercado exacto => w_effective <= 0.05 => apagado automático
        open_exact_odds = np.column_stack([1.0 / (p_true * 1.04), 1.0 / ((1.0 - p_true) * 1.04)])
        p_mod_bad = np.full((n, 2), 0.5, dtype=np.float64)
        seg_bad = bc.calibrate_segment_walk_forward(
            league="TEST_LG",
            market="ah",
            sport="football",
            fold_keys=fold_keys,
            ts_event_starts=ts_starts,
            ts_decisions=ts_decs,
            p_model_mat=p_mod_bad,
            open_odds_mat=open_exact_odds,
            has_open_quote=np.ones(n, dtype=bool),
            closing_novig_mat=p_close_novig,
            has_sharp_closing=np.ones(n, dtype=bool),
            outcomes_y=y,
            open_quotes_truly_pre_close=True,
            n0_shrinkage=300,
            n_bootstrap=1000,
            seed=99,
        )
        assert seg_bad["w_effective"] <= 0.05
        assert seg_bad["model_picks_enabled"] is False
        assert seg_bad["disabled_reason"] == "model_weight_near_zero_w_le_0_05"

    def test_unlock_holdout_is_strictly_forbidden(self) -> None:
        with pytest.raises(bt.HoldoutSealedError):
            bc.run_blend_calibration_pipeline(unlock_holdout=True)


class TestFrozenArtifactSchemaAndMirror:
    """6. Validación íntegra de `blend_weights_v3_1.json` y espejo TypeScript."""

    def test_artifact_exists_matches_ts_mirror_and_satisfies_contract(self) -> None:
        assert bc.DEFAULT_ARTIFACT_JSON.exists(), "Falta services/models/artifacts/blend_weights_v3_1.json"
        assert bc.DEFAULT_TS_MIRROR_JSON.exists(), "Falta src/data/prediction/blend_weights_v3_1.json"

        raw_py = bc.DEFAULT_ARTIFACT_JSON.read_text(encoding="utf-8")
        raw_ts = bc.DEFAULT_TS_MIRROR_JSON.read_text(encoding="utf-8")
        assert raw_py == raw_ts, "El espejo TypeScript debe ser idéntico byte a byte al artefacto Python"

        art = json.loads(raw_py)
        required_root_keys = {
            "schema_version",
            "generated_at_utc",
            "reproduction_command",
            "holdout_sealed_untouched",
            "n0_shrinkage",
            "global_summary",
            "segments",
        }
        assert required_root_keys.issubset(art.keys())
        assert art["holdout_sealed_untouched"] is True
        assert art["n0_shrinkage"] == 300

        required_seg_keys = {
            "league",
            "market",
            "n_events_dev",
            "n_events_paired_closing",
            "closing_benchmark_available",
            "best_devig_method",
            "devig_comparison",
            "w_raw_opt",
            "w_effective",
            "log_loss_model",
            "log_loss_market_open_novig",
            "log_loss_blend",
            "log_loss_closing_novig",
            "delta_blend_vs_closing",
            "delta_blend_vs_closing_ci95",
            "delta_blend_vs_closing_significant",
            "delta_blend_vs_open_novig",
            "delta_blend_vs_open_novig_ci95",
            "model_picks_enabled",
            "disabled_reason",
        }

        segments = art["segments"]
        assert len(segments) >= 50
        for seg_key, seg in segments.items():
            assert required_seg_keys.issubset(seg.keys()), f"Faltan llaves en {seg_key}"
            assert seg_key == f"{seg['league']}::{seg['market']}"
            assert seg["best_devig_method"] in bc.CORE_DEVIG_METHODS
            if seg["model_picks_enabled"]:
                assert seg["disabled_reason"] is None
                assert seg["w_effective"] > 0.05
                assert seg["closing_benchmark_available"] is True
            else:
                assert isinstance(seg["disabled_reason"], str) and len(seg["disabled_reason"]) > 0

        # NFL histórico (`nflverse`) debe tener `closing_benchmark_available: False` y estar deshabilitado
        for nfl_mkt in ("moneyline", "spread", "totals"):
            nfl_seg = segments[f"NFL::{nfl_mkt}"]
            assert nfl_seg["closing_benchmark_available"] is False
            assert nfl_seg["model_picks_enabled"] is False
            assert nfl_seg["disabled_reason"] == "insufficient_sharp_closing_benchmark"

        # Verificar helper de consumo Python `compute_segment_blended_probs`
        e0_res = bc.compute_segment_blended_probs(
            artifact=art,
            league="E0",
            market="1x2",
            model_probs={"home": 0.55, "draw": 0.25, "away": 0.20},
            market_raw_odds={"home": 1.90, "draw": 3.60, "away": 4.20},
        )
        assert e0_res["segment_found"] is True
        assert abs(sum(e0_res["p_final"]) - 1.0) < 1e-15
