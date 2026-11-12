/**
 * Contrato del dataset de enriquecimiento de native-stats.org.
 *
 * Se guarda como `research/` y no como corpus canónico por dos razones explícitas:
 *
 *  1. **Licencia**: native-stats.org no publica términos de uso ni licencia. Sus datos
 *     derivan de football-data.org. Se conserva para investigación interna (features y
 *     validación) y no se redistribuye ni se muestra en el producto.
 *  2. **Procedencia**: es una fuente raspada, así que cada fila lleva URL, fecha de
 *     captura y el `sha256` del HTML del que salió. Sin eso no hay auditoría posible.
 *
 * Regla de contrato: un dato que la fuente no publica se guarda como `null`, nunca como
 * cero ni como media imputada.
 */
import { z } from "zod";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SHA256 = /^[a-f0-9]{64}$/;

export const NATIVE_STATS_SCHEMA_VERSION = 1;
export const NATIVE_STATS_SOURCE = "https://native-stats.org";

/** Origen de cada página raspada; se repite en cada fila para poder auditar sin el manifiesto. */
export const NativeStatsSourceRefSchema = z.object({
  url: z.string().url(),
  retrievedAt: z.string().regex(ISO_DATETIME),
  sha256: z.string().regex(SHA256),
});

export type NativeStatsSourceRef = z.infer<typeof NativeStatsSourceRefSchema>;

export const NativeStatsTeamRefSchema = z.object({
  /** Identificador de la fuente (football-data.org). */
  nativeId: z.number().int().positive(),
  name: z.string().min(1),
  code: z.string().min(1).max(6),
});

export type NativeStatsTeamRef = z.infer<typeof NativeStatsTeamRefSchema>;

const TripleSchema = z.object({
  total: z.number().int().nullable(),
  home: z.number().int().nullable(),
  away: z.number().int().nullable(),
});

const ScoreSchema = z.object({
  home: z.number().int().min(0),
  away: z.number().int().min(0),
});

export const NativeStatsAggregateSchema = z.object({
  key: z.string().min(3),
  total: z.number().int().nullable(),
  home: z.number().int().nullable(),
  away: z.number().int().nullable(),
  leagueMax: z.number().int().nullable(),
  leagueMin: z.number().int().nullable(),
});

export const NativeStatsStreakSchema = z.object({
  key: z.string().min(3),
  current: TripleSchema,
  record: TripleSchema,
  /** Récord de la competición: qué equipo lo tiene y con cuántos partidos. */
  leagueHistory: z.array(
    z.object({
      nativeId: z.number().int().positive().nullable(),
      value: z.number().int().nullable(),
    }),
  ),
});

export const NativeStatsOverviewSchema = z.object({
  leaguePosition: z.number().int().nullable(),
  marketValueMillionEur: z.number().nullable(),
  /** Chips de los últimos 10 partidos (`LLWWD`), tal como los pinta la fuente. */
  last10: z.string().regex(/^[WDL]{1,10}$/).nullable(),
  lastWin: z.string().nullable(),
  lastLoss: z.string().nullable(),
  lastLossOfPoints: z.string().nullable(),
  lastGainOfPoints: z.string().nullable(),
});

export const NativeStatsTeamSchema = z.object({
  /** `<liga>.<slug>` canónico del histórico, o `null` si no hubo emparejamiento. */
  teamId: z.string().nullable(),
  nativeId: z.number().int().positive(),
  name: z.string().min(1),
  code: z.string().min(1).max(6),
  /** Liga del producto a la que se asigna la competición (`premier-league`, …). */
  league: z.string(),
  competitionCode: z.string().min(2),
  /** Competición sobre la que la página agrega los totales ("SB", "PL", …). */
  scopeCode: z.string().nullable(),
  crest: z.string().nullable(),
  overview: NativeStatsOverviewSchema,
  aggregates: z.array(NativeStatsAggregateSchema),
  streaks: z.array(NativeStatsStreakSchema),
  source: NativeStatsSourceRefSchema,
});

export type NativeStatsTeam = z.infer<typeof NativeStatsTeamSchema>;

