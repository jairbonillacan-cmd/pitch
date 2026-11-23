import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  canonicalGameHref,
  canonicalGameSlug,
  canonicalPlayerHref,
  cleanTeamRouteSlug,
  getLeagueCapability,
  isSafePublicLabel,
  LeagueSquadsFileSchema,
  parseCanonicalPublicSlug,
  type LeagueSquadsFile,
  type TeamSquadEntry,
} from "@pitchlab/contracts";
import {
  LEAGUE_LABELS,
  PRODUCT_LEAGUES,
  resolveSnapshotsRoot,
  type ProductLeague,
} from "./snapshots";
import {
  resolveOfficialPriorServerV6,
  type ResolvedOfficialPriorV6,
} from "./spacetime-v6";

export const REFEREE_EB_KAPPA = 15;
export const MAX_REFEREE_RECENT_MATCHES = 20;
export const MAX_REFEREE_SEARCH_LIMIT = 40;
const DEFAULT_REFEREE_SEARCH_LIMIT = 12;
const DEFAULT_BOOKABLE_PLAYERS_LIMIT = 12;
const MIN_BOOKABLE_APPEARANCES = 3;
const MIN_LEAGUE_REFS_FOR_EMPIRICAL_PRIOR = 3;
const DEFAULT_PRIOR_YELLOW = 4.15;
const DEFAULT_PRIOR_RED = 0.21;
const DEFAULT_PRIOR_PENALTIES = 0.28;
const MAX_DATED_SNAPSHOTS_PER_LEAGUE = 16;
const DIRECTORY_TTL_MS = 5 * 60 * 1000;

export type RefereeProfileTier = "estricto" | "promedio" | "permisivo";

export interface RefereeOfficialPriorSummary {
  readonly source: "historial_verificado" | "base_competicion";
  readonly historicalGames: number;
  readonly yellowMultiplier: number;
  readonly redMultiplier: number;
  readonly foulsMultiplier: number;
  readonly bookingPointsExpected: number | null;
  readonly pRedCardOver05: number | null;
  readonly pBookingPointsOver355: number | null;
  readonly pBookingPointsOver455: number | null;
  readonly pBookingPointsOver555: number | null;
}

export interface RefereeOfficialPriorLookup {
  readonly league: ProductLeague;
  readonly sport: string;
  readonly refereeName: string | null;
  readonly source: "historial_verificado" | "base_competicion" | "neutral_us";
  readonly historicalGames: number;
  readonly yellowMultiplier: number;
  readonly redMultiplier: number;
  readonly foulsMultiplier: number;
  readonly yellowRatePrior: number | null;
  readonly redCardRatePrior: number | null;
  readonly foulsRatePrior: number | null;
  readonly bookingPointsExpected: number | null;
  readonly pRedCardOver05: number | null;
  readonly pBookingPointsOver355: number | null;
  readonly pBookingPointsOver455: number | null;
  readonly pBookingPointsOver555: number | null;
}

export interface RefereeLastMatchSummary {
  readonly matchSlug: string;
  readonly league: ProductLeague;
  readonly leagueLabel: string;
  readonly dateIso: string;
  readonly dateLabel: string;
  readonly round: string | null;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly homeSlug: string;
  readonly awaySlug: string;
  readonly score: { readonly home: number; readonly away: number } | null;
  readonly status: "NS" | "LIVE" | "FT";
  readonly href: string;
}

export interface RefereeNextAssignment {
  readonly matchSlug: string;
  readonly league: ProductLeague;
  readonly leagueLabel: string;
  readonly kickoffUtc: string;
  readonly dateLabel: string;
  readonly round: string | null;
  readonly venue: string | null;
  readonly homeTeam: string;
  readonly homeSlug: string;
  readonly awayTeam: string;
  readonly awaySlug: string;
  readonly status: "NS" | "LIVE";
  readonly href: string;
}

export interface LeagueRefereeRankingItem {
  readonly slug: string;
  readonly name: string;
  readonly country: string | null;
  readonly league: ProductLeague;
  readonly leagueLabel: string;
  readonly href: string;
  readonly matches: number;
  readonly sampleGamesObserved: number;
  readonly avgYellow: number | null;
  readonly ebYellow: number | null;
  readonly avgRed: number | null;
  readonly ebRed: number | null;
  readonly avgPenalties: number | null;
  readonly ebPenalties: number | null;
  readonly avgFouls: number | null;
  readonly avgGoals: number | null;
  readonly leagueMeanYellow: number;
  readonly leagueMeanRed: number;
  readonly leagueMeanPenalties: number;
  readonly tier: RefereeProfileTier;
  readonly tierLabel: string;
  readonly rigorPercentile: number;
  readonly rank: number;
  readonly totalInLeague: number;
  readonly lastMatch: RefereeLastMatchSummary | null;
  readonly nextAssignment: RefereeNextAssignment | null;
  readonly officialPrior?: RefereeOfficialPriorSummary | null;
}

export interface LeagueRefereeRankingResponse {
  readonly league: ProductLeague;
  readonly leagueLabel: string;
  readonly season: string;
  readonly updatedAt: string;
  readonly kappa: number;
  readonly leagueMeanYellow: number;
  readonly leagueMeanRed: number;
  readonly leagueMeanPenalties: number;
  readonly totalReferees: number;
  readonly referees: readonly LeagueRefereeRankingItem[];
}

export interface RefereeCompetitionBreakdownItem {
  readonly league: ProductLeague;
  readonly leagueLabel: string;
  readonly matchesObserved: number;
  readonly sampleMatches: number;
  readonly avgYellow: number | null;
  readonly ebYellow: number | null;
  readonly avgRed: number | null;
  readonly ebRed: number | null;
  readonly avgPenalties: number | null;
  readonly ebPenalties: number | null;
  readonly avgFouls: number | null;
  readonly avgGoals: number | null;
  readonly tier: RefereeProfileTier;
  readonly tierLabel: string;
  readonly rankInLeague: number | null;
  readonly totalInLeague: number;
}

export interface RefereeBookablePlayer {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly shortName: string;
  readonly teamSlug: string;
  readonly teamName: string;
  readonly side: "home" | "away";
  readonly positionGroup: "GK" | "DEF" | "MID" | "FWD";
  readonly positionLabel: string;
  readonly appearances: number;
  readonly yellowCards: number;
  readonly redCards: number;
  readonly foulsCommitted: number;
  readonly yellowsPerMatch: number;
  readonly foulsPerMatch: number;
  readonly disciplineScore: number;
  readonly href: string;
}

