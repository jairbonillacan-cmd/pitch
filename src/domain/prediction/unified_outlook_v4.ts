/**
 * PitchLab Unified Matchday Intelligence Hub (`v4.0 Candidate` · `EXP_V49`) —
 * Fachada maestra tipada que orquesta en una sola llamada determinista (`< 1 ms`, `0` red):
 *  - Fútbol (`Tachyon v4.0` + Matriz 4-Param Diagonal-Inflada + Micro-Mercados Sarmanov `v4.0` + SGP Copula)
 *  - NFL (`Minkowski v4.0` + PMF Números Clave `3/7/10/14` + Totales Calibrados + SGP Copula)
 *  - Multi-Sport `v4.0` (`MLB Kepler`, `NHL Curvature`, `NBA Tensor`, `NCAAF Horizon`)
 *  - Guardrail Determinista Anti-Alucinación (`VerifiedMatchFactSheet` + `verifiedSummaryEs`)
 *
 * Invariante estricto: `0` campos de `stake`, `kelly`, `ev` o `tier`; `service.ts` y `live_matchday_v3_snapshot.json`
 * permanecen 100% intactos.
 */

import {
  solveDiagonalInflatedScoreMatrix4Param,
  summarizeSoccerMarketsFromMatrixV4,
  type DerivedSoccerMarketsV4,
} from "./diagonal_score_matrix.js";
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
  validateNarrativeAgainstFactSheet,
  type GuardrailAuditResult,
  type VerifiedMatchFactSheet,
} from "./narrative_guardrail.js";
import {
  projectNflSpreadFromMarginPmfExact,
  projectNflTotalsOutlookV4,
  solveNflKeyNumberMarginPmfExact,
  type NflKeyNumbersModelArtifactV4,
  type NflSpreadProjectionV4,
  type NflTotalLineProjectionV4,
} from "./nfl_v4_0.js";
import { probabilityToFairOdds, type FairOdds } from "./outlook.js";
import {
  evaluateSameGameParlayCopula,
  type SgpCopulaEvaluation,
  type SgpCopulaPriorsArtifactV4,
} from "./sgp_copula.js";
import {
  buildSoccerMicroMatchOutlookV4,
  type MicroFeatureVectorInputV4,
  type SoccerMicroMatchOutlookV4,
  type SoccerMicroMetricKey,
  type SoccerMicroModelArtifactV4,
} from "./soccer_micro_markets.js";

export const UNIFIED_OUTLOOK_V4_SCHEMA_VERSION = "unified_match_intelligence_v4.0.0" as const;

export type UnifiedSportV4 = "soccer" | "nfl" | "mlb" | "nhl" | "nba" | "ncaaf";

export interface UnifiedMatchIntelligenceV4 {
  readonly schemaVersion: typeof UNIFIED_OUTLOOK_V4_SCHEMA_VERSION;
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
  readonly soccerMarkets?: DerivedSoccerMarketsV4;
  readonly soccerMicroMarkets?: SoccerMicroMatchOutlookV4;
  readonly nflMarkets?: {
    readonly expectedMargin: number;
    readonly pExactPlus3: number;
    readonly pExactMinus3: number;
    readonly keySpreads: readonly NflSpreadProjectionV4[];
    readonly totalsObjective: readonly NflTotalLineProjectionV4[];
    readonly marketTotalPosterior: NflTotalLineProjectionV4 | null;
  };
  readonly multiSportOutlook?: MLBV36Outlook | NHLV36Outlook | NBAV36Outlook | NCAAFV40Outlook;
  readonly featuredSameGameParlay: SgpCopulaEvaluation | null;
  readonly factSheet: VerifiedMatchFactSheet;
  readonly verifiedSummaryEs: string;
  readonly guardrailAudit: GuardrailAuditResult;
  readonly dataQuality: {
    readonly flag: "ok";
    readonly coverageScore: 1.0;
  };
}

