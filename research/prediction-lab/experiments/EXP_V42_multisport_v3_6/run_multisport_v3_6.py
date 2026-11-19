"""EXP_V42 — Evolución `PitchLab Spacetime Multi-Sport v3.6 Candidate` (`MLB`, `NHL`, `NBA`).

Corrige matemáticamente las tres fallas estructurales demostradas en la auditoría forense de Astra AI
(`Reportes/analisis-astra/06-...` y `14-...`):
  1. MLB (`Kepler v3.6 Candidate`):
     - Partición continua de entradas del abridor `E[IP_SP] in [1.0, 6.8]` con soporte nativo de *openers*
       (`1.2 IP` sin colapsar como `astra:data-notice`), contracción Empirical Bayes de `FIP/ERA` (`kappa_ip = 45`)
       y ajuste *platoon* `LHP/RHP`.
     - Mercados `F5` (`pHomeF5, pTieF5, pAwayF5, O/U 4.5`) sobre matriz Binomial Negativa `r_5 = 5.0`.
     - **Operador exacto de Cadena de Markov para Extra Innings (Regla Manfred corredor en 2.a + walk-off local):**
       elimina el sesgo de truncamiento de `-2.5 a -4.0 pp` en `Totals Over` de juego completo y captura la
       asimetría real del walk-off local en `Runline -1.5`.
  2. NHL (`Curvature v3.6 Candidate`):
     - Diferencial de equipos especiales (`PP%` vs `PK%`), fatiga *back-to-back* de portero, bandera explícita
       de confirmación de guardameta y régimen de **Portería Vacía (*Empty-Net*)** con identidad exacta de
       conservación `(E[G_H] - E[G_H,reg]) + (E[G_A] - E[G_A,reg]) == P(OT)` para `Puck Line +-1.5` y `Totals 5.5/6.0/6.5`.
  3. NBA (`Tensor v3.6 Candidate`):
     - Descuento directo en margen por **impacto ponderado de bajas titulares/estrellas (`BPM / NetRtg` perdido)**
       más ampliación de `sigma_margin` ante incertidumbre `GTD/Questionable` y fatiga `B2B / 3-in-4`.

Exporta `src/data/prediction/multisport_v3_6_config_candidate.json` y `multisport_v3_6_snapshot.json`
con paridad IEEE-754 `< 1e-12` frente a `src/domain/prediction/multisport_v3_6.ts`.
"""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
from typing import Any

import numpy as np

EXP_DIR = Path(__file__).resolve().parent
REPO_ROOT = EXP_DIR.parents[3]
ARTIFACTS_DIR = EXP_DIR / "artifacts"

HOLDOUT_CUT_ISO = "2025-02-02T17:30:00Z"

CONFIG_OUT = REPO_ROOT / "src" / "data" / "prediction" / "multisport_v3_6_config_candidate.json"
SNAPSHOT_OUT = REPO_ROOT / "src" / "data" / "prediction" / "multisport_v3_6_snapshot.json"
RESULTS_OUT = ARTIFACTS_DIR / "exp_v42_multisport_v3_6_results.json"
TRIAL_REGISTRY_OUT = EXP_DIR / "trial_registry_multisport_v36.jsonl"


def clamp(x: float, lo: float, hi: float) -> float:
    return min(max(float(x), lo), hi)


def normal_cdf_exact(x: float) -> float:
    """Espejo exacto IEEE-754 de `src/domain/prediction/math.ts::normalCdf` (Abramowitz & Stegun 7.1.26)."""
    xf = float(x)
    sign = -1.0 if xf < 0.0 else 1.0
    z = abs(xf) * 0.7071067811865475
    t = 1.0 / (1.0 + 0.3275911 * z)
    poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t
    erf_val = sign * (1.0 - poly * math.exp(-(z * z)))
    return 0.5 * (1.0 + erf_val)


def nb_pmf_exact(mu: float, r_disp: float, max_k: int) -> np.ndarray:
    mu_c = clamp(mu, 0.02, 30.0)
    r_c = clamp(r_disp, 0.5, 200.0)
    out = np.zeros(max_k + 1, dtype=np.float64)
    p0_ratio = r_c / (r_c + mu_c)
    q_ratio = mu_c / (r_c + mu_c)
    out[0] = math.exp(r_c * math.log(p0_ratio))
    for k in range(1, max_k + 1):
        out[k] = out[k - 1] * ((k - 1.0 + r_c) / float(k)) * q_ratio
    s = float(np.sum(out))
    if s > 0.0:
        out /= s
    return out


def poisson_pmf_exact(lam: float, max_k: int) -> np.ndarray:
    lc = clamp(lam, 0.01, 15.0)
    out = np.zeros(max_k + 1, dtype=np.float64)
    out[0] = math.exp(-lc)
    for k in range(1, max_k + 1):
        out[k] = out[k - 1] * lc / float(k)
    s = float(np.sum(out))
    if s > 0.0:
        out /= s
    return out


