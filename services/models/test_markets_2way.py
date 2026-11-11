"""Suite exhaustiva de pruebas unitarias, identidades asiáticas y auditoría A4+A3 para `markets_2way.py` (Agente A6)."""

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

import backtest as bt
import clv_report as cr
import markets_2way as m2w


class TestDixonColesMatrixAndDerivations:
    """Verifica la derivación exacta desde la matriz Dixon-Coles (`0..max_goals`, `max_goals >= 10`)."""

    @pytest.mark.parametrize(
        "lam_h,lam_a,rho,max_goals",
        [
            (1.55, 1.15, -0.11, 10),
            (1.82, 0.94, -0.15, 12),
            (1.10, 1.48, 0.08, 14),
            (2.35, 1.75, -0.25, 15),
            (0.65, 0.55, 0.00, 12),
        ],
    )
    def test_matrix_normalization_and_tau_identity(
        self, lam_h: float, lam_a: float, rho: float, max_goals: int
    ) -> None:
        mat = m2w.build_dixon_coles_score_matrix(lam_h, lam_a, rho=rho, max_goals=max_goals)
        assert len(mat) == max_goals + 1
        assert all(len(row) == max_goals + 1 for row in mat)

        total = sum(sum(r) for r in mat)
        assert abs(total - 1.0) < 1e-14

        # Verificar factor tau idéntico a `PoissonDC._tau_matrix` en `(0,0), (0,1), (1,0), (1,1)`
        mat_indep = m2w.build_dixon_coles_score_matrix(lam_h, lam_a, rho=0.0, max_goals=max_goals)
        # Cocientes relativos frente a una celda alta `(2, 2)` donde tau == 1.0
        ratio_22 = mat[2][2] / mat_indep[2][2]
        assert abs((mat[0][0] / mat_indep[0][0]) / ratio_22 - max(1.0 - lam_h * lam_a * rho, 1e-9)) < 1e-14
        assert abs((mat[0][1] / mat_indep[0][1]) / ratio_22 - max(1.0 + lam_h * rho, 1e-9)) < 1e-14
        assert abs((mat[1][0] / mat_indep[1][0]) / ratio_22 - max(1.0 + lam_a * rho, 1e-9)) < 1e-14
        assert abs((mat[1][1] / mat_indep[1][1]) / ratio_22 - max(1.0 - rho, 1e-9)) < 1e-14

    def test_rejects_invalid_matrix_parameters(self) -> None:
        with pytest.raises(m2w.Markets2WayValidationError):
            m2w.build_dixon_coles_score_matrix(1.4, 1.1, rho=-0.1, max_goals=9)  # < 10 prohibido
        with pytest.raises(m2w.Markets2WayValidationError):
            m2w.build_dixon_coles_score_matrix(0.0, 1.1, rho=-0.1, max_goals=12)
        with pytest.raises(m2w.Markets2WayValidationError):
            m2w.build_dixon_coles_score_matrix(1.4, -0.5, rho=-0.1, max_goals=12)
        with pytest.raises(m2w.Markets2WayValidationError):
            m2w.build_dixon_coles_score_matrix(1.4, 1.1, rho=-1.5, max_goals=12)
        with pytest.raises(m2w.Markets2WayValidationError):
            m2w.validate_quarter_line(-0.33)

    def test_all_four_markets_canonical_lines_and_symmetries(self) -> None:
        bundle = m2w.derive_all_2way_markets(1.64, 1.18, rho=-0.12, max_goals=12)
        assert abs(bundle["meta"]["matrix_sum"] - 1.0) < 1e-15

        # 1. AH: líneas -1.0 .. +1.0 y simetría exacta Home(L) <-> Away(-L)
        assert tuple(bundle["ah"]["lines"]) == (-1.0, -0.75, -0.5, -0.25, 0.0, 0.25, 0.5, 0.75, 1.0)
        for ln in m2w.AH_CANONICAL_LINES:
            k_h = m2w.format_line_key(ln)
            k_a = m2w.format_line_key(0.0 if ln == 0.0 else -ln)
            sp_h = bundle["ah"]["home"][k_h]
            sp_a = bundle["ah"]["away"][k_a]

            assert abs(sum(sp_h[k] for k in ("p_full_win", "p_half_win", "p_push", "p_half_loss", "p_full_loss")) - 1.0) < 1e-15
            assert abs(sp_h["p_full_win"] - sp_a["p_full_loss"]) < 1e-15
            assert abs(sp_h["p_half_win"] - sp_a["p_half_loss"]) < 1e-15
            assert abs(sp_h["p_push"] - sp_a["p_push"]) < 1e-15
            assert abs(sp_h["p_half_loss"] - sp_a["p_half_win"]) < 1e-15
            assert abs(sp_h["p_full_loss"] - sp_a["p_full_win"]) < 1e-15
            assert abs((sp_h["p_effective_win"] + sp_a["p_effective_win"]) - 1.0) < 1e-15

            # Equivalencia entre convención por selección y convención home_canonical
            mat = m2w.build_dixon_coles_score_matrix(1.64, 1.18, rho=-0.12, max_goals=12)
            sp_a_canon = m2w.derive_selection_settlement_probs(
                mat, "ah", ln, "away", line_convention="home_canonical"
            )
            for field in sp_a:
                assert abs(sp_a_canon[field] - sp_a[field]) < 1e-15

        # 2. DNB === AH 0.0 exacto + p_push explícito en empate
        dnb_h = bundle["dnb"]["home"]
        dnb_a = bundle["dnb"]["away"]
        ah0_h = bundle["ah"]["home"]["0"]
        ah0_a = bundle["ah"]["away"]["0"]
        for field in dnb_h:
            assert abs(dnb_h[field] - ah0_h[field]) < 1e-15
            assert abs(dnb_a[field] - ah0_a[field]) < 1e-15
        assert abs(bundle["dnb"]["p_push"] - dnb_h["p_push"]) < 1e-15
        assert abs((dnb_h["p_effective_win"] + dnb_a["p_effective_win"]) - 1.0) < 1e-15
        assert abs(dnb_h["p_effective_win"] - dnb_h["p_full_win"] / (dnb_h["p_full_win"] + dnb_a["p_full_win"])) < 1e-15

        # 3. Totals / OU: líneas 1.5 .. 3.5 y simetría Over(L) <-> Under(L)
        assert tuple(bundle["totals"]["lines"]) == (1.5, 1.75, 2.0, 2.25, 2.5, 2.75, 3.0, 3.25, 3.5)
        assert bundle["ou"] == bundle["totals"]
        for ln in m2w.TOTALS_CANONICAL_LINES:
            k = m2w.format_line_key(ln)
            sp_o = bundle["totals"]["over"][k]
            sp_u = bundle["totals"]["under"][k]
            assert abs(sp_o["p_full_win"] - sp_u["p_full_loss"]) < 1e-15
            assert abs(sp_o["p_half_win"] - sp_u["p_half_loss"]) < 1e-15
            assert abs(sp_o["p_push"] - sp_u["p_push"]) < 1e-15
            assert abs((sp_o["p_effective_win"] + sp_u["p_effective_win"]) - 1.0) < 1e-15

        # 4. BTTS: P(GH >= 1, GA >= 1) y complemento exacto
        mat = m2w.build_dixon_coles_score_matrix(1.64, 1.18, rho=-0.12, max_goals=12)
        p_h0 = sum(mat[0])
        p_a0 = sum(mat[h][0] for h in range(13))
        p_00 = mat[0][0]
        p_btts_inclusion_exclusion = 1.0 - p_h0 - p_a0 + p_00
        assert abs(bundle["btts"]["yes"]["p_full_win"] - p_btts_inclusion_exclusion) < 1e-15
        assert abs(bundle["btts"]["no"]["p_full_win"] - (1.0 - p_btts_inclusion_exclusion)) < 1e-15
        assert bundle["btts"]["yes"]["p_push"] == 0.0

    def test_vectorized_matches_scalar_to_machine_precision(self) -> None:
        lh = np.array([1.42, 2.05, 0.91, 1.68], dtype=np.float64)
        la = np.array([1.15, 0.88, 1.54, 1.33], dtype=np.float64)
        rh = np.array([-0.11, -0.18, 0.05, -0.09], dtype=np.float64)
        ah_lns = np.array([-0.75, -0.25, 0.0, 0.5], dtype=np.float64)
        tot_lns = np.array([2.25, 2.5, 2.75, 3.0], dtype=np.float64)

        vec_ah = m2w._vectorized_dc_2way_settlement_and_probs(lh, la, rh, ah_lns, "ah", max_goals=12)
        vec_tot = m2w._vectorized_dc_2way_settlement_and_probs(lh, la, rh, tot_lns, "totals", max_goals=12)
        vec_btts = m2w._vectorized_dc_2way_settlement_and_probs(lh, la, rh, np.zeros(4), "btts", max_goals=12)

        for i in range(4):
            mat = m2w.build_dixon_coles_score_matrix(float(lh[i]), float(la[i]), float(rh[i]), max_goals=12)
            sp_ah_h = m2w.derive_selection_settlement_probs(mat, "ah", float(ah_lns[i]), "home")
            assert abs(vec_ah["p_model_mat"][i, 0] - sp_ah_h["p_effective_win"]) < 1e-15
            for idx_k, k in enumerate(("p_full_win", "p_half_win", "p_push", "p_half_loss", "p_full_loss")):
                assert abs(vec_ah["primary_sp"][i, idx_k] - sp_ah_h[k]) < 1e-15

            sp_tot_o = m2w.derive_selection_settlement_probs(mat, "totals", float(tot_lns[i]), "over")
            assert abs(vec_tot["p_model_mat"][i, 0] - sp_tot_o["p_effective_win"]) < 1e-15

            sp_btts_y = m2w.derive_selection_settlement_probs(mat, "btts", None, "yes")
            assert abs(vec_btts["p_model_mat"][i, 0] - sp_btts_y["p_effective_win"]) < 1e-15


