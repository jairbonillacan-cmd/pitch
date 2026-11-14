import {
  DEFAULT_DC_RHO,
  DEFAULT_MAX_GOALS,
  buildDixonColesScoreMatrix,
} from "../src/markets_2way";
import { clamp, normalCdf } from "../src/math";
import { MINKOWSKI_V3_DEFAULT_PRIORS } from "../src/nfl_live";
import {
  DEFAULT_NFL_SIGMA_MARGIN,
  DEFAULT_NFL_SIGMA_TOTAL,
  probabilityToFairOdds,
  type FairOdds,
  type MatchOutlook,
} from "../src/outlook";

/**
 * Proporción documentada de goles esperados del partido que ocurren en la 1.ª mitad.
 * El motor v3.2 no publica una tasa separada al descanso, así que escala `(lamHome, lamAway)`
 * por 0.45 (~45 % de los goles en los primeros 45 minutos, estándar empírico de fútbol).
 */
export const FIRST_HALF_GOAL_SHARE = 0.45;

export const TEAM_GOALS_LINES = [0.5, 1.5, 2.5] as const;
export const FIRST_HALF_TOTALS_LINES = [0.5, 1.5, 2.5] as const;
export const TOP_SCORELINES_COUNT = 6;
export const DEFAULT_NFL_DERIVED_TOTAL =
  MINKOWSKI_V3_DEFAULT_PRIORS.default_expected_total_pts;

export { DEFAULT_NFL_SIGMA_MARGIN, DEFAULT_NFL_SIGMA_TOTAL };

export interface DerivedBinaryLine {
  readonly line: number;
  readonly pOver: number;
  readonly pUnder: number;
  readonly fairOver: FairOdds;
  readonly fairUnder: FairOdds;
  readonly mostLikely: "over" | "under";
}

export interface Derived1X2Block {
  readonly pHome: number;
  readonly pDraw: number;
  readonly pAway: number;
  readonly fairHome: FairOdds;
  readonly fairDraw: FairOdds;
  readonly fairAway: FairOdds;
  readonly mostLikely: "home" | "draw" | "away";
}

export interface DerivedScoreline {
  readonly homeGoals: number;
  readonly awayGoals: number;
  readonly score: string;
  readonly p: number;
  readonly fairOdds: FairOdds;
  readonly rank: number;
  readonly isMostLikely: boolean;
}

export interface FootballDerivedMarkets {
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly firstHalfGoalShare: number;
  readonly fullTimeMatrixParity: {
    readonly pHome: number;
    readonly pDraw: number;
    readonly pAway: number;
    readonly totals: readonly DerivedBinaryLine[];
  };
  readonly homeTeamGoals: readonly DerivedBinaryLine[];
  readonly awayTeamGoals: readonly DerivedBinaryLine[];
  readonly firstHalf1X2: Derived1X2Block;
  readonly firstHalfTotals: readonly DerivedBinaryLine[];
  readonly topScorelines: readonly DerivedScoreline[];
}

export interface DerivedSpreadLine {
  readonly homeLine: number;
  readonly pHome: number;
  readonly pAway: number;
  readonly fairHome: FairOdds;
  readonly fairAway: FairOdds;
  readonly mostLikely: "home" | "away";
}

export interface NflDerivedMarkets {
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly pHome: number;
  readonly pAway: number;
  readonly expectedMargin: number;
  readonly expectedTotal: number;
  readonly sigmaMargin: number;
  readonly sigmaTotal: number;
  readonly spreads: readonly DerivedSpreadLine[];
  readonly totals: readonly DerivedBinaryLine[];
}

export interface FootballParityResult {
  readonly matchId: string;
  readonly checkedMarkets: readonly string[];
  readonly maxAbsDelta: number;
  readonly diffsByMarket: Readonly<Record<string, number>>;
}

