import {
  MAX_POSITIVE_DECIMAL_ODDS,
  cleanTeamRouteSlug,
  getLeagueCapability,
  isPermittedMarketQuoteBook,
  isSafePublicLabel,
  parseStrictFiniteNumber,
  probabilityToFairOdds,
  slugifyPlayerName,
  type TeamSquadEntry,
} from "@pitchlab/contracts";
import {
  buildMatchEpistemicSummaryV5,
  computeConformalEpistemicBandV5,
  isDoubtfulAvailabilityV6,
  isHardBlockedAvailabilityV6,
  projectUsPlayerPropV6,
  soccer57NormalCdfV60,
  type EpistemicProbabilityBandV5,
  type GoalkeeperLinkedMatchOutcomeV6,
  type RawPlayerStatColumnV6,
  type SgpLegInput,
  type UsPropsSportV6,
} from "@pitchlab/spacetime/v6";
import {
  FOOTBALL_PROP_MIN_MINUTES,
  NBA_PROP_DEFAULT_MIN_MINUTES,
  buildCatalogPickEvidence,
  buildMatchPicksCatalog,
  buildNumericSeriesEvidenceWindows,
  catalogPickItemToMatchPick,
  catalogPickToBetBuilderLeg,
  checkBetBuilderCompatibility,
  computePickPricing,
  evaluateBetBuilder,
  getMarketFamilySpec,
  gradeCatalogPick,
  isMarketBookLabelPermitted,
  isMarketQuoteFreshWithin72h,
  resolveRefereeEvidenceSignal,
  resolveXgEvidenceSignal,
  scoreRecommendedCatalogPick,
  type BetBuilderEvaluation,
  type BetBuilderLegInput,
  type CatalogBuildContext,
  type CatalogEvidenceBullet,
  type CatalogPickItem,
  type FootballPlayerPropCandidateInput,
  type MarketFamilyId,
  type MatchFinalCountStats,
  type MatchPicksCatalog,
  type NbaPlayerPropCandidateInput,
  type PickAxisKey,
  type PickDirection,
  type PickSettlementStatus,
  type PlayerPropMeta,
  type TeamMatchEvidenceRecord,
} from "@pitchlab/ui/picks-catalog";
import type {
  BookQuoteItem,
  EarlyPayoutSummaryView,
  EpistemicBandView,
  MatchIntelligenceV5View,
  MatchPick,
  MicroCountsV5View,
  PlatformGame,
  PlatformMarketRow,
  PlayerPropItem,
  SgpCopulaAuditView,
} from "@pitchlab/ui/types";
import {
  CANONICAL_GK_SAVES_LINES_V6,
  CANONICAL_SHOT_LINES_V6,
  PROPS_V6_SHARP_EV_CAP_PCT,
  PROPS_V6_SOFT_EV_CAP_PCT,
  checkStrictPlayerMinutesAndAvailabilityGuardV6,
  deriveMatchPlayerPropsV6,
  evaluateCoupledFootballShotsV6,
  evaluateGoalkeeperSavesSgpComboV6,
  evaluateGoalkeeperSavesV6,
  evaluateGuardedPropMarketQuoteV6,
  evaluateGuardedUsPlayerPropsV6,
  getPropsV6ModelArtifact,
  isGoalkeeperSavesLabel,
  readLeagueInjuriesMap,
  resolveFootballTeamExpectedVolumeV6,
  type DerivedMatchPlayerPropV6,
  type GoalkeeperSavesSgpEvalResultV6,
} from "./props-explorer";
import { resolveSnapshotsRoot } from "./snapshots";
import {
  PLAYABLE_ODDS_MAX_V60,
  PLAYABLE_ODDS_MIN_V60,
  calibratePlayableOddsV6,
  deriveAsianHandicapFromMatrixV6,
  evaluateGoalkeeperSavesSgpServerV6,
  evaluateNflAltSpreadV6,
  evaluateNflAltTotalV6,
  evaluatePlayerLinkedSgpV6,
  evaluateSgpCopulaV6,
  evaluateSoccer57V6Match,
  evaluateUsMultisportV6Match,
  getMultisportArtifactV6,
  getUnifiedArtifactsBundleV6,
  isEarlyPayoutValidatedOosV6,
  isSoccer57LeagueV6,
  solveNflMarginFromWinProbV6,
  type MultiSportLeagueV60,
  type Soccer57V6MatchEvaluation,
  type UsMultisportV6MatchEvaluation,
  type VennAbersPlayableEvaluationV60,
} from "./spacetime-v6";

export interface GoalkeeperCatalogCandidateInputV6 {
  readonly playerName: string;
  readonly playerSlug?: string;
  readonly photoKey?: string | null;
  readonly teamSide: "home" | "away";
  readonly teamName: string;
  readonly teamSlug?: string | null;
  readonly saves: number;
  readonly shotsFaced: number;
  readonly goalsConceded: number;
  readonly appearances: number;
  readonly subIns?: number;
  readonly avgMinutes: number | null | undefined;
  readonly availability?: string | null;
  readonly injuryStatus?: string | null;
  readonly lineupStatus?: "confirmed" | "probable" | "unknown";
  readonly marketQuotesByLine?: Readonly<
    Record<
      number,
      {
        readonly overDecimal?: number | null;
        readonly underDecimal?: number | null;
        readonly bookLabel?: string | null;
        readonly capturedAtUtc?: string | null;
      }
    >
  >;
}

export interface UsPlayerCatalogCandidateInputV6 {
  readonly sport: UsPropsSportV6;
  readonly playerName: string;
  readonly playerSlug?: string | null;
  readonly teamSide: "home" | "away";
  readonly teamSlug: string;
  readonly teamName: string;
  readonly positionLabel?: string | null;
  readonly availability?: string | null;
  readonly injuryStatus?: string | null;
  readonly injuryNote?: string | null;
  readonly seasonMetrics: readonly RawPlayerStatColumnV6[];
  readonly recentGames: readonly { readonly stats?: readonly RawPlayerStatColumnV6[] }[];
  readonly explicitAvgMinutes?: number | null;
  readonly oppFactor?: number;
  readonly marketQuotesByMetric?: Readonly<
    Record<
      string,
      {
        readonly overDecimal?: number | null;
        readonly bookLabel?: string | null;
      }
    >
  >;
}

export interface ServerMatchPicksCatalogOptions {
  readonly fullAccess: boolean;
  readonly markets?: readonly PlatformMarketRow[];
  readonly v5?: MatchIntelligenceV5View | null;
  readonly playerProps?: readonly PlayerPropItem[];
  readonly footballPlayers?: readonly FootballPlayerPropCandidateInput[];
  readonly footballGoalkeepers?: readonly GoalkeeperCatalogCandidateInputV6[];
  readonly nbaPlayers?: readonly NbaPlayerPropCandidateInput[];
  readonly homeSquad?: TeamSquadEntry | null;
  readonly awaySquad?: TeamSquadEntry | null;
  readonly injuryStatusByTeamPlayer?: ReadonlyMap<string, string>;
  readonly homeHistory?: readonly TeamMatchEvidenceRecord[];
  readonly awayHistory?: readonly TeamMatchEvidenceRecord[];
  readonly f5Score?: { readonly home: number; readonly away: number } | null;
  readonly finalStats?: MatchFinalCountStats | null;
  readonly unlockedPickIds?: ReadonlySet<string>;
  readonly families?: readonly MarketFamilyId[];
  readonly deVigPreference?: "auto" | "proportional" | "shin" | "power";
  readonly maxPicksPerFamily?: number;
  readonly maxTotalPicks?: number;
  readonly maxVisitorLockedSlots?: number;
  readonly compact?: boolean;
  readonly preserveAll?: boolean;
  readonly nflAltSpreadLines?: readonly number[];
  readonly nflAltTotalLines?: readonly number[];
  readonly enableVennAbersPlayable?: boolean;
  readonly nowIso?: string;
}

const DEFAULT_MAX_PICKS_PER_FAMILY = 4;
const DEFAULT_MAX_TOTAL_PICKS = 48;
const DEFAULT_MAX_VISITOR_LOCKED_SLOTS = 8;
const MAX_DEVIG_PROB_DIVERGENCE_PTS = 12;
const MAX_SHARP_EV_PCT = PROPS_V6_SHARP_EV_CAP_PCT;
const MAX_SOFT_EV_PCT = PROPS_V6_SOFT_EV_CAP_PCT;
const MAX_PARLAY_LEGS_V6 = 6;
const SHARP_BOOK_TOKENS = ["pinnacle", "betcris", "betonline"] as const;
const SHARP_COMPANION_BOOK_PRIORITY: readonly string[] = [
  "pinnacle",
  "betcris",
  "betonline",
  "betonlineag",
];
const SOCCER_AH_LINES_V6: readonly number[] = [
  -2.5, -2.0, -1.5, -1.0, -0.5, 0.0, 0.5, 1.0, 1.5, 2.0, 2.5,
];
const NFL_DEFAULT_ALT_SPREAD_LINES: readonly number[] = [
  -15.5, -10.5, -7.5, -7.0, -3.5, -3.0, 3.0, 3.5, 7.0, 7.5, 10.5, 15.5,
];
const NFL_DEFAULT_ALT_TOTAL_LINES: readonly number[] = [
  30.5, 37.5, 41.0, 44.5, 47.5, 51.5,
];
const SPANISH_UNIT_RE =
  /\b(goles?|gol|tiros?|remates?|atajadas?|c[oó]rners?|tarjetas?|faltas?|puntos?|carreras?|rebotes?|asistencias?|triples?|ponches?|hits?|bases?|jonrones?|entradas?|yardas?|pases?|recepciones?|touchdowns?|acarreos?|targets?|pts|reb|ast|3pm|sog|sot)\b/i;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function clampProb(p: number): number {
  return clamp(Number.isFinite(p) ? p : 0.5, 0.01, 0.99);
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function round4(v: number): number {
  return Math.round(v * 10_000) / 10_000;
}

function normalizeZero(v: number): number {
  return v === 0 ? 0 : v;
}

function roundToHalf(v: number): number {
  return Math.round(v - 0.5) + 0.5;
}

function formatSignedLine(line: number): string {
  const clean = normalizeZero(line);
  const str = Number.isInteger(clean) ? `${clean}.0` : String(clean);
  return clean > 0 ? `+${str}` : str;
}

function decimalToAmericanOdds(decimal: number): number {
  const safe = Math.max(1.01, decimal);
  if (safe >= 2.0) return Math.round((safe - 1) * 100);
  return -Math.round(100 / (safe - 1));
}

function normalizeToken(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeBookKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function isSharpCatalogBook(bookLabel?: string | null): boolean {
  if (!bookLabel) return false;
  const norm = bookLabel
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  if (norm.length === 0) return false;
  return SHARP_BOOK_TOKENS.some((token) => norm.includes(token));
}

function isPermittedBookLabelV6(bookLabel: string | null | undefined): boolean {
  if (typeof bookLabel !== "string") return false;
  const trimmed = bookLabel.trim();
  if (trimmed.length === 0) return false;
  const primary = trimmed.split(/[·|]/)[0]?.trim() ?? trimmed;
  return (
    isSafePublicLabel(trimmed) &&
    isMarketBookLabelPermitted(trimmed) &&
    isPermittedMarketQuoteBook(primary, trimmed)
  );
}

function hasExplicitSpanishUnit(label: string): boolean {
  if (!/\d/.test(label)) return true;
  return SPANISH_UNIT_RE.test(label);
}

function toBandView(band: EpistemicProbabilityBandV5): EpistemicBandView {
  return {
    pPoint: round4(band.pPoint),
    pLower90: round4(band.pLower90),
    pUpper90: round4(band.pUpper90),
    halfWidth90: round4(band.halfWidth90),
    conservativeFairDecimal: round2(band.conservativeFairOddsFromLower90.decimal),
    grade:
      band.confidenceGrade === "high_sample_stability"
        ? "high"
        : band.confidenceGrade === "moderate_uncertainty"
          ? "moderate"
          : "elevated",
  };
}

function formatConformal90BulletEs(band: EpistemicProbabilityBandV5): string {
  const gradeLabel =
    band.confidenceGrade === "high_sample_stability"
      ? "muestra estable"
      : band.confidenceGrade === "moderate_uncertainty"
        ? "incertidumbre moderada"
        : "varianza elevada";
  return `Banda 90 %: ${(band.pLower90 * 100).toFixed(1)}–${(band.pUpper90 * 100).toFixed(1)} % (${gradeLabel})`;
}

export interface PlayableVennAbersCalibrationResultV6 {
  readonly pRaw: number;
  readonly pCalibrated: number;
  readonly fairOdds: number;
  readonly inPlayableZone: boolean;
  readonly applied: boolean;
  readonly vennAbers: VennAbersPlayableEvaluationV60;
}

export function applyVennAbersPlayableCalibrationV6(
  pRaw: number,
  league: string,
): PlayableVennAbersCalibrationResultV6 {
  const safeRaw = round4(clampProb(pRaw));
  const va = calibratePlayableOddsV6({ pRaw: safeRaw, league });
  const chosenP = va.inPlayableZone ? round4(clampProb(va.pCalibrated)) : safeRaw;
  const fair = probabilityToFairOdds(chosenP);
  const fairOdds = Math.max(1.01, fair.decimal);
  return Object.freeze({
    pRaw: safeRaw,
    pCalibrated: chosenP,
    fairOdds,
    inPlayableZone: va.inPlayableZone,
    applied: va.inPlayableZone,
    vennAbers: va,
  });
}

export function calibrateVennAbersBinaryPartitionV6(
  pFirstRaw: number,
  pSecondRaw: number,
  league: string,
  applyVa: boolean = true,
): { readonly first: number; readonly second: number } {
  const safeA = Number.isFinite(pFirstRaw) ? Math.max(0, pFirstRaw) : 0.5;
  const safeB = Number.isFinite(pSecondRaw) ? Math.max(0, pSecondRaw) : 0.5;
  const rawSum = safeA + safeB;
  const normA = rawSum > 0 ? clampProb(safeA / rawSum) : 0.5;
  const normB = clampProb(1 - normA);

  if (!applyVa) {
    const first = round4(normA);
    const second = round4(clampProb(1 - first));
    return Object.freeze({ first, second });
  }

  const high = Math.max(normA, normB);
  const low = clampProb(1 - high);
  const vaHigh = applyVennAbersPlayableCalibrationV6(high, league);
  const vaLow = applyVennAbersPlayableCalibrationV6(low, league);

  let calibratedHigh: number;
  if (vaHigh.inPlayableZone && vaLow.inPlayableZone) {
    const calSum = vaHigh.pCalibrated + vaLow.pCalibrated;
    calibratedHigh = calSum > 0 ? vaHigh.pCalibrated / calSum : high;
  } else if (vaHigh.inPlayableZone) {
    calibratedHigh = vaHigh.pCalibrated;
  } else if (vaLow.inPlayableZone) {
    calibratedHigh = 1 - vaLow.pCalibrated;
  } else {
    calibratedHigh = high;
  }

  const pHigh = round4(clampProb(calibratedHigh));
  const pLow = round4(clampProb(1 - pHigh));
  return normA >= normB
    ? Object.freeze({ first: pHigh, second: pLow })
    : Object.freeze({ first: pLow, second: pHigh });
}

export function calibrateVennAbersThreeWayPartitionV6(
  pHomeRaw: number,
  pDrawRaw: number,
  pAwayRaw: number,
  league: string,
  applyVa: boolean = true,
): {
  readonly home: number;
  readonly draw: number;
  readonly away: number;
  readonly dc1x: number;
  readonly dcx2: number;
  readonly dc12: number;
} {
  const sH = Number.isFinite(pHomeRaw) ? Math.max(0, pHomeRaw) : 0.42;
  const sD = Number.isFinite(pDrawRaw) ? Math.max(0, pDrawRaw) : 0.27;
  const sA = Number.isFinite(pAwayRaw) ? Math.max(0, pAwayRaw) : 0.31;
  const rawSum = Math.max(sH + sD + sA, 1e-9);
  const nH = clampProb(sH / rawSum);
  const nD = clampProb(sD / rawSum);
  const nA = clampProb(sA / rawSum);

  const cH = applyVa ? applyVennAbersPlayableCalibrationV6(nH, league).pCalibrated : nH;
  const cD = applyVa ? applyVennAbersPlayableCalibrationV6(nD, league).pCalibrated : nD;
  const cA = applyVa ? applyVennAbersPlayableCalibrationV6(nA, league).pCalibrated : nA;
  const calSum = Math.max(cH + cD + cA, 1e-9);

  let home = round4(clamp(cH / calSum, 0.01, 0.98));
  let draw = round4(clamp(cD / calSum, 0.01, 0.98));
  let away = round4(1 - home - draw);
  if (away < 0.01) {
    const excess = 0.01 - away;
    if (home >= draw) {
      home = round4(Math.max(0.01, home - excess));
    } else {
      draw = round4(Math.max(0.01, draw - excess));
    }
    away = round4(Math.max(0.01, 1 - home - draw));
  }

  return Object.freeze({
    home,
    draw,
    away,
    dc1x: round4(clampProb(home + draw)),
    dcx2: round4(clampProb(draw + away)),
    dc12: round4(clampProb(home + away)),
  });
}

export function redactCatalogPickForVisitor(
  item: CatalogPickItem,
  slotIdx?: number,
): CatalogPickItem {
  const opaqueId =
    typeof slotIdx === "number" && Number.isInteger(slotIdx) && slotIdx >= 0
      ? `${item.gameId}__locked__${item.family}__${slotIdx}`
      : `${item.gameId}__locked__${item.family}`;
  return {
    id: opaqueId,
    gameId: item.gameId,
    league: item.league,
    leagueLabel: item.leagueLabel,
    sport: item.sport,
    matchLabel: item.matchLabel,
    kickoffUtc: item.kickoffUtc,
    kickoffLocal: item.kickoffLocal,
    gameStatus: item.gameStatus,
    family: item.family,
    familyLabel: item.familyLabel,
    category: item.category,
    axis: item.family,
    selectionKey: "locked",
    label: "Selección reservada Pase PitchLab Ultra",
    line: null,
    direction: "combo",
    pricing: {
      p: 0,
      fairOdds: 0,
      fairAmerican: 0,
      marketDecimal: null,
      marketAmerican: null,
      marketBookLabel: null,
      marketCapturedAtUtc: null,
      deVigMarketProb: null,
      deVigMethod: "none",
      overroundPct: null,
      evPct: null,
      edgePts: null,
      noVigEdgePts: null,
      valueLabel: null,
      hasPositiveValue: false,
    },
    evidence: {
      windows: [],
      xgSignal: null,
      refereeSignal: null,
      bullets: [],
      avgObservedRatePct: null,
    },
    settlement: "pending",
    engineName: "PitchLab Spacetime v6.0",
    isPrimaryModelPick: false,
    isDerived: false,
    conflictGroup: "independent",
    playerMeta: null,
    isDailyOpenPromo: false,
    isTipsterWeeklyOpen: false,
    isRedacted: true,
    recommendationScore: 0,
    recommendationTier: "playable",
    isRecommendedByModel: false,
    convergenceCount: 0,
    pickOfTheDayReason: null,
    projectedScoreLabel: null,
  };
}

export function isHardAnomalousCatalogPick(item: CatalogPickItem): boolean {
  const { p, marketDecimal, deVigMarketProb, noVigEdgePts, evPct, edgePts, marketBookLabel } =
    item.pricing;
  const evLimit = isSharpCatalogBook(marketBookLabel) ? MAX_SHARP_EV_PCT : MAX_SOFT_EV_PCT;
  if (
    deVigMarketProb !== null &&
    Number.isFinite(deVigMarketProb) &&
    Math.abs(p - deVigMarketProb) * 100 > MAX_DEVIG_PROB_DIVERGENCE_PTS
  ) {
    return true;
  }
  if (
    noVigEdgePts !== null &&
    Number.isFinite(noVigEdgePts) &&
    Math.abs(noVigEdgePts) > MAX_DEVIG_PROB_DIVERGENCE_PTS
  ) {
    return true;
  }
  if (evPct !== null && Number.isFinite(evPct) && evPct > evLimit) {
    return true;
  }
  if (
    edgePts !== null &&
    Number.isFinite(edgePts) &&
    edgePts > MAX_DEVIG_PROB_DIVERGENCE_PTS
  ) {
    return true;
  }
  if (marketDecimal !== null && Number.isFinite(marketDecimal) && marketDecimal >= 1.01) {
    const rawEv = (p * marketDecimal - 1) * 100;
    if (rawEv > evLimit) return true;
  }
  return false;
}

interface SameBookQuoteEntry {
  readonly decimal: number;
  readonly bookLabel: string;
  readonly capturedAtUtc: string | null;
  readonly bookQuotes: readonly BookQuoteItem[];
}

function parseLineFromSelectionKey(key: string): number | null {
  const trimmed = key.trim().toLowerCase();
  const direct = trimmed.match(/(?:_|\s)([+-]?\d+(?:\.\d+)?)$/);
  if (direct?.[1]) {
    const parsed = parseStrictFiniteNumber(direct[1]);
    if (parsed !== null) return parsed;
  }
  const underscore = trimmed.match(/(?:_|\s)([+-]?\d+)_(\d+)$/);
  if (underscore?.[1] && underscore?.[2]) {
    const parsed = parseStrictFiniteNumber(`${underscore[1]}.${underscore[2]}`);
    if (parsed !== null) return parsed;
  }
  return null;
}

function selectPermittedFreshBookQuotesV6(
  bookQuotes: readonly BookQuoteItem[] | undefined,
  nowIso: string | null,
): readonly BookQuoteItem[] {
  if (!bookQuotes || bookQuotes.length === 0) return [];
  const valid = bookQuotes
    .filter(
      (q) =>
        typeof q.decimal === "number" &&
        Number.isFinite(q.decimal) &&
        q.decimal >= 1.01 &&
        q.decimal <= MAX_POSITIVE_DECIMAL_ODDS &&
        isSafePublicLabel(q.bookLabel) &&
        isPermittedMarketQuoteBook(q.book, q.bookLabel) &&
        isMarketQuoteFreshWithin72h(q.capturedAtUtc, nowIso),
    )
    .slice()
    .sort((a, b) => b.decimal - a.decimal);
  return valid.map((q, idx) => (idx === 0 ? { ...q, isBest: true } : { ...q, isBest: false }));
}

function buildSameBookQuoteIndexV6(
  markets: readonly PlatformMarketRow[],
  nowIso: string | null,
): Map<string, SameBookQuoteEntry> {
  const index = new Map<string, SameBookQuoteEntry>();
  const put = (key: string, entry: SameBookQuoteEntry) => {
    if (!index.has(key)) index.set(key, entry);
  };

  for (const row of markets) {
    const cleanQuotes = selectPermittedFreshBookQuotesV6(row.bookQuotes, nowIso);
    const bestQuote = cleanQuotes[0] ?? null;
    const rawBook = row.quoteBookLabel?.trim() ?? "";
    const fallbackValid =
      typeof row.currentDecimal === "number" &&
      Number.isFinite(row.currentDecimal) &&
      row.currentDecimal >= 1.01 &&
      row.currentDecimal <= MAX_POSITIVE_DECIMAL_ODDS &&
      isPermittedBookLabelV6(rawBook) &&
      isMarketQuoteFreshWithin72h(row.quoteCapturedAtUtc, nowIso);

    const decimal = bestQuote ? bestQuote.decimal : fallbackValid ? row.currentDecimal : null;
    const bookLabel = bestQuote ? bestQuote.bookLabel : fallbackValid ? rawBook : null;
    const capturedAtUtc = bestQuote
      ? bestQuote.capturedAtUtc
      : fallbackValid
        ? (row.quoteCapturedAtUtc ?? null)
        : null;
    if (decimal === null || !bookLabel) continue;

    const entry: SameBookQuoteEntry = {
      decimal,
      bookLabel,
      capturedAtUtc,
      bookQuotes: cleanQuotes,
    };

    const m = row.market.trim().toLowerCase();
    const s = row.selection.trim().toLowerCase();
    const explicitLine =
      typeof row.line === "number" && Number.isFinite(row.line) ? row.line : null;
    const resolvedLine = explicitLine ?? parseLineFromSelectionKey(s) ?? parseLineFromSelectionKey(m);

    if (resolvedLine !== null) {
      const lStr = String(resolvedLine);
      put(`${m}|${s}|${lStr}`, entry);
      const baseSel = s.replace(/_[+-]?\d+(?:[._]\d+)?$/, "");
      if (baseSel && baseSel !== s) {
        put(`${m}|${baseSel}|${lStr}`, entry);
      }
    } else {
      put(`${m}|${s}`, entry);
    }
  }

  return index;
}

function lookupQuoteV6(
  index: ReadonlyMap<string, SameBookQuoteEntry>,
  keys: readonly string[],
): SameBookQuoteEntry | null {
  for (const key of keys) {
    const hit = index.get(key);
    if (hit && hit.decimal >= 1.01) return hit;
  }
  return null;
}

function resolveSameBookCompanionDecimalsV6(
  legs: ReadonlyArray<SameBookQuoteEntry | null>,
): readonly number[] | null {
  if (legs.length < 2) return null;
  const present: SameBookQuoteEntry[] = [];
  for (const leg of legs) {
    if (!leg || !Number.isFinite(leg.decimal) || leg.decimal < 1.01) return null;
    present.push(leg);
  }

  const legBookMaps = present.map((leg) => {
    const map = new Map<string, number>();
    for (const q of leg.bookQuotes) {
      if (!Number.isFinite(q.decimal) || q.decimal < 1.01) continue;
      if (!isPermittedMarketQuoteBook(q.book, q.bookLabel)) continue;
      const key = normalizeBookKey(q.book || q.bookLabel);
      if (key && !map.has(key)) map.set(key, q.decimal);
    }
    if (map.size === 0 && isPermittedBookLabelV6(leg.bookLabel)) {
      const primary = normalizeBookKey(leg.bookLabel.split(/[·|]/)[0] ?? leg.bookLabel);
      if (primary) map.set(primary, leg.decimal);
    }
    return map;
  });

  const first = legBookMaps[0];
  if (!first) return null;
  const commonBooks: string[] = [];
  for (const bookKey of first.keys()) {
    if (legBookMaps.every((m) => m.has(bookKey))) {
      commonBooks.push(bookKey);
    }
  }
  if (commonBooks.length === 0) return null;

  commonBooks.sort((a, b) => {
    const pa = SHARP_COMPANION_BOOK_PRIORITY.findIndex((t) => a.includes(t));
    const pb = SHARP_COMPANION_BOOK_PRIORITY.findIndex((t) => b.includes(t));
    const ra = pa >= 0 ? pa : 99;
    const rb = pb >= 0 ? pb : 99;
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });

  const chosen = commonBooks[0]!;
  return legBookMaps.map((m) => m.get(chosen)!);
}

function mergeUniqueBullets(
  existing: readonly CatalogEvidenceBullet[],
  extra: readonly string[],
): readonly CatalogEvidenceBullet[] {
  if (extra.length === 0) return existing;
  const seen = new Set(existing.map((b) => b.label.trim().toLowerCase()));
  const out: CatalogEvidenceBullet[] = [...existing];
  for (const raw of extra) {
    const clean = raw.trim();
    if (!clean || !isSafePublicLabel(clean)) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label: clean, ratePct: null, tone: "neutral" });
  }
  return out.slice(0, 5);
}

