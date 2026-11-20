/**
 * Comunidad compartida: publicaciones, comentarios, «me gusta» y seguidos.
 *
 * El texto ya llega validado (largo y sin enlaces externos) desde la ruta; aquí viven las
 * reglas que necesitan la base: límite por hora, texto repetido, récord verificado del autor
 * (se calcula de su bitácora sellada, nunca lo manda el navegador) y quién puede borrar qué.
 */
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { Db } from "./billing";
import { sanitizeFollowedTopics } from "./preferences";
import {
  notifications,
  sealedPicks,
  socialCommentLikes,
  socialComments,
  socialFollows,
  socialLikes,
  socialModerationLogs,
  socialPosts,
  socialReports,
  tipsterProfiles,
  userPreferences,
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
  /** Pick ya sellado en bitácora (opcional; si falta, se busca por `(userId, pickId)`). */
  sealedJournalEntryId?: string | null;
}

export interface FeedComment {
  id: string;
  parentCommentId: string | null;
  replyToHandle: string | null;
  authorHandle: string;
  authorName: string;
  authorAvatarUrl: string | null;
  record: string;
  body: string;
  createdAt: string;
  isMine: boolean;
  helpfulCount: number;
  helpfulByMe: boolean;
}

export type FeedPickStatus = "open" | "won" | "lost" | "void";

export interface FeedPost {
  id: string;
  authorHandle: string;
  authorName: string;
  authorAvatarUrl: string | null;
  authorIsTipster: boolean;
  roleBadge: string;
  record: string;
  clv: string;
  leagueLabel: string;
  matchLabel: string;
  gameId: string | null;
  pickBadge: string;
  originType: string;
  pick: SocialPickSnapshot | null;
  pickStatus: FeedPickStatus | null;
  body: string;
  createdAt: string;
  likes: number;
  likedByMe: boolean;
  isMine: boolean;
  commentsCount: number;
  copiesCount: number;
  comments: FeedComment[];
}

const HOUR = 3_600_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    clv: avg === null ? "Ventaja —" : `Ventaja ${avg >= 0 ? "+" : ""}${avg.toFixed(1)} %`,
  };
}

async function isTipster(db: Db, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: tipsterProfiles.userId })
    .from(tipsterProfiles)
    .where(and(eq(tipsterProfiles.userId, userId), eq(tipsterProfiles.isActive, true)));
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

  const [{ record, clv }, tipster, linkedSealedId] = await Promise.all([
    authorRecord(db, userId),
    isTipster(db, userId),
    (async (): Promise<string | null> => {
      if (input.sealedJournalEntryId && UUID_PATTERN.test(input.sealedJournalEntryId)) {
        const [owned] = await db
          .select({ id: sealedPicks.id })
          .from(sealedPicks)
          .where(and(eq(sealedPicks.id, input.sealedJournalEntryId), eq(sealedPicks.userId, userId)))
          .limit(1);
        if (owned) return owned.id;
      }
      if (input.pick?.pickId) {
        const [byPick] = await db
          .select({ id: sealedPicks.id })
          .from(sealedPicks)
          .where(and(eq(sealedPicks.userId, userId), eq(sealedPicks.pickId, input.pick.pickId)))
          .limit(1);
        if (byPick) return byPick.id;
      }
      return null;
    })(),
  ]);
  const [row] = await db
    .insert(socialPosts)
    .values({
      authorUserId: userId,
      gameId: input.pick?.gameId ?? input.gameId ?? null,
      leagueLabel: input.leagueLabel,
      matchLabel: input.matchLabel,
      originType: input.originType,
      pickBadge: input.pickBadge,
      sealedJournalEntryId: linkedSealedId,
      pick: input.pick ?? null,
      authorRoleBadgeSnapshot: tipster ? "Tipster Oficial" : "Socio Pase PitchLab Ultra",
      authorRecordSnapshot: record,
      authorClvSnapshot: clv,
      body: input.body.trim(),
      createdAt: now,
    })
    .returning({ id: socialPosts.id });
  return { ok: true, id: row!.id };
}

