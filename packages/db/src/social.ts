/**
 * Comunidad compartida: publicaciones, comentarios, «me gusta» y seguidos.
 *
 * El texto ya llega validado (largo y sin enlaces externos) desde la ruta; aquí viven las
 * reglas que necesitan la base: límite por hora, texto repetido, récord verificado del autor
 * (se calcula de su bitácora sellada, nunca lo manda el navegador) y quién puede borrar qué.
 */
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { Db } from "./billing";
import {
  notifications,
  sealedPicks,
  socialComments,
  socialFollows,
  socialLikes,
  socialModerationLogs,
  socialPosts,
  socialReports,
  tipstarProfiles,
  users,
} from "./schema";

export const SOCIAL_LIMITS = {
  postMin: 8,
  postMax: 600,
  commentMax: 400,
  postsPerHour: 10,
  commentsPerHour: 60,
  reportsPerHour: 10,
  autoHideReportThreshold: 3,
  feedPageMax: 50,
  commentsPerPost: 30,
} as const;

export const SOCIAL_REPORT_REASONS = [
  "spam_enlaces",
  "ofensivo",
  "apuesta_riesgosa",
  "otro",
] as const;

export type SocialReportReason = (typeof SOCIAL_REPORT_REASONS)[number];

export function isSocialReportReason(value: unknown): value is SocialReportReason {
  return typeof value === "string" && (SOCIAL_REPORT_REASONS as readonly string[]).includes(value);
}

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
  isMine: boolean;
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
  | { ok: false; reason: "limite" | "repetido" | "sin_usuario" | "pausado" };

