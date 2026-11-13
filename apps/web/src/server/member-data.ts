/**
 * Datos del socio en la base (F4): vigilancia y bitácora sellada.
 * Las rutas `/api/me/*` usan estas funciones con el usuario de la sesión de Better Auth.
 */
import { createHash, createHmac } from "node:crypto";
import { and, eq, sealedPicks, users, watchlist, type Db } from "@pitchlab/db";

export async function profileIdForAuthUser(db: Db, authUserId: string): Promise<string | null> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.authUserId, authUserId));
  return row?.id ?? null;
}

export async function listWatchlist(db: Db, userId: string): Promise<string[]> {
  const rows = await db.select({ gameId: watchlist.gameId }).from(watchlist).where(eq(watchlist.userId, userId));
  return rows.map((r) => r.gameId);
}

export async function setWatched(db: Db, userId: string, gameId: string, watched: boolean): Promise<void> {
  if (watched) {
    await db.insert(watchlist).values({ userId, gameId }).onConflictDoNothing();
  } else {
    await db.delete(watchlist).where(and(eq(watchlist.userId, userId), eq(watchlist.gameId, gameId)));
  }
}

export interface SealInput {
  pickId: string;
  gameId: string;
  leagueLabel: string;
  matchLabel: string;
  pickLabel: string;
  origin: string;
  units: number;
  userDecimal: number;
  fairDecimal: number;
  kickoffAt: Date;
  note?: string;
}

/** Huella del pick sellado: cubre todos los campos inmutables (con HMAC si hay secreto de servidor). */
export function sealHashOf(userId: string, input: SealInput, sealedAt: Date): string {
  const canonicalPayload = JSON.stringify([
    userId,
    input.gameId,
    input.pickId,
    input.leagueLabel,
    input.matchLabel,
    input.pickLabel,
    input.origin,
    input.units.toFixed(2),
    input.userDecimal.toFixed(3),
    input.fairDecimal.toFixed(3),
    (input.note ?? "").slice(0, 280),
    input.kickoffAt.toISOString(),
    sealedAt.toISOString(),
  ]);
  const serverSecret = process.env.BETTER_AUTH_SECRET?.trim();
  if (serverSecret && serverSecret.length >= 16) {
    return createHmac("sha256", serverSecret).update(canonicalPayload).digest("hex");
  }
  return createHash("sha256").update(canonicalPayload).digest("hex");
}

export type SealResult =
  | { ok: true; id: string; sealHash: string }
  | { ok: false; reason: "partido_iniciado" | "unidades_invalidas" | "momio_invalido" | "ya_sellado" };

/** Sella un pick antes del inicio del partido (la base también lo exige con CHECK y trigger pick_immutable). */
export async function sealPick(db: Db, userId: string, input: SealInput, now: Date): Promise<SealResult> {
  if (now >= input.kickoffAt) return { ok: false, reason: "partido_iniciado" };
  if (!(Number.isFinite(input.units) && input.units > 0 && input.units <= 5)) {
    return { ok: false, reason: "unidades_invalidas" };
  }
  if (
    !(
      Number.isFinite(input.userDecimal) &&
      Number.isFinite(input.fairDecimal) &&
      input.userDecimal >= 1.01 &&
      input.userDecimal <= 1000 &&
      input.fairDecimal >= 1.01 &&
      input.fairDecimal <= 1000
    )
  ) {
    return { ok: false, reason: "momio_invalido" };
  }
  const sealHash = sealHashOf(userId, input, now);
  const rows = await db
    .insert(sealedPicks)
    .values({
      userId,
      pickId: input.pickId,
      gameId: input.gameId,
      leagueLabel: input.leagueLabel,
      matchLabel: input.matchLabel,
      pickLabel: input.pickLabel,
      origin: input.origin,
      units: input.units.toFixed(2),
      userDecimal: input.userDecimal.toFixed(3),
      fairDecimal: input.fairDecimal.toFixed(3),
      note: input.note?.slice(0, 280),
      sealHash,
      sealedAt: now,
      kickoffAt: input.kickoffAt,
    })
    .onConflictDoNothing()
    .returning({ id: sealedPicks.id });
  return rows[0] ? { ok: true, id: rows[0].id, sealHash } : { ok: false, reason: "ya_sellado" };
}

export async function listJournal(db: Db, userId: string) {
  return db.select().from(sealedPicks).where(eq(sealedPicks.userId, userId));
}
