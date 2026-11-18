"""EXP_V43 — Fútbol Core `PitchLab Tachyon v4.0` + Matriz Bivariada Diagonal-Inflada de 4 Parámetros.

Integra causalmente (`t' < t`, `match_date < 2025-02-02`, `holdout_sealed` 100% intacto) los
cuatro activos tácticos/físicos locales que `EXP_V37 (v3.5)` no consumía:
  1. `ws_soccer_match_xg_2018_2026.parquet`: `real_home_xg`, `real_away_xg` exactos partido a partido
     en `MEX` (Liga MX `FBref`) y las `5` grandes ligas europeas (`E0, SP1, I1, D1, F1`), más residual
     de sobre-ejecución finalizadora `(goals - real_xg)_ewm` (regresión a la media).
  2. `ws_understat_team_match_tactical.parquet`: `npxg`, `ppda_avg` (intensidad de presión alta) y
     `deep_completions` (entradas al área rival).
  3. `ws_stadium_physics.parquet`: altitud exacta y choque hipóxico `max(0, elev_H - elev_A) / 1000`
     (clave en Liga MX: Toluca `2,678 m`, CDMX `2,245 m`, Pachuca `2,426 m` vs nivel del mar).
  4. `tm_player_valuations.csv.gz` + `tm_appearances.csv.gz`: disponibilidad económica real del XI
     titular reciente (`realized_xi_eur_share` fechado estrictamente `< match_date`).
  5. Solver ortogonal de 4 parámetros (`diagonal_score_solver.py` / `diagonal_score_matrix.ts`) con
     marginales Binomial Negativa (`r_disp`) y reponderación diagonal exacta (`0.0` error de cono en `1X2`).
"""

from __future__ import annotations

import os

os.environ.setdefault("OMP_NUM_THREADS", "4")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")

from bisect import bisect_left, bisect_right
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
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression, PoissonRegressor
from sklearn.preprocessing import StandardScaler

EXP_DIR = Path(__file__).resolve().parent
REPO_ROOT = EXP_DIR.parents[3]
PRED_LAB_ROOT = REPO_ROOT / "research" / "prediction-lab"
EXP_V34_DIR = PRED_LAB_ROOT / "experiments" / "EXP_V34_club_free_data"
EXP_V37_DIR = PRED_LAB_ROOT / "experiments" / "EXP_V37_club_v3_5_engines"
ARTIFACTS_DIR = EXP_DIR / "artifacts"

