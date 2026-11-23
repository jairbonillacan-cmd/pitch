import {
  buildMatchEpistemicSummaryV5,
  type EpistemicConformalArtifactV51,
  type MatchEpistemicSummaryV5,
} from "./epistemic_conformal";
import {
  evaluateSoccerEarlyPayoutAndInPlay,
  type InPlayEarlyPayoutArtifactV5,
  type SoccerEarlyPayoutAndInPlayResult,
} from "./inplay_and_early_payout";
import { clamp } from "./math";
import {
  projectMlbWalkforwardOutlookV60,
  projectMultiSportMatchupFromStateV60,
  projectNbaWalkforwardOutlookV60,
  projectNflWalkforwardOutlookV60,
  projectNhlWalkforwardOutlookV60,
  type MlbWalkforwardInputV60,
  type MultiSportLeagueV60,
  type MultiSportModelArtifactV60,
  type MultiSportWalkforwardOutlookV60,
  type NbaWalkforwardInputV60,
  type NflWalkforwardInputV60,
  type NhlWalkforwardInputV60,
} from "./multisport_v6_0";
import {
  buildVerifiedMatchFactSheet,
  compileDeterministicVerifiedSummaryEs,
  validateMatchMathematicalInvariants,
  validateNarrativeAgainstFactSheet,
  type GuardrailAuditResult,
  type MathematicalInvariantCheckInput,
  type VerifiedMatchFactSheet,
} from "./narrative_guardrail";
import { probabilityToFairOdds, type FairOdds } from "./outlook";
import {
  resolveOfficialPriorV6,
  sealPreKickoffOutlookV6,
  type IncomingCausalityStatusV6,
  type LifecycleStatusV6,
  type OfficialsFreezeModelArtifactV6,
  type PreKickoffAnalysisPayloadV6,
  type ResolvedOfficialPriorV6,
  type SealActionV6,
  type SealCausalityStatusV6,
  type SealOriginV6,
  type SealedPreKickoffRecordV6,
} from "./prekickoff_freeze_v6_0";
import {
  evaluateGoalkeeperSavesLinkedSgpV6,
  projectCoupledPlayerShotsMultiLineV6,
  projectGoalkeeperSavesMultiLineV6,
  projectUsPlayerPropV6,
  type CoupledPlayerShotsMultiLineOutlookV6,
  type GoalkeeperSavesLinkedSgpResultV6,
  type GoalkeeperSavesMultiLineOutlookV6,
  type PropsV6ModelArtifact,
  type UsPlayerPropOutlookV6,
} from "./props_v6_0";
import {
  calibratePlayableVennAbersLogitV60,
  projectSoccer57MatchV60,
  recalibrateSoccer57PrekickoffV60,
  type CoherentSoccerMarketsV60,
  type CompetitionStatusV60,
  type ConfederationGroupV60,
  type Soccer57ModelArtifactV60,
  type VennAbersPlayableEvaluationV60,
} from "./soccer_57_v6_0";

export const UNIFIED_OUTLOOK_V6_SCHEMA_VERSION = "unified_match_intelligence_v6.0.0" as const;

export type UnifiedSportV6 = "soccer" | MultiSportLeagueV60;

export interface UnifiedArtifactsBundleV6 {
  readonly soccer57ArtifactV6: Soccer57ModelArtifactV60;
  readonly propsArtifactV6: PropsV6ModelArtifact;
  readonly multisportArtifactV6: MultiSportModelArtifactV60;
  readonly officialsArtifactV6: OfficialsFreezeModelArtifactV6;
  readonly epistemicArtifactV51: EpistemicConformalArtifactV51;
  readonly inplayArtifactV5: InPlayEarlyPayoutArtifactV5;
}

export interface FeaturedSoccerFieldPlayerInputV6 {
  readonly playerName: string;
  readonly side: "home" | "away";
  readonly positionGroup: string;
  readonly seasonShots: number;
  readonly seasonSoT: number;
  readonly appearances: number;
  readonly subIns: number;
  readonly availability?: string | null;
  readonly injuryStatus?: string | null;
}

export interface FeaturedSoccerGoalkeeperInputV6 {
  readonly playerName: string;
  readonly side: "home" | "away";
  readonly saves: number;
  readonly shotsFaced: number;
  readonly goalsConceded: number;
  readonly appearances: number;
  readonly subIns: number;
  readonly availability?: string | null;
  readonly injuryStatus?: string | null;
}

export interface FeaturedUsPlayerPropInputV6 {
  readonly playerName: string;
  readonly side: "home" | "away";
  readonly positionLabel?: string | null;
  readonly metric: string;
  readonly sampleSum: number;
  readonly sampleGames: number;
  readonly line?: number | null;
  readonly prematchMinutes?: number | null;
  readonly sampleVariance?: number | null;
  readonly availability?: string | null;
  readonly injuryStatus?: string | null;
}

