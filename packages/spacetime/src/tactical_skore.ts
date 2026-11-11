/**
 * Tactical 7-Axis Radar, Goalkeeper Goalmouth Prevention & SKORE Rating Engine.
 *
 * Implements the core analytics capabilities reverse-engineered from REA-stats (Opta / Statiskicks):
 * 1. Exact `RankBands` Peer-Group Percentile & Quintile Engine
 * 2. 7-Axis Team Tactical Radar (`OptaTeamAttributeService`) with PPDA inverted polarity
 * 3. Goalkeeper Shot-Stopping & 6-Zone Goalmouth Analyzer (`OptaKeeperGoalmouthService`)
 * 4. Player & Lineup `SKORE` Rating + Pre-Match 1X2 Probability Adjustment (`applyLineupTacticalAdjustment`)
 *
 * Zero external runtime dependencies. Strict TypeScript types and numerical guarantees.
 */

// ============================================================================
// 1. Exact `RankBands` Peer-Group Percentile & Quintile Engine
// ============================================================================

export type QuintileBand = 1 | 2 | 3 | 4 | 5;
export type RankGrade = "low" | "mid" | "high";

/**
 * Computes exact percentile rank within a cohort using the validated Statiskicks formula:
 *   percentile = round((count_strictly_worse / (N - 1)) * 100, 2)
 *
 * @param countStrictlyWorse Number of peer entities strictly worse than the evaluated entity.
 * @param totalCohortSize Total size of cohort N (including evaluated entity).
 */
export function computePercentileFromRank(
  countStrictlyWorse: number,
  totalCohortSize: number
): number {
  if (!Number.isFinite(countStrictlyWorse) || !Number.isFinite(totalCohortSize)) {
    return 50.0;
  }
  if (totalCohortSize <= 1) {
    return 100.0;
  }
  const nMinusOne = totalCohortSize - 1;
  const clampedWorse = Math.max(0, Math.min(nMinusOne, countStrictlyWorse));
  const rawPct = (clampedWorse / nMinusOne) * 100;
  return Math.round(rawPct * 100) / 100;
}

/**
 * Computes percentile of `value` relative to `cohortValues`.
 * Accounts for attribute polarity:
 * - higherIsBetter = true: worse means peer < value
 * - higherIsBetter = false (e.g. PPDA, xGA, goals conceded): worse means peer > value
 */
export function calculatePercentile(
  value: number,
  cohortValues: readonly number[],
  higherIsBetter: boolean = true
): number {
  if (!Number.isFinite(value) || cohortValues.length === 0) {
    return 50.0;
  }
  const validCohort = cohortValues.filter((v) => Number.isFinite(v));
  if (validCohort.length <= 1) {
    return 100.0;
  }

  let countStrictlyWorse = 0;
  for (const peer of validCohort) {
    if (higherIsBetter) {
      if (peer < value) {
        countStrictlyWorse += 1;
      }
    } else {
      if (peer > value) {
        countStrictlyWorse += 1;
      }
    }
  }

  return computePercentileFromRank(countStrictlyWorse, validCohort.length);
}

/**
 * Maps a 0-100 percentile to one of 5 discrete quintile bands:
 * - Band 1: [0, 20) (< 20)
 * - Band 2: [20, 40) (< 40)
 * - Band 3: [40, 60) (< 60)
 * - Band 4: [60, 80) (< 80)
 * - Band 5: [80, 100] (>= 80)
 */
export function getQuintileBand(percentile: number): QuintileBand {
  if (percentile < 20) return 1;
  if (percentile < 40) return 2;
  if (percentile < 60) return 3;
  if (percentile < 80) return 4;
  return 5;
}

/**
 * Maps a 0-100 percentile to the standard tripartite rank grade (skore.js / OptaTeamAttributeService):
 * - "high": >= 70.0
 * - "mid":  >= 40.0 and < 70.0
 * - "low":  < 40.0
 */
export function getRankGrade(percentile: number): RankGrade {
  if (percentile >= 70.0) return "high";
  if (percentile >= 40.0) return "mid";
  return "low";
}

