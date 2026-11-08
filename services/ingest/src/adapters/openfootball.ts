/**
 * Adaptador de datos de Premier League desde openfootball/football.json (CC0).
 *
 * Asset oficial documentado:
 * - URL: https://raw.githubusercontent.com/openfootball/football.json/master/2026-27/en.1.json
 * - Repositorio: https://github.com/openfootball/football.json (`2026-27/en.1.json`)
 * - Licencia: CC0 1.0 Universal (Dominio Público, atribuido en /legal/creditos).
 */
import { z } from "zod";
import {
  asGameId,
  asLeagueId,
  asSeasonId,
  type GameDTO,
} from "@pitchlab/contracts";
import type { FootballTeamRateInput } from "@pitchlab/engines-reference";
import { listAllTeamsForLeague, resolveCanonicalTeam } from "../mappings.js";

export const OPENFOOTBALL_PL_URL =
  "https://raw.githubusercontent.com/openfootball/football.json/master/2026-27/en.1.json";

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

function parseMatchdayNumber(round: string): number {
  const m = round.match(/(\d+)/);
  return m && m[1] ? Number(m[1]) : 1;
}

export interface NormalizedPremierLeagueSeason {
  seasonId: string;
  seasonLabel: string;
  activeMatchday: number;
  periodLabel: string;
  allGames: GameDTO[];
  activeRoundGames: GameDTO[];
  teamRateInputs: FootballTeamRateInput[];
}

export function normalizeOpenFootballPremierLeague(
  rawJson: unknown,
  options: { referenceDate?: string; targetMatchday?: number } = {},
): NormalizedPremierLeagueSeason {
  const parsed = OpenFootballSeasonSchema.parse(rawJson);
  const referenceDate = options.referenceDate ?? "2026-11-08";
  const observedAt = new Date(`${referenceDate}T12:00:00Z`).toISOString();

  const allGames: GameDTO[] = parsed.matches.map((m) => {
    const home = resolveCanonicalTeam("premier-league", m.team1);
    const away = resolveCanonicalTeam("premier-league", m.team2);
    const md = parseMatchdayNumber(m.round);
    const hasFt = Array.isArray(m.score?.ft) && m.score.ft.length === 2;
    const timeStr = m.time && /^\d{2}:\d{2}$/.test(m.time) ? m.time : "15:00";
    const startTime = `${m.date}T${timeStr}:00`;
    const homeSlug = home.id.split(".")[1]!;
    const awaySlug = away.id.split(".")[1]!;

    return {
      id: asGameId(`pl-2026-27-md${md}-${homeSlug}-${awaySlug}`),
      league: asLeagueId("premier-league"),
      season: asSeasonId("premier-league-2026-27"),
      week: md,
      round: `Jornada ${md}`,
      startTime,
      status: hasFt ? "final" : "scheduled",
      home,
      away,
      venue: PL_STADIUMS[home.id] ?? "Inglaterra",
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

  // Elegir la jornada activa más cercana a referenceDate (o targetMatchday si se especifica)
  const matchdays = [...new Set(allGames.map((g) => g.week!))].sort((a, b) => a - b);
  let activeMatchday = options.targetMatchday;
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

  const activeRoundGames = allGames
    .filter((g) => g.week === activeMatchday)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Calcular tasas por equipo en la temporada en curso sobre todos los partidos finalizados previos
  const allCatalogTeams = listAllTeamsForLeague("premier-league");
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
    seasonId: "premier-league-2026-27",
    seasonLabel: "2026/27",
    activeMatchday,
    periodLabel: `Jornada ${activeMatchday}`,
    allGames,
    activeRoundGames,
    teamRateInputs,
  };
}

export async function fetchOpenFootballPl(url: string = OPENFOOTBALL_PL_URL): Promise<unknown> {
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
