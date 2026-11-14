/**
 * Suite Calibrada `PitchLab Spacetime Multi-Sport v3.0` (`NHL`, `MLB`, `NBA`, `NCAAF`).
 *
 * Espejo determinista 1:1 en TypeScript puro de `research/prediction-lab/models/multisport/train_multisport.py`
 * entrenado sobre transiciones causales inter-temporada $S-1 \to S$ (`0` data leakage temporal).
 *
 * Motores:
 *  - `NHL`: `PitchLab Curvature NHL v3.0` (32 equipos; Log5/Logit regularizado sobre xG%, Corsi%, Fenwick%, HD xGF/60, Pythag 2.15 + portero SV%/GAA + lesiones + altitud).
 *  - `MLB`: `PitchLab Kepler MLB v3.0` (30 equipos; Híbrido Pythag 1.83 + FIP/(ERA-FIP) + wOBA/OPS+ + abridor + física barométrica Coors/Open-Meteo + Bill James Log5 con Pythagenpat dinámico).
 *  - `NBA`: `PitchLab Tensor NBA v3.0` (30 equipos; NetRtg, SRS, Pythag 13.91, Pace, Four Factors + HCA +2.4 + fatiga altitud Denver/Utah + lesiones, CDF Normal $\sigma = 11.8$).
 *  - `NCAAF`: `PitchLab Horizon NCAAF v3.0` (138 programas FBS; ESPN FPI, SRS, SOS Power-4 vs G5, Net YPP, Pythag 2.37 + HFA +2.8 + shock altitud WYO/AFA/BYU/COL/UTA/UNM/UTEP + clima Open-Meteo, $\sigma = 13.8$).
 */

import { clamp, logit, normalCdf, sigmoid } from "./math";

export { clamp, logit, normalCdf, sigmoid };

export type MultiSportLeague = "nhl" | "mlb" | "nba" | "ncaaf";

export const MULTISPORT_CODENAMES = {
  nhl: "PitchLab Curvature NHL v3.0",
  mlb: "PitchLab Kepler MLB v3.0",
  nba: "PitchLab Tensor NBA v3.0",
  ncaaf: "PitchLab Horizon NCAAF v3.0",
} as const;

export interface StandardizedLinearModel {
  alpha: number;
  mean: number[];
  scale: number[];
  coef: number[];
  intercept: number;
}

export interface MultiSportDriver {
  factor: string;
  label: string;
  homeValue: number;
  awayValue: number;
  impactLogit: number;
  impactUnits: number;
}

export interface NHLPrediction {
  sport: "nhl";
  modelId: typeof MULTISPORT_CODENAMES.nhl;
  homeTeam: string;
  awayTeam: string;
  pHome: number;
  pAway: number;
  pHomeReg: number;
  pOtReg: number;
  pAwayReg: number;
  expectedGoalsHome: number;
  expectedGoalsAway: number;
  expectedTotalGoals: number;
  drivers: MultiSportDriver[];
}

export interface MLBPrediction {
  sport: "mlb";
  modelId: typeof MULTISPORT_CODENAMES.mlb;
  homeTeam: string;
  awayTeam: string;
  pHome: number;
  pAway: number;
  pythagenpatExponent: number;
  parkRunMultiplier: number;
  expectedRunsHome: number;
  expectedRunsAway: number;
  expectedTotalRuns: number;
  expectedRunMargin: number;
  drivers: MultiSportDriver[];
}

export interface NBAPrediction {
  sport: "nba";
  modelId: typeof MULTISPORT_CODENAMES.nba;
  homeTeam: string;
  awayTeam: string;
  pHome: number;
  pAway: number;
  expectedPace: number;
  expectedMargin: number;
  expectedPointsHome: number;
  expectedPointsAway: number;
  expectedTotalPoints: number;
  drivers: MultiSportDriver[];
}

export interface NCAAFPrediction {
  sport: "ncaaf";
  modelId: typeof MULTISPORT_CODENAMES.ncaaf;
  homeTeam: string;
  awayTeam: string;
  homeTeamName: string;
  awayTeamName: string;
  pHome: number;
  pAway: number;
  expectedMargin: number;
  expectedPointsHome: number;
  expectedPointsAway: number;
  expectedTotalPoints: number;
  drivers: MultiSportDriver[];
}

export type MultiSportPrediction =
  | NHLPrediction
  | MLBPrediction
  | NBAPrediction
  | NCAAFPrediction;

export interface MultiSportMatchupInput {
  homeTeam?: string;
  awayTeam?: string;
  home_team?: string;
  away_team?: string;
  neutralSite?: boolean;
  neutral_site?: boolean;

  // Common stadium / weather / injuries
  isDome?: boolean | null;
  is_dome?: boolean | null;
  roofOpen?: boolean | null;
  roof_open?: boolean | null;
  stadiumElevationM?: number | null;
  stadium_elevation_m?: number | null;
  awayElevationM?: number | null;
  away_elevation_m?: number | null;
  surfacePressureHpa?: number | null;
  surface_pressure_hpa?: number | null;
  windMph?: number | null;
  wind_mph?: number | null;
  max_wind_speed_mph?: number | null;
  windBlowingOut?: boolean | null;
  wind_blowing_out?: boolean | null;
  precipitationMm?: number | null;
  precipitation_mm?: number | null;
  total_precipitation_mm?: number | null;

  homeInjuriesOut?: number | null;
  awayInjuriesOut?: number | null;
  homeInjuriesQuestionable?: number | null;
  awayInjuriesQuestionable?: number | null;
  home_injuries_out?: number | null;
  away_injuries_out?: number | null;
  home_injuries_questionable?: number | null;
  away_injuries_questionable?: number | null;

