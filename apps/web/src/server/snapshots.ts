import fs from "node:fs";
import path from "node:path";
import {
  CLIENT_MATCH_CONTEXT_FACTOR_LABELS,
  COMPETITION_BY_ID,
  LEAGUE_CAPABILITY_LIST,
  LeagueSnapshotSchema,
  LeagueInjuriesFileSchema,
  MarketPulseFileSchema,
  parseStrictFiniteNumber,
  probabilityToFairOdds,
  toMarketPulseView,
  assertNotDemoInProduction,
  snapshotToMatchAnalyses,
  sportForLeague,
  sportHasDraw,
  asLeagueId,
  CortexWriteupSchema,
  type CortexWriteup,
  type GameAnalysis,
  type LeagueId,
  type LeagueSnapshot,
  type OutcomeMarket,
  type PlatformSport,
  type ProductLeagueKey,
  type StandingRow,
  type MatchAnalysis,
  type MarketPulseView,
  type TeamInjuryEntry,
} from "@pitchlab/contracts";
import {
  auditPreKickoffCausalityV6,
  formatEpochMsUtc,
  parseIsoUtcEpochMs,
  projectMultiSportMatchupFromStateV60,
  projectSoccer57MatchV60,
  sealPreKickoffOutlookV6,
  type CompetitionSpecV60,
  type CompetitionStatusV60,
  type ConfederationGroupV60,
  type MultiSportLeagueV60,
  type MultiSportModelArtifactV60,
  type PostWalkforwardTeamStateV60,
  type PreKickoffAnalysisPayloadV6,
  type PreKickoffCausalityAuditReportV6,
  type SealPreKickoffOutcomeV6,
  type SealedPreKickoffRecordV6,
  type SnapshotCausalityObservationV6,
  type Soccer57ModelArtifactV60,
} from "@pitchlab/spacetime/v6";
import multisportArtifactJson from "@pitchlab/spacetime/data/model_multisport_v6_0_candidate.json";
import soccer57ArtifactJson from "@pitchlab/spacetime/data/model_soccer_57_v6_0_candidate.json";
import {
  getBzzoiroLeagueEmblemUrl,
  getBzzoiroTeamEmblemUrl,
  getOfficialEspnLeagueLogoUrl,
  getOfficialEspnTeamLogoUrl,
} from "@pitchlab/sports-assets";
import { logSecurityEvent } from "./safe-logger";

export interface ClientLeagueSnapshot {
  schemaVersion: 1;
  league: LeagueId;
  leagueLabel: string;
  logoUrl?: string;
  sport: PlatformSport;
  season: string;
  roundLabel: string;
  generatedAt: string;
  days: Array<{ id: string; label: string }>;
  games: MatchAnalysis[];
  standings?: StandingRow[];
}

