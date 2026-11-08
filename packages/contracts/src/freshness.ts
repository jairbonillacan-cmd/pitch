import type { LeagueId } from "./ids.js";

export const FRESHNESS_SLA_HOURS: Record<string, number> = {
  nfl: 24,
  "premier-league": 24,
  "liga-mx": 12,
};

export function computeStaleAfter(observedAtIso: string, league: LeagueId | string): string {
  const hours = FRESHNESS_SLA_HOURS[league] ?? 24;
  const ms = new Date(observedAtIso).getTime() + hours * 3600 * 1000;
  return new Date(ms).toISOString();
}
