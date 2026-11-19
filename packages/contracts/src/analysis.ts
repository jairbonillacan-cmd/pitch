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
} from "./ids";
import {
  MatchLineupsProjectionSchema,
  MatchPreGameContextSchema,
  type MatchLineupsProjection,
  type MatchPreGameContext,
} from "./injuries-lineups";
import { GameDTOSchema, LogoUrlSchema, type GameDTO } from "./sports/index";

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

export type PickProfile = "conservadora" | "intermedia" | "arriesgada";

/** Selección sugerida por el modelo dentro de un perfil de riesgo. */
export interface AnalysisPick {
  profile: PickProfile;
  market: MarketKey;
  selection: string;
  label: string;
  line?: number;
  p: number;
  fairOdds: number;
}

/** Qué tan claro y estable es el pronóstico (0-100). */
export interface AnalysisConfidence {
  score: number;
  level: "alta" | "media" | "baja";
  reasons: string[];
  /** Desglose del índice (0–1 por factor y su peso) para explicarlo en la app. */
  factors?: ConfidenceFactor[];
}

export interface ConfidenceFactor {
  key: "favorite" | "coverage" | "sample";
  label: string;
  /** 0 a 1: qué tanto aporta el factor. */
  value: number;
  /** Peso dentro del índice (suman 1). */
  weight: number;
  detail: string;
}

export interface HeadToHeadRow {
  date: string;
  homeTeamId: string;
  awayTeamId: string;
  homeGoals: number;
  awayGoals: number;
}

export interface AnalysisInsights {
  /** Frases cortas con los factores que más mueven el pronóstico. */
  why: string[];
  /** Últimos cruces entre ambos equipos antes del partido. */
  headToHead?: HeadToHeadRow[];
  /** Días desde el último partido de cada equipo. */
  restDays?: { home?: number; away?: number };
}

export interface GameAnalysis {
  game: GameId;
  /** Análisis de Cortex IA por secciones (se genera en el corte). */
  cortex?: CortexWriteup;
  /** Fútbol: córners, faltas y amarillas esperados (solo si ambos equipos tienen muestra). */
  counts?: { corners?: CountProjection; fouls?: CountProjection; yellow?: CountProjection };
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
  /** Picks por perfil (0 a 3). Se congelan al iniciar el partido. */
  picks?: AnalysisPick[];
  confidence?: AnalysisConfidence;
  /** Marcador más probable dentro del resultado y del lado de goles favoritos. */
  projectedScore?: MostLikelyScore;
  insights?: AnalysisInsights;
  /** Hora en que se calcularon los picks (si fue después de publicar el análisis). */
  picksAt?: string;
  /** Alineaciones confirmadas o proyectadas (con nivel de confianza). */
  lineups?: MatchLineupsProjection;
  /** Contexto prepartido (árbitro, clima, campo, distancia de viaje, clásico, TV en MX). */
  matchContext?: MatchPreGameContext;
}

export interface TeamSeasonRate {
  teamId: string;
  name: string;
  shortName: string;
  code: string;
  logoUrl?: string;
  forPerGame: number;
  againstPerGame: number;
  gamesPlayed: number;
  adjustedFor: number;
  adjustedAgainst: number;
}

export type StandingFormToken = "W" | "D" | "L";

/** Fila de la tabla de posiciones calculada con los partidos ya jugados. */
export interface StandingRow {
  teamId: string;
  name: string;
  shortName: string;
  code: string;
  logoUrl?: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  /** Conferencia (p. ej. AFC/NFC en NFL, Este/Oeste en NBA y NHL, Americana/Nacional en MLB). */
  conference?: string;
  /** División dentro de la conferencia. */
  division?: string;
  /** Derrotas en tiempo extra / penales (NHL, 1 pt en tabla). */
  otLosses?: number;
  /** Porcentaje de victorias (0..1; NFL, NBA, MLB). */
  winPct?: number;
  /** Juegos detrás del líder de conferencia o división (`"-"` para el líder). */
  gamesBehind?: string;
  /** Sembrado oficial o calculado dentro de su conferencia. */
  seed?: number;
  /** Últimos hasta 5 resultados en orden cronológico (más reciente al final). */
  form?: StandingFormToken[];
}

