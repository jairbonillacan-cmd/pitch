/**
 * Tactical 7-Axis Radar, Goalkeeper Goalmouth Prevention & SKORE Rating Engine Tests.
 *
 * Verifies the 4 core analytical engines reverse-engineered from REA-stats (Opta / Statiskicks):
 * 1. Exact `RankBands` formula against real Club América sample values (N = 35) & inverted PPDA polarity
 * 2. 7-Axis Tactical Radar with PPDA polarity inversion and style classification
 * 3. Goalkeeper 6-Zone Goalmouth analyzer against the real 46-shot sample (xgot = 13.78, goals = 13, prevented = +0.78)
 * 4. Player SKORE rating (6.0 base, 10.0 ceiling clamp) and Lineup Tactical 1X2 probability tilt
 */
import { describe, expect, it } from "vitest";
import {
  GOALMOUTH_ZONES,
  SKORE_BASELINE,
  SKORE_CEILING,
  SKORE_FLOOR,
  SKORE_HIGH_THRESHOLD,
  SKORE_MID_THRESHOLD,
  TACTICAL_AXES,
  TACTICAL_AXIS_POLARITY,
  analyzeGoalkeeperGoalmouth,
  applyLineupTacticalAdjustment,
  calculatePercentile,
  classifyGoalmouthZone,
  classifyTacticalStyle,
  computeLineupAverageSkore,
  computePercentileFromRank,
  computePlayerSkore,
  computeTacticalRadar,
  createTacticalRadarFromPercentiles,
  getQuintileBand,
  getRankGrade,
  normalizeGoalmouthCoordinates,
  rankAttributeInCohort,
  type GoalmouthShot,
  type TacticalRadarMetrics,
} from "../src/tactical_skore";

