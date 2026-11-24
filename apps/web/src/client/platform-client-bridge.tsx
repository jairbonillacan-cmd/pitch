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
  PaymentMode,
  PlatformDataset,
  PlatformGame,
  ViewerRole,
  ViewerVia,
} from "@pitchlab/ui/types";

type ShellTeamEntry = NonNullable<PlatformDataset["teams"]>[number];

const MAX_PREFETCHED_ROUTES = 80;

const EAGER_EXTEND_PATHS: ReadonlySet<string> = new Set([
  "/app/parlays",
  "/app/social",
  "/app/lab",
  "/app/momios",
  "/app/props",
  "/app/tipster",
]);

function requiresImmediateShellExtend(rawPath: string | null | undefined): boolean {
  if (!rawPath) return false;
  const clean = (rawPath.split(/[?#]/, 1)[0] ?? "/").replace(/\/+$/, "") || "/";
  return EAGER_EXTEND_PATHS.has(clean) || clean.startsWith("/app/u/");
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
    if (
      (enriched.parlayCandidates?.length ?? 0) > (g.parlayCandidates?.length ?? 0) ||
      enriched.picks.length > g.picks.length
    ) {
      return {
        ...g,
        picks: enriched.picks.length > g.picks.length ? enriched.picks : g.picks,
        parlayCandidates: enriched.parlayCandidates ?? g.parlayCandidates,
      };
    }
    return g;
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
  const extendStartedRef = useRef<boolean>(false);
  const extendDoneRef = useRef<boolean>(!deferredShellExtend);
  const extendedPayloadRef = useRef<{
    scope: string;
    games: PlatformGame[];
    teams: ShellTeamEntry[];
  } | null>(null);
  const viewerScope = `${initialRole}:${viewerIdentity?.handle ?? "anon"}:${dataset.isServerRedactedForVisitor ? "1" : "0"}`;
  const prevViewerScopeRef = useRef<string>(viewerScope);

  useEffect(() => {
    if (prevViewerScopeRef.current !== viewerScope) {
      prevViewerScopeRef.current = viewerScope;
      invalidateClientJsonCache();
      extendedPayloadRef.current = null;
      extendStartedRef.current = false;
      extendDoneRef.current = !deferredShellExtend;
      setActiveDataset(dataset);
      return;
    }
    const cachedExtended = extendedPayloadRef.current;
    if (cachedExtended && cachedExtended.scope === viewerScope) {
      extendDoneRef.current = true;
      startBackgroundTransition(() => {
        setActiveDataset(
          mergeShellExtension(dataset, cachedExtended.games, cachedExtended.teams),
        );
      });
      return;
    }
    setActiveDataset(dataset);
    extendStartedRef.current = false;
    extendDoneRef.current = !deferredShellExtend;
  }, [dataset, deferredShellExtend, viewerScope]);

  const triggerFullShell = useCallback(
    (background: boolean) => {
      if (!deferredShellExtend || extendStartedRef.current || extendDoneRef.current) return;
      extendStartedRef.current = true;
      const requestScope = prevViewerScopeRef.current;
      const fetchInit: RequestInit & { priority?: "high" | "low" | "auto" } = {
        credentials: "same-origin",
        priority: background ? "low" : "auto",
      };
      void fetch("/api/shell/extend", fetchInit)
        .then((res) => (res.ok ? res.json() : null))
        .then((payload: { games?: PlatformGame[]; teams?: ShellTeamEntry[] } | null) => {
          if (!payload) {
            extendStartedRef.current = false;
            return;
          }
          if (prevViewerScopeRef.current !== requestScope) {
            return;
          }
          const extraGames = Array.isArray(payload.games) ? payload.games : [];
          const extraTeams = Array.isArray(payload.teams) ? payload.teams : [];
          extendedPayloadRef.current = {
            scope: requestScope,
            games: extraGames,
            teams: extraTeams,
          };
          extendDoneRef.current = true;
          startBackgroundTransition(() => {
            setActiveDataset((prev) => mergeShellExtension(prev, extraGames, extraTeams));
          });
        })
        .catch((err) => {
          void err;
          extendStartedRef.current = false;
        });
    },
    [deferredShellExtend],
  );

  const requestFullShell = useCallback(() => {
    triggerFullShell(false);
  }, [triggerFullShell]);

  const requestFullShellBackground = useCallback(() => {
    triggerFullShell(true);
  }, [triggerFullShell]);

  useEffect(() => {
    if (!deferredShellExtend || extendDoneRef.current) return;
    if (typeof window === "undefined") return;
    if (requiresImmediateShellExtend(pathname)) {
      requestFullShell();
      return;
    }
    let cancelled = false;
    let idleHandle: number | null = null;
    let timerHandle: number | null = null;
    const scheduleIdle = () => {
      if (cancelled || extendStartedRef.current || extendDoneRef.current) return;
      if (typeof window.requestIdleCallback === "function") {
        idleHandle = window.requestIdleCallback(
          () => {
            if (!cancelled) requestFullShellBackground();
          },
          { timeout: 1200 },
        );
        return;
      }
      timerHandle = window.setTimeout(() => {
        if (!cancelled) requestFullShellBackground();
      }, 80);
    };
    const rafHandle =
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame(() => scheduleIdle())
        : null;
    if (rafHandle === null) {
      timerHandle = window.setTimeout(scheduleIdle, 80);
    }
    return () => {
      cancelled = true;
      if (rafHandle !== null && typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(rafHandle);
      }
      if (idleHandle !== null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleHandle);
      }
      if (timerHandle !== null) {
        window.clearTimeout(timerHandle);
      }
    };
  }, [deferredShellExtend, pathname, requestFullShell, requestFullShellBackground]);

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
        requestFullShell();
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
            window.scrollTo({ top: 0, left: 0, behavior: "instant" });
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
          }
        }
      }
      runWithViewTransition(() => {
        startTransition(() => {
          router.push(safeHref, { scroll: !safeHref.includes("#") });
        });
      });
    },
    [requestFullShell, router],
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
