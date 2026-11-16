import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as getModeration, POST as postModeration } from "../app/api/admin/moderation/route";
import { GET as getMyNotifications } from "../app/api/me/notifications/route";
import { POST as postReadNotifications } from "../app/api/me/notifications/read/route";
import { DELETE as deleteCommentRoute } from "../app/api/social/posts/[id]/comments/[commentId]/route";
import { PUT as putCommentHelpfulRoute } from "../app/api/social/posts/[id]/comments/[commentId]/like/route";
import { GET as getPostCommentsRoute, POST as postCommentRoute } from "../app/api/social/posts/[id]/comments/route";
import { POST as postCopyRoute } from "../app/api/social/posts/[id]/copy/route";
import { GET as getPostsRoute, POST as postSocialRoute } from "../app/api/social/posts/route";
import { POST as postSocialReport } from "../app/api/social/reports/route";
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
  listPostComments: vi.fn(),
  addSocialComment: vi.fn(),
  deleteSocialComment: vi.fn(),
  setSocialCommentHelpful: vi.fn(),
  recordSocialPostPickCopy: vi.fn(),
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
  listPostComments: mocks.listPostComments,
  addSocialComment: mocks.addSocialComment,
  deleteSocialComment: mocks.deleteSocialComment,
  setSocialCommentHelpful: mocks.setSocialCommentHelpful,
  recordSocialPostPickCopy: mocks.recordSocialPostPickCopy,
}));

