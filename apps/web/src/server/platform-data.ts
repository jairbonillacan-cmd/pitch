import fs from "node:fs";
import path from "node:path";
import { cache } from "react";
import { z } from "zod";
import {
  COMPETITION_BY_ID,
  FORBIDDEN_PROVIDER_TOKENS,
  LeagueInjuriesFileSchema,
  LeagueSquadsFileSchema,
  MAX_POSITIVE_DECIMAL_ODDS,
  TIER1_LEAGUE_IDS,
  canonicalGameHref,
  canonicalGameSlug,
  cleanTeamRouteSlug,
  getLeagueCapability,
  isBlockedMarketQuoteBook,
  isPermittedMarketQuoteBook,
  isSafePublicLabel,
  parseCanonicalPublicSlug,
  parseStrictFiniteNumber,
  sportScoringUnit,
  type LeagueSquadsFile,
  type PlatformSport,
  type StandingRow,
  type TeamInjuryEntry,
  type TeamSquadEntry,
} from "@pitchlab/contracts";
import { resolvePersonPhotoUrl } from "@pitchlab/sports-assets";
import { redactDatasetForVisitor } from "@pitchlab/ui/access-guard";
import { ALLOWED_BOOKMAKER_IDS } from "@pitchlab/ui/bookmakers";
import {
  selectPicksOfTheDay,
  type CatalogPickItem,
  type FootballPlayerMatchLog,
  type FootballPlayerPropCandidateInput,
  type GamePreviewPayload,
  type MarketFamilyId,
  type MatchPicksCatalog,
  type NbaPlayerMatchLog,
  type NbaPlayerPropCandidateInput,
  type NbaPlayerPropStatKey,
  type PickLabMatchBar,
  type PickLabResponsePayload,
  type ScreenerApiResponse,
  type TeamMatchEvidenceRecord,
} from "@pitchlab/ui/picks-catalog";
import { buildPlatformDataset, type RawLeagueInput } from "@pitchlab/ui/picks-engine";
import type { ViewerIdentity } from "@pitchlab/ui/platform-provider";
import type {
  MatchIntelligenceV5View,
  MatchOutlookSummary,
  MatchPick,
  PaymentMode,
  PlatformDataset,
  PlatformGame,
  PlatformGameDetail,
  PlatformMarketRow,
  PlayerPropItem,
  ViewerRole,
  ViewerVia,
} from "@pitchlab/ui/types";
import { paymentMode } from "./billing/payment-mode";
import { getViewerAccess } from "./viewer-access";
import { buildSpacetimeSignals, isMarketFresh } from "./spacetime";
import { buildMatchDetailV5 } from "./spacetime-v5";
import { resolveServerFrozenMainPick } from "./frozen-picks";
import { applyOutlook, outlookDetailFor } from "./outlook";
import { logSecurityEvent } from "./safe-logger";
import {
  buildDerivedFootballFallbackRows,
  buildDerivedUsSportRows,
} from "./outlook-derived-rows";
import {
  enrichDatasetWithBookQuotes,
  enrichMarketRowsWithBookQuotes,
} from "./book-quotes";
import { buildServerMatchPicksCatalog } from "./picks-catalog";
import { loadLeagueRefereeRanking, slugifyRefereeName } from "./referees";
import { buildLeagueStandingsSplits } from "./standings-brackets";
import {
  createDb,
  eq,
  FLAG_MONTH1_NO_CARD,
  getBoolFlag,
  publicWeeklyPicks,
  type Db,
} from "@pitchlab/db";
import {
  LEAGUE_LABELS,
  loadAllActiveLeagueSnapshots,
  loadLeagueSnapshotEnvelope,
  PRODUCT_LEAGUES,
  resolveSnapshotsRoot,
  type ProductLeague,
} from "./snapshots";
import {
  buildEnrichedMatchInjuries,
  buildEnrichedMatchLineups,
  buildMatchEnfrentamientos,
  buildMatchPlayerPicks,
} from "./match-enrichment";
import {
  buildTeamsDirectoryFromEnvelopes,
  loadLeaguePlayerProps,
} from "./team-profile";

export { PRODUCT_LEAGUES, type ProductLeague };

export interface LoadedPlatformState {
  dataset: PlatformDataset;
  initialRole: ViewerRole;
  hasActiveSession: boolean;
  allowRoleSimulation: boolean;
  accountsEnabled: boolean;
  viewerVia: ViewerVia;
  paymentMode: PaymentMode;
  serverMonth1NoCardMode?: boolean;
  viewerIdentity: ViewerIdentity | null;
  publicPickResolved?: boolean;
}

export async function loadViewerIdentity(): Promise<ViewerIdentity | null> {
  const { profile } = await getViewerAccess();
  if (!profile?.handle) return null;
  return {
    handle: profile.handle,
    displayName: profile.displayName,
    initials: profile.initials,
    avatarUrl: profile.avatarUrl,
    referralCode: profile.referralCode,
  };
}

let flagDb: Db | null = null;

export async function loadMonth1Flag(): Promise<boolean | undefined> {
  const url = process.env.DATABASE_URL;
  if (!accountsEnabled() || !url) return undefined;
  try {
    flagDb ??= createDb(url);
    return await getBoolFlag(flagDb, FLAG_MONTH1_NO_CARD, true);
  } catch (err) {
    logSecurityEvent("warn", "platform_preview_flag_read_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

export function accountsEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.BETTER_AUTH_SECRET);
}

export function previewToolsEnabled(viewerIsAdmin: boolean = false): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.PITCHLAB_PREVIEW_TOOLS === "1" && viewerIsAdmin;
}

const DATASET_TTL_MS = 5 * 60 * 1000;
const FOOTBALL_STARTER_MIN_MINUTES = 45;
const NBA_STARTER_MIN_MINUTES = 18;
const MAX_SCREENER_PAGE_SIZE = 40;
const DEFAULT_SCREENER_PAGE_SIZE = 16;

interface EnrichedGameMarketsBundle {
  readonly markets: PlatformMarketRow[];
  readonly v5: MatchIntelligenceV5View | null;
  readonly outlook: MatchOutlookSummary | null;
}

interface DatasetMemoBundle {
  value: PlatformDataset;
  gamesById: Map<string, PlatformGame>;
  redactedValue: PlatformDataset | null;
  redactedGamesById: Map<string, PlatformGame> | null;
  slimMemberShell: PlatformDataset | null;
  slimVisitorShell: PlatformDataset | null;
  initialMemberShell: PlatformDataset | null;
  initialVisitorShell: PlatformDataset | null;
  shellPlayerPropsMember: PlayerPropItem[] | null;
  playerPropsByGameId: Map<string, readonly PlayerPropItem[]> | null;
  screenerMemberCatalogsByMaxGames: Map<number, Record<string, MatchPicksCatalog>>;
  screenerVisitorCatalogsByMaxGames: Map<number, Record<string, MatchPicksCatalog>>;
  memberLeagueHubGamesByLeague: Map<string, readonly PlatformGame[]>;
  visitorLeagueHubGamesByLeague: Map<string, readonly PlatformGame[]>;
  standingsByLeague: Map<string, StandingRow[]>;
  teamHistoryIndexByLeague: Map<string, Map<string, readonly CachedTeamHistoryEntry[]>>;
  enrichedMarketsByGameId: Map<string, EnrichedGameMarketsBundle>;
  memberCompactCatalogByGameId: Map<string, MatchPicksCatalog>;
  visitorCompactCatalogByGameId: Map<string, MatchPicksCatalog>;
  memberFullCatalogByGameId: Map<string, MatchPicksCatalog>;
  visitorFullCatalogByGameId: Map<string, MatchPicksCatalog>;
  teamLabelByLeagueAndCanon: Map<string, { readonly slug: string; readonly name: string; readonly shortName: string }>;
  at: number;
}

interface CachedTeamHistoryEntry extends TeamMatchEvidenceRecord {
  readonly id: string;
  readonly dateIso: string;
  readonly leagueLabel: string;
  readonly opponentSlug: string;
  readonly opponentName: string;
  readonly opponentShort: string;
}

interface RawSeasonResultRow {
  readonly id?: string;
  readonly date: string;
  readonly startTime?: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly homeScore: number;
  readonly awayScore: number;
}

const RawSeasonResultsFileSchema = z.object({
  matches: z.array(
    z.object({
      id: z.string().optional(),
      date: z.string().min(8),
      startTime: z.string().optional(),
      homeTeam: z.string().min(1),
      awayTeam: z.string().min(1),
      homeScore: z.number().int().nonnegative(),
      awayScore: z.number().int().nonnegative(),
    }),
  ),
});

const HISTORY_FILENAME_OVERRIDES: Readonly<Record<string, string>> = {
  laliga: "la-liga.jsonl",
  "uefa-nations": "international.jsonl",
  "concacaf-nations": "international.jsonl",
  amistosos: "international.jsonl",
  "copa-del-mundo": "international.jsonl",
  eliminatorias: "international.jsonl",
  "copa-america": "international.jsonl",
  eurocopa: "international.jsonl",
  "copa-oro": "international.jsonl",
  "copa-africana": "international.jsonl",
  "copa-asiatica": "international.jsonl",
};

const TEAM_SLUG_CANONICAL_ALIASES: Readonly<Record<string, string>> = {
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

const SHORT_DATE_MX = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  day: "numeric",
  month: "short",
});

const squadsFileCache = new Map<string, { readonly mtimeMs: number; readonly data: LeagueSquadsFile | null }>();
const injuriesFileCache = new Map<string, { readonly mtimeMs: number; readonly entries: readonly TeamInjuryEntry[] }>();
const rawSeasonResultsCache = new Map<string, { readonly mtimeMs: number; readonly rows: readonly RawSeasonResultRow[] }>();
const rawHistoryJsonlCache = new Map<string, { readonly mtimeMs: number; readonly rows: readonly RawSeasonResultRow[] }>();

function safeStatMtime(filePath: string): number {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch (err) {
    void err;
    return 0;
  }
}

function canonicalTeamSlugKey(rawTeamIdOrSlug: string): string {
  const clean = cleanTeamRouteSlug(rawTeamIdOrSlug);
  return TEAM_SLUG_CANONICAL_ALIASES[clean] ?? clean;
}

function humanizeTeamSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeSearchToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeServerPhotoKey(photoKey?: string | null): string | null {
  const trimmed = photoKey?.trim();
  if (!trimmed || /^https?:\/\//i.test(trimmed)) return null;
  return resolvePersonPhotoUrl(trimmed) ? trimmed : null;
}

function parseStatNumeric(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (!trimmed || trimmed === "-" || trimmed === "—" || trimmed === "--") return null;
  if (trimmed.includes(":")) {
    const parts = trimmed.split(":");
    const mins = parseStrictFiniteNumber(parts[0]);
    const secs = parseStrictFiniteNumber(parts[1] ?? "0");
    if (mins !== null && mins >= 0) {
      return mins + (secs !== null && secs >= 0 ? secs / 60 : 0);
    }
    return null;
  }
  if (trimmed.includes("/")) {
    const first = parseStrictFiniteNumber(trimmed.split("/")[0]);
    return first !== null && first >= 0 ? first : null;
  }
  const parsed = parseStrictFiniteNumber(trimmed.replace(/%$/, ""));
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function formatShortDateMx(iso: string): string {
  const normalized = iso.length === 10 ? `${iso}T18:00:00Z` : iso;
  const ms = Date.parse(normalized);
  if (!Number.isFinite(ms)) return iso.slice(0, 10);
  try {
    return SHORT_DATE_MX.format(ms);
  } catch (err) {
    void err;
    return iso.slice(0, 10);
  }
}

function loadCachedLeagueSquads(league: string): LeagueSquadsFile | null {
  const filePath = path.join(resolveSnapshotsRoot(), league, "squads.json");
  const mtimeMs = safeStatMtime(filePath);
  if (mtimeMs === 0) return null;
  const cached = squadsFileCache.get(filePath);
  if (cached && cached.mtimeMs === mtimeMs) return cached.data;
  try {
    const parsed = LeagueSquadsFileSchema.safeParse(
      JSON.parse(fs.readFileSync(filePath, "utf8")),
    );
    const data = parsed.success ? parsed.data : null;
    squadsFileCache.set(filePath, { mtimeMs, data });
    return data;
  } catch (err) {
    void err;
    squadsFileCache.set(filePath, { mtimeMs, data: null });
    return null;
  }
}

function loadCachedLeagueInjuries(league: string): readonly TeamInjuryEntry[] {
  const filePath = path.join(resolveSnapshotsRoot(), league, "injuries.json");
  const mtimeMs = safeStatMtime(filePath);
  if (mtimeMs === 0) return [];
  const cached = injuriesFileCache.get(filePath);
  if (cached && cached.mtimeMs === mtimeMs) return cached.entries;
  try {
    const parsed = LeagueInjuriesFileSchema.safeParse(
      JSON.parse(fs.readFileSync(filePath, "utf8")),
    );
    const entries = parsed.success ? parsed.data.entries : [];
    injuriesFileCache.set(filePath, { mtimeMs, entries });
    return entries;
  } catch (err) {
    void err;
    injuriesFileCache.set(filePath, { mtimeMs, entries: [] });
    return [];
  }
}

function loadCachedSeasonResultsRows(league: string): readonly RawSeasonResultRow[] {
  const filePath = path.join(resolveSnapshotsRoot(), league, "season-results.json");
  const mtimeMs = safeStatMtime(filePath);
  if (mtimeMs === 0) return [];
  const cached = rawSeasonResultsCache.get(filePath);
  if (cached && cached.mtimeMs === mtimeMs) return cached.rows;
  try {
    const parsed = RawSeasonResultsFileSchema.safeParse(
      JSON.parse(fs.readFileSync(filePath, "utf8")),
    );
    const rows = parsed.success ? parsed.data.matches : [];
    rawSeasonResultsCache.set(filePath, { mtimeMs, rows });
    return rows;
  } catch (err) {
    void err;
    rawSeasonResultsCache.set(filePath, { mtimeMs, rows: [] });
    return [];
  }
}

function loadCachedHistoryJsonlRows(league: string): readonly RawSeasonResultRow[] {
  const filename = HISTORY_FILENAME_OVERRIDES[league] ?? `${league}.jsonl`;
  const historyRoot = path.resolve(resolveSnapshotsRoot(), "..", "history");
  const filePath = path.join(historyRoot, filename);
  const mtimeMs = safeStatMtime(filePath);
  if (mtimeMs === 0) return [];
  const cached = rawHistoryJsonlCache.get(filePath);
  if (cached && cached.mtimeMs === mtimeMs) return cached.rows;
  try {
    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (!raw) {
      rawHistoryJsonlCache.set(filePath, { mtimeMs, rows: [] });
      return [];
    }
    const lines = raw.split(/\r?\n/);
    const tail = lines.slice(-600);
    const rows: RawSeasonResultRow[] = [];
    for (const line of tail) {
      if (!line) continue;
      const obj = JSON.parse(line) as {
        id?: unknown;
        date?: unknown;
        homeTeam?: unknown;
        awayTeam?: unknown;
        homeScore?: unknown;
        awayScore?: unknown;
      };
      if (
        typeof obj.date === "string" &&
        typeof obj.homeTeam === "string" &&
        typeof obj.awayTeam === "string" &&
        typeof obj.homeScore === "number" &&
        Number.isFinite(obj.homeScore) &&
        typeof obj.awayScore === "number" &&
        Number.isFinite(obj.awayScore)
      ) {
        rows.push({
          id: typeof obj.id === "string" ? obj.id : undefined,
          date: obj.date,
          homeTeam: obj.homeTeam,
          awayTeam: obj.awayTeam,
          homeScore: obj.homeScore,
          awayScore: obj.awayScore,
        });
      }
    }
    rawHistoryJsonlCache.set(filePath, { mtimeMs, rows });
    return rows;
  } catch (err) {
    void err;
    rawHistoryJsonlCache.set(filePath, { mtimeMs, rows: [] });
    return [];
  }
}

function buildTeamLabelLookup(
  dataset: PlatformDataset,
): Map<string, { readonly slug: string; readonly name: string; readonly shortName: string }> {
  const map = new Map<string, { readonly slug: string; readonly name: string; readonly shortName: string }>();
  const register = (league: string, slugRaw: string, name: string, shortName: string) => {
    const slug = cleanTeamRouteSlug(slugRaw);
    const canon = canonicalTeamSlugKey(slug);
    const key = `${league}|${canon}`;
    if (!map.has(key)) {
      map.set(key, {
        slug,
        name: isSafePublicLabel(name) ? name.trim() : humanizeTeamSlug(slug),
        shortName: isSafePublicLabel(shortName) ? shortName.trim() : humanizeTeamSlug(slug),
      });
    }
  };
  for (const g of dataset.games) {
    register(g.league, g.home.slug, g.home.name, g.home.shortName);
    register(g.league, g.away.slug, g.away.name, g.away.shortName);
  }
  for (const t of dataset.teams ?? []) {
    register(t.league, t.slug, t.name, t.shortName);
  }
  return map;
}

function getOrBuildLeagueHistoryIndex(
  bundle: DatasetMemoBundle,
  league: string,
): Map<string, readonly CachedTeamHistoryEntry[]> {
  const existing = bundle.teamHistoryIndexByLeague.get(league);
  if (existing) return existing;

  const leagueLabel =
    LEAGUE_LABELS[league as ProductLeague] ??
    COMPETITION_BY_ID[league]?.label ??
    league;
  const dedupByTeam = new Map<string, Map<string, CachedTeamHistoryEntry>>();

  const resolveTeamMeta = (rawTeamId: string) => {
    const slug = cleanTeamRouteSlug(rawTeamId);
    const canon = canonicalTeamSlugKey(slug);
    const known = bundle.teamLabelByLeagueAndCanon.get(`${league}|${canon}`);
    if (known) return known;
    const label = humanizeTeamSlug(slug);
    return { slug, name: label, shortName: label };
  };

  const putEntry = (
    teamCanon: string,
    key: string,
    entry: CachedTeamHistoryEntry,
  ) => {
    let teamMap = dedupByTeam.get(teamCanon);
    if (!teamMap) {
      teamMap = new Map<string, CachedTeamHistoryEntry>();
      dedupByTeam.set(teamCanon, teamMap);
    }
    teamMap.set(key, entry);
  };

  const ingestRow = (row: RawSeasonResultRow) => {
    const homeCanon = canonicalTeamSlugKey(row.homeTeam);
    const awayCanon = canonicalTeamSlugKey(row.awayTeam);
    const dayKey = row.date.slice(0, 10);
    const dateIso = row.startTime ?? `${dayKey}T12:00:00.000Z`;
    const key = `${dayKey}|${homeCanon}|${awayCanon}`;
    const id = `${league}:${dayKey}:${homeCanon}:${awayCanon}`;
    const awayMeta = resolveTeamMeta(row.awayTeam);
    putEntry(homeCanon, key, {
      id,
      dateIso,
      leagueLabel,
      isHome: true,
      opponentSlug: awayMeta.slug,
      opponentName: awayMeta.name,
      opponentShort: awayMeta.shortName,
      goalsFor: row.homeScore,
      goalsAgainst: row.awayScore,
    });
    if (awayCanon !== homeCanon) {
      const homeMeta = resolveTeamMeta(row.homeTeam);
      putEntry(awayCanon, key, {
        id,
        dateIso,
        leagueLabel,
        isHome: false,
        opponentSlug: homeMeta.slug,
        opponentName: homeMeta.name,
        opponentShort: homeMeta.shortName,
        goalsFor: row.awayScore,
        goalsAgainst: row.homeScore,
      });
    }
  };

  for (const row of loadCachedHistoryJsonlRows(league)) {
    ingestRow(row);
  }
  for (const row of loadCachedSeasonResultsRows(league)) {
    ingestRow(row);
  }
  for (const g of bundle.value.games) {
    if (g.league !== league || g.status !== "FT" || !g.score) continue;
    ingestRow({
      id: g.id,
      date: g.dayId || g.kickoffUtc.slice(0, 10),
      startTime: g.kickoffUtc,
      homeTeam: g.home.slug,
      awayTeam: g.away.slug,
      homeScore: g.score.home,
      awayScore: g.score.away,
    });
  }

  const sortedByTeam = new Map<string, readonly CachedTeamHistoryEntry[]>();
  for (const [teamCanon, entries] of dedupByTeam.entries()) {
    sortedByTeam.set(
      teamCanon,
      Array.from(entries.values()).sort((a, b) => b.dateIso.localeCompare(a.dateIso)),
    );
  }
  bundle.teamHistoryIndexByLeague.set(league, sortedByTeam);
  return sortedByTeam;
}

function loadTeamHistoryForGame(
  bundle: DatasetMemoBundle,
  league: string,
  teamSlug: string,
  maxRecords = 20,
): readonly CachedTeamHistoryEntry[] {
  const targetCanon = canonicalTeamSlugKey(teamSlug);
  const leagueIndex = getOrBuildLeagueHistoryIndex(bundle, league);
  const entries = leagueIndex.get(targetCanon);
  return entries ? entries.slice(0, maxRecords) : [];
}

function findSquadTeamEntry(
  squads: LeagueSquadsFile | null,
  teamSlug: string,
): TeamSquadEntry | null {
  if (!squads) return null;
  const targetCanon = canonicalTeamSlugKey(teamSlug);
  return (
    squads.teams.find(
      (t) =>
        canonicalTeamSlugKey(t.teamSlug) === targetCanon ||
        canonicalTeamSlugKey(t.teamId) === targetCanon,
    ) ?? null
  );
}

const SAFE_ENTITY_ID_RE = /^[A-Za-z0-9._:+-]+$/;

function isSeasonMinutesMetric(metric: { readonly key: string; readonly label: string }): boolean {
  const k = metric.key.trim().toLowerCase();
  const l = metric.label.trim().toUpperCase();
  return (
    k === "min" ||
    k === "minutes" ||
    k === "min_total" ||
    k === "total_minutes" ||
    k === "min_per_game" ||
    k === "mpg" ||
    l === "MIN" ||
    l === "MPG" ||
    l === "MIN/P"
  );
}

function normalizeSeasonMinutesPerGame(
  sport: PlatformSport,
  seasonMinMetric: { readonly key: string; readonly label: string; readonly value: string } | undefined,
  seasonGp: number,
  avgFromLogs: number | null,
): number | null {
  if (!seasonMinMetric) return null;
  const raw = parseStatNumeric(seasonMinMetric.value);
  if (raw === null || raw <= 0) return null;

  const k = seasonMinMetric.key.trim().toLowerCase();
  const l = seasonMinMetric.label.trim().toUpperCase();
  const isExplicitPerGame =
    k.includes("per_game") ||
    k.includes("avg") ||
    k === "mpg" ||
    l.includes("/P") ||
    l.includes("MPG");
  const isExplicitTotal = k.includes("total") || l.includes("TOTAL");

  if (sport === "basketball") {
    if (isExplicitPerGame) {
      return Math.round(raw * 10) / 10;
    }
    if (
      seasonGp > 1 &&
      (isExplicitTotal ||
        !seasonMinMetric.value.includes(".") ||
        (avgFromLogs !== null &&
          avgFromLogs > 0 &&
          raw / avgFromLogs >= Math.max(2, seasonGp * 0.6)))
    ) {
      return Math.round((raw / seasonGp) * 10) / 10;
    }
    return Math.round(raw * 10) / 10;
  }

  if (isExplicitPerGame) {
    return Math.round(raw * 10) / 10;
  }
  if (seasonGp > 1) {
    return Math.round((raw / seasonGp) * 10) / 10;
  }
  return Math.round(raw * 10) / 10;
}

function extractFootballCandidatesForGame(
  game: PlatformGame,
): readonly FootballPlayerPropCandidateInput[] {
  if (game.sport !== "football") return [];
  const cap = getLeagueCapability(game.league);
  if (cap && !cap.supportedMarketFamilies.includes("player_props_football")) {
    return [];
  }
  const squads = loadCachedLeagueSquads(game.league);
  if (!squads) return [];

  const out: FootballPlayerPropCandidateInput[] = [];
  const sides = [
    { side: "home" as const, slug: game.home.slug, name: game.home.name },
    { side: "away" as const, slug: game.away.slug, name: game.away.name },
  ];

  for (const s of sides) {
    const teamEntry = findSquadTeamEntry(squads, s.slug);
    if (!teamEntry) continue;

    const scoredPlayers: Array<{
      readonly rank: number;
      readonly input: FootballPlayerPropCandidateInput;
    }> = [];

    for (const player of teamEntry.players) {
      if (
        player.positionGroup === "GK" ||
        player.availability === "injured" ||
        player.availability === "suspended"
      ) {
        continue;
      }

      const safePhotoKey = sanitizeServerPhotoKey(player.photoKey);
      const recentLogs: FootballPlayerMatchLog[] = [];
      for (const rg of player.recentGames ?? []) {
        const minHit = rg.stats.find((st) => {
          const u = st.label.trim().toUpperCase();
          return u === "MIN" || u === "MINS" || u === "MINUTOS";
        });
        const mins = minHit ? parseStatNumeric(minHit.value) : null;
        if (mins === null) continue;
        const findStat = (patterns: readonly string[]): number | undefined => {
          const hit = rg.stats.find((st) => {
            const norm = normalizeSearchToken(st.label);
            return patterns.some((p) => norm.includes(p));
          });
          if (!hit) return undefined;
          const val = parseStatNumeric(hit.value);
          return val !== null ? val : undefined;
        };
        recentLogs.push({
          minutesPlayed: mins,
          ...(rg.isHome === true || rg.isHome === false ? { isHome: rg.isHome } : {}),
          shots: findStat(["tiros", "remates", "shot"]),
          shotsOnTarget: findStat(["puerta", "sot", "arco"]),
          goals: findStat(["gol", "goal"]),
          assists: findStat(["asist", "assist"]),
          foulsCommitted: findStat(["falta", "foul"]),
          yellowCards: findStat(["amarill", "tarjeta", "yellow"]),
        });
      }

      const qualifiedRecent = recentLogs.filter(
        (l) => l.minutesPlayed >= FOOTBALL_STARTER_MIN_MINUTES,
      );
      if (qualifiedRecent.length >= 3) {
        const avgShots =
          qualifiedRecent.reduce((acc, l) => acc + (l.shots ?? 0), 0) / qualifiedRecent.length;
        scoredPlayers.push({
          rank: avgShots + 3,
          input: {
            playerName: player.name,
            playerSlug: player.slug,
            photoKey: safePhotoKey,
            teamSlug: teamEntry.teamSlug,
            teamSide: s.side,
            teamName: s.name,
            position: player.positionGroup,
            minMinutes: FOOTBALL_STARTER_MIN_MINUTES,
            matchLogs: recentLogs,
          },
        });
        continue;
      }

      const apps = player.stats.appearances;
      if (apps < 4) continue;
      const activity =
        player.stats.shots +
        player.stats.shotsOnTarget +
        player.stats.goals +
        player.stats.assists +
        player.stats.foulsCommitted +
        player.stats.yellowCards;
      if (activity <= 0) continue;

      const minMetric = player.seasonMetrics?.find(isSeasonMinutesMetric);
      const avgMinutes = normalizeSeasonMinutesPerGame("football", minMetric, apps, null);

      if (avgMinutes === null || avgMinutes < FOOTBALL_STARTER_MIN_MINUTES) continue;

      const rank =
        (player.stats.shotsOnTarget * 2 +
          player.stats.shots +
          (player.stats.goals + player.stats.assists) * 3) /
        apps;

      scoredPlayers.push({
        rank,
        input: {
          playerName: player.name,
          playerSlug: player.slug,
          photoKey: safePhotoKey,
          teamSlug: teamEntry.teamSlug,
          teamSide: s.side,
          teamName: s.name,
          position: player.positionGroup,
          minMinutes: FOOTBALL_STARTER_MIN_MINUTES,
          avgMinutes,
          seasonTotals: {
            appearances: apps,
            shots: player.stats.shots,
            shotsOnTarget: player.stats.shotsOnTarget,
            goals: player.stats.goals,
            assists: player.stats.assists,
            foulsCommitted: player.stats.foulsCommitted,
            yellowCards: player.stats.yellowCards,
            redCards: player.stats.redCards,
          },
        },
      });
    }

    scoredPlayers
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 3)
      .forEach((entry) => out.push(entry.input));
  }

  return out;
}

function extractNbaCandidatesForGame(
  game: PlatformGame,
): readonly NbaPlayerPropCandidateInput[] {
  if (game.sport !== "basketball") return [];
  const cap = getLeagueCapability(game.league);
  if (cap && !cap.supportedMarketFamilies.includes("nba_player_props")) {
    return [];
  }
  const squads = loadCachedLeagueSquads(game.league);
  if (!squads) return [];

  const out: NbaPlayerPropCandidateInput[] = [];
  const sides = [
    { side: "home" as const, slug: game.home.slug, name: game.home.name },
    { side: "away" as const, slug: game.away.slug, name: game.away.name },
  ];

  const metricDefs: ReadonlyArray<{
    readonly code: NbaPlayerPropStatKey;
    readonly keys: readonly string[];
  }> = [
    { code: "PTS", keys: ["pts", "puntos"] },
    { code: "REB", keys: ["reb", "rebotes"] },
    { code: "AST", keys: ["ast", "asistencias"] },
    { code: "3PM", keys: ["3pm", "tpm", "triples"] },
  ];

  for (const s of sides) {
    const teamEntry = findSquadTeamEntry(squads, s.slug);
    if (!teamEntry) continue;

    const scoredPlayers: Array<{
      readonly rank: number;
      readonly input: NbaPlayerPropCandidateInput;
    }> = [];

    for (const player of teamEntry.players) {
      if (player.availability === "injured" || player.availability === "suspended") {
        continue;
      }

      const matchLogs: NbaPlayerMatchLog[] = [];
      for (const rg of player.recentGames ?? []) {
        const minHit = rg.stats.find((st) => {
          const u = st.label.trim().toUpperCase();
          return u === "MIN" || u === "MINS" || u === "MINUTOS";
        });
        const mins = minHit ? parseStatNumeric(minHit.value) : null;
        if (mins === null) continue;
        const findVal = (keys: readonly string[]): number | undefined => {
          const hit = rg.stats.find((st) => keys.includes(st.label.trim().toLowerCase()));
          if (!hit) return undefined;
          const v = parseStatNumeric(hit.value);
          return v !== null ? v : undefined;
        };
        matchLogs.push({
          minutesPlayed: mins,
          ...(rg.isHome === true || rg.isHome === false ? { isHome: rg.isHome } : {}),
          PTS: findVal(["pts", "puntos"]),
          REB: findVal(["reb", "rebotes"]),
          AST: findVal(["ast", "asistencias"]),
          "3PM": findVal(["3pm", "tpm", "triples"]),
        });
      }

      const minMetric = player.seasonMetrics?.find(isSeasonMinutesMetric);
      const gp = Math.max(1, player.stats.appearances);
      const allLogAvg =
        matchLogs.length > 0
          ? matchLogs.reduce((acc, l) => acc + l.minutesPlayed, 0) / matchLogs.length
          : null;
      const seasonAvgMin = normalizeSeasonMinutesPerGame("basketball", minMetric, gp, allLogAvg);

      const qualifiedLogs = matchLogs.filter((l) => l.minutesPlayed >= NBA_STARTER_MIN_MINUTES);
      if (matchLogs.length >= 3 && qualifiedLogs.length < 3) continue;
      const avgMinutes =
        qualifiedLogs.length >= 3
          ? Math.round(
              (qualifiedLogs.reduce((acc, l) => acc + l.minutesPlayed, 0) / qualifiedLogs.length) *
                10,
            ) / 10
          : seasonAvgMin;

      if (avgMinutes === null || avgMinutes < NBA_STARTER_MIN_MINUTES) continue;

      const statProjections: Partial<
        Record<
          NbaPlayerPropStatKey,
          { readonly line: number; readonly mean: number; readonly last10?: readonly number[] }
        >
      > = {};
      let ptsRank = 0;

      for (const def of metricDefs) {
        const hit = player.seasonMetrics?.find(
          (m) =>
            def.keys.includes(m.key.trim().toLowerCase()) ||
            def.keys.includes(m.label.trim().toLowerCase()),
        );
        const mean = hit ? parseStatNumeric(hit.value) : null;
        if (mean === null || mean <= 0.4) continue;
        if (def.code === "PTS") ptsRank = mean;
        const last10 = qualifiedLogs
          .map((l) => l[def.code])
          .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
        const line = Math.max(0.5, Math.round(mean - 0.5) + 0.5);
        statProjections[def.code] = {
          line,
          mean: Math.round(mean * 100) / 100,
          ...(last10.length >= 3 ? { last10 } : {}),
        };
      }

      if (Object.keys(statProjections).length === 0) continue;

      scoredPlayers.push({
        rank: ptsRank || avgMinutes,
        input: {
          playerName: player.name,
          playerSlug: player.slug,
          photoKey: sanitizeServerPhotoKey(player.photoKey),
          teamSlug: teamEntry.teamSlug,
          teamSide: s.side,
          teamName: s.name,
          position: player.positionLabel || player.positionGroup,
          minMinutes: NBA_STARTER_MIN_MINUTES,
          avgMinutes,
          ...(qualifiedLogs.length >= 3 ? { matchLogs: qualifiedLogs } : {}),
          statProjections,
        },
      });
    }

    scoredPlayers
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 3)
      .forEach((entry) => out.push(entry.input));
  }

  return out;
}

