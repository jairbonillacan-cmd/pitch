/**
 * PitchLab Micro-Outlook & Halves v3.6 Candidate (`EXP_V40`) —
 * Motor causal de micro-mercados de fútbol (`corners`, `yellow_cards`, `fouls`, `shots_on_target`, `shots`),
 * descomposición coherente por mitades (`1H` / `2H` Dixon-Coles) y ajuste Empirical Bayes por árbitro.
 *
 * Supera:
 *  1. El conteo crudo `k/n` multi-ventana de Scout Picks (`-21.68%` ROI, `0` ajuste rival/árbitro).
 *  2. La Binomial Negativa estática de Astra AI (`+1.84%` MAE en córners) al acoplar las tasas esperadas
 *     al guion de partido `(lamHome, lamAway)` (`goal_sup_side`, `tempo_excess`, `match_tightness`) y
 *     al prior Empirical Bayes del árbitro designado (`official_priors_v3_6.json`).
 *
 * Invariantes:
 *  - Paridad IEEE-754 `< 1e-12` frente a `run_micro_markets_experiment.py`.
 *  - Cero campos de apuesta (`stake`, `kelly`, `ev`, `tier`).
 *  - Soporte exacto de `pPush` en líneas enteras (`.0`) con `|pOver + pUnder + pPush - 1| < 1e-13`.
 */

import { devig2Way, overround } from "./devig.js";
import { clamp } from "./math.js";
import { probabilityToFairOdds, type FairOdds } from "./outlook.js";

export const SOCCER_MICRO_SCHEMA_VERSION = "soccer_micro_markets_v3.6.0" as const;

export type SoccerMicroMetricKey =
  | "corners"
  | "yellow_cards"
  | "fouls"
  | "shots_on_target"
  | "shots";

export interface SoccerMicroMetricModelSpec {
  readonly canonical_total_line: number;
  readonly alt_total_lines: readonly number[];
  readonly side_line: number;
  readonly max_k_side: number;
  readonly default_home_rate: number;
  readonly default_away_rate: number;
  readonly use_referee_multiplier: boolean;
  readonly dispersion_r_home: number;
  readonly dispersion_r_away: number;
  readonly feature_names: readonly string[];
  readonly home_coef: readonly number[];
  readonly home_intercept: number;
  readonly away_coef: readonly number[];
  readonly away_intercept: number;
}

export interface SoccerHalvesModelConfig {
  readonly base_share_1h_home: number;
  readonly base_share_1h_away: number;
  readonly ref_div_ht_share: number;
  readonly slope_abs_diff: number;
  readonly rho_1h: number;
  readonly rho_2h: number;
  readonly max_goals_half_grid: number;
}

export interface SoccerDivisionMicroPrior {
  readonly ht_goal_share: number;
  readonly metrics: Readonly<
    Record<SoccerMicroMetricKey, { readonly home_mean: number; readonly away_mean: number }>
  >;
}

export interface SoccerMicroModelArtifact {
  readonly schema_version: string;
  readonly codename: string;
  readonly version: string;
  readonly status: "candidate" | "production";
  readonly production_activated: boolean;
  readonly created_at: string;
  readonly holdout_cut_utc: string;
  readonly holdout_sealed_untouched: boolean;
  readonly kappa_team_eb: number;
  readonly kappa_ref_cards: number;
  readonly kappa_ref_fouls: number;
  readonly halves_config: SoccerHalvesModelConfig;
  readonly div_priors: Readonly<Record<string, SoccerDivisionMicroPrior>>;
  readonly metrics: Readonly<Record<SoccerMicroMetricKey, SoccerMicroMetricModelSpec>>;
}

export interface OfficialPriorEntry {
  readonly div: string;
  readonly referee: string;
  readonly games: number;
  readonly raw_yellows_pg: number;
  readonly raw_reds_pg: number;
  readonly eb_yellows_pg: number;
  readonly cards_multiplier: number;
  readonly fouls_multiplier: number;
}

export interface OfficialPriorsArtifact {
  readonly schema_version: string;
  readonly as_of_cutoff_iso: string;
  readonly holdout_sealed_untouched: boolean;
  readonly kappa_ref_cards: number;
  readonly kappa_ref_fouls: number;
  readonly n_officials: number;
  readonly officials: Readonly<Record<string, OfficialPriorEntry>>;
}

export interface MicroLineProjection {
  readonly line: number;
  readonly pOver: number;
  readonly pUnder: number;
  readonly pPush: number;
  readonly pOverConditionalNoPush: number;
  readonly pUnderConditionalNoPush: number;
  readonly fairOddsOver: FairOdds;
  readonly fairOddsUnder: FairOdds;
}

export interface MicroMetricOutlook {
  readonly metric: SoccerMicroMetricKey;
  readonly muHome: number;
  readonly muAway: number;
  readonly muTotal: number;
  readonly refereeMultiplierApplied: number;
  readonly totalLines: readonly MicroLineProjection[];
  readonly homeSideLine: MicroLineProjection;
  readonly awaySideLine: MicroLineProjection;
}

export interface HalfPeriodOutlook {
  readonly period: "first_half" | "second_half";
  readonly lamHome: number;
  readonly lamAway: number;
  readonly rho: number;
  readonly probs1X2: {
    readonly pHome: number;
    readonly pDraw: number;
    readonly pAway: number;
    readonly fairOddsHome: FairOdds;
    readonly fairOddsDraw: FairOdds;
    readonly fairOddsAway: FairOdds;
  };
  readonly overUnder05: MicroLineProjection;
  readonly overUnder15: MicroLineProjection;
  readonly btts: {
    readonly pYes: number;
    readonly pNo: number;
    readonly fairOddsYes: FairOdds;
    readonly fairOddsNo: FairOdds;
  };
}

export interface SoccerMicroMatchOutlook {
  readonly schemaVersion: typeof SOCCER_MICRO_SCHEMA_VERSION;
  readonly matchId: string;
  readonly div: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly lamHomeFt: number;
  readonly lamAwayFt: number;
  readonly refereeName: string | null;
  readonly refereeCardsMultiplier: number;
  readonly refereeFoulsMultiplier: number;
  readonly metrics: Readonly<Record<SoccerMicroMetricKey, MicroMetricOutlook>>;
  readonly firstHalf: HalfPeriodOutlook;
  readonly secondHalf: HalfPeriodOutlook;
}

/**
 * PMF Binomial Negativa exacta en `0..maxK` usando únicamente aritmética elemental IEEE-754.
 * Espejo bit a bit de `nb_pmf_exact` en Python.
 */
