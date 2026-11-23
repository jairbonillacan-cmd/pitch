import type {
  CountProjection,
  HeadToHeadView,
  LeagueId,
  MatchPreGameContext,
  PlatformSport,
  StandingRow,
} from "@pitchlab/contracts";
import type { MatchPicksCatalog } from "./picks-catalog/catalog-types";

export type ViewerRole = "visitor" | "member" | "tipster" | "admin";
export type ViewerVia = "beta" | "account" | "none";
export type PaymentMode = "transfer" | "stripe";
export type OddsFormat = "american" | "decimal";
export type RiskBand = "conservador" | "medio" | "arriesgado";

export type EngineKey =
  | "tachyon"
  | "singularity"
  | "minkowski"
  | "geodesic"
  | "cortex";

export interface SpacetimeEngineSpec {
  key: EngineKey;
  mono: string;
  shortName: string;
  name: string;
  version: string;
  pillar: "Data Science" | "Machine Learning" | "Inteligencia Artificial";
  domain: string;
  roleLabel: string;
  colorVar: string;
  readsText: string;
  summary: string;
  inputsLabel: string;
  proofFigure: string;
  proofTone: "ok" | "neutral";
  proofContext: string;
  retrainCadence: string;
}

export interface PrecisionBucket {
  id: string;
  shortLabel: string;
  label: string;
  rangeLabel: string;
  promisedMeanP: number;
  /** null hasta tener picks auditados de PitchLab. */
  actualHitRate: number | null;
  auditedPicksCount: number | null;
  closingBeatRate: number | null;
}

export interface SpacetimeVsTipsterRow {
  criterion: string;
  pitchlab: string;
  tipster: string;
}

export interface LandingFaqItem {
  question: string;
  answer: string;
  defaultOpen?: boolean;
}

export type PickCategory =
  | "principal"
  | "conservador"
  | "totales"
  | "tactico"
  | "valor";

export type PickConflictGroup =
  | "home_side"
  | "away_side"
  | "draw_side"
  | "over_total"
  | "under_total"
  | "btts_yes"
  | "btts_no"
  | "independent";

export interface BookQuoteItem {
  book: string;
  bookLabel: string;
  decimal: number;
  capturedAtUtc: string;
  openingDecimal?: number | null;
  movementDirection?: "shortening" | "drifting" | "stable" | null;
  isBest?: boolean;
}

export interface MatchPick {
  id: string;
  gameId: string;
  league: LeagueId;
  leagueLabel: string;
  matchLabel: string;
  kickoffLocal: string;
  gameStatus: "NS" | "FT" | "LIVE";
  slotIndex: number;
  category: PickCategory;
  categoryLabel: string;
  risk: RiskBand;
  engineKey: EngineKey;
  engineName: string;
  marketGroup: string;
  selectionKey: string;
  market?: string;
  line?: number | null;
  conflictGroup: PickConflictGroup;
  label: string;
  rationale: string;
  p: number;
  fairDecimal: number;
  fairAmerican: number;
  /** Momio real de casa (Spacetime v3.0 / cuotas vigentes). `null` cuando no hay mercado verificado. */
  marketDecimal: number | null;
  marketAmerican: number | null;
  /** Casa y sello UTC de captura del momio real (`null` cuando no hay cuota verificada). */
  marketBookLabel?: string | null;
  marketCapturedAtUtc?: string | null;
  /** Cuotas vigentes por casa autorizada (< 72 h, informativas sin afiliados). */
  bookQuotes?: readonly BookQuoteItem[];
  /** Ventaja en puntos de probabilidad frente al momio real. `null` sin mercado. */
  edgePts: number | null;
  confidenceScore: number | null;
  suggestedUnits: number;
  result?: "hit" | "miss" | null;
  isDailyOpenPromo?: boolean;
  isTipsterWeeklyOpen?: boolean;
  tipsterSlug?: string;
  isRedacted?: boolean;
}

export interface LineupAbsenceItem {
  teamSide: "home" | "away";
  player: string;
  role: string;
  status: "Confirmado XI" | "Baja" | "Duda";
  impactNote: string;
  injuryType?: string;
  returnDate?: string;
}

export interface ConfirmedLineupPlayer {
  name: string;
  number?: number;
  position?: string;
}

