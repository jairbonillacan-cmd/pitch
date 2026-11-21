"use client";

import React, { useCallback, useMemo, useState } from "react";
import {
  isLivePhaseActive,
  isSafePublicLabel,
  LeagueIdSchema,
  SportIdSchema,
  type LeagueId,
  type LiveScoreboard,
  type LiveScoreboardEntry,
} from "@pitchlab/contracts";
import { isPickUnlocked } from "../../access-guard";
import { LivePicksTrackerStrip } from "../../components/LivePicksTrackerStrip";
import { AtmosphereStage, ClubWorkspaceShell } from "../../components/ShellChrome";
import { useAbortableJson, useLocalStorageState, useSafeEffect } from "../../hooks";
import { useLiveScoreboard } from "../../live/live-store";
import {
  useHomeNavFilter,
  useJournalEntries,
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
import { HomeFiltersModal } from "./HomeFiltersModal";
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
  leagueRegionOf,
  type HomeBoardView,
  type HomeFilterModalOptionLeague,
  type MatchStatusFilter,
  type ModelSignalFilter,
} from "./home-view-helpers";

export {
  AstroMatchRow,
  HomeBoardBar,
  HomeFilterHeader,
  HomeFiltersModal,
  HomeParlayHubCard,
  HomeRightRail,
  HomeTrendingStrip,
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
    savedScreenerViews,
  } = usePlatformCore();
  const journal = useJournalEntries();
  const watchlistGameIds = useWatchlistGameIds();
  const { topics, toggleLeague: toggleTopicLeague } = useFollowedTopics();
  const { navigateTo, setFavoriteLeagues, requestFullShell } = usePlatformActions();
  const homeNav = useHomeNavFilter();
  const { setTodayOverride } = homeNav;
  const games = dataset.games;

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
    const serverList = parsePinnedViewsArray(prefsPayload?.preferences?.savedViews) ?? EMPTY_PINNED_VIEWS;
    const contextList = parsePinnedViewsArray(savedScreenerViews) ?? EMPTY_PINNED_VIEWS;
    const merged: HomePinnedViewItem[] = [];
    const seen = new Set<string>();
    for (const source of [serverList, localPinnedViews, contextList]) {
      for (const item of source) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        merged.push(item);
        if (merged.length >= 6) return merged;
      }
    }
    return merged;
  }, [localPinnedViews, prefsPayload?.preferences?.savedViews, savedScreenerViews]);

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

  const favoriteLeagueSet = useMemo(() => {
    const s = new Set<string>(favoriteLeagues);
    for (const lg of topics.leagues) s.add(lg);
    return s;
  }, [favoriteLeagues, topics.leagues]);

  const favoriteTeamSet = useMemo(() => new Set<string>(topics.teams), [topics.teams]);
  const watchlistSet = useMemo(() => new Set<string>(watchlistGameIds), [watchlistGameIds]);

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
      const entry = liveByGameId.get(g.id);
      if ((entry ? isLivePhaseActive(entry.phase) : false) || String(g.status) === "LIVE") {
        count += 1;
      }
    }
    return count;
  }, [visible, liveByGameId]);

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

  const applyPinnedView = useCallback(
    (view: HomePinnedViewItem) => {
      void requestFullShell();
      if (activePinnedViewId === view.id) {
        setActivePinnedViewId(null);
        homeNav.pickSport(ALL);
        setLeague(ALL);
        setSignalFilter("all");
        return;
      }
      setActivePinnedViewId(view.id);
      const parsedSport = SportIdSchema.safeParse(view.sport);
      const parsedLeague = LeagueIdSchema.safeParse(view.league);
      homeNav.pickSport(parsedSport.success ? parsedSport.data : ALL);
      setLeague(parsedLeague.success ? parsedLeague.data : ALL);
      setSignalFilter(
        view.onlyPositiveEdge ? "value" : view.band === "alta" ? "high_confidence" : "all",
      );
    },
    [activePinnedViewId, homeNav, requestFullShell, setLeague],
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
        const isLive = (entry ? isLivePhaseActive(entry.phase) : false) || String(g.status) === "LIVE";
        const isFt = !isLive && (g.status === "FT" || entry?.phase === "final");
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
  ]);

  const dayGroups = useMemo(
    () => groupMatchesByDayAndLeague(statusFilteredGames),
    [statusFilteredGames],
  );

  const trendGames = useMemo(() => {
    const liveIds = new Set<string>();
    for (const [gid, entry] of liveByGameId.entries()) {
      if (isLivePhaseActive(entry.phase)) liveIds.add(gid);
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
      const live = (entry ? isLivePhaseActive(entry.phase) : false) || String(game.status) === "LIVE";
      const score = entry?.score ?? game.score ?? null;
      return { game, live, score, entry };
    });
  }, [trendGames, liveByGameId]);

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
      const isLive = (entry ? isLivePhaseActive(entry.phase) : false) || String(g.status) === "LIVE";
      const isFinished = g.status === "FT";
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

  return (
    <AtmosphereStage activePath="/app">
      <ClubWorkspaceShell
        activePath="/app"
        initialHomeDay={initialDay}
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
        />

        <div className="pl-astro-workspace !mt-3.5">
          <div className="pl-astro-center">
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
              onOpenFilters={() => setFiltersOpen(true)}
              showOdds={showOdds}
              onShowOddsChange={setShowOdds}
              onRequestFullShell={handleRequestFullShell}
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
                    const isActive = activePinnedViewId === view.id;
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
            />

            <HomeFiltersModal
              open={filtersOpen}
              onClose={() => setFiltersOpen(false)}
              statusFilter={statusFilter}
              signalFilter={signalFilter}
              selectedCountries={selectedCountries}
              selectedLeagues={selectedLeagues}
              countryOptions={countryOptions}
              leagueOptions={modalLeagueOptions}
              onApply={({ status, signal, countries, leagues }) => {
                setStatusFilter(status);
                setSignalFilter(signal);
                setSelectedCountries(countries);
                setSelectedLeagues(leagues);
              }}
            />
          </div>

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
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}

export const JornadaClubView = HomeClubView;