export async function createSocialPost(
  db: Db,
  userId: string,
  input: NewSocialPost,
  now: Date,
): Promise<CreatePostResult> {
  const [author] = await db
    .select({ handle: users.handle, socialPauseEnabled: users.socialPauseEnabled })
    .from(users)
    .where(eq(users.id, userId));
  if (!author?.handle) return { ok: false, reason: "sin_usuario" };
  if (author.socialPauseEnabled) return { ok: false, reason: "pausado" };

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
  | { ok: false; reason: "no_existe" | "limite" | "sin_usuario" | "pausado" };

export async function addSocialComment(
  db: Db,
  userId: string,
  postId: string,
  body: string,
  now: Date,
): Promise<AddCommentResult> {
  const [author] = await db
    .select({ handle: users.handle, displayName: users.displayName, socialPauseEnabled: users.socialPauseEnabled })
    .from(users)
    .where(eq(users.id, userId));
  if (!author?.handle) return { ok: false, reason: "sin_usuario" };
  if (author.socialPauseEnabled) return { ok: false, reason: "pausado" };
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
      isMine: true,
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
  const notPausedForViewer = viewerUserId
    ? or(eq(users.socialPauseEnabled, false), eq(users.id, viewerUserId))!
    : eq(users.socialPauseEnabled, false);
  const conditions = [eq(socialPosts.isHiddenByModeration, false), isNotNull(users.handle), notPausedForViewer];
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
        authorUserId: socialComments.authorUserId,
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
          notPausedForViewer,
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
        isMine: viewerUserId !== null && c.authorUserId === viewerUserId,
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

export type ReportSocialResult =
  | { ok: true; id: string; autoHidden: boolean }
  | {
      ok: false;
      reason: "motivo_invalido" | "no_existe" | "propio_reporte" | "ya_reportado" | "limite" | "sin_usuario";
    };

/**
 * Reporta una publicación o comentario ajeno. Un socio no puede reportar dos veces lo mismo,
 * tiene límite por hora y, al llegar a 3 reportes de personas distintas, el contenido se oculta
 * solo mientras el equipo fundador lo revisa.
 */
export async function reportSocialContent(
  db: Db,
  reporterUserId: string,
  input: { postId?: string | null; commentId?: string | null; reason: unknown },
  now: Date = new Date(),
): Promise<ReportSocialResult> {
  if (!isSocialReportReason(input.reason)) {
    return { ok: false, reason: "motivo_invalido" };
  }
  const postId = typeof input.postId === "string" && UUID_PATTERN.test(input.postId.trim()) ? input.postId.trim() : null;
  const commentId =
    typeof input.commentId === "string" && UUID_PATTERN.test(input.commentId.trim()) ? input.commentId.trim() : null;
  if ((postId === null) === (commentId === null)) {
    return { ok: false, reason: "no_existe" };
  }

  const [reporter] = await db.select({ handle: users.handle }).from(users).where(eq(users.id, reporterUserId));
  if (!reporter?.handle) return { ok: false, reason: "sin_usuario" };

  let targetAuthorId: string;
  let targetAlreadyHidden: boolean;
  if (postId) {
    const [post] = await db
      .select({ authorUserId: socialPosts.authorUserId, hidden: socialPosts.isHiddenByModeration })
      .from(socialPosts)
      .where(eq(socialPosts.id, postId));
    if (!post) return { ok: false, reason: "no_existe" };
    targetAuthorId = post.authorUserId;
    targetAlreadyHidden = post.hidden;
  } else {
    const [comment] = await db
      .select({ authorUserId: socialComments.authorUserId, hidden: socialComments.isHiddenByModeration })
      .from(socialComments)
      .where(eq(socialComments.id, commentId!));
    if (!comment) return { ok: false, reason: "no_existe" };
    targetAuthorId = comment.authorUserId;
    targetAlreadyHidden = comment.hidden;
  }

  if (targetAuthorId === reporterUserId) {
    return { ok: false, reason: "propio_reporte" };
  }

  const targetMatch = postId ? eq(socialReports.postId, postId) : eq(socialReports.commentId, commentId!);
  const existing = await db
    .select({ id: socialReports.id })
    .from(socialReports)
    .where(and(eq(socialReports.reporterUserId, reporterUserId), targetMatch))
    .limit(1);
  if (existing.length > 0) {
    return { ok: false, reason: "ya_reportado" };
  }

  const [{ recentCount }] = await db
    .select({ recentCount: sql<number>`count(*)::int` })
    .from(socialReports)
    .where(and(eq(socialReports.reporterUserId, reporterUserId), gte(socialReports.createdAt, new Date(now.getTime() - HOUR))));
  if (recentCount >= SOCIAL_LIMITS.reportsPerHour) {
    return { ok: false, reason: "limite" };
  }

  const inserted = await db
    .insert(socialReports)
    .values({
      reporterUserId,
      postId,
      commentId,
      reason: input.reason,
      status: "pending",
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: socialReports.id });
  if (inserted.length === 0) {
    return { ok: false, reason: "ya_reportado" };
  }

  const [{ reporterCount }] = await db
    .select({ reporterCount: sql<number>`count(distinct ${socialReports.reporterUserId})::int` })
    .from(socialReports)
    .where(and(eq(socialReports.status, "pending"), targetMatch));

  let autoHidden = false;
  if (reporterCount >= SOCIAL_LIMITS.autoHideReportThreshold && !targetAlreadyHidden) {
    if (postId) {
      await db.update(socialPosts).set({ isHiddenByModeration: true }).where(eq(socialPosts.id, postId));
    } else {
      await db.update(socialComments).set({ isHiddenByModeration: true }).where(eq(socialComments.id, commentId!));
    }
    await db.insert(socialModerationLogs).values({
      userId: targetAuthorId,
      reason: `auto_ocultar:${postId ? `post:${postId}` : `comment:${commentId}`}:${reporterCount}_reportes`,
      createdAt: now,
    });
    autoHidden = true;
  }

  return { ok: true, id: inserted[0]!.id, autoHidden };
}

export interface ModerationQueueItem {
  targetType: "post" | "comment";
  targetId: string;
  postId: string;
  body: string;
  isHiddenByModeration: boolean;
  authorUserId: string;
  authorHandle: string;
  authorName: string;
  authorPaused: boolean;
  reportCount: number;
  reasons: SocialReportReason[];
  latestReportAt: string;
}

export interface ModerationHiddenItem {
  targetType: "post" | "comment";
  targetId: string;
  postId: string;
  body: string;
  authorUserId: string;
  authorHandle: string;
  authorName: string;
  authorPaused: boolean;
  createdAt: string;
}

export interface PausedSocialMember {
  userId: string;
  handle: string | null;
  displayName: string;
  email: string;
}

export interface ModerationPanelData {
  pendingQueue: ModerationQueueItem[];
  hiddenItems: ModerationHiddenItem[];
  pausedMembers: PausedSocialMember[];
}

/** Cola de reportes pendientes, contenido oculto y socios pausados para `/app/admin`. */
export async function listModerationPanelData(db: Db): Promise<ModerationPanelData> {
  const pendingRows = await db
    .select({
      postId: socialReports.postId,
      commentId: socialReports.commentId,
      reason: socialReports.reason,
      reporterUserId: socialReports.reporterUserId,
      createdAt: socialReports.createdAt,
    })
    .from(socialReports)
    .where(eq(socialReports.status, "pending"))
    .orderBy(desc(socialReports.createdAt))
    .limit(250);

  type Bucket = {
    targetType: "post" | "comment";
    targetId: string;
    reporters: Set<string>;
    reasons: Set<SocialReportReason>;
    latestReportAt: Date;
  };
  const buckets = new Map<string, Bucket>();
  for (const r of pendingRows) {
    const targetType: "post" | "comment" = r.postId ? "post" : "comment";
    const targetId = (r.postId ?? r.commentId)!;
    const key = `${targetType}:${targetId}`;
    let b = buckets.get(key);
    if (!b) {
      b = {
        targetType,
        targetId,
        reporters: new Set(),
        reasons: new Set(),
        latestReportAt: r.createdAt,
      };
      buckets.set(key, b);
    }
    b.reporters.add(r.reporterUserId);
    if (isSocialReportReason(r.reason)) b.reasons.add(r.reason);
    if (r.createdAt > b.latestReportAt) b.latestReportAt = r.createdAt;
  }

  const pendingPostIds = [...buckets.values()].filter((b) => b.targetType === "post").map((b) => b.targetId);
  const pendingCommentIds = [...buckets.values()].filter((b) => b.targetType === "comment").map((b) => b.targetId);

  const [postTargets, commentTargets, hiddenPosts, hiddenComments, pausedRows] = await Promise.all([
    pendingPostIds.length > 0
      ? db
          .select({
            id: socialPosts.id,
            body: socialPosts.body,
            hidden: socialPosts.isHiddenByModeration,
            authorUserId: users.id,
            authorHandle: users.handle,
            authorName: users.displayName,
            authorPaused: users.socialPauseEnabled,
          })
          .from(socialPosts)
          .innerJoin(users, eq(users.id, socialPosts.authorUserId))
          .where(inArray(socialPosts.id, pendingPostIds))
      : Promise.resolve([]),
    pendingCommentIds.length > 0
      ? db
          .select({
            id: socialComments.id,
            postId: socialComments.postId,
            body: socialComments.body,
            hidden: socialComments.isHiddenByModeration,
            authorUserId: users.id,
            authorHandle: users.handle,
            authorName: users.displayName,
            authorPaused: users.socialPauseEnabled,
          })
          .from(socialComments)
          .innerJoin(users, eq(users.id, socialComments.authorUserId))
          .where(inArray(socialComments.id, pendingCommentIds))
      : Promise.resolve([]),
    db
      .select({
        id: socialPosts.id,
        body: socialPosts.body,
        createdAt: socialPosts.createdAt,
        authorUserId: users.id,
        authorHandle: users.handle,
        authorName: users.displayName,
        authorPaused: users.socialPauseEnabled,
      })
      .from(socialPosts)
      .innerJoin(users, eq(users.id, socialPosts.authorUserId))
      .where(eq(socialPosts.isHiddenByModeration, true))
      .orderBy(desc(socialPosts.createdAt))
      .limit(20),
    db
      .select({
        id: socialComments.id,
        postId: socialComments.postId,
        body: socialComments.body,
        createdAt: socialComments.createdAt,
        authorUserId: users.id,
        authorHandle: users.handle,
        authorName: users.displayName,
        authorPaused: users.socialPauseEnabled,
      })
      .from(socialComments)
      .innerJoin(users, eq(users.id, socialComments.authorUserId))
      .where(eq(socialComments.isHiddenByModeration, true))
      .orderBy(desc(socialComments.createdAt))
      .limit(20),
    db
      .select({
        userId: users.id,
        handle: users.handle,
        displayName: users.displayName,
        email: users.email,
      })
      .from(users)
      .where(eq(users.socialPauseEnabled, true))
      .orderBy(asc(users.email)),
  ]);

  const postMap = new Map(postTargets.map((p) => [p.id, p]));
  const commentMap = new Map(commentTargets.map((c) => [c.id, c]));

  const pendingQueue: ModerationQueueItem[] = [];
  for (const b of buckets.values()) {
    if (b.targetType === "post") {
      const p = postMap.get(b.targetId);
      if (!p) continue;
      pendingQueue.push({
        targetType: "post",
        targetId: p.id,
        postId: p.id,
        body: p.body,
        isHiddenByModeration: p.hidden,
        authorUserId: p.authorUserId,
        authorHandle: p.authorHandle ?? "socio",
        authorName: p.authorName ?? p.authorHandle ?? "Socio",
        authorPaused: p.authorPaused,
        reportCount: b.reporters.size,
        reasons: [...b.reasons],
        latestReportAt: b.latestReportAt.toISOString(),
      });
    } else {
      const c = commentMap.get(b.targetId);
      if (!c) continue;
      pendingQueue.push({
        targetType: "comment",
        targetId: c.id,
        postId: c.postId,
        body: c.body,
        isHiddenByModeration: c.hidden,
        authorUserId: c.authorUserId,
        authorHandle: c.authorHandle ?? "socio",
        authorName: c.authorName ?? c.authorHandle ?? "Socio",
        authorPaused: c.authorPaused,
        reportCount: b.reporters.size,
        reasons: [...b.reasons],
        latestReportAt: b.latestReportAt.toISOString(),
      });
    }
  }

  pendingQueue.sort((a, b) => b.reportCount - a.reportCount || b.latestReportAt.localeCompare(a.latestReportAt));

  const pendingKeys = new Set(pendingQueue.map((item) => `${item.targetType}:${item.targetId}`));
  const hiddenItems: ModerationHiddenItem[] = [
    ...hiddenPosts
      .filter((p) => !pendingKeys.has(`post:${p.id}`))
      .map((p) => ({
        targetType: "post" as const,
        targetId: p.id,
        postId: p.id,
        body: p.body,
        authorUserId: p.authorUserId,
        authorHandle: p.authorHandle ?? "socio",
        authorName: p.authorName ?? p.authorHandle ?? "Socio",
        authorPaused: p.authorPaused,
        createdAt: p.createdAt.toISOString(),
      })),
    ...hiddenComments
      .filter((c) => !pendingKeys.has(`comment:${c.id}`))
      .map((c) => ({
        targetType: "comment" as const,
        targetId: c.id,
        postId: c.postId,
        body: c.body,
        authorUserId: c.authorUserId,
        authorHandle: c.authorHandle ?? "socio",
        authorName: c.authorName ?? c.authorHandle ?? "Socio",
        authorPaused: c.authorPaused,
        createdAt: c.createdAt.toISOString(),
      })),
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 15);

  const pausedMembers: PausedSocialMember[] = pausedRows.map((u) => ({
    userId: u.userId,
    handle: u.handle,
    displayName: u.displayName ?? (u.handle ? `@${u.handle}` : u.email),
    email: u.email,
  }));

  return { pendingQueue, hiddenItems, pausedMembers };
}

export const MODERATION_ACTIONS = ["hide", "restore", "dismiss", "pause_user", "unpause_user"] as const;
export type ModerationActionKind = (typeof MODERATION_ACTIONS)[number];

export interface ModerationActionInput {
  action: ModerationActionKind;
  targetType?: "post" | "comment";
  targetId?: string;
  targetUserId?: string;
}

export type ModerationActionResult =
  | { ok: true }
  | { ok: false; reason: "accion_invalida" | "no_existe" };

/** Ejecuta una acción del panel de moderación y la registra en `social_moderation_logs`. */
export async function applyModerationAction(
  db: Db,
  adminUserId: string,
  input: ModerationActionInput,
  now: Date = new Date(),
): Promise<ModerationActionResult> {
  if (!(MODERATION_ACTIONS as readonly string[]).includes(input.action)) {
    return { ok: false, reason: "accion_invalida" };
  }

  if (input.action === "pause_user" || input.action === "unpause_user") {
    const targetUserId =
      typeof input.targetUserId === "string" && UUID_PATTERN.test(input.targetUserId.trim())
        ? input.targetUserId.trim()
        : null;
    if (!targetUserId) return { ok: false, reason: "accion_invalida" };
    const updated = await db
      .update(users)
      .set({ socialPauseEnabled: input.action === "pause_user" })
      .where(eq(users.id, targetUserId))
      .returning({ id: users.id });
    if (updated.length === 0) return { ok: false, reason: "no_existe" };
    await db.insert(socialModerationLogs).values({
      userId: targetUserId,
      reason: `admin:${adminUserId}:${input.action === "pause_user" ? "pausar_socio" : "reactivar_socio"}`,
      createdAt: now,
    });
    return { ok: true };
  }

  const targetType = input.targetType === "post" || input.targetType === "comment" ? input.targetType : null;
  const targetId =
    typeof input.targetId === "string" && UUID_PATTERN.test(input.targetId.trim()) ? input.targetId.trim() : null;
  if (!targetType || !targetId) {
    return { ok: false, reason: "accion_invalida" };
  }

  let authorUserId: string;
  if (targetType === "post") {
    const [post] = await db
      .select({ authorUserId: socialPosts.authorUserId })
      .from(socialPosts)
      .where(eq(socialPosts.id, targetId));
    if (!post) return { ok: false, reason: "no_existe" };
    authorUserId = post.authorUserId;
    if (input.action === "hide") {
      await db.update(socialPosts).set({ isHiddenByModeration: true }).where(eq(socialPosts.id, targetId));
    } else if (input.action === "restore") {
      await db.update(socialPosts).set({ isHiddenByModeration: false }).where(eq(socialPosts.id, targetId));
    }
  } else {
    const [comment] = await db
      .select({ authorUserId: socialComments.authorUserId })
      .from(socialComments)
      .where(eq(socialComments.id, targetId));
    if (!comment) return { ok: false, reason: "no_existe" };
    authorUserId = comment.authorUserId;
    if (input.action === "hide") {
      await db.update(socialComments).set({ isHiddenByModeration: true }).where(eq(socialComments.id, targetId));
    } else if (input.action === "restore") {
      await db.update(socialComments).set({ isHiddenByModeration: false }).where(eq(socialComments.id, targetId));
    }
  }

  const nextStatus = input.action === "hide" ? "hidden" : input.action === "restore" ? "restored" : "dismissed";
  const targetFilter = targetType === "post" ? eq(socialReports.postId, targetId) : eq(socialReports.commentId, targetId);
  await db
    .update(socialReports)
    .set({ status: nextStatus, resolvedAt: now, resolvedByUserId: adminUserId })
    .where(and(eq(socialReports.status, "pending"), targetFilter));

  const verb = input.action === "hide" ? "ocultar" : input.action === "restore" ? "restaurar" : "descartar";
  await db.insert(socialModerationLogs).values({
    userId: authorUserId,
    reason: `admin:${adminUserId}:${verb}:${targetType}:${targetId}`,
    createdAt: now,
  });

  return { ok: true };
}
