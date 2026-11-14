"use client";

/**
 * EN-VIVO-1 · Lectura en vivo en el navegador.
 *
 * El navegador nunca habla con el proveedor: pregunta a NUESTRA ruta (`/api/live/*`, servida
 * por el CDN) y la propia respuesta dice cuándo volver (`nextPollSeconds`). Reglas:
 * - Un solo sondeo por URL aunque haya varios componentes suscritos (marcador, campana, ficha).
 * - `nextPollSeconds: null` → no se agenda nada: cero intervalos con el partido terminado.
 * - Pestaña oculta → se pausa; al volver se pregunta una vez si ya tocaba.
 * - Cada petición con `AbortController` y tiempo límite de 8 s; sin reintentos en bucle.
 */
import { useSyncExternalStore } from "react";
import type { LiveMatchDetail, LiveScoreboard } from "@pitchlab/contracts";

const REQUEST_TIMEOUT_MS = 8_000;
/** Tras un error se espera más, y nunca se insiste más seguido que esto. */
const ERROR_RETRY_MS = 60_000;

export interface LiveSnapshot<T> {
  data: T | null;
  /** `true` mientras no ha llegado la primera respuesta. */
  loading: boolean;
  error: boolean;
}

interface Pollable {
  nextPollSeconds: number | null;
}

export interface PollingStore<T extends Pollable> {
  subscribe(fn: () => void): () => void;
  getSnapshot(): LiveSnapshot<T>;
  /** Fuerza una lectura ahora (p. ej. al seguir un partido). */
  refresh(): void;
}

export interface PollingDeps {
  fetchImpl?: typeof fetch;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  now?: () => number;
  isVisible?: () => boolean;
  onVisibilityChange?: (fn: () => void) => () => void;
}

const SERVER_SNAPSHOT = { data: null, loading: true, error: false } as const;

export function createPollingStore<T extends Pollable>(url: string, deps: PollingDeps = {}): PollingStore<T> {
  const fetchImpl = deps.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const now = deps.now ?? Date.now;
  const isVisible = deps.isVisible ?? (() => typeof document === "undefined" || document.visibilityState === "visible");
  const onVisibilityChange =
    deps.onVisibilityChange ??
    ((fn: () => void) => {
      if (typeof document === "undefined") return () => undefined;
      document.addEventListener("visibilitychange", fn);
      return () => document.removeEventListener("visibilitychange", fn);
    });

  let snapshot: LiveSnapshot<T> = { data: null, loading: true, error: false };
  const listeners = new Set<() => void>();
  let timer: unknown = null;
  let controller: AbortController | null = null;
  /** Momento en que toca la siguiente lectura (`null` = ninguna). */
  let dueAt: number | null = 0;
  let stopVisibility: (() => void) | null = null;

  const emit = (next: LiveSnapshot<T>) => {
    snapshot = next;
    for (const fn of listeners) fn();
  };

  const clear = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  const schedule = () => {
    clear();
    if (dueAt === null || listeners.size === 0 || !isVisible()) return;
    timer = setTimer(() => void load(), Math.max(0, dueAt - now()));
  };

  async function load(): Promise<void> {
    clear();
    controller?.abort();
    const own = new AbortController();
    controller = own;
    const timeout = setTimer(() => own.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetchImpl(url, { signal: own.signal, credentials: "same-origin" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as T;
      const poll = data.nextPollSeconds;
      dueAt = poll === null ? null : now() + Math.max(10, poll) * 1000;
      emit({ data, loading: false, error: false });
    } catch {
      if (own.signal.aborted && controller !== own) return; // reemplazada por otra lectura
      dueAt = now() + ERROR_RETRY_MS;
      emit({ data: snapshot.data, loading: false, error: true });
    } finally {
      clearTimer(timeout);
      if (controller === own) controller = null;
    }
    schedule();
  }

  const onVisible = () => {
    if (!isVisible()) {
      clear();
      return;
    }
    if (dueAt !== null && dueAt <= now()) void load();
    else schedule();
  };

  return {
    subscribe(fn) {
      listeners.add(fn);
      if (listeners.size === 1) {
        stopVisibility = onVisibilityChange(onVisible);
        if (dueAt !== null && dueAt <= now()) void load();
        else schedule();
      }
      return () => {
        listeners.delete(fn);
        if (listeners.size === 0) {
          clear();
          controller?.abort();
          controller = null;
          stopVisibility?.();
          stopVisibility = null;
        }
      };
    },
    getSnapshot: () => snapshot,
    refresh() {
      dueAt = now();
      if (listeners.size > 0) void load();
    },
  };
}

// ---------- Instancias compartidas ----------

let scoreboardStore: PollingStore<LiveScoreboard> | null = null;
const matchStores = new Map<string, PollingStore<LiveMatchDetail>>();

export function liveScoreboardStore(): PollingStore<LiveScoreboard> {
  scoreboardStore ??= createPollingStore<LiveScoreboard>("/api/live/scoreboard");
  return scoreboardStore;
}

export function liveMatchStore(gameId: string): PollingStore<LiveMatchDetail> {
  let store = matchStores.get(gameId);
  if (!store) {
    store = createPollingStore<LiveMatchDetail>(`/api/live/games/${encodeURIComponent(gameId)}`);
    matchStores.set(gameId, store);
  }
  return store;
}

const noopSubscribe = () => () => undefined;
const disabledSnapshot = () => SERVER_SNAPSHOT as LiveSnapshot<never>;

export function useLiveScoreboard(enabled = true): LiveSnapshot<LiveScoreboard> {
  const store = liveScoreboardStore();
  return useSyncExternalStore(
    enabled ? store.subscribe : noopSubscribe,
    enabled ? store.getSnapshot : disabledSnapshot,
    () => SERVER_SNAPSHOT,
  );
}

export function useLiveMatch(gameId: string, enabled = true): LiveSnapshot<LiveMatchDetail> {
  const store = liveMatchStore(gameId);
  return useSyncExternalStore(
    enabled ? store.subscribe : noopSubscribe,
    enabled ? store.getSnapshot : disabledSnapshot,
    () => SERVER_SNAPSHOT,
  );
}