export function computeNegativeBinomialPmfExact(
  mu: number,
  rDisp: number,
  maxK: number,
): Float64Array {
  const muC = clamp(mu, 0.02, 45.0);
  const rC = clamp(rDisp, 0.35, 250.0);
  const out = new Float64Array(maxK + 1);
  const p0Ratio = rC / (rC + muC);
  const qRatio = muC / (rC + muC);
  out[0] = Math.exp(rC * Math.log(p0Ratio));
  for (let k = 1; k <= maxK; k += 1) {
    out[k] = out[k - 1]! * ((k - 1.0 + rC) / k) * qRatio;
  }
  let s = 0.0;
  for (let k = 0; k <= maxK; k += 1) s += out[k]!;
  if (s > 0.0) {
    for (let k = 0; k <= maxK; k += 1) out[k] = out[k]! / s;
  } else {
    out[0] = 1.0;
  }
  return out;
}

export function convolveDiscretePmfExact(
  pmfH: Float64Array,
  pmfA: Float64Array,
): Float64Array {
  const nh = pmfH.length;
  const na = pmfA.length;
  const tot = new Float64Array(nh + na - 1);
  for (let i = 0; i < nh; i += 1) {
    const pi = pmfH[i]!;
    if (pi <= 0.0) continue;
    for (let j = 0; j < na; j += 1) {
      tot[i + j] = tot[i + j]! + pi * pmfA[j]!;
    }
  }
  let s = 0.0;
  for (let k = 0; k < tot.length; k += 1) s += tot[k]!;
  if (s > 0.0) {
    for (let k = 0; k < tot.length; k += 1) tot[k] = tot[k]! / s;
  }
  return tot;
}

export function projectLineFromPmf(pmf: Float64Array, line: number): MicroLineProjection {
  const isInt = Math.abs(line - Math.round(line)) < 1e-9;
  let pOver: number;
  let pUnder: number;
  let pPush: number;

  if (isInt) {
    const kLine = Math.round(line);
    pPush = kLine >= 0 && kLine < pmf.length ? pmf[kLine]! : 0.0;
    let uSum = 0.0;
    const stop = Math.max(0, Math.min(kLine, pmf.length));
    for (let k = 0; k < stop; k += 1) uSum += pmf[k]!;
    pUnder = uSum;
    pOver = Math.max(0.0, 1.0 - pUnder - pPush);
  } else {
    const kFloor = Math.floor(line);
    let uSum = 0.0;
    const stop = Math.max(0, Math.min(kFloor + 1, pmf.length));
    for (let k = 0; k < stop; k += 1) uSum += pmf[k]!;
    pUnder = uSum;
    pOver = Math.max(0.0, 1.0 - pUnder);
    pPush = 0.0;
  }

  const active = pOver + pUnder;
  const pOverCond = active > 1e-12 ? clamp(pOver / active, 0.001, 0.999) : 0.5;
  const pUnderCond = 1.0 - pOverCond;

  return Object.freeze({
    line,
    pOver,
    pUnder,
    pPush,
    pOverConditionalNoPush: pOverCond,
    pUnderConditionalNoPush: pUnderCond,
    fairOddsOver: probabilityToFairOdds(pOverCond),
    fairOddsUnder: probabilityToFairOdds(pUnderCond),
  });
}

export function buildSmallDixonColesMatrixExact(
  lamHome: number,
  lamAway: number,
  rho: number,
  maxGoals: number = 6,
): Float64Array[] {
  const lh = clamp(lamHome, 0.02, 8.0);
  const la = clamp(lamAway, 0.02, 8.0);
  const r = clamp(rho, -0.35, 0.25);
  const size = maxGoals + 1;
  const pmfH = new Float64Array(size);
  const pmfA = new Float64Array(size);
  pmfH[0] = Math.exp(-lh);
  pmfA[0] = Math.exp(-la);
  for (let k = 1; k < size; k += 1) {
    pmfH[k] = (pmfH[k - 1]! * lh) / k;
    pmfA[k] = (pmfA[k - 1]! * la) / k;
  }

  const mat: Float64Array[] = [];
  let sum = 0.0;
  for (let h = 0; h < size; h += 1) {
    const row = new Float64Array(size);
    for (let a = 0; a < size; a += 1) {
      let tau = 1.0;
      if (h === 0 && a === 0) tau = Math.max(0.0, 1.0 - lh * la * r);
      else if (h === 1 && a === 0) tau = Math.max(0.0, 1.0 + la * r);
      else if (h === 0 && a === 1) tau = Math.max(0.0, 1.0 + lh * r);
      else if (h === 1 && a === 1) tau = Math.max(0.0, 1.0 - r);
      const v = tau * pmfH[h]! * pmfA[a]!;
      row[a] = v;
      sum += v;
    }
    mat.push(row);
  }
  if (sum > 0.0) {
    for (let h = 0; h < size; h += 1) {
      const row = mat[h]!;
      for (let a = 0; a < size; a += 1) row[a] = row[a]! / sum;
    }
  }
  return mat;
}

function summarizeHalfMatrix(
  period: "first_half" | "second_half",
  lamHome: number,
  lamAway: number,
  rho: number,
  maxGoals: number,
): HalfPeriodOutlook {
  const mat = buildSmallDixonColesMatrixExact(lamHome, lamAway, rho, maxGoals);
  const size = mat.length;
  let pH = 0.0;
  let pD = 0.0;
  let pA = 0.0;
  let pBttsYes = 0.0;
  const totPmf = new Float64Array(2 * maxGoals + 1);

  for (let h = 0; h < size; h += 1) {
    const row = mat[h]!;
    for (let a = 0; a < size; a += 1) {
      const p = row[a]!;
      if (h > a) pH += p;
      else if (h === a) pD += p;
      else pA += p;
      if (h >= 1 && a >= 1) pBttsYes += p;
      totPmf[h + a] = totPmf[h + a]! + p;
    }
  }

  const pBttsNo = Math.max(0.0, 1.0 - pBttsYes);
  return Object.freeze({
    period,
    lamHome,
    lamAway,
    rho,
    probs1X2: Object.freeze({
      pHome: pH,
      pDraw: pD,
      pAway: pA,
      fairOddsHome: probabilityToFairOdds(clamp(pH, 0.001, 0.999)),
      fairOddsDraw: probabilityToFairOdds(clamp(pD, 0.001, 0.999)),
      fairOddsAway: probabilityToFairOdds(clamp(pA, 0.001, 0.999)),
    }),
    overUnder05: projectLineFromPmf(totPmf, 0.5),
    overUnder15: projectLineFromPmf(totPmf, 1.5),
    btts: Object.freeze({
      pYes: pBttsYes,
      pNo: pBttsNo,
      fairOddsYes: probabilityToFairOdds(clamp(pBttsYes, 0.001, 0.999)),
      fairOddsNo: probabilityToFairOdds(clamp(pBttsNo, 0.001, 0.999)),
    }),
  });
}

