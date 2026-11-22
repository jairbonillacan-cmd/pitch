"use client";

import React, {
  memo,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  canonicalGameHref,
  isLivePhaseActive,
  parseStrictFiniteNumber,
  type LiveScoreboardEntry,
} from "@pitchlab/contracts";
import {
  Button,
  SofascoreCard,
  SofascoreEmptyState,
  SofascoreKpiStrip,
  type SofascoreKpiItem,
} from "../../components/ui/primitives";
import { LeagueBadge, TeamBadge } from "../../sports";
import { formatOddsValue, isPickUnlocked } from "../access-guard";
import {
  LivePickProgressBar,
  type LiveAsianPickState,
  type LivePickLineupAlert,
} from "../atomic";
import {
  normalizeBookKey,
  parseManualOddsInput,
  resolvePreferredBookQuote,
} from "../bookmakers";
import { MaestroIcon } from "../components/MaestroPrimitives";
import { AtmosphereStage, ClubWorkspaceShell } from "../components/ShellChrome";
import { useSheetSwipeDismiss } from "../components/use-sheet-swipe-dismiss";
import {
  useAbortableJson,
  useDebouncedValue,
  useMediaQuery,
  useSafeEffect,
  useVisibilityPolling,
} from "../hooks";
import {
  computeLivePickProgress,
  type LivePickProgressItem,
} from "../live/live-pick-progress";
import { liveMatchStore, useLiveScoreboard } from "../live/live-store";
import {
  MARKET_FAMILIES,
  MARKET_FAMILY_IDS,
  catalogCategoryToLegacyFilter,
  catalogEvidenceToWindowItems,
  catalogPickItemToMatchPick,
  gradeCatalogPick,
  scoreRecommendedCatalogPick,
  selectPicksOfTheDay,
  type CatalogPickItem,
  type MarketFamilyId,
  type MatchPicksCatalog,
  type PickDirection,
  type PickLabResponsePayload,
  type PickSettlementStatus,
  type PlayerPropMeta,
  type ScreenerApiResponse,
} from "../picks-catalog";
import {
  useIsPickInParlay,
  useJournalEntries,
  usePlatformActions,
  usePlatformCore,
} from "../platform-provider";
import {
  MAX_SAVED_SCREENER_VIEWS,
  sliderStepToOdds,
  smoothOddsWeight,
  type SavedScreenerView,
  type ScreenerBandFilter,
  type ScreenerKindFilter,
  type ScreenerSortKey,
  type ScreenerSportFilter,
  type ScreenerWindowFilter,
} from "../screener-views";
import type {
  JournalEntry,
  MatchPick,
  OddsFormat,
  PlatformGame,
  PlatformMarketRow,
} from "../types";
import { addDays, matchesSportFilter, todayId } from "./home/home-model";
import {
  BetBuilderDrawer,
  BetBuilderQuickButton,
  EvidenceWindowPills,
  NonLinearOddsSlider,
  SavedViewsBar,
  classifyOddsMovement,
  computeExpectedValuePct,
  extractEvidenceWindows,
  type EvidenceWindowItem,
  type EvidenceWindowTone,
  type OddsMovementInfo,
} from "./picks";
import {
  PickEvidenceLabDrawer,
  type PickLabCustomSelection,
} from "./picks/PickEvidenceLabDrawer";
import { PersonAvatar } from "./team/PersonAvatar";

type Band = ScreenerBandFilter;
type GroupMode = "match" | "market" | "flat";
type TimingMode = "upcoming" | "live" | "settled";
type PickTypeFilter = "all" | "team_match" | "player";
type DirectionFilter = "all" | "over" | "under" | "side" | "yes_no";
type ScreenerSortExtended =
  | "recomendados"
  | "ev"
  | "p"
  | "movimiento"
  | "hora"
  | "relevancia"
  | "momio";
type PeriodFilter = "all" | "ft" | "1h" | "2h" | "f5";
type PositionFilter =
  | "all"
  | "home"
  | "away"
  | "total"
  | "fwd"
  | "mid"
  | "def_gk"
  | "guard"
  | "frontcourt";
type LegacyFamilyGroup =
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
type MarketFamilyFilter = LegacyFamilyGroup | MarketFamilyId;

interface LiveTrackedLegView {
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

interface LiveTrackedPickView {
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

interface ParsedLiveTrackedPayload {
  readonly nextPollSeconds: number | null;
  readonly items: readonly LiveTrackedPickView[];
}

const SPORT_OPTIONS: ReadonlyArray<{ id: ScreenerSportFilter; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "futbol", label: "Fútbol" },
  { id: "nba", label: "NBA" },
  { id: "mlb", label: "MLB" },
  { id: "nhl", label: "NHL" },
  { id: "nfl", label: "NFL" },
];

const WINDOW_OPTIONS: ReadonlyArray<{ id: ScreenerWindowFilter; label: string }> = [
  { id: "all", label: "Toda la agenda" },
  { id: "today", label: "Hoy" },
  { id: "next48h", label: "Próx. 48 h" },
];

const PICK_TYPE_OPTIONS: ReadonlyArray<{ id: PickTypeFilter; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "team_match", label: "Equipo y partido" },
  { id: "player", label: "Props de jugador" },
];

const DIRECTION_OPTIONS: ReadonlyArray<{ id: DirectionFilter; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "over", label: "Más de (Over)" },
  { id: "under", label: "Menos de (Under)" },
  { id: "side", label: "Resultado / Hándicap / Combo" },
  { id: "yes_no", label: "Sí / No" },
];

const BANDS: ReadonlyArray<{ id: Band; label: string; hint: string }> = [
  { id: "all", label: "Todas", hint: "" },
  { id: "alta", label: "≥ 70 %", hint: "Probabilidad Spacetime 70 % o más" },
  { id: "media", label: "55–69 %", hint: "Probabilidad Spacetime 55 a 69 %" },
  { id: "baja", label: "< 55 %", hint: "Probabilidad Spacetime menor a 55 %" },
];

const PERIOD_OPTIONS: ReadonlyArray<{ id: PeriodFilter; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "ft", label: "Partido completo" },
  { id: "1h", label: "1.ª mitad (1T)" },
  { id: "2h", label: "2.ª mitad (2T)" },
  { id: "f5", label: "5 entradas (MLB F5)" },
];

