import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  asLeagueId,
  asMarketKey,
  containsForbiddenFd16Term,
  isSafePublicLabel,
  type MatchAnalysis,
} from "@pitchlab/contracts";
import type { PlatformGame } from "@pitchlab/ui/types";
import { POST as sgpPost } from "../app/api/parlays/sgp/route";
import {
  applyOutlook,
  buildV6SoccerOutlookDetail,
  calibrateOutlookPlayableProbV6,
  recalibrateSoccerOutlookV6,
} from "../src/server/outlook";
import {
  loadLeagueRefereeRanking,
  resetRefereesCacheForTests,
  resolveRefereeOfficialPrior,
} from "../src/server/referees";
import { resetRateLimitsForTests } from "../src/server/request-security";
import { buildMatchDetailV5, resolveRefereePriorV5 } from "../src/server/spacetime-v5";
import {
  buildUnifiedMatchIntelligenceServerV6,
  calibratePlayableOddsV6,
  computeBookingPointsServerV6,
  evaluateGoalkeeperSavesSgpServerV6,
  evaluateNflAltSpreadV6,
  evaluateNflAltTotalV6,
  evaluateNflMatchServerV6,
  evaluatePlayerLinkedSgpV6,
  evaluateSgpCopulaV6,
  evaluateSoccer57V6Match,
  evaluateUsEarlyPayoutV6,
  evaluateUsMultisportV6Match,
  getMultisportArtifactV6,
  getOfficialsFreezeArtifactV6,
  getPropsArtifactV6,
  getSoccer57ArtifactV6,
  getSpacetimeV6RegistrySummary,
  isEarlyPayoutValidatedOosV6,
  isSoccer57LeagueV6,
  PLAYABLE_ODDS_MAX_V60,
  PLAYABLE_ODDS_MIN_V60,
  projectSoccer57MatchServerV6,
  recalibrateSoccer57MatchServerV6,
  resolveMultiSportTeamCodeSafeV6,
  resolveOfficialPriorByDivV6,
  resolveOfficialPriorServerV6,
  SOCCER_57_LEAGUE_IDS_V6,
  tryProjectMultiSportFromStateV6,
} from "../src/server/spacetime-v6";
import type { ViewerAccess } from "../src/server/viewer-access";

const ACCESS_BETA_FULL: ViewerAccess = {
  via: "beta",
  signupComplete: true,
  fullAccess: true,
  isAdmin: false,
  isTipster: false,
  profile: null,
};

const viewerAccessMock = vi.fn().mockResolvedValue(ACCESS_BETA_FULL);
vi.mock("../src/server/viewer-access", () => ({
  getViewerAccess: () => viewerAccessMock(),
}));

const FORBIDDEN_BET_SIZING_KEYS = new Set([
  "stake",
  "stake_u",
  "recommendedStake",
  "kelly",
  "kellyFraction",
  "expectedEdge",
  "ev",
  "tier",
]);

function collectKeys(node: unknown, out: Set<string> = new Set()): Set<string> {
  if (node !== null && typeof node === "object") {
    if (Array.isArray(node)) {
      for (const item of node) collectKeys(item, out);
    } else {
      for (const [k, v] of Object.entries(node)) {
        out.add(k);
        collectKeys(v, out);
      }
    }
  }
  return out;
}

function makePlatformGame(overrides: Partial<PlatformGame> = {}): PlatformGame {
  return {
    id: "v6-test-game",
    league: asLeagueId("premier-league"),
    leagueLabel: "Premier League",
    sport: "football",
    round: "Jornada 18",
    dayId: "2026-11-24",
    dayLabel: "mar 24 nov",
    kickoffUtc: "2026-11-24T20:00:00Z",
    kickoffLocal: "14:00",
    venue: "Anfield",
    referee: "Michael Oliver",
    status: "NS",
    home: {
      slug: "liverpool",
      name: "Liverpool",
      shortName: "Liverpool",
      code: "LIV",
      record: "12-3-2",
    },
    away: {
      slug: "arsenal",
      name: "Arsenal",
      shortName: "Arsenal",
      code: "ARS",
      record: "11-4-2",
    },
    hasForecast: true,
    x12: [0.47, 0.27, 0.26],
    projection: { home: 1.58, away: 1.12, total: 2.7 },
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
    updatedAtLabel: "2026-11-23",
    spacetime: null,
    ...overrides,
  };
}

function makeNonV3SoccerMatch(
  league: Parameters<typeof asLeagueId>[0],
  leagueLabel: string,
  overrides: Partial<MatchAnalysis> = {},
): MatchAnalysis {
  return {
    id: `v6-match-${league}`,
    league: asLeagueId(league),
    leagueLabel,
    sport: "football",
    round: "Jornada 15",
    day: "2026-11-24",
    dayLabel: "martes",
    kickoffUtc: "2026-11-24T21:00:00Z",
    kickoffLocal: "15:00",
    venue: "Estadio Azteca",
    status: "NS",
    home: {
      slug: "club-america",
      name: "Club América",
      shortName: "América",
      code: "AME",
      record: "14 PJ",
    },
    away: {
      slug: "tigres-uanl",
      name: "Tigres UANL",
      shortName: "Tigres",
      code: "TIG",
      record: "14 PJ",
    },
    projection: { home: 1.68, away: 1.12, total: 2.8, margin: 0.56 },
    x12: [0.5, 0.26, 0.24],
    outcomes: [
      { key: "home", label: "Club América gana", probability: 0.5 },
      { key: "draw", label: "Empate", probability: 0.26 },
      { key: "away", label: "Tigres UANL gana", probability: 0.24 },
    ],
    marketGroups: [
      {
        group: "Tiros de esquina 9.5",
        rows: [
          {
            market: asMarketKey("corners_total"),
            selection: "over",
            label: "Más de 9.5",
            line: 9.5,
            p: 0.53,
            fairOdds: 1.89,
          },
        ],
      },
    ],
    factors: [],
    trace: [],
    ...overrides,
  };
}

