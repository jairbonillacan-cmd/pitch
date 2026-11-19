// Tablas de mapeo estrictas: nombre o código de la fuente -> slug del manifest de emblemas
// (pitchlab-brand/sports/.../manifest.json).
// Regla (PREMVP-01 §H):
// - ID canónico de equipo: <league>.<slug> (ej. liga-mx.atlante != liga-mx.atlas).
// - Si un nombre de la fuente no está registrado en la tabla de la liga, el pipeline
//   falla de inmediato con UnmappedTeamError (nunca adivina).
import {
  NATIONAL_COMPETITION_IDS,
  asLeagueId,
  asTeamId,
  findNationalTeamDef,
  isNationalCompetition,
  type LeagueId,
  type Team,
} from "@pitchlab/contracts";
import {
  getBzzoiroTeamEmblemUrl,
  getOfficialEspnTeamLogoUrl,
  getTeamAsset,
  TEAM_ASSETS,
} from "@pitchlab/sports-assets";
import { slugifyTeamName, teamCodeFromSlug } from "./team-slug.js";

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
  Tottenham: "tottenham-hotspur",
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
  Atlas: "atlas",
  "Atlas FC": "atlas",
  "Atletico San Luis": "atletico-san-luis",
  "Atlético de San Luis": "atletico-san-luis",
  "Atlético San Luis": "atletico-san-luis",
  "Guadalajara Chivas": "chivas",
  "Chivas Guadalajara": "chivas",
  Guadalajara: "chivas",
  "CD Guadalajara": "chivas",
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
  Santos: "santos-laguna",
  "Club Santos Laguna": "santos-laguna",
  "Tigres UANL": "tigres-uanl",
  Tigres: "tigres-uanl",
  "Club Tijuana": "tijuana",
  "Xolos de Tijuana": "tijuana",
  Tijuana: "tijuana",
  Toluca: "toluca",
  "Deportivo Toluca": "toluca",
  "CD Toluca": "toluca",
};

/** Mapeo openfootball (`2026-27/es.1.json`) → slug de `pitchlab-brand/football/laliga-2026-27/manifest.json` */
export const LALIGA_TEAM_MAP: Record<string, string> = {
  "Athletic Club": "athletic-club",
  "Athletic Bilbao": "athletic-club",
  "CA Osasuna": "osasuna",
  Osasuna: "osasuna",
  "Club Atlético de Madrid": "atletico-madrid",
  "Atlético de Madrid": "atletico-madrid",
  "Atlético Madrid": "atletico-madrid",
  "Atletico Madrid": "atletico-madrid",
  "Deportivo Alavés": "alaves",
  Alavés: "alaves",
  Alaves: "alaves",
  "Elche CF": "elche",
  Elche: "elche",
  "FC Barcelona": "barcelona",
  Barcelona: "barcelona",
  "Getafe CF": "getafe",
  Getafe: "getafe",
  "Levante UD": "levante",
  Levante: "levante",
  "Málaga CF": "malaga",
  Málaga: "malaga",
  Malaga: "malaga",
  "RC Celta de Vigo": "celta-vigo",
  "Celta de Vigo": "celta-vigo",
  Celta: "celta-vigo",
  "RC Deportivo La Coruña": "deportivo-la-coruna",
  "Deportivo de La Coruña": "deportivo-la-coruna",
  "Deportivo La Coruña": "deportivo-la-coruna",
  "Deportivo de A Coruña": "deportivo-la-coruna",
  "RCD Espanyol de Barcelona": "espanyol",
  "RCD Espanyol": "espanyol",
  Espanyol: "espanyol",
  "Rayo Vallecano de Madrid": "rayo-vallecano",
  "Rayo Vallecano": "rayo-vallecano",
  "Real Betis Balompié": "real-betis",
  "Real Betis": "real-betis",
  "Real Madrid CF": "real-madrid",
  "Real Madrid": "real-madrid",
  "Real Racing Club de Santander": "racing-santander",
  "Real Racing Club": "racing-santander",
  "Racing de Santander": "racing-santander",
  "Racing Santander": "racing-santander",
  Racing: "racing-santander",
  "Real Sociedad de Fútbol": "real-sociedad",
  "Real Sociedad": "real-sociedad",
  "Sevilla FC": "sevilla",
  Sevilla: "sevilla",
  "Valencia CF": "valencia",
  Valencia: "valencia",
  "Villarreal CF": "villarreal",
  Villarreal: "villarreal",
};

/**
 * Clubes que jugaron en la liga en temporadas pasadas pero no están en la actual (sin
 * escudo en el paquete de marca). Aparecen en el historial directo y en el corpus: se
 * resuelven con su **nombre real** y un id propio (`<liga>.<slug>`), y la app los dibuja
 * con sus iniciales. Nunca se asignan al escudo de otro club (P0-03 de la auditoría
 * 2026-11-13: antes West Ham salía como Coventry City y Mazatlán como Atlante).
 * Valor: nombre canónico con el que se muestra.
 */
