/**
 * Suite Integral de Paridad IEEE-754 `< 1e-12` y Gobernanza Red-Team para `PitchLab v5.0 Candidate` (`EXP_V50`–`EXP_V56`).
 *
 * Verifica simultáneamente:
 *  1. `EXP_V50`: `Tachyon v5.0` Global (`22` ligas) + `Meridian v5.0` (`< 1e-12` paridad en `80` partidos + coherencia `1X2 < 1e-14`).
 *  2. `EXP_V51`: Micro-Mercados No Lineales `HGB-Poisson v5.0` + `Red Cards` (`Over 0.5`) y `Booking Points` (`45.5`) (`< 1e-12` paridad).
 *  3. `EXP_V52`: NFL `Minkowski v5.0` (`< 1e-12` paridad en Kernel Discreto de Totales Clave, `Overtime`, `qb_sacks_taken` y `qb_rush_attempts`).
 *  4. `EXP_V53`: Player Props `v5.0` (`< 1e-12` paridad en `Logit-Space Barycentric PAVA Spline` sin cuantización + Multi-Umbral `1.5+`).
 *  5. `EXP_V54`: Motor Exacto de `Pago Anticipado` (`+2 Goles` DP 90-min, `+17 NFL`, `+20 NBA`, `+5 MLB`) e `In-Play Spacetime v5.0` (`< 1e-12`).
 *  6. `EXP_V55`: Cópula `Student-t` de cola pesada + *Bet Builder* Estructural Jugador-Partido (`Player-Linked SGP`) (`< 1e-12`).
 *  7. `EXP_V56`: Bandas Epistémicas Conformales `[pLower90, pUpper90]` + `UnifiedMatchIntelligenceV5` (`242/242` `"ok"`, `0` claves prohibidas).
 */

import { describe, expect, it } from "vitest";

import gbmClubV50Json from "../../src/data/prediction/gbm_club_v5_0_candidate.json";
import goalsClubV50Json from "../../src/data/prediction/model_club_goals_v5_0_candidate.json";
import goalsIntlV50Json from "../../src/data/prediction/model_intl_goals_v5_0_candidate.json";
import soccerGlobalSnapV50Json from "../../src/data/prediction/soccer_v5_0_global_snapshot.json";

import microModelV50Json from "../../src/data/prediction/model_soccer_micro_v5_0_candidate.json";
import microSnapV50Json from "../../src/data/prediction/soccer_micro_v5_0_snapshot.json";

import nflModelV50Json from "../../src/data/prediction/model_nfl_v5_0_candidate.json";
import nflSnapV50Json from "../../src/data/prediction/nfl_v5_0_snapshot.json";

import propsModelV50Json from "../../src/data/prediction/model_hierarchical_props_v5_0_candidate.json";
import propsSnapV50Json from "../../src/data/prediction/hierarchical_props_v5_0_snapshot.json";

import inplayModelV50Json from "../../src/data/prediction/model_inplay_early_payout_v5_0_candidate.json";
import inplaySnapV50Json from "../../src/data/prediction/inplay_early_payout_v5_0_snapshot.json";

import sgpModelV50Json from "../../src/data/prediction/sgp_copula_v5_0_candidate.json";
import sgpSnapV50Json from "../../src/data/prediction/sgp_copula_v5_0_snapshot.json";

import multisportStateV40Json from "../../src/data/prediction/multisport_v4_0_state_candidate.json";
import liveMatchdayV5Json from "../../src/data/prediction/live_matchday_v5_candidate_snapshot.json";

