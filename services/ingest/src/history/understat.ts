/**
 * xG histórico desde Understat, vía snapshots de la Wayback Machine.
 *
 * Por qué Wayback: el sitio en vivo respondió «We will come back soon» (2026-11-09), pero
 * sus páginas de liga archivadas contienen `datesData` con xG por partido. Se elige el
 * snapshot más reciente **anterior a 2026** (los de 2026 capturaron la página de
 * mantenimiento) y se exige que traiga al menos el 90 % de los partidos de la temporada.
 *
 * Licencia: Understat no publica una licencia de reutilización; el dataset es
 * **research-only**, igual que las cuotas.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { HistoryLeagueConfig } from "./leagues.js";
import { slugifyTeamName } from "./teams.js";

export const UNDERSTAT_LEAGUE_CODES: Readonly<Record<string, string>> = {
  "premier-league": "EPL",
  "la-liga": "La_liga",
  bundesliga: "Bundesliga",
  "serie-a": "Serie_A",
  "ligue-1": "Ligue_1",
};

/** Temporadas de Understat (año inicial) con datos utilizables. */
export const UNDERSTAT_SEASONS = [2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025] as const;

export const UNDERSTAT_EXPECTED_MATCHES: Readonly<Record<string, number>> = {
  "premier-league": 380,
  "la-liga": 380,
  bundesliga: 306,
  "serie-a": 380,
  "ligue-1": 306,
};