function repriceCatalogPickWithV6Prob(
  item: CatalogPickItem,
  pV6: number,
  options: {
    readonly extraBullets?: readonly string[];
    readonly engineName?: string;
  } = {},
): CatalogPickItem {
  const safeP = round4(clampProb(pV6));
  const fair = probabilityToFairOdds(safeP);
  const fairOdds = Math.max(1.01, fair.decimal);
  const fairAmerican = fair.american;

  const rawBookLabel = item.pricing.marketBookLabel;
  const bookPermitted = isPermittedBookLabelV6(rawBookLabel);

  const validMarket =
    bookPermitted &&
    typeof item.pricing.marketDecimal === "number" &&
    Number.isFinite(item.pricing.marketDecimal) &&
    item.pricing.marketDecimal >= 1.01 &&
    item.pricing.marketDecimal <= MAX_POSITIVE_DECIMAL_ODDS
      ? round2(item.pricing.marketDecimal)
      : null;

  const deVigMarketProb =
    validMarket !== null &&
    item.pricing.deVigMarketProb !== null &&
    Number.isFinite(item.pricing.deVigMarketProb)
      ? item.pricing.deVigMarketProb
      : null;
  const deVigMethod = deVigMarketProb !== null ? item.pricing.deVigMethod : "none";
  const overroundPct = deVigMarketProb !== null ? item.pricing.overroundPct : null;

  const rawEvPct = validMarket !== null ? round1((safeP * validMarket - 1) * 100) : null;
  const rawEdgePts = validMarket !== null ? round1((safeP - 1 / validMarket) * 100) : null;
  const noVigEdgePts =
    deVigMarketProb !== null ? round1((safeP - deVigMarketProb) * 100) : null;

  const evLimit = isSharpCatalogBook(rawBookLabel) ? MAX_SHARP_EV_PCT : MAX_SOFT_EV_PCT;
  const probDivergenceAnomalous =
    deVigMarketProb !== null && Math.abs(safeP - deVigMarketProb) * 100 > MAX_DEVIG_PROB_DIVERGENCE_PTS;
  const evAnomalous = rawEvPct !== null && rawEvPct > evLimit;
  const isAnomalous = probDivergenceAnomalous || evAnomalous;

  const evPct = isAnomalous ? null : rawEvPct;
  const edgePts = isAnomalous ? null : rawEdgePts;
  const hasPositiveValue = !isAnomalous && evPct !== null && evPct > 0;
  const valueLabel = hasPositiveValue && evPct !== null ? `Valor +${evPct.toFixed(1)} %` : null;

  const { bookQuotes: existingBookQuotes, ...restItem } = item;
  const safeQuotes = existingBookQuotes
    ? existingBookQuotes.filter(
        (q) =>
          isSafePublicLabel(q.bookLabel) &&
          isPermittedMarketQuoteBook(q.book, q.bookLabel) &&
          Number.isFinite(q.decimal) &&
          q.decimal >= 1.01,
      )
    : undefined;

  const updatedEvidence =
    options.extraBullets && options.extraBullets.length > 0
      ? {
          ...item.evidence,
          bullets: mergeUniqueBullets(item.evidence.bullets, options.extraBullets),
        }
      : item.evidence;

  const draft: CatalogPickItem = {
    ...restItem,
    pricing: {
      p: safeP,
      fairOdds,
      fairAmerican,
      marketDecimal: validMarket,
      marketAmerican: validMarket !== null ? decimalToAmericanOdds(validMarket) : null,
      marketBookLabel: validMarket !== null ? rawBookLabel : null,
      marketCapturedAtUtc: validMarket !== null ? item.pricing.marketCapturedAtUtc : null,
      deVigMarketProb,
      deVigMethod,
      overroundPct,
      evPct,
      edgePts,
      noVigEdgePts,
      valueLabel,
      hasPositiveValue,
    },
    evidence: updatedEvidence,
    engineName: options.engineName ?? "PitchLab Spacetime v6.0",
    ...(safeQuotes && safeQuotes.length > 0 ? { bookQuotes: safeQuotes } : {}),
  };

  const scored = scoreRecommendedCatalogPick(draft);
  return {
    ...draft,
    recommendationScore: scored.score,
    recommendationTier: scored.tier,
    isRecommendedByModel: scored.isRecommended,
    convergenceCount: scored.convergenceCount,
    pickOfTheDayReason: scored.valueThresholdLabel,
  };
}

interface GameInjuryLookupV6 {
  readonly bySidePlayer: ReadonlyMap<string, string>;
  readonly byPlayer: ReadonlyMap<string, string>;
  readonly resolvedMap: ReadonlyMap<string, string>;
}

function injurySeverityRank(status: string): number {
  if (isHardBlockedAvailabilityV6(null, status)) return 3;
  if (isDoubtfulAvailabilityV6(null, status)) return 2;
  return 1;
}

function setInjuryWithPrecedence(
  target: Map<string, string>,
  key: string,
  status: string,
): void {
  const cleanStatus = status.trim();
  if (!cleanStatus) return;
  const existing = target.get(key);
  if (existing !== undefined && injurySeverityRank(existing) >= injurySeverityRank(cleanStatus)) {
    return;
  }
  target.set(key, cleanStatus);
}

function collectTeamSlugTokens(rawValues: readonly (string | null | undefined)[]): Set<string> {
  const tokens = new Set<string>();
  for (const raw of rawValues) {
    if (!raw) continue;
    const lower = raw.trim().toLowerCase();
    if (lower) tokens.add(lower);
    const cleaned = cleanTeamRouteSlug(raw);
    if (cleaned) tokens.add(cleaned);
    if (lower.includes(".")) {
      const afterDot = lower.split(".").slice(1).join(".");
      if (afterDot) tokens.add(afterDot);
    }
  }
  return tokens;
}

function buildInjuryLookupForGame(
  game: PlatformGame,
  externalMap?: ReadonlyMap<string, string>,
  squads?: {
    readonly homeSquad?: TeamSquadEntry | null;
    readonly awaySquad?: TeamSquadEntry | null;
  },
): GameInjuryLookupV6 {
  const bySidePlayer = new Map<string, string>();
  const byPlayer = new Map<string, string>();
  const unprefixedByPlayer = new Map<string, string>();

  const homeConcreteSlugs = collectTeamSlugTokens([
    game.home.slug,
    squads?.homeSquad?.teamSlug,
    squads?.homeSquad?.teamId,
  ]);
  const awayConcreteSlugs = collectTeamSlugTokens([
    game.away.slug,
    squads?.awaySquad?.teamSlug,
    squads?.awaySquad?.teamId,
  ]);
  const homeMatchTokens = new Set<string>(["home", ...homeConcreteSlugs]);
  const awayMatchTokens = new Set<string>(["away", ...awayConcreteSlugs]);

  for (const abs of game.preGame?.absences ?? []) {
    const pKey = normalizeToken(abs.player);
    if (!pKey) continue;
    setInjuryWithPrecedence(bySidePlayer, `${abs.teamSide}|${pKey}`, abs.status);
    setInjuryWithPrecedence(byPlayer, pKey, abs.status);
  }

  const ingestKeyStatus = (rawKey: string, status: string) => {
    const cleanStatus = status.trim();
    if (!cleanStatus) return;
    const pipeIdx = rawKey.indexOf("|");
    if (pipeIdx >= 0) {
      const prefix = rawKey.slice(0, pipeIdx).trim().toLowerCase();
      const prefixClean = cleanTeamRouteSlug(prefix);
      const prefixAfterDot = prefix.includes(".") ? prefix.split(".").slice(1).join(".") : "";
      const pKey = normalizeToken(rawKey.slice(pipeIdx + 1));
      if (!pKey) return;

      const matchesHome =
        homeMatchTokens.has(prefix) ||
        (prefixClean.length > 0 && homeMatchTokens.has(prefixClean)) ||
        (prefixAfterDot.length > 0 && homeMatchTokens.has(prefixAfterDot));
      const matchesAway =
        awayMatchTokens.has(prefix) ||
        (prefixClean.length > 0 && awayMatchTokens.has(prefixClean)) ||
        (prefixAfterDot.length > 0 && awayMatchTokens.has(prefixAfterDot));

      if (matchesHome) {
        setInjuryWithPrecedence(bySidePlayer, `home|${pKey}`, cleanStatus);
        setInjuryWithPrecedence(byPlayer, pKey, cleanStatus);
      }
      if (matchesAway) {
        setInjuryWithPrecedence(bySidePlayer, `away|${pKey}`, cleanStatus);
        setInjuryWithPrecedence(byPlayer, pKey, cleanStatus);
      }
    } else {
      const pKey = normalizeToken(rawKey);
      if (!pKey) return;
      setInjuryWithPrecedence(byPlayer, pKey, cleanStatus);
      setInjuryWithPrecedence(unprefixedByPlayer, pKey, cleanStatus);
    }
  };

  if (externalMap !== undefined) {
    for (const [rawKey, status] of externalMap.entries()) {
      ingestKeyStatus(rawKey, status);
    }
  } else {
    const diskInjuries = readLeagueInjuriesMap(resolveSnapshotsRoot(), String(game.league));
    for (const [rawKey, entry] of diskInjuries.entries()) {
      ingestKeyStatus(rawKey, entry.status);
    }
  }

  const resolvedMap = new Map<string, string>();
  for (const [sidePlayerKey, status] of bySidePlayer.entries()) {
    const sep = sidePlayerKey.indexOf("|");
    if (sep <= 0) continue;
    const side = sidePlayerKey.slice(0, sep);
    const pKey = sidePlayerKey.slice(sep + 1);
    const slugs = side === "home" ? homeConcreteSlugs : awayConcreteSlugs;
    for (const slug of slugs) {
      setInjuryWithPrecedence(resolvedMap, `${slug}|${pKey}`, status);
    }
  }
  for (const [pKey, status] of unprefixedByPlayer.entries()) {
    for (const slug of homeConcreteSlugs) {
      setInjuryWithPrecedence(resolvedMap, `${slug}|${pKey}`, status);
    }
    for (const slug of awayConcreteSlugs) {
      setInjuryWithPrecedence(resolvedMap, `${slug}|${pKey}`, status);
    }
  }

  return { bySidePlayer, byPlayer, resolvedMap };
}

function lookupPlayerInjuryStatus(
  injuryLookup: {
    readonly bySidePlayer: ReadonlyMap<string, string>;
    readonly byPlayer: ReadonlyMap<string, string>;
  },
  teamSide: "home" | "away",
  playerName: string,
): string | null {
  const pKey = normalizeToken(playerName);
  if (!pKey) return null;
  return injuryLookup.bySidePlayer.get(`${teamSide}|${pKey}`) ?? injuryLookup.byPlayer.get(pKey) ?? null;
}

function resolveSportKeyForMultisport(sport: PlatformGame["sport"]): MultiSportLeagueV60 | null {
  if (sport === "basketball") return "nba";
  if (sport === "baseball") return "mlb";
  if (sport === "ice-hockey") return "nhl";
  if (sport === "american-football") return "nfl";
  return null;
}

function buildSoccerV6IntelligenceView(
  game: PlatformGame,
  socEval: Soccer57V6MatchEvaluation,
): {
  readonly view: MatchIntelligenceV5View;
  readonly homeBand: EpistemicProbabilityBandV5;
  readonly drawBand: EpistemicProbabilityBandV5 | null;
  readonly awayBand: EpistemicProbabilityBandV5;
} {
  const epistemicArtifact = getUnifiedArtifactsBundleV6().epistemicArtifactV51;
  const absencesCount = game.preGame?.absences?.filter((a) => a.status === "Baja").length ?? 0;
  const coreX12 = socEval.markets["1x2"];
  const epistemic = buildMatchEpistemicSummaryV5({
    pHome: coreX12.home,
    pDraw: coreX12.draw,
    pAway: coreX12.away,
    pLogitHome: coreX12.home,
    pGbmHome: socEval.playableVennAbers.home.pCalibrated,
    pLogitDraw: coreX12.draw,
    pGbmDraw: coreX12.draw,
    pLogitAway: coreX12.away,
    pGbmAway: socEval.playableVennAbers.away.pCalibrated,
    effectiveSampleGames: Math.max(10, 26 - Math.min(10, absencesCount * 2)),
    seasonProgress: 0.55,
    sport: "soccer",
    calibrationArtifact: epistemicArtifact,
  });

  const micro = socEval.microMarkets;
  const ep = socEval.earlyPayout2Goals;
  const earlyPayout: EarlyPayoutSummaryView = {
    triggerLabel: "Ventaja de +2 goles",
    homeWinProb: round4(ep.pHomeEarlyPayoutWin),
    awayWinProb: round4(ep.pAwayEarlyPayoutWin),
    homeLiftPts: round1(ep.homeEarlyPayoutLift * 100),
    awayLiftPts: round1(ep.awayEarlyPayoutLift * 100),
    fairHomeDecimal: round2(ep.fairOddsHomeEarlyPayout.decimal),
    fairAwayDecimal: round2(ep.fairOddsAwayEarlyPayout.decimal),
    bothTriggerProb: round4(ep.pBothSidesTriggerEarlyPayout),
    validatedOos: true,
  };

  const refName = (game.referee ?? game.preGame?.matchContext?.referee ?? "").trim();
  const refGames = Math.max(
    socEval.officialPrior.historicalGames,
    game.preGame?.matchContext?.refereeStats?.matches ?? 0,
  );
  const microCounts: MicroCountsV5View = {
    corners: {
      home: round1(micro.metrics.corners.muHome),
      away: round1(micro.metrics.corners.muAway),
      total: round1(micro.metrics.corners.muTotal),
    },
    yellowCards: {
      home: round1(micro.metrics.yellow_cards.muHome),
      away: round1(micro.metrics.yellow_cards.muAway),
      total: round1(micro.metrics.yellow_cards.muTotal),
    },
    fouls: {
      home: round1(micro.metrics.fouls.muHome),
      away: round1(micro.metrics.fouls.muAway),
      total: round1(micro.metrics.fouls.muTotal),
    },
    shots: {
      home: round1(micro.metrics.shots.muHome),
      away: round1(micro.metrics.shots.muAway),
      total: round1(micro.metrics.shots.muTotal),
    },
    shotsOnTarget: {
      home: round1(micro.metrics.shots_on_target.muHome),
      away: round1(micro.metrics.shots_on_target.muAway),
      total: round1(micro.metrics.shots_on_target.muTotal),
    },
    redCardMatchProb: round4(micro.redCards.pRedCardMatch),
    bookingPointsMean: round1(micro.bookingPoints.expectedBookingPoints),
    refereeProfile:
      refName.length > 0 && isSafePublicLabel(refName)
        ? {
            name: refName,
            games: refGames,
            cardsMultiplier: round4(socEval.officialPrior.yellowMult),
            foulsMultiplier: round4(socEval.officialPrior.foulsMult),
            redsMultiplier: round4(socEval.officialPrior.redMult),
          }
        : null,
  };

  return {
    view: {
      epistemic: {
        home: toBandView(epistemic.homeBand90),
        draw: epistemic.drawBand90 ? toBandView(epistemic.drawBand90) : null,
        away: toBandView(epistemic.awayBand90),
      },
      earlyPayout,
      microCounts,
      verifiedSummaryEs: `${game.home.shortName} vs ${game.away.shortName} · Goles proyectados ${socEval.muHome.toFixed(2)}–${socEval.muAway.toFixed(2)}.`,
      guardrailPassed: true,
    },
    homeBand: epistemic.homeBand90,
    drawBand: epistemic.drawBand90,
    awayBand: epistemic.awayBand90,
  };
}

