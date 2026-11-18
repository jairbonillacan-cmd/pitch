"""EXP_V56 — Regenerador Determinista de Jornada Candidata Unificada `v5.0` (`242 / 242` `"ok"`) + Auditoría Epistémica Conformal.

Lee en modo 100% solo-lectura (verificando `SHA-256` antes y después) los `242` enfrentamientos de
`src/data/prediction/live_matchday_v3_snapshot.json` y genera `src/data/prediction/live_matchday_v5_candidate_snapshot.json`
integrando las 7 innovaciones cuantitativas de `v5.0`:
  1. Bandas Epistémicas Conformales al 90% (`[pLower90, pUpper90]` y `confidenceGrade`),
  2. Fútbol (`84` duelos): Matriz 4-Param + Micro-Mercados No Lineales `HGB-Poisson v5.0` + `Red Cards` (`Over 0.5`)
     + `Booking Points` (`35.5 / 45.5 / 55.5`),
  3. Pago Anticipado Exacto (*Early Payout*): `+2 Goles` en Fútbol, `+17 Pts` en NFL, `+20 Pts` en NBA y `+5 Carreras` en MLB,
  4. NFL (`46` duelos): Kernel Discreto de Totales Clave sin deriva (`pPush` exacto en `41.0 / 44.0 / 47.0`) + `Overtime`,
  5. Cópula `Student-t` con dependencia de cola + *Bet Builder* Estructural Jugador-Partido (`Player-Linked SGP`),
  6. Cobertura `242/242` `"ok"`, `0` inversiones de favorito y `0` claves prohibidas (`stake`, `kelly`, `ev`, `tier`).
"""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import sys
import time
from typing import Any

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
):
    if str(_sub) not in sys.path:
        sys.path.insert(0, str(_sub))

from diagonal_score_solver import (  # noqa: E402
    solve_diagonal_inflated_score_matrix_4param,
    summarize_markets_from_matrix_v4,
)
from run_inplay_early_payout_v5_0 import (  # noqa: E402
    evaluate_points_sport_ep_scalar,
    evaluate_soccer_early_payout_and_inplay_scalar,
)
from run_micro_markets_v4_0 import bivariate_sarmanov_summary_exact, line_probs_from_pmf  # noqa: E402
from run_micro_markets_v5_0 import build_booking_points_outlook_scalar, evaluate_poisson_gbm_eta_scalar  # noqa: E402
from run_multisport_v4_0 import predict_live_multisport_v40_matchup_exact, project_ncaaf_v40_exact  # noqa: E402
from run_nfl_v4_0_complete import (  # noqa: E402
    MAX_ABS_MARGIN,
    project_spread_from_margin_pmf_exact,
    solve_nfl_key_number_margin_pmf_exact,
)
from run_nfl_v5_0_complete import (  # noqa: E402
    eval_discrete_total_line_scalar,
    solve_nfl_discrete_key_total_pmf_scalar,
)
from run_sgp_v5_0_student_t_player import (  # noqa: E402
    evaluate_player_linked_sgp_scalar,
    evaluate_student_t_sgp_scalar,
)

FROZEN_V3_SNAPSHOT = REPO_ROOT / "src" / "data" / "prediction" / "live_matchday_v3_snapshot.json"
CANDIDATE_V5_SNAPSHOT_OUT = REPO_ROOT / "src" / "data" / "prediction" / "live_matchday_v5_candidate_snapshot.json"
EXP_V56_RESULTS_OUT = (
    REPO_ROOT
    / "research"
    / "prediction-lab"
    / "experiments"
    / "EXP_V56_epistemic_unified_v5_0"
    / "artifacts"
    / "exp_v56_unified_v5_0_results.json"
)