export interface UnifiedSoccerInputDetailV6 {
  readonly mode: "causal_team_state" | "prekickoff_recalibration";
  readonly homeElo: number;
  readonly awayElo: number;
  readonly homeAttEwm: number;
  readonly homeDefEwm: number;
  readonly homeGames: number;
  readonly awayAttEwm: number;
  readonly awayDefEwm: number;
  readonly awayGames: number;
  readonly leagueEnvGoals: number;
  readonly seasonProgress: number;
  readonly rawProjHome?: number | null;
  readonly rawProjAway?: number | null;
  readonly rawX12?: readonly [number, number, number] | null;
  readonly featuredFieldPlayer?: FeaturedSoccerFieldPlayerInputV6 | null;
  readonly featuredGoalkeeper?: FeaturedSoccerGoalkeeperInputV6 | null;
}

export interface UnifiedUsSportInputDetailV6 {
  readonly mode: "post_walkforward_state" | "causal_walkforward_input";
  readonly gameDate: string;
  readonly totalLine?: number | null;
  readonly spreadLineHome?: number | null;
  readonly effectiveSampleGames: number;
  readonly seasonProgress: number;
  readonly mlbCausalInput?: MlbWalkforwardInputV60 | null;
  readonly nhlCausalInput?: NhlWalkforwardInputV60 | null;
  readonly nbaCausalInput?: NbaWalkforwardInputV60 | null;
  readonly nflCausalInput?: NflWalkforwardInputV60 | null;
  readonly featuredUsPlayerProp?: FeaturedUsPlayerPropInputV6 | null;
}

export interface UnifiedMatchCanonicalInputV6 {
  readonly matchId: string;
  readonly sport: UnifiedSportV6;
  readonly league: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly homeSlug: string;
  readonly awaySlug: string;
  readonly kickoffUtc: string;
  readonly lifecycleStatus: string;
  readonly neutralSite: boolean;
  readonly refereeName?: string | null;
  readonly causalInputsAsOfUtc: string;
  readonly rawUpstreamAnalysis?: PreKickoffAnalysisPayloadV6 | null;
  readonly existingSealedRecord?: SealedPreKickoffRecordV6 | null;
  readonly soccerInput?: UnifiedSoccerInputDetailV6 | null;
  readonly usSportInput?: UnifiedUsSportInputDetailV6 | null;
}

export interface UnifiedEarlyPayoutSummaryV6 {
  readonly triggerLead: number;
  readonly pHomeRegularWin: number;
  readonly pAwayRegularWin: number;
  readonly pHomeEarlyPayoutWin: number;
  readonly pAwayEarlyPayoutWin: number;
  readonly homeEarlyPayoutLift: number;
  readonly awayEarlyPayoutLift: number;
  readonly pBothSidesTriggerEarlyPayout: number | null;
}

export interface UnifiedSoccerIntelligenceBlockV6 {
  readonly mode: "causal_team_state" | "prekickoff_recalibration";
  readonly confederationGroup: ConfederationGroupV60;
  readonly competitionStatus: CompetitionStatusV60;
  readonly pHomeTarget: number;
  readonly pDrawTarget: number;
  readonly pAwayTarget: number;
  readonly muHome: number;
  readonly muAway: number;
  readonly rhoEff: number;
  readonly dispersionR: number;
  readonly totalGoalsTarget: number;
  readonly expectedTotalImplied: number;
  readonly coneError1x2: number;
  readonly totalImpliedError: number;
  readonly markets: CoherentSoccerMarketsV60;
  readonly playableVennAbers: {
    readonly home: VennAbersPlayableEvaluationV60;
    readonly away: VennAbersPlayableEvaluationV60;
    readonly over25: VennAbersPlayableEvaluationV60;
    readonly under25: VennAbersPlayableEvaluationV60;
    readonly bttsYes: VennAbersPlayableEvaluationV60;
  };
  readonly inPlayPregameAnchor: SoccerEarlyPayoutAndInPlayResult;
}

export interface UnifiedFeaturedPropsBlockV6 {
  readonly fieldPlayerShots: {
    readonly playerName: string;
    readonly side: "home" | "away";
    readonly shotsOutlook: CoupledPlayerShotsMultiLineOutlookV6;
    readonly shotsOnTargetOutlook: CoupledPlayerShotsMultiLineOutlookV6;
  } | null;
  readonly goalkeeperSaves: {
    readonly playerName: string;
    readonly side: "home" | "away";
    readonly savesOutlook: GoalkeeperSavesMultiLineOutlookV6;
    readonly linkedCleanSheetSgp: GoalkeeperSavesLinkedSgpResultV6 | null;
  } | null;
  readonly usPlayerProp: {
    readonly playerName: string;
    readonly side: "home" | "away";
    readonly propOutlook: UsPlayerPropOutlookV6;
  } | null;
}

export interface UnifiedPreKickoffSealSummaryV6 {
  readonly hasForecast: boolean;
  readonly causalityStatus: SealCausalityStatusV6;
  readonly incomingCausalityStatus: IncomingCausalityStatusV6;
  readonly sealAction: SealActionV6;
  readonly incomingContaminatedRejected: boolean;
  readonly sealOrigin: SealOriginV6;
  readonly inputsAsOfUtc: string;
  readonly kickoffUtc: string;
  readonly leadTimeSeconds: number;
  readonly preKickoffSealSha256: string;
}

