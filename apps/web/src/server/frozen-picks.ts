import { createDb, getOrFreezeMatchMainPick, type Db } from "@pitchlab/db";
import {
  createFrozenMainPickSnapshot,
  PRE_MATCH_FREEZE_WINDOW_MS,
  parseKickoffUtcMs,
} from "@pitchlab/ui/pre-match";
import type { FrozenMainPickSnapshot, PlatformGame } from "@pitchlab/ui/types";

/**
 * Caché en memoria del proceso para el modo beta sin `DATABASE_URL` y como primera capa
 * rápida antes de tocar PostgreSQL. Una vez sellado en `T - 60 min`, nunca se sobreescribe.
 */
const memoryFrozenByGame = new Map<string, FrozenMainPickSnapshot>();

let frozenDb: Db | null = null;

/**
 * Resuelve y congela de forma determinista el pick principal del partido cuando faltan
 * 60 minutos o menos para el saque inicial (`now >= kickoff - 60 min`).
 *
 * - Antes del umbral: devuelve `null` (no persiste nada).
 * - En o después del umbral: guarda una sola vez en `match_frozen_picks` (si hay BD) y en
 *   memoria; llamadas posteriores devuelven el registro original aunque el motor se recalcule.
 */
export async function resolveServerFrozenMainPick(
  game: Pick<PlatformGame, "id" | "kickoffUtc" | "status" | "picks">,
  now: Date = new Date(),
): Promise<FrozenMainPickSnapshot | null> {
  const cached = memoryFrozenByGame.get(game.id);
  if (cached) {
    return cached;
  }

  const kickoffMs = parseKickoffUtcMs(game.kickoffUtc);
  if (!Number.isFinite(kickoffMs)) {
    return null;
  }

  const freezeAtMs = kickoffMs - PRE_MATCH_FREEZE_WINDOW_MS;
  const shouldFreeze = game.status !== "NS" || now.getTime() >= freezeAtMs;
  if (!shouldFreeze) {
    return null;
  }

  const candidateSnapshot = createFrozenMainPickSnapshot(game);
  if (!candidateSnapshot) {
    return null;
  }

  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    try {
      frozenDb ??= createDb(dbUrl) as unknown as Db;
      const stored = await getOrFreezeMatchMainPick(
        frozenDb,
        {
          gameId: candidateSnapshot.gameId,
          pickId: candidateSnapshot.pickId,
          pickLabel: candidateSnapshot.label,
          categoryLabel: candidateSnapshot.categoryLabel,
          marketGroup: candidateSnapshot.marketGroup,
          selectionKey: candidateSnapshot.selectionKey,
          probability: candidateSnapshot.p,
          fairDecimal: candidateSnapshot.fairDecimal,
          fairAmerican: candidateSnapshot.fairAmerican,
          kickoffAt: new Date(kickoffMs),
        },
        now,
      );
      if (stored) {
        const resolved: FrozenMainPickSnapshot = {
          gameId: stored.gameId,
          pickId: stored.pickId,
          label: stored.pickLabel,
          categoryLabel: stored.categoryLabel,
          marketGroup: stored.marketGroup,
          selectionKey: stored.selectionKey,
          p: stored.probability,
          fairDecimal: stored.fairDecimal,
          fairAmerican: stored.fairAmerican,
          kickoffUtc: stored.kickoffAtIso,
          freezeAtUtc: stored.freezeAtIso,
        };
        memoryFrozenByGame.set(game.id, resolved);
        return resolved;
      }
    } catch (err) {
      void err;
    }
  }

  memoryFrozenByGame.set(game.id, candidateSnapshot);
  return candidateSnapshot;
}

/** Limpia la caché en memoria (exclusivo para pruebas). */
export function clearServerFrozenPicksCacheForTests(): void {
  memoryFrozenByGame.clear();
}
