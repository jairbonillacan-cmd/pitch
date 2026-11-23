import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as getCompare } from "../app/api/compare/route";
import { GET as getGamePreview } from "../app/api/games/[gameId]/preview/route";
import { GET as getHandlesSuggest } from "../app/api/handles/suggest/route";
import { GET as getLiveAlerts } from "../app/api/live/alerts/route";
import { GET as getJournal, POST as postJournal } from "../app/api/me/journal/route";
import { GET as getNotifications } from "../app/api/me/notifications/route";
import { POST as postPush } from "../app/api/me/push/route";
import { POST as postWatchlist } from "../app/api/me/watchlist/route";
import { GET as getPickLab } from "../app/api/picks/lab/[pickId]/route";
import { GET as getScreener } from "../app/api/picks/screener/route";
import { GET as getSearchPlayers } from "../app/api/search/players/route";
import { GET as getSearchReferees } from "../app/api/search/referees/route";
import { PUT as putPostLike } from "../app/api/social/posts/[id]/like/route";
import { GET as getSocialPosts } from "../app/api/social/posts/route";
import { resetScrapingVelocityForTests } from "../src/server/api-guards";
import { resetRateLimitsForTests } from "../src/server/request-security";

const mocks = vi.hoisted(() => ({
  getAuth: vi.fn(),
  getViewerAccess: vi.fn(),
  hasActivePaseTotal: vi.fn(),
  requireMember: vi.fn(),
  requireSocialMember: vi.fn(),
  serverDb: vi.fn(),
  listSocialNotifications: vi.fn(),
  listSocialFeed: vi.fn(),
  listLiveAlertsForUser: vi.fn(),
  listJournal: vi.fn(),
  withAuthorBadges: vi.fn(),
  suggestHandles: vi.fn(),
}));

vi.mock("@pitchlab/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@pitchlab/db")>()),
  hasActivePaseTotal: mocks.hasActivePaseTotal,
  listSocialNotifications: mocks.listSocialNotifications,
  listSocialFeed: mocks.listSocialFeed,
  listLiveAlertsForUser: mocks.listLiveAlertsForUser,
  suggestHandles: mocks.suggestHandles,
}));

vi.mock("../src/server/auth", () => ({
  getAuth: mocks.getAuth,
}));

vi.mock("../src/server/badges", () => ({
  withAuthorBadges: mocks.withAuthorBadges,
}));

vi.mock("../src/server/viewer-access", () => ({
  getViewerAccess: mocks.getViewerAccess,
}));

vi.mock("../src/server/session-user", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/server/session-user")>();
  return {
    ...actual,
    requireMember: mocks.requireMember,
    serverDb: mocks.serverDb,
  };
});

vi.mock("../src/server/social", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/server/social")>()),
  requireSocialMember: mocks.requireSocialMember,
}));

vi.mock("../src/server/member-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/server/member-data")>()),
  listJournal: mocks.listJournal,
}));

const ORIGIN_HEADERS = {
  origin: "http://localhost:3000",
  host: "localhost:3000",
  "content-type": "application/json",
};

function setupActiveSession() {
  const user = {
    db: {},
    userId: "11111111-1111-4111-8111-111111111111",
    email: "socio@example.com",
    emailVerified: true,
    authUserId: "auth-111",
  };
  mocks.requireMember.mockResolvedValue(user);
  mocks.requireSocialMember.mockResolvedValue({
    ok: true,
    user: { ...user, handle: "socio_mx" },
  });
  mocks.hasActivePaseTotal.mockResolvedValue(true);
  mocks.getViewerAccess.mockResolvedValue({
    via: "member",
    tier: "ultra",
    fullAccess: true,
    isAuthenticated: true,
  });
  mocks.listSocialNotifications.mockResolvedValue([]);
  mocks.listSocialFeed.mockResolvedValue([]);
  mocks.withAuthorBadges.mockImplementation(async (_db: unknown, posts: unknown[]) => posts);
  mocks.listLiveAlertsForUser.mockResolvedValue([]);
  mocks.listJournal.mockResolvedValue([]);
  mocks.serverDb.mockReturnValue({});
  mocks.suggestHandles.mockResolvedValue(["socio_mx"]);
}

afterEach(() => {
  vi.resetAllMocks();
  resetRateLimitsForTests();
  resetScrapingVelocityForTests();
});

