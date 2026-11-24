import { parseStrictFiniteNumber } from "@pitchlab/contracts";
import { probabilityToFairOdds, type FairOdds } from "@pitchlab/spacetime";
import {
  buildSoccerMicroMatchOutlookV5,
  buildUnifiedMatchIntelligenceV6,
  calibratePlayableVennAbersLogitV60,
  computeConditionalBookingPointsV6,
  DEFAULT_SOCCER_V60_MAX_GOALS,
  deriveCoherentSoccerMarketsV60,
  evaluateBrownianEarlyPayoutV60,
  evaluateGoalkeeperSavesLinkedSgpV6,
  evaluateNhlEarlyPayoutDpV60,
  evaluatePlayerLinkedSgpV5,
  evaluateSoccerEarlyPayoutAndInPlay,
  evaluateStudentTSameGameParlayV5,
  evalNflSpreadFromPmfV60,
  evalNflTotalFromPmfV60,
  nbMarginalPmfV60,
  PLAYABLE_ODDS_MAX_V60,
  PLAYABLE_ODDS_MIN_V60,
  projectMlbWalkforwardOutlookV60,
  projectMultiSportMatchupFromStateV60,
  projectNbaWalkforwardOutlookV60,
  projectNflWalkforwardOutlookV60,
  projectNhlWalkforwardOutlookV60,
  projectSoccer57MatchV60,
  recalibrateSoccer57PrekickoffV60,
  resolveOfficialPriorV6,
  solveDiagonalScoreMatrix4ParamV60,
  solveNflDiscreteKeyTotalPmfV60,
  solveNflKeyMarginPmfV60,
  type CoherentSoccerMarketsV60,
  type CompetitionDisciplinaryPriorV6,
  type CompetitionSpecV60,
  type CompetitionStatusV60,
  type ConditionalBookingPointsResultV6,
  type ConfederationGroupV60,
  type CoupledShotPositionMetricSpecV6,
  type CoupledShotPositionSpecV6,
  type EarlyPayoutOutlookV60,
  type EpistemicConformalArtifactV51,
  type GoalkeeperLinkedMatchOutcomeV6,
  type GoalkeeperSavesLinkedSgpInputV6,
  type InPlayEarlyPayoutArtifactV5,
  type LiveFeedbackModelArtifactV52,
  type LogitSpaceMonotoneSplineSpecV6,
  type MicroFeatureVectorInputV4,
  type MultiSportLeagueV60,
  type MultiSportModelArtifactV60,
  type MultiSportWalkforwardOutlookV60,
  type NflKeyMarginSolutionV60,
  type OfficialsFreezeModelArtifactV6,
  type PostWalkforwardTeamStateV60,
  type ProjectSoccer57MatchInputV60,
  type PropsV6ModelArtifact,
  type ResolvedOfficialPriorV6,
  type SgpCopulaArtifactV5,
  type SgpLegInput,
  type Soccer57MatchOutlookV60,
  type Soccer57ModelArtifactV60,
  type Soccer57PrekickoffRecalibratedOutlookV60,
  type SoccerEarlyPayoutAndInPlayResult,
  type SoccerMicroMatchOutlookV5,
  type SoccerMicroMetricKey,
  type SoccerMicroModelArtifactV5,
  type SpreadLineProjectionV60,
  type TotalLineProjectionV60,
  type UnifiedArtifactsBundleV6,
  type UnifiedMatchCanonicalInputV6,
  type UnifiedMatchIntelligenceV6,
  type UsPropMetricSpecV6,
  type UsPropsSportV6,
  type UsSportPropsConfigV6,
  type V51OfficialEntryV6,
  type VennAbersPlayableEvaluationV60,
} from "@pitchlab/spacetime/v6";
import type { SgpCopulaAuditView } from "@pitchlab/ui/types";
import { readSpacetimeDataJson, teamScore } from "./spacetime";

interface RawCandidateRegistryJson {
  readonly schema_version: string;
  readonly suite_codename: string;
  readonly suite_version: string;
  readonly status: string;
  readonly production_activated: boolean;
  readonly holdout_cut_utc: string;
  readonly holdout_window_protected: readonly string[];
  readonly holdout_sealed_untouched: boolean;
  readonly n_active_v6_0_candidate_artifacts: number;
  readonly active_v6_0_artifacts: readonly { readonly id: string }[];
}

type RawEpistemicArtifactJson = Omit<EpistemicConformalArtifactV51, "status"> & {
  readonly status: string;
};

type RawInplayArtifactJson = Omit<InPlayEarlyPayoutArtifactV5, "status" | "soccer"> & {
  readonly status: string;
  readonly soccer: Omit<InPlayEarlyPayoutArtifactV5["soccer"], "minute_bucket_weights_6"> & {
    readonly minute_bucket_weights_6: readonly number[];
  };
};

type RawMicroArtifactJson = Omit<SoccerMicroModelArtifactV5, "status"> & {
  readonly status: string;
};

type RawSgpSportSpecJson = Omit<SgpCopulaArtifactV5["sports"]["soccer"], "copula_family"> & {
  readonly copula_family: string;
};

type RawSgpArtifactJson = Omit<SgpCopulaArtifactV5, "status" | "sports"> & {
  readonly status: string;
  readonly default_player_linked_dc_rho: number;
  readonly sports: {
    readonly soccer: RawSgpSportSpecJson;
    readonly nfl: RawSgpSportSpecJson;
  };
};

type RawLiveFeedbackArtifactJson = Omit<LiveFeedbackModelArtifactV52, "status"> & {
  readonly status: string;
};

type RawSoccer57CompetitionJson = Omit<
  CompetitionSpecV60,
  "confederation_group" | "competition_status"
> & {
  readonly confederation_group: string;
  readonly competition_status: string;
};

type RawSoccer57ArtifactJson = Omit<
  Soccer57ModelArtifactV60,
  "status" | "holdout_window_protected" | "competitions"
> & {
  readonly status: string;
  readonly holdout_window_protected: readonly string[];
  readonly competitions: Record<string, RawSoccer57CompetitionJson>;
};

type RawPostWalkforwardTeamStateJson = Omit<
  PostWalkforwardTeamStateV60,
  "sport" | "structural_priors"
> & {
  readonly sport: string;
  readonly structural_priors: unknown;
};

type RawMultisportArtifactJson = Omit<
  MultiSportModelArtifactV60,
  "status" | "team_slug_aliases" | "teams_post_walkforward_state_2026"
> & {
  readonly status: string;
  readonly team_slug_aliases: {
    readonly mlb: unknown;
    readonly nhl: unknown;
    readonly nba: unknown;
    readonly nfl: unknown;
  };
  readonly teams_post_walkforward_state_2026: Record<string, RawPostWalkforwardTeamStateJson>;
};

type RawOfficialsArtifactJson = Omit<
  OfficialsFreezeModelArtifactV6,
  "status" | "holdout_window_protected" | "confederation_priors" | "alias_to_v5_1_key"
> & {
  readonly status: string;
  readonly holdout_window_protected: readonly string[];
  readonly confederation_priors: Record<string, unknown>;
  readonly alias_to_v5_1_key: unknown;
};

type RawPropsArtifactJson = Omit<
  PropsV6ModelArtifact,
  "status" | "coupled_shots_v6" | "goalkeeper_saves_v6" | "us_props_v6"
> & {
  readonly status: string;
  readonly coupled_shots_v6: Omit<
    PropsV6ModelArtifact["coupled_shots_v6"],
    "positions" | "multi_line_logit_splines"
  > & {
    readonly positions: Record<
      string,
      {
        readonly mean_starter_minutes: number;
        readonly metrics: { readonly shots: unknown; readonly shots_on_target: unknown };
      }
    >;
    readonly multi_line_logit_splines: { readonly shots: unknown; readonly shots_on_target: unknown };
  };
  readonly goalkeeper_saves_v6: Omit<
    PropsV6ModelArtifact["goalkeeper_saves_v6"],
    "multi_line_logit_splines"
  > & {
    readonly multi_line_logit_splines: unknown;
  };
  readonly us_props_v6: Record<UsPropsSportV6, unknown>;
};

const FILE_CANDIDATE_REGISTRY = "candidate_registry_v6_0.json";
const FILE_EPISTEMIC_CONFORMAL = "model_epistemic_conformal_v5_1_candidate.json";
const FILE_INPLAY_EARLY_PAYOUT = "model_inplay_early_payout_v5_0_candidate.json";
const FILE_MULTISPORT_V6 = "model_multisport_v6_0_candidate.json";
const FILE_OFFICIALS_V6 = "model_officials_freeze_v6_0_candidate.json";
const FILE_PROPS_V6 = "model_props_v6_0_candidate.json";
const FILE_SOCCER_57_V6 = "model_soccer_57_v6_0_candidate.json";
const FILE_SOCCER_MICRO_V5 = "model_soccer_micro_v5_0_candidate.json";
const FILE_LIVE_FEEDBACK_V52 = "model_v5_2_live_feedback_candidate.json";
const FILE_SGP_COPULA_V5 = "sgp_copula_v5_0_candidate.json";

export {
  PLAYABLE_ODDS_MAX_V60,
  PLAYABLE_ODDS_MIN_V60,
  type CoherentSoccerMarketsV60,
  type CompetitionDisciplinaryPriorV6,
  type CompetitionSpecV60,
  type CompetitionStatusV60,
  type ConditionalBookingPointsResultV6,
  type ConfederationGroupV60,
  type EarlyPayoutOutlookV60,
  type GoalkeeperLinkedMatchOutcomeV6,
  type GoalkeeperSavesLinkedSgpInputV6,
  type LiveFeedbackModelArtifactV52,
  type MultiSportLeagueV60,
  type MultiSportModelArtifactV60,
  type MultiSportWalkforwardOutlookV60,
  type OfficialsFreezeModelArtifactV6,
  type PropsV6ModelArtifact,
  type ResolvedOfficialPriorV6,
  type SgpLegInput,
  type Soccer57MatchOutlookV60,
  type Soccer57ModelArtifactV60,
  type Soccer57PrekickoffRecalibratedOutlookV60,
  type SoccerMicroMatchOutlookV5,
  type SpreadLineProjectionV60,
  type TotalLineProjectionV60,
  type UnifiedArtifactsBundleV6,
  type UnifiedMatchCanonicalInputV6,
  type UnifiedMatchIntelligenceV6,
  type VennAbersPlayableEvaluationV60,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toArtifactStatus(raw: string): "candidate" | "production" {
  return raw === "production" ? "production" : "candidate";
}

function toTuple2(raw: readonly string[]): readonly [string, string] {
  return [raw[0] ?? "", raw[1] ?? ""];
}

function toConfederationGroup(raw: string): ConfederationGroupV60 {
  if (
    raw === "UEFA_TOP" ||
    raw === "UEFA_SECOND_AND_CUPS" ||
    raw === "CONMEBOL_LEAGUE_AND_CUPS" ||
    raw === "CONCACAF_AND_MX" ||
    raw === "AFC_CAF_EXPANSION" ||
    raw === "INTERNATIONAL_NATIONAL_TEAMS"
  ) {
    return raw;
  }
  return "INTERNATIONAL_NATIONAL_TEAMS";
}

function toCompetitionStatus(raw: string): CompetitionStatusV60 {
  return raw === "causal_walk_forward_2026_active"
    ? "causal_walk_forward_2026_active"
    : "confederation_prior_zero_2026_games";
}

function isMultiSportLeagueV60(raw: string): raw is MultiSportLeagueV60 {
  return raw === "mlb" || raw === "nhl" || raw === "nba" || raw === "nfl";
}

function narrowNumberArray(raw: unknown): readonly number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const item of raw) {
    const parsed = parseStrictFiniteNumber(item);
    if (parsed !== null) out.push(parsed);
  }
  return out;
}

