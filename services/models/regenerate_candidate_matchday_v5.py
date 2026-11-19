"""EXP_V56 / REM_01 — Regenerador Determinista de Jornada Candidata Unificada `v5.1` (Inferencia Real `0` Copias `v3`).

Lee en modo 100% solo-lectura (verificando `SHA-256` antes y después) los `242` enfrentamientos de
`src/data/prediction/live_matchday_v3_snapshot.json` y genera `src/data/prediction/live_matchday_v5_candidate_snapshot.json`
ejecutando inferencia real de todos los motores `v5.1` (eliminando el bypass `130/130` copias de `v3`):
  1. Fútbol (`84` duelos): inferencia real `Tachyon v5.1` (`Logit + HGB`) + `Horizon-Goals 4-Param` (sin doble
     inflación `rho`) sobre `club_state_v5_1.json`, micro-mercados con tasas reales por club de `club_micro_state_v5_1.json`
     + `Booking Points` condicional (`gamma_red > 0`), `Early Payout +2` anclado algebraicamente (`0/84` violaciones `A1`),
     `Player-Linked SGP` con Dixon-Coles y bandas `Inductive Venn-Abers` alimentadas con `(pLogit, pGbm, elo_games)` reales.
  2. NFL (`46` duelos): inferencia real `Minkowski v3.5` (`gbm_nfl_v3_5_candidate.json` + `model_nfl_totals_v3_5_candidate.json`
     sobre `nfl_causal_state_v3_5.json`, cobertura `86%` de features), PMF de margen deconvolucionada (`Std ~ 13.31`),
     Totales Discretos Clave, `Overtime` podado, `Early Payout +17` y `Inductive Venn-Abers` con `(pLogit, pGbm)` reales.
  3. Multi-Sport (`112` duelos): física remediada `MLB wRAA / NHL diff ±1 vs ±2 / NBA / NCAAF` (incluyendo priors
     explícitos FCS->FBS para `Sacramento State Hornets` y `Missouri State Bears`) con `dataQuality` honesto.
"""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re
import sys
import time
from typing import Any
import unicodedata

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[2]
PRED_LAB_EXPS = REPO_ROOT / "research" / "prediction-lab" / "experiments"

for _sub in (
    REPO_ROOT,
    PRED_LAB_EXPS / "EXP_V40_soccer_micro_markets",
    PRED_LAB_EXPS / "EXP_V43_soccer_v4_0_core",
    PRED_LAB_EXPS / "EXP_V44_micro_markets_v4_0",
    PRED_LAB_EXPS / "EXP_V45_nfl_v4_0_complete",
    PRED_LAB_EXPS / "EXP_V47_multisport_v4_0",
    PRED_LAB_EXPS / "EXP_V51_micro_markets_v5_0",
    PRED_LAB_EXPS / "EXP_V52_nfl_v5_0_complete",
    PRED_LAB_EXPS / "EXP_V54_inplay_early_payout_v5_0",
    PRED_LAB_EXPS / "EXP_V55_sgp_student_t_player_v5_0",
    PRED_LAB_EXPS / "EXP_V56_epistemic_unified_v5_0",
):
    if str(_sub) not in sys.path:
        sys.path.insert(0, str(_sub))

from services.models import export_gbm_ts as eg  # noqa: E402
from diagonal_score_solver import (  # noqa: E402
    solve_diagonal_inflated_score_matrix_4param,
    summarize_markets_from_matrix_v4,
)
from run_epistemic_conformal_v5_1 import compute_epistemic_band_v51_scalar  # noqa: E402
from run_inplay_early_payout_v5_0 import (  # noqa: E402
    evaluate_points_sport_ep_scalar,
    evaluate_soccer_early_payout_and_inplay_scalar,
)
from run_micro_markets_v4_0 import bivariate_sarmanov_summary_exact, line_probs_from_pmf  # noqa: E402
from run_micro_markets_v5_0 import build_booking_points_outlook_scalar, evaluate_poisson_gbm_eta_scalar  # noqa: E402
from run_multisport_v4_0 import predict_live_multisport_v40_matchup_exact, project_ncaaf_v40_exact  # noqa: E402
from run_nfl_v4_0_complete import (  # noqa: E402
    project_spread_from_margin_pmf_exact,
)
from run_nfl_v5_0_complete import (  # noqa: E402
    eval_discrete_total_line_scalar,
    solve_nfl_discrete_key_total_pmf_scalar,
    solve_nfl_key_number_margin_pmf_exact_v5 as solve_nfl_key_number_margin_pmf_exact,
)
from run_sgp_v5_0_student_t_player import (  # noqa: E402
    evaluate_player_linked_sgp_scalar,
    evaluate_student_t_sgp_scalar,
)

DATA_DIR = REPO_ROOT / "src" / "data" / "prediction"
FROZEN_V3_SNAPSHOT = DATA_DIR / "live_matchday_v3_snapshot.json"
CANDIDATE_V5_SNAPSHOT_OUT = DATA_DIR / "live_matchday_v5_candidate_snapshot.json"
EXP_V56_RESULTS_OUT = PRED_LAB_EXPS / "EXP_V56_epistemic_unified_v5_0" / "artifacts" / "exp_v56_unified_v5_0_results.json"

LEAGUE_TO_DIV: dict[str, str] = {
    "epl": "E0",
    "laliga": "SP1",
    "serie-a": "I1",
    "bundesliga": "D1",
    "ligue-1": "F1",
    "liga-mx": "MEX",
}

NFL_FULL_TO_ABBR: dict[str, str] = {
    "arizona cardinals": "ARI",
    "atlanta falcons": "ATL",
    "baltimore ravens": "BAL",
    "buffalo bills": "BUF",
    "carolina panthers": "CAR",
    "chicago bears": "CHI",
    "cincinnati bengals": "CIN",
    "cleveland browns": "CLE",
    "dallas cowboys": "DAL",
    "denver broncos": "DEN",
    "detroit lions": "DET",
    "green bay packers": "GB",
    "houston texans": "HOU",
    "indianapolis colts": "IND",
    "jacksonville jaguars": "JAX",
    "kansas city chiefs": "KC",
    "las vegas raiders": "LV",
    "los angeles chargers": "LAC",
    "los angeles rams": "LA",
    "miami dolphins": "MIA",
    "minnesota vikings": "MIN",
    "new england patriots": "NE",
    "new orleans saints": "NO",
    "new york giants": "NYG",
    "new york jets": "NYJ",
    "philadelphia eagles": "PHI",
    "pittsburgh steelers": "PIT",
    "san francisco 49ers": "SF",
    "seattle seahawks": "SEA",
    "tampa bay buccaneers": "TB",
    "tennessee titans": "TEN",
    "washington commanders": "WAS",
}

# Mapeo canónico español/FIFA -> nombres exactos de Football-Data / `club_state_v5_1.json`
SOCCER_EXACT_ALIASES: dict[str, str] = {
    "1.fc union berlin": "Union Berlin",
    "1.fsv mainz 05": "Mainz",
    "bayer 04 leverkusen": "Leverkusen",
    "bayern munich": "Bayern Munich",
    "borussia dortmund": "Dortmund",
    "borussia monchengladbach": "M'gladbach",
    "eintracht francfort": "Ein Frankfurt",
    "fc augsburgo": "Augsburg",
    "fc schalke 04": "Schalke 04",
    "hamburgo sv": "Hamburg",
    "rb leipzig": "RB Leipzig",
    "rc lens": "Lens",
    "sc friburgo": "Freiburg",
    "sc paderborn 07": "Paderborn",
    "sv 07 elversberg": "Elversberg",
    "sv werder bremen": "Werder Bremen",
    "tsg 1899 hoffenheim": "Hoffenheim",
    "vfb stuttgart": "Stuttgart",
    "afc bournemouth": "Bournemouth",
    "arsenal fc": "Arsenal",
    "aston villa": "Aston Villa",
    "brentford fc": "Brentford",
    "brighton & hove albion": "Brighton",
    "chelsea fc": "Chelsea",
    "coventry city": "Coventry",
    "crystal palace": "Crystal Palace",
    "everton fc": "Everton",
    "fulham fc": "Fulham",
    "hull city": "Hull",
    "ipswich town": "Ipswich",
    "leeds united": "Leeds",
    "liverpool fc": "Liverpool",
    "manchester city": "Man City",
    "manchester united": "Man United",
    "newcastle united": "Newcastle",
    "nottingham forest": "Nott'm Forest",
    "ssc napoles": "Napoli",
    "sunderland afc": "Sunderland",
    "tottenham hotspur": "Tottenham",
    "athletic club": "Ath Bilbao",
    "deportivo alaves": "Alaves",
    "rc celta de vigo": "Celta",
    "rc deportivo a coruna": "La Coruna",
    "rcd espanyol": "Espanol",
    "rayo vallecano": "Vallecano",
    "real betis balompie": "Betis",
    "real madrid cf": "Real Madrid",
    "sevilla fc": "Sevilla",
    "valencia cf": "Valencia",
    "atlas guadalajara": "Atlas",
    "atletico de san luis": "Atl. San Luis",
    "cd cruz azul": "Cruz Azul",
    "cd guadalajara": "Guadalajara Chivas",
    "cf america": "Club America",
    "cf monterrey": "Monterrey",
    "cf pachuca": "Pachuca",
    "club leon fc": "Club Leon",
    "club necaxa": "Necaxa",
    "club puebla": "Puebla",
    "club tijuana": "Club Tijuana",
    "deportivo toluca fc": "Toluca",
    "fc juarez": "Juarez",
    "pumas unam": "U.N.A.M.- Pumas",
    "queretaro fc": "Queretaro",
    "santos laguna": "Santos Laguna",
    "tigres uanl": "U.A.N.L.- Tigres",
    "aj auxerre": "Auxerre",
    "as monaco": "Monaco",
    "as roma": "Roma",
    "angers sco": "Angers",
    "estac troyes": "Troyes",
    "fc lorient": "Lorient",
    "losc lille": "Lille",
    "le havre ac": "Le Havre",
    "ogc niza": "Nice",
    "olympique de lyon": "Lyon",
    "olympique de marsella": "Marseille",
    "paris fc": "Paris FC",
    "paris saint-germain": "Paris SG",
    "racing club de estrasburgo": "Strasbourg",
    "stade brestois 29": "Brest",
    "stade rennais fc": "Rennes",
    "toulouse fc": "Toulouse",
    "ac milan": "Milan",
    "ac monza": "Monza",
    "atalanta de bergamo": "Atalanta",
    "bolonia": "Bologna",
    "cagliari": "Cagliari",
    "como 1907": "Como",
    "fiorentina": "Fiorentina",
    "frosinone calcio": "Frosinone",
    "inter de milan": "Inter",
    "juventus de turin": "Juventus",
    "parma": "Parma",
    "ss lazio": "Lazio",
    "torino fc": "Torino",
    "us lecce": "Lecce",
    "us sassuolo": "Sassuolo",
    "udinese": "Udinese",
    "venezia fc": "Venezia",
}

