/**
 * Contrato del dataset de investigación (cuotas de cierre y estadísticas de partido).
 *
 * Es un dataset **separado** del corpus canónico porque su licencia no está confirmada:
 * se guarda para investigación interna (backtests y features), nunca para publicarse ni
 * redistribuirse. `usage: "research-only"` es parte del contrato, no una nota.
 */
import { z } from "zod";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const RESEARCH_SCHEMA_VERSION = 1;

export const ResearchOddsSchema = z.object({
  source: z.literal("football-data.co.uk"),  bookmaker: z.enum(["Pinnacle", "B365", "Avg"]),
  /** `closing` si la fuente publica cuotas de cierre; `pre-match` en temporadas antiguas. */
  timing: z.enum(["closing", "pre-match"]),
  home: z.number().gt(1),
  draw: z.number().gt(1),
  away: z.number().gt(1),
  over25: z.number().gt(1).nullable(),
  under25: z.number().gt(1).nullable(),
  usage: z.literal("research-only"),
});

export type ResearchOdds = z.infer<typeof ResearchOddsSchema>;

export const ResearchMatchStatsSchema = z.object({
  shotsHome: z.number().int().min(0).nullable(),
  shotsAway: z.number().int().min(0).nullable(),
  shotsOnTargetHome: z.number().int().min(0).nullable(),
  shotsOnTargetAway: z.number().int().min(0).nullable(),
  cornersHome: z.number().int().min(0).nullable(),
  cornersAway: z.number().int().min(0).nullable(),
  yellowHome: z.number().int().min(0).nullable(),
  yellowAway: z.number().int().min(0).nullable(),
  redHome: z.number().int().min(0).nullable(),
  redAway: z.number().int().min(0).nullable(),
});

export type ResearchMatchStats = z.infer<typeof ResearchMatchStatsSchema>;

export const ResearchGameSchema = z.object({
  /** Mismo identificador que el corpus canónico: `<liga>:<temporada>:<local>:<visitante>`. */
  id: z.string().min(3),
  league: z.string().min(2),
  season: z.string().min(4),
  date: z.string().regex(ISO_DATE),
  homeTeam: z.string().min(3),
  awayTeam: z.string().min(3),
  homeScore: z.number().int().min(0),
  awayScore: z.number().int().min(0),
  /** Torneo y jornada cuando la fuente los publica (API-Football); `null` si no. */
  stage: z.string().min(2).nullable().optional(),
  period: z.number().int().min(1).nullable().optional(),
  phase: z.enum(["regular", "postseason"]).optional(),
  odds: ResearchOddsSchema.nullable(),
  stats: ResearchMatchStatsSchema.optional(),
  source: z.enum(["football-data.co.uk", "api-football"]),
  sourceUrl: z.string().min(8),
});

export type ResearchGame = z.infer<typeof ResearchGameSchema>;

export const ResearchSourceRecordSchema = z.object({
  id: z.string().min(3),
  provider: z.enum(["football-data.co.uk", "api-football"]),
  url: z.string().min(8),
  license: z.literal("research-only"),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  bytes: z.number().int().min(0),
  status: z.enum(["fetched", "cached", "unavailable"]),
  retrievedAt: z.string().nullable(),
});

export type ResearchSourceRecord = z.infer<typeof ResearchSourceRecordSchema>;

export const ResearchLeagueReportSchema = z.object({
  id: z.string(),
  file: z.string(),
  fileSha256: z.string().regex(/^[a-f0-9]{64}$/),
  rows: z.number().int().min(0),
  withOdds: z.number().int().min(0),
  withClosingOdds: z.number().int().min(0),
  withStats: z.number().int().min(0),
  matchedCorpus: z.number().int().min(0),
  corpusRows: z.number().int().min(0),
  oddsCoverage: z.number().min(0).max(1),
  seasons: z.array(
    z.object({
      season: z.string(),
      rows: z.number().int().min(0),
      withOdds: z.number().int().min(0),
      matchedCorpus: z.number().int().min(0),
    }),
  ),
  unmatchedNames: z.array(z.string()),
  fallbackNames: z.array(z.string()),
});

export const ResearchManifestSchema = z.object({
  schemaVersion: z.literal(RESEARCH_SCHEMA_VERSION),
  datasetId: z.string().regex(/^[a-f0-9]{64}$/),
  generatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/),
  generatedBy: z.literal("services/ingest/history/research"),
  corpus: z.object({
    datasetId: z.string().nullable(),
    rows: z.number().int().min(0),
  }),
  totals: z.object({
    rows: z.number().int().min(0),
    leagues: z.number().int().min(0),
    withOdds: z.number().int().min(0),
    withClosingOdds: z.number().int().min(0),
    withStats: z.number().int().min(0),
    matchedCorpus: z.number().int().min(0),
    corpusRows: z.number().int().min(0),
    oddsCoverage: z.number().min(0).max(1),
  }),
  leagues: z.array(ResearchLeagueReportSchema),
  sources: z.array(ResearchSourceRecordSchema),
  notes: z.array(z.string()),
});

export type ResearchManifest = z.infer<typeof ResearchManifestSchema>;
