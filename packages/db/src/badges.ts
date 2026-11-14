/**
 * Datos de la base que necesitan las insignias, en lote para varios socios a la vez
 * (perfil: uno; feed de Comunidad: los autores de la página). Las reglas viven en
 * `@pitchlab/ui/badges`; aquí solo se lee.
 */
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db } from "./billing";
import { toUserPreferencesRecord, type UserPreferencesRecord } from "./preferences";
import {
  referralGrants,
  sealedPicks,
  socialLikes,
  socialPosts,
  tipsterProfiles,
  userPreferences,
  users,
} from "./schema";

export interface BadgeSealedPick {
  status: "pending" | "won" | "lost";
  units: number;
  userDecimal: number;
  fairDecimal: number;
  clvPct: number;
  leagueLabel: string;
  pickLabel: string;
  origin: string;
  sealedAtIso: string;
  settledAtIso: string | null;
}

export interface BadgeUserFacts {
  userId: string;
  handle: string;
  publicProfile: boolean;
  joinedAtIso: string;
  isTipster: boolean;
  likesOnPickPosts: number;
  paidReferrals: number;
  picks: BadgeSealedPick[];
  preferences: UserPreferencesRecord;
}

/** Estados de referido que ya cuentan como amigo con pago. */
const PAID_REFERRAL_STATUSES = ["qualified_paid", "rewarded_bilateral"] as const;

export async function loadBadgeFacts(
  db: Db,
  by: { userIds?: readonly string[]; handles?: readonly string[] },
): Promise<Map<string, BadgeUserFacts>> {
  const out = new Map<string, BadgeUserFacts>();
  const ids = Array.from(new Set(by.userIds ?? []));
  const handles = Array.from(new Set((by.handles ?? []).map((h) => h.toLowerCase())));
  if (ids.length === 0 && handles.length === 0) return out;

  const people = await db
    .select({
      id: users.id,
      handle: users.handle,
      publicProfile: users.publicProfile,
      createdAt: users.createdAt,
      isTipster: sql<boolean>`${tipsterProfiles.userId} is not null`,
    })
    .from(users)
    .leftJoin(tipsterProfiles, and(eq(tipsterProfiles.userId, users.id), eq(tipsterProfiles.isActive, true)))
    .where(
      and(
        isNotNull(users.handle),
        ids.length > 0 && handles.length > 0
          ? sql`(${inArray(users.id, ids)} or ${inArray(users.handle, handles)})`
          : ids.length > 0
            ? inArray(users.id, ids)
            : inArray(users.handle, handles),
      ),
    );
  if (people.length === 0) return out;
  const userIds = people.map((p) => p.id);

  const [pickRows, likeRows, referralRows, prefs] = await Promise.all([
    db
      .select({
        userId: sealedPicks.userId,
        status: sealedPicks.status,
        units: sealedPicks.units,
        userDecimal: sealedPicks.userDecimal,
        fairDecimal: sealedPicks.fairDecimal,
        clvPct: sealedPicks.clvPct,
        leagueLabel: sealedPicks.leagueLabel,
        pickLabel: sealedPicks.pickLabel,
        origin: sealedPicks.origin,
        sealedAt: sealedPicks.sealedAt,
        settledAt: sealedPicks.settledAt,
      })
      .from(sealedPicks)
      .where(inArray(sealedPicks.userId, userIds))
      .orderBy(sealedPicks.sealedAt),
    db
      .select({ userId: socialPosts.authorUserId, likes: sql<number>`count(${socialLikes.userId})::int` })
      .from(socialPosts)
      .innerJoin(socialLikes, eq(socialLikes.postId, socialPosts.id))
      .where(
        and(
          inArray(socialPosts.authorUserId, userIds),
          isNotNull(socialPosts.pick),
          eq(socialPosts.isHiddenByModeration, false),
        ),
      )
      .groupBy(socialPosts.authorUserId),
    db
      .select({ userId: referralGrants.referrerUserId, paid: sql<number>`count(*)::int` })
      .from(referralGrants)
      .where(
        and(
          inArray(referralGrants.referrerUserId, userIds),
          inArray(referralGrants.status, [...PAID_REFERRAL_STATUSES]),
        ),
      )
      .groupBy(referralGrants.referrerUserId),
    db.select().from(userPreferences).where(inArray(userPreferences.userId, userIds)),
  ]);

  const likes = new Map(likeRows.map((r) => [r.userId, Number(r.likes)]));
  const referrals = new Map(referralRows.map((r) => [r.userId, Number(r.paid)]));
  const prefsById = new Map(prefs.map((r) => [r.userId, r]));
  const picksById = new Map<string, BadgeSealedPick[]>();
  for (const r of pickRows) {
    if (r.status !== "won" && r.status !== "lost" && r.status !== "pending") continue;
    const list = picksById.get(r.userId) ?? [];
    list.push({
      status: r.status,
      units: Number(r.units),
      userDecimal: Number(r.userDecimal),
      fairDecimal: Number(r.fairDecimal),
      clvPct: r.clvPct === null ? 0 : Number(r.clvPct),
      leagueLabel: r.leagueLabel,
      pickLabel: r.pickLabel,
      origin: r.origin,
      sealedAtIso: r.sealedAt.toISOString(),
      settledAtIso: r.settledAt ? r.settledAt.toISOString() : null,
    });
    picksById.set(r.userId, list);
  }

  for (const p of people) {
    out.set(p.id, {
      userId: p.id,
      handle: p.handle!,
      publicProfile: p.publicProfile,
      joinedAtIso: p.createdAt.toISOString(),
      isTipster: Boolean(p.isTipster),
      likesOnPickPosts: likes.get(p.id) ?? 0,
      paidReferrals: referrals.get(p.id) ?? 0,
      picks: picksById.get(p.id) ?? [],
      preferences: toUserPreferencesRecord(prefsById.get(p.id), p.publicProfile),
    });
  }
  return out;
}
