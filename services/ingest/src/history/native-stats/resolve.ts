/**
 * Emparejamiento de equipos entre native-stats.org y el histórico canónico.
 *
 * La fuente usa nombres de football-data.org ("Athletic Club", "Real Betis Balompié",
 * "1. FC Köln") y el corpus usa slugs derivados de openfootball ("athletic", "real-betis",
 * "koln"). El emparejamiento es explícito y en cascada, de más fuerte a más débil:
 *
 *   1. alias curado (`NATIVE_STATS_ALIASES`) — gana siempre;
 *   2. mismo slug con el algoritmo del corpus;
 *   3. mismo conjunto de tokens en otro orden (`Tigres UANL` ↔ `uanl-tigres`);
 *   4. contención única por prefijo o sufijo de tokens (`Real Sporting de Gijón` ↔
 *      `sporting-gijon`), solo si hay **un** candidato.
 *
 * Si nada aplica no se inventa un id: el nombre se reporta como no emparejado para que la
 * curación sea un acto explícito. Un emparejamiento silencioso y equivocado contamina el
 * dataset y es peor que un hueco declarado.
 */
import { getHistoryLeague, isHistoryLeagueId, type HistoryLeagueId } from "../leagues.js";
import { slugifyTeamName } from "../../team-slug.js";

/** Competiciones de native-stats que existen en el producto. */
export const NATIVE_STATS_COMPETITIONS: Readonly<Record<string, HistoryLeagueId>> = {
  PL: "premier-league",
  PD: "la-liga",
  BL1: "bundesliga",
  SA: "serie-a",
  FL1: "ligue-1",
  LMX: "liga-mx",
};

/** Liga del producto para un código de competición, o `null` si no se modela. */
export function leagueForCompetition(code: string): HistoryLeagueId | null {
  const league = NATIVE_STATS_COMPETITIONS[code.toUpperCase()];
  return league ?? null;
}

/**
 * Alias curados: nombre publicado por la fuente → slug del histórico.
 * Solo se agregan aquí los casos que la cascada automática no resuelve **o** que
 * resolvería mal.
 */
export const NATIVE_STATS_ALIASES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  PL: {
    "AFC Bournemouth": "bournemouth",
    "Brighton & Hove Albion FC": "brighton-hove-albion",
    "Hull City AFC": "hull-city",
    "Leeds United FC": "leeds-united",
    "Wolverhampton Wanderers FC": "wolverhampton-wanderers",
    "Queens Park Rangers FC": "queens-park-rangers",
    "Sheffield United FC": "sheffield-united",
  },
  PD: {
    "Athletic Club": "athletic",
    "Deportivo Alavés": "alaves",
    "Real Betis Balompié": "real-betis",
    "RC Celta de Vigo": "celta",
    "Rayo Vallecano de Madrid": "rayo-vallecano",
    "Real Sporting de Gijón": "sporting-gijon",
    "Real Club Deportivo de La Coruña": "deportivo-la-coruna",
    "RCD Espanyol de Barcelona": "espanyol-barcelona",
    "SD Eibar": "sd-eibar",
    "SD Huesca": "sd-huesca",
  },
  BL1: {
    "1. FC Köln": "koln",
    "FC Bayern München": "bayern-munchen",
    "Borussia Mönchengladbach": "borussia-monchengladbach",
    "Hamburger SV": "hamburger",
  },
  SA: {
    "FC Internazionale Milano": "inter",
    "AC Milan": "milan",
    "Atalanta BC": "atalanta",
    "Chievo Verona": "chievo-verona",
    "ChievoVerona": "chievo-verona",
    "Genoa CFC": "genoa-cfc",
    "SPAL": "spal-ferrara",
    "US Città di Palermo": "palermo",
  },
  FL1: {
    "Paris Saint-Germain FC": "paris-saint-germain",
    "Paris FC": "paris",
    "AS Saint-Étienne": "saint-etienne",
    "RC Strasbourg Alsace": "strasbourg",
    "Stade Rennais FC 1901": "stade-rennais",
    "Stade Brestois 29": "stade-brestois",
    "LOSC Lille": "lille-osc",
    "OGC Nice": "ogc-nice",
    "ES Troyes AC": "estac-troyes",
  },
  LMX: {
    "Tigres UANL": "uanl-tigres",
    "Tigres de la UANL": "uanl-tigres",
    "Pumas UNAM": "pumas-unam",
    "Pumas de la UNAM": "pumas-unam",
    "Club América": "america",
    "CD Guadalajara": "deportivo-guadalajara",
    "Atlas FC": "atlas-guadalajara",
    "Club León": "leon",
    "Club Tijuana": "tijuana",
    "Club Necaxa": "necaxa",
    "CF Pachuca": "pachuca",
    "Club Puebla": "puebla",
  },
};