export interface RefereeProfilePayload {
  readonly slug: string;
  readonly name: string;
  readonly country: string | null;
  readonly primaryLeague: ProductLeague;
  readonly primaryLeagueLabel: string;
  readonly href: string;
  readonly kappa: number;
  readonly matches: number;
  readonly observedMatches: number;
  readonly avgYellow: number | null;
  readonly ebYellow: number | null;
  readonly avgRed: number | null;
  readonly ebRed: number | null;
  readonly avgPenalties: number | null;
  readonly ebPenalties: number | null;
  readonly avgFouls: number | null;
  readonly avgGoals: number | null;
  readonly leagueMeanYellow: number;
  readonly leagueMeanRed: number;
  readonly leagueMeanPenalties: number;
  readonly tier: RefereeProfileTier;
  readonly tierLabel: string;
  readonly rigorPercentile: number;
  readonly rankInPrimaryLeague: number | null;
  readonly totalInPrimaryLeague: number;
  readonly recentMatches: readonly RefereeLastMatchSummary[];
  readonly competitionBreakdown: readonly RefereeCompetitionBreakdownItem[];
  readonly nextAssignment: RefereeNextAssignment | null;
  readonly bookablePlayers: readonly RefereeBookablePlayer[];
  readonly officialPrior?: RefereeOfficialPriorSummary | null;
}

export interface RefereeSearchHit {
  readonly slug: string;
  readonly name: string;
  readonly country: string | null;
  readonly league: ProductLeague;
  readonly leagueLabel: string;
  readonly competitions: readonly ProductLeague[];
  readonly matches: number;
  readonly avgYellow: number | null;
  readonly ebYellow: number | null;
  readonly avgRed: number | null;
  readonly ebRed: number | null;
  readonly avgPenalties: number | null;
  readonly ebPenalties: number | null;
  readonly tier: RefereeProfileTier;
  readonly tierLabel: string;
  readonly href: string;
  readonly hasNextAssignment: boolean;
}

const RawRefereeStatsSchema = z.object({
  country: z.string().optional(),
  matches: z.number().int().nonnegative().optional(),
  avgYellow: z.number().nonnegative().optional(),
  avgRed: z.number().nonnegative().optional(),
  avgPenalties: z.number().nonnegative().optional(),
  avgFouls: z.number().nonnegative().optional(),
  avgGoals: z.number().nonnegative().optional(),
});

const RawRefereeTeamSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  shortName: z.string().min(1),
});

const RawRefereeGameSchema = z.object({
  id: z.string().min(1),
  round: z.string().optional(),
  startTime: z.string().min(8),
  status: z.enum(["scheduled", "in_progress", "final", "postponed", "canceled"]),
  home: RawRefereeTeamSchema,
  away: RawRefereeTeamSchema,
  venue: z.string().optional(),
  referee: z.string().optional(),
  result: z
    .object({
      home: z.number().int().nonnegative(),
      away: z.number().int().nonnegative(),
    })
    .optional(),
});

const RawRefereeAnalysisSchema = z.object({
  matchContext: z
    .object({
      referee: z.string().optional(),
      refereeStats: RawRefereeStatsSchema.optional(),
    })
    .optional(),
});

const RawRefereeSnapshotSchema = z.object({
  seasonLabel: z.string().optional(),
  updatedAt: z.string().optional(),
  games: z.array(RawRefereeGameSchema),
  analyses: z.record(z.string(), RawRefereeAnalysisSchema).optional(),
});

const RawSeasonResultSchema = z.object({
  id: z.string().optional(),
  date: z.string().min(8),
  startTime: z.string().optional(),
  round: z.string().nullable().optional(),
  homeTeam: z.string().min(1),
  awayTeam: z.string().min(1),
  homeScore: z.number().int().nonnegative(),
  awayScore: z.number().int().nonnegative(),
  referee: z.string().optional(),
});

const RawSeasonResultsFileSchema = z.object({
  matches: z.array(RawSeasonResultSchema),
});

type RawRefereeStats = z.infer<typeof RawRefereeStatsSchema>;

interface ObservedRefereeMatch {
  readonly dedupeKey: string;
  readonly matchSlug: string;
  readonly league: ProductLeague;
  readonly leagueLabel: string;
  readonly dateIso: string;
  readonly dateLabel: string;
  readonly round: string | null;
  readonly venue: string | null;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly homeSlug: string;
  readonly awaySlug: string;
  readonly score: { readonly home: number; readonly away: number } | null;
  readonly status: "NS" | "LIVE" | "FT";
  readonly href: string;
}

interface RefereeLeagueAccumulator {
  name: string;
  slug: string;
  country: string | null;
  league: ProductLeague;
  matches: number;
  avgYellow: number | null;
  avgRed: number | null;
  avgPenalties: number | null;
  avgFouls: number | null;
  avgGoals: number | null;
  gamesByKey: Map<string, ObservedRefereeMatch>;
}

interface CachedRefereeRecord {
  readonly slug: string;
  readonly name: string;
  readonly country: string | null;
  readonly searchName: string;
  readonly searchHaystack: string;
  readonly byLeague: Map<ProductLeague, LeagueRefereeRankingItem>;
  readonly allMatches: readonly ObservedRefereeMatch[];
  readonly primaryLeague: ProductLeague;
}

interface RefereeDirectoryCache {
  readonly root: string;
  readonly builtAtMs: number;
  readonly rankingsByLeague: Map<ProductLeague, LeagueRefereeRankingResponse>;
  readonly profilesBySlug: Map<string, CachedRefereeRecord>;
}

const SLUG_CANONICAL_ALIASES: Readonly<Record<string, string>> = {
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

const PRODUCT_LEAGUE_SET: ReadonlySet<string> = new Set(PRODUCT_LEAGUES);

const DATE_FMT_MX = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  day: "numeric",
  month: "short",
  year: "numeric",
});

let directoryCache: RefereeDirectoryCache | null = null;
const squadsCache = new Map<string, { mtimeMs: number; file: LeagueSquadsFile }>();

