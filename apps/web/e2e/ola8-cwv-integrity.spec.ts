import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

interface BrokenImageSample {
  readonly src: string;
  readonly alt: string;
  readonly className: string;
  readonly complete: boolean;
  readonly naturalWidth: number;
}

interface ClsReport {
  readonly cls: number;
  readonly totalShift: number;
  readonly shiftCount: number;
}

interface RouteIntegrityReport {
  readonly route: string;
  readonly clsReport: ClsReport;
  readonly scrollWidth: number;
  readonly clientWidth: number;
  readonly overflowPx: number;
  readonly totalDomNodes: number;
  readonly mainDomNodes: number;
  readonly openDialogsCount: number;
  readonly brokenImages: readonly BrokenImageSample[];
}

interface RuntimeMonitors {
  readonly assertClean: (label: string) => void;
}

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100").replace(/\/+$/, "");
const MAX_CLS_BUDGET = 0.02;
const MAX_MAIN_DOM_NODES = 1_500;

const CLUB_JOURNEY_ROUTES = [
  "/app",
  "/app/picks",
  "/app/parlays",
  "/app/lab",
  "/app/liga-mx",
  "/app/account",
] as const;

type ClubJourneyRoute = (typeof CLUB_JOURNEY_ROUTES)[number];

function attachRuntimeMonitors(page: Page): RuntimeMonitors {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const serverErrors: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text().slice(0, 280));
    }
  });

  page.on("pageerror", (err) => {
    pageErrors.push(err.message.slice(0, 280));
  });

  page.on("response", (res) => {
    const status = res.status();
    if (status < 500) return;
    const url = res.url();
    if (!url.startsWith(ORIGIN)) return;
    let pathname = url;
    try {
      pathname = new URL(url).pathname;
    } catch (err) {
      void err;
    }
    serverErrors.push(`${status} ${pathname}`);
  });

  return {
    assertClean: (label: string) => {
      expect(serverErrors, `Respuestas HTTP >= 500 en ${label}`).toEqual([]);
      expect(pageErrors, `Excepciones pageerror en ${label}`).toEqual([]);
      expect(consoleErrors, `Errores console.error en ${label}`).toEqual([]);
    },
  };
}

async function configureViewport(page: Page, projectName: string): Promise<string> {
  const isMobile = projectName === "mobile";
  await page.setViewportSize(
    isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  );
  return isMobile ? "mobile 390x844" : "desktop 1440x900";
}

async function unlockBetaSession(page: Page): Promise<void> {
  const oct3 = Math.floor(Math.random() * 200) + 10;
  const oct4 = Math.floor(Math.random() * 200) + 10;
  const unlock = await page.request.post("/api/beta/unlock", {
    headers: {
      "x-forwarded-for": `198.51.${oct3}.${oct4}`,
      origin: ORIGIN,
    },
    data: { code: "2026", next: "/app" },
  });
  expect(unlock.ok(), `POST /api/beta/unlock falló con HTTP ${unlock.status()}`).toBe(true);
}

async function installClsObserver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    interface RawLayoutShiftEntry extends PerformanceEntry {
      readonly value?: number;
      readonly hadRecentInput?: boolean;
    }

    interface ClsStore {
      entries: Array<{ value: number; startTime: number; hadRecentInput: boolean }>;
      flush: () => void;
      reset: () => void;
    }

    const entries: Array<{ value: number; startTime: number; hadRecentInput: boolean }> = [];

    const recordEntries = (list: readonly PerformanceEntry[]): void => {
      for (const raw of list) {
        const shift: RawLayoutShiftEntry = raw;
        if (typeof shift.value === "number" && Number.isFinite(shift.value)) {
          entries.push({
            value: shift.value,
            startTime: shift.startTime,
            hadRecentInput: Boolean(shift.hadRecentInput),
          });
        }
      }
    };

    let observer: PerformanceObserver | null = null;
    if (typeof PerformanceObserver === "function") {
      try {
        observer = new PerformanceObserver((list) => {
          recordEntries(list.getEntries());
        });
        observer.observe({ type: "layout-shift", buffered: true });
      } catch (err) {
        void err;
        observer = null;
      }
    }

    const store: ClsStore = {
      entries,
      flush: () => {
        if (observer && typeof observer.takeRecords === "function") {
          recordEntries(observer.takeRecords());
        }
      },
      reset: () => {
        if (observer && typeof observer.takeRecords === "function") {
          observer.takeRecords();
        }
        entries.length = 0;
      },
    };

    Object.defineProperty(window, "__plOla8ClsStore", {
      value: store,
      configurable: true,
      writable: true,
    });
  });
}

