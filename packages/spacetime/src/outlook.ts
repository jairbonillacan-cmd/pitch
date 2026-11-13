/**
 * B1 (`b1-outlook`) — Motor de salida pública "lo más probable + cuota justa" (`MatchOutlook`, `v3.2`).
 *
 * Invariantes rectoras (`CONTRACT_OUTLOOK.md` y `MASTER.md` §0):
 *  1. Cero campos de apuesta o dimensionamiento (`stake`, `kelly`, `kellyFraction`, `expectedEdge`,
 *     `edge`, `ev`, `value`, `tier`, `"pick seguro"`).
 *  2. Cero cuotas inventadas: sin cuota real causal y fresca (`ts_captured <= ts_decision`,
 *     pre-kickoff y edad `<= max_sharp_age_minutes`), el bloque `market` queda en `null`.
 *  3. Cuota justa (`fairOdds`) idéntica a `packages/contracts/src/view-models.ts:100-105` (`1 / p`
 *     con clamp `[0.01, 0.99]` y redondeo a 2 decimales), preservando `p` en doble precisión.
 *  4. Única implementación de Dixon-Coles en fútbol vía `buildDixonColesScoreMatrix` y
 *     `deriveAll2WayMarkets` (`src/domain/prediction/markets_2way.ts`), derivando desde una sola
 *     matriz `1x2`, `double_chance`, `totals_1_5`, `totals_2_5`, `totals_3_5`, `btts`, `dnb`,
 *     `ah_-1_0`, `ah_-0_5`, `ah_0_5`, `ah_1_0` y los 3 marcadores exactos más probables.
 *  5. Suma de probabilidades en mercados de partición y condicionales sin push: `|Σ p - 1| < 1e-12`
 *     (`double_chance` solapado documentado con `isOverlappingMarket: true` y `expectedProbabilitySum: 2`).
 */

import defaultBlendWeightsJson from "../data/blend_weights_v3_1.json";
import defaultMarkets2WayConfigJson from "../data/markets_2way_config.json";
import defaultOutlookCalibrationJson from "../data/outlook_calibration_v3_2.json";
import {
  computeSegmentBlendedProbs,
  MAX_DISABLED_WEIGHT_THRESHOLD,
  resolveBlendSegment,
  type BlendWeightsArtifact,
  type CoreDevigMethod,
} from "./blend";
import {
  devig,
  devig2Way,
  InvalidOddsError,
  MAX_OVERROUND,
  MIN_OVERROUND,
  overround,
} from "./devig";
import {
  GLOBAL_HDA_RATES,
  InvalidFeaturesError,
  predictNFL,
  predictWithFallback,
} from "./engine";
import {
  buildDixonColesScoreMatrix,
  DEFAULT_DC_RHO,
  DEFAULT_MAX_GOALS,
  deriveAll2WayMarkets,
  type Markets2WayConfigArtifact,
} from "./markets_2way";
import { clamp, logit, normalCdf, sigmoid } from "./math";
import {
  applyMinkowskiV3LiveContext,
  MINKOWSKI_V3_DEFAULT_PRIORS,
  type NFLLiveArtifactConfig,
  type NFLLiveContextInput,
} from "./nfl_live";
import {
  isValidPriceDecimal,
  normalizeLine,
  parseUtcEpochMs,
  SHARP_SCRAPED_FALLBACK_ORDER,
  type OddsSnapshotRow,
} from "./odds";
import type {
  ModelArtifact,
  NFLModelArtifact,
  NFLSnapshotRow,
  SnapshotRow,
} from "./types";

export const OUTLOOK_SCHEMA_VERSION = "match_outlook_v3.2.0" as const;
export const OUTLOOK_CALIBRATION_SCHEMA_VERSION = "outlook_calibration_v3.2.0" as const;

/** Ventana máxima por defecto (en minutos) para aceptar una cuota real como fresca. */
export const DEFAULT_MAX_SHARP_AGE_MINUTES = 180.0;

/** Umbral mínimo de cobertura de features base antes de marcar `"low_coverage"` (`< 50%`). */
export const LOW_COVERAGE_THRESHOLD = 0.5;

/** Desviaciones típicas estructurales de margen y total en NFL (`normalCdf`). */
export const DEFAULT_NFL_SIGMA_MARGIN = 13.5;
export const DEFAULT_NFL_SIGMA_TOTAL = 10.5;

/** Prior global NFL de respaldo cuando faltan features válidas del modelo. */
export const GLOBAL_NFL_BASE_RATES = Object.freeze({
  pHome: 0.55,
  pDraw: 0.0,
  pAway: 0.45,
} as const);

export type OutlookSport = "football" | "nfl";

export type FootballOutlookMarketKey =
  | "1x2"
  | "double_chance"
  | "totals_1_5"
  | "totals_2_5"
  | "totals_3_5"
  | "btts"
  | "dnb"
  | "ah_-1_0"
  | "ah_-0_5"
  | "ah_0_5"
  | "ah_1_0";

export type NFLOutlookMarketKey = "moneyline" | "spread" | "totals";

export type OutlookMarketKey = FootballOutlookMarketKey | NFLOutlookMarketKey;

export type OutlookSelectionKey =
  | "home"
  | "draw"
  | "away"
  | "1X"
  | "12"
  | "X2"
  | "over"
  | "under"
  | "yes"
  | "no";

export type PublishedProbSource =
  | "market_sharp_novig"
  | "blend_v3_1"
  | "model"
  | "base_rate";

export type OutlookDataQualityFlag = "ok" | "low_coverage" | "fallback_base_rate";

export interface FairOdds {
  readonly decimal: number;
  readonly american: number;
}

export interface OutlookReliabilityBin {
  readonly bin_index: number;
  readonly p_min: number;
  readonly p_max: number;
  readonly n: number;
  readonly mean_pred: number | null;
  readonly empirical_freq: number | null;
  readonly ci95_low?: number | null;
  readonly ci95_high?: number | null;
}

export interface OutlookCalibrationSegment {
  readonly sport: string;
  readonly league: string;
  readonly market: string;
  readonly selected_source_when_sharp_present: "market_sharp_novig" | "blend_v3_1";
  readonly fallback_order?: readonly PublishedProbSource[];
  readonly benchmark_note?: string | null;
  readonly n: number;
  readonly ece: number | null;
  readonly ece_ci95?: readonly [number, number] | readonly number[] | null;
  readonly log_loss?: number | null;
  readonly log_loss_ci95?: readonly [number, number] | readonly number[] | null;
  readonly brier?: number | null;
  readonly brier_ci95?: readonly [number, number] | readonly number[] | null;
  readonly rps?: number | null;
  readonly rps_ci95?: readonly [number, number] | readonly number[] | null;
  readonly delta_ll_vs_benchmark?: number | null;
  readonly delta_ll_ci95?: readonly [number, number] | readonly number[] | null;
  readonly significance?: string;
  readonly reliability_bins: readonly OutlookReliabilityBin[];
}

export interface OutlookCalibrationArtifact {
  readonly schema_version: string;
  readonly eval_split: string;
  readonly holdout_cut_utc: string;
  readonly holdout_sealed_untouched: boolean;
  readonly bootstrap_samples: number;
  readonly max_sharp_age_minutes: number;
  readonly segments: Readonly<Record<string, OutlookCalibrationSegment>>;
}

export interface CalibrationBucketRef {
  readonly segmentKey: string;
  readonly binIndex: number;
  readonly pMin: number;
  readonly pMax: number;
  readonly empiricalFreq: number | null;
  readonly meanPred: number | null;
  readonly n: number;
  readonly eceSegment: number | null;
  readonly benchmarkNote: string | null;
}

export interface OutlookDataQuality {
  readonly coverageRatio: number;
  readonly flag: OutlookDataQualityFlag;
  readonly sharpMarketAvailable: boolean;
}

export interface SelectionOutlook {
  readonly selection: OutlookSelectionKey;
  readonly label: string;
  readonly line: number | null;
  readonly p: number;
  readonly fairOdds: FairOdds;
  readonly rank: number;
  readonly isMostLikely: boolean;
  readonly pSource: PublishedProbSource;
  readonly calibrationBucket: CalibrationBucketRef;
  readonly dataQuality: OutlookDataQuality;
}

export interface MarketHeadline {
  readonly selection: OutlookSelectionKey;
  readonly label: string;
  readonly line: number | null;
  readonly p: number;
  readonly fairOdds: FairOdds;
  readonly pSource: PublishedProbSource;
}

export interface MarketQuoteContext {
  readonly book: string;
  readonly tsCaptured: string;
  readonly overround: number;
}

export interface MarketOutlook {
  readonly marketKey: OutlookMarketKey;
  readonly line: number | null;
  readonly pPush?: number;
  readonly isOverlappingMarket: boolean;
  readonly expectedProbabilitySum: number;
  readonly headline: MarketHeadline;
  readonly selections: readonly SelectionOutlook[];
  readonly market: MarketQuoteContext | null;
}

export interface ScorelineOutlook {
  readonly homeGoals: number;
  readonly awayGoals: number;
  readonly score: string;
  readonly p: number;
  readonly fairOdds: FairOdds;
  readonly rank: number;
  readonly isMostLikely: boolean;
  readonly pSource: PublishedProbSource;
}

export interface MatchOutlook {
  readonly schemaVersion: typeof OUTLOOK_SCHEMA_VERSION;
  readonly matchId: string;
  readonly sport: OutlookSport;
  readonly league: string;
  readonly canonicalLeague: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly kickoffUtc: string | null;
  readonly tsDecision: string;
  readonly markets: readonly MarketOutlook[];
  readonly marketsByKey: Readonly<Partial<Record<OutlookMarketKey, MarketOutlook>>>;
  readonly topScorelines: readonly ScorelineOutlook[];
  readonly dixonColesParams: {
    readonly lamHome: number;
    readonly lamAway: number;
    readonly rho: number;
    readonly maxGoals: number;
  } | null;
  readonly dataQuality: OutlookDataQuality;
}

export interface OutlookMarketQuoteInput {
  readonly market: string;
  readonly line?: number | null;
  readonly book: string;
  readonly tsCaptured: string;
  readonly tsEventStart?: string | null;
  readonly oddsBySelection: Readonly<Record<string, number>>;
}

export interface FootballOutlookModelInput {
  readonly lamHome?: number | null;
  readonly lamAway?: number | null;
  readonly rho?: number | null;
  readonly maxGoals?: number;
  readonly footballRow?: SnapshotRow | null;
  readonly footballModel?: ModelArtifact | null;
  readonly modelProbs1X2?: {
    readonly pHome: number;
    readonly pDraw: number;
    readonly pAway: number;
  } | null;
  readonly featureCoverageRatio?: number | null;
}

export interface NFLOutlookModelInput {
  readonly nflRow?: NFLSnapshotRow | null;
  readonly nflModel?: NFLModelArtifact | null;
  readonly liveContext?: NFLLiveContextInput | null;
  readonly liveConfig?: NFLLiveArtifactConfig | null;
  readonly pHome?: number | null;
  readonly pDraw?: number | null;
  readonly pAway?: number | null;
  readonly expectedMargin?: number | null;
  readonly expectedTotal?: number | null;
  readonly spreadLine?: number | null;
  readonly totalLine?: number | null;
  readonly sigmaMargin?: number;
  readonly sigmaTotal?: number;
  readonly featureCoverageRatio?: number | null;
}