describe("1. RankBands Exact Peer-Group Percentile & Quintile Engine", () => {
  it("computes exact percentiles matching Club América sample values with N = 35", () => {
    const N = 35; // Total teams in Liga MX + Expansion cohort

    // Count strictly worse = 34 (rank 1 of 35) -> 34 / 34 * 100 = 100.0
    const pctRank1 = computePercentileFromRank(34, N);
    expect(pctRank1).toBe(100.0);

    // Count strictly worse = 30 -> 30 / 34 * 100 = 88.23529... -> 88.24
    const pctRank5 = computePercentileFromRank(30, N);
    expect(pctRank5).toBe(88.24);

    // Count strictly worse = 17 (median) -> 17 / 34 * 100 = 50.0
    const pctMedian = computePercentileFromRank(17, N);
    expect(pctMedian).toBe(50.0);

    // Count strictly worse = 0 (rank 35 of 35) -> 0.0
    const pctLast = computePercentileFromRank(0, N);
    expect(pctLast).toBe(0.0);
  });

  it("handles edge case of single entity cohort (N = 1)", () => {
    expect(computePercentileFromRank(0, 1)).toBe(100.0);
    expect(calculatePercentile(10, [10])).toBe(100.0);
  });

  it("calculates percentile with standard polarity (higher is better)", () => {
    // Cohort of 35 teams with goals scored
    const cohort = Array.from({ length: 35 }, (_, i) => 10 + i * 2); // 10, 12, ..., 78
    const topTeamGoals = 78; // top team
    const pctTop = calculatePercentile(topTeamGoals, cohort, true);
    expect(pctTop).toBe(100.0);

    const fifthTeamGoals = cohort[30]!; // 30 peers strictly lower
    const pctFifth = calculatePercentile(fifthTeamGoals, cohort, true);
    expect(pctFifth).toBe(88.24);
  });

  it("calculates percentile with inverted polarity for PPDA / defensive concessions (lower is better)", () => {
    // For PPDA (passes allowed per defensive action), lower is a more aggressive press!
    // Construct cohort of 35 teams with PPDA from 7.0 to 17.2
    const cohort = Array.from({ length: 35 }, (_, i) => 7.0 + i * 0.3);
    const elitePressTeam = cohort[0]!; // 7.0 PPDA -> lowest PPDA in cohort

    // 34 peers have PPDA > 7.0 (strictly worse pressing)
    const pctElite = calculatePercentile(elitePressTeam, cohort, false);
    expect(pctElite).toBe(100.0);

    // Team at index 4 (5th best PPDA, 30 teams have higher/worse PPDA)
    const fifthPressTeam = cohort[4]!;
    const pctFifth = calculatePercentile(fifthPressTeam, cohort, false);
    expect(pctFifth).toBe(88.24);

    // Worst pressing team (highest PPDA)
    const worstPressTeam = cohort[34]!;
    const pctWorst = calculatePercentile(worstPressTeam, cohort, false);
    expect(pctWorst).toBe(0.0);
  });

  it("maps percentiles to 5 discrete quintile bands (<20, <40, <60, <80, >=80)", () => {
    expect(getQuintileBand(0.0)).toBe(1);
    expect(getQuintileBand(19.99)).toBe(1);
    expect(getQuintileBand(20.0)).toBe(2);
    expect(getQuintileBand(39.99)).toBe(2);
    expect(getQuintileBand(40.0)).toBe(3);
    expect(getQuintileBand(59.99)).toBe(3);
    expect(getQuintileBand(60.0)).toBe(4);
    expect(getQuintileBand(79.99)).toBe(4);
    expect(getQuintileBand(80.0)).toBe(5);
    expect(getQuintileBand(100.0)).toBe(5);
  });

  it("maps percentiles to tripartite rank grade (low, mid, high)", () => {
    expect(getRankGrade(35.0)).toBe("low");
    expect(getRankGrade(40.0)).toBe("mid");
    expect(getRankGrade(69.9)).toBe("mid");
    expect(getRankGrade(70.0)).toBe("high");
    expect(getRankGrade(100.0)).toBe("high");
  });

  it("returns full ranking summary with rankAttributeInCohort", () => {
    const cohort = [10, 20, 30, 40, 50]; // 5 teams
    const ranking = rankAttributeInCohort(40, cohort, true);
    expect(ranking.rank).toBe(2); // 1 team better (50)
    expect(ranking.countStrictlyWorse).toBe(3); // 10, 20, 30
    expect(ranking.percentile).toBe(75.0); // 3 / 4 * 100 = 75.0
    expect(ranking.quintile).toBe(4);
    expect(ranking.grade).toBe("high");
  });
});

describe("2. 7-Axis Team Tactical Radar (OptaTeamAttributeService)", () => {
  it("verifies all 7 dimensions and polarities", () => {
    expect(TACTICAL_AXES).toHaveLength(7);
    expect(TACTICAL_AXIS_POLARITY.possession).toBe(true);
    expect(TACTICAL_AXIS_POLARITY.territorialControl).toBe(true);
    expect(TACTICAL_AXIS_POLARITY.directness).toBe(true);
    expect(TACTICAL_AXIS_POLARITY.pressingIntensity).toBe(false); // PPDA inverted!
    expect(TACTICAL_AXIS_POLARITY.openPlayXg).toBe(true);
    expect(TACTICAL_AXIS_POLARITY.expectedAssists).toBe(true);
    expect(TACTICAL_AXIS_POLARITY.expectedThreat).toBe(true);
  });

  it("computes radar against a league cohort correctly with PPDA inversion", () => {
    // 35-team league
    const cohort: TacticalRadarMetrics[] = Array.from({ length: 35 }, (_, i) => ({
      possession: 40 + i * 0.5, // 40 to 57
      territorialControl: 35 + i * 1.0,
      directness: 1.2 + i * 0.05,
      pressingIntensity: 15.0 - i * 0.2, // PPDA: 15.0 down to 8.2 (index 34 has lowest PPDA = best)
      openPlayXg: 0.8 + i * 0.03,
      expectedAssists: 0.6 + i * 0.02,
      expectedThreat: 0.7 + i * 0.04,
    }));

    // Target team has top possession (index 34) and lowest PPDA (index 34)
    const targetTeam = cohort[34]!;
    const radar = computeTacticalRadar(targetTeam, cohort);

    expect(radar.percentiles.possession).toBe(100.0);
    expect(radar.percentiles.pressingIntensity).toBe(100.0); // lowest PPDA -> 100%
    expect(radar.quintiles.possession).toBe(5);
    expect(radar.quintiles.pressingIntensity).toBe(5);
    expect(radar.axes.pressingIntensity.higherIsBetter).toBe(false);
    expect(radar.tacticalStyle).toBe("Dominant High-Pressing Possession");
  });

  it("creates radar from direct percentiles and classifies styles", () => {
    const directStyle: TacticalRadarMetrics = {
      possession: 42.0,
      territorialControl: 38.0,
      directness: 82.0,
      pressingIntensity: 45.0,
      openPlayXg: 72.0,
      expectedAssists: 65.0,
      expectedThreat: 70.0,
    };
    const report = createTacticalRadarFromPercentiles(directStyle);
    expect(report.tacticalStyle).toBe("Direct Vertical Transition");
    expect(report.averagePercentile).toBe(59.14);
  });
});