export interface AttributeRanking {
  value: number;
  percentile: number;
  quintile: QuintileBand;
  grade: RankGrade;
  rank: number;
  totalCohort: number;
  countStrictlyWorse: number;
  higherIsBetter: boolean;
}

/**
 * Full ranking analysis for a single numeric attribute against a cohort.
 */
export function rankAttributeInCohort(
  value: number,
  cohortValues: readonly number[],
  higherIsBetter: boolean = true
): AttributeRanking {
  const validCohort = cohortValues.filter((v) => Number.isFinite(v));
  const totalCohort = validCohort.length;

  if (totalCohort <= 1) {
    return {
      value,
      percentile: 100.0,
      quintile: 5,
      grade: "high",
      rank: 1,
      totalCohort: Math.max(1, totalCohort),
      countStrictlyWorse: 0,
      higherIsBetter,
    };
  }

  let countStrictlyWorse = 0;
  let countStrictlyBetter = 0;

  for (const peer of validCohort) {
    if (higherIsBetter) {
      if (peer < value) countStrictlyWorse += 1;
      else if (peer > value) countStrictlyBetter += 1;
    } else {
      if (peer > value) countStrictlyWorse += 1;
      else if (peer < value) countStrictlyBetter += 1;
    }
  }

  const rank = 1 + countStrictlyBetter;
  const percentile = computePercentileFromRank(countStrictlyWorse, totalCohort);
  const quintile = getQuintileBand(percentile);
  const grade = getRankGrade(percentile);

  return {
    value,
    percentile,
    quintile,
    grade,
    rank,
    totalCohort,
    countStrictlyWorse,
    higherIsBetter,
  };
}

// ============================================================================
// 2. 7-Axis Team Tactical Radar (`OptaTeamAttributeService`)
// ============================================================================

export const TACTICAL_AXES = [
  "possession",
  "territorialControl",
  "directness",
  "pressingIntensity",
  "openPlayXg",
  "expectedAssists",
  "expectedThreat",
] as const;

export type TacticalAxis = (typeof TACTICAL_AXES)[number];

/**
 * Polarities for the 7 tactical dimensions.
 * Notice: `pressingIntensity` is measured via PPDA (passes allowed per defensive action);
 * lower PPDA indicates higher pressing intensity, hence higherIsBetter = false.
 */
export const TACTICAL_AXIS_POLARITY: Readonly<Record<TacticalAxis, boolean>> = {
  possession: true,
  territorialControl: true,
  directness: true,
  pressingIntensity: false,
  openPlayXg: true,
  expectedAssists: true,
  expectedThreat: true,
};

export type TacticalRadarMetrics = Record<TacticalAxis, number>;

export interface TacticalRadarAxisResult {
  raw: number;
  percentile: number;
  quintile: QuintileBand;
  grade: RankGrade;
  higherIsBetter: boolean;
}

export interface TacticalRadarReport {
  axes: Record<TacticalAxis, TacticalRadarAxisResult>;
  percentiles: Record<TacticalAxis, number>;
  quintiles: Record<TacticalAxis, QuintileBand>;
  averagePercentile: number;
  tacticalStyle: string;
}

/**
 * Determines an overarching tactical style description based on the 7 radar percentiles.
 */
export function classifyTacticalStyle(p: Record<TacticalAxis, number>): string {
  const isHighPossession = p.possession >= 60;
  const isHighTerritory = p.territorialControl >= 60;
  const isHighPress = p.pressingIntensity >= 60;
  const isDirect = p.directness >= 60;
  const isHighThreat = p.expectedThreat >= 60 || p.openPlayXg >= 60;

  if (isHighPossession && isHighTerritory && isHighPress) {
    return "Dominant High-Pressing Possession";
  }
  if (isHighPossession && !isDirect) {
    return "Patient Positional Build-Up";
  }
  if (isDirect && isHighThreat && !isHighPossession) {
    return "Direct Vertical Transition";
  }
  if (isHighPress && isHighThreat) {
    return "High-Intensity Counter-Pressing";
  }
  if (!isHighPossession && p.territorialControl < 40 && isDirect) {
    return "Low-Block Counter-Attack";
  }
  return "Balanced Pragmatic";
}

