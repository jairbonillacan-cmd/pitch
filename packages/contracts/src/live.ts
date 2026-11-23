import { z } from "zod";

export const LivePhaseSchema = z.enum([
  "scheduled",
  "live",
  "halftime",
  "penalties",
  "final",
  "postponed",
  "cancelled",
  "unknown",
]);
export type LivePhase = z.infer<typeof LivePhaseSchema>;

export const LiveSideSchema = z.enum(["home", "away"]);
export type LiveSide = z.infer<typeof LiveSideSchema>;

export const LiveScoreSchema = z.object({
  home: z.number(),
  away: z.number(),
});

export interface LiveScore {
  home: number;
  away: number;
}

export const LiveIncidentKindSchema = z.enum([
  "goal",
  "own_goal",
  "penalty_goal",
  "penalty_missed",
  "yellow",
  "second_yellow",
  "red",
  "sub",
  "var",
  "period",
]);

export const LiveIncidentSchema = z.object({
  order: z.number(),
  kind: LiveIncidentKindSchema,
  side: LiveSideSchema.nullable(),
  minute: z.number().nullable(),
  addedTime: z.number().nullable(),
  player: z.string().nullable(),
  secondary: z.string().nullable(),
  score: LiveScoreSchema.nullable(),
  note: z.string().nullable(),
});

export interface LiveIncident {
  order: number;
  kind: "goal" | "own_goal" | "penalty_goal" | "penalty_missed" | "yellow" | "second_yellow" | "red" | "sub" | "var" | "period";
  side: LiveSide | null;
  minute: number | null;
  addedTime: number | null;
  player: string | null;
  secondary: string | null;
  score: LiveScore | null;
  note: string | null;
}

export const LiveTeamStatsSchema = z.object({
  xg: z.number().nullable(),
  shots: z.number().nullable(),
  shotsOnTarget: z.number().nullable(),
  corners: z.number().nullable(),
  possessionPct: z.number().nullable(),
  fouls: z.number().nullable(),
  yellowCards: z.number().nullable(),
  redCards: z.number().nullable(),
  offsides: z.number().nullable(),
  bigChances: z.number().nullable(),
  goalsPrevented: z.number().nullable().optional(),
  touchesInBox: z.number().nullable().optional(),
  passAccuracyPct: z.number().nullable().optional(),
});

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
  goalsPrevented?: number | null;
  touchesInBox?: number | null;
  passAccuracyPct?: number | null;
}

export const LiveCommentaryItemSchema = z.object({
  id: z.string(),
  order: z.number(),
  minute: z.number().nullable(),
  addedTime: z.number().nullable(),
  text: z.string(),
  isImportant: z.boolean().optional(),
  side: LiveSideSchema.nullable().optional(),
});

export interface LiveCommentaryItem {
  id: string;
  order: number;
  minute: number | null;
  addedTime: number | null;
  text: string;
  isImportant?: boolean;
  side?: LiveSide | null;
}

export const LivePlayerStatRowSchema = z.object({
  player: z.string(),
  side: LiveSideSchema,
  position: z.string().nullable().optional(),
  minutes: z.number().nullable().optional(),
  rating: z.number().nullable().optional(),
  goals: z.number().optional(),
  assists: z.number().optional(),
  shots: z.number().optional(),
  shotsOnTarget: z.number().optional(),
  keyPasses: z.number().optional(),
  xg: z.number().nullable().optional(),
  xa: z.number().nullable().optional(),
  tackles: z.number().optional(),
  saves: z.number().optional(),
});

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

export const LiveMomentumPointSchema = z.object({
  minute: z.number(),
  value: z.number().min(-100).max(100),
});

export interface LiveMomentumPoint {
  minute: number;
  value: number;
}

export const LiveXgPointSchema = z.object({
  minute: z.number().min(0),
  home: z.number().nonnegative(),
  away: z.number().nonnegative(),
});

export interface LiveXgPoint {
  minute: number;
  home: number;
  away: number;
}

export const LiveShotOutcomeSchema = z.enum(["goal", "save", "miss", "block", "post"]);
export type LiveShotOutcome = z.infer<typeof LiveShotOutcomeSchema>;

export const LiveShotSchema = z.object({
  minute: z.number().min(0).max(130),
  addedTime: z.number().int().nonnegative().nullable().optional(),
  side: LiveSideSchema,
  outcome: LiveShotOutcomeSchema,
  xg: z.number().nonnegative().nullable(),
  x: z
    .number()
    .min(0)
    .max(100)
    .nullable()
    .describe("Coordenada X normalizada 0..100 donde 100 es la portería atacada"),
  y: z.number().min(0).max(100).nullable(),
  player: z.string().min(1).max(120).nullable().optional(),
  bodyPart: z.string().min(1).max(32).nullable().optional(),
});