afterEach(() => {
  vi.resetAllMocks();
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
  it("devuelve los últimos 50 avisos y marca como leídos todos o los ids pedidos", async () => {
    mocks.requireMember.mockResolvedValue({ db: {}, userId: "u1" });
    mocks.listSocialNotifications.mockResolvedValue([
      {
        id: "n1",
        kind: "comment",
        actorHandle: "ana_mx",
        actorName: "Ana",
        postId: "p1",
        postExcerpt: "Monterrey",
        likeCount: 0,
        createdAt: "2026-11-12T12:00:00.000Z",
        readAt: null,
      },
    ]);
    const getRes = await getMyNotifications(new Request("http://localhost:9990/api/me/notifications"));
    expect(getRes.status).toBe(200);
    expect(await getRes.json()).toMatchObject({ notifications: [{ id: "n1", actorHandle: "ana_mx" }] });
    expect(mocks.listSocialNotifications).toHaveBeenCalledWith({}, "u1", 50);

    mocks.markSocialNotificationsRead.mockResolvedValue(2);
    const readIdsRes = await postReadNotifications(
      new Request("http://localhost:9990/api/me/notifications/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: ["n1", "n2"] }),
      }),
    );
    expect(readIdsRes.status).toBe(200);
    expect(mocks.markSocialNotificationsRead).toHaveBeenCalledWith({}, "u1", ["n1", "n2"], expect.any(Date));

    await postReadNotifications(
      new Request("http://localhost:9990/api/me/notifications/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(mocks.markSocialNotificationsRead).toHaveBeenLastCalledWith({}, "u1", undefined, expect.any(Date));
  });
});

describe("comunidad: reportes y panel de moderación", () => {
  it("un socio que no es admin recibe 403 en GET y POST /api/admin/moderation", async () => {
    const prevAdmins = process.env.PITCHLAB_ADMIN_EMAILS;
    process.env.PITCHLAB_ADMIN_EMAILS = "fundador@pitchlab.mx";
    try {
      mocks.getAuth.mockReturnValue({
        api: {
          getSession: vi.fn().mockResolvedValue({
            user: { id: "auth-socio", email: "socio@example.com" },
          }),
        },
      });

      const getRes = await getModeration(new Request("http://localhost:9990/api/admin/moderation"));
      expect(getRes.status).toBe(403);
      expect(await getRes.json()).toMatchObject({ error: "Solo para el equipo fundador" });

      const postRes = await postModeration(
        new Request("http://localhost:9990/api/admin/moderation", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "hide", targetType: "post", targetId: "p1" }),
        }),
      );
      expect(postRes.status).toBe(403);
      expect(mocks.applyModerationAction).not.toHaveBeenCalled();

      // Con correo de admin sí entra y ejecuta la acción.
      mocks.getAuth.mockReturnValue({
        api: {
          getSession: vi.fn().mockResolvedValue({
            user: { id: "auth-admin", email: "fundador@pitchlab.mx" },
          }),
        },
      });
      mocks.requireMember.mockResolvedValue({ db: {}, userId: "admin-1" });
      mocks.applyModerationAction.mockResolvedValue({ ok: true });
      mocks.listModerationPanelData.mockResolvedValue({ pendingQueue: [], hiddenItems: [], pausedMembers: [] });

      const adminRes = await postModeration(
        new Request("http://localhost:9990/api/admin/moderation", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "hide", targetType: "post", targetId: "p1" }),
        }),
      );
      expect(adminRes.status).toBe(200);
      expect(mocks.applyModerationAction).toHaveBeenCalledWith(
        {},
        "admin-1",
        { action: "hide", targetType: "post", targetId: "p1", targetUserId: undefined },
        expect.any(Date),
      );
    } finally {
      if (prevAdmins === undefined) delete process.env.PITCHLAB_ADMIN_EMAILS;
      else process.env.PITCHLAB_ADMIN_EMAILS = prevAdmins;
    }
  });

  it("permite reportar contenido ajeno y devuelve 409 si ya se reportó", async () => {
    mocks.requireSocialMember.mockResolvedValue({ db: {}, userId: "u2" });
    mocks.reportSocialContent.mockResolvedValueOnce({ ok: true, id: "rep-1", autoHidden: true });

    const createdRes = await postSocialReport(
      new Request("http://localhost:9990/api/social/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ postId: "post-uuid", reason: "spam_enlaces" }),
      }),
    );
    expect(createdRes.status).toBe(201);
    expect(await createdRes.json()).toEqual({ ok: true, id: "rep-1", autoHidden: true });

    mocks.reportSocialContent.mockResolvedValueOnce({ ok: false, reason: "ya_reportado" });
    const dupRes = await postSocialReport(
      new Request("http://localhost:9990/api/social/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ postId: "post-uuid", reason: "spam_enlaces" }),
      }),
    );
    expect(dupRes.status).toBe(409);
  });

  it("reenvía gameId, liga, openPick, sort y acepta sealedJournalEntryId en /api/social/posts", async () => {
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

    mocks.requireSocialMember.mockResolvedValue({ db: {}, userId: "u1" });
    mocks.listSocialFeed.mockResolvedValue([{ id: "p1" }]);
    mocks.withAuthorBadges.mockImplementation(async (_db, items) => items);

    const getRes = await getPostsRoute(
      new Request("http://localhost:9990/api/social/posts?gameId=g-lmx-1&league=Liga%20MX&openPick=1&sort=most_commented"),
    );
    expect(getRes.status).toBe(200);
    expect(mocks.listSocialFeed).toHaveBeenCalledWith(
      {},
      "u1",
      expect.objectContaining({
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
        headers: { "content-type": "application/json" },
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

  it("lista y crea respuestas con parentCommentId, borra comentario propio, marca Útil y cuenta copias", async () => {
    const postId = "22222222-2222-4222-8222-222222222222";
    const commentId = "33333333-3333-4333-8333-333333333333";
    const parentId = "44444444-4444-4444-8444-444444444444";

    mocks.requireSocialMember.mockResolvedValue({ db: {}, userId: "u1" });
    mocks.requireMember.mockResolvedValue({ db: {}, userId: "u1" });

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
    expect(await listRes.json()).toEqual({ comments: [{ id: commentId, body: "Respuesta completa" }], commentsCount: 35 });

    mocks.addSocialComment.mockResolvedValue({ ok: true, comment: { id: commentId, parentCommentId: parentId } });
    const replyRes = await postCommentRoute(
      new Request(`http://localhost:9990/api/social/posts/${postId}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
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
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: postId, commentId }) },
    );
    expect(badHelpful.status).toBe(400);

    const goodHelpful = await putCommentHelpfulRoute(
      new Request(`http://localhost:9990/api/social/posts/${postId}/comments/${commentId}/like`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ helpful: true }),
      }),
      { params: Promise.resolve({ id: postId, commentId }) },
    );
    expect(goodHelpful.status).toBe(200);
    expect(await goodHelpful.json()).toEqual({ helpfulCount: 3, helpfulByMe: true });

    mocks.deleteSocialComment.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const delOk = await deleteCommentRoute(
      new Request(`http://localhost:9990/api/social/posts/${postId}/comments/${commentId}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: postId, commentId }) },
    );
    expect(delOk.status).toBe(200);
    const delFail = await deleteCommentRoute(
      new Request(`http://localhost:9990/api/social/posts/${postId}/comments/${commentId}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: postId, commentId }) },
    );
    expect(delFail.status).toBe(404);

    mocks.recordSocialPostPickCopy.mockResolvedValue({ ok: true, copiesCount: 4 });
    const copyRes = await postCopyRoute(
      new Request(`http://localhost:9990/api/social/posts/${postId}/copy`, { method: "POST" }),
      { params: Promise.resolve({ id: postId }) },
    );
    expect(copyRes.status).toBe(200);
    expect(await copyRes.json()).toEqual({ copiesCount: 4 });
  });
});
