export type OutlookSport = "nhl" | "mlb" | "nba" | "nfl" | "ncaaf";

export type TeamSide = "home" | "away";

export interface SportOutlookDriver {
  readonly factor: string;
  readonly impactLogit: number;
  readonly impactUnits?: number;
  readonly label?: string;
}

export type SportLineKind =
  | "total"
  | "spread"
  | "first5_winner"
  | "first5_total";

export interface SportOutlookLine {
  readonly kind: SportLineKind;
  readonly line: number;
  readonly p: number;
  readonly pTie?: number;
  readonly pAway?: number;
}

export interface SportOutlookNflSpecials {
  readonly expectedMargin?: number;
  readonly pOvertime?: number;
  readonly fairOvertimeDecimal?: number;
  readonly pExactPlus3?: number;
  readonly pExactMinus3?: number;
  readonly pExactPlus7?: number;
  readonly pExactMinus7?: number;
}

export type ConfirmationKind =
  | "goalie"
  | "starting_pitcher"
  | "lineup"
  | "key_player";

export type ConfirmationStatus =
  | "confirmed"
  | "probable"
  | "pending"
  | "questionable"
  | "out";

export interface SportConfirmation {
  readonly kind: ConfirmationKind;
  readonly team: TeamSide;
  readonly status: ConfirmationStatus;
  readonly playerName?: string;
  readonly updatedAtUtc?: string;
}

export interface SportRestInfo {
  readonly restDays?: number;
  readonly backToBack?: boolean;
}

export interface SportOutlookInput {
  readonly sport: OutlookSport;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly pHome: number;
  readonly pAway: number;
  readonly pHomeReg?: number;
  readonly pOtReg?: number;
  readonly pAwayReg?: number;
  readonly expectedHome: number;
  readonly expectedAway: number;
  readonly expectedPace?: number;
  readonly nflSpecials?: SportOutlookNflSpecials;
  readonly drivers: readonly SportOutlookDriver[];
  readonly lines?: readonly SportOutlookLine[];
  readonly confirmations?: readonly SportConfirmation[];
  readonly rest?: Partial<Record<TeamSide, SportRestInfo>>;
  readonly generatedAtUtc: string;
}
