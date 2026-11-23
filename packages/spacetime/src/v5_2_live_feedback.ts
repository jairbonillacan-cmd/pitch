import { clamp, logit, normalCdf, sigmoid } from "./math";

export const V52_LIVE_FEEDBACK_SCHEMA_VERSION = "pitchlab_v5_2_live_feedback_1.0.0" as const;

export type UsWalkforwardSportV52 = "mlb" | "nhl" | "nba" | "nfl";
export type CoupledShotMetricV52 = "shots" | "shots_on_target";

export interface FootballCalibrationConfigV52 {
  readonly global_goal_prior: number;
  readonly prior_league_games: number;
  readonly prior_team_games: number;
  readonly league_ewm_alpha: number;
  readonly min_goal_env_scale: number;
  readonly max_goal_env_scale: number;
  readonly projection_env_blend_weight: number;
  readonly dc_rho: number;
  readonly tau_logit_core: number;
  readonly tau_logit_expansion: number;
  readonly x12_dc_consistency_weight: number;
  readonly playable_binary_tau_core: number;
  readonly playable_binary_tau_expansion: number;
}

export interface GoalkeeperSavesConfigV52 {
  readonly prior_save_rate: number;
  readonly prior_shots_faced: number;
  readonly min_save_rate: number;
  readonly max_save_rate: number;
  readonly r_dispersion_sot: number;
  readonly spline_knots_x: readonly number[];
  readonly spline_knots_y: readonly number[];
}

export interface CoupledPlayerShotsConfigV52 {
  readonly league_team_shots_anchor: number;
  readonly league_team_sot_anchor: number;
  readonly team_coupling_exponent: number;
  readonly opp_coupling_exponent: number;
  readonly spline_shots: { readonly x: readonly number[]; readonly y: readonly number[] };
  readonly spline_sot: { readonly x: readonly number[]; readonly y: readonly number[] };
}

export interface UsSportWalkforwardPriorV52 {
  readonly prior_team_runs: number;
  readonly prior_games: number;
  readonly elo_k: number;
  readonly elo_home_adv: number;
  readonly elo_to_margin_scale: number;
  readonly home_adv_pts: number;
  readonly sigma_margin: number;
  readonly sigma_total: number;
  readonly b2b_penalty_pts: number;
  readonly three_in_four_penalty_pts: number;
  readonly canonical_total_line: number;
}

export interface LiveFeedbackModelArtifactV52 {
  readonly schema_version: string;
  readonly codename: string;
  readonly version: string;
  readonly status: "candidate" | "production";
  readonly production_activated: boolean;
  readonly holdout_sealed_untouched: boolean;
  readonly football_calibration: FootballCalibrationConfigV52;
  readonly goalkeeper_saves: GoalkeeperSavesConfigV52;
  readonly coupled_player_shots: CoupledPlayerShotsConfigV52;
  readonly us_multisport_walkforward: Readonly<Record<UsWalkforwardSportV52, UsSportWalkforwardPriorV52>>;
  readonly league_scoring_environments_2026: Readonly<
    Record<
      string,
      {
        readonly games_observed: number;
        readonly mean_raw_goals: number;
        readonly shrunk_env_goals: number;
      }
    >
  >;
}

export interface DixonColesSummaryV52 {
  readonly lambdaHome: number;
  readonly lambdaAway: number;
  readonly expectedTotal: number;
  readonly pHome: number;
  readonly pDraw: number;
  readonly pAway: number;
  readonly pOver15: number;
  readonly pOver25: number;
  readonly pOver35: number;
  readonly pBttsYes: number;
}

export interface FootballRecalibratedOutlookV52 extends DixonColesSummaryV52 {
  readonly envScaleApplied: number;
}

const STARTER_SUB_MIN_PRIORS_V52: Readonly<Record<string, readonly [number, number]>> = {
  GK: [89.2, 32.0],
  DEF: [85.0, 23.5],
  MID: [79.5, 24.5],
  FWD: [76.0, 22.5],
};

const SHOT_CLUSTER_PRIORS_PER90_V52: Readonly<
  Record<string, Readonly<Record<CoupledShotMetricV52, readonly [number, number, number]>>>
