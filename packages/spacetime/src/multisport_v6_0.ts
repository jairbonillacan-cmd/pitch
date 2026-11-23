import { clamp, normalCdf, sigmoid } from "./math";
import { probabilityToFairOdds, type FairOdds } from "./outlook";
import { acklamNormalQuantile } from "./sgp_copula";

export const MULTISPORT_V60_SCHEMA_VERSION = "multisport_v6.0.0" as const;

export type MultiSportLeagueV60 = "mlb" | "nhl" | "nba" | "nfl";

export interface TotalLineProjectionV60 {
  readonly line: number;
  readonly p_over: number;
  readonly p_under: number;
  readonly p_push: number;
  readonly p_over_no_push: number;
  readonly p_under_no_push: number;
  readonly fair_odds_over: FairOdds;
  readonly fair_odds_under: FairOdds;
}

export interface SpreadLineProjectionV60 {
  readonly spread_home: number;
  readonly p_home_cover: number;
  readonly p_away_cover: number;
  readonly p_push: number;
  readonly p_home_cover_no_push: number;
  readonly p_away_cover_no_push: number;
  readonly fair_odds_home_cover: FairOdds;
  readonly fair_odds_away_cover: FairOdds;
}

export interface EarlyPayoutOutlookV60 {
  readonly sport: MultiSportLeagueV60;
  readonly trigger_lead: number;
  readonly p_home_regular_win: number;
  readonly p_away_regular_win: number;
  readonly p_home_early_payout_win: number;
  readonly p_away_early_payout_win: number;
  readonly home_early_payout_lift: number;
  readonly away_early_payout_lift: number;
  readonly p_both_sides_trigger_early_payout: number | null;
  readonly fair_odds_home_early_payout: FairOdds;
  readonly fair_odds_away_early_payout: FairOdds;
  readonly final_score_validation_status: "walk_forward_game_oos_2026_verified";
  readonly intra_game_validation_status: string;
}

export interface MlbPhysicsConfigV60 {
  readonly league_woba: number;
  readonly woba_zero_floor: number;
  readonly league_fip: number;
  readonly unearned_runs_mult: number;
  readonly starter_shrink_ip: number;
  readonly home_scoring_mult: number;
  readonly away_scoring_mult: number;
  readonly r_disp_f5: number;
  readonly r_disp_late4: number;
  readonly manfred_runner_boost_runs: number;
  readonly walkforward: {
    readonly prior_team_runs: number;
    readonly prior_games: number;
    readonly prior_env_team_games: number;
    readonly offseason_prior_retention?: number;
    readonly elo_k: number;
    readonly elo_home_adv: number;
    readonly elo_woba_tilt_per_100: number;
    readonly b2b_bp_fip_penalty: number;
    readonly three_in_four_bp_fip_penalty: number;
    readonly canonical_total_lines: readonly number[];
  };
}

export interface NhlPhysicsConfigV60 {
  readonly league_sv_pct: number;
  readonly shots_per_game: number;
  readonly avg_pp_opportunities: number;
  readonly confirmed_goalie_weight: number;
  readonly unconfirmed_goalie_weight: number;
  readonly b2b_sv_pct_penalty: number;
  readonly three_in_four_goals_penalty: number;
  readonly empty_net_leader_goal_prob: number;
  readonly empty_net_puller_tie_prob: number;
  readonly empty_net_diff2_leader_prob: number;
  readonly empty_net_diff2_puller_prob: number;
  readonly empty_net_two_goal_prob: number;
  readonly walkforward: {
    readonly prior_team_goals: number;
    readonly prior_games: number;
    readonly prior_env_team_games: number;
    readonly elo_k: number;
    readonly elo_home_adv: number;
    readonly elo_goals60_tilt_per_100: number;
    readonly home_ice_goals_boost: number;
    readonly away_ice_goals_offset: number;
    readonly canonical_total_lines: readonly number[];
  };
}

export interface NbaPhysicsConfigV60 {
  readonly sigma_margin_base: number;
  readonly sigma_total_base: number;
  readonly home_b2b_penalty_pts: number;
  readonly away_b2b_penalty_pts: number;
  readonly three_in_four_penalty_pts: number;
  readonly ot_scale: number;
  readonly injury_out_unit_pts: number;
  readonly injury_out_diminishing_power: number;
  readonly injury_duda_unit_pts: number;
  readonly injury_out_var_unit: number;
  readonly injury_duda_var_unit: number;
  readonly walkforward: {
    readonly prior_team_pts: number;
    readonly prior_games: number;
    readonly prior_env_team_games: number;
    readonly elo_k: number;
    readonly elo_home_adv: number;
    readonly elo_margin_weight: number;
    readonly hca_base_pts: number;
    readonly high_altitude_hca_bonus_pts: number;
    readonly canonical_total_lines: readonly number[];
  };
}

export interface NflPhysicsConfigV60 {
  readonly max_abs_margin: number;
  readonly positive_margin_kernel_1_to_45: readonly number[];
  readonly margin_quad_concentration: number;
  readonly spread_market_posterior_w_model: number;
  readonly discrete_totals: {
    readonly max_total_points: number;
    readonly base_kernel_0_to_95: readonly number[];
    readonly quad_concentration: number;
    readonly market_posterior_w_model: number;
  };
  readonly overtime_calibration: {
    readonly feature_names: readonly string[];
    readonly coef: readonly number[];
    readonly intercept: number;
  };
  readonly walkforward: {
    readonly prior_team_pts: number;
    readonly prior_games: number;
    readonly prior_env_team_games: number;
    readonly offseason_elo_regression: number;
    readonly elo_k: number;
    readonly elo_home_adv: number;
    readonly elo_to_margin_scale: number;
    readonly hca_base_pts: number;
    readonly short_week_penalty_pts: number;
    readonly bye_week_bonus_pts: number;
    readonly base_tie_prob: number;
    readonly canonical_spread_lines: readonly number[];
    readonly canonical_total_lines: readonly number[];
  };
}

export interface EarlyPayoutConfigV60 {
  readonly mlb: {
    readonly trigger_lead: number;
    readonly method: string;
    readonly sigma_margin: number;
    readonly effective_barrier: number;
    readonly intra_game_validation_status: string;
  };
  readonly nba: {
    readonly trigger_lead: number;
    readonly method: string;
    readonly sigma_margin: number;
    readonly effective_barrier: number;
    readonly intra_game_validation_status: string;
  };
  readonly nfl: {
    readonly trigger_lead: number;
    readonly method: string;
    readonly sigma_margin: number;
    readonly effective_barrier: number;
    readonly intra_game_validation_status: string;
  };
  readonly nhl: {
    readonly trigger_lead: number;
    readonly method: string;
    readonly max_goals_dp: number;
    readonly period_weights_3: readonly [number, number, number] | readonly number[];
    readonly intra_game_validation_status: string;
  };
}

export interface PostWalkforwardTeamStateV60 {
  readonly sport: MultiSportLeagueV60;
  readonly team_key: string;
  readonly team_name: string;
  readonly elevation_m: number;
  readonly is_dome: boolean;
  readonly elo: number;
  readonly games_played: number;
  readonly cum_for: number;
  readonly cum_against: number;
  readonly last_game_date: string | null;
  readonly prev_game_date: string | null;
  readonly structural_priors: Readonly<Record<string, number>>;
}

export interface MultiSportModelArtifactV60 {
  readonly schema_version: string;
  readonly codename: string;
  readonly version: string;
  readonly status: "candidate" | "production";
  readonly production_activated: boolean;
  readonly holdout_cut_utc: string;
  readonly holdout_sealed_untouched: boolean;
  readonly hyperparameter_tuning_on_holdout: boolean;
  readonly validation_status: string;
  readonly physics_config: {
    readonly mlb: MlbPhysicsConfigV60;
    readonly nhl: NhlPhysicsConfigV60;
    readonly nba: NbaPhysicsConfigV60;
    readonly nfl: NflPhysicsConfigV60;
  };
  readonly early_payout_config: EarlyPayoutConfigV60;
  readonly team_slug_aliases: Readonly<Record<MultiSportLeagueV60, Readonly<Record<string, string>>>>;
  readonly nba_active_injuries_observed_at_utc?: string;
  readonly nba_active_injuries_2026?: Readonly<
    Record<
      string,
      {
        readonly baja_count: number;
        readonly duda_count: number;
        readonly missing_impact_pts: number;
        readonly questionable_impact_pts: number;
      }
    >
  >;
  readonly league_environments_2026?: Readonly<
    Record<
      MultiSportLeagueV60,
      {
        readonly games_ingested: number;
        readonly shrunk_team_scoring_env: number;
        readonly mean_observed_game_total: number;
      }
    >
  >;
  readonly teams_post_walkforward_state_2026?: Readonly<Record<string, PostWalkforwardTeamStateV60>>;
}

function roundHalfEvenV60(v: number): number {
  const fl = Math.floor(v);
  const diff = v - fl;
  if (Math.abs(diff - 0.5) < 1e-12) {
    return fl % 2 === 0 ? fl : fl + 1;
  }
  return Math.floor(v + 0.5);
}

function nbPmfExactV60(mu: number, rDisp: number, maxK: number): Float64Array {
  const muC = clamp(mu, 0.02, 30.0);
  const rC = clamp(rDisp, 0.5, 200.0);
  const out = new Float64Array(maxK + 1);
  const p0Ratio = rC / (rC + muC);
  const qRatio = muC / (rC + muC);
  out[0] = Math.exp(rC * Math.log(p0Ratio));
  for (let k = 1; k <= maxK; k += 1) {
    out[k] = (out[k - 1] ?? 0.0) * ((k - 1.0 + rC) / k) * qRatio;
  }
  let s = 0.0;
  for (let k = 0; k <= maxK; k += 1) s += out[k] ?? 0.0;
  if (s > 0.0) {
    for (let k = 0; k <= maxK; k += 1) out[k] = (out[k] ?? 0.0) / s;
  }
  return out;
}

function poissonPmfExactV60(lam: number, maxK: number): Float64Array {
  const lc = clamp(lam, 0.01, 15.0);
  const out = new Float64Array(maxK + 1);
  out[0] = Math.exp(-lc);
  for (let k = 1; k <= maxK; k += 1) {
    out[k] = ((out[k - 1] ?? 0.0) * lc) / k;
  }
  let s = 0.0;
  for (let k = 0; k <= maxK; k += 1) s += out[k] ?? 0.0;
  if (s > 0.0) {
    for (let k = 0; k <= maxK; k += 1) out[k] = (out[k] ?? 0.0) / s;
  }
  return out;
}

function convolve1dExactV60(a: Float64Array, b: Float64Array, maxK: number): Float64Array {
  const out = new Float64Array(maxK + 1);
  for (let i = 0; i < a.length; i += 1) {
    const ai = a[i] ?? 0.0;
    if (ai <= 0.0) continue;
    for (let j = 0; j < b.length; j += 1) {
      const idx = i + j <= maxK ? i + j : maxK;
      out[idx] = (out[idx] ?? 0.0) + ai * (b[j] ?? 0.0);
    }
  }
  let s = 0.0;
  for (let k = 0; k <= maxK; k += 1) s += out[k] ?? 0.0;
  if (s > 0.0) {
    for (let k = 0; k <= maxK; k += 1) out[k] = (out[k] ?? 0.0) / s;
  }
  return out;
}

function evalTotalLineFrom2dGridV60(
  grid: Float64Array,
  sideLen: number,
  line: number,
): TotalLineProjectionV60 {
  const isInt = Math.abs(line - Math.round(line)) < 1e-9;
  const kInt = Math.round(line);
  let pOver = 0.0;
  let pUnder = 0.0;
  let pPush = 0.0;

  for (let ih = 0; ih < sideLen; ih += 1) {
    const base = ih * sideLen;
    for (let ia = 0; ia < sideLen; ia += 1) {
      const p = grid[base + ia] ?? 0.0;
      if (p <= 0.0) continue;
      const tot = ih + ia;
      if (isInt) {
        if (tot > kInt) pOver += p;
        else if (tot === kInt) pPush += p;
        else pUnder += p;
      } else if (tot > line) {
        pOver += p;
      } else {
        pUnder += p;
      }
    }
  }

  const act = Math.max(pOver + pUnder, 1e-12);
  const pOverCond = clamp(pOver / act, 1e-6, 1.0 - 1e-6);
  const pUnderCond = 1.0 - pOverCond;

  return Object.freeze({
    line,
    p_over: pOver,
    p_under: pUnder,
    p_push: pPush,
    p_over_no_push: pOverCond,
    p_under_no_push: pUnderCond,
    fair_odds_over: probabilityToFairOdds(clamp(pOverCond, 0.001, 0.999)),
    fair_odds_under: probabilityToFairOdds(clamp(pUnderCond, 0.001, 0.999)),
  });
}