export interface BuildMatchOutlookInput {
  readonly matchId: string;
  readonly sport: OutlookSport;
  readonly league: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly tsDecision: string;
  readonly kickoffUtc?: string | null;
  readonly football?: FootballOutlookModelInput | null;
  readonly nfl?: NFLOutlookModelInput | null;
  readonly marketQuotes?: readonly OutlookMarketQuoteInput[];
  readonly oddsSnapshots?: readonly OddsSnapshotRow[];
  readonly maxQuoteAgeMinutes?: number;
  readonly blendArtifact?: BlendWeightsArtifact;
  readonly markets2WayConfig?: Markets2WayConfigArtifact;
  readonly calibrationArtifact?: OutlookCalibrationArtifact | null;
}

export class OutlookValidationError extends Error {
  readonly code = "outlook_validation_error" as const;

  constructor(message: string) {
    super(message);
    this.name = "OutlookValidationError";
  }
}

/**
 * Artefacto de calibración de respaldo seguro (`CONTRACT_OUTLOOK.md` §3) para ejecución
 * determinista cuando un segmento no figura en `outlook_calibration_v3_2.json` o durante
 * pruebas aisladas sin artefacto inyectado.
 */
export const FALLBACK_OUTLOOK_CALIBRATION_ARTIFACT: OutlookCalibrationArtifact = Object.freeze({
  schema_version: OUTLOOK_CALIBRATION_SCHEMA_VERSION,
  eval_split: "walk_forward_dev",
  holdout_cut_utc: "2025-02-02T17:30:00Z",
  holdout_sealed_untouched: true,
  bootstrap_samples: 1000,
  max_sharp_age_minutes: DEFAULT_MAX_SHARP_AGE_MINUTES,
  segments: Object.freeze({}),
});

const LOADED_OUTLOOK_CALIBRATION_ARTIFACT: OutlookCalibrationArtifact =
  defaultOutlookCalibrationJson !== null &&
  typeof defaultOutlookCalibrationJson === "object" &&
  "segments" in defaultOutlookCalibrationJson
    ? (defaultOutlookCalibrationJson as unknown as OutlookCalibrationArtifact)
    : FALLBACK_OUTLOOK_CALIBRATION_ARTIFACT;

let registeredDefaultCalibrationArtifact: OutlookCalibrationArtifact =
  LOADED_OUTLOOK_CALIBRATION_ARTIFACT;

/**
 * Devuelve el artefacto de calibración por defecto activo (`outlook_calibration_v3_2.json`
 * cuando está disponible o `FALLBACK_OUTLOOK_CALIBRATION_ARTIFACT`).
 */
export function getDefaultOutlookCalibrationArtifact(): OutlookCalibrationArtifact {
  return registeredDefaultCalibrationArtifact;
}

const DEFAULT_BLEND_WEIGHTS_ARTIFACT = defaultBlendWeightsJson as unknown as BlendWeightsArtifact;
const DEFAULT_MARKETS_2WAY_CONFIG =
  defaultMarkets2WayConfigJson as unknown as Markets2WayConfigArtifact;

const SHARP_BOOKS = new Set<string>(SHARP_SCRAPED_FALLBACK_ORDER);

const FOOTBALL_LEAGUE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  arg: "ARG",
  argentina: "ARG",
  liga_profesional: "ARG",
  b1: "B1",
  belgium: "B1",
  jupiler: "B1",
  bra: "BRA",
  brasileirao: "BRA",
  brazil: "BRA",
  serie_a_brazil: "BRA",
  d1: "D1",
  bundesliga: "D1",
  "1_bundesliga": "D1",
  d2: "D2",
  "2_bundesliga": "D2",
  bundesliga_2: "D2",
  e0: "E0",
  epl: "E0",
  premier_league: "E0",
  "premier-league": "E0",
  england_premier: "E0",
  e1: "E1",
  championship: "E1",
  efl_championship: "E1",
  f1: "F1",
  ligue_1: "F1",
  "ligue-1": "F1",
  ligue1: "F1",
  f2: "F2",
  ligue_2: "F2",
  "ligue-2": "F2",
  ligue2: "F2",
  g1: "G1",
  greece: "G1",
  super_league_greece: "G1",
  i1: "I1",
  serie_a: "I1",
  "serie-a": "I1",
  seriea: "I1",
  i2: "I2",
  serie_b: "I2",
  "serie-b": "I2",
  serieb: "I2",
  jpn: "JPN",
  j_league: "JPN",
  j1: "JPN",
  mex: "MEX",
  liga_mx: "MEX",
  "liga-mx": "MEX",
  ligamx: "MEX",
  "liga mx": "MEX",
  mexico: "MEX",
  n1: "N1",
  eredivisie: "N1",
  p1: "P1",
  primeira_liga: "P1",
  portugal: "P1",
  sc0: "SC0",
  scottish_premiership: "SC0",
  scotland: "SC0",
  sc1: "SC1",
  scottish_championship: "SC1",
  sp1: "SP1",
  laliga: "SP1",
  la_liga: "SP1",
  "la-liga": "SP1",
  primera_division: "SP1",
  sp2: "SP2",
  segunda_division: "SP2",
  laliga_2: "SP2",
  swe: "SWE",
  allsvenskan: "SWE",
  t1: "T1",
  super_lig: "T1",
  turkey: "T1",
  usa: "USA",
  mls: "USA",
});

/**
 * Convierte probabilidad `p` en cuota justa decimal y americana con el mismo clamp `[0.01, 0.99]`
 * y redondeo de `packages/contracts/src/view-models.ts:100-105` y `packages/contracts/src/odds.ts:47-55`.
 */
export function probabilityToFairOdds(p: number): FairOdds {
  if (typeof p !== "number" || !Number.isFinite(p)) {
    throw new OutlookValidationError(
      `probabilityToFairOdds requiere una probabilidad finita; recibido ${String(p)}`,
    );
  }
  const clamped = clamp(p, 0.01, 0.99);
  const decimal = Math.round((1 / clamped) * 100) / 100;
  const american =
    decimal >= 2
      ? Math.round((decimal - 1) * 100)
      : Math.round(-100 / (decimal - 1));
  return Object.freeze({ decimal, american });
}

/** Normaliza alias de liga (`"liga-mx"`, `"liga_mx"`, `"MEX"`, `"epl"`, `"nfl"`, etc.) al código canónico. */
export function canonicalizeOutlookLeague(sport: OutlookSport, league: string): string {
  if (typeof league !== "string" || league.trim().length === 0) {
    throw new OutlookValidationError(`league debe ser un string no vacío; recibido ${String(league)}`);
  }
  if (sport === "nfl") {
    return "NFL";
  }
  const trimmed = league.trim();
  const slug = trimmed.toLowerCase().replace(/\s+/g, "_");
  const mapped = FOOTBALL_LEAGUE_ALIASES[trimmed.toLowerCase()] ?? FOOTBALL_LEAGUE_ALIASES[slug];
  return mapped ?? trimmed.toUpperCase();
}

function getCalibrationCandidateKeys(
  sport: OutlookSport,
  canonicalLeague: string,
  marketKey: OutlookMarketKey,
): readonly string[] {
  const familyKeys: string[] = [marketKey];
  if (marketKey === "totals_1_5" || marketKey === "totals_2_5" || marketKey === "totals_3_5") {
    if (!familyKeys.includes("totals")) familyKeys.push("totals");
    if (!familyKeys.includes("totals_2_5")) familyKeys.push("totals_2_5");
    if (!familyKeys.includes("ou")) familyKeys.push("ou");
  } else if (
    marketKey === "ah_-1_0" ||
    marketKey === "ah_-0_5" ||
    marketKey === "ah_0_5" ||
    marketKey === "ah_1_0"
  ) {
    familyKeys.push("ah");
  }

  const out: string[] = [];
  for (const mk of familyKeys) {
    out.push(`${canonicalLeague}::${mk}`);
  }
  for (const mk of familyKeys) {
    out.push(`GLOBAL::${sport}::${mk}`);
  }
  return out;
}

function resolveCalibrationSegmentEntry(
  artifact: OutlookCalibrationArtifact,
  sport: OutlookSport,
  canonicalLeague: string,
  marketKey: OutlookMarketKey,
): { readonly key: string; readonly entry: OutlookCalibrationSegment } | null {
  const candidates = getCalibrationCandidateKeys(sport, canonicalLeague, marketKey);
  for (const key of candidates) {
    const seg = artifact.segments[key];
    if (seg !== undefined) {
      return { key, entry: seg };
    }
  }
  return null;
}

/**
 * Resuelve el bin de calibración empírica de una probabilidad `p` desde `outlook_calibration_v3_2.json`,
 * cayendo de forma determinista a `"GLOBAL::<sport>::<market>"` o a un bin teórico de 10 deciles
 * con `n: 0, empiricalFreq: null` cuando el segmento no existe (`CONTRACT_OUTLOOK.md` §3).
 */
export function resolveCalibrationBucket(
  p: number,
  sport: OutlookSport,
  canonicalLeague: string,
  marketKey: OutlookMarketKey,
  calibrationArtifact: OutlookCalibrationArtifact = getDefaultOutlookCalibrationArtifact(),
): CalibrationBucketRef {
  const pSafe = clamp(p, 0.0, 1.0);
  const resolved = resolveCalibrationSegmentEntry(
    calibrationArtifact,
    sport,
    canonicalLeague,
    marketKey,
  );

  if (resolved !== null && resolved.entry.reliability_bins.length > 0) {
    const bins = resolved.entry.reliability_bins;
    let matched: OutlookReliabilityBin | undefined;
    for (let i = 0; i < bins.length; i += 1) {
      const b = bins[i]!;
      const isLast = i === bins.length - 1;
      if (pSafe >= b.p_min && (pSafe < b.p_max || (isLast && pSafe <= b.p_max))) {
        matched = b;
        break;
      }
    }
    if (matched === undefined) {
      const idx = Math.min(bins.length - 1, Math.max(0, Math.floor(pSafe * bins.length)));
      matched = bins[idx]!;
    }
    const hasSamples = matched.n > 0;
    return Object.freeze({
      segmentKey: resolved.key,
      binIndex: matched.bin_index,
      pMin: matched.p_min,
      pMax: matched.p_max,
      empiricalFreq: hasSamples ? matched.empirical_freq : null,
      meanPred: hasSamples ? matched.mean_pred : null,
      n: matched.n,
      eceSegment: resolved.entry.ece,
      benchmarkNote: resolved.entry.benchmark_note ?? null,
    });
  }

  const binIndex = Math.min(9, Math.max(0, Math.floor(pSafe * 10)));
  const pMin = Number((binIndex / 10).toFixed(1));
  const pMax = Number(((binIndex + 1) / 10).toFixed(1));
  return Object.freeze({
    segmentKey: "THEORETICAL_FALLBACK",
    binIndex,
    pMin,
    pMax,
    empiricalFreq: null,
    meanPred: null,
    n: 0,
    eceSegment: null,
    benchmarkNote: null,
  });
}

// ---------------------------------------------------------------------------
// Normalización y resolución causal de cuotas reales (cero precios inventados)
// ---------------------------------------------------------------------------

type CanonicalQuoteMarket =
  | "1x2"
  | "double_chance"
  | "totals"
  | "btts"
  | "dnb"
  | "ah"
  | "moneyline"
  | "spread";

