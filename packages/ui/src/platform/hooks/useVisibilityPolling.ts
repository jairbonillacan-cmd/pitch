"use client";

import { useEffect, useRef } from "react";

export function useVisibilityPolling(
  callback: () => void | Promise<void>,
  intervalMs: number | null,
  enabled = true,
): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (
      !enabled ||
      intervalMs === null ||
      !Number.isFinite(intervalMs) ||
      intervalMs <= 0 ||
      typeof window === "undefined" ||
      typeof document === "undefined"
    ) {
      return;
    }

    const safeIntervalMs: number = intervalMs;
    let timerId: number | null = null;
    let inFlight = false;
    let disposed = false;

    const runTick = () => {
      if (disposed || inFlight || document.visibilityState === "hidden") {
        return;
      }
      inFlight = true;
      Promise.resolve()
        .then(() => callbackRef.current())
        .catch((err) => {
          void err;
        })
        .finally(() => {
          inFlight = false;
        });
    };

    const stopTimer = () => {
      if (timerId !== null) {
        window.clearInterval(timerId);
        timerId = null;
      }
    };

    const startTimer = () => {
      stopTimer();
      if (document.visibilityState !== "hidden") {
        timerId = window.setInterval(runTick, safeIntervalMs);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stopTimer();
      } else {
        runTick();
        startTimer();
      }
    };

    startTimer();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      stopTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [intervalMs, enabled]);
}
