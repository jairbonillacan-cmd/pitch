/**
 * A28 (Ola 2 · Agente A4) — Combinación modelo-mercado en espacio logit (`p_final`),
 * comparación walk-forward de métodos de eliminación de margen (`proportional`, `power`, `shin`),
 * contracción empírica de `w` por tamaño muestral y apagado automático de segmentos sin ventaja
 * real del modelo (Regla Rectora #4).
 *
 * Paridad numérica estricta con `services/models/blend_calibration.py`:
 *   - De-vig 3 vías (`1x2`) y 2 vías (`moneyline`, `ah`, `ou`/`totals`, `btts`, `dnb`, `spread`): `|Δ| < 1e-9`
 *     (reutilizando íntegramente `src/domain/prediction/devig.ts`).
 *   - Mezcla en espacio logit (`blendLogit2Way`, `blendLogit3Way`, `blendLogitProbs`): `|Δ| < 1e-12`.
 *   - Bootstrap pareado determinista (`mulberry32` + cuantiles lineales Type-7): `|Δ| < 1e-12`.
 *
 * Todas las funciones son puras, deterministas y libres de efectos secundarios.
 */

import {
  devig2Way,
  devigPower,
  devigProportional,
  devigShin,
  InvalidOddsError,
  MAX_OVERROUND,
  MIN_OVERROUND,
  overround,
} from "./devig";
import { createMulberry32, quantileLinearSorted } from "./clv";

export { InvalidOddsError };

/** Versión de esquema del artefacto congelado `blend_weights_v3_1.json`. */
export const BLEND_SCHEMA_VERSION = "blend_weights_v3.1.0";

/** Recorte simétrico obligatorio de probabilidades antes de aplicar `logit(p)` (`[1e-6, 1 - 1e-6]`). */
export const PROB_CLIP_EPS = 1e-6;

/** Constante de contracción empírica hacia `w = 0.0` (mercado puro) en muestras pequeñas. */
export const DEFAULT_N0_SHRINKAGE = 300;

/** Paso de cuantización de la rejilla `w ∈ {0.00, 0.05, ..., 1.00}`. */
export const BLEND_WEIGHT_STEP = 0.05;

/** Umbral máximo `w_effective <= 0.05` (`w ≈ 0`) bajo el cual se apagan picks de modelo (Regla Rectora #4). */
export const MAX_DISABLED_WEIGHT_THRESHOLD = 0.05;

/** Mínimo de eventos pareados con cierre sharp (Pinnacle) para validar ventaja de modelo en el segmento. */
export const MIN_PAIRED_CLOSING_FOR_ENABLEMENT = 100;

/** Tolerancia mínima de mejora estricta en log-loss frente a `w = 0` (`p_mercado_sin_margen`). */
export const MIN_LOG_LOSS_IMPROVEMENT_TOL = 1e-6;

/** Los 3 métodos puros de eliminación de margen evaluados en walk-forward por el contrato A4. */
export const CORE_DEVIG_METHODS = ["proportional", "power", "shin"] as const;

/** Rejilla canónica de 21 puntos `[0.00, 0.05, 0.10, ..., 1.00]`. */
export const BLEND_WEIGHT_GRID: readonly number[] = Object.freeze(
  Array.from({ length: 21 }, (_, idx) => Number((idx * 0.05).toFixed(2))),
);

export type CoreDevigMethod = (typeof CORE_DEVIG_METHODS)[number];

export type SupportedBlendMarket =
  | "1x2"
  | "moneyline"
  | "ah"
  | "ou"
  | "totals"
  | "btts"
  | "dnb"
  | "spread";

export type BlendSignificanceLabel = "significativa" | "no significativa";

/** Error de validación de entradas en mezcla logit, de-vig o política de segmento. */
export class BlendValidationError extends Error {
  readonly code = "blend_validation_error" as const;

  constructor(message: string) {
    super(message);
    this.name = "BlendValidationError";
  }
}

/** Métricas fuera de muestra de un método de de-vig frente al resultado real liquidado. */
export interface DevigMethodMetrics {
  readonly log_loss: number | null;
  readonly log_loss_ci95: readonly [number, number] | null;
  readonly brier: number | null;
  readonly delta_log_loss_vs_proportional: number | null;
  readonly delta_vs_proportional_ci95: readonly [number, number] | null;
  readonly significant_vs_proportional: boolean;
  readonly significance_vs_proportional: BlendSignificanceLabel;
}

/** Resumen comparativo walk-forward de `proportional`, `power` y `shin` en un segmento `league × market`. */
export interface DevigComparisonSummary {
  readonly n_events_evaluated: number;
  readonly best_method: CoreDevigMethod;
  readonly walk_forward_causal_log_loss: number | null;
  readonly best_vs_proportional_delta_log_loss: number | null;
  readonly best_vs_proportional_ci95: readonly [number, number] | null;
  readonly best_vs_proportional_significant: boolean;
  readonly best_vs_proportional_significance: BlendSignificanceLabel;
  readonly proportional: DevigMethodMetrics;
  readonly power: DevigMethodMetrics;
  readonly shin: DevigMethodMetrics;
}

