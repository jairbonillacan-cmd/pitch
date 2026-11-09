/**
 * Partidos de la temporada anterior para estabilizar el arranque de temporada.
 *
 * Fuente: `data/history/<liga>.jsonl` (corpus histórico versionado, research-safe).
 * Se usan solo partidos **anteriores** a la fecha de corte y con peso reducido, para
 * que la temporada en curso siga mandando en cuanto hay muestra suficiente.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { FootballMatchRow } from "@pitchlab/models";

const ROOT = resolve(import.meta.dirname, "..", "..", "..");
const HISTORY_DIR = resolve(ROOT, "data", "history");

/** Liga del producto → archivo del corpus histórico. */
const HISTORY_FILES: Record<string, string> = {
  "premier-league": "premier-league.jsonl",
  laliga: "la-liga.jsonl",
  "liga-mx": "liga-mx.jsonl",
};

interface HistoryLine {
  league?: string;
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

/** El corpus histórico usa `la-liga.<slug>`; el producto, `laliga.<slug>`. */
function remapTeam(teamId: string, league: string): string {
  if (league === "laliga") {
    return teamId.replace(/^la-liga\./, "laliga.");
  }
  return teamId;
}
