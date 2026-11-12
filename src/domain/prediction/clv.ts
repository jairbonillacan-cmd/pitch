/**
 * A28 (Ola 1 · Agente A2) — Tracker de Closing Line Value (CLV), liquidación exacta de PnL
 * (incluyendo push/void y medias líneas asiáticas) y reporte agregado con Bootstrap determinista.
 *
 * Fórmulas contractuales exactas (paridad `|Δ| < 1e-12` con `services/models/clv_report.py`):
 *   - `clv_pct  = (price_tomado / price_cierre_sin_margen) - 1`
 *   - `clv_prob = p_cierre_sin_margen - (1 / price_tomado)`, donde `p_cierre_sin_margen = 1 / price_cierre_sin_margen`
 *   - Si `closing_missing === true` o la fuente de cierre no es sharp válida (`pinnacle` / `smarkets`,
 *     y exclusivamente `pinnacle` en `historical_fd`), `clv_pct = null` y `clv_prob = null`
 *     (jamás se rellena con casas recreativas; se contabiliza en `n_closing_missing`).
 *   - `roi_pct = sum(pnl_u) / sum(stake_u)` sobre picks liquidados.
 *   - Bootstrap no paramétrico (`>= 1000` remuestreos por defecto) con PRNG determinista `mulberry32`
 *     y cuantiles lineales Type-7 idénticos entre TypeScript y Python.
 */

import {
  LedgerValidationError,
  PickLedger,
  isValidSharpClosingBook,
  settlePickPnl,
  type PickClosingRecord,
  type PickLedgerEntry,
  type PickSettlementRecord,
  type PickTier,
  type ResolvedPickRecord,
  type SettlementOutcome,
} from "./ledger.js";
import { clamp, createMulberry32 } from "./math.js";

export { createMulberry32, settlePickPnl };

/** Número mínimo y por defecto de remuestreos bootstrap exigido por contrato A2 (`>= 1000`). */
export const MIN_BOOTSTRAP_RESAMPLES = 1000;
export const DEFAULT_BOOTSTRAP_RESAMPLES = 1000;
export const DEFAULT_BOOTSTRAP_SEED = 42;
export const DEFAULT_BOOTSTRAP_CI_LEVEL = 0.95;

/** Etiqueta explícita de significancia estadística cuando el IC 95% excluye o cruza 0. */
export type SignificanceLabel =
  | "significativa_positiva"
  | "significativa_negativa"
  | "no significativa";

/** Entrada mínima para evaluar el CLV individual de una apuesta. */
export interface SinglePickClvInput {
  readonly price_tomado: number;
  readonly price_cierre_sin_margen?: number | null;
  readonly p_cierre_sin_margen?: number | null;
  readonly closing_missing?: boolean;
  readonly closing_book?: string | null;
  readonly closing_source?: string | null;
}

/** Resultado del cálculo exacto de CLV para un pick individual. */
export interface SinglePickClvResult {
  readonly clv_pct: number | null;
  readonly clv_prob: number | null;
  readonly p_tomado_implicita: number;
  readonly price_cierre_sin_margen: number | null;
  readonly p_cierre_sin_margen: number | null;
  readonly closing_missing: boolean;
}

/** Entrada flexible de pick para evaluación masiva o reporte bootstrap. */
export interface EvaluablePickInput {
  readonly pick_id: string;
  readonly ts_emitido: string;
  readonly event_id: string;
  readonly sport: string;
  readonly league: string;
  readonly market: string;
  readonly line?: number | null;
  readonly selection: string;
  readonly book: string;
  readonly price_tomado: number;
  readonly p_modelo?: number;
  readonly p_mercado?: number;
  readonly p_final?: number;
  readonly ev?: number;
  readonly stake_u: number;
  readonly tier: PickTier | string;
  readonly version_modelo?: string;
  readonly features_hash?: string;
  readonly closing_missing?: boolean;
  readonly closing_book?: string | null;
  readonly closing_source?: string | null;
  readonly price_cierre_sin_margen?: number | null;
  readonly p_cierre_sin_margen?: number | null;
  readonly outcome?: SettlementOutcome | null;
  readonly pnl_u?: number | null;
}

