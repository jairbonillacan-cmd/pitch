import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import { asLeagueId } from "@pitchlab/contracts";
import {
  projectNflMarketSpreadPosteriorV5,
  projectNflSpreadFromMarginPmfExact,
  solveDiagonalInflatedScoreMatrix4Param,
  solveNflKeyNumberMarginPmfExact,
  summarizeSoccerMarketsFromMatrixV4,
  type NflModelArtifactV5,
} from "@pitchlab/spacetime/v5";
import type { PlatformGame, PlatformMarketRow } from "@pitchlab/ui/types";
import {
  auditCortexNarrativeV5,
  buildMatchDetailV5,
  deterministicVerifiedSummaryV5,
  evaluateLiveInPlayNflV5,
  evaluateLiveInPlaySoccerV5,
  evaluatePlayerLinkedSgpCopulaV5,
  evaluateSgpCopulaV5,
  extractNflMarketContextV5,
  projectSoccerPlayerPropV5,
  resolveRefereePriorV5,
  resolveSoccerGoalsParamsV5,
  type KnockoutLegTypeV5,
  type LineupStatusV36,
  type SoccerPlayerPropInputV4,
  type SoccerPositionCluster,
  type SoccerPropFamilyV4,
} from "../src/server/spacetime-v5";
import { resetRateLimitsForTests } from "../src/server/request-security";
import type { ViewerAccess } from "../src/server/viewer-access";
import { POST as sgpPost } from "../app/api/parlays/sgp/route";

const SPACETIME_DATA_ROOT = resolve(import.meta.dirname, "../../../packages/spacetime/data");

function readSpacetimeData<T>(filename: string): T {
  const parsed: T = JSON.parse(readFileSync(resolve(SPACETIME_DATA_ROOT, filename), "utf8"));
  return parsed;
}

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

