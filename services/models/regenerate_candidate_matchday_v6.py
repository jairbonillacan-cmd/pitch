"""EXP_V62 — Regenerador Determinista del Snapshot Candidato Unificado `v6.0` (`57 / 57` Ligas).

Orquesta en modo 100% determinista (`0` red, `sys.dont_write_bytecode = True`, `PITCH_DATA_DIR` en
estricto solo-lectura y `0` bytes modificados en `v3.0..v5.2` ni en los 28 archivos de Ola 1) el
espejo Python exacto (`< 1e-12` IEEE-754 y `SHA-256` idénticos) de `src/domain/prediction/unified_outlook_v6.ts`:

  1. Cobertura universal de las **`57 / 57` ligas** de `Pitch/data/snapshots`:
     - **`53` competiciones de fútbol** vía `soccer_57_v6_0` (`4-Param Diagonal-NB` con error de cono `< 1e-12`
       + recalibrador *Inductive Venn-Abers* `[1.55, 2.60]`) + `officials_freeze_v6_0` (`resolveOfficialPriorV6`
       con `gamma_red = 0.1680`) + `inplay_and_early_payout` (`+2` goles anclado algebraicamente) +
       `epistemic_conformal` (`[pLower90, pUpper90]`) + ejemplos reales `props_v6_0` (`shots`/`SoT` multi-línea
       Logit-PAVA `0.5+..3.5+` y `player_saves` `1.5+..4.5+` + SGP `evaluateGoalkeeperSavesLinkedSgpV6`).
     - **`4` deportes US (`MLB, NHL, NBA, NFL`)** vía `multisport_v6_0` walk-forward físico (`date' < date`,
       conservación Empty-Net/OT NHL `< 1e-12`, Axioma 8 MLB, Axioma 5 NFL, bajas reales `nba/injuries.json`,
       *Early Payout* `+5/+3/+20/+17`) + ejemplos reales `props_v6_0` sin truncamiento de 5 columnas.
  2. Sellado criptográfico pre-kickoff (`sealPreKickoffOutlookV6`, `inputsAsOfUtc <= kickoffUtc`),
     rechazando `100%` de análisis contaminados post-kickoff (`MLB FT` / regeneraciones tardías) y
     recuperando `FT` sin pronóstico (`NBA FT` / `NHL FT`) vía backfill causal `date' < date`.
  3. Guardrail determinista anti-alucinación en español (`validateNarrativeAgainstFactSheet` +
     `validateMatchMathematicalInvariants` con `100%` `passed == True`) y `0` claves prohibidas.
"""

from __future__ import annotations

import sys

sys.dont_write_bytecode = True

from collections import defaultdict
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import re
import time
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
PRED_LAB_EXPS = REPO_ROOT / "research" / "prediction-lab" / "experiments"
DATA_DIR = REPO_ROOT / "src" / "data" / "prediction"

for _sub in (
    REPO_ROOT,
    PRED_LAB_EXPS / "EXP_V54_inplay_early_payout_v5_0",
    PRED_LAB_EXPS / "EXP_V56_epistemic_unified_v5_0",
    PRED_LAB_EXPS / "EXP_V58_soccer_57_v6_0",
    PRED_LAB_EXPS / "EXP_V59_props_v6_0",
    PRED_LAB_EXPS / "EXP_V60_multisport_v6_0",
    PRED_LAB_EXPS / "EXP_V61_officials_freeze_v6_0",
):
    if str(_sub) not in sys.path:
        sys.path.insert(0, str(_sub))

import run_epistemic_conformal_v5_1 as v56  # noqa: E402
import run_exp_v58_soccer_57_v6_0 as v58  # noqa: E402
import run_exp_v59_props_v6_0 as v59  # noqa: E402
import run_exp_v60_multisport_v6_0 as v60  # noqa: E402
import run_exp_v61_officials_freeze_v6_0 as v61  # noqa: E402

DEFAULT_PITCH_DATA_DIR = Path(
    os.environ.get("PITCH_DATA_DIR", r"C:\Users\jairb\OneDrive\Desktop\Proyectos\Pitch\data")
)

FROZEN_V3_SNAPSHOT = DATA_DIR / "live_matchday_v3_snapshot.json"
FROZEN_V5_SNAPSHOT = DATA_DIR / "live_matchday_v5_candidate_snapshot.json"
CANDIDATE_V6_SNAPSHOT_OUT = DATA_DIR / "live_matchday_v6_candidate_snapshot.json"
EXP_V62_RESULTS_OUT = (
    PRED_LAB_EXPS / "EXP_V62_unified_v6_0" / "artifacts" / "exp_v62_unified_v6_0_results.json"
)

UNIFIED_OUTLOOK_V6_SCHEMA_VERSION = "unified_match_intelligence_v6.0.0"
SNAPSHOT_V6_SCHEMA_VERSION = "live_matchday_v6_candidate_snapshot_1.0.0"

US_LEAGUES: tuple[str, ...] = ("mlb", "nhl", "nba", "nfl")

FORBIDDEN_KEYS: frozenset[str] = frozenset({
    "stake",
    "stake_u",
    "recommendedStake",
    "kelly",
    "kellyFraction",
    "expectedEdge",
    "edge",
    "ev",
    "tier",
    "valueStatus",
    "executable_bets_count",
})


def clamp(v: float, lo: float, hi: float) -> float:
    if v < lo:
        return lo
    if v > hi:
        return hi
    return v


def quantize_for_seal_v6(x: float) -> float:
    """Exact mirror of `quantizeForSealV6` in `unified_outlook_v6.ts` (`floor(x * 1e9 + 0.5) / 1e9`, no `-0.0`)."""
    scaled = math.floor(float(x) * 1e9 + 0.5) / 1e9
    return 0.0 if scaled == 0.0 else scaled


def _assert_zero_forbidden_keys(node: Any, path: str = "root") -> None:
    if isinstance(node, dict):
        for k, v in node.items():
            if k in FORBIDDEN_KEYS:
                raise AssertionError(f"Governance violation: forbidden key '{k}' at {path}.{k}")
            _assert_zero_forbidden_keys(v, f"{path}.{k}")
    elif isinstance(node, list):
        for idx, item in enumerate(node):
            _assert_zero_forbidden_keys(item, f"{path}[{idx}]")


# ============================================================================
# 1. Exact Mirrors of `epistemic_conformal.ts`, `inplay_and_early_payout.ts`,
#    and `narrative_guardrail.ts`
# ============================================================================

def _build_epistemic_band_with_odds(
    *,
    p_point: float,
    effective_sample_games: float,
    p_sub_a: float | None,
    p_sub_b: float | None,
    season_progress: float,
    sport: str | None,
    calibration_artifact: dict[str, Any] | None,
) -> dict[str, Any]:
    raw = v56.compute_epistemic_band_v51_scalar(
        p_point=p_point,
        effective_sample_games=effective_sample_games,
        p_sub_a=p_sub_a,
        p_sub_b=p_sub_b,
        season_progress=season_progress,
        has_recent_change=False,
        missing_key_starters=0,
        conformal_scale_90=None,
        sport=sport,
        calibration_artifact=calibration_artifact,
    )
    out: dict[str, Any] = {
        "pPoint": raw["pPoint"],
        "pLower90": raw["pLower90"],
        "pUpper90": raw["pUpper90"],
        "halfWidth90": raw["halfWidth90"],
        "logitStdError": raw["logitStdError"],
    }
    if raw["vennAbersP0"] is not None:
        out["vennAbersP0"] = raw["vennAbersP0"]
    if raw["vennAbersP1"] is not None:
        out["vennAbersP1"] = raw["vennAbersP1"]
    out["calibrationMethod"] = raw["calibrationMethod"]
    out["conservativeFairOddsFromLower90"] = v58.probability_to_fair_odds(
        clamp(raw["pLower90"], 0.001, 0.999)
    )
    out["confidenceGrade"] = raw["confidenceGrade"]
    return out


def build_match_epistemic_summary_v5_mirror(
    *,
    p_home: float,
    p_draw: float | None,
    p_away: float,
    effective_sample_games: float,
    p_logit_home: float | None = None,
    p_gbm_home: float | None = None,
    p_logit_draw: float | None = None,
    p_gbm_draw: float | None = None,
    p_logit_away: float | None = None,
    p_gbm_away: float | None = None,
    season_progress: float = 0.55,
    sport: str | None = None,
    calibration_artifact: dict[str, Any] | None = None,
) -> dict[str, Any]:
    home_band = _build_epistemic_band_with_odds(
        p_point=p_home,
        effective_sample_games=effective_sample_games,
        p_sub_a=p_logit_home,
        p_sub_b=p_gbm_home,
        season_progress=season_progress,
        sport=sport,
        calibration_artifact=calibration_artifact,
    )
    away_band = _build_epistemic_band_with_odds(
        p_point=p_away,
        effective_sample_games=effective_sample_games,
        p_sub_a=p_logit_away,
        p_sub_b=p_gbm_away,
        season_progress=season_progress,
        sport=sport,
        calibration_artifact=calibration_artifact,
    )
    draw_band = (
        _build_epistemic_band_with_odds(
            p_point=p_draw,
            effective_sample_games=effective_sample_games,
            p_sub_a=p_logit_draw,
            p_sub_b=p_gbm_draw,
            season_progress=season_progress,
            sport=sport,
            calibration_artifact=calibration_artifact,
        )
        if p_draw is not None
        else None
    )
    max_half = max(home_band["halfWidth90"], away_band["halfWidth90"])
    overall_grade = (
        "high_sample_stability"
        if max_half <= 0.055
        else (
            "moderate_uncertainty"
            if max_half <= 0.095
            else "elevated_roster_or_early_season_variance"
        )
    )
    return {
        "homeBand90": home_band,
        "drawBand90": draw_band,
        "awayBand90": away_band,
        "overallConfidenceGrade": overall_grade,
    }


