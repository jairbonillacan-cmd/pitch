"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  formatOddsCaptureEs,
  isLivePhaseActive,
  sportHasDraw,
  sportScoringUnit,
  type LeagueId,
  type LiveScoreboard,
  type LiveScoreboardEntry,
} from "@pitchlab/contracts";
import { LeagueBadge, PBar, ProbSplit, TeamBadge } from "../../../sports";
import { formatOddsValue, isPickUnlocked, isPreGameIntelUnlocked } from "../../access-guard";
import { formatKickoffByTimezone } from "../account/account-helpers";
import { ConfidenceChip } from "../../components/ConfidenceChip";
import {
  ParlayPickButton,
  formatCountsHint,
  formatGoalLineHint,
} from "../../components/MatchList";
import { AtmosphereStage, ClubWorkspaceShell } from "../../components/ShellChrome";
import { useLiveScoreboard } from "../../live/live-store";
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
  alternativePick,
  buildDayOptions,
  dayNumber,
  filterGames,
  gamesForSelection,
  groupMatchesByDayAndLeague,
  leaguesIn,
  longDayLabel,
  matchesSportFilter,
  mostLikelyOutcome,
  shortDateLabel,
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
type SportAssetKey =
  | "football"
  | "national"
  | "american-football"
  | "basketball"
  | "hockey"
  | "baseball";

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
  { id: "selecciones", label: "Selecciones", a11yName: "Selecciones nacionales", iconKey: "national" },
  { id: "nfl", label: "NFL", a11yName: "NFL · Fútbol americano", iconKey: "american-football" },
  { id: "nba", label: "NBA", a11yName: "NBA · Basquetbol", iconKey: "basketball" },
  { id: "nhl", label: "NHL", a11yName: "NHL · Hockey", iconKey: "hockey" },
  { id: "mlb", label: "MLB", a11yName: "MLB · Béisbol", iconKey: "baseball", soon: true },
];

const LONG_WEEKDAYS_LOWER = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

