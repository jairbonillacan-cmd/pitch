import { asLeagueId, COMPETITION_BY_ID } from "@pitchlab/contracts";
import {
  getBzzoiroLeagueEmblemUrl,
  getOfficialEspnLeagueLogoUrl,
} from "@pitchlab/sports-assets";
import type { ViewerIdentity } from "@pitchlab/ui/platform-provider";
import type {
  PlatformDataset,
  PlatformLeagueSummary,
  ViewerRole,
} from "@pitchlab/ui/types";
import { paymentMode } from "./billing/payment-mode";
import {
  accountsEnabled,
  loadMonth1Flag,
  previewToolsEnabled,
  PRODUCT_LEAGUES,
  type LoadedPlatformState,
} from "./platform-data";
import { readShellLeagueIndexMetaFast } from "./snapshots";
import { getViewerAccess, type ViewerAccess } from "./viewer-access";

const PRODUCT_LEAGUE_SET: ReadonlySet<string> = new Set(PRODUCT_LEAGUES);

const DEFERRED_STATIC_PATHS: ReadonlySet<string> = new Set([
  "/app",
  "/app/picks",
  "/app/historial",
  "/app/account",
  "/app/admin",
  "/app/canjear",
  "/app/tech",
]);

let cachedBaseLeagues: readonly PlatformLeagueSummary[] | null = null;
let cachedDeferredLeagues: {
  readonly key: string;
  readonly summaries: readonly PlatformLeagueSummary[];
} | null = null;

function resolveMxDay(nowMs: number): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Mexico_City",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(nowMs));
  } catch (err) {
    void err;
    return new Date(nowMs).toISOString().slice(0, 10);
  }
}

