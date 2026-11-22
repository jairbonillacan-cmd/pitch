import {
  parseStrictFiniteNumber,
  sportScoringUnit,
  type LiveScoreboardEntry,
} from "@pitchlab/contracts";
import { formatOddsValue } from "../../access-guard";
import type { LiveAsianPickState, LivePickLineupAlert } from "../../atomic";
import { normalizeBookKey } from "../../bookmakers";
import type { MaestroIconName } from "../../components/MaestroPrimitives";
import type { MarketCategoryIconName } from "../../components/PackSportIcons";
import type { LivePickProgressItem } from "../../live/live-pick-progress";
import {
  MARKET_FAMILIES,
  MARKET_FAMILY_IDS,
  gradeCatalogPick,
  type CatalogPickItem,
  type MarketFamilyId,
  type PickDirection,
  type PickSettlementStatus,
  type PlayerPropMeta,
} from "../../picks-catalog";
import type {
  ScreenerBandFilter,
  ScreenerKindFilter,
  ScreenerSortKey,
  ScreenerSportFilter,
  ScreenerWindowFilter,
} from "../../screener-views";
import type {
  MatchPick,
  OddsFormat,
  PlatformGame,
  PlatformMarketRow,
} from "../../types";
import {
  computeExpectedValuePct,
  type OddsMovementInfo,
} from "./BookmakerComparePill";
import type {
  EvidenceWindowItem,
  EvidenceWindowTone,
} from "./EvidenceWindowPills";

export type Band = ScreenerBandFilter;
export type GroupMode = "match" | "market" | "flat";
export type TimingMode = "upcoming" | "live" | "settled";
export type PickTypeFilter = "all" | "team_match" | "player";
export type DirectionFilter = "all" | "over" | "under" | "side" | "yes_no";
export type ScreenerSortExtended =
  | "recomendados"
  | "ev"
  | "p"
  | "movimiento"
  | "hora"
  | "relevancia"
  | "momio";
export type PeriodFilter = "all" | "ft" | "1h" | "2h" | "f5";
export type PositionFilter =
  | "all"
  | "home"
  | "away"
  | "total"
  | "fwd"
  | "mid"
  | "def_gk"
  | "guard"
  | "frontcourt";
export type LegacyFamilyGroup =
  | "all"
  | "resultado"
  | "goles"
  | "ambos"
  | "handicap"
  | "conteos"
  | "props"
  | "nba"
  | "mlb"
  | "nhl"
  | "nfl";
export type MarketFamilyFilter = LegacyFamilyGroup | MarketFamilyId;

export interface LiveTrackedLegView {
  readonly pickId: string;
  readonly gameId: string;
  readonly leagueLabel: string;
  readonly matchLabel: string;
  readonly pickLabel: string;
  readonly href: string;
  readonly clockLabel: string;
  readonly actualValue: number;
  readonly targetLine: number;
  readonly unitLabel: string;
  readonly direction: "over" | "under" | "handicap";
  readonly projectedFinal: number;
  readonly asianState: LiveAsianPickState | null;
  readonly starterAlert: LivePickLineupAlert;
  readonly starterAlertDetail: string | null;
}

export interface LiveTrackedPickView {
  readonly id: string;
  readonly pickId: string;
  readonly gameId: string;
  readonly pickKind: "single" | "parlay";
  readonly leagueLabel: string;
  readonly matchLabel: string;
  readonly pickLabel: string;
  readonly href: string;
  readonly clockLabel: string;
  readonly actualValue: number;
  readonly targetLine: number;
  readonly unitLabel: string;
  readonly direction: "over" | "under" | "handicap";
  readonly projectedFinal: number;
  readonly asianState: LiveAsianPickState | null;
  readonly starterAlert: LivePickLineupAlert;
  readonly starterAlertDetail: string | null;
  readonly hitLocked: boolean;
  readonly legs: readonly LiveTrackedLegView[];
}

export interface ParsedLiveTrackedPayload {
  readonly nextPollSeconds: number | null;
  readonly items: readonly LiveTrackedPickView[];
}

export type QuickPresetId =
  | "mejor-valor"
  | "alta-prob"
  | "goles"
  | "principales"
  | "props"
  | "en-vivo";

export type FilterAccordionId =
  | "group"
  | "sort"
  | "pickType"
  | "direction"
  | "period"
  | "markets"
  | "position"
  | "competitions"
  | "teams"
  | "odds"
  | "band"
  | "dates"
  | "casas";

export interface QuickPresetSpec {
  readonly id: QuickPresetId;
  readonly label: string;
  readonly maestroIcon?: MaestroIconName;
  readonly marketIcon?: MarketCategoryIconName;
}

export interface ScreenerItem {
  readonly game: PlatformGame;
  readonly pick: MatchPick;
  readonly catalogPick: CatalogPickItem;
  readonly tabBucket: TimingMode;
  readonly isLiveGame: boolean;
  readonly isSettled: boolean;
  readonly settlement: PickSettlementStatus;
  readonly liveEntry?: LiveScoreboardEntry;
  readonly liveProgress: LivePickProgressItem | null;
  readonly family: Exclude<LegacyFamilyGroup, "all">;
  readonly catalogFamilyId: MarketFamilyId;
  readonly directionBucket: Exclude<DirectionFilter, "all">;
  readonly period: Exclude<PeriodFilter, "all">;
  readonly sideBucket: "home" | "away" | "total";
  readonly playerPositionBucket: Exclude<PositionFilter, "all" | "home" | "away" | "total"> | null;
  readonly playerMeta: PlayerPropMeta | null;
  readonly recommendationScore: number;
  readonly isRecommended: boolean;
  readonly convergenceCount: number;
  readonly valueThresholdLabel: string | null;
  readonly projectedScoreLabel: string | null;
  readonly houseDecimal: number | null;
  readonly houseLabel: string | null;
  readonly openDecimal: number | null;
  readonly movementDir: "shortening" | "drifting" | "stable" | null;
  readonly movement: OddsMovementInfo | null;
  readonly movementScore: number;
  readonly capturedAtUtc: string | null;
  readonly valuePct: number | null;
  readonly edgePts: number | null;
  readonly isPricingAnomalous: boolean;
  readonly evidenceWindows: readonly EvidenceWindowItem[];
  readonly searchHaystack: string;
}

export const SPORT_OPTIONS: ReadonlyArray<{ id: ScreenerSportFilter; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "futbol", label: "Fútbol" },
  { id: "nba", label: "NBA" },
  { id: "mlb", label: "MLB" },
  { id: "nhl", label: "NHL" },
  { id: "nfl", label: "NFL" },
];

