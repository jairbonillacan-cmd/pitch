"use client";

import React from "react";
import { MaestroIcon } from "./MaestroPrimitives";
import { usePlatformActions } from "../platform-provider";
import { runWithViewTransition } from "../navigation-helpers";

export function ContextualBackButton({
  fallbackHref,
  label = "Atrás",
}: {
  readonly fallbackHref: string;
  readonly label?: string;
}): React.JSX.Element {
  const { navigateTo, prefetchRoute } = usePlatformActions();

  const handleBack = () => {
    if (typeof window !== "undefined") {
      let sameOriginReferrer = false;
      if (document.referrer) {
        try {
          sameOriginReferrer = new URL(document.referrer).origin === window.location.origin;
        } catch (err) {
          void err;
          sameOriginReferrer = false;
        }
      }
      const canUseHistoryBack = window.history.length > 1 && (sameOriginReferrer || window.history.state !== null);
      if (canUseHistoryBack) {
        runWithViewTransition(() => {
          window.history.back();
        });
        return;
      }
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
