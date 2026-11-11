/**
 * A17 / A26 — Servicio unificado de predicción en tiempo real (`PitchLab Spacetime Suite v3.0`).
 *
 * Cubre los 6 deportes y 11 ligas del Feature Store v2.0 (`football` / `soccer`, `nfl`, `nhl`,
 * `mlb`, `nba`, `ncaaf`):
 *   1. Mantiene compatibilidad 100% con `predictMatch` y `predictMatchBatch` (Fútbol + NFL + Multi-Deporte).
 *   2. Integra desvigorización adaptativa Power/Shin (`devigAdaptive1X2`, `devig2Way`),
 *      corrección de sesgo recreativo local MX (`debiaseRecreationalLigaMx`),
 *      pool institucional `PitchLab Singularity v3.0` (`applySingularitySharpTilt3Way` / `2Way`)
 *      y ejecución Quarter-Kelly con Gate Anti-RLM `PitchLab Geodesic v2.0` (`evaluateGeodesicV2ValueGate`).
 *   3. Expone `predictLiveMatchup` y `predictLiveEdgeMatrix` para inferencia `< 1 ms` cero-I/O
 *      directamente sobre `live_matchups_edge_matrix.json` (`242` enfrentamientos) y
 *      `team_master_features.json` (`376` equipos canónicos) tras `run_matchday_refresh.py`,
 *      con paridad IEEE-754 exacta (`|Δ| < 1e-12`) frente a `pipeline/predict_live_matchday.py`.
 */
import {
  InvalidOddsError,
  applySingularitySharpTilt2Way,
  applySingularitySharpTilt3Way,
  debiaseRecreationalLigaMx,
  devig,
  devig2Way,
  devigAdaptive1X2,
  evaluateGeodesicV2ValueGate,
  type DevigMethod,
  type GeodesicV2GateInput,
  type GeodesicV2GateResult,
  type LigaMxDebiasParams,
  type RlmSignalSide,
  type SingularityTilt2WayInput,
  type SingularityTilt3WayInput,
} from "./devig.js";
import {
  DEFAULT_HYBRID_ALPHA,
  GEODESIC_MODEL_NAME,
  HORIZON_MODEL_NAME,
  HYBRID_MODEL_ID,
  InvalidFeaturesError,
  MINKOWSKI_MODEL_NAME,
  NFL_MODEL_ID,
  SINGULARITY_MODEL_NAME,
  TACHYON_MODEL_NAME,
  blendLogLinear3,
  computeLineupAvailabilityDelta,
  evaluateValueExecution,
  predictMotorA,
  predictMotorAWithAvailability,
  predictNFL,
  predictWithFallback,
  type ValueExecutionOptions,
} from "./engine.js";
import {
  MULTISPORT_CODENAMES,
  predictMultiSport,
  type MultiSportDriver,
  type MultiSportLeague,
  type MultiSportMatchupInput,
  type MultiSportModelArtifact,
  type MultiSportPrediction,
} from "./multisport.js";
import {
  applyMinkowskiV3LiveContext,
  type NFLLiveArtifactConfig,
  type NFLLiveContextInput,
} from "./nfl_live.js";
import type {
  BaseRates,
  ModelArtifact,
  NFLModelArtifact,
  NFLSnapshotRow,
  Prediction,
  PredictionMode,
  SnapshotRow,
  Sport,
  TeamAvailabilityContext,
} from "./types.js";

// ===========================================================================
// 1. Peticiones individuales (`predictMatch` / `predictMatchBatch`)
// ===========================================================================

export interface FootballMatchRequest {
  sport: "football";
  row: SnapshotRow;
  model: ModelArtifact;
  /** Cuotas decimales 1X2 de referencia. Si faltan o son inválidas, se usa Motor A. */
  odds?: readonly number[] | null;
  /** Mejores cuotas disponibles (Line Shopping, ej. [MaxH, MaxD, MaxA]) para ejecución de valor. */
  bestOdds?: readonly number[] | null;
  /** Método de de-vig; por defecto `power` (acepta también `"adaptive"` en v3.0). */
  oddsMethod?: DevigMethod;
  /** Modo de inferencia: `market_only` (por defecto), `hybrid` (Motor C) o `motor_a_only`. */
  mode?: PredictionMode;
  /** Peso del mercado en modo `hybrid` (por defecto 0.85). */
  hybridAlpha?: number;
  /** Opciones para el cálculo de edge, filtro de incertidumbre y Kelly fraccional. */
  valueOptions?: ValueExecutionOptions;
  baseRates?: BaseRates;
  /** Prior prospectivo de disponibilidad (`Transfermarkt` + `RotoWire`) para inferencia en vivo v3.0. */
  availabilityContext?:
    | number
    | {
        homeTeamCtx?: TeamAvailabilityContext | null;
        awayTeamCtx?: TeamAvailabilityContext | null;
      }
    | null;
  /** Parámetros opcionales de corrección de sesgo recreativo MX (`Caliente.mx` / Liga MX). */
  ligaMxDebias?: LigaMxDebiasParams | null;
  /** Señales institucionales opcionales (`Smarkets` + `Action Network` Sharp/RLM) para `Singularity v3.0`. */
  singularitySharpInput?: Omit<SingularityTilt3WayInput, "modelProbs" | "marketProbs"> | null;
  /** Evaluación opcional del Gate Anti-RLM `PitchLab Geodesic v2.0`. */
  geodesicV2Options?: Partial<Omit<GeodesicV2GateInput, "probs" | "odds" | "marketProbs">> | null;
}

export interface NFLMatchRequest {
  sport: "nfl";
  row: NFLSnapshotRow;
  model: NFLModelArtifact & NFLLiveArtifactConfig;
  /** Contexto prospectivo opcional `Minkowski v3.0` (EPA SumerSports, lesiones QB/Ourlads, árbitros, clima). */
  liveContext?: NFLLiveContextInput | null;
}

export interface MultiSportMatchRequest {
  sport: MultiSportLeague;
  matchup: MultiSportMatchupInput;
  model: MultiSportModelArtifact;
}

export type MatchPredictionRequest =
  | FootballMatchRequest
  | NFLMatchRequest
  | MultiSportMatchRequest;

function isValidExecutionOdds(
  odds: readonly number[] | null | undefined,
): odds is readonly [number, number, number] {
  if (!Array.isArray(odds) || odds.length !== 3) {
    return false;
  }
  return (
    Number.isFinite(odds[0]) &&
    odds[0]! > 1 &&
    Number.isFinite(odds[1]) &&
    odds[1]! > 1 &&
    Number.isFinite(odds[2]) &&
    odds[2]! > 1
  );
}

/**
 * Predice un partido en cualquiera de los 6 deportes (`football`, `nfl`, `nhl`, `mlb`, `nba`, `ncaaf`).
 */