> = {
  FWD: { shots: [2.68, 4.5, 4.2], shots_on_target: [1.02, 4.5, 3.8] },
  MID: { shots: [1.42, 4.5, 4.6], shots_on_target: [0.46, 4.5, 4.2] },
  DEF: { shots: [0.66, 4.5, 5.0], shots_on_target: [0.19, 4.5, 4.8] },
};

export function dixonColesMarketsExactV52(
  lambdaHome: number,
  lambdaAway: number,
  rho: number = -0.105,
  maxGoals: number = 12,
): DixonColesSummaryV52 {
  const lh = clamp(lambdaHome, 0.08, 8.5);
  const la = clamp(lambdaAway, 0.08, 8.5);

  const pmfH = new Float64Array(maxGoals + 1);
  const pmfA = new Float64Array(maxGoals + 1);
  pmfH[0] = Math.exp(-lh);
  pmfA[0] = Math.exp(-la);
  for (let k = 1; k <= maxGoals; k += 1) {
    pmfH[k] = (pmfH[k - 1]! * lh) / k;
    pmfA[k] = (pmfA[k - 1]! * la) / k;
  }
  let sh = 0.0;
  let sa = 0.0;
  for (let k = 0; k <= maxGoals; k += 1) {
    sh += pmfH[k]!;
    sa += pmfA[k]!;
  }
  for (let k = 0; k <= maxGoals; k += 1) {
    pmfH[k] = pmfH[k]! / sh;
    pmfA[k] = pmfA[k]! / sa;
  }

  const rhoMin = Math.max(-1.0 / Math.max(lh * la, 1e-6) + 0.05, -0.35);
  const rhoMax = Math.min(1.0 / Math.max(lh, 1e-6) - 0.05, 1.0 / Math.max(la, 1e-6) - 0.05, 0.35);
  const rc = clamp(rho, rhoMin, rhoMax);

  const mat = new Float64Array((maxGoals + 1) * (maxGoals + 1));
  let totMass = 0.0;
  for (let i = 0; i <= maxGoals; i += 1) {
    for (let j = 0; j <= maxGoals; j += 1) {
      const base = pmfH[i]! * pmfA[j]!;
      let tau = 1.0;
      if (i === 0 && j === 0) tau = 1.0 - lh * la * rc;
      else if (i === 0 && j === 1) tau = 1.0 + lh * rc;
      else if (i === 1 && j === 0) tau = 1.0 + la * rc;
      else if (i === 1 && j === 1) tau = 1.0 - rc;
      const val = Math.max(0.0, base * tau);
      mat[i * (maxGoals + 1) + j] = val;
      totMass += val;
    }
  }

  let pHome = 0.0;
  let pDraw = 0.0;
  let pAway = 0.0;
  let pO15 = 0.0;
  let pO25 = 0.0;
  let pO35 = 0.0;
  let pBtts = 0.0;

  for (let i = 0; i <= maxGoals; i += 1) {
    for (let j = 0; j <= maxGoals; j += 1) {
      const pij = mat[i * (maxGoals + 1) + j]! / totMass;
      if (i > j) pHome += pij;
      else if (i === j) pDraw += pij;
      else pAway += pij;
      if (i + j >= 2) pO15 += pij;
      if (i + j >= 3) pO25 += pij;
      if (i + j >= 4) pO35 += pij;
      if (i >= 1 && j >= 1) pBtts += pij;
    }
  }

  return {
    lambdaHome: lh,
    lambdaAway: la,
    expectedTotal: lh + la,
    pHome: clamp(pHome, 0.001, 0.998),
    pDraw: clamp(pDraw, 0.001, 0.998),
    pAway: clamp(pAway, 0.001, 0.998),
    pOver15: clamp(pO15, 0.001, 0.999),
    pOver25: clamp(pO25, 0.001, 0.999),
    pOver35: clamp(pO35, 0.001, 0.999),
    pBttsYes: clamp(pBtts, 0.001, 0.999),
  };
}