export function evaluateBrownianEarlyPayoutV60(params: {
  readonly sport: "mlb" | "nba" | "nfl";
  readonly pHomeWin: number;
  readonly pAwayWin: number;
  readonly triggerLead: number;
  readonly sigmaMargin: number;
  readonly effectiveBarrier: number;
  readonly intraGameStatus: string;
}): EarlyPayoutOutlookV60 {
  const pH = clamp(params.pHomeWin, 1e-6, 1.0 - 1e-6);
  const pA = clamp(params.pAwayWin, 1e-6, 1.0 - 1e-6);
  const sigma = Math.max(params.sigmaMargin, 0.5);
  const bEff = Math.max(params.effectiveBarrier, 0.5);

  const muH = sigma * acklamNormalQuantile(clamp(pH, 0.001, 0.999));
  const muA = sigma * acklamNormalQuantile(clamp(pA, 0.001, 0.999));

  const logH = clamp((2.0 * muH * bEff) / (sigma * sigma), -40.0, 40.0);
  const liftH = Math.max(0.0, Math.exp(logH) * normalCdf((-2.0 * bEff - muH) / sigma));

  const logA = clamp((2.0 * muA * bEff) / (sigma * sigma), -40.0, 40.0);
  const liftA = Math.max(0.0, Math.exp(logA) * normalCdf((-2.0 * bEff - muA) / sigma));

  const capH = Math.max(pH, 0.9999);
  const capA = Math.max(pA, 0.9999);
  const pHEp = Math.min(capH, Math.max(pH, pH + liftH));
  const pAEp = Math.min(capA, Math.max(pA, pA + liftA));

  return Object.freeze({
    sport: params.sport,
    trigger_lead: Math.trunc(params.triggerLead),
    p_home_regular_win: pH,
    p_away_regular_win: pA,
    p_home_early_payout_win: pHEp,
    p_away_early_payout_win: pAEp,
    home_early_payout_lift: Math.max(0.0, pHEp - pH),
    away_early_payout_lift: Math.max(0.0, pAEp - pA),
    p_both_sides_trigger_early_payout: null,
    fair_odds_home_early_payout: probabilityToFairOdds(clamp(pHEp, 0.001, 0.999)),
    fair_odds_away_early_payout: probabilityToFairOdds(clamp(pAEp, 0.001, 0.999)),
    final_score_validation_status: "walk_forward_game_oos_2026_verified",
    intra_game_validation_status: params.intraGameStatus,
  });
}

export function evaluateNhlEarlyPayoutDpV60(params: {
  readonly lam60Home: number;
  readonly lam60Away: number;
  readonly pHomeFull: number;
  readonly pAwayFull: number;
  readonly strengthShareHome: number;
  readonly epCfg: EarlyPayoutConfigV60["nhl"];
}): EarlyPayoutOutlookV60 {
  const pH = clamp(params.pHomeFull, 1e-6, 1.0 - 1e-6);
  const pA = clamp(params.pAwayFull, 1e-6, 1.0 - 1e-6);
  const maxG = Math.trunc(params.epCfg.max_goals_dp);
  const gSize = maxG + 1;
  const nStates = gSize * gSize * 4;
  const pWeights = params.epCfg.period_weights_3;
  const trigger = Math.trunc(params.epCfg.trigger_lead);

  let dp = new Float64Array(nStates);
  let dpNext = new Float64Array(nStates);
  dp[0] = 1.0;

  const lh = clamp(params.lam60Home, 0.5, 6.0);
  const la = clamp(params.lam60Away, 0.5, 6.0);

  for (let sl = 0; sl < 18; sl += 1) {
    const perIdx = Math.floor(sl / 6);
    const uSlice = (pWeights[perIdx] ?? 1.0 / 3.0) / 6.0;
    const baseDh = lh * uSlice;
    const baseDa = la * uSlice;
    const isEmptyNetWindow = sl === 17;

    dpNext.fill(0.0);

    for (let h = 0; h < gSize; h += 1) {
      for (let a = 0; a < gSize; a += 1) {
        const baseCell = (h * gSize + a) * 4;
        const cellMass =
          (dp[baseCell] ?? 0.0) +
          (dp[baseCell + 1] ?? 0.0) +
          (dp[baseCell + 2] ?? 0.0) +
          (dp[baseCell + 3] ?? 0.0);
        if (cellMass <= 1e-18) continue;

        let dh = baseDh;
        let da = baseDa;
        if (isEmptyNetWindow) {
          const diff = h - a;
          if (diff === 1 || diff === 2) {
            dh = baseDh * 1.85;
            da = baseDa * 1.35;
          } else if (diff === -1 || diff === -2) {
            da = baseDa * 1.85;
            dh = baseDh * 1.35;
          }
        }

        const p0H = Math.exp(-dh);
        const p1H = dh * p0H;
        const p2H = Math.max(0.0, 1.0 - p0H - p1H);

        const p0A = Math.exp(-da);
        const p1A = da * p0A;
        const p2A = Math.max(0.0, 1.0 - p0A - p1A);

        const phStep = [p0H, p1H, p2H];
        const paStep = [p0A, p1A, p2A];

        for (let mask = 0; mask < 4; mask += 1) {
          const pState = dp[baseCell + mask] ?? 0.0;
          if (pState <= 1e-18) continue;
          for (let gh = 0; gh <= 2; gh += 1) {
            const phg = phStep[gh] ?? 0.0;
            if (phg <= 0.0) continue;
            const nh = h + gh > maxG ? maxG : h + gh;
            for (let ga = 0; ga <= 2; ga += 1) {
              const pag = paStep[ga] ?? 0.0;
              if (pag <= 0.0) continue;
              const na = a + ga > maxG ? maxG : a + ga;
              let nMask = mask;
              if (nh - na >= trigger) nMask |= 1;
              if (na - nh >= trigger) nMask |= 2;
              const dstIdx = (nh * gSize + na) * 4 + nMask;
              dpNext[dstIdx] = (dpNext[dstIdx] ?? 0.0) + pState * phg * pag;
            }
          }
        }
      }
    }
    const tmp = dp;
    dp = dpNext;
    dpNext = tmp;
  }

  let homeLiftOnly = 0.0;
  let awayLiftOnly = 0.0;
  let pBoth = 0.0;
  const sh = clamp(params.strengthShareHome, 0.38, 0.62);

  for (let h = 0; h < gSize; h += 1) {
    for (let a = 0; a < gSize; a += 1) {
      const baseCell = (h * gSize + a) * 4;
      for (let mask = 0; mask < 4; mask += 1) {
        const p = dp[baseCell + mask] ?? 0.0;
        if (p <= 0.0) continue;
        if ((mask & 3) === 3) pBoth += p;
        if (h > a) {
          if ((mask & 2) !== 0) awayLiftOnly += p;
        } else if (a > h) {
          if ((mask & 1) !== 0) homeLiftOnly += p;
        } else {
          if ((mask & 1) !== 0) homeLiftOnly += p * (1.0 - sh);
          if ((mask & 2) !== 0) awayLiftOnly += p * sh;
        }
      }
    }
  }

  const capH = Math.max(pH, 0.9999);
  const capA = Math.max(pA, 0.9999);
  const pHEp = Math.min(capH, Math.max(pH, pH + Math.max(0.0, homeLiftOnly)));
  const pAEp = Math.min(capA, Math.max(pA, pA + Math.max(0.0, awayLiftOnly)));

  return Object.freeze({
    sport: "nhl",
    trigger_lead: trigger,
    p_home_regular_win: pH,
    p_away_regular_win: pA,
    p_home_early_payout_win: pHEp,
    p_away_early_payout_win: pAEp,
    home_early_payout_lift: Math.max(0.0, pHEp - pH),
    away_early_payout_lift: Math.max(0.0, pAEp - pA),
    p_both_sides_trigger_early_payout: pBoth,
    fair_odds_home_early_payout: probabilityToFairOdds(clamp(pHEp, 0.001, 0.999)),
    fair_odds_away_early_payout: probabilityToFairOdds(clamp(pAEp, 0.001, 0.999)),
    final_score_validation_status: "walk_forward_game_oos_2026_verified",
    intra_game_validation_status: params.epCfg.intra_game_validation_status,
  });
}

export interface MlbWalkforwardInputV60 {
  readonly home_elo?: number;
  readonly away_elo?: number;
  readonly home_cum_for?: number;
  readonly home_cum_against?: number;
  readonly home_games?: number;
  readonly away_cum_for?: number;
  readonly away_cum_against?: number;
  readonly away_games?: number;
  readonly league_team_scoring_env?: number;
  readonly home_b2b?: boolean;
  readonly away_b2b?: boolean;
  readonly home_3in4?: boolean;
  readonly away_3in4?: boolean;
  readonly neutral_site?: boolean;
  readonly home_elevation_m?: number;
  readonly home_is_dome?: boolean;
  readonly home_prior_woba?: number;
  readonly away_prior_woba?: number;
  readonly home_prior_fip?: number;
  readonly away_prior_fip?: number;
  readonly home_prior_era?: number | null;
  readonly away_prior_era?: number | null;
  readonly home_woba_override?: number | null;
  readonly away_woba_override?: number | null;
  readonly home_sp_fip_override?: number | null;
  readonly away_sp_fip_override?: number | null;
  readonly home_rot_fip_override?: number | null;
  readonly away_rot_fip_override?: number | null;
  readonly home_sp_ip_hist?: number;
  readonly away_sp_ip_hist?: number;
  readonly home_bp_fip_override?: number | null;
  readonly away_bp_fip_override?: number | null;
  readonly home_is_opener?: boolean;
  readonly away_is_opener?: boolean;
  readonly home_sp_exp_ip?: number;
  readonly away_sp_exp_ip?: number;
  readonly home_platoon_mult?: number;
  readonly away_platoon_mult?: number;
  readonly park_weather_mult_override?: number | null;
  readonly total_line?: number;
}

export interface MlbWalkforwardOutlookV60 {
  readonly sport: "mlb";
  readonly p_home: number;
  readonly p_away: number;
  readonly fair_odds_home: FairOdds;
  readonly fair_odds_away: FairOdds;
  readonly effective_home_woba: number;
  readonly effective_away_woba: number;
  readonly effective_home_sp_fip: number;
  readonly effective_away_sp_fip: number;
  readonly park_factor_applied: number;
  readonly f5: {
    readonly mu_home: number;
    readonly mu_away: number;
    readonly p_home: number;
    readonly p_tie: number;
    readonly p_away: number;
    readonly p_over_4_5: number;
    readonly fair_odds_home: FairOdds;
    readonly fair_odds_tie: FairOdds;
    readonly fair_odds_away: FairOdds;
  };
  readonly full_game: {
    readonly mu_9inn_home: number;
    readonly mu_9inn_away: number;
    readonly p_extra_innings: number;
    readonly expected_runs_home: number;
    readonly expected_runs_away: number;
    readonly expected_total_runs: number;
    readonly p_runline_home_minus_1_5: number;
    readonly p_runline_away_plus_1_5: number;
    readonly p_runline_home_plus_1_5: number;
    readonly p_runline_away_minus_1_5: number;
    readonly total_line: number;
    readonly p_over: number;
    readonly p_under: number;
    readonly p_push: number;
    readonly p_over_no_push: number;
    readonly p_over_9inn_truncated: number;
    readonly extra_innings_over_correction_pp: number;
    readonly totals_by_line: Readonly<Record<string, TotalLineProjectionV60>>;
  };
  readonly early_payout: EarlyPayoutOutlookV60;
}

