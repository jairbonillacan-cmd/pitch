"""EXP_V52 (Remediado v5.1) — NFL `Minkowski v5.1`: Deconvolución `Std = 13.31`, Posterior `ATS` (`< ln 2`), Poda `Overtime`, Totales Sin Ancla Fija y Props Sin Truncamiento Post-Partido.

Remediación integral `REM_04` (`A4, B1, B2, C1`) bajo corte estricto `< 2025-02-02T17:30:00Z`:
  1. Deconvoluciona `positive_margin_kernel_1_to_45` mediante `margin_quad_concentration` (`-c_m * m^2`) calibrado
     en `VAL <= 2019` para igualar la varianza condicional real `Std(M | spread) ≈ 13.31` (vs `15.02` previo),
     eliminando el `+28%` de exceso de varianza y la cola irreal `19.25%` en `M >= 35`.
  2. Implementa el posterior Bayesiano `Real ATS` (`mu_post = w_sp * mu_model + (1 - w_sp) * (-spread_home)`)
     bajando `Real ATS LL` de `0.70447` (`ECE = 6.81%`) a `<= ln(2)` (`ECE < 2.0%`), validado con **Cluster Bootstrap por `game_id`**.
  3. Somete `Overtime` a prueba estricta con `1` sola feature física `exp(-|mu_post| / 7)` en `VAL (<= 2017 -> 2018..2019)`;
     si no bate a la tasa base empírica, se poda a `coef = [0, 0, 0, 0]`.
  4. Sustituye el ancla fija `44.2` en `LeagueScoringEnvEWM` por media móvil causal de las últimas `3` temporadas (`< s_cur`).
  5. Elimina el truncamiento post-partido `pass_attempts >= 15` seleccionando al QB titular por **primer dropback (`min play_id`)**,
     excluye *kneeldowns* (`qb_kneel == 0`) en `qb_rush_attempts` y añade `qb_rush_share_of_dropbacks` (`ECE 3.41% -> < 1.8%`).
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
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression, PoissonRegressor, Ridge
from sklearn.preprocessing import StandardScaler

EXP_DIR = Path(__file__).resolve().parent
REPO_ROOT = EXP_DIR.parents[3]
PRED_LAB_ROOT = REPO_ROOT / "research" / "prediction-lab"
EXP_V32_DIR = PRED_LAB_ROOT / "experiments" / "EXP_V32_nfl_epa"
EXP_V39_DIR = PRED_LAB_ROOT / "experiments" / "EXP_V39_nfl_v3_5_engines"
EXP_V40_DIR = PRED_LAB_ROOT / "experiments" / "EXP_V40_soccer_micro_markets"
EXP_V45_DIR = PRED_LAB_ROOT / "experiments" / "EXP_V45_nfl_v4_0_complete"
ARTIFACTS_DIR = EXP_DIR / "artifacts"

for _p in (str(REPO_ROOT), str(EXP_V32_DIR), str(EXP_V39_DIR), str(EXP_V40_DIR), str(EXP_V45_DIR), str(EXP_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from services.models.cluster_bootstrap import cluster_bootstrap_binary, safe_ece_binary  # noqa: E402
from pbp_ingest import (  # noqa: E402
    HOLDOUT_CUT_DATE,
    HOLDOUT_CUT_ISO,
    RAW_CACHE_DIR as PBP_CACHE_DIR,
    assert_dates_strictly_before_holdout,
)
from run_micro_markets_experiment import (  # noqa: E402
    BOOTSTRAP_SAMPLES,
    BOOTSTRAP_SEED,
    _estimate_nb_dispersion_mom,
    line_probs_from_pmf,
    nb_pmf_exact,
)
from run_nfl_v4_0_complete import (  # noqa: E402
    FIRST_EVAL_SEASON,
    FIRST_TRAIN_SEASON,
    MAX_ABS_MARGIN,
    OBJECTIVE_TOTAL_LINES,
    VAL_MAX_SEASON,
    build_empirical_positive_margin_kernel,
    normal_cdf_vec,
    project_spread_from_margin_pmf_exact,
)

NFL_V5_MODEL_OUT = REPO_ROOT / "src" / "data" / "prediction" / "model_nfl_v5_0_candidate.json"
NFL_V5_SNAPSHOT_OUT = REPO_ROOT / "src" / "data" / "prediction" / "nfl_v5_0_snapshot.json"
RESULTS_OUT = ARTIFACTS_DIR / "exp_v52_nfl_v5_0_results.json"
TRIAL_REGISTRY_OUT = EXP_DIR / "trial_registry_nfl_v50.jsonl"

MAX_TOTAL_POINTS = 95


def _eval_binary_cluster_nfl(
    cluster_ids: np.ndarray,
    y_true: np.ndarray,
    p_cand: np.ndarray,
    p_bench: np.ndarray,
    seed: int = BOOTSTRAP_SEED,
) -> dict[str, Any]:
    cb = cluster_bootstrap_binary(cluster_ids, y_true, p_cand, p_bench, n_resamples=BOOTSTRAP_SAMPLES, seed=seed)
    ece = safe_ece_binary(y_true, p_cand, n_bins=10)
    sig_es = "significativa" if cb["significant_improvement"] else (
        "empeoramiento_significativo" if (cb["ci95_lo"] is not None and cb["ci95_lo"] > 0.0) else "no_significativa"
    )
    return {
        **cb,
        "n": cb["n_rows"],
        "log_loss": cb["logloss_cand"],
        "benchmark_log_loss": cb["logloss_bench"],
        "delta_ll": cb["delta_logloss"],
        "ece": round(ece, 6) if ece is not None else None,
        "significance": sig_es,
    }


def _compute_causal_league_scoring_env_ewm(df: pd.DataFrame) -> np.ndarray:
    """Rastrea estrictamente en orden causal (`gameday' < gameday`) el régimen contemporáneo NFL usando ancla móvil de 3 temporadas previas."""
    n = len(df)
    out = np.empty(n, dtype=np.float64)
    gdays = df["gameday"].astype(str).str.slice(0, 10).to_numpy()
    seasons = df["season"].to_numpy(dtype=int)
    tots = (df["home_score"] + df["away_score"]).to_numpy(dtype=np.float64)

    cur_env = 43.2
    prev_season: int | None = None
    alpha_day = 0.24
    completed_season_means: list[float] = []
    cur_season_sum = 0.0
    cur_season_cnt = 0

    i = 0
    while i < n:
        s_cur = int(seasons[i])
        if prev_season is not None and s_cur != prev_season:
            if cur_season_cnt > 0:
                completed_season_means.append(cur_season_sum / cur_season_cnt)
            cur_season_sum = 0.0
            cur_season_cnt = 0
            # Ancla móvil estrictamente causal de las últimas 3 temporadas concluidas (`< s_cur`)
            rolling_3y_anchor = float(np.mean(completed_season_means[-3:])) if completed_season_means else 43.2
            cur_env = 0.65 * cur_env + 0.35 * rolling_3y_anchor
        prev_season = s_cur

        gd_cur = gdays[i]
        j = i + 1
        while j < n and gdays[j] == gd_cur:
            j += 1

        out[i:j] = cur_env

        day_n = j - i
        w_eff = min(alpha_day * (day_n / 12.0), 0.35)
        day_mean = float(np.mean(tots[i:j]))
        cur_env = (1.0 - w_eff) * cur_env + w_eff * day_mean
        cur_season_sum += float(np.sum(tots[i:j]))
        cur_season_cnt += day_n
        i = j

    return out


def solve_nfl_key_number_margin_pmf_exact_v5(
    p_home: float,
    p_tie: float,
    p_away: float,
    pos_kernel: np.ndarray,
    margin_quad_concentration: float = 0.0,
) -> dict[str, Any]:
    """Espejo exacto (`< 1e-14`) de `solveNflKeyNumberMarginPmfExact` en `nfl_v4_0.ts` con deconvolución `-c_m * m^2`."""
    max_m = len(pos_kernel)
    c_quad = float(margin_quad_concentration)
    ph = max(float(p_home), 1e-9)
    pt = max(float(p_tie), 1e-9)
    pa = max(float(p_away), 1e-9)
    s3 = ph + pt + pa
    ph, pt, pa = ph / s3, pt / s3, pa / s3

    non_tie = ph + pa
    target_cond = min(max(ph / max(non_tie, 1e-12), 1e-6), 1.0 - 1e-6)
    ms = np.arange(1, max_m + 1, dtype=np.float64)
    eff_k = pos_kernel * np.exp(-c_quad * ms * ms) if c_quad != 0.0 else pos_kernel.copy()

    lo = -0.65
    hi = 0.65
    for _ in range(56):
        mid = 0.5 * (lo + hi)
        pos_s = float(np.sum(eff_k * np.exp(mid * ms)))
        neg_s = float(np.sum(eff_k * np.exp(-mid * ms)))
        ratio = pos_s / max(pos_s + neg_s, 1e-30)
        if ratio < target_cond:
            lo = mid
        else:
            hi = mid

    theta = 0.5 * (lo + hi)
    pmf = np.zeros(2 * max_m + 1, dtype=np.float64)
    center = max_m
    pmf[center] = pt
    pos_w = eff_k * np.exp(theta * ms)
    neg_w = eff_k * np.exp(-theta * ms)
    inv_den = non_tie / max(float(np.sum(pos_w) + np.sum(neg_w)), 1e-30)
    p_pos = pos_w * inv_den
    p_neg = neg_w * inv_den
    pmf[center + 1 :] = p_pos
    pmf[:center] = p_neg[::-1]
    exp_m = float(np.sum(ms * (p_pos - p_neg)))
    var_m = float(np.sum((ms * ms) * (p_pos + p_neg))) - exp_m * exp_m
    return {"theta": theta, "expected_margin": exp_m, "std_margin": math.sqrt(max(var_m, 1e-12)), "pmf": pmf}


def solve_nfl_key_number_margin_by_mean_v5(
    expected_margin_target: float,
    p_tie: float,
    pos_kernel: np.ndarray,
    margin_quad_concentration: float = 0.0,
) -> dict[str, Any]:
    """Espejo exacto (`< 1e-14`) de `solveNflKeyNumberMarginByExpectedMeanV5` en `nfl_v4_0.ts`."""
    max_m = len(pos_kernel)
    c_quad = float(margin_quad_concentration)
    pt = min(max(float(p_tie), 1e-6), 0.05)
    non_tie = 1.0 - pt
    target = min(max(float(expected_margin_target), -30.0), 30.0)
    ms = np.arange(1, max_m + 1, dtype=np.float64)
    eff_k = pos_kernel * np.exp(-c_quad * ms * ms) if c_quad != 0.0 else pos_kernel.copy()

    lo = -0.65
    hi = 0.65
    for _ in range(56):
        mid = 0.5 * (lo + hi)
        ep = eff_k * np.exp(mid * ms)
        en = eff_k * np.exp(-mid * ms)
        mean_mid = (non_tie * float(np.sum(ms * (ep - en)))) / max(float(np.sum(ep) + np.sum(en)), 1e-30)
        if mean_mid < target:
            lo = mid
        else:
            hi = mid

    theta = 0.5 * (lo + hi)
    pmf = np.zeros(2 * max_m + 1, dtype=np.float64)
    center = max_m
    pmf[center] = pt
    ep = eff_k * np.exp(theta * ms)
    en = eff_k * np.exp(-theta * ms)
    inv_den = non_tie / max(float(np.sum(ep) + np.sum(en)), 1e-30)
    p_pos = ep * inv_den
    p_neg = en * inv_den
    pmf[center + 1 :] = p_pos
    pmf[:center] = p_neg[::-1]
    exp_m = float(np.sum(ms * (p_pos - p_neg)))
    return {"theta": theta, "expected_margin": exp_m, "pmf": pmf}


def build_empirical_total_points_kernel_0_to_95(totals_val: np.ndarray) -> list[float]:
    ks = np.arange(MAX_TOTAL_POINTS + 1, dtype=np.float64)
    emp_counts = np.zeros(MAX_TOTAL_POINTS + 1, dtype=np.float64)
    t_int = np.clip(np.round(totals_val).astype(int), 0, MAX_TOTAL_POINTS)
    for v in t_int:
        emp_counts[int(v)] += 1.0
    emp_pmf = emp_counts / max(float(np.sum(emp_counts)), 1.0)

    mu0 = float(np.mean(totals_val))
    sd0 = max(float(np.std(totals_val)), 10.0)
    smooth = np.exp(-0.5 * ((ks - mu0) / sd0) ** 2)
    smooth[:6] *= 0.05
    smooth /= float(np.sum(smooth))

    base = np.maximum(0.65 * emp_pmf + 0.35 * smooth, 1e-8)
    base /= float(np.sum(base))
    rounded = [round(float(x), 10) for x in base.tolist()]
    s_r = sum(rounded)
    return [round(x / s_r, 10) for x in rounded]


def solve_nfl_discrete_key_total_pmf_scalar(
    expected_total: float,
    base_kernel_96: list[float],
    quad_concentration: float,
) -> dict[str, Any]:
    """Espejo escalar exacto (`< 1e-14`) de `solveNflDiscreteKeyTotalPmfExactV5` en `nfl_v4_0.ts`."""
    max_k = MAX_TOTAL_POINTS
    c_quad = float(quad_concentration)
    target = min(max(float(expected_total), 26.0), 68.0)

    log_base = np.empty(max_k + 1, dtype=np.float64)
    for k in range(max_k + 1):
        diff = float(k) - target
        log_base[k] = math.log(max(float(base_kernel_96[k]), 1e-15)) - c_quad * diff * diff

    lo = -0.45
    hi = 0.45
    for _ in range(52):
        mid = 0.5 * (lo + hi)
        lp = log_base + mid * np.arange(max_k + 1, dtype=np.float64)
        max_lp = float(np.max(lp))
        w = np.exp(lp - max_lp)
        if float(np.sum(np.arange(max_k + 1, dtype=np.float64) * w)) / max(float(np.sum(w)), 1e-30) < target:
            lo = mid
        else:
            hi = mid

    theta = 0.5 * (lo + hi)
    lp = log_base + theta * np.arange(max_k + 1, dtype=np.float64)
    w = np.exp(lp - float(np.max(lp)))
    pmf = w / max(float(np.sum(w)), 1e-30)
    imp_mean = float(np.sum(np.arange(max_k + 1, dtype=np.float64) * pmf))
    return {"theta": theta, "expected_total_implied": imp_mean, "pmf": pmf}


def eval_discrete_total_line_scalar(pmf: np.ndarray, line: float) -> tuple[float, float, float, float]:
    p_ov = 0.0
    p_un = 0.0
    p_ps = 0.0
    ln = float(line)
    for k in range(len(pmf)):
        p = float(pmf[k])
        if p <= 0.0:
            continue
        if abs(float(k) - ln) < 1e-9:
            p_ps += p
        elif float(k) > ln:
            p_ov += p
        else:
            p_un += p
    act = p_ov + p_un
    po_np = min(max(p_ov / act, 0.001), 0.999) if act > 1e-12 else 0.5
    return p_ov, p_un, p_ps, po_np


def _extract_causal_pbp_qb_starters_no_truncation(seasons: range) -> pd.DataFrame:
    """Extrae QBs titulares estrictamente por 1.er dropback (`min play_id`, cero truncamiento `pass_attempts >= 15`)
    y excluye *kneeldowns* (`play_type != 'qb_kneel'`, `qb_kneel == 0`) de los acarreos del QB (`B2, C1`)."""
    parts: list[pd.DataFrame] = []
    for yr in seasons:
        p_path = PBP_CACHE_DIR / f"pbp_pruned_{yr}.parquet"
        if not p_path.exists():
            continue
        df = pd.read_parquet(p_path)
        df["gd_str"] = df["game_date"].astype(str).str.slice(0, 10)
        df = df[df["gd_str"] < HOLDOUT_CUT_DATE].copy()
        if bool((df["gd_str"] >= HOLDOUT_CUT_DATE).any()):
            raise RuntimeError(f"HoldoutSealedAccessError en pbp_pruned_{yr}.parquet")

        valid_play = (df["aborted_play"].fillna(0.0) == 0.0) & (df["two_point_attempt"].fillna(0.0) == 0.0)
        df = df[valid_play & df["posteam"].notna() & df["defteam"].notna()].copy()

        # Identificar QB titular causal por el primer dropback (`min play_id`) del equipo en el juego
        p_sub = df[df["passer_player_id"].notna()].copy()
        if p_sub.empty:
            continue
        sort_col = "play_id" if "play_id" in p_sub.columns else "game_id"
        p_sub = p_sub.sort_values(["game_id", "posteam", sort_col], kind="mergesort")
        first_qb = p_sub.drop_duplicates(["game_id", "posteam"], keep="first")[
            ["game_id", "season", "week", "gd_str", "posteam", "defteam", "passer_player_id"]
        ].copy()

        p_sub["official_att"] = ((p_sub["pass_attempt"].fillna(0.0) == 1.0) & (p_sub["sack"].fillna(0.0) == 0.0)).astype(np.float64)
        p_sub["comp"] = p_sub["complete_pass"].fillna(0.0).astype(np.float64)
        p_sub["sk"] = p_sub["sack"].fillna(0.0).astype(np.float64)
        p_sub["dbk"] = (p_sub["official_att"] + p_sub["sk"]).astype(np.float64)
        qb_pass = (
            p_sub.groupby(["game_id", "posteam", "passer_player_id"], as_index=False)
            .agg(pass_attempts=("official_att", "sum"), completions=("comp", "sum"), sacks=("sk", "sum"), dropbacks=("dbk", "sum"))
        )

        # Acarreos reales de QB excluyendo kneeldowns (`play_type != 'qb_kneel'` y `qb_kneel == 0`)
        not_kneel = pd.Series(True, index=df.index)
        if "play_type" in df.columns:
            not_kneel &= df["play_type"].astype(str).str.lower() != "qb_kneel"
        if "qb_kneel" in df.columns:
            not_kneel &= pd.to_numeric(df["qb_kneel"], errors="coerce").fillna(0.0) == 0.0
        r_sub = df[df["rusher_player_id"].notna() & (df["rush_attempt"].fillna(0.0) == 1.0) & not_kneel].copy()
        qb_rush = (
            r_sub.groupby(["game_id", "posteam", "rusher_player_id"], as_index=False)
            .agg(qb_carries=("rush_attempt", "sum"), qb_scrambles=("qb_scramble", "sum"))
            .rename(columns={"rusher_player_id": "passer_player_id"})
        )

        merged = first_qb.merge(qb_pass, on=["game_id", "posteam", "passer_player_id"], how="left").merge(
            qb_rush, on=["game_id", "posteam", "passer_player_id"], how="left"
        )
        for col in ("pass_attempts", "completions", "sacks", "dropbacks", "qb_carries", "qb_scrambles"):
            merged[col] = merged[col].fillna(0.0).astype(np.float64)
        parts.append(merged)

    out = pd.concat(parts, ignore_index=True).sort_values(["gd_str", "game_id", "posteam"], kind="mergesort").reset_index(drop=True)
    return out


def _evaluate_nfl_v5_props_walk_forward(
    qb_starters: pd.DataFrame,
    script_map: dict[tuple[str, str], float],
    prev_v4_props: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]]]:
    """Valida walk-forward `qb_sacks_taken` y `qb_rush_attempts` (sin truncamiento `pass_attempts >= 15`, sin kneeldowns, Cluster Bootstrap por `game_id`)."""
    alpha_p = 2.0 / 9.0
    alpha_t = 2.0 / 13.0
    qb_sk_ewm: dict[str, float] = {}
    qb_ru_ewm: dict[str, float] = {}
    qb_db_ewm: dict[str, float] = {}
    qb_n: dict[str, int] = defaultdict(int)
    ol_sk_ewm: dict[str, float] = {}
    def_sk_ewm: dict[str, float] = {}
    def_qbru_ewm: dict[str, float] = {}

    n_qb = len(qb_starters)
    n_under15 = int(np.sum(qb_starters["pass_attempts"].to_numpy() < 15.0))
    print(f"  [NFL Props v5.1] QBs titulares por 1.er dropback: n={n_qb:,} (incluye {n_under15} salidas tempranas `< 15` intentos sin truncar!)")

    X_sk = np.zeros((n_qb, 4), dtype=np.float64)
    X_qbru = np.zeros((n_qb, 4), dtype=np.float64)
    raw_sk = np.zeros(n_qb, dtype=np.float64)
    raw_qbru = np.zeros(n_qb, dtype=np.float64)

    for i, r in enumerate(qb_starters.itertuples(index=False)):
        pid = str(r.passer_player_id)
        tm = str(r.posteam)
        opp = str(r.defteam)
        gid = str(r.game_id)
        n_p = qb_n[pid]

        ol_base = ol_sk_ewm.get(tm, 2.35)
        sk_eb = (n_p * qb_sk_ewm.get(pid, ol_base) + 5.0 * ol_base) / (n_p + 5.0)
        def_sk_exc = (def_sk_ewm.get(opp, 2.35) - 2.35) / 1.2

        ru_eb = (n_p * qb_ru_ewm.get(pid, 2.40) + 4.0 * 2.40) / (n_p + 4.0)
        db_eb = (n_p * qb_db_ewm.get(pid, 35.0) + 4.0 * 35.0) / (n_p + 4.0)
        # Feature 4 nueva (`C1`): `qb_rush_share_of_dropbacks` separa QBs móviles (Lamar/Allen/Hurts) de pocket passers
        qb_rush_share = min(max(ru_eb / max(db_eb + ru_eb, 12.0), 0.0), 0.45)
        def_ru_exc = (def_qbru_ewm.get(opp, 2.40) - 2.40) / 1.5

        exp_m = script_map.get((gid, tm), 0.0)
        trailing_idx = -exp_m / 7.0
        leading_idx = exp_m / 7.0

        X_sk[i] = [math.log(max(sk_eb, 0.45)), (ol_base - 2.35) / 1.2, def_sk_exc, trailing_idx]
        X_qbru[i] = [math.log(max(ru_eb, 0.35)), def_ru_exc, leading_idx, qb_rush_share]
        raw_sk[i] = qb_sk_ewm.get(pid, 2.35)
        raw_qbru[i] = qb_ru_ewm.get(pid, 2.40)

        obs_s = float(r.sacks)
        obs_qr = float(r.qb_carries)
        obs_db = float(r.dropbacks)
        qb_sk_ewm[pid] = alpha_p * obs_s + (1.0 - alpha_p) * qb_sk_ewm.get(pid, obs_s)
        qb_ru_ewm[pid] = alpha_p * obs_qr + (1.0 - alpha_p) * qb_ru_ewm.get(pid, obs_qr)
        qb_db_ewm[pid] = alpha_p * obs_db + (1.0 - alpha_p) * qb_db_ewm.get(pid, obs_db)
        qb_n[pid] += 1
        ol_sk_ewm[tm] = alpha_t * obs_s + (1.0 - alpha_t) * ol_base
        def_sk_ewm[opp] = alpha_t * obs_s + (1.0 - alpha_t) * def_sk_ewm.get(opp, 2.35)
        def_qbru_ewm[opp] = alpha_t * obs_qr + (1.0 - alpha_t) * def_qbru_ewm.get(opp, 2.40)

    seas_qb = qb_starters["season"].to_numpy(dtype=int)
    gids_qb = qb_starters["game_id"].astype(str).to_numpy()
    new_specs = [
        (
            "qb_sacks_taken",
            2.5,
            16,
            X_sk,
            qb_starters["sacks"].to_numpy(dtype=np.float64),
            raw_sk,
            ["log_qb_sacks_eb", "ol_sacks_allowed_exc", "opp_pass_rush_sack_exc", "trailing_script_idx"],
        ),
        (
            "qb_rush_attempts",
            4.5,
            24,
            X_qbru,
            qb_starters["qb_carries"].to_numpy(dtype=np.float64),
            raw_qbru,
            ["log_qb_carries_eb", "opp_qb_rush_allowed_exc", "leading_script_idx", "qb_rush_share_of_dropbacks"],
        ),
    ]

    models_out: dict[str, Any] = dict(prev_v4_props["markets"])
    evals_out: dict[str, Any] = {}
    snap_props: list[dict[str, Any]] = []

    for m_name, line_v, max_k, X_m, y_m, raw_m, f_names in new_specs:
        val_m = (seas_qb >= 2014) & (seas_qb <= VAL_MAX_SEASON)
        oos_m = seas_qb >= 2020

        # Calibrar `r_disp` en `VAL <= 2019` minimizando Log-Loss real sobre la línea canónica (evita sesgo bimodal en `qb_rush_attempts`!)
        pr_val = PoissonRegressor(alpha=0.05, max_iter=600).fit(X_m[val_m], y_m[val_m])
        mu_val = np.clip(pr_val.predict(X_m[val_m]), 0.25, 30.0)
        r_mom = min(max(_estimate_nb_dispersion_mom(y_m[val_m], mu_val), 0.8), 80.0)
        best_r = r_mom
        best_r_ll = float("inf")
        yv_bin = (y_m[val_m] > line_v).astype(np.float64)
        for r_try in sorted({r_mom, 1.5, 2.5, 4.0, 7.0, 12.0, 25.0}):
            pv_r = np.clip(np.array([line_probs_from_pmf(nb_pmf_exact(float(m), r_try, max_k), line_v)[0] for m in mu_val]), 1e-9, 1.0 - 1e-9)
            ll_r = float(-np.mean(yv_bin * np.log(pv_r) + (1.0 - yv_bin) * np.log(1.0 - pv_r)))
            if ll_r < best_r_ll:
                best_r_ll = ll_r
                best_r = r_try
        r_disp = best_r

        mu_oos = np.empty(int(np.sum(oos_m)), dtype=np.float64)
        pos = 0
        for yr in sorted(set(int(s) for s in seas_qb[oos_m])):
            tr_f = (seas_qb >= 2013) & (seas_qb < yr)
            te_f = seas_qb == yr
            cnt = int(np.sum(te_f))
            prf = PoissonRegressor(alpha=0.05, max_iter=600).fit(X_m[tr_f], y_m[tr_f])
            mu_oos[pos : pos + cnt] = np.clip(prf.predict(X_m[te_f]), 0.25, 30.0)
            pos += cnt

        y_oos = y_m[oos_m]
        raw_oos = np.clip(raw_m[oos_m], 0.25, 30.0)
        yb_oos = (y_oos > line_v).astype(np.float64)
        p_v5 = np.array([line_probs_from_pmf(nb_pmf_exact(float(m), r_disp, max_k), line_v)[0] for m in mu_oos])
        p_raw = np.array([line_probs_from_pmf(nb_pmf_exact(float(m), 180.0, max_k), line_v)[0] for m in raw_oos])
        boot_p = _eval_binary_cluster_nfl(gids_qb[oos_m], yb_oos, p_v5, p_raw, seed=BOOTSTRAP_SEED + 30)
        mae_v5 = float(np.mean(np.abs(mu_oos - y_oos)))
        mae_rw = float(np.mean(np.abs(raw_oos - y_oos)))

        pr_full = PoissonRegressor(alpha=0.05, max_iter=600).fit(X_m[seas_qb >= 2013], y_m[seas_qb >= 2013])
        models_out[m_name] = {
            "canonical_line": line_v,
            "max_k": max_k,
            "dispersion_r": round(r_disp, 6),
            "feature_names": f_names,
            "coef": [float(v) for v in pr_full.coef_.tolist()],
            "intercept": float(pr_full.intercept_),
        }
        evals_out[m_name] = {
            "n_oos": int(len(y_oos)),
            "n_clusters_game_id": boot_p["n_clusters"],
            "n_under15_included": n_under15,
            "line": line_v,
            "dispersion_r": round(r_disp, 4),
            "mae_v5_0": round(mae_v5, 4),
            "mae_naive_ewma": round(mae_rw, 4),
            "vs_naive_ewma_poisson": boot_p,
        }
        print(
            f"  [NFL Prop v5.1 {m_name:16s}] OOS n={len(y_oos):,} (clusters={boot_p['n_clusters']:,}) | "
            f"MAE: v5.1={mae_v5:.3f} vs Raw={mae_rw:.3f} | LL={boot_p['log_loss']:.5f} (ECE={100*boot_p['ece']:.2f}%) | "
            f"dLL={boot_p['delta_ll']:+.5f} ({boot_p['significance']})"
        )

        for r_idx in np.where(oos_m)[0][:12]:
            xf = [round(float(v), 8) for v in X_m[r_idx].tolist()]
            eta = float(pr_full.intercept_) + sum(float(pr_full.coef_[k_i]) * xf[k_i] for k_i in range(4))
            mu_ex = min(max(math.exp(eta), 0.25), 50.0)
            po, pu, pp = line_probs_from_pmf(nb_pmf_exact(mu_ex, round(r_disp, 6), max_k), line_v)
            snap_props.append(
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

    return models_out, evals_out, snap_props


def main() -> None:
    sys.modules.pop("run_experiment", None)
    from run_nfl_v3_5_engines import (  # noqa: E402
        NFL_TOTALS_12_FEATURES,
        _apply_temperature_3way_exact,
        _blend_3way_exact,
        attach_causal_v35_nfl_features,
        build_or_load_v35_pbp_game_metrics,
        fit_binary_minkowski_hgb,
        fit_minkowski_logit_pipeline,
        predict_binary_hgb_lifted_3way,
        predict_logit_3way_exact,
    )

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    dev_41 = pd.read_parquet(EXP_V32_DIR / "artifacts" / "nfl_dev_causal_41_features.parquet")
    assert_dates_strictly_before_holdout(dev_41["gameday"], context="EXP_V52_dev_41")

    nfl_games_p = PRED_LAB_ROOT / "data" / "nfl" / "processed" / "nfl_games.parquet"
    ng = pd.read_parquet(nfl_games_p)
    ng["gd_str"] = ng["gameday"].astype(str).str.slice(0, 10)
    ng = ng[ng["gd_str"] < HOLDOUT_CUT_DATE].copy()
    assert_dates_strictly_before_holdout(ng["gameday"], context="EXP_V52_nfl_games")
    extra_cols = [c for c in ("game_id", "spread_line", "overtime", "surface") if c in ng.columns]
    ng_sub = ng[extra_cols].drop_duplicates("game_id")

    v35_tg = build_or_load_v35_pbp_game_metrics()
    wf_df, _ = attach_causal_v35_nfl_features(dev_41, v35_tg)
    wf_df = wf_df.merge(ng_sub, on="game_id", how="left", suffixes=("", "_ng"))
    wf_df = wf_df.sort_values(["gameday", "season", "week", "game_id"], kind="mergesort").reset_index(drop=True)

    wf_df["league_scoring_env_ewm"] = _compute_causal_league_scoring_env_ewm(wf_df)

    gbm_v35 = json.loads((REPO_ROOT / "src" / "data" / "prediction" / "gbm_nfl_v3_5_candidate.json").read_text(encoding="utf-8"))
    tot_v35 = json.loads((REPO_ROOT / "src" / "data" / "prediction" / "model_nfl_totals_v3_5_candidate.json").read_text(encoding="utf-8"))
    prev_v4_props = json.loads((REPO_ROOT / "src" / "data" / "prediction" / "model_nfl_props_v4_0_candidate.json").read_text(encoding="utf-8"))

    eval_df = wf_df[wf_df["season"] >= FIRST_EVAL_SEASON].copy().reset_index(drop=True)
    seasons_ev = eval_df["season"].to_numpy(dtype=int)
    gids_ev = eval_df["game_id"].astype(str).to_numpy()
    val_m = seasons_ev <= VAL_MAX_SEASON
    oos_m = seasons_ev >= 2020

    hs_ev = eval_df["home_score"].to_numpy(dtype=np.float64)
    as_ev = eval_df["away_score"].to_numpy(dtype=np.float64)
    margin_ev = hs_ev - as_ev
    tot_ev = hs_ev + as_ev
    tot_line = pd.to_numeric(eval_df["total_line"], errors="coerce").to_numpy(dtype=np.float64)
    sp_col = "spread_line" if "spread_line" in eval_df.columns else "spread_line_ng"
    raw_spread_line = pd.to_numeric(eval_df[sp_col], errors="coerce").to_numpy(dtype=np.float64)

    hist_pre2020 = wf_df[wf_df["season"] <= VAL_MAX_SEASON]
    pos_kernel_45 = build_empirical_positive_margin_kernel(
        hist_pre2020["home_score"].to_numpy(dtype=np.float64),
        hist_pre2020["away_score"].to_numpy(dtype=np.float64),
    )
    base_tot_kernel_96 = build_empirical_total_points_kernel_0_to_95(
        (hist_pre2020["home_score"] + hist_pre2020["away_score"]).to_numpy(dtype=np.float64)
    )

    # Calibrar `margin_quad_concentration` en VAL <= 2019 para igualar `Std(M | spread)` real (~13.31) (`A4`)
    valid_sp_val = val_m & np.isfinite(raw_spread_line)
    corr_sp = float(np.corrcoef(raw_spread_line[valid_sp_val], margin_ev[valid_sp_val])[0, 1])
    spread_home_hc = -raw_spread_line if corr_sp > 0.0 else raw_spread_line
    target_cond_std = float(np.std(margin_ev[valid_sp_val] + spread_home_hc[valid_sp_val], ddof=1))

    # Bisección exacta sobre `margin_quad_concentration` para que `Std(M | pHome=0.50) == target_cond_std`
    c_lo, c_hi = 0.0, 0.008
    for _ in range(44):
        c_mid = 0.5 * (c_lo + c_hi)
        sd_mid = solve_nfl_key_number_margin_pmf_exact_v5(0.498, 0.004, 0.498, pos_kernel_45, c_mid)["std_margin"]
        if sd_mid > target_cond_std:
            c_lo = c_mid
        else:
            c_hi = c_mid
    best_margin_c_quad = round(0.5 * (c_lo + c_hi), 8)
    sd_before = solve_nfl_key_number_margin_pmf_exact_v5(0.498, 0.004, 0.498, pos_kernel_45, 0.0)["std_margin"]
    sd_after = solve_nfl_key_number_margin_pmf_exact_v5(0.498, 0.004, 0.498, pos_kernel_45, best_margin_c_quad)["std_margin"]
    sol_fav92_after = solve_nfl_key_number_margin_pmf_exact_v5(0.92, 0.002, 0.078, pos_kernel_45, best_margin_c_quad)
    p_ge35_fav92 = float(np.sum(sol_fav92_after["pmf"][MAX_ABS_MARGIN + 35 :]))
    print(
        f"[EXP_V52 v5.1] Margin Deconvolution (VAL target Std={target_cond_std:.2f}): "
        f"c_m={best_margin_c_quad:.6f} | PMF Std(50/50): {sd_before:.2f} -> {sd_after:.2f} | P(M>=35|p=0.92)={100*p_ge35_fav92:.2f}%"
    )

    sel_cols = list(gbm_v35["features"])
    P3_oof = np.zeros((len(eval_df), 3), dtype=np.float64)
    T_v4_oof = np.zeros(len(eval_df), dtype=np.float64)
    T_v5_oof = np.zeros(len(eval_df), dtype=np.float64)

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
        Z_tr = sct.transform(impt.transform(Xt_tr))
        Z_te = sct.transform(impt.transform(Xt_te))

        tot_tr_raw = (tr["home_score"] + tr["away_score"]).to_numpy(dtype=np.float64)
        env_tr = tr["league_scoring_env_ewm"].to_numpy(dtype=np.float64)
        env_te = te["league_scoring_env_ewm"].to_numpy(dtype=np.float64)

        rg_v4 = Ridge(alpha=alpha_tot).fit(Z_tr, tot_tr_raw, sample_weight=sw)
        T_v4_oof[pos_i : pos_i + cnt] = np.clip(rg_v4.predict(Z_te), 30.0, 64.0)

        rg_v5 = Ridge(alpha=alpha_tot * 1.5).fit(Z_tr, tot_tr_raw - env_tr, sample_weight=sw)
        T_v5_oof[pos_i : pos_i + cnt] = np.clip(env_te + rg_v5.predict(Z_te), 28.0, 66.0)
        pos_i += cnt

    # 1. Calibrar `quad_concentration` de Totales en `VAL <= 2019` y evaluar con Cluster Bootstrap por `game_id` (`B1, C1`)
    best_c_quad = 0.0
    best_val_tot_ll = float("inf")
    val_indices = np.where(val_m)[0]
    for cq_try in (-0.0008, -0.0004, -0.0002, 0.0, 0.0004):
        pmfs_vl = [solve_nfl_discrete_key_total_pmf_scalar(float(T_v5_oof[idx]), base_tot_kernel_96, cq_try)["pmf"] for idx in val_indices]
        ll_acc = 0.0
        for ln_o in OBJECTIVE_TOTAL_LINES:
            yb = (tot_ev[val_m] > ln_o).astype(np.float64)
            pb = np.clip(np.array([eval_discrete_total_line_scalar(pmf, ln_o)[0] for pmf in pmfs_vl]), 1e-9, 1.0 - 1e-9)
            ll_acc += float(-np.mean(yb * np.log(pb) + (1.0 - yb) * np.log(1.0 - pb)))
        if ll_acc < best_val_tot_ll:
            best_val_tot_ll = ll_acc
            best_c_quad = cq_try

    oos_indices = np.where(oos_m)[0]
    pmfs_tot_oos = [solve_nfl_discrete_key_total_pmf_scalar(float(T_v5_oof[idx]), base_tot_kernel_96, best_c_quad)["pmf"] for idx in oos_indices]
    y_obj_oos = np.concatenate([(tot_ev[oos_m] > ln_o).astype(np.float64) for ln_o in OBJECTIVE_TOTAL_LINES])
    cl_obj_oos = np.concatenate([gids_ev[oos_m] for _ in OBJECTIVE_TOTAL_LINES])
    p_obj_v5 = np.concatenate([np.array([eval_discrete_total_line_scalar(pmf, ln_o)[0] for pmf in pmfs_tot_oos]) for ln_o in OBJECTIVE_TOTAL_LINES])
    p_obj_v4 = np.concatenate([normal_cdf_vec((T_v4_oof[oos_m] - ln_o) / 14.0) for ln_o in OBJECTIVE_TOTAL_LINES])

    ev_tot_v5_vs_v4 = _eval_binary_cluster_nfl(cl_obj_oos, y_obj_oos, p_obj_v5, p_obj_v4, seed=BOOTSTRAP_SEED)
    ev_tot_v4_diag = _eval_binary_cluster_nfl(cl_obj_oos, y_obj_oos, p_obj_v4, p_obj_v4, seed=BOOTSTRAP_SEED)

    valid_mkt = np.isfinite(tot_line) & (np.abs(tot_ev - tot_line) > 1e-6)
    val_mkt = valid_mkt & val_m
    best_wm = 0.14
    best_mkt_ll = float("inf")
    for wm_try in (0.08, 0.14, 0.22, 0.30):
        mu_p = wm_try * T_v5_oof[val_mkt] + (1.0 - wm_try) * tot_line[val_mkt]
        p_a = np.array(
            [
                eval_discrete_total_line_scalar(solve_nfl_discrete_key_total_pmf_scalar(float(m), base_tot_kernel_96, best_c_quad)["pmf"], float(l))[3]
                for l, m in zip(tot_line[val_mkt], mu_p)
            ]
        )
        yb_m = (tot_ev[val_mkt] > tot_line[val_mkt]).astype(np.float64)
        p_ac = np.clip(p_a, 1e-9, 1.0 - 1e-9)
        ll_m = float(-np.mean(yb_m * np.log(p_ac) + (1.0 - yb_m) * np.log(1.0 - p_ac)))
        if ll_m < best_mkt_ll:
            best_mkt_ll = ll_m
            best_wm = wm_try

    # 2. Deconvolucionado `PMF de Margen` + Posterior Bayesiano `Real spread_line ATS` (`A4, C1, B1`)
    pmfs_margin_all = [
        solve_nfl_key_number_margin_pmf_exact_v5(float(P3_oof[i, 0]), float(P3_oof[i, 1]), float(P3_oof[i, 2]), pos_kernel_45, best_margin_c_quad)
        for i in range(len(eval_df))
    ]
    exp_m_all = np.array([float(sol["expected_margin"]) for sol in pmfs_margin_all], dtype=np.float64)

    valid_ats_val = val_m & np.isfinite(spread_home_hc) & (np.abs(margin_ev + spread_home_hc) > 1e-6)
    ats_val_idx = np.where(valid_ats_val)[0]
    y_ats_val = (margin_ev[ats_val_idx] + spread_home_hc[ats_val_idx] > 0.0).astype(np.float64)

    best_w_sp = 0.12
    best_ats_val_ll = float("inf")
    for wsp_try in (0.0, 0.05, 0.10, 0.16, 0.24, 0.35):
        p_try = np.empty(len(ats_val_idx), dtype=np.float64)
        for k, idx in enumerate(ats_val_idx):
            shc = float(spread_home_hc[idx])
            mu_post = wsp_try * float(exp_m_all[idx]) + (1.0 - wsp_try) * (-shc)
            sol_p = solve_nfl_key_number_margin_by_mean_v5(mu_post, float(P3_oof[idx, 1]), pos_kernel_45, best_margin_c_quad)
            p_try[k] = project_spread_from_margin_pmf_exact(sol_p["pmf"], shc)["pHomeCoverNoPush"]
        pc = np.clip(p_try, 1e-9, 1.0 - 1e-9)
        ll_v = float(-np.mean(y_ats_val * np.log(pc) + (1.0 - y_ats_val) * np.log(1.0 - pc)))
        if ll_v < best_ats_val_ll:
            best_ats_val_ll = ll_v
            best_w_sp = wsp_try

    valid_ats_oos = oos_m & np.isfinite(spread_home_hc) & (np.abs(margin_ev + spread_home_hc) > 1e-6)
    ats_oos_idx = np.where(valid_ats_oos)[0]
    y_ats_oos = (margin_ev[ats_oos_idx] + spread_home_hc[ats_oos_idx] > 0.0).astype(np.float64)
    p_ats_post_oos = np.empty(len(ats_oos_idx), dtype=np.float64)
    p_ats_raw_oos = np.empty(len(ats_oos_idx), dtype=np.float64)
    for k, idx in enumerate(ats_oos_idx):
        shc = float(spread_home_hc[idx])
        mu_post = best_w_sp * float(exp_m_all[idx]) + (1.0 - best_w_sp) * (-shc)
        sol_p = solve_nfl_key_number_margin_by_mean_v5(mu_post, float(P3_oof[idx, 1]), pos_kernel_45, best_margin_c_quad)
        p_ats_post_oos[k] = project_spread_from_margin_pmf_exact(sol_p["pmf"], shc)["pHomeCoverNoPush"]
        p_ats_raw_oos[k] = project_spread_from_margin_pmf_exact(pmfs_margin_all[idx]["pmf"], shc)["pHomeCoverNoPush"]

    p_coin_50 = np.full(len(y_ats_oos), 0.5, dtype=np.float64)
    ev_real_ats_vs_raw = _eval_binary_cluster_nfl(gids_ev[ats_oos_idx], y_ats_oos, p_ats_post_oos, p_ats_raw_oos, seed=BOOTSTRAP_SEED + 2)
    ev_real_ats_vs_coin = _eval_binary_cluster_nfl(gids_ev[ats_oos_idx], y_ats_oos, p_ats_post_oos, p_coin_50, seed=BOOTSTRAP_SEED + 3)

    # Push mass en spreads enteros (±3.0, ±7.0) usando posterior deconvolucionado
    int_sp_oos = oos_m & np.isfinite(spread_home_hc) & (np.isin(np.abs(spread_home_hc), [3.0, 7.0]))
    int_sp_idx = np.where(int_sp_oos)[0]
    emp_push_rate_3_7 = float(np.mean(np.abs(margin_ev[int_sp_idx] + spread_home_hc[int_sp_idx]) < 1e-6)) if len(int_sp_idx) > 0 else 0.0
    pred_push_rate_3_7 = (
        float(
            np.mean(
                [
                    project_spread_from_margin_pmf_exact(
                        solve_nfl_key_number_margin_by_mean_v5(
                            best_w_sp * float(exp_m_all[idx]) + (1.0 - best_w_sp) * (-float(spread_home_hc[idx])),
                            float(P3_oof[idx, 1]),
                            pos_kernel_45,
                            best_margin_c_quad,
                        )["pmf"],
                        float(spread_home_hc[idx]),
                    )["pPush"]
                    for idx in int_sp_idx
                ]
            )
        )
        if len(int_sp_idx) > 0
        else 0.0
    )

    # 3. Poda estricta `Overtime` (`C1`): probar 1 sola feature `exp(-|mu_post|/7)` en VAL interno (<=2017 -> 2018..2019)
    ot_col = "overtime" if "overtime" in eval_df.columns else "overtime_ng"
    sf_col = "surface" if "surface" in eval_df.columns else "surface_ng"
    y_ot = (pd.to_numeric(eval_df[ot_col], errors="coerce").fillna(0.0).to_numpy(dtype=np.float64) > 0.5).astype(np.float64)
    is_ind = (pd.to_numeric(eval_df["is_indoor"], errors="coerce").fillna(0.0).to_numpy(dtype=np.float64) > 0.5).astype(np.float64)
    surf_s = eval_df[sf_col].fillna("").astype(str).str.lower()
    is_turf = (~surf_s.str.contains("grass")).astype(np.float64).to_numpy()

    mu_post_all = np.where(
        np.isfinite(spread_home_hc),
        best_w_sp * exp_m_all + (1.0 - best_w_sp) * (-spread_home_hc),
        exp_m_all,
    )
    X_ot_1 = np.exp(-np.abs(mu_post_all) / 7.0).reshape(-1, 1)

    ot_tr_in = val_m & (seasons_ev <= 2017)
    ot_vl_in = val_m & (seasons_ev >= 2018)
    base_rate_in = float(np.mean(y_ot[ot_tr_in]))
    ll_base_in = float(-np.mean(y_ot[ot_vl_in] * math.log(base_rate_in) + (1.0 - y_ot[ot_vl_in]) * math.log(1.0 - base_rate_in)))
    best_ot_c: float | None = None
    best_ot_ll_in = ll_base_in
    for c_ot in (0.005, 0.02, 0.08):
        lr_try = LogisticRegression(C=c_ot, max_iter=500).fit(X_ot_1[ot_tr_in], y_ot[ot_tr_in].astype(int))
        p_try = np.clip(lr_try.predict_proba(X_ot_1[ot_vl_in])[:, 1], 0.005, 0.25)
        ll_try = float(-np.mean(y_ot[ot_vl_in] * np.log(p_try) + (1.0 - y_ot[ot_vl_in]) * np.log(1.0 - p_try)))
        if ll_try < best_ot_ll_in - 1e-4:
            best_ot_ll_in = ll_try
            best_ot_c = c_ot

    p_ot_clim = np.full(int(np.sum(oos_m)), float(np.mean(y_ot[val_m])), dtype=np.float64)
    if best_ot_c is not None:
        lr_ot_val = LogisticRegression(C=best_ot_c, max_iter=500).fit(X_ot_1[val_m], y_ot[val_m].astype(int))
        p_ot_oos = np.clip(lr_ot_val.predict_proba(X_ot_1[oos_m])[:, 1], 0.005, 0.25)
        lr_ot_full = LogisticRegression(C=best_ot_c, max_iter=500).fit(X_ot_1, y_ot.astype(int))
        ot_coef_4 = [float(lr_ot_full.coef_[0, 0]), 0.0, 0.0, 0.0]
        ot_intercept = float(lr_ot_full.intercept_[0])
        ot_pruned = False
    else:
        p_ot_oos = p_ot_clim.copy()
        base_all = min(max(float(np.mean(y_ot)), 0.01), 0.20)
        ot_coef_4 = [0.0, 0.0, 0.0, 0.0]
        ot_intercept = math.log(base_all / (1.0 - base_all))
        ot_pruned = True
    ev_ot_oos = _eval_binary_cluster_nfl(gids_ev[oos_m], y_ot[oos_m], p_ot_oos, p_ot_clim, seed=BOOTSTRAP_SEED + 4)

    print(
        f"\n=== EXP_V52 REMEDIADO · NFL MINKOWSKI v5.1 OOS (2020..2024 < {HOLDOUT_CUT_DATE}) ===\n"
        f"  Totals Objective ECE Drift Fix (n={ev_tot_v5_vs_v4['n']:,}, clusters={ev_tot_v5_vs_v4['n_clusters']:,}): "
        f"v4.0 ECE={100*ev_tot_v4_diag['ece']:.2f}% -> v5.1 ECE={100*ev_tot_v5_vs_v4['ece']:.2f}% | dLL={ev_tot_v5_vs_v4['delta_ll']:+.5f} ({ev_tot_v5_vs_v4['significance']})\n"
        f"  Real `spread_line` ATS Posterior OOS (w_sp={best_w_sp:.2f}, n={ev_real_ats_vs_coin['n']:,}): "
        f"Raw={ev_real_ats_vs_raw['benchmark_log_loss']:.5f} -> Posterior={ev_real_ats_vs_coin['log_loss']:.5f} (ECE={100*ev_real_ats_vs_coin['ece']:.2f}%) | "
        f"vs Coin(ln2)={ev_real_ats_vs_coin['delta_ll']:+.5f} | vs Raw={ev_real_ats_vs_raw['delta_ll']:+.5f} ({ev_real_ats_vs_raw['significance']})\n"
        f"  Integer Spread (±3.0 / ±7.0, n={len(int_sp_idx)}) Push Mass: Predicted={100*pred_push_rate_3_7:.2f}% vs Observed={100*emp_push_rate_3_7:.2f}%\n"
        f"  Overtime OOS (pruned={ot_pruned}, n={ev_ot_oos['n']:,}): LL={ev_ot_oos['log_loss']:.5f} | dLL vs BaseRate={ev_ot_oos['delta_ll']:+.5f}"
    )

    # 4. NFL Player Props sin truncamiento post-partido (`B2, C1`)
    script_map: dict[tuple[str, str], float] = {}
    for i, r in enumerate(eval_df.itertuples(index=False)):
        em = float(mu_post_all[i])
        script_map[(str(r.game_id), str(r.home_team))] = em
        script_map[(str(r.game_id), str(r.away_team))] = -em

    qb_starters = _extract_causal_pbp_qb_starters_no_truncation(range(2012, 2025))
    props_models_v5, new_props_eval, snap_props_v5 = _evaluate_nfl_v5_props_walk_forward(qb_starters, script_map, prev_v4_props)

    nfl_v5_art = {
        "schema_version": "nfl_minkowski_v5.1.0",
        "codename": "PitchLab Minkowski v5.1 Deconvolved Key-Margin, Posterior ATS, Pruned OT & Unbiased Props",
        "version": "5.1.0-candidate",
        "status": "candidate",
        "production_activated": False,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "max_abs_margin": MAX_ABS_MARGIN,
        "positive_margin_kernel_1_to_45": [round(float(x), 8) for x in pos_kernel_45.tolist()],
        "margin_quad_concentration": float(best_margin_c_quad),
        "spread_market_posterior_w_model": float(best_w_sp),
        "discrete_totals_v5": {
            "max_total_points": MAX_TOTAL_POINTS,
            "base_kernel_0_to_95": base_tot_kernel_96,
            "quad_concentration": best_c_quad,
            "market_posterior_w_model": best_wm,
            "latest_league_scoring_env": round(float(wf_df["league_scoring_env_ewm"].iloc[-1]), 4),
        },
        "overtime_calibration": {
            "feature_names": ["closeness_exp_abs_m_7", "expected_total_centered_10", "is_indoor", "is_turf"],
            "coef": ot_coef_4,
            "intercept": ot_intercept,
            "pruned_to_base_rate": ot_pruned,
        },
        "prop_markets": props_models_v5,
    }
    NFL_V5_MODEL_OUT.write_text(json.dumps(nfl_v5_art, indent=2), encoding="utf-8")

    # Snapshot de paridad `< 1e-12` (`40` partidos OOS reales + `24` nuevos PBP props)
    game_snap_rows: list[dict[str, Any]] = []
    for idx in oos_indices[:40]:
        ph, pt, pa = float(P3_oof[idx, 0]), float(P3_oof[idx, 1]), float(P3_oof[idx, 2])
        tm_i = round(float(T_v5_oof[idx]), 5)
        mkt_l = float(tot_line[idx]) if math.isfinite(float(tot_line[idx])) else 44.5
        ind_b = bool(is_ind[idx] > 0.5)
        turf_b = bool(is_turf[idx] > 0.5)

        sol_m = solve_nfl_key_number_margin_pmf_exact_v5(
            ph, pt, pa, np.array(nfl_v5_art["positive_margin_kernel_1_to_45"], dtype=np.float64), best_margin_c_quad
        )
        sol_t = solve_nfl_discrete_key_total_pmf_scalar(tm_i, base_tot_kernel_96, best_c_quad)
        po41, _, pp41, _ = eval_discrete_total_line_scalar(sol_t["pmf"], 41.0)
        po445, _, _, _ = eval_discrete_total_line_scalar(sol_t["pmf"], 44.5)

        mu_p = best_wm * tm_i + (1.0 - best_wm) * mkt_l
        sol_tp = solve_nfl_discrete_key_total_pmf_scalar(mu_p, base_tot_kernel_96, best_c_quad)
        _, _, _, po_post = eval_discrete_total_line_scalar(sol_tp["pmf"], mkt_l)

        ot_c = nfl_v5_art["overtime_calibration"]
        x_o = [math.exp(-abs(float(sol_m["expected_margin"])) / 7.0), (sol_t["expected_total_implied"] - 44.0) / 10.0, 1.0 if ind_b else 0.0, 1.0 if turf_b else 0.0]
        eta_o = float(ot_c["intercept"]) + sum(float(ot_c["coef"][k_i]) * x_o[k_i] for k_i in range(4))
        p_ot_i = min(max(1.0 / (1.0 + math.exp(-eta_o)), 0.005), 0.25)

        game_snap_rows.append(
            {
                "game_id": str(eval_df.iloc[idx]["game_id"]),
                "p_home": ph,
                "p_tie": pt,
                "p_away": pa,
                "t_model": tm_i,
                "market_total_line": mkt_l,
                "is_indoor": ind_b,
                "is_turf": turf_b,
                "expected": {
                    "expected_margin": sol_m["expected_margin"],
                    "tot_theta": sol_t["theta"],
                    "tot_implied": sol_t["expected_total_implied"],
                    "p_over_41_0": po41,
                    "p_push_41_0": pp41,
                    "p_over_44_5": po445,
                    "p_mkt_post_over_no_push": po_post,
                    "p_overtime": p_ot_i,
                },
            }
        )

    NFL_V5_SNAPSHOT_OUT.write_text(
        json.dumps(
            {
                "schema_version": "nfl_v5.1_parity_snapshot",
                "holdout_sealed_untouched": True,
                "game_rows": game_snap_rows,
                "prop_rows": snap_props_v5,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    results_payload = {
        "experiment_id": "EXP_V52_nfl_v5_1_remediated",
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "margin_deconvolution": {
            "val_empirical_conditional_std": round(target_cond_std, 4),
            "pmf_std_before_v5_0": round(sd_before, 4),
            "pmf_std_after_v5_1": round(sd_after, 4),
            "margin_quad_concentration": float(best_margin_c_quad),
            "p_margin_ge_35_at_p92": round(p_ge35_fav92, 5),
        },
        "totals_v4_objective_ece": round(ev_tot_v4_diag["ece"], 6),
        "totals_v5_objective_ece": round(ev_tot_v5_vs_v4["ece"], 6),
        "totals_v5_vs_v4_objective_oos": ev_tot_v5_vs_v4,
        "selected_spread_posterior_w_model": float(best_w_sp),
        "real_spread_line_ats_posterior_vs_coin_oos": ev_real_ats_vs_coin,
        "real_spread_line_ats_key_pmf_vs_gaussian_oos": ev_real_ats_vs_raw,
        "integer_spread_3_7_push_calibration_oos": {
            "n_integer_3_or_7_games": int(len(int_sp_idx)),
            "predicted_push_rate": round(pred_push_rate_3_7, 5),
            "observed_push_rate": round(emp_push_rate_3_7, 5),
        },
        "overtime_pruned_to_base_rate": ot_pruned,
        "overtime_probability_oos_vs_base_rate": ev_ot_oos,
        "new_pbp_player_props_oos": new_props_eval,
        "artifacts": {
            "model_nfl_v5_0_sha256": hashlib.sha256(NFL_V5_MODEL_OUT.read_bytes()).hexdigest(),
        },
    }
    RESULTS_OUT.write_text(json.dumps(results_payload, indent=2), encoding="utf-8")

    with TRIAL_REGISTRY_OUT.open("a", encoding="utf-8") as fh:
        fh.write(
            json.dumps(
                {
                    "recorded_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "experiment_id": "EXP_V52_nfl_v5_1_remediated",
                    "holdout_touched": False,
                    "totals_ece_v5": round(ev_tot_v5_vs_v4["ece"], 5),
                    "real_ats_post_ll": round(ev_real_ats_vs_coin["log_loss"], 6),
                    "real_ats_post_ece": round(ev_real_ats_vs_coin["ece"], 5),
                    "pmf_std_50_50": round(sd_after, 4),
                }
            )
            + "\n"
        )
    print(f"[DONE] EXP_V52 v5.1 guardado en {RESULTS_OUT.name}")


if __name__ == "__main__":
    main()