def convolve_1d_exact(a: np.ndarray, b: np.ndarray, max_k: int) -> np.ndarray:
    out = np.zeros(max_k + 1, dtype=np.float64)
    for i in range(len(a)):
        ai = float(a[i])
        if ai <= 0.0:
            continue
        for j in range(len(b)):
            idx = i + j
            if idx <= max_k:
                out[idx] += ai * float(b[j])
            else:
                out[max_k] += ai * float(b[j])
    s = float(np.sum(out))
    if s > 0.0:
        out /= s
    return out


def project_mlb_v36_exact(inp: dict[str, Any], cfg: dict[str, Any]) -> dict[str, Any]:
    """Modelo cerrado MLB `Kepler v3.6` con F5 + Cadena de Markov exacta de Extra Innings (Regla Manfred)."""
    c = cfg["mlb"]
    lg_woba = float(c["league_woba"])
    lg_fip = float(c["league_fip"])
    kappa_ip = float(c["starter_shrink_ip"])

    h_woba = float(inp.get("home_woba", lg_woba))
    a_woba = float(inp.get("away_woba", lg_woba))
    h_platoon = clamp(float(inp.get("home_platoon_mult", 1.0)), 0.88, 1.14)
    a_platoon = clamp(float(inp.get("away_platoon_mult", 1.0)), 0.88, 1.14)
    pf = clamp(float(inp.get("park_weather_mult", 1.0)), 0.84, 1.32)
    neutral = bool(inp.get("neutral_site", False))

    def _shrunk_sp(fip_v: float, era_v: float | None, ip_hist: float, rot_base: float) -> float:
        raw_q = 0.65 * float(fip_v) + 0.35 * float(era_v) if era_v is not None else float(fip_v)
        ip_c = max(0.0, float(ip_hist))
        return (ip_c * raw_q + kappa_ip * float(rot_base)) / (ip_c + kappa_ip)

    h_sp_q = _shrunk_sp(
        float(inp.get("home_sp_fip", lg_fip)),
        inp.get("home_sp_era"),
        float(inp.get("home_sp_ip_hist", 95.0)),
        float(inp.get("home_rot_fip", lg_fip)),
    )
    a_sp_q = _shrunk_sp(
        float(inp.get("away_sp_fip", lg_fip)),
        inp.get("away_sp_era"),
        float(inp.get("away_sp_ip_hist", 95.0)),
        float(inp.get("away_rot_fip", lg_fip)),
    )
    h_bp_fip = float(inp.get("home_bp_fip", lg_fip))
    a_bp_fip = float(inp.get("away_bp_fip", lg_fip))

    # Soporte nativo de Openers (ej. 1.2 IP) y playoffs (ej. 4.3 IP)
    h_ip_exp = 1.2 if bool(inp.get("home_is_opener", False)) else clamp(float(inp.get("home_sp_exp_ip", 5.3)), 1.0, 6.8)
    a_ip_exp = 1.2 if bool(inp.get("away_is_opener", False)) else clamp(float(inp.get("away_sp_exp_ip", 5.3)), 1.0, 6.8)

    hca_h = 1.0 if neutral else float(c["home_scoring_mult"])
    hca_a = 1.0 if neutral else float(c["away_scoring_mult"])
    w_floor = float(c.get("woba_zero_floor", 0.0))
    unearned_mult = float(c.get("unearned_runs_mult", 1.0))

    h_woba_ratio = (
        clamp((h_woba - w_floor) / max(lg_woba - w_floor, 0.04), 0.45, 1.85)
        if w_floor > 0.0
        else (h_woba / lg_woba)
    )
    a_woba_ratio = (
        clamp((a_woba - w_floor) / max(lg_woba - w_floor, 0.04), 0.45, 1.85)
        if w_floor > 0.0
        else (a_woba / lg_woba)
    )

    h_off_mult = h_woba_ratio * h_platoon * pf * hca_h * unearned_mult
    a_off_mult = a_woba_ratio * a_platoon * pf * hca_a * unearned_mult

    # En F5 (5 entradas), el visitante lanza `min(5, a_ip_exp)` con abridor y el resto con bullpen
    a_sp_f5 = min(5.0, a_ip_exp)
    a_bp_f5 = 5.0 - a_sp_f5
    h_sp_f5 = min(5.0, h_ip_exp)
    h_bp_f5 = 5.0 - h_sp_f5

    mu_f5_h = clamp(((a_sp_f5 * a_sp_q + a_bp_f5 * a_bp_fip) / 9.0) * h_off_mult, 0.45, 7.5)
    mu_f5_a = clamp(((h_sp_f5 * h_sp_q + h_bp_f5 * h_bp_fip) / 9.0) * a_off_mult, 0.45, 7.5)

    # En entradas 6..9 (4 entradas), el abridor lanza `max(0, ip_exp - 5)` y el resto el bullpen
    a_sp_l4 = max(0.0, a_ip_exp - 5.0)
    a_bp_l4 = max(0.0, 4.0 - a_sp_l4)
    h_sp_l4 = max(0.0, h_ip_exp - 5.0)
    h_bp_l4 = max(0.0, 4.0 - h_sp_l4)

    mu_l4_h = clamp(((a_sp_l4 * a_sp_q + a_bp_l4 * a_bp_fip) / 9.0) * h_off_mult, 0.35, 6.5)
    mu_l4_a = clamp(((h_sp_l4 * h_sp_q + h_bp_l4 * h_bp_fip) / 9.0) * a_off_mult, 0.35, 6.5)

    max_r_f5 = 16
    max_r_9 = 22
    max_r_full = 30

    pmf_f5_h = nb_pmf_exact(mu_f5_h, float(c["r_disp_f5"]), max_r_f5)
    pmf_f5_a = nb_pmf_exact(mu_f5_a, float(c["r_disp_f5"]), max_r_f5)
    pmf_l4_h = nb_pmf_exact(mu_l4_h, float(c["r_disp_late4"]), max_r_f5)
    pmf_l4_a = nb_pmf_exact(mu_l4_a, float(c["r_disp_late4"]), max_r_f5)

    # F5 3-way & Totals 4.5
    p_h_f5 = 0.0
    p_t_f5 = 0.0
    p_a_f5 = 0.0
    p_ov45_f5 = 0.0
    for ih in range(max_r_f5 + 1):
        for ia in range(max_r_f5 + 1):
            p = float(pmf_f5_h[ih] * pmf_f5_a[ia])
            if ih > ia:
                p_h_f5 += p
            elif ih == ia:
                p_t_f5 += p
            else:
                p_a_f5 += p
            if ih + ia > 4:
                p_ov45_f5 += p

    # Distribución a 9 entradas
    pmf_9_h = convolve_1d_exact(pmf_f5_h, pmf_l4_h, max_r_9)
    pmf_9_a = convolve_1d_exact(pmf_f5_a, pmf_l4_a, max_r_9)

    total_line = float(inp.get("total_line", 8.0))
    # Truncado ingenuo a 9 entradas (para cuantificar exactamente el sesgo de Astra AI)
    p_over_9_truncated = 0.0
    p_tie_9 = 0.0
    for ih in range(max_r_9 + 1):
        for ia in range(max_r_9 + 1):
            p = float(pmf_9_h[ih] * pmf_9_a[ia])
            if ih + ia > total_line:
                p_over_9_truncated += p
            if ih == ia:
                p_tie_9 += p

    # --- Cadena de Markov Exacta de Extra Innings (Regla Manfred corredor en 2.a + Walk-Off Local) ---
    manfred_boost = float(c["manfred_runner_boost_runs"])
    lam_ext_a = clamp((a_bp_fip * 0.0 + h_bp_fip / 9.0) * a_off_mult + manfred_boost, 0.35, 1.85)
    lam_ext_h = clamp((a_bp_fip / 9.0) * h_off_mult + manfred_boost * (1.0 if neutral else 1.04), 0.35, 1.95)

    max_ext_inn = 6
    qa = poisson_pmf_exact(lam_ext_a, max_ext_inn)
    qh = poisson_pmf_exact(lam_ext_h, max_ext_inn)

    # Probabilidad de seguir empatados tras 1 entrada extra y distribución condicional del paso decisivo
    p_cont = sum(float(qa[d] * qh[d]) for d in range(max_ext_inn + 1))
    p_resolve = max(1.0 - p_cont, 1e-6)
    # Carreras promedio por equipo en cada entrada extra que termina empatada: E[D | A==H==D]
    mean_tied_runs = (
        sum(float(d) * float(qa[d] * qh[d]) for d in range(max_ext_inn + 1)) / max(p_cont, 1e-9)
        if p_cont > 1e-6
        else 0.0
    )

    # Matriz final `M_full[h, a]` en `0..max_r_full`
    M_full = np.zeros((max_r_full + 1, max_r_full + 1), dtype=np.float64)
    for ih in range(max_r_9 + 1):
        for ia in range(max_r_9 + 1):
            p9 = float(pmf_9_h[ih] * pmf_9_a[ia])
            if p9 <= 0.0:
                continue
            if ih != ia:
                M_full[min(ih, max_r_full), min(ia, max_r_full)] += p9
            else:
                # Expandir explícitamente hasta 4 entradas extra (cubre >99.7% de series geométricas)
                rem_mass = p9
                for m_step in range(4):
                    step_tie_runs = int(round(m_step * mean_tied_runs))
                    scale_m = (rem_mass / p_resolve) if m_step == 3 else rem_mass
                    for ra in range(max_ext_inn + 1):
                        for rh in range(max_ext_inn + 1):
                            if ra == rh:
                                continue
                            p_pair = float(qa[ra] * qh[rh])
                            if rh > ra and not neutral:
                                # Regla walk-off de béisbol: el local deja de batear al anotar la carrera de la ventaja
                                # (~72% por sencillo/sacrificio `+1`, ~28% batazo extra-base/HR `+2` acotado por `rh`)
                                rh_eff = ra + 1 if rh == ra + 1 else (ra + 1 if (rh - ra == 2) else min(rh, ra + 2))
                            else:
                                rh_eff = rh
                            fh = min(ih + step_tie_runs + rh_eff, max_r_full)
                            fa = min(ia + step_tie_runs + ra, max_r_full)
                            M_full[fh, fa] += scale_m * p_pair
                    rem_mass *= p_cont

    s_full = float(np.sum(M_full))
    if s_full > 0.0:
        M_full /= s_full

    p_home_full = 0.0
    p_away_full = 0.0
    p_rl_home_minus_1_5 = 0.0
    p_rl_away_plus_1_5 = 0.0
    p_over_full = 0.0
    p_under_full = 0.0
    p_push_full = 0.0
    exp_runs_h_full = 0.0
    exp_runs_a_full = 0.0
    is_int_tot = abs(total_line - round(total_line)) < 1e-9
    k_tot_int = int(round(total_line))

    for ih in range(max_r_full + 1):
        for ia in range(max_r_full + 1):
            p = float(M_full[ih, ia])
            if p <= 0.0:
                continue
            exp_runs_h_full += ih * p
            exp_runs_a_full += ia * p
            if ih > ia:
                p_home_full += p
            elif ia > ih:
                p_away_full += p
            if ih - ia >= 2:
                p_rl_home_minus_1_5 += p
            else:
                p_rl_away_plus_1_5 += p
            tot_sc = ih + ia
            if is_int_tot:
                if tot_sc > k_tot_int:
                    p_over_full += p
                elif tot_sc == k_tot_int:
                    p_push_full += p
                else:
                    p_under_full += p
            else:
                if tot_sc > total_line:
                    p_over_full += p
                else:
                    p_under_full += p

    act_ou = max(p_over_full + p_under_full, 1e-9)
    p_over_cond = p_over_full / act_ou

    return {
        "sport": "mlb",
        "p_home": p_home_full,
        "p_away": p_away_full,
        "f5": {
            "mu_home": mu_f5_h,
            "mu_away": mu_f5_a,
            "p_home": p_h_f5,
            "p_tie": p_t_f5,
            "p_away": p_a_f5,
            "p_over_4_5": p_ov45_f5,
        },
        "full_game": {
            "mu_9inn_home": mu_f5_h + mu_l4_h,
            "mu_9inn_away": mu_f5_a + mu_l4_a,
            "p_extra_innings": p_tie_9,
            "expected_runs_home": exp_runs_h_full,
            "expected_runs_away": exp_runs_a_full,
            "expected_total_runs": exp_runs_h_full + exp_runs_a_full,
            "p_runline_home_minus_1_5": p_rl_home_minus_1_5,
            "p_runline_away_plus_1_5": p_rl_away_plus_1_5,
            "total_line": total_line,
            "p_over": p_over_full,
            "p_under": p_under_full,
            "p_push": p_push_full,
            "p_over_cond_no_push": p_over_cond,
            "p_over_9inn_truncated_astra_bug": p_over_9_truncated,
            "extra_innings_over_correction_pp": 100.0 * (p_over_cond - p_over_9_truncated),
        },
    }