/** Registro enriquecido de pick con métricas CLV y PnL resueltas. */
export interface EvaluatedPickMetrics {
  readonly pick_id: string;
  readonly ts_emitido: string;
  readonly event_id: string;
  readonly sport: string;
  readonly league: string;
  readonly market: string;
  readonly line: number | null;
  readonly selection: string;
  readonly book: string;
  readonly tier: string;
  readonly price_tomado: number;
  readonly stake_u: number;
  readonly p_tomado_implicita: number;
  readonly closing_missing: boolean;
  readonly closing_book: string | null;
  readonly price_cierre_sin_margen: number | null;
  readonly p_cierre_sin_margen: number | null;
  readonly clv_pct: number | null;
  readonly clv_prob: number | null;
  readonly outcome: SettlementOutcome | null;
  readonly pnl_u: number | null;
}

/** Resumen de intervalo de confianza bootstrap para una métrica agregada. */
export interface BootstrapIntervalSummary {
  readonly mean: number | null;
  readonly ci95_low: number | null;
  readonly ci95_high: number | null;
  readonly ci95: readonly [number, number] | null;
  readonly statistically_significant: boolean;
  readonly significance_label: SignificanceLabel;
  readonly prob_gt_zero: number | null;
}

/** Resumen agregado de conteos, CLV, ROI y drawdown para el global o un segmento. */
export interface PickGroupSummary {
  readonly n_picks: number;
  readonly n_with_closing: number;
  readonly n_closing_missing: number;
  readonly n_settled: number;
  readonly n_wins: number;
  readonly n_losses: number;
  readonly n_pushes: number;
  readonly n_half_wins: number;
  readonly n_half_losses: number;
  readonly total_stake_u: number;
  readonly settled_stake_u: number;
  readonly total_pnl_u: number;
  readonly clv_mean: number | null;
  readonly clv_pct_mean: number | null;
  readonly clv_pct_ci95: readonly [number, number] | null;
  readonly clv_prob_mean: number | null;
  readonly clv_prob_ci95: readonly [number, number] | null;
  readonly statistically_significant: boolean;
  readonly significance_label: SignificanceLabel;
  readonly pct_picks_clv_positive: number | null;
  readonly roi_pct: number | null;
  readonly roi_pct_ci95: readonly [number, number] | null;
  readonly roi_statistically_significant: boolean;
  readonly roi_significance_label: SignificanceLabel;
  readonly max_drawdown_u: number;
  readonly clv_pct_bootstrap: BootstrapIntervalSummary;
  readonly clv_prob_bootstrap: BootstrapIntervalSummary;
  readonly roi_bootstrap: BootstrapIntervalSummary;
}

/** Opciones de configuración para el reporte bootstrap de CLV y ROI. */
export interface BootstrapReportOptions {
  /** Número de remuestreos bootstrap (`>= 1000`, por defecto `1000`). */
  readonly nResamples?: number;
  /** Semilla entera determinista para `mulberry32` (por defecto `42`). */
  readonly seed?: number;
  /** Nivel de confianza en `(0, 1)` (por defecto `0.95`). */
  readonly ciLevel?: number;
}

/** Reporte completo desglosado globalmente y por `league`, `market`, `tier`, `book` y `league_market`. */
export interface ClvBootstrapReport {
  readonly meta: {
    readonly n_resamples: number;
    readonly seed: number;
    readonly ci_level: number;
    readonly prng: "mulberry32";
  };
  readonly global: PickGroupSummary;
  readonly by_league: Readonly<Record<string, PickGroupSummary>>;
  readonly by_market: Readonly<Record<string, PickGroupSummary>>;
  readonly by_tier: Readonly<Record<string, PickGroupSummary>>;
  readonly by_book: Readonly<Record<string, PickGroupSummary>>;
  readonly by_league_market: Readonly<Record<string, PickGroupSummary>>;
}

// ---------------------------------------------------------------------------
// Cuantiles lineales Type-7 (`createMulberry32` centralizado en `./math.js`)
// ---------------------------------------------------------------------------

/**
 * Cuantil lineal Type-7 sobre arreglo ordenado ascendentemente (`q ∈ [0, 1]`).
 * Idéntico a `numpy.quantile(arr, q, method="linear")`.
 */
