import type {
  LeagueId,
  MarketFamilyId,
  PlatformSport,
} from "@pitchlab/contracts";
import type {
  BookQuoteItem,
  MatchIntelligenceV5View,
  PickConflictGroup,
  PlatformGameDetail,
  PlatformMarketRow,
  PlayerPropItem,
} from "../types";

export {
  FOOTBALL_MARKET_FAMILY_IDS,
  MARKET_FAMILY_COUNT,
  MARKET_FAMILY_IDS,
  MLB_MARKET_FAMILY_IDS,
  NBA_MARKET_FAMILY_IDS,
  NFL_MARKET_FAMILY_IDS,
  NHL_MARKET_FAMILY_IDS,
  type FootballMarketFamilyId,
  type MarketFamilyId,
  type MlbMarketFamilyId,
  type NbaMarketFamilyId,
  type NflMarketFamilyId,
  type NhlMarketFamilyId,
  type UsMarketFamilyId,
} from "@pitchlab/contracts";

export type CatalogCategoryKey =
  | "resultado"
  | "goles_totales"
  | "ambos_porteria"
  | "handicap_combos"
  | "conteos_arbitro"
  | "player_props";

export const CATALOG_CATEGORY_ORDER: readonly CatalogCategoryKey[] = [
  "resultado",
  "goles_totales",
  "ambos_porteria",
  "handicap_combos",
  "conteos_arbitro",
  "player_props",
] as const;

export const CATALOG_CATEGORY_LABELS: Readonly<Record<CatalogCategoryKey, string>> = {
  resultado: "Resultado y mitades",
  goles_totales: "Goles, puntos y carreras",
  ambos_porteria: "Ambos anotan y portería",
  handicap_combos: "Hándicaps y combinadas",
  conteos_arbitro: "Córners, tiros, faltas y tarjetas",
  player_props: "Player Props",
};

export type PickAxisKey =
  | "result_ft"
  | "result_ht"
  | "result_2h"
  | "result_f5"
  | "goals_total"
  | "team_goals_home"
  | "team_goals_away"
  | "btts"
  | "clean_sheet_home"
  | "clean_sheet_away"
  | "win_to_nil"
  | "handicap"
  | "combo_result_goals"
  | "combo_result_btts"
  | "corners_total"
  | "corners_home"
  | "corners_away"
  | "shots_total"
  | "sot_total"
  | "fouls_total"
  | "cards_total"
  | "player_prop"
  | "points_total"
  | "runs_total"
  | "f5_totals"
  | "exact_score"
  | MarketFamilyId;

export type PickDirection =
  | "home"
  | "draw"
  | "away"
  | "over"
  | "under"
  | "yes"
  | "no"
  | "combo";

export type PickSettlementStatus = "hit" | "miss" | "push" | "pending";

export type LineupConfirmationStatus = "confirmed" | "probable" | "unknown";

export type FootballPlayerPropStatKey =
  | "shots"
  | "shots_on_target"
  | "goal_or_assist"
  | "fouls"
  | "cards";

export type NbaPlayerPropStatKey = "PTS" | "REB" | "AST" | "3PM";

export type PlayerPropStatKey = FootballPlayerPropStatKey | NbaPlayerPropStatKey;

export type DeVigMethod = "proportional" | "shin" | "power" | "none";

export type EvidenceTone = "high" | "mid" | "low" | "neutral";

export type EvidenceWindowKey = "L5" | "L10" | "L20" | "home_away" | "h2h";

export type PickRecommendationTier =
  | "top_pick"
  | "recommended"
  | "value"
  | "playable"
  | "trivial_odds";

export interface PickRecommendationScoreResult {
  readonly score: number;
  readonly tier: PickRecommendationTier;
  readonly isRecommended: boolean;
  readonly convergenceCount: number;
  readonly valueThresholdLabel: string | null;
}

export interface MarketFamilySpec {
  readonly id: MarketFamilyId;
  readonly sport: PlatformSport;
  readonly label: string;
  readonly shortLabel: string;
  readonly category: CatalogCategoryKey;
  readonly axis: PickAxisKey;
  readonly ways: 2 | 3;
  readonly supportsPush: boolean;
  readonly requiresLineupGuard: boolean;
  readonly usesRefereeAdjustment: boolean;
  readonly sgpEligible: boolean;
  readonly description: string;
}

