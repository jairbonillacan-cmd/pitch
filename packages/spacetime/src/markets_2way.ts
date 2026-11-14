/**
 * A28 (Ola 3 · Agente A6) — Derivación exacta de mercados de 2 vías de fútbol desde la matriz
 * de marcadores Dixon-Coles (`dc_lam_home`, `dc_lam_away`, `dc_rho` / `PoissonDC._tau_matrix`),
 * liquidación y EV exactos para líneas asiáticas enteras, medias y partidas (`.25` y `.75`),
 * y Kelly ¼ exacto sobre loterías de 5 estados (`full_win / half_win / push / half_loss / full_loss`).
 *
 * Paridad numérica estricta `< 1e-12` frente a `services/models/markets_2way.py` y compatibilidad
 * directa con `src/domain/prediction/clv.ts` (`gradeMarketOutcome`, `settlePickPnl`) y `ledger.ts`.
 */

import { blendLogit2Way, devigMarketOdds, type CoreDevigMethod } from "./blend";
import type { SettlementOutcome } from "./ledger";

export const MARKETS_2WAY_SCHEMA_VERSION = "markets_2way_v1";
export const DEFAULT_DC_RHO = -0.11;
export const DEFAULT_MAX_GOALS = 12;
export const MIN_MAX_GOALS = 10;
export const MAX_MAX_GOALS = 50;
export const MAX_LAMBDA_GOALS = 25.0;
export const MAX_ABS_LINE = 25.0;

export const AH_CANONICAL_LINES = Object.freeze([
  -1.0, -0.75, -0.5, -0.25, 0.0, 0.25, 0.5, 0.75, 1.0,
] as const);

export const TOTALS_CANONICAL_LINES = Object.freeze([
  1.5, 1.75, 2.0, 2.25, 2.5, 2.75, 3.0, 3.25, 3.5,
] as const);

export const SUPPORTED_2WAY_MARKETS = Object.freeze(["ah", "dnb", "totals", "btts"] as const);

export const DEFAULT_KELLY_FRACTION = 0.25;
export const DEFAULT_BANKROLL_UNIT_PCT = 0.01;
export const MIN_DECIMAL_PRICE = 1.01;
export const MAX_DECIMAL_PRICE = 1000.0;
const PROB_EPS = 1e-12;

export type Canonical2WayMarket = (typeof SUPPORTED_2WAY_MARKETS)[number];
export type LineConvention = "selection" | "home_canonical";
export type AsianSettlementBucket = "full_win" | "half_win" | "push" | "half_loss" | "full_loss";

export interface AsianSettlementProbs {
  readonly p_full_win: number;
  readonly p_half_win: number;
  readonly p_push: number;
  readonly p_half_loss: number;
  readonly p_full_loss: number;
  readonly p_effective_win: number;
}

export interface PairedAsianHandicapLine {
  readonly home_line: number;
  readonly away_line: number;
  readonly home: AsianSettlementProbs;
  readonly away: AsianSettlementProbs;
}

export interface DerivedTotalsBlock {
  readonly lines: readonly number[];
  readonly over: Readonly<Record<string, AsianSettlementProbs>>;
  readonly under: Readonly<Record<string, AsianSettlementProbs>>;
}

export interface Derived2WayMarketsBundle {
  readonly meta: {
    readonly lam_home: number;
    readonly lam_away: number;
    readonly rho: number;
    readonly max_goals: number;
    readonly matrix_sum: number;
  };
  readonly ah: {
    readonly lines: readonly number[];
    readonly home: Readonly<Record<string, AsianSettlementProbs>>;
    readonly away: Readonly<Record<string, AsianSettlementProbs>>;
    readonly paired_by_home_line: Readonly<Record<string, PairedAsianHandicapLine>>;
  };
  readonly dnb: {
    readonly home: AsianSettlementProbs;
    readonly away: AsianSettlementProbs;
    readonly p_push: number;
  };
  readonly totals: DerivedTotalsBlock;
  readonly ou: DerivedTotalsBlock;
  readonly btts: {
    readonly yes: AsianSettlementProbs;
    readonly no: AsianSettlementProbs;
  };
}

export interface ExactAsianKellyResult {
  readonly ev: number;
  readonly p_effective_win: number;
  readonly p_breakeven: number;
  readonly edge_effective: number;
  readonly f_full_kelly: number;
  readonly f_quarter_kelly: number;
  readonly stake_raw_u: number;
  readonly expected_log_growth_g: number;
}

export interface EvaluateAsianValueBetOptions {
  readonly pBlendedEffective?: number;
  readonly sigmaP?: number;
  readonly uncertaintyPenaltyK?: number;
  readonly kellyFraction?: number;
  readonly bankrollUnitPct?: number;
}

export interface EvaluateAsianValueBetResult {
  readonly settlement_probs: AsianSettlementProbs;
  readonly shrunk_settlement_probs: AsianSettlementProbs;
  readonly p_effective_win: number;
  readonly p_shrunk_effective: number;
  readonly p_breakeven: number;
  readonly edge_effective: number;
  readonly ev: number;
  readonly ev_shrunk: number;
  readonly edge_erased_by_uncertainty: boolean;
  readonly f_full_kelly: number;
  readonly f_quarter_kelly: number;
  readonly stake_raw_u: number;
  readonly expected_log_growth_g: number;
}

export interface AsianLineSettlementResult {
  readonly market: Canonical2WayMarket;
  readonly line: number | null;
  readonly selection: string;
  /** Compatible directamente con `settlePickPnl` y `PickLedger.appendSettlement` (`"push"` en empate/línea exacta). */
  readonly outcome: SettlementOutcome;
  /** Espejo 1:1 de `gradeMarketOutcome` en `clv.ts` (`"void"` cuando `diff === 0`). */
  readonly grade_outcome: SettlementOutcome;
  readonly bucket: AsianSettlementBucket;
  readonly is_push: boolean;
  readonly unit_return: number;
  readonly pnl_u: number;
  readonly gross_return_u: number;
}

