import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as getMyNotifications } from "../app/api/me/notifications/route";
import { POST as postReadNotifications } from "../app/api/me/notifications/read/route";
import { checkSocialText, parseNewPost, parseSocialPick } from "../src/server/social";

const mocks = vi.hoisted(() => ({
  requireMember: vi.fn(),
  listSocialNotifications: vi.fn(),
  markSocialNotificationsRead: vi.fn(),
}));
vi.mock("../src/server/session-user", () => ({ requireMember: mocks.requireMember }));
vi.mock("@pitchlab/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@pitchlab/db")>()),
  listSocialNotifications: mocks.listSocialNotifications,
  markSocialNotificationsRead: mocks.markSocialNotificationsRead,
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