export function quantileLinearSorted(sorted: Float64Array | readonly number[], q: number): number {
  const n = sorted.length;
  if (n === 0) {
    throw new LedgerValidationError("no se puede calcular cuantil de un arreglo vacío");
  }
  if (n === 1) return sorted[0]!;
  const clampedQ = clamp(q, 0, 1);
  const pos = clampedQ * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const frac = pos - lo;
  const vLo = sorted[lo]!;
  const vHi = sorted[hi]!;
  return vLo + frac * (vHi - vLo);
}

// ---------------------------------------------------------------------------
// Cálculo individual de CLV y calificación de mercados asiáticos / 2-vías
// ---------------------------------------------------------------------------

/**
 * Calcula `clv_pct` y `clv_prob` exactos para una apuesta individual.
 * Si `closing_missing === true`, o `closing_book` pertenece a una casa recreativa,
 * o no existe cuota sharp sin margen `> 1.0`, devuelve `clv_pct = null` y `clv_prob = null`.
 */
export function computePickClv(input: SinglePickClvInput): SinglePickClvResult {
  if (
    typeof input.price_tomado !== "number" ||
    !Number.isFinite(input.price_tomado) ||
    input.price_tomado < 1.01
  ) {
    throw new LedgerValidationError(
      `price_tomado inválido en computePickClv: ${String(input.price_tomado)}`,
    );
  }

  const p_tomado_implicita = 1 / input.price_tomado;

  if (input.closing_missing === true) {
    return {
      clv_pct: null,
      clv_prob: null,
      p_tomado_implicita,
      price_cierre_sin_margen: null,
      p_cierre_sin_margen: null,
      closing_missing: true,
    };
  }

  if (
    input.closing_book !== undefined &&
    input.closing_book !== null &&
    String(input.closing_book).trim().length > 0
  ) {
    if (!isValidSharpClosingBook(input.closing_book, input.closing_source)) {
      return {
        clv_pct: null,
        clv_prob: null,
        p_tomado_implicita,
        price_cierre_sin_margen: null,
        p_cierre_sin_margen: null,
        closing_missing: true,
      };
    }
  }

  let priceNoVig: number | null = null;
  let pNoVig: number | null = null;

  const rawPrice = input.price_cierre_sin_margen;
  const rawProb = input.p_cierre_sin_margen;

  if (typeof rawPrice === "number" && Number.isFinite(rawPrice) && rawPrice > 1) {
    priceNoVig = rawPrice;
    pNoVig = 1 / rawPrice;
    if (typeof rawProb === "number" && Number.isFinite(rawProb)) {
      if (Math.abs(rawProb - pNoVig) > 1e-6) {
        throw new LedgerValidationError(
          `p_cierre_sin_margen (${rawProb}) inconsistente con 1 / price_cierre_sin_margen (${pNoVig})`,
        );
      }
    }
  } else if (typeof rawProb === "number" && Number.isFinite(rawProb) && rawProb > 0 && rawProb < 1) {
    pNoVig = rawProb;
    priceNoVig = 1 / rawProb;
  } else {
    return {
      clv_pct: null,
      clv_prob: null,
      p_tomado_implicita,
      price_cierre_sin_margen: null,
      p_cierre_sin_margen: null,
      closing_missing: true,
    };
  }

  const clv_pct = input.price_tomado / priceNoVig - 1;
  const clv_prob = pNoVig - p_tomado_implicita;

  return {
    clv_pct,
    clv_prob,
    p_tomado_implicita,
    price_cierre_sin_margen: priceNoVig,
    p_cierre_sin_margen: pNoVig,
    closing_missing: false,
  };
}

function gradeAsianDiff(diff: number): SettlementOutcome {
  if (diff > 0.25 + 1e-9) return "win";
  if (Math.abs(diff - 0.25) <= 1e-9) return "half_win";
  if (Math.abs(diff) <= 1e-9) return "void";
  if (Math.abs(diff + 0.25) <= 1e-9) return "half_loss";
  return "loss";
}

/**
 * Califica el resultado exacto (`win`, `loss`, `void`, `half_win`, `half_loss`) de un mercado
 * deportivo (`1x2`, `moneyline`/`2way`, `dnb`, `ah`/`spread` con cuartos de línea, `ou`/`totals`
 * con cuartos de línea, `btts`) a partir del marcador final `(homeScore, awayScore)`.
 */