export interface UnifiedMatchIntelligenceV6 {
  readonly schemaVersion: typeof UNIFIED_OUTLOOK_V6_SCHEMA_VERSION;
  readonly status: "candidate";
  readonly productionActivated: false;
  readonly matchId: string;
  readonly sport: UnifiedSportV6;
  readonly league: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly kickoffUtc: string;
  readonly lifecycleStatus: LifecycleStatusV6;
  readonly coreProbabilities: {
    readonly pHome: number;
    readonly pDraw: number | null;
    readonly pAway: number;
    readonly fairOddsHome: FairOdds;
    readonly fairOddsDraw: FairOdds | null;
    readonly fairOddsAway: FairOdds;
  };
  readonly epistemicUncertainty90: MatchEpistemicSummaryV5;
  readonly earlyPayout: UnifiedEarlyPayoutSummaryV6;
  readonly officialPrior: ResolvedOfficialPriorV6;
  readonly soccerV6: UnifiedSoccerIntelligenceBlockV6 | null;
  readonly multiSportV6: MultiSportWalkforwardOutlookV60 | null;
  readonly featuredPropsV6: UnifiedFeaturedPropsBlockV6;
  readonly preKickoffSeal: UnifiedPreKickoffSealSummaryV6;
  readonly factSheet: VerifiedMatchFactSheet;
  readonly verifiedSummaryEs: string;
  readonly guardrailAudit: GuardrailAuditResult;
  readonly dataQuality: {
    readonly flag: "ok" | "partial_coverage" | "fallback_prior";
    readonly coverageScore: number;
    readonly sourceEngine: string;
    readonly validationStatus: string;
  };
}

export function quantizeForSealV6(x: number): number {
  const scaled = Math.floor(x * 1e9 + 0.5) / 1e9;
  return Object.is(scaled, -0) ? 0 : scaled;
}

function executeSealContractV6(params: {
  readonly input: UnifiedMatchCanonicalInputV6;
  readonly sportForSeal: string;
  readonly causalAnalysisPayload: PreKickoffAnalysisPayloadV6;
}): UnifiedPreKickoffSealSummaryV6 {
  const rawInc = params.input.rawUpstreamAnalysis ?? null;
  const existing = params.input.existingSealedRecord ?? null;
  const stLow = params.input.lifecycleStatus.trim().toLowerCase();
  const isScheduled =
    stLow === "scheduled" ||
    stLow === "ns" ||
    stLow === "not_started" ||
    stLow === "pre" ||
    stLow === "upcoming";

  const outcome =
    rawInc !== null
      ? sealPreKickoffOutlookV6({
          matchId: params.input.matchId,
          sport: params.sportForSeal,
          league: params.input.league,
          homeTeam: params.input.homeTeam,
          awayTeam: params.input.awayTeam,
          kickoffUtc: params.input.kickoffUtc,
          status: params.input.lifecycleStatus,
          incomingAnalysis: rawInc,
          existingSealedRecord: existing,
          causalBackfillAnalysis: params.causalAnalysisPayload,
          allowPreKickoffRefresh: false,
        })
      : isScheduled
        ? sealPreKickoffOutlookV6({
            matchId: params.input.matchId,
            sport: params.sportForSeal,
            league: params.input.league,
            homeTeam: params.input.homeTeam,
            awayTeam: params.input.awayTeam,
            kickoffUtc: params.input.kickoffUtc,
            status: params.input.lifecycleStatus,
            incomingAnalysis: params.causalAnalysisPayload,
            existingSealedRecord: existing,
            causalBackfillAnalysis: null,
            allowPreKickoffRefresh: false,
          })
        : sealPreKickoffOutlookV6({
            matchId: params.input.matchId,
            sport: params.sportForSeal,
            league: params.input.league,
            homeTeam: params.input.homeTeam,
            awayTeam: params.input.awayTeam,
            kickoffUtc: params.input.kickoffUtc,
            status: params.input.lifecycleStatus,
            incomingAnalysis: null,
            existingSealedRecord: existing,
            causalBackfillAnalysis: params.causalAnalysisPayload,
            allowPreKickoffRefresh: false,
          });

  if (!outcome.hasForecast || outcome.sealedRecord === null) {
    throw new Error(
      `PreKickoffFreezeContractError on ${params.input.matchId}: unsealed outcome (${outcome.sealAction})`,
    );
  }

  return Object.freeze({
    hasForecast: outcome.hasForecast,
    causalityStatus: outcome.causalityStatus,
    incomingCausalityStatus: outcome.incomingCausalityStatus,
    sealAction: outcome.sealAction,
    incomingContaminatedRejected: outcome.incomingContaminatedRejected,
    sealOrigin: outcome.sealedRecord.sealOrigin,
    inputsAsOfUtc: outcome.sealedRecord.inputsAsOfUtc,
    kickoffUtc: outcome.sealedRecord.kickoffUtc,
    leadTimeSeconds: outcome.sealedRecord.leadTimeSeconds,
    preKickoffSealSha256: outcome.sealedRecord.sealSha256,
  });
}

