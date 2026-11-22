"use client";

import React, { useCallback, useId, useMemo, useRef, useState } from "react";
import {
  canonicalGameHref,
  type LiveScoreboardEntry,
} from "@pitchlab/contracts";
import { usePackIconBase } from "../../../pack-icon-theme";
import { LeagueBadge, TeamBadge } from "../../../sports";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import { useSafeEffect } from "../../hooks";
import { usePlatformActions, usePlatformCore } from "../../platform-provider";
import type { PlatformGame } from "../../types";
import {
  ALL,
  addDays,
  buildDayOptions,
  filterGames,
  gamesForSelection,
  leaguesIn,
  shortDateLabel,
  sportOf,
  type DayOption,
  type DaySelection,
  type LeagueFilter,
  type SportFilter,
} from "./home-model";
import { HomeSportStrip } from "./HomeSportStrip";
import {
  CAL_WEEKDAYS_ES,
  CAL_WEEKDAYS_FULL_ES,
  FULL_MONTHS_ES,
  buildCalendarMonthWeeks,
  clampIsoToMonth,
  dayNumOfIso,
  formatCenterDayParts,
  formatGameKickoffTime,
  formatJumpDayLabel,
  formatLiveChipPhase,
  formatMonthHeading,
  isEffectiveLiveGame,
  leagueLabelOf,
  leagueLogoOf,
  parseIsoYearMonth,
  scrollToMatchCard,
  teamCode,
  type HomeBoardView,
  type MatchStatusFilter,
} from "./home-view-helpers";

export function LiveSportBallIcon({
  sport,
}: {
  readonly sport: PlatformGame["sport"];
}): React.JSX.Element {
  const iconBase = usePackIconBase();
  const key =
    sport === "basketball"
      ? "basketball"
      : sport === "american-football"
        ? "american-football"
        : sport === "ice-hockey"
          ? "hockey"
          : sport === "baseball"
            ? "baseball"
            : "football";
  return (
    <img
      src={`${iconBase}/32/deportes/${key}.webp`}
      srcSet={`${iconBase}/32/deportes/${key}.webp 1x, ${iconBase}/64/deportes/${key}.webp 2x`}
      width={16}
      height={16}
      alt=""
      aria-hidden="true"
      decoding="async"
      draggable={false}
      className="pl-maestro-icon inline-block shrink-0"
    />
  );
}

interface MatchChipEntry {
  readonly game: PlatformGame;
  readonly live: boolean;
  readonly score: { home: number; away: number } | null;
  readonly entry?: LiveScoreboardEntry;
}

function MatchChipButton({
  item,
  userTimezone,
  onSelect,
  onPrefetch,
}: {
  readonly item: MatchChipEntry;
  readonly userTimezone?: string | null;
  readonly onSelect: (game: PlatformGame) => void;
  readonly onPrefetch?: (href: string) => void;
}): React.JSX.Element {
  const { game, live, score, entry } = item;
  const homeCode = teamCode(game.home);
  const awayCode = teamCode(game.away);
  const time = formatGameKickoffTime(game, userTimezone);
  const scoreText = score ? `${score.home} - ${score.away}` : null;
  const livePhaseLabel = formatLiveChipPhase(entry);
  const matchHref = canonicalGameHref(game.league, game);

  return (
    <button
      type="button"
      className={`pl-home-chip ${live ? "is-live" : ""}`.trim()}
      data-match-chip={game.id}
      data-chip-league={game.league}
      data-chip-live={live ? "true" : undefined}
      onPointerEnter={() => onPrefetch?.(matchHref)}
      onTouchStart={() => onPrefetch?.(matchHref)}
      onClick={() => onSelect(game)}
    >
      <span className="sr-only">
        {`${live ? `En vivo (${livePhaseLabel})` : time}: ${game.home.shortName} contra ${game.away.shortName}${scoreText ? `, ${scoreText}` : ""} · `}
      </span>
      {live ? (
        <>
          <span className="pl-home-live-sport" aria-hidden="true">
            <LiveSportBallIcon sport={game.sport} />
          </span>
          <span className="pl-home-live-tag">
            <span className="pl-home-live-dot" aria-hidden="true" />
            <span>{livePhaseLabel}</span>
          </span>
          <span className="pl-home-live-matchup">
            <TeamBadge
              league={game.league}
              slug={game.home.slug}
              name={game.home.name}
              logoUrl={game.home.logoUrl}
              size={20}
            />
            <span className="pl-home-chip-score is-live num">{scoreText ?? "0 - 0"}</span>
            <TeamBadge
              league={game.league}
              slug={game.away.slug}
              name={game.away.name}
              logoUrl={game.away.logoUrl}
              size={20}
            />
          </span>
        </>
      ) : (
        <>
          <span className="pl-home-chip-time num">
            {shortDateLabel(game.dayId)} · {time}
          </span>
          <span className="pl-home-chip-team">
            <TeamBadge
              league={game.league}
              slug={game.home.slug}
              name={game.home.name}
              logoUrl={game.home.logoUrl}
              size={18}
            />
            <span>{homeCode}</span>
          </span>
          <span className="pl-home-chip-vs" aria-hidden="true">
            –
          </span>
          <span className="pl-home-chip-team">
            <span>{awayCode}</span>
            <TeamBadge
              league={game.league}
              slug={game.away.slug}
              name={game.away.name}
              logoUrl={game.away.logoUrl}
              size={18}
            />
          </span>
        </>
      )}
    </button>
  );
}

