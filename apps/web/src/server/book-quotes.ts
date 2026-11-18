import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
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
} from "@pitchlab/ui/platform";
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
};

interface ParsedEventQuotes {
  readonly appLeague: string;
  readonly homeHint: string;
  readonly awayHint: string;
  readonly bySelectionKey: ReadonlyMap<string, readonly BookQuoteItem[]>;
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

function normalizeMarketKey(rawMarket: string | undefined): string {
  const m = (rawMarket ?? "").trim().toLowerCase();
  if (m === "h2h" || m === "1x2" || m === "moneyline" || m === "ml") return "1x2";
  if (m === "btts" || m === "both_teams_to_score") return "btts";
  if (m === "totals" || m === "total" || m === "ou" || m === "over_under" || m.startsWith("totals_")) {
    return "totals";
  }
  if (m === "spread" || m === "handicap" || m.startsWith("ah_")) return "spread";
  if (m === "double_chance") return "double_chance";
  if (m === "dnb" || m === "draw_no_bet") return "dnb";
  return m;
}

function normalizeSelectionToken(market: string, rawSelection: string | undefined): string {
  const s = (rawSelection ?? "").trim().toLowerCase();
  if (market === "1x2" || market === "spread" || market === "dnb") {
    if (s === "1" || s === "home" || s === "local") return "home";
    if (s === "x" || s === "draw" || s === "empate") return "draw";
    if (s === "2" || s === "away" || s === "visita") return "away";
  }
  if (market === "btts") {
    if (s === "yes" || s === "si" || s === "sí" || s === "btts_yes") return "yes";
    if (s === "no" || s === "btts_no") return "no";
  }
  if (market === "totals") {
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
  if (market !== "totals" && market !== "spread") return "null";
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
  const market = normalizeMarketKey(rawMarket);
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
    const appLeague = tick.league ? QUOTE_LEAGUE_TO_APP[tick.league] : undefined;
    if (!appLeague || !tick.event_id) continue;
    const hints = extractEventTeamHints(tick.event_id);
    if (!hints) continue;
    const book = normalizeBookKey(tick.book ?? "");
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

    bookMap.set(book, {
      book,
      bookLabel: formatCanonicalBookLabel(book),
      decimal: Math.round(price * 1000) / 1000,
      capturedAtUtc,
    });
  }

  const byLeague = new Map<string, ParsedEventQuotes[]>();
  for (const ev of eventsMap.values()) {
    const finalizedMap = new Map<string, readonly BookQuoteItem[]>();
    for (const [k, bookMap] of ev.quotesByKey.entries()) {
      const sorted = [...bookMap.values()].sort((a, b) => b.decimal - a.decimal);
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
      bySelectionKey: finalizedMap,
    });
    byLeague.set(ev.appLeague, list);
  }
  return byLeague;
}

function getParsedQuotesByLeague(nowMs: number = Date.now()): Map<string, ParsedEventQuotes[]> {
  const quotesPath = resolveQuotesPath();
  if (!quotesPath) return new Map();
  const hourBucket = Math.floor(nowMs / 3_600_000);
  let mtimeMs = 0;
  try {
    mtimeMs = statSync(quotesPath).mtimeMs;
  } catch (err) {
    void err;
    return new Map();
  }

  if (
    ledgerCache &&
    ledgerCache.mtimeMs === mtimeMs &&
    ledgerCache.hourBucket === hourBucket
  ) {
    return ledgerCache.byLeague;
  }

  try {
    const raw = JSON.parse(readFileSync(quotesPath, "utf8")) as RawQuotesLedger;
    const byLeague = Array.isArray(raw.ticks) ? parseQuotesLedgerTicks(raw.ticks, nowMs) : new Map();
    ledgerCache = { mtimeMs, hourBucket, byLeague };
    return byLeague;
  } catch (err) {
    void err;
    return new Map();
  }
}

function findEventQuotesForGame(
  game: Pick<PlatformGame, "league" | "home" | "away">,
  byLeague: Map<string, ParsedEventQuotes[]>,
): ParsedEventQuotes | null {
  const candidates = byLeague.get(game.league);
  if (!candidates || candidates.length === 0) return null;

  let bestMatch: ParsedEventQuotes | null = null;
  let bestScore = 0;
  const homeSlugText = game.home.slug.replace(/[-_]+/g, " ");
  const awaySlugText = game.away.slug.replace(/[-_]+/g, " ");

  for (const cand of candidates) {
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
    const existingBookKey = normalizeBookKey(pick.marketBookLabel);
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
  game: Pick<PlatformGame, "league" | "home" | "away" | "status">,
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
    if (row.currentDecimal !== null) {
      return {
        ...row,
        bookQuotes: quotes,
      };
    }

    const roundedDec = Math.round(top.decimal * 100) / 100;
    return {
      ...row,
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
