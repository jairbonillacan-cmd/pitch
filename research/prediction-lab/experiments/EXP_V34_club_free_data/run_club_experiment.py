"""Evaluación walk-forward (`< 2025-02-02`), ablación bootstrap `mulberry32` y exportación de `PitchLab Tachyon v3.3 Candidate` (`EXP_V34_club_free_data`).

Compara sobre la ventana canónica `walk_forward_dev` (`season_start >= 2015`, `match_date < 2025-02-02`):
  1. `tachyon_v3_0_live_38_of_113`: cobertura viva actual de `Tachyon v3.0` (`38/113 = 33.63%`, `low_coverage`).
  2. `tachyon_v3_0_full_113`: línea base `PitchLab Tachyon v3.0` (`113` base + `23` `div_levels` = `136`, `C=0.02`).
  3. `v3_0_plus_matches_internal`: `+7` señales causales internas (`prev_reds`, `11v10` GD limpio, `HTGD`, árbitro).
  4. `v3_0_plus_statsbomb_p1_1`: `+1` `sb_xg_diff_ewm8` calibrado sobre eventos reales de `StatsBomb Open Data` (`P1-1`).
  5. `v3_0_plus_transfermarkt_cc0`: `+6` señales `CC0` de valuación de plantilla (€ relativo a mediana de liga,
     recién ascendidos, brecha `Talento € vs Elo`) e historial de entrenadores (`nuevo DT`, `PAE`).
  6. `tachyon_v3_3_candidate`: combinación podada exclusivamente en `VAL <= 2023` (`0` selección sobre `2024`),
     medida frente a `tachyon_v3_0_full_113`, `tachyon_v3_0_live_38_of_113` y **cierre sin margen de Pinnacle**.
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
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

EXP_DIR = Path(__file__).resolve().parent
REPO_ROOT = EXP_DIR.parents[3]
PRED_LAB_ROOT = REPO_ROOT / "research" / "prediction-lab"

for _p in (str(REPO_ROOT), str(PRED_LAB_ROOT / "models" / "a"), str(EXP_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from services.models import outlook_calibration as oc  # noqa: E402
import train_motor_a as tma  # noqa: E402

from club_free_sources import (  # noqa: E402
    ARTIFACTS_DIR,
    HOLDOUT_CUT_DATE,
    CausalClubTransfermarktBridge,
    calibrate_statsbomb_p1_1_shot_xg,
    extract_matches_parquet_free_signals,
)

HOLDOUT_CUT_ISO = "2025-02-02T17:30:00Z"
HOLDOUT_CUT_TS = pd.Timestamp(HOLDOUT_CUT_DATE)
MODEL_SEED = 20261109
BOOTSTRAP_SEED = 20261111
BOOTSTRAP_SAMPLES = 1000

CANDIDATE_CLUB_JSON_OUT = REPO_ROOT / "src" / "data" / "prediction" / "model_club_v3_3_candidate.json"
CANDIDATE_CLUB_SNAP_OUT = REPO_ROOT / "src" / "data" / "prediction" / "club_v3_3_snapshot.json"
RESULTS_CLUB_JSON_OUT = ARTIFACTS_DIR / "exp_v34_club_free_data_results.json"
TRIAL_REGISTRY_CLUB_OUT = EXP_DIR / "trial_registry_club_v34.jsonl"

BASE_113_FEATURES: tuple[str, ...] = tuple(tma.FEATURES)

# Las 38 features base realmente pobladas hoy en vivo por `service.ts::synthesizeFootballSnapshotRowFromMaster`
LIVE_V30_POPULATED_SET: frozenset[str] = frozenset(
    {
        "elo_diff",
        "elo_diff_no_hfa",
        "elo_prob_home_nodraw",
        "elo_diff_x_progress",
        "elo_logit_h",
        "elo_closeness",
        "clubelo_diff",
        "dc_lam_home",
        "dc_lam_away",
        "dc_exp_total",
        "dc_exp_diff",
        "dc_prob_h",
        "dc_prob_d",
        "dc_prob_a",
        "dc_logit_h",
        "dc_logit_d",
        "dc_logit_a",
        "low_scoring_tight_match",
        "xgd_diff_r5",
        "xgd_diff_r10",
        "xgd_ewm5_diff",
        "venue_xgd_diff_r5",
        "xg_overperf_diff_r5",
        "clinical_overperf_diff_r10",
        "pts_minus_xpts_diff_r10",
        "xpts_diff_r10",
        "xg_elo_diff",
        "xg_elo_vs_elo_diff",
        "has_real_xg_history",
        "ppda_diff_r10",
        "deep_completions_diff_r10",
        "altitude_diff_m",
        "altitude_shock_flag",
        "surface_pressure_diff",
        "season_progress",
        "h_days_rest",
        "a_days_rest",
        "rest_diff",
    }
)

INTERNAL_7_COLS: tuple[str, ...] = (
    "prev_reds_diff",
    "rc_clean_gd_ewm8_diff",
    "ht_gd_ewm8_diff",
    "ht_lead_r10_diff",
    "disc_cards_ewm10_diff",
    "ref_home_bias_prior",
    "ref_draw_bias_prior",
)

SB_1_COL: tuple[str, ...] = ("sb_xg_diff_ewm8",)

TM_6_COLS: tuple[str, ...] = (
    "tm_rel_log_val_diff",
    "tm_depth_ratio_diff",
    "tm_val_vs_elo_gap_diff",
    "tm_promoted_val_boost_diff",
    "tm_new_mgr_diff",
    "tm_mgr_pae_diff",
)


def _resolve_features_parquet() -> Path:
    local_p = PRED_LAB_ROOT / "data" / "processed" / "features.parquet"
    if local_p.exists():
        return local_p
    shared_p = Path(r"C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\prediction-lab\research\prediction-lab\data\processed\features.parquet")
    if shared_p.exists():
        return shared_p
    raise FileNotFoundError("No se encontró features.parquet ni en el worktree local ni en prediction-lab.")


def _compute_statsbomb_ewm_feature(matches_df: pd.DataFrame, sb_cal: dict[str, Any]) -> pd.DataFrame:
    """Aplica los pesos OLS calibrados en `StatsBomb Open Data` (`P1-1`) sobre `(SOT, SOFF, Corners)`
    y acumula la diferencia EWMA pre-partido (`t' < t`)."""
    ordered = matches_df.sort_values(["match_date", "kickoff_time", "match_id"], kind="mergesort").reset_index(drop=True)
    n = len(ordered)
    sb_diff = np.zeros(n, dtype=np.float64)

    bh = sb_cal["home"]
    ba = sb_cal["away"]
    ewm_xgd: dict[str, float] = {}
    alpha8 = 2.0 / 9.0

    divs = ordered["div"].astype(str).to_numpy()
    hts = ordered["home_team"].astype(str).to_numpy()
    ats = ordered["away_team"].astype(str).to_numpy()
    sh_h = pd.to_numeric(ordered.get("shots_home", np.nan), errors="coerce").to_numpy(dtype=np.float64)
    sh_a = pd.to_numeric(ordered.get("shots_away", np.nan), errors="coerce").to_numpy(dtype=np.float64)
    sot_h = pd.to_numeric(ordered.get("sot_home", np.nan), errors="coerce").to_numpy(dtype=np.float64)
    sot_a = pd.to_numeric(ordered.get("sot_away", np.nan), errors="coerce").to_numpy(dtype=np.float64)
    cor_h = pd.to_numeric(ordered.get("corners_home", np.nan), errors="coerce").to_numpy(dtype=np.float64)
    cor_a = pd.to_numeric(ordered.get("corners_away", np.nan), errors="coerce").to_numpy(dtype=np.float64)
    hg = pd.to_numeric(ordered["home_goals"], errors="coerce").to_numpy(dtype=np.float64)
    ag = pd.to_numeric(ordered["away_goals"], errors="coerce").to_numpy(dtype=np.float64)

    for i in range(n):
        hk = f"{divs[i]}::{hts[i]}"
        ak = f"{divs[i]}::{ats[i]}"
        sb_diff[i] = ewm_xgd.get(hk, 0.0) - ewm_xgd.get(ak, 0.0)

        if math.isfinite(sot_h[i]) and math.isfinite(sot_a[i]) and math.isfinite(sh_h[i]) and math.isfinite(sh_a[i]):
            soff_hi = max(0.0, sh_h[i] - sot_h[i])
            soff_ai = max(0.0, sh_a[i] - sot_a[i])
            chi = cor_h[i] if math.isfinite(cor_h[i]) else 4.8
            cai = cor_a[i] if math.isfinite(cor_a[i]) else 4.0
            xgh = bh["intercept"] + bh["w_sot"] * sot_h[i] + bh["w_soff"] * soff_hi + bh["w_corners"] * chi
            xga = ba["intercept"] + ba["w_sot"] * sot_a[i] + ba["w_soff"] * soff_ai + ba["w_corners"] * cai
            xgd_obs = max(-4.0, min(4.0, xgh - xga))
            ewm_xgd[hk] = (1.0 - alpha8) * ewm_xgd.get(hk, 0.0) + alpha8 * xgd_obs
            ewm_xgd[ak] = (1.0 - alpha8) * ewm_xgd.get(ak, 0.0) - alpha8 * xgd_obs
        elif math.isfinite(hg[i]) and math.isfinite(ag[i]):
            gd_s = 0.65 * max(-4.0, min(4.0, hg[i] - ag[i]))
            ewm_xgd[hk] = (1.0 - alpha8) * ewm_xgd.get(hk, 0.0) + alpha8 * gd_s
            ewm_xgd[ak] = (1.0 - alpha8) * ewm_xgd.get(ak, 0.0) - alpha8 * gd_s

    return pd.DataFrame({"match_id": ordered["match_id"].astype(str), "sb_xg_diff_ewm8": sb_diff})


def _power_devig_3way(odds_h: np.ndarray, odds_d: np.ndarray, odds_a: np.ndarray) -> np.ndarray:
    """Power de-vig exacto vectorizado sobre cuotas de cierre Pinnacle (`odds_close_ps_h/d/a`)."""
    inv_h = 1.0 / odds_h
    inv_d = 1.0 / odds_d
    inv_a = 1.0 / odds_a
    # Bisección vectorizada de exponente k en `[1.0, 4.0]` tal que `inv_h^k + inv_d^k + inv_a^k == 1`
    lo = np.ones(len(odds_h), dtype=np.float64) * 0.80
    hi = np.ones(len(odds_h), dtype=np.float64) * 3.50
    for _ in range(28):
        mid = 0.5 * (lo + hi)
        s = (inv_h ** mid) + (inv_d ** mid) + (inv_a ** mid)
        lo = np.where(s > 1.0, mid, lo)
        hi = np.where(s <= 1.0, mid, hi)
    k = 0.5 * (lo + hi)
    ph = inv_h ** k
    pd_v = inv_d ** k
    pa = inv_a ** k
    tot = ph + pd_v + pa
    return np.column_stack([ph / tot, pd_v / tot, pa / tot])


def _fit_and_predict_logit(
    X_tr: np.ndarray,
    y_tr: np.ndarray,
    sw_tr: np.ndarray,
    X_ev: np.ndarray,
    c_reg: float = 0.02,
    mask_eval_cols: list[int] | None = None,
) -> tuple[np.ndarray, SimpleImputer, StandardScaler, LogisticRegression]:
    imp = SimpleImputer(strategy="median").fit(X_tr)
    X_tr_i = imp.transform(X_tr)
    sc = StandardScaler().fit(X_tr_i)
    sc.scale_ = np.where(sc.scale_ == 0.0, 1.0, sc.scale_)
    Z_tr = (X_tr_i - sc.mean_) / sc.scale_

    lr = LogisticRegression(C=float(c_reg), max_iter=2000, tol=1e-4, solver="lbfgs", random_state=MODEL_SEED)
    lr.fit(Z_tr, y_tr, sample_weight=sw_tr)

    X_ev_w = np.array(X_ev, dtype=np.float64, copy=True)
    if mask_eval_cols:
        for ci in mask_eval_cols:
            X_ev_w[:, ci] = imp.statistics_[ci]
    na_m = ~np.isfinite(X_ev_w)
    if np.any(na_m):
        rn, cn = np.where(na_m)
        X_ev_w[rn, cn] = imp.statistics_[cn]
    Z_ev = (X_ev_w - sc.mean_) / sc.scale_
    logits = Z_ev @ lr.coef_.T + lr.intercept_
    mx = np.max(logits, axis=1, keepdims=True)
    ex = np.exp(logits - mx)
    probs = ex / np.sum(ex, axis=1, keepdims=True)
    return probs, imp, sc, lr


def main() -> None:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Calibración empírica P1-1 sobre StatsBomb Open Data (`2015/16` `< 2020`)
    sb_cal = calibrate_statsbomb_p1_1_shot_xg(max_matches_sample=180)
    print(f"[P1-1 StatsBomb Open Data] R2 Home={sb_cal['home']['r2_vs_statsbomb_xg']} | R2 Away={sb_cal['away']['r2_vs_statsbomb_xg']}")

    # 2. Carga estricta `< 2025-02-02` (`walk_forward_dev`) de `matches.parquet` y `features.parquet`
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

    # Extraer familias gratuitas causales
    int_sig_df = extract_matches_parquet_free_signals(m_df)
    sb_sig_df = _compute_statsbomb_ewm_feature(m_df, sb_cal)

    # Unir cuotas de cierre Pinnacle y equipos desde `m_df`
    m_join = m_df[["match_id", "home_team", "away_team", "odds_close_ps_h", "odds_close_ps_d", "odds_close_ps_a"]].drop_duplicates("match_id")
    df = (
        f_df[f_df["sstart"] >= 2010]
        .merge(m_join, on="match_id", how="left", suffixes=("", "_m"))
        .merge(int_sig_df, on="match_id", how="left")
        .merge(sb_sig_df, on="match_id", how="left")
    )
    ht_col = "home_team" if "home_team" in df.columns else "home_team_m"
    at_col = "away_team" if "away_team" in df.columns else "away_team_m"

    df = df.sort_values(["match_date", "match_id"], kind="mergesort").reset_index(drop=True)

    # Cruzar Transfermarkt CC0 (`max_date_exclusive = "2025-02-02"`) en orden cronológico estricto
    tm_bridge = CausalClubTransfermarktBridge(max_date_exclusive=HOLDOUT_CUT_DATE)
    n_rows = len(df)
    tm_mat = np.zeros((n_rows, len(TM_6_COLS)), dtype=np.float64)
    tm_matched_sides = 0

    d_ords = df["match_date"].map(lambda d: d.toordinal()).to_numpy(dtype=np.int64)
    divs = df["div"].astype(str).to_numpy()
    h_names = df[ht_col].astype(str).to_numpy()
    a_names = df[at_col].astype(str).to_numpy()
    elo_diffs = pd.to_numeric(df["elo_diff_no_hfa"], errors="coerce").fillna(0.0).to_numpy(dtype=np.float64)
    h_prom = pd.to_numeric(df["h_div_change"], errors="coerce").fillna(0.0).to_numpy(dtype=np.float64)
    a_prom = pd.to_numeric(df["a_div_change"], errors="coerce").fillna(0.0).to_numpy(dtype=np.float64)

    div_ewm_log_val: dict[str, float] = {}
    alpha_div = 0.04

    for i in range(n_rows):
        dv_i = divs[i]
        eh = 1525.0 + 0.5 * elo_diffs[i]
        ea = 1525.0 - 0.5 * elo_diffs[i]
        elo_rel_h = (eh - 1525.0) / 145.0
        elo_rel_a = (ea - 1525.0) / 145.0

        th = tm_bridge.lookup_prematch_club_tm(dv_i, h_names[i], int(d_ords[i]), eh)
        ta = tm_bridge.lookup_prematch_club_tm(dv_i, a_names[i], int(d_ords[i]), ea)
        has_h = th["tm_has_val"] > 0.0
        has_a = ta["tm_has_val"] > 0.0
        if has_h:
            tm_matched_sides += 1
        if has_a:
            tm_matched_sides += 1

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
            rel_h = 0.0
            rel_a = 0.0
            val_diff = 0.0
            depth_diff = 0.0
            gap_diff = 0.0

        # Actualizar mediana causal de la división para partidos futuros (`> i`)
        if has_h:
            div_ewm_log_val[dv_i] = (1.0 - alpha_div) * div_ewm_log_val.get(dv_i, th["tm_raw_log_val"]) + alpha_div * th["tm_raw_log_val"]
        if has_a:
            div_ewm_log_val[dv_i] = (1.0 - alpha_div) * div_ewm_log_val.get(dv_i, ta["tm_raw_log_val"]) + alpha_div * ta["tm_raw_log_val"]

        tm_mat[i, 0] = val_diff
        tm_mat[i, 1] = depth_diff
        tm_mat[i, 2] = gap_diff
        tm_mat[i, 3] = h_prom[i] * rel_h - a_prom[i] * rel_a
        tm_mat[i, 4] = th["tm_new_mgr_flag"] - ta["tm_new_mgr_flag"]
        tm_mat[i, 5] = th["tm_mgr_pae"] - ta["tm_mgr_pae"]

    for j, col_nm in enumerate(TM_6_COLS):
        df[col_nm] = tm_mat[:, j]

    print(f"[Transfermarkt Club Match] {tm_matched_sides} / {2 * n_rows} lados con valuación activa CC0 ({100.0 * tm_matched_sides / max(1, 2 * n_rows):.1f}%)")
    div_levels = sorted(df["div"].astype(str).unique().tolist())
    div_vals = df["div"].astype(str).to_numpy()
    dummies_all = np.column_stack([(div_vals == lvl).astype(np.float64) for lvl in div_levels])
    sstarts = df["sstart"].to_numpy(dtype=int)
    y_all = df["y"].to_numpy(dtype=np.int64)
    dates_all = df["match_date"]

    # Evaluar pliegues anuales `sstart in 2016..2024` (`< 2025-02-02`, entrenando con ventana `>= 2012` `< s`)
    eval_seasons = sorted(set(sstarts[sstarts >= 2016]))
    missing_live_v30_idx = [idx for idx, c in enumerate(BASE_113_FEATURES) if c not in LIVE_V30_POPULATED_SET]

    variants: dict[str, tuple[str, ...]] = {
        "v3_0_full_113": BASE_113_FEATURES,
        "v3_0_plus_prev_reds": BASE_113_FEATURES + ("prev_reds_diff",),
        "v3_0_plus_internal_7": BASE_113_FEATURES + INTERNAL_7_COLS,
        "v3_0_plus_sb_p1_1": BASE_113_FEATURES + SB_1_COL,
        "v3_0_plus_tm_cc0_6": BASE_113_FEATURES + TM_6_COLS,
        "v3_3_all_127": BASE_113_FEATURES + INTERNAL_7_COLS + SB_1_COL + TM_6_COLS,
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
                # Simular también cobertura viva actual 38/113 con exactamente el mismo modelo entrenado v3.0
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

    # Selección de bloques estrictamente en `VAL` (`sstart <= 2023`)
    val_mask = oof_meta["sstart"].to_numpy(dtype=int) <= 2023
    ll_v30_val = float(np.mean(oc.compute_categorical_log_loss_vec(P_map["v3_0_full_113"][val_mask], y_oof[val_mask])))
    winning_extra_cols: list[str] = []
    block_val_log: dict[str, float] = {"v3_0_full_113": round(ll_v30_val, 6)}

    ll_int7 = float(np.mean(oc.compute_categorical_log_loss_vec(P_map["v3_0_plus_internal_7"][val_mask], y_oof[val_mask])))
    ll_reds = float(np.mean(oc.compute_categorical_log_loss_vec(P_map["v3_0_plus_prev_reds"][val_mask], y_oof[val_mask])))
    block_val_log["v3_0_plus_internal_7"] = round(ll_int7, 6)
    block_val_log["v3_0_plus_prev_reds"] = round(ll_reds, 6)
    if ll_int7 < min(ll_v30_val, ll_reds):
        winning_extra_cols.extend(INTERNAL_7_COLS)
    elif ll_reds < ll_v30_val:
        winning_extra_cols.append("prev_reds_diff")

    for b_key, b_cols in (
        ("v3_0_plus_sb_p1_1", SB_1_COL),
        ("v3_0_plus_tm_cc0_6", TM_6_COLS),
    ):
        ll_b = float(np.mean(oc.compute_categorical_log_loss_vec(P_map[b_key][val_mask], y_oof[val_mask])))
        block_val_log[b_key] = round(ll_b, 6)
        if ll_b < ll_v30_val:
            winning_extra_cols.extend(b_cols)

    print("[VAL <= 2023 Block Check]", block_val_log, "-> bloques aceptados:", len(winning_extra_cols), "cols")

    selected_club_cols = BASE_113_FEATURES + tuple(winning_extra_cols)
    if set(selected_club_cols) == set(variants["v3_3_all_127"]):
        P_cand = P_map["v3_3_all_127"]
    elif set(selected_club_cols) == set(BASE_113_FEATURES):
        P_cand = P_map["v3_0_full_113"]
    else:
        p_sel_parts = []
        for ss in eval_seasons:
            tr_m = (sstarts >= 2012) & (sstarts < ss)
            ev_m = sstarts == ss
            if not np.any(tr_m) or not np.any(ev_m):
                continue
            max_dt = dates_all[tr_m].max()
            sw = 0.5 ** ((max_dt - dates_all[tr_m]).dt.days.to_numpy(dtype=np.float64) / 1460.0)
            X_tr = np.hstack([df.loc[tr_m, list(selected_club_cols)].to_numpy(dtype=np.float64), dummies_all[tr_m]])
            X_ev = np.hstack([df.loc[ev_m, list(selected_club_cols)].to_numpy(dtype=np.float64), dummies_all[ev_m]])
            p_ev, _, _, _ = _fit_and_predict_logit(X_tr, y_all[tr_m], sw, X_ev, c_reg=0.02)
            p_sel_parts.append(p_ev)
        P_cand = np.vstack(p_sel_parts)

    P_map["tachyon_v3_3_candidate"] = P_cand

    ll_v30_full_vec = oc.compute_categorical_log_loss_vec(P_map["v3_0_full_113"], y_oof)
    ll_v30_live_vec = oc.compute_categorical_log_loss_vec(P_map["v3_0_live_38_of_113"], y_oof)

    eval_table: dict[str, Any] = {}
    print(f"=== ABLACIÓN CLUBES WALK-FORWARD (n={len(y_oof)}, < {HOLDOUT_CUT_DATE}) ===")
    for k_name in (
        "v3_0_live_38_of_113",
        "v3_0_full_113",
        "v3_0_plus_prev_reds",
        "v3_0_plus_internal_7",
        "v3_0_plus_sb_p1_1",
        "v3_0_plus_tm_cc0_6",
        "tachyon_v3_3_candidate",
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
        eval_table[k_name] = ev_r
        print(
            f"  {k_name:26s} | LL={ev_r['log_loss']:.5f} | ΔLL vs v3.0(113)={ev_r['delta_ll_vs_benchmark']:+.5f} "
            f"{ev_r['delta_ll_ci95']} ({ev_r['significance']})"
        )

    cand_vs_live38 = oc.evaluate_calibration_with_bootstrap(
        P_cand,
        y_oof,
        benchmark_ll_vec=ll_v30_live_vec,
        n_resamples=BOOTSTRAP_SAMPLES,
        seed=BOOTSTRAP_SEED,
        include_bins=False,
    )
    print(
        f"  [Cand vs v3.0 Live 38/113] ΔLL = {cand_vs_live38['delta_ll_vs_benchmark']:+.5f} "
        f"{cand_vs_live38['delta_ll_ci95']} ({cand_vs_live38['significance']})"
    )

    # Benchmark contra Cierre Sharp de Pinnacle (`odds_close_ps_h/d/a` válidas > 1.01)
    oh = pd.to_numeric(oof_meta["odds_close_ps_h"], errors="coerce").to_numpy(dtype=np.float64)
    od = pd.to_numeric(oof_meta["odds_close_ps_d"], errors="coerce").to_numpy(dtype=np.float64)
    oa = pd.to_numeric(oof_meta["odds_close_ps_a"], errors="coerce").to_numpy(dtype=np.float64)
    ps_mask = np.isfinite(oh) & np.isfinite(od) & np.isfinite(oa) & (oh > 1.01) & (od > 1.01) & (oa > 1.01)
    P_pinnacle = _power_devig_3way(oh[ps_mask], od[ps_mask], oa[ps_mask])
    ll_pin_vec = oc.compute_categorical_log_loss_vec(P_pinnacle, y_oof[ps_mask])

    v30_vs_pin = oc.evaluate_calibration_with_bootstrap(
        P_map["v3_0_full_113"][ps_mask], y_oof[ps_mask], benchmark_ll_vec=ll_pin_vec, n_resamples=BOOTSTRAP_SAMPLES, seed=BOOTSTRAP_SEED, include_bins=False
    )
    cand_vs_pin = oc.evaluate_calibration_with_bootstrap(
        P_cand[ps_mask], y_oof[ps_mask], benchmark_ll_vec=ll_pin_vec, n_resamples=BOOTSTRAP_SAMPLES, seed=BOOTSTRAP_SEED, include_bins=False
    )
    cand_vs_v30_on_pin = oc.evaluate_calibration_with_bootstrap(
        P_cand[ps_mask],
        y_oof[ps_mask],
        benchmark_ll_vec=oc.compute_categorical_log_loss_vec(P_map["v3_0_full_113"][ps_mask], y_oof[ps_mask]),
        n_resamples=BOOTSTRAP_SAMPLES,
        seed=BOOTSTRAP_SEED,
        include_bins=False,
    )
    print(
        f"  [Subconjunto Cierre Pinnacle n={int(np.sum(ps_mask))}] "
        f"Pinnacle LL={float(np.mean(ll_pin_vec)):.5f} | v3.0 ΔLL={v30_vs_pin['delta_ll_vs_benchmark']:+.5f} | "
        f"v3.3 Cand ΔLL={cand_vs_pin['delta_ll_vs_benchmark']:+.5f} | "
        f"Mejora v3.3 vs v3.0={cand_vs_v30_on_pin['delta_ll_vs_benchmark']:+.5f} {cand_vs_v30_on_pin['delta_ll_ci95']} ({cand_vs_v30_on_pin['significance']})"
    )

    # Exportar candidato `model_club_v3_3_candidate.json` (`< 2025-02-02`, `status="candidate"`, `production_activated=false`)
    tr_final = df[df["sstart"] >= 2014].copy().reset_index(drop=True)
    div_tr = tr_final["div"].astype(str).to_numpy()
    dum_tr = np.column_stack([(div_tr == lvl).astype(np.float64) for lvl in div_levels])
    X_f = np.hstack([tr_final[list(selected_club_cols)].to_numpy(dtype=np.float64), dum_tr])
    y_f = tr_final["y"].to_numpy(dtype=np.int64)
    sw_f = 0.5 ** ((tr_final["match_date"].max() - tr_final["match_date"]).dt.days.to_numpy(dtype=np.float64) / 1460.0)
    P_tr_f, imp_f, sc_f, lr_f = _fit_and_predict_logit(X_f, y_f, sw_f, X_f, c_reg=0.02)
    tr_ll = float(-np.mean(np.log(np.clip(P_tr_f[np.arange(len(y_f)), y_f], 1e-15, 1.0))))

    full_feat_names = list(selected_club_cols) + [f"div_{d}" for d in div_levels]
    cand_art = {
        "type": "multinomial_logistic",
        "codename": "PitchLab Tachyon v3.3 Candidate",
        "version": "3.3.0-candidate",
        "status": "candidate",
        "production_activated": False,
        "production_enabled": False,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "seed": MODEL_SEED,
        "regularization_C": 0.02,
        "features": full_feat_names,
        "n_features_base": len(selected_club_cols),
        "div_levels": div_levels,
        "imputer": {"strategy": "median", "statistics": [float(v) for v in imp_f.statistics_.tolist()]},
        "scaler": {"mean": [float(v) for v in sc_f.mean_.tolist()], "scale": [float(v) for v in sc_f.scale_.tolist()]},
        "coef": [[float(x) for x in r] for r in lr_f.coef_.tolist()],
        "intercept": [float(x) for x in lr_f.intercept_.tolist()],
        "classes": [int(c) for c in lr_f.classes_.tolist()],
        "metadata": {
            "trained_on": (
                "Tachyon v3.0 (113 cols) + Free Open Upgrade (< 2025-02-02): "
                + ", ".join(winning_extra_cols)
            ),
            "n_matches": int(len(tr_final)),
            "seasons": [str(tr_final["season"].min()), str(tr_final["season"].max())],
            "target": "0=H, 1=D, 2=A",
            "train_log_loss": round(tr_ll, 6),
            "notes": (
                "Candidato científico v3.3 compatible 1:1 con engine.ts::ModelArtifact. "
                "model_motor_a.json permanece intacto; status=candidate, production_activated=false."
            ),
        },
    }
    CANDIDATE_CLUB_JSON_OUT.write_text(json.dumps(cand_art, indent=1), encoding="utf-8")

    # Exportar snapshot de 200 filas `< 2025-02-02` para verificación de paridad `< 1e-12` en Vitest
    rng = np.random.default_rng(MODEL_SEED)
    pool_sn = tr_final[tr_final["sstart"] >= 2023].copy().reset_index(drop=True)
    ch_idx = np.sort(rng.choice(len(pool_sn), size=min(200, len(pool_sn)), replace=False))
    sn_df = pool_sn.iloc[ch_idx].copy().reset_index(drop=True)
    dum_sn = np.column_stack([(sn_df["div"].astype(str).to_numpy() == lvl).astype(np.float64) for lvl in div_levels])
    X_sn = np.hstack([sn_df[list(selected_club_cols)].to_numpy(dtype=np.float64), dum_sn])
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
        raw_vals = [
            None if not math.isfinite(float(row_r[c])) else float(row_r[c])
            for c in selected_club_cols
        ]
        sn_rows[str(row_r["match_id"])] = {
            "div": dv_s,
            "season": str(row_r["season"]),
            "match_date": str(row_r["match_date"])[:10],
            "features": raw_vals,
            "div_onehot": [1 if lvl == dv_s else 0 for lvl in div_levels],
            "probs_python": [float(P_sn[idx_r, 0]), float(P_sn[idx_r, 1]), float(P_sn[idx_r, 2])],
        }
    CANDIDATE_CLUB_SNAP_OUT.write_text(
        json.dumps({"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "n": len(sn_rows), "rows": sn_rows}, indent=1),
        encoding="utf-8",
    )

    cand_sha = hashlib.sha256(CANDIDATE_CLUB_JSON_OUT.read_bytes()).hexdigest()
    snap_sha = hashlib.sha256(CANDIDATE_CLUB_SNAP_OUT.read_bytes()).hexdigest()

    out_summary = {
        "experiment_id": "EXP_V34_club_free_data",
        "codename": "PitchLab Tachyon v3.3 Candidate",
        "eval_split": "walk_forward_dev",
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "statsbomb_p1_1_calibration": sb_cal,
        "transfermarkt_matched_team_sides": tm_matched_sides,
        "transfermarkt_match_rate_pct": round(100.0 * tm_matched_sides / max(1, 2 * n_rows), 2),
        "val_block_selection_le_2023": block_val_log,
        "selected_extra_features": winning_extra_cols,
        "n_features_base_selected": len(selected_club_cols),
        "walk_forward_dev_2016_2024": eval_table,
        "candidate_vs_v30_live_38_of_113": cand_vs_live38,
        "pinnacle_closing_subset": {
            "n_matches_with_pinnacle_close": int(np.sum(ps_mask)),
            "pinnacle_closing_novig_ll": round(float(np.mean(ll_pin_vec)), 6),
            "v3_0_vs_pinnacle": v30_vs_pin,
            "v3_3_candidate_vs_pinnacle": cand_vs_pin,
            "v3_3_candidate_vs_v3_0_on_pinnacle_subset": cand_vs_v30_on_pin,
        },
        "artifacts_sha256": {
            "model_club_v3_3_candidate.json": cand_sha,
            "club_v3_3_snapshot.json": snap_sha,
        },
    }
    RESULTS_CLUB_JSON_OUT.write_text(json.dumps(out_summary, indent=2), encoding="utf-8")

    with TRIAL_REGISTRY_CLUB_OUT.open("a", encoding="utf-8") as rfh:
        rfh.write(
            json.dumps(
                {
                    "timestamp_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "experiment_id": "EXP_V34_club_free_data",
                    "eval_split": "walk_forward_dev",
                    "unlock_holdout": False,
                    "n_eval": int(len(y_oof)),
                    "log_loss": eval_table["tachyon_v3_3_candidate"]["log_loss"],
                    "delta_ll_vs_v30": eval_table["tachyon_v3_3_candidate"]["delta_ll_vs_benchmark"],
                    "delta_ll_vs_v30_ci95": eval_table["tachyon_v3_3_candidate"]["delta_ll_ci95"],
                    "model_sha256": cand_sha,
                }
            )
            + "\n"
        )


if __name__ == "__main__":
    main()