export interface Markets2WaySegmentConfig {
  readonly league: string;
  readonly market: Canonical2WayMarket;
  readonly sport: string;
  readonly enabled: boolean;
  readonly disabled_reason: string | null;
  readonly a4_gate_passed?: boolean;
  readonly a3_validation_passed?: boolean;
  readonly w_effective: number;
  readonly w_effective_a4_raw?: number;
  readonly best_devig_method: CoreDevigMethod;
  readonly dc_rho_recommended: number;
  readonly n_events_oos_a4?: number;
  readonly n_events_paired_closing_a4?: number;
  readonly n_picks_oos_a3?: number;
  readonly clv_pct_mean_oos_a3?: number | null;
  readonly clv_pct_ci95_oos_a3?: readonly [number, number] | readonly number[] | null;
  readonly buckets?: Readonly<
    Record<
      string,
      {
        readonly p_edge_min: number;
        readonly ev_threshold_solido: number;
        readonly ev_threshold_valor: number;
      }
    >
  >;
}

export interface Markets2WayConfigArtifact {
  readonly schema_version: string;
  readonly generated_at_utc?: string;
  readonly sport?: string;
  readonly eval_split?: string;
  readonly holdout_sealed_untouched?: boolean;
  readonly dixon_coles_defaults?: {
    readonly default_dc_rho: number;
    readonly default_max_goals: number;
    readonly min_max_goals?: number;
    readonly ah_canonical_lines?: readonly number[];
    readonly totals_canonical_lines?: readonly number[];
    readonly kelly_fraction?: number;
    readonly bankroll_unit_pct?: number;
    readonly dc_rho_by_league?: Readonly<Record<string, number>>;
  };
  readonly segments: Readonly<Record<string, Markets2WaySegmentConfig>>;
}

export class Markets2WayValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Markets2WayValidationError";
  }
}

