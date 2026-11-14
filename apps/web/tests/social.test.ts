import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as getModeration, POST as postModeration } from "../app/api/admin/moderation/route";
import { GET as getMyNotifications } from "../app/api/me/notifications/route";
import { POST as postReadNotifications } from "../app/api/me/notifications/read/route";
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
}));
vi.mock("../src/server/auth", () => ({ getAuth: mocks.getAuth }));
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
});
