import {
  canonicalPlayerHref,
  canonicalTeamHref,
  getLeagueCapability,
  parseCanonicalPublicSlug,
} from "@pitchlab/contracts";

const STATIC_CLUB_SEGMENTS = new Set([
  "account",
  "admin",
  "alertas",
  "canjear",
  "comparar",
  "historial",
  "lab",
  "momios",
  "parlays",
  "picks",
  "props",
  "social",
  "tech",
  "tipster",
]);

interface AliasTarget {
  pathname: string;
  defaultParams?: Record<string, string>;
}

const CLUB_ALIASES: Record<string, AliasTarget> = {
  "/app/account/referrals": { pathname: "/app/account", defaultParams: { tab: "referrals" } },
  "/app/account/notifications": { pathname: "/app/account", defaultParams: { tab: "prefs" } },
  "/app/settings": { pathname: "/app/account", defaultParams: { tab: "prefs" } },
  "/app/cuenta": { pathname: "/app/account" },
  "/app/alerts": { pathname: "/app/alertas" },
  "/app/journal": { pathname: "/app/lab" },
  "/app/bitacora": { pathname: "/app/lab" },
  "/app/resultados": { pathname: "/app/historial" },
  "/app/comunidad": { pathname: "/app/social" },
  "/app/motores": { pathname: "/app/tech" },
  "/app/precio": { pathname: "/app/account", defaultParams: { tab: "plan" } },
  "/app/epl": { pathname: "/app/premier-league" },
  "/app/la-liga": { pathname: "/app/laliga" },
  "/app/tipstar": { pathname: "/app/tipster" },
  "/app/h2h": { pathname: "/app/comparar" },
  "/app/compare": { pathname: "/app/comparar" },
};

function hasFootballRefereesCapability(league: string): boolean {
  const capability = getLeagueCapability(league);
  return capability?.sport === "football" && capability.providers.referees === true;
}

export type ClubRouteResolution =
  | { kind: "ok"; pathname: string }
  | { kind: "redirect"; to: string }
  | { kind: "permanent_redirect"; to: string }
  | { kind: "not_found"; pathname: string };

function safeDecodeSegment(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch (err) {
    void err;
    return null;
  }
}

export function resolveClubRoute(
  rawPath: string | null | undefined,
  options: {
    isLeague: (segment: string) => boolean;
    gameExists: (league: string, gameId: string) => boolean;
    canonicalGameHrefFor?: (league: string, gameId: string) => string | null;
    teamExists?: (league: string, teamId: string) => boolean;
    playerExists?: (league: string, teamId: string, playerSlug: string) => boolean;
    refereeDirectoryExists?: (league: string) => boolean;
    refereeExists?: (league: string, refereeSlug: string) => boolean;
  },
): ClubRouteResolution {
  if (!rawPath || typeof rawPath !== "string") {
    return { kind: "ok", pathname: "/app" };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawPath, "https://pitchlab.local");
  } catch (err) {
    void err;
    return { kind: "not_found", pathname: "/app" };
  }

  const rawPathname = parsed.pathname;
  const pathname =
    rawPathname.length > 1 && rawPathname.endsWith("/")
      ? rawPathname.slice(0, -1)
      : rawPathname;

  if (pathname === "/app") {
    return { kind: "ok", pathname };
  }
  if (!pathname.startsWith("/app/")) {
    return { kind: "not_found", pathname };
  }

  const alias = CLUB_ALIASES[pathname];
  if (alias) {
    const targetParams = new URLSearchParams(parsed.search);
    if (alias.defaultParams) {
      for (const [k, v] of Object.entries(alias.defaultParams)) {
        if (!targetParams.has(k)) {
          targetParams.set(k, v);
        }
      }
    }
    const qs = targetParams.toString();
    return {
      kind: "redirect",
      to: qs ? `${alias.pathname}?${qs}` : alias.pathname,
    };
  }

  const segments = pathname.slice("/app/".length).split("/");
  if (segments.some((s) => s.length === 0)) {
    return { kind: "not_found", pathname };
  }

  if (segments.length === 1) {
    const seg = segments[0]!;
    if (STATIC_CLUB_SEGMENTS.has(seg) || options.isLeague(seg)) {
      return { kind: "ok", pathname };
    }
    return { kind: "not_found", pathname };
  }

  if (segments.length === 2 && segments[0] === "u") {
    return { kind: "ok", pathname };
  }

  if (segments.length === 2 && segments[1] === "arbitros") {
    const league = segments[0]!;
    if (
      options.isLeague(league) &&
      hasFootballRefereesCapability(league) &&
      (!options.refereeDirectoryExists || options.refereeDirectoryExists(league))
    ) {
      return { kind: "ok", pathname };
    }
    return { kind: "not_found", pathname };
  }

  if (segments.length === 3 && segments[1] === "r") {
    const league = segments[0]!;
    const refereeSlug = safeDecodeSegment(segments[2]!);
    if (
      refereeSlug &&
      options.isLeague(league) &&
      hasFootballRefereesCapability(league) &&
      parseCanonicalPublicSlug(refereeSlug) !== null &&
      (!options.refereeExists || options.refereeExists(league, refereeSlug))
    ) {
      return { kind: "ok", pathname };
    }
    return { kind: "not_found", pathname };
  }

  if (
    segments.length === 3 &&
    (segments[1] === "games" || segments[1] === "g" || segments[1] === "teams" || segments[1] === "t")
  ) {
    const league = segments[0]!;
    const entityId = safeDecodeSegment(segments[2]!);
    if (!entityId) {
      return { kind: "not_found", pathname };
    }
    const isGameRoute = segments[1] === "games" || segments[1] === "g";
    const exists = isGameRoute
      ? options.gameExists(league, entityId)
      : (options.teamExists?.(league, entityId) ?? false);
    if (options.isLeague(league) && exists) {
      const qs = parsed.search;
      if (segments[1] === "teams") {
        return {
          kind: "permanent_redirect",
          to: `${canonicalTeamHref(league, entityId)}${qs}`,
        };
      }
      if (segments[1] === "games" && options.canonicalGameHrefFor) {
        const target = options.canonicalGameHrefFor(league, entityId);
        if (target) {
          return { kind: "permanent_redirect", to: `${target}${qs}` };
        }
      }
      return { kind: "ok", pathname };
    }
    return { kind: "not_found", pathname };
  }

  if (
    segments.length === 5 &&
    ((segments[1] === "teams" && segments[3] === "players") ||
      (segments[1] === "t" && segments[3] === "p"))
  ) {
    const league = segments[0]!;
    const teamId = safeDecodeSegment(segments[2]!);
    const playerSlug = safeDecodeSegment(segments[4]!);
    if (!teamId || !playerSlug) {
      return { kind: "not_found", pathname };
    }
    const exists = options.playerExists
      ? options.playerExists(league, teamId, playerSlug)
      : (options.teamExists?.(league, teamId) ?? false);
    if (options.isLeague(league) && exists) {
      if (segments[1] === "teams") {
        return {
          kind: "permanent_redirect",
          to: `${canonicalPlayerHref(league, teamId, playerSlug)}${parsed.search}`,
        };
      }
      return { kind: "ok", pathname };
    }
    return { kind: "not_found", pathname };
  }

  return { kind: "not_found", pathname };
}