export interface SnapshotEnvelope {
  state: "ready" | "empty" | "error";
  data?: ClientLeagueSnapshot;
  generatedAt?: string;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

function toArtifactStatusV6(raw: string): "candidate" | "production" {
  return raw === "production" ? "production" : "candidate";
}

function isMultiSportLeagueV60(raw: string): raw is MultiSportLeagueV60 {
  return raw === "mlb" || raw === "nhl" || raw === "nba" || raw === "nfl";
}

function toConfederationGroupV60(raw: string): ConfederationGroupV60 {
  if (
    raw === "UEFA_TOP" ||
    raw === "UEFA_SECOND_AND_CUPS" ||
    raw === "CONMEBOL_LEAGUE_AND_CUPS" ||
    raw === "CONCACAF_AND_MX" ||
    raw === "AFC_CAF_EXPANSION" ||
    raw === "INTERNATIONAL_NATIONAL_TEAMS"
  ) {
    return raw;
  }
  return "INTERNATIONAL_NATIONAL_TEAMS";
}

function toCompetitionStatusV60(raw: string): CompetitionStatusV60 {
  return raw === "causal_walk_forward_2026_active"
    ? "causal_walk_forward_2026_active"
    : "confederation_prior_zero_2026_games";
}

function buildNarrowedMultiSportArtifactV6(): MultiSportModelArtifactV60 {
  const teamsState: Record<string, PostWalkforwardTeamStateV60> = {};
  for (const [key, entry] of Object.entries(
    multisportArtifactJson.teams_post_walkforward_state_2026,
  )) {
    if (!isMultiSportLeagueV60(entry.sport)) continue;
    const priors: Record<string, number> = {};
    for (const [pKey, pVal] of Object.entries(entry.structural_priors)) {
      const parsed = parseStrictFiniteNumber(pVal);
      if (parsed !== null) {
        priors[pKey] = parsed;
      }
    }
    teamsState[key] = {
      sport: entry.sport,
      team_key: entry.team_key,
      team_name: entry.team_name,
      elevation_m: entry.elevation_m,
      is_dome: entry.is_dome,
      elo: entry.elo,
      games_played: entry.games_played,
      cum_for: entry.cum_for,
      cum_against: entry.cum_against,
      last_game_date: typeof entry.last_game_date === "string" ? entry.last_game_date : null,
      prev_game_date: typeof entry.prev_game_date === "string" ? entry.prev_game_date : null,
      structural_priors: priors,
    };
  }
  return {
    schema_version: multisportArtifactJson.schema_version,
    codename: multisportArtifactJson.codename,
    version: multisportArtifactJson.version,
    status: toArtifactStatusV6(multisportArtifactJson.status),
    production_activated: multisportArtifactJson.production_activated,
    holdout_cut_utc: multisportArtifactJson.holdout_cut_utc,
    holdout_sealed_untouched: multisportArtifactJson.holdout_sealed_untouched,
    hyperparameter_tuning_on_holdout: multisportArtifactJson.hyperparameter_tuning_on_holdout,
    validation_status: multisportArtifactJson.validation_status,
    physics_config: multisportArtifactJson.physics_config,
    early_payout_config: multisportArtifactJson.early_payout_config,
    team_slug_aliases: {
      mlb: multisportArtifactJson.team_slug_aliases.mlb,
      nhl: multisportArtifactJson.team_slug_aliases.nhl,
      nba: multisportArtifactJson.team_slug_aliases.nba,
      nfl: multisportArtifactJson.team_slug_aliases.nfl,
    },
    nba_active_injuries_observed_at_utc:
      multisportArtifactJson.nba_active_injuries_observed_at_utc,
    nba_active_injuries_2026: multisportArtifactJson.nba_active_injuries_2026,
    league_environments_2026: {
      mlb: multisportArtifactJson.league_environments_2026.mlb,
      nhl: multisportArtifactJson.league_environments_2026.nhl,
      nba: multisportArtifactJson.league_environments_2026.nba,
      nfl: multisportArtifactJson.league_environments_2026.nfl,
    },
    teams_post_walkforward_state_2026: teamsState,
  };
}

function buildNarrowedSoccer57ArtifactV6(): Soccer57ModelArtifactV60 {
  const competitions: Record<string, CompetitionSpecV60> = {};
  for (const [leagueKey, spec] of Object.entries(soccer57ArtifactJson.competitions)) {
    competitions[leagueKey] = {
      confederation_group: toConfederationGroupV60(spec.confederation_group),
      is_cup: spec.is_cup,
      pre2025_goal_prior: spec.pre2025_goal_prior,
      confederation_goal_prior: spec.confederation_goal_prior,
      rho_prior: spec.rho_prior,
      dispersion_r: spec.dispersion_r,
      games_2026: spec.games_2026,
      mean_raw_goals_2026:
        typeof spec.mean_raw_goals_2026 === "number" ? spec.mean_raw_goals_2026 : null,
      ewm_goals_2026: spec.ewm_goals_2026,
      causal_env_goals_final: spec.causal_env_goals_final,
      competition_status: toCompetitionStatusV60(spec.competition_status),
    };
  }
  const winProt = soccer57ArtifactJson.holdout_window_protected;
  return {
    schema_version: soccer57ArtifactJson.schema_version,
    codename: soccer57ArtifactJson.codename,
    version: soccer57ArtifactJson.version,
    status: toArtifactStatusV6(soccer57ArtifactJson.status),
    production_activated: soccer57ArtifactJson.production_activated,
    holdout_cut_utc: soccer57ArtifactJson.holdout_cut_utc,
    holdout_window_protected: [winProt[0] ?? "2025-02-02", winProt[1] ?? "2026-11-08"] as const,
    holdout_sealed_untouched: soccer57ArtifactJson.holdout_sealed_untouched,
    hyperparameter_tuning_on_holdout: soccer57ArtifactJson.hyperparameter_tuning_on_holdout,
    non_football_leagues_excluded: soccer57ArtifactJson.non_football_leagues_excluded,
    total_platform_leagues: soccer57ArtifactJson.total_platform_leagues,
    total_football_competitions: soccer57ArtifactJson.total_football_competitions,
    confederation_groups: {
      UEFA_TOP: soccer57ArtifactJson.confederation_groups.UEFA_TOP,
      UEFA_SECOND_AND_CUPS: soccer57ArtifactJson.confederation_groups.UEFA_SECOND_AND_CUPS,
      CONMEBOL_LEAGUE_AND_CUPS:
        soccer57ArtifactJson.confederation_groups.CONMEBOL_LEAGUE_AND_CUPS,
      CONCACAF_AND_MX: soccer57ArtifactJson.confederation_groups.CONCACAF_AND_MX,
      AFC_CAF_EXPANSION: soccer57ArtifactJson.confederation_groups.AFC_CAF_EXPANSION,
      INTERNATIONAL_NATIONAL_TEAMS:
        soccer57ArtifactJson.confederation_groups.INTERNATIONAL_NATIONAL_TEAMS,
    },
    confederation_priors: {
      UEFA_TOP: soccer57ArtifactJson.confederation_priors.UEFA_TOP,
      UEFA_SECOND_AND_CUPS: soccer57ArtifactJson.confederation_priors.UEFA_SECOND_AND_CUPS,
      CONMEBOL_LEAGUE_AND_CUPS:
        soccer57ArtifactJson.confederation_priors.CONMEBOL_LEAGUE_AND_CUPS,
      CONCACAF_AND_MX: soccer57ArtifactJson.confederation_priors.CONCACAF_AND_MX,
      AFC_CAF_EXPANSION: soccer57ArtifactJson.confederation_priors.AFC_CAF_EXPANSION,
      INTERNATIONAL_NATIONAL_TEAMS:
        soccer57ArtifactJson.confederation_priors.INTERNATIONAL_NATIONAL_TEAMS,
    },
    prekickoff_recalibration: soccer57ArtifactJson.prekickoff_recalibration,
    venn_abers_playable_calibrator: soccer57ArtifactJson.venn_abers_playable_calibrator,
    competitions,
  };
}

const MULTISPORT_ARTIFACT_V6: MultiSportModelArtifactV60 = buildNarrowedMultiSportArtifactV6();
const SOCCER_57_ARTIFACT_V6: Soccer57ModelArtifactV60 = buildNarrowedSoccer57ArtifactV6();

const preKickoffSealLedger = new Map<string, SealedPreKickoffRecordV6>();
const leagueCausalityAuditCache = new Map<string, PreKickoffCausalityAuditReportV6>();

function resolveMultiSportAliasSafe(
  sport: MultiSportLeagueV60,
  rawTeam: string,
): string | null {
  let clean = rawTeam.trim().toLowerCase();
  const dblIdx = clean.indexOf("::");
  if (dblIdx >= 0) clean = clean.slice(dblIdx + 2);
  const dotIdx = clean.indexOf(".");
  if (dotIdx >= 0) clean = clean.slice(dotIdx + 1);
  clean = clean.replace(/[^a-z0-9_-]+/g, "");
  const code = MULTISPORT_ARTIFACT_V6.team_slug_aliases[sport]?.[clean] ?? null;
  if (!code) return null;
  const stMap = MULTISPORT_ARTIFACT_V6.teams_post_walkforward_state_2026;
  return stMap && stMap[`${sport}::${code}`] ? code : null;
}

function causalPreKickoffAnchorUtc(kickoffMs: number): string {
  const koDate = new Date(kickoffMs);
  const prevDayEndMs =
    Date.UTC(koDate.getUTCFullYear(), koDate.getUTCMonth(), koDate.getUTCDate(), 0, 0, 0) - 1000;
  const anchorMs = Math.min(prevDayEndMs, kickoffMs - 1000);
  return formatEpochMsUtc(anchorMs);
}

function buildMultiSportCausalBackfillV6(params: {
  readonly sport: MultiSportLeagueV60;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly kickoffUtc: string;
  readonly neutralSite?: boolean;
}): PreKickoffAnalysisPayloadV6 | null {
  const kickoffMs = parseIsoUtcEpochMs(params.kickoffUtc);
  if (kickoffMs === null) return null;
  const hCode = resolveMultiSportAliasSafe(params.sport, params.homeTeam);
  const aCode = resolveMultiSportAliasSafe(params.sport, params.awayTeam);
  if (!hCode || !aCode) return null;

  try {
    const out = projectMultiSportMatchupFromStateV60({
      sport: params.sport,
      homeTeam: hCode,
      awayTeam: aCode,
      gameDate: formatEpochMsUtc(kickoffMs).slice(0, 10),
      neutralSite: params.neutralSite ?? false,
      artifact: MULTISPORT_ARTIFACT_V6,
    });
    const inputsAsOfUtc = causalPreKickoffAnchorUtc(kickoffMs);

    if (out.sport === "nhl") {
      const homeProj = out.expected_goals_home_full;
      const awayProj = out.expected_goals_away_full;
      const totalProj = out.expected_total_goals;
      return {
        inputsAsOfUtc,
        probabilities: {
          pHome: out.p_home,
          pDraw: null,
          pAway: out.p_away,
          pOverCanonical: out.p_over,
        },
        projection: {
          home: homeProj,
          away: awayProj,
          total: totalProj,
          margin: homeProj - awayProj,
        },
      };
    }

    if (out.sport === "mlb") {
      const homeProj = out.full_game.expected_runs_home;
      const awayProj = out.full_game.expected_runs_away;
      const totalProj = out.full_game.expected_total_runs;
      return {
        inputsAsOfUtc,
        probabilities: {
          pHome: out.p_home,
          pDraw: null,
          pAway: out.p_away,
          pOverCanonical: out.full_game.p_over,
        },
        projection: {
          home: homeProj,
          away: awayProj,
          total: totalProj,
          margin: homeProj - awayProj,
        },
      };
    }

    const totalProj = out.expected_total;
    const marginProj = out.expected_margin;
    const homeProj = Math.max(0, (totalProj + marginProj) * 0.5);
    const awayProj = Math.max(0, (totalProj - marginProj) * 0.5);
    return {
      inputsAsOfUtc,
      probabilities: {
        pHome: out.p_home,
        pDraw: null,
        pAway: out.p_away,
        pOverCanonical: out.p_over,
      },
      projection: {
        home: homeProj,
        away: awayProj,
        total: totalProj,
        margin: marginProj,
      },
    };
  } catch (err) {
    void err;
    return null;
  }
}

function buildSoccer57CausalBackfillV6(params: {
  readonly league: string;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly kickoffUtc: string;
  readonly neutralSite?: boolean;
  readonly teamRates?: LeagueSnapshot["teamRates"];
}): PreKickoffAnalysisPayloadV6 | null {
  const kickoffMs = parseIsoUtcEpochMs(params.kickoffUtc);
  if (kickoffMs === null) return null;
  const compSpec = SOCCER_57_ARTIFACT_V6.competitions[params.league];
  if (!compSpec) return null;

  const envGoals = compSpec.causal_env_goals_final;
  const halfEnv = 0.5 * envGoals;
  const homeRate = params.teamRates?.[params.homeTeamId];
  const awayRate = params.teamRates?.[params.awayTeamId];
  try {
    const out = projectSoccer57MatchV60({
      league: params.league,
      homeElo: 1500,
      awayElo: 1500,
      homeAttEwm: homeRate?.adjustedFor ?? homeRate?.forPerGame ?? halfEnv,
      homeDefEwm: homeRate?.adjustedAgainst ?? homeRate?.againstPerGame ?? halfEnv,
      homeGames: homeRate?.gamesPlayed ?? 0,
      awayAttEwm: awayRate?.adjustedFor ?? awayRate?.forPerGame ?? halfEnv,
      awayDefEwm: awayRate?.adjustedAgainst ?? awayRate?.againstPerGame ?? halfEnv,
      awayGames: awayRate?.gamesPlayed ?? 0,
      leagueEnvGoals: envGoals,
      neutralSite: Boolean(params.neutralSite),
      artifact: SOCCER_57_ARTIFACT_V6,
    });
    return {
      inputsAsOfUtc: causalPreKickoffAnchorUtc(kickoffMs),
      probabilities: {
        pHome: out.markets["1x2"].home,
        pDraw: out.markets["1x2"].draw,
        pAway: out.markets["1x2"].away,
        pOver25: out.markets.totals_2_5.over,
      },
      projection: {
        home: out.muHome,
        away: out.muAway,
        total: out.muHome + out.muAway,
      },
    };
  } catch (err) {
    void err;
    return null;
  }
}

function toPreKickoffPayloadFromGameAnalysis(
  analysis: GameAnalysis | undefined,
  hasDraw: boolean,
): PreKickoffAnalysisPayloadV6 | null {
  if (!analysis) return null;
  const over25Row = analysis.probabilities.find(
    (row) => row.market === "totals" && row.selection.toLowerCase().startsWith("over") && row.line === 2.5,
  );
  return {
    inputsAsOfUtc: analysis.inputsAsOf,
    probabilities: {
      pHome: analysis.x12[0],
      pDraw: hasDraw ? analysis.x12[1] : null,
      pAway: analysis.x12[2],
      ...(over25Row ? { pOver25: over25Row.p } : {}),
    },
    projection: {
      home: analysis.projection.home,
      away: analysis.projection.away,
      total: analysis.projection.total,
      ...(analysis.projection.margin !== undefined ? { margin: analysis.projection.margin } : {}),
    },
  };
}

function toSportTagForSeal(league: string): string {
  if (isMultiSportLeagueV60(league)) return league;
  return "football";
}

function buildOutcomesFromX12(
  homeShortName: string,
  awayShortName: string,
  x12: [number, number, number],
  hasDraw: boolean,
): OutcomeMarket[] {
  if (!hasDraw) {
    return [
      {
        key: "home",
        label: `${homeShortName} gana`,
        probability: x12[0],
        fairOdds: probabilityToFairOdds(x12[0]),
      },
      {
        key: "away",
        label: `${awayShortName} gana`,
        probability: x12[2],
        fairOdds: probabilityToFairOdds(x12[2]),
      },
    ];
  }
  return [
    {
      key: "home",
      label: `${homeShortName} gana`,
      probability: x12[0],
      fairOdds: probabilityToFairOdds(x12[0]),
    },
    {
      key: "draw",
      label: "Empate",
      probability: x12[1],
      fairOdds: probabilityToFairOdds(x12[1]),
    },
    {
      key: "away",
      label: `${awayShortName} gana`,
      probability: x12[2],
      fairOdds: probabilityToFairOdds(x12[2]),
    },
  ];
}

function applySealedRecordToMatch(
  match: MatchAnalysis,
  outcome: SealPreKickoffOutcomeV6,
): MatchAnalysis {
  if (!outcome.hasForecast || !outcome.sealedRecord) {
    return {
      ...match,
      hasForecast: false,
      x12: undefined,
      projection: undefined,
      outcomes: [],
      marketGroups: [],
      picks: undefined,
      confidence: undefined,
    };
  }

  const rescuedOrRecovered =
    outcome.sealAction === "preserved_seal_on_missing_upstream" ||
    outcome.sealAction === "rejected_contaminated_preserved_seal" ||
    outcome.sealAction === "recovered_ft_from_causal_walkforward" ||
    outcome.sealAction === "rejected_contaminated_sealed_from_causal_backfill";

  if (!rescuedOrRecovered && match.hasForecast !== false && match.x12 && match.projection) {
    return {
      ...match,
      hasForecast: true,
    };
  }

  const rec = outcome.sealedRecord;
  const hasDraw = sportHasDraw(match.sport);
  const rawH = rec.probabilities.pHome;
  const rawD = rec.probabilities.pDraw;
  const rawA = rec.probabilities.pAway;
  if (
    typeof rawH !== "number" ||
    !Number.isFinite(rawH) ||
    typeof rawA !== "number" ||
    !Number.isFinite(rawA)
  ) {
    return match;
  }

  const dVal = hasDraw && typeof rawD === "number" && Number.isFinite(rawD) ? rawD : 0;
  const pSum = rawH + dVal + rawA;
  const x12: [number, number, number] =
    pSum > 0
      ? hasDraw
        ? [rawH / pSum, dVal / pSum, rawA / pSum]
        : [rawH / (rawH + rawA), 0, rawA / (rawH + rawA)]
      : hasDraw
        ? [0.4, 0.25, 0.35]
        : [0.5, 0, 0.5];

  const projH = rec.projection.home;
  const projA = rec.projection.away;
  const projT = rec.projection.total;
  const projM = rec.projection.margin;
  const projection =
    typeof projH === "number" &&
    Number.isFinite(projH) &&
    typeof projA === "number" &&
    Number.isFinite(projA)
      ? {
          home: Math.round(projH * 100) / 100,
          away: Math.round(projA * 100) / 100,
          total:
            typeof projT === "number" && Number.isFinite(projT)
              ? Math.round(projT * 100) / 100
              : Math.round((projH + projA) * 100) / 100,
          ...(typeof projM === "number" && Number.isFinite(projM)
            ? { margin: Math.round(projM * 100) / 100 }
            : {}),
        }
      : match.projection;

  const outcomes = buildOutcomesFromX12(match.home.shortName, match.away.shortName, x12, hasDraw);
  const dropContaminatedDerived = outcome.incomingContaminatedRejected;

  return {
    ...match,
    hasForecast: true,
    x12,
    projection,
    outcomes,
    ...(dropContaminatedDerived
      ? {
          marketGroups: [],
          picks: undefined,
          confidence: undefined,
        }
      : {}),
  };
}

const DATED_SNAPSHOT_RE = /^\d{4}-\d{2}-\d{2}\.json$/;
const MAX_HISTORICAL_SNAPSHOTS_FOR_RESCUE = 8;

function loadHistoricalSnapshotsForLeague(
  leagueDir: string,
  targetGameIds: ReadonlySet<string>,
): LeagueSnapshot[] {
  if (targetGameIds.size === 0 || !fs.existsSync(leagueDir)) return [];
  let datedFiles: string[];
  try {
    datedFiles = fs
      .readdirSync(leagueDir)
      .filter((name) => DATED_SNAPSHOT_RE.test(name))
      .sort()
      .slice(-MAX_HISTORICAL_SNAPSHOTS_FOR_RESCUE);
  } catch (err) {
    void err;
    return [];
  }

  const snapshots: LeagueSnapshot[] = [];
  for (const fileName of datedFiles) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(leagueDir, fileName), "utf8")) as unknown;
      const parsed = LeagueSnapshotSchema.safeParse(raw);
      if (!parsed.success) continue;
      const hasRelevant = parsed.data.games.some(
        (g) => targetGameIds.has(g.id) && Boolean(parsed.data.analyses[g.id]),
      );
      if (hasRelevant) {
        snapshots.push(parsed.data);
      }
    } catch (err) {
      void err;
    }
  }
  return snapshots;
}

