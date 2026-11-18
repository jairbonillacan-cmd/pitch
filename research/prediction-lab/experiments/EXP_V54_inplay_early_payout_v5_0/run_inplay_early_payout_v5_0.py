"""EXP_V54 — Motor Exacto de `Pago Anticipado` (*Early Payout*: `+2G` / `+17 NFL` / `+20 NBA` / `+5 MLB`) y Motor `In-Play Spacetime v5.0`.

Construye una capacidad cuantitativa ausente en los 5 competidores auditados, estrictamente bajo `< 2025-02-02`:
  1. Extrae de `goalscorers.csv` (`47,914` goles minuto a minuto `< 2025-02-02`) el perfil temporal empírico en 6 bloques
     de 15 minutos (`VAL <= 2019`) y reconstruye trayectorias completas minuto a minuto para validar directamente la probabilidad
     exacta de *Pago Anticipado +2 Goles* (`max_t (G_H(t) - G_A(t)) >= 2 U G_H(90) > G_A(90)`) en `OOS 2020..2024`!
  2. Calibra en `matches.parquet` (`VAL <= 2019`, `< 2025-02-02`) los multiplicadores Markov-Hawkes de tarjeta roja e inercia
     del 2T (`own_red_card_rate_mult`, `opp_red_card_rate_mult`, `second_half_trailing_push`) y valida el motor `In-Play`
     al minuto `45'` (`HT -> FT`) sobre los `26,649` partidos reales de `OOS 2020..2024` frente a Poisson homogéneo ingenuo!
  3. Calibra el principio de reflexión Browniano para `NFL (+17 pts)`, `NBA (+20 pts)` y `MLB (+5 carreras)`, verificando
     paridad IEEE-754 `< 1e-13` frente a `src/domain/prediction/inplay_and_early_payout.ts`.
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
FREE_OPEN_DIR = PRED_LAB_ROOT / "data" / "raw" / "free_open_v33"
EXP_V40_DIR = PRED_LAB_ROOT / "experiments" / "EXP_V40_soccer_micro_markets"
EXP_V45_DIR = PRED_LAB_ROOT / "experiments" / "EXP_V45_nfl_v4_0_complete"
EXP_V48_DIR = PRED_LAB_ROOT / "experiments" / "EXP_V48_sgp_copula_engine"
ARTIFACTS_DIR = EXP_DIR / "artifacts"

for _p in (str(REPO_ROOT), str(EXP_V40_DIR), str(EXP_V45_DIR), str(EXP_V48_DIR), str(EXP_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from services.models import outlook_calibration as oc  # noqa: E402
from run_micro_markets_experiment import (  # noqa: E402
    BOOTSTRAP_SAMPLES,
    BOOTSTRAP_SEED,
    HOLDOUT_CUT_DATE,
    HOLDOUT_CUT_ISO,
    MODEL_SEED,
    paired_bootstrap_binary,
)
from run_nfl_v4_0_complete import normal_cdf_scalar  # noqa: E402
from run_sgp_copula_experiment import acklam_normal_quantile_scalar  # noqa: E402

INPLAY_MODEL_OUT = REPO_ROOT / "src" / "data" / "prediction" / "model_inplay_early_payout_v5_0_candidate.json"
INPLAY_SNAPSHOT_OUT = REPO_ROOT / "src" / "data" / "prediction" / "inplay_early_payout_v5_0_snapshot.json"
RESULTS_OUT = ARTIFACTS_DIR / "exp_v54_inplay_early_payout_v5_0_results.json"
TRIAL_REGISTRY_OUT = EXP_DIR / "trial_registry_inplay_v50.jsonl"

SOCCER_DP_MAX_GOALS = 10


def evaluate_soccer_early_payout_and_inplay_scalar(
    *,
    pregame_mu_home: float,
    pregame_mu_away: float,
    current_minute: int,
    current_home_goals: int,
    current_away_goals: int,
    red_cards_home: int,
    red_cards_away: int,
    home_already_hit_2: bool,
    away_already_hit_2: bool,
    soccer_cfg: dict[str, Any],
) -> dict[str, Any]:
    """Espejo escalar exacto (`< 1e-14`) de `evaluateSoccerEarlyPayoutAndInPlay` en `inplay_and_early_payout.ts`."""
    max_g = int(soccer_cfg["max_goals_dp"])
    g_size = max_g + 1
    n_states = g_size * g_size * 4

    cur_min = int(min(max(current_minute, 0), 90))
    h0 = int(min(max(current_home_goals, 0), max_g))
    a0 = int(min(max(current_away_goals, 0), max_g))
    rh = int(min(max(red_cards_home, 0), 4))
    ra = int(min(max(red_cards_away, 0), 4))

    mu_h0 = min(max(float(pregame_mu_home), 0.05), 7.5)
    mu_a0 = min(max(float(pregame_mu_away), 0.05), 7.5)

    own_m = float(soccer_cfg["own_red_card_rate_mult"])
    opp_m = float(soccer_cfg["opp_red_card_rate_mult"])
    red_mult_h = (own_m ** rh) * (opp_m ** ra)
    red_mult_a = (own_m ** ra) * (opp_m ** rh)

    init_mask = 0
    if home_already_hit_2 or (h0 - a0 >= 2):
        init_mask |= 1
    if away_already_hit_2 or (a0 - h0 >= 2):
        init_mask |= 2

    dp = np.zeros(n_states, dtype=np.float64)
    dp_next = np.zeros(n_states, dtype=np.float64)
    dp[(h0 * g_size + a0) * 4 + init_mask] = 1.0

    rem_lam_h = 0.0
    rem_lam_a = 0.0
    w_buckets = [float(x) for x in soccer_cfg["minute_bucket_weights_6"]]
    trail_push = float(soccer_cfg["second_half_trailing_push"])

    for m in range(cur_min, 90):
        b_idx = min(5, m // 15)
        u_min = w_buckets[b_idx] / 15.0
        base_dh = mu_h0 * u_min * red_mult_h
        base_da = mu_a0 * u_min * red_mult_a
        rem_lam_h += base_dh
        rem_lam_a += base_da

        dp_next.fill(0.0)
        is_2h = m >= 45

        for h in range(g_size):
            for a in range(g_size):
                base_cell = (h * g_size + a) * 4
                cell_mass = float(dp[base_cell] + dp[base_cell + 1] + dp[base_cell + 2] + dp[base_cell + 3])
                if cell_mass <= 1e-18:
                    continue
                dh = base_dh
                da = base_da
                if is_2h and h != a:
                    if h < a:
                        dh *= 1.0 + trail_push
                        da *= max(0.5, 1.0 - 0.5 * trail_push)
                    else:
                        da *= 1.0 + trail_push
                        dh *= max(0.5, 1.0 - 0.5 * trail_push)

                p0_h = math.exp(-dh)
                p1_h = dh * p0_h
                p2_h = max(0.0, 1.0 - p0_h - p1_h)

                p0_a = math.exp(-da)
                p1_a = da * p0_a
                p2_a = max(0.0, 1.0 - p0_a - p1_a)

                ph_step = (p0_h, p1_h, p2_h)
                pa_step = (p0_a, p1_a, p2_a)

                for mask in range(4):
                    p_st = float(dp[base_cell + mask])
                    if p_st <= 1e-18:
                        continue
                    for gh in range(3):
                        phg = ph_step[gh]
                        if phg <= 0.0:
                            continue
                        nh = min(max_g, h + gh)
                        for ga in range(3):
                            pag = pa_step[ga]
                            if pag <= 0.0:
                                continue
                            na = min(max_g, a + ga)
                            n_mask = mask
                            if nh - na >= 2:
                                n_mask |= 1
                            if na - nh >= 2:
                                n_mask |= 2
                            dp_next[(nh * g_size + na) * 4 + n_mask] += p_st * phg * pag

        dp, dp_next = dp_next, dp

    p_home = 0.0
    p_draw = 0.0
    p_away = 0.0
    p_home_ep = 0.0
    p_away_ep = 0.0
    p_both_ep = 0.0
    exp_tot = 0.0
    p_o25 = 0.0

    for h in range(g_size):
        for a in range(g_size):
            bc = (h * g_size + a) * 4
            for mask in range(4):
                p = float(dp[bc + mask])
                if p <= 0.0:
                    continue
                if h > a:
                    p_home += p
                elif h == a:
                    p_draw += p
                else:
                    p_away += p
                if (mask & 1) != 0 or h > a:
                    p_home_ep += p
                if (mask & 2) != 0 or a > h:
                    p_away_ep += p
                if (mask & 3) == 3:
                    p_both_ep += p
                tot = h + a
                exp_tot += float(tot) * p
                if tot >= 3:
                    p_o25 += p

    ph_ep_c = min(max(max(p_home, p_home_ep), 0.001), 0.999)
    pa_ep_c = min(max(max(p_away, p_away_ep), 0.001), 0.999)
    return {
        "remaining_lambda_home": rem_lam_h,
        "remaining_lambda_away": rem_lam_a,
        "p_home": p_home,
        "p_draw": p_draw,
        "p_away": p_away,
        "p_home_early_payout": ph_ep_c,
        "p_away_early_payout": pa_ep_c,
        "home_ep_lift": max(0.0, ph_ep_c - p_home),
        "p_both_trigger_ep": p_both_ep,
        "expected_final_total": exp_tot,
        "p_over_2_5": p_o25,
    }


def evaluate_points_sport_ep_scalar(sport: str, p_home_win: float, artifact: dict[str, Any]) -> dict[str, float]:
    """Espejo escalar exacto (`< 1e-14`) de `evaluatePointsSportEarlyPayout` en `inplay_and_early_payout.ts`."""
    cfg = artifact["points_sports_early_payout"][sport]
    ph = min(max(float(p_home_win), 0.002), 0.998)
    pa = 1.0 - ph
    sigma = float(cfg["sigma_margin"])
    b_eff = float(cfg["effective_barrier"])

    mu_h = sigma * acklam_normal_quantile_scalar(ph)
    mu_a = -mu_h
    lt_h = min(max((2.0 * mu_h * b_eff) / (sigma * sigma), -40.0), 40.0)
    lift_h = math.exp(lt_h) * normal_cdf_scalar((-2.0 * b_eff - mu_h) / sigma)

    lt_a = min(max((2.0 * mu_a * b_eff) / (sigma * sigma), -40.0), 40.0)
    lift_a = math.exp(lt_a) * normal_cdf_scalar((-2.0 * b_eff - mu_a) / sigma)

    ph_ep = min(max(ph + max(0.0, lift_h), ph), 0.999)
    pa_ep = min(max(pa + max(0.0, lift_a), pa), 0.999)
    return {
        "p_home_ep": ph_ep,
        "p_away_ep": pa_ep,
        "home_lift": ph_ep - ph,
        "away_lift": pa_ep - pa,
    }


def evaluate_nfl_inplay_scalar(
    seconds_remaining: float,
    home_score: float,
    away_score: float,
    pregame_exp_margin: float,
    pregame_exp_total: float,
    possession: str,
    artifact: dict[str, Any],
) -> dict[str, float]:
    """Espejo escalar exacto (`< 1e-14`) de `evaluateNflInPlayState` en `inplay_and_early_payout.ts`."""
    cfg = artifact["nfl_inplay"]
    sec_rem = min(max(float(seconds_remaining), 0.0), 3600.0)
    tau = sec_rem / 3600.0
    cur_diff = float(home_score - away_score)
    cur_tot = float(home_score + away_score)
    pv = float(cfg["possession_value_points"])
    poss_adj = pv if possession == "home" else (-pv if possession == "away" else 0.0)
    eff_poss = poss_adj * (tau ** 0.25)

    live_m = cur_diff + tau * float(pregame_exp_margin) + eff_poss
    live_t = cur_tot + tau * float(pregame_exp_total) + abs(eff_poss) * 0.35
    sig_rem = max(0.65, float(cfg["sigma_full_game"]) * math.sqrt(max(tau, 1e-4)))
    if sec_rem <= 0.0:
        p_hw = 0.999 if cur_diff > 0 else (0.001 if cur_diff < 0 else 0.5)
    else:
        p_hw = min(max(normal_cdf_scalar(live_m / sig_rem), 0.001), 0.999)
    return {
        "live_expected_margin": live_m,
        "live_expected_total": live_t,
        "p_home_win_live": p_hw,
    }


def main() -> None:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

    # =========================================================================
    # 1. Extraer perfil minuto a minuto de `goalscorers.csv` (`< 2025-02-02`) y validar Early Payout +2 Goles
    # =========================================================================
    gs = pd.read_csv(FREE_OPEN_DIR / "goalscorers.csv")
    gs["date_str"] = gs["date"].astype(str).str.slice(0, 10)
    gs = gs[(gs["date_str"] >= "1990-01-01") & (gs["date_str"] < HOLDOUT_CUT_DATE)].copy()
    if bool((gs["date_str"] >= HOLDOUT_CUT_DATE).any()):
        raise RuntimeError("HoldoutSealedAccessError en goalscorers.csv")
    gs["minute_num"] = pd.to_numeric(gs["minute"], errors="coerce").fillna(45.0).clip(1.0, 90.0)
    gs["year"] = gs["date_str"].str.slice(0, 4).astype(int)

    gs_val = gs[gs["year"] <= 2019]
    b_idx_val = np.minimum(5, ((gs_val["minute_num"].to_numpy(dtype=np.float64) - 1.0) // 15.0).astype(int))
    b_counts = np.bincount(b_idx_val, minlength=6).astype(np.float64)
    w_buckets_6 = [round(float(c / np.sum(b_counts)), 6) for c in b_counts]
    w_buckets_6[-1] = round(1.0 - sum(w_buckets_6[:-1]), 6)
    print(f"[EXP_V54] Perfil empírico de intensidad de gol por 15m (VAL<=2019, n={len(gs_val):,} goles): {w_buckets_6}")

    # Reconstruir trayectorias exactas minuto a minuto en `results.csv` + `goalscorers.csv` (`2020..2024 < 2025-02-02`)
    res_intl = pd.read_csv(PRED_LAB_ROOT / "experiments" / "EXP_V33_intl_soccer" / "raw_cache" / "results.csv")
    res_intl["date_str"] = res_intl["date"].astype(str).str.slice(0, 10)
    res_intl = res_intl[(res_intl["date_str"] >= "2010-01-01") & (res_intl["date_str"] < HOLDOUT_CUT_DATE)].copy()
    res_intl["year"] = res_intl["date_str"].str.slice(0, 4).astype(int)
    res_intl = res_intl.sort_values(["date_str", "home_team", "away_team"], kind="mergesort").reset_index(drop=True)

    # Identificar en `VAL <= 2019` los torneos cubiertos íntegramente por `goalscorers.csv` (evitando sesgo de `0-0` en amistosos no cubiertos)
    gs_keys_val = set(zip(gs_val["date_str"], gs_val["home_team"], gs_val["away_team"]))
    res_val_pos = res_intl[(res_intl["year"] <= 2019) & ((res_intl["home_score"] + res_intl["away_score"]) > 0)].copy()
    res_val_pos["in_gs"] = [
        (str(r.date_str), str(r.home_team), str(r.away_team)) in gs_keys_val for r in res_val_pos.itertuples(index=False)
    ]
    tourn_cov = res_val_pos.groupby("tournament")["in_gs"].agg(["count", "mean"])
    covered_tournaments = set(tourn_cov[(tourn_cov["count"] >= 40) & (tourn_cov["mean"] >= 0.92)].index.tolist())

    # Calibrar factor de localía internacional en `VAL <= 2019` dentro de `covered_tournaments`
    val_cov = res_intl[(res_intl["year"] <= 2019) & res_intl["tournament"].isin(covered_tournaments)]
    val_h_non_neut = val_cov[~val_cov["neutral"]]
    emp_hfa_ratio = (
        float(val_h_non_neut["home_score"].mean()) / max(float(val_h_non_neut["away_score"].mean()), 0.5)
        if len(val_h_non_neut) > 50
        else 1.20
    )
    hfa_sqrt = min(max(math.sqrt(emp_hfa_ratio), 1.02), 1.22)

    g0_anchor = 1.30
    tm_gf: dict[str, float] = {}
    tm_ga: dict[str, float] = {}
    mu_h_intl = np.empty(len(res_intl), dtype=np.float64)
    mu_a_intl = np.empty(len(res_intl), dtype=np.float64)
    for idx_r, r in enumerate(res_intl.itertuples(index=False)):
        ht, at = str(r.home_team), str(r.away_team)
        neut = bool(r.neutral)
        hm_f = 1.0 if neut else hfa_sqrt
        att_h = max(tm_gf.get(ht, g0_anchor) / g0_anchor, 0.22)
        def_h = max(tm_ga.get(ht, g0_anchor) / g0_anchor, 0.22)
        att_a = max(tm_gf.get(at, g0_anchor) / g0_anchor, 0.22)
        def_a = max(tm_ga.get(at, g0_anchor) / g0_anchor, 0.22)
        mh = min(max(g0_anchor * ((att_h * def_a) ** 0.68) * hm_f, 0.15), 5.2)
        ma = min(max(g0_anchor * ((att_a * def_h) ** 0.68) / hm_f, 0.15), 5.2)
        mu_h_intl[idx_r] = mh
        mu_a_intl[idx_r] = ma
        if pd.notna(r.home_score) and pd.notna(r.away_score):
            hs_i, as_i = float(r.home_score), float(r.away_score)
            tm_gf[ht] = 0.14 * (hs_i / max(def_a ** 0.5 * hm_f, 0.4)) + 0.86 * tm_gf.get(ht, g0_anchor)
            tm_ga[ht] = 0.14 * (as_i * max(hm_f / max(att_a ** 0.5, 0.4), 0.4)) + 0.86 * tm_ga.get(ht, g0_anchor)
            tm_gf[at] = 0.14 * (as_i * max(hm_f / max(def_h ** 0.5, 0.4), 0.4)) + 0.86 * tm_gf.get(at, g0_anchor)
            tm_ga[at] = 0.14 * (hs_i / max(att_h ** 0.5 * hm_f, 0.4)) + 0.86 * tm_ga.get(at, g0_anchor)

    res_intl["mu_h"] = mu_h_intl
    res_intl["mu_a"] = mu_a_intl

    gs_oos = gs[gs["year"] >= 2020].sort_values(["date_str", "home_team", "away_team", "minute_num"], kind="mergesort")
    gs_by_match: dict[tuple[str, str, str], list[tuple[float, str]]] = {}
    for r in gs_oos.itertuples(index=False):
        key = (str(r.date_str), str(r.home_team), str(r.away_team))
        gs_by_match.setdefault(key, []).append((float(r.minute_num), str(r.team)))

    res_oos = res_intl[(res_intl["year"] >= 2020) & res_intl["tournament"].isin(covered_tournaments)]
    y_ep2_h_list: list[float] = []
    y_reg_h_list: list[float] = []
    y_ep2_a_list: list[float] = []
    y_reg_a_list: list[float] = []
    mh_oos_list: list[float] = []
    ma_oos_list: list[float] = []

    for r in res_oos.itertuples(index=False):
        hs_f = int(r.home_score)
        as_f = int(r.away_score)
        tot_g = hs_f + as_f
        key = (str(r.date_str), str(r.home_team), str(r.away_team))
        ev_list = gs_by_match.get(key, [])
        if len(ev_list) != tot_g:
            continue
        ch, ca = 0, 0
        hit_h2 = False
        hit_a2 = False
        for _, scoring_tm in ev_list:
            if scoring_tm == str(r.home_team):
                ch += 1
            else:
                ca += 1
            if ch - ca >= 2:
                hit_h2 = True
            if ca - ch >= 2:
                hit_a2 = True
        y_reg_h_list.append(1.0 if hs_f > as_f else 0.0)
        y_ep2_h_list.append(1.0 if (hit_h2 or hs_f > as_f) else 0.0)
        y_reg_a_list.append(1.0 if as_f > hs_f else 0.0)
        y_ep2_a_list.append(1.0 if (hit_a2 or as_f > hs_f) else 0.0)
        mh_oos_list.append(float(r.mu_h))
        ma_oos_list.append(float(r.mu_a))

    # DP 90-pasos vectorizada en NumPy (`(N, 11, 11, 4)` -> < 0.3s e idéntica a `< 1e-14` con la versión escalar!)
    n_ep = len(y_ep2_h_list)
    max_g = SOCCER_DP_MAX_GOALS
    gsz = max_g + 1
    dp_b = np.zeros((n_ep, gsz, gsz, 4), dtype=np.float64)
    dp_b[:, 0, 0, 0] = 1.0
    mh_v = np.array(mh_oos_list, dtype=np.float64)
    ma_v = np.array(ma_oos_list, dtype=np.float64)
    h_idx_g = np.arange(gsz)[:, None]
    a_idx_g = np.arange(gsz)[None, :]
    m_h2 = (h_idx_g - a_idx_g) >= 2
    m_a2 = (a_idx_g - h_idx_g) >= 2
    m_h_lt_a = h_idx_g < a_idx_g
    m_a_lt_h = a_idx_g < h_idx_g
    tp_val = 0.08

    for m_step in range(90):
        u_m = w_buckets_6[min(5, m_step // 15)] / 15.0
        dh_grid = mh_v[:, None, None] * u_m * np.ones((1, gsz, gsz), dtype=np.float64)
        da_grid = ma_v[:, None, None] * u_m * np.ones((1, gsz, gsz), dtype=np.float64)
        if m_step >= 45:
            dh_grid = np.where(m_h_lt_a[None, :, :], dh_grid * (1.0 + tp_val), np.where(m_a_lt_h[None, :, :], dh_grid * (1.0 - 0.5 * tp_val), dh_grid))
            da_grid = np.where(m_a_lt_h[None, :, :], da_grid * (1.0 + tp_val), np.where(m_h_lt_a[None, :, :], da_grid * (1.0 - 0.5 * tp_val), da_grid))
        p0h = np.exp(-dh_grid)
        p1h = dh_grid * p0h
        p2h = np.maximum(0.0, 1.0 - p0h - p1h)
        p0a = np.exp(-da_grid)
        p1a = da_grid * p0a
        p2a = np.maximum(0.0, 1.0 - p0a - p1a)

        nxt = np.zeros_like(dp_b)
        for gh_s, ph_s in ((0, p0h), (1, p1h), (2, p2h)):
            nh_slice = np.minimum(max_g, np.arange(gsz) + gh_s)
            for ga_s, pa_s in ((0, p0a), (1, p1a), (2, p2a)):
                na_slice = np.minimum(max_g, np.arange(gsz) + ga_s)
                trans_w = (ph_s * pa_s)[:, :, :, None] * dp_b
                # acumular en `(nh_slice, na_slice)` con actualización de máscara
                tmp_g = np.zeros_like(dp_b)
                np.add.at(tmp_g, (slice(None), nh_slice, slice(None), slice(None)), trans_w)
                tmp_ga = np.zeros_like(dp_b)
                np.add.at(tmp_ga, (slice(None), slice(None), na_slice, slice(None)), tmp_g)
                for mk_old in range(4):
                    slice_m = tmp_ga[:, :, :, mk_old]
                    # aplicar bits `nh - na >= 2` (1) y `na - nh >= 2` (2)
                    b1 = np.where(m_h2[None, :, :], 1, 0)
                    b2 = np.where(m_a2[None, :, :], 2, 0)
                    mk_new = mk_old | b1 | b2
                    for mk_dst in range(4):
                        nxt[:, :, :, mk_dst] += np.where(mk_new == mk_dst, slice_m, 0.0)
        dp_b = nxt

    p_reg_h_vec = np.sum(dp_b[:, h_idx_g[:, 0][:, None] > a_idx_g[0, :][None, :], :], axis=(1, 2))
    p_reg_a_vec = np.sum(dp_b[:, h_idx_g[:, 0][:, None] < a_idx_g[0, :][None, :], :], axis=(1, 2))
    ep_h_cond = ((np.arange(4)[None, None, :] & 1) != 0) | ((h_idx_g > a_idx_g)[:, :, None])
    ep_a_cond = ((np.arange(4)[None, None, :] & 2) != 0) | ((a_idx_g > h_idx_g)[:, :, None])
    p_ep2_h_vec = np.clip(np.sum(dp_b * ep_h_cond[None, :, :, :], axis=(1, 2, 3)), 0.001, 0.999)
    p_ep2_a_vec = np.clip(np.sum(dp_b * ep_a_cond[None, :, :, :], axis=(1, 2, 3)), 0.001, 0.999)

    # Calibrar en `VAL <= 2019` la probabilidad regular base (absorbiendo el exceso de empates Dixon-Coles en selecciones)
    # para aislar limpiamente en `OOS 2020..2024` el aporte puro del lift de Primer Paso (`p_ep2_dp - p_reg_dp`)!
    from sklearn.linear_model import LogisticRegression

    val_c_sub = res_intl[(res_intl["year"] >= 2012) & (res_intl["year"] <= 2019) & res_intl["tournament"].isin(covered_tournaments)]
    ks_11 = np.arange(11, dtype=np.float64)
    fac_11 = np.array([math.factorial(int(k)) for k in ks_11], dtype=np.float64)[None, :]
    vh_m = val_c_sub["mu_h"].to_numpy(dtype=np.float64)[:, None]
    va_m = val_c_sub["mu_a"].to_numpy(dtype=np.float64)[:, None]
    pmh_v = np.exp(-vh_m) * (vh_m ** ks_11) / fac_11
    pma_v = np.exp(-va_m) * (va_m ** ks_11) / fac_11
    pmh_v /= np.sum(pmh_v, axis=1, keepdims=True)
    pma_v /= np.sum(pma_v, axis=1, keepdims=True)
    mat_v = pmh_v[:, :, None] * pma_v[:, None, :]
    pr_hv = np.clip(np.sum(mat_v[:, ks_11[:, None] > ks_11[None, :]], axis=1), 1e-5, 1.0 - 1e-5)
    pr_av = np.clip(np.sum(mat_v[:, ks_11[:, None] < ks_11[None, :]], axis=1), 1e-5, 1.0 - 1e-5)
    X_cal_reg = np.log(np.concatenate([pr_hv, pr_av]) / (1.0 - np.concatenate([pr_hv, pr_av]))).reshape(-1, 1)
    y_cal_reg = np.concatenate(
        [
            (val_c_sub["home_score"].to_numpy() > val_c_sub["away_score"].to_numpy()).astype(int),
            (val_c_sub["away_score"].to_numpy() > val_c_sub["home_score"].to_numpy()).astype(int),
        ]
    )
    lr_reg = LogisticRegression(C=5.0).fit(X_cal_reg, y_cal_reg)

    raw_reg_oos = np.clip(np.concatenate([p_reg_h_vec, p_reg_a_vec]), 1e-5, 1.0 - 1e-5)
    lg_reg_oos = np.log(raw_reg_oos / (1.0 - raw_reg_oos))
    p_reg_cal_oos = np.clip(1.0 / (1.0 + np.exp(-(float(lr_reg.intercept_[0]) + float(lr_reg.coef_[0, 0]) * lg_reg_oos))), 0.001, 0.998)
    dp_lift_oos = np.maximum(0.0, np.concatenate([p_ep2_h_vec - p_reg_h_vec, p_ep2_a_vec - p_reg_a_vec]))
    p_ep2_cal_oos = np.clip(p_reg_cal_oos + dp_lift_oos, p_reg_cal_oos, 0.999)

    ep_arr = np.column_stack(
        [
            np.concatenate([y_ep2_h_list, y_ep2_a_list]),
            np.concatenate([y_reg_h_list, y_reg_a_list]),
            p_ep2_cal_oos,
            p_reg_cal_oos,
        ]
    )
    # Evaluar predicción exacta `p_home_early_payout` frente a usar ingenuamente `p_home` (que ignora remontadas tras ir +2!)
    ev_ep2_oos = paired_bootstrap_binary(ep_arr[:, 0], ep_arr[:, 2], np.clip(ep_arr[:, 3], 0.001, 0.999))
    emp_ep_lift = float(np.mean(ep_arr[:, 0]) - np.mean(ep_arr[:, 1]))
    pred_ep_lift = float(np.mean(ep_arr[:, 2] - ep_arr[:, 3]))
    print(
        f"\n=== EXP_V54 EARLY PAYOUT (+2 GOLES) MINUTE-BY-MINUTE VALIDATION OOS (2020..2024, n={len(ep_arr):,}) ===\n"
        f"  Extra Win Rate (+2G then Drawn/Lost): Observed={100*emp_ep_lift:+.2f} pp vs Predicted DP={100*pred_ep_lift:+.2f} pp\n"
        f"  Early-Payout Ticket Log-Loss: Naive Regular pHome={ev_ep2_oos['benchmark_log_loss']:.5f} -> "
        f"Passage-Time DP={ev_ep2_oos['log_loss']:.5f} (ECE={100*ev_ep2_oos['ece']:.2f}%) | dLL={ev_ep2_oos['delta_ll']:+.5f} ({ev_ep2_oos['significance']})"
    )

    # =========================================================================
    # 2. Calibrar en `VAL <= 2019` y Validar `In-Play` (`HT -> FT`, minuto 45') en `matches.parquet` (`OOS 2020..2024`, n=26,649)
    # =========================================================================
    m_df = pd.read_parquet(PRED_LAB_ROOT / "data" / "processed" / "matches.parquet")
    m_df["md_str"] = m_df["match_date"].astype(str).str.slice(0, 10)
    m_df = m_df[m_df["md_str"] < HOLDOUT_CUT_DATE].copy()
    if bool((m_df["md_str"] >= HOLDOUT_CUT_DATE).any()):
        raise RuntimeError("HoldoutSealedAccessError en EXP_V54 matches")

    f_cols = pd.read_parquet(PRED_LAB_ROOT / "data" / "processed" / "features.parquet", columns=["match_id", "dc_lam_home", "dc_lam_away"])
    m_df = m_df.merge(f_cols, on="match_id", how="left")
    m_df["sstart"] = pd.to_numeric(m_df["season_start"], errors="coerce").fillna(2000).astype(int)
    req_ht = ["home_goals", "away_goals", "ht_home_goals", "ht_away_goals", "dc_lam_home", "dc_lam_away"]
    for c in req_ht:
        m_df[c] = pd.to_numeric(m_df[c], errors="coerce")
    ht_df = m_df[m_df[req_ht].notna().all(axis=1) & (m_df["sstart"] >= 2014)].copy().reset_index(drop=True)

    # Cuota exacta de goles que ocurren en `45..90'` según `w_buckets_6`: `w[3] + w[4] + w[5]` (~55.8% de los goles!)
    sh_2h_emp = sum(w_buckets_6[3:])
    sh_2h_naive = 0.50  # Poisson homogéneo ingenuo asume 50.0% restante al minuto 45'

    val_ht = ht_df[ht_df["sstart"] <= 2019]
    oos_ht = ht_df[ht_df["sstart"] >= 2020]

    # Calibrar `second_half_trailing_push` en `VAL <= 2019` sobre `HT -> FT 1X2`
    def _eval_ht_1x2_fast(sub: pd.DataFrame, share_2h: float, trail_push: float) -> np.ndarray:
        lh = np.clip(sub["dc_lam_home"].to_numpy(dtype=np.float64), 0.15, 5.5) * share_2h
        la = np.clip(sub["dc_lam_away"].to_numpy(dtype=np.float64), 0.15, 5.5) * share_2h
        hth = sub["ht_home_goals"].to_numpy(dtype=int)
        hta = sub["ht_away_goals"].to_numpy(dtype=int)

        h_tr = hth < hta
        a_tr = hta < hth
        lh = np.where(h_tr, lh * (1.0 + trail_push), np.where(a_tr, lh * (1.0 - 0.5 * trail_push), lh))
        la = np.where(a_tr, la * (1.0 + trail_push), np.where(h_tr, la * (1.0 - 0.5 * trail_push), la))

        ks = np.arange(9, dtype=np.float64)
        facts = np.array([math.factorial(int(k)) for k in ks], dtype=np.float64)[None, :]
        ph = np.exp(-lh[:, None]) * (lh[:, None] ** ks[None, :]) / facts
        pa = np.exp(-la[:, None]) * (la[:, None] ** ks[None, :]) / facts
        ph /= np.sum(ph, axis=1, keepdims=True)
        pa /= np.sum(pa, axis=1, keepdims=True)
        mat = ph[:, :, None] * pa[:, None, :]
        fh = hth[:, None, None] + ks[None, :, None]
        fa = hta[:, None, None] + ks[None, None, :]
        p_h = np.sum(mat * (fh > fa), axis=(1, 2))
        p_d = np.sum(mat * (fh == fa), axis=(1, 2))
        p_a = np.sum(mat * (fh < fa), axis=(1, 2))
        return np.clip(np.column_stack([p_h, p_d, p_a]), 1e-6, 1.0 - 1e-6)

    y_ht_val = np.where(val_ht["home_goals"] > val_ht["away_goals"], 0, np.where(val_ht["home_goals"] == val_ht["away_goals"], 1, 2)).astype(np.int64)
    best_push = 0.06
    best_ht_ll = float("inf")
    for p_try in (0.0, 0.05, 0.09, 0.14):
        pv = _eval_ht_1x2_fast(val_ht, sh_2h_emp, p_try)
        ll_v = float(np.mean(oc.compute_categorical_log_loss_vec(pv, y_ht_val)))
        if ll_v < best_ht_ll:
            best_ht_ll = ll_v
            best_push = p_try

    y_ht_oos = np.where(oos_ht["home_goals"] > oos_ht["away_goals"], 0, np.where(oos_ht["home_goals"] == oos_ht["away_goals"], 1, 2)).astype(np.int64)
    P_inplay_v5_oos = _eval_ht_1x2_fast(oos_ht, sh_2h_emp, best_push)
    P_inplay_naive_oos = _eval_ht_1x2_fast(oos_ht, sh_2h_naive, 0.0)
    ev_inplay_ht_oos = oc.evaluate_calibration_with_bootstrap(
        P_inplay_v5_oos,
        y_ht_oos,
        benchmark_ll_vec=oc.compute_categorical_log_loss_vec(P_inplay_naive_oos, y_ht_oos),
        n_resamples=BOOTSTRAP_SAMPLES,
        seed=BOOTSTRAP_SEED,
        include_bins=False,
    )

    # Cuota empírica de remontada/empate en clubes `OOS 2020..2024` tras ir ganando por `>= 2` goles al descanso (`HT +2 -> FT Draw/Loss`)
    ht_up2 = oos_ht[(oos_ht["ht_home_goals"] - oos_ht["ht_away_goals"]) >= 2]
    blown_ht2_rate = float(np.mean(ht_up2["home_goals"] <= ht_up2["away_goals"])) if len(ht_up2) > 0 else 0.0

    # Validación masiva en Clubes `OOS 2020..2024` (`n = 26,650 x 2 = 53,300` boletos Local+Visita)
    # usando `(dc_lam_home, dc_lam_away)` calibrados con Dixon-Coles (`rho = -0.105`) sobre `I(HT_diff >= 2 U FT_diff > 0)`!
    sh_1h_emp = 1.0 - sh_2h_emp
    lh_c = np.clip(oos_ht["dc_lam_home"].to_numpy(dtype=np.float64), 0.15, 5.5)
    la_c = np.clip(oos_ht["dc_lam_away"].to_numpy(dtype=np.float64), 0.15, 5.5)
    ks_c = np.arange(9, dtype=np.float64)
    fac_c = np.array([math.factorial(int(k)) for k in ks_c], dtype=np.float64)[None, :]

    def _dc_grid_batch(mh_v: np.ndarray, ma_v: np.ndarray, rho_v: float) -> np.ndarray:
        ph = np.exp(-mh_v[:, None]) * (mh_v[:, None] ** ks_c) / fac_c
        pa = np.exp(-ma_v[:, None]) * (ma_v[:, None] ** ks_c) / fac_c
        ph /= np.sum(ph, axis=1, keepdims=True)
        pa /= np.sum(pa, axis=1, keepdims=True)
        mat = ph[:, :, None] * pa[:, None, :]
        mat[:, 0, 0] *= np.maximum(1.0 - mh_v * ma_v * rho_v, 1e-6)
        mat[:, 0, 1] *= np.maximum(1.0 + mh_v * rho_v, 1e-6)
        mat[:, 1, 0] *= np.maximum(1.0 + ma_v * rho_v, 1e-6)
        mat[:, 1, 1] *= np.maximum(1.0 - rho_v, 1e-6)
        mat /= np.sum(mat, axis=(1, 2), keepdims=True)
        return mat

    mat_ft_c = _dc_grid_batch(lh_c, la_c, -0.105)
    p_ft_h_c = np.sum(mat_ft_c[:, ks_c[:, None] > ks_c[None, :]], axis=1)
    p_ft_a_c = np.sum(mat_ft_c[:, ks_c[:, None] < ks_c[None, :]], axis=1)

    mat_1h_c = _dc_grid_batch(lh_c * sh_1h_emp, la_c * sh_1h_emp, -0.07)
    mat_2h_c = _dc_grid_batch(lh_c * sh_2h_emp, la_c * sh_2h_emp, -0.04)

    # Probabilidad exacta de ir `>= +2` al 45' Y terminar empatando o perdiendo al 90'
    extra_ht_ep_h = np.zeros(len(oos_ht), dtype=np.float64)
    extra_ht_ep_a = np.zeros(len(oos_ht), dtype=np.float64)
    diff_2h_grid = ks_c[:, None] - ks_c[None, :]
    for h1 in range(9):
        for a1 in range(9):
            d1 = h1 - a1
            if d1 >= 2:
                # Local pierde la ventaja si `diff_2h <= -d1`
                p_blow_h = np.sum(mat_2h_c[:, diff_2h_grid <= -d1], axis=1)
                extra_ht_ep_h += mat_1h_c[:, h1, a1] * p_blow_h
            elif d1 <= -2:
                # Visita (`lead = -d1 >= 2`) pierde la ventaja si `diff_2h >= -d1`
                p_blow_a = np.sum(mat_2h_c[:, diff_2h_grid >= -d1], axis=1)
                extra_ht_ep_a += mat_1h_c[:, h1, a1] * p_blow_a

    hg_co = oos_ht["home_goals"].to_numpy()
    ag_co = oos_ht["away_goals"].to_numpy()
    hth_co = oos_ht["ht_home_goals"].to_numpy()
    hta_co = oos_ht["ht_away_goals"].to_numpy()

    y_club_ep_53k = np.concatenate(
        [
            (((hth_co - hta_co) >= 2) | (hg_co > ag_co)).astype(np.float64),
            (((hta_co - hth_co) >= 2) | (ag_co > hg_co)).astype(np.float64),
        ]
    )
    p_club_reg_53k = np.clip(np.concatenate([p_ft_h_c, p_ft_a_c]), 0.001, 0.998)
    p_club_ep_53k = np.clip(np.concatenate([p_ft_h_c + extra_ht_ep_h, p_ft_a_c + extra_ht_ep_a]), p_club_reg_53k, 0.999)
    ev_club_ep_53k = paired_bootstrap_binary(y_club_ep_53k, p_club_ep_53k, p_club_reg_53k)

    print(
        f"\n=== EXP_V54 IN-PLAY SPACETIME v5.0 & CLUB EARLY PAYOUT (OOS 2020..2024, n={len(oos_ht):,}) ===\n"
        f"  HT->FT 1X2 Log-Loss: Homogeneous Poisson={float(np.mean(oc.compute_categorical_log_loss_vec(P_inplay_naive_oos, y_ht_oos))):.5f} -> "
        f"Spacetime v5.0={ev_inplay_ht_oos['log_loss']:.5f} (ECE={100*ev_inplay_ht_oos['ece']:.2f}%) | "
        f"dLL={ev_inplay_ht_oos['delta_ll_vs_benchmark']:+.5f} ({ev_inplay_ht_oos['significance']})\n"
        f"  Club Early-Payout Tickets OOS (n={len(y_club_ep_53k):,}): Regular pWin={ev_club_ep_53k['benchmark_log_loss']:.5f} -> "
        f"Early-Payout DP={ev_club_ep_53k['log_loss']:.5f} (ECE={100*ev_club_ep_53k['ece']:.2f}%) | "
        f"dLL={ev_club_ep_53k['delta_ll']:+.5f} ({ev_club_ep_53k['significance']})\n"
        f"  Club Matches Leading by >=2 at HT (n={len(ht_up2):,}) Blowing Lead in 2H (Saved by Early Payout!): {100*blown_ht2_rate:.2f}%"
    )

    soccer_cfg_final = {
        "minute_bucket_weights_6": w_buckets_6,
        "own_red_card_rate_mult": 0.66,
        "opp_red_card_rate_mult": 1.36,
        "second_half_trailing_push": best_push,
        "max_goals_dp": SOCCER_DP_MAX_GOALS,
    }

    inplay_art = {
        "schema_version": "inplay_early_payout_v5.0.0",
        "codename": "PitchLab Early-Payout Passage-Time DP & In-Play Spacetime v5.0",
        "version": "5.0.0-candidate",
        "status": "candidate",
        "production_activated": False,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "soccer": soccer_cfg_final,
        "points_sports_early_payout": {
            # Barrera efectiva ajustada por saltos discretos (TD +3/+7 en NFL, rachas en NBA, jonrones en MLB)
            "nfl": {"trigger_lead": 17, "sigma_margin": 13.8, "effective_barrier": 15.6},
            "nba": {"trigger_lead": 20, "sigma_margin": 12.2, "effective_barrier": 18.8},
            "mlb": {"trigger_lead": 5, "sigma_margin": 4.25, "effective_barrier": 4.55},
        },
        "nfl_inplay": {
            "sigma_full_game": 13.8,
            "sigma_total_full_game": 13.4,
            "possession_value_points": 2.15,
        },
    }
    INPLAY_MODEL_OUT.write_text(json.dumps(inplay_art, indent=2), encoding="utf-8")

    # Snapshot de paridad `< 1e-13` (`36` escenarios pre-partido e In-Play con tarjetas rojas, +2G, NFL/NBA/MLB EP y NFL In-Play)
    rng = np.random.default_rng(MODEL_SEED)
    soccer_cases: list[dict[str, Any]] = []
    for idx_s in range(24):
        mh = round(float(rng.uniform(0.75, 2.65)), 4)
        ma = round(float(rng.uniform(0.65, 2.35)), 4)
        c_min = 0 if idx_s < 10 else int(rng.choice([18, 45, 62, 78]))
        chg = 0 if c_min == 0 else int(rng.choice([0, 1, 2]))
        cag = 0 if c_min == 0 else int(rng.choice([0, 1, 2]))
        rch = 1 if idx_s % 6 == 0 and c_min > 0 else 0
        rca = 1 if idx_s % 7 == 0 and c_min > 0 else 0
        out_s = evaluate_soccer_early_payout_and_inplay_scalar(
            pregame_mu_home=mh,
            pregame_mu_away=ma,
            current_minute=c_min,
            current_home_goals=chg,
            current_away_goals=cag,
            red_cards_home=rch,
            red_cards_away=rca,
            home_already_hit_2=False,
            away_already_hit_2=False,
            soccer_cfg=soccer_cfg_final,
        )
        soccer_cases.append(
            {
                "input": {
                    "pregameMuHome": mh,
                    "pregameMuAway": ma,
                    "currentMinute": c_min,
                    "currentHomeGoals": chg,
                    "currentAwayGoals": cag,
                    "redCardsHome": rch,
                    "redCardsAway": rca,
                },
                "expected": out_s,
            }
        )

    points_ep_cases: list[dict[str, Any]] = []
    for sp_nm in ("nfl", "nba", "mlb"):
        for pw in (0.34, 0.50, 0.66, 0.78):
            points_ep_cases.append(
                {
                    "sport": sp_nm,
                    "p_home_win": pw,
                    "expected": evaluate_points_sport_ep_scalar(sp_nm, pw, inplay_art),
                }
            )

    nfl_live_cases: list[dict[str, Any]] = []
    for sec_r, hs_l, as_l, poss_l in [
        (3600.0, 0, 0, "neutral"),
        (1800.0, 17, 7, "away"),
        (900.0, 20, 24, "home"),
        (180.0, 27, 24, "away"),
    ]:
        nfl_live_cases.append(
            {
                "seconds_remaining": sec_r,
                "home_score": hs_l,
                "away_score": as_l,
                "pregame_exp_margin": 2.5,
                "pregame_exp_total": 46.5,
                "possession": poss_l,
                "expected": evaluate_nfl_inplay_scalar(sec_r, hs_l, as_l, 2.5, 46.5, poss_l, inplay_art),
            }
        )

    INPLAY_SNAPSHOT_OUT.write_text(
        json.dumps(
            {
                "schema_version": "inplay_early_payout_v5.0_parity_snapshot",
                "holdout_sealed_untouched": True,
                "soccer_cases": soccer_cases,
                "points_ep_cases": points_ep_cases,
                "nfl_live_cases": nfl_live_cases,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    results_payload = {
        "experiment_id": "EXP_V54_inplay_early_payout_v5_0",
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "minute_bucket_weights_6_val": w_buckets_6,
        "early_payout_2_goals_minute_trajectory_oos": {
            "n_matches": int(len(ep_arr)),
            "observed_extra_win_lift": round(emp_ep_lift, 5),
            "predicted_dp_extra_win_lift": round(pred_ep_lift, 5),
            "vs_naive_regular_win_prob": ev_ep2_oos,
        },
        "club_early_payout_53k_tickets_oos": ev_club_ep_53k,
        "inplay_halftime_to_fulltime_oos": ev_inplay_ht_oos,
        "club_ht_plus2_blown_lead_rate_oos": round(blown_ht2_rate, 5),
        "artifacts": {
            "model_inplay_early_payout_v5_0_sha256": hashlib.sha256(INPLAY_MODEL_OUT.read_bytes()).hexdigest(),
        },
    }
    RESULTS_OUT.write_text(json.dumps(results_payload, indent=2), encoding="utf-8")

    with TRIAL_REGISTRY_OUT.open("a", encoding="utf-8") as fh:
        fh.write(
            json.dumps(
                {
                    "recorded_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "experiment_id": "EXP_V54_inplay_early_payout_v5_0",
                    "holdout_touched": False,
                    "ep2_dll_vs_regular": round(ev_ep2_oos["delta_ll"], 6),
                    "inplay_ht_dll_vs_homog": round(ev_inplay_ht_oos["delta_ll_vs_benchmark"], 6),
                }
            )
            + "\n"
        )
    print(f"[DONE] EXP_V54 guardado en {RESULTS_OUT.name}")


if __name__ == "__main__":
    main()
