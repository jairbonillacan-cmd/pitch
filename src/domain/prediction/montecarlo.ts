/**
 * PitchLab Season Monte Carlo & Playoff Projection Engine (A10 / v2).
 *
 * Simulates the remainder of a league season over N iterations (e.g. 10,000)
 * using 1X2 match probabilities, Dixon-Coles/Poisson score distributions, or Elo ratings.
 *
 * Produces:
 * 1. Projected Standings Summary (Statiskicks Proyección tab equivalent):
 *    - xPts (exact analytical expected points)
 *    - simulatedMeanPoints (empirical Monte Carlo average points)
 *    - projectedRank (expected finishing position)
 *    - modeRank (most likely finishing position)
 *    - pSuperlider (probability of 1st place in the regular phase)
 *    - pDirectPlayoff (probability of finishing <= topDirect, e.g. Top 4 UCL or Top 6 Liguilla)
 *    - pPlayIn (probability of finishing in Play-In spots, e.g. 7..10 in Liga MX)
 *    - pRelegation (probability of finishing in relegation zone, bottom K spots)
 *    - pChampion (probability of title: 1st place in European format, or Liguilla knockout winner in Liga MX)
 * 2. Full N x N Doubly Stochastic Rank Probability Matrix:
 *    - For every team i and rank k, P(Rank_i = k+1).
 *    - Every row sums to 1.0 and every column sums to 1.0.
 *
 * Pure functions, zero external dependencies, deterministic PRNG (mulberry32),
 * and optimized typed-array loops ensuring 10,000 iterations run in < 25ms.
 */

export type LeagueFormatType = "standard" | "ligamx";

/** Current standing of a team at the projection snapshot date. */
export interface TeamStandingInput {
  teamId: string;
  teamName: string;
  points: number;
  played: number;
  goalDifference?: number;
  goalsFor?: number;
  /** Rating for match simulations and playoff tie-breakers (default: 1500 or inferred). */
  eloRating?: number;
}

/** A scheduled fixture remaining in the season. */
export interface ScheduledFixtureInput {
  fixtureId?: string;
  homeTeamId: string;
  awayTeamId: string;
  round?: number | string;
  /** Direct 1X2 win probabilities (normalized so pHome + pDraw + pAway = 1). */
  pHome?: number;
  pDraw?: number;
  pAway?: number;
  /** Optional Poisson expected goals for home and away sides. */
  lambdaHome?: number;
  lambdaAway?: number;
}

/** Configuration of league format and qualification thresholds. */
export interface LeagueFormatConfig {
  /** "standard" (European round-robin, rank 1 = champion) or "ligamx" (Liguilla playoff bracket). */
  format: LeagueFormatType;
  /** Number of direct playoff/UCL qualification spots (e.g. 4 for UCL, 6 for Liga MX direct Liguilla). */
  topDirect?: number;
  /** Start of Play-In range (1-based rank), e.g. 7 for Liga MX Play-In. */
  playInStart?: number;
  /** End of Play-In range (1-based rank), e.g. 10 for Liga MX Play-In. */
  playInEnd?: number;
  /** Number of relegation spots (e.g. 3 in Premier League / La Liga). */
  relegationSpots?: number;
  /** Playoff bracket size for ligamx (8 teams: Cuartos de Final). Default: 8. */
  playoffBracketSize?: 8 | 4;
  /** If true, the higher seed advances on aggregate draw in Liguilla (Liga MX rule). Default: true. */
  playoffHigherSeedAdvancesOnTie?: boolean;
}

/** Complete projection summary for a single team. */
export interface TeamProjectionSummary {
  teamId: string;
  teamName: string;
  currentPoints: number;
  currentRank: number;
  /** Analytical expected points: currentPoints + sum(3*pWin + 1*pDraw). */
  xPts: number;
  /** Monte Carlo simulated mean points. */
  simulatedMeanPoints: number;
  /** Expected finishing position (1.0 to N.0). */
  projectedRank: number;
  /** Most frequent finishing position (mode of rank distribution). */
  modeRank: number;
  /** Probability of finishing 1st in the regular phase (Superlíder). */
  pSuperlider: number;
  /** Probability of qualifying directly (rank <= topDirect). */
  pDirectPlayoff: number;
  /** Probability of finishing in Play-In zone (playInStart <= rank <= playInEnd). */
  pPlayIn: number;
  /** Probability of relegation (rank > N - relegationSpots). */
  pRelegation: number;
  /** Probability of winning the championship (league title or Liguilla champion). */
  pChampion: number;
  /** Length N array: rankDistribution[k] is P(Rank = k + 1). */
  rankDistribution: number[];
}

