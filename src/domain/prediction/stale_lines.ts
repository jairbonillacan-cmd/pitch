/**
 * A28 (Ola 3 · Agente A8) — Detector de líneas rezagadas (`Stale Lines`) con señal de
 * Doble Confirmación (casa sharp contemporánea + confirmación direccional del modelo),
 * medición empírica de cadencia/desfase entre capturas y derivación matemática cerrada
 * de la frecuencia óptima de scraping.
 *
 * Paridad numérica estricta (`|Δ| < 1e-12`) con `services/models/stale_lines.py`:
 *   1. Causalidad dura (`StaleLineCausalityError`): rechaza cualquier cotización con
 *      `ts_sharp_captured > ts_decision`, `ts_recreational_captured > ts_decision` o
 *      `ts_decision > ts_event_start` (evaluado a microsegundos UTC exactos).
 *   2. Condición 1 — Línea recreativa rezagada / mal puesta frente a sharp contemporánea
 *      (`pinnacle` -> fallback `smarkets` únicamente):
 *        - `stale_prob_margin_obs = p_sharp_novig - (1 / price_recreational) >= stale_prob_margin`
 *        - `stale_ev_sharp = p_sharp_novig * price_recreational - 1 >= stale_ev_threshold`
 *   3. Condición 2 — Confirmación direccional del modelo (`signal_mode = "double_confirmation"`):
 *        - `p_modelo > (1 / price_recreational) + min_model_prob_edge` (punto de equilibrio estricto)
 *        - `p_modelo >= p_sharp_novig - model_agreement_tolerance`
 *      Permite evaluar también `signal_mode = "simple_sharp"` sobre los mismos candidatos para
 *      auditar empíricamente Señal Simple (solo-sharp) vs Doble Confirmación (sharp + modelo).
 *   4. Dimensionamiento Quarter-Kelly (`<= 0.25`) contraído por incertidumbre epistémica (`sigma_p`),
 *      penalización por correlación intra-evento y 4 topes duros de portafolio (`2u / 2u / 3u / 5u`),
 *      usando exclusivamente los niveles válidos `PickTier = "solido" | "valor"`.
 *   5. Frecuencia recomendada de scraping derivada matemáticamente de los huecos observados en
 *      `odds_snapshots` (`78.78 min` mediana en Pinnacle vivo), la tasa de llegada de movimientos
 *      sharp, la pendiente de convergencia recreativa `beta_conv` y el retardo operativo `d_exec`.
 */

import { quantileLinearSorted } from "./clv.js";
import { clamp, logit, sigmoid } from "./math.js";
import {
  EXTREME_SOFT_OVERROUND_ANCHOR,
  InvalidOddsError,
  MAX_ADAPTIVE_SHIN_WEIGHT,
  MAX_OVERROUND,
  MIN_ADAPTIVE_SHIN_WEIGHT,
  MIN_OVERROUND,
  RECREATIONAL_OVERROUND_ANCHOR,
  RECREATIONAL_SHIN_WEIGHT,
  SHARP_OVERROUND_ANCHOR,
  type DevigMethod,
} from "./devig.js";
import type { PickLedgerInput } from "./ledger.js";
import {
  classifyOddsBucket,
  computeAdverseSharpTicks1h,
  computeShrunkQuarterKelly,
  computeSubmodelDispersion,
  DEFAULT_BANKROLL_UNIT_PCT,
  DEFAULT_KELLY_FRACTION,
  DEFAULT_MIN_STAKE_U,
  DEFAULT_SHARP_IMPLIED_PROB_TICK,
  DEFAULT_SHARP_STEAM_WINDOW_MINUTES,
  HARD_MAX_STAKE_PER_EVENT_U,
  HARD_MAX_STAKE_PER_GLOBAL_DATE_U,
  HARD_MAX_STAKE_PER_LEAGUE_DATE_U,
  HARD_MAX_STAKE_PER_PICK_U,
  MAX_PICK_PRICE_DECIMAL,
  MIN_PICK_PRICE_DECIMAL,
  parseIsoUtcMicros,
  resolveCandidateUtcDate,
  type OddsBucket,
  type PickTier,
  type PortfolioCapsConfig,
  type PortfolioState,
  type SharpQuoteTick,
  type SubmodelProbabilitiesMap,
} from "./picks.js";

export const STALE_LINES_SCHEMA_VERSION = "stale_lines_v1.0.0";

/** Modos auditables del detector: Doble Confirmación (por defecto) vs Señal Simple solo-sharp. */
export const STALE_SIGNAL_MODES = ["double_confirmation", "simple_sharp"] as const;
export type StaleSignalMode = (typeof STALE_SIGNAL_MODES)[number];

/** Únicas casas sharp autorizadas como referencia contemporánea sin margen (`pinnacle` -> `smarkets`). */
export const SHARP_REFERENCE_BOOKS = ["pinnacle", "smarkets"] as const;
export type SharpReferenceBook = (typeof SHARP_REFERENCE_BOOKS)[number];

/** Casas recreativas auditables sobre las que se buscan líneas rezagadas ejecutables. */
export const RECREATIONAL_EXECUTION_BOOKS = [
  "caliente",
  "codere",
  "b365",
  "bw",
  "wh",
  "draftkings",
  "fanduel",
  "betmgm",
  "betrivers",
  "fanatics",
  "hardrock",
  "thescore_bet",
  "bf",
] as const;
export type RecreationalExecutionBook = (typeof RECREATIONAL_EXECUTION_BOOKS)[number];

/** Códigos deterministas de rechazo para auditoría Red Team y paridad TS ↔ Python. */
export const STALE_LINE_REJECTION_REASONS = [
  "invalid_candidate_input",
  "non_recreational_book",
  "missing_sharp_reference",
  "sharp_reference_too_old",
  "adverse_sharp_steam",
  "not_stale_below_sharp_novig",
  "below_stale_thresholds",
  "missing_model_probability",
  "model_below_recreational_breakeven",
  "model_contradicts_sharp",
  "high_submodel_dispersion",
  "uncertainty_erased_edge",
  "correlated_same_event_market",
  "cap_event_exhausted",
  "cap_league_date_exhausted",
  "cap_global_date_exhausted",
  "stake_below_min_unit",
] as const;
export type StaleLineRejectionReason = (typeof STALE_LINE_REJECTION_REASONS)[number];

const EPS_PARITY = 1e-12;
const PROB_CLIP_EPS = 1e-6;

/** Error de validación estructural sobre `StaleLinesConfig` o entradas de cadencia. */
export class StaleLineConfigValidationError extends Error {
  readonly code = "stale_line_config_validation_error" as const;

  constructor(message: string) {
    super(message);
    this.name = "StaleLineConfigValidationError";
  }
}

/** Error lanzado ante cualquier violación causal (`ts_captured > ts_decision` o post-kickoff). */
export class StaleLineCausalityError extends Error {
  readonly code = "stale_line_causality_error" as const;

  constructor(message: string) {
    super(message);
    this.name = "StaleLineCausalityError";
  }
}

/** Sobrescritura opcional por segmento `league::market` en `stale_lines_config.json`. */
export interface StaleSegmentConfig {
  readonly league: string;
  readonly market: string;
  readonly enabled?: boolean;
  readonly best_devig_method?: DevigMethod;
  readonly w_model?: number;
  readonly stale_prob_margin?: number;
  readonly stale_ev_threshold?: number;
  readonly stale_ev_threshold_valor?: number;
  readonly model_agreement_tolerance?: number;
  readonly segment_clv_mean?: number | null;
  readonly segment_clv_ci95_low?: number | null;
  readonly segment_clv_ci95_high?: number | null;
  readonly n_picks_dev?: number;
}

/** Régimen de horizonte pre-partido evaluado en la fórmula matemática de cadencia. */
export interface ScrapingHorizonRegimeInput {
  readonly regime_id: string;
  readonly description: string;
  readonly horizon_minutes: number;
}

/** Parámetros medidos en `odds_snapshots` para derivar matemáticamente la cadencia de scraping. */
export interface ScrapingCadenceFormulaInput {
  readonly sharp_live_gap_median_minutes: number;
  readonly sharp_live_move_fraction: number;
  readonly sharp_reference_horizon_minutes: number;
  readonly horizon_acceleration_exponent: number;
  readonly recreational_convergence_beta: number;
  readonly execution_delay_minutes: number;
  readonly max_polling_decay_fraction: number;
  readonly regimes: readonly ScrapingHorizonRegimeInput[];
}

/** Resultado matemático por régimen de horizonte pre-partido. */
export interface ScrapingCadenceRegimeResult {
  readonly regime_id: string;
  readonly description: string;
  readonly horizon_minutes: number;
  readonly horizon_hours: number;
  readonly sharp_move_hazard_per_min: number;
  readonly mean_sharp_inter_move_minutes: number;
  readonly recreational_convergence_rate_per_min: number;
  readonly effective_decay_rate_per_min: number;
  readonly mean_stale_window_minutes: number;
  readonly stale_edge_half_life_minutes: number;
  readonly decay_bound_minutes: number;
  readonly nyquist_bound_minutes: number;
  readonly horizon_observability_bound_minutes: number;
  readonly recommended_interval_minutes: number;
  readonly recommended_interval_seconds: number;
  readonly binding_constraint: "edge_decay_budget" | "nyquist_half_window" | "horizon_observability";
  readonly polling_survival_factor_at_recommended: number;
  readonly expected_edge_survival_at_recommended: number;
  readonly expected_edge_survival_at_current_sharp_gap: number;
  readonly absolute_survival_gain_vs_current_gap: number;
}

/** Salida completa de la derivación matemática de frecuencia de scraping. */
export interface RecommendedScrapingCadenceResult {
  readonly formula_name: "exponential_stale_window_nyquist_v1";
  readonly equation_summary: string;
  readonly inputs: {
    readonly sharp_live_gap_median_minutes: number;
    readonly sharp_live_move_fraction: number;
    readonly sharp_reference_horizon_minutes: number;
    readonly horizon_acceleration_exponent: number;
    readonly recreational_convergence_beta: number;
    readonly execution_delay_minutes: number;
    readonly max_polling_decay_fraction: number;
  };
  readonly base_sharp_move_hazard_per_min: number;
  readonly base_sharp_mean_inter_move_minutes: number;
  readonly solved_dimensionless_decay_product_x: number;
  readonly regimes: readonly ScrapingCadenceRegimeResult[];
}

