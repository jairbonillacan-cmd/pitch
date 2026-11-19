"""EXP_V50 (Remediado v5.1) — Fútbol Global `Tachyon v5.1` (`22` Ligas, `68,638` Partidos) + `Meridian v5.1` (`4-Param` sin Doble Inflación) + Benchmark `Power De-Vig` + `club_state_v5_1.json`.

Remediación integral `REM_02` (`A2, B4, D1, D2`) bajo corte estricto `< 2025-02-02T17:30:00Z`:
  1. Elimina la doble inflación `(0-0, 1-1)` del solver 4-Param calibrando `(rho_draw_blend_weight, rho_prior, dispersion_r)`
     en `VAL <= 2019` sobre el Log-Loss conjunto `{O1.5 + O2.5 + O3.5 + BTTS}` tanto en Clubes como en `Meridian` (reportando las 4 líneas).
  2. Explota señales `100%` pobladas ya presentes en `features.parquet` (`pi_diff`, `pi_exp_gd`, `pi_overall_diff`, `att_def_net_diff`,
     `elo_xg_diff`, `lg_home_win_prev`, `lg_avg_total_prev`, `xpts_ewm5_diff`, `pts_minus_xpts_ewm5_diff`, `xgot_diff_r10`,
     `gk_prevented_diff_r10`, `field_tilt_diff_r10`, `draw_rate_sum_r10`), `real_xg_overperf_luck_diff`, EWMA causal rápida de localía
     `div_hfa_ewm` (ruptura HFA post-COVID `-1.50 pp`) y selecciona `half_life` y `C` estrictamente en `VAL <= 2019` (`2015..2019`).
  3. Evalúa `Modo B` con **Power De-Vig** exacto contra `Pinnacle Open (Power De-Vig)` y `Pinnacle Close (Power De-Vig)` usando
     **Cluster Bootstrap por `match_date`** (`services/models/cluster_bootstrap.py`), y reporta desglose `Global 22` + `Tier-1 Flagship`.
  4. Exporta `src/data/prediction/club_state_v5_1.json` desde la cola `< 2025-02-02` para garantizar **`0` train-serve skew** en `REM_01`.
"""

from __future__ import annotations

import os

os.environ.setdefault("OMP_NUM_THREADS", "4")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")

from bisect import bisect_left
from collections import defaultdict
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import sys
from typing import Any

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression, PoissonRegressor
from sklearn.preprocessing import StandardScaler

EXP_DIR = Path(__file__).resolve().parent
REPO_ROOT = EXP_DIR.parents[3]
PRED_LAB_ROOT = REPO_ROOT / "research" / "prediction-lab"
FREE_OPEN_DIR = PRED_LAB_ROOT / "data" / "raw" / "free_open_v33"
EXP_V33_DIR = PRED_LAB_ROOT / "experiments" / "EXP_V33_intl_soccer"
EXP_V34_DIR = PRED_LAB_ROOT / "experiments" / "EXP_V34_club_free_data"
EXP_V37_DIR = PRED_LAB_ROOT / "experiments" / "EXP_V37_club_v3_5_engines"
EXP_V43_DIR = PRED_LAB_ROOT / "experiments" / "EXP_V43_soccer_v4_0_core"
ARTIFACTS_DIR = EXP_DIR / "artifacts"

