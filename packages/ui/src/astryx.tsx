"use client";

import React, { useLayoutEffect, useRef } from "react";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";

/**
 * Contenedor obligatorio para usar componentes de Astryx en PitchLab.
 *
 * - Usa el tema neutral de Astryx como base estructural; colores, radios y tipografía
 *   los pone el puente `apps/web/app/astryx-pitchlab.css` con los tokens.
 * - El tema (oscuro/claro) lo manda solo `data-theme` en <html> (ThemeToggle y el
 *   script de <head>). Por eso <Theme> va en modo "system": así su envoltorio no
 *   declara `data-theme` propio, que haría que HeroUI redefiniera sus variables
 *   (y `--surface-hover`, que también es token de la marca) dentro de Astryx.
 * - El <Theme> raíz de Astryx quita `data-theme` de <html> en modo "system" y al
 *   desmontarse; el guardián de abajo lo restaura al instante para que montar o
 *   salir de una pantalla nunca cambie el tema del usuario.
 */
export function AstryxScope({ children }: { children: React.ReactNode }) {
  // Se lee durante el render: el efecto de Astryx (hijo) corre antes que el nuestro y
  // ya habría quitado el atributo.
  const initialTheme = useRef<string | null>(null);
  if (initialTheme.current === null && typeof document !== "undefined") {
    initialTheme.current = document.documentElement.getAttribute("data-theme") ?? "dark";
  }

  useLayoutEffect(() => {
    const html = document.documentElement;
    let last = html.getAttribute("data-theme") ?? initialTheme.current ?? "dark";
    const restore = () => {
      const current = html.getAttribute("data-theme");
      if (current) last = current;
      else html.setAttribute("data-theme", last);
    };
    const observer = new MutationObserver(restore);
    observer.observe(html, { attributes: true, attributeFilter: ["data-theme"] });
    // Astryx sincroniza <html> en un efecto que puede correr después de este.
    queueMicrotask(restore);
    return () => {
      observer.disconnect();
      queueMicrotask(() => {
        if (!html.hasAttribute("data-theme")) html.setAttribute("data-theme", last);
      });
    };
  }, []);

  return (
    <Theme theme={neutralTheme} mode="system">
      {children}
    </Theme>
  );
}
