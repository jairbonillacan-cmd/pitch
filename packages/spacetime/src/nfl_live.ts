/**
 * Capa prospectiva Bayesiana en vivo de `PitchLab Minkowski v3.0` (NFL).
 *
 * Espejo determinista 1:1 de `research/prediction-lab/models/nfl/live_context.py`
 * con paridad numérica exacta (`|Δ| < 1e-12`) y cero dependencias externas.
 *
 * Integra:
 *  1. SumerSports EPA/play & Success % (diferencial ofensivo/defensivo neto con encogimiento Bayesiano).
 *  2. Ourlads Depth Charts + NFL Official Injuries (`homeQbInjured`/`awayQbInjured`, `Out/IR`, `Questionable`).
 *  3. NFLPenalties tendencias arbitrales (disciplina por equipo x rigor `flags/game` y `home_penalty_bias` de cuadrilla).
 *  4. Open-Meteo clima horario/7d + física de los 32 estadios (viento `>= 15 mph`, lluvia/nieve exterior y altitud `>= 1500 m`).
 */

export const MINKOWSKI_V3_MODEL_ID = "pitchlab-minkowski-v3.0" as const;

export interface NFLLiveContextPriors {
  epa_prior_games: number;
  default_sample_games: number;
  w_net_epa: number;
  w_net_success_pct: number;
  epa_total_pts_scale: number;
  w_qb_injured: number;
  w_injury_out_ir: number;
  w_injury_questionable: number;
  qb_injury_total_pts: number;
  league_flags_per_game: number;
  league_home_penalty_bias: number;
  w_penalty_discipline: number;
  w_crew_home_bias: number;
  wind_threshold_mph: number;
  wind_compression_per_mph: number;
  wind_max_compression: number;
  wind_total_pts_per_mph: number;
  wind_tie_boost_per_mph: number;
  precip_threshold_mm: number;
  precip_compression_per_mm: number;
  precip_max_compression: number;
  precip_total_pts_per_mm: number;
  precip_tie_boost_per_mm: number;
  altitude_threshold_m: number;
  w_altitude_live_only: number;
  w_altitude_residual: number;
  default_expected_total_pts: number;
}

export const MINKOWSKI_V3_DEFAULT_PRIORS: Readonly<NFLLiveContextPriors> = {
  epa_prior_games: 8.0,
  default_sample_games: 9.0,
  w_net_epa: 0.85,
  w_net_success_pct: 0.012,
  epa_total_pts_scale: 22.0,
  w_qb_injured: 0.26,
  w_injury_out_ir: 0.022,
  w_injury_questionable: 0.008,
  qb_injury_total_pts: -2.6,
  league_flags_per_game: 15.6,
  league_home_penalty_bias: 0.22,
  w_penalty_discipline: 0.024,
  w_crew_home_bias: 0.028,
  wind_threshold_mph: 15.0,
  wind_compression_per_mph: 0.0045,
  wind_max_compression: 0.14,
  wind_total_pts_per_mph: -0.24,
  wind_tie_boost_per_mph: 0.015,
  precip_threshold_mm: 1.0,
  precip_compression_per_mm: 0.003,
  precip_max_compression: 0.08,
  precip_total_pts_per_mm: -0.18,
  precip_tie_boost_per_mm: 0.008,
  altitude_threshold_m: 1500.0,
  w_altitude_live_only: 0.068,
  w_altitude_residual: 0.035,
  default_expected_total_pts: 45.2,
};

export interface NFLRefereeCrewProfile {
  referee_name: string;
  games_officiated?: number;
  nfl_penalties_per_game?: number;
  total_flags_per_game: number;
  home_penalties_per_game?: number;
  away_penalties_per_game?: number;
  home_penalty_bias: number;
}

export interface NFLStadiumPhysicsProfile {
  team_abbr: string;
  stadium_name: string;
  stadium_elevation_m: number;
  structural_pressure_hpa?: number;
  roof_type: string;
  is_dome: boolean;
}

export interface NFLLiveArtifactConfig {
  live_v3?: {
    priors?: Partial<NFLLiveContextPriors>;
    referee_crews?: Record<string, NFLRefereeCrewProfile>;
    stadium_physics?: Record<string, NFLStadiumPhysicsProfile>;
  };
  priors?: Partial<NFLLiveContextPriors>;
  referee_crews?: Record<string, NFLRefereeCrewProfile>;
  stadium_physics?: Record<string, NFLStadiumPhysicsProfile>;
}