/** Configuración declarativa congelada del detector (`src/data/prediction/stale_lines_config.json`). */
export interface StaleLinesConfig {
  readonly schema_version: string;
  readonly config_version: string;
  readonly generated_at_utc?: string;
  readonly reproduction_command?: string;
  readonly holdout_sealed_untouched: boolean;
  readonly signal_mode: StaleSignalMode;
  readonly stale_prob_margin: number;
  readonly stale_ev_threshold: number;
  readonly stale_ev_threshold_valor: number;
  readonly min_model_prob_edge: number;
  readonly model_agreement_tolerance: number;
  readonly default_model_blend_weight: number;
  readonly default_devig_method?: DevigMethod;
  readonly max_sharp_quote_age_minutes: number | null;
  readonly max_sigma_p: number;
  readonly max_adverse_ticks_1h: number;
  readonly sharp_steam_window_minutes?: number;
  readonly sharp_implied_prob_tick?: number;
  readonly uncertainty_penalty_k: number;
  readonly kelly_fraction: number;
  readonly bankroll_unit_pct?: number;
  readonly min_stake_u?: number;
  readonly rho_same_event: number;
  readonly fallback_sigma_p?: number;
  readonly allow_unlisted_segments?: boolean;
  readonly caps?: PortfolioCapsConfig;
  readonly segments?: Readonly<Record<string, StaleSegmentConfig>>;
  readonly recommended_scraping_cadence?: RecommendedScrapingCadenceResult;
}

/** Candidato de línea recreativa evaluado en el instante causal `ts_decision`. */
export interface StaleLineCandidate {
  readonly candidate_id?: string;
  readonly event_id: string;
  readonly sport: string;
  readonly league: string;
  readonly market: string;
  readonly line?: number | null;
  readonly selection: string;
  readonly recreational_book: string;
  readonly price_recreational: number;
  readonly ts_decision: string;
  readonly ts_event_start: string;
  readonly ts_recreational_captured?: string | null;
  readonly utc_date?: string | null;
  readonly source?: string;
  /** Casa sharp contemporánea (`pinnacle` o `smarkets`). */
  readonly sharp_book?: string | null;
  readonly ts_sharp_captured?: string | null;
  /** Probabilidad sin margen sharp de la selección objetivo (o calculada desde `sharp_market_odds`). */
  readonly p_sharp_novig?: number | null;
  /** Cuotas brutas completas del mercado sharp cuando `p_sharp_novig` no viene precalculada. */
  readonly sharp_market_odds?: readonly number[] | Readonly<Record<string, number>> | null;
  readonly sharp_market_novig_probs?: readonly number[] | null;
  readonly selection_index?: number | null;
  readonly devig_method?: DevigMethod | null;
  /** Probabilidad direccional del modelo para la selección objetivo. */
  readonly p_modelo?: number | null;
  readonly model_market_probs?: readonly number[] | null;
  readonly w_model?: number | null;
  /** Incertidumbre epistémica entre submodelos (`sigma_p`) y ticks sharp en 1h. */
  readonly submodel_probs?: readonly number[] | SubmodelProbabilitiesMap | null;
  readonly p_logit?: number | null;
  readonly p_gbm?: number | null;
  readonly p_dixon_coles?: number | null;
  readonly sigma_p?: number | null;
  readonly sharp_quotes_1h?: readonly SharpQuoteTick[] | null;
  readonly adverse_ticks_1h?: number | null;
}

/** Resultado completo e inmutable de evaluación de un `StaleLineCandidate`. */
export interface StaleLineDecisionResult {
  readonly candidate_id: string;
  readonly input_index: number;
  readonly approved: boolean;
  readonly rejection_reason: StaleLineRejectionReason | null;
  readonly signal_mode: StaleSignalMode;
  readonly tier: PickTier | null;
  readonly cond1_stale_line: boolean;
  readonly cond2_model_confirms: boolean | null;
  readonly event_id: string;
  readonly sport: string;
  readonly league: string;
  readonly market: string;
  readonly line: number | null;
  readonly selection: string;
  readonly recreational_book: string;
  readonly sharp_book: SharpReferenceBook | null;
  readonly utc_date: string;
  readonly segment_key: string;
  readonly odds_bucket: OddsBucket;
  readonly price_recreational: number;
  readonly p_recreational_implied: number;
  readonly p_sharp_novig: number;
  readonly price_sharp_novig: number;
  readonly stale_prob_margin_obs: number;
  readonly stale_ev_sharp: number;
  readonly price_ratio_vs_sharp_novig: number;
  readonly p_modelo: number | null;
  readonly model_edge_over_implied: number | null;
  readonly model_ev_recreational: number | null;
  readonly model_vs_sharp_diff: number | null;
  readonly sharp_quote_age_minutes: number | null;
  readonly recreational_quote_age_minutes: number | null;
  readonly recreational_vs_sharp_lag_minutes: number | null;
  readonly p_effective: number;
  readonly sigma_p: number;
  readonly p_shrunk: number;
  readonly adverse_ticks_1h: number;
  readonly f_quarter: number;
  readonly stake_raw_u: number;
  readonly correlation_multiplier: number;
  readonly stake_u: number;
  readonly expected_log_growth_g: number;
  readonly allocation_rank: number | null;
  readonly cap_applied: boolean;
}

/** Resumen de cuantiles empíricos (Type-7 lineal, paridad exacta con `numpy.quantile`). */
export interface QuantileDistributionSummary {
  readonly n: number;
  readonly min: number | null;
  readonly p25: number | null;
  readonly median: number | null;
  readonly p75: number | null;
  readonly max: number | null;
  readonly mean: number | null;
}

/** Snapshot individual para medición empírica pura de huecos entre capturas y desfases. */
export interface SnapshotTimestampRecord {
  readonly event_id: string;
  readonly market: string;
  readonly line?: number | null;
  readonly selection: string;
  readonly book: string;
  readonly price_decimal: number;
  readonly ts_captured: string;
  readonly ts_event_start?: string | null;
}

/** Resumen empírico de intervalos de captura por casa y desfase frente a sharp. */
export interface SnapshotCadenceMeasurement {
  readonly n_rows: number;
  readonly by_book: Readonly<
    Record<
      string,
      {
        readonly n_rows: number;
        readonly n_events: number;
        readonly n_unique_timestamps: number;
        readonly intra_series_intervals_minutes: QuantileDistributionSummary;
        readonly global_wave_intervals_minutes: QuantileDistributionSummary;
        readonly single_capture_only: boolean;
      }
    >
  >;
  readonly paired_recreational_vs_sharp: {
    readonly n_all_pairs: number;
    readonly n_causal_pairs: number;
    readonly signed_lag_all_minutes: QuantileDistributionSummary;
    readonly causal_lag_minutes: QuantileDistributionSummary;
  };
}

// ---------------------------------------------------------------------------
// Normalización canónica 1:1 con `services/models/stale_lines.py`
// ---------------------------------------------------------------------------

const STALE_BOOK_CANONICAL_MAP: Readonly<Record<string, string>> = {
  ps: "pinnacle",
  p: "pinnacle",
  pinnacle: "pinnacle",
  pinnacle_sports: "pinnacle",
  smarkets: "smarkets",
  betfair_smarkets_exchange: "smarkets",
  caliente: "caliente",
  caliente_mx: "caliente",
  "caliente.mx": "caliente",
  codere: "codere",
  codere_mx: "codere",
  "codere.mx": "codere",
  codere_bet365_mx: "codere",
  b365: "b365",
  bet365: "b365",
  "bet365 nj": "b365",
  bet365_nj: "b365",
  bw: "bw",
  bwin: "bw",
  wh: "wh",
  william_hill: "wh",
  williamhill: "wh",
  bf: "bf",
  betfair_sportsbook: "bf",
  draftkings: "draftkings",
  dk: "draftkings",
  "dk nj": "draftkings",
  dk_nj: "draftkings",
  "draftkings nj": "draftkings",
  fanduel: "fanduel",
  fd: "fanduel",
  "fanduel nj": "fanduel",
  fanduel_nj: "fanduel",
  betmgm: "betmgm",
  "betmgm nj": "betmgm",
  betmgm_nj: "betmgm",
  betrivers: "betrivers",
  "betrivers nj": "betrivers",
  betrivers_nj: "betrivers",
  fanatics: "fanatics",
  "fanatics nj": "fanatics",
  fanatics_nj: "fanatics",
  hardrock: "hardrock",
  "hard rock": "hardrock",
  "hardrock nj": "hardrock",
  hardrock_nj: "hardrock",
  thescore_bet: "thescore_bet",
  "thescore bet": "thescore_bet",
  "thescore bet nj": "thescore_bet",
  thescore_bet_nj: "thescore_bet",
  bfe: "bfe",
  betfair_exchange: "bfe",
  polymarket: "polymarket",
  kalshi: "kalshi",
  avg: "avg",
  market_avg: "avg",
  max: "max",
  market_max: "max",
  nflverse: "nflverse",
  consensus: "consensus",
  action_consensus: "action_consensus",
  open: "open",
  action_open: "action_open",
};

const SELECTION_CANONICAL_MAP: Readonly<Record<string, string>> = {
  h: "home",
  home: "home",
  "1": "home",
  d: "draw",
  draw: "draw",
  tie: "draw",
  t: "draw",
  x: "draw",
  a: "away",
  away: "away",
  "2": "away",
  o: "over",
  over: "over",
  u: "under",
  under: "under",
  yes: "yes",
  si: "yes",
  no: "no",
};

const SHARP_BOOKS_SET: ReadonlySet<string> = new Set(SHARP_REFERENCE_BOOKS);
const RECREATIONAL_BOOKS_SET: ReadonlySet<string> = new Set(RECREATIONAL_EXECUTION_BOOKS);