export function projectMlbWalkforwardOutlookV60(
  inp: MlbWalkforwardInputV60,
  artifact: Pick<MultiSportModelArtifactV60, "physics_config" | "early_payout_config">,
): MlbWalkforwardOutlookV60 {
  const c = artifact.physics_config.mlb;
  const wf = c.walkforward;
  const epCfg = artifact.early_payout_config.mlb;

  const lgWoba = c.league_woba;
  const wFloor = c.woba_zero_floor;
  const lgFip = c.league_fip;
  const unearnedMult = c.unearned_runs_mult;
  const kappaIp = c.starter_shrink_ip;
  const kappaG = wf.prior_games;

  const envRuns = Math.max(2.5, inp.league_team_scoring_env ?? wf.prior_team_runs);
  const hElo = inp.home_elo ?? 1500.0;
  const aElo = inp.away_elo ?? 1500.0;
  const hGames = Math.trunc(inp.home_games ?? 0);
  const aGames = Math.trunc(inp.away_games ?? 0);
  const hFor = inp.home_cum_for ?? 0.0;
  const hAg = inp.home_cum_against ?? 0.0;
  const aFor = inp.away_cum_for ?? 0.0;
  const aAg = inp.away_cum_against ?? 0.0;

  const hPriorWoba = inp.home_prior_woba ?? lgWoba;
  const aPriorWoba = inp.away_prior_woba ?? lgWoba;
  const hPriorFip = inp.home_prior_fip ?? lgFip;
  const aPriorFip = inp.away_prior_fip ?? lgFip;
  const hPriorEra = inp.home_prior_era;
  const aPriorEra = inp.away_prior_era;

  const eloShift = clamp(((hElo - aElo) / 100.0) * wf.elo_woba_tilt_per_100, -0.018, 0.018);
  const denomWoba = Math.max(lgWoba - wFloor, 0.04);
  const retMlb = wf.offseason_prior_retention ?? 1.0;

  let effHWoba: number;
  if (inp.home_woba_override !== undefined && inp.home_woba_override !== null) {
    effHWoba = inp.home_woba_override;
  } else {
    const hRegWoba = lgWoba + retMlb * (hPriorWoba - lgWoba);
    const hPriorOff = clamp((hRegWoba - wFloor) / denomWoba, 0.55, 1.55);
    const hPostOff = (hFor / envRuns + kappaG * hPriorOff) / (hGames + kappaG);
    effHWoba = clamp(wFloor + denomWoba * hPostOff + 0.5 * eloShift, 0.255, 0.375);
  }

  let effAWoba: number;
  if (inp.away_woba_override !== undefined && inp.away_woba_override !== null) {
    effAWoba = inp.away_woba_override;
  } else {
    const aRegWoba = lgWoba + retMlb * (aPriorWoba - lgWoba);
    const aPriorOff = clamp((aRegWoba - wFloor) / denomWoba, 0.55, 1.55);
    const aPostOff = (aFor / envRuns + kappaG * aPriorOff) / (aGames + kappaG);
    effAWoba = clamp(wFloor + denomWoba * aPostOff - 0.5 * eloShift, 0.255, 0.375);
  }

  const envScale = clamp(envRuns / wf.prior_team_runs, 0.88, 1.14);

  const hRawSpPrior =
    hPriorEra !== undefined && hPriorEra !== null ? 0.65 * hPriorFip + 0.35 * hPriorEra : hPriorFip;
  const aRawSpPrior =
    aPriorEra !== undefined && aPriorEra !== null ? 0.65 * aPriorFip + 0.35 * aPriorEra : aPriorFip;
  const hRegSp = lgFip + retMlb * (hRawSpPrior - lgFip);
  const aRegSp = lgFip + retMlb * (aRawSpPrior - lgFip);
  const hPriorDef = clamp(hRegSp / lgFip, 0.65, 1.45);
  const aPriorDef = clamp(aRegSp / lgFip, 0.65, 1.45);

  const hPostDef = (hAg / envRuns + kappaG * hPriorDef) / (hGames + kappaG);
  const aPostDef = (aAg / envRuns + kappaG * aPriorDef) / (aGames + kappaG);

  const hRotFip = lgFip * hPostDef * envScale;
  const aRotFip = lgFip * aPostDef * envScale;

  let hSpQ: number;
  if (inp.home_sp_fip_override !== undefined && inp.home_sp_fip_override !== null) {
    const hSpIn = inp.home_sp_fip_override;
    const hIpHist = Math.max(0.0, inp.home_sp_ip_hist ?? 95.0);
    const hRotBase = inp.home_rot_fip_override ?? hSpIn;
    hSpQ = (hIpHist * hSpIn + kappaIp * hRotBase) / (hIpHist + kappaIp);
  } else {
    hSpQ = clamp(hRotFip, 2.5, 5.9);
  }

  let aSpQ: number;
  if (inp.away_sp_fip_override !== undefined && inp.away_sp_fip_override !== null) {
    const aSpIn = inp.away_sp_fip_override;
    const aIpHist = Math.max(0.0, inp.away_sp_ip_hist ?? 95.0);
    const aRotBase = inp.away_rot_fip_override ?? aSpIn;
    aSpQ = (aIpHist * aSpIn + kappaIp * aRotBase) / (aIpHist + kappaIp);
  } else {
    aSpQ = clamp(aRotFip, 2.5, 5.9);
  }

  const hB2b = Boolean(inp.home_b2b ?? false);
  const aB2b = Boolean(inp.away_b2b ?? false);
  const h3in4 = Boolean(inp.home_3in4 ?? false);
  const a3in4 = Boolean(inp.away_3in4 ?? false);

  const hBpPen = (hB2b ? wf.b2b_bp_fip_penalty : 0.0) + (h3in4 ? wf.three_in_four_bp_fip_penalty : 0.0);
  const aBpPen = (aB2b ? wf.b2b_bp_fip_penalty : 0.0) + (a3in4 ? wf.three_in_four_bp_fip_penalty : 0.0);

  const hBpFip =
    inp.home_bp_fip_override !== undefined && inp.home_bp_fip_override !== null
      ? inp.home_bp_fip_override
      : clamp(hSpQ + hBpPen, 2.4, 6.2);
  const aBpFip =
    inp.away_bp_fip_override !== undefined && inp.away_bp_fip_override !== null
      ? inp.away_bp_fip_override
      : clamp(aSpQ + aBpPen, 2.4, 6.2);

  const hIpExp = inp.home_is_opener ? 1.2 : clamp(inp.home_sp_exp_ip ?? 5.3, 1.0, 6.8);
  const aIpExp = inp.away_is_opener ? 1.2 : clamp(inp.away_sp_exp_ip ?? 5.3, 1.0, 6.8);

  const neutral = Boolean(inp.neutral_site ?? false);
  const hElev = inp.home_elevation_m ?? 150.0;
  const hDome = Boolean(inp.home_is_dome ?? false);

  let pf: number;
  if (inp.park_weather_mult_override !== undefined && inp.park_weather_mult_override !== null) {
    pf = clamp(inp.park_weather_mult_override, 0.84, 1.32);
  } else if (!neutral && !hDome && hElev >= 1200.0) {
    pf = 1.16;
  } else if (!neutral && !hDome && hElev >= 300.0) {
    pf = 1.025;
  } else if (hDome) {
    pf = 0.99;
  } else {
    pf = 1.0;
  }

  const hPlatoon = clamp(inp.home_platoon_mult ?? 1.0, 0.88, 1.14);
  const aPlatoon = clamp(inp.away_platoon_mult ?? 1.0, 0.88, 1.14);
  const hcaH = neutral ? 1.0 : c.home_scoring_mult;
  const hcaA = neutral ? 1.0 : c.away_scoring_mult;

  const hWobaRatio = clamp((effHWoba - wFloor) / denomWoba, 0.45, 1.85);
  const aWobaRatio = clamp((effAWoba - wFloor) / denomWoba, 0.45, 1.85);

  const hOffMult = hWobaRatio * hPlatoon * pf * hcaH * unearnedMult;
  const aOffMult = aWobaRatio * aPlatoon * pf * hcaA * unearnedMult;

  const aSpF5 = Math.min(5.0, aIpExp);
  const aBpF5 = 5.0 - aSpF5;
  const hSpF5 = Math.min(5.0, hIpExp);
  const hBpF5 = 5.0 - hSpF5;

  const muF5H = clamp(((aSpF5 * aSpQ + aBpF5 * aBpFip) / 9.0) * hOffMult, 0.45, 7.5);
  const muF5A = clamp(((hSpF5 * hSpQ + hBpF5 * hBpFip) / 9.0) * aOffMult, 0.45, 7.5);

  const aSpL4 = Math.max(0.0, aIpExp - 5.0);
  const aBpL4 = Math.max(0.0, 4.0 - aSpL4);
  const hSpL4 = Math.max(0.0, hIpExp - 5.0);
  const hBpL4 = Math.max(0.0, 4.0 - hSpL4);

  const muL4H = clamp(((aSpL4 * aSpQ + aBpL4 * aBpFip) / 9.0) * hOffMult, 0.35, 6.5);
  const muL4A = clamp(((hSpL4 * hSpQ + hBpL4 * hBpFip) / 9.0) * aOffMult, 0.35, 6.5);

  const maxRF5 = 16;
  const maxR9 = 22;
  const maxRFull = 30;

  const pmfF5H = nbPmfExactV60(muF5H, c.r_disp_f5, maxRF5);
  const pmfF5A = nbPmfExactV60(muF5A, c.r_disp_f5, maxRF5);
  const pmfL4H = nbPmfExactV60(muL4H, c.r_disp_late4, maxRF5);
  const pmfL4A = nbPmfExactV60(muL4A, c.r_disp_late4, maxRF5);

  let pHF5 = 0.0;
  let pTF5 = 0.0;
  let pAF5 = 0.0;
  let pOv45F5 = 0.0;
  for (let ih = 0; ih <= maxRF5; ih += 1) {
    const phV = pmfF5H[ih] ?? 0.0;
    for (let ia = 0; ia <= maxRF5; ia += 1) {
      const p = phV * (pmfF5A[ia] ?? 0.0);
      if (ih > ia) pHF5 += p;
      else if (ih === ia) pTF5 += p;
      else pAF5 += p;
      if (ih + ia > 4) pOv45F5 += p;
    }
  }

  const pmf9H = convolve1dExactV60(pmfF5H, pmfL4H, maxR9);
  const pmf9A = convolve1dExactV60(pmfF5A, pmfL4A, maxR9);

  const totalLine = inp.total_line ?? 8.5;
  let pOver9Trunc = 0.0;
  let pTie9 = 0.0;
  for (let ih = 0; ih <= maxR9; ih += 1) {
    const phV = pmf9H[ih] ?? 0.0;
    for (let ia = 0; ia <= maxR9; ia += 1) {
      const p = phV * (pmf9A[ia] ?? 0.0);
      if (ih + ia > totalLine) pOver9Trunc += p;
      if (ih === ia) pTie9 += p;
    }
  }

  const manfredBoost = c.manfred_runner_boost_runs;
  const lamExtA = clamp((hBpFip / 9.0) * aOffMult + manfredBoost, 0.35, 1.85);
  const lamExtH = clamp(
    (aBpFip / 9.0) * hOffMult + manfredBoost * (neutral ? 1.0 : 1.04),
    0.35,
    1.95,
  );

  const maxExtInn = 6;
  const qa = poissonPmfExactV60(lamExtA, maxExtInn);
  const qh = poissonPmfExactV60(lamExtH, maxExtInn);

  let pCont = 0.0;
  let numTiedRuns = 0.0;
  for (let d = 0; d <= maxExtInn; d += 1) {
    const pd = (qa[d] ?? 0.0) * (qh[d] ?? 0.0);
    pCont += pd;
    numTiedRuns += d * pd;
  }
  const pResolve = Math.max(1.0 - pCont, 1e-6);
  const meanTiedRuns = pCont > 1e-6 ? numTiedRuns / Math.max(pCont, 1e-9) : 0.0;

  const sideLen = maxRFull + 1;
  const mFull = new Float64Array(sideLen * sideLen);

  for (let ih = 0; ih <= maxR9; ih += 1) {
    for (let ia = 0; ia <= maxR9; ia += 1) {
      const p9 = (pmf9H[ih] ?? 0.0) * (pmf9A[ia] ?? 0.0);
      if (p9 <= 0.0) continue;
      if (ih !== ia) {
        const fh = Math.min(ih, maxRFull);
        const fa = Math.min(ia, maxRFull);
        const idx = fh * sideLen + fa;
        mFull[idx] = (mFull[idx] ?? 0.0) + p9;
      } else {
        let remMass = p9;
        for (let mStep = 0; mStep < 4; mStep += 1) {
          const stepTieRuns = roundHalfEvenV60(mStep * meanTiedRuns);
          const scaleM = mStep === 3 ? remMass / pResolve : remMass;
          for (let ra = 0; ra <= maxExtInn; ra += 1) {
            const qra = qa[ra] ?? 0.0;
            for (let rh = 0; rh <= maxExtInn; rh += 1) {
              if (ra === rh) continue;
              const pPair = qra * (qh[rh] ?? 0.0);
              let rhEff: number;
              if (rh > ra && !neutral) {
                if (rh === ra + 1) rhEff = ra + 1;
                else if (rh - ra === 2) rhEff = ra + 1;
                else rhEff = Math.min(rh, ra + 2);
              } else {
                rhEff = rh;
              }
              const fh = Math.min(ih + stepTieRuns + rhEff, maxRFull);
              const fa = Math.min(ia + stepTieRuns + ra, maxRFull);
              const idx = fh * sideLen + fa;
              mFull[idx] = (mFull[idx] ?? 0.0) + scaleM * pPair;
            }
          }
          remMass *= pCont;
        }
      }
    }
  }

  let sFull = 0.0;
  for (let i = 0; i < mFull.length; i += 1) sFull += mFull[i] ?? 0.0;
  if (sFull > 0.0) {
    for (let i = 0; i < mFull.length; i += 1) mFull[i] = (mFull[i] ?? 0.0) / sFull;
  }

  let pHomeFull = 0.0;
  let pAwayFull = 0.0;
  let pRlHM15 = 0.0;
  let pRlAP15 = 0.0;
  let pRlHP15 = 0.0;
  let pRlAM15 = 0.0;
  let expHFull = 0.0;
  let expAFull = 0.0;

  for (let ih = 0; ih < sideLen; ih += 1) {
    const base = ih * sideLen;
    for (let ia = 0; ia < sideLen; ia += 1) {
      const p = mFull[base + ia] ?? 0.0;
      if (p <= 0.0) continue;
      expHFull += ih * p;
      expAFull += ia * p;
      if (ih > ia) pHomeFull += p;
      else if (ia > ih) pAwayFull += p;
      if (ih - ia >= 2) pRlHM15 += p;
      else pRlAP15 += p;
      if (ia - ih >= 2) pRlAM15 += p;
      else pRlHP15 += p;
    }
  }

  const pHomeC = clamp(pHomeFull, 1e-6, 1.0 - 1e-6);
  const pAwayC = 1.0 - pHomeC;

  const totPrimary = evalTotalLineFrom2dGridV60(mFull, sideLen, totalLine);
  const totalsByLine: Record<string, TotalLineProjectionV60> = {};
  for (const ln of wf.canonical_total_lines) {
    totalsByLine[ln.toFixed(1)] = evalTotalLineFrom2dGridV60(mFull, sideLen, ln);
  }

  const ep = evaluateBrownianEarlyPayoutV60({
    sport: "mlb",
    pHomeWin: pHomeC,
    pAwayWin: pAwayC,
    triggerLead: epCfg.trigger_lead,
    sigmaMargin: epCfg.sigma_margin,
    effectiveBarrier: epCfg.effective_barrier,
    intraGameStatus: epCfg.intra_game_validation_status,
  });

  return Object.freeze({
    sport: "mlb",
    p_home: pHomeC,
    p_away: pAwayC,
    fair_odds_home: probabilityToFairOdds(clamp(pHomeC, 0.001, 0.999)),
    fair_odds_away: probabilityToFairOdds(clamp(pAwayC, 0.001, 0.999)),
    effective_home_woba: effHWoba,
    effective_away_woba: effAWoba,
    effective_home_sp_fip: hSpQ,
    effective_away_sp_fip: aSpQ,
    park_factor_applied: pf,
    f5: Object.freeze({
      mu_home: muF5H,
      mu_away: muF5A,
      p_home: pHF5,
      p_tie: pTF5,
      p_away: pAF5,
      p_over_4_5: pOv45F5,
      fair_odds_home: probabilityToFairOdds(clamp(pHF5, 0.001, 0.999)),
      fair_odds_tie: probabilityToFairOdds(clamp(pTF5, 0.001, 0.999)),
      fair_odds_away: probabilityToFairOdds(clamp(pAF5, 0.001, 0.999)),
    }),
    full_game: Object.freeze({
      mu_9inn_home: muF5H + muL4H,
      mu_9inn_away: muF5A + muL4A,
      p_extra_innings: pTie9,
      expected_runs_home: expHFull,
      expected_runs_away: expAFull,
      expected_total_runs: expHFull + expAFull,
      p_runline_home_minus_1_5: pRlHM15,
      p_runline_away_plus_1_5: pRlAP15,
      p_runline_home_plus_1_5: pRlHP15,
      p_runline_away_minus_1_5: pRlAM15,
      total_line: totalLine,
      p_over: totPrimary.p_over,
      p_under: totPrimary.p_under,
      p_push: totPrimary.p_push,
      p_over_no_push: totPrimary.p_over_no_push,
      p_over_9inn_truncated: pOver9Trunc,
      extra_innings_over_correction_pp: 100.0 * (totPrimary.p_over_no_push - pOver9Trunc),
      totals_by_line: Object.freeze(totalsByLine),
    }),
    early_payout: ep,
  });
}