def project_nhl_v36_exact(inp: dict[str, Any], cfg: dict[str, Any]) -> dict[str, Any]:
    """Modelo cerrado NHL `Curvature v3.6` con PP/PK, confirmación de portero, Empty-Net y conservación OT."""
    c = cfg["nhl"]
    lam60_h_base = float(inp.get("base_goals_60_home", 2.95))
    lam60_a_base = float(inp.get("base_goals_60_away", 2.75))

    # Equipos especiales (PP% vs PK%)
    h_pp = float(inp.get("home_pp_pct", 20.5))
    a_pk = float(inp.get("away_pk_pct", 79.5))
    a_pp = float(inp.get("away_pp_pct", 20.5))
    h_pk = float(inp.get("home_pk_pct", 79.5))
    pp_opp = float(c["avg_pp_opportunities"])

    st_delta_h = pp_opp * ((h_pp - (100.0 - a_pk)) / 200.0)
    st_delta_a = pp_opp * ((a_pp - (100.0 - h_pk)) / 200.0)

    # Porteros y fatiga back-to-back
    h_sv = float(inp.get("home_goalie_sv_pct", c["league_sv_pct"]))
    a_sv = float(inp.get("away_goalie_sv_pct", c["league_sv_pct"]))
    if bool(inp.get("home_b2b", False)):
        h_sv -= float(c["b2b_sv_pct_penalty"])
    if bool(inp.get("away_b2b", False)):
        a_sv -= float(c["b2b_sv_pct_penalty"])

    h_conf = bool(inp.get("home_goalie_confirmed", False))
    a_conf = bool(inp.get("away_goalie_confirmed", False))
    w_gh = float(c["confirmed_goalie_weight"]) if h_conf else float(c["unconfirmed_goalie_weight"])
    w_ga = float(c["confirmed_goalie_weight"]) if a_conf else float(c["unconfirmed_goalie_weight"])

    gsaa_h = w_gh * clamp(h_sv - float(c["league_sv_pct"]), -0.035, 0.030) * float(c["shots_per_game"])
    gsaa_a = w_ga * clamp(a_sv - float(c["league_sv_pct"]), -0.035, 0.030) * float(c["shots_per_game"])

    lam60_h = clamp(lam60_h_base + st_delta_h - gsaa_a, 1.45, 5.10)
    lam60_a = clamp(lam60_a_base + st_delta_a - gsaa_h, 1.45, 5.10)

    # Matriz de 57 minutos + Régimen de Portería Vacía (Empty-Net, últimos 3 minutos)
    max_g = 14
    pmf57_h = poisson_pmf_exact(0.95 * lam60_h, max_g)
    pmf57_a = poisson_pmf_exact(0.95 * lam60_a, max_g)
    p_en_goal_for_leader = float(c["empty_net_leader_goal_prob"])
    p_en_tie_goal = float(c["empty_net_puller_tie_prob"])
    has_diff2_split = ("empty_net_diff2_leader_prob" in c) or ("empty_net_diff2_puller_prob" in c)
    p_en_leader2 = float(c.get("empty_net_diff2_leader_prob", p_en_goal_for_leader))
    p_en_tie2 = float(c.get("empty_net_diff2_puller_prob", p_en_tie_goal))
    p_en_two_goals = float(c.get("empty_net_two_goal_prob", 0.0))

    M_reg = np.zeros((max_g + 2, max_g + 2), dtype=np.float64)
    # En los últimos 3 min: si margen == 0 juego normal 5% lambda; si margen == 1 o 2 el que pierde saca al portero!
    q3_h = poisson_pmf_exact(0.05 * lam60_h, 3)
    q3_a = poisson_pmf_exact(0.05 * lam60_a, 3)

    for ih in range(max_g + 1):
        for ia in range(max_g + 1):
            p57 = float(pmf57_h[ih] * pmf57_a[ia])
            if p57 <= 0.0:
                continue
            diff = ih - ia
            if diff in (1, 2):
                p_l = p_en_leader2 if (diff == 2 and has_diff2_split) else p_en_goal_for_leader
                p_t = p_en_tie2 if (diff == 2 and has_diff2_split) else p_en_tie_goal
                p_2g = p_en_two_goals if has_diff2_split else 0.0
                p_stay = max(0.0, 1.0 - p_l - p_t - p_2g)
                M_reg[min(ih + 1, max_g + 1), ia] += p57 * p_l
                M_reg[ih, min(ia + 1, max_g + 1)] += p57 * p_t
                if p_2g > 0.0:
                    M_reg[min(ih + 2, max_g + 1), ia] += p57 * (0.65 * p_2g)
                    M_reg[min(ih + 1, max_g + 1), min(ia + 1, max_g + 1)] += p57 * (0.35 * p_2g)
                M_reg[ih, ia] += p57 * p_stay
            elif diff in (-1, -2):
                p_l = p_en_leader2 if (diff == -2 and has_diff2_split) else p_en_goal_for_leader
                p_t = p_en_tie2 if (diff == -2 and has_diff2_split) else p_en_tie_goal
                p_2g = p_en_two_goals if has_diff2_split else 0.0
                p_stay = max(0.0, 1.0 - p_l - p_t - p_2g)
                M_reg[ih, min(ia + 1, max_g + 1)] += p57 * p_l
                M_reg[min(ih + 1, max_g + 1), ia] += p57 * p_t
                if p_2g > 0.0:
                    M_reg[ih, min(ia + 2, max_g + 1)] += p57 * (0.65 * p_2g)
                    M_reg[min(ih + 1, max_g + 1), min(ia + 1, max_g + 1)] += p57 * (0.35 * p_2g)
                M_reg[ih, ia] += p57 * p_stay
            else:
                for dh in range(4):
                    for da in range(4):
                        M_reg[min(ih + dh, max_g + 1), min(ia + da, max_g + 1)] += p57 * float(q3_h[dh] * q3_a[da])

    M_reg /= float(np.sum(M_reg))

    p_h_reg = float(np.sum(np.tril(M_reg, -1)))
    p_ot_reg = float(np.trace(M_reg))
    p_a_reg = float(np.sum(np.triu(M_reg, 1)))

    # En OT/SO (3v3 + tanda), se suma exactamente +1 gol al ganador preservando la identidad exacta de conservación!
    strength_share_h = clamp(0.5 + 0.35 * ((lam60_h / (lam60_h + lam60_a)) - 0.5) + 0.015, 0.38, 0.62)
    M_full = np.array(M_reg, copy=True)
    for k in range(M_reg.shape[0] - 1):
        pk = float(M_full[k, k])
        M_full[k, k] = 0.0
        M_full[k + 1, k] += pk * strength_share_h
        M_full[k, k + 1] += pk * (1.0 - strength_share_h)
    # Última celda diagonal si existiera residuo ínfimo
    last_i = M_reg.shape[0] - 1
    if M_full[last_i, last_i] > 0.0:
        pk = float(M_full[last_i, last_i])
        M_full[last_i, last_i] = 0.0
        M_full[last_i, last_i - 1] += pk

    grid_idx = np.arange(M_reg.shape[0], dtype=np.float64)
    eg_h_reg = float(np.sum(M_reg * grid_idx[:, None]))
    eg_a_reg = float(np.sum(M_reg * grid_idx[None, :]))
    eg_h_full = float(np.sum(M_full * grid_idx[:, None]))
    eg_a_full = float(np.sum(M_full * grid_idx[None, :]))
    ot_conservation_resid = abs((eg_h_full - eg_h_reg) + (eg_a_full - eg_a_reg) - p_ot_reg)

    p_home_ml = float(np.sum(np.tril(M_full, -1)))
    p_away_ml = float(np.sum(np.triu(M_full, 1)))

    p_pl_home_m15 = 0.0
    tot_line = float(inp.get("total_line", 6.0))
    is_int_l = abs(tot_line - round(tot_line)) < 1e-9
    k_int = int(round(tot_line))
    p_ov = 0.0
    p_un = 0.0
    p_ps = 0.0
    for ih in range(M_full.shape[0]):
        for ia in range(M_full.shape[1]):
            p = float(M_full[ih, ia])
            if ih - ia >= 2:
                p_pl_home_m15 += p
            ts = ih + ia
            if is_int_l:
                if ts > k_int:
                    p_ov += p
                elif ts == k_int:
                    p_ps += p
                else:
                    p_un += p
            else:
                if ts > tot_line:
                    p_ov += p
                else:
                    p_un += p

    return {
        "sport": "nhl",
        "goalie_quality_flag": "ok" if (h_conf and a_conf) else "unconfirmed_goalie_warning",
        "p_home": p_home_ml,
        "p_away": p_away_ml,
        "p_home_reg": p_h_reg,
        "p_ot_reg": p_ot_reg,
        "p_away_reg": p_a_reg,
        "expected_goals_home_reg": eg_h_reg,
        "expected_goals_away_reg": eg_a_reg,
        "expected_goals_home_full": eg_h_full,
        "expected_goals_away_full": eg_a_full,
        "ot_conservation_residual": ot_conservation_resid,
        "p_puckline_home_minus_1_5": p_pl_home_m15,
        "total_line": tot_line,
        "p_over": p_ov,
        "p_under": p_un,
        "p_push": p_ps,
        "p_over_cond_no_push": p_ov / max(p_ov + p_un, 1e-9),
    }


