/**
 * Caché persistente de lecturas Cortex IA en Neon por `(gameId, factsHash, model)`.
 */
import { gt, lt } from "drizzle-orm";
import { eq, and } from "drizzle-orm";
import type { Db } from "./billing";
import { cortexCache } from "./schema";

export async function getCachedCortexSummary<T = Record<string, unknown>>(
  db: Db,
  cacheKey: string,
  now = new Date(),
): Promise<T | null> {
  const [row] = await db
    .select({ summary: cortexCache.summary })
    .from(cortexCache)
    .where(and(eq(cortexCache.cacheKey, cacheKey), gt(cortexCache.expiresAt, now)))
    .limit(1);
  if (!row || !row.summary || typeof row.summary !== "object") return null;
  return row.summary as T;
}

export async function setCachedCortexSummary(
  db: Db,
  input: {
    cacheKey: string;
    gameId: string;
    factsHash: string;
    model: string;
    summary: Record<string, unknown>;
    expiresAt: Date;
    now?: Date;
  },
): Promise<void> {
  const now = input.now ?? new Date();
  await db
    .insert(cortexCache)
    .values({
      cacheKey: input.cacheKey,
      gameId: input.gameId,
      factsHash: input.factsHash,
      model: input.model,
      summary: input.summary,
      expiresAt: input.expiresAt,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: cortexCache.cacheKey,
      set: {
        factsHash: input.factsHash,
        model: input.model,
        summary: input.summary,
        expiresAt: input.expiresAt,
        createdAt: now,
      },
    });
}

export async function pruneExpiredCortexCache(db: Db, now = new Date()): Promise<void> {
  await db.delete(cortexCache).where(lt(cortexCache.expiresAt, now));
}
