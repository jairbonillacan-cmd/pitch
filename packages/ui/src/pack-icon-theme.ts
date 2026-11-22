"use client";

import { useSyncExternalStore } from "react";

export type PackIconBase = "/icons" | "/icons-dark";

const themeListeners = new Set<() => void>();
let sharedObserver: MutationObserver | null = null;

function readCurrentPackBase(): PackIconBase {
  if (typeof document === "undefined") return "/icons";
  return document.documentElement.dataset.theme === "light" ? "/icons" : "/icons-dark";
}

function readServerPackBase(): PackIconBase {
  return "/icons";
}

function ensureSharedObserver(): void {
  if (sharedObserver || typeof document === "undefined" || typeof MutationObserver === "undefined") {
    return;
  }
  const root = document.documentElement;
  sharedObserver = new MutationObserver(() => {
    for (const listener of themeListeners) {
      listener();
    }
  });
  sharedObserver.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
}

function subscribePackIconBase(listener: () => void): () => void {
  ensureSharedObserver();
  themeListeners.add(listener);
  return () => {
    themeListeners.delete(listener);
    if (themeListeners.size === 0 && sharedObserver) {
      sharedObserver.disconnect();
      sharedObserver = null;
    }
  };
}

export function usePackIconBase(): PackIconBase {
  return useSyncExternalStore(
    subscribePackIconBase,
    readCurrentPackBase,
    readServerPackBase,
  );
}

function normalizePackRelativeAsset(relativeAsset: string): string {
  return relativeAsset.replace(/^\/+/, "").replace(/\.webp$/i, "");
}

export function buildPackIconSources(
  base: PackIconBase,
  relativeAsset: string,
): { readonly src: string; readonly srcSet: string } {
  const normalized = normalizePackRelativeAsset(relativeAsset);
  const src1x = `${base}/32/${normalized}.webp`;
  const src2x = `${base}/64/${normalized}.webp`;
  return {
    src: src1x,
    srcSet: `${src1x} 1x, ${src2x} 2x`,
  };
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