export interface RecalibrateFootballInputV52 {
  readonly rawProjHome: number;
  readonly rawProjAway: number;
  readonly rawX12: readonly [number, number, number] | readonly number[];
  readonly leagueEnvGoals: number;
  readonly rawLeagueProjMean: number;
  readonly isExpansionLeague: boolean;
  readonly config: FootballCalibrationConfigV52;
}

export function recalibrateFootballOutlookV52(
  input: RecalibrateFootballInputV52,
): FootballRecalibratedOutlookV52 {
  const { rawProjHome, rawProjAway, rawX12, leagueEnvGoals, rawLeagueProjMean, isExpansionLeague, config } =
    input;
  const rawTot = Math.max(0.3, rawProjHome + rawProjAway);
  const anchorDenom = Math.max(0.5, rawLeagueProjMean);
  const scale = clamp(leagueEnvGoals / anchorDenom, config.min_goal_env_scale, config.max_goal_env_scale);
  const shrinkW = config.projection_env_blend_weight;
  const targetTot = clamp((1.0 - shrinkW) * (rawTot * scale) + shrinkW * leagueEnvGoals, 1.25, 4.85);
  const shareH = clamp(rawProjHome / rawTot, 0.12, 0.88);
  const lh = targetTot * shareH;
  const la = targetTot * (1.0 - shareH);
  const dc = dixonColesMarketsExactV52(lh, la, config.dc_rho, 12);

  const tau = isExpansionLeague ? config.tau_logit_expansion : config.tau_logit_core;
  const eps = 1e-6;
  const r0 = Math.max(eps, rawX12[0] ?? 0.44);
  const r1 = Math.max(eps, rawX12[1] ?? 0.26);
  const r2 = Math.max(eps, rawX12[2] ?? 0.30);
  const sRaw = Math.max(eps, r0 + r1 + r2);
  const pNorm = [r0 / sRaw, r1 / sRaw, r2 / sRaw] as const;
  const basePrior = [0.44, 0.26, 0.3] as const;

  const u0 = basePrior[0] * Math.exp(Math.log(pNorm[0] / basePrior[0]) / tau);
  const u1 = basePrior[1] * Math.exp(Math.log(pNorm[1] / basePrior[1]) / tau);
  const u2 = basePrior[2] * Math.exp(Math.log(pNorm[2] / basePrior[2]) / tau);
  const sU = u0 + u1 + u2;
  const pTemp = [u0 / sU, u1 / sU, u2 / sU] as const;

  const wDc = config.x12_dc_consistency_weight;
  const f0 = (1.0 - wDc) * pTemp[0] + wDc * dc.pHome;
  const f1 = (1.0 - wDc) * pTemp[1] + wDc * dc.pDraw;
  const f2 = (1.0 - wDc) * pTemp[2] + wDc * dc.pAway;
  const sFin = f0 + f1 + f2;

  return {
    lambdaHome: lh,
    lambdaAway: la,
    expectedTotal: lh + la,
    envScaleApplied: scale,
    pHome: f0 / sFin,
    pDraw: f1 / sFin,
    pAway: f2 / sFin,
    pOver15: dc.pOver15,
    pOver25: dc.pOver25,
    pOver35: dc.pOver35,
    pBttsYes: dc.pBttsYes,
  };
}

export function recalibratePlayableBinaryProbV52(
  pRaw: number,
  isExpansionLeague: boolean,
  config: FootballCalibrationConfigV52,
): number {
  const tau = isExpansionLeague ? config.playable_binary_tau_expansion : config.playable_binary_tau_core;
  const z = logit(clamp(pRaw, 0.005, 0.995));
  return clamp(sigmoid(z / tau), 0.001, 0.999);
}

export function estimateEffectiveExposure90V52(
  appearances: number,
  subIns: number,
  positionGroup: string,
): number {
  const apps = Math.max(0, Math.trunc(appearances));
  const subs = clamp(Math.trunc(subIns), 0, apps);
  const starts = apps - subs;
  const pair = STARTER_SUB_MIN_PRIORS_V52[positionGroup] ?? [79.5, 24.0];
  const totalMin = starts * pair[0] + subs * pair[1];
  return Math.max(0.25, totalMin / 90.0);
}