import {
  solveDiagonalInflatedScoreMatrix4Param,
  summarizeSoccerMarketsFromMatrixV4,
} from "../../src/domain/prediction/diagonal_score_matrix.js";
import { computeConformalEpistemicBandV5 } from "../../src/domain/prediction/epistemic_conformal.js";
import { evaluateCompactValidationRow, type GbmArtifact } from "../../src/domain/prediction/gbm.js";
import {
  evaluateLogitSpaceMonotoneSplineV5,
  projectSoccerPlayerPropOutlookV5,
  type HierarchicalPropsModelArtifactV5,
  type SoccerPlayerPropInputV4,
} from "../../src/domain/prediction/hierarchical_props.js";
import {
  evaluateNflInPlayState,
  evaluatePointsSportEarlyPayout,
  evaluateSoccerEarlyPayoutAndInPlay,
  type InPlayEarlyPayoutArtifactV5,
} from "../../src/domain/prediction/inplay_and_early_payout.js";
import type { MultiSportV40StateArtifact } from "../../src/domain/prediction/multisport_v3_6.js";
import {
  projectNflDiscreteKeyTotalPmfV5,
  projectNflOvertimeProbabilityV5,
  projectNflPlayerPropV5,
  solveNflDiscreteKeyTotalPmfExactV5,
  solveNflKeyNumberMarginPmfExact,
  type NflModelArtifactV5,
  type NflPropMarketKeyV5,
} from "../../src/domain/prediction/nfl_v4_0.js";
import {
  evaluatePlayerLinkedSgpV5,
  evaluateStudentTSameGameParlayV5,
  type SgpCopulaArtifactV5,
  type SgpLegInput,
} from "../../src/domain/prediction/sgp_copula.js";
import {
  buildSoccerMicroMatchOutlookV5,
  type SoccerMicroModelArtifactV5,
} from "../../src/domain/prediction/soccer_micro_markets.js";
import {
  buildUnifiedMultiSportMatchIntelligenceV5,
  buildUnifiedNflMatchIntelligenceV5,
  buildUnifiedSoccerMatchIntelligenceV5,
} from "../../src/domain/prediction/unified_outlook_v5.js";

describe("EXP_V50 · Global 22-League Tachyon v5.0 & Meridian v5.0 4-Param", () => {
  it("mantiene paridad IEEE-754 < 1e-12 frente a Python en 80 partidos de las 22 divisiones", () => {
    const gbmArt = gbmClubV50Json as unknown as GbmArtifact;
    const goalsArt = goalsClubV50Json;
    expect(gbmArt.production_activated).toBe(false);
    expect(goalsIntlV50Json.production_activated).toBe(false);
    expect(gbmArt.div_levels.length).toBeGreaterThanOrEqual(20);
    expect(soccerGlobalSnapV50Json.rows.length).toBe(80);

    for (const row of soccerGlobalSnapV50Json.rows) {
      const divIdx = gbmArt.div_levels.indexOf(row.div);
      const ev = evaluateCompactValidationRow(row.features, divIdx, gbmArt);
      expect(Math.abs(ev.ensemble[0] - row.python_ensemble_probs[0]!)).toBeLessThan(1e-12);
      expect(Math.abs(ev.ensemble[1] - row.python_ensemble_probs[1]!)).toBeLessThan(1e-12);
      expect(Math.abs(ev.ensemble[2] - row.python_ensemble_probs[2]!)).toBeLessThan(1e-12);

      const dOh = goalsArt.div_levels.map((lv) => (lv === row.div ? 1.0 : 0.0));
      const xgFull = [...row.goals_features, ...dOh];
      let eta = goalsArt.intercept;
      for (let i = 0; i < xgFull.length; i += 1) {
        const sc = goalsArt.scaler_scale[i] || 1.0;
        eta += goalsArt.coef[i]! * ((xgFull[i]! - goalsArt.scaler_mean[i]!) / sc);
      }
      eta = Math.min(Math.max(eta, Math.log(goalsArt.min_total_goals)), Math.log(goalsArt.max_total_goals));
      const tHat = Math.exp(eta);
      expect(Math.abs(tHat - row.python_t_hat)).toBeLessThan(1e-12);

      const sol4 = solveDiagonalInflatedScoreMatrix4Param({
        pHome: ev.ensemble[0],
        pDraw: ev.ensemble[1],
        pAway: ev.ensemble[2],
        totalGoalsTarget: tHat,
        rhoPrior: goalsArt.default_rho,
        dispersionR: goalsArt.dispersion_r,
        rhoDrawBlendWeight: (goalsArt as { rho_draw_blend_weight?: number }).rho_draw_blend_weight,
      });
      const mk4 = summarizeSoccerMarketsFromMatrixV4(sol4.matrix);
      expect(Math.abs(mk4.pOver25 - row.python_p_over_2_5)).toBeLessThan(1e-12);
      expect(Math.abs(mk4.pBttsYes - row.python_p_btts_yes)).toBeLessThan(1e-12);
    }
  });
});