export type AddCommentResult =
  | { ok: true; comment: FeedComment; notifiedUserIds: string[] }
  | { ok: false; reason: "no_existe" | "limite" | "sin_usuario" | "pausado" };

const MENTION_PATTERN = /(?:^|[\s(])@([a-z0-9_]{3,24})/gi;

function extractMentionHandles(body: string): string[] {
  const handles = new Set<string>();
  MENTION_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MENTION_PATTERN.exec(body)) !== null) {
    if (m[1]) handles.add(m[1].toLowerCase());
    if (handles.size >= 5) break;
  }
  return [...handles];
}

export async function addSocialComment(
  db: Db,
  userId: string,
  postId: string,
  body: string,
  now: Date,
  parentCommentId?: string | null,
): Promise<AddCommentResult> {
  const [author] = await db
    .select({
      handle: users.handle,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      socialPauseEnabled: users.socialPauseEnabled,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!author?.handle) return { ok: false, reason: "sin_usuario" };
  if (author.socialPauseEnabled) return { ok: false, reason: "pausado" };
  const [post] = await db
    .select({ id: socialPosts.id, authorUserId: socialPosts.authorUserId })
    .from(socialPosts)
    .where(and(eq(socialPosts.id, postId), eq(socialPosts.isHiddenByModeration, false)));
  if (!post) return { ok: false, reason: "no_existe" };

  let resolvedParentId: string | null = null;
  let parentAuthorUserId: string | null = null;
  let replyToHandle: string | null = null;
  const trimmedParent = typeof parentCommentId === "string" ? parentCommentId.trim() : "";
  if (trimmedParent) {
    if (!UUID_PATTERN.test(trimmedParent)) return { ok: false, reason: "no_existe" };
    const [parentRow] = await db
      .select({
        id: socialComments.id,
        postId: socialComments.postId,
        parentCommentId: socialComments.parentCommentId,
        authorUserId: socialComments.authorUserId,
        hidden: socialComments.isHiddenByModeration,
        authorHandle: users.handle,
      })
      .from(socialComments)
      .innerJoin(users, eq(users.id, socialComments.authorUserId))
      .where(eq(socialComments.id, trimmedParent));
    if (!parentRow || parentRow.postId !== postId || parentRow.hidden) {
      return { ok: false, reason: "no_existe" };
    }
    // Conservamos el padre directo para soportar hilos multinivel reales.
    resolvedParentId = parentRow.id;
    parentAuthorUserId = parentRow.authorUserId;
    replyToHandle = parentRow.authorHandle ?? null;
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(socialComments)
    .where(
      and(eq(socialComments.authorUserId, userId), gte(socialComments.createdAt, new Date(now.getTime() - HOUR))),
    );
  if (count >= SOCIAL_LIMITS.commentsPerHour) return { ok: false, reason: "limite" };

  const cleanBody = body.trim();
  const { record } = await authorRecord(db, userId);
  const [row] = await db
    .insert(socialComments)
    .values({
      postId,
      parentCommentId: resolvedParentId,
      authorUserId: userId,
      body: cleanBody,
      authorRecordSnapshot: record,
      createdAt: now,
    })
    .returning({ id: socialComments.id, createdAt: socialComments.createdAt });

  const commentId = row!.id;
  const notifiedUsers = new Set<string>([userId]);

  if (parentAuthorUserId && !notifiedUsers.has(parentAuthorUserId)) {
    await db.insert(notifications).values({
      userId: parentAuthorUserId,
      kind: "comment_reply",
      actorUserId: userId,
      postId,
      commentId,
      createdAt: now,
    });
    notifiedUsers.add(parentAuthorUserId);
  }

  if (!notifiedUsers.has(post.authorUserId)) {
    await db.insert(notifications).values({
      userId: post.authorUserId,
      kind: "comment",
      actorUserId: userId,
      postId,
      commentId,
      createdAt: now,
    });
    notifiedUsers.add(post.authorUserId);
  }

  const mentionedHandles = extractMentionHandles(cleanBody);
  if (mentionedHandles.length > 0) {
    const mentionedUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.handle, mentionedHandles), eq(users.socialPauseEnabled, false)));
    for (const target of mentionedUsers) {
      if (notifiedUsers.has(target.id)) continue;
      notifiedUsers.add(target.id);
      await db.insert(notifications).values({
        userId: target.id,
        kind: "mention",
        actorUserId: userId,
        postId,
        commentId,
        createdAt: now,
      });
    }
  }

  return {
    ok: true,
    notifiedUserIds: [...notifiedUsers].filter((id) => id !== userId),
    comment: {
      id: commentId,
      parentCommentId: resolvedParentId,
      replyToHandle,
      authorHandle: author.handle,
      authorName: author.displayName ?? author.handle,
      authorAvatarUrl: author.avatarUrl ?? null,
      record,
      body: cleanBody,
      createdAt: row!.createdAt.toISOString(),
      isMine: true,
      helpfulCount: 0,
      helpfulByMe: false,
    },
  };
}

