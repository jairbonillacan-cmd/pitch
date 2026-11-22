"use client";

import React, {
  Suspense,
  lazy,
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  cleanTeamRouteSlug,
  competitionPrestigeScore,
  getLeagueCapability,
  isLeagueHealthyForUi,
  isSafePublicLabel,
  LeagueIdSchema,
  type LeagueId,
  type LiveScoreboard,
  type LiveScoreboardEntry,
} from "@pitchlab/contracts";
import { isPickUnlocked } from "../../access-guard";
import { LivePicksTrackerStrip } from "../../components/LivePicksTrackerStrip";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import { AtmosphereStage, ClubWorkspaceShell } from "../../components/ShellChrome";
import {
  useAbortableJson,
  useLocalStorageState,
  useMediaQuery,
  useSafeEffect,
} from "../../hooks";
import { useLiveScoreboard } from "../../live/live-store";
import {
  useHomeNavFilter,
  useJournalEntries,
  useParlayState,
  usePlatformActions,
  usePlatformCore,
  useWatchlistGameIds,
} from "../../platform-provider";
import { SAVED_SCREENER_VIEWS_STORAGE_KEY } from "../../screener-views";
import type { MatchPick, PlatformGame } from "../../types";
import { teamTopicKey, useFollowedTopics } from "../community-ui";
import { AstroMatchRow, HomeMatchCardsSection } from "./AstroMatchRow";
import {
  HomeBoardBar,
  HomeFilterHeader,
  HomeTrendingStrip,
  type CalendarEventDaysSummary,
} from "./HomeFilterBar";
import type { HomeMatchDetailPanelProps } from "./HomeMatchDetailPanel";
import { HomeParlayHubCard } from "./HomeParlayHubCard";
import { HomeRightRail } from "./HomeRightRail";
import {
  ALL,
  addDays,
  buildDayOptions,
  filterGames,
  gamesForSelection,
  getTrendingMatches,
  groupMatchesByDayAndLeague,
  resolveHomeDay,
  todayId,
  topPrincipalPicks,
  valuePicks,
  type DaySelection,
  type LeagueFilter,
  type SportFilter,
} from "./home-model";
import {
  ALL_KNOWN_COUNTRIES,
  isEffectiveLiveGame,
  leagueRegionOf,
  type HomeBoardView,
  type HomeFilterModalOptionLeague,
  type MatchStatusFilter,
  type ModelSignalFilter,
} from "./home-view-helpers";

const loadHomeFiltersModal = () =>
  import("./HomeFiltersModal").then((mod) => ({
    default: mod.HomeFiltersModal,
  }));
const LazyHomeFiltersModal = lazy(loadHomeFiltersModal);

const loadHomeMatchDetailPanel = () =>
  import("./HomeMatchDetailPanel").then((mod) => ({
    default: mod.HomeMatchDetailPanel,
  }));
const LazyHomeMatchDetailPanel = lazy(loadHomeMatchDetailPanel);

if (
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(min-width: 1024px)").matches
) {
  void loadHomeMatchDetailPanel();
}

function HomeMatchDetailFallback(): React.JSX.Element {
  return (
    <div
      className="pl-home-md-panel pl-skel-card p-4 space-y-4"
      style={{ minBlockSize: "520px" }}
      role="status"
      aria-busy="true"
      aria-label="Cargando detalle del partido"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="pl-skel-bar h-4 w-36 rounded-md" />
        <div className="pl-skel-bar h-4 w-20 rounded-md" />
      </div>
      <div className="grid grid-cols-3 items-center gap-3 py-2">
        <div className="pl-skel-bar h-12 rounded-xl" />
        <div className="pl-skel-bar h-10 rounded-xl" />
        <div className="pl-skel-bar h-12 rounded-xl" />
      </div>
      <div className="flex gap-2">
        <div className="pl-skel-bar h-8 w-20 rounded-lg" />
        <div className="pl-skel-bar h-8 w-24 rounded-lg" />
        <div className="pl-skel-bar h-8 w-20 rounded-lg" />
      </div>
      <div className="space-y-2.5">
        <div className="pl-skel-bar h-20 rounded-xl" />
        <div className="pl-skel-bar h-20 rounded-xl" />
        <div className="pl-skel-bar h-16 rounded-xl" />
      </div>
    </div>
  );
}

export {
  AstroMatchRow,
  HomeBoardBar,
  HomeFilterHeader,
  HomeParlayHubCard,
  HomeRightRail,
  HomeTrendingStrip,
  type HomeMatchDetailPanelProps,
};

export interface HomeClubViewProps {
  readonly initialDay?: DaySelection;
  readonly initialToday?: string;
  readonly initialSport?: SportFilter;
  readonly initialLeague?: LeagueFilter;
  readonly liveBoardOverride?: LiveScoreboard | null;
}

interface HomePinnedViewItem {
  readonly id: string;
  readonly name: string;
  readonly sport: string;
  readonly league: string;
  readonly onlyPositiveEdge: boolean;
  readonly band: string;
}

interface PreferencesSavedViewsPayload {
  readonly preferences?: {
    readonly savedViews?: unknown;
  };
}

