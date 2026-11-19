import { describe, expect, it } from "vitest";
import { asLeagueId } from "@pitchlab/contracts";
import { computeDeVigProbs, computeMarketOverroundPct } from "./bookmakers";
import {
  orderHomeSports,
  partitionHomeLeagues,
} from "./club/home/HomeSportStrip";
import { evaluateStreakVsCalibration } from "./components/CalibrationHonestyLab";
import { evaluatePropStreak } from "./components/PlayerPropStreakCard";
import {
  computeLivePickProgress,
  evaluateAsianHandicapLive,
} from "./live/live-pick-progress";
import {
  buildLeagueRefereeDirectory,
  shrinkRefereeYellowRate,
} from "./referee-stats";
import {
  oddsToSliderStep,
  sanitizeSavedScreenerViews,
  sliderStepToOdds,
  smoothOddsWeight,
} from "./screener-views";
import type { JournalEntry, PlatformGame } from "./types";

function makePreGame(
  matchContext?: PlatformGame["preGame"]["matchContext"],
): PlatformGame["preGame"] {
  return {
    cortexSynthesis: "",
    tacticalKeys: [],
    absences: [],
    lineupStatusLabel: "",
    lineupsConfirmed60m: false,
    moneyFlow: null,
    ...(matchContext ? { matchContext } : {}),
  };
}

function makeGame(partial: Partial<PlatformGame>): PlatformGame {
  return {
    id: partial.id ?? "g-1",
    league: partial.league ?? asLeagueId("liga-mx"),
    leagueLabel: partial.leagueLabel ?? "Liga MX",
    sport: partial.sport ?? "football",
    status: partial.status ?? "NS",
    dayId: partial.dayId ?? "2026-11-19",
    dayLabel: partial.dayLabel ?? "Jue 19 nov",
    kickoffUtc: partial.kickoffUtc ?? "2026-11-19T23:00:00Z",
    kickoffLocal: partial.kickoffLocal ?? "17:00",
    home: partial.home ?? { slug: "home", name: "Local FC", shortName: "Local", record: "5-2-1" },
    away: partial.away ?? { slug: "away", name: "Visita FC", shortName: "Visita", record: "4-3-1" },
    preGame: partial.preGame ?? makePreGame(),
    picks: partial.picks ?? [],
    markets: partial.markets ?? [],
    factors: partial.factors ?? [],
    headToHead: partial.headToHead ?? [],
    ...partial,
  } as PlatformGame;
}

describe("Goal 3 · Active-first HomeSportStrip & HomeLeagueStrip", () => {
  it("orders active sports with matches first and pushes 0-match sports to the end", () => {
    const dayGames = [
      makeGame({ id: "nba-1", sport: "basketball", league: asLeagueId("nba") }),
      makeGame({ id: "nba-2", sport: "basketball", league: asLeagueId("nba") }),
      makeGame({ id: "nba-3", sport: "basketball", league: asLeagueId("nba") }),
      makeGame({ id: "fut-1", sport: "football", league: asLeagueId("mls") }),
    ];
    const ordered = orderHomeSports(dayGames, "all");
    expect(ordered[0]?.def.id).toBe("all");
    expect(ordered[0]?.count).toBe(4);
    expect(ordered[1]?.def.id).toBe("nba");
    expect(ordered[1]?.count).toBe(3);
    expect(ordered[2]?.def.id).toBe("futbol");
    expect(ordered[2]?.count).toBe(1);
    // Deportes en 0 aparecen al final
    expect(ordered.slice(3).every((s) => s.count === 0)).toBe(true);
  });

  it("hides 0-match leagues from inline HomeLeagueStrip and puts active playing leagues first", () => {
    const leagues = [
      { league: asLeagueId("liga-mx"), label: "Liga MX", dayCount: 0, totalCount: 9 },
      { league: asLeagueId("premier-league"), label: "Premier League", dayCount: 0, totalCount: 10 },
      { league: asLeagueId("laliga"), label: "LaLiga", dayCount: 0, totalCount: 10 },
      { league: asLeagueId("mls"), label: "MLS", dayCount: 2, totalCount: 8 },
      { league: asLeagueId("brasileirao"), label: "Brasileirão Serie A", dayCount: 3, totalCount: 10 },
    ];
    const res = partitionHomeLeagues(leagues, "all", ["liga-mx", "premier-league", "laliga"]);
    expect(res.playingTodayCount).toBe(2);
    expect(res.inlineLeagues.map((l) => l.league)).toEqual(["brasileirao", "mls"]);
    expect(res.hiddenCount).toBe(3);
  });

  it("keeps explicitly selected 0-match league visible so user can clear the filter", () => {
    const leagues = [
      { league: asLeagueId("liga-mx"), label: "Liga MX", dayCount: 0, totalCount: 9 },
      { league: asLeagueId("mls"), label: "MLS", dayCount: 2, totalCount: 8 },
    ];
    const res = partitionHomeLeagues(leagues, asLeagueId("liga-mx"), ["liga-mx"]);
    expect(res.inlineLeagues.map((l) => l.league)).toEqual(["mls", "liga-mx"]);
    expect(res.hiddenCount).toBe(0);
  });
});

