const STATIC_CLUB_SEGMENTS = new Set([
  "account",
  "admin",
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
  "/app/journal": { pathname: "/app/lab" },
  "/app/bitacora": { pathname: "/app/lab" },
  "/app/resultados": { pathname: "/app/historial" },
  "/app/comunidad": { pathname: "/app/social" },
  "/app/motores": { pathname: "/app/tech" },
  "/app/precio": { pathname: "/app/account", defaultParams: { tab: "plan" } },
  "/app/epl": { pathname: "/app/premier-league" },
  "/app/la-liga": { pathname: "/app/laliga" },
  "/app/tipstar": { pathname: "/app/tipster" },
};

export type ClubRouteResolution =
  | { kind: "ok"; pathname: string }
  | { kind: "redirect"; to: string }
  | { kind: "not_found"; pathname: string };

/**
 * Resuelve alias legados dentro de `/app/*` y detecta rutas inexistentes antes de que
 * `app/app/loading.tsx` confirme un HTTP 200 en streaming.
 */
export function resolveClubRoute(
  rawPath: string | null | undefined,
  options: {
    isLeague: (segment: string) => boolean;
    gameExists: (league: string, gameId: string) => boolean;
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

  if (segments.length === 3 && segments[1] === "games") {
    const league = segments[0]!;
    let gameId = segments[2]!;
    try {
      gameId = decodeURIComponent(gameId);
    } catch (err) {
      void err;
      return { kind: "not_found", pathname };
    }
    if (options.isLeague(league) && options.gameExists(league, gameId)) {
      return { kind: "ok", pathname };
    }
    return { kind: "not_found", pathname };
  }

  return { kind: "not_found", pathname };
}
