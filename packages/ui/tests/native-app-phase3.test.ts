import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearRouteScroll,
  isDetailRoutePath,
  readRouteScroll,
  resolveContextualBackHref,
  runWithViewTransition,
  saveRouteScroll,
  triggerHaptic,
} from "../src/platform/navigation-helpers";
import { shouldDismissSheetSwipe } from "../src/platform/components/use-sheet-swipe-dismiss";

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
  };
}

describe("ADR-053 · navigation-helpers y gestos táctiles", () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    const storage = createMemoryStorage();
    Object.defineProperty(globalThis, "window", {
      value: {
        sessionStorage: storage,
        matchMedia: vi.fn().mockReturnValue({ matches: false }),
      },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "window", {
      value: originalWindow,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, "document", {
      value: originalDocument,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  });

  it("detecta rutas de detalle (/g/, /t/, /p/) y resuelve respaldos seguros para ← Atrás", () => {
    expect(isDetailRoutePath("/app/liga-mx/g/america-vs-chivas-1a2b3c")).toBe(true);
    expect(isDetailRoutePath("/app/premier-league/t/arsenal")).toBe(true);
    expect(isDetailRoutePath("/app/premier-league/t/arsenal/p/bukayo-saka")).toBe(true);
    expect(isDetailRoutePath("/app")).toBe(false);
    expect(isDetailRoutePath("/app/premier-league")).toBe(false);

    expect(resolveContextualBackHref("/app/premier-league/t/arsenal/p/bukayo-saka")).toBe(
      "/app/premier-league/t/arsenal",
    );
    expect(resolveContextualBackHref("/app/liga-mx/g/america-vs-chivas-1a2b3c")).toBe(
      "/app/liga-mx",
    );
    expect(resolveContextualBackHref("/app/liga-mx/t/america")).toBe("/app/liga-mx");
    expect(resolveContextualBackHref("/app/parlays")).toBe("/app");
  });

  it("guarda, lee, limpia y acota a 40 entradas las posiciones de scroll en sessionStorage", () => {
    saveRouteScroll("/app", 640);
    expect(readRouteScroll("/app")).toBe(640);

    // Ignora valores no finitos o negativos
    saveRouteScroll("/app", Number.NaN);
    expect(readRouteScroll("/app")).toBe(640);

    clearRouteScroll("/app");
    expect(readRouteScroll("/app")).toBeNull();

    // Tope de 40 rutas: la más antigua se descarta
    for (let i = 0; i < 45; i += 1) {
      saveRouteScroll(`/app/ruta-${i}`, i * 10);
    }
    expect(readRouteScroll("/app/ruta-0")).toBeNull();
    expect(readRouteScroll("/app/ruta-44")).toBe(440);
  });

  it("tolera sessionStorage corrupto o bloqueado sin lanzar excepciones", () => {
    (globalThis.window as unknown as { sessionStorage: Storage }).sessionStorage.setItem(
      "pl-route-scroll-v1",
      "{invalid-json",
    );
    expect(readRouteScroll("/app")).toBeNull();
    expect(() => saveRouteScroll("/app", 220)).not.toThrow();
    expect(readRouteScroll("/app")).toBe(220);
  });

  it("decide el cierre de bottom sheet por distancia o velocidad hacia abajo (shouldDismissSheetSwipe)", () => {
    expect(shouldDismissSheetSwipe(120, 0.1)).toBe(true);
    expect(shouldDismissSheetSwipe(48, 0.72)).toBe(true);
    expect(shouldDismissSheetSwipe(40, 0.15)).toBe(false);
    expect(shouldDismissSheetSwipe(-30, 0.9)).toBe(false);
  });

  it("ejecuta runWithViewTransition con respaldo directo cuando no existe API o hay reduced-motion", () => {
    const fn = vi.fn();
    Object.defineProperty(globalThis, "document", {
      value: {},
      configurable: true,
      writable: true,
    });
    runWithViewTransition(fn);
    expect(fn).toHaveBeenCalledTimes(1);

    const startViewTransition = vi.fn((cb: () => void) => cb());
    Object.defineProperty(globalThis, "document", {
      value: { startViewTransition },
      configurable: true,
      writable: true,
    });
    runWithViewTransition(fn);
    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledTimes(2);

    // Con prefers-reduced-motion: reduce omite startViewTransition
    (globalThis.window as unknown as { matchMedia: () => { matches: boolean } }).matchMedia = () => ({
      matches: true,
    });
    runWithViewTransition(fn);
    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("triggerHaptic llama a navigator.vibrate cuando existe y es no-op seguro cuando falta", () => {
    const vibrate = vi.fn();
    Object.defineProperty(globalThis, "navigator", {
      value: { vibrate },
      configurable: true,
      writable: true,
    });
    triggerHaptic(12);
    expect(vibrate).toHaveBeenCalledWith(12);

    Object.defineProperty(globalThis, "navigator", {
      value: {},
      configurable: true,
      writable: true,
    });
    expect(() => triggerHaptic([10, 20, 10])).not.toThrow();
  });
});