  // NHL specific
  homeGoalieSvPct?: number | null;
  awayGoalieSvPct?: number | null;
  homeGoalieGaa?: number | null;
  awayGoalieGaa?: number | null;
  homeGoalieConfirmed?: boolean | null;
  awayGoalieConfirmed?: boolean | null;
  home_goalie_sv_pct?: number | null;
  away_goalie_sv_pct?: number | null;
  home_goalie_gaa?: number | null;
  away_goalie_gaa?: number | null;
  home_goalie_confirmed?: boolean | null;
  away_goalie_confirmed?: boolean | null;
  homeXgPct?: number | null;
  awayXgPct?: number | null;
  homeCorsiPct?: number | null;
  awayCorsiPct?: number | null;
  homeFenwickPct?: number | null;
  awayFenwickPct?: number | null;
  homeHighDangerXgFor?: number | null;
  awayHighDangerXgFor?: number | null;
  homePythag215?: number | null;
  awayPythag215?: number | null;
  homeGamesPlayed?: number | null;
  awayGamesPlayed?: number | null;
  home_xg_pct?: number | null;
  away_xg_pct?: number | null;
  home_corsi_pct?: number | null;
  away_corsi_pct?: number | null;
  home_fenwick_pct?: number | null;
  away_fenwick_pct?: number | null;
  home_high_danger_xg_for?: number | null;
  away_high_danger_xg_for?: number | null;
  home_pythag_215?: number | null;
  away_pythag_215?: number | null;
  home_games_played?: number | null;
  away_games_played?: number | null;

  // MLB specific
  homeStarterFip?: number | null;
  awayStarterFip?: number | null;
  homeStarterEra?: number | null;
  awayStarterEra?: number | null;
  homeStarterConfirmed?: boolean | null;
  awayStarterConfirmed?: boolean | null;
  home_starter_fip?: number | null;
  away_starter_fip?: number | null;
  home_starter_era?: number | null;
  away_starter_era?: number | null;
  home_starter_confirmed?: boolean | null;
  away_starter_confirmed?: boolean | null;

  // NBA specific
  homePace?: number | null;
  awayPace?: number | null;
  home_pace?: number | null;
  away_pace?: number | null;

  // NCAAF specific
  homeQbInjured?: number | null;
  awayQbInjured?: number | null;
  home_qb_injured?: number | null;
  away_qb_injured?: number | null;
}

export interface SportEngineConfig {
  sport: MultiSportLeague;
  codename: string;
  version: string;
  feature_order?: string[];
  off_feature_order?: string[];
  def_feature_order?: string[];
  win_feature_order?: string[];
  strength_model?: StandardizedLinearModel;
  gf_model?: StandardizedLinearModel;
  ga_model?: StandardizedLinearModel;
  rs_model?: StandardizedLinearModel;
  ra_model?: StandardizedLinearModel;
  win_model?: StandardizedLinearModel;
  rating_model?: StandardizedLinearModel;
  srs_model?: StandardizedLinearModel;
  priors: Record<string, number>;
  teams: Record<string, Record<string, unknown>>;
  aliases: Record<string, string>;
}

export interface MultiSportModelArtifact {
  schema_version: string;
  suite_codename: string;
  version: string;
  created_at: string;
  seed: number;
  anti_leakage_contract: string;
  sports: {
    nhl: SportEngineConfig;
    mlb: SportEngineConfig;
    nba: SportEngineConfig;
    ncaaf: SportEngineConfig;
  };
}

// ============================================================================
// Primitivas matemáticas exactas IEEE-754 (centralizadas en `./math.js`)
// ============================================================================

export function logistic(z: number): number {
  return sigmoid(clamp(z, -35.0, 35.0));
}

export function logitFn(p: number): number {
  return logit(p, 1e-6);
}

export function safePow(base: number, expVal: number): number {
  const b = Math.max(base, 1e-9);
  return Math.exp(expVal * Math.log(b));
}

export function log5(pa: number, pb: number): number {
  const x = clamp(pa, 0.001, 0.999);
  const y = clamp(pb, 0.001, 0.999);
  const denom = x + y - 2.0 * x * y;
  if (denom <= 1e-12) return 0.5;
  return (x - x * y) / denom;
}

