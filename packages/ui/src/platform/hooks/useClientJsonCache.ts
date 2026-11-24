import { startTransition, useCallback, useEffect, useRef, useState } from "react";

export const DEFAULT_CLIENT_CACHE_STALE_MS = 25_000;
export const DEFAULT_CLIENT_CACHE_TTL_MS = 180_000;
const MAX_CLIENT_CACHE_ENTRIES = 160;

interface CacheEntry {
  data: unknown;
  fetchedAt: number;
  staleAt: number;
  expiresAt: number;
}

interface InFlightEntry {
  promise: Promise<unknown>;
  controller: AbortController;
  subscribers: number;
}

export interface ClientCacheReadResult<T> {
  data: T;
  isStale: boolean;
  ageMs: number;
}

export interface ClientCacheWriteOptions {
  staleTimeMs?: number;
  ttlMs?: number;
  now?: number;
}

export interface PrefetchClientJsonOptions extends ClientCacheWriteOptions {
  cacheKey?: string;
  credentials?: RequestCredentials;
  force?: boolean;
}

export interface UseClientJsonSwrOptions<T> {
  enabled?: boolean;
  cacheKey?: string | null;
  initialData?: T | null;
  staleTimeMs?: number;
  ttlMs?: number;
  revalidateOnStale?: boolean;
  keepPreviousData?: boolean;
  credentials?: RequestCredentials;
  debounceMs?: number;
}

export interface UseClientJsonSwrResult<T> {
  data: T | null;
  loading: boolean;
  isRevalidating: boolean;
  isFromCache: boolean;
  error: string | null;
  reload: () => void;
}

const clientCacheStore = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, InFlightEntry>();