export function predictMatch(request: MatchPredictionRequest): Prediction & {
  lineupAvailabilityDelta?: number;
  expectedTotalPoints?: number;
  expectedMargin?: number;
  geodesicV2?: GeodesicV2GateResult;
} {
  if (request.sport === "nfl") {
    const baseNfl = predictNFL(request.row, request.model);
    if (!request.liveContext) {
      return baseNfl;
    }
    const liveNfl = applyMinkowskiV3LiveContext(baseNfl, request.liveContext, request.model);
    return {
      ...baseNfl,
      pHome: liveNfl.pHome,
      pDraw: liveNfl.pDraw,
      pAway: liveNfl.pAway,
      modelName: MINKOWSKI_MODEL_NAME,
      expectedTotalPoints: liveNfl.expectedTotalPoints,
    };
  }

  if (request.sport !== "football") {
    const ms = predictMultiSport(request.sport, request.matchup, request.model);
    const expectedTotal =
      ms.sport === "nhl"
        ? ms.expectedTotalGoals
        : ms.sport === "mlb"
          ? ms.expectedTotalRuns
          : ms.expectedTotalPoints;
    const expectedMargin =
      ms.sport === "nhl"
        ? ms.expectedGoalsHome - ms.expectedGoalsAway
        : ms.sport === "mlb"
          ? ms.expectedRunMargin
          : ms.expectedMargin;
    return {
      pHome: ms.pHome,
      pDraw: 0,
      pAway: ms.pAway,
      modelId: `multisport_${ms.sport}_v3`,
      modelName: ms.modelId,
      modelVersion: request.model.version,
      generatedAt: request.model.created_at,
      dataQualityFlag: "ok",
      sport: ms.sport,
      expectedTotalPoints: expectedTotal,
      expectedMargin,
    };
  }

  const method: DevigMethod = request.oddsMethod ?? "power";
  const odds = request.odds;
  const fallbackOptions = {
    mode: request.mode,
    hybridAlpha: request.hybridAlpha,
  };

  const hasAvailability =
    request.availabilityContext !== undefined && request.availabilityContext !== null;

  if (odds === undefined || odds === null) {
    if (hasAvailability) {
      try {
        return predictMotorAWithAvailability(
          request.row,
          request.model,
          request.availabilityContext!,
        );
      } catch (err) {
        if (!(err instanceof InvalidFeaturesError)) throw err;
      }
    }
    return predictWithFallback(
      request.row,
      request.model,
      null,
      request.baseRates,
      fallbackOptions,
    );
  }

  try {
    let marketProbs = devig(odds, method);
    if (request.ligaMxDebias) {
      const deb = debiaseRecreationalLigaMx(
        [marketProbs[0]!, marketProbs[1]!, marketProbs[2]!],
        request.ligaMxDebias,
      );
      marketProbs = [deb.pHome, deb.pDraw, deb.pAway];
    }

    const prediction = predictWithFallback(
      request.row,
      request.model,
      marketProbs,
      request.baseRates,
      fallbackOptions,
    );
    const pMkt: readonly [number, number, number] = [
      marketProbs[0]!,
      marketProbs[1]!,
      marketProbs[2]!,
    ];
    const execOdds: readonly [number, number, number] = isValidExecutionOdds(request.bestOdds)
      ? request.bestOdds
      : [odds[0]!, odds[1]!, odds[2]!];

    try {
      const motorARes = hasAvailability
        ? predictMotorAWithAvailability(request.row, request.model, request.availabilityContext!)
        : { ...predictMotorA(request.row, request.model), lineupAvailabilityDelta: undefined };

      const pMod: readonly [number, number, number] = [
        motorARes.pHome,
        motorARes.pDraw,
        motorARes.pAway,
      ];
      const alpha = request.hybridAlpha ?? DEFAULT_HYBRID_ALPHA;

      let pEval: readonly [number, number, number];
      let finalPred = prediction;

      if (request.singularitySharpInput) {
        const tilted = applySingularitySharpTilt3Way({
          modelProbs: pMod,
          marketProbs: pMkt,
          baseMarketAlpha: request.hybridAlpha,
          ...request.singularitySharpInput,
        });
        pEval = [tilted.pHome, tilted.pDraw, tilted.pAway];
        if (request.mode === "hybrid") {
          finalPred = {
            ...prediction,
            pHome: tilted.pHome,
            pDraw: tilted.pDraw,
            pAway: tilted.pAway,
            hybridAlpha: tilted.effectiveMarketAlpha,
          };
        }
      } else if (hasAvailability && request.mode === "hybrid") {
        pEval = blendLogLinear3(pMkt, pMod, alpha);
        finalPred = {
          ...prediction,
          pHome: pEval[0],
          pDraw: pEval[1],
          pAway: pEval[2],
        };
      } else if (hasAvailability && request.mode === "motor_a_only") {
        pEval = pMod;
        finalPred = {
          ...prediction,
          pHome: pMod[0],
          pDraw: pMod[1],
          pAway: pMod[2],
        };
      } else {
        pEval =
          request.mode === "hybrid"
            ? [prediction.pHome, prediction.pDraw, prediction.pAway]
            : request.mode === "motor_a_only"
              ? pMod
              : blendLogLinear3(pMkt, pMod, alpha);
      }

      const valueMetrics = evaluateValueExecution(
        pEval,
        pMkt,
        pMod,
        execOdds,
        request.valueOptions,
      );
      const geodesicV2 = request.geodesicV2Options
        ? evaluateGeodesicV2ValueGate({
            probs: pEval,
            odds: execOdds,
            marketProbs: pMkt,
            ...request.geodesicV2Options,
          })
        : undefined;

      return {
        ...finalPred,
        marketMethod: method,
        ...valueMetrics,
        ...(motorARes.lineupAvailabilityDelta !== undefined
          ? { lineupAvailabilityDelta: motorARes.lineupAvailabilityDelta }
          : {}),
        ...(geodesicV2 !== undefined ? { geodesicV2 } : {}),
      };
    } catch (innerError) {
      if (!(innerError instanceof InvalidFeaturesError)) throw innerError;
      return { ...prediction, marketMethod: method };
    }
  } catch (error) {
    if (!(error instanceof InvalidOddsError)) throw error;
    const fallback = predictWithFallback(
      request.row,
      request.model,
      null,
      request.baseRates,
      fallbackOptions,
    );
    return { ...fallback, dataQualityFlag: "fallback_motor_a" };
  }
}

/** Predice un lote. Determinista y sin estado compartido. */
export function predictMatchBatch(requests: readonly MatchPredictionRequest[]): Prediction[] {
  return requests.map((request) => predictMatch(request));
}

// ===========================================================================
// 2. Puente `< 1 ms` sobre Feature Store v2.0 (`242` Matchups / `11` Ligas)
// ===========================================================================

export interface TeamMasterFeatureRecord {
  team_id: string;
  team_name: string;
  league: string;
  sport: string;
  total_market_value_eur?: number | null;
  avg_player_value_eur?: number | null;
  log_squad_value?: number | null;
  value_ratio_vs_league_median?: number | null;
  roster_players_count?: number | null;
  top_player_market_value_eur?: number | null;
  injured_players_count?: number | null;
  suspended_players_count?: number | null;
  missing_market_value_eur?: number | null;
  missing_market_value_ratio?: number | null;
  rotowire_injured_out_count?: number | null;
  probable_starters_count?: number | null;
  xg_for?: number | null;
  xg_against?: number | null;
  npxg_for?: number | null;
  npxg_against?: number | null;
  xpts?: number | null;
  xg_overperformance?: number | null;
  xpts_overperformance?: number | null;
  ppda_avg?: number | null;
  deep_completions?: number | null;
  statiskicks_xp?: number | null;
  club_elo_rating?: number | null;
  nfl_off_epa_per_play?: number | null;
  nfl_def_epa_per_play?: number | null;
  nfl_off_success_pct?: number | null;
  nfl_def_success_pct?: number | null;
  nhl_xg_pct?: number | null;
  nhl_corsi_for_pct?: number | null;
  nhl_fenwick_for_pct?: number | null;
  nhl_high_danger_xg_for?: number | null;
  nhl_pythag_215?: number | null;
  mlb_ops_plus?: number | null;
  mlb_woba_est?: number | null;
  mlb_fip?: number | null;
  mlb_era?: number | null;
  mlb_whip?: number | null;
  mlb_pythag_183?: number | null;
  nba_ortg?: number | null;
  nba_drtg?: number | null;
  nba_net_rtg?: number | null;
  nba_pace?: number | null;
  nba_srs?: number | null;
  nba_efg_pct?: number | null;
  nba_opp_efg_pct?: number | null;
  nba_pythag_1391?: number | null;
  ncaaf_srs?: number | null;
  ncaaf_sos?: number | null;
  ncaaf_espn_fpi?: number | null;
  ncaaf_off_ypp?: number | null;
  ncaaf_def_ypp?: number | null;
  ncaaf_pythag_237?: number | null;
  stadium_name?: string | null;
  stadium_elevation_m?: number | null;
  surface_pressure_hpa?: number | null;
  high_altitude_flag?: boolean | null;
  roof_type?: string | null;
  max_wind_speed_mph_7d?: number | null;
  max_wind_gusts_mph_7d?: number | null;
  total_precipitation_mm_7d?: number | null;
  as_of_utc?: string | null;
}