export interface VerifiedMatchLineups {
  /** Nombre visible de la fuente verificada que publicó el once oficial. */
  sourceLabel: string;
  /** Momento ISO UTC de verificación de la alineación oficial. */
  verifiedAtUtc: string;
  status?: "confirmed" | "predicted";
  confirmed?: boolean;
  /** Porcentaje de confianza cuando es alineación probable/proyectada (0-100). */
  confidence?: number;
  homeFormation?: string;
  awayFormation?: string;
  homeStarters: ConfirmedLineupPlayer[];
  awayStarters: ConfirmedLineupPlayer[];
}

export interface FrozenMainPickSnapshot {
  gameId: string;
  pickId: string;
  label: string;
  categoryLabel: string;
  marketGroup: string;
  selectionKey: string;
  p: number;
  fairDecimal: number;
  fairAmerican: number;
  kickoffUtc: string;
  freezeAtUtc: string;
}

export interface PreGameIntel {
  cortexSynthesis: string;
  tacticalKeys: string[];
  lineupStatusLabel: string;
  lineupsConfirmed60m: boolean;
  /** Alineación oficial verificada; `null` o ausente mientras no exista fuente real activa. */
  confirmedLineups?: VerifiedMatchLineups | null;
  /** XI probable estimada cuando aún no sale el once oficial 60 min antes. */
  probableLineups?: VerifiedMatchLineups | null;
  /** Metadatos reales prepartido (clima, campo, árbitro, viaje, TV MX). */
  matchContext?: MatchPreGameContext | null;
  /** Solo bajas reportadas por fuentes reales; vacío si no hay reporte. */
  absences: LineupAbsenceItem[];
  /** Reparto real del mercado; `null` si no hay datos de mercado. */
  moneyFlow: {
    homeShare: number;
    drawShare?: number;
    awayShare: number;
    sharpNote: string;
  } | null;
  isRedacted?: boolean;
}

export type MarketCardCategory =
  | "resultado"
  | "goles"
  | "conteos"
  | "handicap"
  | "marcador"
  | "primer_tiempo";

export type MatchTabKey = "resumen" | "ia" | "numeros" | "dinero" | "contexto";

export interface PlatformMarketRow {
  group: string;
  market: string;
  selection: string;
  label: string;
  line?: number | null;
  p: number;
  fairDecimal: number;
  fairAmerican: number;
  /** Momio de apertura: historial prepartido cuando la fuente lo reporta, si no `null`. */
  openDecimal: number | null;
  /** Momio real de casa; `null` sin mercado verificado. */
  currentDecimal: number | null;
  /** Dirección de movimiento respecto a la apertura (`shortening` bajando, `drifting` subiendo). */
  movementDirection?: "shortening" | "drifting" | "stable" | null;
  /** Nombre visible de la casa y momento UTC de captura del momio vigente (`< 72 h`). */
  quoteBookLabel?: string | null;
  quoteCapturedAtUtc?: string | null;
  /** Cuotas vigentes por casa autorizada (< 72 h, informativas sin afiliados). */
  bookQuotes?: readonly BookQuoteItem[];
  edgePts: number | null;
  /** `true` cuando la línea se deriva localmente con el motor v3.2. */
  isDerived?: boolean;
  /** Categoría agrupada en la pestaña «Mercados». */
  cardCategory?: MarketCardCategory;
  /** Subtítulo de tarjeta dentro de la categoría. */
  cardTitle?: string;
  /** `true` si es la opción con mayor probabilidad de su tarjeta. */
  isMostLikely?: boolean;
}

/** Salida de PitchLab Spacetime Suite v3.0 para un partido (calculada en servidor). */
export interface SpacetimeSignal {
  /** Motor que produjo la probabilidad final (p. ej. "PitchLab Singularity v3.0"). */
  engineName: string;
  /** Motor deportivo base (Tachyon v3.0 / Minkowski v3.0). */
  sportsEngineName: string;
  probs: { home: number; draw: number; away: number };
  /** Mercado real (no-vig) y momios de casa; `null` si el partido no tiene líneas. */
  market: {
    bookLabel: string;
    asOfUtc: string | null;
    overround: number;
    noVig: { home: number; draw: number; away: number };
    odds: { home: number; draw: number | null; away: number };
  } | null;
  /** Evaluación de valor de Geodesic v2.0 por lado; vacío sin mercado. */
  value: Array<{
    side: "home" | "draw" | "away";
    prob: number;
    decimalOdds: number;
    edge: number;
    ev: number;
    stake: number;
    vetoed: boolean;
    institutionalConfirmation: boolean;
  }>;
  expectedTotal: number | null;
  expectedMargin: number | null;
  drivers: Array<{ label: string; impactLogit: number }>;
  availability: {
    homeInjured: number | null;
    awayInjured: number | null;
    homeMissingValuePct: number | null;
    awayMissingValuePct: number | null;
  };
  stadium: { name: string | null; elevationM: number | null };
  /**
   * `true` cuando los mercados del partido ya vienen del panorama v3.2 (`MatchOutlook`):
   * el armador de picks los usa tal cual, sin recalcularlos con `probs` ni `expectedTotal`.
   */
  outlookDriven?: boolean;
}

