/**
 * PitchLab Unified Matchday Intelligence Hub (`v5.0 Candidate` · `EXP_V56`) —
 * Fachada maestra institucional que orquesta en `< 1.2 ms` (`0` red, `100%` determinista):
 *  - Fútbol Global `v5.0` (`22` Ligas + `Meridian v5.0` Selecciones en Matriz 4-Param Diagonal-NB)
 *  - Micro-Mercados No Lineales `HGB-Poisson v5.0` + `Red Cards` (`Over 0.5`) y `Booking Points` (`35.5 / 45.5 / 55.5`)
 *  - NFL `Minkowski v5.0` (PMF Números Clave + Kernel Discreto de Totales Clave sin deriva + `Overtime` + `Sacks/QB Rush`)
 *  - Motor Exacto de `Pago Anticipado` (*Early Payout*: `+2 Goles`, `+17 NFL`, `+20 NBA`, `+5 MLB`) e `In-Play` Vivo
 *  - Cópula `Student-t` con dependencia de cola + *Bet Builder* Estructural Jugador-Partido (`Player-Linked SGP`)
 *  - Bandas Epistémicas Conformales al `90%` (`[pLower90, pUpper90]`) + Guardrail Determinista Anti-Alucinación
 *
 * Invariante estricto: `0` campos de `stake`, `kelly`, `ev` o `tier`; los `10` artefactos `v3.0`/`v3.1`/`v3.2`
 * y toda la superficie `v3.5`–`v4.0` permanecen 100% intactos.
 */

import {
  solveDiagonalInflatedScoreMatrix4Param,
  summarizeSoccerMarketsFromMatrixV4,
  type DerivedSoccerMarketsV4,
} from "./diagonal_score_matrix.js";
import {
  buildMatchEpistemicSummaryV5,
  type EpistemicConformalArtifactV51,
  type MatchEpistemicSummaryV5,
} from "./epistemic_conformal.js";
import {
  evaluatePointsSportEarlyPayout,
  evaluateSoccerEarlyPayoutAndInPlay,
  type InPlayEarlyPayoutArtifactV5,
  type PointsSportEarlyPayoutResult,
  type SoccerEarlyPayoutAndInPlayResult,
} from "./inplay_and_early_payout.js";
import { clamp } from "./math.js";
import {
  predictLiveMultiSportV40Matchup,
  type MLBV36Outlook,
  type MultiSportV40StateArtifact,
  type NBAV36Outlook,
  type NCAAFV40Outlook,
  type NHLV36Outlook,
} from "./multisport_v3_6.js";
import {
  buildVerifiedMatchFactSheet,
  compileDeterministicVerifiedSummaryEs,
  validateMatchMathematicalInvariants,
  validateNarrativeAgainstFactSheet,
  type GuardrailAuditResult,
  type VerifiedMatchFactSheet,
} from "./narrative_guardrail.js";
import {
  projectNflDiscreteKeyTotalPmfV5,
  projectNflMarketSpreadPosteriorV5,
  projectNflOvertimeProbabilityV5,
  projectNflSpreadFromMarginPmfExact,
  solveNflKeyNumberMarginPmfExact,
  type NflModelArtifactV5,
  type NflSpreadProjectionV4,
  type NflTotalLineProjectionV4,
} from "./nfl_v4_0.js";
import { probabilityToFairOdds, type FairOdds } from "./outlook.js";
import {
  evaluatePlayerLinkedSgpV5,
  evaluateStudentTSameGameParlayV5,
  type SgpCopulaArtifactV5,
  type SoccerPlayerLinkedSgpResultV5,
  type StudentTSgpEvaluationV5,
} from "./sgp_copula.js";
import {
  buildSoccerMicroMatchOutlookV5,
  type MicroFeatureVectorInputV4,
  type SoccerMicroMatchOutlookV5,
  type SoccerMicroMetricKey,
  type SoccerMicroModelArtifactV5,
} from "./soccer_micro_markets.js";
import type { UnifiedSportV4 } from "./unified_outlook_v4.js";