function isFiniteReal(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function canonicalize2WayMarket(market: string): Canonical2WayMarket {
  if (typeof market !== "string" || market.trim().length === 0) {
    throw new Markets2WayValidationError(`mercado 2-vías inválido: ${String(market)}`);
  }
  const m = market.trim().toLowerCase();
  if (m === "ah" || m === "asian_handicap" || m === "spread" || m === "handicap") {
    return "ah";
  }
  if (m === "dnb" || m === "draw_no_bet" || m === "moneyline" || m === "ml" || m === "2way") {
    return "dnb";
  }
  if (m === "ou" || m === "totals" || m === "total" || m === "over_under") {
    return "totals";
  }
  if (m === "btts" || m === "both_teams_to_score") {
    return "btts";
  }
  throw new Markets2WayValidationError(`mercado 2-vías no soportado: "${market}"`);
}

export function canonicalize2WaySelection(market: string, selection: string): string {
  const m = canonicalize2WayMarket(market);
  if (typeof selection !== "string" || selection.trim().length === 0) {
    throw new Markets2WayValidationError(`selección inválida para ${m}: ${String(selection)}`);
  }
  const s = selection.trim().toLowerCase();
  if (m === "ah" || m === "dnb") {
    if (s === "home" || s === "1" || s === "h") return "home";
    if (s === "away" || s === "2" || s === "a") return "away";
    throw new Markets2WayValidationError(`selección desconocida para ${m}: "${selection}"`);
  }
  if (m === "totals") {
    if (s === "over" || s === "o") return "over";
    if (s === "under" || s === "u") return "under";
    throw new Markets2WayValidationError(`selección desconocida para totals/ou: "${selection}"`);
  }
  if (m === "btts") {
    if (s === "yes" || s === "si" || s === "y") return "yes";
    if (s === "no" || s === "n") return "no";
    throw new Markets2WayValidationError(`selección desconocida para btts: "${selection}"`);
  }
  throw new Markets2WayValidationError(`mercado no soportado: "${market}"`);
}

export function validateQuarterLine(line: number, fieldName = "line"): number {
  if (!isFiniteReal(line)) {
    throw new Markets2WayValidationError(`${fieldName} debe ser un número finito; recibido ${String(line)}`);
  }
  if (Math.abs(line) > MAX_ABS_LINE) {
    throw new Markets2WayValidationError(
      `${fieldName} fuera de rango [-${MAX_ABS_LINE}, ${MAX_ABS_LINE}]: ${line}`,
    );
  }
  const q = Math.round(line * 4.0);
  if (Math.abs(line * 4.0 - q) > 1e-6) {
    throw new Markets2WayValidationError(
      `${fieldName} debe ser múltiplo de 0.25 (entera, media o cuarto asiático); recibido ${line}`,
    );
  }
  const norm = q / 4.0;
  return Object.is(norm, -0) || norm === 0 ? 0 : norm;
}

export function formatLineKey(line: number): string {
  const norm = validateQuarterLine(line, "line");
  return String(norm);
}

// ---------------------------------------------------------------------------
// 1. Matriz exacta de marcadores Dixon-Coles (`PoissonDC._tau_matrix`)
// ---------------------------------------------------------------------------

/**
 * Construye la matriz `0..maxGoals` (`maxGoals >= 10`) con ajuste estructural `PoissonDC._tau_matrix`
 * en `(0,0), (0,1), (1,0), (1,1)` y renormaliza en orden fila-mayor para sumar exactamente `1.0`.
 */
export function buildDixonColesScoreMatrix(
  lamHome: number,
  lamAway: number,
  rho: number = DEFAULT_DC_RHO,
  maxGoals: number = DEFAULT_MAX_GOALS,
): number[][] {
  if (!isFiniteReal(lamHome) || lamHome <= 0.0 || lamHome > MAX_LAMBDA_GOALS) {
    throw new Markets2WayValidationError(
      `lamHome debe estar en (0, ${MAX_LAMBDA_GOALS}]; recibido ${String(lamHome)}`,
    );
  }
  if (!isFiniteReal(lamAway) || lamAway <= 0.0 || lamAway > MAX_LAMBDA_GOALS) {
    throw new Markets2WayValidationError(
      `lamAway debe estar en (0, ${MAX_LAMBDA_GOALS}]; recibido ${String(lamAway)}`,
    );
  }
  if (!isFiniteReal(rho) || Math.abs(rho) > 1.0) {
    throw new Markets2WayValidationError(`rho debe estar en [-1, 1]; recibido ${String(rho)}`);
  }
  if (!isFiniteReal(maxGoals) || !Number.isInteger(maxGoals)) {
    throw new Markets2WayValidationError(
      `maxGoals debe ser entero >= ${MIN_MAX_GOALS}; recibido ${String(maxGoals)}`,
    );
  }
  if (maxGoals < MIN_MAX_GOALS || maxGoals > MAX_MAX_GOALS) {
    throw new Markets2WayValidationError(
      `maxGoals debe estar en [${MIN_MAX_GOALS}, ${MAX_MAX_GOALS}]; recibido ${maxGoals}`,
    );
  }

  const size = maxGoals + 1;
  const pmfH = new Array<number>(size).fill(0.0);
  const pmfA = new Array<number>(size).fill(0.0);
  pmfH[0] = Math.exp(-lamHome);
  pmfA[0] = Math.exp(-lamAway);
  for (let k = 1; k < size; k += 1) {
    pmfH[k] = (pmfH[k - 1]! * lamHome) / k;
    pmfA[k] = (pmfA[k - 1]! * lamAway) / k;
  }

  const raw: number[][] = new Array<number[]>(size);
  for (let h = 0; h < size; h += 1) {
    const ph = pmfH[h]!;
    const row = new Array<number>(size);
    for (let a = 0; a < size; a += 1) {
      row[a] = ph * pmfA[a]!;
    }
    raw[h] = row;
  }

  raw[0]![0] = raw[0]![0]! * Math.max(1.0 - lamHome * lamAway * rho, 1e-9);
  raw[0]![1] = raw[0]![1]! * Math.max(1.0 + lamHome * rho, 1e-9);
  raw[1]![0] = raw[1]![0]! * Math.max(1.0 + lamAway * rho, 1e-9);
  raw[1]![1] = raw[1]![1]! * Math.max(1.0 - rho, 1e-9);

  let total = 0.0;
  for (let h = 0; h < size; h += 1) {
    const row = raw[h]!;
    for (let a = 0; a < size; a += 1) {
      total += row[a]!;
    }
  }
  if (!Number.isFinite(total) || total <= 0.0) {
    throw new Markets2WayValidationError("Suma de matriz Dixon-Coles inválida o nula.");
  }

  const invTotal = 1.0 / total;
  const out: number[][] = new Array<number[]>(size);
  for (let h = 0; h < size; h += 1) {
    const row = raw[h]!;
    const normRow = new Array<number>(size);
    for (let a = 0; a < size; a += 1) {
      normRow[a] = row[a]! * invTotal;
    }
    out[h] = normRow;
  }
  return out;
}

function validateScoreMatrix(matrix: readonly (readonly number[])[]): number {
  if (!Array.isArray(matrix) || matrix.length < MIN_MAX_GOALS + 1) {
    throw new Markets2WayValidationError(
      `La matriz de marcadores debe tener dimensión >= ${MIN_MAX_GOALS + 1}x${MIN_MAX_GOALS + 1}.`,
    );
  }
  const size = matrix.length;
  let total = 0.0;
  for (let h = 0; h < size; h += 1) {
    const row = matrix[h];
    if (!Array.isArray(row) || row.length !== size) {
      throw new Markets2WayValidationError("La matriz de marcadores debe ser cuadrada.");
    }
    for (let a = 0; a < size; a += 1) {
      const v = row[a];
      if (!isFiniteReal(v) || v < -1e-15) {
        throw new Markets2WayValidationError(`Entrada inválida en matriz [${h}][${a}]: ${String(v)}`);
      }
      total += v;
    }
  }
  if (Math.abs(total - 1.0) > 1e-6) {
    throw new Markets2WayValidationError(`La matriz de marcadores debe sumar 1.0; suma=${total.toFixed(12)}`);
  }
  return size;
}

function finalizeSettlementProbs(
  pFw: number,
  pHw: number,
  pPush: number,
  pHl: number,
  pFl: number,
): AsianSettlementProbs {
  let fw = Math.max(0.0, pFw);
  let hw = Math.max(0.0, pHw);
  let pu = Math.max(0.0, pPush);
  let hl = Math.max(0.0, pHl);
  let fl = Math.max(0.0, pFl);
  const s = fw + hw + pu + hl + fl;
  if (!Number.isFinite(s) || s <= 0.0) {
    throw new Markets2WayValidationError("Probabilidades de liquidación degeneradas (suma <= 0).");
  }
  fw /= s;
  hw /= s;
  pu /= s;
  hl /= s;
  fl /= s;

  const winEq = fw + 0.5 * hw;
  const lossEq = fl + 0.5 * hl;
  const activeMass = winEq + lossEq;
  const pEff = activeMass > PROB_EPS ? winEq / activeMass : 0.5;
  return Object.freeze({
    p_full_win: fw,
    p_half_win: hw,
    p_push: pu,
    p_half_loss: hl,
    p_full_loss: fl,
    p_effective_win: pEff,
  });
}

/**
 * Deriva `{ p_full_win, p_half_win, p_push, p_half_loss, p_full_loss, p_effective_win }`
 * para cualquier selección y línea de `ah`, `dnb`, `ou`/`totals` o `btts`.
 */
export function deriveSelectionSettlementProbs(
  matrix: readonly (readonly number[])[],
  market: string,
  line: number | null,
  selection: string,
  options: { readonly lineConvention?: LineConvention } = {},
): AsianSettlementProbs {
  const size = validateScoreMatrix(matrix);
  const m = canonicalize2WayMarket(market);
  const sel = canonicalize2WaySelection(m, selection);
  const lineConvention: LineConvention = options.lineConvention ?? "selection";
  if (lineConvention !== "selection" && lineConvention !== "home_canonical") {
    throw new Markets2WayValidationError(`lineConvention inválida: ${String(lineConvention)}`);
  }

  let pFw = 0.0;
  let pHw = 0.0;
  let pPu = 0.0;
  let pHl = 0.0;
  let pFl = 0.0;

  if (m === "dnb") {
    if (line !== null && line !== undefined && validateQuarterLine(line, "line") !== 0.0) {
      throw new Markets2WayValidationError(`dnb solo admite line=null o 0.0; recibido ${String(line)}`);
    }
    for (let h = 0; h < size; h += 1) {
      const row = matrix[h]!;
      for (let a = 0; a < size; a += 1) {
        const p = row[a]!;
        if (h === a) {
          pPu += p;
        } else if ((h > a && sel === "home") || (a > h && sel === "away")) {
          pFw += p;
        } else {
          pFl += p;
        }
      }
    }
    return finalizeSettlementProbs(pFw, 0.0, pPu, 0.0, pFl);
  }

  if (m === "btts") {
    if (line !== null && line !== undefined) {
      throw new Markets2WayValidationError(`btts no admite línea numérica; recibido ${String(line)}`);
    }
    let pYes = 0.0;
    for (let h = 1; h < size; h += 1) {
      const row = matrix[h]!;
      for (let a = 1; a < size; a += 1) {
        pYes += row[a]!;
      }
    }
    const pNo = Math.max(0.0, 1.0 - pYes);
    if (sel === "yes") {
      return finalizeSettlementProbs(pYes, 0.0, 0.0, 0.0, pNo);
    }
    return finalizeSettlementProbs(pNo, 0.0, 0.0, 0.0, pYes);
  }

  if (line === null || line === undefined) {
    throw new Markets2WayValidationError(`El mercado ${m} requiere una línea numérica finita.`);
  }
  const ln = validateQuarterLine(line, "line");

  if (m === "ah") {
    const hSel = lineConvention === "home_canonical" && sel === "away" ? (ln === 0 ? 0 : -ln) : ln;
    for (let h = 0; h < size; h += 1) {
      const row = matrix[h]!;
      for (let a = 0; a < size; a += 1) {
        const p = row[a]!;
        const margin = sel === "home" ? h - a : a - h;
        const diff = margin + hSel;
        if (diff > 0.25 + 1e-9) {
          pFw += p;
        } else if (Math.abs(diff - 0.25) <= 1e-9) {
          pHw += p;
        } else if (Math.abs(diff) <= 1e-9) {
          pPu += p;
        } else if (Math.abs(diff + 0.25) <= 1e-9) {
          pHl += p;
        } else {
          pFl += p;
        }
      }
    }
    return finalizeSettlementProbs(pFw, pHw, pPu, pHl, pFl);
  }

  if (ln <= 0.0) {
    throw new Markets2WayValidationError(`La línea de totals/ou debe ser > 0; recibido ${ln}`);
  }
  for (let h = 0; h < size; h += 1) {
    const row = matrix[h]!;
    for (let a = 0; a < size; a += 1) {
      const p = row[a]!;
      const tot = h + a;
      const diff = sel === "over" ? tot - ln : ln - tot;
      if (diff > 0.25 + 1e-9) {
        pFw += p;
      } else if (Math.abs(diff - 0.25) <= 1e-9) {
        pHw += p;
      } else if (Math.abs(diff) <= 1e-9) {
        pPu += p;
      } else if (Math.abs(diff + 0.25) <= 1e-9) {
        pHl += p;
      } else {
        pFl += p;
      }
    }
  }
  return finalizeSettlementProbs(pFw, pHw, pPu, pHl, pFl);
}

/**
 * Deriva todos los mercados de 2 vías (`ah` `-1.0..+1.0`, `dnb`, `totals`/`ou` `1.5..3.5`, `btts`)
 * desde `lamHome`, `lamAway` y `rho` sobre la grilla `0..maxGoals` (`maxGoals >= 10`).
 */
export function deriveAll2WayMarkets(
  lamHome: number,
  lamAway: number,
  rho: number = DEFAULT_DC_RHO,
  maxGoals: number = DEFAULT_MAX_GOALS,
  options: {
    readonly ahLines?: readonly number[];
    readonly totalsLines?: readonly number[];
  } = {},
): Derived2WayMarketsBundle {
  const matrix = buildDixonColesScoreMatrix(lamHome, lamAway, rho, maxGoals);
  let matSum = 0.0;
  for (let h = 0; h < matrix.length; h += 1) {
    const row = matrix[h]!;
    for (let a = 0; a < row.length; a += 1) {
      matSum += row[a]!;
    }
  }

  const ahLinesRaw = options.ahLines ?? AH_CANONICAL_LINES;
  const totLinesRaw = options.totalsLines ?? TOTALS_CANONICAL_LINES;
  const ahNormLines = ahLinesRaw.map((x) => validateQuarterLine(x, "ahLine"));
  const totNormLines = totLinesRaw.map((x) => validateQuarterLine(x, "totalsLine"));

  const ahHome: Record<string, AsianSettlementProbs> = {};
  const ahAway: Record<string, AsianSettlementProbs> = {};
  for (const ln of ahNormLines) {
    const k = formatLineKey(ln);
    ahHome[k] = deriveSelectionSettlementProbs(matrix, "ah", ln, "home");
    ahAway[k] = deriveSelectionSettlementProbs(matrix, "ah", ln, "away");
  }

  const ahPaired: Record<string, PairedAsianHandicapLine> = {};
  for (const ln of ahNormLines) {
    const kHome = formatLineKey(ln);
    const oppLn = ln === 0 ? 0 : -ln;
    const kOpp = formatLineKey(oppLn);
    const homeP = ahHome[kHome]!;
    const awayP = ahAway[kOpp] ?? deriveSelectionSettlementProbs(matrix, "ah", oppLn, "away");
    ahPaired[kHome] = Object.freeze({
      home_line: ln,
      away_line: oppLn,
      home: homeP,
      away: awayP,
    });
  }

  const dnbHome = deriveSelectionSettlementProbs(matrix, "dnb", null, "home");
  const dnbAway = deriveSelectionSettlementProbs(matrix, "dnb", null, "away");

  const totOver: Record<string, AsianSettlementProbs> = {};
  const totUnder: Record<string, AsianSettlementProbs> = {};
  for (const ln of totNormLines) {
    const k = formatLineKey(ln);
    totOver[k] = deriveSelectionSettlementProbs(matrix, "totals", ln, "over");
    totUnder[k] = deriveSelectionSettlementProbs(matrix, "totals", ln, "under");
  }

  const bttsYes = deriveSelectionSettlementProbs(matrix, "btts", null, "yes");
  const bttsNo = deriveSelectionSettlementProbs(matrix, "btts", null, "no");

  const totalsBlock: DerivedTotalsBlock = Object.freeze({
    lines: Object.freeze(totNormLines),
    over: Object.freeze(totOver),
    under: Object.freeze(totUnder),
  });

  return Object.freeze({
    meta: Object.freeze({
      lam_home: lamHome,
      lam_away: lamAway,
      rho,
      max_goals: maxGoals,
      matrix_sum: matSum,
    }),
    ah: Object.freeze({
      lines: Object.freeze(ahNormLines),
      home: Object.freeze(ahHome),
      away: Object.freeze(ahAway),
      paired_by_home_line: Object.freeze(ahPaired),
    }),
    dnb: Object.freeze({
      home: dnbHome,
      away: dnbAway,
      p_push: dnbHome.p_push,
    }),
    totals: totalsBlock,
    ou: totalsBlock,
    btts: Object.freeze({
      yes: bttsYes,
      no: bttsNo,
    }),
  });
}

// ---------------------------------------------------------------------------
// 2. EV exacto, Kelly ¼ exacto de 5 estados y liquidación `settleAsianLine`
// ---------------------------------------------------------------------------

export function validateSettlementProbs(
  probs: Pick<
    AsianSettlementProbs,
    "p_full_win" | "p_half_win" | "p_push" | "p_half_loss" | "p_full_loss"
  >,
): AsianSettlementProbs {
  if (probs === null || typeof probs !== "object") {
    throw new Markets2WayValidationError("settlementProbs debe ser un objeto válido.");
  }
  const keys = ["p_full_win", "p_half_win", "p_push", "p_half_loss", "p_full_loss"] as const;
  const vals: number[] = [];
  for (const k of keys) {
    const v = probs[k];
    if (!isFiniteReal(v) || v < -1e-9 || v > 1.0 + 1e-9) {
      throw new Markets2WayValidationError(`Campo inválido ${k}=${String(v)} en settlementProbs`);
    }
    vals.push(Math.max(0.0, v));
  }
  const tot = vals[0]! + vals[1]! + vals[2]! + vals[3]! + vals[4]!;
  if (Math.abs(tot - 1.0) > 1e-3) {
    throw new Markets2WayValidationError(`settlementProbs deben sumar 1.0; suma=${tot.toFixed(8)}`);
  }
  return finalizeSettlementProbs(vals[0]!, vals[1]!, vals[2]!, vals[3]!, vals[4]!);
}

/**
 * Reescala `(p_full_win, p_half_win)` y `(p_full_loss, p_half_loss)` preservando `p_push` y la
 * proporción de media línea para que `p_effective_win` iguale exactamente a `pEffectiveTarget`.
 */
export function retargetSettlementProbs(
  baseProbs: Pick<
    AsianSettlementProbs,
    "p_full_win" | "p_half_win" | "p_push" | "p_half_loss" | "p_full_loss"
  >,
  pEffectiveTarget: number,
): AsianSettlementProbs {
  const bp = validateSettlementProbs(baseProbs);
  if (!isFiniteReal(pEffectiveTarget) || pEffectiveTarget < 0.0 || pEffectiveTarget > 1.0) {
    throw new Markets2WayValidationError(`pEffectiveTarget fuera de [0, 1]: ${String(pEffectiveTarget)}`);
  }

  const pPush = bp.p_push;
  const nonPush = Math.max(0.0, 1.0 - pPush);
  if (nonPush <= PROB_EPS) {
    return bp;
  }
  if (pEffectiveTarget <= 0.0) {
    return finalizeSettlementProbs(0.0, 0.0, pPush, 0.0, nonPush);
  }
  if (pEffectiveTarget >= 1.0) {
    return finalizeSettlementProbs(nonPush, 0.0, pPush, 0.0, 0.0);
  }

  const w0 = bp.p_full_win + bp.p_half_win;
  const l0 = bp.p_full_loss + bp.p_half_loss;
  const wEq = bp.p_full_win + 0.5 * bp.p_half_win;
  const lEq = bp.p_full_loss + 0.5 * bp.p_half_loss;

  if (wEq <= PROB_EPS || lEq <= PROB_EPS) {
    return finalizeSettlementProbs(
      nonPush * pEffectiveTarget,
      0.0,
      pPush,
      0.0,
      nonPush * (1.0 - pEffectiveTarget),
    );
  }

  const awRaw = pEffectiveTarget / wEq;
  const alRaw = (1.0 - pEffectiveTarget) / lEq;
  const z = awRaw * w0 + alRaw * l0;
  const scaleW = nonPush * (awRaw / z);
  const scaleL = nonPush * (alRaw / z);

  return finalizeSettlementProbs(
    bp.p_full_win * scaleW,
    bp.p_half_win * scaleW,
    pPush,
    bp.p_half_loss * scaleL,
    bp.p_full_loss * scaleL,
  );
}

/**
 * Fórmula exacta del EV por unidad apostada (Contrato A6 §2):
 * `ev = p_full_win * (price - 1) + p_half_win * 0.5 * (price - 1) - p_half_loss * 0.5 - p_full_loss * 1.0`.
 */
export function computeAsianEv(
  settlementProbs: Pick<
    AsianSettlementProbs,
    "p_full_win" | "p_half_win" | "p_push" | "p_half_loss" | "p_full_loss"
  >,
  priceDecimal: number,
): number {
  const sp = validateSettlementProbs(settlementProbs);
  if (!isFiniteReal(priceDecimal) || priceDecimal < MIN_DECIMAL_PRICE || priceDecimal > MAX_DECIMAL_PRICE) {
    throw new Markets2WayValidationError(`priceDecimal inválido: ${String(priceDecimal)}`);
  }
  const b = priceDecimal - 1.0;
  return (
    sp.p_full_win * b +
    sp.p_half_win * 0.5 * b -
    sp.p_half_loss * 0.5 -
    sp.p_full_loss * 1.0
  );
}

function asianLogGrowth(
  f: number,
  b: number,
  pFw: number,
  pHw: number,
  pHl: number,
  pFl: number,
): number {
  if (f <= 0.0) return 0.0;
  let g = 0.0;
  if (pFw > 0.0) g += pFw * Math.log(1.0 + b * f);
  if (pHw > 0.0) g += pHw * Math.log(1.0 + 0.5 * b * f);
  if (pHl > 0.0) g += pHl * Math.log(1.0 - 0.5 * f);
  if (pFl > 0.0) g += pFl * Math.log(1.0 - f);
  return g;
}

/**
 * Resuelve con Newton-bisección salvaguardado (`|Δ| < 1e-15`) la fracción óptima de Kelly
 * sobre la lotería exacta de 5 estados `(full_win, half_win, push, half_loss, full_loss)` y escala por `kellyFraction` (`0.25`).
 */
export function solveExactAsianKelly(
  settlementProbs: Pick<
    AsianSettlementProbs,
    "p_full_win" | "p_half_win" | "p_push" | "p_half_loss" | "p_full_loss"
  >,
  priceDecimal: number,
  options: {
    readonly kellyFraction?: number;
    readonly bankrollUnitPct?: number;
  } = {},
): ExactAsianKellyResult {
  const sp = validateSettlementProbs(settlementProbs);
  if (!isFiniteReal(priceDecimal) || priceDecimal < MIN_DECIMAL_PRICE || priceDecimal > MAX_DECIMAL_PRICE) {
    throw new Markets2WayValidationError(`priceDecimal inválido: ${String(priceDecimal)}`);
  }
  const kFrac = options.kellyFraction ?? DEFAULT_KELLY_FRACTION;
  const unitPct = options.bankrollUnitPct ?? DEFAULT_BANKROLL_UNIT_PCT;
  if (!isFiniteReal(kFrac) || kFrac <= 0.0 || kFrac > 1.0) {
    throw new Markets2WayValidationError(`kellyFraction inválida: ${String(kFrac)}`);
  }
  if (!isFiniteReal(unitPct) || unitPct <= 0.0 || unitPct > 1.0) {
    throw new Markets2WayValidationError(`bankrollUnitPct inválido: ${String(unitPct)}`);
  }

  const b = priceDecimal - 1.0;
  const pFw = sp.p_full_win;
  const pHw = sp.p_half_win;
  const pHl = sp.p_half_loss;
  const pFl = sp.p_full_loss;
  const pEff = sp.p_effective_win;
  const pBe = 1.0 / priceDecimal;
  const ev = pFw * b + pHw * 0.5 * b - pHl * 0.5 - pFl * 1.0;

  if (ev <= 1e-15 || b <= 0.0) {
    return Object.freeze({
      ev,
      p_effective_win: pEff,
      p_breakeven: pBe,
      edge_effective: pEff - pBe,
      f_full_kelly: 0.0,
      f_quarter_kelly: 0.0,
      stake_raw_u: 0.0,
      expected_log_growth_g: 0.0,
    });
  }

  const derivs = (x: number): readonly [number, number] => {
    const tFw = 1.0 + b * x;
    const tHw = 1.0 + 0.5 * b * x;
    const tHl = 1.0 - 0.5 * x;
    const tFl = 1.0 - x;
    let g1 = 0.0;
    let g2 = 0.0;
    if (pFw > 0.0) {
      g1 += (pFw * b) / tFw;
      g2 -= (pFw * b * b) / (tFw * tFw);
    }
    if (pHw > 0.0) {
      const hb = 0.5 * b;
      g1 += (pHw * hb) / tHw;
      g2 -= (pHw * hb * hb) / (tHw * tHw);
    }
    if (pHl > 0.0) {
      g1 -= (0.5 * pHl) / tHl;
      g2 -= (0.25 * pHl) / (tHl * tHl);
    }
    if (pFl > 0.0) {
      g1 -= pFl / tFl;
      g2 -= pFl / (tFl * tFl);
    }
    return [g1, g2];
  };

  let fStar = 0.0;
  if (pFl <= 0.0 && pHl <= 0.0) {
    fStar = 1.0;
  } else if (pFl <= 0.0 && derivs(1.0)[0] >= 0.0) {
    fStar = 1.0;
  } else {
    let lo = 0.0;
    let hi = pFl > 0.0 ? 1.0 - 1e-12 : 1.0;
    while (pFl > 0.0 && derivs(hi)[0] > 0.0 && 1.0 - hi > 1e-15) {
      hi = 0.5 * (hi + 1.0);
    }
    let fCur = Math.min(0.5 * hi, Math.max(1e-9, ev / Math.max(1e-6, b)));
    for (let iter = 0; iter < 64; iter += 1) {
      const [g1, g2] = derivs(fCur);
      if (g1 > 0.0) {
        lo = fCur;
      } else {
        hi = fCur;
      }
      if (Math.abs(g1) <= 1e-15 && hi - lo <= 1e-15) {
        break;
      }
      if (g2 < -1e-18) {
        const cand = fCur - g1 / g2;
        if (cand > lo && cand < hi) {
          fCur = cand;
        } else {
          fCur = 0.5 * (lo + hi);
        }
      } else {
        fCur = 0.5 * (lo + hi);
      }
    }
    fStar = fCur;
  }

  const fScaled = kFrac * fStar;
  const unitScale = unitPct === 0.01 ? 100.0 : 1.0 / unitPct;
  const stakeRawU = unitScale * fScaled;
  const gVal = asianLogGrowth(fScaled, b, pFw, pHw, pHl, pFl);

  return Object.freeze({
    ev,
    p_effective_win: pEff,
    p_breakeven: pBe,
    edge_effective: pEff - pBe,
    f_full_kelly: fStar,
    f_quarter_kelly: fScaled,
    stake_raw_u: stakeRawU,
    expected_log_growth_g: gVal,
  });
}

export function evaluateAsianValueBet(
  baseSettlementProbs: Pick<
    AsianSettlementProbs,
    "p_full_win" | "p_half_win" | "p_push" | "p_half_loss" | "p_full_loss"
  >,
  priceDecimal: number,
  options: EvaluateAsianValueBetOptions = {},
): EvaluateAsianValueBetResult {
  const bp = validateSettlementProbs(baseSettlementProbs);
  const sigmaP = options.sigmaP ?? 0.0;
  const uncK = options.uncertaintyPenaltyK ?? 0.0;
  if (!isFiniteReal(sigmaP) || sigmaP < 0.0) {
    throw new Markets2WayValidationError(`sigmaP inválida: ${String(sigmaP)}`);
  }
  if (!isFiniteReal(uncK) || uncK < 0.0) {
    throw new Markets2WayValidationError(`uncertaintyPenaltyK inválido: ${String(uncK)}`);
  }

  const pEffFinal = options.pBlendedEffective !== undefined ? options.pBlendedEffective : bp.p_effective_win;
  const blendedSp = options.pBlendedEffective !== undefined ? retargetSettlementProbs(bp, pEffFinal) : bp;
  const evExact = computeAsianEv(blendedSp, priceDecimal);

  const pShrunk = Math.max(0.0, pEffFinal - uncK * sigmaP);
  const shrunkSp = retargetSettlementProbs(bp, pShrunk);
  const kellyShrunk = solveExactAsianKelly(shrunkSp, priceDecimal, {
    kellyFraction: options.kellyFraction,
    bankrollUnitPct: options.bankrollUnitPct,
  });

  return Object.freeze({
    settlement_probs: blendedSp,
    shrunk_settlement_probs: shrunkSp,
    p_effective_win: blendedSp.p_effective_win,
    p_shrunk_effective: pShrunk,
    p_breakeven: 1.0 / priceDecimal,
    edge_effective: blendedSp.p_effective_win - 1.0 / priceDecimal,
    ev: evExact,
    ev_shrunk: kellyShrunk.ev,
    edge_erased_by_uncertainty: kellyShrunk.f_quarter_kelly <= 0.0,
    f_full_kelly: kellyShrunk.f_full_kelly,
    f_quarter_kelly: kellyShrunk.f_quarter_kelly,
    stake_raw_u: kellyShrunk.stake_raw_u,
    expected_log_growth_g: kellyShrunk.expected_log_growth_g,
  });
}

/**
 * Liquida líneas enteras, medias y partidas (`.25` y `.75`) de `ah`, `dnb`, `ou`/`totals` y `btts`
 * con compatibilidad exacta frente a `clv.ts` (`gradeMarketOutcome`, `settlePickPnl`) y `clv_report.py`.
 */
export function settleAsianLine(
  market: string,
  line: number | null,
  selection: string,
  homeGoals: number,
  awayGoals: number,
  stakeU: number,
  priceDecimal: number,
  options: { readonly lineConvention?: LineConvention } = {},
): AsianLineSettlementResult {
  const m = canonicalize2WayMarket(market);
  const sel = canonicalize2WaySelection(m, selection);
  const lineConvention: LineConvention = options.lineConvention ?? "selection";
  if (lineConvention !== "selection" && lineConvention !== "home_canonical") {
    throw new Markets2WayValidationError(`lineConvention inválida: ${String(lineConvention)}`);
  }
  if (!isFiniteReal(homeGoals) || !isFiniteReal(awayGoals) || homeGoals < 0.0 || awayGoals < 0.0) {
    throw new Markets2WayValidationError(
      `Marcadores inválidos: homeGoals=${String(homeGoals)}, awayGoals=${String(awayGoals)}`,
    );
  }
  if (!isFiniteReal(stakeU) || stakeU <= 0.0) {
    throw new Markets2WayValidationError(`stakeU debe ser > 0 finito; recibido ${String(stakeU)}`);
  }
  if (!isFiniteReal(priceDecimal) || priceDecimal < MIN_DECIMAL_PRICE || priceDecimal > MAX_DECIMAL_PRICE) {
    throw new Markets2WayValidationError(`priceDecimal inválido: ${String(priceDecimal)}`);
  }

  const netWin = priceDecimal - 1.0;
  let normLine: number | null = null;
  let bucket: AsianSettlementBucket;
  let outcome: SettlementOutcome;
  let gradeOut: SettlementOutcome;
  let unitRet: number;

  if (m === "dnb") {
    if (line !== null && line !== undefined && validateQuarterLine(line, "line") !== 0.0) {
      throw new Markets2WayValidationError(`dnb solo admite line=null o 0.0; recibido ${String(line)}`);
    }
    normLine = line !== null && line !== undefined ? validateQuarterLine(line, "line") : null;
    if (Math.abs(homeGoals - awayGoals) <= 1e-9) {
      bucket = "push";
      outcome = "push";
      gradeOut = "void";
      unitRet = 0.0;
    } else if ((homeGoals > awayGoals && sel === "home") || (awayGoals > homeGoals && sel === "away")) {
      bucket = "full_win";
      outcome = "win";
      gradeOut = "win";
      unitRet = netWin;
    } else {
      bucket = "full_loss";
      outcome = "loss";
      gradeOut = "loss";
      unitRet = -1.0;
    }
  } else if (m === "btts") {
    if (line !== null && line !== undefined) {
      throw new Markets2WayValidationError(`btts no admite línea numérica; recibido ${String(line)}`);
    }
    const both = homeGoals > 0.0 && awayGoals > 0.0;
    const won = sel === "yes" ? both : !both;
    if (won) {
      bucket = "full_win";
      outcome = "win";
      gradeOut = "win";
      unitRet = netWin;
    } else {
      bucket = "full_loss";
      outcome = "loss";
      gradeOut = "loss";
      unitRet = -1.0;
    }
  } else {
    if (line === null || line === undefined) {
      throw new Markets2WayValidationError(`El mercado ${m} requiere una línea numérica finita.`);
    }
    normLine = validateQuarterLine(line, "line");
    if (m === "totals" && normLine <= 0.0) {
      throw new Markets2WayValidationError(`La línea de totals/ou debe ser > 0; recibido ${normLine}`);
    }

    let diff: number;
    if (m === "ah") {
      const hSel =
        lineConvention === "home_canonical" && sel === "away"
          ? normLine === 0
            ? 0
            : -normLine
          : normLine;
      const margin = sel === "home" ? homeGoals - awayGoals : awayGoals - homeGoals;
      diff = margin + hSel;
    } else {
      const tot = homeGoals + awayGoals;
      diff = sel === "over" ? tot - normLine : normLine - tot;
    }

    if (diff > 0.25 + 1e-9) {
      bucket = "full_win";
      outcome = "win";
      gradeOut = "win";
      unitRet = netWin;
    } else if (Math.abs(diff - 0.25) <= 1e-9) {
      bucket = "half_win";
      outcome = "half_win";
      gradeOut = "half_win";
      unitRet = 0.5 * netWin;
    } else if (Math.abs(diff) <= 1e-9) {
      bucket = "push";
      outcome = "push";
      gradeOut = "void";
      unitRet = 0.0;
    } else if (Math.abs(diff + 0.25) <= 1e-9) {
      bucket = "half_loss";
      outcome = "half_loss";
      gradeOut = "half_loss";
      unitRet = -0.5;
    } else {
      bucket = "full_loss";
      outcome = "loss";
      gradeOut = "loss";
      unitRet = -1.0;
    }
  }

  const rawPnl = stakeU * unitRet;
  const pnlU = Object.is(rawPnl, -0) ? 0 : rawPnl;
  return Object.freeze({
    market: m,
    line: normLine,
    selection: sel,
    outcome,
    grade_outcome: gradeOut,
    bucket,
    is_push: bucket === "push",
    unit_return: unitRet,
    pnl_u: pnlU,
    gross_return_u: stakeU + pnlU,
  });
}

// ---------------------------------------------------------------------------
// 3. Resolución de configuración `markets_2way_config.json` y evaluación completa
// ---------------------------------------------------------------------------

export function resolve2WayMarketSegment(
  configArtifact: Markets2WayConfigArtifact,
  league: string,
  market: string,
): {
  readonly key: string;
  readonly found: boolean;
  readonly entry: Markets2WaySegmentConfig;
} {
  const m = canonicalize2WayMarket(market);
  const lg = String(league ?? "").trim();
  const segments = configArtifact.segments ?? {};
  const exactKey = `${lg}::${m}`;
  if (Object.prototype.hasOwnProperty.call(segments, exactKey)) {
    return { key: exactKey, found: true, entry: segments[exactKey]! };
  }
  const upperKey = `${lg.toUpperCase()}::${m}`;
  for (const [k, v] of Object.entries(segments)) {
    if (k.toUpperCase() === upperKey) {
      return { key: k, found: true, entry: v };
    }
  }
  return {
    key: exactKey,
    found: false,
    entry: {
      league: lg,
      market: m,
      sport: "football",
      enabled: false,
      disabled_reason: "unseen_segment_in_walk_forward_dev",
      w_effective: 0.0,
      best_devig_method: "power",
      dc_rho_recommended: DEFAULT_DC_RHO,
    },
  };
}

export interface Evaluate2WayMarketCandidateInput {
  readonly config: Markets2WayConfigArtifact;
  readonly league: string;
  readonly market: string;
  readonly line: number | null;
  readonly selection: string;
  readonly lamHome: number;
  readonly lamAway: number;
  readonly rho?: number;
  readonly maxGoals?: number;
  /** Cuotas decimales brutas de las 2 vías `[primaryOdds, oppositeOdds]` para eliminar el margen. */
  readonly marketPairRawOdds: readonly [number, number];
  /** Cuota decimal ejecutable tomada en la selección evaluada. */
  readonly executionPriceDecimal: number;
  readonly sigmaP?: number;
  readonly uncertaintyPenaltyK?: number;
  readonly lineConvention?: LineConvention;
}

export function evaluate2WayMarketCandidate(input: Evaluate2WayMarketCandidateInput) {
  const m = canonicalize2WayMarket(input.market);
  const sel = canonicalize2WaySelection(m, input.selection);
  const resolved = resolve2WayMarketSegment(input.config, input.league, m);
  const seg = resolved.entry;
  const rho = input.rho ?? seg.dc_rho_recommended ?? DEFAULT_DC_RHO;
  const maxGoals = input.maxGoals ?? input.config.dixon_coles_defaults?.default_max_goals ?? DEFAULT_MAX_GOALS;

  const matrix = buildDixonColesScoreMatrix(input.lamHome, input.lamAway, rho, maxGoals);
  const baseSp = deriveSelectionSettlementProbs(matrix, m, input.line, sel, {
    lineConvention: input.lineConvention ?? "selection",
  });

  const devigPair = devigMarketOdds(input.marketPairRawOdds, m === "totals" ? "ou" : m, seg.best_devig_method);
  const isPrimary = sel === "home" || sel === "over" || sel === "yes";
  const pMktSel = isPrimary ? devigPair[0]! : devigPair[1]!;

  const wEff = seg.enabled ? seg.w_effective : 0.0;
  const [pFinalSel] = blendLogit2Way(baseSp.p_effective_win, pMktSel, wEff);

  const valueBet = evaluateAsianValueBet(baseSp, input.executionPriceDecimal, {
    pBlendedEffective: pFinalSel,
    sigmaP: input.sigmaP ?? 0.0,
    uncertaintyPenaltyK: input.uncertaintyPenaltyK ?? 0.0,
  });

  return Object.freeze({
    segment_key: resolved.key,
    segment_found: resolved.found,
    enabled: seg.enabled,
    disabled_reason: seg.disabled_reason,
    w_effective: wEff,
    devig_method: seg.best_devig_method,
    rho_used: rho,
    p_model_effective: baseSp.p_effective_win,
    p_market_novig: pMktSel,
    p_final_effective: pFinalSel,
    base_settlement_probs: baseSp,
    value_bet: valueBet,
  });
}

// Alias snake_case para compatibilidad cruzada directa en validadores
export const settle_asian_line = settleAsianLine;
export const build_dixon_coles_score_matrix = buildDixonColesScoreMatrix;
export const derive_selection_settlement_probs = deriveSelectionSettlementProbs;
export const derive_all_2way_markets = deriveAll2WayMarkets;
export const compute_asian_ev = computeAsianEv;
export const solve_exact_asian_kelly = solveExactAsianKelly;