function slug(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function num(val: unknown, fallback: number | null = null): number | null {
  if (val === null || val === undefined || typeof val === "boolean") return fallback;
  const f = Number(val);
  return Number.isFinite(f) ? f : fallback;
}

function pick<T>(...vals: Array<T | undefined>): T | undefined {
  for (const v of vals) {
    if (v !== undefined) return v;
  }
  return undefined;
}

function predictLinear(spec: StandardizedLinearModel, xVec: readonly number[]): number {
  let acc = Number(spec.intercept);
  for (let i = 0; i < spec.coef.length; i++) {
    acc +=
      Number(spec.coef[i]!) *
      ((Number(xVec[i]!) - Number(spec.mean[i]!)) / Number(spec.scale[i]!));
  }
  return acc;
}

function resolveTeamEntry(
  cfg: SportEngineConfig,
  teamIdOrName: string,
): Record<string, unknown> {
  const teams = cfg.teams;
  const aliases = cfg.aliases ?? {};
  const raw = String(teamIdOrName ?? "").trim();
  if (raw in teams) return { ...teams[raw]! };
  const up = raw.toUpperCase();
  if (up in teams) return { ...teams[up]! };
  const sl = slug(raw);
  if (sl in teams) return { ...teams[sl]! };
  const mapped = aliases[sl];
  if (mapped && mapped in teams) return { ...teams[mapped]! };
  throw new Error(`Unknown ${cfg.sport} team: ${teamIdOrName}`);
}

export function assertValidMultiSportModel(
  artifact: unknown,
): asserts artifact is MultiSportModelArtifact {
  if (!artifact || typeof artifact !== "object") {
    throw new Error("Invalid MultiSportModelArtifact: expected object");
  }
  const obj = artifact as Partial<MultiSportModelArtifact>;
  if (obj.version !== "3.0.0" || !obj.sports) {
    throw new Error("Invalid MultiSportModelArtifact: missing version 3.0.0 or sports map");
  }
  for (const lg of ["nhl", "mlb", "nba", "ncaaf"] as const) {
    const s = obj.sports[lg];
    if (!s || s.sport !== lg || !s.teams || Object.keys(s.teams).length === 0) {
      throw new Error(`Invalid MultiSportModelArtifact: missing or empty sport engine '${lg}'`);
    }
  }
}

// ============================================================================
// 1. NHL — PitchLab Curvature NHL v3.0
// ============================================================================

export function predictNHL(
  matchup: MultiSportMatchupInput,
  artifact: MultiSportModelArtifact | SportEngineConfig,
): NHLPrediction {
  const cfg = "sports" in artifact ? artifact.sports.nhl : artifact;
  const p = cfg.priors;
  const h = resolveTeamEntry(cfg, String(pick(matchup.homeTeam, matchup.home_team) ?? ""));
  const a = resolveTeamEntry(cfg, String(pick(matchup.awayTeam, matchup.away_team) ?? ""));
  const neutralSite = Boolean(pick(matchup.neutralSite, matchup.neutral_site) ?? false);

  const sideOverrides = [
    {
      entry: h,
      xgPct: num(pick(matchup.homeXgPct, matchup.home_xg_pct)),
      corsi: num(pick(matchup.homeCorsiPct, matchup.home_corsi_pct)),
      fenwick: num(pick(matchup.homeFenwickPct, matchup.home_fenwick_pct)),
      hd: num(pick(matchup.homeHighDangerXgFor, matchup.home_high_danger_xg_for)),
      pyth: num(pick(matchup.homePythag215, matchup.home_pythag_215)),
      gp: num(pick(matchup.homeGamesPlayed, matchup.home_games_played), 82.0) ?? 82.0,
    },
    {
      entry: a,
      xgPct: num(pick(matchup.awayXgPct, matchup.away_xg_pct)),
      corsi: num(pick(matchup.awayCorsiPct, matchup.away_corsi_pct)),
      fenwick: num(pick(matchup.awayFenwickPct, matchup.away_fenwick_pct)),
      hd: num(pick(matchup.awayHighDangerXgFor, matchup.away_high_danger_xg_for)),
      pyth: num(pick(matchup.awayPythag215, matchup.away_pythag_215)),
      gp: num(pick(matchup.awayGamesPlayed, matchup.away_games_played), 82.0) ?? 82.0,
    },
  ];

  for (const ov of sideOverrides) {
    if (
      ov.xgPct !== null ||
      ov.corsi !== null ||
      ov.fenwick !== null ||
      ov.hd !== null ||
      ov.pyth !== null
    ) {
      if (ov.xgPct !== null) ov.entry.xg_pct = ov.xgPct <= 1.5 ? ov.xgPct * 100.0 : ov.xgPct;
      if (ov.corsi !== null) ov.entry.corsi_pct = ov.corsi <= 1.5 ? ov.corsi * 100.0 : ov.corsi;
      if (ov.fenwick !== null)
        ov.entry.fenwick_pct = ov.fenwick <= 1.5 ? ov.fenwick * 100.0 : ov.fenwick;
      if (ov.hd !== null) ov.entry.hd_xgf_pg = ov.hd > 10.0 ? ov.hd / ov.gp : ov.hd;
      if (ov.pyth !== null) ov.entry.pythag_215 = ov.pyth > 1.5 ? ov.pyth / 100.0 : ov.pyth;

      const fVec = cfg.feature_order!.map((c) => Number(ov.entry[c]));
      ov.entry.strength_prob = logistic(predictLinear(cfg.strength_model!, fVec));
      ov.entry.proj_gf_pg = clamp(
        predictLinear(
          cfg.gf_model!,
          cfg.off_feature_order!.map((c) => Number(ov.entry[c])),
        ),
        2.15,
        4.15,
      );
      ov.entry.proj_ga_pg = clamp(
        predictLinear(
          cfg.ga_model!,
          cfg.def_feature_order!.map((c) => Number(ov.entry[c])),
        ),
        2.15,
        4.15,
      );
    }
  }

  const strengthH = Number(h.strength_prob);
  const strengthA = Number(a.strength_prob);
  const pNeutral = log5(strengthH, strengthA);
  const structuralLogit = logitFn(pNeutral);

  const computeGoalieGsaa = (
    svRaw: number | null,
    gaaRaw: number | null,
    confRaw: boolean | null | undefined,
    entry: Record<string, unknown>,
  ): number => {
    const defSv = Number(entry.default_goalie_sv_pct ?? p.league_sv_pct!);
    let svVal = svRaw ?? defSv;
    if (svVal > 1.5) svVal /= 100.0;
    const isConf =
      confRaw === null || confRaw === undefined
        ? Boolean(entry.default_goalie_confirmed ?? false)
        : Boolean(confRaw);
    const confW = isConf ? p.goalie_confirmed_weight! : p.goalie_projected_weight!;
    const gsaaSv =
      clamp(svVal - p.league_sv_pct!, -0.035, 0.03) * p.shots_per_game! * p.goalie_sv_shrink!;
    let rawGsaa: number;
    if (gaaRaw !== null) {
      const gsaaGaa = clamp(p.league_gaa! - gaaRaw, -1.2, 1.2) * 0.4;
      rawGsaa = 0.7 * gsaaSv + 0.3 * gsaaGaa;
    } else {
      rawGsaa = gsaaSv;
    }
    return confW * rawGsaa;
  };

  const gsaaH = computeGoalieGsaa(
    num(pick(matchup.homeGoalieSvPct, matchup.home_goalie_sv_pct)),
    num(pick(matchup.homeGoalieGaa, matchup.home_goalie_gaa)),
    pick(matchup.homeGoalieConfirmed, matchup.home_goalie_confirmed),
    h,
  );
  const gsaaA = computeGoalieGsaa(
    num(pick(matchup.awayGoalieSvPct, matchup.away_goalie_sv_pct)),
    num(pick(matchup.awayGoalieGaa, matchup.away_goalie_gaa)),
    pick(matchup.awayGoalieConfirmed, matchup.away_goalie_confirmed),
    a,
  );
  const goalieLogitDelta = p.goalie_logit_per_goal! * (gsaaH - gsaaA);

  const hOut =
    num(pick(matchup.homeInjuriesOut, matchup.home_injuries_out), Number(h.active_injuries_out)) ??
    0.0;
  const aOut =
    num(pick(matchup.awayInjuriesOut, matchup.away_injuries_out), Number(a.active_injuries_out)) ??
    0.0;
  const hQ =
    num(
      pick(matchup.homeInjuriesQuestionable, matchup.home_injuries_questionable),
      Number(h.active_injuries_questionable),
    ) ?? 0.0;
  const aQ =
    num(
      pick(matchup.awayInjuriesQuestionable, matchup.away_injuries_questionable),
      Number(a.active_injuries_questionable),
    ) ?? 0.0;

  const penH = Math.min(
    p.injury_max_goal_pen!,
    p.injury_out_goal_pen! * hOut + p.injury_quest_goal_pen! * hQ,
  );
  const penA = Math.min(
    p.injury_max_goal_pen!,
    p.injury_out_goal_pen! * aOut + p.injury_quest_goal_pen! * aQ,
  );
  const injuryLogitDelta = p.injury_logit_per_goal! * (penA - penH);

  const hElev =
    num(
      pick(matchup.stadiumElevationM, matchup.stadium_elevation_m),
      Number(h.stadium_elevation_m),
    ) ?? 120.0;
  const aElev =
    num(pick(matchup.awayElevationM, matchup.away_elevation_m), Number(a.stadium_elevation_m)) ??
    120.0;
  const altDiff = Math.max(0.0, hElev - aElev);

  let hfaLogit = 0.0;
  let altLogit = 0.0;
  let hGoalHfa = 0.0;
  let aGoalHfa = 0.0;
  let altGoals = 0.0;
  if (!neutralSite) {
    hfaLogit = p.home_ice_logit!;
    hGoalHfa = p.home_goal_boost!;
    aGoalHfa = p.away_goal_Drag!;
    if (hElev >= p.altitude_threshold_m! && altDiff >= p.altitude_diff_min_m!) {
      altLogit = clamp(p.w_altitude_logit! * (altDiff / 1500.0), 0.0, 0.08);
      altGoals = clamp(p.w_altitude_goals! * (altDiff / 1500.0), 0.0, 0.1);
    }
  }

  const lgGoals = p.league_goals_per_team!;
  const rawGfH =
    (Number(h.proj_gf_pg) * Number(a.proj_ga_pg)) / lgGoals +
    hGoalHfa +
    altGoals -
    gsaaA -
    0.65 * penH +
    0.35 * penA;
  const rawGfA =
    (Number(a.proj_gf_pg) * Number(h.proj_ga_pg)) / lgGoals +
    aGoalHfa -
    gsaaH -
    0.65 * penA +
    0.35 * penH;

  const expectedGoalsHome = clamp(rawGfH, 1.5, 5.2);
  const expectedGoalsAway = clamp(rawGfA, 1.5, 5.2);
  const expectedTotalGoals = expectedGoalsHome + expectedGoalsAway;

  const logit2Way = structuralLogit + hfaLogit + altLogit + goalieLogitDelta + injuryLogitDelta;
  const pHome = clamp(logistic(logit2Way), 1e-6, 1.0 - 1e-6);
  const pAway = 1.0 - pHome;

  const pOtReg = clamp(
    p.ot_base_rate! *
      Math.exp(-p.ot_logit_decay! * logit2Way * logit2Way) *
      Math.exp(-p.ot_total_goals_decay! * (expectedTotalGoals - p.ot_total_goals_anchor!)),
    0.1,
    0.3,
  );
  const otHomeShare = clamp(0.5 + p.ot_home_edge_share! * (pHome - 0.5), 0.35, 0.65);
  const pHomeReg = clamp(pHome - pOtReg * otHomeShare, 0.01, 1.0 - pOtReg - 0.01);
  const pAwayReg = 1.0 - pHomeReg - pOtReg;

  const drivers: MultiSportDriver[] = [
    {
      factor: "even_strength_xg_possession",
      label: "5v5 xG%, Corsi%, Fenwick%, High-Danger xG/60 & Pythag 2.15",
      homeValue: Number(h.xg_pct),
      awayValue: Number(a.xg_pct),
      impactLogit: structuralLogit,
      impactUnits: Number(h.proj_gf_pg) - Number(a.proj_gf_pg),
    },
    {
      factor: "starting_goalie_matchup",
      label: "Starting Goalie SV% / GAA vs .905 NHL Baseline",
      homeValue: gsaaH,
      awayValue: gsaaA,
      impactLogit: goalieLogitDelta,
      impactUnits: gsaaH - gsaaA,
    },
    {
      factor: "skater_injuries",
      label: "Active Roster Absences (Out/IR & Day-to-Day)",
      homeValue: -penH,
      awayValue: -penA,
      impactLogit: injuryLogitDelta,
      impactUnits: penA - penH,
    },
    {
      factor: "home_ice_and_altitude",
      label: "Home Ice Advantage (~54.5%) & High-Altitude Shock",
      homeValue: hElev,
      awayValue: aElev,
      impactLogit: hfaLogit + altLogit,
      impactUnits: hGoalHfa - aGoalHfa + altGoals,
    },
  ];

  return {
    sport: "nhl",
    modelId: MULTISPORT_CODENAMES.nhl,
    homeTeam: String(h.team_abbr),
    awayTeam: String(a.team_abbr),
    pHome,
    pAway,
    pHomeReg,
    pOtReg,
    pAwayReg,
    expectedGoalsHome,
    expectedGoalsAway,
    expectedTotalGoals,
    drivers,
  };
}

// ============================================================================
// 2. MLB — PitchLab Kepler MLB v3.0
// ============================================================================

export function predictMLB(
  matchup: MultiSportMatchupInput,
  artifact: MultiSportModelArtifact | SportEngineConfig,
): MLBPrediction {
  const cfg = "sports" in artifact ? artifact.sports.mlb : artifact;
  const p = cfg.priors;
  const h = resolveTeamEntry(cfg, String(pick(matchup.homeTeam, matchup.home_team) ?? ""));
  const a = resolveTeamEntry(cfg, String(pick(matchup.awayTeam, matchup.away_team) ?? ""));
  const neutralSite = Boolean(pick(matchup.neutralSite, matchup.neutral_site) ?? false);

  const starterRunDelta = (
    spFip: number | null,
    spEra: number | null,
    confRaw: boolean | null | undefined,
    entry: Record<string, unknown>,
  ): number => {
    if (spFip === null && spEra === null) return 0.0;
    let effSp: number;
    if (spFip !== null && spEra !== null) effSp = 0.65 * spFip + 0.35 * spEra;
    else if (spFip !== null) effSp = spFip;
    else effSp = Number(spEra);
    const confW =
      confRaw === null || confRaw === undefined || Boolean(confRaw)
        ? p.starter_confirmed_weight!
        : p.starter_projected_weight!;
    const baseRot = Number(entry.rotation_baseline_era ?? p.league_fip!);
    return clamp(p.starter_innings_weight! * confW * (effSp - baseRot), -1.15, 1.15);
  };

  const spDeltaH = starterRunDelta(
    num(pick(matchup.homeStarterFip, matchup.home_starter_fip)),
    num(pick(matchup.homeStarterEra, matchup.home_starter_era)),
    pick(matchup.homeStarterConfirmed, matchup.home_starter_confirmed),
    h,
  );
  const spDeltaA = starterRunDelta(
    num(pick(matchup.awayStarterFip, matchup.away_starter_fip)),
    num(pick(matchup.awayStarterEra, matchup.away_starter_era)),
    pick(matchup.awayStarterConfirmed, matchup.away_starter_confirmed),
    a,
  );

  const hOut = Math.min(
    8.0,
    num(pick(matchup.homeInjuriesOut, matchup.home_injuries_out), Number(h.active_injuries_out)) ??
      0.0,
  );
  const aOut = Math.min(
    8.0,
    num(pick(matchup.awayInjuriesOut, matchup.away_injuries_out), Number(a.active_injuries_out)) ??
      0.0,
  );
  const hQ =
    num(
      pick(matchup.homeInjuriesQuestionable, matchup.home_injuries_questionable),
      Number(h.active_injuries_questionable),
    ) ?? 0.0;
  const aQ =
    num(
      pick(matchup.awayInjuriesQuestionable, matchup.away_injuries_questionable),
      Number(a.active_injuries_questionable),
    ) ?? 0.0;

  const injH = Math.min(
    p.injury_max_run_pen!,
    p.injury_out_run_pen! * hOut + p.injury_quest_run_pen! * hQ,
  );
  const injA = Math.min(
    p.injury_max_run_pen!,
    p.injury_out_run_pen! * aOut + p.injury_quest_run_pen! * aQ,
  );

  const explicitDome = pick(matchup.isDome, matchup.is_dome);
  const roofOpen = pick(matchup.roofOpen, matchup.roof_open);
  let isDome: boolean;
  if (typeof explicitDome === "boolean") isDome = explicitDome;
  else if (typeof roofOpen === "boolean") isDome = !roofOpen;
  else isDome = Boolean(h.is_dome);

  const explicitElev = pick(matchup.stadiumElevationM, matchup.stadium_elevation_m);
  const hElev = num(explicitElev, Number(h.stadium_elevation_m)) ?? 100.0;
  const aElev =
    num(pick(matchup.awayElevationM, matchup.away_elevation_m), Number(a.stadium_elevation_m)) ??
    100.0;
  const defaultPres =
    explicitElev !== undefined && explicitElev !== null
      ? 1013.25 * Math.exp(-hElev / 8434.5)
      : Number(h.structural_pressure_hpa);
  const presHpa =
    num(pick(matchup.surfacePressureHpa, matchup.surface_pressure_hpa), defaultPres) ?? 1001.0;

  let parkMult = 1.0;
  let weatherMult = 1.0;
  if (!isDome) {
    const lowPDelta = Math.max(0.0, p.pressure_anchor_hpa! - presHpa);
    parkMult = clamp(1.0 + p.barometric_run_slope_per_hpa! * lowPDelta, 0.96, 1.24);
    const windMph =
      num(pick(matchup.windMph, matchup.wind_mph, matchup.max_wind_speed_mph), 0.0) ?? 0.0;
    const precipMm =
      num(pick(matchup.precipitationMm, matchup.precipitation_mm), 0.0) ?? 0.0;
    const windOut = Boolean(pick(matchup.windBlowingOut, matchup.wind_blowing_out) ?? false);
    let wAdj = 0.0;
    if (windMph > p.wind_threshold_mph!) {
      const slope = windOut ? p.wind_out_slope_per_mph! : p.wind_cross_in_slope_per_mph!;
      wAdj = slope * Math.min(20.0, windMph - p.wind_threshold_mph!);
    }
    const pAdj =
      precipMm > p.precip_threshold_mm!
        ? p.precip_run_slope_per_mm! * Math.min(12.0, precipMm - p.precip_threshold_mm!)
        : 0.0;
    weatherMult = clamp(1.0 + wAdj + pAdj, 0.88, 1.12);
  }

  const envMult = parkMult * weatherMult;
  const lgRuns = p.league_runs_per_team!;
  const hSplit = neutralSite ? 0.0 : p.home_run_split_boost!;
  const aSplit = neutralSite ? 0.0 : p.away_run_split_drag!;

  const effRsH = clamp(Number(h.proj_rs_pg) - 0.65 * injH, 2.5, 6.8);
  const effRaH = clamp(Number(h.proj_ra_pg) + spDeltaH + 0.35 * injH, 2.3, 6.8);
  const effRsA = clamp(Number(a.proj_rs_pg) - 0.65 * injA, 2.5, 6.8);
  const effRaA = clamp(Number(a.proj_ra_pg) + spDeltaA + 0.35 * injA, 2.3, 6.8);

  const rawRunsH = ((effRsH * effRaA) / lgRuns + hSplit) * envMult;
  const rawRunsA = ((effRsA * effRaH) / lgRuns + aSplit) * envMult;

  const expectedRunsHome = clamp(rawRunsH, 1.6, 9.8);
  const expectedRunsAway = clamp(rawRunsA, 1.6, 9.8);
  const expectedTotalRuns = expectedRunsHome + expectedRunsAway;
  const expectedRunMargin = expectedRunsHome - expectedRunsAway;

  const pythagenpatExponent = clamp(safePow(expectedTotalRuns, p.pythagenpat_power!), 1.65, 2.15);
  const pyHEff =
    safePow(effRsH, pythagenpatExponent) /
    (safePow(effRsH, pythagenpatExponent) + safePow(effRaH, pythagenpatExponent));
  const pyAEff =
    safePow(effRsA, pythagenpatExponent) /
    (safePow(effRsA, pythagenpatExponent) + safePow(effRaA, pythagenpatExponent));

  const sHome = 0.65 * pyHEff + 0.35 * Number(h.talent_win_pct);
  const sAway = 0.65 * pyAEff + 0.35 * Number(a.talent_win_pct);
  const pNeutral = log5(sHome, sAway);

  let hfaProb = 0.5;
  if (!neutralSite) {
    const coorsBoost =
      hElev >= 1500.0 && hElev - aElev >= 800.0 ? p.coors_acclimation_prob_boost! : 0.0;
    hfaProb = p.home_field_prob! + coorsBoost;
  }

  const pHome = clamp(log5(pNeutral, hfaProb), 1e-6, 1.0 - 1e-6);
  const pAway = 1.0 - pHome;

  const baseTalentLog5 = log5(Number(h.talent_win_pct), Number(a.talent_win_pct));
  const drivers: MultiSportDriver[] = [
    {
      factor: "fip_woba_pythag_structure",
      label: "Pythagorean 1.83 + FIP / (ERA-FIP) Regression + wOBA / OPS+",
      homeValue: Number(h.talent_win_pct),
      awayValue: Number(a.talent_win_pct),
      impactLogit: logitFn(baseTalentLog5),
      impactUnits:
        Number(h.proj_rs_pg) - Number(h.proj_ra_pg) - (Number(a.proj_rs_pg) - Number(a.proj_ra_pg)),
    },
    {
      factor: "starting_pitcher_matchup",
      label: "Confirmed/Projected Starting Pitcher FIP & ERA vs Rotation",
      homeValue: -spDeltaH,
      awayValue: -spDeltaA,
      impactLogit: logitFn(pNeutral) - logitFn(baseTalentLog5),
      impactUnits: spDeltaA - spDeltaH,
    },
    {
      factor: "park_barometric_and_weather",
      label: `Ballpark Barometric Physics (${presHpa.toFixed(1)} hPa) & Open-Meteo`,
      homeValue: envMult,
      awayValue: pythagenpatExponent,
      impactLogit: logitFn(pHome) - logitFn(pNeutral),
      impactUnits: (envMult - 1.0) * (expectedTotalRuns / Math.max(envMult, 0.5)),
    },
    {
      factor: "roster_injuries",
      label: "Active Lineup & Bullpen Injuries",
      homeValue: -injH,
      awayValue: -injA,
      impactLogit: 0.18 * (injA - injH),
      impactUnits: injA - injH,
    },
  ];

  return {
    sport: "mlb",
    modelId: MULTISPORT_CODENAMES.mlb,
    homeTeam: String(h.team_abbr),
    awayTeam: String(a.team_abbr),
    pHome,
    pAway,
    pythagenpatExponent,
    parkRunMultiplier: envMult,
    expectedRunsHome,
    expectedRunsAway,
    expectedTotalRuns,
    expectedRunMargin,
    drivers,
  };
}

// ============================================================================
// 3. NBA — PitchLab Tensor NBA v3.0
// ============================================================================

export function predictNBA(
  matchup: MultiSportMatchupInput,
  artifact: MultiSportModelArtifact | SportEngineConfig,
): NBAPrediction {
  const cfg = "sports" in artifact ? artifact.sports.nba : artifact;
  const p = cfg.priors;
  const h = resolveTeamEntry(cfg, String(pick(matchup.homeTeam, matchup.home_team) ?? ""));
  const a = resolveTeamEntry(cfg, String(pick(matchup.awayTeam, matchup.away_team) ?? ""));
  const neutralSite = Boolean(pick(matchup.neutralSite, matchup.neutral_site) ?? false);

  const hPace =
    num(pick(matchup.homePace, matchup.home_pace), Number(h.pace)) ?? p.league_pace!;
  const aPace =
    num(pick(matchup.awayPace, matchup.away_pace), Number(a.pace)) ?? p.league_pace!;
  const expectedPace = clamp(
    p.pace_shrink! * (0.5 * (hPace + aPace)) + (1.0 - p.pace_shrink!) * p.league_pace!,
    92.0,
    106.5,
  );
  const paceScale = expectedPace / 100.0;

  const rtgH = Number(h.power_rating_pts);
  const rtgA = Number(a.power_rating_pts);
  const structuralMargin = paceScale * (rtgH - rtgA);

  const hElev =
    num(
      pick(matchup.stadiumElevationM, matchup.stadium_elevation_m),
      Number(h.stadium_elevation_m),
    ) ?? 150.0;
  const aElev =
    num(pick(matchup.awayElevationM, matchup.away_elevation_m), Number(a.stadium_elevation_m)) ??
    150.0;
  const altDiff = Math.max(0.0, hElev - aElev);

  let hcaPts = 0.0;
  let altPts = 0.0;
  if (!neutralSite) {
    hcaPts = p.home_court_pts!;
    if (hElev >= p.altitude_threshold_m! && altDiff >= p.altitude_diff_min_m!) {
      altPts = clamp(p.w_altitude_pts! * (altDiff / p.denver_altitude_anchor_m!), 0.0, 2.1);
    }
  }

  const hOut =
    num(pick(matchup.homeInjuriesOut, matchup.home_injuries_out), Number(h.active_injuries_out)) ??
    0.0;
  const aOut =
    num(pick(matchup.awayInjuriesOut, matchup.away_injuries_out), Number(a.active_injuries_out)) ??
    0.0;
  const hQ =
    num(
      pick(matchup.homeInjuriesQuestionable, matchup.home_injuries_questionable),
      Number(h.active_injuries_questionable),
    ) ?? 0.0;
  const aQ =
    num(
      pick(matchup.awayInjuriesQuestionable, matchup.away_injuries_questionable),
      Number(a.active_injuries_questionable),
    ) ?? 0.0;

  const injuryMargin = clamp(
    p.injury_out_pts_pen! * (aOut - hOut) + p.injury_doubtful_pts_pen! * (aQ - hQ),
    -p.injury_max_margin_pts!,
    p.injury_max_margin_pts!,
  );

  const expectedMargin = structuralMargin + hcaPts + altPts + injuryMargin;
  const baseTotal =
    expectedPace *
      ((Number(h.ortg) + Number(a.drtg) + Number(a.ortg) + Number(h.drtg)) / 200.0) -
    p.injury_total_pts_drag! * Math.min(10.0, hOut + aOut);
  const expectedTotalPoints = clamp(baseTotal, 198.0, 254.0);
  const expectedPointsHome = 0.5 * (expectedTotalPoints + expectedMargin);
  const expectedPointsAway = expectedTotalPoints - expectedPointsHome;

  const sigma = p.sigma_margin!;
  const pHome = clamp(normalCdf(expectedMargin / sigma), 1e-6, 1.0 - 1e-6);
  const pAway = 1.0 - pHome;

  const drivers: MultiSportDriver[] = [
    {
      factor: "net_rtg_srs_four_factors",
      label:
        "Net Rating, SRS, Pythag 13.91, Pace & Four Factors (eFG%, TOV%, ORB%, FT/FGA)",
      homeValue: rtgH,
      awayValue: rtgA,
      impactLogit: structuralMargin / sigma,
      impactUnits: structuralMargin,
    },
    {
      factor: "nba_hca_and_altitude",
      label: "NBA Home Court (+2.4 pts) & Altitude Fatigue (Denver/Utah)",
      homeValue: hElev,
      awayValue: aElev,
      impactLogit: (hcaPts + altPts) / sigma,
      impactUnits: hcaPts + altPts,
    },
    {
      factor: "rotation_injuries",
      label: "Confirmed Rotation Absences (Out & Doubtful/GTD)",
      homeValue: -hOut,
      awayValue: -aOut,
      impactLogit: injuryMargin / sigma,
      impactUnits: injuryMargin,
    },
  ];

  return {
    sport: "nba",
    modelId: MULTISPORT_CODENAMES.nba,
    homeTeam: String(h.team_abbr),
    awayTeam: String(a.team_abbr),
    pHome,
    pAway,
    expectedPace,
    expectedMargin,
    expectedPointsHome,
    expectedPointsAway,
    expectedTotalPoints,
    drivers,
  };
}

// ============================================================================
// 4. NCAAF — PitchLab Horizon NCAAF v3.0
// ============================================================================

export function predictNCAAF(
  matchup: MultiSportMatchupInput,
  artifact: MultiSportModelArtifact | SportEngineConfig,
): NCAAFPrediction {
  const cfg = "sports" in artifact ? artifact.sports.ncaaf : artifact;
  const p = cfg.priors;
  const h = resolveTeamEntry(cfg, String(pick(matchup.homeTeam, matchup.home_team) ?? ""));
  const a = resolveTeamEntry(cfg, String(pick(matchup.awayTeam, matchup.away_team) ?? ""));
  const neutralSite = Boolean(pick(matchup.neutralSite, matchup.neutral_site) ?? false);

  const rtgH = Number(h.power_rating_pts);
  const rtgA = Number(a.power_rating_pts);
  const structuralMargin = rtgH - rtgA;

  const explicitDome = pick(matchup.isDome, matchup.is_dome);
  const isDome = typeof explicitDome === "boolean" ? explicitDome : Boolean(h.is_dome);

  const hElev =
    num(
      pick(matchup.stadiumElevationM, matchup.stadium_elevation_m),
      Number(h.stadium_elevation_m),
    ) ?? 180.0;
  const aElev =
    num(pick(matchup.awayElevationM, matchup.away_elevation_m), Number(a.stadium_elevation_m)) ??
    180.0;
  const altDiff = Math.max(0.0, hElev - aElev);

  let hfaPts = 0.0;
  let altPts = 0.0;
  if (!neutralSite) {
    hfaPts = p.home_field_pts!;
    if (hElev >= p.altitude_threshold_m! && altDiff >= p.altitude_diff_min_m!) {
      const domeMult = isDome ? p.dome_altitude_mult! : 1.0;
      altPts = clamp(
        domeMult * p.w_altitude_outdoor_pts! * (altDiff / p.altitude_anchor_m!),
        0.0,
        3.1,
      );
    }
  }

  const hQb =
    num(pick(matchup.homeQbInjured, matchup.home_qb_injured), Number(h.active_qb_injured)) ?? 0.0;
  const aQb =
    num(pick(matchup.awayQbInjured, matchup.away_qb_injured), Number(a.active_qb_injured)) ?? 0.0;
  const hOut =
    num(pick(matchup.homeInjuriesOut, matchup.home_injuries_out), Number(h.active_injuries_out)) ??
    0.0;
  const aOut =
    num(pick(matchup.awayInjuriesOut, matchup.away_injuries_out), Number(a.active_injuries_out)) ??
    0.0;
  const hQ =
    num(
      pick(matchup.homeInjuriesQuestionable, matchup.home_injuries_questionable),
      Number(h.active_injuries_questionable),
    ) ?? 0.0;
  const aQ =
    num(
      pick(matchup.awayInjuriesQuestionable, matchup.away_injuries_questionable),
      Number(a.active_injuries_questionable),
    ) ?? 0.0;

  const injuryMargin = clamp(
    p.qb_injured_pts_pen! * (aQb - hQb) +
      p.injury_out_pts_pen! * clamp(aOut - hOut, -12.0, 12.0) +
      p.injury_quest_pts_pen! * clamp(aQ - hQ, -12.0, 12.0),
    -p.injury_max_margin_pts!,
    p.injury_max_margin_pts!,
  );

  const windMph =
    num(pick(matchup.windMph, matchup.wind_mph, matchup.max_wind_speed_mph), 0.0) ?? 0.0;
  const precipMm =
    num(
      pick(matchup.precipitationMm, matchup.precipitation_mm, matchup.total_precipitation_mm),
      0.0,
    ) ?? 0.0;

  const excessWind = isDome ? 0.0 : clamp(windMph - p.wind_threshold_mph!, 0.0, 30.0);
  const excessPrecip = isDome ? 0.0 : clamp(precipMm - p.precip_threshold_mm!, 0.0, 25.0);

  const weatherTotalSuppression = clamp(
    p.wind_total_pts_per_mph! * excessWind + p.precip_total_pts_per_mm! * excessPrecip,
    -9.0,
    0.0,
  );
  const weatherDamping =
    1.0 -
    Math.min(
      p.weather_max_damping!,
      p.weather_margin_damping_wind! * excessWind + p.weather_margin_damping_precip! * excessPrecip,
    );

  const expMarginRaw = weatherDamping * (structuralMargin + hfaPts + altPts + injuryMargin);

  const yppSumDelta =
    Number(h.off_ypp) - Number(a.def_ypp) + (Number(a.off_ypp) - Number(h.def_ypp));
  const rawTotal =
    0.5 * (Number(h.ppg) + Number(a.oppg) + Number(a.ppg) + Number(h.oppg)) +
    p.ypp_total_pts_scale! * yppSumDelta +
    weatherTotalSuppression -
    2.2 * (hQb + aQb);
  const clampedTotal = clamp(rawTotal, 31.0, 82.0);
  const expectedPointsHome = Math.max(3.0, 0.5 * (clampedTotal + expMarginRaw));
  const expectedPointsAway = Math.max(3.0, clampedTotal - expectedPointsHome);
  const expectedTotalPoints = expectedPointsHome + expectedPointsAway;
  const expectedMargin = expectedPointsHome - expectedPointsAway;

  const sigma = p.sigma_margin!;
  const pHome = clamp(normalCdf(expectedMargin / sigma), 1e-6, 1.0 - 1e-6);
  const pAway = 1.0 - pHome;

  const drivers: MultiSportDriver[] = [
    {
      factor: "fpi_srs_sos_ypp_power",
      label: "ESPN FPI, SRS, Power-4 vs G5 SOS, Net YPP & Pythag 2.37",
      homeValue: rtgH,
      awayValue: rtgA,
      impactLogit: structuralMargin / sigma,
      impactUnits: structuralMargin,
    },
    {
      factor: "cfb_hfa_and_altitude_shock",
      label: "College HFA (+2.8 pts) & High-Altitude Shock (WYO/AFA/BYU/COL/UTA/UNM/UTEP)",
      homeValue: hElev,
      awayValue: aElev,
      impactLogit: (hfaPts + altPts) / sigma,
      impactUnits: hfaPts + altPts,
    },
    {
      factor: "open_meteo_wind_precip",
      label: "Open-Meteo Wind & Rain Suppression (Outdoor Stadiums)",
      homeValue: windMph,
      awayValue: precipMm,
      impactLogit:
        (expMarginRaw - (structuralMargin + hfaPts + altPts + injuryMargin)) / sigma,
      impactUnits: weatherTotalSuppression,
    },
    {
      factor: "cfb_roster_injuries",
      label: "QB & Depth Chart Injuries",
      homeValue: -hOut,
      awayValue: -aOut,
      impactLogit: injuryMargin / sigma,
      impactUnits: injuryMargin,
    },
  ];

  return {
    sport: "ncaaf",
    modelId: MULTISPORT_CODENAMES.ncaaf,
    homeTeam: String(h.team_id),
    awayTeam: String(a.team_id),
    homeTeamName: String(h.team_name),
    awayTeamName: String(a.team_name),
    pHome,
    pAway,
    expectedMargin,
    expectedPointsHome,
    expectedPointsAway,
    expectedTotalPoints,
    drivers,
  };
}

export function predictMultiSport(
  sport: MultiSportLeague | "cfb",
  matchup: MultiSportMatchupInput,
  artifact: MultiSportModelArtifact,
): MultiSportPrediction {
  const s = String(sport).trim().toLowerCase();
  if (s === "nhl") return predictNHL(matchup, artifact);
  if (s === "mlb") return predictMLB(matchup, artifact);
  if (s === "nba") return predictNBA(matchup, artifact);
  if (s === "ncaaf" || s === "cfb") return predictNCAAF(matchup, artifact);
  throw new Error(`Unsupported multisport league: ${String(sport)}`);
}
