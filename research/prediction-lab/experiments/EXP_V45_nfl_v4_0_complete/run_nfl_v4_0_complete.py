"""EXP_V45 — NFL `Minkowski v4.0`: PMF Discreta de Números Clave (`3, 6, 7, 10, 14`), Corrección `ECE` en Totales y Backtest Real PBP de Player Props.

Resuelve de raíz los tres cuellos de botella de NFL detectados en `EXP_V39` y `EXP_V41`:
  1. Desacopla la volatilidad física del juego (`sigma_game_physical ≈ 13.4`, calibrada sobre líneas fijas
     objetivas con `ECE < 1.5%`) de la contracción Bayesiana hacia línea de mercado (`mu_post = w_m * T_model + (1 - w_m) * L_mkt`),
     eliminando el `sigma_total = 26.0` (`ECE = 4.04%`) de `v3.5`.
  2. Construye desde resultados históricos NFL (`<= 2019`, `< 2025-02-02`) el kernel discreto empírico de márgenes
     `|M| in 1..45` con inclinación exponencial exacta `q(m | theta) ∝ k_|m| * exp(theta * m)` resuelta por bisección 1D:
       * Preserva exactamente `(pHome, pTie, pAway)` del ensamble Minkowski (`< 1e-14`).
       * Reproduce los picos reales en `±3 (~15%)`, `±6`, `±7 (~9%)`, `±10`, `±14` y el `push` exacto en `-3.0` y `-7.0`.
  3. Ejecuta un backtest walk-forward real (`2014..2024`, corte duro `game_date < 2025-02-02`) sobre los `13` parquets
     locales de jugadas `pbp_pruned_2012..2024.parquet` para `QB Pass Attempts`, `QB Completions` y `RB Rush Attempts`
     con Reasignación Bayesiana de Volumen por Baja (`Vacancy Carry Redistribution`).
"""

from __future__ import annotations

import os

os.environ.setdefault("OMP_NUM_THREADS", "4")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")

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
from scipy.special import erf
from sklearn.linear_model import PoissonRegressor, Ridge

EXP_DIR = Path(__file__).resolve().parent
REPO_ROOT = EXP_DIR.parents[3]
PRED_LAB_ROOT = REPO_ROOT / "research" / "prediction-lab"
EXP_V32_DIR = PRED_LAB_ROOT / "experiments" / "EXP_V32_nfl_epa"
EXP_V39_DIR = PRED_LAB_ROOT / "experiments" / "EXP_V39_nfl_v3_5_engines"
EXP_V40_DIR = PRED_LAB_ROOT / "experiments" / "EXP_V40_soccer_micro_markets"
ARTIFACTS_DIR = EXP_DIR / "artifacts"

