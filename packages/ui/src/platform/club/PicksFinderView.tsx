"use client";

import React, {
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
  SofascoreFilterBar,
  SofascoreKpiStrip,
  SofascoreSignalPair,
  SofascoreTable,
  SofascoreTabs,
  SofascoreValueCell,
  type SofascoreKpiItem,
  type SofascoreTabItem,
  type SofascoreTableColumn,
} from "../../components/ui/primitives";
import { LeagueBadge } from "../../sports";
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
  useDebouncedValue,
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
  type MarketFamilyId,
  type MatchPicksCatalog,
  type PickSettlementStatus,
} from "../picks-catalog";
import {
  useIsPickInParlay,
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
  type OddsMovementInfo,
} from "./picks";

type Band = ScreenerBandFilter;
type GroupMode = "match" | "market" | "flat";
type TimingMode = "live" | "upcoming" | "settled";
type ScreenerSortExtended = "ev" | "p" | "movimiento" | "hora" | "relevancia" | "momio";
type QuickPreset = "todos" | "probables" | "valor" | "goles" | "conteos";
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

const BANDS: ReadonlyArray<{ id: Band; label: string; hint: string }> = [
  { id: "all", label: "Todas", hint: "" },
  { id: "alta", label: "≥ 70 %", hint: "70 % o más" },
  { id: "media", label: "55–69 %", hint: "55 a 69 %" },
  { id: "baja", label: "< 55 %", hint: "menos de 55 %" },
];

const PERIOD_OPTIONS: ReadonlyArray<{ id: PeriodFilter; label: string }> = [
  { id: "all", label: "Todos los periodos" },
  { id: "ft", label: "Partido completo" },
  { id: "1h", label: "1.ª mitad (1T)" },
  { id: "2h", label: "2.ª mitad (2T)" },
  { id: "f5", label: "5 entradas (MLB F5)" },
];

const POSITION_OPTIONS: ReadonlyArray<{ id: PositionFilter; label: string }> = [
  { id: "all", label: "Todas las posiciones" },
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
  { id: "all", label: "Todos los mercados (34)" },
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
  { id: "caliente_mx", label: "Caliente" },
  { id: "draftkings", label: "DraftKings" },
  { id: "fanduel", label: "FanDuel" },
];

const QUICK_CHIPS: ReadonlyArray<{ id: QuickPreset; label: string }> = [
  { id: "todos", label: "Todos" },
  { id: "probables", label: "Muy probables (≥ 70 %)" },
  { id: "valor", label: "Valor EV+" },
  { id: "goles", label: "Goles y totales" },
  { id: "conteos", label: "Córners y tarjetas" },
];