export interface SnapshotCausalityReconciliationResult {
  readonly days: Array<{ id: string; label: string }>;
  readonly matches: MatchAnalysis[];
  readonly audit: PreKickoffCausalityAuditReportV6;
}

export function applyPreKickoffCausalityToSnapshot(
  snapshot: LeagueSnapshot,
  options: {
    readonly historicalSnapshots?: readonly LeagueSnapshot[];
    readonly priorSeals?: ReadonlyMap<string, SealedPreKickoffRecordV6>;
  } = {},
): SnapshotCausalityReconciliationResult {
  const { days, matches } = snapshotToMatchAnalyses(snapshot);
  const sportTag = toSportTagForSeal(snapshot.league);
  const hasDraw = sportHasDraw(sportForLeague(snapshot.league));
  const priorSeals = options.priorSeals ?? preKickoffSealLedger;
  const gameIds = new Set(snapshot.games.map((g) => g.id));
  const observations: SnapshotCausalityObservationV6[] = [];

  for (const game of snapshot.games) {
    const key = `${snapshot.league}::${game.id}`;
    const existingSeal = priorSeals.get(key);
    if (existingSeal) {
      observations.push({
        matchId: existingSeal.matchId,
        sport: existingSeal.sport,
        league: existingSeal.league,
        homeTeam: existingSeal.homeTeam,
        awayTeam: existingSeal.awayTeam,
        kickoffUtc: existingSeal.kickoffUtc,
        status: "scheduled",
        incomingAnalysis: {
          inputsAsOfUtc: existingSeal.inputsAsOfUtc,
          probabilities: existingSeal.probabilities,
          projection: existingSeal.projection,
        },
      });
    }
  }

  for (const hist of options.historicalSnapshots ?? []) {
    for (const game of hist.games) {
      if (!gameIds.has(game.id)) continue;
      const analysis = hist.analyses[game.id];
      if (!analysis) continue;
      const homeSlug = game.home.id.includes(".") ? game.home.id.split(".")[1]! : game.home.id;
      const awaySlug = game.away.id.includes(".") ? game.away.id.split(".")[1]! : game.away.id;
      observations.push({
        matchId: game.id,
        sport: sportTag,
        league: snapshot.league,
        homeTeam: homeSlug,
        awayTeam: awaySlug,
        kickoffUtc: game.startTime,
        status: game.status,
        incomingAnalysis: toPreKickoffPayloadFromGameAnalysis(analysis, hasDraw),
      });
    }
  }

  for (const game of snapshot.games) {
    const analysis = snapshot.analyses[game.id];
    const homeSlug = game.home.id.includes(".") ? game.home.id.split(".")[1]! : game.home.id;
    const awaySlug = game.away.id.includes(".") ? game.away.id.split(".")[1]! : game.away.id;
    const incomingAnalysis = toPreKickoffPayloadFromGameAnalysis(analysis, hasDraw);
    const koMs = parseIsoUtcEpochMs(game.startTime);
    const iaoMs = incomingAnalysis ? parseIsoUtcEpochMs(incomingAnalysis.inputsAsOfUtc) : null;
    const needsBackfill =
      incomingAnalysis === null || (koMs !== null && (iaoMs === null || iaoMs > koMs));

    let causalBackfillAnalysis: PreKickoffAnalysisPayloadV6 | null = null;
    if (needsBackfill) {
      if (isMultiSportLeagueV60(snapshot.league)) {
        causalBackfillAnalysis = buildMultiSportCausalBackfillV6({
          sport: snapshot.league,
          homeTeam: game.home.id,
          awayTeam: game.away.id,
          kickoffUtc: game.startTime,
          neutralSite: game.neutralSite,
        });
      } else {
        causalBackfillAnalysis = buildSoccer57CausalBackfillV6({
          league: snapshot.league,
          homeTeamId: game.home.id,
          awayTeamId: game.away.id,
          kickoffUtc: game.startTime,
          neutralSite: game.neutralSite,
          teamRates: snapshot.teamRates,
        });
      }
    }

    observations.push({
      matchId: game.id,
      sport: sportTag,
      league: snapshot.league,
      homeTeam: homeSlug,
      awayTeam: awaySlug,
      kickoffUtc: game.startTime,
      status: game.status,
      incomingAnalysis,
      causalBackfillAnalysis,
    });
  }

  const audit = auditPreKickoffCausalityV6(observations);
  const reconciledMatches = matches.map((m) => {
    const key = `${snapshot.league}::${m.id}`;
    const outcome = audit.outcomesByMatchKey[key];
    if (!outcome) return m;
    if (
      options.priorSeals === undefined &&
      outcome.sealedRecord &&
      outcome.sealedRecord.inputsAsOfEpochMs <= outcome.sealedRecord.kickoffEpochMs &&
      !preKickoffSealLedger.has(key)
    ) {
      preKickoffSealLedger.set(key, outcome.sealedRecord);
    }
    return applySealedRecordToMatch(m, outcome);
  });

  return { days, matches: reconciledMatches, audit };
}

