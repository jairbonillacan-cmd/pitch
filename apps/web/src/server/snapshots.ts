import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  CLIENT_MATCH_CONTEXT_FACTOR_LABELS,
  COMPETITION_BY_ID,
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
  sealPreKickoffOutlookV6,
  sha256Hex,
  type MultiSportLeagueV60,
  type MultiSportModelArtifactV60,
  type PostWalkforwardTeamStateV60,
  type PreKickoffAnalysisPayloadV6,
  type PreKickoffCausalityAuditReportV6,
  type SealPreKickoffOutcomeV6,
  type SealedPreKickoffRecordV6,
  type SnapshotCausalityObservationV6,
} from "@pitchlab/spacetime/v6";
import multisportArtifactJson from "@pitchlab/spacetime/data/model_multisport_v6_0_candidate.json";
import {
  getBzzoiroLeagueEmblemUrl,
  getBzzoiroTeamEmblemUrl,
  getOfficialEspnLeagueLogoUrl,
  getOfficialEspnTeamLogoUrl,
} from "@pitchlab/sports-assets";
import { logSecurityEvent } from "./safe-logger";
import { safeStatMtimeMs } from "./perf-cache";
import {
  LEAGUE_LABELS,
  PRODUCT_LEAGUES,
  resolveSnapshotsRoot,
  type ProductLeague,
} from "./snapshots-config";

export { LEAGUE_LABELS, PRODUCT_LEAGUES, resolveSnapshotsRoot, type ProductLeague };

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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

let multisportArtifactV6Memo: MultiSportModelArtifactV60 | null = null;
let multisportArtifactNoNbaInjuriesV6Memo: MultiSportModelArtifactV60 | null = null;

function getMultisportArtifactV6Local(): MultiSportModelArtifactV60 {
  if (!multisportArtifactV6Memo) {
    multisportArtifactV6Memo = buildNarrowedMultiSportArtifactV6();
  }
  return multisportArtifactV6Memo;
}

function getMultisportArtifactNoNbaInjuriesV6Local(): MultiSportModelArtifactV60 {
  if (!multisportArtifactNoNbaInjuriesV6Memo) {
    multisportArtifactNoNbaInjuriesV6Memo = {
      ...getMultisportArtifactV6Local(),
      nba_active_injuries_2026: undefined,
    };
  }
  return multisportArtifactNoNbaInjuriesV6Memo;
}

const preKickoffSealLedger = new Map<string, SealedPreKickoffRecordV6>();
const sealVersionByLeague = new Map<string, number>();
const leagueCausalityAuditCache = new Map<string, PreKickoffCausalityAuditReportV6>();

function getLeagueSealVersion(leagueKey: string): number {
  return sealVersionByLeague.get(leagueKey) ?? 0;
}

function resolveMultiSportAliasSafe(
  sport: MultiSportLeagueV60,
  rawTeam: string,
): string | null {
  const artifact = getMultisportArtifactV6Local();
  let clean = rawTeam.trim().toLowerCase();
  const dblIdx = clean.indexOf("::");
  if (dblIdx >= 0) clean = clean.slice(dblIdx + 2);
  const dotIdx = clean.indexOf(".");
  if (dotIdx >= 0) clean = clean.slice(dotIdx + 1);
  clean = clean.replace(/[^a-z0-9_-]+/g, "");
  const code = artifact.team_slug_aliases[sport]?.[clean] ?? null;
  if (!code) return null;
  const stMap = artifact.teams_post_walkforward_state_2026;
  return stMap && stMap[`${sport}::${code}`] ? code : null;
}

function buildMultiSportCausalBackfillV6(params: {
  readonly sport: MultiSportLeagueV60;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly kickoffUtc: string;
  readonly neutralSite?: boolean;
}): PreKickoffAnalysisPayloadV6 | null {
  const artifact = getMultisportArtifactV6Local();
  const kickoffMs = parseIsoUtcEpochMs(params.kickoffUtc);
  if (kickoffMs === null) return null;
  const hCode = resolveMultiSportAliasSafe(params.sport, params.homeTeam);
  const aCode = resolveMultiSportAliasSafe(params.sport, params.awayTeam);
  if (!hCode || !aCode) return null;

  const stMap = artifact.teams_post_walkforward_state_2026;
  const hSt = stMap?.[`${params.sport}::${hCode}`];
  const aSt = stMap?.[`${params.sport}::${aCode}`];
  if (!hSt || !aSt) return null;
  if (typeof hSt.last_game_date !== "string" || typeof aSt.last_game_date !== "string") {
    return null;
  }

  const gameDate = formatEpochMsUtc(kickoffMs).slice(0, 10);
  if (!(hSt.last_game_date < gameDate && aSt.last_game_date < gameDate)) {
    return null;
  }

  const latestStateDate =
    hSt.last_game_date >= aSt.last_game_date ? hSt.last_game_date : aSt.last_game_date;
  const stateInputsMs = parseIsoUtcEpochMs(`${latestStateDate}T23:59:59.000Z`);
  if (stateInputsMs === null || stateInputsMs > kickoffMs) {
    return null;
  }

  let effectiveArtifact = artifact;
  let effectiveInputsMs = stateInputsMs;
  if (params.sport === "nba") {
    const injObsMs = artifact.nba_active_injuries_observed_at_utc
      ? parseIsoUtcEpochMs(artifact.nba_active_injuries_observed_at_utc)
      : null;
    if (injObsMs !== null && injObsMs <= kickoffMs) {
      effectiveInputsMs = Math.max(stateInputsMs, injObsMs);
    } else {
      effectiveArtifact = getMultisportArtifactNoNbaInjuriesV6Local();
    }
  }

  const inputsAsOfUtc = formatEpochMsUtc(effectiveInputsMs);

  try {
    const out = projectMultiSportMatchupFromStateV60({
      sport: params.sport,
      homeTeam: hCode,
      awayTeam: aCode,
      gameDate,
      neutralSite: params.neutralSite ?? false,
      artifact: effectiveArtifact,
    });

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

interface CompactHistoricalRescueEntryV6 {
  readonly status: string;
  readonly payload: PreKickoffAnalysisPayloadV6;
}

interface CachedDatedSnapshotIndexV6 {
  readonly mtime: number;
  readonly generatedAtMs: number | null;
  readonly byGameId: ReadonlyMap<string, CompactHistoricalRescueEntryV6>;
}

interface LightweightGameCausalityInputV6 {
  readonly id: string;
  readonly startTime: string;
  readonly status: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly neutralSite: boolean;
  readonly incomingAnalysis: PreKickoffAnalysisPayloadV6 | null;
}

interface CachedLatestCausalityMetaV6 {
  readonly mtime: number;
  readonly games: readonly LightweightGameCausalityInputV6[];
}

interface GameReconciliationInputV6 {
  readonly matchId: string;
  readonly sport: string;
  readonly league: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly kickoffUtc: string;
  readonly status: string;
  readonly neutralSite: boolean;
  readonly incomingAnalysis: PreKickoffAnalysisPayloadV6 | null;
  readonly rescuedHistoricalAnalysis: CompactHistoricalRescueEntryV6 | null;
}

const historicalDatedFileCache = new Map<string, CachedDatedSnapshotIndexV6>();
const latestCausalityMetaCache = new Map<string, CachedLatestCausalityMetaV6>();
const shellIndexReconciledCache = new Map<
  string,
  { readonly key: string; readonly envelope: SnapshotEnvelope }
>();
const rawSnapshotCache = new Map<string, { mtime: number; snapshot: LeagueSnapshot }>();
const marketPulseCache = new Map<string, { mtime: number; byGame: Map<string, MarketPulseView> }>();
const injuriesCache = new Map<string, { mtime: number; byTeam: Map<string, TeamInjuryEntry[]> }>();

function extractSlugFromTeamId(rawId: string): string {
  const dotIdx = rawId.indexOf(".");
  return dotIdx >= 0 ? rawId.slice(dotIdx + 1) : rawId;
}

function extractCompactPayloadFromRawAnalysis(
  rawAnalysis: unknown,
  hasDraw: boolean,
): PreKickoffAnalysisPayloadV6 | null {
  if (!isPlainRecord(rawAnalysis)) return null;
  const inputsAsOf = rawAnalysis.inputsAsOf;
  if (typeof inputsAsOf !== "string" || inputsAsOf.trim().length === 0) return null;

  const rawX12 = rawAnalysis.x12;
  if (!Array.isArray(rawX12) || rawX12.length < 3) return null;
  const pHome = parseStrictFiniteNumber(rawX12[0]);
  const pDraw = parseStrictFiniteNumber(rawX12[1]);
  const pAway = parseStrictFiniteNumber(rawX12[2]);
  if (pHome === null || pDraw === null || pAway === null) return null;

  const rawProj = rawAnalysis.projection;
  if (!isPlainRecord(rawProj)) return null;
  const projHome = parseStrictFiniteNumber(rawProj.home);
  const projAway = parseStrictFiniteNumber(rawProj.away);
  const projTotal = parseStrictFiniteNumber(rawProj.total);
  if (projHome === null || projAway === null || projTotal === null) return null;
  const projMargin =
    rawProj.margin !== undefined ? parseStrictFiniteNumber(rawProj.margin) : null;

  let pOver25: number | undefined;
  const rawProbs = rawAnalysis.probabilities;
  if (Array.isArray(rawProbs)) {
    for (const row of rawProbs) {
      if (!isPlainRecord(row)) continue;
      if (
        row.market === "totals" &&
        typeof row.selection === "string" &&
        row.selection.toLowerCase().startsWith("over") &&
        row.line === 2.5
      ) {
        const parsedP = parseStrictFiniteNumber(row.p);
        if (parsedP !== null) {
          pOver25 = parsedP;
          break;
        }
      }
    }
  }

  return {
    inputsAsOfUtc: inputsAsOf,
    probabilities: {
      pHome,
      pDraw: hasDraw ? pDraw : null,
      pAway,
      ...(pOver25 !== undefined ? { pOver25 } : {}),
    },
    projection: {
      home: projHome,
      away: projAway,
      total: projTotal,
      ...(projMargin !== null ? { margin: projMargin } : {}),
    },
  };
}

function readDatedSnapshotIndexCached(
  filePath: string,
  hasDraw: boolean,
): CachedDatedSnapshotIndexV6 | null {
  const mtime = fileMtime(filePath);
  if (mtime <= 0) {
    historicalDatedFileCache.delete(filePath);
    return null;
  }
  const cached = historicalDatedFileCache.get(filePath);
  if (cached && cached.mtime === mtime) {
    return cached;
  }
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!isPlainRecord(raw)) return null;
    const rawUpdated =
      typeof raw.updatedAt === "string"
        ? raw.updatedAt
        : typeof raw.generatedAt === "string"
          ? raw.generatedAt
          : null;
    const generatedAtMs = rawUpdated ? parseIsoUtcEpochMs(rawUpdated) : null;
    const rawGames = Array.isArray(raw.games) ? raw.games : [];
    const rawAnalyses = isPlainRecord(raw.analyses) ? raw.analyses : null;
    const byGameId = new Map<string, CompactHistoricalRescueEntryV6>();
    if (rawAnalyses) {
      for (const rawGame of rawGames) {
        if (!isPlainRecord(rawGame) || typeof rawGame.id !== "string") continue;
        const payload = extractCompactPayloadFromRawAnalysis(rawAnalyses[rawGame.id], hasDraw);
        if (!payload) continue;
        const status = typeof rawGame.status === "string" ? rawGame.status : "scheduled";
        byGameId.set(rawGame.id, { status, payload });
      }
    }
    const index: CachedDatedSnapshotIndexV6 = { mtime, generatedAtMs, byGameId };
    historicalDatedFileCache.set(filePath, index);
    return index;
  } catch (err) {
    void err;
    return null;
  }
}

