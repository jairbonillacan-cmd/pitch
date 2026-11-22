"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

const INITIAL_LOAD_WINDOW_MS = 3000;

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export interface UseCountUpAnimationOptions {
  value: number;
  decimals: number;
  durationMs: number;
  changeDurationMs: number;
  delayMs: number;
  format?: (n: number) => string;
}

export function useCountUpAnimation({
  value,
  decimals,
  durationMs,
  changeDurationMs,
  delayMs,
  format,
}: UseCountUpAnimationOptions): RefObject<HTMLSpanElement | null> {
  const ref = useRef<HTMLSpanElement | null>(null);
  const previous = useRef<number | null>(null);
  const formatRef = useRef(format);
  formatRef.current = format;

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    const from = previous.current;
    previous.current = value;
    if (
      !el ||
      typeof window === "undefined" ||
      (typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    ) {
      return;
    }

    const isFirst = from === null;
    const duration = isFirst ? durationMs : changeDurationMs;
    const origin = isFirst ? 0 : from;
    if (origin === value) return;

    const now = performance.now();
    let start = now;
    if (isFirst) {
      const initialLoad = now < INITIAL_LOAD_WINDOW_MS;
      if (initialLoad && now > delayMs + duration) return;
      start = initialLoad ? Math.max(now, delayMs) : now + delayMs;
    }

    const renderValue = (n: number): string =>
      formatRef.current ? formatRef.current(n) : n.toFixed(decimals);

    let frame = 0;
    el.textContent = renderValue(origin);
    const tick = (frameNow: number): void => {
      const t = Math.min(1, Math.max(0, (frameNow - start) / duration));
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = renderValue(origin + (value - origin) * eased);
      if (t < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frame);
      el.textContent = renderValue(value);
    };
  }, [value, decimals, durationMs, changeDurationMs, delayMs]);

  return ref;
}

export function useCountdownSeconds(
  initialSeconds = 0,
): [number, Dispatch<SetStateAction<number>>] {
  const [secondsLeft, setSecondsLeft] = useState<number>(initialSeconds);

  useEffect(() => {
    if (secondsLeft <= 0 || typeof window === "undefined") return;
    const timer = window.setTimeout(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [secondsLeft]);

  return [secondsLeft, setSecondsLeft];
}
