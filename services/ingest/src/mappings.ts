// Tablas de mapeo estrictas: nombre o código de la fuente -> slug del manifest de emblemas
// (pitchlab-brand/sports/.../manifest.json).
// Regla (PREMVP-01 §H):
// - ID canónico de equipo: <league>.<slug> (ej. liga-mx.atlante != liga-mx.atlas).
// - Si un nombre de la fuente no está registrado en la tabla de la liga, el pipeline
//   falla de inmediato con UnmappedTeamError (nunca adivina).
import { asLeagueId, asTeamId, type LeagueId, type Team } from "@pitchlab/contracts";
import { getTeamAsset, TEAM_ASSETS } from "@pitchlab/sports-assets";

export class UnmappedTeamError extends Error {
  readonly league: string;
  readonly rawName: string;

  constructor(league: string, rawName: string) {
    super(
      `[UnmappedTeamError] Equipo no registrado en la tabla de mapeo de '${league}': '${rawName}'. Agrega la entrada explícita antes de continuar.`,
    );
    this.name = "UnmappedTeamError";
    this.league = league;
    this.rawName = rawName;
  }
}

/** Nombres cortos legibles para NFL (el manifest de NFL usa el nombre completo en shortName). */
export const NFL_SHORT_NAMES: Record<string, string> = {
  "arizona-cardinals": "Arizona",
  "atlanta-falcons": "Atlanta",
  "baltimore-ravens": "Baltimore",
  "buffalo-bills": "Buffalo",
  "carolina-panthers": "Carolina",
  "chicago-bears": "Chicago",
  "cincinnati-bengals": "Cincinnati",
  "cleveland-browns": "Cleveland",
  "dallas-cowboys": "Dallas",
  "denver-broncos": "Denver",
  "detroit-lions": "Detroit",
  "green-bay-packers": "Green Bay",
  "houston-texans": "Houston",
  "indianapolis-colts": "Indianapolis",
  "jacksonville-jaguars": "Jacksonville",
  "kansas-city-chiefs": "Kansas City",
  "las-vegas-raiders": "Las Vegas",
  "los-angeles-chargers": "LA Chargers",
  "los-angeles-rams": "LA Rams",
  "miami-dolphins": "Miami",
  "minnesota-vikings": "Minnesota",
  "new-england-patriots": "New England",
  "new-orleans-saints": "New Orleans",
  "new-york-giants": "NY Giants",
  "new-york-jets": "NY Jets",
  "philadelphia-eagles": "Philadelphia",
  "pittsburgh-steelers": "Pittsburgh",
  "san-francisco-49ers": "San Francisco",
  "seattle-seahawks": "Seattle",
  "tampa-bay-buccaneers": "Tampa Bay",
  "tennessee-titans": "Tennessee",
  "washington-commanders": "Washington",
};

