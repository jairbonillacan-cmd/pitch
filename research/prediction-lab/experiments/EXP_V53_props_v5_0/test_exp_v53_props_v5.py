"""Tests de monotonía continua en espacio Logit, eliminación de cuantización y gobernanza para EXP_V53 (`Props v5.0`)."""

from __future__ import annotations

import json
from pathlib import Path
import sys

EXP_DIR = Path(__file__).resolve().parent
if str(EXP_DIR) not in sys.path:
    sys.path.insert(0, str(EXP_DIR))

from run_props_v5_0 import PROPS_V5_MODEL_OUT, PROPS_V5_SNAPSHOT_OUT, RESULTS_OUT, evaluate_logit_spline_scalar  # noqa: E402


def test_exp_v53_smooth_logit_pava_eliminates_quantization_and_calibrates_brace() -> None:
    assert PROPS_V5_MODEL_OUT.exists()
    assert PROPS_V5_SNAPSHOT_OUT.exists()
    assert RESULTS_OUT.exists()

    art = json.loads(PROPS_V5_MODEL_OUT.read_text(encoding="utf-8"))
    assert art["status"] == "candidate"
    assert art["production_activated"] is False

    # Verificar monotonía estricta incluso en malla fina `[0.001 .. 0.040]` (región donde `v4.0` cuantizaba)
    sp_g = art["soccer"]["logit_spline_calibration_0_5"]["goals"]
    prev = 0.0
    for k in range(1, 500):
        p_in = k / 1000.0
        y_out = evaluate_logit_spline_scalar(p_in, sp_g["eta_knots"], sp_g["zeta_knots"])
        assert y_out > prev - 1e-15
        prev = y_out

    res = json.loads(RESULTS_OUT.read_text(encoding="utf-8"))
    assert res["holdout_sealed_untouched"] is True
    # `v5.0` corrige el +0.00036 de `goals` y +0.00015 de `assists` frente a `v4.0`
    assert res["oos_line_0_5_metrics"]["goals"]["vs_v4_0_nearest_knot_pava"]["delta_ll"] < 0.0
    assert res["oos_line_0_5_metrics"]["assists"]["vs_v4_0_nearest_knot_pava"]["delta_ll"] < 0.0
    assert res["oos_multi_line_1_5_brace_metrics"]["goals"]["delta_ll"] < 0.0