export interface PlatformGame {
  id: string;
  league: LeagueId;
  leagueLabel: string;
  leagueLogoUrl?: string;
  sport: PlatformSport;
  round: string;
  dayId: string;
  dayLabel: string;
  kickoffUtc: string;
  kickoffLocal: string;
  venue: string;
  referee?: string;
  neutralSite?: boolean;
  status: "NS" | "FT" | "LIVE";
  score?: { home: number; away: number };
  home: {
    slug: string;
    name: string;
    shortName: string;
    code: string;
    logoUrl?: string;
    record: string;
    form?: readonly string[];
  };
  away: {
    slug: string;
    name: string;
    shortName: string;
    code: string;
    logoUrl?: string;
    record: string;
    form?: readonly string[];
  };
  /** `false` cuando el snapshot no trae análisis/pronóstico para este partido. */
  hasForecast?: boolean;
  x12: [number, number, number] | null;
  projection: {
    home: number;
    away: number;
    total: number;
  } | null;
  /** Línea principal de goles/puntos (la más cercana al 50 %) y probabilidad de Más. */
  goalLine?: {
    line: number;
    pOver: number;
  } | null;
  confidenceScore: number | null;
  confidenceLevel: "alta" | "media" | "baja" | null;
  /** Por qué la confianza es la que es: frases cortas y el desglose por factor. */
  confidenceDetail?: {
    reasons: string[];
    factors: Array<{ key: string; label: string; value: number; weight: number; detail: string }>;
  };
  picks: MatchPick[];
  /** Líneas elegibles adicionales (`>= 52 %`) de mercados calculados (spreads alternativos, totales, doble oportunidad) para el optimizador por cuota objetivo. */
  parlayCandidates?: MatchPick[];
  preGame: PreGameIntel;
  markets: PlatformMarketRow[];
  factors: Array<{ label: string; value: string; sub?: string }>;
  headToHead: HeadToHeadView[];
  restDays?: { home?: number; away?: number };
  counts?: {
    corners?: CountProjection;
    fouls?: CountProjection;
    yellow?: CountProjection;
  };
  updatedAtLabel: string;
  spacetime: SpacetimeSignal | null;
}

/** Banda de confianza calibrada al 90 % para una probabilidad del partido (sin stake ni EV). */
export interface EpistemicBandView {
  readonly pPoint: number;
  readonly pLower90: number;
  readonly pUpper90: number;
  readonly halfWidth90: number;
  readonly conservativeFairDecimal: number;
  readonly grade: "high" | "moderate" | "elevated";
}

/** Ventaja matemática exacta de Pago Anticipado (+2 goles, +17 NFL, +20 NBA, +5 MLB). */
export interface EarlyPayoutSummaryView {
  readonly triggerLabel: string;
  readonly homeWinProb: number;
  readonly awayWinProb: number;
  readonly homeLiftPts: number;
  readonly awayLiftPts: number;
  readonly fairHomeDecimal: number;
  readonly fairAwayDecimal: number;
  readonly bothTriggerProb?: number;
  readonly validatedOos: boolean;
}

/** Proyecciones causales de micro-mercados y rigor arbitral histórico para la ficha del partido. */
export interface MicroCountsV5View {
  readonly corners?: { readonly home: number; readonly away: number; readonly total: number };
  readonly yellowCards?: { readonly home: number; readonly away: number; readonly total: number };
  readonly fouls?: { readonly home: number; readonly away: number; readonly total: number };
  readonly shots?: { readonly home: number; readonly away: number; readonly total: number };
  readonly shotsOnTarget?: { readonly home: number; readonly away: number; readonly total: number };
  readonly redCardMatchProb?: number;
  readonly bookingPointsMean?: number;
  readonly refereeProfile?: {
    readonly name: string;
    readonly games: number;
    readonly cardsMultiplier: number;
    readonly foulsMultiplier: number;
    readonly redsMultiplier: number;
  } | null;
}