export function resetRefereesCacheForTests(): void {
  directoryCache = null;
  squadsCache.clear();
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function toOfficialPriorSummary(
  prior: ResolvedOfficialPriorV6,
): RefereeOfficialPriorSummary | null {
  if (prior.provenance === "non_soccer_umpire_neutral") return null;
  return {
    source:
      prior.provenance === "empirical_tm_verified" ? "historial_verificado" : "base_competicion",
    historicalGames: prior.historicalGames,
    yellowMultiplier: round4(prior.yellowMult),
    redMultiplier: round4(prior.redMult),
    foulsMultiplier: round4(prior.foulsMult),
    bookingPointsExpected:
      prior.bookingPointsExpected !== null ? round2(prior.bookingPointsExpected) : null,
    pRedCardOver05: prior.pRedCardOver05 !== null ? round4(prior.pRedCardOver05) : null,
    pBookingPointsOver355:
      prior.pBookingPointsOver355 !== null ? round4(prior.pBookingPointsOver355) : null,
    pBookingPointsOver455:
      prior.pBookingPointsOver455 !== null ? round4(prior.pBookingPointsOver455) : null,
    pBookingPointsOver555:
      prior.pBookingPointsOver555 !== null ? round4(prior.pBookingPointsOver555) : null,
  };
}

export function resolveRefereeOfficialPrior(
  refereeName: string | null | undefined,
  league: string,
): RefereeOfficialPriorLookup | null {
  const normalizedLeague = league.trim().toLowerCase();
  if (!isProductLeagueKey(normalizedLeague)) return null;
  const safeName = sanitizeOptionalLabel(refereeName);
  const resolved = resolveOfficialPriorServerV6({
    refereeName: safeName,
    league: normalizedLeague,
  });
  return {
    league: normalizedLeague,
    sport: resolved.sport,
    refereeName: safeName,
    source:
      resolved.provenance === "non_soccer_umpire_neutral"
        ? "neutral_us"
        : resolved.provenance === "empirical_tm_verified"
          ? "historial_verificado"
          : "base_competicion",
    historicalGames: resolved.historicalGames,
    yellowMultiplier: round4(resolved.yellowMult),
    redMultiplier: round4(resolved.redMult),
    foulsMultiplier: round4(resolved.foulsMult),
    yellowRatePrior: resolved.yellowRatePrior !== null ? round2(resolved.yellowRatePrior) : null,
    redCardRatePrior:
      resolved.redCardRatePrior !== null ? round2(resolved.redCardRatePrior) : null,
    foulsRatePrior: resolved.foulsRatePrior !== null ? round2(resolved.foulsRatePrior) : null,
    bookingPointsExpected:
      resolved.bookingPointsExpected !== null ? round2(resolved.bookingPointsExpected) : null,
    pRedCardOver05: resolved.pRedCardOver05 !== null ? round4(resolved.pRedCardOver05) : null,
    pBookingPointsOver355:
      resolved.pBookingPointsOver355 !== null ? round4(resolved.pBookingPointsOver355) : null,
    pBookingPointsOver455:
      resolved.pBookingPointsOver455 !== null ? round4(resolved.pBookingPointsOver455) : null,
    pBookingPointsOver555:
      resolved.pBookingPointsOver555 !== null ? round4(resolved.pBookingPointsOver555) : null,
  };
}

function normalizeSearchText(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugifyRefereeName(rawName: string): string {
  const cleaned = rawName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96)
    .replace(/-+$/g, "");
  return cleaned;
}

export function canonicalRefereeHref(league: ProductLeague, refereeSlug: string): string {
  return `/app/${encodeURIComponent(league)}/r/${encodeURIComponent(refereeSlug)}`;
}

export function isProductLeagueKey(value: string): value is ProductLeague {
  return PRODUCT_LEAGUE_SET.has(value);
}

function isFootballRefereeLeague(league: ProductLeague): boolean {
  const capability = getLeagueCapability(league);
  return capability?.providers.referees === true && capability.sport === "football";
}

export function shrinkRefereeMetricEb(
  rawRate: number,
  matches: number,
  leaguePriorMean: number,
  kappa: number = REFEREE_EB_KAPPA,
): number {
  const safePrior =
    Number.isFinite(leaguePriorMean) && leaguePriorMean >= 0
      ? leaguePriorMean
      : DEFAULT_PRIOR_YELLOW;
  if (!Number.isFinite(rawRate) || rawRate < 0) {
    return round2(safePrior);
  }
  const safeMatches = Math.max(0, Number.isFinite(matches) ? matches : 0);
  const safeKappa = Math.max(1, Number.isFinite(kappa) ? kappa : REFEREE_EB_KAPPA);
  const shrunk = (safeMatches * rawRate + safeKappa * safePrior) / (safeMatches + safeKappa);
  return round2(shrunk);
}

export function classifyRefereeProfileTier(
  ebYellow: number | null,
  leagueMeanYellow: number,
  rigorPercentile: number,
  totalInLeague: number,
): { readonly tier: RefereeProfileTier; readonly label: string } {
  if (ebYellow === null || !Number.isFinite(ebYellow)) {
    return { tier: "promedio", label: "Promedio" };
  }
  const delta = ebYellow - leagueMeanYellow;
  if (delta >= 0.25 || (totalInLeague >= 3 && rigorPercentile >= 72)) {
    return { tier: "estricto", label: "Estricto" };
  }
  if (delta <= -0.25 || (totalInLeague >= 3 && rigorPercentile <= 28)) {
    return { tier: "permisivo", label: "Permisivo" };
  }
  return { tier: "promedio", label: "Promedio" };
}

function sanitizeOptionalLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || !isSafePublicLabel(trimmed)) return null;
  return trimmed;
}

function sanitizeTeamLabel(raw: string, fallback: string): string {
  const trimmed = raw.trim();
  if (trimmed && isSafePublicLabel(trimmed)) return trimmed;
  return fallback;
}

function formatDateLabelEs(dateIso: string): string {
  const ms = Date.parse(dateIso);
  if (!Number.isFinite(ms)) return dateIso.slice(0, 10);
  return DATE_FMT_MX.format(new Date(ms));
}

function teamSlugFromId(teamId: string): string {
  return cleanTeamRouteSlug(teamId);
}

function canonicalTeamAlias(rawSlugOrId: string): string {
  const slug = cleanTeamRouteSlug(rawSlugOrId);
  return SLUG_CANONICAL_ALIASES[slug] ?? slug;
}

function normalizeIsoUtc(raw: string): string {
  const trimmed = raw.trim();
  const ms = Date.parse(trimmed);
  if (Number.isFinite(ms)) {
    return new Date(ms).toISOString();
  }
  const withUtc = Date.parse(`${trimmed}Z`);
  if (Number.isFinite(withUtc)) {
    return new Date(withUtc).toISOString();
  }
  return trimmed;
}

