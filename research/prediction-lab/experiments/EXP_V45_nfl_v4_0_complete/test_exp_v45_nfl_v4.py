"""Tests de integridad matemática y gobernanza para EXP_V45 (`NFL Minkowski v4.0`)."""

from __future__ import annotations

import json
from pathlib import Path
import sys

import numpy as np

EXP_DIR = Path(__file__).resolve().parent
if str(EXP_DIR) not in sys.path:
    sys.path.insert(0, str(EXP_DIR))

from run_nfl_v4_0_complete import (  # noqa: E402
    KEY_NUMBERS_MODEL_OUT,
    MAX_ABS_MARGIN,
    NFL_PROPS_MODEL_OUT,
    NFL_V4_SNAPSHOT_OUT,
    RESULTS_OUT,
    project_spread_from_margin_pmf_exact,
    solve_nfl_key_number_margin_pmf_exact,
)


def test_nfl_key_number_pmf_exact_1x2_conservation_and_push_spikes() -> None:
    assert KEY_NUMBERS_MODEL_OUT.exists()
    art = json.loads(KEY_NUMBERS_MODEL_OUT.read_text(encoding="utf-8"))
    kern = np.array(art["positive_margin_kernel_1_to_45"], dtype=np.float64)
    # |M|=3 (~14-16%) y |M|=7 (~9-10%) deben ser los dos mayores picos de margen NFL
    assert kern[2] > 0.12
    assert kern[6] > 0.08
    assert kern[2] > kern[1]  # |M|=3 >> |M|=2

    for ph, pt, pa in [(0.64, 0.004, 0.356), (0.21, 0.003, 0.787), (0.88, 0.002, 0.118)]:
        sol = solve_nfl_key_number_margin_pmf_exact(ph, pt, pa, kern)
        pmf = sol["pmf"]
        assert abs(float(np.sum(pmf)) - 1.0) < 1e-13
        s3 = ph + pt + pa
        assert abs(float(np.sum(pmf[MAX_ABS_MARGIN + 1 :])) - ph / s3) < 1e-13
        assert abs(float(pmf[MAX_ABS_MARGIN]) - pt / s3) < 1e-15
        assert abs(float(np.sum(pmf[:MAX_ABS_MARGIN])) - pa / s3) < 1e-13

        sp_m25 = project_spread_from_margin_pmf_exact(pmf, -2.5)
        sp_m30 = project_spread_from_margin_pmf_exact(pmf, -3.0)
        sp_m35 = project_spread_from_margin_pmf_exact(pmf, -3.5)
        assert sp_m30["pPush"] > 0.04
        assert sp_m25["pPush"] == 0.0
        # Salto discreto exacto al cruzar el número clave -3: pHomeCover(-2.5) - pHomeCover(-3.5) == P(Margin == +3)
        assert abs((sp_m25["pHomeCover"] - sp_m35["pHomeCover"]) - float(pmf[MAX_ABS_MARGIN + 3])) < 1e-14


def test_exp_v45_governance_and_pbp_props_validation() -> None:
    assert NFL_PROPS_MODEL_OUT.exists()
    assert NFL_V4_SNAPSHOT_OUT.exists()
    assert RESULTS_OUT.exists()

    res = json.loads(RESULTS_OUT.read_text(encoding="utf-8"))
    assert res["holdout_sealed_untouched"] is True
    assert res["spread_key_numbers_oos_vs_gaussian_v3_5"]["significance"] == "significativa"
    assert res["totals_objective_lines_oos_vs_v3_5"]["significance"] == "significativa"
    assert res["totals_market_posterior_oos_vs_v3_5"]["significance"] == "significativa"
    assert res["totals_market_posterior_oos_vs_v3_5"]["ece"] < 0.030
    for mkt in ("pass_attempts", "completions", "rush_attempts"):
        assert res["player_props_pbp_oos"][mkt]["n_oos"] >= 800
        assert res["player_props_pbp_oos"][mkt]["vs_naive_ewma_poisson"]["delta_ll"] < 0.0