function buildLatestCausalityGamesFromRaw(
  raw: Record<string, unknown>,
  hasDraw: boolean,
): LightweightGameCausalityInputV6[] {
  const rawGames = Array.isArray(raw.games) ? raw.games : [];
  const rawAnalyses = isPlainRecord(raw.analyses) ? raw.analyses : null;
  const games: LightweightGameCausalityInputV6[] = [];
  for (const rawGame of rawGames) {
    if (!isPlainRecord(rawGame)) continue;
    const id = typeof rawGame.id === "string" ? rawGame.id : "";
    const startTime = typeof rawGame.startTime === "string" ? rawGame.startTime : "";
    if (!id || !startTime) continue;
    const status = typeof rawGame.status === "string" ? rawGame.status : "scheduled";
    const homeRec = isPlainRecord(rawGame.home) ? rawGame.home : null;
    const awayRec = isPlainRecord(rawGame.away) ? rawGame.away : null;
    const homeId = homeRec && typeof homeRec.id === "string" ? homeRec.id : "";
    const awayId = awayRec && typeof awayRec.id === "string" ? awayRec.id : "";
    const incomingAnalysis = rawAnalyses
      ? extractCompactPayloadFromRawAnalysis(rawAnalyses[id], hasDraw)
      : null;
    games.push({
      id,
      startTime,
      status,
      homeTeam: extractSlugFromTeamId(homeId),
      awayTeam: extractSlugFromTeamId(awayId),
      neutralSite: Boolean(rawGame.neutralSite),
      incomingAnalysis,
    });
  }
  return games;
}

function readLatestCausalityMetaCached(
  latestPath: string,
  hasDraw: boolean,
  mtimeOverride?: number,
  leagueKey?: ProductLeague,
): CachedLatestCausalityMetaV6 | null {
  const mtime = mtimeOverride ?? fileMtime(latestPath);
  if (mtime <= 0) {
    latestCausalityMetaCache.delete(latestPath);
    return null;
  }
  const cached = latestCausalityMetaCache.get(latestPath);
  if (cached && cached.mtime === mtime) {
    return cached;
  }
  try {
    const rawCached = leagueKey ? rawSnapshotCache.get(leagueKey) : undefined;
    if (rawCached && rawCached.mtime === mtime) {
      const games: LightweightGameCausalityInputV6[] = rawCached.snapshot.games.map((g) => ({
        id: g.id,
        startTime: g.startTime,
        status: g.status,
        homeTeam: extractSlugFromTeamId(g.home.id),
        awayTeam: extractSlugFromTeamId(g.away.id),
        neutralSite: Boolean(g.neutralSite),
        incomingAnalysis: toPreKickoffPayloadFromGameAnalysis(
          rawCached.snapshot.analyses[g.id],
          hasDraw,
        ),
      }));
      const meta: CachedLatestCausalityMetaV6 = { mtime, games };
      latestCausalityMetaCache.set(latestPath, meta);
      return meta;
    }

    const raw: unknown = JSON.parse(fs.readFileSync(latestPath, "utf8"));
    if (!isPlainRecord(raw)) return null;
    const games = buildLatestCausalityGamesFromRaw(raw, hasDraw);
    const meta: CachedLatestCausalityMetaV6 = { mtime, games };
    latestCausalityMetaCache.set(latestPath, meta);
    return meta;
  } catch (err) {
    void err;
    return null;
  }
}