function windowBoundsForDay(todayIso: string): {
  readonly yesterdayIso: string;
  readonly endIso: string;
} | null {
  const startDate = new Date(`${todayIso}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime())) return null;
  return {
    yesterdayIso: new Date(startDate.getTime() - 86_400_000).toISOString().slice(0, 10),
    endIso: new Date(startDate.getTime() + 30 * 86_400_000).toISOString().slice(0, 10),
  };
}

function getBaseShellLeagueSummaries(): readonly PlatformLeagueSummary[] {
  if (cachedBaseLeagues) return cachedBaseLeagues;
  const built: readonly PlatformLeagueSummary[] = PRODUCT_LEAGUES.map((league) => {
    const meta = COMPETITION_BY_ID[league];
    const logoUrl =
      getBzzoiroLeagueEmblemUrl(league) ??
      getOfficialEspnLeagueLogoUrl(league) ??
      undefined;
    return {
      league: asLeagueId(league),
      label: meta?.label ?? league,
      ...(logoUrl ? { logoUrl } : {}),
      sport: meta?.sport ?? "football",
      season: meta?.season ?? "2026",
      roundLabel: meta?.defaultPeriod ?? "Jornada regular",
      generatedAt: "",
      totalGames: 0,
      upcomingCount: 0,
      finishedCount: 0,
      activeInWindow: false,
      standings: [],
    };
  });
  cachedBaseLeagues = built;
  return built;
}

export function buildDeferredLeagueSummaries(
  nowMs: number = Date.now(),
): readonly PlatformLeagueSummary[] {
  const baseLeagues = getBaseShellLeagueSummaries();
  const metaEntry = readShellLeagueIndexMetaFast();
  if (!metaEntry) {
    return baseLeagues;
  }
  const mxDay = resolveMxDay(nowMs);
  const cacheKey = `${metaEntry.root}|${metaEntry.mtime}|${mxDay}`;
  if (cachedDeferredLeagues && cachedDeferredLeagues.key === cacheKey) {
    return cachedDeferredLeagues.summaries;
  }
  const bounds = windowBoundsForDay(mxDay);
  const summaries: readonly PlatformLeagueSummary[] = baseLeagues.map((base) => {
    const meta = metaEntry.leagues[base.league];
    if (!meta) return base;
    const activeInWindow =
      meta.hasLive ||
      (bounds !== null
        ? meta.upcomingDays.some(
            (day) => day >= bounds.yesterdayIso && day <= bounds.endIso,
          )
        : meta.upcomingCount > 0);
    return {
      ...base,
      ...(meta.logoUrl ? { logoUrl: meta.logoUrl } : {}),
      season: meta.season || base.season,
      roundLabel: meta.roundLabel || base.roundLabel,
      generatedAt: meta.generatedAt || base.generatedAt,
      totalGames: meta.totalGames,
      upcomingCount: meta.upcomingCount,
      finishedCount: meta.finishedCount,
      activeInWindow,
      ...(meta.leaderName ? { leaderName: meta.leaderName } : {}),
      ...(meta.leaderPoints !== undefined ? { leaderPoints: meta.leaderPoints } : {}),
    };
  });
  cachedDeferredLeagues = { key: cacheKey, summaries };
  return summaries;
}

function toViewerIdentity(profile: ViewerAccess["profile"]): ViewerIdentity | null {
  if (!profile?.handle) return null;
  return {
    handle: profile.handle,
    displayName: profile.displayName,
    initials: profile.initials,
    avatarUrl: profile.avatarUrl,
    referralCode: profile.referralCode,
  };
}

export function normalizeClubPath(rawPath: string | null | undefined): string {
  if (!rawPath || typeof rawPath !== "string") return "/app";
  const pathOnly = (rawPath.split(/[?#]/, 1)[0] ?? "/").replace(/\/+$/, "") || "/";
  return pathOnly;
}

export function shouldDeferLayoutDataset(rawPath: string | null | undefined): boolean {
  const pathOnly = normalizeClubPath(rawPath);
  if (DEFERRED_STATIC_PATHS.has(pathOnly)) return true;
  if (!pathOnly.startsWith("/app/")) return false;
  const firstSegment = pathOnly.slice("/app/".length).split("/", 1)[0] ?? "";
  return firstSegment.length > 0 && PRODUCT_LEAGUE_SET.has(firstSegment);
}

export function buildEmptyClubShellDataset(
  fullAccess: boolean,
  nowIso: string = new Date().toISOString(),
): PlatformDataset {
  const parsedMs = Date.parse(nowIso);
  const resolvedNowMs = Number.isFinite(parsedMs) ? parsedMs : Date.now();
  const leagues = buildDeferredLeagueSummaries(resolvedNowMs).map((summary) => ({
    ...summary,
    generatedAt: summary.generatedAt || nowIso,
  }));
  return {
    generatedAt: nowIso,
    serverNowUtc: nowIso,
    leagues,
    games: [],
    teams: [],
    playerProps: [],
    dailyPromoPickId: "",
    tipsterWeeklyPickId: "",
    tipsterWeeklySlug: "",
    isServerRedactedForVisitor: !fullAccess,
  };
}

export async function loadClubShellViewerState(
  preferredRole: ViewerRole = "member",
  preloaded?: {
    readonly access?: ViewerAccess;
    readonly serverMonth1NoCardMode?: boolean | undefined;
  },
): Promise<LoadedPlatformState> {
  const [access, serverMonth1NoCardMode] =
    preloaded?.access !== undefined && preloaded !== undefined && "serverMonth1NoCardMode" in preloaded
      ? [preloaded.access, preloaded.serverMonth1NoCardMode]
      : await Promise.all([
          preloaded?.access ? Promise.resolve(preloaded.access) : getViewerAccess(),
          preloaded && "serverMonth1NoCardMode" in preloaded
            ? Promise.resolve(preloaded.serverMonth1NoCardMode)
            : loadMonth1Flag(),
        ]);

  const currentPaymentMode = paymentMode();
  const hasActiveSession = access.fullAccess;
  const viewerIdentity = toViewerIdentity(access.profile);
  const emptyDataset = buildEmptyClubShellDataset(hasActiveSession);

  if (!hasActiveSession) {
    return {
      dataset: emptyDataset,
      initialRole: "visitor",
      hasActiveSession: false,
      allowRoleSimulation: false,
      accountsEnabled: accountsEnabled(),
      viewerVia: access.via,
      paymentMode: currentPaymentMode,
      serverMonth1NoCardMode,
      viewerIdentity,
    };
  }

  const resolvedRole: ViewerRole = accountsEnabled()
    ? access.isAdmin
      ? "admin"
      : access.isTipster
        ? "tipster"
        : "member"
    : preferredRole;

  return {
    dataset: emptyDataset,
    initialRole: resolvedRole,
    hasActiveSession: true,
    allowRoleSimulation: previewToolsEnabled(access.isAdmin),
    accountsEnabled: accountsEnabled(),
    viewerVia: access.via,
    paymentMode: currentPaymentMode,
    serverMonth1NoCardMode,
    viewerIdentity,
  };
}

export function yieldForStreamFlush(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (typeof setImmediate === "function") {
      setImmediate(() => {
        setTimeout(resolve, 0);
      });
      return;
    }
    setTimeout(resolve, 0);
  });
}