function getOrBuildEnrichedGameMarkets(
  bundle: DatasetMemoBundle,
  game: PlatformGame,
): EnrichedGameMarketsBundle {
  const cached = bundle.enrichedMarketsByGameId.get(game.id);
  if (cached) return cached;

  const leagueGeneratedAt =
    bundle.value.leagues.find((lg) => lg.league === game.league)?.generatedAt ??
    bundle.value.generatedAt;
  const v32 =
    game.status !== "FT" ? outlookDetailFor(game, undefined, leagueGeneratedAt) : null;
  const countMarkets = game.markets.filter(
    (row) =>
      row.market === "corners_total" ||
      row.market === "fouls_total" ||
      row.market === "yellow_total",
  );
  const derivedFallbackRows =
    !v32 && game.status !== "FT"
      ? game.sport === "football"
        ? buildDerivedFootballFallbackRows(
            game,
            !game.markets.some((row) => row.market === "correct_score"),
          )
        : game.sport === "basketball" || game.sport === "ice-hockey" || game.sport === "baseball"
          ? buildDerivedUsSportRows({
              home: game.home,
              away: game.away,
              projection: game.projection,
              sport: game.sport,
              existingMarkets: game.markets,
            })
          : []
      : [];
  const rawBaseMarkets = v32
    ? [...v32.markets, ...countMarkets]
    : [...game.markets, ...derivedFallbackRows];
  const v5Detail =
    game.status !== "FT"
      ? buildMatchDetailV5(game, {
          hasV32Outlook: Boolean(v32),
          existingMarkets: rawBaseMarkets,
        })
      : null;
  const rawMarkets = v5Detail ? [...rawBaseMarkets, ...v5Detail.extraMarkets] : rawBaseMarkets;
  const markets = enrichMarketRowsWithBookQuotes(game, rawMarkets);

  const built: EnrichedGameMarketsBundle = {
    markets,
    v5: v5Detail?.v5 ?? null,
    outlook: v32?.outlook ?? v5Detail?.fallbackOutlook ?? null,
  };
  bundle.enrichedMarketsByGameId.set(game.id, built);
  return built;
}

let datasetMemo: DatasetMemoBundle | null = null;

function getDatasetMemoBundle(): DatasetMemoBundle {
  const now = Date.now();
  if (datasetMemo && now - datasetMemo.at < DATASET_TTL_MS) return datasetMemo;
  const value = buildServerRawPlatformDatasetUncached();
  const gamesById = new Map<string, PlatformGame>();
  for (const g of value.games) gamesById.set(g.id, g);
  datasetMemo = {
    value,
    gamesById,
    redactedValue: null,
    redactedGamesById: null,
    slimMemberShell: null,
    slimVisitorShell: null,
    initialMemberShell: null,
    initialVisitorShell: null,
    shellPlayerPropsMember: null,
    playerPropsByGameId: null,
    screenerMemberCatalogsByMaxGames: new Map(),
    screenerVisitorCatalogsByMaxGames: new Map(),
    memberLeagueHubGamesByLeague: new Map(),
    visitorLeagueHubGamesByLeague: new Map(),
    standingsByLeague: new Map(),
    teamHistoryIndexByLeague: new Map(),
    enrichedMarketsByGameId: new Map(),
    memberCompactCatalogByGameId: new Map(),
    visitorCompactCatalogByGameId: new Map(),
    memberFullCatalogByGameId: new Map(),
    visitorFullCatalogByGameId: new Map(),
    teamLabelByLeagueAndCanon: buildTeamLabelLookup(value),
    at: now,
  };
  attachGameTeamFormsToBundle(datasetMemo);
  return datasetMemo;
}

function attachGameTeamFormsToBundle(bundle: DatasetMemoBundle): void {
  const formCache = new Map<string, readonly string[]>();

  for (const leagueSummary of bundle.value.leagues) {
    for (const row of leagueSummary.standings) {
      if (!row.form || row.form.length === 0) continue;
      const sliced = row.form.slice(0, 5);
      const keys = [
        canonicalTeamSlugKey(row.teamId),
        canonicalTeamSlugKey(cleanTeamRouteSlug(row.name)),
        canonicalTeamSlugKey(row.shortName),
      ];
      for (const k of keys) {
        if (k) formCache.set(`${leagueSummary.league}|${k}`, sliced);
      }
    }
  }

  const resolveForm = (league: string, slug: string, shortName: string): readonly string[] | undefined => {
    const canonSlug = canonicalTeamSlugKey(slug);
    const cacheKey = `${league}|${canonSlug}`;
    const existing =
      formCache.get(cacheKey) ??
      formCache.get(`${league}|${canonicalTeamSlugKey(shortName)}`);
    if (existing) return existing;

    const history = loadTeamHistoryForGame(bundle, league, slug, 5);
    const derived = buildTeamFormTokens(history, 5);
    formCache.set(cacheKey, derived);
    return derived.length > 0 ? derived : undefined;
  };

  for (const game of bundle.value.games) {
    const homeForm =
      game.home.form && game.home.form.length > 0
        ? game.home.form.slice(0, 5)
        : resolveForm(game.league, game.home.slug, game.home.shortName);
    const awayForm =
      game.away.form && game.away.form.length > 0
        ? game.away.form.slice(0, 5)
        : resolveForm(game.league, game.away.slug, game.away.shortName);
    if (homeForm && homeForm.length > 0) {
      game.home = { ...game.home, form: homeForm };
    }
    if (awayForm && awayForm.length > 0) {
      game.away = { ...game.away, form: awayForm };
    }
  }
}

function getRedactedMemo(bundle: DatasetMemoBundle): {
  dataset: PlatformDataset;
  gamesById: Map<string, PlatformGame>;
} {
  if (!bundle.redactedValue || !bundle.redactedGamesById) {
    const redacted = redactDatasetForVisitor(bundle.value);
    const map = new Map<string, PlatformGame>();
    for (const g of redacted.games) map.set(g.id, g);
    bundle.redactedValue = redacted;
    bundle.redactedGamesById = map;
  }
  return { dataset: bundle.redactedValue, gamesById: bundle.redactedGamesById };
}

function getSlimMemberShell(bundle: DatasetMemoBundle): PlatformDataset {
  if (!bundle.slimMemberShell) {
    bundle.slimMemberShell = withoutGameDetail(upcomingPlusRecentFinished(bundle.value, 12));
  }
  return bundle.slimMemberShell;
}

function getSlimVisitorShell(bundle: DatasetMemoBundle): PlatformDataset {
  if (!bundle.slimVisitorShell) {
    const { dataset } = getRedactedMemo(bundle);
    bundle.slimVisitorShell = withoutGameDetail(upcomingPlusRecentFinished(dataset, 12));
  }
  return bundle.slimVisitorShell;
}

function mxDayId(date: Date): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Mexico_City",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch (err) {
    void err;
    return date.toISOString().slice(0, 10);
  }
}

const INITIAL_SHELL_MAX_GAMES = 52;
const INITIAL_SHELL_MAX_BYTES = 480 * 1024;

function compareShellGamePriority(a: PlatformGame, b: PlatformGame): number {
  const aCore = CORE_SHELL_LEAGUES.has(a.league) ? 0 : 1;
  const bCore = CORE_SHELL_LEAGUES.has(b.league) ? 0 : 1;
  if (aCore !== bCore) return aCore - bCore;
  const aTier = COMPETITION_BY_ID[a.league]?.prestigeTier ?? 4;
  const bTier = COMPETITION_BY_ID[b.league]?.prestigeTier ?? 4;
  if (aTier !== bTier) return aTier - bTier;
  return (a.kickoffUtc || "").localeCompare(b.kickoffUtc || "");
}

function filterTeamsForGames(
  teams: PlatformDataset["teams"],
  games: readonly PlatformGame[],
): NonNullable<PlatformDataset["teams"]> {
  const keys = new Set<string>();
  for (const g of games) {
    keys.add(`${g.league}:${g.home.slug}`);
    keys.add(`${g.league}:${g.away.slug}`);
  }
  return (teams ?? []).filter((t) => keys.has(`${t.league}:${t.slug}`));
}