async function resetClsObserver(page: Page): Promise<void> {
  await page.evaluate(() => {
    const rawStore: unknown = Reflect.get(window, "__plOla8ClsStore");
    if (!rawStore || typeof rawStore !== "object") return;
    const maybeReset: unknown = Reflect.get(rawStore, "reset");
    if (typeof maybeReset === "function") {
      Reflect.apply(maybeReset, rawStore, []);
    }
  });
}

async function readClsReport(page: Page): Promise<ClsReport> {
  return page.evaluate(() => {
    const rawStore: unknown = Reflect.get(window, "__plOla8ClsStore");
    if (!rawStore || typeof rawStore !== "object") {
      return { cls: 0, totalShift: 0, shiftCount: 0 };
    }
    const maybeFlush: unknown = Reflect.get(rawStore, "flush");
    if (typeof maybeFlush === "function") {
      Reflect.apply(maybeFlush, rawStore, []);
    }
    const rawEntries: unknown = Reflect.get(rawStore, "entries");
    if (!Array.isArray(rawEntries)) {
      return { cls: 0, totalShift: 0, shiftCount: 0 };
    }

    const validShifts: Array<{ value: number; startTime: number }> = [];
    for (const item of rawEntries) {
      if (!item || typeof item !== "object") continue;
      const value: unknown = Reflect.get(item, "value");
      const startTime: unknown = Reflect.get(item, "startTime");
      const hadRecentInput: unknown = Reflect.get(item, "hadRecentInput");
      if (
        hadRecentInput === false &&
        typeof value === "number" &&
        Number.isFinite(value) &&
        value > 0 &&
        typeof startTime === "number" &&
        Number.isFinite(startTime)
      ) {
        validShifts.push({ value, startTime });
      }
    }

    let totalShift = 0;
    let maxSessionWindow = 0;
    let windowValue = 0;
    let windowStart = 0;
    let prevTime = 0;

    for (const shift of validShifts) {
      totalShift += shift.value;
      const startsNewWindow =
        windowValue === 0 ||
        shift.startTime - prevTime >= 1_000 ||
        shift.startTime - windowStart >= 5_000;
      if (startsNewWindow) {
        windowStart = shift.startTime;
        windowValue = shift.value;
      } else {
        windowValue += shift.value;
      }
      prevTime = shift.startTime;
      if (windowValue > maxSessionWindow) {
        maxSessionWindow = windowValue;
      }
    }

    return {
      cls: Math.round(maxSessionWindow * 10_000) / 10_000,
      totalShift: Math.round(totalShift * 10_000) / 10_000,
      shiftCount: validShifts.length,
    };
  });
}

async function waitForLayoutAndImages(page: Page): Promise<void> {
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) {
      await Promise.race([
        document.fonts.ready,
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, 2_500);
        }),
      ]);
    }

    const isImageRendered = (img: HTMLImageElement): boolean => {
      if (
        img.closest(
          "nextjs-portal, [data-nextjs-toast], [hidden], dialog:not([open]), [popover]:not(:popover-open), [inert]",
        )
      ) {
        return false;
      }
      if (!img.closest("summary") && img.closest("details:not([open])")) {
        return false;
      }
      let cur: Element | null = img;
      while (cur && cur !== document.documentElement) {
        const st = window.getComputedStyle(cur);
        if (
          st.display === "none" ||
          st.visibility === "hidden" ||
          Number.parseFloat(st.opacity || "1") === 0
        ) {
          return false;
        }
        cur = cur.parentElement;
      }
      const rect = img.getBoundingClientRect();
      return rect.width > 1 && rect.height > 1;
    };

    const pending = Array.from(document.querySelectorAll("img")).filter((img) => {
      if (img.complete) return false;
      if (!isImageRendered(img)) return false;
      const rect = img.getBoundingClientRect();
      const nearViewport = rect.bottom > -200 && rect.top < window.innerHeight + 300;
      return nearViewport || img.loading !== "lazy";
    });

    if (pending.length > 0) {
      await Promise.race([
        Promise.all(
          pending.map(
            (img) =>
              new Promise<void>((resolve) => {
                if (img.complete) {
                  resolve();
                  return;
                }
                const done = () => resolve();
                img.addEventListener("load", done, { once: true });
                img.addEventListener("error", done, { once: true });
              }),
          ),
        ),
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, 4_000);
        }),
      ]);
    }

    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });
  });
}