/** Enriquecimiento aditivo de Spacetime Suite v5.1 para la ficha del partido (Cero-Fuga / FD-16). */
export interface MatchIntelligenceV5View {
  readonly epistemic: {
    readonly home: EpistemicBandView;
    readonly draw?: EpistemicBandView | null;
    readonly away: EpistemicBandView;
  };
  readonly earlyPayout?: EarlyPayoutSummaryView | null;
  readonly microCounts?: MicroCountsV5View | null;
  readonly nflSpecials?: {
    readonly expectedMargin: number;
    readonly pExactPlus3: number;
    readonly pExactMinus3: number;
    readonly pOvertime: number;
    readonly fairOvertimeDecimal: number;
  } | null;
  readonly multisportSpecials?: {
    readonly sport: "mlb" | "nhl" | "nba";
    readonly highlights: ReadonlyArray<{
      readonly label: string;
      readonly value: string;
      readonly sub?: string;
    }>;
  } | null;
  /** Síntesis determinista verificada en español (respaldo inmediato sin LLM, 0 alucinaciones). */
  readonly verifiedSummaryEs: string;
  readonly guardrailPassed: boolean;
}

/** Auditoría de correlación y margen oculto SGP calculada con Cópula Student-t. */
export interface SgpCopulaAuditView {
  readonly sport: "soccer" | "nfl";
  readonly nLegs: number;
  readonly independentProbability: number;
  readonly jointProbability: number;
  readonly correlationMultiplier: number;
  readonly correlationDirection:
    | "positively_correlated"
    | "negatively_correlated"
    | "near_independent";
  readonly fairCombinedDecimal: number;
  readonly fairCombinedAmerican: number;
  readonly bookQuoteAudit?: {
    readonly offeredDecimal: number;
    readonly impliedBookProbability: number;
    readonly fairCombinedDecimal: number;
    readonly effectiveHoldPct: number;
    readonly taxFlag: "fair_or_low_vig" | "standard_sgp_vig" | "severe_sgp_tax";
  } | null;
}

export interface MatchInjuryItem {
  readonly teamSide: "home" | "away";
  readonly player: string;
  readonly playerSlug?: string | null;
  readonly position: string | null;
  readonly status: string;
  readonly detail: string | null;
  readonly injuryCategory?: string | null;
  readonly expectedReturn?: string | null;
  readonly reportedAt?: string | null;
  readonly photoKey?: string | null;
  readonly fallbackPhotoKey?: string | null;
}

export interface MatchLineupPlayerRecentMatch {
  readonly dateIso: string;
  readonly opponent: string;
  readonly score: string | null;
  readonly result: "W" | "D" | "L" | null;
  readonly statsSummary: string;
}

export interface MatchLineupPlayerDetail {
  readonly id: string;
  readonly name: string;
  readonly shortName: string;
  readonly slug: string;
  readonly jersey: string | null;
  readonly positionGroup: "GK" | "DEF" | "MID" | "FWD";
  readonly positionLabel: string;
  readonly age: number | null;
  readonly heightCm: number | null;
  readonly nationality: string | null;
  readonly nationalityCode: string | null;
  readonly photoKey: string | null;
  readonly fallbackPhotoKey: string | null;
  readonly rating: number | null;
  readonly statsSummary: string;
  readonly playerHref: string | null;
  readonly recentMatches: readonly MatchLineupPlayerRecentMatch[];
  readonly isStarter: boolean;
  readonly availability: "available" | "injured" | "doubtful" | "suspended";
}

export interface MatchLineupSide {
  readonly teamSlug: string;
  readonly teamName: string;
  readonly formation: string;
  readonly coachName: string | null;
  readonly coachPhotoKey: string | null;
  readonly coachNationality: string | null;
  readonly starters: readonly MatchLineupPlayerDetail[];
  readonly substitutes: readonly MatchLineupPlayerDetail[];
  readonly unavailable: readonly MatchLineupPlayerDetail[];
}