describe("Auditoría HTTP edge cases en rutas /api/**", () => {
  it("rechaza JSON malformado y tipos primitivos inesperados con 400 y cabeceras seguras", async () => {
    setupActiveSession();
    const validUuid = "22222222-2222-4222-8222-222222222222";
    const badBodies = ['{"incompleto":', "[]", '"texto"', "123", "null"];

    for (const rawBody of badBodies) {
      const rJournal = await postJournal(
        new Request("http://localhost:3000/api/me/journal", {
          method: "POST",
          headers: ORIGIN_HEADERS,
          body: rawBody,
        }),
      );
      expect(rJournal.status).toBe(400);
      expect(rJournal.headers.get("X-Content-Type-Options")).toBe("nosniff");

      const rWatchlist = await postWatchlist(
        new Request("http://localhost:3000/api/me/watchlist", {
          method: "POST",
          headers: ORIGIN_HEADERS,
          body: rawBody,
        }),
      );
      expect(rWatchlist.status).toBe(400);

      const rPush = await postPush(
        new Request("http://localhost:3000/api/me/push", {
          method: "POST",
          headers: ORIGIN_HEADERS,
          body: rawBody,
        }),
      );
      expect(rPush.status).toBe(400);

      const rLike = await putPostLike(
        new Request(`http://localhost:3000/api/social/posts/${validUuid}/like`, {
          method: "PUT",
          headers: ORIGIN_HEADERS,
          body: rawBody,
        }),
        { params: Promise.resolve({ id: validUuid }) },
      );
      expect(rLike.status).toBe(400);
    }
  });

  it("acota limit/offset extremos o negativos y rechaza cursores corruptos sin 500", async () => {
    setupActiveSession();

    const rJournal = await getJournal(
      new Request("http://localhost:3000/api/me/journal?limit=999999&offset=-50"),
    );
    expect(rJournal.status).toBe(200);
    expect(mocks.listJournal).toHaveBeenCalledWith(expect.anything(), expect.any(String), {
      limit: 40,
      offset: 0,
    });
    expect(rJournal.headers.get("Cache-Control")).toContain("private");
    expect(rJournal.headers.get("Cache-Control")).toContain("no-store");

    const rNotifs = await getNotifications(
      new Request("http://localhost:3000/api/me/notifications?limit=-5"),
    );
    expect(rNotifs.status).toBe(200);
    expect(mocks.listSocialNotifications).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      40,
    );

    const rAlerts = await getLiveAlerts(
      new Request("http://localhost:3000/api/live/alerts?since=invalid-date&limit=9999"),
    );
    expect(rAlerts.status).toBe(200);
    expect(mocks.listLiveAlertsForUser).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      expect.any(Date),
      40,
    );

    const rPostsCorruptBefore = await getSocialPosts(
      new Request("http://localhost:3000/api/social/posts?before=fecha-corrupta"),
    );
    expect(rPostsCorruptBefore.status).toBe(400);

    const rPostsBidiBefore = await getSocialPosts(
      new Request("http://localhost:3000/api/social/posts?before=%E2%80%AE2026-11-22T00:00:00Z"),
    );
    expect(rPostsBidiBefore.status).toBe(400);
  });

  it("sanea o rechaza slugs con Bidi/control/traversal y protege cabeceras en rutas de lectura", async () => {
    setupActiveSession();

    const rCompareBidi = await getCompare(
      new Request("http://localhost:3000/api/compare?liga=liga-mx&a=chivas%E2%80%AE&b=america"),
    );
    expect(rCompareBidi.status).toBe(400);
    expect(rCompareBidi.headers.get("X-Content-Type-Options")).toBe("nosniff");

    const rCompareBadLeague = await getCompare(
      new Request("http://localhost:3000/api/compare?liga=../../etc/passwd&a=chivas&b=america"),
    );
    expect(rCompareBadLeague.status).toBe(400);

    const rPlayers = await getSearchPlayers(
      new Request("http://localhost:3000/api/search/players?q=messi%E2%80%AE%00&limit=5000"),
    );
    expect(rPlayers.status).toBe(200);
    expect(rPlayers.headers.get("Cache-Control")).toContain("no-store");

    const rReferees = await getSearchReferees(
      new Request("http://localhost:3000/api/search/referees?q=ramos%E2%80%8B&league=liga-no-existe"),
    );
    expect(rReferees.status).toBe(400);

    const rScreener = await getScreener(
      new Request("http://localhost:3000/api/picks/screener?gameId=../secret%00&pageSize=999"),
    );
    expect(rScreener.status).toBe(400);

    const rPreview = await getGamePreview(
      new Request("http://localhost:3000/api/games/invalid/preview"),
      { params: Promise.resolve({ gameId: "../etc/passwd" }) },
    );
    expect(rPreview.status).toBe(404);

    const rLab = await getPickLab(
      new Request("http://localhost:3000/api/picks/lab/invalid"),
      { params: Promise.resolve({ pickId: "pick\u202E123" }) },
    );
    expect(rLab.status).toBe(404);

    const rSuggest = await getHandlesSuggest(
      new Request(`http://localhost:3000/api/handles/suggest?name=${encodeURIComponent("Juan\u202E\u0007 Pérez")}`),
    );
    expect(rSuggest.status).toBe(200);
    expect(mocks.suggestHandles).toHaveBeenCalledWith(
      expect.anything(),
      ["Juan Pérez"],
      3,
      { exceptUserId: undefined },
    );
  });
});