export function gradeMarketOutcome(
  market: string,
  selection: string,
  homeScore: number,
  awayScore: number,
  line: number | null = null,
): SettlementOutcome {
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) {
    throw new LedgerValidationError("marcadores homeScore y awayScore deben ser números finitos");
  }
  const mkt = String(market).trim().toLowerCase();
  const sel = String(selection).trim().toLowerCase();

  if (mkt === "1x2" || mkt === "h2h" || mkt === "match_odds") {
    if (sel === "home" || sel === "1" || sel === "h") {
      return homeScore > awayScore ? "win" : "loss";
    }
    if (sel === "draw" || sel === "x" || sel === "d" || sel === "tie") {
      return homeScore === awayScore ? "win" : "loss";
    }
    if (sel === "away" || sel === "2" || sel === "a") {
      return awayScore > homeScore ? "win" : "loss";
    }
    throw new LedgerValidationError(`selección 1X2 desconocida: "${selection}"`);
  }

  if (mkt === "dnb" || mkt === "draw_no_bet" || mkt === "moneyline" || mkt === "ml" || mkt === "2way") {
    if (homeScore === awayScore) return "void";
    if (sel === "home" || sel === "1" || sel === "h") {
      return homeScore > awayScore ? "win" : "loss";
    }
    if (sel === "away" || sel === "2" || sel === "a") {
      return awayScore > homeScore ? "win" : "loss";
    }
    throw new LedgerValidationError(`selección 2-way desconocida: "${selection}"`);
  }

  if (mkt === "ah" || mkt === "asian_handicap" || mkt === "spread" || mkt === "handicap") {
    if (line === null || line === undefined || !Number.isFinite(line)) {
      throw new LedgerValidationError(`el mercado "${market}" requiere una línea numérica finita`);
    }
    if (sel === "home" || sel === "1" || sel === "h") {
      return gradeAsianDiff(homeScore - awayScore + line);
    }
    if (sel === "away" || sel === "2" || sel === "a") {
      return gradeAsianDiff(awayScore - homeScore + line);
    }
    throw new LedgerValidationError(`selección de hándicap desconocida: "${selection}"`);
  }

  if (mkt === "ou" || mkt === "totals" || mkt === "total" || mkt === "over_under") {
    if (line === null || line === undefined || !Number.isFinite(line)) {
      throw new LedgerValidationError(`el mercado "${market}" requiere una línea numérica finita`);
    }
    const totalScore = homeScore + awayScore;
    if (sel === "over" || sel === "o") {
      return gradeAsianDiff(totalScore - line);
    }
    if (sel === "under" || sel === "u") {
      return gradeAsianDiff(line - totalScore);
    }
    throw new LedgerValidationError(`selección de totales desconocida: "${selection}"`);
  }

  if (mkt === "btts" || mkt === "both_teams_to_score") {
    const bothScored = homeScore > 0 && awayScore > 0;
    if (sel === "yes" || sel === "si" || sel === "y") {
      return bothScored ? "win" : "loss";
    }
    if (sel === "no" || sel === "n") {
      return !bothScored ? "win" : "loss";
    }
    throw new LedgerValidationError(`selección BTTS desconocida: "${selection}"`);
  }

  throw new LedgerValidationError(`mercado deportivo no soportado en gradeMarketOutcome: "${market}"`);
}

/**
 * Calcula el drawdown máximo en unidades (`max_drawdown_u >= 0`) sobre una serie ordenada de `pnl_u`,
 * anclando el pico inicial en `0.0` unidades.
 */
export function computeMaxDrawdownU(pnlSequence: readonly number[]): number {
  let cumulative = 0;
  let peak = 0;
  let maxDd = 0;
  for (let i = 0; i < pnlSequence.length; i += 1) {
    const pnl = pnlSequence[i]!;
    if (!Number.isFinite(pnl)) {
      throw new LedgerValidationError(`pnl_u no finito en posición ${i}: ${String(pnl)}`);
    }
    cumulative += pnl;
    if (cumulative > peak) {
      peak = cumulative;
    }
    const dd = peak - cumulative;
    if (dd > maxDd) {
      maxDd = dd;
    }
  }
  return maxDd;
}

// ---------------------------------------------------------------------------
// Evaluación unificada de picks y agregación Bootstrap
// ---------------------------------------------------------------------------