export function resolveRefereeMultipliers(params: {
  readonly div: string;
  readonly refereeName?: string | null;
  readonly explicitCardsMultiplier?: number | null;
  readonly explicitFoulsMultiplier?: number | null;
  readonly officialPriors?: OfficialPriorsArtifact | null;
}): { readonly cardsMultiplier: number; readonly foulsMultiplier: number } {
  if (
    typeof params.explicitCardsMultiplier === "number" &&
    Number.isFinite(params.explicitCardsMultiplier) &&
    typeof params.explicitFoulsMultiplier === "number" &&
    Number.isFinite(params.explicitFoulsMultiplier)
  ) {
    return {
      cardsMultiplier: clamp(params.explicitCardsMultiplier, 0.68, 1.42),
      foulsMultiplier: clamp(params.explicitFoulsMultiplier, 0.75, 1.32),
    };
  }
  const refClean = (params.refereeName ?? "").trim().replace(/\s+/g, " ");
  if (refClean && params.officialPriors) {
    const entry = params.officialPriors.officials[`${params.div}::${refClean}`];
    if (entry) {
      return {
        cardsMultiplier: clamp(entry.cards_multiplier, 0.68, 1.42),
        foulsMultiplier: clamp(entry.fouls_multiplier, 0.75, 1.32),
      };
    }
  }
  return { cardsMultiplier: 1.0, foulsMultiplier: 1.0 };
}

export interface BuildSoccerMicroOutlookInput {
  readonly matchId: string;
  readonly div: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly lamHome: number;
  readonly lamAway: number;
  readonly refereeName?: string | null;
  readonly explicitRefCardsMultiplier?: number | null;
  readonly explicitRefFoulsMultiplier?: number | null;
  readonly baseRatesByMetric?: Partial<
    Record<SoccerMicroMetricKey, { readonly baseHome: number; readonly baseAway: number }>
  >;
  readonly modelArtifact: SoccerMicroModelArtifact;
  readonly officialPriors?: OfficialPriorsArtifact | null;
}

export function buildSoccerMicroMatchOutlook(
  input: BuildSoccerMicroOutlookInput,
): SoccerMicroMatchOutlook {
  const art = input.modelArtifact;
  const lh = clamp(input.lamHome, 0.05, 8.0);
  const la = clamp(input.lamAway, 0.05, 8.0);

  const { cardsMultiplier, foulsMultiplier } = resolveRefereeMultipliers({
    div: input.div,
    refereeName: input.refereeName,
    explicitCardsMultiplier: input.explicitRefCardsMultiplier,
    explicitFoulsMultiplier: input.explicitRefFoulsMultiplier,
    officialPriors: input.officialPriors,
  });

  const supH = lh - la;
  const supA = -supH;
  const tempoExc = lh + la - 2.65;
  const tightness = Math.exp(-Math.abs(supH)) - 0.55;

  const divPrior = art.div_priors[input.div];
  const metricKeys: readonly SoccerMicroMetricKey[] = [
    "corners",
    "yellow_cards",
    "fouls",
    "shots_on_target",
    "shots",
  ];

  const metricsOut = {} as Record<SoccerMicroMetricKey, MicroMetricOutlook>;

  for (const q of metricKeys) {
    const spec = art.metrics[q];
    const overrideBase = input.baseRatesByMetric?.[q];
    const bh =
      overrideBase?.baseHome ?? divPrior?.metrics[q]?.home_mean ?? spec.default_home_rate;
    const ba =
      overrideBase?.baseAway ?? divPrior?.metrics[q]?.away_mean ?? spec.default_away_rate;

    const refMult =
      q === "yellow_cards" ? cardsMultiplier : q === "fouls" ? foulsMultiplier : 1.0;
    const logRef = Math.log(refMult);

    const xh = [Math.log(Math.max(bh, 0.1)), supH, tempoExc, tightness, logRef];
    const xa = [Math.log(Math.max(ba, 0.1)), supA, tempoExc, tightness, logRef];

    let etaH = spec.home_intercept;
    let etaA = spec.away_intercept;
    for (let i = 0; i < 5; i += 1) {
      etaH += spec.home_coef[i]! * xh[i]!;
      etaA += spec.away_coef[i]! * xa[i]!;
    }

    const muHome = clamp(Math.exp(etaH), 0.15, 35.0);
    const muAway = clamp(Math.exp(etaA), 0.15, 35.0);

    const pmfH = computeNegativeBinomialPmfExact(muHome, spec.dispersion_r_home, spec.max_k_side);
    const pmfA = computeNegativeBinomialPmfExact(muAway, spec.dispersion_r_away, spec.max_k_side);
    const pmfTot = convolveDiscretePmfExact(pmfH, pmfA);

    const totalLines = spec.alt_total_lines.map((ln) => projectLineFromPmf(pmfTot, ln));
    metricsOut[q] = Object.freeze({
      metric: q,
      muHome,
      muAway,
      muTotal: muHome + muAway,
      refereeMultiplierApplied: refMult,
      totalLines: Object.freeze(totalLines),
      homeSideLine: projectLineFromPmf(pmfH, spec.side_line),
      awaySideLine: projectLineFromPmf(pmfA, spec.side_line),
    });
  }

  // Mitades 1H / 2H coherentes con (lamHome, lamAway)
  const hcfg = art.halves_config;
  const dsh = divPrior?.ht_goal_share ?? hcfg.ref_div_ht_share;
  const adjSh = dsh / hcfg.ref_div_ht_share;
  const absDiff = Math.abs(lh - la);
  const thH = clamp(
    hcfg.base_share_1h_home * adjSh + hcfg.slope_abs_diff * absDiff,
    0.36,
    0.52,
  );
  const thA = clamp(
    hcfg.base_share_1h_away * adjSh + hcfg.slope_abs_diff * absDiff,
    0.36,
    0.52,
  );

  const lam1hH = lh * thH;
  const lam1hA = la * thA;
  const lam2hH = lh - lam1hH;
  const lam2hA = la - lam1hA;

  const firstHalf = summarizeHalfMatrix(
    "first_half",
    lam1hH,
    lam1hA,
    hcfg.rho_1h,
    hcfg.max_goals_half_grid,
  );
  const secondHalf = summarizeHalfMatrix(
    "second_half",
    lam2hH,
    lam2hA,
    hcfg.rho_2h,
    hcfg.max_goals_half_grid,
  );

  return Object.freeze({
    schemaVersion: SOCCER_MICRO_SCHEMA_VERSION,
    matchId: input.matchId,
    div: input.div,
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    lamHomeFt: lh,
    lamAwayFt: la,
    refereeName: input.refereeName ?? null,
    refereeCardsMultiplier: cardsMultiplier,
    refereeFoulsMultiplier: foulsMultiplier,
    metrics: Object.freeze(metricsOut),
    firstHalf,
    secondHalf,
  });
}

