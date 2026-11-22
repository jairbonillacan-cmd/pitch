import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  COMPETITION_BY_ID,
  isBlockedMarketQuoteBook,
  isPermittedMarketQuoteBook,
  parseStrictFiniteNumber,
  type SpacetimeAnchoredQuote,
} from "@pitchlab/contracts";
import {
  PRIORITY_COMPARISON_BOOKS,
  classifyLineMovement,
  parseBzzoiroBestOdds,
  parseBzzoiroOddsComparison,
  toSpacetimeAnchoredQuote,
  type BestOddsComparisonEntry,
  type ComparisonBookQuote,
  type LineMovementMetrics,
  type LineMovementSignal,
  type SelectionOddsComparison,
} from "@pitchlab/ingest/odds/bzzoiro-odds";
import { decimalToAmericanInt } from "@pitchlab/ui/access-guard";
import {
  formatCanonicalBookLabel,
  normalizeBookKey,
} from "@pitchlab/ui/bookmakers";
import { computeAdaptiveDeVig } from "@pitchlab/ui/picks-catalog";
import type {
  BookQuoteItem,
  MatchPick,
  PlatformDataset,
  PlatformGame,
  PlatformMarketRow,
} from "@pitchlab/ui/types";
import { isMarketFresh, teamScore } from "./spacetime";

interface RawQuoteTick {
  readonly event_id?: string;
  readonly sport?: string;
  readonly league?: string;
  readonly market?: string;
  readonly line?: number | null;
  readonly selection?: string;
  readonly book?: string;
  readonly price_decimal?: number;
  readonly opening_price?: number | null;
  readonly movement_direction?: "shortening" | "drifting" | "stable" | null;
  readonly is_best_odds?: boolean;
  readonly ts_captured?: string;
  readonly ts_event_start?: string;
}

interface RawQuotesLedger {
  readonly updated_at_utc?: string;
  readonly max_quote_age_hours?: number;
  readonly ticks?: readonly RawQuoteTick[];
}

const QUOTE_LEAGUE_TO_APP: Readonly<Record<string, string>> = {
  MEX: "liga-mx",
  "liga-mx": "liga-mx",
  ligamx: "liga-mx",
  E0: "premier-league",
  epl: "premier-league",
  "premier-league": "premier-league",
  SP1: "laliga",
  laliga: "laliga",
  D1: "bundesliga",
  bundesliga: "bundesliga",
  I1: "serie-a",
  "serie-a": "serie-a",
  F1: "ligue-1",
  "ligue-1": "ligue-1",
  NFL: "nfl",
  nfl: "nfl",
  NBA: "nba",
  nba: "nba",
  NHL: "nhl",
  nhl: "nhl",
  MLB: "mlb",
  mlb: "mlb",
};

interface ParsedEventQuotes {
  readonly appLeague: string;
  readonly gameId?: string;
  readonly homeHint: string;
  readonly awayHint: string;
  readonly eventDateYmd?: string;
  readonly kickoffMs?: number;
  readonly bySelectionKey: ReadonlyMap<string, readonly BookQuoteItem[]>;
}

interface RawSnapshotMarketLine {
  readonly gameId?: string;
  readonly homeName?: string;
  readonly awayName?: string;
  readonly market?: string;
  readonly outcome?: string;
  readonly line?: number | null;
  readonly book?: string;
  readonly decimal?: number;
  readonly openingDecimal?: number | null;
  readonly movement?: "shortening" | "drifting" | "stable" | null;
  readonly capturedAtUtc?: string;
}

interface RawSnapshotMarketLinesFile {
  readonly league?: string;
  readonly updatedAt?: string;
  readonly lines?: readonly RawSnapshotMarketLine[];
}

