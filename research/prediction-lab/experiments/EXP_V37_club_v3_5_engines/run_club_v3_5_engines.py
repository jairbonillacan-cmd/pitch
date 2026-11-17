"""EXP_V37 — Mejora arquitectónica integral de los motores de Fútbol de Clubes (`v3.5`):
  1. `PitchLab Tachyon v3.5 Live-Ensemble` (`1X2`):
     - Stack causal `100%` disponible en vivo (`58` features base + `23` `div` one-hot = `81` cols)
       combinando `LIVE_38` + `StatsBomb P1-1` (`att/def` desacoplado) + `Transfermarkt CC0` Olas 1–2 +
       interacciones físicas no lineales (choque de mercado temprano, fatiga UEFA en plantillas cortas,
       asimetría Elo).
     - Ensamble híbrido `Logit + HistGradientBoosting` calibrado por temperatura `T` exclusivamente en
       `VAL <= 2023`, exportado vía `serialize_hist_gbm_to_artifact` (`gbm_club_v3_5_live_candidate.json`).
  2. `PitchLab Horizon-Goals v3.5` (`Totals 1.5/2.5/3.5`, `BTTS`, `AH`, `Top Scorelines`):
     - Regresor `Poisson` (`log` link) causal sobre el entorno de ritmo/goles (`model_club_goals_v3_5_candidate.json`)
       + solver coherente Dixon-Coles de 3 parámetros `(lamHome*, lamAway*, rho_eff)` que preserva `1X2` exacto
       mientras alinea `lamHome* + lamAway*` con `T_hat`.

Gobernanza (`MASTER.md` §0 y `CONTRACT_OUTLOOK.md`):
  - Cero acceso a `>= 2025-02-02T17:30:00Z` para entrenamiento, calibración o evaluación.
  - Cero modificaciones a archivos congelados `v3.1`/`v3.2`.
  - Bootstrap determinista `mulberry32` (`1,000` réplicas, `seed = 20261111`).
"""

from __future__ import annotations

import os

os.environ.setdefault("OMP_NUM_THREADS", "4")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("LOKY_MAX_CPU_COUNT", "4")

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
EXP_V34_DIR = PRED_LAB_ROOT / "experiments" / "EXP_V34_club_free_data"
ARTIFACTS_DIR = EXP_DIR / "artifacts"

