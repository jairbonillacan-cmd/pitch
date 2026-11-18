"""Tests de integridad matemática y gobernanza para EXP_V48 (`SGP Copula Engine v4.0`)."""

from __future__ import annotations

import json
from pathlib import Path
import sys

import numpy as np

EXP_DIR = Path(__file__).resolve().parent
if str(EXP_DIR) not in sys.path:
    sys.path.insert(0, str(EXP_DIR))

from run_sgp_copula_experiment import (  # noqa: E402
    RESULTS_OUT,
    SGP_PRIORS_OUT,
    SGP_SNAPSHOT_OUT,
    cholesky_lower_exact,
    evaluate_sgp_copula_scalar,
)


def test_sgp_correlation_matrices_psd_and_frechet_bounds() -> None:
    assert SGP_PRIORS_OUT.exists()
    art = json.loads(SGP_PRIORS_OUT.read_text(encoding="utf-8"))
    for sp_k in ("soccer", "nfl"):
        mat = np.array(art["sports"][sp_k]["correlation_matrix"], dtype=np.float64)
        assert np.allclose(mat, mat.T, atol=1e-12)
        assert np.allclose(np.diag(mat), 1.0, atol=1e-12)
        eigs = np.linalg.eigvalsh(mat)
        assert float(np.min(eigs)) > 0.01
        L = np.array(cholesky_lower_exact(mat.tolist()), dtype=np.float64)
        assert np.allclose(L @ L.T, mat, atol=1e-9)

    # En NFL, Home Win + Home Rush debe aumentar P_joint vs P_indep; Home Win + Home Pass debe reducirla
    pos_ev = evaluate_sgp_copula_scalar(
        "nfl",
        [
            {"legId": "a", "factor": "home_margin", "marginalProbability": 0.60, "direction": 1},
            {"legId": "b", "factor": "home_rush_attempts", "marginalProbability": 0.50, "direction": 1},
        ],
        art,
    )
    neg_ev = evaluate_sgp_copula_scalar(
        "nfl",
        [
            {"legId": "a", "factor": "home_margin", "marginalProbability": 0.60, "direction": 1},
            {"legId": "b", "factor": "home_pass_attempts", "marginalProbability": 0.50, "direction": 1},
        ],
        art,
    )
    assert pos_ev["joint_probability"] > pos_ev["independent_probability"]
    assert neg_ev["joint_probability"] < neg_ev["independent_probability"]


def test_exp_v48_oos_lifts_vs_naive_independence() -> None:
    assert SGP_SNAPSHOT_OUT.exists()
    assert RESULTS_OUT.exists()
    res = json.loads(RESULTS_OUT.read_text(encoding="utf-8"))
    assert res["holdout_sealed_untouched"] is True
    for k, bm in res["oos_benchmarks_vs_naive_independence"].items():
        assert bm["delta_ll"] < 0.0, f"{k} no superó independencia ingenua"
        assert bm["significance"] == "significativa", f"{k} no fue significativa"