/** Entrada por segmento `"{league}::{market}"` en `blend_weights_v3_1.json` (Contrato A4 → A5). */
export interface BlendSegmentEntry {
  readonly league: string;
  readonly market: string;
  readonly sport?: string;
  readonly n_events_dev: number;
  readonly n_events_oos_evaluated?: number;
  readonly n_events_paired_closing: number;
  readonly closing_benchmark_available: boolean;
  readonly open_quotes_available?: boolean;
  readonly best_devig_method: CoreDevigMethod;
  readonly devig_comparison: DevigComparisonSummary;
  readonly w_raw_opt: number;
  readonly w_shrunk_raw?: number;
  readonly w_effective: number;
  readonly log_loss_model: number | null;
  readonly log_loss_market_open_novig: number | null;
  readonly log_loss_blend: number | null;
  readonly log_loss_blend_wf_causal?: number | null;
  readonly log_loss_closing_novig: number | null;
  readonly log_loss_model_paired_closing?: number | null;
  readonly log_loss_blend_paired_closing?: number | null;
  readonly delta_model_vs_closing?: number | null;
  readonly delta_model_vs_closing_ci95?: readonly [number, number] | null;
  readonly delta_blend_vs_closing: number | null;
  readonly delta_blend_vs_closing_ci95: readonly [number, number] | null;
  readonly delta_blend_vs_closing_significant: boolean;
  readonly delta_blend_vs_closing_significance?: BlendSignificanceLabel;
  readonly delta_blend_vs_open_novig: number | null;
  readonly delta_blend_vs_open_novig_ci95: readonly [number, number] | null;
  readonly delta_blend_vs_open_novig_significant?: boolean;
  readonly delta_blend_vs_open_novig_significance?: BlendSignificanceLabel;
  readonly model_picks_enabled: boolean;
  readonly disabled_reason: string | null;
}

/** Resumen global agregado en `blend_weights_v3_1.json`. */
export interface BlendGlobalSummary {
  readonly n_segments_total: number;
  readonly n_segments_enabled: number;
  readonly n_segments_disabled: number;
  readonly enabled_segments: readonly string[];
  readonly disabled_reasons_count: Readonly<Record<string, number>>;
  readonly n_events_primary_dev: number;
  readonly n_events_all_segment_evals: number;
  readonly n_events_paired_closing_total: number;
  readonly primary_1x2_and_ml?: Readonly<Record<string, unknown>>;
}

/** Esquema raíz de `blend_weights_v3_1.json`. */
export interface BlendWeightsArtifact {
  readonly schema_version: string;
  readonly generated_at_utc: string;
  readonly reproduction_command: string;
  readonly holdout_sealed_untouched: boolean;
  readonly n0_shrinkage: number;
  readonly w_grid_step?: number;
  readonly prob_clip_eps?: number;
  readonly min_paired_closing_for_enablement?: number;
  readonly bootstrap_resamples?: number;
  readonly bootstrap_seed?: number;
  readonly split_summary?: Readonly<Record<string, unknown>>;
  readonly global_summary: BlendGlobalSummary;
  readonly segments: Readonly<Record<string, BlendSegmentEntry>>;
}

/** Parámetros para evaluar la Regla Rectora #4 sobre un segmento. */
export interface ModelPicksGateInput {
  readonly w_effective: number;
  readonly closing_benchmark_available: boolean;
  readonly n_events_paired_closing: number;
  readonly log_loss_blend: number | null;
  readonly log_loss_market_open_novig: number | null;
  readonly log_loss_blend_wf_causal?: number | null;
  readonly min_paired_closing?: number;
  readonly max_disabled_weight?: number;
  readonly min_ll_improvement?: number;
}

/** Resultado determinista de la Regla Rectora #4. */
export interface ModelPicksGateResult {
  readonly model_picks_enabled: boolean;
  readonly disabled_reason: string | null;
}

/** Entrada de alto nivel para que `a5-picks` obtenga `p_final`, de-vig y estado del segmento. */
export interface ComputeSegmentBlendInput {
  readonly artifact: BlendWeightsArtifact;
  readonly league: string;
  readonly market: string;
  readonly modelProbs: readonly number[] | Readonly<Record<string, number>>;
  /** Probabilidades de mercado ya sin margen o cuotas decimales brutas a desvigorizar con `best_devig_method`. */
  readonly marketNoVigProbs?: readonly number[] | Readonly<Record<string, number>>;
  readonly marketRawOdds?: readonly number[] | Readonly<Record<string, number>>;
  /** Permite sobrescribir `w` o `devigMethod` en simulaciones/tests manteniendo validación. */
  readonly overrideWeight?: number;
  readonly overrideDevigMethod?: CoreDevigMethod;
}