async function waitForRouteLandmark(page: Page, route: ClubJourneyRoute): Promise<void> {
  await expect(page.locator("#main"), `#main visible en ${route}`).toBeVisible();
  if (route === "/app") {
    await expect(
      page.locator("[data-day-center]:visible").first(),
      "Selector de día visible en /app",
    ).toBeVisible();
    return;
  }
  if (route === "/app/picks") {
    await expect(
      page.locator("#main [data-picks-layout]:visible"),
      "Layout visible en /app/picks",
    ).toBeVisible();
    return;
  }
  if (route === "/app/parlays") {
    await expect(
      page.locator('aside[aria-label="Boleto combinado activo"]').first(),
      "Boleto visible en /app/parlays",
    ).toBeVisible();
    return;
  }
  if (route === "/app/lab") {
    await expect(
      page.getByRole("heading", { level: 1, name: /Mi r[eé]cord/i }),
      "Encabezado Mi récord visible en /app/lab",
    ).toBeVisible();
    return;
  }
  if (route === "/app/liga-mx") {
    await expect(
      page.locator("[data-league-hero]").first(),
      "Hero de liga visible en /app/liga-mx",
    ).toBeVisible();
    return;
  }
  await expect(
    page.locator('[role="tablist"][aria-label="Secciones de mi cuenta"]'),
    "Pestañas visibles en /app/account",
  ).toBeVisible();
}

async function navigateClubRoute(page: Page, route: ClubJourneyRoute): Promise<void> {
  const response = await page.goto(route, { waitUntil: "domcontentloaded" });
  const status = response?.status() ?? 200;
  expect(status, `Ruta ${route} devolvió HTTP ${status}`).toBeLessThan(400);
  await waitForRouteLandmark(page, route);
  await waitForLayoutAndImages(page);
}

async function auditRouteIntegrity(
  page: Page,
  route: string,
  label: string,
): Promise<RouteIntegrityReport> {
  await waitForLayoutAndImages(page);
  const clsReport = await readClsReport(page);

  const domAudit = await page.evaluate(() => {
    const root = document.documentElement;
    const scrollWidth = root.scrollWidth;
    const clientWidth = root.clientWidth;
    const overflowPx = Math.max(0, scrollWidth - clientWidth);

    const isImageRendered = (img: HTMLImageElement): boolean => {
      if (
        img.closest(
          "nextjs-portal, [data-nextjs-toast], [hidden], dialog:not([open]), [popover]:not(:popover-open), [inert]",
        )
      ) {
        return false;
      }
      if (!img.closest("summary") && img.closest("details:not([open])")) {
        return false;
      }
      let cur: Element | null = img;
      while (cur && cur !== document.documentElement) {
        const st = window.getComputedStyle(cur);
        if (
          st.display === "none" ||
          st.visibility === "hidden" ||
          Number.parseFloat(st.opacity || "1") === 0
        ) {
          return false;
        }
        cur = cur.parentElement;
      }
      const rect = img.getBoundingClientRect();
      return rect.width > 1 && rect.height > 1;
    };

    const brokenImages: BrokenImageSample[] = [];
    for (const img of Array.from(document.querySelectorAll("img"))) {
      if (!isImageRendered(img)) continue;
      const rect = img.getBoundingClientRect();
      const inViewport =
        rect.bottom > 0 &&
        rect.top < window.innerHeight &&
        rect.right > 0 &&
        rect.left < window.innerWidth;
      if ((img.complete && img.naturalWidth === 0) || (inViewport && img.naturalWidth === 0)) {
        brokenImages.push({
          src: (img.currentSrc || img.getAttribute("src") || "(empty)").slice(0, 140),
          alt: (img.getAttribute("alt") || "").slice(0, 60),
          className: (img.getAttribute("class") || "").trim().slice(0, 80),
          complete: img.complete,
          naturalWidth: img.naturalWidth,
        });
        if (brokenImages.length >= 12) break;
      }
    }

    const totalDomNodes = document.querySelectorAll("*").length;
    const mainEl = document.querySelector("#main");
    const mainDomNodes = mainEl ? mainEl.querySelectorAll("*").length : totalDomNodes;
    const openDialogsCount = document.querySelectorAll("dialog[open]").length;

    return {
      scrollWidth,
      clientWidth,
      overflowPx,
      totalDomNodes,
      mainDomNodes,
      openDialogsCount,
      brokenImages,
    };
  });

  const report: RouteIntegrityReport = {
    route,
    clsReport,
    ...domAudit,
  };

  expect(
    report.clsReport.cls,
    `CLS excedió ${MAX_CLS_BUDGET} (medido ${report.clsReport.cls}, total ${report.clsReport.totalShift}, eventos ${report.clsReport.shiftCount}) en ${label}`,
  ).toBeLessThanOrEqual(MAX_CLS_BUDGET);

  expect(
    report.brokenImages,
    `Imágenes rotas (naturalWidth === 0) en ${label}`,
  ).toEqual([]);

  expect(
    report.mainDomNodes,
    `#main vacío en ${label}`,
  ).toBeGreaterThan(0);

  expect(
    report.mainDomNodes,
    `Presupuesto DOM en #main excedido (${report.mainDomNodes} >= ${MAX_MAIN_DOM_NODES}) en ${label}`,
  ).toBeLessThan(MAX_MAIN_DOM_NODES);

  expect(
    report.scrollWidth,
    `Overflow horizontal (${report.overflowPx}px) en ${label}`,
  ).toBeLessThanOrEqual(report.clientWidth);

  return report;
}

