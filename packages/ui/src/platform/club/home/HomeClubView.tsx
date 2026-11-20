"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  canonicalGameHref,
  canonicalTeamHref,
  formatOddsCaptureEs,
  isLivePhaseActive,
  sportHasDraw,
  sportScoringUnit,
  type LeagueId,
  type LiveScoreboard,
  type LiveScoreboardEntry,
} from "@pitchlab/contracts";
import { usePackIconBase } from "../../../pack-icon-theme";
import { LeagueBadge, PBar, ProbSplit, TeamBadge } from "../../../sports";
import { formatOddsValue, isPickUnlocked, isPreGameIntelUnlocked } from "../../access-guard";
import { formatKickoffByTimezone } from "../account/account-helpers";
import { ConfidenceChip } from "../../components/ConfidenceChip";
import { LivePicksTrackerStrip } from "../../components/LivePicksTrackerStrip";
import {
  ParlayPickButton,
  formatCountsHint,
  formatGoalLineHint,
} from "../../components/MatchList";
import { AtmosphereStage, ClubWorkspaceShell } from "../../components/ShellChrome";
import { useLiveScoreboard } from "../../live/live-store";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import { TopLayerModalDialog } from "../../components/PlatformOverlays";
import { teamTopicKey, useFollowedTopics } from "../community-ui";
import {
  useHomeNavFilter,
  useIsPickInParlay,
  useJournalEntries,
  useParlayState,
  usePlatformActions,
  usePlatformCore,
  useWatchlistGameIds,
} from "../../platform-provider";
import { OfficialDailyParlayCard } from "./OfficialDailyParlayCard";
import {
  assessParlayRisk,
  buildSmartAutoParlay,
  computeParlaySummary,
} from "../../parlay-engine";
import { profileRecord } from "../../profile-stats";
import type { MatchPick, PlatformGame, RiskBand } from "../../types";
import { HomeSportStrip } from "./HomeSportStrip";
import {
  ALL,
  UPCOMING,
  addDays,
  alternativePick,
  buildDayOptions,
  dayNumber,
  filterGames,
  gamesForSelection,
  getTrendingMatches,
  groupMatchesByDayAndLeague,
  leaguesIn,
  longDayLabel,
  matchesSportFilter,
  mostLikelyOutcome,
  resolveHomeDay,
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

function formatLiveChipPhase(entry?: LiveScoreboardEntry): string {
  if (!entry) return "En vivo";
  if (entry.phase === "halftime") return "Descanso";
  if (entry.phase === "penalties") return "Penales";
  const clk = entry.clock?.trim();
  if (clk) {
    return clk.endsWith("'") ? clk : `${clk}'`;
  }
  return "En vivo";
}

function LiveSportBallIcon({ sport }: { sport: PlatformGame["sport"] }): React.JSX.Element {
  const iconBase = usePackIconBase();
  const key =
    sport === "basketball"
      ? "basketball"
      : sport === "american-football"
        ? "american-football"
        : sport === "ice-hockey"
          ? "hockey"
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

const SHORT_MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;
const FULL_MONTHS_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;
const CAL_WEEKDAYS_ES = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"] as const;

function parseIsoYearMonth(isoDay: string): { year: number; monthIndex: number } {
  const m = /^(\d{4})-(\d{2})/.exec(isoDay);
  if (!m) return { year: 2026, monthIndex: 10 };
  return {
    year: Number(m[1]),
    monthIndex: Math.max(0, Math.min(11, Number(m[2]) - 1)),
  };
}

function buildCalendarMonthCells(year: number, monthIndex: number): Array<{ dayNum: number; iso: string } | null> {
  const firstDow = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const mm = String(monthIndex + 1).padStart(2, "0");
  const cells: Array<{ dayNum: number; iso: string } | null> = [];
  for (let i = 0; i < firstDow; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push({
      dayNum: d,
      iso: `${year}-${mm}-${String(d).padStart(2, "0")}`,
    });
  }
  return cells;
}

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
      .querySelector<HTMLElement>("a[data-card-open], a.pl-mlist-matchup, a[href*='/g/'], a[href*='/games/']")
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
        return { game, live, score, entry };
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
    if (el) el.scrollLeft = 0;
  }, [sport, league, day]);

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
  }, [syncChipsScroll, orderedChips, day, league, sport]);

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
                {orderedChips.map(({ game, live, score, entry }) => {
                  const homeCode = teamCode(game.home);
                  const awayCode = teamCode(game.away);
                  const time = formatGameKickoffTime(game, userTimezone);
                  const scoreText = score ? `${score.home} - ${score.away}` : null;
                  const livePhaseLabel = formatLiveChipPhase(entry);
                  return (
                    <button
                      key={game.id}
                      type="button"
                      className={`pl-home-chip ${live ? "is-live" : ""}`.trim()}
                      data-match-chip={game.id}
                      data-chip-league={game.league}
                      data-chip-live={live ? "true" : undefined}
                      aria-label={`${live ? `En vivo (${livePhaseLabel})` : time}: ${game.home.shortName} contra ${game.away.shortName}${scoreText ? `, ${scoreText}` : ""}`}
                      onClick={() => scrollToMatchCard(game.id)}
                    >
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
                            <span className="pl-home-chip-score is-live num">
                              {scoreText ?? "0 - 0"}
                            </span>
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
  "fifa-world-cup": "Internacional",
  "world-cup-qualifiers": "Internacional",
  "fifa-friendlies": "Internacional",
  "copa-america": "Sudamérica",
  "uefa-euro": "Europa",
  "uefa-nations-league": "Europa",
  "concacaf-nations-league": "Norte y Centroamérica",
  "concacaf-gold-cup": "Norte y Centroamérica",
  afcon: "África",
  "afc-asian-cup": "Asia",
};

const ALL_KNOWN_COUNTRIES: readonly string[] = [
  "México",
  "Inglaterra",
  "España",
  "Alemania",
  "Italia",
  "Francia",
  "Estados Unidos",
  "Estados Unidos y Canadá",
  "Europa",
  "Sudamérica",
  "Norte y Centroamérica",
  "África",
  "Asia",
  "Internacional",
];

type MatchStatusFilter = "all" | "live" | "upcoming" | "finished";
type ModelSignalFilter = "all" | "high_confidence" | "value";
type HomeBoardView = "all" | "favorites" | "competitions";

function leagueRegionOf(league: string): string {
  return LEAGUE_REGION_LABELS[league] ?? "Internacional";
}

/**
 * Fila enriquecida de partido dentro del bloque de su competición:
 * conserva la limpieza de agrupación por liga pero incluye
 * las barras visuales (`ProbSplit` 1·X·2 / Ganador + `PBar` del pick principal),
 * enlaces directos a los perfiles de equipo, conmutador opcional de momios,
 * récords, resultado más probable, pick alternativo, líneas clave y acciones.
 */
const AstroMatchRow = React.memo(function AstroMatchRow({
  game,
  liveEntry,
  showOdds = false,
}: {
  readonly game: PlatformGame;
  readonly liveEntry?: LiveScoreboardEntry;
  readonly showOdds?: boolean;
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
  const studioHref = canonicalGameHref(game.league, game);
  const homeHref = canonicalTeamHref(game.league, game.home.slug);
  const awayHref = canonicalTeamHref(game.league, game.away.slug);
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

  const openTeam = (href: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setAuraFromGame(game);
    navigateTo(href);
  };

  return (
    <article
      className={`pl-astro-row ${live ? "is-live" : ""} ${isFinished ? "is-finished" : ""}`.trim()}
      data-game-card={game.id}
      onMouseEnter={() => setAuraFromGame(game)}
    >
      {/* Cabecera compacta de la fila: hora/estado, sede/ronda y chip de confianza */}
      <div className="pl-astro-row-top">
        <a
          href={studioHref}
          onClick={openStudio}
          data-card-open=""
          aria-label={`Ver partido ${matchLabel}`}
          className="pl-astro-row-meta num no-underline"
        >
          {live ? (
            <span className="pl-astro-live-pill pl-home-card-live">
              <span className="pl-home-live-sport" aria-hidden="true">
                <LiveSportBallIcon sport={game.sport} />
              </span>
              <span className="pl-home-live-dot" aria-hidden="true" />
              <span>{formatLiveChipPhase(liveEntry)}</span>
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
        </a>

        {!isFinished ? <ConfidenceChip game={game} /> : null}
      </div>

      {/* Cuerpo principal: Equipos + Récord + Proyección a la izquierda | Barra 1·X·2 y resultado más probable a la derecha */}
      <div className="pl-astro-row-body">
        <div className="pl-astro-matchup-box">
          <div className="pl-astro-col-teams">
            <div className="pl-astro-team-line">
              <TeamBadge
                league={game.league}
                slug={game.home.slug}
                name={game.home.name}
                logoUrl={game.home.logoUrl}
                size={24}
              />
              <div className="pl-astro-team-info">
                <a
                  href={homeHref}
                  onClick={openTeam(homeHref)}
                  className={`pl-team-link pl-astro-team-name ${homeStrong ? "is-strong" : ""}`.trim()}
                >
                  {game.home.name}
                </a>
                <div className="pl-astro-team-sub">
                  {!game.neutralSite ? <span className="pl-side-tag is-home">Local</span> : null}
                  {game.home.record ? <span className="pl-astro-team-rec">{game.home.record}</span> : null}
                </div>
              </div>
              <a
                href={studioHref}
                onClick={openStudio}
                tabIndex={-1}
                aria-hidden="true"
                className={`pl-astro-team-score num no-underline ${homeStrong ? "is-strong" : ""}`.trim()}
              >
                {homeVal}
              </a>
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
                <a
                  href={awayHref}
                  onClick={openTeam(awayHref)}
                  className={`pl-team-link pl-astro-team-name ${awayStrong ? "is-strong" : ""}`.trim()}
                >
                  {game.away.name}
                </a>
                <div className="pl-astro-team-sub">
                  {!game.neutralSite ? <span className="pl-side-tag">Visita</span> : null}
                  {game.away.record ? <span className="pl-astro-team-rec">{game.away.record}</span> : null}
                </div>
              </div>
              <a
                href={studioHref}
                onClick={openStudio}
                tabIndex={-1}
                aria-hidden="true"
                className={`pl-astro-team-score num no-underline ${awayStrong ? "is-strong" : ""}`.trim()}
              >
                {awayVal}
              </a>
            </div>
          </div>

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

            {showOdds && unlocked ? (
              <div className="pl-astro-odds-strip num" aria-label="Momios justos por resultado">
                <span className={`pl-astro-odd-pill ${outcome.side === "home" ? "is-best" : ""}`.trim()}>
                  <small>1</small>
                  <strong>{ph > 0.01 ? formatOddsValue(1 / ph, oddsFormat) : "—"}</strong>
                </span>
                {hasDraw ? (
                  <span className={`pl-astro-odd-pill ${outcome.side === "draw" ? "is-best" : ""}`.trim()}>
                    <small>X</small>
                    <strong>{pd > 0.01 ? formatOddsValue(1 / pd, oddsFormat) : "—"}</strong>
                  </span>
                ) : null}
                <span className={`pl-astro-odd-pill ${outcome.side === "away" ? "is-best" : ""}`.trim()}>
                  <small>2</small>
                  <strong>{pa > 0.01 ? formatOddsValue(1 / pa, oddsFormat) : "—"}</strong>
                </span>
              </div>
            ) : null}

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
                {showOdds && mainPick.marketDecimal ? (
                  <span>
                    Casa{" "}
                    <strong style={{ color: "var(--pl-brand)" }}>
                      {formatOddsValue(mainPick.marketDecimal, oddsFormat)}
                    </strong>
                  </span>
                ) : null}
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
  showOdds = false,
  boardView = "all",
  favoriteLeagueSet,
  onToggleFavoriteLeague,
  onResetFilters,
  hasActiveFilters = false,
}: {
  readonly groups: ReturnType<typeof groupMatchesByDayAndLeague>;
  readonly today: string;
  readonly liveByGameId: ReadonlyMap<string, LiveScoreboardEntry>;
  readonly showOdds?: boolean;
  readonly boardView?: HomeBoardView;
  readonly favoriteLeagueSet: ReadonlySet<string>;
  readonly onToggleFavoriteLeague: (lg: LeagueId) => void;
  readonly onResetFilters?: () => void;
  readonly hasActiveFilters?: boolean;
}): React.JSX.Element {
  const { navigateTo } = usePlatformActions();
  const totalGames = groups.reduce((sum, d) => sum + d.count, 0);
  const [limit, setLimit] = useState<number>(INITIAL_HOME_CARDS_LIMIT);
  const [collapsedLeagues, setCollapsedLeagues] = useState<ReadonlySet<string>>(() => new Set());

  const toggleCollapseLeague = useCallback((lg: string) => {
    setCollapsedLeagues((prev) => {
      const next = new Set(prev);
      if (next.has(lg)) next.delete(lg);
      else next.add(lg);
      return next;
    });
  }, []);

  if (groups.length === 0) {
    return (
      <div
        className="glass-card glass-ring rounded-2xl p-7 text-center text-sm space-y-3"
        style={{ color: "var(--pl-text-muted)" }}
      >
        <p className="m-0">
          {boardView === "favorites"
            ? "Hoy no hay partidos en tus ligas o equipos favoritos con este filtro."
            : "No hay partidos con este filtro. Prueba otro día o limpia los filtros activos."}
        </p>
        {hasActiveFilters && onResetFilters ? (
          <div>
            <button
              type="button"
              className="pl-btn-glass text-xs min-h-10 px-4"
              onClick={onResetFilters}
            >
              Restablecer filtros
            </button>
          </div>
        ) : null}
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
        const region = leagueRegionOf(leagueGroup.league);
        const leagueHref = `/app/${leagueGroup.league}`;
        const isFav = favoriteLeagueSet.has(leagueGroup.league);
        const isCollapsed = boardView === "competitions" && collapsedLeagues.has(leagueGroup.league);
        const liveInLeague = leagueGroup.games.reduce((acc, g) => {
          const entry = liveByGameId.get(g.id);
          const isLive = (entry ? isLivePhaseActive(entry.phase) : false) || String(g.status) === "LIVE";
          return acc + (isLive ? 1 : 0);
        }, 0);

        return (
          <section
            key={leagueGroup.league}
            aria-label={leagueGroup.label}
            className="pl-astro-league-block glass-card glass-ring"
            data-league-group={leagueGroup.league}
          >
            <header className={`pl-astro-league-head ${isCollapsed ? "is-collapsed" : ""}`.trim()}>
              <a
                href={leagueHref}
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo(leagueHref);
                }}
                className="pl-league-link pl-astro-league-link"
              >
                <LeagueBadge
                  league={leagueGroup.league}
                  label={leagueGroup.label}
                  logoUrl={leagueGroup.logoUrl}
                  size={26}
                />
                <div className="min-w-0 flex-1">
                  <h2 className="pl-astro-league-title">{leagueGroup.label}</h2>
                  <span className="pl-astro-league-sub">
                    {region}
                    {leagueGroup.round ? ` · ${leagueGroup.round}` : ""}
                  </span>
                </div>
              </a>

              <div className="pl-astro-league-head-actions">
                {liveInLeague > 0 ? (
                  <span className="pl-astro-league-live num">{liveInLeague} en vivo</span>
                ) : null}
                <span className="pl-astro-league-count num">
                  {countLabel(leagueGroup.count, "partido", "partidos")}
                </span>
                <button
                  type="button"
                  className={`pl-astro-fav-btn ${isFav ? "is-fav" : ""}`.trim()}
                  aria-pressed={isFav}
                  aria-label={
                    isFav
                      ? `Quitar ${leagueGroup.label} de favoritos`
                      : `Agregar ${leagueGroup.label} a favoritos`
                  }
                  title={isFav ? "En favoritos" : "Agregar a favoritos"}
                  onClick={() => onToggleFavoriteLeague(leagueGroup.league)}
                >
                  <MaestroIcon name="star" size={14} />
                </button>
                {boardView === "competitions" ? (
                  <button
                    type="button"
                    className={`pl-astro-collapse-btn ${isCollapsed ? "is-collapsed" : ""}`.trim()}
                    aria-expanded={!isCollapsed}
                    aria-label={isCollapsed ? `Mostrar partidos de ${leagueGroup.label}` : `Contraer ${leagueGroup.label}`}
                    onClick={() => toggleCollapseLeague(leagueGroup.league)}
                  >
                    <MaestroIcon name="chevronDown" size={15} />
                  </button>
                ) : null}
              </div>
            </header>

            {!isCollapsed ? (
              <div className="pl-astro-rows">
                {leagueGroup.games.map((g) => (
                  <AstroMatchRow
                    key={g.id}
                    game={g}
                    liveEntry={liveByGameId.get(g.id)}
                    showOdds={showOdds}
                  />
                ))}
              </div>
            ) : null}
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

interface HomeFilterModalOptionLeague {
  readonly id: LeagueId;
  readonly label: string;
  readonly region: string;
  readonly logoUrl?: string;
  readonly count: number;
}

function HomeFiltersDialog({
  open,
  onClose,
  statusFilter,
  signalFilter,
  selectedCountries,
  selectedLeagues,
  countryOptions,
  leagueOptions,
  onApply,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly statusFilter: MatchStatusFilter;
  readonly signalFilter: ModelSignalFilter;
  readonly selectedCountries: readonly string[];
  readonly selectedLeagues: readonly LeagueId[];
  readonly countryOptions: ReadonlyArray<{ name: string; count: number }>;
  readonly leagueOptions: readonly HomeFilterModalOptionLeague[];
  readonly onApply: (next: {
    status: MatchStatusFilter;
    signal: ModelSignalFilter;
    countries: string[];
    leagues: LeagueId[];
  }) => void;
}): React.JSX.Element | null {
  const titleId = useId();
  const [draftStatus, setDraftStatus] = useState<MatchStatusFilter>(statusFilter);
  const [draftSignal, setDraftSignal] = useState<ModelSignalFilter>(signalFilter);
  const [draftCountries, setDraftCountries] = useState<string[]>([...selectedCountries]);
  const [draftLeagues, setDraftLeagues] = useState<LeagueId[]>([...selectedLeagues]);
  const [search, setSearch] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setDraftStatus(statusFilter);
    setDraftSignal(signalFilter);
    setDraftCountries([...selectedCountries]);
    setDraftLeagues([...selectedLeagues]);
    setSearch("");
  }, [open, statusFilter, signalFilter, selectedCountries, selectedLeagues]);

  const q = search.trim().toLowerCase();
  const filteredCountries = useMemo(
    () => (q ? countryOptions.filter((c) => c.name.toLowerCase().includes(q)) : countryOptions),
    [countryOptions, q],
  );
  const filteredLeagues = useMemo(
    () =>
      q
        ? leagueOptions.filter(
            (l) => l.label.toLowerCase().includes(q) || l.region.toLowerCase().includes(q),
          )
        : leagueOptions,
    [leagueOptions, q],
  );

  const draftCount =
    (draftStatus !== "all" ? 1 : 0) +
    (draftSignal !== "all" ? 1 : 0) +
    draftCountries.length +
    draftLeagues.length;

  const toggleCountry = (name: string) => {
    setDraftCountries((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name],
    );
  };

  const toggleLeague = (id: LeagueId) => {
    setDraftLeagues((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const clearDraft = () => {
    setDraftStatus("all");
    setDraftSignal("all");
    setDraftCountries([]);
    setDraftLeagues([]);
  };

  const applyAndClose = () => {
    onApply({
      status: draftStatus,
      signal: draftSignal,
      countries: draftCountries,
      leagues: draftLeagues,
    });
    onClose();
  };

  return (
    <TopLayerModalDialog
      open={open}
      onClose={onClose}
      ariaLabelledBy={titleId}
      maxWidth="28rem"
      dialogClassName="pl-home-fmodal-dialog"
    >
      <div className="pl-home-fmodal">
        <header className="pl-home-fmodal-head">
          <div>
            <h2 id={titleId} className="pl-home-fmodal-title">
              Filtros
            </h2>
            <p className="pl-home-fmodal-sub">Filtra los partidos de este día.</p>
          </div>
          <button
            type="button"
            className="pl-home-fmodal-close"
            aria-label="Cerrar filtros"
            onClick={onClose}
          >
            <MaestroIcon name="x" size={16} />
          </button>
        </header>

        <div className="pl-home-fmodal-body">
          <section className="pl-home-fmodal-section" aria-label="Estado del partido">
            <h3 className="pl-home-fmodal-h3">Estado del partido</h3>
            <div className="pl-home-fmodal-pills" role="group" aria-label="Elegir estado">
              {([
                { id: "all", label: "Todos" },
                { id: "live", label: "En vivo" },
                { id: "upcoming", label: "Próximos" },
                { id: "finished", label: "Finalizados" },
              ] as const).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`pl-home-fmodal-pill ${draftStatus === opt.id ? "is-on" : ""}`.trim()}
                  aria-pressed={draftStatus === opt.id}
                  onClick={() => setDraftStatus(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </section>

          <section className="pl-home-fmodal-section" aria-label="Señal de inteligencia">
            <h3 className="pl-home-fmodal-h3">Señal del modelo</h3>
            <div className="pl-home-fmodal-pills" role="group" aria-label="Elegir señal del modelo">
              {([
                { id: "all", label: "Todos" },
                { id: "high_confidence", label: "Alta probabilidad" },
                { id: "value", label: "Ventaja vs casa" },
              ] as const).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`pl-home-fmodal-pill ${draftSignal === opt.id ? "is-on" : ""}`.trim()}
                  aria-pressed={draftSignal === opt.id}
                  onClick={() => setDraftSignal(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </section>

          <section className="pl-home-fmodal-section" aria-label="Países y competiciones">
            <h3 className="pl-home-fmodal-h3">Países y competiciones</h3>
            <label className="pl-home-fmodal-search">
              <MaestroIcon name="search" size={15} />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar países o ligas..."
                aria-label="Buscar países o ligas"
              />
            </label>

            <div className="pl-home-fmodal-checklist">
              {filteredCountries.length === 0 && filteredLeagues.length === 0 ? (
                <p className="pl-home-fmodal-empty">Sin coincidencias para «{search.trim()}».</p>
              ) : (
                <>
                  {filteredCountries.length > 0 ? (
                    <div className="pl-home-fmodal-group">
                      <span className="pl-home-fmodal-eyebrow">Países</span>
                      {filteredCountries.map((country) => {
                        const checked = draftCountries.includes(country.name);
                        return (
                          <label key={country.name} className="pl-home-fmodal-checkrow">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleCountry(country.name)}
                            />
                            <span className="pl-home-fmodal-box" aria-hidden="true">
                              {checked ? <MaestroIcon name="check" size={12} /> : null}
                            </span>
                            <span className="pl-home-fmodal-checkname">{country.name}</span>
                            {country.count > 0 ? (
                              <span className="pl-home-fmodal-checkcount num">{country.count}</span>
                            ) : null}
                          </label>
                        );
                      })}
                    </div>
                  ) : null}

                  {filteredLeagues.length > 0 ? (
                    <div className="pl-home-fmodal-group">
                      <span className="pl-home-fmodal-eyebrow">Competiciones del día</span>
                      {filteredLeagues.map((lg) => {
                        const checked = draftLeagues.includes(lg.id);
                        return (
                          <label key={lg.id} className="pl-home-fmodal-checkrow">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleLeague(lg.id)}
                            />
                            <span className="pl-home-fmodal-box" aria-hidden="true">
                              {checked ? <MaestroIcon name="check" size={12} /> : null}
                            </span>
                            <LeagueBadge league={lg.id} label={lg.label} logoUrl={lg.logoUrl} size={18} />
                            <span className="pl-home-fmodal-checkname">{lg.label}</span>
                            <span className="pl-home-fmodal-checkcount num">{lg.count}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </section>
        </div>

        <footer className="pl-home-fmodal-foot">
          <p className="pl-home-fmodal-selected num">
            {draftCount} {draftCount === 1 ? "filtro seleccionado" : "filtros seleccionados"}
          </p>
          <div className="pl-home-fmodal-actions">
            <button
              type="button"
              className="pl-home-fmodal-clear"
              onClick={clearDraft}
            >
              Borrar todo
            </button>
            <button
              type="button"
              className="pl-home-fmodal-apply"
              onClick={applyAndClose}
            >
              Aplicar filtros
            </button>
          </div>
        </footer>
      </div>
    </TopLayerModalDialog>
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
  const { oddsFormat, riskPreference, viewerRole } = usePlatformCore();
  const { removePickFromParlay, clearParlay, generateAutoParlay, navigateTo } = usePlatformActions();
  const { parlaySummary } = useParlayState();
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
                  background: "var(--pl-surface-elevated)",
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
  const studioHref = canonicalGameHref(game.league, game);

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

/**
 * Inicio del Club con arquitectura limpia + inteligencia completa PitchLab:
 * 1) Barra superior: tendencias y tira rápida de partidos en vivo/del día (deportes y ligas en cabecera).
 * 2) Columna principal: «Partidos» agrupados por liga con barras 1·X·2 (`ProbSplit`), `PBar` de pick principal,
 *    resultado más probable, pick alternativo, líneas clave y acciones.
 * 3) Columna derecha: Centro unificado de Parlay («Tu parlay» + «Parlay del día» en pestañas),
 *    seguido de «Picks con mayor probabilidad», «Donde la casa paga más» y «Mi récord».
 */
export function HomeClubView({
  initialDay,
  initialToday,
  initialSport = ALL,
  initialLeague = ALL,
  liveBoardOverride,
}: HomeClubViewProps = {}): React.JSX.Element {
  const { dataset, viewerRole, userTimezone, favoriteLeagues } = usePlatformCore();
  const journal = useJournalEntries();
  const watchlistGameIds = useWatchlistGameIds();
  const { topics, toggleLeague: toggleTopicLeague } = useFollowedTopics();
  const { navigateTo, setFavoriteLeagues } = usePlatformActions();
  const homeNav = useHomeNavFilter();
  const { setTodayOverride } = homeNav;
  const games = dataset.games;
  const today = useMemo(
    () => initialToday ?? todayId(userTimezone || "America/Mexico_City"),
    [initialToday, userTimezone],
  );
  useEffect(() => {
    setTodayOverride(initialToday ?? null);
    return () => setTodayOverride(null);
  }, [initialToday, setTodayOverride]);

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
  const [calendarOpen, setCalendarOpen] = useState<boolean>(false);
  const [calMonth, setCalMonth] = useState<{ year: number; monthIndex: number }>(() =>
    parseIsoYearMonth(initialDay && initialDay !== UPCOMING ? initialDay : (initialToday ?? "2026-11-18")),
  );
  const datePickerWrapRef = useRef<HTMLDivElement | null>(null);
  const dateCenterBtnRef = useRef<HTMLButtonElement | null>(null);
  const calendarGridRef = useRef<HTMLDivElement | null>(null);
  const calendarPopoverId = useId();
  const oddsSwitchId = useId();

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

  const day = useMemo<string>(() => resolveHomeDay(games, chosenDay, today), [chosenDay, games, today]);

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
  }, []);

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
    if (el) el.scrollLeft = 0;
  }, [sport, league, day]);

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
  }, [syncChipsScroll, orderedChips, day, league, sport]);

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

  const isPast = day < today;
  const centerParts = formatCenterDayParts(day, today);
  const centerAria = day === today ? "Hoy, abrir calendario" : `${centerParts.top}, abrir calendario`;

  useEffect(() => {
    if (!calendarOpen) return;
    const onPointerDown = (ev: MouseEvent) => {
      if (datePickerWrapRef.current && !datePickerWrapRef.current.contains(ev.target as Node)) {
        setCalendarOpen(false);
      }
    };
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        setCalendarOpen(false);
        dateCenterBtnRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [calendarOpen]);

  const calendarEventDays = useMemo(() => {
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
      legendLabel:
        boardView === "favorites"
          ? "Días con tus favoritos"
          : "Días con partidos",
    };
  }, [boardView, day, favoriteLeagueSet, favoriteTeamSet, games, league, liveByGameId, sport, today, watchlistSet]);

  const calendarCells = useMemo(
    () => buildCalendarMonthCells(calMonth.year, calMonth.monthIndex),
    [calMonth.monthIndex, calMonth.year],
  );

  const stepCalendarMonth = (delta: -1 | 1) => {
    setCalMonth((prev) => {
      const nextDate = new Date(Date.UTC(prev.year, prev.monthIndex + delta, 1));
      return {
        year: nextDate.getUTCFullYear(),
        monthIndex: nextDate.getUTCMonth(),
      };
    });
  };

  const handleCalendarGridKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const gridEl = calendarGridRef.current;
    if (!gridEl) return;
    const buttons = [...gridEl.querySelectorAll<HTMLButtonElement>("button[data-cal-iso]")];
    if (buttons.length === 0) return;
    const currentIdx = buttons.findIndex((b) => b === document.activeElement);
    if (currentIdx < 0) return;
    let nextIdx = -1;
    if (e.key === "ArrowRight") nextIdx = Math.min(buttons.length - 1, currentIdx + 1);
    else if (e.key === "ArrowLeft") nextIdx = Math.max(0, currentIdx - 1);
    else if (e.key === "ArrowDown") nextIdx = Math.min(buttons.length - 1, currentIdx + 7);
    else if (e.key === "ArrowUp") nextIdx = Math.max(0, currentIdx - 7);
    else if (e.key === "Home") nextIdx = 0;
    else if (e.key === "End") nextIdx = buttons.length - 1;
    else if (e.key === "PageUp") {
      e.preventDefault();
      stepCalendarMonth(-1);
      return;
    } else if (e.key === "PageDown") {
      e.preventDefault();
      stepCalendarMonth(1);
      return;
    }
    if (nextIdx >= 0 && buttons[nextIdx]) {
      e.preventDefault();
      buttons[nextIdx]!.focus();
    }
  };

  const pickDay = (d: DaySelection) => {
    setDay(d);
    setLeague(
      league !== ALL && gamesForSelection(games, d, today).some((g) => g.league === league) ? league : ALL,
    );
  };
  const jumpDay = (targetDay: string, resetFilters: boolean) => {
    if (resetFilters) {
      homeNav.resetFilters(targetDay);
      return;
    }
    setDay(targetDay);
    setLeague(
      league !== ALL && gamesForSelection(games, targetDay, today).some((g) => g.league === league) ? league : ALL,
    );
  };

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

        {/* 1) Barra rápida de tendencias y chips del día (deportes y ligas viven en la cabecera de /app) */}
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
                  {orderedChips.map(({ game, live, score, entry }) => {
                    const homeCode = teamCode(game.home);
                    const awayCode = teamCode(game.away);
                    const time = formatGameKickoffTime(game, userTimezone);
                    const scoreText = score ? `${score.home} - ${score.away}` : null;
                    const livePhaseLabel = formatLiveChipPhase(entry);
                    return (
                      <button
                        key={game.id}
                        type="button"
                        className={`pl-home-chip ${live ? "is-live" : ""}`.trim()}
                        data-match-chip={game.id}
                        data-chip-league={game.league}
                        data-chip-live={live ? "true" : undefined}
                        aria-label={`${live ? `En vivo (${livePhaseLabel})` : time}: ${game.home.shortName} contra ${game.away.shortName}${scoreText ? `, ${scoreText}` : ""}`}
                        onClick={() => {
                          if (game.dayId !== day) {
                            pickDay(game.dayId);
                            if (typeof window !== "undefined") {
                              window.setTimeout(() => scrollToMatchCard(game.id), 60);
                            }
                            return;
                          }
                          scrollToMatchCard(game.id);
                        }}
                      >
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
                              <span className="pl-home-chip-score is-live num">
                                {scoreText ?? "0 - 0"}
                              </span>
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

        {/* 2) Cuerpo de 2 columnas: Partidos con barras (principal) + Centro de Parlays y Picks probables (der.) */}
        <div className="pl-astro-workspace !mt-3.5">
          <div className="pl-astro-center">
            <h1 className="sr-only">Partidos</h1>

            <section
              className="pl-home-board-bar glass-card glass-ring"
              aria-label="Controles del tablero de partidos"
              data-home-board-bar=""
            >
              <div className="pl-home-board-top">
                <div className="pl-home-board-tabs" role="tablist" aria-label="Vista de partidos">
                  {([
                    { id: "all", label: "Todos" },
                    { id: "favorites", label: "Para ti" },
                    { id: "competitions", label: "Competiciones" },
                  ] as const).map((tabItem) => {
                    const selected = boardView === tabItem.id;
                    return (
                      <button
                        key={tabItem.id}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        className={`pl-home-board-tab ${selected ? "is-active" : ""}`.trim()}
                        onClick={() => setBoardView(tabItem.id)}
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
                      onClick={() => prevDayOption && pickDay(prevDayOption.key)}
                    >
                      <MaestroIcon name="chevronLeft" size={15} />
                    </button>
                    <button
                      ref={dateCenterBtnRef}
                      type="button"
                      className={`pl-home-date-center ${day === today ? "is-today" : ""}`.trim()}
                      aria-label={centerAria}
                      aria-expanded={calendarOpen}
                      aria-controls={calendarPopoverId}
                      data-day-center=""
                      onClick={() => {
                        setCalendarOpen((prev) => {
                          if (!prev) {
                            setCalMonth(parseIsoYearMonth(day));
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
                      onClick={() => nextDayOption && pickDay(nextDayOption.key)}
                    >
                      <MaestroIcon name="chevronRight" size={15} />
                    </button>
                  </div>

                  {calendarOpen ? (
                    <div
                      id={calendarPopoverId}
                      role="dialog"
                      aria-label="Calendario de partidos"
                      data-home-calendar-popover=""
                      className="pl-home-cal-popover glass-ring"
                    >
                      <div className="pl-home-cal-head">
                        <div className="pl-home-cal-month-nav">
                          <button
                            type="button"
                            className="pl-home-cal-nav"
                            aria-label="Mes anterior"
                            onClick={() => stepCalendarMonth(-1)}
                          >
                            <MaestroIcon name="chevronLeft" size={16} />
                          </button>
                          <strong className="pl-home-cal-title">
                            {FULL_MONTHS_ES[calMonth.monthIndex]!.charAt(0).toUpperCase() +
                              FULL_MONTHS_ES[calMonth.monthIndex]!.slice(1)}{" "}
                            {calMonth.year}
                          </strong>
                          <button
                            type="button"
                            className="pl-home-cal-nav"
                            aria-label="Mes siguiente"
                            onClick={() => stepCalendarMonth(1)}
                          >
                            <MaestroIcon name="chevronRight" size={16} />
                          </button>
                        </div>
                        <button
                          type="button"
                          className="pl-home-cal-close"
                          aria-label="Cerrar calendario"
                          onClick={() => {
                            setCalendarOpen(false);
                            dateCenterBtnRef.current?.focus();
                          }}
                        >
                          <MaestroIcon name="x" size={14} />
                        </button>
                      </div>

                      <div className="pl-home-cal-weekdays" aria-hidden="true">
                        {CAL_WEEKDAYS_ES.map((wd) => (
                          <span key={wd}>{wd}</span>
                        ))}
                      </div>

                      <div
                        ref={calendarGridRef}
                        className="pl-home-cal-grid"
                        role="grid"
                        aria-label={`${FULL_MONTHS_ES[calMonth.monthIndex]} de ${calMonth.year}`}
                        onKeyDown={handleCalendarGridKeyDown}
                      >
                        {calendarCells.map((cell, idx) => {
                          if (!cell) {
                            return <span key={`empty-${idx}`} className="pl-home-cal-empty" aria-hidden="true" />;
                          }
                          const isSelected = cell.iso === day;
                          const isTodayCell = cell.iso === today;
                          const isPastCell = cell.iso < today;
                          const dayMeta = calendarEventDays.countsByDay.get(cell.iso);
                          const hasGames = Boolean(dayMeta && dayMeta.total > 0);
                          const hasLive = Boolean(dayMeta && dayMeta.live > 0);
                          const isFinishedOnly = Boolean(dayMeta && dayMeta.total > 0 && dayMeta.upcoming === 0 && dayMeta.live === 0);
                          const isBusy = Boolean(dayMeta && dayMeta.total >= 6);
                          const countText = dayMeta
                            ? `, ${dayMeta.total} ${dayMeta.total === 1 ? "partido" : "partidos"}${dayMeta.live > 0 ? `, ${dayMeta.live} en vivo` : ""}`
                            : "";
                          const leaguePreview = dayMeta && dayMeta.leagues.size > 0
                            ? ` · ${[...dayMeta.leagues].slice(0, 3).join(", ")}`
                            : "";
                          return (
                            <button
                              key={cell.iso}
                              type="button"
                              data-cal-iso={cell.iso}
                              aria-pressed={isSelected}
                              aria-current={isTodayCell ? "date" : undefined}
                              aria-label={`${cell.dayNum} de ${FULL_MONTHS_ES[calMonth.monthIndex]} de ${calMonth.year}${countText}`}
                              title={hasGames ? `${dayMeta!.total} ${dayMeta!.total === 1 ? "partido" : "partidos"}${leaguePreview}` : undefined}
                              className={[
                                "pl-home-cal-day num",
                                isSelected ? "is-selected" : "",
                                isTodayCell ? "is-today" : "",
                                isPastCell && !hasGames ? "is-past-empty" : "",
                                hasGames ? "has-games" : "",
                                hasLive ? "has-live" : "",
                                isFinishedOnly ? "is-finished-only" : "",
                                isBusy ? "is-busy" : "",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              onClick={() => {
                                pickDay(cell.iso);
                                setCalendarOpen(false);
                                dateCenterBtnRef.current?.focus();
                              }}
                            >
                              <span className="pl-home-cal-num">{cell.dayNum}</span>
                              {hasGames ? (
                                <span className="pl-home-cal-meta" aria-hidden="true">
                                  {hasLive ? <i className="pl-home-cal-live-dot" /> : null}
                                  <span className="pl-home-cal-count">{dayMeta!.total}</span>
                                </span>
                              ) : (
                                <i className="pl-home-cal-dot" aria-hidden="true" />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      <div className="pl-home-cal-summary">
                        <div className="pl-home-cal-summary-day num">
                          <span className="pl-home-cal-summary-date">
                            {day === today ? "Hoy" : `${centerParts.top}${centerParts.sub ? ` ${centerParts.sub}` : ""}`}
                          </span>
                          <span className="pl-home-cal-summary-count">
                            {calendarEventDays.selectedStats
                              ? `${calendarEventDays.selectedStats.total} ${calendarEventDays.selectedStats.total === 1 ? "partido" : "partidos"}${calendarEventDays.selectedStats.live > 0 ? ` · ${calendarEventDays.selectedStats.live} en vivo` : ""}`
                              : "Sin partidos"}
                          </span>
                        </div>
                        {calendarEventDays.selectedStats && calendarEventDays.selectedStats.leagues.size > 0 ? (
                          <p className="pl-home-cal-summary-leagues">
                            {[...calendarEventDays.selectedStats.leagues].slice(0, 4).join(" · ")}
                            {calendarEventDays.selectedStats.leagues.size > 4
                              ? ` +${calendarEventDays.selectedStats.leagues.size - 4}`
                              : ""}
                          </p>
                        ) : null}
                        <div className="pl-home-cal-legend">
                          <span className="pl-home-cal-legend-item">
                            <i className="pl-home-cal-legend-pill" aria-hidden="true" />
                            <span>{calendarEventDays.legendLabel}</span>
                          </span>
                          <span className="pl-home-cal-legend-item is-live">
                            <i className="pl-home-cal-legend-dot" aria-hidden="true" />
                            <span>En vivo</span>
                          </span>
                        </div>
                      </div>

                      <div className="pl-home-cal-foot">
                        <button
                          type="button"
                          className={`pl-home-cal-today-btn ${day === today ? "is-current" : ""}`.trim()}
                          onClick={() => {
                            pickDay(today);
                            setCalMonth(parseIsoYearMonth(today));
                            setCalendarOpen(false);
                          }}
                        >
                          Hoy
                        </button>
                        {calendarEventDays.nextActionDay ? (
                          <button
                            type="button"
                            className="pl-home-cal-next-btn num"
                            onClick={() => {
                              const target = calendarEventDays.nextActionDay!;
                              pickDay(target);
                              setCalMonth(parseIsoYearMonth(target));
                              setCalendarOpen(false);
                            }}
                          >
                            <span>Ir a {shortDateLabel(calendarEventDays.nextActionDay)}</span>
                            <MaestroIcon name="arrowRight" size={12} />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="pl-home-board-sub">
                <div className="pl-home-board-pills" role="group" aria-label="Estado de los partidos">
                  <button
                    type="button"
                    className={`pl-home-status-pill is-live-pill ${liveVisibleCount > 0 ? "has-live" : ""} ${statusFilter === "live" ? "is-on" : ""}`.trim()}
                    aria-pressed={statusFilter === "live"}
                    onClick={() => setStatusFilter((prev) => (prev === "live" ? "all" : "live"))}
                  >
                    <span className="num">En Vivo ({liveVisibleCount})</span>
                  </button>
                  <button
                    type="button"
                    className={`pl-home-status-pill ${statusFilter === "finished" ? "is-on" : ""}`.trim()}
                    aria-pressed={statusFilter === "finished"}
                    onClick={() => setStatusFilter((prev) => (prev === "finished" ? "all" : "finished"))}
                  >
                    Finalizado
                  </button>
                  <button
                    type="button"
                    className={`pl-home-status-pill ${statusFilter === "upcoming" ? "is-on" : ""}`.trim()}
                    aria-pressed={statusFilter === "upcoming"}
                    onClick={() => setStatusFilter((prev) => (prev === "upcoming" ? "all" : "upcoming"))}
                  >
                    Próximo
                  </button>

                  <button
                    type="button"
                    className={`pl-home-filter-btn ${activeModalFilterCount > 0 ? "is-active" : ""}`.trim()}
                    aria-haspopup="dialog"
                    aria-expanded={filtersOpen}
                    data-home-filters-trigger=""
                    onClick={() => setFiltersOpen(true)}
                  >
                    <MaestroIcon name="filter" size={14} />
                    <span>Filtros</span>
                    {activeModalFilterCount > 0 ? (
                      <span className="pl-home-filter-count num">{activeModalFilterCount}</span>
                    ) : null}
                  </button>
                </div>

                <label htmlFor={oddsSwitchId} className="pl-home-odds-toggle">
                  <span className="pl-home-odds-label">Momios</span>
                  <input
                    id={oddsSwitchId}
                    type="checkbox"
                    {...({ switch: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
                    role="switch"
                    checked={showOdds}
                    onChange={(e) => setShowOdds(e.target.checked)}
                    className="pl-home-switch"
                  />
                </label>
              </div>
            </section>

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
            />

            <HomeFiltersDialog
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
