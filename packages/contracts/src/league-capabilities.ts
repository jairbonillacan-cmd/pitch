import type { DataHealthCellStatus } from "./data-health.js";
import { asLeagueId, VALID_LEAGUES, type Brand } from "./ids.js";
import type { PlatformSport } from "./view-models.js";

export const FOOTBALL_MARKET_FAMILY_IDS = [
  "1x2",
  "double_chance",
  "dnb",
  "btts",
  "totals",
  "team_totals",
  "half_time_result",
  "second_half_result",
  "combo_1x2_over",
  "combo_1x2_btts",
  "asian_handicap",
  "clean_sheet",
  "win_to_nil",
  "corners_total",
  "corners_team",
  "shots_total",
  "shots_on_target",
  "fouls_total",
  "cards_total",
  "player_props_football",
] as const;

export const NBA_MARKET_FAMILY_IDS = [
  "nba_moneyline",
  "nba_spread",
  "nba_totals",
  "nba_player_props",
] as const;

export const MLB_MARKET_FAMILY_IDS = [
  "mlb_moneyline",
  "mlb_run_line",
  "mlb_f5",
  "mlb_totals",
] as const;

export const NHL_MARKET_FAMILY_IDS = [
  "nhl_moneyline",
  "nhl_puck_line",
  "nhl_totals",
] as const;

export const NFL_MARKET_FAMILY_IDS = [
  "nfl_moneyline",
  "nfl_spread",
  "nfl_totals",
] as const;

export type FootballMarketFamilyId = (typeof FOOTBALL_MARKET_FAMILY_IDS)[number];
export type NbaMarketFamilyId = (typeof NBA_MARKET_FAMILY_IDS)[number];
export type MlbMarketFamilyId = (typeof MLB_MARKET_FAMILY_IDS)[number];
export type NhlMarketFamilyId = (typeof NHL_MARKET_FAMILY_IDS)[number];
export type NflMarketFamilyId = (typeof NFL_MARKET_FAMILY_IDS)[number];
export type UsMarketFamilyId =
  | NbaMarketFamilyId
  | MlbMarketFamilyId
  | NhlMarketFamilyId
  | NflMarketFamilyId;

export type MarketFamilyId = FootballMarketFamilyId | UsMarketFamilyId;

export const MARKET_FAMILY_IDS: readonly MarketFamilyId[] = Object.freeze([
  ...FOOTBALL_MARKET_FAMILY_IDS,
  ...NBA_MARKET_FAMILY_IDS,
  ...MLB_MARKET_FAMILY_IDS,
  ...NHL_MARKET_FAMILY_IDS,
  ...NFL_MARKET_FAMILY_IDS,
]);

export const MARKET_FAMILY_COUNT = MARKET_FAMILY_IDS.length;

const FOOTBALL_NON_PROP_MARKET_FAMILY_IDS: readonly FootballMarketFamilyId[] = Object.freeze(
  FOOTBALL_MARKET_FAMILY_IDS.filter(
    (family): family is FootballMarketFamilyId => family !== "player_props_football",
  ),
);

const FOOTBALL_BASE_MARKET_FAMILY_IDS: readonly FootballMarketFamilyId[] = Object.freeze([
  "1x2",
  "double_chance",
  "dnb",
  "btts",
  "totals",
  "team_totals",
  "half_time_result",
  "second_half_result",
  "combo_1x2_over",
  "combo_1x2_btts",
  "asian_handicap",
  "clean_sheet",
  "win_to_nil",
]);

export type ProductLeagueKey = Exclude<(typeof VALID_LEAGUES)[number], "ncaaf">;
export type ProductLeagueId = Brand<ProductLeagueKey, "LeagueId">;

export type LeagueTier = "tier1_core" | "tier1_major_cup" | "tier2_expansion";
export type UiVisibilityPolicy = "always" | "only_when_healthy";

