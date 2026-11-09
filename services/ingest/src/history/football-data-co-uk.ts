/**
 * Histórico de cuotas de cierre y estadísticas de partido desde football-data.co.uk.
 *
 * Por qué existe: el corpus canónico (openfootball) trae resultados, pero no cuotas ni
 * estadísticas de partido. Sin cuotas no hay forma de saber si el modelo le gana al
 * mercado, y sin tiros/córners no hay features para un GBM.
 *
 * Licencia: los términos del sitio no están localizados, así que este dataset es
 * **research-only** (`FREE_DATA_STRATEGY.md` §1): se usa para backtests y features
 * internas, no se publica ni se redistribuye.
 *
 * Cobertura observada (2026-11-09):
 *  - Cuotas de cierre (columnas `*C*`) desde 2020-21.
 *  - Cuotas pre-partido (Pinnacle desde 2012-13; B365 desde 2010-11) antes de esa fecha.
 *  - Tiros, tiros a puerta, córners y tarjetas en todas las temporadas descargadas.
 */
import { parseCsv } from "../adapters/nflverse.js";
import type { HistoryLeagueConfig } from "./leagues.js";
import { slugifyTeamName } from "./teams.js";
import type { ResearchGame, ResearchMatchStats, ResearchOdds } from "./research-schema.js";

export const FOOTBALL_DATA_CO_UK_BASE = "https://www.football-data.co.uk/mmz4281";

/** División de football-data.co.uk por liga del catálogo histórico. */
export const FD_DIVISION_BY_LEAGUE: Readonly<Record<string, string>> = {
  "premier-league": "E0",
  "la-liga": "SP1",
  bundesliga: "D1",
  "serie-a": "I1",
  "ligue-1": "F1",
};

/** Temporadas que publica football-data.co.uk (desde 1993-94 para las cinco grandes). */
export const FD_SEASONS = [
  "1993-94",
  "1994-95",
  "1995-96",
  "1996-97",
  "1997-98",
  "1998-99",
  "1999-00",
  "2000-01",
  "2001-02",
  "2002-03",
  "2003-04",
  "2004-05",
  "2005-06",
  "2006-07",
  "2007-08",
  "2008-09",
  "2009-10",
  "2010-11",
  "2011-12",
  "2012-13",
  "2013-14",
  "2014-15",
  "2015-16",
  "2016-17",
  "2017-18",
  "2018-19",
  "2019-20",
  "2020-21",
  "2021-22",
  "2022-23",
  "2023-24",
  "2024-25",
  "2025-26",
  "2026-27",
] as const;

/** Convierte `2010-11` en el código `1011` que usa el sitio. */
export function fdSeasonCode(season: string): string {
  const match = season.match(/^(\d{4})-(\d{2}|\d{4})$/);
  if (!match) throw new Error(`Temporada inválida para football-data.co.uk: '${season}'.`);
  const start = match[1]!;
  const end = match[2]!;
  return start.slice(2) + (end.length === 4 ? end.slice(2) : end);
}

export function fdSeasonUrl(season: string, division: string): string {
  return `${FOOTBALL_DATA_CO_UK_BASE}/${fdSeasonCode(season)}/${division}.csv`;
}

/**
 * Nombre de football-data.co.uk → slug del corpus histórico.
 * Solo se listan los clubes que existen en el corpus; los demás se reportan como no
 * emparejados (temporadas antiguas con clubes que ya no están en la liga).
 */
