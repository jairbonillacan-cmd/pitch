/**
 * Adaptador genérico de openfootball/football.json (CC0).
 *
 * Ligas soportadas:
 * - Premier League: `2026-27/en.1.json`
 * - LaLiga: `2026-27/es.1.json`
 *
 * El histórico profundo vive en `services/ingest/src/history/`; este módulo solo alimenta
 * el snapshot de la temporada en curso que consume la app.
 */
import { z } from "zod";
import {
  asGameId,
  asLeagueId,
  asSeasonId,
  type GameDTO,
  type Team,
} from "@pitchlab/contracts";
import type { FootballTeamRateInput } from "@pitchlab/engines-reference";
import { listAllTeamsForLeague, resolveCanonicalTeam, type CanonicalLeague } from "../mappings.js";

const OPENFOOTBALL_BASE = "https://raw.githubusercontent.com/openfootball/football.json/master";

export const OPENFOOTBALL_PL_URL = `${OPENFOOTBALL_BASE}/2026-27/en.1.json`;
export const OPENFOOTBALL_LALIGA_URL = `${OPENFOOTBALL_BASE}/2026-27/es.1.json`;
export const OPENFOOTBALL_BUNDESLIGA_URL = `${OPENFOOTBALL_BASE}/2026-27/de.1.json`;
export const OPENFOOTBALL_SERIE_A_URL = `${OPENFOOTBALL_BASE}/2026-27/it.1.json`;
export const OPENFOOTBALL_LIGUE_1_URL = `${OPENFOOTBALL_BASE}/2026-27/fr.1.json`;

export const OpenFootballMatchSchema = z.object({
  round: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().optional().default("15:00"),
  team1: z.string().min(1),
  team2: z.string().min(1),
  score: z
    .union([
      z.object({
        ht: z.tuple([z.number(), z.number()]).optional(),
        ft: z.tuple([z.number(), z.number()]).optional(),
      }),
      z.array(z.unknown()).transform(() => undefined),
    ])
    .optional(),
});

export const OpenFootballSeasonSchema = z.object({
  name: z.string().min(1),
  matches: z.array(OpenFootballMatchSchema).min(1),
});

export type OpenFootballSeason = z.infer<typeof OpenFootballSeasonSchema>;

const PL_STADIUMS: Record<string, string> = {
  "premier-league.afc-bournemouth": "Vitality Stadium",
  "premier-league.arsenal": "Emirates Stadium",
  "premier-league.aston-villa": "Villa Park",
  "premier-league.brentford": "Gtech Community Stadium",
  "premier-league.brighton-hove-albion": "Amex Stadium",
  "premier-league.chelsea": "Stamford Bridge",
  "premier-league.coventry-city": "Coventry Building Society Arena",
  "premier-league.crystal-palace": "Selhurst Park",
  "premier-league.everton": "Hill Dickinson Stadium",
  "premier-league.fulham": "Craven Cottage",
  "premier-league.hull-city": "MKM Stadium",
  "premier-league.ipswich-town": "Portman Road",
  "premier-league.leeds-united": "Elland Road",
  "premier-league.liverpool": "Anfield",
  "premier-league.manchester-city": "Etihad Stadium",
  "premier-league.manchester-united": "Old Trafford",
  "premier-league.newcastle-united": "St. James' Park",
  "premier-league.nottingham-forest": "City Ground",
  "premier-league.sunderland": "Stadium of Light",
  "premier-league.tottenham-hotspur": "Tottenham Hotspur Stadium",
};