function weightedLeaguePrior(
  rows: ReadonlyArray<{ readonly value: number | null; readonly matches: number }>,
  fallback: number,
): number {
  let weightedSum = 0;
  let weightTotal = 0;
  let validCount = 0;
  for (const row of rows) {
    if (row.value !== null && Number.isFinite(row.value) && row.value >= 0) {
      const weight = Math.max(1, row.matches);
      weightedSum += row.value * weight;
      weightTotal += weight;
      validCount += 1;
    }
  }
  if (validCount < MIN_LEAGUE_REFS_FOR_EMPIRICAL_PRIOR || weightTotal <= 0) {
    return fallback;
  }
  return round2(weightedSum / weightTotal);
}

function loadSeasonResultsScoreIndex(
  root: string,
  league: ProductLeague,
): Map<string, { readonly home: number; readonly away: number }> {
  const index = new Map<string, { readonly home: number; readonly away: number }>();
  const filePath = path.join(root, league, "season-results.json");
  if (!fs.existsSync(filePath)) return index;
  try {
    const parsed = RawSeasonResultsFileSchema.safeParse(
      JSON.parse(fs.readFileSync(filePath, "utf8")),
    );
    if (!parsed.success) return index;
    for (const m of parsed.data.matches) {
      const day = m.date.slice(0, 10);
      const hSlug = canonicalTeamAlias(m.homeTeam);
      const aSlug = canonicalTeamAlias(m.awayTeam);
      const score = { home: m.homeScore, away: m.awayScore };
      index.set(`${day}|${hSlug}|${aSlug}`, score);
      if (m.id) {
        index.set(m.id, score);
      }
    }
  } catch (err) {
    void err;
  }
  return index;
}

function listLeagueSnapshotFiles(root: string, league: ProductLeague): string[] {
  const dir = path.join(root, league);
  if (!fs.existsSync(dir)) return [];
  const files: string[] = [];
  try {
    const entries = fs.readdirSync(dir);
    const dated = entries
      .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
      .sort()
      .slice(-MAX_DATED_SNAPSHOTS_PER_LEAGUE);
    for (const name of dated) {
      files.push(path.join(dir, name));
    }
    const latestPath = path.join(dir, "latest.json");
    if (fs.existsSync(latestPath)) {
      files.push(latestPath);
    }
  } catch (err) {
    void err;
  }
  return files;
}

function mergeStats(
  target: RefereeLeagueAccumulator,
  stats: RawRefereeStats | undefined,
): void {
  if (!stats) return;
  const incomingMatches = stats.matches ?? 0;
  const shouldReplace = incomingMatches >= target.matches;
  if (shouldReplace) {
    target.matches = Math.max(target.matches, incomingMatches);
    const safeCountry = sanitizeOptionalLabel(stats.country);
    if (safeCountry) target.country = safeCountry;
    if (stats.avgYellow !== undefined) target.avgYellow = round2(stats.avgYellow);
    if (stats.avgRed !== undefined) target.avgRed = round2(stats.avgRed);
    if (stats.avgPenalties !== undefined) target.avgPenalties = round2(stats.avgPenalties);
    if (stats.avgFouls !== undefined) target.avgFouls = round2(stats.avgFouls);
    if (stats.avgGoals !== undefined) target.avgGoals = round2(stats.avgGoals);
    return;
  }
  if (!target.country) {
    const safeCountry = sanitizeOptionalLabel(stats.country);
    if (safeCountry) target.country = safeCountry;
  }
  if (target.avgYellow === null && stats.avgYellow !== undefined) {
    target.avgYellow = round2(stats.avgYellow);
  }
  if (target.avgRed === null && stats.avgRed !== undefined) {
    target.avgRed = round2(stats.avgRed);
  }
  if (target.avgPenalties === null && stats.avgPenalties !== undefined) {
    target.avgPenalties = round2(stats.avgPenalties);
  }
  if (target.avgFouls === null && stats.avgFouls !== undefined) {
    target.avgFouls = round2(stats.avgFouls);
  }
  if (target.avgGoals === null && stats.avgGoals !== undefined) {
    target.avgGoals = round2(stats.avgGoals);
  }
}

function toLastMatchSummary(match: ObservedRefereeMatch): RefereeLastMatchSummary {
  return {
    matchSlug: match.matchSlug,
    league: match.league,
    leagueLabel: match.leagueLabel,
    dateIso: match.dateIso,
    dateLabel: match.dateLabel,
    round: match.round,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    homeSlug: match.homeSlug,
    awaySlug: match.awaySlug,
    score: match.score,
    status: match.status,
    href: match.href,
  };
}

function toNextAssignment(match: ObservedRefereeMatch): RefereeNextAssignment | null {
  if (match.status === "FT") return null;
  return {
    matchSlug: match.matchSlug,
    league: match.league,
    leagueLabel: match.leagueLabel,
    kickoffUtc: match.dateIso,
    dateLabel: match.dateLabel,
    round: match.round,
    venue: match.venue,
    homeTeam: match.homeTeam,
    homeSlug: match.homeSlug,
    awayTeam: match.awayTeam,
    awaySlug: match.awaySlug,
    status: match.status,
    href: match.href,
  };
}

function pickLastAndNext(matches: readonly ObservedRefereeMatch[]): {
  readonly lastMatch: RefereeLastMatchSummary | null;
  readonly nextAssignment: RefereeNextAssignment | null;
} {
  const finished = matches
    .filter((m) => m.status === "FT")
    .sort((a, b) => b.dateIso.localeCompare(a.dateIso));
  const upcoming = matches
    .filter((m) => m.status === "LIVE" || m.status === "NS")
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "LIVE" ? -1 : 1;
      return a.dateIso.localeCompare(b.dateIso);
    });
  return {
    lastMatch: finished[0] ? toLastMatchSummary(finished[0]) : null,
    nextAssignment: upcoming[0] ? toNextAssignment(upcoming[0]) : null,
  };
}

