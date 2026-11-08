/**
 * Canonical Data Models for PitchLab NFL Sports Intelligence Platform
 * Reconstructed from LineMate API schemas and extended for PitchLab SuperApp.
 */

export interface CanonicalPlayer {
  playerId: string;          // Internal UUID (e.g. "b633d550-9ff2-4ae1-9528-4a65680e248d")
  externalIds: {
    sportradarPlayerId: string;    // e.g. "sr:player:1692915"
    sportradarGuid: string;        // e.g. "db1053d7-3343-43a3-9aab-8353f10f1221"
    sleeperId?: string | null;     // Fantasy sleeper ID e.g. "8155"
    optaId?: string | null;
    statsPerformId?: string | null;
    espnId?: string | null;
    pffId?: string | null;
  };
  firstName: string;
  lastName: string;
  fullName: string;
  position: 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF' | string;
  number: number;
  age: number | null;
  height: string | null;      // e.g. "5'11\""
  weight: number | null;      // in lbs
  teamCode: string;           // e.g. "NYJ"
  teamId: string;             // UUID
  injuryStatus?: {
    status: 'ACTIVE' | 'QUESTIONABLE' | 'DOUBTFUL' | 'OUT' | 'IR';
    description?: string;
    updatedAt?: string;
  };
}

export interface CanonicalTeam {
  teamId: string;             // UUID
  code: string;               // 3-letter e.g. "NYJ", "KC", "DAL"
  name: string;               // e.g. "Jets"
  city: string;               // e.g. "New York"
  fullName: string;           // e.g. "New York Jets"
  externalIds: {
    sportradarCompetitorId: string; // e.g. "sr:competitor:4427"
    sportradarGuid: string;
  };
  conference: 'AFC' | 'NFC';
  division: 'East' | 'North' | 'South' | 'West';
  colors: {
    primary: string;          // Hex e.g. "#125740"
    secondary: string;
  };
}

export interface CanonicalCumulativeStatsNFL {
  // Passing
  passingAttempts: number;
  passingCompletions: number;
  passingYards: number;
  passingTouchdowns: number;
  interceptions: number;
  sacks: number;
  sackedYards: number;
  passerRating: number;
  longestCompletion: number;
  yardsPerAttempt: number;
  yardsPerCompletion: number;
  threeHundredYardsPassing: number;
  redzonePassingAttempts: number;
  redzonePassingTouchdowns: number;
  redzoneCompletions: number;
  throwsOnTarget: number;

  // Rushing
  rushingAttempts: number;
  rushingYards: number;
  rushingTouchdowns: number;
  rushingYardsPerAttempt: number;
  longestRun: number;
  rushingFirstDowns: number;
  hundredYardsRushing: number;
  redzoneRushingAttempts: number;
  redzoneRushingTouchdowns: number;

  // Receiving
  targets: number;
  receptions: number;
  receivingYards: number;
  receivingTouchdowns: number;
  longestReception: number;
  receivingFirstDowns: number;
  receivingYardsPerTarget: number;
  receivingYardsPerReception: number;
  hundredYardsReceiving: number;
  redzoneTargets: number;
  redzoneReceptions: number;
  redzoneReceivingTouchdowns: number;
  drops: number;
  airYards: number;

  // Kicking
  pointsKicked: number;
  fieldGoalAttempts: number;
  fieldGoalsMade: number;
  extraPointAttempts: number;
  extraPointsMade: number;
  longestFieldGoal: number;

  // Quarter Splits
  passingYards1q: number;
  rushingYards1q: number;
  receivingYards1q: number;
  passingTouchdowns1q: number;
  rushingTouchdowns1q: number;
  receivingTouchdowns1q: number;

  passingYards2q: number;
  rushingYards2q: number;
  receivingYards2q: number;

  passingYards3q: number;
  rushingYards3q: number;
  receivingYards3q: number;

  passingYards4q: number;
  rushingYards4q: number;
  receivingYards4q: number;

  // Misc
  fumbles: number;
  fumblesLost: number;
}