export interface NhlWalkforwardInputV60 {
  readonly home_elo?: number;
  readonly away_elo?: number;
  readonly home_cum_for?: number;
  readonly home_cum_against?: number;
  readonly home_games?: number;
  readonly away_cum_for?: number;
  readonly away_cum_against?: number;
  readonly away_games?: number;
  readonly league_team_scoring_env?: number;
  readonly home_b2b?: boolean;
  readonly away_b2b?: boolean;
  readonly home_3in4?: boolean;
  readonly away_3in4?: boolean;
  readonly neutral_site?: boolean;
  readonly home_prior_xgf_5v5?: number;
  readonly home_prior_xga_5v5?: number;
  readonly away_prior_xgf_5v5?: number;
  readonly away_prior_xga_5v5?: number;
  readonly base_goals_60_home_override?: number | null;
  readonly base_goals_60_away_override?: number | null;
  readonly home_pp_pct?: number;
  readonly away_pk_pct?: number;
  readonly away_pp_pct?: number;
  readonly home_pk_pct?: number;
  readonly home_goalie_sv_pct?: number;
  readonly away_goalie_sv_pct?: number;
  readonly home_goalie_confirmed?: boolean;
  readonly away_goalie_confirmed?: boolean;
  readonly total_line?: number;
}

export interface NhlWalkforwardOutlookV60 {
  readonly sport: "nhl";
  readonly goalie_confirmed_home: boolean;
  readonly goalie_confirmed_away: boolean;
  readonly goalie_quality_flag: "ok" | "unconfirmed_goalie_warning";
  readonly lambda60_home: number;
  readonly lambda60_away: number;
  readonly p_home: number;
  readonly p_away: number;
  readonly fair_odds_home: FairOdds;
  readonly fair_odds_away: FairOdds;
  readonly p_home_reg: number;
  readonly p_ot_reg: number;
  readonly p_away_reg: number;
  readonly expected_goals_home_reg: number;
  readonly expected_goals_away_reg: number;
  readonly expected_goals_home_full: number;
  readonly expected_goals_away_full: number;
  readonly expected_total_goals: number;
  readonly ot_conservation_residual: number;
  readonly p_puckline_home_minus_1_5: number;
  readonly p_puckline_away_plus_1_5: number;
  readonly p_puckline_home_plus_1_5: number;
  readonly p_puckline_away_minus_1_5: number;
  readonly total_line: number;
  readonly p_over: number;
  readonly p_under: number;
  readonly p_push: number;
  readonly p_over_no_push: number;
  readonly totals_by_line: Readonly<Record<string, TotalLineProjectionV60>>;
  readonly early_payout: EarlyPayoutOutlookV60;
}

