import { BZZOIRO_TEAM_IDS } from "./bzzoiro-teams.generated";
import { TEAM_ASSETS } from "./registry.generated";

export { BZZOIRO_TEAM_IDS };

export const BZZOIRO_IMAGE_BASE_URL = "https://sports.bzzoiro.com/img";

export const BZZOIRO_LEAGUE_IDS: Readonly<Record<string, number>> = {
  "liga-mx": 19,
  "premier-league": 1,
  laliga: 3,
  "la-liga": 3,
  bundesliga: 5,
  "serie-a": 4,
  "ligue-1": 6,
  "champions-league": 7,
  nba: 1,
};

const BZZOIRO_TEAM_IMAGE_SEGMENT: Readonly<Record<string, string>> = {
  nba: "basketball/team",
};

const BZZOIRO_LEAGUE_IMAGE_SEGMENT: Readonly<Record<string, string>> = {
  nba: "basketball/league",
};

const LEAGUE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "la-liga": ["la-liga", "laliga"],
  laliga: ["laliga", "la-liga"],
};

function resolveEmblemTarget(
  league: string,
  slug?: string,
): { resolvedLeague: string; keys: string[] } {
  const rawSlug = slug ?? "";
  const cleanSlug = rawSlug.includes(".") ? rawSlug.split(".")[1]! : rawSlug;
  const resolvedLeague = rawSlug.includes(".")
    ? rawSlug.split(".")[0]!
    : !slug && league.includes(".")
      ? league.split(".")[0]!
      : league;
  const resolvedSlug = slug
    ? cleanSlug
    : league.includes(".")
      ? (league.split(".")[1] ?? "")
      : "";
  if (!resolvedLeague || !resolvedSlug) {
    return { resolvedLeague: "", keys: [] };
  }
  const leagues = LEAGUE_ALIASES[resolvedLeague] ?? [resolvedLeague];
  return {
    resolvedLeague,
    keys: leagues.map((lg) => `${lg}.${resolvedSlug}`),
  };
}

function resolveLocalSvgPath(league: string, slug: string): string | null {
  for (const key of resolveEmblemTarget(league, slug).keys) {
    const asset = TEAM_ASSETS[key];
    if (asset) return asset.svgPath;
  }
  return null;
}

/**
 * Devuelve el id numérico de Bzzoiro Sports Data para un equipo canónico (`liga-mx.america`,
 * `nba.miami-heat` o `(league, slug)`), o `null` si el deporte/equipo no tiene cobertura
 * en Bzzoiro (p. ej. NFL, MLB o NHL).
 */
export function getBzzoiroTeamId(league: string, slug?: string): number | null {
  for (const key of resolveEmblemTarget(league, slug).keys) {
    const id = BZZOIRO_TEAM_IDS[key];
    if (typeof id === "number" && Number.isInteger(id) && id > 0) {
      return id;
    }
  }
  return null;
}

/**
 * URL pública de la Image API de Bzzoiro para el escudo del club con fondo transparente.
 * Usa `/img/team/<id>/` para fútbol y `/img/basketball/team/<id>/` para NBA; devuelve `null`
 * si no existe id mapeado y verificado.
 */
export function getBzzoiroTeamEmblemUrl(league: string, slug?: string): string | null {
  const id = getBzzoiroTeamId(league, slug);
  if (id === null) return null;
  const { resolvedLeague } = resolveEmblemTarget(league, slug);
  return buildBzzoiroTeamEmblemUrlById(resolvedLeague, id);
}

/** Construye la URL de escudo de Bzzoiro dado el slug de liga y el id numérico del proveedor. */
export function buildBzzoiroTeamEmblemUrlById(
  league: string,
  bzzoiroTeamId: number,
): string | null {
  if (!Number.isInteger(bzzoiroTeamId) || bzzoiroTeamId <= 0) return null;
  const canonicalLeague = league === "la-liga" ? "laliga" : league;
  const segment = BZZOIRO_TEAM_IMAGE_SEGMENT[canonicalLeague] ?? "team";
  return `${BZZOIRO_IMAGE_BASE_URL}/${segment}/${bzzoiroTeamId}/?bg=transparent`;
}

/**
 * Devuelve el id numérico de liga en Bzzoiro Sports Data, o `null` si la competición no
 * tiene cobertura en Bzzoiro (p. ej. NFL, MLB o NHL).
 */
export function getBzzoiroLeagueId(league: string): number | null {
  const id = BZZOIRO_LEAGUE_IDS[league];
  return typeof id === "number" && Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * URL pública de la Image API de Bzzoiro para el emblema de liga con fondo transparente.
 * Devuelve `null` para ligas sin cobertura en Bzzoiro.
 */
export function getBzzoiroLeagueEmblemUrl(league: string): string | null {
  const id = getBzzoiroLeagueId(league);
  if (id === null) return null;
  const canonicalLeague = league === "la-liga" ? "laliga" : league;
  const segment = BZZOIRO_LEAGUE_IMAGE_SEGMENT[canonicalLeague] ?? "league";
  return `${BZZOIRO_IMAGE_BASE_URL}/${segment}/${id}/?bg=transparent`;
}

/** Verifica que una URL pertenezca estrictamente a la Image API HTTPS de Bzzoiro. */
export function isValidBzzoiroImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "sports.bzzoiro.com" &&
      parsed.pathname.startsWith("/img/")
    );
  } catch {
    return false;
  }
}

export interface ResolvedTeamEmblem {
  /** URL principal (Bzzoiro Image API salvo `editorialOnly`, o SVG editorial local). */
  src: string | null;
  /** Respaldo local de PitchLab si la fuente externa falla o devuelve imagen mínima 1×1. */
  fallbackSrc: string | null;
  /** `true` cuando `src` apunta a la Image API de Bzzoiro. */
  isExternal: boolean;
}

/**
 * Resuelve la URL primaria y el respaldo editorial para un club.
 * En superficies de marketing/promoción usar `{ editorialOnly: true }` (Licencia BSD v4.0 §6).
 */
export function getResolvedTeamEmblem(
  league: string,
  slug: string,
  options?: { editorialOnly?: boolean },
): ResolvedTeamEmblem {
  const localSvg = resolveLocalSvgPath(league, slug);
  if (!options?.editorialOnly) {
    const externalUrl = getBzzoiroTeamEmblemUrl(league, slug);
    if (externalUrl) {
      return {
        src: externalUrl,
        fallbackSrc: localSvg,
        isExternal: true,
      };
    }
  }
  if (localSvg) {
    return {
      src: localSvg,
      fallbackSrc: null,
      isExternal: false,
    };
  }
  return {
    src: null,
    fallbackSrc: null,
    isExternal: false,
  };
}