/**
 * Compara de forma informativa una línea de micro-mercado frente a un par de cuotas reales
 * desmarginadas mediante `devig2Way(..., "adaptive")` (0 stakes, 0 Kelly).
 */
export function compareMicroLineWithMarketQuote(params: {
  readonly lineProjection: MicroLineProjection;
  readonly oddsOver: number;
  readonly oddsUnder: number;
}): {
  readonly fairProbOver: number;
  readonly marketProbOverNoVig: number;
  readonly marketOverround: number;
  readonly probDeltaVsNoVig: number;
} {
  const dev = devig2Way(params.oddsOver, params.oddsUnder, "adaptive");
  const ov = overround([params.oddsOver, params.oddsUnder]);
  return Object.freeze({
    fairProbOver: params.lineProjection.pOverConditionalNoPush,
    marketProbOverNoVig: dev.pHome,
    marketOverround: ov,
    probDeltaVsNoVig: params.lineProjection.pOverConditionalNoPush - dev.pHome,
  });
}

// ============================================================================
// PitchLab Bivariate Micro-Markets v4.0 (`EXP_V44`: Venue-Split + Cross-Metric + Sarmanov Copula)
// ============================================================================

export const SOCCER_MICRO_V4_SCHEMA_VERSION = "soccer_micro_markets_v4.0.0" as const;

export interface SoccerMicroMetricModelSpecV4 {
  readonly canonical_total_line: number;
  readonly alt_total_lines: readonly number[];
  readonly handicap_lines: readonly number[];
  readonly side_line: number;
  readonly max_k_side: number;
  readonly default_home_rate: number;
  readonly default_away_rate: number;
  readonly dispersion_r_home: number;
  readonly dispersion_r_away: number;
  readonly copula_omega: number;
  readonly feature_names: readonly string[];
  readonly home_coef: readonly number[];
  readonly home_intercept: number;
  readonly away_coef: readonly number[];
  readonly away_intercept: number;
}

export interface SoccerMicroModelArtifactV4 {
  readonly schema_version: string;
  readonly codename: string;
  readonly version: string;
  readonly status: "candidate" | "production";
  readonly production_activated: boolean;
  readonly created_at: string;
  readonly holdout_cut_utc: string;
  readonly holdout_sealed_untouched: boolean;
  readonly halves_config: SoccerHalvesModelConfig;
  readonly div_priors: Readonly<Record<string, SoccerDivisionMicroPrior>>;
  readonly metrics: Readonly<Record<SoccerMicroMetricKey, SoccerMicroMetricModelSpecV4>>;
}

export interface MicroHandicapProjectionV4 {
  readonly handicapHome: number;
  readonly pHomeCover: number;
  readonly pAwayCover: number;
  readonly pPush: number;
  readonly pHomeCoverNoPush: number;
  readonly pAwayCoverNoPush: number;
  readonly fairOddsHomeCover: FairOdds;
  readonly fairOddsAwayCover: FairOdds;
}

export interface MicroBivariateMetricOutlookV4 extends MicroMetricOutlook {
  readonly copulaOmega: number;
  readonly side1X2: {
    readonly pHomeMost: number;
    readonly pTie: number;
    readonly pAwayMost: number;
    readonly fairOddsHomeMost: FairOdds;
    readonly fairOddsTie: FairOdds;
    readonly fairOddsAwayMost: FairOdds;
  };
  readonly handicapLines: readonly MicroHandicapProjectionV4[];
}

export interface SoccerMicroMatchOutlookV4 {
  readonly schemaVersion: typeof SOCCER_MICRO_V4_SCHEMA_VERSION;
  readonly matchId: string;
  readonly div: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly lamHomeFt: number;
  readonly lamAwayFt: number;
  readonly metrics: Readonly<Record<SoccerMicroMetricKey, MicroBivariateMetricOutlookV4>>;
  readonly firstHalf: HalfPeriodOutlook;
  readonly secondHalf: HalfPeriodOutlook;
}

function buildCenteredSarmanovBasis(
  pmf: Float64Array,
  mu: number,
  rDisp: number,
): Float64Array {
  const n = pmf.length;
  const raw = new Float64Array(n);
  const sigma = Math.sqrt(Math.max(mu + (mu * mu) / Math.max(rDisp, 0.5), 0.25));
  let meanVal = 0.0;
  for (let k = 0; k < n; k += 1) {
    const z = (k - mu) / sigma;
    // tanh(z) usando exp elemental IEEE-754 idéntico en Python y V8
    const e2 = Math.exp(-2.0 * Math.abs(z));
    const th = z >= 0.0 ? (1.0 - e2) / (1.0 + e2) : -(1.0 - e2) / (1.0 + e2);
    raw[k] = th;
    meanVal += pmf[k]! * th;
  }
  let maxAbs = 1e-9;
  for (let k = 0; k < n; k += 1) {
    const c = raw[k]! - meanVal;
    raw[k] = c;
    if (Math.abs(c) > maxAbs) maxAbs = Math.abs(c);
  }
  const out = new Float64Array(n);
  for (let k = 0; k < n; k += 1) {
    out[k] = raw[k]! / maxAbs;
  }
  return out;
}

/**
 * Construye la distribución conjunta bivariada `P(K_H = i, K_A = j)` mediante núcleo acotado de Sarmanov:
 *  - Preserva exactamente las marginales Binomial Negativa `pmfH` y `pmfA` (`< 1e-15`).
 *  - `omega < 0` modela asedio territorial (córners/tiros); `omega > 0` modela contagio disciplinario (tarjetas/faltas).
 *  - Devuelve simultáneamente `pmfTotal`, `side1X2` y `handicapLines`.
 */