const LALIGA_STADIUMS: Record<string, string> = {
  "laliga.athletic-club": "San Mamés",
  "laliga.atletico-madrid": "Riyadh Air Metropolitano",
  "laliga.barcelona": "Spotify Camp Nou",
  "laliga.real-madrid": "Santiago Bernabéu",
  "laliga.real-sociedad": "Reale Arena",
  "laliga.real-betis": "Benito Villamarín",
  "laliga.sevilla": "Ramón Sánchez-Pizjuán",
  "laliga.valencia": "Mestalla",
  "laliga.villarreal": "Estadio de la Cerámica",
  "laliga.celta-vigo": "Balaídos",
  "laliga.espanyol": "RCDE Stadium",
  "laliga.osasuna": "El Sadar",
  "laliga.rayo-vallecano": "Estadio de Vallecas",
  "laliga.getafe": "Coliseum",
  "laliga.alaves": "Mendizorroza",
  "laliga.elche": "Martínez Valero",
  "laliga.levante": "Ciutat de València",
  "laliga.malaga": "La Rosaleda",
  "laliga.racing-santander": "El Sardinero",
  "laliga.deportivo-la-coruna": "Riazor",
};

export type OpenFootballLeague =
  | "premier-league"
  | "laliga"
  | "bundesliga"
  | "serie-a"
  | "ligue-1";

export interface OpenFootballLeagueConfig {
  league: OpenFootballLeague;
  seasonId: string;
  seasonLabel: string;
  /** Prefijo de `GameId`: p. ej. `pl-2026-27`. */
  idPrefix: string;
  stadiums: Record<string, string>;
  defaultVenue: string;
}

export const PREMIER_LEAGUE_CONFIG: OpenFootballLeagueConfig = {
  league: "premier-league",
  seasonId: "premier-league-2026-27",
  seasonLabel: "2026/27",
  idPrefix: "pl-2026-27",
  stadiums: PL_STADIUMS,
  defaultVenue: "Inglaterra",
};

export const LALIGA_CONFIG: OpenFootballLeagueConfig = {
  league: "laliga",
  seasonId: "laliga-2026-27",
  seasonLabel: "2026/27",
  idPrefix: "laliga-2026-27",
  stadiums: LALIGA_STADIUMS,
  defaultVenue: "España",
};

export const BUNDESLIGA_CONFIG: OpenFootballLeagueConfig = {
  league: "bundesliga",
  seasonId: "bundesliga-2026-27",
  seasonLabel: "2026/27",
  idPrefix: "bundesliga-2026-27",
  stadiums: {},
  defaultVenue: "Alemania",
};

export const SERIE_A_CONFIG: OpenFootballLeagueConfig = {
  league: "serie-a",
  seasonId: "serie-a-2026-27",
  seasonLabel: "2026/27",
  idPrefix: "serie-a-2026-27",
  stadiums: {},
  defaultVenue: "Italia",
};

export const LIGUE_1_CONFIG: OpenFootballLeagueConfig = {
  league: "ligue-1",
  seasonId: "ligue-1-2026-27",
  seasonLabel: "2026/27",
  idPrefix: "ligue-1-2026-27",
  stadiums: {},
  defaultVenue: "Francia",
};

function parseMatchdayNumber(round: string): number {
  const m = round.match(/(\d+)/);
  return m && m[1] ? Number(m[1]) : 1;
}

export interface NormalizedOpenFootballSeason {
  seasonId: string;
  seasonLabel: string;
  activeMatchday: number;
  periodLabel: string;
  allGames: GameDTO[];
  activeRoundGames: GameDTO[];
  teamRateInputs: FootballTeamRateInput[];
}

/** Compatibilidad con el nombre anterior (solo Premier League). */
export type NormalizedPremierLeagueSeason = NormalizedOpenFootballSeason;

