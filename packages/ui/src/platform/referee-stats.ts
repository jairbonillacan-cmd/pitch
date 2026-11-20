/**
 * Analítica arbitral con contracción Empirical Bayes (κ = 15) contra la media de cada liga.
 * Evita clasificar como «extremos» a árbitros con muestras pequeñas (p. ej. 2–4 partidos) y
 * ofrece un termómetro honesto de rigurosidad (`Permisivo ↔ Estricto`) (ADR-048).
 */
import { canonicalGameHref, type LeagueId } from "@pitchlab/contracts";
import type { PlatformGame } from "./types";

export type RefereeRigorTier = "estricto" | "promedio" | "permisivo";

export interface RefereeUpcomingAssignment {
  readonly gameId: string;
  readonly matchLabel: string;
  readonly dayLabel: string;
  readonly href: string;
}

export interface RefereeAnalyticsItem {
  readonly name: string;
  readonly country?: string;
  readonly matches: number;
  readonly avgYellow: number | null;
  readonly avgRed: number | null;
  readonly avgFouls: number | null;
  readonly avgGoals: number | null;
  /** Promedio de tarjetas amarillas ajustado con contracción bayesiana hacia la media de la liga. */
  readonly ebYellow: number | null;
  readonly leagueMeanYellow: number;
  /** Percentil 0..100 dentro de los árbitros activos de la liga (100 = más estricto). */
  readonly rigorPercentile: number;
  readonly rigorTier: RefereeRigorTier;
  readonly rigorLabel: string;
  /** Posición ordinal (1 = más estricto en la liga). */
  readonly rank: number;
  readonly totalInLeague: number;
  readonly upcoming: readonly RefereeUpcomingAssignment[];
}

export const REFEREE_EB_PRIOR_WEIGHT = 15;
const DEFAULT_FALLBACK_LEAGUE_YELLOW = 4.15;

export function shrinkRefereeYellowRate(
  rawAvgYellow: number,
  matches: number,
  leagueMeanYellow: number,
  kappa = REFEREE_EB_PRIOR_WEIGHT,
): number {
  const n = Math.max(0, matches);
  const shrunk = (n * rawAvgYellow + kappa * leagueMeanYellow) / (n + kappa);
  return Math.round(shrunk * 100) / 100;
}

export function classifyRefereeRigor(
  ebYellow: number | null,
  leagueMeanYellow: number,
  percentile: number,
): { tier: RefereeRigorTier; label: string } {
  if (ebYellow === null) {
    return { tier: "promedio", label: "Promedio" };
  }
  const delta = ebYellow - leagueMeanYellow;
  if (delta >= 0.25 || percentile >= 72) {
    return { tier: "estricto", label: "Estricto" };
  }
  if (delta <= -0.25 || percentile <= 28) {
    return { tier: "permisivo", label: "Permisivo" };
  }
  return { tier: "promedio", label: "Promedio" };
}

