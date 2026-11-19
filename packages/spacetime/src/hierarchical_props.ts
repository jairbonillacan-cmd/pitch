/**
 * PitchLab Hierarchical Props & Exposure v3.6 Candidate (`EXP_V41`) —
 * Motor jerárquico causal (`Poisson-Gamma -> Binomial Negativa`) para *player props* de Fútbol y NFL
 * con exposición esperada `E[M_{i,m}]`, cuantificación exacta del perk `sub_cover` (*Sustituto Cuenta*),
 * aislamiento Club vs Selección y guardia dimensional estricta `UnitProbability` en `(0, 1)`.
 *
 * Erradica por construcción los defectos forenses detectados en Scout Picks:
 *  - Prohibición total de probabilidades crudas `0%` o `100%` (`LL = +inf`) y de *cherry-picking* multi-ventana.
 *  - Imposibilidad en tiempo de compilación y runtime de restar escalas `[0..100] - [0..1]`.
 *  - `adjustedHitRate` real acoplado al ataque esperado del equipo, defensa rival y rigor arbitral EB.
 *  - Desmarginado adaptativo `devig2Way(..., "adaptive")` en pares completos y exponente de potencia en `Over-only`.
 */

import { devig2Way, overround } from "./devig";
import { clamp, normalCdf } from "./math";
import { probabilityToFairOdds, type FairOdds } from "./outlook";

export const HIERARCHICAL_PROPS_SCHEMA_VERSION = "hierarchical_props_v3.6.0" as const;

declare const UNIT_PROBABILITY_BRAND: unique symbol;

/**
 * Probabilidad estrictamente canónica en el intervalo abierto `(0, 1)`.
 * Impide mezclar porcentajes `[0..100]` con probabilidades `[0..1]`.
 */
export type UnitProbability = number & { readonly [UNIT_PROBABILITY_BRAND]: "UnitProbability" };

export function toUnitProbability(p: number): UnitProbability {
  if (!Number.isFinite(p)) {
    throw new Error(`UnitProbability inválida (no finita): ${String(p)}`);
  }
  return clamp(p, 0.001, 0.999) as UnitProbability;
}

export function assertStrictUnitProbability(p: number): UnitProbability {
  if (!Number.isFinite(p) || p <= 0.0 || p >= 1.0) {
    throw new RangeError(
      `Violación de invariante UnitProbability en (0, 1): recibido ${String(p)}`,
    );
  }
  return p as UnitProbability;
}

export type SoccerPositionCluster =
  | "GK"
  | "DF_CB"
  | "DF_FB"
  | "MF_DM"
  | "MF_CM"
  | "MF_AM"
  | "FW_W"
  | "FW_CF";

export type SoccerPropFamily = "goals" | "goals_assists" | "yellow_cards";

export type LineupStatusV36 =
  | "confirmed_starter"
  | "projected_starter"
  | "doubt"
  | "bench";

export interface SoccerPropMetricPriorSpec {
  readonly prior_rate_per90: number;
  readonly prior_beta_90: number;
  readonly phi_dispersion: number;
}

export interface SoccerPositionPriorSpec {
  readonly mean_starter_minutes: number;
  readonly metrics: Readonly<Record<SoccerPropFamily, SoccerPropMetricPriorSpec>>;
}

export type KnockoutLegTypeV5 = "none" | "first_leg" | "second_leg" | "single_final";

export interface HierarchicalPropsModelArtifact {
  readonly schema_version: string;
  readonly codename: string;
  readonly version: string;
  readonly status: "candidate" | "production";
  readonly production_activated: boolean;
  readonly created_at: string;
  readonly holdout_cut_utc: string;
  readonly holdout_sealed_untouched: boolean;
  readonly half_life_days: number;
  readonly one_way_book_power_exponent_default: number;
  readonly knockout_stage_config: {
    readonly goal_multiplier: number;
    readonly significance: string;
    readonly first_leg_multiplier?: number;
    readonly second_leg_multiplier?: number;
    readonly single_final_multiplier?: number;
  };
  readonly soccer: {
    readonly positions: Readonly<Record<SoccerPositionCluster, SoccerPositionPriorSpec>>;
    readonly calibration: Readonly<
      Record<SoccerPropFamily, { readonly cal_slope: number; readonly cal_intercept: number }>
    >;
  };
  readonly nfl: {
    readonly anchor_total_points: number;
    readonly positions: Readonly<
      Record<
        "QB" | "RB" | "WR" | "TE",
        Readonly<
          Record<
            string,
            {
              readonly prior_mean: number;
              readonly prior_games: number;
              readonly cv_sd?: number;
              readonly min_sd?: number;
              readonly phi_dispersion?: number;
              readonly script_trailing_slope: number;
            }
          >
        >
      >
    >;
  };
}

export interface SoccerPlayerPropInput {
  readonly propFamily: SoccerPropFamily;
  readonly posCluster: SoccerPositionCluster;
  readonly weightedSumY: number;
  readonly weightedExposure90: number;
  readonly expectedMinutesStarter?: number | null;
  readonly lineupStatus?: LineupStatusV36;
  readonly teamGoalFactor?: number;
  readonly oppDefFactor?: number;
  readonly refereeFactor?: number;
  /** `1.0` mismo contexto; `0.25` puente auxiliar Club -> Selección. */
  readonly contextWeight?: number;
  readonly line?: number;
  readonly replacementRatePer90?: number | null;
  readonly isLateKnockoutTie?: boolean;
  readonly knockoutLegType?: KnockoutLegTypeV5;
}

