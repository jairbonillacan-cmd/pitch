import { afterEach, describe, expect, it, vi } from "vitest";
import { asLeagueId } from "@pitchlab/contracts";
import type { PlatformGame } from "@pitchlab/ui/types";
import {
  auditCortexNarrativeV5,
  buildMatchDetailV5,
  deterministicVerifiedSummaryV5,
  evaluateLiveInPlaySoccerV5,
  evaluateSgpCopulaV5,
  resolveRefereePriorV5,
} from "../src/server/spacetime-v5";
import { resetRateLimitsForTests } from "../src/server/request-security";
import type { ViewerAccess } from "../src/server/viewer-access";
import { POST as sgpPost } from "../app/api/parlays/sgp/route";

const ACCESS_BETA_FULL: ViewerAccess = {
  via: "beta",
  signupComplete: true,
  fullAccess: true,
  isAdmin: false,
  isTipster: false,
  profile: null,
};

const ACCESS_NO_PASS: ViewerAccess = {
  via: "account",
  signupComplete: true,
  fullAccess: false,
  isAdmin: false,
  isTipster: false,
  profile: null,
};

const ACCESS_NONE: ViewerAccess = {
  via: "none",
  signupComplete: false,
  fullAccess: false,
  isAdmin: false,
  isTipster: false,
  profile: null,
};

const sgpViewerAccessMock = vi.fn().mockResolvedValue(ACCESS_BETA_FULL);
vi.mock("../src/server/viewer-access", () => ({
  getViewerAccess: () => sgpViewerAccessMock(),
}));

afterEach(() => {
  sgpViewerAccessMock.mockReset();
  sgpViewerAccessMock.mockResolvedValue(ACCESS_BETA_FULL);
  resetRateLimitsForTests();
});

function makeGame(overrides: Partial<PlatformGame> = {}): PlatformGame {
  return {
    id: "test-game-v5",
    league: asLeagueId("premier-league"),
    leagueLabel: "Premier League",
    sport: "football",
    round: "Jornada 22",
    dayId: "2026-11-22",
    dayLabel: "dom 22 nov",
    kickoffUtc: "2026-11-22T18:00:00Z",
    kickoffLocal: "12:00",
    venue: "Anfield",
    referee: "Michael Oliver",
    status: "NS",
    home: {
      slug: "liverpool",
      name: "Liverpool",
      shortName: "Liverpool",
      code: "LIV",
      record: "14-4-3",
    },
    away: {
      slug: "arsenal",
      name: "Arsenal",
      shortName: "Arsenal",
      code: "ARS",
      record: "13-5-3",
    },
    hasForecast: true,
    x12: [0.46, 0.27, 0.27],
    projection: { home: 1.55, away: 1.15, total: 2.7 },
    goalLine: { line: 2.5, pOver: 0.54 },
    confidenceScore: 76,
    confidenceLevel: "alta",
    picks: [],
    preGame: {
      cortexSynthesis: "",
      tacticalKeys: [],
      lineupStatusLabel: "XI probable",
      lineupsConfirmed60m: false,
      absences: [],
      moneyFlow: null,
    },
    markets: [],
    factors: [],
    headToHead: [],
    updatedAtLabel: "2026-11-19",
    spacetime: null,
    ...overrides,
  };
}