export interface LiveMatchupEdgeRecord {
  matchup_id: string;
  sport: string;
  league: string;
  kickoff_utc?: string | null;
  home_team: string;
  away_team: string;
  market_sources?: readonly string[] | null;
  p_home_novig?: number | null;
  p_draw_novig?: number | null;
  p_away_novig?: number | null;
  market_overround?: number | null;
  smarkets_exchange_mid_prob_home?: number | null;
  sharp_money_divergence?: number | null;
  reverse_line_movement_side?: RlmSignalSide;
  odds?: readonly number[] | null;
  value_ratio_diff?: number | null;
  missing_value_ratio_diff?: number | null;
  xg_diff?: number | null;
  epa_diff?: number | null;
  net_rtg_diff?: number | null;
  fip_ops_diff?: number | null;
  fpi_srs_diff?: number | null;
  altitude_diff_m?: number | null;
  home_stadium_name?: string | null;
  home_stadium_elevation_m?: number | null;
  home_surface_pressure_hpa?: number | null;
  home_high_altitude_flag?: boolean | null;
  home_max_wind_speed_mph_7d?: number | null;
  as_of_utc?: string | null;
}

export interface LiveInferenceArtifacts {
  footballModel: ModelArtifact;
  nflModel: NFLModelArtifact & NFLLiveArtifactConfig;
  multisportModel: MultiSportModelArtifact;
  precomputedFootballRows?: Readonly<Record<string, SnapshotRow>>;
  precomputedNflRows?: Readonly<Record<string, NFLSnapshotRow>>;
}

export interface TeamMasterIndex {
  byLeagueSlug: Map<string, TeamMasterFeatureRecord>;
  bySportSlug: Map<string, TeamMasterFeatureRecord>;
  nflSlugToAbbr: Map<string, string>;
}

export interface LiveKeyDriver {
  factor: string;
  label: string;
  impactLogit: number;
}

export interface LiveMatchupPrediction {
  matchupId: string;
  sport: Sport;
  league: string;
  homeTeam: string;
  awayTeam: string;
  marketType: "2way" | "3way";
  sportsModelName: string;
  activeModelName: string;
  activeEngine: "singularity_v3" | "smarkets_anchor_v3" | "sports_only";
  sportsProbs: {
    pHome: number;
    pDraw: number;
    pAway: number;
  };
  marketProbsAdaptive: {
    pHome: number;
    pDraw: number;
    pAway: number;
    overround: number;
    ligaMxBiasAdjusted: boolean;
  } | null;
  finalProbs: {
    pHome: number;
    pDraw: number;
    pAway: number;
  };
  expectedTotal: number | null;
  expectedMargin: number | null;
  lineupAvailabilityDelta: number | null;
  sharpLogitTilt: number;
  effectiveMarketAlpha: number | null;
  geodesicV2: GeodesicV2GateResult | null;
  drivers: readonly LiveKeyDriver[];
}

export interface LiveEdgeMatrixBatchResult {
  count: number;
  countsByLeague: Record<string, number>;
  executableBetsCount: number;
  vetoedByRlmCount: number;
  institutionallyConfirmedCount: number;
  predictions: LiveMatchupPrediction[];
}

const SOCCER_LEAGUE_TO_DIV: Readonly<Record<string, string>> = {
  "liga-mx": "MEX",
  epl: "E0",
  laliga: "SP1",
  bundesliga: "D1",
  "serie-a": "I1",
  "ligue-1": "F1",
};

function slugToken(raw: string | null | undefined): string {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function clampVal(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function finiteOr(v: unknown, fallback: number): number {
  if (v === null || v === undefined || typeof v === "boolean") return fallback;
  const f = Number(v);
  return Number.isFinite(f) ? f : fallback;
}

function finiteOrNull(v: unknown): number | null {
  if (v === null || v === undefined || typeof v === "boolean") return null;
  const f = Number(v);
  return Number.isFinite(f) ? f : null;
}

function barometricPressureHpa(elevM: number): number {
  const h = Math.max(0.0, elevM);
  return 1013.25 * Math.pow(1.0 - 2.25577e-5 * h, 5.25588);
}

function dixonColesProbs8(
  lamHome: number,
  lamAway: number,
  rho = -0.11,
): readonly [number, number, number] {
  const maxGoals = 8;
  const pH = new Array<number>(maxGoals + 1);
  const pA = new Array<number>(maxGoals + 1);
  pH[0] = Math.exp(-lamHome);
  pA[0] = Math.exp(-lamAway);
  for (let g = 1; g <= maxGoals; g += 1) {
    pH[g] = (pH[g - 1]! * lamHome) / g;
    pA[g] = (pA[g - 1]! * lamAway) / g;
  }

  let wHome = 0.0;
  let wDraw = 0.0;
  let wAway = 0.0;
  for (let hg = 0; hg <= maxGoals; hg += 1) {
    for (let ag = 0; ag <= maxGoals; ag += 1) {
      let tau = 1.0;
      if (hg === 0 && ag === 0) tau = 1.0 - lamHome * lamAway * rho;
      else if (hg === 0 && ag === 1) tau = 1.0 + lamHome * rho;
      else if (hg === 1 && ag === 0) tau = 1.0 + lamAway * rho;
      else if (hg === 1 && ag === 1) tau = 1.0 - rho;
      const w = Math.max(0.0, tau) * pH[hg]! * pA[ag]!;
      if (hg > ag) wHome += w;
      else if (hg === ag) wDraw += w;
      else wAway += w;
    }
  }
  const tot = wHome + wDraw + wAway;
  if (!(tot > 0.0)) return [0.44, 0.26, 0.3];
  return [wHome / tot, wDraw / tot, wAway / tot];
}

function probLogit(p: number): number {
  const c = clampVal(p, 1e-6, 1.0 - 1e-6);
  return Math.log(c / (1.0 - c));
}

export function buildTeamMasterIndex(
  teamMaster:
    | readonly TeamMasterFeatureRecord[]
    | { readonly records: readonly TeamMasterFeatureRecord[] },
  nflModel?: (NFLModelArtifact & NFLLiveArtifactConfig) | null,
): TeamMasterIndex {
  const rows = Array.isArray(teamMaster)
    ? teamMaster
    : (teamMaster as { readonly records: readonly TeamMasterFeatureRecord[] }).records;
  const byLeagueSlug = new Map<string, TeamMasterFeatureRecord>();
  const bySportSlug = new Map<string, TeamMasterFeatureRecord>();

  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i]!;
    const lg = String(r.league ?? "").trim().toLowerCase();
    const sp = String(r.sport ?? "").trim().toLowerCase();
    const sName = slugToken(r.team_name);
    const sId = slugToken(r.team_id);
    if (sName) {
      byLeagueSlug.set(`${lg}::${sName}`, r);
      bySportSlug.set(`${sp}::${sName}`, r);
    }
    if (sId) {
      byLeagueSlug.set(`${lg}::${sId}`, r);
      bySportSlug.set(`${sp}::${sId}`, r);
    }
  }

  const nflSlugToAbbr = new Map<string, string>();
  const tlc = (
    nflModel as {
      live_v3?: { team_live_context?: Record<string, { team_name?: string }> };
    } | null
  )?.live_v3?.team_live_context;
  if (tlc) {
    for (const [abbr, info] of Object.entries(tlc)) {
      nflSlugToAbbr.set(slugToken(abbr), abbr);
      if (info?.team_name) {
        nflSlugToAbbr.set(slugToken(info.team_name), abbr);
      }
    }
  }

  return { byLeagueSlug, bySportSlug, nflSlugToAbbr };
}

