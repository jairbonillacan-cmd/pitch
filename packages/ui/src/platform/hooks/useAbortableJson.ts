"use client";

import { useCallback, useEffect, useState } from "react";

export interface UseAbortableJsonOptions<T> {
  readonly enabled?: boolean;
  readonly initialData?: T | null;
}

export interface UseAbortableJsonResult<T> {
  readonly data: T | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly reload: () => void;
}

function mapHttpErrorMessage(status: number): string {
  if (status === 401) {
    return "Inicia sesión para consultar esta información.";
  }
  if (status === 403) {
    return "Tu cuenta no tiene acceso a este recurso.";
  }
  if (status === 404) {
    return "No encontramos datos disponibles para esta vista.";
  }
  return "No se pudo cargar la información.";
}

export function useAbortableJson<T>(
  url: string | null,
  opts?: UseAbortableJsonOptions<T>,
): UseAbortableJsonResult<T> {
  const enabled = opts?.enabled ?? true;
  const initialData = opts?.initialData ?? null;

  const [data, setData] = useState<T | null>(initialData);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState<number>(0);

  const reload = useCallback(() => {
    setReloadTick((tick) => tick + 1);
  }, []);

  useEffect(() => {
    if (!enabled || !url || typeof fetch !== "function") {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(mapHttpErrorMessage(response.status));
        }
        const parsed = (await response.json()) as T;
        if (!controller.signal.aborted) {
          setData(parsed);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) {
          return;
        }
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        setError(
          err instanceof Error && err.message.length > 0 && err.message.length <= 160
            ? err.message
            : "No se pudo cargar la información.",
        );
        setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [url, enabled, reloadTick]);

  return { data, loading, error, reload };
}