/** Solo el autor borra su comentario; las respuestas hijas suben al padre anterior para no romper el hilo. */
export async function deleteSocialComment(
  db: Db,
  userId: string,
  commentId: string,
  postId?: string,
): Promise<boolean> {
  if (!UUID_PATTERN.test(commentId)) return false;
  if (postId && !UUID_PATTERN.test(postId)) return false;
  const [existing] = await db
    .select({ id: socialComments.id, parentCommentId: socialComments.parentCommentId })
    .from(socialComments)
    .where(
      and(
        eq(socialComments.id, commentId),
        eq(socialComments.authorUserId, userId),
        postId ? eq(socialComments.postId, postId) : undefined,
      ),
    );
  if (!existing) return false;
  if (existing.parentCommentId) {
    await db
      .update(socialComments)
      .set({ parentCommentId: existing.parentCommentId })
      .where(eq(socialComments.parentCommentId, commentId));
  }
  const deleted = await db
    .delete(socialComments)
    .where(
      and(
        eq(socialComments.id, commentId),
        eq(socialComments.authorUserId, userId),
        postId ? eq(socialComments.postId, postId) : undefined,
      ),
    )
    .returning({ id: socialComments.id });
  return deleted.length > 0;
}

/** Marca o quita «Útil» en un comentario; devuelve el total actualizado. */
export async function setSocialCommentHelpful(
  db: Db,
  userId: string,
  commentId: string,
  helpful: boolean,
  now: Date = new Date(),
  postId?: string,
): Promise<{ ok: true; helpfulCount: number; helpfulByMe: boolean } | { ok: false; reason: "no_existe" }> {
  if (!UUID_PATTERN.test(commentId)) return { ok: false, reason: "no_existe" };
  if (postId && !UUID_PATTERN.test(postId)) return { ok: false, reason: "no_existe" };
  const [comment] = await db
    .select({ id: socialComments.id })
    .from(socialComments)
    .innerJoin(socialPosts, eq(socialPosts.id, socialComments.postId))
    .where(
      and(
        eq(socialComments.id, commentId),
        postId ? eq(socialComments.postId, postId) : undefined,
        eq(socialComments.isHiddenByModeration, false),
        eq(socialPosts.isHiddenByModeration, false),
      ),
    );
  if (!comment) return { ok: false, reason: "no_existe" };
  if (helpful) {
    await db.insert(socialCommentLikes).values({ commentId, userId, createdAt: now }).onConflictDoNothing();
  } else {
    await db
      .delete(socialCommentLikes)
      .where(and(eq(socialCommentLikes.commentId, commentId), eq(socialCommentLikes.userId, userId)));
  }
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(socialCommentLikes)
    .where(eq(socialCommentLikes.commentId, commentId));
  return { ok: true, helpfulCount: count, helpfulByMe: helpful };
}

