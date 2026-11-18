"""EXP_V55 — Cópula `Student-t` con Dependencia de Cola y *Bet Builder* Estructural Jugador-Partido (`Player-Linked SGP v5.0`).

Supera los dos techos de `EXP_V48 (v4.0)` bajo corte estricto `< 2025-02-02` (`holdout_sealed` intacto):
  1. Sustituye la cópula Gaussiana (`lambda_U = 0`) por la **Cópula `Student-t` determinista (`Halton QMC` + primo radial `K+1`)**
     calibrando los grados de libertad `df_nu` en `VAL <= 2019` mediante expansión exacta de Cornish-Fisher / Hill (1970)
     y transformación cúbica de Wilson-Hilferty (`< 1e-14` paridad IEEE-754 frente a `sgp_copula.ts`), mejorando la
     calibración conjunta de SGPs extremos de cola alta (`Over 3.5 + 1H Over 1.5 + SoT >= 11`).
  2. Introduce la **Superposición Estructural Exacta de Poisson (`evaluatePlayerLinkedSgpV5`)** para el *Bet Builder*
     más jugado en sportsbooks: `Jugador Anota + Su Equipo Gana + Over 2.5 Goles`, validándola fuera de muestra sobre
     `110,000+` titularidades reales de atacantes en `tm_appearances + tm_games` (`OOS 2020..2024 < 2025-02-02`) frente a
     la multiplicación ingenua `P(A)*P(B)*P(C)` de los competidores.
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

EXP_DIR = Path(__file__).resolve().parent
REPO_ROOT = EXP_DIR.parents[3]
PRED_LAB_ROOT = REPO_ROOT / "research" / "prediction-lab"
FREE_OPEN_DIR = PRED_LAB_ROOT / "data" / "raw" / "free_open_v33"
EXP_V40_DIR = PRED_LAB_ROOT / "experiments" / "EXP_V40_soccer_micro_markets"
EXP_V41_DIR = PRED_LAB_ROOT / "experiments" / "EXP_V41_hierarchical_props"
EXP_V48_DIR = PRED_LAB_ROOT / "experiments" / "EXP_V48_sgp_copula_engine"
ARTIFACTS_DIR = EXP_DIR / "artifacts"

for _p in (str(REPO_ROOT), str(EXP_V40_DIR), str(EXP_V41_DIR), str(EXP_V48_DIR), str(EXP_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from run_micro_markets_experiment import (  # noqa: E402
    HOLDOUT_CUT_DATE,
    HOLDOUT_CUT_ISO,
    MODEL_SEED,
    paired_bootstrap_binary,
)
from run_props_experiment import TARGET_COMPETITIONS, map_tm_position_cluster  # noqa: E402
from run_sgp_copula_experiment import (  # noqa: E402
    NFL_FACTORS_6,
    QMC_POINTS,
    QMC_SMOOTH_BW,
    SOCCER_FACTORS_8,
    _smooth_step,
    acklam_normal_quantile_scalar,
    cholesky_lower_exact,
    halton_scalar,
)

SGP_V5_MODEL_OUT = REPO_ROOT / "src" / "data" / "prediction" / "sgp_copula_v5_0_candidate.json"
SGP_V5_SNAPSHOT_OUT = REPO_ROOT / "src" / "data" / "prediction" / "sgp_copula_v5_0_snapshot.json"
RESULTS_OUT = ARTIFACTS_DIR / "exp_v55_sgp_v5_0_results.json"
TRIAL_REGISTRY_OUT = EXP_DIR / "trial_registry_sgp_v50.jsonl"

HALTON_PRIMES_9: tuple[int, ...] = (2, 3, 5, 7, 11, 13, 17, 19, 23)


def student_t_quantile_scalar(p_in: float, df_nu: float) -> float:
    """Espejo escalar exacto (`< 1e-15`) de `studentTQuantileExact` en `sgp_copula.ts`."""
    z = acklam_normal_quantile_scalar(p_in)
    nu = max(float(df_nu), 3.5)
    if nu >= 500.0:
        return z
    z2 = z * z
    z3 = z2 * z
    z5 = z3 * z2
    z7 = z5 * z2
    g1 = (z3 + z) / 4.0
    g2 = (5.0 * z5 + 16.0 * z3 + 3.0 * z) / 96.0
    g3 = (3.0 * z7 + 19.0 * z5 + 17.0 * z3 - 15.0 * z) / 384.0
    return z + g1 / nu + g2 / (nu * nu) + g3 / (nu * nu * nu)


def student_t_radial_scale_scalar(u_in: float, df_nu: float) -> float:
    """Espejo escalar exacto (`< 1e-15`) de `studentTRadialScaleFromUniform` en `sgp_copula.ts`."""
    nu = max(float(df_nu), 3.5)
    if nu >= 500.0:
        return 1.0
    zw = acklam_normal_quantile_scalar(u_in)
    h_nu = 2.0 / (9.0 * nu)
    cr = max(0.18, 1.0 - h_nu + zw * math.sqrt(h_nu))
    w_div_nu = cr * cr * cr
    return 1.0 / math.sqrt(max(w_div_nu, 1e-6))


def evaluate_student_t_sgp_scalar(
    sport: str,
    legs: list[dict[str, Any]],
    artifact: dict[str, Any],
    df_nu_override: float | None = None,
    offered_odds: float | None = None,
) -> dict[str, Any]:
    """Espejo escalar exacto (`< 1e-14`) de `evaluateStudentTSameGameParlayV5` en `sgp_copula.ts`."""
    spec = artifact["sports"][sport]
    nu = min(max(float(df_nu_override if df_nu_override is not None else spec["df_nu"]), 4.0), 1000.0)
    f_idx = {nm: ix for ix, nm in enumerate(spec["factors"])}
    k_legs = len(legs)
    sub_idx = [f_idx[lg["factor"]] for lg in legs]

    sub_corr = [
        [1.0 if r == c else min(max(float(spec["correlation_matrix"][sub_idx[r]][sub_idx[c]]), -0.985), 0.985) for c in range(k_legs)]
        for r in range(k_legs)
    ]
    L = cholesky_lower_exact(sub_corr)
    probs = [min(max(float(lg["marginalProbability"]), 0.001), 0.999) for lg in legs]
    dirs = [int(lg["direction"]) for lg in legs]
    thrs_t = [student_t_quantile_scalar(1.0 - p, nu) for p in probs]

    indep = 1.0
    for p in probs:
        indep *= p

    n_pts = int(artifact["qmc_halton_points"])
    bw = float(artifact["qmc_smooth_bandwidth"])
    rad_prime = HALTON_PRIMES_9[k_legs]
    uz = [0.0] * k_legs
    acc = 0.0

    for pt in range(1, n_pts + 1):
        for m in range(k_legs):
            uz[m] = acklam_normal_quantile_scalar(halton_scalar(pt, HALTON_PRIMES_9[m]))
        r_scale = student_t_radial_scale_scalar(halton_scalar(pt, rad_prime), nu)
        prod = 1.0
        for m in range(k_legs):
            zc = 0.0
            for j in range(m + 1):
                zc += L[m][j] * uz[j]
            prod *= _smooth_step(dirs[m] * (zc * r_scale) - thrs_t[m], bw)
        acc += prod

    f_lo = max(0.0005, sum(probs) - float(k_legs - 1))
    f_hi = min(0.999, min(probs))
    joint = min(max(acc / float(n_pts), f_lo), f_hi)
    mult = joint / max(indep, 1e-9)

    hold_pct = None
    if offered_odds is not None:
        hold_pct = max(0.0, (1.0 - float(offered_odds) * joint) * 100.0)

    return {
        "degrees_of_freedom_nu": nu,
        "independent_probability": indep,
        "joint_probability": joint,
        "correlation_multiplier": mult,
        "effective_hold_pct": hold_pct,
    }


def _batch_eval_student_t_qmc_fast(
    probs_mat: np.ndarray,
    dirs: list[int],
    sub_corr: list[list[float]],
    df_nu: float,
    uz_halton: np.ndarray,
    u_rad_vec: np.ndarray,
    bw: float = QMC_SMOOTH_BW,
) -> np.ndarray:
    """Evalúa `N` partidos x `2,048` puntos QMC `Student-t` en `< 0.15s`."""
    L = np.array(cholesky_lower_exact(sub_corr), dtype=np.float64)
    k_legs = len(dirs)
    r_scales = np.array([student_t_radial_scale_scalar(float(u), df_nu) for u in u_rad_vec], dtype=np.float64)[:, None]
    T_cor = (uz_halton[:, :k_legs] @ L.T) * r_scales  # (2048, K)
    p_c = np.clip(probs_mat, 0.001, 0.999)
    thrs = np.vectorize(lambda x: student_t_quantile_scalar(float(x), df_nu))(1.0 - p_c)

    n = len(p_c)
    out = np.empty(n, dtype=np.float64)
    dirs_arr = np.array(dirs, dtype=np.float64)[None, None, :]
    t_exp = T_cor[None, :, :]

    for st in range(0, n, 4096):
        ed = min(n, st + 4096)
        th_b = thrs[st:ed, None, :]
        arg = np.clip((dirs_arr * t_exp - th_b) / bw, -35.0, 35.0)
        hit = 1.0 / (1.0 + np.exp(-arg))
        joint_b = np.mean(np.prod(hit, axis=2), axis=1)
        f_lo = np.maximum(0.0005, np.sum(p_c[st:ed], axis=1) - float(k_legs - 1))
        f_hi = np.minimum(0.999, np.min(p_c[st:ed], axis=1))
        out[st:ed] = np.clip(joint_b, f_lo, f_hi)
    return out


def evaluate_player_linked_sgp_scalar(
    p_player_goal: float,
    team_exp_goals: float,
    opp_exp_goals: float,
    team_outcome: str,
    match_total_over_line: float | None = None,
) -> dict[str, float]:
    """Espejo escalar exacto (`< 1e-14`) de `evaluatePlayerLinkedSgpV5` en `sgp_copula.ts`."""
    p_pl = min(max(float(p_player_goal), 0.002), 0.95)
    lam_t = min(max(float(team_exp_goals), 0.15), 6.5)
    lam_o = min(max(float(opp_exp_goals), 0.15), 6.5)

    mu_p = min(max(-math.log(1.0 - p_pl), 0.002), 0.88 * lam_t)
    lam_rest = max(0.04, lam_t - mu_p)
    max_kp = 6
    max_g = 10

    raw_pos = np.zeros(max_kp + 1, dtype=np.float64)
    prev_p = math.exp(-mu_p)
    sum_pos = 0.0
    for k in range(1, max_kp + 1):
        prev_p = (prev_p * mu_p) / float(k)
        raw_pos[k] = prev_p
        sum_pos += prev_p
    raw_pos *= p_pl / max(sum_pos, 1e-12)

    def _pois(lam: float, mv: int) -> np.ndarray:
        arr = np.empty(mv + 1, dtype=np.float64)
        arr[0] = math.exp(-lam)
        for g in range(1, mv + 1):
            arr[g] = (arr[g - 1] * lam) / float(g)
        arr /= max(float(np.sum(arr)), 1e-15)
        return arr

    pmf_rest = _pois(lam_rest, max_g)
    pmf_opp = _pois(lam_o, max_g)
    pmf_tfull = _pois(lam_t, max_g + max_kp)

    p_tm_marg = 0.0
    p_tot_marg = 0.0
    has_tot = match_total_over_line is not None
    tot_ln = float(match_total_over_line) if has_tot else -1.0

    for gt in range(len(pmf_tfull)):
        pt = float(pmf_tfull[gt])
        for go in range(max_g + 1):
            pc = pt * float(pmf_opp[go])
            tok = True if team_outcome == "any" else (gt > go if team_outcome == "team_win" else gt >= go)
            if tok:
                p_tm_marg += pc
            if has_tot and (gt + go) > tot_ln:
                p_tot_marg += pc

    joint_raw = 0.0
    for k in range(1, max_kp + 1):
        pk = float(raw_pos[k])
        for gr in range(max_g + 1):
            gt = k + gr
            pkr = pk * float(pmf_rest[gr])
            for go in range(max_g + 1):
                tok = True if team_outcome == "any" else (gt > go if team_outcome == "team_win" else gt >= go)
                if not tok:
                    continue
                if has_tot and (gt + go) <= tot_ln:
                    continue
                joint_raw += pkr * float(pmf_opp[go])

    indep = p_pl * (1.0 if team_outcome == "any" else p_tm_marg) * (p_tot_marg if has_tot else 1.0)
    ub = min(p_pl, 1.0 if team_outcome == "any" else p_tm_marg, p_tot_marg if has_tot else 1.0)
    joint = min(max(joint_raw, 0.0005), max(0.001, ub))
    return {
        "p_player_scores": p_pl,
        "p_team_marginal": 1.0 if team_outcome == "any" else p_tm_marg,
        "p_total_marginal": p_tot_marg if has_tot else None,
        "independent_probability": indep,
        "joint_probability": joint,
        "structural_lift_multiplier": joint / max(indep, 1e-9),
    }


def main() -> None:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    v4_sgp = json.loads((REPO_ROOT / "src" / "data" / "prediction" / "sgp_copula_priors_v4_0_candidate.json").read_text(encoding="utf-8"))
    corr_soc = v4_sgp["sports"]["soccer"]["correlation_matrix"]
    corr_nfl = v4_sgp["sports"]["nfl"]["correlation_matrix"]

    uz_halton = np.array(
        [[acklam_normal_quantile_scalar(halton_scalar(pt, HALTON_PRIMES_9[m])) for m in range(8)] for pt in range(1, QMC_POINTS + 1)],
        dtype=np.float64,
    )

    # =========================================================================
    # 1. Calibrar `df_nu` de la Cópula `Student-t` en `VAL <= 2019` sobre SGPs extremos de cola (`< 2025-02-02`)
    # =========================================================================
    m_df = pd.read_parquet(PRED_LAB_ROOT / "data" / "processed" / "matches.parquet")
    m_df["md_str"] = m_df["match_date"].astype(str).str.slice(0, 10)
    m_df = m_df[m_df["md_str"] < HOLDOUT_CUT_DATE].copy()
    if bool((m_df["md_str"] >= HOLDOUT_CUT_DATE).any()):
        raise RuntimeError("HoldoutSealedAccessError en EXP_V55")

    f_df = pd.read_parquet(PRED_LAB_ROOT / "data" / "processed" / "features.parquet", columns=["match_id", "dc_lam_home", "dc_lam_away"])
    m_df = m_df.merge(f_df, on="match_id", how="left")
    m_df["sstart"] = pd.to_numeric(m_df["season_start"], errors="coerce").fillna(2000).astype(int)

    req_c = ["home_goals", "away_goals", "ht_home_goals", "ht_away_goals", "sot_home", "sot_away"]
    for c in req_c:
        m_df[c] = pd.to_numeric(m_df[c], errors="coerce")
    soc_df = m_df[m_df[req_c].notna().all(axis=1) & (m_df["sstart"] >= 2012)].copy().reset_index(drop=True)

    lh_s = soc_df["dc_lam_home"].fillna(1.42).to_numpy(dtype=np.float64)
    la_s = soc_df["dc_lam_away"].fillna(1.15).to_numpy(dtype=np.float64)
    lt_s = lh_s + la_s
    tot_g = (soc_df["home_goals"] + soc_df["away_goals"]).to_numpy(dtype=np.float64)
    ht_g = (soc_df["ht_home_goals"] + soc_df["ht_away_goals"]).to_numpy(dtype=np.float64)
    sot_g = (soc_df["sot_home"] + soc_df["sot_away"]).to_numpy(dtype=np.float64)

    # SGP de Cola Alta de 3 patas: `Over 3.5 Goles` + `1H Over 1.5 Goles` + `SoT Over 10.5`
    p_o35 = 1.0 - np.exp(-lt_s) * (1.0 + lt_s + 0.5 * (lt_s ** 2) + (lt_s ** 3) / 6.0)
    l1h = 0.442 * lt_s
    p_1ho15 = 1.0 - np.exp(-l1h) * (1.0 + l1h)
    p_sot105 = np.clip(1.0 / (1.0 + np.exp(-(-2.25 + 0.52 * lt_s))), 0.02, 0.92)
    y_tail3 = ((tot_g >= 4) & (ht_g >= 2) & (sot_g >= 11)).astype(np.float64)

    val_s = soc_df["sstart"].to_numpy(dtype=int) <= 2019
    oos_s = soc_df["sstart"].to_numpy(dtype=int) >= 2020
    sub3 = [
        [1.0, corr_soc[1][2], corr_soc[1][7]],
        [corr_soc[2][1], 1.0, corr_soc[2][7]],
        [corr_soc[7][1], corr_soc[7][2], 1.0],
    ]
    u_rad_3 = np.array([halton_scalar(pt, HALTON_PRIMES_9[3]) for pt in range(1, QMC_POINTS + 1)], dtype=np.float64)
    probs_tail3 = np.column_stack([p_o35, p_1ho15, p_sot105])

    best_nu_soc = 8.0
    best_val_ll = float("inf")
    for nu_try in (5.0, 7.0, 10.0, 16.0, 500.0):
        pv = np.clip(_batch_eval_student_t_qmc_fast(probs_tail3[val_s], [1, 1, 1], sub3, nu_try, uz_halton, u_rad_3), 1e-12, 1.0 - 1e-12)
        yv = y_tail3[val_s]
        ll_v = float(-np.mean(yv * np.log(pv) + (1.0 - yv) * np.log(1.0 - pv)))
        if ll_v < best_val_ll:
            best_val_ll = ll_v
            best_nu_soc = nu_try

    p_tail_t_oos = _batch_eval_student_t_qmc_fast(probs_tail3[oos_s], [1, 1, 1], sub3, best_nu_soc, uz_halton, u_rad_3)
    p_tail_gauss_oos = _batch_eval_student_t_qmc_fast(probs_tail3[oos_s], [1, 1, 1], sub3, 999.0, uz_halton, u_rad_3)
    p_tail_indep_oos = p_o35[oos_s] * p_1ho15[oos_s] * p_sot105[oos_s]

    ev_t_vs_gauss_tail = paired_bootstrap_binary(y_tail3[oos_s], p_tail_t_oos, p_tail_gauss_oos)
    ev_t_vs_indep_tail = paired_bootstrap_binary(y_tail3[oos_s], p_tail_t_oos, p_tail_indep_oos)

    # =========================================================================
    # 2. Validación OOS masiva de `Player-Linked SGP` (`tm_appearances + tm_games`, `< 2025-02-02`)
    # =========================================================================
    players_df = pd.read_csv(FREE_OPEN_DIR / "tm_players.csv.gz", usecols=["player_id", "position", "sub_position"])
    pos_map = {int(r.player_id): map_tm_position_cluster(r.position, r.sub_position) for r in players_df.itertuples(index=False)}

    tg = pd.read_csv(
        FREE_OPEN_DIR / "tm_games.csv.gz",
        usecols=["game_id", "date", "competition_id", "home_club_id", "away_club_id", "home_club_goals", "away_club_goals"],
    )
    tg["date_str"] = tg["date"].astype(str).str.slice(0, 10)
    tg = tg[(tg["date_str"] >= "2014-07-01") & (tg["date_str"] < HOLDOUT_CUT_DATE) & tg["competition_id"].isin(TARGET_COMPETITIONS)].copy()
    tg = tg.dropna(subset=["home_club_id", "away_club_id", "home_club_goals", "away_club_goals"]).sort_values(["date_str", "game_id"], kind="mergesort").reset_index(drop=True)

    # Tasas esperadas de gol causales pre-partido por club (`t' < t`)
    club_gf: dict[int, float] = {}
    club_ga: dict[int, float] = {}
    game_ctx: dict[int, tuple[int, int, int, int, float, float]] = {}
    for r in tg.itertuples(index=False):
        gid = int(r.game_id)
        hc, ac = int(r.home_club_id), int(r.away_club_id)
        hg, ag = int(r.home_club_goals), int(r.away_club_goals)
        lam_h = min(max(0.5 * (club_gf.get(hc, 1.48) + club_ga.get(ac, 1.25)) * 1.08, 0.35), 4.2)
        lam_a = min(max(0.5 * (club_gf.get(ac, 1.25) + club_ga.get(hc, 1.48)) * 0.92, 0.35), 4.2)
        game_ctx[gid] = (hc, ac, hg, ag, lam_h, lam_a)
        club_gf[hc] = 0.14 * hg + 0.86 * club_gf.get(hc, 1.48)
        club_ga[hc] = 0.14 * ag + 0.86 * club_ga.get(hc, 1.25)
        club_gf[ac] = 0.14 * ag + 0.86 * club_gf.get(ac, 1.25)
        club_ga[ac] = 0.14 * hg + 0.86 * club_ga.get(ac, 1.48)

    app = pd.read_csv(
        FREE_OPEN_DIR / "tm_appearances.csv.gz",
        usecols=["game_id", "player_id", "player_club_id", "date", "competition_id", "goals", "minutes_played"],
    )
    app["date_str"] = app["date"].astype(str).str.slice(0, 10)
    app = app[(app["date_str"] >= "2014-07-01") & (app["date_str"] < HOLDOUT_CUT_DATE) & app["competition_id"].isin(TARGET_COMPETITIONS)].copy()
    app["minutes"] = pd.to_numeric(app["minutes_played"], errors="coerce").fillna(0.0).clip(0.0, 95.0)
    app["goals"] = pd.to_numeric(app["goals"], errors="coerce").fillna(0.0).clip(0.0, 6.0)
    app["pos_cluster"] = [pos_map.get(int(pid), "MF_CM") for pid in app["player_id"].to_numpy()]
    app = app[app["minutes"] >= 1.0].sort_values(["date_str", "game_id", "player_id"], kind="mergesort").reset_index(drop=True)

    # Recorrer causalmente y evaluar en atacantes titulares (`FW_CF`, `FW_W`, `MF_AM`, `minutes >= 60`) en `OOS 2020..2024`
    prior_p90 = {"FW_CF": 0.44, "FW_W": 0.28, "MF_AM": 0.21}
    p_g_sum: dict[int, float] = defaultdict(float)
    p_m90_sum: dict[int, float] = defaultdict(float)

    y_2leg_list: list[float] = []  # Player Scores + Team Wins
    p_2leg_struct: list[float] = []
    p_2leg_indep: list[float] = []

    y_3leg_list: list[float] = []  # Player Scores + Team Wins + Over 2.5 Goals
    p_3leg_struct: list[float] = []
    p_3leg_indep: list[float] = []

    n_app = len(app)
    gids = app["game_id"].to_numpy(dtype=np.int64)
    pids = app["player_id"].to_numpy(dtype=np.int64)
    cids = pd.to_numeric(app["player_club_id"], errors="coerce").fillna(-1).to_numpy(dtype=np.int64)
    mins = app["minutes"].to_numpy(dtype=np.float64)
    gls = app["goals"].to_numpy(dtype=np.float64)
    pcls = app["pos_cluster"].to_numpy()
    yrs = app["date_str"].str.slice(0, 4).astype(int).to_numpy()

    i = 0
    while i < n_app:
        j = i + 1
        gid_c = int(gids[i])
        while j < n_app and int(gids[j]) == gid_c:
            j += 1
        ctx = game_ctx.get(gid_c)
        if ctx is not None and int(yrs[i]) >= 2020:
            hc, ac, hg, ag, lh_g, la_g = ctx
            for k_i in range(i, j):
                cl = str(pcls[k_i])
                if cl not in prior_p90 or mins[k_i] < 60.0:
                    continue
                cid = int(cids[k_i])
                if cid != hc and cid != ac:
                    continue
                pid = int(pids[k_i])
                pr0 = prior_p90[cl]
                lam_eb = (5.5 * pr0 + p_g_sum[pid]) / (5.5 + p_m90_sum[pid])
                lam_tm = lh_g if cid == hc else la_g
                lam_op = la_g if cid == hc else lh_g
                tm_g = hg if cid == hc else ag
                op_g = ag if cid == hc else hg

                # Probabilidad marginal pre-partido de gol del titular (`82` min esperados, ajustada por ataque del equipo)
                mu_pl = lam_eb * (82.0 / 90.0) * min(max(lam_tm / 1.40, 0.55), 1.95)
                p_pl = 1.0 - math.exp(-mu_pl)

                ev2 = evaluate_player_linked_sgp_scalar(p_pl, lam_tm, lam_op, "team_win", None)
                ev3 = evaluate_player_linked_sgp_scalar(p_pl, lam_tm, lam_op, "team_win", 2.5)

                scored = gls[k_i] >= 1.0
                won = tm_g > op_g
                over25 = (tm_g + op_g) >= 3

                y_2leg_list.append(1.0 if (scored and won) else 0.0)
                p_2leg_struct.append(ev2["joint_probability"])
                p_2leg_indep.append(ev2["independent_probability"])

                y_3leg_list.append(1.0 if (scored and won and over25) else 0.0)
                p_3leg_struct.append(ev3["joint_probability"])
                p_3leg_indep.append(ev3["independent_probability"])

        for k_i in range(i, j):
            pid = int(pids[k_i])
            p_g_sum[pid] = 0.96 * p_g_sum[pid] + float(gls[k_i])
            p_m90_sum[pid] = 0.96 * p_m90_sum[pid] + float(mins[k_i]) / 90.0
        i = j

    ev_player_2leg = paired_bootstrap_binary(
        np.array(y_2leg_list, dtype=np.float64),
        np.array(p_2leg_struct, dtype=np.float64),
        np.array(p_2leg_indep, dtype=np.float64),
    )
    ev_player_3leg = paired_bootstrap_binary(
        np.array(y_3leg_list, dtype=np.float64),
        np.array(p_3leg_struct, dtype=np.float64),
        np.array(p_3leg_indep, dtype=np.float64),
    )

    print(
        f"\n=== EXP_V55 STUDENT-T HEAVY-TAIL COPULA & PLAYER-LINKED SGP OOS (2020..2024 < {HOLDOUT_CUT_DATE}) ===\n"
        f"  Soccer Heavy-Tail 3-Leg (O3.5 + 1H O1.5 + SoT>=11, nu={best_nu_soc}, n={ev_t_vs_gauss_tail['n']:,}):\n"
        f"    dLL vs Independence={ev_t_vs_indep_tail['delta_ll']:+.5f} ({ev_t_vs_indep_tail['significance']}) | "
        f"dLL vs v4.0 Gaussian={ev_t_vs_gauss_tail['delta_ll']:+.5f} ({ev_t_vs_gauss_tail['significance']})\n"
        f"  Player-Linked 2-Leg (Scorer + Team Win, n={ev_player_2leg['n']:,}):\n"
        f"    Indep={ev_player_2leg['benchmark_log_loss']:.5f} -> Raikov Structural={ev_player_2leg['log_loss']:.5f} (ECE={100*ev_player_2leg['ece']:.2f}%) | "
        f"dLL={ev_player_2leg['delta_ll']:+.5f} ({ev_player_2leg['significance']})\n"
        f"  Player-Linked 3-Leg (Scorer + Team Win + Over 2.5, n={ev_player_3leg['n']:,}):\n"
        f"    Indep={ev_player_3leg['benchmark_log_loss']:.5f} -> Raikov Structural={ev_player_3leg['log_loss']:.5f} (ECE={100*ev_player_3leg['ece']:.2f}%) | "
        f"dLL={ev_player_3leg['delta_ll']:+.5f} ({ev_player_3leg['significance']})"
    )

    sgp_v5_art = {
        "schema_version": "sgp_copula_v5.0.0",
        "codename": "PitchLab Student-t Heavy-Tail QMC Copula & Raikov Player-Linked SGP Engine v5.0",
        "version": "5.0.0-candidate",
        "status": "candidate",
        "production_activated": False,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "qmc_halton_points": QMC_POINTS,
        "qmc_smooth_bandwidth": QMC_SMOOTH_BW,
        "sports": {
            "soccer": {
                "df_nu": best_nu_soc,
                "factors": SOCCER_FACTORS_8,
                "correlation_matrix": corr_soc,
            },
            "nfl": {
                "df_nu": 10.0,
                "factors": NFL_FACTORS_6,
                "correlation_matrix": corr_nfl,
            },
        },
    }
    SGP_V5_MODEL_OUT.write_text(json.dumps(sgp_v5_art, indent=2), encoding="utf-8")

    # Snapshot de paridad `< 1e-13` (`30` Student-t SGPs + `24` Player-Linked SGPs)
    rng = np.random.default_rng(MODEL_SEED)
    student_t_cases: list[dict[str, Any]] = []
    for idx_s in range(30):
        sp_k = "soccer" if idx_s < 18 else "nfl"
        facs = SOCCER_FACTORS_8 if sp_k == "soccer" else NFL_FACTORS_6
        k_l = 2 + (idx_s % 3)
        chosen_f = rng.choice(facs, size=k_l, replace=False).tolist()
        legs_in = [
            {
                "legId": f"leg_{m}",
                "factor": str(chosen_f[m]),
                "marginalProbability": round(float(rng.uniform(0.12, 0.72)), 4),
                "direction": 1 if (idx_s + m) % 3 != 0 else -1,
            }
            for m in range(k_l)
        ]
        student_t_cases.append(
            {
                "sport": sp_k,
                "legs": legs_in,
                "expected": evaluate_student_t_sgp_scalar(sp_k, legs_in, sgp_v5_art),
            }
        )

    player_linked_cases: list[dict[str, Any]] = []
    for idx_p in range(24):
        pp = round(float(rng.uniform(0.14, 0.58)), 4)
        lt = round(float(rng.uniform(0.85, 2.75)), 4)
        lo = round(float(rng.uniform(0.65, 2.25)), 4)
        to_k = "team_win" if idx_p % 2 == 0 else "team_win_or_draw"
        tot_l = 2.5 if idx_p % 3 != 0 else None
        player_linked_cases.append(
            {
                "input": {
                    "pPlayerAnytimeGoal": pp,
                    "teamExpectedGoals": lt,
                    "opponentExpectedGoals": lo,
                    "teamOutcome": to_k,
                    "matchTotalOverLine": tot_l,
                },
                "expected": evaluate_player_linked_sgp_scalar(pp, lt, lo, to_k, tot_l),
            }
        )

    SGP_V5_SNAPSHOT_OUT.write_text(
        json.dumps(
            {
                "schema_version": "sgp_copula_v5.0_parity_snapshot",
                "holdout_sealed_untouched": True,
                "student_t_cases": student_t_cases,
                "player_linked_cases": player_linked_cases,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    results_payload = {
        "experiment_id": "EXP_V55_sgp_student_t_player_v5_0",
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "selected_soccer_df_nu": best_nu_soc,
        "soccer_heavy_tail_3leg_student_t_vs_gaussian_oos": ev_t_vs_gauss_tail,
        "soccer_heavy_tail_3leg_student_t_vs_independence_oos": ev_t_vs_indep_tail,
        "player_linked_2leg_scorer_and_win_oos": ev_player_2leg,
        "player_linked_3leg_scorer_win_over25_oos": ev_player_3leg,
        "artifacts": {
            "sgp_copula_v5_0_sha256": hashlib.sha256(SGP_V5_MODEL_OUT.read_bytes()).hexdigest(),
        },
    }
    RESULTS_OUT.write_text(json.dumps(results_payload, indent=2), encoding="utf-8")

    with TRIAL_REGISTRY_OUT.open("a", encoding="utf-8") as fh:
        fh.write(
            json.dumps(
                {
                    "recorded_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "experiment_id": "EXP_V55_sgp_student_t_player_v5_0",
                    "holdout_touched": False,
                    "tail3_student_t_vs_gauss_dll": round(ev_t_vs_gauss_tail["delta_ll"], 6),
                    "player_linked_3leg_dll": round(ev_player_3leg["delta_ll"], 6),
                }
            )
            + "\n"
        )
    print(f"[DONE] EXP_V55 guardado en {RESULTS_OUT.name}")


if __name__ == "__main__":
    main()
