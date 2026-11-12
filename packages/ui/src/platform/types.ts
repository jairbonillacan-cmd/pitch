import type {
  HeadToHeadView,
  LeagueId,
  StandingRow,
} from "@pitchlab/contracts";

export type ViewerRole = "visitor" | "member" | "tipstar" | "admin";
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
  conflictGroup: PickConflictGroup;
  label: string;
  rationale: string;
  p: number;
  fairDecimal: number;
  fairAmerican: number;
  /** Momio real de casa (Spacetime v3.0). `null` cuando no hay mercado verificado. */
  marketDecimal: number | null;
  marketAmerican: number | null;
  /** Ventaja en puntos de probabilidad frente al momio real. `null` sin mercado. */
  edgePts: number | null;
  confidenceScore: number;
  suggestedUnits: number;
  result?: "hit" | "miss" | null;
  isDailyOpenPromo?: boolean;
  isTipstarWeeklyOpen?: boolean;
  tipstarSlug?: string;
  isRedacted?: boolean;
}

export interface LineupAbsenceItem {
  teamSide: "home" | "away";
  player: string;
  role: string;
  status: "Confirmado XI" | "Baja" | "Duda";
  impactNote: string;
}

export interface PreGameIntel {
  cortexSynthesis: string;
  tacticalKeys: string[];
  lineupStatusLabel: string;
  lineupsConfirmed60m: boolean;
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

export interface PlatformMarketRow {
  group: string;
  market: string;
  selection: string;
  label: string;
  p: number;
  fairDecimal: number;
  fairAmerican: number;
  /** Momio de apertura: hoy no hay histórico de líneas, siempre `null`. */
  openDecimal: number | null;
  /** Momio real de casa; `null` sin mercado verificado. */
  currentDecimal: number | null;
  edgePts: number | null;
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
}

export interface PlatformGame {
  id: string;
  league: LeagueId;
  leagueLabel: string;
  sport: "football" | "american-football";
  round: string;
  dayId: string;
  dayLabel: string;
  kickoffUtc: string;
  kickoffLocal: string;
  venue: string;
  status: "NS" | "FT" | "LIVE";
  score?: { home: number; away: number };
  home: {
    slug: string;
    name: string;
    shortName: string;
    code: string;
    record: string;
  };
  away: {
    slug: string;
    name: string;
    shortName: string;
    code: string;
    record: string;
  };
  x12: [number, number, number];
  projection: {
    home: number;
    away: number;
    total: number;
  };
  confidenceScore: number;
  confidenceLevel: "alta" | "media" | "baja";
  picks: MatchPick[];
  preGame: PreGameIntel;
  markets: PlatformMarketRow[];
  factors: Array<{ label: string; value: string; sub?: string }>;
  headToHead: HeadToHeadView[];
  restDays?: { home?: number; away?: number };
  updatedAtLabel: string;
  spacetime: SpacetimeSignal | null;
}

/**
 * Detalle pesado de un partido (mercados, enfrentamientos previos y factores). Solo lo usa la
 * ficha del partido: el layout manda los partidos sin él y la ficha lo pide para su partido.
 */
export type PlatformGameDetail = Pick<PlatformGame, "markets" | "headToHead" | "factors">;

export interface PlatformLeagueSummary {
  league: LeagueId;
  label: string;
  sport: "football" | "american-football";
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

export interface TipstarCreator {
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
  authorHandle: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  verifiedBadge: string;
  createdAt: string;
  body: string;
  /** Guardado en el servidor (permite reportarlo si es ajeno). */
  fromServer?: boolean;
  /** Lo escribió quien está viendo. */
  isMine?: boolean;
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
  status: "open" | "won" | "lost";
}

export interface SocialPost {
  id: string;
  authorHandle: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  roleBadge: "Tipstar Oficial" | "Analista Verificado" | "Socio Pase PitchLab Ultra";
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
  clvPct: number;
  status: "pending" | "won" | "lost";
  sealedAt: string;
  /** Fecha ISO del registro; permite ventanas reales (30 días, por mes). */
  sealedAtIso?: string;
  note?: string;
}

export interface ParlayLeg {
  pick: MatchPick;
}

export interface ParlaySummary {
  legs: ParlayLeg[];
  hasSgpCorrelation: boolean;
  sgpPairsCount: number;
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

export interface PlatformDataset {
  generatedAt: string;
  leagues: PlatformLeagueSummary[];
  games: PlatformGame[];
  dailyPromoPickId: string;
  tipstarWeeklyPickId: string;
  tipstarWeeklySlug: string;
  isServerRedactedForVisitor: boolean;
}