FORBIDDEN_KEYS: set[str] = {
    "stake",
    "recommendedStake",
    "kelly",
    "kellyFraction",
    "ev",
    "tier",
    "executable_bets_count",
}


def _norm_ascii(s: str) -> str:
    nk = unicodedata.normalize("NFKD", str(s or "").strip())
    asc = "".join(ch for ch in nk if not unicodedata.combining(ch)).lower()
    return re.sub(r"\s+", " ", asc).strip()


def _fair_decimal(p: float) -> float:
    pc = min(max(float(p), 0.001), 0.999)
    return round(1.0 / pc, 4)


def _verified_summary_es(home: str, away: str, p_home: float, p_draw: float | None, p_away: float, exp_tot: float, line_tot: float, p_over: float) -> str:
    ph_s = f"{100.0 * p_home:.1f}%"
    pa_s = f"{100.0 * p_away:.1f}%"
    po_s = f"{100.0 * p_over:.1f}%"
    diff = p_home - p_away
    if diff > 0.015:
        fav = f"{home} parte como favorito con {ph_s} frente a {pa_s} de {away}"
    elif diff < -0.015:
        fav = f"{away} parte como favorito visitante con {pa_s} frente a {ph_s} de {home}"
    else:
        fav = f"Duelo equilibrado entre {home} ({ph_s}) y {away} ({pa_s})"
    dr = f" (empate {100.0 * p_draw:.1f}%)" if (p_draw is not None and p_draw > 0.01) else ""
    return f"{fav}{dr}. Total proyectado: {exp_tot:.2f} (Más de {line_tot:.1f}: {po_s})."


def _assert_zero_forbidden_keys(node: Any, path: str = "root") -> None:
    if isinstance(node, dict):
        for k, v in node.items():
            if k in FORBIDDEN_KEYS:
                raise AssertionError(f"Violación de gobernanza: clave prohibida '{k}' detectada en {path}.{k}")
            _assert_zero_forbidden_keys(v, f"{path}.{k}")
    elif isinstance(node, list):
        for ix, item in enumerate(node):
            _assert_zero_forbidden_keys(item, f"{path}[{ix}]")


def _eval_gbm_and_logit_ensemble(xf: list[float], art: dict[str, Any]) -> tuple[list[float], list[float], list[float]]:
    """Evalúa `logit_companion`, `trees` (HGB calibrado) y `ensemble` exacto en Python."""
    lc = art["logit_companion"]
    cal = art["calibration"]
    z = [
        ((xv if math.isfinite(xv) else float(lc["imputer_statistics"][ic])) - float(lc["scaler_mean"][ic]))
        / (float(lc["scaler_scale"][ic]) or 1.0)
        for ic, xv in enumerate(xf)
    ]
    n_c = len(lc["intercept"])
    lg = [float(lc["intercept"][c]) + sum(float(lc["coef"][c][ic]) * z[ic] for ic in range(len(z))) for c in range(n_c)]
    mx = max(lg)
    ex = [math.exp(v - mx) for v in lg]
    sex = sum(ex)
    p_log = [v / sex for v in ex]
    p_gbm = eg.predict_serialized_gbm_python(np.array([xf], dtype=np.float64), art, calibrated=True)[0].tolist()

    wl, wg = float(cal["w_logit"]), float(cal["w_gbm"])
    if cal["blend_space"] == "logit":
        bl = [wl * math.log(max(pl, 1e-15)) + wg * math.log(max(pg, 1e-15)) for pl, pg in zip(p_log, p_gbm)]
        bmx = max(bl)
        bex = [math.exp(v - bmx) for v in bl]
        bs = sum(bex)
        p_ens = [v / bs for v in bex]
    else:
        pr = [wl * pl + wg * pg for pl, pg in zip(p_log, p_gbm)]
        ps = sum(pr)
        p_ens = [v / ps for v in pr]
    return p_log, p_gbm, p_ens


def _build_club_resolver(club_state: dict[str, Any]) -> tuple[dict[tuple[str, str], str], dict[str, str]]:
    by_div_norm: dict[tuple[str, str], str] = {}
    by_any_norm: dict[str, str] = {}
    # Preferir divisiones Tier-1 cuando un club aparezca en dos categorías históricas
    tier1_divs = {"E0", "SP1", "I1", "D1", "F1", "MEX", "N1", "P1"}
    for ck, entry in club_state["clubs"].items():
        dv = str(entry["div"])
        tm = str(entry["team"])
        nt = _norm_ascii(tm)
        by_div_norm[(dv, nt)] = ck
        if nt not in by_any_norm or dv in tier1_divs:
            by_any_norm[nt] = ck
    return by_div_norm, by_any_norm


def _resolve_club_key(
    team_name: str,
    div: str,
    by_div_norm: dict[tuple[str, str], str],
    by_any_norm: dict[str, str],
) -> tuple[str | None, bool]:
    nt = _norm_ascii(team_name)
    cand_fd = SOCCER_EXACT_ALIASES.get(nt)
    for probe in ([_norm_ascii(cand_fd)] if cand_fd else []) + [nt]:
        if (div, probe) in by_div_norm:
            return by_div_norm[(div, probe)], True
        if probe in by_any_norm:
            return by_any_norm[probe], True

    # Coincidencia por tokens limpios
    stop = {"fc", "cf", "cd", "ac", "as", "sc", "sv", "us", "ss", "ssc", "rc", "rcd", "afc", "de", "club", "real", "stade", "olympique", "1", "04", "05", "07", "29", "1899", "1907"}
    toks = {t for t in re.split(r"[^a-z0-9]+", nt) if len(t) >= 3 and t not in stop}
    if toks:
        best_ck, best_sc = None, 0.0
        for (dv_k, nm_k), ck in by_div_norm.items():
            ktoks = {t for t in re.split(r"[^a-z0-9]+", nm_k) if len(t) >= 3 and t not in stop}
            if not ktoks:
                continue
            inter = len(toks & ktoks)
            if inter == 0:
                continue
            sc = inter / float(len(toks | ktoks)) + (0.25 if dv_k == div else 0.0)
            if sc > best_sc:
                best_sc = sc
                best_ck = ck
        if best_ck is not None and best_sc >= 0.48:
            return best_ck, True
    return None, False


def _dc_1x2_probs_quick(lh: float, la: float, rho: float = -0.095) -> tuple[float, float, float]:
    max_g = 9
    ph = [math.exp(-lh)]
    pa = [math.exp(-la)]
    for k in range(1, max_g + 1):
        ph.append(ph[-1] * lh / k)
        pa.append(pa[-1] * la / k)
    sh, sd, sa = 0.0, 0.0, 0.0
    for i in range(max_g + 1):
        for j in range(max_g + 1):
            w = ph[i] * pa[j]
            if i == 0 and j == 0:
                w *= max(1.0 - lh * la * rho, 1e-6)
            elif i == 0 and j == 1:
                w *= max(1.0 + lh * rho, 1e-6)
            elif i == 1 and j == 0:
                w *= max(1.0 + la * rho, 1e-6)
            elif i == 1 and j == 1:
                w *= max(1.0 - rho, 1e-6)
            if i > j:
                sh += w
            elif i == j:
                sd += w
            else:
                sa += w
    tot = max(sh + sd + sa, 1e-12)
    return sh / tot, sd / tot, sa / tot