function sameOriginSgpPost(body: unknown): Request {
  return new Request("http://localhost:9990/api/parlays/sgp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:9990",
    },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  viewerAccessMock.mockReset();
  viewerAccessMock.mockResolvedValue(ACCESS_BETA_FULL);
  resetRateLimitsForTests();
  resetRefereesCacheForTests();
});

describe("spacetime-v6 · Artefactos runtime y cobertura 53 ligas de fútbol", () => {
  it("carga únicamente artefactos runtime v6.0 y jamás importa snapshots de test/paridad", () => {
    const src = readFileSync(
      resolve(import.meta.dirname, "../src/server/spacetime-v6.ts"),
      "utf8",
    );
    expect(src).not.toContain("live_matchday_v6_candidate_snapshot.json");
    expect(src).not.toContain("_snapshot.json");

    const registry = getSpacetimeV6RegistrySummary();
    expect(registry.schemaVersion).toBe("candidate_registry_v6.0.0");
    expect(registry.activeArtifactsCount).toBeGreaterThanOrEqual(14);
    expect(registry.holdoutSealedUntouched).toBe(true);

    expect(Object.keys(getSoccer57ArtifactV6().competitions)).toHaveLength(53);
    expect(SOCCER_57_LEAGUE_IDS_V6).toHaveLength(53);
    expect(Object.keys(getOfficialsFreezeArtifactV6().competition_priors)).toHaveLength(53);
    expect(Object.keys(getOfficialsFreezeArtifactV6().v5_1_officials).length).toBeGreaterThanOrEqual(800);
    expect(Object.keys(getMultisportArtifactV6().teams_post_walkforward_state_2026 ?? {}).length).toBe(
      124,
    );
    expect(Object.keys(getPropsArtifactV6().us_props_v6)).toEqual(["nba", "mlb", "nhl", "nfl"]);
  });

  it("evalúa las 53 ligas de fútbol sin lanzar excepciones y protege ligas desconocidas", () => {
    for (const league of SOCCER_57_LEAGUE_IDS_V6) {
      expect(isSoccer57LeagueV6(league)).toBe(true);
      const rec = recalibrateSoccer57MatchServerV6({
        league,
        rawProjHome: 1.55,
        rawProjAway: 1.15,
        rawX12: [0.46, 0.27, 0.27],
      });
      expect(rec).not.toBeNull();
      const x12 = rec!.markets["1x2"];
      expect(x12.home + x12.draw + x12.away).toBeCloseTo(1, 9);
      expect(
        rec!.markets.double_chance["1X"] +
          rec!.markets.double_chance["12"] +
          rec!.markets.double_chance.X2,
      ).toBeCloseTo(2, 9);
      expect(rec!.markets.totals_1_5.over).toBeGreaterThan(rec!.markets.totals_2_5.over);
      expect(rec!.markets.totals_2_5.over).toBeGreaterThan(rec!.markets.totals_3_5.over);
      expect(rec!.markets.dnb.home + rec!.markets.dnb.away).toBeCloseTo(1, 9);
      expect(rec!.markets.btts.yes + rec!.markets.btts.no).toBeCloseTo(1, 9);
    }

    expect(isSoccer57LeagueV6("liga-fantasma-inexistente")).toBe(false);
    expect(
      recalibrateSoccer57MatchServerV6({
        league: "liga-fantasma-inexistente",
        rawProjHome: 1.5,
        rawProjAway: 1.1,
        rawX12: [0.45, 0.28, 0.27],
      }),
    ).toBeNull();
    expect(
      projectSoccer57MatchServerV6({
        league: "liga-fantasma-inexistente",
        homeElo: 1500,
        awayElo: 1500,
        homeAttEwm: 1.3,
        homeDefEwm: 1.3,
        homeGames: 10,
        awayAttEwm: 1.3,
        awayDefEwm: 1.3,
        awayGames: 10,
        leagueEnvGoals: 2.7,
        neutralSite: false,
      }),
    ).toBeNull();
  });

  it("deriva Hándicap Asiático, micro-mercados, +2 Goles Early Payout y calibración jugable [1.55, 2.60]", () => {
    const evalMx = evaluateSoccer57V6Match({
      matchId: "mx-ame-tig",
      league: "liga-mx",
      homeTeam: "Club América",
      awayTeam: "Tigres UANL",
      pHome: 0.48,
      pDraw: 0.27,
      pAway: 0.25,
      projectedHomeGoals: 1.62,
      projectedAwayGoals: 1.08,
      refereeName: "Michael Oliver",
      mode: "prekickoff_recalibration",
    });

    expect(evalMx.isRegisteredLeague).toBe(true);
    expect(evalMx.earlyPayout2Goals.pHomeEarlyPayoutWin).toBeGreaterThanOrEqual(
      evalMx.markets["1x2"].home,
    );
    expect(evalMx.earlyPayout2Goals.pAwayEarlyPayoutWin).toBeGreaterThanOrEqual(
      evalMx.markets["1x2"].away,
    );
    expect(evalMx.microMarkets.metrics.corners.muTotal).toBeGreaterThan(5);
    expect(evalMx.microMarkets.metrics.yellow_cards.muTotal).toBeGreaterThan(1.5);
    expect(evalMx.microMarkets.bookingPoints.expectedBookingPoints).toBeGreaterThan(15);

    const ahZero = evalMx.asianHandicap.find((a) => a.lineHome === 0);
    const ahMinusHalf = evalMx.asianHandicap.find((a) => a.lineHome === -0.5);
    const ahPlusHalf = evalMx.asianHandicap.find((a) => a.lineHome === 0.5);
    expect(ahZero).toBeDefined();
    expect(ahMinusHalf).toBeDefined();
    expect(ahPlusHalf).toBeDefined();
    expect(ahZero!.pHomeCover + ahZero!.pAwayCover + ahZero!.pPush).toBeCloseTo(1, 9);
    expect(ahZero!.pHomeCover).toBeCloseTo(evalMx.markets["1x2"].home, 9);
    expect(ahZero!.pPush).toBeCloseTo(evalMx.markets["1x2"].draw, 9);
    expect(ahZero!.pAwayCover).toBeCloseTo(evalMx.markets["1x2"].away, 9);
    expect(ahMinusHalf!.pHomeCover).toBeLessThan(ahPlusHalf!.pHomeCover);

    const directRecMx = recalibrateSoccer57MatchServerV6({
      league: "liga-mx",
      rawProjHome: 1.62,
      rawProjAway: 1.08,
      rawX12: [0.48, 0.27, 0.25],
    });
    expect(directRecMx).not.toBeNull();
    expect(evalMx.muHome).toBeCloseTo(directRecMx!.muHome, 12);
    expect(evalMx.muAway).toBeCloseTo(directRecMx!.muAway, 12);
    expect(evalMx.markets.totals_2_5.over).toBeCloseTo(directRecMx!.markets.totals_2_5.over, 12);

    const vaPlayable = calibratePlayableOddsV6({ pRaw: 0.52, league: "liga-mx" });
    expect(PLAYABLE_ODDS_MIN_V60).toBe(1.55);
    expect(PLAYABLE_ODDS_MAX_V60).toBe(2.6);
    expect(vaPlayable.inPlayableZone).toBe(true);
    expect(vaPlayable.p0Lower).toBeLessThanOrEqual(vaPlayable.pCalibrated);
    expect(vaPlayable.pCalibrated).toBeLessThanOrEqual(vaPlayable.p1Upper);
    expect(vaPlayable.fairOdds.decimal).toBeGreaterThan(1);

    const vaOutside = calibratePlayableOddsV6({ pRaw: 0.85, league: "premier-league" });
    expect(vaOutside.inPlayableZone).toBe(false);
  });

  it("outlook.ts aplica recalibración v6.0 de 53 ligas sin romper grupos de conteo, cuotas finitas ni Cero-Fuga", () => {
    const mxMatch = makeNonV3SoccerMatch("liga-mx", "Liga MX", {
      picks: [
        {
          profile: "conservadora",
          market: asMarketKey("h2h"),
          selection: "home",
          label: "Club América gana",
          p: 0.5,
          fairOdds: 2.0,
        },
      ],
    });
    const recCheck = recalibrateSoccerOutlookV6(mxMatch);
    expect(recCheck).not.toBeNull();
    expect(recCheck!.playableVennAbers.over25.pCalibrated).toBeGreaterThan(0);

    const applied = applyOutlook(mxMatch, null);
    expect(applied.match.picks).toEqual([]);
    expect(applied.match.x12).not.toBeNull();
    const [pH, pD, pA] = applied.match.x12!;
    expect(pH + pD + pA).toBeCloseTo(1, 3);
    const marketKeys = (applied.match.marketGroups ?? []).flatMap((g) => g.rows.map((r) => r.market));
    expect(marketKeys).toContain("h2h");
    expect(marketKeys).toContain("totals");
    expect(marketKeys).toContain("btts");
    expect(marketKeys).toContain("dnb");
    expect(marketKeys).toContain("corners_total");

    const detailV6 = buildV6SoccerOutlookDetail({
      league: "libertadores",
      home: { name: "Flamengo" },
      away: { name: "River Plate" },
      x12: [0.46, 0.28, 0.26],
      projection: { home: 1.5, away: 1.1, total: 2.6 },
      kickoffUtc: "2026-11-25T23:00:00Z",
    });
    expect(detailV6).not.toBeNull();
    expect(detailV6!.markets.every((r) => r.currentDecimal === null && r.edgePts === null)).toBe(true);
    expect(detailV6!.outlook.scorelines).toHaveLength(3);

    const extremeFavDetail = buildV6SoccerOutlookDetail({
      league: "premier-league",
      home: { name: "Manchester City" },
      away: { name: "Club Visitante" },
      x12: [0.96, 0.036, 0.004],
      projection: { home: 3.1, away: 0.4, total: 3.5 },
      kickoffUtc: "2026-11-25T20:00:00Z",
    });
    expect(extremeFavDetail).not.toBeNull();
    expect(extremeFavDetail!.markets.length).toBeGreaterThan(0);
    for (const row of extremeFavDetail!.markets) {
      expect(Number.isFinite(row.fairAmerican)).toBe(true);
      expect(row.fairDecimal).toBeGreaterThanOrEqual(1.01);
      expect(row.fairDecimal).toBeLessThanOrEqual(100);
    }
    expect(extremeFavDetail!.outlook.mostLikely).not.toBeNull();
    expect(extremeFavDetail!.outlook.mostLikely!.fairDecimal).toBeGreaterThanOrEqual(1.01);

    const extremeFavMatch = makeNonV3SoccerMatch("premier-league", "Premier League", {
      home: {
        slug: "club-dominante-test",
        name: "Club Dominante Test",
        shortName: "Dominante",
        code: "DOM",
        record: "14 PJ",
      },
      away: {
        slug: "club-visitante-test",
        name: "Club Visitante Test",
        shortName: "Visitante",
        code: "VIS",
        record: "14 PJ",
      },
      x12: [0.96, 0.036, 0.004],
      projection: { home: 3.1, away: 0.4, total: 3.5, margin: 2.7 },
    });
    const extremeApplied = applyOutlook(extremeFavMatch, null);
    for (const group of extremeApplied.match.marketGroups ?? []) {
      for (const row of group.rows) {
        expect(Number.isFinite(row.fairOdds)).toBe(true);
        expect(row.fairOdds).toBeGreaterThanOrEqual(1.01);
      }
    }
    for (const oc of extremeApplied.match.outcomes) {
      if (oc.fairOdds) {
        expect(Number.isFinite(oc.fairOdds.american)).toBe(true);
        expect(oc.fairOdds.decimal).toBeGreaterThanOrEqual(1.01);
      }
    }

    const vaHelper = calibrateOutlookPlayableProbV6(0.5, "libertadores");
    expect(vaHelper.inPlayableZone).toBe(true);
  });
});