function findNewestCausalHistoricalRescuesFromDisk(
  leagueDir: string,
  targetKickoffsByGameId: ReadonlyMap<string, number>,
  hasDraw: boolean,
): Map<string, CompactHistoricalRescueEntryV6> {
  const rescued = new Map<string, CompactHistoricalRescueEntryV6>();
  if (targetKickoffsByGameId.size === 0) return rescued;

  let maxTargetKoMs = Number.NEGATIVE_INFINITY;
  for (const koMs of targetKickoffsByGameId.values()) {
    if (koMs > maxTargetKoMs) maxTargetKoMs = koMs;
  }

  let datedFiles: string[];
  try {
    datedFiles = fs
      .readdirSync(leagueDir)
      .filter((name) => DATED_SNAPSHOT_RE.test(name))
      .sort()
      .reverse()
      .slice(0, MAX_HISTORICAL_SNAPSHOTS_FOR_RESCUE);
  } catch (err) {
    void err;
    return rescued;
  }

  const remaining = new Map(targetKickoffsByGameId);
  for (const fileName of datedFiles) {
    if (remaining.size === 0) break;
    const fileDayMs = Date.parse(`${fileName.slice(0, 10)}T00:00:00.000Z`);
    if (
      Number.isFinite(fileDayMs) &&
      Number.isFinite(maxTargetKoMs) &&
      fileDayMs - 36 * 3_600_000 > maxTargetKoMs
    ) {
      continue;
    }
    const idx = readDatedSnapshotIndexCached(path.join(leagueDir, fileName), hasDraw);
    if (!idx) continue;
    for (const [gameId, koMs] of Array.from(remaining.entries())) {
      if (idx.generatedAtMs !== null && idx.generatedAtMs > koMs) continue;
      const entry = idx.byGameId.get(gameId);
      if (!entry) continue;
      const iaoMs = parseIsoUtcEpochMs(entry.payload.inputsAsOfUtc);
      if (iaoMs !== null && iaoMs <= koMs) {
        rescued.set(gameId, entry);
        remaining.delete(gameId);
      }
    }
  }
  return rescued;
}

function findNewestCausalHistoricalRescuesFromSnapshots(
  historicalSnapshots: readonly LeagueSnapshot[] | undefined,
  targetKickoffsByGameId: ReadonlyMap<string, number>,
  hasDraw: boolean,
): Map<string, CompactHistoricalRescueEntryV6> {
  const rescued = new Map<string, CompactHistoricalRescueEntryV6>();
  if (!historicalSnapshots || historicalSnapshots.length === 0 || targetKickoffsByGameId.size === 0) {
    return rescued;
  }
  const ordered = historicalSnapshots
    .slice()
    .sort((a, b) => (parseIsoUtcEpochMs(b.updatedAt) ?? 0) - (parseIsoUtcEpochMs(a.updatedAt) ?? 0));
  const remaining = new Map(targetKickoffsByGameId);
  for (const hist of ordered) {
    if (remaining.size === 0) break;
    const histUpdatedMs = parseIsoUtcEpochMs(hist.updatedAt);
    for (const game of hist.games) {
      const koMs = remaining.get(game.id);
      if (koMs === undefined) continue;
      if (histUpdatedMs !== null && histUpdatedMs > koMs) continue;
      const analysis = hist.analyses[game.id];
      if (!analysis) continue;
      const payload = toPreKickoffPayloadFromGameAnalysis(analysis, hasDraw);
      if (!payload) continue;
      const iaoMs = parseIsoUtcEpochMs(payload.inputsAsOfUtc);
      if (iaoMs !== null && iaoMs <= koMs) {
        rescued.set(game.id, { status: game.status, payload });
        remaining.delete(game.id);
      }
    }
  }
  return rescued;
}

function reconcileGamesWithSealsV6(
  inputs: readonly GameReconciliationInputV6[],
  priorSeals: ReadonlyMap<string, SealedPreKickoffRecordV6>,
): PreKickoffCausalityAuditReportV6 {
  let hasAnyPriorSeal = false;
  for (const item of inputs) {
    if (priorSeals.has(`${item.league}::${item.matchId}`)) {
      hasAnyPriorSeal = true;
      break;
    }
  }

  if (!hasAnyPriorSeal) {
    const observations: SnapshotCausalityObservationV6[] = [];
    for (const item of inputs) {
      if (item.rescuedHistoricalAnalysis) {
        observations.push({
          matchId: item.matchId,
          sport: item.sport,
          league: item.league,
          homeTeam: item.homeTeam,
          awayTeam: item.awayTeam,
          kickoffUtc: item.kickoffUtc,
          status: item.rescuedHistoricalAnalysis.status,
          incomingAnalysis: item.rescuedHistoricalAnalysis.payload,
        });
      }
      const koMs = parseIsoUtcEpochMs(item.kickoffUtc);
      const iaoMs = item.incomingAnalysis ? parseIsoUtcEpochMs(item.incomingAnalysis.inputsAsOfUtc) : null;
      const needsBackfill =
        item.rescuedHistoricalAnalysis === null &&
        (item.incomingAnalysis === null || (koMs !== null && (iaoMs === null || iaoMs > koMs)));
      const causalBackfillAnalysis =
        needsBackfill && isMultiSportLeagueV60(item.league)
          ? buildMultiSportCausalBackfillV6({
              sport: item.league,
              homeTeam: item.homeTeam,
              awayTeam: item.awayTeam,
              kickoffUtc: item.kickoffUtc,
              neutralSite: item.neutralSite,
            })
          : null;
      observations.push({
        matchId: item.matchId,
        sport: item.sport,
        league: item.league,
        homeTeam: item.homeTeam,
        awayTeam: item.awayTeam,
        kickoffUtc: item.kickoffUtc,
        status: item.status,
        incomingAnalysis: item.incomingAnalysis,
        causalBackfillAnalysis,
      });
    }
    return auditPreKickoffCausalityV6(observations);
  }

  const sealedByKey = new Map<string, SealedPreKickoffRecordV6>();
  const latestOutcomeByKey: Record<string, SealPreKickoffOutcomeV6> = {};
  let totalObservationsAudited = 0;
  let rawStrictPre = 0;
  let rawPostKoContaminated = 0;
  let rawPostKoFt = 0;
  let rawPostKoScheduled = 0;
  let rawMissingOnFt = 0;
  let rescuedFromPriorSeal = 0;
  let recoveredFromCausalBackfill = 0;
  let rejectedUnrecoverableContaminated = 0;

  const recordOutcomeCounters = (res: SealPreKickoffOutcomeV6): void => {
    totalObservationsAudited += 1;
    if (res.incomingCausalityStatus === "strict_pre_kickoff") {
      rawStrictPre += 1;
    } else if (res.incomingCausalityStatus === "post_kickoff_contaminated") {
      rawPostKoContaminated += 1;
      if (res.lifecycleStatus === "FT") rawPostKoFt += 1;
      else if (res.lifecycleStatus === "scheduled") rawPostKoScheduled += 1;
    } else if (res.incomingCausalityStatus === "missing_analysis" && res.lifecycleStatus === "FT") {
      rawMissingOnFt += 1;
    }

    if (
      res.sealAction === "rejected_contaminated_preserved_seal" ||
      res.sealAction === "preserved_seal_on_missing_upstream"
    ) {
      rescuedFromPriorSeal += 1;
    } else if (
      res.sealAction === "recovered_ft_from_causal_walkforward" ||
      res.sealAction === "rejected_contaminated_sealed_from_causal_backfill"
    ) {
      recoveredFromCausalBackfill += 1;
    } else if (res.sealAction === "rejected_post_kickoff_contaminated") {
      rejectedUnrecoverableContaminated += 1;
    }
  };

  for (const item of inputs) {
    const key = `${item.league}::${item.matchId}`;
    let existing = priorSeals.get(key) ?? sealedByKey.get(key) ?? null;
    if (existing) {
      sealedByKey.set(key, existing);
    }

    if (!existing && item.rescuedHistoricalAnalysis) {
      const histRes = sealPreKickoffOutlookV6({
        matchId: item.matchId,
        sport: item.sport,
        league: item.league,
        homeTeam: item.homeTeam,
        awayTeam: item.awayTeam,
        kickoffUtc: item.kickoffUtc,
        status: item.rescuedHistoricalAnalysis.status,
        incomingAnalysis: item.rescuedHistoricalAnalysis.payload,
        existingSealedRecord: null,
        causalBackfillAnalysis: null,
        allowPreKickoffRefresh: false,
      });
      recordOutcomeCounters(histRes);
      if (histRes.sealedRecord) {
        existing = histRes.sealedRecord;
        sealedByKey.set(key, existing);
      }
      latestOutcomeByKey[key] = histRes;
    }

    const koMs = parseIsoUtcEpochMs(item.kickoffUtc);
    const iaoMs = item.incomingAnalysis ? parseIsoUtcEpochMs(item.incomingAnalysis.inputsAsOfUtc) : null;
    const needsBackfill =
      existing === null &&
      (item.incomingAnalysis === null || (koMs !== null && (iaoMs === null || iaoMs > koMs)));
    const causalBackfillAnalysis =
      needsBackfill && isMultiSportLeagueV60(item.league)
        ? buildMultiSportCausalBackfillV6({
            sport: item.league,
            homeTeam: item.homeTeam,
            awayTeam: item.awayTeam,
            kickoffUtc: item.kickoffUtc,
            neutralSite: item.neutralSite,
          })
        : null;

    const res = sealPreKickoffOutlookV6({
      matchId: item.matchId,
      sport: item.sport,
      league: item.league,
      homeTeam: item.homeTeam,
      awayTeam: item.awayTeam,
      kickoffUtc: item.kickoffUtc,
      status: item.status,
      incomingAnalysis: item.incomingAnalysis,
      existingSealedRecord: existing,
      causalBackfillAnalysis,
      allowPreKickoffRefresh: false,
    });
    recordOutcomeCounters(res);
    if (res.sealedRecord) {
      sealedByKey.set(key, res.sealedRecord);
    }
    latestOutcomeByKey[key] = res;
  }

  const sortedSealedKeys = Array.from(sealedByKey.keys()).sort();
  const chainPairs: Array<[string, string]> = [];
  let contaminatedAccepted = 0;
  for (const k of sortedSealedKeys) {
    const rec = sealedByKey.get(k);
    if (!rec) continue;
    chainPairs.push([k, rec.sealSha256]);
    if (rec.inputsAsOfEpochMs > rec.kickoffEpochMs) {
      contaminatedAccepted += 1;
    }
  }
  const ledgerSha256 = sha256Hex(JSON.stringify(chainPairs));

  let ftTotal = 0;
  let ftWithForecast = 0;
  for (const r of Object.values(latestOutcomeByKey)) {
    if (r.lifecycleStatus === "FT") {
      ftTotal += 1;
      if (r.hasForecast) ftWithForecast += 1;
    }
  }

  return Object.freeze({
    totalObservationsAudited,
    uniqueMatchesTracked: Object.keys(latestOutcomeByKey).length,
    sealedMatchesCount: sealedByKey.size,
    rawStrictPreKickoffCount: rawStrictPre,
    rawPostKickoffContaminatedCount: rawPostKoContaminated,
    rawPostKickoffFtCount: rawPostKoFt,
    rawPostKickoffScheduledCount: rawPostKoScheduled,
    rawMissingAnalysisOnFtCount: rawMissingOnFt,
    rescuedFromPriorSealCount: rescuedFromPriorSeal,
    recoveredFromCausalBackfillCount: recoveredFromCausalBackfill,
    rejectedUnrecoverableContaminatedCount: rejectedUnrecoverableContaminated,
    finalMatchesTotal: ftTotal,
    finalMatchesWithSealedForecast: ftWithForecast,
    contaminatedAcceptedIntoLedgerCount: contaminatedAccepted,
    ledgerSha256,
    outcomesByMatchKey: Object.freeze(latestOutcomeByKey),
  });
}