export interface NFLLiveContextInput {
  homeTeam?: string;
  awayTeam?: string;
  home_team?: string;
  away_team?: string;
  neutralSite?: boolean;
  neutral_site?: boolean;
  sampleGames?: number;
  sample_games?: number;

  // SumerSports EPA/play & Success %
  homeOffEpaPerPlay?: number | null;
  homeDefEpaPerPlay?: number | null;
  awayOffEpaPerPlay?: number | null;
  awayDefEpaPerPlay?: number | null;
  netEpaDiff?: number | null;
  homeOffSuccessPct?: number | null;
  homeDefSuccessPct?: number | null;
  awayOffSuccessPct?: number | null;
  awayDefSuccessPct?: number | null;
  netSuccessPctDiff?: number | null;
  home_off_epa_per_play?: number | null;
  home_def_epa_per_play?: number | null;
  away_off_epa_per_play?: number | null;
  away_def_epa_per_play?: number | null;
  net_epa_diff?: number | null;
  home_off_success_pct?: number | null;
  home_def_success_pct?: number | null;
  away_off_success_pct?: number | null;
  away_def_success_pct?: number | null;
  net_success_pct_diff?: number | null;

  // Ourlads + Official Injuries
  homeQbInjured?: number | null;
  awayQbInjured?: number | null;
  homeInjuriesOutIr?: number | null;
  awayInjuriesOutIr?: number | null;
  homeInjuriesQuestionable?: number | null;
  awayInjuriesQuestionable?: number | null;
  home_qb_injured?: number | null;
  away_qb_injured?: number | null;
  home_injuries_out_ir?: number | null;
  away_injuries_out_ir?: number | null;
  home_injuries_questionable?: number | null;
  away_injuries_questionable?: number | null;

  // NFLPenalties referee & team discipline
  refereeCrew?: string | null;
  crewFlagsPerGame?: number | null;
  crewHomePenaltyBias?: number | null;
  homePenaltiesPerGame?: number | null;
  awayPenaltiesPerGame?: number | null;
  referee_crew?: string | null;
  crew_flags_per_game?: number | null;
  crew_home_penalty_bias?: number | null;
  home_penalties_per_game?: number | null;
  away_penalties_per_game?: number | null;

  // Open-Meteo & Stadium Physics
  isDome?: boolean | number | null;
  roofType?: string | null;
  roofOpen?: boolean | null;
  stadiumElevationM?: number | null;
  awayElevationM?: number | null;
  maxWindSpeedMph?: number | null;
  windMph?: number | null;
  precipitationMm?: number | null;
  baseIncludesVenueAltitude?: boolean;
  baseExpectedTotal?: number | null;
  is_dome?: boolean | number | null;
  roof_type?: string | null;
  roof_open?: boolean | null;
  stadium_elevation_m?: number | null;
  away_elevation_m?: number | null;
  max_wind_speed_mph?: number | null;
  wind_mph?: number | null;
  total_precipitation_mm?: number | null;
  precipitation_mm?: number | null;
  precip_mm?: number | null;
  base_includes_venue_altitude?: boolean;
  base_expected_total?: number | null;
}

export interface NFLLiveDriver {
  factor:
    | "sumersports_epa_success"
    | "injuries_qb_depth"
    | "referee_penalties"
    | "weather_stadium_physics";
  label: string;
  netValue: number;
  impactLogit: number;
  impactTotalPoints: number;
}

export interface NFLLiveContextDelta {
  epaLogitDelta: number;
  injuryLogitDelta: number;
  refereeLogitDelta: number;
  altitudeLogitDelta: number;
  totalLogitDelta: number;
  weatherCompression: number;
  tieWeatherBoost: number;
  totalPointsDelta: number;
  isDome: boolean;
  drivers: NFLLiveDriver[];
}

export interface NFLBaseThreeWay {
  pHome: number;
  pDraw: number;
  pAway: number;
  expectedTotal?: number;
}

export interface MinkowskiV3LivePrediction {
  sport: "nfl";
  modelId: typeof MINKOWSKI_V3_MODEL_ID;
  pHome: number;
  pDraw: number;
  pAway: number;
  expectedTotalPoints: number;
  delta: NFLLiveContextDelta;
}

function clamp(val: number, lo: number, hi: number): number {
  if (val < lo) return lo;
  if (val > hi) return hi;
  return val;
}