function lookupTeamMaster(
  index: TeamMasterIndex,
  sportRaw: string,
  leagueRaw: string,
  teamName: string,
): TeamMasterFeatureRecord | null {
  const s = slugToken(teamName);
  const lg = String(leagueRaw ?? "").trim().toLowerCase();
  const sp = String(sportRaw ?? "").trim().toLowerCase();
  return index.byLeagueSlug.get(`${lg}::${s}`) ?? index.bySportSlug.get(`${sp}::${s}`) ?? null;
}

/**
 * Construye determinísticamente una fila `SnapshotRow` (`113` base + `23` divisiones) para
 * `PitchLab Tachyon v3.0` directamente desde `team_master_features.json` + `live_matchups_edge_matrix.json`.
 * Idéntica en IEEE-754 a `pipeline/predict_live_matchday.py::synthesize_football_snapshot_row`.
 */
export function synthesizeFootballSnapshotRowFromMaster(
  div: string,
  homeMaster: TeamMasterFeatureRecord | null,
  awayMaster: TeamMasterFeatureRecord | null,
  matchup: LiveMatchupEdgeRecord,
  model: ModelArtifact,
): { row: SnapshotRow; dcExpTotal: number; dcExpDiff: number } {
  const ch = finiteOr(homeMaster?.club_elo_rating, 1550.0);
  const ca = finiteOr(awayMaster?.club_elo_rating, 1550.0);
  const eloDiffNoHfa = ch - ca;
  const eloDiff = ch + 65.0 - ca;
  const eloProbHomeNodraw = 1.0 / (1.0 + Math.pow(10.0, -eloDiff / 400.0));
  const eloLogitH = probLogit(eloProbHomeNodraw);
  const eloCloseness = Math.exp(-Math.pow(eloDiff / 150.0, 2));
  const seasonProgress = 0.35;
  const eloDiffXProgress = eloDiff * seasonProgress;

  const estGames = (m: TeamMasterFeatureRecord | null): number =>
    clampVal(Math.round(finiteOr(m?.xpts, 20.0) / 1.38), 8.0, 38.0);

  const gh = estGames(homeMaster);
  const ga = estGames(awayMaster);

  const hXgfPg = finiteOr(homeMaster?.xg_for, 1.35 * gh) / gh;
  const hXgaPg = finiteOr(homeMaster?.xg_against, 1.25 * gh) / gh;
  const aXgfPg = finiteOr(awayMaster?.xg_for, 1.3 * ga) / ga;
  const aXgaPg = finiteOr(awayMaster?.xg_against, 1.3 * ga) / ga;

  const hXgdPg = hXgfPg - hXgaPg;
  const aXgdPg = aXgfPg - aXgaPg;
  const xgdDiff = hXgdPg - aXgdPg;

  const hXptsPg = finiteOr(homeMaster?.xpts, 1.38 * gh) / gh;
  const aXptsPg = finiteOr(awayMaster?.xpts, 1.38 * ga) / ga;
  const xptsDiff = hXptsPg - aXptsPg;

  const hXgOverPg = finiteOr(homeMaster?.xg_overperformance, 0.0) / gh;
  const aXgOverPg = finiteOr(awayMaster?.xg_overperformance, 0.0) / ga;
  const xgOverDiff = hXgOverPg - aXgOverPg;

  const hXptsOverPg = finiteOr(homeMaster?.xpts_overperformance, 0.0) / gh;
  const aXptsOverPg = finiteOr(awayMaster?.xpts_overperformance, 0.0) / ga;
  const ptsMinusXptsDiff = hXptsOverPg - aXptsOverPg;

  const xgEloDiff = eloDiffNoHfa + 120.0 * xgdDiff;
  const xgEloVsEloDiff = xgEloDiff - eloDiffNoHfa;

  const hPpda = finiteOrNull(homeMaster?.ppda_avg);
  const aPpda = finiteOrNull(awayMaster?.ppda_avg);
  const ppdaDiffR10 = hPpda !== null && aPpda !== null ? hPpda - aPpda : 0.0;

  const hDeep = finiteOrNull(homeMaster?.deep_completions);
  const aDeep = finiteOrNull(awayMaster?.deep_completions);
  const deepDiffR10 = hDeep !== null && aDeep !== null ? hDeep / gh - aDeep / ga : 0.0;

  const dcLamHome = clampVal(1.1 * Math.sqrt(Math.max(0.25, hXgfPg * aXgaPg)), 0.35, 3.8);
  const dcLamAway = clampVal(0.92 * Math.sqrt(Math.max(0.25, aXgfPg * hXgaPg)), 0.25, 3.5);
  const dcExpTotal = dcLamHome + dcLamAway;
  const dcExpDiff = dcLamHome - dcLamAway;
  const [dcProbH, dcProbD, dcProbA] = dixonColesProbs8(dcLamHome, dcLamAway, -0.11);
  const dcLogitH = probLogit(dcProbH);
  const dcLogitD = probLogit(dcProbD);
  const dcLogitA = probLogit(dcProbA);
  const lowScoringTightMatch = eloCloseness / Math.max(1.5, dcExpTotal);

  const hElev = finiteOr(
    matchup.home_stadium_elevation_m ?? homeMaster?.stadium_elevation_m,
    100.0,
  );
  const aElev = finiteOr(
    awayMaster?.stadium_elevation_m,
    hElev - finiteOr(matchup.altitude_diff_m, 0.0),
  );
  const altDiffM = hElev - aElev;
  const altShockFlag = hElev >= 2100.0 && altDiffM >= 1000.0 ? 1.0 : 0.0;
  const hPress = finiteOr(
    matchup.home_surface_pressure_hpa ?? homeMaster?.surface_pressure_hpa,
    barometricPressureHpa(hElev),
  );
  const aPress = finiteOr(awayMaster?.surface_pressure_hpa, barometricPressureHpa(aElev));
  const surfPressDiff = hPress - aPress;

  const hasRealXg =
    finiteOrNull(homeMaster?.xg_for) !== null && finiteOrNull(awayMaster?.xg_for) !== null
      ? 1.0
      : 0.0;

  const populated: Record<string, number> = {
    elo_diff: eloDiff,
    elo_diff_no_hfa: eloDiffNoHfa,
    elo_prob_home_nodraw: eloProbHomeNodraw,
    elo_diff_x_progress: eloDiffXProgress,
    season_progress: seasonProgress,
    clubelo_diff: eloDiffNoHfa,
    att_strength_home: Math.log(Math.max(0.25, hXgfPg / 1.35)),
    def_strength_home: Math.log(Math.max(0.25, hXgaPg / 1.35)),
    att_strength_away: Math.log(Math.max(0.25, aXgfPg / 1.35)),
    def_strength_away: Math.log(Math.max(0.25, aXgaPg / 1.35)),
    dc_lam_home: dcLamHome,
    dc_lam_away: dcLamAway,
    dc_exp_total: dcExpTotal,
    dc_exp_diff: dcExpDiff,
    dc_prob_h: dcProbH,
    dc_prob_d: dcProbD,
    dc_prob_a: dcProbA,
    xgd_diff_r5: xgdDiff,
    xgd_diff_r10: xgdDiff,
    xgd_ewm5_diff: xgdDiff,
    xg_overperf_diff_r5: xgOverDiff,
    clinical_overperf_diff_r10: xgOverDiff,
    elo_closeness: eloCloseness,
    low_scoring_tight_match: lowScoringTightMatch,
    dc_logit_h: dcLogitH,
    dc_logit_d: dcLogitD,
    dc_logit_a: dcLogitA,
    elo_logit_h: eloLogitH,
    has_real_xg_history: hasRealXg,
    xg_elo_diff: xgEloDiff,
    xg_elo_vs_elo_diff: xgEloVsEloDiff,
    pts_minus_xpts_diff_r10: ptsMinusXptsDiff,
    xpts_diff_r10: xptsDiff,
    ppda_diff_r10: ppdaDiffR10,
    deep_completions_diff_r10: deepDiffR10,
    altitude_diff_m: altDiffM,
    altitude_shock_flag: altShockFlag,
    surface_pressure_diff: surfPressDiff,
  };

  const baseFeatures = new Array<number | null>(model.n_features_base);
  for (let i = 0; i < model.n_features_base; i += 1) {
    const fname = model.features[i]!;
    const v = populated[fname];
    baseFeatures[i] = v !== undefined && Number.isFinite(v) ? v : null;
  }

  const divOnehot = model.div_levels.map((d) => (d === div ? 1 : 0));
  return {
    row: {
      div,
      features: baseFeatures,
      div_onehot: divOnehot,
    },
    dcExpTotal,
    dcExpDiff,
  };
}