function preserveEnvelopeFinishedForecastsV6(
  leagueKey: ProductLeague,
  envelope: SnapshotEnvelope,
): SnapshotEnvelope {
  if (envelope.state !== "ready" || !envelope.data) return envelope;
  const needsRecovery = envelope.data.games.some(
    (g) => g.status === "FT" && (g.hasForecast === false || !g.x12 || !g.projection),
  );
  if (!needsRecovery) return envelope;

  const sportTag = toSportTagForSeal(leagueKey);
  const updatedGames = envelope.data.games.map((g) => {
    if (g.status !== "FT" || (g.hasForecast !== false && g.x12 && g.projection)) {
      return g;
    }
    const key = `${leagueKey}::${g.id}`;
    const existingSeal = preKickoffSealLedger.get(key) ?? null;
    const backfill =
      existingSeal === null
        ? isMultiSportLeagueV60(leagueKey)
          ? buildMultiSportCausalBackfillV6({
              sport: leagueKey,
              homeTeam: g.home.slug,
              awayTeam: g.away.slug,
              kickoffUtc: g.kickoffUtc,
              neutralSite: g.neutralSite,
            })
          : buildSoccer57CausalBackfillV6({
              league: leagueKey,
              homeTeamId: `${leagueKey}.${g.home.slug}`,
              awayTeamId: `${leagueKey}.${g.away.slug}`,
              kickoffUtc: g.kickoffUtc,
              neutralSite: g.neutralSite,
            })
        : null;

    const outcome = sealPreKickoffOutlookV6({
      matchId: g.id,
      sport: sportTag,
      league: leagueKey,
      homeTeam: g.home.slug,
      awayTeam: g.away.slug,
      kickoffUtc: g.kickoffUtc,
      status: "final",
      incomingAnalysis: null,
      existingSealedRecord: existingSeal,
      causalBackfillAnalysis: backfill,
    });
    if (outcome.sealedRecord && !preKickoffSealLedger.has(key)) {
      preKickoffSealLedger.set(key, outcome.sealedRecord);
    }
    return applySealedRecordToMatch(g, outcome);
  });

  return {
    ...envelope,
    data: {
      ...envelope.data,
      games: updatedGames,
    },
  };
}

