"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { usePackIconBase } from "../../../pack-icon-theme";
import { LeagueBadge } from "../../../sports";
import { LeagueCategorySheet } from "../../components/LeagueCategorySheet";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import { useSafeEffect } from "../../hooks";
import type { PlatformGame } from "../../types";
import {
  ALL,
  matchesSportFilter,
  type HomeSportLeagueItem,
  type LeagueFilter,
  type SportFilter,
} from "./home-model";

export type HomeSportKey = SportFilter | "mlb";
type SportAssetKey = "football";
type OfficialLeagueSportKey = "nfl" | "nba" | "nhl" | "mlb";

export interface HomeSportDef {
  id: HomeSportKey;
  label: string;
  a11yName: string;
  iconKey?: SportAssetKey;
  officialLeague?: OfficialLeagueSportKey;
  soon?: boolean;
}

export const HOME_SPORTS: readonly HomeSportDef[] = [
  { id: ALL, label: "Todos", a11yName: "Todos los deportes" },
  { id: "futbol", label: "Fútbol", a11yName: "Fútbol", iconKey: "football" },
  { id: "nfl", label: "NFL", a11yName: "NFL · Fútbol americano", officialLeague: "nfl" },
  { id: "nba", label: "NBA", a11yName: "NBA · Basquetbol", officialLeague: "nba" },
  { id: "nhl", label: "NHL", a11yName: "NHL · Hockey", officialLeague: "nhl" },
  { id: "mlb", label: "MLB", a11yName: "MLB · Béisbol", officialLeague: "mlb" },
];

function countLabel(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export interface OrderedHomeSport {
  readonly def: HomeSportDef;
  readonly count: number;
}

export function orderHomeSports(
  dayGames: readonly PlatformGame[],
  selectedSport: SportFilter,
): OrderedHomeSport[] {
  const withCounts = HOME_SPORTS.map((def, idx) => ({
    def,
    idx,
    count: def.soon
      ? 0
      : def.id === ALL
        ? dayGames.length
        : dayGames.filter((g) => matchesSportFilter(g, def.id as SportFilter)).length,
  }));

  const [allItem, ...rest] = withCounts;
  const sortedRest = [...rest].sort((a, b) => {
    const aActive = a.count > 0 ? 1 : 0;
    const bActive = b.count > 0 ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    if (aActive === 1 && a.count !== b.count) return b.count - a.count;
    const aSel = a.def.id === selectedSport ? 1 : 0;
    const bSel = b.def.id === selectedSport ? 1 : 0;
    if (aSel !== bSel) return bSel - aSel;
    return a.idx - b.idx;
  });

  return [
    ...(allItem ? [{ def: allItem.def, count: allItem.count }] : []),
    ...sortedRest.map(({ def, count }) => ({ def, count })),
  ];
}

export interface PartitionedHomeLeagues {
  readonly inlineLeagues: readonly HomeSportLeagueItem[];
  readonly hiddenCount: number;
  readonly playingTodayCount: number;
}

export function partitionHomeLeagues(
  leagues: readonly HomeSportLeagueItem[],
  selectedLeague: LeagueFilter,
  favoriteLeagues?: readonly string[],
  maxInline = 8,
): PartitionedHomeLeagues {
  const favSet = new Set(favoriteLeagues ?? []);
  const playingToday = leagues
    .filter((lg) => lg.dayCount > 0)
    .sort((a, b) => {
      const aFav = favSet.has(a.league) ? 1 : 0;
      const bFav = favSet.has(b.league) ? 1 : 0;
      if (aFav !== bFav) return bFav - aFav;
      if (a.dayCount !== b.dayCount) return b.dayCount - a.dayCount;
      return 0;
    });

  let inline: HomeSportLeagueItem[] = playingToday.slice(0, maxInline);

  if (selectedLeague !== ALL && !inline.some((lg) => lg.league === selectedLeague)) {
    const picked = leagues.find((lg) => lg.league === selectedLeague);
    if (picked) {
      inline = [...inline.slice(0, Math.max(0, maxInline - 1)), picked];
    }
  }

  return {
    inlineLeagues: inline,
    hiddenCount: Math.max(0, leagues.length - inline.length),
    playingTodayCount: playingToday.length,
  };
}

export function SportThumb({
  def,
  size = 20,
}: {
  def: HomeSportDef;
  size?: number;
}): React.JSX.Element {
  const iconBase = usePackIconBase();
  if (def.officialLeague) {
    return (
      <LeagueBadge
        league={def.officialLeague}
        label={def.label}
        size={size}
        decorative
        eager
      />
    );
  }
  if (!def.iconKey) {
    return (
      <span className="pl-home-sport-gridbox">
        <MaestroIcon name="grid" size={16} />
      </span>
    );
  }
  return (
    <img
      src={`${iconBase}/32/deportes/${def.iconKey}.webp`}
      srcSet={`${iconBase}/32/deportes/${def.iconKey}.webp 1x, ${iconBase}/64/deportes/${def.iconKey}.webp 2x`}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      decoding="async"
      draggable={false}
    />
  );
}

function HeaderScrollTrack({
  roleLabel,
  dataAttr,
  depsKey,
  children,
}: {
  roleLabel: string;
  dataAttr?: Record<string, string>;
  depsKey: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [scrollState, setScrollState] = useState<{
    overflows: boolean;
    canLeft: boolean;
    canRight: boolean;
  }>({ overflows: false, canLeft: false, canRight: false });

  const syncScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    const overflows = maxScroll > 4;
    const canLeft = overflows && el.scrollLeft > 4;
    const canRight = overflows && el.scrollLeft < maxScroll - 4;
    setScrollState((prev) =>
      prev.overflows === overflows && prev.canLeft === canLeft && prev.canRight === canRight
        ? prev
        : { overflows, canLeft, canRight },
    );
  }, []);

  useSafeEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollLeft = 0;
  }, [depsKey]);

  useSafeEffect(() => {
    const el = scrollerRef.current;
    const frame =
      typeof requestAnimationFrame === "function" ? requestAnimationFrame(syncScroll) : 0;
    syncScroll();
    if (!el || typeof ResizeObserver === "undefined") {
      if (typeof window !== "undefined") {
        window.addEventListener("resize", syncScroll);
        return () => {
          if (frame) cancelAnimationFrame(frame);
          window.removeEventListener("resize", syncScroll);
        };
      }
      return () => {
        if (frame) cancelAnimationFrame(frame);
      };
    }
    const observer = new ResizeObserver(() => syncScroll());
    observer.observe(el);
    window.addEventListener("resize", syncScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", syncScroll);
    };
  }, [syncScroll, depsKey]);

  const scrollByDir = (dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const step = Math.max(180, Math.round(el.clientWidth * 0.65));
    const reduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * step, behavior: reduced ? "auto" : "smooth" });
  };

  return (
    <div
      className="pl-astro-sportbar-wrap pl-header-scroll-wrap"
      data-overflow-left={scrollState.canLeft ? "true" : "false"}
      data-overflow-right={scrollState.canRight ? "true" : "false"}
    >
      {scrollState.overflows && scrollState.canLeft ? (
        <button
          type="button"
          className="pl-header-scroll-btn"
          aria-label={`Desplazar ${roleLabel} a la izquierda`}
          onClick={() => scrollByDir(-1)}
        >
          <MaestroIcon name="chevronLeft" size={14} />
        </button>
      ) : null}

      <div
        ref={scrollerRef}
        role="group"
        aria-label={roleLabel}
        className="pl-astro-sports pl-header-scroll-track"
        onScroll={syncScroll}
        {...dataAttr}
      >
        {children}
      </div>

      {scrollState.overflows && scrollState.canRight ? (
        <button
          type="button"
          className="pl-header-scroll-btn"
          aria-label={`Desplazar ${roleLabel} a la derecha`}
          onClick={() => scrollByDir(1)}
        >
          <MaestroIcon name="chevronRight" size={14} />
        </button>
      ) : null}
    </div>
  );
}