function storeNewLedgerSeal(key: string, record: SealedPreKickoffRecordV6): void {
  if (record.inputsAsOfEpochMs > record.kickoffEpochMs) return;
  if (!preKickoffSealLedger.has(key)) {
    preKickoffSealLedger.set(key, record);
    const sep = key.indexOf("::");
    const leagueKey = sep > 0 ? key.slice(0, sep) : key;
    sealVersionByLeague.set(leagueKey, getLeagueSealVersion(leagueKey) + 1);
  }
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
    readonly rescuedHistoricalByGameId?: ReadonlyMap<string, CompactHistoricalRescueEntryV6>;
    readonly priorSeals?: ReadonlyMap<string, SealedPreKickoffRecordV6>;
  } = {},
): SnapshotCausalityReconciliationResult {
  const { days, matches } = snapshotToMatchAnalyses(snapshot);
  const sportTag = toSportTagForSeal(snapshot.league);
  const hasDraw = sportHasDraw(sportForLeague(snapshot.league));
  const priorSeals = options.priorSeals ?? preKickoffSealLedger;

  const targetKickoffsByGameId = new Map<string, number>();
  for (const game of snapshot.games) {
    const key = `${snapshot.league}::${game.id}`;
    if (priorSeals.has(key)) continue;
    const analysis = snapshot.analyses[game.id];
    const koMs = parseIsoUtcEpochMs(game.startTime);
    const iaoMs = analysis ? parseIsoUtcEpochMs(analysis.inputsAsOf) : null;
    if (koMs !== null && (!analysis || iaoMs === null || iaoMs > koMs)) {
      targetKickoffsByGameId.set(game.id, koMs);
    }
  }

  const rescuedByGameId =
    options.rescuedHistoricalByGameId ??
    findNewestCausalHistoricalRescuesFromSnapshots(
      options.historicalSnapshots,
      targetKickoffsByGameId,
      hasDraw,
    );

  const reconcileInputs: GameReconciliationInputV6[] = snapshot.games.map((game) => ({
    matchId: game.id,
    sport: sportTag,
    league: snapshot.league,
    homeTeam: extractSlugFromTeamId(game.home.id),
    awayTeam: extractSlugFromTeamId(game.away.id),
    kickoffUtc: game.startTime,
    status: game.status,
    neutralSite: Boolean(game.neutralSite),
    incomingAnalysis: toPreKickoffPayloadFromGameAnalysis(snapshot.analyses[game.id], hasDraw),
    rescuedHistoricalAnalysis: rescuedByGameId.get(game.id) ?? null,
  }));

  const audit = reconcileGamesWithSealsV6(reconcileInputs, priorSeals);
  const reconciledMatches = matches.map((m) => {
    const key = `${snapshot.league}::${m.id}`;
    const outcome = audit.outcomesByMatchKey[key];
    if (!outcome) return m;
    if (options.priorSeals === undefined && outcome.sealedRecord) {
      storeNewLedgerSeal(key, outcome.sealedRecord);
    }
    return applySealedRecordToMatch(m, outcome);
  });

  return { days, matches: reconciledMatches, audit };
}

function applyCausalityAuditToPreEnvelope(
  leagueKey: ProductLeague,
  envelope: SnapshotEnvelope,
  audit: PreKickoffCausalityAuditReportV6,
  shellIndexMtime: number,
  latestMtime: number,
): SnapshotEnvelope {
  if (envelope.state !== "ready" || !envelope.data) return envelope;
  const frozenAudit = Object.isFrozen(audit)
    ? audit
    : Object.freeze({
        ...audit,
        outcomesByMatchKey: Object.freeze(audit.outcomesByMatchKey),
      });
  leagueCausalityAuditCache.set(leagueKey, frozenAudit);

  const updatedGames = envelope.data.games.map((g) => {
    const key = `${leagueKey}::${g.id}`;
    const outcome = frozenAudit.outcomesByMatchKey[key];
    if (!outcome) return g;
    if (outcome.sealedRecord) {
      storeNewLedgerSeal(key, outcome.sealedRecord);
    }
    return applySealedRecordToMatch(g, outcome);
  });

  const reconciledEnvelope: SnapshotEnvelope = {
    ...envelope,
    data: {
      ...envelope.data,
      games: updatedGames,
    },
  };
  shellIndexReconciledCache.set(leagueKey, {
    key: `${shellIndexMtime}:${latestMtime}:${getLeagueSealVersion(leagueKey)}`,
    envelope: reconciledEnvelope,
  });
  return reconciledEnvelope;
}

