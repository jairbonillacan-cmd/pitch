import { eq } from "drizzle-orm";
import type { Db } from "./billing";
import { matchFrozenPicks } from "./schema";

export const MATCH_PICK_FREEZE_OFFSET_MS = 60 * 60_000;

const GAME_ID_RE = /^[a-zA-Z0-9._-]{1,128}$/;

export interface FrozenPickCandidate {
  gameId: string;
  pickId: string;
  pickLabel: string;
  categoryLabel: string;
  marketGroup: string;
  selectionKey: string;
  probability: number;
  fairDecimal: number;
  fairAmerican: number;
  kickoffAt: Date;
}

export interface StoredFrozenPick {
  gameId: string;
  pickId: string;
  pickLabel: string;
  categoryLabel: string;
  marketGroup: string;
  selectionKey: string;
  probability: number;
  fairDecimal: number;
  fairAmerican: number;
  kickoffAtIso: string;
  freezeAtIso: string;
  frozenAtIso: string;
}

function mapFrozenRow(row: typeof matchFrozenPicks.$inferSelect): StoredFrozenPick {
  return {
    gameId: row.gameId,
    pickId: row.pickId,
    pickLabel: row.pickLabel,
    categoryLabel: row.categoryLabel,
    marketGroup: row.marketGroup,
    selectionKey: row.selectionKey,
    probability: Number(row.probability),
    fairDecimal: Number(row.fairDecimal),
    fairAmerican: row.fairAmerican,
    kickoffAtIso: row.kickoffAt.toISOString(),
    freezeAtIso: row.freezeAt.toISOString(),
    frozenAtIso: row.frozenAt.toISOString(),
  };
}

export async function getFrozenMatchMainPick(
  db: Db,
  gameId: string,
): Promise<StoredFrozenPick | null> {
  if (!GAME_ID_RE.test(gameId)) return null;
  const rows = await db
    .select()
    .from(matchFrozenPicks)
    .where(eq(matchFrozenPicks.gameId, gameId))
    .limit(1);
  return rows[0] ? mapFrozenRow(rows[0]) : null;
}

/**
 * Si `now >= kickoffAt - 60 min`, persiste el pick principal una sola vez por partido
 * (`ON CONFLICT DO NOTHING`) y devuelve el registro inmutable. Antes del umbral devuelve `null`.
 */
export async function getOrFreezeMatchMainPick(
  db: Db,
  candidate: FrozenPickCandidate,
  now: Date,
): Promise<StoredFrozenPick | null> {
  if (!GAME_ID_RE.test(candidate.gameId)) return null;
  const kickoffMs = candidate.kickoffAt.getTime();
  if (!Number.isFinite(kickoffMs)) return null;
  const freezeMs = kickoffMs - MATCH_PICK_FREEZE_OFFSET_MS;
  if (now.getTime() < freezeMs) {
    return null;
  }

  const existing = await getFrozenMatchMainPick(db, candidate.gameId);
  if (existing) return existing;

  const probClamped = Math.min(0.99999, Math.max(0.00001, candidate.probability));
  const fairDecClamped = Math.max(1.001, candidate.fairDecimal);

  await db
    .insert(matchFrozenPicks)
    .values({
      gameId: candidate.gameId,
      pickId: candidate.pickId,
      pickLabel: candidate.pickLabel,
      categoryLabel: candidate.categoryLabel,
      marketGroup: candidate.marketGroup,
      selectionKey: candidate.selectionKey,
      probability: probClamped.toFixed(5),
      fairDecimal: fairDecClamped.toFixed(3),
      fairAmerican: Math.round(candidate.fairAmerican),
      kickoffAt: new Date(kickoffMs),
      freezeAt: new Date(freezeMs),
      frozenAt: now,
    })
    .onConflictDoNothing({ target: matchFrozenPicks.gameId });

  return getFrozenMatchMainPick(db, candidate.gameId);
}
