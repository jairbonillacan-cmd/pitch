import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  canonicalGameHref,
  canonicalGameSlug,
  canonicalTeamHref,
  cleanTeamRouteSlug,
  getLeagueCapability,
  isSafePublicLabel,
  LeagueSquadsFileSchema,
  sportForLeague,
  sportHasDraw,
  type LeagueCapabilityContract,
  type LeagueSnapshot,
  type LeagueSquadsFile,
  type PlatformSport,
  type StandingFormToken,
} from "@pitchlab/contracts";
import {
  LEAGUE_LABELS,
  loadRawLeagueSnapshot,
  PRODUCT_LEAGUES,
  resolveSnapshotsRoot,
  type ProductLeague,
} from "./snapshots";
import { findSpacetimeTeamRecord } from "./spacetime";

export type StandingsZoneTone = "ucl" | "uel" | "uecl" | "warn" | "rel";

export interface StandingsZoneDef {
  readonly id: string;
  readonly label: string;
  readonly tone: StandingsZoneTone;
  readonly startRank: number;
  readonly endRank: number;
  readonly scope: "league" | "conference";
}

export interface StandingsSplitRow {
  readonly rank: number;
  readonly teamId: string;
  readonly teamSlug: string;
  readonly name: string;
  readonly shortName: string;
  readonly code: string;
  readonly teamHref: string;
  readonly conference: string | null;
  readonly division: string | null;
  readonly played: number;
  readonly won: number;
  readonly drawn: number;
  readonly lost: number;
  readonly overtimeLosses?: number;
  readonly goalsFor: number;
  readonly goalsAgainst: number;
  readonly goalDiff: number;
  readonly points: number;
  readonly winPct: number | null;
  readonly gamesBehind: string | null;
  readonly seed: number | null;
  readonly form: readonly StandingFormToken[];
  readonly zoneId: string | null;
  readonly zoneLabel: string | null;
  readonly zoneTone: StandingsZoneTone | null;
}

export interface LeagueStandingsSplitsPayload {
  readonly league: ProductLeague;
  readonly leagueLabel: string;
  readonly sport: PlatformSport;
  readonly season: string;
  readonly roundLabel: string;
  readonly updatedAt: string;
  readonly hasRelegationZones: boolean;
  readonly hasConferences: boolean;
  readonly conferences: readonly string[];
  readonly total: readonly StandingsSplitRow[];
  readonly home: readonly StandingsSplitRow[];
  readonly away: readonly StandingsSplitRow[];
  readonly zones: readonly StandingsZoneDef[];
}

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

export type BracketMode = "active_knockout" | "projected_seeding";

export type BracketFormat =
  | "liga_mx_liguilla"
  | "uefa_knockout"
  | "conmebol_knockout"
  | "nba_playoffs"
  | "generic_knockout";

export interface BracketTeamSlot {
  readonly teamId: string | null;
  readonly teamSlug: string | null;
  readonly name: string;
  readonly shortName: string;
  readonly code: string;
  readonly seed: number | null;
  readonly conference: string | null;
  readonly gamesBehind: string | null;
  readonly teamHref: string | null;
  readonly placeholder: string | null;
}

export interface BracketLegDetail {
  readonly legNumber: number;
  readonly matchSlug: string;
  readonly dateIso: string;
  readonly status: "NS" | "LIVE" | "FT";
  readonly homeTeamSlug: string;
  readonly awayTeamSlug: string;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
  readonly extraTimeScore: { readonly home: number; readonly away: number } | null;
  readonly penaltyShootout: { readonly home: number; readonly away: number } | null;
  readonly href: string;
}

export interface BracketTie {
  readonly id: string;
  readonly roundKey: string;
  readonly conference: string | null;
  readonly slotIndex: number;
  readonly teamA: BracketTeamSlot;
  readonly teamB: BracketTeamSlot;
  readonly aggregateA: number | null;
  readonly aggregateB: number | null;
  readonly penaltiesA: number | null;
  readonly penaltiesB: number | null;
  readonly seriesWinsA: number | null;
  readonly seriesWinsB: number | null;
  readonly bestOf: number | null;
  readonly legs: readonly BracketLegDetail[];
  readonly status: "projected" | "scheduled" | "in_progress" | "decided";
  readonly winnerSide: "A" | "B" | null;
  readonly winnerTeamSlug: string | null;
  readonly note: string | null;
}

export interface BracketRound {
  readonly key: string;
  readonly label: string;
  readonly order: number;
  readonly twoLegged: boolean;
  readonly bestOf: number | null;
  readonly ties: readonly BracketTie[];
}

export interface BracketConferenceSection {
  readonly conference: string;
  readonly label: string;
  readonly playIn: readonly BracketTie[];
  readonly rounds: readonly BracketRound[];
}