/** Understat → slug del corpus. Los nombres no listados caen a `slugifyTeamName`. */
export const UNDERSTAT_TEAM_SLUGS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "premier-league": {
    Arsenal: "arsenal",
    "Aston Villa": "aston-villa",
    Bournemouth: "bournemouth",
    Brentford: "brentford",
    Brighton: "brighton-hove-albion",
    Burnley: "burnley",
    Cardiff: "cardiff-city",
    Chelsea: "chelsea",
    "Crystal Palace": "crystal-palace",
    Everton: "everton",
    Fulham: "fulham",
    Huddersfield: "huddersfield-town",
    Hull: "hull-city",
    Ipswich: "ipswich-town",
    Leeds: "leeds-united",
    Leicester: "leicester-city",
    Liverpool: "liverpool",
    "Manchester City": "manchester-city",
    "Manchester United": "manchester-united",
    Newcastle: "newcastle-united",
    "Nottingham Forest": "nottingham-forest",
    "Queens Park Rangers": "queens-park-rangers",
    Southampton: "southampton",
    Stoke: "stoke-city",
    Sunderland: "sunderland",
    Swansea: "swansea-city",
    Tottenham: "tottenham-hotspur",
    Watford: "watford",
    "West Bromwich Albion": "west-bromwich-albion",
    "West Ham": "west-ham-united",
    Wolves: "wolverhampton-wanderers",
    "Wolverhampton Wanderers": "wolverhampton-wanderers",
    Norwich: "norwich-city",
    "Sheffield United": "sheffield-united",
    Middlesbrough: "middlesbrough",
    Reading: "reading",
    Wigan: "wigan-athletic",
    Blackburn: "blackburn-rovers",
    Bolton: "bolton-wanderers",
    Luton: "luton-town",
    Coventry: "coventry-city",
  },
  "la-liga": {
    Alaves: "alaves",
    Almeria: "almeria",
    "Athletic Club": "athletic",
    "Atletico Madrid": "atletico-madrid",
    Barcelona: "barcelona",
    Cadiz: "cadiz",
    "Celta Vigo": "celta",
    Cordoba: "cordoba",
    "Deportivo La Coruna": "deportivo-la-coruna",
    Eibar: "sd-eibar",
    Elche: "elche",
    Espanyol: "espanyol-barcelona",
    Getafe: "getafe",
    Girona: "girona",
    Granada: "granada",
    "Las Palmas": "las-palmas",
    Leganes: "leganes",
    Levante: "levante",
    Malaga: "malaga",
    Mallorca: "mallorca",
    Osasuna: "osasuna",
    "Rayo Vallecano": "rayo-vallecano",
    "Real Betis": "real-betis",
    "Real Madrid": "real-madrid",
    "Real Sociedad": "real-sociedad",
    "Real Valladolid": "real-valladolid",
    Sevilla: "sevilla",
    Valencia: "valencia",
    Villarreal: "villarreal",
    Huesca: "sd-huesca",
    "Real Zaragoza": "real-zaragoza",
    "Sporting Gijon": "sporting-gijon",
    Oviedo: "real-oviedo",
    "Racing Santander": "real-racing-santander",
  },
  bundesliga: {
    Augsburg: "augsburg",
    "Bayer Leverkusen": "bayer-leverkusen",
    "Bayern Munich": "bayern-munchen",
    Bochum: "bochum",
    "Borussia Dortmund": "borussia-dortmund",
    "Borussia M.Gladbach": "borussia-monchengladbach",
    "Eintracht Frankfurt": "eintracht-frankfurt",
    "FC Cologne": "koln",
    "FC Heidenheim": "heidenheim",
    "Fortuna Duesseldorf": "fortuna-dusseldorf",
    Freiburg: "freiburg",
    "Hamburger SV": "hamburger",
    "Hannover 96": "hannover",
    "Hertha Berlin": "hertha-bsc",
    Hoffenheim: "hoffenheim",
    "Holstein Kiel": "holstein-kiel",
    "Mainz 05": "mainz",
    Nuernberg: "nurnberg",
    Paderborn: "paderborn",
    "RasenBallsport Leipzig": "rb-leipzig",
    "Schalke 04": "schalke",
    "St. Pauli": "st-pauli",
    "Union Berlin": "union-berlin",
    "VfB Stuttgart": "stuttgart",
    "Werder Bremen": "werder-bremen",
    Wolfsburg: "wolfsburg",
    "Arminia Bielefeld": "arminia-bielefeld",
    "Eintracht Braunschweig": "eintracht-braunschweig",
    "Greuther Fuerth": "greuther-furth",
    "FC Ingolstadt": "ingolstadt",
    "Darmstadt 98": "darmstadt",
    "Kaiserslautern": "kaiserslautern",
    "SV Elversberg": "elversberg",
  },
  "serie-a": {
    "AC Milan": "milan",
    Atalanta: "atalanta",
    Bologna: "bologna",
    Cagliari: "cagliari",
    Chievo: "chievo-verona",
    Como: "como",
    Cremonese: "cremonese",
    Empoli: "empoli",
    Fiorentina: "fiorentina",
    Frosinone: "frosinone",
    Genoa: "genoa-cfc",
    Inter: "inter",
    Juventus: "juventus",
    Lazio: "lazio",
    Lecce: "lecce",
    Monza: "monza",
    Napoli: "napoli",
    "Parma Calcio 1913": "parma",
    Roma: "roma",
    "SPAL 2013": "spal-ferrara",
    Salernitana: "salernitana",
    Sampdoria: "sampdoria",
    Sassuolo: "sassuolo",
    Spezia: "spezia",
    Torino: "torino",
    Udinese: "udinese",
    Venezia: "venezia",
    Verona: "hellas-verona",
    Brescia: "brescia",
    Crotone: "crotone",
    Benevento: "benevento",
    "Pescara": "delfino-pescara",
    "Carpi": "carpi",
    "Cesena": "cesena",
    "Livorno": "livorno",
    "Catania": "catania",
    "Palermo": "palermo",
    "Pisa": "pisa",
  },
  "ligue-1": {
    Ajaccio: "ajaccio",
    Amiens: "amiens",
    Angers: "angers-sco",
    Auxerre: "aj-auxerre",
    Bordeaux: "girondins-bordeaux",
    Brest: "stade-brestois",
    Caen: "sm-caen",
    "Clermont Foot": "clermont-foot",
    Dijon: "dijon-fco",
    Guingamp: "ea-guingamp",
    "Le Havre": "le-havre",
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
    "Paris Saint Germain": "paris-saint-germain",
    Reims: "stade-reims",
    Rennes: "stade-rennais",
    "Saint-Etienne": "saint-etienne",
    Strasbourg: "strasbourg",
    Toulouse: "toulouse",
    Troyes: "estac-troyes",
    Bastia: "bastia",
    "Evian Thonon Gaillard": "evian-thonon-gaillard",
    "Gazelec Ajaccio": "gazelec-ajaccio",
    "Le Mans": "le-mans",
  },
};

