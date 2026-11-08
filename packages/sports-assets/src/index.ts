import {
  LEAGUE_ASSETS,
  MASCOT_EDITIONS,
  TEAM_ASSETS,
  type MascotEdition,
  type RegisteredLeagueAsset,
  type RegisteredTeamAsset,
} from "./registry.generated.js";

export {
  LEAGUE_ASSETS,
  TEAM_ASSETS,
  MASCOT_EDITIONS,
  type RegisteredLeagueAsset,
  type RegisteredTeamAsset,
  type MascotEdition,
};

const MASCOT_ALIASES: Record<string, string> = {
  tactico: "radar",
  futbol: "soccer",
  americano: "american-football",
  "futbol-americano": "american-football",
  celebrando: "liga-mx",
};

export function getLeagueAsset(leagueId: string): RegisteredLeagueAsset | null {
  return LEAGUE_ASSETS[leagueId] ?? null;
}

export function getTeamAsset(
  leagueOrCanonicalId: string,
  maybeSlug?: string,
): RegisteredTeamAsset | null {
  const key = maybeSlug
    ? `${leagueOrCanonicalId}.${maybeSlug}`
    : leagueOrCanonicalId;
  return TEAM_ASSETS[key] ?? null;
}

export function getEmblemPath(league: string, slug: string): string {
  const cleanSlug = slug.includes(".") ? slug.split(".")[1]! : slug;
  const asset = getTeamAsset(league, cleanSlug);
  if (asset) {
    return asset.svgPath;
  }
  const rev = league === "premier-league" ? "r2" : "r1";
  return `/brand/sports/${league}/${rev}/svg/${cleanSlug}.svg`;
}

export function getLeagueEmblemPath(league: string): string {
  const asset = getLeagueAsset(league);
  if (asset) {
    return asset.svgPath;
  }
  const rev = league === "premier-league" ? "r2" : "r1";
  return `/brand/sports/${league}/${rev}/svg/${league}.svg`;
}

export function getMascotPath(edition: string): string {
  const resolved = MASCOT_ALIASES[edition] ?? edition;
  return `/brand/mascot/r1/${resolved}.webp`;
}

export function getLogoPath(
  variant: "horizontal" | "compact" | "isologo" | "isotype" | "stacked" | "wordmark",
  theme: "dark" | "light" = "dark",
): string {
  return `/brand/logos/r1/pitchlab-${variant}-${theme}.svg`;
}

export function getFaviconPath(): string {
  return "/brand/app-icons/favicon.svg";
}