function buildLeagueRefereeData(
  root: string,
  league: ProductLeague,
): {
  readonly ranking: LeagueRefereeRankingResponse;
  readonly matchesBySlug: Map<string, ObservedRefereeMatch[]>;
} | null {
  const files = listLeagueSnapshotFiles(root, league);
  if (files.length === 0) return null;

  const scoreIndex = loadSeasonResultsScoreIndex(root, league);
  const accumulators = new Map<string, RefereeLeagueAccumulator>();
  const leagueLabel = LEAGUE_LABELS[league] ?? league;
  let season = "2026";
  let updatedAt = "";

  for (const filePath of files) {
    try {
      const parsed = RawRefereeSnapshotSchema.safeParse(
        JSON.parse(fs.readFileSync(filePath, "utf8")),
      );
      if (!parsed.success) continue;
      const snap = parsed.data;
      if (snap.seasonLabel) season = snap.seasonLabel;
      if (snap.updatedAt && snap.updatedAt > updatedAt) updatedAt = snap.updatedAt;

      for (const game of snap.games) {
        if (game.status === "canceled" || game.status === "postponed") continue;
        const analysis = snap.analyses?.[game.id];
        const rawRefName = (game.referee ?? analysis?.matchContext?.referee ?? "").trim();
        if (!rawRefName || !isSafePublicLabel(rawRefName)) continue;
        const refSlug = slugifyRefereeName(rawRefName);
        if (!refSlug || !parseCanonicalPublicSlug(refSlug)) continue;

        const homeSlug = teamSlugFromId(game.home.id);
        const awaySlug = teamSlugFromId(game.away.id);
        const dateIso = normalizeIsoUtc(game.startTime);
        const dayKey = dateIso.slice(0, 10);
        const dedupeKey = `${league}|${dayKey}|${canonicalTeamAlias(homeSlug)}|${canonicalTeamAlias(awaySlug)}`;

        const seasonScore =
          scoreIndex.get(game.id) ??
          scoreIndex.get(`${dayKey}|${canonicalTeamAlias(homeSlug)}|${canonicalTeamAlias(awaySlug)}`) ??
          null;
        const resolvedScore = game.result
          ? { home: game.result.home, away: game.result.away }
          : seasonScore;
        const resolvedStatus: "NS" | "LIVE" | "FT" =
          game.status === "final" || resolvedScore !== null
            ? "FT"
            : game.status === "in_progress"
              ? "LIVE"
              : "NS";

        const homeTeam = sanitizeTeamLabel(game.home.shortName, homeSlug);
        const awayTeam = sanitizeTeamLabel(game.away.shortName, awaySlug);
        const urlGame = {
          id: game.id,
          league,
          home: { slug: homeSlug, shortName: homeTeam, name: homeTeam },
          away: { slug: awaySlug, shortName: awayTeam, name: awayTeam },
        };
        const matchSlug = canonicalGameSlug(urlGame);
        const href = canonicalGameHref(league, urlGame);

        const observedMatch: ObservedRefereeMatch = {
          dedupeKey,
          matchSlug,
          league,
          leagueLabel,
          dateIso,
          dateLabel: formatDateLabelEs(dateIso),
          round: sanitizeOptionalLabel(game.round),
          venue: sanitizeOptionalLabel(game.venue),
          homeTeam,
          awayTeam,
          homeSlug,
          awaySlug,
          score: resolvedScore,
          status: resolvedStatus,
          href,
        };

        let acc = accumulators.get(refSlug);
        if (!acc) {
          acc = {
            name: rawRefName,
            slug: refSlug,
            country: null,
            league,
            matches: 0,
            avgYellow: null,
            avgRed: null,
            avgPenalties: null,
            avgFouls: null,
            avgGoals: null,
            gamesByKey: new Map(),
          };
          accumulators.set(refSlug, acc);
        }
        mergeStats(acc, analysis?.matchContext?.refereeStats);

        const prevMatch = acc.gamesByKey.get(dedupeKey);
        if (!prevMatch || prevMatch.status !== "FT" || observedMatch.status === "FT") {
          acc.gamesByKey.set(dedupeKey, observedMatch);
        }
      }
    } catch (err) {
      void err;
    }
  }

  const accList = Array.from(accumulators.values());
  if (accList.length === 0) return null;

  const priorBySlug = new Map<string, ResolvedOfficialPriorV6>();
  for (const acc of accList) {
    const resolvedPrior = resolveOfficialPriorServerV6({ refereeName: acc.name, league });
    priorBySlug.set(acc.slug, resolvedPrior);
    if (
      acc.avgYellow === null &&
      resolvedPrior.provenance === "empirical_tm_verified" &&
      resolvedPrior.historicalGames > 0 &&
      resolvedPrior.yellowRatePrior !== null
    ) {
      acc.avgYellow = round2(resolvedPrior.yellowRatePrior);
      acc.matches = Math.max(acc.matches, resolvedPrior.historicalGames);
      if (acc.avgRed === null && resolvedPrior.redCardRatePrior !== null) {
        acc.avgRed = round2(resolvedPrior.redCardRatePrior);
      }
      if (acc.avgFouls === null && resolvedPrior.foulsRatePrior !== null) {
        acc.avgFouls = round2(resolvedPrior.foulsRatePrior);
      }
    }
  }

  const leagueOfficialPrior = resolveOfficialPriorServerV6({ league });
  const fallbackPriorYellow =
    leagueOfficialPrior.yellowRatePrior !== null
      ? round2(leagueOfficialPrior.yellowRatePrior)
      : DEFAULT_PRIOR_YELLOW;
  const fallbackPriorRed =
    leagueOfficialPrior.redCardRatePrior !== null
      ? round2(leagueOfficialPrior.redCardRatePrior)
      : DEFAULT_PRIOR_RED;

  const leagueMeanYellow = weightedLeaguePrior(
    accList.map((a) => ({ value: a.avgYellow, matches: a.matches })),
    fallbackPriorYellow,
  );
  const leagueMeanRed = weightedLeaguePrior(
    accList.map((a) => ({ value: a.avgRed, matches: a.matches })),
    fallbackPriorRed,
  );
  const leagueMeanPenalties = weightedLeaguePrior(
    accList.map((a) => ({ value: a.avgPenalties, matches: a.matches })),
    DEFAULT_PRIOR_PENALTIES,
  );

  const scored = accList.map((acc) => {
    const observedMatches = Array.from(acc.gamesByKey.values());
    const effectiveSample = acc.matches > 0 ? acc.matches : observedMatches.length;
    const ebYellow =
      acc.avgYellow !== null
        ? shrinkRefereeMetricEb(acc.avgYellow, effectiveSample, leagueMeanYellow, REFEREE_EB_KAPPA)
        : null;
    const ebRed =
      acc.avgRed !== null
        ? shrinkRefereeMetricEb(acc.avgRed, effectiveSample, leagueMeanRed, REFEREE_EB_KAPPA)
        : null;
    const ebPenalties =
      acc.avgPenalties !== null
        ? shrinkRefereeMetricEb(
            acc.avgPenalties,
            effectiveSample,
            leagueMeanPenalties,
            REFEREE_EB_KAPPA,
          )
        : null;
    return {
      acc,
      observedMatches,
      effectiveSample,
      ebYellow,
      ebRed,
      ebPenalties,
    };
  });

  scored.sort((a, b) => {
    const ay = a.ebYellow ?? -1;
    const by = b.ebYellow ?? -1;
    if (ay !== by) return by - ay;
    const ar = a.ebRed ?? -1;
    const br = b.ebRed ?? -1;
    if (ar !== br) return br - ar;
    if (a.effectiveSample !== b.effectiveSample) return b.effectiveSample - a.effectiveSample;
    return a.acc.name.localeCompare(b.acc.name, "es-MX");
  });

  const total = scored.length;
  const totalWithEbYellow = scored.filter((entry) => entry.ebYellow !== null).length;
  const matchesBySlug = new Map<string, ObservedRefereeMatch[]>();
  let ebRank = 0;
  const referees: LeagueRefereeRankingItem[] = scored.map((entry, idx) => {
    const rank = idx + 1;
    let rigorPercentile = 50;
    if (entry.ebYellow !== null) {
      ebRank += 1;
      rigorPercentile =
        totalWithEbYellow <= 1
          ? 50
          : Math.round(((totalWithEbYellow - ebRank) / (totalWithEbYellow - 1)) * 100);
    }
    const classification = classifyRefereeProfileTier(
      entry.ebYellow,
      leagueMeanYellow,
      rigorPercentile,
      totalWithEbYellow,
    );
    const { lastMatch, nextAssignment } = pickLastAndNext(entry.observedMatches);
    matchesBySlug.set(entry.acc.slug, entry.observedMatches);
    const officialPrior = priorBySlug.get(entry.acc.slug);

    return {
      slug: entry.acc.slug,
      name: entry.acc.name,
      country: entry.acc.country,
      league,
      leagueLabel,
      href: canonicalRefereeHref(league, entry.acc.slug),
      matches: entry.effectiveSample,
      sampleGamesObserved: entry.observedMatches.length,
      avgYellow: entry.acc.avgYellow,
      ebYellow: entry.ebYellow,
      avgRed: entry.acc.avgRed,
      ebRed: entry.ebRed,
      avgPenalties: entry.acc.avgPenalties,
      ebPenalties: entry.ebPenalties,
      avgFouls: entry.acc.avgFouls,
      avgGoals: entry.acc.avgGoals,
      leagueMeanYellow,
      leagueMeanRed,
      leagueMeanPenalties,
      tier: classification.tier,
      tierLabel: classification.label,
      rigorPercentile,
      rank,
      totalInLeague: total,
      lastMatch,
      nextAssignment,
      officialPrior: officialPrior ? toOfficialPriorSummary(officialPrior) : null,
    };
  });

  return {
    ranking: {
      league,
      leagueLabel,
      season,
      updatedAt: updatedAt || new Date().toISOString(),
      kappa: REFEREE_EB_KAPPA,
      leagueMeanYellow,
      leagueMeanRed,
      leagueMeanPenalties,
      totalReferees: referees.length,
      referees,
    },
    matchesBySlug,
  };
}