function makeMarketRow(overrides: Partial<PlatformMarketRow>): PlatformMarketRow {
  return {
    group: "Mercado",
    market: "spread",
    selection: "home",
    label: "Local",
    line: -3.5,
    p: 0.52,
    fairDecimal: 1.92,
    fairAmerican: -109,
    openDecimal: 1.91,
    currentDecimal: 1.91,
    edgePts: null,
    isDerived: false,
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

describe("spacetime-v5 · Cierre de brechas v5.1 (A2–A6 + anclaje multideporte)", () => {
  it("A2: carga rhoPrior y dispersionR dinámicos desde artefactos reales (clubes vs selecciones) con paridad < 1e-12", () => {
    const club = resolveSoccerGoalsParamsV5("premier-league");
    expect(club).toEqual({
      scope: "club",
      rhoPrior: -0.105,
      dispersionR: 500,
      rhoDrawBlendWeight: 0,
    });
    expect(resolveSoccerGoalsParamsV5("liga-mx")).toEqual(club);
    expect(resolveSoccerGoalsParamsV5("champions-league")).toEqual(club);
    expect(resolveSoccerGoalsParamsV5("mls")).toEqual(club);

    const intl = resolveSoccerGoalsParamsV5("copa-del-mundo");
    expect(intl).toEqual({
      scope: "international",
      rhoPrior: -0.1,
      dispersionR: 24,
      rhoDrawBlendWeight: 0,
    });
    expect(resolveSoccerGoalsParamsV5("copa-america")).toEqual(intl);
    expect(resolveSoccerGoalsParamsV5("eliminatorias")).toEqual(intl);

    const snap = readSpacetimeData<{
      readonly rows: ReadonlyArray<{
        readonly python_ensemble_probs: readonly [number, number, number];
        readonly python_t_hat: number;
        readonly python_p_over_2_5: number;
        readonly python_p_btts_yes: number;
      }>;
    }>("soccer_v5_0_global_snapshot.json");

    for (const row of snap.rows.slice(0, 20)) {
      const [pH, pD, pA] = row.python_ensemble_probs;
      const sol4 = solveDiagonalInflatedScoreMatrix4Param({
        pHome: pH,
        pDraw: pD,
        pAway: pA,
        totalGoalsTarget: row.python_t_hat,
        rhoPrior: club.rhoPrior,
        dispersionR: club.dispersionR,
        rhoDrawBlendWeight: club.rhoDrawBlendWeight,
      });
      const mk = summarizeSoccerMarketsFromMatrixV4(sol4.matrix);
      expect(Math.abs(mk.pHome - pH)).toBeLessThan(1e-12);
      expect(Math.abs(mk.pDraw - pD)).toBeLessThan(1e-12);
      expect(Math.abs(mk.pAway - pA)).toBeLessThan(1e-12);
      expect(Math.abs(mk.pOver25 - row.python_p_over_2_5)).toBeLessThan(1e-12);
      expect(Math.abs(mk.pBttsYes - row.python_p_btts_yes)).toBeLessThan(1e-12);
    }

    const intlDetail = buildMatchDetailV5(
      makeGame({
        id: "intl-mex-usa",
        league: asLeagueId("copa-del-mundo"),
        leagueLabel: "Copa del Mundo FIFA",
        home: { slug: "mexico", name: "México", shortName: "México", code: "MEX", record: "6-2-1" },
        away: { slug: "usa", name: "Estados Unidos", shortName: "EE. UU.", code: "USA", record: "5-3-1" },
      }),
      { hasV32Outlook: false },
    );
    expect(intlDetail).not.toBeNull();
    expect(intlDetail!.v5.guardrailPassed).toBe(true);
    expect(intlDetail!.v5.earlyPayout!.homeWinProb).toBeGreaterThanOrEqual(0.46);
  });

  it("A3: cablea projectNflMarketSpreadPosteriorV5, marketTotalLine e isIndoor/isTurf desde mercados y estadio", () => {
    const nflGame = makeGame({
      id: "nfl-det-gb-v51",
      league: asLeagueId("nfl"),
      leagueLabel: "NFL",
      sport: "american-football",
      venue: "Ford Field",
      referee: undefined,
      home: { slug: "lions", name: "Detroit Lions", shortName: "Lions", code: "DET", record: "11-2" },
      away: { slug: "packers", name: "Green Bay Packers", shortName: "Packers", code: "GB", record: "9-4" },
      x12: [0.62, 0, 0.38],
      projection: { home: 26.8, away: 22.7, total: 49.5 },
      markets: [
        makeMarketRow({ market: "spread", selection: "home_-3.5", line: -3.5, currentDecimal: 1.91 }),
        makeMarketRow({ market: "totals", selection: "over_47.5", line: 47.5, currentDecimal: 1.91 }),
      ],
    });

    const ctx = extractNflMarketContextV5(nflGame);
    expect(ctx).toEqual({
      marketSpreadHome: -3.5,
      marketTotalLine: 47.5,
      isIndoor: true,
      isTurf: true,
    });

    const outdoorCtx = extractNflMarketContextV5(
      makeGame({
        id: "nfl-kc-buf-outdoor",
        league: asLeagueId("nfl"),
        sport: "american-football",
        venue: "GEHA Field at Arrowhead Stadium",
        home: { slug: "chiefs", name: "Kansas City Chiefs", shortName: "Chiefs", code: "KC", record: "10-2" },
        away: { slug: "bills", name: "Buffalo Bills", shortName: "Bills", code: "BUF", record: "9-3" },
        markets: [
          makeMarketRow({ market: "spreads", selection: "away_+2.5", line: 2.5, currentDecimal: 1.93 }),
          makeMarketRow({ market: "spread", selection: "home_-7.5", line: -7.5, isDerived: true, currentDecimal: null }),
        ],
      }),
    );
    expect(outdoorCtx.marketSpreadHome).toBe(-2.5);
    expect(outdoorCtx.isIndoor).toBe(false);
    expect(outdoorCtx.isTurf).toBe(false);

    const res = buildMatchDetailV5(nflGame, { hasV32Outlook: true });
    expect(res).not.toBeNull();
    expect(res!.v5.guardrailPassed).toBe(true);

    const homeSpreadRow = res!.extraMarkets.find(
      (m) => m.market === "nfl_spread_posterior" && m.selection === "home",
    );
    const awaySpreadRow = res!.extraMarkets.find(
      (m) => m.market === "nfl_spread_posterior" && m.selection === "away",
    );
    const overTotalRow = res!.extraMarkets.find(
      (m) => m.market === "nfl_total_posterior" && m.selection === "over",
    );
    const underTotalRow = res!.extraMarkets.find(
      (m) => m.market === "nfl_total_posterior" && m.selection === "under",
    );

    expect(homeSpreadRow).toBeDefined();
    expect(awaySpreadRow).toBeDefined();
    expect(homeSpreadRow!.line).toBe(-3.5);
    expect(awaySpreadRow!.line).toBe(3.5);
    expect(homeSpreadRow!.p + awaySpreadRow!.p).toBeCloseTo(1, 3);

    expect(overTotalRow).toBeDefined();
    expect(underTotalRow).toBeDefined();
    expect(overTotalRow!.line).toBe(47.5);
    expect(overTotalRow!.p + underTotalRow!.p).toBeCloseTo(1, 3);

    const nflArt = readSpacetimeData<NflModelArtifactV5>("model_nfl_v5_0_candidate.json");
    fc.assert(
      fc.property(
        fc.double({ min: -14, max: 14, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.5, max: 6.0, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: -10.5, max: 10.5, noNaN: true, noDefaultInfinity: true }),
        (baseMargin, deltaMargin, marketSpread) => {
          const pLo = projectNflMarketSpreadPosteriorV5({
            modelExpectedMargin: baseMargin,
            marketSpreadHome: marketSpread,
            artifact: nflArt,
          });
          const pHi = projectNflMarketSpreadPosteriorV5({
            modelExpectedMargin: baseMargin + deltaMargin,
            marketSpreadHome: marketSpread,
            artifact: nflArt,
          });
          expect(pHi.pHomeCoverNoPush).toBeGreaterThanOrEqual(pLo.pHomeCoverNoPush - 1e-12);
        },
      ),
      { numRuns: 50 },
    );

    const sol50 = solveNflKeyNumberMarginPmfExact({
      pHome: 0.498,
      pTie: 0.004,
      pAway: 0.498,
      artifact: {
        ...nflArt,
        totals_calibration: {
          sigma_game_physical: 13.4,
          market_posterior_w_model: nflArt.discrete_totals_v5.market_posterior_w_model,
          sigma_market_posterior: 13.4,
        },
      },
    });
    const covMinus7 = projectNflSpreadFromMarginPmfExact(sol50, -7.0);
    const covMinus3 = projectNflSpreadFromMarginPmfExact(sol50, -3.0);
    const covPlus3 = projectNflSpreadFromMarginPmfExact(sol50, 3.0);
    expect(covMinus7.pHomeCoverNoPush).toBeLessThan(covMinus3.pHomeCoverNoPush);
    expect(covMinus3.pHomeCoverNoPush).toBeLessThan(covPlus3.pHomeCoverNoPush);
  });

  it("A4: ancla evaluateLiveInPlaySoccerV5 a coreP* prepartido y expone evaluateLiveInPlayNflV5 con paridad snapshot", () => {
    const snap = readSpacetimeData<{
      readonly soccer_cases: ReadonlyArray<{
        readonly input: {
          readonly pregameMuHome: number;
          readonly pregameMuAway: number;
          readonly currentMinute: number;
          readonly currentHomeGoals: number;
          readonly currentAwayGoals: number;
          readonly redCardsHome: number;
          readonly redCardsAway: number;
          readonly corePHome?: number;
          readonly corePDraw?: number;
          readonly corePAway?: number;
        };
        readonly expected: {
          readonly p_home: number;
          readonly p_draw: number;
          readonly p_away: number;
          readonly expected_final_total: number;
        };
      }>;
      readonly nfl_live_cases: ReadonlyArray<{
        readonly seconds_remaining: number;
        readonly home_score: number;
        readonly away_score: number;
        readonly pregame_exp_margin: number;
        readonly pregame_exp_total: number;
        readonly possession: "home" | "away" | "neutral";
        readonly expected: {
          readonly live_expected_margin: number;
          readonly live_expected_total: number;
          readonly p_home_win_live: number;
        };
      }>;
    }>("inplay_early_payout_v5_0_snapshot.json");

    for (const sc of snap.soccer_cases) {
      const out = evaluateLiveInPlaySoccerV5(sc.input);
      expect(Math.abs(out.pHome - sc.expected.p_home)).toBeLessThanOrEqual(0.0002);
      expect(Math.abs((out.pDraw ?? 0) - sc.expected.p_draw)).toBeLessThanOrEqual(0.0002);
      expect(Math.abs(out.pAway - sc.expected.p_away)).toBeLessThanOrEqual(0.0002);
      expect(
        Math.abs((out.expectedFinalTotal ?? 0) - sc.expected.expected_final_total),
      ).toBeLessThanOrEqual(0.011);
    }

    for (const lc of snap.nfl_live_cases) {
      const nflLive = evaluateLiveInPlayNflV5({
        secondsRemaining: lc.seconds_remaining,
        homeScore: lc.home_score,
        awayScore: lc.away_score,
        pregameExpectedMargin: lc.pregame_exp_margin,
        pregameExpectedTotal: lc.pregame_exp_total,
        possession: lc.possession,
      });
      expect(nflLive.pDraw).toBeNull();
      expect(nflLive.fairDrawDecimal).toBeNull();
      expect(nflLive.pHome + nflLive.pAway).toBeCloseTo(1, 3);
      expect(Math.abs(nflLive.pHome - lc.expected.p_home_win_live)).toBeLessThanOrEqual(0.0002);
      expect(
        Math.abs(nflLive.liveExpectedFinalMargin - lc.expected.live_expected_margin),
      ).toBeLessThanOrEqual(0.011);
      expect(
        Math.abs(nflLive.liveExpectedFinalTotal - lc.expected.live_expected_total),
      ).toBeLessThanOrEqual(0.011);
    }

    const blowoutHome = evaluateLiveInPlayNflV5({
      secondsRemaining: 900,
      homeScore: 27,
      awayScore: 7,
      pregameExpectedMargin: 3.0,
      pregameExpectedTotal: 45.0,
      possession: "away",
    });
    expect(blowoutHome.earlyPayout17AlreadyTriggeredHome).toBe(true);
    expect(blowoutHome.earlyPayout17AlreadyTriggeredAway).toBe(false);
  });

  it("A5: expone evaluatePlayerLinkedSgpCopulaV5 (Raikov + Dixon-Coles rho=-0.08) con paridad y auditoría", () => {
    const snap = readSpacetimeData<{
      readonly player_linked_cases: ReadonlyArray<{
        readonly input: {
          readonly pPlayerAnytimeGoal: number;
          readonly teamExpectedGoals: number;
          readonly opponentExpectedGoals: number;
          readonly teamOutcome: "team_win" | "team_win_or_draw" | "any";
          readonly matchTotalOverLine: number | null;
          readonly dixonColesRho?: number;
        };
        readonly expected: {
          readonly independent_probability: number;
          readonly joint_probability: number;
          readonly structural_lift_multiplier: number;
        };
      }>;
    }>("sgp_copula_v5_0_snapshot.json");

    for (const pc of snap.player_linked_cases) {
      const out = evaluatePlayerLinkedSgpCopulaV5(pc.input);
      expect(Math.abs(out.independentProbability - pc.expected.independent_probability)).toBeLessThanOrEqual(
        0.0002,
      );
      expect(Math.abs(out.jointProbability - pc.expected.joint_probability)).toBeLessThanOrEqual(
        0.0002,
      );
      expect(
        Math.abs(out.structuralLiftMultiplier - pc.expected.structural_lift_multiplier),
      ).toBeLessThanOrEqual(0.0005);
    }

    const audited = evaluatePlayerLinkedSgpCopulaV5({
      pPlayerAnytimeGoal: 0.42,
      teamExpectedGoals: 1.85,
      opponentExpectedGoals: 0.95,
      teamOutcome: "team_win",
      matchTotalOverLine: 2.5,
      offeredCombinedDecimalOdds: 2.1,
    });
    expect(audited.dixonColesRhoUsed).toBeCloseTo(-0.08, 6);
    expect(audited.jointProbability).toBeGreaterThan(audited.independentProbability);
    expect(audited.jointProbability).toBeLessThanOrEqual(audited.pPlayerScores);
    expect(audited.bookQuoteAudit).not.toBeNull();
    expect(audited.bookQuoteAudit!.offeredDecimal).toBe(2.1);
  });

  it("A6: expone projectSoccerPlayerPropV5 con paridad < 1e-12, 3 regímenes de minutos, knockout 90' y fast-check", () => {
    const snap = readSpacetimeData<{
      readonly rows: ReadonlyArray<{
        readonly input: SoccerPlayerPropInputV4;
        readonly expected: {
          readonly lambda_eb_per90: number;
          readonly expected_minutes: number;
          readonly p_over_raw: number;
          readonly p_over_calibrated: number;
          readonly p_over_sub_cover: number;
        };
      }>;
    }>("hierarchical_props_v5_0_snapshot.json");

    expect(snap.rows.length).toBe(72);
    for (const row of snap.rows) {
      const out = projectSoccerPlayerPropV5(row.input);
      expect(Math.abs(out.lambdaEbPer90 - row.expected.lambda_eb_per90)).toBeLessThan(1e-12);
      expect(Math.abs(out.expectedMinutes - row.expected.expected_minutes)).toBeLessThan(1e-12);
      expect(Math.abs(out.pOverRaw - row.expected.p_over_raw)).toBeLessThan(1e-12);
      expect(Math.abs(out.pOverCalibrated - row.expected.p_over_calibrated)).toBeLessThan(1e-12);
      expect(Math.abs(out.pOverSubCover - row.expected.p_over_sub_cover)).toBeLessThan(1e-12);
    }

    const statuses: readonly LineupStatusV36[] = [
      "confirmed_starter",
      "projected_starter",
      "doubt",
      "bench",
    ];
    const minutesByStatus = statuses.map(
      (lineupStatus) =>
        projectSoccerPlayerPropV5({
          propFamily: "shots_on_target",
          posCluster: "FW_CF",
          weightedSumY: 14,
          weightedExposure90: 10,
          lineupStatus,
          line: 0.5,
        }).expectedMinutes,
    );
    expect(minutesByStatus[0]!).toBeGreaterThan(minutesByStatus[1]!);
    expect(minutesByStatus[1]!).toBeGreaterThan(minutesByStatus[2]!);
    expect(minutesByStatus[2]!).toBeGreaterThan(minutesByStatus[3]!);

    const legs: readonly KnockoutLegTypeV5[] = ["first_leg", "none", "single_final", "second_leg"];
    const koProbs = legs.map(
      (knockoutLegType) =>
        projectSoccerPlayerPropV5({
          propFamily: "goals",
          posCluster: "FW_CF",
          weightedSumY: 9,
          weightedExposure90: 12,
          lineupStatus: "confirmed_starter",
          line: 0.5,
          knockoutLegType,
        }).pOverRaw,
    );
    expect(koProbs[0]!).toBeLessThan(koProbs[1]!);
    expect(koProbs[1]!).toBeLessThan(koProbs[2]!);
    expect(koProbs[2]!).toBeLessThan(koProbs[3]!);

    fc.assert(
      fc.property(
        fc.constantFrom<SoccerPropFamilyV4>(
          "goals",
          "assists",
          "goals_assists",
          "yellow_cards",
          "shots",
          "shots_on_target",
        ),
        fc.constantFrom<SoccerPositionCluster>(
          "GK",
          "DF_CB",
          "DF_FB",
          "MF_DM",
          "MF_CM",
          "MF_AM",
          "FW_W",
          "FW_CF",
        ),
        fc.double({ min: 0.2, max: 25.0, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 2.0, max: 30.0, noNaN: true, noDefaultInfinity: true }),
        (propFamily, posCluster, weightedSumY, weightedExposure90) => {
          const lowLine = projectSoccerPlayerPropV5({
            propFamily,
            posCluster,
            weightedSumY,
            weightedExposure90,
            line: 0.5,
          });
          const highLine = projectSoccerPlayerPropV5({
            propFamily,
            posCluster,
            weightedSumY,
            weightedExposure90,
            line: 1.5,
          });
          expect(lowLine.pOverCalibrated).toBeGreaterThan(0);
          expect(lowLine.pOverCalibrated).toBeLessThan(1);
          expect(lowLine.pOverSubCover).toBeGreaterThanOrEqual(lowLine.pOverCalibrated);
          expect(lowLine.pOverCalibrated).toBeGreaterThanOrEqual(highLine.pOverCalibrated - 1e-12);
        },
      ),
      { numRuns: 60 },
    );
  });

  it("A7: ancla MLB/NHL/NBA al game.x12 vivo y valida invariantes matemáticos preservando validatedOos=false", () => {
    const nbaHigh = buildMatchDetailV5(
      makeGame({
        id: "nba-bos-nyk-live",
        league: asLeagueId("nba"),
        leagueLabel: "NBA",
        sport: "basketball",
        referee: undefined,
        home: { slug: "celtics", name: "Boston Celtics", shortName: "Celtics", code: "BOS", record: "40-12" },
        away: { slug: "knicks", name: "New York Knicks", shortName: "Knicks", code: "NYK", record: "34-18" },
        x12: [0.68, 0, 0.32],
        projection: { home: 118.4, away: 110.2, total: 228.6 },
        goalLine: { line: 228.5, pOver: 0.51 },
      }),
      { hasV32Outlook: false },
    );
    const nbaLow = buildMatchDetailV5(
      makeGame({
        id: "nba-bos-nyk-live",
        league: asLeagueId("nba"),
        leagueLabel: "NBA",
        sport: "basketball",
        referee: undefined,
        home: { slug: "celtics", name: "Boston Celtics", shortName: "Celtics", code: "BOS", record: "40-12" },
        away: { slug: "knicks", name: "New York Knicks", shortName: "Knicks", code: "NYK", record: "34-18" },
        x12: [0.36, 0, 0.64],
        projection: { home: 109.1, away: 114.8, total: 223.9 },
        goalLine: { line: 224.5, pOver: 0.49 },
      }),
      { hasV32Outlook: false },
    );

    expect(nbaHigh).not.toBeNull();
    expect(nbaLow).not.toBeNull();
    expect(nbaHigh!.v5.epistemic.home.pPoint).toBeCloseTo(0.68, 3);
    expect(nbaLow!.v5.epistemic.home.pPoint).toBeCloseTo(0.36, 3);
    expect(nbaHigh!.v5.earlyPayout!.homeWinProb).toBeGreaterThanOrEqual(0.68);
    expect(nbaHigh!.v5.earlyPayout!.validatedOos).toBe(false);
    expect(nbaHigh!.fallbackOutlook!.mostLikely!.label).toContain("Boston Celtics");
    expect(nbaLow!.fallbackOutlook!.mostLikely!.label).toContain("New York Knicks");
    expect(nbaHigh!.v5.guardrailPassed).toBe(true);
    expect(nbaLow!.v5.guardrailPassed).toBe(true);

    const mlbLive = buildMatchDetailV5(
      makeGame({
        id: "mlb-nyy-lad-anchored",
        league: asLeagueId("mlb"),
        leagueLabel: "MLB",
        sport: "baseball",
        referee: undefined,
        home: { slug: "yankees", name: "New York Yankees", shortName: "Yankees", code: "NYY", record: "50-35" },
        away: { slug: "dodgers", name: "Los Angeles Dodgers", shortName: "Dodgers", code: "LAD", record: "52-33" },
        x12: [0.61, 0, 0.39],
        projection: { home: 4.8, away: 3.9, total: 8.7 },
        goalLine: { line: 8.5, pOver: 0.53 },
      }),
      { hasV32Outlook: false },
    );
    expect(mlbLive!.v5.epistemic.home.pPoint).toBeCloseTo(0.61, 3);
    expect(mlbLive!.v5.earlyPayout!.homeWinProb).toBeGreaterThanOrEqual(0.61);
    expect(mlbLive!.v5.earlyPayout!.validatedOos).toBe(false);
    expect(mlbLive!.v5.guardrailPassed).toBe(true);
    expect(mlbLive!.extraMarkets.some((m) => m.market === "mlb_f5")).toBe(true);
  });
});