export const WINDOW_OPTIONS: ReadonlyArray<{ id: ScreenerWindowFilter; label: string }> = [
  { id: "all", label: "Toda la agenda" },
  { id: "today", label: "Hoy" },
  { id: "next48h", label: "Próx. 48 h" },
];

export const PICK_TYPE_OPTIONS: ReadonlyArray<{ id: PickTypeFilter; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "team_match", label: "Equipo y partido" },
  { id: "player", label: "Props de jugador" },
];

export const DIRECTION_OPTIONS: ReadonlyArray<{ id: DirectionFilter; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "over", label: "Más de (Over)" },
  { id: "under", label: "Menos de (Under)" },
  { id: "side", label: "Resultado / Hándicap / Combo" },
  { id: "yes_no", label: "Sí / No" },
];

export const BANDS: ReadonlyArray<{ id: Band; label: string; hint: string }> = [
  { id: "all", label: "Todas", hint: "" },
  { id: "alta", label: "≥ 70 %", hint: "Probabilidad Spacetime 70 % o más" },
  { id: "media", label: "55–69 %", hint: "Probabilidad Spacetime 55 a 69 %" },
  { id: "baja", label: "< 55 %", hint: "Probabilidad Spacetime menor a 55 %" },
];

export const PERIOD_OPTIONS: ReadonlyArray<{ id: PeriodFilter; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "ft", label: "Partido completo" },
  { id: "1h", label: "1.ª mitad (1T)" },
  { id: "2h", label: "2.ª mitad (2T)" },
  { id: "f5", label: "5 entradas (MLB F5)" },
];

export const POSITION_OPTIONS: ReadonlyArray<{ id: PositionFilter; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "home", label: "Local" },
  { id: "away", label: "Visitante" },
  { id: "total", label: "Total / Neutral" },
  { id: "fwd", label: "Delantero (FWD)" },
  { id: "mid", label: "Mediocampo (MID)" },
  { id: "def_gk", label: "Defensa / Portero" },
  { id: "guard", label: "Guard NBA (G)" },
  { id: "frontcourt", label: "Frontcourt NBA (F/C)" },
];

export const MARKET_FAMILY_GROUPS: ReadonlyArray<{ id: LegacyFamilyGroup; label: string }> = [
  { id: "all", label: "Todos (34 familias)" },
  { id: "resultado", label: "Resultado (1X2 / DC / DNB)" },
  { id: "goles", label: "Goles y totales" },
  { id: "ambos", label: "Ambos anotan y portería" },
  { id: "handicap", label: "Hándicaps y spreads" },
  { id: "conteos", label: "Córners, tiros y tarjetas" },
  { id: "props", label: "Props Jugador" },
  { id: "nba", label: "NBA (ML / Spread / Props)" },
  { id: "mlb", label: "MLB (ML / Run Line / F5)" },
  { id: "nhl", label: "NHL (ML / Puck Line)" },
  { id: "nfl", label: "NFL (ML / Spread / Totales)" },
];

export const MARKET_FAMILY_SHORT_LABELS: Readonly<Record<Exclude<LegacyFamilyGroup, "all">, string>> = {
  resultado: "Resultado",
  goles: "Goles y totales",
  ambos: "Ambos anotan y portería",
  handicap: "Hándicaps y spreads",
  conteos: "Córners, tiros y tarjetas",
  props: "Props de jugador",
  nba: "NBA",
  mlb: "MLB",
  nhl: "NHL",
  nfl: "NFL",
};

export const QUICK_BOOKS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "pinnacle", label: "Pinnacle" },
  { id: "bet365", label: "Bet365" },
  { id: "codere", label: "Codere" },
  { id: "betcris", label: "Betcris" },
  { id: "novibet", label: "Novibet" },
  { id: "draftkings", label: "DraftKings" },
  { id: "fanduel", label: "FanDuel" },
];

export const GROUP_MODES: ReadonlyArray<{ id: GroupMode; label: string; shortLabel: string }> = [
  { id: "match", label: "Por partido", shortLabel: "Partidos" },
  { id: "market", label: "Por mercado", shortLabel: "Mercados" },
  { id: "flat", label: "Lista plana", shortLabel: "Lista plana" },
];

export const SORT_OPTIONS: ReadonlyArray<{ id: ScreenerSortExtended; label: string }> = [
  { id: "recomendados", label: "Recomendados" },
  { id: "ev", label: "Valor real EV+" },
  { id: "p", label: "Probabilidad Spacetime" },
  { id: "movimiento", label: "Movimiento de línea" },
  { id: "hora", label: "Próximo inicio" },
  { id: "relevancia", label: "Balance prob. y momio" },
  { id: "momio", label: "Mayor momio" },
];

export const QUICK_PRESETS: ReadonlyArray<QuickPresetSpec> = [
  { id: "mejor-valor", label: "Mejor valor", marketIcon: "expected-value" },
  { id: "alta-prob", label: "Alta probabilidad", maestroIcon: "verified-seal" },
  { id: "goles", label: "Goles", marketIcon: "over-under" },
  { id: "principales", label: "Mercados principales", marketIcon: "result-1x2" },
  { id: "props", label: "Props", maestroIcon: "player-props" },
  { id: "en-vivo", label: "En vivo", maestroIcon: "live-pulse" },
];

export const EXTENDED_SYNTH_MARKETS = new Set([
  "corners_total",
  "corners_team",
  "shots_total",
  "shots_on_target",
  "sot_total",
  "fouls_total",
  "cards_total",
  "yellow_total",
  "asian_handicap",
  "double_chance",
  "dnb",
  "clean_sheet",
  "clean_sheet_home",
  "clean_sheet_away",
  "win_to_nil",
  "team_totals",
  "half_time_result",
  "second_half_result",
  "combo_1x2_over",
  "combo_1x2_btts",
  "mlb_f5",
  "mlb_run_line",
  "mlb_moneyline",
  "mlb_totals",
  "nhl_puck_line",
  "nhl_puckline",
  "nhl_moneyline",
  "nhl_totals",
  "nba_moneyline",
  "nba_spread",
  "nba_totals",
  "nba_player_props",
  "nfl_moneyline",
  "nfl_spread",
  "nfl_totals",
  "player_props_football",
]);