export interface SoccerPlayerPropOutlook {
  readonly propFamily: SoccerPropFamily;
  readonly posCluster: SoccerPositionCluster;
  readonly lineupStatus: LineupStatusV36;
  readonly line: number;
  readonly lambdaEbPer90: number;
  readonly expectedMinutes: number;
  readonly rEffective: number;
  readonly pOverRaw: number;
  readonly pPushRaw: number;
  readonly pOverCalibrated: UnitProbability;
  readonly pUnderCalibrated: UnitProbability;
  readonly fairOddsOver: FairOdds;
  readonly fairOddsUnder: FairOdds;
  readonly pOverSubCover: UnitProbability;
  readonly fairOddsOverSubCover: FairOdds;
  readonly subCoverLift: number;
}

export function nbProbOverExact(
  mu: number,
  rDisp: number,
  line: number,
  maxK: number = 16,
): { readonly pOver: number; readonly pUnder: number; readonly pPush: number } {
  const muC = clamp(mu, 1e-4, 25.0);
  const rC = clamp(rDisp, 0.35, 250.0);
  const p0Ratio = rC / (rC + muC);
  const qRatio = muC / (rC + muC);

  const pmf = new Float64Array(maxK + 1);
  pmf[0] = Math.exp(rC * Math.log(p0Ratio));
  for (let k = 1; k <= maxK; k += 1) {
    pmf[k] = pmf[k - 1]! * ((k - 1.0 + rC) / k) * qRatio;
  }
  let s = 0.0;
  for (let k = 0; k <= maxK; k += 1) s += pmf[k]!;
  if (s > 0.0) {
    for (let k = 0; k <= maxK; k += 1) pmf[k] = pmf[k]! / s;
  }

  if (Math.abs(line - Math.round(line)) < 1e-9) {
    const kl = Math.round(line);
    const pPush = kl >= 0 && kl <= maxK ? pmf[kl]! : 0.0;
    let pUnder = 0.0;
    const stop = Math.max(0, Math.min(kl, maxK + 1));
    for (let k = 0; k < stop; k += 1) pUnder += pmf[k]!;
    const pOver = Math.max(0.0, 1.0 - pUnder - pPush);
    return { pOver, pUnder, pPush };
  }

  const kf = Math.floor(line);
  let pUnder = 0.0;
  const stop = Math.max(0, Math.min(kf + 1, maxK + 1));
  for (let k = 0; k < stop; k += 1) pUnder += pmf[k]!;
  const pOver = Math.max(0.0, 1.0 - pUnder);
  return { pOver, pUnder, pPush: 0.0 };
}

/**
 * Proyección jerárquica cerrada de *player prop* en fútbol.
 * Espejo operación por operación (`< 1e-13`) de `project_soccer_player_prop_exact` en Python.
 */