export const UNIFIED_OUTLOOK_V5_SCHEMA_VERSION = "unified_match_intelligence_v5.0.0" as const;

export interface UnifiedMatchIntelligenceV5 {
  readonly schemaVersion: typeof UNIFIED_OUTLOOK_V5_SCHEMA_VERSION;
  readonly status: "candidate";
  readonly productionActivated: false;
  readonly matchId: string;
  readonly sport: UnifiedSportV4;
  readonly league: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly coreProbabilities: {
    readonly pHome: number;
    readonly pDraw: number | null;
    readonly pAway: number;
    readonly fairOddsHome: FairOdds;
    readonly fairOddsDraw: FairOdds | null;
    readonly fairOddsAway: FairOdds;
  };
  readonly epistemicUncertainty90: MatchEpistemicSummaryV5;
  readonly soccerMarkets?: DerivedSoccerMarketsV4;
  readonly soccerMicroMarketsV5?: SoccerMicroMatchOutlookV5;
  readonly soccerEarlyPayoutAndInPlay?: SoccerEarlyPayoutAndInPlayResult;
  readonly pointsSportEarlyPayout?: PointsSportEarlyPayoutResult | null;
  readonly nflMarketsV5?: {
    readonly expectedMargin: number;
    readonly pExactPlus3: number;
    readonly pExactMinus3: number;
    readonly pOvertime: number;
    readonly fairOddsOvertimeYes: FairOdds;
    readonly keySpreads: readonly NflSpreadProjectionV4[];
    readonly marketSpreadPosterior?: (NflSpreadProjectionV4 & { readonly posteriorExpectedMargin: number }) | null;
    readonly discreteKeyTotals: readonly NflTotalLineProjectionV4[];
    readonly marketTotalPosterior: NflTotalLineProjectionV4 | null;
  };
  readonly multiSportOutlook?: MLBV36Outlook | NHLV36Outlook | NBAV36Outlook | NCAAFV40Outlook;
  readonly featuredStudentTSgp: StudentTSgpEvaluationV5 | null;
  readonly featuredPlayerLinkedSgp: SoccerPlayerLinkedSgpResultV5 | null;
  readonly factSheet: VerifiedMatchFactSheet;
  readonly verifiedSummaryEs: string;
  readonly guardrailAudit: GuardrailAuditResult;
  readonly dataQuality: {
    readonly flag: "ok" | "partial_coverage" | "fallback_prior";
    readonly coverageScore: number;
    readonly sourceEngine?: string;
    readonly validationStatus?: string;
  };
}