/** Salida enriquecida de combinación modelo-mercado lista para `a5-picks`. */
export interface ComputeSegmentBlendResult {
  readonly segment_key: string;
  readonly segment_found: boolean;
  readonly league: string;
  readonly market: SupportedBlendMarket;
  readonly selections: readonly string[];
  readonly devig_method: CoreDevigMethod;
  readonly w_effective: number;
  readonly p_model: readonly number[];
  readonly p_market_novig: readonly number[];
  readonly p_final: readonly number[];
  readonly probabilities_by_selection: Readonly<Record<string, number>>;
  readonly model_probs_by_selection: Readonly<Record<string, number>>;
  readonly market_novig_by_selection: Readonly<Record<string, number>>;
  readonly model_picks_enabled: boolean;
  readonly disabled_reason: string | null;
}

// ---------------------------------------------------------------------------
// Normalización de mercados y selecciones (3 vías y 2 vías)
// ---------------------------------------------------------------------------

const MARKET_CANONICAL_ALIASES: Readonly<Record<string, SupportedBlendMarket>> = {
  "1x2": "1x2",
  h2h_3way: "1x2",
  match_odds: "1x2",
  "3way": "1x2",
  moneyline: "moneyline",
  ml: "moneyline",
  h2h: "moneyline",
  h2h_2way: "moneyline",
  "2way": "moneyline",
  ah: "ah",
  asian_handicap: "ah",
  ou: "ou",
  totals: "totals",
  total: "totals",
  over_under: "totals",
  ou_2_5: "totals",
  btts: "btts",
  both_teams_to_score: "btts",
  dnb: "dnb",
  draw_no_bet: "dnb",
  spread: "spread",
  point_spread: "spread",
  handicap: "spread",
};

const MARKET_SELECTIONS_MAP: Readonly<Record<SupportedBlendMarket, readonly string[]>> = {
  "1x2": ["home", "draw", "away"],
  moneyline: ["home", "away"],
  ah: ["home", "away"],
  spread: ["home", "away"],
  dnb: ["home", "away"],
  totals: ["over", "under"],
  ou: ["over", "under"],
  btts: ["yes", "no"],
};

/** Normaliza el identificador de mercado soportando `1x2`, `moneyline`, `ah`, `ou`, `totals`, `btts`, `dnb` y `spread`. */
export function canonicalizeBlendMarket(market: string): SupportedBlendMarket {
  if (typeof market !== "string" || market.trim().length === 0) {
    throw new BlendValidationError(`mercado inválido o vacío: ${String(market)}`);
  }
  const key = market.trim().toLowerCase();
  const mapped = MARKET_CANONICAL_ALIASES[key];
  if (!mapped) {
    throw new BlendValidationError(`mercado no soportado en blend/de-vig: "${market}"`);
  }
  return mapped;
}

/** Clave de segmento canónica en artefactos (`"ou"` se resuelve contra `"totals"` cuando corresponde). */
export function normalizeArtifactMarketKey(market: string): SupportedBlendMarket {
  const canon = canonicalizeBlendMarket(market);
  return canon === "ou" ? "totals" : canon;
}

/** Construye la llave `"league::market"` usada en `blend_weights_v3_1.json`. */
export function formatSegmentKey(league: string, market: string): string {
  if (typeof league !== "string" || league.trim().length === 0) {
    throw new BlendValidationError("league no puede ser vacío");
  }
  return `${league.trim()}::${normalizeArtifactMarketKey(market)}`;
}

/** Indica si el mercado es de 3 vías (`1x2`) o 2 vías (binario). */
export function isThreeWayMarket(market: string): boolean {
  return canonicalizeBlendMarket(market) === "1x2";
}

/** Devuelve el orden canónico de selecciones del mercado (`["home","draw","away"]`, `["home","away"]`, `["over","under"]`, `["yes","no"]`). */
export function getMarketSelections(market: string): readonly string[] {
  const canon = canonicalizeBlendMarket(market);
  return MARKET_SELECTIONS_MAP[canon];
}

function assertCoreDevigMethod(method: string): asserts method is CoreDevigMethod {
  if (method !== "proportional" && method !== "power" && method !== "shin") {
    throw new BlendValidationError(
      `método de de-vig inválido "${String(method)}"; se esperaba proportional | power | shin`,
    );
  }
}

// ---------------------------------------------------------------------------
// De-vig 3 vías y 2 vías reutilizando `src/domain/prediction/devig.ts`
// ---------------------------------------------------------------------------

/**
 * Elimina el margen de un mercado de 3 vías (`1x2`) delegando en `devigProportional`,
 * `devigPower` o `devigShin` de `src/domain/prediction/devig.ts`.
 */
export function devig3WayOdds(
  odds: readonly number[],
  method: CoreDevigMethod,
  tolerance = 1e-12,
): readonly [number, number, number] {
  assertCoreDevigMethod(method);
  let res: number[];
  if (method === "proportional") {
    res = devigProportional(odds);
  } else if (method === "power") {
    res = devigPower(odds, tolerance);
  } else {
    res = devigShin(odds, tolerance);
  }
  return [res[0]!, res[1]!, res[2]!];
}