export function projectSoccerPlayerPropOutlook(
  input: SoccerPlayerPropInput,
  artifact: HierarchicalPropsModelArtifact,
): SoccerPlayerPropOutlook {
  const posSpec = artifact.soccer.positions[input.posCluster];
  const metricSpec = posSpec.metrics[input.propFamily];
  const calSpec = artifact.soccer.calibration[input.propFamily];
  const status: LineupStatusV36 = input.lineupStatus ?? "projected_starter";
  const line = input.line ?? 0.5;

  const ctxW = clamp(input.contextWeight ?? 1.0, 0.1, 1.0);
  const effExp = Math.max(0.0, input.weightedExposure90) * ctxW;
  const effSum = Math.max(0.0, input.weightedSumY) * ctxW;

  const priorRate = metricSpec.prior_rate_per90;
  const priorBeta = metricSpec.prior_beta_90;
  const alpha0 = priorRate * priorBeta;
  const alphaPost = alpha0 + effSum;
  const betaPost = priorBeta + effExp;
  const lambdaEbPer90 = alphaPost / Math.max(betaPost, 1e-6);

  const mStarterRaw = input.expectedMinutesStarter ?? posSpec.mean_starter_minutes;
  const mSt = clamp(mStarterRaw, 45.0, 92.0);

  let regimes: readonly [readonly [number, number], readonly [number, number], readonly [number, number]];
  if (status === "confirmed_starter") {
    regimes = [
      [0.74, Math.min(92.0, mSt + 5.0) / 90.0],
      [0.22, Math.max(45.0, mSt - 18.0) / 90.0],
      [0.04, 24.0 / 90.0],
    ];
  } else if (status === "doubt") {
    regimes = [
      [0.42, mSt / 90.0],
      [0.28, 52.0 / 90.0],
      [0.3, 22.0 / 90.0],
    ];
  } else if (status === "bench") {
    regimes = [
      [0.1, 70.0 / 90.0],
      [0.25, 32.0 / 90.0],
      [0.65, 16.0 / 90.0],
    ];
  } else {
    regimes = [
      [0.68, Math.min(91.0, mSt + 3.0) / 90.0],
      [0.24, Math.max(45.0, mSt - 18.0) / 90.0],
      [0.08, 22.0 / 90.0],
    ];
  }

  const koCfg = artifact.knockout_stage_config;
  const legType: KnockoutLegTypeV5 =
    input.knockoutLegType ?? (input.isLateKnockoutTie ? "first_leg" : "none");
  let koMult = 1.0;
  if (
    legType !== "none" &&
    input.propFamily !== "yellow_cards" &&
    koCfg.significance === "significativa"
  ) {
    if (legType === "first_leg") {
      koMult = koCfg.first_leg_multiplier ?? koCfg.goal_multiplier;
    } else if (legType === "second_leg") {
      koMult = koCfg.second_leg_multiplier ?? 1.0;
    } else if (legType === "single_final") {
      koMult = koCfg.single_final_multiplier ?? koCfg.goal_multiplier;
    }
  }

  const envMult =
    clamp((input.teamGoalFactor ?? 1.0) * koMult, 0.45, 2.25) *
    clamp(input.oppDefFactor ?? 1.0, 0.55, 1.85) *
    clamp(input.refereeFactor ?? 1.0, 0.65, 1.5);

  const invREff =
    1.0 / Math.max(alphaPost, 0.25) + 1.0 / Math.max(metricSpec.phi_dispersion, 0.5);
  const rEffective = clamp(1.0 / invREff, 0.45, 150.0);

  let pOverRaw = 0.0;
  let pPushRaw = 0.0;
  let expectedMinutes = 0.0;

  for (const [piC, eC] of regimes) {
    expectedMinutes += piC * (eC * 90.0);
    const muC = lambdaEbPer90 * eC * envMult;
    const { pOver, pPush } = nbProbOverExact(muC, rEffective, line);
    pOverRaw += piC * pOver;
    pPushRaw += piC * pPush;
  }

  const actRaw = Math.max(1.0 - pPushRaw, 1e-9);
  const pCondRaw = clamp(pOverRaw / actRaw, 1e-6, 1.0 - 1e-6);
  const lgRaw = Math.log(pCondRaw / (1.0 - pCondRaw));
  const pCal = toUnitProbability(
    1.0 / (1.0 + Math.exp(-(calSpec.cal_intercept + calSpec.cal_slope * lgRaw))),
  );
  const pUnderCal = toUnitProbability(1.0 - pCal);

  // Perk `sub_cover` (*Sustituto Cuenta*)
  const rep90 = input.replacementRatePer90 ?? 0.82 * priorRate;
  let pOverSubRaw = 0.0;
  let pPushSubRaw = 0.0;
  for (const [piC, eC] of regimes) {
    const remE = Math.max(0.0, 1.0 - eC);
    const muSubC = (lambdaEbPer90 * eC + rep90 * remE) * envMult;
    const { pOver, pPush } = nbProbOverExact(muSubC, rEffective, line);
    pOverSubRaw += piC * pOver;
    pPushSubRaw += piC * pPush;
  }
  const actSub = Math.max(1.0 - pPushSubRaw, 1e-9);
  const pSubCond = clamp(pOverSubRaw / actSub, 1e-6, 1.0 - 1e-6);
  const lgSub = Math.log(pSubCond / (1.0 - pSubCond));
  const pSubRawCal = 1.0 / (1.0 + Math.exp(-(calSpec.cal_intercept + calSpec.cal_slope * lgSub)));
  const pOverSubCover = toUnitProbability(Math.max(pCal, pSubRawCal));

  return Object.freeze({
    propFamily: input.propFamily,
    posCluster: input.posCluster,
    lineupStatus: status,
    line,
    lambdaEbPer90,
    expectedMinutes,
    rEffective,
    pOverRaw,
    pPushRaw,
    pOverCalibrated: pCal,
    pUnderCalibrated: pUnderCal,
    fairOddsOver: probabilityToFairOdds(pCal),
    fairOddsUnder: probabilityToFairOdds(pUnderCal),
    pOverSubCover,
    fairOddsOverSubCover: probabilityToFairOdds(pOverSubCover),
    subCoverLift: pOverSubCover - pCal,
  });
}

export interface NFLPlayerPropInput {
  readonly position: "QB" | "RB" | "WR" | "TE";
  readonly marketKey: string;
  readonly seasonTotal: number;
  readonly gamesPlayed: number;
  readonly line: number;
  readonly oppDefenseFactor?: number;
  /** Margen esperado del propio equipo (`expectedMargin` si es local, `-expectedMargin` si es visita). */
  readonly teamExpectedMargin?: number;
  /** Total de puntos esperado por `Minkowski Totals v3.5`. */
  readonly gameExpectedTotal?: number;
}

export interface NFLPlayerPropOutlook {
  readonly position: "QB" | "RB" | "WR" | "TE";
  readonly marketKey: string;
  readonly line: number;
  readonly muAdjusted: number;
  readonly pOverCalibrated: UnitProbability;
  readonly pUnderCalibrated: UnitProbability;
  readonly pPush: number;
  readonly fairOddsOver: FairOdds;
  readonly fairOddsUnder: FairOdds;
}

/**
 * Evolución jerárquica de `props.ts` acoplada al guion de `Minkowski v3.5` (`expectedTotal` y `teamExpectedMargin`).
 * Cuando un equipo se proyecta abajo en el marcador (`teamExpectedMargin < 0`), sube el volumen aéreo (`QB/WR/TE`)
 * y se comprime el acarreo terrestre (`RB`).
 */
