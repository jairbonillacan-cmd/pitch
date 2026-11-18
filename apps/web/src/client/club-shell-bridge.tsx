"use client";

import React, { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ClubLayoutShell } from "@pitchlab/ui";

/** Las 4 páginas del menú principal: se precargan para que el clic sea inmediato. */
const PRIMARY_ROUTES = ["/app", "/app/parlays", "/app/social", "/app/lab"] as const;

function resetWindowScrollToTop(): void {
  if (typeof window === "undefined") return;
  if (window.location.hash) return;
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

/**
 * Monta el encabezado y la barra lateral una sola vez en el layout de /app.
 * Cada página solo aporta su contenido y al cambiar de ruta sube siempre al inicio.
 */
export function ClubShellBridge({ children }: { children: React.ReactNode }): React.JSX.Element {
  const pathname = usePathname() ?? "/app";
  const router = useRouter();
  const prevPathnameRef = useRef<string>(pathname);

  useLayoutEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname;
      resetWindowScrollToTop();
      const raf = window.requestAnimationFrame(resetWindowScrollToTop);
      return () => window.cancelAnimationFrame(raf);
    }
    return undefined;
  }, [pathname]);

  useEffect(() => {
    // Precarga completa (datos incluidos): las páginas son dinámicas, así que la precarga
    // parcial por defecto solo traería el esqueleto de carga.
    const idle =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback
        : (cb: () => void) => window.setTimeout(cb, 400);
    idle(() => {
      for (const href of PRIMARY_ROUTES) {
        if (href !== pathname) router.prefetch(href, { kind: "full" } as never);
      }
    });
    // Solo al montar el layout: las rutas precargadas quedan en la caché del router.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <ClubLayoutShell activePath={pathname}>{children}</ClubLayoutShell>;
}
