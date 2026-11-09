"use client";

import React from "react";
import { BrandLogo, ThemeToggle } from "../primitives.js";

export function PublicNav({ signupHref, loginHref, onPricing = false }: {
  signupHref: string;
  loginHref: string;
  onPricing?: boolean;
}) {
  const landing = onPricing ? "/" : "";
  return (
    <header className="lv-nav">
      <div className="lv-nav-in">
        <a href="/" className="lv-logo" aria-label="PitchLab, inicio">
          <BrandLogo variant="horizontal" width={132} />
        </a>
        <nav aria-label="Secciones" className="lv-links">
          <a href={`${landing}#como-se-lee`}>Cómo se lee</a>
          <a href={`${landing}#historial`}>Historial</a>
          <a href={`${landing}#ligas`}>Ligas</a>
          <a href="#planes" aria-current={onPricing ? "page" : undefined}>Planes</a>
        </nav>
        <div className="lv-nav-actions">
          <ThemeToggle />
          <a href={loginHref} className="button button--ghost button--sm">Entrar</a>
          <a href={signupHref} className="button button--primary button--sm">Prueba 7 días</a>
        </div>
      </div>
    </header>
  );
}
