import _ from 'lodash';
import { getDictionaryValueRawResult, swapDictionary } from './core-utils.js';

export const SCHEDULE_FORMAT_WEEKLY = "weekly";
export const SCHEDULE_FORMAT_DAILY = "daily";

const SOCCER_LEAGUE_IDS = [
  'fifa-world-cup',
  'brazil-serie-a',
  'mls',
  'bundesliga',
  'epl',
  'laliga',
  'ligue1',
  'seriea',
  'ucl',
  'uel',
  'eredivisie',
  'primera-lpf',
  'liga-portugal',
  'liga-mx',
];

const TOURNAMENT_SOCCER_LEAGUE_IDS = ['fifa-world-cup'];
const IN_YEAR_SOCCER_LEAGUE_IDS = ['brazil-serie-a', 'mls', 'primera-lpf', 'liga-mx'];
const CROSS_YEAR_SOCCER_LEAGUE_IDS = ['bundesliga', 'epl', 'laliga', 'ligue1', 'seriea', 'ucl', 'uel', 'eredivisie', 'liga-portugal'];

const SOCCER_ADVANCED_TOOLS = ['starting_lineups', 'injury_impact', 'opponent_rank'];
const SOCCER_LAYOUT = { weatherReport: 'default', lineupMode: 'shared' };
const SOCCER_DISPLAY = { teamDisplayName: 'name_only', teamCityDisplayName: 'name_only' };
const CITY_NAME_DISPLAY = { teamDisplayName: 'city_name', teamCityDisplayName: 'city_only' };
const NAME_ONLY_CITY_DISPLAY = { teamDisplayName: 'name_only', teamCityDisplayName: 'city_only' };

const INJURY_STARTER_SIGNAL_KEYS = ['injuryImpact', 'starter'];
const NFL_SIGNAL_KEYS = ['injuryImpact', 'weather'];
const NCAAF_SIGNAL_KEYS = ['injuryImpact'];
const NHL_SIGNAL_KEYS = ['injuryImpact'];
const MLB_SIGNAL_KEYS = ['weather', 'startingPitcher'];
const NO_EXTRA_SIGNAL_KEYS = [];

const SOCCER_RECORD_CONFIG = {
  standingsFields: ['wins', 'losses', 'draws'],
  gameRecordDrawField: 'draw',
  gameRecordDrawLabel: 'D',
  scoreStat: 'goals',
  graphKeys: ['W', 'L', 'D'],
};

const BASKETBALL_RECORD_CONFIG = {
  standingsFields: ['wins', 'losses'],
  gameRecordDrawField: null,
  gameRecordDrawLabel: null,
  scoreStat: 'points',
  graphKeys: ['W', 'L'],
};

const FOOTBALL_RECORD_CONFIG = {
  standingsFields: ['wins', 'losses'],
  gameRecordDrawField: null,
  gameRecordDrawLabel: null,
  scoreStat: 'points',
  graphKeys: ['W', 'L'],
};

const SOCCER_DISCOVERY_BET_BY_POSITION = [
  {title: 'Forwards', position: 'forward', icon: 'forward'},
  {title: 'Midfielders', position: 'midfielder', icon: 'midfielder'},
  {title: 'Defense', position: 'defender', icon: 'defense'}
];

const BASKETBALL_DISCOVERY_BET_BY_POSITION = [
  {title: 'Guards', position: 'PG,SG', icon: 'basketball-player-right'},
  {title: 'Forwards', position: 'PF,SF', icon: 'basketball-player-jump'},
  {title: 'Centers', position: 'C', icon: 'basketball-player-block'}
];

const FOOTBALL_DISCOVERY_BET_BY_POSITION = [
  {title: 'QB', position: 'QB', icon: 'quarterback'},
  {title: 'RB', position: 'RB', icon: 'running-back'},
  {title: 'WR', position: 'WR', icon: 'wide-receiver'},
  {title: 'TE', position: 'TE', icon: 'tight-end'},
  {title: 'K', position: 'K', icon: 'kicker'}
];

const NHL_DISCOVERY_BET_BY_POSITION = [
  {title: 'Centers', position: 'C', icon: 'hockey-player-right'},
  {title: 'Wingers', position: 'LW,RW', icon: 'hockey-player-winger'},
  {title: 'Defense', position: 'D', icon: 'hockey-player-left'},
  {title: 'Goalies', position: 'G', icon: 'hockey-goalie'}
];

const MLB_DISCOVERY_BET_BY_POSITION = [
  {title: 'Pitchers', position: 'PITCHERS', icon: 'pitcher'},
  {title: 'Hitters', position: 'HITTERS', icon: 'batter'}
];

const BASKETBALL_SUPPORTED_CROSS_GAME_PARLAYS = [
  {marketId: 'POINTS', type: 'player', color: 'orange', image: 'points'},
  {marketId: 'ASSISTS', type: 'player', color: 'tomato', image: 'assists'},
  {marketId: 'REBOUNDS', type: 'player', color: 'red', image: 'rebounds'},
  {marketId: 'THREE_POINTS_MADE', type: 'player', color: 'amber', image: '3ptm'},
  {marketId: 'TEAM_TOTAL', type: 'team', color: 'amber', image: 'team-total'},
  {marketId: 'SPREAD', type: 'team', color: 'red', image: 'spread'},
  {marketId: 'MONEY_LINE', type: 'team', color: 'green', image: 'moneyline'},
];

const SOCCER_SUPPORTED_CROSS_GAME_PARLAYS = [
  {marketId: 'GOALS', type: 'player', color: 'orange', image: 'goals'},
  {marketId: 'ASSISTS', type: 'player', color: 'tomato', image: 'assists'},
  {marketId: 'SHOTS_ON_TARGET', type: 'player', color: 'green', image: 'sot'},
  {marketId: 'SHOTS', type: 'player', color: 'amber', image: 'shots'},
  {marketId: 'TEAM_TOTAL', type: 'team', color: 'amber', image: 'team-total'},
  {marketId: 'SPREAD', type: 'team', color: 'red', image: 'spread'},
  {marketId: 'MONEY_LINE', type: 'team', color: 'green', image: 'moneyline'},
];

const FOOTBALL_SUPPORTED_CROSS_GAME_PARLAYS = [
  {marketId: 'ANYTIME_TOUCHDOWN', type: 'player', color: 'orange', image: 'td'},
  {marketId: 'PASSING_YARDS', type: 'player', color: 'tomato', image: 'pass-yds'},
  {marketId: 'PASSING_TOUCHDOWNS', type: 'player', color: 'red', image: 'pass-td'},
  {marketId: 'RECEIVING_YARDS', type: 'player', color: 'amber', image: 'rec-yds'},
  {marketId: 'RECEPTIONS', type: 'player', color: 'crimson', image: 'receptions'},
  {marketId: 'RUSHING_YARDS', type: 'player', color: 'green', image: 'rush-yds'},
  {marketId: 'TEAM_TOTAL', type: 'team', color: 'amber', image: 'team-total'},
  {marketId: 'SPREAD', type: 'team', color: 'red', image: 'spread'},
  {marketId: 'MONEY_LINE', type: 'team', color: 'green', image: 'moneyline'},
];

const MLB_SUPPORTED_CROSS_GAME_PARLAYS = [
  {marketId: 'HITTER_HITS', type: 'player', color: 'orange', image: 'hits'},
  {marketId: 'HITTER_RUNS', type: 'player', color: 'tomato', image: 'runs'},
  {marketId: 'HITTER_SINGLES', type: 'player', color: 'red', image: 'singles'},
  {marketId: 'HITTER_TOTAL_BASES', type: 'player', color: 'green', image: 'total-bases'},
  {marketId: 'PITCHER_STRIKEOUTS', type: 'player', color: 'amber', image: 'strikeouts'},
  {marketId: 'TEAM_TOTAL', type: 'team', color: 'amber', image: 'team-total'},
  {marketId: 'SPREAD', type: 'team', color: 'red', image: 'spread'},
  {marketId: 'MONEY_LINE', type: 'team', color: 'green', image: 'moneyline'},
];

const NHL_SUPPORTED_CROSS_GAME_PARLAYS = [
  {marketId: 'POINTS', type: 'player', color: 'orange', image: 'points'},
  {marketId: 'ANYTIME_GOAL_SCORER', type: 'player', color: 'tomato', image: 'goals'},
  {marketId: 'ASSISTS', type: 'player', color: 'teal', image: 'assists'},
  {marketId: 'SHOTS_ON_GOAL', type: 'player', color: 'amber', image: 'sog'},
  {marketId: 'SAVES', type: 'player', color: 'green', image: 'saves'},
  {marketId: 'TEAM_TOTAL', type: 'team', color: 'amber', image: 'team-total'},
  {marketId: 'SPREAD', type: 'team', color: 'red', image: 'spread'},
  {marketId: 'MONEY_LINE', type: 'team', color: 'green', image: 'moneyline'},
];

const AFL_SUPPORTED_CROSS_GAME_PARLAYS = [
  {marketId: 'SPREAD', type: 'team', color: 'red', image: 'spread'},
  {marketId: 'SPREAD_1Q', type: 'team', color: 'red', image: 'spread'},
  {marketId: 'SPREAD_1H', type: 'team', color: 'red', image: 'spread'},
  {marketId: 'MONEY_LINE', type: 'team', color: 'green', image: 'moneyline'},
  {marketId: 'MONEY_LINE_1Q', type: 'team', color: 'green', image: 'moneyline'},
  {marketId: 'MONEY_LINE_1H', type: 'team', color: 'green', image: 'moneyline'},
  {marketId: 'ANYTIME_GOAL_SCORER', type: 'player', color: 'green', image: 'goals'},
  {marketId: 'DISPOSALS', type: 'player', color: 'orange', image: 'disposals'},
  {marketId: 'MARKS', type: 'player', color: 'orange', image: 'marks'},
  {marketId: 'TACKLES', type: 'player', color: 'green', image: 'tackles'}
];

const NRL_SUPPORTED_CROSS_GAME_PARLAYS = [
  {marketId: 'TEAM_TOTAL', type: 'team', color: 'amber', image: 'team-total'},
  {marketId: 'TEAM_TOTAL_1H', type: 'team', color: 'amber', image: 'team-total'},
  {marketId: 'TEAM_TOTAL_2H', type: 'team', color: 'amber', image: 'team-total'},
  {marketId: 'SPREAD', type: 'team', color: 'red', image: 'spread'},
  {marketId: 'SPREAD_1H', type: 'team', color: 'red', image: 'spread'},
  {marketId: 'SPREAD_2H', type: 'team', color: 'red', image: 'spread'},
  {marketId: 'MONEY_LINE', type: 'team', color: 'green', image: 'moneyline'},
  {marketId: 'MONEY_LINE_1H', type: 'team', color: 'green', image: 'moneyline'},
  {marketId: 'MONEY_LINE_2H', type: 'team', color: 'green', image: 'moneyline'},
  {marketId: 'ANYTIME_TRY_SCORER', type: 'player', color: 'orange', image: 'tries'},
  {marketId: 'TRIES', type: 'player', color: 'orange', image: 'tries'}
];

const MLB_TEAMS = {
  logoCodeAliases: {},
  codeToCity: {
    ARI: "Arizona",
    ATH: "Athletics",
    ATL: "Atlanta",
    BAL: "Baltimore",
    BOS: "Boston",
    CHC: "Chicago C.",
    CIN: "Cincinnati",
    CLE: "Cleveland",
    COL: "Colorado",
    CWS: "Chicago W.",
    DET: "Detroit",
    HOU: "Houston",
    KC: "Kansas City",
    LAA: "Los Angeles A.",
    LAD: "Los Angeles D.",
    MIA: "Miami",
    MIL: "Milwaukee",
    MIN: "Minnesota",
    NYM: "New York M.",
    NYY: "New York Y.",
    PHI: "Philadelphia",
    PIT: "Pittsburgh",
    SD: "San Diego",
    SEA: "Seattle",
    SF: "San Francisco",
    STL: "St. Louis",
    TB: "Tampa Bay",
    TEX: "Texas",
    TOR: "Toronto",
    WSH: "Washington"
  },
  cityToCode: {
    Arizona: "ARI",
    Athletics: "ATH",
    Atlanta: "ATL",
    Baltimore: "BAL",
    Boston: "BOS",
    "Chicago C.": "CHC",
    Cincinnati: "CIN",
    Cleveland: "CLE",
    Colorado: "COL",
    "Chicago W.": "CWS",
    Detroit: "DET",
    Houston: "HOU",
    "Kansas City": "KC",
    "Los Angeles A.": "LAA",
    "Los Angeles D.": "LAD",
    Miami: "MIA",
    Milwaukee: "MIL",
    Minnesota: "MIN",
    "New York M.": "NYM",
    "New York Y.": "NYY",
    Philadelphia: "PHI",
    Pittsburgh: "PIT",
    "San Diego": "SD",
    Seattle: "SEA",
    "San Francisco": "SF",
    "St. Louis": "STL",
    "Tampa Bay": "TB",
    Texas: "TEX",
    Toronto: "TOR",
    Washington: "WSH"
  },
  codeToName: {
    ARI: "Diamondbacks",
    ATH: "Athletics",
    ATL: "Braves",
    BAL: "Orioles",
    BOS: "Red Sox",
    CHC: "Cubs",
    CIN: "Reds",
    CLE: "Guardians",
    COL: "Rockies",
    CWS: "White Sox",
    DET: "Tigers",
    HOU: "Astros",
    KC: "Royals",
    LAA: "Angels",
    LAD: "Dodgers",
    MIA: "Marlins",
    MIL: "Brewers",
    MIN: "Twins",
    NYM: "Mets",
    NYY: "Yankees",
    PHI: "Phillies",
    PIT: "Pirates",
    SD: "Padres",
    SEA: "Mariners",
    SF: "Giants",
    STL: "Cardinals",
    TB: "Rays",
    TEX: "Rangers",
    TOR: "Blue Jays",
    WSH: "Nationals"
  },
  colors: {
    light: {
      ari: "rgba(167,25,48,1)",
      ath: "rgba(0,56,49,1)",
      atl: "rgba(206,17,65,1)",
      bal: "rgba(223,70,1,1)",
      bos: "rgba(189,48,57,1)",
      chc: "rgba(14,51,134,1)",
      cin: "rgba(198,1,31,1)",
      cle: "rgba(6,32,63,1)",
      col: "rgba(51,0,111,1)",
      cws: "rgba(39,37,31,1)",
      det: "rgba(12,35,64,1)",
      hou: "rgba(0,45,98,1)",
      kc: "rgba(0,70,135,1)",
      laa: "rgba(0,50,99,1)",
      lad: "rgba(0,90,156,1)",
      mia: "rgba(0,163,224,1)",
      mil: "rgba(18,40,75,1)",
      min: "rgba(0,43,92,1)",
      nym: "rgba(0,45,114,1)",
      nyy: "rgba(12,35,64,1)",
      oak: "rgba(0,56,49,1)",
      phi: "rgba(232,24,40,1)",
      pit: "rgba(39,37,31,1)",
      sd: "rgba(47,36,29,1)",
      sea: "rgba(12,44,86,1)",
      sf: "rgba(253,90,30,1)",
      stl: "rgba(196,30,58,1)",
      tb: "rgba(9,44,92,1)",
      tex: "rgba(0,50,120,1)",
      tor: "rgba(19,74,142,1)",
      wsh: "rgba(171,0,3,1)"
    },
    dark: {
      ari: "rgba(229,57,77,1)",
      ath: "rgba(23,144,140,1)",
      atl: "rgba(229,57,91,1)",
      bal: "rgba(237,78,6,1)",
      bos: "rgba(221,63,71,1)",
      chc: "rgba(111,130,192,1)",
      cin: "rgba(229,32,44,1)",
      cle: "rgba(102,124,154,1)",
      col: "rgba(165,89,178,1)",
      cws: "rgba(125,122,115,1)",
      det: "rgba(105,128,155,1)",
      hou: "rgba(111,139,182,1)",
      kc: "rgba(36,132,201,1)",
      laa: "rgba(102,126,163,1)",
      lad: "rgba(4,123,190,1)",
      mia: "rgba(45,177,228,1)",
      mil: "rgba(111,132,164,1)",
      min: "rgba(109,136,177,1)",
      nym: "rgba(114,140,194,1)",
      nyy: "rgba(105,128,155,1)",
      oak: "rgba(23,144,140,1)",
      phi: "rgba(247,39,41,1)",
      pit: "rgba(125,122,115,1)",
      sd: "rgba(144,133,124,1)",
      sea: "rgba(111,137,173,1)",
      sf: "rgba(253,114,65,1)",
      stl: "rgba(227,47,72,1)",
      tb: "rgba(111,136,177,1)",
      tex: "rgba(106,128,180,1)",
      tor: "rgba(39,120,191,1)",
      wsh: "rgba(230,53,29,1)"
    },
  },
};
const NBA_TEAMS = {
  logoCodeAliases: {},
  codeToCity: {
    ATL: "Atlanta",
    BOS: "Boston",
    BRO: "Brooklyn",
    CHA: "Charlotte",
    CHI: "Chicago",
    CLE: "Cleveland",
    DAL: "Dallas",
    DEN: "Denver",
    DET: "Detroit",
    GSW: "Golden State",
    HOU: "Houston",
    IND: "Indiana",
    LAC: "Los Angeles C.",
    LAL: "Los Angeles L.",
    MEM: "Memphis",
    MIA: "Miami",
    MIL: "Milwaukee",
    MIN: "Minnesota",
    NOP: "New Orleans",
    NYK: "New York",
    OKL: "Oklahoma City",
    ORL: "Orlando",
    PHI: "Philadelphia",
    PHX: "Phoenix",
    POR: "Portland",
    SAC: "Sacramento",
    SAS: "San Antonio",
    TOR: "Toronto",
    UTA: "Utah",
    WAS: "Washington"
  },
  cityToCode: {
    Atlanta: "ATL",
    Boston: "BOS",
    Brooklyn: "BRO",
    Charlotte: "CHA",
    Chicago: "CHI",
    Cleveland: "CLE",
    Dallas: "DAL",
    Denver: "DEN",
    Detroit: "DET",
    "Golden State": "GSW",
    Houston: "HOU",
    Indiana: "IND",
    "Los Angeles C.": "LAC",
    "Los Angeles L.": "LAL",
    Memphis: "MEM",
    Miami: "MIA",
    Milwaukee: "MIL",
    Minnesota: "MIN",
    "New Orleans": "NOP",
    "New York": "NYK",
    "Oklahoma City": "OKL",
    Orlando: "ORL",
    Philadelphia: "PHI",
    Phoenix: "PHX",
    Portland: "POR",
    Sacramento: "SAC",
    "San Antonio": "SAS",
    Toronto: "TOR",
    Utah: "UTA",
    Washington: "WAS"
  },
  codeToName: {
    ATL: "Hawks",
    BOS: "Celtics",
    BRO: "Nets",
    CHA: "Hornets",
    CHI: "Bulls",
    CLE: "Cavaliers",
    DAL: "Mavericks",
    DEN: "Nuggets",
    DET: "Pistons",
    GSW: "Warriors",
    HOU: "Rockets",
    IND: "Pacers",
    LAC: "Clippers",
    LAL: "Lakers",
    MEM: "Grizzlies",
    MIA: "Heat",
    MIL: "Bucks",
    MIN: "Timberwolves",
    NOP: "Pelicans",
    NYK: "Knicks",
    OKL: "Thunder",
    ORL: "Magic",
    PHI: "76ers",
    PHX: "Suns",
    POR: "Trail Blazers",
    SAC: "Kings",
    SAS: "Spurs",
    TOR: "Raptors",
    UTA: "Jazz",
    WAS: "Wizards"
  },
  colors: {
    light: {
      atl: "rgba(224,58,62,1)",
      bos: "rgba(0,122,51,1)",
      bro: "rgba(0,0,0,1)",
      cha: "rgba(29,17,96,1)",
      chi: "rgba(206,17,65,1)",
      cle: "rgba(134,0,56,1)",
      dal: "rgba(0,83,188,1)",
      den: "rgba(14,34,64,1)",
      det: "rgba(200,16,46,1)",
      gsw: "rgba(29,66,138,1)",
      hou: "rgba(206,17,65,1)",
      ind: "rgba(0,45,98,1)",
      lac: "rgba(19,23,63,1)",
      lal: "rgba(85,37,131,1)",
      mem: "rgba(93,118,169,1)",
      mia: "rgba(152,0,46,1)",
      mil: "rgba(0,71,27,1)",
      min: "rgba(12,35,64,1)",
      nop: "rgba(12,35,64,1)",
      nyk: "rgba(245,132,38,1)",
      okl: "rgba(0,122,193,1)",
      orl: "rgba(0,80,181,1)",
      phi: "rgba(0,107,182,1)",
      phx: "rgba(29,17,96,1)",
      por: "rgba(224,58,62,1)",
      sac: "rgba(90,45,129,1)",
      sas: "rgba(196,206,212,1)",
      tor: "rgba(206,17,65,1)",
      uta: "rgba(0,43,92,1)",
      was: "rgba(0,43,92,1)"
    },
    dark: {
      atl: "rgba(239,67,62,1)",
      bos: "rgba(29,157,73,1)",
      bro: "rgba(123,123,123,1)",
      cha: "rgba(116,118,180,1)",
      chi: "rgba(229,57,91,1)",
      cle: "rgba(230,63,90,1)",
      dal: "rgba(0,130,237,1)",
      den: "rgba(106,126,155,1)",
      det: "rgba(231,39,61,1)",
      gsw: "rgba(53,128,206,1)",
      hou: "rgba(229,57,91,1)",
      ind: "rgba(111,139,182,1)",
      lac: "rgba(102,104,130,1)",
      lal: "rgba(176,86,184,1)",
      mem: "rgba(122,143,184,1)",
      mia: "rgba(215,55,75,1)",
      mil: "rgba(31,135,65,1)",
      min: "rgba(105,128,155,1)",
      nop: "rgba(105,128,155,1)",
      nyk: "rgba(250,171,51,1)",
      okl: "rgba(0,139,213,1)",
      orl: "rgba(25,98,188,1)",
      phi: "rgba(11,123,200,1)",
      phx: "rgba(116,118,180,1)",
      por: "rgba(239,67,62,1)",
      sac: "rgba(169,111,185,1)",
      sas: "rgba(231,235,239,1)",
      tor: "rgba(229,57,91,1)",
      uta: "rgba(109,136,177,1)",
      was: "rgba(109,136,177,1)"
    },
  },
};
const WNBA_TEAMS = {
  logoCodeAliases: {
    con: "con1"
  },
  codeToCity: {
    ATL: "Atlanta",
    CHI: "Chicago",
    CON: "Connecticut",
    DAL: "Dallas",
    GSV: "Golden State",
    IND: "Indiana",
    LVA: "Las Vegas",
    LAS: "Los Angeles",
    MIN: "Minnesota",
    NYL: "New York",
    PHO: "Phoenix",
    SEA: "Seattle",
    WAS: "Washington",
    TOR: "Toronto",
    PDX: "Portland"
  },
  cityToCode: {
    Atlanta: "ATL",
    Chicago: "CHI",
    Connecticut: "CON",
    Dallas: "DAL",
    "Golden State": "GSV",
    Indiana: "IND",
    "Las Vegas": "LVA",
    "Los Angeles": "LAS",
    Minnesota: "MIN",
    "New York": "NYL",
    Phoenix: "PHO",
    Seattle: "SEA",
    Washington: "WAS",
    Toronto: "TOR",
    Portland: "PDX"
  },
  codeToName: {
    ATL: "Dream",
    CHI: "Sky",
    CON: "Sun",
    DAL: "Wings",
    GSV: "Valkyries",
    IND: "Fever",
    LAS: "Sparks",
    LVA: "Aces",
    MIN: "Lynx",
    NYL: "Liberty",
    PHO: "Mercury",
    SEA: "Storm",
    WAS: "Mystics",
    TOR: "Tempo",
    PDX: "Fire"
  },
  colors: {
    light: {
      atl: "rgba(227,23,60,1)",
      chi: "rgba(65,143,223,1)",
      con: "rgba(10,34,64,1)",
      dal: "rgba(13,34,64,1)",
      ind: "rgba(0,45,97,1)",
      las: "rgba(85,37,131,1)",
      lva: "rgba(0,0,0,1)",
      min: "rgba(12,35,64,1)",
      nyl: "rgba(80,123,113,1)",
      pho: "rgba(229,96,32,1)",
      sea: "rgba(44,82,53,1)",
      was: "rgba(225,58,62,1)",
      gsv: "rgba(0,0,0,1)",
      tor: "rgba(68,30,54,1)",
      pdx: "rgba(200,16,46,1)"
    },
    dark: {
      atl: "rgba(65,143,223,1)",
      chi: "rgba(230,46,80,1)",
      con: "rgba(108,122,140,1)",
      dal: "rgba(110,122,140,1)",
      ind: "rgba(102,129,160,1)",
      las: "rgba(136,102,168,1)",
      lva: "rgba(123,123,123,1)",
      min: "rgba(109,123,140,1)",
      nyl: "rgba(134,205,188,1)",
      pho: "rgba(229,96,32,1)",
      sea: "rgba(97,125,104,1)",
      was: "rgba(225,58,62,1)",
      gsv: "rgba(184,150,212,1)",
      tor: "rgba(200,16,46,1)",
      pdx: "rgba(200,16,46,1)"
    },
  },
};
const NCAAB_TEAMS = {
  logoCodeAliases: {},
  codeToCity: {
    UALR: "Little Rock",
    LINW: "Lindenwood",
    EIU: "Eastern Illinois",
    SEMO: "Southeast Missouri State",
    TNST: "Tennessee State",
    USI: "Southern Indiana",
    UTM: "Tennessee-Martin",
    MORE: "Morehead State",
    SIUE: "SIU Edwardsville",
    WIU: "Western Illinois",
    TNTC: "Tennessee Tech",
    INST: "Indiana State",
    UNI: "Northern Iowa",
    ILST: "Illinois State",
    MURR: "Murray State",
    SIU: "Southern Illinois",
    BEL: "Belmont",
    DRKE: "Drake",
    BRAD: "Bradley",
    MOSU: "Missouri State",
    EVAN: "Evansville",
    VALP: "Valparaiso",
    UIC: "UIC",
    UCF: "UCF",
    UTAH: "Utah",
    ISU: "Iowa State",
    HOU: "Houston",
    OKST: "Oklahoma State",
    ARIZ: "Arizona",
    COLO: "Colorado",
    CIN: "Cincinnati",
    ASU: "Arizona State",
    BYU: "BYU",
    KSU: "Kansas State",
    BAY: "Baylor",
    WVU: "West Virginia",
    TCU: "TCU",
    TTU: "Texas Tech",
    KU: "Kansas",
    USA: "South Alabama",
    ULM: "Louisiana-Monroe",
    TXST: "Texas State",
    CCAR: "Coastal Carolina",
    JMU: "James Madison",
    MRSH: "Marshall",
    USM: "Southern Miss",
    TROY: "Troy",
    ULL: "Louisiana",
    GASO: "Georgia Southern",
    APP: "Appalachian State",
    GAST: "Georgia State",
    ARST: "Arkansas State",
    ODU: "Old Dominion",
    NAU: "Northern Arizona",
    SAC: "Sacramento State",
    WEB: "Weber State",
    EWU: "Eastern Washington",
    IDST: "Idaho State",
    PRST: "Portland State",
    UNCO: "Northern Colorado",
    MTST: "Montana State",
    MONT: "Montana",
    IDHO: "Idaho",
    UNT: "North Texas",
    MEM: "Memphis",
    TLSA: "Tulsa",
    TULN: "Tulane",
    USF: "South Florida",
    UAB: "UAB",
    TEM: "Temple",
    CHAR: "Charlotte",
    UTSA: "UTSA",
    ECU: "East Carolina",
    RICE: "Rice",
    FAU: "Florida Atlantic",
    WICH: "Wichita State",
    VMI: "VMI",
    CIT: "The Citadel",
    CHAT: "Chattanooga",
    UNCG: "UNC Greensboro",
    WCU: "Western Carolina",
    WOF: "Wofford",
    MER: "Mercer",
    SAM: "Samford",
    FUR: "Furman",
    ETSU: "East Tennessee State",
    ORU: "Oral Roberts",
    NEOM: "Omaha",
    SDST: "South Dakota State",
    DEN: "Denver",
    UMKC: "Kansas City",
    NDSU: "North Dakota State",
    UST: "St. Thomas",
    SDAK: "South Dakota",
    UND: "North Dakota",
    LBSU: "Long Beach State",
    CSB: "Cal State Bakersfield",
    UCI: "UC Irvine",
    UCSB: "UC Santa Barbara",
    CP: "Cal Poly",
    UCSD: "UC San Diego",
    UCRV: "UC Riverside",
    UCD: "UC Davis",
    CSF: "Cal State Fullerton",
    CSN: "Cal State Northridge",
    HAW: "Hawai'i",
    UTEP: "UTEP",
    JVST: "Jacksonville State",
    KENN: "Kennesaw State",
    MTU: "Middle Tennessee",
    NMSU: "New Mexico State",
    LIB: "Liberty",
    SHSU: "Sam Houston",
    WKU: "Western Kentucky",
    LT: "Louisiana Tech",
    FIU: "Florida International",
    UVU: "Utah Valley",
    UTA: "UT Arlington",
    SEA: "Seattle",
    TARL: "Tarleton State",
    CBU: "California Baptist",
    AC: "Abilene Christian",
    SUU: "Southern Utah",
    UTU: "Utah Tech",
    GC: "Grand Canyon",
    SELA: "Southeastern Louisiana",
    SFA: "Stephen F. Austin",
    NWST: "Northwestern State",
    IW: "Incarnate Word",
    UTRGV: "UT Rio Grande Valley",
    HCU: "Houston Christian",
    NICH: "Nicholls State",
    MCNS: "McNeese",
    UNO: "New Orleans",
    LAM: "Lamar",
    TAMC: "Texas A&M-Commerce",
    AMCC: "Texas A&M-Corpus Christi",
    COOK: "Bethune-Cookman",
    ARPB: "Arkansas-Pine Bluff",
    ALCN: "Alcorn State",
    ALST: "Alabama State",
    MVSU: "Mississippi Valley State",
    GRAM: "Grambling State",
    PV: "Prairie View A&M",
    AAMU: "Alabama A&M",
    SOU: "Southern University",
    JKST: "Jackson State",
    FAMU: "Florida A&M",
    TXSO: "Texas Southern",
    HOW: "Howard",
    MORG: "Morgan State",
    COPP: "Coppin State",
    SCST: "South Carolina State",
    NORF: "Norfolk State",
    UMES: "Maryland-Eastern Shore",
    NCCU: "North Carolina Central",
    DSU: "Delaware State",
    GT: "Georgia Tech",
    PITT: "Pittsburgh",
    VT: "Virginia Tech",
    SMU: "SMU",
    BC: "Boston College",
    WAKE: "Wake Forest",
    NCST: "North Carolina State",
    UVA: "Virginia",
    STAN: "Stanford",
    MIA: "Miami (FL)",
    ND: "Notre Dame",
    SYR: "Syracuse",
    CAL: "California",
    LOU: "Louisville",
    FSU: "Florida State",
    CLEM: "Clemson",
    UNC: "North Carolina",
    DUKE: "Duke",
    UNF: "North Florida",
    STET: "Stetson",
    BELL: "Bellarmine",
    FGCU: "Florida Gulf Coast",
    UNA: "North Alabama",
    PEAY: "Austin Peay",
    LIP: "Lipscomb",
    QUC: "Queens University",
    UWGA: "West Georgia",
    CARK: "Central Arkansas",
    EKY: "Eastern Kentucky",
    JAC: "Jacksonville",
    "L-MD": "Loyola Maryland",
    AMER: "American",
    HC: "Holy Cross",
    NAVY: "Navy",
    LEH: "Lehigh",
    LAF: "Lafayette",
    ARMY: "Army",
    COLG: "Colgate",
    BUCK: "Bucknell",
    BU: "Boston University",
    SCUS: "USC Upstate",
    LONG: "Longwood",
    WEBB: "Gardner-Webb",
    HP: "High Point",
    CHSO: "Charleston Southern",
    UNCA: "UNC Asheville",
    PRE: "Presbyterian",
    WIN: "Winthrop",
    RAD: "Radford",
    DET: "Detroit Mercy",
    PFW: "Purdue Fort Wayne",
    MILW: "Milwaukee",
    GB: "Green Bay",
    RMU: "Robert Morris",
    IUPU: "IU Indy",
    WRST: "Wright State",
    NKU: "Northern Kentucky",
    OAK: "Oakland",
    YSU: "Youngstown State",
    CLEV: "Cleveland State",
    CSU: "Colorado State",
    UNM: "New Mexico",
    SJSU: "San Jose State",
    NEV: "Nevada",
    UNLV: "UNLV",
    USU: "Utah State",
    WYO: "Wyoming",
    AFA: "Air Force",
    BSU: "Boise State",
    FRES: "Fresno State",
    SDSU: "San Diego State",
    AUB: "Auburn",
    SCAR: "South Carolina",
    UK: "Kentucky",
    UGA: "Georgia",
    TEX: "Texas",
    LSU: "LSU",
    VAN: "Vanderbilt",
    MIZZ: "Missouri",
    FLA: "Florida",
    MSST: "Mississippi State",
    OKLA: "Oklahoma",
    TENN: "Tennessee",
    ALA: "Alabama",
    ARK: "Arkansas",
    MISS: "Ole Miss",
    TXAM: "Texas A&M",
    "M-OH": "Miami (OH)",
    EMU: "Eastern Michigan",
    BALL: "Ball State",
    OHIO: "Ohio",
    TOL: "Toledo",
    KENT: "Kent State",
    NIU: "Northern Illinois",
    CMU: "Central Michigan",
    AKR: "Akron",
    BGSU: "Bowling Green",
    BUFF: "Buffalo",
    WMU: "Western Michigan",
    PUR: "Purdue",
    ILL: "Illinois",
    ORE: "Oregon",
    MD: "Maryland",
    USC: "USC",
    PSU: "Penn State",
    NW: "Northwestern",
    OSU: "Ohio State",
    MSU: "Michigan State",
    RUTG: "Rutgers",
    MICH: "Michigan",
    IOWA: "Iowa",
    IND: "Indiana",
    WIS: "Wisconsin",
    WASH: "Washington",
    UCLA: "UCLA",
    NEB: "Nebraska",
    MINN: "Minnesota",
    ME: "Maine",
    UVM: "Vermont",
    ALBY: "Albany",
    UMBC: "UMBC",
    MASSL: "UMass Lowell",
    NJIT: "NJIT",
    BRY: "Bryant",
    UNH: "New Hampshire",
    BING: "Binghamton",
    CHS: "Chicago State",
    WAG: "Wagner",
    STNH: "Stonehill",
    SFPA: "St. Francis (PA)",
    LMC: "Le Moyne",
    CCSU: "Central Connecticut State",
    LIU: "LIU",
    FDU: "FDU",
    MHU: "Mercyhurst",
    BRWN: "Brown",
    HARV: "Harvard",
    COR: "Cornell",
    YALE: "Yale",
    CLMB: "Columbia",
    DART: "Dartmouth",
    PENN: "Penn",
    PRIN: "Princeton",
    DEL: "Delaware",
    HAMP: "Hampton",
    STON: "Stony Brook",
    HOF: "Hofstra",
    MONM: "Monmouth",
    NCAT: "North Carolina A&T",
    CAMP: "Campbell",
    TOWS: "Towson",
    COFC: "Charleston",
    ELON: "Elon",
    NE: "Northeastern",
    WM: "William & Mary",
    UNCW: "UNC Wilmington",
    DREX: "Drexel",
    PEPP: "Pepperdine",
    PORT: "Portland",
    SCU: "Santa Clara",
    WSU: "Washington State",
    GONZ: "Gonzaga",
    LMU: "Loyola Marymount",
    ORST: "Oregon State",
    USD: "San Diego",
    SMC: "Saint Mary's",
    PAC: "Pacific",
    SF: "San Francisco",
    MARQ: "Marquette",
    XAV: "Xavier",
    VILL: "Villanova",
    PROV: "Providence",
    CREI: "Creighton",
    GTWN: "Georgetown",
    HALL: "Seton Hall",
    BUT: "Butler",
    SJU: "St. John's",
    DEP: "DePaul",
    CONN: "UConn",
    SLU: "Saint Louis",
    SBON: "St. Bonaventure",
    DAV: "Davidson",
    "L-IL": "Loyola Chicago",
    DAY: "Dayton",
    FOR: "Fordham",
    URI: "Rhode Island",
    MASS: "UMass",
    RICH: "Richmond",
    LAS: "La Salle",
    VCU: "VCU",
    GW: "George Washington",
    GMU: "George Mason",
    JOES: "Saint Joseph's",
    DUQ: "Duquesne",
    CAN: "Canisius",
    RID: "Rider",
    MRST: "Marist",
    MRMK: "Merrimack",
    IONA: "Iona",
    SHU: "Sacred Heart",
    MSM: "Mount St. Mary's",
    QUIN: "Quinnipiac",
    MAN: "Manhattan",
    FAIR: "Fairfield",
    SIE: "Siena",
    SPC: "Saint Peter's",
    NIAG: "Niagara"
  },
  cityToCode: {
    "Little Rock": "UALR",
    Lindenwood: "LINW",
    "Eastern Illinois": "EIU",
    "Southeast Missouri State": "SEMO",
    "Tennessee State": "TNST",
    "Southern Indiana": "USI",
    "Tennessee-Martin": "UTM",
    "Morehead State": "MORE",
    "SIU Edwardsville": "SIUE",
    "Western Illinois": "WIU",
    "Tennessee Tech": "TNTC",
    "Indiana State": "INST",
    "Northern Iowa": "UNI",
    "Illinois State": "ILST",
    "Murray State": "MURR",
    "Southern Illinois": "SIU",
    Belmont: "BEL",
    Drake: "DRKE",
    Bradley: "BRAD",
    "Missouri State": "MOSU",
    Evansville: "EVAN",
    Valparaiso: "VALP",
    UIC: "UIC",
    UCF: "UCF",
    Utah: "UTAH",
    "Iowa State": "ISU",
    Houston: "HOU",
    "Oklahoma State": "OKST",
    Arizona: "ARIZ",
    Colorado: "COLO",
    Cincinnati: "CIN",
    "Arizona State": "ASU",
    BYU: "BYU",
    "Kansas State": "KSU",
    Baylor: "BAY",
    "West Virginia": "WVU",
    TCU: "TCU",
    "Texas Tech": "TTU",
    Kansas: "KU",
    "South Alabama": "USA",
    "Louisiana-Monroe": "ULM",
    "Texas State": "TXST",
    "Coastal Carolina": "CCAR",
    "James Madison": "JMU",
    Marshall: "MRSH",
    "Southern Miss": "USM",
    Troy: "TROY",
    Louisiana: "ULL",
    "Georgia Southern": "GASO",
    "Appalachian State": "APP",
    "Georgia State": "GAST",
    "Arkansas State": "ARST",
    "Old Dominion": "ODU",
    "Northern Arizona": "NAU",
    "Sacramento State": "SAC",
    "Weber State": "WEB",
    "Eastern Washington": "EWU",
    "Idaho State": "IDST",
    "Portland State": "PRST",
    "Northern Colorado": "UNCO",
    "Montana State": "MTST",
    Montana: "MONT",
    Idaho: "IDHO",
    "North Texas": "UNT",
    Memphis: "MEM",
    Tulsa: "TLSA",
    Tulane: "TULN",
    "South Florida": "USF",
    UAB: "UAB",
    Temple: "TEM",
    Charlotte: "CHAR",
    UTSA: "UTSA",
    "East Carolina": "ECU",
    Rice: "RICE",
    "Florida Atlantic": "FAU",
    "Wichita State": "WICH",
    VMI: "VMI",
    "The Citadel": "CIT",
    Chattanooga: "CHAT",
    "UNC Greensboro": "UNCG",
    "Western Carolina": "WCU",
    Wofford: "WOF",
    Mercer: "MER",
    Samford: "SAM",
    Furman: "FUR",
    "East Tennessee State": "ETSU",
    "Oral Roberts": "ORU",
    Omaha: "NEOM",
    "South Dakota State": "SDST",
    Denver: "DEN",
    "Kansas City": "UMKC",
    "North Dakota State": "NDSU",
    "St. Thomas": "UST",
    "South Dakota": "SDAK",
    "North Dakota": "UND",
    "Long Beach State": "LBSU",
    "Cal State Bakersfield": "CSB",
    "UC Irvine": "UCI",
    "UC Santa Barbara": "UCSB",
    "Cal Poly": "CP",
    "UC San Diego": "UCSD",
    "UC Riverside": "UCRV",
    "UC Davis": "UCD",
    "Cal State Fullerton": "CSF",
    "Cal State Northridge": "CSN",
    "Hawai'i": "HAW",
    UTEP: "UTEP",
    "Jacksonville State": "JVST",
    "Kennesaw State": "KENN",
    "Middle Tennessee": "MTU",
    "New Mexico State": "NMSU",
    Liberty: "LIB",
    "Sam Houston": "SHSU",
    "Western Kentucky": "WKU",
    "Louisiana Tech": "LT",
    "Florida International": "FIU",
    "Utah Valley": "UVU",
    "UT Arlington": "UTA",
    Seattle: "SEA",
    "Tarleton State": "TARL",
    "California Baptist": "CBU",
    "Abilene Christian": "AC",
    "Southern Utah": "SUU",
    "Utah Tech": "UTU",
    "Grand Canyon": "GC",
    "Southeastern Louisiana": "SELA",
    "Stephen F. Austin": "SFA",
    "Northwestern State": "NWST",
    "Incarnate Word": "IW",
    "UT Rio Grande Valley": "UTRGV",
    "Houston Christian": "HCU",
    "Nicholls State": "NICH",
    McNeese: "MCNS",
    "New Orleans": "UNO",
    Lamar: "LAM",
    "Texas A&M-Commerce": "TAMC",
    "Texas A&M-Corpus Christi": "AMCC",
    "Bethune-Cookman": "COOK",
    "Arkansas-Pine Bluff": "ARPB",
    "Alcorn State": "ALCN",
    "Alabama State": "ALST",
    "Mississippi Valley State": "MVSU",
    "Grambling State": "GRAM",
    "Prairie View A&M": "PV",
    "Alabama A&M": "AAMU",
    "Southern University": "SOU",
    "Jackson State": "JKST",
    "Florida A&M": "FAMU",
    "Texas Southern": "TXSO",
    Howard: "HOW",
    "Morgan State": "MORG",
    "Coppin State": "COPP",
    "South Carolina State": "SCST",
    "Norfolk State": "NORF",
    "Maryland-Eastern Shore": "UMES",
    "North Carolina Central": "NCCU",
    "Delaware State": "DSU",
    "Georgia Tech": "GT",
    Pittsburgh: "PITT",
    "Virginia Tech": "VT",
    SMU: "SMU",
    "Boston College": "BC",
    "Wake Forest": "WAKE",
    "North Carolina State": "NCST",
    Virginia: "UVA",
    Stanford: "STAN",
    "Miami (FL)": "MIA",
    "Notre Dame": "ND",
    Syracuse: "SYR",
    California: "CAL",
    Louisville: "LOU",
    "Florida State": "FSU",
    Clemson: "CLEM",
    "North Carolina": "UNC",
    Duke: "DUKE",
    "North Florida": "UNF",
    Stetson: "STET",
    Bellarmine: "BELL",
    "Florida Gulf Coast": "FGCU",
    "North Alabama": "UNA",
    "Austin Peay": "PEAY",
    Lipscomb: "LIP",
    "Queens University": "QUC",
    "West Georgia": "UWGA",
    "Central Arkansas": "CARK",
    "Eastern Kentucky": "EKY",
    Jacksonville: "JAC",
    "Loyola Maryland": "L-MD",
    American: "AMER",
    "Holy Cross": "HC",
    Navy: "NAVY",
    Lehigh: "LEH",
    Lafayette: "LAF",
    Army: "ARMY",
    Colgate: "COLG",
    Bucknell: "BUCK",
    "Boston University": "BU",
    "USC Upstate": "SCUS",
    Longwood: "LONG",
    "Gardner-Webb": "WEBB",
    "High Point": "HP",
    "Charleston Southern": "CHSO",
    "UNC Asheville": "UNCA",
    Presbyterian: "PRE",
    Winthrop: "WIN",
    Radford: "RAD",
    "Detroit Mercy": "DET",
    "Purdue Fort Wayne": "PFW",
    Milwaukee: "MILW",
    "Green Bay": "GB",
    "Robert Morris": "RMU",
    "IU Indy": "IUPU",
    "Wright State": "WRST",
    "Northern Kentucky": "NKU",
    Oakland: "OAK",
    "Youngstown State": "YSU",
    "Cleveland State": "CLEV",
    "Colorado State": "CSU",
    "New Mexico": "UNM",
    "San Jose State": "SJSU",
    Nevada: "NEV",
    UNLV: "UNLV",
    "Utah State": "USU",
    Wyoming: "WYO",
    "Air Force": "AFA",
    "Boise State": "BSU",
    "Fresno State": "FRES",
    "San Diego State": "SDSU",
    Auburn: "AUB",
    "South Carolina": "SCAR",
    Kentucky: "UK",
    Georgia: "UGA",
    Texas: "TEX",
    LSU: "LSU",
    Vanderbilt: "VAN",
    Missouri: "MIZZ",
    Florida: "FLA",
    "Mississippi State": "MSST",
    Oklahoma: "OKLA",
    Tennessee: "TENN",
    Alabama: "ALA",
    Arkansas: "ARK",
    "Ole Miss": "MISS",
    "Texas A&M": "TXAM",
    "Miami (OH)": "M-OH",
    "Eastern Michigan": "EMU",
    "Ball State": "BALL",
    Ohio: "OHIO",
    Toledo: "TOL",
    "Kent State": "KENT",
    "Northern Illinois": "NIU",
    "Central Michigan": "CMU",
    Akron: "AKR",
    "Bowling Green": "BGSU",
    Buffalo: "BUFF",
    "Western Michigan": "WMU",
    Purdue: "PUR",
    Illinois: "ILL",
    Oregon: "ORE",
    Maryland: "MD",
    USC: "USC",
    "Penn State": "PSU",
    Northwestern: "NW",
    "Ohio State": "OSU",
    "Michigan State": "MSU",
    Rutgers: "RUTG",
    Michigan: "MICH",
    Iowa: "IOWA",
    Indiana: "IND",
    Wisconsin: "WIS",
    Washington: "WASH",
    UCLA: "UCLA",
    Nebraska: "NEB",
    Minnesota: "MINN",
    Maine: "ME",
    Vermont: "UVM",
    Albany: "ALBY",
    UMBC: "UMBC",
    "UMass Lowell": "MASSL",
    NJIT: "NJIT",
    Bryant: "BRY",
    "New Hampshire": "UNH",
    Binghamton: "BING",
    "Chicago State": "CHS",
    Wagner: "WAG",
    Stonehill: "STNH",
    "St. Francis (PA)": "SFPA",
    "Le Moyne": "LMC",
    "Central Connecticut State": "CCSU",
    LIU: "LIU",
    FDU: "FDU",
    Mercyhurst: "MHU",
    Brown: "BRWN",
    Harvard: "HARV",
    Cornell: "COR",
    Yale: "YALE",
    Columbia: "CLMB",
    Dartmouth: "DART",
    Penn: "PENN",
    Princeton: "PRIN",
    Delaware: "DEL",
    Hampton: "HAMP",
    "Stony Brook": "STON",
    Hofstra: "HOF",
    Monmouth: "MONM",
    "North Carolina A&T": "NCAT",
    Campbell: "CAMP",
    Towson: "TOWS",
    Charleston: "COFC",
    Elon: "ELON",
    Northeastern: "NE",
    "William & Mary": "WM",
    "UNC Wilmington": "UNCW",
    Drexel: "DREX",
    Pepperdine: "PEPP",
    Portland: "PORT",
    "Santa Clara": "SCU",
    "Washington State": "WSU",
    Gonzaga: "GONZ",
    "Loyola Marymount": "LMU",
    "Oregon State": "ORST",
    "San Diego": "USD",
    "Saint Mary's": "SMC",
    Pacific: "PAC",
    "San Francisco": "SF",
    Marquette: "MARQ",
    Xavier: "XAV",
    Villanova: "VILL",
    Providence: "PROV",
    Creighton: "CREI",
    Georgetown: "GTWN",
    "Seton Hall": "HALL",
    Butler: "BUT",
    "St. John's": "SJU",
    DePaul: "DEP",
    UConn: "CONN",
    "Saint Louis": "SLU",
    "St. Bonaventure": "SBON",
    Davidson: "DAV",
    "Loyola Chicago": "L-IL",
    Dayton: "DAY",
    Fordham: "FOR",
    "Rhode Island": "URI",
    UMass: "MASS",
    Richmond: "RICH",
    "La Salle": "LAS",
    VCU: "VCU",
    "George Washington": "GW",
    "George Mason": "GMU",
    "Saint Joseph's": "JOES",
    Duquesne: "DUQ",
    Canisius: "CAN",
    Rider: "RID",
    Marist: "MRST",
    Merrimack: "MRMK",
    Iona: "IONA",
    "Sacred Heart": "SHU",
    "Mount St. Mary's": "MSM",
    Quinnipiac: "QUIN",
    Manhattan: "MAN",
    Fairfield: "FAIR",
    Siena: "SIE",
    "Saint Peter's": "SPC",
    Niagara: "NIAG"
  },
  codeToName: {
    UALR: "Trojans",
    LINW: "Lions",
    EIU: "Panthers",
    SEMO: "Redhawks",
    TNST: "Tigers",
    USI: "Screaming Eagles",
    UTM: "Skyhawks",
    MORE: "Eagles",
    SIUE: "Cougars",
    WIU: "Leathernecks",
    TNTC: "Golden Eagles",
    INST: "Sycamores",
    UNI: "Panthers",
    ILST: "Redbirds",
    MURR: "Racers",
    SIU: "Salukis",
    BEL: "Bruins",
    DRKE: "Bulldogs",
    BRAD: "Braves",
    MOSU: "Bears",
    EVAN: "Purple Aces",
    VALP: "Beacons",
    UIC: "Flames",
    UCF: "Knights",
    UTAH: "Utes",
    ISU: "Cyclones",
    HOU: "Cougars",
    OKST: "Cowboys",
    ARIZ: "Wildcats",
    COLO: "Buffaloes",
    CIN: "Bearcats",
    ASU: "Sun Devils",
    BYU: "Cougars",
    KSU: "Wildcats",
    BAY: "Bears",
    WVU: "Mountaineers",
    TCU: "Horned Frogs",
    TTU: "Red Raiders",
    KU: "Jayhawks",
    USA: "Jaguars",
    ULM: "Warhawks",
    TXST: "Bobcats",
    CCAR: "Chanticleers",
    JMU: "Dukes",
    MRSH: "Thundering Herd",
    USM: "Golden Eagles",
    TROY: "Trojans",
    ULL: "Ragin' Cajuns",
    GASO: "Eagles",
    APP: "Mountaineers",
    GAST: "Panthers",
    ARST: "Red Wolves",
    ODU: "Monarchs",
    NAU: "Lumberjacks",
    SAC: "Hornets",
    WEB: "Wildcats",
    EWU: "Eagles",
    IDST: "Bengals",
    PRST: "Vikings",
    UNCO: "Bears",
    MTST: "Bobcats",
    MONT: "Grizzlies",
    IDHO: "Vandals",
    UNT: "Mean Green",
    MEM: "Tigers",
    TLSA: "Golden Hurricane",
    TULN: "Green Wave",
    USF: "Bulls",
    UAB: "Blazers",
    TEM: "Owls",
    CHAR: "49ers",
    UTSA: "Roadrunners",
    ECU: "Pirates",
    RICE: "Owls",
    FAU: "Owls",
    WICH: "Shockers",
    VMI: "Keydets",
    CIT: "Bulldogs",
    CHAT: "Mocs",
    UNCG: "Spartans",
    WCU: "Catamounts",
    WOF: "Terriers",
    MER: "Bears",
    SAM: "Bulldogs",
    FUR: "Paladins",
    ETSU: "Buccaneers",
    ORU: "Golden Eagles",
    NEOM: "Mavericks",
    SDST: "Jackrabbits",
    DEN: "Pioneers",
    UMKC: "Roos",
    NDSU: "Bison",
    UST: "Tommies",
    SDAK: "Coyotes",
    UND: "Fighting Hawks",
    LBSU: "Beach",
    CSB: "Roadrunners",
    UCI: "Anteaters",
    UCSB: "Gauchos",
    CP: "Mustangs",
    UCSD: "Tritons",
    UCRV: "Highlanders",
    UCD: "Aggies",
    CSF: "Titans",
    CSN: "Matadors",
    HAW: "Rainbow Warriors",
    UTEP: "Miners",
    JVST: "Gamecocks",
    KENN: "Owls",
    MTU: "Blue Raiders",
    NMSU: "Aggies",
    LIB: "Flames",
    SHSU: "Bearkats",
    WKU: "Hilltoppers",
    LT: "Bulldogs",
    FIU: "Panthers",
    UVU: "Wolverines",
    UTA: "Mavericks",
    SEA: "Redhawks",
    TARL: "Texans",
    CBU: "Lancers",
    AC: "Wildcats",
    SUU: "Thunderbirds",
    UTU: "Trailblazers",
    GC: "Antelopes",
    SELA: "Lions",
    SFA: "Lumberjacks",
    NWST: "Demons",
    IW: "Cardinals",
    UTRGV: "Vaqueros",
    HCU: "Huskies",
    NICH: "Colonels",
    MCNS: "Cowboys",
    UNO: "Privateers",
    LAM: "Cardinals",
    TAMC: "Lions",
    AMCC: "Islanders",
    COOK: "Wildcats",
    ARPB: "Golden Lions",
    ALCN: "Braves",
    ALST: "Hornets",
    MVSU: "Delta Devils",
    GRAM: "Tigers",
    PV: "Panthers",
    AAMU: "Bulldogs",
    SOU: "Jaguars",
    JKST: "Tigers",
    FAMU: "Rattlers",
    TXSO: "Tigers",
    HOW: "Bison",
    MORG: "Bears",
    COPP: "Eagles",
    SCST: "Bulldogs",
    NORF: "Spartans",
    UMES: "Hawks",
    NCCU: "Eagles",
    DSU: "Hornets",
    GT: "Yellow Jackets",
    PITT: "Panthers",
    VT: "Hokies",
    SMU: "Mustangs",
    BC: "Eagles",
    WAKE: "Demon Deacons",
    NCST: "Wolfpack",
    UVA: "Cavaliers",
    STAN: "Cardinal",
    MIA: "Hurricanes",
    ND: "Fighting Irish",
    SYR: "Orange",
    CAL: "Golden Bears",
    LOU: "Cardinals",
    FSU: "Seminoles",
    CLEM: "Tigers",
    UNC: "Tar Heels",
    DUKE: "Blue Devils",
    UNF: "Ospreys",
    STET: "Hatters",
    BELL: "Knights",
    FGCU: "Eagles",
    UNA: "Lions",
    PEAY: "Governors",
    LIP: "Bisons",
    QUC: "Royals",
    UWGA: "Wolves",
    CARK: "Bears",
    EKY: "Colonels",
    JAC: "Dolphins",
    "L-MD": "Greyhounds",
    AMER: "Eagles",
    HC: "Crusaders",
    NAVY: "Midshipmen",
    LEH: "Mountain Hawks",
    LAF: "Leopards",
    ARMY: "Black Knights",
    COLG: "Raiders",
    BUCK: "Bison",
    BU: "Terriers",
    SCUS: "Spartans",
    LONG: "Lancers",
    WEBB: "Runnin' Bulldogs",
    HP: "Panthers",
    CHSO: "Buccaneers",
    UNCA: "Bulldogs",
    PRE: "Blue Hose",
    WIN: "Eagles",
    RAD: "Highlanders",
    DET: "Titans",
    PFW: "Mastodons",
    MILW: "Panthers",
    GB: "Phoenix",
    RMU: "Colonials",
    IUPU: "Jaguars",
    WRST: "Raiders",
    NKU: "Norse",
    OAK: "Golden Grizzlies",
    YSU: "Penguins",
    CLEV: "Vikings",
    CSU: "Rams",
    UNM: "Lobos",
    SJSU: "Spartans",
    NEV: "Wolf Pack",
    UNLV: "Runnin' Rebels",
    USU: "Aggies",
    WYO: "Cowboys",
    AFA: "Falcons",
    BSU: "Broncos",
    FRES: "Bulldogs",
    SDSU: "Aztecs",
    AUB: "Tigers",
    SCAR: "Gamecocks",
    UK: "Wildcats",
    UGA: "Bulldogs",
    TEX: "Longhorns",
    LSU: "Tigers",
    VAN: "Commodores",
    MIZZ: "Tigers",
    FLA: "Gators",
    MSST: "Bulldogs",
    OKLA: "Sooners",
    TENN: "Volunteers",
    ALA: "Crimson Tide",
    ARK: "Razorbacks",
    MISS: "Rebels",
    TXAM: "Aggies",
    "M-OH": "RedHawks",
    EMU: "Eagles",
    BALL: "Cardinals",
    OHIO: "Bobcats",
    TOL: "Rockets",
    KENT: "Golden Flashes",
    NIU: "Huskies",
    CMU: "Chippewas",
    AKR: "Zips",
    BGSU: "Falcons",
    BUFF: "Bulls",
    WMU: "Broncos",
    PUR: "Boilermakers",
    ILL: "Fighting Illini",
    ORE: "Ducks",
    MD: "Terrapins",
    USC: "Trojans",
    PSU: "Nittany Lions",
    NW: "Wildcats",
    OSU: "Buckeyes",
    MSU: "Spartans",
    RUTG: "Scarlet Knights",
    MICH: "Wolverines",
    IOWA: "Hawkeyes",
    IND: "Hoosiers",
    WIS: "Badgers",
    WASH: "Huskies",
    UCLA: "Bruins",
    NEB: "Cornhuskers",
    MINN: "Golden Gophers",
    ME: "Black Bears",
    UVM: "Catamounts",
    ALBY: "Great Danes",
    UMBC: "Retrievers",
    MASSL: "River Hawks",
    NJIT: "Highlanders",
    BRY: "Bulldogs",
    UNH: "Wildcats",
    BING: "Bearcats",
    CHS: "Cougars",
    WAG: "Seahawks",
    STNH: "Skyhawks",
    SFPA: "Red Flash",
    LMC: "Dolphins",
    CCSU: "Blue Devils",
    LIU: "Sharks",
    FDU: "Knights",
    MHU: "Lakers",
    BRWN: "Bears",
    HARV: "Crimson",
    COR: "Big Red",
    YALE: "Bulldogs",
    CLMB: "Lions",
    DART: "Big Green",
    PENN: "Quakers",
    PRIN: "Tigers",
    DEL: "Blue Hens",
    HAMP: "Pirates",
    STON: "Seawolves",
    HOF: "Pride",
    MONM: "Hawks",
    NCAT: "Aggies",
    CAMP: "Fighting Camels",
    TOWS: "Tigers",
    COFC: "Cougars",
    ELON: "Phoenix",
    NE: "Huskies",
    WM: "Tribe",
    UNCW: "Seahawks",
    DREX: "Dragons",
    PEPP: "Waves",
    PORT: "Pilots",
    SCU: "Broncos",
    WSU: "Cougars",
    GONZ: "Bulldogs",
    LMU: "Lions",
    ORST: "Beavers",
    USD: "Toreros",
    SMC: "Gaels",
    PAC: "Tigers",
    SF: "Dons",
    MARQ: "Golden Eagles",
    XAV: "Musketeers",
    VILL: "Wildcats",
    PROV: "Friars",
    CREI: "Bluejays",
    GTWN: "Hoyas",
    HALL: "Pirates",
    BUT: "Bulldogs",
    SJU: "Red Storm",
    DEP: "Blue Demons",
    CONN: "Huskies",
    SLU: "Billikens",
    SBON: "Bonnies",
    DAV: "Wildcats",
    "L-IL": "Ramblers",
    DAY: "Flyers",
    FOR: "Rams",
    URI: "Rams",
    MASS: "Minutemen",
    RICH: "Spiders",
    LAS: "Explorers",
    VCU: "Rams",
    GW: "Revolutionaries",
    GMU: "Patriots",
    JOES: "Hawks",
    DUQ: "Dukes",
    CAN: "Golden Griffins",
    RID: "Broncs",
    MRST: "Red Foxes",
    MRMK: "Warriors",
    IONA: "Gaels",
    SHU: "Pioneers",
    MSM: "Mountaineers",
    QUIN: "Bobcats",
    MAN: "Jaspers",
    FAIR: "Stags",
    SIE: "Saints",
    SPC: "Peacocks",
    NIAG: "Purple Eagles"
  },
  colors: {
    light: {
      aamu: "rgba(97,22,45,1)",
      ac: "rgba(88,44,131,1)",
      afa: "rgba(0,53,148,1)",
      akr: "rgba(4,30,66,1)",
      ala: "rgba(158,28,51,1)",
      alby: "rgba(70,22,107,1)",
      alcn: "rgba(81,45,109,1)",
      alst: "rgba(1,1,1,1)",
      amcc: "rgba(0,122,193,1)",
      app: "rgba(34,34,34,1)",
      ariz: "rgba(171,6,32,1)",
      ark: "rgba(161,35,56,1)",
      arpb: "rgba(1,1,1,1)",
      arst: "rgba(203,9,47,1)",
      asu: "rgba(125,34,72,1)",
      aub: "rgba(0,43,92,1)",
      ball: "rgba(186,13,47,1)",
      bay: "rgba(21,71,52,1)",
      bc: "rgba(140,34,50,1)",
      bel: "rgba(13,44,107,1)",
      bell: "rgba(119,47,64,1)",
      bgsu: "rgba(79,44,29,1)",
      bing: "rgba(0,103,71,1)",
      brad: "rgba(162,27,34,1)",
      brwn: "rgba(78,54,41,1)",
      bry: "rgba(1,1,1,1)",
      bsu: "rgba(0,51,160,1)",
      buff: "rgba(0,91,188,1)",
      but: "rgba(19,41,75,1)",
      byu: "rgba(0,61,165,1)",
      cal: "rgba(4,30,66,1)",
      camp: "rgba(255,71,19,1)",
      can: "rgba(12,35,64,1)",
      cark: "rgba(79,45,127,1)",
      cbu: "rgba(23,31,59,1)",
      ccar: "rgba(0,111,113,1)",
      ccsu: "rgba(1,48,135,1)",
      char: "rgba(0,86,63,1)",
      chat: "rgba(0,65,109,1)",
      chs: "rgba(31,104,54,1)",
      chso: "rgba(21,35,60,1)",
      cin: "rgba(0,0,0,1)",
      cit: "rgba(119,165,195,1)",
      clem: "rgba(82,45,128,1)",
      clev: "rgba(17,87,64,1)",
      clmb: "rgba(21,52,94,1)",
      cmu: "rgba(76,0,39,1)",
      cofc: "rgba(118,35,47,1)",
      colo: "rgba(0,0,0,1)",
      conn: "rgba(12,35,64,1)",
      cook: "rgba(111,38,61,1)",
      copp: "rgba(12,51,84,1)",
      cor: "rgba(179,32,37,1)",
      cp: "rgba(25,62,48,1)",
      crei: "rgba(0,92,169,1)",
      csb: "rgba(0,50,160,1)",
      csf: "rgba(0,38,58,1)",
      csn: "rgba(187,37,49,1)",
      csu: "rgba(30,77,43,1)",
      dart: "rgba(4,106,56,1)",
      dav: "rgba(216,44,39,1)",
      day: "rgba(215,0,54,1)",
      del: "rgba(0,96,149,1)",
      den: "rgba(134,38,51,1)",
      dep: "rgba(1,61,165,1)",
      det: "rgba(166,24,46,1)",
      drex: "rgba(29,45,79,1)",
      drke: "rgba(0,83,159,1)",
      dsu: "rgba(219,42,28,1)",
      duke: "rgba(1,48,136,1)",
      duq: "rgba(1,30,65,1)",
      ecu: "rgba(89,42,138,1)",
      eiu: "rgba(0,51,153,1)",
      eky: "rgba(111,38,61,1)",
      elon: "rgba(118,35,47,1)",
      emu: "rgba(0,105,56,1)",
      etsu: "rgba(4,30,66,1)",
      evan: "rgba(71,10,104,1)",
      ewu: "rgba(166,24,46,1)",
      fair: "rgba(200,17,46,1)",
      famu: "rgba(230,117,1,1)",
      fau: "rgba(0,51,102,1)",
      fdu: "rgba(114,41,60,1)",
      fgcu: "rgba(0,45,114,1)",
      fiu: "rgba(8,30,63,1)",
      fla: "rgba(1,48,135,1)",
      for: "rgba(130,4,49,1)",
      fres: "rgba(196,19,47,1)",
      fsu: "rgba(120,47,64,1)",
      fur: "rgba(88,44,131,1)",
      gaso: "rgba(4,30,66,1)",
      gast: "rgba(15,69,170,1)",
      gb: "rgba(15,86,64,1)",
      gc: "rgba(95,37,159,1)",
      gmu: "rgba(26,86,50,1)",
      gonz: "rgba(4,30,66,1)",
      gram: "rgba(1,1,1,1)",
      gt: "rgba(0,48,87,1)",
      gtwn: "rgba(20,31,53,1)",
      gw: "rgba(14,43,88,1)",
      hall: "rgba(26,93,173,1)",
      hamp: "rgba(0,51,160,1)",
      harv: "rgba(145,34,53,1)",
      haw: "rgba(0,88,55,1)",
      hcu: "rgba(0,47,135,1)",
      hof: "rgba(0,53,148,1)",
      hou: "rgba(200,17,46,1)",
      how: "rgba(0,38,62,1)",
      hp: "rgba(51,3,114,1)",
      idho: "rgba(1,1,1,1)",
      idst: "rgba(0,0,0,1)",
      ill: "rgba(255,95,5,1)",
      ilst: "rgba(200,17,46,1)",
      ind: "rgba(153,0,0,1)",
      inst: "rgba(31,67,123,1)",
      iona: "rgba(111,44,63,1)",
      iowa: "rgba(0,0,0,1)",
      isu: "rgba(167,24,48,1)",
      iupu: "rgba(157,34,53,1)",
      iw: "rgba(203,51,59,1)",
      jac: "rgba(0,78,66,1)",
      jkst: "rgba(4,30,66,1)",
      jmu: "rgba(69,3,132,1)",
      joes: "rgba(157,34,53,1)",
      jvst: "rgba(204,51,51,1)",
      kenn: "rgba(35,31,32,1)",
      kent: "rgba(1,57,118,1)",
      ksu: "rgba(51,10,87,1)",
      ku: "rgba(0,81,186,1)",
      "l-il": "rgba(89,41,49,1)",
      lam: "rgba(229,22,54,1)",
      las: "rgba(0,51,86,1)",
      lbsu: "rgba(1,1,1,1)",
      lib: "rgba(10,37,78,1)",
      linw: "rgba(0,0,0,1)",
      lip: "rgba(34,23,75,1)",
      liu: "rgba(94,151,187,1)",
      lmc: "rgba(21,71,52,1)",
      lmu: "rgba(171,12,47,1)",
      long: "rgba(4,30,66,1)",
      lou: "rgba(173,0,0,1)",
      lsu: "rgba(70,29,124,1)",
      lt: "rgba(1,48,135,1)",
      "m-oh": "rgba(182,30,46,1)",
      man: "rgba(4,106,56,1)",
      marq: "rgba(29,41,83,1)",
      mass: "rgba(136,28,27,1)",
      massl: "rgba(26,100,183,1)",
      mcns: "rgba(0,71,127,1)",
      md: "rgba(206,16,45,1)",
      me: "rgba(12,35,64,1)",
      mem: "rgba(19,75,142,1)",
      mer: "rgba(209,107,31,1)",
      mhu: "rgba(0,89,76,1)",
      mia: "rgba(0,80,48,1)",
      mich: "rgba(0,39,76,1)",
      milw: "rgba(1,1,1,1)",
      minn: "rgba(91,0,19,1)",
      miss: "rgba(20,33,61,1)",
      mizz: "rgba(0,0,0,1)",
      monm: "rgba(4,30,66,1)",
      mont: "rgba(111,44,63,1)",
      more: "rgba(36,75,166,1)",
      morg: "rgba(27,67,131,1)",
      mosu: "rgba(111,44,63,1)",
      mrmk: "rgba(0,48,87,1)",
      mrsh: "rgba(35,31,32,1)",
      mrst: "rgba(200,17,46,1)",
      msm: "rgba(0,47,108,1)",
      msst: "rgba(93,23,37,1)",
      msu: "rgba(28,69,59,1)",
      mtst: "rgba(0,32,91,1)",
      mtu: "rgba(0,102,204,1)",
      murr: "rgba(12,35,64,1)",
      mvsu: "rgba(4,106,56,1)",
      nau: "rgba(0,32,91,1)",
      ncat: "rgba(0,45,114,1)",
      nccu: "rgba(134,38,51,1)",
      ncst: "rgba(203,0,0,1)",
      nd: "rgba(6,34,64,1)",
      ndsu: "rgba(17,87,64,1)",
      ne: "rgba(200,17,46,1)",
      neb: "rgba(208,0,0,1)",
      neom: "rgba(1,1,1,1)",
      nev: "rgba(134,138,144,1)",
      niag: "rgba(89,45,130,1)",
      nich: "rgba(166,24,46,1)",
      niu: "rgba(199,0,1,1)",
      njit: "rgba(238,41,34,1)",
      nku: "rgba(1,1,1,1)",
      nmsu: "rgba(145,45,41,1)",
      norf: "rgba(0,122,83,1)",
      nw: "rgba(87,48,129,1)",
      nwst: "rgba(84,32,158,1)",
      oak: "rgba(1,1,1,1)",
      odu: "rgba(8,33,54,1)",
      ohio: "rgba(21,71,52,1)",
      okla: "rgba(136,0,0,1)",
      okst: "rgba(35,31,32,1)",
      ore: "rgba(0,136,66,1)",
      orst: "rgba(218,72,38,1)",
      oru: "rgba(1,30,65,1)",
      osu: "rgba(19,19,19,1)",
      pac: "rgba(226,82,5,1)",
      peay: "rgba(176,0,42,1)",
      penn: "rgba(0,45,114,1)",
      pepp: "rgba(0,32,91,1)",
      pfw: "rgba(31,61,125,1)",
      pitt: "rgba(0,53,148,1)",
      port: "rgba(49,3,111,1)",
      pre: "rgba(1,83,148,1)",
      prin: "rgba(220,104,25,1)",
      prov: "rgba(0,0,0,1)",
      prst: "rgba(21,71,52,1)",
      psu: "rgba(4,30,66,1)",
      pur: "rgba(0,0,0,1)",
      pv: "rgba(88,44,131,1)",
      quc: "rgba(4,30,66,1)",
      quin: "rgba(12,35,64,1)",
      rad: "rgba(200,17,46,1)",
      rice: "rgba(0,32,91,1)",
      rich: "rgba(193,2,48,1)",
      rid: "rgba(157,34,53,1)",
      rmu: "rgba(4,30,66,1)",
      rutg: "rgba(206,17,44,1)",
      sac: "rgba(17,87,64,1)",
      sam: "rgba(12,35,64,1)",
      sbon: "rgba(78,54,41,1)",
      scar: "rgba(115,0,10,1)",
      scst: "rgba(144,0,40,1)",
      scu: "rgba(134,38,51,1)",
      scus: "rgba(3,106,56,1)",
      sdak: "rgba(186,13,47,1)",
      sdst: "rgba(0,50,160,1)",
      sdsu: "rgba(11,11,11,1)",
      sea: "rgba(170,0,0,1)",
      sela: "rgba(26,86,50,1)",
      semo: "rgba(6,4,3,1)",
      sf: "rgba(32,92,64,1)",
      sfa: "rgba(83,47,124,1)",
      sfpa: "rgba(189,31,37,1)",
      shsu: "rgba(246,100,36,1)",
      shu: "rgba(186,13,47,1)",
      sie: "rgba(0,103,71,1)",
      siu: "rgba(111,38,61,1)",
      siue: "rgba(206,32,47,1)",
      sjsu: "rgba(1,56,166,1)",
      sju: "rgba(186,13,47,1)",
      slu: "rgba(1,61,165,1)",
      smc: "rgba(229,27,37,1)",
      smu: "rgba(30,58,148,1)",
      sou: "rgba(89,152,196,1)",
      spc: "rgba(33,55,92,1)",
      stan: "rgba(140,20,21,1)",
      stet: "rgba(30,81,61,1)",
      stnh: "rgba(88,44,131,1)",
      ston: "rgba(166,24,46,1)",
      suu: "rgba(186,13,47,1)",
      syr: "rgba(255,68,27,1)",
      tamc: "rgba(0,56,108,1)",
      tarl: "rgba(88,44,131,1)",
      tcu: "rgba(77,25,120,1)",
      tem: "rgba(152,30,50,1)",
      tenn: "rgba(217,111,1,1)",
      tex: "rgba(191,87,0,1)",
      tlsa: "rgba(0,53,149,1)",
      tnst: "rgba(39,46,99,1)",
      tntc: "rgba(83,54,154,1)",
      tol: "rgba(10,34,64,1)",
      tows: "rgba(1,1,1,1)",
      troy: "rgba(144,0,40,1)",
      ttu: "rgba(219,42,28,1)",
      tuln: "rgba(64,143,225,1)",
      txam: "rgba(106,30,45,1)",
      txso: "rgba(111,38,61,1)",
      txst: "rgba(80,18,20,1)",
      uab: "rgba(28,112,78,1)",
      ualr: "rgba(92,37,50,1)",
      ucd: "rgba(0,40,85,1)",
      ucf: "rgba(161,147,95,1)",
      uci: "rgba(12,35,64,1)",
      ucla: "rgba(39,116,174,1)",
      ucrv: "rgba(31,67,123,1)",
      ucsb: "rgba(0,50,160,1)",
      ucsd: "rgba(24,40,71,1)",
      uga: "rgba(203,0,0,1)",
      uic: "rgba(219,1,50,1)",
      uk: "rgba(1,47,146,1)",
      ull: "rgba(203,28,38,1)",
      ulm: "rgba(132,0,41,1)",
      umbc: "rgba(1,1,1,1)",
      umes: "rgba(105,28,50,1)",
      umkc: "rgba(0,75,135,1)",
      una: "rgba(89,44,130,1)",
      unc: "rgba(22,40,76,1)",
      unca: "rgba(0,47,108,1)",
      uncg: "rgba(19,41,75,1)",
      unco: "rgba(0,40,85,1)",
      uncw: "rgba(0,51,102,1)",
      und: "rgba(0,154,68,1)",
      unf: "rgba(12,30,61,1)",
      unh: "rgba(1,39,94,1)",
      uni: "rgba(71,10,104,1)",
      unlv: "rgba(206,0,0,1)",
      unm: "rgba(186,13,47,1)",
      uno: "rgba(0,87,185,1)",
      unt: "rgba(0,133,62,1)",
      uri: "rgba(21,33,59,1)",
      usa: "rgba(196,31,58,1)",
      usc: "rgba(157,34,53,1)",
      usd: "rgba(0,32,91,1)",
      usf: "rgba(0,103,71,1)",
      usi: "rgba(15,43,83,1)",
      usm: "rgba(0,0,0,1)",
      ust: "rgba(65,39,132,1)",
      usu: "rgba(0,38,58,1)",
      uta: "rgba(1,61,165,1)",
      utah: "rgba(190,0,0,1)",
      utep: "rgba(230,117,1,1)",
      utm: "rgba(12,41,80,1)",
      utrgv: "rgba(255,77,0,1)",
      utsa: "rgba(6,33,64,1)",
      utu: "rgba(186,27,32,1)",
      uva: "rgba(248,77,31,1)",
      uvm: "rgba(0,78,50,1)",
      uvu: "rgba(39,93,56,1)",
      uwga: "rgba(30,89,174,1)",
      valp: "rgba(105,63,35,1)",
      van: "rgba(0,0,0,1)",
      vcu: "rgba(1,1,1,1)",
      vill: "rgba(23,58,121,1)",
      vmi: "rgba(228,0,43,1)",
      vt: "rgba(102,0,0,1)",
      wag: "rgba(3,70,56,1)",
      wake: "rgba(21,21,21,1)",
      wash: "rgba(43,2,94,1)",
      wcu: "rgba(95,37,159,1)",
      web: "rgba(71,10,104,1)",
      webb: "rgba(168,41,49,1)",
      wich: "rgba(1,1,1,1)",
      win: "rgba(157,34,53,1)",
      wis: "rgba(160,0,0,1)",
      wiu: "rgba(103,56,149,1)",
      wku: "rgba(176,30,36,1)",
      wm: "rgba(40,71,52,1)",
      wmu: "rgba(83,46,31,1)",
      wof: "rgba(137,110,75,1)",
      wrst: "rgba(4,106,56,1)",
      wsu: "rgba(152,30,50,1)",
      wvu: "rgba(0,40,85,1)",
      wyo: "rgba(44,28,22,1)",
      xav: "rgba(22,36,58,1)",
      yale: "rgba(9,35,64,1)",
      ysu: "rgba(200,17,46,1)",
      amer: "rgba(166,24,46,1)",
      army: "rgba(44,42,41,1)",
      bu: "rgba(203,0,0,1)",
      buck: "rgba(0,55,100,1)",
      colg: "rgba(138,35,51,1)",
      hc: "rgba(100,44,145,1)",
      "l-md": "rgba(14,99,67,1)",
      laf: "rgba(142,10,38,1)",
      leh: "rgba(91,45,5,1)",
      navy: "rgba(0,34,91,1)"
    },
    dark: {
      aamu: "rgba(137,80,98,1)",
      ac: "rgba(130,97,162,1)",
      afa: "rgba(64,104,175,1)",
      akr: "rgba(199,183,132,1)",
      ala: "rgba(173,62,82,1)",
      alby: "rgba(238,178,17,1)",
      alcn: "rgba(125,98,146,1)",
      alst: "rgba(251,199,7,1)",
      amcc: "rgba(0,122,193,1)",
      app: "rgba(255,210,1,1)",
      ariz: "rgba(188,56,77,1)",
      ark: "rgba(175,68,86,1)",
      arpb: "rgba(115,115,115,1)",
      arst: "rgba(203,9,47,1)",
      asu: "rgba(255,198,39,1)",
      aub: "rgba(242,101,34,1)",
      ball: "rgba(196,48,78,1)",
      bay: "rgba(68,108,93,1)",
      bc: "rgba(219,204,166,1)",
      bel: "rgba(217,26,49,1)",
      bell: "rgba(160,109,121,1)",
      bgsu: "rgba(253,79,1,1)",
      bing: "rgba(51,133,108,1)",
      brad: "rgba(185,84,89,1)",
      brwn: "rgba(122,104,95,1)",
      bry: "rgba(195,181,151,1)",
      bsu: "rgba(214,67,9,1)",
      buff: "rgba(38,116,198,1)",
      but: "rgba(90,105,129,1)",
      byu: "rgba(51,100,183,1)",
      cal: "rgba(79,98,123,1)",
      camp: "rgba(255,71,19,1)",
      can: "rgba(85,101,121,1)",
      cark: "rgba(123,98,159,1)",
      cbu: "rgba(93,98,118,1)",
      ccar: "rgba(0,111,113,1)",
      ccsu: "rgba(65,100,165,1)",
      char: "rgba(64,128,111,1)",
      chat: "rgba(231,174,39,1)",
      chs: "rgba(65,127,84,1)",
      chso: "rgba(160,144,98,1)",
      cin: "rgba(224,1,34,1)",
      cit: "rgba(119,165,195,1)",
      clem: "rgba(134,108,166,1)",
      clev: "rgba(65,121,102,1)",
      clmb: "rgba(151,202,235,1)",
      cmu: "rgba(139,89,115,1)",
      cofc: "rgba(151,133,74,1)",
      colo: "rgba(207,184,124,1)",
      conn: "rgba(141,188,218,1)",
      cook: "rgba(243,160,15,1)",
      copp: "rgba(255,205,0,1)",
      cor: "rgba(194,77,81,1)",
      cp: "rgba(160,142,89,1)",
      crei: "rgba(118,175,227,1)",
      csb: "rgba(252,208,6,1)",
      csf: "rgba(244,114,21,1)",
      csn: "rgba(187,37,49,1)",
      csu: "rgba(98,130,107,1)",
      dart: "rgba(54,136,96,1)",
      dav: "rgba(216,44,39,1)",
      day: "rgba(215,0,54,1)",
      del: "rgba(255,218,27,1)",
      den: "rgba(168,153,104,1)",
      dep: "rgba(0,114,206,1)",
      det: "rgba(184,70,88,1)",
      drex: "rgba(97,108,132,1)",
      drke: "rgba(191,192,194,1)",
      dsu: "rgba(219,42,28,1)",
      duke: "rgba(77,110,172,1)",
      duq: "rgba(77,98,122,1)",
      ecu: "rgba(255,214,21,1)",
      eiu: "rgba(51,102,204,1)",
      eky: "rgba(147,92,110,1)",
      elon: "rgba(181,151,87,1)",
      emu: "rgba(38,128,86,1)",
      etsu: "rgba(252,202,32,1)",
      evan: "rgba(237,139,0,1)",
      ewu: "rgba(184,70,88,1)",
      fair: "rgba(200,17,46,1)",
      famu: "rgba(255,130,1,1)",
      fau: "rgba(204,0,0,1)",
      fdu: "rgba(142,84,99,1)",
      fgcu: "rgba(0,147,102,1)",
      fiu: "rgba(182,134,44,1)",
      fla: "rgba(250,70,22,1)",
      for: "rgba(161,67,101,1)",
      fres: "rgba(196,19,47,1)",
      fsu: "rgba(206,184,136,1)",
      fur: "rgba(138,107,168,1)",
      gaso: "rgba(169,146,96,1)",
      gast: "rgba(63,106,187,1)",
      gb: "rgba(63,120,102,1)",
      gc: "rgba(135,92,183,1)",
      gmu: "rgba(83,128,101,1)",
      gonz: "rgba(104,120,142,1)",
      gram: "rgba(115,115,115,1)",
      gt: "rgba(179,163,105,1)",
      gtwn: "rgba(91,98,114,1)",
      gw: "rgba(86,107,138,1)",
      hall: "rgba(60,117,185,1)",
      hamp: "rgba(64,102,184,1)",
      harv: "rgba(167,78,93,1)",
      haw: "rgba(64,130,105,1)",
      hcu: "rgba(255,77,0,1)",
      hof: "rgba(244,192,25,1)",
      hou: "rgba(200,17,46,1)",
      how: "rgba(77,117,146,1)",
      hp: "rgba(122,91,163,1)",
      idho: "rgba(222,163,50,1)",
      idst: "rgba(244,121,33,1)",
      ill: "rgba(255,95,5,1)",
      ilst: "rgba(226,39,57,1)",
      ind: "rgba(179,64,64,1)",
      inst: "rgba(203,202,196,1)",
      iona: "rgba(147,97,111,1)",
      iowa: "rgba(255,210,1,1)",
      isu: "rgba(250,218,99,1)",
      iupu: "rgba(177,78,93,1)",
      iw: "rgba(203,51,59,1)",
      jac: "rgba(191,176,125,1)",
      jkst: "rgba(92,109,132,1)",
      jmu: "rgba(180,162,105,1)",
      joes: "rgba(182,89,104,1)",
      jvst: "rgba(204,51,51,1)",
      kenn: "rgba(253,187,49,1)",
      kent: "rgba(239,171,0,1)",
      ksu: "rgba(133,108,154,1)",
      ku: "rgba(255,200,45,1)",
      "l-il": "rgba(131,95,101,1)",
      lam: "rgba(229,22,54,1)",
      las: "rgba(64,102,128,1)",
      lbsu: "rgba(115,115,115,1)",
      lib: "rgba(108,124,149,1)",
      linw: "rgba(181,163,106,1)",
      lip: "rgba(250,178,11,1)",
      liu: "rgba(104,168,208,1)",
      lmc: "rgba(80,117,103,1)",
      lmu: "rgba(16,127,184,1)",
      long: "rgba(79,98,123,1)",
      lou: "rgba(253,185,19,1)",
      lsu: "rgba(253,208,34,1)",
      lt: "rgba(203,51,59,1)",
      "m-oh": "rgba(193,64,77,1)",
      man: "rgba(42,128,86,1)",
      marq: "rgba(108,116,143,1)",
      mass: "rgba(172,96,95,1)",
      massl: "rgba(26,100,183,1)",
      mcns: "rgba(251,205,32,1)",
      md: "rgba(206,16,45,1)",
      me: "rgba(109,123,140,1)",
      mem: "rgba(142,144,143,1)",
      mer: "rgba(232,119,34,1)",
      mhu: "rgba(64,131,121,1)",
      mia: "rgba(240,91,1,1)",
      mich: "rgba(245,195,0,1)",
      milw: "rgba(115,115,115,1)",
      minn: "rgba(255,204,51,1)",
      miss: "rgba(102,111,129,1)",
      mizz: "rgba(241,184,44,1)",
      monm: "rgba(79,98,123,1)",
      mont: "rgba(147,97,111,1)",
      more: "rgba(91,120,188,1)",
      morg: "rgba(244,121,55,1)",
      mosu: "rgba(140,86,101,1)",
      mrmk: "rgba(250,178,11,1)",
      mrsh: "rgba(1,175,67,1)",
      mrst: "rgba(211,65,88,1)",
      msm: "rgba(64,99,145,1)",
      msst: "rgba(134,81,92,1)",
      msu: "rgba(96,125,118,1)",
      mtst: "rgba(184,143,75,1)",
      mtu: "rgba(0,102,204,1)",
      murr: "rgba(251,192,28,1)",
      mvsu: "rgba(42,128,86,1)",
      nau: "rgba(89,110,148,1)",
      ncat: "rgba(250,178,23,1)",
      nccu: "rgba(142,144,147,1)",
      ncst: "rgba(203,0,0,1)",
      nd: "rgba(198,149,0,1)",
      ndsu: "rgba(251,191,22,1)",
      ne: "rgba(211,65,88,1)",
      neb: "rgba(208,0,0,1)",
      neom: "rgba(226,24,55,1)",
      nev: "rgba(168,173,180,1)",
      niag: "rgba(131,98,161,1)",
      nich: "rgba(188,82,98,1)",
      niu: "rgba(199,0,1,1)",
      njit: "rgba(238,41,34,1)",
      nku: "rgba(115,115,115,1)",
      nmsu: "rgba(162,77,73,1)",
      norf: "rgba(0,122,83,1)",
      nw: "rgba(129,100,161,1)",
      nwst: "rgba(255,102,0,1)",
      oak: "rgba(115,115,115,1)",
      odu: "rgba(161,209,241,1)",
      ohio: "rgba(91,126,113,1)",
      okla: "rgba(172,77,77,1)",
      okst: "rgba(255,102,1,1)",
      ore: "rgba(0,136,66,1)",
      orst: "rgba(218,72,38,1)",
      oru: "rgba(198,183,132,1)",
      osu: "rgba(113,113,113,1)",
      pac: "rgba(226,82,5,1)",
      peay: "rgba(200,77,106,1)",
      penn: "rgba(77,108,156,1)",
      pepp: "rgba(89,110,148,1)",
      pfw: "rgba(87,110,158,1)",
      pitt: "rgba(64,104,175,1)",
      port: "rgba(121,91,161,1)",
      pre: "rgba(65,126,175,1)",
      prin: "rgba(232,119,34,1)",
      prov: "rgba(115,115,115,1)",
      prst: "rgba(80,117,103,1)",
      psu: "rgba(92,109,132,1)",
      pur: "rgba(211,190,149,1)",
      pv: "rgba(130,97,162,1)",
      quc: "rgba(79,98,123,1)",
      quin: "rgba(85,101,121,1)",
      rad: "rgba(200,17,46,1)",
      rice: "rgba(89,110,148,1)",
      rich: "rgba(205,53,89,1)",
      rid: "rgba(182,89,104,1)",
      rmu: "rgba(79,98,123,1)",
      rutg: "rgba(206,17,44,1)",
      sac: "rgba(176,146,71,1)",
      sam: "rgba(97,112,131,1)",
      sbon: "rgba(122,104,95,1)",
      scar: "rgba(157,77,84,1)",
      scst: "rgba(57,109,172,1)",
      scu: "rgba(164,92,102,1)",
      scus: "rgba(41,128,86,1)",
      sdak: "rgba(203,74,65,1)",
      sdst: "rgba(77,112,189,1)",
      sdsu: "rgba(196,18,48,1)",
      sea: "rgba(191,64,64,1)",
      sela: "rgba(255,198,41,1)",
      semo: "rgba(118,117,116,1)",
      sf: "rgba(88,133,112,1)",
      sfa: "rgba(135,109,163,1)",
      sfpa: "rgba(189,31,37,1)",
      shsu: "rgba(246,100,36,1)",
      shu: "rgba(200,61,89,1)",
      sie: "rgba(38,126,99,1)",
      siu: "rgba(140,81,100,1)",
      siue: "rgba(206,32,47,1)",
      sjsu: "rgba(255,184,26,1)",
      sju: "rgba(203,74,99,1)",
      slu: "rgba(65,110,188,1)",
      smc: "rgba(229,27,37,1)",
      smu: "rgba(86,107,175,1)",
      sou: "rgba(105,179,231,1)",
      spc: "rgba(89,105,133,1)",
      stan: "rgba(169,79,80,1)",
      stet: "rgba(64,107,90,1)",
      stnh: "rgba(130,113,178,1)",
      ston: "rgba(188,82,98,1)",
      suu: "rgba(203,74,99,1)",
      syr: "rgba(255,68,27,1)",
      tamc: "rgba(77,116,152,1)",
      tarl: "rgba(130,97,162,1)",
      tcu: "rgba(130,94,161,1)",
      tem: "rgba(183,98,112,1)",
      tenn: "rgba(255,130,1,1)",
      tex: "rgba(191,87,0,1)",
      tlsa: "rgba(64,104,176,1)",
      tnst: "rgba(93,98,138,1)",
      tntc: "rgba(253,221,4,1)",
      tol: "rgba(96,111,131,1)",
      tows: "rgba(255,203,5,1)",
      troy: "rgba(179,181,184,1)",
      ttu: "rgba(219,42,28,1)",
      tuln: "rgba(64,143,225,1)",
      txam: "rgba(151,98,108,1)",
      txso: "rgba(147,92,110,1)",
      txst: "rgba(140,115,74,1)",
      uab: "rgba(28,112,78,1)",
      ualr: "rgba(133,92,101,1)",
      ucd: "rgba(77,105,136,1)",
      ucf: "rgba(179,163,105,1)",
      uci: "rgba(85,101,121,1)",
      ucla: "rgba(39,116,174,1)",
      ucrv: "rgba(87,114,156,1)",
      ucsb: "rgba(252,183,20,1)",
      ucsd: "rgba(93,105,126,1)",
      uga: "rgba(203,0,0,1)",
      uic: "rgba(219,1,50,1)",
      uk: "rgba(77,109,179,1)",
      ull: "rgba(203,28,38,1)",
      ulm: "rgba(253,185,19,1)",
      umbc: "rgba(246,188,37,1)",
      umes: "rgba(137,138,141,1)",
      umkc: "rgba(255,205,0,1)",
      una: "rgba(131,97,161,1)",
      unc: "rgba(123,175,212,1)",
      unca: "rgba(77,109,152,1)",
      uncg: "rgba(252,182,26,1)",
      unco: "rgba(250,182,33,1)",
      uncw: "rgba(64,102,140,1)",
      und: "rgba(0,154,68,1)",
      unf: "rgba(85,98,119,1)",
      unh: "rgba(195,195,199,1)",
      uni: "rgba(250,184,10,1)",
      unlv: "rgba(206,0,0,1)",
      unm: "rgba(159,160,162,1)",
      uno: "rgba(162,170,173,1)",
      unt: "rgba(0,133,62,1)",
      uri: "rgba(91,100,118,1)",
      usa: "rgba(196,31,58,1)",
      usc: "rgba(157,34,53,1)",
      usd: "rgba(79,153,217,1)",
      usf: "rgba(207,196,147,1)",
      usi: "rgba(221,23,49,1)",
      usm: "rgba(255,171,0,1)",
      ust: "rgba(122,104,169,1)",
      usu: "rgba(89,114,127,1)",
      uta: "rgba(65,110,188,1)",
      utah: "rgba(210,77,77,1)",
      utep: "rgba(255,130,1,1)",
      utm: "rgba(246,139,26,1)",
      utrgv: "rgba(255,77,0,1)",
      utsa: "rgba(225,69,4,1)",
      utu: "rgba(200,73,77,1)",
      uva: "rgba(248,77,31,1)",
      uvm: "rgba(250,178,23,1)",
      uvu: "rgba(71,117,86,1)",
      uwga: "rgba(75,122,190,1)",
      valp: "rgba(253,214,29,1)",
      van: "rgba(185,153,80,1)",
      vcu: "rgba(90,90,90,1)",
      vill: "rgba(81,187,237,1)",
      vmi: "rgba(228,0,43,1)",
      vt: "rgba(207,69,32,1)",
      wag: "rgba(66,116,106,1)",
      wake: "rgba(206,184,136,1)",
      wash: "rgba(232,211,162,1)",
      wcu: "rgba(192,166,116,1)",
      web: "rgba(126,84,149,1)",
      webb: "rgba(185,84,90,1)",
      wich: "rgba(252,208,6,1)",
      win: "rgba(182,89,104,1)",
      wis: "rgba(197,5,12,1)",
      wiu: "rgba(255,205,7,1)",
      wku: "rgba(196,86,91,1)",
      wm: "rgba(94,117,103,1)",
      wmu: "rgba(181,161,103,1)",
      wof: "rgba(137,110,75,1)",
      wrst: "rgba(54,136,96,1)",
      wsu: "rgba(183,98,112,1)",
      wvu: "rgba(77,105,136,1)",
      wyo: "rgba(255,196,37,1)",
      xav: "rgba(104,113,127,1)",
      yale: "rgba(83,101,121,1)",
      ysu: "rgba(211,65,88,1)",
      amer: "rgba(188,82,98,1)",
      army: "rgba(211,188,141,1)",
      bu: "rgba(203,0,0,1)",
      buck: "rgba(238,118,35,1)",
      colg: "rgba(167,90,102,1)",
      hc: "rgba(139,97,173,1)",
      "l-md": "rgba(38,115,86,1)",
      laf: "rgba(170,71,92,1)",
      leh: "rgba(203,165,105,1)",
      navy: "rgba(89,111,148,1)"
    },
  },
};
const NFL_TEAMS = {
  logoCodeAliases: {},
  codeToCity: {
    ARI: "Arizona",
    ATL: "Atlanta",
    BAL: "Baltimore",
    BUF: "Buffalo",
    CAR: "Carolina",
    CHI: "Chicago",
    CIN: "Cincinnati",
    CLE: "Cleveland",
    DAL: "Dallas",
    DEN: "Denver",
    DET: "Detroit",
    GB: "Green Bay",
    HOU: "Houston",
    IND: "Indianapolis",
    JAX: "Jacksonville",
    KC: "Kansas City",
    LV: "Las Vegas",
    LAC: "Los Angeles C.",
    LA: "Los Angeles R.",
    MIA: "Miami",
    MIN: "Minnesota",
    NE: "New England",
    NO: "New Orleans",
    NYG: "New York G.",
    NYJ: "New York J.",
    PHI: "Philadelphia",
    PIT: "Pittsburgh",
    SF: "San Francisco",
    SEA: "Seattle",
    TB: "Tampa Bay",
    TEN: "Tennessee",
    WAS: "Washington"
  },
  cityToCode: {
    Arizona: "ARI",
    Atlanta: "ATL",
    Baltimore: "BAL",
    Buffalo: "BUF",
    Carolina: "CAR",
    Chicago: "CHI",
    Cincinnati: "CIN",
    Cleveland: "CLE",
    Dallas: "DAL",
    Denver: "DEN",
    Detroit: "DET",
    "Green Bay": "GB",
    Houston: "HOU",
    Indianapolis: "IND",
    Jacksonville: "JAX",
    "Kansas City": "KC",
    "Las Vegas": "LV",
    "Los Angeles C.": "LAC",
    "Los Angeles R.": "LA",
    Miami: "MIA",
    Minnesota: "MIN",
    "New England": "NE",
    "New Orleans": "NO",
    "New York G.": "NYG",
    "New York J.": "NYJ",
    Philadelphia: "PHI",
    Pittsburgh: "PIT",
    "San Francisco": "SF",
    Seattle: "SEA",
    "Tampa Bay": "TB",
    Tennessee: "TEN",
    Washington: "WAS"
  },
  codeToName: {
    ARI: "Cardinals",
    ATL: "Falcons",
    BAL: "Ravens",
    BUF: "Bills",
    CAR: "Panthers",
    CHI: "Bears",
    CIN: "Bengals",
    CLE: "Browns",
    DAL: "Cowboys",
    DEN: "Broncos",
    DET: "Lions",
    GB: "Packers",
    HOU: "Texans",
    IND: "Colts",
    JAX: "Jaguars",
    KC: "Chiefs",
    LV: "Raiders",
    LAC: "Chargers",
    LA: "Rams",
    MIA: "Dolphins",
    MIN: "Vikings",
    NE: "Patriots",
    NO: "Saints",
    NYG: "Giants",
    NYJ: "Jets",
    PHI: "Eagles",
    PIT: "Steelers",
    SF: "49ers",
    SEA: "Seahawks",
    TB: "Buccaneers",
    TEN: "Titans",
    WAS: "Football Team"
  },
  colors: {
    light: {
      ari: "rgba(151,35,63,1)",
      atl: "rgba(167,25,48,1)",
      bal: "rgba(36,23,115,1)",
      buf: "rgba(0,51,141,1)",
      car: "rgba(0,133,202,1)",
      chi: "rgba(230,64,0,1)",
      cin: "rgba(251,79,20,1)",
      cle: "rgba(255,60,0,1)",
      dal: "rgba(4,30,66,1)",
      den: "rgba(0,34,68,1)",
      det: "rgba(0,118,182,1)",
      gb: "rgba(32,55,49,1)",
      hou: "rgba(3,32,47,1)",
      ind: "rgba(0,44,95,1)",
      jax: "rgba(0,103,120,1)",
      kc: "rgba(227,24,55,1)",
      la: "rgba(0,53,148,1)",
      lac: "rgba(0,128,198,1)",
      lv: "rgba(0,0,0,1)",
      mia: "rgba(0,142,151,1)",
      min: "rgba(79,38,131,1)",
      ne: "rgba(0,34,68,1)",
      no: "rgba(211,188,141,1)",
      nyg: "rgba(11,34,101,1)",
      nyj: "rgba(18,87,64,1)",
      phi: "rgba(0,76,84,1)",
      pit: "rgba(255,182,18,1)",
      sea: "rgba(0,34,68,1)",
      sf: "rgba(170,0,0,1)",
      tb: "rgba(213,10,10,1)",
      ten: "rgba(75,146,219,1)",
      was: "rgba(90,20,20,1)"
    },
    dark: {
      ari: "rgba(215,71,93,1)",
      atl: "rgba(229,57,77,1)",
      bal: "rgba(122,126,195,1)",
      buf: "rgba(110,131,197,1)",
      car: "rgba(5,153,222,1)",
      chi: "rgba(230,64,0,1)",
      cin: "rgba(255,84,24,1)",
      cle: "rgba(255,66,5,1)",
      dal: "rgba(102,122,156,1)",
      den: "rgba(101,126,157,1)",
      det: "rgba(10,168,236,1)",
      gb: "rgba(90,132,120,1)",
      hou: "rgba(88,124,148,1)",
      ind: "rgba(110,137,179,1)",
      jax: "rgba(26,136,166,1)",
      kc: "rgba(245,38,61,1)",
      la: "rgba(111,132,203,1)",
      lac: "rgba(2,147,218,1)",
      lv: "rgba(123,123,123,1)",
      mia: "rgba(0,161,175,1)",
      min: "rgba(169,86,186,1)",
      ne: "rgba(101,126,157,1)",
      no: "rgba(211,188,141,1)",
      nyg: "rgba(112,129,183,1)",
      nyj: "rgba(33,132,105,1)",
      phi: "rgba(2,129,150,1)",
      pit: "rgba(255,198,25,1)",
      sea: "rgba(101,126,157,1)",
      sf: "rgba(229,53,26,1)",
      tb: "rgba(243,41,25,1)",
      ten: "rgba(93,162,224,1)",
      was: "rgba(183,111,93,1)"
    },
  },
};
const NCAAF_TEAMS = {
  logoCodeAliases: {},
  codeToCity: {
    ASU: "Arizona State",
    KST: "Kansas State",
    TT: "Texas Tech",
    UTH: "Utah",
    HOU: "Houston",
    CIN: "Cincinnati",
    UCF: "UCF",
    BYU: "BYU",
    WVU: "West Virginia",
    BAY: "Baylor",
    ARI: "Arizona",
    TCU: "TCU",
    COL: "Colorado",
    KAN: "Kansas",
    ISU: "Iowa State",
    OKS: "Oklahoma State",
    NM: "New Mexico",
    CSU: "Colorado State",
    NEV: "Nevada",
    BOISE: "Boise State",
    SDSU: "San Diego State",
    FRE: "Fresno State",
    UNLV: "UNLV",
    HAW: "Hawai'i",
    AF: "Air Force",
    WYO: "Wyoming",
    UTS: "Utah State",
    SJS: "San Jose State",
    NCST: "North Carolina State",
    FSU: "Florida State",
    LOU: "Louisville",
    BC: "Boston College",
    MFL: "Miami (FL)",
    WF: "Wake Forest",
    VT: "Virginia Tech",
    GT: "Georgia Tech",
    SMU: "SMU",
    SYR: "Syracuse",
    NC: "North Carolina",
    STA: "Stanford",
    UVA: "Virginia",
    CLE: "Clemson",
    PIT: "Pittsburgh",
    DUK: "Duke",
    CAL: "California",
    CMC: "Central Michigan",
    NIL: "Northern Illinois",
    EMC: "Eastern Michigan",
    MOH: "Miami (OH)",
    BGN: "Bowling Green",
    BALL: "Ball State",
    BUF: "Buffalo",
    TOL: "Toledo",
    KNT: "Kent State",
    OHI: "Ohio",
    AKR: "Akron",
    WMC: "Western Michigan",
    BAMA: "Alabama",
    OKL: "Oklahoma",
    UGA: "Georgia",
    ARK: "Arkansas",
    KEN: "Kentucky",
    MSST: "Mississippi State",
    MIZ: "Missouri",
    SC: "South Carolina",
    VAN: "Vanderbilt",
    TEN: "Tennessee",
    TEX: "Texas",
    FLA: "Florida",
    TXAM: "Texas A&M",
    MIS: "Ole Miss",
    AUB: "Auburn",
    LSU: "LSU",
    UCONN: "UConn",
    UMASS: "UMass",
    ND: "Notre Dame",
    MSU: "Michigan State",
    ILL: "Illinois",
    UCLA: "UCLA",
    PUR: "Purdue",
    ORE: "Oregon",
    MIN: "Minnesota",
    WAS: "Washington",
    WIS: "Wisconsin",
    NW: "Northwestern",
    USC: "USC",
    NEB: "Nebraska",
    OSU: "Ohio State",
    IOW: "Iowa",
    RUT: "Rutgers",
    MICH: "Michigan",
    MAR: "Maryland",
    PSU: "Penn State",
    IU: "Indiana",
    TEP: "UTEP",
    LIB: "Liberty",
    KENN: "Kennesaw State",
    LT: "Louisiana Tech",
    SHS: "Sam Houston",
    FIU: "Florida International",
    MTS: "Middle Tennessee",
    JVS: "Jacksonville State",
    WKY: "Western Kentucky",
    NMS: "New Mexico State",
    GSO: "Georgia Southern",
    ULL: "Louisiana",
    GST: "Georgia State",
    ULM: "Louisiana-Monroe",
    CC: "Coastal Carolina",
    TRY: "Troy",
    MSH: "Marshall",
    USM: "Southern Miss",
    TXST: "Texas State",
    ARKS: "Arkansas State",
    JM: "James Madison",
    SAB: "South Alabama",
    ODU: "Old Dominion",
    APP: "Appalachian State",
    WST: "Washington State",
    ORS: "Oregon State",
    NTX: "North Texas",
    CHA: "Charlotte",
    RICE: "Rice",
    TUL: "Tulane",
    MEM: "Memphis",
    TSA: "Tulsa",
    NAV: "Navy",
    UTSA: "UTSA",
    TEM: "Temple",
    FAU: "Florida Atlantic",
    UAB: "UAB",
    ARM: "Army",
    ECU: "East Carolina",
    USF: "South Florida"
  },
  cityToCode: {
    "Arizona State": "ASU",
    "Kansas State": "KST",
    "Texas Tech": "TT",
    Utah: "UTH",
    Houston: "HOU",
    Cincinnati: "CIN",
    UCF: "UCF",
    BYU: "BYU",
    "West Virginia": "WVU",
    Baylor: "BAY",
    Arizona: "ARI",
    TCU: "TCU",
    Colorado: "COL",
    Kansas: "KAN",
    "Iowa State": "ISU",
    "Oklahoma State": "OKS",
    "New Mexico": "NM",
    "Colorado State": "CSU",
    Nevada: "NEV",
    "Boise State": "BOISE",
    "San Diego State": "SDSU",
    "Fresno State": "FRE",
    UNLV: "UNLV",
    "Hawai'i": "HAW",
    "Air Force": "AF",
    Wyoming: "WYO",
    "Utah State": "UTS",
    "San Jose State": "SJS",
    "North Carolina State": "NCST",
    "Florida State": "FSU",
    Louisville: "LOU",
    "Boston College": "BC",
    "Miami (FL)": "MFL",
    "Wake Forest": "WF",
    "Virginia Tech": "VT",
    "Georgia Tech": "GT",
    SMU: "SMU",
    Syracuse: "SYR",
    "North Carolina": "NC",
    Stanford: "STA",
    Virginia: "UVA",
    Clemson: "CLE",
    Pittsburgh: "PIT",
    Duke: "DUK",
    California: "CAL",
    "Central Michigan": "CMC",
    "Northern Illinois": "NIL",
    "Eastern Michigan": "EMC",
    "Miami (OH)": "MOH",
    "Bowling Green": "BGN",
    "Ball State": "BALL",
    Buffalo: "BUF",
    Toledo: "TOL",
    "Kent State": "KNT",
    Ohio: "OHI",
    Akron: "AKR",
    "Western Michigan": "WMC",
    Alabama: "BAMA",
    Oklahoma: "OKL",
    Georgia: "UGA",
    Arkansas: "ARK",
    Kentucky: "KEN",
    "Mississippi State": "MSST",
    Missouri: "MIZ",
    "South Carolina": "SC",
    Vanderbilt: "VAN",
    Tennessee: "TEN",
    Texas: "TEX",
    Florida: "FLA",
    "Texas A&M": "TXAM",
    "Ole Miss": "MIS",
    Auburn: "AUB",
    LSU: "LSU",
    UConn: "UCONN",
    UMass: "UMASS",
    "Notre Dame": "ND",
    "Michigan State": "MSU",
    Illinois: "ILL",
    UCLA: "UCLA",
    Purdue: "PUR",
    Oregon: "ORE",
    Minnesota: "MIN",
    Washington: "WAS",
    Wisconsin: "WIS",
    Northwestern: "NW",
    USC: "USC",
    Nebraska: "NEB",
    "Ohio State": "OSU",
    Iowa: "IOW",
    Rutgers: "RUT",
    Michigan: "MICH",
    Maryland: "MAR",
    "Penn State": "PSU",
    Indiana: "IU",
    UTEP: "TEP",
    Liberty: "LIB",
    "Kennesaw State": "KENN",
    "Louisiana Tech": "LT",
    "Sam Houston": "SHS",
    "Florida International": "FIU",
    "Middle Tennessee": "MTS",
    "Jacksonville State": "JVS",
    "Western Kentucky": "WKY",
    "New Mexico State": "NMS",
    "Georgia Southern": "GSO",
    Louisiana: "ULL",
    "Georgia State": "GST",
    "Louisiana-Monroe": "ULM",
    "Coastal Carolina": "CC",
    Troy: "TRY",
    Marshall: "MSH",
    "Southern Miss": "USM",
    "Texas State": "TXST",
    "Arkansas State": "ARKS",
    "James Madison": "JM",
    "South Alabama": "SAB",
    "Old Dominion": "ODU",
    "Appalachian State": "APP",
    "Washington State": "WST",
    "Oregon State": "ORS",
    "North Texas": "NTX",
    Charlotte: "CHA",
    Rice: "RICE",
    Tulane: "TUL",
    Memphis: "MEM",
    Tulsa: "TSA",
    Navy: "NAV",
    UTSA: "UTSA",
    Temple: "TEM",
    "Florida Atlantic": "FAU",
    UAB: "UAB",
    Army: "ARM",
    "East Carolina": "ECU",
    "South Florida": "USF"
  },
  codeToName: {
    ASU: "Sun Devils",
    KST: "Wildcats",
    TT: "Red Raiders",
    UTH: "Utes",
    HOU: "Cougars",
    CIN: "Bearcats",
    UCF: "Knights",
    BYU: "Cougars",
    WVU: "Mountaineers",
    BAY: "Bears",
    ARI: "Wildcats",
    TCU: "Horned Frogs",
    COL: "Buffaloes",
    KAN: "Jayhawks",
    ISU: "Cyclones",
    OKS: "Cowboys",
    NM: "Lobos",
    CSU: "Rams",
    NEV: "Wolf Pack",
    BOISE: "Broncos",
    SDSU: "Aztecs",
    FRE: "Bulldogs",
    UNLV: "Rebels",
    HAW: "Rainbow Warriors",
    AF: "Falcons",
    WYO: "Cowboys",
    UTS: "Aggies",
    SJS: "Spartans",
    NCST: "Wolfpack",
    FSU: "Seminoles",
    LOU: "Cardinals",
    BC: "Eagles",
    MFL: "Hurricanes",
    WF: "Demon Deacons",
    VT: "Hokies",
    GT: "Yellow Jackets",
    SMU: "Mustangs",
    SYR: "Orange",
    NC: "Tar Heels",
    STA: "Cardinal",
    UVA: "Cavaliers",
    CLE: "Tigers",
    PIT: "Panthers",
    DUK: "Blue Devils",
    CAL: "Golden Bears",
    CMC: "Chippewas",
    NIL: "Huskies",
    EMC: "Eagles",
    MOH: "RedHawks",
    BGN: "Falcons",
    BALL: "Cardinals",
    BUF: "Bulls",
    TOL: "Rockets",
    KNT: "Golden Flashes",
    OHI: "Bobcats",
    AKR: "Zips",
    WMC: "Broncos",
    BAMA: "Crimson Tide",
    OKL: "Sooners",
    UGA: "Bulldogs",
    ARK: "Razorbacks",
    KEN: "Wildcats",
    MSST: "Bulldogs",
    MIZ: "Tigers",
    SC: "Gamecocks",
    VAN: "Commodores",
    TEN: "Volunteers",
    TEX: "Longhorns",
    FLA: "Gators",
    TXAM: "Aggies",
    MIS: "Rebels",
    AUB: "Tigers",
    LSU: "Tigers",
    UCONN: "Huskies",
    UMASS: "Minutemen",
    ND: "Fighting Irish",
    MSU: "Spartans",
    ILL: "Fighting Illini",
    UCLA: "Bruins",
    PUR: "Boilermakers",
    ORE: "Ducks",
    MIN: "Golden Gophers",
    WAS: "Huskies",
    WIS: "Badgers",
    NW: "Wildcats",
    USC: "Trojans",
    NEB: "Cornhuskers",
    OSU: "Buckeyes",
    IOW: "Hawkeyes",
    RUT: "Scarlet Knights",
    MICH: "Wolverines",
    MAR: "Terrapins",
    PSU: "Nittany Lions",
    IU: "Hoosiers",
    TEP: "Miners",
    LIB: "Flames",
    KENN: "Owls",
    LT: "Bulldogs",
    SHS: "Bearkats",
    FIU: "Panthers",
    MTS: "Blue Raiders",
    JVS: "Gamecocks",
    WKY: "Hilltoppers",
    NMS: "Aggies",
    GSO: "Eagles",
    ULL: "Ragin' Cajuns",
    GST: "Panthers",
    ULM: "Warhawks",
    CC: "Chanticleers",
    TRY: "Trojans",
    MSH: "Thundering Herd",
    USM: "Golden Eagles",
    TXST: "Bobcats",
    ARKS: "Red Wolves",
    JM: "Dukes",
    SAB: "Jaguars",
    ODU: "Monarchs",
    APP: "Mountaineers",
    WST: "Cougars",
    ORS: "Beavers",
    NTX: "Mean Green",
    CHA: "49ers",
    RICE: "Owls",
    TUL: "Green Wave",
    MEM: "Tigers",
    TSA: "Golden Hurricane",
    NAV: "Midshipmen",
    UTSA: "Roadrunners",
    TEM: "Owls",
    FAU: "Owls",
    UAB: "Blazers",
    ARM: "Black Knights",
    ECU: "Pirates",
    USF: "Bulls"
  },
  colors: {
    light: {
      af: "rgba(0,53,148,1)",
      akr: "rgba(4,30,66,1)",
      app: "rgba(34,34,34,1)",
      ari: "rgba(171,6,32,1)",
      ark: "rgba(161,35,56,1)",
      arks: "rgba(203,9,47,1)",
      arm: "rgba(44,42,41,1)",
      asu: "rgba(125,34,72,1)",
      aub: "rgba(0,43,92,1)",
      ball: "rgba(186,13,47,1)",
      bama: "rgba(158,28,51,1)",
      bay: "rgba(21,71,52,1)",
      bc: "rgba(140,34,50,1)",
      bgn: "rgba(79,44,29,1)",
      boise: "rgba(0,51,160,1)",
      buf: "rgba(0,91,188,1)",
      byu: "rgba(0,61,165,1)",
      cal: "rgba(4,30,66,1)",
      cc: "rgba(0,111,113,1)",
      cha: "rgba(0,86,63,1)",
      cin: "rgba(0,0,0,1)",
      cle: "rgba(82,45,128,1)",
      cmc: "rgba(76,0,39,1)",
      col: "rgba(0,0,0,1)",
      csu: "rgba(30,77,43,1)",
      duk: "rgba(1,48,136,1)",
      ecu: "rgba(89,42,138,1)",
      emc: "rgba(0,105,56,1)",
      fau: "rgba(0,51,102,1)",
      fiu: "rgba(8,30,63,1)",
      fla: "rgba(1,48,135,1)",
      fre: "rgba(196,19,47,1)",
      fsu: "rgba(120,47,64,1)",
      gso: "rgba(4,30,66,1)",
      gst: "rgba(15,69,170,1)",
      gt: "rgba(0,48,87,1)",
      haw: "rgba(0,88,55,1)",
      hou: "rgba(200,17,46,1)",
      ill: "rgba(255,95,5,1)",
      iow: "rgba(0,0,0,1)",
      isu: "rgba(167,24,48,1)",
      iu: "rgba(153,0,0,1)",
      jm: "rgba(69,3,132,1)",
      jvs: "rgba(204,51,51,1)",
      kan: "rgba(0,81,186,1)",
      ken: "rgba(1,47,146,1)",
      kenn: "rgba(35,31,32,1)",
      knt: "rgba(1,57,118,1)",
      kst: "rgba(51,10,87,1)",
      lib: "rgba(10,37,78,1)",
      nav: "rgba(0,34,91,1)",
      lou: "rgba(173,0,0,1)",
      lsu: "rgba(70,29,124,1)",
      lt: "rgba(1,48,135,1)",
      mar: "rgba(206,16,45,1)",
      mem: "rgba(19,75,142,1)",
      mfl: "rgba(0,80,48,1)",
      mich: "rgba(0,39,76,1)",
      min: "rgba(91,0,19,1)",
      mis: "rgba(20,33,61,1)",
      miz: "rgba(0,0,0,1)",
      moh: "rgba(182,30,46,1)",
      msh: "rgba(35,31,32,1)",
      msst: "rgba(93,23,37,1)",
      msu: "rgba(28,69,59,1)",
      mts: "rgba(0,102,204,1)",
      nc: "rgba(22,40,76,1)",
      ncst: "rgba(203,0,0,1)",
      nd: "rgba(6,34,64,1)",
      neb: "rgba(208,0,0,1)",
      nev: "rgba(134,138,144,1)",
      nil: "rgba(199,0,1,1)",
      nm: "rgba(186,13,47,1)",
      nms: "rgba(145,45,41,1)",
      ntx: "rgba(0,133,62,1)",
      nw: "rgba(87,48,129,1)",
      odu: "rgba(8,33,54,1)",
      ohi: "rgba(21,71,52,1)",
      okl: "rgba(136,0,0,1)",
      oks: "rgba(35,31,32,1)",
      ore: "rgba(0,136,66,1)",
      ors: "rgba(218,72,38,1)",
      osu: "rgba(19,19,19,1)",
      pit: "rgba(0,53,148,1)",
      psu: "rgba(4,30,66,1)",
      pur: "rgba(0,0,0,1)",
      rice: "rgba(0,32,91,1)",
      rut: "rgba(206,17,44,1)",
      sab: "rgba(196,31,58,1)",
      sc: "rgba(115,0,10,1)",
      sdsu: "rgba(11,11,11,1)",
      shs: "rgba(246,100,36,1)",
      sjs: "rgba(1,56,166,1)",
      smu: "rgba(30,58,148,1)",
      sta: "rgba(140,20,21,1)",
      syr: "rgba(255,68,27,1)",
      tcu: "rgba(77,25,120,1)",
      tem: "rgba(152,30,50,1)",
      ten: "rgba(217,111,1,1)",
      tep: "rgba(230,117,1,1)",
      tex: "rgba(191,87,0,1)",
      tol: "rgba(10,34,64,1)",
      try: "rgba(144,0,40,1)",
      tsa: "rgba(0,53,149,1)",
      tt: "rgba(219,42,28,1)",
      tul: "rgba(64,143,225,1)",
      txam: "rgba(106,30,45,1)",
      txst: "rgba(80,18,20,1)",
      uab: "rgba(28,112,78,1)",
      ucf: "rgba(161,147,95,1)",
      ucla: "rgba(39,116,174,1)",
      uconn: "rgba(12,35,64,1)",
      uga: "rgba(203,0,0,1)",
      ull: "rgba(203,28,38,1)",
      ulm: "rgba(132,0,41,1)",
      umass: "rgba(136,28,27,1)",
      unlv: "rgba(206,0,0,1)",
      usc: "rgba(157,34,53,1)",
      usf: "rgba(0,103,71,1)",
      usm: "rgba(0,0,0,1)",
      uth: "rgba(190,0,0,1)",
      uts: "rgba(0,38,58,1)",
      utsa: "rgba(6,33,64,1)",
      uva: "rgba(248,77,31,1)",
      van: "rgba(0,0,0,1)",
      vt: "rgba(102,0,0,1)",
      was: "rgba(43,2,94,1)",
      wf: "rgba(21,21,21,1)",
      wis: "rgba(160,0,0,1)",
      wky: "rgba(176,30,36,1)",
      wmc: "rgba(83,46,31,1)",
      wst: "rgba(152,30,50,1)",
      wvu: "rgba(0,40,85,1)",
      wyo: "rgba(44,28,22,1)"
    },
    dark: {
      af: "rgba(64,104,175,1)",
      akr: "rgba(199,183,132,1)",
      app: "rgba(255,210,1,1)",
      ari: "rgba(188,56,77,1)",
      ark: "rgba(175,68,86,1)",
      arks: "rgba(203,9,47,1)",
      arm: "rgba(211,188,141,1)",
      asu: "rgba(255,198,39,1)",
      aub: "rgba(242,101,34,1)",
      ball: "rgba(196,48,78,1)",
      bama: "rgba(173,62,82,1)",
      bay: "rgba(68,108,93,1)",
      bc: "rgba(219,204,166,1)",
      bgn: "rgba(253,79,1,1)",
      boise: "rgba(214,67,9,1)",
      buf: "rgba(38,116,198,1)",
      byu: "rgba(51,100,183,1)",
      cal: "rgba(79,98,123,1)",
      cc: "rgba(0,111,113,1)",
      cha: "rgba(64,128,111,1)",
      cin: "rgba(224,1,34,1)",
      cle: "rgba(134,108,166,1)",
      cmc: "rgba(139,89,115,1)",
      col: "rgba(207,184,124,1)",
      csu: "rgba(98,130,107,1)",
      duk: "rgba(77,110,172,1)",
      ecu: "rgba(255,214,21,1)",
      emc: "rgba(38,128,86,1)",
      fau: "rgba(204,0,0,1)",
      fiu: "rgba(182,134,44,1)",
      fla: "rgba(250,70,22,1)",
      fre: "rgba(196,19,47,1)",
      fsu: "rgba(206,184,136,1)",
      gso: "rgba(169,146,96,1)",
      gst: "rgba(63,106,187,1)",
      gt: "rgba(179,163,105,1)",
      haw: "rgba(64,130,105,1)",
      hou: "rgba(200,17,46,1)",
      ill: "rgba(255,95,5,1)",
      iow: "rgba(255,210,1,1)",
      isu: "rgba(250,218,99,1)",
      iu: "rgba(179,64,64,1)",
      jm: "rgba(180,162,105,1)",
      jvs: "rgba(204,51,51,1)",
      kan: "rgba(255,200,45,1)",
      ken: "rgba(77,109,179,1)",
      kenn: "rgba(253,187,49,1)",
      knt: "rgba(239,171,0,1)",
      kst: "rgba(133,108,154,1)",
      lib: "rgba(108,124,149,1)",
      nav: "rgba(89,111,148,1)",
      lou: "rgba(253,185,19,1)",
      lsu: "rgba(253,208,34,1)",
      lt: "rgba(203,51,59,1)",
      mar: "rgba(206,16,45,1)",
      mem: "rgba(142,144,143,1)",
      mfl: "rgba(240,91,1,1)",
      mich: "rgba(245,195,0,1)",
      min: "rgba(255,204,51,1)",
      mis: "rgba(102,111,129,1)",
      miz: "rgba(241,184,44,1)",
      moh: "rgba(193,64,77,1)",
      msh: "rgba(1,175,67,1)",
      msst: "rgba(134,81,92,1)",
      msu: "rgba(96,125,118,1)",
      mts: "rgba(0,102,204,1)",
      nc: "rgba(123,175,212,1)",
      ncst: "rgba(203,0,0,1)",
      nd: "rgba(198,149,0,1)",
      neb: "rgba(208,0,0,1)",
      nev: "rgba(168,173,180,1)",
      nil: "rgba(199,0,1,1)",
      nm: "rgba(159,160,162,1)",
      nms: "rgba(162,77,73,1)",
      ntx: "rgba(0,133,62,1)",
      nw: "rgba(129,100,161,1)",
      odu: "rgba(161,209,241,1)",
      ohi: "rgba(91,126,113,1)",
      okl: "rgba(172,77,77,1)",
      oks: "rgba(255,102,1,1)",
      ore: "rgba(0,136,66,1)",
      ors: "rgba(218,72,38,1)",
      osu: "rgba(113,113,113,1)",
      pit: "rgba(64,104,175,1)",
      psu: "rgba(92,109,132,1)",
      pur: "rgba(211,190,149,1)",
      rice: "rgba(89,110,148,1)",
      rut: "rgba(206,17,44,1)",
      sab: "rgba(196,31,58,1)",
      sc: "rgba(157,77,84,1)",
      sdsu: "rgba(196,18,48,1)",
      shs: "rgba(246,100,36,1)",
      sjs: "rgba(255,184,26,1)",
      smu: "rgba(86,107,175,1)",
      sta: "rgba(169,79,80,1)",
      syr: "rgba(255,68,27,1)",
      tcu: "rgba(130,94,161,1)",
      tem: "rgba(183,98,112,1)",
      ten: "rgba(255,130,1,1)",
      tep: "rgba(255,130,1,1)",
      tex: "rgba(191,87,0,1)",
      tol: "rgba(96,111,131,1)",
      try: "rgba(179,181,184,1)",
      tsa: "rgba(64,104,176,1)",
      tt: "rgba(219,42,28,1)",
      tul: "rgba(64,143,225,1)",
      txam: "rgba(151,98,108,1)",
      txst: "rgba(140,115,74,1)",
      uab: "rgba(28,112,78,1)",
      ucf: "rgba(179,163,105,1)",
      ucla: "rgba(39,116,174,1)",
      uconn: "rgba(141,188,218,1)",
      uga: "rgba(203,0,0,1)",
      ull: "rgba(203,28,38,1)",
      ulm: "rgba(253,185,19,1)",
      umass: "rgba(172,96,95,1)",
      unlv: "rgba(206,0,0,1)",
      usc: "rgba(157,34,53,1)",
      usf: "rgba(207,196,147,1)",
      usm: "rgba(255,171,0,1)",
      uth: "rgba(210,77,77,1)",
      uts: "rgba(89,114,127,1)",
      utsa: "rgba(225,69,4,1)",
      uva: "rgba(248,77,31,1)",
      van: "rgba(185,153,80,1)",
      vt: "rgba(207,69,32,1)",
      was: "rgba(232,211,162,1)",
      wf: "rgba(206,184,136,1)",
      wis: "rgba(197,5,12,1)",
      wky: "rgba(196,86,91,1)",
      wmc: "rgba(181,161,103,1)",
      wst: "rgba(183,98,112,1)",
      wvu: "rgba(77,105,136,1)",
      wyo: "rgba(255,196,37,1)"
    },
  },
};
const AFL_TEAMS = {
  logoCodeAliases: {},
  codeToCity: {
    ADE: "Adelaide Crows",
    BRI: "Brisbane Lions",
    CFC: "Carlton Blues",
    COL: "Collingwood Magpies",
    ESS: "Essendon Bombers",
    FRE: "Fremantle Dockers",
    GEE: "Geelong Cats",
    GCS: "Gold Coast Suns",
    GWS: "GWS Giants",
    HAW: "Hawthorn Hawks",
    MEL: "Melbourne Demons",
    NMK: "North Melbourne Kangaroos",
    PAP: "Port Adelaide Power",
    RIC: "Richmond Tigers",
    SKS: "St Kilda Saints",
    SYD: "Sydney Swans",
    WCE: "West Coast Eagles",
    BUL: "Western Bulldogs"
  },
  cityToCode: {
    "Adelaide Crows": "ADE",
    "Brisbane Lions": "BRI",
    "Carlton Blues": "CFC",
    "Collingwood Magpies": "COL",
    "Essendon Bombers": "ESS",
    "Fremantle Dockers": "FRE",
    "Geelong Cats": "GEE",
    "Gold Coast Suns": "GCS",
    "GWS Giants": "GWS",
    "Hawthorn Hawks": "HAW",
    "Melbourne Demons": "MEL",
    "North Melbourne Kangaroos": "NMK",
    "Port Adelaide Power": "PAP",
    "Richmond Tigers": "RIC",
    "St Kilda Saints": "SKS",
    "Sydney Swans": "SYD",
    "West Coast Eagles": "WCE",
    "Western Bulldogs": "BUL"
  },
  codeToName: {
    ADE: "Adelaide Crows",
    BRI: "Brisbane Lions",
    CFC: "Carlton Blues",
    COL: "Collingwood Magpies",
    ESS: "Essendon Bombers",
    FRE: "Fremantle Dockers",
    GEE: "Geelong Cats",
    GCS: "Gold Coast Suns",
    GWS: "GWS Giants",
    HAW: "Hawthorn Hawks",
    MEL: "Melbourne Demons",
    NMK: "North Melbourne Kangaroos",
    PAP: "Port Adelaide Power",
    RIC: "Richmond Tigers",
    SKS: "St Kilda Saints",
    SYD: "Sydney Swans",
    WCE: "West Coast Eagles",
    BUL: "Western Bulldogs"
  },
  colors: {
    light: {
      ade: "rgba(15, 20, 50, 1)",
      bri: "rgba(139, 0, 66, 1)",
      bul: "rgba(0, 57, 166, 1)",
      car: "rgba(0, 30, 47, 1)",
      col: "rgba(165, 147, 97, 1)",
      ess: "rgba(204, 32, 49, 1)",
      fre: "rgba(42, 13, 84, 1)",
      gee: "rgba(0, 43, 92, 1)",
      gcs: "rgba(187, 0, 0, 1)",
      gws: "rgba(27,34,40,1)",
      haw: "rgba(77, 32, 4, 1)",
      mel: "rgba(8, 26, 51, 1)",
      nor: "rgba(0, 60, 160, 1)",
      por: "rgba(0, 138, 171, 1)",
      ric: "rgba(0, 0, 0, 1)",
      stk: "rgba(237, 27, 47, 1)",
      syd: "rgba(0, 0, 0, 1)",
      wce: "rgba(3, 48, 135, 1)",
      sks: "rgba(0, 0, 0, 1)",
      pap: "rgba(0, 0, 0, 1)",
      nmk: "rgba(3, 61, 160, 1)",
      cfc: "rgba(140, 143, 144, 1)"
    },
    dark: {
      ade: "rgba(99, 102, 122, 1)",
      bri: "rgba(174, 77, 123, 1)",
      bul: "rgba(51, 97, 184, 1)",
      car: "rgba(102, 120, 130, 1)",
      col: "rgba(165, 147, 97, 1)",
      ess: "rgba(204, 32, 49, 1)",
      fre: "rgba(117, 98, 144, 1)",
      gee: "rgba(89, 117, 149, 1)",
      gcs: "rgba(204, 64, 64, 1)",
      gws: "rgba(118,122,126,1)",
      haw: "rgba(251, 191, 21, 1)",
      mel: "rgba(204, 32, 49, 1)",
      nor: "rgba(77, 119, 189, 1)",
      por: "rgba(0, 138, 171, 1)",
      ric: "rgba(255, 210, 0, 1)",
      stk: "rgba(237, 27, 47, 1)",
      syd: "rgba(237, 27, 47, 1)",
      wce: "rgba(242, 169, 0, 1)",
      sks: "rgba(237, 27, 47, 1)",
      pap: "rgba(0, 138, 171, 1)",
      nmk: "rgba(66, 110, 184, 1)",
      cfc: "rgba(187, 191, 192, 1)"
    },
  },
};
const NRL_TEAMS = {
  logoCodeAliases: {},
  codeToCity: {
    CBY: "Canterbury-Bankstown Bulldogs",
    MEL: "Melbourne Storm",
    CAN: "Canberra Raiders",
    NZW: "New Zealand Warriors",
    BRI: "Brisbane Broncos",
    CRO: "Cronulla-Sutherland Sharks",
    STG: "St. George Illawarra Dragons",
    SOU: "South Sydney Rabbitohs",
    NQC: "North Queensland Cowboys",
    DOL: "Dolphins",
    MAN: "Manly-Warringah Sea Eagles",
    WST: "Wests Tigers",
    GCT: "Gold Coast Titans",
    NEW: "Newcastle Knights",
    PEN: "Penrith Panthers",
    SYD: "Sydney Roosters",
    PAR: "Parramatta Eels"
  },
  cityToCode: {
    "Canterbury-Bankstown Bulldogs": "CBY",
    "Melbourne Storm": "MEL",
    "Canberra Raiders": "CAN",
    "New Zealand Warriors": "NZW",
    "Brisbane Broncos": "BRI",
    "Cronulla-Sutherland Sharks": "CRO",
    "St. George Illawarra Dragons": "STG",
    "South Sydney Rabbitohs": "SOU",
    "North Queensland Cowboys": "NQC",
    Dolphins: "DOL",
    "Manly-Warringah Sea Eagles": "MAN",
    "Wests Tigers": "WST",
    "Gold Coast Titans": "GCT",
    "Newcastle Knights": "NEW",
    "Penrith Panthers": "PEN",
    "Sydney Roosters": "SYD",
    "Parramatta Eels": "PAR"
  },
  codeToName: {
    CBY: "Canterbury-Bankstown Bulldogs",
    MEL: "Melbourne Storm",
    CAN: "Canberra Raiders",
    NZW: "New Zealand Warriors",
    BRI: "Brisbane Broncos",
    CRO: "Cronulla-Sutherland Sharks",
    STG: "St. George Illawarra Dragons",
    SOU: "South Sydney Rabbitohs",
    NQC: "North Queensland Cowboys",
    DOL: "Dolphins",
    MAN: "Manly-Warringah Sea Eagles",
    WST: "Wests Tigers",
    GCT: "Gold Coast Titans",
    NEW: "Newcastle Knights",
    PEN: "Penrith Panthers",
    SYD: "Sydney Roosters",
    PAR: "Parramatta Eels"
  },
  colors: {
    light: {
      bri: "rgba(108,29,68,1)",
      cby: "rgba(3,70,139,1)",
      can: "rgba(3,40,86,1)",
      cro: "rgba(30,126,178,1)",
      dol: "rgba(224,17,26,1)",
      gct: "rgba(4,125,176,1)",
      man: "rgba(108,29,68,1)",
      mel: "rgba(89,43,140,1)",
      new: "rgba(3,58,115,1)",
      nqc: "rgba(11,35,64,1)",
      par: "rgba(3,45,114,1)",
      pen: "rgba(44,46,48,1)",
      stg: "rgba(205,35,44,1)",
      sou: "rgba(220,54,69,1)",
      syd: "rgba(11,45,91,1)",
      wst: "rgba(38,38,38,1)",
      nzw: "rgba(21,31,109,1)"
    },
    dark: {
      bri: "rgba(152,97,125,1)",
      cby: "rgba(66,116,168,1)",
      can: "rgba(54,173,45,1)",
      cro: "rgba(30,126,178,1)",
      dol: "rgba(224,17,26,1)",
      gct: "rgba(4,125,176,1)",
      man: "rgba(145,86,115,1)",
      mel: "rgba(131,96,169,1)",
      new: "rgba(209,38,47,1)",
      nqc: "rgba(84,101,121,1)",
      par: "rgba(251,184,27,1)",
      pen: "rgba(204,204,204,1)",
      stg: "rgba(205,35,44,1)",
      sou: "rgba(220,54,69,1)",
      syd: "rgba(231,44,41,1)",
      wst: "rgba(246,112,17,1)",
      nzw: "rgba(0,132,61,1)"
    },
  },
};
const NHL_TEAMS = {
  logoCodeAliases: {},
  codeToCity: {
    ANA: "Anaheim",
    ARI: "Arizona",
    BOS: "Boston",
    BUF: "Buffalo",
    CGY: "Calgary",
    CAR: "Carolina",
    CHI: "Chicago",
    COL: "Colorado",
    CBJ: "Columbus",
    DAL: "Dallas",
    DET: "Detroit",
    EDM: "Edmonton",
    FLO: "Florida",
    LAK: "Los Angeles",
    MIN: "Minnesota",
    MTL: "Montreal",
    NSH: "Nashville",
    NJD: "New Jersey",
    NYI: "New York I.",
    NYR: "New York R.",
    OTT: "Ottawa",
    PHI: "Philadelphia",
    PIT: "Pittsburgh",
    SJS: "San Jose",
    SEA: "Seattle",
    STL: "St. Louis",
    TBL: "Tampa Bay",
    TOR: "Toronto",
    VAN: "Vancouver",
    VGK: "Vegas",
    WSH: "Washington",
    WPJ: "Winnipeg",
    UTA: "Utah"
  },
  cityToCode: {
    Anaheim: "ANA",
    Arizona: "ARI",
    Boston: "BOS",
    Buffalo: "BUF",
    Calgary: "CGY",
    Carolina: "CAR",
    Chicago: "CHI",
    Colorado: "COL",
    Columbus: "CBJ",
    Dallas: "DAL",
    Detroit: "DET",
    Edmonton: "EDM",
    Florida: "FLO",
    "Los Angeles": "LAK",
    Minnesota: "MIN",
    Montreal: "MTL",
    Nashville: "NSH",
    "New Jersey": "NJD",
    "New York I.": "NYI",
    "New York R.": "NYR",
    Ottawa: "OTT",
    Philadelphia: "PHI",
    Pittsburgh: "PIT",
    "San Jose": "SJS",
    Seattle: "SEA",
    "St. Louis": "STL",
    "Tampa Bay": "TBL",
    Toronto: "TOR",
    Vancouver: "VAN",
    Vegas: "VGK",
    Washington: "WSH",
    Winnipeg: "WPJ",
    Utah: "UTA"
  },
  codeToName: {
    ANA: "Ducks",
    ARI: "Coyotes",
    BOS: "Bruins",
    BUF: "Sabres",
    CGY: "Flames",
    CAR: "Hurricanes",
    CHI: "Blackhawks",
    COL: "Avalanche",
    CBJ: "Blue Jackets",
    DAL: "Stars",
    DET: "Red Wings",
    EDM: "Oilers",
    FLO: "Panthers",
    LAK: "Kings",
    MIN: "Wild",
    MTL: "Canadiens",
    NSH: "Predators",
    NJD: "Devils",
    NYI: "Islanders",
    NYR: "Rangers",
    OTT: "Senators",
    PHI: "Flyers",
    PIT: "Penguins",
    SJS: "Sharks",
    SEA: "Kraken",
    STL: "Blues",
    TBL: "Lightning",
    TOR: "Maple Leafs",
    VAN: "Canucks",
    VGK: "Golden Knights",
    WSH: "Capitals",
    WPJ: "Jets",
    UTA: "Utah Hockey Club"
  },
  colors: {
    light: {
      ana: "rgba(207,69,33,1)",
      ari: "rgba(140,38,51,1)",
      bos: "rgba(255,184,28,1)",
      buf: "rgba(0,48,135,1)",
      car: "rgba(204,0,0,1)",
      cbj: "rgba(0,38,84,1)",
      cgy: "rgba(210,0,28,1)",
      chi: "rgba(207,10,44,1)",
      col: "rgba(111,38,61,1)",
      dal: "rgba(0,104,71,1)",
      det: "rgba(206,17,38,1)",
      edm: "rgba(4,30,66,1)",
      flo: "rgba(200,16,46,1)",
      lak: "rgba(138,149,153,1)",
      min: "rgba(21,71,52,1)",
      mtl: "rgba(175,30,45,1)",
      njd: "rgba(206,17,38,1)",
      nsh: "rgba(255,184,28,1)",
      nyi: "rgba(0,83,155,1)",
      nyr: "rgba(0,56,168,1)",
      ott: "rgba(197,32,50,1)",
      phi: "rgba(247,73,2,1)",
      pit: "rgba(252,181,20,1)",
      sea: "rgba(99,159,182,1)",
      sjs: "rgba(3,108,138,1)",
      stl: "rgba(3,112,186,1)",
      tbl: "rgba(0,40,104,1)",
      tor: "rgba(0,32,91,1)",
      van: "rgba(0,32,91,1)",
      vgk: "rgba(180,151,90,1)",
      wpj: "rgba(4,30,66,1)",
      wsh: "rgba(200,16,46,1)",
      uta: "rgba(1,1,1,1)"
    },
    dark: {
      ana: "rgba(207,69,33,1)",
      ari: "rgba(204,73,81,1)",
      bos: "rgba(255,197,34,1)",
      buf: "rgba(108,127,192,1)",
      car: "rgba(228,32,12,1)",
      cbj: "rgba(106,131,170,1)",
      cgy: "rgba(241,34,42,1)",
      chi: "rgba(238,37,57,1)",
      col: "rgba(213,78,102,1)",
      dal: "rgba(15,136,99,1)",
      det: "rgba(237,41,53,1)",
      edm: "rgba(102,122,156,1)",
      flo: "rgba(231,39,61,1)",
      lak: "rgba(138,149,153,1)",
      min: "rgba(44,143,117,1)",
      mtl: "rgba(222,55,69,1)",
      njd: "rgba(237,41,53,1)",
      nsh: "rgba(255,197,34,1)",
      nyi: "rgba(0,132,209,1)",
      nyr: "rgba(109,128,209,1)",
      ott: "rgba(228,49,65,1)",
      phi: "rgba(255,77,7,1)",
      pit: "rgba(252,196,27,1)",
      sea: "rgba(124,178,199,1)",
      sjs: "rgba(3,108,138,1)",
      stl: "rgba(3,112,186,1)",
      tbl: "rgba(111,134,186,1)",
      tor: "rgba(111,134,186,1)",
      van: "rgba(107,126,175,1)",
      vgk: "rgba(203,173,95,1)",
      wpj: "rgba(102,122,156,1)",
      wsh: "rgba(231,39,61,1)",
      uta: "rgba(108,172,228,1)"
    },
  },
};
const FIFA_WORLD_CUP_TEAMS = {
  logoCodeAliases: {},
  codeToCity: {
    ALG: "Algeria",
    ARG: "Argentina",
    AUS: "Australia",
    AUT: "Austria",
    BEL: "Belgium",
    BIH: "Bosnia and Herzegovina",
    BRA: "Brazil",
    CAN: "Canada",
    COD: "Congo DR",
    CIV: "Cote d'Ivoire",
    COL: "Colombia",
    CPV: "Cape Verde",
    CRO: "Croatia",
    CUW: "Curacao",
    CZE: "Czech Republic",
    ECU: "Ecuador",
    EGY: "Egypt",
    ENG: "England",
    ESP: "Spain",
    FRA: "France",
    GER: "Germany",
    GHA: "Ghana",
    HAI: "Haiti",
    IRN: "Iran",
    IRQ: "Iraq",
    JOR: "Jordan",
    JPN: "Japan",
    KOR: "South Korea",
    KSA: "Saudi Arabia",
    MAR: "Morocco",
    MEX: "Mexico",
    NED: "Netherlands",
    NOR: "Norway",
    NZL: "New Zealand",
    PAN: "Panama",
    PAR: "Paraguay",
    POR: "Portugal",
    QAT: "Qatar",
    RSA: "South Africa",
    SCO: "Scotland",
    SEN: "Senegal",
    SUI: "Switzerland",
    SWE: "Sweden",
    TUN: "Tunisia",
    TUR: "Turkey",
    URU: "Uruguay",
    USA: "United States",
    UZB: "Uzbekistan"
  },
  cityToCode: {
    Algeria: "ALG",
    Argentina: "ARG",
    Australia: "AUS",
    Austria: "AUT",
    Belgium: "BEL",
    "Bosnia and Herzegovina": "BIH",
    Brazil: "BRA",
    Canada: "CAN",
    "Cape Verde": "CPV",
    Colombia: "COL",
    "Congo DR": "COD",
    Croatia: "CRO",
    Curacao: "CUW",
    Czechia: "CZE",
    Ecuador: "ECU",
    Egypt: "EGY",
    England: "ENG",
    France: "FRA",
    Germany: "GER",
    Ghana: "GHA",
    Haiti: "HAI",
    "IR Iran": "IRN",
    Iraq: "IRQ",
    "Ivory Coast": "CIV",
    Japan: "JPN",
    Jordan: "JOR",
    "Korea Republic": "KOR",
    Mexico: "MEX",
    Morocco: "MAR",
    Netherlands: "NED",
    "New Zealand": "NZL",
    Norway: "NOR",
    Panama: "PAN",
    Paraguay: "PAR",
    Portugal: "POR",
    Qatar: "QAT",
    "Saudi Arabia": "KSA",
    Scotland: "SCO",
    Senegal: "SEN",
    "South Africa": "RSA",
    Spain: "ESP",
    Sweden: "SWE",
    Switzerland: "SUI",
    Tunisia: "TUN",
    Turkiye: "TUR",
    Uruguay: "URU",
    USA: "USA",
    Uzbekistan: "UZB"
  },
  codeToName: {
    ALG: "Algeria",
    ARG: "Argentina",
    AUS: "Australia",
    AUT: "Austria",
    BEL: "Belgium",
    BIH: "Bosnia and Herzegovina",
    BRA: "Brazil",
    CAN: "Canada",
    COD: "Congo DR",
    CIV: "Cote d'Ivoire",
    COL: "Colombia",
    CPV: "Cape Verde",
    CRO: "Croatia",
    CUW: "Curacao",
    CZE: "Czech Republic",
    ECU: "Ecuador",
    EGY: "Egypt",
    ENG: "England",
    ESP: "Spain",
    FRA: "France",
    GER: "Germany",
    GHA: "Ghana",
    HAI: "Haiti",
    IRN: "Iran",
    IRQ: "Iraq",
    JOR: "Jordan",
    JPN: "Japan",
    KOR: "South Korea",
    KSA: "Saudi Arabia",
    MAR: "Morocco",
    MEX: "Mexico",
    NED: "Netherlands",
    NOR: "Norway",
    NZL: "New Zealand",
    PAN: "Panama",
    PAR: "Paraguay",
    POR: "Portugal",
    QAT: "Qatar",
    RSA: "South Africa",
    SCO: "Scotland",
    SEN: "Senegal",
    SUI: "Switzerland",
    SWE: "Sweden",
    TUN: "Tunisia",
    TUR: "Turkey",
    URU: "Uruguay",
    USA: "United States",
    UZB: "Uzbekistan"
  },
  colors: {
    light: {
      alg: "rgba(0,102,51,1)",
      arg: "rgba(23,62,105,1)",
      aus: "rgba(0,132,61,1)",
      aut: "rgba(239,51,64,1)",
      bel: "rgba(227,6,19,1)",
      bih: "rgba(0,47,108,1)",
      bra: "rgba(24,165,67,1)",
      can: "rgba(197,40,28,1)",
      cgo: "rgba(0,133,202,1)",
      civ: "rgba(0,154,68,1)",
      col: "rgba(0,48,135,1)",
      cpv: "rgba(0,61,165,1)",
      cro: "rgba(237,28,36,1)",
      cuw: "rgba(0,43,127,1)",
      cze: "rgba(215,20,26,1)",
      ecu: "rgba(0,114,206,1)",
      egy: "rgba(200,16,46,1)",
      eng: "rgba(0,0,64,1)",
      esp: "rgba(139,13,17,1)",
      fra: "rgba(33,48,77,1)",
      ger: "rgba(0,0,0,1)",
      gha: "rgba(212,0,35,1)",
      hai: "rgba(0,32,159,1)",
      irn: "rgba(35,159,64,1)",
      irq: "rgba(0,122,61,1)",
      jor: "rgba(206,17,38,1)",
      jpn: "rgba(0,5,85,1)",
      kor: "rgba(236,15,50,1)",
      ksa: "rgba(18,91,52,1)",
      league: "rgba(49,78,255,1)",
      mar: "rgba(23,163,118,1)",
      mex: "rgba(0,147,59,1)",
      ned: "rgba(231,103,31,1)",
      nor: "rgba(186,12,47,1)",
      nzl: "rgba(0,0,0,1)",
      pan: "rgba(218,18,26,1)",
      par: "rgba(0,56,168,1)",
      por: "rgba(228,37,24,1)",
      qat: "rgba(127,20,49,1)",
      rsa: "rgba(0,119,73,1)",
      sco: "rgba(0,94,184,1)",
      sen: "rgba(17,163,53,1)",
      sui: "rgba(255,0,0,1)",
      swe: "rgba(0,106,167,1)",
      tun: "rgba(200,16,46,1)",
      tur: "rgba(200,16,46,1)",
      uru: "rgba(72,154,195,1)",
      usa: "rgba(187,37,51,1)",
      uzb: "rgba(0,114,206,1)"
    },
    dark: {
      alg: "rgba(25,117,71,1)",
      arg: "rgba(67,161,213,1)",
      aus: "rgba(0,132,61,1)",
      aut: "rgba(239,51,64,1)",
      bel: "rgba(227,6,19,1)",
      bih: "rgba(255,205,0,1)",
      bra: "rgba(255,220,2,1)",
      can: "rgba(197,40,28,1)",
      cgo: "rgba(0,133,202,1)",
      civ: "rgba(255,130,0,1)",
      col: "rgba(255,205,0,1)",
      cpv: "rgba(64,110,188,1)",
      cro: "rgba(237,28,36,1)",
      cuw: "rgba(77,107,165,1)",
      cze: "rgba(215,20,26,1)",
      ecu: "rgba(255,209,0,1)",
      egy: "rgba(200,16,46,1)",
      eng: "rgba(234,31,41,1)",
      esp: "rgba(252,181,7,1)",
      fra: "rgba(237,41,57,1)",
      ger: "rgba(176,165,95,1)",
      gha: "rgba(255,229,0,1)",
      hai: "rgba(210,16,52,1)",
      irn: "rgba(35,159,64,1)",
      irq: "rgba(0,122,61,1)",
      jor: "rgba(206,17,38,1)",
      jpn: "rgba(227,0,22,1)",
      kor: "rgba(236,15,50,1)",
      ksa: "rgba(54,116,82,1)",
      league: "rgba(49,78,255,1)",
      mar: "rgba(23,163,118,1)",
      mex: "rgba(0,147,59,1)",
      ned: "rgba(243,108,33,1)",
      nor: "rgba(193,36,68,1)",
      nzl: "rgba(102,102,102,1)",
      pan: "rgba(218,18,26,1)",
      par: "rgba(213,43,30,1)",
      por: "rgba(228,37,24,1)",
      qat: "rgba(165,91,111,1)",
      rsa: "rgba(0,119,73,1)",
      sco: "rgba(25,110,191,1)",
      sen: "rgba(17,163,53,1)",
      sui: "rgba(255,0,0,1)",
      swe: "rgba(254,204,2,1)",
      tun: "rgba(200,16,46,1)",
      tur: "rgba(200,16,46,1)",
      uru: "rgba(85,181,229,1)",
      usa: "rgba(187,37,51,1)",
      uzb: "rgba(0,114,206,1)"
    },
  },
};
const BRAZIL_SERIE_A_TEAMS = {
  logoCodeAliases: {},
  codeToCity: {
    ATL: "Atletico Mineiro MG",
    BAH: "EC Bahia BA",
    BOT: "Botafogo FR RJ",
    BRA: "Red Bull Bragantino SP",
    CAP: "CA Paranaense PR",
    CBA: "Coritiba",
    CHA: "Chapecoense",
    COR: "SC Corinthians SP",
    CRI: "Criciuma EC SC",
    CRU: "Cruzeiro EC MG",
    CUI: "Cuiaba Esporte Clube MT",
    FLA: "CR Flamengo RJ",
    FLU: "Fluminense FC RJ",
    FOR: "Fortaleza EC CE",
    GOI: "AC Goianiense GO",
    GPA: "Gremio FB Porto Alegrense RS",
    INT: "SC Internacional RS",
    JUV: "EC Juventude RS",
    PAL: "SE Palmeiras SP",
    SPA: "Sao Paulo FC SP",
    VDG: "CR Vasco da Gama RJ",
    VIT: "EC Vitoria BA",
    CEA: "Ceara SC CE",
    MIR: "Mirassol FC SP",
    REC: "SC Recife PE",
    REM: "Remo",
    SAN: "Santos FC SP"
  },
  cityToCode: {
    "Atletico Mineiro MG": "ATL",
    "EC Bahia BA": "BAH",
    "Botafogo FR RJ": "BOT",
    "Red Bull Bragantino SP": "BRA",
    "CA Paranaense PR": "CAP",
    Coritiba: "CBA",
    Chapecoense: "CHA",
    "SC Corinthians SP": "COR",
    "Criciuma EC SC": "CRI",
    "Cruzeiro EC MG": "CRU",
    "Cuiaba Esporte Clube MT": "CUI",
    "CR Flamengo RJ": "FLA",
    "Fluminense FC RJ": "FLU",
    "Fortaleza EC CE": "FOR",
    "AC Goianiense GO": "GOI",
    "Gremio FB Porto Alegrense RS": "GPA",
    "SC Internacional RS": "INT",
    "EC Juventude RS": "JUV",
    "SE Palmeiras SP": "PAL",
    "Sao Paulo FC SP": "SPA",
    "CR Vasco da Gama RJ": "VDG",
    "EC Vitoria BA": "VIT",
    "Ceara SC CE": "CEA",
    "Mirassol FC SP": "MIR",
    "SC Recife PE": "REC",
    Remo: "REM",
    "Santos FC SP": "SAN"
  },
  codeToName: {
    ATL: "Atletico Mineiro MG",
    BAH: "EC Bahia BA",
    BOT: "Botafogo FR RJ",
    BRA: "Red Bull Bragantino SP",
    CAP: "CA Paranaense PR",
    CBA: "Coritiba",
    CHA: "Chapecoense",
    COR: "SC Corinthians SP",
    CRI: "Criciuma EC SC",
    CRU: "Cruzeiro EC MG",
    CUI: "Cuiaba Esporte Clube MT",
    FLA: "CR Flamengo RJ",
    FLU: "Fluminense FC RJ",
    FOR: "Fortaleza EC CE",
    GOI: "AC Goianiense GO",
    GPA: "Gremio FB Porto Alegrense RS",
    INT: "SC Internacional RS",
    JUV: "EC Juventude RS",
    PAL: "SE Palmeiras SP",
    SPA: "Sao Paulo FC SP",
    VDG: "CR Vasco da Gama RJ",
    VIT: "EC Vitoria BA",
    CEA: "Ceara SC CE",
    MIR: "Mirassol FC SP",
    REC: "SC Recife PE",
    REM: "Remo",
    SAN: "Santos FC SP"
  },
  colors: {
    light: {
      atl: "rgba(0,0,0,1)",
      bah: "rgba(39,98,166,1)",
      bot: "rgba(0,0,0,1)",
      bra: "rgba(228,19,73,1)",
      cap: "rgba(206,24,30,1)",
      cba: "rgba(0,84,77,1)",
      cha: "rgba(27,85,42,1)",
      cor: "rgba(0,0,0,1)",
      cri: "rgba(172,146,4,1)",
      cru: "rgba(30,61,142,1)",
      cui: "rgba(1,90,40,1)",
      fla: "rgba(195,40,30,1)",
      flu: "rgba(135,10,40,1)",
      for: "rgba(40,97,166,1)",
      goi: "rgba(220,18,18,1)",
      gpa: "rgba(14,147,210,1)",
      juv: "rgba(0,134,57,1)",
      int: "rgba(229,5,15,1)",
      pal: "rgba(0,100,55,1)",
      spa: "rgba(237,28,36,1)",
      vdg: "rgba(0,0,0,1)",
      vit: "rgba(224,12,2,1)",
      cea: "rgba(0,0,0,1)",
      mir: "rgba(18,111,61,1)",
      rec: "rgba(204,0,26,1)",
      rem: "rgba(15,20,31,1)",
      san: "rgba(0,0,0,1)"
    },
    dark: {
      atl: "rgba(102,102,102,1)",
      bah: "rgba(39,98,166,1)",
      bot: "rgba(102,102,102,1)",
      bra: "rgba(228,19,73,1)",
      cap: "rgba(206,24,30,1)",
      cba: "rgba(64,127,122,1)",
      cha: "rgba(84,128,95,1)",
      cor: "rgba(102,102,102,1)",
      cri: "rgba(245,208,6,1)",
      cru: "rgba(75,100,165,1)",
      cui: "rgba(52,123,83,1)",
      fla: "rgba(195,40,30,1)",
      flu: "rgba(159,59,83,1)",
      for: "rgba(40,97,166,1)",
      goi: "rgba(220,18,18,1)",
      gpa: "rgba(14,147,210,1)",
      juv: "rgba(0,134,57,1)",
      int: "rgba(229,5,15,1)",
      pal: "rgba(38,123,85,1)",
      spa: "rgba(237,28,36,1)",
      vdg: "rgba(102,102,102,1)",
      vit: "rgba(224,12,2,1)",
      cea: "rgba(102,102,102,1)",
      mir: "rgba(243,236,10,1)",
      rec: "rgba(255,217,0,1)",
      rem: "rgba(99,102,109,1)",
      san: "rgba(198,159,15,1)"
    },
  },
};
const MLS_TEAMS = {
  logoCodeAliases: {},
  codeToCity: {
    ATL: "Atlanta",
    ATX: "Austin",
    CHA: "Charlotte",
    CHI: "Chicago",
    CIN: "Cincinnati",
    CLB: "Columbus",
    COL: "Colorado",
    DAL: "Dallas",
    DC: "DC",
    HOU: "Houston",
    LAG: "Los Angeles G",
    LAN: "Los Angeles FC",
    MIA: "Miami",
    MIN: "Minnesota",
    MON: "Montreal",
    NE: "New England",
    NSC: "Nashville",
    NY: "New York RB",
    NYC: "New York FC",
    ORL: "Orlando",
    PHI: "Philadelphia",
    POR: "Portland",
    RSL: "Salt Lake",
    SAI: "Saint Louis",
    SEA: "Seattle",
    SJ: "San Jose",
    SKC: "Kansas City",
    TOR: "Toronto",
    VAN: "Vancouver",
    SAN: "San Diego"
  },
  cityToCode: {
    Atlanta: "ATL",
    Austin: "ATX",
    Charlotte: "CHA",
    Chicago: "CHI",
    Cincinnati: "CIN",
    Columbus: "CLB",
    Colorado: "COL",
    Dallas: "DAL",
    DC: "DC",
    Houston: "HOU",
    "Los Angeles G": "LAG",
    "Los Angeles FC": "LAN",
    Miami: "MIA",
    Minnesota: "MIN",
    Montreal: "MON",
    "New England": "NE",
    Nashville: "NSC",
    "New York RB": "NY",
    "New York FC": "NYC",
    Orlando: "ORL",
    Philadelphia: "PHI",
    Portland: "POR",
    "Salt Lake": "RSL",
    "Saint Louis": "SAI",
    Seattle: "SEA",
    "San Jose": "SJ",
    "Kansas City": "SKC",
    Toronto: "TOR",
    Vancouver: "VAN",
    "San Diego": "SAN"
  },
  codeToName: {
    ATL: "Atlanta United FC",
    ATX: "Austin FC",
    CHA: "Charlotte FC",
    CHI: "Chicago Fire",
    CIN: "FC Cincinnati",
    CLB: "Columbus Crew",
    COL: "Colorado Rapids",
    DAL: "FC Dallas",
    DC: "DC United",
    HOU: "Houston Dynamo",
    LAG: "Los Angeles Galaxy",
    LAN: "Los Angeles FC",
    MIA: "Inter Miami CF",
    MIN: "Minnesota United FC",
    MON: "CF Montreal",
    NE: "New England Revolution",
    NSC: "Nashville SC",
    NY: "New York Red Bulls",
    NYC: "New York City FC",
    ORL: "Orlando City SC",
    PHI: "Philadelphia Union",
    POR: "Portland Timbers",
    RSL: "Real Salt Lake",
    SAI: "Saint Louis City SC",
    SEA: "Seattle Sounders",
    SJ: "San Jose Earthquakes",
    SKC: "Sporting Kansas City",
    TOR: "Toronto FC",
    VAN: "Vancouver Whitecaps FC",
    SAN: "San Diego FC"
  },
  colors: {
    light: {
      atl: "rgba(128,0,10,1)",
      atx: "rgba(0,177,64,1)",
      cha: "rgba(26,133,200,1)",
      chi: "rgba(255,0,0,1)",
      cin: "rgba(240,83,35,1)",
      clb: "rgba(254,221,0,1)",
      col: "rgba(150,10,44,1)",
      dal: "rgba(232,31,62,1)",
      dc: "rgba(239,62,66,1)",
      hou: "rgba(255,107,0,1)",
      lag: "rgba(0,36,93,1)",
      lan: "rgba(195,158,109,1)",
      mia: "rgba(246,180,205,1)",
      min: "rgba(140,210,244,1)",
      mon: "rgba(0,51,161,1)",
      ne: "rgba(206,14,45,1)",
      nsc: "rgba(236,232,58,1)",
      ny: "rgba(237,30,54,1)",
      nyc: "rgba(108,172,228,1)",
      orl: "rgba(99,52,146,1)",
      phi: "rgba(7,27,44,1)",
      por: "rgba(0,72,43,1)",
      rsl: "rgba(179,8,56,1)",
      sai: "rgba(236,20,89,1)",
      sea: "rgba(0,85,149,1)",
      sj: "rgba(0,103,177,1)",
      skc: "rgba(145,176,213,1)",
      tor: "rgba(184,17,55,1)",
      van: "rgba(0,36,94,1)",
      san: "rgba(7,23,43,1)"
    },
    dark: {
      atl: "rgba(160,64,71,1)",
      atx: "rgba(0,177,64,1)",
      cha: "rgba(26,133,200,1)",
      chi: "rgba(255,0,0,1)",
      cin: "rgba(240,83,35,1)",
      clb: "rgba(254,221,0,1)",
      col: "rgba(166,47,76,1)",
      dal: "rgba(232,31,62,1)",
      dc: "rgba(239,62,66,1)",
      hou: "rgba(255,107,0,1)",
      lag: "rgba(64,91,134,1)",
      lan: "rgba(195,158,109,1)",
      mia: "rgba(246,180,205,1)",
      min: "rgba(140,210,244,1)",
      mon: "rgba(51,92,180,1)",
      ne: "rgba(206,14,45,1)",
      nsc: "rgba(236,232,58,1)",
      ny: "rgba(237,30,54,1)",
      nyc: "rgba(108,172,228,1)",
      orl: "rgba(115,72,157,1)",
      phi: "rgba(81,95,107,1)",
      por: "rgba(51,109,85,1)",
      rsl: "rgba(179,8,56,1)",
      sai: "rgba(236,20,89,1)",
      sea: "rgba(13,94,154,1)",
      sj: "rgba(0,103,177,1)",
      skc: "rgba(145,176,213,1)",
      tor: "rgba(184,17,55,1)",
      van: "rgba(64,91,134,1)",
      san: "rgba(1,142,211,1)"
    },
  },
};
const BUNDESLIGA_TEAMS = {
  logoCodeAliases: {
    sve: "elv",
  },
  codeToCity: {
    BMU: "Bayern Munich",
    UNI: "Union Berlin",
    RBL: "RB Leipzig",
    SCF: "SC Freiburg",
    SGE: "Eintracht Frankfurt",
    BVB: "Borussia Dortmund",
    WOB: "VfL Wolfsburg",
    LEV: "Bayer Leverkusen",
    BMG: "Borussia Monchengladbach",
    SVW: "Werder Bremen",
    KOE: "1. FC Cologne",
    M05: "FSV Mainz",
    TSG: "TSG Hoffenheim",
    FCA: "FC Augsburg",
    VFB: "VfB Stuttgart",
    BOC: "VfL Bochum",
    BSC: "Hertha BSC",
    S04: "Schalke 04",
    SCP: "SC Paderborn",
    SVE: "SV Elversberg",
    FCH: "Heidenheim",
    D98: "Darmstadt",
    HOK: "Holstein Kie",
    STP: "FC St. Pauli"
  },
  cityToCode: {
    "Bayern Munich": "BMU",
    "Union Berlin": "UNI",
    "RB Leipzig": "RBL",
    "SC Freiburg": "SCF",
    "Borussia Dortmund": "BVB",
    "Eintracht Frankfurt": "SGE",
    "VfL Wolfsburg": "WOB",
    "Borussia Monchengladbach": "BMG",
    "Werder Bremen": "SVW",
    "Bayer Leverkusen": "LEV",
    "FSV Mainz": "M05",
    "1. FC Cologne": "KOE",
    "TSG Hoffenheim": "TSG",
    "FC Augsburg": "FCA",
    "VfB Stuttgart": "VFB",
    "VfL Bochum": "BOC",
    "Hertha BSC": "BSC",
    "Schalke 04": "S04",
    "SC Paderborn": "SCP",
    "SV Elversberg": "SVE",
    Heidenheim: "FCH",
    Darmstadt: "D98",
    "Holstein Kie": "HOK",
    "FC St. Pauli": "STP"
  },
  codeToName: {
    BMU: "Bayern Munich",
    UNI: "Union Berlin",
    RBL: "RB Leipzig",
    SCF: "SC Freiburg",
    SGE: "Eintracht Frankfurt",
    BVB: "Borussia Dortmund",
    WOB: "VfL Wolfsburg",
    LEV: "Bayer Leverkusen",
    BMG: "Borussia Monchengladbach",
    SVW: "Werder Bremen",
    KOE: "1. FC Cologne",
    M05: "FSV Mainz",
    TSG: "TSG Hoffenheim",
    FCA: "FC Augsburg",
    VFB: "VfB Stuttgart",
    BOC: "VfL Bochum",
    BSC: "Hertha BSC",
    S04: "Schalke 04",
    SCP: "SC Paderborn",
    SVE: "SV Elversberg",
    FCH: "Heidenheim",
    D98: "Darmstadt",
    HOK: "Holstein Kie",
    STP: "FC St. Pauli"
  },
  colors: {
    light: {
      lev: "rgba(227,34,33,1)",
      bmg: "rgba(0,0,0,1)",
      boc: "rgba(0,92,169,1)",
      bsc: "rgba(0,77,158,1)",
      bvb: "rgba(253,225,0,1)",
      fca: "rgba(186,55,51,1)",
      uni: "rgba(235,25,35,1)",
      koe: "rgba(237,28,36,1)",
      m05: "rgba(195,20,30,1)",
      bmu: "rgba(220,5,45,1)",
      rbl: "rgba(221,1,63,1)",
      s04: "rgba(0,75,156,1)",
      scp: "rgba(0,92,168,1)",
      sve: "rgba(0,0,0,1)",
      scf: "rgba(0,0,0,1)",
      sge: "rgba(225,0,15,1)",
      svw: "rgba(0,167,104,1)",
      tsg: "rgba(25,97,181,1)",
      vfb: "rgba(227,34,25,1)",
      wob: "rgba(101,179,46,1)",
      d98: "rgba(0,79,159,1)",
      fch: "rgba(226,0,26,1)",
      hok: "rgba(0,87,156,1)",
      stp: "rgba(227,6,19,1)",
      hsv: "rgba(30,92,179,1)"
    },
    dark: {
      lev: "rgba(227,34,33,1)",
      bmg: "rgba(123,123,123,1)",
      boc: "rgba(0,92,169,1)",
      bsc: "rgba(14,106,189,1)",
      bvb: "rgba(253,225,0,1)",
      fca: "rgba(186,55,51,1)",
      uni: "rgba(235,25,35,1)",
      koe: "rgba(237,28,36,1)",
      m05: "rgba(195,20,30,1)",
      bmu: "rgba(220,5,45,1)",
      rbl: "rgba(221,1,63,1)",
      s04: "rgba(64,120,181,1)",
      scp: "rgba(51,125,185,1)",
      sve: "rgba(123,123,123,1)",
      scf: "rgba(123,123,123,1)",
      sge: "rgba(225,0,15,1)",
      svw: "rgba(0,167,104,1)",
      tsg: "rgba(25,97,181,1)",
      vfb: "rgba(227,34,25,1)",
      wob: "rgba(101,179,46,1)",
      d98: "rgba(25,97,169,1)",
      fch: "rgba(226,0,26,1)",
      hok: "rgba(38,112,171,1)",
      stp: "rgba(227,6,19,1)",
      hsv: "rgba(52,108,187,1)"
    },
  },
};
const EPL_TEAMS = {
  logoCodeAliases: {
    hci: "hul",
  },
  codeToCity: {
    ARS: "Arsenal FC",
    MCI: "Manchester City",
    NEW: "Newcastle United",
    MUN: "Manchester United",
    TOT: "Tottenham Hotspur",
    FUL: "Fulham FC",
    BRI: "Brighton & Hove Albion",
    BRE: "Brentford FC",
    LIV: "Liverpool FC",
    CHE: "Chelsea FC",
    AVL: "Aston Villa",
    CRY: "Crystal Palace",
    NFO: "Nottingham Forest",
    LEI: "Leicester City",
    LEE: "Leeds United",
    WHU: "West Ham United",
    BOU: "AFC Bournemouth",
    WOL: "Wolverhampton Wanderers",
    EVE: "Everton FC",
    SOU: "Southampton FC",
    "BUR ": "Burnley",
    SHU: "Sheffield United",
    LUT: "Luton Town",
    COV: "Coventry City",
    HCI: "Hull City",
    IPS: "Ipswich Town"
  },
  cityToCode: {
    "Arsenal FC": "ARS",
    "Manchester City": "MCI",
    "Newcastle United": "NEW",
    "Manchester United": "MUN",
    "Tottenham Hotspur": "TOT",
    "Fulham FC": "FUL",
    "Brighton & Hove Albion": "BRI",
    "Brentford FC": "BRE",
    "Liverpool FC": "LIV",
    "Chelsea FC": "CHE",
    "Aston Villa": "AVL",
    "Crystal Palace": "CRY",
    "Nottingham Forest": "NFO",
    "Leicester City": "LEI",
    "Leeds United": "LEE",
    "West Ham United": "WHU",
    "AFC Bournemouth": "BOU",
    "Wolverhampton Wanderers": "WOL",
    "Everton FC": "EVE",
    "Southampton FC": "SOU",
    Burnley: "BUR",
    "Sheffield United": "SHU",
    "Luton Town": "LUT",
    "Coventry City": "COV",
    "Hull City": "HCI",
    "Ipswich Town": "IPS"
  },
  codeToName: {
    ARS: "Arsenal FC",
    MCI: "Manchester City",
    NEW: "Newcastle United",
    MUN: "Manchester United",
    TOT: "Tottenham Hotspur",
    FUL: "Fulham FC",
    BRI: "Brighton & Hove Albion",
    BRE: "Brentford FC",
    LIV: "Liverpool FC",
    CHE: "Chelsea FC",
    AVL: "Aston Villa",
    CRY: "Crystal Palace",
    NFO: "Nottingham Forest",
    LEI: "Leicester City",
    LEE: "Leeds United",
    WHU: "West Ham United",
    BOU: "AFC Bournemouth",
    WOL: "Wolverhampton Wanderers",
    EVE: "Everton FC",
    SOU: "Southampton FC",
    "BUR ": "Burnley",
    SHU: "Sheffield United",
    LUT: "Luton Town",
    COV: "Coventry City",
    HCI: "Hull City",
    IPS: "Ipswich Town"
  },
  colors: {
    light: {
      ars: "rgba(239,1,7,1)",
      avl: "rgba(103,14,54,1)",
      bri: "rgba(0,87,184,1)",
      bou: "rgba(218,41,28,1)",
      bre: "rgba(227,6,19,1)",
      che: "rgba(3,70,148,1)",
      cry: "rgba(27,69,143,1)",
      eve: "rgba(0,51,153,1)",
      nfo: "rgba(221,0,0,1)",
      ful: "rgba(0,0,0,1)",
      lee: "rgba(29,66,138,1)",
      lei: "rgba(0,48,144,1)",
      liv: "rgba(200,16,46,1)",
      mun: "rgba(218,41,28,1)",
      mci: "rgba(108,171,221,1)",
      new: "rgba(0,182,241,1)",
      sou: "rgba(215,25,32,1)",
      tot: "rgba(19,34,87,1)",
      whu: "rgba(122,38,58,1)",
      wol: "rgba(253,185,19,1)",
      bur: "rgba(95,0,65,1)",
      lut: "rgba(249,75,41,1)",
      shu: "rgba(236,34,39,1)",
      cov: "rgba(5,141,195,1)",
      hci: "rgba(205,117,1,1)",
      ips: "rgba(3,51,160,1)",
      sun: "rgba(253,18,32,1)"
    },
    dark: {
      ars: "rgba(239,1,7,1)",
      avl: "rgba(180,24,71,1)",
      bri: "rgba(0,87,184,1)",
      bou: "rgba(218,41,28,1)",
      bre: "rgba(227,6,19,1)",
      che: "rgba(17,100,179,1)",
      cry: "rgba(38,99,174,1)",
      eve: "rgba(78,105,197,1)",
      nfo: "rgba(221,0,0,1)",
      ful: "rgba(123,123,123,1)",
      lee: "rgba(255,205,0,1)",
      lei: "rgba(77,110,177,1)",
      liv: "rgba(200,16,46,1)",
      mun: "rgba(218,41,28,1)",
      mci: "rgba(108,171,221,1)",
      new: "rgba(0,182,241,1)",
      sou: "rgba(215,25,32,1)",
      tot: "rgba(112,128,173,1)",
      whu: "rgba(197,61,68,1)",
      wol: "rgba(253,185,19,1)",
      bur: "rgba(135,64,113,1)",
      lut: "rgba(249,75,41,1)",
      shu: "rgba(236,34,39,1)",
      cov: "rgba(5,157,217,1)",
      hci: "rgba(241,138,1,1)",
      ips: "rgba(58,100,163,1)",
      sun: "rgba(253,18,32,1)"
    },
  },
};
const LALIGA_TEAMS = {
  logoCodeAliases: {
    mcf: "mal",
    rcd: "dep",
    rrs: "rac",
  },
  codeToCity: {
    FCB: "FC Barcelona",
    RMA: "Real Madrid",
    RSO: "Real Sociedad San Sebastian",
    ATM: "Atletico Madrid",
    VIL: "Villarreal CF",
    RBB: "Real Betis Seville",
    OSA: "CA Osasuna",
    ATH: "Athletic Bilbao",
    RVC: "Rayo Vallecano",
    MAL: "RCD Mallorca",
    GIR: "Girona FC",
    VCF: "Valencia CF",
    ESP: "Espanyol Barcelona",
    ALM: "UD Almeria",
    SEV: "Sevilla FC",
    GET: "Getafe CF",
    VLL: "Real Valladolid",
    RCC: "RC Celta de Vigo",
    CAD: "Cadiz CF",
    ELC: "Elche CF",
    GCF: "Granada",
    LPA: "Las Palmas",
    ALA: "Alavés",
    LEG: "Club Deportivo Leganés",
    MCF: "Málaga",
    RCD: "Deportivo La Coruña",
    RRS: "Racing Santander",
  },
  cityToCode: {
    "FC Barcelona": "FCB",
    "Real Madrid": "RMA",
    "Real Sociedad San Sebastian": "RSO",
    "Atletico Madrid": "ATM",
    "Villarreal CF": "VIL",
    "Real Betis Seville": "RBB",
    "CA Osasuna": "OSA",
    "Athletic Bilbao": "ATH",
    "Rayo Vallecano": "RVC",
    "RCD Mallorca": "MAL",
    "UD Almeria": "ALM",
    "Girona FC": "GIR",
    "Sevilla FC": "SEV",
    "Valencia CF": "VCF",
    "Real Valladolid": "VLL",
    "RC Celta de Vigo": "RCC",
    "Espanyol Barcelona": "ESP",
    "Cadiz CF": "CAD",
    "Getafe CF": "GET",
    "Elche CF": "ELC",
    Granada: "GCF",
    "Las Palmas": "LPA",
    "Alavés": "ALA",
    "Club Deportivo Leganés": "LEG",
    "Málaga": "MCF",
    "Deportivo La Coruña": "RCD",
    "Racing Santander": "RRS"
  },
  codeToName: {
    FCB: "FC Barcelona",
    RMA: "Real Madrid",
    RSO: "Real Sociedad San Sebastian",
    ATM: "Atletico Madrid",
    VIL: "Villarreal CF",
    RBB: "Real Betis Seville",
    OSA: "CA Osasuna",
    ATH: "Athletic Bilbao",
    RVC: "Rayo Vallecano",
    MAL: "RCD Mallorca",
    GIR: "Girona FC",
    VCF: "Valencia CF",
    ESP: "Espanyol Barcelona",
    ALM: "UD Almeria",
    SEV: "Sevilla FC",
    GET: "Getafe CF",
    VLL: "Real Valladolid",
    RCC: "RC Celta de Vigo",
    CAD: "Cadiz CF",
    ELC: "Elche CF",
    GCF: "Granada",
    LPA: "Las Palmas",
    ALA: "Alavés",
    LEG: "Club Deportivo Leganés",
    MCF: "Málaga",
    RCD: "Deportivo La Coruña",
    RRS: "Racing Santander"
  },
  colors: {
    light: {
      alm: "rgba(204,0,0,1)",
      ath: "rgba(238,37,35,1)",
      atm: "rgba(39,46,97,1)",
      fcb: "rgba(165,0,68,1)",
      rbb: "rgba(11,179,99,1)",
      cad: "rgba(0,69,167,1)",
      rcc: "rgba(138,195,238,1)",
      elc: "rgba(1,97,57,1)",
      esp: "rgba(30,107,192,1)",
      get: "rgba(0,89,153,1)",
      gir: "rgba(252,0,0,1)",
      mal: "rgba(226,6,19,1)",
      mcf: "rgba(20,118,196,1)",
      rcd: "rgba(87,23,94,1)",
      rrs: "rgba(61,163,81,1)",
      osa: "rgba(10,52,111,1)",
      rvc: "rgba(226,25,33,1)",
      rma: "rgba(0,82,159,1)",
      rso: "rgba(0,103,177,1)",
      sev: "rgba(244,51,51,1)",
      vcf: "rgba(238,53,36,1)",
      vil: "rgba(0,81,135,1)",
      vll: "rgba(146,27,136,1)",
      ala: "rgba(2,50,160,1)",
      gcf: "rgba(195,22,50,1)",
      lpa: "rgba(255,228,0,1)",
      leg: "rgba(0,87,184,1)",
      lev: "rgba(13,24,61,1)",
      ovi: "rgba(9,76,161,1)"
    },
    dark: {
      alm: "rgba(204,0,0,1)",
      ath: "rgba(238,37,35,1)",
      atm: "rgba(72,90,154,1)",
      fcb: "rgba(185,7,72,1)",
      rbb: "rgba(11,179,99,1)",
      cad: "rgba(3,100,198,1)",
      rcc: "rgba(138,195,238,1)",
      elc: "rgba(14,105,67,1)",
      esp: "rgba(30,107,192,1)",
      get: "rgba(4,121,187,1)",
      gir: "rgba(252,0,0,1)",
      mal: "rgba(226,6,19,1)",
      mcf: "rgba(20,118,196,1)",
      rcd: "rgba(137,93,142,1)",
      rrs: "rgba(72,192,95,1)",
      osa: "rgba(74,103,158,1)",
      rvc: "rgba(226,25,33,1)",
      rma: "rgba(0,114,193,1)",
      rso: "rgba(0,103,177,1)",
      sev: "rgba(244,51,51,1)",
      vcf: "rgba(238,53,36,1)",
      vil: "rgba(6,112,169,1)",
      vll: "rgba(168,73,160,1)",
      ala: "rgba(53,91,179,1)",
      gcf: "rgba(195,22,50,1)",
      lpa: "rgba(255,228,0,1)",
      leg: "rgba(51,121,198,1)",
      lev: "rgba(220,164,62,1)",
      ovi: "rgba(58,112,180,1)"
    },
  },
};
const LIGUE1_TEAMS = {
  logoCodeAliases: {
    lmf: "lem",
    try: "tro",
  },
  codeToCity: {
    PSG: "Paris Saint-Germain",
    RCL: "RC Lens",
    OM: "Olympique Marseille",
    REN: "Stade Rennes",
    ASM: "AS Monaco",
    LIL: "Lille OSC",
    FCL: "FC Lorient",
    CFA: "Clermont Foot 63",
    OL: "Olympique Lyon",
    SDR: "Stade Reims",
    NIC: "OGC Nice",
    TFC: "Toulouse FC",
    FCN: "FC Nantes",
    TRY: "ESTAC Troyes",
    LMF: "Le Mans",
    MHS: "Montpellier HSC",
    ACA: "AC Ajaccio",
    STB: "Stade Brest 29",
    RCS: "Strasbourg Alsace",
    AUX: "AJ Auxerre",
    ANG: "Angers SCO",
    HAC: "Le Havre",
    FCM: "Metz",
    STE: "AS Saint-Étienne"
  },
  cityToCode: {
    "Paris Saint-Germain": "PSG",
    "RC Lens": "RCL",
    "Olympique Marseille": "OM",
    "AS Monaco": "ASM",
    "Stade Rennes": "REN",
    "FC Lorient": "FCL",
    "Lille OSC": "LIL",
    "Clermont Foot 63": "CFA",
    "Olympique Lyon": "OL",
    "OGC Nice": "NIC",
    "Stade Reims": "SDR",
    "Toulouse FC": "TFC",
    "FC Nantes": "FCN",
    "Montpellier HSC": "MHS",
    "ESTAC Troyes": "TRY",
    "Le Mans": "LMF",
    "Stade Brest 29": "STB",
    "AC Ajaccio": "ACA",
    "Strasbourg Alsace": "RCS",
    "AJ Auxerre": "AUX",
    "Angers SCO": "ANG",
    "Le Havre": "HAC",
    Metz: "FCM",
    "AS Saint-Étienne": "STE"
  },
  codeToName: {
    PSG: "Paris Saint-Germain",
    RCL: "RC Lens",
    OM: "Olympique Marseille",
    REN: "Stade Rennes",
    ASM: "AS Monaco",
    LIL: "Lille OSC",
    FCL: "FC Lorient",
    CFA: "Clermont Foot 63",
    OL: "Olympique Lyon",
    SDR: "Stade Reims",
    NIC: "OGC Nice",
    TFC: "Toulouse FC",
    FCN: "FC Nantes",
    TRY: "ESTAC Troyes",
    LMF: "Le Mans",
    MHS: "Montpellier HSC",
    ACA: "AC Ajaccio",
    STB: "Stade Brest 29",
    RCS: "Strasbourg Alsace",
    AUX: "AJ Auxerre",
    ANG: "Angers SCO",
    HAC: "Le Havre",
    FCM: "Metz",
    STE: "AS Saint-Étienne"
  },
  colors: {
    light: {
      aca: "rgba(237,29,40,1)",
      ang: "rgba(180,139,75,1)",
      asm: "rgba(229,27,34,1)",
      aux: "rgba(0,78,162,1)",
      stb: "rgba(237,28,36,1)",
      cfa: "rgba(197,12,70,1)",
      lil: "rgba(224,30,19,1)",
      fcl: "rgba(245,129,19,1)",
      ol: "rgba(20,56,127,1)",
      om: "rgba(47,174,224,1)",
      mhs: "rgba(0,103,166,1)",
      fcn: "rgba(252,212,5,1)",
      nic: "rgba(0,0,0,1)",
      psg: "rgba(0,65,112,1)",
      rcl: "rgba(236,28,36,1)",
      sdr: "rgba(238,34,35,1)",
      ren: "rgba(225,51,39,1)",
      rcs: "rgba(0,159,227,1)",
      tfc: "rgba(116,89,144,1)",
      try: "rgba(0,110,178,1)",
      lmf: "rgba(240,4,1,1)",
      fcm: "rgba(115,16,19,1)",
      hac: "rgba(121,188,231,1)",
      ste: "rgba(29,153,91,1)",
      met: "rgba(115,16,19,1)",
      par: "rgba(12,24,63,1)"
    },
    dark: {
      aca: "rgba(237,29,40,1)",
      ang: "rgba(180,139,75,1)",
      asm: "rgba(229,27,34,1)",
      aux: "rgba(64,122,185,1)",
      stb: "rgba(237,28,36,1)",
      cfa: "rgba(197,12,70,1)",
      lil: "rgba(224,30,19,1)",
      fcl: "rgba(245,129,19,1)",
      ol: "rgba(80,107,173,1)",
      om: "rgba(47,174,224,1)",
      mhs: "rgba(0,103,166,1)",
      fcn: "rgba(252,212,5,1)",
      nic: "rgba(123,123,123,1)",
      psg: "rgba(27,109,160,1)",
      rcl: "rgba(236,28,36,1)",
      sdr: "rgba(238,34,35,1)",
      ren: "rgba(225,51,39,1)",
      rcs: "rgba(0,159,227,1)",
      tfc: "rgba(116,89,144,1)",
      try: "rgba(0,110,178,1)",
      lmf: "rgba(240,4,1,1)",
      fcm: "rgba(150,76,78,1)",
      hac: "rgba(121,188,231,1)",
      ste: "rgba(29,153,91,1)",
      met: "rgba(150,76,78,1)",
      par: "rgba(6,128,190,1)"
    },
  },
};
const SERIEA_TEAMS = {
  logoCodeAliases: {},
  codeToCity: {
    NAP: "SSC Napoli",
    ACM: "AC Milan",
    INT: "Inter Milano",
    LAZ: "Lazio Rome",
    ROM: "AS Roma",
    ATA: "Atalanta BC",
    UDI: "Udinese Calcio",
    TOR: "Torino FC",
    EMP: "Empoli FC",
    JUV: "Juventus Turin",
    FIO: "ACF Fiorentina",
    BFC: "Bologna FC",
    MON: "AC Monza",
    LEC: "US Lecce",
    SAL: "US Salernitana",
    SPE: "Spezia Calcio",
    SAS: "Sassuolo Calcio",
    VER: "Hellas Verona",
    SAM: "Sampdoria Genoa",
    CRE: "US Cremonese",
    CAG: "Cagliari",
    FRO: "Frosinone",
    GEN: "Genoa",
    COM: "Como",
    PAR: "Parma",
    VEN: "Venezia FC"
  },
  cityToCode: {
    "SSC Napoli": "NAP",
    "Inter Milano": "INT",
    "AC Milan": "ACM",
    "Lazio Rome": "LAZ",
    "Atalanta BC": "ATA",
    "AS Roma": "ROM",
    "Udinese Calcio": "UDI",
    "Torino FC": "TOR",
    "Bologna FC": "BFC",
    "Empoli FC": "EMP",
    "AC Monza": "MON",
    "ACF Fiorentina": "FIO",
    "Juventus Turin": "JUV",
    "US Salernitana": "SAL",
    "US Lecce": "LEC",
    "Sassuolo Calcio": "SAS",
    "Spezia Calcio": "SPE",
    "Hellas Verona": "VER",
    "Sampdoria Genoa": "SAM",
    "US Cremonese": "CRE",
    Cagliari: "CAG",
    Frosinone: "FRO",
    Genoa: "GEN",
    Como: "COM",
    Parma: "PAR",
    "Venezia FC": "VEN"
  },
  codeToName: {
    NAP: "SSC Napoli",
    ACM: "AC Milan",
    INT: "Inter Milano",
    LAZ: "Lazio Rome",
    ROM: "AS Roma",
    ATA: "Atalanta BC",
    UDI: "Udinese Calcio",
    TOR: "Torino FC",
    EMP: "Empoli FC",
    JUV: "Juventus Turin",
    FIO: "ACF Fiorentina",
    BFC: "Bologna FC",
    MON: "AC Monza",
    LEC: "US Lecce",
    SAL: "US Salernitana",
    SPE: "Spezia Calcio",
    SAS: "Sassuolo Calcio",
    VER: "Hellas Verona",
    SAM: "Sampdoria Genoa",
    CRE: "US Cremonese",
    CAG: "Cagliari",
    FRO: "Frosinone",
    GEN: "Genoa",
    COM: "Como",
    PAR: "Parma",
    VEN: "Venezia FC"
  },
  colors: {
    light: {
      ata: "rgba(30,113,184,1)",
      bfc: "rgba(26,47,72,1)",
      cre: "rgba(237,28,36,1)",
      emp: "rgba(0,87,156,1)",
      fio: "rgba(72,46,146,1)",
      int: "rgba(1,14,128,1)",
      juv: "rgba(0,0,0,1)",
      laz: "rgba(135,216,247,1)",
      lec: "rgba(0,40,86,1)",
      acm: "rgba(251,9,11,1)",
      mon: "rgba(237,22,57,1)",
      nap: "rgba(0,60,130,1)",
      rom: "rgba(151,10,44,1)",
      sal: "rgba(131,29,28,1)",
      sam: "rgba(27,84,151,1)",
      sas: "rgba(0,167,82,1)",
      spe: "rgba(170,150,101,1)",
      tor: "rgba(138,30,3,1)",
      udi: "rgba(139,125,55,1)",
      ver: "rgba(0,47,108,1)",
      cag: "rgba(176,16,40,1)",
      fro: "rgba(255,221,0,1)",
      gen: "rgba(174,25,25,1)",
      com: "rgba(29,59,98,1)",
      par: "rgba(41,53,109,1)",
      ven: "rgba(0,105,55,1)",
      pis: "rgba(0,114,180,1)"
    },
    dark: {
      ata: "rgba(30,113,184,1)",
      bfc: "rgba(76,105,142,1)",
      cre: "rgba(237,28,36,1)",
      emp: "rgba(0,118,190,1)",
      fio: "rgba(126,92,183,1)",
      int: "rgba(42,64,253,1)",
      juv: "rgba(123,123,123,1)",
      laz: "rgba(135,216,247,1)",
      lec: "rgba(73,107,156,1)",
      acm: "rgba(251,9,11,1)",
      mon: "rgba(237,22,57,1)",
      nap: "rgba(22,105,179,1)",
      rom: "rgba(180,28,60,1)",
      sal: "rgba(191,56,50,1)",
      sam: "rgba(33,117,186,1)",
      sas: "rgba(0,167,82,1)",
      spe: "rgba(170,150,101,1)",
      tor: "rgba(183,52,24,1)",
      udi: "rgba(139,125,55,1)",
      ver: "rgba(42,91,164,1)",
      cag: "rgba(180,28,51,1)",
      fro: "rgba(255,221,0,1)",
      gen: "rgba(178,37,37,1)",
      com: "rgba(97,118,145,1)",
      par: "rgba(95,104,146,1)",
      ven: "rgba(255,105,0,1)",
      pis: "rgba(0,114,180,1)"
    },
  },
};
const UCL_TEAMS = {
  logoCodeAliases: {},
  codeToCity: {
    AJX: "AFC Ajax",
    ARS: "Arsenal FC",
    ATA: "Atalanta Bergamasca Calcio",
    ATH: "Athletic Club",
    ATM: "Club Atletico de Madrid",
    FCB: "FC Barcelona",
    LEV: "FCI Levadia",
    BMU: "FC Bayern Munchen",
    SLB: "SL Benfica",
    BOD: "FK Bodo / Glimt",
    BVB: "BV Borussia 09 Dortmund",
    CHE: "Chelsea FC",
    CLU: "Club Brugge KV",
    SGE: "Eintracht Frankfurt",
    FCK: "FC Kobenhavn",
    GS: "Galatasaray Spor Kulubu",
    INT: "FC Internazionale Milano",
    JUV: "Juventus FC",
    KAI: "FK Kairat Almaty",
    LIV: "Liverpool FC",
    MCI: "Manchester City FC",
    OM: "Olympique de Marseille",
    ASM: "AS Monaco FC",
    NAP: "SSC Napoli",
    NEW: "Newcastle United FC",
    OLY: "Olympiakos CFP",
    PSG: "Paris Saint-Germain FC",
    PSV: "PSV Eindhoven",
    PAF: "Pafos FC",
    QAR: "Qarabag Agdam FK",
    RMA: "Real Madrid CF",
    SLA: "SK Slavia Praha",
    SCP: "Sporting Clube de Portugal",
    TOT: "Tottenham Hotspur FC",
    STG: "Royale Union Saint-Gilloise",
    VIL: "Villarreal CF",
    KUP: "KuPS",
    RIJ: "Rijeka",
    VIR: "Virtus",
    FEY: "Feyenoord",
    ZRI: "Zrinjski",
    SHK: "Shkendija",
    DRI: "Drita",
    ICE: "Inter Club d'Escaldes",
    STU: "Sturm Graz",
    PAO: "Panathinaikos",
    BAS: "Basel",
    BRA: "Brann",
    LUD: "Ludogorets Razgrad",
    OLI: "Olimpija",
    SHE: "Shelbourne",
    DYN: "Dynamo Kyiv",
    CZV: "Crvena zvezda",
    TNS: "The New Saints",
    FB: "Fenerbahce",
    IBE: "Iberia 1999",
    MFF: "Malmo FF",
    LIN: "Linfield",
    HAM: "Hamrun Spartans",
    DIF: "Differdange 03",
    FTC: "Ferencvaros",
    RBS: "Salzburg",
    FCS: "FCSB",
    DIM: "Dinamo Minsk",
    NIC: "Nice",
    PLZ: "Viktoria Plzen",
    BRE: "Breidablik",
    RDI: "Lincoln Red Imps",
    SFC: "Servette",
    EGN: "Egnatia Rrogozhine",
    SLO: "Slovan Bratislava",
    RAN: "Rangers",
    MIL: "Milsami",
    RFS: "Rigas FS",
    BUD: "Buducnost",
    VIK: "Vikingur",
    LPO: "Lech Poznan",
    CEL: "Celtic",
    NOA: "Noah",
    MTA: "Maccabi Tel Aviv",
    ZAL: "Zalgiris"
  },
  cityToCode: {
    "AFC Ajax": "AJX",
    "Arsenal FC": "ARS",
    "Atalanta Bergamasca Calcio": "ATA",
    "Athletic Club": "ATH",
    "Club Atletico de Madrid": "ATM",
    "FC Barcelona": "FCB",
    "Bayer 04 Leverkusen": "LEV",
    "FC Bayern Munchen": "BMU",
    "SL Benfica": "SLB",
    "FK Bodo / Glimt": "BOD",
    "BV Borussia 09 Dortmund": "BVB",
    "Chelsea FC": "CHE",
    "Club Brugge KV": "CLU",
    "Eintracht Frankfurt": "SGE",
    "FC Kobenhavn": "FCK",
    "Galatasaray Spor Kulubu": "GS",
    "FC Internazionale Milano": "INT",
    "Juventus FC": "JUV",
    "FK Kairat Almaty": "KAI",
    "Liverpool FC": "LIV",
    "Manchester City FC": "MCI",
    "Olympique de Marseille": "OM",
    "AS Monaco FC": "ASM",
    "SSC Napoli": "NAP",
    "Newcastle United FC": "NEW",
    "Olympiakos CFP": "OLY",
    "Paris Saint-Germain FC": "PSG",
    "PSV Eindhoven": "PSV",
    "Pafos FC": "PAF",
    "Qarabag Agdam FK": "QAR",
    "Real Madrid CF": "RMA",
    "SK Slavia Praha": "SLA",
    "Sporting Clube de Portugal": "SCP",
    "Tottenham Hotspur FC": "TOT",
    "Royale Union Saint-Gilloise": "STG",
    "Villarreal CF": "VIL",
    KuPS: "KUP",
    Rijeka: "RIJ",
    Virtus: "VIR",
    Feyenoord: "FEY",
    Zrinjski: "ZRI",
    Shkendija: "SHK",
    Drita: "DRI",
    "Inter Club d'Escaldes": "ICE",
    "Sturm Graz": "STU",
    Panathinaikos: "PAO",
    Basel: "BAS",
    Brann: "BRA",
    "Ludogorets Razgrad": "LUD",
    Olimpija: "OLI",
    Shelbourne: "SHE",
    "Dynamo Kyiv": "DYN",
    "Crvena zvezda": "CZV",
    "The New Saints": "TNS",
    "FCI Levadia": "LEV",
    Fenerbahce: "FB",
    "Iberia 1999": "IBE",
    "Malmo FF": "MFF",
    Linfield: "LIN",
    "Hamrun Spartans": "HAM",
    "Differdange 03": "DIF",
    Ferencvaros: "FTC",
    Salzburg: "RBS",
    FCSB: "FCS",
    "Dinamo Minsk": "DIM",
    Nice: "NIC",
    "Viktoria Plzen": "PLZ",
    Breidablik: "BRE",
    "Lincoln Red Imps": "RDI",
    Servette: "SFC",
    "Egnatia Rrogozhine": "EGN",
    "Slovan Bratislava": "SLO",
    Rangers: "RAN",
    Milsami: "MIL",
    "Rigas FS": "RFS",
    Buducnost: "BUD",
    Vikingur: "VIK",
    "Lech Poznan": "LPO",
    Celtic: "CEL",
    Noah: "NOA",
    "Maccabi Tel Aviv": "MTA",
    Zalgiris: "ZAL"
  },
  codeToName: {
    AJX: "AFC Ajax",
    ARS: "Arsenal FC",
    ATA: "Atalanta Bergamasca Calcio",
    ATH: "Athletic Club",
    ATM: "Club Atletico de Madrid",
    FCB: "FC Barcelona",
    LEV: "FCI Levadia",
    BMU: "FC Bayern Munchen",
    SLB: "SL Benfica",
    BOD: "FK Bodo / Glimt",
    BVB: "BV Borussia 09 Dortmund",
    CHE: "Chelsea FC",
    CLU: "Club Brugge KV",
    SGE: "Eintracht Frankfurt",
    FCK: "FC Kobenhavn",
    GS: "Galatasaray Spor Kulubu",
    INT: "FC Internazionale Milano",
    JUV: "Juventus FC",
    KAI: "FK Kairat Almaty",
    LIV: "Liverpool FC",
    MCI: "Manchester City FC",
    OM: "Olympique de Marseille",
    ASM: "AS Monaco FC",
    NAP: "SSC Napoli",
    NEW: "Newcastle United FC",
    OLY: "Olympiakos CFP",
    PSG: "Paris Saint-Germain FC",
    PSV: "PSV Eindhoven",
    PAF: "Pafos FC",
    QAR: "Qarabag Agdam FK",
    RMA: "Real Madrid CF",
    SLA: "SK Slavia Praha",
    SCP: "Sporting Clube de Portugal",
    TOT: "Tottenham Hotspur FC",
    STG: "Royale Union Saint-Gilloise",
    VIL: "Villarreal CF",
    KUP: "KuPS",
    RIJ: "Rijeka",
    VIR: "Virtus",
    FEY: "Feyenoord",
    ZRI: "Zrinjski",
    SHK: "Shkendija",
    DRI: "Drita",
    ICE: "Inter Club d'Escaldes",
    STU: "Sturm Graz",
    PAO: "Panathinaikos",
    BAS: "Basel",
    BRA: "Brann",
    LUD: "Ludogorets Razgrad",
    OLI: "Olimpija",
    SHE: "Shelbourne",
    DYN: "Dynamo Kyiv",
    CZV: "Crvena zvezda",
    TNS: "The New Saints",
    FB: "Fenerbahce",
    IBE: "Iberia 1999",
    MFF: "Malmo FF",
    LIN: "Linfield",
    HAM: "Hamrun Spartans",
    DIF: "Differdange 03",
    FTC: "Ferencvaros",
    RBS: "Salzburg",
    FCS: "FCSB",
    DIM: "Dinamo Minsk",
    NIC: "Nice",
    PLZ: "Viktoria Plzen",
    BRE: "Breidablik",
    RDI: "Lincoln Red Imps",
    SFC: "Servette",
    EGN: "Egnatia Rrogozhine",
    SLO: "Slovan Bratislava",
    RAN: "Rangers",
    MIL: "Milsami",
    RFS: "Rigas FS",
    BUD: "Buducnost",
    VIK: "Vikingur",
    LPO: "Lech Poznan",
    CEL: "Celtic",
    NOA: "Noah",
    MTA: "Maccabi Tel Aviv",
    ZAL: "Zalgiris"
  },
  colors: {
    light: {
      ajx: "rgba(210,18,46,1)",
      ars: "rgba(239,1,7,1)",
      asm: "rgba(229,27,34,1)",
      ata: "rgba(30,113,184,1)",
      ath: "rgba(238,37,35,1)",
      atm: "rgba(39,46,97,1)",
      bmu: "rgba(220,5,45,1)",
      bod: "rgba(249,221,0,1)",
      bvb: "rgba(253,225,0,1)",
      che: "rgba(3,70,148,1)",
      clu: "rgba(0,120,191,1)",
      fcb: "rgba(165,0,68,1)",
      lev: "rgba(227,34,33,1)",
      fck: "rgba(55,81,151,1)",
      gs: "rgba(169,4,50,1)",
      int: "rgba(1,14,128,1)",
      juv: "rgba(0,0,0,1)",
      kai: "rgba(241,203,47,1)",
      liv: "rgba(200,16,46,1)",
      mci: "rgba(108,171,221,1)",
      nap: "rgba(0,60,130,1)",
      new: "rgba(0,182,241,1)",
      oly: "rgba(227,31,38,1)",
      om: "rgba(47,174,224,1)",
      paf: "rgba(41,124,166,1)",
      psg: "rgba(0,65,112,1)",
      psv: "rgba(240,0,0,1)",
      qar: "rgba(49,39,88,1)",
      rma: "rgba(0,82,159,1)",
      scp: "rgba(0,136,99,1)",
      sge: "rgba(225,0,15,1)",
      sla: "rgba(236,22,44,1)",
      slb: "rgba(232,48,48,1)",
      stg: "rgba(255,212,0,1)",
      tot: "rgba(19,34,87,1)",
      vil: "rgba(0,81,135,1)"
    },
    dark: {
      ajx: "rgba(210,18,46,1)",
      ars: "rgba(239,1,7,1)",
      asm: "rgba(229,27,34,1)",
      ata: "rgba(30,113,184,1)",
      ath: "rgba(238,37,35,1)",
      atm: "rgba(82,88,129,1)",
      bmu: "rgba(220,5,45,1)",
      bod: "rgba(249,221,0,1)",
      bvb: "rgba(253,225,0,1)",
      che: "rgba(41,98,164,1)",
      clu: "rgba(0,120,191,1)",
      fcb: "rgba(174,25,87,1)",
      lev: "rgba(227,34,33,1)",
      fck: "rgba(95,116,172,1)",
      gs: "rgba(186,54,91,1)",
      int: "rgba(77,86,166,1)",
      juv: "rgba(123,123,123,1)",
      kai: "rgba(241,203,47,1)",
      liv: "rgba(200,16,46,1)",
      mci: "rgba(108,171,221,1)",
      nap: "rgba(51,99,155,1)",
      new: "rgba(0,182,241,1)",
      oly: "rgba(227,31,38,1)",
      om: "rgba(47,174,224,1)",
      paf: "rgba(41,124,166,1)",
      psg: "rgba(38,94,133,1)",
      psv: "rgba(240,0,0,1)",
      qar: "rgba(101,93,130,1)",
      rma: "rgba(13,91,164,1)",
      scp: "rgba(0,136,99,1)",
      sge: "rgba(225,0,15,1)",
      sla: "rgba(236,22,44,1)",
      slb: "rgba(232,48,48,1)",
      stg: "rgba(255,212,0,1)",
      tot: "rgba(78,89,129,1)",
      vil: "rgba(25,98,147,1)"
    },
  },
};
const UEL_TEAMS = {
  logoCodeAliases: {},
  codeToCity: {
    AVL: "Aston Villa FC",
    BAS: "FC Basel 1893",
    BFC: "Bologna FC 1909",
    BRA: "SK Brann",
    RCC: "Real Club Celta de Vigo",
    CEL: "Celtic FC",
    DIN: "GNK Dinamo Zagreb",
    FCS: "SC Fotbal Club FCSB SA",
    FB: "Fenerbahce Spor Kulubu",
    FTC: "Ferencvarosi TC",
    FEY: "Feyenoord Rotterdam",
    SCF: "SC Freiburg",
    GNK: "KRC Genk",
    GAE: "Go Ahead Eagles",
    LIL: "Lille OSC",
    LUD: "PFK Ludogorets 1945 Razgrad",
    OL: "Olympique Lyonnais",
    MTA: "Maccabi Tel Aviv FC",
    MFF: "Malmo FF",
    FCM: "FC Midtjylland",
    NIC: "OGC Nice Cote d'Azur",
    NFO: "Nottingham Forest FC",
    PKT: "PAOK Thessaloniki FC",
    PAO: "Panathinaikos FC",
    POR: "FC Porto",
    RAN: "Rangers FC",
    RBB: "Real Betis Balompie",
    CZV: "FK Crvena zvezda Beograd",
    ROM: "AS Roma",
    RBS: "FC Salzburg",
    SBR: "Sporting Braga",
    STU: "SK Sturm Graz",
    VFB: "VfB Stuttgart 1893",
    UTR: "FC Utrecht",
    PLZ: "FC Viktoria Plzen",
    YB: "BSC Young Boys",
    KUP: "KuPS",
    RIJ: "Rijeka",
    BJK: "Besiktas",
    ILV: "Ilves",
    ZRI: "Zrinjski",
    KFS: "Shkendija",
    DRI: "Drita",
    PRI: "Prishtina",
    AND: "Anderlecht",
    SHE: "Shelbourne",
    DYN: "Dynamo Kyiv",
    ABE: "Aberdeen",
    WAC: "Wolfsberger AC",
    HBS: "Hapoel Be'er Sheva",
    BKH: "Hacken",
    NKC: "Celje",
    HAM: "Hamrun Spartans",
    LUG: "Lugano",
    PAR: "Partizan",
    LEV: "Levski Sofia",
    BRE: "Breidablik",
    RDI: "Lincoln Red Imps",
    HIB: "Hibernian",
    SFC: "Servette",
    SHK: "Shakhtar Donetsk",
    AKT: "Aktobe",
    SLO: "Slovan Bratislava",
    RFS: "Rigas FS",
    LEG: "Legia Warszawa",
    OLO: "Sigma Olomouc",
    TIR: "Sheriff",
    FCB: "Banik Ostrava",
    SAM: "Samsunspor",
    LPO: "Lech Poznan",
    SPA: "Spartak Trnava",
    FFK: "Fredrikstad",
    PAK: "Paks",
    NOA: "Noah",
    SAB: "Sabah",
    CFR: "CFR Cluj",
    AEL: "AEK Larnaca"
  },
  cityToCode: {
    "Aston Villa FC": "AVL",
    "FC Basel 1893": "BAS",
    "Bologna FC 1909": "BFC",
    "SK Brann": "BRA",
    "Real Club Celta de Vigo": "RCC",
    "Celtic FC": "CEL",
    "GNK Dinamo Zagreb": "DIN",
    "SC Fotbal Club FCSB SA": "FCS",
    "Fenerbahce Spor Kulubu": "FB",
    "Ferencvarosi TC": "FTC",
    "Feyenoord Rotterdam": "FEY",
    "SC Freiburg": "SCF",
    "KRC Genk": "GNK",
    "Go Ahead Eagles": "GAE",
    "Lille OSC": "LIL",
    "PFK Ludogorets 1945 Razgrad": "LUD",
    "Olympique Lyonnais": "OL",
    "Maccabi Tel Aviv FC": "MTA",
    "Malmo FF": "MFF",
    "FC Midtjylland": "FCM",
    "OGC Nice Cote d'Azur": "NIC",
    "Nottingham Forest FC": "NFO",
    "PAOK Thessaloniki FC": "PKT",
    "Panathinaikos FC": "PAO",
    "FC Porto": "POR",
    "Rangers FC": "RAN",
    "Real Betis Balompie": "RBB",
    "FK Crvena zvezda Beograd": "CZV",
    "AS Roma": "ROM",
    "FC Salzburg": "RBS",
    "Sporting Braga": "SBR",
    "SK Sturm Graz": "STU",
    "VfB Stuttgart 1893": "VFB",
    "FC Utrecht": "UTR",
    "FC Viktoria Plzen": "PLZ",
    "BSC Young Boys": "YB",
    KuPS: "KUP",
    Rijeka: "RIJ",
    Besiktas: "BJK",
    Ilves: "ILV",
    Zrinjski: "ZRI",
    Shkendija: "KFS",
    Drita: "DRI",
    Prishtina: "PRI",
    Anderlecht: "AND",
    Shelbourne: "SHE",
    "Dynamo Kyiv": "DYN",
    Aberdeen: "ABE",
    "Wolfsberger AC": "WAC",
    "Hapoel Be'er Sheva": "HBS",
    Hacken: "BKH",
    Celje: "NKC",
    "Hamrun Spartans": "HAM",
    Lugano: "LUG",
    Partizan: "PAR",
    "Levski Sofia": "LEV",
    Breidablik: "BRE",
    "Lincoln Red Imps": "RDI",
    Hibernian: "HIB",
    Servette: "SFC",
    "Shakhtar Donetsk": "SHK",
    Aktobe: "AKT",
    "Slovan Bratislava": "SLO",
    "Rigas FS": "RFS",
    "Legia Warszawa": "LEG",
    "Sigma Olomouc": "OLO",
    Sheriff: "TIR",
    "Banik Ostrava": "FCB",
    Samsunspor: "SAM",
    "Lech Poznan": "LPO",
    "Spartak Trnava": "SPA",
    Fredrikstad: "FFK",
    Paks: "PAK",
    Noah: "NOA",
    Sabah: "SAB",
    "CFR Cluj": "CFR",
    "AEK Larnaca": "AEL"
  },
  codeToName: {
    AVL: "Aston Villa FC",
    BAS: "FC Basel 1893",
    BFC: "Bologna FC 1909",
    BRA: "SK Brann",
    RCC: "Real Club Celta de Vigo",
    CEL: "Celtic FC",
    DIN: "GNK Dinamo Zagreb",
    FCS: "SC Fotbal Club FCSB SA",
    FB: "Fenerbahce Spor Kulubu",
    FTC: "Ferencvarosi TC",
    FEY: "Feyenoord Rotterdam",
    SCF: "SC Freiburg",
    GNK: "KRC Genk",
    GAE: "Go Ahead Eagles",
    LIL: "Lille OSC",
    LUD: "PFK Ludogorets 1945 Razgrad",
    OL: "Olympique Lyonnais",
    MTA: "Maccabi Tel Aviv FC",
    MFF: "Malmo FF",
    FCM: "FC Midtjylland",
    NIC: "OGC Nice Cote d'Azur",
    NFO: "Nottingham Forest FC",
    PKT: "PAOK Thessaloniki FC",
    PAO: "Panathinaikos FC",
    POR: "FC Porto",
    RAN: "Rangers FC",
    RBB: "Real Betis Balompie",
    CZV: "FK Crvena zvezda Beograd",
    ROM: "AS Roma",
    RBS: "FC Salzburg",
    SBR: "Sporting Braga",
    STU: "SK Sturm Graz",
    VFB: "VfB Stuttgart 1893",
    UTR: "FC Utrecht",
    PLZ: "FC Viktoria Plzen",
    YB: "BSC Young Boys",
    KUP: "KuPS",
    RIJ: "Rijeka",
    BJK: "Besiktas",
    ILV: "Ilves",
    ZRI: "Zrinjski",
    KFS: "Shkendija",
    DRI: "Drita",
    PRI: "Prishtina",
    AND: "Anderlecht",
    SHE: "Shelbourne",
    DYN: "Dynamo Kyiv",
    ABE: "Aberdeen",
    WAC: "Wolfsberger AC",
    HBS: "Hapoel Be'er Sheva",
    BKH: "Hacken",
    NKC: "Celje",
    HAM: "Hamrun Spartans",
    LUG: "Lugano",
    PAR: "Partizan",
    LEV: "Levski Sofia",
    BRE: "Breidablik",
    RDI: "Lincoln Red Imps",
    HIB: "Hibernian",
    SFC: "Servette",
    SHK: "Shakhtar Donetsk",
    AKT: "Aktobe",
    SLO: "Slovan Bratislava",
    RFS: "Rigas FS",
    LEG: "Legia Warszawa",
    OLO: "Sigma Olomouc",
    TIR: "Sheriff",
    FCB: "Banik Ostrava",
    SAM: "Samsunspor",
    LPO: "Lech Poznan",
    SPA: "Spartak Trnava",
    FFK: "Fredrikstad",
    PAK: "Paks",
    NOA: "Noah",
    SAB: "Sabah",
    CFR: "CFR Cluj",
    AEL: "AEK Larnaca"
  },
  colors: {
    light: {
      avl: "rgba(103,14,54,1)",
      bas: "rgba(228,4,40,1)",
      bfc: "rgba(26,47,72,1)",
      bra: "rgba(227,26,34,1)",
      cel: "rgba(0,155,72,1)",
      czv: "rgba(235,25,38,1)",
      din: "rgba(0,80,159,1)",
      fb: "rgba(13,73,155,1)",
      fcm: "rgba(224,2,16,1)",
      fcs: "rgba(0,88,144,1)",
      fey: "rgba(255,1,0,1)",
      ftc: "rgba(11,115,64,1)",
      gae: "rgba(193,2,48,1)",
      gnk: "rgba(26,126,190,1)",
      lil: "rgba(224,30,19,1)",
      lud: "rgba(0,100,50,1)",
      mff: "rgba(19,28,42,1)",
      nfo: "rgba(221,0,0,1)",
      nic: "rgba(0,0,0,1)",
      ol: "rgba(20,56,127,1)",
      pao: "rgba(0,121,63,1)",
      pkt: "rgba(26,26,26,1)",
      plz: "rgba(223,3,28,1)",
      por: "rgba(0,66,140,1)",
      ran: "rgba(0,51,160,1)",
      rbb: "rgba(11,179,99,1)",
      rbs: "rgba(187,20,67,1)",
      rcc: "rgba(138,195,238,1)",
      rom: "rgba(151,10,44,1)",
      sbr: "rgba(192,13,30,1)",
      scf: "rgba(0,0,0,1)",
      stu: "rgba(0,0,0,1)",
      utr: "rgba(228,7,33,1)",
      vfb: "rgba(227,34,25,1)",
      yb: "rgba(249,204,17,1)"
    },
    dark: {
      avl: "rgba(141,74,104,1)",
      bas: "rgba(228,4,40,1)",
      bfc: "rgba(83,99,118,1)",
      bra: "rgba(227,26,34,1)",
      cel: "rgba(0,155,72,1)",
      czv: "rgba(235,25,38,1)",
      din: "rgba(238,53,42,1)",
      fb: "rgba(61,109,175,1)",
      fcm: "rgba(224,2,16,1)",
      fcs: "rgba(38,113,161,1)",
      fey: "rgba(255,1,0,1)",
      ftc: "rgba(11,115,64,1)",
      gae: "rgba(255,214,0,1)",
      gnk: "rgba(26,126,190,1)",
      lil: "rgba(224,30,19,1)",
      lud: "rgba(38,123,81,1)",
      mff: "rgba(102,107,117,1)",
      nfo: "rgba(221,0,0,1)",
      nic: "rgba(123,123,123,1)",
      ol: "rgba(67,96,153,1)",
      pao: "rgba(0,121,63,1)",
      pkt: "rgba(173,144,89,1)",
      plz: "rgba(223,3,28,1)",
      por: "rgba(64,113,169,1)",
      ran: "rgba(64,102,184,1)",
      rbb: "rgba(11,179,99,1)",
      rbs: "rgba(201,67,105,1)",
      rcc: "rgba(138,195,238,1)",
      rom: "rgba(167,47,76,1)",
      sbr: "rgba(205,61,75,1)",
      scf: "rgba(123,123,123,1)",
      stu: "rgba(123,123,123,1)",
      utr: "rgba(228,7,33,1)",
      vfb: "rgba(227,34,25,1)",
      yb: "rgba(249,204,17,1)"
    },
  },
};

const SOCCER_PLAYER_PROPS = {
  'GOALS': {
    fields: ['goals'],
    defensiveTeamFields: ['averageStats.defensive.goals'],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats : {
      "GP": "gamesPlayed",
      "G": "averageStats.goals",
      "SHO": "averageStats.totalShots",
      "SOT": "averageStats.shotsOnTarget",
      "MINS": "averageStats.minutesPlayed"
    },
    gamelogStats: {
      "G": "cumulativeStats.goals",
      "AST": "cumulativeStats.assists",
      "SHO": "cumulativeStats.totalShots",
      "SOT": "cumulativeStats.shotsOnTarget",
      "MINS": "cumulativeStats.minutesPlayed",
      // "CC": "cumulativeStats.chancesCreated",
      "DRI": "cumulativeStats.dribblesCompleted",
      "PAS": "cumulativeStats.totalPasses",
      "START": "cumulativeStats.started"
    },
    opposingSupportingStats: {
      "GP": {
        ranked: false,
        teamFields: ['gamesPlayed']
      },
      "G": {
        ranked: true,
        teamFields: ['averageStats.defensive.goals'],
        sortingOrder: 'asc'
      },
      "SHO": {
        ranked: true,
        teamFields: ['averageStats.defensive.shotsTotal'],
        sortingOrder: 'asc'
      },
      "SOT": {
        ranked: true,
        teamFields: ['averageStats.defensive.shotsOnTarget'],
        sortingOrder: 'asc'
      },
      "POS": {
        ranked: true,
        teamFields: ['averageStats.defensive.ballPossession'],
        sortingOrder: 'asc'
      }
    }
  },
  'ASSISTS': {
    fields: ['assists'],
    defensiveTeamFields: ['averageStats.defensive.assists'],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0.5,
    supportingStats : {
      "GP": "gamesPlayed",
      "AST": "averageStats.assists",
      "G": "averageStats.goals",
      "SHO": "averageStats.totalShots",
      "MINS": "averageStats.minutesPlayed"
    },
    gamelogStats: {
      "AST": "cumulativeStats.assists",
      "G": "cumulativeStats.goals",
      "SHO": "cumulativeStats.totalShots",
      "SOT": "cumulativeStats.shotsOnTarget",
      "MINS": "cumulativeStats.minutesPlayed",
      "DRI": "cumulativeStats.dribblesCompleted",
      "PAS": "cumulativeStats.totalPasses",
      "START": "cumulativeStats.started"
    },
    opposingSupportingStats: {
      "GP": {
        ranked: false,
        teamFields: ['gamesPlayed']
      },
      "AST": {
        ranked: true,
        teamFields: ['averageStats.defensive.assists'],
        sortingOrder: 'asc'
      },
      "G": {
        ranked: true,
        teamFields: ['averageStats.defensive.goals'],
        sortingOrder: 'asc'
      },
      "SHO": {
        ranked: true,
        teamFields: ['averageStats.defensive.shotsTotal'],
        sortingOrder: 'asc'
      },
      "SOT": {
        ranked: true,
        teamFields: ['averageStats.defensive.shotsOnTarget'],
        sortingOrder: 'asc'
      }
    }
  },
  'SHOTS_ON_TARGET': {
    fields: ['shotsOnTarget'],
    defensiveTeamFields: ['averageStats.defensive.shotsOnTarget'],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0.5,
    supportingStats : {
      "GP": "gamesPlayed",
      "SOT": "averageStats.shotsOnTarget",
      "SHO": "averageStats.totalShots",
      "G": "averageStats.goals",
      "MINS": "averageStats.minutesPlayed"
    },
    gamelogStats: {
      "SOT": "cumulativeStats.shotsOnTarget",
      "SHO": "cumulativeStats.totalShots",
      "G": "cumulativeStats.goals",
      "AST": "cumulativeStats.assists",
      "MINS": "cumulativeStats.minutesPlayed",
      "DRI": "cumulativeStats.dribblesCompleted",
      "PAS": "cumulativeStats.totalPasses",
      "START": "cumulativeStats.started"
    },
    opposingSupportingStats: {
      "GP": {
        ranked: false,
        teamFields: ['gamesPlayed']
      },
      "SOT": {
        ranked: true,
        teamFields: ['averageStats.defensive.shotsOnTarget'],
        sortingOrder: 'asc'
      },
      "SHO": {
        ranked: true,
        teamFields: ['averageStats.defensive.shotsTotal'],
        sortingOrder: 'asc'
      },
      "G": {
        ranked: true,
        teamFields: ['averageStats.defensive.goals'],
        sortingOrder: 'asc'
      },
      "AST": {
        ranked: true,
        teamFields: ['averageStats.defensive.assists'],
        sortingOrder: 'asc'
      }
    }
  },
  'SHOTS': {
    fields: ['totalShots'],
    defensiveTeamFields: ['averageStats.defensive.shotsTotal'],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0.5,
    supportingStats : {
      "GP": "gamesPlayed",
      "SHO": "averageStats.totalShots",
      "SOT": "averageStats.shotsOnTarget",
      "G": "averageStats.goals",
      "MINS": "averageStats.minutesPlayed"
    },
    gamelogStats: {
      "SHO": "cumulativeStats.totalShots",
      "SOT": "cumulativeStats.shotsOnTarget",
      "G": "cumulativeStats.goals",
      "AST": "cumulativeStats.assists",
      "MINS": "cumulativeStats.minutesPlayed",
      "DRI": "cumulativeStats.dribblesCompleted",
      "PAS": "cumulativeStats.totalPasses",
      "START": "cumulativeStats.started"
    },
    opposingSupportingStats: {
      "GP": {
        ranked: false,
        teamFields: ['gamesPlayed']
      },
      "SHO": {
        ranked: true,
        teamFields: ['averageStats.defensive.shotsTotal'],
        sortingOrder: 'asc'
      },
      "SOT": {
        ranked: true,
        teamFields: ['averageStats.defensive.shotsOnTarget'],
        sortingOrder: 'asc'
      },
      "G": {
        ranked: true,
        teamFields: ['averageStats.defensive.goals'],
        sortingOrder: 'asc'
      },
      "AST": {
        ranked: true,
        teamFields: ['averageStats.defensive.assists'],
        sortingOrder: 'asc'
      }
    }
  },
  'GOAL_OR_ASSIST': {
    fields: ['goals', 'assists'],
    defensiveTeamFields: ['averageStats.defensive.goals', 'averageStats.defensive.assists'],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats : {
      "GP": "gamesPlayed",
      "G": "averageStats.goals",
      "SHO": "averageStats.totalShots",
      "SOT": "averageStats.shotsOnTarget",
      "MINS": "averageStats.minutesPlayed"
    },
    gamelogStats: {
      "G": "cumulativeStats.goals",
      "AST": "cumulativeStats.assists",
      "SHO": "cumulativeStats.totalShots",
      "SOT": "cumulativeStats.shotsOnTarget",
      "MINS": "cumulativeStats.minutesPlayed",
      // "CC": "cumulativeStats.chancesCreated",
      "DRI": "cumulativeStats.dribblesCompleted",
      "PAS": "cumulativeStats.totalPasses",
      "START": "cumulativeStats.started"
    },
    opposingSupportingStats: {
      "GP": {
        ranked: false,
        teamFields: ['gamesPlayed']
      },
      "G": {
        ranked: true,
        teamFields: ['averageStats.defensive.goals'],
        sortingOrder: 'asc'
      },
      "SHO": {
        ranked: true,
        teamFields: ['averageStats.defensive.shotsTotal'],
        sortingOrder: 'asc'
      },
      "SOT": {
        ranked: true,
        teamFields: ['averageStats.defensive.shotsOnTarget'],
        sortingOrder: 'asc'
      },
      "POS": {
        ranked: true,
        teamFields: ['averageStats.defensive.ballPossession'],
        sortingOrder: 'asc'
      }
    }
  },
  'TACKLES': {
    fields: ['totalTackles'],
    defensiveTeamFields: [],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats : {
      "GP": "gamesPlayed",
      "TCK": "averageStats.totalTackles",
      "FLS": "averageStats.foulsCommitted",
      "PAS": "averageStats.totalPasses",
      "MINS": "averageStats.minutesPlayed"
    },
    gamelogStats: {
      "TCK": "cumulativeStats.totalTackles",
      "FLS": "cumulativeStats.foulsCommitted",
      "MINS": "cumulativeStats.minutesPlayed",
      "YEL": "cumulativeStats.yellowCards",
      "RED": "cumulativeStats.redCards",
      "START": "cumulativeStats.started"
    },
    opposingSupportingStats: {
      "GP": {
        ranked: false,
        teamFields: ['gamesPlayed']
      },
      "FLS": {
        ranked: true,
        teamFields: ['averageStats.defensive.fouls'],
        sortingOrder: 'desc'
      },
      "COR": {
        ranked: true,
        teamFields: ['averageStats.defensive.cornerKicks'],
        sortingOrder: 'asc'
      },
      "SHO": {
        ranked: true,
        teamFields: ['averageStats.defensive.shotsTotal'],
        sortingOrder: 'asc'
      },
      "POS": {
        ranked: true,
        teamFields: ['averageStats.defensive.ballPossession'],
        sortingOrder: 'asc'
      }
    }
  },
  'CARDS': {
    fields: ['yellowCards', 'redCards'],
    defensiveTeamFields: ['averageStats.defensive.yellowCards', 'averageStats.defensive.redCards'],
    defensiveSortingOrder: 'desc',
    defaultLineValue: 0,
    supportingStats : {
      "GP": "gamesPlayed",
      // TODO: can't do card here, we don't have a single field to track total cards
      // "CARD": "averageStats.",
      "FLS": "averageStats.foulsCommitted",
      "TCK": "averageStats.totalTackles",
      "MINS": "averageStats.minutesPlayed"
    },
    gamelogStats: {
      "YEL": "cumulativeStats.yellowCards",
      "RED": "cumulativeStats.redCards",
      "MINS": "cumulativeStats.minutesPlayed",
      "TCK": "cumulativeStats.totalTackles",
      "START": "cumulativeStats.started"
    },
    opposingSupportingStats: {
      "GP": {
        ranked: false,
        teamFields: ['gamesPlayed']
      },
      "FLS": {
        ranked: true,
        teamFields: ['averageStats.defensive.fouls'],
        sortingOrder: 'desc'
      },
      "YEL": {
        ranked: true,
        teamFields: ['averageStats.defensive.yellowCards'],
        sortingOrder: 'desc'
      },
      "RED": {
        ranked: true,
        teamFields: ['averageStats.defensive.redCards'],
        sortingOrder: 'desc'
      },
      "POS": {
        ranked: true,
        teamFields: ['averageStats.defensive.ballPossession'],
        sortingOrder: 'asc'
      }
    }
  }
}

const FOOTBALL_PLAYER_PROPS_INFO = {
  'ANYTIME_TOUCHDOWN': {
    fields: ['receivingTouchdowns', 'rushingTouchdowns'],
    defensiveTeamFields: ['averageStats.defensive.totalTouchdowns'],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats: {
      "GP": "gamesPlayed",
      "REC TD": "averageStats.receivingTouchdowns",
      "RUSH TD": "averageStats.rushingTouchdowns",
      "REC YDS": "averageStats.receivingYards",
      "RUSH YDS": "averageStats.rushingYards"
    },
    gamelogStats: {
      "REC TD": "cumulativeStats.receivingTouchdowns",
      "RUSH TD": "cumulativeStats.rushingTouchdowns",
      "REC YDS": "cumulativeStats.receivingYards",
      "RUSH YDS": "cumulativeStats.rushingYards",
      "RZ TGT": "cumulativeStats.redzoneTargets",
      "RZ ATT": "cumulativeStats.redzoneRushingAttempts"
    },
    opposingSupportingStats: {
      "GP": {
        ranked: false,
        teamFields: ['gamesPlayed']
      },
      "PASS TD": {
        ranked: true,
        teamFields: ['averageStats.defensive.passingTouchdowns'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.passingTouchdowns`],
        sortingOrder: 'asc'
      },
      "RUSH TD": {
        ranked: true,
        teamFields: ['averageStats.defensive.rushingTouchdowns'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.rushingTouchdowns`],
        sortingOrder: 'asc'
      },
      "PASS YDS": {
        ranked: true,
        teamFields: ['averageStats.defensive.passingYards'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.passingYards`],
        sortingOrder: 'asc'
      },
      "RUSH YDS": {
        ranked: true,
        teamFields: ['averageStats.defensive.rushingYards'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.rushingYards`],
        sortingOrder: 'asc'
      }
    }
  },  
  'ANYTIME_TOUCHDOWN_1Q': {
    fields: ['receivingTouchdowns1q', 'rushingTouchdowns1q'],
    defensiveTeamFields: [],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats: {},
    gamelogStats: {
      "1Q RUSH TD": "cumulativeStats.rushingTouchdowns1q",
      "1Q REC TD": "cumulativeStats.receivingTouchdowns1q",
      "1Q RUSH YDS": "cumulativeStats.rushingYards1q",
      "1Q REC YDS": "cumulativeStats.receivingYards1q"
    },
    opposingSupportingStats: {}
  },
  'PASSING_YARDS': {
    fields: ['passingYards'],
    defensiveTeamFields: ['averageStats.defensive.passingYards'],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats : {
      "GP": "gamesPlayed",
      "PASS YDS": "averageStats.passingYards",
      "PASS ATT": "averageStats.passingAttempts",
      "PASS COMPL": "averageStats.passingCompletions",
      "PASS TD": "averageStats.passingTouchdowns"
    },
    gamelogStats: {
      "PASS YDS": "cumulativeStats.passingYards",
      "PASS ATT": "cumulativeStats.passingAttempts",
      "PASS COMPL": "cumulativeStats.passingCompletions",
      "PASS TD": "cumulativeStats.passingTouchdowns",
      "INT": "cumulativeStats.interceptions",
      "RZ ATT": "cumulativeStats.redzonePassingAttempts",
      "RZ COMPL": "cumulativeStats.redzoneCompletions",
      "RZ TD": "cumulativeStats.redzonePassingTouchdowns"
    },
    opposingSupportingStats: {
      "GP": {
        ranked: false,
        teamFields: ['gamesPlayed']
      },
      "PASS YDS": {
        ranked: true,
        teamFields: ['averageStats.defensive.passingYards'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.passingYards`],
        sortingOrder: 'asc'
      },
      "PASS ATT": {
        ranked: true,
        teamFields: ['averageStats.defensive.passingAttempts'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.passingAttempts`],
        sortingOrder: 'asc'
      },
      "PASS COMPL": {
        ranked: true,
        teamFields: ['averageStats.defensive.passingCompletions'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.passingCompletions`],
        sortingOrder: 'asc'
      },
      "PASS TD": {
        ranked: true,
        teamFields: ['averageStats.defensive.passingTouchdowns'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.passingTouchdowns`],
        sortingOrder: 'asc'
      }
    }
  },
  'PASSING_YARDS_1Q': {
    fields: ['passingYards1q'],
    defensiveTeamFields: [],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats : {},
    gamelogStats: {
      "1Q PASS YDS": "cumulativeStats.passingYards1q",
      "1Q RUSH YDS": "cumulativeStats.rushingYards1q",
      "1Q PASS TD": "cumulativeStats.passingTouchdowns1q",
      "1Q RUSH TD": "cumulativeStats.rushingTouchdowns1q"
    },
    opposingSupportingStats: {}
  },
  'PASSING_TOUCHDOWNS': {
    fields: ['passingTouchdowns'],
    defensiveTeamFields: ['averageStats.defensive.passingTouchdowns'],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats : {
      "GP": "gamesPlayed",
      "PASS TD": "averageStats.passingTouchdowns",
      "PASS YDS": "averageStats.passingYards",
      "PASS ATT": "averageStats.passingAttempts",
      "PASS COMPL": "averageStats.passingCompletions",
    },
    gamelogStats: {
      "PASS TD": "cumulativeStats.passingTouchdowns",
      "PASS ATT": "cumulativeStats.passingAttempts",
      "PASS YDS": "cumulativeStats.passingYards",
      "PASS COMPL": "cumulativeStats.passingCompletions",
      "INT": "cumulativeStats.interceptions",
      "RZ ATT": "cumulativeStats.redzonePassingAttempts",
      "RZ COMPL": "cumulativeStats.redzoneCompletions",
      "RZ TD": "cumulativeStats.redzonePassingTouchdowns"
    },
    opposingSupportingStats: {
      "GP": {
        ranked: false,
        teamFields: ['gamesPlayed']
      },
      "PASS TD": {
        ranked: true,
        teamFields: ['averageStats.defensive.passingTouchdowns'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.passingTouchdowns`],
        sortingOrder: 'asc'
      },
      "PASS YDS": {
        ranked: true,
        teamFields: ['averageStats.defensive.passingYards'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.passingYards`],
        sortingOrder: 'asc'
      },
      "PASS ATT": {
        ranked: true,
        teamFields: ['averageStats.defensive.passingAttempts'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.passingAttempts`],
        sortingOrder: 'asc'
      },
      "PASS COMPL": {
        ranked: true,
        teamFields: ['averageStats.defensive.passingCompletions'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.passingCompletions`],
        sortingOrder: 'asc'
      }
    }
  },
  'PASSING_COMPLETIONS': {
    fields: ['passingCompletions'],
    defensiveTeamFields: ['averageStats.defensive.passingCompletions'],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats : {
      "GP": "gamesPlayed",
      "PASS COMPL": "averageStats.passingCompletions",
      "PASS YDS": "averageStats.passingYards",
      "PASS ATT": "averageStats.passingAttempts",
      "PASS TD": "averageStats.passingTouchdowns"
    },
    gamelogStats: {
      "PASS COMPL": "cumulativeStats.passingCompletions",
      "PASS ATT": "cumulativeStats.passingAttempts",
      "PASS YDS": "cumulativeStats.passingYards",
      "PASS TD": "cumulativeStats.passingTouchdowns",
      "INT": "cumulativeStats.interceptions",
      "RZ ATT": "cumulativeStats.redzonePassingAttempts",
      "RZ COMPL": "cumulativeStats.redzoneCompletions",
      "RZ TD": "cumulativeStats.redzonePassingTouchdowns"
    },
    opposingSupportingStats: {
      "GP": {
        ranked: false,
        teamFields: ['gamesPlayed']
      },
      "PASS COMPL": {
        ranked: true,
        teamFields: ['averageStats.defensive.passingCompletions'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.passingCompletions`],
        sortingOrder: 'asc'
      },
      "PASS YDS": {
        ranked: true,
        teamFields: ['averageStats.defensive.passingYards'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.passingYards`],
        sortingOrder: 'asc'
      },
      "PASS ATT": {
        ranked: true,
        teamFields: ['averageStats.defensive.passingAttempts'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.passingAttempts`],
        sortingOrder: 'asc'
      },
      "PASS TD": {
        ranked: true,
        teamFields: ['averageStats.defensive.passingTouchdowns'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.passingTouchdowns`],
        sortingOrder: 'asc'
      }
    }
  },
  'PASSING_ATTEMPTS': {
    fields: ['passingAttempts'],
    defensiveTeamFields: ['averageStats.defensive.passingAttempts'],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats : {
      "GP": "gamesPlayed",
      "PASS ATT": "averageStats.passingAttempts",
      "PASS YDS": "averageStats.passingYards",
      "PASS COMPL": "averageStats.passingCompletions",
      "PASS TD": "averageStats.passingTouchdowns"
    },
    gamelogStats: {
      "PASS ATT": "cumulativeStats.passingAttempts",
      "PASS YDS": "cumulativeStats.passingYards",
      "PASS COMPL": "cumulativeStats.passingCompletions",
      "PASS TD": "cumulativeStats.passingTouchdowns",
      "INT": "cumulativeStats.interceptions",
      "RZ ATT": "cumulativeStats.redzonePassingAttempts",
      "RZ COMPL": "cumulativeStats.redzoneCompletions",
      "RZ TD": "cumulativeStats.redzonePassingTouchdowns"
    },
    opposingSupportingStats: {
      "GP": {
        ranked: false,
        teamFields: ['gamesPlayed']
      },
      "PASS ATT": {
        ranked: true,
        teamFields: ['averageStats.defensive.passingAttempts'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.passingAttempts`],
        sortingOrder: 'asc'
      },
      "PASS YDS": {
        ranked: true,
        teamFields: ['averageStats.defensive.passingYards'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.passingYards`],
        sortingOrder: 'asc'
      },
      "PASS COMPL": {
        ranked: true,
        teamFields: ['averageStats.defensive.passingCompletions'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.passingCompletions`],
        sortingOrder: 'asc'
      },
      "PASS TD": {
        ranked: true,
        teamFields: ['averageStats.defensive.passingTouchdowns'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.passingTouchdowns`],
        sortingOrder: 'asc'
      }
    }
  },
  'INTERCEPTIONS': {
    fields: ['interceptions'],
    defensiveTeamFields: ['averageStats.defensive.interceptions'],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats : {
      "GP": "gamesPlayed",
      "INT": "averageStats.interceptions",
      "PASS ATT": "averageStats.passingAttempts",
      "PASS COMPL": "averageStats.passingCompletions",
      "PASS TD": "averageStats.passingTouchdowns"
    },
    gamelogStats: {
      "INT": "cumulativeStats.interceptions",
      "PASS ATT": "cumulativeStats.passingAttempts",
      "PASS COMPL": "cumulativeStats.passingCompletions",
      "PASS YDS": "cumulativeStats.passingYards",
      "PASS TD": "cumulativeStats.passingTouchdowns",
      "RZ ATT": "cumulativeStats.redzonePassingAttempts",
      "RZ COMPL": "cumulativeStats.redzoneCompletions",
      "RZ TD": "cumulativeStats.redzonePassingTouchdowns"
    },
    opposingSupportingStats: {
      "GP": {
        ranked: false,
        teamFields: ['gamesPlayed']
      },
      "INT": {
        ranked: true,
        teamFields: ['averageStats.defensive.interceptions'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.interceptions`],
        sortingOrder: 'desc'
      },
      "PASS ATT": {
        ranked: true,
        teamFields: ['averageStats.defensive.passingAttempts'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.passingAttempts`],
        sortingOrder: 'asc'
      },
      "PASS COMPL": {
        ranked: true,
        teamFields: ['averageStats.defensive.passingCompletions'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.passingCompletions`],
        sortingOrder: 'asc'
      },
      "PASS TD": {
        ranked: true,
        teamFields: ['averageStats.defensive.passingTouchdowns'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.passingTouchdowns`],
        sortingOrder: 'asc'
      }
    }
  },
  'RECEIVING_YARDS': {
    fields: ['receivingYards'],
    defensiveTeamFields: ['averageStats.defensive.receivingYards'],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats : {
      "GP": "gamesPlayed",
      "REC YDS": "averageStats.receivingYards",
      "TGT": "averageStats.targets",
      "REC": "averageStats.receptions",
      "REC TD": "averageStats.receivingTouchdowns"
    },
    gamelogStats: {
      "REC YDS": "cumulativeStats.receivingYards",
      "TGT": "cumulativeStats.targets",
      "REC": "cumulativeStats.receptions",
      "REC TD": "cumulativeStats.receivingTouchdowns",
      "RZ TGT": "cumulativeStats.redzoneTargets",
      "RZ REC": "cumulativeStats.redzoneReceptions",
      "RZ TD": "cumulativeStats.redzoneReceivingTouchdowns"
    },
    opposingSupportingStats: {
      "GP": {
        ranked: false,
        teamFields: ['gamesPlayed']
      },
      "REC YDS": {
        ranked: true,
        teamFields: ['averageStats.defensive.passingYards'],
        sortingOrder: 'asc'
      },
      "REC": {
        ranked: true,
        teamFields: ['averageStats.defensive.passingCompletions'],
        sortingOrder: 'asc'
      },
      "TGT": {
        ranked: true,
        teamFields: ['averageStats.defensive.passingAttempts'],
        sortingOrder: 'asc'
      },
      "3D%": {
        ranked: true,
        teamFields: ['averageStats.defensive.thirdDownConversionPercentage'],
        sortingOrder: 'asc'
      }
    },
    opposingPositionalSupportingStats: {
      "GP": {
        ranked: false,
        teamFields: ['gamesPlayed']
      },
      "REC YDS": {
        ranked: true,
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.receivingYards`],
        sortingOrder: 'asc'
      },
      "REC": {
        ranked: true,
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.receptions`],
        sortingOrder: 'asc'
      },
      "TGT": {
        ranked: true,
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.targets`],
        sortingOrder: 'asc'
      },
      "REC TD": {
        ranked: true,
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.receivingTouchdowns`],
        sortingOrder: 'asc'
      }
    }
  },
  'RECEIVING_YARDS_1Q': {
    fields: ['receivingYards1q'],
    defensiveTeamFields: [],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats : {},
    gamelogStats: {
      "1Q REC YDS": "cumulativeStats.receivingYards1q",
      "1Q RUSH YDS": "cumulativeStats.rushingYards1q",
      "1Q REC TD": "cumulativeStats.receivingTouchdowns1q",
      "1Q RUSH TD": "cumulativeStats.rushingTouchdowns1q"
    },
    opposingSupportingStats: {}
  },
  'RECEPTIONS': {
    fields: ['receptions'],
    defensiveTeamFields: ['averageStats.defensive.receptions'],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats : {
      "GP": "gamesPlayed",
      "REC": "averageStats.receptions",
      "REC YDS": "averageStats.receivingYards",
      "TGT": "averageStats.targets",
      "REC TD": "averageStats.receivingTouchdowns"
    },
    gamelogStats: {
      "REC": "cumulativeStats.receptions",
      "TGT": "cumulativeStats.targets",
      "REC YDS": "cumulativeStats.receivingYards",
      "REC TD": "cumulativeStats.receivingTouchdowns",
      "RZ TGT": "cumulativeStats.redzoneTargets",
      "RZ REC": "cumulativeStats.redzoneReceptions",
      "RZ TD": "cumulativeStats.redzoneReceivingTouchdowns"
    },
    opposingSupportingStats: {
      "GP": {
        ranked: false,
        teamFields: ['gamesPlayed']
      },
      "REC": {
        ranked: true,
        teamFields: ['averageStats.defensive.passingCompletions'],
        sortingOrder: 'asc'
      },
      "REC YDS": {
        ranked: true,
        teamFields: ['averageStats.defensive.passingYards'],
        sortingOrder: 'asc'
      },
      "REC TD": {
        ranked: true,
        teamFields: ['averageStats.defensive.passingTouchdowns'],
        sortingOrder: 'asc'
      },
      "3D%": {
        ranked: true,
        teamFields: ['averageStats.defensive.thirdDownConversionPercentage'],
        sortingOrder: 'asc'
      }
    },
    opposingPositionalSupportingStats: {
      "GP": {
        ranked: false,
        teamFields: ['gamesPlayed']
      },
      "REC": {
        ranked: true,
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.receptions`],
        sortingOrder: 'asc'
      },
      "REC YDS": {
        ranked: true,
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.receivingYards`],
        sortingOrder: 'asc'
      },
      "REC TD": {
        ranked: true,
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.receivingTouchdowns`],
        sortingOrder: 'asc'
      },
      "TGT": {
        ranked: true,
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.targets`],
        sortingOrder: 'asc'
      }
    }
  },
  'RUSHING_YARDS': {
    fields: ['rushingYards'],
    defensiveTeamFields: ['averageStats.defensive.rushingYards'],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats: {
      "GP": "gamesPlayed",
      "RUSH YDS": "averageStats.rushingYards",
      "RUSH ATT": "averageStats.rushingAttempts",
      "RUSH TD": "averageStats.rushingTouchdowns",
      "1D": "averageStats.rushingFirstDowns"
    },
    gamelogStats: {
      "RUSH YDS": "cumulativeStats.rushingYards",
      "RUSH ATT": "cumulativeStats.rushingAttempts",
      "RUSH TD": "cumulativeStats.rushingTouchdowns",
      "REC YDS": "cumulativeStats.receivingYards",
      "REC": "cumulativeStats.receptions",
      "TGT": "cumulativeStats.targets",
      "RZ RUSH": "cumulativeStats.redzoneRushingAttempts",
      "RZ TD": "cumulativeStats.redzoneRushingTouchdowns"
    },
    opposingSupportingStats: {
      "GP": {
        ranked: false,
        teamFields: ['gamesPlayed']
      },
      "RUSH YDS": {
        ranked: true,
        teamFields: ['averageStats.defensive.rushingYards'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.rushingYards`],
        sortingOrder: 'asc'
      },
      "RUSH ATT": {
        ranked: true,
        teamFields: ['averageStats.defensive.rushingAttempts'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.rushingAttempts`],
        sortingOrder: 'asc'
      },
      "RUSH TD": {
        ranked: true,
        teamFields: ['averageStats.defensive.rushingTouchdowns'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.rushingTouchdowns`],
        sortingOrder: 'asc'
      },
      "RUSH 1D": {
        ranked: true,
        teamFields: ['averageStats.defensive.firstDowns'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.rushingFirstDowns`],
        sortingOrder: 'asc'
      }
    }
  },
  'RUSHING_YARDS_1Q': {
    fields: ['rushingYards1q'],
    defensiveTeamFields: [],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats: {},
    gamelogStats: {
      "1Q RUSH YDS": "cumulativeStats.rushingYards1q",
      "1Q REC YDS": "cumulativeStats.receivingYards1q",
      "1Q RUSH TD": "cumulativeStats.rushingTouchdowns1q",
      "1Q REC TD": "cumulativeStats.receivingTouchdowns1q"
    },
    opposingSupportingStats: {}
  },
  'RUSHING_ATTEMPTS': {
    fields: ['rushingAttempts'],
    defensiveTeamFields: ['averageStats.defensive.rushingAttempts'],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats: {
      "GP": "gamesPlayed",
      "RUSH ATT": "averageStats.rushingAttempts",
      "RUSH YDS": "averageStats.rushingYards",
      "RUSH TD": "averageStats.rushingTouchdowns",
      "1D": "averageStats.rushingFirstDowns"
    },
    gamelogStats: {
      "RUSH ATT": "cumulativeStats.rushingAttempts",
      "RUSH YDS": "cumulativeStats.rushingYards",
      "RUSH TD": "cumulativeStats.rushingTouchdowns",
      "REC YDS": "cumulativeStats.receivingYards",
      "REC": "cumulativeStats.receptions",
      "TGT": "cumulativeStats.targets",
      "RZ RUSH": "cumulativeStats.redzoneRushingAttempts",
      "RZ TD": "cumulativeStats.redzoneRushingTouchdowns"
    },
    opposingSupportingStats: {
      "GP": {
        ranked: false,
        teamFields: ['gamesPlayed']
      },
      "RUSH ATT": {
        ranked: true,
        teamFields: ['averageStats.defensive.rushingAttempts'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.rushingAttempts`],
        sortingOrder: 'asc'
      },
      "RUSH YDS": {
        ranked: true,
        teamFields: ['averageStats.defensive.rushingYards'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.rushingYards`],
        sortingOrder: 'asc'
      },
      "RUSH TD": {
        ranked: true,
        teamFields: ['averageStats.defensive.rushingTouchdowns'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.rushingTouchdowns`],
        sortingOrder: 'asc'
      },
      "RUSH 1D": {
        ranked: true,
        teamFields: ['averageStats.defensive.firstDowns'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.rushingFirstDowns`],
        sortingOrder: 'asc'
      }
    }
  },
  'RUSHING_PLUS_RECEIVING_YARDS': {
    fields: ['rushingYards', 'receivingYards'],
    defensiveTeamFields: ['averageStats.defensive.rushingYards', 'averageStats.defensive.receivingYards'],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats: {
      "GP": "gamesPlayed",
      "RUSH YDS": "averageStats.rushingYards",
      "REC YDS": "averageStats.receivingYards",
      "RUSH ATT": "averageStats.rushingAttempts",
      "REC": "averageStats.receptions"
    },
    gamelogStats: {
      "RUSH YDS": "cumulativeStats.rushingYards",
      "REC YDS": "cumulativeStats.receivingYards",
      "RUSH ATT": "cumulativeStats.rushingAttempts",
      "TGT": "cumulativeStats.targets",
      "REC": "cumulativeStats.receptions",
      "REC TD": "cumulativeStats.receivingTouchdowns",
      "RUSH TD": "cumulativeStats.rushingTouchdowns"
    },
    opposingSupportingStats: {
      "GP": {
        ranked: false,
        teamFields: ['gamesPlayed']
      },
      "RUSH YDS": {
        ranked: true,
        teamFields: ['averageStats.defensive.rushingYards'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.rushingYards`],
        sortingOrder: 'asc'
      },
      "REC YDS": {
        ranked: true,
        teamFields: ['averageStats.defensive.passingYards'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.receivingYards`],
        sortingOrder: 'asc'
      },
      "RUSH ATT": {
        ranked: true,
        teamFields: ['averageStats.defensive.rushingAttempts'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.rushingAttempts`],
        sortingOrder: 'asc'
      },
      "REC": {
        ranked: true,
        teamFields: ['averageStats.defensive.passingCompletions'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.receptions`],
        sortingOrder: 'asc'
      }
    }
  },
  'PASSING_PLUS_RUSHING_YARDS': {
    fields: ['passingYards', 'rushingYards'],
    defensiveTeamFields: ['averageStats.defensive.passingYards', 'averageStats.defensive.rushingYards'],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats: {
      "GP": "gamesPlayed",
      "PASS YDS": "averageStats.passingYards",
      "RUSH YDS": "averageStats.rushingYards",
      "PASS ATT": "averageStats.passingAttempts",
      "RUSH ATT": "averageStats.rushingAttempts"
    },
    gamelogStats: {
      "PASS YDS": "cumulativeStats.passingYards",
      "RUSH YDS": "cumulativeStats.rushingYards",
      "PASS ATT": "cumulativeStats.passingAttempts",
      "PASS COMPL": "cumulativeStats.passingCompletions",
      "RUSH ATT": "cumulativeStats.rushingAttempts",
      "PASS TD": "cumulativeStats.passingTouchdowns",
      "RUSH TD": "cumulativeStats.rushingTouchdowns",
    },
    opposingSupportingStats: {
      "GP": {
        ranked: false,
        teamFields: ['gamesPlayed']
      },
      "PASS YDS": {
        ranked: true,
        teamFields: ['averageStats.defensive.passingYards'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.passingYards`],
        sortingOrder: 'asc'
      },
      "RUSH YDS": {
        ranked: true,
        teamFields: ['averageStats.defensive.rushingYards'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.rushingYards`],
        sortingOrder: 'asc'
      },
      "PASS ATT": {
        ranked: true,
        teamFields: ['averageStats.defensive.passingAttempts'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.passingAttempts`],
        sortingOrder: 'asc'
      },
      "RUSH ATT": {
        ranked: true,
        teamFields: ['averageStats.defensive.rushingAttempts'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.rushingAttempts`],
        sortingOrder: 'asc'
      }
    }
  },
  'RUSHING_PLUS_RECEIVING_YARDS_1Q': {
    fields: ['rushingYards1q', 'receivingYards1q'],
    defensiveTeamFields: [],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats: {},
    gamelogStats: {
      "1Q RUSH YDS": "cumulativeStats.rushingYards1q",
      "1Q REC YDS": "cumulativeStats.receivingYards1q",
      "1Q RUSH TD": "cumulativeStats.rushingTouchdowns1q",
      "1Q REC TD": "cumulativeStats.receivingTouchdowns1q"
    },
    opposingSupportingStats: {}
  },
  'PASSING_PLUS_RUSHING_YARDS_1Q': {
    fields: ['passingYards1q', 'rushingYards1q'],
    defensiveTeamFields: [],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats: {},
    gamelogStats: {
      "1Q PASS YDS": "cumulativeStats.passingYards1q",
      "1Q RUSH YDS": "cumulativeStats.rushingYards1q",
      "1Q PASS TD": "cumulativeStats.passingTouchdowns1q",
      "1Q RUSH TD": "cumulativeStats.rushingTouchdowns1q"
    },
    opposingSupportingStats: {}
  },
  'EXTRA_POINTS_MADE': {
    fields: ['extraPointsMade'],
    defensiveTeamFields: [],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats: {},
    gamelogStats: {
      "XPM": "cumulativeStats.extraPointsMade",
      "XPA": "cumulativeStats.extraPointAttempts",
      "XP%": "cumulativeStats.extraPointPercentage"
    },
    opposingSupportingStats: {}
  },
  'FIELD_GOALS_MADE': {
    fields: ['fieldGoalsMade'],
    defensiveTeamFields: [],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats: {},
    gamelogStats: {
      "FGM": "cumulativeStats.fieldGoalsMade",
      "FGA": "cumulativeStats.fieldGoalAttempts",
      "FG%": "cumulativeStats.fieldGoalPercentage"
    },
    opposingSupportingStats: {}
  },
  'KICKING_POINTS': {
    fields: ['pointsKicked'],
    defensiveTeamFields: [],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats: {},
    gamelogStats: {
      "K PTS": "cumulativeStats.pointsKicked",
      "FGM": "cumulativeStats.fieldGoalsMade",
      "XPM": "cumulativeStats.extraPointsMade"
    },
    opposingSupportingStats: {}
  }
}

const BASKETBALL_PLAYER_PROPS_INFO = {
  'POINTS': {
    fields: ['points'],
    defensiveTeamFields: ['averageStats.defensive.points'],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats : {
      "GP": "gamesPlayed",
      "PTS": "averageStats.points",
      "FG%": "averageStats.fieldGoalPercentage",
      "FT%": "averageStats.freeThrowPercentage",
      "MIN": "averageStats.minutesPlayed"
    },
    gamelogStats: {
      "PTS": "cumulativeStats.points",
      "AST": "cumulativeStats.assists",
      "REB": "cumulativeStats.rebounds",
      "MIN": "cumulativeStats.minutesPlayed",
      "3PTM": "cumulativeStats.threePointsMade",
      "3PT%": "cumulativeStats.threePointPercentage",
      "FT%": "cumulativeStats.freeThrowPercentage",
      "FG%": "cumulativeStats.fieldGoalPercentage",
      "FGA": "cumulativeStats.fieldGoalAttempts",
      "FGM": "cumulativeStats.fieldGoalsMade",
      "FTA": "cumulativeStats.freeThrowAttempts",
      "FTM": "cumulativeStats.freeThrowsMade"
    },
    opposingSupportingStats: {
      "GP": {
        ranked: false,
        teamFields: ['gamesPlayed']
      },
      "PTS": {
        ranked: true,
        teamFields: ['averageStats.defensive.points'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.points`],
        sortingOrder: 'asc'
      },
      "FG%": {
        ranked: true,
        teamFields: ['averageStats.defensive.fieldGoalPercentage'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.fieldGoalPercentage`],
        sortingOrder: 'asc'
      },
      "FT%": {
        ranked: true,
        teamFields: ['averageStats.defensive.freeThrowPercentage'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.freeThrowPercentage`],
        sortingOrder: 'asc'
      },
      "3PT%": {
        ranked: true,
        teamFields: ['averageStats.defensive.threePointPercentage'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.threePointPercentage`],
        sortingOrder: 'asc'
      }
    }
  },
  'POINTS_1Q': {
    fields: ['points1q'],
    defensiveTeamFields: ['averageStats.defensive.points1q'],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats : {
      "GP": "gamesPlayed",
      "1Q PTS": "averageStats.points1q",
      "1Q AST": "averageStats.assists1q",
      "1Q REB": "averageStats.rebounds1q",
      "1Q MIN": "averageStats.minutesPlayed1q"
    },
    gamelogStats: {
      "1Q PTS": "cumulativeStats.points1q",
      "1Q AST": "cumulativeStats.assists1q",
      "1Q REB": "cumulativeStats.rebounds1q",
      "1Q MIN": "cumulativeStats.minutesPlayed1q",
      "1Q FGA": "cumulativeStats.fieldGoalAttempts1q",
      "1Q 3PTA": "cumulativeStats.threePointAttempts1q",
      "1Q FTA": "cumulativeStats.freeThrowAttempts1q"
    },
    opposingSupportingStats: {
      "GP": {
        ranked: false,
        teamFields: ['gamesPlayed']
      },
      "1Q PTS": {
        ranked: true,
        teamFields: ['averageStats.defensive.points1q'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.points1q`],
        sortingOrder: 'asc'
      },
      "1Q AST": {
        ranked: true,
        teamFields: ['averageStats.defensive.assists1q'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.assists1q`],
        sortingOrder: 'asc'
      },
      "1Q REB": {
        ranked: true,
        teamFields: ['averageStats.defensive.rebounds1q'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.rebounds1q`],
        sortingOrder: 'asc'
      }
    }
  },
  'ASSISTS': {
    fields: ['assists'],
    defensiveTeamFields: ['averageStats.defensive.assists'],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats : {
      "GP": "gamesPlayed",
      "AST": "averageStats.assists",
      "PTS": "averageStats.points",
      "REB": "averageStats.rebounds",
      "MIN": "averageStats.minutesPlayed"
    },
    gamelogStats: {
      "AST": "cumulativeStats.assists",
      "PTS": "cumulativeStats.points",
      "REB": "cumulativeStats.rebounds",
      "MIN": "cumulativeStats.minutesPlayed",
      "3PTM": "cumulativeStats.threePointsMade",
      "3PT%": "cumulativeStats.threePointPercentage",
      "FT%": "cumulativeStats.freeThrowPercentage",
      "FG%": "cumulativeStats.fieldGoalPercentage",
      "FGA": "cumulativeStats.fieldGoalAttempts",
      "FGM": "cumulativeStats.fieldGoalsMade",
      "FTA": "cumulativeStats.freeThrowAttempts",
      "FTM": "cumulativeStats.freeThrowsMade"
    },
    opposingSupportingStats: {
      "GP": {
        ranked: false,
        teamFields: ['gamesPlayed']
      },
      "AST": {
        ranked: true,
        teamFields: ['averageStats.defensive.assists'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.assists`],
        sortingOrder: 'asc'
      },
      "FG%": {
        ranked: true,
        teamFields: ['averageStats.defensive.fieldGoalPercentage'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.fieldGoalPercentage`],
        sortingOrder: 'asc'
      },
      "FT%": {
        ranked: true,
        teamFields: ['averageStats.defensive.freeThrowPercentage'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.freeThrowPercentage`],
        sortingOrder: 'asc'
      },
      "3PT%": {
        ranked: true,
        teamFields: ['averageStats.defensive.threePointPercentage'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.threePointPercentage`],
        sortingOrder: 'asc'
      }
    }
  },
  'ASSISTS_1Q': {
    fields: ['assists1q'],
    defensiveTeamFields: ['averageStats.defensive.assists1q'],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats : {
      "GP": "gamesPlayed",
      "1Q AST": "averageStats.assists1q",
      "1Q PTS": "averageStats.points1q",
      "1Q REB": "averageStats.rebounds1q",
      "1Q MIN": "averageStats.minutesPlayed1q"
    },
    gamelogStats: {
      "1Q AST": "cumulativeStats.assists1q",
      "1Q PTS": "cumulativeStats.points1q",
      "1Q REB": "cumulativeStats.rebounds1q",
      "1Q MIN": "cumulativeStats.minutesPlayed1q",
      "1Q FGA": "cumulativeStats.fieldGoalAttempts1q",
      "1Q 3PTA": "cumulativeStats.threePointAttempts1q",
      "1Q FTA": "cumulativeStats.freeThrowAttempts1q"
    },
    opposingSupportingStats: {
      "GP": {
        ranked: false,
        teamFields: ['gamesPlayed']
      },
      "1Q PTS": {
        ranked: true,
        teamFields: ['averageStats.defensive.points1q'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.points1q`],
        sortingOrder: 'asc'
      },
      "1Q AST": {
        ranked: true,
        teamFields: ['averageStats.defensive.assists1q'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.assists1q`],
        sortingOrder: 'asc'
      },
      "1Q REB": {
        ranked: true,
        teamFields: ['averageStats.defensive.rebounds1q'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.rebounds1q`],
        sortingOrder: 'asc'
      }
    }
  },
  'REBOUNDS': {
    fields: ['rebounds'],
    defensiveTeamFields: ['averageStats.defensive.rebounds'],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats : {
      "GP": "gamesPlayed",
      "REB": "averageStats.rebounds",
      "PTS": "averageStats.points",
      "AST": "averageStats.assists",
      "MIN": "averageStats.minutesPlayed"
    },
    gamelogStats: {
      "REB": "cumulativeStats.rebounds",
      "PTS": "cumulativeStats.points",
      "AST": "cumulativeStats.assists",
      "MIN": "cumulativeStats.minutesPlayed",
      "3PTM": "cumulativeStats.threePointsMade",
      "3PT%": "cumulativeStats.threePointPercentage",
      "FT%": "cumulativeStats.freeThrowPercentage",
      "FG%": "cumulativeStats.fieldGoalPercentage",
      "FGA": "cumulativeStats.fieldGoalAttempts",
      "FGM": "cumulativeStats.fieldGoalsMade",
      "FTA": "cumulativeStats.freeThrowAttempts",
      "FTM": "cumulativeStats.freeThrowsMade"
    },
    opposingSupportingStats: {
      "GP": {
        ranked: false,
        teamFields: ['gamesPlayed']
      },
      "REB": {
        ranked: true,
        teamFields: ['averageStats.defensive.rebounds'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.rebounds`],
        sortingOrder: 'asc'
      },
      "FG%": {
        ranked: true,
        teamFields: ['averageStats.defensive.fieldGoalPercentage'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.fieldGoalPercentage`],
        sortingOrder: 'asc'
      },
      "FT%": {
        ranked: true,
        teamFields: ['averageStats.defensive.freeThrowPercentage'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.freeThrowPercentage`],
        sortingOrder: 'asc'
      },
      "3PT%": {
        ranked: true,
        teamFields: ['averageStats.defensive.threePointPercentage'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.threePointPercentage`],
        sortingOrder: 'asc'
      }
    }
  },
  'REBOUNDS_1Q': {
    fields: ['rebounds1q'],
    defensiveTeamFields: ['averageStats.defensive.rebounds1q'],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats : {
      "GP": "gamesPlayed",
      "1Q REB": "averageStats.rebounds1q",
      "1Q PTS": "averageStats.points1q",
      "1Q AST": "averageStats.assists1q",
      "1Q MIN": "averageStats.minutesPlayed1q"
    },
    gamelogStats: {
      "1Q REB": "cumulativeStats.rebounds1q",
      "1Q AST": "cumulativeStats.assists1q",
      "1Q PTS": "cumulativeStats.points1q",
      "1Q MIN": "cumulativeStats.minutesPlayed1q",
      "1Q FGA": "cumulativeStats.fieldGoalAttempts1q",
      "1Q 3PTA": "cumulativeStats.threePointAttempts1q",
      "1Q FTA": "cumulativeStats.freeThrowAttempts1q"
    },
    opposingSupportingStats: {
      "GP": {
        ranked: false,
        teamFields: ['gamesPlayed']
      },
      "1Q PTS": {
        ranked: true,
        teamFields: ['averageStats.defensive.points1q'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.points1q`],
        sortingOrder: 'asc'
      },
      "1Q AST": {
        ranked: true,
        teamFields: ['averageStats.defensive.assists1q'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.assists1q`],
        sortingOrder: 'asc'
      },
      "1Q REB": {
        ranked: true,
        teamFields: ['averageStats.defensive.rebounds1q'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.rebounds1q`],
        sortingOrder: 'asc'
      }
    }
  },
  'THREE_POINTS_MADE': {
    fields: ['threePointsMade'],
    defensiveTeamFields: ['averageStats.defensive.threePointsMade'],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats : {
      "GP": "gamesPlayed",
      "3PTM": "averageStats.threePointsMade",
      "3PTA": "averageStats.threePointAttempts",
      "3PT%": "averageStats.threePointPercentage",
      "MIN": "averageStats.minutesPlayed"
    },
    gamelogStats: {
      "3PTM": "cumulativeStats.threePointsMade",
      "3PTA": "cumulativeStats.threePointAttempts",
      "3PT%": "cumulativeStats.threePointPercentage",
      "MIN": "cumulativeStats.minutesPlayed",
      "PTS": "cumulativeStats.points",
      "AST": "cumulativeStats.assists",
      "REB": "cumulativeStats.rebounds",
      "FG%": "cumulativeStats.fieldGoalPercentage"
    },
    opposingSupportingStats: {
      "GP": {
        ranked: false,
        teamFields: ['gamesPlayed']
      },
      "3PTM": {
        ranked: true,
        teamFields: ['averageStats.defensive.threePointsMade'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.threePointsMade`],
        sortingOrder: 'asc'
      },
      "3PTA": {
        ranked: true,
        teamFields: ['averageStats.defensive.threePointAttempts'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.threePointAttempts`],
        sortingOrder: 'asc'
      },
      "3PT%": {
        ranked: true,
        teamFields: ['averageStats.defensive.threePointPercentage'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.threePointPercentage`],
        sortingOrder: 'asc'
      },
      "FG%": {
        ranked: true,
        teamFields: ['averageStats.defensive.fieldGoalPercentage'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.fieldGoalPercentage`],
        sortingOrder: 'asc'
      }
    }
  },
  // Opposing team's offensive steals means how many times they get stolen, we should use that with asc instead (same for blocks and most likely same for TO)
  // If we change it, make sure to also update opposing supporting stats
  'STEALS': {
    fields: ['steals'],
    defensiveTeamFields: ['averageStats.defensive.steals'],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats : {
      "GP": "gamesPlayed",
      "STL": "averageStats.steals",
      "TO": "averageStats.turnovers",
      "BLK": "averageStats.blocks",
      "MIN": "averageStats.minutesPlayed"
    },
    gamelogStats: {
      "STL": "cumulativeStats.steals",
      "TO": "cumulativeStats.turnovers",
      "BLK": "cumulativeStats.blocks",
      "MIN": "cumulativeStats.minutesPlayed",
      "PTS": "cumulativeStats.points",
      "AST": "cumulativeStats.assists",
      "REB": "cumulativeStats.rebounds",
      "FG%": "cumulativeStats.fieldGoalPercentage"
    },
    opposingSupportingStats: {
      "GP": {
        ranked: false,
        teamFields: ['gamesPlayed']
      },
      "STL": {
        ranked: true,
        teamFields: ['averageStats.defensive.steals'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.steals`],
        sortingOrder: 'asc'
      },
      "FG%": {
        ranked: true,
        teamFields: ['averageStats.defensive.fieldGoalPercentage'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.fieldGoalPercentage`],
        sortingOrder: 'asc'
      },
      "FT%": {
        ranked: true,
        teamFields: ['averageStats.defensive.freeThrowPercentage'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.freeThrowPercentage`],
        sortingOrder: 'asc'
      },
      "3PT%": {
        ranked: true,
        teamFields: ['averageStats.defensive.threePointPercentage'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.threePointPercentage`],
        sortingOrder: 'asc'
      }
    }
  },
  'TURNOVERS': {
    fields: ['turnovers'],
    defensiveTeamFields: ['averageStats.defensive.turnovers'],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats : {
      "GP": "gamesPlayed",
      "TO": "averageStats.turnovers",
      "BLK": "averageStats.blocks",
      "STL": "averageStats.steals",
      "MIN": "averageStats.minutesPlayed"
    },
    gamelogStats: {
      "TO": "cumulativeStats.turnovers",
      "STL": "cumulativeStats.steals",
      "BLK": "cumulativeStats.blocks",
      "MIN": "cumulativeStats.minutesPlayed",
      "PTS": "cumulativeStats.points",
      "AST": "cumulativeStats.assists",
      "REB": "cumulativeStats.rebounds",
      "FG%": "cumulativeStats.fieldGoalPercentage"
    },
    opposingSupportingStats: {
      "GP": {
        ranked: false,
        teamFields: ['gamesPlayed']
      },
      "TO": {
        ranked: true,
        teamFields: ['averageStats.defensive.turnovers'],
        sortingOrder: 'asc'
      },
      "FG%": {
        ranked: true,
        teamFields: ['averageStats.defensive.fieldGoalPercentage'],
        sortingOrder: 'asc'
      },
      "FT%": {
        ranked: true,
        teamFields: ['averageStats.defensive.freeThrowPercentage'],
        sortingOrder: 'asc'
      },
      "3PT%": {
        ranked: true,
        teamFields: ['averageStats.defensive.threePointPercentage'],
        sortingOrder: 'asc'
      }
    },
    opposingPositionalSupportingStats: {
      "GP": {
        ranked: false,
        teamFields: ['gamesPlayed']
      },
      "TO": {
        ranked: true,
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.turnovers`],
        sortingOrder: 'desc'
      },
      "FG%": {
        ranked: true,
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.fieldGoalPercentage`],
        sortingOrder: 'asc'
      },
      "FT%": {
        ranked: true,
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.freeThrowPercentage`],
        sortingOrder: 'asc'
      },
      "3PT%": {
        ranked: true,
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.threePointPercentage`],
        sortingOrder: 'asc'
      }
    }
  },
  'BLOCKS': {
    fields: ['blocks'],
    defensiveTeamFields: ['averageStats.defensive.blocks'],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats : {
      "GP": "gamesPlayed",
      "BLK": "averageStats.blocks",
      "TO": "averageStats.turnovers",
      "STL": "averageStats.steals",
      "MIN": "averageStats.minutesPlayed"
    },
    gamelogStats: {
      "BLK": "cumulativeStats.blocks",
      "TO": "cumulativeStats.turnovers",
      "STL": "cumulativeStats.steals",
      "MIN": "cumulativeStats.minutesPlayed",
      "PTS": "cumulativeStats.points",
      "AST": "cumulativeStats.assists",
      "REB": "cumulativeStats.rebounds",
      "FG%": "cumulativeStats.fieldGoalPercentage"
    },
    opposingSupportingStats: {
      "GP": {
        ranked: false,
        teamFields: ['gamesPlayed']
      },
      "BLK": {
        ranked: true,
        teamFields: ['averageStats.defensive.blocks'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.blocks`],
        sortingOrder: 'asc'
      },
      "FG%": {
        ranked: true,
        teamFields: ['averageStats.defensive.fieldGoalPercentage'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.fieldGoalPercentage`],
        sortingOrder: 'asc'
      },
      "FT%": {
        ranked: true,
        teamFields: ['averageStats.defensive.freeThrowPercentage'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.freeThrowPercentage`],
        sortingOrder: 'asc'
      },
      "3PT%": {
        ranked: true,
        teamFields: ['averageStats.defensive.threePointPercentage'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.threePointPercentage`],
        sortingOrder: 'asc'
      }
    },
  },
  'ASSISTS_PLUS_REBOUNDS': {
    fields: ['assists', 'rebounds'],
    defensiveTeamFields: ['averageStats.defensive.assists', 'averageStats.defensive.rebounds'],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats : {
      "GP": "gamesPlayed",
      "PTS": "averageStats.points",
      "AST": "averageStats.assists",
      "REB": "averageStats.rebounds",
      "MIN": "averageStats.minutesPlayed"
    },
    gamelogStats: {
      "PTS": "cumulativeStats.points",
      "AST": "cumulativeStats.assists",
      "REB": "cumulativeStats.rebounds",
      "MIN": "cumulativeStats.minutesPlayed",
      "FG%": "cumulativeStats.fieldGoalPercentage",
      "FT%": "cumulativeStats.freeThrowPercentage",
      "3PT%": "cumulativeStats.threePointPercentage",
      "FGA": "cumulativeStats.fieldGoalAttempts",
      "FGM": "cumulativeStats.fieldGoalsMade",
      "FTA": "cumulativeStats.freeThrowAttempts",
      "FTM": "cumulativeStats.freeThrowsMade"
    },
    opposingSupportingStats: {
      "GP": {
        ranked: false,
        teamFields: ['gamesPlayed']
      },
      "PTS": {
        ranked: true,
        teamFields: ['averageStats.defensive.points'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.points`],
        sortingOrder: 'asc'
      },
      "AST": {
        ranked: true,
        teamFields: ['averageStats.defensive.assists'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.assists`],
        sortingOrder: 'asc'
      },
      "REB": {
        ranked: true,
        teamFields: ['averageStats.defensive.rebounds'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.rebounds`],
        sortingOrder: 'asc'
      },
      "FG%": {
        ranked: true,
        teamFields: ['averageStats.defensive.fieldGoalPercentage'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.fieldGoalPercentage`],
        sortingOrder: 'asc'
      }
    }
  },
  'POINTS_PLUS_ASSISTS': {
    fields: ['points', 'assists'],
    defensiveTeamFields: ['averageStats.defensive.points', 'averageStats.defensive.assists'],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats : {
      "GP": "gamesPlayed",
      "PTS": "averageStats.points",
      "AST": "averageStats.assists",
      "REB": "averageStats.rebounds",
      "MIN": "averageStats.minutesPlayed"
    },
    gamelogStats: {
      "PTS": "cumulativeStats.points",
      "AST": "cumulativeStats.assists",
      "REB": "cumulativeStats.rebounds",
      "MIN": "cumulativeStats.minutesPlayed",
      "FG%": "cumulativeStats.fieldGoalPercentage",
      "FT%": "cumulativeStats.freeThrowPercentage",
      "3PT%": "cumulativeStats.threePointPercentage",
      "FGA": "cumulativeStats.fieldGoalAttempts",
      "FGM": "cumulativeStats.fieldGoalsMade",
      "FTA": "cumulativeStats.freeThrowAttempts",
      "FTM": "cumulativeStats.freeThrowsMade"
    },
    opposingSupportingStats: {
      "GP": {
        ranked: false,
        teamFields: ['gamesPlayed']
      },
      "PTS": {
        ranked: true,
        teamFields: ['averageStats.defensive.points'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.points`],
        sortingOrder: 'asc'
      },
      "AST": {
        ranked: true,
        teamFields: ['averageStats.defensive.assists'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.assists`],
        sortingOrder: 'asc'
      },
      "REB": {
        ranked: true,
        teamFields: ['averageStats.defensive.rebounds'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.rebounds`],
        sortingOrder: 'asc'
      },
      "FG%": {
        ranked: true,
        teamFields: ['averageStats.defensive.fieldGoalPercentage'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.fieldGoalPercentage`],
        sortingOrder: 'asc'
      }
    }
  },
  'POINTS_PLUS_REBOUNDS': {
    fields: ['points', 'rebounds'],
    defensiveTeamFields: ['averageStats.defensive.points', 'averageStats.defensive.rebounds'],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats : {
      "GP": "gamesPlayed",
      "PTS": "averageStats.points",
      "AST": "averageStats.assists",
      "REB": "averageStats.rebounds",
      "MIN": "averageStats.minutesPlayed"
    },
    gamelogStats: {
      "PTS": "cumulativeStats.points",
      "AST": "cumulativeStats.assists",
      "REB": "cumulativeStats.rebounds",
      "MIN": "cumulativeStats.minutesPlayed",
      "FG%": "cumulativeStats.fieldGoalPercentage",
      "FT%": "cumulativeStats.freeThrowPercentage",
      "3PT%": "cumulativeStats.threePointPercentage",
      "FGA": "cumulativeStats.fieldGoalAttempts",
      "FGM": "cumulativeStats.fieldGoalsMade",
      "FTA": "cumulativeStats.freeThrowAttempts",
      "FTM": "cumulativeStats.freeThrowsMade"
    },
    opposingSupportingStats: {
      "GP": {
        ranked: false,
        teamFields: ['gamesPlayed']
      },
      "PTS": {
        ranked: true,
        teamFields: ['averageStats.defensive.points'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.points`],
        sortingOrder: 'asc'
      },
      "AST": {
        ranked: true,
        teamFields: ['averageStats.defensive.assists'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.assists`],
        sortingOrder: 'asc'
      },
      "REB": {
        ranked: true,
        teamFields: ['averageStats.defensive.rebounds'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.rebounds`],
        sortingOrder: 'asc'
      },
      "FG%": {
        ranked: true,
        teamFields: ['averageStats.defensive.fieldGoalPercentage'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.fieldGoalPercentage`],
        sortingOrder: 'asc'
      }
    }
  },
  'POINTS_PLUS_ASSISTS_PLUS_REBOUNDS': {
    fields: ['points', 'assists', 'rebounds'],
    defensiveTeamFields: ['averageStats.defensive.points', 'averageStats.defensive.assists', 'averageStats.defensive.rebounds'],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats : {
      "GP": "gamesPlayed",
      "PTS": "averageStats.points",
      "AST": "averageStats.assists",
      "REB": "averageStats.rebounds",
      "MIN": "averageStats.minutesPlayed"
    },
    gamelogStats: {
      "PTS": "cumulativeStats.points",
      "AST": "cumulativeStats.assists",
      "REB": "cumulativeStats.rebounds",
      "MIN": "cumulativeStats.minutesPlayed",
      "FG%": "cumulativeStats.fieldGoalPercentage",
      "FT%": "cumulativeStats.freeThrowPercentage",
      "3PT%": "cumulativeStats.threePointPercentage",
      "FGA": "cumulativeStats.fieldGoalAttempts",
      "FGM": "cumulativeStats.fieldGoalsMade",
      "FTA": "cumulativeStats.freeThrowAttempts",
      "FTM": "cumulativeStats.freeThrowsMade"
    },
    opposingSupportingStats: {
      "GP": {
        ranked: false,
        teamFields: ['gamesPlayed']
      },
      "PTS": {
        ranked: true,
        teamFields: ['averageStats.defensive.points'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.points`],
        sortingOrder: 'asc'
      },
      "AST": {
        ranked: true,
        teamFields: ['averageStats.defensive.assists'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.assists`],
        sortingOrder: 'asc'
      },
      "REB": {
        ranked: true,
        teamFields: ['averageStats.defensive.rebounds'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.rebounds`],
        sortingOrder: 'asc'
      },
      "FG%": {
        ranked: true,
        teamFields: ['averageStats.defensive.fieldGoalPercentage'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.fieldGoalPercentage`],
        sortingOrder: 'asc'
      }
    }
  },
  'STEALS_PLUS_BLOCKS': {
    fields: ['steals', 'blocks'],
    defensiveTeamFields: ['averageStats.defensive.steals', 'averageStats.defensive.blocks'],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats : {
      "GP": "gamesPlayed",
      "STL": "averageStats.steals",
      "BLK": "averageStats.blocks",
      "TO": "averageStats.turnovers",
      "MIN": "averageStats.minutesPlayed"
    },
    gamelogStats: {
      "STL": "cumulativeStats.steals",
      "BLK": "cumulativeStats.blocks",
      "TO": "cumulativeStats.turnovers",
      "MIN": "cumulativeStats.minutesPlayed",
      "FG%": "cumulativeStats.fieldGoalPercentage",
      "FT%": "cumulativeStats.freeThrowPercentage",
      "3PT%": "cumulativeStats.threePointPercentage"
    },
    opposingSupportingStats: {
      "GP": {
        ranked: false,
        teamFields: ['gamesPlayed']
      },
      "STL": {
        ranked: true,
        teamFields: ['averageStats.defensive.steals'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.steals`],
        sortingOrder: 'asc'
      },
      "BLK": {
        ranked: true,
        teamFields: ['averageStats.defensive.blocks'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.blocks`],
        sortingOrder: 'asc'
      },
      "TO": {
        ranked: true,
        teamFields: ['averageStats.defensive.turnovers'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.turnovers`],
        sortingOrder: 'asc'
      },
      "FG%": {
        ranked: true,
        teamFields: ['averageStats.defensive.fieldGoalPercentage'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.fieldGoalPercentage`],
        sortingOrder: 'asc'
      }
    }
  },
  'DOUBLE_DOUBLE': {
    fields: ['doubleDouble'],
    defensiveTeamFields: [],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats : {
      "GP": "gamesPlayed",
      "DD": "averageStats.doubleDouble",
      "PTS": "averageStats.points",
      "AST": "averageStats.assists",
      "REB": "averageStats.rebounds",
    },
    gamelogStats: {
      "DD": "cumulativeStats.doubleDouble",
      "PTS": "cumulativeStats.points",
      "AST": "cumulativeStats.assists",
      "REB": "cumulativeStats.rebounds",
      "MIN": "cumulativeStats.minutesPlayed",
      "STL": "cumulativeStats.steals",
      "BLK": "cumulativeStats.blocks",
    },
    opposingSupportingStats: {
      "GP": {
        ranked: false,
        teamFields: ['gamesPlayed']
      },
      "PTS": {
        ranked: true,
        teamFields: ['averageStats.defensive.points'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.points`],
        sortingOrder: 'asc'
      },
      "AST": {
        ranked: true,
        teamFields: ['averageStats.defensive.assists'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.assists`],
        sortingOrder: 'asc'
      },
      "REB": {
        ranked: true,
        teamFields: ['averageStats.defensive.rebounds'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.rebounds`],
        sortingOrder: 'asc'
      },
      "BLK": {
        ranked: true,
        teamFields: ['averageStats.defensive.blocks'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.blocks`],
        sortingOrder: 'asc'
      }
    }
  },
  'TRIPLE_DOUBLE': {
    fields: ['tripleDouble'],
    defensiveTeamFields: [],
    defensiveSortingOrder: 'asc',
    defaultLineValue: 0,
    supportingStats : {
      "GP": "gamesPlayed",
      "TD": "averageStats.tripleDouble",
      "PTS": "averageStats.points",
      "AST": "averageStats.assists",
      "REB": "averageStats.rebounds",
    },
    gamelogStats: {
      "TD": "cumulativeStats.tripleDouble",
      "PTS": "cumulativeStats.points",
      "AST": "cumulativeStats.assists",
      "REB": "cumulativeStats.rebounds",
      "MIN": "cumulativeStats.minutesPlayed",
      "STL": "cumulativeStats.steals",
      "BLK": "cumulativeStats.blocks",
    },
    opposingSupportingStats: {
      "GP": {
        ranked: false,
        teamFields: ['gamesPlayed']
      },
      "PTS": {
        ranked: true,
        teamFields: ['averageStats.defensive.points'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.points`],
        sortingOrder: 'asc'
      },
      "AST": {
        ranked: true,
        teamFields: ['averageStats.defensive.assists'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.assists`],
        sortingOrder: 'asc'
      },
      "REB": {
        ranked: true,
        teamFields: ['averageStats.defensive.rebounds'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.rebounds`],
        sortingOrder: 'asc'
      },
      "BLK": {
        ranked: true,
        teamFields: ['averageStats.defensive.blocks'],
        positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.blocks`],
        sortingOrder: 'asc'
      }
    }
  }
}

export const PLAYER_PROPS_INFO = {
  nfl: FOOTBALL_PLAYER_PROPS_INFO,
  ncaaf: FOOTBALL_PLAYER_PROPS_INFO,
  nba: BASKETBALL_PLAYER_PROPS_INFO,
  wnba: BASKETBALL_PLAYER_PROPS_INFO,
  // There are no quarters in college basketball
  ncaab: Object.fromEntries(
    Object.keys(BASKETBALL_PLAYER_PROPS_INFO)
    .filter(marketId => !marketId.endsWith('1Q'))
    .map(marketId => [marketId, BASKETBALL_PLAYER_PROPS_INFO[marketId]])
  ),
  nhl: {
    'POINTS': {
      fields: ['points'],
      defensiveTeamFields: ['averageStats.defensive.goals'],
      defensiveSortingOrder: 'asc',
      defaultLineValue: 0,
      supportingStats : {
        "GP": "gamesPlayed",
        "PTS": "averageStats.points",
        "G": "averageStats.goals",
        "A": "averageStats.assists",
        "TOI": "averageStats.timeOnIce"
      },
      gamelogStats: {
        "PTS": "cumulativeStats.points",
        "G": "cumulativeStats.goals",
        "A": "cumulativeStats.assists",
        "TOI": "cumulativeStats.timeOnIce",
        "SOG": "cumulativeStats.shotsOnGoal",
        "SAT": "cumulativeStats.shotAttempts",
        "PPP": "cumulativeStats.powerplayPoints",
        "PPG": "cumulativeStats.powerplayGoals"
      },
      opposingSupportingStats: {
        "GP": {
          ranked: false,
          teamFields: ['gamesPlayed']
        },
        "GA": {
          ranked: true,
          teamFields: ['averageStats.defensive.goals'],
          sortingOrder: 'asc'
        },
        "SOG-A": {
          ranked: true,
          teamFields: ['averageStats.defensive.shotsOnGoal'],
          sortingOrder: 'asc'
        },
        "SAT-A": {
          ranked: true,
          teamFields: ['averageStats.defensive.shotAttempts'],
          sortingOrder: 'asc'
        },
        "CF%": {
          ranked: true,
          teamFields: ['averageStats.defensive.corsiPercentage'],
          sortingOrder: 'asc'
        }
      },
      opposingPositionalSupportingStats: {
        "GP": {
          ranked: false,
          teamFields: ['gamesPlayed']
        },
        "GA": {
          ranked: true,
          positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.goals`],
          sortingOrder: 'asc'
        },
        "SOG-A": {
          ranked: true,
          positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.shotsOnGoal`],
          sortingOrder: 'asc'
        },
        "SAT-A": {
          ranked: true,
          positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.shotAttempts`],
          sortingOrder: 'asc'
        },
        "PTS": {
          ranked: true,
          positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.points`],
          sortingOrder: 'asc'
        }
      }
    },
    'ASSISTS': {
      fields: ['assists'],
      defensiveTeamFields: ['averageStats.defensive.goals'],
      defensiveSortingOrder: 'asc',
      defaultLineValue: 0,
      supportingStats : {
        "GP": "gamesPlayed",
        "A": "averageStats.assists",
        "PTS": "averageStats.points",
        "SOG": "averageStats.shotsOnGoal",
        "TOI": "averageStats.timeOnIce"
      },
      gamelogStats: {
        "A": "cumulativeStats.assists",
        "G": "cumulativeStats.goals",
        "PTS": "cumulativeStats.points",
        "TOI": "cumulativeStats.timeOnIce",
        "SOG": "cumulativeStats.shotsOnGoal",
        "SAT": "cumulativeStats.shotAttempts",
        "PPP": "cumulativeStats.powerplayPoints",
        "PPG": "cumulativeStats.powerplayGoals"
      },
      opposingSupportingStats: {
        "GP": {
          ranked: false,
          teamFields: ['gamesPlayed']
        },
        "GA": {
          ranked: true,
          teamFields: ['averageStats.defensive.goals'],
          sortingOrder: 'asc'
        },
        "SOG-A": {
          ranked: true,
          teamFields: ['averageStats.defensive.shotsOnGoal'],
          sortingOrder: 'asc'
        },
        "SAT-A": {
          ranked: true,
          teamFields: ['averageStats.defensive.shotAttempts'],
          sortingOrder: 'asc'
        },
        "CF%": {
          ranked: true,
          teamFields: ['averageStats.defensive.corsiPercentage'],
          sortingOrder: 'asc'
        }
      },
      opposingPositionalSupportingStats: {
        "GP": {
          ranked: false,
          teamFields: ['gamesPlayed']
        },
        "AST": {
          ranked: true,
          positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.assists`],
          sortingOrder: 'asc'
        },
        "SOG-A": {
          ranked: true,
          positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.shotsOnGoal`],
          sortingOrder: 'asc'
        },
        "SAT-A": {
          ranked: true,
          positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.shotAttempts`],
          sortingOrder: 'asc'
        },
        "PTS": {
          ranked: true,
          positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.points`],
          sortingOrder: 'asc'
        }
      }
    },
    'SHOTS_ON_GOAL': {
      fields: ['shotsOnGoal'],
      defensiveTeamFields: ['averageStats.defensive.shotsOnGoal'],
      defensiveSortingOrder: 'asc',
      defaultLineValue: 0,
      supportingStats : {
        "GP": "gamesPlayed",
        "SOG": "averageStats.shotsOnGoal",
        "SAT": "averageStats.shotAttempts",
        "G": "averageStats.goals",
        "TOI": "averageStats.timeOnIce"
      },
      gamelogStats: {
        "SOG": "cumulativeStats.shotsOnGoal",
        "SAT": "cumulativeStats.shotAttempts",
        "PTS": "cumulativeStats.points",
        "TOI": "cumulativeStats.timeOnIce",
        "G": "cumulativeStats.goals",
        "A": "cumulativeStats.assists",
        "PPP": "cumulativeStats.powerplayPoints",
        "PPG": "cumulativeStats.powerplayGoals"
      },
      opposingSupportingStats: {
        "GP": {
          ranked: false,
          teamFields: ['gamesPlayed']
        },
        "GA": {
          ranked: true,
          teamFields: ['averageStats.defensive.goals'],
          sortingOrder: 'asc'
        },
        "SOG-A": {
          ranked: true,
          teamFields: ['averageStats.defensive.shotsOnGoal'],
          sortingOrder: 'asc'
        },
        "SAT-A": {
          ranked: true,
          teamFields: ['averageStats.defensive.shotAttempts'],
          sortingOrder: 'asc'
        },
        "CF%": {
          ranked: true,
          teamFields: ['averageStats.defensive.corsiPercentage'],
          sortingOrder: 'asc'
        }
      },
      opposingPositionalSupportingStats: {
        "GP": {
          ranked: false,
          teamFields: ['gamesPlayed']
        },
        "GA": {
          ranked: true,
          positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.goals`],
          sortingOrder: 'asc'
        },
        "SOG-A": {
          ranked: true,
          positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.shotsOnGoal`],
          sortingOrder: 'asc'
        },
        "SAT-A": {
          ranked: true,
          positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.shotAttempts`],
          sortingOrder: 'asc'
        },
        "PTS": {
          ranked: true,
          positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.points`],
          sortingOrder: 'asc'
        }
      }
    },
    'POWERPLAY_POINTS': {
      fields: ['powerplayPoints'],
      defensiveTeamFields: ['averageStats.defensive.powerplayPercentage'],
      defensiveSortingOrder: 'asc',
      defaultLineValue: 0,
      supportingStats : {
        "GP": "gamesPlayed",
        "PPP": "averageStats.powerplayPoints",
        "G": "averageStats.goals",
        "A": "averageStats.assists",
        "TOI": "averageStats.timeOnIce"
      },
      gamelogStats: {
        "PPP": "cumulativeStats.powerplayPoints",
        "PPG": "cumulativeStats.powerplayGoals",
        "PTS": "cumulativeStats.points",
        "TOI": "cumulativeStats.timeOnIce",
        "G": "cumulativeStats.goals",
        "A": "cumulativeStats.assists",
        "SOG": "cumulativeStats.shotsOnGoal",
        "SAT": "cumulativeStats.shotAttempts"
      },
      opposingSupportingStats: {
        "GP": {
          ranked: false,
          teamFields: ['gamesPlayed']
        },
        "GA": {
          ranked: true,
          teamFields: ['averageStats.defensive.goals'],
          sortingOrder: 'asc'
        },
        "SOG-A": {
          ranked: true,
          teamFields: ['averageStats.defensive.shotsOnGoal'],
          sortingOrder: 'asc'
        },
        "SAT-A": {
          ranked: true,
          teamFields: ['averageStats.defensive.shotAttempts'],
          sortingOrder: 'asc'
        },
        "SH%": {
          ranked: true,
          teamFields: ['averageStats.offensive.penaltyKillPercentage'],
          sortingOrder: 'desc'
        }
      },
      opposingPositionalSupportingStats: {
        "GP": {
          ranked: false,
          teamFields: ['gamesPlayed']
        },
        "GA": {
          ranked: true,
          positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.goals`],
          sortingOrder: 'asc'
        },
        "SOG-A": {
          ranked: true,
          positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.shotsOnGoal`],
          sortingOrder: 'asc'
        },
        "SAT-A": {
          ranked: true,
          positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.shotAttempts`],
          sortingOrder: 'asc'
        },
        "PPP": {
          ranked: true,
          positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.powerplayPoints`],
          sortingOrder: 'asc'
        }
      }
    },
    'ANYTIME_GOAL_SCORER': {
      fields: ['goals'],
      defensiveTeamFields: ['averageStats.defensive.goals'],
      defensiveSortingOrder: 'asc',
      defaultLineValue: 0,
      supportingStats : {
        "GP": "gamesPlayed",
        "G": "averageStats.goals",
        "A": "averageStats.assists",
        "PTS": "averageStats.points",
        "TOI": "averageStats.timeOnIce"
      },
      gamelogStats: {
        "G": "cumulativeStats.goals",
        "A": "cumulativeStats.assists",
        "PTS": "cumulativeStats.points",
        "TOI": "cumulativeStats.timeOnIce",
        "SOG": "cumulativeStats.shotsOnGoal",
        "SAT": "cumulativeStats.shotAttempts",
        "PPP": "cumulativeStats.powerplayPoints",
        "PPG": "cumulativeStats.powerplayGoals"
      },
      opposingSupportingStats: {
        "GP": {
          ranked: false,
          teamFields: ['gamesPlayed']
        },
        "GA": {
          ranked: true,
          teamFields: ['averageStats.defensive.goals'],
          sortingOrder: 'asc'
        },
        "SOG-A": {
          ranked: true,
          teamFields: ['averageStats.defensive.shotsOnGoal'],
          sortingOrder: 'asc'
        },
        "SAT-A": {
          ranked: true,
          teamFields: ['averageStats.defensive.shotAttempts'],
          sortingOrder: 'asc'
        },
        "CF%": {
          ranked: true,
          teamFields: ['averageStats.defensive.corsiPercentage'],
          sortingOrder: 'asc'
        }
      },
      opposingPositionalSupportingStats: {
        "GP": {
          ranked: false,
          teamFields: ['gamesPlayed']
        },
        "GA": {
          ranked: true,
          positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.goals`],
          sortingOrder: 'asc'
        },
        "SOG-A": {
          ranked: true,
          positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.shotsOnGoal`],
          sortingOrder: 'asc'
        },
        "SAT-A": {
          ranked: true,
          positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.shotAttempts`],
          sortingOrder: 'asc'
        },
        "PTS": {
          ranked: true,
          positionalTeamFields: (position) => [`positionalStats.${position}.average.defensive.points`],
          sortingOrder: 'asc'
        }
      }
    },
    'BLOCKED_SHOTS': {
      fields: ['defensiveBlocks'],
      defensiveTeamFields: ['averageStats.offensive.offensiveBlocks'],
      defensiveSortingOrder: 'asc',
      defaultLineValue: 0,
      supportingStats : {
        "GP": "gamesPlayed",
        "BLK": "averageStats.defensiveBlocks",
        "SOG": "averageStats.shotsOnGoal",
        "PTS": "averageStats.points",
        "TOI": "averageStats.timeOnIce"
      },
      gamelogStats: {
        "BLK": "cumulativeStats.defensiveBlocks",
        "SOG": "cumulativeStats.shotsOnGoal",
        "PTS": "cumulativeStats.points",
        "TOI": "cumulativeStats.timeOnIce",
        "SAT": "cumulativeStats.shotAttempts",
        "A": "cumulativeStats.assists",
        "PPP": "cumulativeStats.powerplayPoints"
      },
      opposingSupportingStats: {
        "GP": {
          ranked: false,
          teamFields: ['gamesPlayed']
        },
        "BLK": {
          ranked: true,
          teamFields: ['averageStats.offensive.offensiveBlocks'],
          sortingOrder: 'asc'
        },
        "SOG-A": {
          ranked: true,
          teamFields: ['averageStats.defensive.shotsOnGoal'],
          sortingOrder: 'asc'
        },
        "SAT-A": {
          ranked: true,
          teamFields: ['averageStats.defensive.shotAttempts'],
          sortingOrder: 'asc'
        },
        "CF%": {
          ranked: true,
          teamFields: ['averageStats.defensive.corsiPercentage'],
          sortingOrder: 'asc'
        }
      }
    },
    'GOALS_ALLOWED': {
      fields: ['goalsAllowed'],
      defensiveTeamFields: ['averageStats.offensive.goals'],
      defensiveSortingOrder: 'desc',
      defaultLineValue: 0,
      supportingStats: {
        "GP": "gamesPlayed",
        "GA": "averageStats.goalsAllowed",
        "SA": "averageStats.shotsAgainst",
        "SV": "averageStats.shotsSaved",
        "SV%": "averageStats.savePercentage"
      },
      gamelogStats: {
        "GA": "cumulativeStats.goalsAllowed",
        "SA": "cumulativeStats.shotsAgainst",
        "SV": "cumulativeStats.shotsSaved",
        "SV%": "cumulativeStats.savePercentage"
      },
      opposingSupportingStats: {
        "GP": {
          ranked: false,
          teamFields: ['gamesPlayed']
        },
        "G": {
          ranked: true,
          teamFields: ['averageStats.offensive.goals'],
          sortingOrder: 'desc'
        },
        "SOG": {
          ranked: true,
          teamFields: ['averageStats.offensive.shotsOnGoal'],
          sortingOrder: 'desc'
        },
        "SAT": {
          ranked: true,
          teamFields: ['averageStats.offensive.shotAttempts'],
          sortingOrder: 'desc'
        },
        "CF%": {
          ranked: true,
          teamFields: ['averageStats.offensive.corsiPercentage'],
          sortingOrder: 'desc'
        }
      }
    },
    'SAVES': {
      fields: ['shotsSaved'],
      defensiveTeamFields: ['averageStats.offensive.shotsOnGoal'],
      defensiveSortingOrder: 'desc',
      defaultLineValue: 0,
      supportingStats: {
        "GP": "gamesPlayed",
        "SV": "averageStats.shotsSaved",
        "SA": "averageStats.shotsAgainst",
        "SV%": "averageStats.savePercentage",
        "GA": "averageStats.goalsAllowed"
      },
      gamelogStats: {
        "SV": "cumulativeStats.shotsSaved",
        "SA": "cumulativeStats.shotsAgainst",
        "SV%": "cumulativeStats.savePercentage",
        "GA": "cumulativeStats.goalsAllowed"
      },
      opposingSupportingStats: {
        "GP": {
          ranked: false,
          teamFields: ['gamesPlayed']
        },
        "G": {
          ranked: true,
          teamFields: ['averageStats.offensive.goals'],
          sortingOrder: 'desc'
        },
        "SOG": {
          ranked: true,
          teamFields: ['averageStats.offensive.shotsOnGoal'],
          sortingOrder: 'desc'
        },
        "SAT": {
          ranked: true,
          teamFields: ['averageStats.offensive.shotAttempts'],
          sortingOrder: 'desc'
        },
        "CF%": {
          ranked: true,
          teamFields: ['averageStats.offensive.corsiPercentage'],
          sortingOrder: 'desc'
        }
      }
    },
    'SHUTOUT': {
      fields: ['shutouts'],
      defensiveTeamFields: ['averageStats.offensive.goals'],
      defensiveSortingOrder: 'desc',
      defaultLineValue: 0,
      supportingStats: {
        "GP": "gamesPlayed",
        "SV": "averageStats.shotsSaved",
        "SA": "averageStats.shotsAgainst",
        "SV%": "averageStats.savePercentage",
        "GA": "averageStats.goalsAllowed"
      },
      gamelogStats: {
        "SO": "cumulativeStats.shutouts",
        "GA": "cumulativeStats.goalsAllowed",
        "SV%": "cumulativeStats.savePercentage"
      },
      opposingSupportingStats: {
        "GP": {
          ranked: false,
          teamFields: ['gamesPlayed']
        },
        "G": {
          ranked: true,
          teamFields: ['averageStats.offensive.goals'],
          sortingOrder: 'desc'
        },
        "SOG": {
          ranked: true,
          teamFields: ['averageStats.offensive.shotsOnGoal'],
          sortingOrder: 'desc'
        },
        "SAT": {
          ranked: true,
          teamFields: ['averageStats.offensive.shotAttempts'],
          sortingOrder: 'desc'
        },
        "CF%": {
          ranked: true,
          teamFields: ['averageStats.offensive.corsiPercentage'],
          sortingOrder: 'desc'
        }
      }
    }
  },
  // TODO: add hitter walks
  mlb: {
    'PITCHER_STRIKEOUTS': {
        fields: ['pitching.strikeouts'],
        // Pitching is a def stats so it would have to be offensive here
        defensiveTeamFields: ['averageStats.offensive.strikeouts'],
        defensiveSortingOrder: 'asc',
        defaultLineValue: 0,
        supportingStats: {
          "BF": "situationalStats.%situation%.pitching.battersFaced",
          "SO": "situationalStats.%situation%.pitching.strikeouts",
          "SO%": "situationalStats.%situation%.pitching.strikeoutPercentage",
          "BB%": "situationalStats.%situation%.pitching.walkPercentage",
          "AVG": "situationalStats.%situation%.pitching.battingAverageAgainst"
        },
        gamelogStats: {
          "PO": "cumulativeStats.pitching.outs",
          "SO": "cumulativeStats.pitching.strikeouts",
          "H": "cumulativeStats.pitching.hits",
          "IP": "cumulativeStats.pitching.inningsPitched",
          "ERA": "cumulativeStats.pitching.earnedRunsAverage",
          "HR": "cumulativeStats.pitching.homeRuns",
          "WHIP": "cumulativeStats.pitching.walksAndHitsPerInningPitched",
          "AVG": "cumulativeStats.pitching.battingAverageAgainst"
        },
        opposingSupportingStats: {
          "GP": {
            ranked: false,
            teamFields: ['gamesPlayed']
          },
          "SO": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.offensive.strikeouts'],
            sortingOrder: 'asc'
          },
          "SO%": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.offensive.strikeoutPercentage'],
            sortingOrder: 'asc'
          },
          "BB%": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.offensive.walkPercentage'],
            sortingOrder: 'desc'
          },
          "AVG": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.offensive.battingAverage'],
            sortingOrder: 'desc'
          }
        }
    },
    'PITCHER_EARNED_RUNS': {
        fields: ['pitching.earnedRuns'],
        defensiveTeamFields: ['averageStats.offensive.earnedRuns'],
        defensiveSortingOrder: 'desc',
        defaultLineValue: 0,
        supportingStats : {
          "BF": "situationalStats.%situation%.pitching.battersFaced",
          "R": "situationalStats.%situation%.pitching.runs",
          "SO%": "situationalStats.%situation%.pitching.strikeoutPercentage",
          "BB%": "situationalStats.%situation%.pitching.walkPercentage",
          "AVG": "situationalStats.%situation%.pitching.battingAverageAgainst"
        },
        gamelogStats: {
          "ERA": "cumulativeStats.pitching.earnedRunsAverage",
          "SO": "cumulativeStats.pitching.strikeouts",
          "H": "cumulativeStats.pitching.hits",
          "IP": "cumulativeStats.pitching.inningsPitched",
          "PO": "cumulativeStats.pitching.outs",
          "HR": "cumulativeStats.pitching.homeRuns",
          "WHIP": "cumulativeStats.pitching.walksAndHitsPerInningPitched",
          "AVG": "cumulativeStats.pitching.battingAverageAgainst"
        },
        opposingSupportingStats: {
          "GP": {
            ranked: false,
            teamFields: ['gamesPlayed']
          },
          "R": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.offensive.runs'],
            sortingOrder: 'desc'
          },
          "SO%": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.offensive.strikeoutPercentage'],
            sortingOrder: 'asc'
          },
          "BB%": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.offensive.walkPercentage'],
            sortingOrder: 'desc'
          },
          "AVG": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.offensive.battingAverage'],
            sortingOrder: 'desc'
          }
        }
    },
    'PITCHER_OUTS': {
        fields: ['pitching.outs'],
        defensiveTeamFields: ['averageStats.offensive.outs'],
        defensiveSortingOrder: 'asc',
        defaultLineValue: 0,
        supportingStats : {
          "BF": "situationalStats.%situation%.pitching.battersFaced",
          "H": "situationalStats.%situation%.pitching.hits",
          "SO%": "situationalStats.%situation%.pitching.strikeoutPercentage",
          "BB%": "situationalStats.%situation%.pitching.walkPercentage",
          "AVG": "situationalStats.%situation%.pitching.battingAverageAgainst"
        },
        gamelogStats: {
          "SO": "cumulativeStats.pitching.strikeouts",
          "H": "cumulativeStats.pitching.hits",
          "ERA": "cumulativeStats.pitching.earnedRunsAverage",
          "IP": "cumulativeStats.pitching.inningsPitched",
          "PO": "cumulativeStats.pitching.outs",
          "HR": "cumulativeStats.pitching.homeRuns",
          "WHIP": "cumulativeStats.pitching.walksAndHitsPerInningPitched",
          "AVG": "cumulativeStats.pitching.battingAverageAgainst"
        },
        opposingSupportingStats: {
          "GP": {
            ranked: false,
            teamFields: ['gamesPlayed']
          },
          "H": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.offensive.hits'],
            sortingOrder: 'desc'
          },
          "SO%": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.offensive.strikeoutPercentage'],
            sortingOrder: 'asc'
          },
          "BB%": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.offensive.walkPercentage'],
            sortingOrder: 'desc'
          },
          "AVG": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.offensive.battingAverage'],
            sortingOrder: 'desc'
          }
        }
    },
    'PITCHER_HITS_ALLOWED': {
        fields: ['pitching.hits'],
        defensiveTeamFields: ['averageStats.offensive.hits'],
        defensiveSortingOrder: 'desc',
        defaultLineValue: 0,
        supportingStats : {
          "BF": "situationalStats.%situation%.pitching.battersFaced",
          "H": "situationalStats.%situation%.pitching.hits",
          "SO%": "situationalStats.%situation%.pitching.strikeoutPercentage",
          "BB%": "situationalStats.%situation%.pitching.walkPercentage",
          "AVG": "situationalStats.%situation%.pitching.battingAverageAgainst"
        },
        gamelogStats: {
          "H": "cumulativeStats.pitching.hits",
          "SO": "cumulativeStats.pitching.strikeouts",
          "ERA": "cumulativeStats.pitching.earnedRunsAverage",
          "IP": "cumulativeStats.pitching.inningsPitched",
          "PO": "cumulativeStats.pitching.outs",
          "HR": "cumulativeStats.pitching.homeRuns",
          "WHIP": "cumulativeStats.pitching.walksAndHitsPerInningPitched",
          "AVG": "cumulativeStats.pitching.battingAverageAgainst"
        },
        opposingSupportingStats: {
          "GP": {
            ranked: false,
            teamFields: ['gamesPlayed']
          },
          "H": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.offensive.hits'],
            sortingOrder: 'desc'
          },
          "SO%": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.offensive.strikeoutPercentage'],
            sortingOrder: 'asc'
          },
          "BB%": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.offensive.walkPercentage'],
            sortingOrder: 'desc'
          },
          "AVG": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.offensive.battingAverage'],
            sortingOrder: 'desc'
          }
        }
    },
    'PITCHER_WALKS_ALLOWED': {
      fields: ['pitching.walks'],
      defensiveTeamFields: ['averageStats.offensive.walks'],
      defensiveSortingOrder: 'desc',
      defaultLineValue: 0,
      supportingStats : {
        "BF": "situationalStats.%situation%.pitching.battersFaced",
        "BB": "situationalStats.%situation%.pitching.walks",
        "SO%": "situationalStats.%situation%.pitching.strikeoutPercentage",
        "BB%": "situationalStats.%situation%.pitching.walkPercentage",
        "AVG": "situationalStats.%situation%.pitching.battingAverageAgainst"
      },
      gamelogStats: {
        "BB": "cumulativeStats.pitching.walks",
        "H": "cumulativeStats.pitching.hits",
        "SO": "cumulativeStats.pitching.strikeouts",
        "IP": "cumulativeStats.pitching.inningsPitched",
        "ERA": "cumulativeStats.pitching.earnedRunsAverage",
        "WHIP": "cumulativeStats.pitching.walksAndHitsPerInningPitched",
        "AVG": "cumulativeStats.pitching.battingAverageAgainst"
      },
      opposingSupportingStats: {
        "GP": {
          ranked: false,
          teamFields: ['gamesPlayed']
        },
        "BB": {
          ranked: true,
          teamFields: ['situationalStats.%situation%.offensive.walks'],
          sortingOrder: 'desc'
        },
        "SO%": {
          ranked: true,
          teamFields: ['situationalStats.%situation%.offensive.strikeoutPercentage'],
          sortingOrder: 'asc'
        },
        "BB%": {
          ranked: true,
          teamFields: ['situationalStats.%situation%.offensive.walkPercentage'],
          sortingOrder: 'desc'
        },
        "AVG": {
          ranked: true,
          teamFields: ['situationalStats.%situation%.offensive.battingAverage'],
          sortingOrder: 'desc'
        }
      }
    },
    'HITTER_TOTAL_BASES': {
        fields: ['hitting.totalBases'],
        defensiveTeamFields: ['averageStats.defensive.totalBases'],
        defensiveSortingOrder: 'asc',
        defaultLineValue: 0,
        supportingStats : {
          "AB": "situationalStats.%situation%.hitting.atBats",
          "TB": "situationalStats.%situation%.hitting.totalBases",
          "AVG": "situationalStats.%situation%.hitting.battingAverage",
          "OBP": "situationalStats.%situation%.hitting.onBasePercentage",
          "SLG": "situationalStats.%situation%.hitting.sluggingPercentage"
        },
        gamelogStats: {
          "TB": "cumulativeStats.hitting.totalBases",
          "H": "cumulativeStats.hitting.hits",
          "R": "cumulativeStats.hitting.runs",
          "AB": "cumulativeStats.hitting.atBats",
          "HR": "cumulativeStats.hitting.homeRuns",
          "RBI": "cumulativeStats.hitting.runsBattedIn",
          "AVG": "cumulativeStats.hitting.battingAverage",
          "OPS": "cumulativeStats.hitting.onBasePlusSluggingPercentage"
        },
        opposingSupportingStats: {
          "BF": {
            ranked: false,
            teamFields: ['situationalStats.%situation%.defensive.battersFaced'],
            playerFields: ['situationalStats.%situation%.pitching.battersFaced']
          },
          "TB": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.defensive.totalBases'],
            playerFields: ['situationalStats.%situation%.pitching.totalBases'],
            sortingOrder: 'asc'
          },
          "SO%": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.defensive.strikeoutPercentage'],
            playerFields: ['situationalStats.%situation%.pitching.strikeoutPercentage'],
            sortingOrder: 'asc'
          },
          "AVG": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.defensive.battingAverage'],
            playerFields: ['situationalStats.%situation%.pitching.battingAverageAgainst'],
            sortingOrder: 'asc'
          },
          "OBP": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.defensive.onBasePercentage'],
            playerFields: ['situationalStats.%situation%.pitching.onBasePercentage'],
            sortingOrder: 'asc'
          }
        },
        opposingTeamGamelogSupportingStats: {
          "BF": "cumulativeStats.defensive.battersFaced", // doesn't apply put we'll put something here
          "TB": "cumulativeStats.defensive.totalBases",
          "SO": "cumulativeStats.defensive.strikeouts",
          "AVG": "cumulativeStats.defensive.battingAverage",
          "OBP": "cumulativeStats.defensive.onBasePercentage"
        },
        opposingPitcherGamelogSupportingStats: {
          "BF": "cumulativeStats.pitching.battersFaced", // doesn't apply put we'll put something here
          "TB": "cumulativeStats.pitching.totalBases",
          "SO": "cumulativeStats.pitching.strikeouts",
          "AVG": "cumulativeStats.pitching.battingAverageAgainst",
          "IP": "cumulativeStats.pitching.inningsPitched"
        }
    },
    'HITTER_HITS': {
        fields: ['hitting.hits'],
        defensiveTeamFields: ['averageStats.defensive.hits'],
        defensiveSortingOrder: 'asc',
        defaultLineValue: 0,
        supportingStats : {
          "AB": "situationalStats.%situation%.hitting.atBats",
          "H": "situationalStats.%situation%.hitting.hits",
          "AVG": "situationalStats.%situation%.hitting.battingAverage",
          "OBP": "situationalStats.%situation%.hitting.onBasePercentage",
          "SLG": "situationalStats.%situation%.hitting.sluggingPercentage"
        },
        gamelogStats: {
          "H": "cumulativeStats.hitting.hits",
          "R": "cumulativeStats.hitting.runs",
          "TB": "cumulativeStats.hitting.totalBases",
          "AB": "cumulativeStats.hitting.atBats",
          "HR": "cumulativeStats.hitting.homeRuns",
          "RBI": "cumulativeStats.hitting.runsBattedIn",
          "AVG": "cumulativeStats.hitting.battingAverage",
          "OPS": "cumulativeStats.hitting.onBasePlusSluggingPercentage"
        },
        opposingSupportingStats: {
          "BF": {
            ranked: false,
            teamFields: ['situationalStats.%situation%.defensive.battersFaced'],
            playerFields: ['situationalStats.%situation%.pitching.battersFaced']
          },
          "H": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.defensive.hits'],
            playerFields: ['situationalStats.%situation%.pitching.hits'],
            sortingOrder: 'asc'
          },
          "SO%": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.defensive.strikeoutPercentage'],
            playerFields: ['situationalStats.%situation%.pitching.strikeoutPercentage'],
            sortingOrder: 'asc'
          },
          "AVG": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.defensive.battingAverage'],
            playerFields: ['situationalStats.%situation%.pitching.battingAverageAgainst'],
            sortingOrder: 'asc'
          },
          "OBP": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.defensive.onBasePercentage'],
            playerFields: ['situationalStats.%situation%.pitching.onBasePercentage'],
            sortingOrder: 'asc'
          }
        },
        opposingTeamGamelogSupportingStats: {
          "BF": "cumulativeStats.defensive.battersFaced", // doesn't apply put we'll put something here
          "H": "cumulativeStats.defensive.hits",
          "SO": "cumulativeStats.defensive.strikeouts",
          "AVG": "cumulativeStats.defensive.battingAverage",
          "OBP": "cumulativeStats.defensive.onBasePercentage"
        },
        opposingPitcherGamelogSupportingStats: {
          "BF": "cumulativeStats.pitching.battersFaced", // doesn't apply put we'll put something here
          "H": "cumulativeStats.pitching.hits",
          "SO": "cumulativeStats.pitching.strikeouts",
          "AVG": "cumulativeStats.pitching.battingAverageAgainst",
          "IP": "cumulativeStats.pitching.inningsPitched"
        }
    },
    'HITTER_RUNS': {
        fields: ['hitting.runs'],
        defensiveTeamFields: ['averageStats.defensive.runs'],
        defensiveSortingOrder: 'asc',
        defaultLineValue: 0,
        supportingStats : {
          "AB": "situationalStats.%situation%.hitting.atBats",
          "R": "situationalStats.%situation%.hitting.runs",
          "AVG": "situationalStats.%situation%.hitting.battingAverage",
          "OBP": "situationalStats.%situation%.hitting.onBasePercentage",
          "SLG": "situationalStats.%situation%.hitting.sluggingPercentage"
        },
        gamelogStats: {
          "R": "cumulativeStats.hitting.runs",
          "H": "cumulativeStats.hitting.hits",
          "TB": "cumulativeStats.hitting.totalBases",
          "AB": "cumulativeStats.hitting.atBats",
          "HR": "cumulativeStats.hitting.homeRuns",
          "RBI": "cumulativeStats.hitting.runsBattedIn",
          "AVG": "cumulativeStats.hitting.battingAverage",
          "OPS": "cumulativeStats.hitting.onBasePlusSluggingPercentage"
        },
        opposingSupportingStats: {
          "BF": {
            ranked: false,
            teamFields: ['situationalStats.%situation%.defensive.battersFaced'],
            playerFields: ['situationalStats.%situation%.pitching.battersFaced']
          },
          "R": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.defensive.runs'],
            playerFields: ['situationalStats.%situation%.pitching.runs'],
            sortingOrder: 'asc'
          },
          "SO%": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.defensive.strikeoutPercentage'],
            playerFields: ['situationalStats.%situation%.pitching.strikeoutPercentage'],
            sortingOrder: 'asc'
          },
          "AVG": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.defensive.battingAverage'],
            playerFields: ['situationalStats.%situation%.pitching.battingAverageAgainst'],
            sortingOrder: 'asc'
          },
          "OBP": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.defensive.onBasePercentage'],
            playerFields: ['situationalStats.%situation%.pitching.onBasePercentage'],
            sortingOrder: 'asc'
          }
        },
        opposingTeamGamelogSupportingStats: {
          "BF": "cumulativeStats.defensive.battersFaced", // doesn't apply put we'll put something here
          "R": "cumulativeStats.defensive.runs",
          "SO": "cumulativeStats.defensive.strikeouts",
          "AVG": "cumulativeStats.defensive.battingAverage",
          "OBP": "cumulativeStats.defensive.onBasePercentage"
        },
        opposingPitcherGamelogSupportingStats: {
          "BF": "cumulativeStats.pitching.battersFaced", // doesn't apply put we'll put something here
          "R": "cumulativeStats.pitching.runs",
          "SO": "cumulativeStats.pitching.strikeouts",
          "AVG": "cumulativeStats.pitching.battingAverageAgainst",
          "IP": "cumulativeStats.pitching.inningsPitched"
        }
    },
    'HITTER_RUNS_BATTED_IN': {
        fields: ['hitting.runsBattedIn'],
        defensiveTeamFields: ['averageStats.defensive.runsBattedIn'],
        defensiveSortingOrder: 'asc',
        defaultLineValue: 0,
        supportingStats : {
          "AB": "situationalStats.%situation%.hitting.atBats",
          "RBI": "situationalStats.%situation%.hitting.runsBattedIn",
          "AVG": "situationalStats.%situation%.hitting.battingAverage",
          "OBP": "situationalStats.%situation%.hitting.onBasePercentage",
          "SLG": "situationalStats.%situation%.hitting.sluggingPercentage"
        },
        gamelogStats: {
          "RBI": "cumulativeStats.hitting.runsBattedIn",
          "R": "cumulativeStats.hitting.runs",
          "H": "cumulativeStats.hitting.hits",
          "TB": "cumulativeStats.hitting.totalBases",
          "AB": "cumulativeStats.hitting.atBats",
          "HR": "cumulativeStats.hitting.homeRuns",
          "AVG": "cumulativeStats.hitting.battingAverage",
          "OPS": "cumulativeStats.hitting.onBasePlusSluggingPercentage"
        },
        opposingSupportingStats: {
          "BF": {
            ranked: false,
            teamFields: ['situationalStats.%situation%.defensive.battersFaced'],
            playerFields: ['situationalStats.%situation%.pitching.battersFaced']
          },
          "RBI": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.defensive.runsBattedIn'],
            playerFields: ['situationalStats.%situation%.pitching.runsBattedIn'],
            sortingOrder: 'asc'
          },
          "SO%": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.defensive.strikeoutPercentage'],
            playerFields: ['situationalStats.%situation%.pitching.strikeoutPercentage'],
            sortingOrder: 'asc'
          },
          "AVG": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.defensive.battingAverage'],
            playerFields: ['situationalStats.%situation%.pitching.battingAverageAgainst'],
            sortingOrder: 'asc'
          },
          "OBP": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.defensive.onBasePercentage'],
            playerFields: ['situationalStats.%situation%.pitching.onBasePercentage'],
            sortingOrder: 'asc'
          }
        },
        opposingTeamGamelogSupportingStats: {
          "BF": "cumulativeStats.defensive.battersFaced", // doesn't apply put we'll put something here
          "RBI": "cumulativeStats.defensive.runsBattedIn",
          "SO": "cumulativeStats.defensive.strikeouts",
          "AVG": "cumulativeStats.defensive.battingAverage",
          "OBP": "cumulativeStats.defensive.onBasePercentage"
        },
        opposingPitcherGamelogSupportingStats: {
          "BF": "cumulativeStats.pitching.battersFaced", // doesn't apply put we'll put something here
          "RBI": "cumulativeStats.pitching.runsBattedIn",
          "SO": "cumulativeStats.pitching.strikeouts",
          "AVG": "cumulativeStats.pitching.battingAverageAgainst",
          "IP": "cumulativeStats.pitching.inningsPitched"
        }
    },
    'HITTER_HOME_RUNS': {
        fields: ['hitting.homeRuns'],
        defensiveTeamFields: ['averageStats.defensive.homeRuns'],
        defensiveSortingOrder: 'asc',
        defaultLineValue: 0,
        supportingStats : {
          "AB": "situationalStats.%situation%.hitting.atBats",
          "HR": "situationalStats.%situation%.hitting.homeRuns",
          "AVG": "situationalStats.%situation%.hitting.battingAverage",
          "OBP": "situationalStats.%situation%.hitting.onBasePercentage",
          "SLG": "situationalStats.%situation%.hitting.sluggingPercentage"
        },
        gamelogStats: {
          "HR": "cumulativeStats.hitting.homeRuns",
          "H": "cumulativeStats.hitting.hits",
          "TB": "cumulativeStats.hitting.totalBases",
          "AB": "cumulativeStats.hitting.atBats",
          "R": "cumulativeStats.hitting.runs",
          "RBI": "cumulativeStats.hitting.runsBattedIn",
          "AVG": "cumulativeStats.hitting.battingAverage",
          "OPS": "cumulativeStats.hitting.onBasePlusSluggingPercentage"
        },
        opposingSupportingStats: {
          "BF": {
            ranked: false,
            teamFields: ['situationalStats.%situation%.defensive.battersFaced'],
            playerFields: ['situationalStats.%situation%.pitching.battersFaced']
          },
          "HR": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.defensive.homeRuns'],
            playerFields: ['situationalStats.%situation%.pitching.homeRuns'],
            sortingOrder: 'asc'
          },
          "SO%": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.defensive.strikeoutPercentage'],
            playerFields: ['situationalStats.%situation%.pitching.strikeoutPercentage'],
            sortingOrder: 'asc'
          },
          "AVG": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.defensive.battingAverage'],
            playerFields: ['situationalStats.%situation%.pitching.battingAverageAgainst'],
            sortingOrder: 'asc'
          },
          "OBP": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.defensive.onBasePercentage'],
            playerFields: ['situationalStats.%situation%.pitching.onBasePercentage'],
            sortingOrder: 'asc'
          }
        },
        opposingTeamGamelogSupportingStats: {
          "BF": "cumulativeStats.defensive.battersFaced", // doesn't apply put we'll put something here
          "HR": "cumulativeStats.defensive.homeRuns",
          "SO": "cumulativeStats.defensive.strikeouts",
          "AVG": "cumulativeStats.defensive.battingAverage",
          "OBP": "cumulativeStats.defensive.onBasePercentage"
        },
        opposingPitcherGamelogSupportingStats: {
          "BF": "cumulativeStats.pitching.battersFaced", // doesn't apply put we'll put something here
          "HR": "cumulativeStats.pitching.homeRuns",
          "SO": "cumulativeStats.pitching.strikeouts",
          "AVG": "cumulativeStats.pitching.battingAverageAgainst",
          "IP": "cumulativeStats.pitching.inningsPitched"
        }
    },
    'HITTER_SINGLES': {
        fields: ['hitting.singles'],
        defensiveTeamFields: ['averageStats.defensive.singles'],
        defensiveSortingOrder: 'asc',
        defaultLineValue: 0,
        supportingStats : {
          "AB": "situationalStats.%situation%.hitting.atBats",
          "1B": "situationalStats.%situation%.hitting.singles",
          "AVG": "situationalStats.%situation%.hitting.battingAverage",
          "OBP": "situationalStats.%situation%.hitting.onBasePercentage",
          "SLG": "situationalStats.%situation%.hitting.sluggingPercentage"
        },
        gamelogStats: {
          "1B": "cumulativeStats.hitting.singles",
          "H": "cumulativeStats.hitting.hits",
          "R": "cumulativeStats.hitting.runs",
          "AB": "cumulativeStats.hitting.atBats",
          "TB": "cumulativeStats.hitting.totalBases",
          "HR": "cumulativeStats.hitting.homeRuns",
          "AVG": "cumulativeStats.hitting.battingAverage",
          "OPS": "cumulativeStats.hitting.onBasePlusSluggingPercentage"
        },
        opposingSupportingStats: {
          "BF": {
            ranked: false,
            teamFields: ['situationalStats.%situation%.defensive.battersFaced'],
            playerFields: ['situationalStats.%situation%.pitching.battersFaced']
          },
          "1B": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.defensive.singles'],
            playerFields: ['situationalStats.%situation%.pitching.singles'],
            sortingOrder: 'asc'
          },
          "SO%": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.defensive.strikeoutPercentage'],
            playerFields: ['situationalStats.%situation%.pitching.strikeoutPercentage'],
            sortingOrder: 'asc'
          },
          "AVG": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.defensive.battingAverage'],
            playerFields: ['situationalStats.%situation%.pitching.battingAverageAgainst'],
            sortingOrder: 'asc'
          },
          "OBP": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.defensive.onBasePercentage'],
            playerFields: ['situationalStats.%situation%.pitching.onBasePercentage'],
            sortingOrder: 'asc'
          }
        },
        opposingTeamGamelogSupportingStats: {
          "BF": "cumulativeStats.defensive.battersFaced", // doesn't apply put we'll put something here
          "1B": "cumulativeStats.defensive.singles",
          "SO": "cumulativeStats.defensive.strikeouts",
          "AVG": "cumulativeStats.defensive.battingAverage",
          "OBP": "cumulativeStats.defensive.onBasePercentage"
        },
        opposingPitcherGamelogSupportingStats: {
          "BF": "cumulativeStats.pitching.battersFaced", // doesn't apply put we'll put something here
          "1B": "cumulativeStats.pitching.singles",
          "SO": "cumulativeStats.pitching.strikeouts",
          "AVG": "cumulativeStats.pitching.battingAverageAgainst",
          "IP": "cumulativeStats.pitching.inningsPitched"
        }
    },
    'HITTER_DOUBLES': {
        fields: ['hitting.doubles'],
        defensiveTeamFields: ['averageStats.defensive.doubles'],
        defensiveSortingOrder: 'asc',
        defaultLineValue: 0,
        supportingStats : {
          "AB": "situationalStats.%situation%.hitting.atBats",
          "2B": "situationalStats.%situation%.hitting.doubles",
          "AVG": "situationalStats.%situation%.hitting.battingAverage",
          "OBP": "situationalStats.%situation%.hitting.onBasePercentage",
          "SLG": "situationalStats.%situation%.hitting.sluggingPercentage"
        },
        gamelogStats: {
          "2B": "cumulativeStats.hitting.doubles",
          "H": "cumulativeStats.hitting.hits",
          "R": "cumulativeStats.hitting.runs",
          "AB": "cumulativeStats.hitting.atBats",
          "TB": "cumulativeStats.hitting.totalBases",
          "HR": "cumulativeStats.hitting.homeRuns",
          "AVG": "cumulativeStats.hitting.battingAverage",
          "OPS": "cumulativeStats.hitting.onBasePlusSluggingPercentage"
        },
        opposingSupportingStats: {
          "BF": {
            ranked: false,
            teamFields: ['situationalStats.%situation%.defensive.battersFaced'],
            playerFields: ['situationalStats.%situation%.pitching.battersFaced']
          },
          "2B": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.defensive.doubles'],
            playerFields: ['situationalStats.%situation%.pitching.doubles'],
            sortingOrder: 'asc'
          },
          "SO%": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.defensive.strikeoutPercentage'],
            playerFields: ['situationalStats.%situation%.pitching.strikeoutPercentage'],
            sortingOrder: 'asc'
          },
          "AVG": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.defensive.battingAverage'],
            playerFields: ['situationalStats.%situation%.pitching.battingAverageAgainst'],
            sortingOrder: 'asc'
          },
          "OBP": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.defensive.onBasePercentage'],
            playerFields: ['situationalStats.%situation%.pitching.onBasePercentage'],
            sortingOrder: 'asc'
          }
        },
        opposingTeamGamelogSupportingStats: {
          "BF": "cumulativeStats.defensive.battersFaced", // doesn't apply put we'll put something here
          "2B": "cumulativeStats.defensive.doubles",
          "SO": "cumulativeStats.defensive.strikeouts",
          "AVG": "cumulativeStats.defensive.battingAverage",
          "OBP": "cumulativeStats.defensive.onBasePercentage"
        },
        opposingPitcherGamelogSupportingStats: {
          "BF": "cumulativeStats.pitching.battersFaced", // doesn't apply put we'll put something here
          "2B": "cumulativeStats.pitching.doubles",
          "SO": "cumulativeStats.pitching.strikeouts",
          "AVG": "cumulativeStats.pitching.battingAverageAgainst",
          "IP": "cumulativeStats.pitching.inningsPitched"
        }
    },
    'HITTER_TRIPLES': {
        fields: ['hitting.triples'],
        defensiveTeamFields: ['averageStats.defensive.triples'],
        defensiveSortingOrder: 'asc',
        defaultLineValue: 0,
        supportingStats : {
          "AB": "situationalStats.%situation%.hitting.atBats",
          "3B": "situationalStats.%situation%.hitting.triples",
          "AVG": "situationalStats.%situation%.hitting.battingAverage",
          "OBP": "situationalStats.%situation%.hitting.onBasePercentage",
          "SLG": "situationalStats.%situation%.hitting.sluggingPercentage"
        },
        gamelogStats: {
          "3B": "cumulativeStats.hitting.triples",
          "H": "cumulativeStats.hitting.hits",
          "R": "cumulativeStats.hitting.runs",
          "AB": "cumulativeStats.hitting.atBats",
          "TB": "cumulativeStats.hitting.totalBases",
          "HR": "cumulativeStats.hitting.homeRuns",
          "AVG": "cumulativeStats.hitting.battingAverage",
          "OPS": "cumulativeStats.hitting.onBasePlusSluggingPercentage"
        },
        opposingSupportingStats: {
          "BF": {
            ranked: false,
            teamFields: ['situationalStats.%situation%.defensive.battersFaced'],
            playerFields: ['situationalStats.%situation%.pitching.battersFaced']
          },
          "3B": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.defensive.triples'],
            playerFields: ['situationalStats.%situation%.pitching.triples'],
            sortingOrder: 'asc'
          },
          "SO%": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.defensive.strikeoutPercentage'],
            playerFields: ['situationalStats.%situation%.pitching.strikeoutPercentage'],
            sortingOrder: 'asc'
          },
          "AVG": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.defensive.battingAverage'],
            playerFields: ['situationalStats.%situation%.pitching.battingAverageAgainst'],
            sortingOrder: 'asc'
          },
          "OBP": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.defensive.onBasePercentage'],
            playerFields: ['situationalStats.%situation%.pitching.onBasePercentage'],
            sortingOrder: 'asc'
          }
        },
        opposingTeamGamelogSupportingStats: {
          "BF": "cumulativeStats.defensive.battersFaced", // doesn't apply put we'll put something here
          "3B": "cumulativeStats.defensive.triples",
          "SO": "cumulativeStats.defensive.strikeouts",
          "AVG": "cumulativeStats.defensive.battingAverage",
          "OBP": "cumulativeStats.defensive.onBasePercentage"
        },
        opposingPitcherGamelogSupportingStats: {
          "BF": "cumulativeStats.pitching.battersFaced", // doesn't apply put we'll put something here
          "3B": "cumulativeStats.pitching.triples",
          "SO": "cumulativeStats.pitching.strikeouts",
          "AVG": "cumulativeStats.pitching.battingAverageAgainst",
          "IP": "cumulativeStats.pitching.inningsPitched"
        }
    },
    'HITTER_STOLEN_BASES': {
        fields: ['hitting.stolenBases'],
        defensiveTeamFields: ['averageStats.defensive.stolenBases'],
        defensiveSortingOrder: 'asc',
        defaultLineValue: 0,
        supportingStats : {
          "AB": "situationalStats.%situation%.hitting.atBats",
          "SB": "situationalStats.%situation%.hitting.stolenBases",
          "CS": "situationalStats.%situation%.hitting.caughtStealing",
          "AVG": "situationalStats.%situation%.hitting.battingAverage",
          "OBP": "situationalStats.%situation%.hitting.onBasePercentage"
        },
        gamelogStats: {
          "SB": "cumulativeStats.hitting.stolenBases",
          "CS": "cumulativeStats.hitting.caughtStealing",
          "H": "cumulativeStats.hitting.hits",
          "AB": "cumulativeStats.hitting.atBats",
          "R": "cumulativeStats.hitting.runs",
          "TB": "cumulativeStats.hitting.totalBases",
          "AVG": "cumulativeStats.hitting.battingAverage",
          "OPS": "cumulativeStats.hitting.onBasePlusSluggingPercentage"
        },
        opposingSupportingStats: {
          "BF": {
            ranked: false,
            teamFields: ['situationalStats.%situation%.defensive.battersFaced'],
            playerFields: ['situationalStats.%situation%.pitching.battersFaced']
          },
          "SB": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.defensive.stolenBases'],
            playerFields: ['situationalStats.%situation%.pitching.stolenBases'],
            sortingOrder: 'asc'
          },
          "SO%": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.defensive.strikeoutPercentage'],
            playerFields: ['situationalStats.%situation%.pitching.strikeoutPercentage'],
            sortingOrder: 'asc'
          },
          "AVG": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.defensive.battingAverage'],
            playerFields: ['situationalStats.%situation%.pitching.battingAverageAgainst'],
            sortingOrder: 'asc'
          },
          "OBP": {
            ranked: true,
            teamFields: ['situationalStats.%situation%.defensive.onBasePercentage'],
            playerFields: ['situationalStats.%situation%.pitching.onBasePercentage'],
            sortingOrder: 'asc'
          }
        },
        opposingTeamGamelogSupportingStats: {
          "BF": "cumulativeStats.defensive.battersFaced", // doesn't apply put we'll put something here
          "SB": "cumulativeStats.defensive.stolenBases",
          "SO": "cumulativeStats.defensive.strikeouts",
          "AVG": "cumulativeStats.defensive.battingAverage",
          "OBP": "cumulativeStats.defensive.onBasePercentage"
        },
        opposingPitcherGamelogSupportingStats: {
          "BF": "cumulativeStats.pitching.battersFaced", // doesn't apply put we'll put something here
          "SB": "cumulativeStats.pitching.stolenBases",
          "SO": "cumulativeStats.pitching.strikeouts",
          "AVG": "cumulativeStats.pitching.battingAverageAgainst",
          "IP": "cumulativeStats.pitching.inningsPitched"
        }
    },
    // 'HITTER_STRIKEOUTS': {
    //     fields: ['hitting.strikeouts'],
    //     defensiveTeamFields: ['averageStats.defensive.strikeouts'],
    //     defensiveSortingOrder: 'asc',
    //     defaultLineValue: 0
    // }
    'HITTER_HITS_PLUS_RUNS_PLUS_RUNS_BATTED_IN': {
      fields: ['hitting.hits', 'hitting.runs', 'hitting.runsBattedIn'],
      defensiveTeamFields: ['averageStats.defensive.hits', 'averageStats.defensive.runs', 'averageStats.defensive.runsBattedIn'],
      defensiveSortingOrder: 'asc',
      defaultLineValue: 0,
      supportingStats : {
        "AB": "situationalStats.%situation%.hitting.atBats",
        "R": "situationalStats.%situation%.hitting.runs",
        "H": "situationalStats.%situation%.hitting.hits",
        "RBI": "situationalStats.%situation%.hitting.runsBattedIn",
        "AVG": "situationalStats.%situation%.hitting.battingAverage"
      },
      gamelogStats: {
        "R": "cumulativeStats.hitting.runs",
        "H": "cumulativeStats.hitting.hits",
        "RBI": "cumulativeStats.hitting.runsBattedIn",
        "AB": "cumulativeStats.hitting.atBats",
        "TB": "cumulativeStats.hitting.totalBases",
        "AVG": "cumulativeStats.hitting.battingAverage",
        "OPS": "cumulativeStats.hitting.onBasePlusSluggingPercentage"
      },
      opposingSupportingStats: {
        "BF": {
          ranked: false,
          teamFields: ['situationalStats.%situation%.defensive.battersFaced'],
          playerFields: ['situationalStats.%situation%.pitching.battersFaced']
        },
        "R": {
          ranked: true,
          teamFields: ['situationalStats.%situation%.defensive.runs'],
          playerFields: ['situationalStats.%situation%.pitching.runs'],
          sortingOrder: 'asc'
        },
        "H": {
          ranked: true,
          teamFields: ['situationalStats.%situation%.defensive.hits'],
          playerFields: ['situationalStats.%situation%.pitching.hits'],
          sortingOrder: 'asc'
        },
        "RBI": {
          ranked: true,
          teamFields: ['situationalStats.%situation%.defensive.runsBattedIn'],
          playerFields: ['situationalStats.%situation%.pitching.runsBattedIn'],
          sortingOrder: 'asc'
        },
        "AVG": {
          ranked: true,
          teamFields: ['situationalStats.%situation%.defensive.battingAverage'],
          playerFields: ['situationalStats.%situation%.pitching.battingAverageAgainst'],
          sortingOrder: 'asc'
        }
      }
    },
    // TODO: supporting stats, gamelog, reverse name
    // 'HITTER_WALKS': {
    //   fields: ['hitting.walks'],
    //   defensiveTeamFields: ['averageStats.defensive.walks'],
    //   defensiveSortingOrder: 'asc',
    //   defaultLineValue: 0,
    //   supportingStats : {
    //     "AB": "situationalStats.%situation%.hitting.atBats",
    //     "1B": "situationalStats.%situation%.hitting.singles",
    //     "AVG": "situationalStats.%situation%.hitting.battingAverage",
    //     "OBP": "situationalStats.%situation%.hitting.onBasePercentage",
    //     "SLG": "situationalStats.%situation%.hitting.sluggingPercentage"
    //   },
    //   gamelogStats: {
    //     "1B": "cumulativeStats.hitting.singles",
    //     "H": "cumulativeStats.hitting.hits",
    //     "R": "cumulativeStats.hitting.runs",
    //     "AB": "cumulativeStats.hitting.atBats",
    //     "TB": "cumulativeStats.hitting.totalBases",
    //     "HR": "cumulativeStats.hitting.homeRuns",
    //     "AVG": "cumulativeStats.hitting.battingAverage",
    //     "OPS": "cumulativeStats.hitting.onBasePlusSluggingPercentage"
    //   },
    //   opposingSupportingStats: {
    //     "BF": {
    //       ranked: false,
    //       teamFields: ['situationalStats.%situation%.defensive.battersFaced'],
    //       playerFields: ['situationalStats.%situation%.pitching.battersFaced']
    //     },
    //     "1B": {
    //       ranked: true,
    //       teamFields: ['situationalStats.%situation%.defensive.singles'],
    //       playerFields: ['situationalStats.%situation%.pitching.singles'],
    //       sortingOrder: 'asc'
    //     },
    //     "SO%": {
    //       ranked: true,
    //       teamFields: ['situationalStats.%situation%.defensive.strikeoutPercentage'],
    //       playerFields: ['situationalStats.%situation%.pitching.strikeoutPercentage'],
    //       sortingOrder: 'asc'
    //     },
    //     "AVG": {
    //       ranked: true,
    //       teamFields: ['situationalStats.%situation%.defensive.battingAverage'],
    //       playerFields: ['situationalStats.%situation%.pitching.battingAverageAgainst'],
    //       sortingOrder: 'asc'
    //     },
    //     "OBP": {
    //       ranked: true,
    //       teamFields: ['situationalStats.%situation%.defensive.onBasePercentage'],
    //       playerFields: ['situationalStats.%situation%.pitching.onBasePercentage'],
    //       sortingOrder: 'asc'
    //     }
    //   },
    //   opposingTeamGamelogSupportingStats: {
    //     "BF": "cumulativeStats.defensive.battersFaced", // doesn't apply put we'll put something here
    //     "1B": "cumulativeStats.defensive.singles",
    //     "SO": "cumulativeStats.defensive.strikeouts",
    //     "AVG": "cumulativeStats.defensive.battingAverage",
    //     "OBP": "cumulativeStats.defensive.onBasePercentage"
    //   },
    //   opposingPitcherGamelogSupportingStats: {
    //     "BF": "cumulativeStats.pitching.battersFaced", // doesn't apply put we'll put something here
    //     "1B": "cumulativeStats.pitching.singles",
    //     "SO": "cumulativeStats.pitching.strikeouts",
    //     "AVG": "cumulativeStats.pitching.battingAverageAgainst",
    //     "IP": "cumulativeStats.pitching.inningsPitched"
    //   }
    // }
  },
  bundesliga: SOCCER_PLAYER_PROPS,
  epl: SOCCER_PLAYER_PROPS,
  laliga: SOCCER_PLAYER_PROPS,
  ligue1: SOCCER_PLAYER_PROPS,
  seriea: SOCCER_PLAYER_PROPS,
  "brazil-serie-a": SOCCER_PLAYER_PROPS,
  mls: SOCCER_PLAYER_PROPS,
  euro: SOCCER_PLAYER_PROPS,
  ucl: SOCCER_PLAYER_PROPS,
  uel: SOCCER_PLAYER_PROPS,
  "fifa-world-cup": SOCCER_PLAYER_PROPS,
  afl: {
    'ANYTIME_GOAL_SCORER': {
      fields: ['goals'],
      defensiveTeamFields: ['averageStats.defensive.goals'],
      defensiveSortingOrder: 'asc',
      defaultLineValue: 0,
      supportingStats : {
        "GP": "gamesPlayed",
        "G": "averageStats.goals",
        "B": "averageStats.behinds",
        "PTS": "averageStats.points"
      },
      gamelogStats: {
        "G": "cumulativeStats.goals",
        "B": "cumulativeStats.behinds",
        "PTS": "cumulativeStats.points"
      },
      opposingSupportingStats: {
        "GP": {
          ranked: false,
          teamFields: ['gamesPlayed']
        },
        "G": {
          ranked: true,
          teamFields: ['averageStats.defensive.goals'],
          sortingOrder: 'asc'
        },
        "B": {
          ranked: true,
          teamFields: ['averageStats.defensive.behinds'],
          sortingOrder: 'asc'
        },
        "PTS": {
          ranked: true,
          teamFields: ['averageStats.defensive.points'],
          sortingOrder: 'asc'
        }
      }
    },
    'DISPOSALS': {
      fields: ['disposals'],
      defensiveTeamFields: ['averageStats.defensive.disposals'],
      defensiveSortingOrder: 'asc',
      defaultLineValue: 0,
      supportingStats : {
        "GP": "gamesPlayed",
        "D": "averageStats.disposals",
        "H": "averageStats.handballs",
        "K": "averageStats.kicks",
        "M": "averageStats.marks",
      },
      gamelogStats: {
        "D": "cumulativeStats.disposals",
        "H": "cumulativeStats.handballs",
        "K": "cumulativeStats.kicks",
        "M": "cumulativeStats.marks"
      },
      opposingSupportingStats: {
        "GP": {
          ranked: false,
          teamFields: ['gamesPlayed']
        },
        "D": {
          ranked: true,
          teamFields: ['averageStats.defensive.disposals'],
          sortingOrder: 'asc'
        },
        "H": {
          ranked: true,
          teamFields: ['averageStats.defensive.handballs'],
          sortingOrder: 'asc'
        },
        "K": {
          ranked: true,
          teamFields: ['averageStats.defensive.kicks'],
          sortingOrder: 'asc'
        },
        "M": {
          ranked: true,
          teamFields: ['averageStats.defensive.marks'],
          sortingOrder: 'asc'
        }
      }
    },
    'MARKS': {
      fields: ['marks'],
      defensiveTeamFields: ['averageStats.defensive.marks'],
      defensiveSortingOrder: 'asc',
      defaultLineValue: 0,
      supportingStats : {
        "GP": "gamesPlayed",
        "M": "averageStats.marks",
        "K": "averageStats.kicks",
        "D": "averageStats.disposals",
        "B": "averageStats.behinds"
      },
      gamelogStats: {
        "M": "cumulativeStats.marks",
        "K": "cumulativeStats.kicks",
        "D": "cumulativeStats.disposals",
        "B": "cumulativeStats.behinds"
      },
      opposingSupportingStats: {
        "GP": {
          ranked: false,
          teamFields: ['gamesPlayed']
        },
        "M": {
          ranked: true,
          teamFields: ['averageStats.defensive.marks'],
          sortingOrder: 'asc'
        },
        "K": {
          ranked: true,
          teamFields: ['averageStats.defensive.kicks'],
          sortingOrder: 'asc'
        },
        "D": {
          ranked: true,
          teamFields: ['averageStats.defensive.disposals'],
          sortingOrder: 'asc'
        },
        "B": {
          ranked: true,
          teamFields: ['averageStats.defensive.behinds'],
          sortingOrder: 'asc'
        }
      }
    },
    'TACKLES': {
      fields: ['tackles'],
      defensiveTeamFields: ['averageStats.defensive.tackles'],
      defensiveSortingOrder: 'asc',
      defaultLineValue: 0,
      supportingStats : {
        "GP": "gamesPlayed",
        "T": "averageStats.tackles",
        // I dont think these stats are relevent as supporting but not sure what else to put
        "K": "averageStats.kicks",
        "H": "averageStats.handballs",
        "M": "averageStats.marks"
      },
      gamelogStats: {
        "T": "cumulativeStats.tackles",
        "K": "cumulativeStats.kicks",
        "H": "cumulativeStats.handballs",
        "M": "cumulativeStats.marks"
      },
      opposingSupportingStats: {
        "GP": {
          ranked: false,
          teamFields: ['gamesPlayed']
        },
        "T": {
          ranked: true,
          teamFields: ['averageStats.defensive.tackles'],
          sortingOrder: 'asc'
        },
        "K": {
          ranked: true,
          teamFields: ['averageStats.defensive.kicks'],
          sortingOrder: 'asc'
        },
        "H": {
          ranked: true,
          teamFields: ['averageStats.defensive.handballs'],
          sortingOrder: 'asc'
        },
        "M": {
          ranked: true,
          teamFields: ['averageStats.defensive.marks'],
          sortingOrder: 'asc'
        }
      }
    }
  },
  nrl: {
    'ANYTIME_TRY_SCORER': {
      fields: ['tries'],
      defensiveTeamFields: ['averageStats.defensive.tries'],
      defensiveSortingOrder: 'asc',
      defaultLineValue: 0,
      supportingStats : {
        "GP": "gamesPlayed",
        "T": "averageStats.tries",
        "LB": "averageStats.lineBreaks",
        "TB": "averageStats.tackleBreaks",
        "RM": "averageStats.allRunMetres"
      },
      gamelogStats: {
        "T": "averageStats.tries",
        "LB": "averageStats.lineBreaks",
        "TB": "averageStats.tackleBreaks",
        "RM": "averageStats.allRunMetres",
        "PCRM": "averageStats.postContactMetres"
      },
      opposingSupportingStats: {
        "GP": {
          ranked: false,
          teamFields: ['gamesPlayed']
        },
        "T": {
          ranked: true,
          teamFields: ['averageStats.defensive.tries'],
          sortingOrder: 'asc'
        },
        "LB": {
          ranked: true,
          teamFields: ['averageStats.defensive.lineBreaks'],
          sortingOrder: 'asc'
        },
        "TB": {
          ranked: true,
          teamFields: ['averageStats.defensive.tackleBreaks'],
          sortingOrder: 'asc'
        },
        "RM": {
          ranked: true,
          teamFields: ['averageStats.defensive.allRunMetres'],
          sortingOrder: 'asc'
        }
      }
    },
    'TRIES': {
      fields: ['tries'],
      defensiveTeamFields: ['averageStats.defensive.tries'],
      defensiveSortingOrder: 'asc',
      defaultLineValue: 0,
      supportingStats : {
        "GP": "gamesPlayed",
        "T": "averageStats.tries",
        "LB": "averageStats.lineBreaks",
        "TB": "averageStats.tackleBreaks",
        "RM": "averageStats.allRunMetres"
      },
      gamelogStats: {
        "T": "averageStats.tries",
        "LB": "averageStats.lineBreaks",
        "TB": "averageStats.tackleBreaks",
        "RM": "averageStats.allRunMetres",
        "PCRM": "averageStats.postContactMetres"
      },
      opposingSupportingStats: {
        "GP": {
          ranked: false,
          teamFields: ['gamesPlayed']
        },
        "T": {
          ranked: true,
          teamFields: ['averageStats.defensive.tries'],
          sortingOrder: 'asc'
        },
        "LB": {
          ranked: true,
          teamFields: ['averageStats.defensive.lineBreaks'],
          sortingOrder: 'asc'
        },
        "TB": {
          ranked: true,
          teamFields: ['averageStats.defensive.tackleBreaks'],
          sortingOrder: 'asc'
        },
        "RM": {
          ranked: true,
          teamFields: ['averageStats.defensive.allRunMetres'],
          sortingOrder: 'asc'
        }
      }
    }
  }
}

// Splits filter
export const HOME_AWAY_SPLIT = "home + away";

// Only keeping the definition of the variable until we cleanup all the references in old code that hasn't been cleaned up yet
export const COLOR_CODES = {}

export const GAME_TOTAL_MARKET_ID = "GAME_TOTAL";
export const GAME_TOTAL_MARKET_NAME = "Game Total";
export const SPREAD_MARKET_ID = "SPREAD";
export const SPREAD_MARKET_NAME = "Spread";
export const ALL_BETS_MARKET_NAME = "All Bet Types";
export const ALL_GAMES_FILTER_OPTION = "All Games";
export const ALL_OUTCOMES_FILTER_OPTION = "Over+Under"

// OVER_UNDER will have over and under outcomes in workstation
export const OUTCOME_TYPE_OVER_UNDER = "OVER_UNDER";
// COVER will have a single outcome for cover
export const OUTCOME_TYPE_COVER = "COVER";
// This is still a cover but we need to force a 0.5 line on these
export const OUTCOME_TYPE_COVER_YES = "COVER_YES";
// No line for this one
export const OUTCOME_TYPE_YES_NO = "YES_NO"

export const GAME_BET_TYPE = 'game';
export const TEAM_BET_TYPE = 'team';

const SOCCER_TEAM_BETS = {
  'GAME_TOTAL': {
    type: GAME_BET_TYPE,
    displayName: 'Game Total',
    outcomeType: OUTCOME_TYPE_OVER_UNDER,
    gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.goals') 
                                          + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.goals'))
  },
  'GAME_TOTAL_CARDS': {
    type: GAME_BET_TYPE,
    displayName: 'Game Total Cards',
    outcomeType: OUTCOME_TYPE_OVER_UNDER,
    gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.cardsGiven') 
                                          + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.cardsGiven'))
  },
  'BOTH_TEAMS_TO_SCORE': {
    type: GAME_BET_TYPE,
    displayName: 'Both Teams To Score',
    outcomeType: OUTCOME_TYPE_COVER_YES,
    gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.bothTeamToScore'))
  },
  'TEAM_TOTAL': {
    type: TEAM_BET_TYPE,
    displayName: 'Team Total',
    outcomeType: OUTCOME_TYPE_OVER_UNDER,
    gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.goals'))
  },
  'TEAM_TOTAL_CARDS': {
    type: TEAM_BET_TYPE,
    displayName: 'Team Total Cards',
    outcomeType: OUTCOME_TYPE_OVER_UNDER,
    gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.cardsGiven'))
  },
  'DOUBLE_CHANCE': {
    type: TEAM_BET_TYPE,
    displayName: 'Double Chance',
    outcomeType: OUTCOME_TYPE_COVER_YES,
    gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.doubleChance'))
  },
  'WIN_TO_NIL': {
    type: TEAM_BET_TYPE,
    displayName: 'Win To Nil',
    outcomeType: OUTCOME_TYPE_COVER_YES,
    gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.winWithoutConceding'))
  },
  'SPREAD': {
    type: TEAM_BET_TYPE,
    displayName: 'Spread',
    outcomeType: OUTCOME_TYPE_COVER,
    gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.goals') 
                                          - getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.goals')) * -1
  },
  'MONEY_LINE': {
    type: TEAM_BET_TYPE,
    displayName: 'Moneyline',
    outcomeType: OUTCOME_TYPE_COVER_YES,
    gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.goals') 
                                          > getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.goals')) | 0,
  },
  'CORNERS': {
    type: TEAM_BET_TYPE,
    displayName: 'Team Corners',
    outcomeType: OUTCOME_TYPE_OVER_UNDER,
    gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.cornerKicks'))
  },
  'SHOTS_ON_TARGET': {
    type: TEAM_BET_TYPE,
    displayName: 'Team Shots on Target',
    outcomeType: OUTCOME_TYPE_OVER_UNDER,
    gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.shotsOnTarget'))
  },
}

// We are using bitwise OR (|) to convert the boolean result to a 1/0 value
const BASKETBALL_GENERIC_TEAM_BETS = {
  'GAME_TOTAL': {
    type: GAME_BET_TYPE,
    displayName: 'Game Total',
    outcomeType: OUTCOME_TYPE_OVER_UNDER,
    gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points') 
                                          + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points')),
    // hitFunction: (record, line) => ((getDictionaryValueRawResult(record, 'cumulativeStats.offensive.points') 
    //                                + getDictionaryValueRawResult(record, 'cumulativeStats.defensive.points')) > line) | 0,
    // pushFunction: (record, line) => ((getDictionaryValueRawResult(record, 'cumulativeStats.offensive.points') 
    //                                 + getDictionaryValueRawResult(record, 'cumulativeStats.defensive.points')) === line) | 0,
    // missFucntion: (record, line) => ((getDictionaryValueRawResult(record, 'cumulativeStats.offensive.points') 
    //                                 + getDictionaryValueRawResult(record, 'cumulativeStats.defensive.points')) < line) | 0,
  },
  'TEAM_TOTAL': {
    type: TEAM_BET_TYPE,
    displayName: 'Team Total',
    outcomeType: OUTCOME_TYPE_OVER_UNDER,
    gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points')),
    // hitFunction: (record, line) => (getDictionaryValueRawResult(record, 'cumulativeStats.offensive.points') > line) | 0,
    // pushFunction: (record, line) => (getDictionaryValueRawResult(record, 'cumulativeStats.offensive.points') === line) | 0,
    // missFucntion: (record, line) => (getDictionaryValueRawResult(record, 'cumulativeStats.offensive.points') < line) | 0,
  },
  'SPREAD': {
    type: TEAM_BET_TYPE,
    displayName: 'Spread',
    outcomeType: OUTCOME_TYPE_COVER,
    gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points') 
                                          - getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points')) * -1,
    // hitFunction: (record, line) => ((getDictionaryValueRawResult(record, 'cumulativeStats.offensive.points') + line)
    //                                 > getDictionaryValueRawResult(record, 'cumulativeStats.defensive.points')) | 0,
    // pushFunction: (record, line) => ((getDictionaryValueRawResult(record, 'cumulativeStats.offensive.points') + line)
    //                               === getDictionaryValueRawResult(record, 'cumulativeStats.defensive.points')) | 0,
    // missFucntion: (record, line) => ((getDictionaryValueRawResult(record, 'cumulativeStats.offensive.points') + line)
    //                                 < getDictionaryValueRawResult(record, 'cumulativeStats.defensive.points')) | 0,
  },
  'MONEY_LINE': {
    type: TEAM_BET_TYPE,
    displayName: 'Moneyline',
    outcomeType: OUTCOME_TYPE_COVER_YES,
    gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points') 
                                          > getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points')) | 0,
    // hitFunction: (record) => (getDictionaryValueRawResult(record, 'cumulativeStats.offensive.points') 
    //                          > getDictionaryValueRawResult(record, 'cumulativeStats.defensive.points')) | 0,
    // pushFunction: (record) => (getDictionaryValueRawResult(record, 'cumulativeStats.offensive.points') 
    //                         === getDictionaryValueRawResult(record, 'cumulativeStats.defensive.points')) | 0,
    // missFucntion: (record) => (getDictionaryValueRawResult(record, 'cumulativeStats.offensive.points') 
    //                           < getDictionaryValueRawResult(record, 'cumulativeStats.defensive.points')) | 0,
  },
}

const BASKETBALL_HALF_BASED_TEAM_BETS = {
  'GAME_TOTAL_1H': {
    type: GAME_BET_TYPE,
    displayName: '1H Game Total',
    outcomeType: OUTCOME_TYPE_OVER_UNDER,
    gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points1h') 
                                          + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points1h')),
  },
  'TEAM_TOTAL_1H': {
    type: TEAM_BET_TYPE,
    displayName: '1H Team Total',
    outcomeType: OUTCOME_TYPE_OVER_UNDER,
    gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points1h'))
  },
  'SPREAD_1H': {
    type: TEAM_BET_TYPE,
    displayName: '1H Spread',
    outcomeType: OUTCOME_TYPE_COVER,
    gameValueFunction: (teamGameRecord) => ((getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points1h'))
                                          - (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points1h'))) * -1,
  },
  'MONEY_LINE_1H': {
    type: TEAM_BET_TYPE,
    displayName: '1H Moneyline',
    outcomeType: OUTCOME_TYPE_COVER_YES,
    gameValueFunction: (teamGameRecord) => ((getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points1h'))
                                          > (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points1h'))) | 0,
  }
}

const BASKETBALL_QUARTER_BASED_TEAM_BETS = {
  'GAME_TOTAL_1Q': {
    type: GAME_BET_TYPE,
    displayName: '1Q Game Total',
    outcomeType: OUTCOME_TYPE_OVER_UNDER,
    gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points1q') 
                                          + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points1q')),
  },
  'GAME_TOTAL_1H': {
    type: GAME_BET_TYPE,
    displayName: '1H Game Total',
    outcomeType: OUTCOME_TYPE_OVER_UNDER,
    gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points1q') 
                                          + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points2q')
                                          + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points1q')
                                          + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points2q')),
  },
  'TEAM_TOTAL_1Q': {
    type: TEAM_BET_TYPE,
    displayName: '1Q Team Total',
    outcomeType: OUTCOME_TYPE_OVER_UNDER,
    gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points1q')),
  },
  'TEAM_TOTAL_1H': {
    type: TEAM_BET_TYPE,
    displayName: '1H Team Total',
    outcomeType: OUTCOME_TYPE_OVER_UNDER,
    gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points1q') + 
                                            getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points2q'))
  },
  'SPREAD_1Q': {
    type: TEAM_BET_TYPE,
    displayName: '1Q Spread',
    outcomeType: OUTCOME_TYPE_COVER,
    gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points1q') 
                                          - getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points1q')) * -1,
  },
  'SPREAD_1H': {
    type: TEAM_BET_TYPE,
    displayName: '1H Spread',
    outcomeType: OUTCOME_TYPE_COVER,
    gameValueFunction: (teamGameRecord) => ((getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points1q') + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points2q'))
                                          - (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points1q') + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points2q'))) * -1,
  },
  'MONEY_LINE_1Q': {
    type: TEAM_BET_TYPE,
    displayName: '1Q Moneyline',
    outcomeType: OUTCOME_TYPE_COVER_YES,
    gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points1q') 
                                          > getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points1q')) | 0,
  },
  'MONEY_LINE_1H': {
    type: TEAM_BET_TYPE,
    displayName: '1H Moneyline',
    outcomeType: OUTCOME_TYPE_COVER_YES,
    gameValueFunction: (teamGameRecord) => ((getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points1q') + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points2q'))
                                          > (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points1q') + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points2q'))) | 0,
  }
}

const BASKETBALL_TEAM_BETS = Object.assign({}, BASKETBALL_GENERIC_TEAM_BETS, BASKETBALL_QUARTER_BASED_TEAM_BETS)

// TODO: something doesn't look right here on the trend details
const COLLEGE_BASKETBALL_TEAM_BETS = Object.assign({}, BASKETBALL_GENERIC_TEAM_BETS, BASKETBALL_HALF_BASED_TEAM_BETS)

const FOOTBALL_TEAM_BETS = {
  'GAME_TOTAL': {
    type: GAME_BET_TYPE,
    displayName: 'Game Total',
    outcomeType: OUTCOME_TYPE_OVER_UNDER,
    gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points') 
                                          + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points'))
  },
  'GAME_TOTAL_1Q': {
    type: GAME_BET_TYPE,
    displayName: '1Q Game Total',
    outcomeType: OUTCOME_TYPE_OVER_UNDER,
    gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points1q') 
                                          + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points1q')),
  },
  'GAME_TOTAL_1H': {
    type: GAME_BET_TYPE,
    displayName: '1H Game Total',
    outcomeType: OUTCOME_TYPE_OVER_UNDER,
    gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points1q') 
                                          + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points2q')
                                          + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points1q')
                                          + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points2q')),
  },
  'TEAM_TOTAL': {
    type: TEAM_BET_TYPE,
    displayName: 'Team Total',
    outcomeType: OUTCOME_TYPE_OVER_UNDER,
    gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points'))
  },
  'TEAM_TOTAL_1Q': {
    type: TEAM_BET_TYPE,
    displayName: '1Q Team Total',
    outcomeType: OUTCOME_TYPE_OVER_UNDER,
    gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points1q'))
  },
  'TEAM_TOTAL_1H': {
    type: TEAM_BET_TYPE,
    displayName: '1H Team Total',
    outcomeType: OUTCOME_TYPE_OVER_UNDER,
    gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points1q')
                                          + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points2q'))
  },
  'SPREAD': {
    type: TEAM_BET_TYPE,
    displayName: 'Spread',
    outcomeType: OUTCOME_TYPE_COVER,
    gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points') 
                                          - getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points')) * -1
  },
  'SPREAD_1Q': {
    type: TEAM_BET_TYPE,
    displayName: '1Q Spread',
    outcomeType: OUTCOME_TYPE_COVER,
    gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points1q') 
                                          - getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points1q')) * -1,
  },
  'SPREAD_1H': {
    type: TEAM_BET_TYPE,
    displayName: '1H Spread',
    outcomeType: OUTCOME_TYPE_COVER,
    gameValueFunction: (teamGameRecord) => ((getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points1q') + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points2q'))
                                          - (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points1q') + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points2q'))) * -1,
  },
  'MONEY_LINE': {
    type: TEAM_BET_TYPE,
    displayName: 'Moneyline',
    outcomeType: OUTCOME_TYPE_COVER_YES,
    gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points') 
                                          > getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points')) | 0,
  },
  'MONEY_LINE_1Q': {
    type: TEAM_BET_TYPE,
    displayName: '1Q Moneyline',
    outcomeType: OUTCOME_TYPE_COVER_YES,
    gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points1q') 
                                          > getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points1q')) | 0,
  },
  'MONEY_LINE_1H': {
    type: TEAM_BET_TYPE,
    displayName: '1H Moneyline',
    outcomeType: OUTCOME_TYPE_COVER_YES,
    gameValueFunction: (teamGameRecord) => ((getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points1q') + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points2q'))
                                          > (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points1q') + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points2q'))) | 0,
  }
}

const TEAM_BETS_BY_LEAGUE = {
  nfl: FOOTBALL_TEAM_BETS,
  ncaaf: FOOTBALL_TEAM_BETS,
  nhl: {
    'GAME_TOTAL': {
      type: GAME_BET_TYPE,
      displayName: 'Game Total',
      outcomeType: OUTCOME_TYPE_OVER_UNDER,
      gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.goals') 
                                            + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.goals'))
    },
    'TEAM_TOTAL': {
      type: TEAM_BET_TYPE,
      displayName: 'Team Total',
      outcomeType: OUTCOME_TYPE_OVER_UNDER,
      gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.goals'))
    },
    'SPREAD': {
      type: TEAM_BET_TYPE,
      displayName: 'Spread',
      outcomeType: OUTCOME_TYPE_COVER,
      gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.goals') 
                                            - getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.goals')) * -1
    },
    'MONEY_LINE': {
      type: TEAM_BET_TYPE,
      displayName: 'Moneyline',
      outcomeType: OUTCOME_TYPE_COVER_YES,
      gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.goals') 
                                            > getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.goals')) | 0,
    }
  },
  nba: BASKETBALL_TEAM_BETS,
  wnba: BASKETBALL_TEAM_BETS,
  // There are no quarters in men's college basketball
  ncaab: COLLEGE_BASKETBALL_TEAM_BETS,
  mlb: {
    'GAME_TOTAL': {
      type: GAME_BET_TYPE,
      displayName: 'Game Total',
      outcomeType: OUTCOME_TYPE_OVER_UNDER,
      gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.runs') 
                                            + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.runs'))
    },
    'TEAM_TOTAL': {
      type: TEAM_BET_TYPE,
      displayName: 'Team Total',
      outcomeType: OUTCOME_TYPE_OVER_UNDER,
      gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.runs'))
    },
    'SPREAD': {
      type: TEAM_BET_TYPE,
      displayName: 'Spread',
      outcomeType: OUTCOME_TYPE_COVER,
      gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.runs') 
                                            - getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.runs')) * -1
    },
    'MONEY_LINE': {
      type: TEAM_BET_TYPE,
      displayName: 'Moneyline',
      outcomeType: OUTCOME_TYPE_COVER_YES,
      gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.runs') 
                                            > getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.runs')) | 0,
    },
    'RUN_FIRST_INNING': {
      type: GAME_BET_TYPE,
      displayName: 'Run First Inning',
      outcomeType: OUTCOME_TYPE_YES_NO,
      gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.runs1i') 
                                            + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.runs1i')) > 0 | 0,
    },
    'GAME_TOTAL_FIRST_5_INNINGS': {
      type: GAME_BET_TYPE,
      displayName: 'First 5 Innings Game Total',
      outcomeType: OUTCOME_TYPE_OVER_UNDER,
      gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.runs1i') 
                                            + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.runs1i')
                                            + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.runs2i')
                                            + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.runs2i')
                                            + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.runs3i')
                                            + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.runs3i')
                                            + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.runs4i')
                                            + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.runs4i')
                                            + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.runs5i')
                                            + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.runs5i')),
    },
    'SPREAD_FIRST_5_INNINGS': {
      type: TEAM_BET_TYPE,
      displayName: 'First 5 Innings Spread',
      outcomeType: OUTCOME_TYPE_COVER,
      gameValueFunction: (teamGameRecord) => ((getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.runs1i') + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.runs2i') + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.runs3i') + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.runs4i') + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.runs5i'))
                                            - (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.runs1i') + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.runs2i') + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.runs3i') + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.runs4i') + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.runs5i'))) * -1,
    },
    'MONEY_LINE_FIRST_5_INNINGS': {
      type: TEAM_BET_TYPE,
      displayName: 'First 5 Innings Moneyline',
      outcomeType: OUTCOME_TYPE_COVER_YES,
      gameValueFunction: (teamGameRecord) => ((getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.runs1i') + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.runs2i') + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.runs3i') + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.runs4i') + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.runs5i'))
                                            > (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.runs1i') + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.runs2i') + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.runs3i') + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.runs4i') + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.runs5i'))) | 0,
    }
  },
  bundesliga: SOCCER_TEAM_BETS,
  epl: SOCCER_TEAM_BETS,
  laliga: SOCCER_TEAM_BETS,
  ligue1: SOCCER_TEAM_BETS,
  seriea: SOCCER_TEAM_BETS,
  "brazil-serie-a": SOCCER_TEAM_BETS,
  mls: SOCCER_TEAM_BETS,
  euro: SOCCER_TEAM_BETS,
  ucl: SOCCER_TEAM_BETS,
  uel: SOCCER_TEAM_BETS,
  "fifa-world-cup": SOCCER_TEAM_BETS,
  eredivisie: SOCCER_TEAM_BETS,
  "primera-lpf": SOCCER_TEAM_BETS,
  "liga-portugal": SOCCER_TEAM_BETS,
  "liga-mx": SOCCER_TEAM_BETS,
  // TODO; add quarter and half points in the data columns for gamelogs and so on
  //  To be able to properly implement all of them we need some way to combine stats or calculate stats 
  //  rather than just providing a single field since not everything is directly saved in one field
  afl: {
    'GAME_TOTAL': {
      type: GAME_BET_TYPE,
      displayName: 'Game Total',
      outcomeType: OUTCOME_TYPE_OVER_UNDER,
      gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points') 
                                            + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points'))
    },
    'GAME_TOTAL_1Q': {
      type: GAME_BET_TYPE,
      displayName: '1Q Game Total',
      outcomeType: OUTCOME_TYPE_OVER_UNDER,
      gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points1q') 
                                            + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points1q')),
    },
    'GAME_TOTAL_1H': {
      type: GAME_BET_TYPE,
      displayName: '1H Game Total',
      outcomeType: OUTCOME_TYPE_OVER_UNDER,
      gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points1q') 
                                            + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points2q')
                                            + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points1q')
                                            + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points2q')),
    },
    // 'TEAM_TOTAL': {
    //   type: TEAM_BET_TYPE,
    //   displayName: 'Team Total',
    //   outcomeType: OUTCOME_TYPE_OVER_UNDER,
    //   gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points'))
    // },
    'SPREAD': {
      type: TEAM_BET_TYPE,
      displayName: 'Spread',
      outcomeType: OUTCOME_TYPE_COVER,
      gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points') 
                                            - getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points')) * -1
    },
    'SPREAD_1Q': {
      type: TEAM_BET_TYPE,
      displayName: '1Q Spread',
      outcomeType: OUTCOME_TYPE_COVER,
      gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points1q') 
                                            - getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points1q')) * -1,
    },
    'SPREAD_1H': {
      type: TEAM_BET_TYPE,
      displayName: '1H Spread',
      outcomeType: OUTCOME_TYPE_COVER,
      gameValueFunction: (teamGameRecord) => ((getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points1q') + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points2q'))
                                            - (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points1q') + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points2q'))) * -1,
    },
    'MONEY_LINE': {
      type: TEAM_BET_TYPE,
      displayName: 'Moneyline',
      outcomeType: OUTCOME_TYPE_COVER_YES,
      gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points') 
                                            > getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points')) | 0,
    },
    'MONEY_LINE_1Q': {
      type: TEAM_BET_TYPE,
      displayName: '1Q Moneyline',
      outcomeType: OUTCOME_TYPE_COVER_YES,
      gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points1q') 
                                            > getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points1q')) | 0,
    },
    'MONEY_LINE_1H': {
      type: TEAM_BET_TYPE,
      displayName: '1H Moneyline',
      outcomeType: OUTCOME_TYPE_COVER_YES,
      gameValueFunction: (teamGameRecord) => ((getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points1q') + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points2q'))
                                            > (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points1q') + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points2q'))) | 0,
    }
  },
  nrl: {
    'GAME_TOTAL': {
      type: GAME_BET_TYPE,
      displayName: 'Game Total',
      outcomeType: OUTCOME_TYPE_OVER_UNDER,
      gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points') 
                                            + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points')),
    },
    'TEAM_TOTAL': {
      type: TEAM_BET_TYPE,
      displayName: 'Team Total',
      outcomeType: OUTCOME_TYPE_OVER_UNDER,
      gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points')),
    },
    'SPREAD': {
      type: TEAM_BET_TYPE,
      displayName: 'Spread',
      outcomeType: OUTCOME_TYPE_COVER,
      gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points') 
                                            - getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points')) * -1,
    },
    'MONEY_LINE': {
      type: TEAM_BET_TYPE,
      displayName: 'Moneyline',
      outcomeType: OUTCOME_TYPE_COVER_YES,
      gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points') 
                                            > getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points')) | 0,
    },
    'GAME_TOTAL_1H': {
      type: GAME_BET_TYPE,
      displayName: '1H Game Total',
      outcomeType: OUTCOME_TYPE_OVER_UNDER,
      gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points1h') 
                                            + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points1h')),
    },
    'TEAM_TOTAL_1H': {
      type: TEAM_BET_TYPE,
      displayName: '1H Team Total',
      outcomeType: OUTCOME_TYPE_OVER_UNDER,
      gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points1h')),
      gamelogStats: (qualifier, type) => ({
        "1H PTS": `${qualifier}.${type}.points1h`,
        "T": `${qualifier}.${type}.tries`,
        'G': `${qualifier}.${type}.goals`,
        'FG': `${qualifier}.${type}.fieldGoals`,
        'POS%': `${qualifier}.${type}.possessionPercentage`,
        'CR%': `${qualifier}.${type}.setCompletionPercentage`,
        'RM': `${qualifier}.${type}.allRunMetres`
      })
    },
    'SPREAD_1H': {
      type: TEAM_BET_TYPE,
      displayName: '1H Spread',
      outcomeType: OUTCOME_TYPE_COVER,
      gameValueFunction: (teamGameRecord) => ((getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points1h'))
                                            - (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points1h'))) * -1,
    },
    'MONEY_LINE_1H': {
      type: TEAM_BET_TYPE,
      displayName: '1H Moneyline',
      outcomeType: OUTCOME_TYPE_COVER_YES,
      gameValueFunction: (teamGameRecord) => ((getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points1h'))
                                            > (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points1h'))) | 0,
    },
    'GAME_TOTAL_2H': {
      type: GAME_BET_TYPE,
      displayName: '2H Game Total',
      outcomeType: OUTCOME_TYPE_OVER_UNDER,
      gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points2h') 
                                            + getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points2h')),
    },
    'TEAM_TOTAL_2H': {
      type: TEAM_BET_TYPE,
      displayName: '2H Team Total',
      outcomeType: OUTCOME_TYPE_OVER_UNDER,
      gameValueFunction: (teamGameRecord) => (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points2h')),
      gamelogStats: (qualifier, type) => ({
        "2H PTS": `${qualifier}.${type}.points2h`,
        "T": `${qualifier}.${type}.tries`,
        'G': `${qualifier}.${type}.goals`,
        'FG': `${qualifier}.${type}.fieldGoals`,
        'POS%': `${qualifier}.${type}.possessionPercentage`,
        'CR%': `${qualifier}.${type}.setCompletionPercentage`,
        'RM': `${qualifier}.${type}.allRunMetres`
      })
    },
    'SPREAD_2H': {
      type: TEAM_BET_TYPE,
      displayName: '2H Spread',
      outcomeType: OUTCOME_TYPE_COVER,
      gameValueFunction: (teamGameRecord) => ((getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points2h'))
                                            - (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points2h'))) * -1,
    },
    'MONEY_LINE_2H': {
      type: TEAM_BET_TYPE,
      displayName: '2H Moneyline',
      outcomeType: OUTCOME_TYPE_COVER_YES,
      gameValueFunction: (teamGameRecord) => ((getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.offensive.points2h'))
                                            > (getDictionaryValueRawResult(teamGameRecord, 'cumulativeStats.defensive.points2h'))) | 0,
    }
  }
}

export function getTeamMarketGamelogStats(league, marketId, qualifier, type) {
  if ('gamelogStats' in TEAM_BETS_BY_LEAGUE[league]?.[marketId]) {
    return TEAM_BETS_BY_LEAGUE[league][marketId].gamelogStats(qualifier, type)
  }
  return SCREENER_TEAM_SCORING_STATS(league, qualifier, type)
}

const SOCCER_TEAM_BET_TYPE_REVERSE_MAPPING_INTERNAL = swapDictionary(SOCCER_TEAM_BETS, 'displayName');

const TEAM_BET_TYPE_REVERSE_MAPPING_BY_LEAGUE = {
  nfl: swapDictionary(TEAM_BETS_BY_LEAGUE.nfl, 'displayName'),
  ncaaf: swapDictionary(TEAM_BETS_BY_LEAGUE.ncaaf, 'displayName'),
  nhl: swapDictionary(TEAM_BETS_BY_LEAGUE.nhl, 'displayName'),
  nba: swapDictionary(TEAM_BETS_BY_LEAGUE.nba, 'displayName'),
  wnba: swapDictionary(TEAM_BETS_BY_LEAGUE.wnba, 'displayName'),
  ncaab: swapDictionary(TEAM_BETS_BY_LEAGUE.ncaab, 'displayName'),
  mlb: swapDictionary(TEAM_BETS_BY_LEAGUE.mlb, 'displayName'),
  bundesliga: SOCCER_TEAM_BET_TYPE_REVERSE_MAPPING_INTERNAL,
  epl: SOCCER_TEAM_BET_TYPE_REVERSE_MAPPING_INTERNAL,
  laliga: SOCCER_TEAM_BET_TYPE_REVERSE_MAPPING_INTERNAL,
  ligue1: SOCCER_TEAM_BET_TYPE_REVERSE_MAPPING_INTERNAL,
  seriea: SOCCER_TEAM_BET_TYPE_REVERSE_MAPPING_INTERNAL,
  "brazil-serie-a": SOCCER_TEAM_BET_TYPE_REVERSE_MAPPING_INTERNAL,
  mls: SOCCER_TEAM_BET_TYPE_REVERSE_MAPPING_INTERNAL,
  euro: SOCCER_TEAM_BET_TYPE_REVERSE_MAPPING_INTERNAL,
  ucl: SOCCER_TEAM_BET_TYPE_REVERSE_MAPPING_INTERNAL,
  uel: SOCCER_TEAM_BET_TYPE_REVERSE_MAPPING_INTERNAL,
  "fifa-world-cup": SOCCER_TEAM_BET_TYPE_REVERSE_MAPPING_INTERNAL,
  afl: swapDictionary(TEAM_BETS_BY_LEAGUE.afl, 'displayName'),
  nrl: swapDictionary(TEAM_BETS_BY_LEAGUE.nrl, 'displayName')
};

const SOCCER_BET_TYPE_ID_TO_NAME = {
  'GOALS': 'Goals',
  'ASSISTS': 'AST',
  'SHOTS_ON_TARGET': 'SOT',
  'SHOTS': 'SHO',
  'GOAL_OR_ASSIST': 'G or AST',
  'TACKLES': 'Tackles',
  'CARDS': 'Cards'
};

const SOCCER_PLAYER_BET_TYPES_REVERSE_MAPPING = Object.fromEntries(
  Object.entries(SOCCER_BET_TYPE_ID_TO_NAME).map(entry => entry.reverse())
);
const SOCCER_POSITIONAL_PLAYER_PROPS = Object.keys(SOCCER_PLAYER_BET_TYPES_REVERSE_MAPPING);
const soccerPositionalShowcaseMarket = () => 'GOALS';
const soccerGetPlayerPositionalBetTypes = () => SOCCER_POSITIONAL_PLAYER_PROPS;
const SOCCER_SCREENER_ONLY_PROPS = [];

const BASKETBALL_BET_TYPE_ID_TO_NAME = {
  'POINTS': 'Points',
  'ASSISTS': 'Assists',
  'REBOUNDS': 'Rebounds',
  'THREE_POINTS_MADE': '3PTM',
  'STEALS': 'Steals',
  'TURNOVERS': 'Turnovers',
  'BLOCKS': 'Blocks',
  'ASSISTS_PLUS_REBOUNDS': 'REB+AST',
  'POINTS_PLUS_ASSISTS': 'PTS+AST',
  'POINTS_PLUS_REBOUNDS': 'PTS+REB',
  'POINTS_PLUS_ASSISTS_PLUS_REBOUNDS': 'PTS+AST+REB',
  'STEALS_PLUS_BLOCKS': 'STL+BLK',
  'DOUBLE_DOUBLE': 'Double Double',
  'TRIPLE_DOUBLE': 'Triple Double',
  'POINTS_1Q': '1Q Points',
  'ASSISTS_1Q': '1Q Assists',
  'REBOUNDS_1Q': '1Q Rebounds'
}

const FOOTBALL_BET_TYPE_ID_TO_NAME = {
  'ANYTIME_TOUCHDOWN': 'Anytime TD',
  'PASSING_YARDS': 'Pass Yards',
  'PASSING_TOUCHDOWNS': 'Pass TD',
  'PASSING_COMPLETIONS': 'Pass Compl',
  'PASSING_ATTEMPTS': 'Pass Att',
  'INTERCEPTIONS': 'Int',
  'RECEIVING_YARDS': 'Rec Yards',
  'RECEPTIONS': 'Receptions',
  'RUSHING_YARDS': 'Rush Yards',
  'RUSHING_ATTEMPTS': 'Rush Att',
  'RUSHING_PLUS_RECEIVING_YARDS': 'Rush + Rec Yards',
  'PASSING_PLUS_RUSHING_YARDS': 'Pass + Rush Yards',
  'EXTRA_POINTS_MADE': 'XP Made',
  'FIELD_GOALS_MADE': 'FG Made',
  'KICKING_POINTS': 'Kicking Points',
  'PASSING_YARDS_1Q': '1Q Pass Yards',
  'RECEIVING_YARDS_1Q': '1Q Rec Yards',
  'RUSHING_YARDS_1Q': '1Q Rush Yards',
  'RUSHING_PLUS_RECEIVING_YARDS_1Q': '1Q Rush + Rec Yards',
  'PASSING_PLUS_RUSHING_YARDS_1Q': '1Q Pass + Rush Yards',
  'ANYTIME_TOUCHDOWN_1Q': '1Q Anytime TD',
}

const PLAYER_BET_TYPE_ID_TO_NAME_BY_LEAGUE = {
  nfl: FOOTBALL_BET_TYPE_ID_TO_NAME,
  ncaaf: FOOTBALL_BET_TYPE_ID_TO_NAME,
  nhl: {
    'POINTS': 'Points',
    'ANYTIME_GOAL_SCORER': 'Goals',
    'ASSISTS': 'Assists',
    'SHOTS_ON_GOAL': 'Shots on Goal',
    'POWERPLAY_POINTS': 'Powerplay Pts',
    'BLOCKED_SHOTS': 'Blocked Shots',
    'GOALS_ALLOWED': 'Goals Against',
    'SAVES': 'Saves',
    'SHUTOUT': 'Shutout'
  },
  nba: BASKETBALL_BET_TYPE_ID_TO_NAME,
  wnba: BASKETBALL_BET_TYPE_ID_TO_NAME,
  ncaab: Object.fromEntries(Object.keys(BASKETBALL_BET_TYPE_ID_TO_NAME).filter(x => !x.endsWith('_1Q')).map(x => [x, BASKETBALL_BET_TYPE_ID_TO_NAME[x]])),
  mlb: {
    'HITTER_HITS': "Hits",
    'HITTER_RUNS': "Runs",
    'HITTER_RUNS_BATTED_IN': "RBI",
    'HITTER_HOME_RUNS': "HR",
    'HITTER_TOTAL_BASES': "Total Bases",
    'HITTER_SINGLES': "Singles",
    'HITTER_DOUBLES': "Doubles",
    'HITTER_TRIPLES': "Triples",
    'HITTER_STOLEN_BASES': "Stolen Bases",
    'HITTER_HITS_PLUS_RUNS_PLUS_RUNS_BATTED_IN': "H+R+RBI",
    'PITCHER_STRIKEOUTS': "Strikeouts",
    'PITCHER_OUTS': "Pitcher Outs",
    'PITCHER_HITS_ALLOWED': "Hits Allowed",
    'PITCHER_EARNED_RUNS': "Earned Runs",
    // 'HITTER_STRIKEOUTS': "SO"
    'PITCHER_WALKS_ALLOWED': "Walks Allowed",
  },
  bundesliga: SOCCER_BET_TYPE_ID_TO_NAME,
  epl: SOCCER_BET_TYPE_ID_TO_NAME,
  laliga: SOCCER_BET_TYPE_ID_TO_NAME,
  ligue1: SOCCER_BET_TYPE_ID_TO_NAME,
  seriea: SOCCER_BET_TYPE_ID_TO_NAME,
  "brazil-serie-a": SOCCER_BET_TYPE_ID_TO_NAME,
  mls: SOCCER_BET_TYPE_ID_TO_NAME,
  euro: SOCCER_BET_TYPE_ID_TO_NAME,
  ucl: SOCCER_BET_TYPE_ID_TO_NAME,
  uel: SOCCER_BET_TYPE_ID_TO_NAME,
  "fifa-world-cup": SOCCER_BET_TYPE_ID_TO_NAME,
  afl: {
    'ANYTIME_GOAL_SCORER': 'Goals',
    'DISPOSALS': 'Disposals',
    'MARKS': 'Marks',
    'TACKLES': 'Tackles'
  },
  nrl: {
    'ANYTIME_TRY_SCORER': 'Anytime Try Scorer',
    'TRIES': 'Tries'
  }
};


const PLAYER_BET_TYPES_REVERSE_MAPPING_BY_LEAGUE = {
  nfl: Object.fromEntries(Object.entries(PLAYER_BET_TYPE_ID_TO_NAME_BY_LEAGUE.nfl).map(a => a.reverse())),
  ncaaf: Object.fromEntries(Object.entries(PLAYER_BET_TYPE_ID_TO_NAME_BY_LEAGUE.ncaaf).map(a => a.reverse())),
  nhl: Object.fromEntries(Object.entries(PLAYER_BET_TYPE_ID_TO_NAME_BY_LEAGUE.nhl).map(a => a.reverse())),
  nba: Object.fromEntries(Object.entries(PLAYER_BET_TYPE_ID_TO_NAME_BY_LEAGUE.nba).map(a => a.reverse())),
  wnba: Object.fromEntries(Object.entries(PLAYER_BET_TYPE_ID_TO_NAME_BY_LEAGUE.wnba).map(a => a.reverse())),
  ncaab: Object.fromEntries(Object.entries(PLAYER_BET_TYPE_ID_TO_NAME_BY_LEAGUE.ncaab).map(a => a.reverse())),
  mlb: Object.fromEntries(Object.entries(PLAYER_BET_TYPE_ID_TO_NAME_BY_LEAGUE.mlb).map(a => a.reverse())),
  bundesliga: Object.fromEntries(Object.entries(PLAYER_BET_TYPE_ID_TO_NAME_BY_LEAGUE.bundesliga).map(a => a.reverse())),
  epl: Object.fromEntries(Object.entries(PLAYER_BET_TYPE_ID_TO_NAME_BY_LEAGUE.epl).map(a => a.reverse())),
  laliga: Object.fromEntries(Object.entries(PLAYER_BET_TYPE_ID_TO_NAME_BY_LEAGUE.laliga).map(a => a.reverse())),
  ligue1: Object.fromEntries(Object.entries(PLAYER_BET_TYPE_ID_TO_NAME_BY_LEAGUE.ligue1).map(a => a.reverse())),
  seriea: Object.fromEntries(Object.entries(PLAYER_BET_TYPE_ID_TO_NAME_BY_LEAGUE.seriea).map(a => a.reverse())),
  "brazil-serie-a": Object.fromEntries(Object.entries(PLAYER_BET_TYPE_ID_TO_NAME_BY_LEAGUE['brazil-serie-a']).map(a => a.reverse())),
  mls: Object.fromEntries(Object.entries(PLAYER_BET_TYPE_ID_TO_NAME_BY_LEAGUE.mls).map(a => a.reverse())),
  euro: Object.fromEntries(Object.entries(PLAYER_BET_TYPE_ID_TO_NAME_BY_LEAGUE.euro).map(a => a.reverse())),
  ucl: Object.fromEntries(Object.entries(PLAYER_BET_TYPE_ID_TO_NAME_BY_LEAGUE.ucl).map(a => a.reverse())),
  uel: Object.fromEntries(Object.entries(PLAYER_BET_TYPE_ID_TO_NAME_BY_LEAGUE.uel).map(a => a.reverse())),
  "fifa-world-cup": Object.fromEntries(Object.entries(PLAYER_BET_TYPE_ID_TO_NAME_BY_LEAGUE["fifa-world-cup"]).map(a => a.reverse())),
  afl: Object.fromEntries(Object.entries(PLAYER_BET_TYPE_ID_TO_NAME_BY_LEAGUE.afl).map(a => a.reverse())),
  nrl: Object.fromEntries(Object.entries(PLAYER_BET_TYPE_ID_TO_NAME_BY_LEAGUE.nrl).map(a => a.reverse()))
};

const FOOTBALL_POSITIONAL_PLAYER_PROPS = {
  // For QB 
  PASSING: Object.keys(Object.keys(FOOTBALL_BET_TYPE_ID_TO_NAME)
                            .filter(prop => 
                              // This also covers PASS + RUSH
                              prop.startsWith("PASSING") || 
                              prop === "INTERCEPTIONS" || 
                              prop.startsWith("ANYTIME_TOUCHDOWN") ||
                              // This is for rushing props minus RUSH + REC
                              (prop.startsWith("RUSHING") && !prop.startsWith("RUSHING_PLUS_RECEIVING_YARDS"))).reduce((obj, key) => {
    obj[FOOTBALL_BET_TYPE_ID_TO_NAME[key]] = key;
    return obj;
  }, {})),
  // For WR, RB
  RUSHING_AND_RECEIVING: Object.keys(Object.keys(FOOTBALL_BET_TYPE_ID_TO_NAME)
                              .filter(prop => 
                                prop.startsWith("REC") ||
                                // This also covers RUSH + REC prop
                                prop.startsWith("RUSHING") || 
                                prop.startsWith("ANYTIME_TOUCHDOWN")).reduce((obj, key) => {
    obj[FOOTBALL_BET_TYPE_ID_TO_NAME[key]] = key;
    return obj;
  }, {})),
  // TE is receive only
  RECEIVING: Object.keys(Object.keys(FOOTBALL_BET_TYPE_ID_TO_NAME)
                            .filter(prop => 
                              prop.startsWith("REC") ||
                              prop.startsWith("ANYTIME_TOUCHDOWN")).reduce((obj, key) => {
                        obj[FOOTBALL_BET_TYPE_ID_TO_NAME[key]] = key;
                        return obj;
                        }, {})),
  KICKING: ['FIELD_GOALS_MADE', 'KICKING_POINTS', 'EXTRA_POINTS_MADE'].map(x => FOOTBALL_BET_TYPE_ID_TO_NAME[x]),
}

const POSITIONAL_PLAYER_PROPS_BY_LEAGUE = {
  nfl: FOOTBALL_POSITIONAL_PLAYER_PROPS,
  ncaaf: FOOTBALL_POSITIONAL_PLAYER_PROPS,
  nhl: Object.keys(PLAYER_BET_TYPES_REVERSE_MAPPING_BY_LEAGUE.nhl),
  nba: Object.keys(PLAYER_BET_TYPES_REVERSE_MAPPING_BY_LEAGUE.nba),
  wnba: Object.keys(PLAYER_BET_TYPES_REVERSE_MAPPING_BY_LEAGUE.wnba),
  ncaab: Object.keys(PLAYER_BET_TYPES_REVERSE_MAPPING_BY_LEAGUE.ncaab),
  mlb: {
    PITCHING: Object.keys(Object.keys(PLAYER_BET_TYPE_ID_TO_NAME_BY_LEAGUE.mlb).filter(prop => prop.startsWith("PITCHER")).reduce((obj, key) => {
      obj[PLAYER_BET_TYPE_ID_TO_NAME_BY_LEAGUE.mlb[key]] = key;
      return obj;
    }, {})),
    HITTING: Object.keys(Object.keys(PLAYER_BET_TYPE_ID_TO_NAME_BY_LEAGUE.mlb).filter(prop => prop.startsWith("HITTER")).reduce((obj, key) => {
      obj[PLAYER_BET_TYPE_ID_TO_NAME_BY_LEAGUE.mlb[key]] = key;
      return obj;
    }, {}))
  },
  bundesliga: Object.keys(PLAYER_BET_TYPES_REVERSE_MAPPING_BY_LEAGUE.bundesliga),
  epl: Object.keys(PLAYER_BET_TYPES_REVERSE_MAPPING_BY_LEAGUE.epl),
  laliga: Object.keys(PLAYER_BET_TYPES_REVERSE_MAPPING_BY_LEAGUE.laliga),
  ligue1: Object.keys(PLAYER_BET_TYPES_REVERSE_MAPPING_BY_LEAGUE.ligue1),
  seriea: Object.keys(PLAYER_BET_TYPES_REVERSE_MAPPING_BY_LEAGUE.seriea),
  "brazil-serie-a": Object.keys(PLAYER_BET_TYPES_REVERSE_MAPPING_BY_LEAGUE["brazil-serie-a"]),
  mls: Object.keys(PLAYER_BET_TYPES_REVERSE_MAPPING_BY_LEAGUE.mls),
  euro: Object.keys(PLAYER_BET_TYPES_REVERSE_MAPPING_BY_LEAGUE.euro),
  ucl: Object.keys(PLAYER_BET_TYPES_REVERSE_MAPPING_BY_LEAGUE.ucl),
  uel: Object.keys(PLAYER_BET_TYPES_REVERSE_MAPPING_BY_LEAGUE.uel),
  "fifa-world-cup": Object.keys(PLAYER_BET_TYPES_REVERSE_MAPPING_BY_LEAGUE["fifa-world-cup"]),
  afl: Object.keys(PLAYER_BET_TYPES_REVERSE_MAPPING_BY_LEAGUE.afl),
  nrl: Object.keys(PLAYER_BET_TYPES_REVERSE_MAPPING_BY_LEAGUE.nrl)
}

const POSITIONAL_SHOWCASE_MARKETS_BY_LEAGUE = {
  nfl: (position) => {
    switch(position) {
      case "WR":
      case "TE":
        return "RECEIVING_YARDS"
      case "QB":
        return 'PASSING_YARDS'
      case "RB":
      case "HB":
      case "FB":
        return "RUSHING_YARDS"
      case "K":
        return "KICKING_POINTS"
      default:
        return null
    }
  },
  ncaaf: (position) => {return POSITIONAL_SHOWCASE_MARKETS_BY_LEAGUE.nfl(position)},
  nhl: (position) => {
    if (position === "G") {
      return "SAVES"
    }
    return "POINTS"
  },
  nba: () => {
    return "POINTS"
  },
  wnba: (position) => {
    return POSITIONAL_SHOWCASE_MARKETS_BY_LEAGUE.nba(position)
  },
  ncaab: (position) => {
    return POSITIONAL_SHOWCASE_MARKETS_BY_LEAGUE.nba(position)
  },
  mlb: (position) => {
    if (position === "SP" || position === "RP" || position === "P") {
      return "PITCHER_OUTS"
    }
    return "HITTER_HITS";
  },
  bundesliga: () => {
    return "GOALS"
  },
  epl: (position) => {
    return POSITIONAL_SHOWCASE_MARKETS_BY_LEAGUE.bundesliga(position)
  },
  laliga: (position) => {
    return POSITIONAL_SHOWCASE_MARKETS_BY_LEAGUE.bundesliga(position)
  },
  ligue1: (position) => {
    return POSITIONAL_SHOWCASE_MARKETS_BY_LEAGUE.bundesliga(position)
  },
  seriea: (position) => {
    return POSITIONAL_SHOWCASE_MARKETS_BY_LEAGUE.bundesliga(position)
  },
  "brazil-serie-a": (position) => {
    return POSITIONAL_SHOWCASE_MARKETS_BY_LEAGUE.bundesliga(position)
  },
  mls: (position) => {
    return POSITIONAL_SHOWCASE_MARKETS_BY_LEAGUE.bundesliga(position)
  },
  euro: (position) => {
    return POSITIONAL_SHOWCASE_MARKETS_BY_LEAGUE.bundesliga(position)
  },
  ucl: (position) => {
    return POSITIONAL_SHOWCASE_MARKETS_BY_LEAGUE.bundesliga(position)
  },
  uel: (position) => {
    return POSITIONAL_SHOWCASE_MARKETS_BY_LEAGUE.bundesliga(position)
  },
  "fifa-world-cup": (position) => {
    return POSITIONAL_SHOWCASE_MARKETS_BY_LEAGUE.bundesliga(position)
  },
  afl: () => {
    return 'ANYTIME_GOAL_SCORER'
  },
  nrl: () => {
    return 'ANYTIME_TRY_SCORER'
  },
}

const footballGetPlayerPositionalBetTypes = (position) => {
  if (position === "QB") {
    return POSITIONAL_PLAYER_PROPS_BY_LEAGUE.nfl.PASSING;
  }
  if (position === "RB" || position === "WR") {
    return POSITIONAL_PLAYER_PROPS_BY_LEAGUE.nfl.RUSHING_AND_RECEIVING;
  }
  if (position === "TE") {
    return POSITIONAL_PLAYER_PROPS_BY_LEAGUE.nfl.RECEIVING;
  }
  if (position === "K" || position === "K/P") {
    return POSITIONAL_PLAYER_PROPS_BY_LEAGUE.nfl.KICKING;
  }
  return [...new Set(Object.values(POSITIONAL_PLAYER_PROPS_BY_LEAGUE.nfl).flat(1))];
}

const PLAYER_POSITIONAL_BET_TYPES_BY_LEAGUE = {
  nfl: footballGetPlayerPositionalBetTypes,
  ncaaf: footballGetPlayerPositionalBetTypes,
  nhl: () => {return POSITIONAL_PLAYER_PROPS_BY_LEAGUE.nhl},
  nba: () => {return POSITIONAL_PLAYER_PROPS_BY_LEAGUE.nba},
  wnba: () => {return POSITIONAL_PLAYER_PROPS_BY_LEAGUE.wnba},
  ncaab: () => {return POSITIONAL_PLAYER_PROPS_BY_LEAGUE.ncaab},
  mlb: (position) => {
    if (position === "SP" || position === "RP" || position === "P") {
      return POSITIONAL_PLAYER_PROPS_BY_LEAGUE.mlb.PITCHING;
    }
    return POSITIONAL_PLAYER_PROPS_BY_LEAGUE.mlb.HITTING;
  },
  bundesliga: () => {return POSITIONAL_PLAYER_PROPS_BY_LEAGUE.bundesliga},
  epl: () => {return POSITIONAL_PLAYER_PROPS_BY_LEAGUE.epl},
  laliga: () => {return POSITIONAL_PLAYER_PROPS_BY_LEAGUE.laliga},
  ligue1: () => {return POSITIONAL_PLAYER_PROPS_BY_LEAGUE.ligue1},
  seriea: () => {return POSITIONAL_PLAYER_PROPS_BY_LEAGUE.seriea},
  "brazil-serie-a": () => {return POSITIONAL_PLAYER_PROPS_BY_LEAGUE['brazil-serie-a']},
  mls: () => {return POSITIONAL_PLAYER_PROPS_BY_LEAGUE.mls},
  euro: () => {return POSITIONAL_PLAYER_PROPS_BY_LEAGUE.euro},
  ucl: () => {return POSITIONAL_PLAYER_PROPS_BY_LEAGUE.ucl},
  uel: () => {return POSITIONAL_PLAYER_PROPS_BY_LEAGUE.uel},
  "fifa-world-cup": () => { return POSITIONAL_PLAYER_PROPS_BY_LEAGUE["fifa-world-cup"] },
  afl: () => {return POSITIONAL_PLAYER_PROPS_BY_LEAGUE.afl},
  nrl: () => {return POSITIONAL_PLAYER_PROPS_BY_LEAGUE.nrl}
}

const SCREENER_ONLY_PROPS_BY_LEAGUE = {
  nfl: [],
  ncaaf: [],
  nhl: [],
  nba: [],
  wnba: [],
  ncaab: [],
  mlb: [],
  bundesliga: [],
  epl: [],
  laliga: [],
  ligue1: [],
  seriea: [],
  "brazil-serie-a": [],
  mls: [],
  euro: [],
  ucl: [],
  uel: [],
  afl: [],
  nrl: [],
  "fifa-world-cup": []
}

const footballGetPlayerPositionalBetTypesForScreener = (position) => {
  return footballGetPlayerPositionalBetTypes(position);
}

const PLAYER_POSITIONAL_BET_TYPES_FOR_SCREENER_BY_LEAGUE = {
  nfl: footballGetPlayerPositionalBetTypesForScreener,
  ncaaf: footballGetPlayerPositionalBetTypesForScreener,
  nhl: (position) => {
    return PLAYER_POSITIONAL_BET_TYPES_BY_LEAGUE.nhl(position);
  },
  nba: (position) => {return PLAYER_POSITIONAL_BET_TYPES_BY_LEAGUE.nba(position)},
  wnba: (position) => {return PLAYER_POSITIONAL_BET_TYPES_BY_LEAGUE.wnba(position)},
  ncaab: (position) => {return PLAYER_POSITIONAL_BET_TYPES_BY_LEAGUE.ncaab(position)},
  mlb: (position) => {return PLAYER_POSITIONAL_BET_TYPES_BY_LEAGUE.mlb(position)},
  bundesliga: (position) => {return PLAYER_POSITIONAL_BET_TYPES_BY_LEAGUE.bundesliga(position)},
  epl: (position) => {return PLAYER_POSITIONAL_BET_TYPES_BY_LEAGUE.epl(position)},
  laliga: (position) => {return PLAYER_POSITIONAL_BET_TYPES_BY_LEAGUE.laliga(position)},
  ligue1: (position) => {return PLAYER_POSITIONAL_BET_TYPES_BY_LEAGUE.ligue1(position)},
  seriea: (position) => {return PLAYER_POSITIONAL_BET_TYPES_BY_LEAGUE.seriea(position)},
  "brazil-serie-a": (position) => {return PLAYER_POSITIONAL_BET_TYPES_BY_LEAGUE['brazil-serie-a'](position)},
  mls: (position) => {return PLAYER_POSITIONAL_BET_TYPES_BY_LEAGUE.mls(position)},
  euro: (position) => {return PLAYER_POSITIONAL_BET_TYPES_BY_LEAGUE.euro(position)},
  ucl: (position) => {return PLAYER_POSITIONAL_BET_TYPES_BY_LEAGUE.ucl(position)},
  uel: (position) => {return PLAYER_POSITIONAL_BET_TYPES_BY_LEAGUE.uel(position)},
  "fifa-world-cup": (position) => { return PLAYER_POSITIONAL_BET_TYPES_BY_LEAGUE["fifa-world-cup"](position) },
  afl: (position) => {return PLAYER_POSITIONAL_BET_TYPES_BY_LEAGUE.afl(position)},
  nrl: (position) => {return PLAYER_POSITIONAL_BET_TYPES_BY_LEAGUE.nrl(position)}
}

// TODO: replace all the usages of this by the configuration default league 
export const DEFAULT_ACTIVE_LEAGUE = "nfl";
export const DEFAULT_ORIGIN_REDIRECT = `/${DEFAULT_ACTIVE_LEAGUE}`;

const SOCCER_LEGEND = {
  team: {
    "OFFENSIVE": "Stats For",
    "DEFENSIVE": "Stats Against",
    "GP": "Games Played",
    "G": "Goals",
    "POS": "Ball Possession",
    "SHO": "Total Shots",
    "SOT": "Shots on Target",
    "COR": "Corner Kicks",
    "OFF": "Offsides",
    "FLS": "Fouls",
    "2YELRED": "Double Yellow Red Card",
    "YEL": "Yellow Cards",
    "RED": "Red cards"
  },
  player: {
    "GP": "Games Played",
    "G": "Goals",
    "A": "Assists",
    "SOT": "Shots on Target",
    "SHO": "Total Shots",
    "MIN": "Minutes Played",
    "CC": "Chances Created",
    "PAS": "Total Passes",
    "DRI": "Dribbles Completed",
    "LOP": "Loss of Possession",
    "TCK": "Total Tackles",
    "FLS": "Fouls Committed",
    "INT": "Interceptions",
    "YEL": "Yellow Cards",
    "2YELRED": "Double Yellow Red Cards",
    "RED": "Red Cards",
    "GA": "Goals Conceded",
    "SAV": "Shots Faced Saved",
    "SA": "Shots Faced Total",
    "PS": "Penalties Saved",
    "DSAV": "Diving Saves",
    "CS": "Clean Sheets"
  }
}

const BASKETBALL_LEGEND = {
  team: {
    "OFFENSIVE": "Stats For",
    "DEFENSIVE": "Stats Against",
    "GP": "Games Played",
    "PTS": "Points",
    "FTM": "Free Throws Made",
    "FTA": "Free Throw Attempts",
    "FT%": "Free Throw Percentage",
    "FGM": "Field Goals Made",
    "FGA": "Field Goal Attempts",
    "FG%": "Field Goal Percentage",
    "3PTM": "3 Points Made",
    "3PTA": "3 Point Attempts",
    "3PT%": "3 Point Percentage",
    "TS%": "True Shooting Percentage",
    "EFG%": "Effective Field Goal Percentage",
    "TRB": "Rebounds",
    "AST": "Assists",
    "STL": "Steals",
    "TO": "Turnovers",
    "BLK": "Blocks"
  },
  player: {
    "GP": "Games Played",
    "PTS": "Points",
    "FTM": "Free Throws Made",
    "FTA": "Free Throw Attempts",
    "FT%": "Free Throw Percentage",
    "FGM": "Field Goals Made",
    "FGA": "Field Goal Attempts",
    "FG%": "Field Goal Percentage",
    "3PTM": "3 Points Made",
    "3PTA": "3 Point Attempts",
    "3PT%": "3 Point Percentage",
    "TS%": "True Shooting Percentage",
    "EFG%": "Effective Field Goal Percentage",
    "REB": "Rebounds",
    "AST": "Assists",
    "STL": "Steals",
    "TO": "Turnovers",
    "BLK": "Blocks",
    "MIN": "Minutes Played",
    "USAGE %": "Usage Percentage"
  }
}

const FOOTBALL_LEGEND = {
  team: {
    "OFFENSIVE": "Stats For",
    "DEFENSIVE": "Stats Against",
    "GP": "Games Played",
    "PTS": "Points",
    "S%": "Score Percentage",
    "PLAYS": "Plays",
    "YDS": "Yards",
    "TD": "Touchdowns",
    "1D": "First Downs",
    "3D%": "Third Down Conversion Percentage",
    "4D%": "Fourth Down Conversion Percentage",
    "RZ%": "Redzone Scoring Percentage",
    "ATT": "Attempts",
    "COMP": "Completions",
    "INT": "Interceptions",
    "TO": "Turnovers",
    "FUML": "Fumbles Lost",
    "SK": "Sacks"
  },
  player: {
    "GP": "Games Played",
    "PASS RTG": "Passer Rating",
    "COMP": "Completions",
    "ATT": "Attempts",
    "YDS": "Yards",
    "TD": "Touchdowns",
    "INT": "Interceptions",
    "FUML": "Fumbles Lost",
    "YDS/ATT": "Yards Per Attempt",
    "300+ YDS": "Games with over 300 Yards",
    "RZ ATT": "Redzone Attempts",
    "RZ COMPL": "Redzone Completions",
    "RZ TD": "Redzone Touchdowns",
    "LONG": "Longest",
    "100+ YDS": "Games with over 100 Yards",
    "TGT": "Targets",
    "REC": "Receptions",
    "YDS/REC": "Yards Per Reception",
    "RZ TGT": "Redzone Targets",
    "RZ REC": "Redzone Receptions",
    "PTS": "Points",
    "FGA": "Field Goal Attempts",
    "FGM": "Field Goals Made",
    "FG%": "Field Goal Percentage",
    "XPA": "Extra Point Attempts",
    "XPM": "Extra Points Made",
    "XP%": "Extra Point Percentage",
    "FG (0-19)": "FGM from 0 to 19 yards",
    "FG (20-29)": "FGM from 20 to 29 yards",
    "FG (30-39)": "FGM from 30 to 39 yards",
    "FG (40-49)": "FGM from 40 to 49 yards",
    "FG (50+)": "FGM over 50 yards"
  }
}

const LEGENDS_BY_LEAGUE = {
  nfl: FOOTBALL_LEGEND,
  ncaaf: FOOTBALL_LEGEND,
  nba: BASKETBALL_LEGEND,
  wnba: BASKETBALL_LEGEND,
  ncaab: BASKETBALL_LEGEND,
  nhl: {
    team: {
      "OFFENSIVE": "Stats For",
      "DEFENSIVE": "Stats Against",
      "GP": "Games Played",
      "G": "Goals",
      "SOG": "Shots On Goal",
      "SAT": "Shot Attempts",
      "CF%": "Corsi For",
      "BLK": "Blocked Shots",
      "PIM": "Penalty Minutes",
      "PPG": "Powerplay Goals",
      "PP%": "Powerplay Percentage",
      "SHG": "Shorthanded goals",
      "SH%": "Shorthanded Percentage"
    },
    player: {
      "GP": "Games Played",
      "PTS": "Points",
      "G": "Goals",
      "A": "Assists",
      "SOG": "Shots On Goal",
      "SAT": "Shot Attempts",
      "TOI": "Time On Ice",
      "+/-": "Plus / Minus",
      "PPP": "Powerplay Points",
      "SHP": "Shorthanded Points",
      "PIM": "Penalty Minutes",
      "BLK": "Blocked Shots",
      "WINS": "Wins",
      "SA": "Shots Against",
      "SAVES": "Saves",
      "SV%": "Save percentage",
      "GA": "Goals Allowed",
      "SHUTOUTS": "Shutouts"
    }
  },
  mlb: {
    team: {
      "OFFENSIVE": "Stats For",
      "DEFENSIVE": "Stats Against",
      "W": "Wins",
      "L": "Losses",
      "PCT": "Win Percentage",
      "GP": "Games Played",
      "R": "Runs",
      "H": "Hits",
      "1B": "Singles",
      "2B": "Doubles",
      "3B": "Triples",
      "TB": "Total Bases",
      "ER": "Earned Runs",
      "HR": "Home Runs",
      "RBI": "Runs Batted In",
      "BB": "Walks",
      "SO": "Strikeouts",
      "E": "Errors",
      "AVG": "Batting Average",
      "OBP": "On-Base Percentage",
      "SLG": "Slugging Percentage",
      "OPS": "On-Base plus Slugging Percentage",
      "CS": "Caught Stealing",
      "SB": "Stolen Bases"
    },
    player: {
      "GP": "Games Played",
      "IP": "Innings Pitched",
      "W": "Wins",
      "L": "Losses",
      "ERA": "Earned Run Average",
      "SV": "Saves",
      "E": "Errors",
      "H": "Hits",
      "R": "Runs",
      "HR": "Home Runs",
      "1B": "Singles",
      "2B": "Doubles",
      "3B": "Triples",
      "TB": "Total Bases",
      "ER": "Earned Runs",
      "BB": "Walks",
      "SO": "Strikeouts",
      "WHIP": "Walks and Hits per Inning Pitched",
      "AVG": "Batting Average",
      "AB": "At Bats",
      "ISO": "Isolated Power",
      "RBI": "Runs Batted In",
      "OBP": "On-Base Percentage",
      "SLG": "Slugging Percentage",
      "OPS": "On-Base plus Slugging Percentage",
      "CS": "Caught Stealing",
      "SB": "Stolen Bases"
    }
  },
  bundesliga: SOCCER_LEGEND,
  epl: SOCCER_LEGEND,
  laliga: SOCCER_LEGEND,
  ligue1: SOCCER_LEGEND,
  seriea: SOCCER_LEGEND,
  "brazil-serie-a": SOCCER_LEGEND,
  mls: SOCCER_LEGEND,
  euro: SOCCER_LEGEND,
  ucl: SOCCER_LEGEND,
  uel: SOCCER_LEGEND,
  "fifa-world-cup": SOCCER_LEGEND,
  afl: {
    team: {
      "PTS": "Points",
      "G": "Goals",
      "B": "Behinds",
      "D": "Disposals",
      "FK": "Free Kicks",
      "H": "Handballs",
      "HO": "Hitouts",
      "K": "Kicks",
      "M": "Marks",
      "MI50": "Marks inside 50",
      "T": "Tackles"
    },
    player: {
      "PTS": "Points",
      "G": 'Goals',
      "B": 'Behinds',
      "D": 'Disposals',
      "H": 'Handballs',
      "HO": 'Hitouts',
      "K": 'Kicks',
      "M": 'Marks',
      "T": 'Tackles'
    }
  },
  nrl: {
    team: {
      "PTS": "Points",
      "T": "Tries",
      "G": "Goals",
      "FG": "Field Goals",
      "1PT": "One Point Field Goals",
      "2PT": "Two Point Field Goals",
      "PEN": "Penalty Goals",
      'POS%': 'Possession Percentage',
      'CS': 'Complete Sets',
      'IS': 'Incomplete Sets',
      'CR%': 'Set Completion Percentage',
      "LB": "Line Breaks",
      "TB": "Tackle Breaks",
      'LBA': 'Line Break Assists',
      "PCRM": "Post Contact Run Metres",
      'AVG': 'Average Set Distance',
      "TA": 'Try Assists',
      'P': 'Passes',
      'OFF': 'Offloads',
      'REC': 'Receipts',
      'DP': 'Dummy Passes',
      'K': 'Kicks',
      'KM': 'Kick Metres',
      'CM': 'Conversions Made',
      'CA': 'Conversion Attempts',
      'C%': 'Conversion Percentage',
      '40/20': 'Forty Twenty Kicks',
      '20/40': 'Twenty Forty Kicks',
      'GK': 'Grubber Kicks',
      'BK': 'Bomb Kicks',
      'CFK': 'Cross Field Kicks',
      'R': 'Runs',
      'RM': 'Run Metres',
      'DHF': 'Dummy Half Runs',
      'RR': 'Restart Runs',
      'KR': 'Kick Returns',
      'KRM': 'Kick Return Metres',
      'S': 'Supports',
      'DR': 'Decoy Runs'
    },
    player: {
      "PTS": "Points",
      "T": "Tries",
      "G": "Goals",
      "FG": "Field Goals",
      "1PT": "One Point Field Goals",
      "2PT": "Two Point Field Goals",
      "PEN": "Penalty Goals",
      "LB": "Line Breaks",
      "TB": "Tackle Breaks",
      "PCRM": "Post Contact Run Metres",
      "HU": "Hit Ups",
      "TA": 'Try Assists',
      'P': 'Passes',
      'OFF': 'Offloads',
      'REC': 'Receipts',
      'DP': 'Dummy Passes',
      'K': 'Kicks',
      'KM': 'Kick Metres',
      'CM': 'Conversions Made',
      'CA': 'Conversion Attempts',
      'C%': 'Conversion Percentage',
      '40/20': 'Forty Twenty Kicks',
      '20/40': 'Twenty Forty Kicks',
      'AK': 'Attacking Kicks',
      'GK': 'Grubber Kicks',
      'BK': 'Bomb Kicks',
      'CFK': 'Cross Field Kicks',
      'R': 'Runs',
      'RM': 'Run Metres',
      'DHF': 'Dummy Half Runs',
      'KR': 'Kick Returns',
      'KRM': 'Kick Return Metres',
      'S': 'Supports',
      'DR': 'Decoy Runs'
    }
  }
}

const SOCCER_POSITION_LEGEND = {
  "F": "Forward",
  "D": "Defender",
  "M": "Midfielder",
  "G": "Goalkeeper"
}

const BASKETBALL_POSITION_LEGEND = {
  PG: "Point Guard",
  SG: "Shooting Guard",
  C: "Center",
  PF: "Power Forward",
  SF: "Small Forward"
}

const FOOTBALL_POSITION_LEGEND = {
  QB: "Quarterback",
  RB: "Running Back",
  WR: "Wide Receiver",
  TE: "Tight End",
  K: "Kicker"
}

const POSITION_LEGEND_BY_LEAGUE = {
  nfl: FOOTBALL_POSITION_LEGEND,
  ncaaf: FOOTBALL_POSITION_LEGEND,
  nba: BASKETBALL_POSITION_LEGEND,
  wnba: BASKETBALL_POSITION_LEGEND,
  ncaab: BASKETBALL_POSITION_LEGEND,
  nhl: {
    C: "Center",
    RW: "Right Wing",
    LW: "Left Wing",
    D: "Defenseman",
    G: "Goalie"
  },
  mlb: {
    "P": "Pitcher",
    "C": "Catcher",
    "1B": "First Baseman",
    "2B": "Second Baseman",
    "3B": "Third Baseman",
    "SS": "Shortstop",
    "OF": "Outfielder",
    "DH": "Designated Hitter"
  },
  bundesliga: SOCCER_POSITION_LEGEND,
  epl: SOCCER_POSITION_LEGEND,
  laliga: SOCCER_POSITION_LEGEND,
  ligue1: SOCCER_POSITION_LEGEND,
  seriea: SOCCER_POSITION_LEGEND,
  "brazil-serie-a": SOCCER_POSITION_LEGEND,
  mls: SOCCER_POSITION_LEGEND,
  euro: SOCCER_POSITION_LEGEND,
  ucl: SOCCER_POSITION_LEGEND,
  uel: SOCCER_POSITION_LEGEND,
  "fifa-world-cup": SOCCER_POSITION_LEGEND,
  afl: {},
  nrl: {}
}

const soccerBuildRecordString = (record) => `${record.win}-${record.loss}-${record.draw}`;

// Input should be a dict in the format of {win, loss} and any other key needed per sport (tie, overtime loss etc)
const BUILD_RECORD_STRING_BY_LEAGUE = {
  nfl: (record) => {return `${record.win}-${record.loss}-${record.tie}`},
  ncaaf: (record) => {return `${record.win}-${record.loss}`},
  nhl: (record) => {return `${record.win}-${record.loss}-${record.otl}`},
  nba: (record) => {return `${record.win}-${record.loss}`},
  wnba: (record) => {return `${record.win}-${record.loss}`},
  ncaab: (record) => {return `${record.win}-${record.loss}`},
  mlb: (record) => {return `${record.win}-${record.loss}`},
  bundesliga: soccerBuildRecordString,
  epl: (record) => {return `${record.win}-${record.loss}-${record.draw}`},
  laliga: (record) => {return `${record.win}-${record.loss}-${record.draw}`},
  ligue1: (record) => {return `${record.win}-${record.loss}-${record.draw}`},
  seriea: (record) => {return `${record.win}-${record.loss}-${record.draw}`},
  "brazil-serie-a": (record) => {return `${record.win}-${record.loss}-${record.draw}`},
  mls: (record) => {return `${record.win}-${record.loss}-${record.draw}`},
  euro: (record) => {return `${record.win}-${record.loss}-${record.draw}`},
  ucl: (record) => {return `${record.win}-${record.loss}-${record.draw}`},
  uel: (record) => {return `${record.win}-${record.loss}-${record.draw}`},
  "fifa-world-cup": (record) => { return `${record.win}-${record.loss}-${record.draw}` },
  afl: (record) => {return `${record.win}-${record.loss}-${record.draw}`},
  nrl: (record) => {return `${record.win}-${record.loss}-${record.draw}`}
}

export const LOCAL_STORAGE_LOCATION_KEY = "location";
export const LOCALIZATION_API = "localization";

export const EVICTION_SAFE_KEYS = new Set([LOCAL_STORAGE_LOCATION_KEY]);

const API_VERSIONS_TEMP = {};
API_VERSIONS_TEMP[LOCALIZATION_API] = "v1";
export const API_VERSIONS = API_VERSIONS_TEMP;

export const DEFAULT_ODDS = {
  spread: 0,
  total: 0,
  // New line style
  lines: {
    american: {
      moneyLine: 0,
      spread: 0,
      totalOver: 0,
      totalUnder: 0
    },
    decimal: {
      moneyLine: 0.0,
      spread: 0.0,
      totalOver: 0.0,
      totalUnder: 0.0
    },
    fractional: {
      moneyLine: "0",
      spread: "0",
      totalOver: "0",
      totalUnder: "0"
    }
  },
  // Deprecated old style
  moneyLineDecimal: 0,
  spreadDecimal: 0,
  totalOverDecimal: 0,
  totalUnderDecimal: 0
}

export const AVAILABLE_LINE_FORMATS = ["american", "decimal", "fractional"];
export const DEFAULT_LINE_FORMAT = "american";

// Legend setion types
//  prefix => the items under that section are displayed in the format of <key>: <value>
//  heading => the items under that section are displayed in the format of <key>\n <value>
export const BETTING_TOOL_LEGEND = [
  {
    type: "heading",
    title: "tags",
    entries: [
      {key: 'Back To Back', value: 'Playing 2nd game in 2 days.'},
      {key: 'Road Trip', value: 'Playing 3rd+ consecutive away game.'},
      {key: 'Bounce Back', value: '2+ game losing streak despite above average recent play.'},
      {key: 'Regression', value: '2+ game winning streak despite below average recent play.'},
      {key: 'Back Home', value: 'Back home after 3+ away games.'},
      {key: 'Matchup Owner', value: 'Won over 75% of games against opponent (within last 2 seasons).'},
      {key: 'Good Form', value: 'Won 4 out of their last 5 games'},
      {key: 'Bad Form', value: 'Lost 4 out of their last 5 games'}
    ]
  },
  {
    type: "prefix",
    title: "grades",
    entries: [
      {key: 'A', value: 'Highly Favorable'},
      {key: 'B', value: 'Favorable'},
      {key: 'C', value: 'Unfavourable'},
      {key: 'D', value: 'Highly Unfavorable'}
    ]
  },
  {
    type: "heading",
    title: "terms",
    entries: [
      {key: 'Hit Rate', value: 'The % of times the team/player covers the line.'},
      {key: 'ATS Record', value: 'Team record in covering their pre-game spread.'},
      {key: 'O/U Record', value: 'Team record in covering the pre-game game total.'},
      {key: 'Spread', value: 'Predicted win/loss margin determined by bookmarkers.'},
      {key: 'Game Total', value: 'Predicted overall point total determined by bookmakers.'},
      {key: 'Favorite', value: 'Expected to win the game based on their odds.'},
      {key: 'Underdog', value: 'Expected to lose the game based on their odds.'},
      {key: 'Line', value: 'Value determined by bookmakers as outcome for bet type.'}
    ]
  }
];

export const ACCESS_LEVEL_SUPERUSER = 0;
export const ACCESS_LEVEL_FREE = 1;
export const ACCESS_LEVEL_TRIAL = 2;
export const ACCESS_LEVEL_PAID = 3;


const SOCCER_TEAM_MODAL_STATS = {
  "PTS": "standings.points",
  "SHO": "averageStats.offensive.shotsTotal",
  "SOT": "averageStats.offensive.shotsOnTarget",
  "POS": "averageStats.offensive.ballPossession",
  "FLS": "averageStats.offensive.fouls",
  "COR": "averageStats.offensive.cornerKicks",
}

const BASKETBALL_TEAM_MODAL_STATS = {
  "PTS": "averageStats.offensive.points",
  "FTM": "averageStats.offensive.freeThrowsMade",
  "FGM": "averageStats.offensive.fieldGoalsMade",
  "3PTM": "averageStats.offensive.threePointsMade",
  "TRB": "averageStats.defensive.rebounds",
  "AST": "averageStats.offensive.assists"
}

const FOOTBALL_TEAM_MODAL_STATS = {
  "PTS": "averageStats.offensive.points",
  "PASS YDS": "averageStats.offensive.passingYards",
  "PASS TDS": "averageStats.offensive.passingTouchdowns",
  "RUSH YDS": "averageStats.offensive.rushingYards",
  "NET YDS": "averageStats.offensive.totalYards",
  "NET TDS": "averageStats.offensive.totalTouchdowns",
  "RZ%": "averageStats.offensive.redzoneSuccessRate"
}

// Right now we have no need to separate it per league, fields are distinct enough between them
export const FIELD_DECIMAL_PRECISION = {
  //nfl
  //nhl
  //nba
  //mlb
  "battingAverage": 3,
  "battingAverageAgainst": 3,
  "onBasePercentage": 3,
  "sluggingPercentage": 3,
  "onBasePlusSluggingPercentage": 3,
  "winPercentage": 3
}

const BASKETBALL_STANDINGS_FIELDS = {
  "GP": "gamesPlayed",
  "W": "standings.wins",
  "L": "standings.losses"
}

const FOOTBALL_STANDINGS_FIELD = {
  "GP": "gamesPlayed",
  "W": "standings.wins",
  "L": "standings.losses",
  "T": "standings.ties"
}

const TEAM_MODAL_STATS_BY_LEAGUE = {
  nfl: FOOTBALL_TEAM_MODAL_STATS,
  ncaaf: FOOTBALL_TEAM_MODAL_STATS,
  nhl: {
    "G": "averageStats.offensive.goals",
    "SOG": "averageStats.offensive.shotsOnGoal",
    "SAT": "averageStats.offensive.shotAttempts",
    "CF%": "averageStats.offensive.corsiPercentage",
    "PIM": "averageStats.offensive.penaltyMinutes",
    "PP%": "averageStats.offensive.powerplayPercentage",
    "SH%": "averageStats.offensive.penaltyKillPercentage"
  },
  nba: BASKETBALL_TEAM_MODAL_STATS,
  wnba: BASKETBALL_TEAM_MODAL_STATS,
  ncaab: BASKETBALL_TEAM_MODAL_STATS,
  mlb: {
    "R": "averageStats.offensive.runs",
    "H": "averageStats.offensive.hits",
    "HR": "averageStats.offensive.homeRuns",
    "RBI": "averageStats.offensive.runsBattedIn",
    "AVG": "averageStats.offensive.battingAverage",
    "OPS": "averageStats.offensive.onBasePlusSluggingPercentage"
  },
  bundesliga: SOCCER_TEAM_MODAL_STATS,
  epl: SOCCER_TEAM_MODAL_STATS,
  laliga: SOCCER_TEAM_MODAL_STATS,
  ligue1: SOCCER_TEAM_MODAL_STATS,
  seriea: SOCCER_TEAM_MODAL_STATS,
  "brazil-serie-a": SOCCER_TEAM_MODAL_STATS,
  mls: SOCCER_TEAM_MODAL_STATS,
  euro: SOCCER_TEAM_MODAL_STATS,
  ucl: SOCCER_TEAM_MODAL_STATS,
  uel: SOCCER_TEAM_MODAL_STATS,
  "fifa-world-cup": SOCCER_TEAM_MODAL_STATS,
  afl: {},
  nrl: {}
};

const SOCCER_STANDINGS_FIELDS = {
  "GP": "gamesPlayed",
  "W": "standings.wins",
  "L": "standings.losses",
  "D": "standings.draws",
  "PTS": "standings.points"
};

const STANDINGS_FIELDS_BY_LEAGUE = {
  nfl: FOOTBALL_STANDINGS_FIELD,
  ncaaf: FOOTBALL_STANDINGS_FIELD,
  nhl: {
    "GP": "gamesPlayed",
    "W": "standings.wins",
    "L": "standings.losses",
    "OTL": "standings.overtimeLosses",
    "PTS": "standings.points"
  },
  nba: BASKETBALL_STANDINGS_FIELDS,
  wnba: BASKETBALL_STANDINGS_FIELDS,
  ncaab: BASKETBALL_STANDINGS_FIELDS,
  mlb: {
    "GP": "gamesPlayed",
    "W": "standings.wins",
    "L": "standings.losses",
    "PCT": "standings.winPercentage"
  },
  bundesliga: SOCCER_STANDINGS_FIELDS,
  epl: {
    "GP": "gamesPlayed",
    "W": "standings.wins",
    "L": "standings.losses",
    "D": "standings.draws",
    "PTS": "standings.points"
  },
  laliga: {
    "GP": "gamesPlayed",
    "W": "standings.wins",
    "L": "standings.losses",
    "D": "standings.draws",
    "PTS": "standings.points"
  },
  ligue1: {
    "GP": "gamesPlayed",
    "W": "standings.wins",
    "L": "standings.losses",
    "D": "standings.draws",
    "PTS": "standings.points"
  },
  seriea: {
    "GP": "gamesPlayed",
    "W": "standings.wins",
    "L": "standings.losses",
    "D": "standings.draws",
    "PTS": "standings.points"
  },
  "brazil-serie-a": {
    "GP": "gamesPlayed",
    "W": "standings.wins",
    "L": "standings.losses",
    "D": "standings.draws",
    "PTS": "standings.points"
  },
  mls: {
    "GP": "gamesPlayed",
    "W": "standings.wins",
    "L": "standings.losses",
    "D": "standings.draws",
    "PTS": "standings.points"
  },
  euro: {
    "GP": "gamesPlayed",
    "W": "standings.wins",
    "L": "standings.losses",
    "D": "standings.draws",
    "PTS": "standings.points"
  },
  ucl: {
    "GP": "gamesPlayed",
    "W": "standings.wins",
    "L": "standings.losses",
    "D": "standings.draws",
    "PTS": "standings.points"
  },
  uel: {
    "GP": "gamesPlayed",
    "W": "standings.wins",
    "L": "standings.losses",
    "D": "standings.draws",
    "PTS": "standings.points"
  },
  "fifa-world-cup": {
    "GP": "gamesPlayed",
    "W": "standings.wins",
    "L": "standings.losses",
    "D": "standings.draws",
    "PTS": "standings.points"
  },
  afl: {
    "GP": "gamesPlayed",
    "W": "standings.wins",
    "L": "standings.losses",
    "D": "standings.draws",
    "PTS": "standings.points"
  },
  nrl: {
    "GP": "gamesPlayed",
    "W": "standings.wins",
    "L": "standings.losses",
    "D": "standings.draws",
    "PTS": "standings.points"
  }
};

const FOOTBALL_GAME_SUMMARY_TEMPLATE = {
  statsTemplate: [
    { label: "PTS", value: "offensive.points" },
    { label: "SCORE %", value: "offensive.scorePercentage" },
    { label: "PLAYS", value: "offensive.plays" },
    { label: "NET YDS", value: "offensive.totalYards" },
    { label: "PASS YDS", value: "offensive.passingYards" },
    { label: "PASS ATT", value: "offensive.passingAttempts" },
    { label: "PASS COMPL", value: "offensive.passingCompletions" },
    { label: "PASS TD", value: "offensive.passingTouchdowns" },
    { label: "RUSH YDS", value: "offensive.rushingYards" },
    { label: "RUSH ATT", value: "offensive.rushingAttempts" },
    { label: "RUSH TD", value: "offensive.rushingTouchdowns" },
    { label: "TOTAL TDS", value: "offensive.totalTouchdowns" },
    { label: "RZ%", value: "offensive.redzoneSuccessRate" },
    { label: "1D", value: "offensive.firstDowns" },
    { label: "3D%", value: "offensive.thirdDownConversionPercentage" },
    { label: "4D%", value: "offensive.fourthDownConversionPercentage" },
    { label: "INT THROWN", value: "offensive.interceptions" },
    { label: "TO", value: "offensive.turnovers" },
    { label: "SACKS", value: "defensive.sacks" },
    { label: "FUML", value: "offensive.fumblesLost" }
  ],
  categorizedStatsTemplate: [
    { label: "PTS", value: { for: { field: "offensive.points", sortingOrder: "desc" }, against: { field: "defensive.points", sortingOrder: "asc" } } },
    { label: "SCORE%", value: { for: { field: "offensive.scorePercentage", sortingOrder: "desc" }, against: { field: "defensive.scorePercentage", sortingOrder: "asc" } } },
    { label: "PLAYS", value: { for: { field: "offensive.plays", sortingOrder: "desc" }, against: { field: "defensive.plays", sortingOrder: "asc" } } },
    { label: "NET YDS", value: { for: { field: "offensive.totalYards", sortingOrder: "desc" }, against: { field: "defensive.totalYards", sortingOrder: "asc" } } },
    { label: "PASS YDS", value: { for: { field: "offensive.passingYards", sortingOrder: "desc" }, against: { field: "defensive.passingYards", sortingOrder: "asc" } } },
    { label: "PASS ATT", value: { for: { field: "offensive.passingAttempts", sortingOrder: "desc" }, against: { field: "defensive.passingAttempts", sortingOrder: "asc" } } },
    { label: "PASS COMPL", value: { for: { field: "offensive.passingCompletions", sortingOrder: "desc" }, against: { field: "defensive.passingCompletions", sortingOrder: "asc" } } },
    { label: "PASS TD", value: { for: { field: "offensive.passingTouchdowns", sortingOrder: "desc" }, against: { field: "defensive.passingTouchdowns", sortingOrder: "asc" } } },
    { label: "RUSH YDS", value: { for: { field: "offensive.rushingYards", sortingOrder: "desc" }, against: { field: "defensive.rushingYards", sortingOrder: "asc" } } },
    { label: "RUSH ATT", value: { for: { field: "offensive.rushingAttempts", sortingOrder: "desc" }, against: { field: "defensive.rushingAttempts", sortingOrder: "asc" } } },
    { label: "RUSH TD", value: { for: { field: "offensive.rushingTouchdowns", sortingOrder: "desc" }, against: { field: "defensive.rushingTouchdowns", sortingOrder: "asc" } } },
    { label: "TOTAL TDS", value: { for: { field: "offensive.totalTouchdowns", sortingOrder: "desc" }, against: { field: "defensive.totalTouchdowns", sortingOrder: "asc" } } },
    { label: "RZ%", value: { for: { field: "offensive.redzoneSuccessRate", sortingOrder: "desc" }, against: { field: "defensive.redzoneSuccessRate", sortingOrder: "asc" } } },
    { label: "1D", value: { for: { field: "offensive.firstDowns", sortingOrder: "desc" }, against: { field: "defensive.firstDowns", sortingOrder: "asc" } } },
    { label: "3D%", value: { for: { field: "offensive.thirdDownConversionPercentage", sortingOrder: "desc" }, against: { field: "defensive.thirdDownConversionPercentage", sortingOrder: "asc" } } },
    { label: "4D%", value: { for: { field: "offensive.fourthDownConversionPercentage", sortingOrder: "desc" }, against: { field: "defensive.fourthDownConversionPercentage", sortingOrder: "asc" } } },
    { label: "INT", value: { for: { field: "offensive.interceptions", sortingOrder: "asc" }, against: { field: "defensive.interceptions", sortingOrder: "desc" } } },
    { label: "TO", value: { for: { field: "offensive.turnovers", sortingOrder: "asc" }, against: { field: "defensive.turnovers", sortingOrder: "desc" } } },
    { label: "SACKS", value: { for: { field: "defensive.sacks", sortingOrder: "desc" }, against: { field: "offensive.sacks", sortingOrder: "asc" } } },
    { label: "FUML", value: { for: { field: "offensive.fumblesLost", sortingOrder: "asc" }, against: { field: "defensive.fumblesLost", sortingOrder: "desc" } } }
  ]
};

const NHL_GAME_SUMMARY_TEMPLATE = {
  statsTemplate: [
    { label: "G", value: "offensive.goals" },
    { label: "SOG", value: "offensive.shotsOnGoal" },
    { label: "SAT", value: "offensive.shotAttempts" },
    { label: "CF%", value: "offensive.corsiPercentage" },
    { label: "PP%", value: "offensive.powerplayPercentage" },
    { label: "PIM", value: "offensive.penaltyMinutes" }
  ],
  categorizedStatsTemplate: [
    { label: "G", value: { for: { field: "offensive.goals", sortingOrder: "desc" }, against: { field: "defensive.goals", sortingOrder: "asc" } } },
    { label: "SOG", value: { for: { field: "offensive.shotsOnGoal", sortingOrder: "desc" }, against: { field: "defensive.shotsOnGoal", sortingOrder: "asc" } } },
    { label: "SAT", value: { for: { field: "offensive.shotAttempts", sortingOrder: "desc" }, against: { field: "defensive.shotAttempts", sortingOrder: "asc" } } },
    { label: "CF%", value: { for: { field: "offensive.corsiPercentage", sortingOrder: "desc" }, against: { field: "defensive.corsiPercentage", sortingOrder: "asc" } } },
    { label: "PPG", value: { for: { field: "offensive.powerplayGoals", sortingOrder: "desc" }, against: { field: "defensive.powerplayGoals", sortingOrder: "asc" } } },
    { label: "PP%", value: { for: { field: "offensive.powerplayPercentage", sortingOrder: "desc" }, against: { field: "defensive.powerplayPercentage", sortingOrder: "asc" } } },
    { label: "SHG", value: { for: { field: "offensive.shorthandedGoals", sortingOrder: "desc" }, against: { field: "defensive.shorthandedGoals", sortingOrder: "asc" } } },
    { label: "SH%", value: { for: { field: "offensive.penaltyKillPercentage", sortingOrder: "desc" }, against: { field: "defensive.penaltyKillPercentage", sortingOrder: "asc" } } },
    { label: "BLK", value: { for: { field: "offensive.defensiveBlocks", sortingOrder: "desc" }, against: { field: "offensive.offensiveBlocks", sortingOrder: "asc" } } },
    { label: "PIM", value: { for: { field: "offensive.penaltyMinutes", sortingOrder: "asc" }, against: { field: "defensive.penaltyMinutes", sortingOrder: "desc" } } }
  ]
};

const BASKETBALL_GAME_SUMMARY_TEMPLATE = {
  statsTemplate: [
    { label: "PTS", value: "offensive.points" },
    { label: "FT%", value: "offensive.freeThrowPercentage" },
    { label: "FG%", value: "offensive.fieldGoalPercentage" },
    { label: "3PT%", value: "offensive.threePointPercentage" },
    { label: "TS%", value: "offensive.trueShootingPercentage" },
    { label: "eFG%", value: "offensive.effectiveFieldGoalPercentage" },
    { label: "TRB", value: "offensive.rebounds" },
    { label: "AST", value: "offensive.assists" },
    { label: "STL", value: "defensive.steals" },
    { label: "TO", value: "defensive.turnovers" },
    { label: "BLK", value: "defensive.blocks" }
  ],
  categorizedStatsTemplate: [
    { label: "PTS", value: { for: { field: "offensive.points", sortingOrder: "desc" }, against: { field: "defensive.points", sortingOrder: "asc" } } },
    { label: "FTM", value: { for: { field: "offensive.freeThrowsMade", sortingOrder: "desc" }, against: { field: "defensive.freeThrowsMade", sortingOrder: "asc" } } },
    { label: "FTA", value: { for: { field: "offensive.freeThrowAttempts", sortingOrder: "desc" }, against: { field: "defensive.freeThrowAttempts", sortingOrder: "asc" } } },
    { label: "FT%", value: { for: { field: "offensive.freeThrowPercentage", sortingOrder: "desc" }, against: { field: "defensive.freeThrowPercentage", sortingOrder: "asc" } } },
    { label: "FGM", value: { for: { field: "offensive.fieldGoalsMade", sortingOrder: "desc" }, against: { field: "defensive.fieldGoalsMade", sortingOrder: "asc" } } },
    { label: "FGA", value: { for: { field: "offensive.fieldGoalAttempts", sortingOrder: "desc" }, against: { field: "defensive.fieldGoalAttempts", sortingOrder: "asc" } } },
    { label: "FG%", value: { for: { field: "offensive.fieldGoalPercentage", sortingOrder: "desc" }, against: { field: "defensive.fieldGoalPercentage", sortingOrder: "asc" } } },
    { label: "3PTM", value: { for: { field: "offensive.threePointsMade", sortingOrder: "desc" }, against: { field: "defensive.threePointsMade", sortingOrder: "asc" } } },
    { label: "3PTA", value: { for: { field: "offensive.threePointAttempts", sortingOrder: "desc" }, against: { field: "defensive.threePointAttempts", sortingOrder: "asc" } } },
    { label: "3PT%", value: { for: { field: "offensive.threePointPercentage", sortingOrder: "desc" }, against: { field: "defensive.threePointPercentage", sortingOrder: "asc" } } },
    { label: "TS%", value: { for: { field: "offensive.trueShootingPercentage", sortingOrder: "desc" }, against: { field: "defensive.trueShootingPercentage", sortingOrder: "asc" } } },
    { label: "eFG%", value: { for: { field: "offensive.effectiveFieldGoalPercentage", sortingOrder: "desc" }, against: { field: "defensive.effectiveFieldGoalPercentage", sortingOrder: "asc" } } },
    { label: "TRB", value: { for: { field: "offensive.rebounds", sortingOrder: "desc" }, against: { field: "defensive.rebounds", sortingOrder: "asc" } } },
    { label: "AST", value: { for: { field: "offensive.assists", sortingOrder: "desc" }, against: { field: "defensive.assists", sortingOrder: "asc" } } },
    { label: "STL", value: { for: { field: "defensive.steals", sortingOrder: "desc" }, against: { field: "offensive.steals", sortingOrder: "asc" } } },
    { label: "TO", value: { for: { field: "defensive.turnovers", sortingOrder: "desc" }, against: { field: "offensive.turnovers", sortingOrder: "asc" } } },
    { label: "BLK", value: { for: { field: "defensive.blocks", sortingOrder: "desc" }, against: { field: "offensive.blocks", sortingOrder: "asc" } } }
  ]
};

const MLB_GAME_SUMMARY_TEMPLATE = {
  statsTemplate: [
    { label: "R", value: "offensive.runs" },
    { label: "H", value: "offensive.hits" },
    { label: "1B", value: "offensive.singles" },
    { label: "2B", value: "offensive.doubles" },
    { label: "3B", value: "offensive.triples" },
    { label: "TB", value: "offensive.totalBases" },
    { label: "ER", value: "offensive.earnedRuns" },
    { label: "HR", value: "offensive.homeRuns" },
    { label: "RBI", value: "offensive.runsBattedIn" },
    { label: "BB", value: "offensive.walks" },
    { label: "SO", value: "offensive.strikeouts" },
    { label: "E", value: "offensive.errors" },
    { label: "AVG", value: "offensive.battingAverage" },
    { label: "OBP", value: "offensive.onBasePercentage" },
    { label: "SLG", value: "offensive.sluggingPercentage" },
    { label: "OPS", value: "offensive.onBasePlusSluggingPercentage" }
  ],
  categorizedStatsTemplate: [
    { label: "R", value: { for: { field: "offensive.runs", sortingOrder: "desc" }, against: { field: "defensive.runs", sortingOrder: "asc" } } },
    { label: "H", value: { for: { field: "offensive.hits", sortingOrder: "desc" }, against: { field: "defensive.hits", sortingOrder: "asc" } } },
    { label: "1B", value: { for: { field: "offensive.singles", sortingOrder: "desc" }, against: { field: "defensive.singles", sortingOrder: "asc" } } },
    { label: "2B", value: { for: { field: "offensive.doubles", sortingOrder: "desc" }, against: { field: "defensive.doubles", sortingOrder: "asc" } } },
    { label: "3B", value: { for: { field: "offensive.triples", sortingOrder: "desc" }, against: { field: "defensive.triples", sortingOrder: "asc" } } },
    { label: "TB", value: { for: { field: "offensive.totalBases", sortingOrder: "desc" }, against: { field: "defensive.totalBases", sortingOrder: "asc" } } },
    { label: "ER", value: { for: { field: "offensive.earnedRuns", sortingOrder: "desc" }, against: { field: "defensive.earnedRuns", sortingOrder: "asc" } } },
    { label: "HR", value: { for: { field: "offensive.homeRuns", sortingOrder: "desc" }, against: { field: "defensive.homeRuns", sortingOrder: "asc" } } },
    { label: "RBI", value: { for: { field: "offensive.runsBattedIn", sortingOrder: "desc" }, against: { field: "defensive.runsBattedIn", sortingOrder: "asc" } } },
    { label: "BB", value: { for: { field: "offensive.walks", sortingOrder: "desc" }, against: { field: "defensive.walks", sortingOrder: "asc" } } },
    { label: "SO", value: { for: { field: "offensive.strikeouts", sortingOrder: "asc" }, against: { field: "defensive.strikeouts", sortingOrder: "desc" } } },
    { label: "E", value: { for: { field: "offensive.errors", sortingOrder: "desc" }, against: { field: "defensive.errors", sortingOrder: "asc" } } },
    { label: "AVG", value: { for: { field: "offensive.battingAverage", sortingOrder: "desc" }, against: { field: "defensive.battingAverage", sortingOrder: "asc" } } },
    { label: "OBP", value: { for: { field: "offensive.onBasePercentage", sortingOrder: "desc" }, against: { field: "defensive.onBasePercentage", sortingOrder: "asc" } } },
    { label: "SLG", value: { for: { field: "offensive.sluggingPercentage", sortingOrder: "desc" }, against: { field: "defensive.sluggingPercentage", sortingOrder: "asc" } } },
    { label: "OPS", value: { for: { field: "offensive.onBasePlusSluggingPercentage", sortingOrder: "desc" }, against: { field: "defensive.onBasePlusSluggingPercentage", sortingOrder: "asc" } } }
  ]
};

const SOCCER_GAME_SUMMARY_TEMPLATE = {
  statsTemplate: [
    { label: "G", value: "offensive.goals" },
    { label: "POS", value: "offensive.ballPossession" },
    { label: "SHO", value: "offensive.shotsTotal" },
    { label: "SOT", value: "offensive.shotsOnTarget" },
    { label: "COR", value: "offensive.cornerKicks" },
    { label: "OFF", value: "offensive.offsides" },
    { label: "FLS", value: "offensive.fouls" },
    { label: "2YELRED", value: "offensive.doubleYellowRedCards" },
    { label: "YEL", value: "offensive.yellowCards" },
    { label: "RED", value: "offensive.redCards" }
  ],
  categorizedStatsTemplate: [
    { label: "G", value: { for: { field: "offensive.goals", sortingOrder: "desc" }, against: { field: "defensive.goals", sortingOrder: "asc" } } },
    { label: "POS", value: { for: { field: "offensive.ballPossession", sortingOrder: "desc" }, against: { field: "defensive.ballPossession", sortingOrder: "asc" } } },
    { label: "SHO", value: { for: { field: "offensive.shotsTotal", sortingOrder: "desc" }, against: { field: "defensive.shotsTotal", sortingOrder: "asc" } } },
    { label: "SOT", value: { for: { field: "offensive.shotsOnTarget", sortingOrder: "desc" }, against: { field: "defensive.shotsOnTarget", sortingOrder: "asc" } } },
    { label: "COR", value: { for: { field: "offensive.cornerKicks", sortingOrder: "desc" }, against: { field: "defensive.cornerKicks", sortingOrder: "asc" } } },
    { label: "OFF", value: { for: { field: "offensive.offsides", sortingOrder: "asc" }, against: { field: "defensive.offsides", sortingOrder: "desc" } } },
    { label: "FLS", value: { for: { field: "offensive.fouls", sortingOrder: "asc" }, against: { field: "defensive.fouls", sortingOrder: "desc" } } },
    { label: "2YELRED", value: { for: { field: "offensive.doubleYellowRedCards", sortingOrder: "asc" }, against: { field: "defensive.doubleYellowRedCards", sortingOrder: "desc" } } },
    { label: "YEL", value: { for: { field: "offensive.yellowCards", sortingOrder: "asc" }, against: { field: "defensive.yellowCards", sortingOrder: "desc" } } },
    { label: "RED", value: { for: { field: "offensive.redCards", sortingOrder: "asc" }, against: { field: "defensive.redCards", sortingOrder: "desc" } } }
  ]
};

const NRL_GAME_SUMMARY_TEMPLATE = {
  statsTemplate: [
    { label: "PTS", value: "offensive.points" },
    { label: "T", value: "offensive.tries" },
    { label: "G", value: "offensive.goals" },
    { label: "CR%", value: "offensive.setCompletionPercentage" },
    { label: "R", value: "offensive.allRuns" },
    { label: "RM", value: "offensive.allRunMetres" },
    { label: "AVG", value: "offensive.averageSetDistance" },
    { label: "LB", value: "offensive.lineBreaks" },
    { label: "TB", value: "offensive.tackleBreaks" },
    { label: "K", value: "offensive.totalKicks" },
    { label: "KM", value: "offensive.totalKickMetres" }
  ],
  categorizedStatsTemplate: [
    { label: "PTS", value: { for: { field: "offensive.points", sortingOrder: "desc" }, against: { field: "defensive.points", sortingOrder: "asc" } } },
    { label: "T", value: { for: { field: "offensive.tries", sortingOrder: "desc" }, against: { field: "defensive.tries", sortingOrder: "asc" } } },
    { label: "G", value: { for: { field: "offensive.goals", sortingOrder: "desc" }, against: { field: "defensive.goals", sortingOrder: "asc" } } },
    { label: "CR%", value: { for: { field: "offensive.setCompletionPercentage", sortingOrder: "desc" }, against: { field: "defensive.setCompletionPercentage", sortingOrder: "asc" } } },
    { label: "R", value: { for: { field: "offensive.allRuns", sortingOrder: "desc" }, against: { field: "defensive.allRuns", sortingOrder: "asc" } } },
    { label: "RM", value: { for: { field: "offensive.allRunMetres", sortingOrder: "desc" }, against: { field: "defensive.allRunMetres", sortingOrder: "asc" } } },
    { label: "AVG", value: { for: { field: "offensive.averageSetDistance", sortingOrder: "desc" }, against: { field: "defensive.averageSetDistance", sortingOrder: "asc" } } },
    { label: "LB", value: { for: { field: "offensive.lineBreaks", sortingOrder: "desc" }, against: { field: "defensive.lineBreaks", sortingOrder: "asc" } } },
    { label: "TB", value: { for: { field: "offensive.tackleBreaks", sortingOrder: "desc" }, against: { field: "defensive.tackleBreaks", sortingOrder: "asc" } } },
    { label: "K", value: { for: { field: "offensive.totalKicks", sortingOrder: "desc" }, against: { field: "defensive.totalKicks", sortingOrder: "asc" } } },
    { label: "KM", value: { for: { field: "offensive.totalKickMetres", sortingOrder: "desc" }, against: { field: "defensive.totalKickMetres", sortingOrder: "asc" } } }
  ]
};

const AFL_GAME_SUMMARY_TEMPLATE = {
  statsTemplate: [
    { label: "PTS", value: "offensive.points" },
    { label: "G", value: "offensive.goals" },
    { label: "B", value: "offensive.behinds" },
    { label: "D", value: "offensive.disposals" },
    { label: "FK", value: "offensive.freeKicks" },
    { label: "H", value: "offensive.handballs" },
    { label: "HO", value: "offensive.hitouts" },
    { label: "K", value: "offensive.kicks" },
    { label: "M", value: "offensive.marks" },
    { label: "MI50", value: "offensive.marksInside50" },
    { label: "T", value: "offensive.tackles" }
  ],
  categorizedStatsTemplate: [
    { label: "PTS", value: { for: { field: "offensive.points", sortingOrder: "desc" }, against: { field: "defensive.points", sortingOrder: "asc" } } },
    { label: "G", value: { for: { field: "offensive.goals", sortingOrder: "desc" }, against: { field: "defensive.goals", sortingOrder: "asc" } } },
    { label: "B", value: { for: { field: "offensive.behinds", sortingOrder: "desc" }, against: { field: "defensive.behinds", sortingOrder: "asc" } } },
    { label: "D", value: { for: { field: "offensive.disposals", sortingOrder: "desc" }, against: { field: "defensive.disposals", sortingOrder: "asc" } } },
    { label: "FK", value: { for: { field: "offensive.freeKicks", sortingOrder: "desc" }, against: { field: "defensive.freeKicks", sortingOrder: "asc" } } },
    { label: "H", value: { for: { field: "offensive.handballs", sortingOrder: "desc" }, against: { field: "defensive.handballs", sortingOrder: "asc" } } },
    { label: "HO", value: { for: { field: "offensive.hitouts", sortingOrder: "desc" }, against: { field: "defensive.hitouts", sortingOrder: "asc" } } },
    { label: "K", value: { for: { field: "offensive.kicks", sortingOrder: "desc" }, against: { field: "defensive.kicks", sortingOrder: "asc" } } },
    { label: "M", value: { for: { field: "offensive.marks", sortingOrder: "desc" }, against: { field: "defensive.marks", sortingOrder: "asc" } } },
    { label: "MI50", value: { for: { field: "offensive.marksInside50", sortingOrder: "desc" }, against: { field: "defensive.marksInside50", sortingOrder: "asc" } } },
    { label: "T", value: { for: { field: "offensive.tackles", sortingOrder: "desc" }, against: { field: "defensive.tackles", sortingOrder: "asc" } } }
  ]
};

const GAME_SUMMARY_STATS_TEMPLATES_BY_LEAGUE = {
  nfl: FOOTBALL_GAME_SUMMARY_TEMPLATE,
  ncaaf: FOOTBALL_GAME_SUMMARY_TEMPLATE,

  nhl: NHL_GAME_SUMMARY_TEMPLATE,

  nba: BASKETBALL_GAME_SUMMARY_TEMPLATE,
  wnba: BASKETBALL_GAME_SUMMARY_TEMPLATE,
  ncaab: BASKETBALL_GAME_SUMMARY_TEMPLATE,

  mlb: MLB_GAME_SUMMARY_TEMPLATE,

  bundesliga: SOCCER_GAME_SUMMARY_TEMPLATE,
  epl: SOCCER_GAME_SUMMARY_TEMPLATE,
  laliga: SOCCER_GAME_SUMMARY_TEMPLATE,
  ligue1: SOCCER_GAME_SUMMARY_TEMPLATE,
  seriea: SOCCER_GAME_SUMMARY_TEMPLATE,
  'brazil-serie-a': SOCCER_GAME_SUMMARY_TEMPLATE,
  mls: SOCCER_GAME_SUMMARY_TEMPLATE,
  euro: SOCCER_GAME_SUMMARY_TEMPLATE,
  ucl: SOCCER_GAME_SUMMARY_TEMPLATE,
  uel: SOCCER_GAME_SUMMARY_TEMPLATE,
  "fifa-world-cup": SOCCER_GAME_SUMMARY_TEMPLATE,

  nrl: NRL_GAME_SUMMARY_TEMPLATE,
  afl: AFL_GAME_SUMMARY_TEMPLATE,
};

export const PREFERENCE_THEME = "theme"
export const PREFERENCE_THEME_SYSTEM = "Match System";
export const PREFERENCE_THEME_LIGHT = "Light";
export const PREFERENCE_THEME_DARK = "Dark";
export const PREFERENCE_THEME_DEFAULT_VALUE = PREFERENCE_THEME_SYSTEM;
export const PREFERENCE_THEME_OPTIONS = [PREFERENCE_THEME_SYSTEM, PREFERENCE_THEME_LIGHT, PREFERENCE_THEME_DARK];

export const PREFERENCE_ODDS = "odds";
export const PREFERENCE_ODDS_AMERICAN = "american";
export const PREFERENCE_ODDS_DECIMAL = "decimal";
export const PREFERENCE_ODDS_DEFAULT_VALUE = PREFERENCE_ODDS_AMERICAN;
export const PREFERENCE_ODDS_OPTIONS = [PREFERENCE_ODDS_AMERICAN, PREFERENCE_ODDS_DECIMAL];
export const PREFERENCE_LANGUAGE = "language";
export const PREFERENCE_LANGUAGE_DEFAULT_VALUE = "en";

export const LOCAL_STORAGE_CONFIGURATION_KEY = 'configuration';
export const LOCAL_STORAGE_LEAGUE_KEY = 'league';
export const LOCAL_STORAGE_PREFERENCES_THEME_KEY = PREFERENCE_THEME;
export const LOCAL_STORAGE_PREFERENCES_ODDS_KEY = PREFERENCE_ODDS;
export const LOCAL_STORAGE_PREFERENCES_LANGUAGE_KEY = PREFERENCE_LANGUAGE;
export const LOCAL_STORAGE_ANALYZE_TRENDS_V1_OPENED = "analyzeV1PreviouslyOpened";
export const LOCAL_STORAGE_INTRO_PAYWALL_V1_OPENED = "introPaywallV1PreviouslyOpened";
// TODO: review if this is used in web and if not remove it
export const LOCAL_STORAGE_BETSLIP_V1_OPENED = "betslipV1PreviouslyOpened"
// Key that was used for showing an informational popup about props when it was moved as a tab
export const LOCAL_STORAGE_PROPS_V1_OPENED = "propsV1PreviouslyOpened";

export const FEATURE_BETSLIP = "betslip"
export const FEATURE_PROVIDERS_SELECTION = "preferredProviders"

// We could have this in the metadata of the back-end configuration
export const BETTING_LEADERBOARD_TIMEFRAMES = {
  "Season": "SEASON",
  "Head to Head": "MATCHUP",
  "Last 5": "LAST_5",
  "Last 10": "LAST_10",
  "Last 20": "LAST_20",
  "Last 30": "LAST_30"
}

// We could have this in the metadata of the back-end configuration
export const BETTING_LEADERBOARD_MIN_ODDS_OPTIONS = {
  american: ["-400", "-200", "-135", "+100"],
  decimal: ["1.25", "1.5", "1.75", "2.0"],
  // When comparing to these, will have to parse out the string and convert it to a number
  fractional: ["1/4", "1/2", "3/4", "1"]
}

export const OVER_UNDER_FILTER = "O/U";
export const MIN_ODDS_FILTER = "Min Odds";
export const BET_TYPE_FILTER = "Bet Type";
export const TIMEFRAME_FILTER = "Timeframe";
export const GAMES_FILTER = "Game";
export const SITUATION_FILTER = "Situation";
export const SPLITS_FILTER = "Splits";
export const TEAM_FILTER = "Team";
export const PLAYER_FILTER = "Player";
export const TRENDS_FILTER = "Trends";
export const SIGNALS_FILTER = "Signals";
export const LINE_TYPE_FILTER = "Line Type"
export const WITH_FILTER = "With";
export const WITHOUT_FILTER = "Without";
export const OPPONENT_FILTER = "Opponent";
export const PARLAY_LEGS_COUNT_FILTER = "Number Of legs";
export const PARLAY_LEGS_TYPE_FILTER = "Parlay Type";

export const ALL_TRENDS_OPTION = "All Trends";
export const RECENT_FORM_TREND_OPTION = "Recent Form";
export const HEAD_TO_HEAD_TREND_OPTION = "Head to Head";
export const HOME_AWAY_SPLIT_TREND_OPTION = "Home/Away Splits";
export const OPPONENT_RANK_TREND_OPTION = "Opponent Rank";
export const INJURY_IMPACT_TREND_OPTION = "Injury Impact"
export const STARTER_TREND_OPTION = "Starter"

// TODO: have a list of what's available per league
export const ALL_SIGNALS_OPTION = "All Signals";
export const RECENT_FORM_SIGNAL_OPTION = "Recent Form";
export const HEAD_TO_HEAD_SIGNAL_OPTION = "Head to Head";
export const HOME_AWAY_SPLIT_SIGNAL_OPTION = "Home/Away Splits";
export const OPPONENT_RANK_SIGNAL_OPTION = "Opponent Rank";
export const INJURY_IMPACT_SIGNAL_OPTION = "Injury Impact"
export const STARTER_SIGNAL_OPTION = "Starter"
export const WEATHER_SIGNAL_OPTION = "Weather"
export const STARTING_PITCHER_SIGNAL_OPTION = "Starting Pitcher"

export const ALL_LEG_COUNTS_OPTION = "Any Number Of Legs";
export const TWO_LEGS_OPTION = "2 Legs";
export const THREE_LEGS_OPTION = "3 Legs";
export const ALL_LEG_TYPES_OPTION = "All Leg Types";

// Used as a hack/workaround
// When re-doing the web filters and dropdowns I made the mistake of not aligning the key:value format,
//  meaning that the user-friendly display text is in the dictionary key in one place and in the value in the other place (and vice-versa for the internal key)
// I don't have time to fix it and make both use the same format right now, as a temporary workaround going to indicate where to get the internal key for query parameters to the server
export const FILTER_QUERY_PARAMETER_LOCATION_VALUE = 'value';
export const FILTER_QUERY_PARAMETER_LOCATION_KEY = 'key';

const SOCCER_DEFAULT_SITUATION = 'all';
const SOCCER_SITUATIONS = { all: '' };
const SOCCER_BETTING_TIMEFRAME_OPTIONS = ["Season", "Matchup", "Last 5", "Last 10", "Last 20", "Last 30"];

const DEFAULT_SITUATIONS_BY_LEAGUE = {
  nfl: "all",
  ncaaf: "all",
  nba: "all",
  wnba: "all",
  ncaab: "all",
  nhl: "all",
  mlb: "againstBothHands",
  bundesliga: SOCCER_DEFAULT_SITUATION,
  epl: "all",
  laliga: "all",
  ligue1: "all",
  seriea: "all",
  "brazil-serie-a": "all",
  mls: "all",
  euro: "all",
  ucl: "all",
  uel: "all",
  "fifa-world-cup": "all",
  afl: 'all',
  nrl: 'all'
}

const SITUATIONS_BY_LEAGUE = {
  nfl: {
    "all": ""
  },
  ncaaf: {
    "all": ""
  },
  nba: {
    "all": ""
  },
  wnba: {
    "all": ""
  },
  ncaab: {
    "all": ""
  },
  nhl: {
    "all": ""
  },
  mlb: {
    "againstBothHands": "All",
    "againstLeftHanded": "LH",
    "againstRightHanded": "RH"
  },
  bundesliga: SOCCER_SITUATIONS,
  epl: {
    "all": ""
  },
  laliga: {
    "all": ""
  },
  ligue1: {
    "all": ""
  },
  seriea: {
    "all": ""
  },
  "brazil-serie-a": {
    "all": ""
  },
  mls: {
    "all": ""
  },
  euro: {
    "all": ""
  },
  ucl: {
    "all": ""
  },
  uel: {
    "all": ""
  },
  "fifa-world-cup": {
    "all": ""
  },
  afl: {
    'all': ''
  },
  nrl: {
    'all': ''
  }
}

const BETTING_TIMEFRAME_OPTIONS_BY_LEAGUE = {
  nfl: ["Season", "Matchup", "Last 5", "Last 10", "Last 20", "Last 30"],
  ncaaf: ["Season", "Matchup", "Last 5", "Last 10", "Last 20", "Last 30"],
  nhl: ["Season", "Matchup", "Last 5", "Last 10", "Last 20", "Last 30"],
  nba: ["Season", "Matchup", "Last 5", "Last 10", "Last 20", "Last 30"],
  wnba: ["Season", "Matchup", "Last 5", "Last 10", "Last 20", "Last 30"],
  ncaab: ["Season", "Matchup", "Last 5", "Last 10", "Last 20", "Last 30"],
  mlb: ["Season", "Matchup", "Last 5", "Last 10", "Last 20", "Last 30"],
  bundesliga: SOCCER_BETTING_TIMEFRAME_OPTIONS,
  epl: ["Season", "Matchup", "Last 5", "Last 10", "Last 20", "Last 30"],
  laliga: ["Season", "Matchup", "Last 5", "Last 10", "Last 20", "Last 30"],
  ligue1: ["Season", "Matchup", "Last 5", "Last 10", "Last 20", "Last 30"],
  seriea: ["Season", "Matchup", "Last 5", "Last 10", "Last 20", "Last 30"],
  "brazil-serie-a": ["Season", "Matchup", "Last 5", "Last 10", "Last 20", "Last 30"],
  mls: ["Season", "Matchup", "Last 5", "Last 10", "Last 20", "Last 30"],
  euro: ["Season", "Matchup", "Last 5", "Last 10", "Last 20", "Last 30"],
  ucl: ["Season", "Matchup", "Last 5", "Last 10", "Last 20", "Last 30"],
  uel: ["Season", "Matchup", "Last 5", "Last 10", "Last 20", "Last 30"],
  "fifa-world-cup": ["Season", "Matchup", "Last 5", "Last 10", "Last 20", "Last 30"],
  afl: ["Season", "Matchup", "Last 5", "Last 10", "Last 20", "Last 30"],
  nrl: ["Season", "Matchup", "Last 5", "Last 10", "Last 20", "Last 30"]
}

export const PLAYBOOK_SNAPSHOT_STATS = (league, qualifier) => {
  switch(league) {
    case "mlb":
      return {
        "R": `${qualifier}.offensive.runs`,
        "H": `${qualifier}.offensive.hits`,
        "HR": `${qualifier}.offensive.homeRuns`,
        "AVG": `${qualifier}.offensive.battingAverage`,
        "OBP": `${qualifier}.offensive.onBasePercentage`,
        "SLG": `${qualifier}.offensive.sluggingPercentage`,
        "OPS": `${qualifier}.offensive.onBasePlusSluggingPercentage`
      };
    case "nfl":
    case "ncaaf":
      return {
        "PTS": `${qualifier}.offensive.points`,
        "PASS YDS": `${qualifier}.offensive.passingYards`,
        "PASS TD": `${qualifier}.offensive.passingTouchdowns`,
        "RUSH YDS": `${qualifier}.offensive.rushingYards`,
        "RUSH TD": `${qualifier}.offensive.rushingTouchdowns`,
        "NET YDS": `${qualifier}.offensive.totalYards`,
        "TOTAL TDS": `${qualifier}.offensive.totalTouchdowns`,
        "RZ%": `${qualifier}.offensive.redzoneSuccessRate`
      };
    case "nba":
    case "wnba":
    case "ncaab":
      return {
        "PTS": `${qualifier}.offensive.points`,
        "AST": `${qualifier}.offensive.assists`,
        "TRB": `${qualifier}.offensive.rebounds`,
        "STL": `${qualifier}.defensive.steals`,
        "TO": `${qualifier}.defensive.turnovers`
      };
    case "nhl":
      return {
        "G": `${qualifier}.offensive.goals`,
        "SOG": `${qualifier}.offensive.shotsOnGoal`,
        "SAT": `${qualifier}.offensive.shotAttempts`,
        "CF%": `${qualifier}.offensive.corsiPercentage`,
        "PP%": `${qualifier}.offensive.powerplayPercentage`
      };
    case "bundesliga":
    case "epl":
    case "laliga":
    case "ligue1":
    case "seriea":
    case "brazil-serie-a":
    case "mls":
    case "euro":
    case "ucl":
    case "uel":
    case "fifa-world-cup":
      return {
        "G": `${qualifier}.offensive.goals`,
        "POS": `${qualifier}.offensive.ballPossession`,
        "SHO": `${qualifier}.offensive.shotsTotal`,
        "SOT": `${qualifier}.offensive.shotsOnTarget`,
        "COR": `${qualifier}.offensive.cornerKicks`,
        "OFF": `${qualifier}.offensive.offsides`,
        "FLS": `${qualifier}.offensive.fouls`,
        "2YELRED": `${qualifier}.offensive.doubleYellowRedCards`,
        "YEL": `${qualifier}.offensive.yellowCards`,
        "RED": `${qualifier}.offensive.redCards`
      }
    case "afl":
      return {
        "PTS": `${qualifier}.offensive.points`,
        "G": `${qualifier}.offensive.goals`,
        "B": `${qualifier}.offensive.behinds`,
        "D": `${qualifier}.offensive.disposals`,
        "FK": `${qualifier}.offensive.freeKicks`,
        "H": `${qualifier}.offensive.handballs`,
        "HO": `${qualifier}.offensive.hitouts`,
        "K": `${qualifier}.offensive.kicks`,
        "M": `${qualifier}.offensive.marks`,
        "MI50": `${qualifier}.offensive.marksInside50`,
        "T": `${qualifier}.offensive.tackles`
      }
    case "nrl":
      return {
        "PTS": `${qualifier}.offensive.points`,
        "T": `${qualifier}.offensive.tries`,
        'G': `${qualifier}.offensive.goals`,
        'FG': `${qualifier}.offensive.fieldGoals`,
        'POS%': `${qualifier}.offensive.possessionPercentage`,
        'CR%': `${qualifier}.offensive.setCompletionPercentage`,
        'RM': `${qualifier}.offensive.allRunMetres`
      }
    default:
      return {};
  }
}

export const PLAYBOOK_EDGE_FINDER_STATS = (league, qualifier) => {
  switch(league) {
    case "mlb":
      return {
        "R": `${qualifier}.offensive.runs`,
        "H": `${qualifier}.offensive.hits`,
        "1B": `${qualifier}.offensive.singles`,
        "2B": `${qualifier}.offensive.doubles`,
        "3B": `${qualifier}.offensive.triples`,
        "TB": `${qualifier}.offensive.totalBases`,
        "ER": `${qualifier}.offensive.earnedRuns`,
        "HR": `${qualifier}.offensive.homeRuns`,
        "RBI": `${qualifier}.offensive.runsBattedIn`,
        "BB": `${qualifier}.offensive.walks`,
        "SO": `${qualifier}.offensive.strikeouts`,
        "E": `${qualifier}.offensive.errors`,
        "AVG": `${qualifier}.offensive.battingAverage`,
        "OBP": `${qualifier}.offensive.onBasePercentage`,
        "SLG": `${qualifier}.offensive.sluggingPercentage`,
        "OPS": `${qualifier}.offensive.onBasePlusSluggingPercentage`
      };
    case "nfl":
    case "ncaaf":
      return {
        "PTS": `${qualifier}.offensive.points`,
        "SCORE %": `${qualifier}.offensive.scorePercentage`,
        "PLAYS": `${qualifier}.offensive.plays`,
        "NET YDS": `${qualifier}.offensive.totalYards`,
        "PASS YDS": `${qualifier}.offensive.passingYards`,
        "PASS ATT": `${qualifier}.offensive.passingAttempts`,
        "PASS COMPL": `${qualifier}.offensive.passingCompletions`,
        "PASS TD": `${qualifier}.offensive.passingTouchdowns`,
        "RUSH YDS": `${qualifier}.offensive.rushingYards`,
        "RUSH ATT": `${qualifier}.offensive.rushingAttempts`,
        "RUSH TD": `${qualifier}.offensive.rushingTouchdowns`,
        "TOTAL TDS": `${qualifier}.offensive.totalTouchdowns`,
        "RZ%": `${qualifier}.offensive.redzoneSuccessRate`,
        "1D": `${qualifier}.offensive.firstDowns`,
        "3D%": `${qualifier}.offensive.thirdDownConversionPercentage`,
        "4D%": `${qualifier}.offensive.fourthDownConversionPercentage`,
        "INT THROWN": `${qualifier}.offensive.interceptions`,
        "TO": `${qualifier}.offensive.turnovers`,
        "SACKS": `${qualifier}.defensive.sacks`,
        "FUML": `${qualifier}.offensive.fumblesLost`
      };
    case "nba":
    case "wnba":
    case "ncaab":
      return {
        "PTS": `${qualifier}.offensive.points`,
        "FT%": `${qualifier}.offensive.freeThrowPercentage`,
        "FG%": `${qualifier}.offensive.fieldGoalPercentage`,
        "3PT%": `${qualifier}.offensive.threePointPercentage`,
        "TS%": `${qualifier}.offensive.trueShootingPercentage`,
        "eFG%": `${qualifier}.offensive.effectiveFieldGoalPercentage`,
        "TRB": `${qualifier}.offensive.rebounds`,
        "AST": `${qualifier}.offensive.assists`,
        "STL": `${qualifier}.defensive.steals`,
        "TO": `${qualifier}.defensive.turnovers`,
        "BLK": `${qualifier}.defensive.blocks`
      };
    case "nhl":
      return {
        "G": `${qualifier}.offensive.goals`,
        "SOG": `${qualifier}.offensive.shotsOnGoal`,
        "SAT": `${qualifier}.offensive.shotAttempts`,
        "CF%": `${qualifier}.offensive.corsiPercentage`,
        "PP%": `${qualifier}.offensive.powerplayPercentage`,
        "PIM": `${qualifier}.offensive.penaltyMinutes`
      };
    case "bundesliga":
    case "epl":
    case "laliga":
    case "ligue1":
    case "seriea":
    case "brazil-serie-a":
    case "mls":
    case "euro":
    case "ucl":
    case "uel":
    case "fifa-world-cup":
      return {
        "G": `${qualifier}.offensive.goals`,
        "POS": `${qualifier}.offensive.ballPossession`,
        "SHO": `${qualifier}.offensive.shotsTotal`,
        "SOT": `${qualifier}.offensive.shotsOnTarget`,
        "COR": `${qualifier}.offensive.cornerKicks`,
        "OFF": `${qualifier}.offensive.offsides`,
        "FLS": `${qualifier}.offensive.fouls`,
        "2YELRED": `${qualifier}.offensive.doubleYellowRedCards`,
        "YEL": `${qualifier}.offensive.yellowCards`,
        "RED": `${qualifier}.offensive.redCards`
      }
    case "afl":
      return {
        "PTS": `${qualifier}.offensive.points`,
        "G": `${qualifier}.offensive.goals`,
        "B": `${qualifier}.offensive.behinds`,
        "D": `${qualifier}.offensive.disposals`,
        "FK": `${qualifier}.offensive.freeKicks`,
        "H": `${qualifier}.offensive.handballs`,
        "HO": `${qualifier}.offensive.hitouts`,
        "K": `${qualifier}.offensive.kicks`,
        "M": `${qualifier}.offensive.marks`,
        "MI50": `${qualifier}.offensive.marksInside50`,
        "T": `${qualifier}.offensive.tackles`
      }
    case "nrl":
      return {
        "PTS": `${qualifier}.offensive.points`,
        "T": `${qualifier}.offensive.tries`,
        'G': `${qualifier}.offensive.goals`,
        'FG': `${qualifier}.offensive.fieldGoals`,
        'POS%': `${qualifier}.offensive.possessionPercentage`,
        'CR%': `${qualifier}.offensive.setCompletionPercentage`,
        'RM': `${qualifier}.offensive.allRunMetres`
      }
    default:
      return {};
  }
}

export const PLAYBOOK_SEASON_STATS = (league, qualifier, type) => {
  switch(league) {
    case "mlb":
      return {
        "R": `${qualifier}.${type}.runs`,
        "H": `${qualifier}.${type}.hits`,
        "1B": `${qualifier}.${type}.singles`,
        "2B": `${qualifier}.${type}.doubles`,
        "3B": `${qualifier}.${type}.triples`,
        "TB": `${qualifier}.${type}.totalBases`,
        "ER": `${qualifier}.${type}.earnedRuns`,
        "HR": `${qualifier}.${type}.homeRuns`,
        "RBI": `${qualifier}.${type}.runsBattedIn`,
        "BB": `${qualifier}.${type}.walks`,
        "SO": `${qualifier}.${type}.strikeouts`,
        "E": `${qualifier}.${type}.errors`,
        "AVG": `${qualifier}.${type}.battingAverage`,
        "OBP": `${qualifier}.${type}.onBasePercentage`,
        "SLG": `${qualifier}.${type}.sluggingPercentage`,
        "OPS": `${qualifier}.${type}.onBasePlusSluggingPercentage`
      };
    case "nfl":
    case "ncaaf":
      return {
        "PTS": `${qualifier}.${type}.points`,
        "SCORE %": `${qualifier}.${type}.scorePercentage`,
        "PLAYS": `${qualifier}.${type}.plays`,
        "NET YDS": `${qualifier}.${type}.totalYards`,
        "PASS YDS": `${qualifier}.${type}.passingYards`,
        "PASS ATT": `${qualifier}.${type}.passingAttempts`,
        "PASS COMPL": `${qualifier}.${type}.passingCompletions`,
        "PASS TD": `${qualifier}.${type}.passingTouchdowns`,
        "RUSH YDS": `${qualifier}.${type}.rushingYards`,
        "RUSH ATT": `${qualifier}.${type}.rushingAttempts`,
        "RUSH TD": `${qualifier}.${type}.rushingTouchdowns`,
        "TOTAL TDS": `${qualifier}.${type}.totalTouchdowns`,
        "RZ%": `${qualifier}.${type}.redzoneSuccessRate`,
        "1D": `${qualifier}.${type}.firstDowns`,
        "3D%": `${qualifier}.${type}.thirdDownConversionPercentage`,
        "4D%": `${qualifier}.${type}.fourthDownConversionPercentage`,
        "INT THROWN": `${qualifier}.${type}.interceptions`,
        "TO": `${qualifier}.${type}.turnovers`,
        "SACKS": `${qualifier}.${type}.sacks`,
        "FUML": `${qualifier}.${type}.fumblesLost`
      };
    case "nba":
    case "wnba":
    case "ncaab":
      return {
        "PTS": `${qualifier}.${type}.points`,
        "FT%": `${qualifier}.${type}.freeThrowPercentage`,
        "FG%": `${qualifier}.${type}.fieldGoalPercentage`,
        "3PT%": `${qualifier}.${type}.threePointPercentage`,
        "TS%": `${qualifier}.${type}.trueShootingPercentage`,
        "eFG%": `${qualifier}.${type}.effectiveFieldGoalPercentage`,
        "TRB": `${qualifier}.${type}.rebounds`,
        "AST": `${qualifier}.${type}.assists`,
        "STL": `${qualifier}.${type}.steals`,
        "TO": `${qualifier}.${type}.turnovers`,
        "BLK": `${qualifier}.${type}.blocks`
      };
    case "nhl":
      return {
        "G": `${qualifier}.${type}.goals`,
        "SOG": `${qualifier}.${type}.shotsOnGoal`,
        "SAT": `${qualifier}.${type}.shotAttempts`,
        "CF%": `${qualifier}.${type}.corsiPercentage`,
        "PP%": `${qualifier}.${type}.powerplayPercentage`,
        "PIM": `${qualifier}.${type}.penaltyMinutes`
      };
    case "bundesliga":
    case "epl":
    case "laliga":
    case "ligue1":
    case "seriea":
    case "brazil-serie-a":
    case "mls":
    case "euro":
    case "ucl":
    case "uel":
    case "fifa-world-cup":
      return {
        "G": `${qualifier}.${type}.goals`,
        "POS": `${qualifier}.${type}.ballPossession`,
        "SHO": `${qualifier}.${type}.shotsTotal`,
        "SOT": `${qualifier}.${type}.shotsOnTarget`,
        "COR": `${qualifier}.${type}.cornerKicks`,
        "OFF": `${qualifier}.${type}.offsides`,
        "FLS": `${qualifier}.${type}.fouls`,
        "2YELRED": `${qualifier}.${type}.doubleYellowRedCards`,
        "YEL": `${qualifier}.${type}.yellowCards`,
        "RED": `${qualifier}.${type}.redCards`
      }
    case "afl":
      return {
        "PTS": `${qualifier}.${type}.points`,
        "G": `${qualifier}.${type}.goals`,
        "B": `${qualifier}.${type}.behinds`,
        "D": `${qualifier}.${type}.disposals`,
        "FK": `${qualifier}.${type}.freeKicks`,
        "H": `${qualifier}.${type}.handballs`,
        "HO": `${qualifier}.${type}.hitouts`,
        "K": `${qualifier}.${type}.kicks`,
        "M": `${qualifier}.${type}.marks`,
        "MI50": `${qualifier}.${type}.marksInside50`,
        "T": `${qualifier}.${type}.tackles`
      }
    case "nrl":
      return {
        "PTS": `${qualifier}.${type}.points`,
        "T": `${qualifier}.${type}.tries`,
        'G': `${qualifier}.${type}.goals`,
        'FG': `${qualifier}.${type}.fieldGoals`,
        'POS%': `${qualifier}.${type}.possessionPercentage`,
        'CR%': `${qualifier}.${type}.setCompletionPercentage`,
        'RM': `${qualifier}.${type}.allRunMetres`
      }
    default:
      return {};
  }
}

const getSoccerScreenerTeamScoringStats = (qualifier, type) => ({
  "G": `${qualifier}.${type}.goals`,
  "POS": `${qualifier}.${type}.ballPossession`,
  "SHO": `${qualifier}.${type}.shotsTotal`,
  "SOT": `${qualifier}.${type}.shotsOnTarget`,
  "COR": `${qualifier}.${type}.cornerKicks`,
  "OFF": `${qualifier}.${type}.offsides`,
  "FLS": `${qualifier}.${type}.fouls`,
  "2YELRED": `${qualifier}.${type}.doubleYellowRedCards`,
  "YEL": `${qualifier}.${type}.yellowCards`,
  "RED": `${qualifier}.${type}.redCards`
});

const getScreenerTeamScoringStatsByLeague = (league, qualifier, type) => {
  switch(league) {
    case "nba":
    case "wnba":
    case "ncaab":
      return {
        "PTS": `${qualifier}.${type}.points`,
        "FT%": `${qualifier}.${type}.freeThrowPercentage`,
        "FG%": `${qualifier}.${type}.fieldGoalPercentage`,
        "3PT%": `${qualifier}.${type}.threePointPercentage`,
        "TS%": `${qualifier}.${type}.trueShootingPercentage`,
        "eFG%": `${qualifier}.${type}.effectiveFieldGoalPercentage`,
        "TRB": `${qualifier}.${type}.rebounds`,
        "AST": `${qualifier}.${type}.assists`,
        "STL": `${qualifier}.${type}.steals`,
        "TO": `${qualifier}.${type}.turnovers`,
        "BLK": `${qualifier}.${type}.blocks`,
        "PACE": `${qualifier}.${type}.pace`
      };
    case "nhl":
      return {
        "G": `${qualifier}.${type}.goals`,
        "SOG": `${qualifier}.${type}.shotsOnGoal`,
        "SAT": `${qualifier}.${type}.shotAttempts`,
        "CF%": `${qualifier}.${type}.corsiPercentage`,
        "BLK": `${qualifier}.${type}.defensiveBlocks`,
        "PIM": `${qualifier}.${type}.penaltyMinutes`,
        "PPG": `${qualifier}.${type}.powerplayGoals`,
        "PP%": `${qualifier}.${type}.powerplayPercentage`
      };
    case "nfl":
    case "ncaaf":
      return {
        "PTS": `${qualifier}.${type}.points`,
        "Score %": `${qualifier}.${type}.scorePercentage`,
        "Plays": `${qualifier}.${type}.plays`,
        "Net Yds": `${qualifier}.${type}.totalYards`,
        "Pass Yds": `${qualifier}.${type}.passingYards`,
        "Pass Att": `${qualifier}.${type}.passingAttempts`,
        "Pass Compl": `${qualifier}.${type}.passingCompletions`,
        "Pass TD": `${qualifier}.${type}.passingTouchdowns`,
        "Rush Yds": `${qualifier}.${type}.rushingYards`,
        "Rush Att": `${qualifier}.${type}.rushingAttempts`,
        "Rush TD": `${qualifier}.${type}.rushingTouchdowns`,
        "Total TDs": `${qualifier}.${type}.totalTouchdowns`,
        "RZ%": `${qualifier}.${type}.redzoneSuccessRate`,
        "1D": `${qualifier}.${type}.firstDowns`,
        "3D": `${qualifier}.${type}.thirdDownConversionAttempts`,
        "3D%": `${qualifier}.${type}.thirdDownConversionPercentage`,
        "4D%": `${qualifier}.${type}.fourthDownConversionPercentage`,
        "INT": `${qualifier}.${type}.interceptions`,
        "TO": `${qualifier}.${type}.turnovers`,
        "Sacks": `${qualifier}.${type}.sacks`,
        "FUML": `${qualifier}.${type}.fumblesLost`
      };
    case "mlb":
      return {
        "R": `${qualifier}.${type}.runs`,
        "H": `${qualifier}.${type}.hits`,
        "1B": `${qualifier}.${type}.singles`,
        "2B": `${qualifier}.${type}.doubles`,
        "3B": `${qualifier}.${type}.triples`,
        "HR": `${qualifier}.${type}.homeRuns`,
        "RBI": `${qualifier}.${type}.runsBattedIn`,
        "BB": `${qualifier}.${type}.walks`,
        "SO": `${qualifier}.${type}.strikeouts`,
        "E": `${qualifier}.${type}.errors`,
        "AVG": `${qualifier}.${type}.battingAverage`,
        "OPS": `${qualifier}.${type}.onBasePlusSluggingPercentage`
      };
    case "bundesliga":
    case "epl":
    case "laliga":
    case "ligue1":
    case "seriea":
    case "brazil-serie-a":
    case "mls":
    case "euro":
    case "ucl":
    case "uel":
    case "fifa-world-cup":
      return getSoccerScreenerTeamScoringStats(qualifier, type);
    case "afl":
      return {
        "PTS": `${qualifier}.${type}.points`,
        "G": `${qualifier}.${type}.goals`,
        "B": `${qualifier}.${type}.behinds`,
        "D": `${qualifier}.${type}.disposals`,
        "FK": `${qualifier}.${type}.freeKicks`,
        "H": `${qualifier}.${type}.handballs`,
        "HO": `${qualifier}.${type}.hitouts`,
        "K": `${qualifier}.${type}.kicks`,
        "M": `${qualifier}.${type}.marks`,
        "MI50": `${qualifier}.${type}.marksInside50`,
        "T": `${qualifier}.${type}.tackles`
      }
    case "nrl":
      return {
        "PTS": `${qualifier}.${type}.points`,
        "T": `${qualifier}.${type}.tries`,
        'G': `${qualifier}.${type}.goals`,
        'FG': `${qualifier}.${type}.fieldGoals`,
        'POS%': `${qualifier}.${type}.possessionPercentage`,
        'CR%': `${qualifier}.${type}.setCompletionPercentage`,
        'RM': `${qualifier}.${type}.allRunMetres`
      }
    default:
      return {};
  }
}

export const SCREENER_TEAM_SCORING_STATS = (league, qualifier, type) =>
  SUPPORTED_LEAGUES[league]?.screenerTeamScoringStats?.(qualifier, type) ?? {};

export const SCREENER_PLAYER_SCORING_STATS = (league, qualifier, position) => {
  switch(league) {
    case "nba":
    case "wnba":
    case "ncaab":
      return {
        "PTS": `${qualifier}.points`,
        "FTA": `${qualifier}.freeThrowAttempts`,
        "FTM": `${qualifier}.freeThrowsMade`,
        "FT%": `${qualifier}.freeThrowPercentage`,
        "FGA": `${qualifier}.fieldGoalAttempts`,
        "FGM": `${qualifier}.fieldGoalsMade`,
        "FG%": `${qualifier}.fieldGoalPercentage`,
        "3PTA": `${qualifier}.threePointAttempts`,
        "3PTM": `${qualifier}.threePointsMade`,
        "3PT%": `${qualifier}.threePointPercentage`,
        "TS%": `${qualifier}.trueShootingPercentage`,
        "eFG%": `${qualifier}.effectiveFieldGoalPercentage`,
        "REB": `${qualifier}.rebounds`,
        "AST": `${qualifier}.assists`,
        "STL": `${qualifier}.steals`,
        "TO": `${qualifier}.turnovers`,
        "BLK": `${qualifier}.blocks`,
        "MIN": `${qualifier}.minutesPlayed`
      };
    case "nhl":
      if (position === "G") {
        return {
          "WINS": `${qualifier}.wins`,
          "SA": `${qualifier}.shotsAgainst`,
          "SAVES": `${qualifier}.shotsSaved`,
          "SV%": `${qualifier}.savePercentage`,
          "GA": `${qualifier}.goalsAllowed`,
          "SHUTOUTS": `${qualifier}.shutouts`
        }
      }
      return {
        "PTS": `${qualifier}.points`,
        "G": `${qualifier}.goals`,
        "A": `${qualifier}.assists`,
        "SOG": `${qualifier}.shotsOnGoal`,
        "SAT": `${qualifier}.shotAttempts`,
        "PPP": `${qualifier}.powerplayPoints`,
        "SHP": `${qualifier}.shorthandedPoints`,
        "PIM": `${qualifier}.penaltyMinutes`,
        "BLK": `${qualifier}.defensiveBlocks`,
        "TOI": `${qualifier}.timeOnIce`
      }
    case "nfl":
    case "ncaaf":
      const passingPlayerStatsColumns = {
          "Pass Rtg": `${qualifier}.rating`,
          "Comp": `${qualifier}.passingCompletions`,
          "Pass Att": `${qualifier}.passingAttempts`,
          "Pass Yds": `${qualifier}.passingYards`,
          "Pass TD": `${qualifier}.passingTouchdowns`,
          "INT": `${qualifier}.interceptions`,
          "Pass Yds/Att": `${qualifier}.yardsPerAttempt`,
          "RZ Pass Att": `${qualifier}.redzonePassingAttempts`,
          "RZ Pass Comp": `${qualifier}.redzoneCompletions`,
          "RZ Pass TD": `${qualifier}.redzonePassingTouchdowns`
      };

      const rushingPlayerStatsColumns = {
          "Rush Att": `${qualifier}.rushingAttempts`,
          "Rush Yds": `${qualifier}.rushingYards`,
          "Rush TD": `${qualifier}.rushingTouchdowns`,
          "Rush Yds/Att": `${qualifier}.rushingYardsPerAttempt`,
          "Long": `${qualifier}.longestRun`,
          "RZ Rush Att": `${qualifier}.redzoneRushingAttempts`,
          "RZ Rush TD": `${qualifier}.redzoneRushingTouchdowns`
      };

      const receivingPlayerStatsColumns = {
          "Tgt": `${qualifier}.targets`,
          "Rec": `${qualifier}.receptions`,
          "Rec Yds": `${qualifier}.receivingYards`,
          "Rec TD": `${qualifier}.receivingTouchdowns`,
          "Rec Yds/Rec": `${qualifier}.receivingYardsPerReception`,
          "RZ Tgt": `${qualifier}.redzoneTargets`,
          "RZ Rec": `${qualifier}.redzoneReceptions`,
          "RZ Rec TD": `${qualifier}.redzoneReceivingTouchdowns`
      };

      const kickingPlayerStatsColumns = {
          "PTS": `${qualifier}.pointsKicked`,
          "FGA": `${qualifier}.fieldGoalAttempts`,
          "FGM": `${qualifier}.fieldGoalsMade`,
          "FG%": `${qualifier}.fieldGoalPercentage`,
          "XPA": `${qualifier}.extraPointAttempts`,
          "XPM": `${qualifier}.extraPointsMade`,
          "XP%": `${qualifier}.extraPointPercentage`,
          "FG (0-19)": `${qualifier}.extraShortRangeFieldGoals`,
          "FG (20-29)": `${qualifier}.shortRangeFieldGoals`,
          "FG (30-39)": `${qualifier}.mediumRangeFieldGoals`,
          "FG (40-49)": `${qualifier}.longRangeFieldGoals`,
          "FG (50+)": `${qualifier}.extraLongRangeFieldGoals`
      };

      if (position === "QB") {
          return Object.assign({}, passingPlayerStatsColumns, rushingPlayerStatsColumns);
      }
      if (position === "RB") {
          return Object.assign({}, rushingPlayerStatsColumns, receivingPlayerStatsColumns);
      }
      if (position === "WR" || position === "TE") {
          return Object.assign({}, receivingPlayerStatsColumns, rushingPlayerStatsColumns);
      }
      if (position === "K") {
          return kickingPlayerStatsColumns;
      }
      return Object.assign({}, passingPlayerStatsColumns, receivingPlayerStatsColumns, rushingPlayerStatsColumns, kickingPlayerStatsColumns);
    case "mlb":
      if (position === "SP" || position === "RP") {
          return {
            "W": `${qualifier}.pitching.wins`,
            "L": `${qualifier}.pitching.losses`,
            "IP": `${qualifier}.pitching.inningsPitched`,
            "ERA": `${qualifier}.pitching.earnedRunsAverage`,
            "SV": `${qualifier}.pitching.saves`,
            "H": `${qualifier}.pitching.hits`,
            "R": `${qualifier}.pitching.runs`,
            "HR": `${qualifier}.pitching.homeRuns`,
            "ER": `${qualifier}.pitching.earnedRuns`,
            "BB": `${qualifier}.pitching.walks`,
            "SO": `${qualifier}.pitching.strikeouts`,
            "WHIP": `${qualifier}.pitching.walksAndHitsPerInningPitched`,
            "AVG": `${qualifier}.pitching.battingAverageAgainst`
          };
      } else {
          return {
            "AB": `${qualifier}.hitting.atBats`,
            "R": `${qualifier}.hitting.runs`,
            "H": `${qualifier}.hitting.hits`,
            "1B": `${qualifier}.hitting.singles`,
            "2B": `${qualifier}.hitting.doubles`,
            "3B": `${qualifier}.hitting.triples`,
            "HR": `${qualifier}.hitting.homeRuns`,
            "ISO": `${qualifier}.hitting.isolatedPower`,
            "RBI": `${qualifier}.hitting.runsBattedIn`,
            "TB": `${qualifier}.hitting.totalBases`,
            "BB": `${qualifier}.hitting.walks`,
            "SO": `${qualifier}.hitting.strikeouts`,
            "AVG": `${qualifier}.hitting.battingAverage`,
            "OPS": `${qualifier}.hitting.onBasePlusSluggingPercentage`
          };
      }
      return {};
    case "bundesliga":
    case "epl":
    case "laliga":
    case "ligue1":
    case "seriea":
    case "brazil-serie-a":
    case "mls":
    case "euro":
    case "ucl":
    case "uel":
    case "fifa-world-cup":
      if (position.toLowerCase() === "goalkeeper") {
        return {
          "GA": `${qualifier}.goalsConceded`,
          "SAV": `${qualifier}.shotsFacedSaved`,
          "SA": `${qualifier}.shotsFacedTotal`,
          "PS": `${qualifier}.penaltiesSaved`,
          "DSAV": `${qualifier}.divingSaves`,
          "CS": `${qualifier}.cleanSheet`,
          "YEL": `${qualifier}.yellowCards`,
          "2YELRED": `${qualifier}.doubleYellowRedCards`,
          "RED": `${qualifier}.redCards`
        }
      }
      return {
        "G": `${qualifier}.goals`,
        "A": `${qualifier}.assists`,
        "SOT": `${qualifier}.shotsOnTarget`,
        "SHO": `${qualifier}.totalShots`,
        "MIN": `${qualifier}.minutesPlayed`,
        // "CC": `${qualifier}.chancesCreated`,
        "PAS": `${qualifier}.totalPasses`,
        "DRI": `${qualifier}.dribblesCompleted`,
        "LOP": `${qualifier}.lossOfPossession`,
        "TCK": `${qualifier}.totalTackles`,
        "FLS": `${qualifier}.foulsCommitted`,
        "INT": `${qualifier}.interceptions`,
        "YEL": `${qualifier}.yellowCards`,
        "2YELRED": `${qualifier}.yellowRedCards`,
        "RED": `${qualifier}.redCards`
      }
    case "afl":
      return {
        "PTS": `${qualifier}.points`,
        "G": `${qualifier}.goals`,
        "B": `${qualifier}.behinds`,
        "D": `${qualifier}.disposals`,
        "H": `${qualifier}.handballs`,
        "HO": `${qualifier}.hitouts`,
        "K": `${qualifier}.kicks`,
        "M": `${qualifier}.marks`,
        "T": `${qualifier}.tackles`
      }
    case "nrl":
      return {
        "PTS": `${qualifier}.points`,
        "T": `${qualifier}.tries`,
        'G': `${qualifier}.goals`,
        'FG': `${qualifier}.fieldGoals`,
        'RM': `${qualifier}.allRunMetres`
      }
    default:
      return {};
  }
}

export const DEFAULT_MARKET_TEXT = "--";

export const DEFAULT_HIT_RECORD_ENTRY = {
  games: 0,
  hits: 0,
  misses: 0,
  pushes: 0,
  hitRate: 0
}


const SOCCER_DISCOVERY_BEST_BETS = {
  'Goals & Assists': {betTypes: ['GOALS', 'GOAL_OR_ASSIST', 'ASSISTS'], icon: 'soccer-ball', type: 'player'},
  'Shots': {betTypes: ['SHOTS', 'SHOTS_ON_TARGET'], icon: 'target', type: 'player'},
  'Results': {betTypes: ['MONEY_LINE', 'WIN_TO_NIL', 'DOUBLE_CHANCE'], icon: 'trophy', type: 'team'},
  'Totals': {betTypes: ['GAME_TOTAL', 'TEAM_TOTAL', 'BOTH_TEAMS_TO_SCORE'], icon: 'score', type: 'team'}
}

const BASKETBALL_DISCOVERY_BEST_BETS = {
  Points: {betTypes: ['POINTS', 'POINTS_PLUS_ASSISTS', 'POINTS_PLUS_ASSISTS_PLUS_REBOUNDS', 'POINTS_PLUS_REBOUNDS'], icon: 'basketball', type: 'player'},
  Assists: {betTypes: ['ASSISTS', 'POINTS_PLUS_ASSISTS', 'POINTS_PLUS_ASSISTS_PLUS_REBOUNDS', 'ASSISTS_PLUS_REBOUNDS'], icon: 'target', type: 'player'},
  Rebounds: {betTypes: ['REBOUNDS', 'ASSISTS_PLUS_REBOUNDS', 'POINTS_PLUS_ASSISTS_PLUS_REBOUNDS', 'POINTS_PLUS_REBOUNDS'], icon: 'hoop', type: 'player'},
  '3PTM': {betTypes: ['THREE_POINTS_MADE'], icon: '3ptm', type: 'player'},
  Results: {betTypes: ['MONEY_LINE', 'SPREAD'], icon: 'trophy', type: 'team'},
  Totals: {betTypes: ['GAME_TOTAL', 'TEAM_TOTAL'], icon: 'score', type: 'team'}
}

const FOOTBALL_DISCOVERY_BEST_BEST = {
  TD: {betTypes: ['ANYTIME_TOUCHDOWN'], icon: 'touchdown', type: 'player'},
  Yards: {betTypes: ['PASSING_YARDS', 'RUSHING_YARDS'], icon: 'yards', type: 'player'},
  Receptions: {betTypes: ['RECEPTIONS'], icon: 'football', type: 'player'},
  Attempts: {betTypes: ['RUSHING_ATTEMPTS', 'PASSING_ATTEMPTS'], icon: 'helmet', type: 'player'},
  Results: {betTypes: ['MONEY_LINE', 'SPREAD'], icon: 'trophy', type: 'team'},
  Totals: {betTypes: ['GAME_TOTAL', 'TEAM_TOTAL'], icon: 'score', type: 'team'}
}

// The position filter is based on the back-end configuration
const SOCCER_DISCOVERY_LEADERS = [
  {title: 'Goals', subtitle: 'Forwards', filters: {position: 'Forwards', qualifier: 'Total'}, sortingColumn: 'G', sortingOrder: 'desc', icon: 'icons/betTypes/soccer-ball'},
  {title: 'Shots', subtitle: 'Outfielders', filters: {position: 'Outfielders', qualifier: 'Total'}, sortingColumn: 'SHO', sortingOrder: 'desc', icon: 'icons/betTypes/target'},
  {title: 'Saves', subtitle: 'Goalies', filters: {position: 'Goalies', qualifier: 'Total'}, sortingColumn: 'SAV', sortingOrder: 'desc', icon: 'icons/betTypes/mitt'},
  {title: 'Tackles', subtitle: 'Defenders', filters: {position: 'Defenders', qualifier: 'Total'}, sortingColumn: 'TCK', sortingOrder: 'desc', icon: 'icons/betTypes/tackle'},
  {title: 'Passes', subtitle: 'Midfielders', filters: {position: 'Midfielders', qualifier: 'Total'}, sortingColumn: 'PAS', sortingOrder: 'desc', icon: 'icons/betTypes/passes'},
  {title: 'Shots on Target', subtitle: 'Outfielders', filters: {position: 'Outfielders', qualifier: 'Total'}, sortingColumn: 'SOT', sortingOrder: 'desc', icon: 'icons/betTypes/target'},
]

const BASKETBALL_DISCOVERY_LEADERS = [
  {title: 'Points', subtitle: 'Players', filters: {qualifier: 'Total'}, sortingColumn: 'PTS', sortingOrder: 'desc', icon: 'icons/betTypes/basketball'},
  {title: 'Rebounds', subtitle: 'Players', filters: {qualifier: 'Total'}, sortingColumn: 'REB', sortingOrder: 'desc', icon: 'icons/betTypes/hoop'},
  {title: '3PTM', subtitle: 'Players', filters: {qualifier: 'Total'}, sortingColumn: '3PTM', sortingOrder: 'desc', icon: 'icons/betTypes/3ptm'},
  {title: 'Assists', subtitle: 'Players', filters: {qualifier: 'Total'}, sortingColumn: 'AST', sortingOrder: 'desc', icon: 'icons/betTypes/target'},
  {title: 'Steals', subtitle: 'Players', filters: {qualifier: 'Total'}, sortingColumn: 'STL', sortingOrder: 'desc', icon: 'icons/betTypes/steal'},
  {title: 'Blocks', subtitle: 'Players', filters: {qualifier: 'Total'}, sortingColumn: 'BLK', sortingOrder: 'desc', icon: 'icons/betTypes/block'}
]

const FOOTBALL_DISCOVERY_LEADERS = [
  {title: 'Redzone Targets', subtitle: 'Wide Receivers', filters: {position: 'WR', qualifier: 'Total'}, sortingColumn: 'REC RZ TGT', sortingOrder: 'desc', icon: 'icons/betTypes/target'},
  {title: 'Redzone Attempts', subtitle: 'Running Backs', filters: {position: 'RB', qualifier: 'Total'}, sortingColumn: 'RUSH RZ ATT', sortingOrder: 'desc', icon: 'icons/betTypes/helmet'},
  {title: 'Passing Yards', subtitle: 'Quarterbacks', filters: {position: 'QB', qualifier: 'Total'}, sortingColumn: 'PASS YDS', sortingOrder: 'desc', icon: 'icons/betTypes/yards'},
  {title: 'Receiving Yards', subtitle: 'Wide Receivers', filters: {position: 'WR', qualifier: 'Total'}, sortingColumn: 'REC YDS', sortingOrder: 'desc', icon: 'icons/betTypes/yards'},
  {title: 'Rushing Yards', subtitle: 'Running Backs', filters: {position: 'RB', qualifier: 'Total'}, sortingColumn: 'RUSH YDS', sortingOrder: 'desc', icon: 'icons/betTypes/yards'},
  {title: 'Redzone Targets', subtitle: 'Tight Ends', filters: {position: 'TE', qualifier: 'Total'}, sortingColumn: 'REC RZ TGT', sortingOrder: 'desc', icon: 'icons/betTypes/target'},
]

const DISCOVERY_BEST_BETS_GROUPING_BY_LEAGUE = {
  mlb: {
    Hits: {betTypes: ['HITTER_HITS', 'HITTER_HITS_PLUS_RUNS_PLUS_RUNS_BATTED_IN'], icon: 'bat', type: 'player'},
    'Total Bases': {betTypes: ['HITTER_TOTAL_BASES'], icon: 'bases', type: 'player'},
    RBI: {betTypes: ['HITTER_RUNS_BATTED_IN', 'HITTER_HITS_PLUS_RUNS_PLUS_RUNS_BATTED_IN'], icon: 'baseball', type: 'player'},
    Strikeouts: {betTypes: ['PITCHER_STRIKEOUTS'], icon: 'hand', type: 'player'},
    Results: {betTypes: ['MONEY_LINE', 'SPREAD'], icon: 'trophy', type: 'team'},
    Totals: {betTypes: ['GAME_TOTAL', 'TEAM_TOTAL'], icon: 'score', type: 'team'}
  },
  nba: BASKETBALL_DISCOVERY_BEST_BETS,
  wnba: BASKETBALL_DISCOVERY_BEST_BETS,
  ncaab: BASKETBALL_DISCOVERY_BEST_BETS,
  nfl: FOOTBALL_DISCOVERY_BEST_BEST,
  ncaaf: FOOTBALL_DISCOVERY_BEST_BEST,
  nhl: {
    'Goals & Assists': {betTypes: ['ANYTIME_GOAL_SCORER', 'ASSISTS'], icon: 'puck', type: 'player'},
    'Shots on Goal': {betTypes: ['SHOTS_ON_GOAL'], icon: 'target', type: 'player'},
    'Points': {betTypes: ['POINTS', 'POWERPLAY_POINTS'], icon: 'hockey-sticks', type: 'player'},
    'Powerplay Points': {betTypes: ['POWERPLAY_POINTS'], icon: 'whistle', type: 'player'},
    Results: {betTypes: ['MONEY_LINE', 'SPREAD'], icon: 'trophy', type: 'team'},
    Totals: {betTypes: ['GAME_TOTAL', 'TEAM_TOTAL'], icon: 'score', type: 'team'}
  },
  bundesliga: SOCCER_DISCOVERY_BEST_BETS,
  epl: SOCCER_DISCOVERY_BEST_BETS,
  laliga: SOCCER_DISCOVERY_BEST_BETS,
  ligue1: SOCCER_DISCOVERY_BEST_BETS,
  seriea: SOCCER_DISCOVERY_BEST_BETS,
  "brazil-serie-a": SOCCER_DISCOVERY_BEST_BETS,
  mls: SOCCER_DISCOVERY_BEST_BETS,
  euro: SOCCER_DISCOVERY_BEST_BETS,
  ucl: SOCCER_DISCOVERY_BEST_BETS,
  uel: SOCCER_DISCOVERY_BEST_BETS,
  "fifa-world-cup": SOCCER_DISCOVERY_BEST_BETS,
  afl: {
    Results: {betTypes: ['MONEY_LINE', 'SPREAD'], icon: 'trophy', type: 'team'},
    Totals: {betTypes: ['GAME_TOTAL'], icon: 'score', type: 'team'}
  },
  nrl: {
    Results: {betTypes: ['MONEY_LINE', 'SPREAD'], icon: 'trophy', type: 'team'},
    Totals: {betTypes: ['GAME_TOTAL', 'TEAM_TOTAL'], icon: 'score', type: 'team'}
  }
};

// Note: Changes here affect web and app
const DISCOVERY_LEADERS_BY_LEAGUE = {
  mlb: [
    {title: 'Home Runs', subtitle: 'Hitters', filters: {position: 'Hitters', qualifier: 'Total'}, sortingColumn: 'HR', sortingOrder: 'desc', icon: 'icons/betTypes/bat'},
    {title: 'Strikeouts', subtitle: 'Pitchers', filters: {position: 'Pitchers', qualifier: 'Total'}, sortingColumn: 'SO', sortingOrder: 'desc', icon: 'icons/betTypes/hand'},
    {title: 'Runs Batted In', subtitle: 'Hitters', filters: {position: 'Hitters', qualifier: 'Total'}, sortingColumn: 'RBI', sortingOrder: 'desc', icon: 'icons/betTypes/baseball'},
    {title: 'Hits Allowed', subtitle: 'Pitchers', filters: {position: 'Pitchers', qualifier: 'Total'}, sortingColumn: 'H', sortingOrder: 'asc', icon: 'icons/betTypes/hand'},
    {title: 'Hits', subtitle: 'Hitters', filters: {position: 'Hitters', qualifier: 'Total'}, sortingColumn: 'H', sortingOrder: 'desc', icon: 'icons/betTypes/bat'},
    {title: 'Earned Runs', subtitle: 'Pitchers', filters: {position: 'Pitchers', qualifier: 'Total'}, sortingColumn: 'ER', sortingOrder: 'asc', icon: 'icons/betTypes/bases'}
  ],
  nba: BASKETBALL_DISCOVERY_LEADERS,
  wnba: BASKETBALL_DISCOVERY_LEADERS,
  ncaab: BASKETBALL_DISCOVERY_LEADERS,
  nfl: FOOTBALL_DISCOVERY_LEADERS,
  ncaaf: FOOTBALL_DISCOVERY_LEADERS,
  nhl: [
    {title: 'Goals', subtitle: 'Skaters', filters: {position: 'Skaters', qualifier: 'Total'}, sortingColumn: 'G', sortingOrder: 'desc', icon: 'icons/betTypes/puck'},
    {title: 'Shots on Goal', subtitle: 'Skaters', filters: {position: 'Skaters', qualifier: 'Total'}, sortingColumn: 'SOG', sortingOrder: 'desc', icon: 'icons/betTypes/target'},
    {title: 'Saves', subtitle: 'Goalies', filters: {position: 'G', qualifier: 'Total'}, sortingColumn: 'SAVES', sortingOrder: 'desc', icon: 'icons/betTypes/mitt'},
    {title: 'Points', subtitle: 'Skaters', filters: {position: 'Skaters', qualifier: 'Total'}, sortingColumn: 'PTS', sortingOrder: 'desc', icon: 'icons/betTypes/hockey-sticks'},
    {title: 'Powerplay Points', subtitle: 'Skaters', filters: {position: 'Skaters', qualifier: 'Total'}, sortingColumn: 'PPP', sortingOrder: 'desc', icon: 'icons/betTypes/whistle'},
    {title: 'Blocked Shots', subtitle: 'Defense', filters: {position: 'D', qualifier: 'Total'}, sortingColumn: 'BLK', sortingOrder: 'desc', icon: 'icons/betTypes/block'},
  ],
  bundesliga: SOCCER_DISCOVERY_LEADERS,
  epl: SOCCER_DISCOVERY_LEADERS,
  laliga: SOCCER_DISCOVERY_LEADERS,
  ligue1: SOCCER_DISCOVERY_LEADERS,
  seriea: SOCCER_DISCOVERY_LEADERS,
  "brazil-serie-a": SOCCER_DISCOVERY_LEADERS,
  mls: SOCCER_DISCOVERY_LEADERS,
  euro: SOCCER_DISCOVERY_LEADERS,
  ucl: SOCCER_DISCOVERY_LEADERS,
  uel: SOCCER_DISCOVERY_LEADERS,
  "fifa-world-cup": SOCCER_DISCOVERY_LEADERS,
  afl: [
    {title: 'Goals', subtitle: 'Players', filters: {qualifier: 'Total'}, sortingColumn: 'G', sortingOrder: 'desc', icon: 'icons/betTypes/afl-goals'},
    {title: 'Behinds', subtitle: 'Players', filters: {qualifier: 'Total'}, sortingColumn: 'B', sortingOrder: 'desc', icon: 'icons/betTypes/behinds'},
    {title: 'Points', subtitle: 'Players', filters: {qualifier: 'Total'}, sortingColumn: 'PTS', sortingOrder: 'desc', icon: 'icons/betTypes/afl-points'},
    {title: 'Disposals', subtitle: 'Players', filters: {qualifier: 'Total'}, sortingColumn: 'D', sortingOrder: 'desc', icon: 'icons/betTypes/disposals'},
    {title: 'Marks', subtitle: 'Players', filters: {qualifier: 'Total'}, sortingColumn: 'M', sortingOrder: 'desc', icon: 'icons/betTypes/marks'},
    {title: 'Tackles', subtitle: 'Players', filters: {qualifier: 'Total'}, sortingColumn: 'T', sortingOrder: 'desc', icon: 'icons/betTypes/afl-tackles'},
  ],
  nrl: [
    {title: 'Tries', subtitle: 'Players', filters: {qualifier: 'Total'}, sortingColumn: 'T', sortingOrder: 'desc', icon: 'icons/betTypes/tries'},
    {title: 'Points', subtitle: 'Players', filters: {qualifier: 'Total'}, sortingColumn: 'PTS', sortingOrder: 'desc', icon: 'icons/betTypes/nrl-points'},
    {title: 'Goals', subtitle: 'Players', filters: {qualifier: 'Total'}, sortingColumn: 'G', sortingOrder: 'desc', icon: 'icons/betTypes/nrl-goals'},
  ]
};

const FOOTBALL_LEADERBOARD_TEAM_COLUMNS = ({ qualifier, type }) => ({
  "GP": "gamesPlayed",
  "PTS": `${qualifier}.${type}.points`,
  "S%": `${qualifier}.${type}.scorePercentage`,
  "PLAYS": `${qualifier}.${type}.plays`,
  "YDS": `${qualifier}.${type}.totalYards`,
  "TD": `${qualifier}.${type}.totalTouchdowns`,
  "1D": `${qualifier}.${type}.firstDowns`,
  "3D%": `${qualifier}.${type}.thirdDownConversionPercentage`,
  "4D%": `${qualifier}.${type}.fourthDownConversionPercentage`,
  "RZ%": `${qualifier}.${type}.redzoneSuccessRate`,
  "PASS YDS": `${qualifier}.${type}.passingYards`,
  "PASS ATT": `${qualifier}.${type}.passingAttempts`,
  "PASS COMP": `${qualifier}.${type}.passingCompletions`,
  "PASS TD": `${qualifier}.${type}.passingTouchdowns`,
  "RUSH YDS": `${qualifier}.${type}.rushingYards`,
  "RUSH ATT": `${qualifier}.${type}.rushingAttempts`,
  "RUSH TD": `${qualifier}.${type}.rushingTouchdowns`,
  "INT": `${qualifier}.${type}.interceptions`,
  "TO": `${qualifier}.${type}.turnovers`,
  "FUML": `${qualifier}.${type}.fumblesLost`,
  "SK": `${qualifier}.${type}.sacks`
});

const NHL_LEADERBOARD_TEAM_COLUMNS = ({ qualifier, type }) => {
  const columns = {
    "GP": "gamesPlayed",
    "G": `${qualifier}.${type}.goals`,
    "SOG": `${qualifier}.${type}.shotsOnGoal`,
    "SAT": `${qualifier}.${type}.shotAttempts`,
    "CF%": `${qualifier}.${type}.corsiPercentage`,
    "BLK": `${qualifier}.${type}.offensiveBlocks`,
    "PIM": `${qualifier}.${type}.penaltyMinutes`
  };

  if (type === "offensive") {
    columns["PPG"] = `${qualifier}.${type}.powerplayGoals`;
    columns["PP%"] = `${qualifier}.${type}.powerplayPercentage`;
  } else {
    columns["SHG"] = `${qualifier}.offensive.shorthandedGoals`;
    columns["SH%"] = `${qualifier}.offensive.penaltyKillPercentage`;
  }

  return columns;
};

const BASKETBALL_LEADERBOARD_TEAM_COLUMNS = ({ qualifier, type }) => ({
  "GP": "gamesPlayed",
  "PTS": `${qualifier}.${type}.points`,
  "FTM": `${qualifier}.${type}.freeThrowsMade`,
  "FTA": `${qualifier}.${type}.freeThrowAttempts`,
  "FT%": `${qualifier}.${type}.freeThrowPercentage`,
  "FGM": `${qualifier}.${type}.fieldGoalsMade`,
  "FGA": `${qualifier}.${type}.fieldGoalAttempts`,
  "FG%": `${qualifier}.${type}.fieldGoalPercentage`,
  "3PTM": `${qualifier}.${type}.threePointsMade`,
  "3PTA": `${qualifier}.${type}.threePointAttempts`,
  "3PT%": `${qualifier}.${type}.threePointPercentage`,
  "TS%": `${qualifier}.${type}.trueShootingPercentage`,
  "EFG%": `${qualifier}.${type}.effectiveFieldGoalPercentage`,
  "TRB": `${qualifier}.${type}.rebounds`,
  "AST": `${qualifier}.${type}.assists`,
  "STL": `${qualifier}.${type}.steals`,
  "TO": `${qualifier}.${type}.turnovers`,
  "BLK": `${qualifier}.${type}.blocks`
});

const MLB_LEADERBOARD_TEAM_COLUMNS = ({ qualifier, type }) => ({
  "GP": "gamesPlayed",
  "R": `${qualifier}.${type}.runs`,
  "H": `${qualifier}.${type}.hits`,
  "1B": `${qualifier}.${type}.singles`,
  "2B": `${qualifier}.${type}.doubles`,
  "3B": `${qualifier}.${type}.triples`,
  "TB": `${qualifier}.${type}.totalBases`,
  "ER": `${qualifier}.${type}.earnedRuns`,
  "HR": `${qualifier}.${type}.homeRuns`,
  "RBI": `${qualifier}.${type}.runsBattedIn`,
  "BB": `${qualifier}.${type}.walks`,
  "SO": `${qualifier}.${type}.strikeouts`,
  "AVG": `${qualifier}.${type}.battingAverage`,
  "OBP": `${qualifier}.${type}.onBasePercentage`,
  "SLG": `${qualifier}.${type}.sluggingPercentage`,
  "OPS": `${qualifier}.${type}.onBasePlusSluggingPercentage`
});

const SOCCER_LEADERBOARD_TEAM_COLUMNS = ({ qualifier, type }) => ({
  "GP": "gamesPlayed",
  "G": `${qualifier}.${type}.goals`,
  "POS": `${qualifier}.${type}.ballPossession`,
  "SHO": `${qualifier}.${type}.shotsTotal`,
  "SOT": `${qualifier}.${type}.shotsOnTarget`,
  "COR": `${qualifier}.${type}.cornerKicks`,
  "OFF": `${qualifier}.${type}.offsides`,
  "FLS": `${qualifier}.${type}.fouls`,
  "2YELRED": `${qualifier}.${type}.doubleYellowRedCards`,
  "YEL": `${qualifier}.${type}.yellowCards`,
  "RED": `${qualifier}.${type}.redCards`
});

const AFL_LEADERBOARD_TEAM_COLUMNS = ({ qualifier, type }) => ({
  "GP": "gamesPlayed",
  "PTS": `${qualifier}.${type}.points`,
  "G": `${qualifier}.${type}.goals`,
  "B": `${qualifier}.${type}.behinds`,
  "D": `${qualifier}.${type}.disposals`,
  "FK": `${qualifier}.${type}.freeKicks`,
  "H": `${qualifier}.${type}.handballs`,
  "HO": `${qualifier}.${type}.hitouts`,
  "K": `${qualifier}.${type}.kicks`,
  "M": `${qualifier}.${type}.marks`,
  "MI50": `${qualifier}.${type}.marksInside50`,
  "T": `${qualifier}.${type}.tackles`
});

const NRL_LEADERBOARD_TEAM_COLUMNS = ({ qualifier, type }) => ({
  "GP": "gamesPlayed",
  "PTS": `${qualifier}.${type}.points`,
  "T": `${qualifier}.${type}.tries`,
  "G": `${qualifier}.${type}.goals`,
  "FG": `${qualifier}.${type}.fieldGoals`,
  "1PT": `${qualifier}.${type}.onePointFieldGoals`,
  "2PT": `${qualifier}.${type}.twoPointFieldGoals`,
  "POS%": `${qualifier}.${type}.possessionPercentage`,
  "CS": `${qualifier}.${type}.completeSets`,
  "IS": `${qualifier}.${type}.incompleteSets`,
  "CR%": `${qualifier}.${type}.setCompletionPercentage`,
  "S": `${qualifier}.${type}.supports`,
  "LB": `${qualifier}.${type}.lineBreaks`,
  "TB": `${qualifier}.${type}.tackleBreaks`,
  "AVG": `${qualifier}.${type}.averageSetDistance`,
  "R": `${qualifier}.${type}.allRuns`,
  "RM": `${qualifier}.${type}.allRunMetres`,
  "KR": `${qualifier}.${type}.kickReturns`,
  "KRM": `${qualifier}.${type}.kickReturnMetres`,
  "K": `${qualifier}.${type}.totalKicks`,
  "KM": `${qualifier}.${type}.totalKickMetres`,
  "CM": `${qualifier}.${type}.conversionsMade`,
  "CA": `${qualifier}.${type}.conversionAttempts`,
  "C%": `${qualifier}.${type}.conversionPercentage`,
  "40/20": `${qualifier}.${type}.fortyTwentyKicks`,
  "20/40": `${qualifier}.${type}.twentyFortyKicks`,
  "GK": `${qualifier}.${type}.grubberKicks`,
  "BK": `${qualifier}.${type}.bombKicks`,
  "CFK": `${qualifier}.${type}.crossFieldKicks`
});

const LEADERBOARD_TEAM_COLUMNS_BY_LEAGUE = {
  nfl: FOOTBALL_LEADERBOARD_TEAM_COLUMNS,
  ncaaf: FOOTBALL_LEADERBOARD_TEAM_COLUMNS,
  nhl: NHL_LEADERBOARD_TEAM_COLUMNS,
  nba: BASKETBALL_LEADERBOARD_TEAM_COLUMNS,
  wnba: BASKETBALL_LEADERBOARD_TEAM_COLUMNS,
  ncaab: BASKETBALL_LEADERBOARD_TEAM_COLUMNS,
  mlb: MLB_LEADERBOARD_TEAM_COLUMNS,
  bundesliga: SOCCER_LEADERBOARD_TEAM_COLUMNS,
  epl: SOCCER_LEADERBOARD_TEAM_COLUMNS,
  laliga: SOCCER_LEADERBOARD_TEAM_COLUMNS,
  ligue1: SOCCER_LEADERBOARD_TEAM_COLUMNS,
  seriea: SOCCER_LEADERBOARD_TEAM_COLUMNS,
  "brazil-serie-a": SOCCER_LEADERBOARD_TEAM_COLUMNS,
  mls: SOCCER_LEADERBOARD_TEAM_COLUMNS,
  euro: SOCCER_LEADERBOARD_TEAM_COLUMNS,
  ucl: SOCCER_LEADERBOARD_TEAM_COLUMNS,
  uel: SOCCER_LEADERBOARD_TEAM_COLUMNS,
  "fifa-world-cup": SOCCER_LEADERBOARD_TEAM_COLUMNS,
  afl: AFL_LEADERBOARD_TEAM_COLUMNS,
  nrl: NRL_LEADERBOARD_TEAM_COLUMNS,
};

const FOOTBALL_LEADERBOARD_PLAYER_COLUMNS = ({ qualifier, position }) => {
  const passingStats = {
    "GP": "gamesPlayed",
    "PASS RTG": `${qualifier}.rating`,
    "PASS COMP": `${qualifier}.passingCompletions`,
    "PASS ATT": `${qualifier}.passingAttempts`,
    "PASS YDS": `${qualifier}.passingYards`,
    "PASS TD": `${qualifier}.passingTouchdowns`,
    "INT": `${qualifier}.interceptions`,
    "PASS YDS/ATT": `${qualifier}.yardsPerAttempt`,
    "300+ YDS": `${qualifier}.threeHundredYardsPassing`,
    "PASS RZ ATT": `${qualifier}.redzonePassingAttempts`,
    "PASS RZ COMPL": `${qualifier}.redzoneCompletions`,
    "PASS RZ TD": `${qualifier}.redzonePassingTouchdowns`
  };

  const rushingStats = {
    "GP": "gamesPlayed",
    "RUSH ATT": `${qualifier}.rushingAttempts`,
    "RUSH YDS": `${qualifier}.rushingYards`,
    "RUSH TD": `${qualifier}.rushingTouchdowns`,
    "RUSH YDS/ATT": `${qualifier}.rushingYardsPerAttempt`,
    "RUSH LONG": `${qualifier}.longestRun`,
    "RUSH 100+ YDS": `${qualifier}.hundredYardsRushing`,
    "RUSH RZ ATT": `${qualifier}.redzoneRushingAttempts`,
    "RUSH RZ TD": `${qualifier}.redzoneRushingTouchdowns`,
    "FUML": `${qualifier}.fumblesLost`
  };

  const receivingStats = {
    "GP": "gamesPlayed",
    "REC TGT": `${qualifier}.targets`,
    "REC": `${qualifier}.receptions`,
    "REC YDS": `${qualifier}.receivingYards`,
    "REC TD": `${qualifier}.receivingTouchdowns`,
    "REC YDS/REC": `${qualifier}.receivingYardsPerReception`,
    "REC 100+ YDS": `${qualifier}.hundredYardsReceiving`,
    "REC RZ TGT": `${qualifier}.redzoneTargets`,
    "REC RZ REC": `${qualifier}.redzoneReceptions`,
    "REC RZ TD": `${qualifier}.redzoneReceivingTouchdowns`,
    "FUML": `${qualifier}.fumblesLost`
  };

  const kickingStats = {
    "GP": "gamesPlayed",
    "PTS": `${qualifier}.pointsKicked`,
    "FGA": `${qualifier}.fieldGoalAttempts`,
    "FGM": `${qualifier}.fieldGoalsMade`,
    "FG%": `${qualifier}.fieldGoalPercentage`,
    "XPA": `${qualifier}.extraPointAttempts`,
    "XPM": `${qualifier}.extraPointsMade`,
    "XP%": `${qualifier}.extraPointPercentage`,
    "FG (0-19)": `${qualifier}.extraShortRangeFieldGoals`,
    "FG (20-29)": `${qualifier}.shortRangeFieldGoals`,
    "FG (30-39)": `${qualifier}.mediumRangeFieldGoals`,
    "FG (40-49)": `${qualifier}.longRangeFieldGoals`,
    "FG (50+)": `${qualifier}.extraLongRangeFieldGoals`
  };

  switch (position) {
    case "QB":
      return Object.assign({}, passingStats, rushingStats);
    case "RB":
      return Object.assign({}, rushingStats, receivingStats);
    case "WR":
    case "TE":
      return Object.assign({}, receivingStats, rushingStats);
    case "K":
      return kickingStats;
    default:
      return {};
  }
};

const NHL_LEADERBOARD_PLAYER_COLUMNS = ({ qualifier, position }) => {
  if (position === "G") {
    return {
      "GP": "gamesPlayed",
      "WINS": `${qualifier}.wins`,
      "SA": `${qualifier}.shotsAgainst`,
      "SAVES": `${qualifier}.shotsSaved`,
      "SV%": `${qualifier}.savePercentage`,
      "GA": `${qualifier}.goalsAllowed`,
      "SHUTOUTS": `${qualifier}.shutouts`
    };
  }

  return {
    "GP": "gamesPlayed",
    "PTS": `${qualifier}.points`,
    "G": `${qualifier}.goals`,
    "A": `${qualifier}.assists`,
    "SOG": `${qualifier}.shotsOnGoal`,
    "SAT": `${qualifier}.shotAttempts`,
    "TOI": `${qualifier}.timeOnIce`,
    "+/-": `${qualifier}.plusMinus`,
    "PPP": `${qualifier}.powerplayPoints`,
    "SHP": `${qualifier}.shorthandedPoints`,
    "PIM": `${qualifier}.penaltyMinutes`,
    "BLK": `${qualifier}.defensiveBlocks`
  };
};

const BASKETBALL_LEADERBOARD_PLAYER_COLUMNS = ({ qualifier }) => ({
  "GP": "gamesPlayed",
  "PTS": `${qualifier}.points`,
  "FTM": `${qualifier}.freeThrowsMade`,
  "FTA": `${qualifier}.freeThrowAttempts`,
  "FT%": `${qualifier}.freeThrowPercentage`,
  "FGM": `${qualifier}.fieldGoalsMade`,
  "FGA": `${qualifier}.fieldGoalAttempts`,
  "FG%": `${qualifier}.fieldGoalPercentage`,
  "3PTM": `${qualifier}.threePointsMade`,
  "3PTA": `${qualifier}.threePointAttempts`,
  "3PT%": `${qualifier}.threePointPercentage`,
  "TS%": `${qualifier}.trueShootingPercentage`,
  "EFG%": `${qualifier}.effectiveFieldGoalPercentage`,
  "REB": `${qualifier}.rebounds`,
  "AST": `${qualifier}.assists`,
  "STL": `${qualifier}.steals`,
  "TO": `${qualifier}.turnovers`,
  "BLK": `${qualifier}.blocks`,
  "MIN": `${qualifier}.minutesPlayed`,
  "USAGE %": `${qualifier}.usagePercentage`
});

const MLB_LEADERBOARD_PLAYER_COLUMNS = ({ qualifier, position }) => {
  if (position.toUpperCase() === "PITCHERS") {
    return {
      "GP": "gamesPlayed",
      "W": `${qualifier}.pitching.wins`,
      "L": `${qualifier}.pitching.losses`,
      "ERA": `${qualifier}.pitching.earnedRunsAverage`,
      "SV": `${qualifier}.pitching.saves`,
      "H": `${qualifier}.pitching.hits`,
      "R": `${qualifier}.pitching.runs`,
      "HR": `${qualifier}.pitching.homeRuns`,
      "1B": `${qualifier}.pitching.singles`,
      "2B": `${qualifier}.pitching.doubles`,
      "3B": `${qualifier}.pitching.triples`,
      "ER": `${qualifier}.pitching.earnedRuns`,
      "BB": `${qualifier}.pitching.walks`,
      "SO": `${qualifier}.pitching.strikeouts`,
      "WHIP": `${qualifier}.pitching.walksAndHitsPerInningPitched`,
      "AVG": `${qualifier}.pitching.battingAverageAgainst`
    };
  }

  return {
    "GP": "gamesPlayed",
    "AB": `${qualifier}.hitting.atBats`,
    "R": `${qualifier}.hitting.runs`,
    "H": `${qualifier}.hitting.hits`,
    "1B": `${qualifier}.hitting.singles`,
    "2B": `${qualifier}.hitting.doubles`,
    "3B": `${qualifier}.hitting.triples`,
    "HR": `${qualifier}.hitting.homeRuns`,
    "ISO": `${qualifier}.hitting.isolatedPower`,
    "RBI": `${qualifier}.hitting.runsBattedIn`,
    "TB": `${qualifier}.hitting.totalBases`,
    "BB": `${qualifier}.hitting.walks`,
    "SO": `${qualifier}.hitting.strikeouts`,
    "AVG": `${qualifier}.hitting.battingAverage`,
    "OBP": `${qualifier}.hitting.onBasePercentage`,
    "SLG": `${qualifier}.hitting.sluggingPercentage`,
    "OPS": `${qualifier}.hitting.onBasePlusSluggingPercentage`
  };
};

const SOCCER_LEADERBOARD_PLAYER_COLUMNS = ({ qualifier, position }) => {
  if (position.toLowerCase() === "goalies") {
    return {
      "GP": "gamesPlayed",
      "GA": `${qualifier}.goalsConceded`,
      "SAV": `${qualifier}.shotsFacedSaved`,
      "SA": `${qualifier}.shotsFacedTotal`,
      "PS": `${qualifier}.penaltiesSaved`,
      "DSAV": `${qualifier}.divingSaves`,
      "CS": `${qualifier}.cleanSheet`,
      "YEL": `${qualifier}.yellowCards`,
      "2YELRED": `${qualifier}.yellowRedCards`,
      "RED": `${qualifier}.redCards`
    };
  }

  return {
    "GP": "gamesPlayed",
    "G": `${qualifier}.goals`,
    "A": `${qualifier}.assists`,
    "SOT": `${qualifier}.shotsOnTarget`,
    "SHO": `${qualifier}.totalShots`,
    "MIN": `${qualifier}.minutesPlayed`,
    "PAS": `${qualifier}.totalPasses`,
    "DRI": `${qualifier}.dribblesCompleted`,
    "LOP": `${qualifier}.lossOfPossession`,
    "TCK": `${qualifier}.totalTackles`,
    "FLS": `${qualifier}.foulsCommitted`,
    "INT": `${qualifier}.interceptions`,
    "YEL": `${qualifier}.yellowCards`,
    "2YELRED": `${qualifier}.yellowRedCards`,
    "RED": `${qualifier}.redCards`
  };
};

const AFL_LEADERBOARD_PLAYER_COLUMNS = ({ qualifier }) => ({
  "GP": "gamesPlayed",
  "PTS": `${qualifier}.points`,
  "G": `${qualifier}.goals`,
  "B": `${qualifier}.behinds`,
  "D": `${qualifier}.disposals`,
  "H": `${qualifier}.handballs`,
  "HO": `${qualifier}.hitouts`,
  "K": `${qualifier}.kicks`,
  "M": `${qualifier}.marks`,
  "T": `${qualifier}.tackles`
});

const NRL_LEADERBOARD_PLAYER_COLUMNS = ({ qualifier }) => ({
  "GP": "gamesPlayed",
  "MIN": `${qualifier}.minutesPlayed`,
  "PTS": `${qualifier}.points`,
  "T": `${qualifier}.tries`,
  "G": `${qualifier}.goals`,
  "FG": `${qualifier}.fieldGoals`,
  "1PT": `${qualifier}.onePointFieldGoals`,
  "2PT": `${qualifier}.twoPointFieldGoals`,
  "LB": `${qualifier}.lineBreaks`,
  "TB": `${qualifier}.tackleBreaks`,
  "PCRM": `${qualifier}.postContactRunMetres`,
  "HU": `${qualifier}.hitUps`,
  "TA": `${qualifier}.tryAssists`,
  "P": `${qualifier}.passes`,
  "DP": `${qualifier}.dummyPasses`,
  "OFF": `${qualifier}.offloads`,
  "REC": `${qualifier}.allReceipts`,
  "R": `${qualifier}.allRuns`,
  "RM": `${qualifier}.allRunMetres`,
  "DHR": `${qualifier}.dummyHalfRuns`,
  "KR": `${qualifier}.kickReturns`,
  "KRM": `${qualifier}.kickReturnMetres`,
  "K": `${qualifier}.totalKicks`,
  "KM": `${qualifier}.totalKickMetres`,
  "CM": `${qualifier}.conversionsMade`,
  "CA": `${qualifier}.conversionAttempts`,
  "C%": `${qualifier}.conversionPercentage`,
  "40/20": `${qualifier}.fortyTwentyKicks`,
  "20/40": `${qualifier}.twentyFortyKicks`,
  "GK": `${qualifier}.grubberKicks`,
  "BK": `${qualifier}.bombKicks`,
  "CFK": `${qualifier}.crossFieldKicks`,
  "S": `${qualifier}.supports`,
  "DR": `${qualifier}.decoyRuns`,
});

const LEADERBOARD_PLAYER_COLUMNS_BY_LEAGUE = {
  nfl: FOOTBALL_LEADERBOARD_PLAYER_COLUMNS,
  ncaaf: FOOTBALL_LEADERBOARD_PLAYER_COLUMNS,
  nhl: NHL_LEADERBOARD_PLAYER_COLUMNS,
  nba: BASKETBALL_LEADERBOARD_PLAYER_COLUMNS,
  wnba: BASKETBALL_LEADERBOARD_PLAYER_COLUMNS,
  ncaab: BASKETBALL_LEADERBOARD_PLAYER_COLUMNS,
  mlb: MLB_LEADERBOARD_PLAYER_COLUMNS,
  bundesliga: SOCCER_LEADERBOARD_PLAYER_COLUMNS,
  epl: SOCCER_LEADERBOARD_PLAYER_COLUMNS,
  laliga: SOCCER_LEADERBOARD_PLAYER_COLUMNS,
  ligue1: SOCCER_LEADERBOARD_PLAYER_COLUMNS,
  seriea: SOCCER_LEADERBOARD_PLAYER_COLUMNS,
  "brazil-serie-a": SOCCER_LEADERBOARD_PLAYER_COLUMNS,
  mls: SOCCER_LEADERBOARD_PLAYER_COLUMNS,
  euro: SOCCER_LEADERBOARD_PLAYER_COLUMNS,
  ucl: SOCCER_LEADERBOARD_PLAYER_COLUMNS,
  uel: SOCCER_LEADERBOARD_PLAYER_COLUMNS,
  "fifa-world-cup": SOCCER_LEADERBOARD_PLAYER_COLUMNS,
  afl: AFL_LEADERBOARD_PLAYER_COLUMNS,
  nrl: NRL_LEADERBOARD_PLAYER_COLUMNS,
};

const createSoccerTeams = (colors, codeToName) => ({
  logoCodeAliases: {},
  codeToCity: codeToName,
  cityToCode: Object.fromEntries(Object.entries(codeToName).map(([code, name]) => [name, code])),
  codeToName,
  colors,
});

const NEW_SOCCER_TEAM_NAMES = {
  eredivisie: {
    AHE: 'Go Ahead Eagles', AJA: 'Ajax', ALM: 'Almere City', AZA: 'AZ Alkmaar', BRE: 'NAC Breda', FEY: 'Feyenoord', FOR: 'Fortuna Sittard', GRO: 'FC Groningen', HEE: 'SC Heerenveen', HER: 'Heracles Almelo', NEC: 'NEC Nijmegen', PSV: 'PSV Eindhoven', RKC: 'RKC Waalwijk', SPA: 'Sparta Rotterdam', TWE: 'FC Twente', UTR: 'FC Utrecht', WIL: 'Willem II', ZWO: 'PEC Zwolle',
  },
  'primera-lpf': {
    ALD: 'Aldosivi', ARG: 'Argentinos Juniors', ATU: 'Atlético Tucumán', BAN: 'Banfield', BAR: 'Barracas Central', CAB: 'Belgrano', BOC: 'Boca Juniors', CCO: 'Central Córdoba', DYJ: 'Defensa y Justicia', ELP: 'Estudiantes de La Plata', ERC: 'Estudiantes de Río Cuarto', GEM: 'Gimnasia y Esgrima Mendoza', GLP: 'Gimnasia y Esgrima La Plata', GOD: 'Godoy Cruz', HUR: 'Huracán', IND: 'Independiente', INS: 'Instituto', IRV: 'Independiente Rivadavia', LAN: 'Lanús', NOB: "Newell's Old Boys", PLA: 'Platense', RAC: 'Racing Club', RIE: 'Deportivo Riestra', RIV: 'River Plate', ROS: 'Rosario Central', SAR: 'Sarmiento', SLO: 'San Lorenzo', TAL: 'Talleres de Córdoba', TIG: 'Tigre', UNI: 'Unión de Santa Fe', VEL: 'Vélez Sarsfield',
  },
  'liga-portugal': {
    ACV: 'AVS Futebol SAD', ALV: 'FC Alverca', ARO: 'FC Arouca', BEN: 'SL Benfica', BRA: 'SC Braga', CAS: 'Casa Pia AC', CDN: 'CD Nacional', ESA: 'Estrela Amadora', EST: 'Estoril Praia', FAM: 'FC Famalicão', GIL: 'Gil Vicente FC', MAR: 'CS Marítimo', MOR: 'Moreirense FC', POR: 'FC Porto', RIO: 'Rio Ave FC', SCL: 'Santa Clara', SPO: 'Sporting CP', VSC: 'Vitória SC',
  },
  'liga-mx': {
    AME: 'Club América', ASL: 'Atlético de San Luis', ATL: 'Atlas', CDG: 'CD Guadalajara', CRA: 'Cruz Azul', JUA: 'FC Juárez', LEO: 'Club León', MAZ: 'Mazatlán FC', MON: 'CF Monterrey', NCX: 'Club Necaxa', PAC: 'CF Pachuca', PUE: 'Club Puebla', PUM: 'Pumas UNAM', QUE: 'Querétaro FC', SLA: 'Santos Laguna', TAP: 'Tampico Madero', TIG: 'Tigres UANL', TOL: 'Deportivo Toluca FC', TIJ: 'Club Tijuana',
  },
};

const EREDIVISIE_TEAMS = createSoccerTeams({
  "light": {
    "ahe": "rgba(193,2,48,1)",
    "aja": "rgba(210,18,46,1)",
    "alm": "rgba(227,0,27,1)",
    "aza": "rgba(202,0,8,1)",
    "bre": "rgba(40,40,40,1)",
    "fey": "rgba(255,1,0,1)",
    "for": "rgba(0,102,72,1)",
    "gro": "rgba(0,142,90,1)",
    "hee": "rgba(0,79,159,1)",
    "her": "rgba(0,0,0,1)",
    "nec": "rgba(230,48,39,1)",
    "psv": "rgba(240,0,0,1)",
    "rkc": "rgba(43,99,183,1)",
    "spa": "rgba(227,8,19,1)",
    "twe": "rgba(202,3,22,1)",
    "utr": "rgba(237,26,47,1)",
    "wil": "rgba(37,44,82,1)",
    "zwo": "rgba(255,1,0,1)",
    "league": "rgba(0,47,99,1)"
  },
  "dark": {
    "ahe": "rgba(255,214,0,1)",
    "aja": "rgba(210,18,46,1)",
    "alm": "rgba(227,0,27,1)",
    "aza": "rgba(202,0,8,1)",
    "bre": "rgba(255,221,37,1)",
    "fey": "rgba(255,1,0,1)",
    "for": "rgba(255,210,0,1)",
    "gro": "rgba(0,142,90,1)",
    "hee": "rgba(64,123,183,1)",
    "her": "rgba(102,102,102,1)",
    "nec": "rgba(230,48,39,1)",
    "psv": "rgba(240,0,0,1)",
    "rkc": "rgba(43,99,183,1)",
    "spa": "rgba(227,8,19,1)",
    "twe": "rgba(202,3,22,1)",
    "utr": "rgba(237,26,47,1)",
    "wil": "rgba(210,158,39,1)",
    "zwo": "rgba(106,194,238,1)",
    "league": "rgba(64,99,138,1)"
  }
}, NEW_SOCCER_TEAM_NAMES.eredivisie);

const PRIMERA_LPF_TEAMS = createSoccerTeams({
  "light": {
    "ald": "rgba(60,162,110,1)",
    "arg": "rgba(251,11,14,1)",
    "atu": "rgba(26,53,91,1)",
    "ban": "rgba(3,149,63,1)",
    "bar": "rgba(227,0,22,1)",
    "cab": "rgba(29,29,27,1)",
    "boc": "rgba(34,58,107,1)",
    "cco": "rgba(0,0,0,1)",
    "dyj": "rgba(0,114,45,1)",
    "erc": "rgba(0,139,208,1)",
    "elp": "rgba(208,50,69,1)",
    "gem": "rgba(0,0,0,1)",
    "glp": "rgba(21,21,92,1)",
    "god": "rgba(0,129,195,1)",
    "hur": "rgba(227,6,19,1)",
    "ind": "rgba(237,28,36,1)",
    "ins": "rgba(223,4,11,1)",
    "irv": "rgba(34,59,134,1)",
    "lan": "rgba(124,31,44,1)",
    "nob": "rgba(244,33,33,1)",
    "pla": "rgba(74,46,21,1)",
    "league": "rgba(19,0,75,1)",
    "rac": "rgba(2,156,220,1)",
    "rie": "rgba(38,37,38,1)",
    "riv": "rgba(237,25,45,1)",
    "ros": "rgba(10,61,114,1)",
    "sar": "rgba(0,131,73,1)",
    "slo": "rgba(226,30,45,1)",
    "tal": "rgba(4,13,45,1)",
    "tig": "rgba(237,42,60,1)",
    "uni": "rgba(237,28,36,1)",
    "vel": "rgba(40,40,40,1)"
  },
  "dark": {
    "ald": "rgba(60,162,110,1)",
    "arg": "rgba(251,11,14,1)",
    "atu": "rgba(111,174,220,1)",
    "ban": "rgba(3,149,63,1)",
    "bar": "rgba(227,0,22,1)",
    "cab": "rgba(0,159,227,1)",
    "boc": "rgba(249,187,49,1)",
    "cco": "rgba(102,102,102,1)",
    "dyj": "rgba(0,114,45,1)",
    "erc": "rgba(0,139,208,1)",
    "elp": "rgba(208,50,69,1)",
    "gem": "rgba(102,102,102,1)",
    "glp": "rgba(3,157,83,1)",
    "god": "rgba(0,129,195,1)",
    "hur": "rgba(227,6,19,1)",
    "ind": "rgba(237,28,36,1)",
    "ins": "rgba(223,4,11,1)",
    "irv": "rgba(100,118,170,1)",
    "lan": "rgba(163,98,107,1)",
    "nob": "rgba(244,33,33,1)",
    "pla": "rgba(137,119,103,1)",
    "league": "rgba(137,242,255,1)",
    "rac": "rgba(2,156,220,1)",
    "rie": "rgba(103,102,103,1)",
    "riv": "rgba(237,25,45,1)",
    "ros": "rgba(252,217,31,1)",
    "sar": "rgba(0,131,73,1)",
    "slo": "rgba(226,30,45,1)",
    "tal": "rgba(104,110,129,1)",
    "tig": "rgba(237,42,60,1)",
    "uni": "rgba(237,28,36,1)",
    "vel": "rgba(255,221,37,1)"
  }
}, NEW_SOCCER_TEAM_NAMES['primera-lpf']);

const LIGA_PORTUGAL_TEAMS = createSoccerTeams({
  "light": {
    "acv": "rgba(0,0,0,1)",
    "alv": "rgba(32,100,159,1)",
    "aro": "rgba(25,81,157,1)",
    "ben": "rgba(232,48,48,1)",
    "bra": "rgba(192,13,30,1)",
    "cas": "rgba(237,48,48,1)",
    "cdn": "rgba(127,63,152,1)",
    "esa": "rgba(0,106,65,1)",
    "est": "rgba(0,74,153,1)",
    "fam": "rgba(24,70,124,1)",
    "gil": "rgba(238,38,35,1)",
    "mar": "rgba(22,76,47,1)",
    "mor": "rgba(20,95,37,1)",
    "por": "rgba(0,66,140,1)",
    "league": "rgba(0,35,90,1)",
    "rio": "rgba(47,104,62,1)",
    "scl": "rgba(217,41,28,1)",
    "spo": "rgba(0,132,64,1)",
    "vsc": "rgba(0,0,0,1)"
  },
  "dark": {
    "acv": "rgba(102,102,102,1)",
    "alv": "rgba(239,1,13,1)",
    "aro": "rgba(255,237,0,1)",
    "ben": "rgba(232,48,48,1)",
    "bra": "rgba(205,61,75,1)",
    "cas": "rgba(237,48,48,1)",
    "cdn": "rgba(235,189,4,1)",
    "esa": "rgba(218,42,28,1)",
    "est": "rgba(255,199,3,1)",
    "fam": "rgba(246,198,5,1)",
    "gil": "rgba(238,38,35,1)",
    "mar": "rgba(92,130,109,1)",
    "mor": "rgba(175,151,19,1)",
    "por": "rgba(64,113,169,1)",
    "league": "rgba(77,101,140,1)",
    "rio": "rgba(63,175,124,1)",
    "scl": "rgba(217,41,28,1)",
    "spo": "rgba(0,132,64,1)",
      "vsc": "rgba(102,102,102,1)"
  }
}, NEW_SOCCER_TEAM_NAMES['liga-portugal']);

const LIGA_MX_TEAMS = createSoccerTeams({
  "light": {
    "ame": "rgba(0,48,85,1)",
    "asl": "rgba(204,56,35,1)",
    "atl": "rgba(236,28,36,1)",
    "cdg": "rgba(205,23,50,1)",
    "cra": "rgba(222,29,62,1)",
    "jua": "rgba(217,35,46,1)",
    "leo": "rgba(11,121,81,1)",
    "league": "rgba(22,9,150,1)",
    "maz": "rgba(83,50,120,1)",
    "mon": "rgba(10,34,64,1)",
    "ncx": "rgba(225,0,30,1)",
    "pac": "rgba(22,37,119,1)",
    "pue": "rgba(43,75,117,1)",
    "pum": "rgba(17,34,69,1)",
    "que": "rgba(0,86,179,1)",
    "sla": "rgba(0,128,102,1)",
    "tap": "rgba(90,0,0,1)",
    "tig": "rgba(1,93,170,1)",
    "tol": "rgba(211,13,43,1)",
    "tij": "rgba(237,27,38,1)"
  },
  "dark": {
    "ame": "rgba(255,235,0,1)",
    "asl": "rgba(204,56,35,1)",
    "atl": "rgba(236,28,36,1)",
    "cdg": "rgba(205,23,50,1)",
    "cra": "rgba(222,29,62,1)",
    "jua": "rgba(217,35,46,1)",
    "leo": "rgba(11,121,81,1)",
    "league": "rgba(92,83,182,1)",
    "maz": "rgba(135,112,161,1)",
    "mon": "rgba(84,100,121,1)",
    "ncx": "rgba(225,0,30,1)",
    "pac": "rgba(92,102,160,1)",
    "pue": "rgba(96,120,152,1)",
    "pum": "rgba(203,171,88,1)",
    "que": "rgba(38,111,190,1)",
    "sla": "rgba(0,128,102,1)",
    "tap": "rgba(156,102,102,1)",
    "tig": "rgba(251,175,53,1)",
    "tol": "rgba(211,13,43,1)",
    "tij": "rgba(237,27,38,1)"
  }
}, NEW_SOCCER_TEAM_NAMES['liga-mx']);

const createSoccerLeagueConfig = ({
  id,
  title,
  teams,
  scheduleFormat = SCHEDULE_FORMAT_WEEKLY,
  advancedTools = SOCCER_ADVANCED_TOOLS,
  headerGradientColor = '#085DFE',
  playbookSupported = false,
}) => {
  return {
    title,
    sport: { id: 'soccer', name: 'Soccer' },
    webIcon: 'assets/soccer-icon.svg',
    webIconSelected: 'assets/soccer-icon.svg',
    appIcon: 'icons/sports/soccer',
    appLeagueIcon: `images/logos/${id}/league.png`,
    scheduleFormat,
    gender: { determiner: 'his' },
    hasAltLines: true,
    tabPriority: 'player',
    advancedTools,
    layout: SOCCER_LAYOUT,
    headerGradientColor,
    display: SOCCER_DISPLAY,
    playbookSupported,
    signalKeys: INJURY_STARTER_SIGNAL_KEYS,
    supportsQuarterProps: false,
    supportsHalfProps: false,
    teams,
    teamBetTypeReverseMapping: SOCCER_TEAM_BET_TYPE_REVERSE_MAPPING_INTERNAL,
    playerBetTypeIdToName: SOCCER_BET_TYPE_ID_TO_NAME,
    playerBetTypesReverseMapping: SOCCER_PLAYER_BET_TYPES_REVERSE_MAPPING,
    playerPropsInfo: SOCCER_PLAYER_PROPS,
    teamModalStats: SOCCER_TEAM_MODAL_STATS,
    standingsFields: SOCCER_STANDINGS_FIELDS,
    gameSummaryStatsTemplate: SOCCER_GAME_SUMMARY_TEMPLATE,
    screenerTeamScoringStats: getSoccerScreenerTeamScoringStats,
    discoveryBestBetsGrouping: SOCCER_DISCOVERY_BEST_BETS,
    discoveryLeaders: SOCCER_DISCOVERY_LEADERS,
    leaderboardTeamColumns: SOCCER_LEADERBOARD_TEAM_COLUMNS,
    leaderboardPlayerColumns: SOCCER_LEADERBOARD_PLAYER_COLUMNS,
    teamBets: SOCCER_TEAM_BETS,
    positionalPlayerProps: SOCCER_POSITIONAL_PLAYER_PROPS,
    positionalShowcaseMarkets: soccerPositionalShowcaseMarket,
    getPlayerPositionalBetTypes: soccerGetPlayerPositionalBetTypes,
    screenerOnlyProps: SOCCER_SCREENER_ONLY_PROPS,
    getPlayerPositionalBetTypesForScreener: soccerGetPlayerPositionalBetTypes,
    legend: SOCCER_LEGEND,
    positionLegend: SOCCER_POSITION_LEGEND,
    buildRecordString: soccerBuildRecordString,
    defaultSituation: SOCCER_DEFAULT_SITUATION,
    situations: SOCCER_SITUATIONS,
    bettingTimeframeOptions: SOCCER_BETTING_TIMEFRAME_OPTIONS,
    scorePath: 'cumulativeStats.%type%.goals',
    recordConfig: SOCCER_RECORD_CONFIG,
    get playerLeaderConfig() {
      return SOCCER_PLAYER_LEADER_CONFIG;
    },
    discoveryBetByPosition: SOCCER_DISCOVERY_BET_BY_POSITION,
    supportedCrossGameParlays: SOCCER_SUPPORTED_CROSS_GAME_PARLAYS,
  };
};

export const SUPPORTED_LEAGUES = {
  mlb: {
    title: 'MLB',
    sport: { id: 'baseball', name: 'Baseball' },
    webIcon: 'assets/baseball-icon.svg',
    webIconSelected: 'assets/baseball-icon-white.svg',
    appIcon: 'icons/sports/baseball',
    appLeagueIcon: 'images/logos/mlb/league.png',
    scheduleFormat: SCHEDULE_FORMAT_DAILY,
    gender: { determiner: 'his' },
    hasAltLines: true,
    tabPriority: 'player',

    advancedTools: ['opponent_rank', 'starting_pitchers', 'weather_report'],
    layout: { weatherReport: 'default', lineupMode: 'baseball' },
    headerGradientColor: '#051D42',
    display: CITY_NAME_DISPLAY,
    playbookSupported: true,
    signalKeys: MLB_SIGNAL_KEYS,
    supportsQuarterProps: false,
    supportsHalfProps: false,
    teams: MLB_TEAMS,
    teamBetTypeReverseMapping: TEAM_BET_TYPE_REVERSE_MAPPING_BY_LEAGUE.mlb,
    playerBetTypeIdToName: PLAYER_BET_TYPE_ID_TO_NAME_BY_LEAGUE.mlb,
    playerBetTypesReverseMapping: PLAYER_BET_TYPES_REVERSE_MAPPING_BY_LEAGUE.mlb,
    playerPropsInfo: PLAYER_PROPS_INFO.mlb,
    teamModalStats: TEAM_MODAL_STATS_BY_LEAGUE.mlb,
    standingsFields: STANDINGS_FIELDS_BY_LEAGUE.mlb,
    gameSummaryStatsTemplate: GAME_SUMMARY_STATS_TEMPLATES_BY_LEAGUE.mlb,
    screenerTeamScoringStats: (qualifier, type) => getScreenerTeamScoringStatsByLeague('mlb', qualifier, type),
    discoveryBestBetsGrouping: DISCOVERY_BEST_BETS_GROUPING_BY_LEAGUE.mlb,
    discoveryLeaders: DISCOVERY_LEADERS_BY_LEAGUE.mlb,
    leaderboardTeamColumns: LEADERBOARD_TEAM_COLUMNS_BY_LEAGUE.mlb,
    leaderboardPlayerColumns: LEADERBOARD_PLAYER_COLUMNS_BY_LEAGUE.mlb,
    teamBets: TEAM_BETS_BY_LEAGUE.mlb,
    positionalPlayerProps: POSITIONAL_PLAYER_PROPS_BY_LEAGUE.mlb,
    positionalShowcaseMarkets: POSITIONAL_SHOWCASE_MARKETS_BY_LEAGUE.mlb,
    getPlayerPositionalBetTypes: PLAYER_POSITIONAL_BET_TYPES_BY_LEAGUE.mlb,
    screenerOnlyProps: SCREENER_ONLY_PROPS_BY_LEAGUE.mlb,
    getPlayerPositionalBetTypesForScreener: PLAYER_POSITIONAL_BET_TYPES_FOR_SCREENER_BY_LEAGUE.mlb,
    legend: LEGENDS_BY_LEAGUE.mlb,
    positionLegend: POSITION_LEGEND_BY_LEAGUE.mlb,
    buildRecordString: BUILD_RECORD_STRING_BY_LEAGUE.mlb,
    defaultSituation: DEFAULT_SITUATIONS_BY_LEAGUE.mlb,
    situations: SITUATIONS_BY_LEAGUE.mlb,
    bettingTimeframeOptions: BETTING_TIMEFRAME_OPTIONS_BY_LEAGUE.mlb,
    playerPropsInfoMode: 'mlb_situational',
    scorePath: 'cumulativeStats.%type%.runs',

    recordConfig: {
      standingsFields: ['wins', 'losses'],
      gameRecordDrawField: null,
      gameRecordDrawLabel: null,
      scoreStat: 'runs',
      graphKeys: ['W', 'L'],
    },
    get playerLeaderConfig() {
      return MLB_PLAYER_LEADER_CONFIG;
    },
    discoveryBetByPosition: MLB_DISCOVERY_BET_BY_POSITION,
    supportedCrossGameParlays: MLB_SUPPORTED_CROSS_GAME_PARLAYS,
  },

  nba: {
    title: 'NBA',
    sport: { id: 'basketball', name: 'Basketball' },
    webIcon: 'assets/basketball-icon.svg',
    webIconSelected: 'assets/basketball-icon-white.svg',
    appIcon: 'icons/sports/basketball',
    appLeagueIcon: 'images/logos/nba/league.png',
    scheduleFormat: SCHEDULE_FORMAT_DAILY,
    gender: { determiner: 'his' },
    hasAltLines: true,
    tabPriority: 'player',

    advancedTools: ['starting_lineups', 'injury_impact', 'opponent_rank'],
    layout: { weatherReport: 'default', lineupMode: 'shared' },
    headerGradientColor: '#00438C',
    display: CITY_NAME_DISPLAY,
    playbookSupported: false,
    signalKeys: INJURY_STARTER_SIGNAL_KEYS,
    supportsQuarterProps: true,
    supportsHalfProps: false,
    teams: NBA_TEAMS,
    teamBetTypeReverseMapping: TEAM_BET_TYPE_REVERSE_MAPPING_BY_LEAGUE.nba,
    playerBetTypeIdToName: PLAYER_BET_TYPE_ID_TO_NAME_BY_LEAGUE.nba,
    playerBetTypesReverseMapping: PLAYER_BET_TYPES_REVERSE_MAPPING_BY_LEAGUE.nba,
    playerPropsInfo: PLAYER_PROPS_INFO.nba,
    teamModalStats: TEAM_MODAL_STATS_BY_LEAGUE.nba,
    standingsFields: STANDINGS_FIELDS_BY_LEAGUE.nba,
    gameSummaryStatsTemplate: GAME_SUMMARY_STATS_TEMPLATES_BY_LEAGUE.nba,
    screenerTeamScoringStats: (qualifier, type) => getScreenerTeamScoringStatsByLeague('nba', qualifier, type),
    discoveryBestBetsGrouping: DISCOVERY_BEST_BETS_GROUPING_BY_LEAGUE.nba,
    discoveryLeaders: DISCOVERY_LEADERS_BY_LEAGUE.nba,
    leaderboardTeamColumns: LEADERBOARD_TEAM_COLUMNS_BY_LEAGUE.nba,
    leaderboardPlayerColumns: LEADERBOARD_PLAYER_COLUMNS_BY_LEAGUE.nba,
    teamBets: TEAM_BETS_BY_LEAGUE.nba,
    positionalPlayerProps: POSITIONAL_PLAYER_PROPS_BY_LEAGUE.nba,
    positionalShowcaseMarkets: POSITIONAL_SHOWCASE_MARKETS_BY_LEAGUE.nba,
    getPlayerPositionalBetTypes: PLAYER_POSITIONAL_BET_TYPES_BY_LEAGUE.nba,
    screenerOnlyProps: SCREENER_ONLY_PROPS_BY_LEAGUE.nba,
    getPlayerPositionalBetTypesForScreener: PLAYER_POSITIONAL_BET_TYPES_FOR_SCREENER_BY_LEAGUE.nba,
    legend: LEGENDS_BY_LEAGUE.nba,
    positionLegend: POSITION_LEGEND_BY_LEAGUE.nba,
    buildRecordString: BUILD_RECORD_STRING_BY_LEAGUE.nba,
    defaultSituation: DEFAULT_SITUATIONS_BY_LEAGUE.nba,
    situations: SITUATIONS_BY_LEAGUE.nba,
    bettingTimeframeOptions: BETTING_TIMEFRAME_OPTIONS_BY_LEAGUE.nba,
    scorePath: 'cumulativeStats.%type%.points',

    recordConfig: BASKETBALL_RECORD_CONFIG,
    get playerLeaderConfig() {
      return BASKETBALL_PLAYER_LEADER_CONFIG;
    },
    discoveryBetByPosition: BASKETBALL_DISCOVERY_BET_BY_POSITION,
    supportedCrossGameParlays: BASKETBALL_SUPPORTED_CROSS_GAME_PARLAYS,
  },

  wnba: {
    title: 'WNBA',
    sport: { id: 'basketball', name: 'Basketball' },
    webIcon: 'assets/basketball-icon.svg',
    webIconSelected: 'assets/basketball-icon-white.svg',
    appIcon: 'icons/sports/basketball',
    appLeagueIcon: 'images/logos/wnba/league.png',
    scheduleFormat: SCHEDULE_FORMAT_DAILY,
    gender: { determiner: 'her' },
    hasAltLines: true,
    tabPriority: 'player',

    advancedTools: ['starting_lineups', 'injury_impact', 'opponent_rank'],
    layout: { weatherReport: 'default', lineupMode: 'shared' },
    headerGradientColor: '#FA4D00',
    display: CITY_NAME_DISPLAY,
    playbookSupported: true,
    signalKeys: INJURY_STARTER_SIGNAL_KEYS,
    supportsQuarterProps: true,
    supportsHalfProps: false,
    teams: WNBA_TEAMS,
    teamBetTypeReverseMapping: TEAM_BET_TYPE_REVERSE_MAPPING_BY_LEAGUE.wnba,
    playerBetTypeIdToName: PLAYER_BET_TYPE_ID_TO_NAME_BY_LEAGUE.wnba,
    playerBetTypesReverseMapping: PLAYER_BET_TYPES_REVERSE_MAPPING_BY_LEAGUE.wnba,
    playerPropsInfo: PLAYER_PROPS_INFO.wnba,
    teamModalStats: TEAM_MODAL_STATS_BY_LEAGUE.wnba,
    standingsFields: STANDINGS_FIELDS_BY_LEAGUE.wnba,
    gameSummaryStatsTemplate: GAME_SUMMARY_STATS_TEMPLATES_BY_LEAGUE.wnba,
    screenerTeamScoringStats: (qualifier, type) => getScreenerTeamScoringStatsByLeague('wnba', qualifier, type),
    discoveryBestBetsGrouping: DISCOVERY_BEST_BETS_GROUPING_BY_LEAGUE.wnba,
    discoveryLeaders: DISCOVERY_LEADERS_BY_LEAGUE.wnba,
    leaderboardTeamColumns: LEADERBOARD_TEAM_COLUMNS_BY_LEAGUE.wnba,
    leaderboardPlayerColumns: LEADERBOARD_PLAYER_COLUMNS_BY_LEAGUE.wnba,
    teamBets: TEAM_BETS_BY_LEAGUE.wnba,
    positionalPlayerProps: POSITIONAL_PLAYER_PROPS_BY_LEAGUE.wnba,
    positionalShowcaseMarkets: POSITIONAL_SHOWCASE_MARKETS_BY_LEAGUE.wnba,
    getPlayerPositionalBetTypes: PLAYER_POSITIONAL_BET_TYPES_BY_LEAGUE.wnba,
    screenerOnlyProps: SCREENER_ONLY_PROPS_BY_LEAGUE.wnba,
    getPlayerPositionalBetTypesForScreener: PLAYER_POSITIONAL_BET_TYPES_FOR_SCREENER_BY_LEAGUE.wnba,
    legend: LEGENDS_BY_LEAGUE.wnba,
    positionLegend: POSITION_LEGEND_BY_LEAGUE.wnba,
    buildRecordString: BUILD_RECORD_STRING_BY_LEAGUE.wnba,
    defaultSituation: DEFAULT_SITUATIONS_BY_LEAGUE.wnba,
    situations: SITUATIONS_BY_LEAGUE.wnba,
    bettingTimeframeOptions: BETTING_TIMEFRAME_OPTIONS_BY_LEAGUE.wnba,
    scorePath: 'cumulativeStats.%type%.points',

    recordConfig: BASKETBALL_RECORD_CONFIG,
    get playerLeaderConfig() {
      return BASKETBALL_PLAYER_LEADER_CONFIG;
    },
    discoveryBetByPosition: BASKETBALL_DISCOVERY_BET_BY_POSITION,
    supportedCrossGameParlays: BASKETBALL_SUPPORTED_CROSS_GAME_PARLAYS,
  },

  ncaab: {
    title: 'NCAAB',
    sport: { id: 'basketball', name: 'Basketball' },
    webIcon: 'assets/basketball-icon.svg',
    webIconSelected: 'assets/basketball-icon-white.svg',
    appIcon: 'icons/sports/basketball',
    appLeagueIcon: 'images/logos/ncaab/league.png',
    scheduleFormat: SCHEDULE_FORMAT_DAILY,
    gender: { determiner: 'his' },
    hasAltLines: true,
    tabPriority: 'team',

    advancedTools: ['starting_lineups', 'injury_impact', 'opponent_rank'],
    layout: { weatherReport: 'default', lineupMode: 'shared' },
    headerGradientColor: '#45A5E1',
    display: CITY_NAME_DISPLAY,
    playbookSupported: false,
    signalKeys: INJURY_STARTER_SIGNAL_KEYS,
    supportsQuarterProps: false,
    supportsHalfProps: true,
    teams: NCAAB_TEAMS,
    teamBetTypeReverseMapping: TEAM_BET_TYPE_REVERSE_MAPPING_BY_LEAGUE.ncaab,
    playerBetTypeIdToName: PLAYER_BET_TYPE_ID_TO_NAME_BY_LEAGUE.ncaab,
    playerBetTypesReverseMapping: PLAYER_BET_TYPES_REVERSE_MAPPING_BY_LEAGUE.ncaab,
    playerPropsInfo: PLAYER_PROPS_INFO.ncaab,
    teamModalStats: TEAM_MODAL_STATS_BY_LEAGUE.ncaab,
    standingsFields: STANDINGS_FIELDS_BY_LEAGUE.ncaab,
    gameSummaryStatsTemplate: GAME_SUMMARY_STATS_TEMPLATES_BY_LEAGUE.ncaab,
    screenerTeamScoringStats: (qualifier, type) => getScreenerTeamScoringStatsByLeague('ncaab', qualifier, type),
    discoveryBestBetsGrouping: DISCOVERY_BEST_BETS_GROUPING_BY_LEAGUE.ncaab,
    discoveryLeaders: DISCOVERY_LEADERS_BY_LEAGUE.ncaab,
    leaderboardTeamColumns: LEADERBOARD_TEAM_COLUMNS_BY_LEAGUE.ncaab,
    leaderboardPlayerColumns: LEADERBOARD_PLAYER_COLUMNS_BY_LEAGUE.ncaab,
    teamBets: TEAM_BETS_BY_LEAGUE.ncaab,
    positionalPlayerProps: POSITIONAL_PLAYER_PROPS_BY_LEAGUE.ncaab,
    positionalShowcaseMarkets: POSITIONAL_SHOWCASE_MARKETS_BY_LEAGUE.ncaab,
    getPlayerPositionalBetTypes: PLAYER_POSITIONAL_BET_TYPES_BY_LEAGUE.ncaab,
    screenerOnlyProps: SCREENER_ONLY_PROPS_BY_LEAGUE.ncaab,
    getPlayerPositionalBetTypesForScreener: PLAYER_POSITIONAL_BET_TYPES_FOR_SCREENER_BY_LEAGUE.ncaab,
    legend: LEGENDS_BY_LEAGUE.ncaab,
    positionLegend: POSITION_LEGEND_BY_LEAGUE.ncaab,
    buildRecordString: BUILD_RECORD_STRING_BY_LEAGUE.ncaab,
    defaultSituation: DEFAULT_SITUATIONS_BY_LEAGUE.ncaab,
    situations: SITUATIONS_BY_LEAGUE.ncaab,
    bettingTimeframeOptions: BETTING_TIMEFRAME_OPTIONS_BY_LEAGUE.ncaab,
    scorePath: 'cumulativeStats.%type%.points',

    recordConfig: BASKETBALL_RECORD_CONFIG,
    get playerLeaderConfig() {
      return BASKETBALL_PLAYER_LEADER_CONFIG;
    },
    discoveryBetByPosition: BASKETBALL_DISCOVERY_BET_BY_POSITION,
    supportedCrossGameParlays: BASKETBALL_SUPPORTED_CROSS_GAME_PARLAYS,
  },

  nfl: {
    title: 'NFL',
    sport: { id: 'football', name: 'Football' },
    webIcon: 'assets/football-icon.svg',
    webIconSelected: 'assets/football-icon-white.svg',
    appIcon: 'icons/sports/football',
    appLeagueIcon: 'images/logos/nfl/league.png',
    scheduleFormat: SCHEDULE_FORMAT_WEEKLY,
    gender: { determiner: 'his' },
    hasAltLines: true,
    tabPriority: 'player',

    advancedTools: ['injury_impact', 'opponent_rank', 'weather_report'],
    layout: { weatherReport: 'stacked', lineupMode: null },
    headerGradientColor: '#013369',
    display: CITY_NAME_DISPLAY,
    playbookSupported: true,
    signalKeys: NFL_SIGNAL_KEYS,
    supportsQuarterProps: true,
    supportsHalfProps: false,
    teams: NFL_TEAMS,
    teamBetTypeReverseMapping: TEAM_BET_TYPE_REVERSE_MAPPING_BY_LEAGUE.nfl,
    playerBetTypeIdToName: PLAYER_BET_TYPE_ID_TO_NAME_BY_LEAGUE.nfl,
    playerBetTypesReverseMapping: PLAYER_BET_TYPES_REVERSE_MAPPING_BY_LEAGUE.nfl,
    playerPropsInfo: PLAYER_PROPS_INFO.nfl,
    teamModalStats: TEAM_MODAL_STATS_BY_LEAGUE.nfl,
    standingsFields: STANDINGS_FIELDS_BY_LEAGUE.nfl,
    gameSummaryStatsTemplate: GAME_SUMMARY_STATS_TEMPLATES_BY_LEAGUE.nfl,
    screenerTeamScoringStats: (qualifier, type) => getScreenerTeamScoringStatsByLeague('nfl', qualifier, type),
    discoveryBestBetsGrouping: DISCOVERY_BEST_BETS_GROUPING_BY_LEAGUE.nfl,
    discoveryLeaders: DISCOVERY_LEADERS_BY_LEAGUE.nfl,
    leaderboardTeamColumns: LEADERBOARD_TEAM_COLUMNS_BY_LEAGUE.nfl,
    leaderboardPlayerColumns: LEADERBOARD_PLAYER_COLUMNS_BY_LEAGUE.nfl,
    teamBets: TEAM_BETS_BY_LEAGUE.nfl,
    positionalPlayerProps: POSITIONAL_PLAYER_PROPS_BY_LEAGUE.nfl,
    positionalShowcaseMarkets: POSITIONAL_SHOWCASE_MARKETS_BY_LEAGUE.nfl,
    getPlayerPositionalBetTypes: PLAYER_POSITIONAL_BET_TYPES_BY_LEAGUE.nfl,
    screenerOnlyProps: SCREENER_ONLY_PROPS_BY_LEAGUE.nfl,
    getPlayerPositionalBetTypesForScreener: PLAYER_POSITIONAL_BET_TYPES_FOR_SCREENER_BY_LEAGUE.nfl,
    legend: LEGENDS_BY_LEAGUE.nfl,
    positionLegend: POSITION_LEGEND_BY_LEAGUE.nfl,
    buildRecordString: BUILD_RECORD_STRING_BY_LEAGUE.nfl,
    defaultSituation: DEFAULT_SITUATIONS_BY_LEAGUE.nfl,
    situations: SITUATIONS_BY_LEAGUE.nfl,
    bettingTimeframeOptions: BETTING_TIMEFRAME_OPTIONS_BY_LEAGUE.nfl,
    scorePath: 'cumulativeStats.%type%.points',

    recordConfig: {
      standingsFields: ['wins', 'losses', 'ties'],
      gameRecordDrawField: 'tie',
      gameRecordDrawLabel: 'TIE',
      scoreStat: 'points',
      graphKeys: ['W', 'L', 'T'],
    },
    get playerLeaderConfig() {
      return FOOTBALL_PLAYER_LEADER_CONFIG;
    },
    discoveryBetByPosition: FOOTBALL_DISCOVERY_BET_BY_POSITION,
    supportedCrossGameParlays: FOOTBALL_SUPPORTED_CROSS_GAME_PARLAYS,
  },

  ncaaf: {
    title: 'NCAAF',
    sport: { id: 'football', name: 'Football' },
    webIcon: 'assets/football-icon.svg',
    webIconSelected: 'assets/football-icon-white.svg',
    appIcon: 'icons/sports/football',
    appLeagueIcon: 'images/logos/ncaaf/league.png',
    scheduleFormat: SCHEDULE_FORMAT_WEEKLY,
    gender: { determiner: 'his' },
    hasAltLines: true,
    tabPriority: 'player',

    advancedTools: ['injury_impact', 'opponent_rank'],
    layout: {},
    headerGradientColor: '#45A5E1',
    display: CITY_NAME_DISPLAY,
    playbookSupported: false,
    signalKeys: NCAAF_SIGNAL_KEYS,
    supportsQuarterProps: true,
    supportsHalfProps: false,
    teams: NCAAF_TEAMS,
    teamBetTypeReverseMapping: TEAM_BET_TYPE_REVERSE_MAPPING_BY_LEAGUE.ncaaf,
    playerBetTypeIdToName: PLAYER_BET_TYPE_ID_TO_NAME_BY_LEAGUE.ncaaf,
    playerBetTypesReverseMapping: PLAYER_BET_TYPES_REVERSE_MAPPING_BY_LEAGUE.ncaaf,
    playerPropsInfo: PLAYER_PROPS_INFO.ncaaf,
    teamModalStats: TEAM_MODAL_STATS_BY_LEAGUE.ncaaf,
    standingsFields: STANDINGS_FIELDS_BY_LEAGUE.ncaaf,
    gameSummaryStatsTemplate: GAME_SUMMARY_STATS_TEMPLATES_BY_LEAGUE.ncaaf,
    screenerTeamScoringStats: (qualifier, type) => getScreenerTeamScoringStatsByLeague('ncaaf', qualifier, type),
    discoveryBestBetsGrouping: DISCOVERY_BEST_BETS_GROUPING_BY_LEAGUE.ncaaf,
    discoveryLeaders: DISCOVERY_LEADERS_BY_LEAGUE.ncaaf,
    leaderboardTeamColumns: LEADERBOARD_TEAM_COLUMNS_BY_LEAGUE.ncaaf,
    leaderboardPlayerColumns: LEADERBOARD_PLAYER_COLUMNS_BY_LEAGUE.ncaaf,
    teamBets: TEAM_BETS_BY_LEAGUE.ncaaf,
    positionalPlayerProps: POSITIONAL_PLAYER_PROPS_BY_LEAGUE.ncaaf,
    positionalShowcaseMarkets: POSITIONAL_SHOWCASE_MARKETS_BY_LEAGUE.ncaaf,
    getPlayerPositionalBetTypes: PLAYER_POSITIONAL_BET_TYPES_BY_LEAGUE.ncaaf,
    screenerOnlyProps: SCREENER_ONLY_PROPS_BY_LEAGUE.ncaaf,
    getPlayerPositionalBetTypesForScreener: PLAYER_POSITIONAL_BET_TYPES_FOR_SCREENER_BY_LEAGUE.ncaaf,
    legend: LEGENDS_BY_LEAGUE.ncaaf,
    positionLegend: POSITION_LEGEND_BY_LEAGUE.ncaaf,
    buildRecordString: BUILD_RECORD_STRING_BY_LEAGUE.ncaaf,
    defaultSituation: DEFAULT_SITUATIONS_BY_LEAGUE.ncaaf,
    situations: SITUATIONS_BY_LEAGUE.ncaaf,
    bettingTimeframeOptions: BETTING_TIMEFRAME_OPTIONS_BY_LEAGUE.ncaaf,
    scorePath: 'cumulativeStats.%type%.points',

    recordConfig: FOOTBALL_RECORD_CONFIG,
    get playerLeaderConfig() {
      return FOOTBALL_PLAYER_LEADER_CONFIG;
    },
    discoveryBetByPosition: FOOTBALL_DISCOVERY_BET_BY_POSITION,
    supportedCrossGameParlays: FOOTBALL_SUPPORTED_CROSS_GAME_PARLAYS,
  },

  afl: {
    title: 'AFL',
    sport: { id: 'australian-football', name: 'Australian Rules Football' },
    appIcon: 'icons/sports/rugby',
    appLeagueIcon: 'images/logos/afl/league.png',
    scheduleFormat: SCHEDULE_FORMAT_WEEKLY,
    gender: { determiner: 'his' },
    hasAltLines: false,
    tabPriority: 'team',

    advancedTools: ['opponent_rank'],
    layout: {},
    headerGradientColor: '#00529B',
    display: NAME_ONLY_CITY_DISPLAY,
    playbookSupported: false,
    signalKeys: NO_EXTRA_SIGNAL_KEYS,
    supportsQuarterProps: false,
    supportsHalfProps: false,
    teams: AFL_TEAMS,
    teamBetTypeReverseMapping: TEAM_BET_TYPE_REVERSE_MAPPING_BY_LEAGUE.afl,
    playerBetTypeIdToName: PLAYER_BET_TYPE_ID_TO_NAME_BY_LEAGUE.afl,
    playerBetTypesReverseMapping: PLAYER_BET_TYPES_REVERSE_MAPPING_BY_LEAGUE.afl,
    playerPropsInfo: PLAYER_PROPS_INFO.afl,
    teamModalStats: TEAM_MODAL_STATS_BY_LEAGUE.afl,
    standingsFields: STANDINGS_FIELDS_BY_LEAGUE.afl,
    gameSummaryStatsTemplate: GAME_SUMMARY_STATS_TEMPLATES_BY_LEAGUE.afl,
    screenerTeamScoringStats: (qualifier, type) => getScreenerTeamScoringStatsByLeague('afl', qualifier, type),
    discoveryBestBetsGrouping: DISCOVERY_BEST_BETS_GROUPING_BY_LEAGUE.afl,
    discoveryLeaders: DISCOVERY_LEADERS_BY_LEAGUE.afl,
    leaderboardTeamColumns: LEADERBOARD_TEAM_COLUMNS_BY_LEAGUE.afl,
    leaderboardPlayerColumns: LEADERBOARD_PLAYER_COLUMNS_BY_LEAGUE.afl,
    teamBets: TEAM_BETS_BY_LEAGUE.afl,
    positionalPlayerProps: POSITIONAL_PLAYER_PROPS_BY_LEAGUE.afl,
    positionalShowcaseMarkets: POSITIONAL_SHOWCASE_MARKETS_BY_LEAGUE.afl,
    getPlayerPositionalBetTypes: PLAYER_POSITIONAL_BET_TYPES_BY_LEAGUE.afl,
    screenerOnlyProps: SCREENER_ONLY_PROPS_BY_LEAGUE.afl,
    getPlayerPositionalBetTypesForScreener: PLAYER_POSITIONAL_BET_TYPES_FOR_SCREENER_BY_LEAGUE.afl,
    legend: LEGENDS_BY_LEAGUE.afl,
    positionLegend: POSITION_LEGEND_BY_LEAGUE.afl,
    buildRecordString: BUILD_RECORD_STRING_BY_LEAGUE.afl,
    defaultSituation: DEFAULT_SITUATIONS_BY_LEAGUE.afl,
    situations: SITUATIONS_BY_LEAGUE.afl,
    bettingTimeframeOptions: BETTING_TIMEFRAME_OPTIONS_BY_LEAGUE.afl,
    scorePath: 'cumulativeStats.%type%.points',

    recordConfig: {
      standingsFields: ['wins', 'losses', 'draws'],
      gameRecordDrawField: 'draw',
      gameRecordDrawLabel: 'D',
      scoreStat: 'points',
      graphKeys: ['W', 'L', 'D'],
    },
    get playerLeaderConfig() {
      return AFL_PLAYER_LEADER_CONFIG;
    },
    discoveryBetByPosition: null,
    supportedCrossGameParlays: AFL_SUPPORTED_CROSS_GAME_PARLAYS,
  },

  nrl: {
    title: 'NRL',
    sport: { id: 'rugby', name: 'Rugby' },
    appIcon: 'icons/sports/rugby',
    appLeagueIcon: 'images/logos/nrl/league.png',
    scheduleFormat: SCHEDULE_FORMAT_WEEKLY,
    gender: { determiner: 'his' },
    hasAltLines: false,
    tabPriority: 'team',

    advancedTools: ['opponent_rank'],
    layout: {},
    headerGradientColor: '#00D470',
    display: NAME_ONLY_CITY_DISPLAY,
    playbookSupported: false,
    signalKeys: NO_EXTRA_SIGNAL_KEYS,
    supportsQuarterProps: false,
    supportsHalfProps: false,
    teams: NRL_TEAMS,
    teamBetTypeReverseMapping: TEAM_BET_TYPE_REVERSE_MAPPING_BY_LEAGUE.nrl,
    playerBetTypeIdToName: PLAYER_BET_TYPE_ID_TO_NAME_BY_LEAGUE.nrl,
    playerBetTypesReverseMapping: PLAYER_BET_TYPES_REVERSE_MAPPING_BY_LEAGUE.nrl,
    playerPropsInfo: PLAYER_PROPS_INFO.nrl,
    teamModalStats: TEAM_MODAL_STATS_BY_LEAGUE.nrl,
    standingsFields: STANDINGS_FIELDS_BY_LEAGUE.nrl,
    gameSummaryStatsTemplate: GAME_SUMMARY_STATS_TEMPLATES_BY_LEAGUE.nrl,
    screenerTeamScoringStats: (qualifier, type) => getScreenerTeamScoringStatsByLeague('nrl', qualifier, type),
    discoveryBestBetsGrouping: DISCOVERY_BEST_BETS_GROUPING_BY_LEAGUE.nrl,
    discoveryLeaders: DISCOVERY_LEADERS_BY_LEAGUE.nrl,
    leaderboardTeamColumns: LEADERBOARD_TEAM_COLUMNS_BY_LEAGUE.nrl,
    leaderboardPlayerColumns: LEADERBOARD_PLAYER_COLUMNS_BY_LEAGUE.nrl,
    teamBets: TEAM_BETS_BY_LEAGUE.nrl,
    positionalPlayerProps: POSITIONAL_PLAYER_PROPS_BY_LEAGUE.nrl,
    positionalShowcaseMarkets: POSITIONAL_SHOWCASE_MARKETS_BY_LEAGUE.nrl,
    getPlayerPositionalBetTypes: PLAYER_POSITIONAL_BET_TYPES_BY_LEAGUE.nrl,
    screenerOnlyProps: SCREENER_ONLY_PROPS_BY_LEAGUE.nrl,
    getPlayerPositionalBetTypesForScreener: PLAYER_POSITIONAL_BET_TYPES_FOR_SCREENER_BY_LEAGUE.nrl,
    legend: LEGENDS_BY_LEAGUE.nrl,
    positionLegend: POSITION_LEGEND_BY_LEAGUE.nrl,
    buildRecordString: BUILD_RECORD_STRING_BY_LEAGUE.nrl,
    defaultSituation: DEFAULT_SITUATIONS_BY_LEAGUE.nrl,
    situations: SITUATIONS_BY_LEAGUE.nrl,
    bettingTimeframeOptions: BETTING_TIMEFRAME_OPTIONS_BY_LEAGUE.nrl,
    scorePath: 'cumulativeStats.%type%.points',

    recordConfig: {
      standingsFields: ['wins', 'losses', 'draws'],
      gameRecordDrawField: 'draw',
      gameRecordDrawLabel: 'D',
      scoreStat: 'points',
      graphKeys: ['W', 'L', 'D'],
    },
    get playerLeaderConfig() {
      return NRL_PLAYER_LEADER_CONFIG;
    },
    discoveryBetByPosition: null,
    supportedCrossGameParlays: NRL_SUPPORTED_CROSS_GAME_PARLAYS,
  },

  nhl: {
    title: 'NHL',
    sport: { id: 'hockey', name: 'Hockey' },
    webIcon: 'assets/hockey-icon.svg',
    webIconSelected: 'assets/hockey-icon-white.svg',
    appIcon: 'icons/sports/hockey',
    appLeagueIcon: 'images/logos/nhl/league.png',
    scheduleFormat: SCHEDULE_FORMAT_DAILY,
    gender: { determiner: 'his' },
    hasAltLines: true,
    tabPriority: 'player',

    advancedTools: ['injury_impact', 'opponent_rank'],
    layout: {},
    headerGradientColor: '#CFD2D3',
    display: CITY_NAME_DISPLAY,
    playbookSupported: true,
    signalKeys: NHL_SIGNAL_KEYS,
    supportsQuarterProps: false,
    supportsHalfProps: false,
    teams: NHL_TEAMS,
    teamBetTypeReverseMapping: TEAM_BET_TYPE_REVERSE_MAPPING_BY_LEAGUE.nhl,
    playerBetTypeIdToName: PLAYER_BET_TYPE_ID_TO_NAME_BY_LEAGUE.nhl,
    playerBetTypesReverseMapping: PLAYER_BET_TYPES_REVERSE_MAPPING_BY_LEAGUE.nhl,
    playerPropsInfo: PLAYER_PROPS_INFO.nhl,
    teamModalStats: TEAM_MODAL_STATS_BY_LEAGUE.nhl,
    standingsFields: STANDINGS_FIELDS_BY_LEAGUE.nhl,
    gameSummaryStatsTemplate: GAME_SUMMARY_STATS_TEMPLATES_BY_LEAGUE.nhl,
    screenerTeamScoringStats: (qualifier, type) => getScreenerTeamScoringStatsByLeague('nhl', qualifier, type),
    discoveryBestBetsGrouping: DISCOVERY_BEST_BETS_GROUPING_BY_LEAGUE.nhl,
    discoveryLeaders: DISCOVERY_LEADERS_BY_LEAGUE.nhl,
    leaderboardTeamColumns: LEADERBOARD_TEAM_COLUMNS_BY_LEAGUE.nhl,
    leaderboardPlayerColumns: LEADERBOARD_PLAYER_COLUMNS_BY_LEAGUE.nhl,
    teamBets: TEAM_BETS_BY_LEAGUE.nhl,
    positionalPlayerProps: POSITIONAL_PLAYER_PROPS_BY_LEAGUE.nhl,
    positionalShowcaseMarkets: POSITIONAL_SHOWCASE_MARKETS_BY_LEAGUE.nhl,
    getPlayerPositionalBetTypes: PLAYER_POSITIONAL_BET_TYPES_BY_LEAGUE.nhl,
    screenerOnlyProps: SCREENER_ONLY_PROPS_BY_LEAGUE.nhl,
    getPlayerPositionalBetTypesForScreener: PLAYER_POSITIONAL_BET_TYPES_FOR_SCREENER_BY_LEAGUE.nhl,
    legend: LEGENDS_BY_LEAGUE.nhl,
    positionLegend: POSITION_LEGEND_BY_LEAGUE.nhl,
    buildRecordString: BUILD_RECORD_STRING_BY_LEAGUE.nhl,
    defaultSituation: DEFAULT_SITUATIONS_BY_LEAGUE.nhl,
    situations: SITUATIONS_BY_LEAGUE.nhl,
    bettingTimeframeOptions: BETTING_TIMEFRAME_OPTIONS_BY_LEAGUE.nhl,
    scorePath: 'cumulativeStats.%type%.goals',

    recordConfig: {
      standingsFields: ['wins', 'losses', 'overtimeLosses'],
      gameRecordDrawField: 'overtimeLoss',
      gameRecordDrawLabel: 'OTL',
      scoreStat: 'goals',
      graphKeys: ['W', 'L', 'OTL'],
    },
    get playerLeaderConfig() {
      return NHL_PLAYER_LEADER_CONFIG;
    },
    discoveryBetByPosition: NHL_DISCOVERY_BET_BY_POSITION,
    supportedCrossGameParlays: NHL_SUPPORTED_CROSS_GAME_PARLAYS,
  },

  'fifa-world-cup': createSoccerLeagueConfig({
    id: 'fifa-world-cup',
    title: 'World Cup',
    teams: FIFA_WORLD_CUP_TEAMS,
    scheduleFormat: SCHEDULE_FORMAT_DAILY,
    advancedTools: ['starting_lineups', 'opponent_rank'],
    headerGradientColor: '#314eff',
    playbookSupported: true,
  }),
  'brazil-serie-a': createSoccerLeagueConfig({
    id: 'brazil-serie-a',
    title: 'Brasileiro Série A',
    teams: BRAZIL_SERIE_A_TEAMS,
    headerGradientColor: '#C7FF00',
    playbookSupported: true,
  }),
  mls: createSoccerLeagueConfig({
    id: 'mls',
    title: 'MLS',
    teams: MLS_TEAMS,
    headerGradientColor: '#E2231A',
    playbookSupported: true,
  }),
  bundesliga: createSoccerLeagueConfig({
    id: 'bundesliga',
    title: 'Bundesliga',
    teams: BUNDESLIGA_TEAMS,
    headerGradientColor: '#D10214',
    playbookSupported: true,
  }),
  epl: createSoccerLeagueConfig({
    id: 'epl',
    title: 'EPL',
    teams: EPL_TEAMS,
    headerGradientColor: '#3D195B',
    playbookSupported: true,
  }),
  laliga: createSoccerLeagueConfig({
    id: 'laliga',
    title: 'LaLiga',
    teams: LALIGA_TEAMS,
    headerGradientColor: '#FF4B44',
    playbookSupported: true,
  }),
  ligue1: createSoccerLeagueConfig({
    id: 'ligue1',
    title: 'Ligue 1',
    teams: LIGUE1_TEAMS,
  }),
  seriea: createSoccerLeagueConfig({
    id: 'seriea',
    title: 'Serie A',
    teams: SERIEA_TEAMS,
    headerGradientColor: '#0373FF',
    playbookSupported: true,
  }),
  ucl: createSoccerLeagueConfig({
    id: 'ucl',
    title: 'Champions League',
    teams: UCL_TEAMS,
    headerGradientColor: '#00004B',
  }),
  uel: createSoccerLeagueConfig({
    id: 'uel',
    title: 'Europa League',
    teams: UEL_TEAMS,
    headerGradientColor: '#FF6900',
  }),
  // eredivisie: createSoccerLeagueConfig({
  //   id: 'eredivisie',
  //   title: 'Eredivisie',
  //   teams: EREDIVISIE_TEAMS,
  // }),
  // 'primera-lpf': createSoccerLeagueConfig({
  //   id: 'primera-lpf',
  //   title: 'Primera LPF',
  //   teams: PRIMERA_LPF_TEAMS,
  // }),
  // 'liga-portugal': createSoccerLeagueConfig({
  //   id: 'liga-portugal',
  //   title: 'Liga Portugal',
  //   teams: LIGA_PORTUGAL_TEAMS,
  // }),
  // 'liga-mx': createSoccerLeagueConfig({
  //   id: 'liga-mx',
  //   title: 'Liga MX',
  //   teams: LIGA_MX_TEAMS,
  // }),
};

export const TEAM_BETS = Object.fromEntries(
  Object.entries(SUPPORTED_LEAGUES)
    .map(([league, config]) => [league, config.teamBets])
    .filter(([, value]) => !!value)
);

export const POSITIONAL_PLAYER_PROPS = Object.fromEntries(
  Object.entries(SUPPORTED_LEAGUES)
    .map(([league, config]) => [league, config.positionalPlayerProps])
    .filter(([, value]) => !!value)
);

export const POSITIONAL_SHOWCASE_MARKETS = Object.fromEntries(
  Object.entries(SUPPORTED_LEAGUES)
    .map(([league, config]) => [league, config.positionalShowcaseMarkets])
    .filter(([, value]) => !!value)
);

export const getPlayerPositionalBetTypes = Object.fromEntries(
  Object.entries(SUPPORTED_LEAGUES)
    .map(([league, config]) => [league, config.getPlayerPositionalBetTypes])
    .filter(([, value]) => !!value)
);

export const SCREENER_ONLY_PROPS = Object.fromEntries(
  Object.entries(SUPPORTED_LEAGUES)
    .map(([league, config]) => [league, config.screenerOnlyProps])
    .filter(([, value]) => value !== undefined)
);

export const getPlayerPositionalBetTypesForScreener = Object.fromEntries(
  Object.entries(SUPPORTED_LEAGUES)
    .map(([league, config]) => [league, config.getPlayerPositionalBetTypesForScreener])
    .filter(([, value]) => !!value)
);

export const LEGENDS = Object.fromEntries(
  Object.entries(SUPPORTED_LEAGUES)
    .map(([league, config]) => [league, config.legend])
    .filter(([, value]) => value !== undefined)
);

export const POSITION_LEGEND = Object.fromEntries(
  Object.entries(SUPPORTED_LEAGUES)
    .map(([league, config]) => [league, config.positionLegend])
    .filter(([, value]) => value !== undefined)
);

export const buildRecordStringFn = Object.fromEntries(
  Object.entries(SUPPORTED_LEAGUES)
    .map(([league, config]) => [league, config.buildRecordString])
    .filter(([, value]) => !!value)
);

export const DEFAULT_SITUATIONS = Object.fromEntries(
  Object.entries(SUPPORTED_LEAGUES)
    .map(([league, config]) => [league, config.defaultSituation])
    .filter(([, value]) => value !== undefined)
);

export const SITUATIONS = Object.fromEntries(
  Object.entries(SUPPORTED_LEAGUES)
    .map(([league, config]) => [league, config.situations])
    .filter(([, value]) => value !== undefined)
);

export const BETTING_TIMEFRAME_OPTIONS = Object.fromEntries(
  Object.entries(SUPPORTED_LEAGUES)
    .map(([league, config]) => [league, config.bettingTimeframeOptions])
    .filter(([, value]) => value !== undefined)
);

export const TEAM_BET_TYPE_REVERSE_MAPPING = Object.fromEntries(
  Object.entries(SUPPORTED_LEAGUES)
    .map(([league, config]) => [league, config.teamBetTypeReverseMapping])
    .filter(([, value]) => !!value)
);

export const PLAYER_BET_TYPE_ID_TO_NAME = Object.fromEntries(
  Object.entries(SUPPORTED_LEAGUES)
    .map(([league, config]) => [league, config.playerBetTypeIdToName])
    .filter(([, value]) => !!value)
);

export const PLAYER_BET_TYPES_REVERSE_MAPPING = Object.fromEntries(
  Object.entries(SUPPORTED_LEAGUES)
    .map(([league, config]) => [league, config.playerBetTypesReverseMapping])
    .filter(([, value]) => !!value)
);

export const TEAM_MODAL_STATS = Object.fromEntries(
  Object.entries(SUPPORTED_LEAGUES)
    .map(([league, config]) => [league, config.teamModalStats])
    .filter(([, value]) => value !== undefined)
);

export const STANDINGS_FIELDS = Object.fromEntries(
  Object.entries(SUPPORTED_LEAGUES)
    .map(([league, config]) => [league, config.standingsFields])
    .filter(([, value]) => !!value)
);

export const GAME_SUMMARY_STATS_TEMPLATES = Object.fromEntries(
  Object.entries(SUPPORTED_LEAGUES)
    .map(([league, config]) => [league, config.gameSummaryStatsTemplate])
    .filter(([, value]) => !!value)
);

export const DISCOVERY_BEST_BETS_GROUPING = Object.fromEntries(
  Object.entries(SUPPORTED_LEAGUES)
    .map(([league, config]) => [league, config.discoveryBestBetsGrouping])
    .filter(([, value]) => !!value)
);

export const DISCOVERY_LEADERS = Object.fromEntries(
  Object.entries(SUPPORTED_LEAGUES)
    .map(([league, config]) => [league, config.discoveryLeaders])
    .filter(([, value]) => !!value)
);

export const LEADERBOARD_TEAM_COLUMNS = Object.fromEntries(
  Object.entries(SUPPORTED_LEAGUES)
    .map(([league, config]) => [league, config.leaderboardTeamColumns])
    .filter(([, value]) => !!value)
);

export const LEADERBOARD_PLAYER_COLUMNS = Object.fromEntries(
  Object.entries(SUPPORTED_LEAGUES)
    .map(([league, config]) => [league, config.leaderboardPlayerColumns])
    .filter(([, value]) => !!value)
);

export const SUPPORTED_LEAGUE_IDS = Object.keys(SUPPORTED_LEAGUES);
export const SUPPORTED_LEAGUES_METADATA = SUPPORTED_LEAGUES;

export const TOURNAMENT_SOCCER_LEAGUES = _.pick(SUPPORTED_LEAGUES, TOURNAMENT_SOCCER_LEAGUE_IDS);
export const IN_YEAR_SOCCER_LEAGUES = _.pick(SUPPORTED_LEAGUES, IN_YEAR_SOCCER_LEAGUE_IDS);
export const CROSS_YEAR_SOCCER_LEAGUES = _.pick(SUPPORTED_LEAGUES, CROSS_YEAR_SOCCER_LEAGUE_IDS);
export const SOCCER_LEAGUES = _.pick(SUPPORTED_LEAGUES, SOCCER_LEAGUE_IDS);
export const MIXED_LEAGUES = _.omit(SUPPORTED_LEAGUES, SOCCER_LEAGUE_IDS);

const supportedSports = {};
Object.keys(SUPPORTED_LEAGUES).forEach((league) => {
  const sport = SUPPORTED_LEAGUES[league].sport;
  const sportId = sport.id;
  if (!(sportId in supportedSports)) {
    supportedSports[sportId] = {
      ...sport,
      leagues: {}
    };
  }
  supportedSports[sportId].leagues[league] = SUPPORTED_LEAGUES[league];
});
export const SUPPORTED_SPORTS = supportedSports;

export const SCORE_PATHS = Object.fromEntries(
  Object.entries(SUPPORTED_LEAGUES)
    .map(([league, config]) => [league, config.scorePath])
    .filter(([, value]) => !!value)
)

export const LEAGUE_RECORD_CONFIG = Object.fromEntries(
  Object.entries(SUPPORTED_LEAGUES)
    .map(([league, config]) => [league, config.recordConfig])
    .filter(([, value]) => !!value)
);

// Used to know the list of stats by which we need to sort and how to sort them
const getSituationalPropsForLeague = (league, situation) => {
  const playerPropsInfo = SUPPORTED_LEAGUES[league]?.playerPropsInfo;
  if (!playerPropsInfo) {
    return playerPropsInfo;
  }

  if (SUPPORTED_LEAGUES[league]?.playerPropsInfoMode === 'mlb_situational') {
    const copy = _.cloneDeep(playerPropsInfo);
    Object.keys(copy).forEach((prop) => {
      Object.keys(copy[prop].supportingStats).forEach((supportingStat) => {
        copy[prop].supportingStats[supportingStat] =
          copy[prop].supportingStats[supportingStat].replace('%situation%', situation);
      });

      Object.keys(copy[prop].opposingSupportingStats).forEach((opposingSupportingStat) => {
        copy[prop].opposingSupportingStats[opposingSupportingStat].teamFields =
          copy[prop].opposingSupportingStats[opposingSupportingStat].teamFields.map((x) =>
            x.replace('%situation%', situation)
          );

        if (copy[prop].opposingSupportingStats[opposingSupportingStat].playerFields) {
          copy[prop].opposingSupportingStats[opposingSupportingStat].playerFields =
            copy[prop].opposingSupportingStats[opposingSupportingStat].playerFields.map((x) =>
              x.replace('%situation%', situation)
            );
        }
      });
    });

    return copy;
  }

  return playerPropsInfo;
};

const getPlayerPropInfoForLeague = (league, propID, situation) => {
  const playerPropsInfo = SUPPORTED_LEAGUES[league]?.playerPropsInfo;
  if (!playerPropsInfo) {
    return undefined;
  }

  if (SUPPORTED_LEAGUES[league]?.playerPropsInfoMode === 'mlb_situational') {
    if (!situation) {
      return playerPropsInfo[propID];
    }

    const propInfo = Object.assign({}, playerPropsInfo[propID]);

    propInfo.supportingStats = Object.assign({}, propInfo.supportingStats);
    Object.keys(propInfo.supportingStats).forEach((stat) => {
      propInfo.supportingStats[stat] = propInfo.supportingStats[stat].replace('%situation%', situation);
    });

    propInfo.opposingSupportingStats = Object.assign({}, propInfo.opposingSupportingStats);
    Object.keys(propInfo.opposingSupportingStats).forEach((stat) => {
      propInfo.opposingSupportingStats[stat] = Object.assign({}, propInfo.opposingSupportingStats[stat]);

      if (propInfo.opposingSupportingStats[stat].playerFields) {
        propInfo.opposingSupportingStats[stat].playerFields = [
          ...propInfo.opposingSupportingStats[stat].playerFields,
        ];
        propInfo.opposingSupportingStats[stat].playerFields =
          propInfo.opposingSupportingStats[stat].playerFields.map((x) =>
            x.replace('%situation%', situation)
          );
      }
    });

    return propInfo;
  }

  return playerPropsInfo[propID];
};

export const getSituationalProps = Object.fromEntries(
  Object.keys(SUPPORTED_LEAGUES).map((league) => [
    league,
    (situation) => getSituationalPropsForLeague(league, situation),
  ])
);

export const getPlayerPropInfo = Object.fromEntries(
  Object.keys(SUPPORTED_LEAGUES).map((league) => [
    league,
    (propID, situation) => getPlayerPropInfoForLeague(league, propID, situation),
  ])
);

export const getGamelogSupportingStats = Object.fromEntries(
  Object.keys(SUPPORTED_LEAGUES).map((league) => [
    league,
    (playerPropInfo) => playerPropInfo.gamelogStats,
  ])
);

export const getPlayerPropDefensiveTeamStatPath = Object.fromEntries(
  Object.keys(SUPPORTED_LEAGUES).map((league) => [
    league,
    (propID) => SUPPORTED_LEAGUES[league]?.playerPropsInfo?.[propID],
  ])
);

const BASKETBALL_PLAYER_LEADER_STATS = {
  PTS: "cumulativeStats.points",
  FTM: "cumulativeStats.freeThrowsMade",
  FGM: "cumulativeStats.fieldGoalsMade",
  "3PTM": "cumulativeStats.threePointsMade",
  REB: "cumulativeStats.rebounds",
  AST: "cumulativeStats.assists",
};

const FOOTBALL_PLAYER_LEADER_STATS = {
  QB: {
    COMP: "cumulativeStats.passingCompletions",
    YDS: "cumulativeStats.passingYards",
    TD: "cumulativeStats.passingTouchdowns",
    INT: "cumulativeStats.interceptions",
    "RZ ATT": "cumulativeStats.redzonePassingAttempts",
    "RZ TD": "cumulativeStats.redzonePassingTouchdowns",
  },
  RB: {
    ATT: "cumulativeStats.rushingAttempts",
    YDS: "cumulativeStats.rushingYards",
    TD: "cumulativeStats.rushingTouchdowns",
    TGT: "cumulativeStats.targets",
    "RZ ATT": "cumulativeStats.redzoneRushingAttempts",
    "RZ TD": "cumulativeStats.redzoneRushingTouchdowns",
  },
  WR: {
    TGT: "cumulativeStats.targets",
    REC: "cumulativeStats.receptions",
    YDS: "cumulativeStats.receivingYards",
    TD: "cumulativeStats.receivingTouchdowns",
    "RZ TGT": "cumulativeStats.redzoneTargets",
    "RZ TD": "cumulativeStats.redzoneReceivingTouchdowns",
  },
  TE: {
    TGT: "cumulativeStats.targets",
    REC: "cumulativeStats.receptions",
    YDS: "cumulativeStats.receivingYards",
    TD: "cumulativeStats.receivingTouchdowns",
    "RZ TGT": "cumulativeStats.redzoneTargets",
    "RZ TD": "cumulativeStats.redzoneReceivingTouchdowns",
  },
  K: {
    FGA: "cumulativeStats.fieldGoalAttempts",
    FGM: "cumulativeStats.fieldGoalsMade",
    "FG%": "cumulativeStats.fieldGoalPercentage",
    XPA: "cumulativeStats.extraPointAttempts",
    XPM: "cumulativeStats.extraPointsMade",
    "XP%": "cumulativeStats.extraPointPercentage",
  },
};

const NHL_PLAYER_LEADER_STATS = {
  GOALIES: {
    WINS: "cumulativeStats.wins",
    "SV%": "cumulativeStats.savePercentage",
    GAA: "averageStats.goalsAllowed",
    SHUTOUTS: "cumulativeStats.shutouts",
    "SA/G": "averageStats.shotsAgainst",
    "SV/G": "averageStats.shotsSaved",
  },
  SKATERS: {
    PTS: "cumulativeStats.points",
    G: "cumulativeStats.goals",
    A: "cumulativeStats.assists",
    SOG: "cumulativeStats.shotsOnGoal",
    SAT: "cumulativeStats.shotAttempts",
    PPP: "cumulativeStats.powerplayPoints",
  },
};

const MLB_PLAYER_LEADER_STATS = {
  PITCHING: {
    W: "cumulativeStats.pitching.wins",
    L: "cumulativeStats.pitching.losses",
    SV: "cumulativeStats.pitching.saves",
    ERA: "cumulativeStats.pitching.earnedRunsAverage",
    SO: "cumulativeStats.pitching.strikeouts",
    WHIP: "cumulativeStats.pitching.walksAndHitsPerInningPitched",
  },
  HITTING: {
    H: "cumulativeStats.hitting.hits",
    R: "cumulativeStats.hitting.runs",
    RBI: "cumulativeStats.hitting.runsBattedIn",
    HR: "cumulativeStats.hitting.homeRuns",
    AVG: "cumulativeStats.hitting.battingAverage",
    OPS: "cumulativeStats.hitting.onBasePlusSluggingPercentage",
  },
};

const SOCCER_PLAYER_LEADER_STATS = {
  GOALIES: {
    GA: "cumulativeStats.goalsConceded",
    SAV: "cumulativeStats.shotsFacedSaved",
    SA: "cumulativeStats.shotsFacedTotal",
    PS: "cumulativeStats.penaltiesSaved",
    DSAV: "cumulativeStats.divingSaves",
    CS: "cumulativeStats.cleanSheet",
  },
  PLAYERS: {
    G: "cumulativeStats.goals",
    A: "cumulativeStats.assists",
    SHOT: "cumulativeStats.shotsOnTarget",
    SHO: "cumulativeStats.totalShots",
    MIN: "cumulativeStats.minutesPlayed",
  },
};

const AFL_PLAYER_LEADER_STATS = {
  G: "cumulativeStats.goals",
  B: "cumulativeStats.behinds",
  PTS: "cumulativeStats.points",
};

const NRL_PLAYER_LEADER_STATS = {
  T: "cumulativeStats.tries",
  G: "cumulativeStats.goals",
  FG: "cumulativeStats.fieldGoals",
};

const BASKETBALL_PLAYER_LEADER_CONFIG = {
  fetchMode: "all",
  groups: ["ALL"],
  resolveGroup: () => "ALL",
  getStats: () => BASKETBALL_PLAYER_LEADER_STATS,
};

const FOOTBALL_PLAYER_LEADER_CONFIG = {
  fetchMode: "position",
  groups: ["QB", "RB", "WR", "TE", "K"],
  resolveGroup: (player) => player?.info?.position?.toUpperCase?.() || "QB",
  getStats: (player) => FOOTBALL_PLAYER_LEADER_STATS[player?.info?.position?.toUpperCase?.()] || {},
};

const NHL_PLAYER_LEADER_CONFIG = {
  fetchMode: "positionGroup",
  groups: ["SKATERS", "FORWARDS", "DEFENSEMEN", "GOALIES"],
  resolveGroup: (player) => {
    const position = player?.info?.position?.toUpperCase?.() || "";
    if (["C", "LW", "RW"].includes(position)) {
      return "FORWARDS";
    }
    if (position === "D") {
      return "DEFENSEMEN";
    }
    if (position === "G") {
      return "GOALIES";
    }
    return "SKATERS";
  },
  getStats: (player) => {
    const position = player?.info?.position?.toUpperCase?.() || "";
    return position === "G" ? NHL_PLAYER_LEADER_STATS.GOALIES : NHL_PLAYER_LEADER_STATS.SKATERS;
  },
};

const MLB_PLAYER_LEADER_CONFIG = {
  fetchMode: "positionGroup",
  groups: ["PITCHING", "HITTING"],
  resolveGroup: (player) => {
    const position = player?.info?.position?.toUpperCase?.() || "";
    return ["SP", "RP", "P"].includes(position) ? "PITCHING" : "HITTING";
  },
  getStats: (player) => {
    const position = player?.info?.position?.toUpperCase?.() || "";
    return ["SP", "RP", "P"].includes(position)
      ? MLB_PLAYER_LEADER_STATS.PITCHING
      : MLB_PLAYER_LEADER_STATS.HITTING;
  },
};

const SOCCER_PLAYER_LEADER_CONFIG = {
  fetchMode: "positionGroup",
  groups: ["PLAYERS", "GOALIES"],
  resolveGroup: (player) => {
    const position = player?.info?.position?.toLowerCase?.() || "";
    return position === "goalkeeper" ? "GOALIES" : "PLAYERS";
  },
  getStats: (player) => {
    const position = player?.info?.position?.toLowerCase?.() || "";
    return position === "goalkeeper"
      ? SOCCER_PLAYER_LEADER_STATS.GOALIES
      : SOCCER_PLAYER_LEADER_STATS.PLAYERS;
  },
};

const AFL_PLAYER_LEADER_CONFIG = {
  fetchMode: "all",
  groups: ["ALL"],
  resolveGroup: () => "ALL",
  getStats: () => AFL_PLAYER_LEADER_STATS,
};

const NRL_PLAYER_LEADER_CONFIG = {
  fetchMode: "all",
  groups: ["ALL"],
  resolveGroup: () => "ALL",
  getStats: () => NRL_PLAYER_LEADER_STATS,
};

export const SOCCER_LINEUP_MARKER_SLOTS = [
  {slot: "gk", x: 98, y: 265},
  {slot: "lb", x: 40, y: 205},
  {slot: "lcb", x: 78, y: 205},
  {slot: "rcb", x: 118, y: 205},
  {slot: "rb", x: 156, y: 205},
  {slot: "lcm", x: 58, y: 145},
  {slot: "cm", x: 98, y: 145},
  {slot: "rcm", x: 138, y: 145},
  {slot: "lw", x: 46, y: 72},
  {slot: "st", x: 98, y: 58},
  {slot: "rw", x: 150, y: 72},
];

export const NARRATIVES = {
  RECENT_FORM: {
      icon: "badges/recent",
      title: 'Recent form success rate:',
      // description: 'Strong outcomes in recent games.',
      hitRecordPrefix: 'CUSTOM_RECENT_FORM'
  },
  HEAD_TO_HEAD: {
      icon: "badges/matchup",
      title: 'Head-to-head success rate:',
      // description: 'Strong outcomes in head-to-head games.',
      hitRecordPrefix: 'CUSTOM_HEAD_TO_HEAD'
  },
  AWAY_SPLIT: {
      icon: "badges/away",
      title: 'Away games success rate:',
      // description: 'Strong outcomes in games on the road.',
      hitRecordPrefix: 'CUSTOM_AWAY',
  },
  HOME_SPLIT: {
      icon: "badges/home",
      title: 'Home games success rate:',
      // description: 'Strong outcomes in games at home.',
      hitRecordPrefix: 'CUSTOM_HOME'
  },
  OPPONENT: {
      icon: "badges/opponent",
      title: null,
      // description: null
  },
  INJURY_IMPACT: {
      icon: "badges/injury",
      title: 'Teammate injury impact:',
      // description: null
  },
  STARTER: {
      icon: "badges/star",
      title: 'Starting lineup impact:',
      // description: null
  }
}

export const CROSS_GAME_PARLAY = "cross-game-parlay";
export const SAME_GAME_PARLAY = "same-game-parlay";

const FANDUEL_SPORTSBOOK_CONFIG = {
  backgroundColor: 'rgba(0, 120, 255, 1)',
  gradientColors: {
    dark: ['rgba(28,50,77,0.110)', 'rgba(30,42,57,0.120)', 'rgba(33,34,37,0.129)'],
    light: ['rgba(215,232,251,0.843)', 'rgba(232,241,251,0.910)', 'rgba(249,249,251,0.976)']
  },
  sectionGradientColors: {
    light: ['rgba(252,252,253,0.988)', 'rgba(215,232,251,0.843)', 'rgba(252,252,253,0.988)'],
    dark: ['rgba(17,17,19,0.067)', 'rgba(28,50,77,0.110)', 'rgba(17,17,19,0.067)']
  },
  primaryTextColor: '#FFFFFF',
  secondaryTextColor: '',
  displayName: 'FanDuel',
  accentBackgroundColor: 'rgba(255,220,46,1)',
  dailyOfferBackgroundColor: 'rgba(0,120,255,1)',
  accentTextColor: '#1c2024ff',
  // dailyOfferTextColor: '',
}

// Note: when adding a new book make sure to have the following
// - compiled svg (for app)
// - png wordmark logo (for app)
// - theme specific logo (for app)
// - entry in the index.js for app assets referring to the wordmark logo and the theme-specific logo
// - full color scheme
// - advertising asset with logo without border
export const SPORTSBOOKS_CONFIG = {
  // '': {
  //   backgroundColor: '',
  //// This one is optional, will fallback to background color
  //   accentBackgroundColor: '',
  //// This one is optional, will fallback to background color
  //   dailyOfferBackgroundColor: '',
  //   gradientColors: {
  //    dark:[],
  //    light: [],
  //   primaryTextColor: '',
  //// This one is optional, will fallback to primary text color
  //   accentTextColor: '',
  //// This one is optional, will fallback to primary text color
  //   dailyOfferTextColor: '',
  //   secondaryTextColor: '',
  //   displayName: ''
  // },
  bet365: {
    backgroundColor: 'rgba(2, 123, 91, 1)',
    gradientColors: {
      dark: ['rgba(28,51,47,0.110)', 'rgba(31,43,42,0.120)', 'rgba(33,34,37,0.129)'],
      light: ['rgba(213,231,228,0.835)', 'rgba(231,240,239,0.906)', 'rgba(249,249,251,0.976)']
    },
    sectionGradientColors: {
      light: ['rgba(252,252,253,0.988)', 'rgba(213,231,228,0.835)', 'rgba(252,252,253,0.988)'],
      dark: ['rgba(17,17,19,0.067)', 'rgba(28,51,47,0.110)', 'rgba(17,17,19,0.067)']
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: 'bet365',
  },
  bet99: {
    backgroundColor: 'rgba(35, 147, 74, 1)',
    gradientColors: {
      dark: ['rgba(34,55,44,0.133)', 'rgba(34,45,41,0.131)', 'rgba(33,34,37,0.129)'],
      light: ['rgba(220,235,227,0.863)', 'rgba(235,242,239,0.920)', 'rgba(249,249,251,0.976)']
    },
    sectionGradientColors: {
      light: ['rgba(252,252,253,0.988)', 'rgba(220,235,227,0.863)', 'rgba(252,252,253,0.988)'],
      dark: ['rgba(17,17,19,0.067)', 'rgba(34,55,44,0.133)', 'rgba(17,17,19,0.067)']
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: 'BET99',
    accentBackgroundColor: 'rgba(35,147,74,1)',
    dailyOfferBackgroundColor: 'rgba(0,0,0,1)',
    accentTextColor: '#ffffffff',
    // dailyOfferTextColor: '',
  },
  betfred: {
    backgroundColor: 'rgba(34, 68, 143, 1)',
    gradientColors: {
      dark: [],
      light: []
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: 'Betfred'
  },
  betmgm: {
    backgroundColor: 'rgba(192, 169, 113, 1)',
    gradientColors: {
      dark: ['rgba(62,59,51,0.243)', 'rgba(48,47,44,0.186)', 'rgba(33,34,37,0.129)'],
      light: ['rgba(241,237,231,0.945)', 'rgba(245,243,241,0.961)', 'rgba(249,249,251,0.976)']
    },
    sectionGradientColors: {
      light: ['rgba(252,252,253,0.988)', 'rgba(241,237,231,0.945)', 'rgba(252,252,253,0.988)'],
      dark: ['rgba(17,17,19,0.067)', 'rgba(62,59,51,0.243)', 'rgba(17,17,19,0.067)']
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: 'BetMGM'
  },
  // Australia
  betr: {
    backgroundColor: 'rgba(8, 58, 212, 1)',
    gradientColors: {
      dark: [],
      light: []
    },
    sectionGradientColors: {
      light: ['rgba(252,252,253,0.988)', 'rgba(231,215,238,0.906)', 'rgba(252,252,253,0.988)'],
      dark: ['rgba(17,17,19,0.067)', 'rgba(50,30,60,0.196)', 'rgba(17,17,19,0.067)']
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: 'Betr'
  },
  // USA
  betrpicks: {
    backgroundColor: 'rgba(127, 10, 163, 1)',
    accentBackgroundColor: 'rgba(0, 0, 0, 1)',
    dailyOfferBackgroundColor: 'rgba(255, 255, 255, 1)',
    dailyOfferTextColor: 'rgba(0, 0, 0, 1)',
    gradientColors: {
      dark: ['rgba(50,30,60,0.196)', 'rgba(42,32,49,0.163)', 'rgba(33,34,37,0.129)'],
      light: ['rgba(231,215,238,0.906)', 'rgba(240,232,245,0.941)', 'rgba(249,249,251,0.976)']
    },
    sectionGradientColors: {
      light: ['rgba(252,252,253,0.988)', 'rgba(231,215,238,0.906)', 'rgba(252,252,253,0.988)'],
      dark: ['rgba(17,17,19,0.067)', 'rgba(50,30,60,0.196)', 'rgba(17,17,19,0.067)']
    },
    primaryTextColor: '#FFFFFF',
    accentTextColor: 'rgba(255, 255, 255, 1)',
    secondaryTextColor: '',
    displayName: 'Betr Picks'
  },
  betrivers: {
    backgroundColor: 'rgba(25, 52, 93, 1)',
    gradientColors: {
      dark: ['rgba(32,38,48,0.125)', 'rgba(33,36,43,0.127)', 'rgba(33,34,37,0.129)'],
      light: ['rgba(217,221,228,0.851)', 'rgba(233,235,239,0.914)', 'rgba(249,249,251,0.976)']
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: 'BetRivers'
  },
  betway: {
    backgroundColor: 'rgba(35, 35, 35, 1)',
    gradientColors: {
      dark: [],
      light: []
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: 'Betway'
  },
  caesars: {
    backgroundColor: 'rgba(10, 50, 49, 1)',
    gradientColors: {
      dark: ['rgba(29,37,40,0.114)', 'rgba(31,36,39,0.122)', 'rgba(33,34,37,0.129)'],
      light: ['rgba(215,220,222,0.843)', 'rgba(232,235,237,0.910)', 'rgba(249,249,251,0.976)']
    },
    sectionGradientColors: {
      light: ['rgba(252,252,253,0.988)', 'rgba(215,220,222,0.843)', 'rgba(252,252,253,0.988)'],
      dark: ['rgba(17,17,19,0.067)', 'rgba(29,37,40,0.114)', 'rgba(17,17,19,0.067)']
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: 'Caesars'
  },
  chalkboard: {
    backgroundColor: 'rgba(190,243,2,1)',
    accentBackgroundColor: 'rgba(26, 220, 109, 1)',
    dailyOfferBackgroundColor: 'rgba(25, 28, 31, 1)',
    gradientColors: {
      dark: ['rgba(62,72,31,0.243)', 'rgba(48,53,34,0.186)', 'rgba(33,34,37,0.129)'],
      light: ['rgba(246,253,219,0.965)', 'rgba(247,251,235,0.971)', 'rgba(249,249,251,0.976)']
    },
    sectionGradientColors: {
      light: ['rgba(252,252,253,0.988)', 'rgba(246,253,219,0.965)', 'rgba(252,252,253,0.988)'],
      dark: ['rgba(17,17,19,0.067)', 'rgba(62,72,31,0.243)', 'rgba(17,17,19,0.067)']
    },
    primaryTextColor: '#000000',
    accentTextColor: 'rgba(28, 32, 36, 1)',
    dailyOfferTextColor: 'rgba(255, 255, 255, 1)',
    secondaryTextColor: '',
    displayName: 'Chalkboard'
  },
  dabble: {
    backgroundColor: 'rgba(119, 66, 255, 1)',
    gradientColors: {
      dark: ['rgba(49,40,77,0.192)', 'rgba(41,37,57,0.161)', 'rgba(33,34,37,0.129)'],
      light: ['rgba(230,223,251,0.902)', 'rgba(239,236,251,0.939)', 'rgba(249,249,251,0.976)']
    },
    sectionGradientColors: {
      light: ['rgba(252,252,253,0.988)', 'rgba(230,223,251,0.902)', 'rgba(252,252,253,0.988)'],
      dark: ['rgba(17,17,19,0.067)', 'rgba(49,40,77,0.192)', 'rgba(17,17,19,0.067)']
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: 'Dabble',
    accentBackgroundColor: 'rgba(252,255,78,1)',
    dailyOfferBackgroundColor: 'rgba(0,0,0,1)',
    accentTextColor: '#1c2024ff',
    // dailyOfferTextColor: '',
  },
  draftkings: {
    backgroundColor: 'rgba(97, 181, 16, 1)',
    gradientColors: {
      dark: ['rgba(45,60,34,0.176)', 'rgba(39,47,36,0.153)', 'rgba(33,34,37,0.129)'],
      light: ['rgba(227,239,217,0.890)', 'rgba(238,244,234,0.933)', 'rgba(249,249,251,0.976)']
    },
    sectionGradientColors: {
      light: ['rgba(252,252,253,0.988)', 'rgba(227,239,217,0.890)', 'rgba(252,252,253,0.988)'],
      dark: ['rgba(17,17,19,0.067)', 'rgba(45,60,34,0.176)', 'rgba(17,17,19,0.067)']
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: 'DraftKings',
    accentBackgroundColor: 'rgba(97,181,16,1)',
    dailyOfferBackgroundColor: 'rgba(36,36,36,1)',
    accentTextColor: '#1c2024ff',
    // dailyOfferTextColor: '',
  },
  'draftkings-predictions': {
    backgroundColor: 'rgba(34,88,67,1)',
    gradientColors: {
      dark: ['rgba(34,44,43,0.133)', 'rgba(34,39,40,0.131)', 'rgba(33,34,37,0.129)'],
      light: ['rgba(223,231,228,0.875)', 'rgba(239,243,241,0.937)', 'rgba(255,255,255,1)']
    },
    sectionGradientColors: {
      dark: ['rgba(34,44,43,0.133)', 'rgba(34,39,40,0.131)', 'rgba(33,34,37,0.129)'],
      light: ['rgba(223,231,228,0.875)', 'rgba(239,243,241,0.937)', 'rgba(255,255,255,1)']
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: 'DraftKings Predictions',
    accentBackgroundColor: 'rgba(97,181,16,1)',
    dailyOfferBackgroundColor: 'rgba(36,36,36,1)',
    accentTextColor: '#1c2024ff',
    // dailyOfferTextColor: '',
  },
  fanatics: {
    backgroundColor: 'rgba(230, 63, 47, 1)',
    gradientColors: {
      dark: ['rgba(69,40,39,0.271)', 'rgba(51,37,38,0.200)', 'rgba(33,34,37,0.129)'],
      light: ['rgba(246,222,221,0.965)', 'rgba(247,235,236,0.971)', 'rgba(249,249,251,0.976)']
    },
    sectionGradientColors: {
      light: ['rgba(252,252,253,0.988)', 'rgba(246,222,221,0.965)', 'rgba(252,252,253,0.988)'],
      dark: ['rgba(17,17,19,0.067)', 'rgba(69,40,39,0.271)', 'rgba(17,17,19,0.067)']
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: 'Fanatics',
    accentBackgroundColor: 'rgba(230,63,47,1)',
    dailyOfferBackgroundColor: 'rgba(0,0,0,1)',
    accentTextColor: '#ffffffff',
    // dailyOfferTextColor: '',
  },
  fanduel: FANDUEL_SPORTSBOOK_CONFIG,
  fanduelpicks: FANDUEL_SPORTSBOOK_CONFIG,
  fanduelpredicts: {...FANDUEL_SPORTSBOOK_CONFIG, displayName: 'FanDuel Predicts'},
  pinnacle: {
    backgroundColor: 'rgba(255, 85, 0, 1)',
    gradientColors: {
      dark: [],
      light: []
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: 'Pinnacle'
  },
  pointsbet: {
    backgroundColor: 'rgba(237, 27, 66, 1)',
    gradientColors: {
      dark: ['rgba(70,33,43,0.275)', 'rgba(52,34,40,0.202)', 'rgba(33,34,37,0.129)'],
      light: ['rgba(247,217,224,0.969)', 'rgba(248,233,237,0.973)' ,'rgba(249,249,251,0.976)']
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: 'PointsBet'
  },
  'pointsbet-canada': {
    backgroundColor: 'rgba(237, 27, 66, 1)',
    gradientColors: {
      dark: ['rgba(70,33,43,0.275)', 'rgba(52,34,40,0.202)', 'rgba(33,34,37,0.129)'],
      light: ['rgba(247,217,224,0.969)', 'rgba(248,233,237,0.973)' ,'rgba(249,249,251,0.976)']
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: 'PointsBet Canada'
  },
  prizepicks: {
    backgroundColor: 'rgba(128, 0, 255, 1)',
    gradientColors: {
      dark: ['rgba(51,28,77,0.200)', 'rgba(42,31,57,0.165)', 'rgba(33,34,37,0.129)'],
      light: ['rgba(231,213,251,0.906)', 'rgba(240,231,251,0.941)', 'rgba(249,249,251,0.976)']
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: 'PrizePicks',
    accentBackgroundColor: 'rgba(128,0,255,1)',
    dailyOfferBackgroundColor: 'rgba(5,6,21,1)',
    accentTextColor: '#ffffffff',
    // dailyOfferTextColor: '',
  },
  prolineplus: {
    backgroundColor: 'rgba(0, 136, 65, 1)',
    gradientColors: {
      dark: ['rgba(28,53,43,0.110)', 'rgba(31,44,40,0.120)', 'rgba(33,34,37,0.129)'],
      light: ['rgba(213,233,224,0.835)', 'rgba(231,241,237,0.906)', 'rgba(249,249,251,0.976)']
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: 'Proline+',
  },
  prophetx: {
    backgroundColor: 'rgba(86, 187, 164, 1)',
    gradientColors: {
      dark: ['rgba(30,61,60,0.118)', 'rgba(32,48,49,0.124)', 'rgba(33,34,37,0.129)'],
      light: ['rgba(221,245,241,0.867)', 'rgba(235,247,246,0.922)', 'rgba(249,249,251,0.976)']
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: 'ProphetX'
  },
  sleeper: {
    backgroundColor: 'rgba(0, 186, 233, 1)',
    accentBackgroundColor: 'rgba(34, 51, 82, 1)',
    dailyOfferBackgroundColor: 'rgba(35, 196, 251, 1)',
    gradientColors: {
      dark: ['rgba(28,62,73,0.110)', 'rgba(31,48,55,0.120)', 'rgba(33,34,37,0.129)'],
      light: ['rgba(214,240,249,0.839)', 'rgba(231,245,250,0.908)', 'rgba(249,249,251,0.976)']
    },
    primaryTextColor: '#FFFFFF',
    accentTextColor: 'rgba(255, 255, 255, 1)',
    dailyOfferTextColor: 'rgba(255, 255, 255, 1)',
    secondaryTextColor: '',
    displayName: 'Sleeper'
  },
  sportsillustrated: {
    backgroundColor: 'rgba(231, 51, 34, 1)',
    gradientColors: {
      dark: [],
      light: []
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: 'SI Sportsbook',
  },
  underdog: {
    backgroundColor: 'rgba(255,251,0,1)',
    accentBackgroundColor: 'rgba(0, 0, 0, 1)',
    dailyOfferBackgroundColor: 'rgba(255, 206, 0, 1)',
    gradientColors: {
      dark: ['rgba(68,61,32,0.267)', 'rgba(51,48,35,0.198)', 'rgba(33,34,37,0.129)'],
      light: ['rgba(255,255,219,1)', 'rgba(252,252,235,0.988)', 'rgba(249,249,251,0.976)']
    },
    sectionGradientColors: {
      light: ['rgba(252,252,253,0.988)', 'rgba(255,255,219,1)', 'rgba(252,252,253,0.988)'],
      dark: ['rgba(17,17,19,0.067)', 'rgba(69,69,32,0.271)', 'rgba(17,17,19,0.067)']
    },
    primaryTextColor: '#000000',
    accentTextColor: 'rgba(255, 255, 255, 1)',
    secondaryTextColor: '',
    displayName: 'Underdog'
  },
  unibet: {
    backgroundColor: 'rgba(20, 123, 69, 1)',
    gradientColors: {
      dark: [],
      light: []
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: 'Unibet'
  },
  wynnbet: {
    backgroundColor: 'rgba(197, 142, 0, 1)',
    gradientColors: {
      dark: [],
      light: []
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: 'WynnBET',
  },
  sportsbet: {
    backgroundColor: 'rgba(3, 93, 167, 1)',
    gradientColors: {
      dark: [],
      light: []
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: 'SportsBet'
  },
  tab: {
    backgroundColor: 'rgba(36, 227, 106, 1)',
    gradientColors: {
      dark: [],
      light: []
    },
    primaryTextColor: '#000000',
    secondaryTextColor: '',
    displayName: 'TAB'
  },
  thescore: {
    backgroundColor: 'rgba(0, 97, 204, 1)',
    gradientColors: {
      dark: ['rgba(28,45,66,0.110)', 'rgba(31,40,52,0.120)', 'rgba(33,34,37,0.129)'],
      light: ['rgba(214,228,244,0.839)', 'rgba(231,239,247,0.908)', 'rgba(249,249,251,0.976)']
    },
    primaryTextColor: '',
    secondaryTextColor: '',
    displayName: 'theScore Bet',
    accentBackgroundColor: 'rgba(255,191,1,1)',
    dailyOfferBackgroundColor: 'rgba(0,18,42,1)',
    accentTextColor: '#1c2024ff',
    // dailyOfferTextColor: '',
  },
  // TODO: why is this here twice
  unibet: {
    backgroundColor: 'rgba(0,0,0,1)',
    gradientColors: {
      dark: [],
      light: []
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: 'Unibet'
  },
  novig: {
    backgroundColor: 'rgba(21,155,231,1)',
    accentBackgroundColor: 'rgba(122, 207, 255, 1)',
    dailyOfferBackgroundColor: 'rgba(31, 31, 31, 1)',
    gradientColors: {
      dark: ['rgba(31,56,72,0.122)', 'rgba(32,45,55,0.125)', 'rgba(33,34,37,0.129)'],
      light: ['rgba(221,241,251,0.867)', 'rgba(235,245,251,0.922)', 'rgba(249,249,251,0.976)']
    },
    sectionGradientColors: {
      light: ['rgba(252,252,253,0.988)', 'rgba(221,241,251,0.867)', 'rgba(252,252,253,0.988)'],
      dark: ['rgba(17,17,19,0.067)', 'rgba(31,56,72,0.122)', 'rgba(17,17,19,0.067)']
    },
    primaryTextColor: '#FFFFFF',
    accentTextColor: 'rgba(28, 32, 36, 1)',
    secondaryTextColor: '',
    displayName: 'Novig'
  },
  '1xbet': {
    backgroundColor: 'rgba(29, 66, 104, 1)',
    gradientColors: {
      dark: [],
      light: []
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: '1XBET'
  },
  '888sport': {
    backgroundColor: 'rgba(252, 98, 0, 1)',
    gradientColors: {
      dark: [],
      light: []
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: '888Sport'
  },
  betano: {
    backgroundColor: 'rgba(255, 60, 0, 1)',
    gradientColors: {
      dark: ['rgba(73, 39, 31, 1)', 'rgba(53, 37, 34, 1)', 'rgba(33, 34, 37, 1)'],
      light: ['rgba(250, 224, 218, 1)', 'rgba(249, 237, 235, 1)', 'rgba(249, 249, 251, 1)']
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: 'Betano'
  },
  betfair: {
    backgroundColor: 'rgba(253, 183, 59, 1)',
    gradientColors: {
      dark: [],
      light: []
    },
    primaryTextColor: '#000000',
    secondaryTextColor: '',
    displayName: 'Betfair'
  },
  betfairexchange: {
    backgroundColor: 'rgba(253, 183, 59, 1)',
    gradientColors: {
      dark: [],
      light: []
    },
    primaryTextColor: '#000000',
    secondaryTextColor: '',
    displayName: 'Betfair Exchange'
  },
  betsson: {
    backgroundColor: 'rgba(255, 102, 0, 1)',
    gradientColors: {
      dark: [],
      light: []
    },
    primaryTextColor: '#000000',
    secondaryTextColor: '',
    displayName: 'Betsson'
  },
  betvictor: {
    backgroundColor: 'rgba(33, 202, 241, 1)',
    gradientColors: {
      dark: ['rgba(39, 61, 72, 1)', 'rgba(36, 48, 55, 1)', 'rgba(33, 34, 37, 1)'],
      light: ['rgba(223, 239, 248, 1)', 'rgba(236, 244, 249, 1)', 'rgba(249, 249, 251, 1)']
    },
    primaryTextColor: '#000000',
    secondaryTextColor: '',
    displayName: 'BetVictor'
  },
  bwin: {
    backgroundColor: 'rgba(255, 211, 0, 1)',
    gradientColors: {
      dark: [],
      light: []
    },
    primaryTextColor: '#000000',
    secondaryTextColor: '',
    displayName: 'Bwin'
  },
  codere: {
    backgroundColor: 'rgba(121, 192, 0, 1)',
    gradientColors: {
      dark: [],
      light: []
    },
    primaryTextColor: '#000000',
    secondaryTextColor: '',
    displayName: 'Codere'
  },
  espnbet: {
    backgroundColor: 'rgba(32, 244, 202, 1)',
    gradientColors: {
      dark: ['rgba(33,72,67,0.129)', 'rgba(33,53,52,0.129)', 'rgba(33,34,37,0.129)'],
      light: ['rgba(218,248,244,0.855)', 'rgba(233,249,247,0.916)', 'rgba(249,249,251,0.976)']
    },
    primaryTextColor: '#000000',
    secondaryTextColor: '',
    displayName: 'ESPN BET'
  },
  hardrock: {
    backgroundColor: 'rgba(106, 70, 243, 1)',
    gradientColors: {
      dark: ['rgba(46,41,74,0.180)', 'rgba(40,38,56,0.155)', 'rgba(33,34,37,0.129)'],
      light: ['rgba(228,223,250,0.894)', 'rgba(239,236,251,0.935)', 'rgba(249,249,251,0.976)']
    },
    sectionGradientColors: {
      light: ['rgba(252,252,253,0.988)', 'rgba(228,223,250,0.894)', 'rgba(252,252,253,0.988)'],
      dark: ['rgba(17,17,19,0.067)', 'rgba(46,41,74,0.180)', 'rgba(17,17,19,0.067)']
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: 'Hard Rock'
  },
  ladbrokes: {
    backgroundColor: 'rgba(241, 30, 40, 1)',
    gradientColors: {
      dark: [],
      light: []
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: 'Ladbrokes'
  },
  leovegas: {
    backgroundColor: 'rgba(238, 68, 0, 1)',
    gradientColors: {
      dark: [],
      light: []
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: 'LeoVegas'
  },
  midnite: {
    backgroundColor: 'rgba(70, 255, 51, 1)',
    gradientColors: {
      dark: [],
      light: []
    },
    primaryTextColor: '#000000',
    secondaryTextColor: '',
    displayName: 'Midnite'
  },
  miseojeu: {
    backgroundColor: 'rgba(0, 0, 0, 1)',
    gradientColors: {
      dark: ['rgba(36, 47, 76, 1)', 'rgba(35, 41, 57, 1)', 'rgba(33, 34, 37, 1)'],
      light: ['rgba(220, 228, 251, 1)', 'rgba(235, 239, 251, 1)', 'rgba(249, 249, 251, 1)']
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: 'Mise-o-jeu'
  },
  neds: {
    backgroundColor: 'rgba(255, 79, 2, 1)',
    gradientColors: {
      dark: [],
      light: []
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: 'Neds'
  },
  picklebet: {
    backgroundColor: 'rgba(87, 211, 59, 1)',
    gradientColors: {
      dark: [],
      light: []
    },
    primaryTextColor: '#000000',
    secondaryTextColor: '',
    displayName: 'Picklebet'
  },
  sportsinteraction: {
    backgroundColor: 'rgba(233, 95, 40, 1)',
    gradientColors: {
      dark: ['rgba(70,45,38,0.275)', 'rgba(52,40,38,0.202)', 'rgba(33,34,37,0.129)'],
      light: ['rgba(247,227,221,0.969)', 'rgba(248,238,236,0.973)', 'rgba(249,249,251,0.976)']
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: 'Sports Interaction'
  },
  tonybet: {
    backgroundColor: 'rgba(59, 59, 59, 1)',
    gradientColors: {
      dark: ['rgba(50, 29, 71, 1)', 'rgba(42, 32, 54, 1)', 'rgba(33, 34, 37, 1)'],
      light: ['rgba(234, 213, 251, 1)', 'rgba(241, 231, 251, 1)', 'rgba(249, 249, 251, 1)']
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: 'TonyBet'
  },
  williamhill: {
    backgroundColor: 'rgba(6, 10, 43, 1)',
    gradientColors: {
      dark: [],
      light: []
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: 'William Hill'
  },
  polymarket: {
    backgroundColor: 'rgba(22, 83, 240, 1)',
    gradientColors: {
      dark: ['rgba(32,43,74,0.125)', 'rgba(33,39,56,0.127)', 'rgba(33,34,37,0.129)'],
      light: ['rgba(218,226,249,0.855)', 'rgba(233,237,250,0.916)', 'rgba(249,249,251,0.976)']
    },
    sectionGradientColors: {
      light: ['rgba(252,252,253,0.988)', 'rgba(218,226,249,0.855)', 'rgba(252,252,253,0.988)'],
      dark: ['rgba(17,17,19,0.067)', 'rgba(32,43,74,0.125)', 'rgba(17,17,19,0.067)']
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: 'Polymarket',
    accentBackgroundColor: 'rgba(0,0,0,1)',
    dailyOfferBackgroundColor: 'rgba(0,120,255,1)',
    accentTextColor: '#ffffffff',
    // dailyOfferTextColor: '',
  },
  // Not a sportsbook but needed for ad display
  stadiumlive: {
    backgroundColor: 'rgba(113, 65, 233, 1)',
    gradientColors: {
      dark: ['rgba(47,40,72,0.184)', 'rgba(40,37,55,0.157)', 'rgba(33,34,37,0.129)'],
      light: ['rgba(229,223,249,0.898)', 'rgba(239,236,250,0.937)', 'rgba(249,249,251,0.976)']
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: 'Stadium Live'
  },
  onyxodds: {
    backgroundColor: 'rgba(99, 91, 255, 1)',
    gradientColors: {
      dark: ['rgba(45, 45, 76, 1)', 'rgba(39, 40, 57, 1)', 'rgba(33, 34, 37, 1)'],
      light: ['rgba(227, 226, 251, 1)', 'rgba(238, 237, 251, 1)', 'rgba(249, 249, 251, 1)']
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: 'Onyx Odds'
  },
  fliff: {
    backgroundColor: 'rgba(6, 143, 164, 1)',
    gradientColors: {
      dark: ['rgba(29, 54, 60, 1)', 'rgba(31, 44, 49, 1)', 'rgba(33, 34, 37, 1)'],
      light: ['rgba(214, 234, 239, 1)', 'rgba(231, 241, 245, 1)', 'rgba(249, 249, 251, 1)']
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: 'Fliff'
  },
  rebet: {
    backgroundColor: 'rgba(251, 115, 30, 1)',
    gradientColors: {
      dark: ['rgba(72,49,36,0.282)', 'rgba(53,42,37,0.206)', 'rgba(33,34,37,0.129)'],
      light: ['rgba(249,230,219,0.976)', 'rgba(249,239,235,0.976)', 'rgba(249,249,251,0.976)']
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: 'ReBet'
  },
  thrillzz: {
    backgroundColor: 'rgba(205, 255, 0, 1)',
    gradientColors: {
      dark: ['rgba(28, 50, 77, 1)', 'rgba(31, 42, 57, 1)', 'rgba(33, 34, 37, 1)'],
      light: ['rgba(213, 230, 251, 1)', 'rgba(231, 239, 251, 1)', 'rgba(249, 249, 251, 1)']
    },
    primaryTextColor: '#000000',
    secondaryTextColor: '',
    displayName: 'Thrillzz'
  },
  kalshi: {
    backgroundColor: 'rgba(9,194,133,1)',
    gradientColors: {
      light: ['rgba(218,226,249,0.855)', 'rgba(233,237,250,0.916)', 'rgba(249,249,251,0.976)'],
      dark: ['rgba(29,63,54,0.114)', 'rgba(31,49,46,0.122)', 'rgba(33,34,37,0.129)']
    },
    sectionGradientColors: {
      light: ['rgba(252,252,253,0.988)', 'rgba(215,241,234,0.843)', 'rgba(252,252,253,0.988)'],
      dark: ['rgba(17,17,19,0.067)', 'rgba(29,63,54,0.114)', 'rgba(17,17,19,0.067)']
    },
    primaryTextColor: '#FFFFFF',
    secondaryTextColor: '',
    displayName: 'Kalshi',
    accentBackgroundColor: 'rgba(64,224,172,1)',
    dailyOfferBackgroundColor: 'rgba(0,0,0,1)',
    accentTextColor: '#1c2024ff',
    // dailyOfferTextColor: '',
  },
  rollcard: {
    backgroundColor: 'rgba(255,0,0,1)',
    gradientColors: {
      dark: ['rgba(73,29,31,0.286)', 'rgba(53,32,34,0.208)', 'rgba(33,34,37,0.129)'],
      light: ['rgba(255,218,218,1)', 'rgba(252,233,235,0.988)', 'rgba(249,249,251,0.976)']
    },
    primaryTextColor: '#000000',
    secondaryTextColor: '',
    displayName: 'Rollcard'
  },
}