export function nbTailProbGeV52(kMin: number, mu: number, rDisp: number): number {
  if (kMin <= 0) return 0.999;
  const muC = clamp(mu, 0.005, 40.0);
  const rC = clamp(rDisp, 0.4, 200.0);
  const p0Ratio = rC / (rC + muC);
  const qRatio = muC / (rC + muC);
  let pmf = Math.exp(rC * Math.log(p0Ratio));
  let cdfLt = kMin > 0 ? pmf : 0.0;
  for (let k = 1; k < kMin; k += 1) {
    pmf = pmf * ((k - 1.0 + rC) / k) * qRatio;
    cdfLt += pmf;
  }
  return clamp(1.0 - cdfLt, 0.001, 0.999);
}

export function evaluateBarycentricLogitKnotsV52(
  pRaw: number,
  knotsX: readonly number[],
  knotsY: readonly number[],
): number {
  const n = knotsX.length;
  if (n < 2 || knotsY.length !== n) {
    return clamp(pRaw, 0.001, 0.999);
  }
  const pc = clamp(pRaw, knotsX[0]!, knotsX[n - 1]!);
  const zx = logit(pc);
  for (let i = 0; i < n - 1; i += 1) {
    const x1 = knotsX[i + 1]!;
    if (pc <= x1 || i === n - 2) {
      const z0 = logit(knotsX[i]!);
      const z1 = logit(x1);
      const zy0 = logit(knotsY[i]!);
      const zy1 = logit(knotsY[i + 1]!);
      const t = Math.abs(z1 - z0) < 1e-12 ? 0.0 : clamp((zx - z0) / (z1 - z0), 0.0, 1.0);
      return clamp(sigmoid(zy0 + t * (zy1 - zy0)), 0.001, 0.999);
    }
  }
  return clamp(pc, 0.001, 0.999);
}

export interface GoalkeeperSavesInputV52 {
  readonly saves: number;
  readonly shotsFaced: number;
  readonly goalsConceded: number;
  readonly appearances: number;
  readonly subIns: number;
  readonly oppExpectedSoT: number;
  readonly line: number;
  readonly expectedMinutes?: number | null;
  readonly artifact: Pick<LiveFeedbackModelArtifactV52, "goalkeeper_saves">;
}

export interface GoalkeeperSavesOutlookV52 {
  readonly ebSaveRate: number;
  readonly effectiveExposure90: number;
  readonly expectedMinutes: number;
  readonly oppExpectedSoT: number;
  readonly expectedSaves: number;
  readonly line: number;
  readonly pOver: number;
  readonly pUnder: number;
  readonly fairOverDecimal: number;
  readonly fairUnderDecimal: number;
}

export function projectGoalkeeperSavesOutlookV52(
  input: GoalkeeperSavesInputV52,
): GoalkeeperSavesOutlookV52 {
  const gkCfg = input.artifact.goalkeeper_saves;
  const sv = Math.trunc(input.saves);
  const sfRaw = Math.trunc(input.shotsFaced);
  const gc = Math.trunc(input.goalsConceded);
  const apps = Math.trunc(input.appearances);
  const subs = Math.trunc(input.subIns);

  const effSf = sfRaw > 0 ? Math.max(sv, sfRaw) : sv + gc;
  const ebSaveRate = clamp(
    (sv + gkCfg.prior_shots_faced * gkCfg.prior_save_rate) / (effSf + gkCfg.prior_shots_faced),
    gkCfg.min_save_rate,
    gkCfg.max_save_rate,
  );
  const eff90 = estimateEffectiveExposure90V52(apps, subs, "GK");
  const avgMin = clamp((eff90 * 90.0) / Math.max(1, apps), 30.0, 90.0);
  const expMin = clamp(
    input.expectedMinutes !== null && input.expectedMinutes !== undefined ? input.expectedMinutes : avgMin,
    15.0,
    95.0,
  );
  const oppSoTC = clamp(input.oppExpectedSoT, 1.2, 9.5);
  const muSaves = oppSoTC * ebSaveRate * (expMin / 90.0);
  const kMin = Math.floor(input.line + 1e-9) + 1;
  const pRaw = nbTailProbGeV52(kMin, muSaves, gkCfg.r_dispersion_sot);
  const pCal = evaluateBarycentricLogitKnotsV52(pRaw, gkCfg.spline_knots_x, gkCfg.spline_knots_y);
  const pUnder = clamp(1.0 - pCal, 0.001, 0.999);

  return {
    ebSaveRate,
    effectiveExposure90: eff90,
    expectedMinutes: expMin,
    oppExpectedSoT: oppSoTC,
    expectedSaves: muSaves,
    line: input.line,
    pOver: pCal,
    pUnder,
    fairOverDecimal: Math.round((1.0 / pCal) * 10000) / 10000,
    fairUnderDecimal: Math.round((1.0 / pUnder) * 10000) / 10000,
  };
}

