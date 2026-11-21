import { NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as getModeration, POST as postModeration } from "../app/api/admin/moderation/route";
import { GET as getMyNotifications } from "../app/api/me/notifications/route";
import { POST as postReadNotifications } from "../app/api/me/notifications/read/route";
import { GET as getFollowsRoute, POST as postFollowRoute } from "../app/api/social/follows/route";
import { DELETE as deleteCommentRoute } from "../app/api/social/posts/[id]/comments/[commentId]/route";
import { PUT as putCommentHelpfulRoute } from "../app/api/social/posts/[id]/comments/[commentId]/like/route";
import { GET as getPostCommentsRoute, POST as postCommentRoute } from "../app/api/social/posts/[id]/comments/route";
import { POST as postCopyRoute } from "../app/api/social/posts/[id]/copy/route";
import { PUT as putPostLikeRoute } from "../app/api/social/posts/[id]/like/route";
import { DELETE as deletePostRoute, GET as getPostByIdRoute } from "../app/api/social/posts/[id]/route";
import { GET as getPostsRoute, POST as postSocialRoute } from "../app/api/social/posts/route";
import { POST as postSocialReport } from "../app/api/social/reports/route";
import { GET as getVotesRoute, POST as postVoteRoute } from "../app/api/social/votes/route";
import { resetScrapingVelocityForTests } from "../src/server/api-guards";
import { resetRateLimitsForTests } from "../src/server/request-security";
import { checkSocialText, parseNewPost, parseSocialPick } from "../src/server/social";

const mocks = vi.hoisted(() => ({
  getAuth: vi.fn(),
  requireMember: vi.fn(),
  requireSocialMember: vi.fn(),
  listSocialNotifications: vi.fn(),
  markSocialNotificationsRead: vi.fn(),
  reportSocialContent: vi.fn(),
  listModerationPanelData: vi.fn(),
  applyModerationAction: vi.fn(),
  listSocialFeed: vi.fn(),
  createSocialPost: vi.fn(),
  getSocialPostById: vi.fn(),
  deleteSocialPost: vi.fn(),
  setSocialLike: vi.fn(),
  listPostComments: vi.fn(),
  addSocialComment: vi.fn(),
  deleteSocialComment: vi.fn(),
  setSocialCommentHelpful: vi.fn(),
  recordSocialPostPickCopy: vi.fn(),
  listFollowing: vi.fn(),
  setSocialFollow: vi.fn(),
  matchVoteTally: vi.fn(),
  castMatchVote: vi.fn(),
  withAuthorBadges: vi.fn(),
}));
vi.mock("../src/server/auth", () => ({ getAuth: mocks.getAuth }));
vi.mock("../src/server/badges", () => ({ withAuthorBadges: mocks.withAuthorBadges }));
vi.mock("../src/server/session-user", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/server/session-user")>();
  return {
    ...actual,
    requireMember: mocks.requireMember,
    requireAdmin: async (request: Request) => {
      const auth = mocks.getAuth();
      if (!auth) return actual.requireAdmin(request);
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) return actual.requireAdmin(request);
      if (!actual.isAdminEmail(session.user.email)) {
        return actual.requireAdmin(request);
      }
      return mocks.requireMember(request);
    },
  };
});
vi.mock("../src/server/social", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/server/social")>()),
  requireSocialMember: mocks.requireSocialMember,
}));
vi.mock("@pitchlab/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@pitchlab/db")>()),
  listSocialNotifications: mocks.listSocialNotifications,
  markSocialNotificationsRead: mocks.markSocialNotificationsRead,
  reportSocialContent: mocks.reportSocialContent,
  listModerationPanelData: mocks.listModerationPanelData,
  applyModerationAction: mocks.applyModerationAction,
  listSocialFeed: mocks.listSocialFeed,
  createSocialPost: mocks.createSocialPost,
  getSocialPostById: mocks.getSocialPostById,
  deleteSocialPost: mocks.deleteSocialPost,
  setSocialLike: mocks.setSocialLike,
  listPostComments: mocks.listPostComments,
  addSocialComment: mocks.addSocialComment,
  deleteSocialComment: mocks.deleteSocialComment,
  setSocialCommentHelpful: mocks.setSocialCommentHelpful,
  recordSocialPostPickCopy: mocks.recordSocialPostPickCopy,
  listFollowing: mocks.listFollowing,
  setSocialFollow: mocks.setSocialFollow,
  matchVoteTally: mocks.matchVoteTally,
  castMatchVote: mocks.castMatchVote,
}));

