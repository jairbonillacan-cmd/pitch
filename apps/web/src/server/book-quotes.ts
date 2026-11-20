import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { COMPETITION_BY_ID } from "@pitchlab/contracts";
import { decimalToAmericanInt } from "@pitchlab/ui/access-guard";
import {
  formatCanonicalBookLabel,
  normalizeBookKey,
} from "@pitchlab/ui/bookmakers";
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

export type BookLineMovementSignal = "SHORTENING" | "DRIFTING" | "STEAM" | "STABLE";

export interface QuoteMovementAnalysis {
  readonly openingDecimal: number | null;
  readonly currentDecimal: number;
  readonly deltaPct: number | null;
  readonly impliedProbDeltaPts: number | null;
  readonly signal: BookLineMovementSignal;
  readonly legacyDirection: "shortening" | "drifting" | "stable";
}

export interface MultiBookComparisonQuote {
  readonly book: string;
  readonly bookLabel: string;
  readonly openingDecimal: number | null;
  readonly currentDecimal: number;
  readonly deltaPct: number | null;
  readonly impliedProbDeltaPts: number | null;
  readonly signal: BookLineMovementSignal;
  readonly isBest: boolean;
  readonly capturedAtUtc?: string;
}

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
  /** Ancla Spacetime v5.1: probabilidad calibrada, momio justo (1/p), ventaja y EV %. */
  readonly modelProb: number | null;
  readonly fairDecimal: number | null;
  readonly edgePts: number | null;
  readonly evPct: number | null;
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
}

export const RELEVANT_COMPARISON_BOOKS: ReadonlySet<string> = new Set([
  "pinnacle",
  "bet365",
  "codere",
  "betcris",
  "draftkings",
  "fanduel",
  "betmgm",
  "caliente_mx",
]);

const URL_STRIP_RE = /https?:\/\/\S+|www\.\S+/gi;

function sanitizeQuoteText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(URL_STRIP_RE, "").replace(/\s+/g, " ").trim();
}

function normalizeServerBookKey(raw: string): string {
  const key = normalizeBookKey(raw);
  if (key === "caliente" || key === "caliente_mx") return "caliente_mx";
  return key;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function parseValidDecimal(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 1.01 || n > 500) return null;
  return round3(n);
}

/**
 * Clasifica el movimiento entre cuota de apertura y cuota actual (`SHORTENING` | `DRIFTING` | `STEAM` | `STABLE`)
 * con delta porcentual y cambio en probabilidad implícita.
 */