export function buildUnifiedSoccerMatchIntelligenceV4(params: {
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
  readonly microArtifact: SoccerMicroModelArtifactV4;
  readonly sgpArtifact: SgpCopulaPriorsArtifactV4;
  readonly microFeaturesOverride?: Readonly<Record<SoccerMicroMetricKey, MicroFeatureVectorInputV4>>;
}): UnifiedMatchIntelligenceV4 {
  const sol4 = solveDiagonalInflatedScoreMatrix4Param({
    pHome: params.pHome,
    pDraw: params.pDraw,
    pAway: params.pAway,
    totalGoalsTarget: params.totalGoalsTarget,
    rhoPrior: params.rhoPrior ?? -0.105,
    dispersionR: params.dispersionR ?? 500.0,
  });
  const socMarkets = summarizeSoccerMarketsFromMatrixV4(sol4.matrix);

  // Derivar tasas base por división si no se pasan overrides explícitos
  const lh = sol4.muHome;
  const la = sol4.muAway;
  const supH = lh - la;
  const supA = -supH;
  const siegeH = Math.pow(Math.max(0.0, supH), 1.4) - 0.5 * Math.pow(Math.max(0.0, -supH), 1.2);
  const siegeA = Math.pow(Math.max(0.0, supA), 1.4) - 0.5 * Math.pow(Math.max(0.0, -supA), 1.2);
  const tempoExc = lh + la - 2.65;
  const tightness = Math.exp(-Math.abs(supH)) - 0.55;
  const dp = params.microArtifact.div_priors[params.div];

  const metricKeys: readonly SoccerMicroMetricKey[] = [
    "corners",
    "yellow_cards",
    "fouls",
    "shots_on_target",
    "shots",
  ];
  const defaultMicroFeats = {} as Record<SoccerMicroMetricKey, MicroFeatureVectorInputV4>;
  for (const q of metricKeys) {
    const sp = params.microArtifact.metrics[q];
    const bh = dp?.metrics[q]?.home_mean ?? sp.default_home_rate;
    const ba = dp?.metrics[q]?.away_mean ?? sp.default_away_rate;
    defaultMicroFeats[q] = {
      homeFeatures8: [Math.log(Math.max(bh, 0.12)), supH, siegeH, tempoExc, tightness, 0.0, 0.0, 0.0],
      awayFeatures8: [Math.log(Math.max(ba, 0.12)), supA, siegeA, tempoExc, tightness, 0.0, 0.0, 0.0],
    };
  }

  const microOut = buildSoccerMicroMatchOutlookV4({
    matchId: params.matchId,
    div: params.div,
    homeTeam: params.homeTeam,
    awayTeam: params.awayTeam,
    lamHome: lh,
    lamAway: la,
    featuresByMetric: params.microFeaturesOverride ?? defaultMicroFeats,
    modelArtifact: params.microArtifact,
  });

  const sgpSample = evaluateSameGameParlayCopula({
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
    artifact: params.sgpArtifact,
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
  const audit = validateNarrativeAgainstFactSheet(summaryEs, facts);

  return Object.freeze({
    schemaVersion: UNIFIED_OUTLOOK_V4_SCHEMA_VERSION,
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
    soccerMarkets: socMarkets,
    soccerMicroMarkets: microOut,
    featuredSameGameParlay: sgpSample,
    factSheet: facts,
    verifiedSummaryEs: summaryEs,
    guardrailAudit: audit,
    dataQuality: Object.freeze({ flag: "ok" as const, coverageScore: 1.0 as const }),
  });
}

export function buildUnifiedNflMatchIntelligenceV4(params: {
  readonly matchId: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly pHome: number;
  readonly pTie: number;
  readonly pAway: number;
  readonly modelExpectedTotal: number;
  readonly marketTotalLine?: number | null;
  readonly keyNumbersArtifact: NflKeyNumbersModelArtifactV4;
  readonly sgpArtifact: SgpCopulaPriorsArtifactV4;
}): UnifiedMatchIntelligenceV4 {
  const sol = solveNflKeyNumberMarginPmfExact({
    pHome: params.pHome,
    pTie: params.pTie,
    pAway: params.pAway,
    artifact: params.keyNumbersArtifact,
  });
  const center = sol.maxAbsMargin;
  const keySpreads = [-7.0, -3.5, -3.0, -2.5, 3.0, 7.0].map((ln) =>
    projectNflSpreadFromMarginPmfExact(sol, ln),
  );
  const totOut = projectNflTotalsOutlookV4({
    modelExpectedTotal: params.modelExpectedTotal,
    artifact: params.keyNumbersArtifact,
    marketTotalLine: params.marketTotalLine ?? null,
  });

  const pWin2Way = clamp(params.pHome / Math.max(params.pHome + params.pAway, 1e-9), 0.001, 0.999);
  const pOver445 =
    totOut.objectiveProjections.find((t) => Math.abs(t.totalLine - 44.5) < 1e-6)?.pOverNoPush ?? 0.5;

  const sgpSample = evaluateSameGameParlayCopula({
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
    artifact: params.sgpArtifact,
  });

  const facts = buildVerifiedMatchFactSheet({
    matchId: params.matchId,
    sport: "nfl",
    homeTeam: params.homeTeam,
    awayTeam: params.awayTeam,
    pHome: pWin2Way,
    pDraw: null,
    pAway: 1.0 - pWin2Way,
    expectedTotal: params.modelExpectedTotal,
    canonicalTotalLine: 44.5,
    pOverCanonical: pOver445,
  });
  const summaryEs = compileDeterministicVerifiedSummaryEs(facts);
  const audit = validateNarrativeAgainstFactSheet(summaryEs, facts);

  return Object.freeze({
    schemaVersion: UNIFIED_OUTLOOK_V4_SCHEMA_VERSION,
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
    nflMarkets: Object.freeze({
      expectedMargin: sol.expectedMargin,
      pExactPlus3: sol.pmf[center + 3]!,
      pExactMinus3: sol.pmf[center - 3]!,
      keySpreads: Object.freeze(keySpreads),
      totalsObjective: totOut.objectiveProjections,
      marketTotalPosterior: totOut.marketPosteriorProjection,
    }),
    featuredSameGameParlay: sgpSample,
    factSheet: facts,
    verifiedSummaryEs: summaryEs,
    guardrailAudit: audit,
    dataQuality: Object.freeze({ flag: "ok" as const, coverageScore: 1.0 as const }),
  });
}

export function buildUnifiedMultiSportMatchIntelligenceV4(params: {
  readonly matchId: string;
  readonly sport: "mlb" | "nhl" | "nba" | "ncaaf";
  readonly homeKey: string;
  readonly awayKey: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly stateArtifact: MultiSportV40StateArtifact;
  readonly neutralSite?: boolean;
}): UnifiedMatchIntelligenceV4 {
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
    schemaVersion: UNIFIED_OUTLOOK_V4_SCHEMA_VERSION,
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
    multiSportOutlook: msOut,
    featuredSameGameParlay: null,
    factSheet: facts,
    verifiedSummaryEs: summaryEs,
    guardrailAudit: audit,
    dataQuality: Object.freeze({ flag: "ok" as const, coverageScore: 1.0 as const }),
  });
}