function buildUsV6IntelligenceView(
  game: PlatformGame,
  msEval: UsMultisportV6MatchEvaluation,
  pHomeAnchor: number,
): {
  readonly view: MatchIntelligenceV5View;
  readonly homeBand: EpistemicProbabilityBandV5;
  readonly awayBand: EpistemicProbabilityBandV5;
} {
  const epistemicArtifact = getUnifiedArtifactsBundleV6().epistemicArtifactV51;
  const pHome = clampProb(pHomeAnchor);
  const pAway = clampProb(1 - pHome);
  const epistemic = buildMatchEpistemicSummaryV5({
    pHome,
    pDraw: null,
    pAway,
    effectiveSampleGames: msEval.sport === "nfl" ? 16 : msEval.sport === "mlb" ? 60 : 40,
    sport: msEval.sport === "nfl" ? "nfl" : "multisport",
    calibrationArtifact: epistemicArtifact,
  });

  const ep = msEval.earlyPayoutAnchored;
  const unit =
    msEval.sport === "mlb"
      ? "carreras"
      : msEval.sport === "nhl"
        ? "goles"
        : "puntos";
  const earlyPayout: EarlyPayoutSummaryView = {
    triggerLabel: `Ventaja de +${ep.trigger_lead} ${unit}`,
    homeWinProb: round4(ep.p_home_early_payout_win),
    awayWinProb: round4(ep.p_away_early_payout_win),
    homeLiftPts: round1(ep.home_early_payout_lift * 100),
    awayLiftPts: round1(ep.away_early_payout_lift * 100),
    fairHomeDecimal: round2(ep.fair_odds_home_early_payout.decimal),
    fairAwayDecimal: round2(ep.fair_odds_away_early_payout.decimal),
    ...(ep.p_both_sides_trigger_early_payout !== null
      ? { bothTriggerProb: round4(ep.p_both_sides_trigger_early_payout) }
      : {}),
    validatedOos: isEarlyPayoutValidatedOosV6(ep),
  };

  return {
    view: {
      epistemic: {
        home: toBandView(epistemic.homeBand90),
        draw: null,
        away: toBandView(epistemic.awayBand90),
      },
      earlyPayout,
      verifiedSummaryEs: `${game.home.shortName} vs ${game.away.shortName} · Pago anticipado +${ep.trigger_lead} ${unit}.`,
      guardrailPassed: true,
    },
    homeBand: epistemic.homeBand90,
    awayBand: epistemic.awayBand90,
  };
}

function isGoalkeeperSavesPick(params: {
  readonly selectionKey: string;
  readonly label?: string;
  readonly playerMeta?: PlayerPropMeta | null;
}): boolean {
  const selLower = params.selectionKey.trim().toLowerCase();
  if (selLower.includes("_player_saves_") || selLower.includes("player_saves")) {
    return true;
  }
  const statLabel = params.playerMeta?.statLabel ?? "";
  if (statLabel && isGoalkeeperSavesLabel(statLabel, params.selectionKey)) {
    return true;
  }
  if (params.label && isGoalkeeperSavesLabel(params.label, params.selectionKey)) {
    return true;
  }
  return false;
}

function readGoalkeeperSavesFromFinalStats(
  finalStats: MatchFinalCountStats | null | undefined,
  playerKeys: readonly (string | null | undefined)[],
): number | null {
  const playerStats = finalStats?.playerStats;
  if (!playerStats) return null;
  for (const key of playerKeys) {
    if (!key) continue;
    const record = playerStats[key];
    if (!record) continue;
    for (const [entryKey, entryVal] of Object.entries(record)) {
      const normStat = entryKey.trim().toLowerCase();
      if (
        (normStat === "saves" || normStat === "player_saves") &&
        typeof entryVal === "number" &&
        Number.isFinite(entryVal)
      ) {
        return entryVal;
      }
    }
  }
  return null;
}

function gradeGoalkeeperSavesPick(params: {
  readonly game: PlatformGame;
  readonly selectionKey: string;
  readonly line: number | null;
  readonly finalStats?: MatchFinalCountStats | null;
  readonly playerMeta?: PlayerPropMeta | null;
}): PickSettlementStatus {
  if (
    params.game.status !== "FT" ||
    !params.game.score ||
    params.line === null ||
    !Number.isFinite(params.line)
  ) {
    return "pending";
  }
  const savesVal = readGoalkeeperSavesFromFinalStats(params.finalStats, [
    params.playerMeta?.playerSlug,
    params.playerMeta?.playerName,
  ]);
  if (savesVal === null) return "pending";
  if (savesVal === params.line) return "push";
  const sel = params.selectionKey.trim().toLowerCase();
  if (sel.includes("over")) return savesVal > params.line ? "hit" : "miss";
  if (sel.includes("under")) return savesVal < params.line ? "hit" : "miss";
  return "pending";
}

function buildNewCatalogPickItem(params: {
  readonly game: PlatformGame;
  readonly family: MarketFamilyId;
  readonly selectionKey: string;
  readonly label: string;
  readonly line: number | null;
  readonly direction: PickDirection;
  readonly axisOverride?: PickAxisKey;
  readonly p: number;
  readonly marketQuote?: SameBookQuoteEntry | null;
  readonly companionDecimals?: readonly number[] | null;
  readonly companionIndex?: number;
  readonly companionProbSum?: number;
  readonly deVigPreference: "auto" | "proportional" | "shin" | "power";
  readonly nowIso: string;
  readonly v5: MatchIntelligenceV5View | null;
  readonly homeHistory?: readonly TeamMatchEvidenceRecord[];
  readonly awayHistory?: readonly TeamMatchEvidenceRecord[];
  readonly f5Score?: { readonly home: number; readonly away: number } | null;
  readonly finalStats?: MatchFinalCountStats | null;
  readonly precomputedWindows?: readonly CatalogPickItem["evidence"]["windows"][number][];
  readonly contextBullets?: readonly string[];
  readonly playerMeta?: PlayerPropMeta | null;
  readonly conflictGroup?: CatalogPickItem["conflictGroup"];
  readonly isDerived: boolean;
  readonly projectedScoreLabel: string | null;
}): CatalogPickItem {
  const spec = getMarketFamilySpec(params.family);
  const pricing = computePickPricing({
    calibratedProb: clampProb(params.p),
    marketDecimal: params.marketQuote?.decimal ?? null,
    companionMarketDecimals: params.companionDecimals ?? null,
    companionIndex: params.companionIndex,
    companionProbSum: params.companionProbSum,
    marketBookLabel: params.marketQuote?.bookLabel ?? null,
    marketCapturedAtUtc: params.marketQuote?.capturedAtUtc ?? null,
    nowIso: params.nowIso,
    deVigPreference: params.deVigPreference,
  });

  const xgSignal = resolveXgEvidenceSignal(params.game, params.v5);
  const refereeSignal = resolveRefereeEvidenceSignal(params.game, params.v5);
  const evidence = buildCatalogPickEvidence({
    game: params.game,
    family: params.family,
    selectionKey: params.selectionKey,
    line: params.line,
    direction: params.direction,
    v5: params.v5,
    xgSignal,
    refereeSignal,
    homeHistory: params.homeHistory,
    awayHistory: params.awayHistory,
    precomputedWindows: params.precomputedWindows,
    contextBullets: params.contextBullets,
  });

  const settlement: PickSettlementStatus = isGoalkeeperSavesPick({
    selectionKey: params.selectionKey,
    label: params.label,
    playerMeta: params.playerMeta,
  })
    ? gradeGoalkeeperSavesPick({
        game: params.game,
        selectionKey: params.selectionKey,
        line: params.line,
        finalStats: params.finalStats,
        playerMeta: params.playerMeta,
      })
    : gradeCatalogPick({
        game: params.game,
        family: params.family,
        selectionKey: params.selectionKey,
        line: params.line,
        f5Score: params.f5Score ?? null,
        finalStats: params.finalStats ?? null,
        playerKey: params.playerMeta?.playerSlug ?? params.playerMeta?.playerName ?? null,
        playerStatKey: params.playerMeta?.statKey ?? null,
      });

  const lineTag = params.line !== null ? `__${params.line}` : "";
  const id = `${params.game.id}__cat__${params.family}__${params.selectionKey}${lineTag}`;
  const conflictGroup: CatalogPickItem["conflictGroup"] =
    params.conflictGroup ??
    (params.family === "nfl_totals" || params.family === "nba_totals" || params.family === "mlb_totals" || params.family === "nhl_totals"
      ? params.direction === "under"
        ? "under_total"
        : "over_total"
      : "independent");

  const draft: CatalogPickItem = {
    id,
    gameId: params.game.id,
    league: params.game.league,
    leagueLabel: params.game.leagueLabel,
    sport: params.game.sport,
    matchLabel: `${params.game.home.shortName} vs ${params.game.away.shortName}`,
    kickoffUtc: params.game.kickoffUtc,
    kickoffLocal: params.game.kickoffLocal,
    gameStatus: params.game.status,
    family: params.family,
    familyLabel: spec.label,
    category: spec.category,
    axis: params.axisOverride ?? spec.axis,
    selectionKey: params.selectionKey,
    label: params.label,
    line: params.line,
    direction: params.direction,
    pricing,
    evidence,
    settlement,
    engineName: "PitchLab Spacetime v6.0",
    isPrimaryModelPick: false,
    isDerived: params.isDerived,
    conflictGroup,
    ...(params.playerMeta ? { playerMeta: params.playerMeta } : {}),
    ...(params.marketQuote && params.marketQuote.bookQuotes.length > 0
      ? { bookQuotes: params.marketQuote.bookQuotes }
      : {}),
  };

  const scored = scoreRecommendedCatalogPick(draft);
  return {
    ...draft,
    recommendationScore: scored.score,
    recommendationTier: scored.tier,
    isRecommendedByModel: scored.isRecommended,
    convergenceCount: scored.convergenceCount,
    pickOfTheDayReason: scored.valueThresholdLabel,
    projectedScoreLabel: params.projectedScoreLabel,
  };
}

export function resolveFootballBasePlayerPropV6(params: {
  readonly item: CatalogPickItem;
  readonly injuryLookup: {
    readonly bySidePlayer: ReadonlyMap<string, string>;
    readonly byPlayer: ReadonlyMap<string, string>;
  };
  readonly coupledShotsByPlayerLine: ReadonlyMap<string, number>;
  readonly rejectedCoupledPlayerMetrics: ReadonlySet<string>;
}): CatalogPickItem | null {
  const { item, injuryLookup, coupledShotsByPlayerLine, rejectedCoupledPlayerMetrics } = params;
  if (!item.playerMeta) {
    return null;
  }
  const reportedInjury = lookupPlayerInjuryStatus(
    injuryLookup,
    item.playerMeta.teamSide,
    item.playerMeta.playerName,
  );
  const guard = checkStrictPlayerMinutesAndAvailabilityGuardV6({
    sport: "football",
    avgMinutes: item.playerMeta.avgMinutes,
    injuryStatus: reportedInjury,
  });
  if (!guard.eligible || !isSafePublicLabel(item.playerMeta.playerName)) {
    return null;
  }
  if (!hasExplicitSpanishUnit(item.label)) {
    return null;
  }
  const slug = item.playerMeta.playerSlug ?? slugifyPlayerName(item.playerMeta.playerName);
  const statKey = item.playerMeta.statKey;
  if (rejectedCoupledPlayerMetrics.has(`${slug}|${statKey}`)) {
    return null;
  }
  const isCoupledShotStat = statKey === "shots" || statKey === "shots_on_target";
  let nextP = item.pricing.p;
  if (isCoupledShotStat) {
    if (item.line === null) {
      return null;
    }
    const coupledKey = `${slug}|${statKey}|${item.line.toFixed(1)}`;
    const coupledP = coupledShotsByPlayerLine.get(coupledKey);
    if (coupledP === undefined) {
      return null;
    }
    nextP = coupledP;
  }
  return repriceCatalogPickWithV6Prob(item, nextP, {
    engineName: "PitchLab Spacetime v6.0",
  });
}

export function resolveNbaBasePlayerPropV6(params: {
  readonly item: CatalogPickItem;
  readonly injuryLookup: {
    readonly bySidePlayer: ReadonlyMap<string, string>;
    readonly byPlayer: ReadonlyMap<string, string>;
  };
  readonly nbaCandidatesBySlug: ReadonlyMap<string, NbaPlayerPropCandidateInput>;
}): CatalogPickItem | null {
  const { item, injuryLookup, nbaCandidatesBySlug } = params;
  if (!item.playerMeta) {
    return null;
  }
  const reportedInjury = lookupPlayerInjuryStatus(
    injuryLookup,
    item.playerMeta.teamSide,
    item.playerMeta.playerName,
  );
  const guard = checkStrictPlayerMinutesAndAvailabilityGuardV6({
    sport: "nba",
    avgMinutes: item.playerMeta.avgMinutes,
    injuryStatus: reportedInjury,
  });
  if (!guard.eligible || !isSafePublicLabel(item.playerMeta.playerName)) {
    return null;
  }

  const slug = item.playerMeta.playerSlug ?? slugifyPlayerName(item.playerMeta.playerName);
  const cand = nbaCandidatesBySlug.get(slug);
  let updatedP = item.pricing.p;
  if (cand && item.line !== null) {
    const statCode = item.playerMeta.statKey;
    const qualLogs = (cand.matchLogs ?? []).filter(
      (l) => Number.isFinite(l.minutesPlayed) && l.minutesPlayed >= NBA_PROP_DEFAULT_MIN_MINUTES,
    );
    const vals = qualLogs
      .map((l) =>
        statCode === "PTS" || statCode === "REB" || statCode === "AST" || statCode === "3PM"
          ? l[statCode]
          : undefined,
      )
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const proj =
      statCode === "PTS" || statCode === "REB" || statCode === "AST" || statCode === "3PM"
        ? cand.statProjections?.[statCode]
        : undefined;
    const sampleGames = vals.length > 0 ? vals.length : Math.max(3, item.playerMeta.qualifyingMatches);
    const sampleSum =
      vals.length > 0
        ? vals.reduce((acc, v) => acc + v, 0)
        : (proj?.mean ?? item.playerMeta.projectionMean) * sampleGames;
    let sampleVariance: number | null = null;
    if (vals.length >= 3) {
      const meanV = sampleSum / vals.length;
      sampleVariance =
        vals.reduce((acc, v) => acc + (v - meanV) * (v - meanV), 0) / (vals.length - 1);
    }
    const v6Prop = projectUsPlayerPropV6({
      sport: "nba",
      positionLabel: cand.position,
      metric: statCode,
      sampleSum,
      sampleGames,
      line: item.line,
      prematchMinutes: item.playerMeta.avgMinutes,
      sampleVariance,
      injuryStatus: reportedInjury,
      artifact: getPropsV6ModelArtifact(),
    });
    if (v6Prop) {
      updatedP = item.direction === "under" ? v6Prop.pUnderCalibrated : v6Prop.pOverCalibrated;
    }
  }

  return repriceCatalogPickWithV6Prob(item, updatedP, {
    engineName: "PitchLab Spacetime v6.0",
  });
}

