import { and, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "./billing";
import { liveFeedCache, liveMatchEvents, providerMatchLinks, providerQuota, watchlist } from "./schema";

/**
 * EN-VIVO-1: base del Match Center en vivo.
 *
 * - Caché compartida con «arriendo» (lease): muchas instancias del servidor, un solo lector.
 * - Cuota diaria del proveedor (la ingesta comparte las 7,500 peticiones de Bzzoiro).
 * - Mapeo id del proveedor ↔ id propio.
 * - Momentos del partido y avisos para quien lo sigue.
 */

const GAME_ID_RE = /^[a-zA-Z0-9._-]{1,128}$/;
const CACHE_KEY_RE = /^[a-z0-9:._-]{1,160}$/;

export type LiveProvider = "bzzoiro";

// ---------- Caché compartida ----------

export interface LiveCacheEntry<T> {
  payload: T;
  fetchedAt: Date;
  freshUntil: Date;
  fresh: boolean;
}

export async function readLiveCache<T>(db: Db, key: string, now: Date): Promise<LiveCacheEntry<T> | null> {
  if (!CACHE_KEY_RE.test(key)) throw new Error(`Llave de caché no válida: ${key}`);
  const [row] = await db.select().from(liveFeedCache).where(eq(liveFeedCache.cacheKey, key)).limit(1);
  // Fila creada solo para arrendar el turno: todavía no hay datos.
  if (!row || row.fetchedAt.getTime() === 0) return null;
  return {
    payload: row.payload as T,
    fetchedAt: row.fetchedAt,
    freshUntil: row.freshUntil,
    fresh: row.freshUntil.getTime() > now.getTime(),
  };
}

/**
 * Intenta tomar el turno para refrescar `key`. Devuelve `true` solo a una instancia mientras dure
 * el arriendo; las demás sirven lo que haya en caché aunque esté vencido.
 */
export async function claimLiveRefresh(db: Db, key: string, now: Date, leaseMs: number): Promise<boolean> {
  if (!CACHE_KEY_RE.test(key)) throw new Error(`Llave de caché no válida: ${key}`);
  const until = new Date(now.getTime() + leaseMs);
  // Crea la fila vacía la primera vez (vencida desde siempre) para poder arrendarla.
  await db
    .insert(liveFeedCache)
    .values({ cacheKey: key, payload: {}, fetchedAt: new Date(0), freshUntil: new Date(0) })
    .onConflictDoNothing();
  const claimed = await db
    .update(liveFeedCache)
    .set({ refreshLeaseUntil: until })
    .where(
      and(
        eq(liveFeedCache.cacheKey, key),
        or(isNull(liveFeedCache.refreshLeaseUntil), lt(liveFeedCache.refreshLeaseUntil, now)),
      ),
    )
    .returning({ key: liveFeedCache.cacheKey });
  return claimed.length > 0;
}

export async function writeLiveCache(db: Db, key: string, payload: unknown, now: Date, ttlMs: number): Promise<void> {
  if (!CACHE_KEY_RE.test(key)) throw new Error(`Llave de caché no válida: ${key}`);
  const freshUntil = new Date(now.getTime() + ttlMs);
  await db
    .insert(liveFeedCache)
    .values({ cacheKey: key, payload: payload as object, fetchedAt: now, freshUntil, refreshLeaseUntil: null })
    .onConflictDoUpdate({
      target: liveFeedCache.cacheKey,
      set: { payload: payload as object, fetchedAt: now, freshUntil, refreshLeaseUntil: null },
    });
}

/** Suelta el arriendo sin escribir (la consulta falló); el siguiente lector puede intentar. */
export async function releaseLiveRefresh(db: Db, key: string): Promise<void> {
  await db.update(liveFeedCache).set({ refreshLeaseUntil: null }).where(eq(liveFeedCache.cacheKey, key));
}

// ---------- Cuota del proveedor ----------

function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export interface ProviderQuotaToday {
  requests: number;
  /** Lo que el proveedor reportó como restante en su cabecera `RateLimit` (si la mandó). */
  remaining: number | null;
}

export async function providerQuotaToday(db: Db, provider: LiveProvider, now: Date): Promise<ProviderQuotaToday> {
  const [row] = await db
    .select({ requests: providerQuota.requests, remaining: providerQuota.remaining })
    .from(providerQuota)
    .where(and(eq(providerQuota.provider, provider), eq(providerQuota.day, utcDay(now))))
    .limit(1);
  return { requests: row?.requests ?? 0, remaining: row?.remaining ?? null };
}

export async function recordProviderRequest(
  db: Db,
  provider: LiveProvider,
  now: Date,
  remaining: number | null,
): Promise<void> {
  await db
    .insert(providerQuota)
    .values({ provider, day: utcDay(now), requests: 1, remaining, updatedAt: now })
    .onConflictDoUpdate({
      target: [providerQuota.provider, providerQuota.day],
      set: {
        requests: sql`${providerQuota.requests} + 1`,
        remaining: remaining === null ? sql`${providerQuota.remaining}` : remaining,
        updatedAt: now,
      },
    });
}

// ---------- Mapeo de ids ----------

export async function getProviderLinks(
  db: Db,
  provider: LiveProvider,
  gameIds: readonly string[],
): Promise<Map<string, string>> {
  const ids = gameIds.filter((id) => GAME_ID_RE.test(id));
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ gameId: providerMatchLinks.gameId, eventId: providerMatchLinks.providerEventId })
    .from(providerMatchLinks)
    .where(and(eq(providerMatchLinks.provider, provider), inArray(providerMatchLinks.gameId, ids)));
  return new Map(rows.map((r) => [r.gameId, r.eventId]));
}