function useHorizontalChipsScroll(depsKey: string) {
  const chipsRef = useRef<HTMLDivElement | null>(null);
  const [chipsScroll, setChipsScroll] = useState<{
    overflows: boolean;
    canLeft: boolean;
    canRight: boolean;
  }>({
    overflows: false,
    canLeft: false,
    canRight: false,
  });

  const syncChipsScroll = useCallback(() => {
    const el = chipsRef.current;
    if (!el) {
      setChipsScroll((prev) =>
        prev.overflows ? { overflows: false, canLeft: false, canRight: false } : prev,
      );
      return;
    }
    const maxScroll = el.scrollWidth - el.clientWidth;
    const overflows = maxScroll > 2;
    const canLeft = overflows && el.scrollLeft > 2;
    const canRight = overflows && el.scrollLeft < maxScroll - 2;
    setChipsScroll((prev) =>
      prev.overflows === overflows && prev.canLeft === canLeft && prev.canRight === canRight
        ? prev
        : { overflows, canLeft, canRight },
    );
  }, []);

  useSafeEffect(() => {
    const el = chipsRef.current;
    if (el) el.scrollLeft = 0;
  }, [depsKey]);

  useSafeEffect(() => {
    const el = chipsRef.current;
    const frame = typeof requestAnimationFrame === "function" ? requestAnimationFrame(syncChipsScroll) : 0;
    syncChipsScroll();
    if (!el || typeof ResizeObserver === "undefined") {
      if (typeof window !== "undefined") {
        window.addEventListener("resize", syncChipsScroll);
        return () => {
          if (frame) cancelAnimationFrame(frame);
          window.removeEventListener("resize", syncChipsScroll);
        };
      }
      return () => {
        if (frame) cancelAnimationFrame(frame);
      };
    }
    const observer = new ResizeObserver(() => syncChipsScroll());
    observer.observe(el);
    window.addEventListener("resize", syncChipsScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", syncChipsScroll);
    };
  }, [syncChipsScroll, depsKey]);

  const scrollChipsBy = useCallback((dir: -1 | 1) => {
    const el = chipsRef.current;
    if (!el) return;
    const step = Math.max(200, Math.round(el.clientWidth * 0.7));
    const reduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * step, behavior: reduced ? "auto" : "smooth" });
  }, []);

  return { chipsRef, chipsScroll, syncChipsScroll, scrollChipsBy };
}

