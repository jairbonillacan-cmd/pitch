import { startTransition, useCallback, useEffect, useRef, useState } from "react";

export const DEFAULT_CLIENT_CACHE_STALE_MS = 25_000;
export const DEFAULT_CLIENT_CACHE_TTL_MS = 180_000;
const MAX_CLIENT_CACHE_ENTRIES = 160;
const DEFAULT_VIEWER_SCOPE = "anon";
const SCOPE_KEY_SEPARATOR = "::";

interface CacheEntry {
  data: unknown;
  fetchedAt: number;
  staleAt: number;
  expiresAt: number;
}

interface InFlightEntry {
  scope: string;
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
  viewerScope?: string;
}

export interface PrefetchClientJsonOptions extends ClientCacheWriteOptions {
  cacheKey?: string;
  credentials?: RequestCredentials;
  force?: boolean;
}

export interface UseClientJsonSwrOptions<T> {
  enabled?: boolean;
  cacheKey?: string | null;
  viewerScope?: string;
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
let activeViewerScope = DEFAULT_VIEWER_SCOPE;

function normalizeViewerScope(scope?: string | null): string {
  const clean = scope?.trim();
  return clean && clean.length > 0 ? clean : activeViewerScope;
}

function toScopedCacheKey(key: string, scopeOverride?: string | null): string {
  const scope = normalizeViewerScope(scopeOverride);
  if (key.startsWith(`${scope}${SCOPE_KEY_SEPARATOR}`)) {
    return key;
  }
  return `${scope}${SCOPE_KEY_SEPARATOR}${key}`;
}

export function getClientJsonCacheScope(): string {
  return activeViewerScope;
}

export function setClientJsonCacheScope(nextScope: string | null | undefined): void {
  const normalized = nextScope?.trim() || DEFAULT_VIEWER_SCOPE;
  if (normalized === activeViewerScope) return;
  const previousScope = activeViewerScope;
  activeViewerScope = normalized;
  for (const [scopedKey, active] of Array.from(inFlightRequests.entries())) {
    if (active.scope === previousScope) {
      active.controller.abort();
      inFlightRequests.delete(scopedKey);
    }
  }
}

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
  viewerScope?: string,
): ClientCacheReadResult<T> | null {
  if (!key) return null;
  const scopedKey = toScopedCacheKey(key, viewerScope);
  const entry = clientCacheStore.get(scopedKey);
  if (!entry) return null;
  if (now >= entry.expiresAt) {
    clientCacheStore.delete(scopedKey);
    return null;
  }
  clientCacheStore.delete(scopedKey);
  clientCacheStore.set(scopedKey, entry);
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
  const scopedKey = toScopedCacheKey(key, options?.viewerScope);
  const now = options?.now ?? Date.now();
  const ttlMs = Math.max(1_000, options?.ttlMs ?? DEFAULT_CLIENT_CACHE_TTL_MS);
  const staleTimeMs = Math.max(
    0,
    Math.min(ttlMs, options?.staleTimeMs ?? DEFAULT_CLIENT_CACHE_STALE_MS),
  );
  if (clientCacheStore.has(scopedKey)) {
    clientCacheStore.delete(scopedKey);
  }
  while (clientCacheStore.size >= MAX_CLIENT_CACHE_ENTRIES) {
    const oldestKey = clientCacheStore.keys().next().value;
    if (oldestKey === undefined) break;
    clientCacheStore.delete(oldestKey);
  }
  clientCacheStore.set(scopedKey, {
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
  const activePrefix = `${activeViewerScope}${SCOPE_KEY_SEPARATOR}`;
  for (const storedKey of Array.from(clientCacheStore.keys())) {
    const matchesDirect = storedKey === prefixOrKey || storedKey.startsWith(prefixOrKey);
    const unscoped = storedKey.startsWith(activePrefix)
      ? storedKey.slice(activePrefix.length)
      : null;
    const matchesActiveScope =
      unscoped !== null && (unscoped === prefixOrKey || unscoped.startsWith(prefixOrKey));
    if (matchesDirect || matchesActiveScope) {
      clientCacheStore.delete(storedKey);
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
  activeViewerScope = DEFAULT_VIEWER_SCOPE;
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
    viewerScope?: string;
  },
): { promise: Promise<T>; release: () => void } {
  const scope = normalizeViewerScope(options.viewerScope);
  const scopedKey = toScopedCacheKey(cacheKey, scope);
  const existing = inFlightRequests.get(scopedKey);
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
        if (existing.subscribers === 0 && inFlightRequests.get(scopedKey) === existing) {
          existing.controller.abort();
          inFlightRequests.delete(scopedKey);
        }
      },
    };
  }

  const controller = new AbortController();
  const entry: InFlightEntry = {
    scope,
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
        if (response.status === 403 && typeof window !== "undefined") {
          const errPayload = (await response
            .clone()
            .json()
            .catch(() => null)) as { error?: unknown } | null;
          if (errPayload?.error === "pase_requerido") {
            invalidateClientJsonCache();
            window.dispatchEvent(
              new CustomEvent("pitchlab:plan-updated", {
                detail: { reason: "pase_requerido", url },
              }),
            );
          }
        }
        throw new Error(mapClientHttpError(response.status));
      }
      const payload: unknown = await response.json();
      writeClientJsonCache(cacheKey, payload, {
        staleTimeMs: options.staleTimeMs,
        ttlMs: options.ttlMs,
        viewerScope: scope,
      });
      return payload;
    })
    .finally(() => {
      if (inFlightRequests.get(scopedKey) === entry) {
        inFlightRequests.delete(scopedKey);
      }
    });

  entry.promise = requestPromise;
  inFlightRequests.set(scopedKey, entry);

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
      if (entry.subscribers === 0 && inFlightRequests.get(scopedKey) === entry) {
        entry.controller.abort();
        inFlightRequests.delete(scopedKey);
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
  const viewerScope = options?.viewerScope;
  if (!options?.force) {
    const cached = readClientJsonCache<T>(cacheKey, Date.now(), viewerScope);
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
    viewerScope,
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
  const rawCacheKey = options?.cacheKey ?? url;
  const effectiveScope = normalizeViewerScope(options?.viewerScope);
  const scopedCacheKey = rawCacheKey ? toScopedCacheKey(rawCacheKey, effectiveScope) : null;
  const initialData = options?.initialData ?? null;
  const staleTimeMs = options?.staleTimeMs ?? DEFAULT_CLIENT_CACHE_STALE_MS;
  const ttlMs = options?.ttlMs ?? DEFAULT_CLIENT_CACHE_TTL_MS;
  const revalidateOnStale = options?.revalidateOnStale ?? true;
  const keepPreviousData = options?.keepPreviousData ?? false;
  const credentials = options?.credentials ?? "same-origin";
  const debounceMs = options?.debounceMs ?? 0;

  const [reloadNonce, setReloadNonce] = useState(0);
  const forceReloadNonceRef = useRef(0);

  const cachedHit = enabled ? readClientJsonCache<T>(rawCacheKey, Date.now(), effectiveScope) : null;
  const [asyncState, setAsyncState] = useState<SwrAsyncState<T>>(() => ({
    key: enabled ? scopedCacheKey : null,
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
    if (!enabled || !url || !rawCacheKey || !scopedCacheKey) {
      return;
    }

    const forceNetwork = reloadNonce > 0 && forceReloadNonceRef.current === reloadNonce;
    const hit = forceNetwork ? null : readClientJsonCache<T>(rawCacheKey, Date.now(), effectiveScope);

    if (hit && !hit.isStale) {
      lastStableDataRef.current = hit.data;
      setAsyncState((prev) =>
        prev.key === scopedCacheKey && prev.data === hit.data && !prev.loading && !prev.isRevalidating && !prev.error
          ? prev
          : {
              key: scopedCacheKey,
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
        key: scopedCacheKey,
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
      key: scopedCacheKey,
      data: hit?.data ?? initialData ?? (keepPreviousData ? prev.data : null),
      loading: !hasSeed,
      isRevalidating: hasSeed,
      error: null,
    }));

    const startNetworkFetch = () => {
      if (cancelled) return;
      const subscription = subscribeSharedFetch<T>(rawCacheKey, url, {
        credentials,
        staleTimeMs,
        ttlMs,
        viewerScope: effectiveScope,
      });
      releaseSub = subscription.release;
      subscription.promise
        .then((payload) => {
          if (cancelled) return;
          lastStableDataRef.current = payload;
          startTransition(() => {
            if (cancelled) return;
            setAsyncState({
              key: scopedCacheKey,
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
              key: scopedCacheKey,
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
    credentials,
    debounceMs,
    effectiveScope,
    enabled,
    initialData,
    keepPreviousData,
    rawCacheKey,
    reloadNonce,
    revalidateOnStale,
    scopedCacheKey,
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
    const matchesCurrent = asyncState.key === scopedCacheKey;
    return {
      data: effectiveCachedData,
      loading: false,
      isRevalidating: matchesCurrent ? asyncState.isRevalidating : Boolean(cachedHit?.isStale && revalidateOnStale),
      isFromCache: true,
      error: matchesCurrent ? asyncState.error : null,
      reload,
    };
  }

  const sameKey = asyncState.key === scopedCacheKey;
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