/**
 * Elimina el margen de un mercado binario de 2 vías (`moneyline`, `ah`, `ou`/`totals`, `btts`, `dnb`, `spread`)
 * delegando en `devig2Way` de `src/domain/prediction/devig.ts`.
 */
export function devig2WayOdds(
  oddsPrimary: number,
  oddsOpposite: number,
  method: CoreDevigMethod,
  tolerance = 1e-12,
): readonly [number, number] {
  assertCoreDevigMethod(method);
  const res = devig2Way(oddsPrimary, oddsOpposite, method, { tolerance });
  return [res.pHome, res.pAway];
}

function extractOrderedValues(
  input: readonly number[] | Readonly<Record<string, number>>,
  market: string,
  label: string,
): number[] {
  const sels = getMarketSelections(market);
  if (Array.isArray(input)) {
    if (input.length !== sels.length) {
      throw new BlendValidationError(
        `${label}: se esperaban ${sels.length} valores para mercado "${market}", recibido ${input.length}`,
      );
    }
    return input.map((v) => Number(v));
  }
  if (input !== null && typeof input === "object") {
    const rec = input as Readonly<Record<string, number>>;
    return sels.map((sel) => {
      const val = rec[sel];
      if (val === undefined) {
        throw new BlendValidationError(`${label}: falta la selección "${sel}" para mercado "${market}"`);
      }
      return Number(val);
    });
  }
  throw new BlendValidationError(`${label}: formato de entrada inválido`);
}

/**
 * Desvigoriza cuotas decimales en cualquier mercado soportado de 3 vías (`1x2`) o 2 vías
 * (`moneyline`, `ah`, `ou`, `totals`, `btts`, `dnb`, `spread`), aceptando arreglo ordenado o mapa por selección.
 */
export function devigMarketOdds(
  odds: readonly number[] | Readonly<Record<string, number>>,
  market: string,
  method: CoreDevigMethod = "power",
  tolerance = 1e-12,
): number[] {
  assertCoreDevigMethod(method);
  const canon = canonicalizeBlendMarket(market);
  const orderedOdds = extractOrderedValues(odds, canon, "odds");
  if (canon === "1x2") {
    const [p0, p1, p2] = devig3WayOdds(orderedOdds, method, tolerance);
    return [p0, p1, p2];
  }
  const [p0, p1] = devig2WayOdds(orderedOdds[0]!, orderedOdds[1]!, method, tolerance);
  return [p0, p1];
}