export async function saveProviderLinks(
  db: Db,
  provider: LiveProvider,
  links: readonly { gameId: string; providerEventId: string; method: string }[],
  now: Date,
): Promise<void> {
  const rows = links.filter((l) => GAME_ID_RE.test(l.gameId) && /^[0-9]{1,18}$/.test(l.providerEventId));
  for (const l of rows) {
    // Un evento del proveedor apunta a un solo partido nuestro: el primero en llegar se queda.
    await db
      .insert(providerMatchLinks)
      .values({ provider, gameId: l.gameId, providerEventId: l.providerEventId, method: l.method, linkedAt: now })
      .onConflictDoNothing();
  }
}

// ---------- Momentos del partido ----------

export type LiveMomentKind = "kickoff" | "goal" | "halftime" | "final";

export interface LiveMomentInput {
  gameId: string;
  kind: LiveMomentKind;
  side: "home" | "away" | null;
  minute: number | null;
  homeScore: number;
  awayScore: number;
}

export function liveMomentKey(m: LiveMomentInput): string {
  // Un gol se identifica por el marcador al que llevó: si el proveedor corrige (VAR) y luego
  // vuelve al mismo marcador, no se avisa dos veces.
  if (m.kind === "goal") return `${m.gameId}:goal:${m.homeScore}-${m.awayScore}`;
  return `${m.gameId}:${m.kind}`;
}

/** Guarda momentos nuevos; devuelve cuáles no existían para disparar avisos sin duplicar. */
export async function recordLiveMomentsDetailed(
  db: Db,
  moments: readonly LiveMomentInput[],
  now: Date,
): Promise<LiveMomentInput[]> {
  const inserted: LiveMomentInput[] = [];
  for (const m of moments) {
    if (!GAME_ID_RE.test(m.gameId)) continue;
    const rows = await db
      .insert(liveMatchEvents)
      .values({
        gameId: m.gameId,
        kind: m.kind,
        side: m.side,
        minute: m.minute,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        dedupeKey: liveMomentKey(m),
        occurredAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: liveMatchEvents.id });
    if (rows.length > 0) inserted.push(m);
  }
  return inserted;
}

/** Guarda momentos nuevos; devuelve cuántos no existían. */
export async function recordLiveMoments(db: Db, moments: readonly LiveMomentInput[], now: Date): Promise<number> {
  const inserted = await recordLiveMomentsDetailed(db, moments, now);
  return inserted.length;
}

export interface LiveGameWatcher {
  userId: string;
  gameId: string;
  kickoff: boolean;
  goals: boolean;
  final: boolean;
}

/** Lista los socios que siguen alguno de estos partidos y sus preferencias por evento. */
export async function listLiveGameWatchers(
  db: Db,
  gameIds: readonly string[],
): Promise<LiveGameWatcher[]> {
  const ids = [...new Set(gameIds.filter((id) => GAME_ID_RE.test(id)))];
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      userId: watchlist.userId,
      gameId: watchlist.gameId,
      kickoff: watchlist.alertKickoff,
      goals: watchlist.alertGoals,
      final: watchlist.alertFinal,
    })
    .from(watchlist)
    .where(inArray(watchlist.gameId, ids));
  return rows;
}

