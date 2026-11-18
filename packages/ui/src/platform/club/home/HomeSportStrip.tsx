"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { LeagueBadge } from "../../../sports";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import type { PlatformGame } from "../../types";
import {
  ALL,
  matchesSportFilter,
  type HomeSportLeagueItem,
  type LeagueFilter,
  type SportFilter,
} from "./home-model";

export type HomeSportKey = SportFilter | "mlb";
type SportAssetKey =
  | "football"
  | "american-football"
  | "basketball"
  | "hockey"
  | "baseball";

export interface HomeSportDef {
  id: HomeSportKey;
  label: string;
  a11yName: string;
  iconKey?: SportAssetKey;
  soon?: boolean;
}

export const HOME_SPORTS: readonly HomeSportDef[] = [
  { id: ALL, label: "Todos", a11yName: "Todos los deportes" },
  { id: "futbol", label: "Fútbol", a11yName: "Fútbol", iconKey: "football" },
  { id: "nfl", label: "NFL", a11yName: "NFL · Fútbol americano", iconKey: "american-football" },
  { id: "nba", label: "NBA", a11yName: "NBA · Basquetbol", iconKey: "basketball" },
  { id: "nhl", label: "NHL", a11yName: "NHL · Hockey", iconKey: "hockey" },
  { id: "mlb", label: "MLB", a11yName: "MLB · Béisbol", iconKey: "baseball", soon: true },
];

function countLabel(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function SportThumb({ def }: { def: HomeSportDef }): React.JSX.Element {
  if (!def.iconKey) {
    return (
      <span className="pl-home-sport-gridbox">
        <MaestroIcon name="grid" size={14} />
      </span>
    );
  }
  return (
    <picture>
      <source srcSet={`/sports/${def.iconKey}.webp`} type="image/webp" />
      <img src={`/sports/${def.iconKey}.png`} alt="" width={32} height={32} decoding="async" />
    </picture>
  );
}

/** Pista horizontal con flechas discretas `<` `>` solo cuando las pestañas rebasan el ancho. */
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

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollLeft = 0;
  }, [depsKey]);

  useEffect(() => {
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

/**
 * Tira horizontal de deportes compartida entre la cabecera de `/app`
 * (`variant="header"`) y el encabezado de filtros autónomo (`variant="filterbar"`).
 */
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

  const buttons = HOME_SPORTS.map((def) => {
    const count = def.soon
      ? 0
      : def.id === ALL
        ? dayGames.length
        : dayGames.filter((g) => matchesSportFilter(g, def.id as SportFilter)).length;
    const on = !def.soon && sport === def.id;
    const isEmpty = !def.soon && count === 0;
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
          e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
          if (scrollToTopOnSelect && typeof window !== "undefined" && window.scrollY > 120) {
            const reduced =
              typeof window.matchMedia === "function" &&
              window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
          }
        }}
      >
        <span className={classes.icon} aria-hidden="true">
          <SportThumb def={def} />
        </span>
        <strong className={classes.label}>{def.label}</strong>
        <span className={`${classes.count} num`}>{badgeText}</span>
      </button>
    );
  });

  if (isHeader) {
    return (
      <HeaderScrollTrack roleLabel="Elegir deporte" depsKey="header-sports">
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

/** Tira de ligas dentro del header de `/app`, con el mismo formato y ritmo visual que deportes. */
export function HomeLeagueStrip({
  leagues,
  sportDayGamesCount,
  league,
  onSelectLeague,
}: {
  leagues: readonly HomeSportLeagueItem[];
  sportDayGamesCount: number;
  league: LeagueFilter;
  onSelectLeague: (next: LeagueFilter) => void;
}): React.JSX.Element {
  return (
    <HeaderScrollTrack
      roleLabel="Ligas del deporte"
      dataAttr={{ "data-home-leaguebar": "" }}
      depsKey={leagues.map((l) => l.league).join(",")}
    >
      <button
        type="button"
        className={`pl-astro-sport-tab pl-astro-sport-tab--league ${league === ALL ? "is-on" : ""}`.trim()}
        aria-pressed={league === ALL}
        data-league-chip={ALL}
        onClick={(e) => {
          onSelectLeague(ALL);
          e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
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

      {leagues.map((lg) => {
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
              e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
            }}
          >
            <span className="pl-astro-sport-icon pl-header-league-emblem" aria-hidden="true">
              <LeagueBadge league={lg.league} label={lg.label} logoUrl={lg.logoUrl} size={18} />
            </span>
            <strong className="pl-astro-sport-label">{lg.label}</strong>
            <span className="pl-astro-sport-count num">{lg.dayCount}</span>
          </button>
        );
      })}
    </HeaderScrollTrack>
  );
}
