import { loadAllActiveLeagueSnapshots, PRODUCT_LEAGUES } from "./snapshots.js";

/** Hora de inicio de un partido según los snapshots del servidor (fuente de verdad). */
export function findGameKickoff(gameId: string): Date | null {
  const envelopes = loadAllActiveLeagueSnapshots();
  for (const league of PRODUCT_LEAGUES) {
    const game = envelopes[league]?.data?.games.find((g) => g.id === gameId);
    if (game?.kickoffUtc) {
      const t = Date.parse(game.kickoffUtc);
      return Number.isFinite(t) ? new Date(t) : null;
    }
  }
  return null;
}
