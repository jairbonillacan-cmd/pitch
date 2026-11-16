"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { hasLocalAnalyticsConsent, sendConsentGatedFunnelStage } from "@pitchlab/ui/platform";

/** Registra el Service Worker PWA y eventos de landing solo bajo consentimiento explícito. */
export function PwaRuntimeMount(): null {
  const pathname = usePathname() ?? "/";

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (pathname !== "/" && pathname !== "/landing") return;
    if (!hasLocalAnalyticsConsent()) return;
    sendConsentGatedFunnelStage("landing", pathname);
  }, [pathname]);

  return null;
}