function getRefereeDirectory(): RefereeDirectoryCache {
  const root = resolveSnapshotsRoot();
  const nowMs = Date.now();
  if (
    directoryCache &&
    directoryCache.root === root &&
    nowMs - directoryCache.builtAtMs < DIRECTORY_TTL_MS
  ) {
    return directoryCache;
  }

  const rankingsByLeague = new Map<ProductLeague, LeagueRefereeRankingResponse>();
  const profileBuilders = new Map<
    string,
    {
      slug: string;
      name: string;
      country: string | null;
      byLeague: Map<ProductLeague, LeagueRefereeRankingItem>;
      allMatchesByKey: Map<string, ObservedRefereeMatch>;
    }
  >();

  for (const league of PRODUCT_LEAGUES) {
    if (!isFootballRefereeLeague(league)) continue;
    const built = buildLeagueRefereeData(root, league);
    if (!built) continue;
    rankingsByLeague.set(league, built.ranking);

    for (const refItem of built.ranking.referees) {
      let builder = profileBuilders.get(refItem.slug);
      if (!builder) {
        builder = {
          slug: refItem.slug,
          name: refItem.name,
          country: refItem.country,
          byLeague: new Map(),
          allMatchesByKey: new Map(),
        };
        profileBuilders.set(refItem.slug, builder);
      }
      if (!builder.country && refItem.country) {
        builder.country = refItem.country;
      }
      builder.byLeague.set(league, refItem);

      for (const match of built.matchesBySlug.get(refItem.slug) ?? []) {
        const existing = builder.allMatchesByKey.get(match.dedupeKey);
        if (!existing || existing.status !== "FT" || match.status === "FT") {
          builder.allMatchesByKey.set(match.dedupeKey, match);
        }
      }
    }
  }

  const profilesBySlug = new Map<string, CachedRefereeRecord>();
  for (const [slug, builder] of profileBuilders.entries()) {
    const leagueItems = Array.from(builder.byLeague.values());
    leagueItems.sort((a, b) => {
      const aHasNext = a.nextAssignment ? 1 : 0;
      const bHasNext = b.nextAssignment ? 1 : 0;
      if (aHasNext !== bHasNext) return bHasNext - aHasNext;
      if (a.sampleGamesObserved !== b.sampleGamesObserved) {
        return b.sampleGamesObserved - a.sampleGamesObserved;
      }
      if (a.matches !== b.matches) return b.matches - a.matches;
      return a.league.localeCompare(b.league);
    });
    const primaryLeague = leagueItems[0]!.league;
    const allMatches = Array.from(builder.allMatchesByKey.values()).sort((a, b) =>
      b.dateIso.localeCompare(a.dateIso),
    );
    const leagueLabels = leagueItems.map((item) => item.leagueLabel).join(" ");
    const searchName = normalizeSearchText(builder.name);
    const searchHaystack = normalizeSearchText(
      `${builder.name} ${builder.country ?? ""} ${leagueLabels}`,
    );

    profilesBySlug.set(slug, {
      slug,
      name: builder.name,
      country: builder.country,
      searchName,
      searchHaystack,
      byLeague: builder.byLeague,
      allMatches,
      primaryLeague,
    });
  }

  directoryCache = {
    root,
    builtAtMs: nowMs,
    rankingsByLeague,
    profilesBySlug,
  };
  return directoryCache;
}

