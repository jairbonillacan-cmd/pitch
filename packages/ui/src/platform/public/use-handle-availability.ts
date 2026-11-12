"use client";

import { useEffect, useState } from "react";

/** Mismas reglas de formato que checkHandleFormat en @pitchlab/db. */
export const SIGNUP_HANDLE_PATTERN = /^[a-z][a-z0-9_]{2,19}$/;

export function normalizeSignupHandle(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

export type HandleStatus = "idle" | "checking" | "free" | "taken" | "reserved" | "invalid";

export function useHandleAvailability(raw: string, accountsEnabled: boolean, ownHandle?: string): HandleStatus {
  const handle = normalizeSignupHandle(raw);
  const valid = SIGNUP_HANDLE_PATTERN.test(handle);
  const needsLookup = accountsEnabled && valid && handle !== ownHandle;
  const [result, setResult] = useState<{ handle: string; status: HandleStatus } | null>(null);

  useEffect(() => {
    if (!needsLookup) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      let status: HandleStatus = "idle";
      try {
        const response = await fetch("/api/handles/check?h=" + encodeURIComponent(handle), {
          signal: controller.signal,
        });
        if (response.ok) {
          const data = (await response.json()) as { ok: boolean; reason?: string };
          status = data.ok ? "free" : data.reason === "reservado" ? "reserved" :
            data.reason === "ocupado" ? "taken" : "invalid";
        }
      } catch {
        // The server will validate the handle again on submit.
      }
      if (!controller.signal.aborted) setResult({ handle, status });
    }, 450);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [handle, needsLookup]);

  if (!handle) return "idle";
  if (!valid) return "invalid";
  if (!needsLookup) return "free";
  return result?.handle === handle ? result.status : "checking";
}