export function splitInitialShellDataset(
  slim: PlatformDataset,
  nowMs: number = Date.now(),
): PlatformDataset {
  const todayStr = mxDayId(new Date(nowMs));
  const tomorrowStr = mxDayId(new Date(nowMs + 86_400_000));

  const upcomingDays = Array.from(
    new Set(
      slim.games
        .filter((g) => g.status !== "FT" && g.dayId)
        .map((g) => g.dayId),
    ),
  ).sort();
  const primaryDay =
    upcomingDays.includes(todayStr)
      ? todayStr
      : (upcomingDays.find((d) => d >= todayStr) ?? upcomingDays[0] ?? todayStr);
  const secondaryDay =
    primaryDay === todayStr
      ? tomorrowStr
      : (upcomingDays.find((d) => d > primaryDay) ?? tomorrowStr);

  const isPromoGame = (g: PlatformGame): boolean =>
    g.picks.some(
      (p) =>
        (slim.dailyPromoPickId && p.id === slim.dailyPromoPickId) ||
        (slim.tipsterWeeklyPickId && p.id === slim.tipsterWeeklyPickId),
    );

  const selected: PlatformGame[] = [];
  const selectedIds = new Set<string>();
  const promoGameIds = new Set<string>();
  const addGame = (g: PlatformGame): void => {
    if (selected.length >= INITIAL_SHELL_MAX_GAMES || selectedIds.has(g.id)) return;
    selectedIds.add(g.id);
    if (isPromoGame(g)) promoGameIds.add(g.id);
    selected.push(
      projectShellGame(g, {
        keepParlayCandidates: false,
        isVisitorRedacted: slim.isServerRedactedForVisitor,
        nowMs,
      }),
    );
  };

  for (const g of slim.games) {
    if (selected.length >= INITIAL_SHELL_MAX_GAMES) break;
    if (isPromoGame(g)) {
      addGame(g);
    }
  }

  const liveGames = slim.games
    .filter((g) => g.status === "LIVE")
    .sort(compareShellGamePriority);
  for (const g of liveGames) {
    if (selected.length >= INITIAL_SHELL_MAX_GAMES) break;
    addGame(g);
  }

  const primaryGames = slim.games
    .filter((g) => g.status !== "FT" && g.dayId === primaryDay)
    .sort(compareShellGamePriority);
  for (const g of primaryGames) {
    if (selected.length >= INITIAL_SHELL_MAX_GAMES) break;
    addGame(g);
  }

  if (selected.length < INITIAL_SHELL_MAX_GAMES) {
    const secondaryGames = slim.games
      .filter((g) => {
        if (g.status === "FT" || g.dayId !== secondaryDay) return false;
        if (CORE_SHELL_LEAGUES.has(g.league)) return true;
        const tier = COMPETITION_BY_ID[g.league]?.prestigeTier ?? 4;
        return tier <= 2;
      })
      .sort(compareShellGamePriority);
    for (const g of secondaryGames) {
      if (selected.length >= INITIAL_SHELL_MAX_GAMES) break;
      addGame(g);
    }
  }

  if (selected.length === 0) {
    for (const g of slim.games.slice(0, 12)) addGame(g);
  }

  const stage1Leagues = slim.leagues.map((lg) => ({
    ...lg,
    standings: [],
  }));

  let stage1Games = selected;
  let stage1: PlatformDataset = {
    ...slim,
    serverNowUtc: new Date(nowMs).toISOString(),
    playerProps: [],
    leagues: stage1Leagues,
    games: stage1Games,
    teams: filterTeamsForGames(slim.teams, stage1Games),
  };

  if (Buffer.byteLength(JSON.stringify(stage1), "utf8") > INITIAL_SHELL_MAX_BYTES) {
    stage1Games = stage1Games.map((g) => ({
      ...g,
      picks: g.picks.map((pk, idx) =>
        idx === 0 ? pk : { ...pk, bookQuotes: undefined },
      ),
    }));
    stage1 = {
      ...stage1,
      games: stage1Games,
    };
  }

  while (
    stage1Games.length > 1 &&
    Buffer.byteLength(JSON.stringify(stage1), "utf8") > INITIAL_SHELL_MAX_BYTES
  ) {
    let dropIdx = -1;
    for (let i = stage1Games.length - 1; i >= 0; i -= 1) {
      if (!promoGameIds.has(stage1Games[i]!.id)) {
        dropIdx = i;
        break;
      }
    }
    if (dropIdx < 0) break;
    stage1Games = [...stage1Games.slice(0, dropIdx), ...stage1Games.slice(dropIdx + 1)];
    stage1 = {
      ...stage1,
      games: stage1Games,
      teams: filterTeamsForGames(slim.teams, stage1Games),
    };
  }

  return stage1;
}

function getInitialMemberShell(bundle: DatasetMemoBundle): PlatformDataset {
  if (!bundle.initialMemberShell) {
    bundle.initialMemberShell = splitInitialShellDataset(getSlimMemberShell(bundle));
  }
  return bundle.initialMemberShell;
}

function getInitialVisitorShell(bundle: DatasetMemoBundle): PlatformDataset {
  if (!bundle.initialVisitorShell) {
    bundle.initialVisitorShell = splitInitialShellDataset(getSlimVisitorShell(bundle));
  }
  return bundle.initialVisitorShell;
}

export function loadInitialShellDatasetForAccess(fullAccess: boolean): PlatformDataset {
  const bundle = getDatasetMemoBundle();
  return fullAccess ? getInitialMemberShell(bundle) : getInitialVisitorShell(bundle);
}

export function loadExtendedShellPayload(fullAccess: boolean): {
  games: PlatformGame[];
  teams: NonNullable<PlatformDataset["teams"]>;
  isRedactedForVisitor: boolean;
} {
  const bundle = getDatasetMemoBundle();
  const slim = fullAccess ? getSlimMemberShell(bundle) : getSlimVisitorShell(bundle);
  return {
    games: slim.games,
    teams: slim.teams ?? [],
    isRedactedForVisitor: !fullAccess,
  };
}

export const buildServerRawPlatformDataset = cache(function buildServerRawPlatformDatasetCached(): PlatformDataset {
  return getDatasetMemoBundle().value;
});

function buildServerRawPlatformDatasetUncached(): PlatformDataset {
  const envelopes = loadAllActiveLeagueSnapshots();
  const inputs: RawLeagueInput[] = [];

  for (const leagueKey of PRODUCT_LEAGUES) {
    const env = envelopes[leagueKey];
    if (env?.data) {
      const snapshotGeneratedAt = env.data.generatedAt;
      const signals = buildSpacetimeSignals(env.data.games);
      const games = env.data.games.map((g) => {
        const applied = applyOutlook(
          g,
          signals[g.id] ?? null,
          undefined,
          snapshotGeneratedAt,
        );
        if (applied.signal) signals[g.id] = applied.signal;
        else delete signals[g.id];
        return applied.match;
      });
      inputs.push({
        league: env.data.league,
        leagueLabel: env.data.leagueLabel,
        leagueLogoUrl: env.data.logoUrl,
        sport: env.data.sport,
        season: env.data.season,
        roundLabel: env.data.roundLabel,
        generatedAt: env.data.generatedAt,
        games,
        standings: env.data.standings,
        spacetime: signals,
      });
    }
  }

  const dataset = enrichDatasetWithBookQuotes(buildPlatformDataset(inputs));

  return {
    ...dataset,
    serverNowUtc: new Date().toISOString(),
    teams: buildTeamsDirectoryFromEnvelopes(envelopes),
    playerProps: loadLeaguePlayerProps(dataset.games),
  };
}

export function upcomingOnly(dataset: PlatformDataset): PlatformDataset {
  const upcoming = dataset.games.filter((g) => g.status !== "FT");
  return upcoming.length > 0 ? { ...dataset, games: upcoming } : dataset;
}

const CORE_SHELL_LEAGUES = new Set<string>(TIER1_LEAGUE_IDS);

export function upcomingPlusRecentFinished(
  dataset: PlatformDataset,
  maxFinished = 12,
): PlatformDataset {
  const upcomingAll = dataset.games.filter((g) => g.status !== "FT");
  if (upcomingAll.length === 0) return dataset;
  const nowMs = Date.now();
  const maxExpansionHorizonMs = nowMs + 8 * 86_400_000;
  const perExpansionCount = new Map<string, number>();

  const upcoming = upcomingAll
    .slice()
    .sort((a, b) => (a.kickoffUtc || "").localeCompare(b.kickoffUtc || ""))
    .filter((g) => {
      if (g.status === "LIVE" || CORE_SHELL_LEAGUES.has(g.league)) return true;
      const ms = Date.parse(g.kickoffUtc);
      if (Number.isFinite(ms) && ms > maxExpansionHorizonMs) return false;
      const seen = perExpansionCount.get(g.league) ?? 0;
      if (seen >= 6) return false;
      perExpansionCount.set(g.league, seen + 1);
      return true;
    });

  const recentFinished = dataset.games
    .filter((g) => g.status === "FT")
    .sort((a, b) => (b.kickoffUtc || "").localeCompare(a.kickoffUtc || ""))
    .slice(0, maxFinished);
  return { ...dataset, games: [...upcoming, ...recentFinished] };
}

async function redactedForViewer(): Promise<PlatformDataset> {
  const bundle = getDatasetMemoBundle();
  return (await hasAuthenticatedBetaSession()) ? bundle.value : getRedactedMemo(bundle).dataset;
}

function getGamePlayerProps(
  bundle: DatasetMemoBundle,
  gameId: string,
): readonly PlayerPropItem[] {
  if (!bundle.playerPropsByGameId) {
    const index = new Map<string, PlayerPropItem[]>();
    for (const prop of bundle.value.playerProps ?? []) {
      const list = index.get(prop.gameId);
      if (list) list.push(prop);
      else index.set(prop.gameId, [prop]);
    }
    bundle.playerPropsByGameId = index;
  }
  return bundle.playerPropsByGameId.get(gameId) ?? [];
}

export function loadLeagueStandings(league: ProductLeague): StandingRow[] {
  const bundle = getDatasetMemoBundle();
  const existing = bundle.standingsByLeague.get(league);
  if (existing) return existing;
  const rows = bundle.value.leagues.find((l) => l.league === league)?.standings ?? [];
  bundle.standingsByLeague.set(league, rows);
  return rows;
}

export async function loadLeagueHubGames(league: ProductLeague): Promise<PlatformGame[]> {
  const bundle = getDatasetMemoBundle();
  const hasSession = await hasAuthenticatedBetaSession();
  const cacheMap = hasSession
    ? bundle.memberLeagueHubGamesByLeague
    : bundle.visitorLeagueHubGamesByLeague;
  const existing = cacheMap.get(league);
  if (existing) return existing.slice();
  const dataset = hasSession ? bundle.value : getRedactedMemo(bundle).dataset;
  const games = dataset.games
    .filter((g) => g.league === league)
    .map((g) => ({
      ...g,
      markets: [],
      headToHead: [],
      factors: [],
    }));
  cacheMap.set(league, games);
  return games.slice();
}

export async function loadFinishedGames(league?: string): Promise<PlatformGame[]> {
  const dataset = await redactedForViewer();
  return withoutGameDetail({
    ...dataset,
    games: dataset.games.filter((g) => g.status === "FT" && (!league || g.league === league)),
  }).games;
}

export async function loadGameSummary(gameId: string): Promise<PlatformGame | null> {
  const bundle = getDatasetMemoBundle();
  const hasSession = await hasAuthenticatedBetaSession();
  const game = hasSession
    ? bundle.gamesById.get(gameId)
    : getRedactedMemo(bundle).gamesById.get(gameId);
  return game ? { ...game, markets: [], headToHead: [], factors: [] } : null;
}

export function loadShellPlayerProps(options?: { fullAccess?: boolean }): PlayerPropItem[] {
  if (options && options.fullAccess === false) {
    return [];
  }
  const bundle = getDatasetMemoBundle();
  if (!bundle.shellPlayerPropsMember) {
    bundle.shellPlayerPropsMember = bundle.value.playerProps ?? [];
  }
  return bundle.shellPlayerPropsMember;
}