/** Mapeo nflverse (`games.csv`) → slug de `pitchlab-brand/american-football/nfl-2026/manifest.json` */
export const NFL_TEAM_MAP: Record<string, string> = {
  ARI: "arizona-cardinals",
  "Arizona Cardinals": "arizona-cardinals",
  ATL: "atlanta-falcons",
  "Atlanta Falcons": "atlanta-falcons",
  BAL: "baltimore-ravens",
  "Baltimore Ravens": "baltimore-ravens",
  BUF: "buffalo-bills",
  "Buffalo Bills": "buffalo-bills",
  CAR: "carolina-panthers",
  "Carolina Panthers": "carolina-panthers",
  CHI: "chicago-bears",
  "Chicago Bears": "chicago-bears",
  CIN: "cincinnati-bengals",
  "Cincinnati Bengals": "cincinnati-bengals",
  CLE: "cleveland-browns",
  "Cleveland Browns": "cleveland-browns",
  DAL: "dallas-cowboys",
  "Dallas Cowboys": "dallas-cowboys",
  DEN: "denver-broncos",
  "Denver Broncos": "denver-broncos",
  DET: "detroit-lions",
  "Detroit Lions": "detroit-lions",
  GB: "green-bay-packers",
  "Green Bay Packers": "green-bay-packers",
  HOU: "houston-texans",
  "Houston Texans": "houston-texans",
  IND: "indianapolis-colts",
  "Indianapolis Colts": "indianapolis-colts",
  JAX: "jacksonville-jaguars",
  "Jacksonville Jaguars": "jacksonville-jaguars",
  KC: "kansas-city-chiefs",
  "Kansas City Chiefs": "kansas-city-chiefs",
  LV: "las-vegas-raiders",
  "Las Vegas Raiders": "las-vegas-raiders",
  LAC: "los-angeles-chargers",
  "Los Angeles Chargers": "los-angeles-chargers",
  LA: "los-angeles-rams",
  LAR: "los-angeles-rams",
  "Los Angeles Rams": "los-angeles-rams",
  MIA: "miami-dolphins",
  "Miami Dolphins": "miami-dolphins",
  MIN: "minnesota-vikings",
  "Minnesota Vikings": "minnesota-vikings",
  NE: "new-england-patriots",
  "New England Patriots": "new-england-patriots",
  NO: "new-orleans-saints",
  "New Orleans Saints": "new-orleans-saints",
  NYG: "new-york-giants",
  "New York Giants": "new-york-giants",
  NYJ: "new-york-jets",
  "New York Jets": "new-york-jets",
  PHI: "philadelphia-eagles",
  "Philadelphia Eagles": "philadelphia-eagles",
  PIT: "pittsburgh-steelers",
  "Pittsburgh Steelers": "pittsburgh-steelers",
  SF: "san-francisco-49ers",
  "San Francisco 49ers": "san-francisco-49ers",
  SEA: "seattle-seahawks",
  "Seattle Seahawks": "seattle-seahawks",
  TB: "tampa-bay-buccaneers",
  "Tampa Bay Buccaneers": "tampa-bay-buccaneers",
  TEN: "tennessee-titans",
  "Tennessee Titans": "tennessee-titans",
  WAS: "washington-commanders",
  "Washington Commanders": "washington-commanders",
};

/** Mapeo openfootball (`2026-27/en.1.json`) → slug de `pitchlab-brand/football/premier-league-2026-27/manifest.json` */
export const PREMIER_LEAGUE_TEAM_MAP: Record<string, string> = {
  "AFC Bournemouth": "afc-bournemouth",
  Bournemouth: "afc-bournemouth",
  "Arsenal FC": "arsenal",
  Arsenal: "arsenal",
  "Aston Villa FC": "aston-villa",
  "Aston Villa": "aston-villa",
  "Brentford FC": "brentford",
  Brentford: "brentford",
  "Brighton & Hove Albion FC": "brighton-hove-albion",
  "Brighton & Hove Albion": "brighton-hove-albion",
  Brighton: "brighton-hove-albion",
  "Chelsea FC": "chelsea",
  Chelsea: "chelsea",
  "Coventry City FC": "coventry-city",
  "Coventry City": "coventry-city",
  "Crystal Palace FC": "crystal-palace",
  "Crystal Palace": "crystal-palace",
  "Everton FC": "everton",
  Everton: "everton",
  "Fulham FC": "fulham",
  Fulham: "fulham",
  "Hull City AFC": "hull-city",
  "Hull City": "hull-city",
  "Ipswich Town FC": "ipswich-town",
  "Ipswich Town": "ipswich-town",
  "Leeds United FC": "leeds-united",
  "Leeds United": "leeds-united",
  "Liverpool FC": "liverpool",
  Liverpool: "liverpool",
  "Manchester City FC": "manchester-city",
  "Manchester City": "manchester-city",
  "Manchester United FC": "manchester-united",
  "Manchester United": "manchester-united",
  "Newcastle United FC": "newcastle-united",
  "Newcastle United": "newcastle-united",
  "Nottingham Forest FC": "nottingham-forest",
  "Nottingham Forest": "nottingham-forest",
  "Sunderland AFC": "sunderland",
  Sunderland: "sunderland",
  "Tottenham Hotspur FC": "tottenham-hotspur",
  "Tottenham Hotspur": "tottenham-hotspur",
};