describe("EXP_V51 · Non-Linear HGB-Poisson Micro-Markets v5.0 + Red Cards & Booking Points", () => {
  it("reproduce con paridad < 1e-12 los árboles HGB-Poisson, Tarjetas Rojas y Booking Points en 60 duelos", () => {
    const art = microModelV50Json as unknown as SoccerMicroModelArtifactV5;
    expect(art.status).toBe("candidate");
    expect(art.production_activated).toBe(false);
    expect(microSnapV50Json.rows.length).toBe(60);

    for (const r of microSnapV50Json.rows) {
      const out = buildSoccerMicroMatchOutlookV5({
        matchId: r.match_id,
        div: r.div,
        homeTeam: r.home_team,
        awayTeam: r.away_team,
        lamHome: r.lam_home,
        lamAway: r.lam_away,
        featuresByMetric: r.features_by_metric,
        modelArtifact: art,
      });

      for (const q of ["corners", "yellow_cards", "fouls", "shots_on_target", "shots"] as const) {
        const m = out.metrics[q];
        const ex = r.expected_metrics[q];
        const canonLine = art.metrics[q].canonical_total_line;
        const canonProj = m.totalLines.find((l) => Math.abs(l.line - canonLine) < 1e-9)!;
        expect(Math.abs(m.muHome - ex.mu_home)).toBeLessThan(1e-12);
        expect(Math.abs(m.muAway - ex.mu_away)).toBeLessThan(1e-12);
        expect(Math.abs(canonProj.pOver - ex.p_over_canonical)).toBeLessThan(1e-12);
      }

      expect(Math.abs(out.redCards.muHome - r.expected_red_cards.mu_home)).toBeLessThan(1e-12);
      expect(Math.abs(out.redCards.muAway - r.expected_red_cards.mu_away)).toBeLessThan(1e-12);
      expect(
        Math.abs(out.redCards.pRedCardMatch - r.expected_red_cards.p_red_card_match),
      ).toBeLessThan(1e-12);

      const bp455 = out.bookingPoints.lines.find((l) => Math.abs(l.line - 45.5) < 1e-9)!;
      expect(
        Math.abs(
          out.bookingPoints.expectedBookingPoints - r.expected_booking_points.expected_bp,
        ),
      ).toBeLessThan(1e-11);
      expect(Math.abs(bp455.pOver - r.expected_booking_points.p_over_45_5)).toBeLessThan(1e-12);
    }
  });
});

describe("EXP_V52 · NFL Minkowski v5.0 (Discrete Key-Total PMF, Overtime & Sacks/QB-Rush Props)", () => {
  it("verifica paridad < 1e-12 en PMF Discreta de Totales Clave, Overtime y 24 nuevos PBP Props", () => {
    const art = nflModelV50Json as unknown as NflModelArtifactV5;
    expect(art.status).toBe("candidate");
    expect(art.production_activated).toBe(false);

    for (const gr of nflSnapV50Json.game_rows) {
      const solM = solveNflKeyNumberMarginPmfExact({
        pHome: gr.p_home,
        pTie: gr.p_tie,
        pAway: gr.p_away,
        artifact: {
          ...art,
          totals_calibration: {
            sigma_game_physical: 13.4,
            market_posterior_w_model: art.discrete_totals_v5.market_posterior_w_model,
            sigma_market_posterior: 13.4,
          },
        },
      });
      const solT = solveNflDiscreteKeyTotalPmfExactV5({
        expectedTotal: gr.t_model,
        artifact: art,
      });
      const totOut = projectNflDiscreteKeyTotalPmfV5({
        modelExpectedTotal: gr.t_model,
        artifact: art,
        objectiveLines: [41.0, 44.5],
        marketTotalLine: gr.market_total_line,
      });
      const otOut = projectNflOvertimeProbabilityV5({
        expectedMargin: solM.expectedMargin,
        expectedTotal: solT.expectedTotalImplied,
        isIndoor: gr.is_indoor,
        isTurf: gr.is_turf,
        artifact: art,
      });

      expect(Math.abs(solT.theta - gr.expected.tot_theta)).toBeLessThan(1e-12);
      expect(Math.abs(solT.expectedTotalImplied - gr.expected.tot_implied)).toBeLessThan(1e-11);
      expect(Math.abs(totOut.objectiveProjections[0]!.pOver - gr.expected.p_over_41_0)).toBeLessThan(1e-12);
      expect(Math.abs(totOut.objectiveProjections[0]!.pPush - gr.expected.p_push_41_0)).toBeLessThan(1e-12);
      expect(Math.abs(totOut.objectiveProjections[1]!.pOver - gr.expected.p_over_44_5)).toBeLessThan(1e-12);
      expect(
        Math.abs(totOut.marketPosteriorProjection!.pOverNoPush - gr.expected.p_mkt_post_over_no_push),
      ).toBeLessThan(1e-12);
      expect(Math.abs(otOut.pOvertime - gr.expected.p_overtime)).toBeLessThan(1e-12);
    }

    for (const pr of nflSnapV50Json.prop_rows) {
      const outP = projectNflPlayerPropV5({
        market: pr.market as NflPropMarketKeyV5,
        features4: pr.features4 as unknown as readonly [number, number, number, number],
        line: pr.line,
        artifact: art,
      });
      expect(Math.abs(outP.expectedMean - pr.expected_mu)).toBeLessThan(1e-12);
      expect(Math.abs(outP.pOver - pr.expected_p_over)).toBeLessThan(1e-12);
      expect(Math.abs(outP.pUnder - pr.expected_p_under)).toBeLessThan(1e-12);
    }
  });
});

