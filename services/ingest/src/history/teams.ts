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

import { slugifyTeamName } from "../team-slug.js";

export { slugifyTeamName };

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