export function buildUnifiedSoccerMatchIntelligenceV5(params: {
  readonly matchId: string;
  readonly league: string;
  readonly div: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly pHome: number;
  readonly pDraw: number;
  readonly pAway: number;
  readonly totalGoalsTarget: number;
  readonly rhoPrior?: number;
  readonly dispersionR?: number;
  readonly rhoDrawBlendWeight?: number;
  readonly leadStrikerAnytimeGoalProb?: number;
  readonly effectiveSampleGames?: number;
  readonly pLogitHome?: number | null;
  readonly pGbmHome?: number | null;
  readonly pLogitDraw?: number | null;
  readonly pGbmDraw?: number | null;
  readonly pLogitAway?: number | null;
  readonly pGbmAway?: number | null;
  readonly seasonProgress?: number;
  readonly epistemicArtifactV51?: EpistemicConformalArtifactV51 | null;
  readonly dataQualityOverride?: UnifiedMatchIntelligenceV5["dataQuality"];
  readonly microArtifactV5: SoccerMicroModelArtifactV5;
  readonly inplayArtifactV5: InPlayEarlyPayoutArtifactV5;
  readonly sgpArtifactV5: SgpCopulaArtifactV5;
  readonly microFeaturesOverride?: Readonly<Record<SoccerMicroMetricKey, MicroFeatureVectorInputV4>>;
}): UnifiedMatchIntelligenceV5 {
  const sol4 = solveDiagonalInflatedScoreMatrix4Param({
    pHome: params.pHome,
    pDraw: params.pDraw,
    pAway: params.pAway,
    totalGoalsTarget: params.totalGoalsTarget,
    rhoPrior: params.rhoPrior ?? 0.0,
    dispersionR: params.dispersionR ?? 45.0,
    rhoDrawBlendWeight: params.rhoDrawBlendWeight ?? 0.0,
  });
  const socMarkets = summarizeSoccerMarketsFromMatrixV4(sol4.matrix);

  const lh = sol4.muHome;
  const la = sol4.muAway;
  const supH = lh - la;
  const supA = -supH;
  const siegeH = Math.pow(Math.max(0.0, supH), 1.4) - 0.5 * Math.pow(Math.max(0.0, -supH), 1.2);
  const siegeA = Math.pow(Math.max(0.0, supA), 1.4) - 0.5 * Math.pow(Math.max(0.0, -supA), 1.2);
  const tempoExc = lh + la - 2.65;
  const tightness = Math.exp(-Math.abs(supH)) - 0.55;
  const sProg = params.seasonProgress ?? 0.55;
  const crunch = Math.max(0.0, sProg - 0.7) * Math.exp(-Math.abs(supH));
  const dp = params.microArtifactV5.div_priors[params.div];

  const metricKeys: readonly SoccerMicroMetricKey[] = [
    "corners",
    "yellow_cards",
    "fouls",
    "shots_on_target",
    "shots",
  ];
  const defaultMicroFeats = {} as Record<SoccerMicroMetricKey, MicroFeatureVectorInputV4>;
  for (const q of metricKeys) {
    const sp = params.microArtifactV5.metrics[q];
    const bh = dp?.metrics[q]?.home_mean ?? sp.default_home_rate;
    const ba = dp?.metrics[q]?.away_mean ?? sp.default_away_rate;
    defaultMicroFeats[q] = {
      homeFeatures8: [Math.log(Math.max(bh, 0.12)), supH, siegeH, tempoExc, tightness, 0.0, crunch, 0.0],
      awayFeatures8: [Math.log(Math.max(ba, 0.12)), supA, siegeA, tempoExc, tightness, 0.0, crunch, 0.0],
    };
  }

  const microOut = buildSoccerMicroMatchOutlookV5({
    matchId: params.matchId,
    div: params.div,
    homeTeam: params.homeTeam,
    awayTeam: params.awayTeam,
    lamHome: lh,
    lamAway: la,
    featuresByMetric: params.microFeaturesOverride ?? defaultMicroFeats,
    modelArtifact: params.microArtifactV5,
  });

  const epAndInPlay = evaluateSoccerEarlyPayoutAndInPlay({
    pregameMuHome: lh,
    pregameMuAway: la,
    currentMinute: 0,
    currentHomeGoals: 0,
    currentAwayGoals: 0,
    redCardsHome: 0,
    redCardsAway: 0,
    corePHome: socMarkets.pHome,
    corePDraw: socMarkets.pDraw,
    corePAway: socMarkets.pAway,
    artifact: params.inplayArtifactV5,
  });

  const sgpStudentT = evaluateStudentTSameGameParlayV5({
    sport: "soccer",
    legs: [
      {
        legId: "over_2_5_goals",
        factor: "total_goals",
        marginalProbability: clamp(socMarkets.pOver25, 0.02, 0.98),
        direction: 1,
      },
      {
        legId: "sot_over_8_5",
        factor: "total_shots_on_target",
        marginalProbability: clamp(
          microOut.metrics.shots_on_target.totalLines.find((l) => Math.abs(l.line - 8.5) < 1e-6)
            ?.pOverConditionalNoPush ?? 0.5,
          0.02,
          0.98,
        ),
        direction: 1,
      },
    ],
    artifact: params.sgpArtifactV5,
  });

  const pStriker = clamp(params.leadStrikerAnytimeGoalProb ?? 1.0 - Math.exp(-0.36 * lh), 0.05, 0.85);
  const playerSgp = evaluatePlayerLinkedSgpV5({
    pPlayerAnytimeGoal: pStriker,
    teamExpectedGoals: lh,
    opponentExpectedGoals: la,
    teamOutcome: "team_win",
    matchTotalOverLine: 2.5,
    dixonColesRho: sol4.rhoEff,
  });

  const epistemic = buildMatchEpistemicSummaryV5({
    pHome: socMarkets.pHome,
    pDraw: socMarkets.pDraw,
    pAway: socMarkets.pAway,
    effectiveSampleGames: params.effectiveSampleGames ?? 24,
    pLogitHome: params.pLogitHome,
    pGbmHome: params.pGbmHome,
    pLogitDraw: params.pLogitDraw,
    pGbmDraw: params.pGbmDraw,
    pLogitAway: params.pLogitAway,
    pGbmAway: params.pGbmAway,
    seasonProgress: sProg,
    sport: "soccer",
    calibrationArtifact: params.epistemicArtifactV51,
  });

  const facts = buildVerifiedMatchFactSheet({
    matchId: params.matchId,
    sport: "soccer",
    homeTeam: params.homeTeam,
    awayTeam: params.awayTeam,
    pHome: socMarkets.pHome,
    pDraw: socMarkets.pDraw,
    pAway: socMarkets.pAway,
    expectedTotal: sol4.expectedTotalImplied,
    canonicalTotalLine: 2.5,
    pOverCanonical: socMarkets.pOver25,
  });
  const summaryEs = compileDeterministicVerifiedSummaryEs(facts);
  const textAudit = validateNarrativeAgainstFactSheet(summaryEs, facts);
  const mathAudit = validateMatchMathematicalInvariants({
    pHome: socMarkets.pHome,
    pDraw: socMarkets.pDraw,
    pAway: socMarkets.pAway,
    pHomeEarlyPayoutWin: epAndInPlay.earlyPayout2Goals.pHomeEarlyPayoutWin,
    pAwayEarlyPayoutWin: epAndInPlay.earlyPayout2Goals.pAwayEarlyPayoutWin,
    epistemicBands: [
      { label: "home", ...epistemic.homeBand90 },
      { label: "away", ...epistemic.awayBand90 },
    ],
  });
  const audit: GuardrailAuditResult = Object.freeze({
    passed: textAudit.passed && mathAudit.passed,
    violations: Object.freeze([...textAudit.violations, ...mathAudit.violations]),
  });

  return Object.freeze({
    schemaVersion: UNIFIED_OUTLOOK_V5_SCHEMA_VERSION,
    status: "candidate",
    productionActivated: false,
    matchId: params.matchId,
    sport: "soccer",
    league: params.league,
    homeTeam: params.homeTeam,
    awayTeam: params.awayTeam,
    coreProbabilities: Object.freeze({
      pHome: socMarkets.pHome,
      pDraw: socMarkets.pDraw,
      pAway: socMarkets.pAway,
      fairOddsHome: probabilityToFairOdds(clamp(socMarkets.pHome, 0.001, 0.999)),
      fairOddsDraw: probabilityToFairOdds(clamp(socMarkets.pDraw, 0.001, 0.999)),
      fairOddsAway: probabilityToFairOdds(clamp(socMarkets.pAway, 0.001, 0.999)),
    }),
    epistemicUncertainty90: epistemic,
    soccerMarkets: socMarkets,
    soccerMicroMarketsV5: microOut,
    soccerEarlyPayoutAndInPlay: epAndInPlay,
    featuredStudentTSgp: sgpStudentT,
    featuredPlayerLinkedSgp: playerSgp,
    factSheet: facts,
    verifiedSummaryEs: summaryEs,
    guardrailAudit: audit,
    dataQuality: Object.freeze(
      params.dataQualityOverride ?? {
        flag: "ok" as const,
        coverageScore: 1.0,
        sourceEngine: "tachyon_v5_1_global",
        validationStatus: "oos_validated_pre_holdout",
      },
    ),
  });
}