export type ScheduleProvider = "bzzoiro" | "nflverse" | "espn";
export type OddsProvider = "bzzoiro" | "the_odds_api" | "none";
export type LiveProvider = "bzzoiro" | "espn" | "none";
export type PlayerLogsProvider = "bzzoiro_football" | "bzzoiro_nba" | "espn" | "none";
export type StandingsSplit = "total" | "home" | "away";

export interface LeagueProvidersConfig {
  readonly schedule: ScheduleProvider;
  readonly odds: OddsProvider;
  readonly live: LiveProvider;
  readonly tacticalTelemetry: boolean;
  readonly referees: boolean;
  readonly playerLogs: PlayerLogsProvider;
}

export interface LeagueCompetitionFormat {
  readonly standingsSplits: readonly StandingsSplit[];
  readonly hasStandingsTable: boolean;
  readonly hasKnockoutBracket: boolean;
  readonly hasRelegationZones: boolean;
}

export interface LeagueCapabilityContract {
  readonly id: ProductLeagueId;
  readonly sport: PlatformSport;
  readonly tier: LeagueTier;
  readonly providers: LeagueProvidersConfig;
  readonly competitionFormat: LeagueCompetitionFormat;
  readonly hasSpacetimeV5: boolean;
  readonly hasLivePolling: boolean;
  readonly hasOddsIngest: boolean;
  readonly hasPlayerProps: boolean;
  readonly hasStandingsTable: boolean;
  readonly hasKnockoutBracket: boolean;
  readonly hasRelegationZones: boolean;
  readonly supportedMarketFamilies: readonly MarketFamilyId[];
  readonly minFreshnessHours: number;
  readonly uiVisibilityPolicy: UiVisibilityPolicy;
  readonly bzzoiroId: number | null;
  readonly bzzoiroLeagueIds: readonly number[];
}

export interface LeagueHealthCellInput {
  readonly status: DataHealthCellStatus;
  readonly ageHours: number | null;
  readonly recordsCount: number;
}

export interface LeagueHealthCheckInput {
  readonly hasValidSnapshot?: boolean;
  readonly gamesCount?: number;
  readonly snapshotAgeHours?: number | null;
  readonly calendarioStatus?: DataHealthCellStatus;
  readonly hasFreshOdds?: boolean;
  readonly hasStandings?: boolean;
  readonly hasError?: boolean;
  readonly cells?: {
    readonly calendario: LeagueHealthCellInput;
    readonly bajas?: LeagueHealthCellInput;
    readonly momios?: LeagueHealthCellInput;
  };
}

const FULL_STANDINGS_SPLITS: readonly StandingsSplit[] = Object.freeze(["total", "home", "away"]);
const EMPTY_STANDINGS_SPLITS: readonly StandingsSplit[] = Object.freeze([]);
const EMPTY_BZZOIRO_IDS: readonly number[] = Object.freeze([]);

function asProductLeagueId(id: ProductLeagueKey): ProductLeagueId {
  return asLeagueId(id) as ProductLeagueId;
}

interface BuildCapabilityInput {
  readonly id: ProductLeagueKey;
  readonly sport: PlatformSport;
  readonly tier: LeagueTier;
  readonly providers: LeagueProvidersConfig;
  readonly hasSpacetimeV5: boolean;
  readonly hasLivePolling: boolean;
  readonly hasOddsIngest: boolean;
  readonly hasPlayerProps: boolean;
  readonly hasStandingsTable: boolean;
  readonly hasKnockoutBracket: boolean;
  readonly hasRelegationZones: boolean;
  readonly supportedMarketFamilies: readonly MarketFamilyId[];
  readonly minFreshnessHours: number;
  readonly uiVisibilityPolicy: UiVisibilityPolicy;
  readonly bzzoiroId: number | null;
  readonly bzzoiroLeagueIds?: readonly number[];
}