export function resolveSnapshotsRoot(): string {
  const candidates = [
    path.resolve(process.cwd(), "data/snapshots"),
    path.resolve(process.cwd(), "../../data/snapshots"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[1] ?? candidates[0]!;
}

export const PRODUCT_LEAGUES: readonly ProductLeagueKey[] = Object.freeze(
  LEAGUE_CAPABILITY_LIST.map((entry) => entry.id),
);

export type ProductLeague = (typeof PRODUCT_LEAGUES)[number];

const snapshotCache = new Map<string, { key: string; envelope: SnapshotEnvelope }>();

function fileMtime(file: string): number {
  try {
    return fs.statSync(file).mtimeMs;
  } catch (err) {
    void err;
    return 0;
  }
}

function loadMarketPulse(file: string): Map<string, MarketPulseView> {
  const byGame = new Map<string, MarketPulseView>();
  if (!fs.existsSync(file)) return byGame;
  try {
    const parsed = MarketPulseFileSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
    for (const entry of parsed.entries) byGame.set(entry.gameId, toMarketPulseView(entry));
  } catch (err) {
    void err;
    byGame.clear();
  }
  return byGame;
}

function loadLeagueInjuries(file: string): Map<string, TeamInjuryEntry[]> {
  const byTeam = new Map<string, TeamInjuryEntry[]>();
  if (!fs.existsSync(file)) return byTeam;
  try {
    const parsed = LeagueInjuriesFileSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
    for (const entry of parsed.entries) {
      const bucket = byTeam.get(entry.teamId) ?? [];
      bucket.push(entry);
      byTeam.set(entry.teamId, bucket);
    }
  } catch (err) {
    void err;
    byTeam.clear();
  }
  return byTeam;
}

const matchContext: ReadonlySet<string> = new Set(CLIENT_MATCH_CONTEXT_FACTOR_LABELS);

function matchForClient({ steps: _steps, why: _why, ...match }: MatchAnalysis): MatchAnalysis {
  return {
    ...match,
    factors: match.factors.filter(({ label }) => matchContext.has(label)),
    trace: [],
    confidence: match.confidence ? { ...match.confidence, reasons: [] } : undefined,
  };
}

export const LEAGUE_LABELS: Record<ProductLeague, string> = Object.fromEntries(
  PRODUCT_LEAGUES.map((id) => [id, COMPETITION_BY_ID[id]?.label ?? id]),
) as Record<ProductLeague, string>;

const LEAGUE_SEASONS: Record<ProductLeague, string> = Object.fromEntries(
  PRODUCT_LEAGUES.map((id) => [id, COMPETITION_BY_ID[id]?.season ?? "2026"]),
) as Record<ProductLeague, string>;

export function loadLeagueSnapshotEnvelope(leagueKey: ProductLeague): SnapshotEnvelope {
  const root = resolveSnapshotsRoot();
  const leagueDir = path.join(root, leagueKey);
  const latestPath = path.join(leagueDir, "latest.json");
  const league = asLeagueId(leagueKey);

  if (!fs.existsSync(latestPath)) {
    snapshotCache.delete(leagueKey);
    leagueCausalityAuditCache.delete(leagueKey);
    const emptySnapshot: ClientLeagueSnapshot = {
      schemaVersion: 1,
      league,
      leagueLabel: LEAGUE_LABELS[leagueKey],
      sport: sportForLeague(leagueKey),
      season: LEAGUE_SEASONS[leagueKey],
      roundLabel:
        leagueKey === "nfl"
          ? "Semana 9"
          : leagueKey === "nba" || leagueKey === "nhl" || leagueKey === "mlb"
            ? ""
            : "Jornada 16",
      generatedAt: new Date().toISOString(),
      days: [{ id: "all", label: `Toda la ${leagueKey === "nfl" ? "semana" : "jornada"}` }],
      games: [],
    };
    assertNotDemoInProduction("derived");
    return {
      state: "empty",
      data: emptySnapshot,
      generatedAt: emptySnapshot.generatedAt,
    };
  }

  const pulsePath = path.join(leagueDir, "market-pulse.json");
  const injuriesPath = path.join(leagueDir, "injuries.json");
  const snapshotMtime = fileMtime(latestPath);
  const cacheKey =
    snapshotMtime > 0
      ? `${snapshotMtime}:${fileMtime(pulsePath)}:${fileMtime(injuriesPath)}`
      : "";
  const cached = snapshotCache.get(leagueKey);
  if (cached && cacheKey && cached.key === cacheKey) {
    return cached.envelope;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(latestPath, "utf8")) as unknown;
    const parsed = LeagueSnapshotSchema.parse(raw);
    assertNotDemoInProduction(parsed.provenance);

    const gamesNeedingHistory = new Set<string>();
    for (const g of parsed.games) {
      const a = parsed.analyses[g.id];
      const koMs = parseIsoUtcEpochMs(g.startTime);
      const iaoMs = a ? parseIsoUtcEpochMs(a.inputsAsOf) : null;
      if (!a || (koMs !== null && (iaoMs === null || iaoMs > koMs))) {
        gamesNeedingHistory.add(g.id);
      }
    }
    const historicalSnapshots = loadHistoricalSnapshotsForLeague(leagueDir, gamesNeedingHistory);
    const { days, matches, audit } = applyPreKickoffCausalityToSnapshot(parsed, {
      historicalSnapshots,
    });
    leagueCausalityAuditCache.set(leagueKey, audit);

    const pulses = loadMarketPulse(pulsePath);
    const injuriesByTeam = loadLeagueInjuries(injuriesPath);
    const leagueLogoUrl =
      parsed.logoUrl ??
      getBzzoiroLeagueEmblemUrl(parsed.league) ??
      getOfficialEspnLeagueLogoUrl(parsed.league) ??
      undefined;
    const teamLogo = (slug: string, existing?: string): string | undefined =>
      existing ??
      getBzzoiroTeamEmblemUrl(parsed.league, slug) ??
      getOfficialEspnTeamLogoUrl(parsed.league, slug) ??
      undefined;
    const standingsWithLogos = parsed.standings?.map((row) => {
      const slug = row.teamId.includes(".") ? row.teamId.split(".")[1]! : row.teamId;
      const logoUrl = teamLogo(slug, row.logoUrl);
      return logoUrl ? { ...row, logoUrl } : row;
    });
    const clientSafe: ClientLeagueSnapshot = {
      schemaVersion: 1,
      league: parsed.league,
      leagueLabel: LEAGUE_LABELS[parsed.league as ProductLeague] ?? parsed.league,
      ...(leagueLogoUrl ? { logoUrl: leagueLogoUrl } : {}),
      sport: sportForLeague(parsed.league),
      season: parsed.seasonLabel,
      roundLabel: parsed.periodLabel,
      generatedAt: parsed.updatedAt,
      days,
      games: matches.map((m) => {
        const marketPulse = pulses.get(m.id);
        const homeTeamId = `${parsed.league}.${m.home.slug}`;
        const awayTeamId = `${parsed.league}.${m.away.slug}`;
        const homeInjuries = injuriesByTeam.get(homeTeamId) ?? injuriesByTeam.get(m.home.slug) ?? [];
        const awayInjuries = injuriesByTeam.get(awayTeamId) ?? injuriesByTeam.get(m.away.slug) ?? [];
        const hasInjuries = homeInjuries.length > 0 || awayInjuries.length > 0;
        const base = matchForClient(m);
        const homeLogo = teamLogo(base.home.slug, base.home.logoUrl);
        const awayLogo = teamLogo(base.away.slug, base.away.logoUrl);
        const resolvedLeagueLogo = base.leagueLogoUrl ?? leagueLogoUrl;
        return {
          ...base,
          ...(resolvedLeagueLogo ? { leagueLogoUrl: resolvedLeagueLogo } : {}),
          home: { ...base.home, ...(homeLogo ? { logoUrl: homeLogo } : {}) },
          away: { ...base.away, ...(awayLogo ? { logoUrl: awayLogo } : {}) },
          ...(marketPulse ? { marketPulse } : {}),
          ...(hasInjuries ? { injuries: { home: homeInjuries, away: awayInjuries } } : {}),
        };
      }),
      standings: standingsWithLogos,
    };

    const envelope: SnapshotEnvelope = {
      state: matches.length > 0 ? "ready" : "empty",
      data: clientSafe,
      generatedAt: clientSafe.generatedAt,
    };
    if (cacheKey) {
      snapshotCache.set(leagueKey, { key: cacheKey, envelope });
    }
    return envelope;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error de lectura";
    return {
      state: "error",
      error: {
        code: "PARSE",
        message,
        retryable: true,
      },
    };
  }
}

export function getCachedLeagueCausalityAuditV6(
  leagueKey: ProductLeague,
): PreKickoffCausalityAuditReportV6 | null {
  return leagueCausalityAuditCache.get(leagueKey) ?? null;
}

export function auditLeagueSnapshotCausalityV6(
  leagueKey: ProductLeague,
): PreKickoffCausalityAuditReportV6 | null {
  loadLeagueSnapshotEnvelope(leagueKey);
  return leagueCausalityAuditCache.get(leagueKey) ?? null;
}

export function getSnapshotPreKickoffSealV6(
  leagueKey: string,
  gameId: string,
): SealedPreKickoffRecordV6 | null {
  return preKickoffSealLedger.get(`${leagueKey}::${gameId}`) ?? null;
}

export function clearSnapshotCausalityCachesForTests(): void {
  snapshotCache.clear();
  allSnapshotsMemo = null;
  shellIndexCache = null;
  preKickoffSealLedger.clear();
  leagueCausalityAuditCache.clear();
}

interface ShellIndexFile {
  schemaVersion?: number;
  builtAt?: string;
  leagues?: Record<string, SnapshotEnvelope>;
}

let shellIndexCache: { mtime: number; leagues: Record<string, SnapshotEnvelope> } | null = null;

function readFreshShellIndex(root: string): { mtime: number; leagues: Record<string, SnapshotEnvelope> } | null {
  const indexPath = path.join(root, "shell-index.json");
  const mtime = fileMtime(indexPath);
  if (!mtime) {
    shellIndexCache = null;
    return null;
  }
  if (shellIndexCache && shellIndexCache.mtime === mtime) {
    return shellIndexCache;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(indexPath, "utf8")) as ShellIndexFile;
    if (parsed?.schemaVersion === 1 && parsed.leagues && typeof parsed.leagues === "object") {
      shellIndexCache = { mtime, leagues: parsed.leagues };
      return shellIndexCache;
    }
  } catch (err) {
    void err;
  }
  return null;
}