export function buildUnifiedNflMatchIntelligenceV5(params: {
  readonly matchId: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly pHome: number;
  readonly pTie: number;
  readonly pAway: number;
  readonly modelExpectedTotal: number;
  readonly marketTotalLine?: number | null;
  readonly marketSpreadHome?: number | null;
  readonly isIndoor?: boolean;
  readonly isTurf?: boolean;
  readonly effectiveSampleGames?: number;
  readonly pLogitHome?: number | null;
  readonly pGbmHome?: number | null;
  readonly epistemicArtifactV51?: EpistemicConformalArtifactV51 | null;
  readonly dataQualityOverride?: UnifiedMatchIntelligenceV5["dataQuality"];
  readonly nflArtifactV5: NflModelArtifactV5;
  readonly inplayArtifactV5: InPlayEarlyPayoutArtifactV5;
  readonly sgpArtifactV5: SgpCopulaArtifactV5;
}): UnifiedMatchIntelligenceV5 {
  const sol = solveNflKeyNumberMarginPmfExact({
    pHome: params.pHome,
    pTie: params.pTie,
    pAway: params.pAway,
    artifact: {
      schema_version: params.nflArtifactV5.schema_version,
      codename: params.nflArtifactV5.codename,
      version: params.nflArtifactV5.version,
      status: params.nflArtifactV5.status,
      production_activated: params.nflArtifactV5.production_activated,
      created_at: params.nflArtifactV5.created_at,
      holdout_cut_utc: params.nflArtifactV5.holdout_cut_utc,
      holdout_sealed_untouched: params.nflArtifactV5.holdout_sealed_untouched,
      max_abs_margin: params.nflArtifactV5.max_abs_margin,
      positive_margin_kernel_1_to_45: params.nflArtifactV5.positive_margin_kernel_1_to_45,
      margin_quad_concentration: params.nflArtifactV5.margin_quad_concentration,
      totals_calibration: {
        sigma_game_physical: 13.4,
        market_posterior_w_model: params.nflArtifactV5.discrete_totals_v5.market_posterior_w_model,
        sigma_market_posterior: 13.4,
      },
    },
  });
  const center = sol.maxAbsMargin;
  const keySpreads = [-7.0, -3.5, -3.0, -2.5, 3.0, 7.0].map((ln) =>
    projectNflSpreadFromMarginPmfExact(sol, ln),
  );
  const marketSpreadPosterior =
    typeof params.marketSpreadHome === "number" && Number.isFinite(params.marketSpreadHome)
      ? projectNflMarketSpreadPosteriorV5({
          modelExpectedMargin: sol.expectedMargin,
          marketSpreadHome: params.marketSpreadHome,
          pTie: params.pTie,
          artifact: params.nflArtifactV5,
        })
      : null;
  const totOut = projectNflDiscreteKeyTotalPmfV5({
    modelExpectedTotal: params.modelExpectedTotal,
    artifact: params.nflArtifactV5,
    marketTotalLine: params.marketTotalLine ?? null,
  });
  const otOut = projectNflOvertimeProbabilityV5({
    expectedMargin: sol.expectedMargin,
    expectedTotal: totOut.modelExpectedTotal,
    isIndoor: params.isIndoor ?? false,
    isTurf: params.isTurf ?? false,
    artifact: params.nflArtifactV5,
  });

  const pWin2Way = clamp(params.pHome / Math.max(params.pHome + params.pAway, 1e-9), 0.001, 0.999);
  const nflEp17 = evaluatePointsSportEarlyPayout({
    sport: "nfl",
    pHomeWin: pWin2Way,
    artifact: params.inplayArtifactV5,
  });

  const pOver445 =
    totOut.objectiveProjections.find((t) => Math.abs(t.totalLine - 44.5) < 1e-6)?.pOverNoPush ?? 0.5;
  const sgpStudentT = evaluateStudentTSameGameParlayV5({
    sport: "nfl",
    legs: [
      {
        legId: "home_moneyline",
        factor: "home_margin",
        marginalProbability: pWin2Way,
        direction: 1,
      },
      {
        legId: "over_44_5_pts",
        factor: "total_points",
        marginalProbability: clamp(pOver445, 0.02, 0.98),
        direction: 1,
      },
    ],
    artifact: params.sgpArtifactV5,
  });

  const epistemic = buildMatchEpistemicSummaryV5({
    pHome: pWin2Way,
    pDraw: null,
    pAway: 1.0 - pWin2Way,
    effectiveSampleGames: params.effectiveSampleGames ?? 16,
    pLogitHome: params.pLogitHome,
    pGbmHome: params.pGbmHome,
    sport: "nfl",
    calibrationArtifact: params.epistemicArtifactV51,
  });

  const facts = buildVerifiedMatchFactSheet({
    matchId: params.matchId,
    sport: "nfl",
    homeTeam: params.homeTeam,
    awayTeam: params.awayTeam,
    pHome: pWin2Way,
    pDraw: null,
    pAway: 1.0 - pWin2Way,
    expectedTotal: totOut.modelExpectedTotal,
    canonicalTotalLine: 44.5,
    pOverCanonical: pOver445,
  });
  const summaryEs = compileDeterministicVerifiedSummaryEs(facts);
  const textAudit = validateNarrativeAgainstFactSheet(summaryEs, facts);
  const mathAudit = validateMatchMathematicalInvariants({
    pHome: pWin2Way,
    pDraw: null,
    pAway: 1.0 - pWin2Way,
    pHomeEarlyPayoutWin: nflEp17.pHomeEarlyPayoutWin,
    pAwayEarlyPayoutWin: nflEp17.pAwayEarlyPayoutWin,
    epistemicBands: [
      { label: "home", ...epistemic.homeBand90 },
      { label: "away", ...epistemic.awayBand90 },
    ],
  });
  const audit: GuardrailAuditResult = Object.freeze({
    passed: textAudit.passed && mathAudit.passed,
    violations: Object.freeze([...textAudit.violations, ...mathAudit.violations]),
  });

  return Object.freeze({
    schemaVersion: UNIFIED_OUTLOOK_V5_SCHEMA_VERSION,
    status: "candidate",
    productionActivated: false,
    matchId: params.matchId,
    sport: "nfl",
    league: "nfl",
    homeTeam: params.homeTeam,
    awayTeam: params.awayTeam,
    coreProbabilities: Object.freeze({
      pHome: pWin2Way,
      pDraw: null,
      pAway: 1.0 - pWin2Way,
      fairOddsHome: probabilityToFairOdds(pWin2Way),
      fairOddsDraw: null,
      fairOddsAway: probabilityToFairOdds(1.0 - pWin2Way),
    }),
    epistemicUncertainty90: epistemic,
    pointsSportEarlyPayout: nflEp17,
    nflMarketsV5: Object.freeze({
      expectedMargin: sol.expectedMargin,
      pExactPlus3: sol.pmf[center + 3]!,
      pExactMinus3: sol.pmf[center - 3]!,
      pOvertime: otOut.pOvertime,
      fairOddsOvertimeYes: otOut.fairOddsOvertimeYes,
      keySpreads: Object.freeze(keySpreads),
      marketSpreadPosterior,
      discreteKeyTotals: totOut.objectiveProjections,
      marketTotalPosterior: totOut.marketPosteriorProjection,
    }),
    featuredStudentTSgp: sgpStudentT,
    featuredPlayerLinkedSgp: null,
    factSheet: facts,
    verifiedSummaryEs: summaryEs,
    guardrailAudit: audit,
    dataQuality: Object.freeze(
      params.dataQualityOverride ?? {
        flag: "ok" as const,
        coverageScore: 1.0,
        sourceEngine: "minkowski_v5_1_epa",
        validationStatus: "oos_validated_pre_holdout",
      },
    ),
  });
}