function projectShellPick(
  pk: MatchPick,
  opts: { includeQuotes: boolean; nowMs: number },
): MatchPick {
  const roundedP = Math.round(pk.p * 10_000) / 10_000;
  let compactQuotes: MatchPick["bookQuotes"] = undefined;

  if (opts.includeQuotes && !pk.isRedacted && pk.bookQuotes && pk.bookQuotes.length > 0) {
    const filtered = pk.bookQuotes
      .filter(
        (q) =>
          Number.isFinite(q.decimal) &&
          q.decimal > 1.01 &&
          q.decimal <= MAX_POSITIVE_DECIMAL_ODDS &&
          ALLOWED_BOOKMAKER_IDS.has(q.book) &&
          isPermittedMarketQuoteBook(q.book, q.bookLabel) &&
          isMarketFresh(q.capturedAtUtc, opts.nowMs),
      )
      .slice(0, 3)
      .map((q) => ({
        book: q.book,
        bookLabel: q.bookLabel,
        decimal: q.decimal,
        capturedAtUtc: q.capturedAtUtc,
        ...(q.openingDecimal != null && Math.abs(q.openingDecimal - q.decimal) >= 0.01
          ? { openingDecimal: q.openingDecimal }
          : {}),
        ...(q.movementDirection && q.movementDirection !== "stable"
          ? { movementDirection: q.movementDirection }
          : {}),
        ...(q.isBest ? { isBest: true } : {}),
      }));
    if (filtered.length > 0) {
      compactQuotes = filtered;
    }
  }

  const topBookLabel = typeof pk.marketBookLabel === "string" ? pk.marketBookLabel.trim() : "";
  const topBookPrimary = topBookLabel.split(/[·|]/)[0]?.trim() ?? topBookLabel;
  const topMarketAllowed =
    !pk.isRedacted &&
    pk.marketDecimal !== null &&
    Number.isFinite(pk.marketDecimal) &&
    pk.marketDecimal > 1.01 &&
    pk.marketDecimal <= MAX_POSITIVE_DECIMAL_ODDS &&
    topBookLabel.length > 0 &&
    !isBlockedMarketQuoteBook(topBookPrimary, topBookLabel) &&
    isPermittedMarketQuoteBook(topBookPrimary, topBookLabel) &&
    isMarketFresh(pk.marketCapturedAtUtc, opts.nowMs);

  return {
    id: pk.id,
    gameId: pk.gameId,
    league: pk.league,
    leagueLabel: pk.leagueLabel,
    matchLabel: pk.matchLabel,
    kickoffLocal: pk.kickoffLocal,
    gameStatus: pk.gameStatus,
    slotIndex: pk.slotIndex,
    category: pk.category,
    categoryLabel: pk.categoryLabel,
    risk: pk.risk,
    engineKey: pk.engineKey,
    engineName: pk.engineName,
    marketGroup: pk.marketGroup,
    selectionKey: pk.selectionKey,
    ...(pk.market !== undefined ? { market: pk.market } : {}),
    ...(pk.line !== undefined ? { line: pk.line } : {}),
    conflictGroup: pk.conflictGroup,
    label: pk.label,
    rationale: "",
    p: roundedP,
    fairDecimal: pk.fairDecimal,
    fairAmerican: pk.fairAmerican,
    marketDecimal: topMarketAllowed ? pk.marketDecimal : null,
    marketAmerican: topMarketAllowed ? pk.marketAmerican : null,
    ...(topMarketAllowed && pk.marketBookLabel !== undefined
      ? { marketBookLabel: pk.marketBookLabel }
      : {}),
    ...(topMarketAllowed && pk.marketCapturedAtUtc !== undefined
      ? { marketCapturedAtUtc: pk.marketCapturedAtUtc }
      : {}),
    ...(compactQuotes ? { bookQuotes: compactQuotes } : {}),
    edgePts: topMarketAllowed ? pk.edgePts : null,
    confidenceScore: pk.confidenceScore,
    suggestedUnits: pk.suggestedUnits,
    ...(pk.result !== undefined ? { result: pk.result } : {}),
    ...(pk.isDailyOpenPromo ? { isDailyOpenPromo: true } : {}),
    ...(pk.isTipsterWeeklyOpen ? { isTipsterWeeklyOpen: true } : {}),
    ...(pk.tipsterSlug ? { tipsterSlug: pk.tipsterSlug } : {}),
    ...(pk.isRedacted !== undefined ? { isRedacted: pk.isRedacted } : {}),
  };
}

function projectShellGame(
  g: PlatformGame,
  opts: { keepParlayCandidates: boolean; isVisitorRedacted: boolean; nowMs: number },
): PlatformGame {
  const isFinished = g.status === "FT";
  const hasPromoOpenPick = g.picks.some(
    (p) => Boolean(p.isDailyOpenPromo) || Boolean(p.isTipsterWeeklyOpen),
  );
  const lockedVisitorGame = opts.isVisitorRedacted && !isFinished && !hasPromoOpenPick;
  const shellPicks = isFinished ? g.picks.slice(0, 2) : g.picks;

  const projectedParlayCandidates =
    opts.keepParlayCandidates &&
    !isFinished &&
    !lockedVisitorGame &&
    g.parlayCandidates &&
    g.parlayCandidates.length > 0
      ? g.parlayCandidates
          .slice(0, 3)
          .map((pk) => projectShellPick(pk, { includeQuotes: false, nowMs: opts.nowMs }))
      : undefined;

  const canKeepMatchContext =
    !lockedVisitorGame &&
    !g.preGame?.isRedacted &&
    Boolean(
      g.preGame?.matchContext &&
        (g.preGame.matchContext.isLocalDerby ||
          g.preGame.matchContext.referee ||
          g.preGame.matchContext.refereeStats),
    );

  return {
    id: g.id,
    league: g.league,
    leagueLabel: g.leagueLabel,
    ...(g.leagueLogoUrl ? { leagueLogoUrl: g.leagueLogoUrl } : {}),
    sport: g.sport,
    round: g.round,
    dayId: g.dayId,
    dayLabel: g.dayLabel,
    kickoffUtc: g.kickoffUtc,
    kickoffLocal: g.kickoffLocal,
    venue: g.venue,
    ...(g.referee ? { referee: g.referee } : {}),
    ...(g.neutralSite !== undefined ? { neutralSite: g.neutralSite } : {}),
    status: g.status,
    ...(g.score ? { score: g.score } : {}),
    home: g.home,
    away: g.away,
    ...(g.hasForecast !== undefined ? { hasForecast: g.hasForecast } : {}),
    x12: g.x12,
    projection: g.projection,
    ...(g.goalLine !== undefined ? { goalLine: g.goalLine } : {}),
    confidenceScore: g.confidenceScore,
    confidenceLevel: g.confidenceLevel,
    picks: shellPicks.map((pk) =>
      projectShellPick(pk, { includeQuotes: !isFinished && !lockedVisitorGame, nowMs: opts.nowMs }),
    ),
    ...(projectedParlayCandidates ? { parlayCandidates: projectedParlayCandidates } : {}),
    preGame: g.preGame
      ? {
          isRedacted: g.preGame.isRedacted,
          cortexSynthesis: "",
          tacticalKeys: [],
          lineupStatusLabel: "",
          lineupsConfirmed60m: g.preGame.lineupsConfirmed60m,
          confirmedLineups: null,
          absences: [],
          moneyFlow: null,
          ...(canKeepMatchContext && g.preGame.matchContext
            ? {
                matchContext: {
                  ...(g.preGame.matchContext.isLocalDerby ? { isLocalDerby: true } : {}),
                  ...(g.preGame.matchContext.referee
                    ? { referee: g.preGame.matchContext.referee }
                    : {}),
                  ...(g.preGame.matchContext.refereeStats
                    ? { refereeStats: g.preGame.matchContext.refereeStats }
                    : {}),
                },
              }
            : {}),
        }
      : g.preGame,
    markets: [],
    factors: [],
    headToHead: [],
    ...(g.restDays ? { restDays: g.restDays } : {}),
    ...(g.counts && !lockedVisitorGame ? { counts: g.counts } : {}),
    updatedAtLabel: g.updatedAtLabel,
    spacetime: null,
  };
}

export function withoutGameDetail(
  dataset: PlatformDataset,
  nowMs: number = Date.now(),
): PlatformDataset {
  const parlayCandidateHorizonMs = nowMs + 2 * 86_400_000;
  const activeShellLeagues = new Set<string>([
    ...CORE_SHELL_LEAGUES,
    ...dataset.games.map((g) => g.league),
  ]);
  return {
    ...dataset,
    serverNowUtc: dataset.serverNowUtc ?? new Date(nowMs).toISOString(),
    playerProps: [],
    leagues: dataset.leagues.map((lg) => ({
      ...lg,
      standings: [],
    })),
    teams: (dataset.teams ?? []).filter((t) => {
      if (CORE_SHELL_LEAGUES.has(t.league)) return true;
      if (!activeShellLeagues.has(t.league)) return false;
      const tier = COMPETITION_BY_ID[t.league]?.prestigeTier ?? 4;
      return tier <= 2;
    }),
    games: dataset.games.map((g) => {
      const kickoffMs = Date.parse(g.kickoffUtc);
      const keepParlayCandidates =
        g.status !== "FT" &&
        (!Number.isFinite(kickoffMs) || kickoffMs <= parlayCandidateHorizonMs);
      return projectShellGame(g, {
        keepParlayCandidates,
        isVisitorRedacted: dataset.isServerRedactedForVisitor,
        nowMs,
      });
    }),
  };
}

function collectOpenPromoPickIds(dataset: PlatformDataset): ReadonlySet<string> {
  const ids = new Set<string>();
  if (dataset.dailyPromoPickId) ids.add(dataset.dailyPromoPickId);
  if (dataset.tipsterWeeklyPickId) ids.add(dataset.tipsterWeeklyPickId);
  return ids;
}

function getOrBuildEnrichedCatalogForGame(
  bundle: DatasetMemoBundle,
  game: PlatformGame,
  fullAccess: boolean,
  compact: boolean,
): MatchPicksCatalog {
  const cacheMap = compact
    ? fullAccess
      ? bundle.memberCompactCatalogByGameId
      : bundle.visitorCompactCatalogByGameId
    : fullAccess
      ? bundle.memberFullCatalogByGameId
      : bundle.visitorFullCatalogByGameId;

  const existing = cacheMap.get(game.id);
  if (existing) return existing;

  const allowFull = fullAccess || game.status === "FT";
  const enriched = allowFull ? getOrBuildEnrichedGameMarkets(bundle, game) : null;
  const homeHistory = loadTeamHistoryForGame(bundle, game.league, game.home.slug, 20);
  const awayHistory = loadTeamHistoryForGame(bundle, game.league, game.away.slug, 20);
  const footballPlayers = allowFull ? extractFootballCandidatesForGame(game) : [];
  const nbaPlayers = allowFull ? extractNbaCandidatesForGame(game) : [];
  const gamePlayerProps = allowFull ? getGamePlayerProps(bundle, game.id) : [];

  const catalog = buildServerMatchPicksCatalog(game, {
    fullAccess,
    markets: enriched?.markets ?? game.markets,
    v5: enriched?.v5 ?? null,
    homeHistory,
    awayHistory,
    footballPlayers,
    nbaPlayers,
    playerProps: gamePlayerProps,
    unlockedPickIds: collectOpenPromoPickIds(bundle.value),
    maxPicksPerFamily: compact ? 2 : 16,
    maxTotalPicks: compact ? 14 : 160,
    compact,
  });

  cacheMap.set(game.id, catalog);
  return catalog;
}

function rebuildFilteredCatalog(
  base: MatchPicksCatalog,
  picks: readonly CatalogPickItem[],
): MatchPicksCatalog {
  const familyCounts: Partial<Record<MarketFamilyId, number>> = {};
  const availableFamilies: MarketFamilyId[] = [];
  for (const item of picks) {
    const prev = familyCounts[item.family] ?? 0;
    if (prev === 0) availableFamilies.push(item.family);
    familyCounts[item.family] = prev + 1;
  }
  return {
    ...base,
    totalPicks: picks.length,
    availableFamilies,
    familyCounts,
    picks,
  };
}

const DEFAULT_SCREENER_CATALOG_MAX_GAMES = 60;
const SCREENER_INITIAL_MAX_BYTES = 180 * 1024;

function buildScreenerCatalogsRecord(
  bundle: DatasetMemoBundle,
  fullAccess: boolean,
  maxGames: number,
): Record<string, MatchPicksCatalog> {
  const horizon = upcomingPlusRecentFinished(bundle.value, 6);
  const upcomingGames = horizon.games
    .filter((g) => g.status !== "FT" && g.hasForecast !== false)
    .slice()
    .sort((a, b) => {
      const aLive = a.status === "LIVE" ? 0 : 1;
      const bLive = b.status === "LIVE" ? 0 : 1;
      if (aLive !== bLive) return aLive - bLive;
      return compareShellGamePriority(a, b);
    });

  const finishedGames = horizon.games
    .filter((g) => g.status === "FT" && g.hasForecast !== false)
    .slice()
    .sort((a, b) => (b.kickoffUtc || "").localeCompare(a.kickoffUtc || ""))
    .slice(0, 3);

  const capLimit = Math.max(1, maxGames);
  let targetGames: PlatformGame[];
  if (finishedGames.length > 0 && capLimit >= 4) {
    const ftQuota = Math.min(finishedGames.length, capLimit >= 8 ? 3 : 2);
    const selectedFt = finishedGames.slice(0, ftQuota);
    const headCount = Math.min(6, Math.max(1, capLimit - selectedFt.length));
    const headUpcoming = upcomingGames.slice(0, headCount);
    const tailUpcoming = upcomingGames.slice(
      headCount,
      Math.max(headCount, capLimit - selectedFt.length),
    );
    targetGames = [...headUpcoming, ...selectedFt, ...tailUpcoming].slice(0, capLimit);
  } else {
    targetGames = upcomingGames.slice(0, capLimit);
  }

  const catalogs: Record<string, MatchPicksCatalog> = {};
  let accumulatedBytes = 2;
  let includedCount = 0;

  for (const game of targetGames) {
    const catalog = getOrBuildEnrichedCatalogForGame(bundle, game, fullAccess, true);
    const entryBytes =
      Buffer.byteLength(JSON.stringify(game.id), "utf8") +
      Buffer.byteLength(JSON.stringify(catalog), "utf8") +
      (includedCount > 0 ? 2 : 1);
    if (accumulatedBytes + entryBytes > SCREENER_INITIAL_MAX_BYTES) {
      break;
    }
    catalogs[game.id] = catalog;
    accumulatedBytes += entryBytes;
    includedCount += 1;
  }

  return catalogs;
}

const MAX_SCREENER_MEMO_BUCKETS = 32;

export async function loadServerPicksCatalogsForScreener(options?: {
  readonly fullAccess?: boolean;
  readonly maxGames?: number;
}): Promise<Record<string, MatchPicksCatalog>> {
  const bundle = getDatasetMemoBundle();
  const fullAccess = options?.fullAccess ?? (await hasAuthenticatedBetaSession());
  const rawMax = options?.maxGames;
  const effectiveMaxGames =
    typeof rawMax === "number" && Number.isFinite(rawMax)
      ? Math.max(1, Math.floor(rawMax))
      : DEFAULT_SCREENER_CATALOG_MAX_GAMES;
  const cacheMap = fullAccess
    ? bundle.screenerMemberCatalogsByMaxGames
    : bundle.screenerVisitorCatalogsByMaxGames;
  const existing = cacheMap.get(effectiveMaxGames);
  if (existing) return existing;

  const built = buildScreenerCatalogsRecord(bundle, fullAccess, effectiveMaxGames);
  if (cacheMap.size >= MAX_SCREENER_MEMO_BUCKETS) {
    const oldestKey = cacheMap.keys().next().value;
    if (oldestKey !== undefined) {
      cacheMap.delete(oldestKey);
    }
  }
  cacheMap.set(effectiveMaxGames, built);
  return built;
}