function normalizeToEvaluatedMetrics(
  source: PickLedger | readonly ResolvedPickRecord[] | readonly EvaluablePickInput[],
  closingsByPickId?: Readonly<Record<string, Partial<PickClosingRecord>>>,
  settlementsByPickId?: Readonly<Record<string, Partial<PickSettlementRecord>>>,
): EvaluatedPickMetrics[] {
  if (source instanceof PickLedger) {
    return normalizeToEvaluatedMetrics(source.getResolvedPicks());
  }

  const out: EvaluatedPickMetrics[] = [];
  for (let i = 0; i < source.length; i += 1) {
    const item = source[i]!;
    let pick: PickLedgerEntry | EvaluablePickInput;
    let closing: Partial<PickClosingRecord> | null = null;
    let settlement: Partial<PickSettlementRecord> | null = null;

    if ("pick" in item && item.pick && typeof item.pick === "object") {
      const resolved = item as ResolvedPickRecord;
      pick = resolved.pick;
      closing = resolved.closing;
      settlement = resolved.settlement;
    } else {
      const evInput = item as EvaluablePickInput;
      pick = evInput;
      closing = closingsByPickId?.[evInput.pick_id] ?? null;
      settlement = settlementsByPickId?.[evInput.pick_id] ?? null;
    }

    const closingMissing =
      closing?.closing_missing ??
      ("closing_missing" in pick ? pick.closing_missing : undefined) ??
      false;
    const closingBook =
      closing?.closing_book ??
      ("closing_book" in pick ? pick.closing_book : undefined) ??
      null;
    const closingSource =
      closing?.closing_source ??
      ("closing_source" in pick ? pick.closing_source : undefined) ??
      null;
    const priceCierreNoVig =
      closing?.price_cierre_sin_margen ??
      ("price_cierre_sin_margen" in pick ? pick.price_cierre_sin_margen : undefined) ??
      null;
    const pCierreNoVig =
      closing?.p_cierre_sin_margen ??
      ("p_cierre_sin_margen" in pick ? pick.p_cierre_sin_margen : undefined) ??
      null;

    const clvRes = computePickClv({
      price_tomado: pick.price_tomado,
      price_cierre_sin_margen: priceCierreNoVig,
      p_cierre_sin_margen: pCierreNoVig,
      closing_missing: closingMissing,
      closing_book: closingBook,
      closing_source: closingSource,
    });

    const outcome =
      (settlement?.outcome as SettlementOutcome | undefined) ??
      ("outcome" in pick ? (pick.outcome ?? null) : null);

    let pnl_u: number | null = null;
    if (outcome !== null && outcome !== undefined) {
      pnl_u = settlePickPnl(pick.stake_u, pick.price_tomado, outcome);
      if (
        settlement?.pnl_u !== undefined &&
        settlement.pnl_u !== null &&
        Math.abs(settlement.pnl_u - pnl_u) > 1e-9
      ) {
        throw new LedgerValidationError(
          `pnl_u inconsistente para pick_id="${pick.pick_id}": provisto=${settlement.pnl_u}, esperado=${pnl_u}`,
        );
      }
    } else if ("pnl_u" in pick && typeof pick.pnl_u === "number" && Number.isFinite(pick.pnl_u)) {
      pnl_u = pick.pnl_u;
    }

    out.push({
      pick_id: pick.pick_id,
      ts_emitido: pick.ts_emitido,
      event_id: pick.event_id,
      sport: pick.sport,
      league: pick.league,
      market: pick.market,
      line: pick.line ?? null,
      selection: pick.selection,
      book: pick.book,
      tier: String(pick.tier),
      price_tomado: pick.price_tomado,
      stake_u: pick.stake_u,
      p_tomado_implicita: clvRes.p_tomado_implicita,
      closing_missing: clvRes.closing_missing,
      closing_book: clvRes.closing_missing ? null : (closingBook ? String(closingBook).toLowerCase() : null),
      price_cierre_sin_margen: clvRes.price_cierre_sin_margen,
      p_cierre_sin_margen: clvRes.p_cierre_sin_margen,
      clv_pct: clvRes.clv_pct,
      clv_prob: clvRes.clv_prob,
      outcome: outcome ?? null,
      pnl_u,
    });
  }

  return out;
}

/**
 * Evalúa métricas individuales de CLV y PnL sobre un `PickLedger`, vistas resueltas o lista de picks.
 */
