/**
 * Helpers livianos de navegación nativa, restauración de scroll,
 * View Transitions API progresiva y micro-háptica (ADR-053).
 * Cero dependencias externas y 100 % seguros en SSR.
 */

const SCROLL_STORAGE_KEY = "pl-route-scroll-v1";
const MAX_SCROLL_ENTRIES = 40;

type ScrollMap = Record<string, number>;

function getSessionStorage(storage?: Storage | null): Storage | null {
  if (storage !== undefined) return storage;
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch (err) {
    void err;
    return null;
  }
}

function readScrollMap(storage?: Storage | null): ScrollMap {
  const store = getSessionStorage(storage);
  if (!store) return {};
  try {
    const raw = store.getItem(SCROLL_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: ScrollMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof k === "string" && typeof v === "number" && Number.isFinite(v) && v >= 0) {
        out[k] = Math.round(v);
      }
    }
    return out;
  } catch (err) {
    void err;
    return {};
  }
}

function writeScrollMap(map: ScrollMap, storage?: Storage | null): void {
  const store = getSessionStorage(storage);
  if (!store) return;
  try {
    const keys = Object.keys(map);
    let trimmed = map;
    if (keys.length > MAX_SCROLL_ENTRIES) {
      trimmed = {};
      for (const k of keys.slice(keys.length - MAX_SCROLL_ENTRIES)) {
        const val = map[k];
        if (val !== undefined) trimmed[k] = val;
      }
    }
    store.setItem(SCROLL_STORAGE_KEY, JSON.stringify(trimmed));
  } catch (err) {
    void err;
  }
}

export function normalizeScrollRouteKey(path: string): string {
  const clean = path.split("#", 1)[0]?.trim() || "/";
  return clean.length > 1 && clean.endsWith("/") ? clean.slice(0, -1) : clean;
}

/** Determina si una ruta corresponde a una vista de detalle (`/g/`, `/t/`, `/p/`). */
export function isDetailRoutePath(path: string): boolean {
  const clean = path.split(/[?#]/, 1)[0] ?? "";
  return /\/app\/[^/]+\/(?:g|games|t|p)\//.test(clean);
}

/** Calcula la ruta de respaldo segura para el botón `← Atrás` si el usuario llegó directo. */
export function resolveContextualBackHref(currentPath: string): string {
  const clean = currentPath.split(/[?#]/, 1)[0] ?? "";
  const playerMatch = clean.match(/^\/app\/([^/]+)\/t\/([^/]+)\/p\//);
  if (playerMatch && playerMatch[1] && playerMatch[2]) {
    return `/app/${playerMatch[1]}/t/${playerMatch[2]}`;
  }
  const match = clean.match(/^\/app\/([^/]+)\/(?:g|games|t|p)\//);
  if (match && match[1]) {
    return `/app/${match[1]}`;
  }
  return "/app";
}

/** Guarda `window.scrollY` por ruta (con tope acotado y validación finita). */
export function saveRouteScroll(path: string, scrollY: number, storage?: Storage | null): void {
  if (!Number.isFinite(scrollY) || scrollY < 0) return;
  const key = normalizeScrollRouteKey(path);
  const map = readScrollMap(storage);
  // Reinsertar al final para comportamiento LRU simple
  delete map[key];
  map[key] = Math.round(scrollY);
  writeScrollMap(map, storage);
}

/** Recupera el scroll guardado para una ruta o `null` si no existe. */
export function readRouteScroll(path: string, storage?: Storage | null): number | null {
  const key = normalizeScrollRouteKey(path);
  const map = readScrollMap(storage);
  const val = map[key];
  return typeof val === "number" && Number.isFinite(val) && val >= 0 ? val : null;
}

/** Limpia la posición guardada tras restaurarla o resetearla. */
export function clearRouteScroll(path: string, storage?: Storage | null): void {
  const key = normalizeScrollRouteKey(path);
  const map = readScrollMap(storage);
  if (!(key in map)) return;
  delete map[key];
  writeScrollMap(map, storage);
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (err) {
    void err;
    return false;
  }
}

/**
 * Envuelve una actualización de vista en `document.startViewTransition` solo cuando el navegador
 * la soporta y el usuario no prefiere movimiento reducido (degradación progresiva a 0 KB).
 */
export function runWithViewTransition(update: () => void): void {
  if (typeof document === "undefined" || prefersReducedMotion()) {
    update();
    return;
  }
  const docWithVt = document as Document & {
    startViewTransition?: (cb: () => void) => { finished?: Promise<void> };
  };
  if (typeof docWithVt.startViewTransition !== "function") {
    update();
    return;
  }
  try {
    docWithVt.startViewTransition(() => {
      update();
    });
  } catch (err) {
    void err;
    update();
  }
}

/** Micro-háptica sutil en dispositivos compatibles (silenciosa en iOS/escritorio o sin soporte). */
export function triggerHaptic(pattern: number | number[] = 8): boolean {
  if (typeof navigator === "undefined" || prefersReducedMotion()) return false;
  if (typeof navigator.vibrate !== "function") return false;
  try {
    return Boolean(navigator.vibrate(pattern));
  } catch (err) {
    void err;
    return false;
  }
}