export interface UnderstatMatch {
  understatId: string;
  datetime: string;
  homeTitle: string;
  awayTitle: string;
  homeGoals: number;
  awayGoals: number;
  homeXg: number;
  awayXg: number;
}

/** Extrae y decodifica `datesData` del HTML de Understat. */
export function parseUnderstatLeagueHtml(html: string): UnderstatMatch[] | null {
  const match = html.match(/datesData\s*=\s*JSON\.parse\('([\s\S]*?)'\)/);
  if (!match) return null;
  let text = match[1]!.replace(/\\x([0-9a-fA-F]{2})/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
  text = text.replace(/\\'/g, "'");
  const parsed = JSON.parse(text) as Array<{
    id: string;
    isResult: boolean;
    datetime: string;
    h: { title: string };
    a: { title: string };
    goals: { h: string; a: string };
    xG?: { h: string | null; a: string | null };
  }>;
  const matches: UnderstatMatch[] = [];
  for (const row of parsed) {
    if (!row.isResult) continue;
    const homeXg = row.xG?.h === null || row.xG?.h === undefined ? null : Number(row.xG.h);
    const awayXg = row.xG?.a === null || row.xG?.a === undefined ? null : Number(row.xG.a);
    if (homeXg === null || awayXg === null || !Number.isFinite(homeXg) || !Number.isFinite(awayXg)) {
      continue;
    }
    matches.push({
      understatId: String(row.id),
      datetime: row.datetime,
      homeTitle: row.h.title,
      awayTitle: row.a.title,
      homeGoals: Number(row.goals.h),
      awayGoals: Number(row.goals.a),
      homeXg,
      awayXg,
    });
  }
  return matches;
}

export interface XgGame {
  id: string;
  league: string;
  season: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeXg: number;
  awayXg: number;
  source: "understat" | "football-data.co.uk" | "estimated-from-shots";
  snapshot: string | null;
}

export function understatSeasonLabel(year: number): string {
  return `${year}-${String((year + 1) % 100).padStart(2, "0")}`;
}

export interface NormalizeUnderstatOptions {
  league: HistoryLeagueConfig;
  year: number;
  snapshot: string;
}

export function normalizeUnderstatMatches(
  matches: readonly UnderstatMatch[],
  options: NormalizeUnderstatOptions,
): { games: XgGame[]; unmatchedNames: string[] } {
  const slugByTitle = UNDERSTAT_TEAM_SLUGS[options.league.id] ?? {};
  const unresolved = new Set<string>();
  const games: XgGame[] = [];

  for (const match of matches) {
    const homeSlug = slugByTitle[match.homeTitle] ?? slugifyTeamName(match.homeTitle);
    const awaySlug = slugByTitle[match.awayTitle] ?? slugifyTeamName(match.awayTitle);
    if (!slugByTitle[match.homeTitle]) unresolved.add(match.homeTitle);
    if (!slugByTitle[match.awayTitle]) unresolved.add(match.awayTitle);
    games.push({
      id: `${options.league.id}:${understatSeasonLabel(options.year)}:${homeSlug}:${awaySlug}`,
      league: options.league.id,
      season: understatSeasonLabel(options.year),
      date: match.datetime.slice(0, 10),
      homeTeam: `${options.league.id}.${homeSlug}`,
      awayTeam: `${options.league.id}.${awaySlug}`,
      homeXg: match.homeXg,
      awayXg: match.awayXg,
      source: "understat",
      snapshot: options.snapshot,
    });
  }

  return { games, unmatchedNames: [...unresolved].sort() };
}

export interface SnapshotCandidate {
  timestamp: string;
  url: string;
}

const WAYBACK_TIMESTAMP_RE = /^\d{14}$/;
const UNDERSTAT_CODE_RE = /^[A-Za-z0-9_]{2,32}$/;

/** Lista de snapshots de Wayback para una página de liga, del más reciente al más viejo. */
export async function listUnderstatSnapshots(
  leagueCode: string,
  year: number,
  options: { retries?: number; fetchImpl?: typeof fetch } = {},
): Promise<SnapshotCandidate[]> {
  if (!UNDERSTAT_CODE_RE.test(leagueCode) || !Number.isInteger(year) || year < 2010 || year > 2100) {
    throw new Error(`Parámetros inválidos para Understat: leagueCode=${leagueCode}, year=${year}`);
  }
  const cdx = `https://web.archive.org/cdx/search/cdx?url=understat.com/league/${leagueCode}/${year}&output=json&filter=statuscode:200&limit=200`;
  const retries = options.retries ?? 2;
  const doFetch = options.fetchImpl ?? fetch;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await doFetch(cdx, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; PitchLab-Research/0.1)" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`CDX ${response.status}`);
      const rows = (await response.json()) as string[][];
      if (!Array.isArray(rows) || rows.length < 2) return [];
      const snapshots = rows
        .slice(1)
        .filter((row) => row[4] === "200" && typeof row[1] === "string" && WAYBACK_TIMESTAMP_RE.test(row[1]))
        .map((row) => ({
          timestamp: row[1]!,
          url: `https://web.archive.org/web/${row[1]}id_/https://understat.com/league/${leagueCode}/${year}`,
        }));
      return snapshots.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    } catch (error) {
      if (attempt === retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
    }
  }
  return [];
}

export interface FetchUnderstatOptions {
  league: HistoryLeagueConfig;
  year: number;
  cacheDir: string;
  offline?: boolean;
}

export interface FetchUnderstatResult {
  html: string;
  snapshot: string;
  url: string;
  status: "fetched" | "cached";
}

/**
 * Descarga (o lee de caché) la mejor página de liga disponible: la más reciente con al
 * menos el 90 % de los partidos esperados. Prueba hasta 5 snapshots.
 */
export async function fetchUnderstatSeason(
  options: FetchUnderstatOptions,
): Promise<FetchUnderstatResult | null> {
  const code = UNDERSTAT_LEAGUE_CODES[options.league.id];
  if (!code) throw new Error(`La liga '${options.league.id}' no tiene código de Understat.`);
  const cachePath = join(options.cacheDir, options.league.id, `${options.year}.html`);
  const metaPath = join(options.cacheDir, options.league.id, `${options.year}.json`);

  if (existsSync(cachePath) && existsSync(metaPath)) {
    const meta = JSON.parse(readFileSync(metaPath, "utf8")) as { snapshot: string; url: string };
    return {
      html: readFileSync(cachePath, "utf8"),
      snapshot: meta.snapshot,
      url: meta.url,
      status: "cached",
    };
  }
  if (options.offline) return null;

  const snapshots = await listUnderstatSnapshots(code, options.year);
  if (snapshots.length === 0) return null;
  const preferred = snapshots.filter((snapshot) => snapshot.timestamp < "20260101");
  const candidates = [...preferred, ...snapshots.filter((snapshot) => snapshot.timestamp >= "20260101")].slice(0, 5);
  const expected = UNDERSTAT_EXPECTED_MATCHES[options.league.id] ?? 380;

  let best: { html: string; snapshot: string; url: string; finished: number } | null = null;
  for (const candidate of candidates) {
    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        const response = await fetch(candidate.url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; PitchLab-Research/0.1)" },
          signal: AbortSignal.timeout(20_000),
        });
        if (!response.ok) throw new Error(`Wayback ${response.status}`);
        const html = await response.text();
        const matches = parseUnderstatLeagueHtml(html);
        const finished = matches?.length ?? 0;
        if (finished > (best?.finished ?? 0)) {
          best = { html, snapshot: candidate.timestamp, url: candidate.url, finished };
        }
        if (finished >= expected * 0.9) break;
        if (finished > 0) break;
        throw new Error("página sin datos");
      } catch (error) {
        if (attempt === 2) break;
        await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
      }
    }
    if ((best?.finished ?? 0) >= expected * 0.9) break;
  }

  if (!best || best.finished === 0) return null;
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, best.html, "utf8");
  writeFileSync(
    metaPath,
    JSON.stringify({ snapshot: best.snapshot, url: best.url, finished: best.finished }, null, 2) + "\n",
    "utf8",
  );
  return { html: best.html, snapshot: best.snapshot, url: best.url, status: "fetched" };
}