describe("spacetime-v5 · Puente servidor Spacetime Suite v5.1 → UI", () => {
  it("resuelve árbitros por nombre completo contra official_priors_v5_1.json (839 perfiles)", () => {
    const oliver = resolveRefereePriorV5("Michael Oliver", "E0");
    expect(oliver).not.toBeNull();
    expect(oliver!.key).toBe("m oliver");
    expect(oliver!.games).toBeGreaterThan(0);
    expect(oliver!.cardsMultiplier).toBeGreaterThan(0.5);
    expect(oliver!.cardsMultiplier).toBeLessThan(2.0);
  });

  it("construye bandas 90 %, pago anticipado +2 goles, micro-mercados con árbitro y mitades 1T/2T en fútbol", () => {
    const res = buildMatchDetailV5(makeGame({ league: asLeagueId("mls"), leagueLabel: "MLS" }), {
      hasV32Outlook: false,
      existingMarkets: [],
    });
    expect(res).not.toBeNull();
    const { v5, extraMarkets, fallbackOutlook } = res!;

    expect(v5.epistemic.home.pLower90).toBeLessThanOrEqual(v5.epistemic.home.pPoint);
    expect(v5.epistemic.home.pPoint).toBeLessThanOrEqual(v5.epistemic.home.pUpper90);
    expect(v5.epistemic.draw).not.toBeNull();

    expect(v5.earlyPayout).not.toBeNull();
    expect(v5.earlyPayout!.triggerLabel).toContain("+2");
    expect(v5.earlyPayout!.homeWinProb).toBeGreaterThanOrEqual(0.45);
    expect(v5.earlyPayout!.homeLiftPts).toBeGreaterThan(0);

    expect(v5.microCounts?.corners?.total).toBeGreaterThan(4);
    expect(v5.microCounts?.yellowCards?.total).toBeGreaterThan(1);
    expect(v5.microCounts?.refereeProfile?.name).toBe("Michael Oliver");
    expect(extraMarkets.some((m) => m.market === "red_cards")).toBe(true);
    expect(extraMarkets.some((m) => m.market === "booking_points")).toBe(true);
    expect(extraMarkets.some((m) => m.market === "sot_total")).toBe(true);
    expect(extraMarkets.some((m) => m.market === "ht_1x2")).toBe(true);
    expect(extraMarkets.some((m) => m.market === "2h_1x2")).toBe(true);

    expect(fallbackOutlook).not.toBeNull();
    expect(fallbackOutlook!.scorelines.length).toBeGreaterThan(0);

    expect(v5.guardrailPassed).toBe(true);
    expect(v5.verifiedSummaryEs.length).toBeGreaterThan(20);
  });

  it("construye especiales de NFL (Overtime, margen ±3 y pago anticipado +17 pts)", () => {
    const nflGame = makeGame({
      id: "nfl-kc-buf",
      league: asLeagueId("nfl"),
      leagueLabel: "NFL",
      sport: "american-football",
      referee: undefined,
      home: { slug: "chiefs", name: "Kansas City Chiefs", shortName: "Chiefs", code: "KC", record: "9-2" },
      away: { slug: "bills", name: "Buffalo Bills", shortName: "Bills", code: "BUF", record: "8-3" },
      x12: [0.58, 0, 0.42],
      projection: { home: 25.4, away: 21.8, total: 47.2 },
    });
    const res = buildMatchDetailV5(nflGame, { hasV32Outlook: true });
    expect(res).not.toBeNull();
    expect(res!.v5.nflSpecials).not.toBeNull();
    expect(res!.v5.nflSpecials!.pOvertime).toBeGreaterThan(0.02);
    expect(res!.v5.earlyPayout?.triggerLabel).toContain("+17");
    expect(res!.extraMarkets.some((m) => m.market === "nfl_ot")).toBe(true);
  });

  it("construye mercados multideporte MLB (F5) y NHL (Puck Line -1.5)", () => {
    const mlbRes = buildMatchDetailV5(
      makeGame({
        id: "mlb-nyy-lad",
        league: asLeagueId("mlb"),
        leagueLabel: "MLB",
        sport: "baseball",
        referee: undefined,
        home: { slug: "yankees", name: "New York Yankees", shortName: "Yankees", code: "NYY", record: "50-35" },
        away: { slug: "dodgers", name: "Los Angeles Dodgers", shortName: "Dodgers", code: "LAD", record: "52-33" },
        x12: [0.52, 0, 0.48],
        projection: { home: 4.5, away: 4.2, total: 8.7 },
      }),
      { hasV32Outlook: false },
    );
    expect(mlbRes?.v5.multisportSpecials?.sport).toBe("mlb");
    expect(mlbRes?.extraMarkets.some((m) => m.market === "mlb_f5")).toBe(true);

    const nhlRes = buildMatchDetailV5(
      makeGame({
        id: "nhl-tor-bos",
        league: asLeagueId("nhl"),
        leagueLabel: "NHL",
        sport: "ice-hockey",
        referee: undefined,
        home: { slug: "maple-leafs", name: "Toronto Maple Leafs", shortName: "Maple Leafs", code: "TOR", record: "20-10" },
        away: { slug: "bruins", name: "Boston Bruins", shortName: "Bruins", code: "BOS", record: "18-12" },
        x12: [0.54, 0, 0.46],
        projection: { home: 3.1, away: 2.7, total: 5.8 },
      }),
      { hasV32Outlook: false },
    );
    expect(nhlRes?.v5.multisportSpecials?.sport).toBe("nhl");
    expect(nhlRes?.extraMarkets.some((m) => m.market === "nhl_puckline")).toBe(true);
  });

  it("recalcula probabilidad en vivo con minuto, marcador y expulsiones", () => {
    const live = evaluateLiveInPlaySoccerV5({
      pregameMuHome: 1.5,
      pregameMuAway: 1.2,
      currentMinute: 70,
      currentHomeGoals: 1,
      currentAwayGoals: 0,
      redCardsHome: 0,
      redCardsAway: 1,
    });
    expect(live.minute).toBe(70);
    expect(live.pHome).toBeGreaterThan(0.75);
    expect(live.pHome + (live.pDraw ?? 0) + live.pAway).toBeCloseTo(1, 2);
    expect((live.pNextGoalHome ?? 0) + (live.pNextGoalAway ?? 0) + (live.pNoMoreGoals ?? 0)).toBeCloseTo(1, 2);
  });

  it("evalúa Cópula Student-t SGP y audita sobrecargo vía ruta POST /api/parlays/sgp con withActivePaseMutation", async () => {
    const direct = evaluateSgpCopulaV5({
      sport: "soccer",
      legs: [
        { legId: "l1", factor: "total_goals", marginalProbability: 0.55, direction: 1 },
        { legId: "l2", factor: "total_shots_on_target", marginalProbability: 0.55, direction: 1 },
      ],
      offeredCombinedDecimalOdds: 1.85,
    });
    expect(direct.correlationDirection).toBe("positively_correlated");
    expect(direct.jointProbability).toBeGreaterThan(direct.independentProbability);
    expect(direct.bookQuoteAudit?.taxFlag).toBe("severe_sgp_tax");

    const req = new Request("http://localhost:9990/api/parlays/sgp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:9990",
      },
      body: JSON.stringify({
        sport: "soccer",
        legs: [
          { legId: "l1", factor: "total_goals", marginalProbability: 0.55, direction: 1 },
          { legId: "l2", factor: "total_shots_on_target", marginalProbability: 0.55, direction: 1 },
        ],
        offeredCombinedDecimalOdds: 1.85,
      }),
    });
    const res = await sgpPost(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const json = (await res.json()) as { audit: typeof direct };
    expect(json.audit.jointProbability).toBeCloseTo(direct.jointProbability, 4);
    expect(json.audit.bookQuoteAudit?.taxFlag).toBe("severe_sgp_tax");

    const badReq = new Request("http://localhost:9990/api/parlays/sgp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:9990",
      },
      body: JSON.stringify({
        sport: "soccer",
        legs: [{ legId: "only1", factor: "total_goals", marginalProbability: 0.5, direction: 1 }],
      }),
    });
    const badRes = await sgpPost(badReq);
    expect(badRes.status).toBe(400);
    const badBody = (await badRes.json()) as Record<string, unknown>;
    expect(badBody.code).toBe("INVALID_SGP_REQUEST");
    expect("issues" in badBody).toBe(false);

    const badOddsRes = await sgpPost(
      new Request("http://localhost:9990/api/parlays/sgp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:9990",
        },
        body: JSON.stringify({
          sport: "soccer",
          legs: [
            { legId: "l1", factor: "total_goals", marginalProbability: 0.55, direction: 1 },
            { legId: "l2", factor: "total_shots_on_target", marginalProbability: 0.55, direction: 1 },
          ],
          offeredCombinedDecimalOdds: "not-a-number",
        }),
      }),
    );
    expect(badOddsRes.status).toBe(400);

    const crossOriginReq = new Request("http://localhost:9990/api/parlays/sgp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sport: "soccer", legs: [] }),
    });
    expect((await sgpPost(crossOriginReq)).status).toBe(403);

    sgpViewerAccessMock.mockResolvedValueOnce(ACCESS_NONE);
    const unauthRes = await sgpPost(
      new Request("http://localhost:9990/api/parlays/sgp", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:9990" },
        body: JSON.stringify({ sport: "soccer", legs: [] }),
      }),
    );
    expect(unauthRes.status).toBe(401);
    expect(unauthRes.headers.get("Cache-Control")).toBe("private, no-store");

    sgpViewerAccessMock.mockResolvedValueOnce(ACCESS_NO_PASS);
    const noPassRes = await sgpPost(
      new Request("http://localhost:9990/api/parlays/sgp", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:9990" },
        body: JSON.stringify({
          sport: "soccer",
          legs: [
            { legId: "l1", factor: "total_goals", marginalProbability: 0.55, direction: 1 },
            { legId: "l2", factor: "total_shots_on_target", marginalProbability: 0.55, direction: 1 },
          ],
        }),
      }),
    );
    expect(noPassRes.status).toBe(403);
    expect(await noPassRes.json()).toEqual({ ok: false, error: "pase_requerido" });
  });

  it("detecta promesas prohibidas y genera síntesis determinista verificada para Cortex IA", () => {
    const game = makeGame();
    const summary = deterministicVerifiedSummaryV5(game);
    expect(summary).not.toBeNull();
    expect(auditCortexNarrativeV5(game, summary!).passed).toBe(true);

    const bad = auditCortexNarrativeV5(game, "Liverpool es 100% seguro, métele 5 unidades sin riesgo.");
    expect(bad.passed).toBe(false);
    expect(bad.reasons.length).toBeGreaterThan(0);
  });
});