/** Registra que otro socio copió a su bitácora el pick adjunto. */
export async function recordSocialPostPickCopy(
  db: Db,
  userId: string,
  postId: string,
): Promise<{ ok: true; copiesCount: number } | { ok: false; reason: "no_existe" }> {
  if (!UUID_PATTERN.test(postId)) return { ok: false, reason: "no_existe" };
  const [post] = await db
    .select({
      id: socialPosts.id,
      authorUserId: socialPosts.authorUserId,
      copiesCount: socialPosts.copiesToJournalCount,
    })
    .from(socialPosts)
    .where(and(eq(socialPosts.id, postId), eq(socialPosts.isHiddenByModeration, false)));
  if (!post) return { ok: false, reason: "no_existe" };
  if (post.authorUserId === userId) return { ok: true, copiesCount: post.copiesCount };
  const [updated] = await db
    .update(socialPosts)
    .set({ copiesToJournalCount: sql`${socialPosts.copiesToJournalCount} + 1` })
    .where(eq(socialPosts.id, postId))
    .returning({ copiesCount: socialPosts.copiesToJournalCount });
  return { ok: true, copiesCount: updated?.copiesCount ?? post.copiesCount + 1 };
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
  /** Solo de quienes sigue `viewerUserId` (socios, ligas y equipos). */
  following?: boolean;
  /** Solo de este @usuario. */
  authorHandle?: string;
  /** Solo publicaciones ligadas a este partido (`gameId` o pick del partido). */
  gameId?: string;
  /** Orden del feed: recientes o con más conversación. */
  sort?: "recent" | "most_commented";
  /** Filtrar por liga (`leagueLabel` o identificador canonico). */
  leagueLabel?: string;
  /** Solo publicaciones con pick abierto (no liquidado). */
  openPickOnly?: boolean;
  /** Tope de comentarios devueltos por publicación (default `SOCIAL_LIMITS.commentsPerPost`). */
  commentsLimit?: number;
  /** Una sola publicación por id (p. ej. al abrir un aviso de comentario). */
  postId?: string;
}

const LEAGUE_ID_TO_LABEL: Record<string, string> = {
  "liga-mx": "Liga MX",
  ligamx: "Liga MX",
  "premier-league": "Premier League",
  premier: "Premier League",
  laliga: "LaLiga",
  bundesliga: "Bundesliga",
  "serie-a": "Serie A",
  "ligue-1": "Ligue 1",
  nfl: "NFL",
  nba: "NBA",
  nhl: "NHL",
  mlb: "MLB",
  ncaaf: "NCAAF",
  champions: "Champions League",
};

function resolveLeagueFilterLabel(raw: string): string {
  const clean = raw.trim();
  return LEAGUE_ID_TO_LABEL[clean.toLowerCase()] ?? clean;
}

function toFeedPickStatus(status: string | undefined): FeedPickStatus | null {
  if (status === "won" || status === "lost" || status === "void") return status;
  if (status === "pending") return "open";
  return null;
}

async function resolvePostPickStatuses(
  db: Db,
  rows: ReadonlyArray<{
    id: string;
    authorUserId: string;
    sealedJournalEntryId: string | null;
    pick: unknown;
  }>,
): Promise<Map<string, FeedPickStatus | null>> {
  const result = new Map<string, FeedPickStatus | null>();
  const postsWithPick = rows.filter((r) => Boolean(r.pick));
  if (postsWithPick.length === 0) return result;

  const sealedIds = Array.from(
    new Set(postsWithPick.map((r) => r.sealedJournalEntryId).filter((v): v is string => Boolean(v))),
  );
  const authorIds = Array.from(new Set(postsWithPick.map((r) => r.authorUserId)));
  const pickIds = Array.from(
    new Set(
      postsWithPick
        .map((r) => (r.pick as SocialPickSnapshot | null)?.pickId)
        .filter((v): v is string => typeof v === "string" && v.length > 0),
    ),
  );

  const lookupConditions = [];
  if (sealedIds.length > 0) lookupConditions.push(inArray(sealedPicks.id, sealedIds));
  if (authorIds.length > 0 && pickIds.length > 0) {
    lookupConditions.push(and(inArray(sealedPicks.userId, authorIds), inArray(sealedPicks.pickId, pickIds))!);
  }
  if (lookupConditions.length === 0) return result;

  const sealedRows = await db
    .select({
      id: sealedPicks.id,
      userId: sealedPicks.userId,
      pickId: sealedPicks.pickId,
      status: sealedPicks.status,
    })
    .from(sealedPicks)
    .where(or(...lookupConditions));

  const byId = new Map<string, string>();
  const byUserPick = new Map<string, string>();
  for (const s of sealedRows) {
    byId.set(s.id, s.status);
    byUserPick.set(`${s.userId}:${s.pickId}`, s.status);
  }
  for (const r of postsWithPick) {
    const pickId = (r.pick as SocialPickSnapshot | null)?.pickId;
    const status =
      (r.sealedJournalEntryId ? byId.get(r.sealedJournalEntryId) : undefined) ??
      (pickId ? byUserPick.get(`${r.authorUserId}:${pickId}`) : undefined);
    result.set(r.id, toFeedPickStatus(status));
  }
  return result;
}