export const FD_TEAM_SLUGS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "premier-league": {
    Arsenal: "arsenal",
    "Aston Villa": "aston-villa",
    Birmingham: "birmingham-city",
    Blackburn: "blackburn-rovers",
    Blackpool: "blackpool",
    Bolton: "bolton-wanderers",
    Bournemouth: "bournemouth",
    Brentford: "brentford",
    Brighton: "brighton-hove-albion",
    Burnley: "burnley",
    Cardiff: "cardiff-city",
    Chelsea: "chelsea",
    Coventry: "coventry-city",
    "Crystal Palace": "crystal-palace",
    Everton: "everton",
    Fulham: "fulham",
    Huddersfield: "huddersfield-town",
    Hull: "hull-city",
    Ipswich: "ipswich-town",
    Leeds: "leeds-united",
    Leicester: "leicester-city",
    Liverpool: "liverpool",
    Luton: "luton-town",
    "Man City": "manchester-city",
    "Man United": "manchester-united",
    Middlesbrough: "middlesbrough",
    Newcastle: "newcastle-united",
    Norwich: "norwich-city",
    "Nott'm Forest": "nottingham-forest",
    QPR: "queens-park-rangers",
    Reading: "reading",
    "Sheffield United": "sheffield-united",
    Southampton: "southampton",
    Stoke: "stoke-city",
    Sunderland: "sunderland",
    Swansea: "swansea-city",
    Tottenham: "tottenham-hotspur",
    Watford: "watford",
    "West Brom": "west-bromwich-albion",
    "West Ham": "west-ham-united",
    Wigan: "wigan-athletic",
    Wolves: "wolverhampton-wanderers",
  },
  "la-liga": {
    Alaves: "alaves",
    Almeria: "almeria",
    "Ath Bilbao": "athletic",
    "Ath Madrid": "atletico-madrid",
    Barcelona: "barcelona",
    Betis: "real-betis",
    Cadiz: "cadiz",
    Celta: "celta",
    Cordoba: "cordoba",
    Eibar: "sd-eibar",
    Elche: "elche",
    Espanol: "espanyol-barcelona",
    Getafe: "getafe",
    Girona: "girona",
    Granada: "granada",
    Huesca: "sd-huesca",
    "La Coruna": "deportivo-la-coruna",
    "Las Palmas": "las-palmas",
    Leganes: "leganes",
    Levante: "levante",
    Malaga: "malaga",
    Mallorca: "mallorca",
    Osasuna: "osasuna",
    Oviedo: "real-oviedo",
    "Real Madrid": "real-madrid",
    Santander: "real-racing-santander",
    Sevilla: "sevilla",
    Sociedad: "real-sociedad",
    "Sp Gijon": "sporting-gijon",
    Valencia: "valencia",
    Valladolid: "real-valladolid",
    Vallecano: "rayo-vallecano",
    Villarreal: "villarreal",
    Zaragoza: "real-zaragoza",
  },
  bundesliga: {
    Augsburg: "augsburg",
    "Bayern Munich": "bayern-munchen",
    Bielefeld: "arminia-bielefeld",
    Bochum: "bochum",
    Braunschweig: "eintracht-braunschweig",
    Darmstadt: "darmstadt",
    Dortmund: "borussia-dortmund",
    "Ein Frankfurt": "eintracht-frankfurt",
    Elversberg: "elversberg",
    "FC Koln": "koln",
    "Fortuna Dusseldorf": "fortuna-dusseldorf",
    Freiburg: "freiburg",
    "Greuther Furth": "greuther-furth",
    Hamburg: "hamburger",
    Hannover: "hannover",
    Heidenheim: "heidenheim",
    Hertha: "hertha-bsc",
    Hoffenheim: "hoffenheim",
    "Holstein Kiel": "holstein-kiel",
    Ingolstadt: "ingolstadt",
    Kaiserslautern: "kaiserslautern",
    Leverkusen: "bayer-leverkusen",
    "M'gladbach": "borussia-monchengladbach",
    Mainz: "mainz",
    Nurnberg: "nurnberg",
    Paderborn: "paderborn",
    "RB Leipzig": "rb-leipzig",
    "Schalke 04": "schalke",
    "St Pauli": "st-pauli",
    Stuttgart: "stuttgart",
    "Union Berlin": "union-berlin",
    "Werder Bremen": "werder-bremen",
    Wolfsburg: "wolfsburg",
  },
  "serie-a": {
    Atalanta: "atalanta",
    Benevento: "benevento",
    Bologna: "bologna",
    Brescia: "brescia",
    Cagliari: "cagliari",
    Carpi: "carpi",
    Catania: "catania",
    Cesena: "cesena",
    Chievo: "chievo-verona",
    Como: "como",
    Cremonese: "cremonese",
    Crotone: "crotone",
    Empoli: "empoli",
    Fiorentina: "fiorentina",
    Frosinone: "frosinone",
    Genoa: "genoa-cfc",
    Inter: "inter",
    Juventus: "juventus",
    Lazio: "lazio",
    Lecce: "lecce",
    Livorno: "livorno",
    Milan: "milan",
    Monza: "monza",
    Napoli: "napoli",
    Palermo: "palermo",
    Parma: "parma",
    Pescara: "delfino-pescara",
    Pisa: "pisa",
    Roma: "roma",
    Salernitana: "salernitana",
    Sampdoria: "sampdoria",
    Sassuolo: "sassuolo",
    Spal: "spal-ferrara",
    Spezia: "spezia",
    Torino: "torino",
    Udinese: "udinese",
    Venezia: "venezia",
    Verona: "hellas-verona",
  },
  "ligue-1": {
    Ajaccio: "ajaccio",
    "Ajaccio GFCO": "gazelec-ajaccio",
    Amiens: "amiens",
    Angers: "angers-sco",
    Auxerre: "aj-auxerre",
    Bastia: "bastia",
    Bordeaux: "girondins-bordeaux",
    Brest: "stade-brestois",
    Caen: "sm-caen",
    Clermont: "clermont-foot",
    Dijon: "dijon-fco",
    "Evian Thonon Gaillard": "evian-thonon-gaillard",
    Guingamp: "ea-guingamp",
    "Le Havre": "le-havre",
    "Le Mans": "le-mans",
    Lens: "lens",
    Lille: "lille-osc",
    Lorient: "lorient",
    Lyon: "olympique-lyonnais",
    Marseille: "olympique-marseille",
    Metz: "metz",
    Monaco: "monaco",
    Montpellier: "montpellier-hsc",
    Nancy: "nancy-lorraine",
    Nantes: "nantes",
    Nice: "ogc-nice",
    Nimes: "nimes-olympique",
    "Paris FC": "paris",
    "Paris SG": "paris-saint-germain",
    Reims: "stade-reims",
    Rennes: "stade-rennais",
    "St Etienne": "saint-etienne",
    Strasbourg: "strasbourg",
    Toulouse: "toulouse",
    Troyes: "estac-troyes",
  },
};

