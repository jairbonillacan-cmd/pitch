/**
 * Lógica pura del Inicio del Club: días, deportes, ligas, agrupación y picks destacados.
 * Sin React ni estado, para probarla aparte de la vista.
 */
import type { LeagueId } from "@pitchlab/contracts";
import type { MatchPick, PlatformGame } from "../../types";

export type SportId = "futbol" | "nfl";
export const ALL = "all" as const;
export type SportFilter = SportId | typeof ALL;
export type LeagueFilter = LeagueId | typeof ALL;

/** Selección de la barra de días: la ventana de próximos días o un día concreto (`YYYY-MM-DD`). */
export const UPCOMING = "proximos" as const;
export type DaySelection = typeof UPCOMING | string;

export const UPCOMING_WINDOW_DAYS = 7;

export const SPORTS: ReadonlyArray<{ id: SportId; label: string; shortLabel: string }> = [
  { id: "futbol", label: "Fútbol", shortLabel: "Fútbol" },
  { id: "nfl", label: "Fútbol americano", shortLabel: "NFL" },
];

/** Orden fijo de ligas: México primero, luego Europa y al final la NFL. */
const LEAGUE_ORDER: readonly string[] = [
  "liga-mx",
  "premier-league",
  "laliga",
  "bundesliga",
  "serie-a",
  "ligue-1",
  "nfl",
];

export function sportOf(game: Pick<PlatformGame, "sport">): SportId {
  return game.sport === "american-football" ? "nfl" : "futbol";
}

export function leagueRank(league: string): number {
  const i = LEAGUE_ORDER.indexOf(league);
  return i === -1 ? LEAGUE_ORDER.length : i;
}

/** Fecha `YYYY-MM-DD` de hoy en la zona horaria del socio. */
export function todayId(timeZone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch (err) {
    void err;
    return now.toISOString().slice(0, 10);
  }
}

function dateOf(dayId: string): Date {
  return new Date(`${dayId}T12:00:00Z`);
}