export function classifyQuoteMovement(params: {
  openingDecimal?: number | null;
  currentDecimal: number;
  rawDirection?: string | null;
  coordinatedShorteningBooks?: number;
  sharpShortened?: boolean;
}): QuoteMovementAnalysis {
  const currentDecimal = round3(params.currentDecimal);
  const openingDecimal = params.openingDecimal != null ? parseValidDecimal(params.openingDecimal) : null;
  const deltaPct =
    openingDecimal !== null
      ? round2(((currentDecimal - openingDecimal) / openingDecimal) * 100)
      : null;
  const impliedProbDeltaPts =
    openingDecimal !== null
      ? round2((1 / currentDecimal - 1 / openingDecimal) * 100)
      : null;

  const rawDir = String(params.rawDirection ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  const coordBooks = params.coordinatedShorteningBooks ?? 0;

  let signal: BookLineMovementSignal;
  if (rawDir === "STEAM" || rawDir === "STEAM_MOVE" || rawDir === "SHARP_STEAM") {
    signal = "STEAM";
  } else if (
    deltaPct !== null &&
    (deltaPct <= -8.0 || (impliedProbDeltaPts !== null && impliedProbDeltaPts >= 4.0 && deltaPct <= -5.0))
  ) {
    signal = "STEAM";
  } else if (coordBooks >= 3 && deltaPct !== null && deltaPct <= -3.0) {
    signal = "STEAM";
  } else if (params.sharpShortened && coordBooks >= 2 && deltaPct !== null && deltaPct <= -3.5) {
    signal = "STEAM";
  } else if (rawDir === "SHORTENING" || rawDir === "DOWN") {
    signal = "SHORTENING";
  } else if (rawDir === "DRIFTING" || rawDir === "UP") {
    signal = "DRIFTING";
  } else if (
    deltaPct !== null &&
    (deltaPct <= -1.5 || (openingDecimal !== null && currentDecimal - openingDecimal <= -0.02))
  ) {
    signal = "SHORTENING";
  } else if (
    deltaPct !== null &&
    (deltaPct >= 1.5 || (openingDecimal !== null && currentDecimal - openingDecimal >= 0.02))
  ) {
    signal = "DRIFTING";
  } else {
    signal = "STABLE";
  }

  const legacyDirection: "shortening" | "drifting" | "stable" =
    signal === "STEAM" || signal === "SHORTENING"
      ? "shortening"
      : signal === "DRIFTING"
        ? "drifting"
        : "stable";

  return {
    openingDecimal,
    currentDecimal,
    deltaPct,
    impliedProbDeltaPts,
    signal,
    legacyDirection,
  };
}

function normalizeMarketKey(rawMarket: string | undefined, rawSelection?: string): string {
  const m = (rawMarket ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const sel = (rawSelection ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");

  if (m === "h2h" || m === "1x2" || m === "moneyline" || m === "ml" || m === "match_winner") return "1x2";
  if (m === "btts" || m === "both_teams_to_score") return "btts";
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
    m === "corners_total" ||
    m === "total_corners" ||
    m === "corners_over_under" ||
    m.startsWith("total_corners_") ||
    m.startsWith("corners_")
  ) {
    return "corners_total";
  }
  if (
    m === "spread" ||
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
  if (market === "1x2" || market === "spread" || market === "dnb") {
    if (s === "1" || s === "home" || s === "local") return "home";
    if (s === "x" || s === "draw" || s === "empate") return "draw";
    if (s === "2" || s === "away" || s === "visita") return "away";
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
  if (market === "totals" || market === "corners_total") {
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

function normalizeLineValue(
  market: string,
  line: number | null | undefined,
  labelFallback?: string,
): string {
  if (market !== "totals" && market !== "corners_total" && market !== "spread") return "null";
  if (typeof line === "number" && Number.isFinite(line)) {
    return String(Math.round(line * 100) / 100);
  }
  if (labelFallback) {
    const match = /([+-]?\d+(?:\.\d+)?)/.exec(labelFallback);
    if (match?.[1]) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed)) {
        return String(Math.round(parsed * 100) / 100);
      }
    }
  }
  return "null";
}

function buildLookupKey(
  rawMarket: string | undefined,
  rawSelection: string | undefined,
  line: number | null | undefined,
  labelFallback?: string,
): string {
  const market = normalizeMarketKey(rawMarket, rawSelection);
  const selection = normalizeSelectionToken(market, rawSelection);
  const normLine = normalizeLineValue(market, line, labelFallback);
  return `${market}|${normLine}|${selection}`;
}

function extractEventTeamHints(eventId: string): { homeHint: string; awayHint: string } | null {
  const parts = eventId.split(":");
  if (parts.length < 6) return null;
  const homeRaw = parts[4]?.replace(/[_-]+/g, " ").trim() ?? "";
  const awayRaw = parts[5]?.replace(/[_-]+/g, " ").trim() ?? "";
  if (!homeRaw || !awayRaw) return null;
  return { homeHint: homeRaw, awayHint: awayRaw };
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
    const hints = extractEventTeamHints(tick.event_id);
    if (!hints) continue;
    const book = normalizeServerBookKey(tick.book ?? "");
    if (!book) continue;

    const eventKey = `${appLeague}::${tick.event_id}`;
    let eventBucket = eventsMap.get(eventKey);
    if (!eventBucket) {
      eventBucket = {
        appLeague,
        homeHint: hints.homeHint,
        awayHint: hints.awayHint,
        quotesByKey: new Map(),
      };
      eventsMap.set(eventKey, eventBucket);
    }

    const selKey = buildLookupKey(tick.market, tick.selection, tick.line);
    let bookMap = eventBucket.quotesByKey.get(selKey);
    if (!bookMap) {
      bookMap = new Map();
      eventBucket.quotesByKey.set(selKey, bookMap);
    }

    const capturedAtUtc = tick.ts_captured!;
    const existing = bookMap.get(book);
    if (existing && Date.parse(existing.capturedAtUtc) > Date.parse(capturedAtUtc)) {
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
      ...(tick.is_best_odds === true ? { isBest: true } : {}),
    });
  }

  const byLeague = new Map<string, ParsedEventQuotes[]>();
  for (const ev of eventsMap.values()) {
    const finalizedMap = new Map<string, readonly BookQuoteItem[]>();
    for (const [k, bookMap] of ev.quotesByKey.entries()) {
      const rawSorted = [...bookMap.values()].sort((a, b) => b.decimal - a.decimal);
      if (rawSorted.length > 0) {
        const bestPrice = rawSorted[0]!.decimal;
        const hasExplicitBest = rawSorted.some((q) => q.isBest === true);
        const sorted = rawSorted.map((q) => ({
          ...q,
          ...(q.isBest === true || (!hasExplicitBest && Math.abs(q.decimal - bestPrice) < 1e-6)
            ? { isBest: true }
            : {}),
        }));
        finalizedMap.set(k, sorted);
      }
    }
    if (finalizedMap.size === 0) continue;
    const list = byLeague.get(ev.appLeague) ?? [];
    list.push({
      appLeague: ev.appLeague,
      homeHint: ev.homeHint,
      awayHint: ev.awayHint,
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
      const fallbackCaptured = parsed.updatedAt ?? new Date(nowMs).toISOString();
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
        if (!isMarketFresh(capturedAtUtc, nowMs)) continue;
        const book = normalizeServerBookKey(line.book ?? "consensus") || "consensus";
        const selKey = buildLookupKey(line.market, line.outcome, line.line);

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
        const roundedDec = Math.round(price * 1000) / 1000;
        const openingDecimal =
          typeof line.openingDecimal === "number" &&
          Number.isFinite(line.openingDecimal) &&
          line.openingDecimal > 1.01
            ? Math.round(line.openingDecimal * 1000) / 1000
            : undefined;
        const movementDirection =
          line.movement === "shortening" || line.movement === "drifting" || line.movement === "stable"
            ? line.movement
            : openingDecimal !== undefined
              ? roundedDec < openingDecimal - 0.01
                ? "shortening"
                : roundedDec > openingDecimal + 0.01
                  ? "drifting"
                  : "stable"
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
          const rawSorted = [...bookMap.values()].sort((a, b) => b.decimal - a.decimal);
          if (rawSorted.length > 0) {
            const bestPrice = rawSorted[0]!.decimal;
            finalizedMap.set(
              k,
              rawSorted.map((q) => ({
                ...q,
                ...(Math.abs(q.decimal - bestPrice) < 1e-6 ? { isBest: true } : {}),
              })),
            );
          }
        }
        if (finalizedMap.size === 0) continue;
        list.push({
          appLeague,
          gameId: ev.gameId,
          homeHint: ev.homeHint,
          awayHint: ev.awayHint,
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

function findEventQuotesForGame(
  game: Pick<PlatformGame, "league" | "home" | "away"> & { readonly id?: string },
  byLeague: Map<string, ParsedEventQuotes[]>,
): ParsedEventQuotes | null {
  const candidates = byLeague.get(game.league);
  if (!candidates || candidates.length === 0) return null;

  if (game.id) {
    const byId = candidates.find((cand) => cand.gameId === game.id);
    if (byId) return byId;
  }

  let bestMatch: ParsedEventQuotes | null = null;
  let bestScore = 0;
  const homeSlugText = game.home.slug.replace(/[-_]+/g, " ");
  const awaySlugText = game.away.slug.replace(/[-_]+/g, " ");

  for (const cand of candidates) {
    if (!cand.homeHint || !cand.awayHint) continue;
    const hScore = Math.max(
      teamScore(cand.homeHint, game.home.name),
      teamScore(cand.homeHint, homeSlugText),
    );
    const aScore = Math.max(
      teamScore(cand.awayHint, game.away.name),
      teamScore(cand.awayHint, awaySlugText),
    );
    const total = hScore > 0 && aScore > 0 ? hScore + aScore : 0;
    if (total > bestScore) {
      bestScore = total;
      bestMatch = cand;
    }
  }
  return bestMatch;
}

function computeEdgePts(p: number, decimal: number | null): number | null {
  if (decimal === null || decimal <= 1) return null;
  return Math.round((p - 1 / decimal) * 1000) / 10;
}

function enrichPickWithQuotes(
  pick: MatchPick,
  ev: ParsedEventQuotes,
): MatchPick {
  if (pick.isRedacted) return pick;
  const key = buildLookupKey(pick.market ?? pick.marketGroup, pick.selectionKey, pick.line, pick.label);
  const quotes = ev.bySelectionKey.get(key);
  if (!quotes || quotes.length === 0) return pick;

  // Merge existing marketDecimal if present from another verified source
  let mergedQuotes: readonly BookQuoteItem[] = quotes;
  if (
    pick.marketDecimal !== null &&
    pick.marketBookLabel &&
    pick.marketCapturedAtUtc
  ) {
    const existingBookKey = normalizeServerBookKey(pick.marketBookLabel);
    if (existingBookKey && !quotes.some((q) => q.book === existingBookKey)) {
      mergedQuotes = [
        ...quotes,
        {
          book: existingBookKey,
          bookLabel: formatCanonicalBookLabel(existingBookKey),
          decimal: pick.marketDecimal,
          capturedAtUtc: pick.marketCapturedAtUtc,
        },
      ].sort((a, b) => b.decimal - a.decimal);
    }
  }

  const top = mergedQuotes[0]!;
  if (pick.marketDecimal !== null) {
    return {
      ...pick,
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
    edgePts: computeEdgePts(pick.p, roundedDec),
    bookQuotes: mergedQuotes,
  };
}

export function enrichMarketRowsWithBookQuotes(
  game: Pick<PlatformGame, "league" | "home" | "away" | "status"> & { readonly id?: string },
  rows: readonly PlatformMarketRow[],
  nowMs: number = Date.now(),
  byLeagueOverride?: Map<string, ParsedEventQuotes[]>,
): PlatformMarketRow[] {
  if (game.status === "FT" || rows.length === 0) return [...rows];
  const byLeague = byLeagueOverride ?? getParsedQuotesByLeague(nowMs);
  const ev = findEventQuotesForGame(game, byLeague);
  if (!ev) return [...rows];

  return rows.map((row) => {
    const key = buildLookupKey(row.market, row.selection, row.line, row.label);
    const quotes = ev.bySelectionKey.get(key);
    if (!quotes || quotes.length === 0) return row;

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
      edgePts: computeEdgePts(row.p, roundedDec),
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
      picks: game.picks.map((pk) => enrichPickWithQuotes(pk, ev)),
      ...(game.parlayCandidates
        ? { parlayCandidates: game.parlayCandidates.map((pk) => enrichPickWithQuotes(pk, ev)) }
        : {}),
      markets:
        game.markets.length > 0
          ? enrichMarketRowsWithBookQuotes(game, game.markets, nowMs, byLeague)
          : game.markets,
    };
  });

  return anyChanged ? { ...dataset, games } : dataset;
}

// ---------- Comparativa multi-casa Bzzoiro (`/odds/best/` y `/events/{id}/odds/comparison/`) anclada a Spacetime v5.1 ----------

interface RawBzzoiroQuoteLike {
  market?: unknown;
  outcome?: unknown;
  selection?: unknown;
  line?: unknown;
  bookmaker_slug?: unknown;
  bookmaker?: unknown;
  bookmaker_name?: unknown;
  book?: unknown;
  decimal_odds?: unknown;
  odds?: unknown;
  price_decimal?: unknown;
  price?: unknown;
  opening_odds?: unknown;
  opening_decimal_odds?: unknown;
  opening_price?: unknown;
  movement?: unknown;
  movement_direction?: unknown;
  is_live?: unknown;
  home_team?: unknown;
  away_team?: unknown;
  event_date?: unknown;
  updated_at?: unknown;
  captured_at?: unknown;
}

function extractRawTeamText(raw: unknown): string {
  if (typeof raw === "string") return sanitizeQuoteText(raw);
  if (raw && typeof raw === "object" && "name" in raw) {
    return sanitizeQuoteText((raw as { name?: unknown }).name);
  }
  return "";
}

function flattenBzzoiroOddsPayload(raw: unknown): RawBzzoiroQuoteLike[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.flatMap(flattenBzzoiroOddsPayload);
  if (typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;

  if (Array.isArray(obj.results)) return flattenBzzoiroOddsPayload(obj.results);
  if (Array.isArray(obj.odds)) return flattenBzzoiroOddsPayload(obj.odds);
  if (Array.isArray(obj.comparisons)) return flattenBzzoiroOddsPayload(obj.comparisons);

  if (Array.isArray(obj.bookmakers) || Array.isArray(obj.books)) {
    const booksList = (obj.bookmakers ?? obj.books) as Record<string, unknown>[];
    return booksList.map((b) => ({
      ...b,
      market: b.market ?? obj.market,
      outcome: b.outcome ?? b.selection ?? obj.outcome ?? obj.selection,
      line: b.line ?? obj.line,
      home_team: obj.home_team,
      away_team: obj.away_team,
      event_date: obj.event_date,
    }));
  }

  if (obj.best_odds && typeof obj.best_odds === "object" && !Array.isArray(obj.best_odds)) {
    const out: RawBzzoiroQuoteLike[] = [];
    for (const [outcomeKey, detail] of Object.entries(obj.best_odds as Record<string, Record<string, unknown>>)) {
      if (!detail || typeof detail !== "object") continue;
      out.push({
        ...detail,
        market: detail.market ?? obj.market,
        outcome: detail.outcome ?? outcomeKey,
        line: detail.line ?? obj.line,
        home_team: obj.home_team,
        away_team: obj.away_team,
        event_date: obj.event_date,
      });
    }
    return out;
  }

  if ("market" in obj && ("decimal_odds" in obj || "odds" in obj || "price_decimal" in obj || "price" in obj)) {
    return [obj as RawBzzoiroQuoteLike];
  }
  return [];
}

function lookupSpacetimeProb(
  modelProbsByKey: ReadonlyMap<string, number> | Readonly<Record<string, number>> | undefined,
  lookupKey: string,
): number | null {
  if (!modelProbsByKey) return null;
  const raw =
    modelProbsByKey instanceof Map
      ? modelProbsByKey.get(lookupKey)
      : (modelProbsByKey as Readonly<Record<string, number>>)[lookupKey];
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0.001 || raw >= 0.999) return null;
  return raw;
}

function computeAnalyticsForPrice(
  modelProb: number | null,
  currentDecimal: number,
): {
  modelProb: number | null;
  fairDecimal: number | null;
  edgePts: number | null;
  evPct: number | null;
} {
  if (modelProb === null) {
    return { modelProb: null, fairDecimal: null, edgePts: null, evPct: null };
  }
  return {
    modelProb: round3(modelProb),
    fairDecimal: round3(1 / modelProb),
    edgePts: round2((modelProb - 1 / currentDecimal) * 100),
    evPct: round2((modelProb * currentDecimal - 1) * 100),
  };
}

/**
 * Parsea `/events/{id}/odds/comparison/` en comparativas multi-casa ligadas a Spacetime v5.1 (`fairDecimal`, `evPct`, `edgePts`)
 * con señal `SHORTENING` | `DRIFTING` | `STEAM` | `STABLE` y sin IDs crudos ni URLs (`FD-16`).
 */
export function parseBzzoiroComparisonPayload(
  raw: unknown,
  options: {
    modelProbsByKey?: ReadonlyMap<string, number> | Readonly<Record<string, number>>;
    relevantBooksOnly?: boolean;
  } = {},
): SelectionBookComparison[] {
  const flat = flattenBzzoiroOddsPayload(raw);
  const grouped = new Map<
    string,
    {
      market: string;
      selection: string;
      line: number | null;
      byBook: Map<
        string,
        {
          book: string;
          bookLabel: string;
          openingDecimal: number | null;
          currentDecimal: number;
          rawDirection: string | null;
          capturedAtUtc?: string;
        }
      >;
    }
  >();

  for (const row of flat) {
    if (row.is_live === true) continue;
    const rawBook = String(row.bookmaker_slug ?? row.bookmaker ?? row.book ?? row.bookmaker_name ?? "").trim();
    const book = normalizeServerBookKey(rawBook);
    if (!book) continue;
    if (options.relevantBooksOnly !== false && !RELEVANT_COMPARISON_BOOKS.has(book)) continue;

    const currentDecimal = parseValidDecimal(row.decimal_odds ?? row.odds ?? row.price_decimal ?? row.price);
    if (currentDecimal === null) continue;
    const market = normalizeMarketKey(String(row.market ?? ""), String(row.outcome ?? row.selection ?? ""));
    const selection = normalizeSelectionToken(market, String(row.outcome ?? row.selection ?? ""));
    if (!market || !selection) continue;
    const lineNum =
      typeof row.line === "number" && Number.isFinite(row.line)
        ? Math.round(row.line * 100) / 100
        : market === "totals" || market === "corners_total" || market === "spread"
          ? (() => {
              const m = /(\d{2,3})$/.exec(String(row.market ?? ""));
              return m?.[1] ? Number(m[1]) / 10 : null;
            })()
          : null;
    const lookupKey = `${market}|${lineNum === null ? "null" : String(lineNum)}|${selection}`;

    let bucket = grouped.get(lookupKey);
    if (!bucket) {
      bucket = { market, selection, line: lineNum, byBook: new Map() };
      grouped.set(lookupKey, bucket);
    }

    const openingDecimal = parseValidDecimal(row.opening_odds ?? row.opening_decimal_odds ?? row.opening_price);
    const rawDir =
      typeof (row.movement ?? row.movement_direction) === "string"
        ? String(row.movement ?? row.movement_direction).trim()
        : null;
    const rawTs = row.updated_at ?? row.captured_at;
    const capturedAtUtc =
      typeof rawTs === "string" && Number.isFinite(Date.parse(rawTs)) ? rawTs.trim() : undefined;

    bucket.byBook.set(book, {
      book,
      bookLabel: formatCanonicalBookLabel(book),
      openingDecimal,
      currentDecimal,
      rawDirection: rawDir,
      ...(capturedAtUtc ? { capturedAtUtc } : {}),
    });
  }

  const out: SelectionBookComparison[] = [];
  for (const [lookupKey, bucket] of grouped.entries()) {
    const entries = [...bucket.byBook.values()];
    if (entries.length === 0) continue;

    let coordinatedShorteningBooks = 0;
    let sharpShortened = false;
    for (const e of entries) {
      const pre = classifyQuoteMovement({
        openingDecimal: e.openingDecimal,
        currentDecimal: e.currentDecimal,
        rawDirection: e.rawDirection,
      });
      if (pre.signal === "SHORTENING" || pre.signal === "STEAM") {
        coordinatedShorteningBooks += 1;
        if (e.book === "pinnacle") sharpShortened = true;
      }
    }

    const sorted = entries.sort((a, b) => b.currentDecimal - a.currentDecimal || a.book.localeCompare(b.book));
    const bestDecimal = sorted[0]!.currentDecimal;
    const books: MultiBookComparisonQuote[] = sorted.map((e) => {
      const mv = classifyQuoteMovement({
        openingDecimal: e.openingDecimal,
        currentDecimal: e.currentDecimal,
        rawDirection: e.rawDirection,
        coordinatedShorteningBooks,
        sharpShortened,
      });
      return {
        book: e.book,
        bookLabel: e.bookLabel,
        openingDecimal: mv.openingDecimal,
        currentDecimal: mv.currentDecimal,
        deltaPct: mv.deltaPct,
        impliedProbDeltaPts: mv.impliedProbDeltaPts,
        signal: mv.signal,
        isBest: Math.abs(e.currentDecimal - bestDecimal) < 1e-6,
        ...(e.capturedAtUtc ? { capturedAtUtc: e.capturedAtUtc } : {}),
      };
    });

    const openings = books.map((b) => b.openingDecimal).filter((v): v is number => v !== null);
    const openingConsensusDecimal =
      openings.length > 0 ? round3(openings.reduce((a, b) => a + b, 0) / openings.length) : null;
    const currentConsensusDecimal = round3(books.reduce((a, b) => a + b.currentDecimal, 0) / books.length);
    const consensusMv = classifyQuoteMovement({
      openingDecimal: openingConsensusDecimal,
      currentDecimal: currentConsensusDecimal,
      rawDirection: books.some((b) => b.signal === "STEAM") ? "STEAM" : null,
      coordinatedShorteningBooks,
      sharpShortened,
    });

    const modelProb = lookupSpacetimeProb(options.modelProbsByKey, lookupKey);
    const analytics = computeAnalyticsForPrice(modelProb, bestDecimal);

    out.push({
      market: bucket.market,
      selection: bucket.selection,
      line: bucket.line,
      bestBook: sorted[0]!.book,
      bestBookLabel: sorted[0]!.bookLabel,
      bestDecimal,
      pinnacleDecimal: books.find((b) => b.book === "pinnacle")?.currentDecimal ?? null,
      openingConsensusDecimal,
      currentConsensusDecimal,
      deltaPct: consensusMv.deltaPct,
      impliedProbDeltaPts: consensusMv.impliedProbDeltaPts,
      signal: consensusMv.signal,
      ...analytics,
      books,
    });
  }

  return out;
}

/**
 * Parsea `/api/v2/odds/best/` en resúmenes anclados a Spacetime v5.1 (`FD-16`: sin IDs crudos ni URLs).
 */
export function parseBzzoiroBestOddsPayload(
  raw: unknown,
  options: {
    modelProbsByKey?: ReadonlyMap<string, number> | Readonly<Record<string, number>>;
    relevantBooksOnly?: boolean;
  } = {},
): BestMarketQuoteSummary[] {
  const flat = flattenBzzoiroOddsPayload(raw);
  const out: BestMarketQuoteSummary[] = [];

  for (const row of flat) {
    if (row.is_live === true) continue;
    const rawBook = String(row.bookmaker_slug ?? row.bookmaker ?? row.book ?? row.bookmaker_name ?? "").trim();
    const book = normalizeServerBookKey(rawBook);
    if (!book) continue;
    if (options.relevantBooksOnly !== false && !RELEVANT_COMPARISON_BOOKS.has(book)) continue;

    const currentDecimal = parseValidDecimal(row.decimal_odds ?? row.odds ?? row.price_decimal ?? row.price);
    if (currentDecimal === null) continue;
    const market = normalizeMarketKey(String(row.market ?? ""), String(row.outcome ?? row.selection ?? ""));
    const selection = normalizeSelectionToken(market, String(row.outcome ?? row.selection ?? ""));
    if (!market || !selection) continue;
    const lineNum =
      typeof row.line === "number" && Number.isFinite(row.line) ? Math.round(row.line * 100) / 100 : null;
    const lookupKey = `${market}|${lineNum === null ? "null" : String(lineNum)}|${selection}`;

    const openingDecimal = parseValidDecimal(row.opening_odds ?? row.opening_decimal_odds ?? row.opening_price);
    const rawDir =
      typeof (row.movement ?? row.movement_direction) === "string"
        ? String(row.movement ?? row.movement_direction).trim()
        : null;
    const mv = classifyQuoteMovement({ openingDecimal, currentDecimal, rawDirection: rawDir });
    const home = extractRawTeamText(row.home_team);
    const away = extractRawTeamText(row.away_team);
    const matchLabel = home && away ? `${home} vs ${away}` : undefined;
    const kickoffUtc =
      typeof row.event_date === "string" && Number.isFinite(Date.parse(row.event_date))
        ? row.event_date.trim()
        : undefined;
    const modelProb = lookupSpacetimeProb(options.modelProbsByKey, lookupKey);
    const analytics = computeAnalyticsForPrice(modelProb, currentDecimal);

    out.push({
      ...(matchLabel ? { matchLabel } : {}),
      ...(kickoffUtc ? { kickoffUtc } : {}),
      market,
      selection,
      line: lineNum,
      book,
      bookLabel: formatCanonicalBookLabel(book),
      openingDecimal: mv.openingDecimal,
      currentDecimal: mv.currentDecimal,
      deltaPct: mv.deltaPct,
      impliedProbDeltaPts: mv.impliedProbDeltaPts,
      signal: mv.signal,
      ...analytics,
    });
  }

  return out;
}

/** Construye comparativa multi-casa con señal `SHORTENING`/`DRIFTING`/`STEAM` desde una fila `PlatformMarketRow`. */
export function buildMarketRowComparison(row: PlatformMarketRow): SelectionBookComparison | null {
  const quotes = row.bookQuotes ?? [];
  if (quotes.length === 0) return null;

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
  const bestDecimal = sorted[0]!.decimal;
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
      isBest: Math.abs(q.decimal - bestDecimal) < 1e-6,
      capturedAtUtc: q.capturedAtUtc,
    };
  });

  const openings = books.map((b) => b.openingDecimal).filter((v): v is number => v !== null);
  const openingConsensusDecimal =
    openings.length > 0 ? round3(openings.reduce((a, b) => a + b, 0) / openings.length) : null;
  const currentConsensusDecimal = round3(books.reduce((a, b) => a + b.currentDecimal, 0) / books.length);
  const consensusMv = classifyQuoteMovement({
    openingDecimal: openingConsensusDecimal,
    currentDecimal: currentConsensusDecimal,
    rawDirection: books.some((b) => b.signal === "STEAM") ? "STEAM" : row.movementDirection ?? null,
    coordinatedShorteningBooks,
    sharpShortened,
  });

  const analytics = computeAnalyticsForPrice(row.p, bestDecimal);
  return {
    market: normalizeMarketKey(row.market, row.selection),
    selection: normalizeSelectionToken(normalizeMarketKey(row.market, row.selection), row.selection),
    line: row.line ?? null,
    bestBook: normalizeServerBookKey(sorted[0]!.book),
    bestBookLabel: sorted[0]!.bookLabel,
    bestDecimal,
    pinnacleDecimal: books.find((b) => b.book === "pinnacle")?.currentDecimal ?? null,
    openingConsensusDecimal,
    currentConsensusDecimal,
    deltaPct: consensusMv.deltaPct,
    impliedProbDeltaPts: consensusMv.impliedProbDeltaPts,
    signal: consensusMv.signal,
    ...analytics,
    books,
  };
}

const LIVE_ODDS_CACHE_TTL_MS = 90_000;
const liveOddsCache = new Map<string, { fetchedAtMs: number; payload: unknown }>();

async function fetchBzzoiroOddsEndpointCached(
  pathWithQuery: string,
  options: { fetchImpl?: typeof fetch; env?: Readonly<Record<string, string | undefined>> } = {},
): Promise<unknown | null> {
  const env = options.env ?? process.env;
  if (env.PITCHLAB_OFFLINE === "1" || env.PLAYWRIGHT_TEST === "1") return null;
  const apiKey = env.BZZOIRO_API_KEY?.trim();
  if (!apiKey) return null;

  const now = Date.now();
  const cached = liveOddsCache.get(pathWithQuery);
  if (cached && now - cached.fetchedAtMs < LIVE_ODDS_CACHE_TTL_MS) {
    return cached.payload;
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
    return payload;
  } catch (err) {
    void err;
    return null;
  }
}

/**
 * Consulta en servidor `/api/v2/odds/best/?market=` y ancla cada mejor cuota al análisis Spacetime v5.1.
 */
export async function fetchBzzoiroBestOddsWithSpacetime(params: {
  market?: string;
  modelProbsByKey: ReadonlyMap<string, number> | Readonly<Record<string, number>>;
  fetchImpl?: typeof fetch;
  env?: Readonly<Record<string, string | undefined>>;
}): Promise<BestMarketQuoteSummary[]> {
  const market = (params.market ?? "1x2").trim().toLowerCase();
  const raw = await fetchBzzoiroOddsEndpointCached(
    `/odds/best/?market=${encodeURIComponent(market)}&limit=200`,
    { fetchImpl: params.fetchImpl, env: params.env },
  );
  if (!raw) return [];
  return parseBzzoiroBestOddsPayload(raw, {
    modelProbsByKey: params.modelProbsByKey,
    relevantBooksOnly: true,
  });
}

/**
 * Consulta en servidor `/events/{id}/odds/comparison/` y devuelve comparativa multi-casa con señal
 * `SHORTENING` | `DRIFTING` | `STEAM` | `STABLE` ligada a `fairDecimal`/`evPct` de Spacetime v5.1 (`FD-16`).
 */
export async function fetchBzzoiroEventComparisonWithSpacetime(params: {
  providerEventId: number;
  modelProbsByKey: ReadonlyMap<string, number> | Readonly<Record<string, number>>;
  fetchImpl?: typeof fetch;
  env?: Readonly<Record<string, string | undefined>>;
}): Promise<SelectionBookComparison[]> {
  if (!Number.isInteger(params.providerEventId) || params.providerEventId <= 0) return [];
  const raw = await fetchBzzoiroOddsEndpointCached(
    `/events/${params.providerEventId}/odds/comparison/`,
    { fetchImpl: params.fetchImpl, env: params.env },
  );
  if (!raw) return [];
  return parseBzzoiroComparisonPayload(raw, {
    modelProbsByKey: params.modelProbsByKey,
    relevantBooksOnly: true,
  });
}
