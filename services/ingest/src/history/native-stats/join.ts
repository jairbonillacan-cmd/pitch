/**
 * Cotejo entre el dataset de native-stats y el corpus histórico propio.
 *
 * Sirve para dos cosas concretas, no para "enriquecer por enriquecer":
 *
 *  1. **Identidad**: emparejar por liga + fecha + equipos y confirmar con el marcador
 *     final. Un partido que coincide en fecha y equipos pero no en marcador es una
 *     discrepancia de datos, y se reporta en vez de promediarse.
 *  2. **Control de calidad del corpus**: recalcular desde nuestros resultados las rachas
 *     que la fuente publica. Si no coinciden, o el corpus perdió partidos o la definición
 *     de la racha no es la misma; ambas cosas deben verse, no suponerse.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface CorpusMatch {
  id: string;
  league: string;
  season: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
}

export interface CorpusIndex {
  datasetId: string | null;
  rows: number;
  teams: Set<string>;
  byFixture: Map<string, CorpusMatch>;
  byLeague: Map<string, CorpusMatch[]>;
}

export function fixtureKey(league: string, date: string, homeTeam: string, awayTeam: string): string {
  return `${league}|${date}|${homeTeam}|${awayTeam}`;
}

/** Carga el corpus histórico (fútbol) desde `data/history/<liga>.jsonl`. */
export function loadCorpus(rootDir: string, leagues: readonly string[]): CorpusIndex {
  const manifestPath = join(rootDir, "data", "history", "manifest.json");
  let datasetId: string | null = null;
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { datasetId?: string };
    datasetId = manifest.datasetId ?? null;
  }

  const byFixture = new Map<string, CorpusMatch>();
  const byLeague = new Map<string, CorpusMatch[]>();
  const teams = new Set<string>();
  let rows = 0;

  for (const league of leagues) {
    const file = join(rootDir, "data", "history", `${league}.jsonl`);
    if (!existsSync(file)) continue;
    const matches: CorpusMatch[] = [];
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      const row = JSON.parse(trimmed) as CorpusMatch & { sport?: string };
      if (row.sport && row.sport !== "soccer") continue;
      matches.push(row);
      teams.add(row.homeTeam);
      teams.add(row.awayTeam);
      byFixture.set(fixtureKey(row.league, row.date, row.homeTeam, row.awayTeam), row);
      rows += 1;
    }
    matches.sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));
    byLeague.set(league, matches);
  }

  return { datasetId, rows, teams, byFixture, byLeague };
}

/** Partido del corpus para una fecha y equipos ya resueltos a ids canónicos. */
export function findFixture(
  index: CorpusIndex,
  league: string,
  date: string,
  homeTeam: string,
  awayTeam: string,
): CorpusMatch | null {
  return index.byFixture.get(fixtureKey(league, date, homeTeam, awayTeam)) ?? null;
}

type MatchView = {
  scored: number;
  conceded: number;
  total: number;
  won: boolean;
  lost: boolean;
  drew: boolean;
};

function viewOf(match: CorpusMatch, isHome: boolean): MatchView {
  const scored = isHome ? match.homeScore : match.awayScore;
  const conceded = isHome ? match.awayScore : match.homeScore;
  return {
    scored,
    conceded,
    total: match.homeScore + match.awayScore,
    won: scored > conceded,
    lost: scored < conceded,
    drew: scored === conceded,
  };
}

/**
 * Definiciones de racha que solo dependen del marcador final. Las que necesitan el
 * descanso (`no_loss_after_ht_lead`, …) no están aquí a propósito: se reportan como no
 * comparables en vez de aproximarlas.
 */
const TRAILING_PREDICATES: Readonly<Record<string, (view: MatchView) => boolean>> = {
  consecutive_wins: (view) => view.won,
  consecutive_draws: (view) => view.drew,
  consecutive_losses: (view) => view.lost,
  without_loss: (view) => !view.lost,
  without_draw: (view) => !view.drew,
  without_win: (view) => !view.won,
  without_goal: (view) => view.scored === 0,
  under15_goals: (view) => view.total <= 1,
  over05_goals: (view) => view.total >= 1,
  over15_goals: (view) => view.total >= 2,
  over25_goals: (view) => view.total >= 3,
  over35_goals: (view) => view.total >= 4,
  over45_goals: (view) => view.total >= 5,
  over55_goals: (view) => view.total >= 6,
  with_1_scored_goals: (view) => view.scored === 1,
  with_2_scored_goals: (view) => view.scored === 2,
  with_3_scored_goals: (view) => view.scored === 3,
  without_scored_goal: (view) => view.scored === 0,
  without_clean_sheet: (view) => view.conceded >= 1,
  with_2_conceded_goals: (view) => view.conceded === 2,
  with_3_conceded_goals: (view) => view.conceded === 3,
  with_clean_sheet: (view) => view.conceded === 0,
};

/** Rachas comparables declaradas por este módulo. */
export function comparableStreakKeys(): string[] {
  return Object.keys(TRAILING_PREDICATES);
}

/** Raíces de racha que exigen el marcador al descanso (fuera del alcance del corpus). */
export function requiresHalfTime(key: string): boolean {
  return /ht_lead|ht_trail/.test(key);
}

/**
 * Cuenta la racha vigente de un equipo en una lista de partidos ya ordenada por fecha.
 * Devuelve 0 si el último partido ya no cumple el predicado.
 */
export function trailingStreak(
  matches: readonly CorpusMatch[],
  teamId: string,
  key: string,
): number | null {
  const predicate = TRAILING_PREDICATES[key];
  if (!predicate) return null;
  let count = 0;
  for (let index = matches.length - 1; index >= 0; index--) {
    const match = matches[index]!;
    const isHome = match.homeTeam === teamId;
    const isAway = match.awayTeam === teamId;
    if (!isHome && !isAway) continue;
    if (!predicate(viewOf(match, isHome))) break;
    count += 1;
  }
  return count;
}

/** Partidos del equipo dentro de una liga, en orden cronológico. */
export function teamMatches(index: CorpusIndex, league: string, teamId: string): CorpusMatch[] {
  const matches = index.byLeague.get(league) ?? [];
  return matches.filter((match) => match.homeTeam === teamId || match.awayTeam === teamId);
}

/** Partidos del equipo en una temporada concreta (`2026-27`). */
export function teamSeasonMatches(
  index: CorpusIndex,
  league: string,
  teamId: string,
  seasonId: string,
): CorpusMatch[] {
  return teamMatches(index, league, teamId).filter((match) => match.season === seasonId);
}

/** `2026/27` (etiqueta de la fuente) → `2026-27` (id del corpus). */
export function seasonIdFromLabel(label: string | null): string | null {
  if (!label) return null;
  const match = label.match(/^(\d{4})\/(\d{2})$/);
  if (!match) return null;
  return `${match[1]}-${match[2]}`;
}
