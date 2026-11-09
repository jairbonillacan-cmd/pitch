/**
 * Partidos de la temporada anterior para estabilizar el arranque de temporada.
 *
 * Fuente: `data/history/<liga>.jsonl` (corpus histórico versionado, research-safe).
 * Se usan solo partidos **anteriores** a la fecha de corte y con peso reducido, para
 * que la temporada en curso siga mandando en cuanto hay muestra suficiente.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { EloMatch, FootballMatchRow } from "@pitchlab/models";

const ROOT = resolve(import.meta.dirname, "..", "..", "..");
const HISTORY_DIR = resolve(ROOT, "data", "history");

/** Liga del producto → archivo del corpus histórico. */
const HISTORY_FILES: Record<string, string> = {
  "premier-league": "premier-league.jsonl",
  laliga: "la-liga.jsonl",
  "liga-mx": "liga-mx.jsonl",
  bundesliga: "bundesliga.jsonl",
  "serie-a": "serie-a.jsonl",
  "ligue-1": "ligue-1.jsonl",
  nfl: "nfl.jsonl",
};

interface HistoryLine {
  league?: string;
  season?: string;
  date?: string;
  homeTeam?: string;
  awayTeam?: string;
  homeScore?: number;
  awayScore?: number;
  phase?: string;
}

export interface PriorSeasonOptions {
  /** Días hacia atrás desde la fecha de corte. */
  lookbackDays?: number;
  /** Peso relativo de estos partidos frente a la temporada actual. */
  weight?: number;
  /** Máximo de partidos a incorporar (los más recientes). */
  maxMatches?: number;
}

/**
 * Devuelve partidos previos a `beforeDate` (exclusive) en el formato del modelo.
 * Si el archivo no existe o no hay datos, devuelve [] sin fallar.
 */
export function loadPriorMatches(
  league: string,
  beforeDate: string,
  options: PriorSeasonOptions = {},
): FootballMatchRow[] {
  const file = HISTORY_FILES[league];
  if (!file) return [];

  const path = resolve(HISTORY_DIR, file);
  if (!existsSync(path)) return [];

  const lookbackDays = options.lookbackDays ?? 620;
  const weight = options.weight ?? 0.45;
  const maxMatches = options.maxMatches ?? 900;

  const beforeMs = Date.parse(`${beforeDate}T00:00:00Z`);
  if (!Number.isFinite(beforeMs)) return [];
  const fromMs = beforeMs - lookbackDays * 86_400_000;

  const rows: FootballMatchRow[] = [];

  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let parsed: HistoryLine;
    try {
      parsed = JSON.parse(line) as HistoryLine;
    } catch {
      continue;
    }
    if (!parsed.date || !parsed.homeTeam || !parsed.awayTeam) continue;
    const homeScore = Number(parsed.homeScore);
    const awayScore = Number(parsed.awayScore);
    if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) continue;
    if (parsed.phase && parsed.phase !== "regular") continue;

    const ms = Date.parse(`${parsed.date}T00:00:00Z`);
    if (!Number.isFinite(ms) || ms >= beforeMs || ms < fromMs) continue;

    rows.push({
      date: parsed.date,
      home: remapTeam(parsed.homeTeam, league),
      away: remapTeam(parsed.awayTeam, league),
      homeGoals: homeScore,
      awayGoals: awayScore,
      weight,
    });
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows.slice(-maxMatches);
}

/**
 * Ids del corpus histórico que no coinciden con los del producto.
 * Sin este mapa, esos equipos llegaban al modelo sin su temporada anterior.
 */
const TEAM_ALIASES: Record<string, string> = {
  "premier-league.bournemouth": "premier-league.afc-bournemouth",
  "laliga.athletic": "laliga.athletic-club",
  "laliga.celta": "laliga.celta-vigo",
  "laliga.real-racing-santander": "laliga.racing-santander",
  "laliga.espanyol-barcelona": "laliga.espanyol",
  "liga-mx.atlas-guadalajara": "liga-mx.atlas",
  "liga-mx.deportivo-guadalajara": "liga-mx.chivas",
  "liga-mx.uanl-tigres": "liga-mx.tigres-uanl",
  "liga-mx.deportivo-toluca": "liga-mx.toluca",
  "liga-mx.juarez": "liga-mx.fc-juarez",
  "liga-mx.gallos-blancos": "liga-mx.queretaro",
  "serie-a.atalanta": "serie-a.atalanta-bc",
  "serie-a.inter": "serie-a.internazionale-milano",
  "ligue-1.strasbourg": "ligue-1.strasbourg-alsace",
  "ligue-1.estac-troyes": "ligue-1.es-troyes",
  "ligue-1.lens": "ligue-1.racing-lens",
};

/** El corpus histórico usa `la-liga.<slug>` y algunos slugs distintos a los del producto. */
export function remapTeam(teamId: string, league: string): string {
  const base = league === "laliga" ? teamId.replace(/^la-liga\./, "laliga.") : teamId;
  return TEAM_ALIASES[base] ?? base;
}

/**
 * Todo el historial de la liga anterior a `beforeDate` (exclusive), en orden, para
 * alimentar las ratings incrementales. Incluye liguillas y playoffs: son partidos reales.
 */
export function loadLeagueHistory(league: string, beforeDate: string): EloMatch[] {
  const file = HISTORY_FILES[league];
  if (!file) return [];
  const path = resolve(HISTORY_DIR, file);
  if (!existsSync(path)) return [];
  const beforeMs = Date.parse(`${beforeDate}T00:00:00Z`);
  if (!Number.isFinite(beforeMs)) return [];

  const rows: EloMatch[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let parsed: HistoryLine;
    try {
      parsed = JSON.parse(line) as HistoryLine;
    } catch {
      continue;
    }
    if (!parsed.date || !parsed.homeTeam || !parsed.awayTeam || !parsed.season) continue;
    const homeGoals = Number(parsed.homeScore);
    const awayGoals = Number(parsed.awayScore);
    if (!Number.isFinite(homeGoals) || !Number.isFinite(awayGoals)) continue;
    const ms = Date.parse(`${parsed.date}T00:00:00Z`);
    if (!Number.isFinite(ms) || ms >= beforeMs) continue;
    rows.push({
      date: parsed.date,
      season: parsed.season,
      home: remapTeam(parsed.homeTeam, league),
      away: remapTeam(parsed.awayTeam, league),
      homeGoals,
      awayGoals,
    });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}