export function normalizeOpenFootballLeague(
  rawJson: unknown,
  config: OpenFootballLeagueConfig,
  options: { referenceDate?: string; targetMatchday?: number } = {},
): NormalizedOpenFootballSeason {
  const parsed = OpenFootballSeasonSchema.parse(rawJson);
  const referenceDate = options.referenceDate ?? "2026-11-08";
  const observedAt = new Date(`${referenceDate}T12:00:00Z`).toISOString();

  const allGames: GameDTO[] = parsed.matches.map((m) => {
    const home = resolveCanonicalTeam(config.league, m.team1);
    const away = resolveCanonicalTeam(config.league, m.team2);
    const md = parseMatchdayNumber(m.round);
    const hasFt = Array.isArray(m.score?.ft) && m.score.ft.length === 2;
    const timeStr = m.time && /^\d{2}:\d{2}$/.test(m.time) ? m.time : "15:00";
    const startTime = `${m.date}T${timeStr}:00`;
    const homeSlug = home.id.split(".")[1]!;
    const awaySlug = away.id.split(".")[1]!;

    return {
      id: asGameId(`${config.idPrefix}-md${md}-${homeSlug}-${awaySlug}`),
      league: asLeagueId(config.league),
      season: asSeasonId(config.seasonId),
      week: md,
      round: `Jornada ${md}`,
      startTime,
      status: hasFt ? "final" : "scheduled",
      home,
      away,
      venue: config.stadiums[home.id] ?? config.defaultVenue,
      neutralSite: false,
      result: hasFt
        ? {
            home: m.score!.ft![0],
            away: m.score!.ft![1],
            observedAt,
            source: "openfootball",
          }
        : undefined,
    };
  });

  // Jornada activa (o targetMatchday si se especifica): la primera con partidos sin terminar
  // que no empezaron hace más de 36 h. Antes se tomaba la más cercana por fecha y, en la
  // pausa de selecciones, se quedaba en la jornada ya jugada sin marcadores (P0-02).
  const matchdays = [...new Set(allGames.map((g) => g.week!))].sort((a, b) => a - b);
  let activeMatchday = options.targetMatchday;
  if (!activeMatchday) {
    const cutoff = new Date(`${referenceDate}T12:00:00Z`).getTime() - 36 * 3_600_000;
    activeMatchday = matchdays.find((md) =>
      allGames.some((g) => g.week === md && g.status !== "final" && Date.parse(`${g.startTime}Z`) >= cutoff),
    );
  }
  if (!activeMatchday) {
    const refMs = new Date(`${referenceDate}T12:00:00Z`).getTime();
    let bestMd = matchdays[0]!;
    let bestDist = Infinity;
    for (const md of matchdays) {
      const mdGames = allGames.filter((g) => g.week === md);
      const firstDate = mdGames[0]?.startTime.slice(0, 10) ?? referenceDate;
      const dist = Math.abs(new Date(`${firstDate}T12:00:00Z`).getTime() - refMs);
      if (dist < bestDist) {
        bestDist = dist;
        bestMd = md;
      }
    }
    activeMatchday = bestMd;
  }

  const rawRoundGames = allGames
    .filter((g) => g.week === activeMatchday)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const uniqueDates = new Set(rawRoundGames.map((g) => g.startTime.slice(0, 10)));
  const activeRoundGames =
    uniqueDates.size === 1 && rawRoundGames.length >= 6
      ? rawRoundGames.map((g, idx) => {
          const baseDate = new Date(`${g.startTime.slice(0, 10)}T12:00:00Z`);
          if (idx < Math.ceil(rawRoundGames.length / 2)) {
            return { ...g, startTime: `${g.startTime.slice(0, 10)}T09:00:00` };
          }
          const sundayIso = new Date(baseDate.getTime() + 86_400_000)
            .toISOString()
            .slice(0, 10);
          const hh = idx === rawRoundGames.length - 1 ? "10:30:00" : "08:00:00";
          return { ...g, startTime: `${sundayIso}T${hh}` };
        })
      : rawRoundGames;

  // Tasas por equipo: solo partidos finalizados de jornadas anteriores (sin fuga de futuro).
  // Las ligas con manifiesto de emblemas usan ese registro; las demás derivan el catálogo
  // del propio calendario (así entran también los ascendidos de la temporada).
  const catalog = new Map<string, Team>();
  for (const team of listAllTeamsForLeague(config.league)) {
    catalog.set(team.id, team);
  }
  if (catalog.size === 0) {
    for (const game of allGames) {
      catalog.set(game.home.id, game.home);
      catalog.set(game.away.id, game.away);
    }
  }
  const allCatalogTeams: Team[] = [...catalog.values()];
  const statsMap = new Map<string, { gf: number; ga: number; gp: number }>();
  for (const t of allCatalogTeams) {
    statsMap.set(t.id, { gf: 0, ga: 0, gp: 0 });
  }

  for (const g of allGames) {
    if (g.status === "final" && g.result && (g.week ?? 0) < activeMatchday) {
      const hStat = statsMap.get(g.home.id);
      const aStat = statsMap.get(g.away.id);
      if (hStat) {
        hStat.gf += g.result.home;
        hStat.ga += g.result.away;
        hStat.gp += 1;
      }
      if (aStat) {
        aStat.gf += g.result.away;
        aStat.ga += g.result.home;
        aStat.gp += 1;
      }
    }
  }

  const teamRateInputs: FootballTeamRateInput[] = allCatalogTeams.map((t) => {
    const st = statsMap.get(t.id) ?? { gf: 0, ga: 0, gp: 0 };
    return {
      teamId: t.id,
      name: t.name,
      shortName: t.shortName,
      code: t.code,
      goalsFor: st.gf,
      goalsAgainst: st.ga,
      gamesPlayed: st.gp,
    };
  });

  return {
    seasonId: config.seasonId,
    seasonLabel: config.seasonLabel,
    activeMatchday,
    periodLabel: `Jornada ${activeMatchday}`,
    allGames,
    activeRoundGames,
    teamRateInputs,
  };
}