export interface MatchEnrichedLineups {
  readonly status: "confirmed" | "probable";
  readonly bannerLabel: string;
  readonly home: MatchLineupSide;
  readonly away: MatchLineupSide;
}

export interface TeamRankingMetricRow {
  readonly key: string;
  readonly label: string;
  readonly unit: string;
  readonly homeValue: number;
  readonly homeRank: number;
  readonly awayValue: number;
  readonly awayRank: number;
  readonly higherIsBetter: boolean;
}

export interface MatchupTeamRankings {
  readonly leagueSize: number;
  readonly attack: readonly TeamRankingMetricRow[];
  readonly defense: readonly TeamRankingMetricRow[];
}

export interface MatchHistoryRow {
  readonly id: string;
  readonly dateIso: string;
  readonly competitionLabel: string;
  readonly isSameCompetition: boolean;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly homeSlug: string;
  readonly awaySlug: string;
  readonly homeScore: number;
  readonly awayScore: number;
  readonly isHomeForFocus: boolean;
  readonly resultForFocus: "W" | "D" | "L";
}

export interface MatchEnfrentamientosData {
  readonly rankings: MatchupTeamRankings | null;
  readonly h2h: readonly MatchHistoryRow[];
  readonly homeRecent: readonly MatchHistoryRow[];
  readonly awayRecent: readonly MatchHistoryRow[];
}

export interface MatchPlayerPickItem {
  readonly id: string;
  readonly playerName: string;
  readonly playerSlug: string | null;
  readonly teamSide: "home" | "away";
  readonly teamName: string;
  readonly teamSlug: string | null;
  readonly positionLabel: string | null;
  readonly photoKey: string | null;
  readonly fallbackPhotoKey: string | null;
  readonly playerHref: string | null;
  readonly marketKey: string;
  readonly marketLabel: string;
  readonly direction: "over" | "under" | "other";
  readonly selectionLabel: string;
  readonly line: number | null;
  readonly p: number;
  readonly fairDecimal: number;
  readonly marketDecimal: number | null;
  readonly marketBookLabel: string | null;
  readonly evPct: number | null;
  readonly evidenceBullets: readonly {
    readonly label: string;
    readonly ratePct: number | null;
    readonly tone: "green" | "amber" | "red" | "neutral";
  }[];
  readonly pick: MatchPick;
}

/**
 * Detalle pesado de un partido (mercados, enfrentamientos previos y factores). Solo lo usa la
 * ficha del partido: el layout manda los partidos sin él y la ficha lo pide para su partido.
 */
export type PlatformGameDetail = Pick<PlatformGame, "markets" | "headToHead" | "factors"> & {
  /** Panorama por mercado del motor v3.2 (o v5.1 en ligas de expansión); `null` si no aplica. */
  outlook?: MatchOutlookSummary | null;
  /** Enriquecimiento aditivo de Spacetime Suite v5.1 (bandas 90 %, pago anticipado, micro-mercados). */
  v5?: MatchIntelligenceV5View | null;
  /** Pick principal congelado 60 min antes del inicio (persistido en servidor si ya cruzó el umbral). */
  frozenMainPick?: FrozenMainPickSnapshot | null;
  picksCatalog?: MatchPicksCatalog | null;
  enrichedLineups?: MatchEnrichedLineups | null;
  enfrentamientos?: MatchEnfrentamientosData | null;
  playerPicks?: readonly MatchPlayerPickItem[];
  injuries?: readonly MatchInjuryItem[];
};

/**
 * Resumen del panorama v3.2 (`MatchOutlook`) de un partido: lo más probable, los marcadores
 * más probables y la calidad de los datos. Sin stake, Kelly ni EV: solo probabilidad y
 * momio justo (1 / p). Las cuotas de casa solo existen con captura real de menos de 72 h.
 */
export interface MatchOutlookSummary {
  generatedAtUtc: string;
  /** Resultado (1X2 o ganador) más probable con su momio justo. */
  mostLikely: { label: string; p: number; fairDecimal: number } | null;
  /** Hasta 3 marcadores más probables (solo fútbol). */
  scorelines: Array<{ home: number; away: number; p: number; fairDecimal: number }>;
  quality: {
    flag: "ok" | "low_coverage" | "fallback_base_rate";
    /** Porcentaje de datos del modelo disponibles para este partido (0–100). */
    coveragePct: number;
  };
  /** `true` si algún mercado tiene cuota real de casa capturada hace menos de 72 h. */
  hasRecentQuote: boolean;
  /** Última cuota real de casa capturada (`< 72 h`) para mostrar sello horario visible. */
  latestQuote?: {
    bookLabel: string;
    capturedAtUtc: string;
  } | null;
}