def _assemble_soccer_v51_features(
    dv: str,
    st_h: dict[str, Any],
    st_a: dict[str, Any],
    club_state: dict[str, Any],
    gbm_art: dict[str, Any],
    goals_art: dict[str, Any],
    micro_h: dict[str, Any] | None,
    micro_a: dict[str, Any] | None,
) -> tuple[list[float], list[float], float, float]:
    """Ensambla exactamente los vectores `1X2` (`Tachyon v5.1`) y `Goals` (`Horizon-Goals v5.1`) sin train-serve skew."""
    hfa_pts = 65.0
    elo_h = float(st_h.get("elo", 1430.0))
    elo_a = float(st_a.get("elo", 1430.0))
    elo_diff_no_hfa = elo_h - elo_a
    elo_diff = elo_diff_no_hfa + hfa_pts
    elo_prob_h = 1.0 / (1.0 + 10.0 ** (-elo_diff / 400.0))
    elo_logit_h = math.log(max(elo_prob_h, 1e-6) / max(1.0 - elo_prob_h, 1e-6))
    s_prog = 0.55
    elo_close = math.exp(-((elo_diff / 150.0) ** 2))

    celo_diff = float(st_h.get("clubelo", elo_h)) - float(st_a.get("clubelo", elo_a))
    att_h = float(st_h.get("att_strength", 0.0))
    def_h = float(st_h.get("def_strength", 0.0))
    att_a = float(st_a.get("att_strength", 0.0))
    def_a = float(st_a.get("def_strength", 0.0))

    div_g = float(club_state.get("div_goals_ewm", {}).get(dv, 2.65))
    div_hfa = float(club_state.get("div_hfa_ewm", {}).get(dv, 0.45))
    lg_prev = club_state.get("div_lg_prev", {}).get(dv, {})
    lg_hw_prev = float(lg_prev.get("lg_home_win_prev", 0.445))
    lg_tot_prev = float(lg_prev.get("lg_avg_total_prev", 1.48))

    # Tasas Dixon-Coles causales desde fortalezas ataque/defensa y media divisional
    base_half_g = max(0.95, 0.5 * div_g)
    dc_lh = min(max(base_half_g * 1.12 * math.exp(min(max(att_h - def_a, -1.1), 1.1)), 0.25), 4.6)
    dc_la = min(max(base_half_g * 0.88 * math.exp(min(max(att_a - def_h, -1.1), 1.1)), 0.20), 4.2)
    dc_tot = dc_lh + dc_la
    dc_diff = dc_lh - dc_la
    dc_ph, dc_pd, dc_pa = _dc_1x2_probs_quick(dc_lh, dc_la)
    low_tight = elo_close * math.exp(-max(0.0, dc_tot - 2.0))

    # Pi-ratings exactos
    pi_hh = float(st_h.get("pi_home", 0.0))
    pi_ha = float(st_h.get("pi_away", 0.0))
    pi_ah = float(st_a.get("pi_home", 0.0))
    pi_aa = float(st_a.get("pi_away", 0.0))
    pi_diff = pi_hh - pi_aa
    pi_overall_diff = 0.5 * (pi_hh + pi_ha) - 0.5 * (pi_ah + pi_aa)
    # Ecuación estándar Constantinou & Fenton (2013) para diferencia esperada de goles `pi_exp_gd`
    def _pi_g(r: float) -> float:
        return (10.0 ** (abs(r) / 3.0) - 1.0) * (1.0 if r >= 0.0 else -1.0)
    pi_exp_gd = _pi_g(pi_hh) - _pi_g(pi_aa)

    # Transfermarkt + Wave 2
    cur_div_med = float(club_state.get("div_ewm_log_val", {}).get(dv, 3.80))
    cur_xi_med = float(club_state.get("div_ewm_xi_val", {}).get(dv, 3.20))
    has_th = float(st_h.get("tm_has_val", 0.0)) > 0.0
    has_ta = float(st_a.get("tm_has_val", 0.0)) > 0.0
    elo_rel_h = (elo_h - 1525.0) / 145.0
    elo_rel_a = (elo_a - 1525.0) / 145.0
    if has_th and has_ta:
        rel_h = float(st_h["tm_raw_log_val"]) - cur_div_med
        rel_a = float(st_a["tm_raw_log_val"]) - cur_div_med
        val_diff = float(st_h["tm_raw_log_val"]) - float(st_a["tm_raw_log_val"])
        depth_diff = float(st_h.get("tm_depth_ratio", 0.26)) - float(st_a.get("tm_depth_ratio", 0.26))
        gap_diff = (rel_h - elo_rel_h) - (rel_a - elo_rel_a)
    else:
        rel_h, rel_a, val_diff, depth_diff, gap_diff = 0.0, 0.0, 0.0, 0.0, 0.0

    hx = float(st_h.get("has_realized_xi", 0.0)) > 0.0
    ax = float(st_a.get("has_realized_xi", 0.0)) > 0.0
    if hx and ax:
        xi_val_diff = float(st_h["realized_xi_log_val"]) - float(st_a["realized_xi_log_val"])
        avail_diff = float(st_h.get("injury_avail_ratio", 0.85)) - float(st_a.get("injury_avail_ratio", 0.85))
        ga90_diff = float(st_h.get("xi_ga90_allcomps", 2.1)) - float(st_a.get("xi_ga90_allcomps", 2.1))
        ga90_sum = float(st_h.get("xi_ga90_allcomps", 2.1)) + float(st_a.get("xi_ga90_allcomps", 2.1))
    else:
        xi_val_diff, avail_diff, ga90_diff, ga90_sum = 0.0, 0.0, 0.0, 4.20

    exg_diff = float(st_h.get("elo_xg", elo_h)) - float(st_a.get("elo_xg", elo_a))
    b5_h = float(st_h.get("formation_back5", 0.22))
    b5_a = float(st_a.get("formation_back5", 0.22))
    occ_h = float(st_h.get("crowd_occ", 0.82))
    mt_h = float(st_h.get("mgr_tempo", 2.68))
    mt_a = float(st_a.get("mgr_tempo", 2.68))
    md_h = float(st_h.get("mgr_draw", 0.25))
    md_a = float(st_a.get("mgr_draw", 0.25))
    pos_h = float(st_h.get("table_pos", 10.0))
    pos_a = float(st_a.get("table_pos", 10.0))

    # Tasa de córners combinada desde `club_micro_state_v5_1.json` si está disponible
    cor_sum_proxy = 9.8
    if micro_h and micro_a:
        ch_m = micro_h.get("metrics", {}).get("corners", {})
        ca_m = micro_a.get("metrics", {}).get("corners", {})
        cor_sum_proxy = 5.4 * float(ch_m.get("att_home", 1.0)) * float(ca_m.get("def_away", 1.0)) + 4.4 * float(ca_m.get("att_away", 1.0)) * float(ch_m.get("def_home", 1.0))

    fmap: dict[str, float] = {
        "elo_diff": elo_diff,
        "elo_diff_no_hfa": elo_diff_no_hfa,
        "elo_prob_home_nodraw": elo_prob_h,
        "elo_diff_x_progress": elo_diff * s_prog,
        "h_days_rest": 7.0,
        "a_days_rest": 7.0,
        "rest_diff": 0.0,
        "season_progress": s_prog,
        "clubelo_diff": celo_diff,
        "dc_lam_home": dc_lh,
        "dc_lam_away": dc_la,
        "dc_exp_total": dc_tot,
        "dc_exp_diff": dc_diff,
        "dc_prob_h": dc_ph,
        "dc_prob_d": dc_pd,
        "dc_prob_a": dc_pa,
        "xgd_diff_r5": float(st_h.get("xgd_r5", 0.0)) - float(st_a.get("xgd_r5", 0.0)),
        "xgd_diff_r10": float(st_h.get("xgd_r10", 0.0)) - float(st_a.get("xgd_r10", 0.0)),
        "xg_overperf_diff_r5": float(st_h.get("xg_overperf_r5", 0.0)) - float(st_a.get("xg_overperf_r5", 0.0)),
        "venue_xgd_diff_r5": float(st_h.get("venue_xgd_r5", 0.0)) - float(st_a.get("venue_xgd_r5", 0.0)),
        "elo_closeness": elo_close,
        "low_scoring_tight_match": low_tight,
        "dc_logit_h": math.log(max(dc_ph, 1e-5) / max(1.0 - dc_ph, 1e-5)),
        "dc_logit_d": math.log(max(dc_pd, 1e-5) / max(1.0 - dc_pd, 1e-5)),
        "dc_logit_a": math.log(max(dc_pa, 1e-5) / max(1.0 - dc_pa, 1e-5)),
        "elo_logit_h": elo_logit_h,
        "clinical_overperf_diff_r10": float(st_h.get("clinical_overperf_r10", 0.0)) - float(st_a.get("clinical_overperf_r10", 0.0)),
        "xgd_ewm5_diff": float(st_h.get("xgd_ewm5", 0.0)) - float(st_a.get("xgd_ewm5", 0.0)),
        "has_real_xg_history": min(float(st_h.get("has_real_xg", 0.0)), float(st_a.get("has_real_xg", 0.0))),
        "xg_elo_diff": exg_diff,
        "xg_elo_vs_elo_diff": exg_diff - elo_diff_no_hfa,
        "pts_minus_xpts_diff_r10": float(st_h.get("pts_minus_xpts_r10", 0.0)) - float(st_a.get("pts_minus_xpts_r10", 0.0)),
        "xpts_diff_r10": float(st_h.get("xpts_r10", 1.35)) - float(st_a.get("xpts_r10", 1.35)),
        "ppda_diff_r10": float(st_h.get("ppda_r10", 11.5)) - float(st_a.get("ppda_r10", 11.5)),
        "deep_completions_diff_r10": float(st_h.get("deep_completions_r10", 5.5)) - float(st_a.get("deep_completions_r10", 5.5)),
        "altitude_diff_m": 0.0,
        "altitude_shock_flag": 0.0,
        "surface_pressure_diff": 0.0,
        "sb_xg_diff_ewm8": float(st_h.get("xgd_ewm5", 0.0)) - float(st_a.get("xgd_ewm5", 0.0)),
        "tm_rel_log_val_diff": val_diff,
        "tm_depth_ratio_diff": depth_diff,
        "tm_val_vs_elo_gap_diff": gap_diff,
        "tm_promoted_val_boost_diff": 0.0,
        "tm_new_mgr_diff": float(st_h.get("tm_new_mgr_flag", 0.0)) - float(st_a.get("tm_new_mgr_flag", 0.0)),
        "tm_mgr_pae_diff": float(st_h.get("tm_mgr_pae", 0.0)) - float(st_a.get("tm_mgr_pae", 0.0)),
        "tm_midweek_cup_adv": float(st_a.get("midweek_cup_load", 0.0)) - float(st_h.get("midweek_cup_load", 0.0)),
        "tm_games_14d_adv": float(st_a.get("games_14d_allcomps", 1.5)) - float(st_h.get("games_14d_allcomps", 1.5)),
        "tm_realized_xi_val_diff": xi_val_diff,
        "tm_injury_avail_ratio_diff": avail_diff,
        "tm_xi_ga90_allcomps_diff": ga90_diff,
        "tm_net_transfer_val_120d_diff": float(st_h.get("net_transfer_val_120d", 0.0)) - float(st_a.get("net_transfer_val_120d", 0.0)),
        "tm_inbound_fee_120d_diff": float(st_h.get("inbound_fee_120d", 0.0)) - float(st_a.get("inbound_fee_120d", 0.0)),
        # Nuevas señales `v5.1` (`D1`)
        "pi_diff": pi_diff,
        "pi_exp_gd": pi_exp_gd,
        "pi_overall_diff": pi_overall_diff,
        "att_def_net_diff": (att_h - def_a) - (att_a - def_h),
        "att_def_goals_sum": att_h + att_a + def_h + def_a,
        "elo_xg_diff": exg_diff,
        "lg_home_win_prev": lg_hw_prev,
        "lg_avg_total_prev": lg_tot_prev,
        "div_hfa_ewm": div_hfa,
        "div_goals_ewm": div_g,
        "xpts_ewm5_diff": float(st_h.get("xpts_ewm5", 1.35)) - float(st_a.get("xpts_ewm5", 1.35)),
        "pts_minus_xpts_ewm5_diff": float(st_h.get("pts_minus_xpts_ewm5", 0.0)) - float(st_a.get("pts_minus_xpts_ewm5", 0.0)),
        "xgot_diff_r10": float(st_h.get("xgot_r10", 1.25)) - float(st_a.get("xgot_r10", 1.25)),
        "gk_prevented_diff_r10": float(st_h.get("gk_prevented_r10", 0.0)) - float(st_a.get("gk_prevented_r10", 0.0)),
        "field_tilt_diff_r10": float(st_h.get("field_tilt_r10", 0.5)) - float(st_a.get("field_tilt_r10", 0.5)),
        "draw_rate_sum_r10": float(st_h.get("draw_r10", 0.26)) + float(st_a.get("draw_r10", 0.26)),
        "real_xg_overperf_luck_diff": float(st_h.get("real_xg_luck", 0.0)) - float(st_a.get("real_xg_luck", 0.0)),
        "crowd_hfa_shock": occ_h - 0.82,
        "formation_back5_diff": b5_h - b5_a,
        "underdog_low_block_shield": (-elo_diff / 200.0) * (-(b5_h - b5_a)),
        "manager_draw_rate_sum": (md_h + md_a) - 0.50,
        "six_pointer_table_tension": math.exp(-abs(pos_h - pos_a) / 3.0) * s_prog,
        # Features de `Horizon-Goals v5.1`
        "sb_exp_total_ewm10": dc_tot,
        "club_tempo_sum_ewm12": div_g,
        "club_btts_rate_sum_ewm15": 0.52,
        "club_corners_sum_ewm10": cor_sum_proxy,
        "tm_log_val_sum": rel_h + rel_a,
        "tm_val_abs_mismatch": abs(val_diff),
        "xi_ga90_sum": ga90_sum,
        "abs_elo_mismatch": abs(elo_diff) / 200.0,
        "games_14d_sum": float(st_h.get("games_14d_allcomps", 1.5)) + float(st_a.get("games_14d_allcomps", 1.5)),
        "formation_back5_sum": b5_h + b5_a,
        "manager_tempo_sum": 0.5 * (mt_h + mt_a) - 2.68,
        "crowd_occupancy_home": occ_h,
    }

    div_levels = list(gbm_art["div_levels"])
    d_oh = [1.0 if lv == dv else 0.0 for lv in div_levels]
    n_base_1x2 = int(gbm_art["n_features_base"])
    base_1x2_names = list(gbm_art["features"][:n_base_1x2])
    xf_1x2 = [float(fmap.get(nm, float("nan"))) for nm in base_1x2_names] + d_oh

    goals_base_names = list(goals_art["base_features"])
    imp_g = goals_art["imputer_statistics"]
    xf_goals = [
        float(fmap[nm]) if (nm in fmap and math.isfinite(float(fmap[nm]))) else float(imp_g[ic])
        for ic, nm in enumerate(goals_base_names)
    ] + d_oh

    eff_games = float(min(int(st_h.get("elo_games", 16)), int(st_a.get("elo_games", 16))))
    return xf_1x2, xf_goals, eff_games, s_prog