export function projectNhlWalkforwardOutlookV60(
  inp: NhlWalkforwardInputV60,
  artifact: Pick<MultiSportModelArtifactV60, "physics_config" | "early_payout_config">,
): NhlWalkforwardOutlookV60 {
  const c = artifact.physics_config.nhl;
  const wf = c.walkforward;
  const epCfg = artifact.early_payout_config.nhl;

  const kappaG = wf.prior_games;
  const envGoals = Math.max(1.8, inp.league_team_scoring_env ?? wf.prior_team_goals);

  const hElo = inp.home_elo ?? 1500.0;
  const aElo = inp.away_elo ?? 1500.0;
  const hGames = Math.trunc(inp.home_games ?? 0);
  const aGames = Math.trunc(inp.away_games ?? 0);
  const hFor = inp.home_cum_for ?? 0.0;
  const hAg = inp.home_cum_against ?? 0.0;
  const aFor = inp.away_cum_for ?? 0.0;
  const aAg = inp.away_cum_against ?? 0.0;

  const hXgf = inp.home_prior_xgf_5v5 ?? 2.55;
  const hXga = inp.home_prior_xga_5v5 ?? 2.55;
  const aXgf = inp.away_prior_xgf_5v5 ?? 2.55;
  const aXga = inp.away_prior_xga_5v5 ?? 2.55;

  const hPriorOff = clamp((hXgf + 0.45) / 3.0, 0.72, 1.35);
  const hPriorDef = clamp((hXga + 0.45) / 3.0, 0.72, 1.35);
  const aPriorOff = clamp((aXgf + 0.45) / 3.0, 0.72, 1.35);
  const aPriorDef = clamp((aXga + 0.45) / 3.0, 0.72, 1.35);

  const hPostOff = (hFor / envGoals + kappaG * hPriorOff) / (hGames + kappaG);
  const hPostDef = (hAg / envGoals + kappaG * hPriorDef) / (hGames + kappaG);
  const aPostOff = (aFor / envGoals + kappaG * aPriorOff) / (aGames + kappaG);
  const aPostDef = (aAg / envGoals + kappaG * aPriorDef) / (aGames + kappaG);

  const neutral = Boolean(inp.neutral_site ?? false);
  const hB2b = Boolean(inp.home_b2b ?? false);
  const aB2b = Boolean(inp.away_b2b ?? false);
  const h3in4 = Boolean(inp.home_3in4 ?? false);
  const a3in4 = Boolean(inp.away_3in4 ?? false);

  const eloTilt = clamp(((hElo - aElo) / 100.0) * wf.elo_goals60_tilt_per_100, -0.45, 0.45);
  const hIce = neutral ? 0.0 : wf.home_ice_goals_boost;
  const aIce = neutral ? 0.0 : wf.away_ice_goals_offset;
  const h34Pen = h3in4 ? c.three_in_four_goals_penalty : 0.0;
  const a34Pen = a3in4 ? c.three_in_four_goals_penalty : 0.0;

  const base60H =
    inp.base_goals_60_home_override !== undefined && inp.base_goals_60_home_override !== null
      ? inp.base_goals_60_home_override
      : clamp(0.935 * envGoals * hPostOff * aPostDef + hIce + 0.5 * eloTilt - h34Pen, 1.55, 4.85);
  const base60A =
    inp.base_goals_60_away_override !== undefined && inp.base_goals_60_away_override !== null
      ? inp.base_goals_60_away_override
      : clamp(0.935 * envGoals * aPostOff * hPostDef + aIce - 0.5 * eloTilt - a34Pen, 1.55, 4.85);

  const hPp = inp.home_pp_pct ?? 20.5;
  const aPk = inp.away_pk_pct ?? 79.5;
  const aPp = inp.away_pp_pct ?? 20.5;
  const hPk = inp.home_pk_pct ?? 79.5;
  const ppOpp = c.avg_pp_opportunities;

  const stDeltaH = ppOpp * ((hPp - (100.0 - aPk)) / 200.0);
  const stDeltaA = ppOpp * ((aPp - (100.0 - hPk)) / 200.0);

  const lgSv = c.league_sv_pct;
  const hSv = (inp.home_goalie_sv_pct ?? lgSv) - (hB2b ? c.b2b_sv_pct_penalty : 0.0);
  const aSv = (inp.away_goalie_sv_pct ?? lgSv) - (aB2b ? c.b2b_sv_pct_penalty : 0.0);

  const hConf = Boolean(inp.home_goalie_confirmed ?? false);
  const aConf = Boolean(inp.away_goalie_confirmed ?? false);
  const wGh = hConf ? c.confirmed_goalie_weight : c.unconfirmed_goalie_weight;
  const wGa = aConf ? c.confirmed_goalie_weight : c.unconfirmed_goalie_weight;

  const gsaaH = wGh * clamp(hSv - lgSv, -0.035, 0.03) * c.shots_per_game;
  const gsaaA = wGa * clamp(aSv - lgSv, -0.035, 0.03) * c.shots_per_game;

  const lam60H = clamp(base60H + stDeltaH - gsaaA, 1.45, 5.1);
  const lam60A = clamp(base60A + stDeltaA - gsaaH, 1.45, 5.1);

  const maxG = 14;
  const pmf57H = poissonPmfExactV60(0.95 * lam60H, maxG);
  const pmf57A = poissonPmfExactV60(0.95 * lam60A, maxG);
  const q3H = poissonPmfExactV60(0.05 * lam60H, 3);
  const q3A = poissonPmfExactV60(0.05 * lam60A, 3);

  const pEnL1 = c.empty_net_leader_goal_prob;
  const pEnT1 = c.empty_net_puller_tie_prob;
  const pEnL2 = c.empty_net_diff2_leader_prob;
  const pEnT2 = c.empty_net_diff2_puller_prob;
  const pEn2g = c.empty_net_two_goal_prob;

  const nReg = maxG + 4;
  const mReg = new Float64Array(nReg * nReg);

  for (let ih = 0; ih <= maxG; ih += 1) {
    for (let ia = 0; ia <= maxG; ia += 1) {
      const p57 = (pmf57H[ih] ?? 0.0) * (pmf57A[ia] ?? 0.0);
      if (p57 <= 0.0) continue;
      const diff = ih - ia;
      if (diff === 1 || diff === 2) {
        const pL = diff === 2 ? pEnL2 : pEnL1;
        const pT = diff === 2 ? pEnT2 : pEnT1;
        const pStay = Math.max(0.0, 1.0 - pL - pT - pEn2g);
        mReg[(ih + 1) * nReg + ia] = (mReg[(ih + 1) * nReg + ia] ?? 0.0) + p57 * pL;
        mReg[ih * nReg + (ia + 1)] = (mReg[ih * nReg + (ia + 1)] ?? 0.0) + p57 * pT;
        mReg[(ih + 2) * nReg + ia] = (mReg[(ih + 2) * nReg + ia] ?? 0.0) + p57 * (0.65 * pEn2g);
        mReg[(ih + 1) * nReg + (ia + 1)] =
          (mReg[(ih + 1) * nReg + (ia + 1)] ?? 0.0) + p57 * (0.35 * pEn2g);
        mReg[ih * nReg + ia] = (mReg[ih * nReg + ia] ?? 0.0) + p57 * pStay;
      } else if (diff === -1 || diff === -2) {
        const pL = diff === -2 ? pEnL2 : pEnL1;
        const pT = diff === -2 ? pEnT2 : pEnT1;
        const pStay = Math.max(0.0, 1.0 - pL - pT - pEn2g);
        mReg[ih * nReg + (ia + 1)] = (mReg[ih * nReg + (ia + 1)] ?? 0.0) + p57 * pL;
        mReg[(ih + 1) * nReg + ia] = (mReg[(ih + 1) * nReg + ia] ?? 0.0) + p57 * pT;
        mReg[ih * nReg + (ia + 2)] = (mReg[ih * nReg + (ia + 2)] ?? 0.0) + p57 * (0.65 * pEn2g);
        mReg[(ih + 1) * nReg + (ia + 1)] =
          (mReg[(ih + 1) * nReg + (ia + 1)] ?? 0.0) + p57 * (0.35 * pEn2g);
        mReg[ih * nReg + ia] = (mReg[ih * nReg + ia] ?? 0.0) + p57 * pStay;
      } else {
        for (let dh = 0; dh <= 3; dh += 1) {
          for (let da = 0; da <= 3; da += 1) {
            const dst = (ih + dh) * nReg + (ia + da);
            mReg[dst] = (mReg[dst] ?? 0.0) + p57 * (q3H[dh] ?? 0.0) * (q3A[da] ?? 0.0);
          }
        }
      }
    }
  }

  let sReg = 0.0;
  for (let i = 0; i < mReg.length; i += 1) sReg += mReg[i] ?? 0.0;
  for (let i = 0; i < mReg.length; i += 1) mReg[i] = (mReg[i] ?? 0.0) / sReg;

  let pHReg = 0.0;
  let pOtReg = 0.0;
  let pAReg = 0.0;
  let egHReg = 0.0;
  let egAReg = 0.0;
  for (let ih = 0; ih < nReg; ih += 1) {
    const base = ih * nReg;
    for (let ia = 0; ia < nReg; ia += 1) {
      const p = mReg[base + ia] ?? 0.0;
      egHReg += ih * p;
      egAReg += ia * p;
      if (ih > ia) pHReg += p;
      else if (ih === ia) pOtReg += p;
      else pAReg += p;
    }
  }

  const strengthShareH = clamp(
    0.5 + 0.35 * (lam60H / (lam60H + lam60A) - 0.5) + (neutral ? 0.0 : 0.015),
    0.38,
    0.62,
  );

  const nFull = nReg + 1;
  const mFull = new Float64Array(nFull * nFull);
  for (let ih = 0; ih < nReg; ih += 1) {
    for (let ia = 0; ia < nReg; ia += 1) {
      const p = mReg[ih * nReg + ia] ?? 0.0;
      if (p <= 0.0) continue;
      if (ih === ia) {
        const dH = (ih + 1) * nFull + ia;
        const dA = ih * nFull + (ia + 1);
        mFull[dH] = (mFull[dH] ?? 0.0) + p * strengthShareH;
        mFull[dA] = (mFull[dA] ?? 0.0) + p * (1.0 - strengthShareH);
      } else {
        const dS = ih * nFull + ia;
        mFull[dS] = (mFull[dS] ?? 0.0) + p;
      }
    }
  }

  let pHomeMl = 0.0;
  let pAwayMl = 0.0;
  let egHFull = 0.0;
  let egAFull = 0.0;
  let pPlHM15 = 0.0;
  let pPlAP15 = 0.0;
  let pPlHP15 = 0.0;
  let pPlAM15 = 0.0;

  for (let ih = 0; ih < nFull; ih += 1) {
    const base = ih * nFull;
    for (let ia = 0; ia < nFull; ia += 1) {
      const p = mFull[base + ia] ?? 0.0;
      if (p <= 0.0) continue;
      egHFull += ih * p;
      egAFull += ia * p;
      if (ih > ia) pHomeMl += p;
      else if (ia > ih) pAwayMl += p;
      if (ih - ia >= 2) pPlHM15 += p;
      else pPlAP15 += p;
      if (ia - ih >= 2) pPlAM15 += p;
      else pPlHP15 += p;
    }
  }

  const otResidual = Math.abs(egHFull - egHReg + (egAFull - egAReg) - pOtReg);
  const pHomeC = clamp(pHomeMl, 1e-6, 1.0 - 1e-6);
  const pAwayC = 1.0 - pHomeC;

  const totalLine = inp.total_line ?? 6.0;
  const totPrimary = evalTotalLineFrom2dGridV60(mFull, nFull, totalLine);
  const totalsByLine: Record<string, TotalLineProjectionV60> = {};
  for (const ln of wf.canonical_total_lines) {
    totalsByLine[ln.toFixed(1)] = evalTotalLineFrom2dGridV60(mFull, nFull, ln);
  }

  const ep = evaluateNhlEarlyPayoutDpV60({
    lam60Home: lam60H,
    lam60Away: lam60A,
    pHomeFull: pHomeC,
    pAwayFull: pAwayC,
    strengthShareHome: strengthShareH,
    epCfg,
  });

  return Object.freeze({
    sport: "nhl",
    goalie_confirmed_home: hConf,
    goalie_confirmed_away: aConf,
    goalie_quality_flag: hConf && aConf ? "ok" : "unconfirmed_goalie_warning",
    lambda60_home: lam60H,
    lambda60_away: lam60A,
    p_home: pHomeC,
    p_away: pAwayC,
    fair_odds_home: probabilityToFairOdds(clamp(pHomeC, 0.001, 0.999)),
    fair_odds_away: probabilityToFairOdds(clamp(pAwayC, 0.001, 0.999)),
    p_home_reg: pHReg,
    p_ot_reg: pOtReg,
    p_away_reg: pAReg,
    expected_goals_home_reg: egHReg,
    expected_goals_away_reg: egAReg,
    expected_goals_home_full: egHFull,
    expected_goals_away_full: egAFull,
    expected_total_goals: egHFull + egAFull,
    ot_conservation_residual: otResidual,
    p_puckline_home_minus_1_5: pPlHM15,
    p_puckline_away_plus_1_5: pPlAP15,
    p_puckline_home_plus_1_5: pPlHP15,
    p_puckline_away_minus_1_5: pPlAM15,
    total_line: totalLine,
    p_over: totPrimary.p_over,
    p_under: totPrimary.p_under,
    p_push: totPrimary.p_push,
    p_over_no_push: totPrimary.p_over_no_push,
    totals_by_line: Object.freeze(totalsByLine),
    early_payout: ep,
  });
}

export interface NbaWalkforwardInputV60 {
  readonly home_elo?: number;
  readonly away_elo?: number;
  readonly home_cum_for?: number;
  readonly home_cum_against?: number;
  readonly home_games?: number;
  readonly away_cum_for?: number;
  readonly away_cum_against?: number;
  readonly away_games?: number;
  readonly league_team_scoring_env?: number;
  readonly home_b2b?: boolean;
  readonly away_b2b?: boolean;
  readonly home_3in4?: boolean;
  readonly away_3in4?: boolean;
  readonly neutral_site?: boolean;
  readonly home_elevation_m?: number;
  readonly home_prior_ortg?: number;
  readonly home_prior_drtg?: number;
  readonly home_prior_pace?: number;
  readonly away_prior_ortg?: number;
  readonly away_prior_drtg?: number;
  readonly away_prior_pace?: number;
  readonly structural_margin_override?: number | null;
  readonly structural_total_override?: number | null;
  readonly home_injuries_out?: number;
  readonly away_injuries_out?: number;
  readonly home_injuries_questionable?: number;
  readonly away_injuries_questionable?: number;
  readonly home_missing_impact_pts?: number | null;
  readonly away_missing_impact_pts?: number | null;
  readonly home_questionable_impact_pts?: number | null;
  readonly away_questionable_impact_pts?: number | null;
  readonly spread_line_home?: number | null;
  readonly total_line?: number | null;
}

export interface NbaWalkforwardOutlookV60 {
  readonly sport: "nba";
  readonly expected_margin: number;
  readonly expected_total: number;
  readonly sigma_margin_base: number;
  readonly sigma_margin_effective: number;
  readonly injury_margin_delta: number;
  readonly rest_margin_delta: number;
  readonly home_missing_impact_pts: number;
  readonly away_missing_impact_pts: number;
  readonly home_questionable_impact_pts: number;
  readonly away_questionable_impact_pts: number;
  readonly p_home: number;
  readonly p_away: number;
  readonly fair_odds_home: FairOdds;
  readonly fair_odds_away: FairOdds;
  readonly p_overtime: number;
  readonly spread_line_home: number;
  readonly p_spread_home_cover: number;
  readonly p_spread_away_cover: number;
  readonly p_spread_push: number;
  readonly p_spread_home_cover_no_push: number;
  readonly total_line: number;
  readonly p_over: number;
  readonly p_under: number;
  readonly p_push: number;
  readonly p_over_no_push: number;
  readonly totals_by_line: Readonly<Record<string, TotalLineProjectionV60>>;
  readonly early_payout: EarlyPayoutOutlookV60;
}