function loadLeagueSquadsCached(league: ProductLeague): LeagueSquadsFile | null {
  const filePath = path.join(resolveSnapshotsRoot(), league, "squads.json");
  if (!fs.existsSync(filePath)) return null;
  let mtimeMs = 0;
  try {
    mtimeMs = fs.statSync(filePath).mtimeMs;
  } catch (err) {
    void err;
    return null;
  }
  const cached = squadsCache.get(filePath);
  if (cached && cached.mtimeMs === mtimeMs) {
    return cached.file;
  }
  try {
    const parsed = LeagueSquadsFileSchema.safeParse(
      JSON.parse(fs.readFileSync(filePath, "utf8")),
    );
    if (!parsed.success) return null;
    squadsCache.set(filePath, { mtimeMs, file: parsed.data });
    return parsed.data;
  } catch (err) {
    void err;
    return null;
  }
}

function findSquadForTeam(
  squads: LeagueSquadsFile,
  teamSlug: string,
): TeamSquadEntry | null {
  const needle = cleanTeamRouteSlug(teamSlug);
  const needleCanon = canonicalTeamAlias(teamSlug);
  for (const team of squads.teams) {
    const tSlug = cleanTeamRouteSlug(team.teamSlug);
    if (tSlug === needle || canonicalTeamAlias(tSlug) === needleCanon) {
      return team;
    }
  }
  return null;
}

function loadBookablePlayersForAssignment(
  assignment: RefereeNextAssignment,
): RefereeBookablePlayer[] {
  const squads = loadLeagueSquadsCached(assignment.league);
  if (!squads) return [];

  const homeSquad = findSquadForTeam(squads, assignment.homeSlug);
  const awaySquad = findSquadForTeam(squads, assignment.awaySlug);
  const sides: Array<{ readonly side: "home" | "away"; readonly squad: TeamSquadEntry }> = [];
  if (homeSquad) sides.push({ side: "home", squad: homeSquad });
  if (awaySquad) sides.push({ side: "away", squad: awaySquad });
  if (sides.length === 0) return [];

  const candidates: RefereeBookablePlayer[] = [];
  for (const { side, squad } of sides) {
    const teamSlug = cleanTeamRouteSlug(squad.teamSlug);
    const teamName = sanitizeTeamLabel(squad.teamName, teamSlug);
    for (const player of squad.players) {
      if (player.stats.appearances < MIN_BOOKABLE_APPEARANCES) continue;
      if (
        player.stats.yellowCards === 0 &&
        player.stats.redCards === 0 &&
        player.stats.foulsCommitted === 0
      ) {
        continue;
      }
      if (!isSafePublicLabel(player.name) || !isSafePublicLabel(player.shortName)) continue;
      const safePositionLabel = sanitizeTeamLabel(player.positionLabel, player.positionGroup);
      const app = player.stats.appearances;
      const yellowsPerMatch = round2(player.stats.yellowCards / app);
      const foulsPerMatch = round2(player.stats.foulsCommitted / app);
      const disciplineScore = round2(
        player.stats.yellowCards * 2.5 +
          player.stats.redCards * 5 +
          player.stats.foulsCommitted * 0.25,
      );

      candidates.push({
        id: `${assignment.league}:${teamSlug}:${player.slug}`,
        slug: player.slug,
        name: player.name,
        shortName: player.shortName,
        teamSlug,
        teamName,
        side,
        positionGroup: player.positionGroup,
        positionLabel: safePositionLabel,
        appearances: app,
        yellowCards: player.stats.yellowCards,
        redCards: player.stats.redCards,
        foulsCommitted: player.stats.foulsCommitted,
        yellowsPerMatch,
        foulsPerMatch,
        disciplineScore,
        href: canonicalPlayerHref(assignment.league, teamSlug, player.slug),
      });
    }
  }

  candidates.sort((a, b) => {
    if (b.yellowCards !== a.yellowCards) return b.yellowCards - a.yellowCards;
    if (b.foulsCommitted !== a.foulsCommitted) return b.foulsCommitted - a.foulsCommitted;
    if (b.redCards !== a.redCards) return b.redCards - a.redCards;
    if (b.yellowsPerMatch !== a.yellowsPerMatch) return b.yellowsPerMatch - a.yellowsPerMatch;
    return a.name.localeCompare(b.name, "es-MX");
  });

  return candidates.slice(0, DEFAULT_BOOKABLE_PLAYERS_LIMIT);
}

export function loadLeagueRefereeRanking(league: string): LeagueRefereeRankingResponse | null {
  const normalized = league.trim().toLowerCase();
  if (!isProductLeagueKey(normalized)) return null;
  if (!isFootballRefereeLeague(normalized)) return null;
  const directory = getRefereeDirectory();
  return directory.rankingsByLeague.get(normalized) ?? null;
}

