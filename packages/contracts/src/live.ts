/**
 * EN-VIVO-1: estado en vivo de un partido tal como lo sirve nuestra API (`/api/live/*`).
 *
 * Todo va con el id propio del partido (`gameId`); el id del proveedor nunca sale del servidor.
 * Es dato derivado y normalizado (no el JSON crudo de Bzzoiro, que la licencia no deja
 * redistribuir).
 */

export type LivePhase =
  /** Aún no empieza. */
  | "scheduled"
  /** Primer o segundo tiempo, o tiempo extra. */
  | "live"
  | "halftime"
  /** Penales en curso. */
  | "penalties"
  | "final"
  | "postponed"
  | "cancelled"
  /** Pasó la hora y el proveedor no tiene resultado. */
  | "unknown";

export type LiveSide = "home" | "away";

export interface LiveScore {
  home: number;
  away: number;
}

export interface LiveIncident {
  /** Orden estable dentro del partido (segundo del partido o posición). */
  order: number;
  kind: "goal" | "own_goal" | "penalty_goal" | "penalty_missed" | "yellow" | "second_yellow" | "red" | "sub" | "var" | "period";
  side: LiveSide | null;
  minute: number | null;
  addedTime: number | null;
  /** Jugador principal (anotador, amonestado, quien entra). */
  player: string | null;
  /** Asistencia, o quien sale en un cambio. */
  secondary: string | null;
  /** Marcador después del gol, si aplica. */
  score: LiveScore | null;
  /** Texto corto para periodos y VAR («Medio tiempo», «Gol anulado»). */
  note: string | null;
}

export interface LiveTeamStats {
  xg: number | null;
  shots: number | null;
  shotsOnTarget: number | null;
  corners: number | null;
  possessionPct: number | null;
  fouls: number | null;
  yellowCards: number | null;
  redCards: number | null;
  offsides: number | null;
  bigChances: number | null;
  /** Goles evitados respecto al xGOT/calidad de remates recibidos. */
  goalsPrevented?: number | null;
  /** Toques dentro del área rival. */
  touchesInBox?: number | null;
  /** Porcentaje de precisión de pase. */
  passAccuracyPct?: number | null;
}

export interface LiveCommentaryItem {
  id: string;
  order: number;
  minute: number | null;
  addedTime: number | null;
  text: string;
  isImportant?: boolean;
  side?: LiveSide | null;
}

export interface LivePlayerStatRow {
  player: string;
  side: LiveSide;
  position?: string | null;
  minutes?: number | null;
  rating?: number | null;
  goals?: number;
  assists?: number;
  shots?: number;
  shotsOnTarget?: number;
  keyPasses?: number;
  xg?: number | null;
  xa?: number | null;
  tackles?: number;
  saves?: number;
}

export interface LiveMomentumPoint {
  /** Minuto del partido (45.5 = medio tiempo, 90.5 = final). */
  minute: number;
  /** −100 (domina la visita) a +100 (domina el local). */
  value: number;
}

export interface LiveXgPoint {
  minute: number;
  home: number;
  away: number;
}

export interface LiveShot {
  minute: number;
  side: LiveSide;
  outcome: "goal" | "save" | "miss" | "block" | "post";
  xg: number | null;
  /** Posición en la cancha 0–100 (x hacia la portería rival). */
  x: number | null;
  y: number | null;
}

/** Fila del marcador en vivo (lista de partidos del día). */
export interface LiveScoreboardEntry {
  gameId: string;
  league: string;
  phase: LivePhase;
  /** Minuto mostrado («67», «45+2»); `null` fuera de juego. */
  clock: string | null;
  minute: number | null;
  score: LiveScore | null;
  htScore: LiveScore | null;
  redCards: { home: number; away: number } | null;
  referee?: string | null;
  kickoffUtc: string;
}

export interface LiveScoreboard {
  generatedAt: string;
  /** Cuándo leyó el servidor al proveedor por última vez (`null` si no hizo falta). */
  sourceFetchedAt: string | null;
  /** `true` si hay al menos un partido en juego o por empezar en minutos. */
  active: boolean;
  /** Segundos sugeridos para volver a preguntar; `null` = no volver a preguntar. */
  nextPollSeconds: number | null;
  /** Aviso honesto cuando la fuente no respondió o se cuidó la cuota. */
  notice: string | null;
  entries: LiveScoreboardEntry[];
}

/** Probabilidades en vivo minuto a minuto (motor determinista In-Play v5.1, sin stake ni EV). */
export interface LiveInPlayWinProb {
  readonly minute: number;
  readonly pHome: number;
  readonly pDraw: number | null;
  readonly pAway: number;
  readonly fairHomeDecimal: number;
  readonly fairDrawDecimal: number | null;
  readonly fairAwayDecimal: number;
  readonly pNextGoalHome?: number;
  readonly pNextGoalAway?: number;
  readonly pNoMoreGoals?: number;
  readonly expectedFinalTotal?: number;
  readonly redCardsHome?: number;
  readonly redCardsAway?: number;
}

/** Ficha en vivo de un partido. */
export interface LiveMatchDetail {
  gameId: string;
  generatedAt: string;
  sourceFetchedAt: string | null;
  entry: LiveScoreboardEntry;
  incidents: LiveIncident[];
  stats: { home: LiveTeamStats; away: LiveTeamStats } | null;
  xgEstimated: boolean | null;
  momentum: LiveMomentumPoint[];
  xgTimeline: LiveXgPoint[];
  shots: LiveShot[];
  /** Narración minuto a minuto incremental (`?since=`). */
  commentary?: LiveCommentaryItem[];
  /** Estadísticas individuales por jugador en vivo y al cierre. */
  playerStats?: LivePlayerStatRow[];
  /** Canales de transmisión para México (`country_code=MX`). */
  broadcastsMx?: string[];
  /** Probabilidad dinámica en vivo según minuto, marcador y tarjetas rojas. */
  inPlayWinProb?: LiveInPlayWinProb | null;
  nextPollSeconds: number | null;
  notice: string | null;
  /** Atribución exigida por la licencia de la fuente. */
  attribution: string;
}

export function isLivePhaseActive(phase: LivePhase): boolean {
  return phase === "live" || phase === "halftime" || phase === "penalties";
}

export function isLivePhaseTerminal(phase: LivePhase): boolean {
  return phase === "final" || phase === "postponed" || phase === "cancelled";
}

export const LIVE_PHASE_LABEL_ES: Record<LivePhase, string> = {
  scheduled: "Por jugar",
  live: "En vivo",
  halftime: "Medio tiempo",
  penalties: "Penales",
  final: "Final",
  postponed: "Pospuesto",
  cancelled: "Cancelado",
  unknown: "Sin resultado",
};