export function projectNbaWalkforwardOutlookV60(
  inp: NbaWalkforwardInputV60,
  artifact: Pick<MultiSportModelArtifactV60, "physics_config" | "early_payout_config">,
): NbaWalkforwardOutlookV60 {
  const c = artifact.physics_config.nba;
  const wf = c.walkforward;
  const epCfg = artifact.early_payout_config.nba;

  const kappaG = wf.prior_games;
  const priorLgPts = wf.prior_team_pts;
  const envPts = Math.max(95.0, inp.league_team_scoring_env ?? priorLgPts);
  const envRatio = envPts / priorLgPts;

  const hElo = inp.home_elo ?? 1500.0;
  const aElo = inp.away_elo ?? 1500.0;
  const hGames = Math.trunc(inp.home_games ?? 0);
  const aGames = Math.trunc(inp.away_games ?? 0);
  const hFor = inp.home_cum_for ?? 0.0;
  const hAg = inp.home_cum_against ?? 0.0;
  const aFor = inp.away_cum_for ?? 0.0;
  const aAg = inp.away_cum_against ?? 0.0;

  const hOrtg = inp.home_prior_ortg ?? 114.5;
  const hDrtg = inp.home_prior_drtg ?? 114.5;
  const hPace = inp.home_prior_pace ?? 99.5;
  const aOrtg = inp.away_prior_ortg ?? 114.5;
  const aDrtg = inp.away_prior_drtg ?? 114.5;
  const aPace = inp.away_prior_pace ?? 99.5;

  const hPriorOff = priorLgPts + 0.45 * (hOrtg * (hPace / 100.0) - priorLgPts);
  const hPriorDef = priorLgPts + 0.45 * (hDrtg * (hPace / 100.0) - priorLgPts);
  const aPriorOff = priorLgPts + 0.45 * (aOrtg * (aPace / 100.0) - priorLgPts);
  const aPriorDef = priorLgPts + 0.45 * (aDrtg * (aPace / 100.0) - priorLgPts);

  const hOff = (hFor + kappaG * (hPriorOff * envRatio)) / (hGames + kappaG);
  const hDef = (hAg + kappaG * (hPriorDef * envRatio)) / (hGames + kappaG);
  const aOff = (aFor + kappaG * (aPriorOff * envRatio)) / (aGames + kappaG);
  const aDef = (aAg + kappaG * (aPriorDef * envRatio)) / (aGames + kappaG);

  const neutral = Boolean(inp.neutral_site ?? false);
  const hElev = inp.home_elevation_m ?? 150.0;
  const hcaPts = neutral
    ? 0.0
    : wf.hca_base_pts + (hElev >= 1200.0 ? wf.high_altitude_hca_bonus_pts : 0.0);

  let baseMargin: number;
  if (inp.structural_margin_override !== undefined && inp.structural_margin_override !== null) {
    baseMargin = inp.structural_margin_override;
  } else {
    const rateExpH = (hOff * aDef) / envPts;
    const rateExpA = (aOff * hDef) / envPts;
    const rateMargin = rateExpH - rateExpA + hcaPts;
    const eloDiff = hElo - aElo + (neutral ? 0.0 : wf.elo_home_adv);
    const eloMargin = eloDiff * 0.036;
    const wElo = wf.elo_margin_weight;
    baseMargin = wElo * eloMargin + (1.0 - wElo) * rateMargin;
  }

  const baseTotal =
    inp.structural_total_override !== undefined && inp.structural_total_override !== null
      ? inp.structural_total_override
      : (hOff * aDef) / envPts + (aOff * hDef) / envPts;

  const hOut = Math.max(0, Math.trunc(inp.home_injuries_out ?? 0));
  const aOut = Math.max(0, Math.trunc(inp.away_injuries_out ?? 0));
  const hQ = Math.max(0, Math.trunc(inp.home_injuries_questionable ?? 0));
  const aQ = Math.max(0, Math.trunc(inp.away_injuries_questionable ?? 0));

  const hMissPts =
    inp.home_missing_impact_pts !== undefined && inp.home_missing_impact_pts !== null
      ? inp.home_missing_impact_pts
      : hOut > 0
        ? c.injury_out_unit_pts * Math.pow(hOut, c.injury_out_diminishing_power)
        : 0.0;
  const aMissPts =
    inp.away_missing_impact_pts !== undefined && inp.away_missing_impact_pts !== null
      ? inp.away_missing_impact_pts
      : aOut > 0
        ? c.injury_out_unit_pts * Math.pow(aOut, c.injury_out_diminishing_power)
        : 0.0;
  const hDudaPts =
    inp.home_questionable_impact_pts !== undefined && inp.home_questionable_impact_pts !== null
      ? inp.home_questionable_impact_pts
      : hQ > 0
        ? c.injury_duda_unit_pts * Math.pow(hQ, 0.85)
        : 0.0;
  const aDudaPts =
    inp.away_questionable_impact_pts !== undefined && inp.away_questionable_impact_pts !== null
      ? inp.away_questionable_impact_pts
      : aQ > 0
        ? c.injury_duda_unit_pts * Math.pow(aQ, 0.85)
        : 0.0;

  const injMarginDelta = clamp(aMissPts - hMissPts + 0.45 * (aDudaPts - hDudaPts), -14.5, 14.5);

  const hB2b = Boolean(inp.home_b2b ?? false);
  const aB2b = Boolean(inp.away_b2b ?? false);
  const h3in4 = Boolean(inp.home_3in4 ?? false);
  const a3in4 = Boolean(inp.away_3in4 ?? false);

  const restDelta =
    (aB2b ? c.away_b2b_penalty_pts : 0.0) -
    (hB2b ? c.home_b2b_penalty_pts : 0.0) +
    (a3in4 ? c.three_in_four_penalty_pts : 0.0) -
    (h3in4 ? c.three_in_four_penalty_pts : 0.0);

  const expMargin = baseMargin + injMarginDelta + restDelta;
  const b2bCnt = (hB2b ? 1 : 0) + (aB2b ? 1 : 0);
  const expTotal = clamp(
    baseTotal - 0.3 * (hMissPts + aMissPts) - 0.15 * (hDudaPts + aDudaPts) - 0.85 * b2bCnt,
    196.0,
    258.0,
  );

  const sigmaBase = c.sigma_margin_base;
  const injVarExtra =
    0.25 * c.injury_out_var_unit * (hMissPts * hMissPts + aMissPts * aMissPts) +
    0.5 * c.injury_duda_var_unit * (hDudaPts * hDudaPts + aDudaPts * aDudaPts);
  const sigmaEff = Math.sqrt(sigmaBase * sigmaBase + injVarExtra);
  const sigmaTot = c.sigma_total_base;

  const pHome = clamp(normalCdf(expMargin / sigmaEff), 1e-6, 1.0 - 1e-6);
  const pAway = 1.0 - pHome;

  const sigmaReg = 0.945 * sigmaEff;
  const pOt = clamp(
    c.ot_scale *
      (normalCdf((0.5 - expMargin) / sigmaReg) - normalCdf((-0.5 - expMargin) / sigmaReg)),
    0.015,
    0.11,
  );

  const spreadLine =
    inp.spread_line_home !== undefined && inp.spread_line_home !== null
      ? inp.spread_line_home
      : -roundHalfEvenV60(expMargin) - 0.5;
  const totalLine =
    inp.total_line !== undefined && inp.total_line !== null
      ? inp.total_line
      : roundHalfEvenV60(expTotal) + 0.5;

  let pSpOver: number;
  let pSpUnder: number;
  let pSpPush: number;
  let pCoverNoPush: number;

  if (Math.abs(spreadLine - Math.round(spreadLine)) < 1e-9) {
    const spInt = Math.round(spreadLine);
    pSpOver = clamp(normalCdf((expMargin + spInt - 0.5) / sigmaEff), 1e-6, 1.0 - 1e-6);
    pSpUnder = clamp(normalCdf((-expMargin - spInt - 0.5) / sigmaEff), 1e-6, 1.0 - 1e-6);
    pSpPush = Math.max(0.0, 1.0 - pSpOver - pSpUnder);
    pCoverNoPush = clamp(pSpOver / Math.max(pSpOver + pSpUnder, 1e-12), 1e-6, 1.0 - 1e-6);
  } else {
    pSpOver = clamp(normalCdf((expMargin + spreadLine) / sigmaEff), 1e-6, 1.0 - 1e-6);
    pSpUnder = 1.0 - pSpOver;
    pSpPush = 0.0;
    pCoverNoPush = pSpOver;
  }

  const evalNbaTot = (ln: number): TotalLineProjectionV60 => {
    let po: number;
    let pu: number;
    let pp: number;
    let poNp: number;
    if (Math.abs(ln - Math.round(ln)) < 1e-9) {
      const kLn = Math.round(ln);
      po = clamp(1.0 - normalCdf((kLn + 0.5 - expTotal) / sigmaTot), 1e-6, 1.0 - 1e-6);
      pu = clamp(normalCdf((kLn - 0.5 - expTotal) / sigmaTot), 1e-6, 1.0 - 1e-6);
      pp = Math.max(0.0, 1.0 - po - pu);
      poNp = clamp(po / Math.max(po + pu, 1e-12), 1e-6, 1.0 - 1e-6);
    } else {
      po = clamp(normalCdf((expTotal - ln) / sigmaTot), 1e-6, 1.0 - 1e-6);
      pu = 1.0 - po;
      pp = 0.0;
      poNp = po;
    }
    const puNp = 1.0 - poNp;
    return Object.freeze({
      line: ln,
      p_over: po,
      p_under: pu,
      p_push: pp,
      p_over_no_push: poNp,
      p_under_no_push: puNp,
      fair_odds_over: probabilityToFairOdds(clamp(poNp, 0.001, 0.999)),
      fair_odds_under: probabilityToFairOdds(clamp(puNp, 0.001, 0.999)),
    });
  };

  const totPrimary = evalNbaTot(totalLine);
  const totalsByLine: Record<string, TotalLineProjectionV60> = {};
  for (const ln of wf.canonical_total_lines) {
    totalsByLine[ln.toFixed(1)] = evalNbaTot(ln);
  }

  const ep = evaluateBrownianEarlyPayoutV60({
    sport: "nba",
    pHomeWin: pHome,
    pAwayWin: pAway,
    triggerLead: epCfg.trigger_lead,
    sigmaMargin: sigmaEff,
    effectiveBarrier: epCfg.effective_barrier,
    intraGameStatus: epCfg.intra_game_validation_status,
  });

  return Object.freeze({
    sport: "nba",
    expected_margin: expMargin,
    expected_total: expTotal,
    sigma_margin_base: sigmaBase,
    sigma_margin_effective: sigmaEff,
    injury_margin_delta: injMarginDelta,
    rest_margin_delta: restDelta,
    home_missing_impact_pts: hMissPts,
    away_missing_impact_pts: aMissPts,
    home_questionable_impact_pts: hDudaPts,
    away_questionable_impact_pts: aDudaPts,
    p_home: pHome,
    p_away: pAway,
    fair_odds_home: probabilityToFairOdds(clamp(pHome, 0.001, 0.999)),
    fair_odds_away: probabilityToFairOdds(clamp(pAway, 0.001, 0.999)),
    p_overtime: pOt,
    spread_line_home: spreadLine,
    p_spread_home_cover: pSpOver,
    p_spread_away_cover: pSpUnder,
    p_spread_push: pSpPush,
    p_spread_home_cover_no_push: pCoverNoPush,
    total_line: totalLine,
    p_over: totPrimary.p_over,
    p_under: totPrimary.p_under,
    p_push: totPrimary.p_push,
    p_over_no_push: totPrimary.p_over_no_push,
    totals_by_line: Object.freeze(totalsByLine),
    early_payout: ep,
  });
}

export interface NflKeyMarginSolutionV60 {
  readonly theta: number;
  readonly expected_margin: number;
  readonly std_margin: number;
  readonly max_abs_margin: number;
  readonly p_home_3way: number;
  readonly p_tie_3way: number;
  readonly p_away_3way: number;
  readonly pmf: Float64Array;
}

