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

function normalizeMarketKey(rawMarket: string | undefined): string {
  const m = (rawMarket ?? "").trim().toLowerCase();
  if (m === "h2h" || m === "1x2" || m === "moneyline" || m === "ml") return "1x2";
  if (m === "btts" || m === "both_teams_to_score") return "btts";
  if (
    m === "totals" ||
    m === "total" ||
    m === "ou" ||
    m === "over_under" ||
    m.startsWith("totals_") ||
    m.startsWith("over_under_")
  ) {
    return "totals";
  }
  if (m === "corners_total" || m === "total_corners" || m === "corners_over_under" || m.startsWith("corners_")) {
    return "corners_total";
  }
  if (m === "spread" || m === "handicap" || m.startsWith("ah_")) return "spread";
  if (m === "double_chance") return "double_chance";
  if (m === "dnb" || m === "draw_no_bet") return "dnb";
  if (m === "clean_sheet_home" || m === "clean_sheet_away" || m === "win_to_nil_home" || m === "win_to_nil_away") {
    return m;
  }
  return m;
}

function normalizeSelectionToken(market: string, rawSelection: string | undefined): string {
  const s = (rawSelection ?? "").trim().toLowerCase();
  if (market === "1x2" || market === "spread" || market === "dnb") {
    if (s === "1" || s === "home" || s === "local") return "home";
    if (s === "x" || s === "draw" || s === "empate") return "draw";
    if (s === "2" || s === "away" || s === "visita") return "away";
  }
  if (
    market === "btts" ||
    market === "clean_sheet_home" ||
    market === "clean_sheet_away" ||
    market === "win_to_nil_home" ||
    market === "win_to_nil_away"
  ) {
    if (s === "yes" || s === "si" || s === "sí" || s === "btts_yes") return "yes";
    if (s === "no" || s === "btts_no") return "no";
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
    const appLeague = tick.league
      ? (QUOTE_LEAGUE_TO_APP[tick.league] ?? (COMPETITION_BY_ID[tick.league] ? tick.league : undefined))
      : undefined;
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

    const roundedDec = Math.round(price * 1000) / 1000;
    const openingDecimal =
      typeof tick.opening_price === "number" && Number.isFinite(tick.opening_price) && tick.opening_price > 1.01
        ? Math.round(tick.opening_price * 1000) / 1000
        : undefined;
    const movementDirection =
      tick.movement_direction === "shortening" ||
      tick.movement_direction === "drifting" ||
      tick.movement_direction === "stable"
        ? tick.movement_direction
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
        const book = normalizeBookKey(line.book ?? "consensus") || "consensus";
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