const EMPTY_PINNED_VIEWS: readonly HomePinnedViewItem[] = [];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePinnedViewsArray(raw: unknown): readonly HomePinnedViewItem[] | null {
  if (!Array.isArray(raw)) return null;
  const result: HomePinnedViewItem[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!isRecord(entry) || entry.pinToHomeHub !== true) continue;
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    if (!id || !name || seen.has(id) || !isSafePublicLabel(name)) continue;
    seen.add(id);
    result.push({
      id,
      name: name.slice(0, 48),
      sport: typeof entry.sport === "string" ? entry.sport : ALL,
      league: typeof entry.league === "string" ? entry.league : ALL,
      onlyPositiveEdge: entry.onlyPositiveEdge === true,
      band: typeof entry.band === "string" ? entry.band : ALL,
    });
    if (result.length >= 6) break;
  }
  return result;
}

function parseHomeSportFilter(raw: string): SportFilter {
  switch (raw) {
    case "futbol":
    case "selecciones":
    case "nfl":
    case "nba":
    case "nhl":
    case "mlb":
      return raw;
    default:
      return ALL;
  }
}

function parseHomeLeagueFilter(raw: string): LeagueFilter {
  const parsed = LeagueIdSchema.safeParse(raw);
  return parsed.success ? parsed.data : ALL;
}

function signalFilterForPinnedView(view: HomePinnedViewItem): ModelSignalFilter {
  return view.onlyPositiveEdge ? "value" : view.band === "alta" ? "high_confidence" : "all";
}

function subscribeUrlSearch(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("popstate", onStoreChange);
  return () => window.removeEventListener("popstate", onStoreChange);
}

function getUrlMatchSnapshot(): string | null {
  if (typeof window === "undefined") return null;
  const match = new URLSearchParams(window.location.search).get("match");
  return match && match.trim().length > 0 ? match.trim() : null;
}

function getServerUrlMatchSnapshot(): string | null {
  return null;
}

function syncMatchQueryParam(gameId: string): void {
  if (typeof window === "undefined" || typeof window.history?.replaceState !== "function") {
    return;
  }
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("match", gameId);
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(window.history.state, "", nextUrl);
  } catch (err) {
    void err;
  }
}