export function loadScreenerApiPage(params: {
  readonly fullAccess: boolean;
  readonly page?: number;
  readonly pageSize?: number;
  readonly sport?: string;
  readonly league?: string;
  readonly gameId?: string;
  readonly onlyRecommended?: boolean;
  readonly includeTrivial?: boolean;
  readonly q?: string;
}): ScreenerApiResponse {
  const bundle = getDatasetMemoBundle();
  const page =
    typeof params.page === "number" && Number.isFinite(params.page) && params.page >= 1
      ? Math.floor(params.page)
      : 1;
  const pageSize =
    typeof params.pageSize === "number" && Number.isFinite(params.pageSize) && params.pageSize >= 1
      ? Math.min(MAX_SCREENER_PAGE_SIZE, Math.floor(params.pageSize))
      : DEFAULT_SCREENER_PAGE_SIZE;

  const sportFilter = params.sport?.trim().toLowerCase();
  const leagueFilter = params.league?.trim().toLowerCase();
  const gameIdFilter = params.gameId?.trim();
  const qNorm = params.q ? normalizeSearchToken(params.q) : "";

  const baseGames = gameIdFilter
    ? bundle.value.games.filter((g) => g.id === gameIdFilter)
    : upcomingPlusRecentFinished(bundle.value, 24).games.filter((g) => g.hasForecast !== false);

  const prefilteredGames = baseGames
    .filter((g) => {
      if (sportFilter && sportFilter !== "all" && sportFilter !== "todos") {
        if (g.sport.toLowerCase() !== sportFilter) return false;
      }
      if (leagueFilter && leagueFilter !== "all" && leagueFilter !== "todas") {
        if (g.league.toLowerCase() !== leagueFilter) return false;
      }
      return true;
    })
    .slice()
    .sort((a, b) => {
      const aRank = a.status === "LIVE" ? 0 : a.status === "NS" ? 1 : 2;
      const bRank = b.status === "LIVE" ? 0 : b.status === "NS" ? 1 : 2;
      if (aRank !== bRank) return aRank - bRank;
      if (aRank === 2) return (b.kickoffUtc || "").localeCompare(a.kickoffUtc || "");
      return compareShellGamePriority(a, b);
    });

  const matchedEntries: Array<{ readonly game: PlatformGame; readonly catalog: MatchPicksCatalog }> = [];
  const potdPool: CatalogPickItem[] = [];
  let totalMatchedPicks = 0;

  for (const game of prefilteredGames) {
    const gameMatchesQ =
      qNorm.length === 0 ||
      normalizeSearchToken(
        `${game.home.name} ${game.home.shortName} ${game.away.name} ${game.away.shortName} ${game.leagueLabel}`,
      ).includes(qNorm);

    const rawCatalog = getOrBuildEnrichedCatalogForGame(bundle, game, params.fullAccess, true);
    if (rawCatalog.picks.length === 0) continue;

    const includeTrivial = params.includeTrivial === true;
    const filteredPicks = rawCatalog.picks.filter((pk) => {
      if (pk.isRedacted) {
        return gameMatchesQ;
      }
      if (pk.gameStatus !== "FT") {
        if (!includeTrivial && pk.recommendationTier === "trivial_odds") {
          return false;
        }
        if (params.onlyRecommended === true && pk.isRecommendedByModel !== true) {
          return false;
        }
      }
      if (!gameMatchesQ) {
        const hay = normalizeSearchToken(
          `${pk.label} ${pk.familyLabel} ${pk.playerMeta?.playerName ?? ""}`,
        );
        return hay.includes(qNorm);
      }
      return true;
    });

    if (filteredPicks.length === 0) continue;

    const finalCatalog =
      filteredPicks.length === rawCatalog.picks.length
        ? rawCatalog
        : rebuildFilteredCatalog(rawCatalog, filteredPicks);

    matchedEntries.push({ game, catalog: finalCatalog });
    totalMatchedPicks += finalCatalog.picks.length;

    if (game.status !== "FT") {
      for (const pk of finalCatalog.picks) {
        if (!pk.isRedacted) potdPool.push(pk);
      }
    }
  }

  const totalMatchedGames = matchedEntries.length;
  const start = (page - 1) * pageSize;
  const slice = matchedEntries.slice(start, start + pageSize);
  const catalogs: Record<string, MatchPicksCatalog> = {};
  for (const entry of slice) {
    catalogs[entry.game.id] = entry.catalog;
  }

  const picksOfTheDay = selectPicksOfTheDay(potdPool, 3);

  return {
    ok: true,
    generatedAtUtc: new Date().toISOString(),
    fullAccess: params.fullAccess,
    totalMatchedGames,
    totalMatchedPicks,
    page,
    pageSize,
    hasMore: start + slice.length < totalMatchedGames,
    picksOfTheDay,
    catalogs,
  };
}

function buildAvailableLines(
  defaultLine: number,
  step: number,
  minVal: number,
  maxVal: number,
): readonly number[] {
  const candidates = new Set<number>();
  for (let offset = -2; offset <= 2; offset += 1) {
    const val = Math.round((defaultLine + offset * step) * 10) / 10;
    if (val >= minVal && val <= maxVal) {
      candidates.add(val);
    }
  }
  candidates.add(defaultLine);
  return Array.from(candidates).sort((a, b) => a - b);
}

function buildPlayerLabBars(
  league: string,
  leagueLabel: string,
  teamSlug: string,
  playerName: string,
  sport: PlatformGame["sport"],
  statKey: string,
): readonly PickLabMatchBar[] {
  const squads = loadCachedLeagueSquads(league);
  const teamEntry = findSquadTeamEntry(squads, teamSlug);
  if (!teamEntry) return [];
  const normPlayer = normalizeSearchToken(playerName);
  const matchedPlayer = teamEntry.players.find(
    (p) => normalizeSearchToken(p.name) === normPlayer || p.slug === normPlayer.replace(/\s+/g, "-"),
  );
  if (!matchedPlayer?.recentGames || matchedPlayer.recentGames.length === 0) return [];

  const minGuard =
    sport === "football"
      ? FOOTBALL_STARTER_MIN_MINUTES
      : sport === "basketball"
        ? NBA_STARTER_MIN_MINUTES
        : 0;

  const statMatchers: Record<string, readonly string[]> = {
    PTS: ["pts", "puntos"],
    REB: ["reb", "rebotes"],
    AST: ["ast", "asistencias"],
    "3PM": ["3pm", "tpm", "triples"],
    shots: ["tiros", "remates", "shot"],
    shots_on_target: ["puerta", "sot", "arco"],
    goal_or_assist: ["gol", "asist", "goal", "assist"],
    fouls: ["falta", "foul"],
    cards: ["amarill", "tarjeta", "yellow"],
  };
  const keys = statMatchers[statKey] ?? [statKey.toLowerCase()];

  const bars: PickLabMatchBar[] = [];
  for (let i = 0; i < matchedPlayer.recentGames.length; i += 1) {
    const rg = matchedPlayer.recentGames[i]!;
    const minHit = rg.stats.find((st) => {
      const u = st.label.trim().toUpperCase();
      return u === "MIN" || u === "MINS" || u === "MINUTOS";
    });
    const mins = minHit ? parseStatNumeric(minHit.value) : null;
    if (minGuard > 0 && (mins === null || mins < minGuard)) continue;

    let value: number | null = null;
    if (statKey === "goal_or_assist") {
      const gHit = rg.stats.find((st) => {
        const norm = normalizeSearchToken(st.label);
        return norm.includes("gol") || norm.includes("goal");
      });
      const aHit = rg.stats.find((st) => {
        const norm = normalizeSearchToken(st.label);
        return norm.includes("asist") || norm.includes("assist");
      });
      const gv = gHit ? parseStatNumeric(gHit.value) : null;
      const av = aHit ? parseStatNumeric(aHit.value) : null;
      if (gv !== null || av !== null) value = (gv ?? 0) + (av ?? 0);
    } else {
      const hit = rg.stats.find((st) => {
        const norm = normalizeSearchToken(st.label);
        return keys.some((k) => norm === k || norm.includes(k));
      });
      value = hit ? parseStatNumeric(hit.value) : null;
    }

    if (value === null) continue;
    const oppName = isSafePublicLabel(rg.opponent) ? rg.opponent : "Rival";
    const oppShort = rg.opponentAbbr && isSafePublicLabel(rg.opponentAbbr) ? rg.opponentAbbr : oppName;
    const oppSlug = cleanTeamRouteSlug(oppName.toLowerCase().replace(/[^a-z0-9]+/g, "-"));

    bars.push({
      id: `${matchedPlayer.slug}:${rg.dateIso}:${i}`,
      dateLabel: formatShortDateMx(rg.dateIso),
      opponentName: oppName,
      opponentShort: oppShort,
      opponentSlug: oppSlug,
      leagueLabel,
      isHome: rg.isHome !== false,
      value,
      minutesPlayed: mins !== null ? Math.round(mins) : null,
      scoreLabel: rg.score ?? null,
      gf: null,
      gc: null,
    });
  }

  return bars.reverse();
}

function historyToLabBars(
  entries: readonly CachedTeamHistoryEntry[],
  mode: "total" | "for" | "against",
): readonly PickLabMatchBar[] {
  return entries
    .slice()
    .reverse()
    .map((rec) => ({
      id: rec.id,
      dateLabel: formatShortDateMx(rec.dateIso),
      opponentName: rec.opponentName,
      opponentShort: rec.opponentShort,
      opponentSlug: rec.opponentSlug,
      leagueLabel: rec.leagueLabel,
      isHome: rec.isHome,
      value:
        mode === "total"
          ? rec.goalsFor + rec.goalsAgainst
          : mode === "for"
            ? rec.goalsFor
            : rec.goalsAgainst,
      minutesPlayed: null,
      scoreLabel: `${rec.goalsFor}-${rec.goalsAgainst}`,
      gf: rec.goalsFor,
      gc: rec.goalsAgainst,
    }));
}

function historyToRecentRows(
  entries: readonly CachedTeamHistoryEntry[],
  teamShortName: string,
): PickLabResponsePayload["recentHistory"] {
  return entries.slice(0, 12).map((rec) => ({
    id: rec.id,
    dateLabel: formatShortDateMx(rec.dateIso),
    matchLabel: rec.isHome
      ? `${teamShortName} vs ${rec.opponentShort}`
      : `${rec.opponentShort} vs ${teamShortName}`,
    scoreLabel: `${rec.goalsFor}-${rec.goalsAgainst}`,
    gf: rec.goalsFor,
    gc: rec.goalsAgainst,
    result: rec.goalsFor > rec.goalsAgainst ? "W" : rec.goalsFor < rec.goalsAgainst ? "L" : "D",
  }));
}

function findGameForPickId(bundle: DatasetMemoBundle, pickId: string): PlatformGame | null {
  const catIdx = pickId.indexOf("__cat__");
  if (catIdx > 0) {
    const candidateGameId = pickId.slice(0, catIdx);
    const direct = bundle.gamesById.get(candidateGameId);
    if (direct) return direct;
  }
  const sepIdx = pickId.indexOf("__");
  if (sepIdx > 0) {
    const prefix = pickId.slice(0, sepIdx);
    const direct = bundle.gamesById.get(prefix);
    if (direct) return direct;
  }
  for (const g of bundle.value.games) {
    if (g.picks.some((p) => p.id === pickId)) return g;
    if (pickId.startsWith(`${g.id}__`) || pickId.startsWith(`${g.id}:`)) return g;
  }
  return null;
}