export const NativeStatsMatchSchema = z.object({
  nativeMatchId: z.number().int().positive(),
  league: z.string(),
  competitionCode: z.string().min(2),
  date: z.string().regex(ISO_DATE).nullable(),
  kickoff: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  home: NativeStatsTeamRefSchema.nullable(),
  away: NativeStatsTeamRefSchema.nullable(),
  score: ScoreSchema.nullable(),
  /** Marcador al descanso; es el único campo que el corpus no tiene. */
  halfTime: ScoreSchema.nullable(),
  status: z.enum(["finished", "scheduled"]),
  goals: z.array(
    z.object({
      minute: z.number().int().min(0).max(200).nullable(),
      team: z.string().nullable(),
      scorer: z.string().nullable(),
      assist: z.string().nullable(),
      score: ScoreSchema.nullable(),
    }),
  ),
  bookings: z.array(
    z.object({
      minute: z.number().int().min(0).max(200).nullable(),
      team: z.string().nullable(),
      text: z.string(),
    }),
  ),
  substitutions: z.array(
    z.object({
      minute: z.number().int().min(0).max(200).nullable(),
      team: z.string().nullable(),
      text: z.string(),
    }),
  ),
  /** Partido del corpus al que se emparejó (misma liga, fecha y equipos). */
  corpusGameId: z.string().nullable(),
  /** El marcador de la fuente coincide con el del corpus (control de identidad). */
  corpusScoreMatches: z.boolean().nullable(),
  /** Aporta un marcador al descanso que el corpus no tenía. */
  addsHalfTime: z.boolean(),
  source: NativeStatsSourceRefSchema,
});

export type NativeStatsMatch = z.infer<typeof NativeStatsMatchSchema>;

const PairSchema = z.object({
  home: z.number().nullable(),
  away: z.number().nullable(),
});

export const NativeStatsFormMetricsSchema = z.object({
  avgPoints: PairSchema,
  avgGoals: PairSchema,
  combinedGoals: z.number().nullable(),
  avgScoredGoals: PairSchema,
  combinedScoredGoals: z.number().nullable(),
  avgConcededGoals: PairSchema,
  /** Percentil combinado de goles en el primer tiempo (0–100). */
  combinedFirstHalfGoalsPercentile: z.number().min(0).max(100).nullable(),
  /** Percentil combinado de goles en el segundo tiempo (0–100). */
  combinedSecondHalfGoalsPercentile: z.number().min(0).max(100).nullable(),
  bothTeamsScored: PairSchema,
  failedToScore: PairSchema,
  over15: PairSchema,
  over25: PairSchema,
  over35: PairSchema,
});

export const NativeStatsFormRowSchema = z.object({
  date: z.string().regex(ISO_DATE),
  league: z.string(),
  competitionCode: z.string().min(2),
  nativeMatchId: z.number().int().positive().nullable(),
  status: z.enum(["finished", "scheduled"]),
  kickoff: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  home: NativeStatsTeamRefSchema.nullable(),
  away: NativeStatsTeamRefSchema.nullable(),
  score: ScoreSchema.nullable(),
  odds: z
    .object({
      home: z.number().gt(1),
      draw: z.number().gt(1),
      away: z.number().gt(1),
    })
    .nullable(),
  metrics: NativeStatsFormMetricsSchema,
  corpusGameId: z.string().nullable(),
  source: NativeStatsSourceRefSchema,
  /** La forma es una foto del día: sirve como referencia, nunca como dato publicado. */
  usage: z.literal("research-only"),
});

export type NativeStatsFormRow = z.infer<typeof NativeStatsFormRowSchema>;

export const NativeStatsStreakBoardSchema = z.object({
  league: z.string(),
  competitionCode: z.string().nullable(),
  entries: z.array(
    z.object({
      rank: z.number().int().nullable(),
      nativeId: z.number().int().positive().nullable(),
      name: z.string().nullable(),
      code: z.string().nullable(),
      days: z.number().int().nullable(),
      matches: z.number().int().nullable(),
      periodStart: z.string().regex(ISO_DATE).nullable(),
      periodEnd: z.string().regex(ISO_DATE).nullable(),
    }),
  ),
  source: NativeStatsSourceRefSchema,
});

export type NativeStatsStreakBoard = z.infer<typeof NativeStatsStreakBoardSchema>;

export const NativeStatsCompetitionSchema = z.object({
  league: z.string(),
  competitionCode: z.string().min(2),
  name: z.string().nullable(),
  seasonLabel: z.string().nullable(),
  seasons: z.array(z.object({ id: z.string(), label: z.string(), selected: z.boolean() })),
  standings: z.array(
    z.object({
      position: z.number().int().min(1),
      teamId: z.string().nullable(),
      nativeId: z.number().int().positive(),
      name: z.string(),
      code: z.string(),
      played: z.number().int().nullable(),
      points: z.number().int().nullable(),
      goalDiff: z.number().int().nullable(),
      goalsFor: z.number().int().nullable(),
      goalsAgainst: z.number().int().nullable(),
    }),
  ),
  source: NativeStatsSourceRefSchema,
});

export type NativeStatsCompetition = z.infer<typeof NativeStatsCompetitionSchema>;