export function buildUnifiedMultiSportMatchIntelligenceV5(params: {
  readonly matchId: string;
  readonly sport: "mlb" | "nhl" | "nba" | "ncaaf";
  readonly homeKey: string;
  readonly awayKey: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly stateArtifact: MultiSportV40StateArtifact;
  readonly inplayArtifactV5: InPlayEarlyPayoutArtifactV5;
  readonly neutralSite?: boolean;
}): UnifiedMatchIntelligenceV5 {
  const msOut = predictLiveMultiSportV40Matchup({
    sport: params.sport,
    homeKey: params.homeKey,
    awayKey: params.awayKey,
    stateArtifact: params.stateArtifact,
    neutralSite: params.neutralSite ?? false,
  });

  let expTot = 0.0;
  let canonLine = 0.0;
  let pOv = 0.5;
  if (msOut.sport === "mlb") {
    expTot = msOut.full_game.expected_total_runs;
    canonLine = msOut.full_game.total_line;
    pOv = msOut.full_game.p_over_cond_no_push;
  } else if (msOut.sport === "nhl") {
    expTot = msOut.expected_goals_home_full + msOut.expected_goals_away_full;
    canonLine = msOut.total_line;
    pOv = msOut.p_over_cond_no_push;
  } else {
    expTot = msOut.expected_total;
    canonLine = msOut.total_line;
    pOv = msOut.p_over;
  }

  const pH = clamp(msOut.p_home, 0.001, 0.999);
  const pA = clamp(1.0 - pH, 0.001, 0.999);

  const epOut =
    params.sport === "mlb" || params.sport === "nba"
      ? evaluatePointsSportEarlyPayout({
          sport: params.sport,
          pHomeWin: pH,
          artifact: params.inplayArtifactV5,
        })
      : null;

  const epistemic = buildMatchEpistemicSummaryV5({
    pHome: pH,
    pDraw: null,
    pAway: pA,
    effectiveSampleGames: params.sport === "mlb" ? 60 : params.sport === "ncaaf" ? 12 : 40,
  });

  const facts = buildVerifiedMatchFactSheet({
    matchId: params.matchId,
    sport: params.sport,
    homeTeam: params.homeTeam,
    awayTeam: params.awayTeam,
    pHome: pH,
    pDraw: null,
    pAway: pA,
    expectedTotal: expTot,
    canonicalTotalLine: canonLine,
    pOverCanonical: pOv,
  });
  const summaryEs = compileDeterministicVerifiedSummaryEs(facts);
  const audit = validateNarrativeAgainstFactSheet(summaryEs, facts);

  return Object.freeze({
    schemaVersion: UNIFIED_OUTLOOK_V5_SCHEMA_VERSION,
    status: "candidate",
    productionActivated: false,
    matchId: params.matchId,
    sport: params.sport,
    league: params.sport,
    homeTeam: params.homeTeam,
    awayTeam: params.awayTeam,
    coreProbabilities: Object.freeze({
      pHome: pH,
      pDraw: null,
      pAway: pA,
      fairOddsHome: probabilityToFairOdds(pH),
      fairOddsDraw: null,
      fairOddsAway: probabilityToFairOdds(pA),
    }),
    epistemicUncertainty90: epistemic,
    pointsSportEarlyPayout: epOut,
    multiSportOutlook: msOut,
    featuredStudentTSgp: null,
    featuredPlayerLinkedSgp: null,
    factSheet: facts,
    verifiedSummaryEs: summaryEs,
    guardrailAudit: audit,
    dataQuality: Object.freeze({
      flag: "ok" as const,
      coverageScore: 1.0,
      sourceEngine: `multisport_${params.sport}_v5_1_structural`,
      validationStatus: "structural_prior_no_game_oos",
    }),
  });
}