function enrichFootballCatalogWithV6(params: {
  readonly game: PlatformGame;
  readonly baseCatalog: MatchPicksCatalog;
  readonly socEval: Soccer57V6MatchEvaluation;
  readonly homeBand: EpistemicProbabilityBandV5;
  readonly drawBand: EpistemicProbabilityBandV5 | null;
  readonly awayBand: EpistemicProbabilityBandV5;
  readonly effectiveV5: MatchIntelligenceV5View;
  readonly options: ServerMatchPicksCatalogOptions;
  readonly allowedFamilies: ReadonlySet<MarketFamilyId> | undefined;
  readonly nowIso: string;
}): MatchPicksCatalog {
  const { game, baseCatalog, socEval, options, allowedFamilies, nowIso, effectiveV5 } = params;
  const leagueSlug = String(game.league);
  const applyVa = options.enableVennAbersPlayable !== false;
  const epistemicArtifact = getUnifiedArtifactsBundleV6().epistemicArtifactV51;
  const injuryLookup = buildInjuryLookupForGame(game, options.injuryStatusByTeamPlayer, {
    homeSquad: options.homeSquad,
    awaySquad: options.awaySquad,
  });

  const calProb = (rawP: number): number =>
    applyVa ? applyVennAbersPlayableCalibrationV6(rawP, leagueSlug).pCalibrated : clampProb(rawP);

  const x12Partition = calibrateVennAbersThreeWayPartitionV6(
    socEval.markets["1x2"].home,
    socEval.markets["1x2"].draw,
    socEval.markets["1x2"].away,
    leagueSlug,
    applyVa,
  );
  const dnbPair = calibrateVennAbersBinaryPartitionV6(
    socEval.markets.dnb.home,
    socEval.markets.dnb.away,
    leagueSlug,
    applyVa,
  );
  const tot15Pair = calibrateVennAbersBinaryPartitionV6(
    socEval.markets.totals_1_5.over,
    socEval.markets.totals_1_5.under,
    leagueSlug,
    applyVa,
  );
  const tot25Pair = calibrateVennAbersBinaryPartitionV6(
    socEval.markets.totals_2_5.over,
    socEval.markets.totals_2_5.under,
    leagueSlug,
    applyVa,
  );
  const tot35Pair = calibrateVennAbersBinaryPartitionV6(
    socEval.markets.totals_3_5.over,
    socEval.markets.totals_3_5.under,
    leagueSlug,
    applyVa,
  );
  const bttsPair = calibrateVennAbersBinaryPartitionV6(
    socEval.markets.btts.yes,
    socEval.markets.btts.no,
    leagueSlug,
    applyVa,
  );

  const ahMap = new Map<string, { readonly pHome: number; readonly pAway: number; readonly pPush: number }>();
  for (const row of socEval.asianHandicap) {
    const ahPair = calibrateVennAbersBinaryPartitionV6(
      row.pHomeCoverNoPush,
      row.pAwayCoverNoPush,
      leagueSlug,
      applyVa,
    );
    ahMap.set(row.lineHome.toFixed(1), {
      pHome: ahPair.first,
      pAway: ahPair.second,
      pPush: row.pPush,
    });
  }

  const buildHalfPartition = (familyId: "half_time_result" | "second_half_result") => {
    const prefix = familyId === "half_time_result" ? "ht_" : "2h_";
    const pH = baseCatalog.picks.find(
      (p) => p.family === familyId && p.selectionKey === `${prefix}home`,
    )?.pricing.p;
    const pD = baseCatalog.picks.find(
      (p) => p.family === familyId && p.selectionKey === `${prefix}draw`,
    )?.pricing.p;
    const pA = baseCatalog.picks.find(
      (p) => p.family === familyId && p.selectionKey === `${prefix}away`,
    )?.pricing.p;
    if (pH === undefined || pD === undefined || pA === undefined) return null;
    return calibrateVennAbersThreeWayPartitionV6(pH, pD, pA, leagueSlug, applyVa);
  };
  const htPartition = buildHalfPartition("half_time_result");
  const shPartition = buildHalfPartition("second_half_result");

  const bookingPts = socEval.microMarkets.bookingPoints;
  const redProb = socEval.microMarkets.redCards.pRedCardMatch;

  const over25Band = computeConformalEpistemicBandV5({
    pPoint: socEval.markets.totals_2_5.over,
    effectiveSampleGames: 24,
    pSubModelA: socEval.markets.totals_2_5.over,
    pSubModelB: socEval.playableVennAbers.over25.pCalibrated,
    sport: "soccer",
    calibrationArtifact: epistemicArtifact,
  });
  const bttsYesBand = computeConformalEpistemicBandV5({
    pPoint: socEval.markets.btts.yes,
    effectiveSampleGames: 24,
    pSubModelA: socEval.markets.btts.yes,
    pSubModelB: socEval.playableVennAbers.bttsYes.pCalibrated,
    sport: "soccer",
    calibrationArtifact: epistemicArtifact,
  });

  const coupledShotsByPlayerLine = new Map<string, number>();
  const rejectedCoupledPlayerMetrics = new Set<string>();
  const footballCandidates = options.footballPlayers ?? [];
  const teamVolHome = resolveFootballTeamExpectedVolumeV6({
    teamProjectedGoals: socEval.muHome,
    teamExpectedShots: socEval.microMarkets.metrics.shots.muHome,
    teamExpectedSoT: socEval.microMarkets.metrics.shots_on_target.muHome,
    oppProjectedGoals: socEval.muAway,
    oppExpectedSoT: socEval.microMarkets.metrics.shots_on_target.muAway,
  });
  const teamVolAway = resolveFootballTeamExpectedVolumeV6({
    teamProjectedGoals: socEval.muAway,
    teamExpectedShots: socEval.microMarkets.metrics.shots.muAway,
    teamExpectedSoT: socEval.microMarkets.metrics.shots_on_target.muAway,
    oppProjectedGoals: socEval.muHome,
    oppExpectedSoT: socEval.microMarkets.metrics.shots_on_target.muHome,
  });

  const additionalPicks: CatalogPickItem[] = [];
  const projectedScoreLabel = baseCatalog.picks[0]?.projectedScoreLabel ?? null;
  const deVigPref = options.deVigPreference ?? "auto";
  const allowFootballProps = !allowedFamilies || allowedFamilies.has("player_props_football");

  if (allowFootballProps) {
    for (const cand of footballCandidates) {
      if (!isSafePublicLabel(cand.playerName) || !isSafePublicLabel(cand.teamName)) continue;
      const reportedInjury = lookupPlayerInjuryStatus(injuryLookup, cand.teamSide, cand.playerName);
      if (isHardBlockedAvailabilityV6(null, reportedInjury)) continue;

      const minGuard = Math.max(FOOTBALL_PROP_MIN_MINUTES, cand.minMinutes ?? FOOTBALL_PROP_MIN_MINUTES);
      const qualifiedLogs = cand.matchLogs
        ? cand.matchLogs.filter((l) => Number.isFinite(l.minutesPlayed) && l.minutesPlayed >= minGuard)
        : null;
      const avgMinutes =
        qualifiedLogs && qualifiedLogs.length >= 3
          ? round1(qualifiedLogs.reduce((s, l) => s + l.minutesPlayed, 0) / qualifiedLogs.length)
          : cand.avgMinutes;
      const strictGuard = checkStrictPlayerMinutesAndAvailabilityGuardV6({
        sport: "football",
        avgMinutes,
        injuryStatus: reportedInjury,
      });
      if (!strictGuard.eligible || typeof avgMinutes !== "number") continue;

      const vol = cand.teamSide === "home" ? teamVolHome : teamVolAway;
      const apps = qualifiedLogs
        ? Math.max(1, qualifiedLogs.length)
        : Math.max(1, cand.seasonTotals?.appearances ?? 5);
      const totalShots = qualifiedLogs
        ? qualifiedLogs.reduce((acc, l) => acc + (l.shots ?? 0), 0)
        : (cand.seasonTotals?.shots ?? 0);
      const totalSoT = qualifiedLogs
        ? qualifiedLogs.reduce((acc, l) => acc + (l.shotsOnTarget ?? 0), 0)
        : (cand.seasonTotals?.shotsOnTarget ?? 0);
      const playerSlug = cand.playerSlug ?? slugifyPlayerName(cand.playerName);

      const coupledSpecs: ReadonlyArray<{
        readonly metric: "shots" | "shots_on_target";
        readonly statKey: "shots" | "shots_on_target";
        readonly count: number;
      }> = [
        { metric: "shots", statKey: "shots", count: totalShots },
        { metric: "shots_on_target", statKey: "shots_on_target", count: totalSoT },
      ];

      for (const spec of coupledSpecs) {
        if (spec.count <= 0) continue;
        const quoteObj = cand.marketQuotes?.[spec.statKey];
        const quotesByLine =
          quoteObj && typeof quoteObj.line === "number"
            ? {
                [quoteObj.line]: {
                  overDecimal: quoteObj.overDecimal ?? null,
                  bookLabel: quoteObj.bookLabel ?? null,
                },
              }
            : undefined;
        const coupled = evaluateCoupledFootballShotsV6({
          metric: spec.metric,
          playerName: cand.playerName,
          positionGroup: cand.position,
          positionLabel: cand.position,
          seasonCount: spec.count,
          seasonShotsTotal: totalShots,
          appearances: apps,
          subIns: 0,
          avgMinutes,
          teamExpectedShots: vol.teamExpectedShots,
          teamExpectedSoT: vol.teamExpectedSoT,
          teamProjectedGoals: cand.teamSide === "home" ? socEval.muHome : socEval.muAway,
          lineupStatus:
            cand.lineupStatus === "confirmed" || cand.lineupStatus === "probable"
              ? cand.lineupStatus
              : null,
          injuryStatus: reportedInjury,
          allowFull: true,
          marketQuotesByLine: quotesByLine,
        });
        if (!coupled.eligible) {
          rejectedCoupledPlayerMetrics.add(`${playerSlug}|${spec.statKey}`);
          continue;
        }

        for (const ln of coupled.lines) {
          if (ln.pOver === null || ln.pOver < 0.08 || ln.pOver > 0.92) continue;
          coupledShotsByPlayerLine.set(
            `${playerSlug}|${spec.statKey}|${ln.line.toFixed(1)}`,
            ln.pOver,
          );

          const matchedQuote =
            quoteObj && Math.abs(quoteObj.line - ln.line) < 0.01 ? quoteObj : undefined;
          const rawBook = matchedQuote?.bookLabel?.trim() ?? "";
          const quoteAllowed =
            matchedQuote &&
            typeof matchedQuote.overDecimal === "number" &&
            Number.isFinite(matchedQuote.overDecimal) &&
            matchedQuote.overDecimal >= 1.01 &&
            isPermittedBookLabelV6(rawBook) &&
            isMarketQuoteFreshWithin72h(matchedQuote.capturedAtUtc ?? nowIso, nowIso);
          const sameBookComp =
            quoteAllowed &&
            typeof matchedQuote.underDecimal === "number" &&
            Number.isFinite(matchedQuote.underDecimal) &&
            matchedQuote.underDecimal >= 1.01
              ? [matchedQuote.overDecimal!, matchedQuote.underDecimal]
              : null;

          const observedVals = qualifiedLogs
            ? qualifiedLogs
                .map((l) => (spec.statKey === "shots" ? l.shots : l.shotsOnTarget))
                .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
            : [];
          const windows =
            observedVals.length >= 3
              ? buildNumericSeriesEvidenceWindows({
                  values: observedVals,
                  line: ln.line,
                  direction: "over",
                  subjectLabel: cand.playerName,
                })
              : [];

          const muVal = round2(coupled.muProjected ?? spec.count / apps);
          const sdVal = round2(Math.max(0.45, Math.sqrt(Math.max(0.3, muVal))));
          const meta: PlayerPropMeta = {
            playerName: cand.playerName,
            playerSlug,
            teamSide: cand.teamSide,
            teamName: cand.teamName,
            teamSlug: cand.teamSlug ?? (cand.teamSide === "home" ? game.home.slug : game.away.slug),
            photoKey: cand.photoKey ?? null,
            position: cand.position,
            statKey: spec.statKey,
            statLabel: ln.marketLabel,
            minMinutesGuard: FOOTBALL_PROP_MIN_MINUTES,
            qualifyingMatches: apps,
            avgMinutes,
            lineupStatus: cand.lineupStatus ?? "probable",
            projectionMean: muVal,
            projectionSd: sdVal,
          };

          additionalPicks.push(
            buildNewCatalogPickItem({
              game,
              family: "player_props_football",
              selectionKey: `${playerSlug}_${spec.statKey}_over_${ln.line}`,
              label: `${cand.playerName} · ${ln.selectionLabel}`,
              line: ln.line,
              direction: "over",
              axisOverride: "player_prop",
              p: ln.pOver,
              marketQuote: quoteAllowed
                ? {
                    decimal: matchedQuote.overDecimal!,
                    bookLabel: rawBook,
                    capturedAtUtc: matchedQuote.capturedAtUtc ?? nowIso,
                    bookQuotes: [],
                  }
                : null,
              companionDecimals: sameBookComp,
              companionIndex: 0,
              deVigPreference: deVigPref,
              nowIso,
              v5: effectiveV5,
              homeHistory: options.homeHistory,
              awayHistory: options.awayHistory,
              finalStats: options.finalStats,
              precomputedWindows: windows,
              contextBullets: [
                `Proyección acoplada ${muVal.toFixed(2)} ${ln.unitEs} · Guardia >= ${FOOTBALL_PROP_MIN_MINUTES} min (${apps} PJ)`,
              ],
              playerMeta: meta,
              isDerived: !quoteAllowed,
              projectedScoreLabel,
            }),
          );
        }
      }
    }

    for (const gk of options.footballGoalkeepers ?? []) {
      if (!isSafePublicLabel(gk.playerName) || !isSafePublicLabel(gk.teamName)) continue;
      const reportedInjury = lookupPlayerInjuryStatus(injuryLookup, gk.teamSide, gk.playerName);
      const effectiveInjury = gk.injuryStatus ?? reportedInjury;
      if (isHardBlockedAvailabilityV6(gk.availability, effectiveInjury)) continue;

      const oppExpectedSoT =
        gk.teamSide === "home"
          ? socEval.microMarkets.metrics.shots_on_target.muAway
          : socEval.microMarkets.metrics.shots_on_target.muHome;
      const oppProjectedGoals = gk.teamSide === "home" ? socEval.muAway : socEval.muHome;

      const gkEval = evaluateGoalkeeperSavesV6({
        playerName: gk.playerName,
        saves: gk.saves,
        shotsFaced: gk.shotsFaced,
        goalsConceded: gk.goalsConceded,
        appearances: gk.appearances,
        subIns: gk.subIns ?? 0,
        avgMinutes: gk.avgMinutes,
        oppExpectedSoT,
        oppProjectedGoals,
        availability: gk.availability,
        injuryStatus: effectiveInjury,
        allowFull: true,
        marketQuotesByLine: gk.marketQuotesByLine,
      });
      if (!gkEval.eligible || gkEval.expectedSaves === null) continue;

      const playerSlug = gk.playerSlug ?? slugifyPlayerName(gk.playerName);
      for (const ln of gkEval.lines) {
        if (ln.pOver === null || ln.pOver < 0.06 || ln.pOver > 0.94) continue;
        const rawQuote = gk.marketQuotesByLine?.[ln.line];
        const rawBook = rawQuote?.bookLabel?.trim() ?? "";
        const quoteAllowed =
          rawQuote &&
          typeof rawQuote.overDecimal === "number" &&
          Number.isFinite(rawQuote.overDecimal) &&
          rawQuote.overDecimal >= 1.01 &&
          isPermittedBookLabelV6(rawBook) &&
          isMarketQuoteFreshWithin72h(rawQuote.capturedAtUtc ?? nowIso, nowIso);
        const sameBookComp =
          quoteAllowed &&
          typeof rawQuote.underDecimal === "number" &&
          Number.isFinite(rawQuote.underDecimal) &&
          rawQuote.underDecimal >= 1.01
            ? [rawQuote.overDecimal!, rawQuote.underDecimal]
            : null;

        const meta: PlayerPropMeta = {
          playerName: gk.playerName,
          playerSlug,
          teamSide: gk.teamSide,
          teamName: gk.teamName,
          teamSlug: gk.teamSlug ?? (gk.teamSide === "home" ? game.home.slug : game.away.slug),
          photoKey: gk.photoKey ?? null,
          position: "GK",
          statKey: "shots_on_target",
          statLabel: "Atajadas",
          minMinutesGuard: FOOTBALL_PROP_MIN_MINUTES,
          qualifyingMatches: Math.max(1, gk.appearances),
          avgMinutes: typeof gk.avgMinutes === "number" ? gk.avgMinutes : null,
          lineupStatus: gk.lineupStatus ?? "probable",
          projectionMean: round2(gkEval.expectedSaves),
          projectionSd: round2(Math.max(0.85, Math.sqrt(Math.max(0.5, gkEval.expectedSaves)))),
        };

        additionalPicks.push(
          buildNewCatalogPickItem({
            game,
            family: "player_props_football",
            selectionKey: `${playerSlug}_player_saves_over_${ln.line}`,
            label: `${gk.playerName} · ${ln.selectionLabel}`,
            line: ln.line,
            direction: "over",
            axisOverride: "player_prop",
            p: ln.pOver,
            marketQuote: quoteAllowed
              ? {
                  decimal: rawQuote.overDecimal!,
                  bookLabel: rawBook,
                  capturedAtUtc: rawQuote.capturedAtUtc ?? nowIso,
                  bookQuotes: [],
                }
              : null,
            companionDecimals: sameBookComp,
            companionIndex: 0,
            deVigPreference: deVigPref,
            nowIso,
            v5: effectiveV5,
            homeHistory: options.homeHistory,
            awayHistory: options.awayHistory,
            finalStats: options.finalStats,
            contextBullets: [
              `Proyección ${gkEval.expectedSaves.toFixed(2)} atajadas · Guardia >= ${FOOTBALL_PROP_MIN_MINUTES} min (${gk.appearances} PJ)`,
            ],
            playerMeta: meta,
            isDerived: !quoteAllowed,
            projectedScoreLabel,
          }),
        );
      }
    }

    if (options.homeSquad || options.awaySquad) {
      const derivedSquadProps = deriveMatchPlayerPropsV6({
        gameId: game.id,
        league: leagueSlug,
        sport: "football",
        homeTeamName: game.home.name,
        homeTeamSlug: game.home.slug,
        awayTeamName: game.away.name,
        awayTeamSlug: game.away.slug,
        homeSquad: options.homeSquad ?? null,
        awaySquad: options.awaySquad ?? null,
        homeProjectedGoals: socEval.muHome,
        awayProjectedGoals: socEval.muAway,
        homeExpectedShots: socEval.microMarkets.metrics.shots.muHome,
        awayExpectedShots: socEval.microMarkets.metrics.shots.muAway,
        homeExpectedSoT: socEval.microMarkets.metrics.shots_on_target.muHome,
        awayExpectedSoT: socEval.microMarkets.metrics.shots_on_target.muAway,
        injuryStatusByTeamPlayer: injuryLookup.resolvedMap,
        allowFull: true,
      });

      for (const dp of derivedSquadProps) {
        const reportedInjury = lookupPlayerInjuryStatus(injuryLookup, dp.teamSide, dp.playerName);
        if (isHardBlockedAvailabilityV6(dp.availabilityStatus, reportedInjury)) continue;
        const statKey: PlayerPropMeta["statKey"] =
          dp.marketKey === "player_shots" ? "shots" : "shots_on_target";
        const keySuffix =
          dp.marketKey === "player_saves"
            ? "player_saves"
            : dp.marketKey === "player_shots"
              ? "shots"
              : "shots_on_target";
        const meta: PlayerPropMeta = {
          playerName: dp.playerName,
          playerSlug: dp.playerSlug,
          teamSide: dp.teamSide,
          teamName: dp.teamName,
          teamSlug: dp.teamSlug,
          photoKey: dp.photoKey,
          position: dp.positionLabel ?? (dp.marketKey === "player_saves" ? "GK" : "MID"),
          statKey,
          statLabel: dp.marketLabel,
          minMinutesGuard: FOOTBALL_PROP_MIN_MINUTES,
          qualifyingMatches: dp.sampleGames,
          avgMinutes: dp.avgMinutes,
          lineupStatus: dp.lineupStatus ?? "probable",
          projectionMean: dp.projectionMean,
          projectionSd: dp.projectionSd,
        };
        additionalPicks.push(
          buildNewCatalogPickItem({
            game,
            family: "player_props_football",
            selectionKey: `${dp.playerSlug}_${keySuffix}_over_${dp.line}`,
            label: `${dp.playerName} · ${dp.selectionLabel}`,
            line: dp.line,
            direction: "over",
            axisOverride: "player_prop",
            p: dp.pOver,
            marketQuote: null,
            deVigPreference: deVigPref,
            nowIso,
            v5: effectiveV5,
            homeHistory: options.homeHistory,
            awayHistory: options.awayHistory,
            finalStats: options.finalStats,
            contextBullets: [dp.rationaleEs],
            playerMeta: meta,
            isDerived: true,
            projectedScoreLabel,
          }),
        );
      }
    }
  }

  const microLineLookup = (
    metricKey: "corners" | "yellow_cards" | "fouls" | "shots" | "shots_on_target",
    line: number | null,
    direction: PickDirection,
  ): number | null => {
    if (line === null) return null;
    const lines = socEval.microMarkets.metrics[metricKey].totalLines;
    const found = lines.find((entry) => Math.abs(entry.line - line) < 0.01);
    if (!found) return null;
    return direction === "under" ? found.pUnderConditionalNoPush : found.pOverConditionalNoPush;
  };

  const ep2 = socEval.earlyPayout2Goals;
  const enrichedPicks: CatalogPickItem[] = [];
  const seenKeys = new Set<string>();

  for (const item of baseCatalog.picks) {
    if (item.family === "player_props_football") {
      const updatedProp = resolveFootballBasePlayerPropV6({
        item,
        injuryLookup,
        coupledShotsByPlayerLine,
        rejectedCoupledPlayerMetrics,
      });
      if (updatedProp) {
        const dedupKey = `${updatedProp.family}|${updatedProp.selectionKey.toLowerCase()}|${updatedProp.line ?? ""}`;
        if (!seenKeys.has(dedupKey)) {
          seenKeys.add(dedupKey);
          enrichedPicks.push(updatedProp);
        }
      }
      continue;
    }

    let updated = item;
    if (item.family === "1x2") {
      if (item.selectionKey === "home") {
        updated = repriceCatalogPickWithV6Prob(item, x12Partition.home, {
          extraBullets: [
            formatConformal90BulletEs(params.homeBand),
            `Pago anticipado +2 goles: ${(ep2.pHomeEarlyPayoutWin * 100).toFixed(1)} % (+${(ep2.homeEarlyPayoutLift * 100).toFixed(1)} pts)`,
          ],
        });
      } else if (item.selectionKey === "draw") {
        updated = repriceCatalogPickWithV6Prob(item, x12Partition.draw, {
          extraBullets: params.drawBand ? [formatConformal90BulletEs(params.drawBand)] : undefined,
        });
      } else if (item.selectionKey === "away") {
        updated = repriceCatalogPickWithV6Prob(item, x12Partition.away, {
          extraBullets: [
            formatConformal90BulletEs(params.awayBand),
            `Pago anticipado +2 goles: ${(ep2.pAwayEarlyPayoutWin * 100).toFixed(1)} % (+${(ep2.awayEarlyPayoutLift * 100).toFixed(1)} pts)`,
          ],
        });
      }
    } else if (item.family === "double_chance") {
      if (item.selectionKey === "1x") {
        updated = repriceCatalogPickWithV6Prob(item, x12Partition.dc1x);
      } else if (item.selectionKey === "x2") {
        updated = repriceCatalogPickWithV6Prob(item, x12Partition.dcx2);
      } else if (item.selectionKey === "12") {
        updated = repriceCatalogPickWithV6Prob(item, x12Partition.dc12);
      }
    } else if (item.family === "dnb") {
      if (item.selectionKey === "home") {
        updated = repriceCatalogPickWithV6Prob(item, dnbPair.first);
      } else if (item.selectionKey === "away") {
        updated = repriceCatalogPickWithV6Prob(item, dnbPair.second);
      }
    } else if (item.family === "totals" && item.line !== null) {
      if (Math.abs(item.line - 1.5) < 0.01) {
        updated = repriceCatalogPickWithV6Prob(
          item,
          item.direction === "over" ? tot15Pair.first : tot15Pair.second,
        );
      } else if (Math.abs(item.line - 2.5) < 0.01) {
        updated = repriceCatalogPickWithV6Prob(
          item,
          item.direction === "over" ? tot25Pair.first : tot25Pair.second,
          {
            extraBullets:
              item.direction === "over" ? [formatConformal90BulletEs(over25Band)] : undefined,
          },
        );
      } else if (Math.abs(item.line - 3.5) < 0.01) {
        updated = repriceCatalogPickWithV6Prob(
          item,
          item.direction === "over" ? tot35Pair.first : tot35Pair.second,
        );
      } else {
        const pair = calibrateVennAbersBinaryPartitionV6(
          item.pricing.p,
          1 - item.pricing.p,
          leagueSlug,
          applyVa,
        );
        updated = repriceCatalogPickWithV6Prob(item, pair.first);
      }
    } else if (item.family === "btts") {
      updated = repriceCatalogPickWithV6Prob(
        item,
        item.direction === "yes" ? bttsPair.first : bttsPair.second,
        {
          extraBullets:
            item.direction === "yes" ? [formatConformal90BulletEs(bttsYesBand)] : undefined,
        },
      );
    } else if (item.family === "asian_handicap" && item.line !== null) {
      const homeLine = item.direction === "away" ? normalizeZero(-item.line) : normalizeZero(item.line);
      const ah = ahMap.get(homeLine.toFixed(1));
      if (ah) {
        const pCal = item.direction === "away" ? ah.pAway : ah.pHome;
        updated = repriceCatalogPickWithV6Prob(item, pCal);
      } else {
        const pair = calibrateVennAbersBinaryPartitionV6(
          item.pricing.p,
          1 - item.pricing.p,
          leagueSlug,
          applyVa,
        );
        updated = repriceCatalogPickWithV6Prob(item, pair.first);
      }
    } else if (item.family === "team_totals" || item.family === "clean_sheet" || item.family === "corners_team") {
      const pair = calibrateVennAbersBinaryPartitionV6(
        item.pricing.p,
        1 - item.pricing.p,
        leagueSlug,
        applyVa,
      );
      updated = repriceCatalogPickWithV6Prob(item, pair.first);
    } else if (item.family === "half_time_result" && htPartition) {
      const pCal =
        item.selectionKey === "ht_home"
          ? htPartition.home
          : item.selectionKey === "ht_draw"
            ? htPartition.draw
            : htPartition.away;
      updated = repriceCatalogPickWithV6Prob(item, pCal);
    } else if (item.family === "second_half_result" && shPartition) {
      const pCal =
        item.selectionKey === "2h_home"
          ? shPartition.home
          : item.selectionKey === "2h_draw"
            ? shPartition.draw
            : shPartition.away;
      updated = repriceCatalogPickWithV6Prob(item, pCal);
    } else if (item.family === "corners_total") {
      const mp = microLineLookup("corners", item.line, item.direction);
      updated = repriceCatalogPickWithV6Prob(item, mp ?? item.pricing.p);
    } else if (item.family === "shots_total") {
      const mp = microLineLookup("shots", item.line, item.direction);
      updated = repriceCatalogPickWithV6Prob(item, mp ?? item.pricing.p);
    } else if (item.family === "shots_on_target") {
      const mp = microLineLookup("shots_on_target", item.line, item.direction);
      updated = repriceCatalogPickWithV6Prob(item, mp ?? item.pricing.p);
    } else if (item.family === "fouls_total") {
      const mp = microLineLookup("fouls", item.line, item.direction);
      updated = repriceCatalogPickWithV6Prob(item, mp ?? item.pricing.p);
    } else if (item.family === "cards_total") {
      const mp = microLineLookup("yellow_cards", item.line, item.direction);
      updated = repriceCatalogPickWithV6Prob(item, mp ?? item.pricing.p, {
        extraBullets: [
          `Puntos por tarjeta proyectados: ${bookingPts.expectedBookingPoints.toFixed(1)} pts (roja ${(redProb * 100).toFixed(1)} %)`,
        ],
      });
    } else {
      updated = repriceCatalogPickWithV6Prob(item, calProb(item.pricing.p));
    }

    const dedupKey = `${updated.family}|${updated.selectionKey.toLowerCase()}|${updated.line ?? ""}`;
    if (!seenKeys.has(dedupKey)) {
      seenKeys.add(dedupKey);
      enrichedPicks.push(updated);
    }
  }

  for (const extra of additionalPicks) {
    const dedupKey = `${extra.family}|${extra.selectionKey.toLowerCase()}|${extra.line ?? ""}`;
    if (!seenKeys.has(dedupKey)) {
      seenKeys.add(dedupKey);
      enrichedPicks.push(extra);
    }
  }

  return rebuildCatalogSummary(baseCatalog, enrichedPicks, false);
}