function defineCapability(input: BuildCapabilityInput): LeagueCapabilityContract {
  const leagueIds =
    input.bzzoiroLeagueIds !== undefined
      ? Object.freeze([...input.bzzoiroLeagueIds])
      : input.bzzoiroId !== null
        ? Object.freeze([input.bzzoiroId])
        : EMPTY_BZZOIRO_IDS;
  const standingsSplits = input.hasStandingsTable ? FULL_STANDINGS_SPLITS : EMPTY_STANDINGS_SPLITS;
  const providers: LeagueProvidersConfig = Object.freeze({ ...input.providers });
  const competitionFormat: LeagueCompetitionFormat = Object.freeze({
    standingsSplits,
    hasStandingsTable: input.hasStandingsTable,
    hasKnockoutBracket: input.hasKnockoutBracket,
    hasRelegationZones: input.hasRelegationZones,
  });

  return Object.freeze({
    id: asProductLeagueId(input.id),
    sport: input.sport,
    tier: input.tier,
    providers,
    competitionFormat,
    hasSpacetimeV5: input.hasSpacetimeV5,
    hasLivePolling: input.hasLivePolling,
    hasOddsIngest: input.hasOddsIngest,
    hasPlayerProps: input.hasPlayerProps,
    hasStandingsTable: input.hasStandingsTable,
    hasKnockoutBracket: input.hasKnockoutBracket,
    hasRelegationZones: input.hasRelegationZones,
    supportedMarketFamilies: input.supportedMarketFamilies,
    minFreshnessHours: input.minFreshnessHours,
    uiVisibilityPolicy: input.uiVisibilityPolicy,
    bzzoiroId: input.bzzoiroId,
    bzzoiroLeagueIds: leagueIds,
  });
}

function tier1CoreFootball(
  id: ProductLeagueKey,
  bzzoiroId: number,
  format: {
    readonly hasKnockoutBracket: boolean;
    readonly hasRelegationZones: boolean;
    readonly bzzoiroLeagueIds?: readonly number[];
  },
): LeagueCapabilityContract {
  return defineCapability({
    id,
    sport: "football",
    tier: "tier1_core",
    providers: {
      schedule: "bzzoiro",
      odds: "bzzoiro",
      live: "bzzoiro",
      tacticalTelemetry: true,
      referees: true,
      playerLogs: "bzzoiro_football",
    },
    hasSpacetimeV5: true,
    hasLivePolling: true,
    hasOddsIngest: true,
    hasPlayerProps: true,
    hasStandingsTable: true,
    hasKnockoutBracket: format.hasKnockoutBracket,
    hasRelegationZones: format.hasRelegationZones,
    supportedMarketFamilies: FOOTBALL_MARKET_FAMILY_IDS,
    minFreshnessHours: 30,
    uiVisibilityPolicy: "always",
    bzzoiroId,
    bzzoiroLeagueIds: format.bzzoiroLeagueIds,
  });
}

function tier1BzzoiroMajorCup(
  id: ProductLeagueKey,
  bzzoiroId: number,
): LeagueCapabilityContract {
  return defineCapability({
    id,
    sport: "football",
    tier: "tier1_major_cup",
    providers: {
      schedule: "bzzoiro",
      odds: "bzzoiro",
      live: "bzzoiro",
      tacticalTelemetry: true,
      referees: true,
      playerLogs: "bzzoiro_football",
    },
    hasSpacetimeV5: true,
    hasLivePolling: true,
    hasOddsIngest: true,
    hasPlayerProps: true,
    hasStandingsTable: true,
    hasKnockoutBracket: true,
    hasRelegationZones: false,
    supportedMarketFamilies: FOOTBALL_MARKET_FAMILY_IDS,
    minFreshnessHours: 36,
    uiVisibilityPolicy: "always",
    bzzoiroId,
  });
}

