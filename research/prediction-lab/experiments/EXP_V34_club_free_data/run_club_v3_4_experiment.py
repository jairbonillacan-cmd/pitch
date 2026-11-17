"""Evaluación walk-forward (`< 2025-02-02`) de Ola 2 para Fútbol de Clubes (`EXP_V36_club_v3_4`):
`PitchLab Tachyon v3.4 Candidate` + Motor Cero-Sesgo Vivo `PitchLab Tachyon v3.4 Live-Complete`.

Evalúa sobre `n = 68,638` partidos (`2016..2024`, `< 2025-02-02`, `1,000` réplicas bootstrap `mulberry32`):
  1. `v3_0_live_38_of_113`: cobertura viva actual de `Tachyon v3.0` (`LL = 1.01550`, `33.6%` cobertura).
  2. `v3_0_full_113`: histórico completo `Tachyon v3.0` (`LL = 1.00995`).
  3. `v3_3_candidate_120`: `Tachyon v3.3 Candidate` de Ola 1 (`LL = 1.00904`, `113 + P1-1 + TM6`).
  4. Nuevos bloques `CC0` de Ola 2 seleccionados estrictamente en `VAL <= 2023`:
     - `W2_Cup`: fatiga oculta entre semana por Champions/Europa League/Copas (`tm_midweek_cup_adv`, `tm_games_14d_adv`).
     - `W2_XI`: valor real del XI alineado y merma por lesiones (`tm_realized_xi_val_diff`, `tm_injury_avail_ratio_diff`, `tm_xi_ga90_allcomps_diff`).
     - `W2_Transfers`: flujo neto de talento e inversión en ventana de fichajes `120d` (`tm_net_transfer_val_120d_diff`, `tm_inbound_fee_120d_diff`).
  5. `tachyon_v3_4_live_complete`: modelo dedicado entrenado exclusivamente sobre variables `100%` disponibles en vivo
     (`LIVE_38 + Free Open Stack`), eliminando por completo la distorsión de imputación de las 75 columnas ausentes en `v3.0`.
"""

from __future__ import annotations

import os

os.environ.setdefault("OMP_NUM_THREADS", "4")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")

from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import sys
from typing import Any

import numpy as np
import pandas as pd

EXP_DIR = Path(__file__).resolve().parent
REPO_ROOT = EXP_DIR.parents[3]
PRED_LAB_ROOT = REPO_ROOT / "research" / "prediction-lab"