export function HomeFilterHeader({
  allGames,
  dayGames,
  visibleGames,
  today,
  day,
  sport,
  league,
  liveByGameId,
  onDayChange,
  onSportChange,
  onLeagueChange,
  onJumpDay,
}: {
  readonly allGames: readonly PlatformGame[];
  readonly dayGames: readonly PlatformGame[];
  readonly visibleGames: readonly PlatformGame[];
  readonly today: string;
  readonly day: string;
  readonly sport: SportFilter;
  readonly league: LeagueFilter;
  readonly liveByGameId: ReadonlyMap<string, LiveScoreboardEntry>;
  readonly onDayChange: (nextDay: DaySelection) => void;
  readonly onSportChange: (nextSport: SportFilter) => void;
  readonly onLeagueChange: (nextLeague: LeagueFilter) => void;
  readonly onJumpDay: (targetDay: string, resetFilters: boolean) => void;
}): React.JSX.Element {
  const { userTimezone } = usePlatformCore();
  const dayOptions = useMemo(
    () => buildDayOptions(allGames, today).filter((opt) => !opt.isUpcoming),
    [allGames, today],
  );
  const prevDayOption = useMemo(
    () => [...dayOptions].reverse().find((opt) => opt.key < day) ?? null,
    [dayOptions, day],
  );
  const nextDayOption = useMemo(
    () => dayOptions.find((opt) => opt.key > day) ?? null,
    [dayOptions, day],
  );

  const sportGames = useMemo(
    () => (sport === ALL ? dayGames : dayGames.filter((g) => sportOf(g) === sport)),
    [dayGames, sport],
  );
  const leagues = useMemo(() => leaguesIn(sportGames), [sportGames]);

  const orderedChips = useMemo<MatchChipEntry[]>(() => {
    return visibleGames
      .map((game) => {
        const entry = liveByGameId.get(game.id);
        const live = isEffectiveLiveGame(game, today, entry);
        const score = entry?.score ?? game.score ?? null;
        return { game, live, score, entry };
      })
      .sort((a, b) => {
        if (a.live !== b.live) return a.live ? -1 : 1;
        return a.game.kickoffUtc.localeCompare(b.game.kickoffUtc) || a.game.id.localeCompare(b.game.id);
      });
  }, [visibleGames, liveByGameId, today]);

  const emptyJumpTarget = useMemo<{ dayId: string; resetFilters: boolean } | null>(() => {
    if (orderedChips.length > 0) return null;
    const futureFiltered = dayOptions.find(
      (opt) => opt.key > day && filterGames(gamesForSelection(allGames, opt.key, today), sport, league).length > 0,
    );
    if (futureFiltered) return { dayId: futureFiltered.key, resetFilters: false };
    const anyFiltered = [...dayOptions]
      .reverse()
      .find(
        (opt) => opt.key !== day && filterGames(gamesForSelection(allGames, opt.key, today), sport, league).length > 0,
      );
    if (anyFiltered) return { dayId: anyFiltered.key, resetFilters: false };
    const futureAny = dayOptions.find((opt) => opt.key > day && opt.count > 0);
    if (futureAny) return { dayId: futureAny.key, resetFilters: true };
    const anyDay = [...dayOptions].reverse().find((opt) => opt.key !== day && opt.count > 0);
    return anyDay ? { dayId: anyDay.key, resetFilters: true } : null;
  }, [orderedChips.length, dayOptions, day, allGames, today, sport, league]);

  const centerParts = formatCenterDayParts(day, today);
  const centerText = centerParts.sub ? `${centerParts.top} ${centerParts.sub}` : centerParts.top;
  const centerAria = day === today ? `${centerText}, día actual` : `${centerText}, volver a hoy`;
  const { chipsRef, chipsScroll, syncChipsScroll, scrollChipsBy } = useHorizontalChipsScroll(
    `${sport}|${league}|${day}|${orderedChips.length}`,
  );

  return (
    <section aria-label="Filtros de la jornada" className="pl-home-filterbar" data-home-filterbar="">
      <HomeSportStrip
        dayGames={dayGames}
        sport={sport}
        onSelectSport={onSportChange}
        variant="filterbar"
      />

      <div className="pl-home-row">
        <div role="group" aria-label="Elegir liga" className="pl-home-leagues">
          <button
            type="button"
            className={`pl-home-league ${league === ALL ? "is-on" : ""}`.trim()}
            aria-pressed={league === ALL}
            data-league-filter={ALL}
            onClick={(e) => {
              onLeagueChange(ALL);
              e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
            }}
          >
            <span>Todas las ligas</span>
            <span className="pl-home-league-count num">{sportGames.length}</span>
          </button>
          {leagues.map((l) => {
            const on = league === l;
            const n = sportGames.filter((g) => g.league === l).length;
            const label = leagueLabelOf(dayGames, l);
            return (
              <button
                key={l}
                type="button"
                className={`pl-home-league ${on ? "is-on" : ""}`.trim()}
                aria-pressed={on}
                data-league-filter={l}
                onClick={(e) => {
                  onLeagueChange(l);
                  e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
                }}
              >
                <LeagueBadge league={l} label={label} logoUrl={leagueLogoOf(dayGames, l)} size={20} />
                <span>{label}</span>
                <span className="pl-home-league-count num">{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="pl-home-daycard glass-card glass-ring">
        <div role="group" aria-label="Elegir día" className="pl-home-daybar">
          <div className="pl-home-dayseg" role="group" aria-label="Control del día">
            <button
              type="button"
              className="pl-home-dayseg-arrow"
              aria-label="Día anterior"
              disabled={!prevDayOption}
              data-day-prev=""
              onClick={() => prevDayOption && onDayChange(prevDayOption.key)}
            >
              <span aria-hidden="true">‹</span>
            </button>
            <button
              type="button"
              className={`pl-home-dayseg-center ${day === today ? "is-today" : ""}`.trim()}
              aria-label={centerAria}
              data-day-center=""
              onClick={() => onDayChange(today)}
            >
              <span className="pl-home-dayseg-top">{centerParts.top}</span>
              <span className="pl-home-dayseg-sub num">{centerParts.sub}</span>
            </button>
            <button
              type="button"
              className="pl-home-dayseg-arrow"
              aria-label="Día siguiente"
              disabled={!nextDayOption}
              data-day-next=""
              onClick={() => nextDayOption && onDayChange(nextDayOption.key)}
            >
              <span aria-hidden="true">›</span>
            </button>
          </div>

          <span className="pl-home-daysep" aria-hidden="true" />

          {orderedChips.length > 0 ? (
            <div className="pl-home-chips-wrap">
              {chipsScroll.overflows ? (
                <button
                  type="button"
                  className="pl-home-chips-nav"
                  aria-label="Desplazar partidos a la izquierda"
                  disabled={!chipsScroll.canLeft}
                  data-chips-prev=""
                  onClick={() => scrollChipsBy(-1)}
                >
                  <MaestroIcon name="chevronLeft" size={16} />
                </button>
              ) : null}
              <div
                ref={chipsRef}
                role="group"
                aria-label="Partidos del día"
                className="pl-home-chips"
                data-day-chips=""
                onScroll={syncChipsScroll}
              >
                {orderedChips.map((item) => (
                  <MatchChipButton
                    key={item.game.id}
                    item={item}
                    userTimezone={userTimezone}
                    onSelect={(g) => scrollToMatchCard(g.id)}
                  />
                ))}
              </div>
              {chipsScroll.overflows ? (
                <button
                  type="button"
                  className="pl-home-chips-nav"
                  aria-label="Desplazar partidos a la derecha"
                  disabled={!chipsScroll.canRight}
                  data-chips-next=""
                  onClick={() => scrollChipsBy(1)}
                >
                  <MaestroIcon name="chevronRight" size={16} />
                </button>
              ) : null}
            </div>
          ) : (
            <div className="pl-home-dayempty" data-day-empty="">
              <span className="pl-home-dayempty-text">Sin partidos este día</span>
              {emptyJumpTarget ? (
                <button
                  type="button"
                  className="pl-btn-glass pl-home-dayjump"
                  data-day-jump=""
                  onClick={() => onJumpDay(emptyJumpTarget.dayId, emptyJumpTarget.resetFilters)}
                >
                  {formatJumpDayLabel(emptyJumpTarget.dayId, today)}
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function HomeTrendingStrip({
  orderedChips,
  day,
  today,
  sport,
  league,
  emptyJumpTarget,
  onPickDay,
  onJumpDay,
  onSelectMatch,
}: {
  readonly orderedChips: readonly MatchChipEntry[];
  readonly day: string;
  readonly today: string;
  readonly sport: SportFilter;
  readonly league: LeagueFilter;
  readonly emptyJumpTarget: { dayId: string; resetFilters: boolean } | null;
  readonly onPickDay: (d: DaySelection) => void;
  readonly onJumpDay: (targetDay: string, resetFilters: boolean) => void;
  readonly onSelectMatch?: (game: PlatformGame) => void;
}): React.JSX.Element {
  const { userTimezone } = usePlatformCore();
  const { prefetchRoute } = usePlatformActions();
  const { chipsRef, chipsScroll, syncChipsScroll, scrollChipsBy } = useHorizontalChipsScroll(
    `${sport}|${league}|${day}|${orderedChips.length}`,
  );

  return (
    <section aria-label="Filtros de la jornada" className="pl-astro-topbar" data-home-filterbar="">
      <div className="pl-astro-stripbar">
        <span className="pl-astro-trend-pill">
          <MaestroIcon name="bolt" size={13} />
          <span>Tendencias</span>
        </span>

        {orderedChips.length > 0 ? (
          <div className="pl-home-chips-wrap">
            {chipsScroll.overflows ? (
              <button
                type="button"
                className="pl-home-chips-nav"
                aria-label="Desplazar partidos a la izquierda"
                disabled={!chipsScroll.canLeft}
                data-chips-prev=""
                onClick={() => scrollChipsBy(-1)}
              >
                <MaestroIcon name="chevronLeft" size={16} />
              </button>
            ) : null}
            <div
              ref={chipsRef}
              role="group"
              aria-label="Partidos del día"
              className="pl-home-chips"
              data-day-chips=""
              onScroll={syncChipsScroll}
            >
              {orderedChips.map((item) => (
                <MatchChipButton
                  key={item.game.id}
                  item={item}
                  userTimezone={userTimezone}
                  onPrefetch={prefetchRoute}
                  onSelect={(game) => {
                    const isDesktopViewport =
                      typeof window !== "undefined" &&
                      typeof window.matchMedia === "function" &&
                      window.matchMedia("(min-width: 1024px)").matches;
                    if (isDesktopViewport && onSelectMatch) {
                      onSelectMatch(game);
                    }
                    if (game.dayId !== day) {
                      onPickDay(game.dayId);
                      if (typeof window !== "undefined") {
                        window.setTimeout(() => scrollToMatchCard(game.id), 60);
                      }
                      return;
                    }
                    scrollToMatchCard(game.id);
                  }}
                />
              ))}
            </div>
            {chipsScroll.overflows ? (
              <button
                type="button"
                className="pl-home-chips-nav"
                aria-label="Desplazar partidos a la derecha"
                disabled={!chipsScroll.canRight}
                data-chips-next=""
                onClick={() => scrollChipsBy(1)}
              >
                <MaestroIcon name="chevronRight" size={16} />
              </button>
            ) : null}
          </div>
        ) : (
          <div className="pl-home-dayempty" data-day-empty="">
            <span className="pl-home-dayempty-text">Sin partidos este día</span>
            {emptyJumpTarget ? (
              <button
                type="button"
                className="pl-btn-glass pl-home-dayjump"
                data-day-jump=""
                onClick={() => onJumpDay(emptyJumpTarget.dayId, emptyJumpTarget.resetFilters)}
              >
                {formatJumpDayLabel(emptyJumpTarget.dayId, today)}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

export interface CalendarEventDaysSummary {
  readonly countsByDay: ReadonlyMap<
    string,
    { total: number; live: number; upcoming: number; finished: number; fav: number; leagues: Set<string> }
  >;
  readonly anyLive: boolean;
  readonly nextActionDay: string | null;
  readonly selectedStats: {
    total: number;
    live: number;
    upcoming: number;
    finished: number;
    fav: number;
    leagues: Set<string>;
  } | null;
  readonly legendLabel?: string;
}

export function HomeBoardBar({
  boardView,
  onBoardViewChange,
  day,
  today,
  prevDayOption,
  nextDayOption,
  onPickDay,
  calendarEventDays,
  statusFilter,
  onStatusFilterChange,
  liveVisibleCount,
  activeModalFilterCount,
  filtersOpen,
  onOpenFilters,
  showOdds,
  onShowOddsChange,
  onRequestFullShell,
  parlayCount,
  parlayActive = false,
  onOpenParlay,
}: {
  readonly boardView: HomeBoardView;
  readonly onBoardViewChange: (v: HomeBoardView) => void;
  readonly day: string;
  readonly today: string;
  readonly prevDayOption: DayOption | null;
  readonly nextDayOption: DayOption | null;
  readonly onPickDay: (d: DaySelection) => void;
  readonly calendarEventDays: CalendarEventDaysSummary;
  readonly statusFilter: MatchStatusFilter;
  readonly onStatusFilterChange: (next: MatchStatusFilter) => void;
  readonly liveVisibleCount: number;
  readonly activeModalFilterCount: number;
  readonly filtersOpen: boolean;
  readonly onOpenFilters: () => void;
  readonly showOdds: boolean;
  readonly onShowOddsChange: (show: boolean) => void;
  readonly onRequestFullShell: () => void;
  readonly parlayCount?: number;
  readonly parlayActive?: boolean;
  readonly onOpenParlay?: () => void;
}): React.JSX.Element {
  const [calendarOpen, setCalendarOpen] = useState<boolean>(false);
  const [calMonth, setCalMonth] = useState<{ year: number; monthIndex: number }>(() =>
    parseIsoYearMonth(day),
  );
  const [focusedIso, setFocusedIso] = useState<string>(day);
  const datePickerWrapRef = useRef<HTMLDivElement | null>(null);
  const dateCenterBtnRef = useRef<HTMLButtonElement | null>(null);
  const calendarGridRef = useRef<HTMLDivElement | null>(null);
  const pendingFocusIsoRef = useRef<string | null>(null);
  const calendarPopoverId = useId();
  const calendarHeadingId = useId();
  const oddsSwitchId = useId();

  const centerParts = formatCenterDayParts(day, today);
  const centerText =
    day === today
      ? "Hoy"
      : centerParts.sub
        ? `${centerParts.top} ${centerParts.sub}`
        : centerParts.top;
  const centerAria = `${centerText}, abrir calendario`;

  const closeCalendar = useCallback((returnFocus: boolean) => {
    setCalendarOpen(false);
    pendingFocusIsoRef.current = null;
    if (returnFocus) {
      dateCenterBtnRef.current?.focus();
    }
  }, []);

  useSafeEffect(() => {
    if (!calendarOpen) return;
    const onPointerDown = (ev: PointerEvent) => {
      if (
        ev.target instanceof Node &&
        datePickerWrapRef.current &&
        !datePickerWrapRef.current.contains(ev.target)
      ) {
        closeCalendar(false);
      }
    };
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        closeCalendar(true);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [calendarOpen, closeCalendar]);

  useSafeEffect(() => {
    if (!calendarOpen) return;
    const targetIso = pendingFocusIsoRef.current;
    if (!targetIso) return;
    const focusCell = () => {
      const gridEl = calendarGridRef.current;
      if (!gridEl) return;
      const targetBtn =
        gridEl.querySelector<HTMLButtonElement>(`button[data-cal-iso="${targetIso}"]`) ??
        gridEl.querySelector<HTMLButtonElement>("button[data-cal-iso]");
      if (targetBtn) {
        targetBtn.focus();
      }
      pendingFocusIsoRef.current = null;
    };
    if (typeof requestAnimationFrame === "function") {
      const frame = requestAnimationFrame(focusCell);
      return () => cancelAnimationFrame(frame);
    }
    focusCell();
  }, [calendarOpen, calMonth.year, calMonth.monthIndex]);

  const calendarWeeks = useMemo(
    () => buildCalendarMonthWeeks(calMonth.year, calMonth.monthIndex),
    [calMonth.monthIndex, calMonth.year],
  );

  const monthHeading = useMemo(
    () => formatMonthHeading(calMonth.year, calMonth.monthIndex),
    [calMonth.monthIndex, calMonth.year],
  );

  const monthPrefix = useMemo(
    () => `${calMonth.year}-${String(calMonth.monthIndex + 1).padStart(2, "0")}-`,
    [calMonth.monthIndex, calMonth.year],
  );

  const activeTabIso = useMemo(() => {
    if (focusedIso.startsWith(monthPrefix)) return focusedIso;
    if (day.startsWith(monthPrefix)) return day;
    if (today.startsWith(monthPrefix)) return today;
    for (const week of calendarWeeks) {
      for (const cell of week) {
        if (cell) return cell.iso;
      }
    }
    return "";
  }, [calendarWeeks, day, focusedIso, monthPrefix, today]);

  const todayParts = useMemo(() => parseIsoYearMonth(today), [today]);
  const isOnTodayView =
    day === today &&
    calMonth.year === todayParts.year &&
    calMonth.monthIndex === todayParts.monthIndex;

  const selectedTotal = calendarEventDays.selectedStats?.total ?? 0;
  const selectedLive = day >= today ? (calendarEventDays.selectedStats?.live ?? 0) : 0;
  const showNextAction = selectedTotal === 0 && calendarEventDays.nextActionDay !== null;
  const footSummaryText =
    selectedTotal > 0
      ? `${selectedTotal} ${selectedTotal === 1 ? "partido" : "partidos"}${selectedLive > 0 ? ` · ${selectedLive} en vivo` : ""}`
      : "Sin partidos";

  const stepCalendarMonth = useCallback(
    (delta: -1 | 1, focusAfterStep: boolean) => {
      const nextDate = new Date(Date.UTC(calMonth.year, calMonth.monthIndex + delta, 1));
      const nextYear = nextDate.getUTCFullYear();
      const nextMonthIndex = nextDate.getUTCMonth();
      const nextIso = clampIsoToMonth(nextYear, nextMonthIndex, dayNumOfIso(focusedIso));
      setCalMonth({ year: nextYear, monthIndex: nextMonthIndex });
      setFocusedIso(nextIso);
      if (focusAfterStep) {
        pendingFocusIsoRef.current = nextIso;
      }
    },
    [calMonth.monthIndex, calMonth.year, focusedIso],
  );

  const moveFocusToIso = useCallback(
    (targetIso: string) => {
      setFocusedIso(targetIso);
      if (targetIso.startsWith(monthPrefix)) {
        const gridEl = calendarGridRef.current;
        const btn = gridEl?.querySelector<HTMLButtonElement>(`button[data-cal-iso="${targetIso}"]`);
        btn?.focus();
        return;
      }
      pendingFocusIsoRef.current = targetIso;
      setCalMonth(parseIsoYearMonth(targetIso));
    },
    [monthPrefix],
  );

  const handleCalendarGridKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const gridEl = calendarGridRef.current;
    if (!gridEl) return;
    const buttons = [...gridEl.querySelectorAll<HTMLButtonElement>("button[data-cal-iso]")];
    if (buttons.length === 0) return;
    const activeButton = buttons.find((b) => b === document.activeElement);
    const currentIso = activeButton?.dataset.calIso ?? activeTabIso;
    if (!currentIso) return;

    if (e.key === "ArrowRight") {
      e.preventDefault();
      moveFocusToIso(addDays(currentIso, 1));
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      moveFocusToIso(addDays(currentIso, -1));
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveFocusToIso(addDays(currentIso, 7));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      moveFocusToIso(addDays(currentIso, -7));
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      const firstIso = buttons[0]?.dataset.calIso;
      if (firstIso) moveFocusToIso(firstIso);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      const lastIso = buttons[buttons.length - 1]?.dataset.calIso;
      if (lastIso) moveFocusToIso(lastIso);
      return;
    }
    if (e.key === "PageUp") {
      e.preventDefault();
      stepCalendarMonth(-1, true);
      return;
    }
    if (e.key === "PageDown") {
      e.preventDefault();
      stepCalendarMonth(1, true);
    }
  };

  return (
    <section
      className="pl-home-board-bar glass-card glass-ring"
      aria-label="Controles del tablero de partidos"
      data-home-board-bar=""
    >
      <div className="pl-home-board-top">
        <div
          className="pl-home-board-tabs"
          role="tablist"
          aria-label="Vista de partidos"
          {...({ focusgroup: "tablist nomemory" } as React.HTMLAttributes<HTMLDivElement>)}
        >
          {(
            [
              { id: "all", label: "Todos" },
              { id: "favorites", label: "Para ti" },
              { id: "competitions", label: "Competiciones" },
            ] as const
          ).map((tabItem) => {
            const selected = boardView === tabItem.id;
            return (
              <button
                key={tabItem.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`pl-home-board-tab ${selected ? "is-active" : ""}`.trim()}
                onClick={() => onBoardViewChange(tabItem.id)}
                {...(selected
                  ? ({ focusgroupstart: "" } as React.ButtonHTMLAttributes<HTMLButtonElement>)
                  : {})}
              >
                {tabItem.label}
              </button>
            );
          })}
        </div>

        <div ref={datePickerWrapRef} role="group" aria-label="Elegir día" className="pl-astro-datebar">
          <div className="pl-home-date-capsule" role="group" aria-label="Control del día">
            <button
              type="button"
              className="pl-home-date-arrow"
              aria-label="Día anterior"
              disabled={!prevDayOption}
              data-day-prev=""
              onClick={() => {
                if (!prevDayOption) return;
                onPickDay(prevDayOption.key);
                setCalMonth(parseIsoYearMonth(prevDayOption.key));
                setFocusedIso(prevDayOption.key);
              }}
            >
              <MaestroIcon name="chevronLeft" size={15} />
            </button>
            <button
              ref={dateCenterBtnRef}
              type="button"
              className={`pl-home-date-center ${day === today ? "is-today" : ""}`.trim()}
              aria-label={centerAria}
              aria-haspopup="dialog"
              aria-expanded={calendarOpen}
              aria-controls={calendarPopoverId}
              data-day-center=""
              onClick={() => {
                onRequestFullShell();
                setCalendarOpen((prev) => {
                  if (!prev) {
                    setCalMonth(parseIsoYearMonth(day));
                    setFocusedIso(day);
                    pendingFocusIsoRef.current = day;
                  } else {
                    pendingFocusIsoRef.current = null;
                  }
                  return !prev;
                });
              }}
            >
              <MaestroIcon name="calendar" size={14} className="pl-home-date-calicon" />
              {day === today ? (
                <span className="pl-home-date-label">Hoy</span>
              ) : (
                <span className="pl-home-date-label num">
                  {centerParts.top}
                  {centerParts.sub ? ` ${centerParts.sub}` : ""}
                </span>
              )}
              <MaestroIcon
                name="chevronDown"
                size={12}
                className={`pl-home-date-caret ${calendarOpen ? "is-open" : ""}`.trim()}
              />
            </button>
            <button
              type="button"
              className="pl-home-date-arrow"
              aria-label="Día siguiente"
              disabled={!nextDayOption}
              data-day-next=""
              onClick={() => {
                if (!nextDayOption) return;
                onPickDay(nextDayOption.key);
                setCalMonth(parseIsoYearMonth(nextDayOption.key));
                setFocusedIso(nextDayOption.key);
              }}
            >
              <MaestroIcon name="chevronRight" size={15} />
            </button>
          </div>

          {calendarOpen ? (
            <div
              id={calendarPopoverId}
              role="dialog"
              aria-labelledby={calendarHeadingId}
              data-home-calendar-popover=""
              className="pl-home-cal-popover"
            >
              <div className="pl-home-cal-head">
                <div className="pl-home-cal-month-nav">
                  <button
                    type="button"
                    className="pl-home-cal-nav"
                    aria-label="Mes anterior"
                    onClick={() => stepCalendarMonth(-1, false)}
                  >
                    <MaestroIcon name="chevronLeft" size={16} />
                  </button>
                  <h2
                    id={calendarHeadingId}
                    className="pl-home-cal-title"
                    aria-live="polite"
                  >
                    {monthHeading}
                  </h2>
                  <button
                    type="button"
                    className="pl-home-cal-nav"
                    aria-label="Mes siguiente"
                    onClick={() => stepCalendarMonth(1, false)}
                  >
                    <MaestroIcon name="chevronRight" size={16} />
                  </button>
                </div>
                <button
                  type="button"
                  className="pl-home-cal-close"
                  aria-label="Cerrar calendario"
                  onClick={() => closeCalendar(true)}
                >
                  <MaestroIcon name="x" size={14} />
                </button>
              </div>

              <div
                ref={calendarGridRef}
                className="pl-home-cal-grid"
                role="grid"
                aria-labelledby={calendarHeadingId}
                onKeyDown={handleCalendarGridKeyDown}
              >
                <div className="pl-home-cal-weekdays" role="row">
                  {CAL_WEEKDAYS_ES.map((wd, idx) => (
                    <span
                      key={wd}
                      role="columnheader"
                      aria-label={CAL_WEEKDAYS_FULL_ES[idx]}
                    >
                      {wd}
                    </span>
                  ))}
                </div>

                <div className="pl-home-cal-weeks" role="rowgroup">
                  {calendarWeeks.map((week, weekIdx) => (
                    <div key={`week-${weekIdx}`} className="pl-home-cal-week" role="row">
                      {week.map((cell, dayIdx) => {
                        if (!cell) {
                          return (
                            <span
                              key={`empty-${weekIdx}-${dayIdx}`}
                              role="gridcell"
                              aria-disabled="true"
                              className="pl-home-cal-empty"
                            />
                          );
                        }
                        const isSelected = cell.iso === day;
                        const isTodayCell = cell.iso === today;
                        const isPastCell = cell.iso < today;
                        const dayMeta = calendarEventDays.countsByDay.get(cell.iso);
                        const hasGames = Boolean(dayMeta && dayMeta.total > 0);
                        const hasLive = !isPastCell && Boolean(dayMeta && dayMeta.live > 0);
                        const isFinishedOnly = Boolean(
                          hasGames && (isPastCell || (dayMeta!.upcoming === 0 && !hasLive)),
                        );
                        const isBusy = Boolean(dayMeta && dayMeta.total >= 6);
                        const liveText = hasLive ? `, ${dayMeta!.live} en vivo` : "";
                        const todayText = isTodayCell ? ", hoy" : "";
                        const isFocusable = cell.iso === activeTabIso;

                        return (
                          <span
                            key={cell.iso}
                            role="gridcell"
                            aria-selected={isSelected}
                            className="pl-home-cal-cell"
                          >
                            <button
                              type="button"
                              tabIndex={isFocusable ? 0 : -1}
                              data-cal-iso={cell.iso}
                              aria-pressed={isSelected}
                              aria-current={isTodayCell ? "date" : undefined}
                              className={[
                                "pl-home-cal-day num",
                                isSelected ? "is-selected" : "",
                                isTodayCell ? "is-today" : "",
                                !hasGames ? "is-empty" : "",
                                isPastCell && !hasGames ? "is-past-empty" : "",
                                hasGames ? "has-games" : "",
                                hasLive ? "has-live" : "",
                                isFinishedOnly ? "is-finished-only" : "",
                                isBusy ? "is-busy" : "",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              onFocus={() => setFocusedIso(cell.iso)}
                              onClick={() => {
                                onPickDay(cell.iso);
                                setFocusedIso(cell.iso);
                                closeCalendar(true);
                              }}
                            >
                              <span className="pl-home-cal-num">{cell.dayNum}</span>
                              <span className="sr-only">
                                {` de ${FULL_MONTHS_ES[calMonth.monthIndex]} de ${calMonth.year}${todayText}`}
                              </span>
                              {hasGames ? (
                                <span className="pl-home-cal-meta">
                                  {hasLive ? <i className="pl-home-cal-live-dot" aria-hidden="true" /> : null}
                                  <span className="pl-home-cal-count">{dayMeta!.total}</span>
                                  <span className="sr-only">
                                    {` ${dayMeta!.total === 1 ? "partido" : "partidos"}${liveText}`}
                                  </span>
                                </span>
                              ) : (
                                <span className="sr-only">, sin partidos</span>
                              )}
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              <div className="pl-home-cal-foot">
                <span className="pl-home-cal-foot-status num">
                  {day === today ? `Hoy · ${footSummaryText}` : footSummaryText}
                </span>
                <div className="pl-home-cal-foot-actions">
                  <button
                    type="button"
                    className={`pl-home-cal-today-btn ${isOnTodayView ? "is-current" : ""}`.trim()}
                    disabled={isOnTodayView}
                    onClick={() => {
                      onPickDay(today);
                      setCalMonth(parseIsoYearMonth(today));
                      setFocusedIso(today);
                      closeCalendar(true);
                    }}
                  >
                    Hoy
                  </button>
                  {showNextAction ? (
                    <button
                      type="button"
                      className="pl-home-cal-next-btn"
                      aria-label={`Próxima jornada: ${shortDateLabel(calendarEventDays.nextActionDay!)}`}
                      onClick={() => {
                        const target = calendarEventDays.nextActionDay!;
                        onPickDay(target);
                        setCalMonth(parseIsoYearMonth(target));
                        setFocusedIso(target);
                        closeCalendar(true);
                      }}
                    >
                      <span>Próxima jornada</span>
                      <MaestroIcon name="arrowRight" size={12} />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="pl-home-board-sub">
        <div className="pl-home-board-pills" role="group" aria-label="Estado de los partidos">
          <button
            type="button"
            className={`pl-home-status-pill min-h-11 [@media(min-width:768px)_and_(pointer:fine)]:min-h-9 is-live-pill ${liveVisibleCount > 0 ? "has-live" : ""} ${statusFilter === "live" ? "is-on" : ""}`.trim()}
            aria-pressed={statusFilter === "live"}
            onClick={() => onStatusFilterChange(statusFilter === "live" ? "all" : "live")}
          >
            <span className="num">En Vivo ({liveVisibleCount})</span>
          </button>
          <button
            type="button"
            className={`pl-home-status-pill min-h-11 [@media(min-width:768px)_and_(pointer:fine)]:min-h-9 ${statusFilter === "finished" ? "is-on" : ""}`.trim()}
            aria-pressed={statusFilter === "finished"}
            onClick={() => onStatusFilterChange(statusFilter === "finished" ? "all" : "finished")}
          >
            Finalizado
          </button>
          <button
            type="button"
            className={`pl-home-status-pill min-h-11 [@media(min-width:768px)_and_(pointer:fine)]:min-h-9 ${statusFilter === "upcoming" ? "is-on" : ""}`.trim()}
            aria-pressed={statusFilter === "upcoming"}
            onClick={() => onStatusFilterChange(statusFilter === "upcoming" ? "all" : "upcoming")}
          >
            Próximo
          </button>

          <button
            type="button"
            className={`pl-home-filter-btn min-h-11 [@media(min-width:768px)_and_(pointer:fine)]:min-h-9 ${activeModalFilterCount > 0 ? "is-active" : ""}`.trim()}
            aria-haspopup="dialog"
            aria-expanded={filtersOpen}
            data-home-filters-trigger=""
            onClick={() => {
              onRequestFullShell();
              onOpenFilters();
            }}
          >
            <MaestroIcon name="filter" size={14} />
            <span>Filtros</span>
            {activeModalFilterCount > 0 ? (
              <span className="pl-home-filter-count num">{activeModalFilterCount}</span>
            ) : null}
          </button>
        </div>

        <div className="pl-home-md-board-right">
          {onOpenParlay && typeof parlayCount === "number" ? (
            <button
              type="button"
              className={`pl-home-md-parlay-chip min-h-11 [@media(min-width:768px)_and_(pointer:fine)]:min-h-9 ${parlayActive ? "is-active" : ""} ${parlayCount > 0 ? "has-legs" : ""}`.trim()}
              aria-pressed={parlayActive}
              data-home-parlay-shortcut=""
              onClick={onOpenParlay}
            >
              <MaestroIcon name="ticket" size={13} />
              <span className="num">Tu parlay ({parlayCount})</span>
            </button>
          ) : null}

          <label htmlFor={oddsSwitchId} className="pl-home-odds-toggle">
            <span className="pl-home-odds-label">Momios</span>
            <input
              id={oddsSwitchId}
              type="checkbox"
              {...({ switch: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
              role="switch"
              checked={showOdds}
              onChange={(e) => onShowOddsChange(e.target.checked)}
              className="pl-home-switch"
            />
          </label>
        </div>
      </div>
    </section>
  );
}
