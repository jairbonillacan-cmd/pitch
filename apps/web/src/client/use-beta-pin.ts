"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

export function useBetaPin(nextPath?: string) {
  const [pinOpen, setPinOpen] = useState(false);
  const router = useRouter();

  const openPin = useCallback(() => {
    setPinOpen(true);
  }, []);

  const closePin = useCallback(() => {
    setPinOpen(false);
  }, []);

  const submitPin = useCallback(
    async (code: string): Promise<{ ok: boolean; error?: string }> => {
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
          setTimeout(() => {
            router.push(dest);
          }, 300);
          return { ok: true };
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
    [nextPath, router],
  );

  return { pinOpen, openPin, closePin, submitPin };
}
