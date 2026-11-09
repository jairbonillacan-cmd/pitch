/**
 * Histórico de Liga MX desde API-Football (plan Free).
 *
 * Por qué: openfootball solo publica 4 temporadas de Liga MX (2018-19, 2019-20, 2020-21
 * y 2024-25). API-Football cubre las temporadas que faltan con ~1 solicitud por temporada.
 *
 * Licencia: el plan Free traslada al usuario la obtención de licencias de las
 * competiciones (`FREE_DATA_STRATEGY.md` §1), así que estas filas van al dataset
 * **research-only**, igual que football-data.co.uk.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  API_FOOTBALL_BASE_URL,
  API_FOOTBALL_DAILY_LIMIT,
  ApiFootballResponseSchema,
  LIGA_MX_LEAGUE_ID,
} from "../adapters/api-football.js";
import type { HistoryLeagueConfig } from "./leagues.js";
import type { ResearchGame } from "./research-schema.js";

/** Temporadas de API-Football accesibles con el plan Free (2019 y 2021 están bloqueadas). */
export const API_FOOTBALL_HISTORY_SEASONS = [2021, 2022, 2023, 2024, 2025, 2026] as const;

/** `2022` → `2022-23` (Apertura 2022 + Clausura 2023). */
export function apiFootballSeasonLabel(season: number): string {
  const end = String((season + 1) % 100).padStart(2, "0");
  return `${season}-${end}`;
}

const KNOCKOUT_PERIODS: Readonly<Record<string, number>> = {
  "play-offs": 18,
  "play-offs round": 18,
  reclasificacion: 18,
  "quarter-finals": 19,
  "semi-finals": 20,
  final: 21,
};

export interface ParsedApiRound {
  stage: string;
  period: number;
  phase: "regular" | "postseason";
}

/** `Apertura - 12` → jornada 12; `Clausura - Final` → playoffs, fase final. */
export function parseApiRound(round: string): ParsedApiRound | null {
  const parts = round.split(" - ");
  if (parts.length < 2) return null;
  const tournament = parts[0]!.trim();
  const rest = parts.slice(1).join(" - ").trim();
  if (!tournament || !rest) return null;

  if (/^\d+$/.test(rest)) {
    const period = Number(rest);
    if (!Number.isInteger(period) || period < 1) return null;
    return { stage: tournament, period, phase: "regular" };
  }

  const key = rest
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const period = KNOCKOUT_PERIODS[key];
  if (period === undefined) return null;
  return { stage: `${tournament} Playoffs`, period, phase: "postseason" };
}

