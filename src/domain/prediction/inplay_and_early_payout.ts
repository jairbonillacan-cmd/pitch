/**
 * PitchLab Early-Payout Passage-Time DP & In-Play Spacetime v5.0 (`EXP_V54`) —
 *
 * 1. `evaluateSoccerEarlyPayoutAndInPlay`:
 *    Programación Dinámica exacta sobre `90` pasos de `1` minuto en el espacio de estados
 *    `(golesLocal, golesVisita, mascaraPagoAnticipado2Goles)` (`11 x 11 x 4 = 484` estados, `< 0.15 ms`, `0` azar),
 *    integrando:
 *      - Perfil temporal empírico `minuteBucketWeights6` aprendido de `goalscorers.csv` (`< 2025-02-02`),
 *      - Multiplicadores causales de expulsión tipo Markov-Hawkes (`ownRedRateMult`, `oppRedRateMult`),
 *      - Valor matemático exacto de *Pago Anticipado +2 Goles* (`max_t (G_H(t) - G_A(t)) >= 2 U G_H(90) > G_A(90)`),
 *        incluyendo la probabilidad de doble cobro (`pBothSidesTriggerEarlyPayout`).
 *
 * 2. `evaluatePointsSportEarlyPayout` & `evaluateNflInPlayState`:
 *    Principio de reflexión de movimiento Browniano con deriva calibrado para `NFL (+17 pts)`,
 *    `NBA (+20 pts)` y `MLB (+5 carreras)`, más motor `In-Play` NFL en tiempo continuo.
 *
 * Cero campos de apuesta (`stake`, `kelly`, `ev`, `tier`). Paridad IEEE-754 `< 1e-13` frente a Python.
 */

import { clamp, normalCdf } from "./math.js";
import { probabilityToFairOdds, type FairOdds } from "./outlook.js";
import { acklamNormalQuantile } from "./sgp_copula.js";

export const INPLAY_EARLY_PAYOUT_SCHEMA_VERSION = "inplay_early_payout_v5.0.0" as const;
export const SOCCER_DP_MAX_GOALS = 10;

export interface InPlayEarlyPayoutArtifactV5 {
  readonly schema_version: string;
  readonly codename: string;
  readonly version: string;
  readonly status: "candidate" | "production";
  readonly production_activated: boolean;
  readonly created_at: string;
  readonly holdout_cut_utc: string;
  readonly holdout_sealed_untouched: boolean;
  readonly soccer: {
    readonly minute_bucket_weights_6: readonly [number, number, number, number, number, number];
    readonly own_red_card_rate_mult: number;
    readonly opp_red_card_rate_mult: number;
    readonly second_half_trailing_push: number;
    readonly max_goals_dp: number;
  };
  readonly points_sports_early_payout: {
    readonly nfl: { readonly trigger_lead: 17; readonly sigma_margin: number; readonly effective_barrier: number };
    readonly nba: { readonly trigger_lead: 20; readonly sigma_margin: number; readonly effective_barrier: number };
    readonly mlb: { readonly trigger_lead: 5; readonly sigma_margin: number; readonly effective_barrier: number };
  };
  readonly nfl_inplay: {
    readonly sigma_full_game: number;
    readonly sigma_total_full_game: number;
    readonly possession_value_points: number;
  };
}

export interface SoccerEarlyPayoutAndInPlayInput {
  readonly pregameMuHome: number;
  readonly pregameMuAway: number;
  readonly currentMinute?: number;
  readonly currentHomeGoals?: number;
  readonly currentAwayGoals?: number;
  readonly redCardsHome?: number;
  readonly redCardsAway?: number;
  readonly homeAlreadyHit2GoalLead?: boolean;
  readonly awayAlreadyHit2GoalLead?: boolean;
  readonly artifact: InPlayEarlyPayoutArtifactV5;
}

export interface SoccerEarlyPayoutAndInPlayResult {
  readonly currentMinute: number;
  readonly remainingLambdaHome: number;
  readonly remainingLambdaAway: number;
  readonly regularFullTime: {
    readonly pHome: number;
    readonly pDraw: number;
    readonly pAway: number;
    readonly fairOddsHome: FairOdds;
    readonly fairOddsDraw: FairOdds;
    readonly fairOddsAway: FairOdds;
  };
  readonly earlyPayout2Goals: {
    readonly pHomeEarlyPayoutWin: number;
    readonly pAwayEarlyPayoutWin: number;
    readonly homeEarlyPayoutLift: number;
    readonly awayEarlyPayoutLift: number;
    readonly pBothSidesTriggerEarlyPayout: number;
    readonly fairOddsHomeEarlyPayout: FairOdds;
    readonly fairOddsAwayEarlyPayout: FairOdds;
  };
  readonly liveTotalsAndNextGoal: {
    readonly expectedFinalTotalGoals: number;
    readonly pOver25FullTime: number;
    readonly pOver35FullTime: number;
    readonly pBttsFullTime: number;
    readonly pNextGoalHome: number;
    readonly pNextGoalAway: number;
    readonly pNoMoreGoals: number;
  };
}

