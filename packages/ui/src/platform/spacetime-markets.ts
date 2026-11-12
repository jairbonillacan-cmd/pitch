/**
 * Mercados derivados de la salida de Spacetime v3.0 (goles/puntos esperados y margen).
 *
 * - Fútbol: goles esperados por equipo λ_local = (T + M) / 2, λ_visita = (T − M) / 2 y una
 *   matriz de marcadores Poisson con la corrección de Dixon-Coles para marcadores bajos.
 * - NFL: margen ~ Normal(M, σ_m) con σ_m calibrada para que P(margen > 0) coincida con la
 *   probabilidad de victoria del motor; total ~ Normal(T, σ_t) y puntos por equipo
 *   ~ Normal(λ, σ_e). σ_t y σ_e son las dispersiones típicas de la NFL.
 */

const DC_RHO = -0.11;
const MAX_GOALS = 10;
const NFL_TOTAL_SD = 13.5;
const NFL_TEAM_SD = 10;
const NFL_DEFAULT_MARGIN_SD = 13.5;

export interface GoalModel {
  kind: "goals";
  lambdaHome: number;
  lambdaAway: number;
  /** matrix[h][a] = P(marcador h–a). */
  matrix: number[][];
}

export interface PointsModel {
  kind: "points";
  expectedTotal: number;
  expectedMargin: number;
  marginSd: number;
}

function poissonRow(lambda: number): number[] {
  const out = new Array<number>(MAX_GOALS + 1);
  out[0] = Math.exp(-lambda);
  for (let k = 1; k <= MAX_GOALS; k += 1) out[k] = (out[k - 1]! * lambda) / k;
  return out;
}

export function buildGoalModel(expectedTotal: number, expectedMargin: number): GoalModel | null {
  const lambdaHome = (expectedTotal + expectedMargin) / 2;
  const lambdaAway = (expectedTotal - expectedMargin) / 2;
  if (!(lambdaHome > 0.05) || !(lambdaAway > 0.05) || expectedTotal > 8) return null;
  const ph = poissonRow(lambdaHome);
  const pa = poissonRow(lambdaAway);
  const matrix: number[][] = [];
  let total = 0;
  for (let h = 0; h <= MAX_GOALS; h += 1) {
    const row: number[] = [];
    for (let a = 0; a <= MAX_GOALS; a += 1) {
      let tau = 1;
      if (h === 0 && a === 0) tau = 1 - lambdaHome * lambdaAway * DC_RHO;
      else if (h === 0 && a === 1) tau = 1 + lambdaHome * DC_RHO;
      else if (h === 1 && a === 0) tau = 1 + lambdaAway * DC_RHO;
      else if (h === 1 && a === 1) tau = 1 - DC_RHO;
      const w = Math.max(0, tau) * ph[h]! * pa[a]!;
      row.push(w);
      total += w;
    }
    matrix.push(row);
  }
  for (const row of matrix) for (let a = 0; a < row.length; a += 1) row[a] = row[a]! / total;
  return { kind: "goals", lambdaHome, lambdaAway, matrix };
}

function sumMatrix(model: GoalModel, keep: (h: number, a: number) => boolean): number {
  let s = 0;
  model.matrix.forEach((row, h) => row.forEach((p, a) => {
    if (keep(h, a)) s += p;
  }));
  return s;
}

/** Φ: distribución normal estándar acumulada. */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p =
    d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

/** Inversa de Φ por bisección (suficiente para calibrar una desviación). */
function normalInv(p: number): number {
  let lo = -8;
  let hi = 8;
  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    if (normalCdf(mid) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function buildPointsModel(
  expectedTotal: number,
  expectedMargin: number,
  pHomeWin: number,
): PointsModel | null {
  if (!(expectedTotal > 10)) return null;
  let marginSd = NFL_DEFAULT_MARGIN_SD;
  const z = normalInv(Math.min(0.99, Math.max(0.01, pHomeWin)));
  if (Math.abs(z) > 0.05 && Math.sign(z) === Math.sign(expectedMargin)) {
    const calibrated = expectedMargin / z;
    if (calibrated > 6 && calibrated < 25) marginSd = calibrated;
  }
  return { kind: "points", expectedTotal, expectedMargin, marginSd };
}

function overLine(value: number, line: number): boolean {
  return value > line;
}

/**
 * Probabilidad de una fila de mercado según el modelo; `null` si el mercado no se cubre
 * (la fila conserva entonces la probabilidad del snapshot).
 */
export function derivedMarketProbability(
  model: GoalModel | PointsModel,
  market: string,
  selection: string,
  line: number | undefined,
): number | null {
  const sel = selection.toLowerCase();

  if (model.kind === "goals") {
    if (market === "totals") {
      const m = sel.match(/^(over|under)_(\d+(?:\.\d+)?)$/);
      const ln = m ? Number(m[2]) : line;
      if (ln === undefined || !Number.isFinite(ln)) return null;
      const over = sumMatrix(model, (h, a) => overLine(h + a, ln));
      return (m?.[1] ?? sel) === "under" ? 1 - over : over;
    }
    if (market === "btts") {
      const yes = sumMatrix(model, (h, a) => h > 0 && a > 0);
      if (sel === "yes") return yes;
      if (sel === "no") return 1 - yes;
      return null;
    }
    if (market === "team_totals" && line !== undefined) {
      const m = sel.match(/^(home|away)_(over|under)$/);
      if (!m) return null;
      const over = sumMatrix(model, (h, a) => overLine(m[1] === "home" ? h : a, line));
      return m[2] === "over" ? over : 1 - over;
    }
    if (market === "correct_score") {
      const m = sel.match(/^(\d+)-(\d+)$/);
      if (!m) return null;
      return model.matrix[Number(m[1])]?.[Number(m[2])] ?? null;
    }
    return null;
  }

  // NFL (puntos)
  if (market === "totals" && line !== undefined) {
    const over = 1 - normalCdf((line - model.expectedTotal) / NFL_TOTAL_SD);
    if (sel.startsWith("over")) return over;
    if (sel.startsWith("under")) return 1 - over;
    return null;
  }
  if (market === "spreads" && line !== undefined) {
    // La línea es del lado elegido: local −1.5 cubre si margen > 1.5.
    const homeSide = sel.startsWith("home");
    const awaySide = sel.startsWith("away");
    if (!homeSide && !awaySide) return null;
    const threshold = homeSide ? -line : line;
    const pHomeBeyond = 1 - normalCdf((threshold - model.expectedMargin) / model.marginSd);
    return homeSide ? pHomeBeyond : 1 - pHomeBeyond;
  }
  if (market === "team_totals" && line !== undefined) {
    const m = sel.match(/^(home|away)_(over|under)$/);
    if (!m) return null;
    const mean =
      m[1] === "home"
        ? (model.expectedTotal + model.expectedMargin) / 2
        : (model.expectedTotal - model.expectedMargin) / 2;
    const over = 1 - normalCdf((line - mean) / NFL_TEAM_SD);
    return m[2] === "over" ? over : 1 - over;
  }
  return null;
}
