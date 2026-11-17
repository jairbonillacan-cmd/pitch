"""Suite Pytest de verificación matemática, causalidad (`t' < t`), blindaje `< 2025-02-02`
y paridad de serialización para los motores `v3.5` (`EXP_V37` Clubes, `EXP_V38` Selecciones, `EXP_V39` NFL)."""

from __future__ import annotations

import json
from pathlib import Path
import sys

import numpy as np
import pandas as pd

EXP_DIR = Path(__file__).resolve().parent
REPO_ROOT = EXP_DIR.parents[3]
PRED_LAB_ROOT = REPO_ROOT / "research" / "prediction-lab"
EXP_V33_DIR = PRED_LAB_ROOT / "experiments" / "EXP_V33_intl_soccer"
EXP_V34_DIR = PRED_LAB_ROOT / "experiments" / "EXP_V34_club_free_data"
EXP_V39_DIR = PRED_LAB_ROOT / "experiments" / "EXP_V39_nfl_v3_5_engines"

for _p in (str(REPO_ROOT), str(EXP_DIR), str(EXP_V33_DIR), str(EXP_V34_DIR), str(EXP_V39_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from horizon_dc_solver import (  # noqa: E402
    build_dc_score_matrix_exact,
    solve_coherent_dc_3param,
    solve_coherent_dc_3param_batch,
    summarize_dc_markets_from_matrix,
)
from run_club_v3_5_engines import _compute_causal_club_tempo_and_xg_features  # noqa: E402
from club_free_sources import calibrate_statsbomb_p1_1_shot_xg  # noqa: E402


def test_coherent_dc_3param_orthogonality_and_batch_parity() -> None:
    cases = [
        (0.46, 0.27, 0.27, 2.85, -0.11),
        (0.68, 0.19, 0.13, 3.30, -0.10),
        (0.35, 0.32, 0.33, 2.05, -0.13),
        (0.21, 0.24, 0.55, 2.65, -0.09),
        (0.78, 0.14, 0.08, 3.60, -0.08),
    ]
    P_arr = np.array([[c[0], c[1], c[2]] for c in cases], dtype=np.float64)
    T_arr = np.array([c[3] for c in cases], dtype=np.float64)
    R_arr = np.array([c[4] for c in cases], dtype=np.float64)

    lh_b, la_b, rh_b = solve_coherent_dc_3param_batch(P_arr, T_arr, R_arr, rho_shrinkage=0.0)

    for idx, (ph, pd_t, pa, tot_t, rp) in enumerate(cases):
        lh, la, rh = solve_coherent_dc_3param(ph, pd_t, pa, tot_t, rp, rho_shrinkage=0.0)
        assert abs(lh - float(lh_b[idx])) < 1e-13
        assert abs(la - float(la_b[idx])) < 1e-13
        assert abs(rh - float(rh_b[idx])) < 1e-13

        mat = build_dc_score_matrix_exact(lh, la, rh)
        mk = summarize_dc_markets_from_matrix(mat)
        # 1X2 exacto preservado sobre la matriz coherente
        assert abs(mk["p_home"] - ph) < 1e-7
        assert abs(mk["p_draw"] - pd_t) < 1e-7
        assert abs(mk["p_away"] - pa) < 1e-7
        # Dentro del cono físico, `lh + la` reproduce exactamente `tot_t`
        if -0.319 < rh < 0.219:
            assert abs((lh + la) - tot_t) < 1e-9


def test_club_v35_tempo_features_causal_truncation_invariance() -> None:
    sb_cal = calibrate_statsbomb_p1_1_shot_xg(max_matches_sample=180)
    m_df = pd.read_parquet(PRED_LAB_ROOT / "data" / "processed" / "matches.parquet")
    m_df["match_date"] = pd.to_datetime(m_df["match_date"])
    sub = (
        m_df[(m_df["div"] == "E0") & (m_df["match_date"] < pd.Timestamp("2022-06-01")) & m_df["result"].notna()]
        .sort_values(["match_date", "kickoff_time", "match_id"], kind="mergesort")
        .tail(600)
        .reset_index(drop=True)
    )
    full_out = _compute_causal_club_tempo_and_xg_features(sub, sb_cal)
    trunc_out = _compute_causal_club_tempo_and_xg_features(sub.iloc[:350].copy(), sb_cal)

    for col in ("sb_att_def_diff_ewm10", "sb_exp_total_ewm10", "club_tempo_sum_ewm12", "club_btts_rate_sum_ewm15", "club_corners_sum_ewm10"):
        diff = np.max(np.abs(full_out.iloc[:350][col].to_numpy() - trunc_out[col].to_numpy()))
        assert diff == 0.0, f"Fuga temporal detectada en {col}: {diff}"


def test_all_exported_v35_artifacts_respect_candidate_governance() -> None:
    data_dir = REPO_ROOT / "src" / "data" / "prediction"
    required_nfl_files = [
        "gbm_nfl_v3_5_candidate.json",
        "model_nfl_v3_5_candidate.json",
        "model_nfl_totals_v3_5_candidate.json",
    ]
    optional_pending_files = [
        "gbm_club_v3_5_live_candidate.json",
        "model_club_v3_5_live_candidate.json",
        "model_club_goals_v3_5_candidate.json",
        "gbm_intl_soccer_v3_5_candidate.json",
        "model_intl_goals_v3_5_candidate.json",
    ]
    for fname in required_nfl_files:
        assert (data_dir / fname).exists(), f"Falta artefacto requerido {fname}"

    for fname in required_nfl_files + [f for f in optional_pending_files if (data_dir / f).exists()]:
        fpath = data_dir / fname
        obj = json.loads(fpath.read_text(encoding="utf-8"))
        assert obj.get("production_activated") is False, f"{fname} no debe activarse en producción"
        tw = obj.get("training_window")
        if tw is not None:
            assert tw.get("holdout_sealed_untouched") is True
            assert str(tw.get("max_date_exclusive", "")).startswith("2025-02-02")
