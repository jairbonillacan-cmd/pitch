/**
 * Lógica pura del Inicio del Club: días, deportes, ligas, agrupación y picks destacados.
 * Sin React ni estado, para probarla aparte de la vista.
 */
import {
  COMPETITION_CATALOG,
  competitionPrestigeScore,
  isLeagueActiveInWindow,
  isNationalCompetition,
  type LeagueId,
} from "@pitchlab/contracts";
import type { MatchPick, PlatformGame, PlatformLeagueSummary } from "../../types";

export type SportId = "futbol" | "selecciones" | "nfl" | "nba" | "nhl" | "mlb";
export const ALL = "all" as const;
export type SportFilter = SportId | typeof ALL;
export type LeagueFilter = LeagueId | typeof ALL;

/** Selección de la barra de días: la ventana de próximos días o un día concreto (`YYYY-MM-DD`). */
export const UPCOMING = "proximos" as const;
export type DaySelection = typeof UPCOMING | string;

export const UPCOMING_WINDOW_DAYS = 7;

export const SPORTS: ReadonlyArray<{ id: SportId; label: string; shortLabel: string }> = [
  { id: "futbol", label: "Fútbol", shortLabel: "Fútbol" },
  { id: "selecciones", label: "Selecciones", shortLabel: "Selecciones" },
  { id: "nfl", label: "Fútbol americano", shortLabel: "NFL" },
  { id: "nba", label: "Basquetbol", shortLabel: "NBA" },
  { id: "nhl", label: "Hockey", shortLabel: "NHL" },
  { id: "mlb", label: "Béisbol", shortLabel: "MLB" },
];

/** Orden fijo de ligas y competencias derivado del catálogo maestro (ADR-043). */
const LEAGUE_ORDER: readonly string[] = COMPETITION_CATALOG.map((c) => c.id);

export function sportOf(game: Pick<PlatformGame, "sport">): SportId {
  if (game.sport === "american-football") return "nfl";
  if (game.sport === "basketball") return "nba";
  if (game.sport === "ice-hockey") return "nhl";
  if (game.sport === "baseball") return "mlb";
  return "futbol";
}

