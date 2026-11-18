"""Suite Pytest de verificación para EXP_V40 (`soccer_micro_markets` v3.6)."""

from __future__ import annotations

import json
from pathlib import Path
import sys

import numpy as np

EXP_DIR = Path(__file__).resolve().parent
REPO_ROOT = EXP_DIR.parents[3]
if str(EXP_DIR) not in sys.path:
    sys.path.insert(0, str(EXP_DIR))

from run_micro_markets_experiment import (  # noqa: E402
    HOLDOUT_CUT_ISO,
    MICRO_MODEL_OUT,
    MICRO_SNAPSHOT_OUT,
    OFFICIAL_PRIORS_OUT,
    RESULTS_OUT,
    build_dc_matrix_small,
    convolve_pmf_exact,
    line_probs_from_pmf,
    nb_pmf_exact,
)


def test_nb_pmf_and_integer_push_partition() -> None:
    pmf_h = nb_pmf_exact(5.4, 8.5, 25)
    pmf_a = nb_pmf_exact(4.3, 8.5, 25)
    assert abs(float(np.sum(pmf_h)) - 1.0) < 1e-13
    assert abs(float(np.sum(pmf_a)) - 1.0) < 1e-13

    tot = convolve_pmf_exact(pmf_h, pmf_a)
    assert abs(float(np.sum(tot)) - 1.0) < 1e-13

    po_half, pu_half, pp_half = line_probs_from_pmf(tot, 9.5)
    assert pp_half == 0.0
    assert abs((po_half + pu_half) - 1.0) < 1e-13

    po_int, pu_int, pp_int = line_probs_from_pmf(tot, 9.0)
    assert pp_int > 0.0
    assert abs((po_int + pu_int + pp_int) - 1.0) < 1e-13
    assert abs(po_int - po_half) < 1e-13
    assert pu_int < pu_half
    assert (po_int / (1.0 - pp_int)) > po_half


def test_halves_dc_matrix_simplex() -> None:
    mat = build_dc_matrix_small(0.68, 0.52, -0.06, 6)
    assert abs(float(np.sum(mat)) - 1.0) < 1e-13
    assert np.all(mat >= 0.0)


def test_exp_v40_artifacts_governance_and_anti_leakage() -> None:
    assert MICRO_MODEL_OUT.exists(), "Falta model_soccer_micro_v3_6_candidate.json"
    assert OFFICIAL_PRIORS_OUT.exists(), "Falta official_priors_v3_6.json"
    assert MICRO_SNAPSHOT_OUT.exists(), "Falta soccer_micro_v3_6_snapshot.json"
    assert RESULTS_OUT.exists(), "Falta exp_v40_micro_markets_results.json"

    art = json.loads(MICRO_MODEL_OUT.read_text(encoding="utf-8"))
    assert art["status"] == "candidate"
    assert art["production_activated"] is False
    assert art["holdout_sealed_untouched"] is True
    assert art["holdout_cut_utc"] == HOLDOUT_CUT_ISO

    res = json.loads(RESULTS_OUT.read_text(encoding="utf-8"))
    assert res["holdout_sealed_untouched"] is True
    for q in ("corners", "yellow_cards", "fouls", "shots_on_target", "shots"):
        m = res["metrics_oos_2020_2024"][q]
        assert m["mae_pitchlab_v3_6"] < m["mae_static_astra_style"]
        assert m["vs_static_team_nb"]["delta_ll"] < 0.0
        assert m["vs_static_team_nb"]["significance"] == "significativa"
        assert m["vs_scoutpicks_raw_l10"]["delta_ll"] < 0.0
        assert m["vs_scoutpicks_raw_l10"]["significance"] == "significativa"
    assert res["metrics_oos_2020_2024"]["fouls"]["mae_improvement_vs_climatology_pct"] > 3.5