class TestSplitAsianLinesEvKellyAndSettlement:
    """Verifica EV exacto, descomposición 50/50 de cuartos `.25`/`.75`, Kelly ¼ de 5 estados y paridad con `clv_report.py`."""

    @pytest.mark.parametrize("price", [1.72, 1.95, 2.08, 2.45])
    def test_quarter_line_ev_equals_exact_half_sum_of_adjacent_lines(self, price: float) -> None:
        mat = m2w.build_dixon_coles_score_matrix(1.58, 1.21, rho=-0.11, max_goals=12)

        # AH quarter lines: -0.75 = 0.5*(-1.0)+0.5*(-0.5), -0.25 = 0.5*(-0.5)+0.5*(0.0), +0.25, +0.75
        for q_line in (-0.75, -0.25, 0.25, 0.75):
            for sel in ("home", "away"):
                sp_q = m2w.derive_selection_settlement_probs(mat, "ah", q_line, sel)
                sp_lo = m2w.derive_selection_settlement_probs(mat, "ah", q_line - 0.25, sel)
                sp_hi = m2w.derive_selection_settlement_probs(mat, "ah", q_line + 0.25, sel)
                ev_q = m2w.compute_asian_ev(sp_q, price)
                ev_avg = 0.5 * m2w.compute_asian_ev(sp_lo, price) + 0.5 * m2w.compute_asian_ev(sp_hi, price)
                assert abs(ev_q - ev_avg) < 1e-14

        # Totals quarter lines: 1.75, 2.25, 2.75, 3.25
        for q_line in (1.75, 2.25, 2.75, 3.25):
            for sel in ("over", "under"):
                sp_q = m2w.derive_selection_settlement_probs(mat, "totals", q_line, sel)
                sp_lo = m2w.derive_selection_settlement_probs(mat, "totals", q_line - 0.25, sel)
                sp_hi = m2w.derive_selection_settlement_probs(mat, "totals", q_line + 0.25, sel)
                ev_q = m2w.compute_asian_ev(sp_q, price)
                ev_avg = 0.5 * m2w.compute_asian_ev(sp_lo, price) + 0.5 * m2w.compute_asian_ev(sp_hi, price)
                assert abs(ev_q - ev_avg) < 1e-14

    def test_expected_pnl_over_score_matrix_matches_compute_asian_ev_exactly(self) -> None:
        max_g = 12
        mat = m2w.build_dixon_coles_score_matrix(1.71, 1.09, rho=-0.13, max_goals=max_g)
        price = 2.04

        cases: list[tuple[str, float | None, str]] = [
            ("ah", -1.0, "home"),
            ("ah", -0.75, "home"),
            ("ah", -0.25, "home"),
            ("ah", 0.0, "away"),
            ("ah", 0.25, "away"),
            ("ah", 0.75, "away"),
            ("dnb", None, "home"),
            ("totals", 2.0, "over"),
            ("totals", 2.25, "over"),
            ("totals", 2.75, "under"),
            ("btts", None, "yes"),
        ]
        for mkt, ln, sel in cases:
            sp = m2w.derive_selection_settlement_probs(mat, mkt, ln, sel)
            ev_formula = m2w.compute_asian_ev(sp, price)
            ev_grid = 0.0
            for h in range(max_g + 1):
                for a in range(max_g + 1):
                    settled = m2w.settle_asian_line(mkt, ln, sel, h, a, stake_u=1.0, price_decimal=price)
                    ev_grid += mat[h][a] * settled["pnl_u"]
            assert abs(ev_formula - ev_grid) < 1e-14

    def test_exact_5state_quarter_kelly_optimality_and_binary_reduction(self) -> None:
        # 1. Reducción exacta al Kelly clásico binario `(p*b - q)/b` cuando no hay pushes ni medios resultados
        p_win = 0.56
        price = 2.00  # b = 1.0 -> f* = 0.56 - 0.44 = 0.12, quarter_kelly = 0.03, stake_u = 3.0u
        sp_bin = {"p_full_win": p_win, "p_half_win": 0.0, "p_push": 0.0, "p_half_loss": 0.0, "p_full_loss": 1.0 - p_win}
        res_bin = m2w.solve_exact_asian_kelly(sp_bin, price)
        assert abs(res_bin["f_full_kelly"] - 0.12) < 1e-14
        assert abs(res_bin["f_quarter_kelly"] - 0.03) < 1e-14
        assert abs(res_bin["stake_raw_u"] - 3.0) < 1e-12

        # 2. Condición de primer orden `G'(f*) == 0` en lotería asiática de 5 estados (`AH -0.25` / `Over 2.25`)
        mat = m2w.build_dixon_coles_score_matrix(1.85, 1.05, rho=-0.11, max_goals=12)
        sp_split = m2w.derive_selection_settlement_probs(mat, "ah", -0.25, "home")
        price_val = 1.98
        b = price_val - 1.0
        res_split = m2w.solve_exact_asian_kelly(sp_split, price_val)
        f_star = res_split["f_full_kelly"]
        assert 0.0 < f_star < 1.0
        assert abs(res_split["f_quarter_kelly"] - 0.25 * f_star) < 1e-15

        # Derivada exacta del crecimiento logarítmico esperado en f*
        g_prime = (
            (sp_split["p_full_win"] * b) / (1.0 + b * f_star)
            + (sp_split["p_half_win"] * 0.5 * b) / (1.0 + 0.5 * b * f_star)
            - (0.5 * sp_split["p_half_loss"]) / (1.0 - 0.5 * f_star)
            - sp_split["p_full_loss"] / (1.0 - f_star)
        )
        assert abs(g_prime) < 1e-14

        # 3. EV negativo o nulo -> stake 0 exacto
        res_neg = m2w.solve_exact_asian_kelly(sp_split, 1.25)
        assert res_neg["ev"] < 0.0
        assert res_neg["f_full_kelly"] == 0.0
        assert res_neg["stake_raw_u"] == 0.0

    def test_retarget_settlement_probs_preserves_push_and_hits_target(self) -> None:
        mat = m2w.build_dixon_coles_score_matrix(1.50, 1.25, rho=-0.10, max_goals=12)
        base_sp = m2w.derive_selection_settlement_probs(mat, "totals", 2.25, "over")

        # Identidad en p_effective_win original
        same_sp = m2w.retarget_settlement_probs(base_sp, base_sp["p_effective_win"])
        for k in base_sp:
            assert abs(same_sp[k] - base_sp[k]) < 1e-15

        # Retarget a p_final mezclado
        for target in (0.38, 0.52, 0.67):
            rt = m2w.retarget_settlement_probs(base_sp, target)
            assert abs(rt["p_push"] - base_sp["p_push"]) < 1e-15
            assert abs(rt["p_effective_win"] - target) < 1e-14
            tot = rt["p_full_win"] + rt["p_half_win"] + rt["p_push"] + rt["p_half_loss"] + rt["p_full_loss"]
            assert abs(tot - 1.0) < 1e-15

    def test_settle_asian_line_matches_clv_report_exhaustively(self) -> None:
        stake_u = 1.6
        price = 1.92

        for hg in range(5):
            for ag in range(5):
                for ln in m2w.AH_CANONICAL_LINES:
                    for sel in ("home", "away"):
                        res = m2w.settle_asian_line("ah", ln, sel, hg, ag, stake_u, price)
                        cr_out = cr.grade_market_outcome("ah", sel, hg, ag, line=ln)
                        assert res["grade_outcome"] == cr_out
                        assert abs(res["pnl_u"] - cr.settle_pick_pnl(stake_u, price, res["outcome"])) < 1e-15
                        assert abs(res["pnl_u"] - cr.settle_pick_pnl(stake_u, price, cr_out)) < 1e-15

                for ln in m2w.TOTALS_CANONICAL_LINES:
                    for sel in ("over", "under"):
                        res = m2w.settle_asian_line("ou", ln, sel, hg, ag, stake_u, price)
                        cr_out = cr.grade_market_outcome("ou", sel, hg, ag, line=ln)
                        assert res["grade_outcome"] == cr_out
                        assert abs(res["pnl_u"] - cr.settle_pick_pnl(stake_u, price, res["outcome"])) < 1e-15

                for sel in ("home", "away"):
                    res = m2w.settle_asian_line("dnb", None, sel, hg, ag, stake_u, price)
                    cr_out = cr.grade_market_outcome("dnb", sel, hg, ag, line=None)
                    assert res["grade_outcome"] == cr_out
                    assert abs(res["pnl_u"] - cr.settle_pick_pnl(stake_u, price, res["outcome"])) < 1e-15

                for sel in ("yes", "no"):
                    res = m2w.settle_asian_line("btts", None, sel, hg, ag, stake_u, price)
                    cr_out = cr.grade_market_outcome("btts", sel, hg, ag, line=None)
                    assert res["grade_outcome"] == cr_out
                    assert abs(res["pnl_u"] - cr.settle_pick_pnl(stake_u, price, res["outcome"])) < 1e-15