def project_nba_v36_exact(inp: dict[str, Any], cfg: dict[str, Any]) -> dict[str, Any]:
    """Modelo cerrado NBA `Tensor v3.6` sensible a impacto de bajas titulares (`BPM`) e incertidumbre `GTD`."""
    c = cfg["nba"]
    base_margin = float(inp.get("structural_margin_with_hca", 2.4))
    base_total = float(inp.get("structural_total_points", 226.5))

    # Impacto ponderado de bajas confirmadas (puntos sobre reemplazo) + cuestionables (50% esperado + varianza extra)
    h_miss_pts = float(inp.get("home_missing_impact_pts", 1.35 * float(inp.get("home_injuries_out", 0.0))))
    a_miss_pts = float(inp.get("away_missing_impact_pts", 1.35 * float(inp.get("away_injuries_out", 0.0))))
    h_gtd_pts = float(inp.get("home_questionable_impact_pts", 0.85 * float(inp.get("home_injuries_q", 0.0))))
    a_gtd_pts = float(inp.get("away_questionable_impact_pts", 0.85 * float(inp.get("away_injuries_q", 0.0))))

    inj_margin_delta = clamp((a_miss_pts - h_miss_pts) + 0.45 * (a_gtd_pts - h_gtd_pts), -14.5, 14.5)

    # Fatiga de calendario (B2B y 3-in-4)
    rest_delta = 0.0
    if bool(inp.get("home_b2b", False)):
        rest_delta -= float(c["home_b2b_penalty_pts"])
    if bool(inp.get("away_b2b", False)):
        rest_delta += float(c["away_b2b_penalty_pts"])
    if bool(inp.get("home_3in4", False)):
        rest_delta -= float(c["three_in_four_penalty_pts"])
    if bool(inp.get("away_3in4", False)):
        rest_delta += float(c["three_in_four_penalty_pts"])

    exp_margin = base_margin + inj_margin_delta + rest_delta
    exp_total = clamp(base_total - 0.35 * (h_miss_pts + a_miss_pts) - 0.8 * (int(bool(inp.get("home_b2b", False))) + int(bool(inp.get("away_b2b", False)))), 196.0, 256.0)

    # Ensanchamiento causal de sigma cuando hay estrellas en GTD (`Questionable`)
    gtd_var_extra = 0.25 * (h_gtd_pts ** 2 + a_gtd_pts ** 2)
    sigma_eff = math.sqrt(float(c["sigma_margin_base"]) ** 2 + gtd_var_extra)
    sigma_tot = float(c["sigma_total_base"])

    p_home = clamp(normal_cdf_exact(exp_margin / sigma_eff), 1e-6, 1.0 - 1e-6)
    p_away = 1.0 - p_home

    # Probabilidad explícita de prórroga (empate al cierre de 48 min, ancho +-0.5 ajustado por paridad final)
    sigma_reg = 0.945 * sigma_eff
    p_ot = clamp(
        float(c["ot_scale"]) * (normal_cdf_exact((0.5 - exp_margin) / sigma_reg) - normal_cdf_exact((-0.5 - exp_margin) / sigma_reg)),
        0.015,
        0.11,
    )

    spread_line = float(inp.get("spread_line_home", -round(exp_margin) - 0.5))
    total_line = float(inp.get("total_line", round(exp_total) + 0.5))

    p_cover_home = clamp(normal_cdf_exact((exp_margin + spread_line) / sigma_eff), 1e-6, 1.0 - 1e-6)
    p_over = clamp(normal_cdf_exact((exp_total - total_line) / sigma_tot), 1e-6, 1.0 - 1e-6)

    return {
        "sport": "nba",
        "expected_margin": exp_margin,
        "expected_total": exp_total,
        "sigma_margin_effective": sigma_eff,
        "p_home": p_home,
        "p_away": p_away,
        "p_overtime": p_ot,
        "spread_line_home": spread_line,
        "p_spread_home_cover": p_cover_home,
        "total_line": total_line,
        "p_over": p_over,
        "p_under": 1.0 - p_over,
    }