export function canonicalStaleBook(book: string): string {
  const raw = String(book ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return STALE_BOOK_CANONICAL_MAP[raw] ?? raw;
}

export function canonicalStaleMarket(market: string): string {
  const raw = String(market ?? "").trim().toLowerCase();
  if (raw === "1x2" || raw === "h2h_3way" || raw === "match_odds" || raw === "3way") {
    return "1x2";
  }
  if (raw === "moneyline" || raw === "ml" || raw === "h2h" || raw === "h2h_2way" || raw === "2way") {
    return "moneyline";
  }
  if (raw === "ah" || raw === "asian_handicap") {
    return "ah";
  }
  if (raw === "spread" || raw === "point_spread" || raw === "handicap") {
    return "spread";
  }
  if (raw === "totals" || raw === "total" || raw === "ou" || raw === "over_under" || raw === "ou_2_5") {
    return "totals";
  }
  if (raw === "btts" || raw === "both_teams_to_score") {
    return "btts";
  }
  if (raw === "dnb" || raw === "draw_no_bet") {
    return "dnb";
  }
  return raw;
}

export function canonicalStaleSelection(selection: string): string {
  const raw = String(selection ?? "").trim().toLowerCase();
  return SELECTION_CANONICAL_MAP[raw] ?? raw;
}

export function normalizeStaleLine(line: number | null | undefined): number | null {
  if (line === null || line === undefined || typeof line !== "number" || !Number.isFinite(line)) {
    return null;
  }
  const normalized = Object.is(line, -0) || line === 0 ? 0 : Math.round(line * 10000) / 10000;
  return Object.is(normalized, -0) ? 0 : normalized;
}

export function isSharpReferenceBook(book: string): book is SharpReferenceBook {
  return SHARP_BOOKS_SET.has(canonicalStaleBook(book));
}

export function isRecreationalBook(book: string): boolean {
  return RECREATIONAL_BOOKS_SET.has(canonicalStaleBook(book));
}

export function selectionOrderForMarket(market: string): readonly string[] {
  const m = canonicalStaleMarket(market);
  if (m === "1x2") {
    return ["home", "draw", "away"];
  }
  if (m === "totals") {
    return ["over", "under"];
  }
  if (m === "btts") {
    return ["yes", "no"];
  }
  return ["home", "away"];
}

// ---------------------------------------------------------------------------
// De-vig generalizado (2 y 3 vías) y mezcla logit con paridad `< 1e-12`
// ---------------------------------------------------------------------------

function smoothstep01(u: number): number {
  const t = clamp(u, 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Elimina el margen de un vector completo de cuotas sharp (2 o 3 selecciones) usando
 * `proportional`, `power`, `shin` o `adaptive`, con paridad exacta `< 1e-12` con Python.
 */
export function devigSharpMarketPrices(
  rawPrices: readonly number[],
  method: DevigMethod = "power",
  tolerance = 1e-12,
): number[] {
  if (!Array.isArray(rawPrices) || (rawPrices.length !== 2 && rawPrices.length !== 3)) {
    throw new InvalidOddsError(
      `Se esperaban exactamente 2 o 3 cuotas sharp completas; recibidas ${String(rawPrices?.length)}`,
    );
  }
  const q: number[] = [];
  let sumQ = 0;
  for (let i = 0; i < rawPrices.length; i += 1) {
    const o = rawPrices[i];
    if (typeof o !== "number" || !Number.isFinite(o) || o <= 1.0) {
      throw new InvalidOddsError(`Cuota sharp inválida en índice ${i}: ${String(o)}`);
    }
    const qi = 1.0 / o;
    q.push(qi);
    sumQ += qi;
  }
  if (sumQ < MIN_OVERROUND || sumQ > MAX_OVERROUND) {
    throw new InvalidOddsError(
      `Σ(1/cuota) sharp fuera de rango plausible [${MIN_OVERROUND}, ${MAX_OVERROUND}]: ${sumQ.toFixed(6)}`,
    );
  }

  if (method === "proportional") {
    return q.map((qi) => qi / sumQ);
  }

  const solvePower = (): number[] => {
    let lo = 1e-6;
    let hi = 5.0;
    let alpha = 1.0;
    for (let iter = 0; iter < 200; iter += 1) {
      alpha = 0.5 * (lo + hi);
      let s = 0;
      for (let j = 0; j < q.length; j += 1) {
        s += Math.pow(q[j]!, alpha);
      }
      if (Math.abs(s - 1.0) <= tolerance) break;
      if (s > 1.0) lo = alpha;
      else hi = alpha;
    }
    const p = q.map((qi) => Math.pow(qi, alpha));
    const tot = p.reduce((a, b) => a + b, 0);
    return p.map((v) => v / tot);
  };

  const solveShin = (): number[] => {
    const probsAtZ = (z: number): number[] =>
      q.map((qi) => {
        const inside = z * z + (4.0 * (1.0 - z) * qi * qi) / sumQ;
        return (Math.sqrt(Math.max(inside, 0.0)) - z) / (2.0 * (1.0 - z));
      });
    let lo = 0.0;
    let hi = 0.5;
    let z = 0.0;
    for (let iter = 0; iter < 200; iter += 1) {
      z = 0.5 * (lo + hi);
      const s = probsAtZ(z).reduce((a, b) => a + b, 0);
      if (Math.abs(s - 1.0) <= tolerance) break;
      if (s > 1.0) lo = z;
      else hi = z;
    }
    const p = probsAtZ(z);
    const tot = p.reduce((a, b) => a + b, 0);
    return p.map((v) => v / tot);
  };

  if (method === "power") {
    return solvePower();
  }
  if (method === "shin") {
    return solveShin();
  }

  // `adaptive`: mezcla suave Hermite C¹ idéntica a `devig.ts` y `backtest.py`
  const r = Math.max(0.0, sumQ - 1.0);
  let wShin: number;
  if (r <= SHARP_OVERROUND_ANCHOR) {
    wShin = MIN_ADAPTIVE_SHIN_WEIGHT;
  } else if (r <= RECREATIONAL_OVERROUND_ANCHOR) {
    const u = (r - SHARP_OVERROUND_ANCHOR) / (RECREATIONAL_OVERROUND_ANCHOR - SHARP_OVERROUND_ANCHOR);
    wShin =
      MIN_ADAPTIVE_SHIN_WEIGHT +
      (RECREATIONAL_SHIN_WEIGHT - MIN_ADAPTIVE_SHIN_WEIGHT) * smoothstep01(u);
  } else {
    const u = (r - RECREATIONAL_OVERROUND_ANCHOR) / (EXTREME_SOFT_OVERROUND_ANCHOR - RECREATIONAL_OVERROUND_ANCHOR);
    wShin =
      RECREATIONAL_SHIN_WEIGHT +
      (MAX_ADAPTIVE_SHIN_WEIGHT - RECREATIONAL_SHIN_WEIGHT) * smoothstep01(u);
  }
  const pPower = solvePower();
  const pShin = solveShin();
  const blended = pPower.map((pp, idx) => (1.0 - wShin) * pp + wShin * pShin[idx]!);
  const tot = blended.reduce((a, b) => a + b, 0);
  return blended.map((v) => v / tot);
}

/**
 * Mezcla en espacio logit-simplex para vectores completos (`pModelVec` y `pSharpNoVigVec`),
 * idéntica `< 1e-15` a `blend_probs_logit_simplex` en Python.
 */
export function blendConfirmationProbabilities(
  pModelVec: readonly number[],
  pSharpNoVigVec: readonly number[],
  wModel: number,
): number[] {
  if (pModelVec.length !== pSharpNoVigVec.length || pModelVec.length < 2) {
    throw new StaleLineConfigValidationError("Vectores incompatibles en blendConfirmationProbabilities.");
  }
  const w = clamp(wModel, 0.0, 1.0);
  const unnorm: number[] = [];
  let sumU = 0.0;
  for (let i = 0; i < pModelVec.length; i += 1) {
    const u = sigmoid(
      w * logit(pModelVec[i]!, PROB_CLIP_EPS) + (1.0 - w) * logit(pSharpNoVigVec[i]!, PROB_CLIP_EPS),
    );
    unnorm.push(u);
    sumU += u;
  }
  const denom = Math.max(1e-15, sumU);
  return unnorm.map((u) => u / denom);
}

/**
 * Mezcla logit escalar entre `pModelo` y `pSharpNoVig` cuando el candidato solo provee la selección objetivo.
 * Para mercados 2-vías coincide algebraicamente con `blendConfirmationProbabilities([p, 1-p], ...)`.
 */
export function blendScalarConfirmationProb(pModelo: number, pSharpNoVig: number, wModel: number): number {
  const w = clamp(wModel, 0.0, 1.0);
  return sigmoid(w * logit(pModelo, PROB_CLIP_EPS) + (1.0 - w) * logit(pSharpNoVig, PROB_CLIP_EPS));
}

// ---------------------------------------------------------------------------
// Validación de `StaleLinesConfig`
// ---------------------------------------------------------------------------

export function validateStaleLinesConfig(config: StaleLinesConfig): void {
  if (!config || typeof config !== "object") {
    throw new StaleLineConfigValidationError("StaleLinesConfig ausente o inválida.");
  }
  if (config.holdout_sealed_untouched !== true) {
    throw new StaleLineConfigValidationError(
      "holdout_sealed_untouched debe ser estrictamente true en StaleLinesConfig.",
    );
  }
  if (config.signal_mode !== "double_confirmation" && config.signal_mode !== "simple_sharp") {
    throw new StaleLineConfigValidationError(`signal_mode inválido: ${String(config.signal_mode)}`);
  }
  if (!Number.isFinite(config.stale_prob_margin) || config.stale_prob_margin < 0 || config.stale_prob_margin > 0.5) {
    throw new StaleLineConfigValidationError(`stale_prob_margin inválido: ${String(config.stale_prob_margin)}`);
  }
  if (!Number.isFinite(config.stale_ev_threshold) || config.stale_ev_threshold <= 0) {
    throw new StaleLineConfigValidationError(`stale_ev_threshold debe ser > 0: ${String(config.stale_ev_threshold)}`);
  }
  if (
    !Number.isFinite(config.stale_ev_threshold_valor) ||
    config.stale_ev_threshold_valor <= config.stale_ev_threshold
  ) {
    throw new StaleLineConfigValidationError(
      `stale_ev_threshold_valor (${String(config.stale_ev_threshold_valor)}) debe ser > stale_ev_threshold (${String(config.stale_ev_threshold)}).`,
    );
  }
  if (!Number.isFinite(config.min_model_prob_edge) || config.min_model_prob_edge < 0) {
    throw new StaleLineConfigValidationError(`min_model_prob_edge debe ser >= 0: ${String(config.min_model_prob_edge)}`);
  }
  if (!Number.isFinite(config.model_agreement_tolerance) || config.model_agreement_tolerance < 0) {
    throw new StaleLineConfigValidationError(
      `model_agreement_tolerance debe ser >= 0: ${String(config.model_agreement_tolerance)}`,
    );
  }
  if (
    !Number.isFinite(config.default_model_blend_weight) ||
    config.default_model_blend_weight < 0 ||
    config.default_model_blend_weight > 1
  ) {
    throw new StaleLineConfigValidationError(
      `default_model_blend_weight debe estar en [0, 1]: ${String(config.default_model_blend_weight)}`,
    );
  }
  if (
    config.max_sharp_quote_age_minutes !== null &&
    config.max_sharp_quote_age_minutes !== undefined &&
    (!Number.isFinite(config.max_sharp_quote_age_minutes) || config.max_sharp_quote_age_minutes <= 0)
  ) {
    throw new StaleLineConfigValidationError(
      `max_sharp_quote_age_minutes debe ser null o > 0: ${String(config.max_sharp_quote_age_minutes)}`,
    );
  }
  if (!Number.isFinite(config.kelly_fraction) || config.kelly_fraction <= 0 || config.kelly_fraction > 0.25 + EPS_PARITY) {
    throw new StaleLineConfigValidationError(
      `kelly_fraction inválida (${String(config.kelly_fraction)}): se exige Quarter-Kelly (<= 0.25).`,
    );
  }
  if (!Number.isFinite(config.max_sigma_p) || config.max_sigma_p < 0) {
    throw new StaleLineConfigValidationError(`max_sigma_p inválido: ${String(config.max_sigma_p)}`);
  }
  if (!Number.isFinite(config.max_adverse_ticks_1h) || config.max_adverse_ticks_1h < 0) {
    throw new StaleLineConfigValidationError(`max_adverse_ticks_1h inválido: ${String(config.max_adverse_ticks_1h)}`);
  }
  if (!Number.isFinite(config.uncertainty_penalty_k) || config.uncertainty_penalty_k < 0) {
    throw new StaleLineConfigValidationError(
      `uncertainty_penalty_k inválido: ${String(config.uncertainty_penalty_k)}`,
    );
  }
  if (!Number.isFinite(config.rho_same_event) || Math.abs(config.rho_same_event) > 1) {
    throw new StaleLineConfigValidationError(`rho_same_event debe estar en [-1, 1]: ${String(config.rho_same_event)}`);
  }
}

// ---------------------------------------------------------------------------
// Evaluación determinista de candidatos (`evaluateStaleLineBatch` / `evaluateStaleLineCandidate`)
// ---------------------------------------------------------------------------

function clampSafeAddition(usedU: number, addU: number, capU: number): number {
  const remaining = Math.max(0.0, capU - usedU);
  let candidate = Math.min(addU, remaining);
  while (candidate > 0.0 && usedU + candidate > capU) {
    candidate = Math.max(0.0, candidate - 1e-15);
  }
  return candidate;
}

function lookupStaleSegment(
  config: StaleLinesConfig,
  league: string,
  marketCanon: string,
): { segmentKey: string; segment: StaleSegmentConfig | null } {
  const normalizedMarket = marketCanon === "ou" ? "totals" : marketCanon;
  const exactKey = `${league.trim()}::${normalizedMarket}`;
  if (!config.segments) {
    return { segmentKey: exactKey, segment: null };
  }
  const direct = config.segments[exactKey];
  if (direct) {
    return { segmentKey: exactKey, segment: direct };
  }
  const lower = exactKey.toLowerCase();
  for (const [k, v] of Object.entries(config.segments)) {
    if (k.toLowerCase() === lower) {
      return { segmentKey: k, segment: v };
    }
  }
  return { segmentKey: exactKey, segment: null };
}

function resolveSharpNoVigFromCandidate(
  candidate: StaleLineCandidate,
  marketCanon: string,
  selCanon: string,
  defaultDevigMethod: DevigMethod,
): { pSharpNoVig: number | null; novigVec: readonly number[] | null; selIdx: number | null } {
  const selOrder = selectionOrderForMarket(marketCanon);
  const inferredIdx =
    typeof candidate.selection_index === "number" &&
    Number.isInteger(candidate.selection_index) &&
    candidate.selection_index >= 0 &&
    candidate.selection_index < selOrder.length
      ? candidate.selection_index
      : selOrder.indexOf(selCanon);

  if (
    typeof candidate.p_sharp_novig === "number" &&
    Number.isFinite(candidate.p_sharp_novig) &&
    candidate.p_sharp_novig > 0 &&
    candidate.p_sharp_novig < 1
  ) {
    const vec = Array.isArray(candidate.sharp_market_novig_probs) ? candidate.sharp_market_novig_probs : null;
    return {
      pSharpNoVig: candidate.p_sharp_novig,
      novigVec: vec,
      selIdx: inferredIdx >= 0 ? inferredIdx : null,
    };
  }

  if (candidate.sharp_market_odds !== null && candidate.sharp_market_odds !== undefined) {
    let oddsArr: number[] | null = null;
    if (Array.isArray(candidate.sharp_market_odds)) {
      oddsArr = candidate.sharp_market_odds.map((x) => Number(x));
    } else if (typeof candidate.sharp_market_odds === "object") {
      const rec = candidate.sharp_market_odds as Readonly<Record<string, number>>;
      const extracted: number[] = [];
      let complete = true;
      for (const s of selOrder) {
        const val = rec[s];
        if (typeof val === "number" && Number.isFinite(val)) {
          extracted.push(val);
        } else {
          complete = false;
          break;
        }
      }
      if (complete) {
        oddsArr = extracted;
      }
    }
    if (oddsArr !== null && inferredIdx >= 0 && inferredIdx < oddsArr.length) {
      try {
        const method = candidate.devig_method ?? defaultDevigMethod;
        const nv = devigSharpMarketPrices(oddsArr, method);
        const pTarget = nv[inferredIdx];
        if (typeof pTarget === "number" && Number.isFinite(pTarget) && pTarget > 0 && pTarget < 1) {
          return { pSharpNoVig: pTarget, novigVec: nv, selIdx: inferredIdx };
        }
      } catch {
        return { pSharpNoVig: null, novigVec: null, selIdx: null };
      }
    }
  }

  return { pSharpNoVig: null, novigVec: null, selIdx: null };
}

interface StaleSurvivor {
  readonly baseFields: Omit<
    StaleLineDecisionResult,
    "approved" | "rejection_reason" | "correlation_multiplier" | "stake_u" | "allocation_rank" | "cap_applied"
  >;
}

/**
 * Evalúa un lote de `StaleLineCandidate[]` respetando causalidad estricta, Condición 1 + Condición 2
 * (o Señal Simple solo-sharp si `options.overrideSignalMode === "simple_sharp"`), Quarter-Kelly contraído
 * por incertidumbre y los 4 topes duros de portafolio (`<= 2.0u` pick, `<= 2.0u` evento, `<= 3.0u` liga-día,
 * `<= 5.0u` día global).
 */
export function evaluateStaleLineBatch(
  candidates: readonly StaleLineCandidate[],
  config: StaleLinesConfig,
  options?: {
    readonly portfolioState?: PortfolioState;
    readonly overrideSignalMode?: StaleSignalMode;
    readonly skipConfigValidation?: boolean;
  },
): StaleLineDecisionResult[] {
  if (!options?.skipConfigValidation) {
    validateStaleLinesConfig(config);
  }
  if (candidates.length === 0) {
    return [];
  }

  const signalMode: StaleSignalMode = options?.overrideSignalMode ?? config.signal_mode;
  const kellyFraction = Math.min(0.25, config.kelly_fraction);
  const bankrollUnitPct = config.bankroll_unit_pct ?? DEFAULT_BANKROLL_UNIT_PCT;
  const minStakeU = config.min_stake_u ?? DEFAULT_MIN_STAKE_U;
  const fallbackSigmaP = config.fallback_sigma_p ?? 0.02;
  const sharpWindowMin = config.sharp_steam_window_minutes ?? DEFAULT_SHARP_STEAM_WINDOW_MINUTES;
  const sharpProbTick = config.sharp_implied_prob_tick ?? DEFAULT_SHARP_IMPLIED_PROB_TICK;

  const capPickMax = Math.min(
    HARD_MAX_STAKE_PER_PICK_U,
    config.caps?.max_stake_per_pick_u ?? HARD_MAX_STAKE_PER_PICK_U,
  );
  const capEventMax = Math.min(
    HARD_MAX_STAKE_PER_EVENT_U,
    config.caps?.max_stake_per_event_u ?? HARD_MAX_STAKE_PER_EVENT_U,
  );
  const capLeagueDateMax = Math.min(
    HARD_MAX_STAKE_PER_LEAGUE_DATE_U,
    config.caps?.max_stake_per_league_date_u ?? HARD_MAX_STAKE_PER_LEAGUE_DATE_U,
  );
  const capGlobalDateMax = Math.min(
    HARD_MAX_STAKE_PER_GLOBAL_DATE_U,
    config.caps?.max_stake_per_global_date_u ?? HARD_MAX_STAKE_PER_GLOBAL_DATE_U,
  );

  // Inicializar estado de portafolio
  const eventExposureU = new Map<string, number>();
  const eventMarketsTaken = new Map<string, Set<string>>();
  const eventPickCounts = new Map<string, number>();
  const leagueDateExposureU = new Map<string, number>();
  const globalDateExposureU = new Map<string, number>();

  const pState = options?.portfolioState;
  if (pState) {
    if (pState.event_exposure_u) {
      for (const [k, v] of Object.entries(pState.event_exposure_u)) {
        if (Number.isFinite(v) && v > 0) eventExposureU.set(k, v);
      }
    }
    if (pState.event_markets_taken) {
      for (const [k, mkts] of Object.entries(pState.event_markets_taken)) {
        const s = new Set<string>();
        for (const m of mkts) s.add(canonicalStaleMarket(m));
        eventMarketsTaken.set(k, s);
      }
    }
    if (pState.event_pick_counts) {
      for (const [k, c] of Object.entries(pState.event_pick_counts)) {
        if (Number.isFinite(c) && c > 0) eventPickCounts.set(k, Math.floor(c));
      }
    }
    if (pState.league_date_exposure_u) {
      for (const [k, v] of Object.entries(pState.league_date_exposure_u)) {
        if (Number.isFinite(v) && v > 0) leagueDateExposureU.set(k, v);
      }
    }
    if (pState.global_date_exposure_u) {
      for (const [k, v] of Object.entries(pState.global_date_exposure_u)) {
        if (Number.isFinite(v) && v > 0) globalDateExposureU.set(k, v);
      }
    }
    if (Array.isArray(pState.open_picks)) {
      for (const op of pState.open_picks) {
        if (!Number.isFinite(op.stake_u) || op.stake_u <= 0) continue;
        const uDate = resolveCandidateUtcDate({
          utc_date: op.utc_date,
          ts_event_start: op.ts_event_start,
        });
        const eid = String(op.event_id).trim();
        const lg = String(op.league).trim();
        const ldKey = `${lg}::${uDate}`;
        eventExposureU.set(eid, (eventExposureU.get(eid) ?? 0) + op.stake_u);
        eventPickCounts.set(eid, (eventPickCounts.get(eid) ?? 0) + 1);
        if (op.market) {
          let mSet = eventMarketsTaken.get(eid);
          if (!mSet) {
            mSet = new Set<string>();
            eventMarketsTaken.set(eid, mSet);
          }
          mSet.add(canonicalStaleMarket(op.market));
        }
        leagueDateExposureU.set(ldKey, (leagueDateExposureU.get(ldKey) ?? 0) + op.stake_u);
        globalDateExposureU.set(uDate, (globalDateExposureU.get(uDate) ?? 0) + op.stake_u);
      }
    }
  }

  const decisions: Array<StaleLineDecisionResult | null> = new Array(candidates.length).fill(null);
  const survivors: StaleSurvivor[] = [];

  for (let idx = 0; idx < candidates.length; idx += 1) {
    const c = candidates[idx]!;
    const cid =
      typeof c.candidate_id === "string" && c.candidate_id.trim().length > 0
        ? c.candidate_id.trim()
        : `stale_cand_${idx}`;
    const eid = String(c.event_id ?? "").trim();
    const sport = String(c.sport ?? "").trim().toLowerCase();
    const league = String(c.league ?? "").trim();
    const marketCanon = canonicalStaleMarket(c.market);
    const lineNorm = normalizeStaleLine(c.line);
    const selCanon = canonicalStaleSelection(c.selection);
    const recBookCanon = canonicalStaleBook(c.recreational_book);
    const sharpBookCanonRaw =
      c.sharp_book !== null && c.sharp_book !== undefined && String(c.sharp_book).trim().length > 0
        ? canonicalStaleBook(c.sharp_book)
        : "pinnacle";

    // 1. Guardia causal obligatoria sobre todos los timestamps antes de tocar precios
    const decUs = parseIsoUtcMicros(c.ts_decision);
    const startUs = parseIsoUtcMicros(c.ts_event_start);
    if (decUs === null || startUs === null) {
      throw new StaleLineCausalityError(
        `Timestamps inválidos en candidato '${cid}': ts_decision=${String(c.ts_decision)}, ts_event_start=${String(c.ts_event_start)}`,
      );
    }
    if (decUs > startUs) {
      throw new StaleLineCausalityError(
        `Violación post-kickoff en '${cid}': ts_decision (${c.ts_decision}) > ts_event_start (${c.ts_event_start}).`,
      );
    }

    let recCapUs: number | null = null;
    if (c.ts_recreational_captured !== null && c.ts_recreational_captured !== undefined) {
      recCapUs = parseIsoUtcMicros(c.ts_recreational_captured);
      if (recCapUs === null) {
        throw new StaleLineCausalityError(
          `ts_recreational_captured inválido en '${cid}': ${String(c.ts_recreational_captured)}`,
        );
      }
      if (recCapUs > decUs) {
        throw new StaleLineCausalityError(
          `Fuga temporal recreativa en '${cid}': ts_recreational_captured (${c.ts_recreational_captured}) > ts_decision (${c.ts_decision}).`,
        );
      }
    }

    let sharpCapUs: number | null = null;
    if (c.ts_sharp_captured !== null && c.ts_sharp_captured !== undefined) {
      sharpCapUs = parseIsoUtcMicros(c.ts_sharp_captured);
      if (sharpCapUs === null) {
        throw new StaleLineCausalityError(
          `ts_sharp_captured inválido en '${cid}': ${String(c.ts_sharp_captured)}`,
        );
      }
      if (sharpCapUs > decUs) {
        throw new StaleLineCausalityError(
          `Fuga temporal sharp en '${cid}': ts_sharp_captured (${c.ts_sharp_captured}) > ts_decision (${c.ts_decision}).`,
        );
      }
    }

    const utcDate = resolveCandidateUtcDate({
      utc_date: c.utc_date,
      ts_event_start: c.ts_event_start,
      ts_decision: c.ts_decision,
    });
    const { segmentKey, segment } = lookupStaleSegment(config, league, marketCanon);

    const sharpQuoteAgeMinutes = sharpCapUs !== null ? (decUs - sharpCapUs) / 60_000_000 : null;
    const recQuoteAgeMinutes = recCapUs !== null ? (decUs - recCapUs) / 60_000_000 : null;
    const recVsSharpLagMinutes =
      recCapUs !== null && sharpCapUs !== null ? (recCapUs - sharpCapUs) / 60_000_000 : null;

    // Verificar ticks sharp 1h (lanza PickCausalityError -> convertimos a StaleLineCausalityError)
    let adverseTicks1h = 0.0;
    try {
      adverseTicks1h = computeAdverseSharpTicks1h(c.sharp_quotes_1h, c.ts_decision, {
        market: marketCanon,
        line: lineNorm,
        selection: selCanon,
        windowMinutes: sharpWindowMin,
        sharpImpliedProbTick: sharpProbTick,
        precomputedAdverseTicks: c.adverse_ticks_1h,
      });
    } catch (err) {
      throw new StaleLineCausalityError(
        err instanceof Error ? err.message : "Violación causal en sharp_quotes_1h",
      );
    }

    const priceRec = c.price_recreational;
    const priceValid =
      typeof priceRec === "number" &&
      Number.isFinite(priceRec) &&
      priceRec >= MIN_PICK_PRICE_DECIMAL &&
      priceRec <= MAX_PICK_PRICE_DECIMAL;

    const makeRejection = (
      reason: StaleLineRejectionReason,
      extra?: Partial<{
        sharpBook: SharpReferenceBook | null;
        pSharpNoVig: number;
        cond1: boolean;
        cond2: boolean | null;
        pMod: number | null;
        pEff: number;
        sigmaP: number;
        pShrunk: number;
        fQuarter: number;
        stakeRawU: number;
        g: number;
        tier: PickTier | null;
      }>,
    ): StaleLineDecisionResult => {
      const safePrice = priceValid ? priceRec : 0.0;
      const pImp = priceValid ? 1.0 / priceRec : 0.0;
      const pSnv = extra?.pSharpNoVig ?? 0.0;
      const prSnv = pSnv > 0 ? 1.0 / pSnv : 0.0;
      const pmObs = pSnv > 0 && priceValid ? pSnv - pImp : 0.0;
      const evSharp = pSnv > 0 && priceValid ? pSnv * priceRec - 1.0 : 0.0;
      const ratioSharp = pSnv > 0 && priceValid ? priceRec * pSnv : 0.0;
      const pMod = extra?.pMod ?? null;
      return {
        candidate_id: cid,
        input_index: idx,
        approved: false,
        rejection_reason: reason,
        signal_mode: signalMode,
        tier: extra?.tier ?? null,
        cond1_stale_line: extra?.cond1 ?? false,
        cond2_model_confirms: extra?.cond2 ?? (signalMode === "simple_sharp" ? null : false),
        event_id: eid,
        sport,
        league,
        market: marketCanon,
        line: lineNorm,
        selection: selCanon,
        recreational_book: recBookCanon,
        sharp_book: extra?.sharpBook ?? null,
        utc_date: utcDate,
        segment_key: segmentKey,
        odds_bucket: priceValid ? classifyOddsBucket(priceRec) : "even",
        price_recreational: safePrice,
        p_recreational_implied: pImp,
        p_sharp_novig: pSnv,
        price_sharp_novig: prSnv,
        stale_prob_margin_obs: pmObs,
        stale_ev_sharp: evSharp,
        price_ratio_vs_sharp_novig: ratioSharp,
        p_modelo: pMod,
        model_edge_over_implied: pMod !== null && priceValid ? pMod - pImp : null,
        model_ev_recreational: pMod !== null && priceValid ? pMod * priceRec - 1.0 : null,
        model_vs_sharp_diff: pMod !== null && pSnv > 0 ? pMod - pSnv : null,
        sharp_quote_age_minutes: sharpQuoteAgeMinutes,
        recreational_quote_age_minutes: recQuoteAgeMinutes,
        recreational_vs_sharp_lag_minutes: recVsSharpLagMinutes,
        p_effective: extra?.pEff ?? 0.0,
        sigma_p: extra?.sigmaP ?? 0.0,
        p_shrunk: extra?.pShrunk ?? 0.0,
        adverse_ticks_1h: adverseTicks1h,
        f_quarter: extra?.fQuarter ?? 0.0,
        stake_raw_u: extra?.stakeRawU ?? 0.0,
        correlation_multiplier: 1.0,
        stake_u: 0.0,
        expected_log_growth_g: extra?.g ?? 0.0,
        allocation_rank: null,
        cap_applied: false,
      };
    };

    if (!eid || !sport || !league || !marketCanon || !selCanon || !priceValid) {
      decisions[idx] = makeRejection("invalid_candidate_input");
      continue;
    }

    // 2. Solo casas recreativas reales pueden emitir picks de línea rezagada
    if (!RECREATIONAL_BOOKS_SET.has(recBookCanon)) {
      decisions[idx] = makeRejection("non_recreational_book");
      continue;
    }

    // 3. Validar referencia sharp (`pinnacle` o `smarkets` únicamente)
    if (!SHARP_BOOKS_SET.has(sharpBookCanonRaw)) {
      decisions[idx] = makeRejection("missing_sharp_reference");
      continue;
    }
    const sharpBook = sharpBookCanonRaw as SharpReferenceBook;
    const defaultDevig = segment?.best_devig_method ?? config.default_devig_method ?? "power";
    const resolvedSharp = resolveSharpNoVigFromCandidate(c, marketCanon, selCanon, defaultDevig);
    if (resolvedSharp.pSharpNoVig === null) {
      decisions[idx] = makeRejection("missing_sharp_reference", { sharpBook });
      continue;
    }
    const pSharpNoVig = resolvedSharp.pSharpNoVig;

    // 4. Guardia opcional de frescura temporal del ancla sharp
    if (
      config.max_sharp_quote_age_minutes !== null &&
      config.max_sharp_quote_age_minutes !== undefined &&
      sharpQuoteAgeMinutes !== null &&
      sharpQuoteAgeMinutes > config.max_sharp_quote_age_minutes + EPS_PARITY
    ) {
      decisions[idx] = makeRejection("sharp_reference_too_old", {
        sharpBook,
        pSharpNoVig,
      });
      continue;
    }

    // 5. Guardia contra steam sharp adverso en la última hora
    if (adverseTicks1h > config.max_adverse_ticks_1h + EPS_PARITY) {
      decisions[idx] = makeRejection("adverse_sharp_steam", {
        sharpBook,
        pSharpNoVig,
      });
      continue;
    }

    // 6. Condición 1: Línea recreativa rezagada frente a sharp contemporánea sin margen
    const pImp = 1.0 / priceRec;
    const staleProbMarginObs = pSharpNoVig - pImp;
    const staleEvSharp = pSharpNoVig * priceRec - 1.0;

    const reqProbMargin = segment?.stale_prob_margin ?? config.stale_prob_margin;
    const reqEvSolido = segment?.stale_ev_threshold ?? config.stale_ev_threshold;
    const reqEvValor = segment?.stale_ev_threshold_valor ?? config.stale_ev_threshold_valor;

    const pModValid =
      typeof c.p_modelo === "number" && Number.isFinite(c.p_modelo) && c.p_modelo > 0 && c.p_modelo < 1
        ? c.p_modelo
        : null;

    if (staleProbMarginObs <= 0.0 || staleEvSharp <= 0.0) {
      decisions[idx] = makeRejection("not_stale_below_sharp_novig", {
        sharpBook,
        pSharpNoVig,
        pMod: pModValid,
      });
      continue;
    }

    if (
      staleProbMarginObs + EPS_PARITY < reqProbMargin ||
      staleEvSharp + EPS_PARITY < reqEvSolido ||
      (segment?.enabled === false && config.allow_unlisted_segments !== true)
    ) {
      decisions[idx] = makeRejection("below_stale_thresholds", {
        sharpBook,
        pSharpNoVig,
        pMod: pModValid,
      });
      continue;
    }

    // 7. Condición 2: Confirmación direccional del modelo (en modo `double_confirmation`)
    const reqAgreementTol = segment?.model_agreement_tolerance ?? config.model_agreement_tolerance;
    let cond2Confirms: boolean | null = null;

    if (signalMode === "double_confirmation") {
      if (pModValid === null) {
        decisions[idx] = makeRejection("missing_model_probability", {
          sharpBook,
          pSharpNoVig,
          cond1: true,
          cond2: false,
        });
        continue;
      }
      if (pModValid <= pImp + config.min_model_prob_edge) {
        decisions[idx] = makeRejection("model_below_recreational_breakeven", {
          sharpBook,
          pSharpNoVig,
          cond1: true,
          cond2: false,
          pMod: pModValid,
        });
        continue;
      }
      if (pModValid + EPS_PARITY < pSharpNoVig - reqAgreementTol) {
        decisions[idx] = makeRejection("model_contradicts_sharp", {
          sharpBook,
          pSharpNoVig,
          cond1: true,
          cond2: false,
          pMod: pModValid,
        });
        continue;
      }
      cond2Confirms = true;
    } else if (pModValid !== null) {
      // Telemetría informativa en `simple_sharp` sin bloquear el candidato
      cond2Confirms =
        pModValid > pImp + config.min_model_prob_edge &&
        pModValid + EPS_PARITY >= pSharpNoVig - reqAgreementTol;
    }

    // 8. Dispersión epistémica entre submodelos (`sigma_p`)
    const dispComputed = computeSubmodelDispersion({
      submodel_probs: c.submodel_probs,
      p_logit: c.p_logit,
      p_gbm: c.p_gbm,
      p_dixon_coles: c.p_dixon_coles,
      sigma_p: c.sigma_p,
    });
    const sigmaP = dispComputed ?? fallbackSigmaP;
    if (sigmaP > config.max_sigma_p + EPS_PARITY) {
      decisions[idx] = makeRejection("high_submodel_dispersion", {
        sharpBook,
        pSharpNoVig,
        cond1: true,
        cond2: cond2Confirms,
        pMod: pModValid,
        sigmaP,
      });
      continue;
    }

    // 9. Probabilidad efectiva de valuación y Quarter-Kelly contraído por incertidumbre
    let pEffective = pSharpNoVig;
    if (signalMode === "double_confirmation" && pModValid !== null) {
      const wMod = clamp(
        c.w_model ?? segment?.w_model ?? config.default_model_blend_weight,
        0.0,
        1.0,
      );
      if (
        Array.isArray(c.model_market_probs) &&
        resolvedSharp.novigVec !== null &&
        c.model_market_probs.length === resolvedSharp.novigVec.length &&
        resolvedSharp.selIdx !== null
      ) {
        const blendedVec = blendConfirmationProbabilities(
          c.model_market_probs,
          resolvedSharp.novigVec,
          wMod,
        );
        pEffective = blendedVec[resolvedSharp.selIdx]!;
      } else {
        pEffective = blendScalarConfirmationProb(pModValid, pSharpNoVig, wMod);
      }
    }

    const kelly = computeShrunkQuarterKelly(
      pEffective,
      priceRec,
      sigmaP,
      config.uncertainty_penalty_k,
      kellyFraction,
      bankrollUnitPct,
    );

    if (kelly.edge_erased || kelly.stake_raw_u <= 0.0) {
      decisions[idx] = makeRejection("uncertainty_erased_edge", {
        sharpBook,
        pSharpNoVig,
        cond1: true,
        cond2: cond2Confirms,
        pMod: pModValid,
        pEff: pEffective,
        sigmaP,
        pShrunk: kelly.p_shrunk,
        fQuarter: kelly.f_quarter,
        stakeRawU: kelly.stake_raw_u,
        g: kelly.expected_log_growth_g,
      });
      continue;
    }

    // 10. Clasificación en los 2 únicos niveles válidos (`"solido" | "valor"`, cero % de acierto)
    let tier: PickTier;
    if (staleEvSharp + EPS_PARITY >= reqEvValor) {
      tier = "valor";
    } else if (
      signalMode === "double_confirmation" &&
      (segment?.segment_clv_ci95_low === undefined ||
        segment?.segment_clv_ci95_low === null ||
        segment.segment_clv_ci95_low > 0)
    ) {
      tier = "solido";
    } else {
      tier = "valor";
    }

    survivors.push({
      baseFields: {
        candidate_id: cid,
        input_index: idx,
        signal_mode: signalMode,
        tier,
        cond1_stale_line: true,
        cond2_model_confirms: cond2Confirms,
        event_id: eid,
        sport,
        league,
        market: marketCanon,
        line: lineNorm,
        selection: selCanon,
        recreational_book: recBookCanon,
        sharp_book: sharpBook,
        utc_date: utcDate,
        segment_key: segmentKey,
        odds_bucket: classifyOddsBucket(priceRec),
        price_recreational: priceRec,
        p_recreational_implied: pImp,
        p_sharp_novig: pSharpNoVig,
        price_sharp_novig: 1.0 / pSharpNoVig,
        stale_prob_margin_obs: staleProbMarginObs,
        stale_ev_sharp: staleEvSharp,
        price_ratio_vs_sharp_novig: priceRec * pSharpNoVig,
        p_modelo: pModValid,
        model_edge_over_implied: pModValid !== null ? pModValid - pImp : null,
        model_ev_recreational: pModValid !== null ? pModValid * priceRec - 1.0 : null,
        model_vs_sharp_diff: pModValid !== null ? pModValid - pSharpNoVig : null,
        sharp_quote_age_minutes: sharpQuoteAgeMinutes,
        recreational_quote_age_minutes: recQuoteAgeMinutes,
        recreational_vs_sharp_lag_minutes: recVsSharpLagMinutes,
        p_effective: pEffective,
        sigma_p: sigmaP,
        p_shrunk: kelly.p_shrunk,
        adverse_ticks_1h: adverseTicks1h,
        f_quarter: kelly.f_quarter,
        stake_raw_u: kelly.stake_raw_u,
        expected_log_growth_g: kelly.expected_log_growth_g,
      },
    });
  }

  // Ordenar sobrevivientes por crecimiento logarítmico esperado `g` descendente (desempate determinista)
  survivors.sort((a, b) => {
    const dg = b.baseFields.expected_log_growth_g - a.baseFields.expected_log_growth_g;
    if (Math.abs(dg) > 1e-15) return dg > 0 ? 1 : -1;
    const dev = b.baseFields.stale_ev_sharp - a.baseFields.stale_ev_sharp;
    if (Math.abs(dev) > 1e-15) return dev > 0 ? 1 : -1;
    return a.baseFields.input_index - b.baseFields.input_index;
  });

  let nextRank = 1;
  for (const s of survivors) {
    const bf = s.baseFields;
    const eid = bf.event_id;
    const ldKey = `${bf.league}::${bf.utc_date}`;
    let mktSet = eventMarketsTaken.get(eid);
    if (!mktSet) {
      mktSet = new Set<string>();
      eventMarketsTaken.set(eid, mktSet);
    }

    const finalize = (
      approved: boolean,
      reason: StaleLineRejectionReason | null,
      corrMult: number,
      stakeU: number,
      rank: number | null,
      capApplied: boolean,
    ): StaleLineDecisionResult => ({
      ...bf,
      approved,
      rejection_reason: reason,
      tier: approved ? bf.tier : null,
      correlation_multiplier: corrMult,
      stake_u: stakeU,
      allocation_rank: rank,
      cap_applied: capApplied,
    });

    // Impedir duplicar el mismo `(event_id, market)` en el portafolio
    if (mktSet.has(bf.market)) {
      decisions[bf.input_index] = finalize(false, "correlated_same_event_market", 0.0, 0.0, null, false);
      continue;
    }

    const priorSameEvent = eventPickCounts.get(eid) ?? 0;
    const corrMult =
      priorSameEvent > 0 && config.rho_same_event > 0
        ? 1.0 / (1.0 + priorSameEvent * config.rho_same_event)
        : 1.0;
    const stakeCorrU = bf.stake_raw_u * corrMult;

    const usedEventU = eventExposureU.get(eid) ?? 0.0;
    const usedLdU = leagueDateExposureU.get(ldKey) ?? 0.0;
    const usedGdU = globalDateExposureU.get(bf.utc_date) ?? 0.0;

    if (capEventMax - usedEventU <= EPS_PARITY) {
      decisions[bf.input_index] = finalize(false, "cap_event_exhausted", corrMult, 0.0, null, true);
      continue;
    }
    if (capLeagueDateMax - usedLdU <= EPS_PARITY) {
      decisions[bf.input_index] = finalize(false, "cap_league_date_exhausted", corrMult, 0.0, null, true);
      continue;
    }
    if (capGlobalDateMax - usedGdU <= EPS_PARITY) {
      decisions[bf.input_index] = finalize(false, "cap_global_date_exhausted", corrMult, 0.0, null, true);
      continue;
    }

    let stakeU = Math.min(stakeCorrU, capPickMax);
    stakeU = clampSafeAddition(usedEventU, stakeU, capEventMax);
    stakeU = clampSafeAddition(usedLdU, stakeU, capLeagueDateMax);
    stakeU = clampSafeAddition(usedGdU, stakeU, capGlobalDateMax);

    const capApplied = stakeU + 1e-15 < stakeCorrU;
    if (stakeU < minStakeU) {
      decisions[bf.input_index] = finalize(false, "stake_below_min_unit", corrMult, 0.0, null, capApplied);
      continue;
    }

    const rank = nextRank;
    nextRank += 1;
    eventExposureU.set(eid, usedEventU + stakeU);
    leagueDateExposureU.set(ldKey, usedLdU + stakeU);
    globalDateExposureU.set(bf.utc_date, usedGdU + stakeU);
    eventPickCounts.set(eid, priorSameEvent + 1);
    mktSet.add(bf.market);

    decisions[bf.input_index] = finalize(true, null, corrMult, stakeU, rank, capApplied);
  }

  return decisions.map((d) => {
    if (d === null) {
      throw new StaleLineConfigValidationError("Invariante interna rota en evaluateStaleLineBatch.");
    }
    return d;
  });
}

/** Evalúa un único `StaleLineCandidate` de forma pura y determinista. */
export function evaluateStaleLineCandidate(
  candidate: StaleLineCandidate,
  config: StaleLinesConfig,
  options?: {
    readonly portfolioState?: PortfolioState;
    readonly overrideSignalMode?: StaleSignalMode;
  },
): StaleLineDecisionResult {
  const res = evaluateStaleLineBatch([candidate], config, options);
  return res[0]!;
}

/** Convierte un `StaleLineDecisionResult` aprobado en `PickLedgerInput` para `ledger.ts`. */
export function staleDecisionToLedgerPickInput(
  decision: StaleLineDecisionResult,
  meta: {
    readonly pick_id: string;
    readonly ts_emitido: string;
    readonly version_modelo: string;
    readonly features_hash: string;
    readonly price_tomado?: number;
  },
): PickLedgerInput {
  if (!decision.approved || decision.tier === null) {
    throw new StaleLineConfigValidationError(
      `No se puede registrar en ledger un candidato rechazado (${decision.candidate_id}).`,
    );
  }
  const execPrice = meta.price_tomado ?? decision.price_recreational;
  return {
    pick_id: meta.pick_id,
    ts_emitido: meta.ts_emitido,
    event_id: decision.event_id,
    sport: decision.sport,
    league: decision.league,
    market: decision.market,
    line: decision.line,
    selection: decision.selection,
    book: decision.recreational_book,
    price_tomado: execPrice,
    p_modelo: decision.p_modelo ?? decision.p_sharp_novig,
    p_mercado: decision.p_sharp_novig,
    p_final: decision.p_effective,
    ev: decision.p_effective * execPrice - 1.0,
    stake_u: decision.stake_u,
    tier: decision.tier,
    version_modelo: meta.version_modelo,
    features_hash: meta.features_hash,
  };
}

// ---------------------------------------------------------------------------
// Medición empírica de intervalos y desfases + Derivación matemática de cadencia
// ---------------------------------------------------------------------------

/** Resume una muestra numérica con cuantiles lineales Type-7 (`min`, `p25`, `median`, `p75`, `max`, `mean`). */
export function summarizeQuantiles(values: readonly number[]): QuantileDistributionSummary {
  const finite = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (finite.length === 0) {
    return {
      n: 0,
      min: null,
      p25: null,
      median: null,
      p75: null,
      max: null,
      mean: null,
    };
  }
  const sorted = Float64Array.from(finite).sort();
  let sum = 0.0;
  for (let i = 0; i < sorted.length; i += 1) {
    sum += sorted[i]!;
  }
  return {
    n: sorted.length,
    min: sorted[0]!,
    p25: quantileLinearSorted(sorted, 0.25),
    median: quantileLinearSorted(sorted, 0.5),
    p75: quantileLinearSorted(sorted, 0.75),
    max: sorted[sorted.length - 1]!,
    mean: sum / sorted.length,
  };
}

/**
 * Mide de forma pura y determinista los intervalos reales entre capturas por casa y el desfase
 * temporal exacto (firmado y causal `ts_sharp <= ts_rec`) entre casas recreativas y sharp.
 */
export function measureSnapshotCaptureCadence(
  snapshots: readonly SnapshotTimestampRecord[],
): SnapshotCadenceMeasurement {
  interface ParsedSnap {
    readonly eventId: string;
    readonly marketCanon: string;
    readonly lineKey: string;
    readonly selCanon: string;
    readonly bookCanon: string;
    readonly tsUs: number;
  }

  const parsed: ParsedSnap[] = [];
  for (const s of snapshots) {
    const tsUs = parseIsoUtcMicros(s.ts_captured);
    if (tsUs === null) continue;
    if (s.ts_event_start !== null && s.ts_event_start !== undefined) {
      const startUs = parseIsoUtcMicros(s.ts_event_start);
      if (startUs !== null && tsUs > startUs) continue;
    }
    const ln = normalizeStaleLine(s.line);
    parsed.push({
      eventId: String(s.event_id).trim(),
      marketCanon: canonicalStaleMarket(s.market),
      lineKey: ln === null ? "null" : ln.toFixed(4),
      selCanon: canonicalStaleSelection(s.selection),
      bookCanon: canonicalStaleBook(s.book),
      tsUs,
    });
  }

  const byBookSnaps = new Map<string, ParsedSnap[]>();
  for (const p of parsed) {
    let arr = byBookSnaps.get(p.bookCanon);
    if (!arr) {
      arr = [];
      byBookSnaps.set(p.bookCanon, arr);
    }
    arr.push(p);
  }

  const byBookOut: Record<
    string,
    {
      readonly n_rows: number;
      readonly n_events: number;
      readonly n_unique_timestamps: number;
      readonly intra_series_intervals_minutes: QuantileDistributionSummary;
      readonly global_wave_intervals_minutes: QuantileDistributionSummary;
      readonly single_capture_only: boolean;
    }
  > = {};

  const sortedBooks = Array.from(byBookSnaps.keys()).sort();
  for (const book of sortedBooks) {
    const rows = byBookSnaps.get(book)!;
    const eventsSet = new Set<string>();
    const tsSet = new Set<number>();
    const seriesMap = new Map<string, number[]>();

    for (const r of rows) {
      eventsSet.add(r.eventId);
      tsSet.add(r.tsUs);
      const sKey = `${r.eventId}||${r.marketCanon}||${r.lineKey}||${r.selCanon}`;
      let sArr = seriesMap.get(sKey);
      if (!sArr) {
        sArr = [];
        seriesMap.set(sKey, sArr);
      }
      sArr.push(r.tsUs);
    }

    const intraDiffsMin: number[] = [];
    for (const tsList of seriesMap.values()) {
      const uniq = Array.from(new Set(tsList)).sort((a, b) => a - b);
      for (let i = 1; i < uniq.length; i += 1) {
        intraDiffsMin.push((uniq[i]! - uniq[i - 1]!) / 60_000_000);
      }
    }

    const globalWaves = Array.from(tsSet).sort((a, b) => a - b);
    const waveDiffsMin: number[] = [];
    for (let i = 1; i < globalWaves.length; i += 1) {
      waveDiffsMin.push((globalWaves[i]! - globalWaves[i - 1]!) / 60_000_000);
    }

    byBookOut[book] = {
      n_rows: rows.length,
      n_events: eventsSet.size,
      n_unique_timestamps: globalWaves.length,
      intra_series_intervals_minutes: summarizeQuantiles(intraDiffsMin),
      global_wave_intervals_minutes: summarizeQuantiles(waveDiffsMin),
      single_capture_only: intraDiffsMin.length === 0,
    };
  }

  // Emparejar `(eventId, marketCanon, lineKey, selCanon)` recreativas contra sharp (`pinnacle` -> `smarkets`)
  const sharpSeries = new Map<string, { pinnacle: number[]; smarkets: number[] }>();
  for (const p of parsed) {
    if (p.bookCanon !== "pinnacle" && p.bookCanon !== "smarkets") continue;
    const sKey = `${p.eventId}||${p.marketCanon}||${p.lineKey}||${p.selCanon}`;
    let entry = sharpSeries.get(sKey);
    if (!entry) {
      entry = { pinnacle: [], smarkets: [] };
      sharpSeries.set(sKey, entry);
    }
    entry[p.bookCanon].push(p.tsUs);
  }
  for (const entry of sharpSeries.values()) {
    entry.pinnacle.sort((a, b) => a - b);
    entry.smarkets.sort((a, b) => a - b);
  }

  const signedAllMin: number[] = [];
  const causalLagMin: number[] = [];

  for (const p of parsed) {
    if (!RECREATIONAL_BOOKS_SET.has(p.bookCanon)) continue;
    const sKey = `${p.eventId}||${p.marketCanon}||${p.lineKey}||${p.selCanon}`;
    const sh = sharpSeries.get(sKey);
    if (!sh) continue;
    const refList = sh.pinnacle.length > 0 ? sh.pinnacle : sh.smarkets;
    if (refList.length === 0) continue;

    // Timestamps sharp más cercano en valor absoluto (para desfase firmado del lote)
    let bestSignedUs = refList[0]!;
    let bestAbsDiff = Math.abs(p.tsUs - bestSignedUs);
    for (let i = 1; i < refList.length; i += 1) {
      const candUs = refList[i]!;
      const d = Math.abs(p.tsUs - candUs);
      if (d < bestAbsDiff) {
        bestAbsDiff = d;
        bestSignedUs = candUs;
      }
    }
    signedAllMin.push((p.tsUs - bestSignedUs) / 60_000_000);

    // Último timestamp sharp causal `<= p.tsUs`
    let latestCausalUs: number | null = null;
    for (let i = 0; i < refList.length; i += 1) {
      const candUs = refList[i]!;
      if (candUs <= p.tsUs) {
        latestCausalUs = candUs;
      } else {
        break;
      }
    }
    if (latestCausalUs !== null) {
      causalLagMin.push((p.tsUs - latestCausalUs) / 60_000_000);
    }
  }

  return {
    n_rows: parsed.length,
    by_book: byBookOut,
    paired_recreational_vs_sharp: {
      n_all_pairs: signedAllMin.length,
      n_causal_pairs: causalLagMin.length,
      signed_lag_all_minutes: summarizeQuantiles(signedAllMin),
      causal_lag_minutes: summarizeQuantiles(causalLagMin),
    },
  };
}

/**
 * Factor de supervivencia por muestreo uniforme `E_{u ~ U(0, Δt)}[exp(-λ u)] = (1 - exp(-λ Δt)) / (λ Δt)`
 * con expansión de Taylor exacta para `x = λ Δt < 1e-6` (cero cancelación catastrófica).
 */
export function computePollingSurvivalFactor(pollingIntervalMinutes: number, decayRatePerMin: number): number {
  if (!Number.isFinite(pollingIntervalMinutes) || pollingIntervalMinutes < 0) {
    throw new StaleLineConfigValidationError(
      `pollingIntervalMinutes inválido: ${String(pollingIntervalMinutes)}`,
    );
  }
  if (!Number.isFinite(decayRatePerMin) || decayRatePerMin < 0) {
    throw new StaleLineConfigValidationError(`decayRatePerMin inválido: ${String(decayRatePerMin)}`);
  }
  const x = decayRatePerMin * pollingIntervalMinutes;
  if (x < 1e-6) {
    return 1.0 - x / 2.0 + (x * x) / 6.0 - (x * x * x) / 24.0;
  }
  return (1.0 - Math.exp(-x)) / x;
}

/**
 * Fracción esperada de edge inicial que sobrevive tras el muestreo de periodo `Δt` y el
 * retardo operativo de ejecución `d_exec`:
 *   `η(Δt) = exp(-λ_eff * d_exec) * (1 - exp(-λ_eff * Δt)) / (λ_eff * Δt)`.
 */
export function computeExpectedEdgeSurvival(
  pollingIntervalMinutes: number,
  effectiveDecayRatePerMin: number,
  executionDelayMinutes: number,
): number {
  if (!Number.isFinite(executionDelayMinutes) || executionDelayMinutes < 0) {
    throw new StaleLineConfigValidationError(
      `executionDelayMinutes inválido: ${String(executionDelayMinutes)}`,
    );
  }
  return (
    Math.exp(-effectiveDecayRatePerMin * executionDelayMinutes) *
    computePollingSurvivalFactor(pollingIntervalMinutes, effectiveDecayRatePerMin)
  );
}

/**
 * Resuelve por bisección determinista (120 pasos) la raíz adimensional `x* > 0` de:
 *   `(1 - exp(-x*)) / x* = 1 - maxPollingDecayFraction`.
 */
export function solveDimensionlessPollingDecayProduct(maxPollingDecayFraction: number): number {
  if (
    !Number.isFinite(maxPollingDecayFraction) ||
    maxPollingDecayFraction <= 0 ||
    maxPollingDecayFraction >= 0.9
  ) {
    throw new StaleLineConfigValidationError(
      `maxPollingDecayFraction debe estar en (0, 0.9): ${String(maxPollingDecayFraction)}`,
    );
  }
  const targetSurvival = 1.0 - maxPollingDecayFraction;
  let lo = 1e-9;
  let hi = 50.0;
  for (let iter = 0; iter < 120; iter += 1) {
    const mid = 0.5 * (lo + hi);
    const s = mid < 1e-6 ? 1.0 - mid / 2.0 + (mid * mid) / 6.0 - (mid * mid * mid) / 24.0 : (1.0 - Math.exp(-mid)) / mid;
    if (s > targetSurvival) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return 0.5 * (lo + hi);
}

/**
 * Deriva matemáticamente la frecuencia recomendada de scraping por horizonte pre-partido
 * exclusivamente a partir de cantidades medidas en `odds_snapshots` y parámetros contractuales:
 *   - `μ_sharp,ref = -ln(1 - p_move) / G_sharp`
 *   - `μ_sharp(H)  = μ_sharp,ref * (H_ref / H)^γ`
 *   - `λ_rec(H)    = -ln(1 - β_conv) / H`
 *   - `λ_eff(H)    = μ_sharp(H) + λ_rec(H)`, `τ_window(H) = 1 / λ_eff(H)`
 *   - `Δt*(H)      = min(x* / λ_eff(H), 0.5 * τ_window(H), 0.25 * H)`
 * Paridad numérica `< 1e-12` con `derive_recommended_scraping_cadence` en Python.
 */
export function deriveRecommendedScrapingCadence(
  params: ScrapingCadenceFormulaInput,
): RecommendedScrapingCadenceResult {
  if (!Number.isFinite(params.sharp_live_gap_median_minutes) || params.sharp_live_gap_median_minutes <= 0) {
    throw new StaleLineConfigValidationError(
      `sharp_live_gap_median_minutes inválido: ${String(params.sharp_live_gap_median_minutes)}`,
    );
  }
  if (
    !Number.isFinite(params.sharp_live_move_fraction) ||
    params.sharp_live_move_fraction <= 0 ||
    params.sharp_live_move_fraction >= 1
  ) {
    throw new StaleLineConfigValidationError(
      `sharp_live_move_fraction debe estar en (0, 1): ${String(params.sharp_live_move_fraction)}`,
    );
  }
  if (!Number.isFinite(params.sharp_reference_horizon_minutes) || params.sharp_reference_horizon_minutes <= 0) {
    throw new StaleLineConfigValidationError(
      `sharp_reference_horizon_minutes inválido: ${String(params.sharp_reference_horizon_minutes)}`,
    );
  }
  if (
    !Number.isFinite(params.horizon_acceleration_exponent) ||
    params.horizon_acceleration_exponent < 0 ||
    params.horizon_acceleration_exponent > 1
  ) {
    throw new StaleLineConfigValidationError(
      `horizon_acceleration_exponent debe estar en [0, 1]: ${String(params.horizon_acceleration_exponent)}`,
    );
  }
  if (
    !Number.isFinite(params.recreational_convergence_beta) ||
    params.recreational_convergence_beta <= 0 ||
    params.recreational_convergence_beta >= 1
  ) {
    throw new StaleLineConfigValidationError(
      `recreational_convergence_beta debe estar en (0, 1): ${String(params.recreational_convergence_beta)}`,
    );
  }
  if (!Number.isFinite(params.execution_delay_minutes) || params.execution_delay_minutes < 0) {
    throw new StaleLineConfigValidationError(
      `execution_delay_minutes inválido: ${String(params.execution_delay_minutes)}`,
    );
  }
  if (!Array.isArray(params.regimes) || params.regimes.length === 0) {
    throw new StaleLineConfigValidationError("Se requiere al menos un régimen en deriveRecommendedScrapingCadence.");
  }

  const pMoveClamped = clamp(params.sharp_live_move_fraction, 1e-6, 0.999999);
  const betaClamped = clamp(params.recreational_convergence_beta, 1e-6, 0.999999);
  const baseSharpHazard = -Math.log(1.0 - pMoveClamped) / params.sharp_live_gap_median_minutes;
  const baseSharpInterMove = 1.0 / baseSharpHazard;
  const xStar = solveDimensionlessPollingDecayProduct(params.max_polling_decay_fraction);
  const negLogOneMinusBeta = -Math.log(1.0 - betaClamped);

  const regimeResults: ScrapingCadenceRegimeResult[] = [];

  for (const reg of params.regimes) {
    if (!Number.isFinite(reg.horizon_minutes) || reg.horizon_minutes <= 0) {
      throw new StaleLineConfigValidationError(
        `horizon_minutes inválido en régimen '${reg.regime_id}': ${String(reg.horizon_minutes)}`,
      );
    }
    const H = reg.horizon_minutes;
    const muSharpH =
      baseSharpHazard * Math.pow(params.sharp_reference_horizon_minutes / H, params.horizon_acceleration_exponent);
    const lambdaRecH = negLogOneMinusBeta / H;
    const lambdaEffH = muSharpH + lambdaRecH;
    const tauWindowH = 1.0 / lambdaEffH;
    const halfLifeH = Math.LN2 / lambdaEffH;

    const dtDecay = xStar / lambdaEffH;
    const dtNyquist = 0.5 * tauWindowH;
    const dtHorizon = 0.25 * H;

    let dtStar = dtDecay;
    let binding: "edge_decay_budget" | "nyquist_half_window" | "horizon_observability" = "edge_decay_budget";
    if (dtNyquist < dtStar) {
      dtStar = dtNyquist;
      binding = "nyquist_half_window";
    }
    if (dtHorizon < dtStar) {
      dtStar = dtHorizon;
      binding = "horizon_observability";
    }

    const pollSurvRec = computePollingSurvivalFactor(dtStar, lambdaEffH);
    const totalSurvRec = computeExpectedEdgeSurvival(dtStar, lambdaEffH, params.execution_delay_minutes);
    const totalSurvCurr = computeExpectedEdgeSurvival(
      params.sharp_live_gap_median_minutes,
      lambdaEffH,
      params.execution_delay_minutes,
    );

    regimeResults.push({
      regime_id: reg.regime_id,
      description: reg.description,
      horizon_minutes: H,
      horizon_hours: H / 60.0,
      sharp_move_hazard_per_min: muSharpH,
      mean_sharp_inter_move_minutes: 1.0 / muSharpH,
      recreational_convergence_rate_per_min: lambdaRecH,
      effective_decay_rate_per_min: lambdaEffH,
      mean_stale_window_minutes: tauWindowH,
      stale_edge_half_life_minutes: halfLifeH,
      decay_bound_minutes: dtDecay,
      nyquist_bound_minutes: dtNyquist,
      horizon_observability_bound_minutes: dtHorizon,
      recommended_interval_minutes: dtStar,
      recommended_interval_seconds: dtStar * 60.0,
      binding_constraint: binding,
      polling_survival_factor_at_recommended: pollSurvRec,
      expected_edge_survival_at_recommended: totalSurvRec,
      expected_edge_survival_at_current_sharp_gap: totalSurvCurr,
      absolute_survival_gain_vs_current_gap: totalSurvRec - totalSurvCurr,
    });
  }

  return {
    formula_name: "exponential_stale_window_nyquist_v1",
    equation_summary:
      "λ_eff(H) = [-ln(1 - p_move)/G_sharp]*(H_ref/H)^γ + [-ln(1 - β_conv)/H]; (1 - exp(-x*))/x* = 1 - α_poll; Δt*(H) = min(x*/λ_eff(H), 0.5/λ_eff(H), 0.25*H); η(Δt,H) = exp(-λ_eff(H)*d_exec)*(1 - exp(-λ_eff(H)*Δt))/(λ_eff(H)*Δt)",
    inputs: {
      sharp_live_gap_median_minutes: params.sharp_live_gap_median_minutes,
      sharp_live_move_fraction: params.sharp_live_move_fraction,
      sharp_reference_horizon_minutes: params.sharp_reference_horizon_minutes,
      horizon_acceleration_exponent: params.horizon_acceleration_exponent,
      recreational_convergence_beta: params.recreational_convergence_beta,
      execution_delay_minutes: params.execution_delay_minutes,
      max_polling_decay_fraction: params.max_polling_decay_fraction,
    },
    base_sharp_move_hazard_per_min: baseSharpHazard,
    base_sharp_mean_inter_move_minutes: baseSharpInterMove,
    solved_dimensionless_decay_product_x: xStar,
    regimes: regimeResults,
  };
}