test.describe("Ola 8 · CWV (CLS <= 0.02), integridad visual y estabilidad DOM en recorrido de 6 rutas del Club", () => {
  test("recorre 6 rutas autenticadas del Club y valida CLS, imágenes, DOM < 1500, 0px overflow y estabilidad al volver a /app", async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const viewportLabel = await configureViewport(page, testInfo.project.name);
    const monitors = attachRuntimeMonitors(page);
    await installClsObserver(page);
    await unlockBetaSession(page);

    let initialAppReport: RouteIntegrityReport | null = null;

    for (const route of CLUB_JOURNEY_ROUTES) {
      await navigateClubRoute(page, route);
      const report = await auditRouteIntegrity(page, route, `${route} [${viewportLabel}]`);
      if (route === "/app") {
        initialAppReport = report;
      }
      monitors.assertClean(`${route} [${viewportLabel}]`);
    }

    expect(initialAppReport, "Reporte inicial de /app debe existir").not.toBeNull();

    const homeNavLink = page.locator('a[href="/app"]:visible').first();
    if ((await homeNavLink.count()) > 0) {
      await resetClsObserver(page);
      await homeNavLink.click();
      await expect(page).toHaveURL(/\/app\/?(?:[?#].*)?$/);
      await waitForRouteLandmark(page, "/app");
      await waitForLayoutAndImages(page);
    } else {
      await navigateClubRoute(page, "/app");
    }

    const returnAppReport = await auditRouteIntegrity(
      page,
      "/app",
      `/app retorno tras 6 rutas [${viewportLabel}]`,
    );

    expect(
      returnAppReport.openDialogsCount,
      `Diálogos abiertos fugados al volver a /app [${viewportLabel}]`,
    ).toBe(0);

    const allowedMainDrift = Math.max(120, Math.round(initialAppReport!.mainDomNodes * 0.2));
    const allowedTotalDrift = Math.max(150, Math.round(initialAppReport!.totalDomNodes * 0.2));
    const actualMainDrift = Math.abs(returnAppReport.mainDomNodes - initialAppReport!.mainDomNodes);
    const actualTotalDrift = Math.abs(
      returnAppReport.totalDomNodes - initialAppReport!.totalDomNodes,
    );

    expect(
      actualMainDrift,
      `Deriva de nodos DOM en #main al volver a /app (${initialAppReport!.mainDomNodes} -> ${returnAppReport.mainDomNodes}) [${viewportLabel}]`,
    ).toBeLessThanOrEqual(allowedMainDrift);

    expect(
      actualTotalDrift,
      `Deriva de nodos DOM totales al volver a /app (${initialAppReport!.totalDomNodes} -> ${returnAppReport.totalDomNodes}) [${viewportLabel}]`,
    ).toBeLessThanOrEqual(allowedTotalDrift);

    monitors.assertClean(`Recorrido completo 6 rutas + retorno /app [${viewportLabel}]`);
  });
});