function tier2BzzoiroFootball(
  id: ProductLeagueKey,
  bzzoiroId: number,
  format: {
    readonly hasStandingsTable: boolean;
    readonly hasKnockoutBracket: boolean;
    readonly hasRelegationZones: boolean;
  },
): LeagueCapabilityContract {
  return defineCapability({
    id,
    sport: "football",
    tier: "tier2_expansion",
    providers: {
      schedule: "bzzoiro",
      odds: "bzzoiro",
      live: "bzzoiro",
      tacticalTelemetry: true,
      referees: true,
      playerLogs: "bzzoiro_football",
    },
    hasSpacetimeV5: true,
    hasLivePolling: true,
    hasOddsIngest: true,
    hasPlayerProps: false,
    hasStandingsTable: format.hasStandingsTable,
    hasKnockoutBracket: format.hasKnockoutBracket,
    hasRelegationZones: format.hasRelegationZones,
    supportedMarketFamilies: FOOTBALL_NON_PROP_MARKET_FAMILY_IDS,
    minFreshnessHours: 48,
    uiVisibilityPolicy: "only_when_healthy",
    bzzoiroId,
  });
}

function tier2NationalTeam(
  id: ProductLeagueKey,
  format: {
    readonly hasStandingsTable: boolean;
    readonly hasKnockoutBracket: boolean;
  },
): LeagueCapabilityContract {
  return defineCapability({
    id,
    sport: "football",
    tier: "tier2_expansion",
    providers: {
      schedule: "espn",
      odds: "none",
      live: "none",
      tacticalTelemetry: false,
      referees: false,
      playerLogs: "none",
    },
    hasSpacetimeV5: true,
    hasLivePolling: false,
    hasOddsIngest: false,
    hasPlayerProps: false,
    hasStandingsTable: format.hasStandingsTable,
    hasKnockoutBracket: format.hasKnockoutBracket,
    hasRelegationZones: false,
    supportedMarketFamilies: FOOTBALL_BASE_MARKET_FAMILY_IDS,
    minFreshnessHours: 72,
    uiVisibilityPolicy: "only_when_healthy",
    bzzoiroId: null,
  });
}

