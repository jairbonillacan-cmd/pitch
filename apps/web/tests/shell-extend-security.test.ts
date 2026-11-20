import { afterEach, describe, expect, it, vi } from "vitest";
import type { LiveMatchDetail } from "@pitchlab/contracts";
import { redactDatasetForVisitor } from "@pitchlab/ui/access-guard";
import type { PlatformDataset, PlatformGame } from "@pitchlab/ui/types";
import { GET as compareGET } from "../app/api/compare/route";
import { GET as liveGameGET } from "../app/api/live/games/[gameId]/route";
import { GET as extendGET } from "../app/api/shell/extend/route";
import {
  buildServerRawPlatformDataset,
  splitInitialShellDataset,
  upcomingPlusRecentFinished,
  withoutGameDetail,
} from "../src/server/platform-data";
import type { ViewerAccess } from "../src/server/viewer-access";

const mocks = vi.hoisted(() => ({
  getViewerAccess: vi.fn(),
  getLiveMatchDetail: vi.fn(),
}));

vi.mock("../src/server/viewer-access", () => ({
  getViewerAccess: mocks.getViewerAccess,
}));

vi.mock("../src/server/live", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/server/live")>()),
  getLiveMatchDetail: mocks.getLiveMatchDetail,
}));

const ACCESS_NONE: ViewerAccess = {
  via: "none",
  signupComplete: false,
  fullAccess: false,
  isAdmin: false,
  isTipster: false,
  profile: null,
};

const ACCESS_VISITOR_SESSION: ViewerAccess = {
  via: "account",
  signupComplete: true,
  fullAccess: false,
  isAdmin: false,
  isTipster: false,
  profile: null,
};

const ACCESS_MEMBER: ViewerAccess = {
  via: "account",
  signupComplete: true,
  fullAccess: true,
  isAdmin: false,
  isTipster: false,
  profile: null,
};

const SAMPLE_LIVE_DETAIL: LiveMatchDetail = {
  gameId: "mx-2026-live-sec-test",
  generatedAt: "2026-11-20T22:15:00.000Z",
  sourceFetchedAt: "2026-11-20T22:14:55.000Z",
  entry: {
    gameId: "mx-2026-live-sec-test",
    league: "liga-mx",
    phase: "live",
    clock: "67",
    minute: 67,
    score: { home: 1, away: 0 },
    htScore: { home: 0, away: 0 },
    redCards: { home: 0, away: 0 },
    kickoffUtc: "2026-11-20T21:00:00.000Z",
  },
  incidents: [
    {
      order: 1,
      kind: "goal",
      side: "home",
      minute: 58,
      addedTime: null,
      player: "Henry Martín",
      secondary: "Álvaro Fidalgo",
      score: { home: 1, away: 0 },
      note: null,
    },
  ],
  stats: null,
  xgEstimated: false,
  momentum: [],
  xgTimeline: [],
  shots: [],
  inPlayWinProb: {
    minute: 67,
    pHome: 0.64,
    pDraw: 0.23,
    pAway: 0.13,
    fairHomeDecimal: 1.56,
    fairDrawDecimal: 4.35,
    fairAwayDecimal: 7.69,
    pNextGoalHome: 0.41,
    pNextGoalAway: 0.27,
    pNoMoreGoals: 0.32,
    expectedFinalTotal: 2.15,
    redCardsHome: 0,
    redCardsAway: 0,
  },
  nextPollSeconds: 20,
  notice: null,
  attribution: "Datos deportivos en vivo de Bzzoiro",
};

function isZeroX12(x12: [number, number, number] | null): boolean {
  return x12 !== null && x12[0] === 0 && x12[1] === 0 && x12[2] === 0;
}

afterEach(() => {
  vi.resetAllMocks();
});