export function HomeSportStrip({
  dayGames,
  sport,
  onSelectSport,
  variant = "header",
  scrollToTopOnSelect = false,
}: {
  dayGames: readonly PlatformGame[];
  sport: SportFilter;
  onSelectSport: (next: SportFilter) => void;
  variant?: "header" | "filterbar";
  scrollToTopOnSelect?: boolean;
}): React.JSX.Element {
  const isHeader = variant === "header";
  const classes = isHeader
    ? {
        tab: "pl-astro-sport-tab",
        icon: "pl-astro-sport-icon",
        label: "pl-astro-sport-label",
        count: "pl-astro-sport-count",
      }
    : {
        tab: "pl-home-sport",
        icon: "pl-home-sport-icon",
        label: "pl-home-sport-name",
        count: "pl-home-sport-badge",
      };

  const orderedSports = useMemo(
    () => orderHomeSports(dayGames, sport),
    [dayGames, sport],
  );

  const buttons = orderedSports.map(({ def, count }) => {
    const on = !def.soon && sport === def.id;
    const isEmpty = !def.soon && def.id !== ALL && count === 0;
    const badgeText = def.soon ? "Pronto" : String(count);
    const subtext = def.soon ? "Pronto" : countLabel(count, "partido", "partidos");
    const aria = `${def.a11yName}, ${subtext}`;
    return (
      <button
        key={def.id}
        type="button"
        disabled={def.soon}
        className={`${classes.tab} ${on ? "is-on" : ""} ${isEmpty ? "is-empty" : ""} ${def.soon ? "is-soon" : ""}`.trim()}
        aria-pressed={def.soon ? undefined : on}
        aria-label={aria}
        data-sport-filter={def.id}
        onClick={(e) => {
          if (def.soon) return;
          onSelectSport(def.id as SportFilter);
          e.currentTarget.scrollIntoView({
            block: "nearest",
            inline: "nearest",
            container: "nearest",
          } as ScrollIntoViewOptions);
          if (scrollToTopOnSelect && typeof window !== "undefined" && window.scrollY > 120) {
            const reduced =
              typeof window.matchMedia === "function" &&
              window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
          }
        }}
      >
        <span className={classes.icon} aria-hidden="true">
          <SportThumb def={def} size={isHeader ? 20 : 22} />
        </span>
        <strong className={classes.label}>{def.label}</strong>
        <span className={`${classes.count} num`}>{badgeText}</span>
      </button>
    );
  });

  if (isHeader) {
    return (
      <HeaderScrollTrack
        roleLabel="Elegir deporte"
        depsKey={`header-sports-${orderedSports.map((s) => `${s.def.id}:${s.count}`).join(",")}`}
      >
        {buttons}
      </HeaderScrollTrack>
    );
  }

  return (
    <div className="pl-home-row">
      <div role="group" aria-label="Elegir deporte" className="pl-home-sports">
        {buttons}
      </div>
    </div>
  );
}