export function computeClvMetrics(
  source: PickLedger | readonly ResolvedPickRecord[] | readonly EvaluablePickInput[],
  closingsByPickId?: Readonly<Record<string, Partial<PickClosingRecord>>>,
  settlementsByPickId?: Readonly<Record<string, Partial<PickSettlementRecord>>>,
): EvaluatedPickMetrics[] {
  return normalizeToEvaluatedMetrics(source, closingsByPickId, settlementsByPickId);
}

function emptyBootstrapSummary(): BootstrapIntervalSummary {
  return {
    mean: null,
    ci95_low: null,
    ci95_high: null,
    ci95: null,
    statistically_significant: false,
    significance_label: "no significativa",
    prob_gt_zero: null,
  };
}

function buildSignificance(
  sampleSize: number,
  ciLow: number,
  ciHigh: number,
): { statistically_significant: boolean; significance_label: SignificanceLabel } {
  if (sampleSize >= 2 && ciLow > 0) {
    return {
      statistically_significant: true,
      significance_label: "significativa_positiva",
    };
  }
  if (sampleSize >= 2 && ciHigh < 0) {
    return {
      statistically_significant: true,
      significance_label: "significativa_negativa",
    };
  }
  return {
    statistically_significant: false,
    significance_label: "no significativa",
  };
}