export interface LeagueKnockoutBracketPayload {
  readonly league: ProductLeague;
  readonly leagueLabel: string;
  readonly sport: PlatformSport;
  readonly season: string;
  readonly updatedAt: string;
  readonly mode: BracketMode;
  readonly format: BracketFormat;
  readonly hasRelegationZones: boolean;
  readonly rounds: readonly BracketRound[];
  readonly conferences: readonly BracketConferenceSection[];
  readonly finalsTie: BracketTie | null;
  readonly championSlug: string | null;
  readonly championName: string | null;
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

interface TeamMetaRecord {
  readonly teamId: string;
  readonly teamSlug: string;
  readonly name: string;
  readonly shortName: string;
  readonly code: string;
  readonly conference: string | null;
  readonly division: string | null;
  readonly snapshotSeed: number | null;
  readonly snapshotGamesBehind: string | null;
}

interface UnifiedMatchRecord {
  readonly dedupeKey: string;
  readonly matchSlug: string;
  readonly href: string;
  readonly dateIso: string;
  readonly dayKey: string;
  readonly round: string | null;
  readonly stageName: string | null;
  readonly status: "NS" | "LIVE" | "FT";
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly homeSlug: string;
  readonly awaySlug: string;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
  readonly extraTimeScore: { readonly home: number; readonly away: number } | null;
  readonly penaltyShootout: { readonly home: number; readonly away: number } | null;
  readonly overtime: boolean;
}

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

const SLUG_ALIASES: Readonly<Record<string, string>> = {
  "atlas-guadalajara": "atlas",
  "deportivo-guadalajara": "chivas",
  chivas: "chivas",
  guadalajara: "chivas",
  "gallos-blancos": "queretaro",
  juarez: "fc-juarez",
  "uanl-tigres": "tigres-uanl",
  "deportivo-toluca": "toluca",
  bournemouth: "afc-bournemouth",
  athletic: "athletic-club",
  celta: "celta-vigo",
  "espanyol-barcelona": "espanyol",
  "real-racing-santander": "racing-santander",
  atalanta: "atalanta-bc",
  inter: "internazionale-milano",
  lens: "racing-lens",
  strasbourg: "strasbourg-alsace",
  "estac-troyes": "es-troyes",
};

const UEFA_LEAGUE_PHASE_COMPETITIONS: ReadonlySet<string> = new Set([
  "champions-league",
  "europa-league",
  "conference-league",
]);

const CONMEBOL_CUP_COMPETITIONS: ReadonlySet<string> = new Set([
  "libertadores",
  "sudamericana",
]);

const PRODUCT_LEAGUE_SET: ReadonlySet<string> = new Set(PRODUCT_LEAGUES);

const splitsCache = new Map<string, { key: string; payload: LeagueStandingsSplitsPayload | null }>();
const attackDefenseCache = new Map<string, { key: string; payload: LeagueAttackDefensePayload | null }>();
const bracketCache = new Map<string, { key: string; payload: LeagueKnockoutBracketPayload | null }>();

export function resetStandingsBracketsCacheForTests(): void {
  splitsCache.clear();
  attackDefenseCache.clear();
  bracketCache.clear();
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

function canonicalSlug(rawTeamIdOrSlug: string): string {
  const clean = cleanTeamRouteSlug(rawTeamIdOrSlug);
  return SLUG_ALIASES[clean] ?? clean;
}

function sanitizeLabel(raw: string | null | undefined, fallback: string): string {
  if (raw) {
    const trimmed = raw.trim();
    if (trimmed && isSafePublicLabel(trimmed)) return trimmed;
  }
  return fallback;
}

function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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

function normalizeIsoUtc(raw: string): string {
  const trimmed = raw.trim();
  const ms = Date.parse(trimmed);
  if (Number.isFinite(ms)) return new Date(ms).toISOString();
  const utcMs = Date.parse(`${trimmed}Z`);
  if (Number.isFinite(utcMs)) return new Date(utcMs).toISOString();
  return trimmed;
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

function resolveOrCreateTeamMeta(
  league: ProductLeague,
  registry: Map<string, TeamMetaRecord>,
  rawTeamId: string,
): TeamMetaRecord {
  const slug = cleanTeamRouteSlug(rawTeamId);
  const canon = canonicalSlug(slug);
  const existing = registry.get(canon);
  if (existing) return existing;
  const fallbackName = humanizeSlug(slug);
  const created: TeamMetaRecord = {
    teamId: `${league}.${slug}`,
    teamSlug: slug,
    name: fallbackName,
    shortName: fallbackName,
    code: slug.slice(0, 3).toUpperCase(),
    conference: null,
    division: null,
    snapshotSeed: null,
    snapshotGamesBehind: null,
  };
  registry.set(canon, created);
  return created;
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

export function resolveStandingsZonesForLeague(
  league: ProductLeague,
  capability: LeagueCapabilityContract,
  totalTeams: number,
): StandingsZoneDef[] {
  if (totalTeams < 4) return [];

  const clamp = (rawZones: readonly StandingsZoneDef[]): StandingsZoneDef[] =>
    rawZones
      .filter((z) => {
        if (!capability.hasRelegationZones && (z.tone === "rel" || /descenso/i.test(z.label))) {
          return false;
        }
        return z.startRank <= totalTeams;
      })
      .map((z) => ({
        ...z,
        endRank: Math.min(z.endRank, totalTeams),
      }))
      .filter((z) => z.endRank >= z.startRank);

  if (league === "liga-mx") {
    return clamp([
      {
        id: "liguilla-direct",
        label: "Liguilla directa (Cuartos de final)",
        tone: "ucl",
        startRank: 1,
        endRank: 6,
        scope: "league",
      },
      {
        id: "play-in",
        label: "Play-In (7.º–10.º)",
        tone: "warn",
        startRank: 7,
        endRank: 10,
        scope: "league",
      },
    ]);
  }

  if (league === "premier-league") {
    return clamp([
      { id: "ucl", label: "Liga de Campeones", tone: "ucl", startRank: 1, endRank: 4, scope: "league" },
      { id: "uel", label: "UEFA Europa League", tone: "uel", startRank: 5, endRank: 5, scope: "league" },
      ...(totalTeams >= 18
        ? [
            {
              id: "rel",
              label: "Descenso",
              tone: "rel" as const,
              startRank: totalTeams - 2,
              endRank: totalTeams,
              scope: "league" as const,
            },
          ]
        : []),
    ]);
  }

  if (league === "laliga" || league === "serie-a") {
    return clamp([
      { id: "ucl", label: "Liga de Campeones", tone: "ucl", startRank: 1, endRank: 4, scope: "league" },
      { id: "uel", label: "UEFA Europa League", tone: "uel", startRank: 5, endRank: 5, scope: "league" },
      { id: "uecl", label: "Conference League", tone: "uecl", startRank: 6, endRank: 6, scope: "league" },
      ...(totalTeams >= 18
        ? [
            {
              id: "rel",
              label: "Descenso",
              tone: "rel" as const,
              startRank: totalTeams - 2,
              endRank: totalTeams,
              scope: "league" as const,
            },
          ]
        : []),
    ]);
  }

  if (league === "bundesliga") {
    return clamp([
      { id: "ucl", label: "Liga de Campeones", tone: "ucl", startRank: 1, endRank: 4, scope: "league" },
      { id: "uel", label: "UEFA Europa League", tone: "uel", startRank: 5, endRank: 5, scope: "league" },
      { id: "uecl", label: "Conference League", tone: "uecl", startRank: 6, endRank: 6, scope: "league" },
      ...(totalTeams >= 16
        ? [
            {
              id: "playoff-rel",
              label: "Playoff de permanencia",
              tone: "warn" as const,
              startRank: totalTeams - 2,
              endRank: totalTeams - 2,
              scope: "league" as const,
            },
            {
              id: "rel",
              label: "Descenso",
              tone: "rel" as const,
              startRank: totalTeams - 1,
              endRank: totalTeams,
              scope: "league" as const,
            },
          ]
        : []),
    ]);
  }

  if (league === "ligue-1") {
    return clamp([
      { id: "ucl", label: "Liga de Campeones", tone: "ucl", startRank: 1, endRank: 3, scope: "league" },
      { id: "ucl-q", label: "Clasificación Liga de Campeones", tone: "uel", startRank: 4, endRank: 4, scope: "league" },
      { id: "uel", label: "UEFA Europa League", tone: "uel", startRank: 5, endRank: 5, scope: "league" },
      { id: "uecl", label: "Conference League", tone: "uecl", startRank: 6, endRank: 6, scope: "league" },
      ...(totalTeams >= 16
        ? [
            {
              id: "playoff-rel",
              label: "Playoff de permanencia",
              tone: "warn" as const,
              startRank: totalTeams - 2,
              endRank: totalTeams - 2,
              scope: "league" as const,
            },
            {
              id: "rel",
              label: "Descenso",
              tone: "rel" as const,
              startRank: totalTeams - 1,
              endRank: totalTeams,
              scope: "league" as const,
            },
          ]
        : []),
    ]);
  }

  if (UEFA_LEAGUE_PHASE_COMPETITIONS.has(league)) {
    return clamp([
      { id: "r16", label: "Octavos de final directos", tone: "ucl", startRank: 1, endRank: 8, scope: "league" },
      { id: "ko-playoffs", label: "Playoffs eliminatorios", tone: "uel", startRank: 9, endRank: 24, scope: "league" },
    ]);
  }

  if (capability.sport === "basketball") {
    return clamp([
      { id: "po", label: "Playoffs directos", tone: "ucl", startRank: 1, endRank: 6, scope: "conference" },
      { id: "play-in", label: "Torneo Play-In", tone: "warn", startRank: 7, endRank: 10, scope: "conference" },
    ]);
  }

  if (capability.sport === "ice-hockey") {
    return clamp([
      { id: "po", label: "Clasificación a Playoffs", tone: "ucl", startRank: 1, endRank: 8, scope: "conference" },
    ]);
  }

  if (capability.sport === "american-football") {
    return clamp([
      { id: "po", label: "Clasificación a Playoffs", tone: "ucl", startRank: 1, endRank: 7, scope: "conference" },
    ]);
  }

  if (capability.sport === "baseball") {
    return clamp([
      { id: "div", label: "Líderes divisionales", tone: "ucl", startRank: 1, endRank: 3, scope: "conference" },
      { id: "wc", label: "Comodín (Wild Card)", tone: "uel", startRank: 4, endRank: 6, scope: "conference" },
    ]);
  }

  if (CONMEBOL_CUP_COMPETITIONS.has(league)) {
    return clamp([
      { id: "knockout", label: "Fase eliminatoria", tone: "ucl", startRank: 1, endRank: Math.min(8, totalTeams), scope: "league" },
    ]);
  }

  if (capability.hasRelegationZones && totalTeams >= 12) {
    return clamp([
      { id: "top", label: "Zona continental", tone: "ucl", startRank: 1, endRank: 4, scope: "league" },
      {
        id: "rel",
        label: "Descenso",
        tone: "rel",
        startRank: totalTeams - 2,
        endRank: totalTeams,
        scope: "league",
      },
    ]);
  }

  return [];
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

interface KnockoutRoundMeta {
  readonly key: string;
  readonly label: string;
  readonly order: number;
  readonly twoLegged: boolean;
  readonly bestOf: number | null;
}

const FOOTBALL_KNOCKOUT_ROUNDS: Readonly<Record<string, KnockoutRoundMeta>> = {
  play_in: { key: "play_in", label: "Play-In", order: 10, twoLegged: false, bestOf: 1 },
  knockout_playoffs: {
    key: "knockout_playoffs",
    label: "Playoffs eliminatorios",
    order: 15,
    twoLegged: true,
    bestOf: null,
  },
  round_of_16: {
    key: "round_of_16",
    label: "Octavos de final",
    order: 20,
    twoLegged: true,
    bestOf: null,
  },
  quarterfinals: {
    key: "quarterfinals",
    label: "Cuartos de final",
    order: 30,
    twoLegged: true,
    bestOf: null,
  },
  semifinals: {
    key: "semifinals",
    label: "Semifinales",
    order: 40,
    twoLegged: true,
    bestOf: null,
  },
  final: {
    key: "final",
    label: "Final",
    order: 50,
    twoLegged: false,
    bestOf: 1,
  },
};

const US_BEST_OF_SERIES_SPORTS: ReadonlySet<PlatformSport> = new Set([
  "baseball",
  "basketball",
  "ice-hockey",
]);

const EXCLUDED_KNOCKOUT_TERMS: readonly string[] = [
  "qualification",
  "clasificacion",
  "league phase",
  "fase final",
  "fase de grupos",
  "group stage",
  "temporada regular",
  "regular season",
  "preseason",
  "pretemporada",
  "spring training",
  "jornada",
  "semana",
  "third place",
  "tercer puesto",
  "tercer lugar",
];

const FINAL_STAGE_RE =
  /^(?:gran\s+)?final(?:\s+(?:ida|vuelta))?$|^serie\s+mundial$|^finals?$|^super\s+bowl$|^stanley\s+cup\s+finals?$/;

function normalizeKnockoutLabel(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function buildNormalizedStageParts(
  roundRaw: string | null,
  stageRaw: string | null,
): { readonly parts: readonly string[]; readonly combined: string } | null {
  const stageNorm = normalizeKnockoutLabel(stageRaw);
  const roundNorm = normalizeKnockoutLabel(roundRaw);
  const parts: string[] = [];
  if (stageNorm) parts.push(stageNorm);
  if (roundNorm && roundNorm !== stageNorm) parts.push(roundNorm);
  if (parts.length === 0) return null;
  const combined = parts.join(" ");
  for (const term of EXCLUDED_KNOCKOUT_TERMS) {
    if (combined.includes(term)) return null;
  }
  return { parts, combined };
}

function classifyKnockoutStageKey(
  league: ProductLeague,
  roundRaw: string | null,
  stageRaw: string | null,
  hasLeaguePhaseMatches: boolean,
): KnockoutRoundMeta | null {
  const normalized = buildNormalizedStageParts(roundRaw, stageRaw);
  if (!normalized) return null;
  const { parts, combined } = normalized;

  if (/\bplay[-\s]?in\b/.test(combined)) {
    return FOOTBALL_KNOCKOUT_ROUNDS.play_in!;
  }
  if (
    /\bround of 16\b|\boctavos\b|\bcomodines\b|\bwild\s*card\b/.test(combined)
  ) {
    return FOOTBALL_KNOCKOUT_ROUNDS.round_of_16!;
  }
  if (
    /\bquarter[-\s]?final|\bcuartos\b|\bserie divisional\b/.test(combined)
  ) {
    return FOOTBALL_KNOCKOUT_ROUNDS.quarterfinals!;
  }
  if (
    /\bsemi[-\s]?final|\bserie de campeonato\b/.test(combined)
  ) {
    return FOOTBALL_KNOCKOUT_ROUNDS.semifinals!;
  }
  if (parts.some((part) => FINAL_STAGE_RE.test(part)) || FINAL_STAGE_RE.test(combined)) {
    const isTwoLegged = league === "liga-mx";
    return {
      ...FOOTBALL_KNOCKOUT_ROUNDS.final!,
      twoLegged: isTwoLegged,
      bestOf: isTwoLegged ? null : FOOTBALL_KNOCKOUT_ROUNDS.final!.bestOf,
    };
  }
  if (
    !hasLeaguePhaseMatches &&
    /\bplayoff\s*round\b|\bronda.*playoff\b|\bknockout.*playoff\b/.test(combined)
  ) {
    return FOOTBALL_KNOCKOUT_ROUNDS.knockout_playoffs!;
  }
  return null;
}

function classifyUsSeriesStageKey(
  sport: PlatformSport,
  roundRaw: string | null,
  stageRaw: string | null,
): KnockoutRoundMeta | null {
  const normalized = buildNormalizedStageParts(roundRaw, stageRaw);
  if (!normalized) return null;
  const { parts, combined } = normalized;

  if (/\bplay[-\s]?in\b/.test(combined)) {
    return {
      key: "play_in",
      label: "Play-In",
      order: 10,
      twoLegged: false,
      bestOf: 1,
    };
  }

  if (sport === "baseball") {
    if (/\bcomodines\b|\bwild\s*card\b/.test(combined)) {
      return {
        key: "round_of_16",
        label: "Serie de Comodines",
        order: 20,
        twoLegged: false,
        bestOf: 3,
      };
    }
    if (
      /\bserie\s+divisional\b|\bdivision\s+series\b|\b(?:alds|nlds)\b|\bquarter[-\s]?final|\bcuartos\b/.test(
        combined,
      )
    ) {
      return {
        key: "quarterfinals",
        label: "Serie Divisional",
        order: 30,
        twoLegged: false,
        bestOf: 5,
      };
    }
    if (
      /\bserie\s+de\s+campeonato\b|\bchampionship\s+series\b|\b(?:alcs|nlcs)\b|\bsemi[-\s]?final/.test(
        combined,
      )
    ) {
      return {
        key: "semifinals",
        label: "Serie de Campeonato",
        order: 40,
        twoLegged: false,
        bestOf: 7,
      };
    }
    if (
      parts.some((part) => FINAL_STAGE_RE.test(part) || /^world\s+series$/.test(part)) ||
      FINAL_STAGE_RE.test(combined) ||
      /^world\s+series$/.test(combined)
    ) {
      return {
        key: "final",
        label: "Serie Mundial",
        order: 50,
        twoLegged: false,
        bestOf: 7,
      };
    }
    return null;
  }

  if (
    /\b(?:first|1st)\s+round\b|\bprimera\s+ronda\b|\bround\s+of\s+16\b|\boctavos\b|\bwild\s*card\b|\bcomodines\b/.test(
      combined,
    )
  ) {
    return {
      key: "first_round",
      label: "Primera ronda",
      order: 20,
      twoLegged: false,
      bestOf: 7,
    };
  }
  if (
    /\b(?:conference|conferencia)\s+semi|\bsemifinal(?:es)?\s+de\s+conferencia\b|\b(?:second|2nd)\s+round\b|\bsegunda\s+ronda\b|\bquarter[-\s]?final|\bcuartos\b/.test(
      combined,
    )
  ) {
    return {
      key: "quarterfinals",
      label: "Semifinales de conferencia",
      order: 30,
      twoLegged: false,
      bestOf: 7,
    };
  }
  if (
    /\b(?:conference|conferencia)\s+final|\bfinal(?:es)?\s+de\s+conferencia\b|\bsemi[-\s]?final/.test(
      combined,
    )
  ) {
    return {
      key: "semifinals",
      label: "Finales de conferencia",
      order: 40,
      twoLegged: false,
      bestOf: 7,
    };
  }
  if (
    parts.some((part) => FINAL_STAGE_RE.test(part) || /^nba\s+finals?$/.test(part)) ||
    FINAL_STAGE_RE.test(combined) ||
    /^nba\s+finals?$/.test(combined)
  ) {
    return {
      key: "final",
      label: sport === "ice-hockey" ? "Final de la Stanley Cup" : "Finales NBA",
      order: 50,
      twoLegged: false,
      bestOf: 7,
    };
  }
  return null;
}

function slotFromStanding(row: StandingsSplitRow, seedOverride?: number): BracketTeamSlot {
  return {
    teamId: row.teamId,
    teamSlug: row.teamSlug,
    name: row.name,
    shortName: row.shortName,
    code: row.code,
    seed: seedOverride ?? row.seed ?? row.rank,
    conference: row.conference,
    gamesBehind: row.gamesBehind,
    teamHref: row.teamHref,
    placeholder: null,
  };
}

function slotFromMeta(
  league: ProductLeague,
  meta: TeamMetaRecord,
  seed: number | null,
): BracketTeamSlot {
  return {
    teamId: meta.teamId,
    teamSlug: meta.teamSlug,
    name: meta.name,
    shortName: meta.shortName,
    code: meta.code,
    seed: seed ?? meta.snapshotSeed,
    conference: meta.conference,
    gamesBehind: meta.snapshotGamesBehind,
    teamHref: canonicalTeamHref(league, meta.teamSlug),
    placeholder: null,
  };
}

function placeholderSlot(label: string, conference: string | null = null): BracketTeamSlot {
  return {
    teamId: null,
    teamSlug: null,
    name: label,
    shortName: label,
    code: "TBD",
    seed: null,
    conference,
    gamesBehind: null,
    teamHref: null,
    placeholder: label,
  };
}

function projectedTie(input: {
  readonly id: string;
  readonly roundKey: string;
  readonly conference?: string | null;
  readonly slotIndex: number;
  readonly teamA: BracketTeamSlot;
  readonly teamB: BracketTeamSlot;
  readonly bestOf: number | null;
  readonly note?: string | null;
}): BracketTie {
  return {
    id: input.id,
    roundKey: input.roundKey,
    conference: input.conference ?? null,
    slotIndex: input.slotIndex,
    teamA: input.teamA,
    teamB: input.teamB,
    aggregateA: null,
    aggregateB: null,
    penaltiesA: null,
    penaltiesB: null,
    seriesWinsA: null,
    seriesWinsB: null,
    bestOf: input.bestOf,
    legs: [],
    status: "projected",
    winnerSide: null,
    winnerTeamSlug: null,
    note: input.note ?? null,
  };
}

function buildActiveFootballBracket(
  league: ProductLeague,
  snapshot: LeagueSnapshot | null,
  registry: Map<string, TeamMetaRecord>,
  allMatches: readonly UnifiedMatchRecord[],
  capability: LeagueCapabilityContract,
): LeagueKnockoutBracketPayload | null {
  const hasLeaguePhaseMatches =
    UEFA_LEAGUE_PHASE_COMPETITIONS.has(league) &&
    allMatches.some((m) => `${m.round ?? ""} ${m.stageName ?? ""}`.toLowerCase().includes("league phase"));

  const matchesByRound = new Map<string, { meta: KnockoutRoundMeta; matches: UnifiedMatchRecord[] }>();
  for (const match of allMatches) {
    const stageMeta = classifyKnockoutStageKey(
      league,
      match.round,
      match.stageName,
      hasLeaguePhaseMatches,
    );
    if (!stageMeta) continue;
    let bucket = matchesByRound.get(stageMeta.key);
    if (!bucket) {
      bucket = { meta: stageMeta, matches: [] };
      matchesByRound.set(stageMeta.key, bucket);
    }
    bucket.matches.push(match);
  }

  if (matchesByRound.size === 0) return null;

  const sortedRounds = Array.from(matchesByRound.values()).sort(
    (a, b) => a.meta.order - b.meta.order,
  );

  const teamsInNextRoundByKey = new Map<string, Set<string>>();
  for (let idx = 0; idx < sortedRounds.length - 1; idx += 1) {
    const currentKey = sortedRounds[idx]!.meta.key;
    const nextMatches = sortedRounds[idx + 1]!.matches;
    const nextTeams = new Set<string>();
    for (const m of nextMatches) {
      nextTeams.add(canonicalSlug(m.homeSlug));
      nextTeams.add(canonicalSlug(m.awaySlug));
    }
    teamsInNextRoundByKey.set(currentKey, nextTeams);
  }

  const regularSeasonRankByCanon = new Map<string, number>();
  if (league === "liga-mx") {
    const regularSplits = buildLeagueStandingsSplits("liga-mx");
    for (const row of regularSplits?.total ?? []) {
      regularSeasonRankByCanon.set(canonicalSlug(row.teamSlug), row.rank);
    }
  }

  const rounds: BracketRound[] = sortedRounds.map((bucket) => {
    const grouped = new Map<string, UnifiedMatchRecord[]>();
    for (const m of bucket.matches) {
      const hCanon = canonicalSlug(m.homeSlug);
      const aCanon = canonicalSlug(m.awaySlug);
      const pairKey = hCanon < aCanon ? `${hCanon}|${aCanon}` : `${aCanon}|${hCanon}`;
      const list = grouped.get(pairKey) ?? [];
      list.push(m);
      grouped.set(pairKey, list);
    }

    const nextRoundTeams = teamsInNextRoundByKey.get(bucket.meta.key) ?? new Set<string>();
    const pairs = Array.from(grouped.values()).sort((a, b) =>
      a[0]!.dateIso.localeCompare(b[0]!.dateIso),
    );

    const ties: BracketTie[] = pairs.map((legMatches, slotIdx) => {
      legMatches.sort((a, b) => a.dateIso.localeCompare(b.dateIso));
      const firstLeg = legMatches[0]!;
      const metaA = resolveOrCreateTeamMeta(league, registry, firstLeg.homeTeamId);
      const metaB = resolveOrCreateTeamMeta(league, registry, firstLeg.awayTeamId);
      const canonA = canonicalSlug(metaA.teamSlug);
      const canonB = canonicalSlug(metaB.teamSlug);

      let aggregateA = 0;
      let aggregateB = 0;
      let finishedLegs = 0;
      let inProgressLegs = 0;
      let penaltiesA: number | null = null;
      let penaltiesB: number | null = null;

      const legs: BracketLegDetail[] = legMatches.slice(0, 2).map((leg, idx) => {
        const legNumber: 1 | 2 = idx === 0 ? 1 : 2;
        const legHomeIsA = canonicalSlug(leg.homeSlug) === canonA;
        if (leg.status === "FT" && leg.homeScore !== null && leg.awayScore !== null) {
          finishedLegs += 1;
          if (legHomeIsA) {
            aggregateA += leg.homeScore;
            aggregateB += leg.awayScore;
          } else {
            aggregateA += leg.awayScore;
            aggregateB += leg.homeScore;
          }
        } else if (leg.status === "LIVE") {
          inProgressLegs += 1;
        }
        if (leg.penaltyShootout) {
          if (legHomeIsA) {
            penaltiesA = leg.penaltyShootout.home;
            penaltiesB = leg.penaltyShootout.away;
          } else {
            penaltiesA = leg.penaltyShootout.away;
            penaltiesB = leg.penaltyShootout.home;
          }
        }

        return {
          legNumber,
          matchSlug: leg.matchSlug,
          dateIso: leg.dateIso,
          status: leg.status,
          homeTeamSlug: leg.homeSlug,
          awayTeamSlug: leg.awaySlug,
          homeScore: leg.homeScore,
          awayScore: leg.awayScore,
          extraTimeScore: leg.extraTimeScore,
          penaltyShootout: leg.penaltyShootout,
          href: leg.href,
        };
      });

      const expectedLegs = bucket.meta.twoLegged ? 2 : 1;
      const allKnownLegsFinished = finishedLegs === legs.length && legs.length > 0;
      const hasAdvancementProof =
        nextRoundTeams.has(canonA) !== nextRoundTeams.has(canonB);
      const isDecided =
        (allKnownLegsFinished && legs.length >= expectedLegs) ||
        (allKnownLegsFinished && hasAdvancementProof) ||
        (allKnownLegsFinished && penaltiesA !== null && penaltiesB !== null);

      let winnerSide: "A" | "B" | null = null;
      let tiebreakBySeed = false;
      if (isDecided) {
        if (aggregateA > aggregateB) {
          winnerSide = "A";
        } else if (aggregateB > aggregateA) {
          winnerSide = "B";
        } else if (penaltiesA !== null && penaltiesB !== null && penaltiesA !== penaltiesB) {
          winnerSide = penaltiesA > penaltiesB ? "A" : "B";
        } else if (nextRoundTeams.has(canonA) && !nextRoundTeams.has(canonB)) {
          winnerSide = "A";
        } else if (nextRoundTeams.has(canonB) && !nextRoundTeams.has(canonA)) {
          winnerSide = "B";
        } else if (
          league === "liga-mx" &&
          bucket.meta.key !== "final" &&
          bucket.meta.twoLegged &&
          legs.length >= expectedLegs
        ) {
          const rankA = regularSeasonRankByCanon.get(canonA) ?? null;
          const rankB = regularSeasonRankByCanon.get(canonB) ?? null;
          if (rankA !== null && rankB !== null && rankA !== rankB) {
            winnerSide = rankA < rankB ? "A" : "B";
            tiebreakBySeed = true;
          }
        }
      }

      const resolvedDecided = isDecided && winnerSide !== null;
      const status: BracketTie["status"] =
        inProgressLegs > 0
          ? "in_progress"
          : resolvedDecided
            ? "decided"
            : finishedLegs > 0
              ? "in_progress"
              : "scheduled";

      const note =
        penaltiesA !== null && penaltiesB !== null
          ? `Definida en penales (${penaltiesA}-${penaltiesB})`
          : tiebreakBySeed
            ? "Avanza por mejor posición en tabla general"
            : legs.length === 2
              ? "Serie a ida y vuelta"
              : legs.length === 1 && !bucket.meta.twoLegged
                ? "Partido único"
                : null;

      return {
        id: `${league}:${bucket.meta.key}:${slotIdx + 1}`,
        roundKey: bucket.meta.key,
        conference: null,
        slotIndex: slotIdx + 1,
        teamA: slotFromMeta(league, metaA, null),
        teamB: slotFromMeta(league, metaB, null),
        aggregateA: finishedLegs > 0 ? aggregateA : null,
        aggregateB: finishedLegs > 0 ? aggregateB : null,
        penaltiesA,
        penaltiesB,
        seriesWinsA: null,
        seriesWinsB: null,
        bestOf: bucket.meta.bestOf,
        legs,
        status,
        winnerSide,
        winnerTeamSlug:
          winnerSide === "A" ? metaA.teamSlug : winnerSide === "B" ? metaB.teamSlug : null,
        note,
      };
    });

    return {
      key: bucket.meta.key,
      label: bucket.meta.label,
      order: bucket.meta.order,
      twoLegged: bucket.meta.twoLegged,
      bestOf: bucket.meta.bestOf,
      ties,
    };
  });

  const finalRound = rounds.find((r) => r.key === "final") ?? null;
  const finalsTie = finalRound?.ties[0] ?? null;
  const championSlot =
    finalsTie?.winnerSide === "A"
      ? finalsTie.teamA
      : finalsTie?.winnerSide === "B"
        ? finalsTie.teamB
        : null;

  const format: BracketFormat =
    league === "liga-mx"
      ? "liga_mx_liguilla"
      : UEFA_LEAGUE_PHASE_COMPETITIONS.has(league)
        ? "uefa_knockout"
        : CONMEBOL_CUP_COMPETITIONS.has(league)
          ? "conmebol_knockout"
          : "generic_knockout";

  return {
    league,
    leagueLabel: LEAGUE_LABELS[league] ?? league,
    sport: capability.sport,
    season: snapshot?.seasonLabel ?? "2026",
    updatedAt: snapshot?.updatedAt ?? new Date().toISOString(),
    mode: "active_knockout",
    format,
    hasRelegationZones: capability.hasRelegationZones,
    rounds,
    conferences: [],
    finalsTie,
    championSlug: championSlot?.teamSlug ?? null,
    championName: championSlot?.name ?? null,
  };
}

function buildActiveUsSeriesBracket(
  league: ProductLeague,
  snapshot: LeagueSnapshot | null,
  registry: Map<string, TeamMetaRecord>,
  allMatches: readonly UnifiedMatchRecord[],
  capability: LeagueCapabilityContract,
): LeagueKnockoutBracketPayload | null {
  const matchesByRound = new Map<string, { meta: KnockoutRoundMeta; matches: UnifiedMatchRecord[] }>();
  for (const match of allMatches) {
    const stageMeta = classifyUsSeriesStageKey(
      capability.sport,
      match.round,
      match.stageName,
    );
    if (!stageMeta) continue;
    let bucket = matchesByRound.get(stageMeta.key);
    if (!bucket) {
      bucket = { meta: stageMeta, matches: [] };
      matchesByRound.set(stageMeta.key, bucket);
    }
    bucket.matches.push(match);
  }

  if (matchesByRound.size === 0) return null;

  const sortedRounds = Array.from(matchesByRound.values()).sort(
    (a, b) => a.meta.order - b.meta.order,
  );

  const teamsInNextRoundByKey = new Map<string, Set<string>>();
  for (let idx = 0; idx < sortedRounds.length - 1; idx += 1) {
    const currentKey = sortedRounds[idx]!.meta.key;
    const nextMatches = sortedRounds[idx + 1]!.matches;
    const nextTeams = new Set<string>();
    for (const m of nextMatches) {
      nextTeams.add(canonicalSlug(m.homeSlug));
      nextTeams.add(canonicalSlug(m.awaySlug));
    }
    teamsInNextRoundByKey.set(currentKey, nextTeams);
  }

  const rounds: BracketRound[] = sortedRounds.map((bucket) => {
    const grouped = new Map<string, UnifiedMatchRecord[]>();
    for (const m of bucket.matches) {
      const hCanon = canonicalSlug(m.homeSlug);
      const aCanon = canonicalSlug(m.awaySlug);
      const pairKey = hCanon < aCanon ? `${hCanon}|${aCanon}` : `${aCanon}|${hCanon}`;
      const list = grouped.get(pairKey) ?? [];
      list.push(m);
      grouped.set(pairKey, list);
    }

    for (const list of grouped.values()) {
      list.sort((a, b) => a.dateIso.localeCompare(b.dateIso));
    }

    const nextRoundTeams = teamsInNextRoundByKey.get(bucket.meta.key) ?? new Set<string>();
    const pairs = Array.from(grouped.values()).sort((a, b) =>
      a[0]!.dateIso.localeCompare(b[0]!.dateIso),
    );
    const bestOf = bucket.meta.bestOf ?? 7;
    const winsToClinch = Math.floor(bestOf / 2) + 1;

    const ties: BracketTie[] = pairs.map((seriesMatches, slotIdx) => {
      const firstGame = seriesMatches[0]!;
      const metaA = resolveOrCreateTeamMeta(league, registry, firstGame.homeTeamId);
      const metaB = resolveOrCreateTeamMeta(league, registry, firstGame.awayTeamId);
      const canonA = canonicalSlug(metaA.teamSlug);
      const canonB = canonicalSlug(metaB.teamSlug);

      let seriesWinsA = 0;
      let seriesWinsB = 0;
      let finishedGames = 0;
      let inProgressGames = 0;

      const legs: BracketLegDetail[] = seriesMatches.map((game, idx) => {
        const legHomeIsA = canonicalSlug(game.homeSlug) === canonA;
        if (game.status === "FT" && game.homeScore !== null && game.awayScore !== null) {
          finishedGames += 1;
          const scoreA = legHomeIsA ? game.homeScore : game.awayScore;
          const scoreB = legHomeIsA ? game.awayScore : game.homeScore;
          if (scoreA > scoreB) {
            seriesWinsA += 1;
          } else if (scoreB > scoreA) {
            seriesWinsB += 1;
          }
        } else if (game.status === "LIVE") {
          inProgressGames += 1;
        }

        return {
          legNumber: idx + 1,
          matchSlug: game.matchSlug,
          dateIso: game.dateIso,
          status: game.status,
          homeTeamSlug: game.homeSlug,
          awayTeamSlug: game.awaySlug,
          homeScore: game.homeScore,
          awayScore: game.awayScore,
          extraTimeScore: game.extraTimeScore,
          penaltyShootout: game.penaltyShootout,
          href: game.href,
        };
      });

      const allKnownGamesFinished = finishedGames === legs.length && legs.length > 0;
      const hasClinched = seriesWinsA >= winsToClinch || seriesWinsB >= winsToClinch;
      const hasAdvancementProof =
        nextRoundTeams.has(canonA) !== nextRoundTeams.has(canonB);
      const isDecided =
        hasClinched || (allKnownGamesFinished && hasAdvancementProof);

      let winnerSide: "A" | "B" | null = null;
      if (isDecided) {
        if (hasClinched) {
          if (seriesWinsA > seriesWinsB) {
            winnerSide = "A";
          } else if (seriesWinsB > seriesWinsA) {
            winnerSide = "B";
          }
        } else if (nextRoundTeams.has(canonA) && !nextRoundTeams.has(canonB)) {
          winnerSide = "A";
        } else if (nextRoundTeams.has(canonB) && !nextRoundTeams.has(canonA)) {
          winnerSide = "B";
        } else if (seriesWinsA > seriesWinsB) {
          winnerSide = "A";
        } else if (seriesWinsB > seriesWinsA) {
          winnerSide = "B";
        }
      }

      const resolvedDecided = isDecided && winnerSide !== null;
      const status: BracketTie["status"] =
        inProgressGames > 0 && !hasClinched
          ? "in_progress"
          : resolvedDecided
            ? "decided"
            : finishedGames > 0
              ? "in_progress"
              : "scheduled";

      const note =
        bestOf === 1
          ? "Partido único"
          : resolvedDecided && finishedGames > 0
            ? `Serie al mejor de ${bestOf} (${seriesWinsA}-${seriesWinsB})`
            : `Al mejor de ${bestOf} partidos`;

      const sharedConference =
        metaA.conference && metaA.conference === metaB.conference ? metaA.conference : null;

      return {
        id: `${league}:${bucket.meta.key}:${slotIdx + 1}`,
        roundKey: bucket.meta.key,
        conference: sharedConference,
        slotIndex: slotIdx + 1,
        teamA: slotFromMeta(league, metaA, null),
        teamB: slotFromMeta(league, metaB, null),
        aggregateA: null,
        aggregateB: null,
        penaltiesA: null,
        penaltiesB: null,
        seriesWinsA: finishedGames > 0 ? seriesWinsA : null,
        seriesWinsB: finishedGames > 0 ? seriesWinsB : null,
        bestOf,
        legs,
        status,
        winnerSide,
        winnerTeamSlug:
          winnerSide === "A" ? metaA.teamSlug : winnerSide === "B" ? metaB.teamSlug : null,
        note,
      };
    });

    return {
      key: bucket.meta.key,
      label: bucket.meta.label,
      order: bucket.meta.order,
      twoLegged: false,
      bestOf,
      ties,
    };
  });

  const finalRound = rounds.find((r) => r.key === "final") ?? null;
  const finalsTie = finalRound?.ties[0] ?? null;
  const championSlot =
    finalsTie?.winnerSide === "A"
      ? finalsTie.teamA
      : finalsTie?.winnerSide === "B"
        ? finalsTie.teamB
        : null;

  const format: BracketFormat = league === "nba" ? "nba_playoffs" : "generic_knockout";

  return {
    league,
    leagueLabel: LEAGUE_LABELS[league] ?? league,
    sport: capability.sport,
    season: snapshot?.seasonLabel ?? "2026",
    updatedAt: snapshot?.updatedAt ?? new Date().toISOString(),
    mode: "active_knockout",
    format,
    hasRelegationZones: capability.hasRelegationZones,
    rounds,
    conferences: [],
    finalsTie,
    championSlug: championSlot?.teamSlug ?? null,
    championName: championSlot?.name ?? null,
  };
}

function buildProjectedLigaMxBracket(
  splits: LeagueStandingsSplitsPayload,
): LeagueKnockoutBracketPayload | null {
  if (splits.total.length < 10) return null;
  const seed = (pos: number): BracketTeamSlot => slotFromStanding(splits.total[pos - 1]!, pos);

  const playInTies: BracketTie[] = [
    projectedTie({
      id: "liga-mx:play_in:1",
      roundKey: "play_in",
      slotIndex: 1,
      teamA: seed(7),
      teamB: seed(8),
      bestOf: 1,
      note: "Ganador avanza como 7.º a Cuartos; perdedor juega repechaje final",
    }),
    projectedTie({
      id: "liga-mx:play_in:2",
      roundKey: "play_in",
      slotIndex: 2,
      teamA: seed(9),
      teamB: seed(10),
      bestOf: 1,
      note: "Ganador avanza al juego decisivo por el 8.º lugar",
    }),
    projectedTie({
      id: "liga-mx:play_in:3",
      roundKey: "play_in",
      slotIndex: 3,
      teamA: placeholderSlot("Perdedor 7.º vs 8.º"),
      teamB: placeholderSlot("Ganador 9.º vs 10.º"),
      bestOf: 1,
      note: "Ganador entra como 8.º sembrado a Cuartos de final",
    }),
  ];

  const qfTies: BracketTie[] = [
    projectedTie({
      id: "liga-mx:quarterfinals:1",
      roundKey: "quarterfinals",
      slotIndex: 1,
      teamA: seed(1),
      teamB: placeholderSlot("Ganador Play-In (8.º)"),
      bestOf: null,
      note: "Serie a ida y vuelta",
    }),
    projectedTie({
      id: "liga-mx:quarterfinals:2",
      roundKey: "quarterfinals",
      slotIndex: 2,
      teamA: seed(2),
      teamB: placeholderSlot("Ganador Play-In (7.º)"),
      bestOf: null,
      note: "Serie a ida y vuelta",
    }),
    projectedTie({
      id: "liga-mx:quarterfinals:3",
      roundKey: "quarterfinals",
      slotIndex: 3,
      teamA: seed(3),
      teamB: seed(6),
      bestOf: null,
      note: "Serie a ida y vuelta",
    }),
    projectedTie({
      id: "liga-mx:quarterfinals:4",
      roundKey: "quarterfinals",
      slotIndex: 4,
      teamA: seed(4),
      teamB: seed(5),
      bestOf: null,
      note: "Serie a ida y vuelta",
    }),
  ];

  const sfTies: BracketTie[] = [
    projectedTie({
      id: "liga-mx:semifinals:1",
      roundKey: "semifinals",
      slotIndex: 1,
      teamA: placeholderSlot("Ganador Cuartos 1"),
      teamB: placeholderSlot("Ganador Cuartos 4"),
      bestOf: null,
      note: "Serie a ida y vuelta",
    }),
    projectedTie({
      id: "liga-mx:semifinals:2",
      roundKey: "semifinals",
      slotIndex: 2,
      teamA: placeholderSlot("Ganador Cuartos 2"),
      teamB: placeholderSlot("Ganador Cuartos 3"),
      bestOf: null,
      note: "Serie a ida y vuelta",
    }),
  ];

  const finalTie = projectedTie({
    id: "liga-mx:final:1",
    roundKey: "final",
    slotIndex: 1,
    teamA: placeholderSlot("Ganador Semifinal 1"),
    teamB: placeholderSlot("Ganador Semifinal 2"),
    bestOf: null,
    note: "Final a ida y vuelta",
  });

  const rounds: BracketRound[] = [
    { key: "play_in", label: "Play-In", order: 10, twoLegged: false, bestOf: 1, ties: playInTies },
    {
      key: "quarterfinals",
      label: "Cuartos de final",
      order: 20,
      twoLegged: true,
      bestOf: null,
      ties: qfTies,
    },
    {
      key: "semifinals",
      label: "Semifinales",
      order: 30,
      twoLegged: true,
      bestOf: null,
      ties: sfTies,
    },
    {
      key: "final",
      label: "Final",
      order: 40,
      twoLegged: true,
      bestOf: null,
      ties: [finalTie],
    },
  ];

  return {
    league: "liga-mx",
    leagueLabel: splits.leagueLabel,
    sport: "football",
    season: splits.season,
    updatedAt: splits.updatedAt,
    mode: "projected_seeding",
    format: "liga_mx_liguilla",
    hasRelegationZones: false,
    rounds,
    conferences: [],
    finalsTie: finalTie,
    championSlug: null,
    championName: null,
  };
}

function buildProjectedUefaOrCupBracket(
  splits: LeagueStandingsSplitsPayload,
): LeagueKnockoutBracketPayload | null {
  if (splits.total.length < 8) return null;
  const league = splits.league;
  const seed = (pos: number): BracketTeamSlot => slotFromStanding(splits.total[pos - 1]!, pos);
  const rounds: BracketRound[] = [];

  if (splits.total.length >= 24 && UEFA_LEAGUE_PHASE_COMPETITIONS.has(league)) {
    const playoffPairs: Array<readonly [number, number]> = [
      [9, 24],
      [10, 23],
      [11, 22],
      [12, 21],
      [13, 20],
      [14, 19],
      [15, 18],
      [16, 17],
    ];
    rounds.push({
      key: "knockout_playoffs",
      label: "Playoffs eliminatorios",
      order: 15,
      twoLegged: true,
      bestOf: null,
      ties: playoffPairs.map(([a, b], idx) =>
        projectedTie({
          id: `${league}:knockout_playoffs:${idx + 1}`,
          roundKey: "knockout_playoffs",
          slotIndex: idx + 1,
          teamA: seed(a),
          teamB: seed(b),
          bestOf: null,
          note: "Serie a ida y vuelta",
        }),
      ),
    });

    rounds.push({
      key: "round_of_16",
      label: "Octavos de final",
      order: 20,
      twoLegged: true,
      bestOf: null,
      ties: [1, 2, 3, 4, 5, 6, 7, 8].map((topSeed, idx) =>
        projectedTie({
          id: `${league}:round_of_16:${idx + 1}`,
          roundKey: "round_of_16",
          slotIndex: idx + 1,
          teamA: seed(topSeed),
          teamB: placeholderSlot(`Ganador Playoff ${9 - topSeed}`),
          bestOf: null,
          note: "Serie a ida y vuelta",
        }),
      ),
    });
  } else if (splits.total.length >= 16) {
    const pairs: Array<readonly [number, number]> = [
      [1, 16],
      [8, 9],
      [4, 13],
      [5, 12],
      [2, 15],
      [7, 10],
      [3, 14],
      [6, 11],
    ];
    rounds.push({
      key: "round_of_16",
      label: "Octavos de final",
      order: 20,
      twoLegged: true,
      bestOf: null,
      ties: pairs.map(([a, b], idx) =>
        projectedTie({
          id: `${league}:round_of_16:${idx + 1}`,
          roundKey: "round_of_16",
          slotIndex: idx + 1,
          teamA: seed(a),
          teamB: seed(b),
          bestOf: null,
          note: "Serie a ida y vuelta",
        }),
      ),
    });
  }

  const qfTies: BracketTie[] = [1, 2, 3, 4].map((slot) =>
    projectedTie({
      id: `${league}:quarterfinals:${slot}`,
      roundKey: "quarterfinals",
      slotIndex: slot,
      teamA:
        rounds.length > 0
          ? placeholderSlot(`Ganador Octavos ${slot * 2 - 1}`)
          : seed(slot),
      teamB:
        rounds.length > 0
          ? placeholderSlot(`Ganador Octavos ${slot * 2}`)
          : seed(9 - slot),
      bestOf: null,
      note: "Serie a ida y vuelta",
    }),
  );

  const sfTies: BracketTie[] = [1, 2].map((slot) =>
    projectedTie({
      id: `${league}:semifinals:${slot}`,
      roundKey: "semifinals",
      slotIndex: slot,
      teamA: placeholderSlot(`Ganador Cuartos ${slot * 2 - 1}`),
      teamB: placeholderSlot(`Ganador Cuartos ${slot * 2}`),
      bestOf: null,
      note: "Serie a ida y vuelta",
    }),
  );

  const finalTie = projectedTie({
    id: `${league}:final:1`,
    roundKey: "final",
    slotIndex: 1,
    teamA: placeholderSlot("Ganador Semifinal 1"),
    teamB: placeholderSlot("Ganador Semifinal 2"),
    bestOf: 1,
    note: "Final a partido único",
  });

  rounds.push(
    {
      key: "quarterfinals",
      label: "Cuartos de final",
      order: 30,
      twoLegged: true,
      bestOf: null,
      ties: qfTies,
    },
    {
      key: "semifinals",
      label: "Semifinales",
      order: 40,
      twoLegged: true,
      bestOf: null,
      ties: sfTies,
    },
    {
      key: "final",
      label: "Final",
      order: 50,
      twoLegged: false,
      bestOf: 1,
      ties: [finalTie],
    },
  );

  const format: BracketFormat = UEFA_LEAGUE_PHASE_COMPETITIONS.has(league)
    ? "uefa_knockout"
    : CONMEBOL_CUP_COMPETITIONS.has(league)
      ? "conmebol_knockout"
      : "generic_knockout";

  return {
    league,
    leagueLabel: splits.leagueLabel,
    sport: splits.sport,
    season: splits.season,
    updatedAt: splits.updatedAt,
    mode: "projected_seeding",
    format,
    hasRelegationZones: splits.hasRelegationZones,
    rounds,
    conferences: [],
    finalsTie: finalTie,
    championSlug: null,
    championName: null,
  };
}

function buildProjectedNbaBracket(
  snapshot: LeagueSnapshot | null,
  splits: LeagueStandingsSplitsPayload | null,
): LeagueKnockoutBracketPayload | null {
  const conferenceBuckets = new Map<string, BracketTeamSlot[]>();

  if (snapshot?.standings && snapshot.standings.length >= 20) {
    for (const row of snapshot.standings) {
      const conf = row.conference ? sanitizeLabel(row.conference, "") : "";
      if (!conf) continue;
      const slug = cleanTeamRouteSlug(row.teamId);
      const safeName = sanitizeLabel(row.name, humanizeSlug(slug));
      const safeShort = sanitizeLabel(row.shortName, safeName);
      const safeCode = sanitizeLabel(row.code, slug.slice(0, 3).toUpperCase());
      const list = conferenceBuckets.get(conf) ?? [];
      list.push({
        teamId: `nba.${slug}`,
        teamSlug: slug,
        name: safeName,
        shortName: safeShort,
        code: safeCode,
        seed: row.seed ?? null,
        conference: conf,
        gamesBehind: row.gamesBehind ?? null,
        teamHref: canonicalTeamHref("nba", slug),
        placeholder: null,
      });
      conferenceBuckets.set(conf, list);
    }
  } else if (splits && splits.total.length >= 20) {
    for (const row of splits.total) {
      if (!row.conference) continue;
      const list = conferenceBuckets.get(row.conference) ?? [];
      list.push(slotFromStanding(row));
      conferenceBuckets.set(row.conference, list);
    }
  }

  const orderedConfNames = Array.from(conferenceBuckets.keys()).sort((a, b) => {
    if (a === "Este") return -1;
    if (b === "Este") return 1;
    if (a === "Oeste") return -1;
    if (b === "Oeste") return 1;
    return a.localeCompare(b, "es-MX");
  });

  if (orderedConfNames.length < 2) return null;

  const conferences: BracketConferenceSection[] = [];
  const allPlayIn: BracketTie[] = [];
  const allFirstRound: BracketTie[] = [];
  const allConfSemis: BracketTie[] = [];
  const allConfFinals: BracketTie[] = [];

  for (const confName of orderedConfNames) {
    const rawSlots = (conferenceBuckets.get(confName) ?? [])
      .slice()
      .sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99));
    if (rawSlots.length < 10) return null;

    const confKey = cleanTeamRouteSlug(confName);
    const seed = (pos: number): BracketTeamSlot => ({
      ...rawSlots[pos - 1]!,
      seed: rawSlots[pos - 1]!.seed ?? pos,
    });

    const playIn: BracketTie[] = [
      projectedTie({
        id: `nba:${confKey}:play_in:1`,
        roundKey: "play_in",
        conference: confName,
        slotIndex: 1,
        teamA: seed(7),
        teamB: seed(8),
        bestOf: 1,
        note: "Ganador entra como sembrado #7",
      }),
      projectedTie({
        id: `nba:${confKey}:play_in:2`,
        roundKey: "play_in",
        conference: confName,
        slotIndex: 2,
        teamA: seed(9),
        teamB: seed(10),
        bestOf: 1,
        note: "Juego de eliminación directa",
      }),
      projectedTie({
        id: `nba:${confKey}:play_in:3`,
        roundKey: "play_in",
        conference: confName,
        slotIndex: 3,
        teamA: placeholderSlot(`Perdedor 7.º vs 8.º (${confName})`, confName),
        teamB: placeholderSlot(`Ganador 9.º vs 10.º (${confName})`, confName),
        bestOf: 1,
        note: "Ganador entra como sembrado #8",
      }),
    ];

    const firstRound: BracketTie[] = [
      projectedTie({
        id: `nba:${confKey}:first_round:1`,
        roundKey: "first_round",
        conference: confName,
        slotIndex: 1,
        teamA: seed(1),
        teamB: placeholderSlot(`Ganador Play-In #8 (${confName})`, confName),
        bestOf: 7,
        note: "Al mejor de 7 partidos",
      }),
      projectedTie({
        id: `nba:${confKey}:first_round:2`,
        roundKey: "first_round",
        conference: confName,
        slotIndex: 2,
        teamA: seed(4),
        teamB: seed(5),
        bestOf: 7,
        note: "Al mejor de 7 partidos",
      }),
      projectedTie({
        id: `nba:${confKey}:first_round:3`,
        roundKey: "first_round",
        conference: confName,
        slotIndex: 3,
        teamA: seed(3),
        teamB: seed(6),
        bestOf: 7,
        note: "Al mejor de 7 partidos",
      }),
      projectedTie({
        id: `nba:${confKey}:first_round:4`,
        roundKey: "first_round",
        conference: confName,
        slotIndex: 4,
        teamA: seed(2),
        teamB: placeholderSlot(`Ganador Play-In #7 (${confName})`, confName),
        bestOf: 7,
        note: "Al mejor de 7 partidos",
      }),
    ];

    const confSemis: BracketTie[] = [
      projectedTie({
        id: `nba:${confKey}:conf_semifinals:1`,
        roundKey: "conf_semifinals",
        conference: confName,
        slotIndex: 1,
        teamA: placeholderSlot(`Ganador 1 vs 8 (${confName})`, confName),
        teamB: placeholderSlot(`Ganador 4 vs 5 (${confName})`, confName),
        bestOf: 7,
        note: "Al mejor de 7 partidos",
      }),
      projectedTie({
        id: `nba:${confKey}:conf_semifinals:2`,
        roundKey: "conf_semifinals",
        conference: confName,
        slotIndex: 2,
        teamA: placeholderSlot(`Ganador 3 vs 6 (${confName})`, confName),
        teamB: placeholderSlot(`Ganador 2 vs 7 (${confName})`, confName),
        bestOf: 7,
        note: "Al mejor de 7 partidos",
      }),
    ];

    const confFinal: BracketTie[] = [
      projectedTie({
        id: `nba:${confKey}:conf_finals:1`,
        roundKey: "conf_finals",
        conference: confName,
        slotIndex: 1,
        teamA: placeholderSlot(`Ganador Semifinal 1 (${confName})`, confName),
        teamB: placeholderSlot(`Ganador Semifinal 2 (${confName})`, confName),
        bestOf: 7,
        note: "Al mejor de 7 partidos",
      }),
    ];

    allPlayIn.push(...playIn);
    allFirstRound.push(...firstRound);
    allConfSemis.push(...confSemis);
    allConfFinals.push(...confFinal);

    conferences.push({
      conference: confName,
      label: `Conferencia ${confName}`,
      playIn,
      rounds: [
        {
          key: "first_round",
          label: "Primera ronda",
          order: 20,
          twoLegged: false,
          bestOf: 7,
          ties: firstRound,
        },
        {
          key: "conf_semifinals",
          label: "Semifinales de conferencia",
          order: 30,
          twoLegged: false,
          bestOf: 7,
          ties: confSemis,
        },
        {
          key: "conf_finals",
          label: "Final de conferencia",
          order: 40,
          twoLegged: false,
          bestOf: 7,
          ties: confFinal,
        },
      ],
    });
  }

  const finalsTie = projectedTie({
    id: "nba:finals:1",
    roundKey: "finals",
    conference: null,
    slotIndex: 1,
    teamA: placeholderSlot(`Campeón Conferencia ${orderedConfNames[0]!}`, orderedConfNames[0]!),
    teamB: placeholderSlot(`Campeón Conferencia ${orderedConfNames[1]!}`, orderedConfNames[1]!),
    bestOf: 7,
    note: "Finales NBA al mejor de 7 partidos",
  });

  const rounds: BracketRound[] = [
    { key: "play_in", label: "Torneo Play-In", order: 10, twoLegged: false, bestOf: 1, ties: allPlayIn },
    {
      key: "first_round",
      label: "Primera ronda",
      order: 20,
      twoLegged: false,
      bestOf: 7,
      ties: allFirstRound,
    },
    {
      key: "conf_semifinals",
      label: "Semifinales de conferencia",
      order: 30,
      twoLegged: false,
      bestOf: 7,
      ties: allConfSemis,
    },
    {
      key: "conf_finals",
      label: "Finales de conferencia",
      order: 40,
      twoLegged: false,
      bestOf: 7,
      ties: allConfFinals,
    },
    {
      key: "finals",
      label: "Finales NBA",
      order: 50,
      twoLegged: false,
      bestOf: 7,
      ties: [finalsTie],
    },
  ];

  return {
    league: "nba",
    leagueLabel: LEAGUE_LABELS.nba ?? "NBA",
    sport: "basketball",
    season: snapshot?.seasonLabel ?? splits?.season ?? "2026-27",
    updatedAt: snapshot?.updatedAt ?? splits?.updatedAt ?? new Date().toISOString(),
    mode: "projected_seeding",
    format: "nba_playoffs",
    hasRelegationZones: false,
    rounds,
    conferences,
    finalsTie,
    championSlug: null,
    championName: null,
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
  let payload: LeagueKnockoutBracketPayload | null = null;

  if (US_BEST_OF_SERIES_SPORTS.has(capability.sport)) {
    const activeSeries = buildActiveUsSeriesBracket(
      normalized,
      snapshot,
      registry,
      allMatches,
      capability,
    );
    if (activeSeries) {
      payload = activeSeries;
    } else if (normalized === "nba") {
      const splits = buildLeagueStandingsSplits("nba");
      payload = buildProjectedNbaBracket(snapshot, splits);
    }
  } else {
    const active = buildActiveFootballBracket(
      normalized,
      snapshot,
      registry,
      allMatches,
      capability,
    );
    if (active) {
      payload = active;
    } else if (normalized === "liga-mx") {
      const splits = buildLeagueStandingsSplits("liga-mx");
      payload = splits ? buildProjectedLigaMxBracket(splits) : null;
    } else if (capability.hasStandingsTable && sportHasDraw(capability.sport)) {
      const splits = buildLeagueStandingsSplits(normalized);
      payload = splits ? buildProjectedUefaOrCupBracket(splits) : null;
    }
  }

  bracketCache.set(normalized, { key: cacheKey, payload });
  return payload;
}