export function solveNflKeyMarginPmfV60(
  expectedMarginTarget: number,
  pTie: number,
  nflCfg: Pick<
    NflPhysicsConfigV60,
    "max_abs_margin" | "positive_margin_kernel_1_to_45" | "margin_quad_concentration"
  >,
): NflKeyMarginSolutionV60 {
  const maxM = Math.trunc(nflCfg.max_abs_margin);
  const kernel = nflCfg.positive_margin_kernel_1_to_45;
  const cQuad = nflCfg.margin_quad_concentration;
  const pt = clamp(pTie, 1e-6, 0.05);
  const nonTie = 1.0 - pt;
  const target = clamp(expectedMarginTarget, -30.0, 30.0);

  const effK = new Float64Array(maxM);
  for (let idx = 0; idx < maxM; idx += 1) {
    const m = idx + 1;
    const kv = kernel[idx] ?? 0.0;
    effK[idx] = cQuad !== 0.0 ? kv * Math.exp(-cQuad * m * m) : kv;
  }

  let lo = -0.65;
  let hi = 0.65;
  for (let it = 0; it < 56; it += 1) {
    const mid = 0.5 * (lo + hi);
    let posS = 0.0;
    let negS = 0.0;
    let num = 0.0;
    for (let idx = 0; idx < maxM; idx += 1) {
      const m = idx + 1;
      const km = effK[idx] ?? 0.0;
      const ep = km * Math.exp(mid * m);
      const en = km * Math.exp(-mid * m);
      posS += ep;
      negS += en;
      num += m * (ep - en);
    }
    const meanMid = (nonTie * num) / Math.max(posS + negS, 1e-30);
    if (meanMid < target) lo = mid;
    else hi = mid;
  }

  const theta = 0.5 * (lo + hi);
  const pmf = new Float64Array(2 * maxM + 1);
  const center = maxM;
  pmf[center] = pt;

  let posS = 0.0;
  let negS = 0.0;
  for (let idx = 0; idx < maxM; idx += 1) {
    const m = idx + 1;
    const km = effK[idx] ?? 0.0;
    posS += km * Math.exp(theta * m);
    negS += km * Math.exp(-theta * m);
  }

  const invDen = nonTie / Math.max(posS + negS, 1e-30);
  let expMargin = 0.0;
  let pHome3w = 0.0;
  let pAway3w = 0.0;
  for (let idx = 0; idx < maxM; idx += 1) {
    const mInt = idx + 1;
    const km = effK[idx] ?? 0.0;
    const pPos = km * Math.exp(theta * mInt) * invDen;
    const pNeg = km * Math.exp(-theta * mInt) * invDen;
    pmf[center + mInt] = pPos;
    pmf[center - mInt] = pNeg;
    pHome3w += pPos;
    pAway3w += pNeg;
    expMargin += mInt * (pPos - pNeg);
  }

  let varM = 0.0;
  for (let i = 0; i < pmf.length; i += 1) {
    const diffM = i - center - expMargin;
    varM += (pmf[i] ?? 0.0) * diffM * diffM;
  }

  return {
    theta,
    expected_margin: expMargin,
    std_margin: Math.sqrt(Math.max(varM, 0.0)),
    max_abs_margin: maxM,
    p_home_3way: pHome3w,
    p_tie_3way: pt,
    p_away_3way: pAway3w,
    pmf,
  };
}

export function evalNflSpreadFromPmfV60(
  pmf: Float64Array,
  maxAbsMargin: number,
  spreadHome: number,
): SpreadLineProjectionV60 {
  let pHCov = 0.0;
  let pACov = 0.0;
  let pPush = 0.0;
  for (let idx = 0; idx < pmf.length; idx += 1) {
    const p = pmf[idx] ?? 0.0;
    if (p <= 0.0) continue;
    const val = idx - maxAbsMargin + spreadHome;
    if (Math.abs(val) < 1e-9) pPush += p;
    else if (val > 0.0) pHCov += p;
    else pACov += p;
  }
  const act = Math.max(pHCov + pACov, 1e-12);
  const phNp = clamp(pHCov / act, 1e-6, 1.0 - 1e-6);
  const paNp = 1.0 - phNp;
  return Object.freeze({
    spread_home: spreadHome,
    p_home_cover: pHCov,
    p_away_cover: pACov,
    p_push: pPush,
    p_home_cover_no_push: phNp,
    p_away_cover_no_push: paNp,
    fair_odds_home_cover: probabilityToFairOdds(clamp(phNp, 0.001, 0.999)),
    fair_odds_away_cover: probabilityToFairOdds(clamp(paNp, 0.001, 0.999)),
  });
}

export function solveNflDiscreteKeyTotalPmfV60(
  expectedTotal: number,
  nflCfg: Pick<NflPhysicsConfigV60, "discrete_totals">,
): { readonly theta: number; readonly expected_total_implied: number; readonly pmf: Float64Array } {
  const spec = nflCfg.discrete_totals;
  const maxK = Math.trunc(spec.max_total_points);
  const baseK = spec.base_kernel_0_to_95;
  const cQuad = spec.quad_concentration;
  const target = clamp(expectedTotal, 26.0, 68.0);

  const logBase = new Float64Array(maxK + 1);
  for (let k = 0; k <= maxK; k += 1) {
    const diff = k - target;
    logBase[k] = Math.log(Math.max(baseK[k] ?? 1e-15, 1e-15)) - cQuad * diff * diff;
  }

  let lo = -0.45;
  let hi = 0.45;
  for (let it = 0; it < 52; it += 1) {
    const mid = 0.5 * (lo + hi);
    let maxLp = -1e30;
    for (let k = 0; k <= maxK; k += 1) {
      const lp = (logBase[k] ?? 0.0) + mid * k;
      if (lp > maxLp) maxLp = lp;
    }
    let sumW = 0.0;
    let sumKW = 0.0;
    for (let k = 0; k <= maxK; k += 1) {
      const w = Math.exp((logBase[k] ?? 0.0) + mid * k - maxLp);
      sumW += w;
      sumKW += k * w;
    }
    const meanMid = sumKW / Math.max(sumW, 1e-30);
    if (meanMid < target) lo = mid;
    else hi = mid;
  }

  const theta = 0.5 * (lo + hi);
  let maxLp = -1e30;
  for (let k = 0; k <= maxK; k += 1) {
    const lp = (logBase[k] ?? 0.0) + theta * k;
    if (lp > maxLp) maxLp = lp;
  }
  const pmf = new Float64Array(maxK + 1);
  let sumW = 0.0;
  for (let k = 0; k <= maxK; k += 1) {
    const w = Math.exp((logBase[k] ?? 0.0) + theta * k - maxLp);
    pmf[k] = w;
    sumW += w;
  }
  const invS = 1.0 / Math.max(sumW, 1e-30);
  let impMean = 0.0;
  for (let k = 0; k <= maxK; k += 1) {
    const p = (pmf[k] ?? 0.0) * invS;
    pmf[k] = p;
    impMean += k * p;
  }

  return {
    theta,
    expected_total_implied: impMean,
    pmf,
  };
}

export function evalNflTotalFromPmfV60(pmf: Float64Array, line: number): TotalLineProjectionV60 {
  let pOver = 0.0;
  let pUnder = 0.0;
  let pPush = 0.0;
  for (let k = 0; k < pmf.length; k += 1) {
    const p = pmf[k] ?? 0.0;
    if (p <= 0.0) continue;
    if (Math.abs(k - line) < 1e-9) pPush += p;
    else if (k > line) pOver += p;
    else pUnder += p;
  }
  const act = Math.max(pOver + pUnder, 1e-12);
  const poNp = clamp(pOver / act, 1e-6, 1.0 - 1e-6);
  const puNp = 1.0 - poNp;
  return Object.freeze({
    line,
    p_over: pOver,
    p_under: pUnder,
    p_push: pPush,
    p_over_no_push: poNp,
    p_under_no_push: puNp,
    fair_odds_over: probabilityToFairOdds(clamp(poNp, 0.001, 0.999)),
    fair_odds_under: probabilityToFairOdds(clamp(puNp, 0.001, 0.999)),
  });
}

export interface NflWalkforwardInputV60 {
  readonly home_elo?: number;
  readonly away_elo?: number;
  readonly home_cum_for?: number;
  readonly home_cum_against?: number;
  readonly home_games?: number;
  readonly away_cum_for?: number;
  readonly away_cum_against?: number;
  readonly away_games?: number;
  readonly league_team_scoring_env?: number;
  readonly home_b2b?: boolean;
  readonly away_b2b?: boolean;
  readonly home_3in4?: boolean;
  readonly away_3in4?: boolean;
  readonly neutral_site?: boolean;
  readonly home_prior_off_pts?: number;
  readonly home_prior_def_pts?: number;
  readonly away_prior_off_pts?: number;
  readonly away_prior_def_pts?: number;
  readonly home_rest_days?: number | null;
  readonly away_rest_days?: number | null;
  readonly is_indoor?: boolean;
  readonly is_turf?: boolean;
  readonly expected_margin_override?: number | null;
  readonly expected_total_override?: number | null;
  readonly p_tie_override?: number | null;
  readonly spread_line_home?: number | null;
  readonly total_line?: number | null;
}

export interface NflWalkforwardOutlookV60 {
  readonly sport: "nfl";
  readonly expected_margin: number;
  readonly std_margin: number;
  readonly expected_total: number;
  readonly p_home: number;
  readonly p_away: number;
  readonly fair_odds_home: FairOdds;
  readonly fair_odds_away: FairOdds;
  readonly nfl_3way: {
    readonly p_home: number;
    readonly p_tie: number;
    readonly p_away: number;
  };
  readonly p_overtime: number;
  readonly key_number_masses: {
    readonly m_3: number;
    readonly m_6: number;
    readonly m_7: number;
    readonly m_10: number;
    readonly m_14: number;
  };
  readonly spread_line_home: number;
  readonly p_spread_home_cover: number;
  readonly p_spread_away_cover: number;
  readonly p_spread_push: number;
  readonly p_spread_home_cover_no_push: number;
  readonly spreads_by_line: Readonly<Record<string, SpreadLineProjectionV60>>;
  readonly total_line: number;
  readonly p_over: number;
  readonly p_under: number;
  readonly p_push: number;
  readonly p_over_no_push: number;
  readonly totals_by_line: Readonly<Record<string, TotalLineProjectionV60>>;
  readonly early_payout: EarlyPayoutOutlookV60;
}