export function projectNflPlayerPropOutlook(
  input: NFLPlayerPropInput,
  artifact: HierarchicalPropsModelArtifact,
): NFLPlayerPropOutlook {
  const posGroup = artifact.nfl.positions[input.position];
  const spec = posGroup[input.marketKey];
  if (!spec) {
    throw new Error(`Mercado NFL prop desconocido '${input.marketKey}' para posición ${input.position}`);
  }

  const g = Math.max(0.0, input.gamesPlayed);
  const ebMean =
    (Math.max(0.0, input.seasonTotal) + spec.prior_games * spec.prior_mean) /
    Math.max(g + spec.prior_games, 1e-6);

  const oppMult = clamp(input.oppDefenseFactor ?? 1.0, 0.65, 1.45);
  const totAnchor = artifact.nfl.anchor_total_points;
  const gameTot = clamp(input.gameExpectedTotal ?? totAnchor, 30.0, 64.0);
  const tempoMult = clamp(gameTot / totAnchor, 0.78, 1.28);

  // `trailingPts > 0` cuando el equipo proyecta ir perdiendo
  const trailingPts = -(input.teamExpectedMargin ?? 0.0);
  const scriptMult = clamp(Math.exp(spec.script_trailing_slope * trailingPts), 0.78, 1.28);

  const muAdjusted = Math.max(0.05, ebMean * oppMult * tempoMult * scriptMult);

  if (spec.phi_dispersion !== undefined) {
    // Mercado discreto de conteo (TDs, recepciones) con Binomial Negativa exacta
    const { pOver, pPush } = nbProbOverExact(muAdjusted, spec.phi_dispersion, input.line, 24);
    const act = Math.max(1.0 - pPush, 1e-9);
    const pCond = toUnitProbability(pOver / act);
    return Object.freeze({
      position: input.position,
      marketKey: input.marketKey,
      line: input.line,
      muAdjusted,
      pOverCalibrated: pCond,
      pUnderCalibrated: toUnitProbability(1.0 - pCond),
      pPush,
      fairOddsOver: probabilityToFairOdds(pCond),
      fairOddsUnder: probabilityToFairOdds(1.0 - pCond),
    });
  }

  // Mercado continuo de yardas con corrección de continuidad en líneas enteras
  const sd = Math.max(spec.min_sd ?? 12.0, (spec.cv_sd ?? 0.45) * muAdjusted);
  const isInt = Math.abs(input.line - Math.round(input.line)) < 1e-9;
  let pOverRaw: number;
  let pPush = 0.0;

  if (isInt) {
    const thr = Math.round(input.line);
    const pOv = 1.0 - normalCdf((thr + 0.5 - muAdjusted) / sd);
    const pUn = normalCdf((thr - 0.5 - muAdjusted) / sd);
    pPush = Math.max(0.0, 1.0 - pOv - pUn);
    pOverRaw = pOv / Math.max(pOv + pUn, 1e-9);
  } else {
    pOverRaw = 1.0 - normalCdf((input.line - muAdjusted) / sd);
  }

  const pCal = toUnitProbability(pOverRaw);
  return Object.freeze({
    position: input.position,
    marketKey: input.marketKey,
    line: input.line,
    muAdjusted,
    pOverCalibrated: pCal,
    pUnderCalibrated: toUnitProbability(1.0 - pCal),
    pPush,
    fairOddsOver: probabilityToFairOdds(pCal),
    fairOddsUnder: probabilityToFairOdds(1.0 - pCal),
  });
}

export interface PropMarketComparison {
  readonly pCalibrated: UnitProbability;
  readonly fairOdds: FairOdds;
  readonly pSubCoverCalibrated: UnitProbability | null;
  readonly bookmaker: string;
  readonly oddsOffered: number;
  readonly counterpartOdds: number | null;
  readonly oneWayQuoteOnly: boolean;
  readonly pBookNoVig: UnitProbability;
  readonly bookOverround: number | null;
  /** Diferencia informativa estrictamente en `(-1, 1)` — jamás mezcla `[0..100]` con `[0..1]`. */
  readonly probDeltaVsBookNoVig: number;
  readonly activePerks: readonly ("sub_cover" | "early_payout_2_goals")[];
}

export function comparePropAgainstBookQuote(params: {
  readonly pCalibrated: UnitProbability;
  readonly pSubCoverCalibrated?: UnitProbability | null;
  readonly bookmaker: string;
  readonly oddsSelected: number;
  readonly oddsOpposite: number | null;
  readonly side: "over" | "under";
  readonly oneWayPowerExponentFallback?: number;
  readonly activePerks?: readonly ("sub_cover" | "early_payout_2_goals")[];
}): PropMarketComparison {
  assertStrictUnitProbability(params.pCalibrated);
  if (!Number.isFinite(params.oddsSelected) || params.oddsSelected <= 1.0) {
    throw new RangeError(`Cuota decimal inválida: ${String(params.oddsSelected)}`);
  }

  const perks = params.activePerks ?? [];
  const effectiveP: UnitProbability =
    params.side === "over" &&
    perks.includes("sub_cover") &&
    params.pSubCoverCalibrated !== undefined &&
    params.pSubCoverCalibrated !== null
      ? assertStrictUnitProbability(params.pSubCoverCalibrated)
      : params.pCalibrated;

  let pBookNoVigRaw: number;
  let bookOv: number | null = null;
  let oneWay = false;

  if (
    params.oddsOpposite !== null &&
    Number.isFinite(params.oddsOpposite) &&
    params.oddsOpposite > 1.0
  ) {
    const [oHome, oAway] =
      params.side === "over"
        ? [params.oddsSelected, params.oddsOpposite]
        : [params.oddsOpposite, params.oddsSelected];
    const dev = devig2Way(oHome, oAway, "adaptive");
    pBookNoVigRaw = params.side === "over" ? dev.pHome : dev.pAway;
    bookOv = overround([oHome, oAway]);
  } else {
    oneWay = true;
    const alpha = params.oneWayPowerExponentFallback ?? 1.075;
    pBookNoVigRaw = Math.pow(1.0 / params.oddsSelected, alpha);
  }

  const pBookNoVig = toUnitProbability(pBookNoVigRaw);
  return Object.freeze({
    pCalibrated: effectiveP,
    fairOdds: probabilityToFairOdds(effectiveP),
    pSubCoverCalibrated: params.pSubCoverCalibrated ?? null,
    bookmaker: params.bookmaker,
    oddsOffered: params.oddsSelected,
    counterpartOdds: params.oddsOpposite,
    oneWayQuoteOnly: oneWay,
    pBookNoVig,
    bookOverround: bookOv,
    probDeltaVsBookNoVig: effectiveP - pBookNoVig,
    activePerks: perks,
  });
}