function resolveSnapshotsRoot(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "data", "snapshots"),
    path.resolve(process.cwd(), "..", "..", "data", "snapshots"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

function resolveQuotesPath(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "data", "odds_timeseries", "quotes_latest.json"),
    path.resolve(process.cwd(), "..", "..", "data", "odds_timeseries", "quotes_latest.json"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

export type BookLineMovementSignal = LineMovementSignal;
export type QuoteMovementAnalysis = LineMovementMetrics;
export type MultiBookComparisonQuote = ComparisonBookQuote;

export interface SelectionBookComparison {
  readonly market: string;
  readonly selection: string;
  readonly line: number | null;
  readonly bestBook: string;
  readonly bestBookLabel: string;
  readonly bestDecimal: number;
  readonly pinnacleDecimal: number | null;
  readonly openingConsensusDecimal: number | null;
  readonly currentConsensusDecimal: number;
  readonly deltaPct: number | null;
  readonly impliedProbDeltaPts: number | null;
  readonly signal: BookLineMovementSignal;
  readonly modelProb: number | null;
  readonly fairDecimal: number | null;
  readonly edgePts: number | null;
  readonly evPct: number | null;
  readonly anchoredQuote?: SpacetimeAnchoredQuote;
  readonly books: readonly MultiBookComparisonQuote[];
}

export interface BestMarketQuoteSummary {
  readonly matchLabel?: string;
  readonly kickoffUtc?: string;
  readonly market: string;
  readonly selection: string;
  readonly line: number | null;
  readonly book: string;
  readonly bookLabel: string;
  readonly openingDecimal: number | null;
  readonly currentDecimal: number;
  readonly deltaPct: number | null;
  readonly impliedProbDeltaPts: number | null;
  readonly signal: BookLineMovementSignal;
  readonly modelProb: number | null;
  readonly fairDecimal: number | null;
  readonly edgePts: number | null;
  readonly evPct: number | null;
  readonly anchoredQuote?: SpacetimeAnchoredQuote;
}

export const RELEVANT_COMPARISON_BOOKS: ReadonlySet<string> = PRIORITY_COMPARISON_BOOKS;

const STRICT_ISO_TIMESTAMP_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

function isValidSpacetimeProb(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0.001 && value < 0.999;
}

function normalizeIsoTimestamp(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return undefined;
  if (STRICT_ISO_TIMESTAMP_RE.test(trimmed)) return trimmed;
  return new Date(ms).toISOString();
}

function normalizeServerBookKey(raw: string): string {
  return normalizeBookKey(raw);
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function parseValidDecimal(raw: unknown): number | null {
  const n = parseStrictFiniteNumber(raw);
  if (n === null || n <= 1.01 || n > 500) return null;
  return round3(n);
}

export function classifyQuoteMovement(params: {
  openingDecimal?: number | null;
  currentDecimal: number;
  rawDirection?: string | null;
  coordinatedShorteningBooks?: number;
  sharpShortened?: boolean;
}): QuoteMovementAnalysis {
  return classifyLineMovement({
    openingDecimal: params.openingDecimal,
    currentDecimal: params.currentDecimal,
    rawMovement: params.rawDirection,
    coordinatedShorteningBooks: params.coordinatedShorteningBooks,
    sharpShortened: params.sharpShortened,
  });
}

const LINE_SCOPED_QUOTE_MARKETS: ReadonlySet<string> = new Set([
  "totals",
  "team_totals",
  "corners_total",
  "corners_team",
  "cards_total",
  "yellow_total",
  "fouls_total",
  "shots_total",
  "shots_on_target",
  "spread",
  "nba_totals",
  "nba_spread",
  "mlb_totals",
  "mlb_run_line",
  "nhl_totals",
  "nhl_puck_line",
  "nfl_totals",
  "nfl_spread",
]);

const SPREAD_LIKE_QUOTE_MARKETS: ReadonlySet<string> = new Set([
  "spread",
  "nba_spread",
  "mlb_run_line",
  "nhl_puck_line",
  "nfl_spread",
]);

const OVER_UNDER_QUOTE_MARKETS: ReadonlySet<string> = new Set([
  "totals",
  "team_totals",
  "corners_total",
  "corners_team",
  "cards_total",
  "yellow_total",
  "fouls_total",
  "shots_total",
  "shots_on_target",
  "nba_totals",
  "mlb_totals",
  "nhl_totals",
  "nfl_totals",
]);

function isLineScopedQuoteMarket(market: string): boolean {
  return (
    LINE_SCOPED_QUOTE_MARKETS.has(market) ||
    market.startsWith("team_goals_") ||
    market.startsWith("totals_")
  );
}

function isSpreadLikeQuoteMarket(market: string): boolean {
  return SPREAD_LIKE_QUOTE_MARKETS.has(market);
}

function normalizeMarketKey(rawMarket: string | undefined, rawSelection?: string): string {
  const m = (rawMarket ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const sel = (rawSelection ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");

  if (m === "h2h" || m === "1x2" || m === "moneyline" || m === "ml" || m === "match_winner") return "1x2";
  if (m === "btts" || m === "both_teams_to_score") return "btts";
  if (
    m === "team_totals" ||
    m === "team_total" ||
    m.startsWith("team_totals_") ||
    m.startsWith("team_goals_")
  ) {
    return "team_totals";
  }
  if (
    m === "totals" ||
    m === "total" ||
    m === "ou" ||
    m === "over_under" ||
    m === "total_goals" ||
    m.startsWith("totals_") ||
    m.startsWith("over_under_")
  ) {
    return "totals";
  }
  if (
    m === "corners_team" ||
    m.startsWith("corners_team_") ||
    m === "team_corners" ||
    m.startsWith("team_corners_")
  ) {
    return "corners_team";
  }
  if (
    m === "corners_total" ||
    m === "total_corners" ||
    m === "corners_over_under" ||
    m.startsWith("total_corners_") ||
    m.startsWith("corners_total_")
  ) {
    return "corners_total";
  }
  if (
    m === "cards_total" ||
    m === "total_cards" ||
    m === "cards_over_under" ||
    m.startsWith("cards_total_")
  ) {
    return "cards_total";
  }
  if (
    m === "yellow_total" ||
    m === "total_yellow_cards" ||
    m === "yellow_cards_total" ||
    m.startsWith("yellow_total_")
  ) {
    return "yellow_total";
  }
  if (
    m === "fouls_total" ||
    m === "total_fouls" ||
    m.startsWith("fouls_total_")
  ) {
    return "fouls_total";
  }
  if (
    m === "shots_on_target" ||
    m === "total_shots_on_target" ||
    m.startsWith("shots_on_target_")
  ) {
    return "shots_on_target";
  }
  if (
    m === "shots_total" ||
    m === "total_shots" ||
    m.startsWith("shots_total_")
  ) {
    return "shots_total";
  }
  if (m === "nhl_puckline" || m === "nhl_puck_line") return "nhl_puck_line";
  if (
    m === "spread" ||
    m === "spreads" ||
    m === "handicap" ||
    m === "ah" ||
    m === "asian_handicap" ||
    m.startsWith("ah_") ||
    m.startsWith("asian_handicap_")
  ) {
    return "spread";
  }
  if (m === "double_chance" || m === "dc") return "double_chance";
  if (m === "dnb" || m === "draw_no_bet") return "dnb";
  if (m === "clean_sheet") {
    if (sel.startsWith("home")) return "clean_sheet_home";
    if (sel.startsWith("away")) return "clean_sheet_away";
    return "clean_sheet";
  }
  if (m === "win_to_nil") {
    if (sel.startsWith("home")) return "win_to_nil_home";
    if (sel.startsWith("away")) return "win_to_nil_away";
    return "win_to_nil";
  }
  if (m === "clean_sheet_home" || m === "clean_sheet_away" || m === "win_to_nil_home" || m === "win_to_nil_away") {
    return m;
  }
  return m;
}

function normalizeSelectionToken(market: string, rawSelection: string | undefined): string {
  const s = (rawSelection ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (market === "1x2" || isSpreadLikeQuoteMarket(market) || market === "dnb") {
    if (s === "1" || s === "home" || s === "local" || s.startsWith("home_") || s.startsWith("local_")) {
      return "home";
    }
    if (s === "x" || s === "draw" || s === "empate") return "draw";
    if (s === "2" || s === "away" || s === "visita" || s.startsWith("away_") || s.startsWith("visita_")) {
      return "away";
    }
  }
  if (
    market === "btts" ||
    market === "clean_sheet" ||
    market === "clean_sheet_home" ||
    market === "clean_sheet_away" ||
    market === "win_to_nil" ||
    market === "win_to_nil_home" ||
    market === "win_to_nil_away"
  ) {
    if (s === "yes" || s === "si" || s === "sí" || s === "btts_yes" || s === "home_yes" || s === "away_yes" || s === "home" || s === "away") {
      return "yes";
    }
    if (s === "no" || s === "btts_no" || s === "home_no" || s === "away_no") return "no";
  }
  if (market === "team_totals" || market === "corners_team") {
    if (s.startsWith("home_over")) return "home_over";
    if (s.startsWith("home_under")) return "home_under";
    if (s.startsWith("away_over")) return "away_over";
    if (s.startsWith("away_under")) return "away_under";
  }
  if (OVER_UNDER_QUOTE_MARKETS.has(market)) {
    if (s === "over" || s.startsWith("over_") || s === "mas") return "over";
    if (s === "under" || s.startsWith("under_") || s === "menos") return "under";
  }
  if (market === "double_chance") {
    if (s === "home_or_draw" || s === "1x") return "1x";
    if (s === "away_or_draw" || s === "x2") return "x2";
    if (s === "home_or_away" || s === "12") return "12";
  }
  return s;
}

function normalizeSignedZero(v: number): number {
  const rounded = Math.round(v * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

function normalizeLineValue(
  market: string,
  line: number | null | undefined,
  rawSelection?: string,
  labelFallback?: string,
): string {
  if (!isLineScopedQuoteMarket(market)) return "null";
  if (typeof line === "number" && Number.isFinite(line)) {
    return String(normalizeSignedZero(line));
  }
  if (rawSelection) {
    const selMatch = /(?:^|[\s_])([+-]?\d+(?:\.\d+)?)$/.exec(rawSelection.trim());
    if (selMatch?.[1]) {
      const parsed = parseStrictFiniteNumber(selMatch[1]);
      if (parsed !== null) {
        return String(normalizeSignedZero(parsed));
      }
    }
  }
  if (labelFallback) {
    const parenMatch = /\(([+-]?\d+(?:\.\d+)?)\)/.exec(labelFallback);
    const match = parenMatch ?? /([+-]?\d+(?:\.\d+)?)/.exec(labelFallback);
    if (match?.[1]) {
      const parsed = parseStrictFiniteNumber(match[1]);
      if (parsed !== null) {
        return String(normalizeSignedZero(parsed));
      }
    }
  }
  return "null";
}

function inferSourceLine(
  canonicalMarket: string,
  rawMarket: unknown,
  rawLine: unknown,
): number | null {
  if (!isLineScopedQuoteMarket(canonicalMarket)) {
    return null;
  }
  const explicit = parseStrictFiniteNumber(rawLine);
  if (explicit !== null) {
    const clean = normalizeSignedZero(explicit);
    if (isSpreadLikeQuoteMarket(canonicalMarket)) return clean;
    if (clean > 0) return clean;
  }
  if (OVER_UNDER_QUOTE_MARKETS.has(canonicalMarket)) {
    const slug = String(rawMarket ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
    const suffix = /(\d{2,3})$/.exec(slug);
    if (suffix?.[1]) {
      const parsedSuffix = parseStrictFiniteNumber(suffix[1]);
      const val = parsedSuffix !== null ? parsedSuffix / 10 : Number.NaN;
      if (Number.isFinite(val) && val > 0 && val <= 30) {
        return normalizeSignedZero(val);
      }
    }
  }
  return null;
}

function sidePerspectiveLine(
  canonicalMarket: string,
  canonicalSelection: string,
  line: number | null,
): number | null {
  if (line === null) return null;
  if (isSpreadLikeQuoteMarket(canonicalMarket) && canonicalSelection === "away") {
    return line === 0 ? 0 : normalizeSignedZero(-line);
  }
  return normalizeSignedZero(line);
}

function buildSourceTickLookupKey(
  rawMarket: string | undefined,
  rawSelection: string | undefined,
  rawLine: unknown,
): string | null {
  const market = normalizeMarketKey(rawMarket, rawSelection);
  const selection = normalizeSelectionToken(market, rawSelection);
  if (!market || !selection) return null;
  const parsedLine = inferSourceLine(market, rawMarket, rawLine);
  if (isLineScopedQuoteMarket(market) && parsedLine === null) {
    return null;
  }
  const lineForSide = sidePerspectiveLine(market, selection, parsedLine);
  return `${market}|${lineForSide === null ? "null" : String(lineForSide)}|${selection}`;
}

function buildLookupKey(
  rawMarket: string | undefined,
  rawSelection: string | undefined,
  line: number | null | undefined,
  labelFallback?: string,
): string {
  const market = normalizeMarketKey(rawMarket, rawSelection);
  const selection = normalizeSelectionToken(market, rawSelection);
  const normLine = normalizeLineValue(market, line, rawSelection, labelFallback);
  return `${market}|${normLine}|${selection}`;
}

function isOlderCapture(existingUtc: string | undefined, incomingUtc: string | undefined): boolean {
  if (!existingUtc) return false;
  const existingMs = Date.parse(existingUtc);
  if (!Number.isFinite(existingMs)) return false;
  if (!incomingUtc) return true;
  const incomingMs = Date.parse(incomingUtc);
  if (!Number.isFinite(incomingMs)) return true;
  return existingMs > incomingMs;
}

function finalizeBookQuoteList(items: readonly BookQuoteItem[]): BookQuoteItem[] {
  if (items.length === 0) return [];
  const sorted = [...items].sort(
    (a, b) => b.decimal - a.decimal || a.book.localeCompare(b.book),
  );
  const bestPrice = sorted[0]!.decimal;
  return sorted.map((q) => {
    const { isBest: _staleBest, ...rest } = q;
    void _staleBest;
    return Math.abs(q.decimal - bestPrice) < 1e-6 ? { ...rest, isBest: true } : rest;
  });
}

function extractYmdFromToken(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const compact = /^(\d{8})$/.exec(trimmed);
  if (compact?.[1]) return compact[1];
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (iso?.[1] && iso[2] && iso[3]) return `${iso[1]}${iso[2]}${iso[3]}`;
  return null;
}

function ymdToUtcDayStartMs(ymd: string): number | null {
  if (!/^\d{8}$/.test(ymd)) return null;
  const y = parseStrictFiniteNumber(ymd.slice(0, 4));
  const m = parseStrictFiniteNumber(ymd.slice(4, 6));
  const d = parseStrictFiniteNumber(ymd.slice(6, 8));
  if (y === null || m === null || d === null) return null;
  const ms = Date.UTC(y, m - 1, d);
  return Number.isFinite(ms) ? ms : null;
}

function extractEventTeamHints(
  eventId: string,
  tsEventStart?: string,
): { homeHint: string; awayHint: string; eventDateYmd?: string; kickoffMs?: number } | null {
  const parts = eventId.split(":");
  if (parts.length < 6) return null;
  const homeRaw = parts[4]?.replace(/[_-]+/g, " ").trim() ?? "";
  const awayRaw = parts[5]?.replace(/[_-]+/g, " ").trim() ?? "";
  if (!homeRaw || !awayRaw) return null;
  const eventDateYmd = extractYmdFromToken(tsEventStart) ?? extractYmdFromToken(parts[3]);
  const parsedStart = tsEventStart ? Date.parse(tsEventStart) : Number.NaN;
  const kickoffMs = Number.isFinite(parsedStart) ? parsedStart : undefined;
  return {
    homeHint: homeRaw,
    awayHint: awayRaw,
    ...(eventDateYmd ? { eventDateYmd } : {}),
    ...(kickoffMs !== undefined ? { kickoffMs } : {}),
  };
}

let ledgerCache: {
  mtimeMs: number;
  hourBucket: number;
  byLeague: Map<string, ParsedEventQuotes[]>;
} | null = null;

export function parseQuotesLedgerTicks(
  ticks: readonly RawQuoteTick[],
  nowMs: number = Date.now(),
): Map<string, ParsedEventQuotes[]> {
  const eventsMap = new Map<
    string,
    {
      appLeague: string;
      homeHint: string;
      awayHint: string;
      eventDateYmd?: string;
      kickoffMs?: number;
      quotesByKey: Map<string, Map<string, BookQuoteItem>>;
    }
  >();

  for (const tick of ticks) {
    if (!tick || typeof tick !== "object") continue;
    const price = tick.price_decimal;
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 1.01 || price > 500) {
      continue;
    }
    if (!isMarketFresh(tick.ts_captured, nowMs)) continue;
    const appLeague = tick.league
      ? (QUOTE_LEAGUE_TO_APP[tick.league] ?? (COMPETITION_BY_ID[tick.league] ? tick.league : undefined))
      : undefined;
    if (!appLeague || !tick.event_id) continue;
    const hints = extractEventTeamHints(tick.event_id, tick.ts_event_start);
    if (!hints) continue;
    const book = normalizeServerBookKey(tick.book ?? "");
    const bookLabel = formatCanonicalBookLabel(book);
    if (!book || !isPermittedMarketQuoteBook(book, bookLabel)) continue;

    const selKey = buildSourceTickLookupKey(tick.market, tick.selection, tick.line);
    if (!selKey) continue;

    const eventKey = `${appLeague}::${tick.event_id}`;
    let eventBucket = eventsMap.get(eventKey);
    if (!eventBucket) {
      eventBucket = {
        appLeague,
        homeHint: hints.homeHint,
        awayHint: hints.awayHint,
        ...(hints.eventDateYmd ? { eventDateYmd: hints.eventDateYmd } : {}),
        ...(hints.kickoffMs !== undefined ? { kickoffMs: hints.kickoffMs } : {}),
        quotesByKey: new Map(),
      };
      eventsMap.set(eventKey, eventBucket);
    } else {
      if (!eventBucket.eventDateYmd && hints.eventDateYmd) eventBucket.eventDateYmd = hints.eventDateYmd;
      if (eventBucket.kickoffMs === undefined && hints.kickoffMs !== undefined) {
        eventBucket.kickoffMs = hints.kickoffMs;
      }
    }

    let bookMap = eventBucket.quotesByKey.get(selKey);
    if (!bookMap) {
      bookMap = new Map();
      eventBucket.quotesByKey.set(selKey, bookMap);
    }

    const capturedAtUtc = tick.ts_captured!;
    const existing = bookMap.get(book);
    if (existing && isOlderCapture(existing.capturedAtUtc, capturedAtUtc)) {
      continue;
    }

    const roundedDec = round3(price);
    const openingDecimal = parseValidDecimal(tick.opening_price) ?? undefined;
    const hasDirOrOpen =
      openingDecimal !== undefined ||
      (typeof tick.movement_direction === "string" && tick.movement_direction.trim().length > 0);
    const movementDirection = hasDirOrOpen
      ? classifyQuoteMovement({
          openingDecimal: openingDecimal ?? null,
          currentDecimal: roundedDec,
          rawDirection: tick.movement_direction ?? null,
        }).legacyDirection
      : undefined;

    bookMap.set(book, {
      book,
      bookLabel: formatCanonicalBookLabel(book),
      decimal: roundedDec,
      capturedAtUtc,
      ...(openingDecimal !== undefined ? { openingDecimal } : {}),
      ...(movementDirection ? { movementDirection } : {}),
    });
  }

  const byLeague = new Map<string, ParsedEventQuotes[]>();
  for (const ev of eventsMap.values()) {
    const finalizedMap = new Map<string, readonly BookQuoteItem[]>();
    for (const [k, bookMap] of ev.quotesByKey.entries()) {
      const sorted = finalizeBookQuoteList([...bookMap.values()]);
      if (sorted.length > 0) {
        finalizedMap.set(k, sorted);
      }
    }
    if (finalizedMap.size === 0) continue;
    const list = byLeague.get(ev.appLeague) ?? [];
    list.push({
      appLeague: ev.appLeague,
      homeHint: ev.homeHint,
      awayHint: ev.awayHint,
      ...(ev.eventDateYmd ? { eventDateYmd: ev.eventDateYmd } : {}),
      ...(ev.kickoffMs !== undefined ? { kickoffMs: ev.kickoffMs } : {}),
      bySelectionKey: finalizedMap,
    });
    byLeague.set(ev.appLeague, list);
  }
  return byLeague;
}

let snapshotLinesCache: {
  hourBucket: number;
  signature: string;
  scannedAtMs: number;
  root: string;
  byLeague: Map<string, ParsedEventQuotes[]>;
} | null = null;

let mergedQuotesCache: {
  key: string;
  byLeague: Map<string, ParsedEventQuotes[]>;
} | null = null;

const SNAPSHOT_DIR_SCAN_TTL_MS = 30_000;

function loadSnapshotMarketLinesByLeague(nowMs: number): {
  signature: string;
  byLeague: Map<string, ParsedEventQuotes[]>;
} {
  const root = resolveSnapshotsRoot();
  if (!root) return { signature: "", byLeague: new Map() };
  const hourBucket = Math.floor(nowMs / 3_600_000);
  if (
    snapshotLinesCache &&
    snapshotLinesCache.root === root &&
    snapshotLinesCache.hourBucket === hourBucket &&
    Math.abs(nowMs - snapshotLinesCache.scannedAtMs) < SNAPSHOT_DIR_SCAN_TTL_MS
  ) {
    return { signature: snapshotLinesCache.signature, byLeague: snapshotLinesCache.byLeague };
  }
  const files: Array<{ league: string; filePath: string; mtimeMs: number }> = [];
  try {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const fp = path.join(root, entry.name, "market-lines.json");
      if (!existsSync(fp)) continue;
      try {
        files.push({ league: entry.name, filePath: fp, mtimeMs: statSync(fp).mtimeMs });
      } catch (err) {
        void err;
      }
    }
  } catch (err) {
    void err;
    return { signature: "", byLeague: new Map() };
  }
  const signature = files.map((f) => `${f.league}:${f.mtimeMs}`).sort().join("|");
  if (
    snapshotLinesCache &&
    snapshotLinesCache.root === root &&
    snapshotLinesCache.hourBucket === hourBucket &&
    snapshotLinesCache.signature === signature
  ) {
    snapshotLinesCache.scannedAtMs = nowMs;
    return { signature, byLeague: snapshotLinesCache.byLeague };
  }

  const byLeague = new Map<string, ParsedEventQuotes[]>();
  for (const f of files) {
    try {
      const parsed = JSON.parse(readFileSync(f.filePath, "utf8")) as RawSnapshotMarketLinesFile;
      const appLeague = parsed.league && COMPETITION_BY_ID[parsed.league] ? parsed.league : f.league;
      const fallbackCaptured =
        typeof parsed.updatedAt === "string" && parsed.updatedAt.trim().length > 0
          ? parsed.updatedAt.trim()
          : undefined;
      if (!Array.isArray(parsed.lines) || parsed.lines.length === 0) continue;

      const eventsMap = new Map<
        string,
        {
          gameId: string;
          homeHint: string;
          awayHint: string;
          quotesByKey: Map<string, Map<string, BookQuoteItem>>;
        }
      >();

      for (const line of parsed.lines) {
        if (!line || typeof line !== "object" || !line.gameId) continue;
        const price = line.decimal;
        if (typeof price !== "number" || !Number.isFinite(price) || price <= 1.01 || price > 500) {
          continue;
        }
        const capturedAtUtc = line.capturedAtUtc ?? fallbackCaptured;
        if (!capturedAtUtc || !isMarketFresh(capturedAtUtc, nowMs)) continue;
        const book = normalizeServerBookKey(line.book ?? "");
        const bookLabel = formatCanonicalBookLabel(book);
        if (!book || !isPermittedMarketQuoteBook(book, bookLabel)) continue;
        const selKey = buildSourceTickLookupKey(line.market, line.outcome, line.line);
        if (!selKey) continue;

        let bucket = eventsMap.get(line.gameId);
        if (!bucket) {
          bucket = {
            gameId: line.gameId,
            homeHint: line.homeName ?? "",
            awayHint: line.awayName ?? "",
            quotesByKey: new Map(),
          };
          eventsMap.set(line.gameId, bucket);
        }
        let bookMap = bucket.quotesByKey.get(selKey);
        if (!bookMap) {
          bookMap = new Map();
          bucket.quotesByKey.set(selKey, bookMap);
        }
        const existingSnapQuote = bookMap.get(book);
        if (existingSnapQuote && isOlderCapture(existingSnapQuote.capturedAtUtc, capturedAtUtc)) {
          continue;
        }
        const roundedDec = round3(price);
        const openingDecimal = parseValidDecimal(line.openingDecimal) ?? undefined;
        const hasDirOrOpen =
          openingDecimal !== undefined ||
          line.movement === "shortening" ||
          line.movement === "drifting" ||
          line.movement === "stable";
        const movementDirection = hasDirOrOpen
          ? classifyQuoteMovement({
              openingDecimal: openingDecimal ?? null,
              currentDecimal: roundedDec,
              rawDirection: line.movement ?? null,
            }).legacyDirection
          : undefined;

        bookMap.set(book, {
          book,
          bookLabel: formatCanonicalBookLabel(book),
          decimal: roundedDec,
          capturedAtUtc,
          ...(openingDecimal !== undefined ? { openingDecimal } : {}),
          ...(movementDirection ? { movementDirection } : {}),
        });
      }

      const list: ParsedEventQuotes[] = [];
      for (const ev of eventsMap.values()) {
        const finalizedMap = new Map<string, readonly BookQuoteItem[]>();
        for (const [k, bookMap] of ev.quotesByKey.entries()) {
          const sorted = finalizeBookQuoteList([...bookMap.values()]);
          if (sorted.length > 0) {
            finalizedMap.set(k, sorted);
          }
        }
        if (finalizedMap.size === 0) continue;
        const eventDateYmd = extractYmdFromToken(ev.gameId);
        list.push({
          appLeague,
          gameId: ev.gameId,
          homeHint: ev.homeHint,
          awayHint: ev.awayHint,
          ...(eventDateYmd ? { eventDateYmd } : {}),
          bySelectionKey: finalizedMap,
        });
      }
      if (list.length > 0) {
        byLeague.set(appLeague, list);
      }
    } catch (err) {
      void err;
    }
  }

  snapshotLinesCache = { hourBucket, signature, scannedAtMs: nowMs, root, byLeague };
  return { signature, byLeague };
}

function getParsedQuotesByLeague(nowMs: number = Date.now()): Map<string, ParsedEventQuotes[]> {
  const hourBucket = Math.floor(nowMs / 3_600_000);
  const quotesPath = resolveQuotesPath();
  let quotesMtimeMs = 0;
  let ledgerMap: Map<string, ParsedEventQuotes[]> | null = null;

  if (quotesPath) {
    try {
      quotesMtimeMs = statSync(quotesPath).mtimeMs;
    } catch (err) {
      void err;
    }

    if (
      quotesMtimeMs > 0 &&
      ledgerCache &&
      ledgerCache.mtimeMs === quotesMtimeMs &&
      ledgerCache.hourBucket === hourBucket
    ) {
      ledgerMap = ledgerCache.byLeague;
    } else if (quotesMtimeMs > 0) {
      try {
        const raw = JSON.parse(readFileSync(quotesPath, "utf8")) as RawQuotesLedger;
        ledgerMap = Array.isArray(raw.ticks) ? parseQuotesLedgerTicks(raw.ticks, nowMs) : new Map();
        ledgerCache = { mtimeMs: quotesMtimeMs, hourBucket, byLeague: ledgerMap };
      } catch (err) {
        void err;
      }
    }
  }

  const { signature: snapSig, byLeague: snapshotLines } = loadSnapshotMarketLinesByLeague(nowMs);
  const cacheKey = `${hourBucket}|${quotesMtimeMs}|${snapSig}`;
  if (mergedQuotesCache && mergedQuotesCache.key === cacheKey) {
    return mergedQuotesCache.byLeague;
  }

  const merged = new Map<string, ParsedEventQuotes[]>();
  if (ledgerMap) {
    for (const [lg, list] of ledgerMap.entries()) {
      merged.set(lg, [...list]);
    }
  }
  for (const [lg, list] of snapshotLines.entries()) {
    const existing = merged.get(lg);
    merged.set(lg, existing ? [...existing, ...list] : [...list]);
  }
  mergedQuotesCache = { key: cacheKey, byLeague: merged };
  return merged;
}

function evaluateKickoffWindowMatch(
  gameKickoffMs: number | null,
  gameYmd: string | null,
  cand: ParsedEventQuotes,
): { ok: boolean; bonus: number } {
  if (gameKickoffMs === null && gameYmd === null) {
    return { ok: true, bonus: 0 };
  }
  if (gameKickoffMs !== null && cand.kickoffMs !== undefined) {
    const diffMs = Math.abs(gameKickoffMs - cand.kickoffMs);
    if (diffMs > 12 * 3_600_000) return { ok: false, bonus: 0 };
    return { ok: true, bonus: diffMs <= 3 * 3_600_000 ? 0.25 : 0.1 };
  }
  if (gameKickoffMs !== null && cand.eventDateYmd !== undefined) {
    const dayStart = ymdToUtcDayStartMs(cand.eventDateYmd);
    if (dayStart !== null) {
      const dayEnd = dayStart + 86_400_000;
      const distMs =
        gameKickoffMs < dayStart
          ? dayStart - gameKickoffMs
          : gameKickoffMs > dayEnd
            ? gameKickoffMs - dayEnd
            : 0;
      if (distMs > 12 * 3_600_000) return { ok: false, bonus: 0 };
      return { ok: true, bonus: distMs === 0 ? 0.25 : 0.05 };
    }
  }
  if (gameYmd !== null && cand.eventDateYmd !== undefined) {
    const gStart = ymdToUtcDayStartMs(gameYmd);
    const cStart = ymdToUtcDayStartMs(cand.eventDateYmd);
    if (gStart !== null && cStart !== null) {
      const diffDays = Math.abs(gStart - cStart) / 86_400_000;
      if (diffDays > 1) return { ok: false, bonus: 0 };
      return { ok: true, bonus: diffDays === 0 ? 0.25 : 0 };
    }
  }
  return { ok: true, bonus: 0 };
}

function findEventQuotesForGame(
  game: Pick<PlatformGame, "league" | "home" | "away"> & {
    readonly id?: string;
    readonly kickoffUtc?: string;
    readonly dayId?: string;
  },
  byLeague: Map<string, ParsedEventQuotes[]>,
): ParsedEventQuotes | null {
  const candidates = byLeague.get(game.league);
  if (!candidates || candidates.length === 0) return null;

  if (game.id) {
    const byId = candidates.find((cand) => cand.gameId === game.id);
    if (byId) return byId;
  }

  const parsedGameKo = game.kickoffUtc ? Date.parse(game.kickoffUtc) : Number.NaN;
  const gameKickoffMs = Number.isFinite(parsedGameKo) ? parsedGameKo : null;
  const gameYmd =
    extractYmdFromToken(game.kickoffUtc) ??
    extractYmdFromToken(game.dayId) ??
    extractYmdFromToken(game.id);

  let bestMatch: ParsedEventQuotes | null = null;
  let bestScore = 0;
  const homeSlugText = game.home.slug.replace(/[-_]+/g, " ");
  const awaySlugText = game.away.slug.replace(/[-_]+/g, " ");

  for (const cand of candidates) {
    if (!cand.homeHint || !cand.awayHint) continue;
    const dateCheck = evaluateKickoffWindowMatch(gameKickoffMs, gameYmd, cand);
    if (!dateCheck.ok) continue;
    const hScore = Math.max(
      teamScore(cand.homeHint, game.home.name),
      teamScore(cand.homeHint, homeSlugText),
    );
    const aScore = Math.max(
      teamScore(cand.awayHint, game.away.name),
      teamScore(cand.awayHint, awaySlugText),
    );
    const total = hScore > 0 && aScore > 0 ? hScore + aScore + dateCheck.bonus : 0;
    if (total > bestScore) {
      bestScore = total;
      bestMatch = cand;
    }
  }
  return bestMatch;
}

const MAX_DEVIG_PROB_DIVERGENCE = 0.12;
const MAX_SHARP_EV_PCT = 18;
const MAX_SOFT_EV_PCT = 22;
const SHARP_BOOK_PRIORITY: readonly string[] = [
  "pinnacle",
  "betcris",
  "betonline",
  "betonlineag",
];

function isSharpQuoteBook(bookKeyOrLabel?: string | null): boolean {
  if (!bookKeyOrLabel) return false;
  const norm = normalizeBookKey(bookKeyOrLabel);
  if (!norm) return false;
  return SHARP_BOOK_PRIORITY.some((token) => norm.includes(token));
}

function computeEdgePts(p: number, decimal: number | null): number | null {
  if (decimal === null || decimal <= 1) return null;
  return Math.round((p - 1 / decimal) * 1000) / 10;
}

function resolveEventSelectionDeVigProb(
  ev: ParsedEventQuotes,
  key: string,
  nowMs: number,
): number | null {
  const parts = key.split("|");
  if (parts.length !== 3) return null;
  const [market, normLine, selection] = parts;
  if (!market || !normLine || !selection) return null;

  let legs: readonly string[] | null = null;
  let targetProbSum = 1;

  if (market === "1x2") {
    const hasDraw = ev.bySelectionKey.has("1x2|null|draw");
    legs = hasDraw
      ? ["1x2|null|home", "1x2|null|draw", "1x2|null|away"]
      : ["1x2|null|home", "1x2|null|away"];
  } else if (market === "double_chance") {
    legs = ["double_chance|null|1x", "double_chance|null|x2", "double_chance|null|12"];
    targetProbSum = 2;
  } else if (market === "dnb") {
    legs = ["dnb|null|home", "dnb|null|away"];
  } else if (market === "btts") {
    legs = ["btts|null|yes", "btts|null|no"];
  } else if (market === "team_totals" || market === "corners_team") {
    if (normLine === "null") return null;
    if (selection === "home_over" || selection === "home_under") {
      legs = [`${market}|${normLine}|home_over`, `${market}|${normLine}|home_under`];
    } else if (selection === "away_over" || selection === "away_under") {
      legs = [`${market}|${normLine}|away_over`, `${market}|${normLine}|away_under`];
    } else if (selection === "over" || selection === "under") {
      legs = [`${market}|${normLine}|over`, `${market}|${normLine}|under`];
    }
  } else if (OVER_UNDER_QUOTE_MARKETS.has(market)) {
    if (normLine === "null") return null;
    legs = [`${market}|${normLine}|over`, `${market}|${normLine}|under`];
  } else if (isSpreadLikeQuoteMarket(market)) {
    const lineNum = parseStrictFiniteNumber(normLine);
    if (lineNum === null) return null;
    const oppLine = lineNum === 0 ? 0 : normalizeSignedZero(-lineNum);
    if (selection === "home") {
      legs = [`${market}|${lineNum}|home`, `${market}|${oppLine}|away`];
    } else if (selection === "away") {
      legs = [`${market}|${oppLine}|home`, `${market}|${lineNum}|away`];
    }
  }

  if (!legs) return null;
  const targetIdx = legs.indexOf(key);
  if (targetIdx < 0) return null;

  const legBookMaps: Array<Map<string, number>> = [];

  for (const legKey of legs) {
    const fresh = (ev.bySelectionKey.get(legKey) ?? []).filter(
      (q) =>
        Number.isFinite(q.decimal) &&
        q.decimal >= 1.01 &&
        isPermittedMarketQuoteBook(q.book, q.bookLabel) &&
        isMarketFresh(q.capturedAtUtc, nowMs),
    );
    if (fresh.length === 0) return null;
    const map = new Map<string, number>();
    for (const q of fresh) {
      const bk = normalizeBookKey(q.book || q.bookLabel);
      if (bk && !map.has(bk)) map.set(bk, q.decimal);
    }
    legBookMaps.push(map);
  }

  const firstMap = legBookMaps[0];
  if (!firstMap) return null;
  const commonBooks: string[] = [];
  for (const bk of firstMap.keys()) {
    if (legBookMaps.every((m) => m.has(bk))) commonBooks.push(bk);
  }
  if (commonBooks.length === 0) return null;

  commonBooks.sort((a, b) => {
    const pa = SHARP_BOOK_PRIORITY.findIndex((t) => a.includes(t));
    const pb = SHARP_BOOK_PRIORITY.findIndex((t) => b.includes(t));
    const ra = pa >= 0 ? pa : 99;
    const rb = pb >= 0 ? pb : 99;
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });
  const chosenBook = commonBooks[0]!;
  const companionDecimals = legBookMaps.map((m) => m.get(chosenBook)!);

  const devig = computeAdaptiveDeVig(companionDecimals, "auto", targetProbSum);
  if (!devig) return null;
  const prob = devig.probs[targetIdx];
  return typeof prob === "number" && Number.isFinite(prob) ? prob : null;
}

function computeGuardedEdgePts(
  p: number,
  decimal: number | null,
  bookKeyOrLabel: string | null | undefined,
  deVigMarketProb: number | null,
): number | null {
  if (decimal === null || !Number.isFinite(decimal) || decimal <= 1) return null;
  if (
    deVigMarketProb !== null &&
    Number.isFinite(deVigMarketProb) &&
    Math.abs(p - deVigMarketProb) > MAX_DEVIG_PROB_DIVERGENCE
  ) {
    return null;
  }
  const evPct = (p * decimal - 1) * 100;
  const evLimit = isSharpQuoteBook(bookKeyOrLabel) ? MAX_SHARP_EV_PCT : MAX_SOFT_EV_PCT;
  if (evPct > evLimit) return null;
  return computeEdgePts(p, decimal);
}

function enrichPickWithQuotes(
  pick: MatchPick,
  ev: ParsedEventQuotes,
  nowMs: number,
): MatchPick {
  if (pick.isRedacted || !isValidSpacetimeProb(pick.p)) return pick;
  const key = buildLookupKey(pick.market ?? pick.marketGroup, pick.selectionKey, pick.line, pick.label);
  const rawQuotes = ev.bySelectionKey.get(key);
  const quotes = (rawQuotes ?? []).filter(
    (q) =>
      isPermittedMarketQuoteBook(q.book, q.bookLabel) &&
      isMarketFresh(q.capturedAtUtc, nowMs),
  );
  if (quotes.length === 0) return pick;

  let mergedQuotes: readonly BookQuoteItem[] = quotes;
  const existingMarketAllowed =
    pick.marketDecimal !== null &&
    Boolean(pick.marketBookLabel) &&
    Boolean(pick.marketCapturedAtUtc) &&
    !isBlockedMarketQuoteBook(pick.marketBookLabel, pick.marketBookLabel) &&
    isMarketFresh(pick.marketCapturedAtUtc, nowMs);

  if (existingMarketAllowed && pick.marketDecimal !== null && pick.marketBookLabel && pick.marketCapturedAtUtc) {
    const existingBookKey = normalizeServerBookKey(pick.marketBookLabel);
    const existingBookLabel = formatCanonicalBookLabel(existingBookKey);
    if (
      existingBookKey &&
      isPermittedMarketQuoteBook(existingBookKey, existingBookLabel) &&
      !quotes.some((q) => q.book === existingBookKey)
    ) {
      mergedQuotes = finalizeBookQuoteList([
        ...quotes,
        {
          book: existingBookKey,
          bookLabel: existingBookLabel,
          decimal: pick.marketDecimal,
          capturedAtUtc: pick.marketCapturedAtUtc,
        },
      ]);
    } else {
      mergedQuotes = finalizeBookQuoteList(quotes);
    }
  } else {
    mergedQuotes = finalizeBookQuoteList(quotes);
  }

  const deVigMarketProb = resolveEventSelectionDeVigProb(ev, key, nowMs);
  const top = mergedQuotes[0]!;
  if (existingMarketAllowed && pick.marketDecimal !== null) {
    return {
      ...pick,
      edgePts: computeGuardedEdgePts(
        pick.p,
        pick.marketDecimal,
        pick.marketBookLabel,
        deVigMarketProb,
      ),
      bookQuotes: mergedQuotes,
    };
  }

  const roundedDec = Math.round(top.decimal * 100) / 100;
  return {
    ...pick,
    marketDecimal: roundedDec,
    marketAmerican: decimalToAmericanInt(roundedDec),
    marketBookLabel: top.bookLabel,
    marketCapturedAtUtc: top.capturedAtUtc,
    edgePts: computeGuardedEdgePts(
      pick.p,
      roundedDec,
      top.book || top.bookLabel,
      deVigMarketProb,
    ),
    bookQuotes: mergedQuotes,
  };
}

export function enrichMarketRowsWithBookQuotes(
  game: Pick<PlatformGame, "league" | "home" | "away" | "status"> & {
    readonly id?: string;
    readonly kickoffUtc?: string;
    readonly dayId?: string;
  },
  rows: readonly PlatformMarketRow[],
  nowMs: number = Date.now(),
  byLeagueOverride?: Map<string, ParsedEventQuotes[]>,
): PlatformMarketRow[] {
  if (game.status === "FT" || rows.length === 0) return [...rows];
  const byLeague = byLeagueOverride ?? getParsedQuotesByLeague(nowMs);
  const ev = findEventQuotesForGame(game, byLeague);
  if (!ev) return [...rows];

  return rows.map((row) => {
    if (!isValidSpacetimeProb(row.p)) return row;
    const key = buildLookupKey(row.market, row.selection, row.line, row.label);
    const rawQuotes = ev.bySelectionKey.get(key);
    const quotes = (rawQuotes ?? []).filter(
      (q) =>
        isPermittedMarketQuoteBook(q.book, q.bookLabel) &&
        isMarketFresh(q.capturedAtUtc, nowMs),
    );
    if (quotes.length === 0) return row;

    const deVigMarketProb = resolveEventSelectionDeVigProb(ev, key, nowMs);
    const top = quotes[0]!;
    const refQuote = quotes.find((q) => q.openingDecimal != null || q.movementDirection != null) ?? top;
    const derivedOpen =
      row.openDecimal ??
      (refQuote.openingDecimal != null ? Math.round(refQuote.openingDecimal * 100) / 100 : null);
    const derivedMovement = row.movementDirection ?? refQuote.movementDirection ?? null;

    if (row.currentDecimal !== null) {
      return {
        ...row,
        openDecimal: derivedOpen,
        ...(derivedMovement ? { movementDirection: derivedMovement } : {}),
        edgePts:
          row.edgePts !== null
            ? computeGuardedEdgePts(
                row.p,
                row.currentDecimal,
                row.quoteBookLabel ?? top.bookLabel,
                deVigMarketProb,
              )
            : null,
        bookQuotes: quotes,
      };
    }

    const roundedDec = Math.round(top.decimal * 100) / 100;
    return {
      ...row,
      openDecimal: derivedOpen,
      ...(derivedMovement ? { movementDirection: derivedMovement } : {}),
      currentDecimal: roundedDec,
      quoteBookLabel: top.bookLabel,
      quoteCapturedAtUtc: top.capturedAtUtc,
      edgePts: computeGuardedEdgePts(
        row.p,
        roundedDec,
        top.book || top.bookLabel,
        deVigMarketProb,
      ),
      bookQuotes: quotes,
    };
  });
}

export function enrichDatasetWithBookQuotes(
  dataset: PlatformDataset,
  nowMs: number = Date.now(),
  byLeagueOverride?: Map<string, ParsedEventQuotes[]>,
): PlatformDataset {
  const byLeague = byLeagueOverride ?? getParsedQuotesByLeague(nowMs);
  if (byLeague.size === 0) return dataset;

  let anyChanged = false;
  const games = dataset.games.map((game) => {
    if (game.status === "FT") return game;
    const ev = findEventQuotesForGame(game, byLeague);
    if (!ev) return game;

    anyChanged = true;
    return {
      ...game,
      picks: game.picks.map((pk) => enrichPickWithQuotes(pk, ev, nowMs)),
      ...(game.parlayCandidates
        ? { parlayCandidates: game.parlayCandidates.map((pk) => enrichPickWithQuotes(pk, ev, nowMs)) }
        : {}),
      markets:
        game.markets.length > 0
          ? enrichMarketRowsWithBookQuotes(game, game.markets, nowMs, byLeague)
          : game.markets,
    };
  });

  return anyChanged ? { ...dataset, games } : dataset;
}

function mapCanonicalComparison(entry: SelectionOddsComparison): SelectionBookComparison | null {
  if (
    !isValidSpacetimeProb(entry.modelProb) ||
    !entry.anchoredQuote ||
    !isPermittedMarketQuoteBook(entry.bestBook, entry.bestBookLabel)
  ) {
    return null;
  }
  const permittedBooks = entry.books.filter((b) =>
    isPermittedMarketQuoteBook(b.book, b.bookLabel),
  );
  if (permittedBooks.length === 0) {
    return null;
  }
  return {
    market: entry.market === "ah" ? "spread" : entry.market,
    selection: entry.market === "double_chance" ? entry.selection.toLowerCase() : entry.selection,
    line: entry.line,
    bestBook: entry.bestBook,
    bestBookLabel: entry.bestBookLabel,
    bestDecimal: entry.bestDecimal,
    pinnacleDecimal: entry.pinnacleDecimal,
    openingConsensusDecimal: entry.openingConsensusDecimal,
    currentConsensusDecimal: entry.currentConsensusDecimal,
    deltaPct: entry.deltaPct,
    impliedProbDeltaPts: entry.impliedProbDeltaPts,
    signal: entry.signal,
    modelProb: entry.modelProb,
    fairDecimal: entry.fairOdds,
    edgePts: entry.edgePts,
    evPct: entry.evPct,
    anchoredQuote: entry.anchoredQuote,
    books: permittedBooks,
  };
}

function mapCanonicalBestQuote(entry: BestOddsComparisonEntry): BestMarketQuoteSummary | null {
  if (
    !isValidSpacetimeProb(entry.modelProb) ||
    !entry.anchoredQuote ||
    !isPermittedMarketQuoteBook(entry.book, entry.bookLabel)
  ) {
    return null;
  }
  return {
    ...(entry.matchLabel ? { matchLabel: entry.matchLabel } : {}),
    ...(entry.kickoffUtc ? { kickoffUtc: entry.kickoffUtc } : {}),
    market: entry.market === "ah" ? "spread" : entry.market,
    selection: entry.market === "double_chance" ? entry.selection.toLowerCase() : entry.selection,
    line: entry.line,
    book: entry.book,
    bookLabel: entry.bookLabel,
    openingDecimal: entry.openingDecimal,
    currentDecimal: entry.currentDecimal,
    deltaPct: entry.deltaPct,
    impliedProbDeltaPts: entry.impliedProbDeltaPts,
    signal: entry.signal,
    modelProb: entry.modelProb,
    fairDecimal: entry.fairOdds,
    edgePts: entry.edgePts,
    evPct: entry.evPct,
    anchoredQuote: entry.anchoredQuote,
  };
}

export function parseBzzoiroComparisonPayload(
  raw: unknown,
  options: {
    modelProbsByKey?: ReadonlyMap<string, number> | Readonly<Record<string, number>>;
    capturedAtUtc?: string;
    nowMs?: number;
    relevantBooksOnly?: boolean;
    requireSpacetimeAnchor?: boolean;
  } = {},
): SelectionBookComparison[] {
  const canonical = parseBzzoiroOddsComparison(raw, {
    modelProbsByKey: options.modelProbsByKey,
    capturedAtUtc: options.capturedAtUtc,
    nowMs: options.nowMs,
    priorityBooksOnly: options.relevantBooksOnly !== false,
    requireSpacetimeAnchor: true,
  });
  return canonical
    .map(mapCanonicalComparison)
    .filter((item): item is SelectionBookComparison => item !== null);
}

export function parseBzzoiroBestOddsPayload(
  raw: unknown,
  options: {
    modelProbsByKey?: ReadonlyMap<string, number> | Readonly<Record<string, number>>;
    capturedAtUtc?: string;
    nowMs?: number;
    relevantBooksOnly?: boolean;
    requireSpacetimeAnchor?: boolean;
  } = {},
): BestMarketQuoteSummary[] {
  const canonical = parseBzzoiroBestOdds(raw, {
    modelProbsByKey: options.modelProbsByKey,
    capturedAtUtc: options.capturedAtUtc,
    nowMs: options.nowMs,
    priorityBooksOnly: options.relevantBooksOnly !== false,
    requireSpacetimeAnchor: true,
  });
  return canonical
    .map(mapCanonicalBestQuote)
    .filter((item): item is BestMarketQuoteSummary => item !== null);
}

export function buildMarketRowComparison(
  row: PlatformMarketRow,
  options: { nowMs?: number } = {},
): SelectionBookComparison | null {
  const nowMs = options.nowMs ?? Date.now();
  const quotes = (row.bookQuotes ?? []).filter((q) => {
    const book = normalizeServerBookKey(q.book);
    const label = q.bookLabel || formatCanonicalBookLabel(book);
    return (
      Number.isFinite(q.decimal) &&
      q.decimal > 1.01 &&
      isPermittedMarketQuoteBook(book, label) &&
      isMarketFresh(q.capturedAtUtc, nowMs)
    );
  });
  if (quotes.length === 0 || !isValidSpacetimeProb(row.p)) return null;

  let coordinatedShorteningBooks = 0;
  let sharpShortened = false;
  for (const q of quotes) {
    const pre = classifyQuoteMovement({
      openingDecimal: q.openingDecimal ?? row.openDecimal ?? null,
      currentDecimal: q.decimal,
      rawDirection: q.movementDirection ?? row.movementDirection ?? null,
    });
    if (pre.signal === "SHORTENING" || pre.signal === "STEAM") {
      coordinatedShorteningBooks += 1;
      if (normalizeServerBookKey(q.book) === "pinnacle") sharpShortened = true;
    }
  }

  const sorted = [...quotes].sort((a, b) => b.decimal - a.decimal || a.book.localeCompare(b.book));
  const bestQuote = sorted[0]!;
  const bestDecimal = round3(bestQuote.decimal);
  if (bestDecimal <= 1.01) return null;

  const books: MultiBookComparisonQuote[] = sorted.map((q) => {
    const book = normalizeServerBookKey(q.book);
    const mv = classifyQuoteMovement({
      openingDecimal: q.openingDecimal ?? row.openDecimal ?? null,
      currentDecimal: q.decimal,
      rawDirection: q.movementDirection ?? row.movementDirection ?? null,
      coordinatedShorteningBooks,
      sharpShortened,
    });
    return {
      book,
      bookLabel: q.bookLabel || formatCanonicalBookLabel(book),
      openingDecimal: mv.openingDecimal,
      currentDecimal: mv.currentDecimal,
      deltaPct: mv.deltaPct,
      impliedProbDeltaPts: mv.impliedProbDeltaPts,
      signal: mv.signal,
      isBest: Math.abs(q.decimal - bestQuote.decimal) < 1e-6,
      capturedAtUtc: q.capturedAtUtc,
    };
  });

  const openings = books.map((b) => b.openingDecimal).filter((v): v is number => v !== null);
  const openingConsensusDecimal =
    openings.length > 0 ? round3(openings.reduce((a, b) => a + b, 0) / openings.length) : null;
  const currentConsensusDecimal = round3(books.reduce((a, b) => a + b.currentDecimal, 0) / books.length);
  const consensusDeltaPct =
    openingConsensusDecimal !== null
      ? round2(((currentConsensusDecimal - openingConsensusDecimal) / openingConsensusDecimal) * 100)
      : null;
  const consensusShorteningOrUnknown = consensusDeltaPct === null || consensusDeltaPct < 0;
  const consensusMv = classifyQuoteMovement({
    openingDecimal: openingConsensusDecimal,
    currentDecimal: currentConsensusDecimal,
    rawDirection:
      consensusShorteningOrUnknown && books.some((b) => b.signal === "STEAM")
        ? "STEAM"
        : row.movementDirection ?? null,
    coordinatedShorteningBooks,
    sharpShortened,
  });

  const market = normalizeMarketKey(row.market, row.selection);
  const selection = normalizeSelectionToken(market, row.selection);
  const bestBook = normalizeServerBookKey(bestQuote.book);
  const bestBookLabel = bestQuote.bookLabel || formatCanonicalBookLabel(bestBook);
  const capturedAtIso = normalizeIsoTimestamp(bestQuote.capturedAtUtc);
  if (!capturedAtIso) return null;
  const anchoredQuote = toSpacetimeAnchoredQuote({
    bookLabel: bestBookLabel,
    marketKey: market,
    selection,
    line: row.line ?? null,
    bookDecimal: bestDecimal,
    modelProb: row.p,
    movement: consensusMv.signal,
    capturedAtIso,
  });

  const rawEvPct = round2((row.p * bestDecimal - 1) * 100);
  const evLimit = isSharpQuoteBook(bestBook || bestBookLabel) ? MAX_SHARP_EV_PCT : MAX_SOFT_EV_PCT;
  const isAnomalous = rawEvPct > evLimit;

  return {
    market,
    selection,
    line: row.line ?? null,
    bestBook,
    bestBookLabel,
    bestDecimal,
    pinnacleDecimal: books.find((b) => b.book === "pinnacle")?.currentDecimal ?? null,
    openingConsensusDecimal,
    currentConsensusDecimal,
    deltaPct: consensusMv.deltaPct,
    impliedProbDeltaPts: consensusMv.impliedProbDeltaPts,
    signal: consensusMv.signal,
    modelProb: round3(row.p),
    fairDecimal: round3(1 / row.p),
    edgePts: isAnomalous ? null : round2((row.p - 1 / bestDecimal) * 100),
    evPct: isAnomalous ? null : rawEvPct,
    anchoredQuote,
    books,
  };
}

const LIVE_ODDS_CACHE_TTL_MS = 90_000;
const liveOddsCache = new Map<string, { fetchedAtMs: number; payload: unknown }>();

async function fetchBzzoiroOddsEndpointCached(
  pathWithQuery: string,
  options: { fetchImpl?: typeof fetch; env?: Readonly<Record<string, string | undefined>> } = {},
): Promise<{ payload: unknown; fetchedAtIso: string } | null> {
  const env = options.env ?? process.env;
  if (env.PITCHLAB_OFFLINE === "1" || env.PLAYWRIGHT_TEST === "1") return null;
  const apiKey = env.BZZOIRO_API_KEY?.trim();
  if (!apiKey) return null;

  const now = Date.now();
  const cached = liveOddsCache.get(pathWithQuery);
  if (cached && now - cached.fetchedAtMs < LIVE_ODDS_CACHE_TTL_MS) {
    return { payload: cached.payload, fetchedAtIso: new Date(cached.fetchedAtMs).toISOString() };
  }

  const base = (env.BZZOIRO_API_BASE_URL?.trim() || "https://sports.bzzoiro.com/api/v2").replace(/\/+$/, "");
  const fetcher = options.fetchImpl ?? fetch;
  try {
    const res = await fetcher(`${base}${pathWithQuery}`, {
      headers: { Authorization: `Token ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(4_500),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as unknown;
    liveOddsCache.set(pathWithQuery, { fetchedAtMs: now, payload });
    return { payload, fetchedAtIso: new Date(now).toISOString() };
  } catch (err) {
    void err;
    return null;
  }
}

export async function fetchBzzoiroBestOddsWithSpacetime(params: {
  market?: string;
  modelProbsByKey: ReadonlyMap<string, number> | Readonly<Record<string, number>>;
  fetchImpl?: typeof fetch;
  env?: Readonly<Record<string, string | undefined>>;
}): Promise<BestMarketQuoteSummary[]> {
  const market = (params.market ?? "1x2").trim().toLowerCase();
  const fetched = await fetchBzzoiroOddsEndpointCached(
    `/odds/best/?market=${encodeURIComponent(market)}&limit=200`,
    { fetchImpl: params.fetchImpl, env: params.env },
  );
  if (!fetched) return [];
  return parseBzzoiroBestOddsPayload(fetched.payload, {
    modelProbsByKey: params.modelProbsByKey,
    capturedAtUtc: fetched.fetchedAtIso,
    relevantBooksOnly: true,
  });
}

export async function fetchBzzoiroEventComparisonWithSpacetime(params: {
  providerEventId: number;
  modelProbsByKey: ReadonlyMap<string, number> | Readonly<Record<string, number>>;
  fetchImpl?: typeof fetch;
  env?: Readonly<Record<string, string | undefined>>;
}): Promise<SelectionBookComparison[]> {
  if (!Number.isInteger(params.providerEventId) || params.providerEventId <= 0) return [];
  const fetched = await fetchBzzoiroOddsEndpointCached(
    `/events/${params.providerEventId}/odds/comparison/`,
    { fetchImpl: params.fetchImpl, env: params.env },
  );
  if (!fetched) return [];
  return parseBzzoiroComparisonPayload(fetched.payload, {
    modelProbsByKey: params.modelProbsByKey,
    capturedAtUtc: fetched.fetchedAtIso,
    relevantBooksOnly: true,
  });
}