def evaluate_soccer_early_payout_and_inplay_ts_mirror(
    *,
    pregame_mu_home: float,
    pregame_mu_away: float,
    core_p_home: float,
    core_p_draw: float,
    core_p_away: float,
    inplay_artifact: dict[str, Any],
) -> dict[str, Any]:
    """Operation-by-operation scalar mirror of `evaluateSoccerEarlyPayoutAndInPlay` in `inplay_and_early_payout.ts`."""
    cfg = inplay_artifact["soccer"]
    max_g = int(cfg["max_goals_dp"])
    g_size = max_g + 1
    n_states = g_size * g_size * 4

    mu_h0 = clamp(float(pregame_mu_home), 0.05, 7.5)
    mu_a0 = clamp(float(pregame_mu_away), 0.05, 7.5)

    dp = [0.0] * n_states
    dp_next = [0.0] * n_states
    dp[0] = 1.0

    rem_lam_h = 0.0
    rem_lam_a = 0.0
    w_buckets = [float(x) for x in cfg["minute_bucket_weights_6"]]
    trail_push = float(cfg["second_half_trailing_push"])
    use_v51 = ("second_half_tied_damping" in cfg) or ("second_half_lead_openness" in cfg)
    tied_damp = float(cfg.get("second_half_tied_damping", 0.0))
    lead_open = float(cfg.get("second_half_lead_openness", 0.0))

    for m in range(0, 90):
        b_idx = min(5, m // 15)
        u_min = w_buckets[b_idx] / 15.0
        base_dh = mu_h0 * u_min
        base_da = mu_a0 * u_min
        rem_lam_h += base_dh
        rem_lam_a += base_da

        for i in range(n_states):
            dp_next[i] = 0.0
        is_second_half = m >= 45

        for h in range(g_size):
            for a in range(g_size):
                base_cell = (h * g_size + a) * 4
                cell_mass = dp[base_cell] + dp[base_cell + 1] + dp[base_cell + 2] + dp[base_cell + 3]
                if cell_mass <= 1e-18:
                    continue

                dh = base_dh
                da = base_da
                if is_second_half:
                    if use_v51:
                        abs_diff = abs(h - a)
                        if abs_diff == 0:
                            dm = max(0.65, 1.0 + tied_damp)
                            dh *= dm
                            da *= dm
                        else:
                            open_sc = 1.0 + lead_open * min(abs_diff, 2)
                            if h < a:
                                dh *= open_sc * (1.0 + trail_push)
                                da *= open_sc
                            else:
                                da *= open_sc * (1.0 + trail_push)
                                dh *= open_sc
                    elif h != a:
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
                    p_state = dp[base_cell + mask]
                    if p_state <= 1e-18:
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
                            dst = (nh * g_size + na) * 4 + n_mask
                            dp_next[dst] = dp_next[dst] + p_state * phg * pag

        dp, dp_next = dp_next, dp

    p_home_lift_only = 0.0
    p_away_lift_only = 0.0
    p_both_ep = 0.0
    exp_tot = 0.0
    p_over25 = 0.0
    p_over35 = 0.0
    p_btts = 0.0

    for h in range(g_size):
        for a in range(g_size):
            base_cell = (h * g_size + a) * 4
            for mask in range(4):
                p = dp[base_cell + mask]
                if p <= 0.0:
                    continue
                if (mask & 1) != 0 and h <= a:
                    p_home_lift_only += p
                if (mask & 2) != 0 and a <= h:
                    p_away_lift_only += p
                if (mask & 3) == 3:
                    p_both_ep += p
                tot = h + a
                exp_tot += tot * p
                if tot >= 3:
                    p_over25 += p
                if tot >= 4:
                    p_over35 += p
                if h >= 1 and a >= 1:
                    p_btts += p

    out_ph = clamp(float(core_p_home), 0.001, 0.999)
    out_pa = clamp(float(core_p_away), 0.001, 0.999)
    out_pd = clamp(float(core_p_draw), 0.001, 0.999)
    out_ph_ep = clamp(out_ph + max(0.0, p_home_lift_only), out_ph, 0.999)
    out_pa_ep = clamp(out_pa + max(0.0, p_away_lift_only), out_pa, 0.999)

    rem_sum = rem_lam_h + rem_lam_a
    p_no_more = math.exp(-rem_sum)
    p_next_h = (1.0 - p_no_more) * (rem_lam_h / rem_sum) if rem_sum > 1e-12 else 0.0
    p_next_a = (1.0 - p_no_more) * (rem_lam_a / rem_sum) if rem_sum > 1e-12 else 0.0

    ph_ep_c = clamp(max(out_ph, out_ph_ep), 0.001, 0.999)
    pa_ep_c = clamp(max(out_pa, out_pa_ep), 0.001, 0.999)

    return {
        "currentMinute": 0,
        "remainingLambdaHome": rem_lam_h,
        "remainingLambdaAway": rem_lam_a,
        "regularFullTime": {
            "pHome": out_ph,
            "pDraw": out_pd,
            "pAway": out_pa,
            "fairOddsHome": v58.probability_to_fair_odds(out_ph),
            "fairOddsDraw": v58.probability_to_fair_odds(out_pd),
            "fairOddsAway": v58.probability_to_fair_odds(out_pa),
        },
        "earlyPayout2Goals": {
            "pHomeEarlyPayoutWin": ph_ep_c,
            "pAwayEarlyPayoutWin": pa_ep_c,
            "homeEarlyPayoutLift": max(0.0, ph_ep_c - out_ph),
            "awayEarlyPayoutLift": max(0.0, pa_ep_c - out_pa),
            "pBothSidesTriggerEarlyPayout": p_both_ep,
            "fairOddsHomeEarlyPayout": v58.probability_to_fair_odds(ph_ep_c),
            "fairOddsAwayEarlyPayout": v58.probability_to_fair_odds(pa_ep_c),
        },
        "liveTotalsAndNextGoal": {
            "expectedFinalTotalGoals": exp_tot,
            "pOver25FullTime": p_over25,
            "pOver35FullTime": p_over35,
            "pBttsFullTime": p_btts,
            "pNextGoalHome": p_next_h,
            "pNextGoalAway": p_next_a,
            "pNoMoreGoals": p_no_more,
        },
    }


def _js_to_fixed(val: float, digits: int) -> str:
    """Matches JS `Number.prototype.toFixed(digits)` for positive percentages/totals."""
    scale = 10.0 ** digits
    rounded = math.floor(float(val) * scale + 0.5) / scale
    return f"{rounded:.{digits}f}"


def build_verified_fact_sheet_and_guardrail(
    *,
    match_id: str,
    sport: str,
    home_team: str,
    away_team: str,
    p_home: float,
    p_draw: float | None,
    p_away: float,
    expected_total: float,
    canonical_total_line: float,
    p_over_canonical: float,
    p_home_ep: float,
    p_away_ep: float,
    epistemic_bands: list[dict[str, Any]],
    sgp_checks: list[dict[str, Any]],
) -> tuple[dict[str, Any], str, dict[str, Any]]:
    diff = p_home - p_away
    if diff > 0.015:
        fav_side = "home"
        fav_team: str | None = home_team
        und_team: str | None = away_team
        fav_prob = p_home
    elif diff < -0.015:
        fav_side = "away"
        fav_team = away_team
        und_team = home_team
        fav_prob = p_away
    else:
        fav_side = "balanced"
        fav_team = None
        und_team = None
        fav_prob = max(p_home, p_away)

    facts = {
        "matchId": match_id,
        "sport": sport,
        "homeTeam": home_team,
        "awayTeam": away_team,
        "pHome": p_home,
        "pDraw": p_draw,
        "pAway": p_away,
        "favoriteSide": fav_side,
        "favoriteTeam": fav_team,
        "underdogTeam": und_team,
        "favoriteProbability": fav_prob,
        "expectedTotal": expected_total,
        "canonicalTotalLine": canonical_total_line,
        "pOverCanonical": p_over_canonical,
    }

    ph_pct = _js_to_fixed(p_home * 100.0, 1)
    pa_pct = _js_to_fixed(p_away * 100.0, 1)
    po_pct = _js_to_fixed(p_over_canonical * 100.0, 1)

    if fav_side == "home" and fav_team:
        fav_clause = f"{fav_team} parte como favorito con {ph_pct}% frente a {pa_pct}% de {away_team}"
    elif fav_side == "away" and fav_team:
        fav_clause = (
            f"{fav_team} parte como favorito visitante con {pa_pct}% frente a {ph_pct}% de {home_team}"
        )
    else:
        fav_clause = f"Duelo equilibrado entre {home_team} ({ph_pct}%) y {away_team} ({pa_pct}%)"

    draw_clause = (
        f" (empate {_js_to_fixed(p_draw * 100.0, 1)}%)"
        if (p_draw is not None and p_draw > 0.01)
        else ""
    )
    summary_es = (
        f"{fav_clause}{draw_clause}. Total proyectado: {_js_to_fixed(expected_total, 2)} "
        f"(Más de {_js_to_fixed(canonical_total_line, 1)}: {po_pct}%)."
    )

    violations: list[dict[str, str]] = []
    sum_1x2 = p_home + (p_draw if p_draw is not None else 0.0) + p_away
    if not math.isfinite(sum_1x2) or abs(sum_1x2 - 1.0) > 5e-6:
        violations.append({
            "code": "mathematical_invariant_violation",
            "detail": f"Suma core inválida: {sum_1x2:.8f}",
        })
    if p_home_ep + 1e-12 < p_home:
        violations.append({
            "code": "mathematical_invariant_violation",
            "detail": "Violación Early Payout local",
        })
    if p_away_ep + 1e-12 < p_away:
        violations.append({
            "code": "mathematical_invariant_violation",
            "detail": "Violación Early Payout visita",
        })
    for b in epistemic_bands:
        if (
            b["pLower90"] <= 0.0
            or b["pUpper90"] >= 1.0
            or b["pLower90"] > b["pPoint"] + 1e-12
            or b["pPoint"] > b["pUpper90"] + 1e-12
        ):
            violations.append({
                "code": "mathematical_invariant_violation",
                "detail": f"Banda epistémica inválida en {b['label']}",
            })
    for sgp in sgp_checks:
        legs = sgp["legProbs"]
        if len(legs) >= 2:
            f_lo = max(0.0, sum(legs) - (len(legs) - 1))
            f_hi = min(legs)
            jp = sgp["jointProbability"]
            if jp + 1e-6 < f_lo or jp - 1e-6 > f_hi:
                violations.append({
                    "code": "mathematical_invariant_violation",
                    "detail": f"Violación Fréchet en {sgp['label']}",
                })

    audit = {
        "passed": len(violations) == 0,
        "violations": violations,
    }
    return facts, summary_es, audit


# ============================================================================
# 2. Exact Mirror of `buildUnifiedMatchIntelligenceV6` (`unified_outlook_v6.ts`)
# ============================================================================

def _execute_seal_contract_v6(
    *,
    canonical_input: dict[str, Any],
    sport_for_seal: str,
    causal_payload: dict[str, Any],
) -> dict[str, Any]:
    raw_inc = canonical_input.get("rawUpstreamAnalysis")
    existing = canonical_input.get("existingSealedRecord")
    st_low = str(canonical_input["lifecycleStatus"]).strip().lower()
    is_sched = st_low in ("scheduled", "ns", "not_started", "pre", "upcoming")

    if raw_inc is not None:
        outcome = v61.seal_pre_kickoff_outlook_v6(
            match_id=canonical_input["matchId"],
            sport=sport_for_seal,
            league=canonical_input["league"],
            home_team=canonical_input["homeTeam"],
            away_team=canonical_input["awayTeam"],
            kickoff_utc=canonical_input["kickoffUtc"],
            status=canonical_input["lifecycleStatus"],
            incoming_analysis=raw_inc,
            existing_sealed_record=existing,
            causal_backfill_analysis=causal_payload,
            allow_pre_kickoff_refresh=False,
        )
    elif is_sched:
        outcome = v61.seal_pre_kickoff_outlook_v6(
            match_id=canonical_input["matchId"],
            sport=sport_for_seal,
            league=canonical_input["league"],
            home_team=canonical_input["homeTeam"],
            away_team=canonical_input["awayTeam"],
            kickoff_utc=canonical_input["kickoffUtc"],
            status=canonical_input["lifecycleStatus"],
            incoming_analysis=causal_payload,
            existing_sealed_record=existing,
            causal_backfill_analysis=None,
            allow_pre_kickoff_refresh=False,
        )
    else:
        outcome = v61.seal_pre_kickoff_outlook_v6(
            match_id=canonical_input["matchId"],
            sport=sport_for_seal,
            league=canonical_input["league"],
            home_team=canonical_input["homeTeam"],
            away_team=canonical_input["awayTeam"],
            kickoff_utc=canonical_input["kickoffUtc"],
            status=canonical_input["lifecycleStatus"],
            incoming_analysis=None,
            existing_sealed_record=existing,
            causal_backfill_analysis=causal_payload,
            allow_pre_kickoff_refresh=False,
        )

    rec = outcome.get("sealedRecord")
    if not outcome.get("hasForecast") or rec is None:
        raise RuntimeError(
            f"PreKickoffFreezeContractError on {canonical_input['matchId']}: {outcome.get('sealAction')}"
        )

    return {
        "hasForecast": outcome["hasForecast"],
        "causalityStatus": outcome["causalityStatus"],
        "incomingCausalityStatus": outcome["incomingCausalityStatus"],
        "sealAction": outcome["sealAction"],
        "incomingContaminatedRejected": outcome["incomingContaminatedRejected"],
        "sealOrigin": rec["sealOrigin"],
        "inputsAsOfUtc": rec["inputsAsOfUtc"],
        "kickoffUtc": rec["kickoffUtc"],
        "leadTimeSeconds": rec["leadTimeSeconds"],
        "preKickoffSealSha256": rec["sealSha256"],
    }


def build_unified_match_intelligence_v6_py(
    canonical_input: dict[str, Any],
    artifacts: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    sport = canonical_input["sport"]
    if sport == "soccer":
        soc_in = canonical_input["soccerInput"]
        soc_art = artifacts["soccer57ArtifactV6"]
        props_art = artifacts["propsArtifactV6"]
        off_art = artifacts["officialsArtifactV6"]
        ep_art = artifacts["epistemicArtifactV51"]
        inplay_art = artifacts["inplayArtifactV5"]

        lg = canonical_input["league"]
        comp_spec = soc_art["competitions"][lg]
        conf_group = comp_spec["confederation_group"]
        is_exp_or_cup = bool(comp_spec["is_cup"] or conf_group != "UEFA_TOP")
        va_cfg = soc_art["venn_abers_playable_calibrator"]

        if (
            soc_in["mode"] == "prekickoff_recalibration"
            and soc_in.get("rawProjHome") is not None
            and soc_in.get("rawProjAway") is not None
            and soc_in.get("rawX12") is not None
        ):
            rec = v58.recalibrate_soccer_57_prekickoff_v60(
                league=lg,
                raw_proj_home=float(soc_in["rawProjHome"]),
                raw_proj_away=float(soc_in["rawProjAway"]),
                raw_x12=list(soc_in["rawX12"]),
                causal_league_env_goals=float(soc_in["leagueEnvGoals"]),
                artifact=soc_art,
            )
            p_ht, p_dt, p_at = rec["pHomeTarget"], rec["pDrawTarget"], rec["pAwayTarget"]
            mu_h, mu_a = rec["muHome"], rec["muAway"]
            rho_eff, disp_r = rec["rhoEff"], rec["dispersionR"]
            tot_target, exp_tot = rec["totalGoalsTarget"], rec["expectedTotalImplied"]
            markets = rec["markets"]
        else:
            proj = v58.project_soccer_57_match_v60(
                league=lg,
                home_elo=float(soc_in["homeElo"]),
                away_elo=float(soc_in["awayElo"]),
                home_att_ewm=float(soc_in["homeAttEwm"]),
                home_def_ewm=float(soc_in["homeDefEwm"]),
                home_games=int(soc_in["homeGames"]),
                away_att_ewm=float(soc_in["awayAttEwm"]),
                away_def_ewm=float(soc_in["awayDefEwm"]),
                away_games=int(soc_in["awayGames"]),
                league_env_goals=float(soc_in["leagueEnvGoals"]),
                neutral_site=bool(canonical_input["neutralSite"]),
                artifact=soc_art,
            )
            p_ht, p_dt, p_at = proj["pHomeTarget"], proj["pDrawTarget"], proj["pAwayTarget"]
            mu_h, mu_a = proj["muHome"], proj["muAway"]
            rho_eff, disp_r = proj["rhoEff"], proj["dispersionR"]
            tot_target, exp_tot = proj["totalGoalsTarget"], proj["expectedTotalImplied"]
            markets = proj["markets"]

        core_ph = markets["1x2"]["home"]
        core_pd = markets["1x2"]["draw"]
        core_pa = markets["1x2"]["away"]

        cone_err = max(
            abs(core_ph - p_ht),
            abs(core_pd - p_dt),
            abs(core_pa - p_at),
            abs(core_ph + core_pd + core_pa - 1.0),
        )
        tot_err = abs(exp_tot - tot_target)

        playable_va = {
            "home": v58.calibrate_playable_venn_abers_logit_v60(core_ph, is_exp_or_cup, va_cfg),
            "away": v58.calibrate_playable_venn_abers_logit_v60(core_pa, is_exp_or_cup, va_cfg),
            "over25": v58.calibrate_playable_venn_abers_logit_v60(
                markets["totals_2_5"]["over"], is_exp_or_cup, va_cfg
            ),
            "under25": v58.calibrate_playable_venn_abers_logit_v60(
                markets["totals_2_5"]["under"], is_exp_or_cup, va_cfg
            ),
            "bttsYes": v58.calibrate_playable_venn_abers_logit_v60(
                markets["btts"]["yes"], is_exp_or_cup, va_cfg
            ),
        }

        official_prior = v61.resolve_official_prior_v6(
            referee_name=canonical_input.get("refereeName"),
            league=lg,
            artifact=off_art,
        )

        ep_and_inplay = evaluate_soccer_early_payout_and_inplay_ts_mirror(
            pregame_mu_home=mu_h,
            pregame_mu_away=mu_a,
            core_p_home=core_ph,
            core_p_draw=core_pd,
            core_p_away=core_pa,
            inplay_artifact=inplay_art,
        )

        eff_games = float(max(4, min(int(soc_in["homeGames"]), int(soc_in["awayGames"])) + 6))
        epistemic = build_match_epistemic_summary_v5_mirror(
            p_home=core_ph,
            p_draw=core_pd,
            p_away=core_pa,
            effective_sample_games=eff_games,
            p_logit_home=p_ht,
            p_gbm_home=playable_va["home"]["pCalibrated"],
            p_logit_draw=p_dt,
            p_gbm_draw=core_pd,
            p_logit_away=p_at,
            p_gbm_away=playable_va["away"]["pCalibrated"],
            season_progress=float(soc_in["seasonProgress"]),
            sport="soccer",
            calibration_artifact=ep_art,
        )

        est_h_sh = clamp(9.2 + 3.1 * mu_h, 5.5, 22.0)
        est_a_sh = clamp(8.6 + 3.0 * mu_a, 5.0, 21.0)
        est_h_sot = clamp(1.25 + 2.25 * mu_h, 1.8, 10.5)
        est_a_sot = clamp(1.15 + 2.2 * mu_a, 1.6, 10.0)

        fp_block = None
        fp = soc_in.get("featuredFieldPlayer")
        if fp is not None:
            tm_sh = est_h_sh if fp["side"] == "home" else est_a_sh
            tm_sot = est_h_sot if fp["side"] == "home" else est_a_sot
            sh_out = v59.project_coupled_player_shots_multiline_v6(
                metric="shots",
                position_group=fp["positionGroup"],
                season_count=fp["seasonShots"],
                appearances=fp["appearances"],
                sub_ins=fp["subIns"],
                team_expected_shots=tm_sh,
                team_expected_sot=tm_sot,
                opp_defense_factor=1.0,
                availability=fp.get("availability") or "available",
                injury_status=fp.get("injuryStatus"),
                artifact=props_art,
            )
            sot_out = v59.project_coupled_player_shots_multiline_v6(
                metric="shots_on_target",
                position_group=fp["positionGroup"],
                season_count=fp["seasonSoT"],
                season_shots_total=fp["seasonShots"],
                appearances=fp["appearances"],
                sub_ins=fp["subIns"],
                team_expected_shots=tm_sh,
                team_expected_sot=tm_sot,
                opp_defense_factor=1.0,
                availability=fp.get("availability") or "available",
                injury_status=fp.get("injuryStatus"),
                artifact=props_art,
            )
            if sh_out["eligible"] and sot_out["eligible"]:
                fp_block = {
                    "playerName": fp["playerName"],
                    "side": fp["side"],
                    "shotsOutlook": sh_out,
                    "shotsOnTargetOutlook": sot_out,
                }

        gk_block = None
        sgp_checks: list[dict[str, Any]] = []
        gk = soc_in.get("featuredGoalkeeper")
        if gk is not None:
            opp_sot = est_a_sot if gk["side"] == "home" else est_h_sot
            own_g_exp = mu_h if gk["side"] == "home" else mu_a
            opp_g_exp = mu_a if gk["side"] == "home" else mu_h
            sv_out = v59.project_goalkeeper_saves_multiline_v6(
                saves=gk["saves"],
                shots_faced=gk["shotsFaced"],
                goals_conceded=gk["goalsConceded"],
                appearances=gk["appearances"],
                sub_ins=gk["subIns"],
                opp_expected_sot=opp_sot,
                availability=gk.get("availability") or "available",
                injury_status=gk.get("injuryStatus"),
                artifact=props_art,
            )
            if sv_out["eligible"]:
                gk_sgp = v59.evaluate_goalkeeper_saves_linked_sgp_v6(
                    saves_line=2.5,
                    eb_save_rate=sv_out["ebSaveRate"],
                    opp_expected_sot=opp_sot,
                    team_expected_goals=own_g_exp,
                    opponent_expected_goals=opp_g_exp,
                    match_outcome="clean_sheet",
                    expected_minutes=sv_out["expectedMinutes"],
                    r_dispersion_sot=sv_out["rDispersionSoT"],
                    dixon_coles_rho=rho_eff,
                    siege_own_goal_dampening=float(
                        props_art["goalkeeper_saves_v6"].get("siege_own_goal_dampening", 0.028)
                    ),
                )
                sgp_checks.append({
                    "label": f"gk_saves_2_5_clean_sheet:{gk['playerName']}",
                    "legProbs": [gk_sgp["pSavesOverMarginal"], gk_sgp["pMatchOutcomeMarginal"]],
                    "jointProbability": gk_sgp["jointProbability"],
                })
                gk_block = {
                    "playerName": gk["playerName"],
                    "side": gk["side"],
                    "savesOutlook": sv_out,
                    "linkedCleanSheetSgp": gk_sgp,
                }

        causal_payload = {
            "inputsAsOfUtc": canonical_input["causalInputsAsOfUtc"],
            "probabilities": {
                "pAway": quantize_for_seal_v6(core_pa),
                "pBttsYes": quantize_for_seal_v6(markets["btts"]["yes"]),
                "pDraw": quantize_for_seal_v6(core_pd),
                "pHome": quantize_for_seal_v6(core_ph),
                "pOver25": quantize_for_seal_v6(markets["totals_2_5"]["over"]),
            },
            "projection": {
                "away": quantize_for_seal_v6(mu_a),
                "home": quantize_for_seal_v6(mu_h),
                "margin": quantize_for_seal_v6(mu_h - mu_a),
                "total": quantize_for_seal_v6(exp_tot),
            },
        }
        seal_summary = _execute_seal_contract_v6(
            canonical_input=canonical_input,
            sport_for_seal="football",
            causal_payload=causal_payload,
        )

        ep_bands = [
            {"label": "home", **epistemic["homeBand90"]},
            {"label": "draw", **epistemic["drawBand90"]},
            {"label": "away", **epistemic["awayBand90"]},
        ]
        facts, summary_es, audit = build_verified_fact_sheet_and_guardrail(
            match_id=canonical_input["matchId"],
            sport="soccer",
            home_team=canonical_input["homeTeam"],
            away_team=canonical_input["awayTeam"],
            p_home=core_ph,
            p_draw=core_pd,
            p_away=core_pa,
            expected_total=exp_tot,
            canonical_total_line=2.5,
            p_over_canonical=markets["totals_2_5"]["over"],
            p_home_ep=ep_and_inplay["earlyPayout2Goals"]["pHomeEarlyPayoutWin"],
            p_away_ep=ep_and_inplay["earlyPayout2Goals"]["pAwayEarlyPayoutWin"],
            epistemic_bands=ep_bands,
            sgp_checks=sgp_checks,
        )

        is_prior_only = comp_spec["competition_status"] == "confederation_prior_zero_2026_games"
        dq_flag = (
            "fallback_prior"
            if is_prior_only
            else ("ok" if (soc_in["homeGames"] > 0 and soc_in["awayGames"] > 0) else "partial_coverage")
        )
        cov_score = (
            0.75
            if is_prior_only
            else (1.0 if (soc_in["homeGames"] > 0 and soc_in["awayGames"] > 0) else 0.88)
        )

        st_low = str(canonical_input["lifecycleStatus"]).strip().lower()
        norm_lc = (
            "FT"
            if st_low in ("final", "ft", "finished")
            else ("LIVE" if st_low in ("in_progress", "live") else "scheduled")
        )

        return {
            "schemaVersion": UNIFIED_OUTLOOK_V6_SCHEMA_VERSION,
            "status": "candidate",
            "productionActivated": False,
            "matchId": canonical_input["matchId"],
            "sport": "soccer",
            "league": lg,
            "homeTeam": canonical_input["homeTeam"],
            "awayTeam": canonical_input["awayTeam"],
            "kickoffUtc": canonical_input["kickoffUtc"],
            "lifecycleStatus": norm_lc,
            "coreProbabilities": {
                "pHome": core_ph,
                "pDraw": core_pd,
                "pAway": core_pa,
                "fairOddsHome": markets["1x2"]["fairOddsHome"],
                "fairOddsDraw": markets["1x2"]["fairOddsDraw"],
                "fairOddsAway": markets["1x2"]["fairOddsAway"],
            },
            "epistemicUncertainty90": epistemic,
            "earlyPayout": {
                "triggerLead": 2,
                "pHomeRegularWin": core_ph,
                "pAwayRegularWin": core_pa,
                "pHomeEarlyPayoutWin": ep_and_inplay["earlyPayout2Goals"]["pHomeEarlyPayoutWin"],
                "pAwayEarlyPayoutWin": ep_and_inplay["earlyPayout2Goals"]["pAwayEarlyPayoutWin"],
                "homeEarlyPayoutLift": ep_and_inplay["earlyPayout2Goals"]["homeEarlyPayoutLift"],
                "awayEarlyPayoutLift": ep_and_inplay["earlyPayout2Goals"]["awayEarlyPayoutLift"],
                "pBothSidesTriggerEarlyPayout": ep_and_inplay["earlyPayout2Goals"][
                    "pBothSidesTriggerEarlyPayout"
                ],
            },
            "officialPrior": official_prior,
            "soccerV6": {
                "mode": soc_in["mode"],
                "confederationGroup": conf_group,
                "competitionStatus": comp_spec["competition_status"],
                "pHomeTarget": p_ht,
                "pDrawTarget": p_dt,
                "pAwayTarget": p_at,
                "muHome": mu_h,
                "muAway": mu_a,
                "rhoEff": rho_eff,
                "dispersionR": disp_r,
                "totalGoalsTarget": tot_target,
                "expectedTotalImplied": exp_tot,
                "coneError1x2": cone_err,
                "totalImpliedError": tot_err,
                "markets": markets,
                "playableVennAbers": playable_va,
                "inPlayPregameAnchor": ep_and_inplay,
            },
            "multiSportV6": None,
            "featuredPropsV6": {
                "fieldPlayerShots": fp_block,
                "goalkeeperSaves": gk_block,
                "usPlayerProp": None,
            },
            "preKickoffSeal": seal_summary,
            "factSheet": facts,
            "verifiedSummaryEs": summary_es,
            "guardrailAudit": audit,
            "dataQuality": {
                "flag": dq_flag,
                "coverageScore": cov_score,
                "sourceEngine": "soccer_57_v6_0_4param_venn_abers",
                "validationStatus": comp_spec["competition_status"],
            },
        }

    # Branch B: US Sports (`mlb`, `nhl`, `nba`, `nfl`)
    us_in = canonical_input["usSportInput"]
    ms_art = artifacts["multisportArtifactV6"]
    props_art = artifacts["propsArtifactV6"]
    off_art = artifacts["officialsArtifactV6"]
    ep_art = artifacts["epistemicArtifactV51"]

    if us_in["mode"] == "causal_walkforward_input":
        if sport == "mlb":
            ms_out = v60.project_mlb_walkforward_outlook_v60(us_in["mlbCausalInput"], ms_art)
        elif sport == "nhl":
            ms_out = v60.project_nhl_walkforward_outlook_v60(us_in["nhlCausalInput"], ms_art)
        elif sport == "nba":
            ms_out = v60.project_nba_walkforward_outlook_v60(us_in["nbaCausalInput"], ms_art)
        else:
            ms_out = v60.project_nfl_walkforward_outlook_v60(us_in["nflCausalInput"], ms_art)
    else:
        ms_out = v60.project_multisport_matchup_from_state_v60(
            sport=sport,
            home_team=canonical_input["homeSlug"],
            away_team=canonical_input["awaySlug"],
            game_date=us_in["gameDate"],
            neutral_site=bool(canonical_input["neutralSite"]),
            artifact=ms_art,
            total_line=us_in.get("totalLine"),
            spread_line_home=us_in.get("spreadLineHome"),
        )

    p_home = ms_out["p_home"]
    p_away = ms_out["p_away"]

    if sport == "mlb":
        exp_h = ms_out["full_game"]["expected_runs_home"]
        exp_a = ms_out["full_game"]["expected_runs_away"]
        exp_tot = ms_out["full_game"]["expected_total_runs"]
        canon_line = ms_out["full_game"]["total_line"]
        p_over_canon = ms_out["full_game"]["p_over_no_push"]
    elif sport == "nhl":
        exp_h = ms_out["expected_goals_home_full"]
        exp_a = ms_out["expected_goals_away_full"]
        exp_tot = ms_out["expected_total_goals"]
        canon_line = ms_out["total_line"]
        p_over_canon = ms_out["p_over_no_push"]
    else:
        exp_tot = ms_out["expected_total"]
        exp_h = 0.5 * (exp_tot + ms_out["expected_margin"])
        exp_a = 0.5 * (exp_tot - ms_out["expected_margin"])
        canon_line = ms_out["total_line"]
        p_over_canon = ms_out["p_over_no_push"]

    official_prior = v61.resolve_official_prior_v6(
        referee_name=canonical_input.get("refereeName"),
        league=canonical_input["league"],
        artifact=off_art,
    )

    epistemic = build_match_epistemic_summary_v5_mirror(
        p_home=p_home,
        p_draw=None,
        p_away=p_away,
        effective_sample_games=float(us_in["effectiveSampleGames"]),
        p_logit_home=p_home,
        p_gbm_home=p_home,
        p_logit_away=p_away,
        p_gbm_away=p_away,
        season_progress=float(us_in["seasonProgress"]),
        sport="nfl" if sport == "nfl" else None,
        calibration_artifact=ep_art if sport == "nfl" else None,
    )

    us_prop_block = None
    up = us_in.get("featuredUsPlayerProp")
    if up is not None:
        po = v59.project_us_player_prop_v6(
            sport=sport,
            position_label=up.get("positionLabel"),
            metric=up["metric"],
            sample_sum=up["sampleSum"],
            sample_games=up["sampleGames"],
            line=up.get("line"),
            prematch_minutes=up.get("prematchMinutes"),
            sample_variance=up.get("sampleVariance"),
            opp_factor=1.0,
            availability=up.get("availability") or "available",
            injury_status=up.get("injuryStatus"),
            artifact=props_art,
        )
        if po is not None:
            us_prop_block = {
                "playerName": up["playerName"],
                "side": up["side"],
                "propOutlook": po,
            }

    causal_payload = {
        "inputsAsOfUtc": canonical_input["causalInputsAsOfUtc"],
        "probabilities": {
            "pAway": quantize_for_seal_v6(p_away),
            "pDraw": None,
            "pHome": quantize_for_seal_v6(p_home),
            "pOverCanonical": quantize_for_seal_v6(p_over_canon),
        },
        "projection": {
            "away": quantize_for_seal_v6(exp_a),
            "home": quantize_for_seal_v6(exp_h),
            "margin": quantize_for_seal_v6(exp_h - exp_a),
            "total": quantize_for_seal_v6(exp_tot),
        },
    }
    seal_summary = _execute_seal_contract_v6(
        canonical_input=canonical_input,
        sport_for_seal=sport,
        causal_payload=causal_payload,
    )

    ep = ms_out["early_payout"]
    ep_bands = [
        {"label": "home", **epistemic["homeBand90"]},
        {"label": "away", **epistemic["awayBand90"]},
    ]
    facts, summary_es, audit = build_verified_fact_sheet_and_guardrail(
        match_id=canonical_input["matchId"],
        sport=sport,
        home_team=canonical_input["homeTeam"],
        away_team=canonical_input["awayTeam"],
        p_home=p_home,
        p_draw=None,
        p_away=p_away,
        expected_total=exp_tot,
        canonical_total_line=canon_line,
        p_over_canonical=p_over_canon,
        p_home_ep=ep["p_home_early_payout_win"],
        p_away_ep=ep["p_away_early_payout_win"],
        epistemic_bands=ep_bands,
        sgp_checks=[],
    )

    st_low = str(canonical_input["lifecycleStatus"]).strip().lower()
    norm_lc = (
        "FT"
        if st_low in ("final", "ft", "finished", "completed")
        else ("LIVE" if st_low in ("in_progress", "live", "ot") else "scheduled")
    )
    is_unconf_goalie = sport == "nhl" and ms_out.get("goalie_quality_flag") == "unconfirmed_goalie_warning"

    return {
        "schemaVersion": UNIFIED_OUTLOOK_V6_SCHEMA_VERSION,
        "status": "candidate",
        "productionActivated": False,
        "matchId": canonical_input["matchId"],
        "sport": sport,
        "league": canonical_input["league"],
        "homeTeam": canonical_input["homeTeam"],
        "awayTeam": canonical_input["awayTeam"],
        "kickoffUtc": canonical_input["kickoffUtc"],
        "lifecycleStatus": norm_lc,
        "coreProbabilities": {
            "pHome": p_home,
            "pDraw": None,
            "pAway": p_away,
            "fairOddsHome": v58.probability_to_fair_odds(clamp(p_home, 0.001, 0.999)),
            "fairOddsDraw": None,
            "fairOddsAway": v58.probability_to_fair_odds(clamp(p_away, 0.001, 0.999)),
        },
        "epistemicUncertainty90": epistemic,
        "earlyPayout": {
            "triggerLead": ep["trigger_lead"],
            "pHomeRegularWin": ep["p_home_regular_win"],
            "pAwayRegularWin": ep["p_away_regular_win"],
            "pHomeEarlyPayoutWin": ep["p_home_early_payout_win"],
            "pAwayEarlyPayoutWin": ep["p_away_early_payout_win"],
            "homeEarlyPayoutLift": ep["home_early_payout_lift"],
            "awayEarlyPayoutLift": ep["away_early_payout_lift"],
            "pBothSidesTriggerEarlyPayout": ep["p_both_sides_trigger_early_payout"],
        },
        "officialPrior": official_prior,
        "soccerV6": None,
        "multiSportV6": ms_out,
        "featuredPropsV6": {
            "fieldPlayerShots": None,
            "goalkeeperSaves": None,
            "usPlayerProp": us_prop_block,
        },
        "preKickoffSeal": seal_summary,
        "factSheet": facts,
        "verifiedSummaryEs": summary_es,
        "guardrailAudit": audit,
        "dataQuality": {
            "flag": "partial_coverage" if is_unconf_goalie else "ok",
            "coverageScore": 0.92 if is_unconf_goalie else 1.0,
            "sourceEngine": f"multisport_{sport}_v6_0_walkforward",
            "validationStatus": "walk_forward_game_oos_2026_verified",
        },
    }


# ============================================================================
# 3. Causal State Builders (`date' < date`) & 57-League Snapshot Extractor
# ============================================================================

def _sanitize_team_display_name(home_name: str, away_name: str, home_code: str, away_code: str) -> tuple[str, str]:
    """Prevents substring overlap between rival team names in deterministic Spanish summaries."""
    h = home_name.strip()
    a = away_name.strip()
    hl = h.lower()
    al = a.lower()
    if hl != al:
        if hl in al and home_code:
            h = f"{h} ({home_code})"
        elif al in hl and away_code:
            a = f"{a} ({away_code})"
    return h, a


def _build_football_causal_snapshots_by_date(
    pitch_data_dir: Path,
    soc_art: dict[str, Any],
) -> tuple[dict[str, tuple[float, float, float, int]], dict[str, list[tuple[str, dict[str, Any]]]], dict[str, list[tuple[str, float]]]]:
    """Replays `EXP_V58` pre-2025 warm starts + 2026 `season-results.json` strictly by `date' < date`."""
    cs_v51 = json.loads((DATA_DIR / "club_state_v5_1.json").read_text(encoding="utf-8"))
    div_goals_pre2025 = cs_v51["div_goals_ewm"]
    pre_games, _ = v58._load_strictly_pre2025_history(pitch_data_dir)
    _, _, hist_warm_clubs = v58._build_pre2025_oof_for_venn_abers(pre_games)

    pre2025_priors: dict[str, tuple[float, float, float, int]] = {}
    for c_obj in cs_v51["clubs"].values():
        slug = v58._norm_slug(c_obj.get("team"))
        div_c = str(c_obj.get("div") or "")
        if not slug:
            continue
        raw_elo = float(c_obj.get("elo", 1500.0))
        reg_elo = 1500.0 + 0.45 * (raw_elo - 1500.0)
        base_half = 0.5 * float(div_goals_pre2025.get(div_c, 2.75))
        att_init = clamp(base_half * math.exp(0.35 * float(c_obj.get("att_strength", 0.0))), 0.65, 2.40)
        def_init = clamp(base_half * math.exp(0.35 * float(c_obj.get("def_strength", 0.0))), 0.65, 2.40)
        pre2025_priors[slug] = (reg_elo, att_init, def_init, 5)

    for slug, h_st in hist_warm_clubs.items():
        if slug not in pre2025_priors:
            reg_elo = 1500.0 + 0.45 * (float(h_st["elo"]) - 1500.0)
            att_init = clamp(0.65 * float(h_st["att_ewm"]) + 0.35 * 1.375, 0.65, 2.40)
            def_init = clamp(0.65 * float(h_st["def_ewm"]) + 0.35 * 1.375, 0.65, 2.40)
            pre2025_priors[slug] = (reg_elo, att_init, def_init, 4)

    bridge = json.loads(v58.BRIDGE_DATASET_PATH.read_text(encoding="utf-8"))
    fb_by_date: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for m in bridge["season_matches"]:
        if m["sport"] == "football":
            fb_by_date[m["date"]].append(m)

    conf_priors = soc_art["confederation_priors"]
    comps = soc_art["competitions"]

    lg_n: dict[str, int] = defaultdict(int)
    lg_sum: dict[str, float] = defaultdict(float)
    lg_ewm: dict[str, float] = {lg: float(comps[lg]["pre2025_goal_prior"]) for lg in comps}
    lg_env_timeline: dict[str, list[tuple[str, float]]] = defaultdict(list)

    club_elo: dict[str, float] = {}
    club_att: dict[str, float] = {}
    club_def: dict[str, float] = {}
    club_g: dict[str, int] = {}
    club_timeline: dict[str, list[tuple[str, dict[str, Any]]]] = defaultdict(list)

    def _cur_club(slug: str, lg: str) -> tuple[float, float, float, int]:
        if slug in club_elo:
            return club_elo[slug], club_att[slug], club_def[slug], club_g[slug]
        if slug in pre2025_priors:
            return pre2025_priors[slug]
        hg0 = 0.5 * float(comps[lg]["pre2025_goal_prior"])
        return 1500.0, hg0, hg0, 0

    def _cur_lg_env(lg: str) -> float:
        conf = comps[lg]["confederation_group"]
        kl = float(conf_priors[conf]["prior_league_games"])
        g0 = float(comps[lg]["pre2025_goal_prior"])
        n_o = lg_n[lg]
        if n_o == 0:
            return g0
        shrunk = (lg_sum[lg] + kl * g0) / (float(n_o) + kl)
        return 0.55 * shrunk + 0.45 * lg_ewm[lg]

    for cur_date in sorted(fb_by_date.keys()):
        day_lg_goals: dict[str, float] = defaultdict(float)
        day_lg_cnt: dict[str, int] = defaultdict(int)
        touched_clubs: set[str] = set()

        for g in fb_by_date[cur_date]:
            lg = g["league"]
            conf = comps[lg]["confederation_group"]
            c_cfg = conf_priors[conf]
            ht, at = g["homeTeam"], g["awayTeam"]
            hs, as_ = float(g["homeScore"]), float(g["awayScore"])

            h_elo, h_att, h_def, h_n = _cur_club(ht, lg)
            a_elo, a_att, a_def, a_n = _cur_club(at, lg)

            elo_hfa = 0.0 if g["neutralSite"] else float(c_cfg["hfa_elo"])
            elo_diff = (h_elo - a_elo) + elo_hfa
            exp_h = 1.0 / (1.0 + math.pow(10.0, -elo_diff / 400.0))
            s_h = 1.0 if hs > as_ else (0.5 if hs == as_ else 0.0)
            mov = math.log(abs(hs - as_) + 1.0) * (
                2.2 / (((elo_diff if s_h > 0.5 else -elo_diff) * 0.001) + 2.2)
            )
            d_elo = float(c_cfg["elo_k"]) * clamp(mov, 0.65, 1.85) * (s_h - exp_h)

            club_elo[ht] = h_elo + d_elo
            club_elo[at] = a_elo - d_elo
            a_tm = float(c_cfg["team_ewm_alpha"])
            club_att[ht] = (1.0 - a_tm) * h_att + a_tm * hs
            club_def[ht] = (1.0 - a_tm) * h_def + a_tm * as_
            club_att[at] = (1.0 - a_tm) * a_att + a_tm * as_
            club_def[at] = (1.0 - a_tm) * a_def + a_tm * hs
            club_g[ht] = h_n + 1
            club_g[at] = a_n + 1
            touched_clubs.add(ht)
            touched_clubs.add(at)

            day_lg_goals[lg] += hs + as_
            day_lg_cnt[lg] += 1

        for sl in touched_clubs:
            club_timeline[sl].append((
                cur_date,
                {
                    "elo": round(club_elo[sl], 6),
                    "att": round(club_att[sl], 6),
                    "def": round(club_def[sl], 6),
                    "games": int(club_g[sl]),
                },
            ))

        for lg, cnt in day_lg_cnt.items():
            conf = comps[lg]["confederation_group"]
            a_lg = float(conf_priors[conf]["league_ewm_alpha"])
            a_step = 1.0 - math.pow(1.0 - a_lg, cnt)
            lg_ewm[lg] = (1.0 - a_step) * lg_ewm[lg] + a_step * (day_lg_goals[lg] / float(cnt))
            lg_sum[lg] += day_lg_goals[lg]
            lg_n[lg] += cnt
            lg_env_timeline[lg].append((cur_date, round(_cur_lg_env(lg), 6)))

    return pre2025_priors, club_timeline, lg_env_timeline


def _lookup_soccer_state_strictly_before(
    slug: str,
    lg: str,
    kickoff_date: str,
    pre2025_priors: dict[str, tuple[float, float, float, int]],
    club_timeline: dict[str, list[tuple[str, dict[str, Any]]]],
    soc_art: dict[str, Any],
) -> tuple[float, float, float, int]:
    chosen = None
    for dt_str, st in club_timeline.get(slug, []):
        if dt_str < kickoff_date:
            chosen = st
        else:
            break
    if chosen is not None:
        return chosen["elo"], chosen["att"], chosen["def"], chosen["games"]
    if slug in pre2025_priors:
        e0, a0, d0, g0 = pre2025_priors[slug]
        return round(e0, 6), round(a0, 6), round(d0, 6), int(g0)
    hg0 = round(0.5 * float(soc_art["competitions"][lg]["pre2025_goal_prior"]), 6)
    return 1500.0, hg0, hg0, 0


def _lookup_league_env_strictly_before(
    lg: str,
    kickoff_date: str,
    lg_env_timeline: dict[str, list[tuple[str, float]]],
    soc_art: dict[str, Any],
) -> float:
    val = round(float(soc_art["competitions"][lg]["pre2025_goal_prior"]), 6)
    for dt_str, env_v in lg_env_timeline.get(lg, []):
        if dt_str < kickoff_date:
            val = env_v
        else:
            break
    return val


def _build_us_causal_inputs_by_game_id(
    pitch_data_dir: Path,
    ms_art: dict[str, Any],
) -> dict[str, dict[str, Any]]:
    """Replays `EXP_V60` causal walk-forward (`date' < date`) to capture pre-game inputs for US `FT` games."""
    bridge = json.loads(v60.BRIDGE_ARTIFACT_PATH.read_text(encoding="utf-8"))
    v40_state = json.loads((DATA_DIR / "multisport_v4_0_state_candidate.json").read_text(encoding="utf-8"))
    nfl_state = json.loads((DATA_DIR / "nfl_causal_state_v3_5.json").read_text(encoding="utf-8"))

    all_us = v60._load_us_season_matches_readonly(pitch_data_dir, bridge)
    _, nba_inj_entries = v60._load_nba_injuries_readonly(pitch_data_dir)

    priors_by_team: dict[str, dict[str, Any]] = {}
    for _, entry in v40_state["teams"].items():
        sp = entry["sport"]
        if sp in ("mlb", "nhl", "nba"):
            code = entry["team_key"]
            priors_by_team[f"{sp}::{code}"] = {
                "elevation_m": float(entry["elevation_m"]),
                "is_dome": bool(entry["is_dome"]),
                "metrics": dict(entry["metrics"]),
            }
    nfl_wf = ms_art["physics_config"]["nfl"]["walkforward"]
    for code, b_st in nfl_state["franchise_base_state"].items():
        reg_elo = 1500.0 + float(nfl_wf["offseason_elo_regression"]) * (float(b_st["elo"]) - 1500.0)
        p_off = clamp(float(nfl_wf["prior_team_pts"]) + 0.30 * float(b_st["ewm_off"]), 18.0, 28.5)
        p_def = clamp(float(nfl_wf["prior_team_pts"]) - 0.30 * float(b_st["ewm_def"]), 18.0, 28.5)
        priors_by_team[f"nfl::{code}"] = {
            "elevation_m": float(b_st.get("elevation_m", 150.0)),
            "is_dome": bool(float(b_st.get("is_indoor_home", 0.0)) >= 0.5),
            "metrics": {
                "regressed_elo_prior": round(reg_elo, 6),
                "prior_off_pts": round(p_off, 6),
                "prior_def_pts": round(p_def, 6),
            },
        }

    pregame_by_key: dict[str, dict[str, Any]] = {}
    for sport in US_LEAGUES:
        sp_games = [m for m in all_us if m["sport"] == sport]
        by_date: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for m in sp_games:
            by_date[m["date"]].append(m)

        wf_cfg = ms_art["physics_config"][sport]["walkforward"]
        elo_k = float(wf_cfg["elo_k"])
        elo_hfa = float(wf_cfg["elo_home_adv"])
        prior_env_val = float(
            wf_cfg.get("prior_team_runs")
            or wf_cfg.get("prior_team_goals")
            or wf_cfg.get("prior_team_pts")
        )
        kappa_env = float(wf_cfg["prior_env_team_games"])

        team_elo: dict[str, float] = {}
        for pk, pv in priors_by_team.items():
            if pk.startswith(f"{sport}::"):
                c_key = pk.split("::", 1)[1]
                team_elo[c_key] = (
                    float(pv["metrics"]["regressed_elo_prior"]) if sport == "nfl" else 1500.0
                )

        team_for: dict[str, float] = defaultdict(float)
        team_ag: dict[str, float] = defaultdict(float)
        team_n: dict[str, int] = defaultdict(int)
        team_dates: dict[str, list[str]] = defaultdict(list)
        lg_cum_pts = 0.0
        lg_cum_tg = 0

        for cur_date in sorted(by_date.keys()):
            day_games = by_date[cur_date]
            lg_env = (lg_cum_pts + kappa_env * prior_env_val) / (lg_cum_tg + kappa_env)

            for g in day_games:
                h_code = v60.resolve_franchise_code(sport, g["homeTeam"])
                a_code = v60.resolve_franchise_code(sport, g["awayTeam"])
                h_pr = priors_by_team[f"{sport}::{h_code}"]
                a_pr = priors_by_team[f"{sport}::{a_code}"]
                h_hist = team_dates[h_code]
                a_hist = team_dates[a_code]
                h_rest = v60.days_between(h_hist[-1], cur_date) if h_hist else None
                a_rest = v60.days_between(a_hist[-1], cur_date) if a_hist else None
                h_b2b = bool(h_rest == 1)
                a_b2b = bool(a_rest == 1)
                h_3in4 = bool(len(h_hist) >= 2 and v60.days_between(h_hist[-2], cur_date) <= 3)
                a_3in4 = bool(len(a_hist) >= 2 and v60.days_between(a_hist[-2], cur_date) <= 3)

                inp: dict[str, Any] = {
                    "home_elo": round(team_elo[h_code], 8),
                    "away_elo": round(team_elo[a_code], 8),
                    "home_cum_for": round(team_for[h_code], 8),
                    "home_cum_against": round(team_ag[h_code], 8),
                    "home_games": int(team_n[h_code]),
                    "away_cum_for": round(team_for[a_code], 8),
                    "away_cum_against": round(team_ag[a_code], 8),
                    "away_games": int(team_n[a_code]),
                    "league_team_scoring_env": round(lg_env, 8),
                    "home_b2b": h_b2b,
                    "away_b2b": a_b2b,
                    "home_3in4": h_3in4,
                    "away_3in4": a_3in4,
                    "neutral_site": bool(g["neutralSite"]),
                    "home_elevation_m": h_pr["elevation_m"],
                    "home_is_dome": h_pr["is_dome"],
                }
                if sport == "mlb":
                    inp.update({
                        "home_prior_woba": h_pr["metrics"]["woba"],
                        "away_prior_woba": a_pr["metrics"]["woba"],
                        "home_prior_fip": h_pr["metrics"]["fip"],
                        "away_prior_fip": a_pr["metrics"]["fip"],
                        "home_prior_era": h_pr["metrics"]["era"],
                        "away_prior_era": a_pr["metrics"]["era"],
                        "total_line": 8.5,
                    })
                elif sport == "nhl":
                    inp.update({
                        "home_prior_xgf_5v5": h_pr["metrics"]["xgf_5v5"],
                        "home_prior_xga_5v5": h_pr["metrics"]["xga_5v5"],
                        "away_prior_xgf_5v5": a_pr["metrics"]["xgf_5v5"],
                        "away_prior_xga_5v5": a_pr["metrics"]["xga_5v5"],
                        "home_goalie_sv_pct": h_pr["metrics"]["sv_pct"],
                        "away_goalie_sv_pct": a_pr["metrics"]["sv_pct"],
                        "home_goalie_confirmed": False,
                        "away_goalie_confirmed": False,
                        "total_line": 6.0,
                    })
                elif sport == "nba":
                    ho, hq = v60._count_causal_nba_injuries(nba_inj_entries, h_code, cur_date, True)
                    ao, aq = v60._count_causal_nba_injuries(nba_inj_entries, a_code, cur_date, True)
                    inp.update({
                        "home_prior_ortg": h_pr["metrics"]["ortg"],
                        "home_prior_drtg": h_pr["metrics"]["drtg"],
                        "home_prior_pace": h_pr["metrics"]["pace"],
                        "away_prior_ortg": a_pr["metrics"]["ortg"],
                        "away_prior_drtg": a_pr["metrics"]["drtg"],
                        "away_prior_pace": a_pr["metrics"]["pace"],
                        "home_injuries_out": ho,
                        "away_injuries_out": ao,
                        "home_injuries_questionable": hq,
                        "away_injuries_questionable": aq,
                        "spread_line_home": -2.5,
                        "total_line": 227.5,
                    })
                else:
                    inp.update({
                        "home_prior_off_pts": h_pr["metrics"]["prior_off_pts"],
                        "home_prior_def_pts": h_pr["metrics"]["prior_def_pts"],
                        "away_prior_off_pts": a_pr["metrics"]["prior_off_pts"],
                        "away_prior_def_pts": a_pr["metrics"]["prior_def_pts"],
                        "home_rest_days": h_rest,
                        "away_rest_days": a_rest,
                        "is_indoor": h_pr["is_dome"],
                        "is_turf": h_pr["is_dome"],
                        "spread_line_home": -3.0,
                        "total_line": 45.5,
                    })

                pregame_by_key[str(g["id"])] = inp
                pregame_by_key[f"{sport}:{cur_date}:{h_code}:{a_code}"] = inp

            for g in day_games:
                h_code = v60.resolve_franchise_code(sport, g["homeTeam"])
                a_code = v60.resolve_franchise_code(sport, g["awayTeam"])
                hs, as_ = int(g["homeScore"]), int(g["awayScore"])
                margin = hs - as_
                elo_diff = team_elo[h_code] - team_elo[a_code] + (0.0 if g["neutralSite"] else elo_hfa)
                p_exp = 1.0 / (1.0 + math.pow(10.0, -elo_diff / 400.0))
                s_obs = 1.0 if margin > 0 else (0.0 if margin < 0 else 0.5)
                mov = 1.0 + min(0.65, 0.08 * math.log1p(abs(margin)))
                d_elo = elo_k * mov * (s_obs - p_exp)
                team_elo[h_code] += d_elo
                team_elo[a_code] -= d_elo
                team_for[h_code] += float(hs)
                team_ag[h_code] += float(as_)
                team_n[h_code] += 1
                team_dates[h_code].append(cur_date)
                team_for[a_code] += float(as_)
                team_ag[a_code] += float(hs)
                team_n[a_code] += 1
                team_dates[a_code].append(cur_date)
                lg_cum_pts += float(hs + as_)
                lg_cum_tg += 2

    return pregame_by_key


def _load_squad_featured_lookups(
    snapshots_dir: Path,
) -> tuple[dict[tuple[str, str], dict[str, Any]], dict[tuple[str, str], dict[str, Any]], dict[tuple[str, str], dict[str, Any]]]:
    """Indexes eligible (non-injured, minutes-guarded) featured outfield, GK, and US player profiles."""
    inj_lookup: dict[tuple[str, str], str] = {}
    for lg_dir in sorted(snapshots_dir.iterdir()):
        if not lg_dir.is_dir():
            continue
        inj_f = lg_dir / "injuries.json"
        if inj_f.exists():
            raw = json.loads(inj_f.read_text(encoding="utf-8"))
            for e in raw.get("entries") or []:
                pk = v59._norm_player_key(e.get("player"))
                if pk:
                    inj_lookup[(lg_dir.name, pk)] = str(e.get("status") or "")

    fb_field_by_team: dict[tuple[str, str], dict[str, Any]] = {}
    fb_gk_by_team: dict[tuple[str, str], dict[str, Any]] = {}
    us_prop_by_team: dict[tuple[str, str], dict[str, Any]] = {}

    for lg_dir in sorted(snapshots_dir.iterdir()):
        if not lg_dir.is_dir():
            continue
        lname = lg_dir.name
        sq_f = lg_dir / "squads.json"
        if not sq_f.exists():
            continue
        sq = json.loads(sq_f.read_text(encoding="utf-8"))

        if lname not in US_LEAGUES:
            for t in sq.get("teams") or []:
                tid = str(t.get("teamId") or "")
                best_fp: tuple[int, dict[str, Any]] | None = None
                best_gk: tuple[int, dict[str, Any]] | None = None
                for p in t.get("players") or []:
                    nm = str(p.get("name") or "").strip()
                    if not nm:
                        continue
                    avail = p.get("availability")
                    inj_st = inj_lookup.get((lname, v59._norm_player_key(nm)))
                    if v59.is_hard_blocked_availability_v6(avail, inj_st):
                        continue
                    st = p.get("stats") or {}
                    apps = int(st.get("appearances") or 0)
                    subs = min(int(st.get("subIns") or 0), apps)
                    pos_grp = str(p.get("positionGroup") or "MID")
                    if apps < 4:
                        continue
                    if pos_grp == "GK":
                        sv = int(st.get("saves") or 0)
                        gc = int(st.get("goalsConceded") or 0)
                        sf = int(st.get("shotsFaced") or 0)
                        if (sv + gc) > 0:
                            cand_gk = {
                                "playerName": nm,
                                "saves": sv,
                                "shotsFaced": sf if sf >= sv else (sv + gc),
                                "goalsConceded": gc,
                                "appearances": apps,
                                "subIns": subs,
                                "availability": "available",
                                "injuryStatus": None,
                            }
                            if best_gk is None or apps > best_gk[0]:
                                best_gk = (apps, cand_gk)
                    else:
                        sh = int(st.get("shots") or 0)
                        sot = int(st.get("shotsOnTarget") or 0)
                        if sh >= 3 and pos_grp in ("FWD", "MID", "FW_CF", "FW_W", "MF_AM", "MF_CM"):
                            cand_fp = {
                                "playerName": nm,
                                "positionGroup": pos_grp,
                                "seasonShots": sh,
                                "seasonSoT": min(sh, sot),
                                "appearances": apps,
                                "subIns": subs,
                                "availability": "available",
                                "injuryStatus": None,
                            }
                            if best_fp is None or sh > best_fp[0]:
                                best_fp = (sh, cand_fp)
                if best_fp is not None:
                    fb_field_by_team[(lname, tid)] = best_fp[1]
                if best_gk is not None:
                    fb_gk_by_team[(lname, tid)] = best_gk[1]
        else:
            for t in sq.get("teams") or []:
                tid = str(t.get("teamId") or "")
                for p in t.get("players") or []:
                    nm = str(p.get("name") or "").strip()
                    if not nm:
                        continue
                    avail = p.get("availability")
                    inj_st = inj_lookup.get((lname, v59._norm_player_key(nm)))
                    if v59.is_hard_blocked_availability_v6(avail, inj_st):
                        continue
                    sm_map = v59.normalize_us_player_game_log_columns_v6(
                        sport=lname,
                        columns=p.get("seasonMetrics") or [],
                        enforce_minutes_guard=False,
                    )["metrics"]
                    gp = float(sm_map.get("GP") or 0.0)
                    if gp < 4.0:
                        continue
                    pos_lbl = str(p.get("positionLabel") or "")
                    if lname == "nba":
                        min_pg = sm_map.get("MIN")
                        pts_pg = sm_map.get("PTS")
                        if min_pg is not None and min_pg >= 24.0 and pts_pg is not None and pts_pg >= 12.0:
                            us_prop_by_team[(lname, tid)] = {
                                "playerName": nm,
                                "positionLabel": pos_lbl,
                                "metric": "PTS",
                                "sampleSum": round(pts_pg * gp, 4),
                                "sampleGames": gp,
                                "line": 19.5,
                                "prematchMinutes": round(min_pg, 4),
                                "sampleVariance": None,
                                "availability": "available",
                                "injuryStatus": None,
                            }
                            break
                    elif lname == "mlb":
                        so_tot = sm_map.get("SO")
                        h_tot = sm_map.get("H")
                        if pos_lbl == "SP" and so_tot is not None and so_tot >= 20.0:
                            us_prop_by_team[(lname, tid)] = {
                                "playerName": nm,
                                "positionLabel": "SP",
                                "metric": "SO",
                                "sampleSum": round(so_tot, 4),
                                "sampleGames": gp,
                                "line": 5.5,
                                "prematchMinutes": None,
                                "sampleVariance": None,
                                "availability": "available",
                                "injuryStatus": None,
                            }
                            break
                        if pos_lbl != "SP" and h_tot is not None and h_tot >= 25.0:
                            us_prop_by_team[(lname, tid)] = {
                                "playerName": nm,
                                "positionLabel": "BAT",
                                "metric": "H",
                                "sampleSum": round(h_tot, 4),
                                "sampleGames": gp,
                                "line": 0.5,
                                "prematchMinutes": None,
                                "sampleVariance": None,
                                "availability": "available",
                                "injuryStatus": None,
                            }
                            break
                    elif lname == "nhl":
                        sog_tot = sm_map.get("SOG")
                        if pos_lbl != "G" and sog_tot is not None and sog_tot >= 15.0:
                            us_prop_by_team[(lname, tid)] = {
                                "playerName": nm,
                                "positionLabel": pos_lbl or "FWD",
                                "metric": "SOG",
                                "sampleSum": round(sog_tot, 4),
                                "sampleGames": gp,
                                "line": 2.5,
                                "prematchMinutes": None,
                                "sampleVariance": None,
                                "availability": "available",
                                "injuryStatus": None,
                            }
                            break
                    elif lname == "nfl":
                        yds_tot = sm_map.get("YDS")
                        if pos_lbl in ("QB", "WR", "RB") and yds_tot is not None and yds_tot >= 200.0:
                            us_prop_by_team[(lname, tid)] = {
                                "playerName": nm,
                                "positionLabel": pos_lbl,
                                "metric": "YDS",
                                "sampleSum": round(yds_tot, 4),
                                "sampleGames": gp,
                                "line": 225.5 if pos_lbl == "QB" else 58.5,
                                "prematchMinutes": None,
                                "sampleVariance": None,
                                "availability": "available",
                                "injuryStatus": None,
                            }
                            break

    return fb_field_by_team, fb_gk_by_team, us_prop_by_team


def main() -> None:
    sha_v3_before = hashlib.sha256(FROZEN_V3_SNAPSHOT.read_bytes()).hexdigest()
    sha_v5_before = hashlib.sha256(FROZEN_V5_SNAPSHOT.read_bytes()).hexdigest()

    soc_art = json.loads((DATA_DIR / "model_soccer_57_v6_0_candidate.json").read_text(encoding="utf-8"))
    props_art = json.loads((DATA_DIR / "model_props_v6_0_candidate.json").read_text(encoding="utf-8"))
    ms_art = json.loads((DATA_DIR / "model_multisport_v6_0_candidate.json").read_text(encoding="utf-8"))
    off_art = json.loads((DATA_DIR / "model_officials_freeze_v6_0_candidate.json").read_text(encoding="utf-8"))
    ep_art = json.loads((DATA_DIR / "model_epistemic_conformal_v5_1_candidate.json").read_text(encoding="utf-8"))
    inplay_art = json.loads((DATA_DIR / "model_inplay_early_payout_v5_0_candidate.json").read_text(encoding="utf-8"))

    artifacts_bundle = {
        "soccer57ArtifactV6": soc_art,
        "propsArtifactV6": props_art,
        "multisportArtifactV6": ms_art,
        "officialsArtifactV6": off_art,
        "epistemicArtifactV51": ep_art,
        "inplayArtifactV5": inplay_art,
    }

    snapshots_dir = DEFAULT_PITCH_DATA_DIR / "snapshots"
    pre2025_priors, club_timeline, lg_env_timeline = _build_football_causal_snapshots_by_date(
        DEFAULT_PITCH_DATA_DIR, soc_art
    )
    us_pregame_by_key = _build_us_causal_inputs_by_game_id(DEFAULT_PITCH_DATA_DIR, ms_art)
    fb_field_by_team, fb_gk_by_team, us_prop_by_team = _load_squad_featured_lookups(snapshots_dir)

    all_league_dirs = sorted(d.name for d in snapshots_dir.iterdir() if d.is_dir())
    assert len(all_league_dirs) == 57, f"Expected 57 snapshot leagues, got {len(all_league_dirs)}"

    canonical_inputs: list[dict[str, Any]] = []

    for lg in all_league_dirs:
        latest_obj = json.loads((snapshots_dir / lg / "latest.json").read_text(encoding="utf-8"))
        games = list(latest_obj.get("games") or [])
        analyses_map = latest_obj.get("analyses") or {}
        snap_updated_utc = str(latest_obj.get("updatedAt") or "2026-11-19T00:00:00.000Z")

        if lg not in US_LEAGUES:
            sched = [
                g
                for g in games
                if str(g.get("status", "")).lower() in ("scheduled", "ns", "not_started", "pre", "upcoming")
            ]
            sched.sort(key=lambda g: (str(g.get("startTime") or ""), str(g.get("id") or "")))
            non_sched = [
                g
                for g in games
                if str(g.get("status", "")).lower() not in ("scheduled", "ns", "not_started", "pre", "upcoming")
            ]
            non_sched.sort(
                key=lambda g: (str(g.get("startTime") or ""), str(g.get("id") or "")), reverse=True
            )
            picked = (sched + non_sched)[:3]

            for g in picked:
                gid = str(g["id"])
                ko_raw = str(g["startTime"])
                ko_ms = v61.parse_iso_utc_epoch_ms(ko_raw)
                assert ko_ms is not None
                ko_utc = v61.format_epoch_ms_utc(ko_ms)
                ko_date = ko_utc[:10]

                h_obj = g["home"]
                a_obj = g["away"]
                h_tid = str(h_obj.get("id") or "")
                a_tid = str(a_obj.get("id") or "")
                h_slug = v58._norm_slug(h_tid or h_obj.get("name"))
                a_slug = v58._norm_slug(a_tid or a_obj.get("name"))
                h_disp, a_disp = _sanitize_team_display_name(
                    str(h_obj.get("name") or h_slug),
                    str(a_obj.get("name") or a_slug),
                    str(h_obj.get("code") or ""),
                    str(a_obj.get("code") or ""),
                )

                h_elo, h_att, h_def, h_g = _lookup_soccer_state_strictly_before(
                    h_slug, lg, ko_date, pre2025_priors, club_timeline, soc_art
                )
                a_elo, a_att, a_def, a_g = _lookup_soccer_state_strictly_before(
                    a_slug, lg, ko_date, pre2025_priors, club_timeline, soc_art
                )
                lg_env = _lookup_league_env_strictly_before(lg, ko_date, lg_env_timeline, soc_art)

                an = analyses_map.get(gid)
                an_iao_raw = str(an.get("inputsAsOf") or snap_updated_utc) if an else None
                an_iao_ms = v61.parse_iso_utc_epoch_ms(an_iao_raw) if an_iao_raw else None

                causal_iao_ms = ko_ms - 3_600_000
                if an_iao_ms is not None and an_iao_ms <= ko_ms:
                    causal_iao_ms = an_iao_ms
                causal_iao_utc = v61.format_epoch_ms_utc(causal_iao_ms)

                mode = "causal_team_state"
                raw_proj_h = None
                raw_proj_a = None
                raw_x12 = None
                raw_upstream = None

                if an is not None and an_iao_ms is not None:
                    proj_d = an.get("projection") or {}
                    x12_l = an.get("x12") or []
                    if (
                        an_iao_ms <= ko_ms
                        and isinstance(proj_d.get("home"), (int, float))
                        and isinstance(proj_d.get("away"), (int, float))
                        and len(x12_l) == 3
                    ):
                        mode = "prekickoff_recalibration"
                        raw_proj_h = round(float(proj_d["home"]), 8)
                        raw_proj_a = round(float(proj_d["away"]), 8)
                        raw_x12 = [round(float(x12_l[0]), 8), round(float(x12_l[1]), 8), round(float(x12_l[2]), 8)]
                    elif an_iao_ms > ko_ms and len(x12_l) == 3:
                        raw_upstream = {
                            "inputsAsOfUtc": v61.format_epoch_ms_utc(an_iao_ms),
                            "probabilities": {
                                "pHome": quantize_for_seal_v6(float(x12_l[0])),
                                "pDraw": quantize_for_seal_v6(float(x12_l[1])),
                                "pAway": quantize_for_seal_v6(float(x12_l[2])),
                            },
                            "projection": {
                                "home": quantize_for_seal_v6(float(proj_d.get("home") or 1.3)),
                                "away": quantize_for_seal_v6(float(proj_d.get("away") or 1.1)),
                            },
                        }

                fp_cand = None
                if (lg, h_tid) in fb_field_by_team:
                    fp_cand = {"side": "home", **fb_field_by_team[(lg, h_tid)]}
                elif (lg, a_tid) in fb_field_by_team:
                    fp_cand = {"side": "away", **fb_field_by_team[(lg, a_tid)]}

                gk_cand = None
                if (lg, h_tid) in fb_gk_by_team:
                    gk_cand = {"side": "home", **fb_gk_by_team[(lg, h_tid)]}
                elif (lg, a_tid) in fb_gk_by_team:
                    gk_cand = {"side": "away", **fb_gk_by_team[(lg, a_tid)]}

                canonical_inputs.append({
                    "matchId": gid,
                    "sport": "soccer",
                    "league": lg,
                    "homeTeam": h_disp,
                    "awayTeam": a_disp,
                    "homeSlug": h_slug,
                    "awaySlug": a_slug,
                    "kickoffUtc": ko_utc,
                    "lifecycleStatus": str(g.get("status") or "scheduled"),
                    "neutralSite": bool(g.get("neutralSite", False)),
                    "refereeName": g.get("referee"),
                    "causalInputsAsOfUtc": causal_iao_utc,
                    "rawUpstreamAnalysis": raw_upstream,
                    "existingSealedRecord": None,
                    "soccerInput": {
                        "mode": mode,
                        "homeElo": h_elo,
                        "awayElo": a_elo,
                        "homeAttEwm": h_att,
                        "homeDefEwm": h_def,
                        "homeGames": h_g,
                        "awayAttEwm": a_att,
                        "awayDefEwm": a_def,
                        "awayGames": a_g,
                        "leagueEnvGoals": lg_env,
                        "seasonProgress": 0.45,
                        "rawProjHome": raw_proj_h,
                        "rawProjAway": raw_proj_a,
                        "rawX12": raw_x12,
                        "featuredFieldPlayer": fp_cand,
                        "featuredGoalkeeper": gk_cand,
                    },
                    "usSportInput": None,
                })
        else:
            sched = [
                g
                for g in games
                if str(g.get("status", "")).lower() in ("scheduled", "ns", "not_started", "pre", "upcoming")
            ]
            sched.sort(key=lambda g: (str(g.get("startTime") or ""), str(g.get("id") or "")))
            ft_games = [
                g
                for g in games
                if str(g.get("status", "")).lower() in ("final", "ft", "finished", "completed")
            ]
            ft_games.sort(key=lambda g: (str(g.get("startTime") or ""), str(g.get("id") or "")), reverse=True)

            picked_us = sched[:16] + ft_games[:2]
            for g in picked_us:
                gid = str(g["id"])
                ko_raw = str(g["startTime"])
                ko_ms = v61.parse_iso_utc_epoch_ms(ko_raw)
                assert ko_ms is not None
                ko_utc = v61.format_epoch_ms_utc(ko_ms)
                ko_date = ko_utc[:10]

                h_obj = g["home"]
                a_obj = g["away"]
                h_tid = str(h_obj.get("id") or "")
                a_tid = str(a_obj.get("id") or "")
                h_code = v60.resolve_franchise_code(lg, h_tid)
                a_code = v60.resolve_franchise_code(lg, a_tid)
                h_disp, a_disp = _sanitize_team_display_name(
                    str(h_obj.get("name") or h_code),
                    str(a_obj.get("name") or a_code),
                    str(h_obj.get("code") or h_code),
                    str(a_obj.get("code") or a_code),
                )

                st_low = str(g.get("status") or "scheduled").lower()
                is_sched = st_low in ("scheduled", "ns", "not_started", "pre", "upcoming")

                an = analyses_map.get(gid)
                an_iao_raw = str(an.get("inputsAsOf") or snap_updated_utc) if an else None
                an_iao_ms = v61.parse_iso_utc_epoch_ms(an_iao_raw) if an_iao_raw else None
                causal_iao_ms = (
                    an_iao_ms if (an_iao_ms is not None and an_iao_ms <= ko_ms) else (ko_ms - 3_600_000)
                )
                causal_iao_utc = v61.format_epoch_ms_utc(causal_iao_ms)

                raw_upstream = None
                if an is not None and an_iao_ms is not None and an_iao_ms > ko_ms:
                    x12_l = an.get("x12") or [0.5, 0.0, 0.5]
                    proj_d = an.get("projection") or {}
                    raw_upstream = {
                        "inputsAsOfUtc": v61.format_epoch_ms_utc(an_iao_ms),
                        "probabilities": {
                            "pHome": quantize_for_seal_v6(float(x12_l[0])),
                            "pDraw": None,
                            "pAway": quantize_for_seal_v6(float(x12_l[-1])),
                        },
                        "projection": {
                            "home": quantize_for_seal_v6(float(proj_d.get("home") or 4.0)),
                            "away": quantize_for_seal_v6(float(proj_d.get("away") or 4.0)),
                        },
                    }

                us_mode = "post_walkforward_state" if is_sched else "causal_walkforward_input"
                causal_wf_inp = None
                if not is_sched:
                    causal_wf_inp = (
                        us_pregame_by_key.get(gid)
                        or us_pregame_by_key.get(f"{lg}:{ko_date}:{h_code}:{a_code}")
                    )
                    if causal_wf_inp is None:
                        us_mode = "post_walkforward_state"

                up_cand = None
                if (lg, h_tid) in us_prop_by_team:
                    up_cand = {"side": "home", **us_prop_by_team[(lg, h_tid)]}
                elif (lg, a_tid) in us_prop_by_team:
                    up_cand = {"side": "away", **us_prop_by_team[(lg, a_tid)]}

                eff_g = 60 if lg == "mlb" else (14 if lg == "nfl" else 24)
                canonical_inputs.append({
                    "matchId": gid,
                    "sport": lg,
                    "league": lg,
                    "homeTeam": h_disp,
                    "awayTeam": a_disp,
                    "homeSlug": h_tid,
                    "awaySlug": a_tid,
                    "kickoffUtc": ko_utc,
                    "lifecycleStatus": str(g.get("status") or "scheduled"),
                    "neutralSite": bool(g.get("neutralSite", False)),
                    "refereeName": g.get("referee"),
                    "causalInputsAsOfUtc": causal_iao_utc,
                    "rawUpstreamAnalysis": raw_upstream,
                    "existingSealedRecord": None,
                    "soccerInput": None,
                    "usSportInput": {
                        "mode": us_mode,
                        "gameDate": ko_date,
                        "totalLine": None,
                        "spreadLineHome": None,
                        "effectiveSampleGames": eff_g,
                        "seasonProgress": 0.45,
                        "mlbCausalInput": causal_wf_inp if lg == "mlb" else None,
                        "nhlCausalInput": causal_wf_inp if lg == "nhl" else None,
                        "nbaCausalInput": causal_wf_inp if lg == "nba" else None,
                        "nflCausalInput": causal_wf_inp if lg == "nfl" else None,
                        "featuredUsPlayerProp": up_cand,
                    },
                })

    t0 = time.perf_counter()
    entries_out: list[dict[str, Any]] = []
    counts_by_league: dict[str, int] = defaultdict(int)
    counts_by_sport: dict[str, int] = defaultdict(int)
    quality_counts: dict[str, int] = {"ok": 0, "partial_coverage": 0, "fallback_prior": 0}

    max_cone_err = 0.0
    max_total_err = 0.0
    n_ep_violations = 0
    n_band_violations = 0
    n_guardrail_failures = 0
    n_contaminated_accepted = 0
    n_contaminated_rejected = 0
    n_ft_recovered = 0
    n_with_field_props = 0
    n_with_gk_props = 0
    n_with_us_props = 0

    for c_inp in canonical_inputs:
        out = build_unified_match_intelligence_v6_py(c_inp, artifacts_bundle)
        entries_out.append({
            "canonicalInput": c_inp,
            "outlook": out,
        })
        counts_by_league[out["league"]] += 1
        counts_by_sport[out["sport"]] += 1
        quality_counts[out["dataQuality"]["flag"]] += 1

        if out["soccerV6"] is not None:
            max_cone_err = max(max_cone_err, float(out["soccerV6"]["coneError1x2"]))
            max_total_err = max(max_total_err, float(out["soccerV6"]["totalImpliedError"]))

        ph = out["coreProbabilities"]["pHome"]
        pa = out["coreProbabilities"]["pAway"]
        if (
            out["earlyPayout"]["pHomeEarlyPayoutWin"] + 1e-12 < ph
            or out["earlyPayout"]["pAwayEarlyPayoutWin"] + 1e-12 < pa
        ):
            n_ep_violations += 1

        hb = out["epistemicUncertainty90"]["homeBand90"]
        ab = out["epistemicUncertainty90"]["awayBand90"]
        if not (0.0 < hb["pLower90"] <= hb["pPoint"] + 1e-12 and hb["pPoint"] <= hb["pUpper90"] + 1e-12 and hb["pUpper90"] < 1.0):
            n_band_violations += 1
        if not (0.0 < ab["pLower90"] <= ab["pPoint"] + 1e-12 and ab["pPoint"] <= ab["pUpper90"] + 1e-12 and ab["pUpper90"] < 1.0):
            n_band_violations += 1

        if not out["guardrailAudit"]["passed"]:
            n_guardrail_failures += 1

        ps = out["preKickoffSeal"]
        iao_ms = v61.parse_iso_utc_epoch_ms(ps["inputsAsOfUtc"])
        ko_ms = v61.parse_iso_utc_epoch_ms(ps["kickoffUtc"])
        if iao_ms is None or ko_ms is None or iao_ms > ko_ms:
            n_contaminated_accepted += 1
        if ps["incomingContaminatedRejected"]:
            n_contaminated_rejected += 1
        if out["lifecycleStatus"] == "FT" and ps["hasForecast"]:
            n_ft_recovered += 1

        fp_b = out["featuredPropsV6"]
        if fp_b["fieldPlayerShots"] is not None:
            n_with_field_props += 1
        if fp_b["goalkeeperSaves"] is not None:
            n_with_gk_props += 1
        if fp_b["usPlayerProp"] is not None:
            n_with_us_props += 1

    elapsed_ms = (time.perf_counter() - t0) * 1000.0
    avg_ms = elapsed_ms / max(len(entries_out), 1)

    assert len(counts_by_league) == 57, f"Expected 57/57 leagues covered, got {len(counts_by_league)}"
    assert max_cone_err < 1e-12, f"1X2 cone error >= 1e-12: {max_cone_err}"
    assert max_total_err < 1e-12, f"Total implied error >= 1e-12: {max_total_err}"
    assert n_ep_violations == 0, f"Early Payout violations detected: {n_ep_violations}"
    assert n_band_violations == 0, f"Epistemic band violations detected: {n_band_violations}"
    assert n_guardrail_failures == 0, f"Guardrail failures detected: {n_guardrail_failures}"
    assert n_contaminated_accepted == 0, f"Post-kickoff contaminated seals accepted: {n_contaminated_accepted}"

    seal_chain = [[row["outlook"]["matchId"], row["outlook"]["preKickoffSeal"]["preKickoffSealSha256"]] for row in entries_out]
    snapshot_ledger_sha256 = hashlib.sha256(
        json.dumps(seal_chain, separators=(",", ":")).encode("utf-8")
    ).hexdigest()

    gen_utc = datetime.now(timezone.utc).isoformat(timespec="seconds")
    snapshot_payload = {
        "schema_version": SNAPSHOT_V6_SCHEMA_VERSION,
        "outlook_schema_version": UNIFIED_OUTLOOK_V6_SCHEMA_VERSION,
        "suite_codename": "PitchLab Spacetime v6.0 Unified 57-League Candidate Suite",
        "status": "candidate",
        "production_activated": False,
        "holdout_cut_utc": "2025-02-02T17:30:00Z",
        "holdout_sealed_untouched": True,
        "generated_at_utc": gen_utc,
        "n_leagues_covered": len(counts_by_league),
        "n_soccer_leagues_covered": sum(1 for k in counts_by_league if k not in US_LEAGUES),
        "n_us_leagues_covered": sum(1 for k in counts_by_league if k in US_LEAGUES),
        "n_matchups": len(entries_out),
        "counts_by_sport": dict(sorted(counts_by_sport.items())),
        "counts_by_league": dict(sorted(counts_by_league.items())),
        "data_quality_counts": quality_counts,
        "python_total_latency_ms": round(elapsed_ms, 3),
        "python_avg_latency_ms": round(avg_ms, 4),
        "snapshot_seal_ledger_sha256": snapshot_ledger_sha256,
        "invariants_audit": {
            "early_payout_dominance_violations": n_ep_violations,
            "epistemic_band_violations": n_band_violations,
            "guardrail_audit_failures": n_guardrail_failures,
            "max_soccer_1x2_cone_error": max_cone_err,
            "max_soccer_total_implied_error": max_total_err,
            "post_kickoff_contaminated_accepted": n_contaminated_accepted,
            "post_kickoff_contaminated_rejected_and_backfilled": n_contaminated_rejected,
            "ft_matches_with_preserved_prekickoff_forecast": n_ft_recovered,
            "matches_with_featured_field_player_props": n_with_field_props,
            "matches_with_featured_goalkeeper_saves_sgp": n_with_gk_props,
            "matches_with_featured_us_player_props": n_with_us_props,
            "forbidden_keys_count": 0,
        },
        "entries": entries_out,
    }
    _assert_zero_forbidden_keys(snapshot_payload)

    CANDIDATE_V6_SNAPSHOT_OUT.parent.mkdir(parents=True, exist_ok=True)
    snap_bytes = (json.dumps(snapshot_payload, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    CANDIDATE_V6_SNAPSHOT_OUT.write_bytes(snap_bytes)
    snap_sha256 = hashlib.sha256(snap_bytes).hexdigest()

    results_payload = {
        "experiment_id": "EXP_V62_unified_v6_0",
        "codename": "PitchLab UnifiedMatchIntelligenceV6 Hub & 57-League Candidate Snapshot",
        "version": "6.0.0-candidate",
        "status": "candidate",
        "production_activated": False,
        "holdout_cut_utc": "2025-02-02T17:30:00Z",
        "holdout_sealed_untouched": True,
        "generated_at_utc": gen_utc,
        "snapshot_artifact": {
            "path": "src/data/prediction/live_matchday_v6_candidate_snapshot.json",
            "sha256": snap_sha256,
            "size_bytes": len(snap_bytes),
            "snapshot_seal_ledger_sha256": snapshot_ledger_sha256,
        },
        "coverage_summary": {
            "total_leagues_covered": len(counts_by_league),
            "soccer_leagues_covered": sum(1 for k in counts_by_league if k not in US_LEAGUES),
            "us_leagues_covered": sum(1 for k in counts_by_league if k in US_LEAGUES),
            "total_matchups": len(entries_out),
            "counts_by_sport": dict(sorted(counts_by_sport.items())),
            "counts_by_league": dict(sorted(counts_by_league.items())),
            "data_quality_counts": quality_counts,
        },
        "invariants_and_governance": snapshot_payload["invariants_audit"],
        "performance": {
            "python_total_latency_ms": round(elapsed_ms, 3),
            "python_avg_latency_ms": round(avg_ms, 4),
        },
    }
    _assert_zero_forbidden_keys(results_payload)

    EXP_V62_RESULTS_OUT.parent.mkdir(parents=True, exist_ok=True)
    res_bytes = (json.dumps(results_payload, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    EXP_V62_RESULTS_OUT.write_bytes(res_bytes)

    sha_v3_after = hashlib.sha256(FROZEN_V3_SNAPSHOT.read_bytes()).hexdigest()
    sha_v5_after = hashlib.sha256(FROZEN_V5_SNAPSHOT.read_bytes()).hexdigest()
    assert sha_v3_before == sha_v3_after, "Frozen v3 snapshot modified!"
    assert sha_v5_before == sha_v5_after, "Frozen v5 snapshot modified!"

    print(
        f"[EXP_V62] Snapshot v6.0 generado: {len(entries_out)} partidos en {len(counts_by_league)}/57 ligas "
        f"(cone={max_cone_err:.2e}, ep_viol={n_ep_violations}, guardrail_fail={n_guardrail_failures}, "
        f"avg={avg_ms:.3f} ms, sha256={snap_sha256[:16]}...)"
    )


if __name__ == "__main__":
    main()
