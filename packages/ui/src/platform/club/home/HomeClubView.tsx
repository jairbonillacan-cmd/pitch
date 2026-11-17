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
  CompactMatchRow,
  type RecentFormCode,
} from "../../components/CompactMatchRow";
import { DualStatComparisonCard } from "../../components/DualStatComparisonCard";
import { LivePicksTrackerStrip } from "../../components/LivePicksTrackerStrip";
import {
  ParlayPickButton,
  formatCountsHint,
  formatGoalLineHint,
} from "../../components/MatchList";
import { MultiPickRow } from "../../components/MatchTicketCard";
import { TopLayerModalDialog } from "../../components/PlatformOverlays";
import { AtmosphereStage, ClubWorkspaceShell } from "../../components/ShellChrome";
import { FollowControl } from "../../live/LiveMatchCenter";
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
  density = "compact",
  showInlineOdds = false,
  selectedGameId = null,
  onSelectGame,
  recentFormByTeam,
}: {
  readonly groups: ReturnType<typeof groupMatchesByDayAndLeague>;
  readonly today: string;
  readonly liveByGameId: ReadonlyMap<string, LiveScoreboardEntry>;
  readonly density?: "compact" | "cards";
  readonly showInlineOdds?: boolean;
  readonly selectedGameId?: string | null;
  readonly onSelectGame?: (gameId: string) => void;
  readonly recentFormByTeam?: ReadonlyMap<string, readonly RecentFormCode[]>;
}): React.JSX.Element {
  const totalGames = groups.reduce((sum, d) => sum + d.count, 0);
  const [limit, setLimit] = useState<number>(INITIAL_HOME_CARDS_LIMIT);

  if (groups.length === 0) {
    return (
      <div
        className="p-6 text-center text-sm"
        style={{ color: "var(--pl-text-muted)" }}
      >
        No hay partidos con este filtro. Prueba otro día o «Todas las ligas».
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
        const liveInLeague = leagueGroup.games.filter((g) => {
          const entry = liveByGameId.get(g.id);
          return (entry ? isLivePhaseActive(entry.phase) : false) || String(g.status) === "LIVE";
        }).length;
        return (
          <details
            key={leagueGroup.league}
            open
            aria-label={leagueGroup.label}
            className="pl-astro-league-block"
            data-league-group={leagueGroup.league}
          >
            <summary className="pl-astro-league-head">
              <LeagueBadge
                league={leagueGroup.league}
                label={leagueGroup.label}
                logoUrl={leagueGroup.logoUrl}
                size={20}
              />
              <span className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-baseline sm:gap-2">
                <span className="pl-astro-league-title truncate">{leagueGroup.label}</span>
                <span className="pl-astro-league-sub truncate">
                  {region}
                  {leagueGroup.round ? ` · ${leagueGroup.round}` : ""}
                </span>
              </span>
              <span
                className={`pl-astro-league-count num shrink-0 ${liveInLeague > 0 ? "is-live" : ""}`.trim()}
              >
                {liveInLeague > 0 ? `${liveInLeague}/${leagueGroup.count}` : leagueGroup.count}
              </span>
              <span className="pl-astro-league-chevron" aria-hidden="true">
                <MaestroIcon name="chevronDown" size={14} />
              </span>
            </summary>

            <div className={density === "compact" ? "pl-compact-rows" : "pl-astro-rows"}>
              {leagueGroup.games.map((g) =>
                density === "compact" ? (
                  <CompactMatchRow
                    key={g.id}
                    game={g}
                    liveEntry={liveByGameId.get(g.id)}
                    selected={selectedGameId === g.id}
                    showInlineOdds={showInlineOdds}
                    onSelectGame={onSelectGame}
                    homeForm={recentFormByTeam?.get(`${g.league}.${g.home.slug}`)}
                    awayForm={recentFormByTeam?.get(`${g.league}.${g.away.slug}`)}
                  />
                ) : (
                  <AstroMatchRow key={g.id} game={g} liveEntry={liveByGameId.get(g.id)} />
                ),
              )}
            </div>
          </details>
        );
      })}

      {totalGames > limit ? (
        <div className="flex justify-center py-3">
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

function computeTeamRecentFormMap(
  allGames: readonly PlatformGame[],
): Map<string, readonly RecentFormCode[]> {
  const map = new Map<string, RecentFormCode[]>();
  const finished = allGames
    .filter((g) => g.status === "FT" && g.score !== undefined)
    .slice()
    .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));

  for (const g of finished) {
    const sh = g.score!.home;
    const sa = g.score!.away;
    const hKey = `${g.league}.${g.home.slug}`;
    const aKey = `${g.league}.${g.away.slug}`;
    const hRes: RecentFormCode = sh > sa ? "G" : sh < sa ? "P" : "E";
    const aRes: RecentFormCode = sa > sh ? "G" : sa < sh ? "P" : "E";
    const hArr = map.get(hKey) ?? [];
    hArr.push(hRes);
    map.set(hKey, hArr.slice(-5));
    const aArr = map.get(aKey) ?? [];
    aArr.push(aRes);
    map.set(aKey, aArr.slice(-5));
  }
  return map;
}

type PreviewSubTab = "detalles" | "momios" | "estadisticas" | "clasificacion";

/**
 * Panel derecho Maestro-Detalle en Escritorio (`>= 1100px`):
 * inspirado en la jerarquía de vista rápida dividida, 100 % con ADN Sólido PitchLab:
 * ruta superior, marcador centrado con escudos grandes, píldora de página completa y
 * 4 subpestañas con subrayado accesible (`Detalles`, `Momios`, `Estadísticas`, `Clasificación`).
 */