export async function loadPickEvidenceLabData(
  pickId: string,
  fullAccess: boolean,
): Promise<PickLabResponsePayload | null> {
  const cleanId = pickId.trim();
  if (
    !cleanId ||
    cleanId.length > 220 ||
    cleanId.includes("..") ||
    cleanId.includes("__locked__") ||
    !SAFE_ENTITY_ID_RE.test(cleanId)
  ) {
    return null;
  }

  const bundle = getDatasetMemoBundle();
  const rawGame = findGameForPickId(bundle, cleanId);
  if (!rawGame) return null;

  const catalog = getOrBuildEnrichedCatalogForGame(bundle, rawGame, fullAccess, false);
  const pick = catalog.picks.find((p) => p.id === cleanId);
  if (!pick || pick.isRedacted) return null;

  const allowFull = fullAccess || rawGame.status === "FT";
  if (!allowFull && !pick.isDailyOpenPromo && !pick.isTipsterWeeklyOpen) {
    return null;
  }

  const homeHistory = loadTeamHistoryForGame(bundle, rawGame.league, rawGame.home.slug, 20);
  const awayHistory = loadTeamHistoryForGame(bundle, rawGame.league, rawGame.away.slug, 20);
  const unit = sportScoringUnit(rawGame.sport);

  let entityKind: "player" | "team" | "match" = "match";
  let entityName = `${rawGame.home.shortName} vs ${rawGame.away.shortName}`;
  let entitySubtitle = `${rawGame.leagueLabel} · ${pick.familyLabel}`;
  let entityPhotoKey: string | null = null;
  let entityTeamSlug: string | null = rawGame.home.slug;
  let metricKey = "total_goals";
  let metricLabel = rawGame.sport === "football" || rawGame.sport === "ice-hockey"
    ? "Goles totales"
    : rawGame.sport === "baseball"
      ? "Carreras totales"
      : "Puntos totales";
  let defaultLine = pick.line ?? (rawGame.sport === "football" ? 2.5 : 1.5);
  let defaultDirection: "over" | "under" = pick.direction === "under" || pick.direction === "no" ? "under" : "over";
  let availableLines: readonly number[] = [0.5, 1.5, 2.5, 3.5, 4.5];
  let barsFor: readonly PickLabMatchBar[] = [];
  let barsAgainst: readonly PickLabMatchBar[] = [];
  let recentHistory = historyToRecentRows(homeHistory, rawGame.home.shortName);

  const sel = pick.selectionKey.toLowerCase();
  const isCountOnlyFamily =
    pick.family === "corners_total" ||
    pick.family === "corners_team" ||
    pick.family === "shots_total" ||
    pick.family === "shots_on_target" ||
    pick.family === "fouls_total" ||
    pick.family === "cards_total";

  if (pick.playerMeta) {
    const pm = pick.playerMeta;
    const isHomePlayer = pm.teamSide === "home";
    const teamSlug = pm.teamSlug ?? (isHomePlayer ? rawGame.home.slug : rawGame.away.slug);
    const teamHist = isHomePlayer ? homeHistory : awayHistory;
    const teamShort = isHomePlayer ? rawGame.home.shortName : rawGame.away.shortName;

    entityKind = "player";
    entityName = pm.playerName;
    entitySubtitle = `${pm.teamName} · ${pm.position} · ${pm.statLabel}`;
    entityPhotoKey = sanitizeServerPhotoKey(pm.photoKey);
    entityTeamSlug = teamSlug;
    metricKey = pm.statKey;
    metricLabel = pm.statLabel;
    defaultLine = pick.line ?? 0.5;
    defaultDirection = pick.direction === "under" ? "under" : "over";
    availableLines =
      pm.statKey === "PTS"
        ? buildAvailableLines(defaultLine, 2, 4.5, 45.5)
        : pm.statKey === "REB" || pm.statKey === "AST"
          ? buildAvailableLines(defaultLine, 1, 0.5, 20.5)
          : buildAvailableLines(defaultLine, 1, 0.5, 6.5);
    barsFor = buildPlayerLabBars(
      rawGame.league,
      rawGame.leagueLabel,
      teamSlug,
      pm.playerName,
      rawGame.sport,
      pm.statKey,
    );
    barsAgainst = [];
    recentHistory = historyToRecentRows(teamHist, teamShort);
  } else {
    const isMatchLevel =
      pick.family === "totals" ||
      pick.family === "btts" ||
      pick.family === "nba_totals" ||
      pick.family === "mlb_totals" ||
      pick.family === "nhl_totals" ||
      pick.family === "nfl_totals" ||
      pick.family === "corners_total" ||
      pick.family === "shots_total" ||
      pick.family === "shots_on_target" ||
      pick.family === "fouls_total" ||
      pick.family === "cards_total" ||
      sel === "draw" ||
      sel === "12";

    const isAwaySide =
      !isMatchLevel &&
      (pick.direction === "away" ||
        sel.startsWith("away") ||
        sel === "2" ||
        sel === "x2" ||
        sel.startsWith("x2_") ||
        sel === "dnb_away" ||
        sel === "ht_away" ||
        sel === "2h_away" ||
        sel === "f5_away");

    const subjectTeam = isAwaySide ? rawGame.away : rawGame.home;
    const subjectHistory = isAwaySide ? awayHistory : homeHistory;

    if (!isMatchLevel) {
      entityKind = "team";
      entityName = subjectTeam.name;
      entitySubtitle = `${rawGame.leagueLabel} · ${pick.familyLabel}`;
      entityTeamSlug = subjectTeam.slug;
      recentHistory = historyToRecentRows(subjectHistory, subjectTeam.shortName);
    }

    if (isCountOnlyFamily) {
      metricKey = pick.family;
      metricLabel = pick.familyLabel;
      defaultLine = pick.line ?? 8.5;
      defaultDirection = pick.direction === "under" ? "under" : "over";
      availableLines = buildAvailableLines(defaultLine, 1, 0.5, 40.5);
      barsFor = [];
      barsAgainst = [];
    } else if (
      pick.family === "totals" ||
      pick.family === "btts" ||
      pick.family === "nba_totals" ||
      pick.family === "mlb_totals" ||
      pick.family === "nhl_totals" ||
      pick.family === "nfl_totals" ||
      pick.family === "combo_1x2_over"
    ) {
      const step = rawGame.sport === "basketball" ? 4 : rawGame.sport === "american-football" ? 3 : 1;
      metricKey = rawGame.sport === "football" || rawGame.sport === "ice-hockey"
        ? "total_goals"
        : rawGame.sport === "baseball"
          ? "total_runs"
          : "total_points";
      metricLabel = `${unit.plural.charAt(0).toUpperCase()}${unit.plural.slice(1)} totales`;
      defaultLine = pick.line ?? (pick.family === "btts" ? 1.5 : 2.5);
      defaultDirection = pick.direction === "under" || pick.direction === "no" ? "under" : "over";
      availableLines = buildAvailableLines(defaultLine, step, 0.5, 280.5);
      barsFor = historyToLabBars(isMatchLevel ? homeHistory : subjectHistory, "total");
      barsAgainst = historyToLabBars(isMatchLevel ? awayHistory : (isAwaySide ? homeHistory : awayHistory), "total");
    } else if (pick.family === "clean_sheet") {
      metricKey = "goals_against";
      metricLabel = "Goles recibidos";
      defaultLine = 0.5;
      defaultDirection = pick.direction === "yes" ? "under" : "over";
      availableLines = [0.5, 1.5, 2.5];
      barsFor = historyToLabBars(subjectHistory, "against");
      barsAgainst = historyToLabBars(isAwaySide ? homeHistory : awayHistory, "for");
    } else {
      const avgFor =
        subjectHistory.length > 0
          ? subjectHistory.reduce((acc, r) => acc + r.goalsFor, 0) / subjectHistory.length
          : rawGame.sport === "basketball"
            ? 110.5
            : rawGame.sport === "american-football"
              ? 21.5
              : 1.5;
      const step = rawGame.sport === "basketball" ? 3 : rawGame.sport === "american-football" ? 3 : 1;
      const fallbackLine =
        rawGame.sport === "football"
          ? 0.5
          : Math.max(0.5, Math.round(avgFor - 0.5) + 0.5);
      metricKey = rawGame.sport === "football" || rawGame.sport === "ice-hockey"
        ? "goals_for"
        : rawGame.sport === "baseball"
          ? "runs_for"
          : "points_for";
      metricLabel = `${unit.plural.charAt(0).toUpperCase()}${unit.plural.slice(1)} por partido`;
      defaultLine = pick.family === "team_totals" && pick.line !== null ? pick.line : fallbackLine;
      defaultDirection = pick.direction === "under" ? "under" : "over";
      availableLines = buildAvailableLines(defaultLine, step, 0.5, 160.5);
      barsFor = historyToLabBars(subjectHistory, "for");
      barsAgainst = historyToLabBars(subjectHistory, "against");
    }
  }

  const relatedPicks = catalog.picks
    .filter((item) => {
      if (item.id === pick.id || item.isRedacted) return false;
      if (!allowFull && !item.isDailyOpenPromo && !item.isTipsterWeeklyOpen) return false;
      if (item.recommendationTier === "trivial_odds") return false;
      return true;
    })
    .slice()
    .sort((a, b) => {
      const aSamePlayer =
        pick.playerMeta && a.playerMeta?.playerName === pick.playerMeta.playerName ? 1 : 0;
      const bSamePlayer =
        pick.playerMeta && b.playerMeta?.playerName === pick.playerMeta.playerName ? 1 : 0;
      if (aSamePlayer !== bSamePlayer) return bSamePlayer - aSamePlayer;
      const aSameCat = a.category === pick.category ? 1 : 0;
      const bSameCat = b.category === pick.category ? 1 : 0;
      if (aSameCat !== bSameCat) return bSameCat - aSameCat;
      return (b.recommendationScore ?? 0) - (a.recommendationScore ?? 0);
    })
    .slice(0, 8);

  return {
    ok: true,
    pick,
    gameId: rawGame.id,
    matchLabel: `${rawGame.home.shortName} vs ${rawGame.away.shortName}`,
    league: rawGame.league,
    leagueLabel: rawGame.leagueLabel,
    homeTeam: {
      slug: rawGame.home.slug,
      name: rawGame.home.name,
      shortName: rawGame.home.shortName,
    },
    awayTeam: {
      slug: rawGame.away.slug,
      name: rawGame.away.name,
      shortName: rawGame.away.shortName,
    },
    entityKind,
    entityName,
    entitySubtitle,
    entityPhotoKey,
    entityTeamSlug,
    metricKey,
    metricLabel,
    defaultLine,
    defaultDirection,
    availableLines,
    barsFor,
    barsAgainst,
    recentHistory,
    relatedPicks,
  };
}

function buildTeamFormTokens(
  entries: readonly CachedTeamHistoryEntry[],
  limit = 5,
): readonly string[] {
  return entries
    .slice(0, limit)
    .reverse()
    .map((rec) => (rec.goalsFor > rec.goalsAgainst ? "W" : rec.goalsFor < rec.goalsAgainst ? "L" : "D"));
}

function loadSafeLeagueSnapshotData(league: string) {
  try {
    const env = loadLeagueSnapshotEnvelope(league as ProductLeague);
    return env?.data ?? null;
  } catch (err) {
    void err;
    return null;
  }
}

async function loadGameDetailForAccess(
  gameId: string,
  hasSession: boolean,
): Promise<PlatformGameDetail | null> {
  const bundle = getDatasetMemoBundle();
  const rawGame = bundle.gamesById.get(gameId);
  const game = hasSession
    ? rawGame
    : getRedactedMemo(bundle).gamesById.get(gameId);
  if (!game || !rawGame) return null;

  const homeHistory = loadTeamHistoryForGame(bundle, rawGame.league, rawGame.home.slug, 20);
  const awayHistory = loadTeamHistoryForGame(bundle, rawGame.league, rawGame.away.slug, 20);
  const squads = loadCachedLeagueSquads(rawGame.league);
  const homeSquad = findSquadTeamEntry(squads, rawGame.home.slug);
  const awaySquad = findSquadTeamEntry(squads, rawGame.away.slug);
  const leagueInjuries = loadCachedLeagueInjuries(rawGame.league);
  const snapshot = loadSafeLeagueSnapshotData(rawGame.league);
  const allowFull = hasSession || rawGame.status === "FT";

  const enrichedLineups = buildEnrichedMatchLineups({
    game: rawGame,
    homeSquad,
    awaySquad,
    confirmedLineups: rawGame.preGame?.confirmedLineups ?? null,
    probableLineups: rawGame.preGame?.probableLineups ?? null,
    sanitizePhotoKey: sanitizeServerPhotoKey,
  });
  const enfrentamientos = buildMatchEnfrentamientos({
    game: rawGame,
    leagueLabel: rawGame.leagueLabel,
    snapshot,
    homeHistory,
    awayHistory,
    allowFull,
    resolveCanonicalSlug: canonicalTeamSlugKey,
  });
  const injuries = buildEnrichedMatchInjuries({
    game: rawGame,
    allowFull,
    leagueInjuries,
    homeSquad,
    awaySquad,
    sanitizePhotoKey: sanitizeServerPhotoKey,
    resolveCanonicalSlug: canonicalTeamSlugKey,
  });

  if (!hasSession && game.status !== "FT") {
    const picksCatalog = buildServerMatchPicksCatalog(rawGame, {
      fullAccess: false,
      markets: rawGame.markets,
      homeHistory,
      awayHistory,
      unlockedPickIds: collectOpenPromoPickIds(bundle.value),
    });
    return {
      markets: [],
      headToHead: game.headToHead,
      factors: [],
      picksCatalog,
      enrichedLineups,
      enfrentamientos,
      playerPicks: [],
      injuries,
    };
  }

  const enriched = getOrBuildEnrichedGameMarkets(bundle, game);
  const frozenMainPick =
    game.status !== "FT" ? await resolveServerFrozenMainPick(game) : null;
  const gamePlayerProps = getGamePlayerProps(bundle, rawGame.id);
  const footballPlayers = extractFootballCandidatesForGame(rawGame);
  const nbaPlayers = extractNbaCandidatesForGame(rawGame);

  const picksCatalog = buildServerMatchPicksCatalog(rawGame, {
    fullAccess: hasSession,
    markets: enriched.markets,
    v5: enriched.v5,
    homeHistory,
    awayHistory,
    footballPlayers,
    nbaPlayers,
    playerProps: gamePlayerProps,
    unlockedPickIds: collectOpenPromoPickIds(bundle.value),
  });
  const playerPicks = buildMatchPlayerPicks({
    game: rawGame,
    allowFull: true,
    catalog: picksCatalog,
    homeSquad,
    awaySquad,
    sanitizePhotoKey: sanitizeServerPhotoKey,
  });
  return {
    markets: enriched.markets,
    headToHead: game.headToHead,
    factors: game.factors,
    outlook: enriched.outlook,
    v5: enriched.v5,
    frozenMainPick,
    picksCatalog,
    enrichedLineups,
    enfrentamientos,
    playerPicks,
    injuries,
  };
}

export async function loadGameDetail(gameId: string): Promise<PlatformGameDetail | null> {
  const hasSession = await hasAuthenticatedBetaSession();
  return loadGameDetailForAccess(gameId, hasSession);
}