function memberSession(userId: string, email = `${userId}@example.com`) {
  return {
    db: {},
    userId,
    email,
    emailVerified: true,
    authUserId: `auth-${userId}`,
  };
}

afterEach(() => {
  vi.resetAllMocks();
  resetRateLimitsForTests();
  resetScrapingVelocityForTests();
});

describe("comunidad: texto que llega del navegador", () => {
  it("exige una frase, respeta el máximo y bloquea enlaces externos", () => {
    expect(checkSocialText("corto", "post")).toMatchObject({ ok: false });
    expect(checkSocialText("x".repeat(601), "post")).toMatchObject({ ok: false, error: "Máximo 600 caracteres." });
    expect(checkSocialText("Únete a t.me/picksgratis hoy mismo", "post")).toMatchObject({ ok: false });
    expect(checkSocialText("  Monterrey o empate, me gusta.  ", "post")).toEqual({
      ok: true,
      text: "Monterrey o empate, me gusta.",
    });
    expect(checkSocialText("Sí", "comment")).toEqual({ ok: true, text: "Sí" });
    expect(checkSocialText(42, "comment")).toMatchObject({ ok: false });
  });

  it("el pick adjunto solo pasa con cifras razonables", () => {
    const good = {
      pickId: "pk1",
      gameId: "g1",
      label: "Gana Monterrey",
      units: 1,
      userDecimal: 2.1,
      fairDecimal: 1.9,
      modelProbability: 0.52,
    };
    expect(parseSocialPick(good)).toEqual(good);
    expect(parseSocialPick({ ...good, units: 50 })).toBeNull();
    expect(parseSocialPick({ ...good, modelProbability: 3 })).toBeNull();
    expect(parseSocialPick({ ...good, userDecimal: "2.1" })).toBeNull();
  });

  it("no deja que el navegador elija el origen ni el récord", () => {
    const parsed = parseNewPost({
      body: "Lectura del partido de hoy.",
      originType: "Algo inventado",
      verifiedRecord: "+999u · 1000 picks",
    });
    expect(parsed).toMatchObject({ ok: true, post: { originType: "Bitácora Propia", leagueLabel: "Comunidad" } });
    expect(JSON.stringify(parsed)).not.toContain("999");
  });
});

describe("comunidad: rutas de avisos sociales", () => {
  it("devuelve hasta 40 avisos y valida ids UUID (máx. 100) al marcar leídos", async () => {
    const n1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const n2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    mocks.requireMember.mockResolvedValue(memberSession("u1"));
    mocks.listSocialNotifications.mockResolvedValue([
      {
        id: n1,
        kind: "comment",
        actorHandle: "ana_mx",
        actorName: "Ana",
        postId: "22222222-2222-4222-8222-222222222222",
        postExcerpt: "Monterrey",
        likeCount: 0,
        createdAt: "2026-11-12T12:00:00.000Z",
        readAt: null,
      },
    ]);

    const getRes = await getMyNotifications(new Request("http://localhost:9990/api/me/notifications"));
    expect(getRes.status).toBe(200);
    expect(getRes.headers.get("cache-control")).toBe("private, no-store");
    expect(getRes.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await getRes.json()).toMatchObject({ notifications: [{ id: n1, actorHandle: "ana_mx" }] });
    expect(mocks.listSocialNotifications).toHaveBeenCalledWith({}, "u1", 40);

    await getMyNotifications(new Request("http://localhost:9990/api/me/notifications?limit=200"));
    expect(mocks.listSocialNotifications).toHaveBeenLastCalledWith({}, "u1", 40);

    mocks.markSocialNotificationsRead.mockResolvedValue(2);
    const readIdsRes = await postReadNotifications(
      new Request("http://localhost:9990/api/me/notifications/read", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:9990" },
        body: JSON.stringify({ ids: [n1, n2] }),
      }),
    );
    expect(readIdsRes.status).toBe(200);
    expect(mocks.markSocialNotificationsRead).toHaveBeenCalledWith({}, "u1", [n1, n2], expect.any(Date));

    const emptyObjRes = await postReadNotifications(
      new Request("http://localhost:9990/api/me/notifications/read", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:9990" },
        body: "{}",
      }),
    );
    expect(emptyObjRes.status).toBe(200);
    expect(mocks.markSocialNotificationsRead).toHaveBeenLastCalledWith({}, "u1", undefined, expect.any(Date));

    const emptyBodyRes = await postReadNotifications(
      new Request("http://localhost:9990/api/me/notifications/read", {
        method: "POST",
        headers: { origin: "http://localhost:9990" },
      }),
    );
    expect(emptyBodyRes.status).toBe(200);
    expect(mocks.markSocialNotificationsRead).toHaveBeenLastCalledWith({}, "u1", undefined, expect.any(Date));

    const badUuidRes = await postReadNotifications(
      new Request("http://localhost:9990/api/me/notifications/read", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:9990" },
        body: JSON.stringify({ ids: ["not-a-uuid"] }),
      }),
    );
    expect(badUuidRes.status).toBe(400);

    const tooManyIds = Array.from({ length: 101 }, () => n1);
    const overLimitRes = await postReadNotifications(
      new Request("http://localhost:9990/api/me/notifications/read", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:9990" },
        body: JSON.stringify({ ids: tooManyIds }),
      }),
    );
    expect(overLimitRes.status).toBe(400);
  });
});

