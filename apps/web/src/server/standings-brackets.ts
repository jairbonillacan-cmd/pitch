import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  canonicalGameHref,
  canonicalGameSlug,
  canonicalPlayerHref,
  canonicalTeamHref,
  cleanTeamRouteSlug,
  getLeagueCapability,
  isNationalCompetition,
  LeagueSquadsFileSchema,
  parseStrictFiniteNumber,
  sportForLeague,
  sportScoringUnit,
  type LeagueCapabilityContract,
  type LeagueSnapshot,
  type LeagueSquadsFile,
  type PlatformSport,
  type StandingFormToken,
} from "@pitchlab/contracts";
import {
  loadLeagueRefereeRanking,
  type LeagueRefereeRankingResponse,
} from "./referees";
import {
  LEAGUE_LABELS,
  loadRawLeagueSnapshot,
  PRODUCT_LEAGUES,
  resolveSnapshotsRoot,
  type ProductLeague,
} from "./snapshots";
import { findSpacetimeTeamRecord } from "./spacetime";
import {
  canonicalSlug,
  CONMEBOL_CUP_COMPETITIONS,
  humanizeSlug,
  normalizeIsoUtc,
  resolveOrCreateTeamMeta,
  resolveStandingsZonesForLeague,
  sanitizeLabel,
  selectBracketBuilderOrProjected,
  UEFA_LEAGUE_PHASE_COMPETITIONS,
  type BracketConferenceSection,
  type BracketFormat,
  type BracketLegDetail,
  type BracketMode,
  type BracketRound,
  type BracketTeamSlot,
  type BracketTie,
  type LeagueKnockoutBracketPayload,
  type LeagueStandingsSplitsPayload,
  type StandingsSplitRow,
  type StandingsZoneDef,
  type StandingsZoneTone,
  type TeamMetaRecord,
  type UnifiedMatchRecord,
} from "./standings-brackets-pure";
import { loadRawLeagueSquads } from "./team-profile";

export {
  resolveStandingsZonesForLeague,
  type BracketConferenceSection,
  type BracketFormat,
  type BracketLegDetail,
  type BracketMode,
  type BracketRound,
  type BracketTeamSlot,
  type BracketTie,
  type LeagueKnockoutBracketPayload,
  type LeagueStandingsSplitsPayload,
  type StandingsSplitRow,
  type StandingsZoneDef,
  type StandingsZoneTone,
};

export interface AttackDefenseMetricScore {
  readonly value: number | null;
  readonly rank: number | null;
  readonly leagueSize: number;
  readonly lowerIsBetter: boolean;
}

export interface LeagueAttackDefenseTeamRow {
  readonly teamId: string;
  readonly teamSlug: string;
  readonly name: string;
  readonly shortName: string;
  readonly code: string;
  readonly teamHref: string;
  readonly played: number;
  readonly attackRank: number;
  readonly defenseRank: number;
  readonly overallRank: number;
  readonly goalsForPerGame: AttackDefenseMetricScore;
  readonly expectedGoalsFor: AttackDefenseMetricScore;
  readonly shotsPerGame: AttackDefenseMetricScore;
  readonly shotsOnTargetPerGame: AttackDefenseMetricScore;
  readonly goalsAgainstPerGame: AttackDefenseMetricScore;
  readonly expectedGoalsAgainst: AttackDefenseMetricScore;
  readonly cleanSheets: AttackDefenseMetricScore;
  readonly cleanSheetPct: AttackDefenseMetricScore;
}

export interface LeagueAttackDefensePayload {
  readonly league: ProductLeague;
  readonly leagueLabel: string;
  readonly sport: PlatformSport;
  readonly season: string;
  readonly updatedAt: string;
  readonly leagueSize: number;
  readonly teams: readonly LeagueAttackDefenseTeamRow[];
}

export interface TeamAttackDefenseMetricRow {
  readonly key: string;
  readonly category: "attack" | "defense";
  readonly label: string;
  readonly valueA: number | null;
  readonly valueB: number | null;
  readonly leagueAverage: number | null;
  readonly rankA: number | null;
  readonly rankB: number | null;
  readonly leagueSize: number;
  readonly lowerIsBetter: boolean;
  readonly digits: number;
  readonly pct: boolean;
}

export interface TeamAttackDefenseBlock {
  readonly league: ProductLeague;
  readonly leagueLabel: string;
  readonly sport: PlatformSport;
  readonly leagueSize: number;
  readonly teamA: LeagueAttackDefenseTeamRow;
  readonly teamB: LeagueAttackDefenseTeamRow | null;
  readonly attackMetrics: readonly TeamAttackDefenseMetricRow[];
  readonly defenseMetrics: readonly TeamAttackDefenseMetricRow[];
  readonly metrics: readonly TeamAttackDefenseMetricRow[];
}

const RawSeasonResultRowSchema = z.object({
  id: z.string().optional(),
  date: z.string().min(8),
  startTime: z.string().optional(),
  round: z.string().nullable().optional(),
  homeTeam: z.string().min(1),
  awayTeam: z.string().min(1),
  homeScore: z.number().int().nonnegative(),
  awayScore: z.number().int().nonnegative(),
  neutralSite: z.boolean().optional(),
  overtime: z.boolean().optional(),
  shootout: z.boolean().optional(),
  extraTime: z.boolean().optional(),
});

const RawSeasonResultsSchema = z.object({
  matches: z.array(RawSeasonResultRowSchema),
});

interface SplitAccumulator {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  overtimeLosses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  form: StandingFormToken[];
  cleanSheets: number;
}

const PRODUCT_LEAGUE_SET: ReadonlySet<string> = new Set(PRODUCT_LEAGUES);

const splitsCache = new Map<string, { key: string; payload: LeagueStandingsSplitsPayload | null }>();
const attackDefenseCache = new Map<string, { key: string; payload: LeagueAttackDefensePayload | null }>();
const bracketCache = new Map<string, { key: string; payload: LeagueKnockoutBracketPayload | null }>();
const enrichmentCache = new Map<string, { key: string; payload: LeagueHubEnrichmentPayload }>();

export function resetStandingsBracketsCacheForTests(): void {
  splitsCache.clear();
  attackDefenseCache.clear();
  bracketCache.clear();
  enrichmentCache.clear();
}

