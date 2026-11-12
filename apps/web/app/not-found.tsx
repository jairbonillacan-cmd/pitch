import React from "react";
import type { Metadata } from "next";
import { BrandLogo } from "@pitchlab/ui";

export const metadata: Metadata = {
  title: "Página no encontrada · PitchLab",
};

export default function NotFound(): React.JSX.Element {
  return (
    <main className="pl-notfound">
      <div className="pl-notfound-card glass-lens glass-ring">
        <a href="/" aria-label="PitchLab, inicio" className="pl-notfound-logo">
          <BrandLogo variant="horizontal" width={123} height={24} alt="" />
        </a>
        <p className="pl-notfound-code num">404</p>
        <h1 className="pl-notfound-title">Esta página no existe</h1>
        <p className="pl-notfound-copy">Revisa el enlace o vuelve a los partidos de hoy.</p>
        <div className="pl-notfound-actions">
          <a href="/app" className="pl-prof-btn pl-prof-btn--primary">
            Partidos de hoy
          </a>
          <a href="/" className="pl-prof-btn pl-prof-btn--ghost">
            Inicio
          </a>
        </div>
      </div>
    </main>
  );
}
