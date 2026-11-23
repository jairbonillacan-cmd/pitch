import {
  TIER1_MAJOR_CUP_IDS,
  createSpacetimeAnchoredQuote,
  getLeagueCapability,
  isBlockedMarketQuoteBook,
  isPermittedMarketQuoteBook,
  parseStrictFiniteNumber,
  type ProductLeagueId,
  type QuoteMovement,
  type SpacetimeAnchoredQuote,
} from "@pitchlab/contracts";
import { normalizeLine, type OddsLineMovement, type OddsSnapshotRow } from "@pitchlab/spacetime";
import type { CanonicalLeague } from "../mappings.js";
import { BZZOIRO_LEAGUES } from "../providers/bzzoiro.js";
import { validateOddsTickBatch } from "../validation/snapshot-validator.js";
import {
  assertSourceLegallyAllowed,
  buildCanonicalOddsEventId,
  CleanHttpTransport,
  normalizeUtcIsoSeconds,
  SOURCE_LEGAL_REGISTRY,
  type OddsSourceAdapter,
} from "./legal-registry.js";

export const BZZOIRO_ODDS_BASE_URL_DEFAULT = "https://sports.bzzoiro.com/api/v2";

export const BZZOIRO_ODDS_LEAGUES: readonly CanonicalLeague[] = [
  "liga-mx",
  "premier-league",
  "laliga",
  "bundesliga",
  "serie-a",
  "ligue-1",
];

export const BZZOIRO_TIER1_CUP_ODDS_LEAGUES: readonly ProductLeagueId[] = Object.freeze(
  TIER1_MAJOR_CUP_IDS.filter((id) => {
    const capability = getLeagueCapability(id);
    return Boolean(
      capability &&
        capability.hasOddsIngest &&
        capability.providers.odds === "bzzoiro" &&
        capability.bzzoiroId !== null &&
        id in BZZOIRO_LEAGUES,
    );
  }),
);

export const BZZOIRO_EXTENDED_ODDS_MARKETS = [
  "1x2",
  "over_under",
  "btts",
  "total_corners",
  "asian_handicap",
  "double_chance",
  "draw_no_bet",
  "clean_sheet",
  "win_to_nil",
] as const;

const BZZOIRO_BOOK_MAP: Readonly<Record<string, string>> = {
  pinnacle: "pinnacle",
  bet365: "bet365",
  codere: "codere",
  betcris: "betcris",
  bwin: "bwin",
  "william-hill": "william_hill",
  williamhill: "william_hill",
  unibet: "unibet",
  betonline: "betonline",
  betonlineag: "betonline",
  draftkings: "draftkings",
  fanduel: "fanduel",
  betmgm: "betmgm",
};

export const BZZOIRO_COMPARISON_BOOK_META: Readonly<
  Record<string, { readonly canonical: string; readonly label: string; readonly isSharp?: boolean }>
> = {
  pinnacle: { canonical: "pinnacle", label: "Pinnacle", isSharp: true },
  bet365: { canonical: "bet365", label: "Bet365" },
  codere: { canonical: "codere", label: "Codere" },
  betcris: { canonical: "betcris", label: "Betcris" },
  draftkings: { canonical: "draftkings", label: "DraftKings" },
  fanduel: { canonical: "fanduel", label: "FanDuel" },
  betmgm: { canonical: "betmgm", label: "BetMGM" },
  bwin: { canonical: "bwin", label: "Bwin" },
  "william-hill": { canonical: "william_hill", label: "William Hill" },
  william_hill: { canonical: "william_hill", label: "William Hill" },
  williamhill: { canonical: "william_hill", label: "William Hill" },
  unibet: { canonical: "unibet", label: "Unibet" },
  betonline: { canonical: "betonline", label: "BetOnline" },
  betonlineag: { canonical: "betonline", label: "BetOnline" },
};

export const PRIORITY_COMPARISON_BOOKS = new Set([
  "pinnacle",
  "bet365",
  "codere",
  "betcris",
  "draftkings",
  "fanduel",
  "betmgm",
]);

const MAX_COMPARISON_QUOTE_AGE_MS = 72 * 3_600_000;
const MAX_COMPARISON_FUTURE_SKEW_MS = 6 * 3_600_000;

const LOOKAHEAD_DAYS = 8;
const PAGE_LIMIT = 200;
const MAX_PAGES = 10;
const MAX_PAGES_UNLIMITED = 30;
const STRICT_ISO_TIMESTAMP_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export type LineMovementSignal = "SHORTENING" | "DRIFTING" | "STEAM" | "STABLE";

export interface LineMovementMetrics {
  readonly openingDecimal: number | null;
  readonly currentDecimal: number;
  readonly deltaPct: number | null;
  readonly impliedProbDeltaPts: number | null;
  readonly signal: LineMovementSignal;
  readonly legacyDirection: OddsLineMovement;
}

export interface BzOddsEvent {
  id?: unknown;
  home_team?: unknown;
  away_team?: unknown;
  event_date?: unknown;
  status?: unknown;
}

export interface BzOddsRow {
  event_id?: unknown;
  home_team?: unknown;
  away_team?: unknown;
  event_date?: unknown;
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
  price?: unknown;
  price_decimal?: unknown;
  opening_odds?: unknown;
  opening_decimal_odds?: unknown;
  opening_price?: unknown;
  movement?: unknown;
  movement_direction?: unknown;
  is_live?: unknown;
  updated_at?: unknown;
  captured_at?: unknown;
}

export interface ComparisonBookQuote {
  readonly book: string;
  readonly bookLabel: string;
  readonly openingDecimal: number | null;
  readonly currentDecimal: number;
  readonly deltaPct: number | null;
  readonly impliedProbDeltaPts: number | null;
  readonly signal: LineMovementSignal;
  readonly isBest: boolean;
  readonly capturedAtUtc?: string;
}

export interface SelectionOddsComparison {
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
  readonly signal: LineMovementSignal;
  readonly modelProb: number;
  readonly fairOdds: number;
  readonly edgePts: number | null;
  readonly evPct: number | null;
  readonly anchoredQuote: SpacetimeAnchoredQuote;
  readonly books: readonly ComparisonBookQuote[];
}

