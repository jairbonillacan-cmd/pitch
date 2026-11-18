"""Tests de integridad matemática y gobernanza para EXP_V46 (`Hierarchical Props v4.0`)."""

from __future__ import annotations

import json
from pathlib import Path
import sys

EXP_DIR = Path(__file__).resolve().parent
if str(EXP_DIR) not in sys.path:
    sys.path.insert(0, str(EXP_DIR))

from run_props_v4_0 import (  # noqa: E402
    PROPS_V4_MODEL_OUT,
    PROPS_V4_SNAPSHOT_OUT,
    RESULTS_OUT,
    evaluate_isotonic_piecewise_scalar,
)


def test_pava_isotonic_monotonicity_and_unit_bounds() -> None:
    assert PROPS_V4_MODEL_OUT.exists()
    art = json.loads(PROPS_V4_MODEL_OUT.read_text(encoding="utf-8"))
    for fam, spec in art["soccer"]["isotonic_calibration"].items():
        xk = spec["x_knots"]
        yk = spec["y_knots"]
        assert len(xk) == len(yk) == 17
        for i in range(1, len(yk)):
            assert yk[i] >= yk[i - 1], f"No monotonía en {fam}"
        prev = 0.0
        for step in range(101):
            p_in = step / 100.0
            val = evaluate_isotonic_piecewise_scalar(p_in, xk, yk)
            assert 0.001 <= val <= 0.999
            assert val + 1e-15 >= prev
            prev = val


def test_exp_v46_governance_and_ece_improvement() -> None:
    assert PROPS_V4_SNAPSHOT_OUT.exists()
    assert RESULTS_OUT.exists()
    art = json.loads(PROPS_V4_MODEL_OUT.read_text(encoding="utf-8"))
    assert art["status"] == "candidate"
    assert art["production_activated"] is False
    assert art["holdout_sealed_untouched"] is True

    res = json.loads(RESULTS_OUT.read_text(encoding="utf-8"))
    assert set(res["families_evaluated"]) == {
        "goals",
        "assists",
        "goals_assists",
        "yellow_cards",
        "shots",
        "shots_on_target",
    }
    # El ECE del catálogo promovido (>=50%) en yellow_cards cae de ~3.13% por debajo de 1.5%
    assert res["oos_metrics"]["yellow_cards"]["v4_0_promoted_ece_ge_50pct"] < 0.015
    assert res["sub_cover_real_validation_oos"]["empirical_lift_pp"] > 2.0