describe("spacetime-v6 · US Multisport (MLB/NHL/NBA/NFL), PMF discreta NFL y Early Payout +5/+3/+20/+17", () => {
  it("evalúa spreads alternativos NFL (-3.5, +7.5, -15.5) y totales alternativos (Over 30.5) sobre PMFs discretas de números clave", () => {
    const spreadEval = evaluateNflAltSpreadV6({
      expectedMargin: 3.5,
      spreadHome: -3.5,
      altLines: [-15.5, -7.5, -3.5, -3.0, 3.0, 7.5],
    });

    expect(spreadEval.keyNumberMasses.m3).toBeGreaterThan(0.08);
    expect(spreadEval.keyNumberMasses.m7).toBeGreaterThan(0.04);
    expect(spreadEval.byLine["-3.0"]!.p_push).toBeGreaterThan(0.03);
    expect(spreadEval.byLine["-15.5"]!.p_home_cover_no_push).toBeLessThan(
      spreadEval.byLine["-3.5"]!.p_home_cover_no_push,
    );
    expect(spreadEval.byLine["-3.5"]!.p_home_cover_no_push).toBeLessThan(
      spreadEval.byLine["7.5"]!.p_home_cover_no_push,
    );
    expect(spreadEval.primary.p_home_cover + spreadEval.primary.p_away_cover).toBeCloseTo(1, 9);

    const totalEval = evaluateNflAltTotalV6({
      expectedTotal: 45.5,
      line: 30.5,
      altLines: [30.5, 37.5, 44.0, 45.5, 54.5],
    });
    expect(totalEval.primary.line).toBe(30.5);
    expect(totalEval.primary.p_over).toBeGreaterThan(0.75);
    expect(totalEval.primary.p_over).toBeGreaterThan(totalEval.byLine["44.0"]!.p_over);
    expect(totalEval.byLine["44.0"]!.p_push).toBeGreaterThan(0);
    expect(totalEval.byLine["30.5"]!.p_over_no_push).toBeGreaterThan(
      totalEval.byLine["37.5"]!.p_over_no_push,
    );
    expect(totalEval.byLine["37.5"]!.p_over_no_push).toBeGreaterThan(
      totalEval.byLine["45.5"]!.p_over_no_push,
    );
    expect(totalEval.byLine["45.5"]!.p_over_no_push).toBeGreaterThan(
      totalEval.byLine["54.5"]!.p_over_no_push,
    );

    const nflMatch = evaluateNflMatchServerV6({
      pHome2Way: 0.62,
      modelExpectedTotal: 48.5,
      marketSpreadHome: -3.5,
      marketTotalLine: 47.5,
      isIndoor: true,
      isTurf: true,
    });
    expect(nflMatch.spreadPosterior?.spread_home).toBe(-3.5);
    expect(nflMatch.totalPosterior?.line).toBe(47.5);
    expect(nflMatch.earlyPayout.trigger_lead).toBe(17);
    expect(nflMatch.earlyPayoutValidatedOos).toBe(true);
  });

  it("evalúa Early Payout en los 4 deportes US (+5 MLB, +3 NHL DP, +20 NBA, +17 NFL) y guarda franquicias desconocidas", () => {
    const mlbEp = evaluateUsEarlyPayoutV6({ sport: "mlb", pHomeWin: 0.57 });
    expect(mlbEp.trigger_lead).toBe(5);
    expect(mlbEp.p_home_early_payout_win).toBeGreaterThanOrEqual(0.57);
    expect(isEarlyPayoutValidatedOosV6(mlbEp)).toBe(false);

    const nhlEp = evaluateUsEarlyPayoutV6({
      sport: "nhl",
      pHomeWin: 0.55,
      nhlLambda60Home: 3.3,
      nhlLambda60Away: 2.8,
    });
    expect(nhlEp.trigger_lead).toBe(3);
    expect(nhlEp.p_home_early_payout_win).toBeGreaterThanOrEqual(0.55);
    expect(nhlEp.p_both_sides_trigger_early_payout).not.toBeNull();
    expect(nhlEp.p_both_sides_trigger_early_payout!).toBeGreaterThanOrEqual(0);
    expect(isEarlyPayoutValidatedOosV6(nhlEp)).toBe(false);

    const nbaEp = evaluateUsEarlyPayoutV6({ sport: "nba", pHomeWin: 0.64 });
    expect(nbaEp.trigger_lead).toBe(20);
    expect(nbaEp.p_home_early_payout_win).toBeGreaterThanOrEqual(0.64);
    expect(isEarlyPayoutValidatedOosV6(nbaEp)).toBe(false);

    const nflEp = evaluateUsEarlyPayoutV6({ sport: "nfl", pHomeWin: 0.61 });
    expect(nflEp.trigger_lead).toBe(17);
    expect(nflEp.p_home_early_payout_win).toBeGreaterThanOrEqual(0.61);
    expect(isEarlyPayoutValidatedOosV6(nflEp)).toBe(true);

    expect(resolveMultiSportTeamCodeSafeV6("nfl", "Kansas City Chiefs", "KC")).toBe("KC");
    expect(resolveMultiSportTeamCodeSafeV6("nfl", "Equipo Inventado FC", "ZZZ")).toBeNull();
    expect(
      tryProjectMultiSportFromStateV6({
        sport: "nba",
        homeTeam: "Equipo Inventado",
        awayTeam: "Boston Celtics",
        gameDate: "2026-11-24",
      }),
    ).toBeNull();

    const nhlEval = evaluateUsMultisportV6Match({
      sport: "nhl",
      homeTeam: "Toronto Maple Leafs",
      awayTeam: "Boston Bruins",
      homeCode: "TOR",
      awayCode: "BOS",
      gameDate: "2026-11-24",
      livePHomeAnchor: 0.56,
    });
    expect(nhlEval.resolvedFromState).toBe(true);
    expect(nhlEval.earlyPayoutAnchored.trigger_lead).toBe(3);
    expect(nhlEval.earlyPayoutAnchored.p_home_early_payout_win).toBeGreaterThanOrEqual(0.56);

    const nhlDetail = buildMatchDetailV5(
      makePlatformGame({
        id: "nhl-v6-ep-check",
        league: asLeagueId("nhl"),
        leagueLabel: "NHL",
        sport: "ice-hockey",
        referee: undefined,
        home: { slug: "maple-leafs", name: "Toronto Maple Leafs", shortName: "Maple Leafs", code: "TOR", record: "15-7" },
        away: { slug: "bruins", name: "Boston Bruins", shortName: "Bruins", code: "BOS", record: "13-9" },
        x12: [0.56, 0, 0.44],
        projection: { home: 3.3, away: 2.8, total: 6.1 },
      }),
      { hasV32Outlook: false },
    );
    expect(nhlDetail).not.toBeNull();
    expect(nhlDetail!.v5.earlyPayout).not.toBeNull();
    expect(nhlDetail!.v5.earlyPayout!.triggerLabel).toContain("+3");
    expect(nhlDetail!.v5.earlyPayout!.homeWinProb).toBeGreaterThanOrEqual(0.56);
    expect(nhlDetail!.v5.earlyPayout!.validatedOos).toBe(false);
  });
});