export interface FdNormalizeOptions {
  league: HistoryLeagueConfig;
  season: string;
  /**
   * Para temporadas anteriores al corpus (1993-94…2009-10): los clubes que no existen
   * en el corpus canónico reciben un slug derivado del nombre en vez de descartarse.
   * Solo se usa en el dataset research; nunca en el corpus publicable.
   */
  slugifyUnmapped?: boolean;
}

export interface FdSeasonResult {
  games: ResearchGame[];
  /** Nombres de equipo sin slug en el corpus (se descartan sus partidos). */
  unmatchedNames: string[];
  /** Nombres resueltos por slug derivado (temporadas antiguas, research-only). */
  fallbackNames: string[];
  skippedRows: number;
}

function parseNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

function asOdd(raw: string | undefined): number | null {
  const value = parseNumber(raw);
  if (value === null) return null;
  return value > 1 && value < 1000 ? value : null;
}

function asCount(raw: string | undefined): number | null {
  const value = parseNumber(raw);
  if (value === null) return null;
  return Number.isInteger(value) && value >= 0 && value <= 100 ? value : null;
}

/** Fecha `DD/MM/YYYY` o `DD/MM/YY` → `YYYY-MM-DD`. */
export function parseFdDate(raw: string): string | null {
  const match = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);
  if (match[3]!.length === 2) year += year < 70 ? 2000 : 1900;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

interface OddsSet {
  bookmaker: ResearchOdds["bookmaker"];
  timing: ResearchOdds["timing"];
  home: string;
  draw: string;
  away: string;
  over: string;
  under: string;
}

const CLOSING_SETS: readonly OddsSet[] = [
  {
    bookmaker: "Pinnacle",
    timing: "closing",
    home: "PSCH",
    draw: "PSCD",
    away: "PSCA",
    over: "PC>2.5",
    under: "PC<2.5",
  },
  {
    bookmaker: "B365",
    timing: "closing",
    home: "B365CH",
    draw: "B365CD",
    away: "B365CA",
    over: "B365C>2.5",
    under: "B365C<2.5",
  },
  {
    bookmaker: "Avg",
    timing: "closing",
    home: "AvgCH",
    draw: "AvgCD",
    away: "AvgCA",
    over: "AvgC>2.5",
    under: "AvgC<2.5",
  },
];

const PRE_MATCH_SETS: readonly OddsSet[] = [
  {
    bookmaker: "Pinnacle",
    timing: "pre-match",
    home: "PSH",
    draw: "PSD",
    away: "PSA",
    over: "P>2.5",
    under: "P<2.5",
  },
  {
    bookmaker: "B365",
    timing: "pre-match",
    home: "B365H",
    draw: "B365D",
    away: "B365A",
    over: "B365>2.5",
    under: "B365<2.5",
  },
  {
    bookmaker: "Avg",
    timing: "pre-match",
    home: "AvgH",
    draw: "AvgD",
    away: "AvgA",
    over: "Avg>2.5",
    under: "Avg<2.5",
  },
];

/** Elige el mejor conjunto de cuotas disponible: cierre > pre-partido, Pinnacle > B365 > Avg. */
export function selectOdds(row: Readonly<Record<string, string>>): ResearchOdds | null {
  for (const set of [...CLOSING_SETS, ...PRE_MATCH_SETS]) {
    const home = asOdd(row[set.home]);
    const draw = asOdd(row[set.draw]);
    const away = asOdd(row[set.away]);
    if (home === null || draw === null || away === null) continue;
    return {
      source: "football-data.co.uk",
      bookmaker: set.bookmaker,
      timing: set.timing,
      home,
      draw,
      away,
      over25: asOdd(row[set.over]),
      under25: asOdd(row[set.under]),
      usage: "research-only",
    };
  }
  return null;
}