function enrichUsCatalogWithV6(params: {
  readonly game: PlatformGame;
  readonly baseCatalog: MatchPicksCatalog;
  readonly msEval: UsMultisportV6MatchEvaluation;
  readonly homeBand: EpistemicProbabilityBandV5;
  readonly awayBand: EpistemicProbabilityBandV5;
  readonly effectiveV5: MatchIntelligenceV5View;
  readonly quoteIndex: ReadonlyMap<string, SameBookQuoteEntry>;
  readonly options: ServerMatchPicksCatalogOptions;
  readonly allowedFamilies: ReadonlySet<MarketFamilyId> | undefined;
  readonly nowIso: string;
}): MatchPicksCatalog {
  const { game, baseCatalog, msEval, options, allowedFamilies, nowIso, effectiveV5, quoteIndex } =
    params;
  const out = msEval.outlook;
  const ep = msEval.earlyPayoutAnchored;
  const epUnit =
    msEval.sport === "mlb"
      ? "carreras"
      : msEval.sport === "nhl"
        ? "goles"
        : "puntos";
  const epHomeBullet = `Pago anticipado +${ep.trigger_lead} ${epUnit}: ${(ep.p_home_early_payout_win * 100).toFixed(1)} % (+${(ep.home_early_payout_lift * 100).toFixed(1)} pts)`;
  const epAwayBullet = `Pago anticipado +${ep.trigger_lead} ${epUnit}: ${(ep.p_away_early_payout_win * 100).toFixed(1)} % (+${(ep.away_early_payout_lift * 100).toFixed(1)} pts)`;
  const home = game.home.shortName || game.home.name;
  const away = game.away.shortName || game.away.name;
  const deVigPref = options.deVigPreference ?? "auto";
  const projectedScoreLabel = baseCatalog.picks[0]?.projectedScoreLabel ?? null;
  const injuryLookup = buildInjuryLookupForGame(game, options.injuryStatusByTeamPlayer, {
    homeSquad: options.homeSquad,
    awaySquad: options.awaySquad,
  });

  const rawX12 = game.x12;
  const hasExplicitX12 = Boolean(rawX12 && rawX12[0] + rawX12[2] > 0);
  const pHomeAnchor = hasExplicitX12
    ? clampProb(rawX12![0] / (rawX12![0] + rawX12![2]))
    : clampProb(out.p_home);
  const pAwayAnchor = clampProb(1 - pHomeAnchor);

  const nflExpectedMargin =
    msEval.sport === "nfl"
      ? game.projection && Number.isFinite(game.projection.home) && Number.isFinite(game.projection.away)
        ? game.projection.home - game.projection.away
        : out.sport === "nfl" && msEval.resolvedFromState
          ? out.expected_margin
          : solveNflMarginFromWinProbV6(pHomeAnchor).expected_margin
      : 0;
  const nflExpectedTotal =
    msEval.sport === "nfl"
      ? game.projection && Number.isFinite(game.projection.total) && game.projection.total > 15
        ? game.projection.total
        : out.sport === "nfl"
          ? out.expected_total
          : 44.5
      : 0;

  const existingNflSpreadLines =
    msEval.sport === "nfl"
      ? baseCatalog.picks
          .filter((p) => p.family === "nfl_spread" && p.direction === "home" && p.line !== null)
          .map((p) => p.line!)
      : [];
  const existingNflTotalLines =
    msEval.sport === "nfl"
      ? baseCatalog.picks
          .filter((p) => p.family === "nfl_totals" && p.line !== null)
          .map((p) => p.line!)
      : [];

  const nflSpreadLinesAll =
    msEval.sport === "nfl"
      ? Array.from(
          new Set([
            ...existingNflSpreadLines,
            ...(options.nflAltSpreadLines ?? NFL_DEFAULT_ALT_SPREAD_LINES),
          ]),
        ).sort((a, b) => a - b)
      : [];
  const nflTotalLinesAll =
    msEval.sport === "nfl"
      ? Array.from(
          new Set([
            ...existingNflTotalLines,
            ...(options.nflAltTotalLines ?? NFL_DEFAULT_ALT_TOTAL_LINES),
          ]),
        ).sort((a, b) => a - b)
      : [];

  const nflSpreadEval =
    msEval.sport === "nfl"
      ? evaluateNflAltSpreadV6({
          expectedMargin: nflExpectedMargin,
          spreadHome: roundToHalf(-nflExpectedMargin),
          altLines: nflSpreadLinesAll,
        })
      : null;
  const nflTotalEval =
    msEval.sport === "nfl"
      ? evaluateNflAltTotalV6({
          expectedTotal: nflExpectedTotal,
          line: roundToHalf(nflExpectedTotal),
          altLines: nflTotalLinesAll,
        })
      : null;

  const nbaArtifactCfg = getMultisportArtifactV6().physics_config.nba;
  const nbaExpectedMargin =
    out.sport === "nba"
      ? msEval.resolvedFromState
        ? out.expected_margin
        : game.projection
          ? game.projection.home - game.projection.away
          : out.expected_margin
      : 0;
  const nbaSigmaMargin =
    out.sport === "nba" ? out.sigma_margin_effective : nbaArtifactCfg.sigma_margin_base;
  const nbaExpectedTotal =
    out.sport === "nba"
      ? msEval.resolvedFromState
        ? out.expected_total
        : game.projection?.total ?? out.expected_total
      : 0;
  const nbaSigmaTotal = nbaArtifactCfg.sigma_total_base;

  const nbaCandidatesBySlug = new Map<string, NbaPlayerPropCandidateInput>();
  for (const cand of options.nbaPlayers ?? []) {
    const slug = cand.playerSlug ?? slugifyPlayerName(cand.playerName);
    nbaCandidatesBySlug.set(slug, cand);
  }

  const enrichedPicks: CatalogPickItem[] = [];
  const seenKeys = new Set<string>();

  for (const item of baseCatalog.picks) {
    if (item.family === "nba_player_props") {
      const updatedProp = resolveNbaBasePlayerPropV6({
        item,
        injuryLookup,
        nbaCandidatesBySlug,
      });
      if (updatedProp) {
        const dedupKey = `${updatedProp.family}|${updatedProp.selectionKey.toLowerCase()}|${updatedProp.line ?? ""}`;
        if (!seenKeys.has(dedupKey)) {
          seenKeys.add(dedupKey);
          enrichedPicks.push(updatedProp);
        }
      }
      continue;
    }

    let updated = item;
    if (
      item.family === "nba_moneyline" ||
      item.family === "mlb_moneyline" ||
      item.family === "nhl_moneyline" ||
      item.family === "nfl_moneyline"
    ) {
      if (item.selectionKey === "home") {
        updated = repriceCatalogPickWithV6Prob(item, pHomeAnchor, {
          extraBullets: [formatConformal90BulletEs(params.homeBand), epHomeBullet],
        });
      } else if (item.selectionKey === "away") {
        updated = repriceCatalogPickWithV6Prob(item, pAwayAnchor, {
          extraBullets: [formatConformal90BulletEs(params.awayBand), epAwayBullet],
        });
      }
    } else if (item.family === "mlb_run_line" && out.sport === "mlb" && item.line !== null) {
      const isHome = item.direction === "home";
      const rawP =
        isHome && item.line < 0
          ? out.full_game.p_runline_home_minus_1_5
          : isHome && item.line > 0
            ? out.full_game.p_runline_home_plus_1_5
            : !isHome && item.line < 0
              ? out.full_game.p_runline_away_minus_1_5
              : out.full_game.p_runline_away_plus_1_5;
      updated = repriceCatalogPickWithV6Prob(item, rawP);
    } else if (item.family === "mlb_f5" && out.sport === "mlb") {
      if (item.selectionKey === "f5_home") {
        updated = repriceCatalogPickWithV6Prob(item, out.f5.p_home);
      } else if (item.selectionKey === "f5_tie") {
        updated = repriceCatalogPickWithV6Prob(item, out.f5.p_tie);
      } else if (item.selectionKey === "f5_away") {
        updated = repriceCatalogPickWithV6Prob(item, out.f5.p_away);
      } else if (item.line !== null && Math.abs(item.line - 4.5) < 0.01) {
        const rawP = item.direction === "under" ? 1 - out.f5.p_over_4_5 : out.f5.p_over_4_5;
        updated = repriceCatalogPickWithV6Prob(item, rawP);
      } else {
        updated = repriceCatalogPickWithV6Prob(item, item.pricing.p);
      }
    } else if (item.family === "mlb_totals" && out.sport === "mlb" && item.line !== null) {
      const entry = out.full_game.totals_by_line[item.line.toFixed(1)];
      if (entry) {
        const rawP = item.direction === "under" ? entry.p_under_no_push : entry.p_over_no_push;
        updated = repriceCatalogPickWithV6Prob(item, rawP);
      } else {
        updated = repriceCatalogPickWithV6Prob(item, item.pricing.p);
      }
    } else if (item.family === "nhl_puck_line" && out.sport === "nhl" && item.line !== null) {
      const isHome = item.direction === "home";
      const rawP =
        isHome && item.line < 0
          ? out.p_puckline_home_minus_1_5
          : isHome && item.line > 0
            ? out.p_puckline_home_plus_1_5
            : !isHome && item.line < 0
              ? out.p_puckline_away_minus_1_5
              : out.p_puckline_away_plus_1_5;
      updated = repriceCatalogPickWithV6Prob(item, rawP);
    } else if (item.family === "nhl_totals" && out.sport === "nhl" && item.line !== null) {
      const entry = out.totals_by_line[item.line.toFixed(1)];
      if (entry) {
        const rawP = item.direction === "under" ? entry.p_under_no_push : entry.p_over_no_push;
        updated = repriceCatalogPickWithV6Prob(item, rawP);
      } else {
        updated = repriceCatalogPickWithV6Prob(item, item.pricing.p);
      }
    } else if (item.family === "nba_spread" && out.sport === "nba" && item.line !== null) {
      const hLine = item.direction === "away" ? normalizeZero(-item.line) : normalizeZero(item.line);
      const pHomeCover = clampProb(1 - soccer57NormalCdfV60((-hLine - nbaExpectedMargin) / nbaSigmaMargin));
      const rawP = item.direction === "away" ? 1 - pHomeCover : pHomeCover;
      updated = repriceCatalogPickWithV6Prob(item, rawP);
    } else if (item.family === "nba_totals" && out.sport === "nba" && item.line !== null) {
      const entry = out.totals_by_line[item.line.toFixed(1)];
      const rawP = entry
        ? item.direction === "under"
          ? entry.p_under_no_push
          : entry.p_over_no_push
        : item.direction === "under"
          ? soccer57NormalCdfV60((item.line - nbaExpectedTotal) / nbaSigmaTotal)
          : 1 - soccer57NormalCdfV60((item.line - nbaExpectedTotal) / nbaSigmaTotal);
      updated = repriceCatalogPickWithV6Prob(item, rawP);
    } else if (item.family === "nfl_spread" && nflSpreadEval && item.line !== null) {
      const hLine = item.direction === "away" ? normalizeZero(-item.line) : normalizeZero(item.line);
      const proj = nflSpreadEval.byLine[hLine.toFixed(1)];
      if (proj) {
        const rawP =
          item.direction === "away" ? proj.p_away_cover_no_push : proj.p_home_cover_no_push;
        updated = repriceCatalogPickWithV6Prob(item, rawP, {
          extraBullets: [
            `Núcleo discreto NFL (±3 ${(nflSpreadEval.keyNumberMasses.m3 * 100).toFixed(1)} % · ±7 ${(nflSpreadEval.keyNumberMasses.m7 * 100).toFixed(1)} %)`,
          ],
        });
      }
    } else if (item.family === "nfl_totals" && nflTotalEval && item.line !== null) {
      const proj = nflTotalEval.byLine[item.line.toFixed(1)];
      if (proj) {
        const rawP = item.direction === "under" ? proj.p_under_no_push : proj.p_over_no_push;
        updated = repriceCatalogPickWithV6Prob(item, rawP, {
          extraBullets: [`Total discreto NFL proyectado: ${nflTotalEval.expectedTotalImplied.toFixed(1)} puntos`],
        });
      } else {
        updated = repriceCatalogPickWithV6Prob(item, item.pricing.p);
      }
    } else {
      updated = repriceCatalogPickWithV6Prob(item, item.pricing.p);
    }

    const dedupKey = `${updated.family}|${updated.selectionKey.toLowerCase()}|${updated.line ?? ""}`;
    if (!seenKeys.has(dedupKey)) {
      seenKeys.add(dedupKey);
      enrichedPicks.push(updated);
    }
  }

  if (msEval.sport === "nfl" && nflSpreadEval && (!allowedFamilies || allowedFamilies.has("nfl_spread"))) {
    for (const hLine of nflSpreadLinesAll) {
      const proj = nflSpreadEval.byLine[hLine.toFixed(1)];
      if (!proj) continue;
      const aLine = normalizeZero(-hLine);
      const qSH = lookupQuoteV6(quoteIndex, [
        `spread|home_${formatSignedLine(hLine)}|${hLine}`,
        `spread|home|${hLine}`,
        `spreads|home|${hLine}`,
        `nfl_spread|home|${hLine}`,
      ]);
      const qSA = lookupQuoteV6(quoteIndex, [
        `spread|away_${formatSignedLine(aLine)}|${aLine}`,
        `spread|away|${aLine}`,
        `spreads|away|${aLine}`,
        `nfl_spread|away|${aLine}`,
      ]);
      const comp = resolveSameBookCompanionDecimalsV6([qSH, qSA]);
      const notes =
        proj.p_push > 0.005
          ? [
              `Núcleo discreto NFL (±3 / ±7) · push ${(proj.p_push * 100).toFixed(1)} %`,
            ]
          : ["Núcleo discreto de números clave NFL (±3 / ±7)"];

      const homeKey = `home_${formatSignedLine(hLine)}`;
      const homeDedup = `nfl_spread|${homeKey.toLowerCase()}|${hLine}`;
      if (!seenKeys.has(homeDedup)) {
        seenKeys.add(homeDedup);
        enrichedPicks.push(
          buildNewCatalogPickItem({
            game,
            family: "nfl_spread",
            selectionKey: homeKey,
            label: `${home} (${formatSignedLine(hLine)} puntos)`,
            line: hLine,
            direction: "home",
            p: proj.p_home_cover_no_push,
            marketQuote: qSH,
            companionDecimals: comp,
            companionIndex: 0,
            deVigPreference: deVigPref,
            nowIso,
            v5: effectiveV5,
            homeHistory: options.homeHistory,
            awayHistory: options.awayHistory,
            finalStats: options.finalStats,
            contextBullets: notes,
            conflictGroup: "home_side",
            isDerived: !qSH,
            projectedScoreLabel,
          }),
        );
      }

      const awayKey = `away_${formatSignedLine(aLine)}`;
      const awayDedup = `nfl_spread|${awayKey.toLowerCase()}|${aLine}`;
      if (!seenKeys.has(awayDedup)) {
        seenKeys.add(awayDedup);
        enrichedPicks.push(
          buildNewCatalogPickItem({
            game,
            family: "nfl_spread",
            selectionKey: awayKey,
            label: `${away} (${formatSignedLine(aLine)} puntos)`,
            line: aLine,
            direction: "away",
            p: proj.p_away_cover_no_push,
            marketQuote: qSA,
            companionDecimals: comp,
            companionIndex: 1,
            deVigPreference: deVigPref,
            nowIso,
            v5: effectiveV5,
            homeHistory: options.homeHistory,
            awayHistory: options.awayHistory,
            finalStats: options.finalStats,
            contextBullets: notes,
            conflictGroup: "away_side",
            isDerived: !qSA,
            projectedScoreLabel,
          }),
        );
      }
    }
  }

  if (msEval.sport === "nfl" && nflTotalEval && (!allowedFamilies || allowedFamilies.has("nfl_totals"))) {
    for (const line of nflTotalLinesAll) {
      const proj = nflTotalEval.byLine[line.toFixed(1)];
      if (!proj) continue;
      const qO = lookupQuoteV6(quoteIndex, [
        `totals|over_${line}|${line}`,
        `totals|over|${line}`,
        `nfl_totals|over|${line}`,
      ]);
      const qU = lookupQuoteV6(quoteIndex, [
        `totals|under_${line}|${line}`,
        `totals|under|${line}`,
        `nfl_totals|under|${line}`,
      ]);
      const comp = resolveSameBookCompanionDecimalsV6([qO, qU]);
      const notes = [
        `Total discreto NFL proyectado: ${nflTotalEval.expectedTotalImplied.toFixed(1)} puntos`,
      ];

      const overKey = `over_${line}`;
      const overDedup = `nfl_totals|${overKey.toLowerCase()}|${line}`;
      if (!seenKeys.has(overDedup)) {
        seenKeys.add(overDedup);
        enrichedPicks.push(
          buildNewCatalogPickItem({
            game,
            family: "nfl_totals",
            selectionKey: overKey,
            label: `Más de ${line} puntos`,
            line,
            direction: "over",
            p: proj.p_over_no_push,
            marketQuote: qO,
            companionDecimals: comp,
            companionIndex: 0,
            deVigPreference: deVigPref,
            nowIso,
            v5: effectiveV5,
            homeHistory: options.homeHistory,
            awayHistory: options.awayHistory,
            finalStats: options.finalStats,
            contextBullets: notes,
            isDerived: !qO,
            projectedScoreLabel,
          }),
        );
      }

      const underKey = `under_${line}`;
      const underDedup = `nfl_totals|${underKey.toLowerCase()}|${line}`;
      if (!seenKeys.has(underDedup)) {
        seenKeys.add(underDedup);
        enrichedPicks.push(
          buildNewCatalogPickItem({
            game,
            family: "nfl_totals",
            selectionKey: underKey,
            label: `Menos de ${line} puntos`,
            line,
            direction: "under",
            p: proj.p_under_no_push,
            marketQuote: qU,
            companionDecimals: comp,
            companionIndex: 1,
            deVigPreference: deVigPref,
            nowIso,
            v5: effectiveV5,
            homeHistory: options.homeHistory,
            awayHistory: options.awayHistory,
            finalStats: options.finalStats,
            contextBullets: notes,
            isDerived: !qU,
            projectedScoreLabel,
          }),
        );
      }
    }
  }

  if (
    msEval.sport === "nba" &&
    (options.homeSquad || options.awaySquad) &&
    (!allowedFamilies || allowedFamilies.has("nba_player_props"))
  ) {
    const derivedNbaProps = deriveMatchPlayerPropsV6({
      gameId: game.id,
      league: String(game.league),
      sport: "basketball",
      homeTeamName: game.home.name,
      homeTeamSlug: game.home.slug,
      awayTeamName: game.away.name,
      awayTeamSlug: game.away.slug,
      homeSquad: options.homeSquad ?? null,
      awaySquad: options.awaySquad ?? null,
      injuryStatusByTeamPlayer: injuryLookup.resolvedMap,
      allowFull: true,
    });
    for (const dp of derivedNbaProps) {
      const code = dp.marketKey.replace(/^nba_/, "").toUpperCase();
      if (code !== "PTS" && code !== "REB" && code !== "AST" && code !== "3PM") continue;
      const reportedInjury = lookupPlayerInjuryStatus(injuryLookup, dp.teamSide, dp.playerName);
      if (isHardBlockedAvailabilityV6(dp.availabilityStatus, reportedInjury)) continue;
      const dedupKey = `nba_player_props|${dp.playerSlug}_${code.toLowerCase()}_over_${dp.line}|${dp.line}`;
      if (seenKeys.has(dedupKey)) continue;
      seenKeys.add(dedupKey);

      const meta: PlayerPropMeta = {
        playerName: dp.playerName,
        playerSlug: dp.playerSlug,
        teamSide: dp.teamSide,
        teamName: dp.teamName,
        teamSlug: dp.teamSlug,
        photoKey: dp.photoKey,
        position: dp.positionLabel ?? "G",
        statKey: code,
        statLabel: dp.marketLabel,
        minMinutesGuard: NBA_PROP_DEFAULT_MIN_MINUTES,
        qualifyingMatches: dp.sampleGames,
        avgMinutes: dp.avgMinutes,
        lineupStatus: "probable",
        projectionMean: dp.projectionMean,
        projectionSd: dp.projectionSd,
      };
      const windows =
        dp.recentValues.length >= 3
          ? buildNumericSeriesEvidenceWindows({
              values: dp.recentValues,
              line: dp.line,
              direction: "over",
              subjectLabel: dp.playerName,
            })
          : [];
      enrichedPicks.push(
        buildNewCatalogPickItem({
          game,
          family: "nba_player_props",
          selectionKey: `${dp.playerSlug}_${code.toLowerCase()}_over_${dp.line}`,
          label: `${dp.playerName} · ${dp.selectionLabel}`,
          line: dp.line,
          direction: "over",
          axisOverride: "player_prop",
          p: dp.pOver,
          marketQuote: null,
          deVigPreference: deVigPref,
          nowIso,
          v5: effectiveV5,
          homeHistory: options.homeHistory,
          awayHistory: options.awayHistory,
          finalStats: options.finalStats,
          precomputedWindows: windows,
          contextBullets: [dp.rationaleEs],
          playerMeta: meta,
          isDerived: true,
          projectedScoreLabel,
        }),
      );
    }
  }

  return rebuildCatalogSummary(baseCatalog, enrichedPicks, false);
}