for _p in (str(REPO_ROOT), str(PRED_LAB_ROOT / "models" / "a"), str(EXP_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from services.models import outlook_calibration as oc  # noqa: E402

from club_free_sources import (  # noqa: E402
    ARTIFACTS_DIR,
    HOLDOUT_CUT_DATE,
    CausalClubTransfermarktBridge,
    calibrate_statsbomb_p1_1_shot_xg,
)
from club_wave2_sources import CausalClubWave2Bridge  # noqa: E402
from run_club_experiment import (  # noqa: E402
    BASE_113_FEATURES,
    BOOTSTRAP_SAMPLES,
    BOOTSTRAP_SEED,
    HOLDOUT_CUT_ISO,
    HOLDOUT_CUT_TS,
    LIVE_V30_POPULATED_SET,
    MODEL_SEED,
    SB_1_COL,
    TM_6_COLS,
    TRIAL_REGISTRY_CLUB_OUT,
    _compute_statsbomb_ewm_feature,
    _fit_and_predict_logit,
    _power_devig_3way,
    _resolve_features_parquet,
)

W2_CUP_COLS: tuple[str, ...] = (
    "tm_midweek_cup_adv",
    "tm_games_14d_adv",
)

W2_XI_COLS: tuple[str, ...] = (
    "tm_realized_xi_val_diff",
    "tm_injury_avail_ratio_diff",
    "tm_xi_ga90_allcomps_diff",
)

W2_TRANSFER_COLS: tuple[str, ...] = (
    "tm_net_transfer_val_120d_diff",
    "tm_inbound_fee_120d_diff",
)

ALL_W2_CLUB_COLS: tuple[str, ...] = W2_CUP_COLS + W2_XI_COLS + W2_TRANSFER_COLS

CANDIDATE_V34_JSON_OUT = REPO_ROOT / "src" / "data" / "prediction" / "model_club_v3_4_candidate.json"
CANDIDATE_V34_SNAP_OUT = REPO_ROOT / "src" / "data" / "prediction" / "club_v3_4_snapshot.json"
LIVE_COMPLETE_V34_JSON_OUT = REPO_ROOT / "src" / "data" / "prediction" / "model_club_v3_4_live_candidate.json"
LIVE_COMPLETE_V34_SNAP_OUT = REPO_ROOT / "src" / "data" / "prediction" / "club_v3_4_live_snapshot.json"
RESULTS_V34_JSON_OUT = ARTIFACTS_DIR / "exp_v36_club_v3_4_results.json"


def main() -> None:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    sb_cal = calibrate_statsbomb_p1_1_shot_xg(max_matches_sample=180)

    matches_p = PRED_LAB_ROOT / "data" / "processed" / "matches.parquet"
    feats_p = _resolve_features_parquet()

    m_df = pd.read_parquet(matches_p)
    m_df["match_date"] = pd.to_datetime(m_df["match_date"])
    m_df = m_df[(m_df["match_date"] < HOLDOUT_CUT_TS) & m_df["result"].notna()].copy()
    if bool((m_df["match_date"] >= HOLDOUT_CUT_TS).any()):
        raise RuntimeError("HoldoutSealedAccessError en matches.parquet")

    f_df = pd.read_parquet(feats_p)
    f_df["match_date"] = pd.to_datetime(f_df["match_date"])
    f_df = f_df[(f_df["match_date"] < HOLDOUT_CUT_TS) & f_df["y"].notna()].copy()
    f_df["y"] = f_df["y"].astype(np.int64)
    f_df["sstart"] = f_df["season"].astype(str).str[:4].astype(int)

    sb_sig_df = _compute_statsbomb_ewm_feature(m_df, sb_cal)
    m_join = m_df[["match_id", "home_team", "away_team", "odds_close_ps_h", "odds_close_ps_d", "odds_close_ps_a"]].drop_duplicates("match_id")
    df = (
        f_df[f_df["sstart"] >= 2010]
        .merge(m_join, on="match_id", how="left", suffixes=("", "_m"))
        .merge(sb_sig_df, on="match_id", how="left")
    )
    ht_col = "home_team" if "home_team" in df.columns else "home_team_m"
    at_col = "away_team" if "away_team" in df.columns else "away_team_m"
    df = df.sort_values(["match_date", "match_id"], kind="mergesort").reset_index(drop=True)

    tm_bridge = CausalClubTransfermarktBridge(max_date_exclusive=HOLDOUT_CUT_DATE)
    w2_bridge = CausalClubWave2Bridge(max_date_exclusive=HOLDOUT_CUT_DATE)

    n_rows = len(df)
    tm6_mat = np.zeros((n_rows, len(TM_6_COLS)), dtype=np.float64)
    w2_mat = np.zeros((n_rows, len(ALL_W2_CLUB_COLS)), dtype=np.float64)
    w2_xi_matched = 0

    d_ords = df["match_date"].map(lambda d: d.toordinal()).to_numpy(dtype=np.int64)
    divs = df["div"].astype(str).to_numpy()
    h_names = df[ht_col].astype(str).to_numpy()
    a_names = df[at_col].astype(str).to_numpy()
    elo_diffs = pd.to_numeric(df["elo_diff_no_hfa"], errors="coerce").fillna(0.0).to_numpy(dtype=np.float64)
    h_prom = pd.to_numeric(df["h_div_change"], errors="coerce").fillna(0.0).to_numpy(dtype=np.float64)
    a_prom = pd.to_numeric(df["a_div_change"], errors="coerce").fillna(0.0).to_numpy(dtype=np.float64)

    div_ewm_log_val: dict[str, float] = {}
    div_ewm_xi_val: dict[str, float] = {}
    alpha_div = 0.04

    for i in range(n_rows):
        dv_i = divs[i]
        m_ord = int(d_ords[i])
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

        tm6_mat[i, 0] = val_diff
        tm6_mat[i, 1] = depth_diff
        tm6_mat[i, 2] = gap_diff
        tm6_mat[i, 3] = h_prom[i] * rel_h - a_prom[i] * rel_a
        tm6_mat[i, 4] = th["tm_new_mgr_flag"] - ta["tm_new_mgr_flag"]
        tm6_mat[i, 5] = th["tm_mgr_pae"] - ta["tm_mgr_pae"]

        # Señales Wave 2
        cid_h = tm_bridge.resolve_club_id(dv_i, h_names[i])
        cid_a = tm_bridge.resolve_club_id(dv_i, a_names[i])
        w2_h = w2_bridge.lookup_club_wave2(cid_h, m_ord)
        w2_a = w2_bridge.lookup_club_wave2(cid_a, m_ord)

        # Ventaja de frescura: positivo cuando el VISITANTE jugó UEFA/Copa entre semana y el local descansó
        w2_mat[i, 0] = w2_a["midweek_cup_load"] - w2_h["midweek_cup_load"]
        w2_mat[i, 1] = w2_a["games_14d_allcomps"] - w2_h["games_14d_allcomps"]

        hx = w2_h["has_realized_xi"] > 0.0
        ax = w2_a["has_realized_xi"] > 0.0
        if hx:
            w2_xi_matched += 1
        if ax:
            w2_xi_matched += 1

        cur_xi_med = div_ewm_xi_val.get(dv_i, 3.20)
        if hx and ax:
            xi_val_diff = w2_h["realized_xi_log_val"] - w2_a["realized_xi_log_val"]
            avail_diff = w2_h["injury_avail_ratio"] - w2_a["injury_avail_ratio"]
            ga90_diff = w2_h["xi_ga90_allcomps"] - w2_a["xi_ga90_allcomps"]
        elif hx and not ax:
            xi_val_diff = 0.55 * ((w2_h["realized_xi_log_val"] - cur_xi_med) - (-0.30))
            avail_diff = 0.55 * (w2_h["injury_avail_ratio"] - 0.85)
            ga90_diff = 0.55 * (w2_h["xi_ga90_allcomps"] - 2.10)
        elif ax and not hx:
            xi_val_diff = 0.55 * ((-0.30) - (w2_a["realized_xi_log_val"] - cur_xi_med))
            avail_diff = 0.55 * (0.85 - w2_a["injury_avail_ratio"])
            ga90_diff = 0.55 * (2.10 - w2_a["xi_ga90_allcomps"])
        else:
            xi_val_diff, avail_diff, ga90_diff = 0.0, 0.0, 0.0

        if hx:
            div_ewm_xi_val[dv_i] = (1.0 - alpha_div) * div_ewm_xi_val.get(dv_i, w2_h["realized_xi_log_val"]) + alpha_div * w2_h["realized_xi_log_val"]
        if ax:
            div_ewm_xi_val[dv_i] = (1.0 - alpha_div) * div_ewm_xi_val.get(dv_i, w2_a["realized_xi_log_val"]) + alpha_div * w2_a["realized_xi_log_val"]

        w2_mat[i, 2] = xi_val_diff
        w2_mat[i, 3] = avail_diff
        w2_mat[i, 4] = ga90_diff
        w2_mat[i, 5] = w2_h["net_transfer_val_120d"] - w2_a["net_transfer_val_120d"]
        w2_mat[i, 6] = w2_h["inbound_fee_120d"] - w2_a["inbound_fee_120d"]

    for j, c_nm in enumerate(TM_6_COLS):
        df[c_nm] = tm6_mat[:, j]
    for j, c_nm in enumerate(ALL_W2_CLUB_COLS):
        df[c_nm] = w2_mat[:, j]

    print(f"[Wave 2 Realized XI Match] {w2_xi_matched} / {2 * n_rows} lados con acta real CC0 ({100.0 * w2_xi_matched / max(1, 2 * n_rows):.1f}%)")

    div_levels = sorted(df["div"].astype(str).unique().tolist())
    div_vals = df["div"].astype(str).to_numpy()
    dummies_all = np.column_stack([(div_vals == lvl).astype(np.float64) for lvl in div_levels])
    sstarts = df["sstart"].to_numpy(dtype=int)
    y_all = df["y"].to_numpy(dtype=np.int64)
    dates_all = df["match_date"]
    eval_seasons = sorted(set(sstarts[sstarts >= 2016]))
    missing_live_v30_idx = [idx for idx, c in enumerate(BASE_113_FEATURES) if c not in LIVE_V30_POPULATED_SET]

    v33_cols = BASE_113_FEATURES + SB_1_COL + TM_6_COLS
    live_base_38_ordered = tuple(c for c in BASE_113_FEATURES if c in LIVE_V30_POPULATED_SET)

    variants: dict[str, tuple[str, ...]] = {
        "v3_0_full_113": BASE_113_FEATURES,
        "v3_3_cand_120": v33_cols,
        "v3_3_plus_w2_cup": v33_cols + W2_CUP_COLS,
        "v3_3_plus_w2_xi": v33_cols + W2_XI_COLS,
        "v3_3_plus_w2_transfers": v33_cols + W2_TRANSFER_COLS,
        "v3_3_plus_w2_all": v33_cols + ALL_W2_CLUB_COLS,
    }

    oof_preds: dict[str, list[np.ndarray]] = {k: [] for k in variants}
    oof_preds["v3_0_live_38_of_113"] = []
    meta_parts: list[pd.DataFrame] = []

    for ss in eval_seasons:
        tr_m = (sstarts >= 2012) & (sstarts < ss)
        ev_m = sstarts == ss
        if not np.any(tr_m) or not np.any(ev_m):
            continue
        max_dt = dates_all[tr_m].max()
        sw = 0.5 ** ((max_dt - dates_all[tr_m]).dt.days.to_numpy(dtype=np.float64) / 1460.0)

        for v_name, cols in variants.items():
            X_tr = np.hstack([df.loc[tr_m, list(cols)].to_numpy(dtype=np.float64), dummies_all[tr_m]])
            X_ev = np.hstack([df.loc[ev_m, list(cols)].to_numpy(dtype=np.float64), dummies_all[ev_m]])
            p_ev, imp_0, sc_0, lr_0 = _fit_and_predict_logit(X_tr, y_all[tr_m], sw, X_ev, c_reg=0.02)
            oof_preds[v_name].append(p_ev)

            if v_name == "v3_0_full_113":
                X_ev_live = np.array(X_ev, copy=True)
                for ci in missing_live_v30_idx:
                    X_ev_live[:, ci] = imp_0.statistics_[ci]
                na_l = ~np.isfinite(X_ev_live)
                if np.any(na_l):
                    rn, cn = np.where(na_l)
                    X_ev_live[rn, cn] = imp_0.statistics_[cn]
                Z_l = (X_ev_live - sc_0.mean_) / sc_0.scale_
                lg_l = Z_l @ lr_0.coef_.T + lr_0.intercept_
                ex_l = np.exp(lg_l - np.max(lg_l, axis=1, keepdims=True))
                oof_preds["v3_0_live_38_of_113"].append(ex_l / np.sum(ex_l, axis=1, keepdims=True))

        meta_parts.append(
            df.loc[ev_m, ["match_id", "div", "sstart", "y", "odds_close_ps_h", "odds_close_ps_d", "odds_close_ps_a"]].copy()
        )

    oof_meta = pd.concat(meta_parts, ignore_index=True)
    y_oof = oof_meta["y"].to_numpy(dtype=np.int64)
    P_map = {k: np.vstack(v) for k, v in oof_preds.items()}

    # Selección de bloques Wave 2 estrictamente en `VAL <= 2023` frente a `v3_3_cand_120`
    val_mask = oof_meta["sstart"].to_numpy(dtype=int) <= 2023
    ll_v33_val = float(np.mean(oc.compute_categorical_log_loss_vec(P_map["v3_3_cand_120"][val_mask], y_oof[val_mask])))
    val_log = {"v3_3_cand_120": round(ll_v33_val, 6)}
    accepted_w2_cols: list[str] = []

    for b_key, b_cols in (
        ("v3_3_plus_w2_cup", W2_CUP_COLS),
        ("v3_3_plus_w2_xi", W2_XI_COLS),
        ("v3_3_plus_w2_transfers", W2_TRANSFER_COLS),
    ):
        ll_b = float(np.mean(oc.compute_categorical_log_loss_vec(P_map[b_key][val_mask], y_oof[val_mask])))
        val_log[b_key] = round(ll_b, 6)
        if ll_b < ll_v33_val - 1e-6:
            accepted_w2_cols.extend(b_cols)

    print("[VAL <= 2023 Wave 2 Selection vs v3.3]", val_log, "-> accepted:", accepted_w2_cols)

    v34_full_cols = v33_cols + tuple(accepted_w2_cols)
    live_complete_cols = live_base_38_ordered + SB_1_COL + TM_6_COLS + tuple(accepted_w2_cols)

    def _run_wf_cols(cols_tuple: tuple[str, ...]) -> np.ndarray:
        parts = []
        for ss in eval_seasons:
            tr_m = (sstarts >= 2012) & (sstarts < ss)
            ev_m = sstarts == ss
            if not np.any(tr_m) or not np.any(ev_m):
                continue
            max_dt = dates_all[tr_m].max()
            sw = 0.5 ** ((max_dt - dates_all[tr_m]).dt.days.to_numpy(dtype=np.float64) / 1460.0)
            X_tr = np.hstack([df.loc[tr_m, list(cols_tuple)].to_numpy(dtype=np.float64), dummies_all[tr_m]])
            X_ev = np.hstack([df.loc[ev_m, list(cols_tuple)].to_numpy(dtype=np.float64), dummies_all[ev_m]])
            p_ev, _, _, _ = _fit_and_predict_logit(X_tr, y_all[tr_m], sw, X_ev, c_reg=0.02)
            parts.append(p_ev)
        return np.vstack(parts)

    if set(v34_full_cols) == set(variants["v3_3_plus_w2_all"]):
        P_v34 = P_map["v3_3_plus_w2_all"]
    elif len(accepted_w2_cols) == 0:
        P_v34 = P_map["v3_3_cand_120"]
    else:
        P_v34 = _run_wf_cols(v34_full_cols)

    P_live_complete = _run_wf_cols(live_complete_cols)
    P_map["tachyon_v3_4_candidate"] = P_v34
    P_map["tachyon_v3_4_live_complete"] = P_live_complete

    ll_v30_full_vec = oc.compute_categorical_log_loss_vec(P_map["v3_0_full_113"], y_oof)
    ll_v33_vec = oc.compute_categorical_log_loss_vec(P_map["v3_3_cand_120"], y_oof)
    ll_v30_live_vec = oc.compute_categorical_log_loss_vec(P_map["v3_0_live_38_of_113"], y_oof)

    eval_vs_v30: dict[str, Any] = {}
    print(f"\n=== WALK-FORWARD CLUBES v3.4 (n={len(y_oof)}, < {HOLDOUT_CUT_DATE}) ===")
    for k_name in (
        "v3_0_live_38_of_113",
        "v3_0_full_113",
        "v3_3_cand_120",
        "v3_3_plus_w2_cup",
        "v3_3_plus_w2_xi",
        "v3_3_plus_w2_transfers",
        "tachyon_v3_4_live_complete",
        "tachyon_v3_4_candidate",
    ):
        ev_r = oc.evaluate_calibration_with_bootstrap(
            P_map[k_name],
            y_oof,
            benchmark_ll_vec=ll_v30_full_vec,
            benchmark_is_self=(k_name == "v3_0_full_113"),
            n_resamples=BOOTSTRAP_SAMPLES,
            seed=BOOTSTRAP_SEED,
            include_bins=False,
        )
        eval_vs_v30[k_name] = ev_r
        print(
            f"  {k_name:28s} | LL={ev_r['log_loss']:.5f} | ΔLL vs v3.0(113)={ev_r['delta_ll_vs_benchmark']:+.5f} "
            f"{ev_r['delta_ll_ci95']} ({ev_r['significance']})"
        )

    v34_vs_v33 = oc.evaluate_calibration_with_bootstrap(
        P_v34,
        y_oof,
        benchmark_ll_vec=ll_v33_vec,
        benchmark_is_self=(len(accepted_w2_cols) == 0),
        n_resamples=BOOTSTRAP_SAMPLES,
        seed=BOOTSTRAP_SEED,
        include_bins=False,
    )
    live_comp_vs_live38 = oc.evaluate_calibration_with_bootstrap(
        P_live_complete,
        y_oof,
        benchmark_ll_vec=ll_v30_live_vec,
        n_resamples=BOOTSTRAP_SAMPLES,
        seed=BOOTSTRAP_SEED,
        include_bins=False,
    )
    print(
        f"  [v3.4 Cand vs v3.3 Cand] ΔLL = {v34_vs_v33['delta_ll_vs_benchmark']:+.5f} {v34_vs_v33['delta_ll_ci95']} ({v34_vs_v33['significance']})"
    )
    print(
        f"  [v3.4 Live-Complete (100% cov, {len(live_complete_cols)} cols) vs v3.0 Live 38/113] "
        f"LL = {live_comp_vs_live38['log_loss']:.5f} | ΔLL = {live_comp_vs_live38['delta_ll_vs_benchmark']:+.5f} "
        f"{live_comp_vs_live38['delta_ll_ci95']} ({live_comp_vs_live38['significance']})"
    )

    # Benchmark contra Cierre Pinnacle
    oh = pd.to_numeric(oof_meta["odds_close_ps_h"], errors="coerce").to_numpy(dtype=np.float64)
    od = pd.to_numeric(oof_meta["odds_close_ps_d"], errors="coerce").to_numpy(dtype=np.float64)
    oa = pd.to_numeric(oof_meta["odds_close_ps_a"], errors="coerce").to_numpy(dtype=np.float64)
    ps_mask = np.isfinite(oh) & np.isfinite(od) & np.isfinite(oa) & (oh > 1.01) & (od > 1.01) & (oa > 1.01)
    P_pinnacle = _power_devig_3way(oh[ps_mask], od[ps_mask], oa[ps_mask])
    ll_pin_vec = oc.compute_categorical_log_loss_vec(P_pinnacle, y_oof[ps_mask])

    v34_vs_pin = oc.evaluate_calibration_with_bootstrap(
        P_v34[ps_mask], y_oof[ps_mask], benchmark_ll_vec=ll_pin_vec, n_resamples=BOOTSTRAP_SAMPLES, seed=BOOTSTRAP_SEED, include_bins=False
    )
    v34_vs_v30_pin = oc.evaluate_calibration_with_bootstrap(
        P_v34[ps_mask],
        y_oof[ps_mask],
        benchmark_ll_vec=oc.compute_categorical_log_loss_vec(P_map["v3_0_full_113"][ps_mask], y_oof[ps_mask]),
        n_resamples=BOOTSTRAP_SAMPLES,
        seed=BOOTSTRAP_SEED,
        include_bins=False,
    )
    print(
        f"  [Pinnacle Subset n={int(np.sum(ps_mask))}] Pinnacle LL={float(np.mean(ll_pin_vec)):.5f} | "
        f"v3.4 ΔLL vs Pin={v34_vs_pin['delta_ll_vs_benchmark']:+.5f} | "
        f"v3.4 vs v3.0={v34_vs_v30_pin['delta_ll_vs_benchmark']:+.5f} {v34_vs_v30_pin['delta_ll_ci95']} ({v34_vs_v30_pin['significance']})"
    )

    # Exportar ambos artefactos entrenados estrictamente en `< 2025-02-02` (`sstart >= 2014`)
    tr_final = df[df["sstart"] >= 2014].copy().reset_index(drop=True)
    div_tr = tr_final["div"].astype(str).to_numpy()
    dum_tr = np.column_stack([(div_tr == lvl).astype(np.float64) for lvl in div_levels])
    y_f = tr_final["y"].to_numpy(dtype=np.int64)
    sw_f = 0.5 ** ((tr_final["match_date"].max() - tr_final["match_date"]).dt.days.to_numpy(dtype=np.float64) / 1460.0)

    rng = np.random.default_rng(MODEL_SEED)
    pool_sn = tr_final[tr_final["sstart"] >= 2023].copy().reset_index(drop=True)
    ch_idx = np.sort(rng.choice(len(pool_sn), size=min(200, len(pool_sn)), replace=False))
    sn_df = pool_sn.iloc[ch_idx].copy().reset_index(drop=True)
    dum_sn = np.column_stack([(sn_df["div"].astype(str).to_numpy() == lvl).astype(np.float64) for lvl in div_levels])

    def _export_club_bundle(
        cols_sel: tuple[str, ...],
        codename: str,
        ver: str,
        model_path: Path,
        snap_path: Path,
        notes: str,
    ) -> tuple[str, str]:
        X_f = np.hstack([tr_final[list(cols_sel)].to_numpy(dtype=np.float64), dum_tr])
        P_tr_f, imp_f, sc_f, lr_f = _fit_and_predict_logit(X_f, y_f, sw_f, X_f, c_reg=0.02)
        tr_ll = float(-np.mean(np.log(np.clip(P_tr_f[np.arange(len(y_f)), y_f], 1e-15, 1.0))))
        art = {
            "type": "multinomial_logistic",
            "codename": codename,
            "version": ver,
            "status": "candidate",
            "production_activated": False,
            "production_enabled": False,
            "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "seed": MODEL_SEED,
            "regularization_C": 0.02,
            "features": list(cols_sel) + [f"div_{d}" for d in div_levels],
            "n_features_base": len(cols_sel),
            "div_levels": div_levels,
            "imputer": {"strategy": "median", "statistics": [float(v) for v in imp_f.statistics_.tolist()]},
            "scaler": {"mean": [float(v) for v in sc_f.mean_.tolist()], "scale": [float(v) for v in sc_f.scale_.tolist()]},
            "coef": [[float(x) for x in r] for r in lr_f.coef_.tolist()],
            "intercept": [float(x) for x in lr_f.intercept_.tolist()],
            "classes": [int(c) for c in lr_f.classes_.tolist()],
            "metadata": {
                "trained_on": f"{codename} (< 2025-02-02)",
                "n_matches": int(len(tr_final)),
                "seasons": [str(tr_final["season"].min()), str(tr_final["season"].max())],
                "target": "0=H, 1=D, 2=A",
                "train_log_loss": round(tr_ll, 6),
                "notes": notes,
            },
        }
        model_path.write_text(json.dumps(art, indent=1), encoding="utf-8")

        X_sn = np.hstack([sn_df[list(cols_sel)].to_numpy(dtype=np.float64), dum_sn])
        X_sn_i = np.array(X_sn, copy=True)
        na_s = ~np.isfinite(X_sn_i)
        if np.any(na_s):
            rn, cn = np.where(na_s)
            X_sn_i[rn, cn] = imp_f.statistics_[cn]
        Z_sn = (X_sn_i - sc_f.mean_) / sc_f.scale_
        lg_sn = Z_sn @ lr_f.coef_.T + lr_f.intercept_
        ex_sn = np.exp(lg_sn - np.max(lg_sn, axis=1, keepdims=True))
        P_sn = ex_sn / np.sum(ex_sn, axis=1, keepdims=True)

        sn_rows: dict[str, Any] = {}
        for idx_r, row_r in sn_df.iterrows():
            dv_s = str(row_r["div"])
            raw_vals = [None if not math.isfinite(float(row_r[c])) else float(row_r[c]) for c in cols_sel]
            sn_rows[str(row_r["match_id"])] = {
                "div": dv_s,
                "season": str(row_r["season"]),
                "match_date": str(row_r["match_date"])[:10],
                "features": raw_vals,
                "div_onehot": [1 if lvl == dv_s else 0 for lvl in div_levels],
                "probs_python": [float(P_sn[idx_r, 0]), float(P_sn[idx_r, 1]), float(P_sn[idx_r, 2])],
            }
        snap_path.write_text(
            json.dumps({"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "n": len(sn_rows), "rows": sn_rows}, indent=1),
            encoding="utf-8",
        )
        return (
            hashlib.sha256(model_path.read_bytes()).hexdigest(),
            hashlib.sha256(snap_path.read_bytes()).hexdigest(),
        )

    sha_v34, sha_sn_v34 = _export_club_bundle(
        v34_full_cols,
        "PitchLab Tachyon v3.4 Candidate",
        "3.4.0-candidate",
        CANDIDATE_V34_JSON_OUT,
        CANDIDATE_V34_SNAP_OUT,
        "Tachyon v3.4 Candidate con señales Wave 2 CC0 aceptadas en VAL <= 2023.",
    )
    sha_live, sha_sn_live = _export_club_bundle(
        live_complete_cols,
        "PitchLab Tachyon v3.4 Live-Complete",
        "3.4.0-live-complete-candidate",
        LIVE_COMPLETE_V34_JSON_OUT,
        LIVE_COMPLETE_V34_SNAP_OUT,
        "Motor de clubes entrenado exclusivamente sobre features 100% disponibles en inferencia viva (cero distorsión de imputación).",
    )

    out_summary = {
        "experiment_id": "EXP_V36_club_v3_4_wave2",
        "eval_split": "walk_forward_dev",
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "w2_realized_xi_matched_sides": w2_xi_matched,
        "w2_realized_xi_match_rate_pct": round(100.0 * w2_xi_matched / max(1, 2 * n_rows), 2),
        "val_wave2_selection_le_2023": val_log,
        "accepted_wave2_cols": accepted_w2_cols,
        "n_features_v34_full": len(v34_full_cols),
        "n_features_v34_live_complete": len(live_complete_cols),
        "walk_forward_dev_vs_v30_full": eval_vs_v30,
        "v34_candidate_vs_v33_candidate": v34_vs_v33,
        "v34_live_complete_vs_v30_live_38": live_comp_vs_live38,
        "pinnacle_closing_subset": {
            "n_matches": int(np.sum(ps_mask)),
            "pinnacle_ll": round(float(np.mean(ll_pin_vec)), 6),
            "v34_vs_pinnacle": v34_vs_pin,
            "v34_vs_v30_on_pinnacle": v34_vs_v30_pin,
        },
        "artifacts_sha256": {
            "model_club_v3_4_candidate.json": sha_v34,
            "club_v3_4_snapshot.json": sha_sn_v34,
            "model_club_v3_4_live_candidate.json": sha_live,
            "club_v3_4_live_snapshot.json": sha_sn_live,
        },
    }
    RESULTS_V34_JSON_OUT.write_text(json.dumps(out_summary, indent=2), encoding="utf-8")

    with TRIAL_REGISTRY_CLUB_OUT.open("a", encoding="utf-8") as rfh:
        rfh.write(
            json.dumps(
                {
                    "timestamp_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "experiment_id": "EXP_V36_club_v3_4_wave2",
                    "eval_split": "walk_forward_dev",
                    "unlock_holdout": False,
                    "accepted_wave2_cols": accepted_w2_cols,
                    "v34_ll": eval_vs_v30["tachyon_v3_4_candidate"]["log_loss"],
                    "v34_live_complete_ll": eval_vs_v30["tachyon_v3_4_live_complete"]["log_loss"],
                    "delta_live_complete_vs_v30_live38": live_comp_vs_live38["delta_ll_vs_benchmark"],
                }
            )
            + "\n"
        )


if __name__ == "__main__":
    main()