export interface EvidenceWindowStat {
  readonly window: EvidenceWindowKey;
  readonly label: string;
  readonly hits: number;
  readonly sample: number;
  readonly pushes: number;
  readonly ratePct: number;
  readonly meanValue: number | null;
  readonly tone: EvidenceTone;
}

export interface XgEvidenceSignal {
  readonly homeXg: number;
  readonly awayXg: number;
  readonly totalXg: number;
  readonly marginXg: number;
  readonly source: "projection" | "spacetime_v5";
  readonly summary: string;
}

export interface RefereeEvidenceSignal {
  readonly name: string;
  readonly matches: number;
  readonly rawAvgYellow: number | null;
  readonly shrunkYellowPerGame: number | null;
  readonly cardsMultiplier: number;
  readonly foulsMultiplier: number;
  readonly rigorTier: "estricto" | "promedio" | "permisivo";
  readonly summary: string;
}

export interface CatalogEvidenceBullet {
  readonly label: string;
  readonly ratePct: number | null;
  readonly tone: EvidenceTone;
}

export interface CatalogPickEvidence {
  readonly windows: readonly EvidenceWindowStat[];
  readonly xgSignal: XgEvidenceSignal | null;
  readonly refereeSignal: RefereeEvidenceSignal | null;
  readonly bullets: readonly CatalogEvidenceBullet[];
  readonly avgObservedRatePct: number | null;
}

export interface PickPricingMetrics {
  readonly p: number;
  readonly fairOdds: number;
  readonly fairAmerican: number;
  readonly marketDecimal: number | null;
  readonly marketAmerican: number | null;
  readonly marketBookLabel: string | null;
  readonly marketCapturedAtUtc: string | null;
  readonly deVigMarketProb: number | null;
  readonly deVigMethod: DeVigMethod;
  readonly overroundPct: number | null;
  readonly evPct: number | null;
  readonly edgePts: number | null;
  readonly noVigEdgePts: number | null;
  readonly valueLabel: string | null;
  readonly hasPositiveValue: boolean;
}

export interface PlayerPropMeta {
  readonly playerName: string;
  readonly playerSlug?: string;
  readonly teamSide: "home" | "away";
  readonly teamName: string;
  readonly position: string;
  readonly statKey: PlayerPropStatKey;
  readonly statLabel: string;
  readonly minMinutesGuard: number;
  readonly qualifyingMatches: number;
  readonly avgMinutes: number | null;
  readonly lineupStatus: LineupConfirmationStatus;
  readonly projectionMean: number;
  readonly projectionSd: number;
  readonly photoKey?: string | null;
  readonly teamSlug?: string | null;
}

export interface CatalogPickItem {
  readonly id: string;
  readonly gameId: string;
  readonly league: LeagueId;
  readonly leagueLabel: string;
  readonly sport: PlatformSport;
  readonly matchLabel: string;
  readonly kickoffUtc: string;
  readonly kickoffLocal: string;
  readonly gameStatus: "NS" | "FT" | "LIVE";
  readonly family: MarketFamilyId;
  readonly familyLabel: string;
  readonly category: CatalogCategoryKey;
  readonly axis: PickAxisKey;
  readonly selectionKey: string;
  readonly label: string;
  readonly line: number | null;
  readonly direction: PickDirection;
  readonly pricing: PickPricingMetrics;
  readonly evidence: CatalogPickEvidence;
  readonly settlement: PickSettlementStatus;
  readonly engineName: string;
  readonly isPrimaryModelPick: boolean;
  readonly isDerived: boolean;
  readonly conflictGroup: PickConflictGroup;
  readonly playerMeta?: PlayerPropMeta | null;
  readonly bookQuotes?: readonly BookQuoteItem[];
  readonly isDailyOpenPromo?: boolean;
  readonly isTipsterWeeklyOpen?: boolean;
  readonly isRedacted?: boolean;
  readonly recommendationScore?: number;
  readonly recommendationTier?: PickRecommendationTier;
  readonly isRecommendedByModel?: boolean;
  readonly convergenceCount?: number;
  readonly pickOfTheDayReason?: string | null;
  readonly projectedScoreLabel?: string | null;
}

