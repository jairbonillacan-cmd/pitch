"use client";

import React, { useState } from "react";
import { BrandLogo } from "@pitchlab/ui/brand-logo";
import { useSafeEffect } from "@pitchlab/ui/hooks";

/**
 * Pantalla pública ligera para navegación sin conexión (ADR-053).
 * Cero dependencias externas, solo tokens `--pl-*`, botón Reintentar y recarga automática al volver `online`.
 */
export default function OfflinePage(): React.JSX.Element {
  const [reconnecting, setReconnecting] = useState<boolean>(false);

  useSafeEffect(() => {
    if (typeof window === "undefined") return;
    const handleOnline = () => {
      setReconnecting(true);
      window.location.reload();
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  return (
    <main className="pl-notfound" aria-labelledby="offline-title">
      <div className="pl-notfound-card glass-lens glass-ring">
        <a href="/app" aria-label="PitchLab" className="pl-notfound-logo">
          <BrandLogo variant="horizontal" width={123} height={24} alt="" />
        </a>
        <p className="pl-notfound-code num">SIN CONEXIÓN</p>
        <h1 id="offline-title" className="pl-notfound-title">
          No tienes conexión a internet
        </h1>
        <p className="pl-notfound-copy">
          {reconnecting
            ? "Conexión recuperada. Recargando los partidos y cuotas más recientes…"
            : "En cuanto regrese tu red, esta pantalla volverá a cargar automáticamente."}
        </p>
        <div className="pl-notfound-actions">
          <button
            type="button"
            className="pl-prof-btn pl-prof-btn--primary"
            onClick={() => {
              setReconnecting(true);
              if (typeof window !== "undefined") window.location.reload();
            }}
          >
            Reintentar
          </button>
          <a href="/app" className="pl-prof-btn pl-prof-btn--ghost">
            Ir a partidos de hoy
          </a>
        </div>
      </div>
    </main>
  );
}
