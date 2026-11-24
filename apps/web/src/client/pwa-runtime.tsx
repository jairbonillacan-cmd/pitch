"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { hasLocalAnalyticsConsent, sendConsentGatedFunnelStage } from "@pitchlab/ui/funnel-consent";
import { subscribeThemeRuntime } from "@pitchlab/ui/theme-controller";

const SW_UPDATE_EVENT = "pl-sw-update-available";
const SW_APPLY_UPDATE_EVENT = "pl-sw-apply-update";

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
 * obsoletos (`pitchlab-*`) en desarrollo local para evitar mezclar chunks de `next dev` (ADR-053).
 * En producción detecta actualizaciones en espera y coordina el banner «Nueva versión lista · Actualizar».
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
                .filter((name) => name.startsWith("pitchlab-"))
                .map((name) => window.caches.delete(name)),
            ),
          )
          .catch(() => undefined);
      }
      return;
    }

    if (!("serviceWorker" in navigator)) return;

    let activeReg: ServiceWorkerRegistration | null = null;
    let refreshing = false;

    const announceUpdate = () => {
      window.dispatchEvent(new Event(SW_UPDATE_EVENT));
    };

    const onApplyUpdate = () => {
      const waiting = activeReg?.waiting;
      if (waiting) {
        waiting.postMessage({ type: "SKIP_WAITING" });
      } else {
        window.location.reload();
      }
    };

    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };

    window.addEventListener(SW_APPLY_UPDATE_EVENT, onApplyUpdate);
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        activeReg = reg;
        if (reg.waiting && navigator.serviceWorker.controller) {
          announceUpdate();
        }
        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              announceUpdate();
            }
          });
        });
      })
      .catch(() => undefined);

    return () => {
      window.removeEventListener(SW_APPLY_UPDATE_EVENT, onApplyUpdate);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  useEffect(() => {
    return subscribeThemeRuntime();
  }, []);

  useEffect(() => {
    if (pathname !== "/" && pathname !== "/landing") return;
    if (!hasLocalAnalyticsConsent()) return;
    sendConsentGatedFunnelStage("landing", pathname);
  }, [pathname]);

  return null;
}