function reconcileShellIndexEnvelopeV6(
  leagueKey: ProductLeague,
  leagueDir: string,
  envelope: SnapshotEnvelope,
  shellIndexMtime: number,
  latestMtime: number,
): SnapshotEnvelope {
  if (envelope.state !== "ready" || !envelope.data) return envelope;
  const cacheKeyBefore = `${shellIndexMtime}:${latestMtime}:${getLeagueSealVersion(leagueKey)}`;
  const cached = shellIndexReconciledCache.get(leagueKey);
  if (cached && cached.key === cacheKeyBefore) {
    return cached.envelope;
  }

  const hasDraw = sportHasDraw(sportForLeague(leagueKey));
  const latestPath = path.join(leagueDir, "latest.json");
  const meta = readLatestCausalityMetaCached(latestPath, hasDraw, latestMtime, leagueKey);
  if (!meta) {
    return envelope;
  }

  const sportTag = toSportTagForSeal(leagueKey);
  const targetKickoffsByGameId = new Map<string, number>();
  for (const g of meta.games) {
    const key = `${leagueKey}::${g.id}`;
    if (preKickoffSealLedger.has(key)) continue;
    const koMs = parseIsoUtcEpochMs(g.startTime);
    const iaoMs = g.incomingAnalysis ? parseIsoUtcEpochMs(g.incomingAnalysis.inputsAsOfUtc) : null;
    if (koMs !== null && (!g.incomingAnalysis || iaoMs === null || iaoMs > koMs)) {
      targetKickoffsByGameId.set(g.id, koMs);
    }
  }

  const rescuedByGameId = findNewestCausalHistoricalRescuesFromDisk(
    leagueDir,
    targetKickoffsByGameId,
    hasDraw,
  );

  const reconcileInputs: GameReconciliationInputV6[] = meta.games.map((g) => ({
    matchId: g.id,
    sport: sportTag,
    league: leagueKey,
    homeTeam: g.homeTeam,
    awayTeam: g.awayTeam,
    kickoffUtc: g.startTime,
    status: g.status,
    neutralSite: g.neutralSite,
    incomingAnalysis: g.incomingAnalysis,
    rescuedHistoricalAnalysis: rescuedByGameId.get(g.id) ?? null,
  }));

  const audit = reconcileGamesWithSealsV6(reconcileInputs, preKickoffSealLedger);
  return applyCausalityAuditToPreEnvelope(
    leagueKey,
    envelope,
    audit,
    shellIndexMtime,
    latestMtime,
  );
}

const snapshotCache = new Map<string, { key: string; envelope: SnapshotEnvelope }>();

function fileMtime(file: string): number {
  return safeStatMtimeMs(file);
}

function loadMarketPulse(file: string, knownMtime?: number): Map<string, MarketPulseView> {
  const mtime = knownMtime ?? fileMtime(file);
  if (mtime <= 0) {
    marketPulseCache.delete(file);
    return new Map();
  }
  const cached = marketPulseCache.get(file);
  if (cached && cached.mtime === mtime) {
    return cached.byGame;
  }
  const byGame = new Map<string, MarketPulseView>();
  try {
    const parsed = MarketPulseFileSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
    for (const entry of parsed.entries) byGame.set(entry.gameId, toMarketPulseView(entry));
    marketPulseCache.set(file, { mtime, byGame });
  } catch (err) {
    void err;
    byGame.clear();
  }
  return byGame;
}