function rankPickForCompaction(item: CatalogPickItem): number {
  const primaryBonus = item.isPrimaryModelPick ? 120 : 0;
  const recommendedBonus = item.isRecommendedByModel ? 70 : 0;
  const trivialPenalty = item.recommendationTier === "trivial_odds" ? -120 : 0;
  const anomalyPenalty = isHardAnomalousCatalogPick(item) ? -240 : 0;
  const negativeEvPenalty =
    item.pricing.evPct !== null && Number.isFinite(item.pricing.evPct) && item.pricing.evPct < 0
      ? -25
      : 0;
  const recScore = item.recommendationScore ?? 0;
  const evLimit = isSharpCatalogBook(item.pricing.marketBookLabel)
    ? MAX_SHARP_EV_PCT
    : MAX_SOFT_EV_PCT;
  const cappedEv =
    item.pricing.hasPositiveValue && item.pricing.evPct !== null
      ? Math.min(evLimit, Math.max(0, item.pricing.evPct))
      : 0;
  const valueBonus = cappedEv > 0 ? 35 + Math.min(25, cappedEv * 1.8) : 0;
  const quoteBonus = item.pricing.marketDecimal !== null ? 12 : 0;
  const playableZoneBonus =
    item.pricing.fairOdds >= PLAYABLE_ODDS_MIN_V60 && item.pricing.fairOdds <= PLAYABLE_ODDS_MAX_V60
      ? 6
      : 0;
  return (
    primaryBonus +
    recommendedBonus +
    trivialPenalty +
    anomalyPenalty +
    negativeEvPenalty +
    recScore +
    valueBonus +
    quoteBonus +
    playableZoneBonus
  );
}

function selectDiverseFamilySlice(
  items: readonly CatalogPickItem[],
  maxPerFamily: number,
): CatalogPickItem[] {
  const sorted = items.slice().sort((a, b) => rankPickForCompaction(b) - rankPickForCompaction(a));
  const picked: CatalogPickItem[] = [];
  const usedIds = new Set<string>();
  const usedSignatures = new Set<string>();

  for (const item of sorted) {
    if (picked.length >= maxPerFamily) break;
    const sig = `${item.direction}|${item.line ?? ""}`;
    if (usedSignatures.has(sig)) continue;
    usedSignatures.add(sig);
    usedIds.add(item.id);
    picked.push(item);
  }

  for (const item of sorted) {
    if (picked.length >= maxPerFamily) break;
    if (usedIds.has(item.id)) continue;
    usedIds.add(item.id);
    picked.push(item);
  }

  return picked;
}

function rebuildCatalogSummary(
  base: MatchPicksCatalog,
  picks: readonly CatalogPickItem[],
  isRedactedForVisitor: boolean,
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
    isRedactedForVisitor,
    totalPicks: picks.length,
    availableFamilies,
    familyCounts,
    picks,
  };
}

export function compactCatalogPayload(
  catalog: MatchPicksCatalog,
  options: {
    readonly maxPicksPerFamily?: number;
    readonly maxTotalPicks?: number;
    readonly compact?: boolean;
    readonly preserveAll?: boolean;
  } = {},
): MatchPicksCatalog {
  const compactMode = options.compact ?? true;
  const guardedPicks = catalog.picks.filter(
    (item) =>
      Boolean(item.isRedacted) ||
      (item.family !== "player_props_football" && item.family !== "nba_player_props") ||
      Boolean(item.playerMeta),
  );

  if (options.preserveAll === true) {
    const preserved = compactMode
      ? guardedPicks.map((item) => ({
          ...item,
          evidence: {
            ...item.evidence,
            windows: item.evidence.windows.slice(0, 4),
            bullets: item.evidence.bullets.slice(0, 3),
          },
          ...(item.bookQuotes && item.bookQuotes.length > 0
            ? { bookQuotes: item.bookQuotes.slice(0, 2) }
            : {}),
        }))
      : guardedPicks;
    return rebuildCatalogSummary(catalog, preserved, catalog.isRedactedForVisitor);
  }

  const maxPerFamily = Math.max(1, options.maxPicksPerFamily ?? DEFAULT_MAX_PICKS_PER_FAMILY);
  const maxTotal = Math.max(1, options.maxTotalPicks ?? DEFAULT_MAX_TOTAL_PICKS);

  const sourcePicks =
    catalog.gameStatus === "FT"
      ? guardedPicks
      : guardedPicks.filter(
          (item) =>
            !isHardAnomalousCatalogPick(item) ||
            Boolean(item.isDailyOpenPromo) ||
            Boolean(item.isTipsterWeeklyOpen),
        );

  const byFamily = new Map<MarketFamilyId, CatalogPickItem[]>();
  for (const item of sourcePicks) {
    const list = byFamily.get(item.family) ?? [];
    list.push(item);
    byFamily.set(item.family, list);
  }

  const familyBest: CatalogPickItem[] = [];
  const trimmedPerFamily: CatalogPickItem[] = [];
  for (const items of byFamily.values()) {
    const sorted = selectDiverseFamilySlice(items, maxPerFamily);
    if (sorted[0]) {
      familyBest.push(sorted[0]);
    }
    trimmedPerFamily.push(...sorted);
  }

  familyBest.sort((a, b) => rankPickForCompaction(b) - rankPickForCompaction(a));

  const selected: CatalogPickItem[] = [];
  const selectedIds = new Set<string>();
  const signatureCounts = new Map<string, number>();

  const signatureOf = (item: CatalogPickItem): string =>
    `${item.family}|${item.line ?? ""}|${item.direction}`;

  for (const best of familyBest) {
    if (selected.length >= maxTotal) break;
    if (!selectedIds.has(best.id)) {
      selectedIds.add(best.id);
      const sig = signatureOf(best);
      signatureCounts.set(sig, (signatureCounts.get(sig) ?? 0) + 1);
      selected.push(best);
    }
  }

  const remainder = trimmedPerFamily
    .filter((item) => !selectedIds.has(item.id))
    .sort((a, b) => rankPickForCompaction(b) - rankPickForCompaction(a));

  for (const item of remainder) {
    if (selected.length >= maxTotal) break;
    const sig = signatureOf(item);
    if ((signatureCounts.get(sig) ?? 0) >= 1) continue;
    selectedIds.add(item.id);
    signatureCounts.set(sig, 1);
    selected.push(item);
  }

  for (const item of remainder) {
    if (selected.length >= maxTotal) break;
    if (selectedIds.has(item.id)) continue;
    selectedIds.add(item.id);
    selected.push(item);
  }

  selected.sort((a, b) => rankPickForCompaction(b) - rankPickForCompaction(a));

  const finalPicks = compactMode
    ? selected.map((item) => ({
        ...item,
        evidence: {
          ...item.evidence,
          windows: item.evidence.windows.slice(0, 4),
          bullets: item.evidence.bullets.slice(0, 3),
        },
        ...(item.bookQuotes && item.bookQuotes.length > 0
          ? { bookQuotes: item.bookQuotes.slice(0, 2) }
          : {}),
      }))
    : selected;

  return rebuildCatalogSummary(catalog, finalPicks, catalog.isRedactedForVisitor);
}

export function buildServerMatchPicksCatalog(
  game: PlatformGame,
  options: ServerMatchPicksCatalogOptions,
): MatchPicksCatalog {
  const leagueCapability = getLeagueCapability(game.league);
  const allowedFamilies = leagueCapability
    ? new Set<MarketFamilyId>(leagueCapability.supportedMarketFamilies)
    : undefined;
  const nowIso = options.nowIso ?? new Date().toISOString();
  const markets = options.markets ?? game.markets ?? [];
  const hasForecast =
    game.hasForecast !== false &&
    Boolean(game.x12 || game.projection || game.picks.length > 0 || markets.length > 0);

  const hasUnlockedPickForGame = Boolean(
    options.unlockedPickIds &&
      options.unlockedPickIds.size > 0 &&
      (game.picks.some((p) => options.unlockedPickIds!.has(p.id)) ||
        Array.from(options.unlockedPickIds).some((id) => id.startsWith(game.id))),
  );
  const canFastRedactLockedVisitor =
    !options.fullAccess &&
    game.status !== "FT" &&
    !game.picks.some((p) => Boolean(p.isDailyOpenPromo || p.isTipsterWeeklyOpen)) &&
    !hasUnlockedPickForGame &&
    (!options.families || options.families.length === 0);

  let effectiveV5: MatchIntelligenceV5View | null = options.v5 ?? null;
  let socBundle: {
    readonly socEval: Soccer57V6MatchEvaluation;
    readonly homeBand: EpistemicProbabilityBandV5;
    readonly drawBand: EpistemicProbabilityBandV5 | null;
    readonly awayBand: EpistemicProbabilityBandV5;
  } | null = null;
  let usBundle: {
    readonly msEval: UsMultisportV6MatchEvaluation;
    readonly homeBand: EpistemicProbabilityBandV5;
    readonly awayBand: EpistemicProbabilityBandV5;
  } | null = null;

  const ctx: CatalogBuildContext = {
    markets,
    v5: effectiveV5,
    playerProps: canFastRedactLockedVisitor ? undefined : options.playerProps,
    footballPlayers: canFastRedactLockedVisitor ? undefined : options.footballPlayers,
    nbaPlayers: canFastRedactLockedVisitor ? undefined : options.nbaPlayers,
    homeHistory: canFastRedactLockedVisitor ? undefined : options.homeHistory,
    awayHistory: canFastRedactLockedVisitor ? undefined : options.awayHistory,
    f5Score: options.f5Score ?? null,
    finalStats: options.finalStats ?? null,
    allowedFamilies,
    deVigPreference: options.deVigPreference ?? "auto",
    nowIso,
  };

  let catalog = canFastRedactLockedVisitor ? buildMatchPicksCatalog(game, ctx) : null;

  if (!canFastRedactLockedVisitor || (catalog !== null && catalog.picks.length === 0 && hasForecast)) {
    if (hasForecast && game.sport === "football") {
      const rawX12 = game.x12;
      const sumX12 = rawX12 ? rawX12[0] + rawX12[1] + rawX12[2] : 0;
      const pHome = rawX12 && sumX12 > 0 ? rawX12[0] / sumX12 : 0.42;
      const pDraw = rawX12 && sumX12 > 0 ? rawX12[1] / sumX12 : 0.27;
      const pAway = rawX12 && sumX12 > 0 ? rawX12[2] / sumX12 : 0.31;
      const socEval = evaluateSoccer57V6Match({
        matchId: game.id,
        league: String(game.league),
        homeTeam: game.home.name,
        awayTeam: game.away.name,
        pHome,
        pDraw,
        pAway,
        projectedHomeGoals: game.projection?.home ?? null,
        projectedAwayGoals: game.projection?.away ?? null,
        totalGoalsTarget: game.projection?.total ?? null,
        refereeName: game.referee ?? game.preGame?.matchContext?.referee ?? null,
        mode: "matrix_4param",
        asianHandicapLines: SOCCER_AH_LINES_V6,
      });
      const built = buildSoccerV6IntelligenceView(game, socEval);
      if (!effectiveV5) {
        effectiveV5 = built.view;
      }
      socBundle = {
        socEval,
        homeBand: built.homeBand,
        drawBand: built.drawBand,
        awayBand: built.awayBand,
      };
    } else if (hasForecast) {
      const msSport = resolveSportKeyForMultisport(game.sport);
      if (msSport) {
        const rawX12 = game.x12;
        const twoWay = rawX12 ? rawX12[0] + rawX12[2] : 0;
        const livePHome = rawX12 && twoWay > 0 ? clampProb(rawX12[0] / twoWay) : null;
        const expMargin =
          game.projection && Number.isFinite(game.projection.home) && Number.isFinite(game.projection.away)
            ? game.projection.home - game.projection.away
            : null;
        const expTotal =
          game.projection && Number.isFinite(game.projection.total) && game.projection.total > 0
            ? game.projection.total
            : null;
        const msEval = evaluateUsMultisportV6Match({
          sport: msSport,
          homeTeam: game.home.name,
          awayTeam: game.away.name,
          homeCode: game.home.code,
          awayCode: game.away.code,
          gameDate: game.dayId || game.kickoffUtc.slice(0, 10),
          neutralSite: game.neutralSite,
          totalLine: game.goalLine?.line ?? null,
          livePHomeAnchor: livePHome,
          expectedMarginOverride: expMargin,
          expectedTotalOverride: expTotal,
        });
        const built = buildUsV6IntelligenceView(game, msEval, livePHome ?? msEval.outlook.p_home);
        if (!effectiveV5) {
          effectiveV5 = built.view;
        }
        usBundle = {
          msEval,
          homeBand: built.homeBand,
          awayBand: built.awayBand,
        };
      }
    }

    const fullCtx: CatalogBuildContext = {
      markets,
      v5: effectiveV5,
      playerProps: options.playerProps,
      footballPlayers: options.footballPlayers,
      nbaPlayers: options.nbaPlayers,
      homeHistory: options.homeHistory,
      awayHistory: options.awayHistory,
      f5Score: options.f5Score ?? null,
      finalStats: options.finalStats ?? null,
      allowedFamilies,
      deVigPreference: options.deVigPreference ?? "auto",
      nowIso,
    };

    catalog = buildMatchPicksCatalog(game, fullCtx);

    if (catalog.picks.length > 0 || (hasForecast && (socBundle !== null || usBundle !== null))) {
      if (socBundle && effectiveV5) {
        catalog = enrichFootballCatalogWithV6({
          game,
          baseCatalog: catalog,
          socEval: socBundle.socEval,
          homeBand: socBundle.homeBand,
          drawBand: socBundle.drawBand,
          awayBand: socBundle.awayBand,
          effectiveV5,
          options,
          allowedFamilies,
          nowIso,
        });
      } else if (usBundle && effectiveV5) {
        const quoteIndex = buildSameBookQuoteIndexV6(markets, nowIso);
        catalog = enrichUsCatalogWithV6({
          game,
          baseCatalog: catalog,
          msEval: usBundle.msEval,
          homeBand: usBundle.homeBand,
          awayBand: usBundle.awayBand,
          effectiveV5,
          quoteIndex,
          options,
          allowedFamilies,
          nowIso,
        });
      }
    }
  }

  if (!catalog) {
    catalog = buildMatchPicksCatalog(game, ctx);
  }

  if (options.families && options.families.length > 0) {
    const allowed = new Set<MarketFamilyId>(options.families);
    const filtered = catalog.picks.filter((item) => allowed.has(item.family));
    catalog = rebuildCatalogSummary(catalog, filtered, false);
  }

  if (options.fullAccess || game.status === "FT") {
    const hasExplicitNflAltLines =
      (options.nflAltSpreadLines !== undefined && options.nflAltSpreadLines.length > 0) ||
      (options.nflAltTotalLines !== undefined && options.nflAltTotalLines.length > 0);
    const effectiveMaxPerFamily =
      options.maxPicksPerFamily ??
      (hasExplicitNflAltLines
        ? Math.max(
            DEFAULT_MAX_PICKS_PER_FAMILY,
            ((options.nflAltSpreadLines?.length ?? 0) + 4) * 2,
            ((options.nflAltTotalLines?.length ?? 0) + 4) * 2,
          )
        : undefined);
    const effectivePreserveAll =
      options.preserveAll ??
      (game.status === "FT" &&
        options.maxPicksPerFamily === undefined &&
        options.maxTotalPicks === undefined);
    return compactCatalogPayload(catalog, {
      maxPicksPerFamily: effectiveMaxPerFamily,
      maxTotalPicks: options.maxTotalPicks,
      compact: options.compact ?? true,
      preserveAll: effectivePreserveAll,
    });
  }

  const unlockedIds = options.unlockedPickIds ?? new Set<string>();
  const maxLockedSlots = Math.max(
    0,
    options.maxVisitorLockedSlots ?? DEFAULT_MAX_VISITOR_LOCKED_SLOTS,
  );

  const openPicks: CatalogPickItem[] = [];
  const seenOpenIds = new Set<string>();
  const redactedByFamily = new Map<MarketFamilyId, CatalogPickItem>();

  for (const item of catalog.picks) {
    const isUnlocked =
      Boolean(item.isDailyOpenPromo) ||
      Boolean(item.isTipsterWeeklyOpen) ||
      unlockedIds.has(item.id);
    if (isUnlocked) {
      if (!seenOpenIds.has(item.id)) {
        seenOpenIds.add(item.id);
        openPicks.push(item);
      }
    } else if (!redactedByFamily.has(item.family) && redactedByFamily.size < maxLockedSlots) {
      redactedByFamily.set(item.family, redactCatalogPickForVisitor(item, redactedByFamily.size));
    }
  }

  const visitorPicks = [...openPicks, ...redactedByFamily.values()];
  return rebuildCatalogSummary(catalog, visitorPicks, true);
}

export function buildServerMatchPicksCatalogsBatch(
  games: readonly PlatformGame[],
  options: Omit<
    ServerMatchPicksCatalogOptions,
    "markets" | "v5" | "homeHistory" | "awayHistory" | "f5Score" | "finalStats"
  > & {
    readonly detailsByGameId?: ReadonlyMap<
      string,
      {
        readonly markets?: readonly PlatformMarketRow[];
        readonly v5?: MatchIntelligenceV5View | null;
        readonly homeHistory?: readonly TeamMatchEvidenceRecord[];
        readonly awayHistory?: readonly TeamMatchEvidenceRecord[];
        readonly footballPlayers?: readonly FootballPlayerPropCandidateInput[];
        readonly footballGoalkeepers?: readonly GoalkeeperCatalogCandidateInputV6[];
        readonly nbaPlayers?: readonly NbaPlayerPropCandidateInput[];
      }
    >;
  },
): ReadonlyMap<string, MatchPicksCatalog> {
  const result = new Map<string, MatchPicksCatalog>();
  for (const game of games) {
    const detail = options.detailsByGameId?.get(game.id);
    const catalog = buildServerMatchPicksCatalog(game, {
      ...options,
      markets: detail?.markets ?? game.markets,
      v5: detail?.v5 ?? null,
      homeHistory: detail?.homeHistory,
      awayHistory: detail?.awayHistory,
      footballPlayers: detail?.footballPlayers ?? options.footballPlayers,
      footballGoalkeepers: detail?.footballGoalkeepers ?? options.footballGoalkeepers,
      nbaPlayers: detail?.nbaPlayers ?? options.nbaPlayers,
      maxPicksPerFamily: options.maxPicksPerFamily ?? 2,
      maxTotalPicks: options.maxTotalPicks ?? 18,
      compact: options.compact ?? true,
    });
    result.set(game.id, catalog);
  }
  return result;
}

export interface ServerPlayerPropCatalogEntryV6 {
  readonly id: string;
  readonly gameId: string;
  readonly sport: PlatformGame["sport"];
  readonly league: string;
  readonly playerName: string;
  readonly playerSlug: string;
  readonly teamSide: "home" | "away";
  readonly teamName: string;
  readonly marketKey: string;
  readonly marketLabel: string;
  readonly unitEs: string;
  readonly selectionLabel: string;
  readonly line: number;
  readonly pOver: number;
  readonly pUnder: number;
  readonly fairOverDecimal: number;
  readonly fairUnderDecimal: number;
  readonly marketOverDecimal: number | null;
  readonly marketBookLabel: string | null;
  readonly evPct: number | null;
  readonly avgMinutes: number | null;
  readonly source:
    | "spacetime_coupled_shots_v6"
    | "spacetime_goalkeeper_saves_v6"
    | "spacetime_us_props_v6";
  readonly isRedacted: boolean;
}

export interface MatchPlayerPropsCatalogResultV6 {
  readonly gameId: string;
  readonly league: string;
  readonly sport: PlatformGame["sport"];
  readonly isRedactedForVisitor: boolean;
  readonly props: readonly ServerPlayerPropCatalogEntryV6[];
  readonly goalkeeperSgpCombos: readonly GoalkeeperSavesSgpEvalResultV6[];
}