export function buildUnifiedSoccerMatchIntelligenceV6(
  input: UnifiedMatchCanonicalInputV6,
  artifacts: UnifiedArtifactsBundleV6,
): UnifiedMatchIntelligenceV6 {
  const socIn = input.soccerInput;
  if (!socIn) {
    throw new Error(`Missing soccerInput for soccer match ${input.matchId}`);
  }

  const compSpec = artifacts.soccer57ArtifactV6.competitions[input.league];
  if (!compSpec) {
    throw new Error(`Unregistered competition in Soccer-57 v6.0 artifact: ${input.league}`);
  }
  const confGroup = compSpec.confederation_group;
  const isExpOrCup = Boolean(compSpec.is_cup || confGroup !== "UEFA_TOP");
  const vaCfg = artifacts.soccer57ArtifactV6.venn_abers_playable_calibrator;

  let pHomeTarget: number;
  let pDrawTarget: number;
  let pAwayTarget: number;
  let muHome: number;
  let muAway: number;
  let rhoEff: number;
  let dispersionR: number;
  let totalGoalsTarget: number;
  let expectedTotalImplied: number;
  let markets: CoherentSoccerMarketsV60;

  if (
    socIn.mode === "prekickoff_recalibration" &&
    typeof socIn.rawProjHome === "number" &&
    typeof socIn.rawProjAway === "number" &&
    socIn.rawX12 !== null &&
    socIn.rawX12 !== undefined
  ) {
    const rec = recalibrateSoccer57PrekickoffV60({
      league: input.league,
      rawProjHome: socIn.rawProjHome,
      rawProjAway: socIn.rawProjAway,
      rawX12: socIn.rawX12,
      causalLeagueEnvGoals: socIn.leagueEnvGoals,
      artifact: artifacts.soccer57ArtifactV6,
    });
    pHomeTarget = rec.pHomeTarget;
    pDrawTarget = rec.pDrawTarget;
    pAwayTarget = rec.pAwayTarget;
    muHome = rec.muHome;
    muAway = rec.muAway;
    rhoEff = rec.rhoEff;
    dispersionR = rec.dispersionR;
    totalGoalsTarget = rec.totalGoalsTarget;
    expectedTotalImplied = rec.expectedTotalImplied;
    markets = rec.markets;
  } else {
    const proj = projectSoccer57MatchV60({
      league: input.league,
      homeElo: socIn.homeElo,
      awayElo: socIn.awayElo,
      homeAttEwm: socIn.homeAttEwm,
      homeDefEwm: socIn.homeDefEwm,
      homeGames: socIn.homeGames,
      awayAttEwm: socIn.awayAttEwm,
      awayDefEwm: socIn.awayDefEwm,
      awayGames: socIn.awayGames,
      leagueEnvGoals: socIn.leagueEnvGoals,
      neutralSite: input.neutralSite,
      artifact: artifacts.soccer57ArtifactV6,
    });
    pHomeTarget = proj.pHomeTarget;
    pDrawTarget = proj.pDrawTarget;
    pAwayTarget = proj.pAwayTarget;
    muHome = proj.muHome;
    muAway = proj.muAway;
    rhoEff = proj.rhoEff;
    dispersionR = proj.dispersionR;
    totalGoalsTarget = proj.totalGoalsTarget;
    expectedTotalImplied = proj.expectedTotalImplied;
    markets = proj.markets;
  }

  const corePHome = markets["1x2"].home;
  const corePDraw = markets["1x2"].draw;
  const corePAway = markets["1x2"].away;

  const coneError1x2 = Math.max(
    Math.abs(corePHome - pHomeTarget),
    Math.abs(corePDraw - pDrawTarget),
    Math.abs(corePAway - pAwayTarget),
    Math.abs(corePHome + corePDraw + corePAway - 1.0),
  );
  const totalImpliedError = Math.abs(expectedTotalImplied - totalGoalsTarget);

  const playableVa = Object.freeze({
    home: calibratePlayableVennAbersLogitV60(corePHome, isExpOrCup, vaCfg),
    away: calibratePlayableVennAbersLogitV60(corePAway, isExpOrCup, vaCfg),
    over25: calibratePlayableVennAbersLogitV60(markets.totals_2_5.over, isExpOrCup, vaCfg),
    under25: calibratePlayableVennAbersLogitV60(markets.totals_2_5.under, isExpOrCup, vaCfg),
    bttsYes: calibratePlayableVennAbersLogitV60(markets.btts.yes, isExpOrCup, vaCfg),
  });

  const officialPrior = resolveOfficialPriorV6({
    refereeName: input.refereeName ?? null,
    league: input.league,
    artifact: artifacts.officialsArtifactV6,
  });

  const epAndInPlay = evaluateSoccerEarlyPayoutAndInPlay({
    pregameMuHome: muHome,
    pregameMuAway: muAway,
    currentMinute: 0,
    currentHomeGoals: 0,
    currentAwayGoals: 0,
    redCardsHome: 0,
    redCardsAway: 0,
    corePHome,
    corePDraw,
    corePAway,
    artifact: artifacts.inplayArtifactV5,
  });

  const effGames = Math.max(4, Math.min(socIn.homeGames, socIn.awayGames) + 6);
  const epistemic = buildMatchEpistemicSummaryV5({
    pHome: corePHome,
    pDraw: corePDraw,
    pAway: corePAway,
    effectiveSampleGames: effGames,
    pLogitHome: pHomeTarget,
    pGbmHome: playableVa.home.pCalibrated,
    pLogitDraw: pDrawTarget,
    pGbmDraw: corePDraw,
    pLogitAway: pAwayTarget,
    pGbmAway: playableVa.away.pCalibrated,
    seasonProgress: socIn.seasonProgress,
    sport: "soccer",
    calibrationArtifact: artifacts.epistemicArtifactV51,
  });

  const estHomeShots = clamp(9.2 + 3.1 * muHome, 5.5, 22.0);
  const estAwayShots = clamp(8.6 + 3.0 * muAway, 5.0, 21.0);
  const estHomeSoT = clamp(1.25 + 2.25 * muHome, 1.8, 10.5);
  const estAwaySoT = clamp(1.15 + 2.2 * muAway, 1.6, 10.0);

  let fieldPlayerBlock: UnifiedFeaturedPropsBlockV6["fieldPlayerShots"] = null;
  if (socIn.featuredFieldPlayer) {
    const fp = socIn.featuredFieldPlayer;
    const tmSh = fp.side === "home" ? estHomeShots : estAwayShots;
    const tmSot = fp.side === "home" ? estHomeSoT : estAwaySoT;
    const shOut = projectCoupledPlayerShotsMultiLineV6({
      metric: "shots",
      positionGroup: fp.positionGroup,
      seasonCount: fp.seasonShots,
      appearances: fp.appearances,
      subIns: fp.subIns,
      teamExpectedShots: tmSh,
      teamExpectedSoT: tmSot,
      oppDefenseFactor: 1.0,
      availability: fp.availability ?? "available",
      injuryStatus: fp.injuryStatus ?? null,
      artifact: artifacts.propsArtifactV6,
    });
    const sotOut = projectCoupledPlayerShotsMultiLineV6({
      metric: "shots_on_target",
      positionGroup: fp.positionGroup,
      seasonCount: fp.seasonSoT,
      seasonShotsTotal: fp.seasonShots,
      appearances: fp.appearances,
      subIns: fp.subIns,
      teamExpectedShots: tmSh,
      teamExpectedSoT: tmSot,
      oppDefenseFactor: 1.0,
      availability: fp.availability ?? "available",
      injuryStatus: fp.injuryStatus ?? null,
      artifact: artifacts.propsArtifactV6,
    });
    if (shOut.eligible && sotOut.eligible) {
      fieldPlayerBlock = Object.freeze({
        playerName: fp.playerName,
        side: fp.side,
        shotsOutlook: shOut,
        shotsOnTargetOutlook: sotOut,
      });
    }
  }

  let gkBlock: UnifiedFeaturedPropsBlockV6["goalkeeperSaves"] = null;
  const sgpChecks: Array<{
    readonly label: string;
    readonly legProbs: readonly number[];
    readonly jointProbability: number;
  }> = [];

  if (socIn.featuredGoalkeeper) {
    const gk = socIn.featuredGoalkeeper;
    const oppSot = gk.side === "home" ? estAwaySoT : estHomeSoT;
    const ownGoalsExp = gk.side === "home" ? muHome : muAway;
    const oppGoalsExp = gk.side === "home" ? muAway : muHome;
    const svOut = projectGoalkeeperSavesMultiLineV6({
      saves: gk.saves,
      shotsFaced: gk.shotsFaced,
      goalsConceded: gk.goalsConceded,
      appearances: gk.appearances,
      subIns: gk.subIns,
      oppExpectedSoT: oppSot,
      availability: gk.availability ?? "available",
      injuryStatus: gk.injuryStatus ?? null,
      artifact: artifacts.propsArtifactV6,
    });
    if (svOut.eligible) {
      const gkSgp = evaluateGoalkeeperSavesLinkedSgpV6({
        savesLine: 2.5,
        ebSaveRate: svOut.ebSaveRate,
        oppExpectedSoT: oppSot,
        teamExpectedGoals: ownGoalsExp,
        opponentExpectedGoals: oppGoalsExp,
        matchOutcome: "clean_sheet",
        expectedMinutes: svOut.expectedMinutes,
        rDispersionSoT: svOut.rDispersionSoT,
        dixonColesRho: rhoEff,
        siegeOwnGoalDampening:
          artifacts.propsArtifactV6.goalkeeper_saves_v6.siege_own_goal_dampening ?? 0.028,
      });
      sgpChecks.push({
        label: `gk_saves_2_5_clean_sheet:${gk.playerName}`,
        legProbs: [gkSgp.pSavesOverMarginal, gkSgp.pMatchOutcomeMarginal],
        jointProbability: gkSgp.jointProbability,
      });
      gkBlock = Object.freeze({
        playerName: gk.playerName,
        side: gk.side,
        savesOutlook: svOut,
        linkedCleanSheetSgp: gkSgp,
      });
    }
  }

  const causalPayload: PreKickoffAnalysisPayloadV6 = Object.freeze({
    inputsAsOfUtc: input.causalInputsAsOfUtc,
    probabilities: Object.freeze({
      pAway: quantizeForSealV6(corePAway),
      pBttsYes: quantizeForSealV6(markets.btts.yes),
      pDraw: quantizeForSealV6(corePDraw),
      pHome: quantizeForSealV6(corePHome),
      pOver25: quantizeForSealV6(markets.totals_2_5.over),
    }),
    projection: Object.freeze({
      away: quantizeForSealV6(muAway),
      home: quantizeForSealV6(muHome),
      margin: quantizeForSealV6(muHome - muAway),
      total: quantizeForSealV6(expectedTotalImplied),
    }),
  });

  const sealSummary = executeSealContractV6({
    input,
    sportForSeal: "football",
    causalAnalysisPayload: causalPayload,
  });

  const facts = buildVerifiedMatchFactSheet({
    matchId: input.matchId,
    sport: "soccer",
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    pHome: corePHome,
    pDraw: corePDraw,
    pAway: corePAway,
    expectedTotal: expectedTotalImplied,
    canonicalTotalLine: 2.5,
    pOverCanonical: markets.totals_2_5.over,
  });
  const verifiedSummaryEs = compileDeterministicVerifiedSummaryEs(facts);
  const textAudit = validateNarrativeAgainstFactSheet(verifiedSummaryEs, facts);
  const mathCheckInput: MathematicalInvariantCheckInput = {
    pHome: corePHome,
    pDraw: corePDraw,
    pAway: corePAway,
    pHomeEarlyPayoutWin: epAndInPlay.earlyPayout2Goals.pHomeEarlyPayoutWin,
    pAwayEarlyPayoutWin: epAndInPlay.earlyPayout2Goals.pAwayEarlyPayoutWin,
    epistemicBands: [
      { label: "home", ...epistemic.homeBand90 },
      ...(epistemic.drawBand90 ? [{ label: "draw", ...epistemic.drawBand90 }] : []),
      { label: "away", ...epistemic.awayBand90 },
    ],
    sgpChecks,
  };
  const mathAudit = validateMatchMathematicalInvariants(mathCheckInput);
  const guardrailAudit: GuardrailAuditResult = Object.freeze({
    passed: textAudit.passed && mathAudit.passed,
    violations: Object.freeze([...textAudit.violations, ...mathAudit.violations]),
  });

  const isPriorOnly = compSpec.competition_status === "confederation_prior_zero_2026_games";
  const dqFlag: UnifiedMatchIntelligenceV6["dataQuality"]["flag"] = isPriorOnly
    ? "fallback_prior"
    : socIn.homeGames > 0 && socIn.awayGames > 0
      ? "ok"
      : "partial_coverage";
  const covScore = isPriorOnly ? 0.75 : socIn.homeGames > 0 && socIn.awayGames > 0 ? 1.0 : 0.88;

  return Object.freeze({
    schemaVersion: UNIFIED_OUTLOOK_V6_SCHEMA_VERSION,
    status: "candidate",
    productionActivated: false,
    matchId: input.matchId,
    sport: "soccer",
    league: input.league,
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    kickoffUtc: input.kickoffUtc,
    lifecycleStatus: sealSummary.hasForecast
      ? (input.lifecycleStatus.trim().toLowerCase() === "final" ||
        input.lifecycleStatus.trim().toLowerCase() === "ft" ||
        input.lifecycleStatus.trim().toLowerCase() === "finished"
          ? "FT"
          : input.lifecycleStatus.trim().toLowerCase() === "in_progress" ||
              input.lifecycleStatus.trim().toLowerCase() === "live"
            ? "LIVE"
            : "scheduled")
      : "scheduled",
    coreProbabilities: Object.freeze({
      pHome: corePHome,
      pDraw: corePDraw,
      pAway: corePAway,
      fairOddsHome: markets["1x2"].fairOddsHome,
      fairOddsDraw: markets["1x2"].fairOddsDraw,
      fairOddsAway: markets["1x2"].fairOddsAway,
    }),
    epistemicUncertainty90: epistemic,
    earlyPayout: Object.freeze({
      triggerLead: 2,
      pHomeRegularWin: corePHome,
      pAwayRegularWin: corePAway,
      pHomeEarlyPayoutWin: epAndInPlay.earlyPayout2Goals.pHomeEarlyPayoutWin,
      pAwayEarlyPayoutWin: epAndInPlay.earlyPayout2Goals.pAwayEarlyPayoutWin,
      homeEarlyPayoutLift: epAndInPlay.earlyPayout2Goals.homeEarlyPayoutLift,
      awayEarlyPayoutLift: epAndInPlay.earlyPayout2Goals.awayEarlyPayoutLift,
      pBothSidesTriggerEarlyPayout: epAndInPlay.earlyPayout2Goals.pBothSidesTriggerEarlyPayout,
    }),
    officialPrior,
    soccerV6: Object.freeze({
      mode: socIn.mode,
      confederationGroup: confGroup,
      competitionStatus: compSpec.competition_status,
      pHomeTarget,
      pDrawTarget,
      pAwayTarget,
      muHome,
      muAway,
      rhoEff,
      dispersionR,
      totalGoalsTarget,
      expectedTotalImplied,
      coneError1x2,
      totalImpliedError,
      markets,
      playableVennAbers: playableVa,
      inPlayPregameAnchor: epAndInPlay,
    }),
    multiSportV6: null,
    featuredPropsV6: Object.freeze({
      fieldPlayerShots: fieldPlayerBlock,
      goalkeeperSaves: gkBlock,
      usPlayerProp: null,
    }),
    preKickoffSeal: sealSummary,
    factSheet: facts,
    verifiedSummaryEs,
    guardrailAudit,
    dataQuality: Object.freeze({
      flag: dqFlag,
      coverageScore: covScore,
      sourceEngine: "soccer_57_v6_0_4param_venn_abers",
      validationStatus: compSpec.competition_status,
    }),
  });
}