function loadLeagueInjuries(file: string, knownMtime?: number): Map<string, TeamInjuryEntry[]> {
  const mtime = knownMtime ?? fileMtime(file);
  if (mtime <= 0) {
    injuriesCache.delete(file);
    return new Map();
  }
  const cached = injuriesCache.get(file);
  if (cached && cached.mtime === mtime) {
    return cached.byTeam;
  }
  const byTeam = new Map<string, TeamInjuryEntry[]>();
  try {
    const parsed = LeagueInjuriesFileSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
    for (const entry of parsed.entries) {
      const bucket = byTeam.get(entry.teamId) ?? [];
      bucket.push(entry);
      byTeam.set(entry.teamId, bucket);
    }
    injuriesCache.set(file, { mtime, byTeam });
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

const LEAGUE_SEASONS: Record<ProductLeague, string> = Object.fromEntries(
  PRODUCT_LEAGUES.map((id) => [id, COMPETITION_BY_ID[id]?.season ?? "2026"]),
) as Record<ProductLeague, string>;

interface PreStattedLeagueFiles {
  readonly latestM: number;
  readonly latestSize: number;
  readonly pulseM: number;
  readonly pulseSize: number;
  readonly injuriesM: number;
  readonly injuriesSize: number;
  readonly dirM: number;
}

function loadLeagueSnapshotEnvelopeInternal(
  leagueKey: ProductLeague,
  preStatted?: PreStattedLeagueFiles,
): SnapshotEnvelope {
  const root = resolveSnapshotsRoot();
  const leagueDir = path.join(root, leagueKey);
  const latestPath = path.join(leagueDir, "latest.json");
  const league = asLeagueId(leagueKey);
  const snapshotMtime = preStatted ? preStatted.latestM : fileMtime(latestPath);

  if (snapshotMtime <= 0) {
    snapshotCache.delete(leagueKey);
    rawSnapshotCache.delete(leagueKey);
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
  const pulseMtime = preStatted ? preStatted.pulseM : fileMtime(pulsePath);
  const injuriesMtime = preStatted ? preStatted.injuriesM : fileMtime(injuriesPath);
  const cacheKeyBefore = `${snapshotMtime}:${pulseMtime}:${injuriesMtime}:${getLeagueSealVersion(leagueKey)}`;
  const cached = snapshotCache.get(leagueKey);
  if (cached && cached.key === cacheKeyBefore) {
    return cached.envelope;
  }

  try {
    const rawCached = rawSnapshotCache.get(leagueKey);
    let parsed: LeagueSnapshot;
    if (rawCached && rawCached.mtime === snapshotMtime) {
      parsed = rawCached.snapshot;
    } else {
      const raw: unknown = JSON.parse(fs.readFileSync(latestPath, "utf8"));
      parsed = LeagueSnapshotSchema.parse(raw);
      rawSnapshotCache.set(leagueKey, { mtime: snapshotMtime, snapshot: parsed });
    }
    assertNotDemoInProduction(parsed.provenance);

    const hasDraw = sportHasDraw(sportForLeague(parsed.league));
    const targetKickoffsByGameId = new Map<string, number>();
    for (const g of parsed.games) {
      const key = `${parsed.league}::${g.id}`;
      if (preKickoffSealLedger.has(key)) continue;
      const a = parsed.analyses[g.id];
      const koMs = parseIsoUtcEpochMs(g.startTime);
      const iaoMs = a ? parseIsoUtcEpochMs(a.inputsAsOf) : null;
      if (koMs !== null && (!a || iaoMs === null || iaoMs > koMs)) {
        targetKickoffsByGameId.set(g.id, koMs);
      }
    }
    const rescuedHistoricalByGameId = findNewestCausalHistoricalRescuesFromDisk(
      leagueDir,
      targetKickoffsByGameId,
      hasDraw,
    );
    const { days, matches, audit } = applyPreKickoffCausalityToSnapshot(parsed, {
      rescuedHistoricalByGameId,
    });
    leagueCausalityAuditCache.set(leagueKey, audit);

    const pulses = loadMarketPulse(pulsePath, pulseMtime);
    const injuriesByTeam = loadLeagueInjuries(injuriesPath, injuriesMtime);
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
    snapshotCache.set(leagueKey, {
      key: `${snapshotMtime}:${pulseMtime}:${injuriesMtime}:${getLeagueSealVersion(leagueKey)}`,
      envelope,
    });
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

export function loadLeagueSnapshotEnvelope(leagueKey: ProductLeague): SnapshotEnvelope {
  return loadLeagueSnapshotEnvelopeInternal(leagueKey);
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
  shellLeagueMetaCache = null;
  preKickoffSealLedger.clear();
  sealVersionByLeague.clear();
  leagueCausalityAuditCache.clear();
  historicalDatedFileCache.clear();
  latestCausalityMetaCache.clear();
  shellIndexReconciledCache.clear();
  rawSnapshotCache.clear();
  marketPulseCache.clear();
  injuriesCache.clear();
  cortexWriteupCache.clear();
}

interface ShellIndexFile {
  schemaVersion?: number;
  builtAt?: string;
  leagues?: Record<string, SnapshotEnvelope>;
}

export interface ShellLeagueMeta {
  readonly season: string;
  readonly roundLabel: string;
  readonly generatedAt: string;
  readonly logoUrl?: string;
  readonly totalGames: number;
  readonly upcomingCount: number;
  readonly finishedCount: number;
  readonly hasLive: boolean;
  readonly upcomingDays: readonly string[];
  readonly leaderName?: string;
  readonly leaderPoints?: number;
}

export interface CachedShellLeagueMetaEntry {
  readonly root: string;
  readonly mtime: number;
  readonly leagues: Readonly<Record<string, ShellLeagueMeta>>;
}

interface ShellLeagueMetaDiskFile {
  readonly schemaVersion: 1;
  readonly root: string;
  readonly indexMtime: number;
  readonly leagues: Record<string, ShellLeagueMeta>;
}

export interface CachedShellIndexEntry {
  readonly root: string;
  readonly mtime: number;
  readonly leagues: Readonly<Record<string, SnapshotEnvelope>>;
  readonly gameToLeague: ReadonlyMap<string, ProductLeague>;
}

const PRODUCT_LEAGUE_SET: ReadonlySet<string> = new Set(PRODUCT_LEAGUES);

function isProductLeagueKey(raw: string): raw is ProductLeague {
  return PRODUCT_LEAGUE_SET.has(raw);
}

let shellIndexCache: CachedShellIndexEntry | null = null;
let shellLeagueMetaCache: CachedShellLeagueMetaEntry | null = null;

function shellLeagueMetaDiskPath(root: string): string {
  return path.join(os.tmpdir(), `pitchlab-shell-league-meta-v1-${sha256Hex(root).slice(0, 16)}.json`);
}

function buildShellLeagueMetaMap(
  leagues: Readonly<Record<string, SnapshotEnvelope>>,
): Record<string, ShellLeagueMeta> {
  const out: Record<string, ShellLeagueMeta> = {};
  for (const [leagueKey, env] of Object.entries(leagues)) {
    if (!isProductLeagueKey(leagueKey) || !env || env.state !== "ready" || !env.data) {
      continue;
    }
    const data = env.data;
    let upcomingCount = 0;
    let finishedCount = 0;
    let hasLive = false;
    const upcomingDaysSet = new Set<string>();
    for (const game of data.games) {
      if (game.status === "FT") {
        finishedCount += 1;
        continue;
      }
      upcomingCount += 1;
      if (game.status === "LIVE") {
        hasLive = true;
      }
      const day = game.day || (game.kickoffUtc ? game.kickoffUtc.slice(0, 10) : "");
      if (day) {
        upcomingDaysSet.add(day);
      }
    }
    const leader = data.standings?.[0];
    out[leagueKey] = {
      season: data.season,
      roundLabel: data.roundLabel,
      generatedAt: data.generatedAt,
      ...(data.logoUrl ? { logoUrl: data.logoUrl } : {}),
      totalGames: upcomingCount + finishedCount,
      upcomingCount,
      finishedCount,
      hasLive,
      upcomingDays: Array.from(upcomingDaysSet).sort(),
      ...(leader?.name ? { leaderName: leader.name } : {}),
      ...(leader?.points !== undefined ? { leaderPoints: leader.points } : {}),
    };
  }
  return out;
}

function isValidShellLeagueMeta(value: unknown): value is ShellLeagueMeta {
  if (!isPlainRecord(value)) return false;
  return (
    typeof value.season === "string" &&
    typeof value.roundLabel === "string" &&
    typeof value.generatedAt === "string" &&
    typeof value.totalGames === "number" &&
    typeof value.upcomingCount === "number" &&
    typeof value.finishedCount === "number" &&
    typeof value.hasLive === "boolean" &&
    Array.isArray(value.upcomingDays)
  );
}

function readShellLeagueMetaDiskFile(
  root: string,
  indexMtime: number,
): CachedShellLeagueMetaEntry | null {
  if (indexMtime <= 0) return null;
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(shellLeagueMetaDiskPath(root), "utf8"));
    if (!isPlainRecord(raw)) return null;
    if (raw.schemaVersion !== 1 || raw.root !== root || raw.indexMtime !== indexMtime) {
      return null;
    }
    if (!isPlainRecord(raw.leagues)) return null;
    const leagues: Record<string, ShellLeagueMeta> = {};
    for (const [k, entry] of Object.entries(raw.leagues)) {
      if (isProductLeagueKey(k) && isValidShellLeagueMeta(entry)) {
        leagues[k] = entry;
      }
    }
    return { root, mtime: indexMtime, leagues };
  } catch (err) {
    void err;
    return null;
  }
}

function readFreshShellIndex(root: string): CachedShellIndexEntry | null {
  const indexPath = path.join(root, "shell-index.json");
  const mtime = fileMtime(indexPath);
  if (!mtime) {
    shellIndexCache = null;
    return null;
  }
  if (shellIndexCache && shellIndexCache.root === root && shellIndexCache.mtime === mtime) {
    return shellIndexCache;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(indexPath, "utf8")) as ShellIndexFile;
    if (parsed?.schemaVersion === 1 && parsed.leagues && typeof parsed.leagues === "object") {
      const gameToLeague = new Map<string, ProductLeague>();
      for (const [leagueKey, env] of Object.entries(parsed.leagues)) {
        if (!isProductLeagueKey(leagueKey) || !env || env.state !== "ready" || !env.data) {
          continue;
        }
        for (const game of env.data.games) {
          if (game.id && !gameToLeague.has(game.id)) {
            gameToLeague.set(game.id, leagueKey);
          }
        }
      }
      shellIndexCache = { root, mtime, leagues: parsed.leagues, gameToLeague };
      return shellIndexCache;
    }
  } catch (err) {
    void err;
  }
  return null;
}

export function readShellIndexEntryFast(): CachedShellIndexEntry | null {
  return readFreshShellIndex(resolveSnapshotsRoot());
}

export function readShellLeagueIndexMetaFast(): CachedShellLeagueMetaEntry | null {
  const root = resolveSnapshotsRoot();
  const mtime = fileMtime(path.join(root, "shell-index.json"));
  if (!mtime) {
    shellLeagueMetaCache = null;
    return null;
  }
  if (shellLeagueMetaCache && shellLeagueMetaCache.root === root && shellLeagueMetaCache.mtime === mtime) {
    return shellLeagueMetaCache;
  }
  if (shellIndexCache && shellIndexCache.root === root && shellIndexCache.mtime === mtime) {
    const leagues = buildShellLeagueMetaMap(shellIndexCache.leagues);
    shellLeagueMetaCache = { root, mtime, leagues };
    writeJsonFileAtomic(shellLeagueMetaDiskPath(root), {
      schemaVersion: 1,
      root,
      indexMtime: mtime,
      leagues,
    } satisfies ShellLeagueMetaDiskFile);
    return shellLeagueMetaCache;
  }
  const fromDisk = readShellLeagueMetaDiskFile(root, mtime);
  if (fromDisk) {
    shellLeagueMetaCache = fromDisk;
    return fromDisk;
  }
  const fullIndex = readFreshShellIndex(root);
  if (!fullIndex) return null;
  const leagues = buildShellLeagueMetaMap(fullIndex.leagues);
  shellLeagueMetaCache = { root, mtime, leagues };
  writeJsonFileAtomic(shellLeagueMetaDiskPath(root), {
    schemaVersion: 1,
    root,
    indexMtime: mtime,
    leagues,
  } satisfies ShellLeagueMetaDiskFile);
  return shellLeagueMetaCache;
}

export function findLeagueForGameIdInSnapshots(gameId: string): ProductLeague | null {
  if (!gameId) return null;
  const root = resolveSnapshotsRoot();
  const precompiled = readFreshShellIndex(root);
  if (precompiled) {
    const indexed = precompiled.gameToLeague.get(gameId);
    if (indexed) {
      return indexed;
    }
  }
  if (allSnapshotsMemo && allSnapshotsMemo.root === root) {
    for (const league of PRODUCT_LEAGUES) {
      const env = allSnapshotsMemo.envelopes[league];
      if (env?.state === "ready" && env.data?.games.some((g) => g.id === gameId)) {
        return league;
      }
    }
  }
  for (const league of PRODUCT_LEAGUES) {
    const env = precompiled?.leagues[league] ?? loadLeagueSnapshotEnvelope(league);
    if (env?.state === "ready" && env.data?.games.some((g) => g.id === gameId)) {
      return league;
    }
    if (precompiled) {
      const latestPath = path.join(root, league, "latest.json");
      const latestM = fileMtime(latestPath);
      if (latestM > precompiled.mtime) {
        const freshEnv = loadLeagueSnapshotEnvelope(league);
        if (freshEnv.state === "ready" && freshEnv.data?.games.some((g) => g.id === gameId)) {
          return league;
        }
      }
    }
  }
  return null;
}

let allSnapshotsMemo: {
  root: string;
  stamp: string;
  envelopes: Record<ProductLeague, SnapshotEnvelope>;
} | null = null;

function safeStatMtimeAndSize(filePath: string): { readonly mtimeMs: number; readonly size: number } {
  try {
    const st = fs.statSync(filePath);
    return { mtimeMs: st.mtimeMs, size: st.size };
  } catch (err) {
    void err;
    return { mtimeMs: 0, size: 0 };
  }
}

function statLeagueSnapshotFiles(root: string, league: ProductLeague): PreStattedLeagueFiles {
  const leagueDir = path.join(root, league);
  const latest = safeStatMtimeAndSize(path.join(leagueDir, "latest.json"));
  const injuries = safeStatMtimeAndSize(path.join(leagueDir, "injuries.json"));
  const pulse = safeStatMtimeAndSize(path.join(leagueDir, "market-pulse.json"));
  const dir = safeStatMtimeAndSize(leagueDir);
  return {
    latestM: latest.mtimeMs,
    latestSize: latest.size,
    injuriesM: injuries.mtimeMs,
    injuriesSize: injuries.size,
    pulseM: pulse.mtimeMs,
    pulseSize: pulse.size,
    dirM: dir.mtimeMs,
  };
}

export function getSnapshotsRootStamp(leagues: readonly ProductLeague[] = PRODUCT_LEAGUES): string {
  const root = resolveSnapshotsRoot();
  const indexMtime = fileMtime(path.join(root, "shell-index.json"));
  const parts: string[] = [root, String(indexMtime)];
  for (const league of leagues) {
    const st = statLeagueSnapshotFiles(root, league);
    parts.push(`${league}:${st.latestM}:${st.injuriesM}:${st.pulseM}:${getLeagueSealVersion(league)}`);
  }
  return parts.join("|");
}

interface CausalityCutLeagueDiskEntry {
  readonly stamp: string;
  readonly audit: PreKickoffCausalityAuditReportV6;
}

interface CausalityCutDiskFile {
  readonly schemaVersion: 1;
  readonly root: string;
  readonly indexMtime: number;
  readonly leagues: Record<string, CausalityCutLeagueDiskEntry>;
}

function causalityCutDiskStamp(files: PreStattedLeagueFiles): string {
  return `${files.latestM}:${files.latestSize}:${files.injuriesM}:${files.injuriesSize}:${files.pulseM}:${files.pulseSize}:${files.dirM}`;
}

function causalityCutDiskPath(root: string): string {
  return path.join(os.tmpdir(), `pitchlab-causality-cut-v1-${sha256Hex(root).slice(0, 16)}.json`);
}

function isValidCausalityCutAudit(value: unknown): value is PreKickoffCausalityAuditReportV6 {
  if (!isPlainRecord(value)) return false;
  return (
    typeof value.totalObservationsAudited === "number" &&
    typeof value.ledgerSha256 === "string" &&
    isPlainRecord(value.outcomesByMatchKey)
  );
}

function readCausalityCutDiskFile(
  root: string,
  indexMtime: number,
): CausalityCutDiskFile | null {
  if (indexMtime <= 0) return null;
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(causalityCutDiskPath(root), "utf8"));
    if (!isPlainRecord(raw)) return null;
    if (raw.schemaVersion !== 1 || raw.root !== root || raw.indexMtime !== indexMtime) {
      return null;
    }
    if (!isPlainRecord(raw.leagues)) return null;
    const validLeagues: Record<string, CausalityCutLeagueDiskEntry> = {};
    for (const [k, entry] of Object.entries(raw.leagues)) {
      if (
        isPlainRecord(entry) &&
        typeof entry.stamp === "string" &&
        isValidCausalityCutAudit(entry.audit)
      ) {
        validLeagues[k] = { stamp: entry.stamp, audit: entry.audit };
      }
    }
    return {
      schemaVersion: 1,
      root,
      indexMtime,
      leagues: validLeagues,
    };
  } catch (err) {
    void err;
    return null;
  }
}