export function buildMatchPlayerPropsCatalogV6(
  game: PlatformGame,
  options: {
    readonly fullAccess: boolean;
    readonly homeSquad?: TeamSquadEntry | null;
    readonly awaySquad?: TeamSquadEntry | null;
    readonly footballPlayers?: readonly FootballPlayerPropCandidateInput[];
    readonly footballGoalkeepers?: readonly GoalkeeperCatalogCandidateInputV6[];
    readonly usPlayerProfiles?: readonly UsPlayerCatalogCandidateInputV6[];
    readonly injuryStatusByTeamPlayer?: ReadonlyMap<string, string>;
    readonly goalkeeperSgpOutcomes?: readonly GoalkeeperLinkedMatchOutcomeV6[];
  },
): MatchPlayerPropsCatalogResultV6 {
  const allowFull = options.fullAccess || game.status === "FT";
  if (!allowFull) {
    return Object.freeze({
      gameId: game.id,
      league: String(game.league),
      sport: game.sport,
      isRedactedForVisitor: true,
      props: Object.freeze([]),
      goalkeeperSgpCombos: Object.freeze([]),
    });
  }

  const injuryLookup = buildInjuryLookupForGame(game, options.injuryStatusByTeamPlayer, {
    homeSquad: options.homeSquad,
    awaySquad: options.awaySquad,
  });
  const props: ServerPlayerPropCatalogEntryV6[] = [];
  const seen = new Set<string>();
  const gkCombos: GoalkeeperSavesSgpEvalResultV6[] = [];

  const pushEntry = (entry: ServerPlayerPropCatalogEntryV6) => {
    if (!hasExplicitSpanishUnit(entry.selectionLabel)) return;
    if (!isSafePublicLabel(entry.playerName) || !isSafePublicLabel(entry.teamName)) return;
    const key = `${entry.playerSlug}|${entry.marketKey}|${entry.line}`;
    if (seen.has(key)) return;
    seen.add(key);
    props.push(entry);
  };

  if (options.homeSquad || options.awaySquad) {
    const derived: readonly DerivedMatchPlayerPropV6[] = deriveMatchPlayerPropsV6({
      gameId: game.id,
      league: String(game.league),
      sport: game.sport,
      homeTeamName: game.home.name,
      homeTeamSlug: game.home.slug,
      awayTeamName: game.away.name,
      awayTeamSlug: game.away.slug,
      homeSquad: options.homeSquad ?? null,
      awaySquad: options.awaySquad ?? null,
      homeProjectedGoals: game.projection?.home ?? null,
      awayProjectedGoals: game.projection?.away ?? null,
      injuryStatusByTeamPlayer: injuryLookup.resolvedMap,
      allowFull: true,
    });

    for (const dp of derived) {
      const reportedInjury = lookupPlayerInjuryStatus(injuryLookup, dp.teamSide, dp.playerName);
      if (isHardBlockedAvailabilityV6(dp.availabilityStatus, reportedInjury)) continue;
      if (dp.allCanonicalLines && dp.allCanonicalLines.length > 0) {
        for (const cl of dp.allCanonicalLines) {
          pushEntry({
            id: `${game.id}__v6prop__${dp.playerSlug}__${dp.marketKey}__${cl.line}`,
            gameId: game.id,
            sport: game.sport,
            league: String(game.league),
            playerName: dp.playerName,
            playerSlug: dp.playerSlug,
            teamSide: dp.teamSide,
            teamName: dp.teamName,
            marketKey: dp.marketKey,
            marketLabel: dp.marketLabel,
            unitEs: dp.unitEs,
            selectionLabel: `${dp.playerName} · ${cl.selectionLabel}`,
            line: cl.line,
            pOver: round4(cl.pOver),
            pUnder: round4(clampProb(1 - cl.pOver)),
            fairOverDecimal: round2(cl.fairOverDecimal),
            fairUnderDecimal: round2(1 / clampProb(1 - cl.pOver)),
            marketOverDecimal: null,
            marketBookLabel: null,
            evPct: null,
            avgMinutes: dp.avgMinutes,
            source: dp.source,
            isRedacted: false,
          });
        }
      } else {
        pushEntry({
          id: dp.id,
          gameId: game.id,
          sport: game.sport,
          league: String(game.league),
          playerName: dp.playerName,
          playerSlug: dp.playerSlug,
          teamSide: dp.teamSide,
          teamName: dp.teamName,
          marketKey: dp.marketKey,
          marketLabel: dp.marketLabel,
          unitEs: dp.unitEs,
          selectionLabel: `${dp.playerName} · ${dp.selectionLabel}`,
          line: dp.line,
          pOver: round4(dp.pOver),
          pUnder: round4(dp.pUnder),
          fairOverDecimal: round2(dp.fairOverDecimal),
          fairUnderDecimal: round2(dp.fairUnderDecimal),
          marketOverDecimal: null,
          marketBookLabel: null,
          evPct: null,
          avgMinutes: dp.avgMinutes,
          source: dp.source,
          isRedacted: false,
        });
      }
    }
  }

  if (game.sport === "football") {
    const homeGoals = game.projection?.home ?? 1.45;
    const awayGoals = game.projection?.away ?? 1.2;
    const volHome = resolveFootballTeamExpectedVolumeV6({
      teamProjectedGoals: homeGoals,
      oppProjectedGoals: awayGoals,
    });
    const volAway = resolveFootballTeamExpectedVolumeV6({
      teamProjectedGoals: awayGoals,
      oppProjectedGoals: homeGoals,
    });

    for (const cand of options.footballPlayers ?? []) {
      const reportedInjury = lookupPlayerInjuryStatus(injuryLookup, cand.teamSide, cand.playerName);
      if (isHardBlockedAvailabilityV6(null, reportedInjury)) continue;
      const logs = (cand.matchLogs ?? []).filter(
        (l) => Number.isFinite(l.minutesPlayed) && l.minutesPlayed >= FOOTBALL_PROP_MIN_MINUTES,
      );
      const avgMinutes =
        logs.length >= 3
          ? round1(logs.reduce((s, l) => s + l.minutesPlayed, 0) / logs.length)
          : cand.avgMinutes;
      const apps = logs.length > 0 ? logs.length : (cand.seasonTotals?.appearances ?? 5);
      const totalShots =
        logs.length > 0
          ? logs.reduce((s, l) => s + (l.shots ?? 0), 0)
          : (cand.seasonTotals?.shots ?? 0);
      const totalSoT =
        logs.length > 0
          ? logs.reduce((s, l) => s + (l.shotsOnTarget ?? 0), 0)
          : (cand.seasonTotals?.shotsOnTarget ?? 0);
      const vol = cand.teamSide === "home" ? volHome : volAway;
      const slug = cand.playerSlug ?? slugifyPlayerName(cand.playerName);

      for (const spec of [
        { metric: "shots" as const, count: totalShots, quoteKey: "shots" as const },
        { metric: "shots_on_target" as const, count: totalSoT, quoteKey: "shots_on_target" as const },
      ]) {
        if (spec.count <= 0) continue;
        const quoteObj = cand.marketQuotes?.[spec.quoteKey];
        const coupled = evaluateCoupledFootballShotsV6({
          metric: spec.metric,
          playerName: cand.playerName,
          positionGroup: cand.position,
          positionLabel: cand.position,
          seasonCount: spec.count,
          seasonShotsTotal: totalShots,
          appearances: Math.max(1, apps),
          subIns: 0,
          avgMinutes,
          teamExpectedShots: vol.teamExpectedShots,
          teamExpectedSoT: vol.teamExpectedSoT,
          teamProjectedGoals: cand.teamSide === "home" ? homeGoals : awayGoals,
          injuryStatus: reportedInjury,
          allowFull: true,
          marketQuotesByLine: quoteObj
            ? {
                [quoteObj.line]: {
                  overDecimal: quoteObj.overDecimal ?? null,
                  bookLabel: quoteObj.bookLabel ?? null,
                },
              }
            : undefined,
        });
        if (!coupled.eligible) continue;
        for (const ln of coupled.lines) {
          if (ln.pOver === null || ln.pUnder === null || ln.fairOverDecimal === null || ln.fairUnderDecimal === null) {
            continue;
          }
          pushEntry({
            id: `${game.id}__v6prop__${slug}__${ln.marketKey}__${ln.line}`,
            gameId: game.id,
            sport: "football",
            league: String(game.league),
            playerName: cand.playerName,
            playerSlug: slug,
            teamSide: cand.teamSide,
            teamName: cand.teamName,
            marketKey: ln.marketKey,
            marketLabel: ln.marketLabel,
            unitEs: ln.unitEs,
            selectionLabel: `${cand.playerName} · ${ln.selectionLabel}`,
            line: ln.line,
            pOver: round4(ln.pOver),
            pUnder: round4(ln.pUnder),
            fairOverDecimal: round2(ln.fairOverDecimal),
            fairUnderDecimal: round2(ln.fairUnderDecimal),
            marketOverDecimal: ln.marketOverDecimal,
            marketBookLabel: ln.marketBookLabel,
            evPct: ln.evPct,
            avgMinutes: typeof avgMinutes === "number" ? avgMinutes : null,
            source: "spacetime_coupled_shots_v6",
            isRedacted: false,
          });
        }
      }
    }

    const sgpOutcomes = options.goalkeeperSgpOutcomes ?? ["clean_sheet", "under_2_5", "team_win"];
    for (const gk of options.footballGoalkeepers ?? []) {
      const reportedInjury = lookupPlayerInjuryStatus(injuryLookup, gk.teamSide, gk.playerName);
      const effectiveInjury = gk.injuryStatus ?? reportedInjury;
      if (isHardBlockedAvailabilityV6(gk.availability, effectiveInjury)) continue;
      const vol = gk.teamSide === "home" ? volHome : volAway;
      const gkEval = evaluateGoalkeeperSavesV6({
        playerName: gk.playerName,
        saves: gk.saves,
        shotsFaced: gk.shotsFaced,
        goalsConceded: gk.goalsConceded,
        appearances: gk.appearances,
        subIns: gk.subIns ?? 0,
        avgMinutes: gk.avgMinutes,
        oppExpectedSoT: vol.oppExpectedSoT,
        oppProjectedGoals: gk.teamSide === "home" ? awayGoals : homeGoals,
        availability: gk.availability,
        injuryStatus: effectiveInjury,
        allowFull: true,
        marketQuotesByLine: gk.marketQuotesByLine,
      });
      if (!gkEval.eligible) continue;
      const slug = gk.playerSlug ?? slugifyPlayerName(gk.playerName);
      for (const ln of gkEval.lines) {
        if (ln.pOver === null || ln.pUnder === null || ln.fairOverDecimal === null || ln.fairUnderDecimal === null) {
          continue;
        }
        pushEntry({
          id: `${game.id}__v6prop__${slug}__player_saves__${ln.line}`,
          gameId: game.id,
          sport: "football",
          league: String(game.league),
          playerName: gk.playerName,
          playerSlug: slug,
          teamSide: gk.teamSide,
          teamName: gk.teamName,
          marketKey: "player_saves",
          marketLabel: "Atajadas",
          unitEs: "atajadas",
          selectionLabel: `${gk.playerName} · ${ln.selectionLabel}`,
          line: ln.line,
          pOver: round4(ln.pOver),
          pUnder: round4(ln.pUnder),
          fairOverDecimal: round2(ln.fairOverDecimal),
          fairUnderDecimal: round2(ln.fairUnderDecimal),
          marketOverDecimal: ln.marketOverDecimal,
          marketBookLabel: ln.marketBookLabel,
          evPct: ln.evPct,
          avgMinutes: typeof gk.avgMinutes === "number" ? gk.avgMinutes : null,
          source: "spacetime_goalkeeper_saves_v6",
          isRedacted: false,
        });
      }

      for (const outcome of sgpOutcomes) {
        const combo = evaluateGoalkeeperSavesSgpComboV6({
          playerName: gk.playerName,
          savesLine: CANONICAL_GK_SAVES_LINES_V6[1],
          matchOutcome: outcome,
          saves: gk.saves,
          shotsFaced: gk.shotsFaced,
          goalsConceded: gk.goalsConceded,
          appearances: gk.appearances,
          subIns: gk.subIns ?? 0,
          avgMinutes: gk.avgMinutes,
          oppExpectedSoT: vol.oppExpectedSoT,
          teamExpectedGoals: gk.teamSide === "home" ? homeGoals : awayGoals,
          opponentExpectedGoals: gk.teamSide === "home" ? awayGoals : homeGoals,
          availability: gk.availability,
          injuryStatus: effectiveInjury,
          allowFull: true,
        });
        if (combo.eligible) {
          gkCombos.push(combo);
        }
      }
    }
  }

  for (const profile of options.usPlayerProfiles ?? []) {
    const reportedInjury = lookupPlayerInjuryStatus(injuryLookup, profile.teamSide, profile.playerName);
    const effectiveInjury = profile.injuryStatus ?? reportedInjury;
    if (isHardBlockedAvailabilityV6(profile.availability, effectiveInjury)) continue;

    const evaluated = evaluateGuardedUsPlayerPropsV6({
      sport: profile.sport,
      playerName: profile.playerName,
      playerSlug: profile.playerSlug,
      teamSlug: profile.teamSlug,
      teamName: profile.teamName,
      positionLabel: profile.positionLabel,
      availability: profile.availability,
      injuryStatus: effectiveInjury,
      injuryNote: profile.injuryNote,
      seasonMetrics: profile.seasonMetrics,
      recentGames: profile.recentGames,
      explicitAvgMinutes: profile.explicitAvgMinutes,
      oppFactor: profile.oppFactor,
    });

    for (const prop of evaluated) {
      const rawQuote = profile.marketQuotesByMetric?.[prop.metric];
      const guardedQuote = evaluateGuardedPropMarketQuoteV6({
        pOver: prop.pOver,
        marketOverDecimal: rawQuote?.overDecimal ?? null,
        marketBookLabel: rawQuote?.bookLabel ?? null,
        allowFull: true,
      });
      pushEntry({
        id: `${game.id}__v6prop__${prop.sport}__${prop.playerSlug}__${prop.metric.toLowerCase()}__${prop.line}`,
        gameId: game.id,
        sport: game.sport,
        league: String(game.league),
        playerName: prop.playerName,
        playerSlug: prop.playerSlug,
        teamSide: profile.teamSide,
        teamName: prop.teamName,
        marketKey: `${prop.sport}_${prop.metric.toLowerCase()}`,
        marketLabel: prop.metricLabelEs,
        unitEs: prop.unitEs,
        selectionLabel: `${prop.playerName} · ${prop.selectionLabelOver}`,
        line: prop.line,
        pOver: round4(prop.pOver),
        pUnder: round4(prop.pUnder),
        fairOverDecimal: round2(prop.fairOverDecimal),
        fairUnderDecimal: round2(prop.fairUnderDecimal),
        marketOverDecimal: guardedQuote.marketDecimal,
        marketBookLabel: guardedQuote.marketBookLabel,
        evPct: guardedQuote.evPct,
        avgMinutes: prop.avgMinutes,
        source: "spacetime_us_props_v6",
        isRedacted: false,
      });
    }
  }

  return Object.freeze({
    gameId: game.id,
    league: String(game.league),
    sport: game.sport,
    isRedactedForVisitor: false,
    props: Object.freeze(props),
    goalkeeperSgpCombos: Object.freeze(gkCombos),
  });
}

export interface ServerBetBuilderSgpResultV6 {
  readonly ok: boolean;
  readonly mode: "copula" | "goalkeeper_saves" | "player_linked";
  readonly sport: PlatformGame["sport"];
  readonly isRedacted: boolean;
  readonly blockedReason: string | null;
  readonly legsCount: number;
  readonly independentProbability: number | null;
  readonly jointProbability: number | null;
  readonly probabilityLowerBound: number | null;
  readonly probabilityUpperBound: number | null;
  readonly correlationMultiplier: number | null;
  readonly correlationDirection:
    | "positively_correlated"
    | "negatively_correlated"
    | "near_independent"
    | null;
  readonly fairCombinedDecimal: number | null;
  readonly fairCombinedAmerican: number | null;
  readonly offeredBookDecimal: number | null;
  readonly offeredBookLabel: string | null;
  readonly evPct: number | null;
  readonly summaryEs: string;
  readonly bookQuoteAudit: SgpCopulaAuditView["bookQuoteAudit"];
  readonly warnings: readonly BetBuilderEvaluation["warnings"][number][];
}

function mapCatalogLegToCopulaInput(
  leg: BetBuilderLegInput,
): SgpLegInput | null {
  const p = clampProb(leg.p);
  if (leg.sport === "football") {
    if (leg.family === "1x2" || leg.family === "dnb" || leg.family === "asian_handicap") {
      if (leg.direction === "home") return { legId: leg.id, factor: "goal_diff", direction: 1, marginalProbability: p };
      if (leg.direction === "away") return { legId: leg.id, factor: "goal_diff", direction: -1, marginalProbability: p };
    }
    if (leg.family === "totals" || leg.family === "btts") {
      const dir: 1 | -1 = leg.direction === "under" || leg.direction === "no" ? -1 : 1;
      return { legId: leg.id, factor: "total_goals", direction: dir, marginalProbability: p };
    }
    if (leg.family === "half_time_result") {
      const dir: 1 | -1 = leg.direction === "draw" ? -1 : 1;
      return { legId: leg.id, factor: "ht_total_goals", direction: dir, marginalProbability: p };
    }
    if (leg.family === "corners_total") {
      const dir: 1 | -1 = leg.direction === "under" ? -1 : 1;
      return { legId: leg.id, factor: "total_corners", direction: dir, marginalProbability: p };
    }
    if (leg.family === "corners_team") {
      const factor = leg.axis === "corners_away" ? "away_corners" : "home_corners";
      const dir: 1 | -1 = leg.direction === "under" ? -1 : 1;
      return { legId: leg.id, factor, direction: dir, marginalProbability: p };
    }
    if (leg.family === "cards_total") {
      const dir: 1 | -1 = leg.direction === "under" ? -1 : 1;
      return { legId: leg.id, factor: "total_yellow_cards", direction: dir, marginalProbability: p };
    }
    if (leg.family === "shots_on_target") {
      const dir: 1 | -1 = leg.direction === "under" ? -1 : 1;
      return { legId: leg.id, factor: "total_shots_on_target", direction: dir, marginalProbability: p };
    }
    return null;
  }

  if (leg.sport === "american-football") {
    if (leg.family === "nfl_spread" || leg.family === "nfl_moneyline") {
      const dir: 1 | -1 = leg.direction === "away" ? -1 : 1;
      return { legId: leg.id, factor: "home_margin", direction: dir, marginalProbability: p };
    }
    if (leg.family === "nfl_totals") {
      const dir: 1 | -1 = leg.direction === "under" ? -1 : 1;
      return { legId: leg.id, factor: "total_points", direction: dir, marginalProbability: p };
    }
  }
  return null;
}

function formatCorrelationSummaryEs(
  direction: "positively_correlated" | "negatively_correlated" | "near_independent",
  multiplier: number,
  fairCombinedDecimal: number,
): string {
  const relation =
    direction === "positively_correlated"
      ? "correlación positiva"
      : direction === "negatively_correlated"
        ? "correlación negativa"
        : "dependencia neutra";
  return `Combinada del mismo partido con ${relation} (factor ×${multiplier.toFixed(2)} · momio justo ${fairCombinedDecimal.toFixed(2)}).`;
}

function evaluatePermittedSgpOffer(params: {
  readonly jointProbability: number;
  readonly offeredCombinedDecimalOdds?: number | null;
  readonly offeredBookLabel?: string | null;
}): {
  readonly offeredDecimal: number | null;
  readonly offeredBookLabel: string | null;
  readonly evPct: number | null;
} {
  const rawBook = params.offeredBookLabel?.trim() ?? "";
  const hasBook = rawBook.length > 0;
  const bookPermitted = hasBook && isPermittedBookLabelV6(rawBook);
  const rawDec = params.offeredCombinedDecimalOdds;
  const validDec =
    bookPermitted &&
    typeof rawDec === "number" &&
    Number.isFinite(rawDec) &&
    rawDec >= 1.01 &&
    rawDec <= MAX_POSITIVE_DECIMAL_ODDS;
  if (!validDec) {
    return { offeredDecimal: null, offeredBookLabel: null, evPct: null };
  }
  const evLimit = isSharpCatalogBook(hasBook ? rawBook : null)
    ? MAX_SHARP_EV_PCT
    : MAX_SOFT_EV_PCT;
  const rawEv = round1((params.jointProbability * rawDec - 1) * 100);
  const safeEv = Number.isFinite(rawEv) && rawEv <= evLimit ? rawEv : null;
  return {
    offeredDecimal: round2(rawDec),
    offeredBookLabel: hasBook ? rawBook : null,
    evPct: safeEv,
  };
}

export type ServerBetBuilderSgpRequestV6 =
  | {
      readonly mode?: "copula";
      readonly fullAccess: boolean;
      readonly legs: readonly (CatalogPickItem | BetBuilderLegInput)[];
      readonly offeredCombinedDecimalOdds?: number | null;
      readonly offeredBookLabel?: string | null;
    }
  | {
      readonly mode: "goalkeeper_saves";
      readonly fullAccess: boolean;
      readonly playerName: string;
      readonly savesLine: number;
      readonly ebSaveRate: number;
      readonly oppExpectedSoT: number;
      readonly teamExpectedGoals: number;
      readonly opponentExpectedGoals: number;
      readonly matchOutcome: GoalkeeperLinkedMatchOutcomeV6;
      readonly expectedMinutes: number | null | undefined;
      readonly availability?: string | null;
      readonly injuryStatus?: string | null;
      readonly offeredCombinedDecimalOdds?: number | null;
      readonly offeredBookLabel?: string | null;
    }
  | {
      readonly mode: "player_linked";
      readonly fullAccess: boolean;
      readonly playerName: string;
      readonly pPlayerAnytimeGoal: number;
      readonly teamExpectedGoals: number;
      readonly opponentExpectedGoals: number;
      readonly teamOutcome: "team_win" | "team_win_or_draw" | "any";
      readonly matchTotalOverLine?: number | null;
      readonly expectedMinutes: number | null | undefined;
      readonly availability?: string | null;
      readonly injuryStatus?: string | null;
      readonly offeredCombinedDecimalOdds?: number | null;
      readonly offeredBookLabel?: string | null;
    };

