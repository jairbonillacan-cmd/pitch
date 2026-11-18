"""Tests de integridad matemática y gobernanza para EXP_V44 (`Micro-Markets v4.0`)."""

from __future__ import annotations

import json
from pathlib import Path
import sys

import numpy as np

EXP_DIR = Path(__file__).resolve().parent
REPO_ROOT = EXP_DIR.parents[3]
if str(EXP_DIR) not in sys.path:
    sys.path.insert(0, str(EXP_DIR))

from run_micro_markets_v4_0 import (  # noqa: E402
    MICRO_V4_MODEL_OUT,
    MICRO_V4_SNAPSHOT_OUT,
    OFFICIAL_V4_PRIORS_OUT,
    RESULTS_OUT,
    bivariate_sarmanov_summary_exact,
)


def test_sarmanov_copula_preserves_marginals_and_variance_sign() -> None:
    indep = bivariate_sarmanov_summary_exact(5.6, 4.3, 18.0, 18.0, 25, 0.0, [-1.5, 1.5])
    neg = bivariate_sarmanov_summary_exact(5.6, 4.3, 18.0, 18.0, 25, -0.30, [-1.5, 1.5])
    pos = bivariate_sarmanov_summary_exact(5.6, 4.3, 18.0, 18.0, 25, 0.30, [-1.5, 1.5])

    for b in (indep, neg, pos):
        assert abs(float(np.sum(b["pmf_total"])) - 1.0) < 1e-12
        assert abs((b["p_home_most"] + b["p_tie"] + b["p_away_most"]) - 1.0) < 1e-12

    ks = np.arange(len(indep["pmf_total"]), dtype=np.float64)
    var_indep = float(np.sum(indep["pmf_total"] * ((ks - 9.9) ** 2)))
    var_neg = float(np.sum(neg["pmf_total"] * ((ks - 9.9) ** 2)))
    var_pos = float(np.sum(pos["pmf_total"] * ((ks - 9.9) ** 2)))
    # omega < 0 (asedio de córners) contrae la varianza de H+A; omega > 0 (tarjetas) la expande
    assert var_neg < var_indep < var_pos


def test_exp_v44_artifacts_governance() -> None:
    assert MICRO_V4_MODEL_OUT.exists()
    assert OFFICIAL_V4_PRIORS_OUT.exists()
    assert MICRO_V4_SNAPSHOT_OUT.exists()
    assert RESULTS_OUT.exists()

    art = json.loads(MICRO_V4_MODEL_OUT.read_text(encoding="utf-8"))
    assert art["status"] == "candidate"
    assert art["production_activated"] is False
    assert art["holdout_sealed_untouched"] is True
    assert set(art["metrics"].keys()) == {"corners", "yellow_cards", "fouls", "shots_on_target", "shots"}

    res = json.loads(RESULTS_OUT.read_text(encoding="utf-8"))
    assert res["holdout_sealed_untouched"] is True
    assert res["n_global_officials_tracked"] >= 400
    # Córners y Amarillas deben mejorar Log-Loss frente a EXP_V40 (v3.6)
    assert res["metrics_oos"]["corners"]["vs_v3_6"]["delta_ll"] < 0.0
    assert res["metrics_oos"]["yellow_cards"]["vs_v3_6"]["delta_ll"] < 0.0