function readStats(row: Readonly<Record<string, string>>): ResearchMatchStats | undefined {
  const stats: ResearchMatchStats = {
    shotsHome: asCount(row.HS),
    shotsAway: asCount(row.AS),
    shotsOnTargetHome: asCount(row.HST),
    shotsOnTargetAway: asCount(row.AST),
    cornersHome: asCount(row.HC),
    cornersAway: asCount(row.AC),
    yellowHome: asCount(row.HY),
    yellowAway: asCount(row.AY),
    redHome: asCount(row.HR),
    redAway: asCount(row.AR),
  };
  const hasAny = Object.values(stats).some((value) => value !== null);
  return hasAny ? stats : undefined;
}

export function normalizeFdSeason(csvText: string, options: FdNormalizeOptions): FdSeasonResult {
  const { league, season } = options;
  const division = FD_DIVISION_BY_LEAGUE[league.id];
  if (!division) {
    throw new Error(`La liga '${league.id}' no tiene división de football-data.co.uk.`);
  }
  const slugByFdName = FD_TEAM_SLUGS[league.id];
  if (!slugByFdName) {
    throw new Error(`La liga '${league.id}' no tiene tabla de nombres de football-data.co.uk.`);
  }

  const sourceUrl = fdSeasonUrl(season, division);
  const games: ResearchGame[] = [];
  const unmatched = new Set<string>();
  const fallback = new Set<string>();
  let skippedRows = 0;

  const resolveSlug = (raw: string | undefined): string | null => {
    const name = (raw ?? "").trim();
    if (!name) return null;
    const known = slugByFdName[name];
    if (known) return known;
    if (!options.slugifyUnmapped) return null;
    try {
      const slug = slugifyTeamName(name);
      fallback.add(name);
      return slug;
    } catch {
      return null;
    }
  };

  for (const row of parseCsv(csvText)) {
    const homeName = row.HomeTeam?.trim() ?? "";
    const awayName = row.AwayTeam?.trim() ?? "";
    const homeSlug = resolveSlug(homeName);
    const awaySlug = resolveSlug(awayName);
    if (!homeSlug || !awaySlug) {
      if (!homeSlug && homeName) unmatched.add(homeName);
      if (!awaySlug && awayName) unmatched.add(awayName);
      skippedRows++;
      continue;
    }

    const date = parseFdDate(row.Date ?? "");
    const homeScore = asCount(row.FTHG);
    const awayScore = asCount(row.FTAG);
    if (!date || homeScore === null || awayScore === null) {
      skippedRows++;
      continue;
    }

    const stats = readStats(row);
    games.push({
      id: `${league.id}:${season}:${homeSlug}:${awaySlug}`,
      league: league.id,
      season,
      date,
      homeTeam: `${league.id}.${homeSlug}`,
      awayTeam: `${league.id}.${awaySlug}`,
      homeScore,
      awayScore,
      odds: selectOdds(row),
      ...(stats ? { stats } : {}),
      source: "football-data.co.uk",
      sourceUrl,
    });
  }

  return {
    games,
    unmatchedNames: [...unmatched].sort(),
    fallbackNames: [...fallback].sort(),
    skippedRows,
  };
}

export interface FdXgGame {
  id: string;
  league: string;
  season: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeXg: number;
  awayXg: number;
}

/**
 * xG de football-data.co.uk (`HxG`/`AxG`). Solo la temporada 2026-27 publica estas
 * columnas; sirve para completar el xG de la temporada en curso sin depender de Understat.
 */
export function normalizeFdXg(
  csvText: string,
  options: { league: HistoryLeagueConfig; season: string },
): FdXgGame[] {
  const slugByFdName = FD_TEAM_SLUGS[options.league.id];
  if (!slugByFdName) return [];
  const games: FdXgGame[] = [];
  for (const row of parseCsv(csvText)) {
    const homeSlug = slugByFdName[row.HomeTeam?.trim() ?? ""];
    const awaySlug = slugByFdName[row.AwayTeam?.trim() ?? ""];
    const date = parseFdDate(row.Date ?? "");
    const homeRaw = (row.HxG ?? "").trim();
    const awayRaw = (row.AxG ?? "").trim();
    if (!homeSlug || !awaySlug || !date) continue;
    if (homeRaw === "" || awayRaw === "") continue;
    const homeXg = Number(homeRaw);
    const awayXg = Number(awayRaw);
    if (!Number.isFinite(homeXg) || !Number.isFinite(awayXg)) continue;
    games.push({
      id: `${options.league.id}:${options.season}:${homeSlug}:${awaySlug}`,
      league: options.league.id,
      season: options.season,
      date,
      homeTeam: `${options.league.id}.${homeSlug}`,
      awayTeam: `${options.league.id}.${awaySlug}`,
      homeXg,
      awayXg,
    });
  }
  return games;
}