function isProductLeagueKey(raw: string): raw is ProductLeague {
  return PRODUCT_LEAGUE_SET.has(raw);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function safeFileMtime(filePath: string): number {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch (err) {
    void err;
    return 0;
  }
}

function leagueFilesCacheKey(league: ProductLeague): string {
  const root = resolveSnapshotsRoot();
  const latestM = safeFileMtime(path.join(root, league, "latest.json"));
  const srM = safeFileMtime(path.join(root, league, "season-results.json"));
  const sqM = safeFileMtime(path.join(root, league, "squads.json"));
  return `${root}|${league}|${latestM}|${srM}|${sqM}`;
}

function emptyAccumulator(): SplitAccumulator {
  return {
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    overtimeLosses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
    form: [],
    cleanSheets: 0,
  };
}

function buildTeamMetaRegistry(
  league: ProductLeague,
  snapshot: LeagueSnapshot | null,
): Map<string, TeamMetaRecord> {
  const byCanon = new Map<string, TeamMetaRecord>();
  const register = (input: {
    readonly teamId: string;
    readonly name: string;
    readonly shortName: string;
    readonly code: string;
    readonly conference?: string | null;
    readonly division?: string | null;
    readonly snapshotSeed?: number | null;
    readonly snapshotGamesBehind?: string | null;
  }) => {
    const slug = cleanTeamRouteSlug(input.teamId);
    const canon = canonicalSlug(slug);
    const prev = byCanon.get(canon);
    const safeName = sanitizeLabel(input.name, humanizeSlug(slug));
    const safeShort = sanitizeLabel(input.shortName, safeName);
    const safeCode = sanitizeLabel(input.code, slug.slice(0, 3).toUpperCase());
    const safeConf = input.conference ? sanitizeLabel(input.conference, "") || null : null;
    const safeDiv = input.division ? sanitizeLabel(input.division, "") || null : null;
    if (!prev) {
      byCanon.set(canon, {
        teamId: `${league}.${slug}`,
        teamSlug: slug,
        name: safeName,
        shortName: safeShort,
        code: safeCode,
        conference: safeConf,
        division: safeDiv,
        snapshotSeed: input.snapshotSeed ?? null,
        snapshotGamesBehind: input.snapshotGamesBehind ?? null,
      });
      return;
    }
    byCanon.set(canon, {
      teamId: prev.teamId,
      teamSlug: prev.teamSlug,
      name: prev.name,
      shortName: prev.shortName,
      code: prev.code,
      conference: prev.conference ?? safeConf,
      division: prev.division ?? safeDiv,
      snapshotSeed: prev.snapshotSeed ?? input.snapshotSeed ?? null,
      snapshotGamesBehind: prev.snapshotGamesBehind ?? input.snapshotGamesBehind ?? null,
    });
  };

  if (snapshot) {
    for (const row of snapshot.standings ?? []) {
      register({
        teamId: row.teamId,
        name: row.name,
        shortName: row.shortName,
        code: row.code,
        conference: row.conference ?? null,
        division: row.division ?? null,
        snapshotSeed: row.seed ?? null,
        snapshotGamesBehind: row.gamesBehind ?? null,
      });
    }
    for (const rate of Object.values(snapshot.teamRates)) {
      register({
        teamId: rate.teamId,
        name: rate.name,
        shortName: rate.shortName,
        code: rate.code,
      });
    }
    for (const game of snapshot.games) {
      register({
        teamId: game.home.id,
        name: game.home.name,
        shortName: game.home.shortName,
        code: game.home.code,
      });
      register({
        teamId: game.away.id,
        name: game.away.name,
        shortName: game.away.shortName,
        code: game.away.code,
      });
    }
  }

  return byCanon;
}

function loadUnifiedMatches(
  league: ProductLeague,
  snapshot: LeagueSnapshot | null,
  registry: Map<string, TeamMetaRecord>,
): UnifiedMatchRecord[] {
  const byKey = new Map<string, UnifiedMatchRecord>();
  const srPath = path.join(resolveSnapshotsRoot(), league, "season-results.json");

  if (fs.existsSync(srPath)) {
    try {
      const parsed = RawSeasonResultsSchema.safeParse(
        JSON.parse(fs.readFileSync(srPath, "utf8")),
      );
      if (parsed.success) {
        for (const row of parsed.data.matches) {
          const homeMeta = resolveOrCreateTeamMeta(league, registry, row.homeTeam);
          const awayMeta = resolveOrCreateTeamMeta(league, registry, row.awayTeam);
          const dateIso = normalizeIsoUtc(row.startTime ?? `${row.date.slice(0, 10)}T12:00:00.000Z`);
          const dayKey = row.date.slice(0, 10);
          const dedupeKey = `${dayKey}|${canonicalSlug(homeMeta.teamSlug)}|${canonicalSlug(awayMeta.teamSlug)}`;
          const rawId = row.id ?? `${league}-${dedupeKey}`;
          const urlGame = {
            id: rawId,
            league,
            home: { slug: homeMeta.teamSlug, shortName: homeMeta.shortName, name: homeMeta.name },
            away: { slug: awayMeta.teamSlug, shortName: awayMeta.shortName, name: awayMeta.name },
          };
          const cleanRound = row.round ? sanitizeLabel(row.round, "") || null : null;
          byKey.set(dedupeKey, {
            dedupeKey,
            matchSlug: canonicalGameSlug(urlGame),
            href: canonicalGameHref(league, urlGame),
            dateIso,
            dayKey,
            round: cleanRound,
            stageName: null,
            status: "FT",
            homeTeamId: homeMeta.teamId,
            awayTeamId: awayMeta.teamId,
            homeSlug: homeMeta.teamSlug,
            awaySlug: awayMeta.teamSlug,
            homeScore: row.homeScore,
            awayScore: row.awayScore,
            extraTimeScore: null,
            penaltyShootout: null,
            overtime: Boolean(row.overtime || row.shootout || row.extraTime),
          });
        }
      }
    } catch (err) {
      void err;
    }
  }

  if (snapshot) {
    for (const game of snapshot.games) {
      if (game.status === "canceled" || game.status === "postponed") continue;
      const homeMeta = resolveOrCreateTeamMeta(league, registry, game.home.id);
      const awayMeta = resolveOrCreateTeamMeta(league, registry, game.away.id);
      const dateIso = normalizeIsoUtc(game.startTime);
      const dayKey = dateIso.slice(0, 10);
      const dedupeKey = `${dayKey}|${canonicalSlug(homeMeta.teamSlug)}|${canonicalSlug(awayMeta.teamSlug)}`;
      const mc = snapshot.analyses[game.id]?.matchContext;
      const urlGame = {
        id: game.id,
        league,
        home: { slug: homeMeta.teamSlug, shortName: homeMeta.shortName, name: homeMeta.name },
        away: { slug: awayMeta.teamSlug, shortName: awayMeta.shortName, name: awayMeta.name },
      };
      const status: "NS" | "LIVE" | "FT" =
        game.status === "final" || game.result !== undefined
          ? "FT"
          : game.status === "in_progress"
            ? "LIVE"
            : "NS";
      const existing = byKey.get(dedupeKey);
      const cleanRound = game.round ? sanitizeLabel(game.round, "") || null : null;
      const cleanStage = mc?.stageName ? sanitizeLabel(mc.stageName, "") || null : null;

      byKey.set(dedupeKey, {
        dedupeKey,
        matchSlug: canonicalGameSlug(urlGame),
        href: canonicalGameHref(league, urlGame),
        dateIso,
        dayKey,
        round: cleanRound ?? existing?.round ?? null,
        stageName: cleanStage ?? existing?.stageName ?? null,
        status: existing?.status === "FT" ? "FT" : status,
        homeTeamId: homeMeta.teamId,
        awayTeamId: awayMeta.teamId,
        homeSlug: homeMeta.teamSlug,
        awaySlug: awayMeta.teamSlug,
        homeScore: game.result?.home ?? existing?.homeScore ?? null,
        awayScore: game.result?.away ?? existing?.awayScore ?? null,
        extraTimeScore: mc?.extraTimeScore ?? existing?.extraTimeScore ?? null,
        penaltyShootout: mc?.penaltyShootout ?? existing?.penaltyShootout ?? null,
        overtime: Boolean(mc?.extraTimeScore || mc?.penaltyShootout || existing?.overtime),
      });
    }
  }

  return Array.from(byKey.values()).sort((a, b) => a.dateIso.localeCompare(b.dateIso));
}

function isRegularSeasonRound(round: string | null): boolean {
  if (!round) return true;
  const lower = round.toLowerCase();
  return (
    lower.includes("regular") ||
    lower.includes("temporada regular") ||
    lower.includes("jornada") ||
    lower.includes("semana") ||
    lower.includes("matchday") ||
    lower.includes("league phase")
  );
}

function filterMatchesForStandings(
  league: ProductLeague,
  sport: PlatformSport,
  finishedMatches: readonly UnifiedMatchRecord[],
): readonly UnifiedMatchRecord[] {
  if (UEFA_LEAGUE_PHASE_COMPETITIONS.has(league)) {
    const leaguePhaseOnly = finishedMatches.filter((m) =>
      `${m.round ?? ""} ${m.stageName ?? ""}`.toLowerCase().includes("league phase"),
    );
    if (leaguePhaseOnly.length > 0) return leaguePhaseOnly;
  }
  if (sport === "baseball" || sport === "basketball" || sport === "ice-hockey" || sport === "american-football") {
    const regOnly = finishedMatches.filter((m) => isRegularSeasonRound(m.round));
    if (regOnly.length > 0) return regOnly;
  }
  return finishedMatches;
}

function pointsForResult(sport: PlatformSport, outcome: StandingFormToken): number {
  if (sport === "football") {
    if (outcome === "W") return 3;
    if (outcome === "D") return 1;
    return 0;
  }
  if (outcome === "W") return 2;
  if (outcome === "D") return 1;
  return 0;
}

function recordMatchIntoSplit(
  acc: SplitAccumulator,
  scored: number,
  conceded: number,
  sport: PlatformSport,
  overtimeLoss = false,
): void {
  const outcome: StandingFormToken =
    scored > conceded ? "W" : scored < conceded ? "L" : "D";
  acc.played += 1;
  if (outcome === "W") {
    acc.won += 1;
    acc.points += pointsForResult(sport, "W");
  } else if (outcome === "D") {
    acc.drawn += 1;
    acc.points += pointsForResult(sport, "D");
  } else if (sport === "ice-hockey" && overtimeLoss) {
    acc.drawn += 1;
    acc.overtimeLosses += 1;
    acc.points += 1;
  } else {
    acc.lost += 1;
    acc.points += pointsForResult(sport, "L");
  }
  acc.goalsFor += scored;
  acc.goalsAgainst += conceded;
  if (conceded === 0) acc.cleanSheets += 1;
  acc.form.push(outcome);
  if (acc.form.length > 5) acc.form.shift();
}

function compareSplitRows(
  sport: PlatformSport,
  a: {
    readonly played: number;
    readonly won: number;
    readonly points: number;
    readonly goalDiff: number;
    readonly goalsFor: number;
    readonly winPct: number | null;
    readonly name: string;
  },
  b: {
    readonly played: number;
    readonly won: number;
    readonly points: number;
    readonly goalDiff: number;
    readonly goalsFor: number;
    readonly winPct: number | null;
    readonly name: string;
  },
): number {
  if (sport === "basketball" || sport === "american-football" || sport === "baseball") {
    const aw = a.winPct ?? -1;
    const bw = b.winPct ?? -1;
    if (Math.abs(bw - aw) > 1e-6) return bw - aw;
    if (b.won !== a.won) return b.won - a.won;
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.name.localeCompare(b.name, "es-MX");
  }
  if (b.points !== a.points) return b.points - a.points;
  if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
  if (b.won !== a.won) return b.won - a.won;
  return a.name.localeCompare(b.name, "es-MX");
}

function formatGamesBehind(gb: number): string {
  if (!Number.isFinite(gb) || Math.abs(gb) <= 0.001) return "-";
  const absVal = Math.abs(gb);
  const formatted = Number.isInteger(absVal) ? String(absVal) : round1(absVal).toFixed(1);
  return gb < 0 ? `+${formatted}` : formatted;
}

function materializeSplitRows(
  league: ProductLeague,
  sport: PlatformSport,
  teamEntries: ReadonlyArray<{
    readonly meta: TeamMetaRecord;
    readonly acc: SplitAccumulator;
  }>,
  zones: readonly StandingsZoneDef[],
  assignZones: boolean,
): StandingsSplitRow[] {
  const usesWinPct =
    sport === "basketball" || sport === "american-football" || sport === "baseball";
  const draft = teamEntries.map(({ meta, acc }) => {
    const goalDiff = acc.goalsFor - acc.goalsAgainst;
    const winPct =
      usesWinPct && acc.played > 0
        ? round3((acc.won + acc.drawn * 0.5) / acc.played)
        : usesWinPct
          ? 0
          : null;
    return { meta, acc, goalDiff, winPct };
  });

  draft.sort((a, b) =>
    compareSplitRows(
      sport,
      {
        played: a.acc.played,
        won: a.acc.won,
        points: a.acc.points,
        goalDiff: a.goalDiff,
        goalsFor: a.acc.goalsFor,
        winPct: a.winPct,
        name: a.meta.name,
      },
      {
        played: b.acc.played,
        won: b.acc.won,
        points: b.acc.points,
        goalDiff: b.goalDiff,
        goalsFor: b.acc.goalsFor,
        winPct: b.winPct,
        name: b.meta.name,
      },
    ),
  );

  const conferenceLeaders = new Map<
    string,
    { readonly won: number; readonly lost: number; readonly drawn: number }
  >();
  const conferenceCounters = new Map<string, number>();

  return draft.map((entry, idx) => {
    const rank = idx + 1;
    let seed: number | null = null;
    let gamesBehind: string | null = null;

    if (entry.meta.conference) {
      const conf = entry.meta.conference;
      const nextSeed = (conferenceCounters.get(conf) ?? 0) + 1;
      conferenceCounters.set(conf, nextSeed);
      seed = nextSeed;
      const leader = conferenceLeaders.get(conf);
      if (!leader) {
        conferenceLeaders.set(conf, {
          won: entry.acc.won,
          lost: entry.acc.lost,
          drawn: entry.acc.drawn,
        });
        gamesBehind = "-";
      } else {
        const leaderAdjWon = leader.won + leader.drawn * 0.5;
        const leaderAdjLost = leader.lost + leader.drawn * 0.5;
        const entryAdjWon = entry.acc.won + entry.acc.drawn * 0.5;
        const entryAdjLost = entry.acc.lost + entry.acc.drawn * 0.5;
        const gb = (leaderAdjWon - entryAdjWon + (entryAdjLost - leaderAdjLost)) / 2;
        gamesBehind = formatGamesBehind(gb);
      }
    }

    let matchedZone: StandingsZoneDef | null = null;
    if (assignZones) {
      for (const z of zones) {
        const position = z.scope === "conference" ? (seed ?? rank) : rank;
        if (position >= z.startRank && position <= z.endRank) {
          matchedZone = z;
          break;
        }
      }
    }

    return {
      rank,
      teamId: entry.meta.teamId,
      teamSlug: entry.meta.teamSlug,
      name: entry.meta.name,
      shortName: entry.meta.shortName,
      code: entry.meta.code,
      teamHref: canonicalTeamHref(league, entry.meta.teamSlug),
      conference: entry.meta.conference,
      division: entry.meta.division,
      played: entry.acc.played,
      won: entry.acc.won,
      drawn: entry.acc.drawn,
      lost: entry.acc.lost,
      ...(sport === "ice-hockey" ? { overtimeLosses: entry.acc.overtimeLosses } : {}),
      goalsFor: entry.acc.goalsFor,
      goalsAgainst: entry.acc.goalsAgainst,
      goalDiff: entry.goalDiff,
      points: entry.acc.points,
      winPct: entry.winPct,
      gamesBehind,
      seed,
      form: [...entry.acc.form],
      zoneId: matchedZone?.id ?? null,
      zoneLabel: matchedZone?.label ?? null,
      zoneTone: matchedZone?.tone ?? null,
    };
  });
}

export function buildLeagueStandingsSplits(league: string): LeagueStandingsSplitsPayload | null {
  const normalized = league.trim().toLowerCase();
  if (!isProductLeagueKey(normalized)) return null;

  const capability = getLeagueCapability(normalized);
  if (!capability || !capability.hasStandingsTable) return null;

  const cacheKey = leagueFilesCacheKey(normalized);
  const cached = splitsCache.get(normalized);
  if (cached && cached.key === cacheKey) {
    return cached.payload;
  }

  const snapshot = loadRawLeagueSnapshot(normalized);
  const registry = buildTeamMetaRegistry(normalized, snapshot);
  const allMatches = loadUnifiedMatches(normalized, snapshot, registry);
  const finished = allMatches.filter(
    (m) => m.status === "FT" && m.homeScore !== null && m.awayScore !== null,
  );
  const sport = sportForLeague(normalized);
  const standingsMatches = filterMatchesForStandings(normalized, sport, finished);

  if (standingsMatches.length === 0) {
    splitsCache.set(normalized, { key: cacheKey, payload: null });
    return null;
  }

  const participatingCanon = new Set<string>();
  const homeAccByCanon = new Map<string, SplitAccumulator>();
  const awayAccByCanon = new Map<string, SplitAccumulator>();
  const totalAccByCanon = new Map<string, SplitAccumulator>();

  const ensureTeam = (teamId: string): string => {
    const meta = resolveOrCreateTeamMeta(normalized, registry, teamId);
    const canon = canonicalSlug(meta.teamSlug);
    participatingCanon.add(canon);
    if (!homeAccByCanon.has(canon)) homeAccByCanon.set(canon, emptyAccumulator());
    if (!awayAccByCanon.has(canon)) awayAccByCanon.set(canon, emptyAccumulator());
    if (!totalAccByCanon.has(canon)) totalAccByCanon.set(canon, emptyAccumulator());
    return canon;
  };

  for (const match of standingsMatches) {
    const hs = match.homeScore;
    const as = match.awayScore;
    if (hs === null || as === null) continue;
    const homeCanon = ensureTeam(match.homeTeamId);
    const awayCanon = ensureTeam(match.awayTeamId);
    const isOt = match.overtime;
    recordMatchIntoSplit(homeAccByCanon.get(homeCanon)!, hs, as, sport, isOt && hs < as);
    recordMatchIntoSplit(awayAccByCanon.get(awayCanon)!, as, hs, sport, isOt && as < hs);
    recordMatchIntoSplit(totalAccByCanon.get(homeCanon)!, hs, as, sport, isOt && hs < as);
    recordMatchIntoSplit(totalAccByCanon.get(awayCanon)!, as, hs, sport, isOt && as < hs);
  }

  const teamMetas = Array.from(participatingCanon)
    .map((canon) => registry.get(canon))
    .filter((item): item is TeamMetaRecord => item !== undefined);

  if (teamMetas.length === 0) {
    splitsCache.set(normalized, { key: cacheKey, payload: null });
    return null;
  }

  const conferencesSet = new Set<string>();
  for (const meta of teamMetas) {
    if (meta.conference) conferencesSet.add(meta.conference);
  }
  const conferences = Array.from(conferencesSet).sort((a, b) => a.localeCompare(b, "es-MX"));
  const hasConferences = conferences.length > 0;
  const zoneReferenceTeamCount = hasConferences
    ? Math.max(
        1,
        ...conferences.map((conf) => teamMetas.filter((m) => m.conference === conf).length),
      )
    : teamMetas.length;
  const zones = resolveStandingsZonesForLeague(normalized, capability, zoneReferenceTeamCount);

  const totalRows = materializeSplitRows(
    normalized,
    sport,
    teamMetas.map((meta) => ({ meta, acc: totalAccByCanon.get(canonicalSlug(meta.teamSlug))! })),
    zones,
    true,
  );
  const homeRows = materializeSplitRows(
    normalized,
    sport,
    teamMetas.map((meta) => ({ meta, acc: homeAccByCanon.get(canonicalSlug(meta.teamSlug))! })),
    zones,
    false,
  );
  const awayRows = materializeSplitRows(
    normalized,
    sport,
    teamMetas.map((meta) => ({ meta, acc: awayAccByCanon.get(canonicalSlug(meta.teamSlug))! })),
    zones,
    false,
  );

  const payload: LeagueStandingsSplitsPayload = {
    league: normalized,
    leagueLabel: LEAGUE_LABELS[normalized] ?? normalized,
    sport,
    season: snapshot?.seasonLabel ?? "2026",
    roundLabel: snapshot?.periodLabel ?? "",
    updatedAt: snapshot?.updatedAt ?? new Date().toISOString(),
    hasRelegationZones: capability.hasRelegationZones,
    hasConferences,
    conferences,
    total: totalRows,
    home: homeRows,
    away: awayRows,
    zones,
  };

  splitsCache.set(normalized, { key: cacheKey, payload });
  return payload;
}

function loadSquadShotsIndex(
  league: ProductLeague,
): Map<string, { readonly shots: number; readonly shotsOnTarget: number }> {
  const index = new Map<string, { readonly shots: number; readonly shotsOnTarget: number }>();
  const filePath = path.join(resolveSnapshotsRoot(), league, "squads.json");
  if (!fs.existsSync(filePath)) return index;
  try {
    const parsed = LeagueSquadsFileSchema.safeParse(
      JSON.parse(fs.readFileSync(filePath, "utf8")),
    );
    if (!parsed.success) return index;
    const squads: LeagueSquadsFile = parsed.data;
    for (const team of squads.teams) {
      let shots = 0;
      let shotsOnTarget = 0;
      for (const player of team.players) {
        shots += player.stats.shots;
        shotsOnTarget += player.stats.shotsOnTarget;
      }
      if (shots > 0 || shotsOnTarget > 0) {
        index.set(canonicalSlug(team.teamSlug), { shots, shotsOnTarget });
      }
    }
  } catch (err) {
    void err;
  }
  return index;
}

function rankNumericSeries(
  entries: ReadonlyArray<{ readonly key: string; readonly value: number | null }>,
  lowerIsBetter: boolean,
): Map<string, number> {
  const valid = entries
    .filter((entry): entry is { readonly key: string; readonly value: number } =>
      entry.value !== null && Number.isFinite(entry.value),
    )
    .sort((a, b) => {
      const diff = lowerIsBetter ? a.value - b.value : b.value - a.value;
      if (Math.abs(diff) > 1e-9) return diff;
      return a.key.localeCompare(b.key);
    });

  const ranks = new Map<string, number>();
  let currentRank = 1;
  for (let i = 0; i < valid.length; i += 1) {
    const item = valid[i]!;
    if (i > 0 && Math.abs(item.value - valid[i - 1]!.value) > 1e-9) {
      currentRank = i + 1;
    }
    ranks.set(item.key, currentRank);
  }
  return ranks;
}

function meanOfValues(values: ReadonlyArray<number | null>): number | null {
  let sum = 0;
  let count = 0;
  for (const val of values) {
    if (val !== null && Number.isFinite(val)) {
      sum += val;
      count += 1;
    }
  }
  return count > 0 ? round2(sum / count) : null;
}

export function buildLeagueAttackDefenseTable(league: string): LeagueAttackDefensePayload | null {
  const normalized = league.trim().toLowerCase();
  if (!isProductLeagueKey(normalized)) return null;

  const cacheKey = leagueFilesCacheKey(normalized);
  const cached = attackDefenseCache.get(normalized);
  if (cached && cached.key === cacheKey) {
    return cached.payload;
  }

  const snapshot = loadRawLeagueSnapshot(normalized);
  const registry = buildTeamMetaRegistry(normalized, snapshot);
  const allMatches = loadUnifiedMatches(normalized, snapshot, registry);
  const finished = allMatches.filter(
    (m) => m.status === "FT" && m.homeScore !== null && m.awayScore !== null,
  );
  const sport = sportForLeague(normalized);
  const activeMatches = filterMatchesForStandings(normalized, sport, finished);
  const shotsByCanon = loadSquadShotsIndex(normalized);

  const accByCanon = new Map<string, SplitAccumulator>();
  for (const match of activeMatches) {
    const hs = match.homeScore;
    const as = match.awayScore;
    if (hs === null || as === null) continue;
    const homeMeta = resolveOrCreateTeamMeta(normalized, registry, match.homeTeamId);
    const awayMeta = resolveOrCreateTeamMeta(normalized, registry, match.awayTeamId);
    const homeCanon = canonicalSlug(homeMeta.teamSlug);
    const awayCanon = canonicalSlug(awayMeta.teamSlug);
    if (!accByCanon.has(homeCanon)) accByCanon.set(homeCanon, emptyAccumulator());
    if (!accByCanon.has(awayCanon)) accByCanon.set(awayCanon, emptyAccumulator());
    recordMatchIntoSplit(accByCanon.get(homeCanon)!, hs, as, sport);
    recordMatchIntoSplit(accByCanon.get(awayCanon)!, as, hs, sport);
  }

  if (accByCanon.size === 0 && snapshot) {
    for (const rate of Object.values(snapshot.teamRates)) {
      const meta = resolveOrCreateTeamMeta(normalized, registry, rate.teamId);
      const canon = canonicalSlug(meta.teamSlug);
      if (!accByCanon.has(canon)) {
        const acc = emptyAccumulator();
        acc.played = rate.gamesPlayed;
        acc.goalsFor = Math.round(rate.forPerGame * rate.gamesPlayed);
        acc.goalsAgainst = Math.round(rate.againstPerGame * rate.gamesPlayed);
        accByCanon.set(canon, acc);
      }
    }
  }

  const canons = Array.from(accByCanon.keys());
  if (canons.length === 0) {
    attackDefenseCache.set(normalized, { key: cacheKey, payload: null });
    return null;
  }

  const rateByCanon = new Map<
    string,
    { readonly adjustedFor: number; readonly adjustedAgainst: number }
  >();
  if (snapshot) {
    for (const rate of Object.values(snapshot.teamRates)) {
      rateByCanon.set(canonicalSlug(rate.teamId), {
        adjustedFor: rate.adjustedFor,
        adjustedAgainst: rate.adjustedAgainst,
      });
    }
  }

  const rawRows = canons.map((canon) => {
    const meta = registry.get(canon)!;
    const acc = accByCanon.get(canon)!;
    const played = acc.played;
    const rate = rateByCanon.get(canon) ?? null;
    const master = findSpacetimeTeamRecord(normalized, meta.name, meta.teamSlug);
    const squadShots = shotsByCanon.get(canon) ?? null;

    const goalsForPg =
      played > 0 ? round2(acc.goalsFor / played) : rate ? round2(rate.adjustedFor) : null;
    const goalsAgainstPg =
      played > 0 ? round2(acc.goalsAgainst / played) : rate ? round2(rate.adjustedAgainst) : null;

    let masterOff: number | null = null;
    let masterDef: number | null = null;
    if (sport === "football") {
      masterOff =
        typeof master?.xg_for === "number" && Number.isFinite(master.xg_for)
          ? round2(master.xg_for)
          : null;
      masterDef =
        typeof master?.xg_against === "number" && Number.isFinite(master.xg_against)
          ? round2(master.xg_against)
          : null;
    } else if (sport === "basketball") {
      masterOff =
        typeof master?.nba_ortg === "number" && Number.isFinite(master.nba_ortg)
          ? round1(master.nba_ortg)
          : null;
      masterDef =
        typeof master?.nba_drtg === "number" && Number.isFinite(master.nba_drtg)
          ? round1(master.nba_drtg)
          : null;
    } else if (sport === "american-football") {
      masterOff =
        typeof master?.nfl_off_epa_per_play === "number" &&
        Number.isFinite(master.nfl_off_epa_per_play)
          ? round3(master.nfl_off_epa_per_play)
          : null;
      masterDef =
        typeof master?.nfl_def_epa_per_play === "number" &&
        Number.isFinite(master.nfl_def_epa_per_play)
          ? round3(master.nfl_def_epa_per_play)
          : null;
    } else if (sport === "ice-hockey") {
      masterOff =
        typeof master?.xg_for === "number" && Number.isFinite(master.xg_for)
          ? round2(master.xg_for)
          : null;
      masterDef =
        typeof master?.xg_against === "number" && Number.isFinite(master.xg_against)
          ? round2(master.xg_against)
          : null;
    } else if (sport === "baseball") {
      masterOff =
        typeof master?.mlb_ops_plus === "number" && Number.isFinite(master.mlb_ops_plus)
          ? Math.round(master.mlb_ops_plus)
          : null;
      masterDef =
        typeof master?.mlb_era === "number" && Number.isFinite(master.mlb_era)
          ? round2(master.mlb_era)
          : null;
    }

    const shotsPerGame =
      squadShots && played > 0 ? round1(squadShots.shots / played) : null;
    const shotsOnTargetPerGame =
      squadShots && played > 0 ? round1(squadShots.shotsOnTarget / played) : null;
    const supportsCleanSheets = sport === "football" || sport === "ice-hockey";
    const cleanSheets = supportsCleanSheets ? acc.cleanSheets : null;
    const cleanSheetPct =
      supportsCleanSheets && played > 0 ? Math.round((acc.cleanSheets / played) * 100) : null;

    return {
      canon,
      meta,
      played,
      goalsForPg,
      goalsAgainstPg,
      masterOff,
      masterDef,
      rateOff: rate ? round2(rate.adjustedFor) : null,
      rateDef: rate ? round2(rate.adjustedAgainst) : null,
      shotsPerGame,
      shotsOnTargetPerGame,
      cleanSheets,
      cleanSheetPct,
    };
  });

  const leagueSize = rawRows.length;
  const masterOffCoverage = rawRows.filter((r) => r.masterOff !== null).length / leagueSize;
  const masterDefCoverage = rawRows.filter((r) => r.masterDef !== null).length / leagueSize;
  const useMasterOff = masterOffCoverage >= 0.75;
  const useMasterDef = masterDefCoverage >= 0.75;

  const resolvedRows = rawRows.map((row) => ({
    ...row,
    expectedFor: useMasterOff ? row.masterOff : row.rateOff,
    expectedAgainst: useMasterDef ? row.masterDef : row.rateDef,
  }));

  const gfRanks = rankNumericSeries(
    resolvedRows.map((r) => ({ key: r.canon, value: r.goalsForPg })),
    false,
  );
  const expForRanks = rankNumericSeries(
    resolvedRows.map((r) => ({ key: r.canon, value: r.expectedFor })),
    false,
  );
  const shotsRanks = rankNumericSeries(
    resolvedRows.map((r) => ({ key: r.canon, value: r.shotsPerGame })),
    false,
  );
  const sotRanks = rankNumericSeries(
    resolvedRows.map((r) => ({ key: r.canon, value: r.shotsOnTargetPerGame })),
    false,
  );
  const gaRanks = rankNumericSeries(
    resolvedRows.map((r) => ({ key: r.canon, value: r.goalsAgainstPg })),
    true,
  );
  const expAgainstRanks = rankNumericSeries(
    resolvedRows.map((r) => ({ key: r.canon, value: r.expectedAgainst })),
    true,
  );
  const csRanks = rankNumericSeries(
    resolvedRows.map((r) => ({ key: r.canon, value: r.cleanSheets })),
    false,
  );
  const csPctRanks = rankNumericSeries(
    resolvedRows.map((r) => ({ key: r.canon, value: r.cleanSheetPct })),
    false,
  );

  const compositeAttackScores = resolvedRows.map((r) => {
    const parts: number[] = [];
    const r1 = gfRanks.get(r.canon);
    const r2 = expForRanks.get(r.canon);
    const r3 = shotsRanks.get(r.canon);
    if (r1 !== undefined) parts.push(r1);
    if (r2 !== undefined) parts.push(r2);
    if (r3 !== undefined) parts.push(r3);
    const avg = parts.length > 0 ? parts.reduce((acc, v) => acc + v, 0) / parts.length : leagueSize;
    return { key: r.canon, value: avg };
  });

  const compositeDefenseScores = resolvedRows.map((r) => {
    const parts: number[] = [];
    const r1 = gaRanks.get(r.canon);
    const r2 = expAgainstRanks.get(r.canon);
    const r3 = csPctRanks.get(r.canon);
    if (r1 !== undefined) parts.push(r1);
    if (r2 !== undefined) parts.push(r2);
    if (r3 !== undefined) parts.push(r3);
    const avg = parts.length > 0 ? parts.reduce((acc, v) => acc + v, 0) / parts.length : leagueSize;
    return { key: r.canon, value: avg };
  });

  const attackCompositeRanks = rankNumericSeries(compositeAttackScores, true);
  const defenseCompositeRanks = rankNumericSeries(compositeDefenseScores, true);
  const overallCompositeRanks = rankNumericSeries(
    resolvedRows.map((r) => ({
      key: r.canon,
      value:
        ((attackCompositeRanks.get(r.canon) ?? leagueSize) +
          (defenseCompositeRanks.get(r.canon) ?? leagueSize)) /
        2,
    })),
    true,
  );

  const teams: LeagueAttackDefenseTeamRow[] = resolvedRows.map((r) => ({
    teamId: r.meta.teamId,
    teamSlug: r.meta.teamSlug,
    name: r.meta.name,
    shortName: r.meta.shortName,
    code: r.meta.code,
    teamHref: canonicalTeamHref(normalized, r.meta.teamSlug),
    played: r.played,
    attackRank: attackCompositeRanks.get(r.canon) ?? leagueSize,
    defenseRank: defenseCompositeRanks.get(r.canon) ?? leagueSize,
    overallRank: overallCompositeRanks.get(r.canon) ?? leagueSize,
    goalsForPerGame: {
      value: r.goalsForPg,
      rank: gfRanks.get(r.canon) ?? null,
      leagueSize,
      lowerIsBetter: false,
    },
    expectedGoalsFor: {
      value: r.expectedFor,
      rank: expForRanks.get(r.canon) ?? null,
      leagueSize,
      lowerIsBetter: false,
    },
    shotsPerGame: {
      value: r.shotsPerGame,
      rank: shotsRanks.get(r.canon) ?? null,
      leagueSize,
      lowerIsBetter: false,
    },
    shotsOnTargetPerGame: {
      value: r.shotsOnTargetPerGame,
      rank: sotRanks.get(r.canon) ?? null,
      leagueSize,
      lowerIsBetter: false,
    },
    goalsAgainstPerGame: {
      value: r.goalsAgainstPg,
      rank: gaRanks.get(r.canon) ?? null,
      leagueSize,
      lowerIsBetter: true,
    },
    expectedGoalsAgainst: {
      value: r.expectedAgainst,
      rank: expAgainstRanks.get(r.canon) ?? null,
      leagueSize,
      lowerIsBetter: true,
    },
    cleanSheets: {
      value: r.cleanSheets,
      rank: csRanks.get(r.canon) ?? null,
      leagueSize,
      lowerIsBetter: false,
    },
    cleanSheetPct: {
      value: r.cleanSheetPct,
      rank: csPctRanks.get(r.canon) ?? null,
      leagueSize,
      lowerIsBetter: false,
    },
  }));

  teams.sort((a, b) => {
    if (a.overallRank !== b.overallRank) return a.overallRank - b.overallRank;
    if (a.attackRank !== b.attackRank) return a.attackRank - b.attackRank;
    return a.name.localeCompare(b.name, "es-MX");
  });

  const payload: LeagueAttackDefensePayload = {
    league: normalized,
    leagueLabel: LEAGUE_LABELS[normalized] ?? normalized,
    sport,
    season: snapshot?.seasonLabel ?? "2026",
    updatedAt: snapshot?.updatedAt ?? new Date().toISOString(),
    leagueSize,
    teams,
  };

  attackDefenseCache.set(normalized, { key: cacheKey, payload });
  return payload;
}

function sportMetricLabels(sport: PlatformSport): {
  readonly scoringFor: string;
  readonly expectedFor: string;
  readonly scoringAgainst: string;
  readonly expectedAgainst: string;
  readonly digits: number;
} {
  if (sport === "basketball") {
    return {
      scoringFor: "Puntos a favor / partido",
      expectedFor: "Índice ofensivo",
      scoringAgainst: "Puntos en contra / partido",
      expectedAgainst: "Índice defensivo",
      digits: 1,
    };
  }
  if (sport === "american-football") {
    return {
      scoringFor: "Puntos a favor / partido",
      expectedFor: "Eficiencia ofensiva",
      scoringAgainst: "Puntos en contra / partido",
      expectedAgainst: "Eficiencia defensiva rival",
      digits: 1,
    };
  }
  if (sport === "baseball") {
    return {
      scoringFor: "Carreras a favor / partido",
      expectedFor: "Producción ofensiva ajustada",
      scoringAgainst: "Carreras en contra / partido",
      expectedAgainst: "Efectividad defensiva",
      digits: 2,
    };
  }
  return {
    scoringFor: "Goles a favor / partido",
    expectedFor: "Goles esperados a favor",
    scoringAgainst: "Goles en contra / partido",
    expectedAgainst: "Goles esperados en contra",
    digits: 2,
  };
}

function findAttackDefenseTeam(
  table: LeagueAttackDefensePayload,
  rawSlug: string,
): LeagueAttackDefenseTeamRow | null {
  const needle = cleanTeamRouteSlug(rawSlug);
  const needleCanon = canonicalSlug(rawSlug);
  for (const team of table.teams) {
    if (team.teamSlug === needle || canonicalSlug(team.teamSlug) === needleCanon) {
      return team;
    }
  }
  return null;
}

export function getTeamAttackDefenseComparison(
  league: string,
  teamASlug: string,
  teamBSlug?: string | null,
): TeamAttackDefenseBlock | null {
  const table = buildLeagueAttackDefenseTable(league);
  if (!table) return null;

  const teamA = findAttackDefenseTeam(table, teamASlug);
  if (!teamA) return null;

  let teamB: LeagueAttackDefenseTeamRow | null = null;
  if (teamBSlug && teamBSlug.trim().length > 0) {
    teamB = findAttackDefenseTeam(table, teamBSlug);
    if (!teamB) return null;
  }

  const labels = sportMetricLabels(table.sport);
  const leagueSize = table.leagueSize;

  const makeRow = (input: {
    readonly key: string;
    readonly category: "attack" | "defense";
    readonly label: string;
    readonly metricA: AttackDefenseMetricScore;
    readonly metricB: AttackDefenseMetricScore | null;
    readonly allValues: ReadonlyArray<number | null>;
    readonly digits: number;
    readonly pct?: boolean;
  }): TeamAttackDefenseMetricRow | null => {
    if (input.metricA.value === null && (input.metricB?.value ?? null) === null) {
      return null;
    }
    return {
      key: input.key,
      category: input.category,
      label: input.label,
      valueA: input.metricA.value,
      valueB: input.metricB?.value ?? null,
      leagueAverage: meanOfValues(input.allValues),
      rankA: input.metricA.rank,
      rankB: input.metricB?.rank ?? null,
      leagueSize,
      lowerIsBetter: input.metricA.lowerIsBetter,
      digits: input.digits,
      pct: input.pct ?? false,
    };
  };

  const attackCandidates = [
    makeRow({
      key: "goals_for_pg",
      category: "attack",
      label: labels.scoringFor,
      metricA: teamA.goalsForPerGame,
      metricB: teamB?.goalsForPerGame ?? null,
      allValues: table.teams.map((t) => t.goalsForPerGame.value),
      digits: labels.digits,
    }),
    makeRow({
      key: "expected_goals_for",
      category: "attack",
      label: labels.expectedFor,
      metricA: teamA.expectedGoalsFor,
      metricB: teamB?.expectedGoalsFor ?? null,
      allValues: table.teams.map((t) => t.expectedGoalsFor.value),
      digits: labels.digits,
    }),
    makeRow({
      key: "shots_pg",
      category: "attack",
      label: "Tiros / partido",
      metricA: teamA.shotsPerGame,
      metricB: teamB?.shotsPerGame ?? null,
      allValues: table.teams.map((t) => t.shotsPerGame.value),
      digits: 1,
    }),
    makeRow({
      key: "shots_on_target_pg",
      category: "attack",
      label: "Tiros a puerta / partido",
      metricA: teamA.shotsOnTargetPerGame,
      metricB: teamB?.shotsOnTargetPerGame ?? null,
      allValues: table.teams.map((t) => t.shotsOnTargetPerGame.value),
      digits: 1,
    }),
  ];

  const defenseCandidates = [
    makeRow({
      key: "goals_against_pg",
      category: "defense",
      label: labels.scoringAgainst,
      metricA: teamA.goalsAgainstPerGame,
      metricB: teamB?.goalsAgainstPerGame ?? null,
      allValues: table.teams.map((t) => t.goalsAgainstPerGame.value),
      digits: labels.digits,
    }),
    makeRow({
      key: "expected_goals_against",
      category: "defense",
      label: labels.expectedAgainst,
      metricA: teamA.expectedGoalsAgainst,
      metricB: teamB?.expectedGoalsAgainst ?? null,
      allValues: table.teams.map((t) => t.expectedGoalsAgainst.value),
      digits: labels.digits,
    }),
    makeRow({
      key: "clean_sheets",
      category: "defense",
      label: "Vallas invictas",
      metricA: teamA.cleanSheets,
      metricB: teamB?.cleanSheets ?? null,
      allValues: table.teams.map((t) => t.cleanSheets.value),
      digits: 0,
    }),
    makeRow({
      key: "clean_sheet_pct",
      category: "defense",
      label: "Porcentaje arco en cero",
      metricA: teamA.cleanSheetPct,
      metricB: teamB?.cleanSheetPct ?? null,
      allValues: table.teams.map((t) => t.cleanSheetPct.value),
      digits: 0,
      pct: true,
    }),
  ];

  const attackMetrics = attackCandidates.filter(
    (item): item is TeamAttackDefenseMetricRow => item !== null,
  );
  const defenseMetrics = defenseCandidates.filter(
    (item): item is TeamAttackDefenseMetricRow => item !== null,
  );

  return {
    league: table.league,
    leagueLabel: table.leagueLabel,
    sport: table.sport,
    leagueSize,
    teamA,
    teamB,
    attackMetrics,
    defenseMetrics,
    metrics: [...attackMetrics, ...defenseMetrics],
  };
}

export function buildLeagueKnockoutBracket(league: string): LeagueKnockoutBracketPayload | null {
  const normalized = league.trim().toLowerCase();
  if (!isProductLeagueKey(normalized)) return null;

  const capability = getLeagueCapability(normalized);
  if (!capability || !capability.hasKnockoutBracket) return null;

  const cacheKey = leagueFilesCacheKey(normalized);
  const cached = bracketCache.get(normalized);
  if (cached && cached.key === cacheKey) {
    return cached.payload;
  }

  const snapshot = loadRawLeagueSnapshot(normalized);
  const registry = buildTeamMetaRegistry(normalized, snapshot);
  const allMatches = loadUnifiedMatches(normalized, snapshot, registry);
  const payload = selectBracketBuilderOrProjected(
    normalized,
    LEAGUE_LABELS[normalized] ?? normalized,
    snapshot,
    registry,
    allMatches,
    capability,
    () => buildLeagueStandingsSplits(normalized),
  );

  bracketCache.set(normalized, { key: cacheKey, payload });
  return payload;
}

export interface LeagueSeasonProgressPayload {
  readonly seasonLabel: string;
  readonly periodLabel: string;
  readonly startDateIso: string | null;
  readonly endDateIso: string | null;
  readonly startLabel: string;
  readonly endLabel: string;
  readonly playedRounds: number;
  readonly totalRounds: number;
  readonly pct: number;
  readonly progressSummary: string;
}

export interface LeagueStatLeaderEntry {
  readonly rank: number;
  readonly playerSlug: string;
  readonly name: string;
  readonly shortName: string;
  readonly teamSlug: string;
  readonly teamName: string;
  readonly teamHref: string;
  readonly playerHref: string;
  readonly positionLabel: string;
  readonly appearances: number;
  readonly primaryValue: number;
  readonly primaryFormatted: string;
  readonly secondaryLabel: string | null;
}

export interface LeagueStatLeaderCategory {
  readonly key: string;
  readonly label: string;
  readonly unitLabel: string;
  readonly entries: readonly LeagueStatLeaderEntry[];
}

export interface LeagueTeamStatLeaderEntry {
  readonly rank: number;
  readonly teamSlug: string;
  readonly name: string;
  readonly shortName: string;
  readonly teamHref: string;
  readonly played: number;
  readonly primaryValue: number;
  readonly primaryFormatted: string;
  readonly secondaryLabel: string | null;
}

export interface LeagueStatLeadersPayload {
  readonly playerCategories: readonly LeagueStatLeaderCategory[];
  readonly teamAttack: readonly LeagueTeamStatLeaderEntry[];
  readonly teamDefense: readonly LeagueTeamStatLeaderEntry[];
  readonly scoringUnitPlural: string;
}

export interface LeagueTitleCandidate {
  readonly rank: number;
  readonly teamSlug: string;
  readonly name: string;
  readonly shortName: string;
  readonly code: string;
  readonly teamHref: string;
  readonly currentRank: number;
  readonly played: number;
  readonly points: number;
  readonly winPct: number | null;
  readonly titleProbPct: number;
  readonly fairDecimal: number;
  readonly netRatingLabel: string;
}

export interface LeagueTitleProjectionPayload {
  readonly titleLabel: string;
  readonly subtitle: string;
  readonly candidates: readonly LeagueTitleCandidate[];
}

export interface LeagueHubCapabilitiesPayload {
  readonly sport: PlatformSport;
  readonly tier: LeagueCapabilityContract["tier"];
  readonly hasStandingsTable: boolean;
  readonly hasKnockoutBracket: boolean;
  readonly hasRelegationZones: boolean;
  readonly hasReferees: boolean;
  readonly hasPlayerProps: boolean;
}

export interface LeagueHubEnrichmentPayload {
  readonly league: ProductLeague;
  readonly leagueLabel: string;
  readonly capabilities: LeagueHubCapabilitiesPayload;
  readonly seasonProgress: LeagueSeasonProgressPayload;
  readonly standingsSplits: LeagueStandingsSplitsPayload | null;
  readonly bracket: LeagueKnockoutBracketPayload | null;
  readonly attackDefense: LeagueAttackDefensePayload | null;
  readonly statLeaders: LeagueStatLeadersPayload;
  readonly titleProjection: LeagueTitleProjectionPayload | null;
  readonly refereeRanking: LeagueRefereeRankingResponse | null;
}

const MONTH_SHORT_ES: readonly string[] = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

function formatShortSpanishDate(isoDay: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDay.trim());
  if (!m) return isoDay;
  const monthNum = parseStrictFiniteNumber(m[2]);
  const dayNum = parseStrictFiniteNumber(m[3]);
  if (monthNum === null || dayNum === null || monthNum < 1 || monthNum > 12) {
    return isoDay;
  }
  const monthLabel = MONTH_SHORT_ES[monthNum - 1] ?? m[2];
  return `${dayNum} ${monthLabel} ${m[1]}`;
}