function HomeMatchPreviewPane({
  game,
  liveEntry,
}: {
  readonly game: PlatformGame;
  readonly liveEntry?: LiveScoreboardEntry;
}): React.JSX.Element {
  const { dataset, viewerRole, oddsFormat, userTimezone, upgradeHref } = usePlatformCore();
  const { navigateTo } = usePlatformActions();
  const [subTab, setSubTab] = useState<PreviewSubTab>("detalles");
  const detailsPanelRef = useRef<HTMLDivElement | null>(null);
  const oddsPanelRef = useRef<HTMLDivElement | null>(null);
  const statsPanelRef = useRef<HTMLDivElement | null>(null);
  const tablePanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSubTab("detalles");
  }, [game.id]);

  useEffect(() => {
    const pairs: Array<[React.RefObject<HTMLDivElement | null>, PreviewSubTab]> = [
      [detailsPanelRef, "detalles"],
      [oddsPanelRef, "momios"],
      [statsPanelRef, "estadisticas"],
      [tablePanelRef, "clasificacion"],
    ];
    const cleanups: Array<() => void> = [];
    for (const [ref, key] of pairs) {
      const el = ref.current;
      if (!el) continue;
      const fn = () => setSubTab(key);
      el.addEventListener("beforematch", fn);
      cleanups.push(() => el.removeEventListener("beforematch", fn));
    }
    return () => cleanups.forEach((fn) => fn());
  }, []);

  const hasDraw = sportHasDraw(game.sport);
  const unit = sportScoringUnit(game.sport);
  const hasForecast = game.hasForecast !== false && Boolean(game.x12 && game.projection);
  const live =
    (liveEntry ? isLivePhaseActive(liveEntry.phase) : false) ||
    String(game.status) === "LIVE";
  const isFinished =
    !live &&
    (game.status === "FT" || liveEntry?.phase === "final") &&
    (game.score !== undefined || liveEntry?.score != null);
  const activeScore = live
    ? (liveEntry?.score ?? game.score ?? null)
    : (game.score ?? liveEntry?.score ?? null);
  const intelUnlocked = isFinished || isPreGameIntelUnlocked(game, viewerRole);
  const studioHref = `/app/${game.league}/games/${game.id}`;
  const leagueHref = `/app/${game.league}`;
  const time = formatGameKickoffTime(game, userTimezone);
  const [ph, pd, pa] = game.x12 ?? [0, 0, 0];
  const outcome = hasForecast ? mostLikelyOutcome(game) : null;
  const region = LEAGUE_REGION_LABELS[game.league] ?? "Internacional";

  const standings = useMemo(
    () => dataset.leagues.find((l) => l.league === game.league)?.standings ?? [],
    [dataset.leagues, game.league],
  );

  const regulationCells = useMemo(() => {
    if (!hasForecast || !game.x12) return [];
    const items: Array<{ code: string; label: string; p: number; lead: boolean }> = [
      {
        code: "1",
        label: game.home.shortName,
        p: ph,
        lead: outcome?.side === "home",
      },
    ];
    if (hasDraw) {
      items.push({
        code: "X",
        label: "Empate",
        p: pd,
        lead: outcome?.side === "draw",
      });
    }
    items.push({
      code: "2",
      label: game.away.shortName,
      p: pa,
      lead: outcome?.side === "away",
    });
    return items;
  }, [game.away.shortName, game.home.shortName, game.x12, hasDraw, hasForecast, outcome?.side, pa, pd, ph]);

  return (
    <section
      className="pl-preview-drawer glass-card glass-ring"
      aria-label={`Radiografía rápida: ${game.home.name} vs ${game.away.name}`}
      data-master-detail-preview={game.id}
    >
      {/* Cabecera de ruta de competición + seguir */}
      <div className="pl-preview-drawer-top">
        <a
          href={leagueHref}
          onClick={(e) => {
            e.preventDefault();
            navigateTo(leagueHref);
          }}
          className="pl-preview-breadcrumb min-w-0"
        >
          <LeagueBadge
            league={game.league}
            label={game.leagueLabel}
            logoUrl={game.leagueLogoUrl}
            size={16}
          />
          <span className="truncate">
            {region} › {game.leagueLabel}
            {game.round ? `, ${game.round}` : ""}
          </span>
        </a>
        <div className="flex items-center gap-1.5 shrink-0">
          {!isFinished ? <ConfidenceChip game={game} size="sm" /> : null}
          {!isFinished ? <FollowControl gameId={game.id} compact /> : null}
        </div>
      </div>

      {/* Marcador centrado de 3 columnas con escudos protagonistas */}
      <div className="pl-preview-scoreboard">
        <a
          href={`/app/${game.league}/teams/${game.home.slug}`}
          onClick={(e) => {
            e.preventDefault();
            navigateTo(`/app/${game.league}/teams/${game.home.slug}`);
          }}
          className="pl-preview-team"
        >
          <TeamBadge
            league={game.league}
            slug={game.home.slug}
            name={game.home.name}
            logoUrl={game.home.logoUrl}
            size={44}
          />
          <strong className="pl-preview-team-name">{game.home.shortName || game.home.name}</strong>
          {game.home.record ? (
            <span className="pl-preview-team-rec num">{game.home.record}</span>
          ) : null}
        </a>

        <div className="pl-preview-scorebox num">
          {live || isFinished ? (
            <strong className={`pl-preview-score ${live ? "is-live" : ""}`.trim()}>
              {activeScore?.home ?? "—"} – {activeScore?.away ?? "—"}
            </strong>
          ) : intelUnlocked && game.projection ? (
            <strong className="pl-preview-proj">
              {game.projection.home.toFixed(unit.decimals)} – {game.projection.away.toFixed(unit.decimals)}
            </strong>
          ) : (
            <strong className="pl-preview-kickoff">{time}</strong>
          )}
          <span className={`pl-preview-clock ${live ? "is-live" : ""}`.trim()}>
            {live
              ? liveEntry?.clock
                ? `${liveEntry.clock}' · En vivo`
                : "En vivo"
              : isFinished
                ? "Finalizado FT"
                : intelUnlocked && game.projection
                  ? `Proy. · ${shortDateLabel(game.dayId)} ${time}`
                  : shortDateLabel(game.dayId)}
          </span>
        </div>

        <a
          href={`/app/${game.league}/teams/${game.away.slug}`}
          onClick={(e) => {
            e.preventDefault();
            navigateTo(`/app/${game.league}/teams/${game.away.slug}`);
          }}
          className="pl-preview-team"
        >
          <TeamBadge
            league={game.league}
            slug={game.away.slug}
            name={game.away.name}
            logoUrl={game.away.logoUrl}
            size={44}
          />
          <strong className="pl-preview-team-name">{game.away.shortName || game.away.name}</strong>
          {game.away.record ? (
            <span className="pl-preview-team-rec num">{game.away.record}</span>
          ) : null}
        </a>
      </div>

      {/* Píldora central de vista completa (conserva «Ver partido ·» para contratos de plataforma) */}
      <div className="flex justify-center px-4 pb-3">
        <a
          href={studioHref}
          onClick={(e) => {
            e.preventDefault();
            navigateTo(studioHref);
          }}
          data-preview-open-full=""
          className="pl-preview-fullpage-cta no-underline"
        >
          <span>
            Vista de página completa · Ver partido · {countLabel(game.picks.length, "pick", "picks")}
          </span>
          <MaestroIcon name="arrowRight" size={13} />
        </a>
      </div>

      {/* Subpestañas con subrayado accesible (focusgroup="tablist nomemory") */}
      <div
        role="tablist"
        aria-label="Secciones de vista rápida del partido"
        className="pl-preview-subtabs"
        {...({ focusgroup: "tablist nomemory" } as React.HTMLAttributes<HTMLDivElement>)}
      >
        {(
          [
            { id: "detalles", label: "Detalles" },
            { id: "momios", label: "Momios" },
            { id: "estadisticas", label: "Estadísticas" },
            { id: "clasificacion", label: "Clasificación" },
          ] as const
        ).map((tab) => {
          const on = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`preview-subtab-${tab.id}`}
              aria-selected={on}
              onClick={() => setSubTab(tab.id)}
              className="pl-preview-subtab"
              {...(on ? ({ focusgroupstart: "" } as React.ButtonHTMLAttributes<HTMLButtonElement>) : {})}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Subpanel 1: Detalles (Tira 1·X·2 Tiempo reglamentario + ProbSplit + Picks + Cortex IA) */}
      <div
        ref={detailsPanelRef}
        role="tabpanel"
        aria-labelledby="preview-subtab-detalles"
        className="pl-match-panel"
        {...(subTab !== "detalles"
          ? ({ hidden: "until-found" } as unknown as React.HTMLAttributes<HTMLDivElement>)
          : {})}
      >
        <div className="p-4 space-y-3.5">
          {regulationCells.length > 0 ? (
            <div className="pl-reg-odds-card" data-regulation-odds="">
              <div className="pl-reg-odds-head">
                <span className="text-xs font-bold">
                  {hasDraw ? "Tiempo reglamentario" : "Ganador del partido"}
                </span>
                {live ? (
                  <span className="text-[11px] font-extrabold" style={{ color: "var(--pl-warning)" }}>
                    En Vivo
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold" style={{ color: "var(--pl-brand)" }}>
                    Momio justo PitchLab
                  </span>
                )}
              </div>
              {intelUnlocked ? (
                <div
                  className="pl-reg-odds-grid num"
                  style={{
                    gridTemplateColumns: `repeat(${regulationCells.length}, minmax(0, 1fr))`,
                  }}
                >
                  {regulationCells.map((cell) => (
                    <div
                      key={cell.code}
                      className={`pl-reg-odds-cell ${cell.lead ? "is-lead" : ""}`.trim()}
                    >
                      <span className="pl-reg-odds-code">{cell.code}</span>
                      <strong className="pl-reg-odds-val">
                        {formatOddsValue(1 / Math.max(cell.p, 0.01), oddsFormat)}
                      </strong>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2 text-xs pt-1">
                  <span style={{ color: "var(--pl-text-muted)" }}>
                    Momios justos calibrados disponibles con Pase Ultra
                  </span>
                  <a
                    href={upgradeHref}
                    onClick={(e) => {
                      e.preventDefault();
                      navigateTo(upgradeHref);
                    }}
                    className="font-bold no-underline"
                    style={{ color: "var(--pl-brand)" }}
                  >
                    Desbloquear →
                  </a>
                </div>
              )}
            </div>
          ) : null}

          {hasForecast && game.x12 ? (
            <ProbSplit
              probabilities={hasDraw ? [ph, pd, pa] : [ph, pa]}
              labels={
                hasDraw
                  ? [game.home.shortName, "Empate", game.away.shortName]
                  : [game.home.shortName, game.away.shortName]
              }
              showLabels
            />
          ) : null}

          {game.picks.length > 0 ? (
            <div className="space-y-2">
              <strong
                className="block text-xs font-extrabold uppercase tracking-wider"
                style={{ color: "var(--pl-text-muted)" }}
              >
                Picks del modelo ({game.picks.length})
              </strong>
              <div className="space-y-2">
                {game.picks.slice(0, 3).map((pk) => (
                  <MultiPickRow key={pk.id} pick={pk} gameStatus={game.status} />
                ))}
              </div>
            </div>
          ) : null}

          {intelUnlocked && game.preGame.cortexSynthesis ? (
            <div className="pl-preview-cortex-box">
              <span className="inline-flex items-center gap-1.5 text-xs font-extrabold">
                <MaestroIcon name="sparkles" size={12} style={{ color: "var(--pl-brand)" }} />
                <span>Cortex IA</span>
              </span>
              <p className="m-0 text-xs leading-relaxed" style={{ color: "var(--pl-text-secondary)" }}>
                {game.preGame.cortexSynthesis}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {/* Subpanel 2: Momios y pulso de mercado */}
      <div
        ref={oddsPanelRef}
        role="tabpanel"
        aria-labelledby="preview-subtab-momios"
        className="pl-match-panel"
        {...(subTab !== "momios"
          ? ({ hidden: "until-found" } as unknown as React.HTMLAttributes<HTMLDivElement>)
          : {})}
      >
        <div className="p-4 space-y-3">
          {intelUnlocked && game.picks.length > 0 ? (
            <div className="space-y-2">
              {game.picks.map((pk) => (
                <div
                  key={pk.id}
                  className="rounded-xl p-3 flex items-center justify-between gap-2 text-xs num"
                  style={{
                    background: "var(--pl-surface-elevated)",
                    border: "1px solid var(--pl-border)",
                  }}
                >
                  <div className="min-w-0">
                    <strong className="block truncate text-sm">{pk.label}</strong>
                    <span style={{ color: "var(--pl-text-muted)" }}>
                      Prob. real {(pk.p * 100).toFixed(1)} %
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="block" style={{ color: "var(--pl-text-muted)" }}>
                      Justo <strong style={{ color: "var(--pl-text)" }}>{formatOddsValue(pk.fairDecimal, oddsFormat)}</strong>
                    </span>
                    {pk.marketDecimal ? (
                      <span className="block font-bold" style={{ color: "var(--pl-success)" }}>
                        Casa {formatOddsValue(pk.marketDecimal, oddsFormat)}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Abre la pestaña «¿Dónde está el dinero?» en la ficha completa para comparar 9 casas y calcular tu ventaja.
            </p>
          )}
          <a
            href={`${studioHref}?tab=dinero`}
            onClick={(e) => {
              e.preventDefault();
              navigateTo(`${studioHref}?tab=dinero`);
            }}
            className="pl-btn-glass w-full min-h-11 text-xs font-bold inline-flex items-center justify-center gap-1.5 no-underline"
          >
            <span>Comparar casas en ¿Dónde está el dinero?</span>
            <MaestroIcon name="arrowRight" size={13} />
          </a>
        </div>
      </div>

      {/* Subpanel 3: Estadísticas comparativas */}
      <div
        ref={statsPanelRef}
        role="tabpanel"
        aria-labelledby="preview-subtab-estadisticas"
        className="pl-match-panel"
        {...(subTab !== "estadisticas"
          ? ({ hidden: "until-found" } as unknown as React.HTMLAttributes<HTMLDivElement>)
          : {})}
      >
        <div className="p-4 space-y-3">
          {intelUnlocked && game.projection ? (
            <>
              <DualStatComparisonCard
                label={unit.plural === "puntos" ? "Puntos esperados" : "Goles esperados"}
                badgeText={`Total ${game.projection.total.toFixed(unit.decimals)}`}
                homeLabel={game.home.shortName}
                awayLabel={game.away.shortName}
                homeValueText={game.projection.home.toFixed(unit.decimals)}
                awayValueText={game.projection.away.toFixed(unit.decimals)}
                homeNumeric={game.projection.home}
                awayNumeric={game.projection.away}
              />
              {game.x12 ? (
                <DualStatComparisonCard
                  label="Probabilidad de victoria"
                  homeLabel={game.home.shortName}
                  awayLabel={game.away.shortName}
                  homeValueText={`${(ph * 100).toFixed(1)} %`}
                  awayValueText={`${(pa * 100).toFixed(1)} %`}
                  homeNumeric={ph * 100}
                  awayNumeric={pa * 100}
                />
              ) : null}
            </>
          ) : (
            <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Las proyecciones ofensivas y simulaciones completas están disponibles en la pestaña «Números».
            </p>
          )}
          <a
            href={`${studioHref}?tab=numeros`}
            onClick={(e) => {
              e.preventDefault();
              navigateTo(`${studioHref}?tab=numeros`);
            }}
            className="pl-btn-glass w-full min-h-11 text-xs font-bold inline-flex items-center justify-center gap-1.5 no-underline"
          >
            <span>Abrir Números y simulador</span>
            <MaestroIcon name="arrowRight" size={13} />
          </a>
        </div>
      </div>

      {/* Subpanel 4: Clasificación de la liga */}
      <div
        ref={tablePanelRef}
        role="tabpanel"
        aria-labelledby="preview-subtab-clasificacion"
        className="pl-match-panel"
        {...(subTab !== "clasificacion"
          ? ({ hidden: "until-found" } as unknown as React.HTMLAttributes<HTMLDivElement>)
          : {})}
      >
        <div className="p-4 space-y-3">
          {standings.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs num">
                <thead>
                  <tr className="hairline-b" style={{ color: "var(--pl-text-muted)" }}>
                    <th scope="col" className="py-1.5 pr-2">#</th>
                    <th scope="col" className="py-1.5 pr-2">Equipo</th>
                    <th scope="col" className="py-1.5 px-1.5 text-right">PJ</th>
                    <th scope="col" className="py-1.5 px-1.5 text-right">DG</th>
                    <th scope="col" className="py-1.5 pl-1.5 text-right">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.slice(0, 8).map((row, idx) => {
                    const slug = row.teamId.includes(".") ? row.teamId.split(".")[1]! : row.teamId;
                    const isMatchTeam = slug === game.home.slug || slug === game.away.slug;
                    const dg = row.goalsFor - row.goalsAgainst;
                    return (
                      <tr
                        key={row.teamId}
                        className="hairline-b"
                        style={
                          isMatchTeam
                            ? { background: "color-mix(in srgb, var(--pl-brand) 12%, transparent)" }
                            : undefined
                        }
                      >
                        <td className="py-2 pr-2 font-bold">{idx + 1}</td>
                        <td className="py-2 pr-2">
                          <span className="inline-flex items-center gap-1.5 font-semibold">
                            <TeamBadge
                              league={game.league}
                              slug={slug}
                              name={row.name}
                              logoUrl={row.logoUrl}
                              size={16}
                            />
                            <span className="truncate max-w-[130px]">{row.shortName || row.name}</span>
                          </span>
                        </td>
                        <td className="py-2 px-1.5 text-right">{row.played}</td>
                        <td className="py-2 px-1.5 text-right">{dg > 0 ? `+${dg}` : dg}</td>
                        <td className="py-2 pl-1.5 text-right font-extrabold">{row.points}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Tabla general disponible en el centro de competición de {game.leagueLabel}.
            </p>
          )}
          <a
            href={`${leagueHref}?vista=tabla`}
            onClick={(e) => {
              e.preventDefault();
              navigateTo(`${leagueHref}?vista=tabla`);
            }}
            className="pl-btn-glass w-full min-h-11 text-xs font-bold inline-flex items-center justify-center gap-1.5 no-underline"
          >
            <span>Ver tabla completa de {game.leagueLabel}</span>
            <MaestroIcon name="arrowRight" size={13} />
          </a>
        </div>
      </div>
    </section>
  );
}

/**
 * Inicio del Club (`/app`):
 * - Mobile-First (`375px`): barra de deportes + tarjeta unificada de jornada con pestañas
 *   `Todos | Favoritos | Competiciones`, `< Hoy >`, estado `En Vivo / Finalizado / Próximo`,
 *   interruptor `Momios` en línea y `>= 5` partidos visibles sin hacer scroll.
 * - Escritorio (`>= 1100px`): vista Maestro-Detalle dividida en 2 tarjetas limpias,
 *   abriendo la radiografía interactiva a la derecha con conmutador `Partido | Tu Parlay (N)`.
 */
export function HomeClubView({
  initialDay,
  initialToday,
  initialSport = ALL,
  initialLeague = ALL,
  liveBoardOverride,
}: HomeClubViewProps = {}): React.JSX.Element {
  const { dataset, viewerRole, userTimezone } = usePlatformCore();
  const { parlaySummary, journal } = usePlatform();
  const { navigateTo } = usePlatformActions();
  const games = dataset.games;
  const today = useMemo(
    () => initialToday ?? todayId(userTimezone || "America/Mexico_City"),
    [initialToday, userTimezone],
  );
  const [chosenDay, setDay] = useState<DaySelection | null>(initialDay ?? null);
  const [sport, setSport] = useState<SportFilter>(initialSport);
  const [league, setLeague] = useState<LeagueFilter>(initialLeague);
  const [feedScope, setFeedScope] = useState<"all" | "favorites">("all");
  const [statusFilter, setStatusFilter] = useState<MatchStatusFilter>("all");
  const [showInlineOdds, setShowInlineOdds] = useState<boolean>(false);
  const [density, setDensity] = useState<"compact" | "cards">("compact");
  const [mobileView, setMobileView] = useState<"partidos" | "radar">("partidos");
  const [desktopDetailMode, setDesktopDetailMode] = useState<"match" | "radar">("match");
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [leaguesModalOpen, setLeaguesModalOpen] = useState<boolean>(false);
  const [leagueSearch, setLeagueSearch] = useState<string>("");
  const [filtersModalOpen, setFiltersModalOpen] = useState<boolean>(false);
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

  const recentFormByTeam = useMemo(() => computeTeamRecentFormMap(games), [games]);

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

  const scopeFilteredGames = useMemo(() => {
    if (feedScope !== "favorites") return visible;
    if (favLeagues.length === 0 && followedTeams.length === 0) return [];
    const teamKeys = new Set(followedTeams.map((t) => `${t.league}.${t.slug}`));
    return visible.filter(
      (g) =>
        favLeagues.includes(g.league) ||
        teamKeys.has(`${g.league}.${g.home.slug}`) ||
        teamKeys.has(`${g.league}.${g.away.slug}`),
    );
  }, [favLeagues, feedScope, followedTeams, visible]);

  const isUnlocked = useCallback(
    (pick: MatchPick, game: PlatformGame) => isPickUnlocked(pick, game.status, viewerRole),
    [viewerRole],
  );
  const top = useMemo(() => topPrincipalPicks(visible, 4, isUnlocked), [visible, isUnlocked]);
  const value = useMemo(() => valuePicks(visible, isUnlocked), [visible, isUnlocked]);

  const liveCountInVisible = useMemo(
    () =>
      scopeFilteredGames.filter((g) => {
        const entry = liveByGameId.get(g.id);
        return (entry ? isLivePhaseActive(entry.phase) : false) || String(g.status) === "LIVE";
      }).length,
    [scopeFilteredGames, liveByGameId],
  );

  const statusFilteredGames = useMemo(() => {
    if (statusFilter === "all") return scopeFilteredGames;
    if (statusFilter === "ai") {
      return scopeFilteredGames
        .filter((g) => (g.picks[0]?.p ?? 0) >= 0.58)
        .slice()
        .sort((a, b) => (b.picks[0]?.p ?? 0) - (a.picks[0]?.p ?? 0));
    }
    return scopeFilteredGames.filter((g) => {
      const entry = liveByGameId.get(g.id);
      const isLive = (entry ? isLivePhaseActive(entry.phase) : false) || String(g.status) === "LIVE";
      const isFt = !isLive && (g.status === "FT" || entry?.phase === "final");
      if (statusFilter === "live") return isLive;
      if (statusFilter === "finished") return isFt;
      return !isLive && !isFt;
    });
  }, [scopeFilteredGames, statusFilter, liveByGameId]);

  const dayGroups = useMemo(
    () => groupMatchesByDayAndLeague(statusFilteredGames),
    [statusFilteredGames],
  );

  const defaultPreviewGame = useMemo<PlatformGame | null>(() => {
    if (statusFilteredGames.length === 0) return visible[0] ?? null;
    const liveMatch = statusFilteredGames.find((g) => {
      const entry = liveByGameId.get(g.id);
      return (entry ? isLivePhaseActive(entry.phase) : false) || String(g.status) === "LIVE";
    });
    if (liveMatch) return liveMatch;
    const upcomingSorted = statusFilteredGames
      .filter((g) => g.status !== "FT")
      .slice()
      .sort((a, b) => (b.confidenceScore ?? 0) - (a.confidenceScore ?? 0));
    return upcomingSorted[0] ?? statusFilteredGames[0] ?? null;
  }, [liveByGameId, statusFilteredGames, visible]);

  const activePreviewGame = useMemo<PlatformGame | null>(() => {
    if (selectedGameId) {
      const found = statusFilteredGames.find((g) => g.id === selectedGameId) ?? games.find((g) => g.id === selectedGameId);
      if (found) return found;
    }
    return defaultPreviewGame;
  }, [defaultPreviewGame, games, selectedGameId, statusFilteredGames]);

  const handleSelectGame = useCallback((gameId: string) => {
    setSelectedGameId(gameId);
    setDesktopDetailMode("match");
  }, []);

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

  const activeLeagueLabel =
    league === ALL ? "Competiciones" : leagueLabelOf(dayGames, league);

  const searchableLeagues = useMemo(() => {
    const q = leagueSearch.trim().toLowerCase();
    const dayLeagueIds = new Set(leagues);
    const items: Array<{ id: LeagueId; label: string; logoUrl?: string; count: number }> = [];
    for (const l of leagues) {
      items.push({
        id: l,
        label: leagueLabelOf(dayGames, l),
        logoUrl: leagueLogoOf(dayGames, l),
        count: sportGames.filter((g) => g.league === l).length,
      });
    }
    for (const summary of dataset.leagues) {
      if (!dayLeagueIds.has(summary.league)) {
        items.push({
          id: summary.league,
          label: summary.label,
          logoUrl: summary.logoUrl,
          count: 0,
        });
      }
    }
    return q
      ? items.filter((it) => it.label.toLowerCase().includes(q) || it.id.toLowerCase().includes(q))
      : items;
  }, [dataset.leagues, dayGames, leagueSearch, leagues, sportGames]);

  const activeExtraFiltersCount =
    (statusFilter === "ai" ? 1 : 0) + (density === "cards" ? 1 : 0);

  return (
    <AtmosphereStage activePath="/app">
      <ClubWorkspaceShell activePath="/app">
        <LivePicksTrackerStrip journal={journal} games={games} onNavigate={navigateTo} />

        {/* Conmutador superior móvil (< 1100px): Partidos vs Picks y Parlay del día */}
        <div
          className="pl-home-mobile-switcher seg-well"
          role="group"
          aria-label="Vista en móvil"
          data-home-mobile-switcher=""
        >
          <button
            type="button"
            className="seg-btn flex-1 min-h-10 text-xs font-bold"
            aria-pressed={mobileView === "partidos"}
            data-mobile-view-tab="partidos"
            onClick={() => setMobileView("partidos")}
          >
            <span>Partidos</span>
            <span className="num opacity-75">({statusFilteredGames.length})</span>
          </button>
          <button
            type="button"
            className="seg-btn flex-1 min-h-10 text-xs font-bold"
            aria-pressed={mobileView === "radar"}
            data-mobile-view-tab="radar"
            onClick={() => setMobileView("radar")}
          >
            <span>Picks y Parlay</span>
            {parlaySummary.legs.length > 0 ? (
              <span className="pl-pill pl-pill--brand num text-[11px] px-1.5 py-0">
                {parlaySummary.legs.length}
              </span>
            ) : null}
          </button>
        </div>

        {/* Barra superior de Deportes + aviso de día vacío */}
        <section
          aria-label="Filtros de la jornada"
          className={`pl-astro-topbar ${mobileView === "radar" ? "is-mobile-hidden" : ""}`.trim()}
          data-home-filterbar=""
        >
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

          {orderedChips.length === 0 ? (
            <div className="pl-home-dayempty" data-day-empty="">
              <span className="pl-home-dayempty-text">Sin partidos este día</span>
              {emptyJumpTarget ? (
                <button
                  type="button"
                  className="pl-btn-glass pl-home-dayjump min-h-11"
                  data-day-jump=""
                  onClick={() => jumpDay(emptyJumpTarget.dayId, emptyJumpTarget.resetFilters)}
                >
                  {formatJumpDayLabel(emptyJumpTarget.dayId, today)}
                </button>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* Tira rápida de marcadores en escritorio (>= 768px) */}
        {orderedChips.length > 0 ? (
          <div
            className={`pl-home-chips-wrap pl-home-desktop-strip ${mobileView === "radar" ? "is-mobile-hidden" : ""}`.trim()}
          >
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
                    onClick={() => {
                      handleSelectGame(game.id);
                      scrollToMatchCard(game.id);
                    }}
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
                            size={16}
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
                            size={16}
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
                            size={16}
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
                            size={16}
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
        ) : null}

        {/* Subtítulo compacto H1 de la jornada */}
        <h1
          className={`pl-home-kicker-h1 ${mobileView === "radar" ? "is-mobile-hidden" : ""}`.trim()}
        >
          Resultados en directo y pronósticos calibrados ·{" "}
          <span className="num">{statusFilteredGames.length}</span>{" "}
          {statusFilteredGames.length === 1 ? "partido" : "partidos"}
        </h1>

        {/* Área Maestro-Detalle de 2 tarjetas divididas */}
        <div
          className={`pl-home-master-detail ${density === "cards" ? "is-cards-mode" : ""}`.trim()}
          data-master-detail-layout=""
        >
          {/* Columna izquierda: Tarjeta unificada de jornada (Todos | Favoritos | Competiciones + < Hoy > + En Vivo/FT/Próx + Momios) */}
          <div
            className={`pl-home-master-col ${mobileView === "radar" ? "is-mobile-hidden" : ""}`.trim()}
          >
            <div className="pl-feed-shell glass-card glass-ring">
              {/* Fila 1: Todos | Favoritos | Competiciones + Selector < Hoy > */}
              <div className="pl-feed-toprow">
                <div
                  role="group"
                  aria-label="Elegir liga"
                  className="pl-feed-scope-tabs"
                >
                  <button
                    type="button"
                    className={`pl-feed-scope-btn ${feedScope === "all" && league === ALL ? "is-on" : ""}`.trim()}
                    aria-pressed={feedScope === "all" && league === ALL}
                    onClick={() => {
                      setFeedScope("all");
                      setLeague(ALL);
                    }}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    className={`pl-feed-scope-btn ${feedScope === "favorites" ? "is-on" : ""}`.trim()}
                    aria-pressed={feedScope === "favorites"}
                    onClick={() => setFeedScope((prev) => (prev === "favorites" ? "all" : "favorites"))}
                  >
                    <span>Favoritos</span>
                    {favLeagues.length > 0 ? (
                      <span className="num text-[11px] opacity-75">({favLeagues.length})</span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className={`pl-feed-scope-btn ${league !== ALL ? "is-on" : ""}`.trim()}
                    data-leagues-trigger=""
                    aria-haspopup="dialog"
                    aria-expanded={leaguesModalOpen}
                    onClick={() => setLeaguesModalOpen(true)}
                  >
                    <span className="truncate max-w-[96px] sm:max-w-[132px]">
                      {activeLeagueLabel}
                    </span>
                  </button>
                </div>

                <div role="group" aria-label="Elegir día" className="pl-astro-datebar shrink-0">
                  <div className="pl-home-dayseg is-compact" role="group" aria-label="Control del día">
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

              {/* Fila 2: Píldoras En Vivo / Finalizado / Próximo + Interruptor Momios + Vista */}
              <div className="pl-feed-subrow">
                <div className="pl-feed-status-pills" role="group" aria-label="Estado de los partidos">
                  <button
                    type="button"
                    className={`pl-feed-status-pill is-live num ${statusFilter === "live" ? "is-on" : ""}`.trim()}
                    aria-pressed={statusFilter === "live"}
                    onClick={() => setStatusFilter((prev) => (prev === "live" ? "all" : "live"))}
                  >
                    <span>En Vivo ({liveCountInVisible})</span>
                  </button>
                  <button
                    type="button"
                    className={`pl-feed-status-pill ${statusFilter === "finished" ? "is-on" : ""}`.trim()}
                    aria-pressed={statusFilter === "finished"}
                    onClick={() => setStatusFilter((prev) => (prev === "finished" ? "all" : "finished"))}
                  >
                    Finalizado
                  </button>
                  <button
                    type="button"
                    className={`pl-feed-status-pill ${statusFilter === "upcoming" ? "is-on" : ""}`.trim()}
                    aria-pressed={statusFilter === "upcoming"}
                    onClick={() => setStatusFilter((prev) => (prev === "upcoming" ? "all" : "upcoming"))}
                  >
                    Próximo
                  </button>
                </div>

                <div className="inline-flex items-center gap-1.5 ml-auto shrink-0">
                  <label className="pl-odds-switch" data-odds-switch="">
                    <span className="pl-odds-switch-label">Momios</span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={showInlineOdds}
                      onChange={(e) => setShowInlineOdds(e.target.checked)}
                      {...({ switch: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
                    />
                  </label>

                  <button
                    type="button"
                    className={`pl-feed-icon-btn ${activeExtraFiltersCount > 0 ? "is-active" : ""}`.trim()}
                    data-filters-trigger=""
                    aria-haspopup="dialog"
                    aria-expanded={filtersModalOpen}
                    aria-label="Filtros y vista"
                    onClick={() => setFiltersModalOpen(true)}
                  >
                    <MaestroIcon name="sliders" size={14} />
                  </button>
                </div>
              </div>

              {/* Contenido de la lista de partidos */}
              {feedScope === "favorites" && favLeagues.length === 0 && followedTeams.length === 0 ? (
                <div className="p-6 text-center space-y-2.5">
                  <p className="m-0 text-sm font-bold">Aún no tienes competiciones favoritas</p>
                  <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                    Abre «Competiciones» y toca la estrella ★ en tus ligas preferidas para filtrar tu jornada a un toque.
                  </p>
                  <button
                    type="button"
                    className="pl-btn-glass text-xs min-h-11 px-4"
                    onClick={() => setLeaguesModalOpen(true)}
                  >
                    Elegir competiciones favoritas
                  </button>
                </div>
              ) : (
                <HomeMatchCardsSection
                  groups={dayGroups}
                  today={today}
                  liveByGameId={liveByGameId}
                  density={density}
                  showInlineOdds={showInlineOdds}
                  selectedGameId={activePreviewGame?.id ?? null}
                  onSelectGame={handleSelectGame}
                  recentFormByTeam={recentFormByTeam}
                />
              )}
            </div>
          </div>

          {/* Columna derecha: Inspector Maestro-Detalle en Escritorio + Radar/Parlay en Móvil */}
          <aside
            aria-label="Detalle del partido, parlays y picks del día"
            className={`pl-home-detail-col ${mobileView === "partidos" ? "is-mobile-hidden" : ""}`.trim()}
          >
            {/* Conmutador superior solo en escritorio (>= 1100px): Partido vs Tu Parlay */}
            <div
              className="pl-home-desktop-switcher seg-well"
              role="group"
              aria-label="Modo del panel derecho"
              data-desktop-detail-switcher=""
            >
              <button
                type="button"
                className="seg-btn flex-1 min-h-10 text-xs font-bold"
                aria-pressed={desktopDetailMode === "match"}
                data-detail-tab="match"
                onClick={() => setDesktopDetailMode("match")}
              >
                <span>Partido seleccionado</span>
              </button>
              <button
                type="button"
                className="seg-btn flex-1 min-h-10 text-xs font-bold"
                aria-pressed={desktopDetailMode === "radar"}
                data-detail-tab="radar"
                onClick={() => setDesktopDetailMode("radar")}
              >
                <span>Tu Parlay y Picks</span>
                <span className="pl-parlay-hub-badge num">{parlaySummary.legs.length}</span>
              </button>
            </div>

            {desktopDetailMode === "match" && activePreviewGame ? (
              <div className="pl-home-desktop-only-preview">
                <HomeMatchPreviewPane
                  game={activePreviewGame}
                  liveEntry={liveByGameId.get(activePreviewGame.id)}
                />
              </div>
            ) : null}

            <div
              className={
                desktopDetailMode === "match" && activePreviewGame
                  ? "pl-home-radar-stack is-desktop-hidden"
                  : "pl-home-radar-stack"
              }
            >
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
            </div>
          </aside>
        </div>

        {/* Hoja / Modal de Ligas, Favoritas y Mis Equipos */}
        <TopLayerModalDialog
          open={leaguesModalOpen}
          onClose={() => setLeaguesModalOpen(false)}
          ariaLabel="Seleccionar competición o equipo"
          maxWidth="28rem"
        >
          <div className="p-4 sm:p-5 space-y-3.5" style={{ background: "var(--pl-surface)" }}>
            <div className="flex items-center justify-between gap-2">
              <strong className="text-base font-extrabold">Competiciones y equipos</strong>
              <button
                type="button"
                className="pl-btn-glass min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl"
                aria-label="Cerrar selector de ligas"
                onClick={() => setLeaguesModalOpen(false)}
              >
                <MaestroIcon name="x" size={16} />
              </button>
            </div>

            <input
              type="search"
              value={leagueSearch}
              onChange={(e) => setLeagueSearch(e.target.value)}
              placeholder="Buscar liga o torneo..."
              aria-label="Buscar liga o torneo"
              className="glass-input w-full min-h-11 px-3 text-sm rounded-xl"
            />

            <div className="max-h-80 overflow-y-auto space-y-1 pr-1">
              <button
                type="button"
                className={`pl-astro-comp-item w-full min-h-11 ${league === ALL ? "is-on" : ""}`.trim()}
                aria-pressed={league === ALL}
                data-league-filter={ALL}
                onClick={() => {
                  setLeague(ALL);
                  setLeaguesModalOpen(false);
                }}
              >
                <span className="truncate font-bold">Todas las ligas</span>
                <span className="pl-astro-comp-count num">{sportGames.length}</span>
              </button>

              {searchableLeagues.map((item) => {
                const on = league === item.id;
                const isFav = favLeagues.includes(item.id);
                return (
                  <div key={item.id} className={`pl-astro-comp-row ${on ? "is-on" : ""}`.trim()}>
                    <button
                      type="button"
                      className={`pl-astro-comp-item min-h-11 ${on ? "is-on" : ""}`.trim()}
                      aria-pressed={on}
                      data-league-filter={item.id}
                      onClick={() => {
                        setLeague(item.id);
                        setLeaguesModalOpen(false);
                      }}
                    >
                      <LeagueBadge league={item.id} label={item.label} logoUrl={item.logoUrl} size={20} />
                      <span className="truncate font-semibold flex-1 text-left">{item.label}</span>
                      <span className="pl-astro-comp-count num">{item.count}</span>
                    </button>
                    <button
                      type="button"
                      className={`pl-astro-fav-btn min-h-11 min-w-11 ${isFav ? "is-fav" : ""}`.trim()}
                      aria-label={isFav ? `Quitar ${item.label} de favoritas` : `Fijar ${item.label} en favoritas`}
                      aria-pressed={isFav}
                      onClick={() => toggleFavLeague(item.id)}
                    >
                      <span aria-hidden="true">{isFav ? "★" : "☆"}</span>
                    </button>
                  </div>
                );
              })}
            </div>

            {followedTeams.length > 0 ? (
              <div className="pt-2 hairline-t space-y-2">
                <span className="text-xs font-extrabold uppercase tracking-wider" style={{ color: "var(--pl-text-muted)" }}>
                  Mis equipos en boleto
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {followedTeams.map((tm) => (
                    <a
                      key={`${tm.league}.${tm.slug}`}
                      href={`/app/${tm.league}/teams/${tm.slug}`}
                      onClick={(e) => {
                        e.preventDefault();
                        setLeaguesModalOpen(false);
                        navigateTo(`/app/${tm.league}/teams/${tm.slug}`);
                      }}
                      className="pl-btn-glass min-h-10 px-2.5 text-xs inline-flex items-center gap-1.5 no-underline"
                    >
                      <TeamBadge league={tm.league} slug={tm.slug} name={tm.name} logoUrl={tm.logoUrl} size={16} />
                      <span>{tm.name}</span>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </TopLayerModalDialog>

        {/* Hoja / Modal de Filtros y Densidad */}
        <TopLayerModalDialog
          open={filtersModalOpen}
          onClose={() => setFiltersModalOpen(false)}
          ariaLabel="Filtros de partidos y densidad visual"
          maxWidth="24rem"
        >
          <div className="p-4 sm:p-5 space-y-4" style={{ background: "var(--pl-surface)" }}>
            <div className="flex items-center justify-between gap-2">
              <strong className="text-base font-extrabold">Filtros y vista</strong>
              <button
                type="button"
                className="pl-btn-glass min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl"
                aria-label="Cerrar filtros"
                onClick={() => setFiltersModalOpen(false)}
              >
                <MaestroIcon name="x" size={16} />
              </button>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-bold block" style={{ color: "var(--pl-text-muted)" }}>
                Estado de los partidos
              </span>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Estado de los partidos">
                {STATUS_FILTERS.map((sf) => (
                  <button
                    key={sf.id}
                    type="button"
                    className={`pl-astro-status-btn min-h-11 ${statusFilter === sf.id ? "is-on" : ""}`.trim()}
                    aria-pressed={statusFilter === sf.id}
                    onClick={() => setStatusFilter(sf.id)}
                  >
                    {sf.label}
                  </button>
                ))}
                <button
                  type="button"
                  className={`pl-astro-status-btn is-ai min-h-11 ${statusFilter === "ai" ? "is-on" : ""}`.trim()}
                  aria-pressed={statusFilter === "ai"}
                  onClick={() => setStatusFilter((prev) => (prev === "ai" ? "all" : "ai"))}
                >
                  <MaestroIcon name="sparkles" size={12} />
                  <span>Con IA (≥ 58 %)</span>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-bold block" style={{ color: "var(--pl-text-muted)" }}>
                Densidad de la lista
              </span>
              <div className="seg-well" role="group" aria-label="Densidad de partidos" data-density-toggle="">
                <button
                  type="button"
                  className="seg-btn flex-1 min-h-11 text-xs font-bold"
                  aria-pressed={density === "compact"}
                  onClick={() => setDensity("compact")}
                >
                  Compacta
                </button>
                <button
                  type="button"
                  className="seg-btn flex-1 min-h-11 text-xs font-bold"
                  aria-pressed={density === "cards"}
                  onClick={() => setDensity("cards")}
                >
                  Tarjetas completas
                </button>
              </div>
            </div>

            <button
              type="button"
              className="pl-btn-primary w-full min-h-11 text-sm font-bold"
              onClick={() => setFiltersModalOpen(false)}
            >
              Listo
            </button>
          </div>
        </TopLayerModalDialog>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
