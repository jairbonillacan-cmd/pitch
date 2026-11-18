"use client";

import { useEffect, useState } from "react";

export type PackIconBase = "/icons" | "/icons-dark";

const themeListeners = new Set<(next: PackIconBase) => void>();
let sharedObserver: MutationObserver | null = null;

function readCurrentPackBase(): PackIconBase {
  if (typeof document === "undefined") return "/icons";
  return document.documentElement.dataset.theme === "light" ? "/icons" : "/icons-dark";
}

function ensureSharedObserver(): void {
  if (sharedObserver || typeof document === "undefined" || typeof MutationObserver === "undefined") {
    return;
  }
  const root = document.documentElement;
  sharedObserver = new MutationObserver(() => {
    const next = readCurrentPackBase();
    for (const listener of themeListeners) {
      listener(next);
    }
  });
  sharedObserver.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
}

/**
 * Devuelve `/icons` en modo claro y `/icons-dark` en modo oscuro usando un único
 * `MutationObserver` compartido en todo el documento y manteniendo `/icons` en SSR
 * para evitar cualquier desajuste de hidratación.
 */
export function usePackIconBase(): PackIconBase {
  const [base, setBase] = useState<PackIconBase>("/icons");

  useEffect(() => {
    setBase(readCurrentPackBase());
    ensureSharedObserver();
    themeListeners.add(setBase);
    return () => {
      themeListeners.delete(setBase);
      if (themeListeners.size === 0 && sharedObserver) {
        sharedObserver.disconnect();
        sharedObserver = null;
      }
    };
  }, []);

  return base;
}

export function resolveThemedPackUrl(url: string, base: PackIconBase): string {
  if (base === "/icons") return url;
  return url.replace(/^\/icons\//, "/icons-dark/");
}

export function resolveThemedPackSrcSet(
  srcSet: string | null | undefined,
  base: PackIconBase,
): string | undefined {
  if (!srcSet) return undefined;
  if (base === "/icons") return srcSet;
  return srcSet.replace(/\/icons\//g, "/icons-dark/");
}