export interface LeagueSnapshot {
  schemaVersion: 1;
  league: LeagueId;
  /** URL externa del escudo de la competición (p. ej. Bzzoiro), si aplica. */
  logoUrl?: string;
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
  /** Tabla de posiciones (se omite si la competición no tiene clasificación vigente). */
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

/** Conteo esperado por equipo (córners, faltas, amarillas) con su línea equilibrada. */
export const CountProjectionSchema = z.object({
  home: z.number().nonnegative(),
  away: z.number().nonnegative(),
  total: z.number().nonnegative(),
  /** Línea con .5 más cercana a 50/50. */
  line: z.number(),
  /** Probabilidad de que el total pase la línea. */
  pOver: z.number().min(0).max(1),
  /** Partidos con el dato de cada equipo que vio el motor. */
  sample: z.object({ home: z.number().int().nonnegative(), away: z.number().int().nonnegative() }),
});

export type CountProjection = z.infer<typeof CountProjectionSchema>;

export const CORTEX_SECTION_KEYS = ["lectura", "goles", "ritmo", "tabla", "cambia"] as const;
export type CortexSectionKey = (typeof CORTEX_SECTION_KEYS)[number];

/**
 * Cifra que acompaña una sección: un valor suelto («2.96», «60 %») o una comparación
 * local/visitante (córners 5.4 vs 5.3). Sale del motor, nunca del LLM.
 */
export const CortexStatSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1).optional(),
  home: z.number().nonnegative().optional(),
  away: z.number().nonnegative().optional(),
});

export type CortexStat = z.infer<typeof CortexStatSchema>;

/** Lectura de Cortex IA por secciones, redactada una vez en el corte (no en cada visita). */
export const CortexWriteupSchema = z.object({
  /** Una idea central del partido, en una línea. */
  headline: z.string().min(1),
  headlineOrigin: z.enum(["ia", "plantilla"]),
  sections: z
    .array(
      z.object({
        key: z.enum(CORTEX_SECTION_KEYS),
        title: z.string().min(1),
        text: z.string().min(1),
        /** `plantilla` si el texto del LLM no pasó la validación y se armó con los números. */
        origin: z.enum(["ia", "plantilla"]),
        stats: z.array(CortexStatSchema).max(4).optional(),
      }),
    )
    .min(1),
  /** Huella de los datos de entrada: si no cambian, no se vuelve a llamar al modelo. */
  fingerprint: z.string().min(8),
  generatedAt: z.string().min(10),
  version: z.string().min(1),
});

export type CortexWriteup = z.infer<typeof CortexWriteupSchema>;

export const GameAnalysisSchema = z.object({
  game: GameIdSchema,
  cortex: CortexWriteupSchema.optional(),
  /** Fútbol: córners, faltas y amarillas esperados (solo si ambos equipos tienen muestra). */
  counts: z
    .object({
      corners: CountProjectionSchema.optional(),
      fouls: CountProjectionSchema.optional(),
      yellow: CountProjectionSchema.optional(),
    })
    .optional(),
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
  picks: z
    .array(
      z.object({
        profile: z.enum(["conservadora", "intermedia", "arriesgada"]),
        market: MarketKeySchema,
        selection: z.string().min(1),
        label: z.string().min(1),
        line: z.number().optional(),
        p: z.number().min(0).max(1),
        fairOdds: z.number().positive(),
      }),
    )
    .max(3)
    .optional(),
  confidence: z
    .object({
      score: z.number().min(0).max(100),
      level: z.enum(["alta", "media", "baja"]),
      reasons: z.array(z.string().min(1)).max(4),
    })
    .optional(),
  projectedScore: MostLikelyScoreSchema.optional(),
  insights: z
    .object({
      why: z.array(z.string().min(1)).max(4),
      headToHead: z
        .array(
          z.object({
            date: z.string().min(10),
            homeTeamId: z.string().min(1),
            awayTeamId: z.string().min(1),
            homeGoals: z.number().int().nonnegative(),
            awayGoals: z.number().int().nonnegative(),
          }),
        )
        .max(5)
        .optional(),
      restDays: z
        .object({ home: z.number().int().nonnegative().optional(), away: z.number().int().nonnegative().optional() })
        .optional(),
    })
    .optional(),
  picksAt: z.string().min(10).optional(),
  lineups: MatchLineupsProjectionSchema.optional(),
  matchContext: MatchPreGameContextSchema.optional(),
});

export const TeamSeasonRateSchema = z.object({
  teamId: z.string().min(3),
  name: z.string().min(1),
  shortName: z.string().min(1),
  code: z.string().min(2).max(5),
  logoUrl: LogoUrlSchema.optional(),
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
  logoUrl: LogoUrlSchema.optional(),
  played: z.number().int().nonnegative(),
  won: z.number().int().nonnegative(),
  drawn: z.number().int().nonnegative(),
  lost: z.number().int().nonnegative(),
  goalsFor: z.number().int().nonnegative(),
  goalsAgainst: z.number().int().nonnegative(),
  points: z.number().int().nonnegative(),
  conference: z.string().min(1).optional(),
  division: z.string().min(1).optional(),
  otLosses: z.number().int().nonnegative().optional(),
  winPct: z.number().min(0).max(1).optional(),
  gamesBehind: z.string().min(1).optional(),
  seed: z.number().int().positive().optional(),
  form: z.array(z.enum(["W", "D", "L"])).max(5).optional(),
});

export const LeagueSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  league: LeagueIdSchema,
  logoUrl: LogoUrlSchema.optional(),
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