export const CATALOG_FAMILY_ID_SET: ReadonlySet<string> = new Set(MARKET_FAMILY_IDS);
export const LEGACY_FAMILY_GROUP_SET: ReadonlySet<string> = new Set(
  MARKET_FAMILY_GROUPS.map((item) => item.id),
);
export const INITIAL_GAMES_SHOWN = 3;
export const GAMES_PAGE_STEP = 6;
export const PER_MATCH_INITIAL_PICKS = 4;
export const PER_MATCH_LOAD_STEP = 6;
export const INITIAL_FLAT_PICKS = 12;
export const FLAT_PICKS_STEP = 20;
export const TRIVIAL_ODDS_FLOOR = 1.25;
export const DEFAULT_LIVE_TRACKER_POLL_MS = 30_000;
export const MAX_AUDITABLE_EV_PCT = 20;
export const MAX_SHARP_AUDITABLE_EV_PCT = 18;
export const MAX_SOFT_AUDITABLE_EV_PCT = 22;
export const MAX_DEVIG_DIVERGENCE_PROB = 0.12;
export const MAX_AUDITABLE_EDGE_PTS = 15;

const SHARP_BOOK_TOKENS = new Set([
  "pinnacle",
  "betfair",
  "betfairexchange",
  "matchbook",
  "smarkets",
  "circa",
  "circasports",
  "betcris",
  "bookmaker",
  "lowvig",
]);

const LINE_SENSITIVE_MARKETS = new Set([
  "totals",
  "over_under",
  "team_totals",
  "combo_1x2_over",
  "spread",
  "asian_handicap",
  "corners_total",
  "corners_team",
  "shots_total",
  "shots_on_target",
  "sot_total",
  "fouls_total",
  "cards_total",
  "yellow_total",
  "nba_spread",
  "nba_totals",
  "mlb_run_line",
  "mlb_totals",
  "mlb_f5",
  "nhl_puck_line",
  "nhl_puckline",
  "nhl_totals",
  "nfl_spread",
  "nfl_totals",
  "player_props_football",
  "nba_player_props",
]);

export function isLineSensitiveMarket(market: string): boolean {
  const norm = market.toLowerCase();
  return LINE_SENSITIVE_MARKETS.has(norm) || norm.startsWith("totals_");
}