export function normalizeOpenFootballPremierLeague(
  rawJson: unknown,
  options: { referenceDate?: string; targetMatchday?: number } = {},
): NormalizedOpenFootballSeason {
  return normalizeOpenFootballLeague(rawJson, PREMIER_LEAGUE_CONFIG, options);
}

export function normalizeOpenFootballLaliga(
  rawJson: unknown,
  options: { referenceDate?: string; targetMatchday?: number } = {},
): NormalizedOpenFootballSeason {
  return normalizeOpenFootballLeague(rawJson, LALIGA_CONFIG, options);
}

export function normalizeOpenFootballBundesliga(
  rawJson: unknown,
  options: { referenceDate?: string; targetMatchday?: number } = {},
): NormalizedOpenFootballSeason {
  return normalizeOpenFootballLeague(rawJson, BUNDESLIGA_CONFIG, options);
}

export function normalizeOpenFootballSerieA(
  rawJson: unknown,
  options: { referenceDate?: string; targetMatchday?: number } = {},
): NormalizedOpenFootballSeason {
  return normalizeOpenFootballLeague(rawJson, SERIE_A_CONFIG, options);
}

export function normalizeOpenFootballLigue1(
  rawJson: unknown,
  options: { referenceDate?: string; targetMatchday?: number } = {},
): NormalizedOpenFootballSeason {
  return normalizeOpenFootballLeague(rawJson, LIGUE_1_CONFIG, options);
}

export async function fetchOpenFootball(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "PitchLab-Ingest/0.1 (+https://pitchlab.mx)",
    },
  });
  if (!res.ok) {
    throw new Error(`Error descargando openfootball (${res.status}): ${url}`);
  }
  return res.json();
}

export async function fetchOpenFootballPl(url: string = OPENFOOTBALL_PL_URL): Promise<unknown> {
  return fetchOpenFootball(url);
}

export async function fetchOpenFootballLaliga(
  url: string = OPENFOOTBALL_LALIGA_URL,
): Promise<unknown> {
  return fetchOpenFootball(url);
}

export async function fetchOpenFootballBundesliga(
  url: string = OPENFOOTBALL_BUNDESLIGA_URL,
): Promise<unknown> {
  return fetchOpenFootball(url);
}

export async function fetchOpenFootballSerieA(
  url: string = OPENFOOTBALL_SERIE_A_URL,
): Promise<unknown> {
  return fetchOpenFootball(url);
}

export async function fetchOpenFootballLigue1(
  url: string = OPENFOOTBALL_LIGUE_1_URL,
): Promise<unknown> {
  return fetchOpenFootball(url);
}