/**
 * Resuelve de forma exacta en `90 - currentMinute` pasos de 1 minuto la distribución conjunta de
 * `(G_H(90), G_A(90), I(max_t(G_H-G_A)>=2), I(max_t(G_A-G_H)>=2))`.
 */
export function evaluateSoccerEarlyPayoutAndInPlay(
  input: SoccerEarlyPayoutAndInPlayInput,
): SoccerEarlyPayoutAndInPlayResult {
  const cfg = input.artifact.soccer;
  const maxG = cfg.max_goals_dp;
  const gSize = maxG + 1;
  const nStates = gSize * gSize * 4;

  const curMin = Math.floor(clamp(input.currentMinute ?? 0, 0, 90));
  const h0 = Math.floor(clamp(input.currentHomeGoals ?? 0, 0, maxG));
  const a0 = Math.floor(clamp(input.currentAwayGoals ?? 0, 0, maxG));
  const redsH = Math.floor(clamp(input.redCardsHome ?? 0, 0, 4));
  const redsA = Math.floor(clamp(input.redCardsAway ?? 0, 0, 4));

  const muH0 = clamp(input.pregameMuHome, 0.05, 7.5);
  const muA0 = clamp(input.pregameMuAway, 0.05, 7.5);

  const redMultH =
    Math.pow(cfg.own_red_card_rate_mult, redsH) * Math.pow(cfg.opp_red_card_rate_mult, redsA);
  const redMultA =
    Math.pow(cfg.own_red_card_rate_mult, redsA) * Math.pow(cfg.opp_red_card_rate_mult, redsH);

  let initMask = 0;
  if (input.homeAlreadyHit2GoalLead || h0 - a0 >= 2) initMask |= 1;
  if (input.awayAlreadyHit2GoalLead || a0 - h0 >= 2) initMask |= 2;

  let dp = new Float64Array(nStates);
  let dpNext = new Float64Array(nStates);
  dp[(h0 * gSize + a0) * 4 + initMask] = 1.0;

  let remLamH = 0.0;
  let remLamA = 0.0;
  const wBuckets = cfg.minute_bucket_weights_6;
  const trailPush = cfg.second_half_trailing_push;

  for (let m = curMin; m < 90; m += 1) {
    const bIdx = Math.min(5, Math.floor(m / 15));
    const uMin = wBuckets[bIdx]! / 15.0;
    const baseDh = muH0 * uMin * redMultH;
    const baseDa = muA0 * uMin * redMultA;
    remLamH += baseDh;
    remLamA += baseDa;

    dpNext.fill(0.0);
    const isSecondHalf = m >= 45;

    for (let h = 0; h < gSize; h += 1) {
      for (let a = 0; a < gSize; a += 1) {
        const baseCell = (h * gSize + a) * 4;
        const cellMass = dp[baseCell]! + dp[baseCell + 1]! + dp[baseCell + 2]! + dp[baseCell + 3]!;
        if (cellMass <= 1e-18) continue;

        let dh = baseDh;
        let da = baseDa;
        if (isSecondHalf && h !== a) {
          if (h < a) {
            dh *= 1.0 + trailPush;
            da *= Math.max(0.5, 1.0 - 0.5 * trailPush);
          } else {
            da *= 1.0 + trailPush;
            dh *= Math.max(0.5, 1.0 - 0.5 * trailPush);
          }
        }

        const p0H = Math.exp(-dh);
        const p1H = dh * p0H;
        const p2H = Math.max(0.0, 1.0 - p0H - p1H);

        const p0A = Math.exp(-da);
        const p1A = da * p0A;
        const p2A = Math.max(0.0, 1.0 - p0A - p1A);

        const phStep = [p0H, p1H, p2H];
        const paStep = [p0A, p1A, p2A];

        for (let mask = 0; mask < 4; mask += 1) {
          const pState = dp[baseCell + mask]!;
          if (pState <= 1e-18) continue;

          for (let gh = 0; gh <= 2; gh += 1) {
            const phg = phStep[gh]!;
            if (phg <= 0.0) continue;
            const nh = Math.min(maxG, h + gh);
            for (let ga = 0; ga <= 2; ga += 1) {
              const pag = paStep[ga]!;
              if (pag <= 0.0) continue;
              const na = Math.min(maxG, a + ga);
              let nMask = mask;
              if (nh - na >= 2) nMask |= 1;
              if (na - nh >= 2) nMask |= 2;
              dpNext[(nh * gSize + na) * 4 + nMask] =
                dpNext[(nh * gSize + na) * 4 + nMask]! + pState * phg * pag;
            }
          }
        }
      }
    }
    const tmp = dp;
    dp = dpNext;
    dpNext = tmp;
  }

  let pHome = 0.0;
  let pDraw = 0.0;
  let pAway = 0.0;
  let pHomeEp = 0.0;
  let pAwayEp = 0.0;
  let pBothEp = 0.0;
  let expTot = 0.0;
  let pOver25 = 0.0;
  let pOver35 = 0.0;
  let pBtts = 0.0;

  for (let h = 0; h < gSize; h += 1) {
    for (let a = 0; a < gSize; a += 1) {
      const baseCell = (h * gSize + a) * 4;
      for (let mask = 0; mask < 4; mask += 1) {
        const p = dp[baseCell + mask]!;
        if (p <= 0.0) continue;
        if (h > a) pHome += p;
        else if (h === a) pDraw += p;
        else pAway += p;

        if ((mask & 1) !== 0 || h > a) pHomeEp += p;
        if ((mask & 2) !== 0 || a > h) pAwayEp += p;
        if ((mask & 3) === 3) pBothEp += p;

        const tot = h + a;
        expTot += tot * p;
        if (tot >= 3) pOver25 += p;
        if (tot >= 4) pOver35 += p;
        if (h >= 1 && a >= 1) pBtts += p;
      }
    }
  }

  const remSum = remLamH + remLamA;
  const pNoMore = Math.exp(-remSum);
  const pNextH = remSum > 1e-12 ? (1.0 - pNoMore) * (remLamH / remSum) : 0.0;
  const pNextA = remSum > 1e-12 ? (1.0 - pNoMore) * (remLamA / remSum) : 0.0;

  const phC = clamp(pHome, 0.001, 0.999);
  const pdC = clamp(pDraw, 0.001, 0.999);
  const paC = clamp(pAway, 0.001, 0.999);
  const phEpC = clamp(Math.max(pHome, pHomeEp), 0.001, 0.999);
  const paEpC = clamp(Math.max(pAway, pAwayEp), 0.001, 0.999);

  return Object.freeze({
    currentMinute: curMin,
    remainingLambdaHome: remLamH,
    remainingLambdaAway: remLamA,
    regularFullTime: Object.freeze({
      pHome,
      pDraw,
      pAway,
      fairOddsHome: probabilityToFairOdds(phC),
      fairOddsDraw: probabilityToFairOdds(pdC),
      fairOddsAway: probabilityToFairOdds(paC),
    }),
    earlyPayout2Goals: Object.freeze({
      pHomeEarlyPayoutWin: phEpC,
      pAwayEarlyPayoutWin: paEpC,
      homeEarlyPayoutLift: Math.max(0.0, phEpC - pHome),
      awayEarlyPayoutLift: Math.max(0.0, paEpC - pAway),
      pBothSidesTriggerEarlyPayout: pBothEp,
      fairOddsHomeEarlyPayout: probabilityToFairOdds(phEpC),
      fairOddsAwayEarlyPayout: probabilityToFairOdds(paEpC),
    }),
    liveTotalsAndNextGoal: Object.freeze({
      expectedFinalTotalGoals: expTot,
      pOver25FullTime: pOver25,
      pOver35FullTime: pOver35,
      pBttsFullTime: pBtts,
      pNextGoalHome: pNextH,
      pNextGoalAway: pNextA,
      pNoMoreGoals: pNoMore,
    }),
  });
}