export interface TeamIndex {
  /** Slugs canónicos disponibles por liga. */
  readonly slugs: ReadonlyMap<HistoryLeagueId, ReadonlySet<string>>;
}

/** Construye el índice de slugs canónicos a partir de las claves `<liga>.<slug>`. */
export function buildTeamIndex(keys: Iterable<string>): TeamIndex {
  const byLeague = new Map<HistoryLeagueId, Set<string>>();
  for (const key of keys) {
    const dot = key.indexOf(".");
    if (dot <= 0) continue;
    const league = key.slice(0, dot);
    if (!isHistoryLeagueId(league)) continue;
    const slug = key.slice(dot + 1);
    const set = byLeague.get(league) ?? new Set<string>();
    set.add(slug);
    byLeague.set(league, set);
  }
  return { slugs: byLeague };
}

export interface Resolution {
  /** `<liga>.<slug>` canónico, o `null` si no hay emparejamiento seguro. */
  teamId: string | null;
  /** Cómo se resolvió, para poder auditar el dataset. */
  strategy: "alias" | "exact" | "token-set" | "prefix" | "suffix" | null;
}

function tokens(slug: string): string[] {
  return slug.split("-").filter((token) => token.length > 0);
}

function sameTokenSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort().join("-");
  const sortedB = [...b].sort().join("-");
  return sortedA === sortedB;
}

function startsWithTokens(candidate: readonly string[], canonical: readonly string[]): boolean {
  if (canonical.length >= candidate.length) return false;
  return canonical.every((token, index) => candidate[index] === token);
}

function endsWithTokens(candidate: readonly string[], canonical: readonly string[]): boolean {
  if (canonical.length >= candidate.length) return false;
  const offset = candidate.length - canonical.length;
  return canonical.every((token, index) => candidate[offset + index] === token);
}

/**
 * Resuelve un nombre publicado por la fuente al id canónico.
 * `competitionCode` acota la búsqueda a los equipos de esa liga.
 */
export function resolveTeam(
  index: TeamIndex,
  competitionCode: string,
  nativeName: string,
): Resolution {
  const league = leagueForCompetition(competitionCode);
  if (!league) return { teamId: null, strategy: null };
  const available = index.slugs.get(league);
  if (!available || available.size === 0) return { teamId: null, strategy: null };

  const alias = NATIVE_STATS_ALIASES[competitionCode.toUpperCase()]?.[nativeName];
  if (alias && available.has(alias)) {
    return { teamId: `${league}.${alias}`, strategy: "alias" };
  }

  let slug: string;
  try {
    slug = slugifyTeamName(nativeName);
  } catch {
    return { teamId: null, strategy: null };
  }
  if (available.has(slug)) return { teamId: `${league}.${slug}`, strategy: "exact" };

  const candidateTokens = tokens(slug);

  const setMatches = [...available].filter((canonical) => sameTokenSet(candidateTokens, tokens(canonical)));
  if (setMatches.length === 1) {
    return { teamId: `${league}.${setMatches[0]!}`, strategy: "token-set" };
  }

  const prefixMatches = [...available].filter((canonical) =>
    startsWithTokens(candidateTokens, tokens(canonical)),
  );
  if (prefixMatches.length === 1) {
    return { teamId: `${league}.${prefixMatches[0]!}`, strategy: "prefix" };
  }

  const suffixMatches = [...available].filter((canonical) =>
    endsWithTokens(candidateTokens, tokens(canonical)),
  );
  if (suffixMatches.length === 1) {
    return { teamId: `${league}.${suffixMatches[0]!}`, strategy: "suffix" };
  }

  return { teamId: null, strategy: null };
}

/** Nombre legible de la liga para reportes. */
export function leagueName(league: HistoryLeagueId): string {
  return getHistoryLeague(league).name;
}