for _p in (str(REPO_ROOT), str(EXP_V32_DIR), str(EXP_V39_DIR), str(EXP_V40_DIR), str(EXP_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from services.models import export_gbm_ts as eg  # noqa: E402
from services.models import outlook_calibration as oc  # noqa: E402
from pbp_ingest import HOLDOUT_CUT_DATE, HOLDOUT_CUT_ISO, assert_dates_strictly_before_holdout  # noqa: E402
BOOTSTRAP_SAMPLES = 1000
BOOTSTRAP_SEED = 20261111
FIRST_TRAIN_SEASON = 1999
FIRST_EVAL_SEASON = 2010
VAL_MAX_SEASON = 2019
from run_micro_markets_experiment import (  # noqa: E402
    _estimate_nb_dispersion_mom,
    line_probs_from_pmf,
    nb_pmf_exact,
    paired_bootstrap_binary,
)

KEY_NUMBERS_MODEL_OUT = REPO_ROOT / "src" / "data" / "prediction" / "model_nfl_key_numbers_v4_0_candidate.json"
NFL_PROPS_MODEL_OUT = REPO_ROOT / "src" / "data" / "prediction" / "model_nfl_props_v4_0_candidate.json"
NFL_V4_SNAPSHOT_OUT = REPO_ROOT / "src" / "data" / "prediction" / "nfl_v4_0_snapshot.json"
RESULTS_OUT = ARTIFACTS_DIR / "exp_v45_nfl_v4_0_results.json"
TRIAL_REGISTRY_OUT = EXP_DIR / "trial_registry_nfl_v40.jsonl"

MAX_ABS_MARGIN = 45
OBJECTIVE_TOTAL_LINES: tuple[float, ...] = (37.5, 40.5, 43.5, 44.5, 47.5, 50.5)
KEY_SPREAD_EVAL_LINES: tuple[float, ...] = (-7.5, -6.5, -3.5, -2.5, 2.5, 3.5, 6.5, 7.5)


def normal_cdf_scalar(x: float) -> float:
    """Espejo exacto IEEE-754 de `src/domain/prediction/math.ts::normalCdf` (Abramowitz & Stegun 7.1.26)."""
    xf = float(x)
    sign = -1.0 if xf < 0.0 else 1.0
    z = abs(xf) * 0.7071067811865475
    t = 1.0 / (1.0 + 0.3275911 * z)
    poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t
    erf_val = sign * (1.0 - poly * math.exp(-(z * z)))
    return 0.5 * (1.0 + erf_val)


def normal_cdf_vec(x: np.ndarray) -> np.ndarray:
    return 0.5 * (1.0 + erf(np.asarray(x, dtype=np.float64) / math.sqrt(2.0)))


def compute_normal_total_prob_scalar(line: float, expected_total: float, sigma: float) -> tuple[float, float, float]:
    """Réplica escalar exacta (`p_over, p_under, p_push`) con corrección de continuidad en líneas enteras."""
    ln = float(line)
    et = float(expected_total)
    sg = max(float(sigma), 1.0)
    if abs(ln - round(ln)) < 1e-9:
        thr = round(ln)
        p_ov = 1.0 - normal_cdf_scalar((thr + 0.5 - et) / sg)
        p_un = normal_cdf_scalar((thr - 0.5 - et) / sg)
        p_push = max(0.0, 1.0 - p_ov - p_un)
        return p_ov, p_un, p_push
    p_ov = min(max(normal_cdf_scalar((et - ln) / sg), 1e-9), 1.0 - 1e-9)
    return p_ov, 1.0 - p_ov, 0.0


def build_empirical_positive_margin_kernel(home_scores: np.ndarray, away_scores: np.ndarray) -> np.ndarray:
    """Estima en `VAL <= 2019` la distribución condicional `P(|M| = m | M != 0)` en `m = 1..45`."""
    abs_m = np.abs(np.round(home_scores - away_scores).astype(int))
    abs_m = abs_m[abs_m > 0]
    abs_m = np.minimum(abs_m, MAX_ABS_MARGIN)
    counts = np.full(MAX_ABS_MARGIN, 0.35, dtype=np.float64)  # suavizado Laplace ligero
    for v in abs_m:
        counts[int(v) - 1] += 1.0
    counts /= float(np.sum(counts))
    return counts


def solve_nfl_key_number_margin_pmf_exact(
    p_home: float,
    p_tie: float,
    p_away: float,
    pos_kernel_45: np.ndarray,
) -> dict[str, Any]:
    """Resuelve por bisección 1D exacta de 56 pasos la inclinación exponencial `theta` tal que:
      - `P(M > 0) == p_home`, `P(M == 0) == p_tie`, `P(M < 0) == p_away` (`< 1e-14`)
      - Preserva los picos discretos reales en `±3, ±6, ±7, ±10, ±14`.
    """
    ph = max(float(p_home), 1e-9)
    pt = max(float(p_tie), 1e-9)
    pa = max(float(p_away), 1e-9)
    s3 = ph + pt + pa
    ph /= s3
    pt /= s3
    pa /= s3

    non_tie = ph + pa
    target_cond = min(max(ph / max(non_tie, 1e-12), 1e-6), 1.0 - 1e-6)

    lo = -0.65
    hi = 0.65
    for _ in range(56):
        mid = 0.5 * (lo + hi)
        pos_s = 0.0
        neg_s = 0.0
        for idx in range(MAX_ABS_MARGIN):
            m = float(idx + 1)
            km = float(pos_kernel_45[idx])
            pos_s += km * math.exp(mid * m)
            neg_s += km * math.exp(-mid * m)
        ratio = pos_s / max(pos_s + neg_s, 1e-30)
        if ratio < target_cond:
            lo = mid
        else:
            hi = mid
    theta = 0.5 * (lo + hi)

    pmf = np.zeros(2 * MAX_ABS_MARGIN + 1, dtype=np.float64)
    center = MAX_ABS_MARGIN
    pmf[center] = pt

    pos_s = 0.0
    neg_s = 0.0
    for idx in range(MAX_ABS_MARGIN):
        m = float(idx + 1)
        km = float(pos_kernel_45[idx])
        pos_s += km * math.exp(theta * m)
        neg_s += km * math.exp(-theta * m)

    inv_den = non_tie / max(pos_s + neg_s, 1e-30)
    expected_margin = 0.0
    for idx in range(MAX_ABS_MARGIN):
        m_int = idx + 1
        m_f = float(m_int)
        km = float(pos_kernel_45[idx])
        p_pos = km * math.exp(theta * m_f) * inv_den
        p_neg = km * math.exp(-theta * m_f) * inv_den
        pmf[center + m_int] = p_pos
        pmf[center - m_int] = p_neg
        expected_margin += m_f * (p_pos - p_neg)

    return {
        "theta": theta,
        "expected_margin": expected_margin,
        "pmf": pmf,
    }


def project_spread_from_margin_pmf_exact(pmf: np.ndarray, spread_home: float) -> dict[str, float]:
    """Evalúa `P(Margin + spreadHome > 0)` con masa exacta de `push` en líneas enteras (`-3.0, -7.0`)."""
    center = MAX_ABS_MARGIN
    sh = float(spread_home)
    p_h_cov = 0.0
    p_a_cov = 0.0
    p_push = 0.0
    for idx in range(len(pmf)):
        p = float(pmf[idx])
        if p <= 0.0:
            continue
        val = float(idx - center) + sh
        if abs(val) < 1e-9:
            p_push += p
        elif val > 0.0:
            p_h_cov += p
        else:
            p_a_cov += p
    act = p_h_cov + p_a_cov
    ph_np = min(max(p_h_cov / act, 0.001), 0.999) if act > 1e-12 else 0.5
    return {
        "spreadHome": sh,
        "pHomeCover": p_h_cov,
        "pAwayCover": p_a_cov,
        "pPush": p_push,
        "pHomeCoverNoPush": ph_np,
        "pAwayCoverNoPush": 1.0 - ph_np,
    }


def _extract_pbp_player_game_logs(seasons: range) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Extrae de `pbp_pruned_2012..2024.parquet` (`< 2025-02-02`) las actuaciones reales por juego de QBs y corredores."""
    raw_dir = EXP_V32_DIR / "raw_cache"
    qb_parts: list[pd.DataFrame] = []
    rush_parts: list[pd.DataFrame] = []

    for yr in seasons:
        pq = raw_dir / f"pbp_pruned_{yr}.parquet"
        if not pq.exists():
            continue
        df = pd.read_parquet(
            pq,
            columns=[
                "game_id",
                "season",
                "week",
                "game_date",
                "posteam",
                "defteam",
                "aborted_play",
                "two_point_attempt",
                "pass_attempt",
                "complete_pass",
                "sack",
                "rush_attempt",
                "qb_scramble",
                "cpoe",
                "passer_player_id",
                "rusher_player_id",
            ],
        )
        df["gd_str"] = df["game_date"].astype(str).str.slice(0, 10)
        df = df[df["gd_str"] < HOLDOUT_CUT_DATE].copy()
        if bool((df["gd_str"] >= HOLDOUT_CUT_DATE).any()):
            raise RuntimeError(f"HoldoutSealedAccessError en pbp_pruned_{yr}.parquet")

        valid_play = (df["aborted_play"].fillna(0.0) == 0.0) & (df["two_point_attempt"].fillna(0.0) == 0.0)
        df = df[valid_play & df["posteam"].notna() & df["defteam"].notna()].copy()

        # QBs (`passer_player_id` presente; `pass_attempt == 1` y `sack == 0` son intentos oficiales de pase)
        p_sub = df[df["passer_player_id"].notna()].copy()
        p_sub["official_att"] = ((p_sub["pass_attempt"].fillna(0.0) == 1.0) & (p_sub["sack"].fillna(0.0) == 0.0)).astype(np.float64)
        p_sub["comp"] = p_sub["complete_pass"].fillna(0.0).astype(np.float64)
        p_sub["sk"] = p_sub["sack"].fillna(0.0).astype(np.float64)
        p_sub["cpoe_clean"] = pd.to_numeric(p_sub["cpoe"], errors="coerce")
        qb_g = (
            p_sub.groupby(["game_id", "season", "week", "gd_str", "posteam", "defteam", "passer_player_id"], as_index=False)
            .agg(
                pass_attempts=("official_att", "sum"),
                completions=("comp", "sum"),
                sacks=("sk", "sum"),
                cpoe_mean=("cpoe_clean", "mean"),
            )
        )
        qb_parts.append(qb_g)

        # Rushers (`rusher_player_id` presente y `rush_attempt == 1` y `qb_scramble == 0` para acarreos diseñados)
        r_sub = df[df["rusher_player_id"].notna() & (df["rush_attempt"].fillna(0.0) == 1.0)].copy()
        rush_g = (
            r_sub.groupby(["game_id", "season", "week", "gd_str", "posteam", "defteam", "rusher_player_id"], as_index=False)
            .agg(rush_attempts=("rush_attempt", "sum"), scrambles=("qb_scramble", "sum"))
        )
        rush_parts.append(rush_g)

    qb_df = pd.concat(qb_parts, ignore_index=True).sort_values(["gd_str", "game_id", "pass_attempts"], ascending=[True, True, False], kind="mergesort")
    rush_df = pd.concat(rush_parts, ignore_index=True).sort_values(["gd_str", "game_id", "rush_attempts"], ascending=[True, True, False], kind="mergesort")
    return qb_df, rush_df


def _evaluate_nfl_props_walk_forward(
    qb_df: pd.DataFrame,
    rush_df: pd.DataFrame,
    game_script_map: dict[tuple[str, str], float],
) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]]]:
    """Ejecuta el backtest walk-forward real `OOS 2020..2024` de NFL Player Props con Reasignación por Baja."""
    # 1. QB titulares (`pass_attempts >= 15` para filtrar jugadas truco / relevos residuales de 2 pases)
    qb_starters = qb_df[qb_df["pass_attempts"] >= 15.0].drop_duplicates(["game_id", "posteam"], keep="first").copy()
    qb_starters = qb_starters.sort_values(["gd_str", "game_id", "posteam"], kind="mergesort").reset_index(drop=True)

    alpha_p = 2.0 / 9.0
    alpha_t = 2.0 / 13.0
    qb_att_ewm: dict[str, float] = {}
    qb_cmp_ewm: dict[str, float] = {}
    qb_cpoe_ewm: dict[str, float] = {}
    qb_n: dict[str, int] = defaultdict(int)
    tm_att_ewm: dict[str, float] = {}
    def_att_allowed_ewm: dict[str, float] = {}

    n_qb = len(qb_starters)
    X_att = np.zeros((n_qb, 4), dtype=np.float64)
    X_cmp = np.zeros((n_qb, 4), dtype=np.float64)
    raw_ewm_att = np.zeros(n_qb, dtype=np.float64)
    raw_ewm_cmp = np.zeros(n_qb, dtype=np.float64)

    for i, r in enumerate(qb_starters.itertuples(index=False)):
        pid = str(r.passer_player_id)
        tm = str(r.posteam)
        opp = str(r.defteam)
        gid = str(r.game_id)

        n_p = qb_n[pid]
        tm_base = tm_att_ewm.get(tm, 34.0)
        p_att_eb = (n_p * qb_att_ewm.get(pid, tm_base) + 4.0 * tm_base) / (n_p + 4.0)
        p_cmp_eb = (n_p * qb_cmp_ewm.get(pid, 21.8) + 4.0 * 21.8) / (n_p + 4.0)
        cpoe_eb = (n_p * qb_cpoe_ewm.get(pid, 0.0) + 5.0 * 0.0) / (n_p + 5.0)
        opp_def_exc = (def_att_allowed_ewm.get(opp, 34.0) - 34.0) / 10.0

        # Guion esperado: si el equipo proyecta ir abajo (`exp_margin < 0`), lanza más en el 2T
        exp_m = game_script_map.get((gid, tm), 0.0)
        trailing_idx = -exp_m / 7.0

        X_att[i] = [math.log(max(p_att_eb, 12.0)), (tm_base - 34.0) / 10.0, opp_def_exc, trailing_idx]
        X_cmp[i] = [math.log(max(p_cmp_eb, 8.0)), (tm_base - 34.0) / 10.0, cpoe_eb / 10.0, trailing_idx]
        raw_ewm_att[i] = qb_att_ewm.get(pid, 34.0)
        raw_ewm_cmp[i] = qb_cmp_ewm.get(pid, 21.8)

        # Post-game update (`w' < w`)
        obs_a = float(r.pass_attempts)
        obs_c = float(r.completions)
        obs_cp = float(r.cpoe_mean) if pd.notna(r.cpoe_mean) else 0.0
        qb_att_ewm[pid] = alpha_p * obs_a + (1.0 - alpha_p) * qb_att_ewm.get(pid, obs_a)
        qb_cmp_ewm[pid] = alpha_p * obs_c + (1.0 - alpha_p) * qb_cmp_ewm.get(pid, obs_c)
        qb_cpoe_ewm[pid] = alpha_p * min(max(obs_cp, -15.0), 15.0) + (1.0 - alpha_p) * qb_cpoe_ewm.get(pid, 0.0)
        qb_n[pid] += 1
        tm_att_ewm[tm] = alpha_t * obs_a + (1.0 - alpha_t) * tm_base
        def_att_allowed_ewm[opp] = alpha_t * obs_a + (1.0 - alpha_t) * def_att_allowed_ewm.get(opp, 34.0)

    # 2. Corredores principales con Reasignación Bayesiana de Acarreos por Baja (`Injury Vacancy Redistribution`)
    rush_grp = list(rush_df.groupby(["gd_str", "game_id", "season", "posteam", "defteam"], sort=False))
    rb_ewm_carries: dict[str, float] = {}
    rb_ewm_share: dict[str, float] = {}
    rb_n: dict[str, int] = defaultdict(int)
    tm_rush_tot_ewm: dict[str, float] = {}
    def_rush_allowed_ewm: dict[str, float] = {}
    tm_recent_roster: dict[str, dict[str, float]] = defaultdict(dict)  # pid -> recent carry share

    rush_records: list[dict[str, Any]] = []
    for (gd_s, gid, seas, tm, opp), sub in rush_grp:
        # Filtrar corredores diseñados (`scrambles / rush_attempts <= 0.35`)
        sub_rb = sub[sub["scrambles"] <= 0.35 * sub["rush_attempts"]].copy()
        if sub_rb.empty:
            continue
        tot_rb_carries = float(sub_rb["rush_attempts"].sum())
        active_pids = [str(x) for x in sub_rb["rusher_player_id"].tolist()]
        active_set = set(active_pids)

        # Detectar volumen vacante (`RB` que tenía `>= 0.30` de cuota reciente en el equipo y NO está activo hoy)
        prev_shares = tm_recent_roster.get(str(tm), {})
        vacated_share = sum(sh for pid_prev, sh in prev_shares.items() if sh >= 0.30 and pid_prev not in active_set)
        vacated_share = min(vacated_share, 0.75)

        tm_r_base = tm_rush_tot_ewm.get(str(tm), 24.5)
        opp_r_exc = (def_rush_allowed_ewm.get(str(opp), 24.5) - 24.5) / 8.0
        exp_m = game_script_map.get((str(gid), str(tm)), 0.0)
        leading_idx = exp_m / 7.0

        # Evaluar al corredor principal activo (mayor prioridad pre-partido)
        active_priors = []
        for pid in active_pids:
            np_r = rb_n[pid]
            c_eb = (np_r * rb_ewm_carries.get(pid, 9.5) + 4.0 * 9.5) / (np_r + 4.0)
            sh_eb = (np_r * rb_ewm_share.get(pid, 0.36) + 4.0 * 0.36) / (np_r + 4.0)
            active_priors.append((c_eb, sh_eb, pid))
        active_priors.sort(key=lambda t: t[0], reverse=True)
        top_c_eb, top_sh_eb, top_pid = active_priors[0]
        obs_top = float(sub_rb.loc[sub_rb["rusher_player_id"].astype(str) == top_pid, "rush_attempts"].iloc[0])

        if rb_n[top_pid] >= 2:
            rush_records.append(
                {
                    "season": int(seas),
                    "game_id": str(gid),
                    "team": str(tm),
                    "player_id": top_pid,
                    "obs_carries": obs_top,
                    "raw_ewm": rb_ewm_carries.get(top_pid, 12.0),
                    "log_eb_carries": math.log(max(top_c_eb, 3.0)),
                    "vacated_share": vacated_share,
                    "opp_rush_exc": opp_r_exc,
                    "leading_script": leading_idx,
                    "tm_rush_exc": (tm_r_base - 24.5) / 8.0,
                }
            )

        # Actualizar estado post-partido (`w' < w`)
        new_roster_sh: dict[str, float] = {k: 0.75 * v for k, v in prev_shares.items() if 0.75 * v >= 0.08}
        for r_row in sub_rb.itertuples(index=False):
            pid = str(r_row.rusher_player_id)
            obs_r = float(r_row.rush_attempts)
            sh_obs = obs_r / max(tot_rb_carries, 1.0)
            rb_ewm_carries[pid] = alpha_p * obs_r + (1.0 - alpha_p) * rb_ewm_carries.get(pid, obs_r)
            rb_ewm_share[pid] = alpha_p * sh_obs + (1.0 - alpha_p) * rb_ewm_share.get(pid, sh_obs)
            rb_n[pid] += 1
            new_roster_sh[pid] = 0.55 * sh_obs + 0.45 * prev_shares.get(pid, sh_obs)
        tm_recent_roster[str(tm)] = new_roster_sh
        tm_rush_tot_ewm[str(tm)] = alpha_t * tot_rb_carries + (1.0 - alpha_t) * tm_r_base
        def_rush_allowed_ewm[str(opp)] = alpha_t * tot_rb_carries + (1.0 - alpha_t) * def_rush_allowed_ewm.get(str(opp), 24.5)

    rb_lead_df = pd.DataFrame(rush_records)

    # Walk-forward evaluación OOS 2020..2024 para los 3 mercados reales NFL Props
    prop_specs = [
        (
            "pass_attempts",
            32.5,
            58,
            qb_starters["season"].to_numpy(dtype=int),
            X_att,
            qb_starters["pass_attempts"].to_numpy(dtype=np.float64),
            raw_ewm_att,
            ["log_qb_att_eb", "team_pass_vol_exc", "opp_pass_def_exc", "trailing_script_idx"],
        ),
        (
            "completions",
            20.5,
            46,
            qb_starters["season"].to_numpy(dtype=int),
            X_cmp,
            qb_starters["completions"].to_numpy(dtype=np.float64),
            raw_ewm_cmp,
            ["log_qb_cmp_eb", "team_pass_vol_exc", "qb_cpoe_scaled", "trailing_script_idx"],
        ),
        (
            "rush_attempts",
            13.5,
            40,
            rb_lead_df["season"].to_numpy(dtype=int),
            rb_lead_df[["log_eb_carries", "vacated_share", "opp_rush_exc", "leading_script"]].to_numpy(dtype=np.float64),
            rb_lead_df["obs_carries"].to_numpy(dtype=np.float64),
            rb_lead_df["raw_ewm"].to_numpy(dtype=np.float64),
            ["log_rb_carries_eb", "injury_vacated_share", "opp_rush_def_exc", "leading_script_idx"],
        ),
    ]

    props_models_json: dict[str, Any] = {}
    props_eval_json: dict[str, Any] = {}
    props_snap_rows: list[dict[str, Any]] = []

    for m_name, line_v, max_k, seas_v, X_m, y_m, raw_ewm_m, f_names in prop_specs:
        val_m = (seas_v >= 2014) & (seas_v <= VAL_MAX_SEASON)
        oos_m = seas_v >= 2020

        pr_val = PoissonRegressor(alpha=0.02, max_iter=600).fit(X_m[val_m], y_m[val_m])
        mu_val = np.clip(pr_val.predict(X_m[val_m]), 1.0, 50.0)
        r_disp = _estimate_nb_dispersion_mom(y_m[val_m], mu_val)

        mu_oos = np.empty(int(np.sum(oos_m)), dtype=np.float64)
        pos = 0
        for yr in sorted(set(int(s) for s in seas_v[oos_m])):
            tr_f = (seas_v >= 2013) & (seas_v < yr)
            te_f = seas_v == yr
            cnt = int(np.sum(te_f))
            prf = PoissonRegressor(alpha=0.02, max_iter=600).fit(X_m[tr_f], y_m[tr_f])
            mu_oos[pos : pos + cnt] = np.clip(prf.predict(X_m[te_f]), 1.0, 50.0)
            pos += cnt

        y_oos = y_m[oos_m]
        raw_oos = np.clip(raw_ewm_m[oos_m], 1.0, 50.0)
        y_bin_oos = (y_oos > line_v).astype(np.float64)

        p_v4_oos = np.array([line_probs_from_pmf(nb_pmf_exact(float(m), r_disp, max_k), line_v)[0] for m in mu_oos])
        # Baseline ingenuo: Poisson simple sobre EWMA cruda sin guion ni reasignación por baja
        p_raw_oos = np.array([line_probs_from_pmf(nb_pmf_exact(float(m), 180.0, max_k), line_v)[0] for m in raw_oos])

        boot_prop = paired_bootstrap_binary(y_bin_oos, p_v4_oos, p_raw_oos)
        mae_v4 = float(np.mean(np.abs(mu_oos - y_oos)))
        mae_raw = float(np.mean(np.abs(raw_oos - y_oos)))

        # Subconjunto específico de partidos con baja de RB (`vacated_share >= 0.30`)
        vac_eval = None
        if m_name == "rush_attempts":
            vac_m = X_m[oos_m, 1] >= 0.30
            if int(np.sum(vac_m)) >= 30:
                vac_eval = {
                    "n_vacancy_games": int(np.sum(vac_m)),
                    "mae_v4_with_redistribution": round(float(np.mean(np.abs(mu_oos[vac_m] - y_oos[vac_m]))), 4),
                    "mae_raw_without_redistribution": round(float(np.mean(np.abs(raw_oos[vac_m] - y_oos[vac_m]))), 4),
                }

        pr_full = PoissonRegressor(alpha=0.02, max_iter=600).fit(X_m[seas_v >= 2013], y_m[seas_v >= 2013])
        props_models_json[m_name] = {
            "canonical_line": line_v,
            "max_k": max_k,
            "dispersion_r": round(r_disp, 6),
            "feature_names": f_names,
            "coef": [float(v) for v in pr_full.coef_.tolist()],
            "intercept": float(pr_full.intercept_),
        }
        props_eval_json[m_name] = {
            "n_oos": int(len(y_oos)),
            "line": line_v,
            "dispersion_r": round(r_disp, 4),
            "mae_v4_0": round(mae_v4, 4),
            "mae_naive_ewma": round(mae_raw, 4),
            "vs_naive_ewma_poisson": boot_prop,
            "vacancy_subset": vac_eval,
        }
        print(
            f"  [NFL Prop {m_name:14s}] OOS n={len(y_oos):,} | MAE: v4.0={mae_v4:.3f} vs Raw={mae_raw:.3f} | "
            f"LL={boot_prop['log_loss']:.5f} (ECE={boot_prop['ece']:.5f}) | dLL={boot_prop['delta_ll']:+.5f} ({boot_prop['significance']})"
        )

        # Guardar 15 ejemplos reales OOS para paridad TypeScript `< 1e-12`
        oos_indices = np.where(oos_m)[0][:15]
        for r_idx in oos_indices:
            xf = [float(v) for v in X_m[r_idx].tolist()]
            eta = float(pr_full.intercept_)
            for k_i, cv in enumerate(pr_full.coef_.tolist()):
                eta += float(cv) * xf[k_i]
            mu_ex = min(max(math.exp(eta), 1.0), 50.0)
            po, pu, pp = line_probs_from_pmf(nb_pmf_exact(mu_ex, round(r_disp, 6), max_k), line_v)
            props_snap_rows.append(
                {
                    "market": m_name,
                    "line": line_v,
                    "features4": xf,
                    "expected_mu": mu_ex,
                    "expected_p_over": po,
                    "expected_p_under": pu,
                    "expected_p_push": pp,
                }
            )

    return props_models_json, props_eval_json, props_snap_rows


def main() -> None:
    sys.modules.pop("run_experiment", None)
    from run_nfl_v3_5_engines import (  # noqa: E402
        NFL_TOTALS_12_FEATURES,
        attach_causal_v35_nfl_features,
        build_or_load_v35_pbp_game_metrics,
    )

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    dev_41 = pd.read_parquet(EXP_V32_DIR / "artifacts" / "nfl_dev_causal_41_features.parquet")
    assert_dates_strictly_before_holdout(dev_41["gameday"], context="EXP_V45_dev_41")

    v35_tg = build_or_load_v35_pbp_game_metrics()
    wf_df, _ = attach_causal_v35_nfl_features(dev_41, v35_tg)

    gbm_v35 = json.loads((REPO_ROOT / "src" / "data" / "prediction" / "gbm_nfl_v3_5_candidate.json").read_text(encoding="utf-8"))
    tot_v35 = json.loads((REPO_ROOT / "src" / "data" / "prediction" / "model_nfl_totals_v3_5_candidate.json").read_text(encoding="utf-8"))

    eval_df = wf_df[wf_df["season"] >= FIRST_EVAL_SEASON].copy().reset_index(drop=True)
    seasons_ev = eval_df["season"].to_numpy(dtype=int)
    val_m = seasons_ev <= VAL_MAX_SEASON
    oos_m = seasons_ev >= 2020

    hs_ev = eval_df["home_score"].to_numpy(dtype=np.float64)
    as_ev = eval_df["away_score"].to_numpy(dtype=np.float64)
    margin_ev = hs_ev - as_ev
    tot_ev = hs_ev + as_ev
    tot_line = pd.to_numeric(eval_df["total_line"], errors="coerce").to_numpy(dtype=np.float64)

    # 1. Kernel empírico de Números Clave NFL aprendido estrictamente en `<= 2019` (`FIRST_TRAIN_SEASON..VAL_MAX_SEASON`)
    hist_pre2020 = wf_df[wf_df["season"] <= VAL_MAX_SEASON]
    pos_kernel_45 = build_empirical_positive_margin_kernel(
        hist_pre2020["home_score"].to_numpy(dtype=np.float64),
        hist_pre2020["away_score"].to_numpy(dtype=np.float64),
    )
    print(
        f"[EXP_V45] Masa condicional en números clave NFL (<=2019): "
        f"|M|=3: {100.0*pos_kernel_45[2]:.2f}%, |M|=7: {100.0*pos_kernel_45[6]:.2f}%, "
        f"|M|=6: {100.0*pos_kernel_45[5]:.2f}%, |M|=10: {100.0*pos_kernel_45[9]:.2f}%, |M|=14: {100.0*pos_kernel_45[13]:.2f}%"
    )

    # Walk-forward de probabilidades Moneyline 3-way y Totals Ridge para evaluar PMF de números clave y Totales calibrados
    sel_cols = list(gbm_v35["features"])
    P3_oof = np.zeros((len(eval_df), 3), dtype=np.float64)
    T_model_oof = np.zeros(len(eval_df), dtype=np.float64)

    from run_nfl_v3_5_engines import (  # noqa: E402
        _apply_temperature_3way_exact,
        _blend_3way_exact,
        fit_binary_minkowski_hgb,
        fit_minkowski_logit_pipeline,
        predict_binary_hgb_lifted_3way,
        predict_logit_3way_exact,
    )
    from sklearn.impute import SimpleImputer
    from sklearn.preprocessing import StandardScaler

    c_reg = float(gbm_v35["logit_companion"]["regularization_C"])
    temp_v = float(gbm_v35["calibration"]["temperature"])
    b_sp = str(gbm_v35["calibration"]["blend_space"])
    wl_v = float(gbm_v35["calibration"]["w_logit"])
    wg_v = float(gbm_v35["calibration"]["w_gbm"])
    alpha_tot = float(tot_v35["alpha"])

    pos_i = 0
    for yr in sorted(eval_df["season"].unique()):
        tr = wf_df[(wf_df["season"] >= FIRST_TRAIN_SEASON) & (wf_df["season"] < yr)]
        te = eval_df[eval_df["season"] == yr]
        cnt = len(te)
        sw = 0.5 ** ((yr - 1 - tr["season"].to_numpy(dtype=np.float64)) / 10.0)
        y_tr = tr["y"].to_numpy(dtype=int)

        X_tr = tr[sel_cols].to_numpy(dtype=np.float64)
        X_te = te[sel_cols].to_numpy(dtype=np.float64)
        imp = SimpleImputer(strategy="mean").fit(X_tr)
        pipe = fit_minkowski_logit_pipeline(imp.transform(X_tr), y_tr, c_reg, sample_weight=sw)
        pl = predict_logit_3way_exact(pipe, imp.transform(X_te))
        hgb_b, tau_b = fit_binary_minkowski_hgb(X_tr, y_tr, sample_weight=sw)
        pg = _apply_temperature_3way_exact(predict_binary_hgb_lifted_3way(hgb_b, tau_b, X_te), temp_v)
        P3_oof[pos_i : pos_i + cnt] = _blend_3way_exact(pl, pg, wl_v, wg_v, b_sp)

        Xt_tr = tr[NFL_TOTALS_12_FEATURES].to_numpy(dtype=np.float64)
        Xt_te = te[NFL_TOTALS_12_FEATURES].to_numpy(dtype=np.float64)
        impt = SimpleImputer(strategy="median").fit(Xt_tr)
        sct = StandardScaler().fit(impt.transform(Xt_tr))
        sct.scale_ = np.where(sct.scale_ == 0.0, 1.0, sct.scale_)
        rg = Ridge(alpha=alpha_tot).fit(sct.transform(impt.transform(Xt_tr)), (tr["home_score"] + tr["away_score"]).to_numpy(dtype=np.float64), sample_weight=sw)
        T_model_oof[pos_i : pos_i + cnt] = np.clip(rg.predict(sct.transform(impt.transform(Xt_te))), 30.0, 64.0)
        pos_i += cnt

    # 2. Evaluación OOS 2020..2024 de PMF Discreta de Números Clave vs Gaussiana Continua `v3.5` (`sigma_margin = 13.8`)
    # sobre las 8 líneas clave estándar alrededor de ±3 y ±7 (`-7.5, -6.5, -3.5, -2.5, +2.5, +3.5, +6.5, +7.5`)
    sigma_gauss_margin = 13.8
    y_spread_stack: list[np.ndarray] = []
    p_key_stack: list[np.ndarray] = []
    p_gauss_stack: list[np.ndarray] = []

    oos_idx = np.where(oos_m)[0]
    pmfs_oos = [
        solve_nfl_key_number_margin_pmf_exact(float(P3_oof[i, 0]), float(P3_oof[i, 1]), float(P3_oof[i, 2]), pos_kernel_45)
        for i in oos_idx
    ]
    # Gaussiana v3.5 usa `mu_margin = sigma * Phi^-1(pHome / (pHome + pAway))`
    from scipy.special import ndtri

    p_win_oos = np.clip(P3_oof[oos_idx, 0] / np.maximum(P3_oof[oos_idx, 0] + P3_oof[oos_idx, 2], 1e-12), 1e-6, 1.0 - 1e-6)
    mu_gauss_oos = sigma_gauss_margin * ndtri(p_win_oos)
    m_oos = margin_ev[oos_idx]

    for sp_ln in KEY_SPREAD_EVAL_LINES:
        y_sp = (m_oos + sp_ln > 0.0).astype(np.float64)
        pk = np.array([project_spread_from_margin_pmf_exact(sol["pmf"], sp_ln)["pHomeCoverNoPush"] for sol in pmfs_oos])
        pg = normal_cdf_vec((mu_gauss_oos + sp_ln) / sigma_gauss_margin)
        y_spread_stack.append(y_sp)
        p_key_stack.append(pk)
        p_gauss_stack.append(pg)

    ev_key_spreads = paired_bootstrap_binary(
        np.concatenate(y_spread_stack),
        np.concatenate(p_key_stack),
        np.concatenate(p_gauss_stack),
    )
    print(
        f"\n=== NFL KEY-NUMBER DISCRETE PMF v4.0 vs GAUSSIAN v3.5 (OOS 2020..2024 x 8 Key Lines, n={ev_key_spreads['n']:,}) ===\n"
        f"  Spread Cover LL: Gaussian={ev_key_spreads['benchmark_log_loss']:.5f} -> Key-Number PMF={ev_key_spreads['log_loss']:.5f} "
        f"(ECE={ev_key_spreads['ece']:.5f}) | dLL={ev_key_spreads['delta_ll']:+.5f} ({ev_key_spreads['significance']})"
    )

    # 3. Calibración Desacoplada de `Totals v4.0` en `VAL 2010..2019`:
    #    (A) `sigma_game_physical` sobre líneas objetivas fijas (`37.5..50.5`)
    #    (B) `(w_model, sigma_market_post)` cuando existe `total_line` real de Vegas
    best_sigma_phys = 13.5
    best_phys_ll = float("inf")
    for sg_try in (12.4, 13.0, 13.5, 14.0, 14.8, 16.0):
        ll_acc = 0.0
        for ln_o in OBJECTIVE_TOTAL_LINES:
            yb = (tot_ev[val_m] > ln_o).astype(np.float64)
            pb = np.clip(normal_cdf_vec((T_model_oof[val_m] - ln_o) / sg_try), 1e-9, 1.0 - 1e-9)
            ll_acc += float(-np.mean(yb * np.log(pb) + (1.0 - yb) * np.log(1.0 - pb)))
        if ll_acc < best_phys_ll:
            best_phys_ll = ll_acc
            best_sigma_phys = sg_try

    # Evaluar ECE y LL sobre líneas objetivas en OOS 2020..2024: `sigma_phys (~13.5)` vs `sigma_v35 (26.0)` vs `Constant(44.5)`
    y_obj_oos = np.concatenate([(tot_ev[oos_m] > ln_o).astype(np.float64) for ln_o in OBJECTIVE_TOTAL_LINES])
    p_obj_v4 = np.concatenate([normal_cdf_vec((T_model_oof[oos_m] - ln_o) / best_sigma_phys) for ln_o in OBJECTIVE_TOTAL_LINES])
    p_obj_v35 = np.concatenate([normal_cdf_vec((T_model_oof[oos_m] - ln_o) / 26.0) for ln_o in OBJECTIVE_TOTAL_LINES])
    p_obj_c44 = np.concatenate([normal_cdf_vec((np.full(int(np.sum(oos_m)), 44.5) - ln_o) / best_sigma_phys) for ln_o in OBJECTIVE_TOTAL_LINES])

    ev_tot_obj_vs_v35 = paired_bootstrap_binary(y_obj_oos, p_obj_v4, p_obj_v35)
    ev_tot_obj_vs_const = paired_bootstrap_binary(y_obj_oos, p_obj_v4, p_obj_c44)

    # Calibrar contracción hacia línea de mercado `mu_post = w_m * T_model + (1 - w_m) * L_mkt` en `VAL <= 2019`
    valid_mkt = np.isfinite(tot_line) & (np.abs(tot_ev - tot_line) > 1e-6)
    val_mkt = valid_mkt & val_m
    oos_mkt = valid_mkt & oos_m
    y_mkt_val = (tot_ev[val_mkt] > tot_line[val_mkt]).astype(np.float64)

    best_wm = 0.15
    best_sg_post = 13.5
    best_mkt_ll = float("inf")
    for wm_try in (0.08, 0.14, 0.20, 0.28, 0.40):
        mu_p = wm_try * T_model_oof[val_mkt] + (1.0 - wm_try) * tot_line[val_mkt]
        for sgp_try in (12.8, 13.4, 14.2):
            p_p = np.array([compute_normal_total_prob_scalar(float(l), float(m), sgp_try)[0] for l, m in zip(tot_line[val_mkt], mu_p)])
            p_a = np.array(
                [
                    p / max(p + compute_normal_total_prob_scalar(float(l), float(m), sgp_try)[1], 1e-12)
                    for p, l, m in zip(p_p, tot_line[val_mkt], mu_p)
                ]
            )
            p_a = np.clip(p_a, 1e-9, 1.0 - 1e-9)
            ll_m = float(-np.mean(y_mkt_val * np.log(p_a) + (1.0 - y_mkt_val) * np.log(1.0 - p_a)))
            if ll_m < best_mkt_ll:
                best_mkt_ll = ll_m
                best_wm = wm_try
                best_sg_post = sgp_try

    y_mkt_oos = (tot_ev[oos_mkt] > tot_line[oos_mkt]).astype(np.float64)
    mu_post_oos = best_wm * T_model_oof[oos_mkt] + (1.0 - best_wm) * tot_line[oos_mkt]
    p_mkt_v4 = np.array(
        [
            compute_normal_total_prob_scalar(float(l), float(m), best_sg_post)[0]
            / max(
                compute_normal_total_prob_scalar(float(l), float(m), best_sg_post)[0]
                + compute_normal_total_prob_scalar(float(l), float(m), best_sg_post)[1],
                1e-12,
            )
            for l, m in zip(tot_line[oos_mkt], mu_post_oos)
        ]
    )
    p_mkt_v35 = np.array(
        [
            compute_normal_total_prob_scalar(float(l), float(m), 26.0)[0]
            / max(
                compute_normal_total_prob_scalar(float(l), float(m), 26.0)[0]
                + compute_normal_total_prob_scalar(float(l), float(m), 26.0)[1],
                1e-12,
            )
            for l, m in zip(tot_line[oos_mkt], T_model_oof[oos_mkt])
        ]
    )
    ev_tot_mkt_vs_v35 = paired_bootstrap_binary(y_mkt_oos, p_mkt_v4, p_mkt_v35)
    print(
        f"\n=== NFL TOTALS v4.0 CALIBRATION ===\n"
        f"  Objective Fixed Lines OOS (sigma_phys={best_sigma_phys}): ECE v3.5(sigma=26)->v4.0 = {ev_tot_obj_vs_v35['ece']:.5f} | "
        f"dLL vs v3.5={ev_tot_obj_vs_v35['delta_ll']:+.5f} ({ev_tot_obj_vs_v35['significance']}) | "
        f"dLL vs Const(44.5)={ev_tot_obj_vs_const['delta_ll']:+.5f} ({ev_tot_obj_vs_const['significance']})\n"
        f"  Market Line Posterior OOS (w_model={best_wm}, sigma_post={best_sg_post}): ECE={ev_tot_mkt_vs_v35['ece']:.5f} | "
        f"dLL vs v3.5={ev_tot_mkt_vs_v35['delta_ll']:+.5f} ({ev_tot_mkt_vs_v35['significance']})"
    )

    # 4. Mapa de guion esperado de partido `(game_id, team) -> expected_margin` para NFL Player Props
    script_map: dict[tuple[str, str], float] = {}
    for i, r in enumerate(eval_df.itertuples(index=False)):
        sol_i = solve_nfl_key_number_margin_pmf_exact(float(P3_oof[i, 0]), float(P3_oof[i, 1]), float(P3_oof[i, 2]), pos_kernel_45)
        em = float(sol_i["expected_margin"])
        script_map[(str(r.game_id), str(r.home_team))] = em
        script_map[(str(r.game_id), str(r.away_team))] = -em

    print("\n=== NFL REAL PBP PLAYER PROPS WALK-FORWARD (2012..2024 < 2025-02-02) ===")
    qb_df, rush_df = _extract_pbp_player_game_logs(range(2012, 2025))
    props_models_json, props_eval_json, props_snap_rows = _evaluate_nfl_props_walk_forward(qb_df, rush_df, script_map)

    # Exportar artefactos v4.0
    key_numbers_art = {
        "schema_version": "nfl_key_numbers_v4.0.0",
        "codename": "PitchLab Minkowski v4.0 Key-Number Discrete PMF & Bayesian Totals",
        "version": "4.0.0-candidate",
        "status": "candidate",
        "production_activated": False,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "max_abs_margin": MAX_ABS_MARGIN,
        "positive_margin_kernel_1_to_45": [round(float(x), 8) for x in pos_kernel_45.tolist()],
        "totals_calibration": {
            "sigma_game_physical": float(best_sigma_phys),
            "market_posterior_w_model": float(best_wm),
            "sigma_market_posterior": float(best_sg_post),
        },
    }
    KEY_NUMBERS_MODEL_OUT.write_text(json.dumps(key_numbers_art, indent=2), encoding="utf-8")

    nfl_props_art = {
        "schema_version": "nfl_player_props_v4.0.0",
        "codename": "PitchLab Minkowski PBP Player Props v4.0",
        "version": "4.0.0-candidate",
        "status": "candidate",
        "production_activated": False,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "markets": props_models_json,
    }
    NFL_PROPS_MODEL_OUT.write_text(json.dumps(nfl_props_art, indent=2), encoding="utf-8")

    # Re-evaluar con el kernel redondeado exacto para el snapshot de paridad `< 1e-12`
    kern_round = np.array(key_numbers_art["positive_margin_kernel_1_to_45"], dtype=np.float64)
    game_snap_rows: list[dict[str, Any]] = []
    for i in oos_idx[:80]:
        ph_i, pt_i, pa_i = float(P3_oof[i, 0]), float(P3_oof[i, 1]), float(P3_oof[i, 2])
        tm_i = float(T_model_oof[i])
        tl_i = float(tot_line[i]) if math.isfinite(float(tot_line[i])) else 44.5
        sol_k = solve_nfl_key_number_margin_pmf_exact(ph_i, pt_i, pa_i, kern_round)
        sp_m3 = project_spread_from_margin_pmf_exact(sol_k["pmf"], -3.0)
        sp_m35 = project_spread_from_margin_pmf_exact(sol_k["pmf"], -3.5)
        sp_p7 = project_spread_from_margin_pmf_exact(sol_k["pmf"], 7.0)

        po_phys, pu_phys, pp_phys = compute_normal_total_prob_scalar(44.5, tm_i, best_sigma_phys)
        mu_post_i = best_wm * tm_i + (1.0 - best_wm) * tl_i
        po_mkt, pu_mkt, pp_mkt = compute_normal_total_prob_scalar(tl_i, mu_post_i, best_sg_post)

        game_snap_rows.append(
            {
                "game_id": str(eval_df.iloc[i]["game_id"]),
                "p_home": ph_i,
                "p_tie": pt_i,
                "p_away": pa_i,
                "t_model": tm_i,
                "market_total_line": tl_i,
                "expected": {
                    "theta": sol_k["theta"],
                    "expected_margin": sol_k["expected_margin"],
                    "p_margin_exact_plus_3": float(sol_k["pmf"][MAX_ABS_MARGIN + 3]),
                    "p_margin_exact_minus_3": float(sol_k["pmf"][MAX_ABS_MARGIN - 3]),
                    "spread_minus_3_0": sp_m3,
                    "spread_minus_3_5": sp_m35,
                    "spread_plus_7_0": sp_p7,
                    "phys_44_5_over": po_phys,
                    "mkt_post_over": po_mkt,
                    "mkt_post_under": pu_mkt,
                    "mkt_post_push": pp_mkt,
                },
            }
        )

    NFL_V4_SNAPSHOT_OUT.write_text(
        json.dumps(
            {
                "schema_version": "nfl_v4.0_parity_snapshot",
                "holdout_sealed_untouched": True,
                "n_games": len(game_snap_rows),
                "n_props": len(props_snap_rows),
                "game_rows": game_snap_rows,
                "prop_rows": props_snap_rows,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    results_payload = {
        "experiment_id": "EXP_V45_nfl_v4_0_complete",
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "key_number_mass_pre2020": {
            "abs_3_pct": round(100.0 * float(pos_kernel_45[2]), 3),
            "abs_7_pct": round(100.0 * float(pos_kernel_45[6]), 3),
            "abs_6_pct": round(100.0 * float(pos_kernel_45[5]), 3),
            "abs_10_pct": round(100.0 * float(pos_kernel_45[9]), 3),
            "abs_14_pct": round(100.0 * float(pos_kernel_45[13]), 3),
        },
        "spread_key_numbers_oos_vs_gaussian_v3_5": ev_key_spreads,
        "totals_objective_lines_oos_vs_v3_5": ev_tot_obj_vs_v35,
        "totals_objective_lines_oos_vs_const_44_5": ev_tot_obj_vs_const,
        "totals_market_posterior_oos_vs_v3_5": ev_tot_mkt_vs_v35,
        "player_props_pbp_oos": props_eval_json,
        "artifacts": {
            "model_nfl_key_numbers_v4_0_sha256": hashlib.sha256(KEY_NUMBERS_MODEL_OUT.read_bytes()).hexdigest(),
            "model_nfl_props_v4_0_sha256": hashlib.sha256(NFL_PROPS_MODEL_OUT.read_bytes()).hexdigest(),
        },
    }
    RESULTS_OUT.write_text(json.dumps(results_payload, indent=2), encoding="utf-8")

    with TRIAL_REGISTRY_OUT.open("a", encoding="utf-8") as fh:
        fh.write(
            json.dumps(
                {
                    "recorded_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "experiment_id": "EXP_V45_nfl_v4_0_complete",
                    "holdout_touched": False,
                    "spread_key_dll": round(ev_key_spreads["delta_ll"], 6),
                    "tot_obj_ece": round(ev_tot_obj_vs_v35["ece"], 6),
                    "tot_mkt_ece": round(ev_tot_mkt_vs_v35["ece"], 6),
                }
            )
            + "\n"
        )
    print(f"[DONE] EXP_V45 guardado en {RESULTS_OUT.name}")


if __name__ == "__main__":
    main()
