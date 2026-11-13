/**
 * A28 (Ola 2 · Agente A5) — Motor puro de decisión de picks, filtrado de microestructura,
 * Kelly ¼ contraído por incertidumbre epistémica y topes duros de portafolio (`Geodesic v3.1`).
 *
 * Implementa las 5 correcciones obligatorias del contrato A5 con paridad numérica `< 1e-12`
 * respecto a `services/models/picks_engine.py`:
 *   1. Puerta de segmento (`A4`): rechaza `"segment_model_picks_disabled"` cuando
 *      `model_picks_enabled === false` salvo señal autorizada `allow_pure_market_arb === true`.
 *   2. Punto de equilibrio estricto (Corrección #1): prohibido usar `% de acierto` para aprobar
 *      o clasificar picks; rechaza `"below_breakeven"` si `p_final <= 1 / price_decimal` y exige
 *      `p_final > (1 / price_decimal) + p_edge_min` y `ev >= ev_threshold` calibrado por
 *      `league × market × odds_bucket` (`"short" | "even" | "plus" | "long"`).
 *   3. Eliminación total de `"Tiro de Cuota Alta"` (Corrección #2): solo existen dos niveles
 *      (`PickTier = "solido" | "valor"`). Cuotas `> 2.90` compiten en `"long"` y su tamaño lo
 *      decide exclusivamente Kelly ¼. `"solido"` exige `segment_clv_ci95_low > 0` en walk-forward.
 *   4. Filtros de dispersión entre submodelos (`sigma_p = std_pop(...) > max_sigma_p` ->
 *      `"high_submodel_dispersion"`) y movimiento adverso sharp en `[ts_decision - 60m, ts_decision]`
 *      (`1 tick = 0.005` prob implícita -> `"adverse_sharp_steam"`).
 *   5. Quarter-Kelly sobre probabilidad conservadora `p_shrunk = max(0, p_final - k * sigma_p)`
 *      (`p_shrunk <= 1 / price_decimal` -> `"uncertainty_erased_edge"`), penalización por correlación
 *      en el mismo `event_id` ordenando por crecimiento logarítmico `g`, y 4 topes duros inquebrantables:
 *      `<= 2.0u` por pick, `<= 2.0u` por `event_id`, `<= 3.0u` por `(league, utc_date)` y `<= 5.0u` por `utc_date`.
 */

import type { PickLedgerInput } from "./ledger";

/** Rangos calibrados de cuota decimal (`[1.01, 1.65)`, `[1.65, 2.20)`, `[2.20, 2.90)`, `[2.90, 1000.0]`). */
export const ODDS_BUCKETS = ["short", "even", "plus", "long"] as const;
export type OddsBucket = (typeof ODDS_BUCKETS)[number];

/** Únicos niveles válidos en `v3.1` (se elimina por completo `"Tiro de Cuota Alta"` / `"especulativo"`). */
export const PICK_TIERS = ["solido", "valor"] as const;
export type PickTier = (typeof PICK_TIERS)[number];

/** Topes duros obligatorios e inquebrantables del contrato A5 (en unidades `1u = 1%` bankroll). */
export const HARD_MAX_STAKE_PER_PICK_U = 2.0;
export const HARD_MAX_STAKE_PER_EVENT_U = 2.0;
export const HARD_MAX_STAKE_PER_LEAGUE_DATE_U = 3.0;
export const HARD_MAX_STAKE_PER_GLOBAL_DATE_U = 5.0;

/** Límites de cuota decimal válida heredados de `odds.ts` (`[1.01, 1000.0]`). */
export const MIN_PICK_PRICE_DECIMAL = 1.01;
export const MAX_PICK_PRICE_DECIMAL = 1000.0;

/** Parámetros estructurales por defecto de Quarter-Kelly y ticks sharp. */
export const DEFAULT_KELLY_FRACTION = 0.25;
export const DEFAULT_BANKROLL_UNIT_PCT = 0.01;
export const DEFAULT_SHARP_STEAM_WINDOW_MINUTES = 60.0;
export const DEFAULT_SHARP_IMPLIED_PROB_TICK = 0.005;
export const DEFAULT_MIN_STAKE_U = 0.05;

const CAP_EPSILON = 1e-12;

/** Códigos canónicos de rechazo determinista auditables por Red Team. */
export const PICK_REJECTION_REASONS = [
  "invalid_candidate_input",
  "segment_model_picks_disabled",
  "below_breakeven",
  "below_calibrated_ev_threshold",
  "solido_clv_ci95_not_positive",
  "high_submodel_dispersion",
  "adverse_sharp_steam",
  "uncertainty_erased_edge",
  "correlated_same_event_market",
  "cap_event_exhausted",
  "cap_league_date_exhausted",
  "cap_global_date_exhausted",
  "stake_below_min_unit",
] as const;
export type PickRejectionReason = (typeof PICK_REJECTION_REASONS)[number];

/** Error de validación estructural sobre `PickPolicy`. */
export class PickPolicyValidationError extends Error {
  readonly code = "pick_policy_validation_error" as const;

  constructor(message: string) {
    super(message);
    this.name = "PickPolicyValidationError";
  }
}

/** Error lanzado ante cualquier violación causal en timestamps (`ts_captured > ts_decision` o post-kickoff). */
export class PickCausalityError extends Error {
  readonly code = "pick_causality_error" as const;

  constructor(message: string) {
    super(message);
    this.name = "PickCausalityError";
  }
}

/** Tick individual de línea sharp (`pinnacle` / `smarkets`) observado hasta `ts_decision`. */
export interface SharpQuoteTick {
  readonly book: string;
  readonly price_decimal: number;
  readonly ts_captured: string;
  readonly market?: string;
  readonly line?: number | null;
  readonly selection?: string;
}

/** Mapa nombrado opcional de probabilidades por submodelo (`>= 2` para calcular `sigma_p`). */
export interface SubmodelProbabilitiesMap {
  readonly p_logit?: number | null;
  readonly p_gbm?: number | null;
  readonly p_dixon_coles?: number | null;
  readonly [submodel: string]: number | null | undefined;
}

/** Candidato de apuesta evaluado en el instante causal `ts_decision`. */
export interface PickCandidate {
  readonly candidate_id?: string;
  readonly event_id: string;
  readonly sport: string;
  readonly league: string;
  readonly market: string;
  readonly line?: number | null;
  readonly selection: string;
  readonly book: string;
  readonly price_decimal: number;
  readonly ts_decision: string;
  readonly ts_event_start: string;
  readonly ts_captured?: string | null;
  readonly utc_date?: string | null;
  readonly source?: string;
  readonly p_modelo: number;
  readonly p_mercado: number;
  readonly p_final: number;
  readonly submodel_probs?: readonly number[] | SubmodelProbabilitiesMap | null;
  readonly p_logit?: number | null;
  readonly p_gbm?: number | null;
  readonly p_dixon_coles?: number | null;
  readonly sigma_p?: number | null;
  readonly sharp_quotes_1h?: readonly SharpQuoteTick[] | null;
  readonly adverse_ticks_1h?: number | null;
  readonly allow_pure_market_arb?: boolean;
}

/** Umbrales calibrados para un rango de cuota (`OddsBucket`). */
export interface OddsBucketThresholds {
  readonly p_edge_min: number;
  readonly ev_threshold_solido: number;
  readonly ev_threshold_valor: number;
  readonly max_sigma_p?: number;
  readonly max_adverse_ticks_1h?: number;
}