function resolveTargetSeasonRounds(
  league: ProductLeague,
  sport: PlatformSport,
  teamCount: number,
  playedAvg: number,
): number {
  if (league === "conference-league") return 6;
  if (league === "champions-league" || league === "europa-league") return 8;
  if (league === "liga-mx") return 17;
  if (league === "mls") return 34;
  if (league === "libertadores" || league === "sudamericana" || league === "caf-champions") {
    return 6;
  }
  if (sport === "american-football") return 17;
  if (sport === "basketball" || sport === "ice-hockey") return 82;
  if (sport === "baseball") return 162;
  if (isNationalCompetition(league)) {
    return Math.max(6, Math.ceil(playedAvg));
  }
  if (teamCount >= 4) {
    return Math.max(10, (teamCount - 1) * 2);
  }
  return Math.max(6, Math.ceil(playedAvg));
}

function buildLeagueSeasonProgress(
  league: ProductLeague,
  sport: PlatformSport,
  snapshot: LeagueSnapshot | null,
  allMatches: readonly UnifiedMatchRecord[],
  standingsSplits: LeagueStandingsSplitsPayload | null,
): LeagueSeasonProgressPayload {
  const seasonLabel = sanitizeLabel(snapshot?.seasonLabel, "2026");
  const periodLabel = sanitizeLabel(snapshot?.periodLabel, "");

  const scopedMatches = UEFA_LEAGUE_PHASE_COMPETITIONS.has(league)
    ? (() => {
        const leaguePhase = allMatches.filter((m) =>
          `${m.round ?? ""} ${m.stageName ?? ""}`.toLowerCase().includes("league phase"),
        );
        return leaguePhase.length > 0 ? leaguePhase : allMatches;
      })()
    : allMatches;

  const sortedDayKeys = Array.from(
    new Set(
      scopedMatches
        .map((m) => m.dayKey)
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const startDateIso = sortedDayKeys[0] ?? null;
  const endDateIso = sortedDayKeys.length > 0 ? sortedDayKeys[sortedDayKeys.length - 1]! : null;
  const startLabel = startDateIso ? formatShortSpanishDate(startDateIso) : seasonLabel;
  const endLabel = endDateIso
    ? formatShortSpanishDate(endDateIso)
    : periodLabel || "En curso";

  const standingsPool =
    standingsSplits && standingsSplits.total.length > 0
      ? standingsSplits.total
      : (snapshot?.standings ?? []);

  let playedRounds = 0;
  let totalRounds = 1;
  let pct = 0;

  if (standingsPool.length > 1) {
    const playedValues = standingsPool.map((row) => row.played).sort((a, b) => a - b);
    const mid = Math.floor(playedValues.length / 2);
    const medianPlayed = playedValues[mid] ?? 0;
    const avgPlayed =
      playedValues.reduce((acc, v) => acc + v, 0) / playedValues.length;
    playedRounds = Math.max(0, Math.round(medianPlayed > 0 ? medianPlayed : avgPlayed));
    totalRounds = resolveTargetSeasonRounds(league, sport, standingsPool.length, avgPlayed);
    pct = Math.max(4, Math.min(100, Math.round((playedRounds / Math.max(1, totalRounds)) * 100)));
  } else if (scopedMatches.length > 0) {
    const finishedCount = scopedMatches.filter((m) => m.status === "FT").length;
    playedRounds = finishedCount;
    totalRounds = scopedMatches.length;
    pct = Math.max(4, Math.min(100, Math.round((finishedCount / Math.max(1, totalRounds)) * 100)));
  }

  const unitLabel =
    sport === "basketball" || sport === "baseball" || sport === "ice-hockey"
      ? "juegos"
      : sport === "american-football"
        ? "semanas"
        : "jornadas";
  const progressSummary =
    standingsPool.length > 1
      ? `${playedRounds} de ${totalRounds} ${unitLabel} · ${pct}%`
      : scopedMatches.length > 0
        ? `${playedRounds} de ${totalRounds} partidos · ${pct}%`
        : periodLabel || seasonLabel;

  return {
    seasonLabel,
    periodLabel,
    startDateIso,
    endDateIso,
    startLabel,
    endLabel,
    playedRounds,
    totalRounds,
    pct,
    progressSummary,
  };
}

function buildFootballPlayerLeaderCategories(
  league: ProductLeague,
  squads: LeagueSquadsFile,
): LeagueStatLeaderCategory[] {
  const flat: Array<{
    readonly playerSlug: string;
    readonly name: string;
    readonly shortName: string;
    readonly teamSlug: string;
    readonly teamName: string;
    readonly positionGroup: "GK" | "DEF" | "MID" | "FWD";
    readonly positionLabel: string;
    readonly appearances: number;
    readonly goals: number;
    readonly assists: number;
    readonly shots: number;
    readonly shotsOnTarget: number;
    readonly yellowCards: number;
    readonly redCards: number;
    readonly saves: number;
  }> = [];

  for (const team of squads.teams) {
    const safeTeamName = sanitizeLabel(team.teamName, humanizeSlug(team.teamSlug));
    const safeTeamSlug = cleanTeamRouteSlug(team.teamSlug);
    for (const player of team.players) {
      const safeName = sanitizeLabel(player.name, humanizeSlug(player.slug));
      const safeShort = sanitizeLabel(player.shortName, safeName);
      const safePos = sanitizeLabel(player.positionLabel, player.positionGroup);
      flat.push({
        playerSlug: player.slug,
        name: safeName,
        shortName: safeShort,
        teamSlug: safeTeamSlug,
        teamName: safeTeamName,
        positionGroup: player.positionGroup,
        positionLabel: safePos,
        appearances: player.stats.appearances,
        goals: player.stats.goals,
        assists: player.stats.assists,
        shots: player.stats.shots,
        shotsOnTarget: player.stats.shotsOnTarget,
        yellowCards: player.stats.yellowCards,
        redCards: player.stats.redCards,
        saves: player.stats.saves,
      });
    }
  }

  const pickTop = (
    key: string,
    label: string,
    unitLabel: string,
    selector: (row: (typeof flat)[number]) => number,
    secondary: (row: (typeof flat)[number]) => string | null,
    filterFn?: (row: (typeof flat)[number]) => boolean,
  ): LeagueStatLeaderCategory | null => {
    const candidates = flat
      .filter((row) => (filterFn ? filterFn(row) : true) && selector(row) > 0)
      .sort((a, b) => {
        const diff = selector(b) - selector(a);
        if (diff !== 0) return diff;
        if (a.appearances !== b.appearances) return a.appearances - b.appearances;
        return a.name.localeCompare(b.name, "es-MX");
      })
      .slice(0, 8);

    if (candidates.length === 0) return null;

    return {
      key,
      label,
      unitLabel,
      entries: candidates.map((row, idx) => ({
        rank: idx + 1,
        playerSlug: row.playerSlug,
        name: row.name,
        shortName: row.shortName,
        teamSlug: row.teamSlug,
        teamName: row.teamName,
        teamHref: canonicalTeamHref(league, row.teamSlug),
        playerHref: canonicalPlayerHref(league, row.teamSlug, row.playerSlug),
        positionLabel: row.positionLabel,
        appearances: row.appearances,
        primaryValue: selector(row),
        primaryFormatted: String(selector(row)),
        secondaryLabel: secondary(row),
      })),
    };
  };

  const categories = [
    pickTop(
      "goals",
      "Goleadores",
      "Goles",
      (r) => r.goals,
      (r) => (r.appearances > 0 ? `${r.appearances} PJ · ${r.assists} asist.` : r.assists > 0 ? `${r.assists} asist.` : null),
    ),
    pickTop(
      "assists",
      "Asistencias",
      "Asist.",
      (r) => r.assists,
      (r) => (r.appearances > 0 ? `${r.appearances} PJ · ${r.goals} goles` : r.goals > 0 ? `${r.goals} goles` : null),
    ),
    pickTop(
      "shots_on_target",
      "Tiros a puerta",
      "A puerta",
      (r) => r.shotsOnTarget,
      (r) => (r.shots > 0 ? `${r.shots} tiros totales` : null),
    ),
    pickTop(
      "shots",
      "Remates",
      "Tiros",
      (r) => r.shots,
      (r) => (r.shotsOnTarget > 0 ? `${r.shotsOnTarget} a puerta` : null),
    ),
    pickTop(
      "yellow_cards",
      "Amarillas",
      "TA",
      (r) => r.yellowCards,
      (r) => (r.redCards > 0 ? `${r.redCards} rojas` : r.appearances > 0 ? `${r.appearances} PJ` : null),
    ),
    pickTop(
      "saves",
      "Atajadas",
      "Ataj.",
      (r) => r.saves,
      (r) => (r.appearances > 0 ? `${r.appearances} PJ` : null),
      (r) => r.positionGroup === "GK" || r.saves > 0,
    ),
  ];

  return categories.filter((c): c is LeagueStatLeaderCategory => c !== null);
}

function buildUsPlayerLeaderCategories(
  league: ProductLeague,
  sport: PlatformSport,
  squads: LeagueSquadsFile,
): LeagueStatLeaderCategory[] {
  const metricSpecs: ReadonlyArray<{
    readonly keys: readonly string[];
    readonly key: string;
    readonly label: string;
    readonly unitLabel: string;
    readonly digits: number;
    readonly suffix?: string;
    readonly minAppearances: number;
  }> =
    sport === "basketball"
      ? [
          { keys: ["pts"], key: "pts", label: "Puntos", unitLabel: "PTS", digits: 1, minAppearances: 3 },
          { keys: ["reb"], key: "reb", label: "Rebotes", unitLabel: "REB", digits: 1, minAppearances: 3 },
          { keys: ["ast"], key: "ast", label: "Asistencias", unitLabel: "AST", digits: 1, minAppearances: 3 },
          { keys: ["3pm", "tpm", "fg3m"], key: "3pm", label: "Triples", unitLabel: "3PM", digits: 1, minAppearances: 3 },
          { keys: ["fg_"], key: "fg_", label: "% Tiros de campo", unitLabel: "%TC", digits: 1, suffix: "%", minAppearances: 5 },
        ]
      : sport === "ice-hockey"
        ? [
            { keys: ["pts"], key: "pts", label: "Puntos", unitLabel: "PTS", digits: 0, minAppearances: 2 },
            { keys: ["g"], key: "g", label: "Goles", unitLabel: "G", digits: 0, minAppearances: 2 },
            { keys: ["a"], key: "a", label: "Asistencias", unitLabel: "A", digits: 0, minAppearances: 2 },
            { keys: ["s"], key: "s", label: "Tiros", unitLabel: "Tiros", digits: 0, minAppearances: 2 },
          ]
        : sport === "american-football"
          ? [
              { keys: ["yds"], key: "yds", label: "Yardas", unitLabel: "YDS", digits: 0, minAppearances: 0 },
              { keys: ["td"], key: "td", label: "Touchdowns", unitLabel: "TD", digits: 0, minAppearances: 0 },
              { keys: ["rec"], key: "rec", label: "Recepciones", unitLabel: "REC", digits: 0, minAppearances: 0 },
              { keys: ["cmp"], key: "cmp", label: "Pases completos", unitLabel: "CMP", digits: 0, minAppearances: 0 },
            ]
          : [
              { keys: ["hr"], key: "hr", label: "Jonrones", unitLabel: "HR", digits: 0, minAppearances: 1 },
              { keys: ["rbi"], key: "rbi", label: "Impulsadas", unitLabel: "CI", digits: 0, minAppearances: 1 },
              { keys: ["ip"], key: "ip", label: "Entradas lanzadas", unitLabel: "IP", digits: 1, minAppearances: 1 },
            ];

  const results: LeagueStatLeaderCategory[] = [];

  for (const spec of metricSpecs) {
    const rows: Array<{
      readonly playerSlug: string;
      readonly name: string;
      readonly shortName: string;
      readonly teamSlug: string;
      readonly teamName: string;
      readonly positionLabel: string;
      readonly appearances: number;
      readonly value: number;
      readonly minMetric: number | null;
    }> = [];

    for (const team of squads.teams) {
      const safeTeamName = sanitizeLabel(team.teamName, humanizeSlug(team.teamSlug));
      const safeTeamSlug = cleanTeamRouteSlug(team.teamSlug);
      for (const player of team.players) {
        const metrics = player.seasonMetrics ?? [];
        if (metrics.length === 0) continue;
        const found = metrics.find((m) => spec.keys.includes(m.key.trim().toLowerCase()));
        if (!found) continue;
        const parsedVal = parseStrictFiniteNumber(found.value.replace("%", ""));
        if (parsedVal === null || parsedVal <= 0) continue;
        const gpMetric = metrics.find((m) => m.key.trim().toLowerCase() === "gp");
        const gpVal = gpMetric ? parseStrictFiniteNumber(gpMetric.value) : null;
        const appearances = gpVal !== null ? Math.round(gpVal) : player.stats.appearances;
        const minEntry = metrics.find((m) => m.key.trim().toLowerCase() === "min");
        const minMetric = minEntry ? parseStrictFiniteNumber(minEntry.value) : null;

        const safeName = sanitizeLabel(player.name, humanizeSlug(player.slug));
        const safeShort = sanitizeLabel(player.shortName, safeName);
        const safePos = sanitizeLabel(player.positionLabel, player.positionGroup);

        rows.push({
          playerSlug: player.slug,
          name: safeName,
          shortName: safeShort,
          teamSlug: safeTeamSlug,
          teamName: safeTeamName,
          positionLabel: safePos,
          appearances,
          value: parsedVal,
          minMetric,
        });
      }
    }

    const filteredBySample = rows.filter((r) => {
      if (r.appearances < spec.minAppearances) return false;
      if (sport === "basketball" && spec.key === "fg_" && r.minMetric !== null && r.minMetric < 18) {
        return false;
      }
      return true;
    });
    const pool = filteredBySample.length >= 3 ? filteredBySample : rows;
    if (pool.length === 0) continue;

    const top = pool
      .slice()
      .sort((a, b) => {
        const diff = b.value - a.value;
        if (Math.abs(diff) > 1e-6) return diff;
        if (b.appearances !== a.appearances) return b.appearances - a.appearances;
        return a.name.localeCompare(b.name, "es-MX");
      })
      .slice(0, 8);

    results.push({
      key: spec.key,
      label: spec.label,
      unitLabel: spec.unitLabel,
      entries: top.map((row, idx) => ({
        rank: idx + 1,
        playerSlug: row.playerSlug,
        name: row.name,
        shortName: row.shortName,
        teamSlug: row.teamSlug,
        teamName: row.teamName,
        teamHref: canonicalTeamHref(league, row.teamSlug),
        playerHref: canonicalPlayerHref(league, row.teamSlug, row.playerSlug),
        positionLabel: row.positionLabel,
        appearances: row.appearances,
        primaryValue: row.value,
        primaryFormatted: `${spec.digits > 0 ? row.value.toFixed(spec.digits) : Math.round(row.value)}${spec.suffix ?? ""}`,
        secondaryLabel:
          row.appearances > 0
            ? row.minMetric !== null
              ? `${row.appearances} JJ · ${row.minMetric.toFixed(1)} min`
              : `${row.appearances} JJ`
            : row.positionLabel,
      })),
    });
  }

  return results;
}

function buildLeagueStatLeaders(
  league: ProductLeague,
  sport: PlatformSport,
  attackDefense: LeagueAttackDefensePayload | null,
): LeagueStatLeadersPayload {
  const scoringUnit = sportScoringUnit(sport);
  const squads = loadRawLeagueSquads(league);
  const playerCategories = squads
    ? sport === "football"
      ? buildFootballPlayerLeaderCategories(league, squads)
      : buildUsPlayerLeaderCategories(league, sport, squads)
    : [];

  const digits = sport === "basketball" || sport === "american-football" ? 1 : 2;
  const teamAttack: LeagueTeamStatLeaderEntry[] = [];
  const teamDefense: LeagueTeamStatLeaderEntry[] = [];

  if (attackDefense && attackDefense.teams.length > 0) {
    const byAttack = attackDefense.teams
      .filter((t) => t.goalsForPerGame.value !== null)
      .slice()
      .sort((a, b) => {
        if (a.attackRank !== b.attackRank) return a.attackRank - b.attackRank;
        return (b.goalsForPerGame.value ?? 0) - (a.goalsForPerGame.value ?? 0);
      })
      .slice(0, 5);

    for (let i = 0; i < byAttack.length; i += 1) {
      const team = byAttack[i]!;
      const val = team.goalsForPerGame.value ?? 0;
      const expVal = team.expectedGoalsFor.value;
      const expLabel =
        expVal !== null
          ? sport === "football"
            ? `${expVal.toFixed(2)} esperados/p`
            : sport === "basketball"
              ? `Ofensiva ${expVal.toFixed(1)}`
              : `${expVal.toFixed(digits)} ajustado`
          : `${team.played} PJ`;
      teamAttack.push({
        rank: i + 1,
        teamSlug: team.teamSlug,
        name: team.name,
        shortName: team.shortName,
        teamHref: team.teamHref,
        played: team.played,
        primaryValue: val,
        primaryFormatted: val.toFixed(digits),
        secondaryLabel: expLabel,
      });
    }

    const byDefense = attackDefense.teams
      .filter((t) => t.goalsAgainstPerGame.value !== null)
      .slice()
      .sort((a, b) => {
        if (a.defenseRank !== b.defenseRank) return a.defenseRank - b.defenseRank;
        return (a.goalsAgainstPerGame.value ?? 999) - (b.goalsAgainstPerGame.value ?? 999);
      })
      .slice(0, 5);

    for (let i = 0; i < byDefense.length; i += 1) {
      const team = byDefense[i]!;
      const val = team.goalsAgainstPerGame.value ?? 0;
      const csPct = team.cleanSheetPct.value;
      const expAgainst = team.expectedGoalsAgainst.value;
      const secondary =
        csPct !== null
          ? `${csPct}% portería en 0`
          : expAgainst !== null
            ? sport === "basketball"
              ? `Defensiva ${expAgainst.toFixed(1)}`
              : `${expAgainst.toFixed(digits)} esperados`
            : `${team.played} PJ`;
      teamDefense.push({
        rank: i + 1,
        teamSlug: team.teamSlug,
        name: team.name,
        shortName: team.shortName,
        teamHref: team.teamHref,
        played: team.played,
        primaryValue: val,
        primaryFormatted: val.toFixed(digits),
        secondaryLabel: secondary,
      });
    }
  }

  return {
    playerCategories,
    teamAttack,
    teamDefense,
    scoringUnitPlural: scoringUnit.plural,
  };
}

function buildSpacetimeTitleProjection(
  league: ProductLeague,
  sport: PlatformSport,
  snapshot: LeagueSnapshot | null,
  standingsSplits: LeagueStandingsSplitsPayload | null,
  seasonProgress: LeagueSeasonProgressPayload,
  fullAccess: boolean,
): LeagueTitleProjectionPayload | null {
  if (!fullAccess || !snapshot) return null;

  const rateByCanon = new Map<
    string,
    { readonly adjustedFor: number; readonly adjustedAgainst: number }
  >();
  for (const rate of Object.values(snapshot.teamRates)) {
    rateByCanon.set(canonicalSlug(rate.teamId), {
      adjustedFor: rate.adjustedFor,
      adjustedAgainst: rate.adjustedAgainst,
    });
  }

  const poolRows: Array<{
    readonly teamSlug: string;
    readonly name: string;
    readonly shortName: string;
    readonly code: string;
    readonly teamHref: string;
    readonly currentRank: number;
    readonly played: number;
    readonly points: number;
    readonly won: number;
    readonly drawn: number;
    readonly goalDiff: number;
    readonly winPct: number | null;
    readonly netRate: number;
  }> = [];

  if (standingsSplits && standingsSplits.total.length >= 2) {
    for (const row of standingsSplits.total) {
      const canon = canonicalSlug(row.teamSlug);
      const rate = rateByCanon.get(canon);
      const fallbackNet = row.played > 0 ? row.goalDiff / row.played : 0;
      const netRate = rate ? rate.adjustedFor - rate.adjustedAgainst : fallbackNet;
      poolRows.push({
        teamSlug: row.teamSlug,
        name: row.name,
        shortName: row.shortName,
        code: row.code,
        teamHref: row.teamHref,
        currentRank: row.rank,
        played: row.played,
        points: row.points,
        won: row.won,
        drawn: row.drawn,
        goalDiff: row.goalDiff,
        winPct: row.winPct,
        netRate,
      });
    }
  } else if ((snapshot.standings ?? []).length >= 2) {
    const standings = snapshot.standings ?? [];
    for (let i = 0; i < standings.length; i += 1) {
      const row = standings[i]!;
      const slug = cleanTeamRouteSlug(row.teamId);
      const canon = canonicalSlug(slug);
      const rate = rateByCanon.get(canon);
      const goalDiff = row.goalsFor - row.goalsAgainst;
      const fallbackNet = row.played > 0 ? goalDiff / row.played : 0;
      const netRate = rate ? rate.adjustedFor - rate.adjustedAgainst : fallbackNet;
      poolRows.push({
        teamSlug: slug,
        name: sanitizeLabel(row.name, humanizeSlug(slug)),
        shortName: sanitizeLabel(row.shortName, sanitizeLabel(row.name, humanizeSlug(slug))),
        code: sanitizeLabel(row.code, slug.slice(0, 3).toUpperCase()),
        teamHref: canonicalTeamHref(league, slug),
        currentRank: i + 1,
        played: row.played,
        points: row.points,
        won: row.won,
        drawn: row.drawn,
        goalDiff,
        winPct: row.winPct ?? null,
        netRate,
      });
    }
  }

  if (poolRows.length < 2) return null;

  const meanNet = poolRows.reduce((acc, r) => acc + r.netRate, 0) / poolRows.length;
  const varianceNet =
    poolRows.reduce((acc, r) => acc + (r.netRate - meanNet) ** 2, 0) / poolRows.length;
  const stdNet = Math.max(0.25, Math.sqrt(varianceNet));

  const totalRounds = Math.max(1, seasonProgress.totalRounds);
  const usesWinPct =
    sport === "basketball" || sport === "american-football" || sport === "baseball";
  const maxPtsPerGame = sport === "football" ? 3 : 2;

  const projectedScores = poolRows.map((row) => {
    const zNet = (row.netRate - meanNet) / stdNet;
    const remaining = Math.max(0, totalRounds - row.played);
    if (usesWinPct) {
      const expectedWinRate = 1 / (1 + Math.exp(-0.72 * zNet));
      const bankedWins = row.won + 0.5 * row.drawn;
      const projWins = bankedWins + remaining * expectedWinRate;
      const score = (projWins / Math.max(totalRounds, row.played, 1)) * 10 + 0.65 * zNet;
      return { row, zNet, score };
    }
    const expectedPpg = (maxPtsPerGame * 0.48) + (maxPtsPerGame * 0.24) * Math.tanh(0.68 * zNet);
    const projPoints = row.points + remaining * expectedPpg;
    const score = projPoints + 1.4 * zNet + 0.04 * row.goalDiff;
    return { row, zNet, score };
  });

  const maxScore = Math.max(...projectedScores.map((s) => s.score));
  const avgRemainingFrac = Math.max(0.15, Math.min(1, 1 - seasonProgress.pct / 100));
  const temperature = usesWinPct
    ? 0.42 + 0.48 * avgRemainingFrac
    : Math.max(2.4, (totalRounds * 0.14) * (0.55 + 0.85 * avgRemainingFrac));

  const weights = projectedScores.map((item) => ({
    ...item,
    weight: Math.exp((item.score - maxScore) / temperature),
  }));
  const weightSum = weights.reduce((acc, w) => acc + w.weight, 0);
  if (!Number.isFinite(weightSum) || weightSum <= 0) return null;

  const ranked = weights
    .map((item) => {
      const prob = Math.max(0.005, Math.min(0.92, item.weight / weightSum));
      const probPct = round1(prob * 100);
      const fairDecimal = round2(Math.max(1.08, 1 / prob));
      const digits = sport === "basketball" || sport === "american-football" ? 1 : 2;
      const signedNet = item.row.netRate >= 0 ? `+${item.row.netRate.toFixed(digits)}` : item.row.netRate.toFixed(digits);
      return {
        teamSlug: item.row.teamSlug,
        name: item.row.name,
        shortName: item.row.shortName,
        code: item.row.code,
        teamHref: item.row.teamHref,
        currentRank: item.row.currentRank,
        played: item.row.played,
        points: item.row.points,
        winPct: item.row.winPct,
        titleProbPct: probPct,
        fairDecimal,
        netRatingLabel: `${signedNet}/p`,
      };
    })
    .sort((a, b) => b.titleProbPct - a.titleProbPct || a.currentRank - b.currentRank)
    .slice(0, 5)
    .map((item, idx) => ({
      rank: idx + 1,
      ...item,
    }));

  const titleLabel = UEFA_LEAGUE_PHASE_COMPETITIONS.has(league)
    ? "Proyección líder fase liga"
    : league === "liga-mx"
      ? "Proyección líder general"
      : sport === "basketball" || sport === "american-football" || sport === "ice-hockey" || sport === "baseball"
        ? "Favoritos temporada regular"
        : "Proyección de campeón";

  return {
    titleLabel,
    subtitle: "Modelo Spacetime según ritmo ajustado y tabla vigente",
    candidates: ranked,
  };
}

export function loadLeagueHubEnrichment(
  league: ProductLeague,
  fullAccess: boolean,
): LeagueHubEnrichmentPayload {
  const capability = getLeagueCapability(league);
  const mapKey = `${league}|${fullAccess ? "full" : "visitor"}`;
  const cacheKey = `${leagueFilesCacheKey(league)}|${fullAccess ? "full" : "visitor"}`;
  const cached = enrichmentCache.get(mapKey);
  if (cached && cached.key === cacheKey) {
    return cached.payload;
  }

  const snapshot = loadRawLeagueSnapshot(league);
  const sport = sportForLeague(league);
  const registry = buildTeamMetaRegistry(league, snapshot);
  const allMatches = loadUnifiedMatches(league, snapshot, registry);
  const standingsSplits = buildLeagueStandingsSplits(league);
  const bracket = capability.hasKnockoutBracket ? buildLeagueKnockoutBracket(league) : null;
  const attackDefense = fullAccess ? buildLeagueAttackDefenseTable(league) : null;
  const seasonProgress = buildLeagueSeasonProgress(
    league,
    sport,
    snapshot,
    allMatches,
    standingsSplits,
  );
  const statLeaders = buildLeagueStatLeaders(league, sport, attackDefense);
  const titleProjection = buildSpacetimeTitleProjection(
    league,
    sport,
    snapshot,
    standingsSplits,
    seasonProgress,
    fullAccess,
  );

  const rawRefRanking =
    fullAccess && capability.providers.referees && sport === "football"
      ? loadLeagueRefereeRanking(league)
      : null;
  const refereeRanking: LeagueRefereeRankingResponse | null = rawRefRanking
    ? {
        ...rawRefRanking,
        referees: rawRefRanking.referees.slice(0, 40),
      }
    : null;

  const payload: LeagueHubEnrichmentPayload = {
    league,
    leagueLabel: LEAGUE_LABELS[league] ?? league,
    capabilities: {
      sport,
      tier: capability.tier,
      hasStandingsTable: capability.hasStandingsTable,
      hasKnockoutBracket: capability.hasKnockoutBracket,
      hasRelegationZones: capability.hasRelegationZones,
      hasReferees: capability.providers.referees && sport === "football",
      hasPlayerProps: capability.hasPlayerProps,
    },
    seasonProgress,
    standingsSplits,
    bracket,
    attackDefense,
    statLeaders,
    titleProjection,
    refereeRanking,
  };

  enrichmentCache.set(mapKey, { key: cacheKey, payload });
  return payload;
}
