/**
 * Identidad de equipos en el histórico.
 *
 * El histórico cubre 17 temporadas: hay clubes descendidos, ascendidos y franquicias
 * de la NFL que cambiaron de ciudad. Por eso los equipos se identifican aquí con un
 * registro propio (`<liga>.<slug>`), independiente del manifiesto de emblemas de la
 * temporada en curso.
 *
 * - Fútbol: se normaliza el nombre de la fuente y se aplican alias explícitos por liga.
 * - NFL: el código de nflverse se mapea a la franquicia actual (STL→LA, OAK→LV, SD→LAC),
 *   para que un mismo equipo conserve historial al mudarse.
 */
import { NFL_TEAM_MAP, UnmappedTeamError } from "../mappings.js";
import type { HistoryLeagueConfig } from "./leagues.js";

/** Conectores y sufijos de club que no distinguen equipos. */
const NAME_STOPWORDS = new Set([
  "and",
  "de",
  "del",
  "der",
  "des",
  "du",
  "do",
  "da",
  "dos",
  "das",
  "van",
  "von",
  "fc",
  "afc",
  "cf",
  "sc",
  "ac",
  "as",
  "ssc",
  "ss",
  "us",
  "ud",
  "cd",
  "ca",
  "rc",
  "rcd",
  "sv",
  "vfl",
  "vfb",
  "tsg",
  "spvgg",
  "fsv",
  "sk",
  "fk",
  "calcio",
  "losc",
  "acf",
  "club",
  "futbol",
  "football",
]);

const NUMERIC_TOKEN = /^\d+$/;

/** Convierte un nombre de la fuente en un slug estable. */
export function slugifyTeamName(rawName: string): string {
  const tokens = rawName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);

  const kept = tokens.filter(
    (token) => !NAME_STOPWORDS.has(token) && !NUMERIC_TOKEN.test(token),
  );

  // Si el nombre era solo sufijos ("FC"), se conserva el original antes que quedarse vacío.
  const effective = kept.length > 0 ? kept : tokens;
  const slug = effective.join("-");
  if (!slug) {
    throw new Error(`No se pudo derivar un slug de equipo a partir de '${rawName}'.`);
  }
  return slug;
}

/** Clave de equipo del histórico: `<liga>.<slug>`. */
export function soccerTeamKey(league: HistoryLeagueConfig, rawName: string): string {
  const trimmed = rawName.trim();
  const alias = league.teamAliases?.[trimmed];
  const slug = alias ?? slugifyTeamName(trimmed);
  return `${league.id}.${slug}`;
}

/**
 * Franquicias de la NFL: nflverse conserva la abreviatura de la época.
 * La franquicia (no la ciudad) es la identidad estable para Elo y ratings.
 */
const NFL_RELOCATIONS: Readonly<Record<string, string>> = {
  STL: "LA",
  OAK: "LV",
  SD: "LAC",
};

export function nflTeamKey(code: string): string {
  const trimmed = code.trim().toUpperCase();
  const currentSeasonCode = NFL_RELOCATIONS[trimmed] ?? trimmed;
  const slug = NFL_TEAM_MAP[currentSeasonCode];
  if (!slug) {
    throw new UnmappedTeamError("nfl", code);
  }
  return `nfl.${slug}`;
}

/** Tokens comparables de una clave, para detectar posibles identidades duplicadas. */
export function teamKeyTokens(teamKey: string): string[] {
  const parts = teamKey.split(".");
  const slug = parts.length > 1 ? parts.slice(1).join(".") : teamKey;
  return slug.split("-").filter((token) => token.length > 1);
}
