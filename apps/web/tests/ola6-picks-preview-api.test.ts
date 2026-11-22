import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CatalogPickItem,
  GamePreviewPayload,
  PickLabResponsePayload,
  ScreenerApiResponse,
} from "@pitchlab/ui/picks-catalog";
import { GET as gamePreviewGET } from "../app/api/games/[gameId]/preview/route";
import { GET as pickLabGET } from "../app/api/picks/lab/[pickId]/route";
import { GET as picksScreenerGET } from "../app/api/picks/screener/route";
import { resetScrapingVelocityForTests } from "../src/server/api-guards";
import {
  buildServerRawPlatformDataset,
  loadServerPicksCatalogsForScreener,
} from "../src/server/platform-data";
import { resetRateLimitsForTests } from "../src/server/request-security";
import type { ViewerAccess } from "../src/server/viewer-access";

const mocks = vi.hoisted(() => ({
  getViewerAccess: vi.fn(),
}));

vi.mock("../src/server/viewer-access", () => ({
  getViewerAccess: mocks.getViewerAccess,
}));

const ACCESS_NONE: ViewerAccess = {
  via: "none",
  signupComplete: false,
  fullAccess: false,
  isAdmin: false,
  isTipster: false,
  profile: null,
};

const ACCESS_VISITOR: ViewerAccess = {
  via: "account",
  signupComplete: true,
  fullAccess: false,
  isAdmin: false,
  isTipster: false,
  profile: null,
};

const ACCESS_BETA: ViewerAccess = {
  via: "beta",
  signupComplete: true,
  fullAccess: true,
  isAdmin: false,
  isTipster: false,
  profile: null,
};

const FORBIDDEN_WIRE_RE = /scoutpicks|sofascore|bzzoiro|poisson|dixon/i;
const FORBIDDEN_ESPN_CDN_RE = /a\.espncdn\.com/i;
const SCREENER_MAX_BYTES = 180 * 1024;

function assertCleanSerializedPayload(serialized: string, label: string): void {
  expect(serialized, `a.espncdn.com detectado en ${label}`).not.toMatch(FORBIDDEN_ESPN_CDN_RE);
  expect(serialized, `Término FD-16 detectado en ${label}`).not.toMatch(FORBIDDEN_WIRE_RE);
}

function selectLockedUpcomingGameId(): string {
  const raw = buildServerRawPlatformDataset();
  const upcoming = raw.games.filter((g) => g.status !== "FT" && g.hasForecast !== false);
  const countByLeague = new Map<string, number>();

  for (const game of upcoming) {
    const isPromo = game.picks.some(
      (p) => Boolean(p.isDailyOpenPromo) || Boolean(p.isTipsterWeeklyOpen),
    );
    const seen = countByLeague.get(game.league) ?? 0;
    countByLeague.set(game.league, seen + 1);
    if (!isPromo && seen >= 1) {
      return game.id;
    }
  }

  const nonPromo = upcoming.find(
    (g) => !g.picks.some((p) => Boolean(p.isDailyOpenPromo) || Boolean(p.isTipsterWeeklyOpen)),
  );
  const fallback = nonPromo ?? upcoming[0];
  expect(fallback).toBeDefined();
  return fallback!.id;
}

afterEach(() => {
  vi.resetAllMocks();
  resetRateLimitsForTests();
  resetScrapingVelocityForTests();
});