/** Verifica si un vector de cuotas cumple el rango de plausibilidad de overround `[MIN_OVERROUND, MAX_OVERROUND]`. */
export function isPlausibleMarketOverround(odds: readonly number[]): boolean {
  try {
    if (odds.length !== 2 && odds.length !== 3) return false;
    for (let i = 0; i < odds.length; i += 1) {
      const o = odds[i];
      if (o === undefined || !Number.isFinite(o) || o <= 1) return false;
    }
    const sumImplied = overround(odds) + 1;
    return sumImplied >= MIN_OVERROUND && sumImplied <= MAX_OVERROUND;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Mezcla en espacio logit (`p_final`) con paridad exacta TS ↔ Python (`|Δ| < 1e-12`)
// ---------------------------------------------------------------------------

/** Recorta una probabilidad escalar finita al intervalo cerrado `[eps, 1 - eps]` (`eps = 1e-6`). */
export function clipProbability(p: number, eps = PROB_CLIP_EPS): number {
  if (typeof p !== "number" || !Number.isFinite(p)) {
    throw new BlendValidationError(`probabilidad no finita: ${String(p)}`);
  }
  if (!(eps > 0 && eps < 0.5)) {
    throw new BlendValidationError(`eps de recorte inválido: ${String(eps)}`);
  }
  return Math.min(1 - eps, Math.max(eps, p));
}

/** Calcula `logit(clip(p, eps, 1 - eps)) = ln(pc) - ln(1 - pc)` con simetría exacta `logit(1 - pc) = -logit(pc)`. */
export function logitClipped(p: number, eps = PROB_CLIP_EPS): number {
  const pc = clipProbability(p, eps);
  return Math.log(pc) - Math.log(1 - pc);
}

/** Función logística numéricamente estable `σ(z) = 1 / (1 + exp(-z))`. */
export function sigmoid(z: number): number {
  if (typeof z !== "number" || !Number.isFinite(z)) {
    throw new BlendValidationError(`argumento no finito en sigmoid: ${String(z)}`);
  }
  if (z >= 0) {
    const ez = Math.exp(-z);
    return 1 / (1 + ez);
  }
  const ez = Math.exp(z);
  return ez / (1 + ez);
}

function validateBlendWeight(w: number): number {
  if (typeof w !== "number" || !Number.isFinite(w) || w < -1e-12 || w > 1 + 1e-12) {
    throw new BlendValidationError(`peso de mezcla w fuera de [0, 1]: ${String(w)}`);
  }
  if (w <= 0) return 0;
  if (w >= 1) return 1;
  return w;
}

function validateSimplexVector(probs: readonly number[], label: string): readonly number[] {
  if (!Array.isArray(probs) || (probs.length !== 2 && probs.length !== 3)) {
    throw new BlendValidationError(`${label}: se esperaban 2 o 3 probabilidades`);
  }
  let sum = 0;
  for (let i = 0; i < probs.length; i += 1) {
    const v = probs[i];
    if (v === undefined || typeof v !== "number" || !Number.isFinite(v) || v < -1e-9 || v > 1 + 1e-9) {
      throw new BlendValidationError(`${label}[${i}] inválido: ${String(v)}`);
    }
    sum += v;
  }
  if (Math.abs(sum - 1) > 1e-3) {
    throw new BlendValidationError(
      `${label}: las probabilidades deben sumar 1 (suma recibida = ${sum.toFixed(6)})`,
    );
  }
  // Si viene ligeramente desnormalizada (ej. redondeo a 4 decimales), proyectar al símplex; si ya suma ~1, conservar
  if (Math.abs(sum - 1) > 1e-14) {
    return probs.map((v) => Math.max(0, v) / sum);
  }
  return probs;
}

/**
 * Mezcla binaria en espacio logit (2 vías):
 *   `p_final = σ(w · logit(p_modelo) + (1 - w) · logit(p_mercado_sin_margen))`
 * sobre la selección primaria y `1 - p_final` para la opuesta, clipeando entradas a `[1e-6, 1 - 1e-6]`.
 */
export function blendLogit2Way(
  pModelPrimary: number,
  pMarketNoVigPrimary: number,
  w: number,
  eps = PROB_CLIP_EPS,
): readonly [number, number] {
  const weight = validateBlendWeight(w);
  if (!Number.isFinite(pModelPrimary) || pModelPrimary < -1e-9 || pModelPrimary > 1 + 1e-9) {
    throw new BlendValidationError(`pModelPrimary fuera de [0, 1]: ${String(pModelPrimary)}`);
  }
  if (!Number.isFinite(pMarketNoVigPrimary) || pMarketNoVigPrimary < -1e-9 || pMarketNoVigPrimary > 1 + 1e-9) {
    throw new BlendValidationError(`pMarketNoVigPrimary fuera de [0, 1]: ${String(pMarketNoVigPrimary)}`);
  }
  const z = weight * logitClipped(pModelPrimary, eps) + (1 - weight) * logitClipped(pMarketNoVigPrimary, eps);
  const pPrimary = sigmoid(z);
  return [pPrimary, 1 - pPrimary];
}

/**
 * Fórmula unificada de mezcla en espacio logit para 2 y 3 vías:
 *   `u_k = σ(w · logit(p_modelo_k) + (1 - w) · logit(p_mercado_sin_margen_k))`
 *   `p_final_k = u_k / Σ_j u_j`
 *
 * Para `K = 2` con entradas en el símplex `[p, 1 - p]`, `logit(1 - p) = -logit(p)`, por lo que
 * `u_1 = σ(-a_0) = 1 - σ(a_0)` y `u_0 / (u_0 + u_1) === σ(a_0)` exactamente sin discontinuidad.
 */
export function blendLogitProbs(
  modelProbs: readonly number[],
  marketNoVigProbs: readonly number[],
  w: number,
  eps = PROB_CLIP_EPS,
): number[] {
  const weight = validateBlendWeight(w);
  const pMod = validateSimplexVector(modelProbs, "modelProbs");
  const pMkt = validateSimplexVector(marketNoVigProbs, "marketNoVigProbs");
  if (pMod.length !== pMkt.length) {
    throw new BlendValidationError(
      `dimensiones incompatibles en blendLogitProbs: model=${pMod.length}, market=${pMkt.length}`,
    );
  }

  const u = new Array<number>(pMod.length);
  let sumU = 0;
  for (let k = 0; k < pMod.length; k += 1) {
    const ak = weight * logitClipped(pMod[k]!, eps) + (1 - weight) * logitClipped(pMkt[k]!, eps);
    const uk = sigmoid(ak);
    u[k] = uk;
    sumU += uk;
  }
  return u.map((uk) => uk / sumU);
}

/**
 * Mezcla multiclase de 3 vías (`1x2`) componente a componente `u_k = σ(w · logit(p_m_k) + (1 - w) · logit(p_mkt_k))`
 * renormalizada en el símplex `p_final_k = u_k / (u_0 + u_1 + u_2)`.
 */
export function blendLogit3Way(
  modelProbs: readonly number[],
  marketNoVigProbs: readonly number[],
  w: number,
  eps = PROB_CLIP_EPS,
): readonly [number, number, number] {
  if (modelProbs.length !== 3 || marketNoVigProbs.length !== 3) {
    throw new BlendValidationError("blendLogit3Way requiere vectores de longitud 3 (home, draw, away)");
  }
  const res = blendLogitProbs(modelProbs, marketNoVigProbs, w, eps);
  return [res[0]!, res[1]!, res[2]!];
}

// ---------------------------------------------------------------------------
// Contracción empírica (`n0_shrinkage = 300`), cuantización y Regla Rectora #4
// ---------------------------------------------------------------------------

/**
 * Redondea un peso `w ∈ [0, 1]` al paso `step` (`0.05` por defecto) con desempate determinista
 * `floor(x / step + 0.5 + 1e-12)` idéntico en TypeScript y Python.
 */
export function roundWeightToStep(value: number, step = BLEND_WEIGHT_STEP): number {
  const w = validateBlendWeight(value);
  if (!(step > 0 && step <= 1)) {
    throw new BlendValidationError(`step inválido en roundWeightToStep: ${String(step)}`);
  }
  const stepsCount = Math.floor(w / step + 0.5 + 1e-12);
  const rounded = Math.min(1, Math.max(0, stepsCount * step));
  return Number(rounded.toFixed(6));
}

/**
 * Contracción empírica hacia `0.0` (mercado puro) cuando hay pocos datos fuera de muestra:
 *   `w_shrunk_raw = w_oof_opt * (n_oos / (n_oos + n0_shrinkage))`
 * y redondeo determinista al paso `roundStep` (`0.05` por defecto).
 */
export function shrinkBlendWeight(
  wOofOpt: number,
  nOos: number,
  n0Shrinkage = DEFAULT_N0_SHRINKAGE,
  roundStep: number | null = BLEND_WEIGHT_STEP,
): { readonly w_shrunk_raw: number; readonly w_effective: number } {
  const wOpt = validateBlendWeight(wOofOpt);
  if (typeof nOos !== "number" || !Number.isFinite(nOos) || nOos < 0) {
    throw new BlendValidationError(`nOos inválido: ${String(nOos)}`);
  }
  if (typeof n0Shrinkage !== "number" || !Number.isFinite(n0Shrinkage) || n0Shrinkage <= 0) {
    throw new BlendValidationError(`n0Shrinkage inválido: ${String(n0Shrinkage)}`);
  }
  if (nOos === 0 || wOpt === 0) {
    return { w_shrunk_raw: 0, w_effective: 0 };
  }
  const factor = nOos / (nOos + n0Shrinkage);
  const wShrunkRaw = wOpt * factor;
  const wEffective = roundStep !== null ? roundWeightToStep(wShrunkRaw, roundStep) : wShrunkRaw;
  return {
    w_shrunk_raw: wShrunkRaw,
    w_effective: wEffective,
  };
}

/**
 * Evalúa la Regla Rectora #4 (Apagado automático de mercados sin ventaja demostrada del modelo):
 *   1. Si no existe benchmark sharp de cierre suficiente (`!closing_benchmark_available` o `n_paired < min_paired`),
 *      desactiva picks del modelo (`"insufficient_sharp_closing_benchmark"`).
 *   2. Si `w_effective <= 0.05` (`w ≈ 0`), desactiva picks del modelo (`"model_weight_near_zero_w_le_0_05"`).
 *   3. Si `p_final(w_effective)` no supera estrictamente a `w = 0` (`p_mercado_sin_margen`) en log-loss
 *      (incluyendo verificación walk-forward causal si está disponible), desactiva (`"blend_does_not_beat_open_market_novig"`).
 */
export function evaluateModelPicksGate(input: ModelPicksGateInput): ModelPicksGateResult {
  const minPaired = input.min_paired_closing ?? MIN_PAIRED_CLOSING_FOR_ENABLEMENT;
  const maxDisabledW = input.max_disabled_weight ?? MAX_DISABLED_WEIGHT_THRESHOLD;
  const minImp = input.min_ll_improvement ?? MIN_LOG_LOSS_IMPROVEMENT_TOL;

  if (!input.closing_benchmark_available || input.n_events_paired_closing < minPaired) {
    return {
      model_picks_enabled: false,
      disabled_reason: "insufficient_sharp_closing_benchmark",
    };
  }

  if (!Number.isFinite(input.w_effective) || input.w_effective <= maxDisabledW + 1e-12) {
    return {
      model_picks_enabled: false,
      disabled_reason: "model_weight_near_zero_w_le_0_05",
    };
  }

  if (
    input.log_loss_blend === null ||
    input.log_loss_market_open_novig === null ||
    !Number.isFinite(input.log_loss_blend) ||
    !Number.isFinite(input.log_loss_market_open_novig) ||
    !(input.log_loss_blend < input.log_loss_market_open_novig - minImp)
  ) {
    return {
      model_picks_enabled: false,
      disabled_reason: "blend_does_not_beat_open_market_novig",
    };
  }

  if (
    input.log_loss_blend_wf_causal !== undefined &&
    input.log_loss_blend_wf_causal !== null &&
    Number.isFinite(input.log_loss_blend_wf_causal) &&
    !(input.log_loss_blend_wf_causal < input.log_loss_market_open_novig - minImp)
  ) {
    return {
      model_picks_enabled: false,
      disabled_reason: "walk_forward_causal_blend_does_not_beat_open_market_novig",
    };
  }

  return {
    model_picks_enabled: true,
    disabled_reason: null,
  };
}

// ---------------------------------------------------------------------------
// Métricas Log-Loss y Bootstrap pareado determinista (`mulberry32`)
// ---------------------------------------------------------------------------

/** Log-loss categórico de un evento individual `−ln(clip(p[outcomeIdx], 1e-15, 1))`. */
export function categoricalLogLoss(probs: readonly number[], outcomeIndex: number): number {
  if (!Number.isInteger(outcomeIndex) || outcomeIndex < 0 || outcomeIndex >= probs.length) {
    throw new BlendValidationError(
      `outcomeIndex (${String(outcomeIndex)}) fuera de rango para K=${probs.length}`,
    );
  }
  const pNorm = validateSimplexVector(probs, "probs");
  const pChosen = Math.min(1, Math.max(1e-15, pNorm[outcomeIndex]!));
  return -Math.log(pChosen);
}

/**
 * Bootstrap pareado determinista (`mulberry32` + cuantiles lineales Type-7) para diferencias
 * de pérdida `delta_i = lossA_i - lossB_i` (`>= 1000` remuestreos por contrato).
 * Paridad exacta (`|Δ| < 1e-12`) con `bootstrap_paired_loss_delta` en `services/models/blend_calibration.py`.
 */
export function bootstrapPairedLossDelta(
  lossA: readonly number[],
  lossB: readonly number[],
  options?: { readonly nResamples?: number; readonly seed?: number; readonly ciLevel?: number },
): {
  readonly n: number;
  readonly mean_a: number | null;
  readonly mean_b: number | null;
  readonly delta_mean: number | null;
  readonly ci95: readonly [number, number] | null;
  readonly significant: boolean;
  readonly significance_label: BlendSignificanceLabel;
} {
  if (lossA.length !== lossB.length) {
    throw new BlendValidationError(
      `bootstrapPairedLossDelta requiere arreglos de igual longitud (${lossA.length} vs ${lossB.length})`,
    );
  }
  const nResamples = options?.nResamples ?? 1000;
  if (!Number.isInteger(nResamples) || nResamples < 1000) {
    throw new BlendValidationError(`nResamples debe ser un entero >= 1000; recibido ${String(nResamples)}`);
  }
  const seed = options?.seed ?? 42;
  const ciLevel = options?.ciLevel ?? 0.95;
  const n = lossA.length;

  if (n === 0) {
    return {
      n: 0,
      mean_a: null,
      mean_b: null,
      delta_mean: null,
      ci95: null,
      significant: false,
      significance_label: "no significativa",
    };
  }

  const deltas = new Float64Array(n);
  let sumA = 0;
  let sumB = 0;
  let sumD = 0;
  for (let i = 0; i < n; i += 1) {
    const a = lossA[i]!;
    const b = lossB[i]!;
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      throw new BlendValidationError(`valor no finito en bootstrapPairedLossDelta índice ${i}`);
    }
    const d = a - b;
    deltas[i] = d;
    sumA += a;
    sumB += b;
    sumD += d;
  }

  const rng = createMulberry32(seed);
  const bootMeans = new Float64Array(nResamples);
  for (let r = 0; r < nResamples; r += 1) {
    let acc = 0;
    for (let i = 0; i < n; i += 1) {
      const idx = Math.floor(rng() * n);
      acc += deltas[idx]!;
    }
    bootMeans[r] = acc / n;
  }
  bootMeans.sort();

  const alphaHalf = (1 - ciLevel) / 2;
  const lo = quantileLinearSorted(bootMeans, alphaHalf);
  const hi = quantileLinearSorted(bootMeans, 1 - alphaHalf);
  const significant = lo > 0 || hi < 0;

  return {
    n,
    mean_a: sumA / n,
    mean_b: sumB / n,
    delta_mean: sumD / n,
    ci95: [lo, hi],
    significant,
    significance_label: significant ? "significativa" : "no significativa",
  };
}

// ---------------------------------------------------------------------------
// Consumo limpio de `blend_weights_v3_1.json` para `a5-picks`
// ---------------------------------------------------------------------------

/**
 * Resuelve la política calibrada de un segmento `league::market` desde `blend_weights_v3_1.json`.
 * Si el segmento no fue observado en `walk_forward_dev`, retorna un fallback seguro con
 * `w_effective = 0.0`, `best_devig_method = "power"` y `model_picks_enabled = false`.
 */
export function resolveBlendSegment(
  artifact: BlendWeightsArtifact,
  league: string,
  market: string,
): { readonly key: string; readonly found: boolean; readonly entry: BlendSegmentEntry } {
  const normMarket = normalizeArtifactMarketKey(market);
  const exactKey = `${league.trim()}::${normMarket}`;
  const direct = artifact.segments[exactKey];
  if (direct !== undefined) {
    return { key: exactKey, found: true, entry: direct };
  }

  const upperKey = `${league.trim().toUpperCase()}::${normMarket}`;
  const upperHit = artifact.segments[upperKey];
  if (upperHit !== undefined) {
    return { key: upperKey, found: true, entry: upperHit };
  }

  const emptyMetrics: DevigMethodMetrics = {
    log_loss: null,
    log_loss_ci95: null,
    brier: null,
    delta_log_loss_vs_proportional: null,
    delta_vs_proportional_ci95: null,
    significant_vs_proportional: false,
    significance_vs_proportional: "no significativa",
  };

  return {
    key: exactKey,
    found: false,
    entry: {
      league: league.trim(),
      market: normMarket,
      n_events_dev: 0,
      n_events_paired_closing: 0,
      closing_benchmark_available: false,
      best_devig_method: "power",
      devig_comparison: {
        n_events_evaluated: 0,
        best_method: "power",
        walk_forward_causal_log_loss: null,
        best_vs_proportional_delta_log_loss: null,
        best_vs_proportional_ci95: null,
        best_vs_proportional_significant: false,
        best_vs_proportional_significance: "no significativa",
        proportional: emptyMetrics,
        power: emptyMetrics,
        shin: emptyMetrics,
      },
      w_raw_opt: 0,
      w_shrunk_raw: 0,
      w_effective: 0,
      log_loss_model: null,
      log_loss_market_open_novig: null,
      log_loss_blend: null,
      log_loss_closing_novig: null,
      delta_blend_vs_closing: null,
      delta_blend_vs_closing_ci95: null,
      delta_blend_vs_closing_significant: false,
      delta_blend_vs_open_novig: null,
      delta_blend_vs_open_novig_ci95: null,
      model_picks_enabled: false,
      disabled_reason: "unseen_segment_in_walk_forward_dev",
    },
  };
}

/**
 * Calcula de principio a fin `p_mercado_sin_margen` (vía el `best_devig_method` calibrado del segmento)
 * y `p_final` en espacio logit (vía `w_effective`), devolviendo además la bandera `model_picks_enabled`
 * y `disabled_reason` lista para la puerta de segmento en `src/domain/prediction/picks.ts` (`a5-picks`).
 */
export function computeSegmentBlendedProbs(input: ComputeSegmentBlendInput): ComputeSegmentBlendResult {
  const canonMarket = canonicalizeBlendMarket(input.market);
  const selections = getMarketSelections(canonMarket);
  const resolved = resolveBlendSegment(input.artifact, input.league, canonMarket);
  const seg = resolved.entry;

  const devigMethod: CoreDevigMethod = input.overrideDevigMethod ?? seg.best_devig_method;
  assertCoreDevigMethod(devigMethod);
  const wEffective =
    input.overrideWeight !== undefined ? validateBlendWeight(input.overrideWeight) : seg.w_effective;

  const rawModelArr = extractOrderedValues(input.modelProbs, canonMarket, "modelProbs");
  const pModel = validateSimplexVector(rawModelArr, "modelProbs");

  let pMarketNoVig: readonly number[];
  if (input.marketNoVigProbs !== undefined) {
    const rawMktArr = extractOrderedValues(input.marketNoVigProbs, canonMarket, "marketNoVigProbs");
    pMarketNoVig = validateSimplexVector(rawMktArr, "marketNoVigProbs");
  } else if (input.marketRawOdds !== undefined) {
    pMarketNoVig = devigMarketOdds(input.marketRawOdds, canonMarket, devigMethod);
  } else {
    throw new BlendValidationError(
      "computeSegmentBlendedProbs requiere marketNoVigProbs o marketRawOdds",
    );
  }

  const eps = input.artifact.prob_clip_eps ?? PROB_CLIP_EPS;
  const pFinal = blendLogitProbs(pModel, pMarketNoVig, wEffective, eps);

  const probsBySel: Record<string, number> = {};
  const modelBySel: Record<string, number> = {};
  const mktBySel: Record<string, number> = {};
  for (let i = 0; i < selections.length; i += 1) {
    const sel = selections[i]!;
    probsBySel[sel] = pFinal[i]!;
    modelBySel[sel] = pModel[i]!;
    mktBySel[sel] = pMarketNoVig[i]!;
  }

  return {
    segment_key: resolved.key,
    segment_found: resolved.found,
    league: seg.league,
    market: canonMarket,
    selections,
    devig_method: devigMethod,
    w_effective: wEffective,
    p_model: pModel,
    p_market_novig: pMarketNoVig,
    p_final: pFinal,
    probabilities_by_selection: probsBySel,
    model_probs_by_selection: modelBySel,
    market_novig_by_selection: mktBySel,
    model_picks_enabled: seg.model_picks_enabled,
    disabled_reason: seg.disabled_reason,
  };
}