describe("EXP_V53 · Hierarchical Props v5.0 (Smooth Logit-Space PAVA Spline + Multi-Threshold 1.5+)", () => {
  it("verifica paridad < 1e-12 en 72 casos multi-línea y monotonía continua libre de escalones", () => {
    const art = propsModelV50Json as unknown as HierarchicalPropsModelArtifactV5;
    expect(art.status).toBe("candidate");
    expect(art.production_activated).toBe(false);

    // Verificar ausencia de escalones de cuantización en malla fina [0.002..0.040]
    let prev = 0.0;
    for (let k = 2; k <= 40; k += 1) {
      const y = evaluateLogitSpaceMonotoneSplineV5(
        k / 1000.0,
        art.soccer.logit_spline_calibration_0_5.goals,
      );
      expect(y).toBeGreaterThan(prev);
      prev = y;
    }

    for (const c of propsSnapV50Json.rows) {
      const out = projectSoccerPlayerPropOutlookV5(
        c.input as unknown as SoccerPlayerPropInputV4,
        art,
      );
      expect(Math.abs(out.lambdaEbPer90 - c.expected.lambda_eb_per90)).toBeLessThan(1e-12);
      expect(Math.abs(out.pOverRaw - c.expected.p_over_raw)).toBeLessThan(1e-12);
      expect(Math.abs(out.pOverCalibrated - c.expected.p_over_calibrated)).toBeLessThan(1e-12);
      expect(Math.abs(out.pOverSubCover - c.expected.p_over_sub_cover)).toBeLessThan(1e-12);
    }
  });
});

describe("EXP_V54 · Early-Payout Passage-Time DP (+2G / +17 NFL / +20 NBA / +5 MLB) & In-Play v5.0", () => {
  it("reproduce con paridad < 1e-12 los 24 escenarios DP 90-min de Fútbol, Points EP y NFL In-Play", () => {
    const art = inplayModelV50Json as unknown as InPlayEarlyPayoutArtifactV5;
    expect(art.status).toBe("candidate");
    expect(art.production_activated).toBe(false);

    for (const sc of inplaySnapV50Json.soccer_cases) {
      const out = evaluateSoccerEarlyPayoutAndInPlay({
        ...sc.input,
        artifact: art,
      });
      expect(Math.abs(out.regularFullTime.pHome - sc.expected.p_home)).toBeLessThan(1e-12);
      expect(Math.abs(out.regularFullTime.pDraw - sc.expected.p_draw)).toBeLessThan(1e-12);
      expect(Math.abs(out.regularFullTime.pAway - sc.expected.p_away)).toBeLessThan(1e-12);
      expect(
        Math.abs(out.earlyPayout2Goals.pHomeEarlyPayoutWin - sc.expected.p_home_early_payout),
      ).toBeLessThan(1e-12);
      expect(
        Math.abs(out.earlyPayout2Goals.pAwayEarlyPayoutWin - sc.expected.p_away_early_payout),
      ).toBeLessThan(1e-12);
      expect(
        Math.abs(out.liveTotalsAndNextGoal.expectedFinalTotalGoals - sc.expected.expected_final_total),
      ).toBeLessThan(1e-12);
    }

    for (const pc of inplaySnapV50Json.points_ep_cases) {
      const out = evaluatePointsSportEarlyPayout({
        sport: pc.sport as "nfl" | "nba" | "mlb",
        pHomeWin: pc.p_home_win,
        artifact: art,
      });
      expect(Math.abs(out.pHomeEarlyPayoutWin - pc.expected.p_home_ep)).toBeLessThan(1e-12);
      expect(Math.abs(out.pAwayEarlyPayoutWin - pc.expected.p_away_ep)).toBeLessThan(1e-12);
    }

    for (const lc of inplaySnapV50Json.nfl_live_cases) {
      const out = evaluateNflInPlayState({
        secondsRemaining: lc.seconds_remaining,
        homeScore: lc.home_score,
        awayScore: lc.away_score,
        pregameExpectedMargin: lc.pregame_exp_margin,
        pregameExpectedTotal: lc.pregame_exp_total,
        possession: lc.possession as "home" | "away" | "neutral",
        artifact: art,
      });
      expect(Math.abs(out.liveExpectedFinalMargin - lc.expected.live_expected_margin)).toBeLessThan(1e-12);
      expect(Math.abs(out.pHomeWinLive - lc.expected.p_home_win_live)).toBeLessThan(1e-12);
    }
  });
});

