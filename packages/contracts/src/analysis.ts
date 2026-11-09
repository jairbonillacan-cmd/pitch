import { z } from "zod";
import {
  GameIdSchema,
  LeagueIdSchema,
  MarketKeySchema,
  SeasonIdSchema,
  type GameId,
  type LeagueId,
  type MarketKey,
  type SeasonId,
} from "./ids.js";
import { GameDTOSchema, type GameDTO } from "./sports/index.js";

export interface MarketProbability {
  market: MarketKey;
  selection: string;
  line?: number;
  p: number;
  fairOdds: number;
}

export interface AnalysisMarketRow {
  market: MarketKey;
  selection: string;
  label: string;
  line?: number;
  p: number;
  fairOdds: number;
}

export interface AnalysisMarketGroup {
  group: string;
  rows: AnalysisMarketRow[];
}

export interface MostLikelyScore {
  home: number;
  away: number;
  p: number;
}

export interface GameAnalysis {
  game: GameId;
  model: {
    id: string;
    version: string;
    status: "reference" | "candidate" | "published";
    label: string;
  };
  projection: {
    home: number;
    away: number;
    total: number;
    margin?: number;
  };
  x12: [number, number, number];
  probabilities: MarketProbability[];
  marketGroups: AnalysisMarketGroup[];
  mostLikelyScore?: MostLikelyScore;
  factors: Array<{
    key: string;
    label: string;
    value: string;
    detail?: string;
  }>;
  steps: string[];
  inputsAsOf: string;
  publishedAt: string;
  source: string;
}

export interface TeamSeasonRate {
  teamId: string;
  name: string;
  shortName: string;
  code: string;
  forPerGame: number;
  againstPerGame: number;
  gamesPlayed: number;
  adjustedFor: number;
  adjustedAgainst: number;
}

/** Fila de la tabla de posiciones calculada con los partidos ya jugados. */
export interface StandingRow {
  teamId: string;
  name: string;
  shortName: string;
  code: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

export interface LeagueSnapshot {
  schemaVersion: 1;
  league: LeagueId;
  season: SeasonId;
  seasonLabel: string;
  periodLabel: string;
  updatedAt: string;
  source: string;
  provenance: "provider" | "derived";
  isDemo: false;
  teamRates: Record<string, TeamSeasonRate>;
  games: GameDTO[];
  analyses: Record<string, GameAnalysis>;
  /** Tabla de posiciones (solo fútbol; se omite si no hay partidos jugados). */
  standings?: StandingRow[];
}

export const MarketProbabilitySchema = z.object({
  market: MarketKeySchema,
  selection: z.string().min(1),
  line: z.number().optional(),
  p: z.number().min(0).max(1),
  fairOdds: z.number().positive(),
});

export const AnalysisMarketRowSchema = z.object({
  market: MarketKeySchema,
  selection: z.string().min(1),
  label: z.string().min(1),
  line: z.number().optional(),
  p: z.number().min(0).max(1),
  fairOdds: z.number().positive(),
});

export const AnalysisMarketGroupSchema = z.object({
  group: z.string().min(1),
  rows: z.array(AnalysisMarketRowSchema).min(1),
});

export const MostLikelyScoreSchema = z.object({
  home: z.number().int().nonnegative(),
  away: z.number().int().nonnegative(),
  p: z.number().min(0).max(1),
});

export const GameAnalysisSchema = z.object({
  game: GameIdSchema,
  model: z.object({
    id: z.string().min(1),
    version: z.string().min(1),
    status: z.enum(["reference", "candidate", "published"]),
    label: z.string().min(1),
  }),
  projection: z.object({
    home: z.number().nonnegative(),
    away: z.number().nonnegative(),
    total: z.number().nonnegative(),
    margin: z.number().optional(),
  }),
  x12: z.tuple([
    z.number().min(0).max(1),
    z.number().min(0).max(1),
    z.number().min(0).max(1),
  ]),
  probabilities: z.array(MarketProbabilitySchema).min(1),
  marketGroups: z.array(AnalysisMarketGroupSchema).min(1),
  mostLikelyScore: MostLikelyScoreSchema.optional(),
  factors: z
    .array(
      z.object({
        key: z.string().min(1),
        label: z.string().min(1),
        value: z.string().min(1),
        detail: z.string().optional(),
      }),
    )
    .min(1),
  steps: z.array(z.string().min(1)).length(6),
  inputsAsOf: z.string().min(10),
  publishedAt: z.string().min(10),
  source: z.string().min(1),
});

export const TeamSeasonRateSchema = z.object({
  teamId: z.string().min(3),
  name: z.string().min(1),
  shortName: z.string().min(1),
  code: z.string().min(2).max(5),
  forPerGame: z.number().nonnegative(),
  againstPerGame: z.number().nonnegative(),
  gamesPlayed: z.number().int().nonnegative(),
  adjustedFor: z.number().nonnegative(),
  adjustedAgainst: z.number().nonnegative(),
});

export const StandingRowSchema = z.object({
  teamId: z.string().min(3),
  name: z.string().min(1),
  shortName: z.string().min(1),
  code: z.string().min(2).max(5),
  played: z.number().int().nonnegative(),
  won: z.number().int().nonnegative(),
  drawn: z.number().int().nonnegative(),
  lost: z.number().int().nonnegative(),
  goalsFor: z.number().int().nonnegative(),
  goalsAgainst: z.number().int().nonnegative(),
  points: z.number().int().nonnegative(),
});

export const LeagueSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  league: LeagueIdSchema,
  season: SeasonIdSchema,
  seasonLabel: z.string().min(1),
  periodLabel: z.string().min(1),
  updatedAt: z.string().min(10),
  source: z.string().min(1),
  provenance: z.enum(["provider", "derived"]),
  isDemo: z.literal(false),
  teamRates: z.record(z.string(), TeamSeasonRateSchema),
  games: z.array(GameDTOSchema),
  analyses: z.record(z.string(), GameAnalysisSchema),
  standings: z.array(StandingRowSchema).optional(),
});