async function loadFeedCommentsForPosts(
  db: Db,
  viewerUserId: string | null,
  postIds: readonly string[],
  perPostLimit: number,
): Promise<{ commentsByPost: Map<string, FeedComment[]>; totalByPost: Map<string, number> }> {
  const commentsByPost = new Map<string, FeedComment[]>();
  const totalByPost = new Map<string, number>();
  if (postIds.length === 0) return { commentsByPost, totalByPost };

  const notPausedForViewer = viewerUserId
    ? or(eq(users.socialPauseEnabled, false), eq(users.id, viewerUserId))!
    : eq(users.socialPauseEnabled, false);

  const comments = await db
    .select({
      id: socialComments.id,
      postId: socialComments.postId,
      parentCommentId: socialComments.parentCommentId,
      authorUserId: socialComments.authorUserId,
      authorHandle: users.handle,
      authorName: users.displayName,
      authorAvatarUrl: users.avatarUrl,
      record: socialComments.authorRecordSnapshot,
      body: socialComments.body,
      createdAt: socialComments.createdAt,
    })
    .from(socialComments)
    .innerJoin(users, eq(users.id, socialComments.authorUserId))
    .where(
      and(
        inArray(socialComments.postId, [...postIds]),
        eq(socialComments.isHiddenByModeration, false),
        isNotNull(users.handle),
        notPausedForViewer,
      ),
    )
    .orderBy(asc(socialComments.createdAt), asc(socialComments.id));

  if (comments.length === 0) return { commentsByPost, totalByPost };

  const commentIds = comments.map((c) => c.id);
  const [helpfulRows, viewerHelpfulRows] = await Promise.all([
    db
      .select({
        commentId: socialCommentLikes.commentId,
        count: sql<number>`count(*)::int`,
      })
      .from(socialCommentLikes)
      .where(inArray(socialCommentLikes.commentId, commentIds))
      .groupBy(socialCommentLikes.commentId),
    viewerUserId
      ? db
          .select({ commentId: socialCommentLikes.commentId })
          .from(socialCommentLikes)
          .where(and(eq(socialCommentLikes.userId, viewerUserId), inArray(socialCommentLikes.commentId, commentIds)))
      : Promise.resolve([] as { commentId: string }[]),
  ]);

  const helpfulCountMap = new Map(helpfulRows.map((h) => [h.commentId, h.count]));
  const helpfulByMeSet = new Set(viewerHelpfulRows.map((h) => h.commentId));
  const authorHandleByCommentId = new Map(comments.map((c) => [c.id, c.authorHandle!]));

  const allByPost = new Map<string, FeedComment[]>();
  for (const c of comments) {
    const list = allByPost.get(c.postId) ?? [];
    list.push({
      id: c.id,
      parentCommentId: c.parentCommentId ?? null,
      replyToHandle: c.parentCommentId ? (authorHandleByCommentId.get(c.parentCommentId) ?? null) : null,
      authorHandle: c.authorHandle!,
      authorName: c.authorName ?? c.authorHandle!,
      authorAvatarUrl: c.authorAvatarUrl ?? null,
      record: c.record,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      isMine: viewerUserId !== null && c.authorUserId === viewerUserId,
      helpfulCount: helpfulCountMap.get(c.id) ?? 0,
      helpfulByMe: helpfulByMeSet.has(c.id),
    });
    allByPost.set(c.postId, list);
  }

  for (const [postId, list] of allByPost) {
    totalByPost.set(postId, list.length);
    commentsByPost.set(postId, list.length > perPostLimit ? list.slice(-perPostLimit) : list);
  }
  return { commentsByPost, totalByPost };
}