export const LEAGUE_CAPABILITY_LIST: readonly LeagueCapabilityContract[] = Object.freeze([
  tier1CoreFootball("liga-mx", 19, {
    hasKnockoutBracket: true,
    hasRelegationZones: false,
    bzzoiroLeagueIds: [19, 20],
  }),
  tier1CoreFootball("premier-league", 1, {
    hasKnockoutBracket: false,
    hasRelegationZones: true,
  }),
  tier1CoreFootball("laliga", 3, {
    hasKnockoutBracket: false,
    hasRelegationZones: true,
  }),
  tier1CoreFootball("bundesliga", 5, {
    hasKnockoutBracket: false,
    hasRelegationZones: true,
  }),
  tier1CoreFootball("serie-a", 4, {
    hasKnockoutBracket: false,
    hasRelegationZones: true,
  }),
  tier1CoreFootball("ligue-1", 6, {
    hasKnockoutBracket: false,
    hasRelegationZones: true,
  }),

  tier1BzzoiroMajorCup("champions-league", 7),
  tier1BzzoiroMajorCup("europa-league", 8),
  tier1BzzoiroMajorCup("libertadores", 32),
  defineCapability({
    id: "concacaf-champions",
    sport: "football",
    tier: "tier1_major_cup",
    providers: {
      schedule: "espn",
      odds: "the_odds_api",
      live: "espn",
      tacticalTelemetry: false,
      referees: true,
      playerLogs: "espn",
    },
    hasSpacetimeV5: true,
    hasLivePolling: false,
    hasOddsIngest: true,
    hasPlayerProps: false,
    hasStandingsTable: false,
    hasKnockoutBracket: true,
    hasRelegationZones: false,
    supportedMarketFamilies: FOOTBALL_NON_PROP_MARKET_FAMILY_IDS,
    minFreshnessHours: 36,
    uiVisibilityPolicy: "always",
    bzzoiroId: null,
  }),
  tier1BzzoiroMajorCup("mls", 18),

  defineCapability({
    id: "nfl",
    sport: "american-football",
    tier: "tier1_core",
    providers: {
      schedule: "nflverse",
      odds: "the_odds_api",
      live: "espn",
      tacticalTelemetry: false,
      referees: true,
      playerLogs: "espn",
    },
    hasSpacetimeV5: true,
    hasLivePolling: false,
    hasOddsIngest: true,
    hasPlayerProps: false,
    hasStandingsTable: true,
    hasKnockoutBracket: true,
    hasRelegationZones: false,
    supportedMarketFamilies: NFL_MARKET_FAMILY_IDS,
    minFreshnessHours: 30,
    uiVisibilityPolicy: "always",
    bzzoiroId: null,
  }),
  defineCapability({
    id: "nba",
    sport: "basketball",
    tier: "tier1_core",
    providers: {
      schedule: "espn",
      odds: "bzzoiro",
      live: "bzzoiro",
      tacticalTelemetry: false,
      referees: true,
      playerLogs: "bzzoiro_nba",
    },
    hasSpacetimeV5: true,
    hasLivePolling: true,
    hasOddsIngest: true,
    hasPlayerProps: true,
    hasStandingsTable: true,
    hasKnockoutBracket: true,
    hasRelegationZones: false,
    supportedMarketFamilies: NBA_MARKET_FAMILY_IDS,
    minFreshnessHours: 30,
    uiVisibilityPolicy: "always",
    bzzoiroId: 1,
  }),
  defineCapability({
    id: "nhl",
    sport: "ice-hockey",
    tier: "tier1_core",
    providers: {
      schedule: "espn",
      odds: "the_odds_api",
      live: "espn",
      tacticalTelemetry: false,
      referees: false,
      playerLogs: "espn",
    },
    hasSpacetimeV5: true,
    hasLivePolling: false,
    hasOddsIngest: true,
    hasPlayerProps: false,
    hasStandingsTable: true,
    hasKnockoutBracket: true,
    hasRelegationZones: false,
    supportedMarketFamilies: NHL_MARKET_FAMILY_IDS,
    minFreshnessHours: 30,
    uiVisibilityPolicy: "always",
    bzzoiroId: null,
  }),
  defineCapability({
    id: "mlb",
    sport: "baseball",
    tier: "tier1_core",
    providers: {
      schedule: "espn",
      odds: "the_odds_api",
      live: "espn",
      tacticalTelemetry: false,
      referees: false,
      playerLogs: "espn",
    },
    hasSpacetimeV5: true,
    hasLivePolling: false,
    hasOddsIngest: true,
    hasPlayerProps: false,
    hasStandingsTable: true,
    hasKnockoutBracket: true,
    hasRelegationZones: false,
    supportedMarketFamilies: MLB_MARKET_FAMILY_IDS,
    minFreshnessHours: 30,
    uiVisibilityPolicy: "always",
    bzzoiroId: null,
  }),

  defineCapability({
    id: "leagues-cup",
    sport: "football",
    tier: "tier2_expansion",
    providers: {
      schedule: "espn",
      odds: "none",
      live: "espn",
      tacticalTelemetry: false,
      referees: false,
      playerLogs: "none",
    },
    hasSpacetimeV5: true,
    hasLivePolling: false,
    hasOddsIngest: false,
    hasPlayerProps: false,
    hasStandingsTable: false,
    hasKnockoutBracket: true,
    hasRelegationZones: false,
    supportedMarketFamilies: FOOTBALL_BASE_MARKET_FAMILY_IDS,
    minFreshnessHours: 48,
    uiVisibilityPolicy: "only_when_healthy",
    bzzoiroId: null,
  }),
  tier2BzzoiroFootball("conference-league", 83, {
    hasStandingsTable: true,
    hasKnockoutBracket: true,
    hasRelegationZones: false,
  }),
  tier2BzzoiroFootball("uefa-super-cup", 90, {
    hasStandingsTable: false,
    hasKnockoutBracket: true,
    hasRelegationZones: false,
  }),
  tier2BzzoiroFootball("sudamericana", 33, {
    hasStandingsTable: true,
    hasKnockoutBracket: true,
    hasRelegationZones: false,
  }),
  tier2BzzoiroFootball("caf-champions", 29, {
    hasStandingsTable: true,
    hasKnockoutBracket: true,
    hasRelegationZones: false,
  }),

  tier2BzzoiroFootball("liga-argentina", 85, {
    hasStandingsTable: true,
    hasKnockoutBracket: true,
    hasRelegationZones: true,
  }),
  tier2BzzoiroFootball("brasileirao", 9, {
    hasStandingsTable: true,
    hasKnockoutBracket: false,
    hasRelegationZones: true,
  }),
  tier2BzzoiroFootball("brasileirao-b", 34, {
    hasStandingsTable: true,
    hasKnockoutBracket: false,
    hasRelegationZones: true,
  }),
  tier2BzzoiroFootball("copa-do-brasil", 35, {
    hasStandingsTable: false,
    hasKnockoutBracket: true,
    hasRelegationZones: false,
  }),
  tier2BzzoiroFootball("primera-a-colombia", 80, {
    hasStandingsTable: true,
    hasKnockoutBracket: true,
    hasRelegationZones: true,
  }),
  tier2BzzoiroFootball("copa-colombia", 81, {
    hasStandingsTable: false,
    hasKnockoutBracket: true,
    hasRelegationZones: false,
  }),
  tier2BzzoiroFootball("primera-chile", 111, {
    hasStandingsTable: true,
    hasKnockoutBracket: false,
    hasRelegationZones: true,
  }),
  tier2BzzoiroFootball("ligapro-ecuador", 112, {
    hasStandingsTable: true,
    hasKnockoutBracket: true,
    hasRelegationZones: true,
  }),
  tier2BzzoiroFootball("liga-1-peru", 113, {
    hasStandingsTable: true,
    hasKnockoutBracket: true,
    hasRelegationZones: true,
  }),

  tier2BzzoiroFootball("championship", 12, {
    hasStandingsTable: true,
    hasKnockoutBracket: true,
    hasRelegationZones: true,
  }),
  tier2BzzoiroFootball("fa-cup", 39, {
    hasStandingsTable: false,
    hasKnockoutBracket: true,
    hasRelegationZones: false,
  }),
  tier2BzzoiroFootball("carabao-cup", 40, {
    hasStandingsTable: false,
    hasKnockoutBracket: true,
    hasRelegationZones: false,
  }),
  tier2BzzoiroFootball("segunda-espana", 38, {
    hasStandingsTable: true,
    hasKnockoutBracket: true,
    hasRelegationZones: true,
  }),
  tier2BzzoiroFootball("copa-del-rey", 41, {
    hasStandingsTable: false,
    hasKnockoutBracket: true,
    hasRelegationZones: false,
  }),
  tier2BzzoiroFootball("liga-f", 36, {
    hasStandingsTable: true,
    hasKnockoutBracket: false,
    hasRelegationZones: true,
  }),
  tier2BzzoiroFootball("bundesliga-2", 94, {
    hasStandingsTable: true,
    hasKnockoutBracket: false,
    hasRelegationZones: true,
  }),
  tier2BzzoiroFootball("dfb-pokal", 43, {
    hasStandingsTable: false,
    hasKnockoutBracket: true,
    hasRelegationZones: false,
  }),
  tier2BzzoiroFootball("serie-b", 100, {
    hasStandingsTable: true,
    hasKnockoutBracket: true,
    hasRelegationZones: true,
  }),
  tier2BzzoiroFootball("coppa-italia", 42, {
    hasStandingsTable: false,
    hasKnockoutBracket: true,
    hasRelegationZones: false,
  }),
  tier2BzzoiroFootball("ligue-2", 89, {
    hasStandingsTable: true,
    hasKnockoutBracket: true,
    hasRelegationZones: true,
  }),
  tier2BzzoiroFootball("coupe-de-france", 44, {
    hasStandingsTable: false,
    hasKnockoutBracket: true,
    hasRelegationZones: false,
  }),

  tier2BzzoiroFootball("eredivisie", 10, {
    hasStandingsTable: true,
    hasKnockoutBracket: false,
    hasRelegationZones: true,
  }),
  tier2BzzoiroFootball("liga-portugal", 2, {
    hasStandingsTable: true,
    hasKnockoutBracket: false,
    hasRelegationZones: true,
  }),
  tier2BzzoiroFootball("pro-league-belgica", 14, {
    hasStandingsTable: true,
    hasKnockoutBracket: true,
    hasRelegationZones: true,
  }),
  tier2BzzoiroFootball("super-lig", 11, {
    hasStandingsTable: true,
    hasKnockoutBracket: false,
    hasRelegationZones: true,
  }),
  tier2BzzoiroFootball("saudi-pro-league", 17, {
    hasStandingsTable: true,
    hasKnockoutBracket: false,
    hasRelegationZones: true,
  }),
  tier2BzzoiroFootball("j1-league", 49, {
    hasStandingsTable: true,
    hasKnockoutBracket: false,
    hasRelegationZones: true,
  }),

  tier2NationalTeam("concacaf-nations", {
    hasStandingsTable: true,
    hasKnockoutBracket: true,
  }),
  tier2NationalTeam("uefa-nations", {
    hasStandingsTable: true,
    hasKnockoutBracket: true,
  }),
  tier2NationalTeam("amistosos", {
    hasStandingsTable: false,
    hasKnockoutBracket: false,
  }),
  tier2NationalTeam("copa-del-mundo", {
    hasStandingsTable: true,
    hasKnockoutBracket: true,
  }),
  tier2NationalTeam("eliminatorias", {
    hasStandingsTable: true,
    hasKnockoutBracket: false,
  }),
  tier2NationalTeam("copa-america", {
    hasStandingsTable: true,
    hasKnockoutBracket: true,
  }),
  tier2NationalTeam("eurocopa", {
    hasStandingsTable: true,
    hasKnockoutBracket: true,
  }),
  tier2NationalTeam("copa-oro", {
    hasStandingsTable: true,
    hasKnockoutBracket: true,
  }),
  tier2NationalTeam("copa-africana", {
    hasStandingsTable: true,
    hasKnockoutBracket: true,
  }),
  tier2NationalTeam("copa-asiatica", {
    hasStandingsTable: true,
    hasKnockoutBracket: true,
  }),
]);

