"use client";

import { useState, useCallback } from "react";
import type { PinSubmission } from "@pitchlab/ui";
import { useDashboardEntry } from "./dashboard-entry";

export function useBetaPin(nextPath?: string) {
  const [pinOpen, setPinOpen] = useState(false);
  const enterDashboard = useDashboardEntry();

  const openPin = useCallback(() => {
    setPinOpen(true);
  }, []);

  const closePin = useCallback(() => {
    setPinOpen(false);
  }, []);

  const submitPin = useCallback(
    async (code: string): Promise<PinSubmission> => {
      try {
        const res = await fetch("/api/beta/unlock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, next: nextPath ?? "/app" }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          redirectTo?: string;
        };
        if (res.ok && data.ok) {
          const dest = data.redirectTo ?? "/app";
          return {
            ok: true,
            continueToApp: () => {
              setPinOpen(false);
              enterDashboard(dest);
            },
          };
        }
        return {
          ok: false,
          error:
            data.error ?? "Código incorrecto. Si tienes invitación, escríbenos.",
        };
      } catch (err) {
        void err;
        return {
          ok: false,
          error: "No pudimos verificar el código. Intenta de nuevo.",
        };
      }
    },
    [enterDashboard, nextPath],
  );

  return { pinOpen, openPin, closePin, submitPin };
}