describe("Goal 3 · Non-linear Odds Slider, Smooth C1 Weight & Saved Screener Views", () => {
  it("maps 101 steps bijectively with 68% precision in [1.30, 3.00] and step 100 as unbounded", () => {
    expect(sliderStepToOdds(0)).toBe(1.01);
    expect(sliderStepToOdds(12)).toBe(1.3);
    expect(sliderStepToOdds(14)).toBe(1.35);
    expect(sliderStepToOdds(80)).toBe(3.0);
    expect(sliderStepToOdds(100)).toBeNull();
    expect(oddsToSliderStep(1.3)).toBe(12);
    expect(oddsToSliderStep(2.0)).toBe(40);
    expect(oddsToSliderStep(3.0)).toBe(80);
    expect(oddsToSliderStep(null)).toBe(100);
  });

  it("is smooth C1 continuous around 1.35 without discontinuous jumps", () => {
    const below = smoothOddsWeight(1.3499);
    const above = smoothOddsWeight(1.3501);
    expect(Math.abs(above - below)).toBeLessThan(0.005);
    expect(smoothOddsWeight(1.85)).toBeGreaterThan(smoothOddsWeight(5.5));
  });

  it("sanitizes saved screener views and clamps min/max steps safely", () => {
    const views = sanitizeSavedScreenerViews([
      {
        id: "v1",
        name: "  Valor Fútbol  ",
        sport: "futbol",
        league: "liga-mx",
        band: "alta",
        kind: "goles",
        sort: "ventaja",
        onlyPositiveEdge: true,
        minOddsStep: 90,
        maxOddsStep: 20, // invertido a propósito
        window: "today",
      },
      { id: "x", name: "a" }, // inválido (muy corto)
    ]);
    expect(views).toHaveLength(1);
    expect(views[0]?.name).toBe("Valor Fútbol");
    expect(views[0]!.minOddsStep).toBeLessThan(views[0]!.maxOddsStep);
  });
});

