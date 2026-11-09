/**
 * Adaptador de Premier League vía football-data.org v4 (`FOOTBALL_DATA_API_KEY`).
 *
 * Endpoint: https://api.football-data.org/v4/competitions/PL/matches
 * Cabecera: X-Auth-Token: <FOOTBALL_DATA_API_KEY>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import {
  asGameId,
  asLeagueId,
  asSeasonId,
  type GameDTO,
} from "@pitchlab/contracts";
import type { FootballTeamRateInput } from "@pitchlab/engines-reference";
import { listAllTeamsForLeague, resolveCanonicalTeam } from "../mappings.js";
import type { NormalizedPremierLeagueSeason } from "./openfootball.js";

export const FOOTBALL_DATA_BASE_URL = "https://api.football-data.org/v4";

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

export const FootballDataMatchSchema = z.object({
  id: z.number().int(),
  utcDate: z.string().min(10),
  status: z.string().min(1),
  matchday: z.number().int().nullable().optional(),
  season: z
    .object({
      id: z.number().int().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      currentMatchday: z.number().int().nullable().optional(),
    })
    .optional(),
  homeTeam: z.object({
    id: z.number().int().optional(),
    name: z.string().min(1),
    shortName: z.string().nullable().optional(),
    tla: z.string().nullable().optional(),
  }),
  awayTeam: z.object({
    id: z.number().int().optional(),
    name: z.string().min(1),
    shortName: z.string().nullable().optional(),
    tla: z.string().nullable().optional(),
  }),
  score: z
    .object({
      fullTime: z
        .object({
          home: z.number().int().nullable(),
          away: z.number().int().nullable(),
        })
        .optional(),
    })
    .optional(),
});

export const FootballDataResponseSchema = z.object({
  matches: z.array(FootballDataMatchSchema),
});

export async function fetchFootballDataPl(options: {
  apiKey: string;
  cacheFilePath?: string;
}): Promise<unknown> {
  const { apiKey, cacheFilePath } = options;
  const today = new Date().toISOString().slice(0, 10);

  if (cacheFilePath && existsSync(cacheFilePath)) {
    const cached = JSON.parse(readFileSync(cacheFilePath, "utf8")) as {
      date: string;
      payload: unknown;
    };
    if (cached.date === today && cached.payload) {
      return cached.payload;
    }
  }

  const url = `${FOOTBALL_DATA_BASE_URL}/competitions/PL/matches`;
  const res = await fetch(url, {
    headers: {
      "X-Auth-Token": apiKey.trim(),
    },
  });

  if (!res.ok) {
    throw new Error(`Error de football-data.org (${res.status}): ${url}`);
  }

  const payload: unknown = await res.json();
  if (cacheFilePath) {
    mkdirSync(dirname(cacheFilePath), { recursive: true });
    writeFileSync(
      cacheFilePath,
      JSON.stringify({ date: today, payload }, null, 2),
      "utf8",
    );
  }
  return payload;
}

export function normalizeFootballDataPremierLeague(
  rawJson: unknown,
  options: { referenceDate?: string; targetMatchday?: number } = {},
): NormalizedPremierLeagueSeason {
  const parsed = FootballDataResponseSchema.parse(rawJson);
  const referenceDate = options.referenceDate ?? "2026-11-08";
  const observedAt = new Date(`${referenceDate}T12:00:00Z`).toISOString();

  const allGames: GameDTO[] = parsed.matches.map((m) => {
    const home = resolveCanonicalTeam("premier-league", m.homeTeam.name);
    const away = resolveCanonicalTeam("premier-league", m.awayTeam.name);
    const md = m.matchday ?? 1;
    const ftHome = m.score?.fullTime?.home ?? null;
    const ftAway = m.score?.fullTime?.away ?? null;
    const isFinal = m.status === "FINISHED" && ftHome !== null && ftAway !== null;
    const homeSlug = home.id.split(".")[1]!;
    const awaySlug = away.id.split(".")[1]!;

    return {
      id: asGameId(`pl-2026-27-md${md}-${homeSlug}-${awaySlug}`),
      league: asLeagueId("premier-league"),
      season: asSeasonId("premier-league-2026-27"),
      week: md,
      round: `Jornada ${md}`,
      startTime: m.utcDate,
      status: isFinal ? "final" : "scheduled",
      home,
      away,
      venue: PL_STADIUMS[home.id] ?? "Inglaterra",
      neutralSite: false,
      result: isFinal
        ? {
            home: ftHome!,
            away: ftAway!,
            observedAt,
            source: "openfootball",
          }
        : undefined,
    };
  });

  const matchdays = [...new Set(allGames.map((g) => g.week!))].sort((a, b) => a - b);
  const apiCurrentMatchday = parsed.matches.find(
    (m) => typeof m.season?.currentMatchday === "number",
  )?.season?.currentMatchday;

  let activeMatchday = options.targetMatchday;
  if (!activeMatchday) {
    if (apiCurrentMatchday && matchdays.includes(apiCurrentMatchday)) {
      activeMatchday = apiCurrentMatchday;
    } else {
      const scheduledMd = matchdays.find((md) =>
        allGames.some((g) => g.week === md && g.status === "scheduled"),
      );
      activeMatchday = scheduledMd ?? matchdays[matchdays.length - 1] ?? 10;
    }
  }

  const activeRoundGames = allGames
    .filter((g) => g.week === activeMatchday)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

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