export interface TeamMatchEvidenceRecord {
  readonly dateIso?: string;
  readonly isHome: boolean;
  readonly goalsFor: number;
  readonly goalsAgainst: number;
  readonly halfTimeGoalsFor?: number | null;
  readonly halfTimeGoalsAgainst?: number | null;
  readonly cornersFor?: number | null;
  readonly cornersAgainst?: number | null;
  readonly shotsFor?: number | null;
  readonly shotsAgainst?: number | null;
  readonly shotsOnTargetFor?: number | null;
  readonly shotsOnTargetAgainst?: number | null;
  readonly foulsFor?: number | null;
  readonly foulsAgainst?: number | null;
  readonly yellowCardsFor?: number | null;
  readonly yellowCardsAgainst?: number | null;
}

export interface FootballPlayerMatchLog {
  readonly minutesPlayed: number;
  readonly isHome?: boolean;
  readonly shots?: number;
  readonly shotsOnTarget?: number;
  readonly goals?: number;
  readonly assists?: number;
  readonly foulsCommitted?: number;
  readonly yellowCards?: number;
  readonly redCards?: number;
}

export interface FootballPlayerPropCandidateInput {
  readonly playerName: string;
  readonly playerSlug?: string;
  readonly photoKey?: string | null;
  readonly teamSlug?: string | null;
  readonly teamSide: "home" | "away";
  readonly teamName: string;
  readonly position: "GK" | "DEF" | "MID" | "FWD" | string;
  readonly lineupStatus?: LineupConfirmationStatus;
  readonly minMinutes?: number;
  readonly avgMinutes?: number | null;
  readonly matchLogs?: readonly FootballPlayerMatchLog[];
  readonly seasonTotals?: {
    readonly appearances: number;
    readonly shots?: number;
    readonly shotsOnTarget?: number;
    readonly goals?: number;
    readonly assists?: number;
    readonly foulsCommitted?: number;
    readonly yellowCards?: number;
    readonly redCards?: number;
  };
  readonly marketQuotes?: Readonly<
    Partial<
      Record<
        FootballPlayerPropStatKey,
        {
          readonly line: number;
          readonly overDecimal?: number | null;
          readonly underDecimal?: number | null;
          readonly bookLabel?: string | null;
          readonly capturedAtUtc?: string | null;
        }
      >
    >
  >;
}

export interface NbaPlayerMatchLog {
  readonly minutesPlayed: number;
  readonly isHome?: boolean;
  readonly PTS?: number;
  readonly REB?: number;
  readonly AST?: number;
  readonly "3PM"?: number;
}

export interface NbaPlayerPropCandidateInput {
  readonly playerName: string;
  readonly playerSlug?: string;
  readonly photoKey?: string | null;
  readonly teamSlug?: string | null;
  readonly teamSide: "home" | "away";
  readonly teamName: string;
  readonly position: string;
  readonly lineupStatus?: LineupConfirmationStatus;
  readonly minMinutes?: number;
  readonly avgMinutes?: number | null;
  readonly matchLogs?: readonly NbaPlayerMatchLog[];
  readonly statProjections?: Readonly<
    Partial<
      Record<
        NbaPlayerPropStatKey,
        {
          readonly line: number;
          readonly mean: number;
          readonly sd?: number;
          readonly last10?: readonly number[];
          readonly overDecimal?: number | null;
          readonly underDecimal?: number | null;
          readonly bookLabel?: string | null;
          readonly capturedAtUtc?: string | null;
        }
      >
    >
  >;
}

export interface MatchFinalCountStats {
  readonly cornersHome?: number;
  readonly cornersAway?: number;
  readonly shotsHome?: number;
  readonly shotsAway?: number;
  readonly shotsOnTargetHome?: number;
  readonly shotsOnTargetAway?: number;
  readonly foulsHome?: number;
  readonly foulsAway?: number;
  readonly yellowCardsHome?: number;
  readonly yellowCardsAway?: number;
  readonly playerStats?: Readonly<
    Record<string, Readonly<Partial<Record<PlayerPropStatKey, number>>>>
  >;
}

export interface CatalogBuildContext {
  readonly markets?: readonly PlatformMarketRow[];
  readonly v5?: MatchIntelligenceV5View | null;
  readonly playerProps?: readonly PlayerPropItem[];
  readonly footballPlayers?: readonly FootballPlayerPropCandidateInput[];
  readonly nbaPlayers?: readonly NbaPlayerPropCandidateInput[];
  readonly homeHistory?: readonly TeamMatchEvidenceRecord[];
  readonly awayHistory?: readonly TeamMatchEvidenceRecord[];
  readonly f5Score?: { readonly home: number; readonly away: number } | null;
  readonly finalStats?: MatchFinalCountStats | null;
  readonly allowedFamilies?: ReadonlySet<MarketFamilyId>;
  readonly deVigPreference?: "auto" | "proportional" | "shin" | "power";
  readonly nowIso?: string;
}

