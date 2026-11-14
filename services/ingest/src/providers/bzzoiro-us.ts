/**
 * NBA y NHL desde Bzzoiro (`/basketball/api/v2/events/` y `/hockey/api/v2/matches/`).
 *
 * Plan gratis: 100 peticiones al día por deporte («taster»); el Sports Pack (US$7/mes) quita el
 * tope. Una temporada completa cuesta ~7 peticiones (200 partidos por página), así que la
 * historia cabe en el plan gratis. Misma licencia que el fútbol: entrenar y publicar salidas
 * derivadas sí; redistribuir el dato crudo no (va a `data/history/research/`, fuera de Git).
 *
 * Ojo: el filtro de liga es `league`, no `league_id` (con `league_id` mezcla ligas).
 */
import type { ProviderClient } from "./http.js";

export type UsSport = "nba" | "nhl";

export const BZZOIRO_US = {
  nba: { path: "/basketball/api/v2/events/", league: 1 },
  nhl: { path: "/hockey/api/v2/matches/", league: 65 },
} as const;

interface BzUsTeam {
  id: number;
  name: string;
  short_name?: string | null;
  elo_rating?: number | null;
}

interface BzUsEvent {
  id: number;
  league?: { id: number; name?: string };
  home_team: BzUsTeam;
  away_team: BzUsTeam;
  event_date?: string;
  match_date?: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  is_overtime?: boolean | null;
  is_shootout?: boolean | null;
}

interface BzPage<T> {
  count: number;
  next: string | null;
  results: T[];
}

export interface UsGameRow {
  source: "bzzoiro";
  sport: UsSport;
  season: string;
  providerMatchId: number;
  kickoffUtc: string;
  status: string;
  home: { providerTeamId: number; name: string; shortName: string | null };
  away: { providerTeamId: number; name: string; shortName: string | null };
  homeScore: number | null;
  awayScore: number | null;
  /** NHL: el partido se definió en tiempo extra o en penales. */
  overtime: boolean;
  shootout: boolean;
  /** NHL: Elo que publica Bzzoiro antes del partido (referencia para comparar, no entrada). */
  providerEloHome: number | null;
  providerEloAway: number | null;
}

/** Temporada `2025-26` a partir de la fecha: NBA y NHL arrancan en sept–oct. */
export function usSeasonOf(kickoffUtc: string): string {
  const year = Number(kickoffUtc.slice(0, 4));
  const month = Number(kickoffUtc.slice(5, 7));
  const start = month >= 8 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function toUsGameRow(sport: UsSport, e: BzUsEvent): UsGameRow {
  const kickoffUtc = e.event_date ?? e.match_date ?? "";
  return {
    source: "bzzoiro",
    sport,
    season: usSeasonOf(kickoffUtc),
    providerMatchId: e.id,
    kickoffUtc,
    status: e.status,
    home: { providerTeamId: e.home_team.id, name: e.home_team.name, shortName: e.home_team.short_name ?? null },
    away: { providerTeamId: e.away_team.id, name: e.away_team.name, shortName: e.away_team.short_name ?? null },
    homeScore: num(e.home_score),
    awayScore: num(e.away_score),
    overtime: e.is_overtime === true,
    shootout: e.is_shootout === true,
    providerEloHome: num(e.home_team.elo_rating),
    providerEloAway: num(e.away_team.elo_rating),
  };
}

/**
 * Todos los partidos de una temporada (del 1 de agosto al 31 de julio). Las temporadas
 * cerradas se cachean para siempre; la en curso se pide fresca.
 */
export async function collectUsSeason(
  client: ProviderClient,
  sport: UsSport,
  startYear: number,
  isCurrent: boolean,
): Promise<UsGameRow[]> {
  const { path, league } = BZZOIRO_US[sport];
  const rows: UsGameRow[] = [];
  const limit = 200;
  for (let offset = 0; offset < 10_000; offset += limit) {
    const page = await client.get<BzPage<BzUsEvent>>(
      `${path}?league=${league}&date_from=${startYear}-08-01&date_to=${startYear + 1}-07-31&limit=${limit}&offset=${offset}`,
      { cache: !isCurrent },
    );
    if (!page) break;
    rows.push(...page.results.filter((e) => e.league?.id === undefined || e.league.id === league).map((e) => toUsGameRow(sport, e)));
    if (!page.next || page.results.length < limit) break;
  }
  return rows.sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));
}