const LEAGUE_CAPABILITY_MAP = new Map<string, LeagueCapabilityContract>(
  LEAGUE_CAPABILITY_LIST.map((entry) => [entry.id, entry]),
);

export const LEAGUE_CAPABILITY_REGISTRY: Readonly<Record<string, LeagueCapabilityContract>> =
  Object.freeze(Object.fromEntries(LEAGUE_CAPABILITY_LIST.map((entry) => [entry.id, entry])));

export const TIER1_LEAGUE_IDS: readonly ProductLeagueId[] = Object.freeze(
  LEAGUE_CAPABILITY_LIST.filter(
    (entry) => entry.tier === "tier1_core" || entry.tier === "tier1_major_cup",
  ).map((entry) => entry.id),
);

export const TIER1_MAJOR_CUP_IDS: readonly ProductLeagueId[] = Object.freeze(
  LEAGUE_CAPABILITY_LIST.filter((entry) => entry.tier === "tier1_major_cup").map(
    (entry) => entry.id,
  ),
);

const TIER1_LEAGUE_ID_SET: ReadonlySet<string> = new Set(TIER1_LEAGUE_IDS);

export const LIVE_CAPABLE_BZZOIRO_LEAGUES: Readonly<Record<string, readonly number[]>> =
  Object.freeze(
    Object.fromEntries(
      LEAGUE_CAPABILITY_LIST.filter(
        (entry) =>
          entry.sport === "football" &&
          entry.hasLivePolling &&
          entry.bzzoiroId !== null &&
          entry.bzzoiroLeagueIds.length > 0,
      ).map((entry) => [entry.id, entry.bzzoiroLeagueIds]),
    ),
  );