export const HISTORIC_TEAMS: Record<string, Record<string, string>> = {
  "premier-league": {
    "West Ham United FC": "West Ham United",
    "West Ham United": "West Ham United",
    "West Ham": "West Ham United",
    "Southampton FC": "Southampton",
    Southampton: "Southampton",
    "Wolverhampton Wanderers FC": "Wolverhampton Wanderers",
    "Wolverhampton Wanderers": "Wolverhampton Wanderers",
    Wolves: "Wolverhampton Wanderers",
    "Leicester City FC": "Leicester City",
    "Leicester City": "Leicester City",
    "Burnley FC": "Burnley",
    Burnley: "Burnley",
  },
  "liga-mx": {
    Mazatlán: "Mazatlán FC",
    Mazatlan: "Mazatlán FC",
    "Mazatlán FC": "Mazatlán FC",
    "Mazatlan FC": "Mazatlán FC",
  },
};

export const MLB_TEAM_MAP: Record<string, string> = {
  AZ: "arizona-diamondbacks",
  ARI: "arizona-diamondbacks",
  "Arizona Diamondbacks": "arizona-diamondbacks",
  "Arizona D-backs": "arizona-diamondbacks",
  "D-backs": "arizona-diamondbacks",
  ATH: "athletics",
  OAK: "athletics",
  Athletics: "athletics",
  "Oakland Athletics": "athletics",
  "Sacramento Athletics": "athletics",
  ATL: "atlanta-braves",
  "Atlanta Braves": "atlanta-braves",
  BAL: "baltimore-orioles",
  "Baltimore Orioles": "baltimore-orioles",
  BOS: "boston-red-sox",
  "Boston Red Sox": "boston-red-sox",
  CHC: "chicago-cubs",
  "Chicago Cubs": "chicago-cubs",
  CWS: "chicago-white-sox",
  CHW: "chicago-white-sox",
  "Chicago White Sox": "chicago-white-sox",
  CIN: "cincinnati-reds",
  "Cincinnati Reds": "cincinnati-reds",
  CLE: "cleveland-guardians",
  "Cleveland Guardians": "cleveland-guardians",
  "Cleveland Indians": "cleveland-guardians",
  COL: "colorado-rockies",
  "Colorado Rockies": "colorado-rockies",
  DET: "detroit-tigers",
  "Detroit Tigers": "detroit-tigers",
  HOU: "houston-astros",
  "Houston Astros": "houston-astros",
  KC: "kansas-city-royals",
  KCR: "kansas-city-royals",
  "Kansas City Royals": "kansas-city-royals",
  LAA: "los-angeles-angels",
  ANA: "los-angeles-angels",
  "Los Angeles Angels": "los-angeles-angels",
  LAD: "los-angeles-dodgers",
  "Los Angeles Dodgers": "los-angeles-dodgers",
  "LA Dodgers": "los-angeles-dodgers",
  MIA: "miami-marlins",
  "Miami Marlins": "miami-marlins",
  MIL: "milwaukee-brewers",
  "Milwaukee Brewers": "milwaukee-brewers",
  MIN: "minnesota-twins",
  "Minnesota Twins": "minnesota-twins",
  NYM: "new-york-mets",
  "New York Mets": "new-york-mets",
  "NY Mets": "new-york-mets",
  NYY: "new-york-yankees",
  "New York Yankees": "new-york-yankees",
  "NY Yankees": "new-york-yankees",
  PHI: "philadelphia-phillies",
  "Philadelphia Phillies": "philadelphia-phillies",
  PIT: "pittsburgh-pirates",
  "Pittsburgh Pirates": "pittsburgh-pirates",
  SD: "san-diego-padres",
  SDP: "san-diego-padres",
  "San Diego Padres": "san-diego-padres",
  SF: "san-francisco-giants",
  SFG: "san-francisco-giants",
  "San Francisco Giants": "san-francisco-giants",
  SEA: "seattle-mariners",
  "Seattle Mariners": "seattle-mariners",
  STL: "st-louis-cardinals",
  "St. Louis Cardinals": "st-louis-cardinals",
  "Saint Louis Cardinals": "st-louis-cardinals",
  TB: "tampa-bay-rays",
  TBR: "tampa-bay-rays",
  "Tampa Bay Rays": "tampa-bay-rays",
  TEX: "texas-rangers",
  "Texas Rangers": "texas-rangers",
  TOR: "toronto-blue-jays",
  "Toronto Blue Jays": "toronto-blue-jays",
  WSH: "washington-nationals",
  WAS: "washington-nationals",
  "Washington Nationals": "washington-nationals",
};