export function buildBivariateSarmanovNbSummaryV4(params: {
  readonly muHome: number;
  readonly muAway: number;
  readonly rHome: number;
  readonly rAway: number;
  readonly maxKSide: number;
  readonly copulaOmega: number;
  readonly handicapLines: readonly number[];
}): {
  readonly pmfHome: Float64Array;
  readonly pmfAway: Float64Array;
  readonly pmfTotal: Float64Array;
  readonly pHomeMost: number;
  readonly pTie: number;
  readonly pAwayMost: number;
  readonly handicaps: readonly MicroHandicapProjectionV4[];
} {
  const pmfH = computeNegativeBinomialPmfExact(params.muHome, params.rHome, params.maxKSide);
  const pmfA = computeNegativeBinomialPmfExact(params.muAway, params.rAway, params.maxKSide);
  const phiH = buildCenteredSarmanovBasis(pmfH, params.muHome, params.rHome);
  const phiA = buildCenteredSarmanovBasis(pmfA, params.muAway, params.rAway);
  const omega = clamp(params.copulaOmega, -0.85, 0.85);

  const nh = pmfH.length;
  const na = pmfA.length;
  const pmfTotal = new Float64Array(nh + na - 1);
  // Diferencia `d = i - j` indexada en `d + (na - 1)` (`0 .. nh + na - 2`)
  const diffOffset = na - 1;
  const pmfDiff = new Float64Array(nh + na - 1);

  let pHomeMost = 0.0;
  let pTie = 0.0;
  let pAwayMost = 0.0;
  let totalMass = 0.0;

  for (let i = 0; i < nh; i += 1) {
    const ph = pmfH[i]!;
    if (ph <= 0.0) continue;
    const fH = phiH[i]!;
    for (let j = 0; j < na; j += 1) {
      const pa = pmfA[j]!;
      if (pa <= 0.0) continue;
      const w = Math.max(0.0, 1.0 + omega * fH * phiA[j]!);
      const pij = ph * pa * w;
      totalMass += pij;
      pmfTotal[i + j] = pmfTotal[i + j]! + pij;
      pmfDiff[i - j + diffOffset] = pmfDiff[i - j + diffOffset]! + pij;
      if (i > j) pHomeMost += pij;
      else if (i === j) pTie += pij;
      else pAwayMost += pij;
    }
  }

  const invM = totalMass > 0.0 ? 1.0 / totalMass : 1.0;
  for (let k = 0; k < pmfTotal.length; k += 1) pmfTotal[k] = pmfTotal[k]! * invM;
  for (let k = 0; k < pmfDiff.length; k += 1) pmfDiff[k] = pmfDiff[k]! * invM;
  pHomeMost *= invM;
  pTie *= invM;
  pAwayMost *= invM;

  const handicaps: MicroHandicapProjectionV4[] = params.handicapLines.map((hc) => {
    let pHCov = 0.0;
    let pACov = 0.0;
    let pPush = 0.0;
    for (let idx = 0; idx < pmfDiff.length; idx += 1) {
      const p = pmfDiff[idx]!;
      if (p <= 0.0) continue;
      const diffVal = idx - diffOffset + hc;
      if (Math.abs(diffVal) < 1e-9) pPush += p;
      else if (diffVal > 0.0) pHCov += p;
      else pACov += p;
    }
    const act = pHCov + pACov;
    const phCond = act > 1e-12 ? clamp(pHCov / act, 0.001, 0.999) : 0.5;
    const paCond = 1.0 - phCond;
    return Object.freeze({
      handicapHome: hc,
      pHomeCover: pHCov,
      pAwayCover: pACov,
      pPush,
      pHomeCoverNoPush: phCond,
      pAwayCoverNoPush: paCond,
      fairOddsHomeCover: probabilityToFairOdds(phCond),
      fairOddsAwayCover: probabilityToFairOdds(paCond),
    });
  });

  return {
    pmfHome: pmfH,
    pmfAway: pmfA,
    pmfTotal,
    pHomeMost,
    pTie,
    pAwayMost,
    handicaps: Object.freeze(handicaps),
  };
}

export interface MicroFeatureVectorInputV4 {
  readonly homeFeatures8: readonly number[];
  readonly awayFeatures8: readonly number[];
}

export function buildSoccerMicroMatchOutlookV4(params: {
  readonly matchId: string;
  readonly div: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly lamHome: number;
  readonly lamAway: number;
  readonly featuresByMetric: Readonly<Record<SoccerMicroMetricKey, MicroFeatureVectorInputV4>>;
  readonly modelArtifact: SoccerMicroModelArtifactV4;
}): SoccerMicroMatchOutlookV4 {
  const art = params.modelArtifact;
  const lh = clamp(params.lamHome, 0.05, 8.0);
  const la = clamp(params.lamAway, 0.05, 8.0);

  const metricKeys: readonly SoccerMicroMetricKey[] = [
    "corners",
    "yellow_cards",
    "fouls",
    "shots_on_target",
    "shots",
  ];
  const metricsOut = {} as Record<SoccerMicroMetricKey, MicroBivariateMetricOutlookV4>;

  for (const q of metricKeys) {
    const spec = art.metrics[q];
    const fv = params.featuresByMetric[q];
    let etaH = spec.home_intercept;
    let etaA = spec.away_intercept;
    for (let i = 0; i < spec.home_coef.length; i += 1) {
      etaH += spec.home_coef[i]! * fv.homeFeatures8[i]!;
      etaA += spec.away_coef[i]! * fv.awayFeatures8[i]!;
    }
    const muHome = clamp(Math.exp(etaH), 0.15, 35.0);
    const muAway = clamp(Math.exp(etaA), 0.15, 35.0);

    const biv = buildBivariateSarmanovNbSummaryV4({
      muHome,
      muAway,
      rHome: spec.dispersion_r_home,
      rAway: spec.dispersion_r_away,
      maxKSide: spec.max_k_side,
      copulaOmega: spec.copula_omega,
      handicapLines: spec.handicap_lines,
    });

    const totalLines = spec.alt_total_lines.map((ln) => projectLineFromPmf(biv.pmfTotal, ln));
    metricsOut[q] = Object.freeze({
      metric: q,
      muHome,
      muAway,
      muTotal: muHome + muAway,
      refereeMultiplierApplied: Math.exp(fv.homeFeatures8[7] ?? 0.0),
      copulaOmega: spec.copula_omega,
      totalLines: Object.freeze(totalLines),
      homeSideLine: projectLineFromPmf(biv.pmfHome, spec.side_line),
      awaySideLine: projectLineFromPmf(biv.pmfAway, spec.side_line),
      side1X2: Object.freeze({
        pHomeMost: biv.pHomeMost,
        pTie: biv.pTie,
        pAwayMost: biv.pAwayMost,
        fairOddsHomeMost: probabilityToFairOdds(clamp(biv.pHomeMost, 0.001, 0.999)),
        fairOddsTie: probabilityToFairOdds(clamp(biv.pTie, 0.001, 0.999)),
        fairOddsAwayMost: probabilityToFairOdds(clamp(biv.pAwayMost, 0.001, 0.999)),
      }),
      handicapLines: biv.handicaps,
    });
  }

  const divPrior = art.div_priors[params.div];
  const hcfg = art.halves_config;
  const dsh = divPrior?.ht_goal_share ?? hcfg.ref_div_ht_share;
  const adjSh = dsh / hcfg.ref_div_ht_share;
  const absDiff = Math.abs(lh - la);
  const thH = clamp(hcfg.base_share_1h_home * adjSh + hcfg.slope_abs_diff * absDiff, 0.36, 0.52);
  const thA = clamp(hcfg.base_share_1h_away * adjSh + hcfg.slope_abs_diff * absDiff, 0.36, 0.52);

  const lam1hH = lh * thH;
  const lam1hA = la * thA;
  const firstHalf = summarizeHalfMatrix("first_half", lam1hH, lam1hA, hcfg.rho_1h, hcfg.max_goals_half_grid);
  const secondHalf = summarizeHalfMatrix(
    "second_half",
    lh - lam1hH,
    la - lam1hA,
    hcfg.rho_2h,
    hcfg.max_goals_half_grid,
  );

  return Object.freeze({
    schemaVersion: SOCCER_MICRO_V4_SCHEMA_VERSION,
    matchId: params.matchId,
    div: params.div,
    homeTeam: params.homeTeam,
    awayTeam: params.awayTeam,
    lamHomeFt: lh,
    lamAwayFt: la,
    metrics: Object.freeze(metricsOut),
    firstHalf,
    secondHalf,
  });
}