const POSITION_OPTIONS: ReadonlyArray<{ id: PositionFilter; label: string }> = [
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

const MARKET_FAMILY_GROUPS: ReadonlyArray<{ id: LegacyFamilyGroup; label: string }> = [
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

const MARKET_FAMILY_SHORT_LABELS: Readonly<Record<Exclude<LegacyFamilyGroup, "all">, string>> = {
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

const QUICK_BOOKS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "pinnacle", label: "Pinnacle" },
  { id: "bet365", label: "Bet365" },
  { id: "codere", label: "Codere" },
  { id: "betcris", label: "Betcris" },
  { id: "novibet", label: "Novibet" },
  { id: "draftkings", label: "DraftKings" },
  { id: "fanduel", label: "FanDuel" },
];

const GROUP_MODES: ReadonlyArray<{ id: GroupMode; label: string; shortLabel: string }> = [
  { id: "match", label: "Por partido", shortLabel: "Partidos" },
  { id: "market", label: "Por mercado", shortLabel: "Mercados" },
  { id: "flat", label: "Lista plana", shortLabel: "Lista plana" },
];

const SORT_OPTIONS: ReadonlyArray<{ id: ScreenerSortExtended; label: string }> = [
  { id: "recomendados", label: "Recomendados" },
  { id: "ev", label: "Valor real EV+" },
  { id: "p", label: "Probabilidad Spacetime" },
  { id: "movimiento", label: "Movimiento de línea" },
  { id: "hora", label: "Próximo inicio" },
  { id: "relevancia", label: "Balance prob. y momio" },
  { id: "momio", label: "Mayor momio" },
];

const EXTENDED_SYNTH_MARKETS = new Set([
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

const CATALOG_FAMILY_ID_SET: ReadonlySet<string> = new Set(MARKET_FAMILY_IDS);
const LEGACY_FAMILY_GROUP_SET: ReadonlySet<string> = new Set(
  MARKET_FAMILY_GROUPS.map((item) => item.id),
);
const INITIAL_GAMES_SHOWN = 4;
const GAMES_PAGE_STEP = 6;
const PER_MATCH_INITIAL_PICKS = 5;
const PER_MATCH_LOAD_STEP = 6;
const INITIAL_FLAT_PICKS = 18;
const FLAT_PICKS_STEP = 20;
const TRIVIAL_ODDS_FLOOR = 1.25;
const DEFAULT_LIVE_TRACKER_POLL_MS = 30_000;

function subscribePageVisibility(onStoreChange: () => void): () => void {
  if (typeof document === "undefined") return () => undefined;
  document.addEventListener("visibilitychange", onStoreChange);
  return () => document.removeEventListener("visibilitychange", onStoreChange);
}

function getPageVisibilitySnapshot(): boolean {
  return typeof document === "undefined" ? true : document.visibilityState === "visible";
}

function getServerVisibilitySnapshot(): boolean {
  return true;
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

function parseLiveTrackedPicksPayload(raw: unknown): ParsedLiveTrackedPayload | null {
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

function safeParseTimestamp(iso: string): number {
  const ts = Date.parse(iso);
  return Number.isFinite(ts) ? ts : 0;
}

function normText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function parseSportFilter(raw: string): ScreenerSportFilter {
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

function parseWindowFilter(raw: string): ScreenerWindowFilter {
  if (raw === "today" || raw === "next48h") return raw;
  return "all";
}

function parsePeriodFilter(raw: string): PeriodFilter {
  if (raw === "ft" || raw === "1h" || raw === "2h" || raw === "f5") return raw;
  return "all";
}

function parsePositionFilter(raw: string): PositionFilter {
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

function parsePickTypeFilter(raw: string): PickTypeFilter {
  if (raw === "team_match" || raw === "player") return raw;
  return "all";
}

function parseDirectionFilter(raw: string): DirectionFilter {
  if (raw === "over" || raw === "under" || raw === "side" || raw === "yes_no") return raw;
  return "all";
}

function parseSortExtended(raw: string): ScreenerSortExtended {
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

function isCatalogFamilyId(raw: string): raw is MarketFamilyId {
  return CATALOG_FAMILY_ID_SET.has(raw);
}

function parseFamilyFilter(raw: string): MarketFamilyFilter {
  if (isCatalogFamilyId(raw)) return raw;
  if (LEGACY_FAMILY_GROUP_SET.has(raw)) {
    for (const option of MARKET_FAMILY_GROUPS) {
      if (option.id === raw) return option.id;
    }
  }
  return "all";
}

function defaultFamilyForSport(sport: PlatformGame["sport"]): MarketFamilyId {
  if (sport === "basketball") return "nba_moneyline";
  if (sport === "baseball") return "mlb_moneyline";
  if (sport === "ice-hockey") return "nhl_moneyline";
  if (sport === "american-football") return "nfl_moneyline";
  return "1x2";
}

function resolveMarketFamilyIdFromRaw(
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

function primaryFamilyOf(
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

function matchesMarketFamily(
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

function resolvePickPeriod(
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

function periodShortTag(period: Exclude<PeriodFilter, "all">): string | null {
  if (period === "1h") return "1T";
  if (period === "2h") return "2T";
  if (period === "f5") return "F5";
  return null;
}

function inferCatalogDirection(pick: MatchPick): PickDirection {
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

function directionToFilterBucket(direction: PickDirection): Exclude<DirectionFilter, "all"> {
  if (direction === "over") return "over";
  if (direction === "under") return "under";
  if (direction === "yes" || direction === "no") return "yes_no";
  return "side";
}

function resolvePlayerPositionBucket(
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

function resolveSideBucket(
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

function formatProjectedScore(game: PlatformGame): string | null {
  if (!game.projection) return null;
  const h = game.projection.home;
  const a = game.projection.away;
  if (!Number.isFinite(h) || !Number.isFinite(a)) return null;
  if (game.sport === "football") {
    return `Proy. ${h.toFixed(1)}–${a.toFixed(1)}`;
  }
  return `Proy. ${Math.round(h)}–${Math.round(a)}`;
}

function toSavedKind(filter: MarketFamilyFilter): ScreenerKindFilter {
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

function toSavedSort(sort: ScreenerSortExtended): ScreenerSortKey {
  if (sort === "ev" || sort === "movimiento") return "ventaja";
  if (sort === "recomendados") return "relevancia";
  return sort;
}

function bandOf(p: number): Exclude<Band, "all"> {
  return p >= 0.7 ? "alta" : p >= 0.55 ? "media" : "baja";
}

function buildCompactEvidenceBullets(
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
      if (out.length >= 5) return out;
    }
  }

  if (catalogBullets && out.length < 4) {
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
      if (out.length >= 5) break;
    }
  }

  return out;
}

function resolveSettlementStatus(
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

function settlementLabel(status: PickSettlementStatus): string {
  if (status === "hit") return "Ganado";
  if (status === "miss") return "Perdido";
  if (status === "push") return "Push";
  return "Pendiente";
}

function marketRowToScreenerPick(game: PlatformGame, m: PlatformMarketRow, idx: number): MatchPick {
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

function buildFallbackCatalogPickItem(params: {
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

interface ScreenerItem {
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
  readonly evidenceWindows: readonly EvidenceWindowItem[];
  readonly searchHaystack: string;
}

function inferLiveDirection(pick: MatchPick): "over" | "under" | "handicap" {
  const lower = normText(pick.label);
  if (lower.includes("menos de") || lower.includes("under")) return "under";
  if (pick.market?.includes("handicap") || pick.market?.includes("spread")) return "handicap";
  return "over";
}

function inferLiveUnitLabel(liveProgress: LivePickProgressItem, sport: PlatformGame["sport"]): string {
  const ratio = liveProgress.progressRatioLabel ?? "";
  const parts = ratio.trim().split(/\s+/);
  const tail = parts[parts.length - 1];
  if (tail && !/^[+-]?\d/.test(tail) && tail !== "/") return tail;
  return sport === "football" ? "goles" : "pts";
}

function estimateResidualProjection(
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

function resolveLiveStatusPill(params: {
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

function ParlayRowButton({
  pick,
  compact = false,
}: {
  readonly pick: MatchPick;
  readonly compact?: boolean;
}): React.JSX.Element {
  const { addPickToParlay, removePickFromParlay } = usePlatformActions();
  const on = useIsPickInParlay(pick.id);
  return (
    <button
      type="button"
      className={`pl-scr-row-action ${on ? "is-on" : ""} ${compact ? "is-compact" : ""}`.trim()}
      aria-pressed={on}
      aria-label={`${on ? "Quitar del parlay" : "Agregar al parlay"}: ${pick.label}, ${pick.matchLabel}`}
      onClick={(e) => {
        e.stopPropagation();
        if (on) removePickFromParlay(pick.id);
        else addPickToParlay(pick);
      }}
    >
      <MaestroIcon name={on ? "check" : "plus"} size={12} />
      <span>{on ? "En parlay" : "Parlay"}</span>
    </button>
  );
}

interface ScreenerPickRowProps {
  readonly item: ScreenerItem;
  readonly timing: TimingMode;
  readonly showMatchMeta: boolean;
  readonly unlocked: boolean;
  readonly oddsFormat: OddsFormat;
  readonly manualRaw: string;
  readonly isManualOpen: boolean;
  readonly trackedLive: LiveTrackedPickView | null;
  readonly onOpenLab: (item: ScreenerItem) => void;
  readonly onOpenBuilder: (pick: MatchPick, game: PlatformGame) => void;
  readonly onOpenComposer: (pick: MatchPick) => void;
  readonly onOpenManual: (pickId: string) => void;
  readonly onManualChange: (pickId: string, value: string) => void;
}

const ScreenerPickRow = memo(function ScreenerPickRow({
  item,
  timing,
  showMatchMeta,
  unlocked,
  oddsFormat,
  manualRaw,
  isManualOpen,
  trackedLive,
  onOpenLab,
  onOpenBuilder,
  onOpenComposer,
  onOpenManual,
  onManualChange,
}: ScreenerPickRowProps): React.JSX.Element {
  const { game, pick, playerMeta, liveProgress } = item;
  const periodTag = periodShortTag(item.period);
  const manualDec = parseManualOddsInput(manualRaw);
  const effectiveHouseDec = manualDec ?? item.houseDecimal;
  const effectiveHouseLabel = manualDec !== null ? "Tu momio" : item.houseLabel;
  const effectiveValuePct =
    manualDec !== null ? computeExpectedValuePct(pick.p, manualDec) : item.valuePct;
  const effectiveMovement = manualDec !== null ? null : (item.movement ?? null);
  const oddsDisplay =
    effectiveHouseDec !== null
      ? formatOddsValue(effectiveHouseDec, oddsFormat)
      : formatOddsValue(pick.fairDecimal, oddsFormat);

  const timeOrClock =
    item.isSettled && game.score
      ? `FT ${game.score.home}–${game.score.away}`
      : trackedLive
        ? trackedLive.clockLabel
        : liveProgress
          ? `${liveProgress.scoreLabel} · ${liveProgress.clockLabel}`
          : `${game.dayLabel} ${game.kickoffLocal}`;

  const sideTeam = item.sideBucket === "away" ? game.away : game.home;
  const isPlayerPick = Boolean(playerMeta);
  const isSideTeamPick = !isPlayerPick && (item.sideBucket === "home" || item.sideBucket === "away");
  const playerTeam = playerMeta?.teamSide === "away" ? game.away : game.home;
  const entityTitle = isPlayerPick
    ? playerMeta!.playerName
    : isSideTeamPick
      ? sideTeam.name
      : `${game.home.shortName} vs ${game.away.shortName}`;

  const liveDirection =
    trackedLive?.direction ?? (liveProgress?.asianState ? "handicap" : inferLiveDirection(pick));
  const liveStatus = item.isLiveGame
    ? resolveLiveStatusPill({ tracked: trackedLive, liveProgress, direction: liveDirection })
    : null;
  const normalizedPickLabel = normText(pick.label);
  const isBttsYes =
    normalizedPickLabel.includes("ambos anotan") && !normalizedPickLabel.includes("no");
  const rawLiveActual = liveProgress?.rawActual ?? liveProgress?.currentValue ?? null;
  const rawLiveTarget =
    typeof pick.line === "number" && Number.isFinite(pick.line)
      ? pick.line
      : (liveProgress?.rawLine ?? (isBttsYes ? 1.5 : (liveProgress?.targetValue ?? null)));
  const hasNumericLiveBar =
    unlocked &&
    item.isLiveGame &&
    (Boolean(trackedLive) ||
      (rawLiveActual !== null &&
        rawLiveTarget !== null &&
        (liveDirection === "handicap" || rawLiveTarget > 0)));

  const liveActual = trackedLive?.actualValue ?? rawLiveActual ?? 0;
  const liveTarget = trackedLive?.targetLine ?? rawLiveTarget ?? 1;
  const liveClock =
    trackedLive?.clockLabel ??
    (liveProgress ? `${liveProgress.scoreLabel} · ${liveProgress.clockLabel}` : "En vivo");
  const liveUnit =
    trackedLive?.unitLabel ??
    (liveProgress ? inferLiveUnitLabel(liveProgress, game.sport) : "goles");
  const liveProjected =
    trackedLive?.projectedFinal ??
    (liveProgress && liveDirection !== "handicap" && !isBttsYes
      ? estimateResidualProjection(liveActual, liveProgress.clockLabel, game.sport)
      : null);

  const handleRowClick = (event: React.MouseEvent<HTMLTableRowElement>) => {
    if (!unlocked) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("button, a, input, select, label")) return;
    onOpenLab(item);
  };

  return (
    <tr
      className={`pl-scr-row ${unlocked ? "is-clickable" : ""}`.trim()}
      data-picks-row=""
      data-pick-id={pick.id}
      data-pick-recommended={item.isRecommended ? "true" : "false"}
      onClick={handleRowClick}
    >
      <th scope="row" className="pl-scr-td pl-scr-col-pick" data-label="Pick">
        <div className="pl-scr-entity">
          <div className="pl-scr-entity-media">
            {isPlayerPick ? (
              <PersonAvatar photoKey={playerMeta!.photoKey ?? null} size={34} />
            ) : isSideTeamPick ? (
              <TeamBadge
                league={game.league}
                slug={sideTeam.slug}
                name={sideTeam.name}
                logoUrl={sideTeam.logoUrl}
                size={30}
              />
            ) : (
              <span className="pl-scr-dual-badges" aria-hidden="true">
                <TeamBadge
                  league={game.league}
                  slug={game.home.slug}
                  name={game.home.name}
                  logoUrl={game.home.logoUrl}
                  size={22}
                />
                <TeamBadge
                  league={game.league}
                  slug={game.away.slug}
                  name={game.away.name}
                  logoUrl={game.away.logoUrl}
                  size={22}
                />
              </span>
            )}
          </div>

          <div className="pl-scr-entity-copy">
            <strong className="pl-scr-entity-name">{entityTitle}</strong>
            <span className="pl-scr-entity-meta">
              {isPlayerPick ? (
                <>
                  <TeamBadge
                    league={game.league}
                    slug={playerMeta!.teamSlug ?? playerTeam.slug}
                    name={playerMeta!.teamName}
                    logoUrl={playerTeam.logoUrl}
                    size={13}
                  />
                  <span>{playerMeta!.teamName}</span>
                </>
              ) : (
                <span>{game.leagueLabel}</span>
              )}
              <span className="pl-scr-meta-sep" aria-hidden="true">
                ·
              </span>
              <span className="num">{timeOrClock}</span>
            </span>
            {isPlayerPick && playerMeta!.position ? (
              <span className="pl-scr-entity-pos">{playerMeta!.position}</span>
            ) : showMatchMeta && isSideTeamPick ? (
              <span className="pl-scr-entity-pos">
                {game.home.shortName} vs {game.away.shortName}
              </span>
            ) : null}
          </div>
        </div>
      </th>

      <td
        className="pl-scr-td pl-scr-col-bet"
        data-label="Apuesta"
        data-screener-pick={pick.id}
        data-market-family={item.catalogFamilyId}
      >
        <div className="pl-scr-bet-cell">
          {unlocked ? (
            <button
              type="button"
              className="pl-scr-pick-open-btn"
              aria-label={`Analizar ${pick.label} (${game.home.shortName} vs ${game.away.shortName}) en Bet Lab`}
              onClick={() => onOpenLab(item)}
            >
              <MaestroIcon name="chart" size={13} className="pl-scr-bet-icon" />
              <span className="pl-scr-pick-title">{pick.label}</span>
            </button>
          ) : (
            <div className="pl-scr-bet-main">
              <MaestroIcon name="chart" size={13} className="pl-scr-bet-icon" />
              <strong className="pl-scr-pick-title locked-redact">
                Pick reservado Pase PitchLab Ultra
              </strong>
            </div>
          )}
          <div className="pl-scr-bet-sub">
            <span>
              {game.home.shortName} vs {game.away.shortName}
            </span>
            {periodTag ? <span className="pl-scr-period-tag">{periodTag}</span> : null}
            <span className="pl-scr-cat-tag">{pick.categoryLabel}</span>
          </div>
        </div>
      </td>

      <td className="pl-scr-td pl-scr-col-evidence" data-label="Evidencia">
        {!unlocked ? (
          <span className="pl-scr-ev-fallback">Evidencia disponible con Pase PitchLab Ultra</span>
        ) : item.isLiveGame ? (
          <div className="pl-scr-live-cell" data-picks-live-progress="" data-live-progress-bar="">
            {hasNumericLiveBar ? (
              <LivePickProgressBar
                pickLabel={pick.label}
                matchLabel={`${game.home.shortName} vs ${game.away.shortName}`}
                clockLabel={liveClock}
                actualValue={liveActual}
                targetLine={liveTarget}
                unitLabel={liveUnit}
                direction={liveDirection}
                projectedFinal={liveProjected}
                asianState={trackedLive?.asianState ?? liveProgress?.asianState ?? null}
                starterAlert={trackedLive?.starterAlert ?? null}
                starterAlertDetail={trackedLive?.starterAlertDetail ?? null}
                compact
              />
            ) : (
              <div className="pl-scr-live-fallback num">
                <span className="pl-scr-live-badge">{liveClock}</span>
                <span>{liveProgress?.statusText ?? "Seguimiento en vivo"}</span>
              </div>
            )}
            {liveStatus ? (
              <span className={`pl-scr-live-status-pill is-${liveStatus.tone}`}>
                {liveStatus.label}
              </span>
            ) : null}
          </div>
        ) : item.evidenceWindows.length > 0 ? (
          <EvidenceWindowPills
            windows={item.evidenceWindows}
            layout="bullets"
            ariaLabel={`Evidencia histórica observada para ${pick.label}`}
          />
        ) : (
          <span className="pl-scr-ev-fallback">
            {pick.rationale ? pick.rationale.slice(0, 76) : "Modelo calibrado Spacetime v5.1"}
          </span>
        )}
      </td>

      <td
        className="pl-scr-td pl-scr-col-odds"
        data-label={timing === "settled" ? "Liquidación" : "Cuotas"}
      >
        <div className="pl-scr-odds-cell">
          {unlocked && !item.isSettled && item.convergenceCount > 0 ? (
            <span
              className="pl-scr-conv-badge num"
              data-picks-convergence={item.convergenceCount}
              title={`${item.convergenceCount} ventanas históricas alineadas (≥ 65 %)`}
            >
              <span>{item.convergenceCount}</span>
              <MaestroIcon name="flame" size={11} />
            </span>
          ) : null}

          {item.isSettled ? (
            <div className="pl-scr-settlement-cell num">
              <span
                className={`pl-scr-settlement-badge is-${item.settlement}`}
                data-settlement={item.settlement}
              >
                {settlementLabel(item.settlement)}
              </span>
              {game.score ? (
                <span className="pl-scr-settlement-score">
                  {game.score.home}–{game.score.away} · FT
                </span>
              ) : null}
              {unlocked ? (
                <span className="pl-scr-spacetime-line">
                  Prob {(pick.p * 100).toFixed(1)} % · Justo{" "}
                  {formatOddsValue(pick.fairDecimal, oddsFormat)}
                </span>
              ) : null}
            </div>
          ) : !unlocked ? (
            <span className="pl-scr-locked-tag">
              <MaestroIcon name="lock" size={12} />
              <span>Ultra</span>
            </span>
          ) : (
            <>
              <div className="pl-scr-odds-pill-wrap num">
                <div
                  className={`pl-scr-odds-pill ${effectiveValuePct !== null && effectiveValuePct > 0 ? "is-ev-pos" : ""}`.trim()}
                  data-bookmaker-compare="compact"
                >
                  <strong className="pl-scr-odds-val">{oddsDisplay}</strong>
                  <span className="pl-scr-odds-book">
                    {effectiveHouseLabel ?? "Justo"}
                  </span>
                  {effectiveMovement && effectiveMovement.kind !== "stable" ? (
                    <span
                      className={`pl-scr-move-dot is-${effectiveMovement.kind}`}
                      title={`Movimiento de línea: ${effectiveMovement.label}`}
                    >
                      {effectiveMovement.arrow}
                    </span>
                  ) : null}
                </div>

                <div className="pl-scr-odds-sub">
                  {effectiveValuePct !== null && effectiveValuePct > 0 ? (
                    <span
                      className="pl-scr-ev-tag"
                      data-ev-positive="true"
                      title="Valor esperado positivo calculado con probabilidad calibrada Spacetime"
                    >
                      +{effectiveValuePct.toFixed(1)} % EV+
                    </span>
                  ) : null}
                  <span className="pl-scr-spacetime-line">
                    Spacetime {(pick.p * 100).toFixed(1)} % · Justo{" "}
                    {formatOddsValue(pick.fairDecimal, oddsFormat)}
                  </span>
                </div>
              </div>

              <div className="pl-scr-row-actions">
                {!item.isLiveGame ? <ParlayRowButton pick={pick} compact /> : null}
                {!item.isLiveGame ? (
                  <button
                    type="button"
                    className="pl-scr-row-action is-compact"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenComposer(pick);
                    }}
                  >
                    Sellar
                  </button>
                ) : null}
                {isManualOpen ? (
                  <label
                    className="pl-scr-manual-wrap"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="sr-only">Tu momio para {pick.label}</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      enterKeyHint="done"
                      autoComplete="off"
                      placeholder={oddsFormat === "american" ? "-110" : "1.91"}
                      value={manualRaw}
                      onChange={(e) => onManualChange(pick.id, e.target.value)}
                      data-manual-odds-input={pick.id}
                      className="pl-scr-manual-input num"
                    />
                  </label>
                ) : (
                  <button
                    type="button"
                    className="pl-scr-row-action is-compact is-ghost"
                    data-open-manual-odds={pick.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenManual(pick.id);
                    }}
                  >
                    Mi momio
                  </button>
                )}
                <span className="pl-scr-builder-inline">
                  <BetBuilderQuickButton
                    pick={pick}
                    onInspect={(pk) => onOpenBuilder(pk, game)}
                    compact
                  />
                </span>
              </div>
            </>
          )}
        </div>
      </td>
    </tr>
  );
});

function MobileFiltersSheet({
  resultCount,
  onReset,
  onClose,
  children,
}: {
  readonly resultCount: number;
  readonly onReset: () => void;
  readonly onClose: () => void;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const swipe = useSheetSwipeDismiss({
    onDismiss: () => onCloseRef.current(),
    scrollContainerRef: scrollRef,
  });

  useSafeEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    dialog.setAttribute("closedby", "any");

    const closeDialogSafely = () => {
      if (typeof dialog.close === "function" && dialog.open) {
        try {
          dialog.returnValue = "";
          dialog.close();
          return;
        } catch (err) {
          void err;
        }
      }
      if (dialog.hasAttribute("open")) {
        dialog.removeAttribute("open");
      }
    };

    if (!dialog.open) {
      if (typeof dialog.showModal === "function") {
        try {
          dialog.showModal();
        } catch (err) {
          void err;
          dialog.setAttribute("open", "");
        }
      } else if (typeof dialog.show === "function") {
        try {
          dialog.show();
        } catch (err) {
          void err;
          dialog.setAttribute("open", "");
        }
      } else {
        dialog.setAttribute("open", "");
      }
    }

    const handleCancel = (event: Event) => {
      event.preventDefault();
      onCloseRef.current();
    };

    const handleClose = () => {
      if (dialog.open) return;
      dialog.returnValue = "";
      onCloseRef.current();
    };
    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("close", handleClose);

    const handleEscape = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.key !== "Escape") return;
      if (!dialog.open && !dialog.hasAttribute("open")) return;
      e.preventDefault();
      onCloseRef.current();
    };
    window.addEventListener("keydown", handleEscape);

    let cleanupLightDismiss: (() => void) | undefined;
    if (
      typeof HTMLDialogElement !== "undefined" &&
      !("closedBy" in HTMLDialogElement.prototype)
    ) {
      const isOutside = (e: PointerEvent) => {
        if (e.target !== dialog) return false;
        const r = dialog.getBoundingClientRect();
        return (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        );
      };
      let pressedOutside = false;
      const onPointerDown = (e: PointerEvent) => {
        pressedOutside = isOutside(e);
      };
      const onPointerUp = (e: PointerEvent) => {
        if (pressedOutside && isOutside(e)) {
          if (typeof dialog.close === "function" && dialog.open) {
            try {
              dialog.close();
              return;
            } catch (err) {
              void err;
            }
          }
          dialog.removeAttribute("open");
          onCloseRef.current();
        }
      };
      dialog.addEventListener("pointerdown", onPointerDown);
      dialog.addEventListener("pointerup", onPointerUp);
      cleanupLightDismiss = () => {
        dialog.removeEventListener("pointerdown", onPointerDown);
        dialog.removeEventListener("pointerup", onPointerUp);
      };
    }

    return () => {
      window.removeEventListener("keydown", handleEscape);
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("close", handleClose);
      cleanupLightDismiss?.();
      closeDialogSafely();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="pl-scr-filter-sheet"
      data-mobile-filters-sheet=""
      style={swipe.sheetStyle}
    >
      <div className="pl-scr-sheet-shell">
        <div className="pl-scr-sheet-drag" {...swipe.handleProps}>
          <span className="pl-bottom-sheet-handle" aria-hidden="true" />
          <div className="pl-scr-sheet-head">
            <h2 id={titleId} className="m-0 text-base font-extrabold">
              Filtros del buscador
            </h2>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label="Cerrar filtros"
              autoFocus
              onClick={onClose}
            >
              <MaestroIcon name="x" size={16} />
            </Button>
          </div>
        </div>

        <div ref={scrollRef} className="pl-scr-sheet-scroll">
          {children}
        </div>

        <footer className="pl-scr-sheet-footer">
          <Button type="button" variant="secondary" size="default" onClick={onReset}>
            Restablecer
          </Button>
          <Button
            type="button"
            variant="primary"
            size="default"
            className="flex-1 num"
            onClick={onClose}
          >
            Ver {resultCount} {resultCount === 1 ? "pick" : "picks"}
          </Button>
        </footer>
      </div>
    </dialog>
  );
}

export interface PicksFinderClubViewProps {
  readonly initialCatalogs?: Readonly<Record<string, MatchPicksCatalog>> | null;
  readonly initialPicksOfTheDay?: readonly CatalogPickItem[] | null;
}

export function PicksFinderClubView({
  initialCatalogs = null,
  initialPicksOfTheDay = null,
}: PicksFinderClubViewProps = {}): React.JSX.Element {
  const {
    dataset,
    viewerRole,
    hasAccountSessionAuth,
    oddsFormat,
    preferredBooks,
    userTimezone,
    savedScreenerViews,
  } = usePlatformCore();
  const {
    setSavedScreenerViews,
    setPreferredBooks,
    pushToast,
    openComposer,
    addPickToParlay,
    navigateTo,
    prefetchRoute,
    requestFullShell,
  } = usePlatformActions();
  const journalEntries = useJournalEntries();
  const journalCount = journalEntries.length;
  const isDesktopViewport = useMediaQuery("(min-width: 1024px)", false);
  const tabsUid = useId();
  const tabPanelId = `${tabsUid}-panel`;
  const tabButtonRefs = useRef<Record<TimingMode, HTMLButtonElement | null>>({
    upcoming: null,
    live: null,
    settled: null,
  });

  useSafeEffect(() => {
    void requestFullShell();
  }, [requestFullShell]);

  const isPageVisible = useSyncExternalStore(
    subscribePageVisibility,
    getPageVisibilitySnapshot,
    getServerVisibilitySnapshot,
  );

  const [timing, setTiming] = useState<TimingMode>("upcoming");
  const [groupMode, setGroupMode] = useState<GroupMode>("match");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sport, setSport] = useState<ScreenerSportFilter>("all");
  const [league, setLeague] = useState<string>("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [windowFilter, setWindowFilter] = useState<ScreenerWindowFilter>("all");
  const [band, setBand] = useState<Band>("all");
  const [family, setFamily] = useState<MarketFamilyFilter>("all");
  const [pickTypeFilter, setPickTypeFilter] = useState<PickTypeFilter>("all");
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>("all");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [positionFilter, setPositionFilter] = useState<PositionFilter>("all");
  const [onlyRecommended, setOnlyRecommended] = useState<boolean>(true);
  const [includeTrivialOdds, setIncludeTrivialOdds] = useState<boolean>(false);
  const [onlyPositiveEdge, setOnlyPositiveEdge] = useState<boolean>(false);
  const [sort, setSort] = useState<ScreenerSortExtended>("recomendados");
  const [minOddsStep, setMinOddsStep] = useState<number>(0);
  const [maxOddsStep, setMaxOddsStep] = useState<number>(100);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(() => new Set());
  const [mobileSheetOpen, setMobileSheetOpen] = useState<boolean>(false);
  const [potdExpanded, setPotdExpanded] = useState<boolean>(false);
  const [visibleGamesCount, setVisibleGamesCount] = useState<number>(INITIAL_GAMES_SHOWN);
  const [perMatchVisibleCounts, setPerMatchVisibleCounts] = useState<
    Readonly<Record<string, number>>
  >({});
  const [flatShown, setFlatShown] = useState<number>(INITIAL_FLAT_PICKS);
  const [manualOddsByPick, setManualOddsByPick] = useState<Readonly<Record<string, string>>>({});
  const [openManualPickId, setOpenManualPickId] = useState<string | null>(null);
  const [builderTarget, setBuilderTarget] = useState<{
    readonly pick: MatchPick;
    readonly game: PlatformGame;
  } | null>(null);
  const [activeLabPickId, setActiveLabPickId] = useState<string | null>(null);
  const [activeLabOverride, setActiveLabOverride] = useState<CatalogPickItem | null>(null);

  useSafeEffect(() => {
    if (isDesktopViewport && mobileSheetOpen) {
      setMobileSheetOpen(false);
    }
  }, [isDesktopViewport, mobileSheetOpen]);

  const [extraCatalogs, setExtraCatalogs] = useState<Readonly<Record<string, MatchPicksCatalog>>>(
    {},
  );
  const [apiPicksOfTheDay, setApiPicksOfTheDay] = useState<readonly CatalogPickItem[]>([]);
  const [loadedApiPage, setLoadedApiPage] = useState<number>(1);
  const [apiHasMore, setApiHasMore] = useState<boolean>(true);
  const [screenerFetchUrl, setScreenerFetchUrl] = useState<string | null>(null);
  const lastMergedApiStampRef = useRef<string>("");

  const [liveTrackedItems, setLiveTrackedItems] = useState<readonly LiveTrackedPickView[]>([]);
  const [liveTrackerLoaded, setLiveTrackerLoaded] = useState<boolean>(false);
  const [liveTrackerAuthBlocked, setLiveTrackerAuthBlocked] = useState<boolean>(false);
  const [liveTrackerPollMs, setLiveTrackerPollMs] = useState<number | null>(
    DEFAULT_LIVE_TRACKER_POLL_MS,
  );

  const screenerPageFetch = useAbortableJson<ScreenerApiResponse>(screenerFetchUrl, {
    enabled: screenerFetchUrl !== null,
  });

  useSafeEffect(() => {
    const payload = screenerPageFetch.data;
    if (!payload || !payload.ok) return;
    const stamp = `${payload.page}:${payload.generatedAtUtc}`;
    if (lastMergedApiStampRef.current === stamp) return;
    lastMergedApiStampRef.current = stamp;
    setExtraCatalogs((prev) => ({ ...prev, ...payload.catalogs }));
    setLoadedApiPage(payload.page);
    setApiHasMore(payload.hasMore);
    if (payload.picksOfTheDay.length > 0) {
      setApiPicksOfTheDay(payload.picksOfTheDay);
    }
    setVisibleGamesCount((count) => count + GAMES_PAGE_STEP);
  }, [screenerPageFetch.data]);

  useSafeEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const labId = params.get("lab");
    if (labId && labId.trim().length > 0) {
      setActiveLabPickId(labId.trim());
    }
  }, []);

  const mergedCatalogs = useMemo<Readonly<Record<string, MatchPicksCatalog>>>(() => {
    if (!initialCatalogs) return extraCatalogs;
    if (Object.keys(extraCatalogs).length === 0) return initialCatalogs;
    return { ...initialCatalogs, ...extraCatalogs };
  }, [extraCatalogs, initialCatalogs]);

  const debouncedSearch = useDebouncedValue(searchQuery, 150);
  const normalizedSearch = useMemo(() => normText(debouncedSearch.trim()), [debouncedSearch]);

  const canPollLiveTrackedPicks =
    hasAccountSessionAuth && viewerRole !== "visitor" && !liveTrackerAuthBlocked;

  const fetchLiveTrackedPicks = useCallback(async (signal?: AbortSignal): Promise<void> => {
    if (typeof fetch !== "function") return;
    try {
      const response = await fetch("/api/me/live-picks?limit=20", {
        method: "GET",
        credentials: "same-origin",
        headers: { accept: "application/json" },
        ...(signal ? { signal } : {}),
      });
      if (signal?.aborted) return;
      if (response.status === 401 || response.status === 403) {
        setLiveTrackerAuthBlocked(true);
        setLiveTrackedItems([]);
        setLiveTrackerPollMs(null);
        setLiveTrackerLoaded(true);
        return;
      }
      if (!response.ok) {
        setLiveTrackerLoaded(true);
        return;
      }
      const rawJson: unknown = await response.json();
      if (signal?.aborted) return;
      const parsed = parseLiveTrackedPicksPayload(rawJson);
      if (parsed) {
        setLiveTrackedItems(parsed.items);
        if (parsed.nextPollSeconds === null) {
          setLiveTrackerPollMs(null);
        } else {
          const clamped = Math.max(15, Math.min(90, Math.round(parsed.nextPollSeconds)));
          setLiveTrackerPollMs(clamped * 1000);
        }
      }
      setLiveTrackerLoaded(true);
    } catch (err) {
      void err;
      if (!signal?.aborted) {
        setLiveTrackerLoaded(true);
      }
    }
  }, []);

  const prevLiveTriggerRef = useRef<string>("");

  useSafeEffect(() => {
    if (!canPollLiveTrackedPicks) return undefined;
    const triggerKey = `${timing}:${journalCount}`;
    const enteringLiveOrSealed =
      timing === "live" ||
      (prevLiveTriggerRef.current !== "" && prevLiveTriggerRef.current !== triggerKey);
    prevLiveTriggerRef.current = triggerKey;
    if (enteringLiveOrSealed) {
      setLiveTrackerPollMs((prev) => prev ?? DEFAULT_LIVE_TRACKER_POLL_MS);
    }
    const controller = new AbortController();
    void fetchLiveTrackedPicks(controller.signal);
    return () => {
      controller.abort();
    };
  }, [canPollLiveTrackedPicks, fetchLiveTrackedPicks, journalCount, timing]);

  useVisibilityPolling(
    () => fetchLiveTrackedPicks(),
    liveTrackerPollMs,
    canPollLiveTrackedPicks &&
      (timing === "live" || liveTrackedItems.length > 0 || journalCount > 0),
  );

  const hasDatasetLiveGames = useMemo(
    () => dataset.games.some((g) => g.status === "LIVE"),
    [dataset.games],
  );
  const liveBoard = useLiveScoreboard(
    viewerRole !== "visitor" && (timing === "live" || hasDatasetLiveGames) && isPageVisible,
  );

  const liveTrackedByPickId = useMemo(() => {
    const map = new Map<string, LiveTrackedPickView>();
    for (const entry of liveTrackedItems) {
      map.set(entry.pickId, entry);
      for (const leg of entry.legs) {
        if (!map.has(leg.pickId)) {
          map.set(leg.pickId, {
            ...entry,
            id: leg.pickId,
            pickId: leg.pickId,
            gameId: leg.gameId,
            pickKind: "single",
            leagueLabel: leg.leagueLabel,
            matchLabel: leg.matchLabel,
            pickLabel: leg.pickLabel,
            href: leg.href,
            clockLabel: leg.clockLabel,
            actualValue: leg.actualValue,
            targetLine: leg.targetLine,
            unitLabel: leg.unitLabel,
            direction: leg.direction,
            projectedFinal: leg.projectedFinal,
            asianState: leg.asianState,
            starterAlert: leg.starterAlert,
            starterAlertDetail: leg.starterAlertDetail,
            legs: [],
          });
        }
      }
    }
    return map;
  }, [liveTrackedItems]);

  const today = useMemo(() => todayId(userTimezone || "America/Mexico_City"), [userTimezone]);
  const plus2Days = useMemo(() => addDays(today, 2), [today]);

  const minOddsVal = useMemo(() => sliderStepToOdds(minOddsStep) ?? 1.01, [minOddsStep]);
  const maxOddsVal = useMemo(() => sliderStepToOdds(maxOddsStep), [maxOddsStep]);

  const preferredBookSet = useMemo(
    () => new Set(preferredBooks.map((b) => normalizeBookKey(b))),
    [preferredBooks],
  );

  const togglePreferredBook = useCallback(
    (bookId: string) => {
      const key = normalizeBookKey(bookId);
      const next = preferredBookSet.has(key)
        ? preferredBooks.filter((b) => normalizeBookKey(b) !== key)
        : [...preferredBooks, key];
      if (next.length === 0) {
        pushToast("Mantén al menos 1 casa de referencia seleccionada.", "warning");
        return;
      }
      setPreferredBooks(next);
    },
    [preferredBookSet, preferredBooks, pushToast, setPreferredBooks],
  );

  const all = useMemo<ScreenerItem[]>(() => {
    const boardEntries = liveBoard.data?.entries ?? [];
    const liveByGameId = new Map<string, LiveScoreboardEntry>(
      boardEntries.map((e) => [e.gameId, e]),
    );
    const out: ScreenerItem[] = [];

    for (const game of dataset.games) {
      const isSettled = game.status === "FT";
      const liveEntry = liveByGameId.get(game.id);
      const isLiveGame =
        !isSettled &&
        (game.status === "LIVE" || Boolean(liveEntry && isLivePhaseActive(liveEntry.phase)));
      const tabBucket: TimingMode = isSettled ? "settled" : isLiveGame ? "live" : "upcoming";
      const gameProjectedLabel = formatProjectedScore(game);

      const marketByKey = new Map<string, PlatformMarketRow>();
      for (const m of game.markets) {
        marketByKey.set(`${m.market}::${m.selection}`, m);
        if (m.market === "h2h") {
          marketByKey.set(`1x2::${m.selection}`, m);
        } else if (m.market === "1x2") {
          marketByKey.set(`h2h::${m.selection}`, m);
        }
      }

      const liveDetail = isLiveGame ? liveMatchStore(game.id).getSnapshot().data : null;
      const serverCatalog = mergedCatalogs[game.id] ?? null;

      if (serverCatalog && serverCatalog.picks.length > 0) {
        for (let idx = 0; idx < serverCatalog.picks.length; idx += 1) {
          const catItem = serverCatalog.picks[idx]!;
          const pick = catalogPickItemToMatchPick(catItem, game, idx);
          const legacyFamily = catalogCategoryToLegacyFilter(catItem.category, catItem.sport);
          const period = resolvePickPeriod(pick, catItem.family);
          const sideBucket = resolveSideBucket(pick, game, catItem.playerMeta?.teamSide ?? null);
          const playerMeta = catItem.playerMeta ?? null;
          const playerPositionBucket = resolvePlayerPositionBucket(
            playerMeta?.position ?? null,
            game.sport,
          );
          const settlement = resolveSettlementStatus(
            game,
            pick,
            catItem.family,
            catItem.settlement,
          );
          const isCatalogLocked =
            catItem.isRedacted || !isPickUnlocked(pick, game.status, viewerRole);
          const directionBucket = directionToFilterBucket(catItem.direction);
          const searchHaystack = isCatalogLocked
            ? normText(
                `${game.home.name} ${game.home.shortName} ${game.away.name} ${game.away.shortName} ${game.leagueLabel}`,
              )
            : normText(
                `${game.home.name} ${game.home.shortName} ${game.away.name} ${game.away.shortName} ${game.leagueLabel} ${pick.label} ${pick.categoryLabel} ${catItem.familyLabel} ${playerMeta?.playerName ?? ""}`,
              );

          if (isCatalogLocked) {
            out.push({
              game,
              pick,
              catalogPick: catItem,
              tabBucket,
              isLiveGame,
              isSettled,
              settlement,
              liveEntry,
              liveProgress: null,
              family: legacyFamily,
              catalogFamilyId: catItem.family,
              directionBucket,
              period,
              sideBucket,
              playerPositionBucket,
              playerMeta,
              recommendationScore: catItem.recommendationScore ?? 0,
              isRecommended: catItem.isRecommendedByModel !== false,
              convergenceCount: 0,
              valueThresholdLabel: null,
              projectedScoreLabel: catItem.projectedScoreLabel ?? gameProjectedLabel,
              houseDecimal: null,
              houseLabel: null,
              openDecimal: null,
              movementDir: null,
              movement: null,
              movementScore: 0,
              capturedAtUtc: null,
              valuePct: null,
              edgePts: null,
              evidenceWindows: [],
              searchHaystack,
            });
            continue;
          }

          const matchedRow = marketByKey.get(`${catItem.family}::${catItem.selectionKey}`);
          const quotes = pick.bookQuotes ?? matchedRow?.bookQuotes;
          const prefQuote = resolvePreferredBookQuote(quotes, preferredBooks);
          const houseDecimal =
            prefQuote?.decimal ?? catItem.pricing.marketDecimal ?? matchedRow?.currentDecimal ?? null;
          const houseLabel =
            prefQuote?.bookLabel ??
            catItem.pricing.marketBookLabel ??
            matchedRow?.quoteBookLabel ??
            null;
          const openDecimal = prefQuote?.openingDecimal ?? matchedRow?.openDecimal ?? null;
          const movementDir = prefQuote?.movementDirection ?? matchedRow?.movementDirection ?? null;
          const capturedAtUtc =
            prefQuote?.capturedAtUtc ??
            catItem.pricing.marketCapturedAtUtc ??
            matchedRow?.quoteCapturedAtUtc ??
            null;
          const valuePct =
            prefQuote != null
              ? computeExpectedValuePct(pick.p, houseDecimal)
              : (catItem.pricing.evPct ?? computeExpectedValuePct(pick.p, houseDecimal));
          const edgePts =
            prefQuote != null && houseDecimal !== null && houseDecimal > 1
              ? Math.round((pick.p - 1 / houseDecimal) * 1000) / 10
              : (catItem.pricing.edgePts ??
                  (houseDecimal !== null && houseDecimal > 1
                    ? Math.round((pick.p - 1 / houseDecimal) * 1000) / 10
                    : null));

          const movement = classifyOddsMovement(openDecimal, houseDecimal, movementDir);
          const movementScore = !movement
            ? 0
            : movement.kind === "steam"
              ? 100 + Math.abs(movement.deltaPct ?? 8)
              : movement.kind === "shortening"
                ? 50 + Math.abs(movement.deltaPct ?? 2)
                : movement.kind === "drifting"
                  ? 10 + Math.abs(movement.deltaPct ?? 1)
                  : 0;

          let liveProgress: LivePickProgressItem | null = null;
          if (isLiveGame) {
            const synthEntry: JournalEntry = {
              id: pick.id,
              pickId: pick.id,
              gameId: game.id,
              leagueLabel: game.leagueLabel,
              matchLabel: pick.matchLabel,
              pickLabel: pick.label,
              origin: "Spacetime Suite",
              units: 1,
              userDecimal: houseDecimal ?? pick.fairDecimal,
              fairDecimal: pick.fairDecimal,
              clvPct: 0,
              status: "pending",
              sealedAt: "",
            };
            liveProgress = computeLivePickProgress({
              entry: synthEntry,
              game,
              scoreboardEntry: liveEntry,
              detail: liveDetail,
            });
          }

          const catalogWindows = catalogEvidenceToWindowItems(catItem.evidence, catItem.sport);
          const baseWindows =
            catalogWindows.length > 0 ? catalogWindows : extractEvidenceWindows({ game, pick });
          const evidenceWindows = buildCompactEvidenceBullets(
            baseWindows,
            catItem.evidence.bullets,
          );

          const scored = scoreRecommendedCatalogPick(catItem);
          const recommendationScore = catItem.recommendationScore ?? scored.score;
          const isRecommended = catItem.isRecommendedByModel ?? scored.isRecommended;
          const convergenceCount = catItem.convergenceCount ?? scored.convergenceCount;
          const valueThresholdLabel = catItem.pickOfTheDayReason ?? scored.valueThresholdLabel;

          out.push({
            game,
            pick: quotes && !pick.bookQuotes ? { ...pick, bookQuotes: quotes } : pick,
            catalogPick: catItem,
            tabBucket,
            isLiveGame,
            isSettled,
            settlement,
            liveEntry,
            liveProgress,
            family: legacyFamily,
            catalogFamilyId: catItem.family,
            directionBucket,
            period,
            sideBucket,
            playerPositionBucket,
            playerMeta,
            recommendationScore,
            isRecommended,
            convergenceCount,
            valueThresholdLabel,
            projectedScoreLabel: catItem.projectedScoreLabel ?? gameProjectedLabel,
            houseDecimal,
            houseLabel,
            openDecimal,
            movementDir,
            movement,
            movementScore,
            capturedAtUtc,
            valuePct,
            edgePts,
            evidenceWindows,
            searchHaystack,
          });
        }
        continue;
      }

      const seenIds = new Set<string>();
      const seenLabels = new Set<string>();
      const gamePicks: MatchPick[] = [];

      for (const pk of game.picks) {
        seenIds.add(pk.id);
        seenLabels.add(normText(pk.label));
        gamePicks.push(pk);
      }

      if (!isSettled && game.parlayCandidates) {
        for (const cand of game.parlayCandidates) {
          const lblKey = normText(cand.label);
          if (seenIds.has(cand.id) || seenLabels.has(lblKey)) continue;
          seenIds.add(cand.id);
          seenLabels.add(lblKey);
          gamePicks.push(cand);
        }
      }

      if (!isSettled) {
        game.markets.forEach((m, idx) => {
          if (!EXTENDED_SYNTH_MARKETS.has(m.market.toLowerCase())) return;
          const lblKey = normText(m.label);
          if (seenLabels.has(lblKey)) return;
          seenLabels.add(lblKey);
          gamePicks.push(marketRowToScreenerPick(game, m, idx));
        });
      }

      for (const pick of gamePicks) {
        const matchedRow = pick.market
          ? marketByKey.get(`${pick.market}::${pick.selectionKey}`)
          : undefined;
        const quotes = pick.bookQuotes ?? matchedRow?.bookQuotes;
        const prefQuote = resolvePreferredBookQuote(quotes, preferredBooks);
        const houseDecimal =
          prefQuote?.decimal ?? pick.marketDecimal ?? matchedRow?.currentDecimal ?? null;
        const houseLabel =
          prefQuote?.bookLabel ?? pick.marketBookLabel ?? matchedRow?.quoteBookLabel ?? null;
        const openDecimal = prefQuote?.openingDecimal ?? matchedRow?.openDecimal ?? null;
        const movementDir = prefQuote?.movementDirection ?? matchedRow?.movementDirection ?? null;
        const capturedAtUtc =
          prefQuote?.capturedAtUtc ??
          pick.marketCapturedAtUtc ??
          matchedRow?.quoteCapturedAtUtc ??
          null;
        const valuePct = computeExpectedValuePct(pick.p, houseDecimal);
        const edgePts =
          houseDecimal !== null && houseDecimal > 1
            ? Math.round((pick.p - 1 / houseDecimal) * 1000) / 10
            : pick.edgePts;

        const movement = classifyOddsMovement(openDecimal, houseDecimal, movementDir);
        const movementScore = !movement
          ? 0
          : movement.kind === "steam"
            ? 100 + Math.abs(movement.deltaPct ?? 8)
            : movement.kind === "shortening"
              ? 50 + Math.abs(movement.deltaPct ?? 2)
              : movement.kind === "drifting"
                ? 10 + Math.abs(movement.deltaPct ?? 1)
                : 0;

        let liveProgress: LivePickProgressItem | null = null;
        if (isLiveGame) {
          const synthEntry: JournalEntry = {
            id: pick.id,
            pickId: pick.id,
            gameId: game.id,
            leagueLabel: game.leagueLabel,
            matchLabel: pick.matchLabel,
            pickLabel: pick.label,
            origin: "Spacetime Suite",
            units: 1,
            userDecimal: houseDecimal ?? pick.fairDecimal,
            fairDecimal: pick.fairDecimal,
            clvPct: 0,
            status: "pending",
            sealedAt: "",
          };
          liveProgress = computeLivePickProgress({
            entry: synthEntry,
            game,
            scoreboardEntry: liveEntry,
            detail: liveDetail,
          });
        }

        const resolvedFamilyId =
          resolveMarketFamilyIdFromRaw(pick.market, game.sport) ??
          defaultFamilyForSport(game.sport);
        const period = resolvePickPeriod(pick, resolvedFamilyId);
        const sideBucket = resolveSideBucket(pick, game, null);
        const settlement = resolveSettlementStatus(game, pick, resolvedFamilyId);
        const baseWindows = extractEvidenceWindows({ game, pick });
        const evidenceWindows = buildCompactEvidenceBullets(baseWindows);
        const isFallbackLocked = !isPickUnlocked(pick, game.status, viewerRole);
        const catalogPick = buildFallbackCatalogPickItem({
          pick,
          game,
          familyId: resolvedFamilyId,
          settlement,
          houseDecimal,
          houseLabel,
          capturedAtUtc,
          valuePct,
          edgePts,
          evidenceWindows,
          isLocked: isFallbackLocked,
        });
        const scored = isFallbackLocked
          ? {
              score: 0,
              tier: "playable" as const,
              isRecommended: true,
              convergenceCount: 0,
              valueThresholdLabel: null,
            }
          : scoreRecommendedCatalogPick(catalogPick);

        const searchHaystack = isFallbackLocked
          ? normText(
              `${game.home.name} ${game.home.shortName} ${game.away.name} ${game.away.shortName} ${game.leagueLabel}`,
            )
          : normText(
              `${game.home.name} ${game.home.shortName} ${game.away.name} ${game.away.shortName} ${game.leagueLabel} ${pick.label} ${pick.categoryLabel} ${pick.marketGroup}`,
            );

        out.push({
          game,
          pick: quotes && !pick.bookQuotes ? { ...pick, bookQuotes: quotes } : pick,
          catalogPick,
          tabBucket,
          isLiveGame,
          isSettled,
          settlement,
          liveEntry,
          liveProgress: isFallbackLocked ? null : liveProgress,
          family: primaryFamilyOf(pick, game),
          catalogFamilyId: resolvedFamilyId,
          directionBucket: directionToFilterBucket(catalogPick.direction),
          period,
          sideBucket,
          playerPositionBucket: null,
          playerMeta: null,
          recommendationScore: scored.score,
          isRecommended: scored.isRecommended,
          convergenceCount: scored.convergenceCount,
          valueThresholdLabel: scored.valueThresholdLabel,
          projectedScoreLabel: gameProjectedLabel,
          houseDecimal: isFallbackLocked ? null : houseDecimal,
          houseLabel: isFallbackLocked ? null : houseLabel,
          openDecimal: isFallbackLocked ? null : openDecimal,
          movementDir: isFallbackLocked ? null : movementDir,
          movement: isFallbackLocked ? null : movement,
          movementScore: isFallbackLocked ? 0 : movementScore,
          capturedAtUtc: isFallbackLocked ? null : capturedAtUtc,
          valuePct: isFallbackLocked ? null : valuePct,
          edgePts: isFallbackLocked ? null : edgePts,
          evidenceWindows: isFallbackLocked ? [] : evidenceWindows,
          searchHaystack,
        });
      }
    }
    return out;
  }, [dataset.games, liveBoard.data?.entries, mergedCatalogs, preferredBooks, viewerRole]);

  const itemByPickId = useMemo(() => {
    const map = new Map<string, ScreenerItem>();
    for (const item of all) {
      map.set(item.pick.id, item);
    }
    return map;
  }, [all]);

  const gameById = useMemo(() => {
    const map = new Map<string, PlatformGame>();
    for (const game of dataset.games) {
      map.set(game.id, game);
    }
    return map;
  }, [dataset.games]);

  const picksOfTheDay = useMemo<readonly ScreenerItem[]>(() => {
    const candidateCatalogs: CatalogPickItem[] = [];
    for (const item of all) {
      if (item.tabBucket !== "upcoming") continue;
      if (sport !== "all" && !matchesSportFilter(item.game, sport)) continue;
      if (league !== "all" && item.game.league !== league) continue;
      if (item.catalogPick.isRedacted) continue;
      candidateCatalogs.push(item.catalogPick);
    }

    const useServerSeed =
      sport === "all" &&
      league === "all" &&
      ((apiPicksOfTheDay.length > 0 && apiPicksOfTheDay) ||
        (initialPicksOfTheDay && initialPicksOfTheDay.length > 0 && initialPicksOfTheDay));

    const selectedRaw = useServerSeed
      ? useServerSeed
      : selectPicksOfTheDay(candidateCatalogs, 3);

    const resolved: ScreenerItem[] = [];
    for (const catPick of selectedRaw) {
      const existing = itemByPickId.get(catPick.id);
      if (existing) {
        resolved.push(existing);
        continue;
      }
      const game = gameById.get(catPick.gameId);
      if (!game) continue;
      const matchPick = catalogPickItemToMatchPick(catPick, game, 0);
      const scored = scoreRecommendedCatalogPick(catPick);
      const baseWindows = catalogEvidenceToWindowItems(catPick.evidence, catPick.sport);
      resolved.push({
        game,
        pick: matchPick,
        catalogPick: catPick,
        tabBucket: "upcoming",
        isLiveGame: false,
        isSettled: false,
        settlement: catPick.settlement,
        liveProgress: null,
        family: catalogCategoryToLegacyFilter(catPick.category, catPick.sport),
        catalogFamilyId: catPick.family,
        directionBucket: directionToFilterBucket(catPick.direction),
        period: resolvePickPeriod(matchPick, catPick.family),
        sideBucket: resolveSideBucket(matchPick, game, catPick.playerMeta?.teamSide ?? null),
        playerPositionBucket: resolvePlayerPositionBucket(
          catPick.playerMeta?.position ?? null,
          game.sport,
        ),
        playerMeta: catPick.playerMeta ?? null,
        recommendationScore: catPick.recommendationScore ?? scored.score,
        isRecommended: catPick.isRecommendedByModel ?? scored.isRecommended,
        convergenceCount: catPick.convergenceCount ?? scored.convergenceCount,
        valueThresholdLabel: catPick.pickOfTheDayReason ?? scored.valueThresholdLabel,
        projectedScoreLabel: catPick.projectedScoreLabel ?? formatProjectedScore(game),
        houseDecimal: catPick.pricing.marketDecimal,
        houseLabel: catPick.pricing.marketBookLabel,
        openDecimal: null,
        movementDir: null,
        movement: null,
        movementScore: 0,
        capturedAtUtc: catPick.pricing.marketCapturedAtUtc,
        valuePct: catPick.pricing.evPct,
        edgePts: catPick.pricing.edgePts,
        evidenceWindows: buildCompactEvidenceBullets(baseWindows, catPick.evidence.bullets),
        searchHaystack: normText(`${game.home.name} ${game.away.name} ${matchPick.label}`),
      });
    }

    if (resolved.length > 0) return resolved.slice(0, 3);
    const derivedFallback = selectPicksOfTheDay(candidateCatalogs, 3);
    return derivedFallback
      .map((c) => itemByPickId.get(c.id))
      .filter((x): x is ScreenerItem => Boolean(x))
      .slice(0, 3);
  }, [all, apiPicksOfTheDay, gameById, initialPicksOfTheDay, itemByPickId, league, sport]);

  const timingCounts = useMemo(() => {
    const liveIds = new Set<string>();
    let upcoming = 0;
    let settled = 0;
    for (const item of all) {
      if (item.tabBucket === "live") liveIds.add(item.pick.id);
      else if (item.tabBucket === "settled") settled += 1;
      else if (!onlyRecommended || item.isRecommended) upcoming += 1;
    }
    for (const tracked of liveTrackedItems) {
      liveIds.add(tracked.pickId);
    }
    return { live: liveIds.size, upcoming, settled };
  }, [all, liveTrackedItems, onlyRecommended]);

  const tabItems = useMemo<
    readonly { readonly id: TimingMode; readonly label: string; readonly count: number }[]
  >(
    () => [
      {
        id: "upcoming",
        label: "Recomendados / Próximos",
        count: timingCounts.upcoming,
      },
      {
        id: "live",
        label: "Activos / En vivo",
        count: timingCounts.live,
      },
      {
        id: "settled",
        label: "Liquidados FT",
        count: timingCounts.settled,
      },
    ],
    [timingCounts.live, timingCounts.settled, timingCounts.upcoming],
  );

  const leagues = useMemo(() => {
    const seen = new Map<string, string>();
    for (const { game, tabBucket } of all) {
      if (tabBucket !== timing) continue;
      if (sport !== "all" && !matchesSportFilter(game, sport)) continue;
      seen.set(game.league, game.leagueLabel);
    }
    return Array.from(seen.entries());
  }, [all, sport, timing]);

  const teams = useMemo(() => {
    const seen = new Map<string, string>();
    for (const { game, tabBucket } of all) {
      if (tabBucket !== timing) continue;
      if (sport !== "all" && !matchesSportFilter(game, sport)) continue;
      if (league !== "all" && game.league !== league) continue;
      seen.set(game.home.slug, game.home.name);
      seen.set(game.away.slug, game.away.name);
    }
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [all, league, sport, timing]);

  const applySavedView = (view: SavedScreenerView) => {
    setActiveViewId(view.id);
    setSport(view.sport);
    setLeague(view.league);
    setTeamFilter("all");
    setBand(view.band);
    setFamily(view.kind);
    setSort(
      view.sort === "ventaja"
        ? "ev"
        : view.sort === "relevancia"
          ? "recomendados"
          : view.sort,
    );
    setOnlyPositiveEdge(view.onlyPositiveEdge);
    setMinOddsStep(view.minOddsStep);
    setMaxOddsStep(view.maxOddsStep);
    setWindowFilter(view.window);
    setPickTypeFilter("all");
    setDirectionFilter("all");
    setPeriodFilter("all");
    setPositionFilter("all");
    setVisibleGamesCount(INITIAL_GAMES_SHOWN);
    setFlatShown(INITIAL_FLAT_PICKS);
  };

  const handleSaveView = (cleanName: string): boolean => {
    if (cleanName.length < 2) {
      pushToast("Escribe un nombre corto para tu vista (mínimo 2 caracteres).", "warning");
      return false;
    }
    if (savedScreenerViews.length >= MAX_SAVED_SCREENER_VIEWS) {
      pushToast(`Puedes guardar hasta ${MAX_SAVED_SCREENER_VIEWS} vistas personalizadas.`, "warning");
      return false;
    }
    const newView: SavedScreenerView = {
      id: `sv-${Date.now().toString(36)}`,
      name: cleanName,
      sport,
      league,
      band,
      kind: toSavedKind(family),
      sort: toSavedSort(sort),
      onlyPositiveEdge,
      minOddsStep,
      maxOddsStep,
      window: windowFilter,
    };
    setSavedScreenerViews([newView, ...savedScreenerViews]);
    setActiveViewId(newView.id);
    pushToast(`Vista «${cleanName}» guardada.`, "success");
    return true;
  };

  const handleDeleteSavedView = (viewId: string) => {
    const prevViews = savedScreenerViews;
    const removed = prevViews.find((v) => v.id === viewId);
    const nextViews = prevViews.filter((v) => v.id !== viewId);
    setSavedScreenerViews(nextViews);
    if (activeViewId === viewId) setActiveViewId(null);
    pushToast(
      removed ? `Vista «${removed.name}» eliminada.` : "Vista guardada eliminada.",
      "default",
      removed
        ? {
            actionLabel: "Deshacer",
            onAction: () => {
              setSavedScreenerViews(prevViews);
              setActiveViewId(removed.id);
            },
          }
        : undefined,
    );
  };

  const resetAllFilters = () => {
    setActiveViewId(null);
    setSearchQuery("");
    setGroupMode("match");
    setSort("recomendados");
    setSport("all");
    setLeague("all");
    setTeamFilter("all");
    setWindowFilter("all");
    setBand("all");
    setFamily("all");
    setPickTypeFilter("all");
    setDirectionFilter("all");
    setPeriodFilter("all");
    setPositionFilter("all");
    setOnlyRecommended(true);
    setIncludeTrivialOdds(false);
    setOnlyPositiveEdge(false);
    setMinOddsStep(0);
    setMaxOddsStep(100);
    setVisibleGamesCount(INITIAL_GAMES_SHOWN);
    setPerMatchVisibleCounts({});
    setFlatShown(INITIAL_FLAT_PICKS);
  };

  const effectiveIncludeTrivial =
    includeTrivialOdds || (minOddsStep > 0 && minOddsVal < TRIVIAL_ODDS_FLOOR);

  const activeAdvancedCount =
    (sport !== "all" ? 1 : 0) +
    (league !== "all" ? 1 : 0) +
    (teamFilter !== "all" ? 1 : 0) +
    (windowFilter !== "all" ? 1 : 0) +
    (band !== "all" ? 1 : 0) +
    (family !== "all" ? 1 : 0) +
    (pickTypeFilter !== "all" ? 1 : 0) +
    (directionFilter !== "all" ? 1 : 0) +
    (periodFilter !== "all" ? 1 : 0) +
    (positionFilter !== "all" ? 1 : 0) +
    (onlyPositiveEdge ? 1 : 0) +
    (includeTrivialOdds ? 1 : 0) +
    (!onlyRecommended ? 1 : 0) +
    (minOddsStep > 0 || maxOddsStep < 100 ? 1 : 0) +
    (normalizedSearch.length > 0 ? 1 : 0);

  const matchesWindow = useCallback(
    (game: PlatformGame): boolean => {
      if (timing !== "upcoming") return true;
      if (windowFilter === "all") return true;
      if (windowFilter === "today") return game.dayId === today;
      return game.dayId >= today && game.dayId <= plus2Days;
    },
    [plus2Days, timing, today, windowFilter],
  );

  const matchesOddsRange = useCallback(
    (effectiveDec: number): boolean => {
      if (minOddsStep > 0 && effectiveDec < minOddsVal - 0.001) return false;
      if (maxOddsVal !== null && effectiveDec > maxOddsVal + 0.001) return false;
      return true;
    },
    [maxOddsVal, minOddsStep, minOddsVal],
  );

  const matchesPosition = useCallback(
    (item: ScreenerItem): boolean => {
      if (positionFilter === "all") return true;
      if (positionFilter === "home" || positionFilter === "away" || positionFilter === "total") {
        return item.sideBucket === positionFilter;
      }
      return item.playerPositionBucket === positionFilter;
    },
    [positionFilter],
  );

  const rows = useMemo(() => {
    const filtered = all.filter((item) => {
      if (item.tabBucket !== timing) return false;
      if (normalizedSearch && !item.searchHaystack.includes(normalizedSearch)) return false;
      if (sport !== "all" && !matchesSportFilter(item.game, sport)) return false;
      if (league !== "all" && item.game.league !== league) return false;
      if (
        teamFilter !== "all" &&
        item.game.home.slug !== teamFilter &&
        item.game.away.slug !== teamFilter
      ) {
        return false;
      }
      if (!matchesWindow(item.game)) return false;
      if (band !== "all" && bandOf(item.pick.p) !== band) return false;
      if (
        family !== "all" &&
        !matchesMarketFamily(item.pick, item.game, family, item.family, item.catalogFamilyId)
      ) {
        return false;
      }
      if (pickTypeFilter === "player" && !item.playerMeta) return false;
      if (pickTypeFilter === "team_match" && Boolean(item.playerMeta)) return false;
      if (directionFilter !== "all" && item.directionBucket !== directionFilter) return false;
      if (periodFilter !== "all" && item.period !== periodFilter) return false;
      if (!matchesPosition(item)) return false;
      if (onlyPositiveEdge) {
        const hasVal =
          (item.valuePct !== null && item.valuePct > 0) ||
          (item.edgePts !== null && item.edgePts > 0);
        if (!hasVal) return false;
      }

      const effectiveDec = item.houseDecimal ?? item.pick.fairDecimal;
      if (timing === "upcoming") {
        if (!effectiveIncludeTrivial && effectiveDec > 0 && effectiveDec < TRIVIAL_ODDS_FLOOR) {
          return false;
        }
        if (onlyRecommended && !item.isRecommended) {
          return false;
        }
      }

      if (effectiveDec > 0 && !matchesOddsRange(effectiveDec)) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      if (timing === "settled") {
        return (
          safeParseTimestamp(b.game.kickoffUtc) - safeParseTimestamp(a.game.kickoffUtc) ||
          b.recommendationScore - a.recommendationScore ||
          b.pick.p - a.pick.p
        );
      }
      if (sort === "recomendados") {
        return (
          b.recommendationScore - a.recommendationScore ||
          b.convergenceCount - a.convergenceCount ||
          (b.valuePct ?? -999) - (a.valuePct ?? -999) ||
          b.pick.p - a.pick.p
        );
      }
      if (sort === "ev") {
        return (
          (b.valuePct ?? -999) - (a.valuePct ?? -999) ||
          (b.edgePts ?? -999) - (a.edgePts ?? -999) ||
          b.pick.p - a.pick.p
        );
      }
      if (sort === "movimiento") {
        return (
          b.movementScore - a.movementScore ||
          (b.valuePct ?? -999) - (a.valuePct ?? -999) ||
          b.pick.p - a.pick.p
        );
      }
      if (sort === "hora") {
        return safeParseTimestamp(a.game.kickoffUtc) - safeParseTimestamp(b.game.kickoffUtc);
      }
      if (sort === "relevancia") {
        const aScore =
          a.pick.p * 0.55 +
          smoothOddsWeight(a.houseDecimal ?? a.pick.fairDecimal) * 0.25 +
          Math.max(0, (a.edgePts ?? 0) / 100) * 0.2;
        const bScore =
          b.pick.p * 0.55 +
          smoothOddsWeight(b.houseDecimal ?? b.pick.fairDecimal) * 0.25 +
          Math.max(0, (b.edgePts ?? 0) / 100) * 0.2;
        return bScore - aScore;
      }
      if (sort === "momio") {
        return (b.houseDecimal ?? b.pick.fairDecimal) - (a.houseDecimal ?? a.pick.fairDecimal);
      }
      return b.pick.p - a.pick.p;
    });
  }, [
    all,
    band,
    directionFilter,
    effectiveIncludeTrivial,
    family,
    league,
    matchesOddsRange,
    matchesPosition,
    matchesWindow,
    normalizedSearch,
    onlyPositiveEdge,
    onlyRecommended,
    periodFilter,
    pickTypeFilter,
    sort,
    sport,
    teamFilter,
    timing,
  ]);

  const counts = useMemo(() => {
    const c: Record<Band, number> = { all: 0, alta: 0, media: 0, baja: 0 };
    for (const item of all) {
      if (item.tabBucket !== timing) continue;
      if (normalizedSearch && !item.searchHaystack.includes(normalizedSearch)) continue;
      if (sport !== "all" && !matchesSportFilter(item.game, sport)) continue;
      if (league !== "all" && item.game.league !== league) continue;
      if (
        teamFilter !== "all" &&
        item.game.home.slug !== teamFilter &&
        item.game.away.slug !== teamFilter
      ) {
        continue;
      }
      if (!matchesWindow(item.game)) continue;
      if (
        family !== "all" &&
        !matchesMarketFamily(item.pick, item.game, family, item.family, item.catalogFamilyId)
      ) {
        continue;
      }
      if (pickTypeFilter === "player" && !item.playerMeta) continue;
      if (pickTypeFilter === "team_match" && Boolean(item.playerMeta)) continue;
      if (directionFilter !== "all" && item.directionBucket !== directionFilter) continue;
      if (periodFilter !== "all" && item.period !== periodFilter) continue;
      if (!matchesPosition(item)) continue;
      if (onlyPositiveEdge) {
        const hasVal =
          (item.valuePct !== null && item.valuePct > 0) ||
          (item.edgePts !== null && item.edgePts > 0);
        if (!hasVal) continue;
      }
      const effectiveDec = item.houseDecimal ?? item.pick.fairDecimal;
      if (timing === "upcoming") {
        if (!effectiveIncludeTrivial && effectiveDec > 0 && effectiveDec < TRIVIAL_ODDS_FLOOR) {
          continue;
        }
        if (onlyRecommended && !item.isRecommended) continue;
      }
      if (effectiveDec > 0 && !matchesOddsRange(effectiveDec)) continue;
      c.all += 1;
      c[bandOf(item.pick.p)] += 1;
    }
    return c;
  }, [
    all,
    directionFilter,
    effectiveIncludeTrivial,
    family,
    league,
    matchesOddsRange,
    matchesPosition,
    matchesWindow,
    normalizedSearch,
    onlyPositiveEdge,
    onlyRecommended,
    periodFilter,
    pickTypeFilter,
    sport,
    teamFilter,
    timing,
  ]);

  const settledKpis = useMemo<readonly SofascoreKpiItem[]>(() => {
    if (timing !== "settled") return [];
    let hits = 0;
    let misses = 0;
    let pushes = 0;
    for (const item of rows) {
      if (item.settlement === "hit") hits += 1;
      else if (item.settlement === "miss") misses += 1;
      else if (item.settlement === "push") pushes += 1;
    }
    const decided = hits + misses;
    const hitRateLabel = decided > 0 ? `${((hits / decided) * 100).toFixed(1)} %` : "—";
    return [
      {
        id: "settled-total",
        label: "Picks FT auditables",
        value: String(rows.length),
        delta: pushes > 0 ? `${pushes} push` : null,
      },
      {
        id: "settled-hits",
        label: "Ganados",
        value: String(hits),
        tone: "positive",
      },
      {
        id: "settled-misses",
        label: "Perdidos",
        value: String(misses),
        tone: misses > 0 ? "negative" : "default",
      },
      {
        id: "settled-rate",
        label: "Tasa real",
        value: hitRateLabel,
        tone: decided > 0 && hits / decided >= 0.55 ? "positive" : "brand",
      },
    ];
  }, [rows, timing]);

  const allGroupedByMatch = useMemo(() => {
    const map = new Map<
      string,
      { game: PlatformGame; liveEntry?: LiveScoreboardEntry; items: ScreenerItem[] }
    >();
    for (const item of rows) {
      const existing = map.get(item.game.id);
      if (existing) {
        existing.items.push(item);
      } else {
        map.set(item.game.id, { game: item.game, liveEntry: item.liveEntry, items: [item] });
      }
    }
    return Array.from(map.values());
  }, [rows]);

  const visibleMatchGroups = useMemo(
    () => allGroupedByMatch.slice(0, visibleGamesCount),
    [allGroupedByMatch, visibleGamesCount],
  );

  const visibleFlatRows = useMemo(() => rows.slice(0, flatShown), [flatShown, rows]);

  const groupedByMarket = useMemo(() => {
    const map = new Map<Exclude<LegacyFamilyGroup, "all">, ScreenerItem[]>();
    for (const item of visibleFlatRows) {
      const arr = map.get(item.family) ?? [];
      arr.push(item);
      map.set(item.family, arr);
    }
    return Array.from(map.entries()).map(([key, items]) => ({
      key,
      label: MARKET_FAMILY_SHORT_LABELS[key],
      items,
    }));
  }, [visibleFlatRows]);

  const activeLabItem = useMemo<ScreenerItem | null>(() => {
    if (!activeLabPickId) return null;
    const direct = itemByPickId.get(activeLabPickId);
    if (direct) return direct;
    const inPotd = picksOfTheDay.find((p) => p.pick.id === activeLabPickId);
    return inPotd ?? null;
  }, [activeLabPickId, itemByPickId, picksOfTheDay]);

  const missingLabUrl = useMemo<string | null>(() => {
    if (!activeLabPickId || activeLabItem) return null;
    if (activeLabOverride && activeLabOverride.id === activeLabPickId) return null;
    return `/api/picks/lab/${encodeURIComponent(activeLabPickId)}`;
  }, [activeLabItem, activeLabOverride, activeLabPickId]);

  const missingLabFetch = useAbortableJson<PickLabResponsePayload>(missingLabUrl, {
    enabled: missingLabUrl !== null,
  });

  useSafeEffect(() => {
    const payload = missingLabFetch.data;
    if (payload && payload.ok && payload.pick.id === activeLabPickId) {
      setActiveLabOverride(payload.pick);
    }
  }, [activeLabPickId, missingLabFetch.data]);

  const resolvedLabPick = useMemo<CatalogPickItem | null>(() => {
    if (!activeLabPickId) return null;
    if (activeLabItem) return activeLabItem.catalogPick;
    if (activeLabOverride && activeLabOverride.id === activeLabPickId) {
      return activeLabOverride;
    }
    if (missingLabFetch.data?.ok && missingLabFetch.data.pick.id === activeLabPickId) {
      return missingLabFetch.data.pick;
    }
    return null;
  }, [activeLabItem, activeLabOverride, activeLabPickId, missingLabFetch.data]);

  const resolvedLabGame = useMemo<PlatformGame | null>(() => {
    if (activeLabItem) return activeLabItem.game;
    if (!resolvedLabPick) return null;
    return gameById.get(resolvedLabPick.gameId) ?? null;
  }, [activeLabItem, gameById, resolvedLabPick]);

  const resolvedLabDataOverride = useMemo<PickLabResponsePayload | null>(() => {
    if (
      missingLabFetch.data &&
      missingLabFetch.data.ok &&
      resolvedLabPick &&
      missingLabFetch.data.pick.id === resolvedLabPick.id
    ) {
      return missingLabFetch.data;
    }
    return null;
  }, [missingLabFetch.data, resolvedLabPick]);

  const activeLabRelatedPicks = useMemo<readonly CatalogPickItem[]>(() => {
    if (!resolvedLabPick) return [];
    const targetGameId = resolvedLabPick.gameId;
    const targetPlayer = resolvedLabPick.playerMeta?.playerName ?? null;
    const fromCatalog = all
      .filter(
        (candidate) =>
          candidate.game.id === targetGameId &&
          candidate.pick.id !== resolvedLabPick.id &&
          !candidate.catalogPick.isRedacted &&
          isPickUnlocked(candidate.pick, candidate.game.status, viewerRole),
      )
      .sort((a, b) => {
        const aSamePlayer = targetPlayer && a.playerMeta?.playerName === targetPlayer ? 1 : 0;
        const bSamePlayer = targetPlayer && b.playerMeta?.playerName === targetPlayer ? 1 : 0;
        return bSamePlayer - aSamePlayer || b.recommendationScore - a.recommendationScore;
      })
      .slice(0, 8)
      .map((candidate) => candidate.catalogPick);

    if (fromCatalog.length > 0) return fromCatalog;
    if (resolvedLabDataOverride?.relatedPicks && resolvedLabDataOverride.relatedPicks.length > 0) {
      return resolvedLabDataOverride.relatedPicks
        .filter((candidate) => candidate.id !== resolvedLabPick.id)
        .slice(0, 8);
    }
    return [];
  }, [all, resolvedLabDataOverride, resolvedLabPick, viewerRole]);

  const toggleGroupCollapse = useCallback((groupKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }, []);

  const handleLoadMorePicksForGame = useCallback((gameId: string) => {
    setPerMatchVisibleCounts((prev) => ({
      ...prev,
      [gameId]: (prev[gameId] ?? PER_MATCH_INITIAL_PICKS) + PER_MATCH_LOAD_STEP,
    }));
  }, []);

  const handleLoadMoreMatches = useCallback(() => {
    const remainingLocal = allGroupedByMatch.length - visibleGamesCount;
    if (remainingLocal > 0) {
      setVisibleGamesCount((count) => count + GAMES_PAGE_STEP);
    }
    if (remainingLocal <= GAMES_PAGE_STEP && apiHasMore && !screenerPageFetch.loading) {
      const nextPage = loadedApiPage + 1;
      const params = new URLSearchParams({
        page: String(nextPage),
        pageSize: "20",
        onlyRecommended: onlyRecommended ? "1" : "0",
        includeTrivial: effectiveIncludeTrivial ? "1" : "0",
      });
      if (sport !== "all") params.set("sport", sport);
      if (league !== "all") params.set("league", league);
      if (normalizedSearch.length > 0) params.set("q", normalizedSearch);
      setScreenerFetchUrl(`/api/picks/screener?${params.toString()}`);
    }
  }, [
    allGroupedByMatch.length,
    apiHasMore,
    effectiveIncludeTrivial,
    league,
    loadedApiPage,
    normalizedSearch,
    onlyRecommended,
    screenerPageFetch.loading,
    sport,
    visibleGamesCount,
  ]);

  const handleOpenLab = useCallback((item: ScreenerItem) => {
    setActiveLabPickId(item.pick.id);
    setActiveLabOverride(item.catalogPick);
  }, []);

  const handleCloseLab = useCallback(() => {
    setActiveLabPickId(null);
    setActiveLabOverride(null);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.has("lab")) {
        url.searchParams.delete("lab");
        window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      }
    }
  }, []);

  const handleSelectRelatedPick = useCallback((relatedPick: CatalogPickItem) => {
    setActiveLabPickId(relatedPick.id);
    setActiveLabOverride(relatedPick);
  }, []);

  const handleLabAddToParlay = useCallback(
    (catPick: CatalogPickItem) => {
      const game = gameById.get(catPick.gameId) ?? resolvedLabGame ?? null;
      const matchPick = catalogPickItemToMatchPick(catPick, game, 0);
      addPickToParlay(matchPick);
    },
    [addPickToParlay, gameById, resolvedLabGame],
  );

  const handleLabSealPick = useCallback(
    (catPick: CatalogPickItem, customSpec?: PickLabCustomSelection) => {
      const game = gameById.get(catPick.gameId) ?? resolvedLabGame ?? null;
      const basePick = catalogPickItemToMatchPick(catPick, game, 0);
      const finalPick: MatchPick = customSpec
        ? {
            ...basePick,
            label: customSpec.label,
            line: customSpec.line,
            selectionKey: `${customSpec.metricKey}_${customSpec.direction}_${customSpec.line}`,
            marketDecimal: customSpec.oddsDecimal ?? basePick.marketDecimal,
          }
        : basePick;
      handleCloseLab();
      openComposer(finalPick);
    },
    [gameById, handleCloseLab, openComposer, resolvedLabGame],
  );

  const handleOpenManual = useCallback((pickId: string) => {
    setOpenManualPickId(pickId);
  }, []);

  const handleManualChange = useCallback((pickId: string, value: string) => {
    setManualOddsByPick((prev) => ({ ...prev, [pickId]: value }));
  }, []);

  const handleOpenBuilder = useCallback((pick: MatchPick, game: PlatformGame) => {
    setBuilderTarget({ pick, game });
  }, []);

  const currentGroupLabel =
    GROUP_MODES.find((m) => m.id === groupMode)?.shortLabel ?? "Partidos";
  const currentSortLabel =
    SORT_OPTIONS.find((s) => s.id === sort)?.label ?? "Recomendados";
  const currentTypeLabel =
    PICK_TYPE_OPTIONS.find((t) => t.id === pickTypeFilter)?.label ?? "Todos";
  const currentDirectionLabel =
    DIRECTION_OPTIONS.find((d) => d.id === directionFilter)?.label ?? "Todas";
  const currentPeriodLabel =
    PERIOD_OPTIONS.find((p) => p.id === periodFilter)?.label ?? "Todos";
  const currentMarketLabel = isCatalogFamilyId(family)
    ? MARKET_FAMILIES[family].shortLabel
    : (MARKET_FAMILY_GROUPS.find((g) => g.id === family)?.label ?? "Todos");
  const currentPosLabel =
    POSITION_OPTIONS.find((p) => p.id === positionFilter)?.label ?? "Todas";
  const currentCompLabel =
    league !== "all"
      ? (leagues.find(([id]) => id === league)?.[1] ?? league)
      : sport !== "all"
        ? (SPORT_OPTIONS.find((s) => s.id === sport)?.label ?? sport)
        : "Todas";
  const currentTeamLabel =
    teamFilter === "all"
      ? "Todos"
      : (teams.find(([slug]) => slug === teamFilter)?.[1] ?? teamFilter);
  const currentBandLabel = BANDS.find((b) => b.id === band)?.label ?? "Todas";
  const currentWindowLabel =
    WINDOW_OPTIONS.find((w) => w.id === windowFilter)?.label ?? "Toda la agenda";
  const currentOddsSummary =
    minOddsStep === 0 && maxOddsStep === 100
      ? "Sin límite"
      : `${formatOddsValue(minOddsVal, oddsFormat)} – ${maxOddsVal !== null ? formatOddsValue(maxOddsVal, oddsFormat) : "10.0+"}`;

  const renderFilterRailContent = (inSheet: boolean) => (
    <div className={`pl-scr-rail-content ${inSheet ? "is-sheet" : ""}`.trim()}>
      <div className="pl-scr-rail-toggles">
        {timing === "upcoming" ? (
          <label className="pl-scr-toggle-row">
            <span className="pl-scr-toggle-copy">
              <strong>Solo recomendados</strong>
              <span>Filtro Spacetime (excluye ruido)</span>
            </span>
            <input
              type="checkbox"
              checked={onlyRecommended}
              onChange={(e) => {
                setActiveViewId(null);
                setOnlyRecommended(e.target.checked);
                setVisibleGamesCount(INITIAL_GAMES_SHOWN);
              }}
              data-picks-only-recommended=""
            />
          </label>
        ) : null}

        <label className="pl-scr-toggle-row">
          <span className="pl-scr-toggle-copy">
            <strong>Solo EV+</strong>
            <span>Casa paga arriba del momio justo</span>
          </span>
          <input
            type="checkbox"
            checked={onlyPositiveEdge}
            onChange={(e) => {
              setActiveViewId(null);
              setOnlyPositiveEdge(e.target.checked);
              setVisibleGamesCount(INITIAL_GAMES_SHOWN);
            }}
            data-picks-only-ev=""
          />
        </label>

        {timing === "upcoming" ? (
          <label className="pl-scr-toggle-row">
            <span className="pl-scr-toggle-copy">
              <strong>Incluir cuotas &lt; 1.25</strong>
              <span>Muestra líneas muy bajas</span>
            </span>
            <input
              type="checkbox"
              checked={includeTrivialOdds}
              onChange={(e) => {
                setActiveViewId(null);
                setIncludeTrivialOdds(e.target.checked);
                setVisibleGamesCount(INITIAL_GAMES_SHOWN);
              }}
              data-picks-include-trivial=""
            />
          </label>
        ) : null}
      </div>

      <div className="pl-scr-acc-list">
        <details className="pl-scr-acc">
          <summary className="pl-scr-acc-summary">
            <span className="pl-scr-acc-key">Agrupar por</span>
            <span className="pl-scr-acc-val">{currentGroupLabel}</span>
          </summary>
          <div className="pl-scr-acc-body">
            <div
              className="pl-scr-group-seg is-rail"
              role="group"
              aria-label="Modo de agrupación"
              data-screener-group-mode=""
            >
              {GROUP_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`pl-scr-seg-btn ${groupMode === m.id ? "is-on" : ""}`.trim()}
                  aria-pressed={groupMode === m.id}
                  onClick={() => setGroupMode(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </details>

        <details className="pl-scr-acc">
          <summary className="pl-scr-acc-summary">
            <span className="pl-scr-acc-key">Ordenar por</span>
            <span className="pl-scr-acc-val">{currentSortLabel}</span>
          </summary>
          <div className="pl-scr-acc-body">
            <label className="pl-scr-field">
              <span className="sr-only">Ordenar por</span>
              <select
                value={sort}
                onChange={(e) => {
                  setActiveViewId(null);
                  setSort(parseSortExtended(e.target.value));
                }}
                className="pl-scr-select"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </details>

        <details className="pl-scr-acc">
          <summary className="pl-scr-acc-summary">
            <span className="pl-scr-acc-key">Tipo de pick</span>
            <span className="pl-scr-acc-val">{currentTypeLabel}</span>
          </summary>
          <div className="pl-scr-acc-body">
            <label className="pl-scr-field">
              <span className="sr-only">Tipo de pick</span>
              <select
                value={pickTypeFilter}
                onChange={(e) => {
                  setActiveViewId(null);
                  setPickTypeFilter(parsePickTypeFilter(e.target.value));
                  setVisibleGamesCount(INITIAL_GAMES_SHOWN);
                }}
                className="pl-scr-select"
              >
                {PICK_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </details>

        <details className="pl-scr-acc">
          <summary className="pl-scr-acc-summary">
            <span className="pl-scr-acc-key">Dirección</span>
            <span className="pl-scr-acc-val">{currentDirectionLabel}</span>
          </summary>
          <div className="pl-scr-acc-body">
            <label className="pl-scr-field">
              <span className="sr-only">Dirección</span>
              <select
                value={directionFilter}
                onChange={(e) => {
                  setActiveViewId(null);
                  setDirectionFilter(parseDirectionFilter(e.target.value));
                  setVisibleGamesCount(INITIAL_GAMES_SHOWN);
                }}
                className="pl-scr-select"
              >
                {DIRECTION_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </details>

        <details className="pl-scr-acc">
          <summary className="pl-scr-acc-summary">
            <span className="pl-scr-acc-key">Periodo</span>
            <span className="pl-scr-acc-val">{currentPeriodLabel}</span>
          </summary>
          <div className="pl-scr-acc-body">
            <label className="pl-scr-field">
              <span className="sr-only">Periodo</span>
              <select
                value={periodFilter}
                onChange={(e) => {
                  setActiveViewId(null);
                  setPeriodFilter(parsePeriodFilter(e.target.value));
                  setVisibleGamesCount(INITIAL_GAMES_SHOWN);
                }}
                className="pl-scr-select"
                data-screener-period-filter=""
              >
                {PERIOD_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </details>

        <details className="pl-scr-acc">
          <summary className="pl-scr-acc-summary">
            <span className="pl-scr-acc-key">Mercados</span>
            <span className="pl-scr-acc-val truncate">{currentMarketLabel}</span>
          </summary>
          <div className="pl-scr-acc-body">
            <label className="pl-scr-field">
              <span className="sr-only">Familia de mercado</span>
              <select
                value={family}
                aria-label="Familia de mercado"
                onChange={(e) => {
                  setActiveViewId(null);
                  setFamily(parseFamilyFilter(e.target.value));
                  setVisibleGamesCount(INITIAL_GAMES_SHOWN);
                }}
                className="pl-scr-select"
              >
                <optgroup label="Agrupaciones">
                  {MARKET_FAMILY_GROUPS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="34 familias del catálogo">
                  {MARKET_FAMILY_IDS.map((famId) => (
                    <option key={famId} value={famId}>
                      {MARKET_FAMILIES[famId].label}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
          </div>
        </details>

        <details className="pl-scr-acc">
          <summary className="pl-scr-acc-summary">
            <span className="pl-scr-acc-key">Posiciones</span>
            <span className="pl-scr-acc-val">{currentPosLabel}</span>
          </summary>
          <div className="pl-scr-acc-body">
            <label className="pl-scr-field">
              <span className="sr-only">Posición</span>
              <select
                value={positionFilter}
                onChange={(e) => {
                  setActiveViewId(null);
                  setPositionFilter(parsePositionFilter(e.target.value));
                  setVisibleGamesCount(INITIAL_GAMES_SHOWN);
                }}
                className="pl-scr-select"
                data-screener-position-filter=""
              >
                {POSITION_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </details>

        <details className="pl-scr-acc">
          <summary className="pl-scr-acc-summary">
            <span className="pl-scr-acc-key">Competiciones</span>
            <span className="pl-scr-acc-val truncate">{currentCompLabel}</span>
          </summary>
          <div className="pl-scr-acc-body space-y-2">
            <label className="pl-scr-field">
              <span>Deporte</span>
              <select
                value={sport}
                onChange={(e) => {
                  setActiveViewId(null);
                  setSport(parseSportFilter(e.target.value));
                  setLeague("all");
                  setTeamFilter("all");
                  setVisibleGamesCount(INITIAL_GAMES_SHOWN);
                }}
                className="pl-scr-select"
              >
                {SPORT_OPTIONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="pl-scr-field">
              <span>Liga</span>
              <select
                value={league}
                onChange={(e) => {
                  setActiveViewId(null);
                  setLeague(e.target.value);
                  setTeamFilter("all");
                  setVisibleGamesCount(INITIAL_GAMES_SHOWN);
                }}
                className="pl-scr-select"
              >
                <option value="all">Todas ({leagues.length})</option>
                {leagues.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </details>

        <details className="pl-scr-acc">
          <summary className="pl-scr-acc-summary">
            <span className="pl-scr-acc-key">Equipos</span>
            <span className="pl-scr-acc-val truncate">{currentTeamLabel}</span>
          </summary>
          <div className="pl-scr-acc-body">
            <label className="pl-scr-field">
              <span className="sr-only">Equipo</span>
              <select
                value={teamFilter}
                onChange={(e) => {
                  setActiveViewId(null);
                  setTeamFilter(e.target.value);
                  setVisibleGamesCount(INITIAL_GAMES_SHOWN);
                }}
                className="pl-scr-select"
              >
                <option value="all">Todos ({teams.length})</option>
                {teams.map(([slug, name]) => (
                  <option key={slug} value={slug}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </details>

        <details className="pl-scr-acc">
          <summary className="pl-scr-acc-summary">
            <span className="pl-scr-acc-key">Cuotas</span>
            <span className="pl-scr-acc-val num">{currentOddsSummary}</span>
          </summary>
          <div className="pl-scr-acc-body">
            <NonLinearOddsSlider
              minStep={minOddsStep}
              maxStep={maxOddsStep}
              oddsFormat={oddsFormat}
              compact
              onChange={(nextMin, nextMax) => {
                setActiveViewId(null);
                setMinOddsStep(nextMin);
                setMaxOddsStep(nextMax);
                setVisibleGamesCount(INITIAL_GAMES_SHOWN);
              }}
            />
          </div>
        </details>

        <details className="pl-scr-acc">
          <summary className="pl-scr-acc-summary">
            <span className="pl-scr-acc-key">Acierto / Probabilidad</span>
            <span className="pl-scr-acc-val">{currentBandLabel}</span>
          </summary>
          <div className="pl-scr-acc-body">
            <div
              className="pl-scr-band-group is-rail"
              role="group"
              aria-label="Probabilidad calibrada Spacetime"
            >
              {BANDS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={`pl-scr-band-btn ${band === b.id ? "is-on" : ""}`.trim()}
                  aria-pressed={band === b.id}
                  title={b.hint || undefined}
                  onClick={() => {
                    setActiveViewId(null);
                    setBand(b.id);
                    setVisibleGamesCount(INITIAL_GAMES_SHOWN);
                  }}
                >
                  <span>{b.label}</span>
                  <span className="num pl-scr-band-count">{counts[b.id]}</span>
                </button>
              ))}
            </div>
          </div>
        </details>

        {timing === "upcoming" ? (
          <details className="pl-scr-acc">
            <summary className="pl-scr-acc-summary">
              <span className="pl-scr-acc-key">Fechas</span>
              <span className="pl-scr-acc-val">{currentWindowLabel}</span>
            </summary>
            <div className="pl-scr-acc-body">
              <label className="pl-scr-field">
                <span className="sr-only">Fechas de los partidos</span>
                <select
                  value={windowFilter}
                  onChange={(e) => {
                    setActiveViewId(null);
                    setWindowFilter(parseWindowFilter(e.target.value));
                    setVisibleGamesCount(INITIAL_GAMES_SHOWN);
                  }}
                  className="pl-scr-select"
                >
                  {WINDOW_OPTIONS.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </details>
        ) : null}

        <details className="pl-scr-acc">
          <summary className="pl-scr-acc-summary">
            <span className="pl-scr-acc-key">Casas</span>
            <span className="pl-scr-acc-val num">{preferredBooks.length} activas</span>
          </summary>
          <div className="pl-scr-acc-body space-y-2">
            <div className="pl-scr-books-pills" role="group" aria-label="Casas preferidas">
              {QUICK_BOOKS.map((book) => {
                const active = preferredBookSet.has(normalizeBookKey(book.id));
                return (
                  <button
                    key={book.id}
                    type="button"
                    className={`pl-scr-book-chip ${active ? "is-on" : ""}`.trim()}
                    aria-pressed={active}
                    data-quick-book={book.id}
                    onClick={() => togglePreferredBook(book.id)}
                  >
                    {book.label}
                  </button>
                );
              })}
            </div>
            <a
              href="/app/account?tab=prefs#pl-prefs-picks"
              className="pl-scr-rail-prefs-link"
              onClick={(e) => {
                e.preventDefault();
                navigateTo("/app/account?tab=prefs#pl-prefs-picks");
              }}
            >
              Configurar todas mis casas →
            </a>
          </div>
        </details>
      </div>

      <button
        type="button"
        className="pl-scr-reset-btn"
        onClick={resetAllFilters}
        data-picks-reset-filters=""
      >
        Restablecer criterios{activeAdvancedCount > 0 ? ` (${activeAdvancedCount})` : ""}
      </button>

      <div className="pl-scr-rail-saved">
        <SavedViewsBar
          views={savedScreenerViews}
          activeViewId={activeViewId}
          compact
          onApply={applySavedView}
          onSave={handleSaveView}
          onDelete={handleDeleteSavedView}
        />
      </div>
    </div>
  );

  const renderLiveTrackerCard = () => (
    <SofascoreCard
      title="Seguimiento en vivo de tus picks"
      meta={`${liveTrackedItems.length} ${liveTrackedItems.length === 1 ? "seguido" : "seguidos"}`}
      density="compact"
    >
      {liveTrackedItems.length > 0 ? (
        <div className="pl-scr-live-tracker-grid" data-live-tracker-strip="">
          {liveTrackedItems.map((tracked) => (
            <div
              key={tracked.id}
              className="pl-scr-live-tracker-card"
              data-picks-live-progress=""
            >
              <LivePickProgressBar
                pickLabel={tracked.pickLabel}
                matchLabel={
                  tracked.leagueLabel
                    ? `${tracked.leagueLabel} · ${tracked.matchLabel}`
                    : tracked.matchLabel
                }
                clockLabel={tracked.clockLabel}
                actualValue={tracked.actualValue}
                targetLine={tracked.targetLine}
                unitLabel={tracked.unitLabel}
                direction={tracked.direction}
                projectedFinal={tracked.projectedFinal}
                asianState={tracked.asianState}
                starterAlert={tracked.starterAlert}
                starterAlertDetail={tracked.starterAlertDetail}
              />
              {tracked.pickKind === "parlay" && tracked.legs.length > 1 ? (
                <details className="pl-scr-live-legs">
                  <summary className="pl-scr-live-legs-summary num">
                    Ver {tracked.legs.length} piernas del parlay
                  </summary>
                  <div className="pl-scr-live-legs-list">
                    {tracked.legs.map((leg) => (
                      <LivePickProgressBar
                        key={leg.pickId}
                        pickLabel={leg.pickLabel}
                        matchLabel={
                          leg.leagueLabel
                            ? `${leg.leagueLabel} · ${leg.matchLabel}`
                            : leg.matchLabel
                        }
                        clockLabel={leg.clockLabel}
                        actualValue={leg.actualValue}
                        targetLine={leg.targetLine}
                        unitLabel={leg.unitLabel}
                        direction={leg.direction}
                        projectedFinal={leg.projectedFinal}
                        asianState={leg.asianState}
                        starterAlert={leg.starterAlert}
                        starterAlertDetail={leg.starterAlertDetail}
                        compact
                      />
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="pl-scr-live-tracker-note">
          {hasAccountSessionAuth && liveTrackerLoaded
            ? "No tienes picks sellados en juego ahora mismo. Sella un pick desde Próximos para seguir su avance actual / línea aquí."
            : "Inicia sesión con tu cuenta de socio para seguir tus picks sellados en tiempo real con barra actual / línea y alertas de alineación."}
        </p>
      )}
    </SofascoreCard>
  );

  const renderPickTable = (
    itemsToRender: readonly ScreenerItem[],
    caption: string,
    showMatchMeta: boolean,
    tableKey: string,
  ) => (
    <div
      className="pl-scr-table-wrap"
      role="region"
      tabIndex={0}
      aria-labelledby={`pl-scr-cap-${tableKey}`}
    >
      <table className="pl-scr-table">
        <caption id={`pl-scr-cap-${tableKey}`} className="sr-only">
          {caption}
        </caption>
        <thead>
          <tr>
            <th scope="col" className="pl-scr-th pl-scr-th-pick">
              Pick
            </th>
            <th scope="col" className="pl-scr-th pl-scr-th-bet">
              Apuesta
            </th>
            <th scope="col" className="pl-scr-th pl-scr-th-evidence">
              {timing === "live" ? "Avance en vivo" : "Evidencia"}
            </th>
            <th scope="col" className="pl-scr-th pl-scr-th-odds is-end">
              {timing === "settled" ? "Liquidación" : "Cuotas"}
            </th>
          </tr>
        </thead>
        <tbody>
          {itemsToRender.map((item) => {
            const unlocked = isPickUnlocked(item.pick, item.game.status, viewerRole);
            const tracked = item.isLiveGame ? (liveTrackedByPickId.get(item.pick.id) ?? null) : null;
            return (
              <ScreenerPickRow
                key={item.pick.id}
                item={item}
                timing={timing}
                showMatchMeta={showMatchMeta}
                unlocked={unlocked}
                oddsFormat={oddsFormat}
                manualRaw={manualOddsByPick[item.pick.id] ?? ""}
                isManualOpen={openManualPickId === item.pick.id}
                trackedLive={tracked}
                onOpenLab={handleOpenLab}
                onOpenBuilder={handleOpenBuilder}
                onOpenComposer={openComposer}
                onOpenManual={handleOpenManual}
                onManualChange={handleManualChange}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const featuredPotd = picksOfTheDay[0] ?? null;
  const secondaryPotds = picksOfTheDay.slice(1, 3);
  const canLoadMoreMatches =
    visibleGamesCount < allGroupedByMatch.length || (apiHasMore && timing === "upcoming");

  return (
    <AtmosphereStage activePath="/app/picks">
      <ClubWorkspaceShell activePath="/app/picks">
        <div
          className="pl-scr-root"
          data-catalog-wired={Object.keys(mergedCatalogs).length > 0 ? "true" : "false"}
        >
          <header className="pl-scr-topbar">
            <div className="pl-scr-topbar-left">
              <h1 className="pl-scr-h1">Explorar picks</h1>
              <div className="pl-scr-tabs-bar" data-screener-timing="">
                <div
                  role="tablist"
                  aria-label="Estado de los picks"
                  aria-orientation="horizontal"
                  className="pl-sf-tabs is-underline"
                  data-pl-sf-tabs="underline"
                >
                  {tabItems.map((tabItem, tabIndex) => {
                    const isSelected = tabItem.id === timing;
                    return (
                      <button
                        key={tabItem.id}
                        id={`${tabsUid}-tab-${tabItem.id}`}
                        ref={(el) => {
                          tabButtonRefs.current[tabItem.id] = el;
                        }}
                        type="button"
                        role="tab"
                        aria-selected={isSelected}
                        aria-controls={tabPanelId}
                        tabIndex={isSelected ? 0 : -1}
                        data-pl-sf-tab={tabItem.id}
                        className="pl-sf-tab"
                        onClick={(event) => {
                          event.currentTarget.scrollIntoView({
                            behavior: "auto",
                            inline: "nearest",
                            block: "nearest",
                          });
                          if (tabItem.id !== timing) {
                            setTiming(tabItem.id);
                            setVisibleGamesCount(INITIAL_GAMES_SHOWN);
                            setFlatShown(INITIAL_FLAT_PICKS);
                          }
                        }}
                        onKeyDown={(event) => {
                          let nextIdx = -1;
                          if (event.key === "ArrowRight") {
                            nextIdx = (tabIndex + 1) % tabItems.length;
                          } else if (event.key === "ArrowLeft") {
                            nextIdx = (tabIndex - 1 + tabItems.length) % tabItems.length;
                          } else if (event.key === "Home") {
                            nextIdx = 0;
                          } else if (event.key === "End") {
                            nextIdx = tabItems.length - 1;
                          }
                          if (nextIdx < 0) return;
                          event.preventDefault();
                          const targetTab = tabItems[nextIdx];
                          if (!targetTab) return;
                          const btn = tabButtonRefs.current[targetTab.id];
                          btn?.focus();
                          btn?.scrollIntoView({
                            behavior: "auto",
                            inline: "nearest",
                            block: "nearest",
                          });
                          if (targetTab.id !== timing) {
                            setTiming(targetTab.id);
                            setVisibleGamesCount(INITIAL_GAMES_SHOWN);
                            setFlatShown(INITIAL_FLAT_PICKS);
                          }
                        }}
                      >
                        <span className="pl-sf-tab-label">{tabItem.label}</span>
                        <span className="pl-sf-tab-count num">{tabItem.count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="pl-scr-topbar-right">
              <label className="pl-scr-search-box">
                <MaestroIcon name="search" size={14} className="pl-scr-search-icon" />
                <span className="sr-only">Buscar equipo, liga, mercado o jugador</span>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setVisibleGamesCount(INITIAL_GAMES_SHOWN);
                    setFlatShown(INITIAL_FLAT_PICKS);
                  }}
                  placeholder="Buscar equipo, mercado o jugador…"
                  className="pl-scr-search-input"
                  autoComplete="off"
                />
              </label>

              <span className="pl-scr-count-badge num" data-screener-result-count="">
                {rows.length} {rows.length === 1 ? "pick" : "picks"}
              </span>

              <button
                type="button"
                className="pl-scr-mobile-filter-btn"
                aria-haspopup="dialog"
                aria-expanded={mobileSheetOpen}
                data-picks-mobile-filters-trigger=""
                data-mobile-filters-toggle=""
                onClick={() => setMobileSheetOpen(true)}
              >
                <MaestroIcon name="sliders" size={14} />
                <span>Filtros{activeAdvancedCount > 0 ? ` (${activeAdvancedCount})` : ""}</span>
              </button>
            </div>
          </header>

          {timing === "upcoming" && featuredPotd ? (
            <section
              className="pl-scr-potd"
              aria-label="Pick del día seleccionado por Spacetime"
              data-picks-potd=""
            >
              <div className="pl-scr-potd-row">
                <div className="pl-scr-potd-left">
                  <div className="pl-scr-potd-eyebrow num">
                    <span className="pl-scr-potd-star" aria-hidden="true">
                      ★
                    </span>
                    <span>PICK DEL DÍA</span>
                    <span className="pl-scr-meta-sep" aria-hidden="true">
                      ·
                    </span>
                    <span>{featuredPotd.game.leagueLabel}</span>
                    <span className="pl-scr-meta-sep" aria-hidden="true">
                      ·
                    </span>
                    <span>{featuredPotd.game.kickoffLocal}</span>
                    {featuredPotd.projectedScoreLabel ? (
                      <>
                        <span className="pl-scr-meta-sep" aria-hidden="true">
                          ·
                        </span>
                        <span className="pl-scr-potd-proj">{featuredPotd.projectedScoreLabel}</span>
                      </>
                    ) : null}
                  </div>

                  <div className="pl-scr-potd-headline">
                    <TeamBadge
                      league={featuredPotd.game.league}
                      slug={featuredPotd.game.home.slug}
                      name={featuredPotd.game.home.name}
                      logoUrl={featuredPotd.game.home.logoUrl}
                      size={20}
                    />
                    <span className="pl-scr-potd-match">
                      {featuredPotd.game.home.shortName} vs {featuredPotd.game.away.shortName}
                    </span>
                    <span className="pl-scr-meta-sep" aria-hidden="true">
                      —
                    </span>
                    <strong className="pl-scr-potd-pick">{featuredPotd.pick.label}</strong>
                  </div>

                  <p className="pl-scr-potd-reason">
                    {featuredPotd.valueThresholdLabel ??
                      `Tiene valor si tu casa paga ${formatOddsValue(featuredPotd.pick.fairDecimal, oddsFormat)} o más.`}
                    {featuredPotd.evidenceWindows.length > 0 ? (
                      <span className="pl-scr-potd-ev num">
                        {" · "}
                        {featuredPotd.evidenceWindows
                          .slice(0, 2)
                          .map((w) => `${w.label} ${w.value}`)
                          .join(" · ")}
                      </span>
                    ) : null}
                  </p>
                </div>

                <div className="pl-scr-potd-metrics num">
                  <div className="pl-scr-potd-prob-wrap">
                    <strong className="pl-scr-potd-prob">
                      {(featuredPotd.pick.p * 100).toFixed(1)} %
                    </strong>
                    <span className="pl-scr-potd-prob-lbl">
                      Prob. Spacetime ·{" "}
                      {featuredPotd.houseDecimal !== null
                        ? `${featuredPotd.houseLabel ?? "Casa"} ${formatOddsValue(featuredPotd.houseDecimal, oddsFormat)}`
                        : `Justo ${formatOddsValue(featuredPotd.pick.fairDecimal, oddsFormat)}`}
                    </span>
                  </div>

                  <div className="pl-scr-potd-actions">
                    <button
                      type="button"
                      className="pl-scr-potd-cta"
                      data-picks-potd-analyze=""
                      onClick={() => handleOpenLab(featuredPotd)}
                    >
                      <span>Analizar</span>
                      <MaestroIcon name="arrowRight" size={12} />
                    </button>
                    <ParlayRowButton pick={featuredPotd.pick} />
                    {secondaryPotds.length > 0 ? (
                      <button
                        type="button"
                        className="pl-scr-potd-toggle"
                        aria-expanded={potdExpanded}
                        data-picks-potd-toggle=""
                        onClick={() => setPotdExpanded((v) => !v)}
                      >
                        <span>{potdExpanded ? "Solo Top 1" : `Top ${picksOfTheDay.length}`}</span>
                        <MaestroIcon
                          name="chevronDown"
                          size={12}
                          className={`pl-scr-chev ${potdExpanded ? "is-open" : ""}`.trim()}
                        />
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              {potdExpanded && secondaryPotds.length > 0 ? (
                <div className="pl-scr-potd-more">
                  {secondaryPotds.map((candidate, idx) => (
                    <div key={candidate.pick.id} className="pl-scr-potd-subcard">
                      <div className="pl-scr-potd-subhead">
                        <span className="pl-scr-potd-rank num">#{idx + 2}</span>
                        <strong className="pl-scr-potd-subpick">{candidate.pick.label}</strong>
                        <span className="pl-scr-potd-subprob num">
                          {(candidate.pick.p * 100).toFixed(1)} %
                        </span>
                      </div>
                      <span className="pl-scr-potd-submatch num">
                        {candidate.game.home.shortName} vs {candidate.game.away.shortName} ·{" "}
                        {candidate.game.leagueLabel}
                        {candidate.projectedScoreLabel ? ` · ${candidate.projectedScoreLabel}` : ""}
                      </span>
                      <div className="pl-scr-potd-subfoot">
                        <span className="pl-scr-potd-subreason">
                          {candidate.valueThresholdLabel ??
                            `Justo ${formatOddsValue(candidate.pick.fairDecimal, oddsFormat)}`}
                        </span>
                        <button
                          type="button"
                          className="pl-scr-row-action is-compact"
                          onClick={() => handleOpenLab(candidate)}
                        >
                          Analizar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          <div className="pl-scr-layout" data-picks-layout="">
            <div
              id={tabPanelId}
              className="pl-scr-main"
              role="tabpanel"
              aria-labelledby={`${tabsUid}-tab-${timing}`}
              data-picks-main=""
            >
              {timing === "live" ? renderLiveTrackerCard() : null}

              {timing === "settled" && settledKpis.length > 0 ? (
                <SofascoreKpiStrip items={settledKpis} />
              ) : null}

              {rows.length === 0 ? (
                <div data-screener-empty="">
                  <SofascoreEmptyState
                    title={
                      timing === "live"
                        ? "No hay partidos en vivo con picks activos en este momento"
                        : timing === "settled"
                          ? "No hay picks liquidados FT con estos filtros"
                          : "No hay picks que coincidan con los criterios seleccionados"
                    }
                    description={
                      timing === "live"
                        ? "Explora los picks recomendados próximos o revisa los picks liquidados FT auditables."
                        : "Ajusta los filtros del panel derecho o incluye cuotas menores a 1.25 para ampliar resultados."
                    }
                    actionLabel={
                      activeAdvancedCount > 0
                        ? "Restablecer criterios"
                        : timing === "upcoming" && onlyRecommended
                          ? "Mostrar todos los picks"
                          : timing !== "upcoming"
                            ? "Ver recomendados"
                            : undefined
                    }
                    onAction={
                      activeAdvancedCount > 0
                        ? resetAllFilters
                        : timing === "upcoming" && onlyRecommended
                          ? () => {
                              setOnlyRecommended(false);
                              setIncludeTrivialOdds(true);
                            }
                          : timing !== "upcoming"
                            ? () => setTiming("upcoming")
                            : undefined
                    }
                  />
                </div>
              ) : groupMode === "match" ? (
                <div className="pl-scr-groups" data-screener-view="match">
                  {visibleMatchGroups.map(({ game, liveEntry, items }) => {
                    const isCollapsed = collapsedGroups.has(`m:${game.id}`);
                    const href = canonicalGameHref(game.league, game);
                    const liveScore = liveEntry?.score ?? game.score;
                    const liveClock =
                      game.status === "FT"
                        ? "FT"
                        : (liveEntry?.clock ?? (game.status === "LIVE" ? "En vivo" : null));
                    const projLabel = formatProjectedScore(game);
                    const matchCap = perMatchVisibleCounts[game.id] ?? PER_MATCH_INITIAL_PICKS;
                    const displayedItems = items.slice(0, matchCap);
                    const remainingInMatch = Math.max(0, items.length - displayedItems.length);

                    return (
                      <section
                        key={game.id}
                        className="pl-scr-group"
                        data-screener-match-group={game.id}
                      >
                        <header className="pl-scr-group-head">
                          <button
                            type="button"
                            className="pl-scr-group-toggle"
                            aria-expanded={!isCollapsed}
                            onClick={() => toggleGroupCollapse(`m:${game.id}`)}
                          >
                            <span className="pl-scr-group-crests" aria-hidden="true">
                              <TeamBadge
                                league={game.league}
                                slug={game.home.slug}
                                name={game.home.name}
                                logoUrl={game.home.logoUrl}
                                size={22}
                              />
                              <TeamBadge
                                league={game.league}
                                slug={game.away.slug}
                                name={game.away.name}
                                logoUrl={game.away.logoUrl}
                                size={22}
                              />
                            </span>
                            <div className="pl-scr-group-meta min-w-0">
                              <strong className="pl-scr-group-title truncate">
                                {game.home.name} vs {game.away.name}
                              </strong>
                              <span className="pl-scr-group-sub num">
                                <LeagueBadge
                                  league={game.league}
                                  label={game.leagueLabel}
                                  logoUrl={game.leagueLogoUrl}
                                  size={13}
                                />
                                <span>{game.leagueLabel}</span>
                                <span className="pl-scr-meta-sep" aria-hidden="true">
                                  ·
                                </span>
                                <span>
                                  {liveScore && liveClock
                                    ? `${liveScore.home}–${liveScore.away} · ${liveClock}`
                                    : `${game.dayLabel} ${game.kickoffLocal}`}
                                </span>
                                {projLabel && game.status !== "FT" ? (
                                  <>
                                    <span className="pl-scr-meta-sep" aria-hidden="true">
                                      ·
                                    </span>
                                    <span className="pl-scr-group-proj">{projLabel}</span>
                                  </>
                                ) : null}
                              </span>
                            </div>
                            <span className="pl-scr-group-count num">
                              {items.length} {items.length === 1 ? "pick" : "picks"}
                            </span>
                            <MaestroIcon
                              name="chevronDown"
                              size={15}
                              className={`pl-scr-chev ${isCollapsed ? "is-collapsed" : ""}`.trim()}
                            />
                          </button>

                          <a
                            href={href}
                            className="pl-scr-group-ficha"
                            onPointerEnter={() => prefetchRoute(href)}
                            onTouchStart={() => prefetchRoute(href)}
                            onClick={(e) => {
                              e.preventDefault();
                              navigateTo(href);
                            }}
                          >
                            <span>Ficha</span>
                            <MaestroIcon name="arrowRight" size={12} />
                          </a>
                        </header>

                        {!isCollapsed ? (
                          <>
                            {renderPickTable(
                              displayedItems,
                              `Picks de ${game.home.name} vs ${game.away.name}`,
                              false,
                              `m-${game.id}`,
                            )}
                            {remainingInMatch > 0 ? (
                              <div className="pl-scr-group-more">
                                <button
                                  type="button"
                                  className="pl-scr-load-more-game num"
                                  data-picks-load-more-game={game.id}
                                  onClick={() => handleLoadMorePicksForGame(game.id)}
                                >
                                  Cargar más picks (+{remainingInMatch})
                                </button>
                              </div>
                            ) : null}
                          </>
                        ) : null}
                      </section>
                    );
                  })}

                  {canLoadMoreMatches ? (
                    <div className="pl-scr-more-matches">
                      <Button
                        type="button"
                        variant="secondary"
                        size="default"
                        className="num"
                        disabled={screenerPageFetch.loading}
                        data-picks-load-more-matches=""
                        onClick={handleLoadMoreMatches}
                      >
                        {screenerPageFetch.loading
                          ? "Cargando más partidos…"
                          : visibleGamesCount < allGroupedByMatch.length
                            ? `Cargar más partidos (+${allGroupedByMatch.length - visibleGamesCount})`
                            : "Cargar más partidos"}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : groupMode === "market" ? (
                <div className="pl-scr-groups" data-screener-view="market">
                  {groupedByMarket.map((grp) => {
                    const isCollapsed = collapsedGroups.has(`k:${grp.key}`);
                    return (
                      <section
                        key={grp.key}
                        className="pl-scr-group"
                        data-screener-market-group={grp.key}
                      >
                        <header className="pl-scr-group-head">
                          <button
                            type="button"
                            className="pl-scr-group-toggle"
                            aria-expanded={!isCollapsed}
                            onClick={() => toggleGroupCollapse(`k:${grp.key}`)}
                          >
                            <strong className="pl-scr-group-title">{grp.label}</strong>
                            <span className="pl-scr-group-count num">
                              {grp.items.length} {grp.items.length === 1 ? "pick" : "picks"}
                            </span>
                            <MaestroIcon
                              name="chevronDown"
                              size={15}
                              className={`pl-scr-chev ${isCollapsed ? "is-collapsed" : ""}`.trim()}
                            />
                          </button>
                        </header>

                        {!isCollapsed
                          ? renderPickTable(grp.items, `Picks de ${grp.label}`, true, `k-${grp.key}`)
                          : null}
                      </section>
                    );
                  })}

                  {rows.length > flatShown ? (
                    <div className="pl-scr-more-matches">
                      <Button
                        type="button"
                        variant="secondary"
                        size="default"
                        className="num"
                        onClick={() => setFlatShown((n) => n + FLAT_PICKS_STEP)}
                      >
                        Ver más picks (+{rows.length - flatShown})
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="pl-scr-groups" data-screener-view="flat">
                  <div className="pl-scr-group">
                    {renderPickTable(
                      visibleFlatRows,
                      `${rows.length} picks filtrados`,
                      true,
                      "flat",
                    )}
                  </div>
                  {rows.length > flatShown ? (
                    <div className="pl-scr-more-matches">
                      <Button
                        type="button"
                        variant="secondary"
                        size="default"
                        className="num"
                        onClick={() => setFlatShown((n) => n + FLAT_PICKS_STEP)}
                      >
                        Ver más picks (+{rows.length - flatShown})
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <aside
              id="pl-finder-advanced-panel"
              className="pl-scr-filter-rail"
              aria-label="Filtros del screener"
              data-picks-filter-rail=""
            >
              <div className="pl-scr-rail-card">
                <div className="pl-scr-rail-head">
                  <span className="pl-scr-rail-title">Filtros</span>
                  {activeAdvancedCount > 0 ? (
                    <span className="pl-scr-rail-badge num">{activeAdvancedCount}</span>
                  ) : null}
                </div>
                {!mobileSheetOpen ? renderFilterRailContent(false) : null}
              </div>
            </aside>
          </div>
        </div>

        {mobileSheetOpen ? (
          <MobileFiltersSheet
            resultCount={rows.length}
            onReset={resetAllFilters}
            onClose={() => setMobileSheetOpen(false)}
          >
            {renderFilterRailContent(true)}
          </MobileFiltersSheet>
        ) : null}

        {builderTarget ? (
          <BetBuilderDrawer
            open={Boolean(builderTarget)}
            pick={builderTarget.pick}
            game={builderTarget.game}
            onClose={() => setBuilderTarget(null)}
          />
        ) : null}

        <PickEvidenceLabDrawer
          open={Boolean(activeLabPickId && resolvedLabPick)}
          pick={resolvedLabPick}
          game={resolvedLabGame}
          relatedPicks={activeLabRelatedPicks}
          labDataOverride={resolvedLabDataOverride}
          onClose={handleCloseLab}
          onSelectRelatedPick={handleSelectRelatedPick}
          onAddToParlay={handleLabAddToParlay}
          onSealPick={handleLabSealPick}
        />
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