function num(val: unknown, fallback: number | null = null): number | null {
  if (val === null || val === undefined || typeof val === "boolean") return fallback;
  const f = Number(val);
  return Number.isFinite(f) ? f : fallback;
}

function normPct(val: number | null): number | null {
  if (val === null) return null;
  if (val >= -1.5 && val <= 1.5 && val !== 0.0) return val * 100.0;
  return val;
}

function pick<T>(...vals: Array<T | undefined>): T | undefined {
  for (const v of vals) {
    if (v !== undefined) return v;
  }
  return undefined;
}

function resolveIsDome(
  ctx: NFLLiveContextInput,
  stadiumInfo: NFLStadiumPhysicsProfile | undefined,
): boolean {
  const explicit = pick(ctx.is_dome, ctx.isDome);
  if (typeof explicit === "boolean") return explicit;
  if (explicit === 0 || explicit === 1) return Boolean(explicit);

  let roofRaw: string | null | undefined = pick(ctx.roof_type, ctx.roofType);
  if ((roofRaw === null || roofRaw === undefined) && stadiumInfo !== undefined) {
    if (typeof stadiumInfo.is_dome === "boolean" && stadiumInfo.roof_type !== "retractable") {
      return stadiumInfo.is_dome;
    }
    roofRaw = stadiumInfo.roof_type;
  }

  const roof = String(roofRaw ?? "open").trim().toLowerCase();
  if (roof === "dome" || roof === "indoor" || roof === "closed" || roof === "indoor_arena") {
    return true;
  }
  if (roof === "retractable") {
    const roofOpen = pick(ctx.roof_open, ctx.roofOpen);
    if (typeof roofOpen === "boolean") return !roofOpen;
    return true;
  }
  return false;
}

function unpackConfig(config?: NFLLiveArtifactConfig | null): {
  priors: NFLLiveContextPriors;
  crews: Record<string, NFLRefereeCrewProfile> | undefined;
  stadiums: Record<string, NFLStadiumPhysicsProfile> | undefined;
} {
  const sub = config?.live_v3;
  const mergedPriors: NFLLiveContextPriors = {
    ...MINKOWSKI_V3_DEFAULT_PRIORS,
    ...(config?.priors ?? {}),
    ...(sub?.priors ?? {}),
  };
  return {
    priors: mergedPriors,
    crews: sub?.referee_crews ?? config?.referee_crews,
    stadiums: sub?.stadium_physics ?? config?.stadium_physics,
  };
}