export function loadRefereeProfile(
  refereeSlug: string,
  leagueHint?: string | null,
): RefereeProfilePayload | null {
  const normalizedSlug = slugifyRefereeName(refereeSlug);
  if (!normalizedSlug) return null;

  const directory = getRefereeDirectory();
  const record = directory.profilesBySlug.get(normalizedSlug);
  if (!record) return null;

  const normalizedHint = leagueHint?.trim().toLowerCase() || null;
  const primaryLeague =
    normalizedHint &&
    isProductLeagueKey(normalizedHint) &&
    record.byLeague.has(normalizedHint)
      ? normalizedHint
      : record.primaryLeague;
  const primaryItem = record.byLeague.get(primaryLeague);
  if (!primaryItem) return null;

  const recentMatches = record.allMatches
    .filter((m) => m.status === "FT" || m.status === "LIVE")
    .sort((a, b) => b.dateIso.localeCompare(a.dateIso))
    .slice(0, MAX_REFEREE_RECENT_MATCHES)
    .map(toLastMatchSummary);

  const upcomingMatches = record.allMatches
    .filter((m) => m.status === "LIVE" || m.status === "NS")
    .sort((a, b) => {
      if (a.league === primaryLeague && b.league !== primaryLeague) return -1;
      if (b.league === primaryLeague && a.league !== primaryLeague) return 1;
      if (a.status !== b.status) return a.status === "LIVE" ? -1 : 1;
      return a.dateIso.localeCompare(b.dateIso);
    });
  const nextAssignment = upcomingMatches[0] ? toNextAssignment(upcomingMatches[0]) : null;
  const bookablePlayers = nextAssignment ? loadBookablePlayersForAssignment(nextAssignment) : [];

  const competitionBreakdown: RefereeCompetitionBreakdownItem[] = Array.from(
    record.byLeague.values(),
  )
    .sort((a, b) => {
      if (a.league === primaryLeague) return -1;
      if (b.league === primaryLeague) return 1;
      if (b.sampleGamesObserved !== a.sampleGamesObserved) {
        return b.sampleGamesObserved - a.sampleGamesObserved;
      }
      return b.matches - a.matches;
    })
    .map((item) => ({
      league: item.league,
      leagueLabel: item.leagueLabel,
      matchesObserved: item.sampleGamesObserved,
      sampleMatches: item.matches,
      avgYellow: item.avgYellow,
      ebYellow: item.ebYellow,
      avgRed: item.avgRed,
      ebRed: item.ebRed,
      avgPenalties: item.avgPenalties,
      ebPenalties: item.ebPenalties,
      avgFouls: item.avgFouls,
      avgGoals: item.avgGoals,
      tier: item.tier,
      tierLabel: item.tierLabel,
      rankInLeague: item.rank,
      totalInLeague: item.totalInLeague,
    }));

  return {
    slug: record.slug,
    name: record.name,
    country: record.country,
    primaryLeague,
    primaryLeagueLabel: primaryItem.leagueLabel,
    href: canonicalRefereeHref(primaryLeague, record.slug),
    kappa: REFEREE_EB_KAPPA,
    matches: primaryItem.matches,
    observedMatches: record.allMatches.length,
    avgYellow: primaryItem.avgYellow,
    ebYellow: primaryItem.ebYellow,
    avgRed: primaryItem.avgRed,
    ebRed: primaryItem.ebRed,
    avgPenalties: primaryItem.avgPenalties,
    ebPenalties: primaryItem.ebPenalties,
    avgFouls: primaryItem.avgFouls,
    avgGoals: primaryItem.avgGoals,
    leagueMeanYellow: primaryItem.leagueMeanYellow,
    leagueMeanRed: primaryItem.leagueMeanRed,
    leagueMeanPenalties: primaryItem.leagueMeanPenalties,
    tier: primaryItem.tier,
    tierLabel: primaryItem.tierLabel,
    rigorPercentile: primaryItem.rigorPercentile,
    rankInPrimaryLeague: primaryItem.rank,
    totalInPrimaryLeague: primaryItem.totalInLeague,
    recentMatches,
    competitionBreakdown,
    nextAssignment,
    bookablePlayers,
    officialPrior: primaryItem.officialPrior ?? null,
  };
}

export function searchRefereesDirectory(
  q: string,
  opts: {
    readonly league?: string | null;
    readonly tier?: RefereeProfileTier | null;
    readonly limit?: number;
  } = {},
): RefereeSearchHit[] {
  const normalizedQuery = normalizeSearchText(q);
  const rawLeague = opts.league?.trim().toLowerCase() || null;
  let leagueFilter: ProductLeague | null = null;
  if (rawLeague !== null) {
    if (!isProductLeagueKey(rawLeague) || !isFootballRefereeLeague(rawLeague)) {
      return [];
    }
    leagueFilter = rawLeague;
  }
  const tierFilter: RefereeProfileTier | null = opts.tier ?? null;
  const requestedLimit = opts.limit ?? DEFAULT_REFEREE_SEARCH_LIMIT;
  const limit = Math.max(
    1,
    Math.min(
      MAX_REFEREE_SEARCH_LIMIT,
      Number.isFinite(requestedLimit) ? Math.round(requestedLimit) : DEFAULT_REFEREE_SEARCH_LIMIT,
    ),
  );

  if (!normalizedQuery && !leagueFilter && !tierFilter) {
    return [];
  }

  const tokens = normalizedQuery ? normalizedQuery.split(" ").filter(Boolean) : [];
  const directory = getRefereeDirectory();
  const scored: Array<{ readonly score: number; readonly hit: RefereeSearchHit }> = [];

  for (const record of directory.profilesBySlug.values()) {
    if (!isSafePublicLabel(record.name)) continue;
    const refItem = leagueFilter
      ? record.byLeague.get(leagueFilter)
      : record.byLeague.get(record.primaryLeague);
    if (!refItem) continue;
    if (tierFilter && refItem.tier !== tierFilter) continue;

    let score = 10;
    if (tokens.length > 0) {
      if (!tokens.every((tok) => record.searchHaystack.includes(tok))) continue;
      if (record.searchName === normalizedQuery) score += 120;
      else if (record.searchName.startsWith(normalizedQuery)) score += 70;
      else if (tokens.every((tok) => record.searchName.includes(tok))) score += 45;
    }

    if (refItem.nextAssignment) score += 15;
    if (refItem.ebYellow !== null) score += Math.min(20, refItem.ebYellow * 2);
    score += Math.min(15, refItem.matches / 5);

    const competitions = Array.from(record.byLeague.keys());
    scored.push({
      score,
      hit: {
        slug: record.slug,
        name: record.name,
        country: record.country,
        league: refItem.league,
        leagueLabel: refItem.leagueLabel,
        competitions,
        matches: refItem.matches,
        avgYellow: refItem.avgYellow,
        ebYellow: refItem.ebYellow,
        avgRed: refItem.avgRed,
        ebRed: refItem.ebRed,
        avgPenalties: refItem.avgPenalties,
        ebPenalties: refItem.ebPenalties,
        tier: refItem.tier,
        tierLabel: refItem.tierLabel,
        href: canonicalRefereeHref(refItem.league, record.slug),
        hasNextAssignment: refItem.nextAssignment !== null,
      },
    });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ay = a.hit.ebYellow ?? -1;
    const by = b.hit.ebYellow ?? -1;
    if (ay !== by) return by - ay;
    return a.hit.name.localeCompare(b.hit.name, "es-MX");
  });

  return scored.slice(0, limit).map((entry) => entry.hit);
}
