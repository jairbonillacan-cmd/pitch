"use client";

import React from "react";
import { MaestroIcon } from "./MaestroPrimitives";
import { usePlatformActions } from "../platform-provider";
import { runWithViewTransition } from "../navigation-helpers";

const INTRA_NAV_TRAIL_STORAGE_KEY = "pl-intra-nav-trail";

export function canSafelyUseHistoryBack(
  win: Pick<Window, "history" | "location" | "sessionStorage">,
  referrer: string,
): boolean {
  if (win.history.length <= 1) return false;
  let sameOriginReferrer = false;
  if (referrer) {
    try {
      sameOriginReferrer = new URL(referrer).origin === win.location.origin;
    } catch (err) {
      void err;
      sameOriginReferrer = false;
    }
  }
  if (sameOriginReferrer) return true;
  try {
    const raw = win.sessionStorage.getItem(INTRA_NAV_TRAIL_STORAGE_KEY);
    if (!raw) return false;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length >= 2;
  } catch (err) {
    void err;
    return false;
  }
}

export function ContextualBackButton({
  fallbackHref,
  label = "Atrás",
}: {
  readonly fallbackHref: string;
  readonly label?: string;
}): React.JSX.Element {
  const { navigateTo, prefetchRoute } = usePlatformActions();

  const handleBack = () => {
    if (
      typeof window !== "undefined" &&
      canSafelyUseHistoryBack(window, document.referrer)
    ) {
      runWithViewTransition(() => {
        window.history.back();
      });
      return;
    }
    navigateTo(fallbackHref);
  };

  return (
    <button
      type="button"
      onClick={handleBack}
      onPointerEnter={() => prefetchRoute(fallbackHref)}
      onTouchStart={() => prefetchRoute(fallbackHref)}
      data-contextual-back=""
      className="pl-back-btn"
    >
      <MaestroIcon name="arrowLeft" size={14} />
      <span>{label}</span>
      <span className="sr-only"> · volver a la pantalla anterior</span>
    </button>
  );
}