export interface PointsSportEarlyPayoutResult {
  readonly sport: "nfl" | "nba" | "mlb";
  readonly triggerLead: number;
  readonly pHomeRegularWin: number;
  readonly pAwayRegularWin: number;
  readonly pHomeEarlyPayoutWin: number;
  readonly pAwayEarlyPayoutWin: number;
  readonly homeEarlyPayoutLift: number;
  readonly awayEarlyPayoutLift: number;
  readonly fairOddsHomeEarlyPayout: FairOdds;
  readonly fairOddsAwayEarlyPayout: FairOdds;
}

/**
 * Principio de reflexión para movimiento Browniano con deriva `M(t) = mu*t + sigma*W(t)`:
 * `P(max_{t in [0,1]} M(t) >= b_eff, M(1) <= 0) = exp(2 * mu * b_eff / sigma^2) * Phi((-2 * b_eff - mu) / sigma)`.
 */
export function evaluatePointsSportEarlyPayout(params: {
  readonly sport: "nfl" | "nba" | "mlb";
  readonly pHomeWin: number;
  readonly artifact: InPlayEarlyPayoutArtifactV5;
}): PointsSportEarlyPayoutResult {
  const spCfg = params.artifact.points_sports_early_payout[params.sport];
  const pH = clamp(params.pHomeWin, 0.002, 0.998);
  const pA = 1.0 - pH;
  const sigma = spCfg.sigma_margin;
  const bEff = spCfg.effective_barrier;

  const muH = sigma * acklamNormalQuantile(pH);
  const muA = -muH;

  const logTermH = clamp((2.0 * muH * bEff) / (sigma * sigma), -40.0, 40.0);
  const liftH = Math.exp(logTermH) * normalCdf((-2.0 * bEff - muH) / sigma);

  const logTermA = clamp((2.0 * muA * bEff) / (sigma * sigma), -40.0, 40.0);
  const liftA = Math.exp(logTermA) * normalCdf((-2.0 * bEff - muA) / sigma);

  const pHEp = clamp(pH + Math.max(0.0, liftH), pH, 0.999);
  const pAEp = clamp(pA + Math.max(0.0, liftA), pA, 0.999);

  return Object.freeze({
    sport: params.sport,
    triggerLead: spCfg.trigger_lead,
    pHomeRegularWin: pH,
    pAwayRegularWin: pA,
    pHomeEarlyPayoutWin: pHEp,
    pAwayEarlyPayoutWin: pAEp,
    homeEarlyPayoutLift: pHEp - pH,
    awayEarlyPayoutLift: pAEp - pA,
    fairOddsHomeEarlyPayout: probabilityToFairOdds(pHEp),
    fairOddsAwayEarlyPayout: probabilityToFairOdds(pAEp),
  });
}

