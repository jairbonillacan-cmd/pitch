"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  formatOddsCaptureEs,
  isLivePhaseActive,
  type LeagueId,
  type LiveScoreboard,
  type LiveScoreboardEntry,
} from "@pitchlab/contracts";
import { LeagueBadge, PBar, TeamBadge } from "../../../sports";
import { formatOddsValue, isPickUnlocked } from "../../access-guard";
import { AtmosphereStage, ClubWorkspaceShell } from "../../components/ShellChrome";
import { LiveScoreboardStrip } from "../../live/LiveMatchCenter";
import { useLiveScoreboard } from "../../live/live-store";
import { HomeMatchCard } from "../../components/HomeMatchCard";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import {
  useIsPickInParlay,
  useJournalEntries,
  usePlatform,
  usePlatformActions,
  usePlatformCore,
} from "../../platform-provider";
import { OfficialDailyParlayCard } from "./OfficialDailyParlayCard";
import {
  assessParlayRisk,
  buildSmartAutoParlay,
  computeParlaySummary,
} from "../../parlay-engine";
import { profileRecord } from "../../profile-stats";
import type { MatchPick, PlatformGame, RiskBand } from "../../types";
import {
  ALL,
  UPCOMING,
  addDays,
  buildDayOptions,
  dayNumber,
  filterGames,
  gamesForSelection,
  groupMatchesByDayAndLeague,
  leaguesIn,
  longDayLabel,
  shortWeekday,
  sportOf,
  todayId,
  topPrincipalPicks,
  valuePicks,
  type DaySelection,
  type LeagueFilter,
  type SportFilter,
} from "./home-model";

const RISKS: ReadonlyArray<{ id: RiskBand; label: string; hint: string }> = [
  { id: "conservador", label: "Conservador", hint: "Las selecciones más probables, con menos momio." },
  { id: "medio", label: "Medio", hint: "Equilibrio entre probabilidad y momio." },
  { id: "arriesgado", label: "Arriesgado", hint: "Más momio a cambio de menos probabilidad." },
];

