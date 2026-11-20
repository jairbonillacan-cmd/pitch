"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { hasLocalAnalyticsConsent, sendConsentGatedFunnelStage } from "@pitchlab/ui/funnel-consent";

function isLocalDevHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".localhost")
  );
}

/**
 * Registra el Service Worker PWA solo en producción remota y limpia registros/cachés
 * obsoletos (`pitchlab-static-*`) en desarrollo local para evitar mezclar chunks de `next dev`.
 */
export function PwaRuntimeMount(): null {
  const pathname = usePathname() ?? "/";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const disableSw =
      process.env.NODE_ENV !== "production" || isLocalDevHost(window.location.hostname);

    if (disableSw) {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker
          .getRegistrations()
          .then((regs) => Promise.all(regs.map((reg) => reg.unregister())))
          .catch(() => undefined);
      }
      if ("caches" in window) {
        window.caches
          .keys()
          .then((names) =>
            Promise.all(
              names
                .filter((name) => name.startsWith("pitchlab-static-"))
                .map((name) => window.caches.delete(name)),
            ),
          )
          .catch(() => undefined);
      }
      return;
    }

    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (pathname !== "/" && pathname !== "/landing") return;
    if (!hasLocalAnalyticsConsent()) return;
    sendConsentGatedFunnelStage("landing", pathname);
  }, [pathname]);

  return null;
}
