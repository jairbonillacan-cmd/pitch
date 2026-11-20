/**
 * Contratos puros y tipados del Catálogo Multi-Deporte de Picks de PitchLab (Spacetime v5.1).
 *
 * Cubre 34 familias de mercado (20 de Fútbol + 14 de Deportes US: NBA, MLB, NHL, NFL),
 * métricas financieras con de-vig proporcional/Shin y EV+, evidencia real multi-ventana
 * (L5 / L10 / L20 / Local-Visita / H2H), ajuste bayesiano arbitral y liquidación auditable
 * en partidos finalizados (`hit | miss | push | pending`).
 *
 * Reglas de cumplimiento:
 * - Bzzoiro v4.0 + FD-16: cero IDs crudos de proveedor ni URLs externas; toda cuota siempre
 *   ligada a probabilidad calibrada `p`, `fairOdds = 1 / p` y análisis propio.
 * - ADR-054: cero etiquetas «Confianza N» ni chips de «Datos completos / parciales».
 */
import type { LeagueId, PlatformSport } from "@pitchlab/contracts";
import type {
  BookQuoteItem,
  MatchIntelligenceV5View,
  PickConflictGroup,
  PlatformMarketRow,
  PlayerPropItem,
} from "../types";

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

export const MARKET_FAMILY_IDS: readonly MarketFamilyId[] = [
  ...FOOTBALL_MARKET_FAMILY_IDS,
  ...NBA_MARKET_FAMILY_IDS,
  ...MLB_MARKET_FAMILY_IDS,
  ...NHL_MARKET_FAMILY_IDS,
  ...NFL_MARKET_FAMILY_IDS,
] as const;

export const MARKET_FAMILY_COUNT = MARKET_FAMILY_IDS.length;

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

/** Eje lógico fino usado por la matriz de compatibilidad y correlación SGP (Bet Builder).
 * Incluye `MarketFamilyId` para neutralizar el eje al valor de familia en slots redactados (`Cero-Fuga`). */
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

export type DeVigMethod = "proportional" | "shin" | "none";

export type EvidenceTone = "high" | "mid" | "low" | "neutral";

export type EvidenceWindowKey = "L5" | "L10" | "L20" | "home_away" | "h2h";

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
  /** Frecuencia real observada sobre muestra efectiva (`hits / (sample - pushes) * 100`). */
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
  /** Promedio contraído por Empirical Bayes (κ = 15) hacia la media de liga. */
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
  /** Probabilidad calibrada Spacetime v5.1 en escala única canónica `(0.01, 0.99)`. */
  readonly p: number;
  /** Cuota justa decimal `1 / p` (>= 1.01). */
  readonly fairOdds: number;
  readonly fairAmerican: number;
  /** Cuota decimal real de casa cuando existe captura vigente; `null` sin mercado. */
  readonly marketDecimal: number | null;
  readonly marketAmerican: number | null;
  readonly marketBookLabel: string | null;
  readonly marketCapturedAtUtc: string | null;
  /** Probabilidad implícita limpia tras de-vig proporcional/Shin (cuando existen 2 o 3 vías). */
  readonly deVigMarketProb: number | null;
  readonly deVigMethod: DeVigMethod;
  /** Margen implícito de la casa (`(Σ 1/d - 1) * 100`) cuando existe mercado completo. */
  readonly overroundPct: number | null;
  /** Valor esperado porcentual: `(p * marketDecimal - 1) * 100`. */
  readonly evPct: number | null;
  /** Ventaja frente a cuota bruta de casa: `(p - 1 / marketDecimal) * 100`. */
  readonly edgePts: number | null;
  /** Ventaja frente a probabilidad sin margen (de-vig): `(p - deVigMarketProb) * 100`. */
  readonly noVigEdgePts: number | null;
  /** Etiqueta limpia editorial (`"Valor +X.X %"`) solo cuando `evPct > 0`, si no `null`. */
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
  /** Guardia mínima de minutos aplicada (`>= 45` obligatoria en fútbol). */
  readonly minMinutesGuard: number;
  readonly qualifyingMatches: number;
  readonly avgMinutes: number | null;
  readonly lineupStatus: LineupConfirmationStatus;
  readonly projectionMean: number;
  readonly projectionSd: number;
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
  /** Liquidación auditable: preservada en partidos `FT` (`hit | miss | push | pending`). */
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
}

/** Registro histórico real de un partido reciente de equipo para ventanas L5/L10/L20/Local-Visita. */
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

/** Registro por aparición real de jugador de fútbol (sujeto a guardia estricta `minutesPlayed >= 45`). */
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
  readonly teamSide: "home" | "away";
  readonly teamName: string;
  readonly position: "GK" | "DEF" | "MID" | "FWD" | string;
  readonly lineupStatus?: LineupConfirmationStatus;
  /** Guardia de minutos mínima solicitada (siempre forzada a `Math.max(45, ...)` en fútbol). */
  readonly minMinutes?: number;
  /** Media de minutos observados cuando se proveen agregados sin `matchLogs`. */
  readonly avgMinutes?: number | null;
  /** Apariciones recientes con minutos jugados reales. */
  readonly matchLogs?: readonly FootballPlayerMatchLog[];
  /** Agregados reales de temporada (respaldo si no hay `matchLogs` detallados). */
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
  /** Cuotas de casa por métrica y línea (opcionales; si no existen, solo momio justo). */
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

/** Estadísticas reales finales de partido para liquidar conteos y props en partidos `FT`. */
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
  readonly deVigPreference?: "auto" | "proportional" | "shin";
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

export const FOOTBALL_PROP_MIN_MINUTES = 45;
export const NBA_PROP_DEFAULT_MIN_MINUTES = 18;