const ALL_SNAPSHOTS_TTL_MS = 15_000;
let allSnapshotsMemo: {
  root: string;
  at: number;
  envelopes: Record<ProductLeague, SnapshotEnvelope>;
} | null = null;

export function loadAllActiveLeagueSnapshots(): Record<ProductLeague, SnapshotEnvelope> {
  const root = resolveSnapshotsRoot();
  const now = Date.now();
  if (
    allSnapshotsMemo &&
    allSnapshotsMemo.root === root &&
    now - allSnapshotsMemo.at < ALL_SNAPSHOTS_TTL_MS
  ) {
    return allSnapshotsMemo.envelopes;
  }

  const precompiled = readFreshShellIndex(root);
  const entries = PRODUCT_LEAGUES.map((league) => {
    if (precompiled) {
      const pre = precompiled.leagues[league];
      if (pre) {
        const latestM = fileMtime(path.join(root, league, "latest.json"));
        const injuriesM = fileMtime(path.join(root, league, "injuries.json"));
        const pulseM = fileMtime(path.join(root, league, "market-pulse.json"));
        if (latestM <= precompiled.mtime && injuriesM <= precompiled.mtime && pulseM <= precompiled.mtime) {
          return [league, preserveEnvelopeFinishedForecastsV6(league, pre)] as [
            ProductLeague,
            SnapshotEnvelope,
          ];
        }
      }
    }
    return [league, loadLeagueSnapshotEnvelope(league)] as [ProductLeague, SnapshotEnvelope];
  });
  const envelopes = Object.fromEntries(entries) as Record<ProductLeague, SnapshotEnvelope>;
  allSnapshotsMemo = { root, at: now, envelopes };
  return envelopes;
}

