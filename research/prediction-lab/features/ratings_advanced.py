#!/usr/bin/env python3
"""Sistemas de rating dinámicos de 2ª generación (100% causales, sin fuga de información).

Incluye:
1. Elo Mejorado (EXP02: season_reg=0.0, K=20, HFA=65) con continuidad inter-división
   (ascensos/descensos dentro del mismo país con puente de nivel TIER_OFFSET=135)
   y escala global ClubElo.
2. Pi-Ratings (Constantinou & Fenton, 2013): ratings separados en casa y fuera
   actualizados mediante discrepancia amortiguada de diferencia de goles.
3. Fuerza Dinámica de Ataque/Defensa + Probabilidades Estructurales Dixon-Coles Online:
   estima tasas de goles esperados ajustadas por oponente (lambda_H, lambda_A) y
   probabilidades 1X2 (dc_prob_h, dc_prob_d, dc_prob_a) incluyendo la corrección
   de marcadores bajos (0-0, 1-0, 0-1, 1-1).
"""
from __future__ import annotations

import math
import numpy as np
import pandas as pd

# Parámetros óptimos validados en EXP02 (season_reg = 0.0 mejora -0.00210 nats sobre 0.33)
ELO_INIT = 1500.0
ELO_K = 20.0
ELO_HFA = 65.0
ELO_SEASON_REGRESSION = 0.0
TIER_ELO_OFFSET = 135.0  # Diferencia empírica media entre 1ª y 2ª división del mismo país

# Anclas base estilo ClubElo por división
DIV_INFO: dict[str, tuple[str, int, float]] = {
    "E0": ("England", 1, 1650.0),
    "E1": ("England", 2, 1485.0),
    "SP1": ("Spain", 1, 1635.0),
    "SP2": ("Spain", 2, 1470.0),
    "D1": ("Germany", 1, 1620.0),
    "D2": ("Germany", 2, 1455.0),
    "I1": ("Italy", 1, 1615.0),
    "I2": ("Italy", 2, 1450.0),
    "F1": ("France", 1, 1575.0),
    "F2": ("France", 2, 1415.0),
    "P1": ("Portugal", 1, 1530.0),
    "N1": ("Netherlands", 1, 1525.0),
    "B1": ("Belgium", 1, 1500.0),
    "T1": ("Turkey", 1, 1490.0),
    "G1": ("Greece", 1, 1470.0),
    "SC0": ("Scotland", 1, 1450.0),
    "SC1": ("Scotland", 2, 1310.0),
    "BRA": ("Brazil", 1, 1545.0),
    "ARG": ("Argentina", 1, 1525.0),
    "MEX": ("Mexico", 1, 1510.0),
    "USA": ("USA", 1, 1475.0),
    "JPN": ("Japan", 1, 1465.0),
    "SWE": ("Sweden", 1, 1435.0),
}

# Parámetros de Pi-Ratings (Constantinou & Fenton, 2013)
PI_LAMBDA = 0.035
PI_GAMMA = 0.70
PI_C = 3.0

# Parámetros de Ataque/Defensa Poisson-Dixon-Coles online
POISSON_LR_ATT = 0.022
POISSON_LR_DEF = 0.022
POISSON_DECAY = 0.004
DC_RHO = -0.11
MAX_GOALS_GRID = 8

_LOG_FACT = np.array([math.lgamma(k + 1) for k in range(MAX_GOALS_GRID + 1)], dtype=float)
_K_RANGE = np.arange(MAX_GOALS_GRID + 1, dtype=float)


def _pi_expected_gd(rating: float) -> float:
    if rating == 0.0:
        return 0.0
    val = (10.0 ** (abs(rating) / PI_C)) - 1.0
    return val if rating > 0.0 else -val