interface ValidatedMarketQuote {
  readonly market: CanonicalQuoteMarket;
  readonly line: number | null;
  readonly book: string;
  readonly isSharp: boolean;
  readonly sharpRank: number;
  readonly tsCaptured: string;
  readonly tsCapturedMs: number;
  readonly overround: number;
  readonly orderedOdds: readonly number[];
  readonly oddsBySelection: Readonly<Record<string, number>>;
}

function normalizeQuoteMarketName(raw: string): CanonicalQuoteMarket | null {
  const m = raw.trim().toLowerCase();
  if (m === "1x2" || m === "h2h_3way" || m === "match_odds" || m === "3way") return "1x2";
  if (m === "double_chance" || m === "dc") return "double_chance";
  if (
    m === "totals" ||
    m === "total" ||
    m === "ou" ||
    m === "over_under" ||
    m === "totals_1_5" ||
    m === "totals_2_5" ||
    m === "totals_3_5"
  ) {
    return "totals";
  }
  if (m === "btts" || m === "both_teams_to_score") return "btts";
  if (m === "dnb" || m === "draw_no_bet") return "dnb";
  if (
    m === "ah" ||
    m === "asian_handicap" ||
    m === "handicap" ||
    m === "ah_-1_0" ||
    m === "ah_-0_5" ||
    m === "ah_0_5" ||
    m === "ah_1_0"
  ) {
    return "ah";
  }
  if (m === "moneyline" || m === "ml" || m === "h2h" || m === "h2h_2way" || m === "2way") {
    return "moneyline";
  }
  if (m === "spread" || m === "point_spread") return "spread";
  return null;
}

function inferLineFromMarketAlias(rawMarket: string, explicitLine: number | null): number | null {
  if (explicitLine !== null) return explicitLine;
  const m = rawMarket.trim().toLowerCase();
  if (m === "totals_1_5") return 1.5;
  if (m === "totals_2_5") return 2.5;
  if (m === "totals_3_5") return 3.5;
  if (m === "ah_-1_0") return -1;
  if (m === "ah_-0_5") return -0.5;
  if (m === "ah_0_5") return 0.5;
  if (m === "ah_1_0") return 1;
  return null;
}

function normalizeQuoteSelection(market: CanonicalQuoteMarket, rawSel: string): string | null {
  const s = rawSel.trim().toLowerCase();
  if (market === "1x2") {
    if (s === "home" || s === "1" || s === "h") return "home";
    if (s === "draw" || s === "x" || s === "d" || s === "tie") return "draw";
    if (s === "away" || s === "2" || s === "a") return "away";
    return null;
  }
  if (market === "double_chance") {
    const u = rawSel.trim().toUpperCase();
    if (u === "1X" || s === "home_draw") return "1X";
    if (u === "12" || s === "home_away") return "12";
    if (u === "X2" || s === "draw_away") return "X2";
    return null;
  }
  if (market === "totals") {
    if (s === "over" || s === "o") return "over";
    if (s === "under" || s === "u") return "under";
    return null;
  }
  if (market === "btts") {
    if (s === "yes" || s === "si" || s === "y") return "yes";
    if (s === "no" || s === "n") return "no";
    return null;
  }
  if (market === "dnb" || market === "ah" || market === "moneyline" || market === "spread") {
    if (s === "home" || s === "1" || s === "h") return "home";
    if (s === "away" || s === "2" || s === "a") return "away";
    return null;
  }
  return null;
}

function getRequiredQuoteSelections(market: CanonicalQuoteMarket): readonly string[] {
  if (market === "1x2") return ["home", "draw", "away"];
  if (market === "double_chance") return ["1X", "12", "X2"];
  if (market === "totals") return ["over", "under"];
  if (market === "btts") return ["yes", "no"];
  return ["home", "away"];
}

function convertSnapshotsToQuoteInputs(
  snapshots: readonly OddsSnapshotRow[],
  matchId: string,
): OutlookMarketQuoteInput[] {
  if (snapshots.length === 0) return [];
  const filtered = snapshots.filter(
    (r) => typeof r.event_id === "string" && r.event_id.trim() === matchId.trim(),
  );
  if (filtered.length === 0) return [];

  // Agrupamos primero por `(market, book, ts_captured)` para emparejar líneas tanto en
  // convención `home_canonical` (`home` y `away` con la misma `line`) como `selection` (`away` con `-line`).
  interface BucketItem {
    readonly line: number | null;
    readonly selection: string;
    readonly price: number;
    readonly tsEventStart: string;
  }
  const buckets = new Map<
    string,
    {
      readonly market: CanonicalQuoteMarket;
      readonly book: string;
      readonly tsCaptured: string;
      readonly items: BucketItem[];
    }
  >();

  for (const r of filtered) {
    if (typeof r.market !== "string" || typeof r.book !== "string" || typeof r.selection !== "string") {
      continue;
    }
    const canonMkt = normalizeQuoteMarketName(r.market);
    if (canonMkt === null) continue;
    const canonSel = normalizeQuoteSelection(canonMkt, r.selection);
    if (canonSel === null) continue;
    if (!isValidPriceDecimal(r.price_decimal)) continue;
    if (typeof r.ts_captured !== "string" || r.ts_captured.trim().length === 0) continue;

    const book = r.book.trim().toLowerCase();
    const tsCap = r.ts_captured.trim();
    const ln = inferLineFromMarketAlias(r.market, normalizeLine(r.line));
    const key = `${canonMkt}\u001f${book}\u001f${tsCap}`;
    let group = buckets.get(key);
    if (group === undefined) {
      group = { market: canonMkt, book, tsCaptured: tsCap, items: [] };
      buckets.set(key, group);
    }
    group.items.push({
      line: ln,
      selection: canonSel,
      price: r.price_decimal,
      tsEventStart: typeof r.ts_event_start === "string" ? r.ts_event_start : "",
    });
  }

  const out: OutlookMarketQuoteInput[] = [];
  for (const group of buckets.values()) {
    const mkt = group.market;
    if (mkt === "ah" || mkt === "spread") {
      const homeItems = group.items.filter((i) => i.selection === "home" && i.line !== null);
      const awayItems = group.items.filter((i) => i.selection === "away" && i.line !== null);
      for (const hItem of homeItems) {
        const homeLn = hItem.line!;
        const oppLn = homeLn === 0 ? 0 : -homeLn;
        const sameLineAway = awayItems.find((a) => a.line === homeLn);
        const oppLineAway = awayItems.find((a) => a.line === oppLn);
        const matchedAway = sameLineAway ?? oppLineAway;
        if (matchedAway !== undefined) {
          out.push({
            market: mkt,
            line: homeLn,
            book: group.book,
            tsCaptured: group.tsCaptured,
            tsEventStart: hItem.tsEventStart || matchedAway.tsEventStart || null,
            oddsBySelection: {
              home: hItem.price,
              away: matchedAway.price,
            },
          });
        }
      }
    } else if (mkt === "totals") {
      const byLine = new Map<number, Record<string, number>>();
      const tsStartByLine = new Map<number, string>();
      for (const item of group.items) {
        if (item.line === null) continue;
        let rec = byLine.get(item.line);
        if (rec === undefined) {
          rec = {};
          byLine.set(item.line, rec);
        }
        rec[item.selection] = item.price;
        if (item.tsEventStart) tsStartByLine.set(item.line, item.tsEventStart);
      }
      for (const [ln, rec] of byLine.entries()) {
        out.push({
          market: mkt,
          line: ln,
          book: group.book,
          tsCaptured: group.tsCaptured,
          tsEventStart: tsStartByLine.get(ln) ?? null,
          oddsBySelection: rec,
        });
      }
    } else {
      const rec: Record<string, number> = {};
      let tsStart: string | null = null;
      for (const item of group.items) {
        rec[item.selection] = item.price;
        if (item.tsEventStart) tsStart = item.tsEventStart;
      }
      out.push({
        market: mkt,
        line: null,
        book: group.book,
        tsCaptured: group.tsCaptured,
        tsEventStart: tsStart,
        oddsBySelection: rec,
      });
    }
  }
  return out;
}

function validateCausalFreshQuotes(
  rawQuotes: readonly OutlookMarketQuoteInput[],
  tsDecisionMs: number,
  kickoffMs: number | null,
  maxAgeMinutes: number,
): ValidatedMarketQuote[] {
  const maxAgeMs = maxAgeMinutes * 60_000;
  const valid: ValidatedMarketQuote[] = [];

  for (const q of rawQuotes) {
    if (q === null || typeof q !== "object") continue;
    if (typeof q.market !== "string" || typeof q.book !== "string" || typeof q.tsCaptured !== "string") {
      continue;
    }
    const canonMkt = normalizeQuoteMarketName(q.market);
    if (canonMkt === null) continue;
    const tsCapMs = parseUtcEpochMs(q.tsCaptured);
    if (tsCapMs === null) continue;

    // Causalidad estricta: nunca se aceptan capturas futuras respecto a `tsDecision` ni post-kickoff.
    if (tsCapMs > tsDecisionMs) continue;
    if (kickoffMs !== null && tsCapMs > kickoffMs) continue;
    if (q.tsEventStart !== undefined && q.tsEventStart !== null && q.tsEventStart.trim().length > 0) {
      const qStartMs = parseUtcEpochMs(q.tsEventStart);
      if (qStartMs !== null && tsCapMs > qStartMs) continue;
    }

    // Ventana de frescura estricta (`<= max_sharp_age_minutes`).
    if (tsDecisionMs - tsCapMs > maxAgeMs + 1e-6) continue;

    const rawLine = inferLineFromMarketAlias(q.market, normalizeLine(q.line));
    const normLine = canonMkt === "dnb" && rawLine === 0 ? null : rawLine;
    if ((canonMkt === "totals" || canonMkt === "ah" || canonMkt === "spread") && normLine === null) {
      continue;
    }

    const reqSels = getRequiredQuoteSelections(canonMkt);
    const normOddsMap: Record<string, number> = {};
    if (q.oddsBySelection && typeof q.oddsBySelection === "object") {
      for (const [rawKey, price] of Object.entries(q.oddsBySelection)) {
        const cSel = normalizeQuoteSelection(canonMkt, rawKey);
        if (cSel !== null && isValidPriceDecimal(price)) {
          normOddsMap[cSel] = price;
        }
      }
    }

    const orderedOdds: number[] = [];
    let complete = true;
    for (const sel of reqSels) {
      const p = normOddsMap[sel];
      if (p === undefined || !isValidPriceDecimal(p)) {
        complete = false;
        break;
      }
      orderedOdds.push(p);
    }
    if (!complete) continue;

    const sumImplied = orderedOdds.reduce((acc, o) => acc + 1 / o, 0);
    if (canonMkt === "double_chance") {
      if (sumImplied < 1.8 || sumImplied > 2.4) continue;
    } else if (sumImplied < MIN_OVERROUND || sumImplied > MAX_OVERROUND) {
      continue;
    }

    const bookNorm = q.book.trim().toLowerCase();
    if (bookNorm.length === 0) continue;
    const isSharp = SHARP_BOOKS.has(bookNorm);
    const sharpRank =
      bookNorm === "pinnacle" ? 0 : bookNorm === "smarkets" ? 1 : 99;
    const ovr = canonMkt === "double_chance" ? sumImplied - 2.0 : overround(orderedOdds);

    valid.push({
      market: canonMkt,
      line: normLine,
      book: bookNorm,
      isSharp,
      sharpRank,
      tsCaptured: q.tsCaptured.trim(),
      tsCapturedMs: tsCapMs,
      overround: ovr,
      orderedOdds,
      oddsBySelection: normOddsMap,
    });
  }

  return valid;
}

