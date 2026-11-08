/**
 * Adaptador de datos de Liga MX vía API-Football v3 (Plan Free).
 *
 * Reglas (FREE_DATA_STRATEGY.md §1 y PREMVP-01 §H):
 * - Solo se ejecuta si existe `API_FOOTBALL_KEY` en el entorno.
 * - Respeta el límite de 100 solicitudes al día mediante caché en disco y presupuesto diario.
 * - Sin clave, Liga MX queda marcada como "Pronto" (no se inventan datos).
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

export const API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";
export const LIGA_MX_LEAGUE_ID = 262;
export const API_FOOTBALL_DAILY_LIMIT = 90; // margen de seguridad bajo las 100 solicitudes/día del plan Free

export const ApiFootballFixtureItemSchema = z.object({
  fixture: z.object({
    id: z.number().int(),
    date: z.string().min(10),
    venue: z
      .object({
        name: z.string().nullable().optional(),
        city: z.string().nullable().optional(),
      })
      .optional(),
    status: z.object({
      short: z.string().min(1),
    }),
  }),
  league: z.object({
    id: z.number().int(),
    name: z.string(),
    season: z.number().int(),
    round: z.string(),
  }),
  teams: z.object({
    home: z.object({
      id: z.number().int(),
      name: z.string().min(1),
    }),
    away: z.object({
      id: z.number().int(),
      name: z.string().min(1),
    }),
  }),
  goals: z.object({
    home: z.number().int().nullable(),
    away: z.number().int().nullable(),
  }),
});

export const ApiFootballResponseSchema = z.object({
  response: z.array(ApiFootballFixtureItemSchema),
});

export type ApiFootballResponse = z.infer<typeof ApiFootballResponseSchema>;

export interface NormalizedLigaMxSeason {
  seasonId: string;
  seasonLabel: string;
  activeRound: number;
  periodLabel: string;
  allGames: GameDTO[];
  activeRoundGames: GameDTO[];
  teamRateInputs: FootballTeamRateInput[];
}

function parseRoundNumber(round: string): number {
  const m = round.match(/(\d+)/);
  return m && m[1] ? Number(m[1]) : 1;
}

export function normalizeApiFootballLigaMx(
  rawPayload: unknown,
  options: { referenceDate?: string; targetRound?: number } = {},
): NormalizedLigaMxSeason {
  const parsed = ApiFootballResponseSchema.parse(rawPayload);
  const referenceDate = options.referenceDate ?? "2026-11-08";
  const observedAt = new Date(`${referenceDate}T12:00:00Z`).toISOString();

  if (parsed.response.length === 0) {
    throw new Error("La respuesta de API-Football para Liga MX no contiene partidos.");
  }

  const allGames: GameDTO[] = parsed.response.map((item) => {
    const home = resolveCanonicalTeam("liga-mx", item.teams.home.name);
    const away = resolveCanonicalTeam("liga-mx", item.teams.away.name);
    const roundNum = parseRoundNumber(item.league.round);
    const isFinal = ["FT", "AET", "PEN"].includes(item.fixture.status.short);
    const hasGoals = item.goals.home !== null && item.goals.away !== null;
    const homeSlug = home.id.split(".")[1]!;
    const awaySlug = away.id.split(".")[1]!;

    return {
      id: asGameId(`mx-2026-ap-j${roundNum}-${homeSlug}-${awaySlug}`),
      league: asLeagueId("liga-mx"),
      season: asSeasonId("liga-mx-2026-apertura"),
      week: roundNum,
      round: `Jornada ${roundNum}`,
      startTime: item.fixture.date.slice(0, 19),
      status: isFinal && hasGoals ? "final" : "scheduled",
      home,
      away,
      venue: item.fixture.venue?.name ?? "México",
      neutralSite: false,
      result:
        isFinal && hasGoals
          ? {
              home: item.goals.home!,
              away: item.goals.away!,
              observedAt,
              source: "api-football",
            }
          : undefined,
    };
  });

  const rounds = [...new Set(allGames.map((g) => g.week!))].sort((a, b) => a - b);
  const activeRound =
    options.targetRound ??
    rounds.find((r) => allGames.some((g) => g.week === r && g.status === "scheduled")) ??
    rounds[rounds.length - 1]!;

  const activeRoundGames = allGames
    .filter((g) => g.week === activeRound)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const allCatalogTeams = listAllTeamsForLeague("liga-mx");
  const statsMap = new Map<string, { gf: number; ga: number; gp: number }>();
  for (const t of allCatalogTeams) {
    statsMap.set(t.id, { gf: 0, ga: 0, gp: 0 });
  }

  for (const g of allGames) {
    if (g.status === "final" && g.result && (g.week ?? 0) < activeRound) {
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
    seasonId: "liga-mx-2026-apertura",
    seasonLabel: "Apertura 2026",
    activeRound,
    periodLabel: `Jornada ${activeRound}`,
    allGames,
    activeRoundGames,
    teamRateInputs,
  };
}

export async function fetchApiFootballLigaMx(options: {
  apiKey: string;
  season?: number;
  cacheFilePath?: string;
  budgetFilePath?: string;
}): Promise<unknown> {
  const { apiKey, season = 2026, cacheFilePath, budgetFilePath } = options;
  if (!apiKey.trim()) {
    throw new Error("API_FOOTBALL_KEY vacía.");
  }

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

  let usedToday = 0;
  if (budgetFilePath && existsSync(budgetFilePath)) {
    const budget = JSON.parse(readFileSync(budgetFilePath, "utf8")) as {
      date: string;
      count: number;
    };
    if (budget.date === today) {
      usedToday = budget.count;
    }
  }

  if (usedToday >= API_FOOTBALL_DAILY_LIMIT) {
    throw new Error(
      `Presupuesto diario de API-Football alcanzado (${usedToday}/${API_FOOTBALL_DAILY_LIMIT} solicitudes hoy).`,
    );
  }

  const url = `${API_FOOTBALL_BASE_URL}/fixtures?league=${LIGA_MX_LEAGUE_ID}&season=${season}`;
  const res = await fetch(url, {
    headers: {
      "x-apisports-key": apiKey,
    },
  });

  if (budgetFilePath) {
    mkdirSync(dirname(budgetFilePath), { recursive: true });
    writeFileSync(
      budgetFilePath,
      JSON.stringify({ date: today, count: usedToday + 1 }, null, 2),
      "utf8",
    );
  }

  if (!res.ok) {
    throw new Error(`Error de API-Football (${res.status}): ${url}`);
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