export function getLeagueCapability(id: ProductLeagueKey): LeagueCapabilityContract;
export function getLeagueCapability(id: string): LeagueCapabilityContract | undefined;
export function getLeagueCapability(id: string): LeagueCapabilityContract | undefined {
  return LEAGUE_CAPABILITY_MAP.get(id);
}

export function isTier1League(id: string): boolean {
  return TIER1_LEAGUE_ID_SET.has(id);
}

function isHealthyCalendarioStatus(status: DataHealthCellStatus): boolean {
  return status === "ok" || status === "warning";
}

export function isLeagueHealthyForUi(
  id: string,
  health?: LeagueHealthCheckInput | null,
): boolean {
  const capability = LEAGUE_CAPABILITY_MAP.get(id);
  if (!capability) {
    return false;
  }
  if (capability.uiVisibilityPolicy === "always") {
    return true;
  }
  if (!health || health.hasError === true) {
    return false;
  }
  if (health.hasValidSnapshot === false) {
    return false;
  }
  if (health.hasStandings === false && capability.hasStandingsTable) {
    return false;
  }
  if (health.hasFreshOdds === false && capability.hasOddsIngest) {
    return false;
  }

  if (health.cells) {
    const calendario = health.cells.calendario;
    if (!isHealthyCalendarioStatus(calendario.status)) {
      return false;
    }
    if (!Number.isFinite(calendario.recordsCount) || calendario.recordsCount <= 0) {
      return false;
    }
    if (
      calendario.ageHours === null ||
      !Number.isFinite(calendario.ageHours) ||
      calendario.ageHours < 0 ||
      calendario.ageHours > capability.minFreshnessHours
    ) {
      return false;
    }
    if (health.cells.momios?.status === "error") {
      return false;
    }
    if (
      health.gamesCount !== undefined &&
      (!Number.isFinite(health.gamesCount) || health.gamesCount <= 0)
    ) {
      return false;
    }
    if (
      health.snapshotAgeHours !== undefined &&
      (health.snapshotAgeHours === null ||
        !Number.isFinite(health.snapshotAgeHours) ||
        health.snapshotAgeHours < 0 ||
        health.snapshotAgeHours > capability.minFreshnessHours)
    ) {
      return false;
    }
    return true;
  }

  let hasPositiveSignal = false;
  if (health.calendarioStatus !== undefined) {
    if (!isHealthyCalendarioStatus(health.calendarioStatus)) {
      return false;
    }
    hasPositiveSignal = true;
  }
  if (health.hasValidSnapshot === true) {
    hasPositiveSignal = true;
  }
  if (health.gamesCount !== undefined) {
    if (!Number.isFinite(health.gamesCount) || health.gamesCount <= 0) {
      return false;
    }
    hasPositiveSignal = true;
  }
  if (health.snapshotAgeHours !== undefined) {
    if (
      health.snapshotAgeHours === null ||
      !Number.isFinite(health.snapshotAgeHours) ||
      health.snapshotAgeHours < 0 ||
      health.snapshotAgeHours > capability.minFreshnessHours
    ) {
      return false;
    }
  }
  return hasPositiveSignal;
}