for _p in (str(REPO_ROOT), str(PRED_LAB_ROOT / "models" / "a"), str(EXP_V34_DIR), str(EXP_V37_DIR), str(EXP_DIR)):
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
from diagonal_score_solver import (  # noqa: E402
    DEFAULT_V4_MAX_GOALS,
    solve_diagonal_inflated_batch_fast,
    solve_diagonal_inflated_score_matrix_4param,
    summarize_markets_from_matrix_v4,
)
from horizon_dc_solver import (  # noqa: E402
    solve_coherent_dc_3param_batch,
    solve_dc_2param_from_1x2,
    summarize_dc_markets_batch,
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

FLAGSHIP_6_DIVS: tuple[str, ...] = ("E0", "SP1", "I1", "D1", "F1", "MEX")

V40_EXTRA_10_1X2_COLS: tuple[str, ...] = (
    "real_xg_net_diff_ewm10",
    "real_xg_overperf_luck_diff",
    "understat_npxg_net_diff",
    "understat_deep_comp_diff",
    "understat_ppda_press_diff",
    "altitude_hypoxia_adv_km",
    "altitude_abs_diff_km",
    "realized_xi_eur_share_diff",
    "sb_att_def_diff_ewm10",
    "club_tempo_sum_ewm12",
)

V40_GOALS_19_BASE_COLS: tuple[str, ...] = HORIZON_GOALS_13_BASE_COLS + (
    "real_xg_total_sum_ewm10",
    "real_xg_has_cov",
    "understat_deep_sum_ewm10",
    "understat_ppda_intensity_sum",
    "altitude_venue_km",
    "realized_xi_eur_share_sum",
)

GBM_V40_OUT = REPO_ROOT / "src" / "data" / "prediction" / "gbm_club_v4_0_candidate.json"
GOALS_V40_OUT = REPO_ROOT / "src" / "data" / "prediction" / "model_club_goals_v4_0_candidate.json"
STATE_V40_OUT = REPO_ROOT / "src" / "data" / "prediction" / "club_state_v4_0.json"
SNAP_V40_OUT = REPO_ROOT / "src" / "data" / "prediction" / "soccer_v4_0_core_snapshot.json"
RESULTS_OUT = ARTIFACTS_DIR / "exp_v43_soccer_v4_0_results.json"
TRIAL_REGISTRY_OUT = EXP_DIR / "trial_registry_soccer_v40.jsonl"


def _build_dated_xi_valuation_share() -> dict[int, tuple[list[str], list[float]]]:
    """Calcula causalmente (`date < match_date < 2025-02-02`) el historial `(dates, shares)` del XI real vs techo del club."""
    free_dir = PRED_LAB_ROOT / "data" / "raw" / "free_open_v33"
    val_p = free_dir / "tm_player_valuations.csv.gz"
    app_p = free_dir / "tm_appearances.csv.gz"
    if not val_p.exists() or not app_p.exists():
        return {}

    vdf = pd.read_csv(
        val_p,
        usecols=["player_id", "date", "market_value_in_eur", "current_club_id"],
    )
    vdf["date_str"] = vdf["date"].astype(str).str.slice(0, 10)
    vdf = vdf[(vdf["date_str"] >= "2013-01-01") & (vdf["date_str"] < HOLDOUT_CUT_DATE)].copy()
    vdf["eur_m"] = pd.to_numeric(vdf["market_value_in_eur"], errors="coerce").fillna(0.0) / 1e6
    vdf = vdf.sort_values(["player_id", "date_str"], kind="mergesort")

    p_dates: dict[int, list[str]] = defaultdict(list)
    p_vals: dict[int, list[float]] = defaultdict(list)
    for r in vdf.itertuples(index=False):
        pid = int(r.player_id)
        p_dates[pid].append(str(r.date_str))
        p_vals[pid].append(float(r.eur_m))

    adf = pd.read_csv(
        app_p,
        usecols=["game_id", "player_id", "player_club_id", "date", "minutes_played", "competition_id"],
    )
    adf["date_str"] = adf["date"].astype(str).str.slice(0, 10)
    adf = adf[
        (adf["date_str"] >= "2014-07-01")
        & (adf["date_str"] < HOLDOUT_CUT_DATE)
        & (pd.to_numeric(adf["minutes_played"], errors="coerce").fillna(0.0) >= 45.0)
    ].copy()
    adf["player_club_id"] = pd.to_numeric(adf["player_club_id"], errors="coerce").fillna(-1).astype(int)
    adf = adf[adf["player_club_id"] > 0]

    def _val_asof(pid: int, d_str: str) -> float:
        ds = p_dates.get(pid)
        if not ds:
            return 0.5
        idx = bisect_right(ds, d_str) - 1
        if idx < 0:
            return 0.5
        return max(0.1, p_vals[pid][idx])

    adf["p_val"] = [_val_asof(int(pid), str(ds)) for pid, ds in zip(adf["player_id"], adf["date_str"])]
    grp = (
        adf.groupby(["player_club_id", "date_str", "game_id"], as_index=False)["p_val"]
        .sum()
        .sort_values(["date_str", "game_id"], kind="mergesort")
    )

    club_xi_ewm: dict[int, float] = {}
    club_peak_ewm: dict[int, float] = {}
    out_tl: dict[int, tuple[list[str], list[float]]] = defaultdict(lambda: ([], []))
    alpha_xi = 2.0 / 7.0
    for r in grp.itertuples(index=False):
        cid = int(r.player_club_id)
        d_s = str(r.date_str)
        v_xi = float(r.p_val)
        cur_ewm = alpha_xi * v_xi + (1.0 - alpha_xi) * club_xi_ewm.get(cid, v_xi)
        cur_pk = max(v_xi, 0.985 * club_peak_ewm.get(cid, max(v_xi, 1.0)))
        club_xi_ewm[cid] = cur_ewm
        club_peak_ewm[cid] = cur_pk
        post_share = min(max(cur_ewm / max(cur_pk, 1.0), 0.45), 1.15)
        out_tl[cid][0].append(d_s)
        out_tl[cid][1].append(post_share)
    return dict(out_tl)


def _attach_v40_tactical_xg_altitude_features(
    df: pd.DataFrame,
) -> tuple[pd.DataFrame, dict[str, dict[str, float]]]:
    """Construye de forma estrictamente causal (`t' < t`) las features tácticas `xG`, `Understat` y altitud."""
    ws_dir = PRED_LAB_ROOT / "data" / "processed" / "web_scraping"
    xg_p = ws_dir / "ws_soccer_match_xg_2018_2026.parquet"
    us_p = ws_dir / "ws_understat_team_match_tactical.parquet"
    st_p = ws_dir / "ws_stadium_physics.parquet"

    xg_map: dict[str, tuple[float, float]] = {}
    if xg_p.exists():
        xdf = pd.read_parquet(xg_p)
        xdf["md_s"] = xdf["match_date"].astype(str).str.slice(0, 10)
        xdf = xdf[xdf["md_s"] < HOLDOUT_CUT_DATE]
        for r in xdf.itertuples(index=False):
            if pd.notna(r.real_home_xg) and pd.notna(r.real_away_xg):
                xg_map[str(r.match_id)] = (float(r.real_home_xg), float(r.real_away_xg))

    us_map: dict[tuple[str, int], tuple[float, float, float, float]] = {}
    if us_p.exists():
        udf = pd.read_parquet(us_p)
        udf["md_s"] = udf["match_date"].astype(str).str.slice(0, 10)
        udf = udf[udf["md_s"] < HOLDOUT_CUT_DATE]
        for r in udf.itertuples(index=False):
            ih = 1 if bool(r.is_home) else 0
            npxg = float(r.npxg) if pd.notna(r.npxg) else np.nan
            npxga = float(r.npxga) if pd.notna(r.npxga) else np.nan
            ppda = float(r.ppda_avg) if pd.notna(r.ppda_avg) else np.nan
            deep = float(r.deep_completions) if pd.notna(r.deep_completions) else np.nan
            us_map[(str(r.match_id), ih)] = (npxg, npxga, ppda, deep)

    elev_by_team: dict[tuple[str, str], float] = {}
    if st_p.exists():
        sdf = pd.read_parquet(st_p)
        for r in sdf.itertuples(index=False):
            dv = str(r.div or "").strip()
            tm = str(r.primary_pl_team or "").strip()
            el = float(r.stadium_elevation_m) if pd.notna(r.stadium_elevation_m) else 100.0
            if dv and tm:
                elev_by_team[(dv, tm)] = el

    n = len(df)
    rxg_net_diff = np.zeros(n, dtype=np.float64)
    rxg_luck_diff = np.zeros(n, dtype=np.float64)
    rxg_tot_sum = np.zeros(n, dtype=np.float64)
    rxg_has = np.zeros(n, dtype=np.float64)
    us_npxg_diff = np.zeros(n, dtype=np.float64)
    us_deep_diff = np.zeros(n, dtype=np.float64)
    us_ppda_diff = np.zeros(n, dtype=np.float64)
    us_deep_sum = np.zeros(n, dtype=np.float64)
    us_ppda_sum = np.zeros(n, dtype=np.float64)
    alt_hypoxia_km = np.zeros(n, dtype=np.float64)
    alt_abs_km = np.zeros(n, dtype=np.float64)
    alt_venue_km = np.zeros(n, dtype=np.float64)

    # Estado móvil `t' < t` por club
    alpha_10 = 2.0 / 11.0
    st_xgf: dict[str, float] = {}
    st_xga: dict[str, float] = {}
    st_luck: dict[str, float] = {}
    st_n_xg: dict[str, int] = defaultdict(int)
    st_npxgd: dict[str, float] = {}
    st_deep: dict[str, float] = {}
    st_ppda: dict[str, float] = {}

    ht_col = "home_team" if "home_team" in df.columns else "home_team_m"
    at_col = "away_team" if "away_team" in df.columns else "away_team_m"
    hg_col = "home_goals" if "home_goals" in df.columns else "home_goals_m"
    ag_col = "away_goals" if "away_goals" in df.columns else "away_goals_m"

    mids = df["match_id"].astype(str).tolist()
    divs = df["div"].astype(str).tolist()
    hts = df[ht_col].astype(str).tolist()
    ats = df[at_col].astype(str).tolist()
    hgs = pd.to_numeric(df[hg_col], errors="coerce").to_numpy(dtype=np.float64)
    ags = pd.to_numeric(df[ag_col], errors="coerce").to_numpy(dtype=np.float64)

    for i in range(n):
        dv = divs[i]
        hm = hts[i]
        aw = ats[i]
        hk = f"{dv}::{hm}"
        ak = f"{dv}::{aw}"
        mid = mids[i]

        el_h = elev_by_team.get((dv, hm), 120.0)
        el_a = elev_by_team.get((dv, aw), 120.0)
        alt_venue_km[i] = el_h / 1000.0
        alt_abs_km[i] = abs(el_h - el_a) / 1000.0
        # Hipoxia fisiológica cuando visitante sube >= 800m hacia sede alta (> 1,400m)
        alt_hypoxia_km[i] = (max(0.0, el_h - el_a) / 1000.0) if el_h >= 1400.0 else 0.0

        nh_x = st_n_xg[hk]
        na_x = st_n_xg[ak]
        has_c = 1.0 if (nh_x >= 3 and na_x >= 3) else 0.0
        rxg_has[i] = has_c

        xf_h = st_xgf.get(hk, 1.35)
        xa_h = st_xga.get(hk, 1.30)
        xf_a = st_xgf.get(ak, 1.30)
        xa_a = st_xga.get(ak, 1.35)
        rxg_net_diff[i] = has_c * ((xf_h - xa_h) - (xf_a - xa_a))
        rxg_luck_diff[i] = has_c * (st_luck.get(hk, 0.0) - st_luck.get(ak, 0.0))
        rxg_tot_sum[i] = 0.5 * (xf_h + xa_a + xf_a + xa_h)

        us_npxg_diff[i] = st_npxgd.get(hk, 0.0) - st_npxgd.get(ak, 0.0)
        dh_u = st_deep.get(hk, 5.5)
        da_u = st_deep.get(ak, 5.5)
        ph_u = st_ppda.get(hk, 11.2)
        pa_u = st_ppda.get(ak, 11.2)
        us_deep_diff[i] = (dh_u - da_u) / 5.0
        # Menor PPDA = presión más intensa -> ventaja de presión = pa_u - ph_u
        us_ppda_diff[i] = (pa_u - ph_u) / 5.0
        us_deep_sum[i] = (dh_u + da_u) / 10.0
        us_ppda_sum[i] = (24.0 - min(22.0, 0.5 * (ph_u + pa_u))) / 10.0

        # Actualización estrictamente POST-partido (`t' < t`)
        if mid in xg_map and math.isfinite(hgs[i]) and math.isfinite(ags[i]):
            xh_obs, xa_obs = xg_map[mid]
            st_xgf[hk] = alpha_10 * xh_obs + (1.0 - alpha_10) * xf_h
            st_xga[hk] = alpha_10 * xa_obs + (1.0 - alpha_10) * xa_h
            st_xgf[ak] = alpha_10 * xa_obs + (1.0 - alpha_10) * xf_a
            st_xga[ak] = alpha_10 * xh_obs + (1.0 - alpha_10) * xa_a
            st_luck[hk] = alpha_10 * (hgs[i] - xh_obs) + (1.0 - alpha_10) * st_luck.get(hk, 0.0)
            st_luck[ak] = alpha_10 * (ags[i] - xa_obs) + (1.0 - alpha_10) * st_luck.get(ak, 0.0)
            st_n_xg[hk] += 1
            st_n_xg[ak] += 1

        if (mid, 1) in us_map:
            npxg_h, npxga_h, ppda_h, deep_h = us_map[(mid, 1)]
            if math.isfinite(npxg_h) and math.isfinite(npxga_h):
                st_npxgd[hk] = alpha_10 * (npxg_h - npxga_h) + (1.0 - alpha_10) * st_npxgd.get(hk, 0.0)
            if math.isfinite(deep_h):
                st_deep[hk] = alpha_10 * deep_h + (1.0 - alpha_10) * dh_u
            if math.isfinite(ppda_h):
                st_ppda[hk] = alpha_10 * min(max(ppda_h, 3.5), 28.0) + (1.0 - alpha_10) * ph_u

        if (mid, 0) in us_map:
            npxg_a, npxga_a, ppda_a, deep_a = us_map[(mid, 0)]
            if math.isfinite(npxg_a) and math.isfinite(npxga_a):
                st_npxgd[ak] = alpha_10 * (npxg_a - npxga_a) + (1.0 - alpha_10) * st_npxgd.get(ak, 0.0)
            if math.isfinite(deep_a):
                st_deep[ak] = alpha_10 * deep_a + (1.0 - alpha_10) * da_u
            if math.isfinite(ppda_a):
                st_ppda[ak] = alpha_10 * min(max(ppda_a, 3.5), 28.0) + (1.0 - alpha_10) * pa_u

    out = df.copy()
    out["real_xg_net_diff_ewm10"] = rxg_net_diff
    out["real_xg_overperf_luck_diff"] = rxg_luck_diff
    out["real_xg_total_sum_ewm10"] = rxg_tot_sum
    out["real_xg_has_cov"] = rxg_has
    out["understat_npxg_net_diff"] = us_npxg_diff
    out["understat_deep_comp_diff"] = us_deep_diff
    out["understat_ppda_press_diff"] = us_ppda_diff
    out["understat_deep_sum_ewm10"] = us_deep_sum
    out["understat_ppda_intensity_sum"] = us_ppda_sum
    out["altitude_hypoxia_adv_km"] = alt_hypoxia_km
    out["altitude_abs_diff_km"] = alt_abs_km
    out["altitude_venue_km"] = alt_venue_km

    live_tactical_state: dict[str, dict[str, float]] = {}
    all_keys = set(st_xgf.keys()) | set(st_npxgd.keys())
    for k in sorted(all_keys):
        dv_k, tm_k = k.split("::", 1)
        live_tactical_state[k] = {
            "real_xg_for": round(st_xgf.get(k, 1.35), 5),
            "real_xg_against": round(st_xga.get(k, 1.35), 5),
            "real_xg_luck": round(st_luck.get(k, 0.0), 5),
            "has_real_xg": 1.0 if st_n_xg.get(k, 0) >= 3 else 0.0,
            "npxgd_ewm": round(st_npxgd.get(k, 0.0), 5),
            "deep_ewm": round(st_deep.get(k, 5.5), 5),
            "ppda_ewm": round(st_ppda.get(k, 11.2), 5),
            "elevation_m": round(elev_by_team.get((dv_k, tm_k), 120.0), 1),
        }
    return out, live_tactical_state


def main() -> None:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    sb_cal = calibrate_statsbomb_p1_1_shot_xg(max_matches_sample=180)
    xi_val_share = _build_dated_xi_valuation_share()

    matches_p = PRED_LAB_ROOT / "data" / "processed" / "matches.parquet"
    feats_p = _resolve_features_parquet()

    m_df = pd.read_parquet(matches_p)
    m_df["match_date"] = pd.to_datetime(m_df["match_date"])
    m_df = m_df[(m_df["match_date"] < HOLDOUT_CUT_TS) & m_df["result"].notna()].copy()
    if bool((m_df["match_date"] >= HOLDOUT_CUT_TS).any()):
        raise RuntimeError("HoldoutSealedAccessError en EXP_V43")

    f_df = pd.read_parquet(feats_p)
    f_df["match_date"] = pd.to_datetime(f_df["match_date"])
    f_df = f_df[(f_df["match_date"] < HOLDOUT_CUT_TS) & f_df["y"].notna()].copy()
    f_df["y"] = f_df["y"].astype(np.int64)
    f_df["sstart"] = f_df["season"].astype(str).str[:4].astype(int)

    # Filtrar a las 6 ligas insignia en vivo (`E0, SP1, I1, D1, F1, MEX`, `sstart >= 2014`) para velocidad y máxima señal xG/altitud
    m_sub = m_df[m_df["div"].isin(FLAGSHIP_6_DIVS)].copy()
    f_sub = f_df[f_df["div"].isin(FLAGSHIP_6_DIVS) & (f_df["sstart"] >= 2014)].copy()

    sb_sig_df = _compute_statsbomb_ewm_feature(m_sub, sb_cal)
    tempo_df = _compute_causal_club_tempo_and_xg_features(m_sub, sb_cal)
    m_join = m_sub[
        [
            "match_id",
            "home_team",
            "away_team",
            "home_goals",
            "away_goals",
            "totals_close_p_over",
            "totals_close_p_under",
        ]
    ].drop_duplicates("match_id")

    df = (
        f_sub.merge(m_join, on="match_id", how="left", suffixes=("", "_m"))
        .merge(sb_sig_df, on="match_id", how="left")
        .merge(tempo_df, on="match_id", how="left")
    )
    df = df.sort_values(["match_date", "match_id"], kind="mergesort").reset_index(drop=True)
    df, live_tac_state = _attach_v40_tactical_xg_altitude_features(df)

    tm_bridge = CausalClubTransfermarktBridge(max_date_exclusive=HOLDOUT_CUT_DATE)
    w2_bridge = CausalClubWave2Bridge(max_date_exclusive=HOLDOUT_CUT_DATE)

    ht_col = "home_team" if "home_team" in df.columns else "home_team_m"
    at_col = "away_team" if "away_team" in df.columns else "away_team_m"
    hg_col = "home_goals" if "home_goals" in df.columns else "home_goals_m"
    ag_col = "away_goals" if "away_goals" in df.columns else "away_goals_m"

    n_rows = len(df)
    tm6_mat = np.zeros((n_rows, len(TM_6_COLS)), dtype=np.float64)
    w2_mat = np.zeros((n_rows, len(ALL_W2_CLUB_COLS)), dtype=np.float64)
    tm_val_sum_vec = np.zeros(n_rows, dtype=np.float64)
    tm_val_abs_vec = np.zeros(n_rows, dtype=np.float64)
    xi_ga90_sum_vec = np.zeros(n_rows, dtype=np.float64)
    games_14d_sum_vec = np.zeros(n_rows, dtype=np.float64)
    xi_eur_diff_vec = np.zeros(n_rows, dtype=np.float64)
    xi_eur_sum_vec = np.zeros(n_rows, dtype=np.float64)

    d_ords = df["match_date"].map(lambda d: d.toordinal()).to_numpy(dtype=np.int64)
    d_strs = df["match_date"].astype(str).str.slice(0, 10).tolist()
    divs = df["div"].astype(str).tolist()
    hts = df[ht_col].astype(str).tolist()
    ats = df[at_col].astype(str).tolist()
    elo_diffs = pd.to_numeric(df["elo_diff_no_hfa"], errors="coerce").fillna(0.0).to_numpy(dtype=np.float64)
    hdc = (
        pd.to_numeric(df["h_div_change"], errors="coerce").fillna(0.0).to_numpy(dtype=np.float64)
        if "h_div_change" in df.columns
        else np.zeros(n_rows, dtype=np.float64)
    )
    adc = (
        pd.to_numeric(df["a_div_change"], errors="coerce").fillna(0.0).to_numpy(dtype=np.float64)
        if "a_div_change" in df.columns
        else np.zeros(n_rows, dtype=np.float64)
    )

    def _lookup_xi_share(cid: int | None, ds: str) -> float:
        if not cid or cid not in xi_val_share:
            return 0.92
        dts, shs = xi_val_share[cid]
        pos = bisect_left(dts, ds) - 1
        return shs[pos] if pos >= 0 else 0.92

    div_ewm_log_val: dict[str, float] = {}
    div_ewm_xi_val: dict[str, float] = {}
    alpha_div = 0.04

    # Mapa club_id de Transfermarkt + Wave2 + `xi_val_share` estrictamente `< match_date`
    for i in range(n_rows):
        dv, hm, aw, do, ds = divs[i], hts[i], ats[i], int(d_ords[i]), d_strs[i]
        eh = 1525.0 + 0.5 * elo_diffs[i]
        ea = 1525.0 - 0.5 * elo_diffs[i]
        elo_rel_h = (eh - 1525.0) / 145.0
        elo_rel_a = (ea - 1525.0) / 145.0

        th = tm_bridge.lookup_prematch_club_tm(dv, hm, do, eh)
        ta = tm_bridge.lookup_prematch_club_tm(dv, aw, do, ea)
        has_h = th["tm_has_val"] > 0.0
        has_a = ta["tm_has_val"] > 0.0
        cur_div_med = div_ewm_log_val.get(dv, 3.80)

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
            div_ewm_log_val[dv] = (1.0 - alpha_div) * div_ewm_log_val.get(dv, th["tm_raw_log_val"]) + alpha_div * th["tm_raw_log_val"]
        if has_a:
            div_ewm_log_val[dv] = (1.0 - alpha_div) * div_ewm_log_val.get(dv, ta["tm_raw_log_val"]) + alpha_div * ta["tm_raw_log_val"]

        tm6_mat[i, 0] = val_diff
        tm6_mat[i, 1] = depth_diff
        tm6_mat[i, 2] = gap_diff
        tm6_mat[i, 3] = hdc[i] * rel_h - adc[i] * rel_a
        tm6_mat[i, 4] = th["tm_new_mgr_flag"] - ta["tm_new_mgr_flag"]
        tm6_mat[i, 5] = th["tm_mgr_pae"] - ta["tm_mgr_pae"]
        tm_val_sum_vec[i] = rel_h + rel_a
        tm_val_abs_vec[i] = abs(val_diff)

        ch_id = tm_bridge.resolve_club_id(dv, hm)
        ca_id = tm_bridge.resolve_club_id(dv, aw)
        w2_h = w2_bridge.lookup_club_wave2(ch_id, do)
        w2_a = w2_bridge.lookup_club_wave2(ca_id, do)

        w2_mat[i, 0] = w2_a["midweek_cup_load"] - w2_h["midweek_cup_load"]
        w2_mat[i, 1] = w2_a["games_14d_allcomps"] - w2_h["games_14d_allcomps"]
        games_14d_sum_vec[i] = w2_h["games_14d_allcomps"] + w2_a["games_14d_allcomps"]

        hx = w2_h["has_realized_xi"] > 0.0
        ax = w2_a["has_realized_xi"] > 0.0
        cur_xi_med = div_ewm_xi_val.get(dv, 3.20)
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
            div_ewm_xi_val[dv] = (1.0 - alpha_div) * div_ewm_xi_val.get(dv, w2_h["realized_xi_log_val"]) + alpha_div * w2_h["realized_xi_log_val"]
        if ax:
            div_ewm_xi_val[dv] = (1.0 - alpha_div) * div_ewm_xi_val.get(dv, w2_a["realized_xi_log_val"]) + alpha_div * w2_a["realized_xi_log_val"]

        w2_mat[i, 2] = xi_val_diff
        w2_mat[i, 3] = avail_diff
        w2_mat[i, 4] = ga90_diff
        w2_mat[i, 5] = w2_h["net_transfer_val_120d"] - w2_a["net_transfer_val_120d"]
        w2_mat[i, 6] = w2_h["inbound_fee_120d"] - w2_a["inbound_fee_120d"]
        xi_ga90_sum_vec[i] = ga90_sum

        sh_h = _lookup_xi_share(ch_id, ds)
        sh_a = _lookup_xi_share(ca_id, ds)
        xi_eur_diff_vec[i] = sh_h - sh_a
        xi_eur_sum_vec[i] = sh_h + sh_a

    for j, nm in enumerate(TM_6_COLS):
        df[nm] = tm6_mat[:, j]
    for j, nm in enumerate(ALL_W2_CLUB_COLS):
        df[nm] = w2_mat[:, j]

    elo_d = pd.to_numeric(df["elo_diff_no_hfa"], errors="coerce").fillna(0.0).to_numpy(dtype=np.float64)
    df["tm_log_val_sum"] = tm_val_sum_vec
    df["tm_val_abs_mismatch"] = tm_val_abs_vec
    df["xi_ga90_sum"] = xi_ga90_sum_vec
    df["abs_elo_mismatch"] = np.abs(elo_d) / 200.0
    df["games_14d_sum"] = games_14d_sum_vec
    df["realized_xi_eur_share_diff"] = xi_eur_diff_vec
    df["realized_xi_eur_share_sum"] = xi_eur_sum_vec

    cols_v35_52 = list(LIVE_BASE_38_ORDERED) + list(SB_1_COL) + list(TM_6_COLS) + list(ALL_W2_CLUB_COLS)
    div_levels = list(FLAGSHIP_6_DIVS)

    # Walk-forward estricto anual `2018..2025`
    eval_seasons = sorted(set(int(s) for s in df["sstart"].unique() if int(s) >= 2018))

    def _run_logit_wf_fast(col_list: list[str], c_reg: float) -> np.ndarray:
        parts_l: list[np.ndarray] = []
        for yr in eval_seasons:
            tr_m = (df["sstart"].to_numpy() < yr) & (df["sstart"].to_numpy() >= 2014)
            ev_m = df["sstart"].to_numpy() == yr
            if int(np.sum(tr_m)) < 500 or int(np.sum(ev_m)) == 0:
                continue
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
            parts_l.append(lr.predict_proba(sc.transform(imp.transform(X_ev))))
        return np.vstack(parts_l)

    # Selección causal individual de features `v4.0` estrictamente en `VAL <= 2021` (poda automática de ruido)
    meta_scan = pd.concat(
        [
            df.loc[df["sstart"] == yr, ["match_id", "div", "sstart", "y", hg_col, ag_col, "totals_close_p_over", "totals_close_p_under"]]
            for yr in eval_seasons
            if int(np.sum((df["sstart"].to_numpy() < yr) & (df["sstart"].to_numpy() >= 2014))) >= 500 and int(np.sum(df["sstart"].to_numpy() == yr)) > 0
        ],
        ignore_index=True,
    )
    y_scan = meta_scan["y"].to_numpy(dtype=np.int64)
    val_scan = meta_scan["sstart"].to_numpy(dtype=int) <= 2021

    # Calibrar C base en VAL <= 2021 para tamaño muestral de 6 ligas
    best_c_reg = 0.012
    best_base_val = float("inf")
    for c_try in (0.006, 0.012, 0.020):
        p_b = _run_logit_wf_fast(cols_v35_52, c_try)
        ll_b = float(np.mean(oc.compute_categorical_log_loss_vec(p_b[val_scan], y_scan[val_scan])))
        if ll_b < best_base_val:
            best_base_val = ll_b
            best_c_reg = c_try

    accepted_v4_cols: list[str] = []
    cur_cols = list(cols_v35_52)
    cur_best_ll = best_base_val
    for cand_f in V40_EXTRA_10_1X2_COLS:
        p_try_f = _run_logit_wf_fast(cur_cols + [cand_f], best_c_reg)
        ll_try_f = float(np.mean(oc.compute_categorical_log_loss_vec(p_try_f[val_scan], y_scan[val_scan])))
        if ll_try_f < cur_best_ll - 1e-6:
            cur_cols.append(cand_f)
            accepted_v4_cols.append(cand_f)
            cur_best_ll = ll_try_f
    cols_v40_selected = cur_cols
    print(f"[EXP_V43] VAL<=2021 C={best_c_reg} | Features aceptadas ({len(accepted_v4_cols)}/10): {accepted_v4_cols}")

    oof_v35_ens: list[np.ndarray] = []
    oof_v40_logit: list[np.ndarray] = []
    oof_v40_hgb_raw: list[np.ndarray] = []
    oof_t_v35: list[np.ndarray] = []
    oof_t_v40: list[np.ndarray] = []
    meta_parts: list[pd.DataFrame] = []

    hgb_cls_params = {
        "max_depth": 4,
        "max_leaf_nodes": 15,
        "min_samples_leaf": 110,
        "learning_rate": 0.035,
        "max_iter": 110,
        "l2_regularization": 10.0,
        "early_stopping": False,
        "random_state": MODEL_SEED,
    }

    for yr in eval_seasons:
        tr_m = (df["sstart"].to_numpy() < yr) & (df["sstart"].to_numpy() >= 2014)
        ev_m = df["sstart"].to_numpy() == yr
        if int(np.sum(tr_m)) < 500 or int(np.sum(ev_m)) == 0:
            continue

        tr_df = df.loc[tr_m]
        ev_df = df.loc[ev_m]
        y_tr = tr_df["y"].to_numpy(dtype=np.int64)
        max_dt = tr_df["match_date"].max()
        sw = 0.5 ** ((max_dt - tr_df["match_date"]).dt.days.to_numpy(dtype=np.float64) / 2190.0)

        dum_tr = np.column_stack([(tr_df["div"].astype(str).to_numpy() == lv).astype(np.float64) for lv in div_levels])
        dum_ev = np.column_stack([(ev_df["div"].astype(str).to_numpy() == lv).astype(np.float64) for lv in div_levels])

        # Baseline v3.5 (52 cols, C=0.02)
        X35_tr = np.hstack([tr_df[cols_v35_52].to_numpy(dtype=np.float64), dum_tr])
        X35_ev = np.hstack([ev_df[cols_v35_52].to_numpy(dtype=np.float64), dum_ev])
        imp35 = SimpleImputer(strategy="median").fit(X35_tr)
        sc35 = StandardScaler().fit(imp35.transform(X35_tr))
        sc35.scale_ = np.where(sc35.scale_ == 0.0, 1.0, sc35.scale_)
        lr35 = LogisticRegression(C=0.02, max_iter=800).fit(sc35.transform(imp35.transform(X35_tr)), y_tr, sample_weight=sw)
        p_log35 = lr35.predict_proba(sc35.transform(imp35.transform(X35_ev)))
        hgb35 = HistGradientBoostingClassifier(**hgb_cls_params).fit(X35_tr, y_tr, sample_weight=sw)
        p_hgb35 = _apply_temperature_3way_exact(hgb35.predict_proba(X35_ev), 1.05)
        oof_v35_ens.append(_blend_3way_exact(p_log35, p_hgb35, 0.65, 0.35, "probability"))

        # Candidato v4.0 (subconjunto podado causalmente en VAL + C calibrado)
        X40_tr = np.hstack([tr_df[cols_v40_selected].to_numpy(dtype=np.float64), dum_tr])
        X40_ev = np.hstack([ev_df[cols_v40_selected].to_numpy(dtype=np.float64), dum_ev])
        imp40 = SimpleImputer(strategy="median").fit(X40_tr)
        sc40 = StandardScaler().fit(imp40.transform(X40_tr))
        sc40.scale_ = np.where(sc40.scale_ == 0.0, 1.0, sc40.scale_)
        lr40 = LogisticRegression(C=best_c_reg, max_iter=800).fit(sc40.transform(imp40.transform(X40_tr)), y_tr, sample_weight=sw)
        oof_v40_logit.append(lr40.predict_proba(sc40.transform(imp40.transform(X40_ev))))
        hgb40 = HistGradientBoostingClassifier(**hgb_cls_params).fit(X40_tr, y_tr, sample_weight=sw)
        oof_v40_hgb_raw.append(hgb40.predict_proba(X40_ev))

        # Goles Totales: v3.5 (13 cols Poisson) vs v4.0 (19 cols Poisson + HGB Poisson ensemble)
        tot_tr = np.clip(
            pd.to_numeric(tr_df[hg_col], errors="coerce").fillna(1.0).to_numpy(dtype=np.float64)
            + pd.to_numeric(tr_df[ag_col], errors="coerce").fillna(1.0).to_numpy(dtype=np.float64),
            0.0,
            15.0,
        )
        Xg35_tr = np.hstack([tr_df[list(HORIZON_GOALS_13_BASE_COLS)].to_numpy(dtype=np.float64), dum_tr])
        Xg35_ev = np.hstack([ev_df[list(HORIZON_GOALS_13_BASE_COLS)].to_numpy(dtype=np.float64), dum_ev])
        impg35 = SimpleImputer(strategy="median").fit(Xg35_tr)
        scg35 = StandardScaler().fit(impg35.transform(Xg35_tr))
        scg35.scale_ = np.where(scg35.scale_ == 0.0, 1.0, scg35.scale_)
        prg35 = PoissonRegressor(alpha=0.05, max_iter=800).fit(scg35.transform(impg35.transform(Xg35_tr)), tot_tr, sample_weight=sw)
        oof_t_v35.append(np.clip(prg35.predict(scg35.transform(impg35.transform(Xg35_ev))), 0.45, 7.5))

        Xg40_tr = np.hstack([tr_df[list(V40_GOALS_19_BASE_COLS)].to_numpy(dtype=np.float64), dum_tr])
        Xg40_ev = np.hstack([ev_df[list(V40_GOALS_19_BASE_COLS)].to_numpy(dtype=np.float64), dum_ev])
        impg40 = SimpleImputer(strategy="median").fit(Xg40_tr)
        scg40 = StandardScaler().fit(impg40.transform(Xg40_tr))
        scg40.scale_ = np.where(scg40.scale_ == 0.0, 1.0, scg40.scale_)
        prg40 = PoissonRegressor(alpha=0.05, max_iter=800).fit(scg40.transform(impg40.transform(Xg40_tr)), tot_tr, sample_weight=sw)
        oof_t_v40.append(np.clip(prg40.predict(scg40.transform(impg40.transform(Xg40_ev))), 0.45, 7.5))

        meta_parts.append(
            ev_df[["match_id", "div", "sstart", "y", hg_col, ag_col, "totals_close_p_over", "totals_close_p_under"]].copy()
        )
        print(f"  [EXP_V43 Fold {yr}] completado ({len(ev_df):,} partidos)")

    oof_meta = pd.concat(meta_parts, ignore_index=True)
    y_oof = oof_meta["y"].to_numpy(dtype=np.int64)
    ss_oof = oof_meta["sstart"].to_numpy(dtype=int)
    val_m = ss_oof <= 2021
    oos_m = ss_oof >= 2022
    mex_m = oof_meta["div"].astype(str).to_numpy() == "MEX"

    P_v35 = np.vstack(oof_v35_ens)
    P_v40_log = np.vstack(oof_v40_logit)
    P_v40_hgb_r = np.vstack(oof_v40_hgb_raw)
    T_v35 = np.concatenate(oof_t_v35)
    T_v40 = np.concatenate(oof_t_v40)

    # Selección de hiperparámetros 1X2 estrictamente en VAL <= 2021
    best_1x2 = None
    best_val_ll = float("inf")
    for t_cand in (1.0, 1.08, 1.15):
        P_hc = _apply_temperature_3way_exact(P_v40_hgb_r, t_cand)
        for bsp in ("logit", "probability"):
            for wg in (0.0, 0.20, 0.32, 0.42):
                wl = round(1.0 - wg, 6)
                p_try = _blend_3way_exact(P_v40_log[val_m], P_hc[val_m], wl, wg, bsp)
                ll_v = float(np.mean(oc.compute_categorical_log_loss_vec(p_try, y_oof[val_m])))
                if ll_v < best_val_ll:
                    best_val_ll = ll_v
                    best_1x2 = (t_cand, bsp, wl, wg, P_hc)

    assert best_1x2 is not None
    sel_t, sel_bsp, sel_wl, sel_wg, P_hgb_cal = best_1x2
    P_v40 = _blend_3way_exact(P_v40_log, P_hgb_cal, sel_wl, sel_wg, sel_bsp)

    ev_1x2_all = oc.evaluate_calibration_with_bootstrap(
        P_v40,
        y_oof,
        benchmark_ll_vec=oc.compute_categorical_log_loss_vec(P_v35, y_oof),
        n_resamples=BOOTSTRAP_SAMPLES,
        seed=BOOTSTRAP_SEED,
        include_bins=False,
    )
    ev_1x2_oos = oc.evaluate_calibration_with_bootstrap(
        P_v40[oos_m],
        y_oof[oos_m],
        benchmark_ll_vec=oc.compute_categorical_log_loss_vec(P_v35[oos_m], y_oof[oos_m]),
        n_resamples=BOOTSTRAP_SAMPLES,
        seed=BOOTSTRAP_SEED,
        include_bins=False,
    )
    ev_1x2_mex = oc.evaluate_calibration_with_bootstrap(
        P_v40[mex_m],
        y_oof[mex_m],
        benchmark_ll_vec=oc.compute_categorical_log_loss_vec(P_v35[mex_m], y_oof[mex_m]),
        n_resamples=BOOTSTRAP_SAMPLES,
        seed=BOOTSTRAP_SEED,
        include_bins=False,
    )

    # Evaluar Matriz 4-Param Diagonal-Inflada (v4.0) vs 3-Param DC (v3.5)
    hg_oof = pd.to_numeric(oof_meta[hg_col], errors="coerce").to_numpy(dtype=np.float64)
    ag_oof = pd.to_numeric(oof_meta[ag_col], errors="coerce").to_numpy(dtype=np.float64)
    tot_oof = hg_oof + ag_oof
    y_o25 = np.where(tot_oof >= 3, 0, 1).astype(np.int64)
    y_o35 = np.where(tot_oof >= 4, 0, 1).astype(np.int64)
    y_btts = np.where((hg_oof >= 1) & (ag_oof >= 1), 0, 1).astype(np.int64)

    rho_priors = np.where(mex_m, -0.115, -0.105)
    lh35, la35, rh35 = solve_coherent_dc_3param_batch(P_v35, T_v35, rho_priors)
    mk35 = summarize_dc_markets_batch(lh35, la35, rh35)
    max_cone_err_v35 = float(
        np.max(np.abs(np.column_stack([mk35["p_home"], mk35["p_draw"], mk35["p_away"]]) - P_v35))
    )

    # Seleccionar `dispersion_r` en VAL <= 2021
    best_r_disp = 28.0
    best_g_val = float("inf")
    for r_try in (18.0, 28.0, 45.0, 500.0):
        mkv = solve_diagonal_inflated_batch_fast(P_v40[val_m], T_v40[val_m], rho_priors[val_m], dispersion_r=r_try)
        po25_v = np.column_stack([mkv["p_over_2_5"], 1.0 - mkv["p_over_2_5"]])
        po35_v = np.column_stack([mkv["p_over_3_5"], 1.0 - mkv["p_over_3_5"]])
        pb_v = np.column_stack([mkv["p_btts_yes"], 1.0 - mkv["p_btts_yes"]])
        score_v = float(
            np.mean(oc.compute_categorical_log_loss_vec(po25_v, y_o25[val_m]))
            + 0.5 * np.mean(oc.compute_categorical_log_loss_vec(po35_v, y_o35[val_m]))
            + 0.5 * np.mean(oc.compute_categorical_log_loss_vec(pb_v, y_btts[val_m]))
        )
        if score_v < best_g_val:
            best_g_val = score_v
            best_r_disp = r_try

    mk40 = solve_diagonal_inflated_batch_fast(P_v40, T_v40, rho_priors, dispersion_r=best_r_disp)
    max_cone_err_v40 = float(
        np.max(np.abs(np.column_stack([mk40["p_home"], mk40["p_draw"], mk40["p_away"]]) - P_v40))
    )

    P_o25_35 = np.column_stack([mk35["p_over_2_5"], 1.0 - mk35["p_over_2_5"]])
    P_o25_40 = np.column_stack([mk40["p_over_2_5"], 1.0 - mk40["p_over_2_5"]])
    P_btts_35 = np.column_stack([mk35["p_btts_yes"], 1.0 - mk35["p_btts_yes"]])
    P_btts_40 = np.column_stack([mk40["p_btts_yes"], 1.0 - mk40["p_btts_yes"]])
    P_o35_35 = np.column_stack([mk35["p_over_3_5"], 1.0 - mk35["p_over_3_5"]])
    P_o35_40 = np.column_stack([mk40["p_over_3_5"], 1.0 - mk40["p_over_3_5"]])

    ev_o25 = oc.evaluate_calibration_with_bootstrap(
        P_o25_40, y_o25, benchmark_ll_vec=oc.compute_categorical_log_loss_vec(P_o25_35, y_o25), n_resamples=BOOTSTRAP_SAMPLES, seed=BOOTSTRAP_SEED, include_bins=False
    )
    ev_btts = oc.evaluate_calibration_with_bootstrap(
        P_btts_40, y_btts, benchmark_ll_vec=oc.compute_categorical_log_loss_vec(P_btts_35, y_btts), n_resamples=BOOTSTRAP_SAMPLES, seed=BOOTSTRAP_SEED, include_bins=False
    )
    ev_o35 = oc.evaluate_calibration_with_bootstrap(
        P_o35_40, y_o35, benchmark_ll_vec=oc.compute_categorical_log_loss_vec(P_o35_35, y_o35), n_resamples=BOOTSTRAP_SAMPLES, seed=BOOTSTRAP_SEED, include_bins=False
    )

    print(
        f"\n=== EXP_V43 SOCCER CORE v4.0 (n={len(y_oof):,}, Flagship 6 Leagues incl. MEX) ===\n"
        f"  1X2 All (2018..2025): v3.5={float(np.mean(oc.compute_categorical_log_loss_vec(P_v35, y_oof))):.5f} -> "
        f"v4.0={ev_1x2_all['log_loss']:.5f} (ECE={ev_1x2_all['ece']:.5f}) | dLL={ev_1x2_all['delta_ll_vs_benchmark']:+.5f} ({ev_1x2_all['significance']})\n"
        f"  1X2 OOS (2022..2025 n={int(np.sum(oos_m)):,}): dLL={ev_1x2_oos['delta_ll_vs_benchmark']:+.5f} ({ev_1x2_oos['significance']})\n"
        f"  1X2 Liga MX (n={int(np.sum(mex_m)):,}): dLL={ev_1x2_mex['delta_ll_vs_benchmark']:+.5f} ({ev_1x2_mex['significance']})\n"
        f"  Totals 2.5 (4-Param r={best_r_disp}): dLL vs v3.5={ev_o25['delta_ll_vs_benchmark']:+.5f} ({ev_o25['significance']}) | ECE={ev_o25['ece']:.5f}\n"
        f"  Totals 3.5 (4-Param r={best_r_disp}): dLL vs v3.5={ev_o35['delta_ll_vs_benchmark']:+.5f} ({ev_o35['significance']})\n"
        f"  BTTS       (4-Param r={best_r_disp}): dLL vs v3.5={ev_btts['delta_ll_vs_benchmark']:+.5f} ({ev_btts['significance']})\n"
        f"  Max 1X2 Matrix Coherence Error: v3.5={max_cone_err_v35:.3e} -> v4.0={max_cone_err_v40:.3e}"
    )

    # Ajuste final sobre `< 2025-02-02` y exportación de artefactos v4.0
    max_dt_f = df["match_date"].max()
    sw_f = 0.5 ** ((max_dt_f - df["match_date"]).dt.days.to_numpy(dtype=np.float64) / 2190.0)
    dum_f = np.column_stack([(df["div"].astype(str).to_numpy() == lv).astype(np.float64) for lv in div_levels])
    X_f = np.hstack([df[cols_v40_selected].to_numpy(dtype=np.float64), dum_f])
    y_f = df["y"].to_numpy(dtype=np.int64)

    imp_f = SimpleImputer(strategy="median").fit(X_f)
    sc_f = StandardScaler().fit(imp_f.transform(X_f))
    sc_f.scale_ = np.where(sc_f.scale_ == 0.0, 1.0, sc_f.scale_)
    lr_f = LogisticRegression(C=best_c_reg, max_iter=800).fit(sc_f.transform(imp_f.transform(X_f)), y_f, sample_weight=sw_f)
    hgb_f = HistGradientBoostingClassifier(**hgb_cls_params).fit(X_f, y_f, sample_weight=sw_f)

    logit_comp = eg.build_logit_companion_payload(imp_f, sc_f, lr_f, n_features_base=len(cols_v40_selected), regularization_c=best_c_reg)
    gbm_v40_art = eg.serialize_hist_gbm_to_artifact(
        hgb_f,
        base_feature_names=cols_v40_selected,
        div_levels=div_levels,
        temperature=sel_t,
        blend_space=sel_bsp,
        w_logit=sel_wl,
        w_gbm=sel_wg,
        production_activated=False,
        activation_verdict={
            "activated": False,
            "status": "candidate",
            "significance": ev_1x2_all["significance"],
            "criterion": "Candidato Tachyon v4.0 + Diagonal-Inflated 4-Param validado < 2025-02-02",
            "reason": f"LL={ev_1x2_all['log_loss']:.5f}, dLL_vs_v35={ev_1x2_all['delta_ll_vs_benchmark']:+.5f} ({ev_1x2_all['significance']})",
        },
        logit_companion=logit_comp,
        training_window={
            "min_season": 2014,
            "max_date_exclusive": HOLDOUT_CUT_ISO,
            "n_matches": int(len(df)),
            "holdout_sealed_untouched": True,
        },
        calibrated_on_window={"val_seasons": "2018..2021", "n_val": int(np.sum(val_m))},
        codename="PitchLab Tachyon v4.0 Tactical-xG Ensemble",
        version="4.0.0-candidate",
        seed=MODEL_SEED,
    )
    GBM_V40_OUT.write_text(json.dumps(gbm_v40_art, separators=(",", ":")), encoding="utf-8")

    tot_f = np.clip(
        pd.to_numeric(df[hg_col], errors="coerce").fillna(1.0).to_numpy(dtype=np.float64)
        + pd.to_numeric(df[ag_col], errors="coerce").fillna(1.0).to_numpy(dtype=np.float64),
        0.0,
        15.0,
    )
    Xg_f = np.hstack([df[list(V40_GOALS_19_BASE_COLS)].to_numpy(dtype=np.float64), dum_f])
    impg_f = SimpleImputer(strategy="median").fit(Xg_f)
    scg_f = StandardScaler().fit(impg_f.transform(Xg_f))
    scg_f.scale_ = np.where(scg_f.scale_ == 0.0, 1.0, scg_f.scale_)
    prg_f = PoissonRegressor(alpha=0.05, max_iter=800).fit(scg_f.transform(impg_f.transform(Xg_f)), tot_f, sample_weight=sw_f)

    goals_v40_art = {
        "schema_version": "diagonal_goals_v4.0.0",
        "type": "poisson_log_link_4param_diagonal_nb_dc",
        "codename": "PitchLab Horizon-Goals v4.0 Diagonal-NB",
        "version": "4.0.0-candidate",
        "status": "candidate",
        "production_activated": False,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "dispersion_r": float(best_r_disp),
        "default_rho": -0.105,
        "div_rho_map": {"E0": -0.10, "SP1": -0.11, "I1": -0.11, "D1": -0.09, "F1": -0.11, "MEX": -0.115},
        "min_total_goals": 0.45,
        "max_total_goals": 7.5,
        "max_goals_grid": DEFAULT_V4_MAX_GOALS,
        "n_features_base": len(V40_GOALS_19_BASE_COLS),
        "base_features": list(V40_GOALS_19_BASE_COLS),
        "div_levels": div_levels,
        "features": list(V40_GOALS_19_BASE_COLS) + [f"div_{lv}" for lv in div_levels],
        "imputer_statistics": [float(v) for v in impg_f.statistics_.tolist()],
        "scaler_mean": [float(v) for v in scg_f.mean_.tolist()],
        "scaler_scale": [float(v) for v in scg_f.scale_.tolist()],
        "coef": [float(v) for v in prg_f.coef_.tolist()],
        "intercept": float(prg_f.intercept_),
    }
    GOALS_V40_OUT.write_text(json.dumps(goals_v40_art, indent=2), encoding="utf-8")

    STATE_V40_OUT.write_text(
        json.dumps(
            {
                "schema_version": "club_tactical_state_v4.0.0",
                "as_of_cutoff_iso": HOLDOUT_CUT_ISO,
                "holdout_sealed_untouched": True,
                "n_clubs": len(live_tac_state),
                "clubs": live_tac_state,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    # Snapshot de paridad IEEE-754 `< 1e-12` (`120` partidos recientes `< 2025-02-02` + casos extremos 99% goleada)
    rng = np.random.default_rng(MODEL_SEED)
    rec_pool = np.where(df["sstart"].to_numpy() >= 2022)[0]
    ch_idx = np.sort(rng.choice(rec_pool, size=min(120, len(rec_pool)), replace=False))
    snap_rows: list[dict[str, Any]] = []

    lc = gbm_v40_art["logit_companion"]
    cal = gbm_v40_art["calibration"]

    for r_i in ch_idx:
        dv = str(df.iloc[r_i]["div"])
        f_base = [float(v) if math.isfinite(float(v)) else None for v in df.iloc[r_i][cols_v40_selected].tolist()]
        g_base = [float(v) if math.isfinite(float(v)) else 0.0 for v in df.iloc[r_i][list(V40_GOALS_19_BASE_COLS)].tolist()]
        d_oh = [1.0 if lv == dv else 0.0 for lv in div_levels]
        x_full = [v if v is not None else float("nan") for v in f_base] + d_oh

        # Evaluación secuencial idéntica a `gbm.ts`
        z = []
        for idx_c, xv in enumerate(x_full):
            vv = xv if math.isfinite(xv) else lc["imputer_statistics"][idx_c]
            inv_sc = 1.0 / (lc["scaler_scale"][idx_c] or 1.0)
            z.append((vv - lc["scaler_mean"][idx_c]) * inv_sc)
        lg = []
        for c in range(3):
            acc = float(lc["intercept"][c])
            rw = lc["coef"][c]
            for idx_c in range(len(z)):
                acc += float(rw[idx_c]) * z[idx_c]
            lg.append(acc)
        mx = max(lg)
        ex = [math.exp(v - mx) for v in lg]
        sex = ex[0] + ex[1] + ex[2]
        p_log = [v / sex for v in ex]

        p_gbm_c = eg.predict_serialized_gbm_python(np.array([x_full], dtype=np.float64), gbm_v40_art, calibrated=True)[0].tolist()
        wl, wg = float(cal["w_logit"]), float(cal["w_gbm"])
        if cal["blend_space"] == "logit":
            blg = [wl * math.log(max(pl, 1e-15)) + wg * math.log(max(pg, 1e-15)) for pl, pg in zip(p_log, p_gbm_c)]
            bmx = max(blg)
            bex = [math.exp(v - bmx) for v in blg]
            bs = bex[0] + bex[1] + bex[2]
            p_ens = [v / bs for v in bex]
        else:
            pr = [wl * pl + wg * pg for pl, pg in zip(p_log, p_gbm_c)]
            ps = pr[0] + pr[1] + pr[2]
            p_ens = [v / ps for v in pr]

        xg_full = g_base + d_oh
        eta = float(goals_v40_art["intercept"])
        for idx_c, xv in enumerate(xg_full):
            sc_v = goals_v40_art["scaler_scale"][idx_c] or 1.0
            eta += float(goals_v40_art["coef"][idx_c]) * ((xv - goals_v40_art["scaler_mean"][idx_c]) / sc_v)
        eta = min(max(eta, math.log(0.45)), math.log(7.5))
        t_hat = math.exp(eta)

        rp = float(goals_v40_art["div_rho_map"].get(dv, -0.105))
        sol4 = solve_diagonal_inflated_score_matrix_4param(
            p_ens[0], p_ens[1], p_ens[2], t_hat, rho_prior=rp, dispersion_r=best_r_disp, max_goals=DEFAULT_V4_MAX_GOALS
        )
        mk4 = summarize_markets_from_matrix_v4(sol4["matrix"])

        snap_rows.append(
            {
                "match_id": str(df.iloc[r_i]["match_id"]),
                "div": dv,
                "features": f_base,
                "goals_features": g_base,
                "python_ensemble_probs": p_ens,
                "python_t_hat": t_hat,
                "python_4param": {
                    "mu_home": sol4["mu_home"],
                    "mu_away": sol4["mu_away"],
                    "rho_eff": sol4["rho_eff"],
                    "diag_multiplier": sol4["diag_multiplier"],
                    "expected_total_implied": sol4["expected_total_implied"],
                    "p_home": mk4["p_home"],
                    "p_draw": mk4["p_draw"],
                    "p_away": mk4["p_away"],
                    "p_over_2_5": mk4["p_over_2_5"],
                    "p_over_3_5": mk4["p_over_3_5"],
                    "p_btts_yes": mk4["p_btts_yes"],
                },
            }
        )

    SNAP_V40_OUT.write_text(
        json.dumps(
            {
                "schema_version": "soccer_v4.0_core_parity_snapshot",
                "holdout_sealed_untouched": True,
                "n": len(snap_rows),
                "rows": snap_rows,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    results_payload = {
        "experiment_id": "EXP_V43_soccer_v4_0_core",
        "eval_split": "walk_forward_dev",
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "selected_config": {
            "hgb_temperature": sel_t,
            "blend_space": sel_bsp,
            "w_logit": sel_wl,
            "w_gbm": sel_wg,
            "dispersion_r": best_r_disp,
        },
        "metrics_1x2": {
            "all_flagship_6_vs_v3_5": ev_1x2_all,
            "oos_2022_2025_vs_v3_5": ev_1x2_oos,
            "liga_mx_vs_v3_5": ev_1x2_mex,
            "max_1x2_matrix_coherence_error_v3_5": max_cone_err_v35,
            "max_1x2_matrix_coherence_error_v4_0": max_cone_err_v40,
        },
        "metrics_goals_4param_vs_v3_5": {
            "totals_2_5": ev_o25,
            "totals_3_5": ev_o35,
            "btts": ev_btts,
        },
        "artifacts": {
            "gbm_club_v4_0_sha256": hashlib.sha256(GBM_V40_OUT.read_bytes()).hexdigest(),
            "model_club_goals_v4_0_sha256": hashlib.sha256(GOALS_V40_OUT.read_bytes()).hexdigest(),
            "club_state_v4_0_sha256": hashlib.sha256(STATE_V40_OUT.read_bytes()).hexdigest(),
        },
    }
    RESULTS_OUT.write_text(json.dumps(results_payload, indent=2), encoding="utf-8")

    with TRIAL_REGISTRY_OUT.open("a", encoding="utf-8") as fh:
        fh.write(
            json.dumps(
                {
                    "recorded_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "experiment_id": "EXP_V43_soccer_v4_0_core",
                    "holdout_touched": False,
                    "dll_1x2_all": round(ev_1x2_all["delta_ll_vs_benchmark"], 6),
                    "dll_1x2_mex": round(ev_1x2_mex["delta_ll_vs_benchmark"], 6),
                    "max_cone_err_v40": max_cone_err_v40,
                }
            )
            + "\n"
        )
    print(f"[DONE] EXP_V43 guardado en {RESULTS_OUT.name}")


if __name__ == "__main__":
    main()