function assertPositiveFinite(value: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} debe ser un número finito positivo; recibido ${String(value)}`);
  }
  return value;
}

function normalizeMatrix(matrix: readonly (readonly number[])[]): number[][] {
  let total = 0;
  for (const row of matrix) {
    for (const cell of row) total += cell;
  }
  if (!Number.isFinite(total) || total <= 0) {
    throw new RangeError(`La matriz de marcadores tiene masa inválida: ${String(total)}`);
  }
  return matrix.map((row) => row.map((cell) => cell / total));
}

function makeBinaryLine(line: number, rawPOver: number): DerivedBinaryLine {
  const pOver = clamp(rawPOver, 1e-12, 1 - 1e-12);
  const pUnder = 1 - pOver;
  return Object.freeze({
    line,
    pOver,
    pUnder,
    fairOver: probabilityToFairOdds(pOver),
    fairUnder: probabilityToFairOdds(pUnder),
    mostLikely: pOver >= pUnder ? "over" : "under",
  });
}

function sumMatrix1X2(normMatrix: readonly (readonly number[])[]): Derived1X2Block {
  let pHome = 0;
  let pDraw = 0;
  let pAway = 0;
  for (let h = 0; h < normMatrix.length; h += 1) {
    const row = normMatrix[h]!;
    for (let a = 0; a < row.length; a += 1) {
      const p = row[a]!;
      if (h > a) pHome += p;
      else if (h === a) pDraw += p;
      else pAway += p;
    }
  }
  const sum = pHome + pDraw + pAway;
  pHome /= sum;
  pDraw /= sum;
  pAway /= sum;
  const mostLikely =
    pHome >= pDraw && pHome >= pAway ? "home" : pDraw >= pAway ? "draw" : "away";
  return Object.freeze({
    pHome,
    pDraw,
    pAway,
    fairHome: probabilityToFairOdds(pHome),
    fairDraw: probabilityToFairOdds(pDraw),
    fairAway: probabilityToFairOdds(pAway),
    mostLikely,
  });
}

function sumTotalsOver(normMatrix: readonly (readonly number[])[], line: number): number {
  let pOver = 0;
  for (let h = 0; h < normMatrix.length; h += 1) {
    const row = normMatrix[h]!;
    for (let a = 0; a < row.length; a += 1) {
      if (h + a > line) pOver += row[a]!;
    }
  }
  return pOver;
}

function sumHomeTeamOver(normMatrix: readonly (readonly number[])[], line: number): number {
  let pOver = 0;
  for (let h = 0; h < normMatrix.length; h += 1) {
    if (h <= line) continue;
    const row = normMatrix[h]!;
    for (let a = 0; a < row.length; a += 1) {
      pOver += row[a]!;
    }
  }
  return pOver;
}

function sumAwayTeamOver(normMatrix: readonly (readonly number[])[], line: number): number {
  let pOver = 0;
  for (let h = 0; h < normMatrix.length; h += 1) {
    const row = normMatrix[h]!;
    for (let a = 0; a < row.length; a += 1) {
      if (a > line) pOver += row[a]!;
    }
  }
  return pOver;
}

function extractTopScorelinesNormalized(
  normMatrix: readonly (readonly number[])[],
  count: number,
): readonly DerivedScoreline[] {
  const entries: Array<{ homeGoals: number; awayGoals: number; p: number }> = [];
  for (let h = 0; h < normMatrix.length; h += 1) {
    const row = normMatrix[h]!;
    for (let a = 0; a < row.length; a += 1) {
      entries.push({ homeGoals: h, awayGoals: a, p: row[a]! });
    }
  }
  entries.sort((left, right) => {
    const diff = right.p - left.p;
    if (Math.abs(diff) > 1e-12) return diff;
    const leftTotal = left.homeGoals + left.awayGoals;
    const rightTotal = right.homeGoals + right.awayGoals;
    if (leftTotal !== rightTotal) return leftTotal - rightTotal;
    if (left.homeGoals !== right.homeGoals) return left.homeGoals - right.homeGoals;
    return left.awayGoals - right.awayGoals;
  });
  return Object.freeze(
    entries.slice(0, count).map((item, idx) =>
      Object.freeze({
        homeGoals: item.homeGoals,
        awayGoals: item.awayGoals,
        score: `${item.homeGoals}-${item.awayGoals}`,
        p: item.p,
        fairOdds: probabilityToFairOdds(item.p),
        rank: idx + 1,
        isMostLikely: idx === 0,
      }),
    ),
  );
}

/**
 * Inversa determinista de la distribución normal estándar (48 pasos de bisección en [-6, 6]),
 * coherente con `packages/spacetime/src/outlook.ts`.
 */
export function inverseStandardNormalCdf(targetP: number): number {
  const target = clamp(targetP, 1e-6, 1 - 1e-6);
  let lo = -6;
  let hi = 6;
  for (let i = 0; i < 48; i += 1) {
    const mid = 0.5 * (lo + hi);
    if (normalCdf(mid) < target) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/**
 * Calcula los mercados adicionales de fútbol desde una única distribución bivariada
 * de goles (`buildDixonColesScoreMatrix`): goles por equipo (0.5/1.5/2.5),
 * 1er tiempo (1X2 y goles 0.5/1.5/2.5 escalados por `FIRST_HALF_GOAL_SHARE`)
 * y top 6 de marcador exacto.
 */
export function deriveFootballExtraMarkets(params: {
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly lamHome: number;
  readonly lamAway: number;
  readonly rho?: number;
  readonly maxGoals?: number;
  readonly firstHalfGoalShare?: number;
  readonly topScorelinesCount?: number;
}): FootballDerivedMarkets {
  const lamHome = clamp(assertPositiveFinite(params.lamHome, "lamHome"), 0.05, 25.0);
  const lamAway = clamp(assertPositiveFinite(params.lamAway, "lamAway"), 0.05, 25.0);
  const rho = params.rho ?? DEFAULT_DC_RHO;
  const maxGoals = params.maxGoals ?? DEFAULT_MAX_GOALS;
  const share = clamp(params.firstHalfGoalShare ?? FIRST_HALF_GOAL_SHARE, 0.1, 0.9);
  const scoreCount = params.topScorelinesCount ?? TOP_SCORELINES_COUNT;

  const ftMatrix = normalizeMatrix(buildDixonColesScoreMatrix(lamHome, lamAway, rho, maxGoals));
  const htMatrix = normalizeMatrix(
    buildDixonColesScoreMatrix(
      clamp(lamHome * share, 0.05, 25.0),
      clamp(lamAway * share, 0.05, 25.0),
      rho,
      maxGoals,
    ),
  );

  const ft1x2 = sumMatrix1X2(ftMatrix);
  const ftTotals = Object.freeze(
    [1.5, 2.5, 3.5].map((line) => makeBinaryLine(line, sumTotalsOver(ftMatrix, line))),
  );
  const homeTeamGoals = Object.freeze(
    TEAM_GOALS_LINES.map((line) => makeBinaryLine(line, sumHomeTeamOver(ftMatrix, line))),
  );
  const awayTeamGoals = Object.freeze(
    TEAM_GOALS_LINES.map((line) => makeBinaryLine(line, sumAwayTeamOver(ftMatrix, line))),
  );
  const firstHalf1X2 = sumMatrix1X2(htMatrix);
  const firstHalfTotals = Object.freeze(
    FIRST_HALF_TOTALS_LINES.map((line) => makeBinaryLine(line, sumTotalsOver(htMatrix, line))),
  );
  const topScorelines = extractTopScorelinesNormalized(ftMatrix, scoreCount);

  return Object.freeze({
    homeTeam: params.homeTeam,
    awayTeam: params.awayTeam,
    firstHalfGoalShare: share,
    fullTimeMatrixParity: Object.freeze({
      pHome: ft1x2.pHome,
      pDraw: ft1x2.pDraw,
      pAway: ft1x2.pAway,
      totals: ftTotals,
    }),
    homeTeamGoals,
    awayTeamGoals,
    firstHalf1X2,
    firstHalfTotals,
    topScorelines,
  });
}

function buildHalfPointSpreadLines(expectedMargin: number): readonly number[] {
  if (Math.abs(expectedMargin) < 1e-9) {
    return Object.freeze([-3.5, -0.5, 0.5, 3.5]);
  }
  const center =
    expectedMargin > 0
      ? -(Math.floor(expectedMargin) + 0.5)
      : Math.floor(-expectedMargin) + 0.5;
  return Object.freeze([center - 3, center, center + 3]);
}

function buildHalfPointTotalLines(expectedTotal: number): readonly number[] {
  const center = Math.max(20.5, Math.floor(expectedTotal) + 0.5);
  return Object.freeze([Math.max(17.5, center - 3), center, center + 3]);
}

/**
 * Deriva hándicaps y totales de puntos NFL mediante distribución normal cuando el panorama
 * v3.2 únicamente incluye ganador (`moneyline`).
 */
export function deriveNflExtraMarkets(params: {
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly pHome: number;
  readonly expectedTotal?: number | null;
  readonly expectedMargin?: number | null;
  readonly sigmaMargin?: number;
  readonly sigmaTotal?: number;
}): NflDerivedMarkets {
  const sigmaMargin = assertPositiveFinite(
    params.sigmaMargin ?? DEFAULT_NFL_SIGMA_MARGIN,
    "sigmaMargin",
  );
  const sigmaTotal = assertPositiveFinite(
    params.sigmaTotal ?? DEFAULT_NFL_SIGMA_TOTAL,
    "sigmaTotal",
  );
  const pHome = clamp(params.pHome, 1e-6, 1 - 1e-6);
  const pAway = 1 - pHome;
  const expectedMargin =
    typeof params.expectedMargin === "number" && Number.isFinite(params.expectedMargin)
      ? params.expectedMargin
      : inverseStandardNormalCdf(pHome) * sigmaMargin;
  const expectedTotal =
    typeof params.expectedTotal === "number" &&
    Number.isFinite(params.expectedTotal) &&
    params.expectedTotal > 0
      ? params.expectedTotal
      : DEFAULT_NFL_DERIVED_TOTAL;

  const spreads = Object.freeze(
    buildHalfPointSpreadLines(expectedMargin).map((homeLine) => {
      const pCoverHome = clamp(
        normalCdf((expectedMargin + homeLine) / sigmaMargin),
        1e-9,
        1 - 1e-9,
      );
      const pCoverAway = 1 - pCoverHome;
      return Object.freeze({
        homeLine,
        pHome: pCoverHome,
        pAway: pCoverAway,
        fairHome: probabilityToFairOdds(pCoverHome),
        fairAway: probabilityToFairOdds(pCoverAway),
        mostLikely: pCoverHome >= pCoverAway ? "home" : "away",
      });
    }),
  );

  const totals = Object.freeze(
    buildHalfPointTotalLines(expectedTotal).map((line) =>
      makeBinaryLine(line, normalCdf((expectedTotal - line) / sigmaTotal)),
    ),
  );

  return Object.freeze({
    homeTeam: params.homeTeam,
    awayTeam: params.awayTeam,
    pHome,
    pAway,
    expectedMargin,
    expectedTotal,
    sigmaMargin,
    sigmaTotal,
    spreads,
    totals,
  });
}

/**
 * Verifica que la reconstrucción matricial de `dixonColesParams` reproduce exactamente
 * los mercados 1X2 y totales publicados por `outlook.ts` en ausencia de cuota externa.
 */
export function verifyFootballMatrixParity(outlook: MatchOutlook): FootballParityResult {
  if (outlook.sport !== "football" || !outlook.dixonColesParams) {
    throw new Error(`El panorama ${outlook.matchId} no corresponde a fútbol con dixonColesParams.`);
  }
  const dc = outlook.dixonColesParams;
  const derived = deriveFootballExtraMarkets({
    homeTeam: outlook.homeTeam,
    awayTeam: outlook.awayTeam,
    lamHome: dc.lamHome,
    lamAway: dc.lamAway,
    rho: dc.rho,
    maxGoals: dc.maxGoals,
  });

  const diffsByMarket: Record<string, number> = {};
  const checkedMarkets: string[] = [];

  const m1x2 = outlook.marketsByKey["1x2"];
  if (m1x2) {
    const bySel = new Map(m1x2.selections.map((s) => [s.selection, s.p]));
    const d1x2 = Math.max(
      Math.abs((bySel.get("home") ?? 0) - derived.fullTimeMatrixParity.pHome),
      Math.abs((bySel.get("draw") ?? 0) - derived.fullTimeMatrixParity.pDraw),
      Math.abs((bySel.get("away") ?? 0) - derived.fullTimeMatrixParity.pAway),
    );
    diffsByMarket["1x2"] = d1x2;
    checkedMarkets.push("1x2");
  }

  const totalKeys = [
    ["totals_1_5", 0],
    ["totals_2_5", 1],
    ["totals_3_5", 2],
  ] as const;
  for (const [key, idx] of totalKeys) {
    const mkt = outlook.marketsByKey[key];
    if (!mkt) continue;
    const bySel = new Map(mkt.selections.map((s) => [s.selection, s.p]));
    const target = derived.fullTimeMatrixParity.totals[idx]!;
    diffsByMarket[key] = Math.max(
      Math.abs((bySel.get("over") ?? 0) - target.pOver),
      Math.abs((bySel.get("under") ?? 0) - target.pUnder),
    );
    checkedMarkets.push(key);
  }

  const maxAbsDelta = Object.values(diffsByMarket).reduce(
    (max, v) => (v > max ? v : max),
    0,
  );
  return Object.freeze({
    matchId: outlook.matchId,
    checkedMarkets: Object.freeze(checkedMarkets),
    maxAbsDelta,
    diffsByMarket: Object.freeze(diffsByMarket),
  });
}
