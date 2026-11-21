"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function resolveAllowedTab<T extends string>(
  raw: string | null,
  allowed: readonly T[],
  fallback: T,
): T {
  if (!raw) return fallback;
  const matched = allowed.find((item) => item === raw);
  return matched ?? fallback;
}

export function useUrlSearchTab<T extends string>(
  paramName: string,
  allowed: readonly T[],
  fallback: T,
): readonly [T, (next: T) => void] {
  const allowedRef = useRef<readonly T[]>(allowed);
  allowedRef.current = allowed;
  const fallbackRef = useRef<T>(fallback);
  fallbackRef.current = fallback;

  const [tab, setTabState] = useState<T>(fallback);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncFromLocation = () => {
      try {
        const raw = new URLSearchParams(window.location.search).get(paramName);
        setTabState(
          resolveAllowedTab(raw, allowedRef.current, fallbackRef.current),
        );
      } catch (err) {
        void err;
      }
    };

    syncFromLocation();
    window.addEventListener("popstate", syncFromLocation);
    return () => {
      window.removeEventListener("popstate", syncFromLocation);
    };
  }, [paramName]);

  const setTab = useCallback(
    (next: T) => {
      const resolved = resolveAllowedTab(
        next,
        allowedRef.current,
        fallbackRef.current,
      );
      setTabState(resolved);
      if (typeof window === "undefined") return;
      try {
        const url = new URL(window.location.href);
        url.searchParams.set(paramName, resolved);
        window.history.replaceState(window.history.state, "", url.toString());
      } catch (err) {
        void err;
      }
    },
    [paramName],
  );

  return [tab, setTab] as const;
}