def _dixon_coles_1x2(lam_h: float, lam_a: float, rho: float = DC_RHO) -> tuple[float, float, float]:
    """Calcula P(H), P(D), P(A) bajo el modelo bivariado de Dixon-Coles (1997)."""
    lh = max(0.15, min(5.5, float(lam_h)))
    la = max(0.15, min(5.5, float(lam_a)))
    pmf_h = np.exp(_K_RANGE * math.log(lh) - lh - _LOG_FACT)
    pmf_a = np.exp(_K_RANGE * math.log(la) - la - _LOG_FACT)
    mat = np.outer(pmf_h, pmf_a)

    mat[0, 0] *= max(0.0, 1.0 - lh * la * rho)
    mat[1, 0] *= max(0.0, 1.0 + la * rho)
    mat[0, 1] *= max(0.0, 1.0 + lh * rho)
    mat[1, 1] *= max(0.0, 1.0 - rho)

    total = float(mat.sum())
    if total <= 0.0 or not math.isfinite(total):
        return 0.45, 0.27, 0.28
    mat /= total
    p_d = float(np.trace(mat))
    p_h = float(np.tril(mat, k=-1).sum())
    p_a = float(np.triu(mat, k=1).sum())
    return p_h, p_d, p_a


def compute_advanced_ratings(df: pd.DataFrame) -> pd.DataFrame:
    """Calcula features causales de Elo mejorado, Pi-Ratings y Ataque/Defensa Dixon-Coles.

    Requiere que `df` esté ordenado cronológicamente por `match_date, kickoff_time, match_id`.
    """
    n = len(df)
    elo_h = np.empty(n, dtype=float)
    elo_a = np.empty(n, dtype=float)
    elo_g_h = np.empty(n, dtype=float)
    elo_g_a = np.empty(n, dtype=float)
    clubelo_h = np.empty(n, dtype=float)
    clubelo_a = np.empty(n, dtype=float)
    clubelo_h_post = np.empty(n, dtype=float)
    clubelo_a_post = np.empty(n, dtype=float)
    promoted_h = np.zeros(n, dtype=float)
    promoted_a = np.zeros(n, dtype=float)
    relegated_h = np.zeros(n, dtype=float)
    relegated_a = np.zeros(n, dtype=float)

    pi_h_home = np.empty(n, dtype=float)
    pi_a_away = np.empty(n, dtype=float)
    pi_diff = np.empty(n, dtype=float)
    pi_exp_gd = np.empty(n, dtype=float)
    pi_overall_diff = np.empty(n, dtype=float)
    pi_hh_post = np.empty(n, dtype=float)
    pi_ha_post = np.empty(n, dtype=float)
    pi_ah_post = np.empty(n, dtype=float)
    pi_aa_post = np.empty(n, dtype=float)

    att_h = np.empty(n, dtype=float)
    def_h = np.empty(n, dtype=float)
    att_a = np.empty(n, dtype=float)
    def_a = np.empty(n, dtype=float)
    att_h_post = np.empty(n, dtype=float)
    def_h_post = np.empty(n, dtype=float)
    att_a_post = np.empty(n, dtype=float)
    def_a_post = np.empty(n, dtype=float)
    dc_lam_h = np.empty(n, dtype=float)
    dc_lam_a = np.empty(n, dtype=float)
    dc_prob_h = np.empty(n, dtype=float)
    dc_prob_d = np.empty(n, dtype=float)
    dc_prob_a = np.empty(n, dtype=float)
    elo_exp_h = np.empty(n, dtype=float)

    elo_local: dict[tuple[str, str], float] = {}
    elo_global: dict[tuple[str, str], float] = {}
    last_tier: dict[tuple[str, str], int] = {}
    last_season: dict[tuple[str, str], str] = {}
    team_status_season: dict[tuple[str, str, str], tuple[float, float]] = {}
    games_cnt: dict[tuple[str, str], int] = {}
    pi_state: dict[tuple[str, str], tuple[float, float]] = {}
    ad_state: dict[tuple[str, str], tuple[float, float]] = {}
    div_rates: dict[str, tuple[float, float]] = {}

    divs = df["div"].to_numpy()
    seasons = df["season"].to_numpy()
    homes = df["home_team"].to_numpy()
    aways = df["away_team"].to_numpy()
    hg = df["home_goals"].to_numpy(dtype=float)
    ag = df["away_goals"].to_numpy(dtype=float)

    for i in range(n):
        div = str(divs[i])
        season = str(seasons[i])
        country, tier, base_global = DIV_INFO.get(div, (div, 1, 1500.0))
        h = str(homes[i])
        a = str(aways[i])
        kh = h
        ka = a

        for k in (kh, ka):
            if k not in elo_local:
                elo_local[k] = ELO_INIT
                elo_global[k] = base_global
                last_tier[k] = tier
                last_season[k] = season
                games_cnt[k] = 0
                pi_state[k] = (0.0, 0.0)
                ad_state[k] = (0.0, 0.0)
            else:
                prev_tier = last_tier[k]
                if prev_tier != tier:
                    tier_diff = prev_tier - tier
                    elo_local[k] = elo_local[k] - tier_diff * TIER_ELO_OFFSET
                    r_h, r_a = pi_state[k]
                    pi_state[k] = (r_h - 0.18 * tier_diff, r_a - 0.18 * tier_diff)
                    al, be = ad_state[k]
                    ad_state[k] = (al - 0.12 * tier_diff, be + 0.12 * tier_diff)
                    if tier_diff > 0:
                        team_status_season[(div, k, season)] = (1.0, 0.0)
                    else:
                        team_status_season[(div, k, season)] = (0.0, 1.0)
                    last_tier[k] = tier
                if last_season[k] != season:
                    if ELO_SEASON_REGRESSION > 0.0:
                        elo_local[k] = (1.0 - ELO_SEASON_REGRESSION) * elo_local[k] + ELO_SEASON_REGRESSION * ELO_INIT
                    last_season[k] = season

        eh = elo_local[kh]
        ea = elo_local[ka]
        elo_h[i] = eh
        elo_a[i] = ea
        elo_g_h[i] = games_cnt[kh]
        elo_g_a[i] = games_cnt[ka]
        clubelo_h[i] = elo_global[kh]
        clubelo_a[i] = elo_global[ka]

        pr_h, rel_h = team_status_season.get((div, h, season), (0.0, 0.0))
        pr_a, rel_a = team_status_season.get((div, a, season), (0.0, 0.0))
        promoted_h[i] = pr_h
        relegated_h[i] = rel_h
        promoted_a[i] = pr_a
        relegated_a[i] = rel_a

        exp_h = 1.0 / (1.0 + 10.0 ** (-(eh - ea + ELO_HFA) / 400.0))
        elo_exp_h[i] = exp_h

        r_hh, r_ha = pi_state[kh]
        r_ah, r_aa = pi_state[ka]
        pi_h_home[i] = r_hh
        pi_a_away[i] = r_aa
        pi_diff[i] = r_hh - r_aa
        eg_h = _pi_expected_gd(r_hh)
        eg_a = _pi_expected_gd(r_aa)
        pred_gd = eg_h - eg_a
        pi_exp_gd[i] = pred_gd
        pi_overall_diff[i] = 0.5 * (r_hh + r_ha) - 0.5 * (r_ah + r_aa)

        al_h, be_h = ad_state[kh]
        al_a, be_a = ad_state[ka]
        att_h[i] = al_h
        def_h[i] = be_h
        att_a[i] = al_a
        def_a[i] = be_a

        mu_h, mu_a = 1.48, 1.14
        lam_h = mu_h * math.exp(max(-1.2, min(1.2, al_h + be_a)))
        lam_a = mu_a * math.exp(max(-1.2, min(1.2, al_a + be_h)))
        dc_lam_h[i] = lam_h
        dc_lam_a[i] = lam_a
        ph, pd_val, pa = _dixon_coles_1x2(lam_h, lam_a)
        dc_prob_h[i] = ph
        dc_prob_d[i] = pd_val
        dc_prob_a[i] = pa

        if np.isfinite(hg[i]) and np.isfinite(ag[i]):
            g_h = float(hg[i])
            g_a = float(ag[i])
            if g_h > g_a:
                s_h = 1.0
            elif g_h == g_a:
                s_h = 0.5
            else:
                s_h = 0.0
            gd_abs = abs(g_h - g_a)
            mult = math.log(gd_abs + 1.0) if gd_abs > 1.0 else 1.0

            delta_local = ELO_K * mult * (s_h - exp_h)
            elo_local[kh] = eh + delta_local
            elo_local[ka] = ea - delta_local

            exp_glob = 1.0 / (1.0 + 10.0 ** (-(elo_global[kh] - elo_global[ka] + ELO_HFA) / 400.0))
            delta_glob = ELO_K * mult * (s_h - exp_glob)
            elo_global[kh] = elo_global[kh] + delta_glob
            elo_global[ka] = elo_global[ka] - delta_glob

            games_cnt[kh] += 1
            games_cnt[ka] += 1

            actual_gd = g_h - g_a
            err = abs(actual_gd - pred_gd)
            psi = PI_C * math.log10(1.0 + err)
            signed_psi = psi if actual_gd >= pred_gd else -psi
            d_pi = PI_LAMBDA * signed_psi
            pi_state[kh] = (r_hh + d_pi, r_ha + PI_GAMMA * d_pi)
            pi_state[ka] = (r_ah - PI_GAMMA * d_pi, r_aa - d_pi)

            err_h = max(-4.0, min(4.0, g_h - lam_h))
            err_a = max(-4.0, min(4.0, g_a - lam_a))
            new_al_h = (1.0 - POISSON_DECAY) * al_h + POISSON_LR_ATT * err_h
            new_be_a = (1.0 - POISSON_DECAY) * be_a + POISSON_LR_DEF * err_h
            new_al_a = (1.0 - POISSON_DECAY) * al_a + POISSON_LR_ATT * err_a
            new_be_h = (1.0 - POISSON_DECAY) * be_h + POISSON_LR_DEF * err_a
            ad_state[kh] = (new_al_h, new_be_h)
            ad_state[ka] = (new_al_a, new_be_a)

            div_rates[div] = (0.995 * mu_h + 0.005 * g_h, 0.995 * mu_a + 0.005 * g_a)

        clubelo_h_post[i] = elo_global[kh]
        clubelo_a_post[i] = elo_global[ka]
        pi_hh_post[i], pi_ha_post[i] = pi_state[kh]
        pi_ah_post[i], pi_aa_post[i] = pi_state[ka]
        att_h_post[i], def_h_post[i] = ad_state[kh]
        att_a_post[i], def_a_post[i] = ad_state[ka]

    return pd.DataFrame(
        {
            "elo_home": elo_h,
            "elo_away": elo_a,
            "elo_diff": elo_h - elo_a,
            "elo_sum": elo_h + elo_a,
            "elo_games_home": elo_g_h,
            "elo_games_away": elo_g_a,
            "elo_exp_h": elo_exp_h,
            "clubelo_home": clubelo_h,
            "clubelo_away": clubelo_a,
            "clubelo_diff": clubelo_h - clubelo_a,
            "clubelo_home_post": clubelo_h_post,
            "clubelo_away_post": clubelo_a_post,
            "promoted_home": promoted_h,
            "promoted_away": promoted_a,
            "relegated_home": relegated_h,
            "relegated_away": relegated_a,
            "pi_home_h": pi_h_home,
            "pi_away_a": pi_a_away,
            "pi_diff": pi_diff,
            "pi_exp_gd": pi_exp_gd,
            "pi_overall_diff": pi_overall_diff,
            "pi_hh_post": pi_hh_post,
            "pi_ha_post": pi_ha_post,
            "pi_ah_post": pi_ah_post,
            "pi_aa_post": pi_aa_post,
            "att_strength_home": att_h,
            "def_strength_home": def_h,
            "att_strength_away": att_a,
            "def_strength_away": def_a,
            "att_h_post": att_h_post,
            "def_h_post": def_h_post,
            "att_a_post": att_a_post,
            "def_a_post": def_a_post,
            "dc_lam_home": dc_lam_h,
            "dc_lam_away": dc_lam_a,
            "dc_exp_total": dc_lam_h + dc_lam_a,
            "dc_exp_diff": dc_lam_h - dc_lam_a,
            "dc_prob_h": dc_prob_h,
            "dc_prob_d": dc_prob_d,
            "dc_prob_a": dc_prob_a,
        },
        index=df.index,
    )