for _p in (str(REPO_ROOT), str(PRED_LAB_ROOT / "models" / "a"), str(EXP_V34_DIR), str(EXP_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from services.models import export_gbm_ts as eg  # noqa: E402
from services.models import outlook_calibration as oc  # noqa: E402

from club_free_sources import (  # noqa: E402
    HOLDOUT_CUT_DATE,
    CausalClubTransfermarktBridge,
    calibrate_statsbomb_p1_1_shot_xg,
)
from club_wave2_sources import CausalClubWave2Bridge  # noqa: E402
from horizon_dc_solver import (  # noqa: E402
    DEFAULT_MAX_GOALS,
    build_dc_score_matrix_exact,
    predict_poisson_log_link_exact,
    solve_coherent_dc_3param,
    solve_coherent_dc_3param_batch,
    solve_dc_2param_from_1x2,
    summarize_dc_markets_batch,
    summarize_dc_markets_from_matrix,
)
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
    _compute_statsbomb_ewm_feature,
    _fit_and_predict_logit,
    _power_devig_3way,
    _resolve_features_parquet,
)
from run_club_v3_4_experiment import ALL_W2_CLUB_COLS  # noqa: E402

PROB_LOG_FLOOR = 1e-15

LIVE_BASE_38_ORDERED: tuple[str, ...] = tuple(c for c in BASE_113_FEATURES if c in LIVE_V30_POPULATED_SET)
FREE_OPEN_14_ORDERED: tuple[str, ...] = SB_1_COL + TM_6_COLS + ALL_W2_CLUB_COLS

V35_EXTRA_6_1X2_COLS: tuple[str, ...] = (
    "sb_att_def_diff_ewm10",
    "club_tempo_sum_ewm12",
    "early_transfer_shock_diff",
    "early_promoted_val_diff",
    "cup_fatigue_thin_squad_adv",
    "abs_elo_mismatch",
)

HORIZON_GOALS_13_BASE_COLS: tuple[str, ...] = (
    "dc_exp_total",
    "sb_exp_total_ewm10",
    "club_tempo_sum_ewm12",
    "club_btts_rate_sum_ewm15",
    "club_corners_sum_ewm10",
    "tm_log_val_sum",
    "tm_val_abs_mismatch",
    "xi_ga90_sum",
    "abs_elo_mismatch",
    "elo_closeness",
    "low_scoring_tight_match",
    "season_progress",
    "games_14d_sum",
)

GBM_V35_JSON_OUT = REPO_ROOT / "src" / "data" / "prediction" / "gbm_club_v3_5_live_candidate.json"
LOGIT_V35_JSON_OUT = REPO_ROOT / "src" / "data" / "prediction" / "model_club_v3_5_live_candidate.json"
GOALS_V35_JSON_OUT = REPO_ROOT / "src" / "data" / "prediction" / "model_club_goals_v3_5_candidate.json"
STATE_V35_JSON_OUT = REPO_ROOT / "src" / "data" / "prediction" / "club_free_open_state_v3_5.json"
SNAP_V35_JSON_OUT = REPO_ROOT / "src" / "data" / "prediction" / "club_v3_5_live_snapshot.json"
RESULTS_V35_JSON_OUT = ARTIFACTS_DIR / "exp_v37_club_v3_5_results.json"
TRIAL_REGISTRY_V35_OUT = EXP_DIR / "trial_registry_club_v35.jsonl"


def _power_devig_2way(odds_1: np.ndarray, odds_2: np.ndarray) -> np.ndarray:
    q1 = 1.0 / np.clip(odds_1, 1.0001, 1000.0)
    q2 = 1.0 / np.clip(odds_2, 1.0001, 1000.0)
    lo = np.full(len(q1), 0.25, dtype=np.float64)
    hi = np.full(len(q1), 4.00, dtype=np.float64)
    for _ in range(32):
        mid = 0.5 * (lo + hi)
        s = (q1 ** mid) + (q2 ** mid)
        over = s > 1.0
        lo = np.where(over, mid, lo)
        hi = np.where(over, hi, mid)
    k = 0.5 * (lo + hi)
    p1 = q1 ** k
    p2 = q2 ** k
    tot = p1 + p2
    return np.column_stack([p1 / tot, p2 / tot])


def _apply_temperature_3way_exact(probs: np.ndarray, temperature: float) -> np.ndarray:
    """Idéntico a `gbm.ts::calibratedProbsFromLogitsInto`."""
    if abs(float(temperature) - 1.0) < 1e-12:
        return np.asarray(probs, dtype=np.float64)
    inv_t = 1.0 / float(temperature)
    lg = np.log(np.maximum(np.asarray(probs, dtype=np.float64), PROB_LOG_FLOOR)) * inv_t
    lg -= np.max(lg, axis=1, keepdims=True)
    ez = np.exp(lg)
    return ez / np.sum(ez, axis=1, keepdims=True)


def _blend_3way_exact(
    probs_logit: np.ndarray,
    probs_gbm_cal: np.ndarray,
    w_logit: float,
    w_gbm: float,
    blend_space: str,
) -> np.ndarray:
    """Idéntico a `gbm.ts::blendScratchInto`."""
    pl = np.asarray(probs_logit, dtype=np.float64)
    pg = np.asarray(probs_gbm_cal, dtype=np.float64)
    if blend_space == "logit":
        lg = float(w_logit) * np.log(np.maximum(pl, PROB_LOG_FLOOR)) + float(w_gbm) * np.log(
            np.maximum(pg, PROB_LOG_FLOOR)
        )
        lg -= np.max(lg, axis=1, keepdims=True)
        ez = np.exp(lg)
        return ez / np.sum(ez, axis=1, keepdims=True)
    raw = float(w_logit) * pl + float(w_gbm) * pg
    return raw / np.sum(raw, axis=1, keepdims=True)


def _compute_causal_club_tempo_and_xg_features(
    m_df: pd.DataFrame,
    sb_cal: dict[str, Any],
) -> pd.DataFrame:
    """Calcula acumuladores estrictamente pre-partido (`t' < t`) de ataque/defensa `StatsBomb P1-1`,
    ritmo de goles, tendencia `BTTS` y córners sobre `matches.parquet`."""
    work = m_df.sort_values(["match_date", "kickoff_time", "match_id"], kind="mergesort").reset_index(drop=True)
    bh = sb_cal["home"]
    ba = sb_cal["away"]

    alpha10 = 2.0 / 11.0
    alpha12 = 2.0 / 13.0
    alpha15 = 2.0 / 16.0

    sb_for: dict[str, float] = {}
    sb_ag: dict[str, float] = {}
    gf_ewm: dict[str, float] = {}
    ga_ewm: dict[str, float] = {}
    btts_ewm: dict[str, float] = {}
    cor_ewm: dict[str, float] = {}

    n = len(work)
    out_att_def_diff = np.empty(n, dtype=np.float64)
    out_sb_tot = np.empty(n, dtype=np.float64)
    out_tempo_sum = np.empty(n, dtype=np.float64)
    out_btts_sum = np.empty(n, dtype=np.float64)
    out_cor_sum = np.empty(n, dtype=np.float64)

    for idx, r in enumerate(work.itertuples(index=False)):
        dv = str(r.div)
        hk = f"{dv}::{r.home_team}"
        ak = f"{dv}::{r.away_team}"

        sf_h = sb_for.get(hk, 1.30)
        sa_h = sb_ag.get(hk, 1.25)
        sf_a = sb_for.get(ak, 1.25)
        sa_a = sb_ag.get(ak, 1.30)

        gfh = gf_ewm.get(hk, 1.32)
        gah = ga_ewm.get(hk, 1.32)
        gfa = gf_ewm.get(ak, 1.32)
        gaa = ga_ewm.get(ak, 1.32)

        bt_h = btts_ewm.get(hk, 0.51)
        bt_a = btts_ewm.get(ak, 0.51)
        co_h = cor_ewm.get(hk, 9.80)
        co_a = cor_ewm.get(ak, 9.80)

        # Emitir features estrictamente ANTES de observar el resultado de `r`
        out_att_def_diff[idx] = 0.5 * ((sf_h - sa_a) - (sf_a - sa_h))
        out_sb_tot[idx] = 0.5 * ((sf_h + sa_a) + (sf_a + sa_h))
        out_tempo_sum[idx] = 0.5 * ((gfh + gah) + (gfa + gaa))
        out_btts_sum[idx] = 0.5 * (bt_h + bt_a)
        out_cor_sum[idx] = 0.5 * (co_h + co_a)

        # Actualizar estado post-partido
        hg = float(r.home_goals)
        ag = float(r.away_goals)
        sh_h = float(r.shots_home) if pd.notna(r.shots_home) else float("nan")
        sh_a = float(r.shots_away) if pd.notna(r.shots_away) else float("nan")
        sot_h = float(r.sot_home) if pd.notna(r.sot_home) else float("nan")
        sot_a = float(r.sot_away) if pd.notna(r.sot_away) else float("nan")
        cor_h = float(r.corners_home) if pd.notna(r.corners_home) else 4.8
        cor_a = float(r.corners_away) if pd.notna(r.corners_away) else 4.0

        if math.isfinite(sot_h) and math.isfinite(sot_a) and math.isfinite(sh_h) and math.isfinite(sh_a):
            xgh = min(5.5, max(0.05, bh["intercept"] + bh["w_sot"] * sot_h + bh["w_soff"] * max(0.0, sh_h - sot_h) + bh["w_corners"] * cor_h))
            xga = min(5.5, max(0.05, ba["intercept"] + ba["w_sot"] * sot_a + ba["w_soff"] * max(0.0, sh_a - sot_a) + ba["w_corners"] * cor_a))
        else:
            xgh = min(5.5, max(0.10, 0.35 * 1.35 + 0.65 * hg))
            xga = min(5.5, max(0.10, 0.35 * 1.15 + 0.65 * ag))

        sb_for[hk] = (1.0 - alpha10) * sf_h + alpha10 * xgh
        sb_ag[hk] = (1.0 - alpha10) * sa_h + alpha10 * xga
        sb_for[ak] = (1.0 - alpha10) * sf_a + alpha10 * xga
        sb_ag[ak] = (1.0 - alpha10) * sa_a + alpha10 * xgh

        gf_ewm[hk] = (1.0 - alpha12) * gfh + alpha12 * min(6.0, hg)
        ga_ewm[hk] = (1.0 - alpha12) * gah + alpha12 * min(6.0, ag)
        gf_ewm[ak] = (1.0 - alpha12) * gfa + alpha12 * min(6.0, ag)
        ga_ewm[ak] = (1.0 - alpha12) * gaa + alpha12 * min(6.0, hg)

        is_btts = 1.0 if (hg >= 1.0 and ag >= 1.0) else 0.0
        btts_ewm[hk] = (1.0 - alpha15) * bt_h + alpha15 * is_btts
        btts_ewm[ak] = (1.0 - alpha15) * bt_a + alpha15 * is_btts

        tot_cor = min(24.0, max(0.0, cor_h + cor_a))
        cor_ewm[hk] = (1.0 - alpha10) * co_h + alpha10 * tot_cor
        cor_ewm[ak] = (1.0 - alpha10) * co_a + alpha10 * tot_cor

    return pd.DataFrame(
        {
            "match_id": work["match_id"].values,
            "sb_att_def_diff_ewm10": out_att_def_diff,
            "sb_exp_total_ewm10": out_sb_tot,
            "club_tempo_sum_ewm12": out_tempo_sum,
            "club_btts_rate_sum_ewm15": out_btts_sum,
            "club_corners_sum_ewm10": out_cor_sum,
        }
    )


def _estimate_causal_div_rho(
    hg_tr: np.ndarray,
    ag_tr: np.ndarray,
    lh_tr: np.ndarray,
    la_tr: np.ndarray,
    divs_tr: np.ndarray,
    div_levels: list[str],
    prior_rho: float = -0.105,
    prior_strength: float = 400.0,
) -> dict[str, float]:
    """Estima por división `rho_div` de forma estrictamente causal sobre el fold de entrenamiento,
    comparando la tasa empírica de `0-0 + 1-1` frente a `Poisson(lh_tr, la_tr)` con encogimiento Bayesiano."""
    valid = np.isfinite(lh_tr) & np.isfinite(la_tr) & (lh_tr > 0.05) & (la_tr > 0.05)
    hg_v = hg_tr[valid]
    ag_v = ag_tr[valid]
    lh_v = lh_tr[valid]
    la_v = la_tr[valid]
    dv_v = divs_tr[valid]

    obs_low_draw = ((hg_v == 0) & (ag_v == 0)) | ((hg_v == 1) & (ag_v == 1))
    exp_low_draw = np.exp(-(lh_v + la_v)) * (1.0 + lh_v * la_v)
    # P_DC(0-0 or 1-1) - P_Pois(0-0 or 1-1) = -2 * rho * lh * la * exp(-(lh + la))
    sens = 2.0 * lh_v * la_v * np.exp(-(lh_v + la_v))

    rho_map: dict[str, float] = {}
    for dv in div_levels:
        m = dv_v == dv
        n_m = float(np.sum(m))
        if n_m < 50.0:
            rho_map[dv] = round(prior_rho, 5)
            continue
        diff_sum = float(np.sum(obs_low_draw[m].astype(np.float64) - exp_low_draw[m]))
        sens_sum = float(np.sum(sens[m]))
        raw_rho = -diff_sum / max(sens_sum, 1.0)
        raw_rho = max(-0.22, min(0.02, raw_rho))
        shrunk = (n_m * raw_rho + prior_strength * prior_rho) / (n_m + prior_strength)
        rho_map[dv] = round(float(max(-0.20, min(-0.03, shrunk))), 5)
    return rho_map


def _export_live_club_state_v3_5(sb_cal: dict[str, Any]) -> dict[str, Any]:
    """Exporta `club_free_open_state_v3_5.json` con `608` clubes activos (acumuladores observados
    para inferencia viva con pesos 100% congelados en `< 2025-02-02`)."""
    matches_p = PRED_LAB_ROOT / "data" / "processed" / "matches.parquet"
    m_df = pd.read_parquet(matches_p)
    m_df["match_date"] = pd.to_datetime(m_df["match_date"])
    m_df = (
        m_df[m_df["result"].notna()]
        .sort_values(["match_date", "kickoff_time", "match_id"], kind="mergesort")
        .reset_index(drop=True)
    )

    bh, ba = sb_cal["home"], sb_cal["away"]
    alpha8 = 2.0 / 9.0
    alpha10 = 2.0 / 11.0
    alpha12 = 2.0 / 13.0
    alpha15 = 2.0 / 16.0

    sb_ewm: dict[str, float] = {}
    sb_for: dict[str, float] = {}
    sb_ag: dict[str, float] = {}
    gf_ewm: dict[str, float] = {}
    ga_ewm: dict[str, float] = {}
    btts_ewm: dict[str, float] = {}
    cor_ewm: dict[str, float] = {}
    active_clubs: dict[str, tuple[str, str, int]] = {}

    for r in m_df.itertuples(index=False):
        dv = str(r.div)
        ht = str(r.home_team)
        at = str(r.away_team)
        hk = f"{dv}::{ht}"
        ak = f"{dv}::{at}"
        d_ord = r.match_date.toordinal()
        active_clubs[hk] = (dv, ht, d_ord)
        active_clubs[ak] = (dv, at, d_ord)

        sh_h = float(r.shots_home) if pd.notna(r.shots_home) else float("nan")
        sh_a = float(r.shots_away) if pd.notna(r.shots_away) else float("nan")
        sot_h = float(r.sot_home) if pd.notna(r.sot_home) else float("nan")
        sot_a = float(r.sot_away) if pd.notna(r.sot_away) else float("nan")
        cor_h = float(r.corners_home) if pd.notna(r.corners_home) else 4.8
        cor_a = float(r.corners_away) if pd.notna(r.corners_away) else 4.0
        hg = float(r.home_goals)
        ag = float(r.away_goals)

        if math.isfinite(sot_h) and math.isfinite(sot_a) and math.isfinite(sh_h) and math.isfinite(sh_a):
            xgh_raw = bh["intercept"] + bh["w_sot"] * sot_h + bh["w_soff"] * max(0.0, sh_h - sot_h) + bh["w_corners"] * cor_h
            xga_raw = ba["intercept"] + ba["w_sot"] * sot_a + ba["w_soff"] * max(0.0, sh_a - sot_a) + ba["w_corners"] * cor_a
            xgd = max(-4.0, min(4.0, xgh_raw - xga_raw))
            xgh = min(5.5, max(0.05, xgh_raw))
            xga = min(5.5, max(0.05, xga_raw))
        else:
            xgd = 0.65 * max(-4.0, min(4.0, hg - ag))
            xgh = min(5.5, max(0.10, 0.35 * 1.35 + 0.65 * hg))
            xga = min(5.5, max(0.10, 0.35 * 1.15 + 0.65 * ag))

        sb_ewm[hk] = (1.0 - alpha8) * sb_ewm.get(hk, 0.0) + alpha8 * xgd
        sb_ewm[ak] = (1.0 - alpha8) * sb_ewm.get(ak, 0.0) - alpha8 * xgd

        sb_for[hk] = (1.0 - alpha10) * sb_for.get(hk, 1.30) + alpha10 * xgh
        sb_ag[hk] = (1.0 - alpha10) * sb_ag.get(hk, 1.25) + alpha10 * xga
        sb_for[ak] = (1.0 - alpha10) * sb_for.get(ak, 1.25) + alpha10 * xga
        sb_ag[ak] = (1.0 - alpha10) * sb_ag.get(ak, 1.30) + alpha10 * xgh

        gf_ewm[hk] = (1.0 - alpha12) * gf_ewm.get(hk, 1.32) + alpha12 * min(6.0, hg)
        ga_ewm[hk] = (1.0 - alpha12) * ga_ewm.get(hk, 1.32) + alpha12 * min(6.0, ag)
        gf_ewm[ak] = (1.0 - alpha12) * gf_ewm.get(ak, 1.32) + alpha12 * min(6.0, ag)
        ga_ewm[ak] = (1.0 - alpha12) * ga_ewm.get(ak, 1.32) + alpha12 * min(6.0, hg)

        is_btts = 1.0 if (hg >= 1.0 and ag >= 1.0) else 0.0
        btts_ewm[hk] = (1.0 - alpha15) * btts_ewm.get(hk, 0.51) + alpha15 * is_btts
        btts_ewm[ak] = (1.0 - alpha15) * btts_ewm.get(ak, 0.51) + alpha15 * is_btts

        tot_cor = min(24.0, max(0.0, cor_h + cor_a))
        cor_ewm[hk] = (1.0 - alpha10) * cor_ewm.get(hk, 9.80) + alpha10 * tot_cor
        cor_ewm[ak] = (1.0 - alpha10) * cor_ewm.get(ak, 9.80) + alpha10 * tot_cor

    max_ord_obs = int(m_df["match_date"].max().toordinal())
    min_active_ord = max_ord_obs - 1095
    tm_live = CausalClubTransfermarktBridge(max_date_exclusive=None)
    w2_live = CausalClubWave2Bridge(max_date_exclusive=None)
    ref_ord = max_ord_obs + 1

    clubs_out: dict[str, dict[str, Any]] = {}
    div_vals_acc: dict[str, list[float]] = {}
    div_xi_acc: dict[str, list[float]] = {}

    for ck in sorted(active_clubs.keys()):
        dv, tname, last_o = active_clubs[ck]
        if last_o < min_active_ord:
            continue
        tm_m = tm_live.lookup_prematch_club_tm(dv, tname, ref_ord, 1525.0)
        cid = tm_live.resolve_club_id(dv, tname)
        w2_m = w2_live.lookup_club_wave2(cid, ref_ord)
        if tm_m["tm_has_val"] > 0.0:
            div_vals_acc.setdefault(dv, []).append(float(tm_m["tm_raw_log_val"]))
        if w2_m["has_realized_xi"] > 0.0:
            div_xi_acc.setdefault(dv, []).append(float(w2_m["realized_xi_log_val"]))

        clubs_out[ck] = {
            "div": dv,
            "team": tname,
            "tm_club_id": cid,
            "sb_xg_ewm8": round(float(sb_ewm.get(ck, 0.0)), 6),
            "sb_xg_for_ewm10": round(float(sb_for.get(ck, 1.28)), 6),
            "sb_xg_against_ewm10": round(float(sb_ag.get(ck, 1.28)), 6),
            "goals_for_ewm12": round(float(gf_ewm.get(ck, 1.32)), 6),
            "goals_against_ewm12": round(float(ga_ewm.get(ck, 1.32)), 6),
            "btts_rate_ewm15": round(float(btts_ewm.get(ck, 0.51)), 6),
            "corners_total_ewm10": round(float(cor_ewm.get(ck, 9.80)), 6),
            "tm_has_val": float(tm_m["tm_has_val"]),
            "tm_raw_log_val": round(float(tm_m["tm_raw_log_val"]), 6),
            "tm_depth_ratio": round(float(tm_m["tm_depth_ratio"]), 6),
            "tm_new_mgr_flag": float(tm_m["tm_new_mgr_flag"]),
            "tm_mgr_pae": round(float(tm_m["tm_mgr_pae"]), 6),
            "midweek_cup_load": round(float(w2_m["midweek_cup_load"]), 4),
            "games_14d_allcomps": round(float(w2_m["games_14d_allcomps"]), 4),
            "has_realized_xi": float(w2_m["has_realized_xi"]),
            "realized_xi_log_val": round(float(w2_m["realized_xi_log_val"]), 6),
            "injury_avail_ratio": round(float(w2_m["injury_avail_ratio"]), 6),
            "xi_ga90_allcomps": round(float(w2_m["xi_ga90_allcomps"]), 6),
            "net_transfer_val_120d": round(float(w2_m["net_transfer_val_120d"]), 6),
            "inbound_fee_120d": round(float(w2_m["inbound_fee_120d"]), 6),
        }

    div_meds_out = {dv: round(float(pd.Series(vs).median()), 6) for dv, vs in sorted(div_vals_acc.items()) if vs}
    div_xi_out = {dv: round(float(pd.Series(vs).median()), 6) for dv, vs in sorted(div_xi_acc.items()) if vs}

    payload = {
        "schema_version": "club_free_open_state_v3.5.0",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "weights_trained_strictly_before": HOLDOUT_CUT_DATE,
        "max_observed_match_date": str(m_df["match_date"].max())[:10],
        "n_active_clubs": len(clubs_out),
        "live_base_38_features": list(LIVE_BASE_38_ORDERED),
        "free_open_14_features": list(FREE_OPEN_14_ORDERED),
        "v3_5_extra_6_features": list(V35_EXTRA_6_1X2_COLS),
        "horizon_goals_13_features": list(HORIZON_GOALS_13_BASE_COLS),
        "div_ewm_log_val": div_meds_out,
        "div_ewm_xi_val": div_xi_out,
        "clubs": clubs_out,
    }
    STATE_V35_JSON_OUT.write_text(json.dumps(payload, indent=1), encoding="utf-8")
    return payload


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
    if bool((f_df["match_date"] >= HOLDOUT_CUT_TS).any()):
        raise RuntimeError("HoldoutSealedAccessError en features.parquet")
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
            "odds_close_ps_h",
            "odds_close_ps_d",
            "odds_close_ps_a",
            "totals_close_p_over",
            "totals_close_p_under",
        ]
    ].drop_duplicates("match_id")

    df = (
        f_df[f_df["sstart"] >= 2010]
        .merge(m_join, on="match_id", how="left", suffixes=("", "_m"))
        .merge(sb_sig_df, on="match_id", how="left")
        .merge(tempo_df, on="match_id", how="left")
    )
    ht_col = "home_team" if "home_team" in df.columns else "home_team_m"
    at_col = "away_team" if "away_team" in df.columns else "away_team_m"
    hg_col = "home_goals" if "home_goals" in df.columns else "home_goals_m"
    ag_col = "away_goals" if "away_goals" in df.columns else "away_goals_m"
    df = df.sort_values(["match_date", "match_id"], kind="mergesort").reset_index(drop=True)

    tm_bridge = CausalClubTransfermarktBridge(max_date_exclusive=HOLDOUT_CUT_DATE)
    w2_bridge = CausalClubWave2Bridge(max_date_exclusive=HOLDOUT_CUT_DATE)

    n_rows = len(df)
    tm6_mat = np.zeros((n_rows, len(TM_6_COLS)), dtype=np.float64)
    w2_mat = np.zeros((n_rows, len(ALL_W2_CLUB_COLS)), dtype=np.float64)
    tm_val_sum_vec = np.zeros(n_rows, dtype=np.float64)
    tm_val_abs_vec = np.zeros(n_rows, dtype=np.float64)
    xi_ga90_sum_vec = np.zeros(n_rows, dtype=np.float64)
    games_14d_sum_vec = np.zeros(n_rows, dtype=np.float64)
    cup_thin_adv_vec = np.zeros(n_rows, dtype=np.float64)

    d_ords = df["match_date"].map(lambda d: d.toordinal()).to_numpy(dtype=np.int64)
    divs = df["div"].astype(str).to_numpy()
    h_names = df[ht_col].astype(str).to_numpy()
    a_names = df[at_col].astype(str).to_numpy()
    elo_diffs = pd.to_numeric(df["elo_diff_no_hfa"], errors="coerce").fillna(0.0).to_numpy(dtype=np.float64)
    h_prom = pd.to_numeric(df["h_div_change"], errors="coerce").fillna(0.0).to_numpy(dtype=np.float64)
    a_prom = pd.to_numeric(df["a_div_change"], errors="coerce").fillna(0.0).to_numpy(dtype=np.float64)
    s_prog = pd.to_numeric(df["season_progress"], errors="coerce").fillna(0.5).to_numpy(dtype=np.float64)

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
            depth_h, depth_a = th["tm_depth_ratio"], ta["tm_depth_ratio"]
        elif has_h and not has_a:
            rel_h = th["tm_raw_log_val"] - cur_div_med
            imp_a = -0.35 + 0.30 * elo_rel_a
            rel_a = imp_a
            val_diff = 0.65 * (rel_h - imp_a)
            depth_diff = 0.50 * (th["tm_depth_ratio"] - 0.26)
            gap_diff = 0.65 * (rel_h - elo_rel_h)
            depth_h, depth_a = th["tm_depth_ratio"], 0.26
        elif has_a and not has_h:
            rel_a = ta["tm_raw_log_val"] - cur_div_med
            imp_h = -0.35 + 0.30 * elo_rel_h
            rel_h = imp_h
            val_diff = 0.65 * (imp_h - rel_a)
            depth_diff = 0.50 * (0.26 - ta["tm_depth_ratio"])
            gap_diff = -0.65 * (rel_a - elo_rel_a)
            depth_h, depth_a = 0.26, ta["tm_depth_ratio"]
        else:
            rel_h, rel_a, val_diff, depth_diff, gap_diff = 0.0, 0.0, 0.0, 0.0, 0.0
            depth_h, depth_a = 0.26, 0.26

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
        tm_val_sum_vec[i] = rel_h + rel_a
        tm_val_abs_vec[i] = abs(val_diff)

        cid_h = tm_bridge.resolve_club_id(dv_i, h_names[i])
        cid_a = tm_bridge.resolve_club_id(dv_i, a_names[i])
        w2_h = w2_bridge.lookup_club_wave2(cid_h, m_ord)
        w2_a = w2_bridge.lookup_club_wave2(cid_a, m_ord)

        w2_mat[i, 0] = w2_a["midweek_cup_load"] - w2_h["midweek_cup_load"]
        w2_mat[i, 1] = w2_a["games_14d_allcomps"] - w2_h["games_14d_allcomps"]
        games_14d_sum_vec[i] = w2_h["games_14d_allcomps"] + w2_a["games_14d_allcomps"]

        thin_a = min(1.35, max(0.50, 1.35 - depth_a))
        thin_h = min(1.35, max(0.50, 1.35 - depth_h))
        cup_thin_adv_vec[i] = w2_a["midweek_cup_load"] * thin_a - w2_h["midweek_cup_load"] * thin_h

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
            xi_val_diff, avail_diff, ga90_diff = 0.0, 0.0, 0.0
            ga90_sum = 4.20

        if hx:
            div_ewm_xi_val[dv_i] = (1.0 - alpha_div) * div_ewm_xi_val.get(dv_i, w2_h["realized_xi_log_val"]) + alpha_div * w2_h["realized_xi_log_val"]
        if ax:
            div_ewm_xi_val[dv_i] = (1.0 - alpha_div) * div_ewm_xi_val.get(dv_i, w2_a["realized_xi_log_val"]) + alpha_div * w2_a["realized_xi_log_val"]

        w2_mat[i, 2] = xi_val_diff
        w2_mat[i, 3] = avail_diff
        w2_mat[i, 4] = ga90_diff
        w2_mat[i, 5] = w2_h["net_transfer_val_120d"] - w2_a["net_transfer_val_120d"]
        w2_mat[i, 6] = w2_h["inbound_fee_120d"] - w2_a["inbound_fee_120d"]
        xi_ga90_sum_vec[i] = ga90_sum

    for j, c_nm in enumerate(TM_6_COLS):
        df[c_nm] = tm6_mat[:, j]
    for j, c_nm in enumerate(ALL_W2_CLUB_COLS):
        df[c_nm] = w2_mat[:, j]

    early_w = np.clip(1.0 - s_prog, 0.0, 1.0)
    df["early_transfer_shock_diff"] = early_w * df["tm_net_transfer_val_120d_diff"].to_numpy(dtype=np.float64)
    df["early_promoted_val_diff"] = early_w * df["tm_promoted_val_boost_diff"].to_numpy(dtype=np.float64)
    df["cup_fatigue_thin_squad_adv"] = cup_thin_adv_vec
    df["abs_elo_mismatch"] = np.abs(elo_diffs) / 200.0
    df["tm_log_val_sum"] = tm_val_sum_vec
    df["tm_val_abs_mismatch"] = tm_val_abs_vec
    df["xi_ga90_sum"] = xi_ga90_sum_vec
    df["games_14d_sum"] = games_14d_sum_vec

    div_levels = sorted(df["div"].astype(str).unique().tolist())
    div_vals = df["div"].astype(str).to_numpy()
    dummies_all = np.column_stack([(div_vals == lvl).astype(np.float64) for lvl in div_levels])
    sstarts = df["sstart"].to_numpy(dtype=int)
    y_all = df["y"].to_numpy(dtype=np.int64)
    hg_all = pd.to_numeric(df[hg_col], errors="coerce").to_numpy(dtype=np.float64)
    ag_all = pd.to_numeric(df[ag_col], errors="coerce").to_numpy(dtype=np.float64)
    tot_goals_all = hg_all + ag_all
    dates_all = df["match_date"]
    eval_seasons = sorted(set(sstarts[sstarts >= 2016]))

    v34_live_52_cols = LIVE_BASE_38_ORDERED + FREE_OPEN_14_ORDERED
    v35_live_58_cols = v34_live_52_cols + V35_EXTRA_6_1X2_COLS

    # -----------------------------------------------------------------------
    # PARTE 1: Walk-Forward OOF 1X2 (Logit 52 vs Logit 58 vs HGB vs Ensamble)
    #          + Horizon-Goals Poisson OOF (2016..2024, < 2025-02-02)
    # -----------------------------------------------------------------------
    hgb_params = {
        "loss": "log_loss",
        "max_depth": 4,
        "max_leaf_nodes": 15,
        "min_samples_leaf": 180,
        "learning_rate": 0.04,
        "max_iter": 135,
        "l2_regularization": 14.0,
        "early_stopping": False,
        "random_state": MODEL_SEED,
    }

    oof_logit52: list[np.ndarray] = []
    oof_logit58_by_c: dict[float, list[np.ndarray]] = {0.01: [], 0.02: [], 0.04: []}
    oof_hgb52_raw: list[np.ndarray] = []
    oof_hgb58_raw: list[np.ndarray] = []
    oof_pois_by_alpha: dict[float, list[np.ndarray]] = {0.01: [], 0.05: [], 0.20: []}
    oof_div_rho_vec: list[np.ndarray] = []
    meta_parts: list[pd.DataFrame] = []

    for ss in eval_seasons:
        tr_m = (sstarts >= 2012) & (sstarts < ss)
        ev_m = sstarts == ss
        if not np.any(tr_m) or not np.any(ev_m):
            continue
        max_dt = dates_all[tr_m].max()
        sw = 0.5 ** ((max_dt - dates_all[tr_m]).dt.days.to_numpy(dtype=np.float64) / 1460.0)

        X_tr_52 = np.hstack([df.loc[tr_m, list(v34_live_52_cols)].to_numpy(dtype=np.float64), dummies_all[tr_m]])
        X_ev_52 = np.hstack([df.loc[ev_m, list(v34_live_52_cols)].to_numpy(dtype=np.float64), dummies_all[ev_m]])
        p_l52, _, _, _ = _fit_and_predict_logit(X_tr_52, y_all[tr_m], sw, X_ev_52, c_reg=0.02)
        oof_logit52.append(p_l52)

        X_tr_58 = np.hstack([df.loc[tr_m, list(v35_live_58_cols)].to_numpy(dtype=np.float64), dummies_all[tr_m]])
        X_ev_58 = np.hstack([df.loc[ev_m, list(v35_live_58_cols)].to_numpy(dtype=np.float64), dummies_all[ev_m]])
        for c_val in oof_logit58_by_c:
            p_l58, _, _, _ = _fit_and_predict_logit(X_tr_58, y_all[tr_m], sw, X_ev_58, c_reg=c_val)
            oof_logit58_by_c[c_val].append(p_l58)

        hgb52 = HistGradientBoostingClassifier(**hgb_params)
        hgb52.fit(X_tr_52, y_all[tr_m], sample_weight=sw)
        oof_hgb52_raw.append(hgb52.predict_proba(X_ev_52))

        hgb58 = HistGradientBoostingClassifier(**hgb_params)
        hgb58.fit(X_tr_58, y_all[tr_m], sample_weight=sw)
        oof_hgb58_raw.append(hgb58.predict_proba(X_ev_58))

        # Regresor Poisson causal de goles totales (`Horizon-Goals v3.5`)
        Xg_tr = np.hstack([df.loc[tr_m, list(HORIZON_GOALS_13_BASE_COLS)].to_numpy(dtype=np.float64), dummies_all[tr_m]])
        Xg_ev = np.hstack([df.loc[ev_m, list(HORIZON_GOALS_13_BASE_COLS)].to_numpy(dtype=np.float64), dummies_all[ev_m]])
        imp_g = SimpleImputer(strategy="median").fit(Xg_tr)
        Xg_tr_i = imp_g.transform(Xg_tr)
        Xg_ev_i = imp_g.transform(Xg_ev)
        sc_g = StandardScaler().fit(Xg_tr_i)
        sc_g.scale_ = np.where(sc_g.scale_ == 0.0, 1.0, sc_g.scale_)
        Zg_tr = sc_g.transform(Xg_tr_i)
        Zg_ev = sc_g.transform(Xg_ev_i)
        y_tot_tr = np.clip(tot_goals_all[tr_m], 0.0, 14.0)

        for a_val in oof_pois_by_alpha:
            pr = PoissonRegressor(alpha=a_val, max_iter=1000)
            pr.fit(Zg_tr, y_tot_tr, sample_weight=sw)
            eta_ev = np.clip(float(pr.intercept_) + Zg_ev @ pr.coef_, math.log(0.45), math.log(7.50))
            oof_pois_by_alpha[a_val].append(np.exp(eta_ev))

        # `rho_div` causal estimado únicamente en `tr_m`
        lh_tr_dc = pd.to_numeric(df.loc[tr_m, "dc_lam_home"], errors="coerce").to_numpy(dtype=np.float64)
        la_tr_dc = pd.to_numeric(df.loc[tr_m, "dc_lam_away"], errors="coerce").to_numpy(dtype=np.float64)
        rho_div_map = _estimate_causal_div_rho(hg_all[tr_m], ag_all[tr_m], lh_tr_dc, la_tr_dc, div_vals[tr_m], div_levels)
        oof_div_rho_vec.append(np.array([rho_div_map.get(dv, -0.105) for dv in div_vals[ev_m]], dtype=np.float64))

        meta_parts.append(
            df.loc[
                ev_m,
                [
                    "match_id",
                    "div",
                    "sstart",
                    "y",
                    hg_col,
                    ag_col,
                    "dc_lam_home",
                    "dc_lam_away",
                    "odds_close_ps_h",
                    "odds_close_ps_d",
                    "odds_close_ps_a",
                    "totals_close_p_over",
                    "totals_close_p_under",
                ],
            ]
            .rename(columns={hg_col: "home_goals", ag_col: "away_goals"})
            .copy()
        )
        print(f"  [Fold {ss}] completado ({int(np.sum(ev_m))} partidos)")

    oof_meta = pd.concat(meta_parts, ignore_index=True)
    y_oof = oof_meta["y"].to_numpy(dtype=np.int64)
    val_mask = oof_meta["sstart"].to_numpy(dtype=int) <= 2023
    oos24_mask = oof_meta["sstart"].to_numpy(dtype=int) == 2024

    P_l52 = np.vstack(oof_logit52)
    P_l58_map = {c: np.vstack(v) for c, v in oof_logit58_by_c.items()}
    P_hgb52_raw = np.vstack(oof_hgb52_raw)
    P_hgb58_raw = np.vstack(oof_hgb58_raw)
    T_pois_map = {a: np.concatenate(v) for a, v in oof_pois_by_alpha.items()}
    rho_div_oof = np.concatenate(oof_div_rho_vec)

    # Selección estricta en `VAL <= 2023` para `1X2`
    ll_l52_val = float(np.mean(oc.compute_categorical_log_loss_vec(P_l52[val_mask], y_oof[val_mask])))
    best_c58 = min(
        P_l58_map.keys(),
        key=lambda c: float(np.mean(oc.compute_categorical_log_loss_vec(P_l58_map[c][val_mask], y_oof[val_mask]))),
    )
    ll_l58_val = float(np.mean(oc.compute_categorical_log_loss_vec(P_l58_map[best_c58][val_mask], y_oof[val_mask])))

    use_58_cols = ll_l58_val < ll_l52_val - 1e-6
    chosen_1x2_cols = v35_live_58_cols if use_58_cols else v34_live_52_cols
    chosen_c = best_c58 if use_58_cols else 0.02
    P_logit_chosen = P_l58_map[best_c58] if use_58_cols else P_l52
    P_hgb_raw_chosen = P_hgb58_raw if use_58_cols else P_hgb52_raw

    # Calibración de Temperatura `T` del HGB estrictamente en `VAL <= 2023`
    t_grid = (0.85, 0.92, 1.0, 1.05, 1.10, 1.16, 1.22, 1.30)
    best_temp = min(
        t_grid,
        key=lambda t: float(
            np.mean(oc.compute_categorical_log_loss_vec(_apply_temperature_3way_exact(P_hgb_raw_chosen[val_mask], t), y_oof[val_mask]))
        ),
    )
    P_hgb_cal = _apply_temperature_3way_exact(P_hgb_raw_chosen, best_temp)
    ll_hgb_cal_val = float(np.mean(oc.compute_categorical_log_loss_vec(P_hgb_cal[val_mask], y_oof[val_mask])))

    # Selección de `(blend_space, w_gbm)` estrictamente en `VAL <= 2023`
    best_ens_cfg = ("logit", 0.0)
    best_ens_val_ll = float(np.mean(oc.compute_categorical_log_loss_vec(P_logit_chosen[val_mask], y_oof[val_mask])))
    ens_grid_log: dict[str, float] = {}
    for b_space in ("logit", "probability"):
        for wg in (0.0, 0.12, 0.20, 0.28, 0.35, 0.45, 0.55):
            wl = round(1.0 - wg, 6)
            p_try = _blend_3way_exact(P_logit_chosen[val_mask], P_hgb_cal[val_mask], wl, wg, b_space)
            ll_try = float(np.mean(oc.compute_categorical_log_loss_vec(p_try, y_oof[val_mask])))
            ens_grid_log[f"{b_space}:w_gbm={wg:.2f}"] = round(ll_try, 6)
            if ll_try < best_ens_val_ll - 1e-7:
                best_ens_val_ll = ll_try
                best_ens_cfg = (b_space, wg)

    best_blend_space, best_w_gbm = best_ens_cfg
    best_w_logit = round(1.0 - best_w_gbm, 6)
    P_v35_ens = _blend_3way_exact(P_logit_chosen, P_hgb_cal, best_w_logit, best_w_gbm, best_blend_space)

    print(
        f"\n[VAL <= 2023 1X2 Selection] Logit52={ll_l52_val:.6f} | Logit58(C={best_c58})={ll_l58_val:.6f} | "
        f"HGB_cal(T={best_temp})={ll_hgb_cal_val:.6f} | Ensemble({best_blend_space}, w_gbm={best_w_gbm})={best_ens_val_ll:.6f}"
    )

    # Evaluación OOF completa `2016..2024` (`n = 68,638`) y `OOS 2024` (`n = 9,712`)
    ll_l52_vec = oc.compute_categorical_log_loss_vec(P_l52, y_oof)
    res_l52 = oc.evaluate_calibration_with_bootstrap(
        P_l52, y_oof, benchmark_ll_vec=ll_l52_vec, benchmark_is_self=True, n_resamples=BOOTSTRAP_SAMPLES, seed=BOOTSTRAP_SEED, include_bins=False
    )
    res_l_chosen = oc.evaluate_calibration_with_bootstrap(
        P_logit_chosen, y_oof, benchmark_ll_vec=ll_l52_vec, n_resamples=BOOTSTRAP_SAMPLES, seed=BOOTSTRAP_SEED, include_bins=False
    )
    res_hgb_cal = oc.evaluate_calibration_with_bootstrap(
        P_hgb_cal, y_oof, benchmark_ll_vec=ll_l52_vec, n_resamples=BOOTSTRAP_SAMPLES, seed=BOOTSTRAP_SEED, include_bins=False
    )
    res_v35_ens_vs_v34_live = oc.evaluate_calibration_with_bootstrap(
        P_v35_ens, y_oof, benchmark_ll_vec=ll_l52_vec, n_resamples=BOOTSTRAP_SAMPLES, seed=BOOTSTRAP_SEED, include_bins=False
    )
    res_v35_ens_oos24 = oc.evaluate_calibration_with_bootstrap(
        P_v35_ens[oos24_mask],
        y_oof[oos24_mask],
        benchmark_ll_vec=ll_l52_vec[oos24_mask],
        n_resamples=BOOTSTRAP_SAMPLES,
        seed=BOOTSTRAP_SEED,
        include_bins=False,
    )
    print(
        f"=== 1X2 WALK-FORWARD (n={len(y_oof)}) ===\n"
        f"  Tachyon v3.4 Live (52 Logit)  : LL={res_l52['log_loss']:.5f} | ECE={res_l52['ece']:.5f}\n"
        f"  Tachyon v3.5 Live Logit ({len(chosen_1x2_cols)}) : LL={res_l_chosen['log_loss']:.5f} | ΔLL={res_l_chosen['delta_ll_vs_benchmark']:+.5f} {res_l_chosen['delta_ll_ci95']} ({res_l_chosen['significance']})\n"
        f"  Tachyon v3.5 Calibrated HGB   : LL={res_hgb_cal['log_loss']:.5f} | ECE={res_hgb_cal['ece']:.5f}\n"
        f"  Tachyon v3.5 Live-Ensemble    : LL={res_v35_ens_vs_v34_live['log_loss']:.5f} | ECE={res_v35_ens_vs_v34_live['ece']:.5f} | "
        f"ΔLL vs v3.4 Live={res_v35_ens_vs_v34_live['delta_ll_vs_benchmark']:+.5f} {res_v35_ens_vs_v34_live['delta_ll_ci95']} ({res_v35_ens_vs_v34_live['significance']})\n"
        f"  [Untouched OOS 2024 n={int(np.sum(oos24_mask))}] LL={res_v35_ens_oos24['log_loss']:.5f} | "
        f"ΔLL vs v3.4 Live={res_v35_ens_oos24['delta_ll_vs_benchmark']:+.5f} {res_v35_ens_oos24['delta_ll_ci95']} ({res_v35_ens_oos24['significance']})"
    )

    # -----------------------------------------------------------------------
    # PARTE 2: Horizon-Goals v3.5 (`Totals 1.5/2.5/3.5`, `BTTS` y coherencia 1X2)
    # -----------------------------------------------------------------------
    hg_oof = oof_meta["home_goals"].to_numpy(dtype=np.float64)
    ag_oof = oof_meta["away_goals"].to_numpy(dtype=np.float64)
    tot_oof = hg_oof + ag_oof
    y_ov15 = np.where(tot_oof >= 2.0, 0, 1).astype(np.int64)  # 0 = Over, 1 = Under (orden `outlook.ts`)
    y_ov25 = np.where(tot_oof >= 3.0, 0, 1).astype(np.int64)
    y_ov35 = np.where(tot_oof >= 4.0, 0, 1).astype(np.int64)
    y_btts = np.where((hg_oof >= 1.0) & (ag_oof >= 1.0), 0, 1).astype(np.int64)  # 0 = Yes, 1 = No

    # Baseline A: `v3.0` (`dc_lam_home`, `dc_lam_away`, `rho = -0.11` usado por `outlook.ts` en `v3.0`)
    lh_v30_raw = np.clip(pd.to_numeric(oof_meta["dc_lam_home"], errors="coerce").fillna(1.42).to_numpy(dtype=np.float64), 0.05, 10.0)
    la_v30_raw = np.clip(pd.to_numeric(oof_meta["dc_lam_away"], errors="coerce").fillna(1.12).to_numpy(dtype=np.float64), 0.05, 10.0)
    mkt_v30_dc = summarize_dc_markets_batch(lh_v30_raw, la_v30_raw, np.full(len(y_oof), -0.11))

    # Baseline B: `v3.4 Live` 2-parámetros (`fitDixonColesLambdasFrom1X2` con `rho = -0.10` usado en `club_v3_3.ts`)
    # Resolver `T_1x2` exacto con `solve_dc_2param_from_1x2` de forma rápida (o aproximación + refinamiento)
    print("\nCalculando baseline 2-param DC (`fitDixonColesLambdasFrom1X2`) sobre n=68,638...")
    lh_2p = np.empty(len(y_oof), dtype=np.float64)
    la_2p = np.empty(len(y_oof), dtype=np.float64)
    # Bisección/Newton vectorizada de 2 parámetros para `fitDixonColesLambdasFrom1X2(P_l52, rho=-0.10)`
    u2 = np.log(np.clip(P_l52[:, 0] / np.maximum(P_l52[:, 0] + P_l52[:, 2], 1e-6), 0.08, 0.92) / (1.0 - np.clip(P_l52[:, 0] / np.maximum(P_l52[:, 0] + P_l52[:, 2], 1e-6), 0.08, 0.92)))
    v2 = np.full(len(y_oof), math.log(2.55), dtype=np.float64)
    tdiff_52 = P_l52[:, 0] - P_l52[:, 2]
    tdraw_52 = P_l52[:, 1]
    rho_fixed_m010 = np.full(len(y_oof), -0.10, dtype=np.float64)
    h_st = 1e-4
    for _ in range(16):
        t_c = np.clip(np.exp(v2), 0.25, 8.0)
        s_c = np.clip(1.0 / (1.0 + np.exp(-u2)), 0.04, 0.96)
        m0 = summarize_dc_markets_batch(np.clip(t_c * s_c, 0.05, 10.0), np.clip(t_c * (1.0 - s_c), 0.05, 10.0), rho_fixed_m010)
        f1 = (m0["p_home"] - m0["p_away"]) - tdiff_52
        f2 = m0["p_draw"] - tdraw_52
        tu = np.clip(np.exp(v2), 0.25, 8.0)
        su = np.clip(1.0 / (1.0 + np.exp(-(u2 + h_st))), 0.04, 0.96)
        mu = summarize_dc_markets_batch(np.clip(tu * su, 0.05, 10.0), np.clip(tu * (1.0 - su), 0.05, 10.0), rho_fixed_m010)
        tv = np.clip(np.exp(v2 + h_st), 0.25, 8.0)
        sv = s_c
        mv = summarize_dc_markets_batch(np.clip(tv * sv, 0.05, 10.0), np.clip(tv * (1.0 - sv), 0.05, 10.0), rho_fixed_m010)
        j11 = ((mu["p_home"] - mu["p_away"] - tdiff_52) - f1) / h_st
        j21 = ((mu["p_draw"] - tdraw_52) - f2) / h_st
        j12 = ((mv["p_home"] - mv["p_away"] - tdiff_52) - f1) / h_st
        j22 = ((mv["p_draw"] - tdraw_52) - f2) / h_st
        det = j11 * j22 - j12 * j21
        safe = np.abs(det) > 1e-12
        du = np.where(safe, -(j22 * f1 - j12 * f2) / np.where(safe, det, 1.0), 0.0)
        dv = np.where(safe, -(-j21 * f1 + j11 * f2) / np.where(safe, det, 1.0), 0.0)
        u2 = np.clip(u2 + 0.8 * du, -3.2, 3.2)
        v2 = np.clip(v2 + 0.8 * dv, math.log(0.25), math.log(8.0))
    tot_2p = np.clip(np.exp(v2), 0.25, 8.0)
    sh_2p = np.clip(1.0 / (1.0 + np.exp(-u2)), 0.04, 0.96)
    lh_2p = np.clip(tot_2p * sh_2p, 0.05, 10.0)
    la_2p = np.clip(tot_2p * (1.0 - sh_2p), 0.05, 10.0)
    mkt_v34_2p = summarize_dc_markets_batch(lh_2p, la_2p, rho_fixed_m010)

    # Selección de `alpha_poisson` y `w_total` estrictamente en `VAL <= 2023`
    best_alpha_pois = min(
        T_pois_map.keys(),
        key=lambda a: float(np.mean((tot_oof[val_mask] - T_pois_map[a][val_mask]) ** 2)),
    )
    T_pois_chosen = T_pois_map[best_alpha_pois]

    best_w_tot = 1.0
    best_val_goals_ll = float("inf")
    goals_val_grid: dict[str, float] = {}
    for w_tot in (0.50, 0.70, 0.85, 0.95, 1.00):
        T_blend = w_tot * T_pois_chosen[val_mask] + (1.0 - w_tot) * tot_2p[val_mask]
        lh_g, la_g, rh_g = solve_coherent_dc_3param_batch(
            P_v35_ens[val_mask], T_blend, rho_div_oof[val_mask], rho_shrinkage=0.0
        )
        mk_g = summarize_dc_markets_batch(lh_g, la_g, rh_g)
        P_ov25_g = np.column_stack([mk_g["p_over_2_5"], mk_g["p_under_2_5"]])
        P_btts_g = np.column_stack([mk_g["p_btts_yes"], mk_g["p_btts_no"]])
        ll_25 = float(np.mean(oc.compute_categorical_log_loss_vec(P_ov25_g, y_ov25[val_mask])))
        ll_bt = float(np.mean(oc.compute_categorical_log_loss_vec(P_btts_g, y_btts[val_mask])))
        comb = 0.60 * ll_25 + 0.40 * ll_bt
        goals_val_grid[f"w_total={w_tot:.2f}"] = round(comb, 6)
        if comb < best_val_goals_ll:
            best_val_goals_ll = comb
            best_w_tot = w_tot

    print(f"[VAL <= 2023 Horizon-Goals Selection] alpha={best_alpha_pois} | grid={goals_val_grid} -> w_total={best_w_tot}")

    T_v35_target = best_w_tot * T_pois_chosen + (1.0 - best_w_tot) * tot_2p
    lh_v35, la_v35, rh_v35 = solve_coherent_dc_3param_batch(
        P_v35_ens, T_v35_target, rho_div_oof, rho_shrinkage=0.0
    )
    mkt_v35 = summarize_dc_markets_batch(lh_v35, la_v35, rh_v35)

    # Evaluar `Totals 2.5`, `Totals 1.5`, `Totals 3.5`, `BTTS` y coherencia `1X2`
    P_ov25_v30 = np.column_stack([mkt_v30_dc["p_over_2_5"], mkt_v30_dc["p_under_2_5"]])
    P_ov25_2p = np.column_stack([mkt_v34_2p["p_over_2_5"], mkt_v34_2p["p_under_2_5"]])
    P_ov25_v35 = np.column_stack([mkt_v35["p_over_2_5"], mkt_v35["p_under_2_5"]])

    P_btts_v30 = np.column_stack([mkt_v30_dc["p_btts_yes"], mkt_v30_dc["p_btts_no"]])
    P_btts_2p = np.column_stack([mkt_v34_2p["p_btts_yes"], mkt_v34_2p["p_btts_no"]])
    P_btts_v35 = np.column_stack([mkt_v35["p_btts_yes"], mkt_v35["p_btts_no"]])

    P_1x2_v35_dc = np.column_stack([mkt_v35["p_home"], mkt_v35["p_draw"], mkt_v35["p_away"]])

    ev_tot25_vs_2p = oc.evaluate_calibration_with_bootstrap(
        P_ov25_v35,
        y_ov25,
        benchmark_ll_vec=oc.compute_categorical_log_loss_vec(P_ov25_2p, y_ov25),
        n_resamples=BOOTSTRAP_SAMPLES,
        seed=BOOTSTRAP_SEED,
        include_bins=False,
    )
    ev_tot25_vs_v30 = oc.evaluate_calibration_with_bootstrap(
        P_ov25_v35,
        y_ov25,
        benchmark_ll_vec=oc.compute_categorical_log_loss_vec(P_ov25_v30, y_ov25),
        n_resamples=BOOTSTRAP_SAMPLES,
        seed=BOOTSTRAP_SEED,
        include_bins=False,
    )
    ev_btts_vs_2p = oc.evaluate_calibration_with_bootstrap(
        P_btts_v35,
        y_btts,
        benchmark_ll_vec=oc.compute_categorical_log_loss_vec(P_btts_2p, y_btts),
        n_resamples=BOOTSTRAP_SAMPLES,
        seed=BOOTSTRAP_SEED,
        include_bins=False,
    )
    ev_btts_vs_v30 = oc.evaluate_calibration_with_bootstrap(
        P_btts_v35,
        y_btts,
        benchmark_ll_vec=oc.compute_categorical_log_loss_vec(P_btts_v30, y_btts),
        n_resamples=BOOTSTRAP_SAMPLES,
        seed=BOOTSTRAP_SEED,
        include_bins=False,
    )
    ev_tot15_vs_2p = oc.evaluate_calibration_with_bootstrap(
        np.column_stack([mkt_v35["p_over_1_5"], mkt_v35["p_under_1_5"]]),
        y_ov15,
        benchmark_ll_vec=oc.compute_categorical_log_loss_vec(
            np.column_stack([mkt_v34_2p["p_over_1_5"], mkt_v34_2p["p_under_1_5"]]), y_ov15
        ),
        n_resamples=BOOTSTRAP_SAMPLES,
        seed=BOOTSTRAP_SEED,
        include_bins=False,
    )
    ev_tot35_vs_2p = oc.evaluate_calibration_with_bootstrap(
        np.column_stack([mkt_v35["p_over_3_5"], mkt_v35["p_under_3_5"]]),
        y_ov35,
        benchmark_ll_vec=oc.compute_categorical_log_loss_vec(
            np.column_stack([mkt_v34_2p["p_over_3_5"], mkt_v34_2p["p_under_3_5"]]), y_ov35
        ),
        n_resamples=BOOTSTRAP_SAMPLES,
        seed=BOOTSTRAP_SEED,
        include_bins=False,
    )
    ev_1x2_dc_check = oc.evaluate_calibration_with_bootstrap(
        P_1x2_v35_dc,
        y_oof,
        benchmark_ll_vec=ll_l52_vec,
        n_resamples=BOOTSTRAP_SAMPLES,
        seed=BOOTSTRAP_SEED,
        include_bins=False,
    )

    # Benchmark contra cierre Pinnacle Totals 2.5
    o_ov = pd.to_numeric(oof_meta["totals_close_p_over"], errors="coerce").to_numpy(dtype=np.float64)
    o_un = pd.to_numeric(oof_meta["totals_close_p_under"], errors="coerce").to_numpy(dtype=np.float64)
    pin_ou_mask = np.isfinite(o_ov) & np.isfinite(o_un) & (o_ov > 1.02) & (o_un > 1.02)
    P_pin_ou = _power_devig_2way(o_ov[pin_ou_mask], o_un[pin_ou_mask])
    ll_pin_ou_vec = oc.compute_categorical_log_loss_vec(P_pin_ou, y_ov25[pin_ou_mask])
    ev_v35_vs_pin_ou = oc.evaluate_calibration_with_bootstrap(
        P_ov25_v35[pin_ou_mask],
        y_ov25[pin_ou_mask],
        benchmark_ll_vec=ll_pin_ou_vec,
        n_resamples=BOOTSTRAP_SAMPLES,
        seed=BOOTSTRAP_SEED,
        include_bins=False,
    )
    ev_2p_vs_pin_ou = oc.evaluate_calibration_with_bootstrap(
        P_ov25_2p[pin_ou_mask],
        y_ov25[pin_ou_mask],
        benchmark_ll_vec=ll_pin_ou_vec,
        n_resamples=BOOTSTRAP_SAMPLES,
        seed=BOOTSTRAP_SEED,
        include_bins=False,
    )

    print(
        f"\n=== HORIZON-GOALS v3.5 MULTI-MARKET (n={len(y_oof)}) ===\n"
        f"  Totals 2.5 | v3.4(2-param)={float(np.mean(oc.compute_categorical_log_loss_vec(P_ov25_2p, y_ov25))):.5f} | "
        f"v3.0(DC)={float(np.mean(oc.compute_categorical_log_loss_vec(P_ov25_v30, y_ov25))):.5f} | "
        f"v3.5={ev_tot25_vs_2p['log_loss']:.5f} (ECE={ev_tot25_vs_2p['ece']:.5f})\n"
        f"             | ΔLL vs v3.4(2p)={ev_tot25_vs_2p['delta_ll_vs_benchmark']:+.5f} {ev_tot25_vs_2p['delta_ll_ci95']} ({ev_tot25_vs_2p['significance']})\n"
        f"             | ΔLL vs v3.0(DC)={ev_tot25_vs_v30['delta_ll_vs_benchmark']:+.5f} {ev_tot25_vs_v30['delta_ll_ci95']} ({ev_tot25_vs_v30['significance']})\n"
        f"  BTTS       | v3.4(2-param)={float(np.mean(oc.compute_categorical_log_loss_vec(P_btts_2p, y_btts))):.5f} | "
        f"v3.0(DC)={float(np.mean(oc.compute_categorical_log_loss_vec(P_btts_v30, y_btts))):.5f} | "
        f"v3.5={ev_btts_vs_2p['log_loss']:.5f} (ECE={ev_btts_vs_2p['ece']:.5f})\n"
        f"             | ΔLL vs v3.4(2p)={ev_btts_vs_2p['delta_ll_vs_benchmark']:+.5f} {ev_btts_vs_2p['delta_ll_ci95']} ({ev_btts_vs_2p['significance']})\n"
        f"             | ΔLL vs v3.0(DC)={ev_btts_vs_v30['delta_ll_vs_benchmark']:+.5f} {ev_btts_vs_v30['delta_ll_ci95']} ({ev_btts_vs_v30['significance']})\n"
        f"  Totals 1.5 | v3.5 LL={ev_tot15_vs_2p['log_loss']:.5f} | ΔLL vs v3.4(2p)={ev_tot15_vs_2p['delta_ll_vs_benchmark']:+.5f} ({ev_tot15_vs_2p['significance']})\n"
        f"  Totals 3.5 | v3.5 LL={ev_tot35_vs_2p['log_loss']:.5f} | ΔLL vs v3.4(2p)={ev_tot35_vs_2p['delta_ll_vs_benchmark']:+.5f} ({ev_tot35_vs_2p['significance']})\n"
        f"  1X2 Coherent Matrix Check | LL={ev_1x2_dc_check['log_loss']:.5f} (max |P_dc - P_ens| = {float(np.max(np.abs(P_1x2_v35_dc - P_v35_ens))):.2e})\n"
        f"  [Pinnacle Totals 2.5 n={int(np.sum(pin_ou_mask))}] Pin LL={float(np.mean(ll_pin_ou_vec)):.5f} | "
        f"v3.4(2p) gap={ev_2p_vs_pin_ou['delta_ll_vs_benchmark']:+.5f} -> v3.5 gap={ev_v35_vs_pin_ou['delta_ll_vs_benchmark']:+.5f}"
    )

    # -----------------------------------------------------------------------
    # PARTE 3: Entrenar y exportar artefactos finales `< 2025-02-02` (`sstart >= 2014`)
    # -----------------------------------------------------------------------
    tr_final = df[df["sstart"] >= 2014].copy().reset_index(drop=True)
    div_tr = tr_final["div"].astype(str).to_numpy()
    dum_tr = np.column_stack([(div_tr == lvl).astype(np.float64) for lvl in div_levels])
    y_f = tr_final["y"].to_numpy(dtype=np.int64)
    sw_f = 0.5 ** ((tr_final["match_date"].max() - tr_final["match_date"]).dt.days.to_numpy(dtype=np.float64) / 1460.0)

    X_f_1x2 = np.hstack([tr_final[list(chosen_1x2_cols)].to_numpy(dtype=np.float64), dum_tr])
    _, imp_f, sc_f, lr_f = _fit_and_predict_logit(X_f_1x2, y_f, sw_f, X_f_1x2[:4], c_reg=chosen_c)

    hgb_f = HistGradientBoostingClassifier(**hgb_params)
    hgb_f.fit(X_f_1x2, y_f, sample_weight=sw_f)

    logit_comp_payload = eg.build_logit_companion_payload(
        imp_f, sc_f, lr_f, n_features_base=len(chosen_1x2_cols), regularization_c=chosen_c
    )
    gbm_art = eg.serialize_hist_gbm_to_artifact(
        hgb_f,
        base_feature_names=list(chosen_1x2_cols),
        div_levels=div_levels,
        temperature=best_temp,
        blend_space=best_blend_space,
        w_logit=best_w_logit,
        w_gbm=best_w_gbm,
        production_activated=False,
        activation_verdict={
            "activated": False,
            "status": "candidate",
            "significance": res_v35_ens_vs_v34_live["significance"],
            "criterion": "Candidato v3.5 Live-Ensemble validado en walk_forward_dev < 2025-02-02 (100% cobertura viva)",
            "reason": (
                f"LL={res_v35_ens_vs_v34_live['log_loss']:.5f}, "
                f"delta_ll_vs_v34_live={res_v35_ens_vs_v34_live['delta_ll_vs_benchmark']:+.5f} "
                f"({res_v35_ens_vs_v34_live['significance']}); gobernado como candidate sin tocar motor congelado."
            ),
        },
        logit_companion=logit_comp_payload,
        training_window={
            "min_season": "2014",
            "max_date_exclusive": HOLDOUT_CUT_ISO,
            "n_matches": int(len(tr_final)),
            "holdout_sealed_untouched": True,
        },
        calibrated_on_window={
            "val_seasons": "2016..2023",
            "n_val": int(np.sum(val_mask)),
        },
        codename="PitchLab Tachyon v3.5 Live-Ensemble",
        version="3.5.0-candidate",
        seed=MODEL_SEED,
    )
    GBM_V35_JSON_OUT.write_text(json.dumps(gbm_art, separators=(",", ":")), encoding="utf-8")

    # Exportar también `ModelArtifact` puro del compañero Logit v3.5
    logit_model_art = {
        "schema_version": "1.0",
        "type": "logistic_regression_multinomial",
        "codename": "PitchLab Tachyon v3.5 Live-Logit Companion",
        "version": "3.5.0-candidate",
        "status": "candidate",
        "production_activated": False,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "seed": MODEL_SEED,
        "regularization_C": chosen_c,
        "half_life_days": 1460.0,
        "classes": [0, 1, 2],
        "n_classes": 3,
        "features": list(chosen_1x2_cols) + [f"div_{lvl}" for lvl in div_levels],
        "n_features_base": len(chosen_1x2_cols),
        "div_levels": div_levels,
        "imputer_statistics": logit_comp_payload["imputer_statistics"],
        "scaler_mean": logit_comp_payload["scaler_mean"],
        "scaler_scale": logit_comp_payload["scaler_scale"],
        "coef": logit_comp_payload["coef"],
        "intercept": logit_comp_payload["intercept"],
        "training_window": {
            "min_season": "2014",
            "max_date_exclusive": HOLDOUT_CUT_ISO,
            "n_matches": int(len(tr_final)),
            "holdout_sealed_untouched": True,
        },
    }
    LOGIT_V35_JSON_OUT.write_text(json.dumps(logit_model_art, indent=2), encoding="utf-8")

    # Entrenar y exportar `Horizon-Goals v3.5` (`model_club_goals_v3_5_candidate.json`)
    Xg_f = np.hstack([tr_final[list(HORIZON_GOALS_13_BASE_COLS)].to_numpy(dtype=np.float64), dum_tr])
    imp_gf = SimpleImputer(strategy="median").fit(Xg_f)
    Xg_fi = imp_gf.transform(Xg_f)
    sc_gf = StandardScaler().fit(Xg_fi)
    sc_gf.scale_ = np.where(sc_gf.scale_ == 0.0, 1.0, sc_gf.scale_)
    Zg_f = sc_gf.transform(Xg_fi)
    hg_f = pd.to_numeric(tr_final[hg_col], errors="coerce").to_numpy(dtype=np.float64)
    ag_f = pd.to_numeric(tr_final[ag_col], errors="coerce").to_numpy(dtype=np.float64)
    pr_f = PoissonRegressor(alpha=best_alpha_pois, max_iter=1000)
    pr_f.fit(Zg_f, np.clip(hg_f + ag_f, 0.0, 14.0), sample_weight=sw_f)

    lh_f_dc = pd.to_numeric(tr_final["dc_lam_home"], errors="coerce").to_numpy(dtype=np.float64)
    la_f_dc = pd.to_numeric(tr_final["dc_lam_away"], errors="coerce").to_numpy(dtype=np.float64)
    final_div_rho_map = _estimate_causal_div_rho(hg_f, ag_f, lh_f_dc, la_f_dc, div_tr, div_levels)

    goals_art = {
        "schema_version": "horizon_goals_v3.5.0",
        "type": "poisson_log_link_3param_dc",
        "codename": "PitchLab Horizon-Goals v3.5 (Clubs)",
        "version": "3.5.0-candidate",
        "status": "candidate",
        "production_activated": False,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "seed": MODEL_SEED,
        "alpha": float(best_alpha_pois),
        "w_total_poisson": float(best_w_tot),
        "rho_shrinkage": 0.0,
        "default_rho": -0.105,
        "min_total_goals": 0.45,
        "max_total_goals": 7.50,
        "max_goals_grid": DEFAULT_MAX_GOALS,
        "features": list(HORIZON_GOALS_13_BASE_COLS) + [f"div_{lvl}" for lvl in div_levels],
        "n_features_base": len(HORIZON_GOALS_13_BASE_COLS),
        "base_features": list(HORIZON_GOALS_13_BASE_COLS),
        "div_levels": div_levels,
        "div_rho_map": final_div_rho_map,
        "imputer_statistics": [float(v) for v in imp_gf.statistics_.tolist()],
        "scaler_mean": [float(v) for v in sc_gf.mean_.tolist()],
        "scaler_scale": [float(v) for v in sc_gf.scale_.tolist()],
        "coef": [float(v) for v in pr_f.coef_.tolist()],
        "intercept": float(pr_f.intercept_),
        "training_window": {
            "min_season": "2014",
            "max_date_exclusive": HOLDOUT_CUT_ISO,
            "n_matches": int(len(tr_final)),
            "holdout_sealed_untouched": True,
        },
    }
    GOALS_V35_JSON_OUT.write_text(json.dumps(goals_art, indent=2), encoding="utf-8")

    # Exportar estado vivo `club_free_open_state_v3_5.json`
    state_v35 = _export_live_club_state_v3_5(sb_cal)

    # Exportar snapshot de paridad TS <-> Python (`200` filas `< 2025-02-02`)
    rng = np.random.default_rng(MODEL_SEED)
    pool_sn = tr_final[tr_final["sstart"] >= 2023].copy().reset_index(drop=True)
    ch_idx = np.sort(rng.choice(len(pool_sn), size=min(200, len(pool_sn)), replace=False))
    sn_df = pool_sn.iloc[ch_idx].copy().reset_index(drop=True)
    dum_sn = np.column_stack([(sn_df["div"].astype(str).to_numpy() == lvl).astype(np.float64) for lvl in div_levels])

    X_sn_1x2 = np.hstack([sn_df[list(chosen_1x2_cols)].to_numpy(dtype=np.float64), dum_sn])
    # Verificar paridad interna `hgb_f.predict_proba` vs `predict_serialized_gbm_python`
    p_gbm_skl = hgb_f.predict_proba(X_sn_1x2)
    p_gbm_ser_raw = eg.predict_serialized_gbm_python(X_sn_1x2, gbm_art, calibrated=False)
    max_ser_diff = float(np.max(np.abs(p_gbm_skl - p_gbm_ser_raw)))
    if max_ser_diff > 1e-12:
        raise RuntimeError(f"Desviación en serialización GBM: {max_ser_diff:.3e}")

    p_gbm_ser_cal = _apply_temperature_3way_exact(p_gbm_ser_raw, best_temp)

    X_sn_imp = np.array(X_sn_1x2, copy=True)
    bad_sn = ~np.isfinite(X_sn_imp)
    if bool(bad_sn.any()):
        ri, ci = np.where(bad_sn)
        X_sn_imp[ri, ci] = imp_f.statistics_[ci]
    Z_sn = (X_sn_imp - sc_f.mean_) / sc_f.scale_
    lg_sn = Z_sn @ lr_f.coef_.T + lr_f.intercept_
    ex_sn = np.exp(lg_sn - np.max(lg_sn, axis=1, keepdims=True))
    p_logit_sn = ex_sn / np.sum(ex_sn, axis=1, keepdims=True)
    p_ens_sn = _blend_3way_exact(p_logit_sn, p_gbm_ser_cal, best_w_logit, best_w_gbm, best_blend_space)

    Xg_sn = np.hstack([sn_df[list(HORIZON_GOALS_13_BASE_COLS)].to_numpy(dtype=np.float64), dum_sn])
    t_pois_sn = predict_poisson_log_link_exact(Xg_sn, goals_art)

    snap_rows: list[dict[str, Any]] = []
    X_sn_base = sn_df[list(chosen_1x2_cols)].to_numpy(dtype=np.float64)
    Xg_sn_base = sn_df[list(HORIZON_GOALS_13_BASE_COLS)].to_numpy(dtype=np.float64)

    for idx_r in range(len(sn_df)):
        dv_r = str(sn_df.iloc[idx_r]["div"])
        rho_p = float(final_div_rho_map.get(dv_r, -0.105))
        ph_r, pd_r, pa_r = float(p_ens_sn[idx_r, 0]), float(p_ens_sn[idx_r, 1]), float(p_ens_sn[idx_r, 2])
        lh_2r, la_2r = solve_dc_2param_from_1x2(ph_r, pd_r, pa_r, rho=-0.10, max_goals=DEFAULT_MAX_GOALS)
        t_eff_r = float(best_w_tot) * float(t_pois_sn[idx_r]) + (1.0 - float(best_w_tot)) * (lh_2r + la_2r)
        lh_3r, la_3r, rh_3r = solve_coherent_dc_3param(
            ph_r, pd_r, pa_r, t_eff_r, rho_p, rho_shrinkage=0.0, max_goals=DEFAULT_MAX_GOALS
        )
        mk_3r = summarize_dc_markets_from_matrix(
            build_dc_score_matrix_exact(lh_3r, la_3r, rh_3r, max_goals=DEFAULT_MAX_GOALS)
        )
        snap_rows.append(
            {
                "match_id": str(sn_df.iloc[idx_r]["match_id"]),
                "div": dv_r,
                "features": [None if not math.isfinite(float(v)) else float(v) for v in X_sn_base[idx_r]],
                "goals_features": [None if not math.isfinite(float(v)) else float(v) for v in Xg_sn_base[idx_r]],
                "div_onehot": [int(v) for v in dum_sn[idx_r].tolist()],
                "python_logit_probs": [float(p_logit_sn[idx_r, 0]), float(p_logit_sn[idx_r, 1]), float(p_logit_sn[idx_r, 2])],
                "python_gbm_cal_probs": [float(p_gbm_ser_cal[idx_r, 0]), float(p_gbm_ser_cal[idx_r, 1]), float(p_gbm_ser_cal[idx_r, 2])],
                "python_ensemble_probs": [ph_r, pd_r, pa_r],
                "python_t_poisson": float(t_pois_sn[idx_r]),
                "python_dc_3param": {
                    "lam_home": lh_3r,
                    "lam_away": la_3r,
                    "rho_eff": rh_3r,
                    "p_over_2_5": mk_3r["p_over_2_5"],
                    "p_btts_yes": mk_3r["p_btts_yes"],
                    "p_home_dc": mk_3r["p_home"],
                    "p_draw_dc": mk_3r["p_draw"],
                    "p_away_dc": mk_3r["p_away"],
                },
            }
        )

    SNAP_V35_JSON_OUT.write_text(
        json.dumps(
            {
                "schema_version": "club_v3.5_parity_snapshot",
                "codename": "PitchLab Tachyon v3.5 Live-Ensemble + Horizon-Goals v3.5",
                "holdout_sealed_untouched": True,
                "max_match_date": str(sn_df["match_date"].max())[:10],
                "n": len(snap_rows),
                "rows": snap_rows,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    summary = {
        "experiment_id": "EXP_V37_club_v3_5_engines",
        "eval_split": "walk_forward_dev",
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "n_walk_forward_dev": int(len(y_oof)),
        "n_val_le_2023": int(np.sum(val_mask)),
        "n_oos_2024": int(np.sum(oos24_mask)),
        "selected_1x2_config": {
            "n_features_base": len(chosen_1x2_cols),
            "used_v35_extra_6": bool(use_58_cols),
            "regularization_C": float(chosen_c),
            "hgb_temperature": float(best_temp),
            "blend_space": best_blend_space,
            "w_logit": float(best_w_logit),
            "w_gbm": float(best_w_gbm),
            "val_grid_ll": ens_grid_log,
        },
        "selected_horizon_goals_config": {
            "n_features_base": len(HORIZON_GOALS_13_BASE_COLS),
            "poisson_alpha": float(best_alpha_pois),
            "w_total_poisson": float(best_w_tot),
            "val_grid_combined_ll": goals_val_grid,
        },
        "metrics_1x2": {
            "v3_4_live_complete_52": res_l52,
            "v3_5_live_logit": res_l_chosen,
            "v3_5_live_hgb_calibrated": res_hgb_cal,
            "v3_5_live_ensemble_vs_v3_4_live": res_v35_ens_vs_v34_live,
            "v3_5_live_ensemble_oos_2024_vs_v3_4_live": res_v35_ens_oos24,
            "v3_5_coherent_dc_matrix_1x2_check": ev_1x2_dc_check,
        },
        "metrics_horizon_goals": {
            "totals_2_5_vs_v3_4_2param": ev_tot25_vs_2p,
            "totals_2_5_vs_v3_0_raw_dc": ev_tot25_vs_v30,
            "btts_vs_v3_4_2param": ev_btts_vs_2p,
            "btts_vs_v3_0_raw_dc": ev_btts_vs_v30,
            "totals_1_5_vs_v3_4_2param": ev_tot15_vs_2p,
            "totals_3_5_vs_v3_4_2param": ev_tot35_vs_2p,
            "pinnacle_totals_2_5_subset": {
                "n": int(np.sum(pin_ou_mask)),
                "pinnacle_ll": float(np.mean(ll_pin_ou_vec)),
                "v3_4_2param_vs_pinnacle": ev_2p_vs_pin_ou,
                "v3_5_horizon_vs_pinnacle": ev_v35_vs_pin_ou,
            },
        },
        "artifacts": {
            "gbm_club_v3_5_live_sha256": hashlib.sha256(GBM_V35_JSON_OUT.read_bytes()).hexdigest(),
            "model_club_v3_5_live_sha256": hashlib.sha256(LOGIT_V35_JSON_OUT.read_bytes()).hexdigest(),
            "model_club_goals_v3_5_sha256": hashlib.sha256(GOALS_V35_JSON_OUT.read_bytes()).hexdigest(),
            "club_free_open_state_v3_5_sha256": hashlib.sha256(STATE_V35_JSON_OUT.read_bytes()).hexdigest(),
            "n_active_clubs_v3_5": state_v35["n_active_clubs"],
            "max_gbm_serialization_diff": max_ser_diff,
        },
    }
    RESULTS_V35_JSON_OUT.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    with TRIAL_REGISTRY_V35_OUT.open("a", encoding="utf-8") as fh:
        fh.write(
            json.dumps(
                {
                    "recorded_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "experiment_id": "EXP_V37_club_v3_5_engines",
                    "eval_split": "walk_forward_dev",
                    "holdout_touched": False,
                    "ll_1x2_v35_ens": round(res_v35_ens_vs_v34_live["log_loss"], 6),
                    "delta_ll_1x2_vs_v34_live": round(res_v35_ens_vs_v34_live["delta_ll_vs_benchmark"], 6),
                    "ll_totals_2_5_v35": round(ev_tot25_vs_2p["log_loss"], 6),
                    "delta_ll_totals_2_5_vs_2param": round(ev_tot25_vs_2p["delta_ll_vs_benchmark"], 6),
                    "ll_btts_v35": round(ev_btts_vs_2p["log_loss"], 6),
                    "delta_ll_btts_vs_2param": round(ev_btts_vs_2p["delta_ll_vs_benchmark"], 6),
                }
            )
            + "\n"
        )
    print(f"\n[DONE] EXP_V37 guardado en {RESULTS_V35_JSON_OUT.name}")


if __name__ == "__main__":
    main()