export async function loadGamePreviewPayload(
  gameId: string,
  fullAccess: boolean,
): Promise<GamePreviewPayload | null> {
  const cleanId = gameId.trim();
  if (
    !cleanId ||
    cleanId.length > 160 ||
    cleanId.includes("..") ||
    !SAFE_ENTITY_ID_RE.test(cleanId)
  ) {
    return null;
  }

  const bundle = getDatasetMemoBundle();
  const rawGame = bundle.gamesById.get(cleanId);
  if (!rawGame) return null;

  const allowFull = fullAccess || rawGame.status === "FT";
  const detail = await loadGameDetailForAccess(cleanId, fullAccess);
  if (!detail) return null;

  const homeHistory = loadTeamHistoryForGame(bundle, rawGame.league, rawGame.home.slug, 5);
  const awayHistory = loadTeamHistoryForGame(bundle, rawGame.league, rawGame.away.slug, 5);

  const rawRefName = (rawGame.referee ?? rawGame.preGame?.matchContext?.referee ?? "").trim();
  const refereeName = rawRefName && isSafePublicLabel(rawRefName) ? rawRefName : null;
  let refereeSlug: string | null = null;
  if (refereeName) {
    const candidateSlug = slugifyRefereeName(refereeName);
    if (parseCanonicalPublicSlug(candidateSlug)) {
      try {
        const ranking = loadLeagueRefereeRanking(rawGame.league);
        if (ranking?.referees.some((r) => r.slug === candidateSlug)) {
          refereeSlug = candidateSlug;
        }
      } catch (err) {
        void err;
        refereeSlug = null;
      }
    }
  }

  let standings: unknown | null = null;
  try {
    standings = buildLeagueStandingsSplits(rawGame.league);
  } catch (err) {
    void err;
    standings = null;
  }

  const venueName =
    rawGame.venue && isSafePublicLabel(rawGame.venue) ? rawGame.venue.trim() : null;

  const x12: readonly [number, number, number] =
    allowFull && rawGame.x12
      ? [rawGame.x12[0], rawGame.x12[1], rawGame.x12[2]]
      : [0, 0, 0];

  const projection =
    allowFull && rawGame.projection
      ? { home: rawGame.projection.home, away: rawGame.projection.away }
      : null;

  const previewDetail: PlatformGameDetail = {
    markets: [],
    headToHead: detail.headToHead,
    factors: detail.factors,
    ...(detail.v5 !== undefined ? { v5: detail.v5 } : {}),
    ...(detail.frozenMainPick !== undefined ? { frozenMainPick: detail.frozenMainPick } : {}),
    ...(detail.picksCatalog !== undefined ? { picksCatalog: detail.picksCatalog } : {}),
    ...(detail.enrichedLineups !== undefined ? { enrichedLineups: detail.enrichedLineups } : {}),
    ...(detail.enfrentamientos !== undefined ? { enfrentamientos: detail.enfrentamientos } : {}),
    ...(detail.playerPicks !== undefined ? { playerPicks: detail.playerPicks } : {}),
    ...(detail.injuries !== undefined ? { injuries: detail.injuries } : {}),
  };

  return {
    ok: true,
    gameId: rawGame.id,
    fullAccess,
    game: {
      id: rawGame.id,
      slug: canonicalGameSlug(rawGame),
      league: rawGame.league,
      leagueLabel: rawGame.leagueLabel,
      sport: rawGame.sport,
      status: rawGame.status,
      kickoffUtc: rawGame.kickoffUtc,
      kickoffLocal: rawGame.kickoffLocal,
      canonicalHref: canonicalGameHref(rawGame.league, rawGame),
      venueName,
      refereeName,
      refereeSlug,
      score: rawGame.score ? { home: rawGame.score.home, away: rawGame.score.away } : null,
      projection,
      x12,
      home: {
        slug: rawGame.home.slug,
        name: rawGame.home.name,
        shortName: rawGame.home.shortName,
        form: buildTeamFormTokens(homeHistory, 5),
      },
      away: {
        slug: rawGame.away.slug,
        name: rawGame.away.name,
        shortName: rawGame.away.shortName,
        form: buildTeamFormTokens(awayHistory, 5),
      },
    },
    detail: previewDetail,
    standings,
    injuries: detail.injuries ?? [],
  };
}

export async function hasAuthenticatedBetaSession(): Promise<boolean> {
  return (await getViewerAccess()).fullAccess;
}

async function resolvePublicWeeklyPick(
  fullDataset: PlatformDataset,
  rawSlug: string,
): Promise<{ unlockedPickId: string; gameId: string; slug: string } | null> {
  const clean = rawSlug.trim().toLowerCase();
  if (!clean || !/^[a-z0-9-]{3,64}$/.test(clean) || clean.includes("__")) {
    return null;
  }

  const url = process.env.DATABASE_URL;
  if (accountsEnabled() && url) {
    try {
      flagDb ??= createDb(url);
      const rows = await flagDb
        .select({
          unlockedPickId: publicWeeklyPicks.unlockedPickId,
          gameId: publicWeeklyPicks.gameId,
          publishedAt: publicWeeklyPicks.publishedAt,
        })
        .from(publicWeeklyPicks)
        .where(eq(publicWeeklyPicks.publicSlug, clean));
      if (rows.length > 0) {
        const latest = rows
          .slice()
          .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())[0]!;
        const exists = fullDataset.games.some(
          (g) => g.id === latest.gameId && g.picks.some((p) => p.id === latest.unlockedPickId),
        );
        if (exists) {
          return { unlockedPickId: latest.unlockedPickId, gameId: latest.gameId, slug: clean };
        }
      }
    } catch (err) {
      void err;
    }
  }

  const upcomingGames = fullDataset.games.filter((g) => g.status !== "FT");
  for (const g of upcomingGames) {
    const openWeekly = g.picks.find(
      (p) => Boolean(p.isTipsterWeeklyOpen) && p.tipsterSlug?.toLowerCase() === clean,
    );
    if (openWeekly) {
      return { unlockedPickId: openWeekly.id, gameId: g.id, slug: clean };
    }
  }

  if (clean === "carlos-sem" && upcomingGames[2]?.picks[0]) {
    return {
      unlockedPickId: upcomingGames[2].picks[0].id,
      gameId: upcomingGames[2].id,
      slug: clean,
    };
  }
  if (clean === "diego-sem" && upcomingGames[3]?.picks[0]) {
    return {
      unlockedPickId: upcomingGames[3].picks[0].id,
      gameId: upcomingGames[3].id,
      slug: clean,
    };
  }

  return null;
}

function stripPublicProviderLogoUrl(url?: string): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("/")) return trimmed;
  try {
    const host = new URL(trimmed).hostname.toLowerCase();
    if (FORBIDDEN_PROVIDER_TOKENS.some((tok) => host.includes(tok))) {
      return undefined;
    }
    return trimmed;
  } catch (err) {
    void err;
    return undefined;
  }
}

function sanitizePublicDatasetGame(g: PlatformGame): PlatformGame {
  const cleanLeagueLogo = stripPublicProviderLogoUrl(g.leagueLogoUrl);
  const cleanHomeLogo = stripPublicProviderLogoUrl(g.home.logoUrl);
  const cleanAwayLogo = stripPublicProviderLogoUrl(g.away.logoUrl);

  const home: PlatformGame["home"] = { ...g.home };
  if (cleanHomeLogo) {
    home.logoUrl = cleanHomeLogo;
  } else {
    delete home.logoUrl;
  }

  const away: PlatformGame["away"] = { ...g.away };
  if (cleanAwayLogo) {
    away.logoUrl = cleanAwayLogo;
  } else {
    delete away.logoUrl;
  }

  const next: PlatformGame = {
    ...g,
    home,
    away,
  };
  if (cleanLeagueLogo) {
    next.leagueLogoUrl = cleanLeagueLogo;
  } else {
    delete next.leagueLogoUrl;
  }
  return next;
}

function sanitizePublicDataset(dataset: PlatformDataset): PlatformDataset {
  return {
    ...dataset,
    teams: [],
    leagues: dataset.leagues.map((lg) => {
      const cleanLogo = stripPublicProviderLogoUrl(lg.logoUrl);
      const next = { ...lg };
      if (cleanLogo) {
        next.logoUrl = cleanLogo;
      } else {
        delete next.logoUrl;
      }
      return next;
    }),
    games: dataset.games.map(sanitizePublicDatasetGame),
  };
}

export async function loadPublicPlatformState(
  publicTipsterSlugOrPickId?: string,
): Promise<LoadedPlatformState> {
  const fullDataset = buildServerRawPlatformDataset();
  const access = await getViewerAccess();
  const currentPaymentMode = paymentMode();
  const hasActiveSession = access.fullAccess;
  const resolvedWeekly = publicTipsterSlugOrPickId
    ? await resolvePublicWeeklyPick(fullDataset, publicTipsterSlugOrPickId)
    : null;
  const publicPickResolved = publicTipsterSlugOrPickId ? resolvedWeekly !== null : undefined;

  if (hasActiveSession) {
    if (publicTipsterSlugOrPickId && !resolvedWeekly) {
      return {
        dataset: {
          ...withoutGameDetail(redactDatasetForVisitor(fullDataset)),
          leagues: [],
          games: [],
          teams: [],
        },
        initialRole: access.isAdmin ? "admin" : access.isTipster ? "tipster" : "member",
        hasActiveSession: true,
        allowRoleSimulation: previewToolsEnabled(access.isAdmin),
        accountsEnabled: accountsEnabled(),
        viewerVia: access.via,
        paymentMode: currentPaymentMode,
        serverMonth1NoCardMode: await loadMonth1Flag(),
        viewerIdentity: await loadViewerIdentity(),
        publicPickResolved: false,
      };
    }
    const baseMemberDataset = withoutGameDetail(fullDataset);
    const memberDataset = resolvedWeekly
      ? sanitizePublicDataset({
          ...baseMemberDataset,
          leagues: [],
          teams: [],
          games: baseMemberDataset.games
            .filter((g) => g.id === resolvedWeekly.gameId)
            .map((g) => ({
              ...g,
              picks: g.picks.map((p) =>
                p.id === resolvedWeekly.unlockedPickId
                  ? { ...p, isTipsterWeeklyOpen: true, tipsterSlug: resolvedWeekly.slug }
                  : p,
              ),
            })),
        })
      : sanitizePublicDataset(baseMemberDataset);
    return {
      dataset: {
        ...memberDataset,
        serverNowUtc: new Date().toISOString(),
      },
      initialRole: access.isAdmin ? "admin" : access.isTipster ? "tipster" : "member",
      hasActiveSession: true,
      allowRoleSimulation: previewToolsEnabled(access.isAdmin),
      accountsEnabled: accountsEnabled(),
      viewerVia: access.via,
      paymentMode: currentPaymentMode,
      serverMonth1NoCardMode: await loadMonth1Flag(),
      viewerIdentity: await loadViewerIdentity(),
      publicPickResolved,
    };
  }

  const extraUnlocked = new Set<string>();
  const extraSlugs = new Map<string, string>();
  if (resolvedWeekly) {
    extraUnlocked.add(resolvedWeekly.unlockedPickId);
    extraSlugs.set(resolvedWeekly.unlockedPickId, resolvedWeekly.slug);
  }

  const redacted = withoutGameDetail(redactDatasetForVisitor(fullDataset, extraUnlocked, extraSlugs));
  const scopedDataset = publicTipsterSlugOrPickId
    ? {
        ...redacted,
        leagues: [],
        teams: [],
        games: resolvedWeekly
          ? redacted.games
              .filter((g) => g.id === resolvedWeekly.gameId)
              .map((g) =>
                sanitizePublicDatasetGame(
                  g.status === "FT"
                    ? g
                    : {
                        ...g,
                        x12: [0, 0, 0] as [number, number, number],
                        projection: { home: 0, away: 0, total: 0 },
                        confidenceScore: 0,
                      },
                ),
              )
          : [],
      }
    : sanitizePublicDataset(redacted);

  return {
    dataset: {
      ...scopedDataset,
      serverNowUtc: new Date().toISOString(),
    },
    initialRole: "visitor",
    hasActiveSession: false,
    allowRoleSimulation: false,
    accountsEnabled: accountsEnabled(),
    viewerVia: access.via,
    paymentMode: currentPaymentMode,
    serverMonth1NoCardMode: await loadMonth1Flag(),
    viewerIdentity: await loadViewerIdentity(),
    publicPickResolved,
  };
}

export async function loadClubPlatformState(
  preferredRole: ViewerRole = "member",
): Promise<LoadedPlatformState> {
  const bundle = getDatasetMemoBundle();
  const [access, serverMonth1NoCardMode] = await Promise.all([
    getViewerAccess(),
    loadMonth1Flag(),
  ]);
  const currentPaymentMode = paymentMode();
  const hasActiveSession = access.fullAccess;
  const viewerIdentity: ViewerIdentity | null = access.profile?.handle
    ? {
        handle: access.profile.handle,
        displayName: access.profile.displayName,
        initials: access.profile.initials,
        avatarUrl: access.profile.avatarUrl,
        referralCode: access.profile.referralCode,
      }
    : null;

  if (!hasActiveSession) {
    return {
      dataset: {
        ...getInitialVisitorShell(bundle),
        serverNowUtc: new Date().toISOString(),
      },
      initialRole: "visitor",
      hasActiveSession: false,
      allowRoleSimulation: false,
      accountsEnabled: accountsEnabled(),
      viewerVia: access.via,
      paymentMode: currentPaymentMode,
      serverMonth1NoCardMode,
      viewerIdentity,
    };
  }

  const resolvedRole: ViewerRole = accountsEnabled()
    ? access.isAdmin
      ? "admin"
      : access.isTipster
        ? "tipster"
        : "member"
    : preferredRole;

  return {
    dataset: {
      ...getInitialMemberShell(bundle),
      serverNowUtc: new Date().toISOString(),
    },
    initialRole: resolvedRole,
    hasActiveSession: true,
    allowRoleSimulation: previewToolsEnabled(access.isAdmin),
    accountsEnabled: accountsEnabled(),
    viewerVia: access.via,
    paymentMode: currentPaymentMode,
    serverMonth1NoCardMode,
    viewerIdentity,
  };
}
