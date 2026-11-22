import { getLeagueCapability } from "@pitchlab/contracts";
import type {
  MatchIntelligenceV5View,
  PlatformGame,
  PlatformMarketRow,
  PlayerPropItem,
} from "@pitchlab/ui/types";
import {
  buildMatchPicksCatalog,
  type CatalogBuildContext,
  type CatalogPickItem,
  type FootballPlayerPropCandidateInput,
  type MarketFamilyId,
  type MatchFinalCountStats,
  type MatchPicksCatalog,
  type NbaPlayerPropCandidateInput,
  type TeamMatchEvidenceRecord,
} from "@pitchlab/ui/picks-catalog";

export interface ServerMatchPicksCatalogOptions {
  readonly fullAccess: boolean;
  readonly markets?: readonly PlatformMarketRow[];
  readonly v5?: MatchIntelligenceV5View | null;
  readonly playerProps?: readonly PlayerPropItem[];
  readonly footballPlayers?: readonly FootballPlayerPropCandidateInput[];
  readonly nbaPlayers?: readonly NbaPlayerPropCandidateInput[];
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
  readonly nowIso?: string;
}

const DEFAULT_MAX_PICKS_PER_FAMILY = 4;
const DEFAULT_MAX_TOTAL_PICKS = 48;
const DEFAULT_MAX_VISITOR_LOCKED_SLOTS = 8;

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
    engineName: "PitchLab Spacetime v5.1",
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

const MAX_DEVIG_PROB_DIVERGENCE_PTS = 12;
const MAX_SHARP_EV_PCT = 18;
const MAX_SOFT_EV_PCT = 22;
const SHARP_BOOK_TOKENS = ["pinnacle", "betcris", "betonline"] as const;

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

function isHardAnomalousCatalogPick(item: CatalogPickItem): boolean {
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
  return (
    primaryBonus +
    recommendedBonus +
    trivialPenalty +
    anomalyPenalty +
    negativeEvPenalty +
    recScore +
    valueBonus +
    quoteBonus
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
  } = {},
): MatchPicksCatalog {
  const maxPerFamily = Math.max(1, options.maxPicksPerFamily ?? DEFAULT_MAX_PICKS_PER_FAMILY);
  const maxTotal = Math.max(1, options.maxTotalPicks ?? DEFAULT_MAX_TOTAL_PICKS);
  const compactMode = options.compact ?? true;

  const sourcePicks =
    catalog.gameStatus === "FT"
      ? catalog.picks
      : catalog.picks.filter(
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
          bullets: item.evidence.bullets.slice(0, 4),
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

  const ctx: CatalogBuildContext = {
    markets: options.markets ?? game.markets,
    v5: options.v5 ?? null,
    playerProps: options.playerProps,
    footballPlayers: options.footballPlayers,
    nbaPlayers: options.nbaPlayers,
    homeHistory: options.homeHistory,
    awayHistory: options.awayHistory,
    f5Score: options.f5Score ?? null,
    finalStats: options.finalStats ?? null,
    allowedFamilies,
    deVigPreference: options.deVigPreference ?? "auto",
    nowIso: options.nowIso ?? new Date().toISOString(),
  };

  let catalog = buildMatchPicksCatalog(game, ctx);

  if (options.families && options.families.length > 0) {
    const allowed = new Set<MarketFamilyId>(options.families);
    const filtered = catalog.picks.filter((item) => allowed.has(item.family));
    catalog = rebuildCatalogSummary(catalog, filtered, false);
  }

  if (options.fullAccess || game.status === "FT") {
    return compactCatalogPayload(catalog, {
      maxPicksPerFamily: options.maxPicksPerFamily,
      maxTotalPicks: options.maxTotalPicks,
      compact: options.compact ?? true,
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
      nbaPlayers: detail?.nbaPlayers ?? options.nbaPlayers,
      maxPicksPerFamily: options.maxPicksPerFamily ?? 2,
      maxTotalPicks: options.maxTotalPicks ?? 18,
      compact: options.compact ?? true,
    });
    result.set(game.id, catalog);
  }
  return result;
}