/** Configuración calibrada en walk-forward para un segmento `league::market`. */
export interface SegmentPolicyConfig {
  readonly league: string;
  readonly market: string;
  readonly model_picks_enabled: boolean;
  readonly disabled_reason?: string | null;
  readonly w_effective?: number;
  readonly best_devig_method?: string;
  readonly segment_clv_mean: number | null;
  readonly segment_clv_ci95_low: number | null;
  readonly segment_clv_ci95_high?: number | null;
  readonly n_picks_dev_calibration?: number;
  readonly allow_pure_market_arb?: boolean;
  readonly max_sigma_p?: number;
  readonly max_adverse_ticks_1h?: number;
  readonly uncertainty_penalty_k?: number;
  readonly buckets?: Partial<Readonly<Record<OddsBucket, OddsBucketThresholds>>>;
}

/** Configuración de topes de exposición de portafolio (sujetos siempre a los 4 techos duros A5). */
export interface PortfolioCapsConfig {
  readonly max_stake_per_pick_u?: number;
  readonly max_stake_per_event_u?: number;
  readonly max_stake_per_league_date_u?: number;
  readonly max_stake_per_global_date_u?: number;
}

/** Artefacto declarativo completo de política de picks (`pick_policy_v3_1.json`). */
export interface PickPolicy {
  readonly schema_version: string;
  readonly policy_version: string;
  readonly generated_at_utc?: string;
  readonly reproduction_command?: string;
  readonly holdout_sealed_untouched?: boolean;
  readonly kelly_fraction?: number;
  readonly bankroll_unit_pct?: number;
  readonly sharp_steam_window_minutes?: number;
  readonly sharp_implied_prob_tick?: number;
  readonly max_sigma_p: number;
  readonly max_adverse_ticks_1h: number;
  readonly uncertainty_penalty_k: number;
  readonly rho_same_event: number;
  readonly min_stake_u?: number;
  readonly fallback_sigma_p?: number;
  readonly require_submodel_dispersion?: boolean;
  readonly allow_pure_market_arb?: boolean;
  readonly unknown_segment_model_picks_enabled?: boolean;
  readonly caps?: PortfolioCapsConfig;
  readonly default_buckets: Readonly<Record<OddsBucket, OddsBucketThresholds>>;
  readonly market_default_buckets?: Readonly<
    Record<string, Partial<Readonly<Record<OddsBucket, OddsBucketThresholds>>>>
  >;
  readonly segments: Readonly<Record<string, SegmentPolicyConfig>>;
}

/** Pick previamente abierto en el portafolio al momento de evaluar nuevos candidatos. */
export interface PortfolioExistingPick {
  readonly event_id: string;
  readonly league: string;
  readonly market?: string;
  readonly utc_date?: string;
  readonly ts_event_start?: string;
  readonly stake_u: number;
}

/** Estado inmutable de exposición previa del portafolio. */
export interface PortfolioState {
  readonly open_picks?: readonly PortfolioExistingPick[];
  readonly event_exposure_u?: Readonly<Record<string, number>>;
  readonly event_markets_taken?: Readonly<Record<string, readonly string[]>>;
  readonly event_pick_counts?: Readonly<Record<string, number>>;
  readonly league_date_exposure_u?: Readonly<Record<string, number>>;
  readonly global_date_exposure_u?: Readonly<Record<string, number>>;
}

