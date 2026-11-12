/**
 * Normalización del histórico de fútbol desde openfootball/football.json (CC0).
 *
 * Solo se conservan partidos **jugados** (con marcador final). Los partidos futuros de
 * la temporada en curso se descartan y se cuentan para el reporte de calidad.
 */
import { z } from "zod";
import type { HistoricalGame } from "./schema.js";
import type { HistoryLeagueConfig } from "./leagues.js";
import { soccerTeamKey } from "./teams.js";

const OpenFootballHistoryMatchSchema = z.object({
  round: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().optional(),
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

export const OpenFootballHistorySeasonSchema = z.object({
  name: z.string().min(1),
  matches: z.array(OpenFootballHistoryMatchSchema).min(1),
});

export type OpenFootballHistorySeason = z.infer<typeof OpenFootballHistorySeasonSchema>;

export interface NormalizeOpenFootballOptions {
  league: HistoryLeagueConfig;
  season: string;
}

export interface OpenFootballHistoryResult {
  games: HistoricalGame[];
  seasonLabel: string;
  skipped: {
    withoutScore: number;
    withoutPeriod: number;
  };
}

/**
 * Liguilla y fases de eliminación directa: distribución estadística distinta a la
 * jornada regular, así que se etiquetan para poder excluirlas del entrenamiento.
 */
export function isPostseasonStage(stage: string | null): boolean {
  return stage !== null && /play-?offs?|liguilla|repechaje|play-?in/i.test(stage);
}

/** Número de jornada a partir de "Matchday 1", "Jornada 12" o "Spieltag 3". */
export function parseMatchdayNumber(round: string): number | null {
  const match = round.match(/(\d+)/);
  if (!match || !match[1]) return null;
  const value = Number(match[1]);
  return Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * Torneo de la jornada cuando la liga parte el año en dos: "Apertura, Matchday 1"
 * devuelve `Apertura`; una liga de temporada única devuelve `null`.
 */
export function parseStage(round: string): string | null {
  const commaIndex = round.indexOf(",");
  if (commaIndex <= 0) return null;
  const stage = round.slice(0, commaIndex).trim();
  return stage.length >= 2 ? stage : null;
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
 * Instante conservador en que el resultado se considera conocible:
 * fin del día del partido + 24 h (`DATA_ARCHITECTURE.md` §6).
 */
export function scoreAvailableAt(date: string): string {
  const endOfDayMs = Date.parse(`${date}T23:59:59Z`);
  if (!Number.isFinite(endOfDayMs)) {
    throw new Error(`Fecha inválida para availableAt: '${date}'.`);
  }
  return new Date(endOfDayMs + 24 * 3600 * 1000).toISOString();
}

export function normalizeOpenFootballHistory(
  raw: unknown,
  options: NormalizeOpenFootballOptions,
): OpenFootballHistoryResult {
  const { league, season } = options;
  if (league.source !== "openfootball" || !league.openFootballCode) {
    throw new Error(`La liga '${league.id}' no es una fuente de openfootball.`);
  }

  const parsed = OpenFootballHistorySeasonSchema.parse(raw);
  const games: HistoricalGame[] = [];
  const skipped = { withoutScore: 0, withoutPeriod: 0 };

  for (let index = 0; index < parsed.matches.length; index++) {
    const match = parsed.matches[index]!;
    const ft = match.score && !Array.isArray(match.score) ? match.score.ft : undefined;
    if (!ft) {
      skipped.withoutScore++;
      continue;
    }

    const period = parseMatchdayNumber(match.round);
    if (period === null) {
      skipped.withoutPeriod++;
      continue;
    }

    const stage = parseStage(match.round);
    const homeTeam = soccerTeamKey(league, match.team1);
    const awayTeam = soccerTeamKey(league, match.team2);
    const stagePrefix = stage ? `${stageSlug(stage)}:` : "";

    games.push({
      id: `${league.id}:${season}:${stagePrefix}${homeTeam.slice(league.id.length + 1)}:${awayTeam.slice(league.id.length + 1)}`,
      sport: "soccer",
      league: league.id,
      season,
      period,
      stage,
      phase: isPostseasonStage(stage) ? "postseason" : "regular",
      date: match.date,
      kickoff: match.time && /^\d{2}:\d{2}$/.test(match.time) ? match.time : null,
      kickoffZone: null,
      homeTeam,
      awayTeam,
      homeScore: ft[0],
      awayScore: ft[1],
      neutralSite: false,
      source: "openfootball",
      sourceId: `${season}/${league.openFootballCode}#${index}`,
      availableAt: scoreAvailableAt(match.date),
    });
  }

  return { games, seasonLabel: parsed.name, skipped };
}