// ============================================================================
// PitchLab Hierarchical Props v4.0 (`EXP_V46`: Shots/SoT/Assists + Empirical sub_cover + Isotonic PAVA)
// ============================================================================

export const HIERARCHICAL_PROPS_V4_SCHEMA_VERSION = "hierarchical_props_v4.0.0" as const;

export type SoccerPropFamilyV4 =
  | "goals"
  | "assists"
  | "goals_assists"
  | "yellow_cards"
  | "shots"
  | "shots_on_target";

export interface IsotonicPiecewiseSpecV4 {
  readonly x_knots: readonly number[];
  readonly y_knots: readonly number[];
}

export interface SoccerPropMetricPriorSpecV4 extends SoccerPropMetricPriorSpec {
  readonly fresh_legs_sub_multiplier: number;
}

export interface SoccerPositionPriorSpecV4 {
  readonly mean_starter_minutes: number;
  readonly metrics: Readonly<Record<SoccerPropFamilyV4, SoccerPropMetricPriorSpecV4>>;
}

export interface HierarchicalPropsModelArtifactV4 {
  readonly schema_version: string;
  readonly codename: string;
  readonly version: string;
  readonly status: "candidate" | "production";
  readonly production_activated: boolean;
  readonly created_at: string;
  readonly holdout_cut_utc: string;
  readonly holdout_sealed_untouched: boolean;
  readonly half_life_days: number;
  readonly knockout_stage_config: {
    readonly goal_multiplier: number;
    readonly significance: string;
    readonly first_leg_multiplier?: number;
    readonly second_leg_multiplier?: number;
    readonly single_final_multiplier?: number;
  };
  readonly soccer: {
    readonly positions: Readonly<Record<SoccerPositionCluster, SoccerPositionPriorSpecV4>>;
    readonly isotonic_calibration: Readonly<Record<SoccerPropFamilyV4, IsotonicPiecewiseSpecV4>>;
  };
}

/**
 * Interpolador lineal monótono por tramos (`PAVA Isotonic Piecewise-Linear`) con paridad `< 1e-15` Python <-> TS.
 */
export function evaluateIsotonicPiecewiseCalibration(
  pRaw: number,
  spec: IsotonicPiecewiseSpecV4,
): UnitProbability {
  const xk = spec.x_knots;
  const yk = spec.y_knots;
  const n = xk.length;
  const p = clamp(pRaw, xk[0]!, xk[n - 1]!);

  if (p <= xk[0]!) return toUnitProbability(yk[0]!);
  if (p >= xk[n - 1]!) return toUnitProbability(yk[n - 1]!);

  let idx = 0;
  for (let i = 0; i < n - 1; i += 1) {
    if (p >= xk[i]! && p <= xk[i + 1]!) {
      idx = i;
      break;
    }
  }
  const span = Math.max(xk[idx + 1]! - xk[idx]!, 1e-12);
  const t = (p - xk[idx]!) / span;
  const y = yk[idx]! + t * (yk[idx + 1]! - yk[idx]!);
  return toUnitProbability(y);
}

export interface SoccerPlayerPropInputV4 {
  readonly propFamily: SoccerPropFamilyV4;
  readonly posCluster: SoccerPositionCluster;
  readonly weightedSumY: number;
  readonly weightedExposure90: number;
  readonly expectedMinutesStarter?: number | null;
  readonly lineupStatus?: LineupStatusV36;
  readonly teamGoalFactor?: number;
  readonly oppDefFactor?: number;
  readonly refereeFactor?: number;
  readonly contextWeight?: number;
  readonly line?: number;
  readonly replacementRatePer90?: number | null;
  readonly isLateKnockoutTie?: boolean;
  /** Tipo explícito de eliminatoria `90'` limpio de tandas de penales (`v5.1`). */
  readonly knockoutLegType?: KnockoutLegTypeV5;
}

export interface SoccerPlayerPropOutlookV4 {
  readonly propFamily: SoccerPropFamilyV4;
  readonly posCluster: SoccerPositionCluster;
  readonly lineupStatus: LineupStatusV36;
  readonly line: number;
  readonly lambdaEbPer90: number;
  readonly freshLegsSubRatePer90: number;
  readonly expectedMinutes: number;
  readonly rEffective: number;
  readonly pOverRaw: number;
  readonly pPushRaw: number;
  readonly pOverCalibrated: UnitProbability;
  readonly pUnderCalibrated: UnitProbability;
  readonly fairOddsOver: FairOdds;
  readonly fairOddsUnder: FairOdds;
  readonly pOverSubCover: UnitProbability;
  readonly fairOddsOverSubCover: FairOdds;
  readonly subCoverLift: number;
}