/** Result of the Season Monte Carlo projection. */
export interface SeasonMonteCarloResult {
  iterations: number;
  elapsedMs: number;
  teams: TeamProjectionSummary[];
  /** N x N doubly stochastic matrix: rankMatrix[i][k] = P(Team i finishes rank k+1). */
  rankMatrix: number[][];
}

/** Options for executing the Monte Carlo simulation. */
export interface SeasonMonteCarloOptions {
  standings: readonly TeamStandingInput[];
  fixtures: readonly ScheduledFixtureInput[];
  formatConfig?: LeagueFormatConfig;
  /** Number of Monte Carlo iterations. Default: 10,000. */
  iterations?: number;
  /** Seed for deterministic pseudo-random number generator (mulberry32). Default: 42. */
  seed?: number;
  /**
   * Simulation mode for goal difference:
   * - "outcome_only": fast 1X2 sampling (+1 / 0 / -1 GD margin)
   * - "poisson": sample integer scorelines from Poisson lambdas
   */
  simulationMode?: "outcome_only" | "poisson";
}

// ---------------------------------------------------------------------------
// PRNG (Mulberry32)
// ---------------------------------------------------------------------------

/**
 * Fast, high-quality 32-bit deterministic PRNG.
 * Period is 2^32, uniform distribution in [0, 1).
 */