function summarizeSingleGroup(
  picks: readonly EvaluatedPickMetrics[],
  nResamples: number,
  seed: number,
  ciLevel: number,
): PickGroupSummary {
  const n_picks = picks.length;
  const alpha = (1 - ciLevel) / 2;
  const qLow = alpha;
  const qHigh = 1 - alpha;

  const validClv = picks.filter(
    (p) => !p.closing_missing && p.clv_pct !== null && p.clv_prob !== null,
  );
  const n_with_closing = validClv.length;
  const n_closing_missing = n_picks - n_with_closing;

  let total_stake_u = 0;
  for (let i = 0; i < n_picks; i += 1) {
    total_stake_u += picks[i]!.stake_u;
  }

  const settled = picks.filter((p) => p.pnl_u !== null);
  const n_settled = settled.length;

  let n_wins = 0;
  let n_losses = 0;
  let n_pushes = 0;
  let n_half_wins = 0;
  let n_half_losses = 0;
  let settled_stake_u = 0;
  let total_pnl_u = 0;

  for (let i = 0; i < n_settled; i += 1) {
    const p = settled[i]!;
    settled_stake_u += p.stake_u;
    total_pnl_u += p.pnl_u!;
    if (p.outcome === "win") n_wins += 1;
    else if (p.outcome === "loss") n_losses += 1;
    else if (p.outcome === "push" || p.outcome === "void") n_pushes += 1;
    else if (p.outcome === "half_win") n_half_wins += 1;
    else if (p.outcome === "half_loss") n_half_losses += 1;
  }

  // 1. Bootstrap pareado de `clv_pct` y `clv_prob`
  let clv_pct_bootstrap = emptyBootstrapSummary();
  let clv_prob_bootstrap = emptyBootstrapSummary();
  let pct_picks_clv_positive: number | null = null;

  if (n_with_closing > 0) {
    const clvPctArr = new Float64Array(n_with_closing);
    const clvProbArr = new Float64Array(n_with_closing);
    let sumPct = 0;
    let sumProb = 0;
    let countPos = 0;

    for (let i = 0; i < n_with_closing; i += 1) {
      const pctVal = validClv[i]!.clv_pct!;
      const probVal = validClv[i]!.clv_prob!;
      clvPctArr[i] = pctVal;
      clvProbArr[i] = probVal;
      sumPct += pctVal;
      sumProb += probVal;
      if (pctVal > 0) countPos += 1;
    }

    const meanPct = sumPct / n_with_closing;
    const meanProb = sumProb / n_with_closing;
    pct_picks_clv_positive = countPos / n_with_closing;

    const rngClv = createMulberry32(seed);
    const bootPct = new Float64Array(nResamples);
    const bootProb = new Float64Array(nResamples);
    let gtZeroPct = 0;
    let gtZeroProb = 0;

    for (let b = 0; b < nResamples; b += 1) {
      let bSumPct = 0;
      let bSumProb = 0;
      for (let j = 0; j < n_with_closing; j += 1) {
        const idx = Math.min(n_with_closing - 1, Math.floor(rngClv() * n_with_closing));
        bSumPct += clvPctArr[idx]!;
        bSumProb += clvProbArr[idx]!;
      }
      const bMeanPct = bSumPct / n_with_closing;
      const bMeanProb = bSumProb / n_with_closing;
      bootPct[b] = bMeanPct;
      bootProb[b] = bMeanProb;
      if (bMeanPct > 0) gtZeroPct += 1;
      if (bMeanProb > 0) gtZeroProb += 1;
    }

    bootPct.sort();
    bootProb.sort();

    const pctLow = quantileLinearSorted(bootPct, qLow);
    const pctHigh = quantileLinearSorted(bootPct, qHigh);
    const pctSig = buildSignificance(n_with_closing, pctLow, pctHigh);

    const probLow = quantileLinearSorted(bootProb, qLow);
    const probHigh = quantileLinearSorted(bootProb, qHigh);
    const probSig = buildSignificance(n_with_closing, probLow, probHigh);

    clv_pct_bootstrap = {
      mean: meanPct,
      ci95_low: pctLow,
      ci95_high: pctHigh,
      ci95: [pctLow, pctHigh],
      statistically_significant: pctSig.statistically_significant,
      significance_label: pctSig.significance_label,
      prob_gt_zero: gtZeroPct / nResamples,
    };

    clv_prob_bootstrap = {
      mean: meanProb,
      ci95_low: probLow,
      ci95_high: probHigh,
      ci95: [probLow, probHigh],
      statistically_significant: probSig.statistically_significant,
      significance_label: probSig.significance_label,
      prob_gt_zero: gtZeroProb / nResamples,
    };
  }

  // 2. Bootstrap exacto de razón `roi_pct = sum(pnl_u) / sum(stake_u)`
  let roi_bootstrap = emptyBootstrapSummary();
  if (n_settled > 0 && settled_stake_u > 0) {
    const pnlArr = new Float64Array(n_settled);
    const stakeArr = new Float64Array(n_settled);
    for (let i = 0; i < n_settled; i += 1) {
      pnlArr[i] = settled[i]!.pnl_u!;
      stakeArr[i] = settled[i]!.stake_u;
    }

    const roiPoint = total_pnl_u / settled_stake_u;
    const rngRoi = createMulberry32((seed ^ 0x9e3779b9) | 0);
    const bootRoi = new Float64Array(nResamples);
    let gtZeroRoi = 0;

    for (let b = 0; b < nResamples; b += 1) {
      let bPnl = 0;
      let bStake = 0;
      for (let j = 0; j < n_settled; j += 1) {
        const idx = Math.min(n_settled - 1, Math.floor(rngRoi() * n_settled));
        bPnl += pnlArr[idx]!;
        bStake += stakeArr[idx]!;
      }
      const rVal = bPnl / bStake;
      bootRoi[b] = rVal;
      if (rVal > 0) gtZeroRoi += 1;
    }

    bootRoi.sort();
    const roiLow = quantileLinearSorted(bootRoi, qLow);
    const roiHigh = quantileLinearSorted(bootRoi, qHigh);
    const roiSig = buildSignificance(n_settled, roiLow, roiHigh);

    roi_bootstrap = {
      mean: roiPoint,
      ci95_low: roiLow,
      ci95_high: roiHigh,
      ci95: [roiLow, roiHigh],
      statistically_significant: roiSig.statistically_significant,
      significance_label: roiSig.significance_label,
      prob_gt_zero: gtZeroRoi / nResamples,
    };
  }

  // 3. Drawdown máximo cronológico en unidades
  const chronologicalSettled = [...settled].sort((a, b) => {
    const ta = Date.parse(a.ts_emitido);
    const tb = Date.parse(b.ts_emitido);
    if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) {
      return ta - tb;
    }
    if (a.ts_emitido !== b.ts_emitido) {
      return a.ts_emitido < b.ts_emitido ? -1 : 1;
    }
    return a.pick_id < b.pick_id ? -1 : a.pick_id > b.pick_id ? 1 : 0;
  });
  const max_drawdown_u = computeMaxDrawdownU(chronologicalSettled.map((p) => p.pnl_u!));

  return {
    n_picks,
    n_with_closing,
    n_closing_missing,
    n_settled,
    n_wins,
    n_losses,
    n_pushes,
    n_half_wins,
    n_half_losses,
    total_stake_u,
    settled_stake_u,
    total_pnl_u,
    clv_mean: clv_pct_bootstrap.mean,
    clv_pct_mean: clv_pct_bootstrap.mean,
    clv_pct_ci95: clv_pct_bootstrap.ci95,
    clv_prob_mean: clv_prob_bootstrap.mean,
    clv_prob_ci95: clv_prob_bootstrap.ci95,
    statistically_significant: clv_pct_bootstrap.statistically_significant,
    significance_label: clv_pct_bootstrap.significance_label,
    pct_picks_clv_positive,
    roi_pct: roi_bootstrap.mean,
    roi_pct_ci95: roi_bootstrap.ci95,
    roi_statistically_significant: roi_bootstrap.statistically_significant,
    roi_significance_label: roi_bootstrap.significance_label,
    max_drawdown_u,
    clv_pct_bootstrap,
    clv_prob_bootstrap,
    roi_bootstrap,
  };
}