describe("spacetime-v6 · Árbitros globales (53 ligas + fallback US) y cero fugas FD-16", () => {
  it("resuelve priors de oficiales en las 53 ligas de fútbol, alias v5/v6 y fallback neutral US", () => {
    const oliver = resolveOfficialPriorServerV6({
      refereeName: "Michael Oliver",
      league: "premier-league",
    });
    expect(oliver.provenance).toBe("empirical_tm_verified");
    expect(oliver.matchedV51Key).toBe("m oliver");
    expect(oliver.historicalGames).toBeGreaterThan(100);
    expect(oliver.bookingPointsExpected).toBeGreaterThan(20);

    const byDiv = resolveOfficialPriorByDivV6("Michael Oliver", "E0");
    expect(byDiv.matchedV51Key).toBe("m oliver");
    expect(resolveRefereePriorV5("Michael Oliver", "E0")?.key).toBe("m oliver");

    const unknownRefLib = resolveOfficialPriorServerV6({
      refereeName: "Árbitro Nuevo Conmebol",
      league: "libertadores",
    });
    expect(unknownRefLib.provenance).toBe("confederation_hierarchical_prior");
    expect(unknownRefLib.yellowRatePrior).toBeGreaterThan(4.5);
    expect(unknownRefLib.bookingPointsExpected).toBeGreaterThan(45);

    const usNeutral = resolveOfficialPriorServerV6({
      refereeName: "Scott Foster",
      league: "nba",
    });
    expect(usNeutral.provenance).toBe("non_soccer_umpire_neutral");
    expect(usNeutral.yellowMult).toBe(1);
    expect(usNeutral.bookingPointsExpected).toBeNull();

    const bp = computeBookingPointsServerV6({
      yellowRatePrior: 4.5,
      redCardRatePrior: 0.25,
    });
    expect(bp.expectedBookingPoints).toBeGreaterThan(45);
    expect(bp.lines["35.5"]!.pOver).toBeGreaterThan(bp.lines["45.5"]!.pOver);
    expect(bp.lines["45.5"]!.pOver).toBeGreaterThan(bp.lines["55.5"]!.pOver);

    const refLookup = resolveRefereeOfficialPrior("Michael Oliver", "premier-league");
    expect(refLookup).not.toBeNull();
    expect(refLookup!.source).toBe("historial_verificado");
    expect(containsForbiddenFd16Term(JSON.stringify(refLookup))).toBe(false);
    expect(resolveRefereeOfficialPrior("Michael Oliver", "liga-invalida")).toBeNull();

    const premRanking = loadLeagueRefereeRanking("premier-league");
    expect(premRanking).not.toBeNull();
    expect(premRanking!.referees.every((r) => isSafePublicLabel(r.name))).toBe(true);
    expect(containsForbiddenFd16Term(JSON.stringify(premRanking))).toBe(false);
  });
});