function writeJsonFileAtomic(target: string, payload: unknown): void {
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(payload), "utf8");
    fs.renameSync(tmp, target);
  } catch (err) {
    void err;
    try {
      fs.rmSync(tmp, { force: true });
    } catch (cleanupErr) {
      void cleanupErr;
    }
  }
}

function writeCausalityCutDiskFileAtomic(payload: CausalityCutDiskFile): void {
  writeJsonFileAtomic(causalityCutDiskPath(payload.root), payload);
}

function tryReusePrecompiledOnCheckoutSkew(
  root: string,
  league: ProductLeague,
  precompiled: CachedShellIndexEntry,
  pre: SnapshotEnvelope,
  files: PreStattedLeagueFiles,
): { readonly envelope: SnapshotEnvelope; readonly fromPre: true } | null {
  if (!pre.data || files.latestM <= 0) return null;
  const leagueDir = path.join(root, league);
  const latestPath = path.join(leagueDir, "latest.json");
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(latestPath, "utf8"));
    if (!isPlainRecord(raw)) return null;
    if (raw.provenance === "demo") {
      assertNotDemoInProduction("demo");
      return null;
    }
    if (typeof raw.provenance !== "string" || raw.provenance.length === 0) {
      return null;
    }
    assertNotDemoInProduction("derived");
    if (raw.updatedAt !== pre.generatedAt) return null;
    const rawGames = Array.isArray(raw.games) ? raw.games : null;
    if (!rawGames || rawGames.length !== pre.data.games.length) return null;

    const rawAnalyses = isPlainRecord(raw.analyses) ? raw.analyses : null;
    for (let i = 0; i < rawGames.length; i += 1) {
      const rg = rawGames[i];
      const pg = pre.data.games[i];
      if (!isPlainRecord(rg) || !pg) return null;
      if (rg.id !== pg.id || rg.status !== pg.status || rg.startTime !== pg.kickoffUtc) {
        return null;
      }
      if (Boolean(rg.neutralSite) !== Boolean(pg.neutralSite)) return null;
      const rScore = isPlainRecord(rg.score) ? rg.score : null;
      const rHomeScore = rScore && typeof rScore.home === "number" ? rScore.home : null;
      const rAwayScore = rScore && typeof rScore.away === "number" ? rScore.away : null;
      const pHomeScore = pg.score ? pg.score.home : null;
      const pAwayScore = pg.score ? pg.score.away : null;
      if (rHomeScore !== pHomeScore || rAwayScore !== pAwayScore) return null;
      const ra = rawAnalyses ? rawAnalyses[pg.id] : undefined;
      const rX12 = isPlainRecord(ra) && Array.isArray(ra.x12) ? ra.x12 : null;
      if (pg.x12) {
        const rx0 = rX12 ? parseStrictFiniteNumber(rX12[0]) : null;
        if (rx0 === null || Math.abs(rx0 - pg.x12[0]) > 1e-5) return null;
      }
    }

    if (files.injuriesM > precompiled.mtime && files.injuriesM > 0) {
      const injuriesByTeam = loadLeagueInjuries(path.join(leagueDir, "injuries.json"), files.injuriesM);
      for (const pg of pre.data.games) {
        const homeInj =
          injuriesByTeam.get(`${league}.${pg.home.slug}`) ?? injuriesByTeam.get(pg.home.slug) ?? [];
        const awayInj =
          injuriesByTeam.get(`${league}.${pg.away.slug}`) ?? injuriesByTeam.get(pg.away.slug) ?? [];
        const prevHome = pg.injuries?.home ?? [];
        const prevAway = pg.injuries?.away ?? [];
        if (
          homeInj.length !== prevHome.length ||
          awayInj.length !== prevAway.length ||
          (homeInj.length > 0 && JSON.stringify(homeInj) !== JSON.stringify(prevHome)) ||
          (awayInj.length > 0 && JSON.stringify(awayInj) !== JSON.stringify(prevAway))
        ) {
          return null;
        }
      }
    }

    if (files.pulseM > precompiled.mtime && files.pulseM > 0) {
      const pulses = loadMarketPulse(path.join(leagueDir, "market-pulse.json"), files.pulseM);
      for (const pg of pre.data.games) {
        const p = pulses.get(pg.id);
        if (JSON.stringify(p ?? null) !== JSON.stringify(pg.marketPulse ?? null)) {
          return null;
        }
      }
    }

    const hasDraw = sportHasDraw(sportForLeague(league));
    const games = buildLatestCausalityGamesFromRaw(raw, hasDraw);
    latestCausalityMetaCache.set(latestPath, { mtime: files.latestM, games });

    if (pre.state === "empty") {
      return { envelope: pre, fromPre: true };
    }
    return {
      envelope: reconcileShellIndexEnvelopeV6(
        league,
        leagueDir,
        pre,
        precompiled.mtime,
        files.latestM,
      ),
      fromPre: true,
    };
  } catch (err) {
    void err;
    return null;
  }
}