function selectBestQuotesForMarket(
  validQuotes: readonly ValidatedMarketQuote[],
  market: CanonicalQuoteMarket,
  line: number | null,
): {
  readonly sharpQuote: ValidatedMarketQuote | null;
  readonly contextQuote: ValidatedMarketQuote | null;
} {
  const candidates = validQuotes.filter((q) => {
    if (q.market !== market) return false;
    if (line === null) return q.line === null;
    return q.line !== null && Math.abs(q.line - line) <= 1e-9;
  });
  if (candidates.length === 0) {
    return { sharpQuote: null, contextQuote: null };
  }

  const sharpCandidates = candidates
    .filter((q) => q.isSharp)
    .sort((a, b) => {
      if (a.sharpRank !== b.sharpRank) return a.sharpRank - b.sharpRank;
      return b.tsCapturedMs - a.tsCapturedMs;
    });

  const bestSharp = sharpCandidates[0] ?? null;
  if (bestSharp !== null) {
    return { sharpQuote: bestSharp, contextQuote: bestSharp };
  }

  const nonSharpSorted = [...candidates].sort((a, b) => {
    if (b.tsCapturedMs !== a.tsCapturedMs) return b.tsCapturedMs - a.tsCapturedMs;
    if (Math.abs(a.overround - b.overround) > 1e-12) return a.overround - b.overround;
    return a.book.localeCompare(b.book);
  });
  return { sharpQuote: null, contextQuote: nonSharpSorted[0] ?? null };
}

function resolveAvailableMarketLine(
  validQuotes: readonly ValidatedMarketQuote[],
  market: "spread" | "totals",
  explicitLine: number | null | undefined,
): number | null {
  const mktQuotes = validQuotes.filter((q) => q.market === market && q.line !== null);
  if (mktQuotes.length > 0) {
    const sorted = [...mktQuotes].sort((a, b) => {
      if (a.sharpRank !== b.sharpRank) return a.sharpRank - b.sharpRank;
      if (b.tsCapturedMs !== a.tsCapturedMs) return b.tsCapturedMs - a.tsCapturedMs;
      return a.overround - b.overround;
    });
    return sorted[0]!.line;
  }
  const normExplicit = normalizeLine(explicitLine);
  return normExplicit;
}

// ---------------------------------------------------------------------------
// Selección de `pSource` (jerarquía `market_sharp_novig` | `blend_v3_1` | `model` | `base_rate`)
// ---------------------------------------------------------------------------

function resolveBlendMarketKeyForOutlook(marketKey: OutlookMarketKey): string {
  if (marketKey === "1x2") return "1x2";
  if (marketKey === "totals_1_5" || marketKey === "totals_2_5" || marketKey === "totals_3_5") {
    return "totals";
  }
  if (
    marketKey === "ah_-1_0" ||
    marketKey === "ah_-0_5" ||
    marketKey === "ah_0_5" ||
    marketKey === "ah_1_0"
  ) {
    return "ah";
  }
  if (marketKey === "btts") return "btts";
  if (marketKey === "dnb") return "dnb";
  if (marketKey === "moneyline") return "moneyline";
  if (marketKey === "spread") return "spread";
  if (marketKey === "totals") return "totals";
  return "1x2";
}