describe("3. Goalkeeper Shot-Stopping & 6-Zone Goalmouth Analyzer (OptaKeeperGoalmouthService)", () => {
  it("normalizes both raw Opta pitch coordinates and unit coordinates correctly", () => {
    // Pitch coordinates: Y in [44.2, 55.8], Z in [0, 38.0]
    const p1 = normalizeGoalmouthCoordinates(44.2, 0); // bottom-left post
    expect(p1.normY).toBeCloseTo(0.0, 5);
    expect(p1.normZ).toBeCloseTo(0.0, 5);

    const p2 = normalizeGoalmouthCoordinates(50.0, 19.0); // center, middle height
    expect(p2.normY).toBeCloseTo(0.5, 2);
    expect(p2.normZ).toBeCloseTo(0.5, 2);

    const p3 = normalizeGoalmouthCoordinates(55.8, 38.0); // top-right crossbar
    expect(p3.normY).toBeCloseTo(1.0, 5);
    expect(p3.normZ).toBeCloseTo(1.0, 5);

    // Unit coordinates [0, 1]
    const u1 = normalizeGoalmouthCoordinates(0.2, 0.8);
    expect(u1.normY).toBe(0.2);
    expect(u1.normZ).toBe(0.8);
  });

  it("classifies into the 6 goalmouth zones properly", () => {
    expect(classifyGoalmouthZone(0.15, 0.8)).toBe("top_left");
    expect(classifyGoalmouthZone(0.50, 0.8)).toBe("top_center");
    expect(classifyGoalmouthZone(0.85, 0.8)).toBe("top_right");
    expect(classifyGoalmouthZone(0.15, 0.3)).toBe("low_left");
    expect(classifyGoalmouthZone(0.50, 0.3)).toBe("low_center");
    expect(classifyGoalmouthZone(0.85, 0.3)).toBe("low_right");
  });

  it("computes exact shot-stopping metrics against the real 46-shot sample", () => {
    // Construct the 46-shot sample:
    // Total xgotFaced = 13.78, goalsConceded = 13, prevented = +0.78
    // All 6 zones populated
    const shotConfigs: Array<{
      zone: (typeof GOALMOUTH_ZONES)[number];
      yNorm: number;
      zNorm: number;
      shotsCount: number;
      goalsCount: number;
      totalXgot: number;
    }> = [
      { zone: "top_left", yNorm: 0.15, zNorm: 0.75, shotsCount: 6, goalsCount: 2, totalXgot: 1.80 },
      { zone: "top_center", yNorm: 0.50, zNorm: 0.80, shotsCount: 8, goalsCount: 3, totalXgot: 3.20 },
      { zone: "top_right", yNorm: 0.85, zNorm: 0.70, shotsCount: 7, goalsCount: 2, totalXgot: 2.10 },
      { zone: "low_left", yNorm: 0.20, zNorm: 0.25, shotsCount: 8, goalsCount: 2, totalXgot: 2.25 },
      { zone: "low_center", yNorm: 0.50, zNorm: 0.20, shotsCount: 10, goalsCount: 2, totalXgot: 2.15 },
      { zone: "low_right", yNorm: 0.80, zNorm: 0.30, shotsCount: 7, goalsCount: 2, totalXgot: 2.28 },
    ];

    const shots: GoalmouthShot[] = [];
    for (const cfg of shotConfigs) {
      const perShotXgot = Math.round((cfg.totalXgot / cfg.shotsCount) * 1000) / 1000;
      let remainingXgot = cfg.totalXgot;

      for (let i = 0; i < cfg.shotsCount; i++) {
        const isGoal = i < cfg.goalsCount;
        const xgot = i === cfg.shotsCount - 1 ? Math.round(remainingXgot * 1000) / 1000 : perShotXgot;
        remainingXgot -= perShotXgot;

        shots.push({
          goalMouthY: cfg.yNorm,
          goalMouthZ: cfg.zNorm,
          xgot,
          isGoal,
        });
      }
    }

    expect(shots).toHaveLength(46);

    const result = analyzeGoalkeeperGoalmouth(shots);

    // Exact aggregate assertions matching prompt specification
    expect(result.shotsFaced).toBe(46);
    expect(result.goalsConceded).toBe(13);
    expect(result.saves).toBe(33);
    expect(result.xgotFaced).toBe(13.78);
    expect(result.prevented).toBe(0.78); // +0.78 goals prevented!
    expect(result.saveRatio).toBe(0.7174); // 33 / 46 = 0.71739... -> 0.7174
    expect(result.savePct).toBe(71.7);

    // 6-zone matrix assertions
    expect(Object.keys(result.zones)).toHaveLength(6);
    for (const key of GOALMOUTH_ZONES) {
      const z = result.zones[key];
      expect(z.shotsFaced).toBeGreaterThan(0);
      expect(z.saves + z.goalsConceded).toBe(z.shotsFaced);
      expect(z.prevented).toBe(Math.round((z.xgotFaced - z.goalsConceded) * 100) / 100);
    }

    expect(result.zones.top_center.shotsFaced).toBe(8);
    expect(result.zones.top_center.goalsConceded).toBe(3);
    expect(result.zones.top_center.xgotFaced).toBe(3.20);
    expect(result.zones.low_center.shotsFaced).toBe(10);
    expect(result.zones.low_center.goalsConceded).toBe(2);
  });

  it("handles raw Opta pitch coordinates seamlessly for shots", () => {
    const rawOptaShots: GoalmouthShot[] = [
      // y = 46.0 (left), z = 30.0 (top)
      { goalMouthY: 46.0, goalMouthZ: 30.0, xgot: 0.45, isGoal: false },
      // y = 50.0 (center), z = 10.0 (low)
      { goalMouthY: 50.0, goalMouthZ: 10.0, xgot: 0.80, isGoal: true },
    ];

    const res = analyzeGoalkeeperGoalmouth(rawOptaShots);
    expect(res.shotsFaced).toBe(2);
    expect(res.goalsConceded).toBe(1);
    expect(res.saves).toBe(1);
    expect(res.xgotFaced).toBe(1.25);
    expect(res.prevented).toBe(0.25);
    expect(res.zones.top_left.shotsFaced).toBe(1);
    expect(res.zones.low_center.shotsFaced).toBe(1);
  });
});