export function computeNflLiveContextDelta(
  context?: NFLLiveContextInput | null,
  config?: NFLLiveArtifactConfig | null,
): NFLLiveContextDelta {
  const ctx: NFLLiveContextInput = context ?? {};
  const { priors: p, crews: refereeCrews, stadiums } = unpackConfig(config);

  const homeTeam = String(pick(ctx.home_team, ctx.homeTeam) ?? "").trim().toUpperCase();
  const awayTeam = String(pick(ctx.away_team, ctx.awayTeam) ?? "").trim().toUpperCase();

  const homeStad = homeTeam && stadiums ? stadiums[homeTeam] : undefined;
  const awayStad = awayTeam && stadiums ? stadiums[awayTeam] : undefined;

  const isDome = resolveIsDome(ctx, homeStad);
  const neutralSite = Boolean(pick(ctx.neutral_site, ctx.neutralSite) ?? false);

  const windMph =
    num(pick(ctx.max_wind_speed_mph, ctx.maxWindSpeedMph, ctx.wind_mph, ctx.windMph), 0.0) ?? 0.0;
  const precipMm =
    num(
      pick(ctx.total_precipitation_mm, ctx.precipitation_mm, ctx.precipitationMm, ctx.precip_mm),
      0.0,
    ) ?? 0.0;

  // 1. Open-Meteo & Física de Estadio
  const excessWind = isDome ? 0.0 : clamp(windMph - p.wind_threshold_mph, 0.0, 30.0);
  const excessPrecip = isDome ? 0.0 : clamp(precipMm - p.precip_threshold_mm, 0.0, 25.0);

  const windComp = 1.0 - Math.min(p.wind_max_compression, p.wind_compression_per_mph * excessWind);
  const precipComp =
    1.0 - Math.min(p.precip_max_compression, p.precip_compression_per_mm * excessPrecip);
  const weatherCompression = windComp * precipComp;

  const windTotalDelta = p.wind_total_pts_per_mph * excessWind;
  const precipTotalDelta = p.precip_total_pts_per_mm * excessPrecip;
  const tieWeatherBoost = clamp(
    p.wind_tie_boost_per_mph * excessWind + p.precip_tie_boost_per_mm * excessPrecip,
    0.0,
    0.65,
  );

  const homeElev =
    num(
      pick(ctx.stadium_elevation_m, ctx.stadiumElevationM),
      num(homeStad?.stadium_elevation_m, 100.0),
    ) ?? 100.0;
  const awayElev =
    num(
      pick(ctx.away_elevation_m, ctx.awayElevationM),
      num(awayStad?.stadium_elevation_m, 100.0),
    ) ?? 100.0;

  const baseHasAlt = Boolean(
    pick(ctx.base_includes_venue_altitude, ctx.baseIncludesVenueAltitude) ?? false,
  );
  let altDiffM = 0.0;
  let altitudeLogitDelta = 0.0;
  let altitudeTotalDelta = 0.0;
  if (!neutralSite && homeElev >= p.altitude_threshold_m) {
    altDiffM = Math.max(0.0, homeElev - awayElev);
    const wAlt = baseHasAlt ? p.w_altitude_residual : p.w_altitude_live_only;
    altitudeLogitDelta = clamp(wAlt * (altDiffM / 1500.0), 0.0, 0.12);
    altitudeTotalDelta = isDome ? 0.0 : clamp(0.75 * (homeElev / 1588.0), 0.0, 1.25);
  }

  const weatherTotalDelta = clamp(windTotalDelta + precipTotalDelta + altitudeTotalDelta, -9.5, 1.5);

  // 2. SumerSports EPA/play & Success %
  const hOffEpa = num(pick(ctx.home_off_epa_per_play, ctx.homeOffEpaPerPlay));
  const hDefEpa = num(pick(ctx.home_def_epa_per_play, ctx.homeDefEpaPerPlay));
  const aOffEpa = num(pick(ctx.away_off_epa_per_play, ctx.awayOffEpaPerPlay));
  const aDefEpa = num(pick(ctx.away_def_epa_per_play, ctx.awayDefEpaPerPlay));
  const explicitEpaDiff = num(pick(ctx.net_epa_diff, ctx.netEpaDiff));

  let rawNetEpaDiff = 0.0;
  let offEpaSum = 0.0;
  if (hOffEpa !== null && hDefEpa !== null && aOffEpa !== null && aDefEpa !== null) {
    rawNetEpaDiff = hOffEpa + aDefEpa - (aOffEpa + hDefEpa);
    offEpaSum = hOffEpa + aDefEpa + (aOffEpa + hDefEpa);
  } else if (explicitEpaDiff !== null) {
    rawNetEpaDiff = explicitEpaDiff;
  }

  const hOffSucc = normPct(num(pick(ctx.home_off_success_pct, ctx.homeOffSuccessPct)));
  const hDefSucc = normPct(num(pick(ctx.home_def_success_pct, ctx.homeDefSuccessPct)));
  const aOffSucc = normPct(num(pick(ctx.away_off_success_pct, ctx.awayOffSuccessPct)));
  const aDefSucc = normPct(num(pick(ctx.away_def_success_pct, ctx.awayDefSuccessPct)));
  const explicitSuccDiff = normPct(num(pick(ctx.net_success_pct_diff, ctx.netSuccessPctDiff)));

  let rawNetSuccDiff = 0.0;
  if (hOffSucc !== null && hDefSucc !== null && aOffSucc !== null && aDefSucc !== null) {
    rawNetSuccDiff = hOffSucc + aDefSucc - (aOffSucc + hDefSucc);
  } else if (explicitSuccDiff !== null) {
    rawNetSuccDiff = explicitSuccDiff;
  }

  const sampleGames = clamp(
    num(pick(ctx.sample_games, ctx.sampleGames), p.default_sample_games) ?? p.default_sample_games,
    0.0,
    20.0,
  );
  const epaShrink = sampleGames / (sampleGames + p.epa_prior_games);
  const aeroPassFactor = isDome ? 1.0 : 1.0 - Math.min(0.25, 0.01 * excessWind);

  const epaLogitDelta = clamp(
    epaShrink *
      aeroPassFactor *
      (p.w_net_epa * rawNetEpaDiff + p.w_net_success_pct * rawNetSuccDiff),
    -0.42,
    0.42,
  );
  const epaTotalDelta = clamp(epaShrink * p.epa_total_pts_scale * offEpaSum, -6.5, 6.5);

  // 3. Ourlads + Official Injuries
  const hQbInj = clamp(num(pick(ctx.home_qb_injured, ctx.homeQbInjured), 0.0) ?? 0.0, 0.0, 1.0);
  const aQbInj = clamp(num(pick(ctx.away_qb_injured, ctx.awayQbInjured), 0.0) ?? 0.0, 0.0, 1.0);
  const hOutIr = num(pick(ctx.home_injuries_out_ir, ctx.homeInjuriesOutIr), 0.0) ?? 0.0;
  const aOutIr = num(pick(ctx.away_injuries_out_ir, ctx.awayInjuriesOutIr), 0.0) ?? 0.0;
  const hQuest =
    num(pick(ctx.home_injuries_questionable, ctx.homeInjuriesQuestionable), 0.0) ?? 0.0;
  const aQuest =
    num(pick(ctx.away_injuries_questionable, ctx.awayInjuriesQuestionable), 0.0) ?? 0.0;

  const qbLogitDelta = p.w_qb_injured * (aQbInj - hQbInj);
  const outDiff = clamp(aOutIr - hOutIr, -8.0, 8.0);
  const questDiff = clamp(aQuest - hQuest, -10.0, 10.0);
  const rosterLogitDelta = p.w_injury_out_ir * outDiff + p.w_injury_questionable * questDiff;
  const injuryLogitDelta = clamp(qbLogitDelta + rosterLogitDelta, -0.5, 0.5);

  const excessCombinedOut = Math.min(12.0, Math.max(0.0, hOutIr + aOutIr - 8.0));
  const injuryTotalDelta = clamp(
    p.qb_injury_total_pts * (hQbInj + aQbInj) - 0.15 * excessCombinedOut,
    -6.5,
    0.0,
  );

  // 4. NFLPenalties Referee & Team Discipline
  const crewNameRaw = pick(ctx.referee_crew, ctx.refereeCrew);
  const crewName = crewNameRaw ? String(crewNameRaw).trim() : "";
  const crewInfo = crewName && refereeCrews ? refereeCrews[crewName] : undefined;

  const lgFlags = p.league_flags_per_game;
  const lgBias = p.league_home_penalty_bias;

  const explicitFlags = num(pick(ctx.crew_flags_per_game, ctx.crewFlagsPerGame));
  const explicitBias = num(pick(ctx.crew_home_penalty_bias, ctx.crewHomePenaltyBias));

  let effFlags = explicitFlags ?? (crewInfo ? num(crewInfo.total_flags_per_game) : null);
  if (effFlags === null) effFlags = lgFlags;

  const hasCrewBias = explicitBias !== null || crewInfo !== undefined;
  let effHomeBias =
    explicitBias ?? (crewInfo ? num(crewInfo.home_penalty_bias, lgBias) : lgBias);
  if (effHomeBias === null) effHomeBias = lgBias;

  const rigorRatio = clamp(effFlags / lgFlags, 0.7, 1.4);
  const hPenPg = num(pick(ctx.home_penalties_per_game, ctx.homePenaltiesPerGame));
  const aPenPg = num(pick(ctx.away_penalties_per_game, ctx.awayPenaltiesPerGame));
  const penDiscDiff =
    hPenPg !== null && aPenPg !== null ? clamp(aPenPg - hPenPg, -4.5, 4.5) : 0.0;

  const disciplineLogitDelta = p.w_penalty_discipline * rigorRatio * penDiscDiff;
  const crewBiasLogitDelta = hasCrewBias ? (effHomeBias - lgBias) * p.w_crew_home_bias : 0.0;
  const refereeLogitDelta = clamp(disciplineLogitDelta + crewBiasLogitDelta, -0.18, 0.18);
  const refereeTotalDelta = hasCrewBias ? clamp(0.14 * (effFlags - lgFlags), -1.5, 1.5) : 0.0;

  const totalLogitDelta =
    epaLogitDelta + injuryLogitDelta + refereeLogitDelta + altitudeLogitDelta;
  const totalPointsDelta =
    epaTotalDelta + injuryTotalDelta + refereeTotalDelta + weatherTotalDelta;

  const drivers: NFLLiveDriver[] = [
    {
      factor: "sumersports_epa_success",
      label: "SumerSports Net EPA/play & Success % (Bayesian shrunk)",
      netValue: rawNetEpaDiff,
      impactLogit: epaLogitDelta,
      impactTotalPoints: epaTotalDelta,
    },
    {
      factor: "injuries_qb_depth",
      label: "Ourlads + Official NFL Injuries (QB1 & Out/Questionable)",
      netValue: aQbInj - hQbInj + 0.1 * outDiff,
      impactLogit: injuryLogitDelta,
      impactTotalPoints: injuryTotalDelta,
    },
    {
      factor: "referee_penalties",
      label: "NFLPenalties Team Discipline x Crew Rigor/Bias",
      netValue: penDiscDiff,
      impactLogit: refereeLogitDelta,
      impactTotalPoints: refereeTotalDelta,
    },
    {
      factor: "weather_stadium_physics",
      label: "Open-Meteo Wind/Precip & Stadium Altitude Physics",
      netValue: altDiffM > 0.0 ? altDiffM : -excessWind,
      impactLogit: altitudeLogitDelta,
      impactTotalPoints: weatherTotalDelta,
    },
  ];

  return {
    epaLogitDelta,
    injuryLogitDelta,
    refereeLogitDelta,
    altitudeLogitDelta,
    totalLogitDelta,
    weatherCompression,
    tieWeatherBoost,
    totalPointsDelta,
    isDome,
    drivers,
  };
}