/**
 * Computes 7-Axis Tactical Radar from raw metrics evaluated against a league cohort.
 */
export function computeTacticalRadar(
  teamMetrics: TacticalRadarMetrics,
  cohort: readonly TacticalRadarMetrics[]
): TacticalRadarReport {
  const axesResult = {} as Record<TacticalAxis, TacticalRadarAxisResult>;
  const percentiles = {} as Record<TacticalAxis, number>;
  const quintiles = {} as Record<TacticalAxis, QuintileBand>;
  let totalPercentile = 0;

  for (const axis of TACTICAL_AXES) {
    const raw = teamMetrics[axis] ?? 0;
    const polarity = TACTICAL_AXIS_POLARITY[axis];
    const axisCohort = cohort.map((t) => t[axis] ?? 0);

    const ranking = rankAttributeInCohort(raw, axisCohort, polarity);
    axesResult[axis] = {
      raw,
      percentile: ranking.percentile,
      quintile: ranking.quintile,
      grade: ranking.grade,
      higherIsBetter: polarity,
    };
    percentiles[axis] = ranking.percentile;
    quintiles[axis] = ranking.quintile;
    totalPercentile += ranking.percentile;
  }

  const averagePercentile = Math.round((totalPercentile / TACTICAL_AXES.length) * 100) / 100;
  const tacticalStyle = classifyTacticalStyle(percentiles);

  return {
    axes: axesResult,
    percentiles,
    quintiles,
    averagePercentile,
    tacticalStyle,
  };
}

/**
 * Creates a TacticalRadarReport directly from pre-computed percentiles (0-100).
 */
export function createTacticalRadarFromPercentiles(
  percentilesInput: TacticalRadarMetrics
): TacticalRadarReport {
  const axesResult = {} as Record<TacticalAxis, TacticalRadarAxisResult>;
  const percentiles = {} as Record<TacticalAxis, number>;
  const quintiles = {} as Record<TacticalAxis, QuintileBand>;
  let totalPercentile = 0;

  for (const axis of TACTICAL_AXES) {
    const pct = Math.max(0, Math.min(100, percentilesInput[axis] ?? 50));
    const rounded = Math.round(pct * 100) / 100;
    const quintile = getQuintileBand(rounded);
    const grade = getRankGrade(rounded);

    axesResult[axis] = {
      raw: rounded,
      percentile: rounded,
      quintile,
      grade,
      higherIsBetter: TACTICAL_AXIS_POLARITY[axis],
    };
    percentiles[axis] = rounded;
    quintiles[axis] = quintile;
    totalPercentile += rounded;
  }

  const averagePercentile = Math.round((totalPercentile / TACTICAL_AXES.length) * 100) / 100;
  const tacticalStyle = classifyTacticalStyle(percentiles);

  return {
    axes: axesResult,
    percentiles,
    quintiles,
    averagePercentile,
    tacticalStyle,
  };
}

// ============================================================================
// 3. Goalkeeper Shot-Stopping & 6-Zone Goalmouth Analyzer
//    (`OptaKeeperGoalmouthService`)
// ============================================================================

export interface GoalmouthShot {
  /** Y coordinate: [44.2, 55.8] pitch coordinate or normalized [0, 1] left-to-right */
  goalMouthY: number;
  /** Z coordinate: [0, 38.0] height coordinate or normalized [0, 1] ground-to-crossbar */
  goalMouthZ: number;
  /** Expected Goals on Target */
  xgot: number;
  /** Whether shot resulted in a goal */
  isGoal: boolean;
  minute?: number;
  penalty?: boolean;
  head?: boolean;
  rival?: string;
  shotId?: string;
}

export type GoalmouthZoneKey =
  | "top_left"
  | "top_center"
  | "top_right"
  | "low_left"
  | "low_center"
  | "low_right";

export const GOALMOUTH_ZONES: readonly GoalmouthZoneKey[] = [
  "top_left",
  "top_center",
  "top_right",
  "low_left",
  "low_center",
  "low_right",
] as const;