describe("4. Player & Lineup SKORE Rating Engine (OptaMatchRatingService)", () => {
  it("computes Rodrigo Aguirre hat-trick clamped to 10.0 ceiling", () => {
    // Rodrigo Aguirre: base 6.0 + 4.49 -> 10.49 clamped to 10.0
    const res = computePlayerSkore({ attack: 4.49 });
    expect(res.base).toBe(SKORE_BASELINE);
    expect(res.totalContribution).toBe(4.49);
    expect(res.rawSum).toBe(10.49);
    expect(res.skore).toBe(10.0);
    expect(res.grade).toBe("high");
    expect(res.formatted).toBe("10.00");
  });

  it("computes Marcel Ruiz rating correctly (6.0 + 1.01 -> 7.01)", () => {
    // Marcel Ruiz: base 6.0 + 1.01 -> 7.01
    const res = computePlayerSkore({ passing: 0.65, duels: 0.36 });
    expect(res.totalContribution).toBe(1.01);
    expect(res.rawSum).toBe(7.01);
    expect(res.skore).toBe(7.01);
    expect(res.grade).toBe("high");
    expect(res.formatted).toBe("7.01");
  });

  it("computes Hugo González rating correctly (6.0 - 0.56 -> 5.44)", () => {
    // Hugo González: base 6.0 - 0.56 -> 5.44
    const res = computePlayerSkore({ goalkeeping: -0.56 });
    expect(res.totalContribution).toBe(-0.56);
    expect(res.rawSum).toBe(5.44);
    expect(res.skore).toBe(5.44);
    expect(res.grade).toBe("low");
    expect(res.formatted).toBe("5.44");
  });

  it("respects the 3.0 floor clamp on catastrophic performances", () => {
    const res = computePlayerSkore({ defense: -2.5, discipline: -2.0 }); // 6.0 - 4.5 = 1.5 -> clamped to 3.0
    expect(res.rawSum).toBe(1.5);
    expect(res.skore).toBe(SKORE_FLOOR);
    expect(res.grade).toBe("low");
    expect(res.formatted).toBe("3.00");
  });

  it("grades properly at exact boundaries (7.0, 6.5, <6.5)", () => {
    expect(computePlayerSkore({ passing: 1.0 }).grade).toBe("high"); // 7.00
    expect(computePlayerSkore({ passing: 0.5 }).grade).toBe("mid"); // 6.50
    expect(computePlayerSkore({ passing: 0.49 }).grade).toBe("low"); // 6.49
  });

  it("computes average starting XI SKORE correctly", () => {
    const lineup = [6.4, 6.8, 7.2, 6.5, 6.6, 7.0, 6.9, 6.3, 7.4, 7.1, 6.7]; // 11 players
    const avg = computeLineupAverageSkore(lineup);
    const expected = Math.round((lineup.reduce((a, b) => a + b, 0) / 11) * 100) / 100;
    expect(avg).toBe(expected);
  });
});