/**
 * Construye determinísticamente la fila base `NFLSnapshotRow` (`29` features) + `NFLLiveContextInput`
 * para `PitchLab Minkowski v3.0` sin doble conteo de EPA.
 */
export function synthesizeNflSnapshotRowFromMaster(
  homeAbbr: string,
  awayAbbr: string,
  homeMaster: TeamMasterFeatureRecord | null,
  awayMaster: TeamMasterFeatureRecord | null,
  matchup: LiveMatchupEdgeRecord,
  model: NFLModelArtifact & NFLLiveArtifactConfig,
): { row: NFLSnapshotRow; liveContext: NFLLiveContextInput } {
  const tlcMap = (
    model as {
      live_v3?: {
        team_live_context?: Record<string, Record<string, unknown>>;
        stadium_physics?: Record<string, { roof_type?: string; is_dome?: boolean; stadium_elevation_m?: number }>;
      };
    }
  ).live_v3;
  const hTlc = homeAbbr ? tlcMap?.team_live_context?.[homeAbbr] : undefined;
  const aTlc = awayAbbr ? tlcMap?.team_live_context?.[awayAbbr] : undefined;
  const hStad = homeAbbr ? tlcMap?.stadium_physics?.[homeAbbr] : undefined;
  const aStad = awayAbbr ? tlcMap?.stadium_physics?.[awayAbbr] : undefined;

  const roofRaw = String(homeMaster?.roof_type ?? hStad?.roof_type ?? "open")
    .trim()
    .toLowerCase();
  const isIndoor =
    roofRaw === "dome" || roofRaw === "closed" || roofRaw === "indoor" || roofRaw === "retractable"
      ? 1.0
      : 0.0;

  const windMph = finiteOr(
    matchup.home_max_wind_speed_mph_7d ??
      homeMaster?.max_wind_speed_mph_7d ??
      hTlc?.max_wind_speed_mph_7d,
    0.0,
  );
  const precipMm = finiteOr(
    homeMaster?.total_precipitation_mm_7d ?? hTlc?.total_precipitation_mm_7d,
    0.0,
  );
  const windOutdoor = isIndoor > 0.5 ? 0.0 : Math.max(0.0, windMph - 12.0);

  const populatedNfl: Record<string, number> = {
    is_indoor: isIndoor,
    neutral_site: 0.0,
    wind_outdoor: windOutdoor,
    cold_outdoor: 0.0,
  };

  const feats = new Array<number | null>(model.n_features);
  for (let i = 0; i < model.n_features; i += 1) {
    const fname = model.features[i]!;
    const v = populatedNfl[fname];
    feats[i] = v !== undefined && Number.isFinite(v) ? v : null;
  }

  const hElev = finiteOr(
    matchup.home_stadium_elevation_m ??
      homeMaster?.stadium_elevation_m ??
      hStad?.stadium_elevation_m,
    100.0,
  );
  const aElev = finiteOr(
    awayMaster?.stadium_elevation_m ?? aStad?.stadium_elevation_m,
    hElev - finiteOr(matchup.altitude_diff_m, 0.0),
  );

  const liveContext: NFLLiveContextInput = {
    homeTeam: homeAbbr,
    awayTeam: awayAbbr,
    neutralSite: false,
    roofType: roofRaw,
    isDome: isIndoor > 0.5,
    stadiumElevationM: hElev,
    awayElevationM: aElev,
    windMph,
    precipitationMm: precipMm,
    homeOffEpaPerPlay: finiteOrNull(
      homeMaster?.nfl_off_epa_per_play ?? hTlc?.off_epa_per_play,
    ),
    homeDefEpaPerPlay: finiteOrNull(
      homeMaster?.nfl_def_epa_per_play ?? hTlc?.def_epa_per_play,
    ),
    awayOffEpaPerPlay: finiteOrNull(
      awayMaster?.nfl_off_epa_per_play ?? aTlc?.off_epa_per_play,
    ),
    awayDefEpaPerPlay: finiteOrNull(
      awayMaster?.nfl_def_epa_per_play ?? aTlc?.def_epa_per_play,
    ),
    homeOffSuccessPct: finiteOrNull(
      homeMaster?.nfl_off_success_pct ?? hTlc?.off_success_pct,
    ),
    homeDefSuccessPct: finiteOrNull(
      homeMaster?.nfl_def_success_pct ?? hTlc?.def_success_pct,
    ),
    awayOffSuccessPct: finiteOrNull(
      awayMaster?.nfl_off_success_pct ?? aTlc?.off_success_pct,
    ),
    awayDefSuccessPct: finiteOrNull(
      awayMaster?.nfl_def_success_pct ?? aTlc?.def_success_pct,
    ),
    homeQbInjured: finiteOr(hTlc?.qb_injured, 0.0),
    awayQbInjured: finiteOr(aTlc?.qb_injured, 0.0),
    homeInjuriesOutIr: finiteOr(
      hTlc?.injuries_out_ir ?? homeMaster?.injured_players_count,
      0.0,
    ),
    awayInjuriesOutIr: finiteOr(
      aTlc?.injuries_out_ir ?? awayMaster?.injured_players_count,
      0.0,
    ),
    homeInjuriesQuestionable: finiteOr(hTlc?.injuries_questionable, 0.0),
    awayInjuriesQuestionable: finiteOr(aTlc?.injuries_questionable, 0.0),
    homePenaltiesPerGame: finiteOrNull(hTlc?.penalties_per_game),
    awayPenaltiesPerGame: finiteOrNull(aTlc?.penalties_per_game),
  };

  return {
    row: {
      home_team: homeAbbr || matchup.home_team,
      away_team: awayAbbr || matchup.away_team,
      features: feats,
    },
    liveContext,
  };
}

function mapMultiSportDrivers(drivers: readonly MultiSportDriver[]): LiveKeyDriver[] {
  return drivers.map((d) => ({
    factor: d.factor,
    label: d.label,
    impactLogit: d.impactLogit,
  }));
}