describe("Ola 6 API · /api/picks/screener, /api/picks/lab/[pickId] y /api/games/[gameId]/preview", () => {
  it("GET /api/picks/screener exige sesión, acota pageSize <= 40, aplica Cero-Fuga y cero FD-16/ESPN CDN", async () => {
    mocks.getViewerAccess.mockResolvedValue(ACCESS_NONE);
    const unauthRes = await picksScreenerGET(
      new Request("http://localhost:9990/api/picks/screener?page=1&pageSize=20"),
    );
    expect(unauthRes.status).toBe(401);
    expect(unauthRes.headers.get("Cache-Control")).toBe("private, no-store");

    mocks.getViewerAccess.mockResolvedValue(ACCESS_BETA);
    const memberRes = await picksScreenerGET(
      new Request("http://localhost:9990/api/picks/screener?page=1&pageSize=120&limit=120"),
    );
    expect(memberRes.status).toBe(200);
    expect(memberRes.headers.get("Cache-Control")).toBe("private, no-store");
    const memberBody: ScreenerApiResponse = await memberRes.json();
    expect(memberBody.ok).toBe(true);
    expect(memberBody.fullAccess).toBe(true);
    expect(memberBody.page).toBe(1);
    expect(memberBody.pageSize).toBeLessThanOrEqual(40);
    expect(typeof memberBody.hasMore).toBe("boolean");
    expect(Array.isArray(memberBody.picksOfTheDay)).toBe(true);
    expect(Object.keys(memberBody.catalogs).length).toBeGreaterThan(0);
    expect(Object.keys(memberBody.catalogs).length).toBeLessThanOrEqual(40);
    assertCleanSerializedPayload(JSON.stringify(memberBody), "GET /api/picks/screener [beta]");

    mocks.getViewerAccess.mockResolvedValue(ACCESS_VISITOR);
    const visitorRes = await picksScreenerGET(
      new Request("http://localhost:9990/api/picks/screener?page=1&pageSize=20"),
    );
    expect(visitorRes.status).toBe(200);
    expect(visitorRes.headers.get("Cache-Control")).toBe("private, no-store");
    const visitorBody: ScreenerApiResponse = await visitorRes.json();
    expect(visitorBody.ok).toBe(true);
    expect(visitorBody.fullAccess).toBe(false);
    expect(visitorBody.pageSize).toBeLessThanOrEqual(40);

    for (const catalog of Object.values(visitorBody.catalogs)) {
      if (catalog.gameStatus === "FT") continue;
      expect(catalog.isRedactedForVisitor).toBe(true);
      for (const item of catalog.picks) {
        const isPromo = Boolean(item.isDailyOpenPromo || item.isTipsterWeeklyOpen);
        if (!isPromo) {
          expect(item.isRedacted).toBe(true);
          expect(item.pricing.p).toBe(0);
          expect(item.pricing.fairOdds).toBe(0);
          expect(item.pricing.marketDecimal).toBeNull();
          expect(item.evidence.windows).toEqual([]);
        }
      }
    }

    for (const potd of visitorBody.picksOfTheDay) {
      expect(potd.isRedacted).not.toBe(true);
      expect(Boolean(potd.isDailyOpenPromo || potd.isTipsterWeeklyOpen)).toBe(true);
    }

    assertCleanSerializedPayload(JSON.stringify(visitorBody), "GET /api/picks/screener [visitor]");
  });

  it("GET /api/picks/lab/[pickId] devuelve series reales para beta, 404 en inválido o visitante bloqueado y cero FD-16", async () => {
    mocks.getViewerAccess.mockResolvedValue(ACCESS_BETA);
    const screenerRes = await picksScreenerGET(
      new Request("http://localhost:9990/api/picks/screener?page=1&pageSize=20"),
    );
    expect(screenerRes.status).toBe(200);
    const screenerBody: ScreenerApiResponse = await screenerRes.json();

    const allPicks: CatalogPickItem[] = Object.values(screenerBody.catalogs).flatMap(
      (cat) => cat.picks,
    );
    const lockedUpcomingPick =
      allPicks.find(
        (p) =>
          p.gameStatus !== "FT" &&
          !p.isRedacted &&
          !p.isDailyOpenPromo &&
          !p.isTipsterWeeklyOpen,
      ) ?? allPicks[0];
    expect(lockedUpcomingPick).toBeDefined();
    const pickId = lockedUpcomingPick!.id;

    mocks.getViewerAccess.mockResolvedValue(ACCESS_NONE);
    const unauthRes = await pickLabGET(
      new Request(`http://localhost:9990/api/picks/lab/${encodeURIComponent(pickId)}`),
      { params: Promise.resolve({ pickId }) },
    );
    expect(unauthRes.status).toBe(401);
    expect(unauthRes.headers.get("Cache-Control")).toBe("private, no-store");

    mocks.getViewerAccess.mockResolvedValue(ACCESS_BETA);
    const memberRes = await pickLabGET(
      new Request(`http://localhost:9990/api/picks/lab/${encodeURIComponent(pickId)}`),
      { params: Promise.resolve({ pickId }) },
    );
    expect(memberRes.status).toBe(200);
    expect(memberRes.headers.get("Cache-Control")).toBe("private, no-store");
    const labBody: PickLabResponsePayload = await memberRes.json();
    expect(labBody.ok).toBe(true);
    expect(labBody.pick.id).toBe(pickId);
    expect(Array.isArray(labBody.barsFor)).toBe(true);
    expect(Array.isArray(labBody.barsAgainst)).toBe(true);
    expect(Array.isArray(labBody.recentHistory)).toBe(true);
    expect(Array.isArray(labBody.relatedPicks)).toBe(true);
    assertCleanSerializedPayload(JSON.stringify(labBody), "GET /api/picks/lab/[pickId] [beta]");

    mocks.getViewerAccess.mockResolvedValue(ACCESS_BETA);
    const missingRes = await pickLabGET(
      new Request("http://localhost:9990/api/picks/lab/pick-inexistente-ola6-999"),
      { params: Promise.resolve({ pickId: "pick-inexistente-ola6-999" }) },
    );
    expect(missingRes.status).toBe(404);
    expect(missingRes.headers.get("Cache-Control")).toBe("private, no-store");

    mocks.getViewerAccess.mockResolvedValue(ACCESS_VISITOR);
    const visitorBlockedRes = await pickLabGET(
      new Request(`http://localhost:9990/api/picks/lab/${encodeURIComponent(pickId)}`),
      { params: Promise.resolve({ pickId }) },
    );
    expect(visitorBlockedRes.status).toBe(404);
    expect(visitorBlockedRes.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("GET /api/games/[gameId]/preview aplica Cero-Fuga estricto en visitantes, 404 en inválido y cero FD-16", async () => {
    const targetGameId = selectLockedUpcomingGameId();

    mocks.getViewerAccess.mockResolvedValue(ACCESS_NONE);
    const unauthRes = await gamePreviewGET(
      new Request(`http://localhost:9990/api/games/${encodeURIComponent(targetGameId)}/preview`),
      { params: Promise.resolve({ gameId: targetGameId }) },
    );
    expect(unauthRes.status).toBe(401);
    expect(unauthRes.headers.get("Cache-Control")).toBe("private, no-store");

    mocks.getViewerAccess.mockResolvedValue(ACCESS_BETA);
    const memberRes = await gamePreviewGET(
      new Request(`http://localhost:9990/api/games/${encodeURIComponent(targetGameId)}/preview`),
      { params: Promise.resolve({ gameId: targetGameId }) },
    );
    expect(memberRes.status).toBe(200);
    expect(memberRes.headers.get("Cache-Control")).toBe("private, no-store");
    const memberPreview: GamePreviewPayload = await memberRes.json();
    expect(memberPreview.ok).toBe(true);
    expect(memberPreview.gameId).toBe(targetGameId);
    expect(memberPreview.fullAccess).toBe(true);
    expect(memberPreview.game.id).toBe(targetGameId);
    expect(memberPreview.game.canonicalHref).toMatch(/^\/app\/[a-z0-9-]+\/g\/[a-z0-9-]+/);
    expect(Array.isArray(memberPreview.injuries)).toBe(true);
    assertCleanSerializedPayload(
      JSON.stringify(memberPreview),
      "GET /api/games/[gameId]/preview [beta]",
    );

    mocks.getViewerAccess.mockResolvedValue(ACCESS_VISITOR);
    const visitorRes = await gamePreviewGET(
      new Request(`http://localhost:9990/api/games/${encodeURIComponent(targetGameId)}/preview`),
      { params: Promise.resolve({ gameId: targetGameId }) },
    );
    expect(visitorRes.status).toBe(200);
    expect(visitorRes.headers.get("Cache-Control")).toBe("private, no-store");
    const visitorPreview: GamePreviewPayload = await visitorRes.json();
    expect(visitorPreview.ok).toBe(true);
    expect(visitorPreview.fullAccess).toBe(false);
    expect(visitorPreview.game.x12).toEqual([0, 0, 0]);
    expect(visitorPreview.detail.markets).toEqual([]);
    expect(visitorPreview.detail.factors).toEqual([]);
    if (visitorPreview.detail.picksCatalog) {
      for (const item of visitorPreview.detail.picksCatalog.picks) {
        const isPromo = Boolean(item.isDailyOpenPromo || item.isTipsterWeeklyOpen);
        if (!isPromo) {
          expect(item.isRedacted).toBe(true);
          expect(item.pricing.p).toBe(0);
          expect(item.pricing.fairOdds).toBe(0);
        }
      }
    }
    assertCleanSerializedPayload(
      JSON.stringify(visitorPreview),
      "GET /api/games/[gameId]/preview [visitor]",
    );

    mocks.getViewerAccess.mockResolvedValue(ACCESS_BETA);
    const missingRes = await gamePreviewGET(
      new Request("http://localhost:9990/api/games/game-inexistente-ola6-999/preview"),
      { params: Promise.resolve({ gameId: "game-inexistente-ola6-999" }) },
    );
    expect(missingRes.status).toBe(404);
    expect(missingRes.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("loadServerPicksCatalogsForScreener respeta presupuesto <= 180 KB y cero fugas FD-16/ESPN CDN", async () => {
    const memberCatalogs = await loadServerPicksCatalogsForScreener({ fullAccess: true });
    const memberSerialized = JSON.stringify(memberCatalogs);
    expect(Object.keys(memberCatalogs).length).toBeGreaterThan(0);
    expect(Buffer.byteLength(memberSerialized, "utf8")).toBeLessThanOrEqual(SCREENER_MAX_BYTES);
    assertCleanSerializedPayload(memberSerialized, "loadServerPicksCatalogsForScreener [member]");

    const visitorCatalogs = await loadServerPicksCatalogsForScreener({ fullAccess: false });
    const visitorSerialized = JSON.stringify(visitorCatalogs);
    expect(Object.keys(visitorCatalogs).length).toBeGreaterThan(0);
    expect(Buffer.byteLength(visitorSerialized, "utf8")).toBeLessThanOrEqual(SCREENER_MAX_BYTES);
    assertCleanSerializedPayload(visitorSerialized, "loadServerPicksCatalogsForScreener [visitor]");

    for (const catalog of Object.values(visitorCatalogs)) {
      if (catalog.gameStatus === "FT") continue;
      for (const item of catalog.picks) {
        const isPromo = Boolean(item.isDailyOpenPromo || item.isTipsterWeeklyOpen);
        if (!isPromo) {
          expect(item.isRedacted).toBe(true);
          expect(item.pricing.p).toBe(0);
          expect(item.pricing.fairOdds).toBe(0);
        }
      }
    }
  });
});
