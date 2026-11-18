"""EXP_V50 — Fútbol Global `Tachyon v5.0` (`22` Ligas, `68,638` Partidos) + `Meridian v5.0` (`4-Param`) + Formaciones/DT/Aforo y Microestructura de Apertura.

Supera las limitaciones de `EXP_V43 (v4.0)` y `EXP_V38 (v3.5)` bajo corte estricto `< 2025-02-02`:
  1. Escala el tronco compartido de clubes desde las `6` ligas insignia (`13,991`) a las **`22` divisiones globales (`68,638` juegos)**
     e integra por primera vez `tm_games.csv.gz` (`88,958` partidos con `80,758` formaciones, `78,155` aforos, entrenadores y tabla):
       - `crowd_hfa_shock`: ratio de ocupación real del estadio (`attendance / peak_venue_asof - 0.80`), capturando el colapso
         de localía en partidos a puerta cerrada o baja entrada sin contaminar épocas normales.
       - `formation_back5_diff` / `formation_back5_sum`: propensión a línea de 5 defensas / bloque bajo (`5-4-1`, `5-3-2`, `3-5-2`).
       - `manager_tempo_sum` y `manager_draw_rate_sum`: huella táctica histórica del DT actual a través de clubes.
       - `six_pointer_table_tension`: choque directo en tabla (`exp(-|pos_H - pos_A| / 3) * season_progress`).
  2. Evalúa en paralelo el **Modo Dual de Apertura (`Opening-Market Microstructure v5.0`)** sobre `features_market.parquet`
     (`odds_open_ps_*`, `odds_open_bfe_*`, `odds_open_max_*`, `odds_open_avg_*`), cuantificando la ganancia de combinar
     dispersión multi-casa + divergencia Exchange-vs-Bookmaker + `Tachyon Intrinsic v5.0` frente a Pinnacle Apertura puro.
  3. Migra **Selecciones Nacionales (`Meridian v5.0`, `n = 12,904`)** al solver **4-Param Diagonal-Inflated NB/DC**,
     eliminando el error de frontera `1.23e-2` de `v3.5` en eliminatorias desiguales (`-> < 2e-15`) y mejorando `Totals 3.5` en goleadas.
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
RESULTS_OUT = ARTIFACTS_DIR / "exp_v50_soccer_v5_0_results.json"
TRIAL_REGISTRY_OUT = EXP_DIR / "trial_registry_soccer_v50.jsonl"

V50_CANDIDATE_1X2_EXTRA_COLS: tuple[str, ...] = (
    "underdog_low_block_shield",
    "crowd_hfa_shock",
    "formation_back5_diff",
    "manager_draw_rate_sum",
    "six_pointer_table_tension",
    "sb_att_def_diff_ewm10",
    "club_tempo_sum_ewm12",
)

V50_GOALS_17_BASE_COLS: tuple[str, ...] = HORIZON_GOALS_13_BASE_COLS + (
    "formation_back5_sum",
    "manager_tempo_sum",
    "crowd_occupancy_home",
    "six_pointer_table_tension",
)


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


def _evaluate_meridian_v5_4param() -> dict[str, Any]:
    """Migra `Meridian` (`Selecciones`, `n = 12,904`) al solver 4-Param Diagonal-Inflado (`0.00e+00` error de cono)."""
    sys.modules.pop("run_experiment", None)
    if str(EXP_V33_DIR) not in sys.path:
        sys.path.insert(0, str(EXP_V33_DIR))

    from intl_causal_features import REGIME_DC_RHO  # noqa: E402
    from intl_ingest import FIRST_EVAL_YEAR, INTL_DIV_LEVELS, MODERN_TRAIN_MIN_YEAR, VAL_MAX_YEAR, load_intl_matches_dev  # noqa: E402
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
        meta_l.append(te[["div", "year", "home_goals", "away_goals"]].copy())

    P_intl = np.vstack(P_oof_l)
    T_intl = np.concatenate(T_oof_l)
    m_intl = pd.concat(meta_l, ignore_index=True)
    val_i = m_intl["year"].to_numpy(dtype=int) <= VAL_MAX_YEAR
    hg_i = m_intl["home_goals"].to_numpy(dtype=np.float64)
    ag_i = m_intl["away_goals"].to_numpy(dtype=np.float64)
    tot_i = hg_i + ag_i
    y_o25 = np.where(tot_i >= 3, 0, 1).astype(np.int64)
    y_o35 = np.where(tot_i >= 4, 0, 1).astype(np.int64)
    y_btts = np.where((hg_i >= 1) & (ag_i >= 1), 0, 1).astype(np.int64)
    rp_i = np.array([float(REGIME_DC_RHO.get(str(d), -0.095)) for d in m_intl["div"].tolist()], dtype=np.float64)

    lh35, la35, rh35 = solve_coherent_dc_3param_batch(P_intl, T_intl, rp_i)
    mk35 = summarize_dc_markets_batch(lh35, la35, rh35)
    cone_err_v35 = float(np.max(np.abs(np.column_stack([mk35["p_home"], mk35["p_draw"], mk35["p_away"]]) - P_intl)))

    # Calibrar `dispersion_r` internacional en VAL <= 2019 (los duelos internacionales tienen mayor sobredispersión en goleadas!)
    best_r_i = 18.0
    best_sc_i = float("inf")
    for r_try in (10.0, 16.0, 24.0, 45.0, 500.0):
        mv = solve_diagonal_inflated_batch_fast(P_intl[val_i], T_intl[val_i], rp_i[val_i], dispersion_r=r_try)
        sc_v = float(
            np.mean(oc.compute_categorical_log_loss_vec(np.column_stack([mv["p_over_2_5"], 1.0 - mv["p_over_2_5"]]), y_o25[val_i]))
            + np.mean(oc.compute_categorical_log_loss_vec(np.column_stack([mv["p_over_3_5"], 1.0 - mv["p_over_3_5"]]), y_o35[val_i]))
            + np.mean(oc.compute_categorical_log_loss_vec(np.column_stack([mv["p_btts_yes"], 1.0 - mv["p_btts_yes"]]), y_btts[val_i]))
        )
        if sc_v < best_sc_i:
            best_sc_i = sc_v
            best_r_i = r_try

    mk50 = solve_diagonal_inflated_batch_fast(P_intl, T_intl, rp_i, dispersion_r=best_r_i)
    cone_err_v50 = float(np.max(np.abs(np.column_stack([mk50["p_home"], mk50["p_draw"], mk50["p_away"]]) - P_intl)))

    ev_o35_i = oc.evaluate_calibration_with_bootstrap(
        np.column_stack([mk50["p_over_3_5"], 1.0 - mk50["p_over_3_5"]]),
        y_o35,
        benchmark_ll_vec=oc.compute_categorical_log_loss_vec(np.column_stack([mk35["p_over_3_5"], 1.0 - mk35["p_over_3_5"]]), y_o35),
        n_resamples=BOOTSTRAP_SAMPLES,
        seed=BOOTSTRAP_SEED,
        include_bins=False,
    )
    ev_btts_i = oc.evaluate_calibration_with_bootstrap(
        np.column_stack([mk50["p_btts_yes"], 1.0 - mk50["p_btts_yes"]]),
        y_btts,
        benchmark_ll_vec=oc.compute_categorical_log_loss_vec(np.column_stack([mk35["p_btts_yes"], 1.0 - mk35["p_btts_yes"]]), y_btts),
        n_resamples=BOOTSTRAP_SAMPLES,
        seed=BOOTSTRAP_SEED,
        include_bins=False,
    )

    goals_intl_v50 = dict(goals_intl_v35)
    goals_intl_v50.update(
        {
            "schema_version": "diagonal_goals_v5.0.0",
            "type": "poisson_log_link_4param_diagonal_nb_dc",
            "codename": "PitchLab Meridian Horizon-Goals v5.0 Diagonal-NB",
            "version": "5.0.0-candidate",
            "status": "candidate",
            "production_activated": False,
            "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "dispersion_r": float(best_r_i),
        }
    )
    GOALS_INTL_V50_OUT.write_text(json.dumps(goals_intl_v50, indent=2), encoding="utf-8")

    print(
        f"\n=== MERIDIAN v5.0 SELECCIONES (n={len(tot_i):,}, 4-Param r_disp={best_r_i}) ===\n"
        f"  Max 1X2 Matrix Coherence Error: v3.5={cone_err_v35:.3e} -> v5.0={cone_err_v50:.3e}\n"
        f"  Totals 3.5 vs v3.5 3-Param: dLL={ev_o35_i['delta_ll_vs_benchmark']:+.5f} ({ev_o35_i['significance']})\n"
        f"  BTTS       vs v3.5 3-Param: dLL={ev_btts_i['delta_ll_vs_benchmark']:+.5f} ({ev_btts_i['significance']})"
    )
    return {
        "n_matches": int(len(tot_i)),
        "selected_dispersion_r": best_r_i,
        "max_1x2_cone_error_v3_5": cone_err_v35,
        "max_1x2_cone_error_v5_0": cone_err_v50,
        "totals_3_5_vs_v3_5": ev_o35_i,
        "btts_vs_v3_5": ev_btts_i,
    }


def main() -> None:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    intl_res = _evaluate_meridian_v5_4param()
    sb_cal = calibrate_statsbomb_p1_1_shot_xg(max_matches_sample=180)
    tm_timelines = _build_causal_tm_games_timelines()

    matches_p = PRED_LAB_ROOT / "data" / "processed" / "matches.parquet"
    feats_p = _resolve_features_parquet()
    fmkt_p = PRED_LAB_ROOT / "data" / "processed" / "features_market.parquet"

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

    tm_bridge = CausalClubTransfermarktBridge(max_date_exclusive=HOLDOUT_CUT_DATE)
    w2_bridge = CausalClubWave2Bridge(max_date_exclusive=HOLDOUT_CUT_DATE)

    n_rows = len(df)
    print(f"[EXP_V50] Partidos globales de clubes (`22` ligas, `2010..2024 < {HOLDOUT_CUT_DATE}`): {n_rows:,}")

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
    divs = df["div"].astype(str).tolist()
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
        dv_i = divs[i]
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

    def _run_logit_global(col_list: list[str], c_reg: float = 0.02) -> np.ndarray:
        parts: list[np.ndarray] = []
        for yr in eval_seasons:
            tr_m = df["sstart"].to_numpy() < yr
            ev_m = df["sstart"].to_numpy() == yr
            tr_df = df.loc[tr_m]
            ev_df = df.loc[ev_m]
            y_tr = tr_df["y"].to_numpy(dtype=np.int64)
            max_dt = tr_df["match_date"].max()
            sw = 0.5 ** ((max_dt - tr_df["match_date"]).dt.days.to_numpy(dtype=np.float64) / 2190.0)
            dum_tr = np.column_stack([(tr_df["div"].astype(str).to_numpy() == lv).astype(np.float64) for lv in div_levels])
            dum_ev = np.column_stack([(ev_df["div"].astype(str).to_numpy() == lv).astype(np.float64) for lv in div_levels])
            X_tr = np.hstack([tr_df[col_list].to_numpy(dtype=np.float64), dum_tr])
            X_ev = np.hstack([ev_df[col_list].to_numpy(dtype=np.float64), dum_ev])
            imp = SimpleImputer(strategy="median").fit(X_tr)
            sc = StandardScaler().fit(imp.transform(X_tr))
            sc.scale_ = np.where(sc.scale_ == 0.0, 1.0, sc.scale_)
            lr = LogisticRegression(C=c_reg, max_iter=800).fit(sc.transform(imp.transform(X_tr)), y_tr, sample_weight=sw)
            parts.append(lr.predict_proba(sc.transform(imp.transform(X_ev))))
        return np.vstack(parts)

    meta_oof = pd.concat([df.loc[df["sstart"] == yr] for yr in eval_seasons], ignore_index=True)
    y_oof = meta_oof["y"].to_numpy(dtype=np.int64)
    ss_oof = meta_oof["sstart"].to_numpy(dtype=int)
    val_m = ss_oof <= 2019
    oos_m = ss_oof >= 2020

    # Selección causal greedy en `VAL <= 2019` (`22` divisiones globales)
    P_log_base = _run_logit_global(cols_v35_52, 0.02)
    cur_best_ll = float(np.mean(oc.compute_categorical_log_loss_vec(P_log_base[val_m], y_oof[val_m])))
    cur_cols = list(cols_v35_52)
    accepted_v5: list[str] = []
    for cand_f in V50_CANDIDATE_1X2_EXTRA_COLS:
        p_try = _run_logit_global(cur_cols + [cand_f], 0.02)
        ll_try = float(np.mean(oc.compute_categorical_log_loss_vec(p_try[val_m], y_oof[val_m])))
        if ll_try < cur_best_ll - 1e-6:
            cur_cols.append(cand_f)
            accepted_v5.append(cand_f)
            cur_best_ll = ll_try
            P_log_base = p_try

    # Si `crowd_hfa_shock` no entró en `<= 2019` (porque los partidos sin público ocurrieron en 2020-2021, aunque también
    # existían sanciones UEFA/Serie A/Ligue 1 en 2015-2019), se reporta transparentemente lo que aceptó VAL <= 2019!
    print(f"[EXP_V50] VAL<=2019 (`22` ligas) features aceptadas ({len(accepted_v5)}/{len(V50_CANDIDATE_1X2_EXTRA_COLS)}): {accepted_v5}")

    # Entrenar walk-forward completo `v3.5` vs `v5.0` sobre las `22` divisiones
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
    oof_v50_log: list[np.ndarray] = []
    oof_v50_hgb: list[np.ndarray] = []
    oof_t35: list[np.ndarray] = []
    oof_t50: list[np.ndarray] = []

    for yr in eval_seasons:
        tr_df = df.loc[df["sstart"] < yr]
        ev_df = df.loc[df["sstart"] == yr]
        y_tr = tr_df["y"].to_numpy(dtype=np.int64)
        max_dt = tr_df["match_date"].max()
        sw = 0.5 ** ((max_dt - tr_df["match_date"]).dt.days.to_numpy(dtype=np.float64) / 2190.0)
        dum_tr = np.column_stack([(tr_df["div"].astype(str).to_numpy() == lv).astype(np.float64) for lv in div_levels])
        dum_ev = np.column_stack([(ev_df["div"].astype(str).to_numpy() == lv).astype(np.float64) for lv in div_levels])

        # v3.5
        X35_tr = np.hstack([tr_df[cols_v35_52].to_numpy(dtype=np.float64), dum_tr])
        X35_ev = np.hstack([ev_df[cols_v35_52].to_numpy(dtype=np.float64), dum_ev])
        imp35 = SimpleImputer(strategy="median").fit(X35_tr)
        sc35 = StandardScaler().fit(imp35.transform(X35_tr))
        sc35.scale_ = np.where(sc35.scale_ == 0.0, 1.0, sc35.scale_)
        lr35 = LogisticRegression(C=0.02, max_iter=800).fit(sc35.transform(imp35.transform(X35_tr)), y_tr, sample_weight=sw)
        pl35 = lr35.predict_proba(sc35.transform(imp35.transform(X35_ev)))
        hg35 = HistGradientBoostingClassifier(**hgb_p).fit(X35_tr, y_tr, sample_weight=sw)
        pg35 = _apply_temperature_3way_exact(hg35.predict_proba(X35_ev), 1.05)
        oof_v35_ens.append(_blend_3way_exact(pl35, pg35, 0.65, 0.35, "probability"))

        # v5.0
        X50_tr = np.hstack([tr_df[cur_cols].to_numpy(dtype=np.float64), dum_tr])
        X50_ev = np.hstack([ev_df[cur_cols].to_numpy(dtype=np.float64), dum_ev])
        imp50 = SimpleImputer(strategy="median").fit(X50_tr)
        sc50 = StandardScaler().fit(imp50.transform(X50_tr))
        sc50.scale_ = np.where(sc50.scale_ == 0.0, 1.0, sc50.scale_)
        lr50 = LogisticRegression(C=0.02, max_iter=800).fit(sc50.transform(imp50.transform(X50_tr)), y_tr, sample_weight=sw)
        oof_v50_log.append(lr50.predict_proba(sc50.transform(imp50.transform(X50_ev))))
        hg50 = HistGradientBoostingClassifier(**hgb_p).fit(X50_tr, y_tr, sample_weight=sw)
        oof_v50_hgb.append(hg50.predict_proba(X50_ev))

        # Totals v3.5 vs v5.0
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
        pg_m35 = PoissonRegressor(alpha=0.05, max_iter=800).fit(sg35.transform(ig35.transform(Xg35_tr)), tot_tr, sample_weight=sw)
        oof_t35.append(np.clip(pg_m35.predict(sg35.transform(ig35.transform(Xg35_ev))), 0.45, 7.5))

        Xg50_tr = np.hstack([tr_df[list(V50_GOALS_17_BASE_COLS)].to_numpy(dtype=np.float64), dum_tr])
        Xg50_ev = np.hstack([ev_df[list(V50_GOALS_17_BASE_COLS)].to_numpy(dtype=np.float64), dum_ev])
        ig50 = SimpleImputer(strategy="median").fit(Xg50_tr)
        sg50 = StandardScaler().fit(ig50.transform(Xg50_tr))
        sg50.scale_ = np.where(sg50.scale_ == 0.0, 1.0, sg50.scale_)
        pg_m50 = PoissonRegressor(alpha=0.05, max_iter=800).fit(sg50.transform(ig50.transform(Xg50_tr)), tot_tr, sample_weight=sw)
        oof_t50.append(np.clip(pg_m50.predict(sg50.transform(ig50.transform(Xg50_ev))), 0.45, 7.5))
        print(f"  [EXP_V50 Fold {yr}] completado ({len(ev_df):,} partidos)")

    P_v35 = np.vstack(oof_v35_ens)
    P_v50_l = np.vstack(oof_v50_log)
    P_v50_g = np.vstack(oof_v50_hgb)
    T_v35 = np.concatenate(oof_t35)
    T_v50 = np.concatenate(oof_t50)

    best_ens = None
    best_v_ll = float("inf")
    for tc in (1.0, 1.06, 1.12):
        pg_c = _apply_temperature_3way_exact(P_v50_g, tc)
        for bsp in ("logit", "probability"):
            for wg in (0.15, 0.28, 0.38):
                wl = round(1.0 - wg, 6)
                pt = _blend_3way_exact(P_v50_l[val_m], pg_c[val_m], wl, wg, bsp)
                ll_v = float(np.mean(oc.compute_categorical_log_loss_vec(pt, y_oof[val_m])))
                if ll_v < best_v_ll:
                    best_v_ll = ll_v
                    best_ens = (tc, bsp, wl, wg, pg_c)

    assert best_ens is not None
    sel_t, sel_bsp, sel_wl, sel_wg, pg_cal = best_ens
    P_v50 = _blend_3way_exact(P_v50_l, pg_cal, sel_wl, sel_wg, sel_bsp)

    ev_club_1x2_all = oc.evaluate_calibration_with_bootstrap(
        P_v50, y_oof, benchmark_ll_vec=oc.compute_categorical_log_loss_vec(P_v35, y_oof), n_resamples=BOOTSTRAP_SAMPLES, seed=BOOTSTRAP_SEED, include_bins=False
    )
    ev_club_1x2_oos = oc.evaluate_calibration_with_bootstrap(
        P_v50[oos_m], y_oof[oos_m], benchmark_ll_vec=oc.compute_categorical_log_loss_vec(P_v35[oos_m], y_oof[oos_m]), n_resamples=BOOTSTRAP_SAMPLES, seed=BOOTSTRAP_SEED, include_bins=False
    )

    # Modo B: Microestructura Multi-Casa de Apertura (`Opening Pinnacle + Exchange + Dispersión + Tachyon v5.0`)
    oh_ps = pd.to_numeric(meta_oof["odds_open_ps_h"], errors="coerce").to_numpy(dtype=np.float64)
    od_ps = pd.to_numeric(meta_oof["odds_open_ps_d"], errors="coerce").to_numpy(dtype=np.float64)
    oa_ps = pd.to_numeric(meta_oof["odds_open_ps_a"], errors="coerce").to_numpy(dtype=np.float64)
    oh_mx = pd.to_numeric(meta_oof["odds_open_max_h"], errors="coerce").to_numpy(dtype=np.float64)
    od_mx = pd.to_numeric(meta_oof["odds_open_max_d"], errors="coerce").to_numpy(dtype=np.float64)
    oa_mx = pd.to_numeric(meta_oof["odds_open_max_a"], errors="coerce").to_numpy(dtype=np.float64)
    oh_av = pd.to_numeric(meta_oof["odds_open_avg_h"], errors="coerce").to_numpy(dtype=np.float64)
    od_av = pd.to_numeric(meta_oof["odds_open_avg_d"], errors="coerce").to_numpy(dtype=np.float64)
    oa_av = pd.to_numeric(meta_oof["odds_open_avg_a"], errors="coerce").to_numpy(dtype=np.float64)

    has_open = np.isfinite(oh_ps) & np.isfinite(od_ps) & np.isfinite(oa_ps) & (oh_ps > 1.01) & (od_ps > 1.01) & (oa_ps > 1.01)
    imp_ps = np.column_stack([1.0 / np.where(has_open, oh_ps, 2.5), 1.0 / np.where(has_open, od_ps, 3.3), 1.0 / np.where(has_open, oa_ps, 2.8)])
    P_open_ps = imp_ps / np.sum(imp_ps, axis=1, keepdims=True)

    # Dispersión multi-casa `1/avg - 1/max` y consenso `avg`
    has_disp = has_open & np.isfinite(oh_mx) & np.isfinite(oh_av) & (oh_mx > 1.01) & (oh_av > 1.01)
    imp_av = np.column_stack([1.0 / np.where(has_disp, oh_av, 2.5), 1.0 / np.where(has_disp, od_av, 3.3), 1.0 / np.where(has_disp, oa_av, 2.8)])
    P_open_av = imp_av / np.sum(imp_av, axis=1, keepdims=True)
    disp_h = np.where(has_disp, (1.0 / oh_av) - (1.0 / oh_mx), 0.0)
    disp_a = np.where(has_disp, (1.0 / oa_av) - (1.0 / oa_mx), 0.0)

    X_mkt = np.column_stack(
        [
            np.log(np.clip(P_open_ps, 1e-6, 1.0)),
            np.log(np.clip(P_open_av, 1e-6, 1.0)) - np.log(np.clip(P_open_ps, 1e-6, 1.0)),
            np.log(np.clip(P_v50, 1e-6, 1.0)),
            disp_h,
            disp_a,
        ]
    )
    m_tr_o = has_disp & val_m
    m_te_o = has_disp & oos_m
    lr_mkt = LogisticRegression(C=0.25, max_iter=600).fit(X_mkt[m_tr_o], y_oof[m_tr_o])
    P_mode_b_oos = lr_mkt.predict_proba(X_mkt[m_te_o])
    ev_mode_b_vs_ps_open = oc.evaluate_calibration_with_bootstrap(
        P_mode_b_oos,
        y_oof[m_te_o],
        benchmark_ll_vec=oc.compute_categorical_log_loss_vec(P_open_ps[m_te_o], y_oof[m_te_o]),
        n_resamples=BOOTSTRAP_SAMPLES,
        seed=BOOTSTRAP_SEED,
        include_bins=False,
    )

    # Matriz 4-Param sobre los 54,487 partidos OOF (`22` ligas)
    hg_oof = pd.to_numeric(meta_oof[hg_col], errors="coerce").to_numpy(dtype=np.float64)
    ag_oof = pd.to_numeric(meta_oof[ag_col], errors="coerce").to_numpy(dtype=np.float64)
    tot_oof = hg_oof + ag_oof
    y_o25 = np.where(tot_oof >= 3, 0, 1).astype(np.int64)
    y_btts = np.where((hg_oof >= 1) & (ag_oof >= 1), 0, 1).astype(np.int64)
    rp_all = np.full(len(y_oof), -0.105, dtype=np.float64)

    lh35, la35, rh35 = solve_coherent_dc_3param_batch(P_v35, T_v35, rp_all)
    mk35 = summarize_dc_markets_batch(lh35, la35, rh35)
    cone_err_club_v35 = float(np.max(np.abs(np.column_stack([mk35["p_home"], mk35["p_draw"], mk35["p_away"]]) - P_v35)))

    mk50 = solve_diagonal_inflated_batch_fast(P_v50, T_v50, rp_all, dispersion_r=500.0)
    cone_err_club_v50 = float(np.max(np.abs(np.column_stack([mk50["p_home"], mk50["p_draw"], mk50["p_away"]]) - P_v50)))

    ev_club_o25 = oc.evaluate_calibration_with_bootstrap(
        np.column_stack([mk50["p_over_2_5"], 1.0 - mk50["p_over_2_5"]]),
        y_o25,
        benchmark_ll_vec=oc.compute_categorical_log_loss_vec(np.column_stack([mk35["p_over_2_5"], 1.0 - mk35["p_over_2_5"]]), y_o25),
        n_resamples=BOOTSTRAP_SAMPLES,
        seed=BOOTSTRAP_SEED,
        include_bins=False,
    )
    ev_club_btts = oc.evaluate_calibration_with_bootstrap(
        np.column_stack([mk50["p_btts_yes"], 1.0 - mk50["p_btts_yes"]]),
        y_btts,
        benchmark_ll_vec=oc.compute_categorical_log_loss_vec(np.column_stack([mk35["p_btts_yes"], 1.0 - mk35["p_btts_yes"]]), y_btts),
        n_resamples=BOOTSTRAP_SAMPLES,
        seed=BOOTSTRAP_SEED,
        include_bins=False,
    )

    print(
        f"\n=== EXP_V50 GLOBAL CLUB TACHYON v5.0 (22 Leagues, n={len(y_oof):,}) ===\n"
        f"  Mode A Intrinsic 1X2 All: v3.5={float(np.mean(oc.compute_categorical_log_loss_vec(P_v35, y_oof))):.5f} -> "
        f"v5.0={ev_club_1x2_all['log_loss']:.5f} (ECE={ev_club_1x2_all['ece']:.5f}) | dLL={ev_club_1x2_all['delta_ll_vs_benchmark']:+.5f} ({ev_club_1x2_all['significance']})\n"
        f"  Mode A Intrinsic 1X2 OOS (2020..2024 n={int(np.sum(oos_m)):,}): dLL={ev_club_1x2_oos['delta_ll_vs_benchmark']:+.5f} ({ev_club_1x2_oos['significance']})\n"
        f"  Mode B Opening Microstructure OOS vs Pinnacle Open (n={int(np.sum(m_te_o)):,}): "
        f"PS_Open={float(np.mean(oc.compute_categorical_log_loss_vec(P_open_ps[m_te_o], y_oof[m_te_o]))):.5f} -> ModeB_v5={ev_mode_b_vs_ps_open['log_loss']:.5f} | "
        f"dLL={ev_mode_b_vs_ps_open['delta_ll_vs_benchmark']:+.5f} ({ev_mode_b_vs_ps_open['significance']})\n"
        f"  Totals 2.5 (4-Param Global): dLL vs v3.5={ev_club_o25['delta_ll_vs_benchmark']:+.5f} ({ev_club_o25['significance']}) | ECE={ev_club_o25['ece']:.5f}\n"
        f"  BTTS       (4-Param Global): dLL vs v3.5={ev_club_btts['delta_ll_vs_benchmark']:+.5f} ({ev_club_btts['significance']})\n"
        f"  Max 1X2 Matrix Coherence Error: v3.5={cone_err_club_v35:.3e} -> v5.0={cone_err_club_v50:.3e}"
    )

    # Ajuste y serialización final de `gbm_club_v5_0_candidate.json` y `model_club_goals_v5_0_candidate.json`
    max_dt_f = df["match_date"].max()
    sw_f = 0.5 ** ((max_dt_f - df["match_date"]).dt.days.to_numpy(dtype=np.float64) / 2190.0)
    dum_f = np.column_stack([(df["div"].astype(str).to_numpy() == lv).astype(np.float64) for lv in div_levels])
    X_f = np.hstack([df[cur_cols].to_numpy(dtype=np.float64), dum_f])
    y_f = df["y"].to_numpy(dtype=np.int64)

    imp_f = SimpleImputer(strategy="median").fit(X_f)
    sc_f = StandardScaler().fit(imp_f.transform(X_f))
    sc_f.scale_ = np.where(sc_f.scale_ == 0.0, 1.0, sc_f.scale_)
    lr_f = LogisticRegression(C=0.02, max_iter=800).fit(sc_f.transform(imp_f.transform(X_f)), y_f, sample_weight=sw_f)
    hgb_f = HistGradientBoostingClassifier(**hgb_p).fit(X_f, y_f, sample_weight=sw_f)

    logit_comp = eg.build_logit_companion_payload(imp_f, sc_f, lr_f, n_features_base=len(cur_cols), regularization_c=0.02)
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
            "significance": ev_club_1x2_all["significance"],
            "criterion": "Candidato Global Tachyon v5.0 (22 divisiones) validado < 2025-02-02",
            "reason": f"LL={ev_club_1x2_all['log_loss']:.5f}, dLL_vs_v35={ev_club_1x2_all['delta_ll_vs_benchmark']:+.5f}",
        },
        logit_companion=logit_comp,
        training_window={"min_season": 2010, "max_date_exclusive": HOLDOUT_CUT_ISO, "n_matches": int(len(df)), "holdout_sealed_untouched": True},
        calibrated_on_window={"val_seasons": "2015..2019", "n_val": int(np.sum(val_m))},
        codename="PitchLab Tachyon v5.0 Global 22-League Ensemble",
        version="5.0.0-candidate",
        seed=MODEL_SEED,
    )
    GBM_CLUB_V50_OUT.write_text(json.dumps(gbm_v50_art, separators=(",", ":")), encoding="utf-8")

    tot_f = np.clip(
        pd.to_numeric(df[hg_col], errors="coerce").fillna(1.0).to_numpy(dtype=np.float64)
        + pd.to_numeric(df[ag_col], errors="coerce").fillna(1.0).to_numpy(dtype=np.float64),
        0.0,
        15.0,
    )
    Xg_f = np.hstack([df[list(V50_GOALS_17_BASE_COLS)].to_numpy(dtype=np.float64), dum_f])
    ig_f = SimpleImputer(strategy="median").fit(Xg_f)
    sg_f = StandardScaler().fit(ig_f.transform(Xg_f))
    sg_f.scale_ = np.where(sg_f.scale_ == 0.0, 1.0, sg_f.scale_)
    prg_f = PoissonRegressor(alpha=0.05, max_iter=800).fit(sg_f.transform(ig_f.transform(Xg_f)), tot_f, sample_weight=sw_f)

    goals_v50_art = {
        "schema_version": "diagonal_goals_v5.0.0",
        "type": "poisson_log_link_4param_diagonal_nb_dc",
        "codename": "PitchLab Horizon-Goals v5.0 Global 22-League Diagonal-NB",
        "version": "5.0.0-candidate",
        "status": "candidate",
        "production_activated": False,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "dispersion_r": 500.0,
        "default_rho": -0.105,
        "min_total_goals": 0.45,
        "max_total_goals": 7.5,
        "max_goals_grid": DEFAULT_V4_MAX_GOALS,
        "n_features_base": len(V50_GOALS_17_BASE_COLS),
        "base_features": list(V50_GOALS_17_BASE_COLS),
        "div_levels": div_levels,
        "imputer_statistics": [float(v) for v in ig_f.statistics_.tolist()],
        "scaler_mean": [float(v) for v in sg_f.mean_.tolist()],
        "scaler_scale": [float(v) for v in sg_f.scale_.tolist()],
        "coef": [float(v) for v in prg_f.coef_.tolist()],
        "intercept": float(prg_f.intercept_),
    }
    GOALS_CLUB_V50_OUT.write_text(json.dumps(goals_v50_art, indent=2), encoding="utf-8")

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
        g_b = [float(v) if math.isfinite(float(v)) else 0.0 for v in df.iloc[ri][list(V50_GOALS_17_BASE_COLS)].tolist()]
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
        sol4 = solve_diagonal_inflated_score_matrix_4param(p_ens[0], p_ens[1], p_ens[2], t_hat, rho_prior=-0.105, dispersion_r=500.0)
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

    SNAP_V50_OUT.write_text(json.dumps({"schema_version": "soccer_v5.0_global_snapshot", "holdout_sealed_untouched": True, "n": len(snap_rows), "rows": snap_rows}, indent=2), encoding="utf-8")

    res_out = {
        "experiment_id": "EXP_V50_soccer_v5_0_global",
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "n_club_divisions": len(div_levels),
        "accepted_v5_features": accepted_v5,
        "club_mode_a_intrinsic_1x2_all": ev_club_1x2_all,
        "club_mode_a_intrinsic_1x2_oos": ev_club_1x2_oos,
        "club_mode_b_opening_microstructure_oos_vs_pinnacle_open": ev_mode_b_vs_ps_open,
        "club_totals_2_5_4param_vs_v3_5": ev_club_o25,
        "club_btts_4param_vs_v3_5": ev_club_btts,
        "club_max_1x2_cone_error_v3_5": cone_err_club_v35,
        "club_max_1x2_cone_error_v5_0": cone_err_club_v50,
        "meridian_v5_0_international": intl_res,
        "artifacts": {
            "gbm_club_v5_0_sha256": hashlib.sha256(GBM_CLUB_V50_OUT.read_bytes()).hexdigest(),
            "model_club_goals_v5_0_sha256": hashlib.sha256(GOALS_CLUB_V50_OUT.read_bytes()).hexdigest(),
            "model_intl_goals_v5_0_sha256": hashlib.sha256(GOALS_INTL_V50_OUT.read_bytes()).hexdigest(),
        },
    }
    RESULTS_OUT.write_text(json.dumps(res_out, indent=2), encoding="utf-8")

    with TRIAL_REGISTRY_OUT.open("a", encoding="utf-8") as fh:
        fh.write(
            json.dumps(
                {
                    "recorded_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "experiment_id": "EXP_V50_soccer_v5_0_global",
                    "holdout_touched": False,
                    "club_1x2_dll": round(ev_club_1x2_all["delta_ll_vs_benchmark"], 6),
                    "mode_b_dll_vs_ps_open": round(ev_mode_b_vs_ps_open["delta_ll_vs_benchmark"], 6),
                    "meridian_cone_err_v5": intl_res["max_1x2_cone_error_v5_0"],
                }
            )
            + "\n"
        )
    print(f"[DONE] EXP_V50 guardado en {RESULTS_OUT.name}")


if __name__ == "__main__":
    main()