export function projectNflWalkforwardOutlookV60(
  inp: NflWalkforwardInputV60,
  artifact: Pick<MultiSportModelArtifactV60, "physics_config" | "early_payout_config">,
): NflWalkforwardOutlookV60 {
  const c = artifact.physics_config.nfl;
  const wf = c.walkforward;
  const epCfg = artifact.early_payout_config.nfl;

  const kappaG = wf.prior_games;
  const priorLgPts = wf.prior_team_pts;
  const envPts = Math.max(15.0, inp.league_team_scoring_env ?? priorLgPts);
  const envRatio = envPts / priorLgPts;

  const hElo = inp.home_elo ?? 1500.0;
  const aElo = inp.away_elo ?? 1500.0;
  const hGames = Math.trunc(inp.home_games ?? 0);
  const aGames = Math.trunc(inp.away_games ?? 0);
  const hFor = inp.home_cum_for ?? 0.0;
  const hAg = inp.home_cum_against ?? 0.0;
  const aFor = inp.away_cum_for ?? 0.0;
  const aAg = inp.away_cum_against ?? 0.0;

  const hPriorOff = inp.home_prior_off_pts ?? priorLgPts;
  const hPriorDef = inp.home_prior_def_pts ?? priorLgPts;
  const aPriorOff = inp.away_prior_off_pts ?? priorLgPts;
  const aPriorDef = inp.away_prior_def_pts ?? priorLgPts;

  const hOff = (hFor + kappaG * (hPriorOff * envRatio)) / (hGames + kappaG);
  const hDef = (hAg + kappaG * (hPriorDef * envRatio)) / (hGames + kappaG);
  const aOff = (aFor + kappaG * (aPriorOff * envRatio)) / (aGames + kappaG);
  const aDef = (aAg + kappaG * (aPriorDef * envRatio)) / (aGames + kappaG);

  const neutral = Boolean(inp.neutral_site ?? false);
  const hRest = inp.home_rest_days;
  const aRest = inp.away_rest_days;
  const hRestAdj =
    hRest !== undefined && hRest !== null
      ? Math.trunc(hRest) <= 4
        ? -wf.short_week_penalty_pts
        : Math.trunc(hRest) >= 10
          ? wf.bye_week_bonus_pts
          : 0.0
      : 0.0;
  const aRestAdj =
    aRest !== undefined && aRest !== null
      ? Math.trunc(aRest) <= 4
        ? -wf.short_week_penalty_pts
        : Math.trunc(aRest) >= 10
          ? wf.bye_week_bonus_pts
          : 0.0
      : 0.0;

  let expMarginTarget: number;
  if (inp.expected_margin_override !== undefined && inp.expected_margin_override !== null) {
    expMarginTarget = clamp(inp.expected_margin_override, -28.0, 28.0);
  } else {
    const hcaPts = neutral ? 0.0 : wf.hca_base_pts;
    const eloDiff = hElo - aElo + (neutral ? 0.0 : wf.elo_home_adv);
    const eloMargin = eloDiff * wf.elo_to_margin_scale;
    const rateExpH = (hOff * aDef) / envPts;
    const rateExpA = (aOff * hDef) / envPts;
    const rateMargin = rateExpH - rateExpA + hcaPts;
    expMarginTarget = clamp(
      0.55 * eloMargin + 0.45 * rateMargin + (hRestAdj - aRestAdj),
      -28.0,
      28.0,
    );
  }

  const expTotalTarget =
    inp.expected_total_override !== undefined && inp.expected_total_override !== null
      ? clamp(inp.expected_total_override, 28.0, 66.0)
      : clamp((hOff * aDef) / envPts + (aOff * hDef) / envPts, 28.0, 66.0);

  const pTie =
    inp.p_tie_override !== undefined && inp.p_tie_override !== null
      ? clamp(inp.p_tie_override, 1e-6, 0.05)
      : clamp(wf.base_tie_prob * Math.exp(-Math.abs(expMarginTarget) / 10.0), 0.0005, 0.012);

  const solM = solveNflKeyMarginPmfV60(expMarginTarget, pTie, c);
  const nonTieMass = Math.max(solM.p_home_3way + solM.p_away_3way, 1e-12);
  const pHome2w = clamp(solM.p_home_3way / nonTieMass, 1e-6, 1.0 - 1e-6);
  const pAway2w = 1.0 - pHome2w;

  const spreadLine =
    inp.spread_line_home !== undefined && inp.spread_line_home !== null
      ? inp.spread_line_home
      : -3.0;
  const spPrimary = evalNflSpreadFromPmfV60(solM.pmf, solM.max_abs_margin, spreadLine);
  const spreadsByLine: Record<string, SpreadLineProjectionV60> = {};
  for (const ln of wf.canonical_spread_lines) {
    spreadsByLine[ln.toFixed(1)] = evalNflSpreadFromPmfV60(solM.pmf, solM.max_abs_margin, ln);
  }

  const solT = solveNflDiscreteKeyTotalPmfV60(expTotalTarget, c);
  const totalLine = inp.total_line ?? 45.5;
  const totPrimary = evalNflTotalFromPmfV60(solT.pmf, totalLine);
  const totalsByLine: Record<string, TotalLineProjectionV60> = {};
  for (const ln of wf.canonical_total_lines) {
    totalsByLine[ln.toFixed(1)] = evalNflTotalFromPmfV60(solT.pmf, ln);
  }

  const otCal = c.overtime_calibration;
  const xOt = [
    Math.exp(-Math.abs(solM.expected_margin) / 7.0),
    (solT.expected_total_implied - 44.0) / 10.0,
    inp.is_indoor ? 1.0 : 0.0,
    inp.is_turf ? 1.0 : 0.0,
  ];
  let etaOt = otCal.intercept;
  for (let i = 0; i < otCal.coef.length; i += 1) {
    etaOt += (otCal.coef[i] ?? 0.0) * (xOt[i] ?? 0.0);
  }
  const pOt = clamp(sigmoid(etaOt), 0.005, 0.25);

  const center = solM.max_abs_margin;
  const keyMasses = Object.freeze({
    m_3: (solM.pmf[center + 3] ?? 0.0) + (solM.pmf[center - 3] ?? 0.0),
    m_6: (solM.pmf[center + 6] ?? 0.0) + (solM.pmf[center - 6] ?? 0.0),
    m_7: (solM.pmf[center + 7] ?? 0.0) + (solM.pmf[center - 7] ?? 0.0),
    m_10: (solM.pmf[center + 10] ?? 0.0) + (solM.pmf[center - 10] ?? 0.0),
    m_14: (solM.pmf[center + 14] ?? 0.0) + (solM.pmf[center - 14] ?? 0.0),
  });

  const ep = evaluateBrownianEarlyPayoutV60({
    sport: "nfl",
    pHomeWin: pHome2w,
    pAwayWin: pAway2w,
    triggerLead: epCfg.trigger_lead,
    sigmaMargin: epCfg.sigma_margin,
    effectiveBarrier: epCfg.effective_barrier,
    intraGameStatus: epCfg.intra_game_validation_status,
  });

  return Object.freeze({
    sport: "nfl",
    expected_margin: solM.expected_margin,
    std_margin: solM.std_margin,
    expected_total: solT.expected_total_implied,
    p_home: pHome2w,
    p_away: pAway2w,
    fair_odds_home: probabilityToFairOdds(clamp(pHome2w, 0.001, 0.999)),
    fair_odds_away: probabilityToFairOdds(clamp(pAway2w, 0.001, 0.999)),
    nfl_3way: Object.freeze({
      p_home: solM.p_home_3way,
      p_tie: solM.p_tie_3way,
      p_away: solM.p_away_3way,
    }),
    p_overtime: pOt,
    key_number_masses: keyMasses,
    spread_line_home: spreadLine,
    p_spread_home_cover: spPrimary.p_home_cover,
    p_spread_away_cover: spPrimary.p_away_cover,
    p_spread_push: spPrimary.p_push,
    p_spread_home_cover_no_push: spPrimary.p_home_cover_no_push,
    spreads_by_line: Object.freeze(spreadsByLine),
    total_line: totalLine,
    p_over: totPrimary.p_over,
    p_under: totPrimary.p_under,
    p_push: totPrimary.p_push,
    p_over_no_push: totPrimary.p_over_no_push,
    totals_by_line: Object.freeze(totalsByLine),
    early_payout: ep,
  });
}

export type MultiSportWalkforwardOutlookV60 =
  | MlbWalkforwardOutlookV60
  | NhlWalkforwardOutlookV60
  | NbaWalkforwardOutlookV60
  | NflWalkforwardOutlookV60;

function daysBetweenIsoDatesV60(d1: string, d2: string): number {
  const t1 = Date.parse(`${d1.slice(0, 10)}T00:00:00Z`);
  const t2 = Date.parse(`${d2.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return 99;
  return Math.round((t2 - t1) / 86_400_000);
}

export function resolveMultiSportFranchiseCodeV60(
  sport: MultiSportLeagueV60,
  rawTeam: string,
  artifact: Pick<MultiSportModelArtifactV60, "team_slug_aliases">,
): string {
  let clean = rawTeam.trim().toLowerCase();
  const dblIdx = clean.indexOf("::");
  if (dblIdx >= 0) clean = clean.slice(dblIdx + 2);
  const dotIdx = clean.indexOf(".");
  if (dotIdx >= 0) clean = clean.slice(dotIdx + 1);
  clean = clean.replace(/[^a-z0-9_-]+/g, "");
  const mapped = artifact.team_slug_aliases[sport]?.[clean];
  if (!mapped) {
    throw new Error(`Franquicia no mapeada en ${sport}: '${rawTeam}' (clean='${clean}')`);
  }
  return mapped;
}

export function projectMultiSportMatchupFromStateV60(params: {
  readonly sport: MultiSportLeagueV60;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly gameDate: string;
  readonly neutralSite?: boolean;
  readonly totalLine?: number;
  readonly spreadLineHome?: number;
  readonly artifact: MultiSportModelArtifactV60;
}): MultiSportWalkforwardOutlookV60 {
  const { sport, artifact } = params;
  const stMap = artifact.teams_post_walkforward_state_2026;
  const lgEnvMap = artifact.league_environments_2026;
  if (!stMap || !lgEnvMap) {
    throw new Error("MultiSportModelArtifactV60 carece de teams_post_walkforward_state_2026");
  }

  const hCode = resolveMultiSportFranchiseCodeV60(sport, params.homeTeam, artifact);
  const aCode = resolveMultiSportFranchiseCodeV60(sport, params.awayTeam, artifact);
  const hSt = stMap[`${sport}::${hCode}`];
  const aSt = stMap[`${sport}::${aCode}`];
  if (!hSt || !aSt) {
    throw new Error(`Estado causal no encontrado para ${sport}: ${hCode} vs ${aCode}`);
  }

  const lgEnv = lgEnvMap[sport].shrunk_team_scoring_env;
  const gDate = params.gameDate.slice(0, 10);

  const hRest =
    hSt.last_game_date !== null && hSt.last_game_date < gDate
      ? daysBetweenIsoDatesV60(hSt.last_game_date, gDate)
      : null;
  const aRest =
    aSt.last_game_date !== null && aSt.last_game_date < gDate
      ? daysBetweenIsoDatesV60(aSt.last_game_date, gDate)
      : null;
  const hB2b = hRest === 1;
  const aB2b = aRest === 1;
  const h3in4 =
    hSt.prev_game_date !== null &&
    hSt.prev_game_date < gDate &&
    daysBetweenIsoDatesV60(hSt.prev_game_date, gDate) <= 3;
  const a3in4 =
    aSt.prev_game_date !== null &&
    aSt.prev_game_date < gDate &&
    daysBetweenIsoDatesV60(aSt.prev_game_date, gDate) <= 3;

  const common = {
    home_elo: hSt.elo,
    away_elo: aSt.elo,
    home_cum_for: hSt.cum_for,
    home_cum_against: hSt.cum_against,
    home_games: hSt.games_played,
    away_cum_for: aSt.cum_for,
    away_cum_against: aSt.cum_against,
    away_games: aSt.games_played,
    league_team_scoring_env: lgEnv,
    home_b2b: hB2b,
    away_b2b: aB2b,
    home_3in4: h3in4,
    away_3in4: a3in4,
    neutral_site: params.neutralSite ?? false,
    home_elevation_m: hSt.elevation_m,
    home_is_dome: hSt.is_dome,
  };

  const hPr = hSt.structural_priors;
  const aPr = aSt.structural_priors;

  if (sport === "mlb") {
    return projectMlbWalkforwardOutlookV60(
      {
        ...common,
        home_prior_woba: hPr["woba"],
        away_prior_woba: aPr["woba"],
        home_prior_fip: hPr["fip"],
        away_prior_fip: aPr["fip"],
        home_prior_era: hPr["era"],
        away_prior_era: aPr["era"],
        total_line: params.totalLine,
      },
      artifact,
    );
  }

  if (sport === "nhl") {
    return projectNhlWalkforwardOutlookV60(
      {
        ...common,
        home_prior_xgf_5v5: hPr["xgf_5v5"],
        home_prior_xga_5v5: hPr["xga_5v5"],
        away_prior_xgf_5v5: aPr["xgf_5v5"],
        away_prior_xga_5v5: aPr["xga_5v5"],
        home_goalie_sv_pct: hPr["sv_pct"],
        away_goalie_sv_pct: aPr["sv_pct"],
        home_goalie_confirmed: false,
        away_goalie_confirmed: false,
        total_line: params.totalLine,
      },
      artifact,
    );
  }

  if (sport === "nba") {
    const hInj = artifact.nba_active_injuries_2026?.[hCode] ?? { baja_count: 0, duda_count: 0 };
    const aInj = artifact.nba_active_injuries_2026?.[aCode] ?? { baja_count: 0, duda_count: 0 };
    return projectNbaWalkforwardOutlookV60(
      {
        ...common,
        home_prior_ortg: hPr["ortg"],
        home_prior_drtg: hPr["drtg"],
        home_prior_pace: hPr["pace"],
        away_prior_ortg: aPr["ortg"],
        away_prior_drtg: aPr["drtg"],
        away_prior_pace: aPr["pace"],
        home_injuries_out: hInj.baja_count,
        away_injuries_out: aInj.baja_count,
        home_injuries_questionable: hInj.duda_count,
        away_injuries_questionable: aInj.duda_count,
        spread_line_home: params.spreadLineHome,
        total_line: params.totalLine,
      },
      artifact,
    );
  }

  return projectNflWalkforwardOutlookV60(
    {
      ...common,
      home_prior_off_pts: hPr["prior_off_pts"],
      home_prior_def_pts: hPr["prior_def_pts"],
      away_prior_off_pts: aPr["prior_off_pts"],
      away_prior_def_pts: aPr["prior_def_pts"],
      home_rest_days: hRest,
      away_rest_days: aRest,
      is_indoor: hSt.is_dome,
      is_turf: hSt.is_dome,
      spread_line_home: params.spreadLineHome,
      total_line: params.totalLine,
    },
    artifact,
  );
}