function resolveLeagueEnvelopeWithPrecompiledDetailed(
  root: string,
  league: ProductLeague,
  precompiled: CachedShellIndexEntry | null,
  files: PreStattedLeagueFiles,
): { readonly envelope: SnapshotEnvelope; readonly fromPre: boolean } {
  if (precompiled) {
    const pre = precompiled.leagues[league];
    if (pre) {
      if (
        files.latestM <= precompiled.mtime &&
        files.injuriesM <= precompiled.mtime &&
        files.pulseM <= precompiled.mtime
      ) {
        return {
          envelope: reconcileShellIndexEnvelopeV6(
            league,
            path.join(root, league),
            pre,
            precompiled.mtime,
            files.latestM,
          ),
          fromPre: pre.state === "ready",
        };
      }
      const reused = tryReusePrecompiledOnCheckoutSkew(root, league, precompiled, pre, files);
      if (reused) {
        return reused;
      }
    }
  }
  return {
    envelope: loadLeagueSnapshotEnvelopeInternal(league, files),
    fromPre: false,
  };
}

function resolveLeagueEnvelopeWithPrecompiled(
  root: string,
  league: ProductLeague,
  precompiled: CachedShellIndexEntry | null,
  files: PreStattedLeagueFiles,
): SnapshotEnvelope {
  return resolveLeagueEnvelopeWithPrecompiledDetailed(root, league, precompiled, files).envelope;
}

export function loadSelectedLeagueSnapshots(
  leagues: readonly ProductLeague[],
): Partial<Record<ProductLeague, SnapshotEnvelope>> {
  const root = resolveSnapshotsRoot();
  const precompiled = readFreshShellIndex(root);
  const result: Partial<Record<ProductLeague, SnapshotEnvelope>> = {};
  const seen = new Set<ProductLeague>();
  for (const league of leagues) {
    if (seen.has(league)) continue;
    seen.add(league);
    const files = statLeagueSnapshotFiles(root, league);
    result[league] = resolveLeagueEnvelopeWithPrecompiled(root, league, precompiled, files);
  }
  return result;
}

export function loadAllActiveLeagueSnapshots(): Record<ProductLeague, SnapshotEnvelope> {
  const root = resolveSnapshotsRoot();
  const precompiled = readFreshShellIndex(root);
  const indexMtime = precompiled?.mtime ?? 0;
  const stattedByLeague = new Map<ProductLeague, PreStattedLeagueFiles>();
  const stampParts: string[] = [root, String(indexMtime)];
  for (const league of PRODUCT_LEAGUES) {
    const files = statLeagueSnapshotFiles(root, league);
    stattedByLeague.set(league, files);
    stampParts.push(
      `${league}:${files.latestM}:${files.injuriesM}:${files.pulseM}:${getLeagueSealVersion(league)}`,
    );
  }
  const stamp = stampParts.join("|");
  if (allSnapshotsMemo && allSnapshotsMemo.root === root && allSnapshotsMemo.stamp === stamp) {
    return allSnapshotsMemo.envelopes;
  }

  const diskCut = precompiled ? readCausalityCutDiskFile(root, indexMtime) : null;
  const nextDiskLeagues: Record<string, CausalityCutLeagueDiskEntry> = diskCut
    ? { ...diskCut.leagues }
    : {};
  let diskCutDirty = false;

  const entries = PRODUCT_LEAGUES.map((league) => {
    const files = stattedByLeague.get(league)!;
    const pre = precompiled?.leagues[league];
    const currentCutStamp = causalityCutDiskStamp(files);
    if (
      precompiled &&
      pre &&
      pre.state === "ready" &&
      pre.data &&
      getLeagueSealVersion(league) === 0
    ) {
      const diskEntry = diskCut?.leagues[league];
      if (diskEntry && diskEntry.stamp === currentCutStamp) {
        return [
          league,
          applyCausalityAuditToPreEnvelope(
            league,
            pre,
            diskEntry.audit,
            indexMtime,
            files.latestM,
          ),
        ] as [ProductLeague, SnapshotEnvelope];
      }
    }

    const resolved = resolveLeagueEnvelopeWithPrecompiledDetailed(root, league, precompiled, files);
    if (precompiled && resolved.fromPre) {
      const audit = leagueCausalityAuditCache.get(league);
      if (audit) {
        nextDiskLeagues[league] = { stamp: currentCutStamp, audit };
        diskCutDirty = true;
      }
    }
    return [league, resolved.envelope] as [ProductLeague, SnapshotEnvelope];
  });

  if (precompiled && diskCutDirty) {
    writeCausalityCutDiskFileAtomic({
      schemaVersion: 1,
      root,
      indexMtime,
      leagues: nextDiskLeagues,
    });
  }

  const afterStampParts: string[] = [root, String(indexMtime)];
  for (const league of PRODUCT_LEAGUES) {
    const files = stattedByLeague.get(league)!;
    afterStampParts.push(
      `${league}:${files.latestM}:${files.injuriesM}:${files.pulseM}:${getLeagueSealVersion(league)}`,
    );
  }
  const envelopes = Object.fromEntries(entries) as Record<ProductLeague, SnapshotEnvelope>;
  allSnapshotsMemo = { root, stamp: afterStampParts.join("|"), envelopes };
  return envelopes;
}

const cortexWriteupCache = new Map<
  string,
  {
    mtime: number;
    analyses: Record<string, { cortex?: unknown }> | undefined;
    byGame: Map<string, CortexWriteup | null>;
  }
>();

export function loadCortexWriteup(leagueKey: ProductLeague, gameId: string): CortexWriteup | null {
  try {
    const latestPath = path.join(resolveSnapshotsRoot(), leagueKey, "latest.json");
    const mtime = fileMtime(latestPath);
    if (!mtime) {
      cortexWriteupCache.delete(leagueKey);
      return null;
    }

    let cached = cortexWriteupCache.get(leagueKey);
    if (!cached || cached.mtime !== mtime) {
      const rawCached = rawSnapshotCache.get(leagueKey);
      const analyses =
        rawCached && rawCached.mtime === mtime
          ? (rawCached.snapshot.analyses as Record<string, { cortex?: unknown }> | undefined)
          : (JSON.parse(fs.readFileSync(latestPath, "utf8")) as {
              analyses?: Record<string, { cortex?: unknown }>;
            }).analyses;
      cached = { mtime, analyses, byGame: new Map() };
      cortexWriteupCache.set(leagueKey, cached);
    }

    if (cached.byGame.has(gameId)) {
      return cached.byGame.get(gameId) ?? null;
    }

    const entry = cached.analyses?.[gameId];
    if (!entry || entry.cortex === undefined) {
      cached.byGame.set(gameId, null);
      return null;
    }
    const parsed = CortexWriteupSchema.safeParse(entry.cortex);
    const resolved = parsed.success ? parsed.data : null;
    cached.byGame.set(gameId, resolved);
    return resolved;
  } catch (err) {
    void err;
    return null;
  }
}

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