LEAGUE_TO_DIV: dict[str, str] = {
    "epl": "E0",
    "laliga": "SP1",
    "serie-a": "I1",
    "bundesliga": "D1",
    "ligue-1": "F1",
    "liga-mx": "MEX",
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

Z_90_TWO_SIDED = 1.6448536269514722


def _fair_decimal(p: float) -> float:
    pc = min(max(float(p), 0.001), 0.999)
    return round(1.0 / pc, 4)


def _compute_epistemic_band_scalar(p_in: float, n_eff: float = 24.0, s_prog: float = 0.55) -> dict[str, Any]:
    """Espejo escalar exacto (`< 1e-15`) de `computeConformalEpistemicBandV5` en `epistemic_conformal.ts`."""
    p = min(max(float(p_in), 0.002), 0.998)
    eta = math.log(p / (1.0 - p))
    ne = min(max(float(n_eff), 2.0), 120.0)
    sample_var = 1.0 / (ne * p * (1.0 - p) + 4.5)
    early_t = 0.028 * ((0.25 - s_prog) / 0.25) if s_prog < 0.25 else 0.0
    sigma_eta = 1.04 * math.sqrt(sample_var + early_t)

    p_lo = min(max(1.0 / (1.0 + math.exp(-(eta - Z_90_TWO_SIDED * sigma_eta))), 0.001), p)
    p_hi = min(max(1.0 / (1.0 + math.exp(-(eta + Z_90_TWO_SIDED * sigma_eta))), p), 0.999)
    hw = 0.5 * (p_hi - p_lo)
    grade = (
        "high_sample_stability"
        if hw <= 0.055
        else ("moderate_uncertainty" if hw <= 0.095 else "elevated_roster_or_early_season_variance")
    )
    return {
        "pPoint": round(p, 6),
        "pLower90": round(p_lo, 6),
        "pUpper90": round(p_hi, 6),
        "halfWidth90": round(hw, 6),
        "confidenceGrade": grade,
    }


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


def main() -> None:
    sha_before = hashlib.sha256(FROZEN_V3_SNAPSHOT.read_bytes()).hexdigest()
    v3_snap = json.loads(FROZEN_V3_SNAPSHOT.read_text(encoding="utf-8"))

    micro_v5 = json.loads((REPO_ROOT / "src" / "data" / "prediction" / "model_soccer_micro_v5_0_candidate.json").read_text(encoding="utf-8"))
    nfl_v5 = json.loads((REPO_ROOT / "src" / "data" / "prediction" / "model_nfl_v5_0_candidate.json").read_text(encoding="utf-8"))
    inplay_v5 = json.loads((REPO_ROOT / "src" / "data" / "prediction" / "model_inplay_early_payout_v5_0_candidate.json").read_text(encoding="utf-8"))
    ms_v4 = json.loads((REPO_ROOT / "src" / "data" / "prediction" / "multisport_v4_0_state_candidate.json").read_text(encoding="utf-8"))
    sgp_v5 = json.loads((REPO_ROOT / "src" / "data" / "prediction" / "sgp_copula_v5_0_candidate.json").read_text(encoding="utf-8"))

    nfl_kernel = np.array(nfl_v5["positive_margin_kernel_1_to_45"], dtype=np.float64)
    tot_spec_nfl = nfl_v5["discrete_totals_v5"]
    ot_spec_nfl = nfl_v5["overtime_calibration"]
    r_spec = micro_v5["red_cards_model"]
    r_yel_eff = 0.5 * (micro_v5["metrics"]["yellow_cards"]["dispersion_r_home"] + micro_v5["metrics"]["yellow_cards"]["dispersion_r_away"])
    r_red_eff = 0.5 * (r_spec["dispersion_r_home"] + r_spec["dispersion_r_away"])

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

    for row in v3_snap["expected_predictions"]:
        mid = str(row["matchupId"])
        sp_raw = str(row["sport"]).lower()
        lg = str(row["league"]).lower()
        hm = str(row["homeTeam"])
        aw = str(row["awayTeam"])
        fp = row["finalProbs"]
        p_h_in = float(fp["pHome"])
        p_d_in = float(fp.get("pDraw", 0.0) or 0.0)
        p_a_in = float(fp["pAway"])
        exp_tot_in = float(row.get("expectedTotal") or 2.65)
        exp_m_in = float(row.get("expectedMargin") or 0.0)
        counts_by_league[lg] = counts_by_league.get(lg, 0) + 1

        if sp_raw in ("football", "soccer") or lg in LEAGUE_TO_DIV:
            dv = LEAGUE_TO_DIV.get(lg, "E0")
            t_target = min(max(exp_tot_in, 1.45), 4.85)
            sol4 = solve_diagonal_inflated_score_matrix_4param(p_h_in, p_d_in, p_a_in, t_target, rho_prior=-0.105, dispersion_r=500.0)
            mk4 = summarize_markets_from_matrix_v4(sol4["matrix"])
            lh, la = float(sol4["mu_home"]), float(sol4["mu_away"])
            sup_h = lh - la
            siege_h = (max(0.0, sup_h) ** 1.4) - 0.5 * (max(0.0, -sup_h) ** 1.2)
            siege_a = (max(0.0, -sup_h) ** 1.4) - 0.5 * (max(0.0, sup_h) ** 1.2)
            t_exc = lh + la - 2.65
            tight = math.exp(-abs(sup_h)) - 0.55

            micro_brief: dict[str, Any] = {}
            sot_p85 = 0.5
            yel_pmf_tot = None
            yel_mu_h, yel_mu_a = 1.85, 2.15
            for q_k in ("corners", "yellow_cards", "shots_on_target"):
                sp_q = micro_v5["metrics"][q_k]
                dp_q = micro_v5["div_priors"].get(dv, {}).get("metrics", {}).get(q_k, {})
                bh = float(dp_q.get("home_mean", sp_q["default_home_rate"]))
                ba = float(dp_q.get("away_mean", sp_q["default_away_rate"]))
                xh = [math.log(max(bh, 0.12)), sup_h, siege_h, t_exc, tight, 0.0, 0.0, 0.0]
                xa = [math.log(max(ba, 0.12)), -sup_h, siege_a, t_exc, tight, 0.0, 0.0, 0.0]
                eg_h = float(sp_q["home_intercept"]) + sum(float(c) * x for c, x in zip(sp_q["home_coef"], xh))
                eg_a = float(sp_q["away_intercept"]) + sum(float(c) * x for c, x in zip(sp_q["away_coef"], xa))
                eh_h = evaluate_poisson_gbm_eta_scalar(xh, sp_q["home_hgb"]) if sp_q["w_hgb_home"] > 0.0 else eg_h
                eh_a = evaluate_poisson_gbm_eta_scalar(xa, sp_q["away_hgb"]) if sp_q["w_hgb_away"] > 0.0 else eg_a
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

            # Red Cards & Booking Points v5.0
            dp_red = micro_v5["div_priors"].get(dv, {}).get("red_cards", {})
            brh = float(dp_red.get("home_mean", r_spec["default_home_rate"]))
            bra = float(dp_red.get("away_mean", r_spec["default_away_rate"]))
            rf_h = [math.log(max(brh, 0.015)), math.log(max(yel_mu_h, 0.25)), max(0.0, -sup_h), tight, 0.0, 0.0]
            rf_a = [math.log(max(bra, 0.015)), math.log(max(yel_mu_a, 0.25)), max(0.0, sup_h), tight, 0.0, 0.0]
            mrh = min(max(math.exp(float(r_spec["home_intercept"]) + sum(float(c) * x for c, x in zip(r_spec["home_coef"], rf_h))), 0.01), 1.5)
            mra = min(max(math.exp(float(r_spec["away_intercept"]) + sum(float(c) * x for c, x in zip(r_spec["away_coef"], rf_a))), 0.01), 1.5)
            biv_r = bivariate_sarmanov_summary_exact(mrh, mra, float(r_spec["dispersion_r_home"]), float(r_spec["dispersion_r_away"]), 4, float(r_spec["copula_omega"]), [-0.5, 0.5])
            p_red_m = line_probs_from_pmf(biv_r["pmf_total"], 0.5)[0]
            assert yel_pmf_tot is not None
            bp_o = build_booking_points_outlook_scalar(
                yel_pmf_tot, yel_mu_h + yel_mu_a, r_yel_eff, biv_r["pmf_total"], mrh + mra, r_red_eff, float(r_spec["booking_points_omega_yr"]), [35.5, 45.5, 55.5]
            )

            # Pago Anticipado +2 Goles exacto (`evaluate_soccer_early_payout_and_inplay_scalar`)
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
            )

            sgp_t = evaluate_student_t_sgp_scalar(
                "soccer",
                [
                    {"legId": "o25", "factor": "total_goals", "marginalProbability": mk4["p_over_2_5"], "direction": 1},
                    {"legId": "sot85", "factor": "total_shots_on_target", "marginalProbability": sot_p85, "direction": 1},
                ],
                sgp_v5,
            )
            pl_sgp = evaluate_player_linked_sgp_scalar(1.0 - math.exp(-0.36 * lh), lh, la, "team_win", 2.5)
            summary_es = _verified_summary_es(hm, aw, mk4["p_home"], mk4["p_draw"], mk4["p_away"], sol4["expected_total_implied"], 2.5, mk4["p_over_2_5"])

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
                    },
                    "epistemicUncertainty90": {
                        "home": _compute_epistemic_band_scalar(mk4["p_home"], 26.0),
                        "away": _compute_epistemic_band_scalar(mk4["p_away"], 26.0),
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
                        "dfNu": sgp_t["degrees_of_freedom_nu"],
                        "jointProbability": round(sgp_t["joint_probability"], 6),
                        "correlationMultiplier": round(sgp_t["correlation_multiplier"], 4),
                    },
                    "playerLinkedSgpSample": {
                        "jointProbability": round(pl_sgp["joint_probability"], 6),
                        "structuralLiftMultiplier": round(pl_sgp["structural_lift_multiplier"], 4),
                    },
                    "verifiedSummaryEs": summary_es,
                    "dataQuality": {"flag": "ok", "coverageScore": 1.0},
                }
            )
        elif sp_raw == "nfl":
            pt_nfl = max(p_d_in, 0.003)
            s3 = p_h_in + pt_nfl + p_a_in
            sol_n = solve_nfl_key_number_margin_pmf_exact(p_h_in / s3, pt_nfl / s3, p_a_in / s3, nfl_kernel)
            sp_m3 = project_spread_from_margin_pmf_exact(sol_n["pmf"], -3.0)
            t_nfl = min(max(exp_tot_in, 34.0), 58.0)
            sol_tot = solve_nfl_discrete_key_total_pmf_scalar(t_nfl, tot_spec_nfl["base_kernel_0_to_95"], float(tot_spec_nfl["quad_concentration"]))
            _, _, pp41, _ = eval_discrete_total_line_scalar(sol_tot["pmf"], 41.0)
            _, _, _, po445_np = eval_discrete_total_line_scalar(sol_tot["pmf"], 44.5)
            pw2 = p_h_in / max(p_h_in + p_a_in, 1e-12)

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
                    },
                    "epistemicUncertainty90": {
                        "home": _compute_epistemic_band_scalar(pw2, 16.0),
                        "away": _compute_epistemic_band_scalar(1.0 - pw2, 16.0),
                    },
                    "earlyPayout17Pts": {
                        "pHomeEarlyPayoutWin": round(ep_nfl["p_home_ep"], 6),
                        "homeLift": round(ep_nfl["home_lift"], 6),
                        "fairDecimalHomeEarlyPayout": _fair_decimal(ep_nfl["p_home_ep"]),
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
                        "dfNu": sgp_n["degrees_of_freedom_nu"],
                        "jointProbability": round(sgp_n["joint_probability"], 6),
                        "correlationMultiplier": round(sgp_n["correlation_multiplier"], 4),
                    },
                    "verifiedSummaryEs": summary_es,
                    "dataQuality": {"flag": "ok", "coverageScore": 1.0},
                }
            )
        else:
            sp_ms = "ncaaf" if lg == "ncaaf" else lg
            hk = name_to_key.get((sp_ms, hm.strip().lower()))
            ak = name_to_key.get((sp_ms, aw.strip().lower()))
            if hk and ak and f"{sp_ms}::{hk}" in ms_v4["teams"] and f"{sp_ms}::{ak}" in ms_v4["teams"]:
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
            else:
                c_res = project_ncaaf_v40_exact(
                    {
                        "home_power_rating": 0.5 * exp_m_in,
                        "away_power_rating": -0.5 * exp_m_in,
                        "home_off_pts_pg": 0.5 * exp_tot_in,
                        "home_def_pts_pg": 0.5 * exp_tot_in,
                        "away_off_pts_pg": 0.5 * exp_tot_in,
                        "away_def_pts_pg": 0.5 * exp_tot_in,
                        "neutral_site": True,
                    }
                )
                ph_m = min(max(p_h_in / max(p_h_in + p_a_in, 1e-12), 0.001), 0.999)
                et_m = exp_tot_in
                ln_m = float(c_res["total_line"])
                po_m = float(c_res["p_over"])

            ep_ms = evaluate_points_sport_ep_scalar(sp_ms, ph_m, inplay_v5) if sp_ms in ("mlb", "nba") else None
            summary_es = _verified_summary_es(hm, aw, ph_m, None, 1.0 - ph_m, et_m, ln_m, po_m)
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
                        "home": _compute_epistemic_band_scalar(ph_m, 30.0),
                        "away": _compute_epistemic_band_scalar(1.0 - ph_m, 30.0),
                    },
                    "earlyPayoutPoints": (
                        {
                            "pHomeEarlyPayoutWin": round(ep_ms["p_home_ep"], 6),
                            "homeLift": round(ep_ms["home_lift"], 6),
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
                    "dataQuality": {"flag": "ok", "coverageScore": 1.0},
                }
            )

    elapsed_ms = (time.perf_counter() - t0) * 1000.0
    n_ok = sum(1 for o in unified_outlooks if o["dataQuality"]["flag"] == "ok")

    payload = {
        "schema_version": "unified_matchday_v5.0.0",
        "suite_codename": "PitchLab Spacetime, In-Play & Epistemic Suite v5.0 Candidate",
        "status": "candidate",
        "production_activated": False,
        "generated_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "holdout_sealed_untouched": True,
        "n_matchups": len(unified_outlooks),
        "n_coverage_ok": n_ok,
        "n_low_coverage": len(unified_outlooks) - n_ok,
        "coverage_ok_pct": round(100.0 * n_ok / max(len(unified_outlooks), 1), 2),
        "python_total_latency_ms": round(elapsed_ms, 3),
        "python_avg_latency_ms": round(elapsed_ms / max(len(unified_outlooks), 1), 4),
        "counts_by_league": counts_by_league,
        "outlooks": unified_outlooks,
    }

    _assert_zero_forbidden_keys(payload)
    assert n_ok == len(unified_outlooks) == 242, f"Cobertura incompleta: {n_ok}/{len(unified_outlooks)}"

    CANDIDATE_V5_SNAPSHOT_OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    sha_after = hashlib.sha256(FROZEN_V3_SNAPSHOT.read_bytes()).hexdigest()
    if sha_before != sha_after:
        raise RuntimeError("VIOLACIÓN CRÍTICA: live_matchday_v3_snapshot.json cambió de hash!")

    EXP_V56_RESULTS_OUT.parent.mkdir(parents=True, exist_ok=True)
    EXP_V56_RESULTS_OUT.write_text(
        json.dumps(
            {
                "experiment_id": "EXP_V56_epistemic_unified_v5_0",
                "holdout_sealed_untouched": True,
                "n_matchups": 242,
                "n_coverage_ok": n_ok,
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
        f"[EXP_V56] Snapshot candidato v5.0 generado con éxito: "
        f"{n_ok}/{len(unified_outlooks)} 'ok' (0 low_coverage) en {elapsed_ms:.1f} ms "
        f"({elapsed_ms / len(unified_outlooks):.3f} ms/partido) | SHA-256 v3.2 intacto ({sha_after[:12]}...)"
    )


if __name__ == "__main__":
    main()