function narrowStringRecord(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isRecord(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function narrowNumberRecord(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isRecord(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    const parsed = parseStrictFiniteNumber(v);
    if (parsed !== null) out[k] = parsed;
  }
  return out;
}

function narrowSplineMap(raw: unknown): Record<string, LogitSpaceMonotoneSplineSpecV6> {
  const out: Record<string, LogitSpaceMonotoneSplineSpecV6> = {};
  if (!isRecord(raw)) return out;
  for (const [lineKey, val] of Object.entries(raw)) {
    if (!isRecord(val)) continue;
    const etaKnots = narrowNumberArray(val.eta_knots);
    const zetaKnots = narrowNumberArray(val.zeta_knots);
    const nVal = parseStrictFiniteNumber(val.n_val_2018_2019);
    out[lineKey] = {
      eta_knots: etaKnots,
      zeta_knots: zetaKnots,
      ...(typeof val.calibration_source === "string"
        ? { calibration_source: val.calibration_source }
        : {}),
      ...(nVal !== null ? { n_val_2018_2019: nVal } : {}),
    };
  }
  return out;
}

function narrowPositionMetricSpec(raw: unknown): CoupledShotPositionMetricSpecV6 {
  if (!isRecord(raw)) {
    return {
      prior_rate_per90: 1.0,
      prior_beta_90: 4.5,
      phi_dispersion: 5.0,
      fresh_legs_sub_multiplier: 1.1,
    };
  }
  return {
    prior_rate_per90: parseStrictFiniteNumber(raw.prior_rate_per90) ?? 1.0,
    prior_beta_90: parseStrictFiniteNumber(raw.prior_beta_90) ?? 4.5,
    phi_dispersion: parseStrictFiniteNumber(raw.phi_dispersion) ?? 5.0,
    fresh_legs_sub_multiplier: parseStrictFiniteNumber(raw.fresh_legs_sub_multiplier) ?? 1.1,
  };
}

function narrowUsPropMetricSpec(raw: unknown): UsPropMetricSpecV6 | null {
  if (!isRecord(raw)) return null;
  const priorMean = parseStrictFiniteNumber(raw.prior_mean);
  const priorGames = parseStrictFiniteNumber(raw.prior_games);
  const canonicalLine = parseStrictFiniteNumber(raw.canonical_line);
  if (priorMean === null || priorGames === null || canonicalLine === null) return null;
  const family: "negbin" | "normal_overdispersed" =
    raw.family === "negbin" ? "negbin" : "normal_overdispersed";
  const anchorMinutes = parseStrictFiniteNumber(raw.anchor_minutes);
  const rDispersion = parseStrictFiniteNumber(raw.r_dispersion);
  const minSd = parseStrictFiniteNumber(raw.min_sd);
  const varMeanRatio = parseStrictFiniteNumber(raw.var_mean_ratio);
  const cvSd = parseStrictFiniteNumber(raw.cv_sd);
  return {
    family,
    prior_mean: priorMean,
    prior_games: priorGames,
    canonical_line: canonicalLine,
    ...(anchorMinutes !== null ? { anchor_minutes: anchorMinutes } : {}),
    ...(rDispersion !== null ? { r_dispersion: rDispersion } : {}),
    ...(minSd !== null ? { min_sd: minSd } : {}),
    ...(varMeanRatio !== null ? { var_mean_ratio: varMeanRatio } : {}),
    ...(cvSd !== null ? { cv_sd: cvSd } : {}),
  };
}

function narrowUsPropsSportConfig(raw: unknown): UsSportPropsConfigV6 {
  if (!isRecord(raw)) {
    return { min_guard_minutes: 0, roles: {} };
  }
  const minGuard = parseStrictFiniteNumber(raw.min_guard_minutes) ?? 0;
  const roles: Record<string, Readonly<Record<string, UsPropMetricSpecV6>>> = {};
  if (isRecord(raw.roles)) {
    for (const [roleKey, roleMetricsRaw] of Object.entries(raw.roles)) {
      if (!isRecord(roleMetricsRaw)) continue;
      const metrics: Record<string, UsPropMetricSpecV6> = {};
      for (const [metricKey, metricRaw] of Object.entries(roleMetricsRaw)) {
        const spec = narrowUsPropMetricSpec(metricRaw);
        if (spec) metrics[metricKey] = spec;
      }
      roles[roleKey] = metrics;
    }
  }
  return { min_guard_minutes: minGuard, roles };
}

function buildSoccer57Artifact(): Soccer57ModelArtifactV60 {
  const soccer57ArtifactJson = readSpacetimeDataJson<RawSoccer57ArtifactJson>(FILE_SOCCER_57_V6);
  const competitions: Record<string, CompetitionSpecV60> = {};
  for (const [leagueKey, rawComp] of Object.entries(soccer57ArtifactJson.competitions)) {
    competitions[leagueKey] = {
      confederation_group: toConfederationGroup(rawComp.confederation_group),
      is_cup: rawComp.is_cup,
      pre2025_goal_prior: rawComp.pre2025_goal_prior,
      confederation_goal_prior: rawComp.confederation_goal_prior,
      rho_prior: rawComp.rho_prior,
      dispersion_r: rawComp.dispersion_r,
      games_2026: rawComp.games_2026,
      mean_raw_goals_2026: rawComp.mean_raw_goals_2026,
      ewm_goals_2026: rawComp.ewm_goals_2026,
      causal_env_goals_final: rawComp.causal_env_goals_final,
      competition_status: toCompetitionStatus(rawComp.competition_status),
    };
  }
  return {
    schema_version: soccer57ArtifactJson.schema_version,
    codename: soccer57ArtifactJson.codename,
    version: soccer57ArtifactJson.version,
    status: toArtifactStatus(soccer57ArtifactJson.status),
    production_activated: soccer57ArtifactJson.production_activated,
    holdout_cut_utc: soccer57ArtifactJson.holdout_cut_utc,
    holdout_window_protected: toTuple2(soccer57ArtifactJson.holdout_window_protected),
    holdout_sealed_untouched: soccer57ArtifactJson.holdout_sealed_untouched,
    hyperparameter_tuning_on_holdout: soccer57ArtifactJson.hyperparameter_tuning_on_holdout,
    non_football_leagues_excluded: soccer57ArtifactJson.non_football_leagues_excluded,
    total_platform_leagues: soccer57ArtifactJson.total_platform_leagues,
    total_football_competitions: soccer57ArtifactJson.total_football_competitions,
    confederation_groups: soccer57ArtifactJson.confederation_groups,
    confederation_priors: soccer57ArtifactJson.confederation_priors,
    prekickoff_recalibration: soccer57ArtifactJson.prekickoff_recalibration,
    venn_abers_playable_calibrator: soccer57ArtifactJson.venn_abers_playable_calibrator,
    competitions,
  };
}

function buildMultisportArtifact(): MultiSportModelArtifactV60 {
  const multisportArtifactJson =
    readSpacetimeDataJson<RawMultisportArtifactJson>(FILE_MULTISPORT_V6);
  const teamsState: Record<string, PostWalkforwardTeamStateV60> = {};
  for (const [teamKey, rawEntry] of Object.entries(
    multisportArtifactJson.teams_post_walkforward_state_2026,
  )) {
    if (!isMultiSportLeagueV60(rawEntry.sport)) continue;
    teamsState[teamKey] = {
      sport: rawEntry.sport,
      team_key: rawEntry.team_key,
      team_name: rawEntry.team_name,
      elevation_m: rawEntry.elevation_m,
      is_dome: rawEntry.is_dome,
      elo: rawEntry.elo,
      games_played: rawEntry.games_played,
      cum_for: rawEntry.cum_for,
      cum_against: rawEntry.cum_against,
      last_game_date: rawEntry.last_game_date,
      prev_game_date: rawEntry.prev_game_date,
      structural_priors: narrowNumberRecord(rawEntry.structural_priors),
    };
  }

  const nbaInjuries: Record<
    string,
    {
      readonly baja_count: number;
      readonly duda_count: number;
      readonly missing_impact_pts: number;
      readonly questionable_impact_pts: number;
    }
  > = {};
  for (const [code, entry] of Object.entries(
    multisportArtifactJson.nba_active_injuries_2026 ?? {},
  )) {
    nbaInjuries[code] = {
      baja_count: entry.baja_count,
      duda_count: entry.duda_count,
      missing_impact_pts: entry.missing_impact_pts,
      questionable_impact_pts: entry.questionable_impact_pts,
    };
  }

  return {
    schema_version: multisportArtifactJson.schema_version,
    codename: multisportArtifactJson.codename,
    version: multisportArtifactJson.version,
    status: toArtifactStatus(multisportArtifactJson.status),
    production_activated: multisportArtifactJson.production_activated,
    holdout_cut_utc: multisportArtifactJson.holdout_cut_utc,
    holdout_sealed_untouched: multisportArtifactJson.holdout_sealed_untouched,
    hyperparameter_tuning_on_holdout: multisportArtifactJson.hyperparameter_tuning_on_holdout,
    validation_status: multisportArtifactJson.validation_status,
    physics_config: multisportArtifactJson.physics_config,
    early_payout_config: multisportArtifactJson.early_payout_config,
    team_slug_aliases: {
      mlb: narrowStringRecord(multisportArtifactJson.team_slug_aliases.mlb),
      nhl: narrowStringRecord(multisportArtifactJson.team_slug_aliases.nhl),
      nba: narrowStringRecord(multisportArtifactJson.team_slug_aliases.nba),
      nfl: narrowStringRecord(multisportArtifactJson.team_slug_aliases.nfl),
    },
    nba_active_injuries_observed_at_utc:
      multisportArtifactJson.nba_active_injuries_observed_at_utc,
    nba_active_injuries_2026: nbaInjuries,
    league_environments_2026: multisportArtifactJson.league_environments_2026,
    teams_post_walkforward_state_2026: teamsState,
  };
}

function buildOfficialsArtifact(): OfficialsFreezeModelArtifactV6 {
  const officialsArtifactJson =
    readSpacetimeDataJson<RawOfficialsArtifactJson>(FILE_OFFICIALS_V6);
  const confederationPriors: Record<string, Record<string, unknown>> = {};
  for (const [confKey, rawObj] of Object.entries(officialsArtifactJson.confederation_priors)) {
    if (isRecord(rawObj)) {
      confederationPriors[confKey] = { ...rawObj };
    }
  }

  const competitionPriors: Record<string, CompetitionDisciplinaryPriorV6> = {};
  for (const [lgKey, rawComp] of Object.entries(officialsArtifactJson.competition_priors)) {
    competitionPriors[lgKey] = {
      league: rawComp.league,
      confederation_group: rawComp.confederation_group,
      confederation: rawComp.confederation,
      v51_div_code: rawComp.v51_div_code,
      equivalent_prior_games: rawComp.equivalent_prior_games,
      kappa_comp: rawComp.kappa_comp,
      yellow_rate_prior: rawComp.yellow_rate_prior,
      red_card_rate_prior: rawComp.red_card_rate_prior,
      fouls_rate_prior: rawComp.fouls_rate_prior,
      cards_per_foul_mult: rawComp.cards_per_foul_mult,
      booking_points_expected: rawComp.booking_points_expected,
      gamma_red: rawComp.gamma_red,
    };
  }

  const v51Officials: Record<string, V51OfficialEntryV6> = {};
  for (const [offKey, rawOff] of Object.entries(officialsArtifactJson.v5_1_officials)) {
    v51Officials[offKey] = {
      last_div: rawOff.last_div,
      games_yellow: rawOff.games_yellow,
      games_red: rawOff.games_red,
      yellow_mult: rawOff.yellow_mult,
      red_mult: rawOff.red_mult,
      fouls_mult: rawOff.fouls_mult,
      cpf_mult: rawOff.cpf_mult,
    };
  }

  return {
    schema_version: officialsArtifactJson.schema_version,
    codename: officialsArtifactJson.codename,
    version: officialsArtifactJson.version,
    status: toArtifactStatus(officialsArtifactJson.status),
    production_activated: officialsArtifactJson.production_activated,
    holdout_window_protected: toTuple2(officialsArtifactJson.holdout_window_protected),
    holdout_sealed_untouched: officialsArtifactJson.holdout_sealed_untouched,
    booking_points_gamma_red: officialsArtifactJson.booking_points_gamma_red,
    booking_points_lines: officialsArtifactJson.booking_points_lines,
    r_dispersion_yellow: officialsArtifactJson.r_dispersion_yellow,
    r_dispersion_red: officialsArtifactJson.r_dispersion_red,
    confederation_priors: confederationPriors,
    competition_priors: competitionPriors,
    alias_to_v5_1_key: narrowStringRecord(officialsArtifactJson.alias_to_v5_1_key),
    v5_1_officials: v51Officials,
  };
}

function buildPropsArtifact(): PropsV6ModelArtifact {
  const propsArtifactJson = readSpacetimeDataJson<RawPropsArtifactJson>(FILE_PROPS_V6);
  const positions: Record<string, CoupledShotPositionSpecV6> = {};
  for (const [posKey, rawPos] of Object.entries(propsArtifactJson.coupled_shots_v6.positions)) {
    positions[posKey] = {
      mean_starter_minutes: rawPos.mean_starter_minutes,
      metrics: {
        shots: narrowPositionMetricSpec(rawPos.metrics.shots),
        shots_on_target: narrowPositionMetricSpec(rawPos.metrics.shots_on_target),
      },
    };
  }

  const usProps: Record<UsPropsSportV6, UsSportPropsConfigV6> = {
    nba: narrowUsPropsSportConfig(propsArtifactJson.us_props_v6.nba),
    mlb: narrowUsPropsSportConfig(propsArtifactJson.us_props_v6.mlb),
    nhl: narrowUsPropsSportConfig(propsArtifactJson.us_props_v6.nhl),
    nfl: narrowUsPropsSportConfig(propsArtifactJson.us_props_v6.nfl),
  };

  return {
    schema_version: propsArtifactJson.schema_version,
    codename: propsArtifactJson.codename,
    version: propsArtifactJson.version,
    status: toArtifactStatus(propsArtifactJson.status),
    production_activated: propsArtifactJson.production_activated,
    holdout_cut_utc: propsArtifactJson.holdout_cut_utc,
    holdout_sealed_untouched: propsArtifactJson.holdout_sealed_untouched,
    coupled_shots_v6: {
      calibration_source: propsArtifactJson.coupled_shots_v6.calibration_source,
      remediated_finding: propsArtifactJson.coupled_shots_v6.remediated_finding,
      league_team_shots_anchor: propsArtifactJson.coupled_shots_v6.league_team_shots_anchor,
      league_team_sot_anchor: propsArtifactJson.coupled_shots_v6.league_team_sot_anchor,
      team_shots_exponent: propsArtifactJson.coupled_shots_v6.team_shots_exponent,
      cross_quality_exponent: propsArtifactJson.coupled_shots_v6.cross_quality_exponent,
      team_sot_exponent: propsArtifactJson.coupled_shots_v6.team_sot_exponent,
      cross_volume_exponent: propsArtifactJson.coupled_shots_v6.cross_volume_exponent,
      opp_defense_exponent: propsArtifactJson.coupled_shots_v6.opp_defense_exponent,
      min_guard_minutes_football: propsArtifactJson.coupled_shots_v6.min_guard_minutes_football,
      canonical_lines: propsArtifactJson.coupled_shots_v6.canonical_lines,
      positions,
      multi_line_logit_splines: {
        shots: narrowSplineMap(propsArtifactJson.coupled_shots_v6.multi_line_logit_splines.shots),
        shots_on_target: narrowSplineMap(
          propsArtifactJson.coupled_shots_v6.multi_line_logit_splines.shots_on_target,
        ),
      },
    },
    goalkeeper_saves_v6: {
      calibration_source: propsArtifactJson.goalkeeper_saves_v6.calibration_source,
      prior_save_rate: propsArtifactJson.goalkeeper_saves_v6.prior_save_rate,
      prior_shots_faced: propsArtifactJson.goalkeeper_saves_v6.prior_shots_faced,
      min_save_rate: propsArtifactJson.goalkeeper_saves_v6.min_save_rate,
      max_save_rate: propsArtifactJson.goalkeeper_saves_v6.max_save_rate,
      r_dispersion_sot: propsArtifactJson.goalkeeper_saves_v6.r_dispersion_sot,
      dixon_coles_rho: propsArtifactJson.goalkeeper_saves_v6.dixon_coles_rho,
      siege_own_goal_dampening: propsArtifactJson.goalkeeper_saves_v6.siege_own_goal_dampening,
      canonical_lines: propsArtifactJson.goalkeeper_saves_v6.canonical_lines,
      multi_line_logit_splines: narrowSplineMap(
        propsArtifactJson.goalkeeper_saves_v6.multi_line_logit_splines,
      ),
    },
    us_props_v6: usProps,
  };
}

function buildLiveFeedbackArtifact(): LiveFeedbackModelArtifactV52 {
  const liveFeedbackArtifactJson =
    readSpacetimeDataJson<RawLiveFeedbackArtifactJson>(FILE_LIVE_FEEDBACK_V52);
  const leagueEnvs: Record<
    string,
    {
      readonly games_observed: number;
      readonly mean_raw_goals: number;
      readonly shrunk_env_goals: number;
    }
  > = {};
  for (const [lgKey, entry] of Object.entries(
    liveFeedbackArtifactJson.league_scoring_environments_2026,
  )) {
    leagueEnvs[lgKey] = {
      games_observed: entry.games_observed,
      mean_raw_goals: entry.mean_raw_goals,
      shrunk_env_goals: entry.shrunk_env_goals,
    };
  }
  return {
    schema_version: liveFeedbackArtifactJson.schema_version,
    codename: liveFeedbackArtifactJson.codename,
    version: liveFeedbackArtifactJson.version,
    status: toArtifactStatus(liveFeedbackArtifactJson.status),
    production_activated: liveFeedbackArtifactJson.production_activated,
    holdout_sealed_untouched: liveFeedbackArtifactJson.holdout_sealed_untouched,
    football_calibration: liveFeedbackArtifactJson.football_calibration,
    goalkeeper_saves: liveFeedbackArtifactJson.goalkeeper_saves,
    coupled_player_shots: liveFeedbackArtifactJson.coupled_player_shots,
    us_multisport_walkforward: liveFeedbackArtifactJson.us_multisport_walkforward,
    league_scoring_environments_2026: leagueEnvs,
  };
}

let soccer57ArtifactMemo: Soccer57ModelArtifactV60 | null = null;
let multisportArtifactMemo: MultiSportModelArtifactV60 | null = null;
let officialsArtifactMemo: OfficialsFreezeModelArtifactV6 | null = null;
let propsArtifactMemo: PropsV6ModelArtifact | null = null;
let liveFeedbackArtifactMemo: LiveFeedbackModelArtifactV52 | null = null;
let epistemicArtifactMemo: EpistemicConformalArtifactV51 | null = null;
let inplayArtifactMemo: InPlayEarlyPayoutArtifactV5 | null = null;
let microArtifactMemo: SoccerMicroModelArtifactV5 | null = null;
let sgpArtifactMemo: SgpCopulaArtifactV5 | null = null;
let unifiedArtifactsBundleMemo: UnifiedArtifactsBundleV6 | null = null;
let candidateRegistrySummaryMemo: CandidateRegistryV6Summary | null = null;

function getEpistemicArtifactMemo(): EpistemicConformalArtifactV51 {
  if (!epistemicArtifactMemo) {
    const epistemicArtifactJson =
      readSpacetimeDataJson<RawEpistemicArtifactJson>(FILE_EPISTEMIC_CONFORMAL);
    epistemicArtifactMemo = {
      schema_version: epistemicArtifactJson.schema_version,
      status: toArtifactStatus(epistemicArtifactJson.status),
      production_activated: epistemicArtifactJson.production_activated,
      holdout_cut_utc: epistemicArtifactJson.holdout_cut_utc,
      holdout_sealed_untouched: epistemicArtifactJson.holdout_sealed_untouched,
      sports: {
        soccer: epistemicArtifactJson.sports.soccer,
        nfl: epistemicArtifactJson.sports.nfl,
        multisport: epistemicArtifactJson.sports.multisport,
      },
    };
  }
  return epistemicArtifactMemo;
}

function getInplayArtifactMemo(): InPlayEarlyPayoutArtifactV5 {
  if (!inplayArtifactMemo) {
    const inplayArtifactJson =
      readSpacetimeDataJson<RawInplayArtifactJson>(FILE_INPLAY_EARLY_PAYOUT);
    const inplayWeights = inplayArtifactJson.soccer.minute_bucket_weights_6;
    inplayArtifactMemo = {
      ...inplayArtifactJson,
      status: toArtifactStatus(inplayArtifactJson.status),
      soccer: {
        ...inplayArtifactJson.soccer,
        minute_bucket_weights_6: [
          inplayWeights[0] ?? 0.126799,
          inplayWeights[1] ?? 0.143104,
          inplayWeights[2] ?? 0.167323,
          inplayWeights[3] ?? 0.164121,
          inplayWeights[4] ?? 0.169973,
          inplayWeights[5] ?? 0.22868,
        ],
      },
      points_sports_early_payout: {
        nfl: { ...inplayArtifactJson.points_sports_early_payout.nfl, trigger_lead: 17 },
        nba: { ...inplayArtifactJson.points_sports_early_payout.nba, trigger_lead: 20 },
        mlb: { ...inplayArtifactJson.points_sports_early_payout.mlb, trigger_lead: 5 },
      },
    };
  }
  return inplayArtifactMemo;
}

function getMicroArtifactMemo(): SoccerMicroModelArtifactV5 {
  if (!microArtifactMemo) {
    const microArtifactJson = readSpacetimeDataJson<RawMicroArtifactJson>(FILE_SOCCER_MICRO_V5);
    microArtifactMemo = {
      ...microArtifactJson,
      status: toArtifactStatus(microArtifactJson.status),
    };
  }
  return microArtifactMemo;
}

function getSgpArtifactMemo(): SgpCopulaArtifactV5 & {
  readonly default_player_linked_dc_rho: number;
} {
  if (!sgpArtifactMemo) {
    const sgpArtifactJson = readSpacetimeDataJson<RawSgpArtifactJson>(FILE_SGP_COPULA_V5);
    sgpArtifactMemo = {
      ...sgpArtifactJson,
      status: toArtifactStatus(sgpArtifactJson.status),
      sports: {
        soccer: {
          ...sgpArtifactJson.sports.soccer,
          copula_family:
            sgpArtifactJson.sports.soccer.copula_family === "gaussian" ? "gaussian" : "student_t",
        },
        nfl: {
          ...sgpArtifactJson.sports.nfl,
          copula_family:
            sgpArtifactJson.sports.nfl.copula_family === "gaussian" ? "gaussian" : "student_t",
        },
      },
    };
  }
  return sgpArtifactMemo as SgpCopulaArtifactV5 & {
    readonly default_player_linked_dc_rho: number;
  };
}

export interface CandidateRegistryV6Summary {
  readonly schemaVersion: string;
  readonly suiteCodename: string;
  readonly suiteVersion: string;
  readonly status: "candidate" | "production";
  readonly productionActivated: boolean;
  readonly holdoutCutUtc: string;
  readonly holdoutWindowProtected: readonly [string, string];
  readonly holdoutSealedUntouched: boolean;
  readonly activeArtifactsCount: number;
  readonly activeArtifactIds: readonly string[];
}

export const SOCCER_57_LEAGUE_IDS_V6: readonly string[] = Object.freeze(
  Object.keys(readSpacetimeDataJson<RawSoccer57ArtifactJson>(FILE_SOCCER_57_V6).competitions).sort(),
);

const V5_DIV_TO_LEAGUE_V6: Readonly<Record<string, string>> = Object.freeze({
  E0: "premier-league",
  E1: "championship",
  SP1: "laliga",
  SP2: "segunda-espana",
  D1: "bundesliga",
  D2: "bundesliga-2",
  I1: "serie-a",
  I2: "serie-b",
  F1: "ligue-1",
  F2: "ligue-2",
  N1: "eredivisie",
  P1: "liga-portugal",
  B1: "pro-league-belgica",
  T1: "super-lig",
  MEX: "liga-mx",
  USA: "mls",
  BRA: "brasileirao",
  ARG: "liga-argentina",
  JPN: "j1-league",
});

const CONFEDERATION_DEFAULT_DIV: Readonly<Record<ConfederationGroupV60, string>> = Object.freeze({
  UEFA_TOP: "E0",
  UEFA_SECOND_AND_CUPS: "E1",
  CONMEBOL_LEAGUE_AND_CUPS: "BRA",
  CONCACAF_AND_MX: "MEX",
  AFC_CAF_EXPANSION: "T1",
  INTERNATIONAL_NATIONAL_TEAMS: "E0",
});

const LEAGUE_ALIAS_MAP: Readonly<Record<string, string>> = Object.freeze({
  "la-liga": "laliga",
});

const DEFAULT_ASIAN_HANDICAP_LINES: readonly number[] = Object.freeze([
  -1.5, -1.0, -0.5, 0.0, 0.5, 1.0, 1.5,
]);

function normalizeLeagueSlugV6(league: string): string {
  const clean = league.trim().toLowerCase();
  return LEAGUE_ALIAS_MAP[clean] ?? clean;
}

function clampProb(p: number): number {
  return Math.max(0.001, Math.min(0.999, p));
}

function clampValue(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function round4(v: number): number {
  return Math.round(v * 10_000) / 10_000;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export function getSpacetimeV6RegistrySummary(): CandidateRegistryV6Summary {
  if (!candidateRegistrySummaryMemo) {
    const candidateRegistryJson = readSpacetimeDataJson<RawCandidateRegistryJson>(
      FILE_CANDIDATE_REGISTRY,
    );
    candidateRegistrySummaryMemo = Object.freeze({
      schemaVersion: candidateRegistryJson.schema_version,
      suiteCodename: candidateRegistryJson.suite_codename,
      suiteVersion: candidateRegistryJson.suite_version,
      status: toArtifactStatus(candidateRegistryJson.status),
      productionActivated: candidateRegistryJson.production_activated,
      holdoutCutUtc: candidateRegistryJson.holdout_cut_utc,
      holdoutWindowProtected: toTuple2(candidateRegistryJson.holdout_window_protected),
      holdoutSealedUntouched: candidateRegistryJson.holdout_sealed_untouched,
      activeArtifactsCount: candidateRegistryJson.n_active_v6_0_candidate_artifacts,
      activeArtifactIds: Object.freeze(candidateRegistryJson.active_v6_0_artifacts.map((a) => a.id)),
    });
  }
  return candidateRegistrySummaryMemo;
}

export function getSoccer57ArtifactV6(): Soccer57ModelArtifactV60 {
  if (!soccer57ArtifactMemo) {
    soccer57ArtifactMemo = buildSoccer57Artifact();
  }
  return soccer57ArtifactMemo;
}

export function getMultisportArtifactV6(): MultiSportModelArtifactV60 {
  if (!multisportArtifactMemo) {
    multisportArtifactMemo = buildMultisportArtifact();
  }
  return multisportArtifactMemo;
}

export function getOfficialsFreezeArtifactV6(): OfficialsFreezeModelArtifactV6 {
  if (!officialsArtifactMemo) {
    officialsArtifactMemo = buildOfficialsArtifact();
  }
  return officialsArtifactMemo;
}

export function getPropsArtifactV6(): PropsV6ModelArtifact {
  if (!propsArtifactMemo) {
    propsArtifactMemo = buildPropsArtifact();
  }
  return propsArtifactMemo;
}

export function getLiveFeedbackArtifactV52(): LiveFeedbackModelArtifactV52 {
  if (!liveFeedbackArtifactMemo) {
    liveFeedbackArtifactMemo = buildLiveFeedbackArtifact();
  }
  return liveFeedbackArtifactMemo;
}

export function getUnifiedArtifactsBundleV6(): UnifiedArtifactsBundleV6 {
  if (!unifiedArtifactsBundleMemo) {
    unifiedArtifactsBundleMemo = Object.freeze({
      soccer57ArtifactV6: getSoccer57ArtifactV6(),
      propsArtifactV6: getPropsArtifactV6(),
      multisportArtifactV6: getMultisportArtifactV6(),
      officialsArtifactV6: getOfficialsFreezeArtifactV6(),
      epistemicArtifactV51: getEpistemicArtifactMemo(),
      inplayArtifactV5: getInplayArtifactMemo(),
    });
  }
  return unifiedArtifactsBundleMemo;
}

export function isSoccer57LeagueV6(league: string): boolean {
  const slug = normalizeLeagueSlugV6(league);
  return hasOwn(getSoccer57ArtifactV6().competitions, slug);
}

export function getSoccer57CompetitionSpecV6(league: string): CompetitionSpecV60 | null {
  const slug = normalizeLeagueSlugV6(league);
  const soccer57Artifact = getSoccer57ArtifactV6();
  if (!hasOwn(soccer57Artifact.competitions, slug)) return null;
  return soccer57Artifact.competitions[slug] ?? null;
}

export function resolveSoccerMicroDivCodeV6(league: string): string {
  const slug = normalizeLeagueSlugV6(league);
  const officialsArtifact = getOfficialsFreezeArtifactV6();
  const microArtifact = getMicroArtifactMemo();
  const compOfficial = hasOwn(officialsArtifact.competition_priors, slug)
    ? officialsArtifact.competition_priors[slug]
    : undefined;
  const fromOfficial = compOfficial?.v51_div_code ?? null;
  if (fromOfficial && hasOwn(microArtifact.div_priors, fromOfficial)) {
    return fromOfficial;
  }
  const compSoccer = getSoccer57CompetitionSpecV6(slug);
  if (compSoccer) {
    const fallbackDiv = CONFEDERATION_DEFAULT_DIV[compSoccer.confederation_group];
    if (hasOwn(microArtifact.div_priors, fallbackDiv)) {
      return fallbackDiv;
    }
  }
  return "E0";
}

export function calibratePlayableOddsV6(params: {
  readonly pRaw: number;
  readonly league: string;
}): VennAbersPlayableEvaluationV60 {
  const compSpec = getSoccer57CompetitionSpecV6(params.league);
  const isExpansionOrCup = compSpec
    ? Boolean(compSpec.is_cup || compSpec.confederation_group !== "UEFA_TOP")
    : true;
  return calibratePlayableVennAbersLogitV60(
    params.pRaw,
    isExpansionOrCup,
    getSoccer57ArtifactV6().venn_abers_playable_calibrator,
  );
}

export function recalibrateSoccer57MatchServerV6(params: {
  readonly league: string;
  readonly rawProjHome: number;
  readonly rawProjAway: number;
  readonly rawX12: readonly number[];
  readonly causalLeagueEnvGoals?: number | null;
}): Soccer57PrekickoffRecalibratedOutlookV60 | null {
  const slug = normalizeLeagueSlugV6(params.league);
  const soccer57Artifact = getSoccer57ArtifactV6();
  if (!hasOwn(soccer57Artifact.competitions, slug)) {
    return null;
  }
  const compSpec = soccer57Artifact.competitions[slug]!;
  const liveFeedbackArtifact = getLiveFeedbackArtifactV52();
  const envFromFeedback = hasOwn(liveFeedbackArtifact.league_scoring_environments_2026, slug)
    ? liveFeedbackArtifact.league_scoring_environments_2026[slug]?.shrunk_env_goals
    : undefined;
  const causalEnv =
    typeof params.causalLeagueEnvGoals === "number" && Number.isFinite(params.causalLeagueEnvGoals)
      ? params.causalLeagueEnvGoals
      : compSpec.causal_env_goals_final ?? envFromFeedback ?? 2.7;

  return recalibrateSoccer57PrekickoffV60({
    league: slug,
    rawProjHome: params.rawProjHome,
    rawProjAway: params.rawProjAway,
    rawX12: params.rawX12,
    causalLeagueEnvGoals: causalEnv,
    artifact: soccer57Artifact,
  });
}

export function projectSoccer57MatchServerV6(
  params: Omit<ProjectSoccer57MatchInputV60, "artifact">,
): Soccer57MatchOutlookV60 | null {
  const slug = normalizeLeagueSlugV6(params.league);
  const soccer57Artifact = getSoccer57ArtifactV6();
  if (!hasOwn(soccer57Artifact.competitions, slug)) {
    return null;
  }
  return projectSoccer57MatchV60({
    ...params,
    league: slug,
    artifact: soccer57Artifact,
  });
}

export interface AsianHandicapLineV6 {
  readonly lineHome: number;
  readonly pHomeCover: number;
  readonly pAwayCover: number;
  readonly pPush: number;
  readonly pHomeCoverNoPush: number;
  readonly pAwayCoverNoPush: number;
  readonly fairOddsHome: FairOdds;
  readonly fairOddsAway: FairOdds;
}

export function deriveAsianHandicapFromMatrixV6(
  matrix: readonly (readonly number[])[],
  lines: readonly number[] = DEFAULT_ASIAN_HANDICAP_LINES,
): readonly AsianHandicapLineV6[] {
  return Object.freeze(
    lines.map((lineHome) => {
      let pHomeCover = 0;
      let pAwayCover = 0;
      let pPush = 0;
      for (let h = 0; h < matrix.length; h += 1) {
        const row = matrix[h] ?? [];
        for (let a = 0; a < row.length; a += 1) {
          const p = row[a] ?? 0;
          if (p <= 0) continue;
          const adj = h - a + lineHome;
          if (Math.abs(adj) < 1e-9) pPush += p;
          else if (adj > 0) pHomeCover += p;
          else pAwayCover += p;
        }
      }
      const active = Math.max(pHomeCover + pAwayCover, 1e-12);
      const pHomeNoPush = clampProb(pHomeCover / active);
      const pAwayNoPush = clampProb(1 - pHomeNoPush);
      return Object.freeze({
        lineHome,
        pHomeCover,
        pAwayCover,
        pPush,
        pHomeCoverNoPush: pHomeNoPush,
        pAwayCoverNoPush: pAwayNoPush,
        fairOddsHome: probabilityToFairOdds(pHomeNoPush),
        fairOddsAway: probabilityToFairOdds(pAwayNoPush),
      });
    }),
  );
}

export interface EvaluateSoccer57V6MatchInput {
  readonly matchId: string;
  readonly league: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly pHome: number;
  readonly pDraw: number;
  readonly pAway: number;
  readonly projectedHomeGoals?: number | null;
  readonly projectedAwayGoals?: number | null;
  readonly totalGoalsTarget?: number | null;
  readonly refereeName?: string | null;
  readonly mode?: "matrix_4param" | "prekickoff_recalibration";
  readonly causalLeagueEnvGoals?: number | null;
  readonly asianHandicapLines?: readonly number[];
}

export interface Soccer57V6MatchEvaluation {
  readonly league: string;
  readonly isRegisteredLeague: boolean;
  readonly confederationGroup: ConfederationGroupV60;
  readonly competitionStatus: CompetitionStatusV60;
  readonly isExpansionOrCup: boolean;
  readonly divCode: string;
  readonly muHome: number;
  readonly muAway: number;
  readonly rhoEff: number;
  readonly dispersionR: number;
  readonly totalGoalsTarget: number;
  readonly expectedTotalImplied: number;
  readonly markets: CoherentSoccerMarketsV60;
  readonly asianHandicap: readonly AsianHandicapLineV6[];
  readonly playableVennAbers: {
    readonly home: VennAbersPlayableEvaluationV60;
    readonly away: VennAbersPlayableEvaluationV60;
    readonly over25: VennAbersPlayableEvaluationV60;
    readonly under25: VennAbersPlayableEvaluationV60;
    readonly bttsYes: VennAbersPlayableEvaluationV60;
  };
  readonly officialPrior: ResolvedOfficialPriorV6;
  readonly microMarkets: SoccerMicroMatchOutlookV5;
  readonly earlyPayout2Goals: SoccerEarlyPayoutAndInPlayResult["earlyPayout2Goals"];
  readonly inPlayPregameAnchor: SoccerEarlyPayoutAndInPlayResult;
}

function reconstructDiagonalScoreMatrixV6(params: {
  readonly muHome: number;
  readonly muAway: number;
  readonly rhoEff: number;
  readonly dispersionR: number;
  readonly pHome: number;
  readonly pDraw: number;
  readonly pAway: number;
}): readonly (readonly number[])[] {
  const mg = DEFAULT_SOCCER_V60_MAX_GOALS;
  const size = mg + 1;
  const pmfH = nbMarginalPmfV60(params.muHome, params.dispersionR, mg);
  const pmfA = nbMarginalPmfV60(params.muAway, params.dispersionR, mg);
  const ph0 = Math.max(params.pHome, 1e-9);
  const pd0 = clampValue(params.pDraw, 1e-6, 0.96);
  const pa0 = Math.max(params.pAway, 1e-9);
  const sp = ph0 + pd0 + pa0;
  const pH = ph0 / sp;
  const pD = pd0 / sp;
  const pA = pa0 / sp;

  const baseMat: number[][] = [];
  let sumUpper = 0;
  let sumDiag = 0;
  let sumLower = 0;
  for (let h = 0; h < size; h += 1) {
    const row: number[] = [];
    const phV = pmfH[h] ?? 0;
    for (let a = 0; a < size; a += 1) {
      let base = phV * (pmfA[a] ?? 0);
      if (h === 0 && a === 0) {
        base *= Math.max(1 - params.muHome * params.muAway * params.rhoEff, 1e-9);
      } else if (h === 0 && a === 1) {
        base *= Math.max(1 + params.muHome * params.rhoEff, 1e-9);
      } else if (h === 1 && a === 0) {
        base *= Math.max(1 + params.muAway * params.rhoEff, 1e-9);
      } else if (h === 1 && a === 1) {
        base *= Math.max(1 - params.rhoEff, 1e-9);
      }
      row.push(base);
      if (h > a) sumUpper += base;
      else if (h === a) sumDiag += base;
      else sumLower += base;
    }
    baseMat.push(row);
  }

  const wUpper = pH / Math.max(sumUpper, 1e-15);
  const wDiag = pD / Math.max(sumDiag, 1e-15);
  const wLower = pA / Math.max(sumLower, 1e-15);
  return Object.freeze(
    baseMat.map((row, h) =>
      Object.freeze(
        row.map((base, a) => base * (h === a ? wDiag : h > a ? wUpper : wLower)),
      ),
    ),
  );
}

export function evaluateSoccer57V6Match(
  input: EvaluateSoccer57V6MatchInput,
): Soccer57V6MatchEvaluation {
  const slug = normalizeLeagueSlugV6(input.league);
  const compSpec = getSoccer57CompetitionSpecV6(slug);
  const isRegisteredLeague = compSpec !== null;
  const confGroup: ConfederationGroupV60 =
    compSpec?.confederation_group ?? "INTERNATIONAL_NATIONAL_TEAMS";
  const compStatus: CompetitionStatusV60 =
    compSpec?.competition_status ?? "confederation_prior_zero_2026_games";
  const isExpansionOrCup = compSpec
    ? Boolean(compSpec.is_cup || confGroup !== "UEFA_TOP")
    : true;

  const sumRaw = Math.max(input.pHome + input.pDraw + input.pAway, 1e-9);
  const normH = clampProb(input.pHome / sumRaw);
  const normD = clampProb(input.pDraw / sumRaw);
  const normA = clampProb(input.pAway / sumRaw);

  const defaultTotal =
    typeof input.totalGoalsTarget === "number" && Number.isFinite(input.totalGoalsTarget)
      ? clampValue(input.totalGoalsTarget, 1.2, 4.95)
      : typeof input.projectedHomeGoals === "number" &&
          typeof input.projectedAwayGoals === "number" &&
          Number.isFinite(input.projectedHomeGoals) &&
          Number.isFinite(input.projectedAwayGoals) &&
          input.projectedHomeGoals + input.projectedAwayGoals > 0.35
        ? clampValue(input.projectedHomeGoals + input.projectedAwayGoals, 1.2, 4.95)
        : clampValue(compSpec?.causal_env_goals_final ?? 2.65, 1.2, 4.95);

  const rhoPrior = compSpec?.rho_prior ?? -0.105;
  const dispersionR = compSpec?.dispersion_r ?? 500;

  let rec: Soccer57PrekickoffRecalibratedOutlookV60 | null = null;
  if (
    input.mode === "prekickoff_recalibration" &&
    isRegisteredLeague &&
    typeof input.projectedHomeGoals === "number" &&
    typeof input.projectedAwayGoals === "number" &&
    Number.isFinite(input.projectedHomeGoals) &&
    Number.isFinite(input.projectedAwayGoals) &&
    input.projectedHomeGoals > 0 &&
    input.projectedAwayGoals > 0
  ) {
    rec = recalibrateSoccer57MatchServerV6({
      league: slug,
      rawProjHome: input.projectedHomeGoals,
      rawProjAway: input.projectedAwayGoals,
      rawX12: [normH, normD, normA],
      causalLeagueEnvGoals: input.causalLeagueEnvGoals,
    });
  }

  let muHome: number;
  let muAway: number;
  let rhoEff: number;
  let solvedDispersionR: number;
  let totalGoalsTarget: number;
  let expectedTotalImplied: number;
  let markets: CoherentSoccerMarketsV60;
  let playableVennAbers: Soccer57V6MatchEvaluation["playableVennAbers"];
  let scoreMatrix: readonly (readonly number[])[];

  if (rec) {
    muHome = rec.muHome;
    muAway = rec.muAway;
    rhoEff = rec.rhoEff;
    solvedDispersionR = rec.dispersionR;
    totalGoalsTarget = rec.totalGoalsTarget;
    expectedTotalImplied = rec.expectedTotalImplied;
    markets = rec.markets;
    playableVennAbers = rec.playableVennAbers;
    scoreMatrix = reconstructDiagonalScoreMatrixV6({
      muHome: rec.muHome,
      muAway: rec.muAway,
      rhoEff: rec.rhoEff,
      dispersionR: rec.dispersionR,
      pHome: rec.pHomeTarget,
      pDraw: rec.pDrawTarget,
      pAway: rec.pAwayTarget,
    });
  } else {
    totalGoalsTarget = defaultTotal;
    const solved = solveDiagonalScoreMatrix4ParamV60({
      pHome: normH,
      pDraw: normD,
      pAway: normA,
      totalGoalsTarget,
      rhoPrior,
      dispersionR,
      maxGoals: DEFAULT_SOCCER_V60_MAX_GOALS,
      rhoDrawBlendWeight: 0.0,
    });
    muHome = solved.muHome;
    muAway = solved.muAway;
    rhoEff = solved.rhoEff;
    solvedDispersionR = solved.dispersionR;
    expectedTotalImplied = solved.expectedTotalImplied;
    markets = deriveCoherentSoccerMarketsV60(solved.matrix);
    const vaCfg = getSoccer57ArtifactV6().venn_abers_playable_calibrator;
    playableVennAbers = Object.freeze({
      home: calibratePlayableVennAbersLogitV60(markets["1x2"].home, isExpansionOrCup, vaCfg),
      away: calibratePlayableVennAbersLogitV60(markets["1x2"].away, isExpansionOrCup, vaCfg),
      over25: calibratePlayableVennAbersLogitV60(markets.totals_2_5.over, isExpansionOrCup, vaCfg),
      under25: calibratePlayableVennAbersLogitV60(markets.totals_2_5.under, isExpansionOrCup, vaCfg),
      bttsYes: calibratePlayableVennAbersLogitV60(markets.btts.yes, isExpansionOrCup, vaCfg),
    });
    scoreMatrix = solved.matrix;
  }

  const asianHandicap = deriveAsianHandicapFromMatrixV6(
    scoreMatrix,
    input.asianHandicapLines ?? DEFAULT_ASIAN_HANDICAP_LINES,
  );

  const officialPrior = resolveOfficialPriorServerV6({
    refereeName: input.refereeName ?? null,
    league: slug,
  });

  const divCode = resolveSoccerMicroDivCodeV6(slug);
  const microArtifact = getMicroArtifactMemo();
  const lh = muHome;
  const la = muAway;
  const supH = lh - la;
  const supA = -supH;
  const siegeH = Math.pow(Math.max(0, supH), 1.4) - 0.5 * Math.pow(Math.max(0, -supH), 1.2);
  const siegeA = Math.pow(Math.max(0, supA), 1.4) - 0.5 * Math.pow(Math.max(0, -supA), 1.2);
  const tempoExc = lh + la - 2.65;
  const tightness = Math.exp(-Math.abs(supH)) - 0.55;
  const dp = microArtifact.div_priors[divCode];

  const buildMetricFeature = (q: SoccerMicroMetricKey): MicroFeatureVectorInputV4 => {
    const sp = microArtifact.metrics[q];
    const bh = dp?.metrics[q]?.home_mean ?? sp.default_home_rate;
    const ba = dp?.metrics[q]?.away_mean ?? sp.default_away_rate;
    const logRef =
      q === "yellow_cards"
        ? Math.log(Math.max(0.5, officialPrior.yellowMult))
        : q === "fouls"
          ? Math.log(Math.max(0.5, officialPrior.foulsMult))
          : 0.0;
    return {
      homeFeatures8: [Math.log(Math.max(bh, 0.12)), supH, siegeH, tempoExc, tightness, 0, 0, logRef],
      awayFeatures8: [Math.log(Math.max(ba, 0.12)), supA, siegeA, tempoExc, tightness, 0, 0, logRef],
    };
  };

  const microMarkets = buildSoccerMicroMatchOutlookV5({
    matchId: input.matchId,
    div: divCode,
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    lamHome: lh,
    lamAway: la,
    featuresByMetric: {
      corners: buildMetricFeature("corners"),
      yellow_cards: buildMetricFeature("yellow_cards"),
      fouls: buildMetricFeature("fouls"),
      shots_on_target: buildMetricFeature("shots_on_target"),
      shots: buildMetricFeature("shots"),
    },
    modelArtifact: microArtifact,
  });

  const inPlayPregameAnchor = evaluateSoccerEarlyPayoutAndInPlay({
    pregameMuHome: lh,
    pregameMuAway: la,
    currentMinute: 0,
    currentHomeGoals: 0,
    currentAwayGoals: 0,
    redCardsHome: 0,
    redCardsAway: 0,
    corePHome: markets["1x2"].home,
    corePDraw: markets["1x2"].draw,
    corePAway: markets["1x2"].away,
    artifact: getInplayArtifactMemo(),
  });

  return Object.freeze({
    league: slug,
    isRegisteredLeague,
    confederationGroup: confGroup,
    competitionStatus: compStatus,
    isExpansionOrCup,
    divCode,
    muHome,
    muAway,
    rhoEff,
    dispersionR: solvedDispersionR,
    totalGoalsTarget,
    expectedTotalImplied,
    markets,
    asianHandicap,
    playableVennAbers,
    officialPrior,
    microMarkets,
    earlyPayout2Goals: inPlayPregameAnchor.earlyPayout2Goals,
    inPlayPregameAnchor,
  });
}

let multisportStateBySportMemo: Map<
  MultiSportLeagueV60,
  Array<{ readonly team_key: string; readonly team_name: string }>
> | null = null;

function getMultisportStateBySport(): Map<
  MultiSportLeagueV60,
  Array<{ readonly team_key: string; readonly team_name: string }>
> {
  if (!multisportStateBySportMemo) {
    const bySport = new Map<
      MultiSportLeagueV60,
      Array<{ readonly team_key: string; readonly team_name: string }>
    >();
    const stateMap = getMultisportArtifactV6().teams_post_walkforward_state_2026 ?? {};
    for (const entry of Object.values(stateMap)) {
      const list = bySport.get(entry.sport) ?? [];
      list.push({ team_key: entry.team_key, team_name: entry.team_name });
      bySport.set(entry.sport, list);
    }
    multisportStateBySportMemo = bySport;
  }
  return multisportStateBySportMemo;
}

function cleanFranchiseToken(raw: string): string {
  let clean = raw.trim().toLowerCase();
  const dblIdx = clean.indexOf("::");
  if (dblIdx >= 0) clean = clean.slice(dblIdx + 2);
  const dotIdx = clean.indexOf(".");
  if (dotIdx >= 0) clean = clean.slice(dotIdx + 1);
  return clean.replace(/[^a-z0-9_-]+/g, "");
}

function slugifyFranchiseName(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function resolveMultiSportTeamCodeSafeV6(
  sport: MultiSportLeagueV60,
  teamNameOrSlug: string,
  teamCode?: string | null,
): string | null {
  const multisportArtifact = getMultisportArtifactV6();
  const stateMap = multisportArtifact.teams_post_walkforward_state_2026;
  if (!stateMap) return null;
  const aliases = multisportArtifact.team_slug_aliases[sport];

  const verifyCode = (candidate: string | undefined): string | null => {
    if (!candidate) return null;
    const upper = candidate.trim().toUpperCase();
    return hasOwn(stateMap, `${sport}::${upper}`) ? upper : null;
  };

  const lookupAlias = (token: string): string | undefined =>
    hasOwn(aliases, token) ? aliases[token] : undefined;

  const lookupUniqueAliasSuffix = (slug: string): string | null => {
    if (slug.length < 4) return null;
    const suffix = `-${slug}`;
    const matchedCodes = new Set<string>();
    for (const [aliasKey, mappedCode] of Object.entries(aliases)) {
      if (aliasKey === slug || aliasKey.endsWith(suffix)) {
        const verified = verifyCode(mappedCode);
        if (verified) matchedCodes.add(verified);
      }
    }
    if (matchedCodes.size !== 1) return null;
    for (const only of matchedCodes) return only;
    return null;
  };

  if (teamCode) {
    const directCode = verifyCode(teamCode);
    if (directCode) return directCode;
    const codeAlias = verifyCode(lookupAlias(cleanFranchiseToken(teamCode)));
    if (codeAlias) return codeAlias;
    const codeSlugAlias = verifyCode(lookupAlias(slugifyFranchiseName(teamCode)));
    if (codeSlugAlias) return codeSlugAlias;
  }

  const cleanRaw = cleanFranchiseToken(teamNameOrSlug);
  const slugRaw = slugifyFranchiseName(teamNameOrSlug);
  const fromClean = verifyCode(lookupAlias(cleanRaw)) ?? verifyCode(cleanRaw);
  if (fromClean) return fromClean;
  const fromSlug = verifyCode(lookupAlias(slugRaw));
  if (fromSlug) return fromSlug;

  const fromNameSuffix = lookupUniqueAliasSuffix(slugRaw);
  if (fromNameSuffix) return fromNameSuffix;

  if (teamCode) {
    const fromCodeSuffix = lookupUniqueAliasSuffix(slugifyFranchiseName(teamCode));
    if (fromCodeSuffix) return fromCodeSuffix;
  }

  let bestCode: string | null = null;
  let bestScore = 0;
  let tied = false;
  const considerScore = (candidateName: string, code: string) => {
    const verified = verifyCode(code);
    if (!verified) return;
    const score = teamScore(candidateName, teamNameOrSlug);
    if (score <= 0) return;
    if (score > bestScore + 1e-9) {
      bestScore = score;
      bestCode = verified;
      tied = false;
    } else if (Math.abs(score - bestScore) <= 1e-9 && bestCode !== verified) {
      tied = true;
    }
  };

  for (const entry of getMultisportStateBySport().get(sport) ?? []) {
    considerScore(entry.team_name, entry.team_key);
  }
  for (const [aliasKey, mappedCode] of Object.entries(aliases)) {
    if (aliasKey.includes("-")) {
      considerScore(aliasKey.replace(/-/g, " "), mappedCode);
    }
  }
  return bestScore >= 0.45 && !tied && bestCode ? bestCode : null;
}

export function tryProjectMultiSportFromStateV6(params: {
  readonly sport: MultiSportLeagueV60;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly homeCode?: string | null;
  readonly awayCode?: string | null;
  readonly gameDate: string;
  readonly neutralSite?: boolean;
  readonly totalLine?: number | null;
  readonly spreadLineHome?: number | null;
}): {
  readonly homeCode: string;
  readonly awayCode: string;
  readonly outlook: MultiSportWalkforwardOutlookV60;
} | null {
  const homeCode = resolveMultiSportTeamCodeSafeV6(
    params.sport,
    params.homeTeam,
    params.homeCode ?? null,
  );
  const awayCode = resolveMultiSportTeamCodeSafeV6(
    params.sport,
    params.awayTeam,
    params.awayCode ?? null,
  );
  if (!homeCode || !awayCode) return null;

  const multisportArtifact = getMultisportArtifactV6();
  const stateMap = multisportArtifact.teams_post_walkforward_state_2026;
  if (
    !stateMap ||
    !hasOwn(stateMap, `${params.sport}::${homeCode}`) ||
    !hasOwn(stateMap, `${params.sport}::${awayCode}`)
  ) {
    return null;
  }

  const outlook = projectMultiSportMatchupFromStateV60({
    sport: params.sport,
    homeTeam: homeCode,
    awayTeam: awayCode,
    gameDate: params.gameDate,
    neutralSite: params.neutralSite ?? false,
    ...(typeof params.totalLine === "number" && Number.isFinite(params.totalLine)
      ? { totalLine: params.totalLine }
      : {}),
    ...(typeof params.spreadLineHome === "number" && Number.isFinite(params.spreadLineHome)
      ? { spreadLineHome: params.spreadLineHome }
      : {}),
    artifact: multisportArtifact,
  });

  return Object.freeze({
    homeCode,
    awayCode,
    outlook,
  });
}

export function isEarlyPayoutValidatedOosV6(ep: EarlyPayoutOutlookV60): boolean {
  return ep.intra_game_validation_status.startsWith("oos_validated");
}

export function evaluateUsEarlyPayoutV6(params: {
  readonly sport: MultiSportLeagueV60;
  readonly pHomeWin: number;
  readonly pAwayWin?: number;
  readonly sigmaMarginOverride?: number | null;
  readonly nhlLambda60Home?: number | null;
  readonly nhlLambda60Away?: number | null;
}): EarlyPayoutOutlookV60 {
  const multisportArtifact = getMultisportArtifactV6();
  const pHome = clampProb(params.pHomeWin);
  const pAway =
    typeof params.pAwayWin === "number" && Number.isFinite(params.pAwayWin)
      ? clampProb(params.pAwayWin)
      : clampProb(1 - pHome);

  if (params.sport === "nhl") {
    const nhlCfg = multisportArtifact.early_payout_config.nhl;
    const baseLam = multisportArtifact.league_environments_2026?.nhl.shrunk_team_scoring_env ?? 3.1;
    const lamH =
      typeof params.nhlLambda60Home === "number" && Number.isFinite(params.nhlLambda60Home)
        ? clampValue(params.nhlLambda60Home, 1.2, 5.5)
        : clampValue(baseLam * (0.78 + 0.44 * pHome), 1.4, 5.0);
    const lamA =
      typeof params.nhlLambda60Away === "number" && Number.isFinite(params.nhlLambda60Away)
        ? clampValue(params.nhlLambda60Away, 1.2, 5.5)
        : clampValue(baseLam * (0.78 + 0.44 * pAway), 1.4, 5.0);
    const strengthShareHome = clampValue(0.5 + 0.24 * (pHome - 0.5), 0.38, 0.62);
    return evaluateNhlEarlyPayoutDpV60({
      lam60Home: lamH,
      lam60Away: lamA,
      pHomeFull: pHome,
      pAwayFull: pAway,
      strengthShareHome,
      epCfg: nhlCfg,
    });
  }

  const epCfg = multisportArtifact.early_payout_config[params.sport];
  const sigma =
    typeof params.sigmaMarginOverride === "number" && Number.isFinite(params.sigmaMarginOverride)
      ? Math.max(0.5, params.sigmaMarginOverride)
      : epCfg.sigma_margin;

  return evaluateBrownianEarlyPayoutV60({
    sport: params.sport,
    pHomeWin: pHome,
    pAwayWin: pAway,
    triggerLead: epCfg.trigger_lead,
    sigmaMargin: sigma,
    effectiveBarrier: epCfg.effective_barrier,
    intraGameStatus: epCfg.intra_game_validation_status,
  });
}

export interface EvaluateUsMultisportV6MatchInput {
  readonly sport: MultiSportLeagueV60;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly homeCode?: string | null;
  readonly awayCode?: string | null;
  readonly gameDate: string;
  readonly neutralSite?: boolean;
  readonly totalLine?: number | null;
  readonly spreadLineHome?: number | null;
  readonly livePHomeAnchor?: number | null;
  readonly expectedMarginOverride?: number | null;
  readonly expectedTotalOverride?: number | null;
  readonly isIndoor?: boolean;
  readonly isTurf?: boolean;
}

export interface UsMultisportV6MatchEvaluation {
  readonly sport: MultiSportLeagueV60;
  readonly resolvedFromState: boolean;
  readonly homeCode: string | null;
  readonly awayCode: string | null;
  readonly outlook: MultiSportWalkforwardOutlookV60;
  readonly earlyPayoutAnchored: EarlyPayoutOutlookV60;
  readonly earlyPayoutValidatedOos: boolean;
}

export function evaluateUsMultisportV6Match(
  params: EvaluateUsMultisportV6MatchInput,
): UsMultisportV6MatchEvaluation {
  const fromState = tryProjectMultiSportFromStateV6({
    sport: params.sport,
    homeTeam: params.homeTeam,
    awayTeam: params.awayTeam,
    homeCode: params.homeCode ?? null,
    awayCode: params.awayCode ?? null,
    gameDate: params.gameDate,
    neutralSite: params.neutralSite ?? false,
    totalLine: params.totalLine ?? null,
    spreadLineHome: params.spreadLineHome ?? null,
  });

  let outlook: MultiSportWalkforwardOutlookV60;
  let resolvedFromState = false;
  let homeCode: string | null = null;
  let awayCode: string | null = null;

  if (fromState) {
    outlook = fromState.outlook;
    resolvedFromState = true;
    homeCode = fromState.homeCode;
    awayCode = fromState.awayCode;
  } else if (params.sport === "mlb") {
    outlook = projectMlbWalkforwardOutlookV60(
      {
        neutral_site: params.neutralSite ?? false,
        ...(typeof params.totalLine === "number" && Number.isFinite(params.totalLine)
          ? { total_line: params.totalLine }
          : {}),
      },
      getMultisportArtifactV6(),
    );
  } else if (params.sport === "nhl") {
    outlook = projectNhlWalkforwardOutlookV60(
      {
        neutral_site: params.neutralSite ?? false,
        ...(typeof params.totalLine === "number" && Number.isFinite(params.totalLine)
          ? { total_line: params.totalLine }
          : {}),
      },
      getMultisportArtifactV6(),
    );
  } else if (params.sport === "nba") {
    outlook = projectNbaWalkforwardOutlookV60(
      {
        neutral_site: params.neutralSite ?? false,
        structural_margin_override: params.expectedMarginOverride ?? null,
        structural_total_override: params.expectedTotalOverride ?? null,
        spread_line_home: params.spreadLineHome ?? null,
        total_line: params.totalLine ?? null,
      },
      getMultisportArtifactV6(),
    );
  } else {
    outlook = projectNflWalkforwardOutlookV60(
      {
        neutral_site: params.neutralSite ?? false,
        is_indoor: params.isIndoor ?? false,
        is_turf: params.isTurf ?? false,
        expected_margin_override: params.expectedMarginOverride ?? null,
        expected_total_override: params.expectedTotalOverride ?? null,
        spread_line_home: params.spreadLineHome ?? null,
        total_line: params.totalLine ?? null,
      },
      getMultisportArtifactV6(),
    );
  }

  const pHomeAnchor =
    typeof params.livePHomeAnchor === "number" && Number.isFinite(params.livePHomeAnchor)
      ? clampProb(params.livePHomeAnchor)
      : outlook.p_home;

  const earlyPayoutAnchored =
    typeof params.livePHomeAnchor === "number" && Number.isFinite(params.livePHomeAnchor)
      ? evaluateUsEarlyPayoutV6({
          sport: params.sport,
          pHomeWin: pHomeAnchor,
          sigmaMarginOverride:
            outlook.sport === "nba" ? outlook.sigma_margin_effective : null,
          nhlLambda60Home: outlook.sport === "nhl" ? outlook.lambda60_home : null,
          nhlLambda60Away: outlook.sport === "nhl" ? outlook.lambda60_away : null,
        })
      : outlook.early_payout;

  return Object.freeze({
    sport: params.sport,
    resolvedFromState,
    homeCode,
    awayCode,
    outlook,
    earlyPayoutAnchored,
    earlyPayoutValidatedOos: isEarlyPayoutValidatedOosV6(earlyPayoutAnchored),
  });
}

export function solveNflMarginFromWinProbV6(
  pHome2Way: number,
  pTie: number = 0.004,
): NflKeyMarginSolutionV60 {
  const nflCfg = getMultisportArtifactV6().physics_config.nfl;
  const targetPHome = clampProb(pHome2Way);
  const safeTie = clampValue(pTie, 1e-6, 0.05);
  let lo = -28.0;
  let hi = 28.0;
  for (let iter = 0; iter < 34; iter += 1) {
    const mid = 0.5 * (lo + hi);
    const sol = solveNflKeyMarginPmfV60(mid, safeTie, nflCfg);
    const nonTie = Math.max(sol.p_home_3way + sol.p_away_3way, 1e-12);
    const pHomeMid = sol.p_home_3way / nonTie;
    if (pHomeMid < targetPHome) lo = mid;
    else hi = mid;
  }
  return solveNflKeyMarginPmfV60(0.5 * (lo + hi), safeTie, nflCfg);
}

export interface NflAltSpreadEvaluationV6 {
  readonly expectedMargin: number;
  readonly stdMargin: number;
  readonly nfl3Way: {
    readonly pHome: number;
    readonly pTie: number;
    readonly pAway: number;
  };
  readonly keyNumberMasses: {
    readonly m3: number;
    readonly m6: number;
    readonly m7: number;
    readonly m10: number;
    readonly m14: number;
  };
  readonly primary: SpreadLineProjectionV60;
  readonly byLine: Readonly<Record<string, SpreadLineProjectionV60>>;
}

export function evaluateNflAltSpreadV6(params: {
  readonly expectedMargin: number;
  readonly spreadHome: number;
  readonly pTie?: number;
  readonly altLines?: readonly number[];
}): NflAltSpreadEvaluationV6 {
  const nflCfg = getMultisportArtifactV6().physics_config.nfl;
  const safeTie =
    typeof params.pTie === "number" && Number.isFinite(params.pTie)
      ? clampValue(params.pTie, 1e-6, 0.05)
      : clampValue(
          nflCfg.walkforward.base_tie_prob * Math.exp(-Math.abs(params.expectedMargin) / 10.0),
          0.0005,
          0.012,
        );
  const sol = solveNflKeyMarginPmfV60(params.expectedMargin, safeTie, nflCfg);
  const primary = evalNflSpreadFromPmfV60(sol.pmf, sol.max_abs_margin, params.spreadHome);
  const lines = params.altLines ?? nflCfg.walkforward.canonical_spread_lines;
  const byLine: Record<string, SpreadLineProjectionV60> = {};
  for (const ln of lines) {
    byLine[ln.toFixed(1)] = evalNflSpreadFromPmfV60(sol.pmf, sol.max_abs_margin, ln);
  }
  const center = sol.max_abs_margin;
  return Object.freeze({
    expectedMargin: sol.expected_margin,
    stdMargin: sol.std_margin,
    nfl3Way: Object.freeze({
      pHome: sol.p_home_3way,
      pTie: sol.p_tie_3way,
      pAway: sol.p_away_3way,
    }),
    keyNumberMasses: Object.freeze({
      m3: (sol.pmf[center + 3] ?? 0) + (sol.pmf[center - 3] ?? 0),
      m6: (sol.pmf[center + 6] ?? 0) + (sol.pmf[center - 6] ?? 0),
      m7: (sol.pmf[center + 7] ?? 0) + (sol.pmf[center - 7] ?? 0),
      m10: (sol.pmf[center + 10] ?? 0) + (sol.pmf[center - 10] ?? 0),
      m14: (sol.pmf[center + 14] ?? 0) + (sol.pmf[center - 14] ?? 0),
    }),
    primary,
    byLine: Object.freeze(byLine),
  });
}

export interface NflAltTotalEvaluationV6 {
  readonly expectedTotalTarget: number;
  readonly expectedTotalImplied: number;
  readonly primary: TotalLineProjectionV60;
  readonly byLine: Readonly<Record<string, TotalLineProjectionV60>>;
}

export function evaluateNflAltTotalV6(params: {
  readonly expectedTotal: number;
  readonly line: number;
  readonly altLines?: readonly number[];
}): NflAltTotalEvaluationV6 {
  const nflCfg = getMultisportArtifactV6().physics_config.nfl;
  const sol = solveNflDiscreteKeyTotalPmfV60(params.expectedTotal, nflCfg);
  const primary = evalNflTotalFromPmfV60(sol.pmf, params.line);
  const lines = params.altLines ?? nflCfg.walkforward.canonical_total_lines;
  const byLine: Record<string, TotalLineProjectionV60> = {};
  for (const ln of lines) {
    byLine[ln.toFixed(1)] = evalNflTotalFromPmfV60(sol.pmf, ln);
  }
  return Object.freeze({
    expectedTotalTarget: params.expectedTotal,
    expectedTotalImplied: sol.expected_total_implied,
    primary,
    byLine: Object.freeze(byLine),
  });
}

export interface NflMatchServerEvaluationV6 {
  readonly expectedMargin: number;
  readonly stdMargin: number;
  readonly expectedTotal: number;
  readonly pExactPlus3: number;
  readonly pExactMinus3: number;
  readonly keyNumberMasses: {
    readonly m3: number;
    readonly m6: number;
    readonly m7: number;
    readonly m10: number;
    readonly m14: number;
  };
  readonly pOvertime: number;
  readonly fairOddsOvertimeYes: FairOdds;
  readonly spreadPosterior: SpreadLineProjectionV60 | null;
  readonly totalPosterior: TotalLineProjectionV60 | null;
  readonly canonicalTotalLine: number;
  readonly pOverCanonical: number;
  readonly earlyPayout: EarlyPayoutOutlookV60;
  readonly earlyPayoutValidatedOos: boolean;
}

export function evaluateNflMatchServerV6(params: {
  readonly pHome2Way: number;
  readonly modelExpectedTotal?: number | null;
  readonly marketSpreadHome?: number | null;
  readonly marketTotalLine?: number | null;
  readonly isIndoor?: boolean;
  readonly isTurf?: boolean;
  readonly pTie?: number;
}): NflMatchServerEvaluationV6 {
  const nflCfg = getMultisportArtifactV6().physics_config.nfl;
  const safeTie = clampValue(params.pTie ?? 0.004, 1e-6, 0.05);
  const solMargin = solveNflMarginFromWinProbV6(params.pHome2Way, safeTie);
  const center = solMargin.max_abs_margin;
  const pExactPlus3 = solMargin.pmf[center + 3] ?? 0;
  const pExactMinus3 = solMargin.pmf[center - 3] ?? 0;

  let spreadPosterior: SpreadLineProjectionV60 | null = null;
  if (
    typeof params.marketSpreadHome === "number" &&
    Number.isFinite(params.marketSpreadHome)
  ) {
    const wModel = nflCfg.spread_market_posterior_w_model;
    const posteriorMargin =
      wModel * solMargin.expected_margin + (1 - wModel) * -params.marketSpreadHome;
    const postSol = solveNflKeyMarginPmfV60(posteriorMargin, safeTie, nflCfg);
    spreadPosterior = evalNflSpreadFromPmfV60(
      postSol.pmf,
      postSol.max_abs_margin,
      params.marketSpreadHome,
    );
  }

  const rawTotal =
    typeof params.modelExpectedTotal === "number" && Number.isFinite(params.modelExpectedTotal)
      ? clampValue(params.modelExpectedTotal, 26.0, 68.0)
      : 44.5;
  const solTotalModel = solveNflDiscreteKeyTotalPmfV60(rawTotal, nflCfg);

  let totalPosterior: TotalLineProjectionV60 | null = null;
  if (typeof params.marketTotalLine === "number" && Number.isFinite(params.marketTotalLine)) {
    const wTot = nflCfg.discrete_totals.market_posterior_w_model;
    const postExpectedTotal = wTot * solTotalModel.expected_total_implied + (1 - wTot) * params.marketTotalLine;
    const postTotSol = solveNflDiscreteKeyTotalPmfV60(postExpectedTotal, nflCfg);
    totalPosterior = evalNflTotalFromPmfV60(postTotSol.pmf, params.marketTotalLine);
  }

  const canonicalLine = totalPosterior?.line ?? 44.5;
  const pOverCanonical =
    totalPosterior?.p_over_no_push ?? evalNflTotalFromPmfV60(solTotalModel.pmf, 44.5).p_over_no_push;

  const otCal = nflCfg.overtime_calibration;
  const xOt = [
    Math.exp(-Math.abs(solMargin.expected_margin) / 7.0),
    (solTotalModel.expected_total_implied - 44.0) / 10.0,
    params.isIndoor ? 1.0 : 0.0,
    params.isTurf ? 1.0 : 0.0,
  ];
  let etaOt = otCal.intercept;
  for (let i = 0; i < otCal.coef.length; i += 1) {
    etaOt += (otCal.coef[i] ?? 0) * (xOt[i] ?? 0);
  }
  const pOvertime = clampValue(1 / (1 + Math.exp(-etaOt)), 0.005, 0.25);

  const earlyPayout = evaluateUsEarlyPayoutV6({
    sport: "nfl",
    pHomeWin: params.pHome2Way,
  });

  return Object.freeze({
    expectedMargin: solMargin.expected_margin,
    stdMargin: solMargin.std_margin,
    expectedTotal: solTotalModel.expected_total_implied,
    pExactPlus3,
    pExactMinus3,
    keyNumberMasses: Object.freeze({
      m3: pExactPlus3 + pExactMinus3,
      m6: (solMargin.pmf[center + 6] ?? 0) + (solMargin.pmf[center - 6] ?? 0),
      m7: (solMargin.pmf[center + 7] ?? 0) + (solMargin.pmf[center - 7] ?? 0),
      m10: (solMargin.pmf[center + 10] ?? 0) + (solMargin.pmf[center - 10] ?? 0),
      m14: (solMargin.pmf[center + 14] ?? 0) + (solMargin.pmf[center - 14] ?? 0),
    }),
    pOvertime,
    fairOddsOvertimeYes: probabilityToFairOdds(clampProb(pOvertime)),
    spreadPosterior,
    totalPosterior,
    canonicalTotalLine: canonicalLine,
    pOverCanonical,
    earlyPayout,
    earlyPayoutValidatedOos: isEarlyPayoutValidatedOosV6(earlyPayout),
  });
}

export function resolveOfficialPriorServerV6(params: {
  readonly refereeName?: string | null;
  readonly league: string;
}): ResolvedOfficialPriorV6 {
  const slug = normalizeLeagueSlugV6(params.league);
  return resolveOfficialPriorV6({
    refereeName: params.refereeName ?? null,
    league: slug,
    artifact: getOfficialsFreezeArtifactV6(),
  });
}

export function resolveOfficialPriorByDivV6(
  refereeName: string | null | undefined,
  divOrLeague?: string | null,
): ResolvedOfficialPriorV6 {
  let league = "amistosos";
  if (divOrLeague && divOrLeague.trim()) {
    const trimmed = divOrLeague.trim();
    const upper = trimmed.toUpperCase();
    const lower = normalizeLeagueSlugV6(trimmed);
    if (hasOwn(V5_DIV_TO_LEAGUE_V6, upper)) {
      league = V5_DIV_TO_LEAGUE_V6[upper]!;
    } else if (
      hasOwn(getOfficialsFreezeArtifactV6().competition_priors, lower) ||
      isMultiSportLeagueV60(lower)
    ) {
      league = lower;
    }
  }
  return resolveOfficialPriorServerV6({ refereeName: refereeName ?? null, league });
}

export function getOfficialCompetitionPriorV6(league: string): CompetitionDisciplinaryPriorV6 | null {
  const slug = normalizeLeagueSlugV6(league);
  const officialsArtifact = getOfficialsFreezeArtifactV6();
  if (!hasOwn(officialsArtifact.competition_priors, slug)) return null;
  return officialsArtifact.competition_priors[slug] ?? null;
}

export function computeBookingPointsServerV6(params: {
  readonly yellowRatePrior: number;
  readonly redCardRatePrior: number;
  readonly lines?: readonly number[];
}): ConditionalBookingPointsResultV6 {
  const officialsArtifact = getOfficialsFreezeArtifactV6();
  return computeConditionalBookingPointsV6({
    yellowRatePrior: params.yellowRatePrior,
    redCardRatePrior: params.redCardRatePrior,
    gammaRed: officialsArtifact.booking_points_gamma_red,
    rYellow: officialsArtifact.r_dispersion_yellow,
    rRed: officialsArtifact.r_dispersion_red,
    lines: params.lines ?? officialsArtifact.booking_points_lines,
  });
}

export function evaluateSgpCopulaV6(params: {
  readonly sport: "soccer" | "nfl";
  readonly legs: readonly SgpLegInput[];
  readonly offeredCombinedDecimalOdds?: number | null;
}): SgpCopulaAuditView {
  const evaluated = evaluateStudentTSameGameParlayV5({
    sport: params.sport,
    legs: params.legs,
    artifact: getSgpArtifactMemo(),
    offeredCombinedDecimalOdds: params.offeredCombinedDecimalOdds ?? null,
  });

  return {
    sport: evaluated.sport,
    nLegs: evaluated.nLegs,
    independentProbability: round4(evaluated.independentProbability),
    jointProbability: round4(evaluated.jointProbability),
    correlationMultiplier: round4(evaluated.correlationMultiplier),
    correlationDirection: evaluated.correlationDirection,
    fairCombinedDecimal: round2(evaluated.fairCombinedOdds.decimal),
    fairCombinedAmerican: Math.round(evaluated.fairCombinedOdds.american),
    bookQuoteAudit: evaluated.bookQuoteAudit
      ? {
          offeredDecimal: round2(evaluated.bookQuoteAudit.offeredCombinedDecimalOdds),
          impliedBookProbability: round4(evaluated.bookQuoteAudit.impliedBookProbability),
          fairCombinedDecimal: round2(evaluated.bookQuoteAudit.fairCombinedDecimalOdds),
          effectiveHoldPct: round1(evaluated.bookQuoteAudit.effectiveHoldPct),
          taxFlag: evaluated.bookQuoteAudit.taxFlag,
        }
      : null,
  };
}

export interface PlayerLinkedSgpServerResultV6 {
  readonly pPlayerScores: number;
  readonly pTeamOutcomeMarginal: number;
  readonly pTotalOutcomeMarginal: number | null;
  readonly independentProbability: number;
  readonly jointProbability: number;
  readonly probabilityLowerBound: number;
  readonly probabilityUpperBound: number;
  readonly structuralLiftMultiplier: number;
  readonly correlationDirection:
    | "positively_correlated"
    | "negatively_correlated"
    | "near_independent";
  readonly dixonColesRhoUsed: number;
  readonly fairCombinedDecimal: number;
  readonly fairCombinedAmerican: number;
  readonly bookQuoteAudit: SgpCopulaAuditView["bookQuoteAudit"];
}

export function evaluatePlayerLinkedSgpV6(params: {
  readonly pPlayerAnytimeGoal: number;
  readonly teamExpectedGoals: number;
  readonly opponentExpectedGoals: number;
  readonly teamOutcome: "team_win" | "team_win_or_draw" | "any";
  readonly matchTotalOverLine?: number | null;
  readonly offeredCombinedDecimalOdds?: number | null;
  readonly dixonColesRho?: number;
}): PlayerLinkedSgpServerResultV6 {
  const dcRho =
    params.dixonColesRho ??
    readSpacetimeDataJson<RawSgpArtifactJson>(FILE_SGP_COPULA_V5).default_player_linked_dc_rho;
  const evaluated = evaluatePlayerLinkedSgpV5({
    pPlayerAnytimeGoal: params.pPlayerAnytimeGoal,
    teamExpectedGoals: params.teamExpectedGoals,
    opponentExpectedGoals: params.opponentExpectedGoals,
    teamOutcome: params.teamOutcome,
    matchTotalOverLine: params.matchTotalOverLine ?? null,
    offeredCombinedDecimalOdds: params.offeredCombinedDecimalOdds ?? null,
    dixonColesRho: dcRho,
  });

  const marginals: number[] = [evaluated.pPlayerScores];
  if (params.teamOutcome !== "any") marginals.push(evaluated.pTeamOutcomeMarginal);
  if (evaluated.pTotalOutcomeMarginal !== null) marginals.push(evaluated.pTotalOutcomeMarginal);
  const upperBound = Math.max(0, Math.min(...marginals));
  const lowerBound = Math.min(
    upperBound,
    Math.max(0, marginals.reduce((acc, p) => acc + p, 0) - (marginals.length - 1)),
  );
  const correlationDirection: PlayerLinkedSgpServerResultV6["correlationDirection"] =
    evaluated.structuralLiftMultiplier > 1.03
      ? "positively_correlated"
      : evaluated.structuralLiftMultiplier < 0.97
        ? "negatively_correlated"
        : "near_independent";

  return Object.freeze({
    pPlayerScores: round4(evaluated.pPlayerScores),
    pTeamOutcomeMarginal: round4(evaluated.pTeamOutcomeMarginal),
    pTotalOutcomeMarginal:
      evaluated.pTotalOutcomeMarginal !== null ? round4(evaluated.pTotalOutcomeMarginal) : null,
    independentProbability: round4(evaluated.independentProbability),
    jointProbability: round4(evaluated.jointProbability),
    probabilityLowerBound: round4(lowerBound),
    probabilityUpperBound: round4(upperBound),
    structuralLiftMultiplier: round4(evaluated.structuralLiftMultiplier),
    correlationDirection,
    dixonColesRhoUsed: dcRho,
    fairCombinedDecimal: round2(evaluated.fairCombinedOdds.decimal),
    fairCombinedAmerican: Math.round(evaluated.fairCombinedOdds.american),
    bookQuoteAudit: evaluated.bookQuoteAudit
      ? {
          offeredDecimal: round2(evaluated.bookQuoteAudit.offeredCombinedDecimalOdds),
          impliedBookProbability: round4(evaluated.bookQuoteAudit.impliedBookProbability),
          fairCombinedDecimal: round2(evaluated.bookQuoteAudit.fairCombinedDecimalOdds),
          effectiveHoldPct: round1(evaluated.bookQuoteAudit.effectiveHoldPct),
          taxFlag: evaluated.bookQuoteAudit.taxFlag,
        }
      : null,
  });
}

export interface GoalkeeperSavesSgpServerResultV6 {
  readonly savesLine: number;
  readonly matchOutcome: GoalkeeperLinkedMatchOutcomeV6;
  readonly expectedSaves: number;
  readonly effectiveRivalSoT: number;
  readonly pSavesOverMarginal: number;
  readonly pMatchOutcomeMarginal: number;
  readonly independentProbability: number;
  readonly jointProbability: number;
  readonly probabilityLowerBound: number;
  readonly probabilityUpperBound: number;
  readonly structuralMultiplier: number;
  readonly correlationDirection:
    | "positively_correlated"
    | "negatively_correlated"
    | "near_independent";
  readonly fairCombinedDecimal: number;
  readonly fairCombinedAmerican: number;
  readonly bookQuoteAudit: SgpCopulaAuditView["bookQuoteAudit"];
}

export function evaluateGoalkeeperSavesSgpServerV6(
  params: GoalkeeperSavesLinkedSgpInputV6,
): GoalkeeperSavesSgpServerResultV6 {
  const gkCfg = getPropsArtifactV6().goalkeeper_saves_v6;
  const evaluated = evaluateGoalkeeperSavesLinkedSgpV6({
    ...params,
    rDispersionSoT: params.rDispersionSoT ?? gkCfg.r_dispersion_sot,
    dixonColesRho: params.dixonColesRho ?? gkCfg.dixon_coles_rho,
    siegeOwnGoalDampening:
      params.siegeOwnGoalDampening ?? gkCfg.siege_own_goal_dampening ?? 0.028,
  });
  const fairOdds = probabilityToFairOdds(clampProb(evaluated.jointProbability));

  return Object.freeze({
    savesLine: evaluated.savesLine,
    matchOutcome: evaluated.matchOutcome,
    expectedSaves: round2(evaluated.expectedSaves),
    effectiveRivalSoT: round2(evaluated.effectiveRivalSoT),
    pSavesOverMarginal: round4(evaluated.pSavesOverMarginal),
    pMatchOutcomeMarginal: round4(evaluated.pMatchOutcomeMarginal),
    independentProbability: round4(evaluated.independentProbability),
    jointProbability: round4(evaluated.jointProbability),
    probabilityLowerBound: round4(evaluated.frechetLowerBound),
    probabilityUpperBound: round4(evaluated.frechetUpperBound),
    structuralMultiplier: round4(evaluated.structuralMultiplier),
    correlationDirection: evaluated.correlationDirection,
    fairCombinedDecimal: round2(fairOdds.decimal),
    fairCombinedAmerican: Math.round(fairOdds.american),
    bookQuoteAudit: evaluated.bookQuoteAudit
      ? {
          offeredDecimal: round2(evaluated.bookQuoteAudit.offeredCombinedDecimalOdds),
          impliedBookProbability: round4(evaluated.bookQuoteAudit.impliedBookProbability),
          fairCombinedDecimal: round2(fairOdds.decimal),
          effectiveHoldPct: round1(evaluated.bookQuoteAudit.effectiveHoldPct),
          taxFlag: evaluated.bookQuoteAudit.taxFlag,
        }
      : null,
  });
}

export function buildUnifiedMatchIntelligenceServerV6(
  input: UnifiedMatchCanonicalInputV6,
): UnifiedMatchIntelligenceV6 | null {
  if (input.sport === "soccer") {
    const slug = normalizeLeagueSlugV6(input.league);
    if (!input.soccerInput || !hasOwn(getSoccer57ArtifactV6().competitions, slug)) {
      return null;
    }
    return buildUnifiedMatchIntelligenceV6(
      { ...input, league: slug },
      getUnifiedArtifactsBundleV6(),
    );
  }

  if (!input.usSportInput) return null;
  if (input.usSportInput.mode === "post_walkforward_state") {
    const homeCode =
      resolveMultiSportTeamCodeSafeV6(input.sport, input.homeTeam, input.homeSlug) ??
      resolveMultiSportTeamCodeSafeV6(input.sport, input.homeSlug);
    const awayCode =
      resolveMultiSportTeamCodeSafeV6(input.sport, input.awayTeam, input.awaySlug) ??
      resolveMultiSportTeamCodeSafeV6(input.sport, input.awaySlug);
    if (!homeCode || !awayCode) return null;
    return buildUnifiedMatchIntelligenceV6(
      {
        ...input,
        homeSlug: homeCode,
        awaySlug: awayCode,
      },
      getUnifiedArtifactsBundleV6(),
    );
  }

  if (input.usSportInput.mode === "causal_walkforward_input") {
    const hasCausal =
      (input.sport === "mlb" && Boolean(input.usSportInput.mlbCausalInput)) ||
      (input.sport === "nhl" && Boolean(input.usSportInput.nhlCausalInput)) ||
      (input.sport === "nba" && Boolean(input.usSportInput.nbaCausalInput)) ||
      (input.sport === "nfl" && Boolean(input.usSportInput.nflCausalInput));
    if (!hasCausal) return null;
  }

  return buildUnifiedMatchIntelligenceV6(input, getUnifiedArtifactsBundleV6());
}