export interface PlatformLeagueSummary {
  league: LeagueId;
  label: string;
  logoUrl?: string;
  sport: PlatformSport;
  season: string;
  roundLabel: string;
  generatedAt: string;
  totalGames: number;
  upcomingCount: number;
  finishedCount: number;
  leaderName?: string;
  leaderPoints?: number;
  standings: StandingRow[];
}

export interface TipsterCreator {
  handle: string;
  name: string;
  specialty: string;
  avatarInitials: string;
  avatarGradVar: string;
  promoCode: string;
  freeDays: number;
  commissionPct: number;
  verifiedUnits: string;
  clvAvg: string;
  roi95Ci: string;
  settledCount: number;
  /** Picks cumplidos de `settledCount`. */
  wonCount: number;
  /** Fecha ISO en que se unió. */
  joinedAt: string;
  /** Bio corta del perfil. */
  bio?: string;
  activeReferrals: number;
  monthlyCommissionMxn: number;
  weeklyPickOrigin: "spacetime" | "bitacora";
  weeklyPickSlug: string;
  weeklyPickGameId: string;
  weeklyPickThesis: string;
  /** Perfil ficticio de demostración: la UI lo marca como «Ejemplo». */
  isExample?: boolean;
}

export type SocialReportReason = "spam_enlaces" | "ofensivo" | "apuesta_riesgosa" | "otro";

export interface SocialComment {
  id: string;
  parentCommentId?: string | null;
  replyToHandle?: string | null;
  authorHandle: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  verifiedBadge: string;
  createdAt: string;
  body: string;
  /** Guardado en el servidor (permite reportarlo si es ajeno). */
  fromServer?: boolean;
  /** En camino al servidor (optimista sin UUID definitivo todavía). */
  pending?: boolean;
  /** Lo escribió quien está viendo. */
  isMine?: boolean;
  /** Conteo de votos «Útil» y si quien mira lo marcó. */
  helpfulCount?: number;
  helpfulByMe?: boolean;
}

/** Pick adjunto a una publicación: el mismo que se registra en la bitácora. */
export interface SocialPostPick {
  pickId: string;
  gameId: string;
  label: string;
  units: number;
  userDecimal: number;
  fairDecimal: number;
  /** Probabilidad del modelo, 0–1. */
  modelProbability: number;
  status: "open" | "won" | "lost" | "void";
}

export interface SocialPost {
  id: string;
  authorHandle: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  /** Tipster oficial real confirmado por el servidor. */
  authorIsTipster?: boolean;
  roleBadge: "Tipster Oficial" | "Analista Verificado" | "Socio Pase PitchLab Ultra";
  avatarGradVar: string;
  verifiedRecord: string;
  clvBadge: string;
  leagueLabel: string;
  gameId?: string;
  matchLabel: string;
  pickBadge: string;
  originType: "Spacetime Suite" | "Bitácora Propia";
  createdAt: string;
  body: string;
  likes: number;
  likedByMe?: boolean;
  comments: SocialComment[];
  /** Total de comentarios visibles (puede ser mayor que `comments.length` en el feed). */
  commentsCount?: number;
  /** Socios que siguieron este pick en su bitácora. */
  copiesCount?: number;
  /** Publicación de demostración: la UI la marca como «Ejemplo». */
  isExample?: boolean;
  /** Pick adjunto, si la publicación trae uno. */
  pick?: SocialPostPick;
  /** Fecha real (ISO) cuando viene del servidor; `createdAt` es la etiqueta («Hace 5 min»). */
  createdAtIso?: string;
  /** Guardada en el servidor: la ven todos los socios. */
  fromServer?: boolean;
  /** La escribió quien está viendo (puede borrarla). */
  isMine?: boolean;
  /** Primera insignia destacada del autor (solo si es pública). */
  authorBadge?: { id: string; family: string; label: string; criterion: string } | null;
}

