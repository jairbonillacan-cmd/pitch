"use client";

import { useCallback, useSyncExternalStore } from "react";

export function useMediaQuery(query: string, serverFallback = false): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return () => undefined;
      }
      const mediaQueryList = window.matchMedia(query);
      if (typeof mediaQueryList.addEventListener === "function") {
        mediaQueryList.addEventListener("change", onStoreChange);
        return () => {
          mediaQueryList.removeEventListener("change", onStoreChange);
        };
      }
      if (typeof mediaQueryList.addListener === "function") {
        mediaQueryList.addListener(onStoreChange);
        return () => {
          mediaQueryList.removeListener(onStoreChange);
        };
      }
      return () => undefined;
    },
    [query],
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return serverFallback;
    }
    return window.matchMedia(query).matches;
  }, [query, serverFallback]);

  const getServerSnapshot = useCallback(() => serverFallback, [serverFallback]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