function isCatalogPickItem(
  leg: CatalogPickItem | BetBuilderLegInput,
): leg is CatalogPickItem {
  return "pricing" in leg;
}

export function evaluateServerBetBuilderSgpV6(
  req: ServerBetBuilderSgpRequestV6,
): ServerBetBuilderSgpResultV6 {
  const mode = req.mode ?? "copula";
  const blockedResponse = (
    sport: PlatformGame["sport"],
    reason: string,
    isRedacted: boolean,
  ): ServerBetBuilderSgpResultV6 =>
    Object.freeze({
      ok: false,
      mode,
      sport,
      isRedacted,
      blockedReason: reason,
      legsCount: 0,
      independentProbability: null,
      jointProbability: null,
      probabilityLowerBound: null,
      probabilityUpperBound: null,
      correlationMultiplier: null,
      correlationDirection: null,
      fairCombinedDecimal: null,
      fairCombinedAmerican: null,
      offeredBookDecimal: null,
      offeredBookLabel: null,
      evPct: null,
      summaryEs: isRedacted
        ? "Combinada reservada para socios con Pase PitchLab Ultra."
        : reason,
      bookQuoteAudit: null,
      warnings: Object.freeze([]),
    });

  if (!req.fullAccess) {
    const sport: PlatformGame["sport"] =
      req.mode === "goalkeeper_saves" || req.mode === "player_linked"
        ? "football"
        : (req.legs[0]?.sport ?? "football");
    return blockedResponse(sport, "pase_requerido", true);
  }

  if (req.mode === "goalkeeper_saves") {
    if (!isSafePublicLabel(req.playerName)) {
      return blockedResponse("football", "etiqueta_invalida", false);
    }
    const guard = checkStrictPlayerMinutesAndAvailabilityGuardV6({
      sport: "football",
      avgMinutes: req.expectedMinutes,
      availability: req.availability,
      injuryStatus: req.injuryStatus,
    });
    if (!guard.eligible || typeof req.expectedMinutes !== "number") {
      return blockedResponse(
        "football",
        guard.blockedByInjury ? "jugador_baja" : "guardia_minutos_insuficientes",
        false,
      );
    }

    const rawOffer =
      typeof req.offeredCombinedDecimalOdds === "number" &&
      Number.isFinite(req.offeredCombinedDecimalOdds) &&
      req.offeredCombinedDecimalOdds > 1.01 &&
      isPermittedBookLabelV6(req.offeredBookLabel)
        ? req.offeredCombinedDecimalOdds
        : null;

    const evaluated = evaluateGoalkeeperSavesSgpServerV6({
      savesLine: req.savesLine,
      ebSaveRate: req.ebSaveRate,
      oppExpectedSoT: req.oppExpectedSoT,
      teamExpectedGoals: req.teamExpectedGoals,
      opponentExpectedGoals: req.opponentExpectedGoals,
      matchOutcome: req.matchOutcome,
      expectedMinutes: req.expectedMinutes,
      offeredCombinedDecimalOdds: rawOffer,
    });

    const offer = evaluatePermittedSgpOffer({
      jointProbability: evaluated.jointProbability,
      offeredCombinedDecimalOdds: rawOffer,
      offeredBookLabel: req.offeredBookLabel,
    });

    return Object.freeze({
      ok: true,
      mode: "goalkeeper_saves",
      sport: "football",
      isRedacted: false,
      blockedReason: null,
      legsCount: 2,
      independentProbability: evaluated.independentProbability,
      jointProbability: evaluated.jointProbability,
      probabilityLowerBound: evaluated.probabilityLowerBound,
      probabilityUpperBound: evaluated.probabilityUpperBound,
      correlationMultiplier: evaluated.structuralMultiplier,
      correlationDirection: evaluated.correlationDirection,
      fairCombinedDecimal: evaluated.fairCombinedDecimal,
      fairCombinedAmerican: evaluated.fairCombinedAmerican,
      offeredBookDecimal: offer.offeredDecimal,
      offeredBookLabel: offer.offeredBookLabel,
      evPct: offer.evPct,
      summaryEs: formatCorrelationSummaryEs(
        evaluated.correlationDirection,
        evaluated.structuralMultiplier,
        evaluated.fairCombinedDecimal,
      ),
      bookQuoteAudit: evaluated.bookQuoteAudit,
      warnings: Object.freeze([]),
    });
  }

  if (req.mode === "player_linked") {
    if (!isSafePublicLabel(req.playerName)) {
      return blockedResponse("football", "etiqueta_invalida", false);
    }
    const guard = checkStrictPlayerMinutesAndAvailabilityGuardV6({
      sport: "football",
      avgMinutes: req.expectedMinutes,
      availability: req.availability,
      injuryStatus: req.injuryStatus,
    });
    if (!guard.eligible) {
      return blockedResponse(
        "football",
        guard.blockedByInjury ? "jugador_baja" : "guardia_minutos_insuficientes",
        false,
      );
    }

    const hasMatchTotalLeg =
      typeof req.matchTotalOverLine === "number" &&
      Number.isFinite(req.matchTotalOverLine) &&
      req.matchTotalOverLine > 0;
    const requestedLegsCount =
      1 + (req.teamOutcome !== "any" ? 1 : 0) + (hasMatchTotalLeg ? 1 : 0);
    if (requestedLegsCount < 2) {
      return blockedResponse("football", "minimo_dos_piernas", false);
    }

    const rawOffer =
      typeof req.offeredCombinedDecimalOdds === "number" &&
      Number.isFinite(req.offeredCombinedDecimalOdds) &&
      req.offeredCombinedDecimalOdds > 1.01 &&
      isPermittedBookLabelV6(req.offeredBookLabel)
        ? req.offeredCombinedDecimalOdds
        : null;

    const evaluated = evaluatePlayerLinkedSgpV6({
      pPlayerAnytimeGoal: req.pPlayerAnytimeGoal,
      teamExpectedGoals: req.teamExpectedGoals,
      opponentExpectedGoals: req.opponentExpectedGoals,
      teamOutcome: req.teamOutcome,
      matchTotalOverLine: req.matchTotalOverLine ?? null,
      offeredCombinedDecimalOdds: rawOffer,
    });

    const legsCount =
      1 +
      (req.teamOutcome !== "any" ? 1 : 0) +
      (evaluated.pTotalOutcomeMarginal !== null ? 1 : 0);
    if (legsCount < 2) {
      return blockedResponse("football", "minimo_dos_piernas", false);
    }

    const offer = evaluatePermittedSgpOffer({
      jointProbability: evaluated.jointProbability,
      offeredCombinedDecimalOdds: rawOffer,
      offeredBookLabel: req.offeredBookLabel,
    });

    return Object.freeze({
      ok: true,
      mode: "player_linked",
      sport: "football",
      isRedacted: false,
      blockedReason: null,
      legsCount,
      independentProbability: evaluated.independentProbability,
      jointProbability: evaluated.jointProbability,
      probabilityLowerBound: evaluated.probabilityLowerBound,
      probabilityUpperBound: evaluated.probabilityUpperBound,
      correlationMultiplier: evaluated.structuralLiftMultiplier,
      correlationDirection: evaluated.correlationDirection,
      fairCombinedDecimal: evaluated.fairCombinedDecimal,
      fairCombinedAmerican: evaluated.fairCombinedAmerican,
      offeredBookDecimal: offer.offeredDecimal,
      offeredBookLabel: offer.offeredBookLabel,
      evPct: offer.evPct,
      summaryEs: formatCorrelationSummaryEs(
        evaluated.correlationDirection,
        evaluated.structuralLiftMultiplier,
        evaluated.fairCombinedDecimal,
      ),
      bookQuoteAudit: evaluated.bookQuoteAudit,
      warnings: Object.freeze([]),
    });
  }

  const normalizedLegs: BetBuilderLegInput[] = req.legs.map((l) =>
    isCatalogPickItem(l) ? catalogPickToBetBuilderLeg(l) : l,
  );
  const sport = normalizedLegs[0]?.sport ?? "football";
  if (normalizedLegs.length < 2) {
    return blockedResponse(sport, "minimo_dos_piernas", false);
  }
  if (normalizedLegs.length > MAX_PARLAY_LEGS_V6) {
    return blockedResponse(sport, "limite_piernas_excedido", false);
  }

  const accepted: BetBuilderLegInput[] = [];
  for (const leg of normalizedLegs) {
    const compat = checkBetBuilderCompatibility(accepted, leg, {
      maxLegsPerGame: MAX_PARLAY_LEGS_V6,
      allowSameGame: true,
      allowLive: false,
    });
    if (!compat.allowed) {
      return blockedResponse(sport, compat.reason ?? compat.code ?? "conflicto_sgp", false);
    }
    accepted.push(leg);
  }

  const uniqueGames = new Set(accepted.map((l) => l.gameId));
  const isSingleGame = uniqueGames.size === 1;
  const marginals = accepted.map((l) => clampProb(l.p));
  const upperBound = round4(Math.min(...marginals));
  const lowerBound = round4(
    Math.min(
      upperBound,
      Math.max(0, marginals.reduce((acc, p) => acc + p, 0) - (marginals.length - 1)),
    ),
  );

  const rawOffer =
    typeof req.offeredCombinedDecimalOdds === "number" &&
    Number.isFinite(req.offeredCombinedDecimalOdds) &&
    req.offeredCombinedDecimalOdds > 1.01 &&
    isPermittedBookLabelV6(req.offeredBookLabel)
      ? req.offeredCombinedDecimalOdds
      : null;

  if (isSingleGame && (sport === "football" || sport === "american-football")) {
    const mapped = accepted.map(mapCatalogLegToCopulaInput);
    if (mapped.every((m): m is SgpLegInput => m !== null)) {
      const copulaRes = evaluateSgpCopulaV6({
        sport: sport === "american-football" ? "nfl" : "soccer",
        legs: mapped,
        offeredCombinedDecimalOdds: rawOffer,
      });
      const boundedJoint = round4(clamp(copulaRes.jointProbability, lowerBound, upperBound));
      const safeFair = Math.max(1.01, round2(1 / Math.max(0.0005, boundedJoint)));
      const offer = evaluatePermittedSgpOffer({
        jointProbability: boundedJoint,
        offeredCombinedDecimalOdds: rawOffer,
        offeredBookLabel: req.offeredBookLabel,
      });
      return Object.freeze({
        ok: true,
        mode: "copula",
        sport,
        isRedacted: false,
        blockedReason: null,
        legsCount: accepted.length,
        independentProbability: copulaRes.independentProbability,
        jointProbability: boundedJoint,
        probabilityLowerBound: lowerBound,
        probabilityUpperBound: upperBound,
        correlationMultiplier: copulaRes.correlationMultiplier,
        correlationDirection: copulaRes.correlationDirection,
        fairCombinedDecimal: safeFair,
        fairCombinedAmerican: decimalToAmericanOdds(safeFair),
        offeredBookDecimal: offer.offeredDecimal,
        offeredBookLabel: offer.offeredBookLabel,
        evPct: offer.evPct,
        summaryEs: formatCorrelationSummaryEs(
          copulaRes.correlationDirection,
          copulaRes.correlationMultiplier,
          safeFair,
        ),
        bookQuoteAudit: copulaRes.bookQuoteAudit ?? null,
        warnings: Object.freeze([]),
      });
    }
  }

  const bbEval = evaluateBetBuilder(accepted, { offeredBookDecimal: rawOffer });
  const boundedJoint = round4(clamp(bbEval.jointProbability, lowerBound, upperBound));
  const safeFair = Math.max(1.01, round2(1 / Math.max(0.0005, boundedJoint)));
  const offer = evaluatePermittedSgpOffer({
    jointProbability: boundedJoint,
    offeredCombinedDecimalOdds: rawOffer,
    offeredBookLabel: req.offeredBookLabel,
  });

  return Object.freeze({
    ok: true,
    mode: "copula",
    sport,
    isRedacted: false,
    blockedReason: null,
    legsCount: bbEval.legsCount,
    independentProbability: bbEval.independentProbability,
    jointProbability: boundedJoint,
    probabilityLowerBound: lowerBound,
    probabilityUpperBound: upperBound,
    correlationMultiplier: bbEval.correlationMultiplier,
    correlationDirection: bbEval.correlationDirection,
    fairCombinedDecimal: safeFair,
    fairCombinedAmerican: decimalToAmericanOdds(safeFair),
    offeredBookDecimal: offer.offeredDecimal,
    offeredBookLabel: offer.offeredBookLabel,
    evPct: offer.evPct,
    summaryEs: formatCorrelationSummaryEs(
      bbEval.correlationDirection,
      bbEval.correlationMultiplier,
      safeFair,
    ),
    bookQuoteAudit: null,
    warnings: bbEval.warnings,
  });
}

export interface SuggestedMatchSgpComboV6 {
  readonly id: string;
  readonly gameId: string;
  readonly titleEs: string;
  readonly evaluation: ServerBetBuilderSgpResultV6;
}

export function buildSuggestedMatchSgpCombosV6(
  game: PlatformGame,
  catalog: MatchPicksCatalog,
  options: {
    readonly fullAccess: boolean;
    readonly footballGoalkeepers?: readonly GoalkeeperCatalogCandidateInputV6[];
    readonly injuryStatusByTeamPlayer?: ReadonlyMap<string, string>;
  },
): readonly SuggestedMatchSgpComboV6[] {
  if (!options.fullAccess && game.status !== "FT") {
    return Object.freeze([]);
  }
  if (game.status !== "NS" || catalog.isRedactedForVisitor) {
    return Object.freeze([]);
  }

  const combos: SuggestedMatchSgpComboV6[] = [];
  const injuryLookup = buildInjuryLookupForGame(game, options.injuryStatusByTeamPlayer);

  if (game.sport === "american-football") {
    const bestSpread = catalog.picks.find(
      (p) => p.family === "nfl_spread" && !p.isRedacted && p.pricing.p >= 0.35 && p.pricing.p <= 0.72,
    );
    const bestTotal = catalog.picks.find(
      (p) =>
        p.family === "nfl_totals" &&
        p.direction === "over" &&
        !p.isRedacted &&
        p.pricing.p >= 0.35 &&
        p.pricing.p <= 0.75,
    );
    if (bestSpread && bestTotal) {
      const evaluation = evaluateServerBetBuilderSgpV6({
        mode: "copula",
        fullAccess: true,
        legs: [bestSpread, bestTotal],
      });
      if (evaluation.ok) {
        combos.push({
          id: `${game.id}__sgp__spread_over`,
          gameId: game.id,
          titleEs: `${bestSpread.label} + ${bestTotal.label}`,
          evaluation,
        });
      }
    }
  } else if (game.sport === "football") {
    const best1x2 = catalog.picks.find(
      (p) =>
        p.family === "1x2" &&
        (p.direction === "home" || p.direction === "away") &&
        !p.isRedacted &&
        p.pricing.p >= 0.35,
    );
    const bestOver = catalog.picks.find(
      (p) =>
        p.family === "totals" &&
        p.direction === "over" &&
        p.line === 2.5 &&
        !p.isRedacted,
    );
    if (best1x2 && bestOver) {
      const evaluation = evaluateServerBetBuilderSgpV6({
        mode: "copula",
        fullAccess: true,
        legs: [best1x2, bestOver],
      });
      if (evaluation.ok) {
        combos.push({
          id: `${game.id}__sgp__result_over25`,
          gameId: game.id,
          titleEs: `${best1x2.label} + ${bestOver.label}`,
          evaluation,
        });
      }
    }

    const homeGoals = game.projection?.home ?? 1.45;
    const awayGoals = game.projection?.away ?? 1.2;
    const volHome = resolveFootballTeamExpectedVolumeV6({
      teamProjectedGoals: homeGoals,
      oppProjectedGoals: awayGoals,
    });
    const volAway = resolveFootballTeamExpectedVolumeV6({
      teamProjectedGoals: awayGoals,
      oppProjectedGoals: homeGoals,
    });

    for (const gk of options.footballGoalkeepers ?? []) {
      const reportedInjury = lookupPlayerInjuryStatus(injuryLookup, gk.teamSide, gk.playerName);
      const effectiveInjury = gk.injuryStatus ?? reportedInjury;
      const gkEval = evaluateGoalkeeperSavesV6({
        playerName: gk.playerName,
        saves: gk.saves,
        shotsFaced: gk.shotsFaced,
        goalsConceded: gk.goalsConceded,
        appearances: gk.appearances,
        subIns: gk.subIns ?? 0,
        avgMinutes: gk.avgMinutes,
        oppExpectedSoT: gk.teamSide === "home" ? volHome.oppExpectedSoT : volAway.oppExpectedSoT,
        oppProjectedGoals: gk.teamSide === "home" ? awayGoals : homeGoals,
        availability: gk.availability,
        injuryStatus: effectiveInjury,
        allowFull: true,
      });
      if (!gkEval.eligible || gkEval.ebSaveRate === null || gkEval.oppExpectedSoT === null) continue;

      const sgpEval = evaluateServerBetBuilderSgpV6({
        mode: "goalkeeper_saves",
        fullAccess: true,
        playerName: gk.playerName,
        savesLine: CANONICAL_GK_SAVES_LINES_V6[1],
        ebSaveRate: gkEval.ebSaveRate,
        oppExpectedSoT: gkEval.oppExpectedSoT,
        teamExpectedGoals: gk.teamSide === "home" ? homeGoals : awayGoals,
        opponentExpectedGoals: gk.teamSide === "home" ? awayGoals : homeGoals,
        matchOutcome: "clean_sheet",
        expectedMinutes: gkEval.expectedMinutes,
        availability: gk.availability,
        injuryStatus: effectiveInjury,
      });
      if (sgpEval.ok) {
        combos.push({
          id: `${game.id}__sgp__gk_${slugifyPlayerName(gk.playerName)}_clean_sheet`,
          gameId: game.id,
          titleEs: `${gk.playerName} · Más de ${CANONICAL_GK_SAVES_LINES_V6[1].toFixed(1)} atajadas + Portería a cero`,
          evaluation: sgpEval,
        });
      }
    }
  } else {
    const spreadFamily: MarketFamilyId =
      game.sport === "basketball"
        ? "nba_spread"
        : game.sport === "baseball"
          ? "mlb_run_line"
          : "nhl_puck_line";
    const totalFamily: MarketFamilyId =
      game.sport === "basketball"
        ? "nba_totals"
        : game.sport === "baseball"
          ? "mlb_totals"
          : "nhl_totals";
    const bestSpread = catalog.picks.find((p) => p.family === spreadFamily && !p.isRedacted);
    const bestTotal = catalog.picks.find(
      (p) => p.family === totalFamily && p.direction === "over" && !p.isRedacted,
    );
    if (bestSpread && bestTotal) {
      const evaluation = evaluateServerBetBuilderSgpV6({
        mode: "copula",
        fullAccess: true,
        legs: [bestSpread, bestTotal],
      });
      if (evaluation.ok) {
        combos.push({
          id: `${game.id}__sgp__spread_over`,
          gameId: game.id,
          titleEs: `${bestSpread.label} + ${bestTotal.label}`,
          evaluation,
        });
      }
    }
  }

  return Object.freeze(combos);
}

export function buildDailyParlayCandidatesFromCatalogV6(
  games: readonly PlatformGame[],
  catalogsByGameId: ReadonlyMap<string, MatchPicksCatalog>,
  options: {
    readonly fullAccess: boolean;
    readonly maxCandidatesPerGame?: number;
    readonly minProbability?: number;
    readonly maxProbability?: number;
  },
): ReadonlyMap<string, readonly MatchPick[]> {
  const maxPerGame = Math.max(1, Math.min(6, options.maxCandidatesPerGame ?? 3));
  const minProb = clamp(options.minProbability ?? 0.38, 0.05, 0.95);
  const maxProb = clamp(options.maxProbability ?? 0.85, minProb, 0.98);
  const out = new Map<string, readonly MatchPick[]>();

  for (const game of games) {
    const catalog = catalogsByGameId.get(game.id);
    if (!catalog) continue;

    const eligible = catalog.picks
      .filter((item) => {
        if (item.isRedacted) return false;
        if (!options.fullAccess && game.status !== "FT") {
          if (!item.isDailyOpenPromo && !item.isTipsterWeeklyOpen) return false;
        }
        if (isHardAnomalousCatalogPick(item)) return false;
        if (item.recommendationTier === "trivial_odds") return false;
        if (item.pricing.p < minProb || item.pricing.p > maxProb) return false;
        if (item.pricing.fairOdds < 1.25) return false;
        if (item.pricing.evPct !== null && item.pricing.evPct < 0) return false;
        return true;
      })
      .slice()
      .sort((a, b) => rankPickForCompaction(b) - rankPickForCompaction(a));

    const chosen: MatchPick[] = [];
    const seenAxes = new Set<string>();
    for (const item of eligible) {
      if (chosen.length >= maxPerGame) break;
      if (seenAxes.has(item.axis)) continue;
      seenAxes.add(item.axis);
      chosen.push(catalogPickItemToMatchPick(item, game, chosen.length));
    }

    if (chosen.length > 0) {
      out.set(game.id, Object.freeze(chosen));
    }
  }

  return out;
}

export {
  CANONICAL_GK_SAVES_LINES_V6,
  CANONICAL_SHOT_LINES_V6,
  PLAYABLE_ODDS_MAX_V60,
  PLAYABLE_ODDS_MIN_V60,
  deriveAsianHandicapFromMatrixV6,
  isSoccer57LeagueV6,
};
