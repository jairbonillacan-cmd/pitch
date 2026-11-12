/**
 * Comunidad compartida: publicaciones, comentarios, «me gusta» y seguidos.
 *
 * El texto ya llega validado (largo y sin enlaces externos) desde la ruta; aquí viven las
 * reglas que necesitan la base: límite por hora, texto repetido, récord verificado del autor
 * (se calcula de su bitácora sellada, nunca lo manda el navegador) y quién puede borrar qué.
 */
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";
import type { Db } from "./billing";
import {
  notifications,
  sealedPicks,
  socialComments,
  socialFollows,
  socialLikes,
  socialPosts,
  tipstarProfiles,
  users,
} from "./schema";

export const SOCIAL_LIMITS = {
  postMin: 8,
  postMax: 600,
  commentMax: 400,
  postsPerHour: 10,
  commentsPerHour: 60,
  feedPageMax: 50,
  commentsPerPost: 30,
} as const;

/** Pick adjunto a una publicación, como lo ve quien la lee. */
export interface SocialPickSnapshot {
  pickId: string;
  gameId: string;
  label: string;
  units: number;
  userDecimal: number;
  fairDecimal: number;
  modelProbability: number;
}

export interface NewSocialPost {
  body: string;
  leagueLabel: string;
  matchLabel: string;
  pickBadge: string;
  originType: "Spacetime Suite" | "Bitácora Propia";
  pick?: SocialPickSnapshot | null;
  /** Partido del que se habla (debate de un partido sin pick adjunto). */
  gameId?: string | null;
}

export interface FeedComment {
  id: string;
  authorHandle: string;
  authorName: string;
  record: string;
  body: string;
  createdAt: string;
}

export interface FeedPost {
  id: string;
  authorHandle: string;
  authorName: string;
  authorIsTipstar: boolean;
  roleBadge: string;
  record: string;
  clv: string;
  leagueLabel: string;
  matchLabel: string;
  gameId: string | null;
  pickBadge: string;
  originType: string;
  pick: SocialPickSnapshot | null;
  body: string;
  createdAt: string;
  likes: number;
  likedByMe: boolean;
  isMine: boolean;
  comments: FeedComment[];
}

const HOUR = 3_600_000;

