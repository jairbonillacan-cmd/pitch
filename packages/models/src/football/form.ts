/**
 * Forma reciente de un equipo a partir de sus partidos jugados.
 *
 * Se publica como factor informativo en el análisis (no entra en el modelo, que ya
 * pondera la antigüedad y el rival). Sirve para que el lector vea el contexto sin
 * tener que abrir otra pantalla.
 */
import type { FootballMatchRow } from "./dixon-coles.js";

export interface TeamForm {
  /** Últimos resultados del más antiguo al más reciente: G (gana), E (empate), P (pierde). */
  sequence: string;
  points: number;
  played: number;
  goalsFor: number;
  goalsAgainst: number;
}

/** Últimos `limit` partidos de un equipo anteriores a `beforeDate` (exclusive). */
export function recentForm(
  matches: readonly FootballMatchRow[],
  teamId: string,
  beforeDate: string,
  limit = 5,
): TeamForm {
  const played = matches
    .filter(
      (match) =>
        match.date < beforeDate &&
        (match.home === teamId || match.away === teamId) &&
        Number.isFinite(match.homeGoals) &&
        Number.isFinite(match.awayGoals),
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-limit);

  let points = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  let sequence = "";

  for (const match of played) {
    const isHome = match.home === teamId;
    const own = isHome ? match.homeGoals : match.awayGoals;
    const rival = isHome ? match.awayGoals : match.homeGoals;
    goalsFor += own;
    goalsAgainst += rival;
    if (own > rival) {
      points += 3;
      sequence += "G";
    } else if (own === rival) {
      points += 1;
      sequence += "E";
    } else {
      sequence += "P";
    }
  }

  return { sequence, points, played: played.length, goalsFor, goalsAgainst };
}

/** Texto corto para la ficha: "G-G-E-P-G · 10 pts". */
export function formatForm(form: TeamForm): string {
  if (form.played === 0) return "Sin partidos previos";
  return `${form.sequence.split("").join("-")} · ${form.points} pts`;
}
