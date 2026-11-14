/**
 * Contrato de UI del «Panorama por deporte» (NHL, MLB, NBA y NCAAF).
 *
 * Refleja los campos que ya entregan los motores multideporte de `@pitchlab/spacetime`
 * (`NHLPrediction`, `MLBPrediction`, `NBAPrediction`, `NCAAFPrediction`) más los que
 * el plan de motores de noviembre 2026 agrega después (líneas, confirmaciones y descanso).
 * Todo lo que el motor todavía no manda es opcional: la tarjeta lo omite o lo marca
 * «por confirmar», nunca lo inventa (ADR-027).
 */

export type OutlookSport = "nhl" | "mlb" | "nba" | "ncaaf";

export type TeamSide = "home" | "away";

/** Factor del motor tal como sale de `MultiSportDriver` (sin la etiqueta técnica). */
export interface SportOutlookDriver {
  /** Identificador estable del factor (`starting_goalie_matchup`, `rotation_injuries`…). */
  readonly factor: string;
  /** Impacto en escala logit: positivo favorece al local. Sirve para ordenar. */
  readonly impactLogit: number;
  /** Impacto en goles, carreras o puntos: positivo favorece al local. */
  readonly impactUnits: number;
}

export type SportLineKind =
  /** Total del partido (goles, carreras o puntos). */
  | "total"
  /** Hándicap del partido: puck line (NHL), run line (MLB) o spread (NBA/NCAAF). */
  | "spread"
  /** Ganador de las primeras 5 entradas (MLB). */
  | "first5_winner"
  /** Total de carreras de las primeras 5 entradas (MLB). */
  | "first5_total";

export interface SportOutlookLine {
  readonly kind: SportLineKind;
  /** Línea en unidades del deporte (6.5 goles, −1.5 carreras, 224.5 puntos). */
  readonly line: number;
  /**
   * Probabilidad del lado «principal»: «Más de» en totales; el local cubre en hándicaps;
   * gana el local en `first5_winner` (con `line` = 0).
   */
  readonly p: number;
}

export type ConfirmationKind =
  /** Portero titular (NHL). */
  | "goalie"
  /** Lanzador abridor (MLB). */
  | "starting_pitcher"
  /** Alineación o lineup completo. */
  | "lineup"
  /** Jugador clave con estatus de lesión (NBA/NCAAF). */
  | "key_player";

export type ConfirmationStatus =
  | "confirmed"
  | "probable"
  | "pending"
  | "questionable"
  | "out";

export interface SportConfirmation {
  readonly kind: ConfirmationKind;
  readonly team: TeamSide;
  readonly status: ConfirmationStatus;
  readonly playerName?: string;
  /** Hora de la última actualización (UTC, ISO-8601). */
  readonly updatedAtUtc?: string;
}

export interface SportRestInfo {
  /** Días de descanso desde su último partido (0 = jugó ayer). */
  readonly restDays?: number;
  /** Segundo partido en dos noches. */
  readonly backToBack?: boolean;
}

export interface SportOutlookInput {
  readonly sport: OutlookSport;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly pHome: number;
  readonly pAway: number;
  /** Solo NHL: gana local en tiempo regular / se va a tiempo extra o penales / gana visita en regular. */
  readonly pHomeReg?: number;
  readonly pOtReg?: number;
  readonly pAwayReg?: number;
  /** Goles (NHL), carreras (MLB) o puntos (NBA/NCAAF) esperados. */
  readonly expectedHome: number;
  readonly expectedAway: number;
  /** Solo NBA: posesiones esperadas por equipo. */
  readonly expectedPace?: number;
  readonly drivers: readonly SportOutlookDriver[];
  readonly lines?: readonly SportOutlookLine[];
  readonly confirmations?: readonly SportConfirmation[];
  readonly rest?: Partial<Record<TeamSide, SportRestInfo>>;
  readonly generatedAtUtc: string;
}