describe("comunidad: reportes y panel de moderación", () => {
  it("un socio que no es admin recibe 403 en GET y POST /api/admin/moderation", async () => {
    const modPostId = "66666666-6666-4666-8666-666666666666";
    const prevAdmins = process.env.PITCHLAB_ADMIN_EMAILS;
    process.env.PITCHLAB_ADMIN_EMAILS = "fundador@pitchlab.mx";
    try {
      mocks.getAuth.mockReturnValue({
        api: {
          getSession: vi.fn().mockResolvedValue({
            user: { id: "auth-socio", email: "socio@example.com", emailVerified: true },
          }),
        },
      });

      const getRes = await getModeration(new Request("http://localhost:9990/api/admin/moderation"));
      expect(getRes.status).toBe(403);
      expect(await getRes.json()).toMatchObject({ error: "Solo para el equipo fundador" });

      const postRes = await postModeration(
        new Request("http://localhost:9990/api/admin/moderation", {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://localhost:9990" },
          body: JSON.stringify({ action: "hide", targetType: "post", targetId: modPostId }),
        }),
      );
      expect(postRes.status).toBe(403);
      expect(mocks.applyModerationAction).not.toHaveBeenCalled();

      mocks.getAuth.mockReturnValue({
        api: {
          getSession: vi.fn().mockResolvedValue({
            user: { id: "auth-admin", email: "fundador@pitchlab.mx", emailVerified: true },
          }),
        },
      });
      mocks.requireMember.mockResolvedValue(memberSession("admin-1", "fundador@pitchlab.mx"));
      mocks.applyModerationAction.mockResolvedValue({ ok: true });
      mocks.listModerationPanelData.mockResolvedValue({ pendingQueue: [], hiddenItems: [], pausedMembers: [] });

      const adminRes = await postModeration(
        new Request("http://localhost:9990/api/admin/moderation", {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://localhost:9990" },
          body: JSON.stringify({ action: "hide", targetType: "post", targetId: modPostId }),
        }),
      );
      expect(adminRes.status).toBe(200);
      expect(mocks.applyModerationAction).toHaveBeenCalledWith(
        {},
        "admin-1",
        { action: "hide", targetType: "post", targetId: modPostId, targetUserId: undefined },
        expect.any(Date),
      );
    } finally {
      if (prevAdmins === undefined) delete process.env.PITCHLAB_ADMIN_EMAILS;
      else process.env.PITCHLAB_ADMIN_EMAILS = prevAdmins;
    }
  });

  it("permite reportar contenido ajeno, valida con Zod y devuelve 409 si ya se reportó", async () => {
    const reportPostId = "55555555-5555-4555-8555-555555555555";
    mocks.requireSocialMember.mockResolvedValue(memberSession("u2"));
    mocks.reportSocialContent.mockResolvedValueOnce({ ok: true, id: "rep-1", autoHidden: true });

    const invalidRes = await postSocialReport(
      new Request("http://localhost:9990/api/social/reports", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:9990" },
        body: JSON.stringify({ postId: "post-uuid", reason: "spam_enlaces" }),
      }),
    );
    expect(invalidRes.status).toBe(400);
    expect(mocks.reportSocialContent).not.toHaveBeenCalled();

    const createdRes = await postSocialReport(
      new Request("http://localhost:9990/api/social/reports", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:9990" },
        body: JSON.stringify({ postId: reportPostId, reason: "spam_enlaces" }),
      }),
    );
    expect(createdRes.status).toBe(201);
    expect(await createdRes.json()).toEqual({ ok: true, id: "rep-1", autoHidden: true });

    mocks.reportSocialContent.mockResolvedValueOnce({ ok: false, reason: "ya_reportado" });
    const dupRes = await postSocialReport(
      new Request("http://localhost:9990/api/social/reports", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:9990" },
        body: JSON.stringify({ postId: reportPostId, reason: "spam_enlaces" }),
      }),
    );
    expect(dupRes.status).toBe(409);
  });

  it("reenvía gameId, liga, openPick, sort, acota limit <= 40, aplica watermark y acepta sealedJournalEntryId en /api/social/posts", async () => {
    const sealedUuid = "11111111-1111-4111-8111-111111111111";
    const parsed = parseNewPost({
      body: "Debate directo sobre este partido.",
      gameId: "g-lmx-1",
      sealedJournalEntryId: sealedUuid,
    });
    expect(parsed).toMatchObject({
      ok: true,
      post: { gameId: "g-lmx-1", sealedJournalEntryId: sealedUuid },
    });

    const badParsed = parseNewPost({
      body: "Debate directo sin uuid válido.",
      sealedJournalEntryId: "no-es-uuid",
    });
    expect(badParsed).toMatchObject({ ok: true, post: { gameId: null } });
    if (badParsed.ok) expect(badParsed.post.sealedJournalEntryId).toBeUndefined();

    mocks.requireSocialMember.mockResolvedValue(memberSession("u1"));
    mocks.listSocialFeed.mockResolvedValue([{ id: "p1" }]);
    mocks.withAuthorBadges.mockImplementation(async (_db, items) => items);

    const getRes = await getPostsRoute(
      new Request(
        "http://localhost:9990/api/social/posts?limit=200&gameId=g-lmx-1&league=Liga%20MX&openPick=1&sort=most_commented",
      ),
    );
    expect(getRes.status).toBe(200);
    expect(getRes.headers.get("x-pitchlab-trace")).toBeTruthy();
    expect(getRes.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.listSocialFeed).toHaveBeenCalledWith(
      {},
      "u1",
      expect.objectContaining({
        limit: 40,
        gameId: "g-lmx-1",
        leagueLabel: "Liga MX",
        openPickOnly: true,
        sort: "most_commented",
      }),
    );

    const postId = "22222222-2222-4222-8222-222222222222";
    mocks.createSocialPost.mockResolvedValue({ ok: true, id: postId });
    mocks.getSocialPostById.mockResolvedValue({ id: postId, gameId: "g-lmx-1" });
    const postRes = await postSocialRoute(
      new Request("http://localhost:9990/api/social/posts", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:9990" },
        body: JSON.stringify({
          body: "Lectura directa de ficha con pick sellado.",
          gameId: "g-lmx-1",
          sealedJournalEntryId: sealedUuid,
        }),
      }),
    );
    expect(postRes.status).toBe(201);
    expect(mocks.getSocialPostById).toHaveBeenCalledWith({}, "u1", postId);
  });

  it("lista (<= 40) y crea respuestas con parentCommentId, borra comentario propio, marca Útil y cuenta copias", async () => {
    const postId = "22222222-2222-4222-8222-222222222222";
    const commentId = "33333333-3333-4333-8333-333333333333";
    const parentId = "44444444-4444-4444-8444-444444444444";

    mocks.requireSocialMember.mockResolvedValue(memberSession("u1"));
    mocks.requireMember.mockResolvedValue(memberSession("u1"));

    mocks.listPostComments.mockResolvedValue({
      ok: true,
      comments: [{ id: commentId, body: "Respuesta completa" }],
      commentsCount: 35,
    });
    const listRes = await getPostCommentsRoute(
      new Request(`http://localhost:9990/api/social/posts/${postId}/comments?limit=200`),
      { params: Promise.resolve({ id: postId }) },
    );
    expect(listRes.status).toBe(200);
    expect(mocks.listPostComments).toHaveBeenCalledWith({}, "u1", postId, 40);
    expect(await listRes.json()).toEqual({ comments: [{ id: commentId, body: "Respuesta completa" }], commentsCount: 35 });

    mocks.addSocialComment.mockResolvedValue({ ok: true, comment: { id: commentId, parentCommentId: parentId } });
    const replyRes = await postCommentRoute(
      new Request(`http://localhost:9990/api/social/posts/${postId}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:9990" },
        body: JSON.stringify({ body: "De acuerdo contigo.", parentCommentId: parentId }),
      }),
      { params: Promise.resolve({ id: postId }) },
    );
    expect(replyRes.status).toBe(201);
    expect(mocks.addSocialComment).toHaveBeenCalledWith({}, "u1", postId, "De acuerdo contigo.", expect.any(Date), parentId);

    mocks.setSocialCommentHelpful.mockResolvedValue({ ok: true, helpfulCount: 3, helpfulByMe: true });
    const badHelpful = await putCommentHelpfulRoute(
      new Request(`http://localhost:9990/api/social/posts/${postId}/comments/${commentId}/like`, {
        method: "PUT",
        headers: { "content-type": "application/json", origin: "http://localhost:9990" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: postId, commentId }) },
    );
    expect(badHelpful.status).toBe(400);

    const goodHelpful = await putCommentHelpfulRoute(
      new Request(`http://localhost:9990/api/social/posts/${postId}/comments/${commentId}/like`, {
        method: "PUT",
        headers: { "content-type": "application/json", origin: "http://localhost:9990" },
        body: JSON.stringify({ helpful: true }),
      }),
      { params: Promise.resolve({ id: postId, commentId }) },
    );
    expect(goodHelpful.status).toBe(200);
    expect(await goodHelpful.json()).toEqual({ helpfulCount: 3, helpfulByMe: true });

    mocks.deleteSocialComment.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const delOk = await deleteCommentRoute(
      new Request(`http://localhost:9990/api/social/posts/${postId}/comments/${commentId}`, {
        method: "DELETE",
        headers: { origin: "http://localhost:9990" },
      }),
      { params: Promise.resolve({ id: postId, commentId }) },
    );
    expect(delOk.status).toBe(200);
    const delFail = await deleteCommentRoute(
      new Request(`http://localhost:9990/api/social/posts/${postId}/comments/${commentId}`, {
        method: "DELETE",
        headers: { origin: "http://localhost:9990" },
      }),
      { params: Promise.resolve({ id: postId, commentId }) },
    );
    expect(delFail.status).toBe(404);

    mocks.recordSocialPostPickCopy.mockResolvedValue({ ok: true, copiesCount: 4 });
    const copyRes = await postCopyRoute(
      new Request(`http://localhost:9990/api/social/posts/${postId}/copy`, {
        method: "POST",
        headers: { origin: "http://localhost:9990" },
      }),
      { params: Promise.resolve({ id: postId }) },
    );
    expect(copyRes.status).toBe(200);
    expect(await copyRes.json()).toEqual({ copiesCount: 4 });
  });

  it("aplica watermark, borrado propio sin Pase activo y validación Zod en posts/[id], like, follows y votes", async () => {
    const postId = "22222222-2222-4222-8222-222222222222";
    mocks.requireSocialMember.mockResolvedValue(memberSession("u1"));
    mocks.requireMember.mockResolvedValue(memberSession("u1"));
    mocks.withAuthorBadges.mockImplementation(async (_db, items) => items);

    mocks.getSocialPostById.mockResolvedValue({ id: postId });
    const detailRes = await getPostByIdRoute(
      new Request(`http://localhost:9990/api/social/posts/${postId}`),
      { params: Promise.resolve({ id: postId }) },
    );
    expect(detailRes.status).toBe(200);
    expect(detailRes.headers.get("x-pitchlab-trace")).toBeTruthy();

    const invalidDetailRes = await getPostByIdRoute(
      new Request("http://localhost:9990/api/social/posts/no-uuid"),
      { params: Promise.resolve({ id: "no-uuid" }) },
    );
    expect(invalidDetailRes.status).toBe(400);

    mocks.requireSocialMember.mockResolvedValueOnce({
      error: NextResponse.json({ error: "La comunidad es para socios con Pase vigente." }, { status: 403 }),
    });
    mocks.deleteSocialPost.mockResolvedValueOnce(true);
    const delPostRes = await deletePostRoute(
      new Request(`http://localhost:9990/api/social/posts/${postId}`, {
        method: "DELETE",
        headers: { origin: "http://localhost:9990" },
      }),
      { params: Promise.resolve({ id: postId }) },
    );
    expect(delPostRes.status).toBe(200);
    expect(mocks.deleteSocialPost).toHaveBeenCalledWith({}, "u1", postId);

    mocks.requireSocialMember.mockResolvedValue(memberSession("u1"));
    const badLikeRes = await putPostLikeRoute(
      new Request(`http://localhost:9990/api/social/posts/${postId}/like`, {
        method: "PUT",
        headers: { "content-type": "application/json", origin: "http://localhost:9990" },
        body: JSON.stringify({ liked: "yes" }),
      }),
      { params: Promise.resolve({ id: postId }) },
    );
    expect(badLikeRes.status).toBe(400);

    mocks.setSocialLike.mockResolvedValue({ ok: true, likes: 5 });
    const okLikeRes = await putPostLikeRoute(
      new Request(`http://localhost:9990/api/social/posts/${postId}/like`, {
        method: "PUT",
        headers: { "content-type": "application/json", origin: "http://localhost:9990" },
        body: JSON.stringify({ liked: true }),
      }),
      { params: Promise.resolve({ id: postId }) },
    );
    expect(okLikeRes.status).toBe(200);
    expect(await okLikeRes.json()).toEqual({ likes: 5, liked: true });

    mocks.listFollowing.mockResolvedValue(["ana_mx"]);
    const followsGetRes = await getFollowsRoute(new Request("http://localhost:9990/api/social/follows"));
    expect(followsGetRes.status).toBe(200);
    expect(mocks.listFollowing).toHaveBeenCalledWith({}, "u1", 40);

    mocks.setSocialFollow.mockResolvedValue({ ok: true, following: true });
    const followsPostRes = await postFollowRoute(
      new Request("http://localhost:9990/api/social/follows", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:9990" },
        body: JSON.stringify({ handle: "@ana_mx", follow: true }),
      }),
    );
    expect(followsPostRes.status).toBe(200);
    expect(mocks.setSocialFollow).toHaveBeenCalledWith({}, "u1", "ana_mx", true);

    const badVoteGetRes = await getVotesRoute(new Request("http://localhost:9990/api/social/votes?gameId=bad!id"));
    expect(badVoteGetRes.status).toBe(400);

    const badVotePostRes = await postVoteRoute(
      new Request("http://localhost:9990/api/social/votes", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:9990" },
        body: JSON.stringify({ gameId: "g1", question: "pick", choice: "draw" }),
      }),
    );
    expect(badVotePostRes.status).toBe(400);
  });

  it("rechaza mutaciones cross-site o sin Origin válido con 403 (CSRF)", async () => {
    const postId = "22222222-2222-4222-8222-222222222222";
    const commentId = "33333333-3333-4333-8333-333333333333";

    const noOriginMod = await postModeration(
      new Request("http://localhost:9990/api/admin/moderation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "hide", targetType: "post", targetId: postId }),
      }),
    );
    expect(noOriginMod.status).toBe(403);
    expect(await noOriginMod.json()).toEqual({ error: "origen_invalido" });

    const crossOriginPost = await postSocialRoute(
      new Request("http://localhost:9990/api/social/posts", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://evil.example" },
        body: JSON.stringify({ body: "Intento CSRF externo." }),
      }),
    );
    expect(crossOriginPost.status).toBe(403);

    const noOriginRead = await postReadNotifications(
      new Request("http://localhost:9990/api/me/notifications/read", {
        method: "POST",
      }),
    );
    expect(noOriginRead.status).toBe(403);

    const crossOriginDelPost = await deletePostRoute(
      new Request(`http://localhost:9990/api/social/posts/${postId}`, {
        method: "DELETE",
        headers: { origin: "https://evil.example" },
      }),
      { params: Promise.resolve({ id: postId }) },
    );
    expect(crossOriginDelPost.status).toBe(403);

    const crossOriginDel = await deleteCommentRoute(
      new Request(`http://localhost:9990/api/social/posts/${postId}/comments/${commentId}`, {
        method: "DELETE",
        headers: { origin: "https://evil.example" },
      }),
      { params: Promise.resolve({ id: postId, commentId }) },
    );
    expect(crossOriginDel.status).toBe(403);

    const crossOriginCopy = await postCopyRoute(
      new Request(`http://localhost:9990/api/social/posts/${postId}/copy`, {
        method: "POST",
        headers: { origin: "https://evil.example" },
      }),
      { params: Promise.resolve({ id: postId }) },
    );
    expect(crossOriginCopy.status).toBe(403);
    expect(mocks.applyModerationAction).not.toHaveBeenCalled();
    expect(mocks.createSocialPost).not.toHaveBeenCalled();
    expect(mocks.deleteSocialPost).not.toHaveBeenCalled();
    expect(mocks.deleteSocialComment).not.toHaveBeenCalled();
  });
});