/** Resultado completo e inmutable de decisión para cada `PickCandidate` de entrada. */
export interface PickDecisionResult {
  readonly candidate_id: string;
  readonly input_index: number;
  readonly approved: boolean;
  readonly rejection_reason: PickRejectionReason | null;
  readonly tier: PickTier | null;
  readonly event_id: string;
  readonly sport: string;
  readonly league: string;
  readonly market: string;
  readonly line: number | null;
  readonly selection: string;
  readonly book: string;
  readonly utc_date: string;
  readonly segment_key: string;
  readonly odds_bucket: OddsBucket;
  readonly price_decimal: number;
  readonly p_implied: number;
  readonly p_modelo: number;
  readonly p_mercado: number;
  readonly p_final: number;
  readonly p_edge: number;
  readonly ev: number;
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

/** Desglose intermedio del cálculo Quarter-Kelly contraído por incertidumbre. */
export interface ShrunkQuarterKellyResult {
  readonly p_implied: number;
  readonly p_shrunk: number;
  readonly edge_erased: boolean;
  readonly b: number;
  readonly f_quarter: number;
  readonly stake_raw_u: number;
  readonly expected_log_growth_g: number;
}

// ---------------------------------------------------------------------------
// Normalización canónica alineada 1:1 con `backtest.py` y `odds.ts`
// ---------------------------------------------------------------------------

const BOOK_CANONICAL_MAP: Readonly<Record<string, string>> = {
  ps: "pinnacle",
  p: "pinnacle",
  pinnacle: "pinnacle",
  pinnacle_sports: "pinnacle",
  smarkets: "smarkets",
  betfair_smarkets_exchange: "smarkets",
  b365: "b365",
  bet365: "b365",
  bw: "bw",
  bwin: "bw",
  wh: "wh",
  william_hill: "wh",
  caliente: "caliente",
  caliente_mx: "caliente",
  codere: "codere",
  codere_mx: "codere",
  codere_bet365_mx: "codere",
  bfe: "bfe",
  betfair_exchange: "bfe",
  bf: "bf",
  betfair_sportsbook: "bf",
  avg: "avg",
  market_avg: "avg",
  max: "max",
  market_max: "max",
  nflverse: "nflverse",
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

export function canonicalPickMarket(market: string): string {
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

export function canonicalPickSelection(selection: string): string {
  const raw = String(selection ?? "").trim().toLowerCase();
  return SELECTION_CANONICAL_MAP[raw] ?? raw;
}

export function canonicalPickBook(book: string): string {
  const raw = String(book ?? "").trim().toLowerCase();
  return BOOK_CANONICAL_MAP[raw] ?? raw;
}

export function normalizePickLine(line: number | null | undefined): number | null {
  if (line === null || line === undefined || typeof line !== "number" || !Number.isFinite(line)) {
    return null;
  }
  const normalized = Object.is(line, -0) || line === 0 ? 0 : Math.round(line * 10000) / 10000;
  return Object.is(normalized, -0) ? 0 : normalized;
}

export function buildSegmentKey(league: string, market: string): string {
  return `${String(league ?? "").trim()}::${canonicalPickMarket(market)}`;
}

// ---------------------------------------------------------------------------
// Timestamps ISO-8601 a microsegundos UTC exactos (paridad bit a bit con Python)
// ---------------------------------------------------------------------------

const ISO_UTC_REGEX =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:?\d{2})?$/i;
const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Convierte una cadena ISO-8601 a microsegundos enteros desde Unix Epoch UTC.
 * Evita truncamiento a milisegundos de `Date.parse` para paridad exacta con `datetime` en Python.
 */
export function parseIsoUtcMicros(isoTimestamp: unknown): number | null {
  if (typeof isoTimestamp !== "string") {
    return null;
  }
  const s = isoTimestamp.trim();
  if (s.length === 0) {
    return null;
  }
  const m = ISO_UTC_REGEX.exec(s);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    const hour = Number(m[4]);
    const minute = Number(m[5]);
    const second = Number(m[6]);
    const fracRaw = m[7] ?? "";
    const tzRaw = m[8] ?? "Z";

    const utcMsBase = Date.UTC(year, month - 1, day, hour, minute, second);
    if (!Number.isFinite(utcMsBase)) {
      return null;
    }
    const checkDate = new Date(utcMsBase);
    if (
      checkDate.getUTCFullYear() !== year ||
      checkDate.getUTCMonth() + 1 !== month ||
      checkDate.getUTCDate() !== day ||
      checkDate.getUTCHours() !== hour ||
      checkDate.getUTCMinutes() !== minute ||
      checkDate.getUTCSeconds() !== second
    ) {
      return null;
    }

    const frac6 = fracRaw.slice(0, 6).padEnd(6, "0");
    const micros = frac6.length > 0 ? Number(frac6) : 0;

    let offsetMinutes = 0;
    if (tzRaw.toUpperCase() !== "Z") {
      const sign = tzRaw.startsWith("-") ? -1 : 1;
      const cleanTz = tzRaw.slice(1).replace(":", "");
      const tzH = Number(cleanTz.slice(0, 2));
      const tzM = Number(cleanTz.slice(2, 4));
      if (tzH > 23 || tzM > 59) {
        return null;
      }
      offsetMinutes = sign * (tzH * 60 + tzM);
    }

    return utcMsBase * 1000 + micros - offsetMinutes * 60_000_000;
  }

  const fallbackMs = Date.parse(s);
  return Number.isFinite(fallbackMs) ? fallbackMs * 1000 : null;
}

export function formatUtcDateFromMicros(epochMicros: number): string {
  const ms = Math.floor(epochMicros / 1000);
  return new Date(ms).toISOString().slice(0, 10);
}

export function resolveCandidateUtcDate(candidate: {
  readonly utc_date?: string | null;
  readonly ts_event_start?: string | null;
  readonly ts_decision?: string | null;
}): string {
  if (typeof candidate.utc_date === "string" && DATE_ONLY_REGEX.test(candidate.utc_date.trim())) {
    return candidate.utc_date.trim();
  }
  const startUs = parseIsoUtcMicros(candidate.ts_event_start);
  if (startUs !== null) {
    return formatUtcDateFromMicros(startUs);
  }
  const decUs = parseIsoUtcMicros(candidate.ts_decision);
  if (decUs !== null) {
    return formatUtcDateFromMicros(decUs);
  }
  throw new PickCausalityError("No se pudo derivar utc_date válida desde utc_date, ts_event_start ni ts_decision.");
}

// ---------------------------------------------------------------------------
// Primitivas matemáticas puras (paridad IEEE-754 `< 1e-12` con Python)
// ---------------------------------------------------------------------------

/**
 * Clasifica una cuota decimal en uno de los 4 buckets calibrados:
 *   - `"short"`: `[1.01, 1.65)`
 *   - `"even"`:  `[1.65, 2.20)`
 *   - `"plus"`:  `[2.20, 2.90)`
 *   - `"long"`:  `[2.90, 1000.0]`
 */
export function classifyOddsBucket(priceDecimal: number): OddsBucket {
  if (
    typeof priceDecimal !== "number" ||
    !Number.isFinite(priceDecimal) ||
    priceDecimal < MIN_PICK_PRICE_DECIMAL ||
    priceDecimal > MAX_PICK_PRICE_DECIMAL
  ) {
    throw new RangeError(
      `price_decimal fuera de rango [${MIN_PICK_PRICE_DECIMAL}, ${MAX_PICK_PRICE_DECIMAL}]: ${String(priceDecimal)}`,
    );
  }
  if (priceDecimal < 1.65) {
    return "short";
  }
  if (priceDecimal < 2.2) {
    return "even";
  }
  if (priceDecimal < 2.9) {
    return "plus";
  }
  return "long";
}

function isFiniteProbability01(val: unknown): val is number {
  return typeof val === "number" && Number.isFinite(val) && val >= 0 && val <= 1;
}

/**
 * Calcula la dispersión poblacional `sigma_p = std_pop([p_logit, p_gbm, p_dixon_coles, ...])`
 * sobre los submodelos disponibles (`>= 2`), o usa `sigma_p` precalculado cuando no hay `>= 2` submodelos.
 */
export function computeSubmodelDispersion(input: {
  readonly submodel_probs?: readonly number[] | SubmodelProbabilitiesMap | null;
  readonly p_logit?: number | null;
  readonly p_gbm?: number | null;
  readonly p_dixon_coles?: number | null;
  readonly sigma_p?: number | null;
}): number | null {
  const extracted: number[] = [];

  if (Array.isArray(input.submodel_probs)) {
    for (const v of input.submodel_probs) {
      if (isFiniteProbability01(v)) {
        extracted.push(v);
      }
    }
  } else if (input.submodel_probs !== null && typeof input.submodel_probs === "object") {
    const mapObj = input.submodel_probs as SubmodelProbabilitiesMap;
    const priorityKeys = ["p_logit", "p_gbm", "p_dixon_coles"];
    const seen = new Set<string>();
    for (const k of priorityKeys) {
      seen.add(k);
      const v = mapObj[k];
      if (isFiniteProbability01(v)) {
        extracted.push(v);
      }
    }
    const extraKeys = Object.keys(mapObj)
      .filter((k) => !seen.has(k))
      .sort();
    for (const k of extraKeys) {
      const v = mapObj[k];
      if (isFiniteProbability01(v)) {
        extracted.push(v);
      }
    }
  } else {
    const named = [input.p_logit, input.p_gbm, input.p_dixon_coles];
    for (const v of named) {
      if (isFiniteProbability01(v)) {
        extracted.push(v);
      }
    }
  }

  if (extracted.length >= 2) {
    const n = extracted.length;
    let sum = 0;
    for (let i = 0; i < n; i += 1) {
      sum += extracted[i]!;
    }
    const mean = sum / n;
    let sqSum = 0;
    for (let i = 0; i < n; i += 1) {
      const diff = extracted[i]! - mean;
      sqSum += diff * diff;
    }
    return Math.sqrt(sqSum / n);
  }

  if (typeof input.sigma_p === "number" && Number.isFinite(input.sigma_p) && input.sigma_p >= 0) {
    return input.sigma_p;
  }

  return null;
}

/**
 * Calcula ticks de movimiento adverso sharp (`pinnacle` -> fallback `smarkets`) en la ventana
 * `[ts_decision - windowMinutes, ts_decision]`.
 *
 * Definición exacta:
 *   - `1 tick = sharpImpliedProbTick` (`0.005` = `50 bps` de probabilidad implícita `1 / price_decimal`).
 *   - Si la cuota sharp de la selección sube en la ventana (ej. `2.00 -> 2.10`), la probabilidad
 *     implícita cae (`0.5000 -> 0.4762`), lo que representa flujo sharp EN CONTRA de la selección:
 *     `adverse_ticks_1h = max(0, (1 / price_earliest) - (1 / price_latest)) / sharpImpliedProbTick`.
 *   - Lanza `PickCausalityError` si cualquier tick tiene `ts_captured > ts_decision`.
 */
export function computeAdverseSharpTicks1h(
  sharpQuotes: readonly SharpQuoteTick[] | null | undefined,
  tsDecision: string,
  options?: {
    readonly market?: string;
    readonly line?: number | null;
    readonly selection?: string;
    readonly windowMinutes?: number;
    readonly sharpImpliedProbTick?: number;
    readonly precomputedAdverseTicks?: number | null;
  },
): number {
  const decUs = parseIsoUtcMicros(tsDecision);
  if (decUs === null) {
    throw new PickCausalityError(`ts_decision inválido en computeAdverseSharpTicks1h: ${String(tsDecision)}`);
  }

  const windowMinutes = options?.windowMinutes ?? DEFAULT_SHARP_STEAM_WINDOW_MINUTES;
  const probTick = options?.sharpImpliedProbTick ?? DEFAULT_SHARP_IMPLIED_PROB_TICK;
  if (!Number.isFinite(probTick) || probTick <= 0) {
    throw new PickPolicyValidationError(`sharp_implied_prob_tick inválido: ${String(probTick)}`);
  }
  const windowStartUs = decUs - Math.round(windowMinutes * 60_000_000);

  const targetMarket = options?.market !== undefined ? canonicalPickMarket(options.market) : null;
  const targetLine = options?.line !== undefined ? normalizePickLine(options.line) : undefined;
  const targetSel = options?.selection !== undefined ? canonicalPickSelection(options.selection) : null;

  if (Array.isArray(sharpQuotes) && sharpQuotes.length > 0) {
    const byBook: Record<"pinnacle" | "smarkets", Array<{ tsUs: number; idx: number; price: number }>> = {
      pinnacle: [],
      smarkets: [],
    };

    for (let idx = 0; idx < sharpQuotes.length; idx += 1) {
      const q = sharpQuotes[idx]!;
      const capUs = parseIsoUtcMicros(q.ts_captured);
      if (capUs === null) {
        throw new PickCausalityError(`ts_captured inválido en sharp_quotes_1h[${idx}]: ${String(q.ts_captured)}`);
      }
      if (capUs > decUs) {
        throw new PickCausalityError(
          `Fuga temporal en sharp_quotes_1h[${idx}]: ts_captured (${q.ts_captured}) > ts_decision (${tsDecision}).`,
        );
      }
      if (capUs < windowStartUs) {
        continue;
      }

      const bookCanon = canonicalPickBook(q.book);
      if (bookCanon !== "pinnacle" && bookCanon !== "smarkets") {
        continue;
      }
      if (
        typeof q.price_decimal !== "number" ||
        !Number.isFinite(q.price_decimal) ||
        q.price_decimal < MIN_PICK_PRICE_DECIMAL ||
        q.price_decimal > MAX_PICK_PRICE_DECIMAL
      ) {
        continue;
      }
      if (targetMarket !== null && q.market !== undefined && canonicalPickMarket(q.market) !== targetMarket) {
        continue;
      }
      if (targetLine !== undefined && q.line !== undefined && normalizePickLine(q.line) !== targetLine) {
        continue;
      }
      if (targetSel !== null && q.selection !== undefined && canonicalPickSelection(q.selection) !== targetSel) {
        continue;
      }

      byBook[bookCanon].push({ tsUs: capUs, idx, price: q.price_decimal });
    }

    for (const sharpBook of ["pinnacle", "smarkets"] as const) {
      const ticks = byBook[sharpBook];
      if (ticks.length >= 2) {
        ticks.sort((a, b) => (a.tsUs !== b.tsUs ? a.tsUs - b.tsUs : a.idx - b.idx));
        const earliest = ticks[0]!;
        const latest = ticks[ticks.length - 1]!;
        const qEarliest = 1.0 / earliest.price;
        const qLatest = 1.0 / latest.price;
        const adverseDrop = Math.max(0.0, qEarliest - qLatest);
        return adverseDrop / probTick;
      }
    }
  }

  if (
    typeof options?.precomputedAdverseTicks === "number" &&
    Number.isFinite(options.precomputedAdverseTicks) &&
    options.precomputedAdverseTicks >= 0
  ) {
    return options.precomputedAdverseTicks;
  }

  return 0.0;
}

/**
 * Calcula `p_shrunk`, fracción Quarter-Kelly (`f_quarter`), `stake_raw_u` (`1u = 1%` bankroll)
 * y tasa de crecimiento logarítmico esperado `g`.
 */
export function computeShrunkQuarterKelly(
  pFinal: number,
  priceDecimal: number,
  sigmaP: number,
  uncertaintyPenaltyK: number,
  kellyFraction = DEFAULT_KELLY_FRACTION,
  bankrollUnitPct = DEFAULT_BANKROLL_UNIT_PCT,
): ShrunkQuarterKellyResult {
  const pImplied = 1.0 / priceDecimal;
  const pShrunk = Math.max(0.0, pFinal - uncertaintyPenaltyK * sigmaP);
  const b = priceDecimal - 1.0;

  if (pShrunk <= pImplied || b <= 0.0) {
    return {
      p_implied: pImplied,
      p_shrunk: pShrunk,
      edge_erased: true,
      b,
      f_quarter: 0.0,
      stake_raw_u: 0.0,
      expected_log_growth_g: 0.0,
    };
  }

  const fQuarter = kellyFraction * ((pShrunk * b - (1.0 - pShrunk)) / b);
  const unitScale = bankrollUnitPct === 0.01 ? 100.0 : 1.0 / bankrollUnitPct;
  const stakeRawU = unitScale * fQuarter;
  const expectedLogGrowthG =
    pShrunk * Math.log(1.0 + fQuarter * b) + (1.0 - pShrunk) * Math.log(1.0 - fQuarter);

  return {
    p_implied: pImplied,
    p_shrunk: pShrunk,
    edge_erased: false,
    b,
    f_quarter: fQuarter,
    stake_raw_u: stakeRawU,
    expected_log_growth_g: expectedLogGrowthG,
  };
}

// ---------------------------------------------------------------------------
// Validación de política y resolución jerárquica de umbrales por segmento/bucket
// ---------------------------------------------------------------------------

function validateBucketThresholds(label: string, t: OddsBucketThresholds): void {
  if (
    typeof t.p_edge_min !== "number" ||
    !Number.isFinite(t.p_edge_min) ||
    t.p_edge_min < 0 ||
    typeof t.ev_threshold_solido !== "number" ||
    !Number.isFinite(t.ev_threshold_solido) ||
    t.ev_threshold_solido <= 0 ||
    typeof t.ev_threshold_valor !== "number" ||
    !Number.isFinite(t.ev_threshold_valor) ||
    t.ev_threshold_valor <= t.ev_threshold_solido
  ) {
    throw new PickPolicyValidationError(
      `Umbrales inválidos en ${label}: se exige p_edge_min >= 0 y 0 < ev_threshold_solido < ev_threshold_valor.`,
    );
  }
}

export function validatePickPolicy(policy: PickPolicy): void {
  if (!policy || typeof policy !== "object") {
    throw new PickPolicyValidationError("PickPolicy inválida o ausente.");
  }
  const kellyFrac = policy.kelly_fraction ?? DEFAULT_KELLY_FRACTION;
  if (!Number.isFinite(kellyFrac) || kellyFrac <= 0 || kellyFrac > 0.25 + 1e-12) {
    throw new PickPolicyValidationError(
      `kelly_fraction inválida (${String(kellyFrac)}): el contrato A5 exige Quarter-Kelly (<= 0.25).`,
    );
  }
  const unitPct = policy.bankroll_unit_pct ?? DEFAULT_BANKROLL_UNIT_PCT;
  if (!Number.isFinite(unitPct) || unitPct <= 0 || unitPct > 1) {
    throw new PickPolicyValidationError(`bankroll_unit_pct inválido: ${String(unitPct)}`);
  }
  if (!Number.isFinite(policy.max_sigma_p) || policy.max_sigma_p < 0) {
    throw new PickPolicyValidationError(`max_sigma_p inválido: ${String(policy.max_sigma_p)}`);
  }
  if (!Number.isFinite(policy.max_adverse_ticks_1h) || policy.max_adverse_ticks_1h < 0) {
    throw new PickPolicyValidationError(`max_adverse_ticks_1h inválido: ${String(policy.max_adverse_ticks_1h)}`);
  }
  if (!Number.isFinite(policy.uncertainty_penalty_k) || policy.uncertainty_penalty_k < 0) {
    throw new PickPolicyValidationError(`uncertainty_penalty_k inválido: ${String(policy.uncertainty_penalty_k)}`);
  }
  if (!Number.isFinite(policy.rho_same_event) || Math.abs(policy.rho_same_event) > 1) {
    throw new PickPolicyValidationError(`rho_same_event debe estar en [-1, 1]: ${String(policy.rho_same_event)}`);
  }
  if (!policy.default_buckets) {
    throw new PickPolicyValidationError("default_buckets es obligatorio en PickPolicy.");
  }
  for (const b of ODDS_BUCKETS) {
    const bt = policy.default_buckets[b];
    if (!bt) {
      throw new PickPolicyValidationError(`Falta bucket por defecto '${b}' en PickPolicy.`);
    }
    validateBucketThresholds(`default_buckets.${b}`, bt);
  }
  if (policy.segments) {
    for (const [segKey, seg] of Object.entries(policy.segments)) {
      if (seg.buckets) {
        for (const b of ODDS_BUCKETS) {
          const bt = seg.buckets[b];
          if (bt) {
            validateBucketThresholds(`segments[${segKey}].buckets.${b}`, bt);
          }
        }
      }
    }
  }
}

function lookupSegmentConfig(
  policy: PickPolicy,
  league: string,
  marketCanon: string,
): { segmentKey: string; segment: SegmentPolicyConfig | null } {
  const exactKey = `${league.trim()}::${marketCanon}`;
  const direct = policy.segments[exactKey];
  if (direct) {
    return { segmentKey: exactKey, segment: direct };
  }
  const lowerKey = exactKey.toLowerCase();
  for (const [k, v] of Object.entries(policy.segments)) {
    if (k.toLowerCase() === lowerKey) {
      return { segmentKey: k, segment: v };
    }
  }
  return { segmentKey: exactKey, segment: null };
}

function resolveThresholdsForCandidate(
  policy: PickPolicy,
  segment: SegmentPolicyConfig | null,
  marketCanon: string,
  bucket: OddsBucket,
): {
  thresholds: OddsBucketThresholds;
  maxSigmaP: number;
  maxAdverseTicks1h: number;
  uncertaintyPenaltyK: number;
} {
  const segBucket = segment?.buckets?.[bucket];
  const mktBucket = policy.market_default_buckets?.[marketCanon]?.[bucket];
  const thresholds = segBucket ?? mktBucket ?? policy.default_buckets[bucket];

  const maxSigmaP = thresholds.max_sigma_p ?? segment?.max_sigma_p ?? policy.max_sigma_p;
  const maxAdverseTicks1h =
    thresholds.max_adverse_ticks_1h ?? segment?.max_adverse_ticks_1h ?? policy.max_adverse_ticks_1h;
  const uncertaintyPenaltyK = segment?.uncertainty_penalty_k ?? policy.uncertainty_penalty_k;

  return {
    thresholds,
    maxSigmaP,
    maxAdverseTicks1h,
    uncertaintyPenaltyK,
  };
}

interface MutablePortfolioTracker {
  readonly eventExposureU: Map<string, number>;
  readonly eventMarketsTaken: Map<string, Set<string>>;
  readonly eventPickCounts: Map<string, number>;
  readonly leagueDateExposureU: Map<string, number>;
  readonly globalDateExposureU: Map<string, number>;
}

function initPortfolioTracker(portfolioState?: PortfolioState): MutablePortfolioTracker {
  const eventExposureU = new Map<string, number>();
  const eventMarketsTaken = new Map<string, Set<string>>();
  const eventPickCounts = new Map<string, number>();
  const leagueDateExposureU = new Map<string, number>();
  const globalDateExposureU = new Map<string, number>();

  if (!portfolioState) {
    return {
      eventExposureU,
      eventMarketsTaken,
      eventPickCounts,
      leagueDateExposureU,
      globalDateExposureU,
    };
  }

  if (portfolioState.event_exposure_u) {
    for (const [eid, val] of Object.entries(portfolioState.event_exposure_u)) {
      if (typeof val === "number" && Number.isFinite(val) && val > 0) {
        eventExposureU.set(eid, val);
      }
    }
  }
  if (portfolioState.event_markets_taken) {
    for (const [eid, mkts] of Object.entries(portfolioState.event_markets_taken)) {
      if (Array.isArray(mkts) && mkts.length > 0) {
        const s = new Set<string>(mkts.map((m) => canonicalPickMarket(m)));
        eventMarketsTaken.set(eid, s);
        eventPickCounts.set(eid, s.size);
      }
    }
  }
  if (portfolioState.event_pick_counts) {
    for (const [eid, cnt] of Object.entries(portfolioState.event_pick_counts)) {
      if (typeof cnt === "number" && Number.isFinite(cnt) && cnt > 0) {
        eventPickCounts.set(eid, Math.max(eventPickCounts.get(eid) ?? 0, Math.floor(cnt)));
      }
    }
  }
  if (portfolioState.league_date_exposure_u) {
    for (const [k, val] of Object.entries(portfolioState.league_date_exposure_u)) {
      if (typeof val === "number" && Number.isFinite(val) && val > 0) {
        leagueDateExposureU.set(k, val);
      }
    }
  }
  if (portfolioState.global_date_exposure_u) {
    for (const [k, val] of Object.entries(portfolioState.global_date_exposure_u)) {
      if (typeof val === "number" && Number.isFinite(val) && val > 0) {
        globalDateExposureU.set(k, val);
      }
    }
  }

  if (Array.isArray(portfolioState.open_picks)) {
    for (const op of portfolioState.open_picks) {
      if (!op || typeof op.stake_u !== "number" || !Number.isFinite(op.stake_u) || op.stake_u <= 0) {
        continue;
      }
      const eid = String(op.event_id ?? "").trim();
      const lg = String(op.league ?? "").trim();
      const uDate = resolveCandidateUtcDate({
        utc_date: op.utc_date,
        ts_event_start: op.ts_event_start,
      });
      const ldKey = `${lg}::${uDate}`;

      eventExposureU.set(eid, (eventExposureU.get(eid) ?? 0) + op.stake_u);
      leagueDateExposureU.set(ldKey, (leagueDateExposureU.get(ldKey) ?? 0) + op.stake_u);
      globalDateExposureU.set(uDate, (globalDateExposureU.get(uDate) ?? 0) + op.stake_u);
      eventPickCounts.set(eid, (eventPickCounts.get(eid) ?? 0) + 1);

      if (typeof op.market === "string" && op.market.trim().length > 0) {
        const mSet = eventMarketsTaken.get(eid) ?? new Set<string>();
        mSet.add(canonicalPickMarket(op.market));
        eventMarketsTaken.set(eid, mSet);
      }
    }
  }

  return {
    eventExposureU,
    eventMarketsTaken,
    eventPickCounts,
    leagueDateExposureU,
    globalDateExposureU,
  };
}

function clampSafeAddition(used: number, proposed: number, hardCap: number): number {
  let stake = Math.min(proposed, Math.max(0.0, hardCap - used));
  if (used + stake > hardCap) {
    stake = Math.max(0.0, (hardCap - used) * (1.0 - 1e-15));
  }
  return stake;
}

// ---------------------------------------------------------------------------
// Función principal pura: `evaluatePickCandidates`
// ---------------------------------------------------------------------------

interface PreAllocatedCandidate {
  readonly inputIndex: number;
  readonly candidateId: string;
  readonly eventId: string;
  readonly sport: string;
  readonly league: string;
  readonly marketCanon: string;
  readonly lineNorm: number | null;
  readonly selectionCanon: string;
  readonly bookCanon: string;
  readonly utcDate: string;
  readonly segmentKey: string;
  readonly oddsBucket: OddsBucket;
  readonly tier: PickTier;
  readonly priceDecimal: number;
  readonly pImplied: number;
  readonly pModelo: number;
  readonly pMercado: number;
  readonly pFinal: number;
  readonly pEdge: number;
  readonly ev: number;
  readonly sigmaP: number;
  readonly pShrunk: number;
  readonly adverseTicks1h: number;
  readonly fQuarter: number;
  readonly stakeRawU: number;
  readonly expectedLogGrowthG: number;
}

/**
 * Evalúa de forma pura y determinista una lista de `PickCandidate` contra `PickPolicy` y `PortfolioState`.
 * Retorna un arreglo de igual longitud y en el mismo orden de entrada, con cada elemento congelado (`Object.freeze`).
 */
export function evaluatePickCandidates(
  candidates: readonly PickCandidate[],
  policy: PickPolicy,
  portfolioState?: PortfolioState,
): PickDecisionResult[] {
  validatePickPolicy(policy);

  const kellyFraction = policy.kelly_fraction ?? DEFAULT_KELLY_FRACTION;
  const bankrollUnitPct = policy.bankroll_unit_pct ?? DEFAULT_BANKROLL_UNIT_PCT;
  const sharpWindowMinutes = policy.sharp_steam_window_minutes ?? DEFAULT_SHARP_STEAM_WINDOW_MINUTES;
  const sharpProbTick = policy.sharp_implied_prob_tick ?? DEFAULT_SHARP_IMPLIED_PROB_TICK;
  const minStakeU = policy.min_stake_u ?? DEFAULT_MIN_STAKE_U;
  const fallbackSigmaP = policy.fallback_sigma_p ?? 0.0;
  const requireDispersion = policy.require_submodel_dispersion ?? false;
  const globalAllowPureArb = policy.allow_pure_market_arb ?? true;
  const unknownSegEnabled = policy.unknown_segment_model_picks_enabled ?? false;

  const capPickMax = Math.min(
    HARD_MAX_STAKE_PER_PICK_U,
    Math.max(0.0, policy.caps?.max_stake_per_pick_u ?? HARD_MAX_STAKE_PER_PICK_U),
  );
  const capEventMax = Math.min(
    HARD_MAX_STAKE_PER_EVENT_U,
    Math.max(0.0, policy.caps?.max_stake_per_event_u ?? HARD_MAX_STAKE_PER_EVENT_U),
  );
  const capLeagueDateMax = Math.min(
    HARD_MAX_STAKE_PER_LEAGUE_DATE_U,
    Math.max(0.0, policy.caps?.max_stake_per_league_date_u ?? HARD_MAX_STAKE_PER_LEAGUE_DATE_U),
  );
  const capGlobalDateMax = Math.min(
    HARD_MAX_STAKE_PER_GLOBAL_DATE_U,
    Math.max(0.0, policy.caps?.max_stake_per_global_date_u ?? HARD_MAX_STAKE_PER_GLOBAL_DATE_U),
  );

  const decisions = new Array<PickDecisionResult>(candidates.length);
  const survivors: PreAllocatedCandidate[] = [];

  for (let i = 0; i < candidates.length; i += 1) {
    const c = candidates[i]!;
    const eventId = String(c.event_id ?? "").trim();
    const sport = String(c.sport ?? "").trim().toLowerCase();
    const league = String(c.league ?? "").trim();
    const marketCanon = canonicalPickMarket(c.market);
    const lineNorm = normalizePickLine(c.line);
    const selectionCanon = canonicalPickSelection(c.selection);
    const bookCanon = canonicalPickBook(c.book);
    const candidateId =
      typeof c.candidate_id === "string" && c.candidate_id.trim().length > 0
        ? c.candidate_id.trim()
        : `${eventId}:${marketCanon}:${selectionCanon}:${bookCanon}:${i}`;

    const decUs = parseIsoUtcMicros(c.ts_decision);
    const startUs = parseIsoUtcMicros(c.ts_event_start);
    if (decUs === null || startUs === null) {
      throw new PickCausalityError(
        `Timestamps obligatorios inválidos en candidato '${candidateId}': ts_decision=${String(c.ts_decision)}, ts_event_start=${String(c.ts_event_start)}`,
      );
    }
    if (decUs > startUs) {
      throw new PickCausalityError(
        `Decisión post-kickoff prohibida en '${candidateId}': ts_decision (${c.ts_decision}) > ts_event_start (${c.ts_event_start}).`,
      );
    }
    if (c.ts_captured !== undefined && c.ts_captured !== null) {
      const capUs = parseIsoUtcMicros(c.ts_captured);
      if (capUs === null || capUs > decUs) {
        throw new PickCausalityError(
          `Fuga de cuota en candidato '${candidateId}': ts_captured (${String(c.ts_captured)}) > ts_decision (${c.ts_decision}).`,
        );
      }
    }

    const utcDate = resolveCandidateUtcDate(c);
    const { segmentKey, segment } = lookupSegmentConfig(policy, league, marketCanon);

    const makeRejected = (
      reason: PickRejectionReason,
      partial?: {
        oddsBucket?: OddsBucket;
        pImplied?: number;
        pEdge?: number;
        ev?: number;
        sigmaP?: number;
        pShrunk?: number;
        adverseTicks1h?: number;
      },
    ): PickDecisionResult =>
      Object.freeze({
        candidate_id: candidateId,
        input_index: i,
        approved: false,
        rejection_reason: reason,
        tier: null,
        event_id: eventId,
        sport,
        league,
        market: marketCanon,
        line: lineNorm,
        selection: selectionCanon,
        book: bookCanon,
        utc_date: utcDate,
        segment_key: segmentKey,
        odds_bucket: partial?.oddsBucket ?? "even",
        price_decimal: Number.isFinite(c.price_decimal) ? c.price_decimal : 0.0,
        p_implied: partial?.pImplied ?? 0.0,
        p_modelo: Number.isFinite(c.p_modelo) ? c.p_modelo : 0.0,
        p_mercado: Number.isFinite(c.p_mercado) ? c.p_mercado : 0.0,
        p_final: Number.isFinite(c.p_final) ? c.p_final : 0.0,
        p_edge: partial?.pEdge ?? 0.0,
        ev: partial?.ev ?? 0.0,
        sigma_p: partial?.sigmaP ?? 0.0,
        p_shrunk: partial?.pShrunk ?? 0.0,
        adverse_ticks_1h: partial?.adverseTicks1h ?? 0.0,
        f_quarter: 0.0,
        stake_raw_u: 0.0,
        correlation_multiplier: 1.0,
        stake_u: 0.0,
        expected_log_growth_g: 0.0,
        allocation_rank: null,
        cap_applied: false,
      });

    // 0. Validación básica de rangos numéricos
    if (
      eventId.length === 0 ||
      league.length === 0 ||
      marketCanon.length === 0 ||
      selectionCanon.length === 0 ||
      bookCanon.length === 0 ||
      typeof c.price_decimal !== "number" ||
      !Number.isFinite(c.price_decimal) ||
      c.price_decimal < MIN_PICK_PRICE_DECIMAL ||
      c.price_decimal > MAX_PICK_PRICE_DECIMAL ||
      typeof c.p_final !== "number" ||
      !Number.isFinite(c.p_final) ||
      c.p_final <= 0 ||
      c.p_final >= 1 ||
      typeof c.p_modelo !== "number" ||
      !Number.isFinite(c.p_modelo) ||
      c.p_modelo <= 0 ||
      c.p_modelo >= 1 ||
      typeof c.p_mercado !== "number" ||
      !Number.isFinite(c.p_mercado) ||
      c.p_mercado <= 0 ||
      c.p_mercado >= 1
    ) {
      decisions[i] = makeRejected("invalid_candidate_input");
      continue;
    }

    const oddsBucket = classifyOddsBucket(c.price_decimal);
    const pImplied = 1.0 / c.price_decimal;
    const pEdge = c.p_final - pImplied;
    const ev = c.p_final * c.price_decimal - 1.0;

    // 1. Puerta de segmento (`A4`): `model_picks_enabled === false` rechaza salvo `allow_pure_market_arb` autorizado
    const segEnabled = segment ? segment.model_picks_enabled : unknownSegEnabled;
    const segAllowsArb = (segment?.allow_pure_market_arb ?? globalAllowPureArb) && Boolean(c.allow_pure_market_arb);
    if (!segEnabled && !segAllowsArb) {
      decisions[i] = makeRejected("segment_model_picks_disabled", {
        oddsBucket,
        pImplied,
        pEdge,
        ev,
      });
      continue;
    }

    // 2. Verificación estricta de punto de equilibrio (Corrección #1): prohibido usar `% de acierto`
    if (c.p_final <= pImplied) {
      decisions[i] = makeRejected("below_breakeven", {
        oddsBucket,
        pImplied,
        pEdge,
        ev,
      });
      continue;
    }

    const { thresholds, maxSigmaP, maxAdverseTicks1h, uncertaintyPenaltyK } = resolveThresholdsForCandidate(
      policy,
      segment,
      marketCanon,
      oddsBucket,
    );

    // 3. Umbral calibrado de EV por `league × market × odds_bucket` y clasificación `PickTier = "solido" | "valor"`
    if (pEdge <= thresholds.p_edge_min || ev < thresholds.ev_threshold_solido) {
      decisions[i] = makeRejected("below_calibrated_ev_threshold", {
        oddsBucket,
        pImplied,
        pEdge,
        ev,
      });
      continue;
    }

    let tier: PickTier;
    if (ev >= thresholds.ev_threshold_valor) {
      tier = "valor";
    } else {
      const segClvMean = segment?.segment_clv_mean ?? null;
      const segClvCiLow = segment?.segment_clv_ci95_low ?? null;
      const hasSignificantPositiveClv =
        typeof segClvMean === "number" &&
        Number.isFinite(segClvMean) &&
        segClvMean > 0 &&
        typeof segClvCiLow === "number" &&
        Number.isFinite(segClvCiLow) &&
        segClvCiLow > 0;
      if (!hasSignificantPositiveClv) {
        decisions[i] = makeRejected("solido_clv_ci95_not_positive", {
          oddsBucket,
          pImplied,
          pEdge,
          ev,
        });
        continue;
      }
      tier = "solido";
    }

    // 4. Filtro de dispersión entre submodelos (`sigma_p = std_pop(...)`)
    const rawSigmaP = computeSubmodelDispersion(c);
    if (rawSigmaP === null && requireDispersion) {
      decisions[i] = makeRejected("high_submodel_dispersion", {
        oddsBucket,
        pImplied,
        pEdge,
        ev,
        sigmaP: Number.POSITIVE_INFINITY,
      });
      continue;
    }
    const sigmaP = rawSigmaP ?? fallbackSigmaP;
    if (sigmaP > maxSigmaP) {
      decisions[i] = makeRejected("high_submodel_dispersion", {
        oddsBucket,
        pImplied,
        pEdge,
        ev,
        sigmaP,
      });
      continue;
    }

    // 5. Filtro de movimiento adverso sharp en `[ts_decision - 60 min, ts_decision]`
    const adverseTicks1h = computeAdverseSharpTicks1h(c.sharp_quotes_1h, c.ts_decision, {
      market: marketCanon,
      line: lineNorm,
      selection: selectionCanon,
      windowMinutes: sharpWindowMinutes,
      sharpImpliedProbTick: sharpProbTick,
      precomputedAdverseTicks: c.adverse_ticks_1h,
    });
    if (adverseTicks1h > maxAdverseTicks1h) {
      decisions[i] = makeRejected("adverse_sharp_steam", {
        oddsBucket,
        pImplied,
        pEdge,
        ev,
        sigmaP,
        adverseTicks1h,
      });
      continue;
    }

    // 6. Kelly ¼ contraído por incertidumbre (`p_shrunk = max(0, p_final - k * sigma_p)`)
    const kelly = computeShrunkQuarterKelly(
      c.p_final,
      c.price_decimal,
      sigmaP,
      uncertaintyPenaltyK,
      kellyFraction,
      bankrollUnitPct,
    );
    if (kelly.edge_erased) {
      decisions[i] = makeRejected("uncertainty_erased_edge", {
        oddsBucket,
        pImplied,
        pEdge,
        ev,
        sigmaP,
        pShrunk: kelly.p_shrunk,
        adverseTicks1h,
      });
      continue;
    }

    survivors.push({
      inputIndex: i,
      candidateId,
      eventId,
      sport,
      league,
      marketCanon,
      lineNorm,
      selectionCanon,
      bookCanon,
      utcDate,
      segmentKey,
      oddsBucket,
      tier,
      priceDecimal: c.price_decimal,
      pImplied,
      pModelo: c.p_modelo,
      pMercado: c.p_mercado,
      pFinal: c.p_final,
      pEdge,
      ev,
      sigmaP,
      pShrunk: kelly.p_shrunk,
      adverseTicks1h,
      fQuarter: kelly.f_quarter,
      stakeRawU: kelly.stake_raw_u,
      expectedLogGrowthG: kelly.expected_log_growth_g,
    });
  }

  // 7. Orden determinista por `(utc_date ASC, -expected_log_growth_g, event_id, market, selection, input_index)`
  survivors.sort((a, b) => {
    if (a.utcDate !== b.utcDate) {
      return a.utcDate < b.utcDate ? -1 : 1;
    }
    if (a.expectedLogGrowthG !== b.expectedLogGrowthG) {
      return b.expectedLogGrowthG - a.expectedLogGrowthG;
    }
    if (a.eventId !== b.eventId) {
      return a.eventId < b.eventId ? -1 : 1;
    }
    if (a.marketCanon !== b.marketCanon) {
      return a.marketCanon < b.marketCanon ? -1 : 1;
    }
    if (a.selectionCanon !== b.selectionCanon) {
      return a.selectionCanon < b.selectionCanon ? -1 : 1;
    }
    return a.inputIndex - b.inputIndex;
  });

  const tracker = initPortfolioTracker(portfolioState);
  const absRho = Math.min(1.0, Math.max(0.0, Math.abs(policy.rho_same_event)));
  let nextAllocationRank = 1;

  for (const s of survivors) {
    const takenMarkets = tracker.eventMarketsTaken.get(s.eventId);
    const priorSameEventCount = tracker.eventPickCounts.get(s.eventId) ?? 0;

    const finalizeSurvivor = (
      approved: boolean,
      reason: PickRejectionReason | null,
      corrMult: number,
      stakeU: number,
      rank: number | null,
      capApplied: boolean,
    ): PickDecisionResult =>
      Object.freeze({
        candidate_id: s.candidateId,
        input_index: s.inputIndex,
        approved,
        rejection_reason: reason,
        tier: approved ? s.tier : null,
        event_id: s.eventId,
        sport: s.sport,
        league: s.league,
        market: s.marketCanon,
        line: s.lineNorm,
        selection: s.selectionCanon,
        book: s.bookCanon,
        utc_date: s.utcDate,
        segment_key: s.segmentKey,
        odds_bucket: s.oddsBucket,
        price_decimal: s.priceDecimal,
        p_implied: s.pImplied,
        p_modelo: s.pModelo,
        p_mercado: s.pMercado,
        p_final: s.pFinal,
        p_edge: s.pEdge,
        ev: s.ev,
        sigma_p: s.sigmaP,
        p_shrunk: s.pShrunk,
        adverse_ticks_1h: s.adverseTicks1h,
        f_quarter: s.fQuarter,
        stake_raw_u: s.stakeRawU,
        correlation_multiplier: corrMult,
        stake_u: stakeU,
        expected_log_growth_g: s.expectedLogGrowthG * corrMult,
        allocation_rank: rank,
        cap_applied: capApplied,
      });

    // Regla de correlación intra-evento: un único mejor pick por `(event_id, market)`
    if (takenMarkets && takenMarkets.has(s.marketCanon)) {
      decisions[s.inputIndex] = finalizeSurvivor(
        false,
        "correlated_same_event_market",
        0.0,
        0.0,
        null,
        false,
      );
      continue;
    }

    // Penalización `(1 - |rho|)^k` cuando existe otro mercado aprobado en el mismo `event_id`
    const corrMult = priorSameEventCount > 0 ? Math.pow(1.0 - absRho, priorSameEventCount) : 1.0;
    if (corrMult <= CAP_EPSILON) {
      decisions[s.inputIndex] = finalizeSurvivor(
        false,
        "correlated_same_event_market",
        0.0,
        0.0,
        null,
        false,
      );
      continue;
    }

    const stakeCorrU = s.stakeRawU * corrMult;
    const ldKey = `${s.league}::${s.utcDate}`;

    const usedEventU = tracker.eventExposureU.get(s.eventId) ?? 0.0;
    const usedLeagueDateU = tracker.leagueDateExposureU.get(ldKey) ?? 0.0;
    const usedGlobalDateU = tracker.globalDateExposureU.get(s.utcDate) ?? 0.0;

    const remEventU = capEventMax - usedEventU;
    if (remEventU <= CAP_EPSILON) {
      decisions[s.inputIndex] = finalizeSurvivor(false, "cap_event_exhausted", corrMult, 0.0, null, true);
      continue;
    }
    const remLeagueDateU = capLeagueDateMax - usedLeagueDateU;
    if (remLeagueDateU <= CAP_EPSILON) {
      decisions[s.inputIndex] = finalizeSurvivor(false, "cap_league_date_exhausted", corrMult, 0.0, null, true);
      continue;
    }
    const remGlobalDateU = capGlobalDateMax - usedGlobalDateU;
    if (remGlobalDateU <= CAP_EPSILON) {
      decisions[s.inputIndex] = finalizeSurvivor(false, "cap_global_date_exhausted", corrMult, 0.0, null, true);
      continue;
    }

    let stakeU = Math.min(stakeCorrU, capPickMax);
    stakeU = clampSafeAddition(usedEventU, stakeU, capEventMax);
    stakeU = clampSafeAddition(usedLeagueDateU, stakeU, capLeagueDateMax);
    stakeU = clampSafeAddition(usedGlobalDateU, stakeU, capGlobalDateMax);

    const capApplied = stakeU + 1e-15 < stakeCorrU;

    if (stakeU < minStakeU) {
      decisions[s.inputIndex] = finalizeSurvivor(
        false,
        "stake_below_min_unit",
        corrMult,
        0.0,
        null,
        capApplied,
      );
      continue;
    }

    const rank = nextAllocationRank;
    nextAllocationRank += 1;

    tracker.eventExposureU.set(s.eventId, usedEventU + stakeU);
    tracker.leagueDateExposureU.set(ldKey, usedLeagueDateU + stakeU);
    tracker.globalDateExposureU.set(s.utcDate, usedGlobalDateU + stakeU);
    tracker.eventPickCounts.set(s.eventId, priorSameEventCount + 1);
    const updatedMarkets = takenMarkets ?? new Set<string>();
    updatedMarkets.add(s.marketCanon);
    tracker.eventMarketsTaken.set(s.eventId, updatedMarkets);

    decisions[s.inputIndex] = finalizeSurvivor(true, null, corrMult, stakeU, rank, capApplied);
  }

  return decisions;
}

/**
 * Filtra únicamente los picks aprobados ordenados por `allocation_rank` ascendente.
 */
export function selectApprovedPicks(
  candidates: readonly PickCandidate[],
  policy: PickPolicy,
  portfolioState?: PortfolioState,
): PickDecisionResult[] {
  return evaluatePickCandidates(candidates, policy, portfolioState)
    .filter((d) => d.approved)
    .sort((a, b) => (a.allocation_rank ?? 0) - (b.allocation_rank ?? 0));
}

/**
 * Convierte un `PickDecisionResult` aprobado en un `PickLedgerInput` listo para `PickLedger.appendPick`.
 */
export function toLedgerPickInput(
  decision: PickDecisionResult,
  meta: {
    readonly pick_id: string;
    readonly ts_emitido: string;
    readonly version_modelo: string;
    readonly features_hash: string;
    readonly price_tomado?: number;
  },
): PickLedgerInput {
  if (!decision.approved || decision.tier === null) {
    throw new Error(`No se puede registrar en ledger un candidato rechazado (${decision.candidate_id}).`);
  }
  const execPrice = meta.price_tomado ?? decision.price_decimal;
  const execEv = decision.p_final * execPrice - 1.0;
  return {
    pick_id: meta.pick_id,
    ts_emitido: meta.ts_emitido,
    event_id: decision.event_id,
    sport: decision.sport,
    league: decision.league,
    market: decision.market,
    line: decision.line,
    selection: decision.selection,
    book: decision.book,
    price_tomado: execPrice,
    p_modelo: decision.p_modelo,
    p_mercado: decision.p_mercado,
    p_final: decision.p_final,
    ev: execEv,
    stake_u: decision.stake_u,
    tier: decision.tier,
    version_modelo: meta.version_modelo,
    features_hash: meta.features_hash,
  };
}