export interface BestOddsComparisonEntry {
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
  readonly signal: LineMovementSignal;
  readonly modelProb: number;
  readonly fairOdds: number;
  readonly edgePts: number | null;
  readonly evPct: number | null;
  readonly anchoredQuote: SpacetimeAnchoredQuote;
}

export interface ToSpacetimeAnchoredQuoteInput {
  readonly bookLabel: string;
  readonly marketKey: string;
  readonly selection: string;
  readonly line?: number | null;
  readonly bookDecimal: number;
  readonly modelProb: number;
  readonly movement?: LineMovementSignal;
  readonly capturedAtIso?: string;
}

const URL_STRIP_RE = /https?:\/\/\S+|www\.\S+/gi;

function cleanText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(URL_STRIP_RE, "").replace(/\s+/g, " ").trim();
}

function teamName(raw: unknown): string {
  if (typeof raw === "string") return cleanText(raw);
  if (raw && typeof raw === "object" && "name" in raw) {
    return cleanText((raw as { name?: unknown }).name);
  }
  return "";
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function normalizeCapturedAtIso(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return undefined;
  if (STRICT_ISO_TIMESTAMP_RE.test(trimmed)) return trimmed;
  return new Date(ms).toISOString();
}

function parseExplicitLine(raw: unknown): number | null {
  const n = parseStrictFiniteNumber(raw);
  return n !== null ? normalizeLine(n) : null;
}

function parseDecimalOdds(raw: unknown): number | null {
  const n = parseStrictFiniteNumber(raw);
  if (n === null || n < 1.01 || n > 1000) return null;
  return round3(n);
}

function inferLineFromMarketSlug(
  rawMarket: string,
  rawLine: unknown,
  requirePositive: boolean = true,
): number | null {
  const explicit = parseExplicitLine(rawLine);
  if (explicit !== null && (!requirePositive || explicit > 0)) return explicit;
  const suffix = /(\d{2,3})$/.exec(rawMarket);
  if (suffix?.[1]) {
    const parsedSuffix = parseStrictFiniteNumber(suffix[1]);
    const val = parsedSuffix !== null ? parsedSuffix / 10 : Number.NaN;
    if (Number.isFinite(val) && val > 0 && val <= 30) return normalizeLine(val);
  }
  return null;
}

function isFreshComparisonTimestamp(
  capturedAtIso: string | undefined,
  nowMs: number,
): capturedAtIso is string {
  if (!capturedAtIso || !Number.isFinite(nowMs)) return false;
  const ms = Date.parse(capturedAtIso);
  if (!Number.isFinite(ms)) return false;
  const ageMs = nowMs - ms;
  return ageMs >= -MAX_COMPARISON_FUTURE_SKEW_MS && ageMs <= MAX_COMPARISON_QUOTE_AGE_MS;
}

export function toSpacetimeAnchoredQuote(
  input: ToSpacetimeAnchoredQuoteInput,
): SpacetimeAnchoredQuote {
  const prob = parseStrictFiniteNumber(input.modelProb);
  if (prob === null || prob <= 0.001 || prob >= 0.999) {
    throw new RangeError("Expected Spacetime modelProb strictly within (0.001, 0.999)");
  }
  if (isBlockedMarketQuoteBook(undefined, input.bookLabel)) {
    throw new RangeError("Blocked or unsafe bookmaker label");
  }
  const capturedAtIso = normalizeCapturedAtIso(input.capturedAtIso);
  if (!capturedAtIso) {
    throw new RangeError("Expected explicit ISO-8601 capturedAtIso");
  }
  const movement: QuoteMovement = input.movement ?? "STABLE";
  return createSpacetimeAnchoredQuote({
    bookLabel: input.bookLabel,
    marketKey: input.marketKey,
    selection: input.selection,
    line: input.line ?? null,
    bookDecimal: input.bookDecimal,
    modelProb: prob,
    movement,
    capturedAtIso,
  });
}

export type MappedQuote = { market: string; line: number | null; selection: string };

function mapYesNoMarket(baseMarket: string, outcome: string): MappedQuote | null {
  if (outcome === "yes" || outcome === "no") {
    return { market: baseMarket, line: null, selection: outcome };
  }
  if (outcome === "home_yes" || outcome === "home_no" || outcome === "home") {
    return {
      market: `${baseMarket}_home`,
      line: null,
      selection: outcome === "home_no" ? "no" : "yes",
    };
  }
  if (outcome === "away_yes" || outcome === "away_no" || outcome === "away") {
    return {
      market: `${baseMarket}_away`,
      line: null,
      selection: outcome === "away_no" ? "no" : "yes",
    };
  }
  return null;
}

export function mapBzzoiroMarketQuote(row: BzOddsRow): MappedQuote | null {
  const market = String(row.market ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const outcome = String(row.outcome ?? row.selection ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");

  if (
    market === "1x2" ||
    market === "h2h" ||
    market === "match_winner" ||
    market === "full_time_result" ||
    market === "moneyline" ||
    market === "ml"
  ) {
    if (outcome === "home" || outcome === "1" || outcome === "local") return { market: "1x2", line: null, selection: "home" };
    if (outcome === "draw" || outcome === "x" || outcome === "empate") return { market: "1x2", line: null, selection: "draw" };
    if (outcome === "away" || outcome === "2" || outcome === "visita") return { market: "1x2", line: null, selection: "away" };
    return null;
  }
  if (market === "double_chance" || market === "dc") {
    if (outcome === "1x" || outcome === "home_or_draw") return { market: "double_chance", line: null, selection: "1X" };
    if (outcome === "12" || outcome === "home_or_away") return { market: "double_chance", line: null, selection: "12" };
    if (outcome === "x2" || outcome === "away_or_draw") return { market: "double_chance", line: null, selection: "X2" };
    return null;
  }
  if (market === "draw_no_bet" || market === "dnb") {
    if (outcome === "home" || outcome === "1" || outcome === "local") return { market: "dnb", line: null, selection: "home" };
    if (outcome === "away" || outcome === "2" || outcome === "visita") return { market: "dnb", line: null, selection: "away" };
    return null;
  }
  if (
    market === "total_corners" ||
    market === "corners_total" ||
    market === "corners_over_under" ||
    /^total_corners_\d+$/.test(market) ||
    /^corners_\d+$/.test(market)
  ) {
    const line = inferLineFromMarketSlug(market, row.line, true);
    const side = outcome === "over" || outcome === "mas" ? "over" : outcome === "under" || outcome === "menos" ? "under" : null;
    if (line === null || line <= 0 || side === null) return null;
    return { market: "corners_total", line, selection: side };
  }
  if (
    /^over_under_\d+$/.test(market) ||
    market === "over_under" ||
    market === "totals" ||
    /^totals_\d+$/.test(market) ||
    market === "total_goals"
  ) {
    const line = inferLineFromMarketSlug(market, row.line, true);
    const side = outcome === "over" || outcome === "mas" ? "over" : outcome === "under" || outcome === "menos" ? "under" : null;
    if (line === null || line <= 0 || side === null) return null;
    return { market: "totals", line, selection: side };
  }
  if (market === "btts" || market === "both_teams_to_score") {
    if (outcome === "yes" || outcome === "si" || outcome === "sí" || outcome === "btts_yes") {
      return { market: "btts", line: null, selection: "yes" };
    }
    if (outcome === "no" || outcome === "btts_no") {
      return { market: "btts", line: null, selection: "no" };
    }
    return null;
  }
  if (market === "clean_sheet" || market === "clean_sheet_home" || market === "clean_sheet_away") {
    return market === "clean_sheet"
      ? mapYesNoMarket("clean_sheet", outcome)
      : outcome === "yes" || outcome === "no"
        ? { market, line: null, selection: outcome }
        : null;
  }
  if (market === "win_to_nil" || market === "win_to_nil_home" || market === "win_to_nil_away") {
    return market === "win_to_nil"
      ? mapYesNoMarket("win_to_nil", outcome)
      : outcome === "yes" || outcome === "no"
        ? { market, line: null, selection: outcome }
        : null;
  }
  if (market === "spread" || market === "spreads") {
    const line = parseExplicitLine(row.line);
    if (line === null) return null;
    if (outcome === "home" || outcome === "1" || outcome === "local") return { market: "spread", line, selection: "home" };
    if (outcome === "away" || outcome === "2" || outcome === "visita") return { market: "spread", line, selection: "away" };
    return null;
  }
  if (
    market === "asian_handicap" ||
    market === "ah" ||
    market === "handicap" ||
    market.startsWith("asian_handicap_") ||
    market.startsWith("ah_")
  ) {
    const line = parseExplicitLine(row.line);
    if (line === null) return null;
    if (outcome === "home" || outcome === "1" || outcome === "local") return { market: "ah", line, selection: "home" };
    if (outcome === "away" || outcome === "2" || outcome === "visita") return { market: "ah", line, selection: "away" };
    return null;
  }
  return null;
}

export function classifyLineMovement(params: {
  openingDecimal?: number | null;
  currentDecimal: number;
  rawMovement?: string | null;
  coordinatedShorteningBooks?: number;
  sharpShortened?: boolean;
}): LineMovementMetrics {
  const currentDecimal = round3(params.currentDecimal);
  const openingDecimal =
    params.openingDecimal != null ? parseDecimalOdds(params.openingDecimal) : null;
  const deltaPct =
    openingDecimal !== null
      ? round2(((currentDecimal - openingDecimal) / openingDecimal) * 100)
      : null;
  const impliedProbDeltaPts =
    openingDecimal !== null
      ? round2((1 / currentDecimal - 1 / openingDecimal) * 100)
      : null;

  const rawDir = String(params.rawMovement ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  const coordBooks = params.coordinatedShorteningBooks ?? 0;

  const shorteningConsistent = deltaPct === null || deltaPct < 0;
  const driftingConsistent = deltaPct === null || deltaPct > 0;

  let signal: LineMovementSignal;
  if (
    shorteningConsistent &&
    (rawDir === "STEAM" || rawDir === "STEAM_MOVE" || rawDir === "SHARP_STEAM")
  ) {
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
  } else if (shorteningConsistent && (rawDir === "SHORTENING" || rawDir === "DOWN")) {
    signal = "SHORTENING";
  } else if (driftingConsistent && (rawDir === "DRIFTING" || rawDir === "UP")) {
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

  const legacyDirection: OddsLineMovement =
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

function resolveOpeningAndMovement(
  row: BzOddsRow,
  currentDecimal: number,
): { openingPrice?: number; movementDirection?: OddsLineMovement; signal: LineMovementSignal; deltaPct: number | null } {
  const rawOpen = row.opening_odds ?? row.opening_decimal_odds ?? row.opening_price;
  const rawDir = row.movement ?? row.movement_direction;
  const parsedOpen = parseDecimalOdds(rawOpen);
  const hasOpening = parsedOpen !== null;
  const hasDir = typeof rawDir === "string" && rawDir.trim().length > 0;
  const classified = classifyLineMovement({
    openingDecimal: parsedOpen,
    currentDecimal,
    rawMovement: hasDir ? String(rawDir) : null,
  });

  return {
    ...(classified.openingDecimal !== null ? { openingPrice: classified.openingDecimal } : {}),
    ...(hasOpening || hasDir ? { movementDirection: classified.legacyDirection } : {}),
    signal: classified.signal,
    deltaPct: classified.deltaPct,
  };
}

function normalizeComparisonBook(
  row: BzOddsRow,
): { canonical: string; label: string; isSharp: boolean } | null {
  const rawSlug = String(row.bookmaker_slug ?? row.bookmaker ?? row.book ?? row.bookmaker_name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (!rawSlug || isBlockedMarketQuoteBook(rawSlug)) return null;
  const hit = BZZOIRO_COMPARISON_BOOK_META[rawSlug] ?? BZZOIRO_COMPARISON_BOOK_META[rawSlug.replace(/_/g, "-")];
  if (!hit || !isPermittedMarketQuoteBook(hit.canonical, hit.label)) return null;
  return { canonical: hit.canonical, label: hit.label, isSharp: Boolean(hit.isSharp) };
}

function selectionPriorKey(market: string, line: number | null, selection: string): string {
  const normSel = market === "double_chance" ? selection.toUpperCase() : selection.toLowerCase();
  return `${market}|${line === null ? "null" : String(line)}|${normSel}`;
}

function sidePerspectiveLine(market: string, selection: string, line: number | null): number | null {
  if (line === null) return null;
  if ((market === "ah" || market === "spread") && selection === "away") {
    return line === 0 ? 0 : -line;
  }
  return line;
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

function readPriorEntry(
  priors: ReadonlyMap<string, number> | Readonly<Record<string, number>>,
  key: string,
): unknown {
  return priors instanceof Map ? priors.get(key) : (priors as Readonly<Record<string, number>>)[key];
}

function lookupModelProb(
  priors: ReadonlyMap<string, number> | Readonly<Record<string, number>> | undefined,
  market: string,
  line: number | null,
  selection: string,
): number | null {
  if (!priors) return null;
  const candidateKeys = [selectionPriorKey(market, line, selection)];
  const lineToken = line === null ? "null" : String(line);
  if (market === "double_chance") {
    candidateKeys.push(`double_chance|${lineToken}|${selection.toLowerCase()}`);
  } else if (market === "ah") {
    candidateKeys.push(`spread|${lineToken}|${selection.toLowerCase()}`);
  } else if (market === "spread") {
    candidateKeys.push(`ah|${lineToken}|${selection.toLowerCase()}`);
  }
  for (const key of candidateKeys) {
    const raw = readPriorEntry(priors, key);
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0.001 && raw < 0.999) {
      return raw;
    }
  }
  return null;
}

const MAX_SHARP_EV_PCT = 18;
const MAX_SOFT_EV_PCT = 22;
const MAX_DEVIG_PROB_DIVERGENCE = 0.12;
const SHARP_COMPARISON_PRIORITY: readonly string[] = [
  "pinnacle",
  "betcris",
  "betonline",
  "betonlineag",
];

function isSharpComparisonBook(bookKeyOrLabel: string | null | undefined): boolean {
  if (!bookKeyOrLabel) return false;
  const norm = bookKeyOrLabel.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (norm.length === 0) return false;
  return SHARP_COMPARISON_PRIORITY.some((token) => norm.includes(token));
}

function computeSameBookDeVigFromGrouped(
  grouped: ReadonlyMap<
    string,
    {
      readonly market: string;
      readonly selection: string;
      readonly line: number | null;
      readonly byBook: ReadonlyMap<string, { readonly currentDecimal: number }>;
    }
  >,
  targetKey: string,
): number | null {
  const bucket = grouped.get(targetKey);
  if (!bucket) return null;
  const m = bucket.market;
  const s = bucket.selection;
  const l = bucket.line;
  const lTok = l === null ? "null" : String(l);

  let legs: readonly string[] | null = null;
  let targetProbSum = 1;
  if (m === "1x2") {
    legs = grouped.has("1x2|null|draw")
      ? ["1x2|null|home", "1x2|null|draw", "1x2|null|away"]
      : ["1x2|null|home", "1x2|null|away"];
  } else if (m === "double_chance") {
    legs = ["double_chance|null|1X", "double_chance|null|X2", "double_chance|null|12"];
    targetProbSum = 2;
  } else if (m === "dnb") {
    legs = ["dnb|null|home", "dnb|null|away"];
  } else if (m === "btts") {
    legs = ["btts|null|yes", "btts|null|no"];
  } else if (m === "totals" || m === "corners_total") {
    if (l === null) return null;
    legs = [`${m}|${lTok}|over`, `${m}|${lTok}|under`];
  } else if (m === "ah" || m === "spread") {
    if (l === null) return null;
    const opp = l === 0 ? 0 : -l;
    if (s === "home") legs = [`${m}|${l}|home`, `${m}|${opp}|away`];
    else if (s === "away") legs = [`${m}|${opp}|home`, `${m}|${l}|away`];
  }
  if (!legs) return null;
  const targetIdx = legs.indexOf(targetKey);
  if (targetIdx < 0) return null;

  const legMaps = legs.map((lk) => grouped.get(lk)?.byBook ?? null);
  if (legMaps.some((bm) => bm === null || bm.size === 0)) return null;
  const first = legMaps[0]!;
  const commonBooks: string[] = [];
  for (const bk of first.keys()) {
    if (legMaps.every((bm) => bm!.has(bk))) commonBooks.push(bk);
  }
  if (commonBooks.length === 0) return null;
  commonBooks.sort((a, b) => {
    const pa = SHARP_COMPARISON_PRIORITY.findIndex((t) => a.includes(t));
    const pb = SHARP_COMPARISON_PRIORITY.findIndex((t) => b.includes(t));
    const ra = pa >= 0 ? pa : 99;
    const rb = pb >= 0 ? pb : 99;
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });
  const chosenBook = commonBooks[0]!;
  const implied: number[] = [];
  let sumQ = 0;
  for (const bm of legMaps) {
    const dec = bm!.get(chosenBook)!.currentDecimal;
    if (!Number.isFinite(dec) || dec < 1.01) return null;
    const q = 1 / dec;
    implied.push(q);
    sumQ += q;
  }
  const effectiveSum = sumQ / targetProbSum;
  if (effectiveSum < 0.92 || effectiveSum > 1.32) return null;
  const prob = implied[targetIdx]! / effectiveSum;
  return Number.isFinite(prob) && prob > 0 && prob < 1 ? prob : null;
}

function computeSpacetimeAnalytics(
  modelProb: number,
  currentDecimal: number,
  bookKeyOrLabel?: string | null,
  deVigMarketProb: number | null = null,
): {
  modelProb: number;
  fairOdds: number;
  edgePts: number | null;
  evPct: number | null;
} {
  const fairOdds = round3(1 / modelProb);
  const rawEdgePts = round2((modelProb - 1 / currentDecimal) * 100);
  const rawEvPct = round2((modelProb * currentDecimal - 1) * 100);
  const evLimit = isSharpComparisonBook(bookKeyOrLabel) ? MAX_SHARP_EV_PCT : MAX_SOFT_EV_PCT;
  const probDivergent =
    deVigMarketProb !== null && Math.abs(modelProb - deVigMarketProb) > MAX_DEVIG_PROB_DIVERGENCE;
  const anomalous = probDivergent || rawEvPct > evLimit;
  return {
    modelProb: round3(modelProb),
    fairOdds,
    edgePts: anomalous ? null : rawEdgePts,
    evPct: anomalous ? null : rawEvPct,
  };
}

function flattenComparisonRows(raw: unknown): BzOddsRow[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.flatMap(flattenComparisonRows);
  if (typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;

  if (Array.isArray(obj.results)) return flattenComparisonRows(obj.results);
  if (Array.isArray(obj.odds)) return flattenComparisonRows(obj.odds);
  if (Array.isArray(obj.comparisons)) return flattenComparisonRows(obj.comparisons);

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
    const bestMap = obj.best_odds as Record<string, Record<string, unknown>>;
    const out: BzOddsRow[] = [];
    for (const [outcomeKey, detail] of Object.entries(bestMap)) {
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

  if (obj.markets && typeof obj.markets === "object" && !Array.isArray(obj.markets)) {
    const out: BzOddsRow[] = [];
    for (const [mktKey, selMap] of Object.entries(obj.markets as Record<string, unknown>)) {
      if (!selMap || typeof selMap !== "object") continue;
      for (const [selKey, entries] of Object.entries(selMap as Record<string, unknown>)) {
        if (!Array.isArray(entries)) continue;
        for (const entry of entries) {
          if (!entry || typeof entry !== "object") continue;
          const rec = entry as Record<string, unknown>;
          out.push({
            ...rec,
            market: rec.market ?? mktKey,
            outcome: rec.outcome ?? selKey,
          });
        }
      }
    }
    return out;
  }

  if ("market" in obj && ("decimal_odds" in obj || "odds" in obj || "price" in obj || "price_decimal" in obj)) {
    return [obj as BzOddsRow];
  }
  return [];
}

export function parseBzzoiroOddsComparison(
  raw: unknown,
  options: {
    modelProbsByKey?: ReadonlyMap<string, number> | Readonly<Record<string, number>>;
    capturedAtUtc?: string;
    nowMs?: number;
    priorityBooksOnly?: boolean;
    requireSpacetimeAnchor?: boolean;
  } = {},
): SelectionOddsComparison[] {
  const nowMs = options.nowMs ?? Date.now();
  const flatRows = flattenComparisonRows(raw);
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
          isSharp: boolean;
          openingDecimal: number | null;
          currentDecimal: number;
          rawMovement: string | null;
          capturedAtUtc?: string;
        }
      >;
    }
  >();

  for (const row of flatRows) {
    if (row.is_live === true) continue;
    const bookMeta = normalizeComparisonBook(row);
    if (!bookMeta) continue;
    if (options.priorityBooksOnly && !PRIORITY_COMPARISON_BOOKS.has(bookMeta.canonical)) continue;

    const quote = mapBzzoiroMarketQuote(row);
    if (!quote) continue;
    const selectionLine = sidePerspectiveLine(quote.market, quote.selection, quote.line);
    const currentDecimal = parseDecimalOdds(row.decimal_odds ?? row.odds ?? row.price_decimal ?? row.price);
    if (currentDecimal === null) continue;
    const openingDecimal = parseDecimalOdds(row.opening_odds ?? row.opening_decimal_odds ?? row.opening_price);
    const rawMovement =
      typeof (row.movement ?? row.movement_direction) === "string"
        ? String(row.movement ?? row.movement_direction).trim()
        : null;
    const capturedAtUtc = normalizeCapturedAtIso(row.updated_at ?? row.captured_at ?? options.capturedAtUtc);
    if (!isFreshComparisonTimestamp(capturedAtUtc, nowMs)) continue;

    const key = selectionPriorKey(quote.market, selectionLine, quote.selection);
    let bucket = grouped.get(key);
    if (!bucket) {
      bucket = {
        market: quote.market,
        selection: quote.selection,
        line: selectionLine,
        byBook: new Map(),
      };
      grouped.set(key, bucket);
    }
    const existingBook = bucket.byBook.get(bookMeta.canonical);
    if (existingBook && isOlderCapture(existingBook.capturedAtUtc, capturedAtUtc)) {
      continue;
    }
    bucket.byBook.set(bookMeta.canonical, {
      book: bookMeta.canonical,
      bookLabel: bookMeta.label,
      isSharp: bookMeta.isSharp,
      openingDecimal,
      currentDecimal,
      rawMovement,
      ...(capturedAtUtc ? { capturedAtUtc } : {}),
    });
  }

  const out: SelectionOddsComparison[] = [];
  for (const bucket of grouped.values()) {
    const entries = [...bucket.byBook.values()];
    if (entries.length === 0) continue;

    let coordinatedShorteningBooks = 0;
    let sharpShortened = false;
    for (const e of entries) {
      const prelim = classifyLineMovement({
        openingDecimal: e.openingDecimal,
        currentDecimal: e.currentDecimal,
        rawMovement: e.rawMovement,
      });
      if (prelim.signal === "SHORTENING" || prelim.signal === "STEAM") {
        coordinatedShorteningBooks += 1;
        if (e.isSharp) sharpShortened = true;
      }
    }

    const sorted = entries.sort((a, b) => b.currentDecimal - a.currentDecimal || a.book.localeCompare(b.book));
    const bestDecimal = sorted[0]!.currentDecimal;

    const books: ComparisonBookQuote[] = sorted.map((e) => {
      const mv = classifyLineMovement({
        openingDecimal: e.openingDecimal,
        currentDecimal: e.currentDecimal,
        rawMovement: e.rawMovement,
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

    const openings = books
      .map((b) => b.openingDecimal)
      .filter((v): v is number => v !== null);
    const openingConsensusDecimal =
      openings.length > 0 ? round3(openings.reduce((acc, v) => acc + v, 0) / openings.length) : null;
    const currentConsensusDecimal = round3(
      books.reduce((acc, b) => acc + b.currentDecimal, 0) / books.length,
    );
    const pinnacleQuote = books.find((b) => b.book === "pinnacle") ?? null;

    const consensusDeltaPct =
      openingConsensusDecimal !== null
        ? round2(((currentConsensusDecimal - openingConsensusDecimal) / openingConsensusDecimal) * 100)
        : null;
    const consensusShorteningOrUnknown = consensusDeltaPct === null || consensusDeltaPct < 0;
    const consensusDriftingOrUnknown = consensusDeltaPct === null || consensusDeltaPct > 0;
    const consensusMovement = classifyLineMovement({
      openingDecimal: openingConsensusDecimal,
      currentDecimal: currentConsensusDecimal,
      rawMovement:
        consensusShorteningOrUnknown && books.some((b) => b.signal === "STEAM")
          ? "STEAM"
          : consensusShorteningOrUnknown &&
              books.some((b) => b.signal === "SHORTENING") &&
              !books.some((b) => b.signal === "DRIFTING")
            ? "SHORTENING"
            : consensusDriftingOrUnknown &&
                books.some((b) => b.signal === "DRIFTING") &&
                !books.some((b) => b.signal === "SHORTENING")
              ? "DRIFTING"
              : null,
      coordinatedShorteningBooks,
      sharpShortened,
    });

    const modelProb = lookupModelProb(options.modelProbsByKey, bucket.market, bucket.line, bucket.selection);
    if (modelProb === null) continue;
    const bucketKey = selectionPriorKey(bucket.market, bucket.line, bucket.selection);
    const deVigProb = computeSameBookDeVigFromGrouped(grouped, bucketKey);
    const analytics = computeSpacetimeAnalytics(
      modelProb,
      bestDecimal,
      sorted[0]!.book,
      deVigProb,
    );
    const bestCapturedAtIso = sorted[0]!.capturedAtUtc ?? normalizeCapturedAtIso(options.capturedAtUtc);
    if (!isFreshComparisonTimestamp(bestCapturedAtIso, nowMs)) continue;
    const anchoredQuote = toSpacetimeAnchoredQuote({
      bookLabel: sorted[0]!.bookLabel,
      marketKey: bucket.market,
      selection: bucket.selection,
      line: bucket.line,
      bookDecimal: bestDecimal,
      modelProb,
      movement: consensusMovement.signal,
      capturedAtIso: bestCapturedAtIso,
    });

    out.push({
      market: bucket.market,
      selection: bucket.selection,
      line: bucket.line,
      bestBook: sorted[0]!.book,
      bestBookLabel: sorted[0]!.bookLabel,
      bestDecimal,
      pinnacleDecimal: pinnacleQuote?.currentDecimal ?? null,
      openingConsensusDecimal,
      currentConsensusDecimal,
      deltaPct: consensusMovement.deltaPct,
      impliedProbDeltaPts: consensusMovement.impliedProbDeltaPts,
      signal: consensusMovement.signal,
      ...analytics,
      anchoredQuote,
      books,
    });
  }

  return out.sort(
    (a, b) =>
      a.market.localeCompare(b.market) ||
      (a.line ?? 0) - (b.line ?? 0) ||
      a.selection.localeCompare(b.selection),
  );
}

export function parseBzzoiroBestOdds(
  raw: unknown,
  options: {
    modelProbsByKey?: ReadonlyMap<string, number> | Readonly<Record<string, number>>;
    capturedAtUtc?: string;
    nowMs?: number;
    priorityBooksOnly?: boolean;
    requireSpacetimeAnchor?: boolean;
  } = {},
): BestOddsComparisonEntry[] {
  const nowMs = options.nowMs ?? Date.now();
  const flatRows = flattenComparisonRows(raw);
  const out: BestOddsComparisonEntry[] = [];

  for (const row of flatRows) {
    if (row.is_live === true) continue;
    const bookMeta = normalizeComparisonBook(row);
    if (!bookMeta) continue;
    if (options.priorityBooksOnly && !PRIORITY_COMPARISON_BOOKS.has(bookMeta.canonical)) continue;

    const quote = mapBzzoiroMarketQuote(row);
    if (!quote) continue;
    const selectionLine = sidePerspectiveLine(quote.market, quote.selection, quote.line);
    const currentDecimal = parseDecimalOdds(row.decimal_odds ?? row.odds ?? row.price_decimal ?? row.price);
    if (currentDecimal === null) continue;

    const openingDecimal = parseDecimalOdds(row.opening_odds ?? row.opening_decimal_odds ?? row.opening_price);
    const rawMovement =
      typeof (row.movement ?? row.movement_direction) === "string"
        ? String(row.movement ?? row.movement_direction).trim()
        : null;
    const mv = classifyLineMovement({ openingDecimal, currentDecimal, rawMovement });
    const home = teamName(row.home_team);
    const away = teamName(row.away_team);
    const matchLabel = home && away ? `${home} vs ${away}` : undefined;
    const kickoffRaw = typeof row.event_date === "string" && Number.isFinite(Date.parse(row.event_date))
      ? row.event_date.trim()
      : undefined;
    const modelProb = lookupModelProb(options.modelProbsByKey, quote.market, selectionLine, quote.selection);
    if (modelProb === null) continue;
    const analytics = computeSpacetimeAnalytics(modelProb, currentDecimal, bookMeta.canonical, null);
    const capturedAtIso = normalizeCapturedAtIso(row.updated_at ?? row.captured_at ?? options.capturedAtUtc);
    if (!isFreshComparisonTimestamp(capturedAtIso, nowMs)) continue;
    const anchoredQuote = toSpacetimeAnchoredQuote({
      bookLabel: bookMeta.label,
      marketKey: quote.market,
      selection: quote.selection,
      line: selectionLine,
      bookDecimal: mv.currentDecimal,
      modelProb,
      movement: mv.signal,
      capturedAtIso,
    });

    out.push({
      ...(matchLabel ? { matchLabel } : {}),
      ...(kickoffRaw ? { kickoffUtc: kickoffRaw } : {}),
      market: quote.market,
      selection: quote.selection,
      line: selectionLine,
      book: bookMeta.canonical,
      bookLabel: bookMeta.label,
      openingDecimal: mv.openingDecimal,
      currentDecimal: mv.currentDecimal,
      deltaPct: mv.deltaPct,
      impliedProbDeltaPts: mv.impliedProbDeltaPts,
      signal: mv.signal,
      ...analytics,
      anchoredQuote,
    });
  }

  return out;
}

export function annotateBestOddsBySelection(rows: readonly OddsSnapshotRow[]): OddsSnapshotRow[] {
  const bestByKey = new Map<string, number>();
  for (const r of rows) {
    const k = `${r.event_id}\u001f${r.market}\u001f${r.line ?? "null"}\u001f${r.selection}`;
    const prev = bestByKey.get(k);
    if (prev === undefined || r.price_decimal > prev) {
      bestByKey.set(k, r.price_decimal);
    }
  }
  return rows.map((r) => {
    const k = `${r.event_id}\u001f${r.market}\u001f${r.line ?? "null"}\u001f${r.selection}`;
    const best = bestByKey.get(k);
    return best !== undefined && Math.abs(r.price_decimal - best) < 1e-6
      ? { ...r, is_best_odds: true }
      : r;
  });
}

export function parseBzzoiroOdds(params: {
  events: readonly BzOddsEvent[];
  oddsByEvent: ReadonlyMap<number, readonly BzOddsRow[]>;
  appLeague: CanonicalLeague;
  capturedAtIso: string;
  nowMs?: number;
}): OddsSnapshotRow[] {
  const capturedIso = normalizeUtcIsoSeconds(params.capturedAtIso);
  const candidates: OddsSnapshotRow[] = [];

  for (const ev of params.events) {
    const bzId = parseStrictFiniteNumber(ev.id);
    if (bzId === null) continue;
    const rows = params.oddsByEvent.get(bzId);
    if (!rows || rows.length === 0) continue;
    const home = teamName(ev.home_team);
    const away = teamName(ev.away_team);
    const kickoff = String(ev.event_date ?? "").trim();
    if (!home || !away || !kickoff) continue;

    let resolved: ReturnType<typeof buildCanonicalOddsEventId>;
    try {
      resolved = buildCanonicalOddsEventId({
        appLeague: params.appLeague,
        commenceTimeIso: kickoff,
        homeTeamRaw: home,
        awayTeamRaw: away,
      });
    } catch (err) {
      void err;
      continue;
    }
    if (!resolved) continue;

    for (const row of rows) {
      if (row.is_live === true) continue;
      const book = BZZOIRO_BOOK_MAP[String(row.bookmaker_slug ?? "").trim().toLowerCase()];
      if (!book || !isPermittedMarketQuoteBook(book)) continue;
      const quote = mapBzzoiroMarketQuote(row);
      if (!quote) continue;
      const currentDecimal = parseDecimalOdds(row.decimal_odds ?? row.odds ?? row.price_decimal);
      if (currentDecimal === null) continue;
      const { openingPrice, movementDirection } = resolveOpeningAndMovement(row, currentDecimal);
      candidates.push({
        event_id: resolved.eventId,
        sport: resolved.sport,
        league: resolved.leagueCode,
        market: quote.market,
        line: quote.line,
        selection: quote.selection,
        book,
        price_decimal: currentDecimal,
        ...(openingPrice !== undefined ? { opening_price: openingPrice } : {}),
        ...(movementDirection !== undefined ? { movement_direction: movementDirection } : {}),
        ts_captured: capturedIso,
        ts_event_start: resolved.tsEventStart,
        source: "scraped_ws",
      });
    }
  }

  const accepted = validateOddsTickBatch(candidates, { nowMs: params.nowMs }).acceptedRows;
  return annotateBestOddsBySelection(accepted);
}

interface BzPageBody<T> {
  results?: T[];
  comparisons?: T[];
  odds?: T[];
  next?: string | null;
}

export class BzzoiroOddsAdapter implements OddsSourceAdapter {
  readonly metadata = SOURCE_LEGAL_REGISTRY.bzzoiro_odds!;
  private readonly transport: CleanHttpTransport;
  requestCount = 0;

  constructor(
    private readonly options: {
      env?: Readonly<Record<string, string | undefined>>;
      transport?: CleanHttpTransport;
    } = {},
  ) {
    this.transport =
      options.transport ?? new CleanHttpTransport({ rateLimitRps: this.metadata.rateLimitRps });
  }

  private get env(): Readonly<Record<string, string | undefined>> {
    return this.options.env ?? process.env;
  }

  private get isUnlimited(): boolean {
    const raw = (this.env.BZZOIRO_UNLIMITED ?? "").trim().toLowerCase();
    return raw === "1" || raw === "true" || raw === "yes";
  }

  private async getRawJson(path: string, query: Record<string, string>): Promise<unknown> {
    const base = (this.env.BZZOIRO_API_BASE_URL?.trim() || BZZOIRO_ODDS_BASE_URL_DEFAULT).replace(/\/+$/, "");
    const token = this.env.BZZOIRO_API_KEY!.trim();
    const resp = await this.transport.request({
      method: "GET",
      url: `${base}${path}`,
      headers: { authorization: `Token ${token}` },
      query,
    });
    this.requestCount += 1;
    if (resp.status < 200 || resp.status >= 300) {
      throw new Error(`Bzzoiro respondió ${resp.status} en ${path}`);
    }
    return JSON.parse(resp.bodyText) as unknown;
  }

  private async getAll<T>(path: string, query: Record<string, string>): Promise<T[]> {
    const out: T[] = [];
    const maxPages = this.isUnlimited ? MAX_PAGES_UNLIMITED : MAX_PAGES;
    for (let page = 0; page < maxPages; page += 1) {
      const body = (await this.getRawJson(path, {
        ...query,
        limit: String(PAGE_LIMIT),
        offset: String(page * PAGE_LIMIT),
      })) as BzPageBody<T> | T[];
      if (Array.isArray(body)) {
        out.push(...body);
        break;
      }
      const items = body.results ?? body.comparisons ?? body.odds ?? [];
      out.push(...items);
      if (!body.next) break;
    }
    return out;
  }

  async fetchBestOddsByMarket(market: string = "1x2"): Promise<BzOddsRow[]> {
    assertSourceLegallyAllowed(this.metadata.sourceId, this.env);
    const raw = await this.getRawJson("/odds/best/", { market, limit: String(PAGE_LIMIT) });
    return flattenComparisonRows(raw);
  }

  async fetchBestOddsAnalyzed(
    market: string = "1x2",
    options: {
      modelProbsByKey?: ReadonlyMap<string, number> | Readonly<Record<string, number>>;
      capturedAtUtc?: string;
      priorityBooksOnly?: boolean;
      requireSpacetimeAnchor?: boolean;
    } = {},
  ): Promise<BestOddsComparisonEntry[]> {
    assertSourceLegallyAllowed(this.metadata.sourceId, this.env);
    const raw = await this.getRawJson("/odds/best/", { market, limit: String(PAGE_LIMIT) });
    return parseBzzoiroBestOdds(raw, {
      modelProbsByKey: options.modelProbsByKey,
      capturedAtUtc: options.capturedAtUtc ?? new Date().toISOString(),
      priorityBooksOnly: options.priorityBooksOnly,
      requireSpacetimeAnchor: true,
    });
  }

  async fetchBestOddsExtendedMarkets(
    markets: readonly string[] = BZZOIRO_EXTENDED_ODDS_MARKETS,
    options: {
      modelProbsByKey?: ReadonlyMap<string, number> | Readonly<Record<string, number>>;
      capturedAtUtc?: string;
      priorityBooksOnly?: boolean;
      requireSpacetimeAnchor?: boolean;
    } = {},
  ): Promise<BestOddsComparisonEntry[]> {
    assertSourceLegallyAllowed(this.metadata.sourceId, this.env);
    const all: BestOddsComparisonEntry[] = [];
    for (const market of markets) {
      const rows = await this.fetchBestOddsAnalyzed(market, {
        modelProbsByKey: options.modelProbsByKey,
        capturedAtUtc: options.capturedAtUtc,
        priorityBooksOnly: options.priorityBooksOnly,
        requireSpacetimeAnchor: true,
      });
      all.push(...rows);
    }
    return all;
  }

  async fetchEventOddsComparison(providerEventId: number): Promise<BzOddsRow[]> {
    assertSourceLegallyAllowed(this.metadata.sourceId, this.env);
    const raw = await this.getRawJson(`/events/${providerEventId}/odds/comparison/`, {});
    return flattenComparisonRows(raw);
  }

  async fetchEventOddsComparisonAnalyzed(
    providerEventId: number,
    options: {
      modelProbsByKey?: ReadonlyMap<string, number> | Readonly<Record<string, number>>;
      capturedAtUtc?: string;
      priorityBooksOnly?: boolean;
      requireSpacetimeAnchor?: boolean;
    } = {},
  ): Promise<SelectionOddsComparison[]> {
    assertSourceLegallyAllowed(this.metadata.sourceId, this.env);
    const raw = await this.getRawJson(`/events/${providerEventId}/odds/comparison/`, {});
    return parseBzzoiroOddsComparison(raw, {
      modelProbsByKey: options.modelProbsByKey,
      capturedAtUtc: options.capturedAtUtc ?? new Date().toISOString(),
      priorityBooksOnly: options.priorityBooksOnly,
      requireSpacetimeAnchor: true,
    });
  }

  async fetchSnapshots(
    params: { activeLeagues?: readonly CanonicalLeague[]; capturedAtIso?: string } = {},
  ): Promise<OddsSnapshotRow[]> {
    assertSourceLegallyAllowed(this.metadata.sourceId, this.env);
    const capturedAtIso = normalizeUtcIsoSeconds(params.capturedAtIso ?? new Date().toISOString());
    const nowMs = Date.parse(capturedAtIso);
    const dateFrom = capturedAtIso.slice(0, 10);
    const dateTo = new Date(nowMs + LOOKAHEAD_DAYS * 86_400_000).toISOString().slice(0, 10);

    const leagues = (params.activeLeagues ?? BZZOIRO_ODDS_LEAGUES).filter((l) =>
      BZZOIRO_ODDS_LEAGUES.includes(l),
    );

    const allRows: OddsSnapshotRow[] = [];
    for (const league of leagues) {
      const bzLeagueIds = BZZOIRO_LEAGUES[league as keyof typeof BZZOIRO_LEAGUES] ?? [];
      for (const leagueId of bzLeagueIds) {
        const events = (
          await this.getAll<BzOddsEvent>("/events/", {
            league_id: String(leagueId),
            date_from: dateFrom,
            date_to: dateTo,
          })
        ).filter((e) => {
          const ko = Date.parse(String(e.event_date ?? ""));
          return Number.isFinite(ko) && ko > nowMs && String(e.status ?? "") === "notstarted";
        });

        const oddsByEvent = new Map<number, BzOddsRow[]>();
        for (const ev of events) {
          const id = parseStrictFiniteNumber(ev.id);
          if (id === null) continue;
          const evOdds = await this.getAll<BzOddsRow>("/odds/", { event_id: String(id) });
          oddsByEvent.set(id, evOdds);
        }

        allRows.push(
          ...parseBzzoiroOdds({ events, oddsByEvent, appLeague: league, capturedAtIso, nowMs }),
        );
      }
    }
    return allRows;
  }
}