function unitsLabel(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}u`;
}

/** Récord del autor desde su bitácora sellada (mismo formato que la app). */
export async function authorRecord(db: Db, userId: string): Promise<{ record: string; clv: string }> {
  const rows = await db
    .select({
      status: sealedPicks.status,
      units: sealedPicks.units,
      userDecimal: sealedPicks.userDecimal,
      clvPct: sealedPicks.clvPct,
    })
    .from(sealedPicks)
    .where(eq(sealedPicks.userId, userId));
  let settled = 0;
  let net = 0;
  let clvSum = 0;
  let clvCount = 0;
  for (const row of rows) {
    if (row.clvPct !== null) {
      clvSum += Number(row.clvPct);
      clvCount += 1;
    }
    const units = Number(row.units);
    if (row.status === "won") {
      settled += 1;
      net += units * (Number(row.userDecimal) - 1);
    } else if (row.status === "lost") {
      settled += 1;
      net -= units;
    }
  }
  const avg = clvCount > 0 ? clvSum / clvCount : null;
  return {
    record: settled === 0 ? "Sin picks liquidados" : `${unitsLabel(net)} · ${settled} picks`,
    clv: avg === null ? "CLV —" : `CLV ${avg >= 0 ? "+" : ""}${avg.toFixed(1)} %`,
  };
}

async function isTipstar(db: Db, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: tipstarProfiles.userId })
    .from(tipstarProfiles)
    .where(and(eq(tipstarProfiles.userId, userId), eq(tipstarProfiles.isActive, true)));
  return Boolean(row);
}

export type CreatePostResult =
  | { ok: true; id: string }
  | { ok: false; reason: "limite" | "repetido" | "sin_usuario" };

export async function createSocialPost(
  db: Db,
  userId: string,
  input: NewSocialPost,
  now: Date,
): Promise<CreatePostResult> {
  const [author] = await db.select({ handle: users.handle }).from(users).where(eq(users.id, userId));
  if (!author?.handle) return { ok: false, reason: "sin_usuario" };

  const recent = await db
    .select({ body: socialPosts.body, createdAt: socialPosts.createdAt })
    .from(socialPosts)
    .where(and(eq(socialPosts.authorUserId, userId), gte(socialPosts.createdAt, new Date(now.getTime() - HOUR))))
    .orderBy(desc(socialPosts.createdAt));
  if (recent.length >= SOCIAL_LIMITS.postsPerHour) return { ok: false, reason: "limite" };

  const lastFive = await db
    .select({ body: socialPosts.body })
    .from(socialPosts)
    .where(eq(socialPosts.authorUserId, userId))
    .orderBy(desc(socialPosts.createdAt))
    .limit(5);
  const normalized = input.body.trim().toLowerCase();
  if (lastFive.some((p) => p.body.trim().toLowerCase() === normalized)) return { ok: false, reason: "repetido" };

  const [{ record, clv }, tipstar] = await Promise.all([authorRecord(db, userId), isTipstar(db, userId)]);
  const [row] = await db
    .insert(socialPosts)
    .values({
      authorUserId: userId,
      gameId: input.pick?.gameId ?? input.gameId ?? null,
      leagueLabel: input.leagueLabel,
      matchLabel: input.matchLabel,
      originType: input.originType,
      pickBadge: input.pickBadge,
      pick: input.pick ?? null,
      authorRoleBadgeSnapshot: tipstar ? "Tipstar Oficial" : "Socio Pase PitchLab Ultra",
      authorRecordSnapshot: record,
      authorClvSnapshot: clv,
      body: input.body.trim(),
      createdAt: now,
    })
    .returning({ id: socialPosts.id });
  return { ok: true, id: row!.id };
}

export type AddCommentResult =
  | { ok: true; comment: FeedComment }
  | { ok: false; reason: "no_existe" | "limite" | "sin_usuario" };

export async function addSocialComment(
  db: Db,
  userId: string,
  postId: string,
  body: string,
  now: Date,
): Promise<AddCommentResult> {
  const [author] = await db
    .select({ handle: users.handle, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, userId));
  if (!author?.handle) return { ok: false, reason: "sin_usuario" };
  const [post] = await db
    .select({ id: socialPosts.id, authorUserId: socialPosts.authorUserId })
    .from(socialPosts)
    .where(and(eq(socialPosts.id, postId), eq(socialPosts.isHiddenByModeration, false)));
  if (!post) return { ok: false, reason: "no_existe" };
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(socialComments)
    .where(
      and(eq(socialComments.authorUserId, userId), gte(socialComments.createdAt, new Date(now.getTime() - HOUR))),
    );
  if (count >= SOCIAL_LIMITS.commentsPerHour) return { ok: false, reason: "limite" };

  const { record } = await authorRecord(db, userId);
  const [row] = await db
    .insert(socialComments)
    .values({ postId, authorUserId: userId, body: body.trim(), authorRecordSnapshot: record, createdAt: now })
    .returning({ id: socialComments.id, createdAt: socialComments.createdAt });

  if (post.authorUserId !== userId) {
    await db.insert(notifications).values({
      userId: post.authorUserId,
      kind: "comment",
      actorUserId: userId,
      postId,
      createdAt: now,
    });
  }

  return {
    ok: true,
    comment: {
      id: row!.id,
      authorHandle: author.handle,
      authorName: author.displayName ?? author.handle,
      record,
      body: body.trim(),
      createdAt: row!.createdAt.toISOString(),
    },
  };
}

/** Pone o quita el «me gusta»; devuelve el total actualizado. */
export async function setSocialLike(
  db: Db,
  userId: string,
  postId: string,
  liked: boolean,
  now: Date = new Date(),
): Promise<{ ok: true; likes: number } | { ok: false; reason: "no_existe" }> {
  const [post] = await db
    .select({ id: socialPosts.id, authorUserId: socialPosts.authorUserId })
    .from(socialPosts)
    .where(and(eq(socialPosts.id, postId), eq(socialPosts.isHiddenByModeration, false)));
  if (!post) return { ok: false, reason: "no_existe" };
  if (liked) {
    const inserted = await db
      .insert(socialLikes)
      .values({ postId, userId, createdAt: now })
      .onConflictDoNothing()
      .returning({ postId: socialLikes.postId });
    if (inserted.length > 0 && post.authorUserId !== userId) {
      await db
        .insert(notifications)
        .values({
          userId: post.authorUserId,
          kind: "like",
          actorUserId: userId,
          postId,
          createdAt: now,
          readAt: null,
        })
        .onConflictDoUpdate({
          target: [notifications.userId, notifications.postId],
          targetWhere: sql`${notifications.kind} = 'like'`,
          set: {
            actorUserId: userId,
            createdAt: now,
            readAt: null,
          },
        });
    }
  } else {
    const removed = await db
      .delete(socialLikes)
      .where(and(eq(socialLikes.postId, postId), eq(socialLikes.userId, userId)))
      .returning({ postId: socialLikes.postId });
    if (removed.length > 0 && post.authorUserId !== userId) {
      const [latestRemaining] = await db
        .select({ userId: socialLikes.userId })
        .from(socialLikes)
        .where(and(eq(socialLikes.postId, postId), ne(socialLikes.userId, post.authorUserId)))
        .orderBy(desc(socialLikes.createdAt))
        .limit(1);
      if (!latestRemaining) {
        await db
          .delete(notifications)
          .where(
            and(
              eq(notifications.userId, post.authorUserId),
              eq(notifications.postId, postId),
              eq(notifications.kind, "like"),
            ),
          );
      } else {
        await db
          .update(notifications)
          .set({ actorUserId: latestRemaining.userId })
          .where(
            and(
              eq(notifications.userId, post.authorUserId),
              eq(notifications.postId, postId),
              eq(notifications.kind, "like"),
            ),
          );
      }
    }
  }
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(socialLikes)
    .where(eq(socialLikes.postId, postId));
  await db.update(socialPosts).set({ likesCount: count }).where(eq(socialPosts.id, postId));
  return { ok: true, likes: count };
}

/** Solo el autor borra su publicación (los comentarios y «me gusta» se van con ella). */
export async function deleteSocialPost(db: Db, userId: string, postId: string): Promise<boolean> {
  const deleted = await db
    .delete(socialPosts)
    .where(and(eq(socialPosts.id, postId), eq(socialPosts.authorUserId, userId)))
    .returning({ id: socialPosts.id });
  return deleted.length > 0;
}

export interface FeedQuery {
  limit?: number;
  /** Publicaciones anteriores a esta fecha (paginación). */
  before?: Date;
  /** Solo de este @usuario. */
  authorHandle?: string;
  /** Solo de quienes sigue `viewerUserId`. */
  following?: boolean;
  /** Una sola publicación por id (p. ej. al abrir un aviso de comentario). */
  postId?: string;
}

export async function listSocialFeed(db: Db, viewerUserId: string | null, query: FeedQuery = {}): Promise<FeedPost[]> {
  const limit = Math.min(Math.max(query.limit ?? 30, 1), SOCIAL_LIMITS.feedPageMax);
  const conditions = [eq(socialPosts.isHiddenByModeration, false), isNotNull(users.handle)];
  if (query.postId) conditions.push(eq(socialPosts.id, query.postId));
  if (query.before) conditions.push(lt(socialPosts.createdAt, query.before));
  if (query.authorHandle) conditions.push(eq(users.handle, query.authorHandle.toLowerCase()));
  if (query.following) {
    if (!viewerUserId) return [];
    conditions.push(
      inArray(
        socialPosts.authorUserId,
        db
          .select({ id: socialFollows.followedUserId })
          .from(socialFollows)
          .where(eq(socialFollows.followerUserId, viewerUserId)),
      ),
    );
  }

  const rows = await db
    .select({
      id: socialPosts.id,
      authorUserId: socialPosts.authorUserId,
      authorHandle: users.handle,
      authorName: users.displayName,
      authorIsTipstar: sql<boolean>`${tipstarProfiles.userId} is not null`,
      roleBadge: socialPosts.authorRoleBadgeSnapshot,
      record: socialPosts.authorRecordSnapshot,
      clv: socialPosts.authorClvSnapshot,
      leagueLabel: socialPosts.leagueLabel,
      matchLabel: socialPosts.matchLabel,
      gameId: socialPosts.gameId,
      pickBadge: socialPosts.pickBadge,
      originType: socialPosts.originType,
      pick: socialPosts.pick,
      body: socialPosts.body,
      createdAt: socialPosts.createdAt,
      likes: sql<number>`(select count(*)::int from ${socialLikes} where ${socialLikes.postId} = ${socialPosts.id})`,
    })
    .from(socialPosts)
    .innerJoin(users, eq(users.id, socialPosts.authorUserId))
    .leftJoin(tipstarProfiles, and(eq(tipstarProfiles.userId, users.id), eq(tipstarProfiles.isActive, true)))
    .where(and(...conditions))
    .orderBy(desc(socialPosts.createdAt))
    .limit(limit);
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const [liked, comments] = await Promise.all([
    viewerUserId
      ? db
          .select({ postId: socialLikes.postId })
          .from(socialLikes)
          .where(and(eq(socialLikes.userId, viewerUserId), inArray(socialLikes.postId, ids)))
      : Promise.resolve([] as { postId: string }[]),
    db
      .select({
        id: socialComments.id,
        postId: socialComments.postId,
        authorHandle: users.handle,
        authorName: users.displayName,
        record: socialComments.authorRecordSnapshot,
        body: socialComments.body,
        createdAt: socialComments.createdAt,
      })
      .from(socialComments)
      .innerJoin(users, eq(users.id, socialComments.authorUserId))
      .where(
        and(
          inArray(socialComments.postId, ids),
          eq(socialComments.isHiddenByModeration, false),
          isNotNull(users.handle),
        ),
      )
      .orderBy(asc(socialComments.createdAt)),
  ]);
  const likedSet = new Set(liked.map((l) => l.postId));
  const byPost = new Map<string, FeedComment[]>();
  for (const c of comments) {
    const list = byPost.get(c.postId) ?? [];
    if (list.length < SOCIAL_LIMITS.commentsPerPost) {
      list.push({
        id: c.id,
        authorHandle: c.authorHandle!,
        authorName: c.authorName ?? c.authorHandle!,
        record: c.record,
        body: c.body,
        createdAt: c.createdAt.toISOString(),
      });
    }
    byPost.set(c.postId, list);
  }

  return rows.map((r) => ({
    id: r.id,
    authorHandle: r.authorHandle!,
    authorName: r.authorName ?? r.authorHandle!,
    authorIsTipstar: Boolean(r.authorIsTipstar),
    roleBadge: r.roleBadge,
    record: r.record,
    clv: r.clv,
    leagueLabel: r.leagueLabel,
    matchLabel: r.matchLabel,
    gameId: r.gameId,
    pickBadge: r.pickBadge,
    originType: r.originType,
    pick: (r.pick as SocialPickSnapshot | null) ?? null,
    body: r.body,
    createdAt: r.createdAt.toISOString(),
    likes: r.likes,
    likedByMe: likedSet.has(r.id),
    isMine: viewerUserId !== null && r.authorUserId === viewerUserId,
    comments: byPost.get(r.id) ?? [],
  }));
}

export type FollowResult =
  | { ok: true; following: boolean }
  | { ok: false; reason: "no_existe" | "propio" };

/** Seguir o dejar de seguir a un socio por su @usuario. */
export async function setSocialFollow(
  db: Db,
  followerUserId: string,
  handle: string,
  follow: boolean,
  now: Date = new Date(),
): Promise<FollowResult> {
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.handle, handle.trim().toLowerCase()), isNotNull(users.authUserId)));
  if (!target) return { ok: false, reason: "no_existe" };
  if (target.id === followerUserId) return { ok: false, reason: "propio" };
  if (follow) {
    const inserted = await db
      .insert(socialFollows)
      .values({ followerUserId, followedUserId: target.id, createdAt: now })
      .onConflictDoNothing()
      .returning({ followerUserId: socialFollows.followerUserId });
    if (inserted.length > 0) {
      await db
        .insert(notifications)
        .values({
          userId: target.id,
          kind: "follow",
          actorUserId: followerUserId,
          createdAt: now,
        })
        .onConflictDoNothing({
          target: [notifications.userId, notifications.actorUserId],
          where: sql`${notifications.kind} = 'follow'`,
        });
    }
  } else {
    await db
      .delete(socialFollows)
      .where(and(eq(socialFollows.followerUserId, followerUserId), eq(socialFollows.followedUserId, target.id)));
  }
  return { ok: true, following: follow };
}

export async function getSocialPostById(
  db: Db,
  viewerUserId: string | null,
  postId: string,
): Promise<FeedPost | null> {
  const [post] = await listSocialFeed(db, viewerUserId, { postId, limit: 1 });
  return post ?? null;
}

export type SocialNotificationKind = "comment" | "follow" | "like";

export interface SocialNotificationRow {
  id: string;
  kind: SocialNotificationKind;
  actorHandle: string;
  actorName: string;
  postId: string | null;
  postExcerpt: string | null;
  /** Cantidad de otros socios a quienes les gustó esa publicación (solo para `kind === "like"`). */
  likeCount: number;
  createdAt: string;
  readAt: string | null;
}

function excerptOf(body: string | null): string | null {
  if (!body) return null;
  const clean = body.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return clean.length > 90 ? `${clean.slice(0, 89).trimEnd()}…` : clean;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Últimos avisos sociales del socio (comentarios, seguidos y «me gusta» agrupados). */
export async function listSocialNotifications(
  db: Db,
  userId: string,
  limit = 50,
): Promise<SocialNotificationRow[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const rows = await db
    .select({
      id: notifications.id,
      kind: notifications.kind,
      actorHandle: users.handle,
      actorName: users.displayName,
      postId: notifications.postId,
      postBody: socialPosts.body,
      postHidden: socialPosts.isHiddenByModeration,
      likeCount: sql<number>`case when ${notifications.kind} = 'like' and ${notifications.postId} is not null then (select count(*)::int from ${socialLikes} where ${socialLikes.postId} = ${notifications.postId} and ${socialLikes.userId} <> ${notifications.userId}) else 0 end`,
      createdAt: notifications.createdAt,
      readAt: notifications.readAt,
    })
    .from(notifications)
    .innerJoin(users, eq(users.id, notifications.actorUserId))
    .leftJoin(socialPosts, eq(socialPosts.id, notifications.postId))
    .where(
      and(
        eq(notifications.userId, userId),
        isNotNull(users.handle),
        eq(users.socialPauseEnabled, false),
        sql`(${notifications.postId} is null or (${socialPosts.id} is not null and ${socialPosts.isHiddenByModeration} = false))`,
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(safeLimit);

  return rows
    .filter((r) => r.kind !== "like" || r.likeCount > 0)
    .map((r) => ({
      id: r.id,
      kind: r.kind as SocialNotificationKind,
      actorHandle: r.actorHandle!,
      actorName: r.actorName ?? r.actorHandle!,
      postId: r.postId,
      postExcerpt: excerptOf(r.postBody),
      likeCount: r.likeCount,
      createdAt: r.createdAt.toISOString(),
      readAt: r.readAt ? r.readAt.toISOString() : null,
    }));
}

/** Marca como leídos todos los avisos pendientes del socio o solo los `ids` recibidos. */
export async function markSocialNotificationsRead(
  db: Db,
  userId: string,
  ids?: readonly string[] | null,
  now: Date = new Date(),
): Promise<number> {
  if (ids !== undefined && ids !== null) {
    const validIds = ids.filter((id) => UUID_PATTERN.test(id));
    if (validIds.length === 0) return 0;
    const updated = await db
      .update(notifications)
      .set({ readAt: now })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt), inArray(notifications.id, validIds)))
      .returning({ id: notifications.id });
    return updated.length;
  }
  const updated = await db
    .update(notifications)
    .set({ readAt: now })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return updated.length;
}

/** @usuarios que sigue el socio. */
export async function listFollowing(db: Db, userId: string): Promise<string[]> {
  const rows = await db
    .select({ handle: users.handle })
    .from(socialFollows)
    .innerJoin(users, eq(users.id, socialFollows.followedUserId))
    .where(and(eq(socialFollows.followerUserId, userId), isNotNull(users.handle)));
  return rows.map((r) => r.handle!);
}

/** Seguidores y seguidos de un socio. */
export async function followCounts(db: Db, userId: string): Promise<{ followers: number; following: number }> {
  const [row] = await db
    .select({
      followers: sql<number>`(select count(*)::int from ${socialFollows} where ${socialFollows.followedUserId} = ${userId})`,
      following: sql<number>`(select count(*)::int from ${socialFollows} where ${socialFollows.followerUserId} = ${userId})`,
    })
    .from(users)
    .where(eq(users.id, userId));
  return { followers: row?.followers ?? 0, following: row?.following ?? 0 };
}