export interface CoupledPlayerShotsInputV52 {
  readonly metric: CoupledShotMetricV52;
  readonly positionGroup: string;
  readonly seasonCount: number;
  readonly appearances: number;
  readonly subIns: number;
  readonly teamExpectedShots: number;
  readonly oppDefenseShotsFactor: number;
  readonly line: number;
  readonly expectedMinutes?: number | null;
  readonly artifact: Pick<LiveFeedbackModelArtifactV52, "coupled_player_shots">;
}

export interface CoupledPlayerShotsOutlookV52 {
  readonly metric: CoupledShotMetricV52;
  readonly ebRatePer90: number;
  readonly naivePerAppearanceRate: number;
  readonly effectiveExposure90: number;
  readonly expectedMinutes: number;
  readonly muProjected: number;
  readonly line: number;
  readonly pOver: number;
  readonly pUnder: number;
  readonly fairOverDecimal: number;
  readonly fairUnderDecimal: number;
}

export function projectCoupledPlayerShotsOutlookV52(
  input: CoupledPlayerShotsInputV52,
): CoupledPlayerShotsOutlookV52 {
  const shCfg = input.artifact.coupled_player_shots;
  const posKey = input.positionGroup in SHOT_CLUSTER_PRIORS_PER90_V52 ? input.positionGroup : "MID";
  const [priorRate, priorExp90, rDisp] = SHOT_CLUSTER_PRIORS_PER90_V52[posKey]![input.metric];
  const apps = Math.trunc(input.appearances);
  const subs = Math.trunc(input.subIns);
  const eff90 = estimateEffectiveExposure90V52(apps, subs, posKey);
  const ebRatePer90 = (input.seasonCount + priorExp90 * priorRate) / (eff90 + priorExp90);

  const pair = STARTER_SUB_MIN_PRIORS_V52[posKey] ?? [79.5, 24.0];
  const expMin = clamp(
    input.expectedMinutes !== null && input.expectedMinutes !== undefined ? input.expectedMinutes : pair[0],
    15.0,
    95.0,
  );
  const leagueAnchor =
    input.metric === "shots" ? shCfg.league_team_shots_anchor : shCfg.league_team_sot_anchor;
  const teamFactor = Math.pow(
    clamp(input.teamExpectedShots / leagueAnchor, 0.55, 1.75),
    shCfg.team_coupling_exponent,
  );
  const oppFactor = Math.pow(
    clamp(input.oppDefenseShotsFactor, 0.65, 1.5),
    shCfg.opp_coupling_exponent,
  );

  const mu = ebRatePer90 * (expMin / 90.0) * teamFactor * oppFactor;
  const kMin = Math.floor(input.line + 1e-9) + 1;
  const pRaw = nbTailProbGeV52(kMin, mu, rDisp);
  const knots = input.metric === "shots_on_target" ? shCfg.spline_sot : shCfg.spline_shots;
  const pCal = evaluateBarycentricLogitKnotsV52(pRaw, knots.x, knots.y);
  const pUnder = clamp(1.0 - pCal, 0.001, 0.999);

  return {
    metric: input.metric,
    ebRatePer90,
    naivePerAppearanceRate: input.seasonCount / Math.max(1, apps),
    effectiveExposure90: eff90,
    expectedMinutes: expMin,
    muProjected: mu,
    line: input.line,
    pOver: pCal,
    pUnder,
    fairOverDecimal: Math.round((1.0 / pCal) * 10000) / 10000,
    fairUnderDecimal: Math.round((1.0 / pUnder) * 10000) / 10000,
  };
}