function mapClientHttpError(status: number): string {
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

export function resolveShortSwrPolicy(url: string | null | undefined): {
  staleTimeMs: number;
  ttlMs: number;
} | null {
  if (!url) return null;
  if (/^\/api\/games\/[^/?#]+\/preview(?:$|\?)/.test(url)) {
    return { staleTimeMs: 30_000, ttlMs: 180_000 };
  }
  if (
    url.startsWith("/api/picks/screener") ||
    url.startsWith("/api/picks/lab/") ||
    url.startsWith("/api/compare")
  ) {
    return { staleTimeMs: 25_000, ttlMs: 120_000 };
  }
  return null;
}

function isTypedPayload<T>(value: unknown): value is T {
  return value !== undefined;
}

export function readClientJsonCache<T>(
  key: string | null | undefined,
  now = Date.now(),
): ClientCacheReadResult<T> | null {
  if (!key) return null;
  const entry = clientCacheStore.get(key);
  if (!entry) return null;
  if (now >= entry.expiresAt) {
    clientCacheStore.delete(key);
    return null;
  }
  clientCacheStore.delete(key);
  clientCacheStore.set(key, entry);
  if (!isTypedPayload<T>(entry.data)) return null;
  return {
    data: entry.data,
    isStale: now >= entry.staleAt,
    ageMs: Math.max(0, now - entry.fetchedAt),
  };
}

export function writeClientJsonCache<T>(
  key: string,
  data: T,
  options?: ClientCacheWriteOptions,
): void {
  if (!key) return;
  const now = options?.now ?? Date.now();
  const ttlMs = Math.max(1_000, options?.ttlMs ?? DEFAULT_CLIENT_CACHE_TTL_MS);
  const staleTimeMs = Math.max(
    0,
    Math.min(ttlMs, options?.staleTimeMs ?? DEFAULT_CLIENT_CACHE_STALE_MS),
  );
  if (clientCacheStore.has(key)) {
    clientCacheStore.delete(key);
  }
  while (clientCacheStore.size >= MAX_CLIENT_CACHE_ENTRIES) {
    const oldestKey = clientCacheStore.keys().next().value;
    if (oldestKey === undefined) break;
    clientCacheStore.delete(oldestKey);
  }
  clientCacheStore.set(key, {
    data,
    fetchedAt: now,
    staleAt: now + staleTimeMs,
    expiresAt: now + ttlMs,
  });
}

export function invalidateClientJsonCache(prefixOrKey?: string): number {
  if (!prefixOrKey) {
    const removed = clientCacheStore.size;
    clientCacheStore.clear();
    return removed;
  }
  let removed = 0;
  for (const key of Array.from(clientCacheStore.keys())) {
    if (key === prefixOrKey || key.startsWith(prefixOrKey)) {
      clientCacheStore.delete(key);
      removed += 1;
    }
  }
  return removed;
}

export function clearClientJsonCache(): void {
  clientCacheStore.clear();
  for (const active of inFlightRequests.values()) {
    active.controller.abort();
  }
  inFlightRequests.clear();
}

export function getClientJsonCacheStats(): { size: number; inFlight: number } {
  return {
    size: clientCacheStore.size,
    inFlight: inFlightRequests.size,
  };
}

function subscribeSharedFetch<T>(
  cacheKey: string,
  url: string,
  options: {
    credentials: RequestCredentials;
    staleTimeMs: number;
    ttlMs: number;
  },
): { promise: Promise<T>; release: () => void } {
  const existing = inFlightRequests.get(cacheKey);
  if (existing) {
    existing.subscribers += 1;
    const sharedPromise = existing.promise.then((payload) => {
      if (!isTypedPayload<T>(payload)) {
        throw new Error("Respuesta vacía del cliente");
      }
      return payload;
    });
    return {
      promise: sharedPromise,
      release: () => {
        existing.subscribers = Math.max(0, existing.subscribers - 1);
        if (existing.subscribers === 0 && inFlightRequests.get(cacheKey) === existing) {
          existing.controller.abort();
          inFlightRequests.delete(cacheKey);
        }
      },
    };
  }

  const controller = new AbortController();
  const entry: InFlightEntry = {
    controller,
    subscribers: 1,
    promise: Promise.resolve(null),
  };

  const requestPromise = fetch(url, {
    credentials: options.credentials,
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(mapClientHttpError(response.status));
      }
      const payload: unknown = await response.json();
      writeClientJsonCache(cacheKey, payload, {
        staleTimeMs: options.staleTimeMs,
        ttlMs: options.ttlMs,
      });
      return payload;
    })
    .finally(() => {
      if (inFlightRequests.get(cacheKey) === entry) {
        inFlightRequests.delete(cacheKey);
      }
    });

  entry.promise = requestPromise;
  inFlightRequests.set(cacheKey, entry);

  const typedPromise = requestPromise.then((payload) => {
    if (!isTypedPayload<T>(payload)) {
      throw new Error("Respuesta vacía del cliente");
    }
    return payload;
  });

  return {
    promise: typedPromise,
    release: () => {
      entry.subscribers = Math.max(0, entry.subscribers - 1);
      if (entry.subscribers === 0 && inFlightRequests.get(cacheKey) === entry) {
        entry.controller.abort();
        inFlightRequests.delete(cacheKey);
      }
    },
  };
}

export async function prefetchClientJson<T>(
  url: string | null | undefined,
  options?: PrefetchClientJsonOptions,
): Promise<T | null> {
  if (!url) return null;
  const cacheKey = options?.cacheKey ?? url;
  if (!options?.force) {
    const cached = readClientJsonCache<T>(cacheKey);
    if (cached && !cached.isStale) {
      return cached.data;
    }
  }
  const staleTimeMs = options?.staleTimeMs ?? DEFAULT_CLIENT_CACHE_STALE_MS;
  const ttlMs = options?.ttlMs ?? DEFAULT_CLIENT_CACHE_TTL_MS;
  const credentials = options?.credentials ?? "same-origin";
  const sub = subscribeSharedFetch<T>(cacheKey, url, {
    credentials,
    staleTimeMs,
    ttlMs,
  });
  try {
    return await sub.promise;
  } catch {
    return null;
  }
}

interface SwrAsyncState<T> {
  key: string | null;
  data: T | null;
  loading: boolean;
  isRevalidating: boolean;
  error: string | null;
}

export function useClientJsonSwr<T>(
  url: string | null,
  options?: UseClientJsonSwrOptions<T>,
): UseClientJsonSwrResult<T> {
  const enabled = options?.enabled ?? true;
  const cacheKey = options?.cacheKey ?? url;
  const initialData = options?.initialData ?? null;
  const staleTimeMs = options?.staleTimeMs ?? DEFAULT_CLIENT_CACHE_STALE_MS;
  const ttlMs = options?.ttlMs ?? DEFAULT_CLIENT_CACHE_TTL_MS;
  const revalidateOnStale = options?.revalidateOnStale ?? true;
  const keepPreviousData = options?.keepPreviousData ?? false;
  const credentials = options?.credentials ?? "same-origin";
  const debounceMs = options?.debounceMs ?? 0;

  const [reloadNonce, setReloadNonce] = useState(0);
  const forceReloadNonceRef = useRef(0);

  const cachedHit = enabled ? readClientJsonCache<T>(cacheKey) : null;
  const [asyncState, setAsyncState] = useState<SwrAsyncState<T>>(() => ({
    key: enabled ? (cacheKey ?? null) : null,
    data: cachedHit?.data ?? initialData,
    loading: Boolean(enabled && url && !cachedHit && initialData === null),
    isRevalidating: false,
    error: null,
  }));

  const lastStableDataRef = useRef<T | null>(cachedHit?.data ?? initialData);
  const effectiveCachedData = cachedHit?.data ?? null;

  const reload = useCallback(() => {
    forceReloadNonceRef.current += 1;
    setReloadNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!enabled || !url || !cacheKey) {
      return;
    }

    const forceNetwork = reloadNonce > 0 && forceReloadNonceRef.current === reloadNonce;
    const hit = forceNetwork ? null : readClientJsonCache<T>(cacheKey);

    if (hit && !hit.isStale) {
      lastStableDataRef.current = hit.data;
      setAsyncState((prev) =>
        prev.key === cacheKey && prev.data === hit.data && !prev.loading && !prev.isRevalidating && !prev.error
          ? prev
          : {
              key: cacheKey,
              data: hit.data,
              loading: false,
              isRevalidating: false,
              error: null,
            },
      );
      return;
    }

    if (hit && hit.isStale && !revalidateOnStale) {
      lastStableDataRef.current = hit.data;
      setAsyncState({
        key: cacheKey,
        data: hit.data,
        loading: false,
        isRevalidating: false,
        error: null,
      });
      return;
    }

    let cancelled = false;
    let releaseSub: (() => void) | null = null;
    const hasSeed = hit !== null || initialData !== null;

    setAsyncState((prev) => ({
      key: cacheKey,
      data: hit?.data ?? initialData ?? (keepPreviousData ? prev.data : null),
      loading: !hasSeed,
      isRevalidating: hasSeed,
      error: null,
    }));

    const startNetworkFetch = () => {
      if (cancelled) return;
      const subscription = subscribeSharedFetch<T>(cacheKey, url, {
        credentials,
        staleTimeMs,
        ttlMs,
      });
      releaseSub = subscription.release;
      subscription.promise
        .then((payload) => {
          if (cancelled) return;
          lastStableDataRef.current = payload;
          startTransition(() => {
            if (cancelled) return;
            setAsyncState({
              key: cacheKey,
              data: payload,
              loading: false,
              isRevalidating: false,
              error: null,
            });
          });
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          if (err instanceof Error && err.name === "AbortError") return;
          const message = err instanceof Error ? err.message : "Error de red";
          startTransition(() => {
            if (cancelled) return;
            setAsyncState((prev) => ({
              key: cacheKey,
              data: hit?.data ?? initialData ?? (keepPreviousData ? prev.data : null),
              loading: false,
              isRevalidating: false,
              error: message,
            }));
          });
        });
    };

    const timerId =
      debounceMs > 0
        ? window.setTimeout(startNetworkFetch, debounceMs)
        : null;
    if (timerId === null) {
      startNetworkFetch();
    }

    return () => {
      cancelled = true;
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
      if (releaseSub) {
        releaseSub();
      }
    };
  }, [
    cacheKey,
    credentials,
    debounceMs,
    enabled,
    initialData,
    keepPreviousData,
    reloadNonce,
    revalidateOnStale,
    staleTimeMs,
    ttlMs,
    url,
  ]);

  if (!enabled || !url) {
    return {
      data: initialData,
      loading: false,
      isRevalidating: false,
      isFromCache: false,
      error: null,
      reload,
    };
  }

  if (effectiveCachedData !== null) {
    const matchesCurrent = asyncState.key === cacheKey;
    return {
      data: effectiveCachedData,
      loading: false,
      isRevalidating: matchesCurrent ? asyncState.isRevalidating : Boolean(cachedHit?.isStale && revalidateOnStale),
      isFromCache: true,
      error: matchesCurrent ? asyncState.error : null,
      reload,
    };
  }

  const sameKey = asyncState.key === cacheKey;
  const resolvedData = sameKey
    ? (asyncState.data ?? initialData)
    : (initialData ?? (keepPreviousData ? lastStableDataRef.current : null));

  return {
    data: resolvedData,
    loading: sameKey ? asyncState.loading : initialData === null && resolvedData === null,
    isRevalidating: sameKey ? asyncState.isRevalidating : false,
    isFromCache: false,
    error: sameKey ? asyncState.error : null,
    reload,
  };
}
