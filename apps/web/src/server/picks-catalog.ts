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
  };
}

function rankPickForCompaction(item: CatalogPickItem): number {
  const primaryBonus = item.isPrimaryModelPick ? 100 : 0;
  const valueBonus =
    item.pricing.hasPositiveValue && item.pricing.evPct !== null
      ? 40 + Math.min(30, item.pricing.evPct * 2)
      : 0;
  const quoteBonus = item.pricing.marketDecimal !== null ? 15 : 0;
  const balanceScore = 30 - Math.abs(item.pricing.p - 0.58) * 50;
  return primaryBonus + valueBonus + quoteBonus + balanceScore;
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

  const byFamily = new Map<MarketFamilyId, CatalogPickItem[]>();
  for (const item of catalog.picks) {
    const list = byFamily.get(item.family) ?? [];
    list.push(item);
    byFamily.set(item.family, list);
  }

  const trimmedPerFamily: CatalogPickItem[] = [];
  for (const items of byFamily.values()) {
    const sorted = items
      .slice()
      .sort((a, b) => rankPickForCompaction(b) - rankPickForCompaction(a))
      .slice(0, maxPerFamily);
    trimmedPerFamily.push(...sorted);
  }

  const selected: CatalogPickItem[] = [];
  const selectedIds = new Set<string>();

  for (const items of byFamily.values()) {
    if (selected.length >= maxTotal) break;
    const best = items
      .slice()
      .sort((a, b) => rankPickForCompaction(b) - rankPickForCompaction(a))[0];
    if (best && !selectedIds.has(best.id)) {
      selectedIds.add(best.id);
      selected.push(best);
    }
  }

  const remainder = trimmedPerFamily
    .filter((item) => !selectedIds.has(item.id))
    .sort((a, b) => rankPickForCompaction(b) - rankPickForCompaction(a));

  for (const item of remainder) {
    if (selected.length >= maxTotal) break;
    selectedIds.add(item.id);
    selected.push(item);
  }

  const finalPicks = compactMode
    ? selected.map((item) => ({
        ...item,
        evidence: {
          ...item.evidence,
          windows: item.evidence.windows.slice(0, 3),
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
    nowIso: options.nowIso,
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
      maxPicksPerFamily: options.maxPicksPerFamily ?? 2,
      maxTotalPicks: options.maxTotalPicks ?? 18,
      compact: options.compact ?? true,
    });
    result.set(game.id, catalog);
  }
  return result;
}
