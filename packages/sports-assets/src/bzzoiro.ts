import { findNationalTeamDef, isNationalCompetition } from "@pitchlab/contracts";
import { BZZOIRO_TEAM_IDS } from "./bzzoiro-teams.generated";
import {
  NATIONAL_COMPETITION_ASSETS,
  NATIONAL_COUNTRY_SLUGS,
} from "./national-assets.generated";
import { TEAM_ASSETS } from "./registry.generated";

export { BZZOIRO_TEAM_IDS };

export const BZZOIRO_IMAGE_BASE_URL = "https://sports.bzzoiro.com/img";
export const ESPN_IMAGE_BASE_URL = "/brand/official";

/**
 * Ruta pública del escudo oficial en `/brand/official/{nfl|nhl|mlb|countries}/<slug>.png` (128×128 PNG transparente).
 * Devuelve `null` si la liga o selección no tiene recurso oficial registrado.
 */
export function getOfficialEspnTeamLogoUrl(league: string, slug?: string): string | null {
  const target = resolveEmblemTarget(league, slug);
  if (target.resolvedLeague && isNationalCompetition(target.resolvedLeague)) {
    const rawSlug = slug?.includes(".")
      ? slug.split(".")[1]!
      : slug || (league.includes(".") ? league.split(".")[1]! : "");
    if (!rawSlug) return null;
    if (NATIONAL_COUNTRY_SLUGS.has(rawSlug)) {
      return `${ESPN_IMAGE_BASE_URL}/countries/${rawSlug}.png`;
    }
    const resolved = findNationalTeamDef(rawSlug);
    if (resolved && NATIONAL_COUNTRY_SLUGS.has(resolved.slug)) {
      return `${ESPN_IMAGE_BASE_URL}/countries/${resolved.slug}.png`;
    }
    return null;
  }

  for (const key of target.keys) {
    const asset = TEAM_ASSETS[key];
    if (!asset) continue;
    if (asset.league !== "nfl" && asset.league !== "nhl" && asset.league !== "mlb") return null;
    return `${ESPN_IMAGE_BASE_URL}/${asset.league}/${asset.slug}.png`;
  }
  return null;
}

const LOCAL_CLUB_COMPETITION_ASSETS: ReadonlySet<string> = new Set([
  "concacaf-champions",
  "leagues-cup",
]);

/**
 * Ruta pública del escudo oficial de liga/competencia en `/brand/official/{nfl|nhl|mlb|competitions}/<league>.png`.
 */
export function getOfficialEspnLeagueLogoUrl(league: string): string | null {
  if (league === "nfl" || league === "nhl" || league === "mlb") {
    return `${ESPN_IMAGE_BASE_URL}/${league}/${league}.png`;
  }
  if (NATIONAL_COMPETITION_ASSETS.has(league) || LOCAL_CLUB_COMPETITION_ASSETS.has(league)) {
    return `${ESPN_IMAGE_BASE_URL}/competitions/${league}.png`;
  }
  return null;
}

export const BZZOIRO_LEAGUE_IDS: Readonly<Record<string, number>> = {
  "liga-mx": 19,
  "premier-league": 1,
  laliga: 3,
  "la-liga": 3,
  bundesliga: 5,
  "serie-a": 4,
  "ligue-1": 6,
  // Expansión clubes fútbol (ADR-043)
  mls: 18,
  "champions-league": 7,
  "europa-league": 8,
  "conference-league": 83,
  "uefa-super-cup": 90,
  libertadores: 32,
  sudamericana: 33,
  "caf-champions": 29,
  "liga-argentina": 85,
  brasileirao: 9,
  "brasileirao-b": 34,
  "copa-do-brasil": 35,
  "primera-a-colombia": 80,
  "copa-colombia": 81,
  "primera-chile": 111,
  "ligapro-ecuador": 112,
  "liga-1-peru": 113,
  championship: 12,
  "fa-cup": 39,
  "carabao-cup": 40,
  "segunda-espana": 38,
  "copa-del-rey": 41,
  "liga-f": 36,
  "bundesliga-2": 94,
  "dfb-pokal": 43,
  "serie-b": 100,
  "coppa-italia": 42,
  "ligue-2": 89,
  "coupe-de-france": 44,
  eredivisie: 10,
  "liga-portugal": 2,
  "pro-league-belgica": 14,
  "super-lig": 11,
  "saudi-pro-league": 17,
  "j1-league": 49,
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

/**
 * Convierte una llave neutral de retrato (`pl-p:<id>`, `pl-m:<id>` o URL HTTPS autorizada)
 * en la URL pública de imagen de jugador o entrenador sin exponer nombres de proveedores en datos.
 */
export function resolvePersonPhotoUrl(photoKey?: string | null): string | null {
  const raw = photoKey?.trim();
  if (!raw) return null;

  const playerMatch = /^pl-p:(\d{1,12})$/.exec(raw);
  if (playerMatch) {
    return `${BZZOIRO_IMAGE_BASE_URL}/player/${playerMatch[1]}/`;
  }

  const managerMatch = /^pl-m:(\d{1,12})$/.exec(raw);
  if (managerMatch) {
    return `${BZZOIRO_IMAGE_BASE_URL}/manager/${managerMatch[1]}/`;
  }

  // Retratos locales verificados (p. ej. entrenadores MLB/NBA/NFL/NHL en `/brand/official/coaches/...`)
  if (/^\/brand\/official\/coaches\/[a-z0-9-]+\/[a-z0-9-]+\.(webp|png|jpg)$/.test(raw)) {
    return raw;
  }

  try {
    const parsed = new URL(raw);
    if (
      parsed.protocol === "https:" &&
      parsed.hostname === "a.espncdn.com" &&
      parsed.pathname.startsWith("/i/headshots/")
    ) {
      return raw;
    }
    if (
      parsed.protocol === "https:" &&
      parsed.hostname === "sports.bzzoiro.com" &&
      parsed.pathname.startsWith("/img/")
    ) {
      return raw;
    }
  } catch {
    return null;
  }

  return null;
}
