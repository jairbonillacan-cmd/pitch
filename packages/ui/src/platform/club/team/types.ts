import type { LeagueId, PlatformSport } from "@pitchlab/contracts";
import type { TeamLeagueDirectoryItem } from "../../types";

export type { PlatformSport, TeamLeagueDirectoryItem };

export interface TeamStandingSummary {
  rank: number;
  totalTeams: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
}

export type TeamMetricTone = "neutral" | "positive" | "warning" | "brand";

export interface TeamModelMetric {
  id: string;
  label: string;
  value: string;
  detail?: string;
  tone?: TeamMetricTone;
}

export interface TeamSplitRecord {
  games: number;
  wins: number;
  draws: number;
  losses: number;
  scoredAvg: number | null;
  concededAvg: number | null;
}

export interface TeamRecentAverages {
  sampleGames: number;
  scoredAvg: number | null;
  concededAvg: number | null;
  marginAvg: number | null;
  cleanSheets: number | null;
  wins: number;
  draws: number;
  losses: number;
  homeRecord: TeamSplitRecord;
  awayRecord: TeamSplitRecord;
  /** Racha reciente del más antiguo al más reciente (`["P","G","E",...]`). */
  streak: Array<"G" | "E" | "P">;
}

export interface TeamInjuryItem {
  player: string;
  position: string | null;
  status: string;
  detail: string | null;
  reportedAt: string | null;
}

export interface TeamVenueInfo {
  name: string | null;
  elevationM: number | null;
  roofType: "open" | "retractable" | "dome" | "indoor_arena" | null;
}

export interface TeamMatchHistoryRow {
  id: string;
  /** Enlace a la ficha del partido solo si existe en el snapshot vigente. */
  gameHref: string | null;
  date: string;
  dateLabel: string;
  round: string | null;
  isHome: boolean;
  neutralSite: boolean;
  opponent: {
    slug: string;
    name: string;
    shortName: string;
    href: string | null;
  };
  teamScore: number;
  opponentScore: number;
  outcome: "G" | "E" | "P";
  resultNote: string | null;
}

export interface TeamUpcomingFixtureRow {
  id: string;
  gameHref: string;
  dateLabel: string;
  kickoffLocal: string;
  round: string | null;
  venue: string | null;
  isHome: boolean;
  neutralSite: boolean;
  opponent: {
    slug: string;
    name: string;
    shortName: string;
    href: string | null;
  };
  hasForecast: boolean;
  isRedacted: boolean;
  projectedTeamScore: number | null;
  projectedOpponentScore: number | null;
  winProbability: number | null;
  confidenceLabel: string | null;
}

export interface TeamPlayerPick {
  id: string;
  marketKey: string;
  marketLabel: string;
  selectionLabel: string;
  locked: boolean;
  line: number | null;
  projectionMean: number | null;
  projectionSd: number | null;
  p: number | null;
  fairDecimal: number | null;
  fairAmerican: number | null;
  rationale: string | null;
}

export interface TeamSquadPlayerStats {
  appearances: number;
  subIns: number;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  foulsCommitted: number;
  foulsSuffered: number;
  yellowCards: number;
  redCards: number;
  offsides: number;
  saves: number;
  shotsFaced: number;
  goalsConceded: number;
}

export interface TeamCoachInfo {
  name: string;
  shortName?: string | null;
  photoKey?: string | null;
  nationality?: string | null;
  nationalityCode?: string | null;
  birthDate?: string | null;
  preferredFormation?: string | null;
  styleLabel?: string | null;
  careerRecord?: {
    matches: number;
    wins: number;
    draws: number;
    losses: number;
    winPct?: number | null;
  } | null;
}

export interface TeamSquadPlayer {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  jersey: string | null;
  positionGroup: "GK" | "DEF" | "MID" | "FWD";
  positionLabel: string;
  age: number | null;
  birthDate?: string | null;
  heightCm: number | null;
  weightKg: number | null;
  preferredFoot?: "R" | "L" | "B" | null;
  nationality: string | null;
  nationalityCode: string | null;
  photoKey?: string | null;
  fallbackPhotoKey?: string | null;
  availability?: "available" | "injured" | "doubtful" | "suspended" | null;
  injuryDetail?: string | null;
  expectedReturn?: string | null;
  stats: TeamSquadPlayerStats;
  candidatePicks: TeamPlayerPick[];
}

export interface TeamSquadSummary {
  coachName: string | null;
  coach?: TeamCoachInfo | null;
  updatedAt: string;
  players: TeamSquadPlayer[];
}

export interface TeamProfileData {
  league: LeagueId;
  leagueLabel: string;
  sport: PlatformSport;
  seasonLabel: string;
  updatedAt: string;
  team: {
    id: string;
    slug: string;
    name: string;
    shortName: string;
    code: string;
  };
  standing: TeamStandingSummary | null;
  venue: TeamVenueInfo | null;
  injuries: TeamInjuryItem[];
  recentAverages: TeamRecentAverages;
  modelSection: {
    locked: boolean;
    engineLabel: string;
    sampleNote: string | null;
    updatedLabel: string | null;
    metrics: TeamModelMetric[];
    unavailableReason: string | null;
  };
  upcomingFixtures: TeamUpcomingFixtureRow[];
  recentMatches: TeamMatchHistoryRow[];
  squad?: TeamSquadSummary | null;
  relatedTeams: Array<{
    slug: string;
    name: string;
    shortName: string;
    rank: number | null;
    href: string;
  }>;
}

export interface PlayerProfileData {
  league: LeagueId;
  leagueLabel: string;
  sport: PlatformSport;
  seasonLabel: string;
  updatedAt: string;
  team: {
    id: string;
    slug: string;
    name: string;
    shortName: string;
    code: string;
  };
  coachName: string | null;
  coach?: TeamCoachInfo | null;
  player: TeamSquadPlayer;
  picksLocked: boolean;
  nextFixture: TeamUpcomingFixtureRow | null;
  teammates: Array<{
    slug: string;
    name: string;
    shortName: string;
    jersey: string | null;
    positionGroup: "GK" | "DEF" | "MID" | "FWD";
    photoKey?: string | null;
    fallbackPhotoKey?: string | null;
    href: string;
  }>;
}
