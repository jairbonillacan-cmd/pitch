/**
 * Cliente HTTP para proveedores con clave: respeta el límite de tasa, reintenta ante 429
 * con `Retry-After`, guarda cada respuesta en caché de disco y corta al agotar el presupuesto.
 *
 * La caché vive en `data/history/raw/<proveedor>/` (ignorada por Git). Las claves viajan solo
 * en las cabeceras de `ProviderConfig` y nunca se escriben en disco ni en los logs.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ProviderConfig } from "./config.js";

export class ProviderBudgetExhaustedError extends Error {
  constructor(provider: string, used: number) {
    super(`Presupuesto de ${provider} agotado tras ${used} peticiones en esta corrida.`);
    this.name = "ProviderBudgetExhaustedError";
  }
}

export class ProviderHttpError extends Error {
  readonly status: number;
  constructor(provider: string, status: number, path: string) {
    super(`${provider} respondió HTTP ${status} en ${path}`);
    this.name = "ProviderHttpError";
    this.status = status;
  }
}

export interface ProviderClientOptions {
  /** Carpeta base de caché; se crea `<cacheDir>/<provider.id>/`. */
  readonly cacheDir: string;
  /** Pausa mínima entre peticiones reales (no aplica a respuestas en caché). */
  readonly minIntervalMs: number;
  /** Peticiones reales máximas en esta corrida. */
  readonly maxRequests: number;
  /** Solo leer caché; falla si falta un archivo. */
  readonly offline?: boolean;
  readonly retries?: number;
  readonly log?: (message: string) => void;
  /** Inyectables para pruebas. */
  readonly fetchImpl?: typeof fetch;
  readonly sleepImpl?: (ms: number) => Promise<void>;
  readonly now?: () => number;
}

export interface GetOptions {
  /** `false` para datos que cambian (partidos por jugar); por defecto se cachea. */
  readonly cache?: boolean;
}

export interface ProviderClient {
  get<T>(pathWithQuery: string, options?: GetOptions): Promise<T | null>;
  /** `true` si la respuesta (o su marcador 404) ya está en caché y no gastará cuota. */
  isCached(pathWithQuery: string): boolean;
  readonly stats: { requests: number; cacheHits: number };
}

const SAFE_PATH_RE = /^\/[A-Za-z0-9/_\-.?=&,:%]*$/;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function cacheFileFor(cacheDir: string, providerId: string, pathWithQuery: string): string {
  const digest = createHash("sha256").update(pathWithQuery).digest("hex").slice(0, 32);
  return join(cacheDir, providerId, `${digest}.json`);
}

function retryAfterMs(header: string | null, fallbackMs: number): number {
  if (!header) return fallbackMs;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 15 * 60_000);
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(0, Math.min(date - Date.now(), 15 * 60_000));
  return fallbackMs;
}

export function createProviderClient(cfg: ProviderConfig, options: ProviderClientOptions): ProviderClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleepImpl ?? defaultSleep;
  const now = options.now ?? Date.now;
  const retries = options.retries ?? 3;
  const log = options.log ?? (() => undefined);
  const stats = { requests: 0, cacheHits: 0 };
  let lastRequestAt = Number.NEGATIVE_INFINITY;

  async function throttle(): Promise<void> {
    const wait = lastRequestAt + options.minIntervalMs - now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = now();
  }

  async function get<T>(pathWithQuery: string, getOptions: GetOptions = {}): Promise<T | null> {
    if (!SAFE_PATH_RE.test(pathWithQuery) || pathWithQuery.includes("..")) {
      throw new Error(`Ruta de proveedor no válida: ${pathWithQuery}`);
    }
    const useCache = getOptions.cache !== false;
    const file = cacheFileFor(options.cacheDir, cfg.id, pathWithQuery);
    const missingMarker = `${file}.missing`;

    if (useCache && existsSync(file)) {
      stats.cacheHits += 1;
      return JSON.parse(readFileSync(file, "utf8")) as T;
    }
    if (useCache && existsSync(missingMarker)) return null;
    if (options.offline) {
      throw new Error(`Modo offline: falta en caché ${cfg.id}${pathWithQuery}`);
    }
    if (!cfg.enabled) {
      throw new Error(`${cfg.displayName} está apagado: falta ${cfg.keyEnvVar ?? "configuración"}.`);
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
      if (stats.requests >= options.maxRequests) {
        throw new ProviderBudgetExhaustedError(cfg.displayName, stats.requests);
      }
      await throttle();
      stats.requests += 1;
      let response: Response;
      try {
        response = await fetchImpl(`${cfg.baseUrl}${pathWithQuery}`, {
          headers: cfg.headers,
          signal: AbortSignal.timeout(45_000),
        });
      } catch (error) {
        log(`${cfg.displayName}: sin respuesta (${error instanceof Error ? error.name : "error"}), reintento`);
        if (attempt === retries) throw error;
        await sleep(1_000 * (attempt + 1));
        continue;
      }

      if (response.status === 429 || response.status >= 500) {
        const wait = retryAfterMs(response.headers.get("retry-after"), 5_000 * (attempt + 1));
        log(`${cfg.displayName}: HTTP ${response.status}, espero ${Math.round(wait / 1000)} s`);
        if (attempt === retries) throw new ProviderHttpError(cfg.displayName, response.status, pathWithQuery);
        await sleep(wait);
        continue;
      }
      if (response.status === 404) {
        mkdirSync(join(options.cacheDir, cfg.id), { recursive: true });
        if (useCache) writeFileSync(missingMarker, `${new Date(now()).toISOString()} 404\n`, "utf8");
        return null;
      }
      if (!response.ok) {
        throw new ProviderHttpError(cfg.displayName, response.status, pathWithQuery);
      }

      // El cuerpo también puede cortarse por timeout o llegar truncado: se reintenta.
      let text: string;
      let parsed: T;
      try {
        text = await response.text();
        parsed = JSON.parse(text) as T;
      } catch (error) {
        log(`${cfg.displayName}: respuesta incompleta (${error instanceof Error ? error.name : "error"}), reintento`);
        if (attempt === retries) throw error;
        await sleep(2_000 * (attempt + 1));
        continue;
      }
      if (useCache) {
        mkdirSync(join(options.cacheDir, cfg.id), { recursive: true });
        writeFileSync(file, text, "utf8");
      }
      return parsed;
    }
    return null;
  }

  function isCached(pathWithQuery: string): boolean {
    const file = cacheFileFor(options.cacheDir, cfg.id, pathWithQuery);
    return existsSync(file) || existsSync(`${file}.missing`);
  }

  return { get, isCached, stats };
}