export interface UsWalkforwardInputV52 {
  readonly sport: UsWalkforwardSportV52;
  readonly homeElo: number;
  readonly awayElo: number;
  readonly homeCumFor: number;
  readonly homeCumAgainst: number;
  readonly homeGames: number;
  readonly awayCumFor: number;
  readonly awayCumAgainst: number;
  readonly awayGames: number;
  readonly leagueTeamScoringEnv: number;
  readonly homeB2B: boolean;
  readonly awayB2B: boolean;
  readonly home3in4: boolean;
  readonly away3in4: boolean;
  readonly neutralSite: boolean;
  readonly totalLine?: number | null;
  readonly artifact: Pick<LiveFeedbackModelArtifactV52, "us_multisport_walkforward">;
}

export interface UsWalkforwardOutlookV52 {
  readonly muHome: number;
  readonly muAway: number;
  readonly expectedMargin: number;
  readonly expectedTotal: number;
  readonly pHomeWin: number;
  readonly pAwayWin: number;
  readonly totalLine: number;
  readonly pOver: number;
  readonly pUnder: number;
}

export function projectUsWalkforwardGameV52(
  input: UsWalkforwardInputV52,
): UsWalkforwardOutlookV52 {
  const cfg = input.artifact.us_multisport_walkforward[input.sport];
  const kappa = cfg.prior_games;
  const env = Math.max(0.5, input.leagueTeamScoringEnv);

  const hOff = (input.homeCumFor + kappa * env) / (input.homeGames + kappa);
  const hDef = (input.homeCumAgainst + kappa * env) / (input.homeGames + kappa);
  const aOff = (input.awayCumFor + kappa * env) / (input.awayGames + kappa);
  const aDef = (input.awayCumAgainst + kappa * env) / (input.awayGames + kappa);

  const baseTotal = (hOff * aDef) / env + (aOff * hDef) / env;
  const penH =
    (input.homeB2B ? cfg.b2b_penalty_pts : 0.0) +
    (input.home3in4 ? cfg.three_in_four_penalty_pts : 0.0);
  const penA =
    (input.awayB2B ? cfg.b2b_penalty_pts : 0.0) +
    (input.away3in4 ? cfg.three_in_four_penalty_pts : 0.0);
  const expTotal = Math.max(0.5, baseTotal - 0.5 * (penH + penA));

  const eloDiff = input.homeElo - input.awayElo + (input.neutralSite ? 0.0 : cfg.elo_home_adv);
  const eloPHome = 1.0 / (1.0 + Math.pow(10.0, -eloDiff / 400.0));

  const rateMargin =
    (hOff * aDef) / env -
    (aOff * hDef) / env +
    (input.neutralSite ? 0.0 : cfg.home_adv_pts) -
    (penH - penA);
  const eloMargin = eloDiff * cfg.elo_to_margin_scale;
  const expMargin = 0.55 * eloMargin + 0.45 * rateMargin;

  const muHome = Math.max(0.2, 0.5 * (expTotal + expMargin));
  const muAway = Math.max(0.2, 0.5 * (expTotal - expMargin));

  const pMargin = normalCdf(expMargin / cfg.sigma_margin);
  const pHome = clamp(0.6 * eloPHome + 0.4 * pMargin, 0.02, 0.98);

  const line =
    input.totalLine !== null && input.totalLine !== undefined
      ? input.totalLine
      : cfg.canonical_total_line;
  const pOver = clamp(1.0 - normalCdf((line - expTotal) / cfg.sigma_total), 0.02, 0.98);

  return {
    muHome,
    muAway,
    expectedMargin: expMargin,
    expectedTotal: expTotal,
    pHomeWin: pHome,
    pAwayWin: 1.0 - pHome,
    totalLine: line,
    pOver,
    pUnder: 1.0 - pOver,
  };
}
