/**
 * Forma reciente en NFL: últimos partidos antes del corte.
 * Igual que en fútbol, es contexto informativo y no entra al modelo.
 */
import type { NflMatchRow } from "./ratings.js";

export interface NflForm {
  /** Del más antiguo al más reciente: G (gana) o P (pierde). */
  sequence: string;
  wins: number;
  losses: number;
  played: number;
  pointsFor: number;
  pointsAgainst: number;
}

export function recentNflForm(
  matches: readonly NflMatchRow[],
  teamId: string,
  beforeDate: string,
  limit = 5,
): NflForm {
  const played = matches
    .filter(
      (match) =>
        (!match.date || match.date < beforeDate) &&
        (match.home === teamId || match.away === teamId) &&
        Number.isFinite(match.homeScore) &&
        Number.isFinite(match.awayScore),
    )
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))
    .slice(-limit);

  let wins = 0;
  let losses = 0;
  let pointsFor = 0;
  let pointsAgainst = 0;
  let sequence = "";

  for (const match of played) {
    const isHome = match.home === teamId;
    const own = isHome ? match.homeScore : match.awayScore;
    const rival = isHome ? match.awayScore : match.homeScore;
    pointsFor += own;
    pointsAgainst += rival;
    if (own > rival) {
      wins += 1;
      sequence += "G";
    } else {
      losses += 1;
      sequence += "P";
    }
  }

  return { sequence, wins, losses, played: played.length, pointsFor, pointsAgainst };
}

/** Texto corto para la ficha: "G-P-G-G-P · 3-2". */
export function formatNflForm(form: NflForm): string {
  if (form.played === 0) return "Sin partidos previos";
  return `${form.sequence.split("").join("-")} · ${form.wins}-${form.losses}`;
}