export interface CanonicalGameLog {
  gameId: string;             // e.g. "20261108-DAL-IND"
  season: number;             // e.g. 2026
  week: number;               // 1-18, or playoff round
  gameType: 'REGULAR' | 'PLAYOFF' | 'PRESEASON';
  timestamp: string;          // ISO-8601
  home: boolean;
  teamCode: string;
  opponentCode: string;
  teamScore: number;
  opponentScore: number;
  result: 'W' | 'L' | 'T';
  cumulativeStats: CanonicalCumulativeStatsNFL;
  snapCount?: number;
  snapPercentage?: number;
}

export type PropMarketIdNFL =
  | 'PASSING_YARDS'
  | 'PASSING_TOUCHDOWNS'
  | 'PASSING_ATTEMPTS'
  | 'PASSING_COMPLETIONS'
  | 'PASSING_INTERCEPTIONS'
  | 'RUSHING_YARDS'
  | 'RUSHING_ATTEMPTS'
  | 'RUSHING_TOUCHDOWNS'
  | 'RECEIVING_YARDS'
  | 'RECEPTIONS'
  | 'RECEIVING_TOUCHDOWNS'
  | 'ANYTIME_TOUCHDOWN'
  | 'FIRST_TOUCHDOWN'
  | 'PASSING_PLUS_RUSHING_YARDS'
  | 'RUSHING_PLUS_RECEIVING_YARDS'
  | 'LONGEST_PASS'
  | 'LONGEST_RUSH'
  | 'LONGEST_RECEPTION'
  | 'FIELD_GOALS_MADE'
  | 'KICKING_POINTS'
  | 'PASSING_YARDS_1Q'
  | 'RUSHING_YARDS_1Q'
  | 'RECEIVING_YARDS_1Q';

export interface SportsbookPrice {
  american: number;           // e.g. -115, +140
  decimal: number;            // e.g. 1.87, 2.40
  impliedProbability: number; // e.g. 0.5348
  timestamp?: string;
}

export interface SportsbookMarketLine {
  line: number;               // e.g. 64.5
  overOdds?: SportsbookPrice;
  underOdds?: SportsbookPrice;
  isMainLine: boolean;
  operatorData?: {
    selectionId?: string;
    marketId?: string;
    outcomeId?: string;
    deepLink?: string;
  };
}

export interface CanonicalPlayerPropMarket {
  marketId: PropMarketIdNFL;
  level: 'player';
  playerId: string;
  gameId: string;
  books: {
    [bookmakerId: string]: {
      mainLine: SportsbookMarketLine;
      alternates?: SportsbookMarketLine[];
    };
  };
  consensus: {
    line: number;
    bestOver: { book: string; odds: SportsbookPrice };
    bestUnder: { book: string; odds: SportsbookPrice };
    averageLine: number;
  };
}

export interface CanonicalHitRecord {
  timeframe: 'LAST_5' | 'LAST_10' | 'LAST_20' | 'SEASON' | 'HEAD_TO_HEAD' | 'CUSTOM';
  sampleSize: number;         // Total eligible games evaluated
  hits: number;               // Games meeting condition (stat > line for OVER, stat < line for UNDER)
  misses: number;             // Games failing condition
  pushes: number;             // Games exactly equal to line
  hitRate: number;            // hits / sampleSize * 100
  missRate: number;           // (sampleSize - hits - pushes) / sampleSize * 100
  pushRate: number;           // pushes / sampleSize * 100
  average: number;            // Mean of stat across sample
  median?: number;            // PitchLab addition: Median
  stdDev?: number;            // PitchLab addition: Standard deviation
}

export interface CanonicalTrendSignal {
  type: 'RECENT_FORM' | 'HEAD_TO_HEAD' | 'HOME_SPLIT' | 'AWAY_SPLIT' | 'SPLITS' | 'INJURY_IMPACT' | 'OPPONENT_RANK' | 'WEATHER';
  description: string;        // e.g. "Hit in 16 of last 16 games"
  annotation: string;         // e.g. "100%" or "32nd"
  summary: boolean;
  hitRecord?: CanonicalHitRecord;
  injuryPlayerName?: string;
  opponentDefensiveRank?: number;
}
