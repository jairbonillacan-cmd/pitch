"use client";

import React, { useEffect } from "react";
import { BrandLogo } from "@pitchlab/ui";

export default function PublicErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  useEffect(() => {
    console.error("[error público]", error);
  }, [error]);

  return (
    <main className="pl-notfound">
      <div className="pl-notfound-card glass-lens glass-ring">
        <a href="/" aria-label="PitchLab, inicio" className="pl-notfound-logo">
          <BrandLogo variant="horizontal" width={123} height={24} alt="" />
        </a>
        <p className="pl-notfound-code num">500</p>
        <h1 className="pl-notfound-title">Algo salió mal al cargar esta vista</h1>
        <p className="pl-notfound-copy">
          Intenta recargar la página o vuelve al inicio mientras lo resolvemos.
        </p>
        <div className="pl-notfound-actions">
          <button
            type="button"
            className="pl-prof-btn pl-prof-btn--primary"
            onClick={() => reset()}
          >
            Intentar de nuevo
          </button>
          <a href="/" className="pl-prof-btn pl-prof-btn--ghost">
            Ir al inicio
          </a>
        </div>
      </div>
    </main>
  );
}