const GROUP_MODES: ReadonlyArray<{ id: GroupMode; label: string }> = [
  { id: "match", label: "Por partido" },
  { id: "market", label: "Por mercado" },
  { id: "flat", label: "Lista plana" },
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
const INITIAL_VISIBLE_PICKS = 12;
const PICKS_PAGE_STEP = 16;
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

function parseDirection(value: unknown): "over" | "under" | "handicap" {
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
    direction: parseDirection(raw.direction),
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
    direction: parseDirection(raw.direction),
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

function parseSortExtended(raw: string): ScreenerSortExtended {
  if (
    raw === "ev" ||
    raw === "p" ||
    raw === "movimiento" ||
    raw === "hora" ||
    raw === "relevancia" ||
    raw === "momio"
  ) {
    return raw;
  }
  return "ev";
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

function parseTimingMode(raw: string): TimingMode {
  if (raw === "live" || raw === "settled") return raw;
  return "upcoming";
}

function resolveMarketFamilyIdFromRaw(
  rawMarket: string | undefined,
  sport: PlatformGame["sport"],
): MarketFamilyId | null {
  if (!rawMarket) return null;
  const lowered = rawMarket.toLowerCase();
  if (isCatalogFamilyId(lowered)) return lowered;
  if (lowered === "h2h") {
    if (sport === "basketball") return "nba_moneyline";
    if (sport === "baseball") return "mlb_moneyline";
    if (sport === "ice-hockey") return "nhl_moneyline";
    if (sport === "american-football") return "nfl_moneyline";
    return "1x2";
  }
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
    hay.includes("1er tiempo") ||
    hay.includes("primera mitad")
  ) {
    return "1h";
  }
  if (
    hay.includes("second_half") ||
    hay.includes("2t") ||
    hay.includes("2.a mitad") ||
    hay.includes("2o tiempo") ||
    hay.includes("segunda mitad")
  ) {
    return "2h";
  }
  if (hay.includes("mlb_f5") || hay.includes(" f5") || hay.startsWith("f5 ") || hay.includes("5 entradas")) {
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
  if (pos.includes("FWD") || pos === "ST" || pos === "CF" || pos === "LW" || pos === "RW" || pos === "F") {
    return "fwd";
  }
  if (pos.includes("MID") || pos === "CM" || pos === "CAM" || pos === "CDM" || pos === "LM" || pos === "RM" || pos === "M") {
    return "mid";
  }
  if (pos.includes("DEF") || pos === "GK" || pos === "CB" || pos === "LB" || pos === "RB" || pos === "D") {
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
  return sort;
}

function bandOf(p: number): Exclude<Band, "all"> {
  return p >= 0.7 ? "alta" : p >= 0.55 ? "media" : "baja";
}

function selectCompactEvidenceWindows(
  windows: readonly EvidenceWindowItem[],
): readonly EvidenceWindowItem[] {
  if (windows.length <= 4) return windows;
  const priorityOrder: readonly EvidenceWindowItem["key"][] = [
    "home_away",
    "l5",
    "h2h",
    "xg",
    "ref",
    "l10",
    "l20",
    "custom",
  ];
  const picked: EvidenceWindowItem[] = [];
  const used = new Set<number>();
  for (const key of priorityOrder) {
    for (let idx = 0; idx < windows.length; idx += 1) {
      if (used.has(idx)) continue;
      const item = windows[idx]!;
      if (item.key === key) {
        picked.push(item);
        used.add(idx);
        break;
      }
    }
    if (picked.length >= 4) break;
  }
  return picked;
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
  if (status === "hit") return "Acertado";
  if (status === "miss") return "Fallado";
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

interface ScreenerItem {
  readonly game: PlatformGame;
  readonly pick: MatchPick;
  readonly tabBucket: TimingMode;
  readonly isLiveGame: boolean;
  readonly isSettled: boolean;
  readonly settlement: PickSettlementStatus;
  readonly liveEntry?: LiveScoreboardEntry;
  readonly liveProgress: LivePickProgressItem | null;
  readonly family: Exclude<LegacyFamilyGroup, "all">;
  readonly catalogFamilyId?: MarketFamilyId;
  readonly period: Exclude<PeriodFilter, "all">;
  readonly sideBucket: "home" | "away" | "total";
  readonly playerPositionBucket: Exclude<PositionFilter, "all" | "home" | "away" | "total"> | null;
  readonly playerPositionRaw: string | null;
  readonly playerName: string | null;
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

function ParlayToggle({ pick }: { readonly pick: MatchPick }): React.JSX.Element {
  const { addPickToParlay, removePickFromParlay } = usePlatformActions();
  const on = useIsPickInParlay(pick.id);
  return (
    <Button
      type="button"
      variant={on ? "primary" : "secondary"}
      size="sm"
      aria-pressed={on}
      aria-label={`${on ? "Quitar del parlay" : "Agregar al parlay"}: ${pick.label}, ${pick.matchLabel}`}
      onClick={() => (on ? removePickFromParlay(pick.id) : addPickToParlay(pick))}
    >
      <MaestroIcon name={on ? "check" : "plus"} size={13} />
      <span>{on ? "En parlay" : "Parlay"}</span>
    </Button>
  );
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
  if (tail && !/^\d/.test(tail) && tail !== "/") return tail;
  return sport === "football" ? "goles" : "pts";
}

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
            Limpiar
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
}

export function PicksFinderClubView({
  initialCatalogs = null,
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
    navigateTo,
    prefetchRoute,
    requestFullShell,
  } = usePlatformActions();

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
  const [preset, setPreset] = useState<QuickPreset>("todos");
  const [sport, setSport] = useState<ScreenerSportFilter>("all");
  const [windowFilter, setWindowFilter] = useState<ScreenerWindowFilter>("all");
  const [band, setBand] = useState<Band>("all");
  const [family, setFamily] = useState<MarketFamilyFilter>("all");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [positionFilter, setPositionFilter] = useState<PositionFilter>("all");
  const [onlyPositiveEdge, setOnlyPositiveEdge] = useState<boolean>(false);
  const [league, setLeague] = useState<string>("all");
  const [sort, setSort] = useState<ScreenerSortExtended>("ev");
  const [minOddsStep, setMinOddsStep] = useState<number>(0);
  const [maxOddsStep, setMaxOddsStep] = useState<number>(100);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(() => new Set());
  const [mobileSheetOpen, setMobileSheetOpen] = useState<boolean>(false);
  const [shown, setShown] = useState(INITIAL_VISIBLE_PICKS);
  const [manualOddsByPick, setManualOddsByPick] = useState<Record<string, string>>({});
  const [openManualPickId, setOpenManualPickId] = useState<string | null>(null);
  const [builderTarget, setBuilderTarget] = useState<{
    pick: MatchPick;
    game: PlatformGame;
  } | null>(null);

  const [liveTrackedItems, setLiveTrackedItems] = useState<readonly LiveTrackedPickView[]>([]);
  const [liveTrackerLoaded, setLiveTrackerLoaded] = useState<boolean>(false);
  const [liveTrackerAuthBlocked, setLiveTrackerAuthBlocked] = useState<boolean>(false);
  const [liveTrackerPollMs, setLiveTrackerPollMs] = useState<number | null>(
    DEFAULT_LIVE_TRACKER_POLL_MS,
  );

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

  useSafeEffect(() => {
    if (!canPollLiveTrackedPicks) return undefined;
    const controller = new AbortController();
    void fetchLiveTrackedPicks(controller.signal);
    return () => {
      controller.abort();
    };
  }, [canPollLiveTrackedPicks, fetchLiveTrackedPicks]);

  useVisibilityPolling(
    () => fetchLiveTrackedPicks(),
    liveTrackerPollMs,
    canPollLiveTrackedPicks && (timing === "live" || liveTrackedItems.length > 0),
  );

  const hasDatasetLiveGames = useMemo(
    () => dataset.games.some((g) => g.status === "LIVE"),
    [dataset.games],
  );
  const liveBoard = useLiveScoreboard(
    viewerRole !== "visitor" && (timing === "live" || hasDatasetLiveGames) && isPageVisible,
  );

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
      const serverCatalog = initialCatalogs?.[game.id] ?? null;

      if (serverCatalog && serverCatalog.picks.length > 0) {
        for (let idx = 0; idx < serverCatalog.picks.length; idx += 1) {
          const catItem = serverCatalog.picks[idx]!;
          const pick = catalogPickItemToMatchPick(catItem, game, idx);
          const legacyFamily = catalogCategoryToLegacyFilter(catItem.category, catItem.sport);
          const period = resolvePickPeriod(pick, catItem.family);
          const sideBucket = resolveSideBucket(pick, game, catItem.playerMeta?.teamSide ?? null);
          const playerPosRaw = catItem.playerMeta?.position ?? null;
          const playerPositionBucket = resolvePlayerPositionBucket(playerPosRaw, game.sport);
          const playerName = catItem.playerMeta?.playerName ?? null;
          const settlement = resolveSettlementStatus(
            game,
            pick,
            catItem.family,
            catItem.settlement,
          );
          const isCatalogLocked =
            catItem.isRedacted || !isPickUnlocked(pick, game.status, viewerRole);
          const searchHaystack = isCatalogLocked
            ? normText(
                `${game.home.name} ${game.home.shortName} ${game.away.name} ${game.away.shortName} ${game.leagueLabel}`,
              )
            : normText(
                `${game.home.name} ${game.home.shortName} ${game.away.name} ${game.away.shortName} ${game.leagueLabel} ${pick.label} ${pick.categoryLabel} ${catItem.familyLabel} ${playerName ?? ""}`,
              );

          if (isCatalogLocked) {
            out.push({
              game,
              pick,
              tabBucket,
              isLiveGame,
              isSettled,
              settlement,
              liveEntry,
              liveProgress: null,
              family: legacyFamily,
              catalogFamilyId: catItem.family,
              period,
              sideBucket,
              playerPositionBucket,
              playerPositionRaw: playerPosRaw,
              playerName,
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
          const evidenceWindows =
            catalogWindows.length > 0 ? catalogWindows : extractEvidenceWindows({ game, pick });

          out.push({
            game,
            pick: quotes && !pick.bookQuotes ? { ...pick, bookQuotes: quotes } : pick,
            tabBucket,
            isLiveGame,
            isSettled,
            settlement,
            liveEntry,
            liveProgress,
            family: legacyFamily,
            catalogFamilyId: catItem.family,
            period,
            sideBucket,
            playerPositionBucket,
            playerPositionRaw: playerPosRaw,
            playerName,
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

        const resolvedFamilyId = resolveMarketFamilyIdFromRaw(pick.market, game.sport) ?? undefined;
        const period = resolvePickPeriod(pick, resolvedFamilyId);
        const sideBucket = resolveSideBucket(pick, game, null);
        const settlement = resolveSettlementStatus(game, pick, resolvedFamilyId);
        const evidenceWindows = extractEvidenceWindows({ game, pick });
        const isFallbackLocked = !isPickUnlocked(pick, game.status, viewerRole);
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
          tabBucket,
          isLiveGame,
          isSettled,
          settlement,
          liveEntry,
          liveProgress: isFallbackLocked ? null : liveProgress,
          family: primaryFamilyOf(pick, game),
          catalogFamilyId: resolvedFamilyId,
          period,
          sideBucket,
          playerPositionBucket: null,
          playerPositionRaw: null,
          playerName: null,
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
  }, [dataset.games, initialCatalogs, liveBoard.data?.entries, preferredBooks, viewerRole]);

  const timingCounts = useMemo(() => {
    let live = 0;
    let upcoming = 0;
    let settled = 0;
    for (const item of all) {
      if (item.tabBucket === "live") live += 1;
      else if (item.tabBucket === "settled") settled += 1;
      else upcoming += 1;
    }
    return { live, upcoming, settled };
  }, [all]);

  const tabItems = useMemo<readonly SofascoreTabItem[]>(
    () => [
      {
        id: "live",
        label: "Activos / En vivo",
        count: timingCounts.live + liveTrackedItems.length,
      },
      {
        id: "upcoming",
        label: "Próximos",
        count: timingCounts.upcoming,
      },
      {
        id: "settled",
        label: "Liquidados FT",
        count: timingCounts.settled,
      },
    ],
    [liveTrackedItems.length, timingCounts.live, timingCounts.settled, timingCounts.upcoming],
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

  const applyQuickPreset = (next: QuickPreset) => {
    setActiveViewId(null);
    setPreset(next);
    setShown(INITIAL_VISIBLE_PICKS);
    if (next === "todos") {
      setBand("all");
      setFamily("all");
      setOnlyPositiveEdge(false);
      setSort("ev");
    } else if (next === "probables") {
      setBand("alta");
      setFamily("all");
      setOnlyPositiveEdge(false);
      setSort("p");
    } else if (next === "valor") {
      setBand("all");
      setFamily("all");
      setOnlyPositiveEdge(true);
      setSort("ev");
    } else if (next === "goles") {
      setBand("all");
      setFamily("goles");
      setOnlyPositiveEdge(false);
      setSort("p");
    } else if (next === "conteos") {
      setBand("all");
      setFamily("conteos");
      setOnlyPositiveEdge(false);
      setSort("p");
    }
  };

  const applySavedView = (view: SavedScreenerView) => {
    setActiveViewId(view.id);
    setPreset("todos");
    setSport(view.sport);
    setLeague(view.league);
    setBand(view.band);
    setFamily(view.kind);
    setSort(view.sort === "ventaja" ? "ev" : view.sort);
    setOnlyPositiveEdge(view.onlyPositiveEdge);
    setMinOddsStep(view.minOddsStep);
    setMaxOddsStep(view.maxOddsStep);
    setWindowFilter(view.window);
    setPeriodFilter("all");
    setPositionFilter("all");
    setShown(INITIAL_VISIBLE_PICKS);
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
    setPreset("todos");
    setSport("all");
    setWindowFilter("all");
    setBand("all");
    setFamily("all");
    setPeriodFilter("all");
    setPositionFilter("all");
    setOnlyPositiveEdge(false);
    setLeague("all");
    setSort("ev");
    setMinOddsStep(0);
    setMaxOddsStep(100);
    setShown(INITIAL_VISIBLE_PICKS);
  };

  const activeAdvancedCount =
    (sport !== "all" ? 1 : 0) +
    (league !== "all" ? 1 : 0) +
    (windowFilter !== "all" ? 1 : 0) +
    (band !== "all" ? 1 : 0) +
    (family !== "all" ? 1 : 0) +
    (periodFilter !== "all" ? 1 : 0) +
    (positionFilter !== "all" ? 1 : 0) +
    (onlyPositiveEdge ? 1 : 0) +
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
      if (!matchesWindow(item.game)) return false;
      if (band !== "all" && bandOf(item.pick.p) !== band) return false;
      if (
        family !== "all" &&
        !matchesMarketFamily(item.pick, item.game, family, item.family, item.catalogFamilyId)
      ) {
        return false;
      }
      if (periodFilter !== "all" && item.period !== periodFilter) return false;
      if (!matchesPosition(item)) return false;
      if (onlyPositiveEdge) {
        const hasVal =
          (item.valuePct !== null && item.valuePct > 0) ||
          (item.edgePts !== null && item.edgePts > 0);
        if (!hasVal) return false;
      }
      const effectiveDec = item.houseDecimal ?? item.pick.fairDecimal;
      if (effectiveDec > 0 && !matchesOddsRange(effectiveDec)) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      if (timing === "settled") {
        return (
          safeParseTimestamp(b.game.kickoffUtc) - safeParseTimestamp(a.game.kickoffUtc) ||
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
    family,
    league,
    matchesOddsRange,
    matchesPosition,
    matchesWindow,
    normalizedSearch,
    onlyPositiveEdge,
    periodFilter,
    sort,
    sport,
    timing,
  ]);

  const counts = useMemo(() => {
    const c: Record<Band, number> = { all: 0, alta: 0, media: 0, baja: 0 };
    for (const item of all) {
      if (item.tabBucket !== timing) continue;
      if (normalizedSearch && !item.searchHaystack.includes(normalizedSearch)) continue;
      if (sport !== "all" && !matchesSportFilter(item.game, sport)) continue;
      if (league !== "all" && item.game.league !== league) continue;
      if (!matchesWindow(item.game)) continue;
      if (
        family !== "all" &&
        !matchesMarketFamily(item.pick, item.game, family, item.family, item.catalogFamilyId)
      ) {
        continue;
      }
      if (periodFilter !== "all" && item.period !== periodFilter) continue;
      if (!matchesPosition(item)) continue;
      if (onlyPositiveEdge) {
        const hasVal =
          (item.valuePct !== null && item.valuePct > 0) ||
          (item.edgePts !== null && item.edgePts > 0);
        if (!hasVal) continue;
      }
      const effectiveDec = item.houseDecimal ?? item.pick.fairDecimal;
      if (effectiveDec > 0 && !matchesOddsRange(effectiveDec)) continue;
      c.all += 1;
      c[bandOf(item.pick.p)] += 1;
    }
    return c;
  }, [
    all,
    family,
    league,
    matchesOddsRange,
    matchesPosition,
    matchesWindow,
    normalizedSearch,
    onlyPositiveEdge,
    periodFilter,
    sport,
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
        label: "Acertados",
        value: String(hits),
        tone: "positive",
      },
      {
        id: "settled-misses",
        label: "Fallados",
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

  const visibleRows = useMemo(() => rows.slice(0, shown), [rows, shown]);

  const groupedByMatch = useMemo(() => {
    const map = new Map<
      string,
      { game: PlatformGame; liveEntry?: LiveScoreboardEntry; items: ScreenerItem[] }
    >();
    for (const item of visibleRows) {
      const existing = map.get(item.game.id);
      if (existing) {
        existing.items.push(item);
      } else {
        map.set(item.game.id, { game: item.game, liveEntry: item.liveEntry, items: [item] });
      }
    }
    return Array.from(map.values());
  }, [visibleRows]);

  const groupedByMarket = useMemo(() => {
    const map = new Map<Exclude<LegacyFamilyGroup, "all">, ScreenerItem[]>();
    for (const item of visibleRows) {
      const arr = map.get(item.family) ?? [];
      arr.push(item);
      map.set(item.family, arr);
    }
    return Array.from(map.entries()).map(([key, items]) => ({
      key,
      label: MARKET_FAMILY_SHORT_LABELS[key],
      items,
    }));
  }, [visibleRows]);

  const toggleGroupCollapse = useCallback((groupKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }, []);

  const handleOpenManual = useCallback((pickId: string) => {
    setOpenManualPickId(pickId);
  }, []);

  const handleManualChange = useCallback((pickId: string, value: string) => {
    setManualOddsByPick((prev) => ({ ...prev, [pickId]: value }));
  }, []);

  const handleOpenBuilder = useCallback((pick: MatchPick, game: PlatformGame) => {
    setBuilderTarget({ pick, game });
  }, []);

  const buildTableColumns = useCallback(
    (showMatchMeta: boolean): readonly SofascoreTableColumn<ScreenerItem>[] => [
      {
        key: "pick",
        header: showMatchMeta ? "Partido · Pick" : "Pick",
        sticky: true,
        render: (item) => {
          const { game, pick, liveProgress } = item;
          const unlocked = isPickUnlocked(pick, game.status, viewerRole);
          const periodTag = periodShortTag(item.period);
          const hasNumericLiveBar =
            unlocked &&
            item.isLiveGame &&
            liveProgress !== null &&
            liveProgress.currentValue !== null &&
            liveProgress.targetValue !== null &&
            liveProgress.targetValue > 0;

          return (
            <div
              className="pl-scr-cell-pick"
              data-screener-pick={pick.id}
              data-market-family={item.catalogFamilyId ?? pick.market ?? ""}
            >
              {showMatchMeta ? (
                <div className="pl-scr-match-meta">
                  <LeagueBadge
                    league={game.league}
                    label={game.leagueLabel}
                    logoUrl={game.leagueLogoUrl}
                    size={14}
                  />
                  <span className="truncate">
                    {game.home.shortName} vs {game.away.shortName}
                  </span>
                  <span className="pl-scr-meta-sep" aria-hidden="true">
                    ·
                  </span>
                  <span className="num shrink-0">
                    {item.isSettled && game.score ? (
                      <span className="pl-scr-ft-meta">
                        FT {game.score.home}–{game.score.away}
                      </span>
                    ) : liveProgress ? (
                      <span className="pl-scr-live-badge">
                        {liveProgress.scoreLabel} · {liveProgress.clockLabel}
                      </span>
                    ) : (
                      `${game.dayLabel} ${game.kickoffLocal}`
                    )}
                  </span>
                </div>
              ) : null}

              <div className="pl-scr-pick-head">
                <span className="pl-scr-cat-tag">
                  {pick.categoryLabel}
                  {periodTag ? ` · ${periodTag}` : ""}
                  {item.playerPositionRaw ? ` · ${item.playerPositionRaw}` : ""}
                </span>
                <strong className={`pl-scr-pick-title ${unlocked ? "" : "locked-redact"}`.trim()}>
                  {unlocked ? pick.label : "Pick reservado Pase PitchLab Ultra"}
                </strong>
              </div>

              {hasNumericLiveBar && liveProgress ? (
                <div className="pl-scr-inline-livebar" data-live-progress-bar="">
                  <LivePickProgressBar
                    pickLabel={pick.label}
                    matchLabel={`${game.home.shortName} vs ${game.away.shortName}`}
                    clockLabel={`${liveProgress.scoreLabel} · ${liveProgress.clockLabel}`}
                    actualValue={liveProgress.currentValue ?? 0}
                    targetLine={liveProgress.targetValue ?? 1}
                    unitLabel={inferLiveUnitLabel(liveProgress, game.sport)}
                    direction={inferLiveDirection(pick)}
                    compact
                  />
                </div>
              ) : unlocked && item.isLiveGame && liveProgress ? (
                <span className="pl-scr-live-inline-status num">
                  {liveProgress.scoreLabel} · {liveProgress.clockLabel} · {liveProgress.statusText}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        key: "evidence",
        header: "Evidencia",
        render: (item) => {
          const unlocked = isPickUnlocked(item.pick, item.game.status, viewerRole);
          if (!unlocked) {
            return <span className="pl-scr-ev-fallback">Disponible con Pase Ultra</span>;
          }
          const compactWindows = selectCompactEvidenceWindows(item.evidenceWindows);
          if (compactWindows.length > 0) {
            return <EvidenceWindowPills windows={compactWindows} size="sm" />;
          }
          return (
            <span className="pl-scr-ev-fallback">
              {item.pick.rationale ? item.pick.rationale.slice(0, 68) : "Modelo calibrado Spacetime"}
            </span>
          );
        },
      },
      {
        key: "value",
        header: "Prob · Justo · Casa",
        align: "end",
        numeric: true,
        render: (item) => {
          const unlocked = isPickUnlocked(item.pick, item.game.status, viewerRole);
          if (!unlocked) {
            return (
              <span className="pl-scr-locked-tag">
                <MaestroIcon name="lock" size={12} />
                <span>Ultra</span>
              </span>
            );
          }
          const manualRaw = manualOddsByPick[item.pick.id] ?? "";
          const manualDec = parseManualOddsInput(manualRaw);
          const effectiveHouseDec = manualDec ?? item.houseDecimal;
          const effectiveHouseLabel = manualDec !== null ? "Tu momio" : item.houseLabel;

          return (
            <SofascoreValueCell
              probPct={item.pick.p * 100}
              fairLabel={formatOddsValue(item.pick.fairDecimal, oddsFormat)}
              bestBookLabel={effectiveHouseLabel}
              bestOddsLabel={
                effectiveHouseDec !== null ? formatOddsValue(effectiveHouseDec, oddsFormat) : null
              }
              evPct={null}
            />
          );
        },
      },
      {
        key: "signal",
        header: timing === "settled" ? "Liquidación" : "Señal",
        align: "end",
        render: (item) => {
          const unlocked = isPickUnlocked(item.pick, item.game.status, viewerRole);
          if (item.isSettled) {
            return (
              <div className="pl-scr-settlement-cell num">
                <span
                  className={`pl-scr-settlement-badge is-${item.settlement}`}
                  data-settlement={item.settlement}
                >
                  {settlementLabel(item.settlement)}
                </span>
                {item.game.score ? (
                  <span className="pl-scr-settlement-score">
                    {item.game.score.home}–{item.game.score.away} · FT
                  </span>
                ) : null}
              </div>
            );
          }
          if (!unlocked) {
            return <span className="pl-scr-signal-muted num">—</span>;
          }
          const manualRaw = manualOddsByPick[item.pick.id] ?? "";
          const manualDec = parseManualOddsInput(manualRaw);
          const effectiveValuePct =
            manualDec !== null
              ? computeExpectedValuePct(item.pick.p, manualDec)
              : item.valuePct;
          const effectiveMovement = manualDec !== null ? null : (item.movement?.kind ?? null);

          return (
            <SofascoreSignalPair
              evPct={effectiveValuePct}
              movement={effectiveMovement}
              compact
            />
          );
        },
      },
      {
        key: "actions",
        header: "Acciones",
        align: "end",
        render: (item) => {
          const { game, pick } = item;
          const unlocked = isPickUnlocked(pick, game.status, viewerRole);
          const href = canonicalGameHref(game.league, game);
          const isManualOpen = openManualPickId === pick.id;
          const manualRaw = manualOddsByPick[pick.id] ?? "";

          return (
            <div className="pl-scr-col-actions">
              {unlocked && !item.isSettled ? (
                <>
                  <BetBuilderQuickButton
                    pick={pick}
                    onInspect={(pk) => handleOpenBuilder(pk, game)}
                    compact
                  />
                  {!item.isLiveGame ? <ParlayToggle pick={pick} /> : null}
                  {!item.isLiveGame ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => openComposer(pick)}
                    >
                      Sellar
                    </Button>
                  ) : null}
                  {isManualOpen ? (
                    <label className="inline-flex items-center">
                      <span className="sr-only">Tu momio para {pick.label}</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        enterKeyHint="done"
                        autoComplete="off"
                        placeholder={oddsFormat === "american" ? "-110" : "1.91"}
                        value={manualRaw}
                        onChange={(e) => handleManualChange(pick.id, e.target.value)}
                        data-manual-odds-input={pick.id}
                        className="pl-scr-manual-input num"
                      />
                    </label>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      data-open-manual-odds={pick.id}
                      onClick={() => handleOpenManual(pick.id)}
                    >
                      Mi momio
                    </Button>
                  )}
                </>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                nativeButton={false}
                render={
                  <a
                    href={href}
                    onPointerEnter={() => prefetchRoute(href)}
                    onTouchStart={() => prefetchRoute(href)}
                    onClick={(e) => {
                      e.preventDefault();
                      navigateTo(href);
                    }}
                  />
                }
              >
                <span>Partido</span>
                <MaestroIcon name="arrowRight" size={12} />
              </Button>
            </div>
          );
        },
      },
    ],
    [
      handleManualChange,
      handleOpenBuilder,
      handleOpenManual,
      manualOddsByPick,
      navigateTo,
      oddsFormat,
      openComposer,
      openManualPickId,
      prefetchRoute,
      timing,
      viewerRole,
    ],
  );

  const matchColumns = useMemo(() => buildTableColumns(false), [buildTableColumns]);
  const fullColumns = useMemo(() => buildTableColumns(true), [buildTableColumns]);

  const renderFilterControls = (inSheet: boolean) => (
    <div className={`pl-scr-filter-body ${inSheet ? "is-sheet" : ""}`.trim()}>
      <div className="pl-scr-books-row">
        <span className="pl-scr-sub-label">Casas de referencia</span>
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
      </div>

      <div className="pl-scr-band-row">
        <div className="pl-scr-band-group" role="group" aria-label="Probabilidad Spacetime">
          {BANDS.map((b) => (
            <button
              key={b.id}
              type="button"
              className={`pl-scr-band-btn ${band === b.id ? "is-on" : ""}`.trim()}
              aria-pressed={band === b.id}
              title={b.hint || undefined}
              onClick={() => {
                setActiveViewId(null);
                setPreset("todos");
                setBand(b.id);
                setShown(INITIAL_VISIBLE_PICKS);
              }}
            >
              <span>{b.label}</span>
              <span className="num pl-scr-band-count">{counts[b.id]}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          className={`pl-scr-ev-toggle ${onlyPositiveEdge ? "is-on" : ""}`.trim()}
          aria-pressed={onlyPositiveEdge}
          onClick={() => {
            setActiveViewId(null);
            setOnlyPositiveEdge((v) => !v);
            setShown(INITIAL_VISIBLE_PICKS);
          }}
        >
          Solo EV+ (casa paga más)
        </button>
      </div>

      <div className="pl-scr-selects-grid">
        <label className="pl-scr-field">
          <span>Deporte</span>
          <select
            value={sport}
            onChange={(e) => {
              setActiveViewId(null);
              setSport(parseSportFilter(e.target.value));
              setLeague("all");
              setShown(INITIAL_VISIBLE_PICKS);
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
          <span>Familia de mercado</span>
          <select
            value={family}
            onChange={(e) => {
              setActiveViewId(null);
              setPreset("todos");
              setFamily(parseFamilyFilter(e.target.value));
              setShown(INITIAL_VISIBLE_PICKS);
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

        <label className="pl-scr-field">
          <span>Periodo</span>
          <select
            value={periodFilter}
            onChange={(e) => {
              setActiveViewId(null);
              setPeriodFilter(parsePeriodFilter(e.target.value));
              setShown(INITIAL_VISIBLE_PICKS);
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

        <label className="pl-scr-field">
          <span>Posición</span>
          <select
            value={positionFilter}
            onChange={(e) => {
              setActiveViewId(null);
              setPositionFilter(parsePositionFilter(e.target.value));
              setShown(INITIAL_VISIBLE_PICKS);
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

        <label className="pl-scr-field">
          <span>Liga</span>
          <select
            value={league}
            onChange={(e) => {
              setActiveViewId(null);
              setLeague(e.target.value);
              setShown(INITIAL_VISIBLE_PICKS);
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

        {timing === "upcoming" ? (
          <label className="pl-scr-field">
            <span>Agenda</span>
            <select
              value={windowFilter}
              onChange={(e) => {
                setActiveViewId(null);
                setWindowFilter(parseWindowFilter(e.target.value));
                setShown(INITIAL_VISIBLE_PICKS);
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
        ) : null}

        <label className="pl-scr-field">
          <span>Ordenar por</span>
          <select
            value={sort}
            onChange={(e) => {
              setActiveViewId(null);
              setSort(parseSortExtended(e.target.value));
            }}
            className="pl-scr-select"
          >
            <option value="ev">Valor real EV+</option>
            <option value="p">Probabilidad Spacetime</option>
            <option value="movimiento">Movimiento de línea</option>
            <option value="hora">Próximo inicio</option>
            <option value="relevancia">Balance prob. y momio</option>
            <option value="momio">Mayor momio</option>
          </select>
        </label>
      </div>

      <NonLinearOddsSlider
        minStep={minOddsStep}
        maxStep={maxOddsStep}
        oddsFormat={oddsFormat}
        compact={inSheet}
        onChange={(nextMin, nextMax) => {
          setActiveViewId(null);
          setMinOddsStep(nextMin);
          setMaxOddsStep(nextMax);
          setShown(INITIAL_VISIBLE_PICKS);
        }}
      />
    </div>
  );

  const renderLiveTrackerCard = (compactStrip: boolean) => {
    const displayed = compactStrip ? liveTrackedItems.slice(0, 3) : liveTrackedItems;
    return (
      <SofascoreCard
        title={compactStrip ? "Tus picks activos en vivo" : "Seguimiento en vivo de tus picks"}
        meta={
          compactStrip ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setTiming("live");
                setShown(INITIAL_VISIBLE_PICKS);
              }}
            >
              Ver tablero en vivo ({liveTrackedItems.length})
            </Button>
          ) : (
            `${liveTrackedItems.length} ${liveTrackedItems.length === 1 ? "seguido" : "seguidos"}`
          )
        }
        density="compact"
      >
        {displayed.length > 0 ? (
          <div className="pl-scr-live-tracker-grid" data-live-tracker-strip="">
            {displayed.map((tracked) => (
              <div key={tracked.id} className="pl-scr-live-tracker-card">
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
                  compact={compactStrip}
                />
                {!compactStrip && tracked.pickKind === "parlay" && tracked.legs.length > 1 ? (
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
  };

  return (
    <AtmosphereStage activePath="/app/picks">
      <ClubWorkspaceShell activePath="/app/picks">
        <div
          className="pl-scr-root space-y-3.5"
          data-catalog-wired={
            initialCatalogs && Object.keys(initialCatalogs).length > 0 ? "true" : "false"
          }
        >
          <header className="pl-scr-header">
            <div className="min-w-0">
              <h1 className="pl-scr-h1">Explorar picks</h1>
              <p className="pl-scr-lead">
                Screener cuantitativo de 34 familias con probabilidad Spacetime, momio justo, mejor casa, evidencia real y liquidación auditable en FT.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              nativeButton={false}
              render={
                <a
                  href="/app/account?tab=prefs#pl-prefs-picks"
                  onClick={(e) => {
                    e.preventDefault();
                    navigateTo("/app/account?tab=prefs#pl-prefs-picks");
                  }}
                />
              }
            >
              <MaestroIcon name="sliders" size={13} />
              <span>Mis casas ({preferredBooks.length})</span>
            </Button>
          </header>

          {timing !== "live" && liveTrackedItems.length > 0
            ? renderLiveTrackerCard(true)
            : null}

          <SavedViewsBar
            views={savedScreenerViews}
            activeViewId={activeViewId}
            onApply={applySavedView}
            onSave={handleSaveView}
            onDelete={handleDeleteSavedView}
          />

          <div className="pl-scr-tabs-bar" data-screener-timing="">
            <SofascoreTabs
              items={tabItems}
              value={timing}
              onChange={(nextId) => {
                setTiming(parseTimingMode(nextId));
                setShown(INITIAL_VISIBLE_PICKS);
              }}
              variant="underline"
              ariaLabel="Estado de los picks"
            />
          </div>

          <SofascoreFilterBar
            searchValue={searchQuery}
            onSearchChange={(next) => {
              setSearchQuery(next);
              setShown(INITIAL_VISIBLE_PICKS);
            }}
            searchPlaceholder="Buscar equipo, liga, mercado o jugador…"
            trailing={
              <div className="pl-scr-command-right">
                <span className="pl-scr-count-badge num" data-screener-result-count="">
                  {rows.length} {rows.length === 1 ? "pick" : "picks"}
                </span>
                <button
                  type="button"
                  className="pl-scr-mobile-filter-btn"
                  aria-haspopup="dialog"
                  aria-expanded={mobileSheetOpen}
                  data-mobile-filters-toggle=""
                  onClick={() => setMobileSheetOpen(true)}
                >
                  <MaestroIcon name="sliders" size={14} />
                  <span>Filtros{activeAdvancedCount > 0 ? ` (${activeAdvancedCount})` : ""}</span>
                </button>
              </div>
            }
          >
            <div
              className="pl-scr-group-seg"
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
          </SofascoreFilterBar>

          <div
            className="pl-scr-quick-strip"
            role="group"
            aria-label="Atajos de exploración"
            data-finder-quick-chips=""
          >
            {QUICK_CHIPS.map((chip) => {
              const active = preset === chip.id && activeViewId === null;
              return (
                <button
                  key={chip.id}
                  type="button"
                  data-finder-chip={chip.id}
                  aria-pressed={active}
                  onClick={() => applyQuickPreset(chip.id)}
                  className={`pl-scr-quick-chip ${active ? "is-on" : ""}`.trim()}
                >
                  {chip.label}
                </button>
              );
            })}

            {activeAdvancedCount > 0 ? (
              <button
                type="button"
                className="pl-scr-clear-chip"
                onClick={resetAllFilters}
              >
                <MaestroIcon name="x" size={12} />
                <span>Limpiar ({activeAdvancedCount})</span>
              </button>
            ) : null}
          </div>

          <section
            id="pl-finder-advanced-panel"
            className="pl-scr-desktop-filters"
            aria-label="Filtros avanzados del buscador"
          >
            <SofascoreCard density="compact">{renderFilterControls(false)}</SofascoreCard>
          </section>

          <div
            role="tabpanel"
            aria-label={
              timing === "live"
                ? "Picks activos y en vivo"
                : timing === "settled"
                  ? "Picks liquidados FT"
                  : "Próximos picks"
            }
            className="space-y-3.5"
          >
            {timing === "live" ? renderLiveTrackerCard(false) : null}

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
                        : "No hay picks que coincidan con los filtros seleccionados"
                  }
                  description={
                    timing === "live"
                      ? "Explora los próximos partidos o revisa los picks liquidados FT auditables."
                      : "Ajusta la liga, familia de mercado, periodo o rango de momios para ampliar resultados."
                  }
                  actionLabel={
                    activeAdvancedCount > 0
                      ? "Quitar filtros"
                      : timing !== "upcoming"
                        ? "Ver próximos picks"
                        : undefined
                  }
                  onAction={
                    activeAdvancedCount > 0
                      ? resetAllFilters
                      : timing !== "upcoming"
                        ? () => setTiming("upcoming")
                        : undefined
                  }
                />
              </div>
            ) : groupMode === "match" ? (
              <div className="pl-scr-groups" data-screener-view="match">
                {groupedByMatch.map(({ game, liveEntry, items }) => {
                  const isCollapsed = collapsedGroups.has(`m:${game.id}`);
                  const href = canonicalGameHref(game.league, game);
                  const liveScore = liveEntry?.score ?? game.score;
                  const liveClock =
                    game.status === "FT"
                      ? "FT"
                      : (liveEntry?.clock ?? (game.status === "LIVE" ? "En vivo" : null));

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
                          <LeagueBadge
                            league={game.league}
                            label={game.leagueLabel}
                            logoUrl={game.leagueLogoUrl}
                            size={16}
                          />
                          <div className="pl-scr-group-meta min-w-0">
                            <strong className="pl-scr-group-title truncate">
                              {game.home.shortName} vs {game.away.shortName}
                            </strong>
                            <span className="pl-scr-group-sub num">
                              {game.leagueLabel} ·{" "}
                              {liveScore && liveClock
                                ? `${liveScore.home}–${liveScore.away} · ${liveClock}`
                                : `${game.dayLabel} ${game.kickoffLocal}`}
                            </span>
                          </div>
                          <span className="pl-scr-group-count num">
                            {items.length} {items.length === 1 ? "pick" : "picks"}
                          </span>
                          <MaestroIcon
                            name="chevronDown"
                            size={15}
                            className={`pl-ev-group-chev ${isCollapsed ? "is-collapsed" : ""}`.trim()}
                          />
                        </button>

                        <Button
                          variant="secondary"
                          size="sm"
                          nativeButton={false}
                          render={
                            <a
                              href={href}
                              onPointerEnter={() => prefetchRoute(href)}
                              onTouchStart={() => prefetchRoute(href)}
                              onClick={(e) => {
                                e.preventDefault();
                                navigateTo(href);
                              }}
                            />
                          }
                        >
                          <span>Ficha</span>
                          <MaestroIcon name="arrowRight" size={12} />
                        </Button>
                      </header>

                      {!isCollapsed ? (
                        <SofascoreTable
                          caption={`Picks de ${game.home.shortName} vs ${game.away.shortName}`}
                          columns={matchColumns}
                          rows={items}
                          rowKey={(item) => item.pick.id}
                          density="compact"
                          className="pl-scr-table-wrap is-grouped"
                        />
                      ) : null}
                    </section>
                  );
                })}
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
                            className={`pl-ev-group-chev ${isCollapsed ? "is-collapsed" : ""}`.trim()}
                          />
                        </button>
                      </header>

                      {!isCollapsed ? (
                        <SofascoreTable
                          caption={`Picks de ${grp.label}`}
                          columns={fullColumns}
                          rows={grp.items}
                          rowKey={(item) => item.pick.id}
                          density="compact"
                          className="pl-scr-table-wrap is-grouped"
                        />
                      ) : null}
                    </section>
                  );
                })}
              </div>
            ) : (
              <div data-screener-view="flat">
                <SofascoreTable
                  caption={`${rows.length} picks filtrados`}
                  columns={fullColumns}
                  rows={visibleRows}
                  rowKey={(item) => item.pick.id}
                  density="compact"
                  className="pl-scr-table-wrap"
                />
              </div>
            )}

            {rows.length > shown ? (
              <div className="flex justify-center pt-1">
                <Button
                  type="button"
                  variant="secondary"
                  size="default"
                  className="num"
                  onClick={() => setShown((n) => n + PICKS_PAGE_STEP)}
                >
                  Ver más ({rows.length - shown})
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        {mobileSheetOpen ? (
          <MobileFiltersSheet
            resultCount={rows.length}
            onReset={resetAllFilters}
            onClose={() => setMobileSheetOpen(false)}
          >
            {renderFilterControls(true)}
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
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