/** Todos los comentarios visibles de una publicación (sin el corte de 30 del feed). */
export async function listPostComments(
  db: Db,
  viewerUserId: string | null,
  postId: string,
  limit = 200,
): Promise<{ ok: true; comments: FeedComment[]; commentsCount: number } | { ok: false; reason: "no_existe" }> {
  if (!UUID_PATTERN.test(postId)) return { ok: false, reason: "no_existe" };
  const [post] = await db
    .select({ id: socialPosts.id })
    .from(socialPosts)
    .where(and(eq(socialPosts.id, postId), eq(socialPosts.isHiddenByModeration, false)));
  if (!post) return { ok: false, reason: "no_existe" };
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const { commentsByPost, totalByPost } = await loadFeedCommentsForPosts(db, viewerUserId, [postId], safeLimit);
  return {
    ok: true,
    comments: commentsByPost.get(postId) ?? [],
    commentsCount: totalByPost.get(postId) ?? 0,
  };
}

export async function listSocialFeed(db: Db, viewerUserId: string | null, query: FeedQuery = {}): Promise<FeedPost[]> {
  const limit = Math.min(Math.max(query.limit ?? 30, 1), SOCIAL_LIMITS.feedPageMax);
  const commentsLimit = Math.min(Math.max(query.commentsLimit ?? SOCIAL_LIMITS.commentsPerPost, 1), 200);
  const notPausedForViewer = viewerUserId
    ? or(eq(users.socialPauseEnabled, false), eq(users.id, viewerUserId))!
    : eq(users.socialPauseEnabled, false);
  const conditions = [eq(socialPosts.isHiddenByModeration, false), isNotNull(users.handle), notPausedForViewer];
  if (query.postId) conditions.push(eq(socialPosts.id, query.postId));
  if (query.before) conditions.push(lt(socialPosts.createdAt, query.before));
  if (query.authorHandle) conditions.push(eq(users.handle, query.authorHandle.toLowerCase()));
  if (query.gameId) {
    const cleanGameId = query.gameId.trim();
    if (cleanGameId) {
      conditions.push(
        or(eq(socialPosts.gameId, cleanGameId), sql`${socialPosts.pick}->>'gameId' = ${cleanGameId}`)!,
      );
    }
  }
  if (query.leagueLabel) {
    const label = resolveLeagueFilterLabel(query.leagueLabel);
    if (label) conditions.push(eq(socialPosts.leagueLabel, label));
  }
  if (query.openPickOnly) {
    conditions.push(
      and(
        isNotNull(socialPosts.pick),
        sql`not exists (select 1 from ${sealedPicks} sp where (sp.id = ${socialPosts.sealedJournalEntryId} or (sp.user_id = ${socialPosts.authorUserId} and sp.pick_id = ${socialPosts.pick}->>'pickId')) and sp.status in ('won', 'lost', 'void'))`,
      )!,
    );
  }
  if (query.following) {
    if (!viewerUserId) return [];
    const [followRows, prefRow] = await Promise.all([
      db
        .select({ id: socialFollows.followedUserId })
        .from(socialFollows)
        .where(eq(socialFollows.followerUserId, viewerUserId)),
      db
        .select({ followedTopics: userPreferences.followedTopics })
        .from(userPreferences)
        .where(eq(userPreferences.userId, viewerUserId))
        .limit(1),
    ]);
    const followedUserIds = followRows.map((f) => f.id);
    const topics = sanitizeFollowedTopics(prefRow[0]?.followedTopics);
    const followedLeagueLabels = Array.from(
      new Set(topics.leagues.map(resolveLeagueFilterLabel).filter((l) => l.length > 0)),
    );

    const followingOr = [];
    if (followedUserIds.length > 0) {
      followingOr.push(inArray(socialPosts.authorUserId, followedUserIds));
    }
    if (followedLeagueLabels.length > 0) {
      followingOr.push(inArray(socialPosts.leagueLabel, followedLeagueLabels));
    }
    for (const key of topics.teams) {
      const sep = key.indexOf(":");
      if (sep <= 0) continue;
      const leagueLabel = resolveLeagueFilterLabel(key.slice(0, sep));
      const rawSlug = key.slice(sep + 1).toLowerCase();
      const safeSlug = rawSlug.replace(/[^a-z0-9._-]/g, "");
      const safeToken = rawSlug.replace(/[^a-z0-9]+/g, " ").trim();
      if (!leagueLabel || safeToken.length < 2) continue;
      followingOr.push(
        and(
          eq(socialPosts.leagueLabel, leagueLabel),
          or(
            safeSlug ? sql`lower(coalesce(${socialPosts.gameId}, '')) LIKE ${`%${safeSlug}%`}` : undefined,
            sql`translate(lower(${socialPosts.matchLabel}), 'áéíóúüñ', 'aeiouun') LIKE ${`%${safeToken}%`}`,
          )!,
        )!,
      );
    }
    if (followingOr.length === 0) return [];
    conditions.push(or(...followingOr)!);
  }

  const commentCountExpr = sql<number>`(select count(*)::int from ${socialComments} where ${socialComments.postId} = ${socialPosts.id} and ${socialComments.isHiddenByModeration} = false)`;
  const orderByClauses =
    query.sort === "most_commented"
      ? [desc(commentCountExpr), desc(socialPosts.createdAt), desc(socialPosts.id)]
      : [desc(socialPosts.createdAt), desc(socialPosts.id)];

  const rows = await db
    .select({
      id: socialPosts.id,
      authorUserId: socialPosts.authorUserId,
      authorHandle: users.handle,
      authorName: users.displayName,
      authorAvatarUrl: users.avatarUrl,
      authorIsTipster: sql<boolean>`(${tipsterProfiles.userId} is not null or ${socialPosts.authorRoleBadgeSnapshot} = 'Tipster Oficial')`,
      roleBadge: socialPosts.authorRoleBadgeSnapshot,
      record: socialPosts.authorRecordSnapshot,
      clv: socialPosts.authorClvSnapshot,
      leagueLabel: socialPosts.leagueLabel,
      matchLabel: socialPosts.matchLabel,
      gameId: socialPosts.gameId,
      pickBadge: socialPosts.pickBadge,
      originType: socialPosts.originType,
      sealedJournalEntryId: socialPosts.sealedJournalEntryId,
      pick: socialPosts.pick,
      copiesCount: socialPosts.copiesToJournalCount,
      body: socialPosts.body,
      createdAt: socialPosts.createdAt,
      likes: sql<number>`(select count(*)::int from ${socialLikes} where ${socialLikes.postId} = ${socialPosts.id})`,
    })
    .from(socialPosts)
    .innerJoin(users, eq(users.id, socialPosts.authorUserId))
    .leftJoin(tipsterProfiles, and(eq(tipsterProfiles.userId, users.id), eq(tipsterProfiles.isActive, true)))
    .where(and(...conditions))
    .orderBy(...orderByClauses)
    .limit(limit);
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const [liked, { commentsByPost, totalByPost }, pickStatuses] = await Promise.all([
    viewerUserId
      ? db
          .select({ postId: socialLikes.postId })
          .from(socialLikes)
          .where(and(eq(socialLikes.userId, viewerUserId), inArray(socialLikes.postId, ids)))
      : Promise.resolve([] as { postId: string }[]),
    loadFeedCommentsForPosts(db, viewerUserId, ids, commentsLimit),
    resolvePostPickStatuses(db, rows),
  ]);
  const likedSet = new Set(liked.map((l) => l.postId));

  return rows.map((r) => ({
    id: r.id,
    authorHandle: r.authorHandle!,
    authorName: r.authorName ?? r.authorHandle!,
    authorAvatarUrl: r.authorAvatarUrl ?? null,
    authorIsTipster: Boolean(r.authorIsTipster),
    roleBadge: r.roleBadge,
    record: r.record,
    clv: r.clv,
    leagueLabel: r.leagueLabel,
    matchLabel: r.matchLabel,
    gameId: r.gameId,
    pickBadge: r.pickBadge,
    originType: r.originType,
    pick: (r.pick as SocialPickSnapshot | null) ?? null,
    pickStatus: pickStatuses.get(r.id) ?? null,
    body: r.body,
    createdAt: r.createdAt.toISOString(),
    likes: r.likes,
    likedByMe: likedSet.has(r.id),
    isMine: viewerUserId !== null && r.authorUserId === viewerUserId,
    commentsCount: totalByPost.get(r.id) ?? 0,
    copiesCount: r.copiesCount,
    comments: commentsByPost.get(r.id) ?? [],
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
  const [post] = await listSocialFeed(db, viewerUserId, { postId, limit: 1, commentsLimit: 200 });
  return post ?? null;
}

export type SocialNotificationKind = "comment" | "comment_reply" | "mention" | "follow" | "like";

export interface SocialNotificationRow {
  id: string;
  kind: SocialNotificationKind;
  actorHandle: string;
  actorName: string;
  postId: string | null;
  commentId: string | null;
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

/** Últimos avisos sociales del socio (comentarios, respuestas, menciones, seguidos y «me gusta» agrupados). */
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
      commentId: notifications.commentId,
      postBody: socialPosts.body,
      commentBody: socialComments.body,
      likeCount: sql<number>`case when ${notifications.kind} = 'like' and ${notifications.postId} is not null then (select count(*)::int from ${socialLikes} where ${socialLikes.postId} = ${notifications.postId} and ${socialLikes.userId} <> ${notifications.userId}) else 0 end`,
      createdAt: notifications.createdAt,
      readAt: notifications.readAt,
    })
    .from(notifications)
    .innerJoin(users, eq(users.id, notifications.actorUserId))
    .leftJoin(socialPosts, eq(socialPosts.id, notifications.postId))
    .leftJoin(socialComments, eq(socialComments.id, notifications.commentId))
    .where(
      and(
        eq(notifications.userId, userId),
        isNotNull(users.handle),
        eq(users.socialPauseEnabled, false),
        sql`(${notifications.postId} is null or (${socialPosts.id} is not null and ${socialPosts.isHiddenByModeration} = false))`,
        sql`(${notifications.commentId} is null or (${socialComments.id} is not null and ${socialComments.isHiddenByModeration} = false))`,
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
      commentId: r.commentId ?? null,
      postExcerpt:
        r.kind === "comment_reply" || r.kind === "mention"
          ? excerptOf(r.commentBody ?? r.postBody)
          : excerptOf(r.postBody),
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

/** Obtiene el usuario autor de una publicación o comentario moderado para avisarle por correo. */
export async function findModerationTargetAuthor(
  db: Db,
  targetType: "post" | "comment",
  targetId: string,
): Promise<{ userId: string; email: string; displayName: string | null } | null> {
  if (!UUID_PATTERN.test(targetId.trim())) return null;
  if (targetType === "post") {
    const [row] = await db
      .select({ userId: users.id, email: users.email, displayName: users.displayName })
      .from(socialPosts)
      .innerJoin(users, eq(users.id, socialPosts.authorUserId))
      .where(eq(socialPosts.id, targetId.trim()))
      .limit(1);
    return row ?? null;
  }
  const [row] = await db
    .select({ userId: users.id, email: users.email, displayName: users.displayName })
    .from(socialComments)
    .innerJoin(users, eq(users.id, socialComments.authorUserId))
    .where(eq(socialComments.id, targetId.trim()))
    .limit(1);
  return row ?? null;
}