export interface MatchPicksCatalog {
  readonly gameId: string;
  readonly league: LeagueId;
  readonly sport: PlatformSport;
  readonly gameStatus: "NS" | "FT" | "LIVE";
  readonly generatedAtUtc: string;
  readonly engineVersion: "spacetime-v5.1";
  readonly isRedactedForVisitor: boolean;
  readonly totalPicks: number;
  readonly availableFamilies: readonly MarketFamilyId[];
  readonly familyCounts: Readonly<Partial<Record<MarketFamilyId, number>>>;
  readonly picks: readonly CatalogPickItem[];
}

export interface ScreenerApiResponse {
  readonly ok: true;
  readonly generatedAtUtc: string;
  readonly fullAccess: boolean;
  readonly totalMatchedGames: number;
  readonly totalMatchedPicks: number;
  readonly page: number;
  readonly pageSize: number;
  readonly hasMore: boolean;
  readonly picksOfTheDay: readonly CatalogPickItem[];
  readonly catalogs: Readonly<Record<string, MatchPicksCatalog>>;
}

export interface PickLabMatchBar {
  readonly id: string;
  readonly dateLabel: string;
  readonly opponentName: string;
  readonly opponentShort: string;
  readonly opponentSlug: string;
  readonly leagueLabel: string;
  readonly isHome: boolean;
  readonly value: number;
  readonly minutesPlayed?: number | null;
  readonly scoreLabel?: string | null;
  readonly gf?: number | null;
  readonly gc?: number | null;
}

export interface PickLabResponsePayload {
  readonly ok: true;
  readonly pick: CatalogPickItem;
  readonly gameId: string;
  readonly matchLabel: string;
  readonly league: LeagueId;
  readonly leagueLabel: string;
  readonly homeTeam: { readonly slug: string; readonly name: string; readonly shortName: string };
  readonly awayTeam: { readonly slug: string; readonly name: string; readonly shortName: string };
  readonly entityKind: "player" | "team" | "match";
  readonly entityName: string;
  readonly entitySubtitle: string;
  readonly entityPhotoKey?: string | null;
  readonly entityTeamSlug?: string | null;
  readonly metricKey: string;
  readonly metricLabel: string;
  readonly defaultLine: number;
  readonly defaultDirection: "over" | "under";
  readonly availableLines: readonly number[];
  readonly barsFor: readonly PickLabMatchBar[];
  readonly barsAgainst: readonly PickLabMatchBar[];
  readonly recentHistory: readonly {
    readonly id: string;
    readonly dateLabel: string;
    readonly matchLabel: string;
    readonly scoreLabel: string;
    readonly gf: number;
    readonly gc: number;
    readonly result: "W" | "D" | "L";
  }[];
  readonly relatedPicks: readonly CatalogPickItem[];
}

export interface GamePreviewPayload {
  readonly ok: true;
  readonly gameId: string;
  readonly fullAccess: boolean;
  readonly game: {
    readonly id: string;
    readonly slug: string;
    readonly league: LeagueId;
    readonly leagueLabel: string;
    readonly sport: PlatformSport;
    readonly status: "NS" | "FT" | "LIVE";
    readonly kickoffUtc: string;
    readonly kickoffLocal: string;
    readonly canonicalHref: string;
    readonly venueName: string | null;
    readonly refereeName: string | null;
    readonly refereeSlug: string | null;
    readonly score: { readonly home: number; readonly away: number } | null;
    readonly projection: { readonly home: number; readonly away: number } | null;
    readonly x12: readonly [number, number, number];
    readonly home: {
      readonly slug: string;
      readonly name: string;
      readonly shortName: string;
      readonly form: readonly string[];
    };
    readonly away: {
      readonly slug: string;
      readonly name: string;
      readonly shortName: string;
      readonly form: readonly string[];
    };
  };
  readonly detail: PlatformGameDetail;
  readonly standings: unknown | null;
  readonly injuries: readonly {
    readonly teamSide: "home" | "away";
    readonly player: string;
    readonly position: string | null;
    readonly status: string;
    readonly detail: string | null;
  }[];
}

export const FOOTBALL_PROP_MIN_MINUTES = 45;
export const NBA_PROP_DEFAULT_MIN_MINUTES = 18;
