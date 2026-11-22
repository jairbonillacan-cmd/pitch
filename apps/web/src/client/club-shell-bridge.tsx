"use client";

import React, { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ClubLayoutShell } from "@pitchlab/ui/club-shell";
import { ExpiredPassGate } from "@pitchlab/ui/expired-pass";
import { clearRouteScroll, readRouteScroll } from "@pitchlab/ui/navigation-helpers";
import type { PaymentMode } from "@pitchlab/ui/types";

/** Las 4 páginas del menú principal: se precargan para que el clic sea inmediato. */
const PRIMARY_ROUTES = ["/app", "/app/parlays", "/app/social", "/app/lab"] as const;

function isAllowedRecoveryPath(rawPath: string): boolean {
  const pathOnly = (rawPath.split(/[?#]/, 1)[0] ?? "/").replace(/\/+$/, "") || "/";
  return (
    pathOnly === "/app/account" ||
    pathOnly.startsWith("/app/account/") ||
    pathOnly === "/app/canjear" ||
    pathOnly.startsWith("/app/canjear/")
  );
}

function resetWindowScrollToTop(): void {
  if (typeof window === "undefined") return;
  if (window.location.hash) return;
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

/**
 * Monta el encabezado y la barra lateral una sola vez en el layout de /app.
 * Al avanzar entre pantallas sube al inicio; al volver atrás (`popstate` / botón Atrás)
 * restaura la posición de scroll guardada (ADR-053).
 * Si el pase venció (`expiredPassGate`), reevalúa la ruta en cada transición cliente para
 * impedir saltarse `ExpiredPassGate` desde `/app/account` o `/app/canjear`.
 */
export function ClubShellBridge({
  children,
  expiredPassGate = null,
}: {
  children: React.ReactNode;
  expiredPassGate?: {
    memberHandle: string | null;
    paymentMode: PaymentMode;
  } | null;
}): React.JSX.Element {
  const pathname = usePathname() ?? "/app";
  const router = useRouter();
  const prevPathnameRef = useRef<string>(pathname);
  const isBackNavigationRef = useRef<boolean>(false);
  const mountPrefetchRef = useRef({ expiredPassGate, pathname, router });

  useEffect(() => {
    const onPopState = () => {
      isBackNavigationRef.current = true;
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useLayoutEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname;
      if (isBackNavigationRef.current) {
        isBackNavigationRef.current = false;
        const savedY = readRouteScroll(pathname);
        if (savedY !== null && savedY > 0) {
          clearRouteScroll(pathname);
          const restore = () => window.scrollTo({ top: savedY, left: 0, behavior: "instant" });
          restore();
          const raf = window.requestAnimationFrame(restore);
          return () => window.cancelAnimationFrame(raf);
        }
      }
      resetWindowScrollToTop();
      const raf = window.requestAnimationFrame(resetWindowScrollToTop);
      return () => window.cancelAnimationFrame(raf);
    }
    return undefined;
  }, [pathname]);

  useEffect(() => {
    const {
      expiredPassGate: initialExpiredPassGate,
      pathname: initialPathname,
      router: initialRouter,
    } = mountPrefetchRef.current;
    if (initialExpiredPassGate) return undefined;
    const prefetchPrimaryRoutes = () => {
      for (const href of PRIMARY_ROUTES) {
        if (href !== initialPathname) initialRouter.prefetch(href);
      }
    };
    if (
      typeof window.requestIdleCallback === "function" &&
      typeof window.cancelIdleCallback === "function"
    ) {
      const idleHandle = window.requestIdleCallback(prefetchPrimaryRoutes);
      return () => window.cancelIdleCallback(idleHandle);
    }
    const timerId = window.setTimeout(prefetchPrimaryRoutes, 400);
    return () => window.clearTimeout(timerId);
  }, []);

  if (expiredPassGate && !isAllowedRecoveryPath(pathname)) {
    return (
      <ExpiredPassGate
        memberHandle={expiredPassGate.memberHandle}
        paymentMode={expiredPassGate.paymentMode}
      />
    );
  }

  return <ClubLayoutShell activePath={pathname}>{children}</ClubLayoutShell>;
}