describe("Seguridad del shell RSC, /api/shell/extend, /api/live/games/[gameId] y /api/compare", () => {
  it("mantiene el presupuesto del shell RSC inicial (splitInitialShellDataset) estrictamente < 500 KB en modo member y visitor", () => {
    const raw = buildServerRawPlatformDataset();
    const memberSlim = withoutGameDetail(upcomingPlusRecentFinished(raw, 12));
    const visitorSlim = withoutGameDetail(
      upcomingPlusRecentFinished(redactDatasetForVisitor(raw), 12),
    );

    const memberStage1 = splitInitialShellDataset(memberSlim);
    const visitorStage1 = splitInitialShellDataset(visitorSlim);

    const memberBytes = Buffer.byteLength(JSON.stringify(memberStage1), "utf8");
    const visitorBytes = Buffer.byteLength(JSON.stringify(visitorStage1), "utf8");

    expect(memberBytes).toBeLessThan(500 * 1024);
    expect(visitorBytes).toBeLessThan(500 * 1024);
    expect(memberStage1.isServerRedactedForVisitor).toBe(false);
    expect(visitorStage1.isServerRedactedForVisitor).toBe(true);
    expect(memberStage1.games.length).toBeGreaterThan(0);
    expect(memberStage1.games.length).toBeLessThanOrEqual(52);
    expect(visitorStage1.games.length).toBeGreaterThan(0);
    expect(visitorStage1.games.length).toBeLessThanOrEqual(52);
    expect(memberStage1.playerProps).toEqual([]);
    expect(visitorStage1.playerProps).toEqual([]);
    expect(memberStage1.leagues.every((lg) => lg.standings.length === 0)).toBe(true);
    expect(visitorStage1.leagues.every((lg) => lg.standings.length === 0)).toBe(true);
    expect(memberStage1.games.every((g) => g.parlayCandidates === undefined)).toBe(true);
    expect(visitorStage1.games.every((g) => g.parlayCandidates === undefined)).toBe(true);

    // Estrés determinista: incluso con una jornada pico > 550 KB, el tramo 1 aplica guardia < 500 KB
    // en ambos modos (member y visitor) preservando el partido promocional.
    const template = memberSlim.games.find((g) => g.status !== "FT" && g.picks.length > 0);
    expect(template).toBeDefined();
    const basePick = template!.picks[0]!;
    const fixedNowMs = Date.parse("2026-11-20T18:00:00Z");

    const heavyGames: PlatformGame[] = Array.from({ length: 58 }, (_, idx) => {
      const gameId = `stress-shell-game-${idx}`;
      const isPromo = idx === 0;
      const picks = Array.from({ length: 16 }, (__, pIdx) => ({
        ...basePick,
        id: `${gameId}__p${pIdx}`,
        gameId,
        slotIndex: pIdx,
        label: `Selección estrés ${idx}-${pIdx} con descripción extendida de mercado`,
        isDailyOpenPromo: isPromo && pIdx === 0,
        isTipsterWeeklyOpen: false,
        bookQuotes: [
          {
            book: "pinnacle",
            bookLabel: "Pinnacle",
            decimal: 1.95,
            openingDecimal: 2.1,
            movementDirection: "shortening" as const,
            capturedAtUtc: "2026-11-20T16:00:00Z",
            isBest: true,
          },
          {
            book: "bet365",
            bookLabel: "Bet365",
            decimal: 1.92,
            openingDecimal: 2.05,
            movementDirection: "shortening" as const,
            capturedAtUtc: "2026-11-20T16:05:00Z",
          },
          {
            book: "codere",
            bookLabel: "Codere",
            decimal: 1.9,
            openingDecimal: 2.02,
            movementDirection: "shortening" as const,
            capturedAtUtc: "2026-11-20T16:10:00Z",
          },
        ],
      }));
      return {
        ...template!,
        id: gameId,
        status: "NS",
        dayId: "2026-11-20",
        kickoffUtc: `2026-11-20T${String(12 + (idx % 10)).padStart(2, "0")}:00:00Z`,
        picks,
      };
    });

    const stressMemberDataset: PlatformDataset = {
      ...memberSlim,
      dailyPromoPickId: "stress-shell-game-0__p0",
      games: heavyGames,
      isServerRedactedForVisitor: false,
    };
    const stressVisitorDataset = withoutGameDetail(redactDatasetForVisitor(stressMemberDataset));

    const stressMemberStage1 = splitInitialShellDataset(stressMemberDataset, fixedNowMs);
    const stressVisitorStage1 = splitInitialShellDataset(stressVisitorDataset, fixedNowMs);

    expect(Buffer.byteLength(JSON.stringify(stressMemberStage1), "utf8")).toBeLessThan(500 * 1024);
    expect(Buffer.byteLength(JSON.stringify(stressVisitorStage1), "utf8")).toBeLessThan(500 * 1024);
    expect(stressMemberStage1.games.some((g) => g.id === "stress-shell-game-0")).toBe(true);
    expect(stressVisitorStage1.games.some((g) => g.id === "stress-shell-game-0")).toBe(true);
  });

  it("GET /api/shell/extend devuelve 401 sin sesión, Cache-Control: private, no-store y redacta x12=[0,0,0] en partidos bloqueados no-showcase", async () => {
    mocks.getViewerAccess.mockResolvedValueOnce(ACCESS_NONE);
    const unauthRes = await extendGET();
    expect(unauthRes.status).toBe(401);
    expect(await unauthRes.json()).toEqual({ error: "unauthorized" });

    mocks.getViewerAccess.mockResolvedValueOnce(ACCESS_VISITOR_SESSION);
    const visitorRes = await extendGET();
    expect(visitorRes.status).toBe(200);
    expect(visitorRes.headers.get("Cache-Control")).toBe("private, no-store");
    const visitorBody = (await visitorRes.json()) as {
      games: PlatformGame[];
      teams: unknown[];
      isRedactedForVisitor: boolean;
    };
    expect(visitorBody.isRedactedForVisitor).toBe(true);

    mocks.getViewerAccess.mockResolvedValueOnce(ACCESS_MEMBER);
    const memberRes = await extendGET();
    expect(memberRes.status).toBe(200);
    expect(memberRes.headers.get("Cache-Control")).toBe("private, no-store");
    const memberBody = (await memberRes.json()) as {
      games: PlatformGame[];
      teams: unknown[];
      isRedactedForVisitor: boolean;
    };
    expect(memberBody.isRedactedForVisitor).toBe(false);
    expect(visitorBody.games.length).toBe(memberBody.games.length);

    const visitorById = new Map<string, PlatformGame>(
      visitorBody.games.map((game) => [game.id, game]),
    );

    // Agrupar partidos próximos no-promocionales con pronóstico real por liga:
    // como máximo 1 partido showcase por liga puede mantener x12; el resto DEBE quedar en [0, 0, 0].
    const nonShowcaseRedacted: PlatformGame[] = [];
    const nonZeroByLeague = new Map<string, number>();

    for (const memberGame of memberBody.games) {
      if (memberGame.status === "FT" || !memberGame.x12 || !memberGame.x12.some((v) => v > 0)) {
        continue;
      }
      const visitorGame = visitorById.get(memberGame.id);
      expect(visitorGame).toBeDefined();

      const hasPromoOpen = visitorGame!.picks.some(
        (pk) => Boolean(pk.isDailyOpenPromo) || Boolean(pk.isTipsterWeeklyOpen),
      );
      if (hasPromoOpen) continue;

      if (isZeroX12(visitorGame!.x12)) {
        nonShowcaseRedacted.push(visitorGame!);
        expect(visitorGame!.x12).toEqual([0, 0, 0]);
        if (memberGame.projection) {
          expect(visitorGame!.projection).toEqual({ home: 0, away: 0, total: 0 });
        }
        expect(visitorGame!.parlayCandidates).toBeUndefined();
        expect(visitorGame!.preGame.isRedacted).toBe(true);
        for (const pk of visitorGame!.picks) {
          expect(pk.isRedacted).toBe(true);
          expect(pk.p).toBe(0);
          expect(pk.fairDecimal).toBe(0);
          expect(pk.marketDecimal).toBeNull();
          expect(pk.edgePts).toBeNull();
        }
      } else {
        nonZeroByLeague.set(
          memberGame.league,
          (nonZeroByLeague.get(memberGame.league) ?? 0) + 1,
        );
      }
    }

    expect(nonShowcaseRedacted.length).toBeGreaterThan(0);
    for (const count of nonZeroByLeague.values()) {
      expect(count).toBeLessThanOrEqual(1);
    }
  });

  it("GET /api/live/games/[gameId] omite inPlayWinProb cuando !access.fullAccess y usa Cache-Control: private, no-store para socios", async () => {
    // 1) Visitante anónimo (!fullAccess): jamás recibe `inPlayWinProb` ni lo filtra en caché pública.
    mocks.getLiveMatchDetail.mockResolvedValueOnce(SAMPLE_LIVE_DETAIL);
    mocks.getViewerAccess.mockResolvedValueOnce(ACCESS_NONE);
    const anonRes = await liveGameGET(
      new Request("http://localhost:9990/api/live/games/mx-2026-live-sec-test"),
      { params: Promise.resolve({ gameId: "mx-2026-live-sec-test" }) },
    );
    expect(anonRes.status).toBe(200);
    expect(anonRes.headers.get("Cache-Control")).toBe(
      "public, s-maxage=10, stale-while-revalidate=20",
    );
    const anonBody = (await anonRes.json()) as Record<string, unknown>;
    expect("inPlayWinProb" in anonBody).toBe(false);
    expect(anonBody.gameId).toBe(SAMPLE_LIVE_DETAIL.gameId);

    // 2) Cuenta iniciada sin Pase vigente (!fullAccess): también omite `inPlayWinProb`.
    mocks.getLiveMatchDetail.mockResolvedValueOnce(SAMPLE_LIVE_DETAIL);
    mocks.getViewerAccess.mockResolvedValueOnce(ACCESS_VISITOR_SESSION);
    const noPassRes = await liveGameGET(
      new Request("http://localhost:9990/api/live/games/mx-2026-live-sec-test"),
      { params: Promise.resolve({ gameId: "mx-2026-live-sec-test" }) },
    );
    expect(noPassRes.status).toBe(200);
    const noPassBody = (await noPassRes.json()) as Record<string, unknown>;
    expect("inPlayWinProb" in noPassBody).toBe(false);

    // 3) Socio con Pase activo (fullAccess): incluye `inPlayWinProb` con `Cache-Control: private, no-store`.
    mocks.getLiveMatchDetail.mockResolvedValueOnce(SAMPLE_LIVE_DETAIL);
    mocks.getViewerAccess.mockResolvedValueOnce(ACCESS_MEMBER);
    const memberRes = await liveGameGET(
      new Request("http://localhost:9990/api/live/games/mx-2026-live-sec-test"),
      { params: Promise.resolve({ gameId: "mx-2026-live-sec-test" }) },
    );
    expect(memberRes.status).toBe(200);
    expect(memberRes.headers.get("Cache-Control")).toBe("private, no-store");
    const memberBody = (await memberRes.json()) as LiveMatchDetail;
    expect(memberBody.inPlayWinProb).toEqual(SAMPLE_LIVE_DETAIL.inPlayWinProb);

    // 4) Partido terminado sin `inPlayWinProb` conserva caché terminal pública incluso para socios.
    mocks.getLiveMatchDetail.mockResolvedValueOnce({
      ...SAMPLE_LIVE_DETAIL,
      entry: { ...SAMPLE_LIVE_DETAIL.entry, phase: "final", clock: null, minute: null },
      inPlayWinProb: null,
      nextPollSeconds: null,
    });
    mocks.getViewerAccess.mockResolvedValueOnce(ACCESS_MEMBER);
    const finalRes = await liveGameGET(
      new Request("http://localhost:9990/api/live/games/mx-2026-live-sec-test"),
      { params: Promise.resolve({ gameId: "mx-2026-live-sec-test" }) },
    );
    expect(finalRes.status).toBe(200);
    expect(finalRes.headers.get("Cache-Control")).toBe(
      "public, s-maxage=3600, stale-while-revalidate=86400",
    );

    // 5) ID inválido / path traversal rechazado con 400 antes de consultar el lector en vivo.
    mocks.getLiveMatchDetail.mockClear();
    const traversalRes = await liveGameGET(
      new Request("http://localhost:9990/api/live/games/bad"),
      { params: Promise.resolve({ gameId: "../../etc/passwd" }) },
    );
    expect(traversalRes.status).toBe(400);
    expect(mocks.getLiveMatchDetail).not.toHaveBeenCalled();
  });

  it("GET /api/compare devuelve 401 sin sesión, 400 con liga inválida o path traversal y 200 privado con liga válida", async () => {
    mocks.getViewerAccess.mockResolvedValueOnce(ACCESS_NONE);
    const unauthRes = await compareGET(
      new Request("http://localhost:9990/api/compare?modo=equipos&liga=liga-mx&a=america&b=chivas"),
    );
    expect(unauthRes.status).toBe(401);
    expect(await unauthRes.json()).toEqual({ error: "unauthorized" });

    const invalidLeagues = [
      "../../etc/passwd",
      "..%2F..%2Fetc%2Fpasswd",
      "liga-mx/../nba",
      "liga-inexistente",
      "..\\..\\windows\\system32",
    ];

    for (const badLeague of invalidLeagues) {
      for (const mode of ["equipos", "jugadores"] as const) {
        mocks.getViewerAccess.mockResolvedValueOnce(ACCESS_MEMBER);
        const badRes = await compareGET(
          new Request(
            `http://localhost:9990/api/compare?modo=${mode}&liga=${encodeURIComponent(badLeague)}&a=america&b=chivas`,
          ),
        );
        expect(badRes.status).toBe(400);
        expect(await badRes.json()).toEqual({ error: "Liga no válida" });
      }
    }

    mocks.getViewerAccess.mockResolvedValueOnce(ACCESS_MEMBER);
    const okRes = await compareGET(
      new Request("http://localhost:9990/api/compare?modo=equipos&liga=liga-mx&a=america&b=chivas"),
    );
    expect(okRes.status).toBe(200);
    expect(okRes.headers.get("Cache-Control")).toBe("private, no-store");
    const okBody = (await okRes.json()) as {
      teamComparison: { teamA: { slug: string }; teamB: { slug: string } } | null;
    };
    expect(okBody.teamComparison?.teamA.slug).toBe("america");
    expect(okBody.teamComparison?.teamB.slug).toBe("chivas");
  });
});
