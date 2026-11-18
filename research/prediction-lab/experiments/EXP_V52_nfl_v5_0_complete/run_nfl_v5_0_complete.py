"""EXP_V52 — NFL `Minkowski v5.0`: Totales sin Deriva Estacional (`ECE < 1.5%`), Kernel Discreto de Totales Clave, `ATS` Real sobre `spread_line`, `Overtime` y `Sacks / QB Rush` Props.

Supera los techos residuales de `EXP_V45 (v4.0)` bajo corte duro `< 2025-02-02` (`holdout_sealed` intacto):
  1. Elimina el `ECE = 4.71%` en líneas objetivas de `EXP_V45` descomponiendo causalmente (`gameday' < gameday`):
       `ExpectedTotal_v5(t) = LeagueScoringEnvEWM(t) + TeamDeltaRidge(X_t)`
     absorbiendo cambios reglamentarios y de arbitraje contemporáneos (`holding 2020`, `two-high shells 2022-23`, `kickoffs 2024`).
  2. Proyecta totales mediante el **Kernel Discreto de Totales Clave NFL (`k = 0..95`)** con inclinación exponencial exacta
     de 52 pasos (`solveNflDiscreteKeyTotalPmfExactV5`), preservando picos discretos en `33, 37, 40, 41, 43, 44, 47, 48, 51, 54`
     y masa exacta de `push` en líneas enteras (`41.0, 44.0, 47.0`).
  3. Integra `data/nfl/processed/nfl_games.parquet` (`< 2025-02-02`) para validar `ATS` directamente contra la `spread_line`
     real histórica de cada juego y calibrar la probabilidad explícita de `Overtime` (`overtime == 1`).
  4. Incorpora y valida walk-forward en `pbp_pruned_2012..2024.parquet` (`< 2025-02-02`) dos nuevos mercados PBP:
     `qb_sacks_taken` (`Over 2.5`) y `qb_rush_attempts` (`Over 4.5`).
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
from scipy.special import ndtri
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

from pbp_ingest import HOLDOUT_CUT_DATE, HOLDOUT_CUT_ISO, assert_dates_strictly_before_holdout  # noqa: E402
from run_micro_markets_experiment import (  # noqa: E402
    _estimate_nb_dispersion_mom,
    line_probs_from_pmf,
    nb_pmf_exact,
    paired_bootstrap_binary,
)
from run_nfl_v4_0_complete import (  # noqa: E402
    FIRST_EVAL_SEASON,
    FIRST_TRAIN_SEASON,
    MAX_ABS_MARGIN,
    OBJECTIVE_TOTAL_LINES,
    VAL_MAX_SEASON,
    _extract_pbp_player_game_logs,
    build_empirical_positive_margin_kernel,
    normal_cdf_vec,
    project_spread_from_margin_pmf_exact,
    solve_nfl_key_number_margin_pmf_exact,
)

NFL_V5_MODEL_OUT = REPO_ROOT / "src" / "data" / "prediction" / "model_nfl_v5_0_candidate.json"
NFL_V5_SNAPSHOT_OUT = REPO_ROOT / "src" / "data" / "prediction" / "nfl_v5_0_snapshot.json"
RESULTS_OUT = ARTIFACTS_DIR / "exp_v52_nfl_v5_0_results.json"
TRIAL_REGISTRY_OUT = EXP_DIR / "trial_registry_nfl_v50.jsonl"

MAX_TOTAL_POINTS = 95


def _compute_causal_league_scoring_env_ewm(df: pd.DataFrame) -> np.ndarray:
    """Rastrea estrictamente en orden causal (`gameday' < gameday`) el régimen contemporáneo de puntos totales NFL."""
    n = len(df)
    out = np.empty(n, dtype=np.float64)
    gdays = df["gameday"].astype(str).str.slice(0, 10).to_numpy()
    seasons = df["season"].to_numpy(dtype=int)
    tots = (df["home_score"] + df["away_score"]).to_numpy(dtype=np.float64)

    cur_env = 43.2
    prev_season: int | None = None
    alpha_day = 0.24  # ~7 jornadas efectivas (~100 partidos NFL)

    i = 0
    while i < n:
        s_cur = int(seasons[i])
        if prev_season is not None and s_cur != prev_season:
            # Regresión suave de pretemporada hacia ancla secular pre-2020 (sin mirar futuro)
            cur_env = 0.68 * cur_env + 0.32 * 44.2
        prev_season = s_cur

        gd_cur = gdays[i]
        j = i + 1
        while j < n and gdays[j] == gd_cur:
            j += 1

        # Emitir `cur_env` ANTES de observar los partidos de `gd_cur`
        out[i:j] = cur_env

        # Actualizar con el promedio del bloque de fecha `gd_cur` ponderado por tamaño de jornada
        day_n = j - i
        w_eff = min(alpha_day * (day_n / 12.0), 0.35)
        day_mean = float(np.mean(tots[i:j]))
        cur_env = (1.0 - w_eff) * cur_env + w_eff * day_mean
        i = j

    return out


def build_empirical_total_points_kernel_0_to_95(totals_val: np.ndarray) -> list[float]:
    """Construye en `<= 2019` (`< 2025-02-02`) el kernel base de puntos totales NFL `0..95` preservando picos clave."""
    ks = np.arange(MAX_TOTAL_POINTS + 1, dtype=np.float64)
    emp_counts = np.zeros(MAX_TOTAL_POINTS + 1, dtype=np.float64)
    t_int = np.clip(np.round(totals_val).astype(int), 0, MAX_TOTAL_POINTS)
    for v in t_int:
        emp_counts[int(v)] += 1.0
    emp_pmf = emp_counts / max(float(np.sum(emp_counts)), 1.0)

    mu0 = float(np.mean(totals_val))
    sd0 = max(float(np.std(totals_val)), 10.0)
    smooth = np.exp(-0.5 * ((ks - mu0) / sd0) ** 2)
    smooth[:6] *= 0.05  # casi imposible < 6 puntos en NFL moderna
    smooth /= float(np.sum(smooth))

    # Mezcla 65% empírica (captura picos exactos en 33, 37, 40, 41, 43, 44, 47, 48, 51, 54) + 35% soporte suave continuo
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
        max_lp = -1e30
        for k in range(max_k + 1):
            lp = float(log_base[k]) + mid * float(k)
            if lp > max_lp:
                max_lp = lp
        sum_w = 0.0
        sum_kw = 0.0
        for k in range(max_k + 1):
            w = math.exp(float(log_base[k]) + mid * float(k) - max_lp)
            sum_w += w
            sum_kw += float(k) * w
        if (sum_kw / max(sum_w, 1e-30)) < target:
            lo = mid
        else:
            hi = mid

    theta = 0.5 * (lo + hi)
    max_lp = -1e30
    for k in range(max_k + 1):
        lp = float(log_base[k]) + theta * float(k)
        if lp > max_lp:
            max_lp = lp
    pmf = np.empty(max_k + 1, dtype=np.float64)
    sum_w = 0.0
    for k in range(max_k + 1):
        w = math.exp(float(log_base[k]) + theta * float(k) - max_lp)
        pmf[k] = w
        sum_w += w
    inv_s = 1.0 / max(sum_w, 1e-30)
    imp_mean = 0.0
    for k in range(max_k + 1):
        pmf[k] *= inv_s
        imp_mean += float(k) * float(pmf[k])

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


def _evaluate_nfl_v5_props_walk_forward(
    qb_df: pd.DataFrame,
    rush_df: pd.DataFrame,
    script_map: dict[tuple[str, str], float],
    prev_v4_props: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]]]:
    """Valida walk-forward `qb_sacks_taken` (`Over 2.5`) y `qb_rush_attempts` (`Over 4.5`) sobre PBP 2012..2024."""
    qb_starters = qb_df[qb_df["pass_attempts"] >= 15.0].drop_duplicates(["game_id", "posteam"], keep="first").copy()
    # Unir los acarreos del propio QB (`rusher_player_id == passer_player_id`) desde `rush_df`
    qb_rushes = rush_df.rename(columns={"rusher_player_id": "passer_player_id", "rush_attempts": "qb_carries", "scrambles": "qb_scrambles"})[
        ["game_id", "posteam", "passer_player_id", "qb_carries", "qb_scrambles"]
    ]
    qb_starters = qb_starters.merge(qb_rushes, on=["game_id", "posteam", "passer_player_id"], how="left")
    qb_starters["qb_carries"] = qb_starters["qb_carries"].fillna(0.0).astype(np.float64)
    qb_starters = qb_starters.sort_values(["gd_str", "game_id", "posteam"], kind="mergesort").reset_index(drop=True)

    alpha_p = 2.0 / 9.0
    alpha_t = 2.0 / 13.0
    qb_sk_ewm: dict[str, float] = {}
    qb_ru_ewm: dict[str, float] = {}
    qb_n: dict[str, int] = defaultdict(int)
    ol_sk_ewm: dict[str, float] = {}
    def_sk_ewm: dict[str, float] = {}
    def_qbru_ewm: dict[str, float] = {}

    n_qb = len(qb_starters)
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

        ru_eb = (n_p * qb_ru_ewm.get(pid, 3.10) + 4.0 * 3.10) / (n_p + 4.0)
        def_ru_exc = (def_qbru_ewm.get(opp, 3.10) - 3.10) / 1.5

        exp_m = script_map.get((gid, tm), 0.0)
        trailing_idx = -exp_m / 7.0
        leading_idx = exp_m / 7.0

        X_sk[i] = [math.log(max(sk_eb, 0.45)), (ol_base - 2.35) / 1.2, def_sk_exc, trailing_idx]
        X_qbru[i] = [math.log(max(ru_eb, 0.40)), def_ru_exc, leading_idx, abs(trailing_idx)]
        raw_sk[i] = qb_sk_ewm.get(pid, 2.35)
        raw_qbru[i] = qb_ru_ewm.get(pid, 3.10)

        # Post-game update (`w' < w`)
        obs_s = float(r.sacks)
        obs_qr = float(r.qb_carries)
        qb_sk_ewm[pid] = alpha_p * obs_s + (1.0 - alpha_p) * qb_sk_ewm.get(pid, obs_s)
        qb_ru_ewm[pid] = alpha_p * obs_qr + (1.0 - alpha_p) * qb_ru_ewm.get(pid, obs_qr)
        qb_n[pid] += 1
        ol_sk_ewm[tm] = alpha_t * obs_s + (1.0 - alpha_t) * ol_base
        def_sk_ewm[opp] = alpha_t * obs_s + (1.0 - alpha_t) * def_sk_ewm.get(opp, 2.35)
        def_qbru_ewm[opp] = alpha_t * obs_qr + (1.0 - alpha_t) * def_qbru_ewm.get(opp, 3.10)

    seas_qb = qb_starters["season"].to_numpy(dtype=int)
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
            ["log_qb_carries_eb", "opp_qb_rush_allowed_exc", "leading_script_idx", "abs_script_volatility"],
        ),
    ]

    models_out: dict[str, Any] = dict(prev_v4_props["markets"])
    evals_out: dict[str, Any] = {}
    snap_props: list[dict[str, Any]] = []

    for m_name, line_v, max_k, X_m, y_m, raw_m, f_names in new_specs:
        val_m = (seas_qb >= 2014) & (seas_qb <= VAL_MAX_SEASON)
        oos_m = seas_qb >= 2020

        pr_val = PoissonRegressor(alpha=0.05, max_iter=600).fit(X_m[val_m], y_m[val_m])
        mu_val = np.clip(pr_val.predict(X_m[val_m]), 0.25, 30.0)
        r_disp = min(max(_estimate_nb_dispersion_mom(y_m[val_m], mu_val), 0.8), 80.0)

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
        boot_p = paired_bootstrap_binary(yb_oos, p_v5, p_raw)
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
            "line": line_v,
            "dispersion_r": round(r_disp, 4),
            "mae_v5_0": round(mae_v5, 4),
            "mae_naive_ewma": round(mae_rw, 4),
            "vs_naive_ewma_poisson": boot_p,
        }
        print(
            f"  [NFL Prop v5.0 {m_name:16s}] OOS n={len(y_oos):,} | MAE: v5.0={mae_v5:.3f} vs Raw={mae_rw:.3f} | "
            f"LL={boot_p['log_loss']:.5f} (ECE={boot_p['ece']:.5f}) | dLL={boot_p['delta_ll']:+.5f} ({boot_p['significance']})"
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

    # Unir `nfl_games.parquet` (`< 2025-02-02`) para obtener `spread_line`, `overtime` y `surface` reales
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

    # Régimen anotador contemporáneo causal `LeagueScoringEnvEWM(t)` (`gameday' < gameday`)
    wf_df["league_scoring_env_ewm"] = _compute_causal_league_scoring_env_ewm(wf_df)

    gbm_v35 = json.loads((REPO_ROOT / "src" / "data" / "prediction" / "gbm_nfl_v3_5_candidate.json").read_text(encoding="utf-8"))
    tot_v35 = json.loads((REPO_ROOT / "src" / "data" / "prediction" / "model_nfl_totals_v3_5_candidate.json").read_text(encoding="utf-8"))
    prev_v4_props = json.loads((REPO_ROOT / "src" / "data" / "prediction" / "model_nfl_props_v4_0_candidate.json").read_text(encoding="utf-8"))

    eval_df = wf_df[wf_df["season"] >= FIRST_EVAL_SEASON].copy().reset_index(drop=True)
    seasons_ev = eval_df["season"].to_numpy(dtype=int)
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

        # v4.0 (sin centrado de régimen contemporáneo)
        rg_v4 = Ridge(alpha=alpha_tot).fit(Z_tr, tot_tr_raw, sample_weight=sw)
        T_v4_oof[pos_i : pos_i + cnt] = np.clip(rg_v4.predict(Z_te), 30.0, 64.0)

        # v5.0 (descompuesto en `LeagueScoringEnvEWM(t) + TeamDeltaRidge(X_t)`)
        rg_v5 = Ridge(alpha=alpha_tot * 1.5).fit(Z_tr, tot_tr_raw - env_tr, sample_weight=sw)
        T_v5_oof[pos_i : pos_i + cnt] = np.clip(env_te + rg_v5.predict(Z_te), 28.0, 66.0)
        pos_i += cnt

    # =========================================================================
    # 1. Calibrar `quad_concentration` del Kernel Discreto de Totales Clave en `VAL <= 2019`
    #    y verificar caída de `ECE` en `OOS 2020..2024` (`4.71% -> < 1.5%`)
    # =========================================================================
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
    p_obj_v5 = np.concatenate([np.array([eval_discrete_total_line_scalar(pmf, ln_o)[0] for pmf in pmfs_tot_oos]) for ln_o in OBJECTIVE_TOTAL_LINES])
    p_obj_v4 = np.concatenate([normal_cdf_vec((T_v4_oof[oos_m] - ln_o) / 14.0) for ln_o in OBJECTIVE_TOTAL_LINES])

    ev_tot_v5_vs_v4 = paired_bootstrap_binary(y_obj_oos, p_obj_v5, p_obj_v4)
    ev_tot_v4_diag = paired_bootstrap_binary(y_obj_oos, p_obj_v4, p_obj_v4)

    # Calibrar `w_model` posterior sobre línea de mercado en `VAL <= 2019`
    valid_mkt = np.isfinite(tot_line) & (np.abs(tot_ev - tot_line) > 1e-6)
    val_mkt = valid_mkt & val_m
    oos_mkt = valid_mkt & oos_m
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

    # =========================================================================
    # 2. Validación `ATS` contra `spread_line` Real (`nfl_games.parquet` `< 2025-02-02`)
    # =========================================================================
    valid_sp_val = val_m & np.isfinite(raw_spread_line)
    corr_sp = float(np.corrcoef(raw_spread_line[valid_sp_val], margin_ev[valid_sp_val])[0, 1])
    # En nflverse `spread_line > 0` cuando local es favorito (`corr > 0`), luego el hándicap de apuesta local es `-spread_line`
    spread_home_hc = -raw_spread_line if corr_sp > 0.0 else raw_spread_line

    pmfs_margin_all = [
        solve_nfl_key_number_margin_pmf_exact(float(P3_oof[i, 0]), float(P3_oof[i, 1]), float(P3_oof[i, 2]), pos_kernel_45)
        for i in range(len(eval_df))
    ]

    valid_ats_oos = oos_m & np.isfinite(spread_home_hc) & (np.abs(margin_ev + spread_home_hc) > 1e-6)
    ats_oos_idx = np.where(valid_ats_oos)[0]
    y_ats_oos = (margin_ev[ats_oos_idx] + spread_home_hc[ats_oos_idx] > 0.0).astype(np.float64)

    p_win_ats = np.clip(P3_oof[ats_oos_idx, 0] / np.maximum(P3_oof[ats_oos_idx, 0] + P3_oof[ats_oos_idx, 2], 1e-12), 1e-6, 1.0 - 1e-6)
    mu_gauss_ats = 13.8 * ndtri(p_win_ats)
    p_gauss_ats = normal_cdf_vec((mu_gauss_ats + spread_home_hc[ats_oos_idx]) / 13.8)
    p_key_ats = np.array([project_spread_from_margin_pmf_exact(pmfs_margin_all[idx]["pmf"], float(spread_home_hc[idx]))["pHomeCoverNoPush"] for idx in ats_oos_idx])
    ev_real_ats = paired_bootstrap_binary(y_ats_oos, p_key_ats, p_gauss_ats)

    # Verificar masa empírica real de `push` en spreads enteros (`±3.0, ±7.0`) en OOS 2020..2024
    int_sp_oos = oos_m & np.isfinite(spread_home_hc) & (np.isin(np.abs(spread_home_hc), [3.0, 7.0]))
    int_sp_idx = np.where(int_sp_oos)[0]
    emp_push_rate_3_7 = float(np.mean(np.abs(margin_ev[int_sp_idx] + spread_home_hc[int_sp_idx]) < 1e-6)) if len(int_sp_idx) > 0 else 0.0
    pred_push_rate_3_7 = (
        float(np.mean([project_spread_from_margin_pmf_exact(pmfs_margin_all[idx]["pmf"], float(spread_home_hc[idx]))["pPush"] for idx in int_sp_idx]))
        if len(int_sp_idx) > 0
        else 0.0
    )

    # =========================================================================
    # 3. Calibración y Validación `OOS` de `Overtime` (`overtime == 1`)
    # =========================================================================
    ot_col = "overtime" if "overtime" in eval_df.columns else "overtime_ng"
    sf_col = "surface" if "surface" in eval_df.columns else "surface_ng"
    y_ot = (pd.to_numeric(eval_df[ot_col], errors="coerce").fillna(0.0).to_numpy(dtype=np.float64) > 0.5).astype(np.float64)
    exp_m_all = np.array([float(sol["expected_margin"]) for sol in pmfs_margin_all], dtype=np.float64)
    is_ind = (pd.to_numeric(eval_df["is_indoor"], errors="coerce").fillna(0.0).to_numpy(dtype=np.float64) > 0.5).astype(np.float64)
    surf_s = eval_df[sf_col].fillna("").astype(str).str.lower()
    is_turf = (~surf_s.str.contains("grass")).astype(np.float64).to_numpy()

    X_ot = np.column_stack(
        [
            np.exp(-np.abs(exp_m_all) / 7.0),
            (T_v5_oof - 44.0) / 10.0,
            is_ind,
            is_turf,
        ]
    )
    lr_ot = LogisticRegression(C=0.04, max_iter=500).fit(X_ot[val_m], y_ot[val_m].astype(int))
    p_ot_oos = np.clip(lr_ot.predict_proba(X_ot[oos_m])[:, 1], 0.005, 0.25)
    p_ot_clim = np.full(int(np.sum(oos_m)), float(np.mean(y_ot[val_m])), dtype=np.float64)
    ev_ot_oos = paired_bootstrap_binary(y_ot[oos_m], p_ot_oos, p_ot_clim)

    print(
        f"\n=== EXP_V52 NFL MINKOWSKI v5.0 OOS (2020..2024 < {HOLDOUT_CUT_DATE}) ===\n"
        f"  Totals Objective ECE Drift Fix (n={ev_tot_v5_vs_v4['n']:,}): v4.0 ECE={100*ev_tot_v4_diag['ece']:.2f}% -> "
        f"v5.0 ECE={100*ev_tot_v5_vs_v4['ece']:.2f}% | dLL vs v4.0={ev_tot_v5_vs_v4['delta_ll']:+.5f} ({ev_tot_v5_vs_v4['significance']})\n"
        f"  Real `spread_line` ATS OOS (n={ev_real_ats['n']:,}): Gaussian={ev_real_ats['benchmark_log_loss']:.5f} -> "
        f"Key-Number PMF={ev_real_ats['log_loss']:.5f} (ECE={ev_real_ats['ece']:.5f}) | dLL={ev_real_ats['delta_ll']:+.5f} ({ev_real_ats['significance']})\n"
        f"  Integer Spread (±3.0 / ±7.0, n={len(int_sp_idx)}) Push Mass: Predicted={100*pred_push_rate_3_7:.2f}% vs Observed={100*emp_push_rate_3_7:.2f}%\n"
        f"  Overtime Probability OOS (n={ev_ot_oos['n']:,}): ECE={100*ev_ot_oos['ece']:.2f}% | "
        f"dLL vs BaseRate={ev_ot_oos['delta_ll']:+.5f} ({ev_ot_oos['significance']})"
    )

    # =========================================================================
    # 4. Nuevos NFL Player Props (`qb_sacks_taken`, `qb_rush_attempts`) + 3 mercados v4.0
    # =========================================================================
    script_map: dict[tuple[str, str], float] = {}
    for i, r in enumerate(eval_df.itertuples(index=False)):
        em = float(pmfs_margin_all[i]["expected_margin"])
        script_map[(str(r.game_id), str(r.home_team))] = em
        script_map[(str(r.game_id), str(r.away_team))] = -em

    qb_df, rush_df = _extract_pbp_player_game_logs(range(2012, 2025))
    props_models_v5, new_props_eval, snap_props_v5 = _evaluate_nfl_v5_props_walk_forward(qb_df, rush_df, script_map, prev_v4_props)

    lr_ot_full = LogisticRegression(C=0.04, max_iter=500).fit(X_ot, y_ot.astype(int))
    nfl_v5_art = {
        "schema_version": "nfl_minkowski_v5.0.0",
        "codename": "PitchLab Minkowski v5.0 Drift-Free Discrete Key-Totals, Real ATS, Overtime & Sacks/QB-Rush Props",
        "version": "5.0.0-candidate",
        "status": "candidate",
        "production_activated": False,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "max_abs_margin": MAX_ABS_MARGIN,
        "positive_margin_kernel_1_to_45": [round(float(x), 8) for x in pos_kernel_45.tolist()],
        "discrete_totals_v5": {
            "max_total_points": MAX_TOTAL_POINTS,
            "base_kernel_0_to_95": base_tot_kernel_96,
            "quad_concentration": best_c_quad,
            "market_posterior_w_model": best_wm,
            "latest_league_scoring_env": round(float(wf_df["league_scoring_env_ewm"].iloc[-1]), 4),
        },
        "overtime_calibration": {
            "feature_names": ["closeness_exp_abs_m_7", "expected_total_centered_10", "is_indoor", "is_turf"],
            "coef": [float(v) for v in lr_ot_full.coef_[0].tolist()],
            "intercept": float(lr_ot_full.intercept_[0]),
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

        sol_m = solve_nfl_key_number_margin_pmf_exact(ph, pt, pa, np.array(nfl_v5_art["positive_margin_kernel_1_to_45"], dtype=np.float64))
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
                "schema_version": "nfl_v5.0_parity_snapshot",
                "holdout_sealed_untouched": True,
                "game_rows": game_snap_rows,
                "prop_rows": snap_props_v5,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    results_payload = {
        "experiment_id": "EXP_V52_nfl_v5_0_complete",
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "totals_v4_objective_ece": round(ev_tot_v4_diag["ece"], 6),
        "totals_v5_objective_ece": round(ev_tot_v5_vs_v4["ece"], 6),
        "totals_v5_vs_v4_objective_oos": ev_tot_v5_vs_v4,
        "real_spread_line_ats_key_pmf_vs_gaussian_oos": ev_real_ats,
        "integer_spread_3_7_push_calibration_oos": {
            "n_integer_3_or_7_games": int(len(int_sp_idx)),
            "predicted_push_rate": round(pred_push_rate_3_7, 5),
            "observed_push_rate": round(emp_push_rate_3_7, 5),
        },
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
                    "experiment_id": "EXP_V52_nfl_v5_0_complete",
                    "holdout_touched": False,
                    "totals_ece_v5": round(ev_tot_v5_vs_v4["ece"], 5),
                    "real_ats_dll": round(ev_real_ats["delta_ll"], 6),
                    "sacks_dll": round(new_props_eval["qb_sacks_taken"]["vs_naive_ewma_poisson"]["delta_ll"], 6),
                }
            )
            + "\n"
        )
    print(f"[DONE] EXP_V52 guardado en {RESULTS_OUT.name}")


if __name__ == "__main__":
    main()