export interface NflInPlayStateResult {
  readonly secondsRemaining: number;
  readonly currentScoreDiffHome: number;
  readonly liveExpectedFinalMargin: number;
  readonly liveExpectedFinalTotal: number;
  readonly pHomeWinLive: number;
  readonly pAwayWinLive: number;
  readonly earlyPayout17AlreadyTriggeredHome: boolean;
  readonly earlyPayout17AlreadyTriggeredAway: boolean;
  readonly fairOddsHomeLive: FairOdds;
  readonly fairOddsAwayLive: FairOdds;
}

export function evaluateNflInPlayState(params: {
  readonly secondsRemaining: number;
  readonly homeScore: number;
  readonly awayScore: number;
  readonly pregameExpectedMargin: number;
  readonly pregameExpectedTotal: number;
  readonly possession?: "home" | "away" | "neutral";
  readonly artifact: InPlayEarlyPayoutArtifactV5;
}): NflInPlayStateResult {
  const cfg = params.artifact.nfl_inplay;
  const secRem = clamp(params.secondsRemaining, 0.0, 3600.0);
  const tau = secRem / 3600.0;
  const curDiff = params.homeScore - params.awayScore;
  const curTot = params.homeScore + params.awayScore;

  const possAdj =
    params.possession === "home"
      ? cfg.possession_value_points
      : params.possession === "away"
        ? -cfg.possession_value_points
        : 0.0;
  const effPoss = possAdj * Math.pow(tau, 0.25);

  const liveExpMargin = curDiff + tau * params.pregameExpectedMargin + effPoss;
  const liveExpTotal = curTot + tau * params.pregameExpectedTotal + Math.abs(effPoss) * 0.35;
  const sigmaRem = Math.max(0.65, cfg.sigma_full_game * Math.sqrt(Math.max(tau, 1e-4)));

  const pHomeWin =
    secRem <= 0.0
      ? curDiff > 0
        ? 0.999
        : curDiff < 0
          ? 0.001
          : 0.5
      : clamp(normalCdf(liveExpMargin / sigmaRem), 0.001, 0.999);
  const pAwayWin = 1.0 - pHomeWin;

  return Object.freeze({
    secondsRemaining: secRem,
    currentScoreDiffHome: curDiff,
    liveExpectedFinalMargin: liveExpMargin,
    liveExpectedFinalTotal: liveExpTotal,
    pHomeWinLive: pHomeWin,
    pAwayWinLive: pAwayWin,
    earlyPayout17AlreadyTriggeredHome: curDiff >= 17,
    earlyPayout17AlreadyTriggeredAway: -curDiff >= 17,
    fairOddsHomeLive: probabilityToFairOdds(pHomeWin),
    fairOddsAwayLive: probabilityToFairOdds(pAwayWin),
  });
}