export interface LiveAlert {
  id: string;
  gameId: string;
  kind: LiveMomentKind;
  side: "home" | "away" | null;
  minute: number | null;
  homeScore: number;
  awayScore: number;
  occurredAtIso: string;
}

/** Avisos de los partidos que el socio sigue, respetando qué avisos pidió en cada uno. */
export async function listLiveAlertsForUser(db: Db, userId: string, since: Date, limit = 50): Promise<LiveAlert[]> {
  const rows = await db
    .select({
      id: liveMatchEvents.id,
      gameId: liveMatchEvents.gameId,
      kind: liveMatchEvents.kind,
      side: liveMatchEvents.side,
      minute: liveMatchEvents.minute,
      homeScore: liveMatchEvents.homeScore,
      awayScore: liveMatchEvents.awayScore,
      occurredAt: liveMatchEvents.occurredAt,
    })
    .from(liveMatchEvents)
    .innerJoin(watchlist, and(eq(watchlist.gameId, liveMatchEvents.gameId), eq(watchlist.userId, userId)))
    .where(
      and(
        gt(liveMatchEvents.occurredAt, since),
        or(
          and(eq(liveMatchEvents.kind, "kickoff"), eq(watchlist.alertKickoff, true)),
          and(eq(liveMatchEvents.kind, "goal"), eq(watchlist.alertGoals, true)),
          and(eq(liveMatchEvents.kind, "halftime"), eq(watchlist.alertGoals, true)),
          and(eq(liveMatchEvents.kind, "final"), eq(watchlist.alertFinal, true)),
        ),
      ),
    )
    .orderBy(desc(liveMatchEvents.occurredAt))
    .limit(Math.min(Math.max(limit, 1), 100));
  return rows.map((r) => ({
    id: r.id,
    gameId: r.gameId,
    kind: r.kind as LiveMomentKind,
    side: (r.side as "home" | "away" | null) ?? null,
    minute: r.minute,
    homeScore: r.homeScore,
    awayScore: r.awayScore,
    occurredAtIso: r.occurredAt.toISOString(),
  }));
}

// ---------- «Siguiendo» ----------

export interface FollowAlerts {
  kickoff: boolean;
  goals: boolean;
  final: boolean;
}

export interface FollowedGame {
  gameId: string;
  alerts: FollowAlerts;
}

export async function listFollowedGames(db: Db, userId: string): Promise<FollowedGame[]> {
  const rows = await db
    .select({
      gameId: watchlist.gameId,
      kickoff: watchlist.alertKickoff,
      goals: watchlist.alertGoals,
      final: watchlist.alertFinal,
    })
    .from(watchlist)
    .where(eq(watchlist.userId, userId));
  return rows.map((r) => ({ gameId: r.gameId, alerts: { kickoff: r.kickoff, goals: r.goals, final: r.final } }));
}

/** Sigue (o deja de seguir) un partido. Con `alerts` ajusta qué avisos quiere. */
export async function setFollowedGame(
  db: Db,
  userId: string,
  gameId: string,
  follow: boolean,
  alerts?: Partial<FollowAlerts>,
): Promise<{ ok: true } | { ok: false; reason: "invalid" }> {
  if (!GAME_ID_RE.test(gameId)) return { ok: false, reason: "invalid" };
  if (!follow) {
    await db.delete(watchlist).where(and(eq(watchlist.userId, userId), eq(watchlist.gameId, gameId)));
    return { ok: true };
  }
  const values = {
    userId,
    gameId,
    ...(alerts?.kickoff === undefined ? {} : { alertKickoff: alerts.kickoff }),
    ...(alerts?.goals === undefined ? {} : { alertGoals: alerts.goals }),
    ...(alerts?.final === undefined ? {} : { alertFinal: alerts.final }),
  };
  const set = {
    ...(alerts?.kickoff === undefined ? {} : { alertKickoff: alerts.kickoff }),
    ...(alerts?.goals === undefined ? {} : { alertGoals: alerts.goals }),
    ...(alerts?.final === undefined ? {} : { alertFinal: alerts.final }),
  };
  if (Object.keys(set).length === 0) {
    await db.insert(watchlist).values(values).onConflictDoNothing();
  } else {
    await db.insert(watchlist).values(values).onConflictDoUpdate({ target: [watchlist.userId, watchlist.gameId], set });
  }
  return { ok: true };
}