function resolveRlmSideFromMatchup(matchup: LiveMatchupEdgeRecord): RlmSignalSide {
  if (
    matchup.reverse_line_movement_side === "home" ||
    matchup.reverse_line_movement_side === "away" ||
    matchup.reverse_line_movement_side === "none"
  ) {
    return matchup.reverse_line_movement_side;
  }
  const sharp = finiteOrNull(matchup.sharp_money_divergence);
  if (sharp === null) return "none";
  if (sharp >= 12.0) return "home";
  if (sharp <= -12.0) return "away";
  return "none";
}

function reconstructExecutionOdds(
  probsNovig: readonly number[],
  marketOverround: number,
  explicitOdds?: readonly number[] | null,
): number[] {
  if (
    Array.isArray(explicitOdds) &&
    explicitOdds.length === probsNovig.length &&
    explicitOdds.every((o) => Number.isFinite(o) && o > 1.0)
  ) {
    return [...explicitOdds];
  }
  const effOv = clampVal(Number.isFinite(marketOverround) ? marketOverround : 0.04, 0.0, 0.19);
  const sumImplied = 1.0 + effOv;
  return probsNovig.map((p) => {
    const q = clampVal(p * sumImplied, 0.005, 0.99);
    return Math.max(1.01, 1.0 / q);
  });
}

/**
 * Inferencia unificada `< 1 ms` de un enfrentamiento de `live_matchups_edge_matrix.json`.
 */
