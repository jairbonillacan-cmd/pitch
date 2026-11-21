"use client";

import React from "react";
import { MaestroIcon } from "./MaestroPrimitives";
import { usePlatformActions } from "../platform-provider";
import { runWithViewTransition } from "../navigation-helpers";

/**
 * Botón contextual accesible `← Atrás` (`>= 44×44 px`) para vistas de detalle (`/g/`, `/t/`, `/p/`).
 * Vuelve con `window.history.back()` (disparando restauración de scroll en `ClubShellBridge`)
 * si el usuario navegó dentro del mismo origen, o cae con seguridad a `fallbackHref` (liga o `/app`)
 * cuando entró por enlace directo (ADR-053).
 */
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
      aria-label="Volver a la pantalla anterior"
      data-contextual-back=""
      className="pl-back-btn"
    >
      <MaestroIcon name="arrowLeft" size={14} />
      <span>{label}</span>
    </button>
  );
}