export function matchesSportFilter(
  game: Pick<PlatformGame, "sport" | "league">,
  sport: SportFilter,
): boolean {
  if (sport === ALL) return true;
  if (sport === "selecciones") return isNationalCompetition(game.league);
  return sportOf(game) === sport;
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

const SHORT_MONTHS_ES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;

export function shortWeekday(dayId: string): string {
  return WEEKDAY_SHORT[dateOf(dayId).getUTCDay()] ?? "";
}

export function dayNumber(dayId: string): number {
  return dateOf(dayId).getUTCDate();
}

/** «lun 16 nov» o «sáb 21 nov». */
export function shortDateLabel(dayId: string): string {
  if (!dayId || dayId.length < 10) return dayId;
  const d = dateOf(dayId);
  if (Number.isNaN(d.getTime())) return dayId;
  const wd = (WEEKDAY_SHORT[d.getUTCDay()] ?? "").toLowerCase();
  const mon = SHORT_MONTHS_ES[d.getUTCMonth()] ?? "";
  return `${wd} ${d.getUTCDate()} ${mon}`.trim();
}

/** «Sábado 21 de noviembre». */
export function longDayLabel(dayId: string): string {
  const d = dateOf(dayId);
  return `${WEEKDAY_LONG[d.getUTCDay()]} ${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]}`;
}

export function isInUpcomingWindow(dayId: string, today: string, windowDays = UPCOMING_WINDOW_DAYS): boolean {
  return dayId >= today && dayId <= addDays(today, windowDays - 1);
}

/** Ligas disponibles para un deporte dado con conteo de partidos en el día seleccionado. */
export interface HomeSportLeagueItem {
  league: LeagueId;
  label: string;
  logoUrl?: string;
  dayCount: number;
  totalCount: number;
}

export function buildHomeSportLeagues(
  leagues: readonly PlatformLeagueSummary[],
  games: readonly PlatformGame[],
  dayGames: readonly PlatformGame[],
  sport: SportFilter,
  today?: string,
): HomeSportLeagueItem[] {
  if (sport === ALL) return [];
  const refToday = today || todayId("America/Mexico_City");
  const dayCountByLeague = new Map<LeagueId, number>();
  for (const g of dayGames) {
    dayCountByLeague.set(g.league, (dayCountByLeague.get(g.league) ?? 0) + 1);
  }
  const totalCountByLeague = new Map<LeagueId, number>();
  for (const g of games) {
    totalCountByLeague.set(g.league, (totalCountByLeague.get(g.league) ?? 0) + 1);
  }
  return leagues
    .filter((lg) => matchesSportFilter({ sport: lg.sport, league: lg.league }, sport))
    .map((lg) => ({
      league: lg.league,
      label: lg.label,
      logoUrl: lg.logoUrl,
      dayCount: dayCountByLeague.get(lg.league) ?? 0,
      totalCount: totalCountByLeague.get(lg.league) ?? lg.totalGames,
    }))
    .filter(
      (lg) =>
        lg.dayCount > 0 ||
        isLeagueActiveInWindow(games, lg.league, refToday, 30),
    )
    .sort((a, b) => {
      if ((b.dayCount > 0) !== (a.dayCount > 0)) return b.dayCount > 0 ? 1 : -1;
      return leagueRank(a.league) - leagueRank(b.league);
    });
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

/** Resuelve el día activo en /app a partir de una selección explícita o del calendario disponible. */
export function resolveHomeDay(
  games: readonly PlatformGame[],
  chosenDay: DaySelection | null,
  today: string,
): string {
  if (chosenDay && chosenDay !== UPCOMING) return chosenDay;
  if (games.some((g) => g.dayId >= today)) return today;
  const last = games.reduce<string>((acc, g) => (g.dayId > acc ? g.dayId : acc), "");
  return last || today;
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
    (g) => matchesSportFilter(g, sport) && (league === ALL || g.league === league),
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

export interface DayLeagueMatchGroup {
  league: LeagueId;
  label: string;
  /** Escudo de la liga (Bzzoiro) cuando el snapshot lo trae. */
  logoUrl?: string;
  sport: SportId;
  round: string;
  count: number;
  games: PlatformGame[];
}

export interface DayMatchGroup {
  dayId: string;
  count: number;
  leagues: DayLeagueMatchGroup[];
}

/**
 * Agrupa los partidos primero por día (orden cronológico) y luego por liga (`LEAGUE_ORDER`),
 * ordenando los encuentros por hora de inicio dentro de cada liga.
 */
export function groupMatchesByDayAndLeague(
  games: readonly PlatformGame[],
): DayMatchGroup[] {
  const days = Array.from(new Set(games.map((g) => g.dayId))).sort();
  return days
    .map((dayId) => {
      const dayGames = games.filter((g) => g.dayId === dayId);
      const leagues = leaguesIn(dayGames).map((league) => {
        const leagueGames = dayGames
          .filter((g) => g.league === league)
          .sort(byKickoff);
        const first = leagueGames[0]!;
        return {
          league,
          label: first.leagueLabel,
          logoUrl: leagueGames.find((g) => g.leagueLogoUrl)?.leagueLogoUrl,
          sport: sportOf(first),
          round: mostCommon(leagueGames.map((g) => g.round)),
          count: leagueGames.length,
          games: leagueGames,
        };
      });
      return {
        dayId,
        count: dayGames.length,
        leagues,
      };
    })
    .filter((d) => d.count > 0);
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

/** Resultado ganador más probable. Solo el fútbol contempla empate en el partido. */
export function mostLikelyOutcome(
  game: Pick<PlatformGame, "x12" | "sport" | "home" | "away">,
): MostLikelyOutcome | null {
  if (!game.x12) return null;
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

/**
 * Motor de relevancia para la barra de «Tendencias» (Imagen 1 · ADR-043).
 *
 * - En `Todos` muestra los próximos partidos más relevantes de TODOS los deportes
 *   (asegurando variedad multideporte cuando hay acción en varios deportes).
 * - En `Fútbol` + `Todas las ligas` muestra los próximos más relevantes de todas las ligas de fútbol.
 * - En cualquier deporte o liga específica aplica la misma lógica de proximidad + prestigio + derbi + señal.
 */
export function getTrendingMatches(params: {
  games: readonly PlatformGame[];
  sport: SportFilter;
  league: LeagueFilter;
  today: string;
  liveIds?: ReadonlySet<string>;
  maxItems?: number;
}): PlatformGame[] {
  const { games, sport, league, today, liveIds, maxItems = 12 } = params;
  const scoped = games.filter((g) => {
    if (!matchesSportFilter(g, sport)) return false;
    if (league !== ALL && g.league !== league) return false;
    return true;
  });
  if (scoped.length === 0) return [];

  const horizon30 = addDays(today, 30);
  const upcomingOrLive = scoped.filter((g) => {
    const isLive = Boolean(liveIds?.has(g.id)) || String(g.status) === "LIVE";
    if (isLive) return true;
    if (g.status === "FT") return false;
    return g.dayId >= today && g.dayId <= horizon30;
  });
  const pool = upcomingOrLive.length > 0 ? upcomingOrLive : scoped.filter((g) => g.status !== "FT");
  const effectivePool = pool.length > 0 ? pool : scoped;

  const todayMs = Date.parse(`${today}T12:00:00Z`);
  const scoreOf = (g: PlatformGame): number => {
    const isLive = Boolean(liveIds?.has(g.id)) || String(g.status) === "LIVE";
    let score = 0;
    if (isLive) score += 1000;
    const dayMs = Date.parse(`${g.dayId}T12:00:00Z`);
    const deltaDays = Number.isFinite(dayMs) && Number.isFinite(todayMs)
      ? Math.round((dayMs - todayMs) / 86_400_000)
      : 7;
    if (deltaDays <= 0) score += 420;
    else if (deltaDays === 1) score += 340;
    else if (deltaDays <= 3) score += 260;
    else if (deltaDays <= 7) score += 180;
    else if (deltaDays <= 14) score += 100;
    else score += 40;

    score += competitionPrestigeScore(g.league);
    if (g.preGame?.matchContext?.isLocalDerby) score += 75;
    if (typeof g.confidenceScore === "number") score += Math.round(g.confidenceScore * 0.5);
    const mainPick = g.picks[0];
    if (mainPick && mainPick.marketDecimal && mainPick.marketDecimal > mainPick.fairDecimal) {
      score += 35;
    }
    return score;
  };

  const ranked = [...effectivePool].sort((a, b) => {
    const diff = scoreOf(b) - scoreOf(a);
    if (diff !== 0) return diff;
    return a.kickoffUtc.localeCompare(b.kickoffUtc) || a.id.localeCompare(b.id);
  });

  // En vista amplia (Todos los deportes o Todas las ligas de fútbol), balanceamos para no repetir una sola liga 10 veces
  if (league === ALL && ranked.length > maxItems) {
    const picked: PlatformGame[] = [];
    const seenIds = new Set<string>();
    const perBucketCap = sport === ALL ? 3 : 2;
    const bucketCounts = new Map<string, number>();

    for (const g of ranked) {
      if (picked.length >= maxItems) break;
      const bucket = sport === ALL ? sportOf(g) : g.league;
      const count = bucketCounts.get(bucket) ?? 0;
      if (count >= perBucketCap) continue;
      picked.push(g);
      seenIds.add(g.id);
      bucketCounts.set(bucket, count + 1);
    }
    for (const g of ranked) {
      if (picked.length >= maxItems) break;
      if (!seenIds.has(g.id)) picked.push(g);
    }
    return picked;
  }

  return ranked.slice(0, maxItems);
}