// ============================================================================
// PitchLab Non-Linear HGB-Poisson & Disciplinary Micro-Markets v5.0 (`EXP_V51`)
// ============================================================================

export const SOCCER_MICRO_V5_SCHEMA_VERSION = "soccer_micro_markets_v5.0.0" as const;

export interface SerializedPoissonGbmTree {
  readonly n_nodes: number;
  readonly is_leaf: readonly number[];
  readonly feature_idx: readonly number[];
  readonly num_threshold: readonly number[];
  readonly left: readonly number[];
  readonly right: readonly number[];
  readonly value: readonly number[];
  readonly missing_go_to_left: readonly number[];
}

export interface SerializedPoissonGbmRegressor {
  readonly baseline_prediction: number;
  readonly trees: readonly SerializedPoissonGbmTree[];
}

export interface SoccerMicroMetricModelSpecV5 extends SoccerMicroMetricModelSpecV4 {
  readonly w_hgb_home: number;
  readonly w_hgb_away: number;
  readonly home_hgb: SerializedPoissonGbmRegressor;
  readonly away_hgb: SerializedPoissonGbmRegressor;
}

export interface SoccerRedCardsModelSpecV5 {
  readonly default_home_rate: number;
  readonly default_away_rate: number;
  readonly dispersion_r_home: number;
  readonly dispersion_r_away: number;
  readonly max_k_side: number;
  readonly copula_omega: number;
  readonly booking_points_omega_yr: number;
  readonly booking_points_lines: readonly number[];
  readonly feature_names: readonly string[];
  readonly home_coef: readonly number[];
  readonly home_intercept: number;
  readonly away_coef: readonly number[];
  readonly away_intercept: number;
  readonly w_hgb_home: number;
  readonly w_hgb_away: number;
  readonly home_hgb: SerializedPoissonGbmRegressor;
  readonly away_hgb: SerializedPoissonGbmRegressor;
}

export interface SoccerMicroModelArtifactV5 {
  readonly schema_version: string;
  readonly codename: string;
  readonly version: string;
  readonly status: "candidate" | "production";
  readonly production_activated: boolean;
  readonly created_at: string;
  readonly holdout_cut_utc: string;
  readonly holdout_sealed_untouched: boolean;
  readonly halves_config: SoccerHalvesModelConfig;
  readonly div_priors: Readonly<
    Record<
      string,
      SoccerDivisionMicroPrior & {
        readonly red_cards?: { readonly home_mean: number; readonly away_mean: number };
      }
    >
  >;
  readonly metrics: Readonly<Record<SoccerMicroMetricKey, SoccerMicroMetricModelSpecV5>>;
  readonly red_cards_model: SoccerRedCardsModelSpecV5;
}

export interface RedCardsOutlookV5 {
  readonly muHome: number;
  readonly muAway: number;
  readonly muTotal: number;
  readonly pRedCardMatch: number;
  readonly pNoRedCardMatch: number;
  readonly pRedCardHome: number;
  readonly pRedCardAway: number;
  readonly fairOddsRedCardMatch: FairOdds;
  readonly fairOddsNoRedCardMatch: FairOdds;
  readonly totalOver05: MicroLineProjection;
}

export interface BookingPointsOutlookV5 {
  readonly formula: "10_per_yellow_plus_25_per_red";
  readonly expectedBookingPoints: number;
  readonly copulaOmegaYellowRed: number;
  readonly lines: readonly MicroLineProjection[];
}

export interface SoccerMicroMatchOutlookV5 {
  readonly schemaVersion: typeof SOCCER_MICRO_V5_SCHEMA_VERSION;
  readonly matchId: string;
  readonly div: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly lamHomeFt: number;
  readonly lamAwayFt: number;
  readonly metrics: Readonly<Record<SoccerMicroMetricKey, MicroBivariateMetricOutlookV4>>;
  readonly redCards: RedCardsOutlookV5;
  readonly bookingPoints: BookingPointsOutlookV5;
  readonly firstHalf: HalfPeriodOutlook;
  readonly secondHalf: HalfPeriodOutlook;
}

/**
 * Recorre en TypeScript puro un `HistGradientBoostingRegressor(loss="poisson")` serializado,
 * devolviendo el predictor lineal en escala log-tasa `eta_hgb = baseline + sum_t tree_t(x)`.
 * Paridad IEEE-754 `< 1e-15` frente a `predict_serialized_poisson_gbm_eta` en Python.
 */
export function evaluateMicroPoissonGbmExact(
  features: readonly number[],
  model: SerializedPoissonGbmRegressor,
): number {
  let eta = model.baseline_prediction;
  for (let t = 0; t < model.trees.length; t += 1) {
    const tr = model.trees[t]!;
    let node = 0;
    while (tr.is_leaf[node] === 0) {
      const fIdx = tr.feature_idx[node]!;
      const xVal = fIdx >= 0 && fIdx < features.length ? features[fIdx]! : Number.NaN;
      if (Number.isNaN(xVal)) {
        node = tr.missing_go_to_left[node] !== 0 ? tr.left[node]! : tr.right[node]!;
      } else {
        node = xVal <= tr.num_threshold[node]! ? tr.left[node]! : tr.right[node]!;
      }
    }
    eta += tr.value[node]!;
  }
  return eta;
}