class TestArtifactsAndHoldoutSealing:
    """Valida los artefactos materializados (`markets_2way_eval.json`, `markets_2way_config.json`, `holdout_registry_a6.jsonl`)."""

    def test_holdout_unlock_and_main_registry_are_strictly_blocked(self, tmp_path: Path) -> None:
        with pytest.raises(bt.HoldoutSealedError):
            m2w.run_markets_2way_evaluation(
                eval_out_path=tmp_path / "e.json",
                config_out_path=tmp_path / "c.json",
                registry_path=tmp_path / "reg.jsonl",
                unlock_holdout=True,
            )

        with pytest.raises(m2w.Markets2WayValidationError):
            m2w.run_markets_2way_evaluation(
                eval_out_path=tmp_path / "e.json",
                config_out_path=tmp_path / "c.json",
                registry_path=bt.DEFAULT_REGISTRY_PATH,
                unlock_holdout=False,
            )

    def test_materialized_config_eval_and_registry_integrity(self) -> None:
        assert m2w.DEFAULT_CONFIG_JSON_PATH.exists(), "Falta src/data/prediction/markets_2way_config.json"
        assert m2w.DEFAULT_EVAL_ARTIFACT_PATH.exists(), "Falta services/models/artifacts/markets_2way_eval.json"
        assert m2w.DEFAULT_A6_REGISTRY_PATH.exists(), "Falta services/models/artifacts/holdout_registry_a6.jsonl"

        cfg = json.loads(m2w.DEFAULT_CONFIG_JSON_PATH.read_text(encoding="utf-8"))
        ev = json.loads(m2w.DEFAULT_EVAL_ARTIFACT_PATH.read_text(encoding="utf-8"))
        reg_lines = [
            json.loads(line)
            for line in m2w.DEFAULT_A6_REGISTRY_PATH.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]

        assert cfg["eval_split"] == "walk_forward_dev"
        assert cfg["holdout_sealed_untouched"] is True
        assert ev["eval_split"] == "walk_forward_dev"
        assert ev["unlock_holdout"] is False
        assert len(reg_lines) >= 1
        for entry in reg_lines:
            assert entry["eval_split"] == "walk_forward_dev"
            assert entry["unlock_holdout"] is False

        # Cobertura honesta de 23 ligas × 4 mercados = 92 segmentos
        assert len(cfg["segments"]) == 92
        assert len(ev["segments"]) == 92

        for seg_key, seg in cfg["segments"].items():
            ev_seg = ev["segments"][seg_key]
            assert seg["enabled"] == ev_seg["enabled"]
            if seg["enabled"]:
                assert seg["disabled_reason"] is None
                assert seg["a4_gate_passed"] is True
                assert seg["a3_validation_passed"] is True
                assert seg["w_effective"] > 0.05
                assert seg["n_events_paired_closing_a4"] >= 100
                assert seg["n_picks_oos_a3"] >= 5
                assert seg["clv_pct_mean_oos_a3"] is not None and seg["clv_pct_mean_oos_a3"] > 0.0
                assert ev_seg["log_loss_blend"] < ev_seg["log_loss_market_open_novig"]
                assert ev_seg["log_loss_blend_wf_causal"] < ev_seg["log_loss_market_open_novig"]
            else:
                assert isinstance(seg["disabled_reason"], str) and len(seg["disabled_reason"]) > 0
                assert seg["w_effective"] == 0.0

        # Todos los segmentos de `dnb` y `btts` deben estar explícitamente apagados por ausencia de snapshots liquidados
        for seg_key, seg in cfg["segments"].items():
            if seg["market"] in ("dnb", "btts"):
                assert seg["enabled"] is False
                assert "snapshots" in seg["disabled_reason"]

        # Verificar cobertura documentada de `scraped_ws`
        ws_cov = ev["data_coverage_audit"]["scraped_ws_football_coverage"]
        assert ws_cov["events_in_walk_forward_dev"] == 0
        assert ws_cov["has_settled_historical_outcomes_in_dev"] is False
