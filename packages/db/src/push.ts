/**
 * Suscripciones Web Push (RFC 8291 + VAPID) del socio en Neon.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "./billing";
import { pushSubscriptions, userPreferences } from "./schema";
import { sanitizeFollowedTopics } from "./preferences";

export type PushTopic = "picks" | "live" | "social";

export interface PushSubscriptionInput {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  topicPicks?: boolean;
  topicLive?: boolean;
  topicSocial?: boolean;
  userAgent?: string | null;
}

export interface StoredPushSubscription {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  topicPicks: boolean;
  topicLive: boolean;
  topicSocial: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const MAX_PUSH_SUBSCRIPTIONS_PER_USER = 5;

export class PushEndpointConflictError extends Error {
  readonly code = "push_endpoint_conflict" as const;

  constructor(message = "El endpoint de notificación ya pertenece a otra cuenta.") {
    super(message);
    this.name = "PushEndpointConflictError";
  }
}

export async function upsertPushSubscription(
  db: Db,
  input: PushSubscriptionInput,
  now = new Date(),
): Promise<StoredPushSubscription> {
  const [row] = await db
    .insert(pushSubscriptions)
    .values({
      userId: input.userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      topicPicks: input.topicPicks ?? true,
      topicLive: input.topicLive ?? true,
      topicSocial: input.topicSocial ?? true,
      userAgent: input.userAgent?.slice(0, 240) ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        p256dh: input.p256dh,
        auth: input.auth,
        topicPicks: input.topicPicks ?? true,
        topicLive: input.topicLive ?? true,
        topicSocial: input.topicSocial ?? true,
        userAgent: input.userAgent?.slice(0, 240) ?? null,
        updatedAt: now,
      },
      setWhere: eq(pushSubscriptions.userId, input.userId),
    })
    .returning();

  if (!row) {
    throw new PushEndpointConflictError();
  }

  const owned = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, input.userId))
    .orderBy(desc(pushSubscriptions.updatedAt), desc(pushSubscriptions.createdAt));

  if (owned.length > MAX_PUSH_SUBSCRIPTIONS_PER_USER) {
    const others = owned.filter((item) => item.id !== row.id);
    const staleIds = others.slice(MAX_PUSH_SUBSCRIPTIONS_PER_USER - 1).map((item) => item.id);
    if (staleIds.length > 0) {
      await db
        .delete(pushSubscriptions)
        .where(and(eq(pushSubscriptions.userId, input.userId), inArray(pushSubscriptions.id, staleIds)));
    }
  }

  return {
    id: row.id,
    userId: row.userId,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
    topicPicks: row.topicPicks,
    topicLive: row.topicLive,
    topicSocial: row.topicSocial,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function deletePushSubscription(
  db: Db,
  userId: string,
  endpoint?: string,
): Promise<number> {
  const deleted = endpoint
    ? await db
        .delete(pushSubscriptions)
        .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
        .returning({ id: pushSubscriptions.id })
    : await db
        .delete(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, userId))
        .returning({ id: pushSubscriptions.id });
  return deleted.length;
}

export async function listUserPushSubscriptions(
  db: Db,
  userId: string,
): Promise<StoredPushSubscription[]> {
  return db
    .select({
      id: pushSubscriptions.id,
      userId: pushSubscriptions.userId,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
      topicPicks: pushSubscriptions.topicPicks,
      topicLive: pushSubscriptions.topicLive,
      topicSocial: pushSubscriptions.topicSocial,
      createdAt: pushSubscriptions.createdAt,
      updatedAt: pushSubscriptions.updatedAt,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .orderBy(desc(pushSubscriptions.updatedAt));
}

export async function listPushSubscriptionsForUsers(
  db: Db,
  userIds: readonly string[],
  topic: PushTopic,
): Promise<StoredPushSubscription[]> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return [];
  const topicFilter =
    topic === "picks"
      ? eq(pushSubscriptions.topicPicks, true)
      : topic === "live"
        ? eq(pushSubscriptions.topicLive, true)
        : eq(pushSubscriptions.topicSocial, true);
  return db
    .select({
      id: pushSubscriptions.id,
      userId: pushSubscriptions.userId,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
      topicPicks: pushSubscriptions.topicPicks,
      topicLive: pushSubscriptions.topicLive,
      topicSocial: pushSubscriptions.topicSocial,
      createdAt: pushSubscriptions.createdAt,
      updatedAt: pushSubscriptions.updatedAt,
    })
    .from(pushSubscriptions)
    .where(and(inArray(pushSubscriptions.userId, ids), topicFilter));
}

export async function markPushSent(db: Db, endpoints: readonly string[], now = new Date()): Promise<void> {
  if (endpoints.length === 0) return;
  await db
    .update(pushSubscriptions)
    .set({ lastSentAt: now })
    .where(inArray(pushSubscriptions.endpoint, [...endpoints]));
}

export async function deleteInvalidPushSubscriptions(db: Db, endpoints: readonly string[]): Promise<void> {
  if (endpoints.length === 0) return;
  await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, [...endpoints]));
}

export interface PushAlertRecipient {
  userId: string;
  favoriteLeagues: string[];
  followedTeams: string[];
  lineMoveAlerts: boolean;
  emailValueAlerts: boolean;
}

/** Lista usuarios con al menos una suscripción Web Push activa para despachar alertas programadas. */
export async function listPushAlertRecipients(
  db: Db,
  topic: PushTopic = "picks",
): Promise<PushAlertRecipient[]> {
  const topicFilter =
    topic === "picks"
      ? eq(pushSubscriptions.topicPicks, true)
      : topic === "live"
        ? eq(pushSubscriptions.topicLive, true)
        : eq(pushSubscriptions.topicSocial, true);

  const subRows = await db
    .select({ userId: pushSubscriptions.userId })
    .from(pushSubscriptions)
    .where(topicFilter);
  const userIds = Array.from(new Set(subRows.map((r) => r.userId).filter(Boolean)));
  if (userIds.length === 0) return [];

  const prefs = await db
    .select({
      userId: userPreferences.userId,
      favoriteLeagues: userPreferences.favoriteLeagues,
      followedTopics: userPreferences.followedTopics,
      emailValueAlerts: userPreferences.emailValueAlerts,
      pushEnabled: userPreferences.pushEnabled,
    })
    .from(userPreferences)
    .where(inArray(userPreferences.userId, userIds));

  const prefByUser = new Map(prefs.map((p) => [p.userId, p]));
  const out: PushAlertRecipient[] = [];
  for (const uid of userIds) {
    const p = prefByUser.get(uid);
    if (p && p.pushEnabled === false) continue;
    const ft = sanitizeFollowedTopics(p?.followedTopics);
    out.push({
      userId: uid,
      favoriteLeagues: p?.favoriteLeagues ?? [],
      followedTeams: ft.teams,
      lineMoveAlerts: ft.lineMoveAlerts ?? true,
      emailValueAlerts: p?.emailValueAlerts ?? true,
    });
  }
  return out;
}