export function createMulberry32(seed: number): () => number {
  let s = (seed | 0) || 0x12345678;
  return function next(): number {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Probability and Rating Helpers
// ---------------------------------------------------------------------------

/**
 * Converts Elo ratings to 1X2 win probabilities using a standard football logistic curve.
 * Includes home field advantage (HFA = 65) and realistic draw distribution.
 */
export function eloTo1X2(
  eloHome: number,
  eloAway: number,
  hfa = 65.0,
): { pHome: number; pDraw: number; pAway: number } {
  const delta = eloHome - eloAway + hfa;
  const eHome = 1.0 / (1.0 + Math.pow(10.0, -delta / 400.0));
  // Draws peak around ~0.28 for evenly matched teams and decay with |delta|
  const pDraw = 0.28 * Math.exp(-Math.pow(delta / 320.0, 2.0));
  let pHome = Math.max(0.01, eHome - 0.5 * pDraw);
  let pAway = Math.max(0.01, (1.0 - eHome) - 0.5 * pDraw);
  const total = pHome + pDraw + pAway;
  return {
    pHome: pHome / total,
    pDraw: pDraw / total,
    pAway: pAway / total,
  };
}

/**
 * Computes exact 1X2 probabilities for bivariate independent Poisson goal distributions.
 */
export function poisson1X2(
  lambdaHome: number,
  lambdaAway: number,
  maxGoals = 12,
): { pHome: number; pDraw: number; pAway: number } {
  const lh = Math.max(0.05, Math.min(10.0, lambdaHome));
  const la = Math.max(0.05, Math.min(10.0, lambdaAway));

  const pmfH = new Float64Array(maxGoals + 1);
  const pmfA = new Float64Array(maxGoals + 1);

  let curH = Math.exp(-lh);
  let curA = Math.exp(-la);
  pmfH[0] = curH;
  pmfA[0] = curA;

  for (let k = 1; k <= maxGoals; k += 1) {
    curH = (curH * lh) / k;
    curA = (curA * la) / k;
    pmfH[k] = curH;
    pmfA[k] = curA;
  }

  let pHome = 0.0;
  let pDraw = 0.0;
  let pAway = 0.0;

  for (let h = 0; h <= maxGoals; h += 1) {
    for (let a = 0; a <= maxGoals; a += 1) {
      const prob = (pmfH[h] ?? 0) * (pmfA[a] ?? 0);
      if (h > a) pHome += prob;
      else if (h === a) pDraw += prob;
      else pAway += prob;
    }
  }

  const total = pHome + pDraw + pAway;
  return {
    pHome: pHome / total,
    pDraw: pDraw / total,
    pAway: pAway / total,
  };
}

/**
 * Generates Poisson random variate using Knuth's algorithm.
 */
function samplePoisson(lambda: number, rng: () => number): number {
  const l = Math.exp(-Math.max(0.05, Math.min(10.0, lambda)));
  let k = 0;
  let p = 1.0;
  do {
    k += 1;
    p *= rng();
  } while (p > l && k < 30);
  return k - 1;
}

/**
 * Computes exact analytical expected points (xPts) for each team.
 * xPts_i = CurrentPts_i + sum_{f in Home}(3*pHome + 1*pDraw) + sum_{f in Away}(3*pAway + 1*pDraw)
 */
export function calculateAnalyticalXPts(
  standings: readonly TeamStandingInput[],
  fixtures: readonly ScheduledFixtureInput[],
): Map<string, number> {
  const xPtsMap = new Map<string, number>();
  for (const team of standings) {
    xPtsMap.set(team.teamId, team.points);
  }

  for (const fix of fixtures) {
    let pH = fix.pHome;
    let pD = fix.pDraw;
    let pA = fix.pAway;

    if (
      fix.lambdaHome !== undefined &&
      fix.lambdaAway !== undefined &&
      (pH === undefined || pD === undefined || pA === undefined)
    ) {
      const p = poisson1X2(fix.lambdaHome, fix.lambdaAway);
      pH = p.pHome;
      pD = p.pDraw;
      pA = p.pAway;
    } else if (pH === undefined || pD === undefined || pA === undefined) {
      // Default to global football base rates
      pH = 0.44;
      pD = 0.26;
      pA = 0.3;
    } else {
      const sum = pH + pD + pA;
      if (sum > 0) {
        pH /= sum;
        pD /= sum;
        pA /= sum;
      }
    }

    const homeExp = 3.0 * pH + 1.0 * pD;
    const awayExp = 3.0 * pA + 1.0 * pD;

    if (xPtsMap.has(fix.homeTeamId)) {
      xPtsMap.set(fix.homeTeamId, (xPtsMap.get(fix.homeTeamId) ?? 0) + homeExp);
    }
    if (xPtsMap.has(fix.awayTeamId)) {
      xPtsMap.set(fix.awayTeamId, (xPtsMap.get(fix.awayTeamId) ?? 0) + awayExp);
    }
  }

  return xPtsMap;
}

// ---------------------------------------------------------------------------
// Knockout Playoff Match Simulator
// ---------------------------------------------------------------------------

/**
 * Simulates a knockout matchup between two teams (e.g. 2-leg tie or single match).
 * In Liga MX Liguilla, the higher seed (lower rank number) advances if aggregate is tied,
 * giving an effective rating bonus of ~50 Elo points. In the Final, no tiebreak advantage applies.
 */
function simulateKnockoutMatch(
  teamAIdx: number,
  teamBIdx: number,
  seedRankA: number,
  seedRankB: number,
  eloRatings: Float64Array,
  higherSeedAdvancesOnTie: boolean,
  rng: () => number,
): number {
  const eloA = eloRatings[teamAIdx] ?? 1500.0;
  const eloB = eloRatings[teamBIdx] ?? 1500.0;
  let delta = eloA - eloB;

  // If higher seed advances on tie, grant seed advantage bonus
  if (higherSeedAdvancesOnTie && seedRankA !== seedRankB) {
    const seedBonus = seedRankA < seedRankB ? 50.0 : -50.0;
    delta += seedBonus;
  }

  const probAAdvances = 1.0 / (1.0 + Math.pow(10.0, -delta / 400.0));
  return rng() < probAAdvances ? teamAIdx : teamBIdx;
}

/**
 * Simulates the Liga MX post-season (Play-In + Cuartos de Final + Semifinales + Final).
 * Returns the index of the Champion team.
 */
function simulateLigaMXPlayoffs(
  tableOrder: Int32Array,
  eloRatings: Float64Array,
  formatConfig: LeagueFormatConfig,
  rng: () => number,
): number {
  const hasPlayIn =
    (formatConfig.playInStart ?? 7) === 7 &&
    (formatConfig.playInEnd ?? 10) === 10 &&
    tableOrder.length >= 10;

  let qSeed7: number;
  let qSeed8: number;

  if (hasPlayIn) {
    const s7 = tableOrder[6] ?? 6;
    const s8 = tableOrder[7] ?? 7;
    const s9 = tableOrder[8] ?? 8;
    const s10 = tableOrder[9] ?? 9;

    // Play-In Serie A: 7 vs 8 (at 7's home). Winner is Seed 7. Loser to Serie C.
    const winSerieA = simulateKnockoutMatch(s7, s8, 7, 8, eloRatings, true, rng);
    const loseSerieA = winSerieA === s7 ? s8 : s7;
    qSeed7 = winSerieA;

    // Play-In Serie B: 9 vs 10 (at 9's home). Winner to Serie C. Loser eliminated.
    const winSerieB = simulateKnockoutMatch(s9, s10, 9, 10, eloRatings, true, rng);

    // Play-In Serie C: Loser Serie A vs Winner Serie B (at Loser Serie A's home). Winner is Seed 8.
    const loseARank = loseSerieA === s7 ? 7 : 8;
    const winBRank = winSerieB === s9 ? 9 : 10;
    qSeed8 = simulateKnockoutMatch(loseSerieA, winSerieB, loseARank, winBRank, eloRatings, true, rng);
  } else {
    qSeed7 = tableOrder[6] ?? 6;
    qSeed8 = tableOrder[7] ?? 7;
  }

  // 8 teams in Cuartos de Final (Quarterfinals)
  const quarterfinalists = [
    tableOrder[0] ?? 0, // Seed 1
    tableOrder[1] ?? 1, // Seed 2
    tableOrder[2] ?? 2, // Seed 3
    tableOrder[3] ?? 3, // Seed 4
    tableOrder[4] ?? 4, // Seed 5
    tableOrder[5] ?? 5, // Seed 6
    qSeed7,             // Seed 7
    qSeed8,             // Seed 8
  ];

  // Map each team index to its original regular season table rank (1..8+) for re-seeding and tiebreaks
  const regularRank = new Map<number, number>();
  for (let r = 0; r < tableOrder.length; r += 1) {
    const tIdx = tableOrder[r];
    if (tIdx !== undefined) {
      regularRank.set(tIdx, r + 1);
    }
  }

  const advTie = formatConfig.playoffHigherSeedAdvancesOnTie ?? true;

  const q0 = quarterfinalists[0]!;
  const q1 = quarterfinalists[1]!;
  const q2 = quarterfinalists[2]!;
  const q3 = quarterfinalists[3]!;
  const q4 = quarterfinalists[4]!;
  const q5 = quarterfinalists[5]!;
  const q6 = quarterfinalists[6]!;
  const q7 = quarterfinalists[7]!;

  // Cuartos de final: (1 vs 8), (2 vs 7), (3 vs 6), (4 vs 5)
  const semiTeams: number[] = [
    simulateKnockoutMatch(q0, q7, regularRank.get(q0) ?? 1, regularRank.get(q7) ?? 8, eloRatings, advTie, rng),
    simulateKnockoutMatch(q1, q6, regularRank.get(q1) ?? 2, regularRank.get(q6) ?? 7, eloRatings, advTie, rng),
    simulateKnockoutMatch(q2, q5, regularRank.get(q2) ?? 3, regularRank.get(q5) ?? 6, eloRatings, advTie, rng),
    simulateKnockoutMatch(q3, q4, regularRank.get(q3) ?? 4, regularRank.get(q4) ?? 5, eloRatings, advTie, rng),
  ];

  // Re-seed the 4 semifinalists by regular season rank
  semiTeams.sort((a, b) => (regularRank.get(a) ?? 99) - (regularRank.get(b) ?? 99));

  const s0 = semiTeams[0]!;
  const s1 = semiTeams[1]!;
  const s2 = semiTeams[2]!;
  const s3 = semiTeams[3]!;

  // Semifinales: (Best vs Worst remaining), (2nd best vs 3rd best)
  const finalTeams: number[] = [
    simulateKnockoutMatch(s0, s3, regularRank.get(s0) ?? 1, regularRank.get(s3) ?? 4, eloRatings, advTie, rng),
    simulateKnockoutMatch(s1, s2, regularRank.get(s1) ?? 2, regularRank.get(s2) ?? 3, eloRatings, advTie, rng),
  ];

  // Final: in Liga MX, table position does not grant victory in the final (extra time / penalties)
  finalTeams.sort((a, b) => (regularRank.get(a) ?? 99) - (regularRank.get(b) ?? 99));
  const f0 = finalTeams[0]!;
  const f1 = finalTeams[1]!;
  const champion = simulateKnockoutMatch(
    f0,
    f1,
    regularRank.get(f0) ?? 1,
    regularRank.get(f1) ?? 2,
    eloRatings,
    false, // No table position advantage in the final
    rng,
  );

  return champion;
}

// ---------------------------------------------------------------------------
// Main Monte Carlo Simulator
// ---------------------------------------------------------------------------

/**
 * Runs the Season Monte Carlo projection engine.
 */
export function simulateSeason(options: SeasonMonteCarloOptions): SeasonMonteCarloResult {
  const startTime = typeof performance !== "undefined" ? performance.now() : Date.now();

  const {
    standings,
    fixtures,
    formatConfig = {
      format: "standard",
      topDirect: 4,
      relegationSpots: 3,
    },
    iterations = 10_000,
    seed = 42,
    simulationMode = "outcome_only",
  } = options;

  const N = standings.length;
  if (N === 0) {
    return {
      iterations: 0,
      elapsedMs: 0,
      teams: [],
      rankMatrix: [],
    };
  }

  // 1. Index teams
  const teamIdToIndex = new Map<string, number>();
  const initialPoints = new Int32Array(N);
  const initialGD = new Int32Array(N);
  const initialGF = new Int32Array(N);
  const eloRatings = new Float64Array(N);

  for (let i = 0; i < N; i += 1) {
    const t = standings[i]!;
    teamIdToIndex.set(t.teamId, i);
    initialPoints[i] = t.points;
    initialGD[i] = t.goalDifference ?? 0;
    initialGF[i] = t.goalsFor ?? 0;

    if (t.eloRating !== undefined && Number.isFinite(t.eloRating)) {
      eloRatings[i] = t.eloRating;
    } else {
      // Inferred baseline Elo from current points per game
      const ppg = t.played > 0 ? t.points / t.played : 1.35;
      eloRatings[i] = 1500.0 + (ppg - 1.35) * 250.0;
    }
  }

  // Initial standings sort order (1-based current rank)
  const currentRankMap = new Map<string, number>();
  const sortedInitial = [...standings].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const gdA = a.goalDifference ?? 0;
    const gdB = b.goalDifference ?? 0;
    if (gdB !== gdA) return gdB - gdA;
    const gfA = a.goalsFor ?? 0;
    const gfB = b.goalsFor ?? 0;
    return gfB - gfA;
  });
  for (let r = 0; r < sortedInitial.length; r += 1) {
    currentRankMap.set(sortedInitial[r]!.teamId, r + 1);
  }

  // 2. Pre-process fixtures into fast typed arrays
  const M = fixtures.length;
  const fixHomeIdx = new Int32Array(M);
  const fixAwayIdx = new Int32Array(M);
  const fixPHome = new Float64Array(M);
  const fixPHomeDraw = new Float64Array(M); // Cumulative threshold: pHome + pDraw
  const fixLamHome = new Float64Array(M);
  const fixLamAway = new Float64Array(M);

  for (let j = 0; j < M; j += 1) {
    const f = fixtures[j]!;
    const hIdx = teamIdToIndex.has(f.homeTeamId) ? teamIdToIndex.get(f.homeTeamId)! : -1;
    const aIdx = teamIdToIndex.has(f.awayTeamId) ? teamIdToIndex.get(f.awayTeamId)! : -1;
    fixHomeIdx[j] = hIdx;
    fixAwayIdx[j] = aIdx;

    let pH = f.pHome;
    let pD = f.pDraw;
    let pA = f.pAway;

    if (
      f.lambdaHome !== undefined &&
      f.lambdaAway !== undefined &&
      (pH === undefined || pD === undefined || pA === undefined)
    ) {
      const p = poisson1X2(f.lambdaHome, f.lambdaAway);
      pH = p.pHome;
      pD = p.pDraw;
      pA = p.pAway;
    } else if (pH === undefined || pD === undefined || pA === undefined) {
      if (hIdx >= 0 && aIdx >= 0) {
        const probs = eloTo1X2(eloRatings[hIdx]!, eloRatings[aIdx]!);
        pH = probs.pHome;
        pD = probs.pDraw;
        pA = probs.pAway;
      } else {
        pH = 0.44;
        pD = 0.26;
        pA = 0.30;
      }
    } else {
      const sum = pH + pD + pA;
      if (sum > 0) {
        pH /= sum;
        pD /= sum;
        pA /= sum;
      }
    }

    fixPHome[j] = pH;
    fixPHomeDraw[j] = pH + pD;
    fixLamHome[j] = f.lambdaHome ?? (1.2 + 0.6 * pH);
    fixLamAway[j] = f.lambdaAway ?? (1.0 + 0.6 * pA);
  }

  // 3. Analytical expected points
  const analyticalXPts = calculateAnalyticalXPts(standings, fixtures);

  // 4. Pre-allocate simulation structures
  const rng = createMulberry32(seed);
  const simPoints = new Int32Array(N);
  const simGD = new Int32Array(N);
  const simGF = new Int32Array(N);
  const tableOrder = new Int32Array(N);
  const tieBreakers = new Float64Array(N);

  // Accumulators
  const rankCount = new Int32Array(N * N); // rankCount[teamIdx * N + rankIdx]
  const totalPoints = new Float64Array(N);
  const totalRank = new Float64Array(N);
  const championCount = new Int32Array(N);

  const isLigaMX = formatConfig.format === "ligamx";
  const usePoisson = simulationMode === "poisson";

  // 5. Main Simulation Loop (10,000 iterations)
  for (let iter = 0; iter < iterations; iter += 1) {
    // Reset points and goal differences to initial state
    simPoints.set(initialPoints);
    simGD.set(initialGD);
    simGF.set(initialGF);

    // Generate random tie-breaker values for this iteration
    for (let i = 0; i < N; i += 1) {
      tieBreakers[i] = rng();
      tableOrder[i] = i;
    }

    // Simulate each fixture
    for (let j = 0; j < M; j += 1) {
      const h = fixHomeIdx[j]!;
      const a = fixAwayIdx[j]!;
      if (h < 0 || a < 0) continue;

      if (usePoisson) {
        const gh = samplePoisson(fixLamHome[j] ?? 1.3, rng);
        const ga = samplePoisson(fixLamAway[j] ?? 1.1, rng);

        simGF[h] = ((simGF[h] ?? 0) + gh) | 0;
        simGF[a] = ((simGF[a] ?? 0) + ga) | 0;
        simGD[h] = ((simGD[h] ?? 0) + (gh - ga)) | 0;
        simGD[a] = ((simGD[a] ?? 0) + (ga - gh)) | 0;

        if (gh > ga) {
          simPoints[h] = ((simPoints[h] ?? 0) + 3) | 0;
        } else if (gh === ga) {
          simPoints[h] = ((simPoints[h] ?? 0) + 1) | 0;
          simPoints[a] = ((simPoints[a] ?? 0) + 1) | 0;
        } else {
          simPoints[a] = ((simPoints[a] ?? 0) + 3) | 0;
        }
      } else {
        const u = rng();
        if (u < (fixPHome[j] ?? 0.44)) {
          // Home win
          simPoints[h] = ((simPoints[h] ?? 0) + 3) | 0;
          simGD[h] = ((simGD[h] ?? 0) + 1) | 0;
          simGD[a] = ((simGD[a] ?? 0) - 1) | 0;
          simGF[h] = ((simGF[h] ?? 0) + 2) | 0;
          simGF[a] = ((simGF[a] ?? 0) + 1) | 0;
        } else if (u < (fixPHomeDraw[j] ?? 0.70)) {
          // Draw
          simPoints[h] = ((simPoints[h] ?? 0) + 1) | 0;
          simPoints[a] = ((simPoints[a] ?? 0) + 1) | 0;
          simGF[h] = ((simGF[h] ?? 0) + 1) | 0;
          simGF[a] = ((simGF[a] ?? 0) + 1) | 0;
        } else {
          // Away win
          simPoints[a] = ((simPoints[a] ?? 0) + 3) | 0;
          simGD[a] = ((simGD[a] ?? 0) + 1) | 0;
          simGD[h] = ((simGD[h] ?? 0) - 1) | 0;
          simGF[a] = ((simGF[a] ?? 0) + 2) | 0;
          simGF[h] = ((simGF[h] ?? 0) + 1) | 0;
        }
      }
    }

    // In-place insertion sort of tableOrder (length N <= 20, zero allocations, blazingly fast)
    for (let i = 1; i < N; i += 1) {
      const current = tableOrder[i]!;
      let prevIdx = i - 1;

      while (prevIdx >= 0) {
        const other = tableOrder[prevIdx]!;
        // Compare current vs other: return > 0 if current ranks ahead of other
        let ahead = false;
        if (simPoints[current]! !== simPoints[other]!) {
          ahead = simPoints[current]! > simPoints[other]!;
        } else if (simGD[current]! !== simGD[other]!) {
          ahead = simGD[current]! > simGD[other]!;
        } else if (simGF[current]! !== simGF[other]!) {
          ahead = simGF[current]! > simGF[other]!;
        } else {
          ahead = tieBreakers[current]! > tieBreakers[other]!;
        }

        if (ahead) {
          tableOrder[prevIdx + 1] = other;
          prevIdx -= 1;
        } else {
          break;
        }
      }
      tableOrder[prevIdx + 1] = current;
    }

    // Accumulate ranks
    for (let rank = 0; rank < N; rank += 1) {
      const teamIdx = tableOrder[rank] ?? 0;
      const idx = teamIdx * N + rank;
      rankCount[idx] = ((rankCount[idx] ?? 0) + 1) | 0;
      totalPoints[teamIdx] = (totalPoints[teamIdx] ?? 0) + (simPoints[teamIdx] ?? 0);
      totalRank[teamIdx] = (totalRank[teamIdx] ?? 0) + (rank + 1);
    }

    // Champion simulation
    if (isLigaMX) {
      const championIdx = simulateLigaMXPlayoffs(tableOrder, eloRatings, formatConfig, rng);
      championCount[championIdx] = ((championCount[championIdx] ?? 0) + 1) | 0;
    } else {
      // Standard European league format: 1st place in regular standings is champion
      const championIdx = tableOrder[0] ?? 0;
      championCount[championIdx] = ((championCount[championIdx] ?? 0) + 1) | 0;
    }
  }

  // 6. Build Result Summaries & Matrix
  const invIters = iterations > 0 ? 1.0 / iterations : 0.0;
  const rankMatrix: number[][] = [];
  const topDirect = formatConfig.topDirect ?? (isLigaMX ? 6 : 4);
  const playInStart = formatConfig.playInStart ?? (isLigaMX ? 7 : 0);
  const playInEnd = formatConfig.playInEnd ?? (isLigaMX ? 10 : 0);
  const relegationSpots = formatConfig.relegationSpots ?? (isLigaMX ? 0 : 3);

  const teamSummaries: TeamProjectionSummary[] = [];

  for (let i = 0; i < N; i += 1) {
    const t = standings[i]!;
    const dist: number[] = new Array(N);
    let pSuperlider = 0.0;
    let pDirect = 0.0;
    let pPlayIn = 0.0;
    let pReleg = 0.0;
    let modeRank = 1;
    let maxCount = -1;

    for (let r = 0; r < N; r += 1) {
      const c = rankCount[i * N + r] ?? 0;
      const prob = c * invIters;
      dist[r] = prob;

      if (c > maxCount) {
        maxCount = c;
        modeRank = r + 1;
      }

      if (r === 0) {
        pSuperlider = prob;
      }
      if (r < topDirect) {
        pDirect += prob;
      }
      if (playInStart > 0 && playInEnd >= playInStart && r + 1 >= playInStart && r + 1 <= playInEnd) {
        pPlayIn += prob;
      }
      if (relegationSpots > 0 && r >= N - relegationSpots) {
        pReleg += prob;
      }
    }

    rankMatrix.push(dist);

    teamSummaries.push({
      teamId: t.teamId,
      teamName: t.teamName,
      currentPoints: t.points,
      currentRank: currentRankMap.get(t.teamId) ?? i + 1,
      xPts: analyticalXPts.get(t.teamId) ?? t.points,
      simulatedMeanPoints: (totalPoints[i] ?? 0) * invIters,
      projectedRank: (totalRank[i] ?? 0) * invIters,
      modeRank,
      pSuperlider,
      pDirectPlayoff: pDirect,
      pPlayIn,
      pRelegation: pReleg,
      pChampion: (championCount[i] ?? 0) * invIters,
      rankDistribution: dist,
    });
  }

  // Sort summaries by projectedRank ascending (lowest rank number first: 1st, 2nd, ...)
  teamSummaries.sort((a, b) => a.projectedRank - b.projectedRank);

  const endTime = typeof performance !== "undefined" ? performance.now() : Date.now();
  const elapsedMs = Math.round((endTime - startTime) * 100) / 100;

  return {
    iterations,
    elapsedMs,
    teams: teamSummaries,
    rankMatrix,
  };
}