export function addDays(dayId: string, days: number): string {
  const d = dateOf(dayId);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const WEEKDAY_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const WEEKDAY_LONG = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MONTHS = [
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
];

export function shortWeekday(dayId: string): string {
  return WEEKDAY_SHORT[dateOf(dayId).getUTCDay()] ?? "";
}

export function dayNumber(dayId: string): number {
  return dateOf(dayId).getUTCDate();
}

/** «Sábado 21 de noviembre». */
export function longDayLabel(dayId: string): string {
  const d = dateOf(dayId);
  return `${WEEKDAY_LONG[d.getUTCDay()]} ${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]}`;
}

export function isInUpcomingWindow(dayId: string, today: string, windowDays = UPCOMING_WINDOW_DAYS): boolean {
  return dayId >= today && dayId <= addDays(today, windowDays - 1);
}

export function gamesForSelection(
  games: readonly PlatformGame[],
  selection: DaySelection,
  today: string,
  windowDays = UPCOMING_WINDOW_DAYS,
): PlatformGame[] {
  if (selection === UPCOMING) {
    return games.filter((g) => isInUpcomingWindow(g.dayId, today, windowDays));
  }
  return games.filter((g) => g.dayId === selection);
}

export function leaguesIn(games: readonly PlatformGame[]): LeagueId[] {
  return Array.from(new Set(games.map((g) => g.league))).sort((a, b) => leagueRank(a) - leagueRank(b));
}

export interface DayOption {
  key: DaySelection;
  isUpcoming: boolean;
  isToday: boolean;
  isPast: boolean;
  count: number;
  leagues: LeagueId[];
}

/** «Próximos 7 días» primero y luego cada día con partidos, en orden; los pasados son resultados. */
export function buildDayOptions(
  games: readonly PlatformGame[],
  today: string,
  windowDays = UPCOMING_WINDOW_DAYS,
): DayOption[] {
  const upcoming = gamesForSelection(games, UPCOMING, today, windowDays);
  const days = Array.from(new Set(games.map((g) => g.dayId))).sort();
  return [
    {
      key: UPCOMING,
      isUpcoming: true,
      isToday: false,
      isPast: false,
      count: upcoming.length,
      leagues: leaguesIn(upcoming),
    },
    ...days.map((dayId) => {
      const dayGames = games.filter((g) => g.dayId === dayId);
      return {
        key: dayId,
        isUpcoming: false,
        isToday: dayId === today,
        isPast: dayId < today,
        count: dayGames.length,
        leagues: leaguesIn(dayGames),
      };
    }),
  ];
}

export function filterGames(
  games: readonly PlatformGame[],
  sport: SportFilter,
  league: LeagueFilter,
): PlatformGame[] {
  return games.filter(
    (g) => (sport === ALL || sportOf(g) === sport) && (league === ALL || g.league === league),
  );
}

function mostCommon(values: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = "";
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

function byKickoff(a: PlatformGame, b: PlatformGame): number {
  return a.kickoffUtc.localeCompare(b.kickoffUtc) || a.id.localeCompare(b.id);
}

export interface HomeLeagueGroup {
  league: LeagueId;
  label: string;
  round: string;
  count: number;
  days: Array<{ dayId: string; games: PlatformGame[] }>;
}

export interface HomeSportSection {
  sport: SportId;
  label: string;
  count: number;
  leagues: HomeLeagueGroup[];
}

/** Deporte → liga → día, cada nivel en orden fijo y los partidos por hora de inicio. */
export function buildSections(games: readonly PlatformGame[]): HomeSportSection[] {
  return SPORTS.map((sport) => {
    const sportGames = games.filter((g) => sportOf(g) === sport.id);
    const leagues = leaguesIn(sportGames).map((league) => {
      const leagueGames = sportGames.filter((g) => g.league === league).sort(byKickoff);
      const days = Array.from(new Set(leagueGames.map((g) => g.dayId))).sort();
      return {
        league,
        label: leagueGames[0]?.leagueLabel ?? league,
        round: mostCommon(leagueGames.map((g) => g.round)),
        count: leagueGames.length,
        days: days.map((dayId) => ({ dayId, games: leagueGames.filter((g) => g.dayId === dayId) })),
      };
    });
    return { sport: sport.id, label: sport.label, count: sportGames.length, leagues };
  }).filter((s) => s.count > 0);
}

export interface MostLikelyOutcome {
  side: "home" | "draw" | "away";
  label: string;
  p: number;
}

/** Resultado del 1·X·2 con más probabilidad. En la NFL no hay empate. */
export function mostLikelyOutcome(game: Pick<PlatformGame, "x12" | "sport" | "home" | "away">): MostLikelyOutcome {
  const [ph, pd, pa] = game.x12;
  const options: MostLikelyOutcome[] = [
    { side: "home", label: `${game.home.shortName} gana`, p: ph },
    { side: "away", label: `${game.away.shortName} gana`, p: pa },
  ];
  if (sportOf(game) === "futbol") options.splice(1, 0, { side: "draw", label: "Empate", p: pd });
  return options.reduce((best, o) => (o.p > best.p ? o : best));
}

export interface GamePick {
  game: PlatformGame;
  pick: MatchPick;
}

/** Pick principal de cada partido abierto, de mayor a menor probabilidad. */
export function topPrincipalPicks(
  games: readonly PlatformGame[],
  limit: number,
  isUnlocked: (pick: MatchPick, game: PlatformGame) => boolean,
): GamePick[] {
  return games
    .filter((g) => g.status !== "FT" && g.picks[0] && isUnlocked(g.picks[0], g))
    .map((g) => ({ game: g, pick: g.picks[0]! }))
    .sort((a, b) => b.pick.p - a.pick.p)
    .slice(0, limit);
}

/** Picks con momio real de casa por encima del momio justo del modelo. */
export function valuePicks(
  games: readonly PlatformGame[],
  isUnlocked: (pick: MatchPick, game: PlatformGame) => boolean,
): GamePick[] {
  const out: GamePick[] = [];
  for (const game of games) {
    if (game.status === "FT") continue;
    for (const pick of game.picks) {
      if (pick.marketDecimal == null || pick.marketDecimal <= pick.fairDecimal) continue;
      if (!isUnlocked(pick, game)) continue;
      out.push({ game, pick });
    }
  }
  return out.sort(
    (a, b) =>
      (b.pick.marketDecimal ?? 0) / b.pick.fairDecimal - (a.pick.marketDecimal ?? 0) / a.pick.fairDecimal,
  );
}

/** Segunda selección del partido para mostrar como alternativa: la más probable que no sea la principal. */
export function alternativePick(game: Pick<PlatformGame, "picks">): MatchPick | null {
  const [main, ...rest] = game.picks;
  if (!main) return null;
  return rest.reduce<MatchPick | null>((best, p) => (best === null || p.p > best.p ? p : best), null);
}