/** Mapeo API-Football Liga MX → slug de `pitchlab-brand/football/liga-mx-apertura-2026/manifest.json` */
export const LIGA_MX_TEAM_MAP: Record<string, string> = {
  "Club America": "america",
  "Club América": "america",
  America: "america",
  América: "america",
  Atlante: "atlante",
  "CF Atlante": "atlante",
  "Atlante FC": "atlante",
  Mazatlán: "atlante",
  Mazatlan: "atlante",
  "Mazatlán FC": "atlante",
  Atlas: "atlas",
  "Atlas FC": "atlas",
  "Atletico San Luis": "atletico-san-luis",
  "Atlético de San Luis": "atletico-san-luis",
  "Atlético San Luis": "atletico-san-luis",
  "Guadalajara Chivas": "chivas",
  "Chivas Guadalajara": "chivas",
  Guadalajara: "chivas",
  Chivas: "chivas",
  "Cruz Azul": "cruz-azul",
  "CF Cruz Azul": "cruz-azul",
  "FC Juarez": "fc-juarez",
  "FC Juárez": "fc-juarez",
  Juarez: "fc-juarez",
  Juárez: "fc-juarez",
  Leon: "leon",
  León: "leon",
  "Club Leon": "leon",
  "Club León": "leon",
  Monterrey: "monterrey",
  "CF Monterrey": "monterrey",
  "Rayados de Monterrey": "monterrey",
  Necaxa: "necaxa",
  "Club Necaxa": "necaxa",
  Pachuca: "pachuca",
  "CF Pachuca": "pachuca",
  Puebla: "puebla",
  "Club Puebla": "puebla",
  "Pumas UNAM": "pumas-unam",
  "UNAM Pumas": "pumas-unam",
  "U.N.A.M. - Pumas": "pumas-unam",
  Pumas: "pumas-unam",
  Queretaro: "queretaro",
  Querétaro: "queretaro",
  "Club Queretaro": "queretaro",
  "Santos Laguna": "santos-laguna",
  "Club Santos Laguna": "santos-laguna",
  "Tigres UANL": "tigres-uanl",
  Tigres: "tigres-uanl",
  "Club Tijuana": "tijuana",
  "Xolos de Tijuana": "tijuana",
  Tijuana: "tijuana",
  Toluca: "toluca",
  "Deportivo Toluca": "toluca",
};

const LEAGUE_MAPS: Record<string, Record<string, string>> = {
  nfl: NFL_TEAM_MAP,
  "premier-league": PREMIER_LEAGUE_TEAM_MAP,
  "liga-mx": LIGA_MX_TEAM_MAP,
};

export function resolveCanonicalTeam(
  league: "nfl" | "premier-league" | "liga-mx",
  rawName: string,
): Team {
  const table = LEAGUE_MAPS[league];
  if (!table) {
    throw new UnmappedTeamError(league, rawName);
  }
  const trimmed = rawName.trim();
  const slug = table[trimmed];
  if (!slug) {
    throw new UnmappedTeamError(league, rawName);
  }

  const canonicalId = `${league}.${slug}`;
  const asset = getTeamAsset(canonicalId);
  if (!asset) {
    throw new Error(`El slug '${slug}' mapeado para '${rawName}' no existe en el manifest de '${league}'.`);
  }

  const shortName =
    league === "nfl"
      ? (NFL_SHORT_NAMES[slug] ?? asset.shortName)
      : asset.shortName;

  return {
    id: asTeamId(canonicalId),
    league: asLeagueId(league as LeagueId),
    name: asset.name,
    shortName,
    code: asset.code,
  };
}

export function listAllTeamsForLeague(league: "nfl" | "premier-league" | "liga-mx"): Team[] {
  return Object.values(TEAM_ASSETS)
    .filter((a) => a.league === league)
    .map((a) => ({
      id: asTeamId(a.id),
      league: asLeagueId(league as LeagueId),
      name: a.name,
      shortName: league === "nfl" ? (NFL_SHORT_NAMES[a.slug] ?? a.shortName) : a.shortName,
      code: a.code,
    }));
}