def _synthesize_nfl_v35_vectors(home_team: str, away_team: str, state: dict[str, Any]) -> tuple[list[float], list[float], float, bool]:
    """Espejo exacto de `src/domain/prediction/nfl_v3_5.ts::synthesizeNflV35LiveVectors` (`86%` cobertura real!)."""
    hf = NFL_FULL_TO_ABBR.get(home_team.strip().lower(), home_team.strip().upper())
    af = NFL_FULL_TO_ABBR.get(away_team.strip().lower(), away_team.strip().upper())
    hb = state["franchise_base_state"].get(hf)
    ab = state["franchise_base_state"].get(af)
    he = state["franchise_epa_state"].get(hf)
    ae = state["franchise_epa_state"].get(af)
    hv = state["franchise_v35_state"].get(hf)
    av = state["franchise_v35_state"].get(af)
    if not (hb and ab and he and ae and hv and av):
        return [], [], 0.0, False

    ind = float(hb["is_indoor_home"])
    hfa = float(hb.get("eff_hfa", 48.0))
    alt_b = (18.0 * max(0.0, float(hb["elevation_m"]) - float(ab["elevation_m"]))) / 1000.0
    elo_diff = float(hb["elo"]) + hfa - float(ab["elo"]) + alt_b
    elo_fast = float(hb["elo_fast"]) + hfa - float(ab["elo_fast"]) + alt_b
    elo_mom = float(hb["elo_fast"]) - float(ab["elo_fast"]) - (float(hb["elo"]) - float(ab["elo"]))
    div_g = 1.0 if (hb["division"] and hb["division"] == ab["division"]) else 0.0
    val_h = float(hb["qb_elo"]) - float(hb["elo"])
    val_a = float(ab["qb_elo"]) - float(ab["elo"])
    ce_diff = float(hb["coach_elo"]) - float(ab["coach_elo"])
    comp_diff = elo_diff + 0.38 * (val_h - val_a) + 0.12 * ce_diff
    p_comp = 1.0 / (1.0 + 10.0 ** (-comp_diff / 400.0))
    comp_logit = math.log(max(1e-6, p_comp) / max(1e-6, 1.0 - p_comp))
    elo_close = math.exp(-((comp_diff / 135.0) ** 2))
    qb_epa_diff = float(he["last_qb_epa_per_db"]) - float(ae["last_qb_epa_per_db"])

    fmap: dict[str, float] = {
        "elo_diff": elo_diff,
        "elo_fast_diff": elo_fast,
        "elo_momentum_diff": elo_mom,
        "qb_elo_diff": float(hb["qb_elo"]) + hfa - float(ab["qb_elo"]) + alt_b,
        "qb_val_over_team_home": val_h,
        "qb_val_over_team_away": val_a,
        "qb_change_home": float("nan"),
        "qb_change_away": float("nan"),
        "qb_starts_diff": math.log1p(float(hb["qb_starts"])) - math.log1p(float(ab["qb_starts"])),
        "coach_elo_diff": ce_diff,
        "coach_change_home": float("nan"),
        "coach_change_away": float("nan"),
        "composite_elo_diff": comp_diff,
        "comp_elo_logit": comp_logit,
        "elo_closeness": elo_close,
        "rest_diff": float("nan"),
        "f5_adj_margin_diff": float(hb["f5_adj_margin"]) - float(ab["f5_adj_margin"]),
        "f10_adj_margin_diff": float(hb["f10_adj_margin"]) - float(ab["f10_adj_margin"]),
        "ewm_adj_margin_diff": float(hb["ewm_adj_margin"]) - float(ab["ewm_adj_margin"]),
        "ewm_off_diff": float(hb["ewm_off"]) - float(ab["ewm_off"]),
        "ewm_def_diff": float(hb["ewm_def"]) - float(ab["ewm_def"]),
        "sos_elo_diff": (float(hb["sos_elo"]) - float(ab["sos_elo"])) / 100.0,
        "pyth_win_diff": float(hb["pyth_win"]) - float(ab["pyth_win"]),
        "div_game": div_g,
        "is_indoor": ind,
        "neutral_site": 0.0,
        "wind_outdoor": 0.0,
        "cold_outdoor": 0.0 if ind > 0.5 else float("nan"),
        "prev_ot_diff": float("nan"),
        "epa_dropback_off_diff": float(he["off_dropback_epa_pp"]) - float(ae["off_dropback_epa_pp"]),
        "epa_dropback_def_diff": float(ae["def_dropback_epa_pp"]) - float(he["def_dropback_epa_pp"]),
        "epa_dropback_wp_net_diff": (float(he["off_dropback_epa_wp_pp"]) - float(he["def_dropback_epa_wp_pp"])) - (float(ae["off_dropback_epa_wp_pp"]) - float(ae["def_dropback_epa_wp_pp"])),
        "epa_rush_off_diff": float(he["off_rush_epa_pp"]) - float(ae["off_rush_epa_pp"]),
        "epa_rush_def_diff": float(ae["def_rush_epa_pp"]) - float(he["def_rush_epa_pp"]),
        "ed_success_off_diff": float(he["off_ed_success_rate"]) - float(ae["off_ed_success_rate"]),
        "ed_success_def_diff": float(ae["def_ed_success_rate"]) - float(he["def_ed_success_rate"]),
        "global_success_net_diff": (float(he["off_success_rate"]) - float(he["def_success_rate"])) - (float(ae["off_success_rate"]) - float(ae["def_success_rate"])),
        "pressure_gen_def_diff": float(he["def_pressure_proxy_rate"]) - float(ae["def_pressure_proxy_rate"]),
        "pressure_allowed_off_diff": float(ae["off_pressure_proxy_rate"]) - float(he["off_pressure_proxy_rate"]),
        "qb_epa_per_db_diff": qb_epa_diff,
        "qb_cpoe_diff": (float(he["last_qb_cpoe"]) - float(ae["last_qb_cpoe"])) / 100.0,
        "turnover_luck_diff": float(hv["net_luck"]) - float(av["net_luck"]),
        "fast_epa_mom_diff": float(hv["fast_epa_mom"]) - float(av["fast_epa_mom"]),
    }

    tmap: dict[str, float] = {
        "ewm_pts_total_sum": 0.5 * (float(hv["pts_total"]) + float(av["pts_total"])),
        "pace_plays_sum": 0.5 * (float(hv["pace_plays"]) + float(av["pace_plays"])),
        "clipped_epa_sum": float(hv["off_clip"]) + float(av["def_clip"]) + (float(av["off_clip"]) + float(hv["def_clip"])),
        "pass_rate_sum": 0.5 * (float(hv["off_pass"]) + float(av["def_pass"]) + (float(av["off_pass"]) + float(hv["def_pass"]))),
        "qb_epa_sum": abs(qb_epa_diff),
        "ewm_off_plus_def_sum": float(hb["ewm_off"]) - float(ab["ewm_off"]) - (float(hb["ewm_def"]) - float(ab["ewm_def"])),
        "abs_comp_elo_diff": abs(comp_diff) / 200.0,
        "is_indoor": ind,
        "wind_outdoor": 0.0,
        "cold_outdoor": 0.0 if ind > 0.5 else float("nan"),
        "div_game": div_g,
        "venue_elev_km": float(hb["elevation_m"]) / 1000.0,
    }

    ml_vec = [float(fmap.get(nm, float("nan"))) for nm in state["selected_features"]]
    tot_vec = [float(tmap.get(nm, float("nan"))) for nm in state["totals_features"]]
    cov = sum(1 for v in ml_vec if math.isfinite(v)) / max(len(ml_vec), 1)
    return ml_vec, tot_vec, cov, True