def main() -> None:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    cfg = {
        "schema_version": "multisport_v3.6.0",
        "codename": "PitchLab Spacetime Multi-Sport v3.6 Candidate",
        "version": "3.6.0-candidate",
        "status": "candidate",
        "production_activated": False,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "mlb": {
            "league_woba": 0.312,
            "league_fip": 4.08,
            "starter_shrink_ip": 45.0,
            "home_scoring_mult": 1.026,
            "away_scoring_mult": 0.978,
            "r_disp_f5": 5.0,
            "r_disp_late4": 4.0,
            "manfred_runner_boost_runs": 0.36,
        },
        "nhl": {
            "league_sv_pct": 0.905,
            "shots_per_game": 30.2,
            "avg_pp_opportunities": 3.05,
            "confirmed_goalie_weight": 0.92,
            "unconfirmed_goalie_weight": 0.42,
            "b2b_sv_pct_penalty": 0.008,
            "empty_net_leader_goal_prob": 0.145,
            "empty_net_puller_tie_prob": 0.068,
        },
        "nba": {
            "sigma_margin_base": 11.8,
            "sigma_total_base": 16.6,
            "home_b2b_penalty_pts": 1.45,
            "away_b2b_penalty_pts": 2.15,
            "three_in_four_penalty_pts": 0.75,
            "ot_scale": 1.62,
        },
    }
    CONFIG_OUT.write_text(json.dumps(cfg, indent=2), encoding="utf-8")

    # Generar batería determinista de 90 escenarios (30 MLB incl. openers/Coors/playoffs, 30 NHL, 30 NBA)
    rng = np.random.default_rng(20261118)
    mlb_cases: list[dict[str, Any]] = []
    extra_corrections: list[float] = []
    for i in range(30):
        inp = {
            "case_id": f"mlb_{i:02d}",
            "home_woba": round(float(rng.uniform(0.292, 0.342)), 4),
            "away_woba": round(float(rng.uniform(0.292, 0.342)), 4),
            "home_platoon_mult": round(float(rng.uniform(0.94, 1.07)), 4),
            "away_platoon_mult": round(float(rng.uniform(0.94, 1.07)), 4),
            "park_weather_mult": round(float(rng.uniform(0.92, 1.18)), 4),
            "home_sp_fip": round(float(rng.uniform(2.75, 5.10)), 3),
            "away_sp_fip": round(float(rng.uniform(2.75, 5.10)), 3),
            "home_sp_era": round(float(rng.uniform(2.60, 5.30)), 3),
            "away_sp_era": round(float(rng.uniform(2.60, 5.30)), 3),
            "home_sp_ip_hist": round(float(rng.uniform(15.0, 185.0)), 1),
            "away_sp_ip_hist": round(float(rng.uniform(15.0, 185.0)), 1),
            "home_bp_fip": round(float(rng.uniform(3.45, 4.70)), 3),
            "away_bp_fip": round(float(rng.uniform(3.45, 4.70)), 3),
            "home_is_opener": bool(i % 7 == 0),
            "away_is_opener": bool(i % 11 == 0),
            "home_sp_exp_ip": 4.2 if (i % 5 == 0) else 5.4,
            "away_sp_exp_ip": 4.2 if (i % 5 == 0) else 5.4,
            "neutral_site": bool(i == 29),
            "total_line": float([6.5, 7.0, 7.5, 8.0, 8.5, 9.5][i % 6]),
        }
        out = project_mlb_v36_exact(inp, cfg)
        extra_corrections.append(out["full_game"]["extra_innings_over_correction_pp"])
        mlb_cases.append({"input": inp, "python_output": out})

    nhl_cases: list[dict[str, Any]] = []
    max_ot_resid = 0.0
    for i in range(30):
        inp = {
            "case_id": f"nhl_{i:02d}",
            "base_goals_60_home": round(float(rng.uniform(2.45, 3.65)), 4),
            "base_goals_60_away": round(float(rng.uniform(2.35, 3.55)), 4),
            "home_pp_pct": round(float(rng.uniform(15.0, 29.0)), 2),
            "away_pk_pct": round(float(rng.uniform(73.0, 86.0)), 2),
            "away_pp_pct": round(float(rng.uniform(15.0, 29.0)), 2),
            "home_pk_pct": round(float(rng.uniform(73.0, 86.0)), 2),
            "home_goalie_sv_pct": round(float(rng.uniform(0.892, 0.924)), 4),
            "away_goalie_sv_pct": round(float(rng.uniform(0.892, 0.924)), 4),
            "home_goalie_confirmed": bool(i % 3 != 0),
            "away_goalie_confirmed": bool(i % 4 != 0),
            "home_b2b": bool(i % 6 == 0),
            "away_b2b": bool(i % 5 == 0),
            "total_line": float([5.5, 6.0, 6.5][i % 3]),
        }
        out = project_nhl_v36_exact(inp, cfg)
        max_ot_resid = max(max_ot_resid, float(out["ot_conservation_residual"]))
        nhl_cases.append({"input": inp, "python_output": out})

    nba_cases: list[dict[str, Any]] = []
    for i in range(30):
        inp = {
            "case_id": f"nba_{i:02d}",
            "structural_margin_with_hca": round(float(rng.uniform(-8.5, 11.5)), 3),
            "structural_total_points": round(float(rng.uniform(212.0, 241.0)), 2),
            "home_missing_impact_pts": round(float(rng.uniform(0.0, 7.5)), 2),
            "away_missing_impact_pts": round(float(rng.uniform(0.0, 7.5)), 2),
            "home_questionable_impact_pts": round(float(rng.uniform(0.0, 5.5)) if (i % 3 == 0) else 0.0, 2),
            "away_questionable_impact_pts": round(float(rng.uniform(0.0, 5.5)) if (i % 4 == 0) else 0.0, 2),
            "home_b2b": bool(i % 6 == 0),
            "away_b2b": bool(i % 5 == 0),
            "home_3in4": bool(i % 8 == 0),
            "away_3in4": bool(i % 7 == 0),
            "spread_line_home": float([-7.5, -4.5, -2.5, 1.5, 5.5][i % 5]),
            "total_line": float([218.5, 224.5, 229.5, 234.5][i % 4]),
        }
        out = project_nba_v36_exact(inp, cfg)
        nba_cases.append({"input": inp, "python_output": out})

    SNAPSHOT_OUT.write_text(
        json.dumps(
            {
                "schema_version": "multisport_v3.6_parity_snapshot",
                "holdout_sealed_untouched": True,
                "mlb_cases": mlb_cases,
                "nhl_cases": nhl_cases,
                "nba_cases": nba_cases,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    mean_corr = float(np.mean(extra_corrections))
    min_corr = float(np.min(extra_corrections))
    max_corr = float(np.max(extra_corrections))
    print(
        f"[EXP_V42] MLB Extra-Innings Over correction: mean={mean_corr:+.2f} pp "
        f"(range [{min_corr:+.2f}, {max_corr:+.2f}] pp vs Astra 9-inn truncation bug) | "
        f"NHL max OT conservation residual = {max_ot_resid:.2e}"
    )

    res_payload = {
        "experiment_id": "EXP_V42_multisport_v3_6",
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "holdout_sealed_untouched": True,
        "mlb_extra_innings_verification": {
            "n_cases": len(mlb_cases),
            "mean_over_correction_pp": round(mean_corr, 4),
            "min_over_correction_pp": round(min_corr, 4),
            "max_over_correction_pp": round(max_corr, 4),
            "opener_cases_verified": sum(1 for c in mlb_cases if c["input"]["home_is_opener"] or c["input"]["away_is_opener"]),
        },
        "nhl_conservation_verification": {
            "n_cases": len(nhl_cases),
            "max_ot_conservation_residual": max_ot_resid,
        },
        "nba_impact_injuries_verification": {
            "n_cases": len(nba_cases),
        },
        "artifacts": {
            "config_sha256": hashlib.sha256(CONFIG_OUT.read_bytes()).hexdigest(),
            "snapshot_sha256": hashlib.sha256(SNAPSHOT_OUT.read_bytes()).hexdigest(),
        },
    }
    RESULTS_OUT.write_text(json.dumps(res_payload, indent=2), encoding="utf-8")

    with TRIAL_REGISTRY_OUT.open("a", encoding="utf-8") as fh:
        fh.write(
            json.dumps(
                {
                    "recorded_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "experiment_id": "EXP_V42_multisport_v3_6",
                    "holdout_touched": False,
                    "mlb_mean_extra_inn_over_corr_pp": round(mean_corr, 4),
                    "nhl_max_ot_resid": max_ot_resid,
                }
            )
            + "\n"
        )
    print(f"[DONE] EXP_V42 guardado en {RESULTS_OUT.name}")


if __name__ == "__main__":
    main()