export const NHL_TEAM_MAP: Record<string, string> = {
  "Montreal Canadiens": "montreal-canadiens",
  "Montréal Canadiens": "montreal-canadiens",
  "St. Louis Blues": "st-louis-blues",
  "St Louis Blues": "st-louis-blues",
  "Utah Mammoth": "utah-mammoth",
  "Utah Hockey Club": "utah-mammoth",
};

const LEAGUE_MAPS: Record<string, Record<string, string>> = {
  nfl: NFL_TEAM_MAP,
  mlb: MLB_TEAM_MAP,
  "premier-league": PREMIER_LEAGUE_TEAM_MAP,
  "liga-mx": LIGA_MX_TEAM_MAP,
  laliga: LALIGA_TEAM_MAP,
  // NHL: los nombres de la fuente coinciden con el manifiesto de emblemas (32/32) + alias sin acento/renombre.
  nhl: NHL_TEAM_MAP,
};

export type CanonicalLeague =
  | "nfl"
  | "premier-league"
  | "liga-mx"
  | "laliga"
  | "bundesliga"
  | "serie-a"
  | "ligue-1";

export type NationalLeague = (typeof NATIONAL_COMPETITION_IDS)[number];

/** Ligas cuyos equipos se resuelven y validan (las de momios + selecciones + NHL, NBA y MLB). */
export type TeamLeague = CanonicalLeague | NationalLeague | "nhl" | "nba" | "mlb";

/**
 * Ligas sin manifiesto de emblemas propio: el nombre de la fuente se confía y se
 * convierte a slug con el mismo algoritmo del histórico (`team-slug.ts`), para que los
 * ids de la temporada en curso y los del corpus pasado coincidan.
 */
export const GENERIC_LEAGUES: ReadonlySet<string> = new Set([
  "bundesliga",
  "serie-a",
  "ligue-1",
  // NBA aún no tiene emblemas propios: id por nombre y la app muestra iniciales.
  "nba",
  ...NATIONAL_COMPETITION_IDS,
]);

export function resolveCanonicalTeam(
  league: TeamLeague,
  rawName: string,
): Team {
  const trimmed = rawName.trim();
  const table = LEAGUE_MAPS[league];

  if (!table) {
    if (!GENERIC_LEAGUES.has(league)) {
      throw new UnmappedTeamError(league, rawName);
    }
    if (isNationalCompetition(league)) {
      const national = findNationalTeamDef(trimmed);
      if (national) {
        const logoUrl =
          getOfficialEspnTeamLogoUrl(league, national.slug) ?? national.emblemPath;
        return {
          id: asTeamId(`${league}.${national.slug}`),
          league: asLeagueId(league as LeagueId),
          name: national.nameEs,
          shortName: national.shortEs,
          code: national.code,
          ...(logoUrl ? { logoUrl } : {}),
        };
      }
    }
    const normalizedRaw =
      league === "nba" && trimmed === "LA Clippers" ? "Los Angeles Clippers" : trimmed;
    const slug = slugifyTeamName(normalizedRaw);
    const logoUrl =
      getBzzoiroTeamEmblemUrl(league, slug) ?? getOfficialEspnTeamLogoUrl(league, slug);
    return {
      id: asTeamId(`${league}.${slug}`),
      league: asLeagueId(league as LeagueId),
      name: normalizedRaw,
      shortName: normalizedRaw,
      code: teamCodeFromSlug(slug),
      ...(logoUrl ? { logoUrl } : {}),
    };
  }

  let slug = table[trimmed];
  if (!slug) {
    const manifestMatch = Object.values(TEAM_ASSETS).find(
      (a) => a.league === league && a.name === trimmed,
    );
    if (manifestMatch) {
      slug = manifestMatch.slug;
    }
  }
  if (!slug) {
    const historic = HISTORIC_TEAMS[league]?.[trimmed];
    if (historic) {
      const historicSlug = slugifyTeamName(historic);
      const historicLogoUrl = getBzzoiroTeamEmblemUrl(league, historicSlug);
      return {
        id: asTeamId(`${league}.${historicSlug}`),
        league: asLeagueId(league as LeagueId),
        name: historic,
        shortName: historic,
        code: teamCodeFromSlug(historicSlug),
        ...(historicLogoUrl ? { logoUrl: historicLogoUrl } : {}),
      };
    }
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
  const logoUrl =
    getBzzoiroTeamEmblemUrl(league, slug) ?? getOfficialEspnTeamLogoUrl(league, slug);

  return {
    id: asTeamId(canonicalId),
    league: asLeagueId(league as LeagueId),
    name: asset.name,
    shortName,
    code: asset.code,
    ...(logoUrl ? { logoUrl } : {}),
  };
}

export function listAllTeamsForLeague(league: TeamLeague): Team[] {
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
