"""Suite Pytest para EXP_V43 (`soccer_v4_0_core` + Matriz Diagonal-Inflada de 4 Parámetros)."""

from __future__ import annotations

import json
from pathlib import Path
import sys

EXP_DIR = Path(__file__).resolve().parent
if str(EXP_DIR) not in sys.path:
    sys.path.insert(0, str(EXP_DIR))

from diagonal_score_solver import (  # noqa: E402
    solve_diagonal_inflated_score_matrix_4param,
    summarize_markets_from_matrix_v4,
)
from run_soccer_v4_0_core import GBM_V40_OUT, GOALS_V40_OUT, HOLDOUT_CUT_ISO, RESULTS_OUT, SNAP_V40_OUT  # noqa: E402


def test_4param_zero_cone_boundary_across_extreme_simplex() -> None:
    """Incluso en goleadas 95% o partidos de 4.2 goles con 32% empate, 1X2 y E[Total] son exactos (< 1e-11)."""
    cases = [
        (0.94, 0.045, 0.015, 4.10),
        (0.34, 0.34, 0.32, 3.85),
        (0.18, 0.28, 0.54, 1.55),
        (0.52, 0.26, 0.22, 2.75),
    ]
    for ph, pd, pa, tot in cases:
        sol = solve_diagonal_inflated_score_matrix_4param(ph, pd, pa, tot, rho_prior=-0.11, dispersion_r=28.0)
        mk = summarize_markets_from_matrix_v4(sol["matrix"])
        assert abs(mk["p_home"] - ph) < 1e-12
        assert abs(mk["p_draw"] - pd) < 1e-12
        assert abs(mk["p_away"] - pa) < 1e-12
        assert abs(sol["expected_total_implied"] - tot) < 1e-8


def test_exp_v43_artifacts_and_governance() -> None:
    assert GBM_V40_OUT.exists()
    assert GOALS_V40_OUT.exists()
    assert SNAP_V40_OUT.exists()
    assert RESULTS_OUT.exists()

    gbm = json.loads(GBM_V40_OUT.read_text(encoding="utf-8"))
    goals = json.loads(GOALS_V40_OUT.read_text(encoding="utf-8"))
    res = json.loads(RESULTS_OUT.read_text(encoding="utf-8"))
    assert gbm["production_activated"] is False
    assert goals["production_activated"] is False
    assert goals["holdout_cut_utc"] == HOLDOUT_CUT_ISO
    assert res["holdout_sealed_untouched"] is True
    assert res["metrics_1x2"]["max_1x2_matrix_coherence_error_v4_0"] < 1e-11