function projectBookingPointsLineFromUnits5Pmf(
  pmfUnits5: Float64Array,
  line: number,
): MicroLineProjection {
  let pOver = 0.0;
  let pUnder = 0.0;
  let pPush = 0.0;
  for (let u = 0; u < pmfUnits5.length; u += 1) {
    const p = pmfUnits5[u]!;
    if (p <= 0.0) continue;
    const pts = 5.0 * u;
    if (Math.abs(pts - line) < 1e-9) pPush += p;
    else if (pts > line) pOver += p;
    else pUnder += p;
  }
  const act = pOver + pUnder;
  const poCond = act > 1e-12 ? clamp(pOver / act, 0.001, 0.999) : 0.5;
  const puCond = 1.0 - poCond;
  return Object.freeze({
    line,
    pOver,
    pUnder,
    pPush,
    pOverConditionalNoPush: poCond,
    pUnderConditionalNoPush: puCond,
    fairOddsOver: probabilityToFairOdds(poCond),
    fairOddsUnder: probabilityToFairOdds(puCond),
  });
}

export function buildBookingPointsOutlookV5(params: {
  readonly pmfYellowTotal: Float64Array;
  readonly muYellowTotal: number;
  readonly rYellowEff: number;
  readonly pmfRedTotal: Float64Array;
  readonly muRedTotal: number;
  readonly rRedEff: number;
  readonly omegaYellowRed: number;
  readonly lines: readonly number[];
}): BookingPointsOutlookV5 {
  const ny = params.pmfYellowTotal.length;
  const nr = params.pmfRedTotal.length;
  const phiY = buildCenteredSarmanovBasis(
    params.pmfYellowTotal,
    params.muYellowTotal,
    params.rYellowEff,
  );
  const phiR = buildCenteredSarmanovBasis(params.pmfRedTotal, params.muRedTotal, params.rRedEff);
  const om = clamp(params.omegaYellowRed, -0.85, 0.85);

  const maxUnits5 = 2 * (ny - 1) + 5 * (nr - 1);
  const pmfUnits5 = new Float64Array(maxUnits5 + 1);
  let totMass = 0.0;

  for (let y = 0; y < ny; y += 1) {
    const py = params.pmfYellowTotal[y]!;
    if (py <= 0.0) continue;
    const fy = phiY[y]!;
    for (let r = 0; r < nr; r += 1) {
      const pr = params.pmfRedTotal[r]!;
      if (pr <= 0.0) continue;
      const w = Math.max(0.0, 1.0 + om * fy * phiR[r]!);
      const pJoint = py * pr * w;
      totMass += pJoint;
      pmfUnits5[2 * y + 5 * r] = pmfUnits5[2 * y + 5 * r]! + pJoint;
    }
  }

  const invM = totMass > 0.0 ? 1.0 / totMass : 1.0;
  let expectedBp = 0.0;
  for (let u = 0; u <= maxUnits5; u += 1) {
    pmfUnits5[u] = pmfUnits5[u]! * invM;
    expectedBp += 5.0 * u * pmfUnits5[u]!;
  }

  return Object.freeze({
    formula: "10_per_yellow_plus_25_per_red",
    expectedBookingPoints: expectedBp,
    copulaOmegaYellowRed: om,
    lines: Object.freeze(params.lines.map((ln) => projectBookingPointsLineFromUnits5Pmf(pmfUnits5, ln))),
  });
}

export interface RedCardFeatureVectorInputV5 {
  readonly homeFeatures6: readonly number[];
  readonly awayFeatures6: readonly number[];
}