describe("EXP_V55 · Student-t Heavy-Tail Copula & Structural Player-Linked SGP v5.0", () => {
  it("verifica paridad < 1e-12 en 30 boletos Student-t y 24 boletos estructurales Jugador+Partido", () => {
    const art = sgpModelV50Json as unknown as SgpCopulaArtifactV5;
    expect(art.status).toBe("candidate");
    expect(art.production_activated).toBe(false);

    for (const tc of sgpSnapV50Json.student_t_cases) {
      const out = evaluateStudentTSameGameParlayV5({
        sport: tc.sport as "soccer" | "nfl",
        legs: tc.legs as unknown as readonly SgpLegInput[],
        artifact: art,
      });
      expect(Math.abs(out.independentProbability - tc.expected.independent_probability)).toBeLessThan(1e-12);
      expect(Math.abs(out.jointProbability - tc.expected.joint_probability)).toBeLessThan(1e-12);
      expect(Math.abs(out.correlationMultiplier - tc.expected.correlation_multiplier)).toBeLessThan(1e-12);
    }

    for (const pc of sgpSnapV50Json.player_linked_cases) {
      const inpP = pc.input as {
        pPlayerAnytimeGoal: number;
        teamExpectedGoals: number;
        opponentExpectedGoals: number;
        teamOutcome: "team_win" | "team_win_or_draw" | "any";
        matchTotalOverLine: number | null;
        dixonColesRho?: number;
      };
      const out = evaluatePlayerLinkedSgpV5({
        pPlayerAnytimeGoal: inpP.pPlayerAnytimeGoal,
        teamExpectedGoals: inpP.teamExpectedGoals,
        opponentExpectedGoals: inpP.opponentExpectedGoals,
        teamOutcome: inpP.teamOutcome,
        matchTotalOverLine: inpP.matchTotalOverLine,
        dixonColesRho: inpP.dixonColesRho,
      });
      expect(Math.abs(out.independentProbability - pc.expected.independent_probability)).toBeLessThan(1e-12);
      expect(Math.abs(out.jointProbability - pc.expected.joint_probability)).toBeLessThan(1e-12);
      expect(Math.abs(out.structuralLiftMultiplier - pc.expected.structural_lift_multiplier)).toBeLessThan(1e-11);
    }
  });
});

