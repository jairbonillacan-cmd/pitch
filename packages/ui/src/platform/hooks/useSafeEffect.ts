"use client";

import { useEffect } from "react";

export function useSafeEffect(
  effect: () => void | (() => void),
  deps: readonly unknown[],
): void {
  useEffect(effect, deps);
}