export function isSharpQuoteBook(
  bookId?: string | null,
  bookLabel?: string | null,
): boolean {
  const raw = `${bookId ?? ""} ${bookLabel ?? ""}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!raw) return false;
  for (const token of raw.split(/\s+/)) {
    if (SHARP_BOOK_TOKENS.has(token)) return true;
  }
  return false;
}

export function buildMarketLookupKey(
  market: string,
  selection: string,
  line: number | null | undefined,
): string {
  const lineStr =
    typeof line === "number" && Number.isFinite(line) ? String(line) : "";
  return `${market.toLowerCase()}::${selection.toLowerCase()}::${lineStr}`;
}

export function sameMarketGroup(a: string, b: string): boolean {
  const na = a.toLowerCase();
  const nb = b.toLowerCase();
  if (na === nb) return true;
  if ((na === "h2h" && nb === "1x2") || (na === "1x2" && nb === "h2h")) {
    return true;
  }
  const aTotals = na === "totals" || na === "over_under" || na.startsWith("totals_");
  const bTotals = nb === "totals" || nb === "over_under" || nb.startsWith("totals_");
  return aTotals && bTotals;
}

export function resolveSameBookDeVigProbForMarket(
  markets: readonly PlatformMarketRow[],
  market: string,
  selection: string,
  line: number | null | undefined,
  bookKey: string,
): number | null {
  if (!bookKey) return null;
  const normalizedLine =
    typeof line === "number" && Number.isFinite(line) ? line : null;
  const needsLine = isLineSensitiveMarket(market);
  const bySelection = new Map<string, number>();

  for (const row of markets) {
    if (!sameMarketGroup(row.market, market)) continue;
    const rowLine =
      typeof row.line === "number" && Number.isFinite(row.line) ? row.line : null;
    if (needsLine) {
      if (normalizedLine === null || rowLine === null || Math.abs(rowLine - normalizedLine) > 1e-6) {
        continue;
      }
    } else if (normalizedLine !== null && rowLine !== null && Math.abs(rowLine - normalizedLine) > 1e-6) {
      continue;
    }
    const matchingQuote = (row.bookQuotes ?? []).find(
      (q) =>
        normalizeBookKey(q.book) === bookKey &&
        Number.isFinite(q.decimal) &&
        q.decimal > 1.01,
    );
    const selKey = row.selection.toLowerCase();
    if (matchingQuote && !bySelection.has(selKey)) {
      bySelection.set(selKey, matchingQuote.decimal);
    }
  }

  const targetDec = bySelection.get(selection.toLowerCase());
  if (targetDec == null || bySelection.size < 2) return null;
  let invSum = 0;
  for (const dec of bySelection.values()) {
    invSum += 1 / dec;
  }
  if (!Number.isFinite(invSum) || invSum < 0.92 || invSum > 1.32) return null;
  return Math.round((1 / targetDec / invSum) * 10000) / 10000;
}

export function evaluateAuditableQuotePricing(params: {
  readonly p: number;
  readonly houseDecimal: number | null;
  readonly bookId?: string | null;
  readonly bookLabel?: string | null;
  readonly deVigProb: number | null;
}): {
  readonly valuePct: number | null;
  readonly edgePts: number | null;
  readonly isAnomalous: boolean;
} {
  const { p, houseDecimal, bookId, bookLabel, deVigProb } = params;
  if (houseDecimal === null || !Number.isFinite(houseDecimal) || houseDecimal <= 1.01) {
    return { valuePct: null, edgePts: null, isAnomalous: false };
  }
  const rawEvPct = computeExpectedValuePct(p, houseDecimal);
  const rawEdgePts =
    Number.isFinite(p) && p > 0 && p < 1
      ? Math.round((p - 1 / houseDecimal) * 1000) / 10
      : null;
  const evCap = isSharpQuoteBook(bookId, bookLabel)
    ? MAX_SHARP_AUDITABLE_EV_PCT
    : MAX_SOFT_AUDITABLE_EV_PCT;
  const exceedsEvCap = rawEvPct !== null && rawEvPct > evCap;
  const divergesFromDeVig =
    deVigProb !== null &&
    Number.isFinite(deVigProb) &&
    Math.abs(p - deVigProb) > MAX_DEVIG_DIVERGENCE_PROB;

  if (exceedsEvCap || divergesFromDeVig) {
    return { valuePct: null, edgePts: null, isAnomalous: true };
  }
  return { valuePct: rawEvPct, edgePts: rawEdgePts, isAnomalous: false };
}

const PICK_UNIT_TOKEN_RE =
  /\b(?:goles?|puntos?|pts|carreras?|c[oó]rners?|tiros?(?:\s+a\s+puerta)?|remates?|tarjetas?|amarillas?|faltas?|rebotes?|reb|asistencias?|ast|triples?|3pm|g\+a|atajadas?|yardas?|touchdowns?)\b/i;

const PICK_BARE_OVER_UNDER_RE =
  /(\b(?:m[aá]s\s+de|menos\s+de|over|under)\s+\d+(?:[.,]\d+)?)(?=\s*(?:$|[()·|—,-]))/gi;

const THRESHOLD_DECIMAL_EXACT_RE =
  /^Tiene valor si tu casa paga\s+(\d+(?:\.\d+)?)\s+o m[aá]s\.?$/i;

const THRESHOLD_INLINE_ODDS_RE = /\b(paga|desde)\s+(\d+\.\d{2})\b/gi;

export function resolveUnitForFamily(
  familyId: MarketFamilyId,
  sport: PlatformGame["sport"],
  statLabel?: string | null,
): string {
  if (statLabel && statLabel.trim().length > 0) {
    return statLabel.trim().toLowerCase();
  }
  if (familyId === "corners_total" || familyId === "corners_team") return "córners";
  if (familyId === "shots_on_target") return "tiros a puerta";
  if (familyId === "shots_total") return "tiros";
  if (familyId === "cards_total") return "tarjetas";
  if (familyId === "fouls_total") return "faltas";
  return sportScoringUnit(sport).plural;
}

export function ensurePickLabelWithUnit(
  label: string,
  familyId: MarketFamilyId,
  sport: PlatformGame["sport"],
  statLabel?: string | null,
): string {
  const trimmed = label.trim();
  if (!trimmed || PICK_UNIT_TOKEN_RE.test(trimmed)) return trimmed;
  const unit = resolveUnitForFamily(familyId, sport, statLabel);
  return trimmed.replace(PICK_BARE_OVER_UNDER_RE, `$1 ${unit}`);
}

export function formatValueThresholdForOdds(
  item: ScreenerItem,
  oddsFormat: OddsFormat,
  isSecondary = false,
): string {
  const minValueOdds =
    item.pick.p > 0.01 && item.pick.p < 0.99
      ? Math.max(1.02, Math.ceil((1 / item.pick.p) * 100 + 1) / 100)
      : item.pick.fairDecimal;
  const raw = item.valueThresholdLabel?.trim() ?? "";
  if (raw.length > 0) {
    const exactMatch = THRESHOLD_DECIMAL_EXACT_RE.exec(raw);
    if (exactMatch?.[1]) {
      const parsed = parseStrictFiniteNumber(exactMatch[1]);
      const targetDec = parsed !== null && parsed > 1.01 ? parsed : minValueOdds;
      return `Tiene valor si tu casa paga ${formatOddsValue(targetDec, oddsFormat)} o más`;
    }
    return raw.replace(THRESHOLD_INLINE_ODDS_RE, (full, verb: string, decStr: string) => {
      const parsed = parseStrictFiniteNumber(decStr);
      if (parsed === null || parsed <= 1.01) return full;
      return `${verb} ${formatOddsValue(parsed, oddsFormat)}`;
    });
  }
  if (isSecondary) {
    return `Justo ${formatOddsValue(item.pick.fairDecimal, oddsFormat)}`;
  }
  return `Tiene valor si tu casa paga ${formatOddsValue(minValueOdds, oddsFormat)} o más`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseLiveDirectionValue(value: unknown): "over" | "under" | "handicap" {
  if (value === "under" || value === "handicap") return value;
  return "over";
}

function parseAsianState(value: unknown): LiveAsianPickState | null {
  if (
    value === "won_full" ||
    value === "won_half" ||
    value === "push" ||
    value === "lost_half" ||
    value === "lost_full"
  ) {
    return value;
  }
  return null;
}

function parseStarterAlert(value: unknown): LivePickLineupAlert {
  return value === "titular_en_banca" ? "titular_en_banca" : null;
}

function parseLiveTrackedLeg(raw: unknown): LiveTrackedLegView | null {
  if (!isRecord(raw)) return null;
  const pickId = typeof raw.pickId === "string" ? raw.pickId : "";
  const gameId = typeof raw.gameId === "string" ? raw.gameId : "";
  const pickLabel = typeof raw.pickLabel === "string" ? raw.pickLabel : "";
  const matchLabel = typeof raw.matchLabel === "string" ? raw.matchLabel : "";
  const actualValue = parseStrictFiniteNumber(raw.actualValue);
  const targetLine = parseStrictFiniteNumber(raw.targetLine);
  const projectedFinal = parseStrictFiniteNumber(raw.projectedFinal);
  if (!pickId || !pickLabel || actualValue === null || targetLine === null) {
    return null;
  }
  return {
    pickId,
    gameId,
    leagueLabel: typeof raw.leagueLabel === "string" ? raw.leagueLabel : "",
    matchLabel,
    pickLabel,
    href: typeof raw.href === "string" && raw.href.startsWith("/") ? raw.href : "/app",
    clockLabel: typeof raw.clockLabel === "string" ? raw.clockLabel : "En vivo",
    actualValue,
    targetLine,
    unitLabel: typeof raw.unitLabel === "string" ? raw.unitLabel : "",
    direction: parseLiveDirectionValue(raw.direction),
    projectedFinal: projectedFinal ?? actualValue,
    asianState: parseAsianState(raw.asianState),
    starterAlert: parseStarterAlert(raw.starterAlert),
    starterAlertDetail: typeof raw.starterAlertDetail === "string" ? raw.starterAlertDetail : null,
  };
}

function parseLiveTrackedPick(raw: unknown): LiveTrackedPickView | null {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id : "";
  const pickId = typeof raw.pickId === "string" ? raw.pickId : id;
  const gameId = typeof raw.gameId === "string" ? raw.gameId : "";
  const pickLabel = typeof raw.pickLabel === "string" ? raw.pickLabel : "";
  const matchLabel = typeof raw.matchLabel === "string" ? raw.matchLabel : "";
  const actualValue = parseStrictFiniteNumber(raw.actualValue);
  const targetLine = parseStrictFiniteNumber(raw.targetLine);
  const projectedFinal = parseStrictFiniteNumber(raw.projectedFinal);
  if (!id || !pickLabel || actualValue === null || targetLine === null) {
    return null;
  }
  const rawLegs = Array.isArray(raw.legs) ? raw.legs : [];
  const legs: LiveTrackedLegView[] = [];
  for (const legRaw of rawLegs) {
    const parsedLeg = parseLiveTrackedLeg(legRaw);
    if (parsedLeg) legs.push(parsedLeg);
  }
  return {
    id,
    pickId,
    gameId,
    pickKind: raw.pickKind === "parlay" ? "parlay" : "single",
    leagueLabel: typeof raw.leagueLabel === "string" ? raw.leagueLabel : "",
    matchLabel,
    pickLabel,
    href: typeof raw.href === "string" && raw.href.startsWith("/") ? raw.href : "/app",
    clockLabel: typeof raw.clockLabel === "string" ? raw.clockLabel : "En vivo",
    actualValue,
    targetLine,
    unitLabel: typeof raw.unitLabel === "string" ? raw.unitLabel : "",
    direction: parseLiveDirectionValue(raw.direction),
    projectedFinal: projectedFinal ?? actualValue,
    asianState: parseAsianState(raw.asianState),
    starterAlert: parseStarterAlert(raw.starterAlert),
    starterAlertDetail: typeof raw.starterAlertDetail === "string" ? raw.starterAlertDetail : null,
    hitLocked: raw.hitLocked === true,
    legs,
  };
}

export function parseLiveTrackedPicksPayload(raw: unknown): ParsedLiveTrackedPayload | null {
  if (!isRecord(raw) || !Array.isArray(raw.items)) return null;
  const items: LiveTrackedPickView[] = [];
  for (const entry of raw.items) {
    const parsed = parseLiveTrackedPick(entry);
    if (parsed) items.push(parsed);
  }
  const nextPoll =
    raw.nextPollSeconds === null ? null : parseStrictFiniteNumber(raw.nextPollSeconds);
  return {
    nextPollSeconds: nextPoll,
    items,
  };
}

export function safeParseTimestamp(iso: string): number {
  const ts = Date.parse(iso);
  return Number.isFinite(ts) ? ts : 0;
}

export function normText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function parseSportFilter(raw: string): ScreenerSportFilter {
  if (
    raw === "futbol" ||
    raw === "nba" ||
    raw === "mlb" ||
    raw === "nhl" ||
    raw === "nfl"
  ) {
    return raw;
  }
  return "all";
}

export function parseWindowFilter(raw: string): ScreenerWindowFilter {
  if (raw === "today" || raw === "next48h") return raw;
  return "all";
}

export function parsePeriodFilter(raw: string): PeriodFilter {
  if (raw === "ft" || raw === "1h" || raw === "2h" || raw === "f5") return raw;
  return "all";
}

export function parsePositionFilter(raw: string): PositionFilter {
  if (
    raw === "home" ||
    raw === "away" ||
    raw === "total" ||
    raw === "fwd" ||
    raw === "mid" ||
    raw === "def_gk" ||
    raw === "guard" ||
    raw === "frontcourt"
  ) {
    return raw;
  }
  return "all";
}

export function parsePickTypeFilter(raw: string): PickTypeFilter {
  if (raw === "team_match" || raw === "player") return raw;
  return "all";
}

export function parseDirectionFilter(raw: string): DirectionFilter {
  if (raw === "over" || raw === "under" || raw === "side" || raw === "yes_no") return raw;
  return "all";
}

export function parseSortExtended(raw: string): ScreenerSortExtended {
  if (
    raw === "recomendados" ||
    raw === "ev" ||
    raw === "p" ||
    raw === "movimiento" ||
    raw === "hora" ||
    raw === "relevancia" ||
    raw === "momio"
  ) {
    return raw;
  }
  return "recomendados";
}

export function isCatalogFamilyId(raw: string): raw is MarketFamilyId {
  return CATALOG_FAMILY_ID_SET.has(raw);
}

export function parseFamilyFilter(raw: string): MarketFamilyFilter {
  if (isCatalogFamilyId(raw)) return raw;
  if (LEGACY_FAMILY_GROUP_SET.has(raw)) {
    for (const option of MARKET_FAMILY_GROUPS) {
      if (option.id === raw) return option.id;
    }
  }
  return "all";
}

export function defaultFamilyForSport(sport: PlatformGame["sport"]): MarketFamilyId {
  if (sport === "basketball") return "nba_moneyline";
  if (sport === "baseball") return "mlb_moneyline";
  if (sport === "ice-hockey") return "nhl_moneyline";
  if (sport === "american-football") return "nfl_moneyline";
  return "1x2";
}

export function resolveMarketFamilyIdFromRaw(
  rawMarket: string | undefined,
  sport: PlatformGame["sport"],
): MarketFamilyId | null {
  if (!rawMarket) return null;
  const lowered = rawMarket.toLowerCase();
  if (isCatalogFamilyId(lowered)) return lowered;
  if (lowered === "h2h") return defaultFamilyForSport(sport);
  if (lowered === "ou") return "totals";
  if (lowered === "yellow_total") return "cards_total";
  if (lowered === "sot_total") return "shots_on_target";
  if (lowered === "nhl_puckline") return "nhl_puck_line";
  if (lowered === "clean_sheet_home" || lowered === "clean_sheet_away") return "clean_sheet";
  return null;
}

export function primaryFamilyOf(
  pick: MatchPick,
  game: PlatformGame,
): Exclude<LegacyFamilyGroup, "all"> {
  const m = normText(pick.market ?? "");
  const g = normText(`${pick.market ?? ""} ${pick.marketGroup} ${pick.label}`);

  if (
    m.includes("player_prop") ||
    m.startsWith("player_") ||
    g.includes("prop jugador") ||
    g.includes("props jugador") ||
    g.includes("jugador:") ||
    g.includes("asistencia") ||
    g.includes("rebotes") ||
    g.includes("triples")
  ) {
    return "props";
  }
  if (
    m.includes("corner") ||
    m.includes("shot") ||
    m.includes("sot") ||
    m.includes("foul") ||
    m.includes("card") ||
    m.includes("yellow") ||
    g.includes("corner") ||
    g.includes("tiros") ||
    g.includes("remate") ||
    g.includes("tarjeta") ||
    g.includes("amarilla") ||
    g.includes("falta")
  ) {
    return "conteos";
  }
  if (
    m.includes("btts") ||
    m.includes("clean_sheet") ||
    g.includes("ambos anotan") ||
    g.includes("porteria a cero")
  ) {
    return "ambos";
  }
  if (
    m.includes("handicap") ||
    m.startsWith("ah_") ||
    m.includes("spread") ||
    m.includes("run_line") ||
    m.includes("puck") ||
    g.includes("handicap") ||
    g.includes("spread") ||
    g.includes("run line") ||
    g.includes("puck line") ||
    /[+-]\d+(?:\.\d+)?/.test(pick.label)
  ) {
    return "handicap";
  }
  if (
    m.includes("total") ||
    m === "ou" ||
    g.includes("total") ||
    g.includes("goles") ||
    g.includes("puntos") ||
    g.includes("mas de") ||
    g.includes("menos de")
  ) {
    return "goles";
  }
  if (game.sport === "basketball") return "nba";
  if (game.sport === "baseball") return "mlb";
  if (game.sport === "ice-hockey") return "nhl";
  if (game.sport === "american-football") return "nfl";
  return "resultado";
}

export function matchesMarketFamily(
  pick: MatchPick,
  game: PlatformGame,
  filter: MarketFamilyFilter,
  resolvedFamily: Exclude<LegacyFamilyGroup, "all">,
  catalogFamilyId?: MarketFamilyId,
): boolean {
  if (filter === "all") return true;
  if (isCatalogFamilyId(filter)) {
    const resolvedId =
      catalogFamilyId ?? resolveMarketFamilyIdFromRaw(pick.market, game.sport);
    return resolvedId === filter;
  }
  if (filter === "nba") {
    return game.sport === "basketball" || (pick.market ?? "").startsWith("nba_");
  }
  if (filter === "mlb") {
    return game.sport === "baseball" || (pick.market ?? "").startsWith("mlb_");
  }
  if (filter === "nhl") {
    return game.sport === "ice-hockey" || (pick.market ?? "").startsWith("nhl_");
  }
  if (filter === "nfl") {
    return game.sport === "american-football" || (pick.market ?? "").startsWith("nfl_");
  }
  if (filter === "resultado") {
    const m = normText(pick.market ?? "");
    const g = normText(`${pick.marketGroup} ${pick.label}`);
    return (
      resolvedFamily === "resultado" ||
      m.includes("moneyline") ||
      m === "1x2" ||
      m === "h2h" ||
      m === "double_chance" ||
      m === "dnb" ||
      m === "half_time_result" ||
      m === "second_half_result" ||
      m === "win_to_nil" ||
      m === "mlb_f5" ||
      m.startsWith("combo_1x2") ||
      g.includes("gana") ||
      g.includes("empate")
    );
  }
  return resolvedFamily === filter;
}

export function resolvePickPeriod(
  pick: MatchPick,
  catalogFamilyId?: MarketFamilyId,
): Exclude<PeriodFilter, "all"> {
  if (catalogFamilyId === "half_time_result") return "1h";
  if (catalogFamilyId === "second_half_result") return "2h";
  if (catalogFamilyId === "mlb_f5") return "f5";
  const hay = normText(`${pick.market ?? ""} ${pick.marketGroup} ${pick.label}`);
  if (
    hay.includes("half_time") ||
    hay.includes("1t") ||
    hay.includes("1.a mitad") ||
    hay.includes("1a parte") ||
    hay.includes("1er tiempo") ||
    hay.includes("primera mitad")
  ) {
    return "1h";
  }
  if (
    hay.includes("second_half") ||
    hay.includes("2t") ||
    hay.includes("2.a mitad") ||
    hay.includes("2a parte") ||
    hay.includes("2o tiempo") ||
    hay.includes("segunda mitad")
  ) {
    return "2h";
  }
  if (
    hay.includes("mlb_f5") ||
    hay.includes(" f5") ||
    hay.startsWith("f5 ") ||
    hay.includes("5 entradas")
  ) {
    return "f5";
  }
  return "ft";
}

export function periodShortTag(period: Exclude<PeriodFilter, "all">): string | null {
  if (period === "1h") return "1T";
  if (period === "2h") return "2T";
  if (period === "f5") return "F5";
  return null;
}

export function inferCatalogDirection(pick: MatchPick): PickDirection {
  const lbl = normText(pick.label);
  const sel = normText(pick.selectionKey);
  if (lbl.includes("+") && (lbl.includes("mas de") || lbl.includes("menos de") || lbl.includes("ambos"))) {
    return "combo";
  }
  if (lbl.includes("mas de") || lbl.includes("over") || sel.includes("over")) return "over";
  if (lbl.includes("menos de") || lbl.includes("under") || sel.includes("under")) return "under";
  if (pick.conflictGroup === "btts_yes" || sel === "yes" || lbl.includes("si")) return "yes";
  if (pick.conflictGroup === "btts_no" || sel === "no") return "no";
  if (pick.conflictGroup === "home_side" || sel === "home" || sel === "1") return "home";
  if (pick.conflictGroup === "away_side" || sel === "away" || sel === "2") return "away";
  if (pick.conflictGroup === "draw_side" || sel === "draw" || sel === "x") return "draw";
  return "combo";
}

export function directionToFilterBucket(direction: PickDirection): Exclude<DirectionFilter, "all"> {
  if (direction === "over") return "over";
  if (direction === "under") return "under";
  if (direction === "yes" || direction === "no") return "yes_no";
  return "side";
}

export function resolvePlayerPositionBucket(
  rawPosition: string | null | undefined,
  sport: PlatformGame["sport"],
): Exclude<PositionFilter, "all" | "home" | "away" | "total"> | null {
  if (!rawPosition) return null;
  const pos = rawPosition.trim().toUpperCase();
  if (sport === "basketball") {
    if (pos === "PG" || pos === "SG" || pos === "G" || pos === "G-F") return "guard";
    if (pos === "SF" || pos === "PF" || pos === "C" || pos === "F" || pos === "F-C") {
      return "frontcourt";
    }
    return null;
  }
  if (
    pos.includes("FWD") ||
    pos.includes("DELANTER") ||
    pos === "ST" ||
    pos === "CF" ||
    pos === "LW" ||
    pos === "RW" ||
    pos === "F"
  ) {
    return "fwd";
  }
  if (
    pos.includes("MID") ||
    pos.includes("MEDIO") ||
    pos === "CM" ||
    pos === "CAM" ||
    pos === "CDM" ||
    pos === "LM" ||
    pos === "RM" ||
    pos === "M"
  ) {
    return "mid";
  }
  if (
    pos.includes("DEF") ||
    pos.includes("PORTER") ||
    pos === "GK" ||
    pos === "CB" ||
    pos === "LB" ||
    pos === "RB" ||
    pos === "D"
  ) {
    return "def_gk";
  }
  return null;
}

export function resolveSideBucket(
  pick: MatchPick,
  game: PlatformGame,
  teamSide?: "home" | "away" | null,
): "home" | "away" | "total" {
  if (teamSide === "home") return "home";
  if (teamSide === "away") return "away";
  if (pick.conflictGroup === "home_side") return "home";
  if (pick.conflictGroup === "away_side") return "away";
  if (
    pick.conflictGroup === "over_total" ||
    pick.conflictGroup === "under_total" ||
    pick.conflictGroup === "btts_yes" ||
    pick.conflictGroup === "btts_no" ||
    pick.conflictGroup === "draw_side"
  ) {
    return "total";
  }
  const sel = normText(pick.selectionKey);
  if (sel.includes("home") || sel === "1" || sel === "1x") return "home";
  if (sel.includes("away") || sel === "2" || sel === "x2") return "away";
  const lbl = normText(pick.label);
  const homeNorm = normText(game.home.shortName);
  const awayNorm = normText(game.away.shortName);
  if (homeNorm.length >= 3 && lbl.includes(homeNorm) && !lbl.includes(awayNorm)) return "home";
  if (awayNorm.length >= 3 && lbl.includes(awayNorm) && !lbl.includes(homeNorm)) return "away";
  return "total";
}

export function formatProjectedScore(game: PlatformGame): string | null {
  if (!game.projection) return null;
  const h = game.projection.home;
  const a = game.projection.away;
  if (!Number.isFinite(h) || !Number.isFinite(a)) return null;
  if (game.sport === "football") {
    return `Proy. ${h.toFixed(1)}–${a.toFixed(1)}`;
  }
  return `Proy. ${Math.round(h)}–${Math.round(a)}`;
}

export function toSavedKind(filter: MarketFamilyFilter): ScreenerKindFilter {
  if (
    filter === "resultado" ||
    filter === "goles" ||
    filter === "conteos" ||
    filter === "ambos" ||
    filter === "handicap"
  ) {
    return filter;
  }
  return "all";
}

export function toSavedSort(sort: ScreenerSortExtended): ScreenerSortKey {
  if (sort === "ev" || sort === "movimiento") return "ventaja";
  if (sort === "recomendados") return "relevancia";
  return sort;
}

export function bandOf(p: number): Exclude<Band, "all"> {
  return p >= 0.7 ? "alta" : p >= 0.55 ? "media" : "baja";
}

export function buildCompactEvidenceBullets(
  windows: readonly EvidenceWindowItem[],
  catalogBullets?: readonly { readonly label: string; readonly ratePct: number | null; readonly tone: EvidenceWindowTone }[],
): readonly EvidenceWindowItem[] {
  const out: EvidenceWindowItem[] = [];
  const seenText = new Set<string>();

  const priorityOrder: readonly EvidenceWindowItem["key"][] = [
    "home_away",
    "l5",
    "l10",
    "h2h",
    "l20",
    "xg",
    "ref",
    "custom",
  ];

  for (const key of priorityOrder) {
    for (const w of windows) {
      if (w.key !== key) continue;
      const text = (w.detail && w.detail.trim().length > 0 ? w.detail : w.label).trim();
      const normKey = normText(text);
      if (seenText.has(normKey)) continue;
      seenText.add(normKey);
      out.push({
        ...w,
        detail: text,
      });
      if (out.length >= 3) return out;
    }
  }

  if (catalogBullets && out.length < 3) {
    for (const bullet of catalogBullets) {
      const text = bullet.label.trim();
      if (!text) continue;
      const normKey = normText(text);
      if (seenText.has(normKey)) continue;
      seenText.add(normKey);
      out.push({
        key: "custom",
        label: text,
        detail: text,
        value: bullet.ratePct !== null ? `${Math.round(bullet.ratePct)} %` : "—",
        ratePct: bullet.ratePct,
        tone: bullet.tone,
      });
      if (out.length >= 3) break;
    }
  }

  return out;
}

export function resolveSettlementStatus(
  game: PlatformGame,
  pick: MatchPick,
  catalogFamilyId?: MarketFamilyId,
  explicitSettlement?: PickSettlementStatus,
): PickSettlementStatus {
  if (explicitSettlement && explicitSettlement !== "pending") return explicitSettlement;
  if (pick.result === "hit") return "hit";
  if (pick.result === "miss") return "miss";
  if (game.status !== "FT" || !game.score) return "pending";
  const resolvedFamily = catalogFamilyId ?? resolveMarketFamilyIdFromRaw(pick.market, game.sport);
  if (!resolvedFamily) return "pending";
  return gradeCatalogPick({
    game,
    family: resolvedFamily,
    selectionKey: pick.selectionKey,
    line: pick.line ?? null,
  });
}

export function settlementLabel(status: PickSettlementStatus): string {
  if (status === "hit") return "Ganado";
  if (status === "miss") return "Perdido";
  if (status === "push") return "Push";
  return "Pendiente";
}

export function marketRowToScreenerPick(game: PlatformGame, m: PlatformMarketRow, idx: number): MatchPick {
  const sel = m.selection.toLowerCase();
  const lbl = m.label.toLowerCase();
  const conflictGroup: MatchPick["conflictGroup"] = m.market.includes("btts")
    ? sel.includes("no") || lbl.includes("no")
      ? "btts_no"
      : "btts_yes"
    : sel.includes("under") || lbl.includes("menos de")
      ? "under_total"
      : sel.includes("over") || lbl.includes("más de")
        ? "over_total"
        : sel === "home"
          ? "home_side"
          : sel === "away"
            ? "away_side"
            : sel === "draw"
              ? "draw_side"
              : "independent";

  return {
    id: `${game.id}__scr__${m.market}__${m.selection}__${m.line ?? idx}`,
    gameId: game.id,
    league: game.league,
    leagueLabel: game.leagueLabel,
    matchLabel: `${game.home.shortName} vs ${game.away.shortName}`,
    kickoffLocal: game.kickoffLocal,
    gameStatus: game.status,
    slotIndex: 30 + idx,
    category: "tactico",
    categoryLabel: m.group,
    risk: m.p >= 0.7 ? "conservador" : m.p >= 0.55 ? "medio" : "arriesgado",
    engineKey: "tachyon",
    engineName: "PitchLab Spacetime v5.1",
    marketGroup: m.group,
    selectionKey: m.selection,
    market: m.market,
    ...(typeof m.line === "number" ? { line: m.line } : {}),
    conflictGroup,
    label: m.label,
    rationale: `${m.group} · probabilidad calibrada ${(m.p * 100).toFixed(1)} %.`,
    p: m.p,
    fairDecimal: m.fairDecimal,
    fairAmerican: m.fairAmerican,
    marketDecimal: m.currentDecimal,
    marketAmerican: null,
    marketBookLabel: m.quoteBookLabel ?? null,
    marketCapturedAtUtc: m.quoteCapturedAtUtc ?? null,
    bookQuotes: m.bookQuotes,
    edgePts: m.edgePts,
    confidenceScore: game.confidenceScore,
    suggestedUnits: 1.0,
    result: null,
  };
}

export function buildFallbackCatalogPickItem(params: {
  readonly pick: MatchPick;
  readonly game: PlatformGame;
  readonly familyId: MarketFamilyId;
  readonly settlement: PickSettlementStatus;
  readonly houseDecimal: number | null;
  readonly houseLabel: string | null;
  readonly capturedAtUtc: string | null;
  readonly valuePct: number | null;
  readonly edgePts: number | null;
  readonly evidenceWindows: readonly EvidenceWindowItem[];
  readonly isLocked: boolean;
}): CatalogPickItem {
  const {
    pick,
    game,
    familyId,
    settlement,
    houseDecimal,
    houseLabel,
    capturedAtUtc,
    valuePct,
    edgePts,
    evidenceWindows,
    isLocked,
  } = params;
  const spec = MARKET_FAMILIES[familyId];
  const projectedScoreLabel = formatProjectedScore(game);
  const bullets = isLocked
    ? []
    : evidenceWindows.map((w) => ({
        label: w.detail ?? `${w.label} ${w.value}`,
        ratePct: w.ratePct ?? null,
        tone: w.tone === "info" ? ("neutral" as const) : w.tone,
      }));
  const rates = evidenceWindows
    .map((w) => w.ratePct)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const avgObservedRatePct =
    rates.length > 0 ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : null;

  return {
    id: pick.id,
    gameId: game.id,
    league: game.league,
    leagueLabel: game.leagueLabel,
    sport: game.sport,
    matchLabel: `${game.home.shortName} vs ${game.away.shortName}`,
    kickoffUtc: game.kickoffUtc,
    kickoffLocal: game.kickoffLocal,
    gameStatus: game.status,
    family: familyId,
    familyLabel: spec.label,
    category: spec.category,
    axis: spec.axis,
    selectionKey: pick.selectionKey,
    label: pick.label,
    line: pick.line ?? null,
    direction: inferCatalogDirection(pick),
    pricing: {
      p: isLocked ? 0 : pick.p,
      fairOdds: isLocked ? 0 : pick.fairDecimal,
      fairAmerican: isLocked ? 0 : pick.fairAmerican,
      marketDecimal: isLocked ? null : houseDecimal,
      marketAmerican: isLocked ? null : pick.marketAmerican,
      marketBookLabel: isLocked ? null : houseLabel,
      marketCapturedAtUtc: isLocked ? null : capturedAtUtc,
      deVigMarketProb: null,
      deVigMethod: "none",
      overroundPct: null,
      evPct: isLocked ? null : valuePct,
      edgePts: isLocked ? null : edgePts,
      noVigEdgePts: null,
      valueLabel:
        !isLocked && valuePct !== null && valuePct > 0
          ? `Valor +${valuePct.toFixed(1)} %`
          : null,
      hasPositiveValue: !isLocked && valuePct !== null && valuePct > 0,
    },
    evidence: {
      windows: [],
      xgSignal:
        !isLocked && game.projection
          ? {
              homeXg: game.projection.home,
              awayXg: game.projection.away,
              totalXg: game.projection.total,
              marginXg: game.projection.home - game.projection.away,
              source: "projection",
              summary: projectedScoreLabel ?? `Total ${game.projection.total.toFixed(2)}`,
            }
          : null,
      refereeSignal: null,
      bullets,
      avgObservedRatePct: isLocked ? null : avgObservedRatePct,
    },
    settlement,
    engineName: pick.engineName,
    isPrimaryModelPick: pick.category === "principal",
    isDerived: false,
    conflictGroup: pick.conflictGroup,
    playerMeta: null,
    bookQuotes: pick.bookQuotes,
    isDailyOpenPromo: pick.isDailyOpenPromo,
    isTipsterWeeklyOpen: pick.isTipsterWeeklyOpen,
    isRedacted: isLocked,
    projectedScoreLabel,
  };
}

export function inferLiveDirection(pick: MatchPick): "over" | "under" | "handicap" {
  const lower = normText(pick.label);
  if (lower.includes("menos de") || lower.includes("under")) return "under";
  if (pick.market?.includes("handicap") || pick.market?.includes("spread")) return "handicap";
  return "over";
}

export function inferLiveUnitLabel(liveProgress: LivePickProgressItem, sport: PlatformGame["sport"]): string {
  const ratio = liveProgress.progressRatioLabel ?? "";
  const parts = ratio.trim().split(/\s+/);
  const tail = parts[parts.length - 1];
  if (tail && !/^[+-]?\d/.test(tail) && tail !== "/") return tail;
  return sport === "football" ? "goles" : "pts";
}

export function estimateResidualProjection(
  actualValue: number,
  clockLabel: string,
  sport: PlatformGame["sport"],
): number | null {
  if (sport !== "football") return null;
  const match = /(\d{1,3})/.exec(clockLabel);
  if (!match?.[1]) return null;
  const minute = parseStrictFiniteNumber(match[1]);
  if (minute === null || minute < 10 || minute >= 90) return null;
  const rate = actualValue / minute;
  const projected = actualValue + rate * (90 - minute) * 0.85;
  return Math.round(projected * 10) / 10;
}

export function resolveLiveStatusPill(params: {
  readonly tracked?: LiveTrackedPickView | null;
  readonly liveProgress?: LivePickProgressItem | null;
  readonly direction: "over" | "under" | "handicap";
}): { readonly label: string; readonly tone: "pos" | "warn" | "neg" | "brand" } {
  const { tracked, liveProgress, direction } = params;
  if (tracked) {
    if (tracked.asianState === "lost_full") return { label: "Fallado", tone: "neg" };
    if (tracked.asianState === "lost_half") return { label: "En riesgo", tone: "warn" };
    if (tracked.hitLocked || tracked.asianState === "won_full") {
      return { label: "Ya cumplido", tone: "pos" };
    }
    if (direction === "under" && tracked.actualValue > tracked.targetLine) {
      return { label: "Fallado", tone: "neg" };
    }
    if (direction === "over" && tracked.actualValue > tracked.targetLine) {
      return { label: "Ya cumplido", tone: "pos" };
    }
    if (direction === "under" && tracked.projectedFinal > tracked.targetLine) {
      return { label: "En riesgo", tone: "warn" };
    }
    if (direction === "over") {
      const remaining = Math.max(0, Math.floor(tracked.targetLine) + 1 - tracked.actualValue);
      if (remaining > 0) {
        return {
          label: remaining === 1 ? "Falta 1" : `Faltan ${remaining}`,
          tone: tracked.projectedFinal > tracked.targetLine ? "brand" : "warn",
        };
      }
    }
    return { label: "Cumpliéndose", tone: "pos" };
  }

  if (liveProgress) {
    if (liveProgress.lineReached) return { label: "Ya cumplido", tone: "pos" };
    if (liveProgress.statusText.toLowerCase().includes("superada")) {
      return { label: "Fallado", tone: "neg" };
    }
    if (liveProgress.statusText.startsWith("Falta")) {
      return { label: liveProgress.statusText, tone: "brand" };
    }
    if (liveProgress.tone === "warning") return { label: "En riesgo", tone: "warn" };
    if (liveProgress.tone === "success") return { label: "Cumpliéndose", tone: "pos" };
    return { label: "Cumpliéndose", tone: "brand" };
  }

  return { label: "En vivo", tone: "brand" };
}
