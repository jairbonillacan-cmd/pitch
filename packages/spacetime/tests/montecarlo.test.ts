import { describe, expect, it } from "vitest";
import {
  calculateAnalyticalXPts,
  createMulberry32,
  eloTo1X2,
  simulateSeason,
  type LeagueFormatConfig,
  type ScheduledFixtureInput,
  type TeamStandingInput,
} from "../src/montecarlo";

describe("Monte Carlo Season Projection Engine", () => {
  // Mock 6-team league setup for controlled analytical testing
  const createMockLeague = () => {
    const standings: TeamStandingInput[] = [
      { teamId: "T1", teamName: "Alpha FC", points: 50, played: 20, goalDifference: 25, goalsFor: 45, eloRating: 1750 },
      { teamId: "T2", teamName: "Beta United", points: 46, played: 20, goalDifference: 18, goalsFor: 38, eloRating: 1680 },
      { teamId: "T3", teamName: "Gamma CF", points: 40, played: 20, goalDifference: 8, goalsFor: 30, eloRating: 1590 },
      { teamId: "T4", teamName: "Delta SC", points: 30, played: 20, goalDifference: 0, goalsFor: 25, eloRating: 1500 },
      { teamId: "T5", teamName: "Epsilon Real", points: 26, played: 20, goalDifference: -10, goalsFor: 20, eloRating: 1420 },
      { teamId: "T6", teamName: "Zeta City", points: 23, played: 20, goalDifference: -15, goalsFor: 18, eloRating: 1350 },
    ];

    const fixtures: ScheduledFixtureInput[] = [
      { homeTeamId: "T1", awayTeamId: "T2", pHome: 0.52, pDraw: 0.26, pAway: 0.22 },
      { homeTeamId: "T3", awayTeamId: "T4", pHome: 0.48, pDraw: 0.27, pAway: 0.25 },
      { homeTeamId: "T5", awayTeamId: "T6", pHome: 0.55, pDraw: 0.25, pAway: 0.20 },
      { homeTeamId: "T2", awayTeamId: "T3", pHome: 0.50, pDraw: 0.28, pAway: 0.22 },
      { homeTeamId: "T4", awayTeamId: "T1", pHome: 0.22, pDraw: 0.26, pAway: 0.52 },
      { homeTeamId: "T6", awayTeamId: "T5", pHome: 0.35, pDraw: 0.28, pAway: 0.37 },
    ];

    return { standings, fixtures };
  };

  describe("PRNG & Utility Helpers", () => {
    it("createMulberry32 produces deterministic numbers in [0, 1)", () => {
      const rng1 = createMulberry32(12345);
      const rng2 = createMulberry32(12345);

      const seq1 = Array.from({ length: 100 }, () => rng1());
      const seq2 = Array.from({ length: 100 }, () => rng2());

      expect(seq1).toEqual(seq2);
      expect(seq1.every((v) => v >= 0 && v < 1)).toBe(true);
    });

    it("eloTo1X2 returns normalized probabilities reflecting rating difference and home advantage", () => {
      const even = eloTo1X2(1500, 1500, 65);
      expect(even.pHome).toBeGreaterThan(even.pAway);
      expect(even.pHome + even.pDraw + even.pAway).toBeCloseTo(1.0, 9);

      const strongHome = eloTo1X2(1700, 1400, 65);
      expect(strongHome.pHome).toBeGreaterThan(0.65);
      expect(strongHome.pAway).toBeLessThan(0.15);
      expect(strongHome.pHome + strongHome.pDraw + strongHome.pAway).toBeCloseTo(1.0, 9);
    });

    it("calculateAnalyticalXPts matches manual calculation exactly", () => {
      const { standings, fixtures } = createMockLeague();
      const xPtsMap = calculateAnalyticalXPts(standings, fixtures);

      // T1 current: 50.
      // Fixture 1: T1 vs T2 -> homeExp = 3 * 0.52 + 1 * 0.26 = 1.56 + 0.26 = 1.82
      // Fixture 5: T4 vs T1 -> awayExp = 3 * 0.52 + 1 * 0.26 = 1.56 + 0.26 = 1.82
      // Total expected for T1: 50 + 1.82 + 1.82 = 53.64
      const t1XPts = xPtsMap.get("T1");
      expect(t1XPts).toBeDefined();
      expect(t1XPts!).toBeCloseTo(53.64, 4);
    });
  });

  describe("Doubly Stochastic Property of Rank Matrix", () => {
    it("every row sums to 1.0 and every column sums to 1.0", () => {
      const { standings, fixtures } = createMockLeague();
      const result = simulateSeason({
        standings,
        fixtures,
        iterations: 10_000,
        seed: 42,
      });

      const N = standings.length;
      expect(result.rankMatrix.length).toBe(N);

      // 1. Each row (team rank distribution) sums to 1.0
      for (let i = 0; i < N; i++) {
        const rowSum = result.rankMatrix[i]!.reduce((sum, p) => sum + p, 0);
        expect(rowSum).toBeCloseTo(1.0, 6);
      }

      // 2. Each column (position occupied by teams) sums to 1.0
      for (let k = 0; k < N; k++) {
        let colSum = 0;
        for (let i = 0; i < N; i++) {
          colSum += result.rankMatrix[i]![k]!;
        }
        expect(colSum).toBeCloseTo(1.0, 6);
      }
    });
  });

  describe("Analytical xPts vs Monte Carlo Empirical Mean Agreement", () => {
    it("simulated mean points match analytical xPts within < 0.05 pts for 10,000 iterations", () => {
      const { standings, fixtures } = createMockLeague();
      const result = simulateSeason({
        standings,
        fixtures,
        iterations: 10_000,
        seed: 42,
      });

      for (const team of result.teams) {
        const diff = Math.abs(team.simulatedMeanPoints - team.xPts);
        expect(diff).toBeLessThan(0.05);
      }
    });

    it("Poisson simulation mode also converges closely to analytical xPts", () => {
      const { standings } = createMockLeague();
      // Fixtures with explicit Poisson lambdas
      const poissonFixtures: ScheduledFixtureInput[] = [
        { homeTeamId: "T1", awayTeamId: "T2", lambdaHome: 1.8, lambdaAway: 1.1 },
        { homeTeamId: "T3", awayTeamId: "T4", lambdaHome: 1.5, lambdaAway: 1.2 },
        { homeTeamId: "T5", awayTeamId: "T6", lambdaHome: 1.7, lambdaAway: 0.9 },
        { homeTeamId: "T2", awayTeamId: "T3", lambdaHome: 1.6, lambdaAway: 1.0 },
        { homeTeamId: "T4", awayTeamId: "T1", lambdaHome: 0.9, lambdaAway: 1.9 },
        { homeTeamId: "T6", awayTeamId: "T5", lambdaHome: 1.1, lambdaAway: 1.4 },
      ];

      const result = simulateSeason({
        standings,
        fixtures: poissonFixtures,
        iterations: 10_000,
        seed: 42,
        simulationMode: "poisson",
      });

      for (const team of result.teams) {
        // Poisson model converges to analytical xPts
        const diff = Math.abs(team.simulatedMeanPoints - team.xPts);
        expect(diff).toBeLessThan(0.05);
      }
    });
  });

  describe("Monotonicity & Consistency", () => {
    it("stronger team with higher points has strictly higher pSuperlider and pChampion in standard league", () => {
      const { standings, fixtures } = createMockLeague();
      const result = simulateSeason({
        standings,
        fixtures,
        formatConfig: { format: "standard", topDirect: 2, relegationSpots: 2 },
        iterations: 10_000,
        seed: 42,
      });

      const teamMap = new Map(result.teams.map((t) => [t.teamId, t]));
      const t1 = teamMap.get("T1")!;
      const t2 = teamMap.get("T2")!;
      const t3 = teamMap.get("T3")!;
      const t5 = teamMap.get("T5")!;
      const t6 = teamMap.get("T6")!;

      // Superlíder / Champion monotonicity
      expect(t1.pSuperlider).toBeGreaterThan(t2.pSuperlider);
      expect(t2.pSuperlider).toBeGreaterThan(t3.pSuperlider);
      expect(t1.pChampion).toBeGreaterThan(t2.pChampion);

      // Relegation monotonicity (bottom teams have highest pRelegation)
      expect(t6.pRelegation).toBeGreaterThan(t5.pRelegation);
      expect(t5.pRelegation).toBeGreaterThan(t3.pRelegation);

      // In standard league format, pChampion === pSuperlider
      expect(t1.pChampion).toBeCloseTo(t1.pSuperlider, 6);
      expect(t2.pChampion).toBeCloseTo(t2.pSuperlider, 6);

      // Champion probabilities sum to 1.0
      const totalChampion = result.teams.reduce((acc, t) => acc + t.pChampion, 0);
      expect(totalChampion).toBeCloseTo(1.0, 6);
    });
  });

  describe("Liga MX / Liguilla & Play-In Simulation Mode", () => {
    const createLigaMXLeague = () => {
      const teamNames = [
        "Cruz Azul", "Toluca", "Tigres UANL", "Monterrey", "Pumas UNAM", "América",
        "Atlético San Luis", "Guadalajara", "Necaxa", "Atlas", "León", "Puebla",
        "Juárez", "Mazatlán", "Pachuca", "Querétaro", "Santos Laguna", "Tijuana",
      ];

      const standings: TeamStandingInput[] = teamNames.map((name, idx) => ({
        teamId: `MX_${idx + 1}`,
        teamName: name,
        points: 38 - idx * 2, // 38, 36, 34, ..., 4
        played: 15,
        goalDifference: 18 - idx * 2,
        goalsFor: 28 - idx,
        eloRating: 1650 - idx * 18,
      }));

      // 2 remaining matchdays (18 fixtures)
      const fixtures: ScheduledFixtureInput[] = [
        { homeTeamId: "MX_1", awayTeamId: "MX_6", pHome: 0.50, pDraw: 0.28, pAway: 0.22 },
        { homeTeamId: "MX_2", awayTeamId: "MX_5", pHome: 0.52, pDraw: 0.26, pAway: 0.22 },
        { homeTeamId: "MX_3", awayTeamId: "MX_4", pHome: 0.45, pDraw: 0.28, pAway: 0.27 },
        { homeTeamId: "MX_7", awayTeamId: "MX_8", pHome: 0.46, pDraw: 0.28, pAway: 0.26 },
        { homeTeamId: "MX_9", awayTeamId: "MX_10", pHome: 0.44, pDraw: 0.28, pAway: 0.28 },
        { homeTeamId: "MX_11", awayTeamId: "MX_12", pHome: 0.45, pDraw: 0.27, pAway: 0.28 },
        { homeTeamId: "MX_13", awayTeamId: "MX_14", pHome: 0.43, pDraw: 0.29, pAway: 0.28 },
        { homeTeamId: "MX_15", awayTeamId: "MX_16", pHome: 0.42, pDraw: 0.28, pAway: 0.30 },
        { homeTeamId: "MX_17", awayTeamId: "MX_18", pHome: 0.40, pDraw: 0.28, pAway: 0.32 },
        // Matchday 17
        { homeTeamId: "MX_6", awayTeamId: "MX_2", pHome: 0.42, pDraw: 0.28, pAway: 0.30 },
        { homeTeamId: "MX_5", awayTeamId: "MX_1", pHome: 0.35, pDraw: 0.27, pAway: 0.38 },
        { homeTeamId: "MX_4", awayTeamId: "MX_7", pHome: 0.52, pDraw: 0.26, pAway: 0.22 },
        { homeTeamId: "MX_8", awayTeamId: "MX_3", pHome: 0.38, pDraw: 0.28, pAway: 0.34 },
        { homeTeamId: "MX_10", awayTeamId: "MX_11", pHome: 0.44, pDraw: 0.28, pAway: 0.28 },
        { homeTeamId: "MX_12", awayTeamId: "MX_9", pHome: 0.40, pDraw: 0.28, pAway: 0.32 },
        { homeTeamId: "MX_14", awayTeamId: "MX_15", pHome: 0.44, pDraw: 0.28, pAway: 0.28 },
        { homeTeamId: "MX_16", awayTeamId: "MX_17", pHome: 0.43, pDraw: 0.28, pAway: 0.29 },
        { homeTeamId: "MX_18", awayTeamId: "MX_13", pHome: 0.40, pDraw: 0.28, pAway: 0.32 },
      ];

      return { standings, fixtures };
    };

    it("simulates full Liga MX Apertura/Clausura with Play-In and Liguilla knockout bracket", () => {
      const { standings, fixtures } = createLigaMXLeague();
      const formatConfig: LeagueFormatConfig = {
        format: "ligamx",
        topDirect: 6,
        playInStart: 7,
        playInEnd: 10,
        relegationSpots: 0,
        playoffHigherSeedAdvancesOnTie: true,
      };

      const result = simulateSeason({
        standings,
        fixtures,
        formatConfig,
        iterations: 10_000,
        seed: 777,
      });

      expect(result.teams.length).toBe(18);

      // Superlíder is highest for the top team (Cruz Azul)
      const cruzAzul = result.teams.find((t) => t.teamName === "Cruz Azul")!;
      expect(cruzAzul.pSuperlider).toBeGreaterThan(0.70);

      // Direct Liguilla (Top 6) probability for top teams is near 100%
      expect(cruzAzul.pDirectPlayoff).toBeGreaterThan(0.99);

      // Teams in spots 7..10 have high pPlayIn
      const sanLuis = result.teams.find((t) => t.teamName === "Atlético San Luis")!;
      const chivas = result.teams.find((t) => t.teamName === "Guadalajara")!;
      expect(sanLuis.pPlayIn + sanLuis.pDirectPlayoff).toBeGreaterThan(0.85);
      expect(chivas.pPlayIn + chivas.pDirectPlayoff).toBeGreaterThan(0.85);

      // Knockout Liguilla produces a valid champion probability distribution
      const totalChampion = result.teams.reduce((acc, t) => acc + t.pChampion, 0);
      expect(totalChampion).toBeCloseTo(1.0, 6);

      // In Liga MX Liguilla, pChampion is not equal to pSuperlider!
      // (Even the #1 seed can be eliminated in Cuartos/Semis)
      expect(cruzAzul.pChampion).toBeLessThan(cruzAzul.pSuperlider);
      expect(cruzAzul.pChampion).toBeGreaterThan(0.15); // Still favorite

      // Rank matrix is doubly stochastic (18 x 18)
      expect(result.rankMatrix.length).toBe(18);
      for (let i = 0; i < 18; i++) {
        const rowSum = result.rankMatrix[i]!.reduce((sum, p) => sum + p, 0);
        expect(rowSum).toBeCloseTo(1.0, 6);
      }
      for (let k = 0; k < 18; k++) {
        let colSum = 0;
        for (let i = 0; i < 18; i++) {
          colSum += result.rankMatrix[i]![k]!;
        }
        expect(colSum).toBeCloseTo(1.0, 6);
      }
    });
  });

  describe("Performance & Benchmark", () => {
    it("executes 10,000 iterations in < 25ms", () => {
      const { standings, fixtures } = createMockLeague();

      // Warmup JIT
      simulateSeason({
        standings,
        fixtures,
        iterations: 1_000,
        seed: 123,
      });

      const start = performance.now();
      const result = simulateSeason({
        standings,
        fixtures,
        iterations: 10_000,
        seed: 42,
      });
      const duration = performance.now() - start;

      // Assert runtime target (< 25ms)
      expect(duration).toBeLessThan(25.0);
      expect(result.elapsedMs).toBeLessThan(25.0);
    });
  });

  describe("Reproducibility & Determinism", () => {
    it("two runs with the exact same seed produce bitwise identical results", () => {
      const { standings, fixtures } = createMockLeague();

      const run1 = simulateSeason({ standings, fixtures, iterations: 2_000, seed: 999 });
      const run2 = simulateSeason({ standings, fixtures, iterations: 2_000, seed: 999 });

      expect(run1.rankMatrix).toEqual(run2.rankMatrix);
      expect(run1.teams.map((t) => t.pChampion)).toEqual(run2.teams.map((t) => t.pChampion));
      expect(run1.teams.map((t) => t.simulatedMeanPoints)).toEqual(
        run2.teams.map((t) => t.simulatedMeanPoints),
      );
    });

    it("handles completed season with 0 remaining fixtures deterministically", () => {
      const { standings } = createMockLeague();
      const result = simulateSeason({
        standings,
        fixtures: [],
        iterations: 500,
      });

      expect(result.teams.length).toBe(standings.length);
      const champ = result.teams[0]!;
      expect(champ.pSuperlider).toBe(1.0);
      expect(champ.pChampion).toBe(1.0);
      expect(champ.xPts).toBe(champ.currentPoints);
      expect(champ.simulatedMeanPoints).toBe(champ.currentPoints);
    });
  });
});