export interface GoalmouthZoneStats {
  zone: GoalmouthZoneKey;
  shotsFaced: number;
  goalsConceded: number;
  saves: number;
  xgotFaced: number;
  prevented: number;
  saveRatio: number;
  savePct: number;
}

export interface GoalmouthAnalysisResult {
  shotsFaced: number;
  goalsConceded: number;
  saves: number;
  xgotFaced: number;
  prevented: number;
  saveRatio: number;
  savePct: number;
  zones: Record<GoalmouthZoneKey, GoalmouthZoneStats>;
}

/**
 * Normalizes goalmouth coordinates:
 * - Y: if > 1.0, maps [44.2, 55.8] -> [0, 1]
 * - Z: if > 1.0, maps [0, 38.0] -> [0, 1]
 */
export function normalizeGoalmouthCoordinates(
  y: number,
  z: number
): { normY: number; normZ: number } {
  let normY: number;
  if (y > 1.0) {
    normY = Math.max(0, Math.min(1, (y - 44.2) / (55.8 - 44.2)));
  } else {
    normY = Math.max(0, Math.min(1, y));
  }

  let normZ: number;
  if (z > 1.0) {
    normZ = Math.max(0, Math.min(1, z / 38.0));
  } else {
    normZ = Math.max(0, Math.min(1, z));
  }

  return { normY, normZ };
}

/**
 * Classifies a shot into one of the 6 goalmouth zones:
 * - Vertical: low (normZ < 0.5) vs top (normZ >= 0.5)
 * - Horizontal: left (normY < 1/3), center (1/3 <= normY < 2/3), right (normY >= 2/3)
 */
export function classifyGoalmouthZone(normY: number, normZ: number): GoalmouthZoneKey {
  const isTop = normZ >= 0.5;
  if (normY < 1.0 / 3.0) {
    return isTop ? "top_left" : "low_left";
  }
  if (normY < 2.0 / 3.0) {
    return isTop ? "top_center" : "low_center";
  }
  return isTop ? "top_right" : "low_right";
}

/**
 * Analyzes goalkeeper shot-stopping performance and 6-zone breakdown.
 */
export function analyzeGoalkeeperGoalmouth(
  shots: readonly GoalmouthShot[]
): GoalmouthAnalysisResult {
  let totalXgot = 0;
  let totalGoals = 0;

  const zoneMap: Record<
    GoalmouthZoneKey,
    { shotsFaced: number; goalsConceded: number; xgotFaced: number }
  > = {
    top_left: { shotsFaced: 0, goalsConceded: 0, xgotFaced: 0 },
    top_center: { shotsFaced: 0, goalsConceded: 0, xgotFaced: 0 },
    top_right: { shotsFaced: 0, goalsConceded: 0, xgotFaced: 0 },
    low_left: { shotsFaced: 0, goalsConceded: 0, xgotFaced: 0 },
    low_center: { shotsFaced: 0, goalsConceded: 0, xgotFaced: 0 },
    low_right: { shotsFaced: 0, goalsConceded: 0, xgotFaced: 0 },
  };

  for (const shot of shots) {
    const xgot = Number.isFinite(shot.xgot) ? Math.max(0, shot.xgot) : 0;
    const isGoal = Boolean(shot.isGoal);

    totalXgot += xgot;
    if (isGoal) {
      totalGoals += 1;
    }

    const { normY, normZ } = normalizeGoalmouthCoordinates(shot.goalMouthY, shot.goalMouthZ);
    const zoneKey = classifyGoalmouthZone(normY, normZ);

    const bucket = zoneMap[zoneKey];
    bucket.shotsFaced += 1;
    bucket.xgotFaced += xgot;
    if (isGoal) {
      bucket.goalsConceded += 1;
    }
  }

  const shotsFaced = shots.length;
  const goalsConceded = totalGoals;
  const saves = Math.max(0, shotsFaced - goalsConceded);
  const xgotFaced = Math.round(totalXgot * 100) / 100;
  const prevented = Math.round((xgotFaced - goalsConceded) * 100) / 100;
  const saveRatio = shotsFaced > 0 ? Math.round((saves / shotsFaced) * 10000) / 10000 : 0;
  const savePct = Math.round(saveRatio * 1000) / 10;

  const zones = {} as Record<GoalmouthZoneKey, GoalmouthZoneStats>;
  for (const key of GOALMOUTH_ZONES) {
    const z = zoneMap[key];
    const zSaves = Math.max(0, z.shotsFaced - z.goalsConceded);
    const zXgot = Math.round(z.xgotFaced * 100) / 100;
    const zPrevented = Math.round((zXgot - z.goalsConceded) * 100) / 100;
    const zRatio = z.shotsFaced > 0 ? Math.round((zSaves / z.shotsFaced) * 10000) / 10000 : 0;
    const zPct = Math.round(zRatio * 1000) / 10;

    zones[key] = {
      zone: key,
      shotsFaced: z.shotsFaced,
      goalsConceded: z.goalsConceded,
      saves: zSaves,
      xgotFaced: zXgot,
      prevented: zPrevented,
      saveRatio: zRatio,
      savePct: zPct,
    };
  }

  return {
    shotsFaced,
    goalsConceded,
    saves,
    xgotFaced,
    prevented,
    saveRatio,
    savePct,
    zones,
  };
}