export interface PlayerPropItem {
  id: string;
  league: LeagueId;
  leagueLabel: string;
  gameId: string;
  matchLabel: string;
  kickoffLocal: string;
  player: string;
  teamSlug: string;
  teamName: string;
  position: string;
  statLabel: string;
  baseLine: number;
  step: number;
  minLine: number;
  maxLine: number;
  projectionMean: number;
  projectionSd: number;
  engineName: string;
  marketOverDecimal: number;
  marketUnderDecimal: number;
  last10: number[];
  contextNote: string;
}

export interface JournalParlayLeg {
  pickId: string;
  gameId: string;
  leagueLabel?: string;
  matchLabel?: string;
  pickLabel?: string;
  market?: string;
  selection?: string;
  line?: number | null;
  p?: number;
  fairDecimal?: number;
  kickoffAt?: string;
}

export interface JournalParlayLegResult {
  pickId: string;
  gameId: string;
  status: "won" | "lost" | "void";
  homeScore: number;
  awayScore: number;
  closingDecimal?: number | null;
  clvPct?: number | null;
  settledAt: string;
}

export interface JournalEntry {
  id: string;
  pickId: string;
  gameId: string;
  leagueLabel: string;
  matchLabel: string;
  pickLabel: string;
  origin: "Spacetime Suite" | "Parlay Combinado" | "Player Prop" | "Propio";
  units: number;
  userDecimal: number;
  fairDecimal: number;
  clvPct?: number;
  closingDecimal?: number | null;
  status: "pending" | "won" | "lost" | "void";
  pickKind?: "single" | "parlay";
  parlayLegs?: JournalParlayLeg[];
  parlayLegResults?: JournalParlayLegResult[];
  sealedAt: string;
  /** Fecha ISO del registro; permite ventanas reales (30 días, por mes). */
  sealedAtIso?: string;
  /** Fecha ISO de liquidación cuando el pick ya cerró. */
  settledAtIso?: string | null;
  note?: string;
}

export interface ParlayLeg {
  pick: MatchPick;
}

export interface ParlaySummary {
  legs: ParlayLeg[];
  hasSgpCorrelation: boolean;
  sgpPairsCount: number;
  sgpCorrelationDirection?: SgpCopulaAuditView["correlationDirection"];
  sgpCorrelationMultiplier?: number;
  combinedProbability: number;
  fairDecimal: number;
  fairAmerican: number;
  bookDecimal: number;
  bookAmerican: number;
  edgePts: number;
  stakeUnits: number;
  projectedReturnUnits: number;
  projectedProfitUnits: number;
}

export interface TeamLeagueDirectoryItem {
  id: string;
  league: LeagueId;
  leagueLabel: string;
  slug: string;
  name: string;
  shortName: string;
  code: string;
  rank: number | null;
  href: string;
}

export type LeagueNewsCategory =
  | "lesiones"
  | "mercado"
  | "analisis"
  | "resultados"
  | "jornada";

export interface LeagueNewsArticleSummary {
  id: string;
  title: string;
  lead: string;
  paragraphs: string[];
  keyPoints: string[];
  publishedAtLabel: string;
  byline?: string;
  categoryLabel: string;
}

export interface LeagueNewsItem {
  id: string;
  category: LeagueNewsCategory;
  categoryLabel: string;
  title: string;
  summary: string;
  publishedAtLabel: string;
  badge?: string;
  meta?: string;
  team?: {
    slug: string;
    name: string;
    logoUrl?: string;
  };
  href?: string;
  ctaLabel?: string;
  /** Ruta del servidor para ampliar el resumen editorial dentro de la app (sin salir de PitchLab). */
  summaryHref?: string;
  readMoreLabel?: string;
  summaryHighlights?: string[];
  /** Resumen pre-cargado opcional (útil en stories o señales locales sin llamada extra). */
  preloadedSummary?: LeagueNewsArticleSummary;
}

export interface PlatformDataset {
  generatedAt: string;
  serverNowUtc?: string;
  leagues: PlatformLeagueSummary[];
  games: PlatformGame[];
  /** Directorio ligero de todos los equipos/franquicias activas (búsqueda y navegación). */
  teams?: TeamLeagueDirectoryItem[];
  /** Props individuales de jugadores calculados con la muestra de temporada. */
  playerProps?: PlayerPropItem[];
  dailyPromoPickId: string;
  tipsterWeeklyPickId: string;
  tipsterWeeklySlug: string;
  isServerRedactedForVisitor: boolean;
}