export interface LiveShot {
  minute: number;
  addedTime?: number | null;
  side: LiveSide;
  outcome: LiveShotOutcome;
  xg: number | null;
  x: number | null;
  y: number | null;
  player?: string | null;
  bodyPart?: string | null;
}

export const LiveAveragePositionSchema = z.object({
  side: LiveSideSchema,
  name: z.string().min(1).max(120),
  shortName: z.string().min(1).max(60).nullable().optional(),
  number: z.number().int().min(1).max(99).nullable().optional(),
  position: z.string().min(1).max(32).nullable().optional(),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  touches: z.number().int().nonnegative().nullable().optional(),
  rating: z.number().min(0).max(10).nullable().optional(),
});

export interface LiveAveragePosition {
  side: LiveSide;
  name: string;
  shortName?: string | null;
  number?: number | null;
  position?: string | null;
  x: number;
  y: number;
  touches?: number | null;
  rating?: number | null;
}

export const LiveShotmapSummarySchema = z.object({
  xgHome: z.number().nonnegative(),
  xgAway: z.number().nonnegative(),
  shotsHome: z.number().int().nonnegative(),
  shotsAway: z.number().int().nonnegative(),
});

export interface LiveShotmapSummary {
  xgHome: number;
  xgAway: number;
  shotsHome: number;
  shotsAway: number;
}

export const LiveScoreboardEntrySchema = z.object({
  gameId: z.string().min(1),
  league: z.string().min(1),
  phase: LivePhaseSchema,
  clock: z.string().nullable(),
  minute: z.number().nullable(),
  score: LiveScoreSchema.nullable(),
  htScore: LiveScoreSchema.nullable(),
  redCards: LiveScoreSchema.nullable(),
  referee: z.string().nullable().optional(),
  kickoffUtc: z.string(),
});

export interface LiveScoreboardEntry {
  gameId: string;
  league: string;
  phase: LivePhase;
  clock: string | null;
  minute: number | null;
  score: LiveScore | null;
  htScore: LiveScore | null;
  redCards: { home: number; away: number } | null;
  referee?: string | null;
  kickoffUtc: string;
}

export const LiveScoreboardSchema = z.object({
  generatedAt: z.string(),
  sourceFetchedAt: z.string().nullable(),
  active: z.boolean(),
  nextPollSeconds: z.number().nullable(),
  notice: z.string().nullable(),
  entries: z.array(LiveScoreboardEntrySchema),
});

export interface LiveScoreboard {
  generatedAt: string;
  sourceFetchedAt: string | null;
  active: boolean;
  nextPollSeconds: number | null;
  notice: string | null;
  entries: LiveScoreboardEntry[];
}

export const LiveInPlayWinProbSchema = z.object({
  minute: z.number(),
  pHome: z.number(),
  pDraw: z.number().nullable(),
  pAway: z.number(),
  fairHomeDecimal: z.number(),
  fairDrawDecimal: z.number().nullable(),
  fairAwayDecimal: z.number(),
  pNextGoalHome: z.number().optional(),
  pNextGoalAway: z.number().optional(),
  pNoMoreGoals: z.number().optional(),
  expectedFinalTotal: z.number().optional(),
  redCardsHome: z.number().optional(),
  redCardsAway: z.number().optional(),
});

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

export const LiveMatchDetailSchema = z.object({
  gameId: z.string().min(1),
  generatedAt: z.string(),
  sourceFetchedAt: z.string().nullable(),
  entry: LiveScoreboardEntrySchema,
  incidents: z.array(LiveIncidentSchema),
  stats: z
    .object({
      home: LiveTeamStatsSchema,
      away: LiveTeamStatsSchema,
    })
    .nullable(),
  xgEstimated: z.boolean().nullable(),
  momentum: z.array(LiveMomentumPointSchema),
  xgTimeline: z.array(LiveXgPointSchema),
  shots: z.array(LiveShotSchema),
  averagePositions: z.array(LiveAveragePositionSchema).optional(),
  shotmapSummary: LiveShotmapSummarySchema.optional(),
  commentary: z.array(LiveCommentaryItemSchema).optional(),
  playerStats: z.array(LivePlayerStatRowSchema).optional(),
  broadcastsMx: z.array(z.string()).optional(),
  inPlayWinProb: LiveInPlayWinProbSchema.nullable().optional(),
  nextPollSeconds: z.number().nullable(),
  notice: z.string().nullable(),
  attribution: z.string(),
});

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
  averagePositions?: readonly LiveAveragePosition[];
  shotmapSummary?: LiveShotmapSummary;
  commentary?: LiveCommentaryItem[];
  playerStats?: LivePlayerStatRow[];
  broadcastsMx?: string[];
  inPlayWinProb?: LiveInPlayWinProb | null;
  nextPollSeconds: number | null;
  notice: string | null;
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
