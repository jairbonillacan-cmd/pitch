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
  name: string;
  version: string;
  pillar: "Data Science" | "Machine Learning" | "Inteligencia Artificial";
  domain: string;
  colorVar: string;
  summary: string;
  inputsLabel: string;
  retrainCadence: string;
}

export interface PrecisionBucket {
  id: string;
  label: string;
  rangeLabel: string;
  promisedMeanP: number;
  actualHitRate: number;
  auditedPicksCount: number;
  closingBeatRate: number;
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
  marketDecimal: number;
  marketAmerican: number;
  edgePts: number;
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
  absences: LineupAbsenceItem[];
  moneyFlow: {
    homeShare: number;
    drawShare?: number;
    awayShare: number;
    sharpNote: string;
    volumeTier: "Alto" | "Medio" | "Moderado";
  };
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
  openDecimal: number;
  currentDecimal: number;
  edgePts: number;
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
}

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
  activeReferrals: number;
  monthlyCommissionMxn: number;
  weeklyPickOrigin: "spacetime" | "bitacora";
  weeklyPickSlug: string;
  weeklyPickGameId: string;
  weeklyPickThesis: string;
}

export interface SocialComment {
  id: string;
  authorHandle: string;
  authorName: string;
  verifiedBadge: string;
  createdAt: string;
  body: string;
}

export interface SocialPost {
  id: string;
  authorHandle: string;
  authorName: string;
  roleBadge: "Tipstar Oficial" | "Analista Verificado" | "Socio Pase Total";
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