function normRefName(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/**
 * Construye el directorio ordenado de árbitros de una competición a partir de los
 * partidos hidratados (`matchContext.referee` + `refereeStats`).
 */
export function buildLeagueRefereeDirectory(
  games: readonly PlatformGame[],
  league: LeagueId,
): RefereeAnalyticsItem[] {
  const byKey = new Map<
    string,
    {
      name: string;
      country?: string;
      matches: number;
      avgYellow: number | null;
      avgRed: number | null;
      avgFouls: number | null;
      avgGoals: number | null;
      upcoming: RefereeUpcomingAssignment[];
    }
  >();

  for (const g of games) {
    if (g.league !== league) continue;
    const refName = (g.referee ?? g.preGame?.matchContext?.referee ?? "").trim();
    if (!refName) continue;
    const key = normRefName(refName);
    const stats = g.preGame?.matchContext?.refereeStats;
    const prev = byKey.get(key);

    const assignment: RefereeUpcomingAssignment | null =
      g.status !== "FT"
        ? {
            gameId: g.id,
            matchLabel: `${g.home.shortName} vs ${g.away.shortName}`,
            dayLabel: `${g.dayLabel} · ${g.kickoffLocal}`,
            href: canonicalGameHref(g.league, g),
          }
        : null;

    if (!prev) {
      byKey.set(key, {
        name: refName,
        country: stats?.country,
        matches: stats?.matches ?? 0,
        avgYellow: stats?.avgYellow ?? null,
        avgRed: stats?.avgRed ?? null,
        avgFouls: stats?.avgFouls ?? null,
        avgGoals: stats?.avgGoals ?? null,
        upcoming: assignment ? [assignment] : [],
      });
    } else {
      if (stats && (stats.matches ?? 0) >= prev.matches) {
        prev.matches = stats.matches ?? prev.matches;
        prev.country = stats.country ?? prev.country;
        prev.avgYellow = stats.avgYellow ?? prev.avgYellow;
        prev.avgRed = stats.avgRed ?? prev.avgRed;
        prev.avgFouls = stats.avgFouls ?? prev.avgFouls;
        prev.avgGoals = stats.avgGoals ?? prev.avgGoals;
      }
      if (assignment && !prev.upcoming.some((u) => u.gameId === assignment.gameId)) {
        prev.upcoming.push(assignment);
      }
    }
  }

  const rawItems = Array.from(byKey.values());
  if (rawItems.length === 0) return [];

  // Media ponderada por partidos dirigidos en la liga (fallback 4.15 amar./p)
  let yellowWeightSum = 0;
  let weightTotal = 0;
  for (const item of rawItems) {
    if (item.avgYellow !== null && item.avgYellow > 0) {
      const w = Math.max(1, item.matches);
      yellowWeightSum += item.avgYellow * w;
      weightTotal += w;
    }
  }
  const leagueMeanYellow =
    weightTotal > 0
      ? Math.round((yellowWeightSum / weightTotal) * 100) / 100
      : DEFAULT_FALLBACK_LEAGUE_YELLOW;

  const scored = rawItems.map((item) => {
    const ebYellow =
      item.avgYellow !== null
        ? shrinkRefereeYellowRate(item.avgYellow, item.matches, leagueMeanYellow)
        : null;
    return { ...item, ebYellow };
  });

  // Orden: más estricto primero (ebYellow desc, luego partidos desc, luego nombre)
  scored.sort((a, b) => {
    const ay = a.ebYellow ?? -1;
    const by = b.ebYellow ?? -1;
    if (ay !== by) return by - ay;
    if (a.matches !== b.matches) return b.matches - a.matches;
    return a.name.localeCompare(b.name, "es-MX");
  });

  const total = scored.length;
  return scored.map((item, idx) => {
    const rank = idx + 1;
    const percentile =
      total <= 1
        ? 50
        : Math.round(((total - rank) / (total - 1)) * 100);
    const { tier, label } = classifyRefereeRigor(item.ebYellow, leagueMeanYellow, percentile);
    return {
      name: item.name,
      country: item.country,
      matches: item.matches,
      avgYellow: item.avgYellow,
      avgRed: item.avgRed,
      avgFouls: item.avgFouls,
      avgGoals: item.avgGoals,
      ebYellow: item.ebYellow,
      leagueMeanYellow,
      rigorPercentile: percentile,
      rigorTier: tier,
      rigorLabel: label,
      rank,
      totalInLeague: total,
      upcoming: item.upcoming,
    };
  });
}

/**
 * Resuelve el perfil de rigurosidad de un árbitro puntual en el contexto de su liga.
 */
export function resolveMatchRefereeAnalytics(
  game: PlatformGame,
  allGames: readonly PlatformGame[],
): RefereeAnalyticsItem | null {
  const refName = (game.referee ?? game.preGame?.matchContext?.referee ?? "").trim();
  if (!refName) return null;

  const directory = buildLeagueRefereeDirectory(allGames, game.league);
  const found = directory.find((r) => normRefName(r.name) === normRefName(refName));
  if (found) return found;

  const stats = game.preGame?.matchContext?.refereeStats;
  const ebYellow =
    stats?.avgYellow != null
      ? shrinkRefereeYellowRate(stats.avgYellow, stats.matches ?? 0, DEFAULT_FALLBACK_LEAGUE_YELLOW)
      : null;
  const { tier, label } = classifyRefereeRigor(ebYellow, DEFAULT_FALLBACK_LEAGUE_YELLOW, 50);
  return {
    name: refName,
    country: stats?.country,
    matches: stats?.matches ?? 0,
    avgYellow: stats?.avgYellow ?? null,
    avgRed: stats?.avgRed ?? null,
    avgFouls: stats?.avgFouls ?? null,
    avgGoals: stats?.avgGoals ?? null,
    ebYellow,
    leagueMeanYellow: DEFAULT_FALLBACK_LEAGUE_YELLOW,
    rigorPercentile: 50,
    rigorTier: tier,
    rigorLabel: label,
    rank: 1,
    totalInLeague: 1,
    upcoming: [],
  };
}