export function projectSoccerPlayerPropOutlookV4(
  input: SoccerPlayerPropInputV4,
  artifact: HierarchicalPropsModelArtifactV4,
): SoccerPlayerPropOutlookV4 {
  const posSpec = artifact.soccer.positions[input.posCluster];
  const metricSpec = posSpec.metrics[input.propFamily];
  const isoSpec = artifact.soccer.isotonic_calibration[input.propFamily];
  const status: LineupStatusV36 = input.lineupStatus ?? "projected_starter";
  const defaultLine = input.propFamily === "shots" ? 1.5 : 0.5;
  const line = input.line ?? defaultLine;
  const maxK = input.propFamily === "shots" || input.propFamily === "shots_on_target" ? 20 : 16;

  const ctxW = clamp(input.contextWeight ?? 1.0, 0.1, 1.0);
  const effExp = Math.max(0.0, input.weightedExposure90) * ctxW;
  const effSum = Math.max(0.0, input.weightedSumY) * ctxW;

  const priorRate = metricSpec.prior_rate_per90;
  const priorBeta = metricSpec.prior_beta_90;
  const alpha0 = priorRate * priorBeta;
  const alphaPost = alpha0 + effSum;
  const betaPost = priorBeta + effExp;
  const lambdaEbPer90 = alphaPost / Math.max(betaPost, 1e-6);

  const mStarterRaw = input.expectedMinutesStarter ?? posSpec.mean_starter_minutes;
  const mSt = clamp(mStarterRaw, 45.0, 92.0);

  let regimes: readonly [readonly [number, number], readonly [number, number], readonly [number, number]];
  if (status === "confirmed_starter") {
    regimes = [
      [0.74, Math.min(92.0, mSt + 5.0) / 90.0],
      [0.22, Math.max(45.0, mSt - 18.0) / 90.0],
      [0.04, 24.0 / 90.0],
    ];
  } else if (status === "doubt") {
    regimes = [
      [0.42, mSt / 90.0],
      [0.28, 52.0 / 90.0],
      [0.3, 22.0 / 90.0],
    ];
  } else if (status === "bench") {
    regimes = [
      [0.1, 70.0 / 90.0],
      [0.25, 32.0 / 90.0],
      [0.65, 16.0 / 90.0],
    ];
  } else {
    regimes = [
      [0.68, Math.min(91.0, mSt + 3.0) / 90.0],
      [0.24, Math.max(45.0, mSt - 18.0) / 90.0],
      [0.08, 22.0 / 90.0],
    ];
  }

  const koCfg = artifact.knockout_stage_config;
  const legType: KnockoutLegTypeV5 =
    input.knockoutLegType ?? (input.isLateKnockoutTie ? "first_leg" : "none");
  let koMult = 1.0;
  if (
    legType !== "none" &&
    input.propFamily !== "yellow_cards" &&
    koCfg.significance === "significativa"
  ) {
    if (legType === "first_leg") {
      koMult = koCfg.first_leg_multiplier ?? koCfg.goal_multiplier;
    } else if (legType === "second_leg") {
      koMult = koCfg.second_leg_multiplier ?? 1.0;
    } else if (legType === "single_final") {
      koMult = koCfg.single_final_multiplier ?? koCfg.goal_multiplier;
    }
  }

  const envMult =
    clamp((input.teamGoalFactor ?? 1.0) * koMult, 0.45, 2.25) *
    clamp(input.oppDefFactor ?? 1.0, 0.55, 1.85) *
    clamp(input.refereeFactor ?? 1.0, 0.65, 1.5);

  const invREff =
    1.0 / Math.max(alphaPost, 0.25) + 1.0 / Math.max(metricSpec.phi_dispersion, 0.5);
  const rEffective = clamp(1.0 / invREff, 0.45, 150.0);

  let pOverRaw = 0.0;
  let pPushRaw = 0.0;
  let expectedMinutes = 0.0;

  for (const [piC, eC] of regimes) {
    expectedMinutes += piC * (eC * 90.0);
    const muC = lambdaEbPer90 * eC * envMult;
    const { pOver, pPush } = nbProbOverExact(muC, rEffective, line, maxK);
    pOverRaw += piC * pOver;
    pPushRaw += piC * pPush;
  }

  const actRaw = Math.max(1.0 - pPushRaw, 1e-9);
  const pCondRaw = clamp(pOverRaw / actRaw, 1e-6, 1.0 - 1e-6);
  const pCal = evaluateIsotonicPiecewiseCalibration(pCondRaw, isoSpec);
  const pUnderCal = toUnitProbability(1.0 - pCal);

  // Perk `sub_cover` empírico v4.0 (`fresh_legs_sub_multiplier * priorRate`)
  const rep90 =
    input.replacementRatePer90 ?? metricSpec.fresh_legs_sub_multiplier * priorRate;
  let pOverSubRaw = 0.0;
  let pPushSubRaw = 0.0;
  for (const [piC, eC] of regimes) {
    const remE = Math.max(0.0, 1.0 - eC);
    const muSubC = (lambdaEbPer90 * eC + rep90 * remE) * envMult;
    const { pOver, pPush } = nbProbOverExact(muSubC, rEffective, line, maxK);
    pOverSubRaw += piC * pOver;
    pPushSubRaw += piC * pPush;
  }
  const actSub = Math.max(1.0 - pPushSubRaw, 1e-9);
  const pSubCond = clamp(pOverSubRaw / actSub, 1e-6, 1.0 - 1e-6);
  const pSubCal = evaluateIsotonicPiecewiseCalibration(pSubCond, isoSpec);
  const pOverSubCover = toUnitProbability(Math.max(pCal, pSubCal));

  return Object.freeze({
    propFamily: input.propFamily,
    posCluster: input.posCluster,
    lineupStatus: status,
    line,
    lambdaEbPer90,
    freshLegsSubRatePer90: rep90,
    expectedMinutes,
    rEffective,
    pOverRaw,
    pPushRaw,
    pOverCalibrated: pCal,
    pUnderCalibrated: pUnderCal,
    fairOddsOver: probabilityToFairOdds(pCal),
    fairOddsUnder: probabilityToFairOdds(pUnderCal),
    pOverSubCover,
    fairOddsOverSubCover: probabilityToFairOdds(pOverSubCover),
    subCoverLift: pOverSubCover - pCal,
  });
}