// ============================================================================
// 4. Player & Lineup `SKORE` Rating + Pre-Match Probability Adjustment
//    (`OptaMatchRatingService`)
// ============================================================================

export const SKORE_HIGH_THRESHOLD = 7.0;
export const SKORE_MID_THRESHOLD = 6.5;
export const SKORE_BASELINE = 6.0;
export const SKORE_FLOOR = 3.0;
export const SKORE_CEILING = 10.0;

export interface SkoreCategoryContributions {
  attack?: number;
  passing?: number;
  duels?: number;
  defense?: number;
  discipline?: number;
  goalkeeping?: number;
}

export interface PlayerSkoreCalculation {
  base: number;
  contributions: Required<SkoreCategoryContributions>;
  totalContribution: number;
  rawSum: number;
  skore: number;
  grade: "low" | "mid" | "high";
  formatted: string;
}

/**
 * Computes player SKORE rating matching OptaMatchRatingService:
 *   skore = clamp(base (6.0) + sum(contributions), 3.0, 10.0) rounded to 2 decimals.
 *
 * Thresholds (skore.js):
 * - >= 7.0 -> "high"
 * - >= 6.5 -> "mid"
 * - < 6.5  -> "low"
 */
export function computePlayerSkore(
  contributions: SkoreCategoryContributions,
  base: number = SKORE_BASELINE
): PlayerSkoreCalculation {
  const attack = contributions.attack ?? 0;
  const passing = contributions.passing ?? 0;
  const duels = contributions.duels ?? 0;
  const defense = contributions.defense ?? 0;
  const discipline = contributions.discipline ?? 0;
  const goalkeeping = contributions.goalkeeping ?? 0;

  const totalContribution = attack + passing + duels + defense + discipline + goalkeeping;
  const rawSum = base + totalContribution;
  const clamped = Math.max(SKORE_FLOOR, Math.min(SKORE_CEILING, rawSum));
  const skore = Math.round(clamped * 100) / 100;

  let grade: "low" | "mid" | "high" = "low";
  if (skore >= SKORE_HIGH_THRESHOLD) {
    grade = "high";
  } else if (skore >= SKORE_MID_THRESHOLD) {
    grade = "mid";
  }

  const formatted = skore.toFixed(2);

  return {
    base,
    contributions: {
      attack,
      passing,
      duels,
      defense,
      discipline,
      goalkeeping,
    },
    totalContribution: Math.round(totalContribution * 100) / 100,
    rawSum: Math.round(rawSum * 100) / 100,
    skore,
    grade,
    formatted,
  };
}

/**
 * Computes average starting XI SKORE from an array of player ratings.
 */
export function computeLineupAverageSkore(playerSkores: readonly number[]): number {
  const valid = playerSkores.filter((s) => Number.isFinite(s) && s > 0);
  if (valid.length === 0) return SKORE_BASELINE;
  const sum = valid.reduce((acc, v) => acc + v, 0);
  return Math.round((sum / valid.length) * 100) / 100;
}