function countLabel(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

type HomeSportKey = SportFilter | "mlb";
type SportAssetKey = "football" | "american-football" | "basketball" | "hockey" | "baseball";

interface HomeSportDef {
  id: HomeSportKey;
  label: string;
  a11yName: string;
  iconKey?: SportAssetKey;
  soon?: boolean;
}

const HOME_SPORTS: readonly HomeSportDef[] = [
  { id: ALL, label: "Todos", a11yName: "Todos los deportes" },
  { id: "futbol", label: "Fútbol", a11yName: "Fútbol", iconKey: "football" },
  { id: "nfl", label: "NFL", a11yName: "NFL · Fútbol americano", iconKey: "american-football" },
  { id: "nba", label: "NBA", a11yName: "NBA · Basquetbol", iconKey: "basketball" },
  { id: "nhl", label: "NHL", a11yName: "NHL · Hockey", iconKey: "hockey" },
  { id: "mlb", label: "MLB", a11yName: "MLB · Béisbol", iconKey: "baseball", soon: true },
];

const CDMX_TIME_FMT = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const LONG_WEEKDAYS_LOWER = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

function formatCdmxTime(game: Pick<PlatformGame, "kickoffUtc" | "kickoffLocal">): string {
  if (game.kickoffUtc) {
    const parsed = new Date(game.kickoffUtc);
    if (!Number.isNaN(parsed.getTime())) {
      return CDMX_TIME_FMT.format(parsed);
    }
  }
  return game.kickoffLocal;
}

function teamCode(team: PlatformGame["home"]): string {
  const code = team.code?.trim();
  if (code) return code;
  return team.shortName.slice(0, 3).toUpperCase();
}

const SHORT_MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;

function formatCenterDayParts(day: string, today: string): { top: string; sub: string } {
  const shortLabel = `${shortWeekday(day).toLowerCase()} ${dayNumber(day)}`;
  if (day === today) return { top: "Hoy", sub: shortLabel };
  if (day === addDays(today, 1)) return { top: "Mañana", sub: shortLabel };
  const d = new Date(`${day}T12:00:00Z`);
  return { top: shortLabel, sub: SHORT_MONTHS[d.getUTCMonth()] ?? "" };
}

function formatJumpDayLabel(dayId: string, today: string): string {
  if (dayId === today) return "Ir a hoy";
  const d = new Date(`${dayId}T12:00:00Z`);
  const wd = LONG_WEEKDAYS_LOWER[d.getUTCDay()] ?? shortWeekday(dayId).toLowerCase();
  return `Ir al ${wd} ${dayNumber(dayId)}`;
}

function SportThumb({ def }: { def: HomeSportDef }): React.JSX.Element {
  if (!def.iconKey) {
    return (
      <span className="pl-home-sport-gridbox">
        <MaestroIcon name="grid" size={16} />
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

function leagueLabelOf(games: readonly PlatformGame[], league: LeagueId): string {
  return games.find((g) => g.league === league)?.leagueLabel ?? league;
}

function leagueLogoOf(games: readonly PlatformGame[], league: LeagueId): string | undefined {
  return games.find((g) => g.league === league)?.leagueLogoUrl;
}

function scrollToMatchCard(gameId: string): void {
  if (typeof document === "undefined") return;
  const escaped = typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(gameId)
    : gameId.replace(/"/g, '\\"');
  const card = document.querySelector<HTMLElement>(`[data-game-card="${escaped}"]`);
  const reduced =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const behavior: ScrollBehavior = reduced ? "auto" : "smooth";
  if (card) {
    card.scrollIntoView({ behavior, block: "center" });
    card
      .querySelector<HTMLElement>("a[data-card-open], a.pl-mlist-matchup, a[href*='/games/']")
      ?.focus({ preventScroll: true });
    return;
  }
  document.querySelector<HTMLElement>(".pl-home-cards, .pl-mlist")?.scrollIntoView({ behavior, block: "start" });
}

/**
 * Encabezado unificado de filtros del Inicio:
 * Franja 1 (deportes) → Franja 2 (ligas) → Franja 3 (control de día + tira de partidos).
 */
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

  const orderedChips = useMemo(() => {
    return visibleGames
      .map((game) => {
        const entry = liveByGameId.get(game.id);
        const live = (entry ? isLivePhaseActive(entry.phase) : false) || String(game.status) === "LIVE";
        const score = entry?.score ?? game.score ?? null;
        return { game, live, score };
      })
      .sort((a, b) => {
        if (a.live !== b.live) return a.live ? -1 : 1;
        return a.game.kickoffUtc.localeCompare(b.game.kickoffUtc) || a.game.id.localeCompare(b.game.id);
      });
  }, [visibleGames, liveByGameId]);

  const emptyJumpTarget = useMemo<{ dayId: string; resetFilters: boolean } | null>(() => {
    if (orderedChips.length > 0) return null;
    const futureFiltered = dayOptions.find(
      (opt) => opt.key > day && filterGames(gamesForSelection(allGames, opt.key, today), sport, league).length > 0,
    );
    if (futureFiltered) return { dayId: futureFiltered.key, resetFilters: false };
    const futureAny = dayOptions.find((opt) => opt.key > day && opt.count > 0);
    if (futureAny) return { dayId: futureAny.key, resetFilters: true };
    const anyFiltered = dayOptions.find(
      (opt) => opt.key !== day && filterGames(gamesForSelection(allGames, opt.key, today), sport, league).length > 0,
    );
    if (anyFiltered) return { dayId: anyFiltered.key, resetFilters: false };
    const anyDay = dayOptions.find((opt) => opt.key !== day && opt.count > 0);
    return anyDay ? { dayId: anyDay.key, resetFilters: true } : null;
  }, [orderedChips.length, dayOptions, day, allGames, today, sport, league]);

  const centerParts = formatCenterDayParts(day, today);
  const centerAria = day === today ? "Hoy, día actual" : `${centerParts.top}, volver a hoy`;

  const chipsRef = useRef<HTMLDivElement | null>(null);
  const [chipsScroll, setChipsScroll] = useState<{ overflows: boolean; canLeft: boolean; canRight: boolean }>({
    overflows: false,
    canLeft: false,
    canRight: false,
  });

  const syncChipsScroll = useCallback(() => {
    const el = chipsRef.current;
    if (!el) {
      setChipsScroll((prev) => (prev.overflows ? { overflows: false, canLeft: false, canRight: false } : prev));
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

  useEffect(() => {
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
  }, [syncChipsScroll, orderedChips, day]);

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

  return (
    <section aria-label="Filtros de la jornada" className="pl-home-filterbar" data-home-filterbar="">
      <div className="pl-home-row">
        <div role="group" aria-label="Elegir deporte" className="pl-home-sports">
          {HOME_SPORTS.map((def) => {
            const count = def.soon
              ? 0
              : def.id === ALL
                ? dayGames.length
                : dayGames.filter((g) => sportOf(g) === def.id).length;
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
                className={`pl-home-sport ${on ? "is-on" : ""} ${isEmpty ? "is-empty" : ""} ${def.soon ? "is-soon" : ""}`.trim()}
                aria-pressed={def.soon ? undefined : on}
                aria-label={aria}
                data-sport-filter={def.id}
                onClick={(e) => {
                  if (def.soon) return;
                  onSportChange(def.id as SportFilter);
                  e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
                }}
              >
                <span className="pl-home-sport-icon" aria-hidden="true">
                  <SportThumb def={def} />
                </span>
                <strong className="pl-home-sport-name">{def.label}</strong>
                <span className="pl-home-sport-badge num">{badgeText}</span>
              </button>
            );
          })}
        </div>
      </div>

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
                {orderedChips.map(({ game, live, score }) => {
                  const homeCode = teamCode(game.home);
                  const awayCode = teamCode(game.away);
                  const time = formatCdmxTime(game);
                  const scoreText = score ? `${score.home}–${score.away}` : null;
                  return (
                    <button
                      key={game.id}
                      type="button"
                      className={`pl-home-chip ${live ? "is-live" : ""}`.trim()}
                      data-match-chip={game.id}
                      data-chip-league={game.league}
                      data-chip-live={live ? "true" : undefined}
                      aria-label={`${live ? "En vivo" : time}: ${game.home.shortName} contra ${game.away.shortName}${scoreText ? `, ${scoreText}` : ""}`}
                      onClick={() => scrollToMatchCard(game.id)}
                    >
                      {live ? (
                        <>
                          <span className="pl-home-live-tag">
                            <span className="pl-home-live-dot" aria-hidden="true" />
                            <span>Vivo</span>
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
                          <span className="pl-home-chip-score num">{scoreText ?? "vs"}</span>
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
                      ) : (
                        <>
                          <span className="pl-home-chip-time num">{time}</span>
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
                          <span className="pl-home-chip-vs" aria-hidden="true">–</span>
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
                })}
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

const INITIAL_HOME_CARDS_LIMIT = 24;

function HomeMatchCardsSection({
  groups,
  today,
  liveByGameId,
}: {
  readonly groups: ReturnType<typeof groupMatchesByDayAndLeague>;
  readonly today: string;
  readonly liveByGameId: ReadonlyMap<string, LiveScoreboardEntry>;
}): React.JSX.Element {
  const totalGames = groups.reduce((sum, d) => sum + d.count, 0);
  const [limit, setLimit] = useState<number>(INITIAL_HOME_CARDS_LIMIT);

  if (groups.length === 0) {
    return (
      <div
        className="glass-card glass-ring rounded-2xl p-7 text-center text-sm"
        style={{ color: "var(--pl-text-muted)" }}
      >
        No hay partidos con este filtro. Prueba otro día o «Todas».
      </div>
    );
  }

  let remaining = limit;
  const visibleGroups: typeof groups = [];
  for (const dayGroup of groups) {
    if (remaining <= 0) break;
    const slicedLeagues = [];
    for (const leagueGroup of dayGroup.leagues) {
      if (remaining <= 0) break;
      const take = leagueGroup.games.slice(0, remaining);
      remaining -= take.length;
      if (take.length > 0) {
        slicedLeagues.push({ ...leagueGroup, games: take });
      }
    }
    if (slicedLeagues.length > 0) {
      visibleGroups.push({
        ...dayGroup,
        leagues: slicedLeagues,
      });
    }
  }

  return (
    <div className="pl-home-cards flex flex-col gap-6">
      {visibleGroups.map((dayGroup) => (
        <section
          key={dayGroup.dayId}
          aria-label={longDayLabel(dayGroup.dayId)}
          className="flex flex-col gap-5"
          data-day-group={dayGroup.dayId}
        >
          <header className="pl-mlist-day-head">
            <h2 className="pl-mlist-day-title">
              {longDayLabel(dayGroup.dayId)}
              {dayGroup.dayId === today ? " · hoy" : ""}
            </h2>
            <span className="pl-mlist-day-count num">
              {countLabel(dayGroup.count, "partido", "partidos")}
            </span>
          </header>

          <div className="flex flex-col gap-6">
            {dayGroup.leagues.map((leagueGroup) => (
              <div
                key={`${dayGroup.dayId}-${leagueGroup.league}`}
                className="flex flex-col gap-3"
                data-league-group={leagueGroup.league}
              >
                <header className="pl-mlist-league-head">
                  <LeagueBadge
                    league={leagueGroup.league}
                    label={leagueGroup.label}
                    logoUrl={leagueGroup.logoUrl}
                    size={22}
                  />
                  <h3 className="pl-mlist-league-title">{leagueGroup.label}</h3>
                  <span className="pl-mlist-league-meta num">
                    {leagueGroup.round} · {countLabel(leagueGroup.count, "partido", "partidos")}
                  </span>
                </header>

                <div className="pl-home-grid">
                  {leagueGroup.games.map((g) => (
                    <div key={g.id} className="pl-cv-card">
                      <HomeMatchCard game={g} liveEntry={liveByGameId.get(g.id)} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {totalGames > limit ? (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            className="pl-btn-glass text-xs min-h-11 px-4"
            onClick={() => setLimit((c) => c + INITIAL_HOME_CARDS_LIMIT)}
          >
            Ver más partidos ({totalGames - limit})
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Pick principal con mayor probabilidad estimada en el filtro activo. */
function TopPickCard({ game, pick }: { game: PlatformGame; pick: MatchPick }): React.JSX.Element {
  const { oddsFormat } = usePlatformCore();
  const { addPickToParlay, removePickFromParlay } = usePlatformActions();
  const inParlay = useIsPickInParlay(pick.id);
  return (
    <article className="pl-home-top glass-card glass-ring">
      <span className="flex items-center gap-2 text-xs min-w-0" style={{ color: "var(--pl-text-muted)" }}>
        <LeagueBadge league={game.league} label={game.leagueLabel} logoUrl={game.leagueLogoUrl} size={18} />
        <span className="truncate">
          {game.leagueLabel} · {shortWeekday(game.dayId)} {dayNumber(game.dayId)} · {game.kickoffLocal}
        </span>
      </span>
      <span className="text-[13px] truncate" style={{ color: "var(--pl-text-secondary)" }}>
        {game.home.shortName} vs {game.away.shortName}
      </span>
      <div className="flex items-end justify-between gap-2">
        <strong className="text-base leading-snug min-w-0">{pick.label}</strong>
        <strong className="num text-2xl shrink-0">{(pick.p * 100).toFixed(1)} %</strong>
      </div>
      <PBar p={pick.p} lead />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs num" style={{ color: "var(--pl-text-muted)" }}>
          Momio justo <strong style={{ color: "var(--pl-text)" }}>{formatOddsValue(pick.fairDecimal, oddsFormat)}</strong>
        </span>
        <button
          type="button"
          className={`pl-home-parlay-btn ${inParlay ? "is-on" : ""}`.trim()}
          aria-pressed={inParlay}
          aria-label={`${inParlay ? "Quitar del parlay" : "Agregar al parlay"}: ${pick.label}`}
          onClick={() => (inParlay ? removePickFromParlay(pick.id) : addPickToParlay(pick))}
        >
          <MaestroIcon name={inParlay ? "check" : "plus"} size={14} />
          <span>{inParlay ? "En parlay" : "Parlay"}</span>
        </button>
      </div>
    </article>
  );
}

const AUTO_PARLAY_QUICK_COUNTS = [2, 3, 4, 5, 6, 8, 10] as const;

function riskToneColor(tone: "success" | "info" | "warning" | "danger"): string {
  if (tone === "success") return "var(--pl-success)";
  if (tone === "warning") return "var(--pl-warning)";
  if (tone === "danger") return "var(--pl-danger)";
  return "var(--pl-brand)";
}

/** Tu parlay siempre a la vista: selecciones libres, termómetro de riesgo en vivo, momio justo y armado automático. */
function ParlayRail({ games }: { games: readonly PlatformGame[] }): React.JSX.Element {
  const {
    parlaySummary,
    removePickFromParlay,
    clearParlay,
    generateAutoParlay,
    navigateTo,
    oddsFormat,
    riskPreference,
    viewerRole,
  } = usePlatform();
  const [risk, setRisk] = useState<RiskBand>(riskPreference);
  const [autoCount, setAutoCount] = useState<number>(3);
  const legs = parlaySummary.legs;
  const riskHint = RISKS.find((r) => r.id === risk)?.hint ?? "";

  const openGamesCount = useMemo(
    () => games.filter((g) => g.status !== "FT" && g.status !== "LIVE").length,
    [games],
  );
  const maxAutoLegs = Math.max(2, openGamesCount);
  const effectiveAutoCount = Math.min(maxAutoLegs, Math.max(2, autoCount));

  const activeRiskInfo = useMemo(() => assessParlayRisk(parlaySummary), [parlaySummary]);

  const previewAutoRisk = useMemo(() => {
    const previewLegs = buildSmartAutoParlay(games, {
      leagues: [],
      risk,
      legCount: effectiveAutoCount,
      allowSgp: false,
      viewerRole,
    });
    return assessParlayRisk(computeParlaySummary(previewLegs, 1));
  }, [games, risk, effectiveAutoCount, viewerRole]);

  return (
    <section aria-labelledby="home-parlay-title" className="pl-home-rail-card is-parlay glass-card glass-ring">
      <div className="flex items-center justify-between gap-2">
        <h2 id="home-parlay-title" className="m-0 text-lg font-extrabold">Tu parlay</h2>
        <span className="pl-pill pl-pill--brand num">{countLabel(legs.length, "selección", "selecciones")}</span>
      </div>
      {legs.length === 0 ? (
        <p className="m-0 text-sm leading-relaxed" style={{ color: "var(--pl-text-muted)" }}>
          Toca <strong style={{ color: "var(--pl-text)" }}>Parlay</strong> en tantos partidos como quieras o ármalo en automático.
          Calculamos el riesgo en vivo y bloqueamos selecciones incompatibles.
        </p>
      ) : (
        <>
          <ul className="m-0 p-0 list-none flex flex-col gap-2">
            {legs.map(({ pick }) => (
              <li key={pick.id} className="pl-home-leg">
                <LeagueBadge league={pick.league} label={pick.leagueLabel} logoUrl={leagueLogoOf(games, pick.league)} size={20} />
                <span className="min-w-0 flex-1 flex flex-col">
                  <strong className="text-sm truncate">{pick.label}</strong>
                  <span className="text-xs truncate" style={{ color: "var(--pl-text-muted)" }}>{pick.matchLabel}</span>
                </span>
                <span className="num text-[13px] font-bold">{(pick.p * 100).toFixed(1)} %</span>
                <button
                  type="button"
                  className="pl-home-icon-btn"
                  aria-label={`Quitar ${pick.label}`}
                  onClick={() => removePickFromParlay(pick.id)}
                >
                  <MaestroIcon name="x" size={14} />
                </button>
              </li>
            ))}
          </ul>

          <div
            className="rounded-2xl p-3 flex flex-col gap-2"
            style={{
              background: "var(--pl-surface)",
              boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${riskToneColor(activeRiskInfo.tone)} 38%, var(--pl-border))`,
            }}
            data-parlay-risk-meter={activeRiskInfo.level}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold" style={{ color: "var(--pl-text-muted)" }}>
                Nivel de riesgo
              </span>
              <span
                className="text-xs font-extrabold num"
                style={{ color: riskToneColor(activeRiskInfo.tone) }}
              >
                {activeRiskInfo.label}
              </span>
            </div>
            <div
              className="h-2 rounded-full overflow-hidden"
              style={{ background: "var(--pl-surface-hover)" }}
              aria-hidden="true"
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${activeRiskInfo.meterPct}%`,
                  background: riskToneColor(activeRiskInfo.tone),
                }}
              />
            </div>
            <span className="text-xs font-semibold num" style={{ color: "var(--pl-text)" }}>
              {activeRiskInfo.headline}
            </span>
            <span className="text-[11px] leading-snug" style={{ color: "var(--pl-text-muted)" }}>
              {activeRiskInfo.guidance}
            </span>
            {activeRiskInfo.warnings[0] ? (
              <span
                className="text-[11px] font-semibold leading-snug"
                style={{ color: riskToneColor(activeRiskInfo.tone) }}
              >
                {activeRiskInfo.warnings[0]}
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="pl-home-stat">
              <span>Probabilidad combinada</span>
              <strong className="num">
                {parlaySummary.combinedProbability * 100 < 0.1
                  ? "< 0.1 %"
                  : `${(parlaySummary.combinedProbability * 100).toFixed(1)} %`}
              </strong>
            </div>
            <div className="pl-home-stat">
              <span>Momio justo</span>
              <strong className="num">{formatOddsValue(parlaySummary.fairDecimal, oddsFormat)}</strong>
            </div>
          </div>
          <p className="m-0 text-xs leading-relaxed" style={{ color: "var(--pl-text-muted)" }}>
            Si tu casa paga más que <strong className="num" style={{ color: "var(--pl-text)" }}>{formatOddsValue(parlaySummary.fairDecimal, oddsFormat)}</strong>,
            la cuota está por encima de lo que estima el modelo.
          </p>
        </>
      )}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold" style={{ color: "var(--pl-text-muted)" }}>Armar en automático</span>
          {previewAutoRisk.weakestLeg ? (
            <span
              className="text-[11px] font-bold num"
              style={{ color: riskToneColor(previewAutoRisk.tone) }}
              data-auto-parlay-risk={previewAutoRisk.level}
            >
              {previewAutoRisk.shortLabel} (~1/{previewAutoRisk.oneIn})
            </span>
          ) : null}
        </div>
        <div className="seg-well" role="group" aria-label="Perfil del parlay automático">
          {RISKS.map((r) => (
            <button key={r.id} type="button" className="seg-btn flex-1" aria-pressed={risk === r.id} onClick={() => setRisk(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <span className="text-xs font-semibold" style={{ color: "var(--pl-text-muted)" }}>
            Selecciones ({effectiveAutoCount} de {maxAutoLegs} disp.)
          </span>
          <div className="sl-stepper" role="group" aria-label="Cantidad de selecciones del parlay">
            <button
              type="button"
              aria-label="Menos selecciones"
              disabled={effectiveAutoCount <= 2}
              onClick={() => setAutoCount(Math.max(2, effectiveAutoCount - 1))}
            >
              −
            </button>
            <span className="num text-xs font-bold px-1.5">{effectiveAutoCount}</span>
            <button
              type="button"
              aria-label="Más selecciones"
              disabled={effectiveAutoCount >= maxAutoLegs}
              onClick={() => setAutoCount(Math.min(maxAutoLegs, effectiveAutoCount + 1))}
            >
              +
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Atajos de selecciones">
          {AUTO_PARLAY_QUICK_COUNTS.filter((c) => c <= maxAutoLegs || c <= 4).map((cnt) => (
            <button
              key={cnt}
              type="button"
              disabled={cnt > maxAutoLegs}
              aria-pressed={effectiveAutoCount === cnt}
              onClick={() => setAutoCount(cnt)}
              className="seg-btn num text-xs px-2 min-h-8 flex-1 justify-center"
              style={{
                background: effectiveAutoCount === cnt ? "var(--pl-surface-active)" : "var(--pl-surface)",
                border: "1px solid var(--pl-border)",
              }}
            >
              {cnt}
            </button>
          ))}
        </div>
        <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
          {riskHint} Solo combina partidos por empezar, sin repetir partido ni cruzar mercados opuestos.
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="pl-btn-primary text-sm min-h-11 px-4 flex-1 inline-flex items-center justify-center gap-1.5"
          onClick={() => generateAutoParlay({ leagues: [], risk, legCount: effectiveAutoCount, allowSgp: false, games })}
        >
          <MaestroIcon name="layers" size={14} />
          <span>Armar {effectiveAutoCount} selecciones</span>
        </button>
        {legs.length > 0 ? (
          <button type="button" className="pl-btn-glass text-sm min-h-11 px-4" onClick={clearParlay}>
            Vaciar
          </button>
        ) : null}
      </div>
      {legs.length > 0 ? (
        <a
          href="/app/parlays"
          onClick={(e) => {
            e.preventDefault();
            navigateTo("/app/parlays");
          }}
          className="pl-btn-glass text-sm min-h-11 px-4 inline-flex items-center justify-center gap-1.5"
        >
          <span>Abrir en el armador</span>
          <MaestroIcon name="arrowRight" size={13} />
        </a>
      ) : null}
    </section>
  );
}

function ValueRail({ items }: { items: ReadonlyArray<{ game: PlatformGame; pick: MatchPick }> }): React.JSX.Element | null {
  const { oddsFormat } = usePlatformCore();
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="home-value-title" className="pl-home-rail-card glass-card glass-ring">
      <div className="flex flex-col gap-1">
        <h2 id="home-value-title" className="m-0 text-base font-extrabold">Donde la casa paga más</h2>
        <span className="text-xs leading-relaxed" style={{ color: "var(--pl-text-muted)" }}>
          Momio real de casa por encima del momio justo del modelo.
        </span>
      </div>
      {items.slice(0, 4).map(({ game, pick }) => (
        <div key={pick.id} className="pl-home-value">
          <div className="flex items-center gap-3">
            <LeagueBadge league={game.league} label={game.leagueLabel} logoUrl={game.leagueLogoUrl} size={20} />
            <span className="min-w-0 flex-1 flex flex-col">
              <strong className="text-sm">{pick.label}</strong>
              <span className="text-xs truncate" style={{ color: "var(--pl-text-muted)" }}>
                {game.home.shortName} vs {game.away.shortName} · {shortWeekday(game.dayId)} {dayNumber(game.dayId)} · {game.kickoffLocal}
              </span>
            </span>
            <span className="flex flex-col items-end num">
              <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>justo {formatOddsValue(pick.fairDecimal, oddsFormat)}</span>
              <strong className="text-[15px]">casa {formatOddsValue(pick.marketDecimal ?? pick.fairDecimal, oddsFormat)}</strong>
              {pick.marketCapturedAtUtc ? (
                <time
                  dateTime={pick.marketCapturedAtUtc}
                  className="text-[11px] leading-tight"
                  style={{ color: "var(--pl-text-muted)" }}
                >
                  {formatOddsCaptureEs(pick.marketCapturedAtUtc)}
                </time>
              ) : null}
            </span>
          </div>
          <PBar p={pick.p} />
        </div>
      ))}
    </section>
  );
}

function LabRail(): React.JSX.Element {
  const journal = useJournalEntries();
  const { navigateTo } = usePlatformActions();
  const rec = useMemo(() => profileRecord(journal), [journal]);
  return (
    <section aria-labelledby="home-lab-title" className="pl-home-rail-card glass-card glass-ring">
      <div className="flex items-center justify-between gap-2">
        <h2 id="home-lab-title" className="m-0 text-base font-extrabold">Mi récord</h2>
        <a
          href="/app/lab"
          onClick={(e) => {
            e.preventDefault();
            navigateTo("/app/lab");
          }}
          className="text-sm font-bold"
        >
          Abrir
        </a>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="pl-home-stat">
          <span>Abiertos</span>
          <strong className="num">{rec.open}</strong>
        </div>
        <div className="pl-home-stat">
          <span>Saldo</span>
          <strong className="num">
            {rec.netUnits > 0 ? "+" : ""}
            {rec.netUnits.toFixed(1)}u
          </strong>
        </div>
        <div className="pl-home-stat">
          <span>Cumplidos</span>
          <strong className="num">{rec.settled > 0 ? `${rec.won} de ${rec.settled}` : "—"}</strong>
        </div>
      </div>
      {journal.length === 0 ? (
        <p className="m-0 text-sm leading-relaxed" style={{ color: "var(--pl-text-muted)" }}>
          Sella un pick antes del partido y aquí verás su resultado y si le ganaste al cierre.
        </p>
      ) : null}
    </section>
  );
}

export interface HomeClubViewProps {
  readonly initialDay?: DaySelection;
  readonly initialToday?: string;
  readonly initialSport?: SportFilter;
  readonly initialLeague?: LeagueFilter;
  readonly liveBoardOverride?: LiveScoreboard | null;
}

/**
 * Inicio del Club: deporte → liga → barra del día con partidos, tarjetas agrupadas
 * y columna derecha con tu parlay, valor contra la casa y tu bitácora.
 */
export function HomeClubView({
  initialDay,
  initialToday,
  initialSport = ALL,
  initialLeague = ALL,
  liveBoardOverride,
}: HomeClubViewProps = {}): React.JSX.Element {
  const { dataset, viewerRole, userTimezone } = usePlatformCore();
  const games = dataset.games;
  const today = useMemo(
    () => initialToday ?? todayId(userTimezone || "America/Mexico_City"),
    [initialToday, userTimezone],
  );
  const [chosenDay, setDay] = useState<DaySelection | null>(initialDay ?? null);
  const [sport, setSport] = useState<SportFilter>(initialSport);
  const [league, setLeague] = useState<LeagueFilter>(initialLeague);

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

  // Empieza en «Hoy» si hay actividad hoy o en próximos días; si es un snapshot histórico, abre en su último día.
  const day = useMemo<string>(() => {
    if (chosenDay && chosenDay !== UPCOMING) return chosenDay;
    if (games.some((g) => g.dayId >= today)) return today;
    const last = games.reduce<string>((acc, g) => (g.dayId > acc ? g.dayId : acc), "");
    return last || today;
  }, [chosenDay, games, today]);
  const dayGames = useMemo(() => gamesForSelection(games, day, today), [games, day, today]);
  const visible = useMemo(() => filterGames(dayGames, sport, league), [dayGames, sport, league]);
  const dayGroups = useMemo(() => groupMatchesByDayAndLeague(visible), [visible]);
  const isUnlocked = useCallback(
    (pick: MatchPick, game: PlatformGame) => isPickUnlocked(pick, game.status, viewerRole),
    [viewerRole],
  );
  const top = useMemo(() => topPrincipalPicks(visible, 3, isUnlocked), [visible, isUnlocked]);
  const value = useMemo(() => valuePicks(visible, isUnlocked), [visible, isUnlocked]);

  const isPast = day < today;
  const title = isPast
    ? `Resultados del ${longDayLabel(day).toLowerCase()}`
    : day === today
      ? `Hoy, ${longDayLabel(day).toLowerCase()}`
      : longDayLabel(day);
  const nLeagues = leaguesIn(dayGames).length;
  const subtitle = isPast
    ? `${countLabel(dayGames.length, "partido terminado", "partidos terminados")} con el pick principal que publicó el modelo`
    : `${countLabel(dayGames.length, "partido", "partidos")} · ${countLabel(nLeagues, "liga", "ligas")} · picks con probabilidad y momio justo`;

  const pickDay = (d: DaySelection) => {
    setDay(d);
    setLeague((prev) =>
      prev !== ALL && gamesForSelection(games, d, today).some((g) => g.league === prev) ? prev : ALL,
    );
  };
  const pickSport = (s: SportFilter) => {
    setSport(s);
    setLeague(ALL);
  };
  const jumpDay = (targetDay: string, resetFilters: boolean) => {
    setDay(targetDay);
    if (resetFilters) {
      setSport(ALL);
      setLeague(ALL);
      return;
    }
    setLeague((prev) =>
      prev !== ALL && gamesForSelection(games, targetDay, today).some((g) => g.league === prev) ? prev : ALL,
    );
  };

  return (
    <AtmosphereStage activePath="/app">
      <ClubWorkspaceShell activePath="/app">
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5 min-w-0">
            <span className="text-[13px] font-bold" style={{ color: "var(--pl-brand)" }}>
              Hoy es {longDayLabel(today).toLowerCase()}
            </span>
            <h1 className="m-0 text-3xl sm:text-4xl font-extrabold tracking-tight">{title}</h1>
            <span className="text-sm" style={{ color: "var(--pl-text-muted)" }}>{subtitle}</span>
          </div>
        </section>

        <LiveScoreboardStrip />

        <HomeFilterHeader
          allGames={games}
          dayGames={dayGames}
          visibleGames={visible}
          today={today}
          day={day}
          sport={sport}
          league={league}
          liveByGameId={liveByGameId}
          onDayChange={pickDay}
          onSportChange={pickSport}
          onLeagueChange={setLeague}
          onJumpDay={jumpDay}
        />

        <div className="pl-home-layout">
          <div className="pl-home-main">
            {top.length > 0 ? (
              <section aria-labelledby="home-top-title" className="flex flex-col gap-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 id="home-top-title" className="m-0 text-xl font-extrabold">Picks con mayor probabilidad</h2>
                  <span className="text-[13px]" style={{ color: "var(--pl-text-muted)" }}>
                    El pick principal de cada partido, ordenado de mayor a menor
                  </span>
                </div>
                <div className="pl-home-top-grid">
                  {top.map(({ game, pick }) => (
                    <TopPickCard key={pick.id} game={game} pick={pick} />
                  ))}
                </div>
              </section>
            ) : null}

            <OfficialDailyParlayCard
              games={dataset.games}
              selectedDay={day}
              today={today}
              isPastDay={isPast}
              activeLeague={league === ALL ? null : league}
            />

            <HomeMatchCardsSection groups={dayGroups} today={today} liveByGameId={liveByGameId} />
          </div>

          <aside aria-label="Tu parlay, valor y récord" className="pl-home-rail">
            <ParlayRail games={visible} />
            <ValueRail items={value} />
            <LabRail />
          </aside>
        </div>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
