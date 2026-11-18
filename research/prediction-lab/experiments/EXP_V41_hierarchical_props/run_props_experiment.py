"""EXP_V41 — Motor Jerárquico Causal de Player Props (`Poisson-Gamma / NB`), Perk `sub_cover` y Régimen Eliminatorio (`v3.6`).

Resuelve de raíz las fallas demostradas en el backtest forense de Scout Picks (`Reportes/scoutpicks/14-...`):
  1. Fin del *Winner's Curse* Multi-Lente (`L5/L10/L20` eligiendo `max`, `-25.59%` a `-42.50%` ROI y `LL = +inf` en `100%` hitRate):
     conjugación jerárquica `Poisson-Gamma -> Binomial Negativa` con olvido exponencial (`H_half = 120d`) y contracción
     Empirical Bayes por clúster posicional (`GK, DF_CB, DF_FB, MF_DM, MF_CM, MF_AM, FW_W, FW_CF`).
  2. Fin de `adjustedHitRate = null`: acoplamiento multiplicativo real al poder ofensivo esperado del equipo (`lam_team`),
     a la defensa rival y al rigor Empirical Bayes del árbitro (`yellow_cards`).
  3. Submodelo explícito de exposición `E[M_{i,m}]` (mezcla `full / early_sub / cameo`) + fórmula analítica exacta del
     perk promocional `sub_cover` (*Sustituto Cuenta*: `Lambda_{i + j}(tau)`).
  4. Evaluación causal del factor de compresión en fases eliminatorias / ida-vuelta (`knockout_tie_compression`).
  5. Extensión unificada a NFL Player Props (`QB, RB, WR, TE`) acoplada a `Minkowski v3.5` (`expectedTotal` / `expectedMargin`).

Corte estricto anti-fuga: `date < 2025-02-02` (`HOLDOUT_CUT_ISO = "2025-02-02T17:30:00Z"`).
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
from sklearn.linear_model import LogisticRegression

EXP_DIR = Path(__file__).resolve().parent
REPO_ROOT = EXP_DIR.parents[3]
PRED_LAB_ROOT = REPO_ROOT / "research" / "prediction-lab"
FREE_OPEN_DIR = PRED_LAB_ROOT / "data" / "raw" / "free_open_v33"
ARTIFACTS_DIR = EXP_DIR / "artifacts"

if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from services.models import outlook_calibration as oc  # noqa: E402

HOLDOUT_CUT_DATE = "2025-02-02"
HOLDOUT_CUT_ISO = "2025-02-02T17:30:00Z"
BOOTSTRAP_SAMPLES = 1000
BOOTSTRAP_SEED = 20261111
MODEL_SEED = 42

PROPS_MODEL_OUT = REPO_ROOT / "src" / "data" / "prediction" / "model_hierarchical_props_v3_6_candidate.json"
PROPS_SNAPSHOT_OUT = REPO_ROOT / "src" / "data" / "prediction" / "hierarchical_props_v3_6_snapshot.json"
RESULTS_OUT = ARTIFACTS_DIR / "exp_v41_hierarchical_props_results.json"
TRIAL_REGISTRY_OUT = EXP_DIR / "trial_registry_props_v36.jsonl"

TARGET_COMPETITIONS: tuple[str, ...] = (
    "GB1",
    "ES1",
    "IT1",
    "L1",
    "FR1",
    "PO1",
    "NL1",
    "BE1",
    "TR1",
    "CL",
    "EL",
    "FAC",
    "CDR",
    "DFB",
    "CIT",
)

POSITION_CLUSTERS: tuple[str, ...] = (
    "GK",
    "DF_CB",
    "DF_FB",
    "MF_DM",
    "MF_CM",
    "MF_AM",
    "FW_W",
    "FW_CF",
)


def map_tm_position_cluster(pos: Any, sub_pos: Any) -> str:
    p = str(pos or "").strip().lower()
    sp = str(sub_pos or "").strip().lower()
    if "goalkeeper" in p or "goalkeeper" in sp:
        return "GK"
    if "centre-back" in sp:
        return "DF_CB"
    if "back" in sp or "defender" in p:
        return "DF_FB"
    if "defensive midfield" in sp:
        return "MF_DM"
    if "attacking midfield" in sp or "second striker" in sp:
        return "MF_AM"
    if "midfield" in p or "midfield" in sp:
        return "MF_CM"
    if "winger" in sp or "wide" in sp:
        return "FW_W"
    if "striker" in sp or "forward" in sp or "attack" in p:
        return "FW_CF"
    return "MF_CM"


def nb_prob_over_exact(mu: float, r_disp: float, line: float, max_k: int = 16) -> tuple[float, float, float]:
    """Devuelve `(p_over, p_under, p_push)` sobre `NB(mu, r_disp)` usando recurrencia elemental IEEE-754."""
    mu_c = min(max(float(mu), 1e-4), 25.0)
    r_c = min(max(float(r_disp), 0.35), 250.0)
    p0_ratio = r_c / (r_c + mu_c)
    q_ratio = mu_c / (r_c + mu_c)

    pmf = np.zeros(max_k + 1, dtype=np.float64)
    pmf[0] = math.exp(r_c * math.log(p0_ratio))
    for k in range(1, max_k + 1):
        pmf[k] = pmf[k - 1] * ((k - 1.0 + r_c) / float(k)) * q_ratio
    s = float(np.sum(pmf))
    if s > 0.0:
        pmf /= s

    ln = float(line)
    if abs(ln - round(ln)) < 1e-9:
        kl = int(round(ln))
        pp = float(pmf[kl]) if 0 <= kl <= max_k else 0.0
        pu = float(np.sum(pmf[: max(0, min(kl, max_k + 1))]))
        po = max(0.0, 1.0 - pu - pp)
        return po, pu, pp
    kf = int(math.floor(ln))
    pu = float(np.sum(pmf[: max(0, min(kf + 1, max_k + 1))]))
    po = max(0.0, 1.0 - pu)
    return po, pu, 0.0


def project_soccer_player_prop_exact(
    *,
    weighted_sum_y: float,
    weighted_exposure_90: float,
    prior_rate_per90: float,
    prior_beta_90: float,
    phi_dispersion: float,
    expected_minutes_starter: float,
    lineup_status: str,
    team_goal_factor: float,
    opp_def_factor: float,
    referee_factor: float,
    context_weight: float,
    cal_slope: float,
    cal_intercept: float,
    line: float = 0.5,
    replacement_rate_per90: float | None = None,
) -> dict[str, float]:
    """Ecuación cerrada exacta de `PitchLab Hierarchical Props v3.6` (espejo 1:1 de `hierarchical_props.ts`)."""
    eff_exp = max(0.0, float(weighted_exposure_90)) * min(max(float(context_weight), 0.1), 1.0)
    eff_sum = max(0.0, float(weighted_sum_y)) * min(max(float(context_weight), 0.1), 1.0)
    alpha0 = float(prior_rate_per90) * float(prior_beta_90)
    alpha_post = alpha0 + eff_sum
    beta_post = float(prior_beta_90) + eff_exp
    lam_eb_90 = alpha_post / max(beta_post, 1e-6)

    # Mezcla de 3 regímenes de exposición condicionada a lineup_status (`confirmed_starter` / `projected_starter` / `doubt` / `bench`)
    m_st = min(max(float(expected_minutes_starter), 45.0), 92.0)
    if lineup_status == "confirmed_starter":
        regimes = ((0.74, min(92.0, m_st + 5.0) / 90.0), (0.22, max(45.0, m_st - 18.0) / 90.0), (0.04, 24.0 / 90.0))
    elif lineup_status == "doubt":
        regimes = ((0.42, m_st / 90.0), (0.28, 52.0 / 90.0), (0.30, 22.0 / 90.0))
    elif lineup_status == "bench":
        regimes = ((0.10, 70.0 / 90.0), (0.25, 32.0 / 90.0), (0.65, 16.0 / 90.0))
    else:  # projected_starter
        regimes = ((0.68, min(91.0, m_st + 3.0) / 90.0), (0.24, max(45.0, m_st - 18.0) / 90.0), (0.08, 22.0 / 90.0))

    env_mult = (
        min(max(float(team_goal_factor), 0.45), 2.25)
        * min(max(float(opp_def_factor), 0.55), 1.85)
        * min(max(float(referee_factor), 0.65), 1.50)
    )
    inv_r_eff = (1.0 / max(alpha_post, 0.25)) + (1.0 / max(float(phi_dispersion), 0.5))
    r_eff = min(max(1.0 / inv_r_eff, 0.45), 150.0)

    p_over_raw = 0.0
    p_push_raw = 0.0
    exp_minutes_mean = 0.0
    for pi_c, e_c in regimes:
        exp_minutes_mean += pi_c * (e_c * 90.0)
        mu_c = lam_eb_90 * e_c * env_mult
        po_c, _, pp_c = nb_prob_over_exact(mu_c, r_eff, line)
        p_over_raw += pi_c * po_c
        p_push_raw += pi_c * pp_c

    act_raw = max(1.0 - p_push_raw, 1e-9)
    p_cond_raw = min(max(p_over_raw / act_raw, 1e-6), 1.0 - 1e-6)
    lg_raw = math.log(p_cond_raw / (1.0 - p_cond_raw))
    p_cal = 1.0 / (1.0 + math.exp(-(float(cal_intercept) + float(cal_slope) * lg_raw)))
    p_cal = min(max(p_cal, 0.001), 0.999)

    # Perk `sub_cover` (*Sustituto Cuenta*): suma la intensidad residual del reemplazo táctico en `(m_c, 90')`
    rep_90 = float(replacement_rate_per90) if replacement_rate_per90 is not None else 0.82 * float(prior_rate_per90)
    p_over_sub_raw = 0.0
    p_push_sub_raw = 0.0
    for pi_c, e_c in regimes:
        rem_e = max(0.0, 1.0 - e_c)
        mu_sub_c = (lam_eb_90 * e_c + rep_90 * rem_e) * env_mult
        po_sc, _, pp_sc = nb_prob_over_exact(mu_sub_c, r_eff, line)
        p_over_sub_raw += pi_c * po_sc
        p_push_sub_raw += pi_c * pp_sc

    act_sub = max(1.0 - p_push_sub_raw, 1e-9)
    p_sub_cond = min(max(p_over_sub_raw / act_sub, 1e-6), 1.0 - 1e-6)
    lg_sub = math.log(p_sub_cond / (1.0 - p_sub_cond))
    p_sub_cal = 1.0 / (1.0 + math.exp(-(float(cal_intercept) + float(cal_slope) * lg_sub)))
    p_sub_cal = min(max(max(p_cal, p_sub_cal), 0.001), 0.999)

    return {
        "lambda_eb_per90": lam_eb_90,
        "expected_minutes": exp_minutes_mean,
        "r_effective": r_eff,
        "p_over_raw": p_over_raw,
        "p_push_raw": p_push_raw,
        "p_over_calibrated": p_cal,
        "p_under_calibrated": 1.0 - p_cal,
        "p_over_sub_cover": p_sub_cal,
        "sub_cover_lift": p_sub_cal - p_cal,
    }


def evaluate_knockout_compression(games_df: pd.DataFrame) -> dict[str, Any]:
    """Evalúa causalmente el efecto de rondas eliminatorias sobre el total de goles (`< 2025-02-02`)."""
    g = games_df[
        (games_df["date_str"] >= "2014-07-01")
        & (games_df["date_str"] < HOLDOUT_CUT_DATE)
        & games_df["competition_id"].isin(TARGET_COMPETITIONS)
        & games_df["home_club_goals"].notna()
        & games_df["away_club_goals"].notna()
    ].copy()
    g = g.sort_values(["date_str", "game_id"], kind="mergesort").reset_index(drop=True)

    is_cup_ko = (g["competition_type"].astype(str) != "domestic_league").to_numpy()
    rnd_lower = g["round"].astype(str).str.lower()
    is_late_ko = is_cup_ko & (
        rnd_lower.str.contains("semi-final|quarter-final|last 16|round of 16|final", regex=True)
    ).to_numpy()

    tot_g = (
        pd.to_numeric(g["home_club_goals"], errors="coerce").to_numpy(dtype=np.float64)
        + pd.to_numeric(g["away_club_goals"], errors="coerce").to_numpy(dtype=np.float64)
    )
    yr = g["date_str"].str.slice(0, 4).astype(int).to_numpy()

    # Tasa móvil causal por club
    club_gf: dict[int, float] = {}
    alpha_c = 2.0 / 15.0
    base_lam_tot = np.empty(len(g), dtype=np.float64)
    h_ids = pd.to_numeric(g["home_club_id"], errors="coerce").fillna(-1).astype(int).to_numpy()
    a_ids = pd.to_numeric(g["away_club_id"], errors="coerce").fillna(-1).astype(int).to_numpy()
    hg = pd.to_numeric(g["home_club_goals"], errors="coerce").to_numpy(dtype=np.float64)
    ag = pd.to_numeric(g["away_club_goals"], errors="coerce").to_numpy(dtype=np.float64)

    for i in range(len(g)):
        mh = club_gf.get(h_ids[i], 1.42)
        ma = club_gf.get(a_ids[i], 1.32)
        base_lam_tot[i] = min(max(mh + ma, 0.8), 6.0)
        club_gf[h_ids[i]] = alpha_c * hg[i] + (1.0 - alpha_c) * mh
        club_gf[a_ids[i]] = alpha_c * ag[i] + (1.0 - alpha_c) * ma

    val_ko = (yr <= 2019) & is_late_ko
    oos_ko = (yr >= 2020) & is_late_ko
    if int(np.sum(val_ko)) < 50 or int(np.sum(oos_ko)) < 50:
        return {"status": "insufficient_sample"}

    ratio_val = float(np.sum(tot_g[val_ko])) / max(float(np.sum(base_lam_tot[val_ko])), 1.0)
    ko_mult = min(max(ratio_val, 0.82), 1.08)

    # Probabilidad Poisson Over 2.5 con y sin factor knockout
    def _p_o25(lam_vec: np.ndarray) -> np.ndarray:
        e_l = np.exp(-lam_vec)
        p_le2 = e_l * (1.0 + lam_vec + 0.5 * (lam_vec ** 2))
        return np.clip(1.0 - p_le2, 1e-6, 1.0 - 1e-6)

    y_o25_oos = (tot_g[oos_ko] > 2.5).astype(np.float64)
    p_base = _p_o25(base_lam_tot[oos_ko])
    p_ko = _p_o25(base_lam_tot[oos_ko] * ko_mult)

    eps = 1e-12
    ll_b = -(y_o25_oos * np.log(p_base) + (1.0 - y_o25_oos) * np.log(1.0 - p_base))
    ll_k = -(y_o25_oos * np.log(p_ko) + (1.0 - y_o25_oos) * np.log(1.0 - p_ko))
    diff = ll_k - ll_b
    n_k = len(diff)
    boots = np.empty(BOOTSTRAP_SAMPLES, dtype=np.float64)
    step_k = 1
    for b in range(BOOTSTRAP_SAMPLES):
        u_k = oc.mulberry32_uniforms_range(BOOTSTRAP_SEED, step_k, n_k)
        step_k += n_k
        boots[b] = float(np.mean(diff[np.floor(u_k * n_k).astype(np.int64)]))
    ci_lo, ci_hi = float(np.quantile(boots, 0.025)), float(np.quantile(boots, 0.975))
    return {
        "n_val_late_knockout": int(np.sum(val_ko)),
        "n_oos_late_knockout": int(n_k),
        "calibrated_ko_goal_multiplier": round(ko_mult, 5),
        "mean_goals_obs_oos": round(float(np.mean(tot_g[oos_ko])), 4),
        "mean_goals_base_pred_oos": round(float(np.mean(base_lam_tot[oos_ko])), 4),
        "delta_ll_over_2_5": float(np.mean(diff)),
        "delta_ll_ci95": [ci_lo, ci_hi],
        "significance": "significativa" if (ci_hi < 0.0 or ci_lo > 0.0) else "no significativa",
    }


def paired_metrics_props(y_true: np.ndarray, p_cand: np.ndarray, p_bench: np.ndarray) -> dict[str, Any]:
    eps = 1e-4  # Mismo piso generoso epsilon=1e-4 otorgado a Scout Picks en Cap. 14
    yt = np.asarray(y_true, dtype=np.float64)
    pc = np.clip(np.asarray(p_cand, dtype=np.float64), 1e-9, 1.0 - 1e-9)
    pb_raw = np.asarray(p_bench, dtype=np.float64)
    inf_failures = int(np.sum(((pb_raw >= 0.999999) & (yt < 0.5)) | ((pb_raw <= 1e-6) & (yt > 0.5))))
    pb = np.clip(pb_raw, eps, 1.0 - eps)

    llc = -(yt * np.log(pc) + (1.0 - yt) * np.log(1.0 - pc))
    llb = -(yt * np.log(pb) + (1.0 - yt) * np.log(1.0 - pb))
    diff = llc - llb

    n = len(yt)
    boots = np.empty(BOOTSTRAP_SAMPLES, dtype=np.float64)
    step_cur = 1
    for b in range(BOOTSTRAP_SAMPLES):
        u = oc.mulberry32_uniforms_range(BOOTSTRAP_SEED, step_cur, n)
        step_cur += n
        idx = np.floor(u * n).astype(np.int64)
        boots[b] = float(np.mean(diff[idx]))
    ci_lo, ci_hi = float(np.quantile(boots, 0.025)), float(np.quantile(boots, 0.975))

    def _ece(p_arr: np.ndarray) -> float:
        bins = np.linspace(0.0, 1.0, 11)
        acc = 0.0
        for i in range(10):
            m = (p_arr >= bins[i]) & (p_arr < bins[i + 1] if i < 9 else p_arr <= bins[i + 1])
            c = int(np.sum(m))
            if c > 0:
                acc += (c / len(p_arr)) * abs(float(np.mean(p_arr[m])) - float(np.mean(yt[m])))
        return acc

    return {
        "n": int(n),
        "cand_log_loss": float(np.mean(llc)),
        "bench_log_loss_eps1e4": float(np.mean(llb)),
        "bench_infinite_ll_failures": inf_failures,
        "delta_ll": float(np.mean(diff)),
        "delta_ll_ci95": [ci_lo, ci_hi],
        "significance": "significativa" if (ci_hi < 0.0 or ci_lo > 0.0) else "no significativa",
        "cand_brier": float(np.mean((pc - yt) ** 2)),
        "bench_brier": float(np.mean((pb_raw - yt) ** 2)),
        "cand_ece": _ece(pc),
        "bench_ece": _ece(np.clip(pb_raw, 0.0, 1.0)),
    }


def main() -> None:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    players_df = pd.read_csv(
        FREE_OPEN_DIR / "tm_players.csv.gz",
        usecols=["player_id", "name", "position", "sub_position"],
    )
    games_df = pd.read_csv(
        FREE_OPEN_DIR / "tm_games.csv.gz",
        usecols=[
            "game_id",
            "competition_id",
            "date",
            "round",
            "home_club_id",
            "away_club_id",
            "home_club_goals",
            "away_club_goals",
            "referee",
            "competition_type",
        ],
    )
    games_df["date_str"] = games_df["date"].astype(str).str.slice(0, 10)
    games_df = games_df[games_df["date_str"] < HOLDOUT_CUT_DATE].copy()

    ko_eval = evaluate_knockout_compression(games_df)
    print(f"[EXP_V41] Knockout evaluation: {ko_eval}")

    # Filtrar apariciones estrictamente pre-holdout (< 2025-02-02) y >= 2017-07-01 en ligas top
    app_df = pd.read_csv(
        FREE_OPEN_DIR / "tm_appearances.csv.gz",
        usecols=[
            "game_id",
            "player_id",
            "player_club_id",
            "date",
            "player_name",
            "competition_id",
            "yellow_cards",
            "goals",
            "assists",
            "minutes_played",
        ],
    )
    app_df["date_str"] = app_df["date"].astype(str).str.slice(0, 10)
    app_df = app_df[
        (app_df["date_str"] >= "2017-07-01")
        & (app_df["date_str"] < HOLDOUT_CUT_DATE)
        & app_df["competition_id"].isin(TARGET_COMPETITIONS)
    ].copy()
    if bool((app_df["date_str"] >= HOLDOUT_CUT_DATE).any()):
        raise RuntimeError("DataLeakageError en EXP_V41: detectada fila >= HOLDOUT_CUT_DATE")

    app_df["minutes_played"] = pd.to_numeric(app_df["minutes_played"], errors="coerce").fillna(0.0)
    app_df = app_df[app_df["minutes_played"] >= 15.0].copy()

    pos_map = {
        int(r.player_id): map_tm_position_cluster(r.position, r.sub_position)
        for r in players_df.itertuples(index=False)
    }
    app_df["pos_cluster"] = [pos_map.get(int(pid), "MF_CM") for pid in app_df["player_id"].to_numpy()]

    # Unir metadatos causales del juego (equipo local/visitante y árbitro)
    g_sub = games_df[
        ["game_id", "home_club_id", "away_club_id", "home_club_goals", "away_club_goals", "referee"]
    ].drop_duplicates("game_id")
    app_df = app_df.merge(g_sub, on="game_id", how="inner")
    app_df = app_df.sort_values(["date_str", "game_id", "player_id"], kind="mergesort").reset_index(drop=True)

    print(f"[EXP_V41] Apariciones pre-holdout cargadas: {len(app_df):,}")

    # Calcular factores causales pre-partido de ataque de club, defensa rival y árbitro
    games_sorted = games_df[games_df["competition_id"].isin(TARGET_COMPETITIONS)].sort_values(
        ["date_str", "game_id"], kind="mergesort"
    )
    club_gf_ewm: dict[int, float] = {}
    club_ga_ewm: dict[int, float] = {}
    ref_yel_n: dict[str, int] = {}
    ref_yel_sum: dict[str, float] = {}

    # Sumar amarillas por game_id desde app_df para prior arbitral causal
    yel_by_game = app_df.groupby("game_id")["yellow_cards"].sum().to_dict()

    game_context_map: dict[int, tuple[int, int, float, float, float, float, float]] = {}
    alpha_cl = 2.0 / 15.0
    for r in games_sorted.itertuples(index=False):
        gid = int(r.game_id)
        hc = int(r.home_club_id) if pd.notna(r.home_club_id) else -1
        ac = int(r.away_club_id) if pd.notna(r.away_club_id) else -1
        rf = str(r.referee or "").strip()

        gfh = club_gf_ewm.get(hc, 1.45)
        gah = club_ga_ewm.get(hc, 1.25)
        gfa = club_gf_ewm.get(ac, 1.25)
        gaa = club_ga_ewm.get(ac, 1.45)

        h_att_f = min(max(gfh / 1.38, 0.55), 1.95)
        a_att_f = min(max(gfa / 1.38, 0.55), 1.95)
        h_def_f = min(max(gah / 1.38, 0.60), 1.75)
        a_def_f = min(max(gaa / 1.38, 0.60), 1.75)

        ref_m = 1.0
        if rf and ref_yel_n.get(rf, 0) > 0:
            n_r = ref_yel_n[rf]
            eb_r = (ref_yel_sum[rf] + 15.0 * 3.85) / (n_r + 15.0)
            ref_m = min(max(eb_r / 3.85, 0.72), 1.38)

        game_context_map[gid] = (hc, ac, h_att_f, a_att_f, h_def_f, a_def_f, ref_m)

        if pd.notna(r.home_club_goals) and pd.notna(r.away_club_goals):
            hg_v = float(r.home_club_goals)
            ag_v = float(r.away_club_goals)
            club_gf_ewm[hc] = alpha_cl * hg_v + (1.0 - alpha_cl) * gfh
            club_ga_ewm[hc] = alpha_cl * ag_v + (1.0 - alpha_cl) * gah
            club_gf_ewm[ac] = alpha_cl * ag_v + (1.0 - alpha_cl) * gfa
            club_ga_ewm[ac] = alpha_cl * hg_v + (1.0 - alpha_cl) * gaa
        if rf and gid in yel_by_game:
            ref_yel_n[rf] = ref_yel_n.get(rf, 0) + 1
            ref_yel_sum[rf] = ref_yel_sum.get(rf, 0.0) + float(yel_by_game[gid])

    # Filtrar apariciones a juegos con contexto y evaluar sobre titulares/rotación principal (`minutes >= 45`
    # en evaluación para paridad 1:1 con el protocolo `minMinutes = 45` de Scout Picks, mientras el estado
    # bayesiano acumula TODAS las apariciones `>= 15'` ponderadas por `M / 90`!)
    app_df["goals"] = pd.to_numeric(app_df["goals"], errors="coerce").fillna(0.0)
    app_df["assists"] = pd.to_numeric(app_df["assists"], errors="coerce").fillna(0.0)
    app_df["yellow_cards"] = pd.to_numeric(app_df["yellow_cards"], errors="coerce").fillna(0.0)
    app_df["goals_assists"] = app_df["goals"] + app_df["assists"]
    app_df["yr"] = app_df["date_str"].str.slice(0, 4).astype(int)
    app_df["epoch_days"] = (pd.to_datetime(app_df["date_str"]) - pd.Timestamp("2015-01-01")).dt.days.to_numpy(
        dtype=np.float64
    )

    val_rows = app_df["yr"].to_numpy() <= 2019

    # 1. Estimar priors posicionales por 90' estrictamente en VAL <= 2019
    pos_priors_json: dict[str, dict[str, Any]] = {}
    prop_families = ("goals", "goals_assists", "yellow_cards")

    for cl in POSITION_CLUSTERS:
        m_cl = val_rows & (app_df["pos_cluster"].to_numpy() == cl)
        tot_e90 = float(np.sum(app_df.loc[m_cl, "minutes_played"].to_numpy() / 90.0))
        st_m = m_cl & (app_df["minutes_played"].to_numpy() >= 60.0)
        mean_starter_min = float(np.mean(app_df.loc[st_m, "minutes_played"].to_numpy())) if np.any(st_m) else 80.0
        pos_priors_json[cl] = {
            "mean_starter_minutes": round(min(max(mean_starter_min, 68.0), 90.0), 3),
            "metrics": {},
        }
        for pf in prop_families:
            tot_y = float(np.sum(app_df.loc[m_cl, pf].to_numpy()))
            mu0 = tot_y / max(tot_e90, 1.0)
            beta0 = 8.0 if pf in ("goals", "goals_assists") else 10.0
            phi0 = 6.5 if pf in ("goals", "goals_assists") else 18.0
            pos_priors_json[cl]["metrics"][pf] = {
                "prior_rate_per90": round(max(mu0, 0.005), 6),
                "prior_beta_90": beta0,
                "phi_dispersion": phi0,
            }

    # 2. Barrido secuencial causal `t' < t` por jugador con olvido exponencial `H_half = 120d`
    ln2_over_h = math.log(2.0) / 120.0
    n_app = len(app_df)

    pids = app_df["player_id"].to_numpy(dtype=np.int64)
    gids = app_df["game_id"].to_numpy(dtype=np.int64)
    pcids = pd.to_numeric(app_df["player_club_id"], errors="coerce").fillna(-1).astype(np.int64).to_numpy()
    mins = app_df["minutes_played"].to_numpy(dtype=np.float64)
    edays = app_df["epoch_days"].to_numpy(dtype=np.float64)
    clusters = app_df["pos_cluster"].tolist()
    yrs = app_df["yr"].to_numpy(dtype=int)

    obs_y = {pf: app_df[pf].to_numpy(dtype=np.float64) for pf in prop_families}

    # Estados por jugador
    p_last_day: dict[int, float] = {}
    p_w_exp: dict[int, float] = {}
    p_w_sum: dict[str, dict[int, float]] = {pf: {} for pf in prop_families}
    p_min_ewm: dict[int, float] = {}
    p_hist_45: dict[str, dict[int, list[int]]] = {pf: {} for pf in prop_families}

    # Buffers para calibración (VAL) y evaluación (OOS 2020..2024, `mins >= 45` y `>= 5` juegos previos)
    eval_mask = np.zeros(n_app, dtype=bool)
    raw_p_pitchlab: dict[str, np.ndarray] = {pf: np.zeros(n_app, dtype=np.float64) for pf in prop_families}
    sp_multi_lens: dict[str, np.ndarray] = {pf: np.zeros(n_app, dtype=np.float64) for pf in prop_families}
    sp_fixed_l10: dict[str, np.ndarray] = {pf: np.zeros(n_app, dtype=np.float64) for pf in prop_families}
    clim_prob: dict[str, np.ndarray] = {pf: np.zeros(n_app, dtype=np.float64) for pf in prop_families}

    # Guardar insumos crudos de 120 filas recientes OOS para snapshot de paridad TS <-> Python
    snap_candidates: list[dict[str, Any]] = []

    for i in range(n_app):
        pid = int(pids[i])
        gid = int(gids[i])
        d_cur = float(edays[i])
        cl = clusters[i]
        m_obs = float(mins[i])

        # Decaer acumuladores previos del jugador hasta `d_cur`
        if pid in p_last_day:
            dt = max(0.0, d_cur - p_last_day[pid])
            dec = math.exp(-ln2_over_h * dt) if dt > 0.0 else 1.0
            w_e = p_w_exp[pid] * dec
            w_sums = {pf: p_w_sum[pf][pid] * dec for pf in prop_families}
        else:
            w_e = 0.0
            w_sums = {pf: 0.0 for pf in prop_families}

        ctx = game_context_map.get(gid)
        if ctx is not None and m_obs >= 45.0:
            hc, ac, h_att, a_att, h_def, a_def, ref_m = ctx
            is_home_p = int(pcids[i]) == hc
            t_gf = h_att if is_home_p else a_att
            o_df = a_def if is_home_p else h_def

            hist_g = p_hist_45["goals"].get(pid)
            if hist_g is not None and len(hist_g) >= 5:
                eval_mask[i] = True
                exp_st_m = p_min_ewm.get(pid, float(pos_priors_json[cl]["mean_starter_minutes"]))

                for pf in prop_families:
                    pspec = pos_priors_json[cl]["metrics"][pf]
                    use_tg = t_gf if pf in ("goals", "goals_assists") else 1.0
                    use_od = o_df if pf in ("goals", "goals_assists") else 1.0
                    use_rf = ref_m if pf == "yellow_cards" else 1.0

                    proj = project_soccer_player_prop_exact(
                        weighted_sum_y=w_sums[pf],
                        weighted_exposure_90=w_e,
                        prior_rate_per90=float(pspec["prior_rate_per90"]),
                        prior_beta_90=float(pspec["prior_beta_90"]),
                        phi_dispersion=float(pspec["phi_dispersion"]),
                        expected_minutes_starter=exp_st_m,
                        lineup_status="confirmed_starter",
                        team_goal_factor=use_tg,
                        opp_def_factor=use_od,
                        referee_factor=use_rf,
                        context_weight=1.0,
                        cal_slope=1.0,
                        cal_intercept=0.0,
                        line=0.5,
                    )
                    raw_p_pitchlab[pf][i] = proj["p_over_calibrated"]
                    clim_prob[pf][i] = 1.0 - math.exp(-float(pspec["prior_rate_per90"]) * 0.85)

                    # Reconstrucción exacta Scout Picks: L5, L10, L20 sobre apariciones >= 45'
                    h_list = p_hist_45[pf][pid]
                    hr5 = sum(h_list[-5:]) / 5.0
                    hr10 = sum(h_list[-10:]) / len(h_list[-10:])
                    hr20 = sum(h_list[-20:]) / len(h_list[-20:])
                    sp_fixed_l10[pf][i] = hr10
                    # Scout Picks promueve el máximo de las ventanas en el 96.69%
                    sp_multi_lens[pf][i] = max(hr5, hr10, hr20)

                if yrs[i] >= 2023 and len(snap_candidates) < 600 and (i % 97 == 0):
                    snap_candidates.append(
                        {
                            "player_id": pid,
                            "game_id": gid,
                            "pos_cluster": cl,
                            "weighted_exposure_90": w_e,
                            "weighted_sums": {pf: w_sums[pf] for pf in prop_families},
                            "expected_minutes_starter": exp_st_m,
                            "team_goal_factor": t_gf,
                            "opp_def_factor": o_df,
                            "referee_factor": ref_m,
                        }
                    )

        # Actualización estrictamente POST-partido (`t' < t`)
        e90 = m_obs / 90.0
        p_last_day[pid] = d_cur
        p_w_exp[pid] = w_e + e90
        for pf in prop_families:
            yv = float(obs_y[pf][i])
            p_w_sum[pf][pid] = w_sums[pf] + yv
            if m_obs >= 45.0:
                lst = p_hist_45[pf].setdefault(pid, [])
                lst.append(1 if yv > 0.5 else 0)
                if len(lst) > 20:
                    del lst[:-20]
        if m_obs >= 60.0:
            prev_m = p_min_ewm.get(pid, float(pos_priors_json[cl]["mean_starter_minutes"]))
            p_min_ewm[pid] = 0.25 * m_obs + 0.75 * prev_m

    # 3. Calibración Platt en logit estrictamente en VAL <= 2019 y evaluación en OOS 2020..2024
    val_ev = eval_mask & (yrs <= 2019)
    oos_ev = eval_mask & (yrs >= 2020)

    calibration_params: dict[str, dict[str, float]] = {}
    oos_results: dict[str, Any] = {}

    for pf in prop_families:
        y_val_b = (obs_y[pf][val_ev] > 0.5).astype(int)
        p_val_r = np.clip(raw_p_pitchlab[pf][val_ev], 1e-6, 1.0 - 1e-6)
        lg_val = np.log(p_val_r / (1.0 - p_val_r)).reshape(-1, 1)

        lr_cal = LogisticRegression(C=10.0, solver="lbfgs")
        lr_cal.fit(lg_val, y_val_b)
        slope_pf = float(lr_cal.coef_[0, 0])
        inter_pf = float(lr_cal.intercept_[0])
        calibration_params[pf] = {"cal_slope": round(slope_pf, 6), "cal_intercept": round(inter_pf, 6)}

        y_oos_b = (obs_y[pf][oos_ev] > 0.5).astype(np.float64)
        p_oos_r = np.clip(raw_p_pitchlab[pf][oos_ev], 1e-6, 1.0 - 1e-6)
        lg_oos = np.log(p_oos_r / (1.0 - p_oos_r))
        p_oos_cal = np.clip(1.0 / (1.0 + np.exp(-(inter_pf + slope_pf * lg_oos))), 0.001, 0.999)

        sp_ml_oos = sp_multi_lens[pf][oos_ev]
        sp_l10_oos = sp_fixed_l10[pf][oos_ev]
        clim_oos = clim_prob[pf][oos_ev]

        # Evaluar tanto en universo general como en el "Catálogo Promovido" de Scout Picks (`sp_multi_lens >= 0.50`)
        prom_mask = sp_ml_oos >= 0.50
        res_all_vs_sp = paired_metrics_props(y_oos_b, p_oos_cal, sp_ml_oos)
        res_all_vs_l10 = paired_metrics_props(y_oos_b, p_oos_cal, sp_l10_oos)
        res_all_vs_clim = paired_metrics_props(y_oos_b, p_oos_cal, clim_oos)
        res_prom_vs_sp = (
            paired_metrics_props(y_oos_b[prom_mask], p_oos_cal[prom_mask], sp_ml_oos[prom_mask])
            if int(np.sum(prom_mask)) >= 50
            else None
        )

        print(
            f"  [Prop {pf:13s}] OOS n={len(y_oos_b):7,d} | "
            f"PitchLab LL={res_all_vs_sp['cand_log_loss']:.4f} (ECE={res_all_vs_sp['cand_ece']:.4f}) vs "
            f"ScoutPicks MultiLens LL={res_all_vs_sp['bench_log_loss_eps1e4']:.4f} "
            f"(ECE={res_all_vs_sp['bench_ece']:.4f}, inf_fails={res_all_vs_sp['bench_infinite_ll_failures']:,d}) | "
            f"dLL={res_all_vs_sp['delta_ll']:+.5f} ({res_all_vs_sp['significance']})"
        )
        oos_results[pf] = {
            "vs_scoutpicks_multilens_all": res_all_vs_sp,
            "vs_scoutpicks_fixed_l10_all": res_all_vs_l10,
            "vs_positional_climatology": res_all_vs_clim,
            "vs_scoutpicks_promoted_catalog_ge50": res_prom_vs_sp,
        }

    # Priors estructurales NFL (`QB, RB, WR, TE`) acoplados al guion `Minkowski v3.5`
    nfl_priors_json = {
        "anchor_total_points": 45.0,
        "positions": {
            "QB": {
                "pass_yds": {"prior_mean": 232.0, "prior_games": 4.0, "cv_sd": 0.265, "min_sd": 54.0, "script_trailing_slope": 0.014},
                "pass_td": {"prior_mean": 1.52, "prior_games": 5.0, "phi_dispersion": 14.0, "script_trailing_slope": 0.010},
                "rush_yds": {"prior_mean": 19.5, "prior_games": 4.0, "cv_sd": 0.52, "min_sd": 12.0, "script_trailing_slope": -0.008},
            },
            "RB": {
                "rush_yds": {"prior_mean": 58.0, "prior_games": 4.0, "cv_sd": 0.42, "min_sd": 15.0, "script_trailing_slope": -0.022},
                "receptions": {"prior_mean": 2.85, "prior_games": 4.5, "phi_dispersion": 9.5, "script_trailing_slope": 0.018},
                "rec_yds": {"prior_mean": 22.0, "prior_games": 4.5, "cv_sd": 0.55, "min_sd": 11.0, "script_trailing_slope": 0.018},
                "anytime_td": {"prior_mean": 0.58, "prior_games": 5.5, "phi_dispersion": 12.0, "script_trailing_slope": -0.015},
            },
            "WR": {
                "receptions": {"prior_mean": 4.40, "prior_games": 4.5, "phi_dispersion": 10.5, "script_trailing_slope": 0.015},
                "rec_yds": {"prior_mean": 56.0, "prior_games": 4.5, "cv_sd": 0.48, "min_sd": 14.0, "script_trailing_slope": 0.015},
                "anytime_td": {"prior_mean": 0.38, "prior_games": 6.0, "phi_dispersion": 15.0, "script_trailing_slope": 0.008},
            },
            "TE": {
                "receptions": {"prior_mean": 3.65, "prior_games": 4.5, "phi_dispersion": 11.0, "script_trailing_slope": 0.012},
                "rec_yds": {"prior_mean": 39.0, "prior_games": 4.5, "cv_sd": 0.50, "min_sd": 12.0, "script_trailing_slope": 0.012},
                "anytime_td": {"prior_mean": 0.31, "prior_games": 6.0, "phi_dispersion": 16.0, "script_trailing_slope": 0.008},
            },
        },
    }

    model_payload = {
        "schema_version": "hierarchical_props_v3.6.0",
        "codename": "PitchLab Hierarchical Props & Exposure v3.6 Candidate",
        "version": "3.6.0-candidate",
        "status": "candidate",
        "production_activated": False,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "half_life_days": 120.0,
        "one_way_book_power_exponent_default": 1.075,
        "knockout_stage_config": {
            "goal_multiplier": ko_eval.get("calibrated_ko_goal_multiplier", 1.0),
            "significance": ko_eval.get("significance", "no significativa"),
        },
        "soccer": {
            "positions": pos_priors_json,
            "calibration": calibration_params,
        },
        "nfl": nfl_priors_json,
    }
    PROPS_MODEL_OUT.write_text(json.dumps(model_payload, indent=2), encoding="utf-8")

    # Construir snapshot de paridad TS <-> Python (`120` casos fútbol con `sub_cover` + estados XI variados)
    statuses_cycle = ("confirmed_starter", "projected_starter", "doubt", "bench")
    snap_rows: list[dict[str, Any]] = []
    for k_i, sc in enumerate(snap_candidates[:120]):
        cl = sc["pos_cluster"]
        pf = prop_families[k_i % 3]
        st_mode = statuses_cycle[k_i % 4]
        pspec = pos_priors_json[cl]["metrics"][pf]
        cal = calibration_params[pf]
        use_tg = float(sc["team_goal_factor"]) if pf in ("goals", "goals_assists") else 1.0
        use_od = float(sc["opp_def_factor"]) if pf in ("goals", "goals_assists") else 1.0
        use_rf = float(sc["referee_factor"]) if pf == "yellow_cards" else 1.0
        ctx_w = 0.25 if (k_i % 7 == 0) else 1.0  # incluye puente Club->Selección

        py_out = project_soccer_player_prop_exact(
            weighted_sum_y=float(sc["weighted_sums"][pf]),
            weighted_exposure_90=float(sc["weighted_exposure_90"]),
            prior_rate_per90=float(pspec["prior_rate_per90"]),
            prior_beta_90=float(pspec["prior_beta_90"]),
            phi_dispersion=float(pspec["phi_dispersion"]),
            expected_minutes_starter=float(sc["expected_minutes_starter"]),
            lineup_status=st_mode,
            team_goal_factor=use_tg,
            opp_def_factor=use_od,
            referee_factor=use_rf,
            context_weight=ctx_w,
            cal_slope=float(cal["cal_slope"]),
            cal_intercept=float(cal["cal_intercept"]),
            line=0.5,
        )
        snap_rows.append(
            {
                "case_id": f"prop_{k_i:03d}_{sc['game_id']}_{sc['player_id']}",
                "prop_family": pf,
                "pos_cluster": cl,
                "lineup_status": st_mode,
                "weighted_sum_y": float(sc["weighted_sums"][pf]),
                "weighted_exposure_90": float(sc["weighted_exposure_90"]),
                "expected_minutes_starter": float(sc["expected_minutes_starter"]),
                "team_goal_factor": use_tg,
                "opp_def_factor": use_od,
                "referee_factor": use_rf,
                "context_weight": ctx_w,
                "line": 0.5,
                "python_output": py_out,
            }
        )

    PROPS_SNAPSHOT_OUT.write_text(
        json.dumps(
            {
                "schema_version": "hierarchical_props_v3.6_parity_snapshot",
                "holdout_sealed_untouched": True,
                "n": len(snap_rows),
                "rows": snap_rows,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    summary = {
        "experiment_id": "EXP_V41_hierarchical_props",
        "eval_split": "walk_forward_dev",
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "n_appearances_processed": int(n_app),
        "n_val_eval": int(np.sum(val_ev)),
        "n_oos_eval_2020_2024": int(np.sum(oos_ev)),
        "knockout_compression_eval": ko_eval,
        "soccer_props_oos_2020_2024": oos_results,
        "artifacts": {
            "model_hierarchical_props_v3_6_sha256": hashlib.sha256(PROPS_MODEL_OUT.read_bytes()).hexdigest(),
            "snapshot_sha256": hashlib.sha256(PROPS_SNAPSHOT_OUT.read_bytes()).hexdigest(),
        },
    }
    RESULTS_OUT.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    with TRIAL_REGISTRY_OUT.open("a", encoding="utf-8") as fh:
        fh.write(
            json.dumps(
                {
                    "recorded_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "experiment_id": "EXP_V41_hierarchical_props",
                    "eval_split": "walk_forward_dev",
                    "holdout_touched": False,
                    "goals_dll_vs_scoutpicks": round(oos_results["goals"]["vs_scoutpicks_multilens_all"]["delta_ll"], 6),
                    "ga_dll_vs_scoutpicks": round(
                        oos_results["goals_assists"]["vs_scoutpicks_multilens_all"]["delta_ll"], 6
                    ),
                    "cards_dll_vs_scoutpicks": round(
                        oos_results["yellow_cards"]["vs_scoutpicks_multilens_all"]["delta_ll"], 6
                    ),
                }
            )
            + "\n"
        )
    print(f"\n[DONE] EXP_V41 guardado en {RESULTS_OUT.name}")


if __name__ == "__main__":
    main()