for _p in (str(REPO_ROOT), str(PRED_LAB_ROOT / "models" / "a"), str(EXP_V34_DIR), str(EXP_V37_DIR), str(EXP_V43_DIR), str(EXP_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from services.models import export_gbm_ts as eg  # noqa: E402
from services.models import outlook_calibration as oc  # noqa: E402
from services.models.cluster_bootstrap import (  # noqa: E402
    cluster_bootstrap_binary,
    cluster_bootstrap_multiclass,
    safe_ece_binary,
)
from club_free_sources import HOLDOUT_CUT_DATE, CausalClubTransfermarktBridge, calibrate_statsbomb_p1_1_shot_xg  # noqa: E402
from club_wave2_sources import CausalClubWave2Bridge  # noqa: E402
from diagonal_score_solver import (  # noqa: E402
    DEFAULT_V4_MAX_GOALS,
    solve_diagonal_inflated_batch_fast,
    solve_diagonal_inflated_score_matrix_4param,
    summarize_markets_from_matrix_v4,
)
from horizon_dc_solver import solve_coherent_dc_3param_batch, summarize_dc_markets_batch  # noqa: E402
from run_club_experiment import (  # noqa: E402
    BOOTSTRAP_SAMPLES,
    BOOTSTRAP_SEED,
    HOLDOUT_CUT_ISO,
    HOLDOUT_CUT_TS,
    MODEL_SEED,
    SB_1_COL,
    TM_6_COLS,
    _compute_statsbomb_ewm_feature,
    _resolve_features_parquet,
)
from run_club_v3_4_experiment import ALL_W2_CLUB_COLS  # noqa: E402
from run_club_v3_5_engines import (  # noqa: E402
    HORIZON_GOALS_13_BASE_COLS,
    LIVE_BASE_38_ORDERED,
    _apply_temperature_3way_exact,
    _blend_3way_exact,
    _compute_causal_club_tempo_and_xg_features,
)

GBM_CLUB_V50_OUT = REPO_ROOT / "src" / "data" / "prediction" / "gbm_club_v5_0_candidate.json"
GOALS_CLUB_V50_OUT = REPO_ROOT / "src" / "data" / "prediction" / "model_club_goals_v5_0_candidate.json"
GOALS_INTL_V50_OUT = REPO_ROOT / "src" / "data" / "prediction" / "model_intl_goals_v5_0_candidate.json"
SNAP_V50_OUT = REPO_ROOT / "src" / "data" / "prediction" / "soccer_v5_0_global_snapshot.json"
CLUB_STATE_V51_OUT = REPO_ROOT / "src" / "data" / "prediction" / "club_state_v5_1.json"
RESULTS_OUT = ARTIFACTS_DIR / "exp_v50_soccer_v5_0_results.json"
TRIAL_REGISTRY_OUT = EXP_DIR / "trial_registry_soccer_v50.jsonl"

FLAGSHIP_TIER1_DIVS = frozenset({"E0", "SP1", "I1", "D1", "F1", "N1", "P1", "MEX"})

V51_CANDIDATE_1X2_EXTRA_COLS: tuple[str, ...] = (
    "pi_diff",
    "pi_exp_gd",
    "pi_overall_diff",
    "att_def_net_diff",
    "elo_xg_diff",
    "lg_home_win_prev",
    "lg_avg_total_prev",
    "div_hfa_ewm",
    "xpts_ewm5_diff",
    "pts_minus_xpts_ewm5_diff",
    "xgot_diff_r10",
    "gk_prevented_diff_r10",
    "field_tilt_diff_r10",
    "draw_rate_sum_r10",
    "real_xg_overperf_luck_diff",
    "underdog_low_block_shield",
    "crowd_hfa_shock",
    "formation_back5_diff",
    "manager_draw_rate_sum",
    "six_pointer_table_tension",
    "sb_att_def_diff_ewm10",
    "club_tempo_sum_ewm12",
)

V51_CANDIDATE_GOALS_EXTRA_COLS: tuple[str, ...] = (
    "div_goals_ewm",
    "att_def_goals_sum",
    "lg_avg_total_prev",
    "formation_back5_sum",
    "manager_tempo_sum",
    "crowd_occupancy_home",
    "six_pointer_table_tension",
)


def power_devig_3way(odds_h: np.ndarray, odds_d: np.ndarray, odds_a: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Exact vectorized Power De-Vig solving sum_i (1/odds_i)^k = 1 for 3-way odds."""
    oh = np.asarray(odds_h, dtype=np.float64)
    od = np.asarray(odds_d, dtype=np.float64)
    oa = np.asarray(odds_a, dtype=np.float64)
    valid = np.isfinite(oh) & np.isfinite(od) & np.isfinite(oa) & (oh > 1.01) & (od > 1.01) & (oa > 1.01)
    q = np.column_stack([
        1.0 / np.where(valid, oh, 2.5),
        1.0 / np.where(valid, od, 3.3),
        1.0 / np.where(valid, oa, 2.8),
    ])
    q = np.clip(q, 1e-6, 0.999999)
    log_q = np.log(q)
    lo = np.full(len(oh), 0.70, dtype=np.float64)
    hi = np.full(len(oh), 1.60, dtype=np.float64)
    for _ in range(44):
        mid = 0.5 * (lo + hi)
        s = np.sum(np.exp(log_q * mid[:, None]), axis=1)
        lo = np.where(s > 1.0, mid, lo)
        hi = np.where(s > 1.0, hi, mid)
    k = 0.5 * (lo + hi)
    p = np.exp(log_q * k[:, None])
    p /= np.sum(p, axis=1, keepdims=True)
    return p, valid


def _is_back5_or_low_block(fmt_raw: Any) -> float:
    if fmt_raw is None or (isinstance(fmt_raw, float) and math.isnan(fmt_raw)):
        return 0.22
    s = str(fmt_raw).strip().lower()
    if not s:
        return 0.22
    if s.startswith("5-"):
        return 1.0
    if s.startswith("3-5-") or s.startswith("3-4-2-1") or s.startswith("3-4-1-2"):
        return 0.65
    return 0.0


def _build_causal_tm_games_timelines() -> dict[int, dict[str, list[Any]]]:
    """Construye líneas de tiempo causales (`date < match_date < 2025-02-02`) por `club_id` desde `tm_games.csv.gz`."""
    tg_p = FREE_OPEN_DIR / "tm_games.csv.gz"
    if not tg_p.exists():
        return {}

    tg = pd.read_csv(
        tg_p,
        usecols=[
            "game_id",
            "date",
            "home_club_id",
            "away_club_id",
            "home_club_goals",
            "away_club_goals",
            "home_club_position",
            "away_club_position",
            "home_club_manager_name",
            "away_club_manager_name",
            "attendance",
            "home_club_formation",
            "away_club_formation",
        ],
    )
    tg["date_str"] = tg["date"].astype(str).str.slice(0, 10)
    tg = tg[(tg["date_str"] >= "2009-01-01") & (tg["date_str"] < HOLDOUT_CUT_DATE)].copy()
    if bool((tg["date_str"] >= HOLDOUT_CUT_DATE).any()):
        raise RuntimeError("HoldoutSealedAccessError en tm_games.csv.gz")
    tg = tg.sort_values(["date_str", "game_id"], kind="mergesort").reset_index(drop=True)

    alpha_f = 2.0 / 9.0
    alpha_m = 2.0 / 19.0
    club_back5: dict[int, float] = {}
    club_peak_att: dict[int, float] = {}
    club_occ_ewm: dict[int, float] = {}
    club_last_mgr: dict[int, str] = {}
    club_last_pos: dict[int, float] = {}

    mgr_tempo_ewm: dict[str, float] = {}
    mgr_draw_ewm: dict[str, float] = {}

    timelines: dict[int, dict[str, list[Any]]] = defaultdict(
        lambda: {"dates": [], "back5": [], "occ": [], "mgr_tempo": [], "mgr_draw": [], "pos": []}
    )

    for r in tg.itertuples(index=False):
        if pd.isna(r.home_club_id) or pd.isna(r.away_club_id):
            continue
        hc = int(r.home_club_id)
        ac = int(r.away_club_id)
        ds = str(r.date_str)
        hg = float(r.home_club_goals) if pd.notna(r.home_club_goals) else float("nan")
        ag = float(r.away_club_goals) if pd.notna(r.away_club_goals) else float("nan")
        if not (math.isfinite(hg) and math.isfinite(ag)):
            continue

        b5_h_obs = _is_back5_or_low_block(r.home_club_formation)
        b5_a_obs = _is_back5_or_low_block(r.away_club_formation)
        club_back5[hc] = alpha_f * b5_h_obs + (1.0 - alpha_f) * club_back5.get(hc, 0.22)
        club_back5[ac] = alpha_f * b5_a_obs + (1.0 - alpha_f) * club_back5.get(ac, 0.22)

        if pd.notna(r.attendance) and float(r.attendance) >= 0.0:
            att_v = float(r.attendance)
            pk = max(att_v, 0.995 * club_peak_att.get(hc, max(att_v, 12000.0)), 5000.0)
            club_peak_att[hc] = pk
            occ_obs = min(max(att_v / pk, 0.01), 1.05)
            club_occ_ewm[hc] = 0.35 * occ_obs + 0.65 * club_occ_ewm.get(hc, 0.82)

        tot_g = min(hg + ag, 10.0)
        is_dr = 1.0 if abs(hg - ag) < 1e-6 else 0.0
        for cid, m_raw, pos_raw in [
            (hc, r.home_club_manager_name, r.home_club_position),
            (ac, r.away_club_manager_name, r.away_club_position),
        ]:
            m_nm = str(m_raw).strip() if pd.notna(m_raw) and str(m_raw).strip() else ""
            if m_nm:
                club_last_mgr[cid] = m_nm
                mgr_tempo_ewm[m_nm] = alpha_m * tot_g + (1.0 - alpha_m) * mgr_tempo_ewm.get(m_nm, 2.68)
                mgr_draw_ewm[m_nm] = alpha_m * is_dr + (1.0 - alpha_m) * mgr_draw_ewm.get(m_nm, 0.25)
            if pd.notna(pos_raw) and 1.0 <= float(pos_raw) <= 24.0:
                club_last_pos[cid] = float(pos_raw)

            cur_mgr = club_last_mgr.get(cid, "")
            tl = timelines[cid]
            tl["dates"].append(ds)
            tl["back5"].append(club_back5[cid])
            tl["occ"].append(club_occ_ewm.get(cid, 0.82))
            tl["mgr_tempo"].append(mgr_tempo_ewm.get(cur_mgr, 2.68) if cur_mgr else 2.68)
            tl["mgr_draw"].append(mgr_draw_ewm.get(cur_mgr, 0.25) if cur_mgr else 0.25)
            tl["pos"].append(club_last_pos.get(cid, 10.0))

    return dict(timelines)


def _compute_causal_real_xg_luck(df: pd.DataFrame, ht_col: str, at_col: str) -> tuple[np.ndarray, dict[str, float]]:
    """Calcula `has_real_xg * real_xg_overperf_luck_diff` estrictamente causal (`t' < t < 2025-02-02`) desde `ws_soccer_match_xg`."""
    xg_p = PRED_LAB_ROOT / "data" / "processed" / "web_scraping" / "ws_soccer_match_xg_2018_2026.parquet"
    n = len(df)
    out = np.zeros(n, dtype=np.float64)
    if not xg_p.exists():
        return out, {}

    xg = pd.read_parquet(xg_p, columns=["match_id", "div", "match_date", "home_team", "away_team", "home_goals", "away_goals", "real_home_xg", "real_away_xg"])
    xg["date_str"] = xg["match_date"].astype(str).str.slice(0, 10)
    xg = xg[xg["date_str"] < HOLDOUT_CUT_DATE].copy()
    if bool((xg["date_str"] >= HOLDOUT_CUT_DATE).any()):
        raise RuntimeError("HoldoutSealedAccessError en ws_soccer_match_xg")
    xg = xg.sort_values(["date_str", "match_id"], kind="mergesort").reset_index(drop=True)

    alpha = 2.0 / 9.0
    luck_ewm: dict[str, float] = {}
    cnt_xg: dict[str, int] = defaultdict(int)
    pre_by_mid: dict[str, float] = {}

    for r in xg.itertuples(index=False):
        kh = f"{r.div}::{r.home_team}"
        ka = f"{r.div}::{r.away_team}"
        lh = luck_ewm.get(kh, 0.0)
        la = luck_ewm.get(ka, 0.0)
        has_both = 1.0 if (cnt_xg[kh] >= 3 and cnt_xg[ka] >= 3) else (0.5 if (cnt_xg[kh] >= 3 or cnt_xg[ka] >= 3) else 0.0)
        pre_by_mid[str(r.match_id)] = has_both * (lh - la)

        if pd.notna(r.real_home_xg) and pd.notna(r.real_away_xg) and pd.notna(r.home_goals) and pd.notna(r.away_goals):
            obs_h = (float(r.home_goals) - float(r.real_home_xg)) - (float(r.away_goals) - float(r.real_away_xg))
            luck_ewm[kh] = alpha * obs_h + (1.0 - alpha) * luck_ewm.get(kh, 0.0)
            luck_ewm[ka] = alpha * (-obs_h) + (1.0 - alpha) * luck_ewm.get(ka, 0.0)
            cnt_xg[kh] += 1
            cnt_xg[ka] += 1

    mids = df["match_id"].astype(str).tolist()
    for i, mid in enumerate(mids):
        if mid in pre_by_mid:
            out[i] = pre_by_mid[mid]
    return out, {k: round(v, 6) for k, v in luck_ewm.items() if cnt_xg[k] >= 3}


def _evaluate_binary_market_cluster(
    cluster_ids: np.ndarray,
    y_pos: np.ndarray,
    p_cand: np.ndarray,
    p_bench: np.ndarray,
    seed: int = BOOTSTRAP_SEED,
) -> dict[str, Any]:
    cb = cluster_bootstrap_binary(cluster_ids, y_pos, p_cand, p_bench, n_resamples=BOOTSTRAP_SAMPLES, seed=seed)
    ece = safe_ece_binary(y_pos, p_cand, n_bins=10)
    bias = float(np.mean(p_cand) - np.mean(y_pos)) if len(y_pos) > 0 else None
    bench_bias = float(np.mean(p_bench) - np.mean(y_pos)) if len(y_pos) > 0 else None
    sig = "significant_improvement" if cb["significant_improvement"] else (
        "significant_degradation" if (cb["ci95_lo"] is not None and cb["ci95_lo"] > 0.0) else "not_significant"
    )
    return {
        **cb,
        "log_loss": cb["logloss_cand"],
        "benchmark_log_loss": cb["logloss_bench"],
        "delta_ll_vs_benchmark": cb["delta_logloss"],
        "ece": round(ece, 6) if ece is not None else None,
        "bias_pp": round(bias * 100.0, 4) if bias is not None else None,
        "benchmark_bias_pp": round(bench_bias * 100.0, 4) if bench_bias is not None else None,
        "significance": sig,
    }


def _evaluate_meridian_v5_4param() -> dict[str, Any]:
    """Migra `Meridian` (`Selecciones`, `n = 12,904`) al solver 4-Param sin doble inflación y reporta las 4 líneas (`O1.5/O2.5/O3.5/BTTS`)."""
    sys.modules.pop("run_experiment", None)
    if str(EXP_V33_DIR) not in sys.path:
        sys.path.insert(0, str(EXP_V33_DIR))

    from intl_causal_features import REGIME_DC_RHO  # noqa: E402
    from intl_ingest import FIRST_EVAL_YEAR, MODERN_TRAIN_MIN_YEAR, VAL_MAX_YEAR, load_intl_matches_dev  # noqa: E402
    from run_ablation_v2 import build_intl_v2_causal_dataset  # noqa: E402
    from run_meridian_v3_experiment import attach_wave2_intl_features  # noqa: E402
    from run_meridian_v3_5_engines import INTL_V2_49_COLS, INTL_V3_53_COLS, extract_intl_goals_features_from_v2_matrix  # noqa: E402

    gbm_intl_v35 = json.loads((REPO_ROOT / "src" / "data" / "prediction" / "gbm_intl_soccer_v3_5_candidate.json").read_text(encoding="utf-8"))
    goals_intl_v35 = json.loads((REPO_ROOT / "src" / "data" / "prediction" / "model_intl_goals_v3_5_candidate.json").read_text(encoding="utf-8"))

    raw_intl_df, _ = load_intl_matches_dev(force_download=False)
    v2_df, _ = build_intl_v2_causal_dataset(
        raw_intl_df,
        enforce_before_holdout=True,
        max_source_date_exclusive=HOLDOUT_CUT_DATE,
    )
    v3_df, _, _ = attach_wave2_intl_features(
        v2_df,
        max_date_exclusive=HOLDOUT_CUT_DATE,
        max_wb_year_inclusive=2024,
    )
    df_i = v3_df[v3_df["year"] >= MODERN_TRAIN_MIN_YEAR].copy().reset_index(drop=True)
    X_goals_all = extract_intl_goals_features_from_v2_matrix(df_i[list(INTL_V2_49_COLS)].to_numpy(dtype=np.float64))

    eval_years = sorted(y for y in df_i["year"].unique() if int(y) >= FIRST_EVAL_YEAR)
    sel_cols = list(gbm_intl_v35["features"] if "features" in gbm_intl_v35 else INTL_V3_53_COLS)
    base_cols = [c for c in sel_cols if not c.startswith("div_")]
    div_lv = list(gbm_intl_v35["div_levels"])
    cal = gbm_intl_v35["calibration"]
    c_reg = float(gbm_intl_v35["logit_companion"].get("regularization_C", gbm_intl_v35["logit_companion"].get("regularization_c", 0.05)))

    P_oof_l: list[np.ndarray] = []
    T_oof_l: list[np.ndarray] = []
    meta_l: list[pd.DataFrame] = []

    hgb_p = {
        "max_depth": 3,
        "max_leaf_nodes": 9,
        "min_samples_leaf": 90,
        "learning_rate": 0.035,
        "max_iter": 115,
        "l2_regularization": 12.0,
        "early_stopping": False,
        "random_state": MODEL_SEED,
    }

    years_i = df_i["year"].to_numpy(dtype=int)
    for yr in eval_years:
        tr_m = years_i < int(yr)
        te_m = years_i == int(yr)
        tr = df_i.loc[tr_m]
        te = df_i.loc[te_m]
        if len(tr) < 400 or len(te) == 0:
            continue
        y_tr = tr["y"].to_numpy(dtype=np.int64)
        dum_tr = np.column_stack([(tr["div"].astype(str).to_numpy() == lv).astype(np.float64) for lv in div_lv])
        dum_te = np.column_stack([(te["div"].astype(str).to_numpy() == lv).astype(np.float64) for lv in div_lv])
        X_tr = np.hstack([tr[base_cols].to_numpy(dtype=np.float64), dum_tr])
        X_te = np.hstack([te[base_cols].to_numpy(dtype=np.float64), dum_te])

        imp = SimpleImputer(strategy="median").fit(X_tr)
        sc = StandardScaler().fit(imp.transform(X_tr))
        sc.scale_ = np.where(sc.scale_ == 0.0, 1.0, sc.scale_)
        lr = LogisticRegression(C=c_reg, max_iter=800).fit(sc.transform(imp.transform(X_tr)), y_tr)
        pl = lr.predict_proba(sc.transform(imp.transform(X_te)))
        hgb = HistGradientBoostingClassifier(**hgb_p).fit(X_tr, y_tr)
        pg = _apply_temperature_3way_exact(hgb.predict_proba(X_te), float(cal["temperature"]))
        P_oof_l.append(_blend_3way_exact(pl, pg, float(cal["w_logit"]), float(cal["w_gbm"]), str(cal["blend_space"])))

        Xg_tr = np.hstack([X_goals_all[tr_m], dum_tr])
        Xg_te = np.hstack([X_goals_all[te_m], dum_te])
        impg = SimpleImputer(strategy="median").fit(Xg_tr)
        scg = StandardScaler().fit(impg.transform(Xg_tr))
        scg.scale_ = np.where(scg.scale_ == 0.0, 1.0, scg.scale_)
        tot_tr = np.clip((tr["home_goals"] + tr["away_goals"]).to_numpy(dtype=np.float64), 0.0, 15.0)
        prg = PoissonRegressor(alpha=0.10, max_iter=800).fit(scg.transform(impg.transform(Xg_tr)), tot_tr)
        T_oof_l.append(np.clip(prg.predict(scg.transform(impg.transform(Xg_te))), 0.45, 7.5))
        date_col = "date" if "date" in te.columns else "match_date"
        meta_l.append(te[[date_col, "div", "year", "home_goals", "away_goals"]].rename(columns={date_col: "date_str"}).copy())

    P_intl = np.vstack(P_oof_l)
    T_intl = np.concatenate(T_oof_l)
    m_intl = pd.concat(meta_l, ignore_index=True)
    m_intl["date_str"] = m_intl["date_str"].astype(str).str.slice(0, 10)
    val_i = m_intl["year"].to_numpy(dtype=int) <= VAL_MAX_YEAR
    oos_i = m_intl["year"].to_numpy(dtype=int) > VAL_MAX_YEAR
    hg_i = m_intl["home_goals"].to_numpy(dtype=np.float64)
    ag_i = m_intl["away_goals"].to_numpy(dtype=np.float64)
    tot_i = hg_i + ag_i
    y15_i = (tot_i >= 2).astype(np.float64)
    y25_i = (tot_i >= 3).astype(np.float64)
    y35_i = (tot_i >= 4).astype(np.float64)
    ybtts_i = ((hg_i >= 1) & (ag_i >= 1)).astype(np.float64)
    rp_i = np.array([float(REGIME_DC_RHO.get(str(d), -0.095)) for d in m_intl["div"].tolist()], dtype=np.float64)
    clusters_i = m_intl["date_str"].to_numpy()

    lh35, la35, rh35 = solve_coherent_dc_3param_batch(P_intl, T_intl, rp_i)
    mk35 = summarize_dc_markets_batch(lh35, la35, rh35)
    cone_err_v35 = float(np.max(np.abs(np.column_stack([mk35["p_home"], mk35["p_draw"], mk35["p_away"]]) - P_intl)))

    # Búsqueda 2-etapas sobre Joint 4-Market Log-Loss en VAL <= 2019 eliminando doble inflación
    def _eval_meridian_jll(w_rb: float, r_shift: float, r_try: float) -> float:
        rp_try = np.clip(rp_i[val_i] + r_shift, -0.20, 0.15)
        mv = solve_diagonal_inflated_batch_fast(
            P_intl[val_i], T_intl[val_i], rp_try, dispersion_r=r_try, max_goals=9, rho_draw_blend_weight=w_rb
        )
        sc_v = 0.0
        for yv, pv in ((y15_i[val_i], mv["p_over_1_5"]), (y25_i[val_i], mv["p_over_2_5"]), (y35_i[val_i], mv["p_over_3_5"]), (ybtts_i[val_i], mv["p_btts_yes"])):
            pc = np.clip(pv, 1e-12, 1.0 - 1e-12)
            sc_v += float(np.mean(-(yv * np.log(pc) + (1.0 - yv) * np.log(1.0 - pc))))
        return sc_v

    best_wrb_i, best_rshift_i, best_r_i = 0.0, 0.0, 24.0
    best_sc_i = float("inf")
    for w_rb in (0.0, 0.25, 0.5, 0.7):
        for r_shift in (0.0, 0.06, 0.12):
            sc_v = _eval_meridian_jll(w_rb, r_shift, 24.0)
            if sc_v < best_sc_i:
                best_sc_i = sc_v
                best_wrb_i, best_rshift_i = w_rb, r_shift
    best_r_sc_i = float("inf")
    for r_try in (16.0, 24.0, 45.0, 100.0, 500.0):
        sc_v = _eval_meridian_jll(best_wrb_i, best_rshift_i, r_try)
        if sc_v < best_r_sc_i:
            best_r_sc_i = sc_v
            best_r_i = r_try
    sel_wrb_i, sel_rshift_i = best_wrb_i, best_rshift_i
    rp_eff_i = np.clip(rp_i + sel_rshift_i, -0.20, 0.15)
    mk51 = solve_diagonal_inflated_batch_fast(
        P_intl, T_intl, rp_eff_i, dispersion_r=best_r_i, rho_draw_blend_weight=sel_wrb_i
    )
    cone_err_v50 = float(np.max(np.abs(np.column_stack([mk51["p_home"], mk51["p_draw"], mk51["p_away"]]) - P_intl)))

    ev_o15_i = _evaluate_binary_market_cluster(clusters_i, y15_i, mk51["p_over_1_5"], mk35["p_over_1_5"], seed=BOOTSTRAP_SEED)
    ev_o25_i = _evaluate_binary_market_cluster(clusters_i, y25_i, mk51["p_over_2_5"], mk35["p_over_2_5"], seed=BOOTSTRAP_SEED + 1)
    ev_o35_i = _evaluate_binary_market_cluster(clusters_i, y35_i, mk51["p_over_3_5"], mk35["p_over_3_5"], seed=BOOTSTRAP_SEED + 2)
    ev_btts_i = _evaluate_binary_market_cluster(clusters_i, ybtts_i, mk51["p_btts_yes"], mk35["p_btts_yes"], seed=BOOTSTRAP_SEED + 3)

    ev_o25_i_oos = _evaluate_binary_market_cluster(clusters_i[oos_i], y25_i[oos_i], mk51["p_over_2_5"][oos_i], mk35["p_over_2_5"][oos_i], seed=BOOTSTRAP_SEED + 11)
    ev_btts_i_oos = _evaluate_binary_market_cluster(clusters_i[oos_i], ybtts_i[oos_i], mk51["p_btts_yes"][oos_i], mk35["p_btts_yes"][oos_i], seed=BOOTSTRAP_SEED + 13)

    goals_intl_v50 = dict(goals_intl_v35)
    goals_intl_v50.update(
        {
            "schema_version": "diagonal_goals_v5.1.0",
            "type": "poisson_log_link_4param_diagonal_nb_dc",
            "codename": "PitchLab Meridian Horizon-Goals v5.1 Diagonal-NB (No-Double-Inflation)",
            "version": "5.1.0-candidate",
            "status": "candidate",
            "production_activated": False,
            "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "dispersion_r": float(best_r_i),
            "rho_draw_blend_weight": float(sel_wrb_i),
            "rho_prior_shift": float(sel_rshift_i),
        }
    )
    GOALS_INTL_V50_OUT.write_text(json.dumps(goals_intl_v50, indent=2), encoding="utf-8")

    print(
        f"\n=== MERIDIAN v5.1 SELECCIONES (n={len(tot_i):,}, r_disp={best_r_i}, w_rho_blend={sel_wrb_i}, rho_shift={sel_rshift_i:+.2f}) ===\n"
        f"  Max 1X2 Coherence Error: v3.5={cone_err_v35:.3e} -> v5.1={cone_err_v50:.3e}\n"
        f"  Totals 1.5 vs v3.5: dLL={ev_o15_i['delta_ll_vs_benchmark']:+.5f} ({ev_o15_i['significance']}) | bias={ev_o15_i['bias_pp']:+.2f}pp\n"
        f"  Totals 2.5 vs v3.5: dLL={ev_o25_i['delta_ll_vs_benchmark']:+.5f} ({ev_o25_i['significance']}) | bias={ev_o25_i['bias_pp']:+.2f}pp (OOS dLL={ev_o25_i_oos['delta_ll_vs_benchmark']:+.5f})\n"
        f"  Totals 3.5 vs v3.5: dLL={ev_o35_i['delta_ll_vs_benchmark']:+.5f} ({ev_o35_i['significance']}) | bias={ev_o35_i['bias_pp']:+.2f}pp\n"
        f"  BTTS       vs v3.5: dLL={ev_btts_i['delta_ll_vs_benchmark']:+.5f} ({ev_btts_i['significance']}) | bias={ev_btts_i['bias_pp']:+.2f}pp (OOS dLL={ev_btts_i_oos['delta_ll_vs_benchmark']:+.5f})"
    )
    return {
        "n_matches": int(len(tot_i)),
        "selected_dispersion_r": float(best_r_i),
        "selected_rho_draw_blend_weight": float(sel_wrb_i),
        "selected_rho_prior_shift": float(sel_rshift_i),
        "max_1x2_cone_error_v3_5": cone_err_v35,
        "max_1x2_cone_error_v5_0": cone_err_v50,
        "totals_1_5_vs_v3_5": ev_o15_i,
        "totals_2_5_vs_v3_5": ev_o25_i,
        "totals_2_5_oos_vs_v3_5": ev_o25_i_oos,
        "totals_3_5_vs_v3_5": ev_o35_i,
        "btts_vs_v3_5": ev_btts_i,
        "btts_oos_vs_v3_5": ev_btts_i_oos,
    }


def _export_club_state_v5_1(
    df: pd.DataFrame,
    ht_col: str,
    at_col: str,
    div_hfa_last: dict[str, float],
    div_goals_last: dict[str, float],
    div_ewm_log_val: dict[str, float],
    div_ewm_xi_val: dict[str, float],
    tm_bridge: CausalClubTransfermarktBridge,
    w2_bridge: CausalClubWave2Bridge,
    tm_timelines: dict[int, dict[str, list[Any]]],
    xg_luck_last: dict[str, float],
    selected_1x2_features: list[str],
    selected_goals_features: list[str],
) -> dict[str, Any]:
    """Exporta estado pre-holdout (`< 2025-02-02`) exacto por club para cero train-serve skew en `REM_01`."""
    clubs: dict[str, dict[str, Any]] = {}
    div_lg_prev: dict[str, dict[str, float]] = {}

    def _f(v: Any, d: float = 0.0) -> float:
        try:
            fv = float(v)
            return fv if math.isfinite(fv) else d
        except (TypeError, ValueError):
            return d

    # Recorrer cronológicamente los partidos recientes (`sstart >= 2021`) para capturar el último estado post-partido real
    recent = df[df["sstart"] >= 2021].sort_values(["match_date", "match_id"], kind="mergesort")
    last_ord = int(recent["match_date"].max().toordinal()) if len(recent) > 0 else 739280
    last_ds = str(recent["match_date"].max().strftime("%Y-%m-%d")) if len(recent) > 0 else "2025-02-01"

    for row in recent.itertuples(index=False):
        dv = str(row.div)
        if pd.notna(getattr(row, "lg_home_win_prev", np.nan)) and pd.notna(getattr(row, "lg_avg_total_prev", np.nan)):
            div_lg_prev[dv] = {
                "lg_home_win_prev": round(_f(row.lg_home_win_prev, 0.445), 6),
                "lg_avg_total_prev": round(_f(row.lg_avg_total_prev, 1.48), 6),
            }

        ht = str(getattr(row, ht_col))
        at = str(getattr(row, at_col))
        ds = str(row.match_date)[:10]

        for is_h, team in ((True, ht), (False, at)):
            key = f"{dv}::{team}"
            pfx = "h_" if is_h else "a_"
            elo_v = _f(getattr(row, "elo_home_post" if is_h else "elo_away_post", np.nan), _f(getattr(row, "elo_home" if is_h else "elo_away", 1500.0), 1500.0))
            celo_v = _f(getattr(row, "clubelo_home_post" if is_h else "clubelo_away_post", np.nan), elo_v)
            exg_v = _f(getattr(row, "elo_xg_home_post" if is_h else "elo_xg_away_post", np.nan), 1525.0)
            att_v = _f(getattr(row, "att_h_post" if is_h else "att_a_post", 0.0), 0.0)
            def_v = _f(getattr(row, "def_h_post" if is_h else "def_a_post", 0.0), 0.0)
            pi_h = _f(getattr(row, "pi_hh_post" if is_h else "pi_ah_post", 0.0), 0.0)
            pi_a = _f(getattr(row, "pi_ha_post" if is_h else "pi_aa_post", 0.0), 0.0)
            eg_cnt = _f(getattr(row, "elo_games_home" if is_h else "elo_games_away", 30.0), 30.0)

            prev = clubs.get(key, {})
            clubs[key] = {
                "div": dv,
                "team": team,
                "last_match_date": ds,
                "elo": round(elo_v, 4),
                "clubelo": round(celo_v, 4),
                "elo_xg": round(exg_v, 4),
                "elo_games": int(max(1, round(eg_cnt + 1))),
                "att_strength": round(att_v, 6),
                "def_strength": round(def_v, 6),
                "pi_home": round(pi_h, 6),
                "pi_away": round(pi_a, 6),
                "xgd_r5": round(_f(getattr(row, f"{pfx}xgd_r5", prev.get("xgd_r5", 0.0))), 6),
                "xgd_r10": round(_f(getattr(row, f"{pfx}xgd_r10", prev.get("xgd_r10", 0.0))), 6),
                "xgd_ewm5": round(_f(getattr(row, f"{pfx}xgd_ewm5", prev.get("xgd_ewm5", 0.0))), 6),
                "xg_overperf_r5": round(_f(getattr(row, f"{pfx}xg_overperf_r5", prev.get("xg_overperf_r5", 0.0))), 6),
                "venue_xgd_r5": round(_f(getattr(row, f"{pfx}venue_xgd_r5", prev.get("venue_xgd_r5", 0.0))), 6),
                "clinical_overperf_r10": round(_f(getattr(row, f"{pfx}clinical_overperf_r10", prev.get("clinical_overperf_r10", 0.0))), 6),
                "has_real_xg": round(_f(getattr(row, f"{pfx}has_real_xg_r10", prev.get("has_real_xg", 0.0))), 4),
                "xpts_r10": round(_f(getattr(row, f"{pfx}xpts_r10", prev.get("xpts_r10", 1.35))), 6),
                "xpts_ewm5": round(_f(getattr(row, f"{pfx}xpts_ewm5", prev.get("xpts_ewm5", 1.35))), 6),
                "pts_minus_xpts_r10": round(_f(getattr(row, f"{pfx}pts_minus_xpts_r10", prev.get("pts_minus_xpts_r10", 0.0))), 6),
                "pts_minus_xpts_ewm5": round(_f(getattr(row, f"{pfx}pts_minus_xpts_ewm5", prev.get("pts_minus_xpts_ewm5", 0.0))), 6),
                "ppda_r10": round(_f(getattr(row, f"{pfx}ppda_avg_r10", prev.get("ppda_r10", 11.5))), 6),
                "deep_completions_r10": round(_f(getattr(row, f"{pfx}deep_completions_r10", prev.get("deep_completions_r10", 5.5))), 6),
                "xgot_r10": round(_f(getattr(row, f"{pfx}xgot_r10", prev.get("xgot_r10", 1.25))), 6),
                "gk_prevented_r10": round(_f(getattr(row, f"{pfx}gk_prevented_r10", prev.get("gk_prevented_r10", 0.0))), 6),
                "field_tilt_r10": round(_f(getattr(row, f"{pfx}field_tilt_r10", prev.get("field_tilt_r10", 0.5))), 6),
                "draw_r10": round(_f(getattr(row, f"{pfx}draw_r10", prev.get("draw_r10", 0.26))), 6),
                "real_xg_luck": round(float(xg_luck_last.get(key, 0.0)), 6),
            }

    # Adjuntar estado Transfermarkt / Wave2 / Formaciones / DT / Aforo estrictamente `< 2025-02-02`
    for key, st in clubs.items():
        dv = st["div"]
        team = st["team"]
        th = tm_bridge.lookup_prematch_club_tm(dv, team, last_ord + 1, st["elo"])
        cid = tm_bridge.resolve_club_id(dv, team)
        w2 = w2_bridge.lookup_club_wave2(cid, last_ord + 1)
        b5, occ, mt, md, pos = 0.22, 0.82, 2.68, 0.25, 10.0
        if cid and cid in tm_timelines:
            tl = tm_timelines[cid]
            idx = bisect_left(tl["dates"], last_ds) - 1
            if idx >= 0:
                b5, occ, mt, md, pos = tl["back5"][idx], tl["occ"][idx], tl["mgr_tempo"][idx], tl["mgr_draw"][idx], tl["pos"][idx]
        st.update(
            {
                "tm_club_id": cid,
                "tm_has_val": round(float(th["tm_has_val"]), 4),
                "tm_raw_log_val": round(float(th["tm_raw_log_val"]), 6),
                "tm_depth_ratio": round(float(th["tm_depth_ratio"]), 6),
                "tm_new_mgr_flag": round(float(th["tm_new_mgr_flag"]), 4),
                "tm_mgr_pae": round(float(th["tm_mgr_pae"]), 6),
                "midweek_cup_load": round(float(w2["midweek_cup_load"]), 4),
                "games_14d_allcomps": round(float(w2["games_14d_allcomps"]), 4),
                "has_realized_xi": round(float(w2["has_realized_xi"]), 4),
                "realized_xi_log_val": round(float(w2["realized_xi_log_val"]), 6),
                "injury_avail_ratio": round(float(w2["injury_avail_ratio"]), 6),
                "xi_ga90_allcomps": round(float(w2["xi_ga90_allcomps"]), 6),
                "net_transfer_val_120d": round(float(w2["net_transfer_val_120d"]), 6),
                "inbound_fee_120d": round(float(w2["inbound_fee_120d"]), 6),
                "formation_back5": round(float(b5), 6),
                "crowd_occ": round(float(occ), 6),
                "mgr_tempo": round(float(mt), 6),
                "mgr_draw": round(float(md), 6),
                "table_pos": round(float(pos), 2),
            }
        )

    payload = {
        "schema_version": "club_state_v5.1.0",
        "as_of_cutoff_iso": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "n_clubs": len(clubs),
        "selected_1x2_features": selected_1x2_features,
        "selected_goals_features": selected_goals_features,
        "div_hfa_ewm": {k: round(v, 6) for k, v in sorted(div_hfa_last.items())},
        "div_goals_ewm": {k: round(v, 6) for k, v in sorted(div_goals_last.items())},
        "div_ewm_log_val": {k: round(v, 6) for k, v in sorted(div_ewm_log_val.items())},
        "div_ewm_xi_val": {k: round(v, 6) for k, v in sorted(div_ewm_xi_val.items())},
        "div_lg_prev": {k: v for k, v in sorted(div_lg_prev.items())},
        "clubs": dict(sorted(clubs.items())),
    }
    CLUB_STATE_V51_OUT.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    return {"n_clubs": len(clubs), "sha256": hashlib.sha256(CLUB_STATE_V51_OUT.read_bytes()).hexdigest()}


def main() -> None:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    intl_res = _evaluate_meridian_v5_4param()
    sb_cal = calibrate_statsbomb_p1_1_shot_xg(max_matches_sample=180)
    tm_timelines = _build_causal_tm_games_timelines()

    matches_p = PRED_LAB_ROOT / "data" / "processed" / "matches.parquet"
    feats_p = _resolve_features_parquet()

    m_df = pd.read_parquet(matches_p)
    m_df["match_date"] = pd.to_datetime(m_df["match_date"])
    m_df = m_df[(m_df["match_date"] < HOLDOUT_CUT_TS) & m_df["result"].notna()].copy()
    if bool((m_df["match_date"] >= HOLDOUT_CUT_TS).any()):
        raise RuntimeError("HoldoutSealedAccessError en EXP_V50")

    f_df = pd.read_parquet(feats_p)
    f_df["match_date"] = pd.to_datetime(f_df["match_date"])
    f_df = f_df[(f_df["match_date"] < HOLDOUT_CUT_TS) & f_df["y"].notna()].copy()
    f_df["y"] = f_df["y"].astype(np.int64)
    f_df["sstart"] = f_df["season"].astype(str).str[:4].astype(int)

    sb_sig_df = _compute_statsbomb_ewm_feature(m_df, sb_cal)
    tempo_df = _compute_causal_club_tempo_and_xg_features(m_df, sb_cal)
    m_join = m_df[
        [
            "match_id",
            "home_team",
            "away_team",
            "home_goals",
            "away_goals",
            "odds_open_ps_h",
            "odds_open_ps_d",
            "odds_open_ps_a",
            "odds_close_ps_h",
            "odds_close_ps_d",
            "odds_close_ps_a",
            "odds_open_bfe_h",
            "odds_open_bfe_d",
            "odds_open_bfe_a",
            "odds_open_avg_h",
            "odds_open_avg_d",
            "odds_open_avg_a",
            "odds_open_max_h",
            "odds_open_max_d",
            "odds_open_max_a",
        ]
    ].drop_duplicates("match_id")

    df = (
        f_df[f_df["sstart"] >= 2010]
        .merge(m_join, on="match_id", how="left", suffixes=("", "_m"))
        .merge(sb_sig_df, on="match_id", how="left")
        .merge(tempo_df, on="match_id", how="left")
    )
    df = df.sort_values(["match_date", "match_id"], kind="mergesort").reset_index(drop=True)

    ht_col = "home_team" if "home_team" in df.columns else "home_team_m"
    at_col = "away_team" if "away_team" in df.columns else "away_team_m"
    hg_col = "home_goals" if "home_goals" in df.columns else "home_goals_m"
    ag_col = "away_goals" if "away_goals" in df.columns else "away_goals_m"

    # Señales causales `100%` pobladas ya presentes en `features.parquet` (`D1`)
    df["elo_xg_diff"] = (
        pd.to_numeric(df["elo_xg_home"], errors="coerce") - pd.to_numeric(df["elo_xg_away"], errors="coerce")
    )
    df["att_def_net_diff"] = (
        (pd.to_numeric(df["att_strength_home"], errors="coerce") - pd.to_numeric(df["def_strength_away"], errors="coerce"))
        - (pd.to_numeric(df["att_strength_away"], errors="coerce") - pd.to_numeric(df["def_strength_home"], errors="coerce"))
    )
    df["att_def_goals_sum"] = (
        pd.to_numeric(df["att_strength_home"], errors="coerce")
        + pd.to_numeric(df["att_strength_away"], errors="coerce")
        + pd.to_numeric(df["def_strength_home"], errors="coerce")
        + pd.to_numeric(df["def_strength_away"], errors="coerce")
    )

    # EWMA causal rápida por división (`t' < t`) de localía (`div_hfa_ewm`) y goles (`div_goals_ewm`) para ruptura post-COVID
    n_rows = len(df)
    div_hfa_vec = np.full(n_rows, 0.45, dtype=np.float64)
    div_goals_vec = np.full(n_rows, 2.65, dtype=np.float64)
    div_hfa_state: dict[str, float] = {}
    div_goals_state: dict[str, float] = {}
    alpha_hfa = 2.0 / 121.0
    divs_arr = df["div"].astype(str).tolist()
    y_all_arr = df["y"].to_numpy(dtype=np.int64)
    hg_all_arr = pd.to_numeric(df[hg_col], errors="coerce").fillna(1.0).to_numpy(dtype=np.float64)
    ag_all_arr = pd.to_numeric(df[ag_col], errors="coerce").fillna(1.0).to_numpy(dtype=np.float64)
    for i in range(n_rows):
        dv_i = divs_arr[i]
        cur_hfa = div_hfa_state.get(dv_i, 0.45)
        cur_g = div_goals_state.get(dv_i, 2.65)
        div_hfa_vec[i] = cur_hfa
        div_goals_vec[i] = cur_g
        obs_hw = 1.0 if y_all_arr[i] == 0 else 0.0
        obs_tg = min(hg_all_arr[i] + ag_all_arr[i], 10.0)
        div_hfa_state[dv_i] = alpha_hfa * obs_hw + (1.0 - alpha_hfa) * cur_hfa
        div_goals_state[dv_i] = alpha_hfa * obs_tg + (1.0 - alpha_hfa) * cur_g
    df["div_hfa_ewm"] = div_hfa_vec
    df["div_goals_ewm"] = div_goals_vec

    # Suerte causal xG real (`ws_soccer_match_xg < 2025-02-02`)
    xg_luck_vec, xg_luck_last = _compute_causal_real_xg_luck(df, ht_col, at_col)
    df["real_xg_overperf_luck_diff"] = xg_luck_vec

    tm_bridge = CausalClubTransfermarktBridge(max_date_exclusive=HOLDOUT_CUT_DATE)
    w2_bridge = CausalClubWave2Bridge(max_date_exclusive=HOLDOUT_CUT_DATE)

    print(f"[EXP_V50 v5.1] Partidos globales de clubes (`22` ligas, `2010..2024 < {HOLDOUT_CUT_DATE}`): {n_rows:,}")

    tm6_mat = np.zeros((n_rows, len(TM_6_COLS)), dtype=np.float64)
    w2_mat = np.zeros((n_rows, len(ALL_W2_CLUB_COLS)), dtype=np.float64)
    tm_val_sum_vec = np.zeros(n_rows, dtype=np.float64)
    tm_val_abs_vec = np.zeros(n_rows, dtype=np.float64)
    xi_ga90_sum_vec = np.zeros(n_rows, dtype=np.float64)
    games_14d_sum_vec = np.zeros(n_rows, dtype=np.float64)

    crowd_occ_h_vec = np.full(n_rows, 0.82, dtype=np.float64)
    crowd_hfa_shock_vec = np.zeros(n_rows, dtype=np.float64)
    b5_diff_vec = np.zeros(n_rows, dtype=np.float64)
    b5_sum_vec = np.full(n_rows, 0.44, dtype=np.float64)
    mgr_tempo_sum_vec = np.full(n_rows, 2.68, dtype=np.float64)
    mgr_draw_sum_vec = np.zeros(n_rows, dtype=np.float64)
    six_ptr_vec = np.zeros(n_rows, dtype=np.float64)

    d_ords = df["match_date"].map(lambda d: d.toordinal()).to_numpy(dtype=np.int64)
    d_strs = df["match_date"].astype(str).str.slice(0, 10).tolist()
    h_names = df[ht_col].astype(str).tolist()
    a_names = df[at_col].astype(str).tolist()
    elo_diffs = pd.to_numeric(df["elo_diff_no_hfa"], errors="coerce").fillna(0.0).to_numpy(dtype=np.float64)
    h_prom = pd.to_numeric(df["h_div_change"], errors="coerce").fillna(0.0).to_numpy(dtype=np.float64) if "h_div_change" in df.columns else np.zeros(n_rows)
    a_prom = pd.to_numeric(df["a_div_change"], errors="coerce").fillna(0.0).to_numpy(dtype=np.float64) if "a_div_change" in df.columns else np.zeros(n_rows)
    s_prog = pd.to_numeric(df["season_progress"], errors="coerce").fillna(0.5).to_numpy(dtype=np.float64)

    div_ewm_log_val: dict[str, float] = {}
    div_ewm_xi_val: dict[str, float] = {}
    alpha_div = 0.04

    def _lookup_tm_game_state(cid: int | None, ds: str) -> tuple[float, float, float, float, float]:
        if not cid or cid not in tm_timelines:
            return (0.22, 0.82, 2.68, 0.25, 10.0)
        tl = tm_timelines[cid]
        idx = bisect_left(tl["dates"], ds) - 1
        if idx < 0:
            return (0.22, 0.82, 2.68, 0.25, 10.0)
        return (tl["back5"][idx], tl["occ"][idx], tl["mgr_tempo"][idx], tl["mgr_draw"][idx], tl["pos"][idx])

    for i in range(n_rows):
        dv_i = divs_arr[i]
        m_ord = int(d_ords[i])
        ds_i = d_strs[i]
        eh = 1525.0 + 0.5 * elo_diffs[i]
        ea = 1525.0 - 0.5 * elo_diffs[i]
        elo_rel_h = (eh - 1525.0) / 145.0
        elo_rel_a = (ea - 1525.0) / 145.0

        th = tm_bridge.lookup_prematch_club_tm(dv_i, h_names[i], m_ord, eh)
        ta = tm_bridge.lookup_prematch_club_tm(dv_i, a_names[i], m_ord, ea)
        has_h = th["tm_has_val"] > 0.0
        has_a = ta["tm_has_val"] > 0.0
        cur_div_med = div_ewm_log_val.get(dv_i, 3.80)

        if has_h and has_a:
            rel_h = th["tm_raw_log_val"] - cur_div_med
            rel_a = ta["tm_raw_log_val"] - cur_div_med
            val_diff = th["tm_raw_log_val"] - ta["tm_raw_log_val"]
            depth_diff = th["tm_depth_ratio"] - ta["tm_depth_ratio"]
            gap_diff = (rel_h - elo_rel_h) - (rel_a - elo_rel_a)
        elif has_h and not has_a:
            rel_h = th["tm_raw_log_val"] - cur_div_med
            imp_a = -0.35 + 0.30 * elo_rel_a
            rel_a = imp_a
            val_diff = 0.65 * (rel_h - imp_a)
            depth_diff = 0.50 * (th["tm_depth_ratio"] - 0.26)
            gap_diff = 0.65 * (rel_h - elo_rel_h)
        elif has_a and not has_h:
            rel_a = ta["tm_raw_log_val"] - cur_div_med
            imp_h = -0.35 + 0.30 * elo_rel_h
            rel_h = imp_h
            val_diff = 0.65 * (imp_h - rel_a)
            depth_diff = 0.50 * (0.26 - ta["tm_depth_ratio"])
            gap_diff = -0.65 * (rel_a - elo_rel_a)
        else:
            rel_h, rel_a, val_diff, depth_diff, gap_diff = 0.0, 0.0, 0.0, 0.0, 0.0

        if has_h:
            div_ewm_log_val[dv_i] = (1.0 - alpha_div) * div_ewm_log_val.get(dv_i, th["tm_raw_log_val"]) + alpha_div * th["tm_raw_log_val"]
        if has_a:
            div_ewm_log_val[dv_i] = (1.0 - alpha_div) * div_ewm_log_val.get(dv_i, ta["tm_raw_log_val"]) + alpha_div * ta["tm_raw_log_val"]

        tm6_mat[i] = [val_diff, depth_diff, gap_diff, h_prom[i] * rel_h - a_prom[i] * rel_a, th["tm_new_mgr_flag"] - ta["tm_new_mgr_flag"], th["tm_mgr_pae"] - ta["tm_mgr_pae"]]
        tm_val_sum_vec[i] = rel_h + rel_a
        tm_val_abs_vec[i] = abs(val_diff)

        cid_h = tm_bridge.resolve_club_id(dv_i, h_names[i])
        cid_a = tm_bridge.resolve_club_id(dv_i, a_names[i])
        w2_h = w2_bridge.lookup_club_wave2(cid_h, m_ord)
        w2_a = w2_bridge.lookup_club_wave2(cid_a, m_ord)
        games_14d_sum_vec[i] = w2_h["games_14d_allcomps"] + w2_a["games_14d_allcomps"]

        hx = w2_h["has_realized_xi"] > 0.0
        ax = w2_a["has_realized_xi"] > 0.0
        cur_xi_med = div_ewm_xi_val.get(dv_i, 3.20)
        if hx and ax:
            xi_val_diff = w2_h["realized_xi_log_val"] - w2_a["realized_xi_log_val"]
            avail_diff = w2_h["injury_avail_ratio"] - w2_a["injury_avail_ratio"]
            ga90_diff = w2_h["xi_ga90_allcomps"] - w2_a["xi_ga90_allcomps"]
            ga90_sum = w2_h["xi_ga90_allcomps"] + w2_a["xi_ga90_allcomps"]
        elif hx and not ax:
            xi_val_diff = 0.55 * ((w2_h["realized_xi_log_val"] - cur_xi_med) - (-0.30))
            avail_diff = 0.55 * (w2_h["injury_avail_ratio"] - 0.85)
            ga90_diff = 0.55 * (w2_h["xi_ga90_allcomps"] - 2.10)
            ga90_sum = w2_h["xi_ga90_allcomps"] + 2.10
        elif ax and not hx:
            xi_val_diff = 0.55 * ((-0.30) - (w2_a["realized_xi_log_val"] - cur_xi_med))
            avail_diff = 0.55 * (0.85 - w2_a["injury_avail_ratio"])
            ga90_diff = 0.55 * (2.10 - w2_a["xi_ga90_allcomps"])
            ga90_sum = 2.10 + w2_a["xi_ga90_allcomps"]
        else:
            xi_val_diff, avail_diff, ga90_diff, ga90_sum = 0.0, 0.0, 0.0, 4.20

        if hx:
            div_ewm_xi_val[dv_i] = (1.0 - alpha_div) * div_ewm_xi_val.get(dv_i, w2_h["realized_xi_log_val"]) + alpha_div * w2_h["realized_xi_log_val"]
        if ax:
            div_ewm_xi_val[dv_i] = (1.0 - alpha_div) * div_ewm_xi_val.get(dv_i, w2_a["realized_xi_log_val"]) + alpha_div * w2_a["realized_xi_log_val"]

        w2_mat[i] = [
            w2_a["midweek_cup_load"] - w2_h["midweek_cup_load"],
            w2_a["games_14d_allcomps"] - w2_h["games_14d_allcomps"],
            xi_val_diff,
            avail_diff,
            ga90_diff,
            w2_h["net_transfer_val_120d"] - w2_a["net_transfer_val_120d"],
            w2_h["inbound_fee_120d"] - w2_a["inbound_fee_120d"],
        ]
        xi_ga90_sum_vec[i] = ga90_sum

        b5_h, occ_h, mt_h, md_h, pos_h = _lookup_tm_game_state(cid_h, ds_i)
        b5_a, _, mt_a, md_a, pos_a = _lookup_tm_game_state(cid_a, ds_i)
        crowd_occ_h_vec[i] = occ_h
        crowd_hfa_shock_vec[i] = occ_h - 0.82
        b5_diff_vec[i] = b5_h - b5_a
        b5_sum_vec[i] = b5_h + b5_a
        mgr_tempo_sum_vec[i] = 0.5 * (mt_h + mt_a) - 2.68
        mgr_draw_sum_vec[i] = (md_h + md_a) - 0.50
        six_ptr_vec[i] = math.exp(-abs(pos_h - pos_a) / 3.0) * float(s_prog[i]) if (cid_h and cid_a) else 0.0

    for j, nm in enumerate(TM_6_COLS):
        df[nm] = tm6_mat[:, j]
    for j, nm in enumerate(ALL_W2_CLUB_COLS):
        df[nm] = w2_mat[:, j]

    df["abs_elo_mismatch"] = np.abs(elo_diffs) / 200.0
    df["tm_log_val_sum"] = tm_val_sum_vec
    df["tm_val_abs_mismatch"] = tm_val_abs_vec
    df["xi_ga90_sum"] = xi_ga90_sum_vec
    df["games_14d_sum"] = games_14d_sum_vec

    df["crowd_occupancy_home"] = crowd_occ_h_vec
    df["crowd_hfa_shock"] = crowd_hfa_shock_vec
    df["formation_back5_diff"] = b5_diff_vec
    df["formation_back5_sum"] = b5_sum_vec
    df["underdog_low_block_shield"] = (-elo_diffs / 200.0) * (-b5_diff_vec)
    df["manager_tempo_sum"] = mgr_tempo_sum_vec
    df["manager_draw_rate_sum"] = mgr_draw_sum_vec
    df["six_pointer_table_tension"] = six_ptr_vec

    cols_v35_52 = list(LIVE_BASE_38_ORDERED) + list(SB_1_COL) + list(TM_6_COLS) + list(ALL_W2_CLUB_COLS)
    div_levels = sorted(set(str(d) for d in df["div"].unique()))
    eval_seasons = sorted(set(int(s) for s in df["sstart"].unique() if int(s) >= 2015))
    val_seasons = [yr for yr in eval_seasons if yr <= 2019]

    def _run_logit_val_only(col_list: list[str], c_reg: float = 0.02, half_life: float = 2190.0) -> tuple[np.ndarray, np.ndarray]:
        parts: list[np.ndarray] = []
        ys: list[np.ndarray] = []
        for yr in val_seasons:
            tr_df = df.loc[df["sstart"] < yr]
            ev_df = df.loc[df["sstart"] == yr]
            y_tr = tr_df["y"].to_numpy(dtype=np.int64)
            max_dt = tr_df["match_date"].max()
            sw = 0.5 ** ((max_dt - tr_df["match_date"]).dt.days.to_numpy(dtype=np.float64) / half_life)
            dum_tr = np.column_stack([(tr_df["div"].astype(str).to_numpy() == lv).astype(np.float64) for lv in div_levels])
            dum_ev = np.column_stack([(ev_df["div"].astype(str).to_numpy() == lv).astype(np.float64) for lv in div_levels])
            X_tr = np.hstack([tr_df[col_list].to_numpy(dtype=np.float64), dum_tr])
            X_ev = np.hstack([ev_df[col_list].to_numpy(dtype=np.float64), dum_ev])
            imp = SimpleImputer(strategy="median").fit(X_tr)
            sc = StandardScaler().fit(imp.transform(X_tr))
            sc.scale_ = np.where(sc.scale_ == 0.0, 1.0, sc.scale_)
            lr = LogisticRegression(C=c_reg, max_iter=800).fit(sc.transform(imp.transform(X_tr)), y_tr, sample_weight=sw)
            parts.append(lr.predict_proba(sc.transform(imp.transform(X_ev))))
            ys.append(ev_df["y"].to_numpy(dtype=np.int64))
        return np.vstack(parts), np.concatenate(ys)

    # 1. Selección causal greedy de features 1X2 estrictamente sobre VAL (2015..2019)
    P_val_base, y_val_only = _run_logit_val_only(cols_v35_52, c_reg=0.02, half_life=2190.0)
    cur_best_ll = float(np.mean(oc.compute_categorical_log_loss_vec(P_val_base, y_val_only)))
    cur_cols = list(cols_v35_52)
    accepted_v5: list[str] = []
    for cand_f in V51_CANDIDATE_1X2_EXTRA_COLS:
        if cand_f in cur_cols or cand_f not in df.columns:
            continue
        p_try, _ = _run_logit_val_only(cur_cols + [cand_f], c_reg=0.02, half_life=2190.0)
        ll_try = float(np.mean(oc.compute_categorical_log_loss_vec(p_try, y_val_only)))
        if ll_try < cur_best_ll - 5e-6:
            cur_cols.append(cand_f)
            accepted_v5.append(cand_f)
            cur_best_ll = ll_try

    # 2. Optimización estricta en VAL <= 2019 de `half_life` y `C_logit`
    best_hl = 2190.0
    best_c = 0.02
    best_hl_ll = cur_best_ll
    for hl_try in (730.0, 1095.0, 1460.0, 2190.0):
        for c_try in (0.01, 0.02, 0.04):
            p_try, _ = _run_logit_val_only(cur_cols, c_reg=c_try, half_life=hl_try)
            ll_try = float(np.mean(oc.compute_categorical_log_loss_vec(p_try, y_val_only)))
            if ll_try < best_hl_ll - 1e-6:
                best_hl_ll = ll_try
                best_hl = hl_try
                best_c = c_try

    print(f"[EXP_V50 v5.1] VAL<=2019 features 1X2 aceptadas ({len(accepted_v5)}/{len(V51_CANDIDATE_1X2_EXTRA_COLS)}): {accepted_v5}")
    print(f"[EXP_V50 v5.1] VAL<=2019 tuning: half_life={best_hl:.0f}d, C={best_c}, VAL_LL={best_hl_ll:.5f}")

    # 3. Selección causal greedy de features Goals estrictamente sobre VAL (2015..2019)
    def _run_goals_val_only(gcols: list[str]) -> float:
        errs = []
        for yr in val_seasons:
            tr_df = df.loc[df["sstart"] < yr]
            ev_df = df.loc[df["sstart"] == yr]
            max_dt = tr_df["match_date"].max()
            sw = 0.5 ** ((max_dt - tr_df["match_date"]).dt.days.to_numpy(dtype=np.float64) / best_hl)
            dum_tr = np.column_stack([(tr_df["div"].astype(str).to_numpy() == lv).astype(np.float64) for lv in div_levels])
            dum_ev = np.column_stack([(ev_df["div"].astype(str).to_numpy() == lv).astype(np.float64) for lv in div_levels])
            Xg_tr = np.hstack([tr_df[gcols].to_numpy(dtype=np.float64), dum_tr])
            Xg_ev = np.hstack([ev_df[gcols].to_numpy(dtype=np.float64), dum_ev])
            ig = SimpleImputer(strategy="median").fit(Xg_tr)
            sg = StandardScaler().fit(ig.transform(Xg_tr))
            sg.scale_ = np.where(sg.scale_ == 0.0, 1.0, sg.scale_)
            t_tr = np.clip(
                pd.to_numeric(tr_df[hg_col], errors="coerce").fillna(1.0).to_numpy(dtype=np.float64)
                + pd.to_numeric(tr_df[ag_col], errors="coerce").fillna(1.0).to_numpy(dtype=np.float64),
                0.0,
                15.0,
            )
            t_ev = np.clip(
                pd.to_numeric(ev_df[hg_col], errors="coerce").fillna(1.0).to_numpy(dtype=np.float64)
                + pd.to_numeric(ev_df[ag_col], errors="coerce").fillna(1.0).to_numpy(dtype=np.float64),
                0.0,
                15.0,
            )
            pm = PoissonRegressor(alpha=0.05, max_iter=800).fit(sg.transform(ig.transform(Xg_tr)), t_tr, sample_weight=sw)
            mu_ev = np.clip(pm.predict(sg.transform(ig.transform(Xg_ev))), 0.45, 7.5)
            # Poisson deviance
            dev = 2.0 * (np.where(t_ev > 0, t_ev * np.log(np.maximum(t_ev, 1e-12) / mu_ev), 0.0) - (t_ev - mu_ev))
            errs.append(dev)
        return float(np.mean(np.concatenate(errs)))

    cur_goals_cols = list(HORIZON_GOALS_13_BASE_COLS)
    best_g_dev = _run_goals_val_only(cur_goals_cols)
    accepted_goals_v5: list[str] = []
    for cand_g in V51_CANDIDATE_GOALS_EXTRA_COLS:
        if cand_g in cur_goals_cols or cand_g not in df.columns:
            continue
        dev_try = _run_goals_val_only(cur_goals_cols + [cand_g])
        if dev_try < best_g_dev - 1e-5:
            cur_goals_cols.append(cand_g)
            accepted_goals_v5.append(cand_g)
            best_g_dev = dev_try
    print(f"[EXP_V50 v5.1] VAL<=2019 features Goals aceptadas ({len(accepted_goals_v5)}/{len(V51_CANDIDATE_GOALS_EXTRA_COLS)}): {accepted_goals_v5}")

    # 4. Walk-forward completo `v3.5` (benchmark congelado) vs `v5.1` sobre `2015..2024`
    meta_oof = pd.concat([df.loc[df["sstart"] == yr] for yr in eval_seasons], ignore_index=True)
    y_oof = meta_oof["y"].to_numpy(dtype=np.int64)
    ss_oof = meta_oof["sstart"].to_numpy(dtype=int)
    date_clusters_oof = meta_oof["match_date"].astype(str).str.slice(0, 10).to_numpy()
    div_oof = meta_oof["div"].astype(str).to_numpy()
    val_m = ss_oof <= 2019
    oos_m = ss_oof >= 2020
    flagship_oos_m = oos_m & np.isin(div_oof, list(FLAGSHIP_TIER1_DIVS))

    hgb_p = {
        "max_depth": 4,
        "max_leaf_nodes": 15,
        "min_samples_leaf": 140,
        "learning_rate": 0.035,
        "max_iter": 110,
        "l2_regularization": 12.0,
        "early_stopping": False,
        "random_state": MODEL_SEED,
    }

    oof_v35_ens: list[np.ndarray] = []
    oof_v51_log: list[np.ndarray] = []
    oof_v51_hgb: list[np.ndarray] = []
    oof_t35: list[np.ndarray] = []
    oof_t51: list[np.ndarray] = []

    for yr in eval_seasons:
        tr_df = df.loc[df["sstart"] < yr]
        ev_df = df.loc[df["sstart"] == yr]
        y_tr = tr_df["y"].to_numpy(dtype=np.int64)
        max_dt = tr_df["match_date"].max()
        days_ago = (max_dt - tr_df["match_date"]).dt.days.to_numpy(dtype=np.float64)
        sw35 = 0.5 ** (days_ago / 2190.0)
        sw51 = 0.5 ** (days_ago / best_hl)
        dum_tr = np.column_stack([(tr_df["div"].astype(str).to_numpy() == lv).astype(np.float64) for lv in div_levels])
        dum_ev = np.column_stack([(ev_df["div"].astype(str).to_numpy() == lv).astype(np.float64) for lv in div_levels])

        # Benchmark v3.5
        X35_tr = np.hstack([tr_df[cols_v35_52].to_numpy(dtype=np.float64), dum_tr])
        X35_ev = np.hstack([ev_df[cols_v35_52].to_numpy(dtype=np.float64), dum_ev])
        imp35 = SimpleImputer(strategy="median").fit(X35_tr)
        sc35 = StandardScaler().fit(imp35.transform(X35_tr))
        sc35.scale_ = np.where(sc35.scale_ == 0.0, 1.0, sc35.scale_)
        lr35 = LogisticRegression(C=0.02, max_iter=800).fit(sc35.transform(imp35.transform(X35_tr)), y_tr, sample_weight=sw35)
        pl35 = lr35.predict_proba(sc35.transform(imp35.transform(X35_ev)))
        hg35 = HistGradientBoostingClassifier(**hgb_p).fit(X35_tr, y_tr, sample_weight=sw35)
        pg35 = _apply_temperature_3way_exact(hg35.predict_proba(X35_ev), 1.05)
        oof_v35_ens.append(_blend_3way_exact(pl35, pg35, 0.65, 0.35, "probability"))

        # Tachyon v5.1
        X51_tr = np.hstack([tr_df[cur_cols].to_numpy(dtype=np.float64), dum_tr])
        X51_ev = np.hstack([ev_df[cur_cols].to_numpy(dtype=np.float64), dum_ev])
        imp51 = SimpleImputer(strategy="median").fit(X51_tr)
        sc51 = StandardScaler().fit(imp51.transform(X51_tr))
        sc51.scale_ = np.where(sc51.scale_ == 0.0, 1.0, sc51.scale_)
        lr51 = LogisticRegression(C=best_c, max_iter=800).fit(sc51.transform(imp51.transform(X51_tr)), y_tr, sample_weight=sw51)
        oof_v51_log.append(lr51.predict_proba(sc51.transform(imp51.transform(X51_ev))))
        hg51 = HistGradientBoostingClassifier(**hgb_p).fit(X51_tr, y_tr, sample_weight=sw51)
        oof_v51_hgb.append(hg51.predict_proba(X51_ev))

        # Totals v3.5 vs v5.1
        tot_tr = np.clip(
            pd.to_numeric(tr_df[hg_col], errors="coerce").fillna(1.0).to_numpy(dtype=np.float64)
            + pd.to_numeric(tr_df[ag_col], errors="coerce").fillna(1.0).to_numpy(dtype=np.float64),
            0.0,
            15.0,
        )
        Xg35_tr = np.hstack([tr_df[list(HORIZON_GOALS_13_BASE_COLS)].to_numpy(dtype=np.float64), dum_tr])
        Xg35_ev = np.hstack([ev_df[list(HORIZON_GOALS_13_BASE_COLS)].to_numpy(dtype=np.float64), dum_ev])
        ig35 = SimpleImputer(strategy="median").fit(Xg35_tr)
        sg35 = StandardScaler().fit(ig35.transform(Xg35_tr))
        sg35.scale_ = np.where(sg35.scale_ == 0.0, 1.0, sg35.scale_)
        pg_m35 = PoissonRegressor(alpha=0.05, max_iter=800).fit(sg35.transform(ig35.transform(Xg35_tr)), tot_tr, sample_weight=sw35)
        oof_t35.append(np.clip(pg_m35.predict(sg35.transform(ig35.transform(Xg35_ev))), 0.45, 7.5))

        Xg51_tr = np.hstack([tr_df[cur_goals_cols].to_numpy(dtype=np.float64), dum_tr])
        Xg51_ev = np.hstack([ev_df[cur_goals_cols].to_numpy(dtype=np.float64), dum_ev])
        ig51 = SimpleImputer(strategy="median").fit(Xg51_tr)
        sg51 = StandardScaler().fit(ig51.transform(Xg51_tr))
        sg51.scale_ = np.where(sg51.scale_ == 0.0, 1.0, sg51.scale_)
        pg_m51 = PoissonRegressor(alpha=0.05, max_iter=800).fit(sg51.transform(ig51.transform(Xg51_tr)), tot_tr, sample_weight=sw51)
        oof_t51.append(np.clip(pg_m51.predict(sg51.transform(ig51.transform(Xg51_ev))), 0.45, 7.5))
        print(f"  [EXP_V50 v5.1 Fold {yr}] completado ({len(ev_df):,} partidos)")

    P_v35 = np.vstack(oof_v35_ens)
    P_v51_l = np.vstack(oof_v51_log)
    P_v51_g = np.vstack(oof_v51_hgb)
    T_v35 = np.concatenate(oof_t35)
    T_v51 = np.concatenate(oof_t51)

    best_ens = None
    best_v_ll = float("inf")
    for tc in (1.0, 1.05, 1.10, 1.15):
        pg_c = _apply_temperature_3way_exact(P_v51_g, tc)
        for bsp in ("logit", "probability"):
            for wg in (0.15, 0.25, 0.35, 0.45):
                wl = round(1.0 - wg, 6)
                pt = _blend_3way_exact(P_v51_l[val_m], pg_c[val_m], wl, wg, bsp)
                ll_v = float(np.mean(oc.compute_categorical_log_loss_vec(pt, y_oof[val_m])))
                if ll_v < best_v_ll:
                    best_v_ll = ll_v
                    best_ens = (tc, bsp, wl, wg, pg_c)

    assert best_ens is not None
    sel_t, sel_bsp, sel_wl, sel_wg, pg_cal = best_ens
    P_v51 = _blend_3way_exact(P_v51_l, pg_cal, sel_wl, sel_wg, sel_bsp)

    def _eval_3way_cluster(p_c: np.ndarray, p_b: np.ndarray, y_t: np.ndarray, cl: np.ndarray, sd: int) -> dict[str, Any]:
        cb = cluster_bootstrap_multiclass(cl, y_t, p_c, p_b, n_resamples=BOOTSTRAP_SAMPLES, seed=sd)
        ece_h = safe_ece_binary((y_t == 0).astype(np.float64), p_c[:, 0], n_bins=10)
        sig = "significant_improvement" if cb["significant_improvement"] else (
            "significant_degradation" if (cb["ci95_lo"] is not None and cb["ci95_lo"] > 0.0) else "not_significant"
        )
        return {
            **cb,
            "log_loss": cb["logloss_cand"],
            "benchmark_log_loss": cb["logloss_bench"],
            "delta_ll_vs_benchmark": cb["delta_logloss"],
            "ece": round(ece_h, 6) if ece_h is not None else None,
            "significance": sig,
        }

    ev_club_1x2_all = _eval_3way_cluster(P_v51, P_v35, y_oof, date_clusters_oof, BOOTSTRAP_SEED)
    ev_club_1x2_oos = _eval_3way_cluster(P_v51[oos_m], P_v35[oos_m], y_oof[oos_m], date_clusters_oof[oos_m], BOOTSTRAP_SEED + 1)
    ev_club_1x2_flagship_oos = _eval_3way_cluster(P_v51[flagship_oos_m], P_v35[flagship_oos_m], y_oof[flagship_oos_m], date_clusters_oof[flagship_oos_m], BOOTSTRAP_SEED + 2)

    # 5. Modo B Honesto (`Power De-Vig` vs `Pinnacle Open Power De-Vig` y `Pinnacle Close Power De-Vig`)
    oh_ps = pd.to_numeric(meta_oof["odds_open_ps_h"], errors="coerce").to_numpy(dtype=np.float64)
    od_ps = pd.to_numeric(meta_oof["odds_open_ps_d"], errors="coerce").to_numpy(dtype=np.float64)
    oa_ps = pd.to_numeric(meta_oof["odds_open_ps_a"], errors="coerce").to_numpy(dtype=np.float64)
    ch_ps = pd.to_numeric(meta_oof["odds_close_ps_h"], errors="coerce").to_numpy(dtype=np.float64)
    cd_ps = pd.to_numeric(meta_oof["odds_close_ps_d"], errors="coerce").to_numpy(dtype=np.float64)
    ca_ps = pd.to_numeric(meta_oof["odds_close_ps_a"], errors="coerce").to_numpy(dtype=np.float64)
    oh_mx = pd.to_numeric(meta_oof["odds_open_max_h"], errors="coerce").to_numpy(dtype=np.float64)
    oa_mx = pd.to_numeric(meta_oof["odds_open_max_a"], errors="coerce").to_numpy(dtype=np.float64)
    oh_av = pd.to_numeric(meta_oof["odds_open_avg_h"], errors="coerce").to_numpy(dtype=np.float64)
    od_av = pd.to_numeric(meta_oof["odds_open_avg_d"], errors="coerce").to_numpy(dtype=np.float64)
    oa_av = pd.to_numeric(meta_oof["odds_open_avg_a"], errors="coerce").to_numpy(dtype=np.float64)

    P_open_ps_pow, has_open = power_devig_3way(oh_ps, od_ps, oa_ps)
    P_close_ps_pow, has_close = power_devig_3way(ch_ps, cd_ps, ca_ps)
    P_open_av_pow, has_av = power_devig_3way(oh_av, od_av, oa_av)

    # También calculamos Proportional de-vig solo para auditoría comparativa histórica
    imp_ps_prop = np.column_stack([1.0 / np.where(has_open, oh_ps, 2.5), 1.0 / np.where(has_open, od_ps, 3.3), 1.0 / np.where(has_open, oa_ps, 2.8)])
    P_open_ps_prop = imp_ps_prop / np.sum(imp_ps_prop, axis=1, keepdims=True)

    has_disp = has_open & has_av & np.isfinite(oh_mx) & np.isfinite(oa_mx) & (oh_mx > 1.01) & (oa_mx > 1.01)
    disp_h = np.where(has_disp, (1.0 / oh_av) - (1.0 / oh_mx), 0.0)
    disp_a = np.where(has_disp, (1.0 / oa_av) - (1.0 / oa_mx), 0.0)

    X_mkt = np.column_stack(
        [
            np.log(np.clip(P_open_ps_pow, 1e-6, 1.0)),
            np.log(np.clip(P_open_av_pow, 1e-6, 1.0)) - np.log(np.clip(P_open_ps_pow, 1e-6, 1.0)),
            np.log(np.clip(P_v51, 1e-6, 1.0)) - np.log(np.clip(P_open_ps_pow, 1e-6, 1.0)),
            disp_h,
            disp_a,
        ]
    )
    m_tr_o = has_disp & val_m
    m_te_o = has_disp & oos_m
    m_te_oc = has_disp & has_close & oos_m
    lr_mkt = LogisticRegression(C=0.10, max_iter=800).fit(X_mkt[m_tr_o], y_oof[m_tr_o])
    P_mode_b_oos = lr_mkt.predict_proba(X_mkt[m_te_o])
    P_mode_b_oos_c = lr_mkt.predict_proba(X_mkt[m_te_oc])

    ev_mode_b_vs_ps_open_pow = _eval_3way_cluster(P_mode_b_oos, P_open_ps_pow[m_te_o], y_oof[m_te_o], date_clusters_oof[m_te_o], BOOTSTRAP_SEED + 3)
    ev_mode_b_vs_ps_open_prop = _eval_3way_cluster(P_mode_b_oos, P_open_ps_prop[m_te_o], y_oof[m_te_o], date_clusters_oof[m_te_o], BOOTSTRAP_SEED + 4)
    ev_mode_b_vs_ps_close_pow = _eval_3way_cluster(P_mode_b_oos_c, P_close_ps_pow[m_te_oc], y_oof[m_te_oc], date_clusters_oof[m_te_oc], BOOTSTRAP_SEED + 5)

    # 6. Calibración 4-Param en VAL <= 2019 eliminando doble inflación `(0-0, 1-1)` (`A2`)
    hg_oof = pd.to_numeric(meta_oof[hg_col], errors="coerce").to_numpy(dtype=np.float64)
    ag_oof = pd.to_numeric(meta_oof[ag_col], errors="coerce").to_numpy(dtype=np.float64)
    tot_oof = hg_oof + ag_oof
    y15_oof = (tot_oof >= 2).astype(np.float64)
    y25_oof = (tot_oof >= 3).astype(np.float64)
    y35_oof = (tot_oof >= 4).astype(np.float64)
    ybtts_oof = ((hg_oof >= 1) & (ag_oof >= 1)).astype(np.float64)

    rp_v35 = np.full(len(y_oof), -0.105, dtype=np.float64)
    lh35, la35, rh35 = solve_coherent_dc_3param_batch(P_v35, T_v35, rp_v35)
    mk35 = summarize_dc_markets_batch(lh35, la35, rh35)
    cone_err_club_v35 = float(np.max(np.abs(np.column_stack([mk35["p_home"], mk35["p_draw"], mk35["p_away"]]) - P_v35)))

    # Búsqueda 2-etapas sobre Joint 4-Market Log-Loss en VAL <= 2019 (submuestra estratificada n=8,000 + validación final completa)
    val_sub_idx = np.where(val_m)[0]
    rng_mat = np.random.default_rng(MODEL_SEED)
    grid_idx = np.sort(rng_mat.choice(val_sub_idx, size=min(8000, len(val_sub_idx)), replace=False))

    def _eval_club_jll(w_rb: float, r_pr: float, r_disp: float, idx_use: np.ndarray) -> float:
        rp_v = np.full(len(idx_use), r_pr, dtype=np.float64)
        mv = solve_diagonal_inflated_batch_fast(
            P_v51[idx_use], T_v51[idx_use], rp_v, dispersion_r=r_disp, max_goals=9, rho_draw_blend_weight=w_rb
        )
        jll = 0.0
        for yv, pv in ((y15_oof[idx_use], mv["p_over_1_5"]), (y25_oof[idx_use], mv["p_over_2_5"]), (y35_oof[idx_use], mv["p_over_3_5"]), (ybtts_oof[idx_use], mv["p_btts_yes"])):
            pc = np.clip(pv, 1e-12, 1.0 - 1e-12)
            jll += float(np.mean(-(yv * np.log(pc) + (1.0 - yv) * np.log(1.0 - pc))))
        return jll

    sel_wrb_c, sel_rho_c, sel_rdisp_c = 0.0, 0.0, 45.0
    best_mat_jll = float("inf")
    for w_rb in (0.0, 0.25, 0.5, 0.7):
        for r_pr in (-0.105, -0.04, 0.0, 0.06, 0.12):
            jll = _eval_club_jll(w_rb, r_pr, 45.0, grid_idx)
            if jll < best_mat_jll:
                best_mat_jll = jll
                sel_wrb_c, sel_rho_c = w_rb, r_pr
    best_r_jll_c = float("inf")
    for r_disp in (25.0, 45.0, 100.0, 500.0):
        jll = _eval_club_jll(sel_wrb_c, sel_rho_c, r_disp, val_sub_idx)
        if jll < best_r_jll_c:
            best_r_jll_c = jll
            sel_rdisp_c = r_disp
    rp_v51 = np.full(len(y_oof), sel_rho_c, dtype=np.float64)
    mk51 = solve_diagonal_inflated_batch_fast(
        P_v51, T_v51, rp_v51, dispersion_r=sel_rdisp_c, rho_draw_blend_weight=sel_wrb_c
    )
    cone_err_club_v51 = float(np.max(np.abs(np.column_stack([mk51["p_home"], mk51["p_draw"], mk51["p_away"]]) - P_v51)))

    ev_club_o15 = _evaluate_binary_market_cluster(date_clusters_oof, y15_oof, mk51["p_over_1_5"], mk35["p_over_1_5"], seed=BOOTSTRAP_SEED + 20)
    ev_club_o25 = _evaluate_binary_market_cluster(date_clusters_oof, y25_oof, mk51["p_over_2_5"], mk35["p_over_2_5"], seed=BOOTSTRAP_SEED + 21)
    ev_club_o35 = _evaluate_binary_market_cluster(date_clusters_oof, y35_oof, mk51["p_over_3_5"], mk35["p_over_3_5"], seed=BOOTSTRAP_SEED + 22)
    ev_club_btts = _evaluate_binary_market_cluster(date_clusters_oof, ybtts_oof, mk51["p_btts_yes"], mk35["p_btts_yes"], seed=BOOTSTRAP_SEED + 23)
    ev_club_o25_oos = _evaluate_binary_market_cluster(date_clusters_oof[oos_m], y25_oof[oos_m], mk51["p_over_2_5"][oos_m], mk35["p_over_2_5"][oos_m], seed=BOOTSTRAP_SEED + 24)
    ev_club_btts_oos = _evaluate_binary_market_cluster(date_clusters_oof[oos_m], ybtts_oof[oos_m], mk51["p_btts_yes"][oos_m], mk35["p_btts_yes"][oos_m], seed=BOOTSTRAP_SEED + 25)

    print(
        f"\n=== EXP_V50 REMEDIADO · GLOBAL CLUB TACHYON v5.1 (22 Leagues, n={len(y_oof):,}) ===\n"
        f"  Mode A 1X2 All : v3.5={ev_club_1x2_all['benchmark_log_loss']:.5f} -> v5.1={ev_club_1x2_all['log_loss']:.5f} | dLL={ev_club_1x2_all['delta_ll_vs_benchmark']:+.5f} ({ev_club_1x2_all['significance']})\n"
        f"  Mode A 1X2 OOS : v3.5={ev_club_1x2_oos['benchmark_log_loss']:.5f} -> v5.1={ev_club_1x2_oos['log_loss']:.5f} | dLL={ev_club_1x2_oos['delta_ll_vs_benchmark']:+.5f} ({ev_club_1x2_oos['significance']})\n"
        f"  Mode A Tier-1 OOS (n={int(np.sum(flagship_oos_m)):,}): v3.5={ev_club_1x2_flagship_oos['benchmark_log_loss']:.5f} -> v5.1={ev_club_1x2_flagship_oos['log_loss']:.5f} | dLL={ev_club_1x2_flagship_oos['delta_ll_vs_benchmark']:+.5f} ({ev_club_1x2_flagship_oos['significance']})\n"
        f"  Mode B OOS vs PS Open (Power De-Vig, n={int(np.sum(m_te_o)):,}): PS_Pow={ev_mode_b_vs_ps_open_pow['benchmark_log_loss']:.5f} -> ModeB={ev_mode_b_vs_ps_open_pow['log_loss']:.5f} | dLL={ev_mode_b_vs_ps_open_pow['delta_ll_vs_benchmark']:+.5f} ({ev_mode_b_vs_ps_open_pow['significance']})\n"
        f"  Mode B OOS vs PS Close (Power De-Vig, n={int(np.sum(m_te_oc)):,}): PS_Close={ev_mode_b_vs_ps_close_pow['benchmark_log_loss']:.5f} -> ModeB={ev_mode_b_vs_ps_close_pow['log_loss']:.5f} | dLL={ev_mode_b_vs_ps_close_pow['delta_ll_vs_benchmark']:+.5f}\n"
        f"  4-Param Matrix VAL-selected: w_rho_blend={sel_wrb_c}, rho_prior={sel_rho_c:+.3f}, r_disp={sel_rdisp_c}\n"
        f"  Totals 1.5 (All): dLL vs v3.5={ev_club_o15['delta_ll_vs_benchmark']:+.5f} | bias={ev_club_o15['bias_pp']:+.2f}pp\n"
        f"  Totals 2.5 (All/OOS): dLL={ev_club_o25['delta_ll_vs_benchmark']:+.5f} ({ev_club_o25['significance']}) | bias={ev_club_o25['bias_pp']:+.2f}pp (OOS bias={ev_club_o25_oos['bias_pp']:+.2f}pp, ECE={ev_club_o25_oos['ece']:.5f})\n"
        f"  Totals 3.5 (All): dLL vs v3.5={ev_club_o35['delta_ll_vs_benchmark']:+.5f} | bias={ev_club_o35['bias_pp']:+.2f}pp\n"
        f"  BTTS       (All/OOS): dLL={ev_club_btts['delta_ll_vs_benchmark']:+.5f} ({ev_club_btts['significance']}) | bias={ev_club_btts['bias_pp']:+.2f}pp (OOS bias={ev_club_btts_oos['bias_pp']:+.2f}pp)\n"
        f"  Max 1X2 Coherence Error: v3.5={cone_err_club_v35:.3e} -> v5.1={cone_err_club_v51:.3e}"
    )

    # 7. Ajuste y serialización final (< 2025-02-02) de `gbm_club_v5_0_candidate.json`, `model_club_goals_v5_0_candidate.json` y `club_state_v5_1.json`
    max_dt_f = df["match_date"].max()
    sw_f = 0.5 ** ((max_dt_f - df["match_date"]).dt.days.to_numpy(dtype=np.float64) / best_hl)
    dum_f = np.column_stack([(df["div"].astype(str).to_numpy() == lv).astype(np.float64) for lv in div_levels])
    X_f = np.hstack([df[cur_cols].to_numpy(dtype=np.float64), dum_f])
    y_f = df["y"].to_numpy(dtype=np.int64)

    imp_f = SimpleImputer(strategy="median").fit(X_f)
    sc_f = StandardScaler().fit(imp_f.transform(X_f))
    sc_f.scale_ = np.where(sc_f.scale_ == 0.0, 1.0, sc_f.scale_)
    lr_f = LogisticRegression(C=best_c, max_iter=800).fit(sc_f.transform(imp_f.transform(X_f)), y_f, sample_weight=sw_f)
    hgb_f = HistGradientBoostingClassifier(**hgb_p).fit(X_f, y_f, sample_weight=sw_f)

    logit_comp = eg.build_logit_companion_payload(imp_f, sc_f, lr_f, n_features_base=len(cur_cols), regularization_c=best_c)
    gbm_v50_art = eg.serialize_hist_gbm_to_artifact(
        hgb_f,
        base_feature_names=cur_cols,
        div_levels=div_levels,
        temperature=sel_t,
        blend_space=sel_bsp,
        w_logit=sel_wl,
        w_gbm=sel_wg,
        production_activated=False,
        activation_verdict={
            "activated": False,
            "status": "candidate",
            "significance": ev_club_1x2_oos["significance"],
            "criterion": "Candidato Global Tachyon v5.1 (22 divisiones, Pi/ClubElo/xG-Elo/HFA dinámico) validado < 2025-02-02",
            "reason": f"OOS_LL={ev_club_1x2_oos['log_loss']:.5f}, dLL_vs_v35={ev_club_1x2_oos['delta_ll_vs_benchmark']:+.5f}",
        },
        logit_companion=logit_comp,
        training_window={
            "min_season": 2010,
            "max_date_exclusive": HOLDOUT_CUT_ISO,
            "n_matches": int(len(df)),
            "half_life_days": float(best_hl),
            "holdout_sealed_untouched": True,
        },
        calibrated_on_window={"val_seasons": "2015..2019", "n_val": int(np.sum(val_m))},
        codename="PitchLab Tachyon v5.1 Global 22-League Ensemble",
        version="5.1.0-candidate",
        seed=MODEL_SEED,
    )
    GBM_CLUB_V50_OUT.write_text(json.dumps(gbm_v50_art, separators=(",", ":")), encoding="utf-8")

    tot_f = np.clip(
        pd.to_numeric(df[hg_col], errors="coerce").fillna(1.0).to_numpy(dtype=np.float64)
        + pd.to_numeric(df[ag_col], errors="coerce").fillna(1.0).to_numpy(dtype=np.float64),
        0.0,
        15.0,
    )
    Xg_f = np.hstack([df[cur_goals_cols].to_numpy(dtype=np.float64), dum_f])
    ig_f = SimpleImputer(strategy="median").fit(Xg_f)
    sg_f = StandardScaler().fit(ig_f.transform(Xg_f))
    sg_f.scale_ = np.where(sg_f.scale_ == 0.0, 1.0, sg_f.scale_)
    prg_f = PoissonRegressor(alpha=0.05, max_iter=800).fit(sg_f.transform(ig_f.transform(Xg_f)), tot_f, sample_weight=sw_f)

    goals_v50_art = {
        "schema_version": "diagonal_goals_v5.1.0",
        "type": "poisson_log_link_4param_diagonal_nb_dc",
        "codename": "PitchLab Horizon-Goals v5.1 Global 22-League Diagonal-NB (No-Double-Inflation)",
        "version": "5.1.0-candidate",
        "status": "candidate",
        "production_activated": False,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "dispersion_r": float(sel_rdisp_c),
        "default_rho": float(sel_rho_c),
        "rho_draw_blend_weight": float(sel_wrb_c),
        "min_total_goals": 0.45,
        "max_total_goals": 7.5,
        "max_goals_grid": DEFAULT_V4_MAX_GOALS,
        "n_features_base": len(cur_goals_cols),
        "base_features": list(cur_goals_cols),
        "div_levels": div_levels,
        "imputer_statistics": [float(v) for v in ig_f.statistics_.tolist()],
        "scaler_mean": [float(v) for v in sg_f.mean_.tolist()],
        "scaler_scale": [float(v) for v in sg_f.scale_.tolist()],
        "coef": [float(v) for v in prg_f.coef_.tolist()],
        "intercept": float(prg_f.intercept_),
    }
    GOALS_CLUB_V50_OUT.write_text(json.dumps(goals_v50_art, indent=2), encoding="utf-8")

    # Exportar `club_state_v5_1.json` para cero train-serve skew en inferencia viva (`REM_01`)
    state_meta = _export_club_state_v5_1(
        df=df,
        ht_col=ht_col,
        at_col=at_col,
        div_hfa_last=div_hfa_state,
        div_goals_last=div_goals_state,
        div_ewm_log_val=div_ewm_log_val,
        div_ewm_xi_val=div_ewm_xi_val,
        tm_bridge=tm_bridge,
        w2_bridge=w2_bridge,
        tm_timelines=tm_timelines,
        xg_luck_last=xg_luck_last,
        selected_1x2_features=cur_cols,
        selected_goals_features=cur_goals_cols,
    )
    print(f"[EXP_V50 v5.1] Exportado club_state_v5_1.json ({state_meta['n_clubs']} clubes, sha={state_meta['sha256'][:12]})")

    # Snapshot de paridad `< 1e-12` (`80` partidos representativos de las `22` divisiones)
    rng = np.random.default_rng(MODEL_SEED)
    rec_idx = np.where(df["sstart"].to_numpy() >= 2022)[0]
    ch_idx = np.sort(rng.choice(rec_idx, size=min(80, len(rec_idx)), replace=False))
    lc = gbm_v50_art["logit_companion"]
    cal = gbm_v50_art["calibration"]
    snap_rows: list[dict[str, Any]] = []

    for ri in ch_idx:
        dv = str(df.iloc[ri]["div"])
        f_b = [float(v) if math.isfinite(float(v)) else None for v in df.iloc[ri][cur_cols].tolist()]
        g_b = [float(v) if math.isfinite(float(v)) else float(goals_v50_art["imputer_statistics"][ic]) for ic, v in enumerate(df.iloc[ri][cur_goals_cols].tolist())]
        d_oh = [1.0 if lv == dv else 0.0 for lv in div_levels]
        xf = [v if v is not None else float("nan") for v in f_b] + d_oh

        z = [(((xv if math.isfinite(xv) else lc["imputer_statistics"][ic]) - lc["scaler_mean"][ic]) / (lc["scaler_scale"][ic] or 1.0)) for ic, xv in enumerate(xf)]
        lg = [float(lc["intercept"][c]) + sum(float(lc["coef"][c][ic]) * z[ic] for ic in range(len(z))) for c in range(3)]
        mx = max(lg)
        ex = [math.exp(v - mx) for v in lg]
        sex = sum(ex)
        p_log = [v / sex for v in ex]
        p_gbm = eg.predict_serialized_gbm_python(np.array([xf], dtype=np.float64), gbm_v50_art, calibrated=True)[0].tolist()

        wl, wg = float(cal["w_logit"]), float(cal["w_gbm"])
        if cal["blend_space"] == "logit":
            bl = [wl * math.log(max(pl, 1e-15)) + wg * math.log(max(pg, 1e-15)) for pl, pg in zip(p_log, p_gbm)]
            bmx = max(bl)
            bex = [math.exp(v - bmx) for v in bl]
            bs = sum(bex)
            p_ens = [v / bs for v in bex]
        else:
            pr = [wl * pl + wg * pg for pl, pg in zip(p_log, p_gbm)]
            ps = sum(pr)
            p_ens = [v / ps for v in pr]

        xg_f = g_b + d_oh
        eta = float(goals_v50_art["intercept"]) + sum(
            float(goals_v50_art["coef"][ic]) * ((xg_f[ic] - goals_v50_art["scaler_mean"][ic]) / (goals_v50_art["scaler_scale"][ic] or 1.0))
            for ic in range(len(xg_f))
        )
        t_hat = math.exp(min(max(eta, math.log(0.45)), math.log(7.5)))
        sol4 = solve_diagonal_inflated_score_matrix_4param(
            p_ens[0],
            p_ens[1],
            p_ens[2],
            t_hat,
            rho_prior=sel_rho_c,
            dispersion_r=sel_rdisp_c,
            rho_draw_blend_weight=sel_wrb_c,
        )
        mk4 = summarize_markets_from_matrix_v4(sol4["matrix"])
        snap_rows.append(
            {
                "match_id": str(df.iloc[ri]["match_id"]),
                "div": dv,
                "features": f_b,
                "goals_features": g_b,
                "python_ensemble_probs": p_ens,
                "python_t_hat": t_hat,
                "python_p_over_2_5": mk4["p_over_2_5"],
                "python_p_btts_yes": mk4["p_btts_yes"],
            }
        )

    SNAP_V50_OUT.write_text(json.dumps({"schema_version": "soccer_v5.1_global_snapshot", "holdout_sealed_untouched": True, "n": len(snap_rows), "rows": snap_rows}, indent=2), encoding="utf-8")

    res_out = {
        "experiment_id": "EXP_V50_soccer_v5_1_remediated",
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "n_club_divisions": len(div_levels),
        "selected_half_life_days": float(best_hl),
        "selected_c_logit": float(best_c),
        "selected_ensemble": {"temperature": sel_t, "blend_space": sel_bsp, "w_logit": sel_wl, "w_gbm": sel_wg},
        "selected_4param_matrix": {"rho_draw_blend_weight": sel_wrb_c, "rho_prior": sel_rho_c, "dispersion_r": sel_rdisp_c},
        "accepted_v5_features": accepted_v5,
        "accepted_v5_goals_features": accepted_goals_v5,
        "club_mode_a_intrinsic_1x2_all": ev_club_1x2_all,
        "club_mode_a_intrinsic_1x2_oos": ev_club_1x2_oos,
        "club_mode_a_intrinsic_1x2_flagship_oos": ev_club_1x2_flagship_oos,
        "club_mode_b_opening_microstructure_oos_vs_pinnacle_open": ev_mode_b_vs_ps_open_pow,
        "club_mode_b_opening_microstructure_oos_vs_pinnacle_open_proportional": ev_mode_b_vs_ps_open_prop,
        "club_mode_b_opening_microstructure_oos_vs_pinnacle_close_power": ev_mode_b_vs_ps_close_pow,
        "club_totals_1_5_4param_vs_v3_5": ev_club_o15,
        "club_totals_2_5_4param_vs_v3_5": ev_club_o25,
        "club_totals_2_5_4param_oos_vs_v3_5": ev_club_o25_oos,
        "club_totals_3_5_4param_vs_v3_5": ev_club_o35,
        "club_btts_4param_vs_v3_5": ev_club_btts,
        "club_btts_4param_oos_vs_v3_5": ev_club_btts_oos,
        "club_max_1x2_cone_error_v3_5": cone_err_club_v35,
        "club_max_1x2_cone_error_v5_0": cone_err_club_v51,
        "meridian_v5_0_international": intl_res,
        "artifacts": {
            "gbm_club_v5_0_sha256": hashlib.sha256(GBM_CLUB_V50_OUT.read_bytes()).hexdigest(),
            "model_club_goals_v5_0_sha256": hashlib.sha256(GOALS_CLUB_V50_OUT.read_bytes()).hexdigest(),
            "model_intl_goals_v5_0_sha256": hashlib.sha256(GOALS_INTL_V50_OUT.read_bytes()).hexdigest(),
            "club_state_v5_1_sha256": state_meta["sha256"],
        },
    }
    RESULTS_OUT.write_text(json.dumps(res_out, indent=2), encoding="utf-8")

    with TRIAL_REGISTRY_OUT.open("a", encoding="utf-8") as fh:
        fh.write(
            json.dumps(
                {
                    "recorded_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "experiment_id": "EXP_V50_soccer_v5_1_remediated",
                    "holdout_touched": False,
                    "club_1x2_oos_ll": round(ev_club_1x2_oos["log_loss"], 6),
                    "club_1x2_oos_dll": round(ev_club_1x2_oos["delta_ll_vs_benchmark"], 6),
                    "mode_b_dll_vs_ps_open_power": round(ev_mode_b_vs_ps_open_pow["delta_ll_vs_benchmark"], 6),
                    "o25_bias_pp": ev_club_o25_oos["bias_pp"],
                    "btts_bias_pp": ev_club_btts_oos["bias_pp"],
                    "meridian_cone_err_v5": intl_res["max_1x2_cone_error_v5_0"],
                }
            )
            + "\n"
        )
    print(f"[DONE] EXP_V50 v5.1 guardado en {RESULTS_OUT.name}")


if __name__ == "__main__":
    main()