function groupByDimension(
  picks: readonly EvaluatedPickMetrics[],
  selector: (p: EvaluatedPickMetrics) => string,
  nResamples: number,
  seed: number,
  ciLevel: number,
): Record<string, PickGroupSummary> {
  const buckets = new Map<string, EvaluatedPickMetrics[]>();
  for (let i = 0; i < picks.length; i += 1) {
    const p = picks[i]!;
    const key = selector(p);
    let arr = buckets.get(key);
    if (!arr) {
      arr = [];
      buckets.set(key, arr);
    }
    arr.push(p);
  }

  const sortedKeys = Array.from(buckets.keys()).sort();
  const result: Record<string, PickGroupSummary> = {};
  for (const key of sortedKeys) {
    result[key] = summarizeSingleGroup(buckets.get(key)!, nResamples, seed, ciLevel);
  }
  return result;
}

/**
 * Genera el reporte agregado con Bootstrap (`>= 1000` remuestreos por defecto) globalmente
 * y desglosado por `league`, `market`, `tier`, `book` y `league::market`.
 */
export function summarizePicksBootstrap(
  source: PickLedger | readonly ResolvedPickRecord[] | readonly EvaluablePickInput[],
  options?: BootstrapReportOptions,
  closingsByPickId?: Readonly<Record<string, Partial<PickClosingRecord>>>,
  settlementsByPickId?: Readonly<Record<string, Partial<PickSettlementRecord>>>,
): ClvBootstrapReport {
  const nResamples = options?.nResamples ?? DEFAULT_BOOTSTRAP_RESAMPLES;
  const seed = options?.seed ?? DEFAULT_BOOTSTRAP_SEED;
  const ciLevel = options?.ciLevel ?? DEFAULT_BOOTSTRAP_CI_LEVEL;

  if (!Number.isInteger(nResamples) || nResamples < MIN_BOOTSTRAP_RESAMPLES) {
    throw new LedgerValidationError(
      `nResamples debe ser entero >= ${MIN_BOOTSTRAP_RESAMPLES}; recibido ${String(nResamples)}`,
    );
  }
  if (!Number.isFinite(ciLevel) || ciLevel <= 0 || ciLevel >= 1) {
    throw new LedgerValidationError(`ciLevel debe estar en (0, 1); recibido ${String(ciLevel)}`);
  }

  const evaluated = normalizeToEvaluatedMetrics(source, closingsByPickId, settlementsByPickId);

  return {
    meta: {
      n_resamples: nResamples,
      seed: seed | 0,
      ci_level: ciLevel,
      prng: "mulberry32",
    },
    global: summarizeSingleGroup(evaluated, nResamples, seed, ciLevel),
    by_league: groupByDimension(evaluated, (p) => p.league, nResamples, seed, ciLevel),
    by_market: groupByDimension(evaluated, (p) => p.market, nResamples, seed, ciLevel),
    by_tier: groupByDimension(evaluated, (p) => p.tier, nResamples, seed, ciLevel),
    by_book: groupByDimension(evaluated, (p) => p.book, nResamples, seed, ciLevel),
    by_league_market: groupByDimension(
      evaluated,
      (p) => `${p.league}::${p.market}`,
      nResamples,
      seed,
      ciLevel,
    ),
  };
}