describe("Goal 3 · Referee Empirical Bayes Rigor & Overround / De-Vig", () => {
  it("shrinks small-sample referee yellow card averages toward league mean (κ = 15)", () => {
    const smallSample = shrinkRefereeYellowRate(8.0, 2, 4.15, 15);
    const largeSample = shrinkRefereeYellowRate(5.2, 45, 4.15, 15);
    expect(smallSample).toBeLessThan(4.7);
    expect(largeSample).toBeCloseTo(4.94, 2);
  });

  it("builds ranked league referee directory with strict/average/lenient tiers", () => {
    const games = [
      makeGame({
        id: "m1",
        referee: "Ref Estricto",
        preGame: makePreGame({
          referee: "Ref Estricto",
          refereeStats: { matches: 40, avgYellow: 5.4, avgRed: 0.35, avgFouls: 27.1 },
        }),
      }),
      makeGame({
        id: "m2",
        referee: "Ref Medio",
        preGame: makePreGame({
          referee: "Ref Medio",
          refereeStats: { matches: 35, avgYellow: 4.1, avgRed: 0.15, avgFouls: 22.5 },
        }),
      }),
      makeGame({
        id: "m3",
        referee: "Ref Permisivo",
        preGame: makePreGame({
          referee: "Ref Permisivo",
          refereeStats: { matches: 38, avgYellow: 3.0, avgRed: 0.05, avgFouls: 18.9 },
        }),
      }),
    ];
    const dir = buildLeagueRefereeDirectory(games, asLeagueId("liga-mx"));
    expect(dir).toHaveLength(3);
    expect(dir[0]?.name).toBe("Ref Estricto");
    expect(dir[0]?.rigorTier).toBe("estricto");
    expect(dir[2]?.name).toBe("Ref Permisivo");
    expect(dir[2]?.rigorTier).toBe("permisivo");
  });

  it("computes bookmaker overround % and multiplicative de-vig probabilities", () => {
    expect(computeMarketOverroundPct([1.91, 1.91])).toBeCloseTo(4.7, 1);
    const probs = computeDeVigProbs([1.91, 1.91]);
    expect(probs).toEqual([0.5, 0.5]);
  });
});

describe("Goal 3 · Bayesian Prop Calibration, Honesty Lab & Live Asian Handicap Progress", () => {
  it("contracts raw 5/5 prop streak away from 100% and computes fair decimal odds", () => {
    const pts = [3, 4, 2, 3, 5].map((v, i) => ({ label: `P${i + 1}`, value: v }));
    const res = evaluatePropStreak(pts, 1.5, 5);
    expect(res.hitRatePct).toBe(100);
    expect(res.pCalibrated).toBeLessThan(0.85);
    expect(res.pCalibrated).toBeGreaterThan(0.7);
    expect(res.fairDecimal).toBeGreaterThan(1.2);
    expect(res.reliabilityLabel).toBe("Muestra corta");
  });

  it("demonstrates negative EV for a raw 4/5 streak priced at 1.35", () => {
    const res = evaluateStreakVsCalibration(4, 5, 1.35);
    expect(res.rawPct).toBe(80);
    expect(res.calibratedPct).toBeCloseTo(66.7, 1);
    expect(res.evPct).toBeLessThan(0);
  });

  it("evaluates all 5 Asian handicap live states (.0, .25, .5, .75) and Over lineReached", () => {
    expect(evaluateAsianHandicapLive(2, -0.75).state).toBe("covering_full");
    expect(evaluateAsianHandicapLive(1, -0.75).state).toBe("covering_half");
    expect(evaluateAsianHandicapLive(1, -1.0).state).toBe("push");
    expect(evaluateAsianHandicapLive(0, -0.25).state).toBe("losing_half");
    expect(evaluateAsianHandicapLive(0, -1.0).state).toBe("not_covering");

    const game = makeGame({ id: "g-live", status: "LIVE", score: { home: 2, away: 1 } });
    const entry: JournalEntry = {
      id: "e1",
      pickId: "pk1",
      gameId: "g-live",
      leagueLabel: "Liga MX",
      matchLabel: "Local vs Visita",
      pickLabel: "Más de 2.5 goles",
      origin: "Spacetime Suite",
      units: 1,
      userDecimal: 1.9,
      fairDecimal: 1.82,
      clvPct: 2,
      status: "pending",
      sealedAt: "Hoy",
    };
    const progress = computeLivePickProgress({ entry, game });
    expect(progress?.lineReached).toBe(true);
    expect(progress?.progressRatioLabel).toBe("3 / 2.5 goles");
    expect(progress?.tone).toBe("success");
  });
});
