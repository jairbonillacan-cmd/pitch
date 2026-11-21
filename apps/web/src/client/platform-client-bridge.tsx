"use client";

import React, { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  isDetailRoutePath,
  runWithViewTransition,
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
    // Conserva parlayCandidates cuando el tramo 2 trae más detalle sin perder el estado local
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
  /** Cuando true, el shell inicial trae la ventana inmediata (< 500 KB) y extiende el horizonte en ocioso. */
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

  // Sincroniza si el layout del servidor manda un dataset distinto (p. ej. cambio de sesión)
  useEffect(() => {
    setActiveDataset(dataset);
    extendStartedRef.current = false;
    extendDoneRef.current = !deferredShellExtend;
  }, [dataset, deferredShellExtend]);

  const requestFullShell = useCallback(() => {
    if (!deferredShellExtend || extendStartedRef.current || extendDoneRef.current) return;
    extendStartedRef.current = true;
    void fetch("/api/shell/extend", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: { games?: PlatformGame[]; teams?: ShellTeamEntry[] } | null) => {
        if (!payload) {
          extendStartedRef.current = false;
          return;
        }
        extendDoneRef.current = true;
        const extraGames = Array.isArray(payload.games) ? payload.games : [];
        const extraTeams = Array.isArray(payload.teams) ? payload.teams : [];
        setActiveDataset((prev) => mergeShellExtension(prev, extraGames, extraTeams));
      })
      .catch((err) => {
        void err;
        extendStartedRef.current = false;
      });
  }, [deferredShellExtend]);

  // Carga diferida del horizonte completo (7 días / todas las ligas) en tiempo ocioso (ADR-053)
  useEffect(() => {
    if (!deferredShellExtend || extendDoneRef.current) return;
    if (typeof window === "undefined") return;
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(() => requestFullShell(), { timeout: 1400 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = window.setTimeout(() => requestFullShell(), 500);
    return () => window.clearTimeout(timer);
  }, [deferredShellExtend, requestFullShell]);

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
      if (!href || !href.startsWith("/")) return;
      const normalized = href.split("#", 1)[0] || "/";
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
      if (typeof window !== "undefined") {
        const currentPath = window.location.pathname;
        const nextPath = href.split("?")[0] || "/";
        if (nextPath !== currentPath) {
          // Guarda scroll de la vista actual antes de entrar a detalle (/g/, /t/, /p/)
          if (isDetailRoutePath(nextPath) || !isDetailRoutePath(currentPath)) {
            saveRouteScroll(currentPath, window.scrollY);
          }
          if (!href.includes("#")) {
            setNavPending(true);
            window.scrollTo({ top: 0, left: 0, behavior: "instant" });
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
          }
        }
      }
      runWithViewTransition(() => {
        startTransition(() => {
          router.push(href, { scroll: !href.includes("#") });
        });
      });
    },
    [router],
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