describe("5. Pre-Match Lineup & Goalkeeper Probability Adjustment (applyLineupTacticalAdjustment)", () => {
  const baseProbs = {
    pHome: 0.45,
    pDraw: 0.28,
    pAway: 0.27,
  };

  it("maintains strict probability sum = 1.0 (within 1e-9 tolerance)", () => {
    const homeLineup = { startingXiSkoreAvg: 7.10, gkGoalsPreventedPer90: 0.35 };
    const awayLineup = { startingXiSkoreAvg: 6.35, gkGoalsPreventedPer90: -0.20 };

    const adj = applyLineupTacticalAdjustment(baseProbs, homeLineup, awayLineup);
    const sum = adj.pHome + adj.pDraw + adj.pAway;
    expect(Math.abs(sum - 1.0)).toBeLessThan(1e-9);
    expect(adj.pHome).toBeGreaterThan(0);
    expect(adj.pDraw).toBeGreaterThan(0);
    expect(adj.pAway).toBeGreaterThan(0);
  });

  it("yields identical probabilities when lineup & GK deltas are zero (identity)", () => {
    const homeLineup = { startingXiSkoreAvg: 6.60, gkGoalsPreventedPer90: 0.10 };
    const awayLineup = { startingXiSkoreAvg: 6.60, gkGoalsPreventedPer90: 0.10 };

    const adj = applyLineupTacticalAdjustment(baseProbs, homeLineup, awayLineup);
    expect(adj.skoreDelta).toBe(0.0);
    expect(adj.gkPreventionDelta).toBe(0.0);
    expect(adj.appliedTilt).toBe(0.0);
    expect(adj.pHome).toBeCloseTo(baseProbs.pHome, 6);
    expect(adj.pDraw).toBeCloseTo(baseProbs.pDraw, 6);
    expect(adj.pAway).toBeCloseTo(baseProbs.pAway, 6);
  });

  it("shifts probabilities monotonically when home team has a star lineup", () => {
    const neutralLineup = { startingXiSkoreAvg: 6.50 };
    const strongLineup = { startingXiSkoreAvg: 7.00 };
    const eliteLineup = { startingXiSkoreAvg: 7.50 };

    const adjNeutral = applyLineupTacticalAdjustment(baseProbs, neutralLineup, neutralLineup);
    const adjStrong = applyLineupTacticalAdjustment(baseProbs, strongLineup, neutralLineup);
    const adjElite = applyLineupTacticalAdjustment(baseProbs, eliteLineup, neutralLineup);

    // pHome strictly increases
    expect(adjStrong.pHome).toBeGreaterThan(adjNeutral.pHome);
    expect(adjElite.pHome).toBeGreaterThan(adjStrong.pHome);

    // pAway strictly decreases
    expect(adjStrong.pAway).toBeLessThan(adjNeutral.pAway);
    expect(adjElite.pAway).toBeLessThan(adjStrong.pAway);
  });

  it("shifts probabilities monotonically when home team fields an elite goalkeeper", () => {
    const baseLineup = { startingXiSkoreAvg: 6.60 };
    const avgGk = { ...baseLineup, gkGoalsPreventedPer90: 0.0 };
    const eliteGk = { ...baseLineup, gkGoalsPreventedPer90: 0.40 };
    const poorGk = { ...baseLineup, gkGoalsPreventedPer90: -0.40 };

    const adjElite = applyLineupTacticalAdjustment(baseProbs, eliteGk, avgGk);
    const adjPoor = applyLineupTacticalAdjustment(baseProbs, poorGk, avgGk);

    expect(adjElite.pHome).toBeGreaterThan(baseProbs.pHome);
    expect(adjPoor.pHome).toBeLessThan(baseProbs.pHome);
  });

  it("applies symmetric shifts when away team has the lineup advantage", () => {
    const homeLineup = { startingXiSkoreAvg: 6.40, gkGoalsPreventedPer90: -0.15 };
    const awayLineup = { startingXiSkoreAvg: 7.10, gkGoalsPreventedPer90: 0.30 };

    const adj = applyLineupTacticalAdjustment(baseProbs, homeLineup, awayLineup);
    expect(adj.skoreDelta).toBe(-0.70);
    expect(adj.gkPreventionDelta).toBe(-0.45);
    expect(adj.appliedTilt).toBeLessThan(0);
    expect(adj.pAway).toBeGreaterThan(baseProbs.pAway);
    expect(adj.pHome).toBeLessThan(baseProbs.pHome);
    expect(adj.pHome + adj.pDraw + adj.pAway).toBeCloseTo(1.0, 9);
  });

  it("respects maxTilt bound to prevent extreme tail distortion", () => {
    // Extreme unrealistic deltas
    const extremeHome = { startingXiSkoreAvg: 10.0, gkGoalsPreventedPer90: 5.0 };
    const extremeAway = { startingXiSkoreAvg: 3.0, gkGoalsPreventedPer90: -5.0 };

    const adj = applyLineupTacticalAdjustment(baseProbs, extremeHome, extremeAway, {
      maxTilt: 0.85,
    });
    expect(adj.appliedTilt).toBe(0.85);
    expect(adj.pHome + adj.pDraw + adj.pAway).toBeCloseTo(1.0, 9);
    expect(adj.pAway).toBeGreaterThan(0.01); // away still has non-zero probability
  });
});