export interface ProbabilityVector1X2 {
  pHome: number;
  pDraw: number;
  pAway: number;
}

export interface TeamLineupTacticalProfile {
  startingXiSkoreAvg: number;
  gkGoalsPreventedPer90?: number;
}

export interface LineupTacticalAdjustmentConfig {
  skoreWeight?: number;
  gkWeight?: number;
  maxTilt?: number;
}

export interface LineupAdjustmentResult {
  pHome: number;
  pDraw: number;
  pAway: number;
  skoreDelta: number;
  gkPreventionDelta: number;
  rawTilt: number;
  appliedTilt: number;
  divergence: {
    deltaHome: number;
    deltaDraw: number;
    deltaAway: number;
  };
}

/**
 * Applies a bounded tactical log-odds tilt in logit space to adjust 1X2 base probabilities.
 *
 * Given:
 * - baseProbabilities (pHome, pDraw, pAway) from PitchLab Tachyon / Singularity
 * - starting XI SKORE average for home and away
 * - goalkeeper goals prevented per 90 rates for home and away
 *
 * Guarantees:
 * - pHome + pDraw + pAway = 1.0 strictly maintained
 * - Monotonic response to lineup enhancements and shot-stopper quality
 * - Symmetrically bounded tilt avoiding tail distortion
 */
export function applyLineupTacticalAdjustment(
  baseProbabilities: ProbabilityVector1X2,
  homeLineup: TeamLineupTacticalProfile,
  awayLineup: TeamLineupTacticalProfile,
  config?: LineupTacticalAdjustmentConfig
): LineupAdjustmentResult {
  const pH = Math.max(1e-6, baseProbabilities.pHome);
  const pD = Math.max(1e-6, baseProbabilities.pDraw);
  const pA = Math.max(1e-6, baseProbabilities.pAway);
  const baseSum = pH + pD + pA;

  // Unnormalized base logits
  const logitH = Math.log(pH / baseSum);
  const logitD = Math.log(pD / baseSum);
  const logitA = Math.log(pA / baseSum);

  const skoreWeight = config?.skoreWeight ?? 0.35;
  const gkWeight = config?.gkWeight ?? 0.40;
  const maxTilt = config?.maxTilt ?? 0.75;

  const skoreDelta =
    Math.round((homeLineup.startingXiSkoreAvg - awayLineup.startingXiSkoreAvg) * 100) / 100;
  const homeGkPrev = homeLineup.gkGoalsPreventedPer90 ?? 0;
  const awayGkPrev = awayLineup.gkGoalsPreventedPer90 ?? 0;
  const gkPreventionDelta = Math.round((homeGkPrev - awayGkPrev) * 100) / 100;

  // Combined tactical delta: positive favours home, negative favours away
  const rawTilt = skoreWeight * skoreDelta + gkWeight * gkPreventionDelta;
  const appliedTilt = Math.max(-maxTilt, Math.min(maxTilt, rawTilt));

  // Tilt home up/down, away opposite, with mild draw damping under high tilt
  const tiltH = logitH + appliedTilt;
  const tiltA = logitA - appliedTilt;
  const tiltD = logitD - 0.1 * Math.abs(appliedTilt);

  // Numerically stable softmax
  const maxLogit = Math.max(tiltH, tiltD, tiltA);
  const expH = Math.exp(tiltH - maxLogit);
  const expD = Math.exp(tiltD - maxLogit);
  const expA = Math.exp(tiltA - maxLogit);
  const expSum = expH + expD + expA;

  const adjH = expH / expSum;
  const adjD = expD / expSum;
  const adjA = expA / expSum;

  return {
    pHome: adjH,
    pDraw: adjD,
    pAway: adjA,
    skoreDelta,
    gkPreventionDelta,
    rawTilt: Math.round(rawTilt * 10000) / 10000,
    appliedTilt: Math.round(appliedTilt * 10000) / 10000,
    divergence: {
      deltaHome: Math.round((adjH - pH) * 10000) / 10000,
      deltaDraw: Math.round((adjD - pD) * 10000) / 10000,
      deltaAway: Math.round((adjA - pA) * 10000) / 10000,
    },
  };
}