export function predictLiveMatchup(
  matchup: LiveMatchupEdgeRecord,
  teamIndex: TeamMasterIndex,
  artifacts: LiveInferenceArtifacts,
): LiveMatchupPrediction {
  const league = String(matchup.league ?? "").trim().toLowerCase();
  const sportRaw = String(matchup.sport ?? "").trim().toLowerCase();

  const homeMaster = lookupTeamMaster(teamIndex, sportRaw, league, matchup.home_team);
  const awayMaster = lookupTeamMaster(teamIndex, sportRaw, league, matchup.away_team);

  const sharpDiv = finiteOrNull(matchup.sharp_money_divergence);
  const smarketsHome = finiteOrNull(matchup.smarkets_exchange_mid_prob_home);
  const rawOverround = finiteOr(matchup.market_overround, 0.045);
  const rlmSide = resolveRlmSideFromMatchup(matchup);
  const primaryBook =
    Array.isArray(matchup.market_sources) && matchup.market_sources.length > 0
      ? String(matchup.market_sources[0])
      : "";

  // -------------------------------------------------------------------------
  // Caso 1: Fútbol / Soccer (3-way: Liga MX + Top-5 Europa)
  // -------------------------------------------------------------------------
  if (sportRaw === "soccer" || sportRaw === "football_soccer" || league in SOCCER_LEAGUE_TO_DIV) {
    const div = SOCCER_LEAGUE_TO_DIV[league] ?? "E0";
    const preRow = artifacts.precomputedFootballRows?.[matchup.matchup_id];
    const synth = synthesizeFootballSnapshotRowFromMaster(
      div,
      homeMaster,
      awayMaster,
      matchup,
      artifacts.footballModel,
    );
    const activeRow = preRow ?? synth.row;

    const availDetail = computeLineupAvailabilityDelta(
      homeMaster,
      awayMaster,
      artifacts.footballModel.prospective_availability_prior,
    );
    const tachyon = predictMotorAWithAvailability(
      activeRow,
      artifacts.footballModel,
      availDetail.lineup_availability_delta,
    );
    const sportsProbs = {
      pHome: tachyon.pHome,
      pDraw: tachyon.pDraw,
      pAway: tachyon.pAway,
    };

    const drivers: LiveKeyDriver[] = [
      {
        factor: "clubelo_and_xg_elo",
        label: "ClubElo + Real xG-Elo Structural Differential",
        impactLogit:
          (finiteOr(homeMaster?.club_elo_rating, 1550) +
            65 -
            finiteOr(awayMaster?.club_elo_rating, 1550)) /
          400,
      },
      {
        factor: "lineup_availability_delta",
        label: "Transfermarkt + RotoWire Prospective Availability Prior",
        impactLogit: availDetail.lineup_availability_delta,
      },
      {
        factor: "stadium_altitude_physics",
        label: "Open-Meteo Stadium Elevation & Barometric Pressure",
        impactLogit:
          finiteOr(matchup.home_stadium_elevation_m ?? homeMaster?.stadium_elevation_m, 100) >= 2100
            ? 0.08 *
              Math.max(
                0,
                finiteOr(matchup.altitude_diff_m, 0) / 1000,
              )
            : 0,
      },
    ];

    const pHNovig = finiteOrNull(matchup.p_home_novig);
    const pDNovig = finiteOrNull(matchup.p_draw_novig);
    const pANovig = finiteOrNull(matchup.p_away_novig);

    if (
      pHNovig !== null &&
      pDNovig !== null &&
      pANovig !== null &&
      pHNovig > 0 &&
      pDNovig > 0 &&
      pANovig > 0
    ) {
      const execOdds = reconstructExecutionOdds(
        [pHNovig, pDNovig, pANovig],
        rawOverround,
        matchup.odds,
      );
      const adaptive = devigAdaptive1X2([execOdds[0]!, execOdds[1]!, execOdds[2]!]);
      let mktProbs: readonly [number, number, number] = [
        adaptive.pHome,
        adaptive.pDraw,
        adaptive.pAway,
      ];
      let mxBiasAdjusted = false;
      if (league === "liga-mx") {
        const deb = debiaseRecreationalLigaMx(mktProbs, {
          homeTeam: matchup.home_team,
          awayTeam: matchup.away_team,
          overround: adaptive.overround,
          bookmaker: primaryBook,
        });
        mktProbs = [deb.pHome, deb.pDraw, deb.pAway];
        mxBiasAdjusted = deb.biasDetected;
      }

      const sing = applySingularitySharpTilt3Way({
        modelProbs: [sportsProbs.pHome, sportsProbs.pDraw, sportsProbs.pAway],
        marketProbs: mktProbs,
        marketOverround: adaptive.overround,
        smarketsExchangeMidProbHome: smarketsHome,
        sharpMoneyDivergenceHomePct: sharpDiv,
        reverseLineMovementSide: rlmSide,
      });
      const geodesic = evaluateGeodesicV2ValueGate({
        probs: [sing.pHome, sing.pDraw, sing.pAway],
        odds: execOdds,
        marketProbs: mktProbs,
        reverseLineMovementSide: rlmSide,
        sharpMoneyDivergenceHomePct: sharpDiv,
      });

      return {
        matchupId: matchup.matchup_id,
        sport: "football",
        league,
        homeTeam: matchup.home_team,
        awayTeam: matchup.away_team,
        marketType: "3way",
        sportsModelName: TACHYON_MODEL_NAME,
        activeModelName: SINGULARITY_MODEL_NAME,
        activeEngine: "singularity_v3",
        sportsProbs,
        marketProbsAdaptive: {
          pHome: mktProbs[0],
          pDraw: mktProbs[1],
          pAway: mktProbs[2],
          overround: adaptive.overround,
          ligaMxBiasAdjusted: mxBiasAdjusted,
        },
        finalProbs: {
          pHome: sing.pHome,
          pDraw: sing.pDraw,
          pAway: sing.pAway,
        },
        expectedTotal: synth.dcExpTotal,
        expectedMargin: synth.dcExpDiff,
        lineupAvailabilityDelta: availDetail.lineup_availability_delta,
        sharpLogitTilt: sing.sharpLogitTilt,
        effectiveMarketAlpha: sing.effectiveMarketAlpha,
        geodesicV2: geodesic,
        drivers,
      };
    }

    if (smarketsHome !== null && smarketsHome > 0.01 && smarketsHome < 0.98) {
      const singExch = applySingularitySharpTilt3Way({
        modelProbs: [sportsProbs.pHome, sportsProbs.pDraw, sportsProbs.pAway],
        marketProbs: [sportsProbs.pHome, sportsProbs.pDraw, sportsProbs.pAway],
        baseMarketAlpha: 0.25,
        smarketsExchangeMidProbHome: smarketsHome,
        sharpMoneyDivergenceHomePct: sharpDiv,
        reverseLineMovementSide: rlmSide,
      });
      return {
        matchupId: matchup.matchup_id,
        sport: "football",
        league,
        homeTeam: matchup.home_team,
        awayTeam: matchup.away_team,
        marketType: "3way",
        sportsModelName: TACHYON_MODEL_NAME,
        activeModelName: SINGULARITY_MODEL_NAME,
        activeEngine: "smarkets_anchor_v3",
        sportsProbs,
        marketProbsAdaptive: null,
        finalProbs: {
          pHome: singExch.pHome,
          pDraw: singExch.pDraw,
          pAway: singExch.pAway,
        },
        expectedTotal: synth.dcExpTotal,
        expectedMargin: synth.dcExpDiff,
        lineupAvailabilityDelta: availDetail.lineup_availability_delta,
        sharpLogitTilt: singExch.sharpLogitTilt,
        effectiveMarketAlpha: singExch.effectiveMarketAlpha,
        geodesicV2: null,
        drivers,
      };
    }

    return {
      matchupId: matchup.matchup_id,
      sport: "football",
      league,
      homeTeam: matchup.home_team,
      awayTeam: matchup.away_team,
      marketType: "3way",
      sportsModelName: TACHYON_MODEL_NAME,
      activeModelName: TACHYON_MODEL_NAME,
      activeEngine: "sports_only",
      sportsProbs,
      marketProbsAdaptive: null,
      finalProbs: sportsProbs,
      expectedTotal: synth.dcExpTotal,
      expectedMargin: synth.dcExpDiff,
      lineupAvailabilityDelta: availDetail.lineup_availability_delta,
      sharpLogitTilt: 0,
      effectiveMarketAlpha: null,
      geodesicV2: null,
      drivers,
    };
  }

  // -------------------------------------------------------------------------
  // Caso 2: NFL (`PitchLab Minkowski v3.0` + 2-way Market Pool)
  // -------------------------------------------------------------------------
  if (league === "nfl") {
    const homeAbbr = teamIndex.nflSlugToAbbr.get(slugToken(matchup.home_team)) ?? "";
    const awayAbbr = teamIndex.nflSlugToAbbr.get(slugToken(matchup.away_team)) ?? "";
    const synthNfl = synthesizeNflSnapshotRowFromMaster(
      homeAbbr,
      awayAbbr,
      homeMaster,
      awayMaster,
      matchup,
      artifacts.nflModel,
    );
    const activeRow = artifacts.precomputedNflRows?.[matchup.matchup_id] ?? synthNfl.row;
    const baseNfl = predictNFL(activeRow, artifacts.nflModel);
    const liveNfl = applyMinkowskiV3LiveContext(baseNfl, synthNfl.liveContext, artifacts.nflModel);

    const sportsSum2 = liveNfl.pHome + liveNfl.pAway;
    const sportsH2 = sportsSum2 > 0 ? liveNfl.pHome / sportsSum2 : 0.5;
    const sportsA2 = 1.0 - sportsH2;
    const expectedMarginNfl = 13.5 * Math.log(clampVal(sportsH2, 1e-6, 1 - 1e-6) / clampVal(sportsA2, 1e-6, 1 - 1e-6)) * 0.42;

    const drivers: LiveKeyDriver[] = liveNfl.delta.drivers.map((d) => ({
      factor: d.factor,
      label: d.label,
      impactLogit: d.impactLogit,
    }));

    const pHNovig = finiteOrNull(matchup.p_home_novig);
    const pANovig = finiteOrNull(matchup.p_away_novig);

    if (pHNovig !== null && pANovig !== null && pHNovig > 0 && pANovig > 0) {
      const sumM2 = pHNovig + pANovig;
      const execOdds = reconstructExecutionOdds(
        [pHNovig / sumM2, pANovig / sumM2],
        rawOverround,
        matchup.odds,
      );
      const adaptive2 = devig2Way(execOdds[0]!, execOdds[1]!, "adaptive");
      const sing2 = applySingularitySharpTilt2Way({
        modelProbs: [sportsH2, sportsA2],
        marketProbs: [adaptive2.pHome, adaptive2.pAway],
        marketOverround: adaptive2.overround,
        smarketsExchangeMidProbHome: smarketsHome,
        sharpMoneyDivergenceHomePct: sharpDiv,
        reverseLineMovementSide: rlmSide,
      });
      const geodesic2 = evaluateGeodesicV2ValueGate({
        probs: [sing2.pHome, sing2.pAway],
        odds: execOdds,
        marketProbs: [adaptive2.pHome, adaptive2.pAway],
        reverseLineMovementSide: rlmSide,
        sharpMoneyDivergenceHomePct: sharpDiv,
      });

      return {
        matchupId: matchup.matchup_id,
        sport: "nfl",
        league: "nfl",
        homeTeam: matchup.home_team,
        awayTeam: matchup.away_team,
        marketType: "2way",
        sportsModelName: MINKOWSKI_MODEL_NAME,
        activeModelName: SINGULARITY_MODEL_NAME,
        activeEngine: "singularity_v3",
        sportsProbs: {
          pHome: sportsH2,
          pDraw: 0,
          pAway: sportsA2,
        },
        marketProbsAdaptive: {
          pHome: adaptive2.pHome,
          pDraw: 0,
          pAway: adaptive2.pAway,
          overround: adaptive2.overround,
          ligaMxBiasAdjusted: false,
        },
        finalProbs: {
          pHome: sing2.pHome,
          pDraw: 0,
          pAway: sing2.pAway,
        },
        expectedTotal: liveNfl.expectedTotalPoints,
        expectedMargin: expectedMarginNfl,
        lineupAvailabilityDelta: liveNfl.delta.injuryLogitDelta,
        sharpLogitTilt: sing2.sharpLogitTilt,
        effectiveMarketAlpha: sing2.effectiveMarketAlpha,
        geodesicV2: geodesic2,
        drivers,
      };
    }

    return {
      matchupId: matchup.matchup_id,
      sport: "nfl",
      league: "nfl",
      homeTeam: matchup.home_team,
      awayTeam: matchup.away_team,
      marketType: "2way",
      sportsModelName: MINKOWSKI_MODEL_NAME,
      activeModelName: MINKOWSKI_MODEL_NAME,
      activeEngine: "sports_only",
      sportsProbs: { pHome: sportsH2, pDraw: 0, pAway: sportsA2 },
      marketProbsAdaptive: null,
      finalProbs: { pHome: sportsH2, pDraw: 0, pAway: sportsA2 },
      expectedTotal: liveNfl.expectedTotalPoints,
      expectedMargin: expectedMarginNfl,
      lineupAvailabilityDelta: liveNfl.delta.injuryLogitDelta,
      sharpLogitTilt: 0,
      effectiveMarketAlpha: null,
      geodesicV2: null,
      drivers,
    };
  }

  // -------------------------------------------------------------------------
  // Caso 3: Multi-Deporte (`NHL`, `MLB`, `NBA`, `NCAAF`)
  // -------------------------------------------------------------------------
  const msSport: MultiSportLeague =
    league === "nhl" || league === "mlb" || league === "nba" || league === "ncaaf"
      ? league
      : sportRaw === "hockey"
        ? "nhl"
        : sportRaw === "baseball"
          ? "mlb"
          : sportRaw === "basketball"
            ? "nba"
            : "ncaaf";

  const roofType = String(homeMaster?.roof_type ?? "").trim().toLowerCase();
  const isDomeOpt =
    roofType === "dome" || roofType === "closed" || roofType === "indoor" || roofType === "indoor_arena"
      ? true
      : roofType === "open"
        ? false
        : null;
  const roofOpenOpt = roofType === "open" || roofType === "retractable" ? true : isDomeOpt === true ? false : null;

  const msInput: MultiSportMatchupInput = {
    homeTeam: matchup.home_team,
    awayTeam: matchup.away_team,
    neutralSite: false,
    isDome: isDomeOpt,
    roofOpen: roofOpenOpt,
    stadiumElevationM: finiteOrNull(
      matchup.home_stadium_elevation_m ?? homeMaster?.stadium_elevation_m,
    ),
    awayElevationM: finiteOrNull(awayMaster?.stadium_elevation_m),
    surfacePressureHpa: finiteOrNull(
      matchup.home_surface_pressure_hpa ?? homeMaster?.surface_pressure_hpa,
    ),
    windMph: finiteOrNull(matchup.home_max_wind_speed_mph_7d ?? homeMaster?.max_wind_speed_mph_7d),
    precipitationMm: finiteOrNull(homeMaster?.total_precipitation_mm_7d),
    homeInjuriesOut: finiteOrNull(homeMaster?.injured_players_count),
    awayInjuriesOut: finiteOrNull(awayMaster?.injured_players_count),
  };

  const msPred: MultiSportPrediction = predictMultiSport(msSport, msInput, artifacts.multisportModel);
  const sportsProbs2 = { pHome: msPred.pHome, pDraw: 0, pAway: msPred.pAway };
  const expectedTotal =
    msPred.sport === "nhl"
      ? msPred.expectedTotalGoals
      : msPred.sport === "mlb"
        ? msPred.expectedTotalRuns
        : msPred.expectedTotalPoints;
  const expectedMargin =
    msPred.sport === "nhl"
      ? msPred.expectedGoalsHome - msPred.expectedGoalsAway
      : msPred.sport === "mlb"
        ? msPred.expectedRunMargin
        : msPred.expectedMargin;

  const drivers = mapMultiSportDrivers(msPred.drivers);
  const pHNovig = finiteOrNull(matchup.p_home_novig);
  const pANovig = finiteOrNull(matchup.p_away_novig);

  if (pHNovig !== null && pANovig !== null && pHNovig > 0 && pANovig > 0) {
    const sumM2 = pHNovig + pANovig;
    const execOdds = reconstructExecutionOdds(
      [pHNovig / sumM2, pANovig / sumM2],
      rawOverround,
      matchup.odds,
    );
    const adaptive2 = devig2Way(execOdds[0]!, execOdds[1]!, "adaptive");
    const sing2 = applySingularitySharpTilt2Way({
      modelProbs: [msPred.pHome, msPred.pAway],
      marketProbs: [adaptive2.pHome, adaptive2.pAway],
      marketOverround: adaptive2.overround,
      smarketsExchangeMidProbHome: smarketsHome,
      sharpMoneyDivergenceHomePct: sharpDiv,
      reverseLineMovementSide: rlmSide,
    });
    const geodesic2 = evaluateGeodesicV2ValueGate({
      probs: [sing2.pHome, sing2.pAway],
      odds: execOdds,
      marketProbs: [adaptive2.pHome, adaptive2.pAway],
      reverseLineMovementSide: rlmSide,
      sharpMoneyDivergenceHomePct: sharpDiv,
    });

    return {
      matchupId: matchup.matchup_id,
      sport: msSport,
      league,
      homeTeam: matchup.home_team,
      awayTeam: matchup.away_team,
      marketType: "2way",
      sportsModelName: msPred.modelId,
      activeModelName: SINGULARITY_MODEL_NAME,
      activeEngine: "singularity_v3",
      sportsProbs: sportsProbs2,
      marketProbsAdaptive: {
        pHome: adaptive2.pHome,
        pDraw: 0,
        pAway: adaptive2.pAway,
        overround: adaptive2.overround,
        ligaMxBiasAdjusted: false,
      },
      finalProbs: {
        pHome: sing2.pHome,
        pDraw: 0,
        pAway: sing2.pAway,
      },
      expectedTotal,
      expectedMargin,
      lineupAvailabilityDelta: null,
      sharpLogitTilt: sing2.sharpLogitTilt,
      effectiveMarketAlpha: sing2.effectiveMarketAlpha,
      geodesicV2: geodesic2,
      drivers,
    };
  }

  return {
    matchupId: matchup.matchup_id,
    sport: msSport,
    league,
    homeTeam: matchup.home_team,
    awayTeam: matchup.away_team,
    marketType: "2way",
    sportsModelName: msPred.modelId,
    activeModelName: msPred.modelId,
    activeEngine: "sports_only",
    sportsProbs: sportsProbs2,
    marketProbsAdaptive: null,
    finalProbs: sportsProbs2,
    expectedTotal,
    expectedMargin,
    lineupAvailabilityDelta: null,
    sharpLogitTilt: 0,
    effectiveMarketAlpha: null,
    geodesicV2: null,
    drivers,
  };
}