export function buildSoccerMicroMatchOutlookV5(params: {
  readonly matchId: string;
  readonly div: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly lamHome: number;
  readonly lamAway: number;
  readonly featuresByMetric: Readonly<Record<SoccerMicroMetricKey, MicroFeatureVectorInputV4>>;
  readonly redCardFeatures?: RedCardFeatureVectorInputV5;
  readonly modelArtifact: SoccerMicroModelArtifactV5;
}): SoccerMicroMatchOutlookV5 {
  const art = params.modelArtifact;
  const lh = clamp(params.lamHome, 0.05, 8.0);
  const la = clamp(params.lamAway, 0.05, 8.0);

  const metricKeys: readonly SoccerMicroMetricKey[] = [
    "corners",
    "yellow_cards",
    "fouls",
    "shots_on_target",
    "shots",
  ];
  const metricsOut = {} as Record<SoccerMicroMetricKey, MicroBivariateMetricOutlookV4>;
  let yellowPmfTotal: Float64Array = new Float64Array([1.0]);

  for (const q of metricKeys) {
    const spec = art.metrics[q];
    const fv = params.featuresByMetric[q];
    let etaGlmH = spec.home_intercept;
    let etaGlmA = spec.away_intercept;
    for (let i = 0; i < spec.home_coef.length; i += 1) {
      etaGlmH += spec.home_coef[i]! * fv.homeFeatures8[i]!;
      etaGlmA += spec.away_coef[i]! * fv.awayFeatures8[i]!;
    }
    const etaHgbH =
      spec.w_hgb_home > 0.0 ? evaluateMicroPoissonGbmExact(fv.homeFeatures8, spec.home_hgb) : etaGlmH;
    const etaHgbA =
      spec.w_hgb_away > 0.0 ? evaluateMicroPoissonGbmExact(fv.awayFeatures8, spec.away_hgb) : etaGlmA;

    const etaH = (1.0 - spec.w_hgb_home) * etaGlmH + spec.w_hgb_home * etaHgbH;
    const etaA = (1.0 - spec.w_hgb_away) * etaGlmA + spec.w_hgb_away * etaHgbA;
    const muHome = clamp(Math.exp(etaH), 0.15, 35.0);
    const muAway = clamp(Math.exp(etaA), 0.15, 35.0);

    const biv = buildBivariateSarmanovNbSummaryV4({
      muHome,
      muAway,
      rHome: spec.dispersion_r_home,
      rAway: spec.dispersion_r_away,
      maxKSide: spec.max_k_side,
      copulaOmega: spec.copula_omega,
      handicapLines: spec.handicap_lines,
    });
    if (q === "yellow_cards") {
      yellowPmfTotal = biv.pmfTotal;
    }

    const totalLines = spec.alt_total_lines.map((ln) => projectLineFromPmf(biv.pmfTotal, ln));
    metricsOut[q] = Object.freeze({
      metric: q,
      muHome,
      muAway,
      muTotal: muHome + muAway,
      refereeMultiplierApplied: Math.exp(fv.homeFeatures8[7] ?? 0.0),
      copulaOmega: spec.copula_omega,
      totalLines: Object.freeze(totalLines),
      homeSideLine: projectLineFromPmf(biv.pmfHome, spec.side_line),
      awaySideLine: projectLineFromPmf(biv.pmfAway, spec.side_line),
      side1X2: Object.freeze({
        pHomeMost: biv.pHomeMost,
        pTie: biv.pTie,
        pAwayMost: biv.pAwayMost,
        fairOddsHomeMost: probabilityToFairOdds(clamp(biv.pHomeMost, 0.001, 0.999)),
        fairOddsTie: probabilityToFairOdds(clamp(biv.pTie, 0.001, 0.999)),
        fairOddsAwayMost: probabilityToFairOdds(clamp(biv.pAwayMost, 0.001, 0.999)),
      }),
      handicapLines: biv.handicaps,
    });
  }

  // Tarjetas Rojas (`Over 0.5 Sending Off`) acopladas a amarillas esperadas, árbitro y guion
  const rSpec = art.red_cards_model;
  const divPrior = art.div_priors[params.div];
  const yelOut = metricsOut.yellow_cards;
  const supH = lh - la;
  const tightness = Math.exp(-Math.abs(supH)) - 0.55;
  const defCrunch = params.featuresByMetric.yellow_cards.homeFeatures8[6] ?? 0.0;
  const defLogRef = params.featuresByMetric.yellow_cards.homeFeatures8[7] ?? 0.0;
  const baseRedH = divPrior?.red_cards?.home_mean ?? rSpec.default_home_rate;
  const baseRedA = divPrior?.red_cards?.away_mean ?? rSpec.default_away_rate;

  const rfVec: RedCardFeatureVectorInputV5 = params.redCardFeatures ?? {
    homeFeatures6: [
      Math.log(Math.max(baseRedH, 0.015)),
      Math.log(Math.max(yelOut.muHome, 0.25)),
      Math.max(0.0, -supH),
      tightness,
      defCrunch,
      defLogRef,
    ],
    awayFeatures6: [
      Math.log(Math.max(baseRedA, 0.015)),
      Math.log(Math.max(yelOut.muAway, 0.25)),
      Math.max(0.0, supH),
      tightness,
      defCrunch,
      defLogRef,
    ],
  };

  let etaRedGlmH = rSpec.home_intercept;
  let etaRedGlmA = rSpec.away_intercept;
  for (let i = 0; i < rSpec.home_coef.length; i += 1) {
    etaRedGlmH += rSpec.home_coef[i]! * rfVec.homeFeatures6[i]!;
    etaRedGlmA += rSpec.away_coef[i]! * rfVec.awayFeatures6[i]!;
  }
  const etaRedHgbH =
    rSpec.w_hgb_home > 0.0 ? evaluateMicroPoissonGbmExact(rfVec.homeFeatures6, rSpec.home_hgb) : etaRedGlmH;
  const etaRedHgbA =
    rSpec.w_hgb_away > 0.0 ? evaluateMicroPoissonGbmExact(rfVec.awayFeatures6, rSpec.away_hgb) : etaRedGlmA;

  const muRedH = clamp(
    Math.exp((1.0 - rSpec.w_hgb_home) * etaRedGlmH + rSpec.w_hgb_home * etaRedHgbH),
    0.01,
    1.5,
  );
  const muRedA = clamp(
    Math.exp((1.0 - rSpec.w_hgb_away) * etaRedGlmA + rSpec.w_hgb_away * etaRedHgbA),
    0.01,
    1.5,
  );

  const bivRed = buildBivariateSarmanovNbSummaryV4({
    muHome: muRedH,
    muAway: muRedA,
    rHome: rSpec.dispersion_r_home,
    rAway: rSpec.dispersion_r_away,
    maxKSide: rSpec.max_k_side,
    copulaOmega: rSpec.copula_omega,
    handicapLines: [-0.5, 0.5],
  });

  const redOver05 = projectLineFromPmf(bivRed.pmfTotal, 0.5);
  const pRedMatch = clamp(redOver05.pOver, 0.001, 0.999);
  const pNoRedMatch = 1.0 - pRedMatch;
  const pRedHome = clamp(1.0 - bivRed.pmfHome[0]!, 0.001, 0.999);
  const pRedAway = clamp(1.0 - bivRed.pmfAway[0]!, 0.001, 0.999);

  const redCards: RedCardsOutlookV5 = Object.freeze({
    muHome: muRedH,
    muAway: muRedA,
    muTotal: muRedH + muRedA,
    pRedCardMatch: pRedMatch,
    pNoRedCardMatch: pNoRedMatch,
    pRedCardHome: pRedHome,
    pRedCardAway: pRedAway,
    fairOddsRedCardMatch: probabilityToFairOdds(pRedMatch),
    fairOddsNoRedCardMatch: probabilityToFairOdds(pNoRedMatch),
    totalOver05: redOver05,
  });

  const rYelEff = 0.5 * (art.metrics.yellow_cards.dispersion_r_home + art.metrics.yellow_cards.dispersion_r_away);
  const rRedEff = 0.5 * (rSpec.dispersion_r_home + rSpec.dispersion_r_away);
  const bookingPoints = buildBookingPointsOutlookV5({
    pmfYellowTotal: yellowPmfTotal,
    muYellowTotal: yelOut.muTotal,
    rYellowEff: rYelEff,
    pmfRedTotal: bivRed.pmfTotal,
    muRedTotal: muRedH + muRedA,
    rRedEff: rRedEff,
    omegaYellowRed: rSpec.booking_points_omega_yr,
    lines: rSpec.booking_points_lines,
  });

  const hcfg = art.halves_config;
  const dsh = divPrior?.ht_goal_share ?? hcfg.ref_div_ht_share;
  const adjSh = dsh / hcfg.ref_div_ht_share;
  const absDiff = Math.abs(lh - la);
  const thH = clamp(hcfg.base_share_1h_home * adjSh + hcfg.slope_abs_diff * absDiff, 0.36, 0.52);
  const thA = clamp(hcfg.base_share_1h_away * adjSh + hcfg.slope_abs_diff * absDiff, 0.36, 0.52);

  const lam1hH = lh * thH;
  const lam1hA = la * thA;
  const firstHalf = summarizeHalfMatrix("first_half", lam1hH, lam1hA, hcfg.rho_1h, hcfg.max_goals_half_grid);
  const secondHalf = summarizeHalfMatrix(
    "second_half",
    lh - lam1hH,
    la - lam1hA,
    hcfg.rho_2h,
    hcfg.max_goals_half_grid,
  );

  return Object.freeze({
    schemaVersion: SOCCER_MICRO_V5_SCHEMA_VERSION,
    matchId: params.matchId,
    div: params.div,
    homeTeam: params.homeTeam,
    awayTeam: params.awayTeam,
    lamHomeFt: lh,
    lamAwayFt: la,
    metrics: Object.freeze(metricsOut),
    redCards,
    bookingPoints,
    firstHalf,
    secondHalf,
  });
}