function stageSlug(stage: string): string {
  return stage
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Nombres de API-Football → slug del corpus.
 * El corpus usa los nombres de openfootball (`Deportivo Guadalajara`, `UANL Tigres`,
 * `Gallos Blancos`), así que se mapean las variantes de API a esos slugs.
 */
export const API_FOOTBALL_LIGA_MX_SLUGS: Readonly<Record<string, string>> = {
  "Club America": "america",
  América: "america",
  America: "america",
  Atlas: "atlas-guadalajara",
  "Atlas FC": "atlas-guadalajara",
  "Atletico San Luis": "atletico-san-luis",
  "Atlético San Luis": "atletico-san-luis",
  "Club Atlético de San Luis": "atletico-san-luis",
  "Cruz Azul": "cruz-azul",
  "CF Cruz Azul": "cruz-azul",
  "Guadalajara Chivas": "deportivo-guadalajara",
  Guadalajara: "deportivo-guadalajara",
  "Deportivo Guadalajara": "deportivo-guadalajara",
  "Toluca": "deportivo-toluca",
  "Deportivo Toluca": "deportivo-toluca",
  "Queretaro": "gallos-blancos",
  "Querétaro": "gallos-blancos",
  "Club Queretaro": "gallos-blancos",
  "Gallos Blancos": "gallos-blancos",
  "FC Juarez": "juarez",
  "FC Juárez": "juarez",
  Juarez: "juarez",
  Juárez: "juarez",
  Leon: "leon",
  León: "leon",
  "Club Leon": "leon",
  "Club León": "leon",
  Mazatlán: "mazatlan",
  Mazatlan: "mazatlan",
  "Mazatlán FC": "mazatlan",
  Monterrey: "monterrey",
  "CF Monterrey": "monterrey",
  Necaxa: "necaxa",
  "Club Necaxa": "necaxa",
  "CF Pachuca": "pachuca",
  Pachuca: "pachuca",
  Puebla: "puebla",
  "Puebla FC": "puebla",
  "Club Puebla": "puebla",
  "U.N.A.M. - Pumas": "pumas-unam",
  "Pumas UNAM": "pumas-unam",
  Pumas: "pumas-unam",
  "Santos Laguna": "santos-laguna",
  "Club Santos Laguna": "santos-laguna",
  "Club Tijuana": "tijuana",
  Tijuana: "tijuana",
  "Tigres UANL": "uanl-tigres",
  Tigres: "uanl-tigres",
};

export interface NormalizeApiFootballOptions {
  league: HistoryLeagueConfig;
  /** Temporada inicial (2022 = Apertura 2022 + Clausura 2023). */
  season: number;
}

export interface ApiFootballHistoryResult {
  games: ResearchGame[];
  unmatchedNames: string[];
  skipped: { notFinished: number; withoutGoals: number; withoutRound: number };
}

export function normalizeApiFootballHistory(
  payload: unknown,
  options: NormalizeApiFootballOptions,
): ApiFootballHistoryResult {
  if (options.league.id !== "liga-mx") {
    throw new Error(`El histórico de API-Football solo está configurado para Liga MX.`);
  }
  const parsed = ApiFootballResponseSchema.parse(payload);
  const seasonLabel = apiFootballSeasonLabel(options.season);
  const sourceUrl = `${API_FOOTBALL_BASE_URL}/fixtures?league=${LIGA_MX_LEAGUE_ID}&season=${options.season}`;
  const games: ResearchGame[] = [];
  const unmatched = new Set<string>();
  const skipped = { notFinished: 0, withoutGoals: 0, withoutRound: 0 };

  for (const item of parsed.response) {
    if (!["FT", "AET", "PEN"].includes(item.fixture.status.short)) {
      skipped.notFinished++;
      continue;
    }
    if (item.goals.home === null || item.goals.away === null) {
      skipped.withoutGoals++;
      continue;
    }
    const round = parseApiRound(item.league.round);
    if (!round) {
      skipped.withoutRound++;
      continue;
    }

    const homeSlug = API_FOOTBALL_LIGA_MX_SLUGS[item.teams.home.name.trim()];
    const awaySlug = API_FOOTBALL_LIGA_MX_SLUGS[item.teams.away.name.trim()];
    if (!homeSlug || !awaySlug) {
      if (!homeSlug) unmatched.add(item.teams.home.name);
      if (!awaySlug) unmatched.add(item.teams.away.name);
      continue;
    }

    games.push({
      id: `${options.league.id}:${seasonLabel}:${stageSlug(round.stage)}:${homeSlug}:${awaySlug}`,
      league: options.league.id,
      season: seasonLabel,
      date: item.fixture.date.slice(0, 10),
      homeTeam: `${options.league.id}.${homeSlug}`,
      awayTeam: `${options.league.id}.${awaySlug}`,
      homeScore: item.goals.home,
      awayScore: item.goals.away,
      stage: round.stage,
      period: round.period,
      phase: round.phase,
      odds: null,
      source: "api-football",
      sourceUrl,
    });
  }

  return { games, unmatchedNames: [...unmatched].sort(), skipped };
}

export interface FetchApiFootballSeasonOptions {
  apiKey: string;
  season: number;
  cacheFilePath?: string;
  budgetFilePath?: string;
  offline?: boolean;
}

export interface ApiFootballSeasonPayload {
  payload: unknown;
  errors: string[];
  status: "fetched" | "cached" | "error";
}

/** Descarga una temporada respetando el presupuesto diario y la caché en disco. */
export async function fetchApiFootballSeason(
  options: FetchApiFootballSeasonOptions,
): Promise<ApiFootballSeasonPayload> {
  const { apiKey, season, cacheFilePath, budgetFilePath, offline } = options;
  if (cacheFilePath && existsSync(cacheFilePath)) {
    return {
      payload: JSON.parse(readFileSync(cacheFilePath, "utf8")),
      errors: [],
      status: "cached",
    };
  }
  if (offline) {
    throw new Error(
      `Modo offline: falta la caché de API-Football para la temporada ${season}.`,
    );
  }
  if (!apiKey.trim()) throw new Error("API_FOOTBALL_KEY vacía.");

  const today = new Date().toISOString().slice(0, 10);
  let usedToday = 0;
  if (budgetFilePath && existsSync(budgetFilePath)) {
    const budget = JSON.parse(readFileSync(budgetFilePath, "utf8")) as { date: string; count: number };
    if (budget.date === today) usedToday = budget.count;
  }
  if (usedToday >= API_FOOTBALL_DAILY_LIMIT) {
    throw new Error(
      `Presupuesto diario de API-Football alcanzado (${usedToday}/${API_FOOTBALL_DAILY_LIMIT}).`,
    );
  }

  const url = `${API_FOOTBALL_BASE_URL}/fixtures?league=${LIGA_MX_LEAGUE_ID}&season=${season}`;
  const res = await fetch(url, { headers: { "x-apisports-key": apiKey.trim() } });

  usedToday += 1;
  if (budgetFilePath) {
    mkdirSync(dirname(budgetFilePath), { recursive: true });
    writeFileSync(
      budgetFilePath,
      JSON.stringify({ date: today, count: usedToday }, null, 2),
      "utf8",
    );
  }

  if (!res.ok) {
    throw new Error(`Error de API-Football (${res.status}): ${url}`);
  }

  const payload = (await res.json()) as {
    response?: unknown[];
    errors?: Record<string, string> | unknown[];
  };
  const errors = payload.errors
    ? Array.isArray(payload.errors)
      ? payload.errors.map(String)
      : Object.entries(payload.errors).map(([key, value]) => `${key}: ${value}`)
    : [];

  if (errors.length > 0) {
    return { payload: { response: [] }, errors, status: "error" };
  }

  if (cacheFilePath) {
    mkdirSync(dirname(cacheFilePath), { recursive: true });
    writeFileSync(cacheFilePath, JSON.stringify(payload, null, 2), "utf8");
  }
  return { payload, errors: [], status: "fetched" };
}