/** Resultado del cotejo de rachas contra el corpus: una fila por racha comparable. */
export const NativeStatsStreakCheckSchema = z.object({
  teamId: z.string().min(3),
  key: z.string().min(3),
  /** Valor que publica la fuente para la racha vigente (total). */
  native: z.number().int().nullable(),
  /** Valor recalculado desde el corpus con la misma definición. */
  corpus: z.number().int().nullable(),
  /** `null` cuando no se puede comparar (la racha necesita el descanso, por ejemplo). */
  agrees: z.boolean().nullable(),
  reason: z.string().nullable(),
});

export type NativeStatsStreakCheck = z.infer<typeof NativeStatsStreakCheckSchema>;

export const NativeStatsLeagueReportSchema = z.object({
  id: z.string(),
  competitionCode: z.string(),
  teams: z.number().int().min(0),
  matchedTeams: z.number().int().min(0),
  unmatchedNames: z.array(z.string()),
  matches: z.number().int().min(0),
  /** Partidos de la fuente emparejados con el corpus por fecha y equipos. */
  joinedMatches: z.number().int().min(0),
  /** Emparejados con el mismo marcador final (identidad confirmada). */
  scoreConfirmed: z.number().int().min(0),
  /** Partidos del corpus que ganan marcador al descanso. */
  halfTimeAdded: z.number().int().min(0),
  /** Partidos con descanso capturado, aunque todavía no estén en el corpus. */
  halfTimeCaptured: z.number().int().min(0),
  halfTimeConflicts: z.number().int().min(0),
  formRows: z.number().int().min(0),
  /**
   * Auditoría de completitud: partidos que la fuente declara jugados en la temporada
   * frente a los que el corpus tiene. Es el hallazgo accionable del cotejo.
   */
  corpusCoverage: z.object({
    seasonLabel: z.string().nullable(),
    seasonId: z.string().nullable(),
    teamsMeasured: z.number().int().min(0),
    teamsBehind: z.number().int().min(0),
    /**
     * Diferencia sumada por equipo. Un partido faltante aparece dos veces (una por cada
     * equipo que lo jugó), así que no es un conteo de partidos.
     */
    missingTeamAppearances: z.number().int().min(0),
    /** Estimación de partidos: apariciones faltantes / 2. */
    approximateMissingMatches: z.number().int().min(0),
    gaps: z.array(
      z.object({
        teamId: z.string().min(3),
        nativePlayed: z.number().int().min(0),
        corpusPlayed: z.number().int().min(0),
        missing: z.number().int().min(0),
      }),
    ),
  }),
  streakChecks: z.object({
    compared: z.number().int().min(0),
    agree: z.number().int().min(0),
    disagree: z.number().int().min(0),
    notComparable: z.number().int().min(0),
    disagreements: z.array(NativeStatsStreakCheckSchema),
  }),
});

export type NativeStatsLeagueReport = z.infer<typeof NativeStatsLeagueReportSchema>;

export const NativeStatsManifestSchema = z.object({
  schemaVersion: z.literal(NATIVE_STATS_SCHEMA_VERSION),
  datasetId: z.string().regex(SHA256),
  generatedAt: z.string().regex(ISO_DATETIME),
  generatedBy: z.literal("services/ingest/history/native-stats"),
  source: z.object({
    site: z.literal(NATIVE_STATS_SOURCE),
    underlyingProvider: z.literal("football-data.org"),
    license: z.literal("research-only"),
    robotsAllowsCrawl: z.boolean(),
    pagesRetrieved: z.number().int().min(0),
    pagesCached: z.number().int().min(0),
    bytes: z.number().int().min(0),
  }),
  corpus: z.object({
    datasetId: z.string().nullable(),
    rows: z.number().int().min(0),
    rowsWithHalfTime: z.number().int().min(0),
  }),
  totals: z.object({
    leagues: z.number().int().min(0),
    teams: z.number().int().min(0),
    matchedTeams: z.number().int().min(0),
    matches: z.number().int().min(0),
    halfTimeAdded: z.number().int().min(0),
    halfTimeCaptured: z.number().int().min(0),
    formRows: z.number().int().min(0),
    /** Equipos cuyo corpus va por detrás de los partidos que la fuente declara jugados. */
    teamsBehind: z.number().int().min(0),
    /** Apariciones faltantes (cada partido cuenta dos veces, una por equipo). */
    missingTeamAppearances: z.number().int().min(0),
    /** Estimación de partidos faltantes en la temporada en curso. */
    approximateMissingMatches: z.number().int().min(0),
    streakChecksCompared: z.number().int().min(0),
    streakChecksDisagreed: z.number().int().min(0),
  }),
  files: z.object({
    competitions: z.string(),
    teams: z.string(),
    matches: z.string(),
    form: z.string(),
    streakBoards: z.string(),
  }),
  leagues: z.array(NativeStatsLeagueReportSchema),
  notes: z.array(z.string()),
});

export type NativeStatsManifest = z.infer<typeof NativeStatsManifestSchema>;