export function HomeLeagueStrip({
  leagues,
  sportDayGamesCount,
  league,
  onSelectLeague,
  favoriteLeagues,
}: {
  leagues: readonly HomeSportLeagueItem[];
  sportDayGamesCount: number;
  league: LeagueFilter;
  onSelectLeague: (next: LeagueFilter) => void;
  favoriteLeagues?: readonly string[];
}): React.JSX.Element {
  const [sheetOpen, setSheetOpen] = useState(false);

  const favSet = useMemo(() => new Set(favoriteLeagues ?? []), [favoriteLeagues]);
  const MAX_INLINE = 8;

  const { inlineLeagues, hiddenCount, playingTodayCount } = useMemo(
    () => partitionHomeLeagues(leagues, league, favoriteLeagues, MAX_INLINE),
    [leagues, league, favoriteLeagues],
  );

  return (
    <>
      <HeaderScrollTrack
        roleLabel="Ligas del deporte"
        dataAttr={{ "data-home-leaguebar": "" }}
        depsKey={`${inlineLeagues.map((l) => `${l.league}:${l.dayCount}`).join(",")}|${hiddenCount}`}
      >
        <button
          type="button"
          className={`pl-astro-sport-tab pl-astro-sport-tab--league ${league === ALL ? "is-on" : ""}`.trim()}
          aria-pressed={league === ALL}
          data-league-chip={ALL}
          onClick={(e) => {
            onSelectLeague(ALL);
            e.currentTarget.scrollIntoView({
              block: "nearest",
              inline: "nearest",
              container: "nearest",
            } as ScrollIntoViewOptions);
          }}
        >
          <span className="pl-astro-sport-icon" aria-hidden="true">
            <span className="pl-home-sport-gridbox">
              <MaestroIcon name="trophy" size={13} />
            </span>
          </span>
          <strong className="pl-astro-sport-label">Todas</strong>
          <span className="pl-astro-sport-count num">{sportDayGamesCount}</span>
        </button>

        {inlineLeagues.map((lg) => {
          const on = league === lg.league;
          const isEmpty = lg.dayCount === 0;
          return (
            <button
              key={lg.league}
              type="button"
              className={`pl-astro-sport-tab pl-astro-sport-tab--league ${on ? "is-on" : ""} ${isEmpty ? "is-empty" : ""}`.trim()}
              aria-pressed={on}
              data-league-chip={lg.league}
              onClick={(e) => {
                onSelectLeague(on ? ALL : lg.league);
                e.currentTarget.scrollIntoView({
                  block: "nearest",
                  inline: "nearest",
                  container: "nearest",
                } as ScrollIntoViewOptions);
              }}
            >
              <span className="pl-astro-sport-icon pl-header-league-emblem" aria-hidden="true">
                <LeagueBadge
                  league={lg.league}
                  label={lg.label}
                  logoUrl={lg.logoUrl}
                  size={18}
                  decorative
                  eager
                />
              </span>
              <strong className="pl-astro-sport-label">{lg.label}</strong>
              <span className="pl-astro-sport-count num">{lg.dayCount}</span>
            </button>
          );
        })}

        {hiddenCount > 0 ? (
          <button
            type="button"
            className="pl-astro-sport-tab pl-astro-sport-tab--league pl-astro-sport-tab--more"
            data-more-leagues-trigger=""
            onClick={() => setSheetOpen(true)}
          >
            <span className="pl-astro-sport-icon" aria-hidden="true">
              <span className="pl-home-sport-gridbox">
                <MaestroIcon name="all-leagues" size={13} />
              </span>
            </span>
            <strong className="pl-astro-sport-label">
              {playingTodayCount > 0 ? "Más ligas" : "Explorar ligas"}
            </strong>
            <span className="pl-astro-sport-count num">+{hiddenCount}</span>
          </button>
        ) : null}
      </HeaderScrollTrack>

      <LeagueCategorySheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Ligas y copas activas"
        selectedLeague={league}
        onSelect={(next) => onSelectLeague(next === "all" ? ALL : next)}
        allCount={sportDayGamesCount}
        leagues={leagues.map((lg) => ({
          league: lg.league,
          label: lg.label,
          logoUrl: lg.logoUrl,
          activeCount: lg.totalCount,
          dayCount: lg.dayCount,
          isFavorite: favSet.has(lg.league),
          isActive: true,
        }))}
      />
    </>
  );
}