export function buildUnifiedUsSportMatchIntelligenceV6(
  input: UnifiedMatchCanonicalInputV6,
  artifacts: UnifiedArtifactsBundleV6,
): UnifiedMatchIntelligenceV6 {
  if (input.sport === "soccer") {
    throw new Error(`Invalid sport 'soccer' in buildUnifiedUsSportMatchIntelligenceV6`);
  }
  const usIn = input.usSportInput;
  if (!usIn) {
    throw new Error(`Missing usSportInput for US match ${input.matchId}`);
  }

  let msOut: MultiSportWalkforwardOutlookV60;
  if (usIn.mode === "causal_walkforward_input") {
    if (input.sport === "mlb" && usIn.mlbCausalInput) {
      msOut = projectMlbWalkforwardOutlookV60(usIn.mlbCausalInput, artifacts.multisportArtifactV6);
    } else if (input.sport === "nhl" && usIn.nhlCausalInput) {
      msOut = projectNhlWalkforwardOutlookV60(usIn.nhlCausalInput, artifacts.multisportArtifactV6);
    } else if (input.sport === "nba" && usIn.nbaCausalInput) {
      msOut = projectNbaWalkforwardOutlookV60(usIn.nbaCausalInput, artifacts.multisportArtifactV6);
    } else if (input.sport === "nfl" && usIn.nflCausalInput) {
      msOut = projectNflWalkforwardOutlookV60(usIn.nflCausalInput, artifacts.multisportArtifactV6);
    } else {
      throw new Error(`Missing causal walkforward input for ${input.sport} match ${input.matchId}`);
    }
  } else {
    msOut = projectMultiSportMatchupFromStateV60({
      sport: input.sport,
      homeTeam: input.homeSlug,
      awayTeam: input.awaySlug,
      gameDate: usIn.gameDate,
      neutralSite: input.neutralSite,
      totalLine: usIn.totalLine ?? undefined,
      spreadLineHome: usIn.spreadLineHome ?? undefined,
      artifact: artifacts.multisportArtifactV6,
    });
  }

  const pHome = msOut.p_home;
  const pAway = msOut.p_away;

  let expHomeScore: number;
  let expAwayScore: number;
  let expTot: number;
  let canonLine: number;
  let pOverCanon: number;

  if (msOut.sport === "mlb") {
    expHomeScore = msOut.full_game.expected_runs_home;
    expAwayScore = msOut.full_game.expected_runs_away;
    expTot = msOut.full_game.expected_total_runs;
    canonLine = msOut.full_game.total_line;
    pOverCanon = msOut.full_game.p_over_no_push;
  } else if (msOut.sport === "nhl") {
    expHomeScore = msOut.expected_goals_home_full;
    expAwayScore = msOut.expected_goals_away_full;
    expTot = msOut.expected_total_goals;
    canonLine = msOut.total_line;
    pOverCanon = msOut.p_over_no_push;
  } else {
    expTot = msOut.expected_total;
    expHomeScore = 0.5 * (expTot + msOut.expected_margin);
    expAwayScore = 0.5 * (expTot - msOut.expected_margin);
    canonLine = msOut.total_line;
    pOverCanon = msOut.p_over_no_push;
  }

  const officialPrior = resolveOfficialPriorV6({
    refereeName: input.refereeName ?? null,
    league: input.league,
    artifact: artifacts.officialsArtifactV6,
  });

  const epistemic = buildMatchEpistemicSummaryV5({
    pHome,
    pDraw: null,
    pAway,
    effectiveSampleGames: usIn.effectiveSampleGames,
    pLogitHome: pHome,
    pGbmHome: pHome,
    pLogitAway: pAway,
    pGbmAway: pAway,
    seasonProgress: usIn.seasonProgress,
    sport: input.sport === "nfl" ? "nfl" : undefined,
    calibrationArtifact: input.sport === "nfl" ? artifacts.epistemicArtifactV51 : null,
  });

  let usPropBlock: UnifiedFeaturedPropsBlockV6["usPlayerProp"] = null;
  if (usIn.featuredUsPlayerProp) {
    const up = usIn.featuredUsPlayerProp;
    const po = projectUsPlayerPropV6({
      sport: input.sport,
      positionLabel: up.positionLabel ?? null,
      metric: up.metric,
      sampleSum: up.sampleSum,
      sampleGames: up.sampleGames,
      line: up.line ?? null,
      prematchMinutes: up.prematchMinutes ?? null,
      sampleVariance: up.sampleVariance ?? null,
      oppFactor: 1.0,
      availability: up.availability ?? "available",
      injuryStatus: up.injuryStatus ?? null,
      artifact: artifacts.propsArtifactV6,
    });
    if (po !== null) {
      usPropBlock = Object.freeze({
        playerName: up.playerName,
        side: up.side,
        propOutlook: po,
      });
    }
  }

  const causalPayload: PreKickoffAnalysisPayloadV6 = Object.freeze({
    inputsAsOfUtc: input.causalInputsAsOfUtc,
    probabilities: Object.freeze({
      pAway: quantizeForSealV6(pAway),
      pDraw: null,
      pHome: quantizeForSealV6(pHome),
      pOverCanonical: quantizeForSealV6(pOverCanon),
    }),
    projection: Object.freeze({
      away: quantizeForSealV6(expAwayScore),
      home: quantizeForSealV6(expHomeScore),
      margin: quantizeForSealV6(expHomeScore - expAwayScore),
      total: quantizeForSealV6(expTot),
    }),
  });

  const sealSummary = executeSealContractV6({
    input,
    sportForSeal: input.sport,
    causalAnalysisPayload: causalPayload,
  });

  const ep = msOut.early_payout;
  const facts = buildVerifiedMatchFactSheet({
    matchId: input.matchId,
    sport: input.sport,
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    pHome,
    pDraw: null,
    pAway,
    expectedTotal: expTot,
    canonicalTotalLine: canonLine,
    pOverCanonical: pOverCanon,
  });
  const verifiedSummaryEs = compileDeterministicVerifiedSummaryEs(facts);
  const textAudit = validateNarrativeAgainstFactSheet(verifiedSummaryEs, facts);
  const mathAudit = validateMatchMathematicalInvariants({
    pHome,
    pDraw: null,
    pAway,
    pHomeEarlyPayoutWin: ep.p_home_early_payout_win,
    pAwayEarlyPayoutWin: ep.p_away_early_payout_win,
    epistemicBands: [
      { label: "home", ...epistemic.homeBand90 },
      { label: "away", ...epistemic.awayBand90 },
    ],
  });
  const guardrailAudit: GuardrailAuditResult = Object.freeze({
    passed: textAudit.passed && mathAudit.passed,
    violations: Object.freeze([...textAudit.violations, ...mathAudit.violations]),
  });

  const stLow = input.lifecycleStatus.trim().toLowerCase();
  const normLc: LifecycleStatusV6 =
    stLow === "final" || stLow === "ft" || stLow === "finished" || stLow === "completed"
      ? "FT"
      : stLow === "in_progress" || stLow === "live" || stLow === "ot"
        ? "LIVE"
        : "scheduled";

  const isUnconfirmedGoalie =
    msOut.sport === "nhl" && msOut.goalie_quality_flag === "unconfirmed_goalie_warning";

  return Object.freeze({
    schemaVersion: UNIFIED_OUTLOOK_V6_SCHEMA_VERSION,
    status: "candidate",
    productionActivated: false,
    matchId: input.matchId,
    sport: input.sport,
    league: input.league,
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    kickoffUtc: input.kickoffUtc,
    lifecycleStatus: normLc,
    coreProbabilities: Object.freeze({
      pHome,
      pDraw: null,
      pAway,
      fairOddsHome: probabilityToFairOdds(clamp(pHome, 0.001, 0.999)),
      fairOddsDraw: null,
      fairOddsAway: probabilityToFairOdds(clamp(pAway, 0.001, 0.999)),
    }),
    epistemicUncertainty90: epistemic,
    earlyPayout: Object.freeze({
      triggerLead: ep.trigger_lead,
      pHomeRegularWin: ep.p_home_regular_win,
      pAwayRegularWin: ep.p_away_regular_win,
      pHomeEarlyPayoutWin: ep.p_home_early_payout_win,
      pAwayEarlyPayoutWin: ep.p_away_early_payout_win,
      homeEarlyPayoutLift: ep.home_early_payout_lift,
      awayEarlyPayoutLift: ep.away_early_payout_lift,
      pBothSidesTriggerEarlyPayout: ep.p_both_sides_trigger_early_payout,
    }),
    officialPrior,
    soccerV6: null,
    multiSportV6: msOut,
    featuredPropsV6: Object.freeze({
      fieldPlayerShots: null,
      goalkeeperSaves: null,
      usPlayerProp: usPropBlock,
    }),
    preKickoffSeal: sealSummary,
    factSheet: facts,
    verifiedSummaryEs,
    guardrailAudit,
    dataQuality: Object.freeze({
      flag: isUnconfirmedGoalie ? "partial_coverage" : "ok",
      coverageScore: isUnconfirmedGoalie ? 0.92 : 1.0,
      sourceEngine: `multisport_${input.sport}_v6_0_walkforward`,
      validationStatus: "walk_forward_game_oos_2026_verified",
    }),
  });
}

export function buildUnifiedMatchIntelligenceV6(
  input: UnifiedMatchCanonicalInputV6,
  artifacts: UnifiedArtifactsBundleV6,
): UnifiedMatchIntelligenceV6 {
  if (input.sport === "soccer") {
    return buildUnifiedSoccerMatchIntelligenceV6(input, artifacts);
  }
  return buildUnifiedUsSportMatchIntelligenceV6(input, artifacts);
}
