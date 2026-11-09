/**
 * Contrato del dataset histórico.
 *
 * Cada fila es un partido **jugado** (con marcador final). Las filas son deterministas:
 * mismos bytes de origen y misma configuración producen el mismo archivo, así que el
 * `datasetId` del manifiesto sirve como commit lógico del corpus.
 */
import { z } from "zod";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const CLOCK = /^\d{2}:\d{2}$/;

export const HISTORY_SCHEMA_VERSION = 1;

/**
 * Cuotas de cierre de nflverse. Se guardan para investigación interna (comparar el
 * modelo contra el mercado), nunca para mostrarlas como cuotas propias.
 */
export const HistoricalClosingOddsSchema = z.object({
  spread: z.number().nullable(),
  total: z.number().nullable(),
  moneylineHome: z.number().nullable(),
  moneylineAway: z.number().nullable(),
  usage: z.literal("research-only"),
});

export type HistoricalClosingOdds = z.infer<typeof HistoricalClosingOddsSchema>;

export const HistoricalGameSchema = z.object({
  /** `<liga>:<temporada>:<clave>`; único y estable entre corridas. */
  id: z.string().min(3),
  sport: z.enum(["soccer", "american-football"]),
  league: z.string().min(2),
  /** `2010-11` (fútbol europeo) o `2025` (NFL). */
  season: z.string().min(4),
  /** Jornada, fecha de la NFL o semana de playoffs. */
  period: z.number().int().min(1),
  /**
   * Torneo dentro de la temporada cuando la liga parte el año en dos (Liga MX:
   * `Apertura` / `Clausura`). `null` en las ligas de temporada única.
   */
  stage: z.string().min(2).nullable(),
  phase: z.enum(["regular", "postseason"]),
  /** Fecha del partido en UTC (día civil de la fuente). */
  date: z.string().regex(ISO_DATE, "date debe ser YYYY-MM-DD"),
  /** Hora de inicio tal como la publica la fuente; `null` si no la publica. */
  kickoff: z.string().regex(CLOCK, "kickoff debe ser HH:mm").nullable(),
  /** Zona de `kickoff`; `null` cuando la fuente no la declara (fútbol). */
  kickoffZone: z.string().nullable(),
  /** `<liga>.<slug>` del histórico. */
  homeTeam: z.string().min(3),
  awayTeam: z.string().min(3),
  homeScore: z.number().int().min(0),
  awayScore: z.number().int().min(0),
  neutralSite: z.boolean(),
  source: z.enum(["openfootball", "nflverse"]),
  /** Identificador del proveedor (`game_id` de nflverse o `<archivo>#<índice>`). */
  sourceId: z.string().min(1),
  /**
   * Desde cuándo se considera conocido el resultado: fin del día del partido + 24 h.
   * Es el lag conservador de `DATA_ARCHITECTURE.md` §6 para datos que no capturamos en vivo.
   */
  availableAt: z.string().regex(ISO_DATETIME, "availableAt debe ser ISO UTC"),
  odds: HistoricalClosingOddsSchema.optional(),
});

export type HistoricalGame = z.infer<typeof HistoricalGameSchema>;

export const HistoricalSeasonStatsSchema = z.object({
  season: z.string().min(4),
  rows: z.number().int().min(0),
  firstDate: z.string().nullable(),
  lastDate: z.string().nullable(),
  status: z.enum(["complete", "partial", "missing"]),
});

export const HistoricalTeamStatsSchema = z.object({
  key: z.string().min(3),
  names: z.array(z.string().min(1)).min(1),
  games: z.number().int().min(0),
  seasons: z.number().int().min(0),
});

export const QualityIssueSchema = z.object({
  severity: z.enum(["error", "warning", "info"]),
  code: z.string().min(2),
  message: z.string().min(3),
  league: z.string().optional(),
  sample: z.array(z.string()).optional(),
});

export type QualityIssue = z.infer<typeof QualityIssueSchema>;

export const LeagueQualitySchema = z.object({
  league: z.string().min(2),
  rows: z.number().int().min(0),
  seasons: z.array(HistoricalSeasonStatsSchema),
  teams: z.number().int().min(0),
  firstDate: z.string().nullable(),
  lastDate: z.string().nullable(),
  rates: z.object({
    homeWin: z.number(),
    draw: z.number(),
    awayWin: z.number(),
    /** Goles (fútbol) o puntos (NFL) por partido. */
    avgTotalScore: z.number(),
    avgHomeScore: z.number(),
    avgAwayScore: z.number(),
  }),
  issues: z.array(QualityIssueSchema),
});

export type LeagueQuality = z.infer<typeof LeagueQualitySchema>;

export const HistorySourceRecordSchema = z.object({
  id: z.string().min(3),
  provider: z.enum(["openfootball", "nflverse"]),
  url: z.string().min(8),
  license: z.string().min(2),
  attribution: z.string().min(2),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  bytes: z.number().int().min(0),
  status: z.enum(["fetched", "cached", "unavailable"]),
  retrievedAt: z.string().nullable(),
});

export type HistorySourceRecord = z.infer<typeof HistorySourceRecordSchema>;

export const HistoryManifestSchema = z.object({
  schemaVersion: z.literal(HISTORY_SCHEMA_VERSION),
  datasetId: z.string().regex(/^[a-f0-9]{64}$/),
  generatedAt: z.string().regex(ISO_DATETIME),
  generatedBy: z.literal("services/ingest/history"),
  window: z.object({
    soccerSeasons: z.array(z.string()),
    nflSeasons: z.array(z.string()),
  }),
  totals: z.object({
    rows: z.number().int().min(0),
    leagues: z.number().int().min(0),
    seasons: z.number().int().min(0),
    teams: z.number().int().min(0),
    sources: z.number().int().min(0),
  }),
  quality: z.object({
    errors: z.number().int().min(0),
    warnings: z.number().int().min(0),
    checks: z.array(z.string()),
  }),
  leagues: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      sport: z.enum(["soccer", "american-football"]),
      productLeague: z.boolean(),
      file: z.string(),
      fileSha256: z.string().regex(/^[a-f0-9]{64}$/),
      rows: z.number().int().min(0),
      quality: LeagueQualitySchema,
    }),
  ),
  sources: z.array(HistorySourceRecordSchema),
});

export type HistoryManifest = z.infer<typeof HistoryManifestSchema>;