describe("spacetime-v6 · Cópulas SGP (portero, jugador-partido, spread+over) e invariantes numéricos", () => {
  it("evalúa SGP de atajadas de portero (clean_sheet, under_2_5, team_win), jugador-partido y spread+over respetando cotas numéricas", () => {
    const gkCleanSheet = evaluateGoalkeeperSavesSgpServerV6({
      savesLine: 2.5,
      ebSaveRate: 0.73,
      oppExpectedSoT: 4.8,
      teamExpectedGoals: 1.45,
      opponentExpectedGoals: 1.1,
      matchOutcome: "clean_sheet",
      offeredCombinedDecimalOdds: 4.2,
    });
    expect(gkCleanSheet.jointProbability).toBeGreaterThanOrEqual(
      gkCleanSheet.probabilityLowerBound - 0.0002,
    );
    expect(gkCleanSheet.jointProbability).toBeLessThanOrEqual(
      gkCleanSheet.probabilityUpperBound + 0.0002,
    );
    expect(gkCleanSheet.jointProbability).toBeLessThanOrEqual(
      Math.min(gkCleanSheet.pSavesOverMarginal, gkCleanSheet.pMatchOutcomeMarginal) + 0.0002,
    );
    expect(gkCleanSheet.bookQuoteAudit).not.toBeNull();

    const gkUnder = evaluateGoalkeeperSavesSgpServerV6({
      savesLine: 3.5,
      ebSaveRate: 0.74,
      oppExpectedSoT: 5.2,
      teamExpectedGoals: 1.1,
      opponentExpectedGoals: 1.15,
      matchOutcome: "under_2_5",
    });
    expect(gkUnder.jointProbability).toBeGreaterThanOrEqual(gkUnder.probabilityLowerBound - 0.0002);
    expect(gkUnder.jointProbability).toBeLessThanOrEqual(gkUnder.probabilityUpperBound + 0.0002);

    const gkWin = evaluateGoalkeeperSavesSgpServerV6({
      savesLine: 2.5,
      ebSaveRate: 0.72,
      oppExpectedSoT: 4.5,
      teamExpectedGoals: 1.7,
      opponentExpectedGoals: 1.0,
      matchOutcome: "team_win",
    });
    expect(gkWin.jointProbability).toBeGreaterThan(0);
    expect(gkWin.jointProbability).toBeLessThanOrEqual(gkWin.probabilityUpperBound + 0.0002);

    const gkExtremeTail = evaluateGoalkeeperSavesSgpServerV6({
      savesLine: 4.5,
      ebSaveRate: 0.52,
      oppExpectedSoT: 1.5,
      teamExpectedGoals: 0.9,
      opponentExpectedGoals: 1.8,
      matchOutcome: "clean_sheet",
      offeredCombinedDecimalOdds: 25,
    });
    expect(gkExtremeTail.jointProbability).toBeLessThan(0.01);
    expect(gkExtremeTail.fairCombinedDecimal).toBe(100);
    expect(gkExtremeTail.fairCombinedAmerican).toBe(9900);
    expect(gkExtremeTail.bookQuoteAudit?.fairCombinedDecimal).toBe(100);

    const playerLinked = evaluatePlayerLinkedSgpV6({
      pPlayerAnytimeGoal: 0.42,
      teamExpectedGoals: 1.85,
      opponentExpectedGoals: 0.95,
      teamOutcome: "team_win",
      matchTotalOverLine: 2.5,
      offeredCombinedDecimalOdds: 2.2,
    });
    expect(playerLinked.jointProbability).toBeGreaterThan(playerLinked.independentProbability);
    expect(playerLinked.jointProbability).toBeGreaterThanOrEqual(
      playerLinked.probabilityLowerBound - 0.0002,
    );
    expect(playerLinked.jointProbability).toBeLessThanOrEqual(
      playerLinked.probabilityUpperBound + 0.0002,
    );

    const nflSpreadOver = evaluateSgpCopulaV6({
      sport: "nfl",
      legs: [
        { legId: "spread", factor: "home_margin", marginalProbability: 0.54, direction: 1 },
        { legId: "over", factor: "total_points", marginalProbability: 0.52, direction: 1 },
      ],
      offeredCombinedDecimalOdds: 3.4,
    });
    const lowerSpreadOver = Math.max(0, 0.54 + 0.52 - 1);
    const upperSpreadOver = Math.min(0.54, 0.52);
    expect(nflSpreadOver.jointProbability).toBeGreaterThanOrEqual(lowerSpreadOver - 0.0002);
    expect(nflSpreadOver.jointProbability).toBeLessThanOrEqual(upperSpreadOver + 0.0002);
  });

  it("POST /api/parlays/sgp soporta modo portero, jugador-partido y spread+over con .strict(), cero claves prohibidas y cero jerga", async () => {
    const gkRes = await sgpPost(
      sameOriginSgpPost({
        mode: "goalkeeper_saves",
        sport: "soccer",
        savesLine: 2.5,
        ebSaveRate: 0.73,
        oppExpectedSoT: 4.8,
        teamExpectedGoals: 1.45,
        opponentExpectedGoals: 1.1,
        matchOutcome: "clean_sheet",
        expectedMinutes: 90,
        offeredCombinedDecimalOdds: 4.2,
      }),
    );
    expect(gkRes.status).toBe(200);
    const gkBody = (await gkRes.json()) as { audit: Record<string, unknown> };
    expect(gkBody.audit.mode).toBe("goalkeeper_saves");
    expect(gkBody.audit.nLegs).toBe(2);
    const gkKeys = collectKeys(gkBody);
    for (const forbidden of FORBIDDEN_BET_SIZING_KEYS) {
      expect(gkKeys.has(forbidden)).toBe(false);
    }
    expect(JSON.stringify(gkBody).toLowerCase()).not.toContain("hoeffding");
    expect(JSON.stringify(gkBody).toLowerCase()).not.toContain("geodesic");

    const gkLowMinRes = await sgpPost(
      sameOriginSgpPost({
        mode: "goalkeeper_saves",
        savesLine: 2.5,
        ebSaveRate: 0.72,
        oppExpectedSoT: 4.5,
        teamExpectedGoals: 1.4,
        opponentExpectedGoals: 1.1,
        matchOutcome: "under_2_5",
        expectedMinutes: 30,
      }),
    );
    expect(gkLowMinRes.status).toBe(400);

    const playerRes = await sgpPost(
      sameOriginSgpPost({
        mode: "player_linked",
        sport: "football",
        pPlayerAnytimeGoal: 0.4,
        teamExpectedGoals: 1.8,
        opponentExpectedGoals: 0.95,
        teamOutcome: "team_win",
        matchTotalOverLine: 2.5,
        offeredCombinedDecimalOdds: 2.3,
      }),
    );
    expect(playerRes.status).toBe(200);
    const playerBody = (await playerRes.json()) as { audit: Record<string, unknown> };
    expect(playerBody.audit.mode).toBe("player_linked");
    expect(playerBody.audit.nLegs).toBe(3);
    const playerKeys = collectKeys(playerBody);
    for (const forbidden of FORBIDDEN_BET_SIZING_KEYS) {
      expect(playerKeys.has(forbidden)).toBe(false);
    }

    const nflRes = await sgpPost(
      sameOriginSgpPost({
        mode: "copula",
        sport: "nfl",
        legs: [
          { legId: "sp", factor: "home_margin", marginalProbability: 0.55, direction: 1 },
          { legId: "tot", factor: "total_points", marginalProbability: 0.53, direction: 1 },
        ],
        offeredCombinedDecimalOdds: 3.3,
      }),
    );
    expect(nflRes.status).toBe(200);
    const nflBody = (await nflRes.json()) as { audit: { sport: string; jointProbability: number } };
    expect(nflBody.audit.sport).toBe("nfl");
    expect(nflBody.audit.jointProbability).toBeGreaterThan(0);

    const strictBadMode = await sgpPost(
      sameOriginSgpPost({
        mode: "goalkeeper_saves",
        savesLine: 2.5,
        ebSaveRate: 0.73,
        oppExpectedSoT: 4.8,
        teamExpectedGoals: 1.45,
        opponentExpectedGoals: 1.1,
        matchOutcome: "clean_sheet",
        extraBadField: 123,
      }),
    );
    expect(strictBadMode.status).toBe(400);
  });

  it("buildUnifiedMatchIntelligenceServerV6 construye inteligencia unificada en fútbol y US con guardas de seguridad", () => {
    const soccerUni = buildUnifiedMatchIntelligenceServerV6({
      matchId: "v6-uni-pl-1",
      sport: "soccer",
      league: "premier-league",
      homeTeam: "Liverpool",
      awayTeam: "Arsenal",
      homeSlug: "liverpool",
      awaySlug: "arsenal",
      kickoffUtc: "2026-11-24T20:00:00Z",
      lifecycleStatus: "scheduled",
      neutralSite: false,
      refereeName: "Michael Oliver",
      causalInputsAsOfUtc: "2026-11-24T12:00:00Z",
      soccerInput: {
        mode: "prekickoff_recalibration",
        homeElo: 1890,
        awayElo: 1865,
        homeAttEwm: 1.75,
        homeDefEwm: 0.95,
        homeGames: 12,
        awayAttEwm: 1.65,
        awayDefEwm: 1.0,
        awayGames: 12,
        leagueEnvGoals: 2.75,
        seasonProgress: 0.35,
        rawProjHome: 1.62,
        rawProjAway: 1.18,
        rawX12: [0.47, 0.26, 0.27],
      },
    });
    expect(soccerUni).not.toBeNull();
    expect(soccerUni!.guardrailAudit.passed).toBe(true);
    expect(soccerUni!.earlyPayout.triggerLead).toBe(2);
    expect(soccerUni!.preKickoffSeal.hasForecast).toBe(true);

    const nhlUni = buildUnifiedMatchIntelligenceServerV6({
      matchId: "v6-uni-nhl-1",
      sport: "nhl",
      league: "nhl",
      homeTeam: "Toronto Maple Leafs",
      awayTeam: "Boston Bruins",
      homeSlug: "TOR",
      awaySlug: "BOS",
      kickoffUtc: "2026-11-24T23:00:00Z",
      lifecycleStatus: "scheduled",
      neutralSite: false,
      causalInputsAsOfUtc: "2026-11-24T15:00:00Z",
      usSportInput: {
        mode: "post_walkforward_state",
        gameDate: "2026-11-24",
        effectiveSampleGames: 20,
        seasonProgress: 0.25,
      },
    });
    expect(nhlUni).not.toBeNull();
    expect(nhlUni!.guardrailAudit.passed).toBe(true);
    expect(nhlUni!.earlyPayout.triggerLead).toBe(3);

    expect(resolveMultiSportTeamCodeSafeV6("nfl", "chiefs")).toBe("KC");
    expect(resolveMultiSportTeamCodeSafeV6("nba", "lakers")).toBe("LAL");
    expect(resolveMultiSportTeamCodeSafeV6("mlb", "sox")).toBeNull();

    const nflShortSlugUni = buildUnifiedMatchIntelligenceServerV6({
      matchId: "v6-uni-nfl-short-slug",
      sport: "nfl",
      league: "nfl",
      homeTeam: "Kansas City Chiefs",
      awayTeam: "Buffalo Bills",
      homeSlug: "chiefs",
      awaySlug: "bills",
      kickoffUtc: "2026-11-24T21:25:00Z",
      lifecycleStatus: "scheduled",
      neutralSite: false,
      causalInputsAsOfUtc: "2026-11-24T14:00:00Z",
      usSportInput: {
        mode: "post_walkforward_state",
        gameDate: "2026-11-24",
        effectiveSampleGames: 12,
        seasonProgress: 0.65,
      },
    });
    expect(nflShortSlugUni).not.toBeNull();
    expect(nflShortSlugUni!.guardrailAudit.passed).toBe(true);
    expect(nflShortSlugUni!.earlyPayout.triggerLead).toBe(17);

    const nbaShortSlugUni = buildUnifiedMatchIntelligenceServerV6({
      matchId: "v6-uni-nba-short-slug",
      sport: "nba",
      league: "nba",
      homeTeam: "Los Angeles Lakers",
      awayTeam: "New York Knicks",
      homeSlug: "lakers",
      awaySlug: "knicks",
      kickoffUtc: "2026-11-25T03:00:00Z",
      lifecycleStatus: "scheduled",
      neutralSite: false,
      causalInputsAsOfUtc: "2026-11-24T18:00:00Z",
      usSportInput: {
        mode: "post_walkforward_state",
        gameDate: "2026-11-25",
        effectiveSampleGames: 16,
        seasonProgress: 0.2,
      },
    });
    expect(nbaShortSlugUni).not.toBeNull();
    expect(nbaShortSlugUni!.guardrailAudit.passed).toBe(true);
    expect(nbaShortSlugUni!.earlyPayout.triggerLead).toBe(20);

    const unknownLeagueUni = buildUnifiedMatchIntelligenceServerV6({
      matchId: "v6-uni-unknown",
      sport: "soccer",
      league: "liga-desconocida",
      homeTeam: "A",
      awayTeam: "B",
      homeSlug: "a",
      awaySlug: "b",
      kickoffUtc: "2026-11-24T20:00:00Z",
      lifecycleStatus: "scheduled",
      neutralSite: false,
      causalInputsAsOfUtc: "2026-11-24T12:00:00Z",
      soccerInput: {
        mode: "prekickoff_recalibration",
        homeElo: 1500,
        awayElo: 1500,
        homeAttEwm: 1.2,
        homeDefEwm: 1.2,
        homeGames: 5,
        awayAttEwm: 1.2,
        awayDefEwm: 1.2,
        awayGames: 5,
        leagueEnvGoals: 2.7,
        seasonProgress: 0.2,
        rawProjHome: 1.3,
        rawProjAway: 1.1,
        rawX12: [0.45, 0.27, 0.28],
      },
    });
    expect(unknownLeagueUni).toBeNull();
  });
});
