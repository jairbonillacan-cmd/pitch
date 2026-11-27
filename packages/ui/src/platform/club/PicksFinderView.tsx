"use client";

import React, {
  Suspense,
  lazy,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { isLivePhaseActive, type LiveScoreboardEntry } from "@pitchlab/contracts";
import {
  Button,
  SofascoreCard,
  SofascoreEmptyState,
  SofascoreKpiStrip,
  type SofascoreKpiItem,
} from "../../components/ui/primitives";
import { formatOddsValue, isPickUnlocked } from "../access-guard";
import { normalizeBookKey, resolvePreferredBookQuote } from "../bookmakers";
import { MaestroIcon, type MaestroIconName } from "../components/MaestroPrimitives";
import { MarketCategoryIcon } from "../components/PackSportIcons";
import { AtmosphereStage, ClubWorkspaceShell } from "../components/ShellChrome";
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
  scoreRecommendedCatalogPick,
  selectPicksOfTheDay,
  type CatalogPickItem,
  type MatchPicksCatalog,
  type PickLabResponsePayload,
  type ScreenerApiResponse,
} from "../picks-catalog";
import {
  useJournalEntries,
  usePlatformActions,
  usePlatformCore,
} from "../platform-provider";
import {
  MAX_SAVED_SCREENER_VIEWS,
  sliderStepToOdds,
  smoothOddsWeight,
  type SavedScreenerView,
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
import { classifyOddsMovement } from "./picks/BookmakerComparePill";
import { extractEvidenceWindows } from "./picks/EvidenceWindowPills";
import type { PickLabCustomSelection } from "./picks/PickEvidenceLabDrawer";
import { SavedViewsBar } from "./picks/SavedViewsBar";
import {
  BANDS,
  DEFAULT_LIVE_TRACKER_POLL_MS,
  DIRECTION_OPTIONS,
  EXTENDED_SYNTH_MARKETS,
  FLAT_PICKS_STEP,
  GAMES_PAGE_STEP,
  GROUP_MODES,
  INITIAL_FLAT_PICKS,
  INITIAL_GAMES_SHOWN,
  MARKET_FAMILY_GROUPS,
  MARKET_FAMILY_SHORT_LABELS,
  MAX_AUDITABLE_EDGE_PTS,
  MAX_DEVIG_DIVERGENCE_PROB,
  MAX_SHARP_AUDITABLE_EV_PCT,
  MAX_SOFT_AUDITABLE_EV_PCT,
  PERIOD_OPTIONS,
  PER_MATCH_INITIAL_PICKS,
  PER_MATCH_LOAD_STEP,
  PICK_TYPE_OPTIONS,
  POSITION_OPTIONS,
  QUICK_BOOKS,
  QUICK_PRESETS,
  SORT_OPTIONS,
  SPORT_OPTIONS,
  TRIVIAL_ODDS_FLOOR,
  WINDOW_OPTIONS,
  bandOf,
  buildCompactEvidenceBullets,
  buildFallbackCatalogPickItem,
  buildMarketLookupKey,
  defaultFamilyForSport,
  directionToFilterBucket,
  ensurePickLabelWithUnit,
  evaluateAuditableQuotePricing,
  formatProjectedScore,
  isCatalogFamilyId,
  isLineSensitiveMarket,
  isSharpQuoteBook,
  marketRowToScreenerPick,
  matchesMarketFamily,
  normText,
  parseDirectionFilter,
  parseFamilyFilter,
  parseLiveTrackedPicksPayload,
  parsePeriodFilter,
  parsePickTypeFilter,
  parsePositionFilter,
  parseSortExtended,
  parseSportFilter,
  parseWindowFilter,
  primaryFamilyOf,
  resolveMarketFamilyIdFromRaw,
  resolvePickPeriod,
  resolvePlayerPositionBucket,
  resolveSameBookDeVigProbForMarket,
  resolveSettlementStatus,
  resolveSideBucket,
  safeParseTimestamp,
  toSavedKind,
  toSavedSort,
  type Band,
  type DirectionFilter,
  type FilterAccordionId,
  type GroupMode,
  type LegacyFamilyGroup,
  type LiveTrackedPickView,
  type MarketFamilyFilter,
  type PeriodFilter,
  type PickTypeFilter,
  type PositionFilter,
  type QuickPresetId,
  type ScreenerItem,
  type ScreenerSortExtended,
  type TimingMode,
} from "./picks/picks-finder-model";
import {
  MobileFiltersSheet,
  ScreenerMarketGroupHeader,
  ScreenerMatchGroupHeader,
  ScreenerPickTable,
  ScreenerPotdSection,
  loadBetBuilderDrawer,
  loadPickEvidenceLabDrawer,
} from "./picks/PicksScreenerWidgets";

const LazyPickEvidenceLabDrawer = lazy(loadPickEvidenceLabDrawer);
const LazyBetBuilderDrawer = lazy(loadBetBuilderDrawer);
const LazyLivePickProgressBar = lazy(() =>
  import("../atomic/LivePickProgressBar").then((m) => ({ default: m.LivePickProgressBar })),
);
const LazyNonLinearOddsSlider = lazy(() =>
  import("./picks/NonLinearOddsSlider").then((m) => ({ default: m.NonLinearOddsSlider })),
);

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

export interface PicksFinderClubViewProps {
  readonly initialCatalogs?: Readonly<Record<string, MatchPicksCatalog>> | null;
  readonly initialPicksOfTheDay?: readonly CatalogPickItem[] | null;
}

interface ScreenerExtendedWireResponse extends ScreenerApiResponse {
  readonly tabCounts?: {
    readonly upcoming: number;
    readonly live: number;
    readonly settled: number;
  };
  readonly leagueFacets?: readonly {
    readonly league: string;
    readonly label: string;
    readonly sport: PlatformGame["sport"];
    readonly count: number;
  }[];
  readonly games?: Readonly<Record<string, PlatformGame>>;
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
  const [openAccordions, setOpenAccordions] = useState<ReadonlySet<FilterAccordionId>>(
    () => new Set<FilterAccordionId>(["casas"]),
  );
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
  const [apiGamesById, setApiGamesById] = useState<Readonly<Record<string, PlatformGame>>>({});
  const [apiTabCounts, setApiTabCounts] = useState<{
    readonly upcoming: number;
    readonly live: number;
    readonly settled: number;
  } | null>(null);
  const [apiLeagueFacets, setApiLeagueFacets] = useState<
    readonly { readonly league: string; readonly label: string; readonly sport: PlatformGame["sport"] }[]
  >([]);
  const [apiPicksOfTheDay, setApiPicksOfTheDay] = useState<readonly CatalogPickItem[]>([]);
  const [apiPage, setApiPage] = useState<number>(1);
  const [loadedApiPage, setLoadedApiPage] = useState<number>(1);
  const [apiHasMore, setApiHasMore] = useState<boolean>(true);
  const lastMergedApiStampRef = useRef<string>("");
  const lastFilterSigRef = useRef<string>("");

  const [liveTrackedItems, setLiveTrackedItems] = useState<readonly LiveTrackedPickView[]>([]);
  const [liveTrackerLoaded, setLiveTrackerLoaded] = useState<boolean>(false);
  const [liveTrackerAuthBlocked, setLiveTrackerAuthBlocked] = useState<boolean>(false);
  const [liveTrackerPollMs, setLiveTrackerPollMs] = useState<number | null>(
    DEFAULT_LIVE_TRACKER_POLL_MS,
  );

  const debouncedSearch = useDebouncedValue(searchQuery, 180);
  const debouncedMinOddsStep = useDebouncedValue(minOddsStep, 180);
  const debouncedMaxOddsStep = useDebouncedValue(maxOddsStep, 180);
  const normalizedSearch = useMemo(() => normText(debouncedSearch.trim()), [debouncedSearch]);

  const debouncedMinOddsVal = useMemo(
    () => sliderStepToOdds(debouncedMinOddsStep) ?? 1.01,
    [debouncedMinOddsStep],
  );
  const debouncedMaxOddsVal = useMemo(
    () => sliderStepToOdds(debouncedMaxOddsStep),
    [debouncedMaxOddsStep],
  );
  const effectiveIncludeTrivial =
    includeTrivialOdds ||
    (debouncedMinOddsStep > 0 && debouncedMinOddsVal < TRIVIAL_ODDS_FLOOR);

  const screenerFilterSig = useMemo(
    () =>
      [
        timing,
        windowFilter,
        sort,
        sport,
        league,
        band,
        family,
        pickTypeFilter,
        onlyRecommended ? "1" : "0",
        effectiveIncludeTrivial ? "1" : "0",
        onlyPositiveEdge ? "1" : "0",
        String(debouncedMinOddsStep),
        String(debouncedMaxOddsStep),
        normalizedSearch,
      ].join("|"),
    [
      band,
      debouncedMaxOddsStep,
      debouncedMinOddsStep,
      effectiveIncludeTrivial,
      family,
      league,
      normalizedSearch,
      onlyPositiveEdge,
      onlyRecommended,
      pickTypeFilter,
      sort,
      sport,
      timing,
      windowFilter,
    ],
  );

  useSafeEffect(() => {
    if (!lastFilterSigRef.current) {
      lastFilterSigRef.current = screenerFilterSig;
      return;
    }
    if (lastFilterSigRef.current !== screenerFilterSig) {
      lastFilterSigRef.current = screenerFilterSig;
      lastMergedApiStampRef.current = "";
      setApiPage(1);
      setLoadedApiPage(1);
      setExtraCatalogs({});
      setApiGamesById({});
    }
  }, [screenerFilterSig]);

  const screenerFetchUrl = useMemo(() => {
    const params = new URLSearchParams({
      page: String(apiPage),
      pageSize: "24",
      tab: timing,
      day: windowFilter,
      sort,
      onlyRecommended: onlyRecommended ? "1" : "0",
      includeTrivial: effectiveIncludeTrivial ? "1" : "0",
    });
    if (sport !== "all") params.set("sport", sport);
    if (league !== "all") params.set("league", league);
    if (band !== "all") params.set("band", band);
    if (family !== "all") params.set("family", family);
    if (pickTypeFilter !== "all") params.set("pickType", pickTypeFilter);
    if (onlyPositiveEdge) params.set("onlyPositiveEdge", "1");
    if (debouncedMinOddsStep > 0) params.set("minOdds", debouncedMinOddsVal.toFixed(2));
    if (debouncedMaxOddsVal !== null) params.set("maxOdds", debouncedMaxOddsVal.toFixed(2));
    if (normalizedSearch.length > 0) params.set("q", normalizedSearch);
    return `/api/picks/screener?${params.toString()}`;
  }, [
    apiPage,
    band,
    debouncedMaxOddsVal,
    debouncedMinOddsStep,
    debouncedMinOddsVal,
    effectiveIncludeTrivial,
    family,
    league,
    normalizedSearch,
    onlyPositiveEdge,
    onlyRecommended,
    pickTypeFilter,
    sort,
    sport,
    timing,
    windowFilter,
  ]);

  const screenerPageFetch = useAbortableJson<ScreenerExtendedWireResponse>(screenerFetchUrl, {
    enabled: typeof window !== "undefined",
  });

  useSafeEffect(() => {
    const payload = screenerPageFetch.data;
    if (!payload || !payload.ok) return;
    const stamp = `${payload.page}:${payload.generatedAtUtc}`;
    if (lastMergedApiStampRef.current === stamp) return;
    lastMergedApiStampRef.current = stamp;
    setExtraCatalogs((prev) =>
      payload.page === 1 ? payload.catalogs : { ...prev, ...payload.catalogs },
    );
    if (payload.games) {
      const nextGames = payload.games;
      setApiGamesById((prev) => (payload.page === 1 ? nextGames : { ...prev, ...nextGames }));
    }
    if (payload.tabCounts) {
      setApiTabCounts(payload.tabCounts);
    }
    if (payload.leagueFacets) {
      setApiLeagueFacets(payload.leagueFacets);
    }
    setLoadedApiPage(payload.page);
    setApiHasMore(payload.hasMore);
    if (payload.picksOfTheDay.length > 0) {
      setApiPicksOfTheDay(payload.picksOfTheDay);
    }
    if (payload.page > 1) {
      setVisibleGamesCount((count) => count + GAMES_PAGE_STEP);
    }
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
    const hasExtra = Object.keys(extraCatalogs).length > 0;
    if (hasExtra) {
      return initialCatalogs ? { ...initialCatalogs, ...extraCatalogs } : extraCatalogs;
    }
    return initialCatalogs ?? extraCatalogs;
  }, [extraCatalogs, initialCatalogs]);

  const screenerGames = useMemo<readonly PlatformGame[]>(() => {
    const apiList = Object.values(apiGamesById);
    if (apiList.length === 0) return dataset.games;
    const seen = new Set(dataset.games.map((g) => g.id));
    const merged = [...dataset.games];
    for (const game of apiList) {
      if (!seen.has(game.id)) {
        seen.add(game.id);
        merged.push(game);
      }
    }
    return merged;
  }, [apiGamesById, dataset.games]);

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

    for (const game of screenerGames) {
      const isSettled = game.status === "FT";
      const liveEntry = liveByGameId.get(game.id);
      const isLiveGame =
        !isSettled &&
        (game.status === "LIVE" || Boolean(liveEntry && isLivePhaseActive(liveEntry.phase)));
      const tabBucket: TimingMode = isSettled ? "settled" : isLiveGame ? "live" : "upcoming";
      const gameProjectedLabel = formatProjectedScore(game);

      const marketByKey = new Map<string, PlatformMarketRow>();
      for (const m of game.markets) {
        const normMarket = m.market.toLowerCase();
        marketByKey.set(buildMarketLookupKey(normMarket, m.selection, m.line), m);
        if (normMarket === "h2h") {
          marketByKey.set(buildMarketLookupKey("1x2", m.selection, m.line), m);
        } else if (normMarket === "1x2") {
          marketByKey.set(buildMarketLookupKey("h2h", m.selection, m.line), m);
        } else if (
          (normMarket.startsWith("totals_") || normMarket === "over_under") &&
          typeof m.line === "number" &&
          Number.isFinite(m.line)
        ) {
          const aliasKey = buildMarketLookupKey("totals", m.selection, m.line);
          if (!marketByKey.has(aliasKey)) {
            marketByKey.set(aliasKey, m);
          }
        }
      }

      const liveDetail = isLiveGame ? liveMatchStore(game.id).getSnapshot().data : null;
      const serverCatalog = mergedCatalogs[game.id] ?? null;

      if (serverCatalog && serverCatalog.picks.length > 0) {
        for (let idx = 0; idx < serverCatalog.picks.length; idx += 1) {
          const rawCatItem = serverCatalog.picks[idx]!;
          const normalizedLabel = rawCatItem.isRedacted
            ? rawCatItem.label
            : ensurePickLabelWithUnit(
                rawCatItem.label,
                rawCatItem.family,
                rawCatItem.sport,
                rawCatItem.playerMeta?.statLabel ?? null,
              );
          const catItem =
            normalizedLabel === rawCatItem.label
              ? rawCatItem
              : { ...rawCatItem, label: normalizedLabel };
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
              isPricingAnomalous: false,
              evidenceWindows: [],
              searchHaystack,
            });
            continue;
          }

          const matchedRow =
            marketByKey.get(buildMarketLookupKey(catItem.family, catItem.selectionKey, catItem.line)) ??
            (!isLineSensitiveMarket(catItem.family)
              ? marketByKey.get(buildMarketLookupKey(catItem.family, catItem.selectionKey, null))
              : undefined);
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

          const serverSuppressedPricing =
            (catItem.pricing.marketDecimal !== null && catItem.pricing.evPct === null) ||
            (catItem.pricing.deVigMarketProb !== null &&
              Math.abs(pick.p - catItem.pricing.deVigMarketProb) > MAX_DEVIG_DIVERGENCE_PROB);

          let valuePct: number | null = null;
          let edgePts: number | null = null;
          let isPricingAnomalous = false;

          if (prefQuote != null) {
            const sameAsSuppressedServerQuote =
              serverSuppressedPricing &&
              catItem.pricing.marketDecimal !== null &&
              Math.abs(prefQuote.decimal - catItem.pricing.marketDecimal) < 0.005;
            if (sameAsSuppressedServerQuote) {
              isPricingAnomalous = true;
            } else {
              const sameBookDeVig =
                resolveSameBookDeVigProbForMarket(
                  game.markets,
                  catItem.family,
                  catItem.selectionKey,
                  catItem.line,
                  normalizeBookKey(prefQuote.book),
                ) ?? catItem.pricing.deVigMarketProb;
              const evaluated = evaluateAuditableQuotePricing({
                p: pick.p,
                houseDecimal,
                bookId: prefQuote.book,
                bookLabel: prefQuote.bookLabel,
                deVigProb: sameBookDeVig,
              });
              valuePct = evaluated.valuePct;
              edgePts = evaluated.edgePts;
              isPricingAnomalous = evaluated.isAnomalous;
            }
          } else if (serverSuppressedPricing) {
            isPricingAnomalous = true;
          } else if (catItem.pricing.evPct !== null) {
            const evCap = isSharpQuoteBook(undefined, houseLabel)
              ? MAX_SHARP_AUDITABLE_EV_PCT
              : MAX_SOFT_AUDITABLE_EV_PCT;
            if (catItem.pricing.evPct > evCap) {
              isPricingAnomalous = true;
            } else {
              valuePct = catItem.pricing.evPct;
              edgePts = catItem.pricing.edgePts;
            }
          } else if (catItem.pricing.marketDecimal === null && houseDecimal !== null) {
            const evaluated = evaluateAuditableQuotePricing({
              p: pick.p,
              houseDecimal,
              bookLabel: houseLabel,
              deVigProb: catItem.pricing.deVigMarketProb,
            });
            valuePct = evaluated.valuePct;
            edgePts = evaluated.edgePts;
            isPricingAnomalous = evaluated.isAnomalous;
          }

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
            isPricingAnomalous,
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
          ? (marketByKey.get(buildMarketLookupKey(pick.market, pick.selectionKey, pick.line)) ??
            (!isLineSensitiveMarket(pick.market)
              ? marketByKey.get(buildMarketLookupKey(pick.market, pick.selectionKey, null))
              : undefined))
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
        const fallbackDeVig =
          prefQuote && pick.market
            ? resolveSameBookDeVigProbForMarket(
                game.markets,
                pick.market,
                pick.selectionKey,
                pick.line,
                normalizeBookKey(prefQuote.book),
              )
            : null;
        const fallbackPricing = evaluateAuditableQuotePricing({
          p: pick.p,
          houseDecimal,
          bookId: prefQuote?.book,
          bookLabel: houseLabel,
          deVigProb: fallbackDeVig,
        });
        const valuePct = fallbackPricing.valuePct;
        const edgePts =
          houseDecimal !== null && houseDecimal > 1
            ? fallbackPricing.edgePts
            : fallbackPricing.isAnomalous
              ? null
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
        const normalizedFallbackLabel = ensurePickLabelWithUnit(
          pick.label,
          resolvedFamilyId,
          game.sport,
        );
        const normalizedPick: MatchPick =
          normalizedFallbackLabel === pick.label
            ? pick
            : { ...pick, label: normalizedFallbackLabel };
        const period = resolvePickPeriod(normalizedPick, resolvedFamilyId);
        const sideBucket = resolveSideBucket(normalizedPick, game, null);
        const settlement = resolveSettlementStatus(game, normalizedPick, resolvedFamilyId);
        const baseWindows = extractEvidenceWindows({ game, pick: normalizedPick });
        const evidenceWindows = buildCompactEvidenceBullets(baseWindows);
        const isFallbackLocked = !isPickUnlocked(normalizedPick, game.status, viewerRole);
        const catalogPick = buildFallbackCatalogPickItem({
          pick: normalizedPick,
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
              `${game.home.name} ${game.home.shortName} ${game.away.name} ${game.away.shortName} ${game.leagueLabel} ${normalizedPick.label} ${normalizedPick.categoryLabel} ${normalizedPick.marketGroup}`,
            );

        out.push({
          game,
          pick:
            quotes && !normalizedPick.bookQuotes
              ? { ...normalizedPick, bookQuotes: quotes }
              : normalizedPick,
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
          isPricingAnomalous: isFallbackLocked ? false : fallbackPricing.isAnomalous,
          evidenceWindows: isFallbackLocked ? [] : evidenceWindows,
          searchHaystack,
        });
      }
    }
    return out;
  }, [screenerGames, liveBoard.data?.entries, mergedCatalogs, preferredBooks, viewerRole]);

  const itemByPickId = useMemo(() => {
    const map = new Map<string, ScreenerItem>();
    for (const item of all) {
      map.set(item.pick.id, item);
    }
    return map;
  }, [all]);

  const gameById = useMemo(() => {
    const map = new Map<string, PlatformGame>();
    for (const game of screenerGames) {
      map.set(game.id, game);
    }
    return map;
  }, [screenerGames]);

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
      const normalizedPotdLabel = catPick.isRedacted
        ? catPick.label
        : ensurePickLabelWithUnit(
            catPick.label,
            catPick.family,
            catPick.sport,
            catPick.playerMeta?.statLabel ?? null,
          );
      const safeCatPick =
        normalizedPotdLabel === catPick.label
          ? catPick
          : { ...catPick, label: normalizedPotdLabel };
      const matchPick = catalogPickItemToMatchPick(safeCatPick, game, 0);
      const scored = scoreRecommendedCatalogPick(safeCatPick);
      const baseWindows = catalogEvidenceToWindowItems(safeCatPick.evidence, safeCatPick.sport);
      const potdEvCap = isSharpQuoteBook(undefined, catPick.pricing.marketBookLabel)
        ? MAX_SHARP_AUDITABLE_EV_PCT
        : MAX_SOFT_AUDITABLE_EV_PCT;
      const potdAnomalous =
        (catPick.pricing.marketDecimal !== null && catPick.pricing.evPct === null) ||
        (catPick.pricing.evPct !== null && catPick.pricing.evPct > potdEvCap) ||
        (catPick.pricing.deVigMarketProb !== null &&
          Math.abs(catPick.pricing.p - catPick.pricing.deVigMarketProb) > MAX_DEVIG_DIVERGENCE_PROB);
      resolved.push({
        game,
        pick: matchPick,
        catalogPick: safeCatPick,
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
        valuePct: potdAnomalous ? null : catPick.pricing.evPct,
        edgePts: potdAnomalous ? null : catPick.pricing.edgePts,
        isPricingAnomalous: potdAnomalous,
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

  const handleAccordionToggle = useCallback((id: FilterAccordionId, isOpen: boolean) => {
    setOpenAccordions((prev) => {
      if (prev.has(id) === isOpen) return prev;
      const next = new Set(prev);
      if (isOpen) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const activePresetId = useMemo<QuickPresetId | null>(() => {
    if (timing === "live") return "en-vivo";
    if (timing !== "upcoming") return null;
    if (onlyPositiveEdge && sort === "ev" && family === "all" && band === "all" && pickTypeFilter === "all") {
      return "mejor-valor";
    }
    if (band === "alta" && sort === "p" && family === "all" && !onlyPositiveEdge && pickTypeFilter === "all") {
      return "alta-prob";
    }
    if (family === "goles" && band === "all" && !onlyPositiveEdge && pickTypeFilter === "all") {
      return "goles";
    }
    if (family === "resultado" && pickTypeFilter === "team_match" && band === "all" && !onlyPositiveEdge) {
      return "principales";
    }
    if (family === "props" && band === "all" && !onlyPositiveEdge) {
      return "props";
    }
    return null;
  }, [band, family, onlyPositiveEdge, pickTypeFilter, sort, timing]);

  const applyQuickPreset = useCallback(
    (presetId: QuickPresetId) => {
      setActiveViewId(null);
      setVisibleGamesCount(INITIAL_GAMES_SHOWN);
      setPerMatchVisibleCounts({});
      setFlatShown(INITIAL_FLAT_PICKS);

      if (activePresetId === presetId) {
        setTiming("upcoming");
        setSort("recomendados");
        setBand("all");
        setFamily("all");
        setPickTypeFilter("all");
        setOnlyPositiveEdge(false);
        setOnlyRecommended(true);
        return;
      }

      if (presetId === "en-vivo") {
        setTiming("live");
        return;
      }

      setTiming("upcoming");
      setBand("all");
      setFamily("all");
      setPickTypeFilter("all");
      setOnlyPositiveEdge(false);
      setOnlyRecommended(true);
      setSort("recomendados");

      if (presetId === "mejor-valor") {
        setOnlyPositiveEdge(true);
        setSort("ev");
      } else if (presetId === "alta-prob") {
        setBand("alta");
        setOnlyRecommended(false);
        setSort("p");
      } else if (presetId === "goles") {
        setFamily("goles");
      } else if (presetId === "principales") {
        setFamily("resultado");
        setPickTypeFilter("team_match");
      } else if (presetId === "props") {
        setFamily("props");
        setOnlyRecommended(false);
      }
    },
    [activePresetId],
  );

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
      if (debouncedMinOddsStep > 0 && effectiveDec < debouncedMinOddsVal - 0.001) return false;
      if (debouncedMaxOddsVal !== null && effectiveDec > debouncedMaxOddsVal + 0.001) return false;
      return true;
    },
    [debouncedMaxOddsVal, debouncedMinOddsStep, debouncedMinOddsVal],
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

  const singlePassEvaluation = useMemo(() => {
    const liveIds = new Set<string>();
    let upcomingCount = 0;
    let settledCount = 0;
    const localLeagueSeen = new Map<string, string>();
    const localTeamSeen = new Map<string, string>();
    const counts: Record<Band, number> = { all: 0, alta: 0, media: 0, baja: 0 };
    const matchedRows: ScreenerItem[] = [];

    for (const item of all) {
      if (item.tabBucket === "live") {
        liveIds.add(item.pick.id);
      } else if (item.tabBucket === "settled") {
        settledCount += 1;
      } else if (!onlyRecommended || item.isRecommended) {
        upcomingCount += 1;
      }

      if (item.tabBucket !== timing) continue;

      const sportMatched = sport === "all" || matchesSportFilter(item.game, sport);
      if (sportMatched) {
        if (!localLeagueSeen.has(item.game.league)) {
          localLeagueSeen.set(item.game.league, item.game.leagueLabel);
        }
        if (league === "all" || item.game.league === league) {
          if (!localTeamSeen.has(item.game.home.slug)) {
            localTeamSeen.set(item.game.home.slug, item.game.home.name);
          }
          if (!localTeamSeen.has(item.game.away.slug)) {
            localTeamSeen.set(item.game.away.slug, item.game.away.name);
          }
        }
      }

      if (!sportMatched) continue;
      if (league !== "all" && item.game.league !== league) continue;
      if (normalizedSearch && !item.searchHaystack.includes(normalizedSearch)) continue;
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
        if (item.isPricingAnomalous) continue;
        const itemEvCap = isSharpQuoteBook(undefined, item.houseLabel)
          ? MAX_SHARP_AUDITABLE_EV_PCT
          : MAX_SOFT_AUDITABLE_EV_PCT;
        const hasAuditableEv =
          item.valuePct !== null && item.valuePct > 0 && item.valuePct <= itemEvCap;
        const hasAuditableEdge =
          item.valuePct === null &&
          item.edgePts !== null &&
          item.edgePts > 0 &&
          item.edgePts <= MAX_AUDITABLE_EDGE_PTS;
        if (!hasAuditableEv && !hasAuditableEdge) continue;
      }

      const effectiveDec = item.houseDecimal ?? item.pick.fairDecimal;
      if (timing === "upcoming") {
        if (!effectiveIncludeTrivial && effectiveDec > 0 && effectiveDec < TRIVIAL_ODDS_FLOOR) {
          continue;
        }
        if (onlyRecommended && !item.isRecommended) {
          continue;
        }
      }
      if (effectiveDec > 0 && !matchesOddsRange(effectiveDec)) continue;

      const itemBand = bandOf(item.pick.p);
      counts.all += 1;
      counts[itemBand] += 1;
      if (band === "all" || itemBand === band) {
        matchedRows.push(item);
      }
    }

    for (const tracked of liveTrackedItems) {
      liveIds.add(tracked.pickId);
    }

    matchedRows.sort((a, b) => {
      if (timing === "settled") {
        return (
          safeParseTimestamp(b.game.kickoffUtc) - safeParseTimestamp(a.game.kickoffUtc) ||
          b.recommendationScore - a.recommendationScore ||
          b.pick.p - a.pick.p
        );
      }
      if (sort === "recomendados") {
        const aCap = isSharpQuoteBook(undefined, a.houseLabel)
          ? MAX_SHARP_AUDITABLE_EV_PCT
          : MAX_SOFT_AUDITABLE_EV_PCT;
        const bCap = isSharpQuoteBook(undefined, b.houseLabel)
          ? MAX_SHARP_AUDITABLE_EV_PCT
          : MAX_SOFT_AUDITABLE_EV_PCT;
        const aEv =
          !a.isPricingAnomalous && a.valuePct !== null && a.valuePct <= aCap ? a.valuePct : -999;
        const bEv =
          !b.isPricingAnomalous && b.valuePct !== null && b.valuePct <= bCap ? b.valuePct : -999;
        return (
          b.recommendationScore - a.recommendationScore ||
          b.convergenceCount - a.convergenceCount ||
          bEv - aEv ||
          b.pick.p - a.pick.p
        );
      }
      if (sort === "ev") {
        const aCap = isSharpQuoteBook(undefined, a.houseLabel)
          ? MAX_SHARP_AUDITABLE_EV_PCT
          : MAX_SOFT_AUDITABLE_EV_PCT;
        const bCap = isSharpQuoteBook(undefined, b.houseLabel)
          ? MAX_SHARP_AUDITABLE_EV_PCT
          : MAX_SOFT_AUDITABLE_EV_PCT;
        const aEv =
          !a.isPricingAnomalous && a.valuePct !== null && a.valuePct <= aCap ? a.valuePct : -999;
        const bEv =
          !b.isPricingAnomalous && b.valuePct !== null && b.valuePct <= bCap ? b.valuePct : -999;
        return (
          bEv - aEv ||
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

    return {
      rows: matchedRows,
      counts,
      localTimingCounts: {
        live: liveIds.size,
        upcoming: upcomingCount,
        settled: settledCount,
      },
      localLeagues: Array.from(localLeagueSeen.entries()),
      teams: Array.from(localTeamSeen.entries()).sort((a, b) => a[1].localeCompare(b[1], "es")),
    };
  }, [
    all,
    band,
    directionFilter,
    effectiveIncludeTrivial,
    family,
    league,
    liveTrackedItems,
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

  const { rows, counts, localTimingCounts, localLeagues, teams } = singlePassEvaluation;

  const timingCounts = useMemo(() => {
    if (!apiTabCounts) return localTimingCounts;
    return {
      upcoming: Math.max(apiTabCounts.upcoming, localTimingCounts.upcoming),
      live: Math.max(apiTabCounts.live, localTimingCounts.live),
      settled: Math.max(apiTabCounts.settled, localTimingCounts.settled),
    };
  }, [apiTabCounts, localTimingCounts]);

  const tabItems = useMemo<
    readonly {
      readonly id: TimingMode;
      readonly label: string;
      readonly count: number;
      readonly icon: MaestroIconName;
    }[]
  >(
    () => [
      {
        id: "upcoming",
        label: "Recomendados / Próximos",
        count: timingCounts.upcoming,
        icon: "target-picks",
      },
      {
        id: "live",
        label: "Activos / En vivo",
        count: timingCounts.live,
        icon: "live-pulse",
      },
      {
        id: "settled",
        label: "Liquidados FT",
        count: timingCounts.settled,
        icon: "verified-seal",
      },
    ],
    [timingCounts.live, timingCounts.settled, timingCounts.upcoming],
  );

  const leagues = useMemo(() => {
    if (apiLeagueFacets.length === 0) return localLeagues;
    const seen = new Map<string, string>(localLeagues);
    for (const f of apiLeagueFacets) {
      if (
        sport !== "all" &&
        !matchesSportFilter(
          { sport: f.sport, league: f.league } as Pick<PlatformGame, "sport" | "league">,
          sport,
        )
      ) {
        continue;
      }
      if (!seen.has(f.league)) {
        seen.set(f.league, f.label);
      }
    }
    return Array.from(seen.entries());
  }, [apiLeagueFacets, localLeagues, sport]);

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
      setApiPage(loadedApiPage + 1);
    }
  }, [
    allGroupedByMatch.length,
    apiHasMore,
    loadedApiPage,
    screenerPageFetch.loading,
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

  const handleCloseBuilder = useCallback(() => {
    setBuilderTarget(null);
  }, []);

  const handleTogglePotdExpanded = useCallback(() => {
    setPotdExpanded((v) => !v);
  }, []);

  const handleCloseMobileSheet = useCallback(() => {
    setMobileSheetOpen(false);
  }, []);

  const handleLoadMoreFlat = useCallback(() => {
    setFlatShown((n) => n + FLAT_PICKS_STEP);
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
        <details
          className="pl-scr-acc"
          open={openAccordions.has("group")}
          onToggle={(e) => handleAccordionToggle("group", e.currentTarget.open)}
        >
          <summary className="pl-scr-acc-summary">
            <span className="pl-scr-acc-key">Agrupar por</span>
            <span className="pl-scr-acc-val">{currentGroupLabel}</span>
          </summary>
          {openAccordions.has("group") ? (
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
          ) : null}
        </details>

        <details
          className="pl-scr-acc"
          open={openAccordions.has("sort")}
          onToggle={(e) => handleAccordionToggle("sort", e.currentTarget.open)}
        >
          <summary className="pl-scr-acc-summary">
            <span className="pl-scr-acc-key">Ordenar por</span>
            <span className="pl-scr-acc-val">{currentSortLabel}</span>
          </summary>
          {openAccordions.has("sort") ? (
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
          ) : null}
        </details>

        <details
          className="pl-scr-acc"
          open={openAccordions.has("pickType")}
          onToggle={(e) => handleAccordionToggle("pickType", e.currentTarget.open)}
        >
          <summary className="pl-scr-acc-summary">
            <span className="pl-scr-acc-key">Tipo de pick</span>
            <span className="pl-scr-acc-val">{currentTypeLabel}</span>
          </summary>
          {openAccordions.has("pickType") ? (
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
          ) : null}
        </details>

        <details
          className="pl-scr-acc"
          open={openAccordions.has("direction")}
          onToggle={(e) => handleAccordionToggle("direction", e.currentTarget.open)}
        >
          <summary className="pl-scr-acc-summary">
            <span className="pl-scr-acc-key">Dirección</span>
            <span className="pl-scr-acc-val">{currentDirectionLabel}</span>
          </summary>
          {openAccordions.has("direction") ? (
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
          ) : null}
        </details>

        <details
          className="pl-scr-acc"
          open={openAccordions.has("period")}
          onToggle={(e) => handleAccordionToggle("period", e.currentTarget.open)}
        >
          <summary className="pl-scr-acc-summary">
            <span className="pl-scr-acc-key">Periodo</span>
            <span className="pl-scr-acc-val">{currentPeriodLabel}</span>
          </summary>
          {openAccordions.has("period") ? (
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
          ) : null}
        </details>

        <details
          className="pl-scr-acc"
          open={openAccordions.has("markets")}
          onToggle={(e) => handleAccordionToggle("markets", e.currentTarget.open)}
        >
          <summary className="pl-scr-acc-summary">
            <span className="pl-scr-acc-key">Mercados</span>
            <span className="pl-scr-acc-val truncate">{currentMarketLabel}</span>
          </summary>
          {openAccordions.has("markets") ? (
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
          ) : null}
        </details>

        <details
          className="pl-scr-acc"
          open={openAccordions.has("position")}
          onToggle={(e) => handleAccordionToggle("position", e.currentTarget.open)}
        >
          <summary className="pl-scr-acc-summary">
            <span className="pl-scr-acc-key">Posiciones</span>
            <span className="pl-scr-acc-val">{currentPosLabel}</span>
          </summary>
          {openAccordions.has("position") ? (
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
          ) : null}
        </details>

        <details
          className="pl-scr-acc"
          open={openAccordions.has("competitions")}
          onToggle={(e) => handleAccordionToggle("competitions", e.currentTarget.open)}
        >
          <summary className="pl-scr-acc-summary">
            <span className="pl-scr-acc-key">Competiciones</span>
            <span className="pl-scr-acc-val truncate">{currentCompLabel}</span>
          </summary>
          {openAccordions.has("competitions") ? (
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
          ) : null}
        </details>

        <details
          className="pl-scr-acc"
          open={openAccordions.has("teams")}
          onToggle={(e) => handleAccordionToggle("teams", e.currentTarget.open)}
        >
          <summary className="pl-scr-acc-summary">
            <span className="pl-scr-acc-key">Equipos</span>
            <span className="pl-scr-acc-val truncate">{currentTeamLabel}</span>
          </summary>
          {openAccordions.has("teams") ? (
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
          ) : null}
        </details>

        <details
          className="pl-scr-acc"
          open={openAccordions.has("odds")}
          onToggle={(e) => handleAccordionToggle("odds", e.currentTarget.open)}
        >
          <summary className="pl-scr-acc-summary">
            <span className="pl-scr-acc-key">Cuotas</span>
            <span className="pl-scr-acc-val num">{currentOddsSummary}</span>
          </summary>
          {openAccordions.has("odds") ? (
            <div className="pl-scr-acc-body">
              <Suspense fallback={null}>
                <LazyNonLinearOddsSlider
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
              </Suspense>
            </div>
          ) : null}
        </details>

        <details
          className="pl-scr-acc"
          open={openAccordions.has("band")}
          onToggle={(e) => handleAccordionToggle("band", e.currentTarget.open)}
        >
          <summary className="pl-scr-acc-summary">
            <span className="pl-scr-acc-key">Acierto / Probabilidad</span>
            <span className="pl-scr-acc-val">{currentBandLabel}</span>
          </summary>
          {openAccordions.has("band") ? (
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
          ) : null}
        </details>

        {timing === "upcoming" ? (
          <details
            className="pl-scr-acc"
            open={openAccordions.has("dates")}
            onToggle={(e) => handleAccordionToggle("dates", e.currentTarget.open)}
          >
            <summary className="pl-scr-acc-summary">
              <span className="pl-scr-acc-key">Fechas</span>
              <span className="pl-scr-acc-val">{currentWindowLabel}</span>
            </summary>
            {openAccordions.has("dates") ? (
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
            ) : null}
          </details>
        ) : null}

        <details
          className="pl-scr-acc"
          open={openAccordions.has("casas")}
          onToggle={(e) => handleAccordionToggle("casas", e.currentTarget.open)}
        >
          <summary className="pl-scr-acc-summary">
            <span className="pl-scr-acc-key">Casas</span>
            <span className="pl-scr-acc-val num">{preferredBooks.length} activas</span>
          </summary>
          {openAccordions.has("casas") ? (
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
          ) : null}
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
        <Suspense fallback={null}>
          <div className="pl-scr-live-tracker-grid" data-live-tracker-strip="">
            {liveTrackedItems.map((tracked) => (
              <div
                key={tracked.id}
                className="pl-scr-live-tracker-card"
                data-picks-live-progress=""
              >
                <LazyLivePickProgressBar
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
                        <LazyLivePickProgressBar
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
        </Suspense>
      ) : (
        <p className="pl-scr-live-tracker-note">
          {hasAccountSessionAuth && liveTrackerLoaded
            ? "No tienes picks sellados en juego ahora mismo. Sella un pick desde Próximos para seguir su avance actual / línea aquí."
            : "Inicia sesión con tu cuenta de socio para seguir tus picks sellados en tiempo real con barra actual / línea y alertas de alineación."}
        </p>
      )}
    </SofascoreCard>
  );

  const featuredPotd = picksOfTheDay[0] ?? null;
  const secondaryPotds = useMemo(() => picksOfTheDay.slice(1, 3), [picksOfTheDay]);
  const canLoadMoreMatches = visibleGamesCount < allGroupedByMatch.length || apiHasMore;

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
                        <MaestroIcon name={tabItem.icon} size={14} className="pl-scr-tab-icon" />
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
            <ScreenerPotdSection
              featuredPotd={featuredPotd}
              secondaryPotds={secondaryPotds}
              totalCount={picksOfTheDay.length}
              potdExpanded={potdExpanded}
              oddsFormat={oddsFormat}
              onToggleExpanded={handleTogglePotdExpanded}
              onOpenLab={handleOpenLab}
            />
          ) : null}

          <div className="pl-scr-layout" data-picks-layout="">
            <div
              id={tabPanelId}
              className="pl-scr-main"
              role="tabpanel"
              aria-labelledby={`${tabsUid}-tab-${timing}`}
              data-picks-main=""
            >
              <div
                className="pl-scr-presets-bar"
                role="group"
                aria-label="Presets rápidos de picks"
                data-picks-presets=""
                data-finder-quick-chips=""
              >
                {QUICK_PRESETS.map((preset) => {
                  const isActive = activePresetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      className={`pl-scr-preset-pill${isActive ? " is-active" : ""}`}
                      aria-pressed={isActive}
                      data-picks-preset={preset.id}
                      onClick={() => applyQuickPreset(preset.id)}
                    >
                      {preset.marketIcon ? (
                        <MarketCategoryIcon name={preset.marketIcon} size={14} />
                      ) : preset.maestroIcon ? (
                        <MaestroIcon name={preset.maestroIcon} size={14} />
                      ) : null}
                      <span>{preset.label}</span>
                      {preset.id === "en-vivo" && timingCounts.live > 0 ? (
                        <span className="pl-scr-preset-count num">{timingCounts.live}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

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
                    const matchCap = perMatchVisibleCounts[game.id] ?? PER_MATCH_INITIAL_PICKS;
                    const remainingInMatch = Math.max(0, items.length - Math.min(items.length, matchCap));

                    return (
                      <section
                        key={game.id}
                        className="pl-scr-group"
                        data-screener-match-group={game.id}
                      >
                        <ScreenerMatchGroupHeader
                          game={game}
                          liveEntry={liveEntry}
                          itemsCount={items.length}
                          isCollapsed={isCollapsed}
                          onToggleCollapse={toggleGroupCollapse}
                          onPrefetchRoute={prefetchRoute}
                          onNavigateTo={navigateTo}
                        />

                        {!isCollapsed ? (
                          <>
                            <ScreenerPickTable
                              items={items}
                              limit={matchCap}
                              caption={`Picks de ${game.home.name} vs ${game.away.name}`}
                              showMatchMeta={false}
                              tableKey={`m-${game.id}`}
                              timing={timing}
                              viewerRole={viewerRole}
                              oddsFormat={oddsFormat}
                              manualOddsByPick={manualOddsByPick}
                              openManualPickId={openManualPickId}
                              liveTrackedByPickId={liveTrackedByPickId}
                              onOpenLab={handleOpenLab}
                              onOpenBuilder={handleOpenBuilder}
                              onOpenComposer={openComposer}
                              onOpenManual={handleOpenManual}
                              onManualChange={handleManualChange}
                            />
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
                        <ScreenerMarketGroupHeader
                          groupKey={grp.key}
                          label={grp.label}
                          family={grp.items[0]?.catalogFamilyId ?? grp.key}
                          itemsCount={grp.items.length}
                          isCollapsed={isCollapsed}
                          onToggleCollapse={toggleGroupCollapse}
                        />

                        {!isCollapsed ? (
                          <ScreenerPickTable
                            items={grp.items}
                            caption={`Picks de ${grp.label}`}
                            showMatchMeta
                            tableKey={`k-${grp.key}`}
                            timing={timing}
                            viewerRole={viewerRole}
                            oddsFormat={oddsFormat}
                            manualOddsByPick={manualOddsByPick}
                            openManualPickId={openManualPickId}
                            liveTrackedByPickId={liveTrackedByPickId}
                            onOpenLab={handleOpenLab}
                            onOpenBuilder={handleOpenBuilder}
                            onOpenComposer={openComposer}
                            onOpenManual={handleOpenManual}
                            onManualChange={handleManualChange}
                          />
                        ) : null}
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
                        onClick={handleLoadMoreFlat}
                      >
                        Ver más picks (+{rows.length - flatShown})
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="pl-scr-groups" data-screener-view="flat">
                  <div className="pl-scr-group">
                    <ScreenerPickTable
                      items={visibleFlatRows}
                      caption={`${rows.length} picks filtrados`}
                      showMatchMeta
                      tableKey="flat"
                      timing={timing}
                      viewerRole={viewerRole}
                      oddsFormat={oddsFormat}
                      manualOddsByPick={manualOddsByPick}
                      openManualPickId={openManualPickId}
                      liveTrackedByPickId={liveTrackedByPickId}
                      onOpenLab={handleOpenLab}
                      onOpenBuilder={handleOpenBuilder}
                      onOpenComposer={openComposer}
                      onOpenManual={handleOpenManual}
                      onManualChange={handleManualChange}
                    />
                  </div>
                  {rows.length > flatShown ? (
                    <div className="pl-scr-more-matches">
                      <Button
                        type="button"
                        variant="secondary"
                        size="default"
                        className="num"
                        onClick={handleLoadMoreFlat}
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
            onClose={handleCloseMobileSheet}
          >
            {renderFilterRailContent(true)}
          </MobileFiltersSheet>
        ) : null}

        {builderTarget ? (
          <Suspense fallback={null}>
            <LazyBetBuilderDrawer
              open
              pick={builderTarget.pick}
              game={builderTarget.game}
              onClose={handleCloseBuilder}
            />
          </Suspense>
        ) : null}

        {activeLabPickId && resolvedLabPick ? (
          <Suspense fallback={null}>
            <LazyPickEvidenceLabDrawer
              open
              pick={resolvedLabPick}
              game={resolvedLabGame}
              relatedPicks={activeLabRelatedPicks}
              labDataOverride={resolvedLabDataOverride}
              onClose={handleCloseLab}
              onSelectRelatedPick={handleSelectRelatedPick}
              onAddToParlay={handleLabAddToParlay}
              onSealPick={handleLabSealPick}
            />
          </Suspense>
        ) : null}
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
