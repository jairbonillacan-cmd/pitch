"""Tests de integridad matemática y gobernanza para EXP_V50 (`Soccer Global v5.0` + `Meridian v5.0`)."""

from __future__ import annotations

import json
from pathlib import Path
import sys

EXP_DIR = Path(__file__).resolve().parent
if str(EXP_DIR) not in sys.path:
    sys.path.insert(0, str(EXP_DIR))

from run_soccer_v5_0_global import (  # noqa: E402
    GBM_CLUB_V50_OUT,
    GOALS_CLUB_V50_OUT,
    GOALS_INTL_V50_OUT,
    RESULTS_OUT,
    SNAP_V50_OUT,
)


def test_exp_v50_global_22_leagues_and_meridian_4param_governance() -> None:
    assert GBM_CLUB_V50_OUT.exists()
    assert GOALS_CLUB_V50_OUT.exists()
    assert GOALS_INTL_V50_OUT.exists()
    assert SNAP_V50_OUT.exists()
    assert RESULTS_OUT.exists()

    gbm = json.loads(GBM_CLUB_V50_OUT.read_text(encoding="utf-8"))
    assert gbm["production_activated"] is False
    assert len(gbm["div_levels"]) >= 20

    res = json.loads(RESULTS_OUT.read_text(encoding="utf-8"))
    assert res["holdout_sealed_untouched"] is True
    assert res["club_max_1x2_cone_error_v5_0"] < 1e-11
    assert res["meridian_v5_0_international"]["max_1x2_cone_error_v5_0"] < 1e-11
    # Modo B (Microestructura multi-casa + modelo) supera a Pinnacle Apertura en OOS
    assert res["club_mode_b_opening_microstructure_oos_vs_pinnacle_open"]["delta_ll_vs_benchmark"] < 0.0
