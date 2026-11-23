import { createHash, createHmac } from "node:crypto";
import {
  and,
  desc,
  eq,
  sealedPicks,
  users,
  watchlist,
  type Db,
  type SealedParlayLegSpec,
} from "@pitchlab/db";

export const MAX_JOURNAL_PAGE_SIZE = 40;
const MAX_JOURNAL_OFFSET = 10_000;
const MAX_WATCHLIST_LIMIT = 40;

export async function profileIdForAuthUser(db: Db, authUserId: string): Promise<string | null> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.authUserId, authUserId));
  return row?.id ?? null;
}

export async function listWatchlist(db: Db, userId: string): Promise<string[]> {
  const rows = await db
    .select({ gameId: watchlist.gameId })
    .from(watchlist)
    .where(eq(watchlist.userId, userId))
    .limit(MAX_WATCHLIST_LIMIT);
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
  pickKind?: "single" | "parlay";
  pickMarket?: string | null;
  pickSelection?: string | null;
  pickLine?: number | null;
  parlayLegs?: readonly SealedParlayLegSpec[] | null;
}

export function canonicalSealPayload(userId: string, input: SealInput, sealedAt: Date): string {
  const baseFields: unknown[] = [
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
  ];
  if (input.pickKind === "parlay") {
    baseFields.push(
      "parlay",
      (input.parlayLegs ?? []).map((l) => [
        l.gameId,
        l.pickId,
        l.market ?? "",
        l.selection ?? "",
        l.line ?? null,
        l.kickoffAt,
      ]),
    );
  }
  return JSON.stringify(baseFields);
}

export function sealHashOf(userId: string, input: SealInput, sealedAt: Date): string {
  const canonicalPayload = canonicalSealPayload(userId, input, sealedAt);
  return createHash("sha256").update(canonicalPayload).digest("hex");
}

export function sealSignatureOf(userId: string, input: SealInput, sealedAt: Date): string | null {
  const serverSecret = process.env.BETTER_AUTH_SECRET?.trim();
  if (!serverSecret || serverSecret.length < 16) {
    return null;
  }
  const canonicalPayload = canonicalSealPayload(userId, input, sealedAt);
  return createHmac("sha256", serverSecret).update(canonicalPayload).digest("hex");
}

export type SealResult =
  | { ok: true; id: string; sealHash: string }
  | { ok: false; reason: "partido_iniciado" | "unidades_invalidas" | "momio_invalido" | "ya_sellado" };

export async function sealPick(db: Db, userId: string, input: SealInput, now: Date): Promise<SealResult> {
  if (now >= input.kickoffAt) return { ok: false, reason: "partido_iniciado" };
  if (!(Number.isFinite(input.units) && input.units > 0 && input.units <= 5)) {
    return { ok: false, reason: "unidades_invalidas" };
  }
  const kind = input.pickKind === "parlay" ? "parlay" : "single";
  const maxDecimal = kind === "parlay" ? 9999 : 1000;
  if (
    !(
      Number.isFinite(input.userDecimal) &&
      Number.isFinite(input.fairDecimal) &&
      input.userDecimal >= 1.01 &&
      input.userDecimal <= maxDecimal &&
      input.fairDecimal >= 1.01 &&
      input.fairDecimal <= maxDecimal
    )
  ) {
    return { ok: false, reason: "momio_invalido" };
  }
  const sealTimestamp = new Date(now.getTime());
  const sealHash = sealHashOf(userId, input, sealTimestamp);
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
      pickKind: kind,
      pickMarket: input.pickMarket ?? null,
      pickSelection: input.pickSelection ?? null,
      pickLine: input.pickLine != null && Number.isFinite(input.pickLine) ? input.pickLine.toFixed(2) : null,
      parlayLegs: input.parlayLegs ? [...input.parlayLegs] : null,
      units: input.units.toFixed(2),
      userDecimal: input.userDecimal.toFixed(3),
      fairDecimal: input.fairDecimal.toFixed(3),
      note: input.note?.slice(0, 280),
      sealHash,
      sealedAt: sealTimestamp,
      kickoffAt: input.kickoffAt,
    })
    .onConflictDoNothing()
    .returning({ id: sealedPicks.id, sealHash: sealedPicks.sealHash });
  return rows[0] ? { ok: true, id: rows[0].id, sealHash: rows[0].sealHash } : { ok: false, reason: "ya_sellado" };
}

export interface ListJournalOptions {
  limit?: number;
  offset?: number;
}

export async function listJournal(
  db: Db,
  userId: string,
  options: ListJournalOptions = {},
) {
  const limit =
    typeof options.limit === "number" && Number.isFinite(options.limit)
      ? Math.max(1, Math.min(MAX_JOURNAL_PAGE_SIZE, Math.trunc(options.limit)))
      : MAX_JOURNAL_PAGE_SIZE;
  const offset =
    typeof options.offset === "number" && Number.isFinite(options.offset)
      ? Math.max(0, Math.min(MAX_JOURNAL_OFFSET, Math.trunc(options.offset)))
      : 0;
  return db
    .select()
    .from(sealedPicks)
    .where(eq(sealedPicks.userId, userId))
    .orderBy(desc(sealedPicks.sealedAt), desc(sealedPicks.id))
    .limit(limit)
    .offset(offset);
}
