export const FILTER_KEYS = {
  OUTCOME: "outcome",
  MIN_ODDS: "minOdds",
  BET_TYPE: "betType",
  TIMEFRAME: "timeframe",
  GAMES: "game",
  SITUATION: "situation",
  SPLITS: "splits",
  TEAM: "team",
  PLAYER: "player",
  TRENDS: "trends",
  SIGNALS: "signals",
  LINE_TYPE: "lineType",
  WITH: "with",
  WITHOUT: "without",
  OPPONENT: "opponent",
  PARLAY_LEGS_COUNT: "parlayLegsCount",
  PARLAY_LEGS_TYPE: "parlayLegsType",
  STARTER: "starter",
  TREND_TYPE: "trendType"
};

export const FILTER_LABELS = {
  [FILTER_KEYS.OUTCOME]: "O/U",
  [FILTER_KEYS.MIN_ODDS]: "Min Odds",
  [FILTER_KEYS.BET_TYPE]: "Bet Type",
  [FILTER_KEYS.TIMEFRAME]: "Timeframe",
  [FILTER_KEYS.GAMES]: "Game",
  [FILTER_KEYS.SITUATION]: "Situation",
  [FILTER_KEYS.SPLITS]: "Splits",
  [FILTER_KEYS.TEAM]: "Team",
  [FILTER_KEYS.PLAYER]: "Player",
  [FILTER_KEYS.TRENDS]: "Trends",
  [FILTER_KEYS.SIGNALS]: "Signals",
  [FILTER_KEYS.LINE_TYPE]: "Line Type",
  [FILTER_KEYS.WITH]: "With",
  [FILTER_KEYS.WITHOUT]: "Without",
  [FILTER_KEYS.OPPONENT]: "Opponent",
  [FILTER_KEYS.PARLAY_LEGS_COUNT]: "Number Of Legs",
  [FILTER_KEYS.PARLAY_LEGS_TYPE]: "Parlay Type",
  [FILTER_KEYS.STARTER]: "Starter",
  // Internal use only at the time of writing but just to be safe
  [FILTER_KEYS.TREND_TYPE]: "Trend Type"
};

export const TREND_OPTION_KEYS = {
  ALL: "allTrends",
  RECENT_FORM: "recentForm",
  HEAD_TO_HEAD: "headToHead",
  HOME_AWAY_SPLIT: "homeAwaySplits",
  OPPONENT_RANK: "opponentRank",
  INJURY_IMPACT: "injuryImpact",
  STARTER: "starter",
};

export const SUPPORTED_SIGNALS = new Set(['RECENT_FORM', 'HEAD_TO_HEAD', 'SPLITS', 'HOME_SPLIT', 'AWAY_SPLIT', 'OPPONENT_RANK', 'INJURY_IMPACT', 'STARTER', 'WEATHER', 'VERSUS_STARTING_PITCHER', 'CTA'])

export const SIGNAL_OPTION_KEYS = {
  ALL: "allSignals",
  RECENT_FORM: "recentForm",
  HEAD_TO_HEAD: "headToHead",
  HOME_AWAY_SPLIT: "homeAwaySplits",
  OPPONENT_RANK: "opponentRank",
  INJURY_IMPACT: "injuryImpact",
  STARTER: "starter",
  WEATHER: "weather",
  STARTING_PITCHER: "startingPitcher",
};

export const PARLAY_OPTION_KEYS = {
  ANY_LEG_COUNT: "anyLegCount",
  TWO_LEGS: "twoLegs",
  THREE_LEGS: "threeLegs",
  ALL_LEG_TYPES: "allLegTypes",
};

export const TREND_OPTION_LABELS = {
  [TREND_OPTION_KEYS.ALL]: "All Trends",
  [TREND_OPTION_KEYS.RECENT_FORM]: "Recent Form",
  [TREND_OPTION_KEYS.HEAD_TO_HEAD]: "Head to Head",
  [TREND_OPTION_KEYS.HOME_AWAY_SPLIT]: "Home/Away Splits",
  [TREND_OPTION_KEYS.OPPONENT_RANK]: "Opponent Rank",
  [TREND_OPTION_KEYS.INJURY_IMPACT]: "Injury Impact",
  [TREND_OPTION_KEYS.STARTER]: "Starter",
};

export const SIGNAL_OPTION_LABELS = {
  [SIGNAL_OPTION_KEYS.ALL]: "All Signals",
  [SIGNAL_OPTION_KEYS.RECENT_FORM]: "Recent Form",
  [SIGNAL_OPTION_KEYS.HEAD_TO_HEAD]: "Head to Head",
  [SIGNAL_OPTION_KEYS.HOME_AWAY_SPLIT]: "Home/Away Splits",
  [SIGNAL_OPTION_KEYS.OPPONENT_RANK]: "Opponent Rank",
  [SIGNAL_OPTION_KEYS.INJURY_IMPACT]: "Injury Impact",
  [SIGNAL_OPTION_KEYS.STARTER]: "Starter",
  [SIGNAL_OPTION_KEYS.WEATHER]: "Weather",
  [SIGNAL_OPTION_KEYS.STARTING_PITCHER]: "Starting Pitcher",
};

export const PARLAY_OPTION_LABELS = {
  [PARLAY_OPTION_KEYS.ANY_LEG_COUNT]: "Any Number Of Legs",
  [PARLAY_OPTION_KEYS.TWO_LEGS]: "2 Legs",
  [PARLAY_OPTION_KEYS.THREE_LEGS]: "3 Legs",
  [PARLAY_OPTION_KEYS.ALL_LEG_TYPES]: "All Leg Types",
};

export const OUTCOME_OPTION_KEYS = {
  ALL: "all",
  OVER: "over",
  UNDER: "under",
};

export const OVER_UNDER_OPTION_LABELS = {
  [OUTCOME_OPTION_KEYS.ALL]: "Over+Under",
  [OUTCOME_OPTION_KEYS.OVER]: "Over",
  [OUTCOME_OPTION_KEYS.UNDER]: "Under",
};

export const LINE_TYPE_OPTION_KEYS = {
  MAIN: "main",
  ALTERNATE: "alternate",
};

export const LINE_TYPE_OPTION_LABELS = {
  [LINE_TYPE_OPTION_KEYS.MAIN]: "Main Lines",
  [LINE_TYPE_OPTION_KEYS.ALTERNATE]: "Alternate Lines",
};

export const STRAIGHT_TREND_TYPE_OPTION_KEYS = {
  PLAYER: "player",
  TEAM: "team",
};

export const STRAIGHT_TREND_TYPE_OPTION_LABELS = {
  [STRAIGHT_TREND_TYPE_OPTION_KEYS.PLAYER]: "player",
  [STRAIGHT_TREND_TYPE_OPTION_KEYS.TEAM]: "team",
};