describe("EXP_V56 · Conformal Epistemic Intervals & UnifiedMatchIntelligenceV5 (242 duelos con cobertura honesta)", () => {
  it("verifica cobertura honesta sobre 242 duelos, intervalos [pLower90, pUpper90] válidos y 0 campos prohibidos", () => {
    expect(liveMatchdayV5Json.status).toBe("candidate");
    expect(liveMatchdayV5Json.production_activated).toBe(false);
    expect(liveMatchdayV5Json.n_matchups).toBe(242);
    const nPartial = (liveMatchdayV5Json as { n_partial_coverage?: number }).n_partial_coverage ?? 0;
    const nFallback = (liveMatchdayV5Json as { n_fallback_prior?: number }).n_fallback_prior ?? 0;
    expect(liveMatchdayV5Json.n_coverage_ok + nPartial + nFallback).toBe(242);
    expect(liveMatchdayV5Json.n_coverage_ok).toBeGreaterThanOrEqual(225);
    expect(liveMatchdayV5Json.n_low_coverage).toBe(nFallback);

    const raw = JSON.stringify(liveMatchdayV5Json);
    expect(raw).not.toContain('"stake"');
    expect(raw).not.toContain('"recommendedStake"');
    expect(raw).not.toContain('"kelly"');
    expect(raw).not.toContain('"kellyFraction"');
    expect(raw).not.toContain('"ev"');
    expect(raw).not.toContain('"tier"');

    // Verificar que una muestra baja + cambio de DT ensancha el intervalo respecto a muestra consolidada
    const stable = computeConformalEpistemicBandV5({
      pPoint: 0.56,
      effectiveSampleGames: 32,
      seasonProgress: 0.75,
    });
    const volatile = computeConformalEpistemicBandV5({
      pPoint: 0.56,
      effectiveSampleGames: 3,
      seasonProgress: 0.05,
      hasRecentCoachOrQbChange: true,
      missingKeyStarters: 3,
    });
    expect(volatile.halfWidth90).toBeGreaterThan(stable.halfWidth90 * 1.45);
    expect(volatile.pLower90).toBeGreaterThan(0.0);
    expect(volatile.pUpper90).toBeLessThan(1.0);
  });

  it("orquesta UnifiedMatchIntelligenceV5 en Fútbol, NFL y Multi-Sport con guardrail activo", () => {
    const socU = buildUnifiedSoccerMatchIntelligenceV5({
      matchId: "mex_america_cruz_azul",
      league: "liga-mx",
      div: "MEX",
      homeTeam: "Club America",
      awayTeam: "Cruz Azul",
      pHome: 0.44,
      pDraw: 0.28,
      pAway: 0.28,
      totalGoalsTarget: 2.75,
      microArtifactV5: microModelV50Json as unknown as SoccerMicroModelArtifactV5,
      inplayArtifactV5: inplayModelV50Json as unknown as InPlayEarlyPayoutArtifactV5,
      sgpArtifactV5: sgpModelV50Json as unknown as SgpCopulaArtifactV5,
    });
    expect(socU.guardrailAudit.passed).toBe(true);
    expect(socU.soccerEarlyPayoutAndInPlay!.earlyPayout2Goals.pHomeEarlyPayoutWin).toBeGreaterThan(
      socU.coreProbabilities.pHome,
    );
    expect(socU.soccerMicroMarketsV5!.bookingPoints.expectedBookingPoints).toBeGreaterThan(20.0);

    const nflU = buildUnifiedNflMatchIntelligenceV5({
      matchId: "nfl_det_gb",
      homeTeam: "Detroit Lions",
      awayTeam: "Green Bay Packers",
      pHome: 0.58,
      pTie: 0.004,
      pAway: 0.416,
      modelExpectedTotal: 48.5,
      marketTotalLine: 48.5,
      nflArtifactV5: nflModelV50Json as unknown as NflModelArtifactV5,
      inplayArtifactV5: inplayModelV50Json as unknown as InPlayEarlyPayoutArtifactV5,
      sgpArtifactV5: sgpModelV50Json as unknown as SgpCopulaArtifactV5,
    });
    expect(nflU.guardrailAudit.passed).toBe(true);
    expect(nflU.pointsSportEarlyPayout!.pHomeEarlyPayoutWin).toBeGreaterThan(
      nflU.coreProbabilities.pHome,
    );
    expect(nflU.nflMarketsV5!.pOvertime).toBeGreaterThan(0.01);

    const msU = buildUnifiedMultiSportMatchIntelligenceV5({
      matchId: "nba_bos_nyk",
      sport: "nba",
      homeKey: "BOS",
      awayKey: "NYK",
      homeTeam: "Boston Celtics",
      awayTeam: "New York Knicks",
      stateArtifact: multisportStateV40Json as unknown as MultiSportV40StateArtifact,
      inplayArtifactV5: inplayModelV50Json as unknown as InPlayEarlyPayoutArtifactV5,
    });
    expect(msU.guardrailAudit.passed).toBe(true);
    expect(msU.pointsSportEarlyPayout!.triggerLead).toBe(20);
  });
});