/**
 * Ejecuta inferencia en tiempo real sobre toda la matriz `live_matchups_edge_matrix.json`
 * (`242` enfrentamientos en `11` ligas) en `< 1 ms` promedio por enfrentamiento, cero I/O.
 */
export function predictLiveEdgeMatrix(
  edgeMatrix:
    | readonly LiveMatchupEdgeRecord[]
    | { readonly records: readonly LiveMatchupEdgeRecord[] },
  teamMaster:
    | readonly TeamMasterFeatureRecord[]
    | { readonly records: readonly TeamMasterFeatureRecord[] },
  artifacts: LiveInferenceArtifacts,
): LiveEdgeMatrixBatchResult {
  const rows = Array.isArray(edgeMatrix)
    ? edgeMatrix
    : (edgeMatrix as { readonly records: readonly LiveMatchupEdgeRecord[] }).records;
  const teamIndex = buildTeamMasterIndex(teamMaster, artifacts.nflModel);

  const countsByLeague: Record<string, number> = {};
  let executableBetsCount = 0;
  let vetoedByRlmCount = 0;
  let institutionallyConfirmedCount = 0;

  const predictions: LiveMatchupPrediction[] = new Array(rows.length);
  for (let i = 0; i < rows.length; i += 1) {
    const rec = rows[i]!;
    const pred = predictLiveMatchup(rec, teamIndex, artifacts);
    predictions[i] = pred;
    countsByLeague[pred.league] = (countsByLeague[pred.league] ?? 0) + 1;
    if (pred.geodesicV2) {
      if (pred.geodesicV2.recommendedStake > 0) executableBetsCount += 1;
      if (pred.geodesicV2.vetoedByRlm) vetoedByRlmCount += 1;
      if (pred.geodesicV2.institutionalConfirmation) institutionallyConfirmedCount += 1;
    }
  }

  return {
    count: predictions.length,
    countsByLeague,
    executableBetsCount,
    vetoedByRlmCount,
    institutionallyConfirmedCount,
    predictions,
  };
}

/** Identificadores y nombres en clave de motores exportados (reexportados por comodidad del servicio). */
export {
  GEODESIC_MODEL_NAME,
  HORIZON_MODEL_NAME,
  HYBRID_MODEL_ID,
  MINKOWSKI_MODEL_NAME,
  MULTISPORT_CODENAMES,
  NFL_MODEL_ID,
  SINGULARITY_MODEL_NAME,
  TACHYON_MODEL_NAME,
};
