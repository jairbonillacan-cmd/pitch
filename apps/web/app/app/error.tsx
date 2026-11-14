"use client";

import React, { useEffect } from "react";
import { BrandLogo } from "@pitchlab/ui";

export default function ClubErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  useEffect(() => {
    console.error("[error club]", error);
  }, [error]);

  return (
    <main className="pl-notfound">
      <div className="pl-notfound-card glass-lens glass-ring">
        <a href="/app" aria-label="PitchLab, partidos de hoy" className="pl-notfound-logo">
          <BrandLogo variant="horizontal" width={123} height={24} alt="" />
        </a>
        <p className="pl-notfound-code num">Error</p>
        <h1 className="pl-notfound-title">No pudimos cargar esta pantalla</h1>
        <p className="pl-notfound-copy">
          Vuelve a intentarlo o regresa a los partidos de hoy.
        </p>
        <div className="pl-notfound-actions">
          <button
            type="button"
            className="pl-prof-btn pl-prof-btn--primary"
            onClick={() => reset()}
          >
            Intentar de nuevo
          </button>
          <a href="/app" className="pl-prof-btn pl-prof-btn--ghost">
            Partidos de hoy
          </a>
        </div>
      </div>
    </main>
  );
}