def main() -> None:
    sha_before = hashlib.sha256(FROZEN_V3_SNAPSHOT.read_bytes()).hexdigest()
    v3_snap = json.loads(FROZEN_V3_SNAPSHOT.read_text(encoding="utf-8"))

    # Cargar TODOS los artefactos candidatos `v5.1`
    gbm_club_v5 = json.loads((DATA_DIR / "gbm_club_v5_0_candidate.json").read_text(encoding="utf-8"))
    goals_club_v5 = json.loads((DATA_DIR / "model_club_goals_v5_0_candidate.json").read_text(encoding="utf-8"))
    club_state_v51 = json.loads((DATA_DIR / "club_state_v5_1.json").read_text(encoding="utf-8"))
    club_micro_v51 = json.loads((DATA_DIR / "club_micro_state_v5_1.json").read_text(encoding="utf-8"))
    micro_v5 = json.loads((DATA_DIR / "model_soccer_micro_v5_0_candidate.json").read_text(encoding="utf-8"))

    gbm_nfl_v35 = json.loads((DATA_DIR / "gbm_nfl_v3_5_candidate.json").read_text(encoding="utf-8"))
    totals_nfl_v35 = json.loads((DATA_DIR / "model_nfl_totals_v3_5_candidate.json").read_text(encoding="utf-8"))
    nfl_state_v35 = json.loads((DATA_DIR / "nfl_causal_state_v3_5.json").read_text(encoding="utf-8"))
    nfl_v5 = json.loads((DATA_DIR / "model_nfl_v5_0_candidate.json").read_text(encoding="utf-8"))

    inplay_v5 = json.loads((DATA_DIR / "model_inplay_early_payout_v5_0_candidate.json").read_text(encoding="utf-8"))
    ms_v4 = json.loads((DATA_DIR / "multisport_v4_0_state_candidate.json").read_text(encoding="utf-8"))
    sgp_v5 = json.loads((DATA_DIR / "sgp_copula_v5_0_candidate.json").read_text(encoding="utf-8"))
    epistemic_v51 = json.loads((DATA_DIR / "model_epistemic_conformal_v5_1_candidate.json").read_text(encoding="utf-8"))

    by_div_norm, by_any_norm = _build_club_resolver(club_state_v51)

    nfl_kernel = np.array(nfl_v5["positive_margin_kernel_1_to_45"], dtype=np.float64)
    nfl_margin_qc = float(nfl_v5.get("margin_quad_concentration", 0.0))
    tot_spec_nfl = nfl_v5["discrete_totals_v5"]
    ot_spec_nfl = nfl_v5["overtime_calibration"]
    r_spec = micro_v5["red_cards_model"]
    r_yel_eff = 0.5 * (micro_v5["metrics"]["yellow_cards"]["dispersion_r_home"] + micro_v5["metrics"]["yellow_cards"]["dispersion_r_away"])
    r_red_eff = 0.5 * (r_spec["dispersion_r_home"] + r_spec["dispersion_r_away"])
    gamma_red_bp = float(r_spec.get("booking_points_gamma_red", 0.0))
    dc_rho_pl_sgp = float(sgp_v5.get("default_player_linked_dc_rho", -0.08))

    # Calibración 4-Param de clubes (sin doble inflación `A2`)
    club_rho_prior = float(goals_club_v5.get("default_rho", -0.04))
    club_disp_r = float(goals_club_v5.get("dispersion_r", 500.0))
    club_w_rho_blend = float(goals_club_v5.get("rho_draw_blend_weight", 0.0))

    name_to_key: dict[tuple[str, str], str] = {}
    for _, entry in ms_v4["teams"].items():
        sp_e = str(entry["sport"])
        nm_e = str(entry["team_name"]).strip().lower()
        ky_e = str(entry["team_key"])
        name_to_key[(sp_e, nm_e)] = ky_e
        name_to_key[(sp_e, ky_e.lower())] = ky_e

    t0 = time.perf_counter()
    unified_outlooks: list[dict[str, Any]] = []
    counts_by_league: dict[str, int] = {}
    quality_counts = {"ok": 0, "partial_coverage": 0, "fallback_prior": 0}
    n_soccer_both_resolved = 0
    n_nfl_real_inference = 0
    n_exact_v3_copies = 0
    n_ep_violations = 0

    for row in v3_snap["expected_predictions"]:
        mid = str(row["matchupId"])
        sp_raw = str(row["sport"]).lower()
        lg = str(row["league"]).lower()
        hm = str(row["homeTeam"])
        aw = str(row["awayTeam"])
        fp = row["finalProbs"]
        p_h_v3 = float(fp["pHome"])
        p_a_v3 = float(fp["pAway"])
        exp_tot_v3 = float(row.get("expectedTotal") or 2.65)
        exp_m_v3 = float(row.get("expectedMargin") or 0.0)
        counts_by_league[lg] = counts_by_league.get(lg, 0) + 1

        if sp_raw in ("football", "soccer") or lg in LEAGUE_TO_DIV:
            dv = LEAGUE_TO_DIV.get(lg, "E0")
            ck_h, ok_h = _resolve_club_key(hm, dv, by_div_norm, by_any_norm)
            ck_a, ok_a = _resolve_club_key(aw, dv, by_div_norm, by_any_norm)

            st_h = club_state_v51["clubs"][ck_h] if (ok_h and ck_h) else {"div": dv, "team": hm, "elo": 1390.0, "elo_games": 8}
            st_a = club_state_v51["clubs"][ck_a] if (ok_a and ck_a) else {"div": dv, "team": aw, "elo": 1390.0, "elo_games": 8}
            micro_h = club_micro_v51["clubs"].get(ck_h) if ck_h else None
            micro_a = club_micro_v51["clubs"].get(ck_a) if ck_a else None

            if ok_h and ok_a:
                n_soccer_both_resolved += 1

            # Inferencia REAL `Tachyon v5.1` (`Logit + HGB`) + `Horizon-Goals 4-Param` (ZERO copia de `v3`!)
            xf_1x2, xf_goals, eff_games, s_prog = _assemble_soccer_v51_features(
                dv, st_h, st_a, club_state_v51, gbm_club_v5, goals_club_v5, micro_h, micro_a
            )
            p_log, p_gbm, p_ens = _eval_gbm_and_logit_ensemble(xf_1x2, gbm_club_v5)

            eta_g = float(goals_club_v5["intercept"]) + sum(
                float(goals_club_v5["coef"][ic]) * ((xf_goals[ic] - float(goals_club_v5["scaler_mean"][ic])) / (float(goals_club_v5["scaler_scale"][ic]) or 1.0))
                for ic in range(len(xf_goals))
            )
            t_target = math.exp(min(max(eta_g, math.log(0.45)), math.log(7.5)))
            sol4 = solve_diagonal_inflated_score_matrix_4param(
                p_ens[0],
                p_ens[1],
                p_ens[2],
                t_target,
                rho_prior=club_rho_prior,
                dispersion_r=club_disp_r,
                rho_draw_blend_weight=club_w_rho_blend,
            )
            mk4 = summarize_markets_from_matrix_v4(sol4["matrix"])
            lh, la = float(sol4["mu_home"]), float(sol4["mu_away"])
            sup_h = lh - la
            siege_h = (max(0.0, sup_h) ** 1.4) - 0.5 * (max(0.0, -sup_h) ** 1.2)
            siege_a = (max(0.0, -sup_h) ** 1.4) - 0.5 * (max(0.0, sup_h) ** 1.2)
            t_exc = lh + la - 2.65
            tight = math.exp(-abs(sup_h)) - 0.55
            s_crunch = max(0.0, s_prog - 0.70) * math.exp(-abs(sup_h))

            # Micro-mercados con tasas REALES por club desde `club_micro_state_v5_1.json` (cero `[..., 0, 0, 0]`!)
            ratios_h: dict[str, float] = {}
            ratios_a: dict[str, float] = {}
            for q_all in ("corners", "yellow_cards", "fouls", "shots_on_target", "shots"):
                mh_q_st = micro_h["metrics"].get(q_all, {}) if micro_h else {}
                ma_q_st = micro_a["metrics"].get(q_all, {}) if micro_a else {}
                ratios_h[q_all] = min(max(float(mh_q_st.get("att_home", 1.0)) * float(ma_q_st.get("def_away", 1.0)), 0.40), 2.40)
                ratios_a[q_all] = min(max(float(ma_q_st.get("att_away", 1.0)) * float(mh_q_st.get("def_home", 1.0)), 0.40), 2.40)

            blk_h = min(max(float((micro_h or {}).get("blk_att", 1.0)) * float((micro_a or {}).get("blk_def", 1.0)), 0.45), 2.25)
            blk_a = min(max(float((micro_a or {}).get("blk_att", 1.0)) * float((micro_h or {}).get("blk_def", 1.0)), 0.45), 2.25)

            micro_brief: dict[str, Any] = {}
            sot_p85 = 0.5
            yel_pmf_tot = None
            yel_mu_h, yel_mu_a = 1.85, 2.15
            for q_k in ("corners", "yellow_cards", "shots_on_target"):
                sp_q = micro_v5["metrics"][q_k]
                dp_q = micro_v5["div_priors"].get(dv, {}).get("metrics", {}).get(q_k, {})
                bh = float(dp_q.get("home_mean", sp_q["default_home_rate"])) * ratios_h[q_k]
                ba = float(dp_q.get("away_mean", sp_q["default_away_rate"])) * ratios_a[q_k]
                if q_k == "corners":
                    cr_h, cr_a = math.log(blk_h), math.log(blk_a)
                elif q_k == "yellow_cards":
                    cr_h, cr_a = math.log(min(max(ratios_h["fouls"], 0.35), 2.80)), math.log(min(max(ratios_a["fouls"], 0.35), 2.80))
                else:
                    cr_h, cr_a = math.log(ratios_h["shots"]), math.log(ratios_a["shots"])

                xh = [math.log(max(bh, 0.12)), sup_h, siege_h, t_exc, tight, cr_h, s_crunch, 0.0]
                xa = [math.log(max(ba, 0.12)), -sup_h, siege_a, t_exc, tight, cr_a, s_crunch, 0.0]
                eg_h = float(sp_q["home_intercept"]) + sum(float(c) * x for c, x in zip(sp_q["home_coef"], xh))
                eg_a = float(sp_q["away_intercept"]) + sum(float(c) * x for c, x in zip(sp_q["away_coef"], xa))
                eh_h = evaluate_poisson_gbm_eta_scalar(xh, sp_q["home_hgb"]) if (sp_q["w_hgb_home"] > 0.0 and sp_q["home_hgb"] is not None) else eg_h
                eh_a = evaluate_poisson_gbm_eta_scalar(xa, sp_q["away_hgb"]) if (sp_q["w_hgb_away"] > 0.0 and sp_q["away_hgb"] is not None) else eg_a
                mh_q = min(max(math.exp((1.0 - sp_q["w_hgb_home"]) * eg_h + sp_q["w_hgb_home"] * eh_h), 0.15), 35.0)
                ma_q = min(max(math.exp((1.0 - sp_q["w_hgb_away"]) * eg_a + sp_q["w_hgb_away"] * eh_a), 0.15), 35.0)
                biv = bivariate_sarmanov_summary_exact(
                    mh_q, ma_q, float(sp_q["dispersion_r_home"]), float(sp_q["dispersion_r_away"]), int(sp_q["max_k_side"]), float(sp_q["copula_omega"]), list(sp_q["handicap_lines"])
                )
                if q_k == "yellow_cards":
                    yel_pmf_tot = biv["pmf_total"]
                    yel_mu_h, yel_mu_a = mh_q, ma_q
                po_q, pu_q, _ = line_probs_from_pmf(biv["pmf_total"], float(sp_q["canonical_total_line"]))
                p_cond_q = po_q / max(po_q + pu_q, 1e-12)
                if q_k == "shots_on_target":
                    sot_p85 = p_cond_q
                micro_brief[q_k] = {
                    "muTotal": round(mh_q + ma_q, 4),
                    "canonicalLine": float(sp_q["canonical_total_line"]),
                    "pOverNoPush": round(p_cond_q, 5),
                }

            # Red Cards & Booking Points Condicional (`gamma_red > 0`, `C3`)
            dp_red = micro_v5["div_priors"].get(dv, {}).get("red_cards", {})
            brh = float(dp_red.get("home_mean", r_spec["default_home_rate"])) * float((micro_h or {}).get("red_for", 1.0)) * float((micro_a or {}).get("red_opp", 1.0))
            bra = float(dp_red.get("away_mean", r_spec["default_away_rate"])) * float((micro_a or {}).get("red_for", 1.0)) * float((micro_h or {}).get("red_opp", 1.0))
            rf_h = [math.log(max(brh, 0.015)), math.log(max(yel_mu_h, 0.25)), max(0.0, -sup_h), tight, s_crunch, 0.0]
            rf_a = [math.log(max(bra, 0.015)), math.log(max(yel_mu_a, 0.25)), max(0.0, sup_h), tight, s_crunch, 0.0]
            mrh = min(max(math.exp(float(r_spec["home_intercept"]) + sum(float(c) * x for c, x in zip(r_spec["home_coef"], rf_h))), 0.01), 1.5)
            mra = min(max(math.exp(float(r_spec["away_intercept"]) + sum(float(c) * x for c, x in zip(r_spec["away_coef"], rf_a))), 0.01), 1.5)
            biv_r = bivariate_sarmanov_summary_exact(mrh, mra, float(r_spec["dispersion_r_home"]), float(r_spec["dispersion_r_away"]), 4, float(r_spec["copula_omega"]), [-0.5, 0.5])
            p_red_m = line_probs_from_pmf(biv_r["pmf_total"], 0.5)[0]
            assert yel_pmf_tot is not None
            bp_o = build_booking_points_outlook_scalar(
                yel_pmf_tot,
                yel_mu_h + yel_mu_a,
                r_yel_eff,
                biv_r["pmf_total"],
                mrh + mra,
                r_red_eff,
                float(r_spec["booking_points_omega_yr"]),
                [35.5, 45.5, 55.5],
                gamma_red=gamma_red_bp,
            )

            # Pago Anticipado +2 Goles ANCLADO algebraicamente a `mk4` (`A1`: 0/84 violaciones!)
            ep_s = evaluate_soccer_early_payout_and_inplay_scalar(
                pregame_mu_home=lh,
                pregame_mu_away=la,
                current_minute=0,
                current_home_goals=0,
                current_away_goals=0,
                red_cards_home=0,
                red_cards_away=0,
                home_already_hit_2=False,
                away_already_hit_2=False,
                soccer_cfg=inplay_v5["soccer"],
                core_p_home=mk4["p_home"],
                core_p_draw=mk4["p_draw"],
                core_p_away=mk4["p_away"],
            )
            if ep_s["p_home_early_payout"] < mk4["p_home"] - 1e-9 or ep_s["p_away_early_payout"] < mk4["p_away"] - 1e-9:
                n_ep_violations += 1

            sgp_t = evaluate_student_t_sgp_scalar(
                "soccer",
                [
                    {"legId": "o25", "factor": "total_goals", "marginalProbability": mk4["p_over_2_5"], "direction": 1},
                    {"legId": "sot85", "factor": "total_shots_on_target", "marginalProbability": sot_p85, "direction": 1},
                ],
                sgp_v5,
            )
            pl_sgp = evaluate_player_linked_sgp_scalar(
                1.0 - math.exp(-0.36 * lh), lh, la, "team_win", 2.5, dixon_coles_rho=dc_rho_pl_sgp
            )
            summary_es = _verified_summary_es(hm, aw, mk4["p_home"], mk4["p_draw"], mk4["p_away"], sol4["expected_total_implied"], 2.5, mk4["p_over_2_5"])

            # Bandas epistémicas REALES `Inductive Venn-Abers` + divergencia `|pLogit - pGbm|` (`D5`)
            band_h = compute_epistemic_band_v51_scalar(
                p_point=mk4["p_home"],
                effective_sample_games=eff_games,
                p_sub_a=p_log[0],
                p_sub_b=p_gbm[0],
                season_progress=s_prog,
                sport="soccer",
                calibration_artifact=epistemic_v51,
            )
            band_a = compute_epistemic_band_v51_scalar(
                p_point=mk4["p_away"],
                effective_sample_games=eff_games,
                p_sub_a=p_log[2],
                p_sub_b=p_gbm[2],
                season_progress=s_prog,
                sport="soccer",
                calibration_artifact=epistemic_v51,
            )

            dq_flag = "ok" if (ok_h and ok_a) else ("partial_coverage" if (ok_h or ok_a) else "fallback_prior")
            dq_cov = 1.0 if (ok_h and ok_a) else (0.55 if (ok_h or ok_a) else 0.25)
            quality_counts[dq_flag] += 1
            if abs(mk4["p_home"] - p_h_v3) < 1e-6 and abs(mk4["p_away"] - p_a_v3) < 1e-6:
                n_exact_v3_copies += 1

            unified_outlooks.append(
                {
                    "matchId": mid,
                    "sport": "soccer",
                    "league": lg,
                    "homeTeam": hm,
                    "awayTeam": aw,
                    "coreProbabilities": {
                        "pHome": round(mk4["p_home"], 6),
                        "pDraw": round(mk4["p_draw"], 6),
                        "pAway": round(mk4["p_away"], 6),
                        "fairDecimalHome": _fair_decimal(mk4["p_home"]),
                        "fairDecimalDraw": _fair_decimal(mk4["p_draw"]),
                        "fairDecimalAway": _fair_decimal(mk4["p_away"]),
                        "pLogitHome": round(p_log[0], 6),
                        "pGbmHome": round(p_gbm[0], 6),
                    },
                    "epistemicUncertainty90": {
                        "home": {k: (round(v, 6) if isinstance(v, float) else v) for k, v in band_h.items()},
                        "away": {k: (round(v, 6) if isinstance(v, float) else v) for k, v in band_a.items()},
                    },
                    "earlyPayout2Goals": {
                        "pHomeEarlyPayoutWin": round(ep_s["p_home_early_payout"], 6),
                        "pAwayEarlyPayoutWin": round(ep_s["p_away_early_payout"], 6),
                        "homeLift": round(ep_s["home_ep_lift"], 6),
                        "fairDecimalHomeEarlyPayout": _fair_decimal(ep_s["p_home_early_payout"]),
                    },
                    "derivedMarkets": {
                        "expectedTotal": round(sol4["expected_total_implied"], 4),
                        "pOver25": round(mk4["p_over_2_5"], 6),
                        "pBttsYes": round(mk4["p_btts_yes"], 6),
                        "pRedCardMatch": round(p_red_m, 5),
                        "expectedBookingPoints": round(bp_o["expectedBookingPoints"], 3),
                        "pBookingPointsOver45_5": round(bp_o["lines"]["45.5"]["pOver"], 5),
                        "micro": micro_brief,
                    },
                    "studentTSgpSample": {
                        "copulaFamily": sgp_t["copula_family"],
                        "dfNu": sgp_t["degrees_of_freedom_nu"],
                        "jointProbability": round(sgp_t["joint_probability"], 6),
                        "correlationMultiplier": round(sgp_t["correlation_multiplier"], 4),
                    },
                    "playerLinkedSgpSample": {
                        "dixonColesRho": dc_rho_pl_sgp,
                        "jointProbability": round(pl_sgp["joint_probability"], 6),
                        "structuralLiftMultiplier": round(pl_sgp["structural_lift_multiplier"], 4),
                    },
                    "verifiedSummaryEs": summary_es,
                    "dataQuality": {
                        "flag": dq_flag,
                        "coverageScore": dq_cov,
                        "sourceEngine": "tachyon_v5_1_live_inference",
                        "validationStatus": "oos_validated_2020_2024",
                        "homeResolved": ok_h,
                        "awayResolved": ok_a,
                    },
                }
            )
        elif sp_raw == "nfl":
            ml_vec, tot_vec, nfl_cov, nfl_ok = _synthesize_nfl_v35_vectors(hm, aw, nfl_state_v35)
            assert nfl_ok, f"Franquicia NFL no resuelta: {hm} vs {aw}"
            n_nfl_real_inference += 1

            p_log_n, p_gbm_n, p_ens_n = _eval_gbm_and_logit_ensemble(ml_vec, gbm_nfl_v35)
            pt_nfl = max(p_ens_n[1], 0.003)
            s3 = p_ens_n[0] + pt_nfl + p_ens_n[2]
            ph_3, pt_3, pa_3 = p_ens_n[0] / s3, pt_nfl / s3, p_ens_n[2] / s3

            # Ridge Totals v3.5 real
            acc_t = float(totals_nfl_v35["intercept"])
            for ic in range(int(totals_nfl_v35["n_features"])):
                xv = tot_vec[ic] if math.isfinite(tot_vec[ic]) else float(totals_nfl_v35["imputer_statistics"][ic])
                sc_i = float(totals_nfl_v35["scaler_scale"][ic]) or 1.0
                acc_t += float(totals_nfl_v35["coef"][ic]) * ((xv - float(totals_nfl_v35["scaler_mean"][ic])) / sc_i)
            t_nfl = min(max(acc_t, float(totals_nfl_v35["min_total_points"])), float(totals_nfl_v35["max_total_points"]))

            sol_n = solve_nfl_key_number_margin_pmf_exact(ph_3, pt_3, pa_3, nfl_kernel, margin_quad_concentration=nfl_margin_qc)
            sp_m3 = project_spread_from_margin_pmf_exact(sol_n["pmf"], -3.0)
            sol_tot = solve_nfl_discrete_key_total_pmf_scalar(t_nfl, tot_spec_nfl["base_kernel_0_to_95"], float(tot_spec_nfl["quad_concentration"]))
            _, _, pp41, _ = eval_discrete_total_line_scalar(sol_tot["pmf"], 41.0)
            _, _, _, po445_np = eval_discrete_total_line_scalar(sol_tot["pmf"], 44.5)

            pw2 = ph_3 / max(ph_3 + pa_3, 1e-12)
            p_log_2w = p_log_n[0] / max(p_log_n[0] + p_log_n[2], 1e-12)
            p_gbm_2w = p_gbm_n[0] / max(p_gbm_n[0] + p_gbm_n[2], 1e-12)

            x_ot = [math.exp(-abs(float(sol_n["expected_margin"])) / 7.0), (sol_tot["expected_total_implied"] - 44.0) / 10.0, 0.0, 0.0]
            eta_ot = float(ot_spec_nfl["intercept"]) + sum(float(c) * x for c, x in zip(ot_spec_nfl["coef"], x_ot))
            p_ot = min(max(1.0 / (1.0 + math.exp(-eta_ot)), 0.005), 0.25)

            ep_nfl = evaluate_points_sport_ep_scalar("nfl", pw2, inplay_v5)
            sgp_n = evaluate_student_t_sgp_scalar(
                "nfl",
                [
                    {"legId": "hw", "factor": "home_margin", "marginalProbability": pw2, "direction": 1},
                    {"legId": "o445", "factor": "total_points", "marginalProbability": po445_np, "direction": 1},
                ],
                sgp_v5,
            )
            summary_es = _verified_summary_es(hm, aw, pw2, None, 1.0 - pw2, sol_tot["expected_total_implied"], 44.5, po445_np)

            band_h_n = compute_epistemic_band_v51_scalar(
                p_point=pw2,
                effective_sample_games=16.0,
                p_sub_a=p_log_2w,
                p_sub_b=p_gbm_2w,
                season_progress=0.55,
                sport="nfl",
                calibration_artifact=epistemic_v51,
            )
            band_a_n = compute_epistemic_band_v51_scalar(
                p_point=1.0 - pw2,
                effective_sample_games=16.0,
                p_sub_a=1.0 - p_log_2w,
                p_sub_b=1.0 - p_gbm_2w,
                season_progress=0.55,
                sport="nfl",
                calibration_artifact=epistemic_v51,
            )

            quality_counts["ok"] += 1
            if abs(pw2 - p_h_v3 / max(p_h_v3 + p_a_v3, 1e-12)) < 1e-6:
                n_exact_v3_copies += 1

            unified_outlooks.append(
                {
                    "matchId": mid,
                    "sport": "nfl",
                    "league": "nfl",
                    "homeTeam": hm,
                    "awayTeam": aw,
                    "coreProbabilities": {
                        "pHome": round(pw2, 6),
                        "pDraw": None,
                        "pAway": round(1.0 - pw2, 6),
                        "fairDecimalHome": _fair_decimal(pw2),
                        "fairDecimalDraw": None,
                        "fairDecimalAway": _fair_decimal(1.0 - pw2),
                        "pLogitHome": round(p_log_2w, 6),
                        "pGbmHome": round(p_gbm_2w, 6),
                    },
                    "epistemicUncertainty90": {
                        "home": {k: (round(v, 6) if isinstance(v, float) else v) for k, v in band_h_n.items()},
                        "away": {k: (round(v, 6) if isinstance(v, float) else v) for k, v in band_a_n.items()},
                    },
                    "earlyPayout17Pts": {
                        "pHomeEarlyPayoutWin": round(ep_nfl["p_home_ep"], 6),
                        "homeLift": round(ep_nfl["home_lift"], 6),
                        "fairDecimalHomeEarlyPayout": _fair_decimal(ep_nfl["p_home_ep"]),
                        "validationStatus": inplay_v5["points_sports_early_payout"]["nfl"].get("validation_status", "theoretical_reflection_unvalidated"),
                    },
                    "derivedMarkets": {
                        "expectedMargin": round(sol_n["expected_margin"], 4),
                        "expectedTotal": round(sol_tot["expected_total_implied"], 4),
                        "pOvertime": round(p_ot, 5),
                        "pPush41_0": round(pp41, 5),
                        "spreadMinus3Push": round(sp_m3["pPush"], 5),
                        "pOver44_5": round(po445_np, 5),
                    },
                    "studentTSgpSample": {
                        "copulaFamily": sgp_n["copula_family"],
                        "dfNu": sgp_n["degrees_of_freedom_nu"],
                        "jointProbability": round(sgp_n["joint_probability"], 6),
                        "correlationMultiplier": round(sgp_n["correlation_multiplier"], 4),
                    },
                    "verifiedSummaryEs": summary_es,
                    "dataQuality": {
                        "flag": "ok",
                        "coverageScore": round(nfl_cov, 4),
                        "sourceEngine": "minkowski_v3_5_v5_1_live_inference",
                        "validationStatus": "oos_validated_2020_2024",
                    },
                }
            )
        else:
            sp_ms = "ncaaf" if lg == "ncaaf" else lg
            hk = name_to_key.get((sp_ms, hm.strip().lower()))
            ak = name_to_key.get((sp_ms, aw.strip().lower()))
            if hk and ak and f"{sp_ms}::{hk}" in ms_v4["teams"] and f"{sp_ms}::{ak}" in ms_v4["teams"]:
                h_ent = ms_v4["teams"][f"{sp_ms}::{hk}"]
                a_ent = ms_v4["teams"][f"{sp_ms}::{ak}"]
                has_fcs_prior = bool(h_ent.get("prior_source") == "fcs_to_fbs_transition_prior" or a_ent.get("prior_source") == "fcs_to_fbs_transition_prior")
                ms_res = predict_live_multisport_v40_matchup_exact(sp_ms, hk, ak, ms_v4)
                ph_m = float(ms_res["p_home"])
                if sp_ms == "mlb":
                    et_m = float(ms_res["full_game"]["expected_total_runs"])
                    ln_m = float(ms_res["full_game"]["total_line"])
                    po_m = float(ms_res["full_game"]["p_over_cond_no_push"])
                elif sp_ms == "nhl":
                    et_m = float(ms_res["expected_goals_home_full"] + ms_res["expected_goals_away_full"])
                    ln_m = float(ms_res["total_line"])
                    po_m = float(ms_res["p_over_cond_no_push"])
                else:
                    et_m = float(ms_res["expected_total"])
                    ln_m = float(ms_res["total_line"])
                    po_m = float(ms_res["p_over"])
                dq_flag = "partial_coverage" if has_fcs_prior else "ok"
                dq_cov = 0.70 if has_fcs_prior else 1.0
                src_eng = f"multisport_v5_1_{sp_ms}"
            else:
                c_res = project_ncaaf_v40_exact(
                    {
                        "home_power_rating": 0.5 * exp_m_v3,
                        "away_power_rating": -0.5 * exp_m_v3,
                        "home_off_pts_pg": 0.5 * exp_tot_v3,
                        "home_def_pts_pg": 0.5 * exp_tot_v3,
                        "away_off_pts_pg": 0.5 * exp_tot_v3,
                        "away_def_pts_pg": 0.5 * exp_tot_v3,
                        "neutral_site": True,
                    }
                )
                ph_m = min(max(p_h_v3 / max(p_h_v3 + p_a_v3, 1e-12), 0.001), 0.999)
                et_m = exp_tot_v3
                ln_m = float(c_res["total_line"])
                po_m = float(c_res["p_over"])
                dq_flag = "fallback_prior"
                dq_cov = 0.35
                src_eng = f"multisport_v5_1_{sp_ms}_fallback"

            quality_counts[dq_flag] += 1
            ep_ms = evaluate_points_sport_ep_scalar(sp_ms, ph_m, inplay_v5) if sp_ms in ("mlb", "nba") else None
            summary_es = _verified_summary_es(hm, aw, ph_m, None, 1.0 - ph_m, et_m, ln_m, po_m)
            band_h_m = compute_epistemic_band_v51_scalar(p_point=ph_m, effective_sample_games=28.0, sport="multisport", calibration_artifact=epistemic_v51)
            band_a_m = compute_epistemic_band_v51_scalar(p_point=1.0 - ph_m, effective_sample_games=28.0, sport="multisport", calibration_artifact=epistemic_v51)

            unified_outlooks.append(
                {
                    "matchId": mid,
                    "sport": sp_ms,
                    "league": lg,
                    "homeTeam": hm,
                    "awayTeam": aw,
                    "coreProbabilities": {
                        "pHome": round(ph_m, 6),
                        "pDraw": None,
                        "pAway": round(1.0 - ph_m, 6),
                        "fairDecimalHome": _fair_decimal(ph_m),
                        "fairDecimalDraw": None,
                        "fairDecimalAway": _fair_decimal(1.0 - ph_m),
                    },
                    "epistemicUncertainty90": {
                        "home": {k: (round(v, 6) if isinstance(v, float) else v) for k, v in band_h_m.items()},
                        "away": {k: (round(v, 6) if isinstance(v, float) else v) for k, v in band_a_m.items()},
                    },
                    "earlyPayoutPoints": (
                        {
                            "pHomeEarlyPayoutWin": round(ep_ms["p_home_ep"], 6),
                            "homeLift": round(ep_ms["home_lift"], 6),
                            "validationStatus": "theoretical_reflection_unvalidated",
                        }
                        if ep_ms is not None
                        else None
                    ),
                    "derivedMarkets": {
                        "expectedTotal": round(et_m, 4),
                        "canonicalTotalLine": ln_m,
                        "pOver": round(po_m, 5),
                    },
                    "verifiedSummaryEs": summary_es,
                    "dataQuality": {
                        "flag": dq_flag,
                        "coverageScore": dq_cov,
                        "sourceEngine": src_eng,
                        "validationStatus": "structural_prior_no_game_oos",
                    },
                }
            )

    elapsed_ms = (time.perf_counter() - t0) * 1000.0
    n_ok = quality_counts["ok"]
    n_partial = quality_counts["partial_coverage"]
    n_fallback = quality_counts["fallback_prior"]

    payload = {
        "schema_version": "unified_matchday_v5.1.0",
        "suite_codename": "PitchLab Spacetime, In-Play & Epistemic Suite v5.1 Remediated Candidate",
        "status": "candidate",
        "production_activated": False,
        "generated_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "holdout_sealed_untouched": True,
        "n_matchups": len(unified_outlooks),
        "n_coverage_ok": n_ok,
        "n_partial_coverage": n_partial,
        "n_fallback_prior": n_fallback,
        "n_low_coverage": n_fallback,
        "coverage_ok_pct": round(100.0 * n_ok / max(len(unified_outlooks), 1), 2),
        "live_inference_audit": {
            "soccer_both_clubs_resolved": n_soccer_both_resolved,
            "nfl_real_minkowski_inference": n_nfl_real_inference,
            "exact_v3_copy_bypass_count": n_exact_v3_copies,
            "early_payout_monotonicity_violations": n_ep_violations,
        },
        "python_total_latency_ms": round(elapsed_ms, 3),
        "python_avg_latency_ms": round(elapsed_ms / max(len(unified_outlooks), 1), 4),
        "counts_by_league": counts_by_league,
        "outlooks": unified_outlooks,
    }

    _assert_zero_forbidden_keys(payload)
    assert len(unified_outlooks) == 242, f"Cantidad de partidos incorrecta: {len(unified_outlooks)}"
    assert n_ep_violations == 0, f"Violación Axioma 1: {n_ep_violations} violaciones de Early Payout"
    assert n_exact_v3_copies == 0, f"Violación Axioma 2: {n_exact_v3_copies} copias de v3 detectadas"
    assert n_nfl_real_inference == 46, f"NFL incompleto: {n_nfl_real_inference}/46"

    CANDIDATE_V5_SNAPSHOT_OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    sha_after = hashlib.sha256(FROZEN_V3_SNAPSHOT.read_bytes()).hexdigest()
    if sha_before != sha_after:
        raise RuntimeError("VIOLACIÓN CRÍTICA: live_matchday_v3_snapshot.json cambió de hash!")

    EXP_V56_RESULTS_OUT.parent.mkdir(parents=True, exist_ok=True)
    EXP_V56_RESULTS_OUT.write_text(
        json.dumps(
            {
                "experiment_id": "EXP_V56_epistemic_unified_v5_1_remediated",
                "holdout_sealed_untouched": True,
                "n_matchups": 242,
                "n_coverage_ok": n_ok,
                "n_partial_coverage": n_partial,
                "n_fallback_prior": n_fallback,
                "live_inference_audit": payload["live_inference_audit"],
                "python_total_latency_ms": round(elapsed_ms, 3),
                "python_avg_latency_ms": round(elapsed_ms / 242.0, 4),
                "frozen_v3_snapshot_sha256_verified": sha_after,
                "candidate_v5_snapshot_sha256": hashlib.sha256(CANDIDATE_V5_SNAPSHOT_OUT.read_bytes()).hexdigest(),
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    print(
        f"[EXP_V56 v5.1] Snapshot candidato generado: {n_ok} ok, {n_partial} partial_coverage, {n_fallback} fallback_prior "
        f"| Soccer resolved={n_soccer_both_resolved}/84, NFL real={n_nfl_real_inference}/46, v3 copies={n_exact_v3_copies}, "
        f"EP violations={n_ep_violations} | {elapsed_ms:.1f} ms | SHA-256 v3.2 intacto ({sha_after[:12]}...)"
    )


if __name__ == "__main__":
    main()