const cortexWriteupCache = new Map<
  string,
  { mtime: number; byGame: Map<string, CortexWriteup | null> }
>();

export function loadCortexWriteup(leagueKey: ProductLeague, gameId: string): CortexWriteup | null {
  try {
    const latestPath = path.join(resolveSnapshotsRoot(), leagueKey, "latest.json");
    const mtime = fileMtime(latestPath);
    if (!mtime) {
      cortexWriteupCache.delete(leagueKey);
      return null;
    }

    const cached = cortexWriteupCache.get(leagueKey);
    if (cached && cached.mtime === mtime) {
      return cached.byGame.get(gameId) ?? null;
    }

    const rawCached = rawSnapshotCache.get(leagueKey);
    const analyses =
      rawCached && rawCached.mtime === mtime
        ? (rawCached.snapshot.analyses as Record<string, { cortex?: unknown }> | undefined)
        : (JSON.parse(fs.readFileSync(latestPath, "utf8")) as {
            analyses?: Record<string, { cortex?: unknown }>;
          }).analyses;

    const byGame = new Map<string, CortexWriteup | null>();
    if (analyses && typeof analyses === "object") {
      for (const [id, entry] of Object.entries(analyses)) {
        if (!entry || entry.cortex === undefined) continue;
        const parsed = CortexWriteupSchema.safeParse(entry.cortex);
        if (parsed.success) byGame.set(id, parsed.data);
      }
    }
    cortexWriteupCache.set(leagueKey, { mtime, byGame });
    return byGame.get(gameId) ?? null;
  } catch (err) {
    void err;
    return null;
  }
}

const rawSnapshotCache = new Map<string, { mtime: number; snapshot: LeagueSnapshot }>();

export function loadRawLeagueSnapshot(leagueKey: ProductLeague): LeagueSnapshot | null {
  try {
    const latestPath = path.join(resolveSnapshotsRoot(), leagueKey, "latest.json");
    const mtime = fileMtime(latestPath);
    if (!mtime) {
      rawSnapshotCache.delete(leagueKey);
      return null;
    }
    const cached = rawSnapshotCache.get(leagueKey);
    if (cached && cached.mtime === mtime) return cached.snapshot;

    const raw = JSON.parse(fs.readFileSync(latestPath, "utf8"));
    const parsed = LeagueSnapshotSchema.parse(raw);
    rawSnapshotCache.set(leagueKey, { mtime, snapshot: parsed });
    return parsed;
  } catch (err) {
    logSecurityEvent("warn", "snapshots_raw_read_failed", { league: leagueKey, error: err });
    return null;
  }
}