export function applyMinkowskiV3LiveContext(
  basePrediction: NFLBaseThreeWay | readonly [number, number, number],
  context?: NFLLiveContextInput | null,
  config?: NFLLiveArtifactConfig | null,
): MinkowskiV3LivePrediction {
  const { priors: p } = unpackConfig(config);

  let phIn: number;
  let pdIn: number;
  let paIn: number;
  let baseTot: number | null;
  if (Array.isArray(basePrediction)) {
    phIn = Number(basePrediction[0]);
    pdIn = Number(basePrediction[1]);
    paIn = Number(basePrediction[2]);
    baseTot = p.default_expected_total_pts;
  } else {
    const obj = basePrediction as NFLBaseThreeWay;
    phIn = Number(obj.pHome);
    pdIn = Number(obj.pDraw);
    paIn = Number(obj.pAway);
    baseTot = num(obj.expectedTotal, p.default_expected_total_pts);
  }

  const ctx: NFLLiveContextInput = context ?? {};
  const ctxBaseTot = pick(ctx.base_expected_total, ctx.baseExpectedTotal);
  if (ctxBaseTot !== undefined && ctxBaseTot !== null) {
    baseTot = num(ctxBaseTot, p.default_expected_total_pts);
  }
  if (baseTot === null) baseTot = p.default_expected_total_pts;

  let ph0 = clamp(phIn, 1e-9, 1.0 - 2e-9);
  let pd0 = clamp(pdIn, 1e-6, 0.08);
  let pa0 = clamp(paIn, 1e-9, 1.0 - 2e-9);
  const s0 = ph0 + pd0 + pa0;
  ph0 /= s0;
  pd0 /= s0;
  pa0 /= s0;

  const delta = computeNflLiveContextDelta(ctx, config);

  if (
    delta.totalLogitDelta === 0.0 &&
    delta.weatherCompression === 1.0 &&
    delta.tieWeatherBoost === 0.0
  ) {
    const expectedTotalPoints = clamp(baseTot + delta.totalPointsDelta, 27.0, 66.0);
    const pAwayId = 1.0 - ph0 - pd0;
    return {
      sport: "nfl",
      modelId: MINKOWSKI_V3_MODEL_ID,
      pHome: ph0,
      pDraw: pd0,
      pAway: pAwayId,
      expectedTotalPoints,
      delta,
    };
  }

  const z0 = Math.log(ph0 / pa0);
  const z1 = delta.weatherCompression * (z0 + delta.totalLogitDelta);
  const closenessShift = clamp(-0.08 * (z1 * z1 - z0 * z0), -0.35, 0.35);
  const pDraw = clamp(pd0 * Math.exp(delta.tieWeatherBoost + closenessShift), 0.0005, 0.035);
  const rem = 1.0 - pDraw;
  const sigZ1 = 1.0 / (1.0 + Math.exp(-z1));
  const pHome = rem * sigZ1;
  const pAway = 1.0 - pHome - pDraw;
  const expectedTotalPoints = clamp(baseTot + delta.totalPointsDelta, 27.0, 66.0);

  return {
    sport: "nfl",
    modelId: MINKOWSKI_V3_MODEL_ID,
    pHome,
    pDraw,
    pAway,
    expectedTotalPoints,
    delta,
  };
}