export function HomeClubView({
  initialDay,
  initialToday,
  initialSport = ALL,
  initialLeague = ALL,
  liveBoardOverride,
}: HomeClubViewProps = {}): React.JSX.Element {
  const {
    dataset,
    viewerRole,
    userTimezone,
    favoriteLeagues,
    hasAccountSessionAuth,
  } = usePlatformCore();
  const journal = useJournalEntries();
  const watchlistGameIds = useWatchlistGameIds();
  const { parlaySummary } = useParlayState();
  const { topics, toggleLeague: toggleTopicLeague } = useFollowedTopics();
  const {
    navigateTo,
    setFavoriteLeagues,
    requestFullShell,
    setAuraFromGame,
    toggleWatchlistGame,
    addPickToParlay,
    removePickFromParlay,
    sealPickToJournal,
  } = usePlatformActions();
  const homeNav = useHomeNavFilter();
  const { setTodayOverride } = homeNav;
  const games = dataset.games;
  const isDesktop = useMediaQuery("(min-width: 1024px)", false);
  const urlMatchId = useSyncExternalStore(
    subscribeUrlSearch,
    getUrlMatchSnapshot,
    getServerUrlMatchSnapshot,
  );

  const today = useMemo(
    () => initialToday ?? todayId(userTimezone || "America/Mexico_City"),
    [initialToday, userTimezone],
  );

  useSafeEffect(() => {
    setTodayOverride(initialToday ?? null);
    return () => setTodayOverride(null);
  }, [initialToday, setTodayOverride]);

  const { data: prefsPayload } = useAbortableJson<PreferencesSavedViewsPayload>(
    "/api/me/preferences",
    { enabled: hasAccountSessionAuth && viewerRole !== "visitor" },
  );
  const [localPinnedViews] = useLocalStorageState<readonly HomePinnedViewItem[]>(
    SAVED_SCREENER_VIEWS_STORAGE_KEY,
    EMPTY_PINNED_VIEWS,
    parsePinnedViewsArray,
  );
  const pinnedViews = useMemo<readonly HomePinnedViewItem[]>(() => {
    if (Array.isArray(prefsPayload?.preferences?.savedViews)) {
      return parsePinnedViewsArray(prefsPayload.preferences.savedViews) ?? EMPTY_PINNED_VIEWS;
    }
    return localPinnedViews;
  }, [localPinnedViews, prefsPayload?.preferences?.savedViews]);

  const chosenDay = homeNav.chosenDay ?? initialDay ?? null;
  const sport = homeNav.hasExplicitSport ? homeNav.sport : initialSport;
  const league = homeNav.hasExplicitSport || homeNav.league !== ALL ? homeNav.league : initialLeague;
  const setDay = homeNav.setChosenDay;
  const setLeague = homeNav.setLeague;

  const [boardView, setBoardView] = useState<HomeBoardView>("all");
  const [statusFilter, setStatusFilter] = useState<MatchStatusFilter>("all");
  const [signalFilter, setSignalFilter] = useState<ModelSignalFilter>("all");
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [selectedLeagues, setSelectedLeagues] = useState<LeagueId[]>([]);
  const [showOdds, setShowOdds] = useState<boolean>(false);
  const [filtersOpen, setFiltersOpen] = useState<boolean>(false);
  const [activePinnedViewId, setActivePinnedViewId] = useState<string | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [rightMode, setRightMode] = useState<"match" | "parlay">("match");
  const desktopPaneRef = useRef<HTMLElement | null>(null);

  const favoriteLeagueSet = useMemo(() => {
    const s = new Set<string>(favoriteLeagues);
    for (const lg of topics.leagues) s.add(lg);
    return s;
  }, [favoriteLeagues, topics.leagues]);

  const favoriteTeamSet = useMemo(() => new Set<string>(topics.teams), [topics.teams]);
  const watchlistSet = useMemo(() => new Set<string>(watchlistGameIds), [watchlistGameIds]);
  const parlayLegsCount = parlaySummary.legs.length;
  const parlayPickIds = useMemo(
    () => new Set<string>(parlaySummary.legs.map((leg) => leg.pick.id)),
    [parlaySummary.legs],
  );

  const teamFormLookup = useMemo<ReadonlyMap<string, readonly string[]>>(() => {
    const map = new Map<string, readonly string[]>();
    for (const leagueSummary of dataset.leagues) {
      for (const row of leagueSummary.standings) {
        if (!row.form || row.form.length === 0) continue;
        const slug = cleanTeamRouteSlug(row.teamId);
        if (slug) {
          map.set(`${leagueSummary.league}::${slug.toLowerCase()}`, row.form);
        }
        if (row.code) {
          map.set(`${leagueSummary.league}::${row.code.toLowerCase()}`, row.form);
        }
        if (row.shortName) {
          map.set(`${leagueSummary.league}::${row.shortName.toLowerCase()}`, row.form);
        }
      }
    }
    return map;
  }, [dataset.leagues]);

  const onToggleFavoriteLeague = useCallback(
    (lg: LeagueId) => {
      const inFavs = favoriteLeagues.includes(lg);
      const inTopics = topics.leagues.includes(lg);
      if (inFavs || inTopics) {
        if (inFavs && favoriteLeagues.length > 1) {
          setFavoriteLeagues(favoriteLeagues.filter((item) => item !== lg));
        }
        if (inTopics) {
          toggleTopicLeague(lg);
        }
      } else {
        setFavoriteLeagues([...favoriteLeagues, lg]);
      }
    },
    [favoriteLeagues, setFavoriteLeagues, toggleTopicLeague, topics.leagues],
  );

  const liveSnap = useLiveScoreboard(liveBoardOverride === undefined);
  const liveBoard = liveBoardOverride !== undefined ? liveBoardOverride : liveSnap.data;
  const liveByGameId = useMemo(() => {
    const map = new Map<string, LiveScoreboardEntry>();
    if (liveBoard) {
      for (const entry of liveBoard.entries) {
        map.set(entry.gameId, entry);
      }
    }
    return map;
  }, [liveBoard]);

  const day = useMemo<string>(() => {
    const resolved = resolveHomeDay(games, chosenDay, today);
    if (chosenDay !== null) {
      return resolved;
    }
    if (gamesForSelection(games, resolved, today).length > 0) {
      return resolved;
    }
    const futureDays = [...new Set(games.map((g) => g.dayId))]
      .filter((dayKey) => dayKey > today)
      .sort();
    if (futureDays.length > 0) {
      return futureDays[0]!;
    }
    const pastDays = [...new Set(games.map((g) => g.dayId))]
      .filter((dayKey) => dayKey < today)
      .sort();
    return pastDays[pastDays.length - 1] ?? resolved;
  }, [chosenDay, games, today]);
  const isPast = day < today;

  const dayOptions = useMemo(
    () => buildDayOptions(games, today).filter((opt) => !opt.isUpcoming),
    [games, today],
  );
  const prevDayOption = useMemo(
    () => [...dayOptions].reverse().find((opt) => opt.key < day) ?? null,
    [dayOptions, day],
  );
  const nextDayOption = useMemo(
    () => dayOptions.find((opt) => opt.key > day) ?? null,
    [dayOptions, day],
  );

  const dayGames = useMemo(() => gamesForSelection(games, day, today), [games, day, today]);
  const visible = useMemo(() => filterGames(dayGames, sport, league), [dayGames, sport, league]);

  const isUnlocked = useCallback(
    (pick: MatchPick, game: PlatformGame) => isPickUnlocked(pick, game.status, viewerRole),
    [viewerRole],
  );
  const top = useMemo(() => topPrincipalPicks(visible, 4, isUnlocked), [visible, isUnlocked]);
  const value = useMemo(() => valuePicks(visible, isUnlocked), [visible, isUnlocked]);

  const liveVisibleCount = useMemo(() => {
    let count = 0;
    for (const g of visible) {
      if (isEffectiveLiveGame(g, today, liveByGameId.get(g.id))) {
        count += 1;
      }
    }
    return count;
  }, [visible, liveByGameId, today]);

  const countryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of visible) {
      const reg = leagueRegionOf(g.league);
      counts.set(reg, (counts.get(reg) ?? 0) + 1);
    }
    const seen = new Set<string>();
    const list: Array<{ name: string; count: number }> = [];
    for (const [name, count] of counts.entries()) {
      seen.add(name);
      list.push({ name, count });
    }
    list.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es"));
    for (const known of ALL_KNOWN_COUNTRIES) {
      if (!seen.has(known)) {
        list.push({ name: known, count: 0 });
      }
    }
    return list;
  }, [visible]);

  const modalLeagueOptions = useMemo<readonly HomeFilterModalOptionLeague[]>(() => {
    const map = new Map<LeagueId, HomeFilterModalOptionLeague>();
    for (const g of visible) {
      const prev = map.get(g.league);
      if (prev) {
        map.set(g.league, { ...prev, count: prev.count + 1 });
      } else {
        map.set(g.league, {
          id: g.league,
          label: g.leagueLabel,
          region: leagueRegionOf(g.league),
          logoUrl: g.leagueLogoUrl,
          count: 1,
        });
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es"));
  }, [visible]);

  const activeModalFilterCount =
    (statusFilter !== "all" ? 1 : 0) +
    (signalFilter !== "all" ? 1 : 0) +
    selectedCountries.length +
    selectedLeagues.length;

  const resetModalFilters = useCallback(() => {
    setStatusFilter("all");
    setSignalFilter("all");
    setSelectedCountries([]);
    setSelectedLeagues([]);
    setActivePinnedViewId(null);
  }, []);

  const matchesPinnedView = useCallback(
    (view: HomePinnedViewItem): boolean =>
      sport === parseHomeSportFilter(view.sport) &&
      league === parseHomeLeagueFilter(view.league) &&
      signalFilter === signalFilterForPinnedView(view) &&
      statusFilter === "all" &&
      selectedCountries.length === 0 &&
      selectedLeagues.length === 0,
    [league, selectedCountries.length, selectedLeagues.length, signalFilter, sport, statusFilter],
  );

  const effectiveActivePinnedViewId = useMemo<string | null>(() => {
    if (!activePinnedViewId) return null;
    const selected = pinnedViews.find((item) => item.id === activePinnedViewId);
    return selected && matchesPinnedView(selected) ? selected.id : null;
  }, [activePinnedViewId, matchesPinnedView, pinnedViews]);

  const applyPinnedView = useCallback(
    (view: HomePinnedViewItem) => {
      void requestFullShell();
      if (effectiveActivePinnedViewId === view.id) {
        setActivePinnedViewId(null);
        homeNav.pickSport(ALL);
        setLeague(ALL);
        setSignalFilter("all");
        return;
      }
      setActivePinnedViewId(view.id);
      homeNav.pickSport(parseHomeSportFilter(view.sport));
      setLeague(parseHomeLeagueFilter(view.league));
      setSignalFilter(signalFilterForPinnedView(view));
      setStatusFilter("all");
      setSelectedCountries([]);
      setSelectedLeagues([]);
    },
    [effectiveActivePinnedViewId, homeNav, requestFullShell, setLeague],
  );

  const statusFilteredGames = useMemo(() => {
    let list = visible;

    if (boardView === "favorites") {
      list = list.filter(
        (g) =>
          watchlistSet.has(g.id) ||
          favoriteLeagueSet.has(g.league) ||
          favoriteTeamSet.has(teamTopicKey(g.league, g.home.slug)) ||
          favoriteTeamSet.has(teamTopicKey(g.league, g.away.slug)) ||
          (g.picks[0]?.edgePts ?? 0) >= 2.0,
      );
    }

    if (selectedCountries.length > 0) {
      const cSet = new Set(selectedCountries);
      list = list.filter((g) => cSet.has(leagueRegionOf(g.league)));
    }

    if (selectedLeagues.length > 0) {
      const lSet = new Set(selectedLeagues);
      list = list.filter((g) => lSet.has(g.league));
    }

    if (statusFilter !== "all") {
      list = list.filter((g) => {
        const entry = liveByGameId.get(g.id);
        const isLive = isEffectiveLiveGame(g, today, entry);
        const isFt = !isLive && (g.status === "FT" || entry?.phase === "final" || g.dayId < today);
        if (statusFilter === "live") return isLive;
        if (statusFilter === "finished") return isFt;
        return !isLive && !isFt;
      });
    }

    if (signalFilter === "high_confidence") {
      list = list
        .filter((g) => (g.picks[0]?.p ?? 0) >= 0.58)
        .slice()
        .sort((a, b) => (b.picks[0]?.p ?? 0) - (a.picks[0]?.p ?? 0));
    } else if (signalFilter === "value") {
      list = list.filter((g) => (g.picks[0]?.edgePts ?? 0) > 0);
    }

    return list;
  }, [
    visible,
    boardView,
    watchlistSet,
    favoriteLeagueSet,
    favoriteTeamSet,
    selectedCountries,
    selectedLeagues,
    statusFilter,
    signalFilter,
    liveByGameId,
    today,
  ]);

  const dayGroups = useMemo(
    () => groupMatchesByDayAndLeague(statusFilteredGames),
    [statusFilteredGames],
  );

  const showRecommendedAccordion =
    boardView === "all" &&
    league === ALL &&
    statusFilter === "all" &&
    activeModalFilterCount === 0 &&
    statusFilteredGames.length >= 5;

  const recommendedGames = useMemo<readonly PlatformGame[]>(() => {
    if (!showRecommendedAccordion) return [];
    const ranked = statusFilteredGames
      .filter((g) => {
        const cap = getLeagueCapability(g.league);
        return !cap || isLeagueHealthyForUi(g.league, { hasValidSnapshot: true, gamesCount: 1 });
      })
      .slice()
      .sort((a, b) => {
        const aLive = isEffectiveLiveGame(a, today, liveByGameId.get(a.id));
        const bLive = isEffectiveLiveGame(b, today, liveByGameId.get(b.id));
        if (aLive !== bLive) return aLive ? -1 : 1;
        const aScore =
          competitionPrestigeScore(a.league) +
          (a.picks[0]?.edgePts && a.picks[0].edgePts > 0 ? 35 : 0) +
          (a.picks[0]?.p ?? 0) * 40 +
          (watchlistSet.has(a.id) ? 50 : 0);
        const bScore =
          competitionPrestigeScore(b.league) +
          (b.picks[0]?.edgePts && b.picks[0].edgePts > 0 ? 35 : 0) +
          (b.picks[0]?.p ?? 0) * 40 +
          (watchlistSet.has(b.id) ? 50 : 0);
        if (bScore !== aScore) return bScore - aScore;
        return a.kickoffUtc.localeCompare(b.kickoffUtc) || a.id.localeCompare(b.id);
      });
    return ranked.slice(0, 3);
  }, [liveByGameId, showRecommendedAccordion, statusFilteredGames, today, watchlistSet]);

  const orderedDisplayGames = useMemo<readonly PlatformGame[]>(() => {
    const out: PlatformGame[] = [];
    const seen = new Set<string>();
    for (const g of recommendedGames) {
      if (!seen.has(g.id)) {
        seen.add(g.id);
        out.push(g);
      }
    }
    for (const dg of dayGroups) {
      for (const lg of dg.leagues) {
        const cap = getLeagueCapability(lg.league);
        if (cap && !isLeagueHealthyForUi(lg.league, { hasValidSnapshot: true, gamesCount: lg.count })) {
          continue;
        }
        for (const g of lg.games) {
          if (!seen.has(g.id)) {
            seen.add(g.id);
            out.push(g);
          }
        }
      }
    }
    return out;
  }, [dayGroups, recommendedGames]);

  const selectedGame = useMemo<PlatformGame | null>(() => {
    const requestedId = selectedMatchId ?? urlMatchId;
    if (requestedId) {
      const inFiltered = orderedDisplayGames.find((g) => g.id === requestedId);
      if (inFiltered) return inFiltered;
      const inVisible = visible.find((g) => g.id === requestedId);
      if (inVisible) return inVisible;
      if (
        selectedMatchId === null &&
        sport === ALL &&
        league === ALL &&
        statusFilter === "all" &&
        boardView === "all"
      ) {
        const inAll = games.find((g) => g.id === requestedId);
        if (inAll) return inAll;
      }
    }
    const firstLive = orderedDisplayGames.find((g) =>
      isEffectiveLiveGame(g, today, liveByGameId.get(g.id)),
    );
    return firstLive ?? orderedDisplayGames[0] ?? null;
  }, [
    boardView,
    games,
    league,
    liveByGameId,
    orderedDisplayGames,
    selectedMatchId,
    sport,
    statusFilter,
    today,
    urlMatchId,
    visible,
  ]);

  const effectiveRightMode: "match" | "parlay" =
    rightMode === "match" && selectedGame !== null ? "match" : "parlay";

  const handleSelectDesktopGame = useCallback(
    (game: PlatformGame) => {
      setSelectedMatchId(game.id);
      setRightMode("match");
      setAuraFromGame(game);
      syncMatchQueryParam(game.id);
      if (desktopPaneRef.current) {
        desktopPaneRef.current.scrollTop = 0;
      }
    },
    [setAuraFromGame],
  );

  const handleOpenParlay = useCallback(() => {
    if (isDesktop) {
      setRightMode((prev) => (prev === "parlay" && selectedGame !== null ? "match" : "parlay"));
      if (desktopPaneRef.current) {
        desktopPaneRef.current.scrollTop = 0;
      }
      return;
    }
    if (typeof document !== "undefined") {
      const el = document.querySelector<HTMLElement>("[data-home-mobile-parlay]");
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [isDesktop, selectedGame]);

  const handleToggleParlayPick = useCallback(
    (pick: MatchPick) => {
      if (parlayPickIds.has(pick.id)) {
        removePickFromParlay(pick.id);
      } else {
        addPickToParlay(pick);
      }
    },
    [addPickToParlay, parlayPickIds, removePickFromParlay],
  );

  const handleSealPick = useCallback(
    (pick: MatchPick) => {
      sealPickToJournal(pick, 1, pick.marketDecimal ?? pick.fairDecimal);
    },
    [sealPickToJournal],
  );

  const trendGames = useMemo(() => {
    const liveIds = new Set<string>();
    for (const g of games) {
      if (isEffectiveLiveGame(g, today, liveByGameId.get(g.id))) {
        liveIds.add(g.id);
      }
    }
    return getTrendingMatches({
      games,
      sport,
      league,
      today,
      liveIds,
      maxItems: 12,
    });
  }, [games, sport, league, today, liveByGameId]);

  const orderedChips = useMemo(() => {
    return trendGames.map((game) => {
      const entry = liveByGameId.get(game.id);
      const live = isEffectiveLiveGame(game, today, entry);
      const score = entry?.score ?? game.score ?? null;
      return { game, live, score, entry };
    });
  }, [trendGames, liveByGameId, today]);

  const emptyJumpTarget = useMemo<{ dayId: string; resetFilters: boolean } | null>(() => {
    if (orderedChips.length > 0) return null;
    const futureFiltered = dayOptions.find(
      (opt) => opt.key > day && filterGames(gamesForSelection(games, opt.key, today), sport, league).length > 0,
    );
    if (futureFiltered) return { dayId: futureFiltered.key, resetFilters: false };
    const anyFiltered = [...dayOptions]
      .reverse()
      .find(
        (opt) => opt.key !== day && filterGames(gamesForSelection(games, opt.key, today), sport, league).length > 0,
      );
    if (anyFiltered) return { dayId: anyFiltered.key, resetFilters: false };
    const futureAny = dayOptions.find((opt) => opt.key > day && opt.count > 0);
    if (futureAny) return { dayId: futureAny.key, resetFilters: true };
    const anyDay = [...dayOptions].reverse().find((opt) => opt.key !== day && opt.count > 0);
    return anyDay ? { dayId: anyDay.key, resetFilters: true } : null;
  }, [orderedChips.length, dayOptions, day, games, today, sport, league]);

  const calendarEventDays = useMemo<CalendarEventDaysSummary>(() => {
    const countsByDay = new Map<
      string,
      { total: number; live: number; upcoming: number; finished: number; fav: number; leagues: Set<string> }
    >();
    const scopedGames = filterGames(games, sport, league);
    let anyLive = false;
    for (const g of scopedGames) {
      const entry = liveByGameId.get(g.id);
      const isLive = isEffectiveLiveGame(g, today, entry);
      const isFinished = g.status === "FT" || g.dayId < today;
      const isFav =
        watchlistSet.has(g.id) ||
        favoriteLeagueSet.has(g.league) ||
        favoriteTeamSet.has(teamTopicKey(g.league, g.home.slug)) ||
        favoriteTeamSet.has(teamTopicKey(g.league, g.away.slug));
      if (boardView === "favorites" && !isFav) continue;
      const cur = countsByDay.get(g.dayId) ?? {
        total: 0,
        live: 0,
        upcoming: 0,
        finished: 0,
        fav: 0,
        leagues: new Set<string>(),
      };
      cur.total += 1;
      if (isLive) {
        cur.live += 1;
        anyLive = true;
      } else if (isFinished) {
        cur.finished += 1;
      } else {
        cur.upcoming += 1;
      }
      if (isFav) cur.fav += 1;
      cur.leagues.add(g.leagueLabel);
      countsByDay.set(g.dayId, cur);
    }

    const horizon30 = addDays(today, 30);
    const sortedDays = [...countsByDay.keys()].sort();
    const nearFuture = sortedDays.filter((d) => d > day && d <= horizon30);
    const nextActionDay =
      nearFuture[0] ??
      sortedDays.find((d) => d >= today && d <= horizon30 && d !== day) ??
      sortedDays.find((d) => d > day) ??
      sortedDays.find((d) => d !== day) ??
      null;
    const selectedStats = countsByDay.get(day) ?? null;

    return {
      countsByDay,
      anyLive,
      nextActionDay,
      selectedStats,
      legendLabel: boardView === "favorites" ? "Días con tus favoritos" : "Días con partidos",
    };
  }, [boardView, day, favoriteLeagueSet, favoriteTeamSet, games, league, liveByGameId, sport, today, watchlistSet]);

  const pickDay = useCallback(
    (d: DaySelection) => {
      void requestFullShell();
      setDay(d);
      setLeague(
        league !== ALL && gamesForSelection(games, d, today).some((g) => g.league === league) ? league : ALL,
      );
    },
    [games, league, requestFullShell, setDay, setLeague, today],
  );

  const jumpDay = useCallback(
    (targetDay: string, resetFilters: boolean) => {
      void requestFullShell();
      if (resetFilters) {
        homeNav.resetFilters(targetDay);
        return;
      }
      setDay(targetDay);
      setLeague(
        league !== ALL && gamesForSelection(games, targetDay, today).some((g) => g.league === league)
          ? league
          : ALL,
      );
    },
    [games, homeNav, league, requestFullShell, setDay, setLeague, today],
  );

  const handleRequestFullShell = useCallback(() => {
    void requestFullShell();
  }, [requestFullShell]);

  const handleOpenFilters = useCallback(() => {
    void loadHomeFiltersModal();
    setFiltersOpen(true);
  }, []);

  const handleCloseFilters = useCallback(() => {
    setFiltersOpen(false);
  }, []);

  const handleApplyFilters = useCallback(
    ({
      status,
      signal,
      countries,
      leagues,
    }: {
      status: MatchStatusFilter;
      signal: ModelSignalFilter;
      countries: string[];
      leagues: LeagueId[];
    }) => {
      setStatusFilter(status);
      setSignalFilter(signal);
      setSelectedCountries(countries);
      setSelectedLeagues(leagues);
      setActivePinnedViewId(null);
    },
    [],
  );

  const selectedHomeForm = selectedGame
    ? (teamFormLookup.get(`${selectedGame.league}::${selectedGame.home.slug.toLowerCase()}`) ??
      teamFormLookup.get(`${selectedGame.league}::${selectedGame.home.code.toLowerCase()}`) ??
      null)
    : null;
  const selectedAwayForm = selectedGame
    ? (teamFormLookup.get(`${selectedGame.league}::${selectedGame.away.slug.toLowerCase()}`) ??
      teamFormLookup.get(`${selectedGame.league}::${selectedGame.away.code.toLowerCase()}`) ??
      null)
    : null;

  return (
    <AtmosphereStage activePath="/app">
      <ClubWorkspaceShell
        activePath="/app"
        initialHomeDay={initialDay ?? day}
        initialHomeToday={initialToday}
        initialHomeSport={initialSport}
        initialHomeLeague={initialLeague}
      >
        <LivePicksTrackerStrip journal={journal} games={games} onNavigate={navigateTo} />

        <HomeTrendingStrip
          orderedChips={orderedChips}
          day={day}
          today={today}
          sport={sport}
          league={league}
          emptyJumpTarget={emptyJumpTarget}
          onPickDay={pickDay}
          onJumpDay={jumpDay}
          onSelectMatch={handleSelectDesktopGame}
        />

        <div
          className="pl-astro-workspace pl-home-md-workspace !mt-3.5"
          data-home-master-detail=""
        >
          <div className="pl-astro-center pl-home-md-master" data-home-master-list="">
            <h1 className="sr-only">Partidos</h1>

            <HomeBoardBar
              boardView={boardView}
              onBoardViewChange={setBoardView}
              day={day}
              today={today}
              prevDayOption={prevDayOption}
              nextDayOption={nextDayOption}
              onPickDay={pickDay}
              calendarEventDays={calendarEventDays}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              liveVisibleCount={liveVisibleCount}
              activeModalFilterCount={activeModalFilterCount}
              filtersOpen={filtersOpen}
              onOpenFilters={handleOpenFilters}
              showOdds={showOdds}
              onShowOddsChange={setShowOdds}
              onRequestFullShell={handleRequestFullShell}
              parlayCount={parlayLegsCount}
              parlayActive={isDesktop && effectiveRightMode === "parlay"}
              onOpenParlay={handleOpenParlay}
            />

            {pinnedViews.length > 0 ? (
              <nav
                aria-label="Vistas fijadas"
                className="pl-home-pinned-bar"
                data-home-pinned-views=""
              >
                <span className="pl-home-pinned-label">Fijadas</span>
                <div className="pl-home-pinned-list">
                  {pinnedViews.map((view) => {
                    const isActive = effectiveActivePinnedViewId === view.id;
                    return (
                      <button
                        key={view.id}
                        type="button"
                        className={`pl-home-pinned-chip ${isActive ? "is-active" : ""}`.trim()}
                        aria-pressed={isActive}
                        data-pinned-view-id={view.id}
                        onClick={() => applyPinnedView(view)}
                      >
                        <span>{view.name}</span>
                      </button>
                    );
                  })}
                </div>
                <a
                  href="/app/picks"
                  onClick={(e) => {
                    e.preventDefault();
                    navigateTo("/app/picks");
                  }}
                  className="pl-home-pinned-link"
                >
                  Picks
                </a>
              </nav>
            ) : null}

            <HomeMatchCardsSection
              groups={dayGroups}
              today={today}
              liveByGameId={liveByGameId}
              showOdds={showOdds}
              boardView={boardView}
              favoriteLeagueSet={favoriteLeagueSet}
              onToggleFavoriteLeague={onToggleFavoriteLeague}
              onResetFilters={resetModalFilters}
              hasActiveFilters={activeModalFilterCount > 0}
              resetKey={`${day}|${sport}|${league}|${boardView}|${statusFilter}|${signalFilter}`}
              selectedGameId={isDesktop ? (selectedGame?.id ?? null) : null}
              onSelectGame={handleSelectDesktopGame}
              teamFormLookup={teamFormLookup}
              watchlistSet={watchlistSet}
              onToggleWatchlist={toggleWatchlistGame}
              recommendedGames={recommendedGames}
              showRecommendedAccordion={showRecommendedAccordion}
            />

            {filtersOpen ? (
              <Suspense fallback={null}>
                <LazyHomeFiltersModal
                  open={filtersOpen}
                  onClose={handleCloseFilters}
                  statusFilter={statusFilter}
                  signalFilter={signalFilter}
                  selectedCountries={selectedCountries}
                  selectedLeagues={selectedLeagues}
                  countryOptions={countryOptions}
                  leagueOptions={modalLeagueOptions}
                  onApply={handleApplyFilters}
                />
              </Suspense>
            ) : null}
          </div>

          <aside
            ref={desktopPaneRef}
            aria-label="Detalle del partido y centro de parlays"
            className="pl-home-md-detail-pane"
            data-home-detail-pane=""
          >
            {isDesktop ? (
              <>
                <div
                  className="pl-home-md-mode-bar"
                  role="tablist"
                  aria-label="Cambiar panel derecho"
                  {...({ focusgroup: "tablist nomemory" } as React.HTMLAttributes<HTMLDivElement>)}
                >
                  <button
                    type="button"
                    role="tab"
                    id="home-right-mode-match"
                    aria-selected={effectiveRightMode === "match"}
                    tabIndex={effectiveRightMode === "match" ? 0 : -1}
                    disabled={!selectedGame}
                    data-home-right-mode="match"
                    className={`pl-home-md-mode-btn ${effectiveRightMode === "match" ? "is-active" : ""}`.trim()}
                    onClick={() => setRightMode("match")}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowRight" || e.key === "End") {
                        e.preventDefault();
                        setRightMode("parlay");
                        document.getElementById("home-right-mode-parlay")?.focus();
                      }
                    }}
                    {...(effectiveRightMode === "match"
                      ? ({ focusgroupstart: "" } as React.ButtonHTMLAttributes<HTMLButtonElement>)
                      : {})}
                  >
                    <MaestroIcon name="activity" size={14} />
                    <span>Partido seleccionado</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    id="home-right-mode-parlay"
                    aria-selected={effectiveRightMode === "parlay"}
                    tabIndex={effectiveRightMode === "parlay" ? 0 : -1}
                    data-home-right-mode="parlay"
                    className={`pl-home-md-mode-btn ${effectiveRightMode === "parlay" ? "is-active" : ""}`.trim()}
                    onClick={() => setRightMode("parlay")}
                    onKeyDown={(e) => {
                      if ((e.key === "ArrowLeft" || e.key === "Home") && selectedGame) {
                        e.preventDefault();
                        setRightMode("match");
                        document.getElementById("home-right-mode-match")?.focus();
                      }
                    }}
                    {...(effectiveRightMode === "parlay"
                      ? ({ focusgroupstart: "" } as React.ButtonHTMLAttributes<HTMLButtonElement>)
                      : {})}
                  >
                    <MaestroIcon name="ticket" size={14} />
                    <span>Tu parlay / Parlay del día</span>
                    {parlayLegsCount > 0 ? (
                      <span className="pl-home-md-mode-badge num">{parlayLegsCount}</span>
                    ) : null}
                  </button>
                </div>

                <div className="pl-home-md-panels-stack">
                  {selectedGame ? (
                    <div
                      role="tabpanel"
                      aria-labelledby="home-right-mode-match"
                      hidden={effectiveRightMode !== "match"}
                      className="pl-home-md-mode-panel"
                    >
                      {effectiveRightMode === "match" ? (
                        <div className="pl-home-md-mode-panel-inner">
                          <Suspense fallback={<HomeMatchDetailFallback />}>
                            <LazyHomeMatchDetailPanel
                              game={selectedGame}
                              liveEntry={liveByGameId.get(selectedGame.id)}
                              isWatched={watchlistSet.has(selectedGame.id)}
                              onToggleWatchlist={toggleWatchlistGame}
                              parlayPickIds={parlayPickIds}
                              onToggleParlay={handleToggleParlayPick}
                              onSealPick={handleSealPick}
                              homeFormFallback={selectedHomeForm}
                              awayFormFallback={selectedAwayForm}
                            />
                          </Suspense>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div
                    role="tabpanel"
                    aria-labelledby="home-right-mode-parlay"
                    hidden={effectiveRightMode !== "parlay"}
                    className="pl-home-md-mode-panel"
                  >
                    {effectiveRightMode === "parlay" ? (
                      <div className="pl-home-md-mode-panel-inner">
                        <HomeRightRail
                          visibleGames={visible}
                          allGames={dataset.games}
                          selectedDay={day}
                          today={today}
                          isPastDay={isPast}
                          activeLeague={league === ALL ? null : league}
                          topPicks={top}
                          valuePicks={value}
                          embedded
                          onSelectGame={handleSelectDesktopGame}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              </>
            ) : null}
          </aside>

          {!isDesktop ? (
            <div className="pl-home-md-mobile-rail" data-home-mobile-parlay="">
              <HomeRightRail
                visibleGames={visible}
                allGames={dataset.games}
                selectedDay={day}
                today={today}
                isPastDay={isPast}
                activeLeague={league === ALL ? null : league}
                topPicks={top}
                valuePicks={value}
              />
            </div>
          ) : null}
        </div>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}

export const JornadaClubView = HomeClubView;
