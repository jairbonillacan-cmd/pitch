"use client";

import React, { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ClubLayoutShell } from "@pitchlab/ui/club-shell";
import { ExpiredPassGate } from "@pitchlab/ui/expired-pass";
import { clearRouteScroll, readRouteScroll } from "@pitchlab/ui/navigation-helpers";
import type { PaymentMode } from "@pitchlab/ui/types";

const PRIMARY_ROUTES = ["/app", "/app/parlays", "/app/social", "/app/lab"] as const;

function isAllowedRecoveryPath(rawPath: string): boolean {
  const pathOnly = (rawPath.split(/[?#]/, 1)[0] ?? "/").replace(/\/+$/, "") || "/";
  return (
    pathOnly === "/app/account" ||
    pathOnly.startsWith("/app/account/") ||
    pathOnly === "/app/canjear" ||
    pathOnly.startsWith("/app/canjear/") ||
    pathOnly === "/app/juego-responsable"
  );
}

function resetWindowScrollToTop(): void {
  if (typeof window === "undefined") return;
  if (window.location.hash) return;
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

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
    const onPlanUpdated = () => {
      router.refresh();
    };
    window.addEventListener("popstate", onPopState);
    window.addEventListener("pitchlab:plan-updated", onPlanUpdated);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("pitchlab:plan-updated", onPlanUpdated);
    };
  }, [router]);

  useLayoutEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname;
      if (isBackNavigationRef.current) {
        isBackNavigationRef.current = false;
        const savedY = readRouteScroll(pathname);
        if (savedY !== null && savedY > 0) {
          clearRouteScroll(pathname);
          let userInteracted = false;
          const cancelOnUserScroll = () => {
            userInteracted = true;
          };
          window.addEventListener("wheel", cancelOnUserScroll, { passive: true, once: true });
          window.addEventListener("touchmove", cancelOnUserScroll, { passive: true, once: true });
          const restore = () => {
            if (!userInteracted) {
              window.scrollTo({ top: savedY, left: 0, behavior: "instant" });
            }
          };
          restore();
          const raf = window.requestAnimationFrame(restore);
          const settleTimer = window.setTimeout(restore, 120);
          return () => {
            window.cancelAnimationFrame(raf);
            window.clearTimeout(settleTimer);
            window.removeEventListener("wheel", cancelOnUserScroll);
            window.removeEventListener("touchmove", cancelOnUserScroll);
          };
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