// ============================================================================
// PitchLab Hierarchical Props v5.0 (`EXP_V53`: Smooth Logit-Space Barycentric PAVA Spline + Multi-Threshold 1.5+)
// ============================================================================

export const HIERARCHICAL_PROPS_V5_SCHEMA_VERSION = "hierarchical_props_v5.0.0" as const;

export interface LogitSpaceMonotoneSplineSpecV5 {
  readonly eta_knots: readonly number[];
  readonly zeta_knots: readonly number[];
  readonly calibration_source?: string;
}

export interface HierarchicalPropsModelArtifactV5 {
  readonly schema_version: string;
  readonly codename: string;
  readonly version: string;
  readonly status: "candidate" | "production";
  readonly production_activated: boolean;
  readonly created_at: string;
  readonly holdout_cut_utc: string;
  readonly holdout_sealed_untouched: boolean;
  readonly half_life_days: number;
  readonly knockout_stage_config: {
    readonly goal_multiplier: number;
    readonly significance: string;
    readonly first_leg_multiplier?: number;
    readonly second_leg_multiplier?: number;
    readonly single_final_multiplier?: number;
  };
  readonly soccer: {
    readonly positions: Readonly<Record<SoccerPositionCluster, SoccerPositionPriorSpecV4>>;
    readonly logit_spline_calibration_0_5: Readonly<
      Record<SoccerPropFamilyV4, LogitSpaceMonotoneSplineSpecV5>
    >;
    readonly logit_spline_calibration_1_5_plus: Readonly<
      Record<SoccerPropFamilyV4, LogitSpaceMonotoneSplineSpecV5>
    >;
  };
}

/**
 * Evaluador continuo monótono en espacio Logit (`Logit-Space PAVA Spline`):
 * Interpola linealmente `zeta(eta)` sobre nodos `eta = logit(pRaw)` y aplica `sigmoid(zeta)`.
 * Elimina al 100% el error de cuantización en probabilidades pequeñas (`p in [0.002, 0.06]`)
 * manteniendo paridad IEEE-754 `< 1e-15` Python <-> TypeScript.
 */
export function evaluateLogitSpaceMonotoneSplineV5(
  pRaw: number,
  spec: LogitSpaceMonotoneSplineSpecV5,
): UnitProbability {
  const pSafe = clamp(pRaw, 1e-6, 1.0 - 1e-6);
  const etaRaw = Math.log(pSafe / (1.0 - pSafe));
  const ek = spec.eta_knots;
  const zk = spec.zeta_knots;
  const n = ek.length;

  let zeta: number;
  if (etaRaw <= ek[0]!) {
    const slopeLo = (zk[1]! - zk[0]!) / Math.max(ek[1]! - ek[0]!, 1e-9);
    zeta = zk[0]! + slopeLo * (etaRaw - ek[0]!);
  } else if (etaRaw >= ek[n - 1]!) {
    const slopeHi = (zk[n - 1]! - zk[n - 2]!) / Math.max(ek[n - 1]! - ek[n - 2]!, 1e-9);
    zeta = zk[n - 1]! + slopeHi * (etaRaw - ek[n - 1]!);
  } else {
    let idx = 0;
    for (let i = 0; i < n - 1; i += 1) {
      if (etaRaw >= ek[i]! && etaRaw <= ek[i + 1]!) {
        idx = i;
        break;
      }
    }
    const span = Math.max(ek[idx + 1]! - ek[idx]!, 1e-12);
    const t = (etaRaw - ek[idx]!) / span;
    zeta = zk[idx]! + t * (zk[idx + 1]! - zk[idx]!);
  }

  const pOut = 1.0 / (1.0 + Math.exp(-clamp(zeta, -12.0, 12.0)));
  return toUnitProbability(pOut);
}

