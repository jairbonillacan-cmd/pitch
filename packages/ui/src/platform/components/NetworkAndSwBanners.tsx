"use client";

import React, { useEffect, useState } from "react";
import { MaestroIcon } from "./MaestroPrimitives";

export const SW_UPDATE_EVENT = "pl-sw-update-available";
export const SW_APPLY_UPDATE_EVENT = "pl-sw-apply-update";

/**
 * Indicadores no bloqueantes de red y actualización PWA (ADR-053):
 * 1. Pill discreto «Sin conexión» cuando `navigator.onLine === false`, auto-ocultado al volver la red.
 * 2. Banner discreto «Nueva versión lista · Actualizar» cuando un Service Worker en producción espera activación.
 */
export function NetworkAndSwBanners(): React.JSX.Element | null {
  const [offline, setOffline] = useState<boolean>(false);
  const [swUpdateReady, setSwUpdateReady] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setOffline(window.navigator.onLine === false);

    const onOffline = () => setOffline(true);
    const onOnline = () => setOffline(false);
    const onSwUpdate = () => setSwUpdateReady(true);

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    window.addEventListener(SW_UPDATE_EVENT, onSwUpdate);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      window.removeEventListener(SW_UPDATE_EVENT, onSwUpdate);
    };
  }, []);

  if (!offline && !swUpdateReady) return null;

  return (
    <div className="pl-status-banners" aria-live="polite" aria-atomic="false">
      {offline ? (
        <div role="status" className="pl-offline-pill glass-ring" data-offline-pill="">
          <span className="pl-offline-dot" aria-hidden="true" />
          <span>Sin conexión</span>
        </div>
      ) : null}

      {swUpdateReady ? (
        <div role="status" className="pl-sw-update-pill glass-ring" data-sw-update-banner="">
          <MaestroIcon name="sparkles" size={14} />
          <span>Nueva versión lista</span>
          <button
            type="button"
            className="pl-sw-update-btn"
            onClick={() => {
              setSwUpdateReady(false);
              window.dispatchEvent(new Event(SW_APPLY_UPDATE_EVENT));
            }}
          >
            Actualizar
          </button>
        </div>
      ) : null}
    </div>
  );
}