function formatGameKickoffTime(
  game: Pick<PlatformGame, "kickoffUtc" | "kickoffLocal">,
  timeZone?: string | null,
): string {
  return formatKickoffByTimezone(
    game.kickoffUtc,
    game.kickoffLocal,
    timeZone?.trim() || "America/Mexico_City",
  );
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
  if (def.iconKey === "national") {
    return (
      <span className="pl-home-sport-gridbox">
        <MaestroIcon name="globe" size={16} />
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
                  const time = formatGameKickoffTime(game, userTimezone);
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
                          <span className="pl-home-chip-time num">{shortDateLabel(game.dayId)} · {time}</span>
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

const INITIAL_HOME_CARDS_LIMIT = 32;

const LEAGUE_REGION_LABELS: Readonly<Record<string, string>> = {
  nfl: "Estados Unidos",
  nba: "Estados Unidos",
  nhl: "Estados Unidos y Canadá",
  mlb: "Estados Unidos",
  "liga-mx": "México",
  "premier-league": "Inglaterra",
  laliga: "España",
  "la-liga": "España",
  bundesliga: "Alemania",
  "serie-a": "Italia",
  "ligue-1": "Francia",
  "champions-league": "Europa",
};

type MatchStatusFilter = "all" | "live" | "upcoming" | "finished" | "ai";

/**
 * Fila enriquecida de partido dentro del bloque de su competición:
 * conserva la limpieza de agrupación por liga (Astranalisis) pero incluye
 * las barras visuales (`ProbSplit` 1·X·2 / Ganador + `PBar` del pick principal),
 * récords, resultado más probable, pick alternativo, líneas clave y acciones.
 */
const AstroMatchRow = React.memo(function AstroMatchRow({
  game,
  liveEntry,
}: {
  readonly game: PlatformGame;
  readonly liveEntry?: LiveScoreboardEntry;
}): React.JSX.Element {
  const { viewerRole, oddsFormat, hasAccountSession, upgradeHref, userTimezone } = usePlatformCore();
  const { setAuraFromGame, navigateTo } = usePlatformActions();

  const hasDraw = sportHasDraw(game.sport);
  const unit = sportScoringUnit(game.sport);
  const decimals = unit.decimals;
  const hasForecast = game.hasForecast !== false && Boolean(game.x12 && game.projection);
  const live = (liveEntry ? isLivePhaseActive(liveEntry.phase) : false) || String(game.status) === "LIVE";
  const isFinished =
    !live &&
    (game.status === "FT" || liveEntry?.phase === "final") &&
    (game.score !== undefined || liveEntry?.score != null);
  const activeScore = live
    ? (liveEntry?.score ?? game.score ?? null)
    : (game.score ?? liveEntry?.score ?? null);
  const mainPick = game.picks[0];
  const unlocked = mainPick ? isPickUnlocked(mainPick, game.status, viewerRole) : false;
  const intelUnlocked = isFinished || isPreGameIntelUnlocked(game, viewerRole);
  const alt = unlocked ? alternativePick(game) : null;
  const outcome = hasForecast ? mostLikelyOutcome(game) : null;
  const goalHint = hasForecast ? formatGoalLineHint(game, intelUnlocked) : null;
  const countsHint = hasForecast ? formatCountsHint(game, intelUnlocked) : null;
  const [ph, pd, pa] = game.x12 ?? [0, 0, 0];
  const studioHref = `/app/${game.league}/games/${game.id}`;
  const matchLabel = `${game.home.name} contra ${game.away.name}`;
  const time = formatGameKickoffTime(game, userTimezone);

  const homeStrong = isFinished
    ? (activeScore?.home ?? 0) > (activeScore?.away ?? 0)
    : outcome?.side === "home";
  const awayStrong = isFinished
    ? (activeScore?.away ?? 0) > (activeScore?.home ?? 0)
    : outcome?.side === "away";

  const showRealScore = live || isFinished;
  const homeVal = showRealScore
    ? (activeScore?.home ?? "—")
    : unlocked && game.projection
      ? game.projection.home.toFixed(decimals)
      : "—";
  const awayVal = showRealScore
    ? (activeScore?.away ?? "—")
    : unlocked && game.projection
      ? game.projection.away.toFixed(decimals)
      : "—";

  const scoreCaption = live
    ? "en vivo"
    : isFinished
      ? "final"
      : unlocked && game.projection
        ? `${unit.short} proy.`
        : "";

  const openStudio = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setAuraFromGame(game);
    navigateTo(studioHref);
  };

  return (
    <article
      className={`pl-astro-row ${live ? "is-live" : ""} ${isFinished ? "is-finished" : ""}`.trim()}
      data-game-card={game.id}
      onMouseEnter={() => setAuraFromGame(game)}
    >
      {/* Cabecera compacta de la fila: hora/estado, sede/ronda y chip de confianza */}
      <div className="pl-astro-row-top">
        <div className="pl-astro-row-meta num">
          {live ? (
            <span className="pl-astro-live-pill pl-home-card-live">
              <span className="pl-home-live-dot" aria-hidden="true" />
              <span>Vivo{liveEntry?.clock ? ` · ${liveEntry.clock}'` : ""} · {shortDateLabel(game.dayId)}</span>
            </span>
          ) : (
            <span className="pl-astro-time-badge">
              <strong className="pl-astro-clock">{shortDateLabel(game.dayId)} · {time}</strong>
              <span className="pl-astro-status">{isFinished ? "Final" : "Por jugar"}</span>
            </span>
          )}
          <span className="pl-astro-venue-meta truncate">
            {game.round}
            {game.venue ? ` · ${game.venue}` : ""}
          </span>
        </div>

        {!isFinished ? <ConfidenceChip game={game} /> : null}
      </div>

      {/* Cuerpo principal: Equipos + Récord + Proyección a la izquierda | Barra 1·X·2 y resultado más probable a la derecha */}
      <div className="pl-astro-row-body">
        <div className="pl-astro-matchup-box">
          <a
            href={studioHref}
            onClick={openStudio}
            data-card-open=""
            className="pl-astro-col-teams"
            aria-label={`Ver partido ${matchLabel}`}
          >
            <div className="pl-astro-team-line">
              <TeamBadge
                league={game.league}
                slug={game.home.slug}
                name={game.home.name}
                logoUrl={game.home.logoUrl}
                size={24}
              />
              <div className="pl-astro-team-info">
                <span className={`pl-astro-team-name ${homeStrong ? "is-strong" : ""}`.trim()}>
                  {game.home.name}
                </span>
                <div className="pl-astro-team-sub">
                  {!game.neutralSite ? <span className="pl-side-tag is-home">Local</span> : null}
                  {game.home.record ? <span className="pl-astro-team-rec">{game.home.record}</span> : null}
                </div>
              </div>
              <span className={`pl-astro-team-score num ${homeStrong ? "is-strong" : ""}`.trim()}>
                {homeVal}
              </span>
            </div>

            <div className="pl-astro-team-line">
              <TeamBadge
                league={game.league}
                slug={game.away.slug}
                name={game.away.name}
                logoUrl={game.away.logoUrl}
                size={24}
              />
              <div className="pl-astro-team-info">
                <span className={`pl-astro-team-name ${awayStrong ? "is-strong" : ""}`.trim()}>
                  {game.away.name}
                </span>
                <div className="pl-astro-team-sub">
                  {!game.neutralSite ? <span className="pl-side-tag">Visita</span> : null}
                  {game.away.record ? <span className="pl-astro-team-rec">{game.away.record}</span> : null}
                </div>
              </div>
              <span className={`pl-astro-team-score num ${awayStrong ? "is-strong" : ""}`.trim()}>
                {awayVal}
              </span>
            </div>
          </a>

          {scoreCaption ? (
            <div className="pl-astro-score-caption num">
              <span>{scoreCaption}</span>
            </div>
          ) : null}
        </div>

        {!isFinished && hasForecast && outcome ? (
          <div className="pl-astro-prob-box">
            <ProbSplit
              probabilities={hasDraw ? [ph, pd, pa] : [ph, pa]}
              labels={
                hasDraw
                  ? [game.home.shortName, "Empate", game.away.shortName]
                  : [game.home.shortName, game.away.shortName]
              }
              showLabels
            />
            <div className="pl-astro-outcome-strip num">
              <div className="min-w-0">
                <span className="pl-astro-outcome-eyebrow">Resultado más probable</span>
                <strong className="pl-astro-outcome-name truncate">{outcome.label}</strong>
              </div>
              <div className="text-right shrink-0">
                <strong className="pl-astro-outcome-pct">{(outcome.p * 100).toFixed(1)} %</strong>
                <span className="pl-astro-outcome-fair">
                  justo {formatOddsValue(1 / Math.max(outcome.p, 0.0001), oddsFormat)}
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Pie enriquecido: Pick principal del modelo con barra PBar, líneas, pick alternativo y acciones */}
      <div className="pl-astro-row-foot">
        {isFinished ? (
          <div className="pl-astro-ft-wrap">
            {mainPick ? (
              <span className="pl-astro-ft-pick num">
                <span>Pick principal publicado:</span>
                <strong>{mainPick.label}</strong>
                <span>({(mainPick.p * 100).toFixed(0)} %)</span>
              </span>
            ) : (
              <span className="pl-astro-ft-pick">Partido finalizado</span>
            )}
            <a
              href={studioHref}
              onClick={openStudio}
              className="pl-btn-glass text-xs min-h-9 px-3 inline-flex items-center gap-1.5 no-underline"
            >
              <span>Ver partido</span>
              <MaestroIcon name="arrowRight" size={12} />
            </a>
          </div>
        ) : !hasForecast ? (
          <div className="pl-astro-ft-wrap" data-empty-forecast="">
            <span className="pl-mlist-chip">Sin pronóstico publicado</span>
            <a
              href={studioHref}
              onClick={openStudio}
              className="pl-btn-glass text-xs min-h-9 px-3 inline-flex items-center gap-1.5 no-underline"
            >
              <span>Ver partido</span>
              <MaestroIcon name="arrowRight" size={12} />
            </a>
          </div>
        ) : mainPick && unlocked ? (
          <div className="pl-astro-pick-card">
            <div className="pl-astro-pick-main">
              <div className="pl-astro-pick-head">
                <span className="pl-astro-pick-badge">Pick principal del modelo</span>
                {goalHint ? (
                  <span className="pl-mlist-chip is-goals num" data-goal-line="">
                    {goalHint}
                  </span>
                ) : null}
                {countsHint ? (
                  <span className="pl-mlist-chip is-counts num" data-counts-hint="">
                    {countsHint}
                  </span>
                ) : null}
              </div>

              <div className="pl-astro-pick-headline">
                <strong className="pl-astro-pick-label">{mainPick.label}</strong>
                <strong className="pl-astro-pick-prob num">{(mainPick.p * 100).toFixed(1)} %</strong>
              </div>

              <PBar p={mainPick.p} lead />

              <div className="pl-astro-pick-sub num">
                <span>
                  Momio justo{" "}
                  <strong style={{ color: "var(--pl-text)" }}>
                    {formatOddsValue(mainPick.fairDecimal, oddsFormat)}
                  </strong>
                </span>
                {alt ? (
                  <span className="truncate">
                    También: <strong style={{ color: "var(--pl-text)" }}>{alt.label}</strong> · {(alt.p * 100).toFixed(0)} %
                  </span>
                ) : null}
              </div>
            </div>

            <div className="pl-astro-pick-actions">
              {!live ? <ParlayPickButton pick={mainPick} matchLabel={matchLabel} /> : null}
              <a
                href={studioHref}
                onClick={openStudio}
                className="pl-btn-glass text-xs min-h-11 px-3 inline-flex items-center justify-center gap-1.5 no-underline"
              >
                <span>
                  Ver partido · {countLabel(game.picks.length, "pick", "picks")}
                </span>
                <MaestroIcon name="arrowRight" size={13} />
              </a>
            </div>
          </div>
        ) : (
          <div className="pl-astro-ft-wrap" data-card-locked="">
            <div className="flex items-center gap-2 min-w-0">
              <MaestroIcon name="lock" size={13} />
              <span className="text-xs font-bold" style={{ color: "var(--pl-brand)" }}>
                Pick principal y marcador proyectado
              </span>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={upgradeHref}
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo(upgradeHref);
                }}
                className="pl-btn-accent text-xs min-h-10 px-3 inline-flex items-center gap-1.5 no-underline"
              >
                <MaestroIcon name="unlock" size={12} />
                <span>{hasAccountSession ? "Activar Pase Ultra" : "Pase PitchLab Ultra"}</span>
              </a>
              <a
                href={studioHref}
                onClick={openStudio}
                className="pl-btn-glass text-xs min-h-10 px-3 inline-flex items-center gap-1.5 no-underline"
              >
                <span>Ver partido</span>
                <MaestroIcon name="arrowRight" size={12} />
              </a>
            </div>
          </div>
        )}
      </div>
    </article>
  );
});

function HomeMatchCardsSection({
  groups,
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
        No hay partidos con este filtro. Prueba otro día o «Todas las competiciones».
      </div>
    );
  }

  let remaining = limit;
  const visibleLeagues: Array<ReturnType<typeof groupMatchesByDayAndLeague>[number]["leagues"][number]> = [];
  for (const dayGroup of groups) {
    for (const leagueGroup of dayGroup.leagues) {
      if (remaining <= 0) break;
      const take = leagueGroup.games.slice(0, remaining);
      remaining -= take.length;
      if (take.length > 0) {
        visibleLeagues.push({ ...leagueGroup, games: take });
      }
    }
  }

  return (
    <div className="pl-home-cards pl-astro-leagues">
      {visibleLeagues.map((leagueGroup) => {
        const region = LEAGUE_REGION_LABELS[leagueGroup.league] ?? "Internacional";
        return (
          <section
            key={leagueGroup.league}
            aria-label={leagueGroup.label}
            className="pl-astro-league-block glass-card glass-ring"
            data-league-group={leagueGroup.league}
          >
            <header className="pl-astro-league-head">
              <LeagueBadge
                league={leagueGroup.league}
                label={leagueGroup.label}
                logoUrl={leagueGroup.logoUrl}
                size={26}
              />
              <div className="min-w-0 flex-1">
                <h2 className="pl-astro-league-title">{leagueGroup.label}</h2>
                <span className="pl-astro-league-sub">
                  {region} · {leagueGroup.round}
                </span>
              </div>
              <span className="pl-astro-league-count num">
                {countLabel(leagueGroup.count, "partido", "partidos")}
              </span>
            </header>

            <div className="pl-astro-rows">
              {leagueGroup.games.map((g) => (
                <AstroMatchRow key={g.id} game={g} liveEntry={liveByGameId.get(g.id)} />
              ))}
            </div>
          </section>
        );
      })}

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

const AUTO_PARLAY_QUICK_COUNTS = [2, 3, 4, 5, 6, 8, 10] as const;

function riskToneColor(tone: "success" | "info" | "warning" | "danger"): string {
  if (tone === "success") return "var(--pl-success)";
  if (tone === "warning") return "var(--pl-warning)";
  if (tone === "danger") return "var(--pl-danger)";
  return "var(--pl-brand)";
}

/**
 * Centro unificado de Parlay en la columna derecha:
 * organiza «Tu parlay» (boleto personal con termómetro de riesgo en vivo y armado automático)
 * y «Parlay del día» (selección oficial curada) en dos pestañas claras dentro de un mismo módulo,
 * evitando duplicar tarjetas gigantes y dejando espacio directo para los Picks con mayor probabilidad.
 */
function ParlayHubRail({
  visibleGames,
  allGames,
  selectedDay,
  today,
  isPastDay,
  activeLeague,
}: {
  readonly visibleGames: readonly PlatformGame[];
  readonly allGames: readonly PlatformGame[];
  readonly selectedDay: string;
  readonly today: string;
  readonly isPastDay: boolean;
  readonly activeLeague: LeagueId | null;
}): React.JSX.Element {
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
  const { userTimezone } = usePlatformCore();
  const [activeTab, setActiveTab] = useState<"custom" | "daily">("custom");
  const [risk, setRisk] = useState<RiskBand>(riskPreference);
  const [autoCount, setAutoCount] = useState<number>(3);
  const legs = parlaySummary.legs;
  const prevLegCountRef = useRef<number>(legs.length);
  const customPanelRef = useRef<HTMLDivElement | null>(null);
  const dailyPanelRef = useRef<HTMLDivElement | null>(null);
  const riskHint = RISKS.find((r) => r.id === risk)?.hint ?? "";

  // Cuando el socio agrega una selección desde la lista o desde los picks más probables, muestra su boleto activo.
  useEffect(() => {
    if (legs.length > prevLegCountRef.current) {
      setActiveTab("custom");
    }
    prevLegCountRef.current = legs.length;
  }, [legs.length]);

  useEffect(() => {
    const customEl = customPanelRef.current;
    const dailyEl = dailyPanelRef.current;
    const onCustomMatch = () => setActiveTab("custom");
    const onDailyMatch = () => setActiveTab("daily");
    customEl?.addEventListener("beforematch", onCustomMatch);
    dailyEl?.addEventListener("beforematch", onDailyMatch);
    return () => {
      customEl?.removeEventListener("beforematch", onCustomMatch);
      dailyEl?.removeEventListener("beforematch", onDailyMatch);
    };
  }, []);

  const openGamesCount = useMemo(
    () => visibleGames.filter((g) => g.status !== "FT" && g.status !== "LIVE").length,
    [visibleGames],
  );
  const maxAutoLegs = Math.max(2, openGamesCount);
  const effectiveAutoCount = Math.min(maxAutoLegs, Math.max(2, autoCount));

  const activeRiskInfo = useMemo(() => assessParlayRisk(parlaySummary), [parlaySummary]);

  const previewAutoRisk = useMemo(() => {
    const previewLegs = buildSmartAutoParlay(visibleGames, {
      leagues: [],
      risk,
      legCount: effectiveAutoCount,
      allowSgp: false,
      viewerRole,
    });
    return assessParlayRisk(computeParlaySummary(previewLegs, 1));
  }, [visibleGames, risk, effectiveAutoCount, viewerRole]);

  const autoBuilderControls = (
    <div className="pl-parlay-auto-box">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold" style={{ color: "var(--pl-text-muted)" }}>
          Armar en automático
        </span>
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
          <button
            key={r.id}
            type="button"
            className="seg-btn flex-1"
            aria-pressed={risk === r.id}
            onClick={() => setRisk(r.id)}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-1.5 pt-0.5">
        <div className="flex items-center gap-1" role="group" aria-label="Atajos de selecciones">
          {AUTO_PARLAY_QUICK_COUNTS.filter((c) => c <= maxAutoLegs || c <= 4).map((cnt) => (
            <button
              key={cnt}
              type="button"
              disabled={cnt > maxAutoLegs}
              aria-pressed={effectiveAutoCount === cnt}
              onClick={() => setAutoCount(cnt)}
              className="seg-btn num text-xs px-2 min-h-7 justify-center"
              style={{
                background: effectiveAutoCount === cnt ? "var(--pl-surface-active)" : "var(--pl-surface)",
                border: "1px solid var(--pl-border)",
              }}
            >
              {cnt}
            </button>
          ))}
        </div>
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
      <span className="text-[11px] leading-snug" style={{ color: "var(--pl-text-muted)" }}>
        {riskHint}
      </span>
      <button
        type="button"
        className="pl-btn-primary text-sm min-h-10 px-4 w-full inline-flex items-center justify-center gap-1.5"
        onClick={() =>
          generateAutoParlay({
            leagues: [],
            risk,
            legCount: effectiveAutoCount,
            allowSgp: false,
            games: visibleGames,
          })
        }
      >
        <MaestroIcon name="layers" size={14} />
        <span>Armar {effectiveAutoCount} selecciones</span>
      </button>
    </div>
  );

  return (
    <section
      aria-label="Centro de parlays"
      className="pl-home-rail-card is-parlay glass-card glass-ring"
      data-parlay-hub=""
    >
      {/* Pestañas del módulo de Parlay: Tu parlay vs Parlay del día */}
      <div
        role="tablist"
        aria-label="Opciones de parlay"
        className="pl-parlay-hub-tabs"
        {...({ focusgroup: "tablist nomemory" } as React.HTMLAttributes<HTMLDivElement>)}
      >
        <button
          type="button"
          role="tab"
          id="parlay-hub-tab-custom"
          aria-selected={activeTab === "custom"}
          className="pl-parlay-hub-tab"
          onClick={() => setActiveTab("custom")}
          {...(activeTab === "custom" ? ({ focusgroupstart: "" } as React.ButtonHTMLAttributes<HTMLButtonElement>) : {})}
        >
          <span>Tu parlay</span>
          <span className="pl-parlay-hub-badge num">{legs.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          id="parlay-hub-tab-daily"
          aria-selected={activeTab === "daily"}
          className="pl-parlay-hub-tab"
          onClick={() => setActiveTab("daily")}
          {...(activeTab === "daily" ? ({ focusgroupstart: "" } as React.ButtonHTMLAttributes<HTMLButtonElement>) : {})}
        >
          <MaestroIcon name="sparkles" size={12} />
          <span>Parlay del día</span>
        </button>
      </div>

      {/* Panel 1: Tu parlay personal */}
      <div
        ref={customPanelRef}
        role="tabpanel"
        aria-labelledby="parlay-hub-tab-custom"
        className="pl-parlay-hub-panel"
        {...(activeTab !== "custom"
          ? ({ hidden: "until-found" } as unknown as React.HTMLAttributes<HTMLDivElement>)
          : {})}
      >
        <div className="pl-parlay-hub-panel-body">
          <div className="flex items-center justify-between gap-2">
            <h2 id="home-parlay-title" className="m-0 text-base font-extrabold">
              Tu boleto de parlay
            </h2>
            <span className="pl-pill pl-pill--brand num">
              {countLabel(legs.length, "selección", "selecciones")}
            </span>
          </div>

          {legs.length === 0 ? (
            <>
              <p className="m-0 text-xs leading-relaxed" style={{ color: "var(--pl-text-muted)" }}>
                Toca <strong style={{ color: "var(--pl-text)" }}>+ Parlay</strong> en cualquier partido o en los picks
                más probables de abajo, o genera una combinación inteligente al instante:
              </p>
              {autoBuilderControls}
              <button
                type="button"
                className="pl-parlay-switch-cta"
                onClick={() => setActiveTab("daily")}
              >
                <MaestroIcon name="sparkles" size={13} />
                <span>Ver el Parlay oficial del día curado por el modelo</span>
                <MaestroIcon name="arrowRight" size={12} />
              </button>
            </>
          ) : (
            <>
              <ul className="m-0 p-0 list-none flex flex-col gap-2">
                {legs.map(({ pick }) => {
                  const gm = allGames.find((g) => g.id === pick.gameId);
                  return (
                  <li key={pick.id} className="pl-home-leg">
                    <LeagueBadge
                      league={pick.league}
                      label={pick.leagueLabel}
                      logoUrl={leagueLogoOf(allGames, pick.league)}
                      size={20}
                    />
                    <span className="min-w-0 flex-1 flex flex-col">
                      <strong className="text-sm truncate">{pick.label}</strong>
                      <span className="text-xs truncate num" style={{ color: "var(--pl-text-muted)" }}>
                        {pick.matchLabel} · {gm ? `${shortDateLabel(gm.dayId)} · ${formatGameKickoffTime(gm, userTimezone)}` : pick.kickoffLocal}
                      </span>
                    </span>
                    <span className="num text-[13px] font-bold" style={{ color: "var(--pl-success)" }}>
                      {(pick.p * 100).toFixed(1)} %
                    </span>
                    <button
                      type="button"
                      className="pl-home-icon-btn"
                      aria-label={`Quitar ${pick.label}`}
                      onClick={() => removePickFromParlay(pick.id)}
                    >
                      <MaestroIcon name="x" size={14} />
                    </button>
                  </li>
                  );
                })}
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

              <div className="flex flex-wrap gap-2">
                <a
                  href="/app/parlays"
                  onClick={(e) => {
                    e.preventDefault();
                    navigateTo("/app/parlays");
                  }}
                  className="pl-btn-primary text-sm min-h-10 px-4 flex-1 inline-flex items-center justify-center gap-1.5 no-underline"
                >
                  <span>Abrir en el armador</span>
                  <MaestroIcon name="arrowRight" size={13} />
                </a>
                <button type="button" className="pl-btn-glass text-sm min-h-10 px-3.5" onClick={clearParlay}>
                  Vaciar
                </button>
              </div>

              <details className="pl-parlay-auto-details">
                <summary className="pl-parlay-auto-summary">
                  <MaestroIcon name="layers" size={13} />
                  <span>Reemplazar con parlay automático</span>
                </summary>
                <div className="pt-2.5">{autoBuilderControls}</div>
              </details>
            </>
          )}
        </div>
      </div>

      {/* Panel 2: Parlay oficial del día */}
      <div
        ref={dailyPanelRef}
        role="tabpanel"
        aria-labelledby="parlay-hub-tab-daily"
        className="pl-parlay-hub-panel"
        {...(activeTab !== "daily"
          ? ({ hidden: "until-found" } as unknown as React.HTMLAttributes<HTMLDivElement>)
          : {})}
      >
        <div className="pl-parlay-hub-panel-body">
          <OfficialDailyParlayCard
            games={allGames}
            selectedDay={selectedDay}
            today={today}
            isPastDay={isPastDay}
            activeLeague={activeLeague}
            embedded
            onLoadedToParlay={() => setActiveTab("custom")}
          />
        </div>
      </div>
    </section>
  );
}

/** Tarjeta individual dentro del riel derecho de «Picks con mayor probabilidad». */
function TopPickRailItem({
  rank,
  game,
  pick,
}: {
  readonly rank: number;
  readonly game: PlatformGame;
  readonly pick: MatchPick;
}): React.JSX.Element {
  const { oddsFormat, userTimezone } = usePlatformCore();
  const { addPickToParlay, removePickFromParlay, navigateTo } = usePlatformActions();
  const inParlay = useIsPickInParlay(pick.id);
  const time = formatGameKickoffTime(game, userTimezone);
  const studioHref = `/app/${game.league}/games/${game.id}`;

  return (
    <article className="pl-rail-top-pick">
      <div className="flex items-center justify-between gap-2 text-xs min-w-0">
        <a
          href={studioHref}
          onClick={(e) => {
            e.preventDefault();
            navigateTo(studioHref);
          }}
          className="inline-flex items-center gap-1.5 min-w-0 no-underline"
          style={{ color: "var(--pl-text-secondary)" }}
        >
          <span className="pl-rail-rank num">#{rank}</span>
          <TeamBadge
            league={game.league}
            slug={game.home.slug}
            name={game.home.name}
            logoUrl={game.home.logoUrl}
            size={18}
          />
          <span className="font-semibold truncate">{game.home.shortName}</span>
          <span style={{ color: "var(--pl-text-muted)" }}>vs</span>
          <TeamBadge
            league={game.league}
            slug={game.away.slug}
            name={game.away.name}
            logoUrl={game.away.logoUrl}
            size={18}
          />
          <span className="font-semibold truncate">{game.away.shortName}</span>
        </a>
        <span className="num text-[11px] shrink-0" style={{ color: "var(--pl-text-muted)" }}>
          {shortDateLabel(game.dayId)} · {time}
        </span>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <strong className="text-sm leading-snug min-w-0">{pick.label}</strong>
        <strong className="num text-lg font-extrabold shrink-0" style={{ color: "var(--pl-success)" }}>
          {(pick.p * 100).toFixed(1)} %
        </strong>
      </div>

      <PBar p={pick.p} lead />

      <div className="flex items-center justify-between gap-2 pt-0.5">
        <span className="text-xs num" style={{ color: "var(--pl-text-muted)" }}>
          Momio justo{" "}
          <strong style={{ color: "var(--pl-text)" }}>
            {formatOddsValue(pick.fairDecimal, oddsFormat)}
          </strong>
        </span>
        <button
          type="button"
          className={`pl-home-parlay-btn is-sm ${inParlay ? "is-on" : ""}`.trim()}
          aria-pressed={inParlay}
          aria-label={`${inParlay ? "Quitar del parlay" : "Agregar al parlay"}: ${pick.label}`}
          onClick={() => (inParlay ? removePickFromParlay(pick.id) : addPickToParlay(pick))}
        >
          <MaestroIcon name={inParlay ? "check" : "plus"} size={13} />
          <span>{inParlay ? "En parlay" : "+ Parlay"}</span>
        </button>
      </div>
    </article>
  );
}

/** Riel derecho: Los picks principales con mayor probabilidad estimada en el filtro activo. */
function TopPicksRail({
  items,
}: {
  readonly items: ReadonlyArray<{ game: PlatformGame; pick: MatchPick }>;
}): React.JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <section
      aria-labelledby="home-top-picks-title"
      className="pl-home-rail-card glass-card glass-ring"
      data-top-picks-rail=""
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <h2 id="home-top-picks-title" className="m-0 text-base font-extrabold">
            Picks con mayor probabilidad
          </h2>
          <span className="pl-pill pl-pill--success num">Top {items.length}</span>
        </div>
        <span className="text-xs leading-relaxed" style={{ color: "var(--pl-text-muted)" }}>
          Las selecciones principales más sólidas del modelo hoy.
        </span>
      </div>
      <div className="flex flex-col gap-2.5">
        {items.map(({ game, pick }, idx) => (
          <TopPickRailItem key={pick.id} rank={idx + 1} game={game} pick={pick} />
        ))}
      </div>
    </section>
  );
}

function ValueRail({
  items,
}: {
  readonly items: ReadonlyArray<{ game: PlatformGame; pick: MatchPick }>;
}): React.JSX.Element | null {
  const { oddsFormat } = usePlatformCore();
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="home-value-title" className="pl-home-rail-card glass-card glass-ring">
      <div className="flex flex-col gap-1">
        <h2 id="home-value-title" className="m-0 text-base font-extrabold">
          Donde la casa paga más
        </h2>
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
              <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                justo {formatOddsValue(pick.fairDecimal, oddsFormat)}
              </span>
              <strong className="text-[15px]">
                casa {formatOddsValue(pick.marketDecimal ?? pick.fairDecimal, oddsFormat)}
              </strong>
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
        <h2 id="home-lab-title" className="m-0 text-base font-extrabold">
          Mi récord
        </h2>
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
        <p className="m-0 text-xs leading-relaxed" style={{ color: "var(--pl-text-muted)" }}>
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

const STATUS_FILTERS: ReadonlyArray<{ id: MatchStatusFilter; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "live", label: "En vivo" },
  { id: "upcoming", label: "Próximos" },
  { id: "finished", label: "Finalizados" },
];

/**
 * Inicio del Club con arquitectura limpia estilo Astranalisis + inteligencia completa PitchLab:
 * 1) Barra superior: pestañas de Deporte + tira rápida de partidos en vivo/del día.
 * 2) Columna izquierda: «Mis competiciones» (ligas + favoritas) y «Mis equipos».
 * 3) Columna central: «Partidos» agrupados por liga con barras 1·X·2 (`ProbSplit`), `PBar` de pick principal,
 *    resultado más probable, pick alternativo, líneas clave y acciones.
 * 4) Columna derecha: Centro unificado de Parlay («Tu parlay» + «Parlay del día» en pestañas),
 *    seguido de «Picks con mayor probabilidad», «Donde la casa paga más» y «Mi récord».
 */
export function HomeClubView({
  initialDay,
  initialToday,
  initialSport = ALL,
  initialLeague = ALL,
  liveBoardOverride,
}: HomeClubViewProps = {}): React.JSX.Element {
  const { dataset, viewerRole, userTimezone } = usePlatformCore();
  const { parlaySummary } = usePlatform();
  const { navigateTo } = usePlatformActions();
  const games = dataset.games;
  const today = useMemo(
    () => initialToday ?? todayId(userTimezone || "America/Mexico_City"),
    [initialToday, userTimezone],
  );
  const [chosenDay, setDay] = useState<DaySelection | null>(initialDay ?? null);
  const [sport, setSport] = useState<SportFilter>(initialSport);
  const [league, setLeague] = useState<LeagueFilter>(initialLeague);
  const [statusFilter, setStatusFilter] = useState<MatchStatusFilter>("all");
  const [favLeagues, setFavLeagues] = useState<LeagueId[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("pl-fav-leagues");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setFavLeagues(parsed as LeagueId[]);
      }
    } catch (err) {
      void err;
    }
  }, []);

  const toggleFavLeague = useCallback((lg: LeagueId) => {
    setFavLeagues((prev) => {
      const next = prev.includes(lg) ? prev.filter((x) => x !== lg) : [...prev, lg];
      try {
        window.localStorage.setItem("pl-fav-leagues", JSON.stringify(next));
      } catch (err) {
        void err;
      }
      return next;
    });
  }, []);

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
    if (chosenDay && chosenDay !== UPCOMING) return chosenDay;
    if (games.some((g) => g.dayId >= today)) return today;
    const last = games.reduce<string>((acc, g) => (g.dayId > acc ? g.dayId : acc), "");
    return last || today;
  }, [chosenDay, games, today]);

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
  const sportGames = useMemo(
    () =>
      sport === ALL
        ? dayGames
        : dayGames.filter((g) => matchesSportFilter(g, sport)),
    [dayGames, sport],
  );
  const leagues = useMemo(() => {
    const base = leaguesIn(sportGames);
    return [...base].sort((a, b) => {
      const aFav = favLeagues.includes(a) ? 0 : 1;
      const bFav = favLeagues.includes(b) ? 0 : 1;
      return aFav - bFav;
    });
  }, [sportGames, favLeagues]);

  const visible = useMemo(() => filterGames(dayGames, sport, league), [dayGames, sport, league]);

  const isUnlocked = useCallback(
    (pick: MatchPick, game: PlatformGame) => isPickUnlocked(pick, game.status, viewerRole),
    [viewerRole],
  );
  const top = useMemo(() => topPrincipalPicks(visible, 4, isUnlocked), [visible, isUnlocked]);
  const value = useMemo(() => valuePicks(visible, isUnlocked), [visible, isUnlocked]);

  const statusFilteredGames = useMemo(() => {
    if (statusFilter === "all") return visible;
    if (statusFilter === "ai") {
      return visible
        .filter((g) => (g.picks[0]?.p ?? 0) >= 0.58)
        .slice()
        .sort((a, b) => (b.picks[0]?.p ?? 0) - (a.picks[0]?.p ?? 0));
    }
    return visible.filter((g) => {
      const entry = liveByGameId.get(g.id);
      const isLive = (entry ? isLivePhaseActive(entry.phase) : false) || String(g.status) === "LIVE";
      const isFt = !isLive && (g.status === "FT" || entry?.phase === "final");
      if (statusFilter === "live") return isLive;
      if (statusFilter === "finished") return isFt;
      return !isLive && !isFt;
    });
  }, [visible, statusFilter, liveByGameId]);

  const dayGroups = useMemo(
    () => groupMatchesByDayAndLeague(statusFilteredGames),
    [statusFilteredGames],
  );

  const orderedChips = useMemo(() => {
    return visible
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
  }, [visible, liveByGameId]);

  const emptyJumpTarget = useMemo<{ dayId: string; resetFilters: boolean } | null>(() => {
    if (orderedChips.length > 0) return null;
    const futureFiltered = dayOptions.find(
      (opt) => opt.key > day && filterGames(gamesForSelection(games, opt.key, today), sport, league).length > 0,
    );
    if (futureFiltered) return { dayId: futureFiltered.key, resetFilters: false };
    const futureAny = dayOptions.find((opt) => opt.key > day && opt.count > 0);
    if (futureAny) return { dayId: futureAny.key, resetFilters: true };
    const anyFiltered = dayOptions.find(
      (opt) => opt.key !== day && filterGames(gamesForSelection(games, opt.key, today), sport, league).length > 0,
    );
    if (anyFiltered) return { dayId: anyFiltered.key, resetFilters: false };
    const anyDay = dayOptions.find((opt) => opt.key !== day && opt.count > 0);
    return anyDay ? { dayId: anyDay.key, resetFilters: true } : null;
  }, [orderedChips.length, dayOptions, day, games, today, sport, league]);

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

  const followedTeams = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ league: LeagueId; slug: string; name: string; logoUrl?: string }> = [];
    for (const { pick } of parlaySummary.legs) {
      const g = games.find((gm) => gm.id === pick.gameId);
      if (!g) continue;
      for (const side of [g.home, g.away]) {
        const key = `${g.league}.${side.slug}`;
        if (!seen.has(key)) {
          seen.add(key);
          list.push({ league: g.league, slug: side.slug, name: side.name, logoUrl: side.logoUrl });
        }
      }
    }
    return list.slice(0, 6);
  }, [parlaySummary.legs, games]);

  const isPast = day < today;
  const centerParts = formatCenterDayParts(day, today);
  const centerAria = day === today ? "Hoy, día actual" : `${centerParts.top}, volver a hoy`;

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
        {/* 1) Barra superior limpia estilo Astranalisis: pestañas de Deporte + tira rápida de partidos */}
        <section aria-label="Filtros de la jornada" className="pl-astro-topbar" data-home-filterbar="">
          <div className="pl-astro-sportbar-wrap">
            <div role="group" aria-label="Elegir deporte" className="pl-astro-sports">
              {HOME_SPORTS.map((def) => {
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
                    className={`pl-astro-sport-tab ${on ? "is-on" : ""} ${isEmpty ? "is-empty" : ""} ${def.soon ? "is-soon" : ""}`.trim()}
                    aria-pressed={def.soon ? undefined : on}
                    aria-label={aria}
                    data-sport-filter={def.id}
                    onClick={(e) => {
                      if (def.soon) return;
                      pickSport(def.id as SportFilter);
                      e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
                    }}
                  >
                    <span className="pl-astro-sport-icon" aria-hidden="true">
                      <SportThumb def={def} />
                    </span>
                    <strong className="pl-astro-sport-label">{def.label}</strong>
                    <span className="pl-astro-sport-count num">{badgeText}</span>
                  </button>
                );
              })}
            </div>
          </div>

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
                  {orderedChips.map(({ game, live, score }) => {
                    const homeCode = teamCode(game.home);
                    const awayCode = teamCode(game.away);
                    const time = formatGameKickoffTime(game, userTimezone);
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
                            <span className="pl-home-chip-time num">{shortDateLabel(game.dayId)} · {time}</span>
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
                    onClick={() => jumpDay(emptyJumpTarget.dayId, emptyJumpTarget.resetFilters)}
                  >
                    {formatJumpDayLabel(emptyJumpTarget.dayId, today)}
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </section>

        {/* 2) Cuerpo de 3 columnas: Mis competiciones (izq.) + Partidos con barras (centro) + Centro de Parlays y Picks probables (der.) */}
        <div className="pl-astro-workspace">
          <aside aria-label="Mis competiciones y equipos" className="pl-astro-left">
            <div className="pl-astro-sideblock">
              <span className="pl-astro-sidehead">Mis competiciones</span>
              <div role="group" aria-label="Elegir liga" className="pl-astro-comp-list">
                <button
                  type="button"
                  className={`pl-astro-comp-item ${league === ALL ? "is-on" : ""}`.trim()}
                  aria-pressed={league === ALL}
                  data-league-filter={ALL}
                  onClick={() => setLeague(ALL)}
                >
                  <span className="truncate font-bold">Todas las ligas</span>
                  <span className="pl-astro-comp-count num">{sportGames.length}</span>
                </button>
                {leagues.map((l) => {
                  const on = league === l;
                  const n = sportGames.filter((g) => g.league === l).length;
                  const label = leagueLabelOf(dayGames, l);
                  const isFav = favLeagues.includes(l);
                  return (
                    <div key={l} className={`pl-astro-comp-row ${on ? "is-on" : ""}`.trim()}>
                      <button
                        type="button"
                        className={`pl-astro-comp-item ${on ? "is-on" : ""}`.trim()}
                        aria-pressed={on}
                        data-league-filter={l}
                        onClick={() => setLeague(l)}
                      >
                        <LeagueBadge league={l} label={label} logoUrl={leagueLogoOf(dayGames, l)} size={22} />
                        <span className="truncate font-semibold flex-1 text-left">{label}</span>
                        <span className="pl-astro-comp-count num">{n}</span>
                      </button>
                      <button
                        type="button"
                        className={`pl-astro-fav-btn ${isFav ? "is-fav" : ""}`.trim()}
                        aria-label={isFav ? `Quitar ${label} de favoritas` : `Fijar ${label} en favoritas`}
                        aria-pressed={isFav}
                        onClick={() => toggleFavLeague(l)}
                      >
                        <span aria-hidden="true">{isFav ? "★" : "☆"}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pl-astro-sideblock">
              <span className="pl-astro-sidehead">Mis equipos</span>
              {followedTeams.length === 0 ? (
                <p className="m-0 text-xs leading-relaxed" style={{ color: "var(--pl-text-muted)" }}>
                  Los equipos de tus partidos en el parlay aparecerán aquí.
                </p>
              ) : (
                <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
                  {followedTeams.map((tm) => (
                    <li key={`${tm.league}.${tm.slug}`}>
                      <a
                        href={`/app/${tm.league}/teams/${tm.slug}`}
                        onClick={(e) => {
                          e.preventDefault();
                          navigateTo(`/app/${tm.league}/teams/${tm.slug}`);
                        }}
                        className="pl-astro-comp-item no-underline"
                      >
                        <TeamBadge league={tm.league} slug={tm.slug} name={tm.name} logoUrl={tm.logoUrl} size={20} />
                        <span className="truncate text-xs font-semibold">{tm.name}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>

          <div className="pl-astro-center">
            <div className="pl-astro-toolbar">
              <div className="pl-astro-toolbar-left">
                <div className="flex items-center gap-2.5">
                  <h1 className="pl-astro-h1">Partidos</h1>
                  <span className="pl-astro-total-pill num">
                    {countLabel(statusFilteredGames.length, "partido", "partidos")}
                  </span>
                </div>

                <div className="pl-astro-status-pills" role="group" aria-label="Estado de los partidos">
                  {STATUS_FILTERS.map((sf) => (
                    <button
                      key={sf.id}
                      type="button"
                      className={`pl-astro-status-btn ${statusFilter === sf.id ? "is-on" : ""}`.trim()}
                      aria-pressed={statusFilter === sf.id}
                      onClick={() => setStatusFilter(sf.id)}
                    >
                      {sf.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`pl-astro-status-btn is-ai ${statusFilter === "ai" ? "is-on" : ""}`.trim()}
                    aria-pressed={statusFilter === "ai"}
                    onClick={() => setStatusFilter((prev) => (prev === "ai" ? "all" : "ai"))}
                  >
                    <MaestroIcon name="sparkles" size={12} />
                    <span>Con IA</span>
                  </button>
                </div>
              </div>

              <div role="group" aria-label="Elegir día" className="pl-astro-datebar">
                <div className="pl-home-dayseg" role="group" aria-label="Control del día">
                  <button
                    type="button"
                    className="pl-home-dayseg-arrow"
                    aria-label="Día anterior"
                    disabled={!prevDayOption}
                    data-day-prev=""
                    onClick={() => prevDayOption && pickDay(prevDayOption.key)}
                  >
                    <span aria-hidden="true">‹</span>
                  </button>
                  <button
                    type="button"
                    className={`pl-home-dayseg-center ${day === today ? "is-today" : ""}`.trim()}
                    aria-label={centerAria}
                    data-day-center=""
                    onClick={() => pickDay(today)}
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
                    onClick={() => nextDayOption && pickDay(nextDayOption.key)}
                  >
                    <span aria-hidden="true">›</span>
                  </button>
                </div>
              </div>
            </div>

            <HomeMatchCardsSection groups={dayGroups} today={today} liveByGameId={liveByGameId} />
          </div>

          <aside aria-label="Centro de parlays, picks con mayor probabilidad y récord" className="pl-home-rail">
            <ParlayHubRail
              visibleGames={visible}
              allGames={dataset.games}
              selectedDay={day}
              today={today}
              isPastDay={isPast}
              activeLeague={league === ALL ? null : league}
            />
            <TopPicksRail items={top} />
            <ValueRail items={value} />
            <LabRail />
          </aside>
        </div>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
