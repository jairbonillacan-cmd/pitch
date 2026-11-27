"use client";

import React, {
  startTransition as startBackgroundTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { invalidateClientJsonCache } from "@pitchlab/ui/hooks";
import {
  isDetailRoutePath,
  runWithViewTransition,
  sanitizeInternalHref,
  saveRouteScroll,
} from "@pitchlab/ui/navigation-helpers";
import { PlatformProvider, type ViewerIdentity } from "@pitchlab/ui/platform-provider";
import type {
  MatchPick,
  PaymentMode,
  PlatformDataset,
  PlatformGame,
  ViewerRole,
  ViewerVia,
} from "@pitchlab/ui/types";

type ShellTeamEntry = NonNullable<PlatformDataset["teams"]>[number];
type ShellExtendScope = "base" | "parlays";

interface WireExtendedPick {
  readonly id: string;
  readonly gameId?: string;
  readonly league?: PlatformGame["league"];
  readonly leagueLabel?: string;
  readonly matchLabel?: string;
  readonly kickoffLocal?: string;
  readonly gameStatus?: PlatformGame["status"];
  readonly slotIndex: number;
  readonly category?: MatchPick["category"];
  readonly categoryLabel?: string;
  readonly risk?: MatchPick["risk"];
  readonly engineKey?: MatchPick["engineKey"];
  readonly engineName?: string;
  readonly marketGroup?: string;
  readonly selectionKey?: string;
  readonly market?: string;
  readonly line?: number | null;
  readonly conflictGroup?: MatchPick["conflictGroup"];
  readonly label: string;
  readonly rationale?: string;
  readonly p: number;
  readonly fairDecimal: number;
  readonly fairAmerican?: number;
  readonly marketDecimal: number | null;
  readonly marketAmerican?: number | null;
  readonly marketBookLabel?: string | null;
  readonly marketCapturedAtUtc?: string | null;
  readonly bookQuotes?: MatchPick["bookQuotes"];
  readonly edgePts: number | null;
  readonly confidenceScore?: number;
  readonly suggestedUnits?: number;
  readonly result?: MatchPick["result"];
  readonly isDailyOpenPromo?: boolean;
  readonly isTipsterWeeklyOpen?: boolean;
  readonly tipsterSlug?: string;
  readonly isRedacted?: boolean;
}

interface WireExtendedGame {
  readonly id: string;
  readonly league: PlatformGame["league"];
  readonly leagueLabel: string;
  readonly leagueLogoUrl?: string;
  readonly sport: PlatformGame["sport"];
  readonly round?: string;
  readonly dayId: string;
  readonly dayLabel?: string;
  readonly kickoffUtc: string;
  readonly kickoffLocal: string;
  readonly venue?: string;
  readonly referee?: string;
  readonly neutralSite?: boolean;
  readonly status: PlatformGame["status"];
  readonly score?: PlatformGame["score"];
  readonly home: {
    readonly slug: string;
    readonly name: string;
    readonly shortName: string;
    readonly code: string;
    readonly logoUrl?: string;
    readonly record?: string;
    readonly form?: readonly string[];
  };
  readonly away: {
    readonly slug: string;
    readonly name: string;
    readonly shortName: string;
    readonly code: string;
    readonly logoUrl?: string;
    readonly record?: string;
    readonly form?: readonly string[];
  };
  readonly hasForecast?: boolean;
  readonly x12: PlatformGame["x12"];
  readonly projection?: PlatformGame["projection"];
  readonly goalLine?: PlatformGame["goalLine"];
  readonly confidenceScore: number | null;
  readonly confidenceLevel: PlatformGame["confidenceLevel"];
  readonly picks: readonly WireExtendedPick[];
  readonly parlayCandidates?: MatchPick[];
  readonly preGame?: {
    readonly isRedacted?: boolean;
    readonly cortexSynthesis?: string;
    readonly tacticalKeys?: string[];
    readonly lineupStatusLabel?: string;
    readonly lineupsConfirmed60m?: boolean;
    readonly absences?: PlatformGame["preGame"]["absences"];
    readonly moneyFlow?: PlatformGame["preGame"]["moneyFlow"];
    readonly matchContext?: PlatformGame["preGame"]["matchContext"];
  };
  readonly markets?: PlatformGame["markets"];
  readonly factors?: PlatformGame["factors"];
  readonly headToHead?: PlatformGame["headToHead"];
  readonly restDays?: PlatformGame["restDays"];
  readonly counts?: PlatformGame["counts"];
  readonly updatedAtLabel?: string;
  readonly spacetime?: PlatformGame["spacetime"];
}

const MAX_PREFETCHED_ROUTES = 80;

const EAGER_EXTEND_PATHS: ReadonlySet<string> = new Set([
  "/app/parlays",
  "/app/social",
  "/app/lab",
  "/app/momios",
  "/app/comparar",
  "/app/tipster",
]);

const PARLAY_SCOPE_PATHS: ReadonlySet<string> = new Set([
  "/app/parlays",
  "/app/momios",
  "/app/comparar",
]);

function normalizeRoutePath(rawPath: string | null | undefined): string {
  if (!rawPath) return "/";
  return (rawPath.split(/[?#]/, 1)[0] ?? "/").replace(/\/+$/, "") || "/";
}

function requiresImmediateShellExtend(rawPath: string | null | undefined): boolean {
  const clean = normalizeRoutePath(rawPath);
  return EAGER_EXTEND_PATHS.has(clean) || clean.startsWith("/app/u/");
}

function requiresParlayScope(rawPath: string | null | undefined): boolean {
  const clean = normalizeRoutePath(rawPath);
  return PARLAY_SCOPE_PATHS.has(clean);
}

function hasDedicatedEndpointRoute(rawPath: string | null | undefined): boolean {
  const clean = normalizeRoutePath(rawPath);
  if (clean === "/app/picks" || clean === "/app/props") return true;
  if (/^\/app\/[^/]+\/g\/[^/]+$/.test(clean)) return true;
  return /^\/app\/[^/]+$/.test(clean) && !EAGER_EXTEND_PATHS.has(clean);
}

function decimalToAmericanFallback(decimal: number): number {
  if (!Number.isFinite(decimal) || decimal <= 1.01) return 100;
  if (decimal >= 2) return Math.round((decimal - 1) * 100);
  return Math.round(-100 / (decimal - 1));
}

function hydrateExtendedPick(raw: WireExtendedPick, g: WireExtendedGame): MatchPick {
  const matchLabel = raw.matchLabel ?? `${g.home.shortName} vs ${g.away.shortName}`;
  return {
    id: raw.id,
    gameId: raw.gameId ?? g.id,
    league: raw.league ?? g.league,
    leagueLabel: raw.leagueLabel ?? g.leagueLabel,
    matchLabel,
    kickoffLocal: raw.kickoffLocal ?? g.kickoffLocal,
    gameStatus: raw.gameStatus ?? g.status,
    slotIndex: raw.slotIndex,
    category: raw.category ?? "principal",
    categoryLabel: raw.categoryLabel ?? "Pick principal",
    risk: raw.risk ?? "medio",
    engineKey: raw.engineKey ?? "tachyon",
    engineName: raw.engineName ?? "Spacetime",
    marketGroup: raw.marketGroup ?? "",
    selectionKey: raw.selectionKey ?? "",
    ...(raw.market !== undefined ? { market: raw.market } : {}),
    ...(raw.line !== undefined ? { line: raw.line } : {}),
    conflictGroup: raw.conflictGroup ?? "independent",
    label: raw.label,
    rationale: raw.rationale ?? "",
    p: raw.p,
    fairDecimal: raw.fairDecimal,
    fairAmerican: raw.fairAmerican ?? decimalToAmericanFallback(raw.fairDecimal),
    marketDecimal: raw.marketDecimal,
    marketAmerican:
      raw.marketAmerican !== undefined
        ? raw.marketAmerican
        : raw.marketDecimal !== null
          ? decimalToAmericanFallback(raw.marketDecimal)
          : null,
    ...(raw.marketBookLabel !== undefined ? { marketBookLabel: raw.marketBookLabel } : {}),
    ...(raw.marketCapturedAtUtc !== undefined
      ? { marketCapturedAtUtc: raw.marketCapturedAtUtc }
      : {}),
    ...(raw.bookQuotes !== undefined ? { bookQuotes: raw.bookQuotes } : {}),
    edgePts: raw.edgePts,
    confidenceScore: raw.confidenceScore ?? g.confidenceScore ?? 0,
    suggestedUnits: raw.suggestedUnits ?? 1,
    ...(raw.result !== undefined ? { result: raw.result } : {}),
    ...(raw.isDailyOpenPromo ? { isDailyOpenPromo: true } : {}),
    ...(raw.isTipsterWeeklyOpen ? { isTipsterWeeklyOpen: true } : {}),
    ...(raw.tipsterSlug ? { tipsterSlug: raw.tipsterSlug } : {}),
    ...(raw.isRedacted !== undefined ? { isRedacted: raw.isRedacted } : {}),
  };
}

function hydrateExtendedGame(raw: WireExtendedGame): PlatformGame {
  return {
    id: raw.id,
    league: raw.league,
    leagueLabel: raw.leagueLabel,
    ...(raw.leagueLogoUrl ? { leagueLogoUrl: raw.leagueLogoUrl } : {}),
    sport: raw.sport,
    round: raw.round ?? "",
    dayId: raw.dayId,
    dayLabel: raw.dayLabel ?? raw.dayId,
    kickoffUtc: raw.kickoffUtc,
    kickoffLocal: raw.kickoffLocal,
    venue: raw.venue ?? "",
    ...(raw.referee ? { referee: raw.referee } : {}),
    ...(raw.neutralSite !== undefined ? { neutralSite: raw.neutralSite } : {}),
    status: raw.status,
    ...(raw.score ? { score: raw.score } : {}),
    home: {
      slug: raw.home.slug,
      name: raw.home.name,
      shortName: raw.home.shortName,
      code: raw.home.code,
      ...(raw.home.logoUrl ? { logoUrl: raw.home.logoUrl } : {}),
      record: raw.home.record ?? "",
      ...(raw.home.form ? { form: raw.home.form } : {}),
    },
    away: {
      slug: raw.away.slug,
      name: raw.away.name,
      shortName: raw.away.shortName,
      code: raw.away.code,
      ...(raw.away.logoUrl ? { logoUrl: raw.away.logoUrl } : {}),
      record: raw.away.record ?? "",
      ...(raw.away.form ? { form: raw.away.form } : {}),
    },
    ...(raw.hasForecast !== undefined ? { hasForecast: raw.hasForecast } : {}),
    x12: raw.x12,
    projection: raw.projection ?? null,
    ...(raw.goalLine !== undefined ? { goalLine: raw.goalLine } : {}),
    confidenceScore: raw.confidenceScore,
    confidenceLevel: raw.confidenceLevel,
    picks: raw.picks.map((pk) => hydrateExtendedPick(pk, raw)),
    ...(raw.parlayCandidates !== undefined ? { parlayCandidates: raw.parlayCandidates } : {}),
    preGame: {
      ...(raw.preGame?.isRedacted ? { isRedacted: true } : {}),
      cortexSynthesis: raw.preGame?.cortexSynthesis ?? "",
      tacticalKeys: raw.preGame?.tacticalKeys ?? [],
      lineupStatusLabel: raw.preGame?.lineupStatusLabel ?? "",
      lineupsConfirmed60m: Boolean(raw.preGame?.lineupsConfirmed60m),
      absences: raw.preGame?.absences ?? [],
      moneyFlow: raw.preGame?.moneyFlow ?? null,
      ...(raw.preGame?.matchContext ? { matchContext: raw.preGame.matchContext } : {}),
    },
    markets: raw.markets ?? [],
    factors: raw.factors ?? [],
    headToHead: raw.headToHead ?? [],
    ...(raw.restDays ? { restDays: raw.restDays } : {}),
    ...(raw.counts ? { counts: raw.counts } : {}),
    updatedAtLabel: raw.updatedAtLabel ?? "",
    spacetime: raw.spacetime ?? null,
  };
}

function mergePickQuotes(
  existingPicks: readonly MatchPick[],
  incomingPicks: readonly MatchPick[],
): MatchPick[] {
  const existingById = new Map(existingPicks.map((p) => [p.id, p]));
  return incomingPicks.map((pk) => {
    const prev = existingById.get(pk.id);
    if (!prev) return pk;
    const keepPrevQuotes =
      (!pk.bookQuotes || pk.bookQuotes.length === 0) &&
      prev.bookQuotes &&
      prev.bookQuotes.length > 0;
    return keepPrevQuotes ? { ...pk, bookQuotes: prev.bookQuotes } : pk;
  });
}

function mergeShellExtension(
  base: PlatformDataset,
  extraGames: readonly PlatformGame[],
  extraTeams: readonly ShellTeamEntry[],
): PlatformDataset {
  if (extraGames.length === 0 && extraTeams.length === 0) return base;
  const extraById = new Map(extraGames.map((g) => [g.id, g]));
  const seenGameIds = new Set<string>();
  const mergedGames = base.games.map((g) => {
    seenGameIds.add(g.id);
    const enriched = extraById.get(g.id);
    if (!enriched) return g;
    const baseHasQuotes = g.picks.some((p) => (p.bookQuotes?.length ?? 0) > 0);
    const enrichedHasQuotes = enriched.picks.some((p) => (p.bookQuotes?.length ?? 0) > 0);
    const shouldUpgradePicks =
      enriched.picks.length > g.picks.length || (!baseHasQuotes && enrichedHasQuotes);
    const shouldUpgradeParlays =
      (enriched.parlayCandidates?.length ?? 0) > (g.parlayCandidates?.length ?? 0);
    if (!shouldUpgradePicks && !shouldUpgradeParlays) {
      return g;
    }
    return {
      ...g,
      picks: shouldUpgradePicks ? mergePickQuotes(g.picks, enriched.picks) : g.picks,
      parlayCandidates: enriched.parlayCandidates ?? g.parlayCandidates,
    };
  });
  for (const g of extraGames) {
    if (!seenGameIds.has(g.id)) {
      mergedGames.push(g);
    }
  }

  const baseTeams = base.teams ?? [];
  const seenTeamKeys = new Set(baseTeams.map((t) => `${t.league}:${t.slug}`));
  const mergedTeams = [...baseTeams];
  for (const t of extraTeams) {
    const key = `${t.league}:${t.slug}`;
    if (!seenTeamKeys.has(key)) {
      seenTeamKeys.add(key);
      mergedTeams.push(t);
    }
  }

  return {
    ...base,
    games: mergedGames,
    teams: mergedTeams,
  };
}

export function PlatformClientBridge({
  dataset,
  deferredShellExtend = false,
  initialRole,
  allowRoleSimulation = false,
  accountsEnabled = false,
  viewerVia,
  paymentMode = "transfer",
  serverMonth1NoCardMode,
  viewerIdentity = null,
  children,
}: {
  dataset: PlatformDataset;
  deferredShellExtend?: boolean;
  initialRole: ViewerRole;
  allowRoleSimulation?: boolean;
  accountsEnabled?: boolean;
  viewerVia?: ViewerVia;
  paymentMode?: PaymentMode;
  serverMonth1NoCardMode?: boolean;
  viewerIdentity?: ViewerIdentity | null;
  children: React.ReactNode;
}): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [navPending, setNavPending] = useState(false);
  const [activeDataset, setActiveDataset] = useState<PlatformDataset>(dataset);
  const prefetchedRef = useRef<Set<string>>(new Set());
  const baseStartedRef = useRef<boolean>(false);
  const baseDoneRef = useRef<boolean>(!deferredShellExtend);
  const parlaysStartedRef = useRef<boolean>(false);
  const parlaysDoneRef = useRef<boolean>(!deferredShellExtend);
  const extendedPayloadRef = useRef<{
    scope: string;
    games: PlatformGame[];
    teams: ShellTeamEntry[];
  } | null>(null);
  const parlaysPayloadRef = useRef<{
    scope: string;
    games: PlatformGame[];
    teams: ShellTeamEntry[];
  } | null>(null);
  const viewerScope = `${initialRole}:${viewerVia ?? "none"}:${viewerIdentity?.handle ?? "anon"}:${viewerIdentity?.referralCode ?? ""}:${dataset.isServerRedactedForVisitor ? "1" : "0"}:${accountsEnabled ? "1" : "0"}`;
  const prevViewerScopeRef = useRef<string>(viewerScope);

  useEffect(() => {
    if (prevViewerScopeRef.current !== viewerScope) {
      prevViewerScopeRef.current = viewerScope;
      invalidateClientJsonCache();
      extendedPayloadRef.current = null;
      parlaysPayloadRef.current = null;
      baseStartedRef.current = false;
      baseDoneRef.current = !deferredShellExtend;
      parlaysStartedRef.current = false;
      parlaysDoneRef.current = !deferredShellExtend;
      setActiveDataset(dataset);
      return;
    }
    const cachedParlays = parlaysPayloadRef.current;
    const cachedExtended = extendedPayloadRef.current;
    if (cachedParlays && cachedParlays.scope === viewerScope) {
      baseDoneRef.current = true;
      parlaysDoneRef.current = true;
      startBackgroundTransition(() => {
        setActiveDataset(
          mergeShellExtension(dataset, cachedParlays.games, cachedParlays.teams),
        );
      });
      return;
    }
    if (cachedExtended && cachedExtended.scope === viewerScope) {
      baseDoneRef.current = true;
      parlaysStartedRef.current = false;
      parlaysDoneRef.current = !deferredShellExtend;
      startBackgroundTransition(() => {
        setActiveDataset(
          mergeShellExtension(dataset, cachedExtended.games, cachedExtended.teams),
        );
      });
      return;
    }
    setActiveDataset(dataset);
    baseStartedRef.current = false;
    baseDoneRef.current = !deferredShellExtend;
    parlaysStartedRef.current = false;
    parlaysDoneRef.current = !deferredShellExtend;
  }, [dataset, deferredShellExtend, viewerScope]);

  const triggerShellExtend = useCallback(
    (background: boolean, scope: ShellExtendScope) => {
      if (!deferredShellExtend) return;
      if (scope === "parlays") {
        if (parlaysStartedRef.current || parlaysDoneRef.current) return;
        parlaysStartedRef.current = true;
      } else {
        if (baseStartedRef.current || baseDoneRef.current || parlaysDoneRef.current) return;
        baseStartedRef.current = true;
      }
      const requestScope = prevViewerScopeRef.current;
      const endpoint =
        scope === "parlays" ? "/api/shell/extend?scope=parlays" : "/api/shell/extend";
      const fetchInit: RequestInit & { priority?: "high" | "low" | "auto" } = {
        credentials: "same-origin",
        priority: background ? "low" : "auto",
      };
      void fetch(endpoint, fetchInit)
        .then((res) => (res.ok ? res.json() : null))
        .then((payload: { games?: WireExtendedGame[]; teams?: ShellTeamEntry[] } | null) => {
          if (!payload) {
            if (scope === "parlays") parlaysStartedRef.current = false;
            else baseStartedRef.current = false;
            return;
          }
          if (prevViewerScopeRef.current !== requestScope) {
            return;
          }
          const extraGames = Array.isArray(payload.games)
            ? payload.games.map(hydrateExtendedGame)
            : [];
          const extraTeams = Array.isArray(payload.teams) ? payload.teams : [];
          if (scope === "parlays") {
            parlaysPayloadRef.current = {
              scope: requestScope,
              games: extraGames,
              teams: extraTeams,
            };
            parlaysDoneRef.current = true;
            baseDoneRef.current = true;
          } else {
            extendedPayloadRef.current = {
              scope: requestScope,
              games: extraGames,
              teams: extraTeams,
            };
            baseDoneRef.current = true;
          }
          startBackgroundTransition(() => {
            setActiveDataset((prev) => mergeShellExtension(prev, extraGames, extraTeams));
          });
        })
        .catch((err) => {
          void err;
          if (scope === "parlays") parlaysStartedRef.current = false;
          else baseStartedRef.current = false;
        });
    },
    [deferredShellExtend],
  );

  const requestFullShell = useCallback(() => {
    const currentPath =
      typeof window !== "undefined" ? window.location.pathname : pathname;
    const scope: ShellExtendScope = requiresParlayScope(currentPath) ? "parlays" : "base";
    triggerShellExtend(false, scope);
  }, [pathname, triggerShellExtend]);

  const requestFullShellBackground = useCallback(() => {
    triggerShellExtend(true, "base");
  }, [triggerShellExtend]);

  useEffect(() => {
    if (!deferredShellExtend) return;
    if (typeof window === "undefined") return;
    if (requiresImmediateShellExtend(pathname)) {
      triggerShellExtend(false, requiresParlayScope(pathname) ? "parlays" : "base");
      return;
    }
    if (hasDedicatedEndpointRoute(pathname) || baseDoneRef.current || parlaysDoneRef.current) {
      return;
    }
    if (typeof window.requestIdleCallback !== "function") {
      return;
    }
    let cancelled = false;
    let idleHandle: number | null = null;
    const rafHandle =
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame(() => {
            if (cancelled || baseStartedRef.current || baseDoneRef.current) return;
            idleHandle = window.requestIdleCallback(
              () => {
                if (!cancelled) requestFullShellBackground();
              },
              { timeout: 1200 },
            );
          })
        : null;
    return () => {
      cancelled = true;
      if (rafHandle !== null && typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(rafHandle);
      }
      if (idleHandle !== null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleHandle);
      }
    };
  }, [deferredShellExtend, pathname, requestFullShellBackground, triggerShellExtend]);

  useEffect(() => {
    setNavPending(false);
  }, [pathname]);

  useEffect(() => {
    if (!navPending) return;
    const timeout = window.setTimeout(() => setNavPending(false), 4000);
    return () => window.clearTimeout(timeout);
  }, [navPending]);

  const handlePrefetchRoute = useCallback(
    (href: string) => {
      const safeHref = sanitizeInternalHref(href);
      if (!safeHref) return;
      const normalized = safeHref.split("#", 1)[0] || "/";
      if (normalized === pathname) return;
      if (prefetchedRef.current.has(normalized)) return;
      if (prefetchedRef.current.size >= MAX_PREFETCHED_ROUTES) {
        const oldest = prefetchedRef.current.values().next().value;
        if (oldest) prefetchedRef.current.delete(oldest);
      }
      prefetchedRef.current.add(normalized);
      try {
        router.prefetch(normalized);
      } catch (err) {
        void err;
      }
    },
    [pathname, router],
  );

  const handleNavigate = useCallback(
    (href: string) => {
      const safeHref = sanitizeInternalHref(href);
      if (!safeHref) return;
      if (requiresImmediateShellExtend(safeHref)) {
        triggerShellExtend(false, requiresParlayScope(safeHref) ? "parlays" : "base");
      }
      if (typeof window !== "undefined") {
        const currentPath = window.location.pathname;
        const nextPath = safeHref.split("?")[0] || "/";
        if (nextPath !== currentPath) {
          if (isDetailRoutePath(nextPath) || !isDetailRoutePath(currentPath)) {
            saveRouteScroll(currentPath, window.scrollY);
          }
          if (!safeHref.includes("#")) {
            setNavPending(true);
          }
        }
      }
      runWithViewTransition(() => {
        startTransition(() => {
          router.push(safeHref, { scroll: !safeHref.includes("#") });
        });
      });
    },
    [router, triggerShellExtend],
  );

  return (
    <PlatformProvider
      dataset={activeDataset}
      initialRole={initialRole}
      allowRoleSimulation={allowRoleSimulation}
      accountsEnabled={accountsEnabled}
      viewerVia={viewerVia}
      paymentMode={paymentMode}
      serverMonth1NoCardMode={serverMonth1NoCardMode}
      viewerIdentity={viewerIdentity}
      onNavigate={handleNavigate}
      onPrefetchRoute={handlePrefetchRoute}
      onRequestFullShell={requestFullShell}
    >
      {navPending || isPending ? (
        <div
          className="pl-route-progress"
          role="progressbar"
          aria-label="Cargando pantalla"
          aria-busy="true"
        />
      ) : null}
      {children}
    </PlatformProvider>
  );
}