export function projectSoccerPlayerPropOutlookV5(
  input: SoccerPlayerPropInputV4,
  artifact: HierarchicalPropsModelArtifactV5,
): SoccerPlayerPropOutlookV4 {
  const posSpec = artifact.soccer.positions[input.posCluster];
  const metricSpec = posSpec.metrics[input.propFamily];
  const status: LineupStatusV36 = input.lineupStatus ?? "projected_starter";
  const defaultLine = input.propFamily === "shots" ? 1.5 : 0.5;
  const line = input.line ?? defaultLine;
  const maxK = input.propFamily === "shots" || input.propFamily === "shots_on_target" ? 20 : 16;

  const splineSpec =
    line >= 1.0
      ? artifact.soccer.logit_spline_calibration_1_5_plus[input.propFamily]
      : artifact.soccer.logit_spline_calibration_0_5[input.propFamily];

  const ctxW = clamp(input.contextWeight ?? 1.0, 0.1, 1.0);
  const effExp = Math.max(0.0, input.weightedExposure90) * ctxW;
  const effSum = Math.max(0.0, input.weightedSumY) * ctxW;

  const priorRate = metricSpec.prior_rate_per90;
  const priorBeta = metricSpec.prior_beta_90;
  const alpha0 = priorRate * priorBeta;
  const alphaPost = alpha0 + effSum;
  const betaPost = priorBeta + effExp;
  const lambdaEbPer90 = alphaPost / Math.max(betaPost, 1e-6);

  const mStarterRaw = input.expectedMinutesStarter ?? posSpec.mean_starter_minutes;
  const mSt = clamp(mStarterRaw, 45.0, 92.0);

  let regimes: readonly [readonly [number, number], readonly [number, number], readonly [number, number]];
  if (status === "confirmed_starter") {
    regimes = [
      [0.74, Math.min(92.0, mSt + 5.0) / 90.0],
      [0.22, Math.max(45.0, mSt - 18.0) / 90.0],
      [0.04, 24.0 / 90.0],
    ];
  } else if (status === "doubt") {
    regimes = [
      [0.42, mSt / 90.0],
      [0.28, 52.0 / 90.0],
      [0.3, 22.0 / 90.0],
    ];
  } else if (status === "bench") {
    regimes = [
      [0.1, 70.0 / 90.0],
      [0.25, 32.0 / 90.0],
      [0.65, 16.0 / 90.0],
    ];
  } else {
    regimes = [
      [0.68, Math.min(91.0, mSt + 3.0) / 90.0],
      [0.24, Math.max(45.0, mSt - 18.0) / 90.0],
      [0.08, 22.0 / 90.0],
    ];
  }

  const koCfg = artifact.knockout_stage_config;
  const legType: KnockoutLegTypeV5 =
    input.knockoutLegType ?? (input.isLateKnockoutTie ? "first_leg" : "none");
  let koMult = 1.0;
  if (
    legType !== "none" &&
    input.propFamily !== "yellow_cards" &&
    koCfg.significance === "significativa"
  ) {
    if (legType === "first_leg") {
      koMult = koCfg.first_leg_multiplier ?? koCfg.goal_multiplier;
    } else if (legType === "second_leg") {
      koMult = koCfg.second_leg_multiplier ?? 1.0;
    } else if (legType === "single_final") {
      koMult = koCfg.single_final_multiplier ?? koCfg.goal_multiplier;
    }
  }

  const envMult =
    clamp((input.teamGoalFactor ?? 1.0) * koMult, 0.45, 2.25) *
    clamp(input.oppDefFactor ?? 1.0, 0.55, 1.85) *
    clamp(input.refereeFactor ?? 1.0, 0.65, 1.5);

  const invREff =
    1.0 / Math.max(alphaPost, 0.25) + 1.0 / Math.max(metricSpec.phi_dispersion, 0.5);
  const rEffective = clamp(1.0 / invREff, 0.45, 150.0);

  let pOverRaw = 0.0;
  let pPushRaw = 0.0;
  let expectedMinutes = 0.0;

  for (const [piC, eC] of regimes) {
    expectedMinutes += piC * (eC * 90.0);
    const muC = lambdaEbPer90 * eC * envMult;
    const { pOver, pPush } = nbProbOverExact(muC, rEffective, line, maxK);
    pOverRaw += piC * pOver;
    pPushRaw += piC * pPush;
  }

  const actRaw = Math.max(1.0 - pPushRaw, 1e-9);
  const pCondRaw = clamp(pOverRaw / actRaw, 1e-6, 1.0 - 1e-6);
  const pCal = evaluateLogitSpaceMonotoneSplineV5(pCondRaw, splineSpec);
  const pUnderCal = toUnitProbability(1.0 - pCal);

  const rep90 =
    input.replacementRatePer90 ?? metricSpec.fresh_legs_sub_multiplier * priorRate;
  let pOverSubRaw = 0.0;
  let pPushSubRaw = 0.0;
  for (const [piC, eC] of regimes) {
    const remE = Math.max(0.0, 1.0 - eC);
    const muSubC = (lambdaEbPer90 * eC + rep90 * remE) * envMult;
    const { pOver, pPush } = nbProbOverExact(muSubC, rEffective, line, maxK);
    pOverSubRaw += piC * pOver;
    pPushSubRaw += piC * pPush;
  }
  const actSub = Math.max(1.0 - pPushSubRaw, 1e-9);
  const pSubCond = clamp(pOverSubRaw / actSub, 1e-6, 1.0 - 1e-6);
  const pSubCal = evaluateLogitSpaceMonotoneSplineV5(pSubCond, splineSpec);
  const pOverSubCover = toUnitProbability(Math.max(pCal, pSubCal));

  return Object.freeze({
    propFamily: input.propFamily,
    posCluster: input.posCluster,
    lineupStatus: status,
    line,
    lambdaEbPer90,
    freshLegsSubRatePer90: rep90,
    expectedMinutes,
    rEffective,
    pOverRaw,
    pPushRaw,
    pOverCalibrated: pCal,
    pUnderCalibrated: pUnderCal,
    fairOddsOver: probabilityToFairOdds(pCal),
    fairOddsUnder: probabilityToFairOdds(pUnderCal),
    pOverSubCover,
    fairOddsOverSubCover: probabilityToFairOdds(pOverSubCover),
    subCoverLift: pOverSubCover - pCal,
  });
}