function computePublishedSimplexProbs(params: {
  readonly sport: OutlookSport;
  readonly canonicalLeague: string;
  readonly marketKey: OutlookMarketKey;
  readonly modelProbs: readonly number[];
  readonly modelBaseSource: "model" | "base_rate";
  readonly sharpQuote: ValidatedMarketQuote | null;
  readonly blendArtifact: BlendWeightsArtifact;
  readonly calibrationArtifact: OutlookCalibrationArtifact;
}): {
  readonly probs: readonly number[];
  readonly pSource: PublishedProbSource;
  readonly sharpMarketAvailable: boolean;
} {
  const {
    sport,
    canonicalLeague,
    marketKey,
    modelProbs,
    modelBaseSource,
    sharpQuote,
    blendArtifact,
    calibrationArtifact,
  } = params;

  if (sharpQuote === null) {
    return {
      probs: modelProbs,
      pSource: modelBaseSource,
      sharpMarketAvailable: false,
    };
  }

  const blendMarket = resolveBlendMarketKeyForOutlook(marketKey);
  const blendSeg = resolveBlendSegment(blendArtifact, canonicalLeague, blendMarket).entry;
  const devigMethod: CoreDevigMethod = blendSeg.best_devig_method;
  const calSeg = resolveCalibrationSegmentEntry(
    calibrationArtifact,
    sport,
    canonicalLeague,
    marketKey,
  );

  const shouldBlend =
    modelBaseSource === "model" &&
    blendSeg.w_effective > MAX_DISABLED_WEIGHT_THRESHOLD &&
    (calSeg !== null
      ? calSeg.entry.selected_source_when_sharp_present === "blend_v3_1"
      : blendSeg.model_picks_enabled);

  try {
    if (shouldBlend) {
      const blended = computeSegmentBlendedProbs({
        artifact: blendArtifact,
        league: canonicalLeague,
        market: blendMarket,
        modelProbs,
        marketRawOdds: sharpQuote.orderedOdds,
        overrideDevigMethod: devigMethod,
        overrideWeight: blendSeg.w_effective,
      });
      return {
        probs: blended.p_final,
        pSource: "blend_v3_1",
        sharpMarketAvailable: true,
      };
    }

    if (sharpQuote.orderedOdds.length === 3) {
      const pNoVig = devig(sharpQuote.orderedOdds, devigMethod);
      return {
        probs: pNoVig,
        pSource: "market_sharp_novig",
        sharpMarketAvailable: true,
      };
    }
    const p2 = devig2Way(
      sharpQuote.orderedOdds[0]!,
      sharpQuote.orderedOdds[1]!,
      devigMethod,
    );
    return {
      probs: [p2.pHome, p2.pAway],
      pSource: "market_sharp_novig",
      sharpMarketAvailable: true,
    };
  } catch (err) {
    if (err instanceof InvalidOddsError) {
      return {
        probs: modelProbs,
        pSource: modelBaseSource,
        sharpMarketAvailable: false,
      };
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Construcción de `MarketOutlook` con ranking determinista y `headline`
// ---------------------------------------------------------------------------

interface SelectionSeed {
  readonly selection: OutlookSelectionKey;
  readonly label: string;
  readonly line: number | null;
  readonly p: number;
}

function buildMarketOutlookBlock(params: {
  readonly sport: OutlookSport;
  readonly canonicalLeague: string;
  readonly marketKey: OutlookMarketKey;
  readonly line: number | null;
  readonly pPush?: number;
  readonly isOverlappingMarket: boolean;
  readonly expectedProbabilitySum: number;
  readonly seeds: readonly SelectionSeed[];
  readonly pSource: PublishedProbSource;
  readonly coverageRatio: number;
  readonly baseQualityFlag: OutlookDataQualityFlag;
  readonly sharpMarketAvailable: boolean;
  readonly contextQuote: ValidatedMarketQuote | null;
  readonly calibrationArtifact: OutlookCalibrationArtifact;
}): MarketOutlook {
  const {
    sport,
    canonicalLeague,
    marketKey,
    line,
    pPush,
    isOverlappingMarket,
    expectedProbabilitySum,
    seeds,
    pSource,
    coverageRatio,
    baseQualityFlag,
    sharpMarketAvailable,
    contextQuote,
    calibrationArtifact,
  } = params;

  const orderIndices = seeds.map((_, idx) => idx);
  orderIndices.sort((i, j) => {
    const diff = seeds[j]!.p - seeds[i]!.p;
    if (Math.abs(diff) > 1e-15) return diff;
    return i - j;
  });

  const rankByIndex = new Array<number>(seeds.length);
  for (let r = 0; r < orderIndices.length; r += 1) {
    rankByIndex[orderIndices[r]!] = r + 1;
  }

  const dataQuality: OutlookDataQuality = Object.freeze({
    coverageRatio,
    flag: baseQualityFlag,
    sharpMarketAvailable,
  });

  const selections: SelectionOutlook[] = seeds.map((seed, idx) => {
    const rank = rankByIndex[idx]!;
    return Object.freeze({
      selection: seed.selection,
      label: seed.label,
      line: seed.line,
      p: seed.p,
      fairOdds: probabilityToFairOdds(seed.p),
      rank,
      isMostLikely: rank === 1,
      pSource,
      calibrationBucket: resolveCalibrationBucket(
        seed.p,
        sport,
        canonicalLeague,
        marketKey,
        calibrationArtifact,
      ),
      dataQuality,
    });
  });

  const topIdx = orderIndices[0]!;
  const topSelection = selections[topIdx]!;
  const headline: MarketHeadline = Object.freeze({
    selection: topSelection.selection,
    label: topSelection.label,
    line: topSelection.line,
    p: topSelection.p,
    fairOdds: topSelection.fairOdds,
    pSource: topSelection.pSource,
  });

  const marketContext: MarketQuoteContext | null =
    contextQuote !== null
      ? Object.freeze({
          book: contextQuote.book,
          tsCaptured: contextQuote.tsCaptured,
          overround: contextQuote.overround,
        })
      : null;

  const baseObj: MarketOutlook = {
    marketKey,
    line,
    ...(pPush !== undefined ? { pPush } : {}),
    isOverlappingMarket,
    expectedProbabilitySum,
    headline,
    selections: Object.freeze(selections),
    market: marketContext,
  };
  return Object.freeze(baseObj);
}

// ---------------------------------------------------------------------------
// Fútbol: resolución de `(lamHome, lamAway, rho)` y única matriz Dixon-Coles
// ---------------------------------------------------------------------------

function evalMatrix1X2FromLambdas(
  lamHome: number,
  lamAway: number,
  rho: number,
  maxGoals: number,
): { readonly pHome: number; readonly pDraw: number; readonly pAway: number } {
  const mat = buildDixonColesScoreMatrix(lamHome, lamAway, rho, maxGoals);
  let pH = 0.0;
  let pD = 0.0;
  let pA = 0.0;
  for (let h = 0; h < mat.length; h += 1) {
    const row = mat[h]!;
    for (let a = 0; a < row.length; a += 1) {
      const p = row[a]!;
      if (h > a) pH += p;
      else if (h === a) pD += p;
      else pA += p;
    }
  }
  const s = pH + pD + pA;
  return { pHome: pH / s, pDraw: pD / s, pAway: pA / s };
}

/**
 * Ajusta `(lamHome, lamAway)` de forma determinista para reproducir un vector `(pHome, pDraw, pAway)`
 * sobre la matriz Dixon-Coles cuando el llamador solo provee probabilidades 1X2 o el prior `base_rate`.
 */
function fitDixonColesLambdasFrom1X2(
  target: { readonly pHome: number; readonly pDraw: number; readonly pAway: number },
  rho: number,
  maxGoals: number,
): { readonly lamHome: number; readonly lamAway: number } {
  const sum = target.pHome + target.pDraw + target.pAway;
  const pH = clamp(target.pHome / sum, 0.02, 0.96);
  const pD = clamp(target.pDraw / sum, 0.02, 0.90);
  const pA = clamp(1.0 - pH - pD, 0.02, 0.96);

  const shareInit = clamp(pH / (pH + pA), 0.08, 0.92);
  let u = logit(shareInit, 1e-4);
  let v = Math.log(2.55);

  const targetDiff = pH - pA;
  const targetDraw = pD;

  const evalResidual = (uVal: number, vVal: number): readonly [number, number] => {
    const tot = clamp(Math.exp(vVal), 0.25, 8.0);
    const sh = clamp(sigmoid(uVal), 0.04, 0.96);
    const lh = clamp(tot * sh, 0.05, 10.0);
    const la = clamp(tot * (1.0 - sh), 0.05, 10.0);
    const cur = evalMatrix1X2FromLambdas(lh, la, rho, maxGoals);
    return [cur.pHome - cur.pAway - targetDiff, cur.pDraw - targetDraw];
  };

  const hStep = 1e-4;
  for (let iter = 0; iter < 28; iter += 1) {
    const [f1, f2] = evalResidual(u, v);
    const norm0 = f1 * f1 + f2 * f2;
    if (norm0 < 1e-22) break;

    const [f1u, f2u] = evalResidual(u + hStep, v);
    const [f1v, f2v] = evalResidual(u, v + hStep);
    const j11 = (f1u - f1) / hStep;
    const j21 = (f2u - f2) / hStep;
    const j12 = (f1v - f1) / hStep;
    const j22 = (f2v - f2) / hStep;
    const det = j11 * j22 - j12 * j21;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-12) break;

    const du = -(j22 * f1 - j12 * f2) / det;
    const dv = -(-j21 * f1 + j11 * f2) / det;

    let step = 1.0;
    let improved = false;
    for (let ls = 0; ls < 8; ls += 1) {
      const uTry = clamp(u + step * du, -3.2, 3.2);
      const vTry = clamp(v + step * dv, Math.log(0.25), Math.log(8.0));
      const [r1, r2] = evalResidual(uTry, vTry);
      if (r1 * r1 + r2 * r2 < norm0) {
        u = uTry;
        v = vTry;
        improved = true;
        break;
      }
      step *= 0.5;
    }
    if (!improved) break;
  }

  const finalTotal = clamp(Math.exp(v), 0.25, 8.0);
  const finalShare = clamp(sigmoid(u), 0.04, 0.96);
  return {
    lamHome: clamp(finalTotal * finalShare, 0.05, 10.0),
    lamAway: clamp(finalTotal * (1.0 - finalShare), 0.05, 10.0),
  };
}

function resolveFootballRho(
  canonicalLeague: string,
  explicitRho: number | null | undefined,
  markets2WayConfig: Markets2WayConfigArtifact,
): number {
  if (explicitRho !== undefined && explicitRho !== null && Number.isFinite(explicitRho)) {
    return clamp(explicitRho, -0.99, 0.99);
  }
  const byLeague = markets2WayConfig.dixon_coles_defaults?.dc_rho_by_league;
  const leagueRho = byLeague?.[canonicalLeague];
  if (leagueRho !== undefined && Number.isFinite(leagueRho)) {
    return leagueRho;
  }
  return markets2WayConfig.dixon_coles_defaults?.default_dc_rho ?? DEFAULT_DC_RHO;
}

function resolveFootballLambdasAndQuality(
  canonicalLeague: string,
  fb: FootballOutlookModelInput | null | undefined,
  markets2WayConfig: Markets2WayConfigArtifact,
): {
  readonly lamHome: number;
  readonly lamAway: number;
  readonly rho: number;
  readonly maxGoals: number;
  readonly modelBaseSource: "model" | "base_rate";
  readonly coverageRatio: number;
  readonly qualityFlag: OutlookDataQualityFlag;
} {
  const rho = resolveFootballRho(canonicalLeague, fb?.rho, markets2WayConfig);
  const maxGoals =
    fb?.maxGoals ??
    markets2WayConfig.dixon_coles_defaults?.default_max_goals ??
    DEFAULT_MAX_GOALS;

  // 1. Tasas directas `(lamHome, lamAway)` provistas explícitamente
  if (
    fb !== undefined &&
    fb !== null &&
    typeof fb.lamHome === "number" &&
    Number.isFinite(fb.lamHome) &&
    fb.lamHome > 0 &&
    typeof fb.lamAway === "number" &&
    Number.isFinite(fb.lamAway) &&
    fb.lamAway > 0
  ) {
    const cov =
      fb.featureCoverageRatio !== undefined &&
      fb.featureCoverageRatio !== null &&
      Number.isFinite(fb.featureCoverageRatio)
        ? clamp(fb.featureCoverageRatio, 0.0, 1.0)
        : 1.0;
    return {
      lamHome: clamp(fb.lamHome, 0.05, 25.0),
      lamAway: clamp(fb.lamAway, 0.05, 25.0),
      rho,
      maxGoals,
      modelBaseSource: "model",
      coverageRatio: cov,
      qualityFlag: cov < LOW_COVERAGE_THRESHOLD ? "low_coverage" : "ok",
    };
  }

  // 2. Inferencia desde `footballRow` + `footballModel` (`model_motor_a.json`)
  if (
    fb !== undefined &&
    fb !== null &&
    fb.footballRow !== undefined &&
    fb.footballRow !== null &&
    fb.footballModel !== undefined &&
    fb.footballModel !== null
  ) {
    const row = fb.footballRow;
    const model = fb.footballModel;
    const nBase = model.n_features_base;
    if (Array.isArray(row.features) && row.features.length === nBase && nBase > 0) {
      let validCount = 0;
      let hasNonFinite = false;
      for (let i = 0; i < nBase; i += 1) {
        const v = row.features[i];
        if (v !== null && v !== undefined) {
          if (Number.isFinite(v)) validCount += 1;
          else hasNonFinite = true;
        }
      }
      if (!hasNonFinite && validCount > 0) {
        const cov =
          fb.featureCoverageRatio !== undefined &&
          fb.featureCoverageRatio !== null &&
          Number.isFinite(fb.featureCoverageRatio)
            ? clamp(fb.featureCoverageRatio, 0.0, 1.0)
            : validCount / nBase;

        const idxLamH = model.features.indexOf("dc_lam_home");
        const idxLamA = model.features.indexOf("dc_lam_away");
        const rawLamH = idxLamH >= 0 && idxLamH < nBase ? row.features[idxLamH] : null;
        const rawLamA = idxLamA >= 0 && idxLamA < nBase ? row.features[idxLamA] : null;

        if (
          typeof rawLamH === "number" &&
          Number.isFinite(rawLamH) &&
          rawLamH > 0.02 &&
          typeof rawLamA === "number" &&
          Number.isFinite(rawLamA) &&
          rawLamA > 0.02
        ) {
          return {
            lamHome: clamp(rawLamH, 0.05, 25.0),
            lamAway: clamp(rawLamA, 0.05, 25.0),
            rho,
            maxGoals,
            modelBaseSource: "model",
            coverageRatio: cov,
            qualityFlag: cov < LOW_COVERAGE_THRESHOLD ? "low_coverage" : "ok",
          };
        }

        const pred = predictWithFallback(row, model, null, GLOBAL_HDA_RATES, {
          mode: "motor_a_only",
        });
        if (pred.dataQualityFlag !== "invalid_features") {
          const fitted = fitDixonColesLambdasFrom1X2(
            { pHome: pred.pHome, pDraw: pred.pDraw, pAway: pred.pAway },
            rho,
            maxGoals,
          );
          return {
            lamHome: fitted.lamHome,
            lamAway: fitted.lamAway,
            rho,
            maxGoals,
            modelBaseSource: "model",
            coverageRatio: cov,
            qualityFlag: cov < LOW_COVERAGE_THRESHOLD ? "low_coverage" : "ok",
          };
        }
      }
    }
  }

  // 3. Probabilidades 1X2 directas del modelo sin tasas explícitas
  if (
    fb !== undefined &&
    fb !== null &&
    fb.modelProbs1X2 !== undefined &&
    fb.modelProbs1X2 !== null &&
    Number.isFinite(fb.modelProbs1X2.pHome) &&
    Number.isFinite(fb.modelProbs1X2.pDraw) &&
    Number.isFinite(fb.modelProbs1X2.pAway) &&
    fb.modelProbs1X2.pHome > 0 &&
    fb.modelProbs1X2.pDraw > 0 &&
    fb.modelProbs1X2.pAway > 0
  ) {
    const cov =
      fb.featureCoverageRatio !== undefined &&
      fb.featureCoverageRatio !== null &&
      Number.isFinite(fb.featureCoverageRatio)
        ? clamp(fb.featureCoverageRatio, 0.0, 1.0)
        : 1.0;
    const fitted = fitDixonColesLambdasFrom1X2(fb.modelProbs1X2, rho, maxGoals);
    return {
      lamHome: fitted.lamHome,
      lamAway: fitted.lamAway,
      rho,
      maxGoals,
      modelBaseSource: "model",
      coverageRatio: cov,
      qualityFlag: cov < LOW_COVERAGE_THRESHOLD ? "low_coverage" : "ok",
    };
  }

  // 4. Fallback `base_rate` explícito cuando faltan features del modelo
  const baseFitted = fitDixonColesLambdasFrom1X2(GLOBAL_HDA_RATES, rho, maxGoals);
  return {
    lamHome: baseFitted.lamHome,
    lamAway: baseFitted.lamAway,
    rho,
    maxGoals,
    modelBaseSource: "base_rate",
    coverageRatio: 0.0,
    qualityFlag: "fallback_base_rate",
  };
}

function extractTopScorelines(
  matrix: readonly (readonly number[])[],
  pSource: PublishedProbSource,
  topK: number = 3,
): readonly ScorelineOutlook[] {
  const cells: Array<{ readonly h: number; readonly a: number; readonly p: number }> = [];
  for (let h = 0; h < matrix.length; h += 1) {
    const row = matrix[h]!;
    for (let a = 0; a < row.length; a += 1) {
      cells.push({ h, a, p: row[a]! });
    }
  }
  cells.sort((x, y) => {
    const diff = y.p - x.p;
    if (Math.abs(diff) > 1e-15) return diff;
    const totDiff = x.h + x.a - (y.h + y.a);
    if (totDiff !== 0) return totDiff;
    return y.h - x.h;
  });

  const top = cells.slice(0, topK).map((c, idx) =>
    Object.freeze({
      homeGoals: c.h,
      awayGoals: c.a,
      score: `${c.h}-${c.a}`,
      p: c.p,
      fairOdds: probabilityToFairOdds(c.p),
      rank: idx + 1,
      isMostLikely: idx === 0,
      pSource,
    }),
  );
  return Object.freeze(top);
}

function formatSignedHandicap(line: number): string {
  const clean = Object.is(line, -0) || line === 0 ? 0 : line;
  const fixed = Number.isInteger(clean) ? clean.toFixed(1) : String(clean);
  return clean > 0 ? `+${fixed}` : fixed;
}

function buildFootballMatchOutlook(params: {
  readonly input: BuildMatchOutlookInput;
  readonly canonicalLeague: string;
  readonly validQuotes: readonly ValidatedMarketQuote[];
  readonly blendArtifact: BlendWeightsArtifact;
  readonly markets2WayConfig: Markets2WayConfigArtifact;
  readonly calibrationArtifact: OutlookCalibrationArtifact;
}): MatchOutlook {
  const {
    input,
    canonicalLeague,
    validQuotes,
    blendArtifact,
    markets2WayConfig,
    calibrationArtifact,
  } = params;

  const dcResolved = resolveFootballLambdasAndQuality(
    canonicalLeague,
    input.football,
    markets2WayConfig,
  );
  const { lamHome, lamAway, rho, maxGoals, modelBaseSource, coverageRatio, qualityFlag } =
    dcResolved;

  // ÚNICA matriz Dixon-Coles para todos los mercados y marcadores exactos del partido.
  const scoreMatrix = buildDixonColesScoreMatrix(lamHome, lamAway, rho, maxGoals);
  const derived2Way = deriveAll2WayMarkets(lamHome, lamAway, rho, maxGoals, {
    ahLines: [-1.0, -0.5, 0.5, 1.0],
    totalsLines: [1.5, 2.5, 3.5],
  });

  // `derived2Way.dnb` contiene exactamente `(pH, pD, pA)` normalizados sobre la misma matriz DC:
  // `home.p_full_win = pH`, `p_push = pD`, `away.p_full_win = pA`, y `home.p_effective_win = pH / (pH + pA)`.
  const pH_dc = derived2Way.dnb.home.p_full_win;
  const pD_dc = derived2Way.dnb.p_push;
  const pA_dc = derived2Way.dnb.away.p_full_win;

  const markets: MarketOutlook[] = [];

  // 1. 1X2
  const quotes1x2 = selectBestQuotesForMarket(validQuotes, "1x2", null);
  const pub1x2 = computePublishedSimplexProbs({
    sport: "football",
    canonicalLeague,
    marketKey: "1x2",
    modelProbs: [pH_dc, pD_dc, pA_dc],
    modelBaseSource,
    sharpQuote: quotes1x2.sharpQuote,
    blendArtifact,
    calibrationArtifact,
  });
  markets.push(
    buildMarketOutlookBlock({
      sport: "football",
      canonicalLeague,
      marketKey: "1x2",
      line: null,
      isOverlappingMarket: false,
      expectedProbabilitySum: 1,
      seeds: [
        { selection: "home", label: `${input.homeTeam} (1)`, line: null, p: pub1x2.probs[0]! },
        { selection: "draw", label: "Empate (X)", line: null, p: pub1x2.probs[1]! },
        { selection: "away", label: `${input.awayTeam} (2)`, line: null, p: pub1x2.probs[2]! },
      ],
      pSource: pub1x2.pSource,
      coverageRatio,
      baseQualityFlag: qualityFlag,
      sharpMarketAvailable: pub1x2.sharpMarketAvailable,
      contextQuote: quotes1x2.contextQuote,
      calibrationArtifact,
    }),
  );

  // 2. Doble oportunidad (`1X`, `12`, `X2`): aditividad exacta de Kolmogorov sobre el simplex `1x2` publicado
  // (idéntico a la matriz DC cuando no hay cuota sharp en `1x2`, y coherente con `1x2` cuando sí la hay).
  const quotesDc = selectBestQuotesForMarket(validQuotes, "double_chance", null);
  const p1X = pub1x2.probs[0]! + pub1x2.probs[1]!;
  const p12 = pub1x2.probs[0]! + pub1x2.probs[2]!;
  const pX2 = pub1x2.probs[1]! + pub1x2.probs[2]!;
  markets.push(
    buildMarketOutlookBlock({
      sport: "football",
      canonicalLeague,
      marketKey: "double_chance",
      line: null,
      isOverlappingMarket: true,
      expectedProbabilitySum: 2,
      seeds: [
        {
          selection: "1X",
          label: `${input.homeTeam} o Empate (1X)`,
          line: null,
          p: p1X,
        },
        {
          selection: "12",
          label: `${input.homeTeam} o ${input.awayTeam} (12)`,
          line: null,
          p: p12,
        },
        {
          selection: "X2",
          label: `Empate o ${input.awayTeam} (X2)`,
          line: null,
          p: pX2,
        },
      ],
      pSource: pub1x2.pSource,
      coverageRatio,
      baseQualityFlag: qualityFlag,
      sharpMarketAvailable: pub1x2.sharpMarketAvailable,
      contextQuote: quotesDc.contextQuote,
      calibrationArtifact,
    }),
  );

  // 3–5. Totales `1.5`, `2.5`, `3.5`
  const totalsDefs: ReadonlyArray<{
    readonly key: FootballOutlookMarketKey;
    readonly line: number;
    readonly lineStr: string;
  }> = [
    { key: "totals_1_5", line: 1.5, lineStr: "1.5" },
    { key: "totals_2_5", line: 2.5, lineStr: "2.5" },
    { key: "totals_3_5", line: 3.5, lineStr: "3.5" },
  ];
  for (const tDef of totalsDefs) {
    const overDc = derived2Way.totals.over[tDef.lineStr]!.p_effective_win;
    const underDc = derived2Way.totals.under[tDef.lineStr]!.p_effective_win;
    const quotesTot = selectBestQuotesForMarket(validQuotes, "totals", tDef.line);
    const pubTot = computePublishedSimplexProbs({
      sport: "football",
      canonicalLeague,
      marketKey: tDef.key,
      modelProbs: [overDc, underDc],
      modelBaseSource,
      sharpQuote: quotesTot.sharpQuote,
      blendArtifact,
      calibrationArtifact,
    });
    markets.push(
      buildMarketOutlookBlock({
        sport: "football",
        canonicalLeague,
        marketKey: tDef.key,
        line: tDef.line,
        isOverlappingMarket: false,
        expectedProbabilitySum: 1,
        seeds: [
          {
            selection: "over",
            label: `Más de ${tDef.lineStr} goles`,
            line: tDef.line,
            p: pubTot.probs[0]!,
          },
          {
            selection: "under",
            label: `Menos de ${tDef.lineStr} goles`,
            line: tDef.line,
            p: pubTot.probs[1]!,
          },
        ],
        pSource: pubTot.pSource,
        coverageRatio,
        baseQualityFlag: qualityFlag,
        sharpMarketAvailable: pubTot.sharpMarketAvailable,
        contextQuote: quotesTot.contextQuote,
        calibrationArtifact,
      }),
    );
  }

  // 6. BTTS (`Ambos anotan`)
  const bttsYesDc = derived2Way.btts.yes.p_effective_win;
  const bttsNoDc = derived2Way.btts.no.p_effective_win;
  const quotesBtts = selectBestQuotesForMarket(validQuotes, "btts", null);
  const pubBtts = computePublishedSimplexProbs({
    sport: "football",
    canonicalLeague,
    marketKey: "btts",
    modelProbs: [bttsYesDc, bttsNoDc],
    modelBaseSource,
    sharpQuote: quotesBtts.sharpQuote,
    blendArtifact,
    calibrationArtifact,
  });
  markets.push(
    buildMarketOutlookBlock({
      sport: "football",
      canonicalLeague,
      marketKey: "btts",
      line: null,
      isOverlappingMarket: false,
      expectedProbabilitySum: 1,
      seeds: [
        { selection: "yes", label: "Ambos anotan — Sí", line: null, p: pubBtts.probs[0]! },
        { selection: "no", label: "Ambos anotan — No", line: null, p: pubBtts.probs[1]! },
      ],
      pSource: pubBtts.pSource,
      coverageRatio,
      baseQualityFlag: qualityFlag,
      sharpMarketAvailable: pubBtts.sharpMarketAvailable,
      contextQuote: quotesBtts.contextQuote,
      calibrationArtifact,
    }),
  );

  // 7. Draw No Bet (`dnb`): probabilidad condicional sin empate (`pH / (pH + pA)`), exponiendo `pPush = pD`.
  const dnbHomeDc = derived2Way.dnb.home.p_effective_win;
  const dnbAwayDc = derived2Way.dnb.away.p_effective_win;
  const quotesDnb = selectBestQuotesForMarket(validQuotes, "dnb", null);
  const pubDnb = computePublishedSimplexProbs({
    sport: "football",
    canonicalLeague,
    marketKey: "dnb",
    modelProbs: [dnbHomeDc, dnbAwayDc],
    modelBaseSource,
    sharpQuote: quotesDnb.sharpQuote,
    blendArtifact,
    calibrationArtifact,
  });
  markets.push(
    buildMarketOutlookBlock({
      sport: "football",
      canonicalLeague,
      marketKey: "dnb",
      line: null,
      pPush: derived2Way.dnb.p_push,
      isOverlappingMarket: false,
      expectedProbabilitySum: 1,
      seeds: [
        {
          selection: "home",
          label: `${input.homeTeam} (Empate no acción)`,
          line: null,
          p: pubDnb.probs[0]!,
        },
        {
          selection: "away",
          label: `${input.awayTeam} (Empate no acción)`,
          line: null,
          p: pubDnb.probs[1]!,
        },
      ],
      pSource: pubDnb.pSource,
      coverageRatio,
      baseQualityFlag: qualityFlag,
      sharpMarketAvailable: pubDnb.sharpMarketAvailable,
      contextQuote: quotesDnb.contextQuote,
      calibrationArtifact,
    }),
  );

  // 8–11. Asian Handicap (`-1.0`, `-0.5`, `+0.5`, `+1.0`)
  const ahDefs: ReadonlyArray<{
    readonly key: FootballOutlookMarketKey;
    readonly homeLine: number;
    readonly lineKey: string;
    readonly hasPush: boolean;
  }> = [
    { key: "ah_-1_0", homeLine: -1.0, lineKey: "-1", hasPush: true },
    { key: "ah_-0_5", homeLine: -0.5, lineKey: "-0.5", hasPush: false },
    { key: "ah_0_5", homeLine: 0.5, lineKey: "0.5", hasPush: false },
    { key: "ah_1_0", homeLine: 1.0, lineKey: "1", hasPush: true },
  ];
  for (const ahDef of ahDefs) {
    const paired = derived2Way.ah.paired_by_home_line[ahDef.lineKey]!;
    const homeAhDc = paired.home.p_effective_win;
    const awayAhDc = paired.away.p_effective_win;
    const quotesAh = selectBestQuotesForMarket(validQuotes, "ah", ahDef.homeLine);
    const pubAh = computePublishedSimplexProbs({
      sport: "football",
      canonicalLeague,
      marketKey: ahDef.key,
      modelProbs: [homeAhDc, awayAhDc],
      modelBaseSource,
      sharpQuote: quotesAh.sharpQuote,
      blendArtifact,
      calibrationArtifact,
    });
    const awayLine = paired.away_line;
    markets.push(
      buildMarketOutlookBlock({
        sport: "football",
        canonicalLeague,
        marketKey: ahDef.key,
        line: ahDef.homeLine,
        ...(ahDef.hasPush ? { pPush: paired.home.p_push } : {}),
        isOverlappingMarket: false,
        expectedProbabilitySum: 1,
        seeds: [
          {
            selection: "home",
            label: `${input.homeTeam} (${formatSignedHandicap(ahDef.homeLine)})`,
            line: ahDef.homeLine,
            p: pubAh.probs[0]!,
          },
          {
            selection: "away",
            label: `${input.awayTeam} (${formatSignedHandicap(awayLine)})`,
            line: awayLine,
            p: pubAh.probs[1]!,
          },
        ],
        pSource: pubAh.pSource,
        coverageRatio,
        baseQualityFlag: qualityFlag,
        sharpMarketAvailable: pubAh.sharpMarketAvailable,
        contextQuote: quotesAh.contextQuote,
        calibrationArtifact,
      }),
    );
  }

  const topScorelines = extractTopScorelines(scoreMatrix, modelBaseSource, 3);
  const marketsByKey: Partial<Record<OutlookMarketKey, MarketOutlook>> = {};
  let anySharp = false;
  for (const m of markets) {
    marketsByKey[m.marketKey] = m;
    if (m.selections.some((s) => s.dataQuality.sharpMarketAvailable)) {
      anySharp = true;
    }
  }

  return Object.freeze({
    schemaVersion: OUTLOOK_SCHEMA_VERSION,
    matchId: input.matchId.trim(),
    sport: "football",
    league: input.league.trim(),
    canonicalLeague,
    homeTeam: input.homeTeam.trim(),
    awayTeam: input.awayTeam.trim(),
    kickoffUtc: input.kickoffUtc ? input.kickoffUtc.trim() : null,
    tsDecision: input.tsDecision.trim(),
    markets: Object.freeze(markets),
    marketsByKey: Object.freeze(marketsByKey),
    topScorelines,
    dixonColesParams: Object.freeze({
      lamHome,
      lamAway,
      rho,
      maxGoals,
    }),
    dataQuality: Object.freeze({
      coverageRatio,
      flag: qualityFlag,
      sharpMarketAvailable: anySharp,
    }),
  });
}

// ---------------------------------------------------------------------------
// NFL: `moneyline` + `spread` y `totals` con línea de mercado cuando exista
// ---------------------------------------------------------------------------

function inverseNormalCdf(targetP: number): number {
  const p = clamp(targetP, 1e-6, 1.0 - 1e-6);
  let lo = -6.0;
  let hi = 6.0;
  for (let i = 0; i < 48; i += 1) {
    const mid = 0.5 * (lo + hi);
    if (normalCdf(mid) < p) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

function computeNormalSpreadProbs(
  homeLine: number,
  expectedMargin: number,
  sigmaMargin: number,
): { readonly pHome: number; readonly pAway: number; readonly pPush?: number } {
  const isIntLine = Math.abs(homeLine - Math.round(homeLine)) < 1e-9;
  if (isIntLine) {
    const threshold = -Math.round(homeLine);
    const pWinUncond = 1.0 - normalCdf((threshold + 0.5 - expectedMargin) / sigmaMargin);
    const pLossUncond = normalCdf((threshold - 0.5 - expectedMargin) / sigmaMargin);
    const pPush = Math.max(0.0, 1.0 - pWinUncond - pLossUncond);
    const active = pWinUncond + pLossUncond;
    const pHome = active > 1e-12 ? pWinUncond / active : 0.5;
    const pAway = 1.0 - pHome;
    return { pHome, pAway, pPush };
  }
  const pHome = clamp(normalCdf((expectedMargin + homeLine) / sigmaMargin), 1e-9, 1.0 - 1e-9);
  const pAway = 1.0 - pHome;
  return { pHome, pAway };
}

function computeNormalTotalsProbs(
  totalLine: number,
  expectedTotal: number,
  sigmaTotal: number,
): { readonly pOver: number; readonly pUnder: number; readonly pPush?: number } {
  const isIntLine = Math.abs(totalLine - Math.round(totalLine)) < 1e-9;
  if (isIntLine) {
    const threshold = Math.round(totalLine);
    const pOverUncond = 1.0 - normalCdf((threshold + 0.5 - expectedTotal) / sigmaTotal);
    const pUnderUncond = normalCdf((threshold - 0.5 - expectedTotal) / sigmaTotal);
    const pPush = Math.max(0.0, 1.0 - pOverUncond - pUnderUncond);
    const active = pOverUncond + pUnderUncond;
    const pOver = active > 1e-12 ? pOverUncond / active : 0.5;
    const pUnder = 1.0 - pOver;
    return { pOver, pUnder, pPush };
  }
  const pOver = clamp(normalCdf((expectedTotal - totalLine) / sigmaTotal), 1e-9, 1.0 - 1e-9);
  const pUnder = 1.0 - pOver;
  return { pOver, pUnder };
}

function resolveNFLModelProjections(nfl: NFLOutlookModelInput | null | undefined): {
  readonly pHomeCond: number;
  readonly pAwayCond: number;
  readonly pTie: number;
  readonly expectedMargin: number;
  readonly expectedTotal: number;
  readonly sigmaMargin: number;
  readonly sigmaTotal: number;
  readonly modelBaseSource: "model" | "base_rate";
  readonly coverageRatio: number;
  readonly qualityFlag: OutlookDataQualityFlag;
} {
  const sigmaMargin =
    nfl?.sigmaMargin !== undefined && Number.isFinite(nfl.sigmaMargin) && nfl.sigmaMargin > 1.0
      ? nfl.sigmaMargin
      : DEFAULT_NFL_SIGMA_MARGIN;
  const sigmaTotal =
    nfl?.sigmaTotal !== undefined && Number.isFinite(nfl.sigmaTotal) && nfl.sigmaTotal > 1.0
      ? nfl.sigmaTotal
      : DEFAULT_NFL_SIGMA_TOTAL;

  // 1. Inferencia desde `nflRow` + `nflModel` (+ `applyMinkowskiV3LiveContext` opcional)
  if (
    nfl !== undefined &&
    nfl !== null &&
    nfl.nflRow !== undefined &&
    nfl.nflRow !== null &&
    nfl.nflModel !== undefined &&
    nfl.nflModel !== null
  ) {
    const row = nfl.nflRow;
    const model = nfl.nflModel;
    const nFeat = model.n_features;
    if (Array.isArray(row.features) && row.features.length === nFeat && nFeat > 0) {
      let validCount = 0;
      let hasNonFinite = false;
      for (let i = 0; i < nFeat; i += 1) {
        const v = row.features[i];
        if (v !== null && v !== undefined) {
          if (Number.isFinite(v)) validCount += 1;
          else hasNonFinite = true;
        }
      }
      if (!hasNonFinite && validCount > 0) {
        try {
          const basePred = predictNFL(row, model);
          const livePred = applyMinkowskiV3LiveContext(
            {
              pHome: basePred.pHome,
              pDraw: basePred.pDraw,
              pAway: basePred.pAway,
              expectedTotal: nfl.expectedTotal ?? MINKOWSKI_V3_DEFAULT_PRIORS.default_expected_total_pts,
            },
            nfl.liveContext ?? null,
            nfl.liveConfig ?? null,
          );
          const denom = livePred.pHome + livePred.pAway;
          const pHomeCond = denom > 1e-12 ? livePred.pHome / denom : 0.5;
          const pAwayCond = 1.0 - pHomeCond;
          const expectedMargin =
            nfl.expectedMargin !== undefined &&
            nfl.expectedMargin !== null &&
            Number.isFinite(nfl.expectedMargin)
              ? nfl.expectedMargin
              : inverseNormalCdf(pHomeCond) * sigmaMargin;
          const cov =
            nfl.featureCoverageRatio !== undefined &&
            nfl.featureCoverageRatio !== null &&
            Number.isFinite(nfl.featureCoverageRatio)
              ? clamp(nfl.featureCoverageRatio, 0.0, 1.0)
              : validCount / nFeat;
          return {
            pHomeCond,
            pAwayCond,
            pTie: livePred.pDraw,
            expectedMargin,
            expectedTotal: livePred.expectedTotalPoints,
            sigmaMargin,
            sigmaTotal,
            modelBaseSource: "model",
            coverageRatio: cov,
            qualityFlag: cov < LOW_COVERAGE_THRESHOLD ? "low_coverage" : "ok",
          };
        } catch (err) {
          if (!(err instanceof InvalidFeaturesError)) {
            throw err;
          }
        }
      }
    }
  }

  // 2. Probabilidades o proyecciones directas del modelo NFL
  if (
    nfl !== undefined &&
    nfl !== null &&
    ((typeof nfl.pHome === "number" &&
      Number.isFinite(nfl.pHome) &&
      nfl.pHome > 0 &&
      typeof nfl.pAway === "number" &&
      Number.isFinite(nfl.pAway) &&
      nfl.pAway > 0) ||
      (typeof nfl.expectedMargin === "number" && Number.isFinite(nfl.expectedMargin)))
  ) {
    let pHomeCond: number;
    let pTie = 0.0;
    if (
      typeof nfl.pHome === "number" &&
      Number.isFinite(nfl.pHome) &&
      nfl.pHome > 0 &&
      typeof nfl.pAway === "number" &&
      Number.isFinite(nfl.pAway) &&
      nfl.pAway > 0
    ) {
      const rawDraw =
        typeof nfl.pDraw === "number" && Number.isFinite(nfl.pDraw) && nfl.pDraw >= 0
          ? nfl.pDraw
          : 0.0;
      const tot = nfl.pHome + rawDraw + nfl.pAway;
      pTie = rawDraw / tot;
      pHomeCond = nfl.pHome / (nfl.pHome + nfl.pAway);
    } else {
      pHomeCond = clamp(normalCdf(nfl.expectedMargin! / sigmaMargin), 1e-6, 1.0 - 1e-6);
    }
    const pAwayCond = 1.0 - pHomeCond;
    const expectedMargin =
      typeof nfl.expectedMargin === "number" && Number.isFinite(nfl.expectedMargin)
        ? nfl.expectedMargin
        : inverseNormalCdf(pHomeCond) * sigmaMargin;
    const expectedTotal =
      typeof nfl.expectedTotal === "number" && Number.isFinite(nfl.expectedTotal) && nfl.expectedTotal > 0
        ? nfl.expectedTotal
        : MINKOWSKI_V3_DEFAULT_PRIORS.default_expected_total_pts;
    const cov =
      nfl.featureCoverageRatio !== undefined &&
      nfl.featureCoverageRatio !== null &&
      Number.isFinite(nfl.featureCoverageRatio)
        ? clamp(nfl.featureCoverageRatio, 0.0, 1.0)
        : 1.0;

    return {
      pHomeCond,
      pAwayCond,
      pTie,
      expectedMargin,
      expectedTotal,
      sigmaMargin,
      sigmaTotal,
      modelBaseSource: "model",
      coverageRatio: cov,
      qualityFlag: cov < LOW_COVERAGE_THRESHOLD ? "low_coverage" : "ok",
    };
  }

  // 3. Fallback `base_rate` explícito NFL
  const pHomeBase = GLOBAL_NFL_BASE_RATES.pHome;
  const pAwayBase = GLOBAL_NFL_BASE_RATES.pAway;
  return {
    pHomeCond: pHomeBase,
    pAwayCond: pAwayBase,
    pTie: 0.0,
    expectedMargin: inverseNormalCdf(pHomeBase) * sigmaMargin,
    expectedTotal: MINKOWSKI_V3_DEFAULT_PRIORS.default_expected_total_pts,
    sigmaMargin,
    sigmaTotal,
    modelBaseSource: "base_rate",
    coverageRatio: 0.0,
    qualityFlag: "fallback_base_rate",
  };
}

function buildNFLMatchOutlook(params: {
  readonly input: BuildMatchOutlookInput;
  readonly canonicalLeague: string;
  readonly validQuotes: readonly ValidatedMarketQuote[];
  readonly blendArtifact: BlendWeightsArtifact;
  readonly calibrationArtifact: OutlookCalibrationArtifact;
}): MatchOutlook {
  const { input, canonicalLeague, validQuotes, blendArtifact, calibrationArtifact } = params;
  const proj = resolveNFLModelProjections(input.nfl);
  const markets: MarketOutlook[] = [];

  // 1. Moneyline NFL (2 vías condicional sin empate; `pPush` expuesto cuando `pTie > 0`)
  const quotesMl = selectBestQuotesForMarket(validQuotes, "moneyline", null);
  const pubMl = computePublishedSimplexProbs({
    sport: "nfl",
    canonicalLeague,
    marketKey: "moneyline",
    modelProbs: [proj.pHomeCond, proj.pAwayCond],
    modelBaseSource: proj.modelBaseSource,
    sharpQuote: quotesMl.sharpQuote,
    blendArtifact,
    calibrationArtifact,
  });
  markets.push(
    buildMarketOutlookBlock({
      sport: "nfl",
      canonicalLeague,
      marketKey: "moneyline",
      line: null,
      ...(proj.pTie > 0 ? { pPush: proj.pTie } : {}),
      isOverlappingMarket: false,
      expectedProbabilitySum: 1,
      seeds: [
        {
          selection: "home",
          label: `${input.homeTeam} (Ganador)`,
          line: null,
          p: pubMl.probs[0]!,
        },
        {
          selection: "away",
          label: `${input.awayTeam} (Ganador)`,
          line: null,
          p: pubMl.probs[1]!,
        },
      ],
      pSource: pubMl.pSource,
      coverageRatio: proj.coverageRatio,
      baseQualityFlag: proj.qualityFlag,
      sharpMarketAvailable: pubMl.sharpMarketAvailable,
      contextQuote: quotesMl.contextQuote,
      calibrationArtifact,
    }),
  );

  // 2. Spread NFL (solo cuando exista línea de mercado en cuotas o `spreadLine` explícita)
  const spreadLine = resolveAvailableMarketLine(validQuotes, "spread", input.nfl?.spreadLine);
  if (spreadLine !== null) {
    const spreadModel = computeNormalSpreadProbs(
      spreadLine,
      proj.expectedMargin,
      proj.sigmaMargin,
    );
    const quotesSp = selectBestQuotesForMarket(validQuotes, "spread", spreadLine);
    const pubSp = computePublishedSimplexProbs({
      sport: "nfl",
      canonicalLeague,
      marketKey: "spread",
      modelProbs: [spreadModel.pHome, spreadModel.pAway],
      modelBaseSource: proj.modelBaseSource,
      sharpQuote: quotesSp.sharpQuote,
      blendArtifact,
      calibrationArtifact,
    });
    const awaySpreadLine = spreadLine === 0 ? 0 : -spreadLine;
    markets.push(
      buildMarketOutlookBlock({
        sport: "nfl",
        canonicalLeague,
        marketKey: "spread",
        line: spreadLine,
        ...(spreadModel.pPush !== undefined ? { pPush: spreadModel.pPush } : {}),
        isOverlappingMarket: false,
        expectedProbabilitySum: 1,
        seeds: [
          {
            selection: "home",
            label: `${input.homeTeam} (${formatSignedHandicap(spreadLine)})`,
            line: spreadLine,
            p: pubSp.probs[0]!,
          },
          {
            selection: "away",
            label: `${input.awayTeam} (${formatSignedHandicap(awaySpreadLine)})`,
            line: awaySpreadLine,
            p: pubSp.probs[1]!,
          },
        ],
        pSource: pubSp.pSource,
        coverageRatio: proj.coverageRatio,
        baseQualityFlag: proj.qualityFlag,
        sharpMarketAvailable: pubSp.sharpMarketAvailable,
        contextQuote: quotesSp.contextQuote,
        calibrationArtifact,
      }),
    );
  }

  // 3. Totals NFL (solo cuando exista línea de mercado en cuotas o `totalLine` explícita)
  const totalLine = resolveAvailableMarketLine(validQuotes, "totals", input.nfl?.totalLine);
  if (totalLine !== null && totalLine > 0) {
    const totalsModel = computeNormalTotalsProbs(
      totalLine,
      proj.expectedTotal,
      proj.sigmaTotal,
    );
    const quotesTot = selectBestQuotesForMarket(validQuotes, "totals", totalLine);
    const pubTot = computePublishedSimplexProbs({
      sport: "nfl",
      canonicalLeague,
      marketKey: "totals",
      modelProbs: [totalsModel.pOver, totalsModel.pUnder],
      modelBaseSource: proj.modelBaseSource,
      sharpQuote: quotesTot.sharpQuote,
      blendArtifact,
      calibrationArtifact,
    });
    markets.push(
      buildMarketOutlookBlock({
        sport: "nfl",
        canonicalLeague,
        marketKey: "totals",
        line: totalLine,
        ...(totalsModel.pPush !== undefined ? { pPush: totalsModel.pPush } : {}),
        isOverlappingMarket: false,
        expectedProbabilitySum: 1,
        seeds: [
          {
            selection: "over",
            label: `Más de ${totalLine} pts`,
            line: totalLine,
            p: pubTot.probs[0]!,
          },
          {
            selection: "under",
            label: `Menos de ${totalLine} pts`,
            line: totalLine,
            p: pubTot.probs[1]!,
          },
        ],
        pSource: pubTot.pSource,
        coverageRatio: proj.coverageRatio,
        baseQualityFlag: proj.qualityFlag,
        sharpMarketAvailable: pubTot.sharpMarketAvailable,
        contextQuote: quotesTot.contextQuote,
        calibrationArtifact,
      }),
    );
  }

  const marketsByKey: Partial<Record<OutlookMarketKey, MarketOutlook>> = {};
  let anySharp = false;
  for (const m of markets) {
    marketsByKey[m.marketKey] = m;
    if (m.selections.some((s) => s.dataQuality.sharpMarketAvailable)) {
      anySharp = true;
    }
  }

  return Object.freeze({
    schemaVersion: OUTLOOK_SCHEMA_VERSION,
    matchId: input.matchId.trim(),
    sport: "nfl",
    league: input.league.trim(),
    canonicalLeague,
    homeTeam: input.homeTeam.trim(),
    awayTeam: input.awayTeam.trim(),
    kickoffUtc: input.kickoffUtc ? input.kickoffUtc.trim() : null,
    tsDecision: input.tsDecision.trim(),
    markets: Object.freeze(markets),
    marketsByKey: Object.freeze(marketsByKey),
    topScorelines: Object.freeze([]),
    dixonColesParams: null,
    dataQuality: Object.freeze({
      coverageRatio: proj.coverageRatio,
      flag: proj.qualityFlag,
      sharpMarketAvailable: anySharp,
    }),
  });
}

// ---------------------------------------------------------------------------
// Punto de entrada público `buildMatchOutlook(input) -> MatchOutlook`
// ---------------------------------------------------------------------------

/**
 * Construye la salida pública `MatchOutlook` ("lo más probable + cuota justa") para un partido
 * de fútbol o NFL sin incluir jamás `stake`, `kelly`, `ev` ni precios sintéticos.
 */
export function buildMatchOutlook(input: BuildMatchOutlookInput): MatchOutlook {
  if (input === null || typeof input !== "object") {
    throw new OutlookValidationError("buildMatchOutlook requiere un objeto de entrada válido");
  }
  if (typeof input.matchId !== "string" || input.matchId.trim().length === 0) {
    throw new OutlookValidationError("matchId debe ser un string no vacío");
  }
  if (input.sport !== "football" && input.sport !== "nfl") {
    throw new OutlookValidationError(
      `sport debe ser "football" o "nfl"; recibido ${String(input.sport)}`,
    );
  }
  if (typeof input.homeTeam !== "string" || input.homeTeam.trim().length === 0) {
    throw new OutlookValidationError("homeTeam debe ser un string no vacío");
  }
  if (typeof input.awayTeam !== "string" || input.awayTeam.trim().length === 0) {
    throw new OutlookValidationError("awayTeam debe ser un string no vacío");
  }
  const tsDecisionMs = parseUtcEpochMs(input.tsDecision);
  if (tsDecisionMs === null) {
    throw new OutlookValidationError(
      `tsDecision debe ser un timestamp ISO-8601 válido; recibido ${String(input.tsDecision)}`,
    );
  }
  const kickoffMs =
    input.kickoffUtc !== undefined && input.kickoffUtc !== null && input.kickoffUtc.trim().length > 0
      ? parseUtcEpochMs(input.kickoffUtc)
      : null;
  if (
    input.kickoffUtc !== undefined &&
    input.kickoffUtc !== null &&
    input.kickoffUtc.trim().length > 0 &&
    kickoffMs === null
  ) {
    throw new OutlookValidationError(
      `kickoffUtc inválido; recibido ${String(input.kickoffUtc)}`,
    );
  }

  const canonicalLeague = canonicalizeOutlookLeague(input.sport, input.league);
  const blendArtifact = input.blendArtifact ?? DEFAULT_BLEND_WEIGHTS_ARTIFACT;
  const markets2WayConfig = input.markets2WayConfig ?? DEFAULT_MARKETS_2WAY_CONFIG;
  const calibrationArtifact =
    input.calibrationArtifact ?? getDefaultOutlookCalibrationArtifact();

  const maxAgeMinutes =
    input.maxQuoteAgeMinutes !== undefined &&
    Number.isFinite(input.maxQuoteAgeMinutes) &&
    input.maxQuoteAgeMinutes > 0
      ? input.maxQuoteAgeMinutes
      : calibrationArtifact.max_sharp_age_minutes > 0
        ? calibrationArtifact.max_sharp_age_minutes
        : DEFAULT_MAX_SHARP_AGE_MINUTES;

  const combinedRawQuotes: OutlookMarketQuoteInput[] = [];
  if (Array.isArray(input.marketQuotes) && input.marketQuotes.length > 0) {
    combinedRawQuotes.push(...input.marketQuotes);
  }
  if (Array.isArray(input.oddsSnapshots) && input.oddsSnapshots.length > 0) {
    combinedRawQuotes.push(...convertSnapshotsToQuoteInputs(input.oddsSnapshots, input.matchId));
  }

  const validQuotes = validateCausalFreshQuotes(
    combinedRawQuotes,
    tsDecisionMs,
    kickoffMs,
    maxAgeMinutes,
  );

  if (input.sport === "football") {
    return buildFootballMatchOutlook({
      input,
      canonicalLeague,
      validQuotes,
      blendArtifact,
      markets2WayConfig,
      calibrationArtifact,
    });
  }

  return buildNFLMatchOutlook({
    input,
    canonicalLeague,
    validQuotes,
    blendArtifact,
    calibrationArtifact,
  });
}

/**
 * Permite registrar en memoria el artefacto `outlook_calibration_v3_2.json` generado por `B4`
 * (además de la importación estática cuando el archivo está presente en `src/data/prediction/`).
 */
export function registerDefaultOutlookCalibrationArtifact(
  artifact: OutlookCalibrationArtifact,
): void {
  if (artifact === null || typeof artifact !== "object") {
    throw new OutlookValidationError("El artefacto de calibración debe ser un objeto válido");
  }
  registeredDefaultCalibrationArtifact = artifact;
}
