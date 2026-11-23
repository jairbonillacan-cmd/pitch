import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

type ThemeMode = "dark" | "light";

interface BrokenImageInfo {
  readonly src: string;
  readonly alt: string;
  readonly className: string;
  readonly complete: boolean;
  readonly naturalWidth: number;
}

interface PackIconAudit {
  readonly totalVisiblePackIcons: number;
  readonly darkPackIcons: number;
  readonly lightPackIcons: number;
  readonly brokenImages: readonly BrokenImageInfo[];
}

interface SmallButtonSample {
  readonly label: string;
  readonly className: string;
  readonly width: number;
  readonly height: number;
}

interface SmallInputSample {
  readonly tag: string;
  readonly className: string;
  readonly fontSizePx: number;
}

interface TransversalAuditReport {
  readonly scrollWidth: number;
  readonly clientWidth: number;
  readonly overflowPx: number;
  readonly isMobileViewport: boolean;
  readonly totalDomNodes: number;
  readonly mainDomNodes: number;
  readonly smallButtons: readonly SmallButtonSample[];
  readonly smallInputs: readonly SmallInputSample[];
  readonly brokenImages: readonly BrokenImageInfo[];
  readonly fd16Matches: readonly string[];
}

interface CurvedSlopSample {
  readonly selector: string;
  readonly borderLeftWidth: number;
  readonly borderTopLeftRadius: number;
  readonly borderBottomLeftRadius: number;
}

interface RuntimeMonitors {
  readonly assertClean: (label: string) => void;
}

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100").replace(/\/+$/, "");
const THEMES: readonly ThemeMode[] = ["dark", "light"];
const ICON_AUDIT_ROUTES = [
  "/app",
  "/app/liga-mx",
  "/app/champions-league",
  "/app/picks",
  "/app/parlays",
  "/app/lab",
] as const;
const LEAGUE_HUB_ROUTES = ["/app/liga-mx", "/app/champions-league", "/app/nba"] as const;
const HOME_OFFICIAL_LEAGUE_BUTTONS = ["NFL", "NBA", "NHL", "MLB"] as const;
const FORBIDDEN_PARLAY_JARGON_RE = /fr[eé]chet|hoeffding|student-t|geodesic/i;
const REPEATED_BARE_TOTAL_RE =
  /(?:M[aá]s|Menos)\s+de\s+\d+(?:[.,]\d+)?\s*\+\s*(?:M[aá]s|Menos)\s+de\s+\d+(?:[.,]\d+)?\s*\+\s*(?:M[aá]s|Menos)\s+de\s+\d+(?:[.,]\d+)?/i;
const TOTAL_LINE_RE = /(?:M[aá]s|Menos)\s+de\s+\d+[.,]\d+([^\n·|•()]{0,36})/gi;
const TOTAL_UNIT_RE =
  /^\s*(?:de\s+)?(?:goles?|puntos?|pts|carreras?|c[oó]rners?|tiros?|remates?|tarjetas?|amarillas?|faltas?|asistencias?|ast|rebotes?|reb|triples?|3pm|atajadas?|yardas?|pases?|entradas?|fueras?|sets?|juegos?|games?|hits?|ponches?|strikeouts?|sot|xg)\b/i;

function attachMonitors(page: Page): RuntimeMonitors {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const serverErrors: string[] = [];
  const asset404s: string[] = [];

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
    const url = res.url();
    let pathname = "";
    try {
      pathname = new URL(url).pathname;
    } catch (err) {
      void err;
      return;
    }
    if (
      status === 404 &&
      (pathname.startsWith("/icons/") ||
        pathname.startsWith("/icons-dark/") ||
        pathname.startsWith("/brand/"))
    ) {
      asset404s.push(`404 ${pathname}`);
    }
    if (url.startsWith(ORIGIN) && status >= 500) {
      serverErrors.push(`${status} ${pathname}`);
    }
  });

  return {
    assertClean: (label: string) => {
      expect(asset404s, `Respuestas 404 en /icons/*, /icons-dark/* o /brand/* en ${label}`).toEqual(
        [],
      );
      expect(serverErrors, `Errores HTTP 5xx en ${label}`).toEqual([]);
      expect(pageErrors, `pageerror en ${label}`).toEqual([]);
      expect(consoleErrors, `console.error en ${label}`).toEqual([]);
    },
  };
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

async function configureViewport(page: Page, projectName: string): Promise<boolean> {
  const isMobile = projectName === "mobile";
  await page.setViewportSize(
    isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  );
  return isMobile;
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
    const isVisuallyRendered = (img: HTMLImageElement): boolean => {
      if (
        img.closest(
          "nextjs-portal, [data-nextjs-toast], [hidden], dialog:not([open]), [popover]:not(:popover-open), [inert]",
        )
      ) {
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
      if (!isVisuallyRendered(img)) return false;
      const rect = img.getBoundingClientRect();
      const inOrNearViewport = rect.bottom > -200 && rect.top < window.innerHeight + 300;
      return inOrNearViewport || img.loading !== "lazy";
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

async function applyTheme(page: Page, theme: ThemeMode): Promise<void> {
  await page.evaluate(async (nextTheme) => {
    const root = document.documentElement;
    root.dataset.themeSwitching = "true";
    root.dataset.theme = nextTheme;
    root.style.colorScheme = nextTheme;
    try {
      window.localStorage.setItem("pl-theme", nextTheme);
    } catch (err) {
      void err;
    }
    void root.offsetHeight;
    delete root.dataset.themeSwitching;
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });
  }, theme);
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  await waitForLayoutAndImages(page);
}

async function navigateClean(page: Page, routePath: string): Promise<void> {
  const response = await page.goto(routePath, { waitUntil: "domcontentloaded" });
  const status = response?.status() ?? 200;
  expect(status, `Ruta ${routePath} devolvió HTTP ${status}`).toBeLessThan(400);
  await expect(page.locator("#main")).toBeVisible();
  await waitForLayoutAndImages(page);
}

async function auditPackIcons(page: Page, theme: ThemeMode, label: string): Promise<PackIconAudit> {
  await waitForLayoutAndImages(page);
  const report: PackIconAudit = await page.evaluate(() => {
    const isVisuallyRendered = (img: HTMLImageElement): boolean => {
      if (
        img.closest(
          "nextjs-portal, [data-nextjs-toast], [hidden], dialog:not([open]), [popover]:not(:popover-open), [inert]",
        )
      ) {
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

    let totalVisiblePackIcons = 0;
    let darkPackIcons = 0;
    let lightPackIcons = 0;
    const brokenImages: BrokenImageInfo[] = [];

    for (const img of Array.from(document.querySelectorAll("img"))) {
      if (!isVisuallyRendered(img)) continue;
      const src = img.currentSrc || img.getAttribute("src") || "";
      const rect = img.getBoundingClientRect();
      const inViewport =
        rect.bottom > 0 &&
        rect.top < window.innerHeight &&
        rect.right > 0 &&
        rect.left < window.innerWidth;

      if (src.includes("/icons-dark/")) {
        totalVisiblePackIcons += 1;
        darkPackIcons += 1;
      } else if (src.includes("/icons/")) {
        totalVisiblePackIcons += 1;
        lightPackIcons += 1;
      }

      const isBroken =
        (img.complete && img.naturalWidth === 0) || (inViewport && img.naturalWidth === 0);
      if (isBroken) {
        brokenImages.push({
          src: src.slice(0, 140),
          alt: (img.getAttribute("alt") || "").slice(0, 60),
          className: (img.getAttribute("class") || "").trim().slice(0, 80),
          complete: img.complete,
          naturalWidth: img.naturalWidth,
        });
      }
    }

    return {
      totalVisiblePackIcons,
      darkPackIcons,
      lightPackIcons,
      brokenImages,
    };
  });

  expect(report.brokenImages, `Imágenes rotas (naturalWidth === 0) en ${label}`).toEqual([]);
  if (report.totalVisiblePackIcons > 0) {
    if (theme === "dark") {
      expect(
        report.darkPackIcons,
        `Tema oscuro debe cargar íconos WebP desde /icons-dark/ en ${label}`,
      ).toBeGreaterThan(0);
    } else {
      expect(
        report.lightPackIcons,
        `Tema claro debe cargar íconos WebP desde /icons/ en ${label}`,
      ).toBeGreaterThan(0);
      expect(
        report.darkPackIcons,
        `Tema claro no debe dejar íconos WebP en /icons-dark/ en ${label}`,
      ).toBe(0);
    }
  }
  return report;
}

async function auditTransversalInvariants(
  page: Page,
  label: string,
  options: {
    readonly runAxe?: boolean;
    readonly maxTotalDomNodes?: number;
    readonly maxMainDomNodes?: number;
  } = {},
): Promise<TransversalAuditReport> {
  await waitForLayoutAndImages(page);
  const report: TransversalAuditReport = await page.evaluate(() => {
    const root = document.documentElement;
    const scrollWidth = root.scrollWidth;
    const clientWidth = root.clientWidth;
    const overflowPx = Math.max(0, scrollWidth - clientWidth);
    const isMobileViewport = window.innerWidth < 768;

    const isInteractiveVisible = (el: Element): boolean => {
      if (
        el.closest(
          "nextjs-portal, [data-nextjs-toast], [hidden], [aria-hidden='true'], dialog:not([open]), [popover]:not(:popover-open), [inert]",
        )
      ) {
        return false;
      }
      const style = window.getComputedStyle(el);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number.parseFloat(style.opacity || "1") === 0
      ) {
        return false;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 1 && rect.height > 1;
    };

    const isImageRendered = (img: HTMLImageElement): boolean => {
      if (
        img.closest(
          "nextjs-portal, [data-nextjs-toast], [hidden], dialog:not([open]), [popover]:not(:popover-open), [inert]",
        )
      ) {
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

    const smallButtons: SmallButtonSample[] = [];
    const smallInputs: SmallInputSample[] = [];

    if (isMobileViewport) {
      for (const el of Array.from(document.querySelectorAll('button, [role="button"]'))) {
        if (!isInteractiveVisible(el)) continue;
        const rect = el.getBoundingClientRect();
        const width = Math.round(rect.width);
        const height = Math.round(rect.height);
        if (width < 44 || height < 44) {
          smallButtons.push({
            label: (el.getAttribute("aria-label") || el.textContent || "(icon)")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 60),
            className: (el.getAttribute("class") || "").trim().slice(0, 80),
            width,
            height,
          });
          if (smallButtons.length >= 12) break;
        }
      }

      for (const el of Array.from(
        document.querySelectorAll(
          'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]):not([type="reset"]), select, textarea',
        ),
      )) {
        if (!isInteractiveVisible(el)) continue;
        const fs = Number.parseFloat(window.getComputedStyle(el).fontSize || "16");
        if (Number.isFinite(fs) && fs < 15.9) {
          smallInputs.push({
            tag: el.tagName.toLowerCase(),
            className: (el.getAttribute("class") || "").trim().slice(0, 80),
            fontSizePx: Math.round(fs * 10) / 10,
          });
          if (smallInputs.length >= 10) break;
        }
      }
    }

    const brokenImages: BrokenImageInfo[] = [];
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
        if (brokenImages.length >= 10) break;
      }
    }

    const bodyText = document.body?.innerText ?? "";
    const fd16Re = /sofascore|scoutpicks|poisson|dixon/gi;
    const fd16Matches: string[] = [];
    let match = fd16Re.exec(bodyText);
    while (match !== null && fd16Matches.length < 10) {
      fd16Matches.push(match[0]);
      match = fd16Re.exec(bodyText);
    }

    const totalDomNodes = document.querySelectorAll("*").length;
    const mainEl = document.querySelector("#main");
    const mainDomNodes = mainEl ? mainEl.querySelectorAll("*").length : totalDomNodes;

    return {
      scrollWidth,
      clientWidth,
      overflowPx,
      isMobileViewport,
      totalDomNodes,
      mainDomNodes,
      smallButtons,
      smallInputs,
      brokenImages,
      fd16Matches,
    };
  });

  expect(
    report.scrollWidth,
    `Overflow horizontal (${report.overflowPx}px) en ${label}`,
  ).toBeLessThanOrEqual(report.clientWidth);

  if (report.isMobileViewport) {
    expect(report.smallButtons, `Botones < 44x44 px en móvil en ${label}`).toEqual([]);
    expect(report.smallInputs, `Inputs < 16 px en móvil en ${label}`).toEqual([]);
  }

  expect(report.brokenImages, `Imágenes rotas (naturalWidth === 0) en ${label}`).toEqual([]);
  expect(
    report.fd16Matches,
    `Fuga FD-16 (/sofascore|scoutpicks|poisson|dixon/i) en texto visible en ${label}`,
  ).toEqual([]);

  if (options.maxTotalDomNodes !== undefined) {
    expect(
      report.totalDomNodes,
      `Presupuesto DOM total excedido (${report.totalDomNodes} > ${options.maxTotalDomNodes}) en ${label}`,
    ).toBeLessThanOrEqual(options.maxTotalDomNodes);
  }
  if (options.maxMainDomNodes !== undefined) {
    expect(
      report.mainDomNodes,
      `Presupuesto DOM en #main excedido (${report.mainDomNodes} > ${options.maxMainDomNodes}) en ${label}`,
    ).toBeLessThan(options.maxMainDomNodes);
  }

  if (options.runAxe) {
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      axe.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`),
      `Violaciones Axe WCAG 2.1 AA en ${label}`,
    ).toEqual([]);
  }

  return report;
}

async function auditNoCurvedBorderSlop(page: Page, label: string): Promise<void> {
  const offenders: CurvedSlopSample[] = await page.evaluate(() => {
    const results: CurvedSlopSample[] = [];
    const selector =
      '.pl-sb-rank-cell, .pl-st-rank-cell, .pl-st-zone-cell, .pl-st-head-lead, .pl-astro-row[data-selected="true"]';
    for (const el of Array.from(document.querySelectorAll(selector))) {
      if (el.closest("[hidden], dialog:not([open]), [inert]")) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) continue;

      const style = window.getComputedStyle(el);
      const bl = Number.parseFloat(style.borderLeftWidth || "0");
      const br = Number.parseFloat(style.borderRightWidth || "0");
      const bt = Number.parseFloat(style.borderTopWidth || "0");
      const rtl = Number.parseFloat(style.borderTopLeftRadius || "0");
      const rbl = Number.parseFloat(style.borderBottomLeftRadius || "0");
      const isAccentedLeft = bl >= 2 && (bl > br + 0.5 || bl > bt + 0.5);
      if (isAccentedLeft && (rtl >= 3 || rbl >= 3)) {
        results.push({
          selector: (el.getAttribute("class") || el.tagName).trim().slice(0, 80),
          borderLeftWidth: bl,
          borderTopLeftRadius: rtl,
          borderBottomLeftRadius: rbl,
        });
      }

      const before = window.getComputedStyle(el, "::before");
      if (before.content && before.content !== "none") {
        const bbl = Number.parseFloat(before.borderLeftWidth || "0");
        const bbt = Number.parseFloat(before.borderTopWidth || "0");
        const bbb = Number.parseFloat(before.borderBottomWidth || "0");
        const brtl = Number.parseFloat(before.borderTopLeftRadius || "0");
        const brbl = Number.parseFloat(before.borderBottomLeftRadius || "0");
        if (bbl >= 2 && (bbt >= 1 || bbb >= 1) && (brtl >= 3 || brbl >= 3)) {
          results.push({
            selector: `${(el.getAttribute("class") || el.tagName).trim().slice(0, 70)}::before`,
            borderLeftWidth: bbl,
            borderTopLeftRadius: brtl,
            borderBottomLeftRadius: brbl,
          });
        }
      }
    }
    return results;
  });

  expect(offenders, `Bordes curvos slop (border-left + border-radius) detectados en ${label}`).toEqual(
    [],
  );
}

function findUnitlessTotalLabels(text: string): string[] {
  const missing: string[] = [];
  TOTAL_LINE_RE.lastIndex = 0;
  let match = TOTAL_LINE_RE.exec(text);
  while (match !== null) {
    const trailing = match[1] ?? "";
    if (!TOTAL_UNIT_RE.test(trailing)) {
      missing.push(match[0].replace(/\s+/g, " ").trim());
    }
    match = TOTAL_LINE_RE.exec(text);
  }
  return missing;
}

function extractEvPercentages(text: string): number[] {
  const values: number[] = [];
  const patterns = [
    /\bEV\+?\s*[+＋]?\s*(\d+(?:[.,]\d+)?)\s*%/gi,
    /[+＋]\s*(\d+(?:[.,]\d+)?)\s*%\s*EV\+?/gi,
  ];
  for (const pattern of patterns) {
    let match = pattern.exec(text);
    while (match !== null) {
      const parsed = Number.parseFloat((match[1] ?? "").replace(",", "."));
      if (Number.isFinite(parsed)) {
        values.push(parsed);
      }
      match = pattern.exec(text);
    }
  }
  return values;
}

async function assertControlActive(locator: Locator, label: string): Promise<void> {
  await expect
    .poll(
      async () => {
        const state = await locator.evaluate((el) => ({
          ariaSelected: el.getAttribute("aria-selected"),
          ariaPressed: el.getAttribute("aria-pressed"),
          ariaChecked: el.getAttribute("aria-checked"),
          dataActive: el.getAttribute("data-active"),
          className: el.getAttribute("class") || "",
        }));
        return (
          state.ariaSelected === "true" ||
          state.ariaPressed === "true" ||
          state.ariaChecked === "true" ||
          state.dataActive === "true" ||
          /\bis-active\b/.test(state.className)
        );
      },
      { message: `El control «${label}» no quedó activo tras hacer clic`, timeout: 5_000 },
    )
    .toBe(true);
}

test.describe("Ola 7 · Auditoría E2E de Usabilidad, Íconos WebP, Logos, Ligas, Parlays, Picks y Mi Récord", () => {
  test("1. Integridad de íconos WebP claro/oscuro y logos oficiales de ligas (naturalWidth > 0, cero 404)", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await configureViewport(page, testInfo.project.name);
    const monitors = attachMonitors(page);
    await unlockBetaSession(page);

    for (const route of ICON_AUDIT_ROUTES) {
      await navigateClean(page, route);
      for (const theme of THEMES) {
        await applyTheme(page, theme);
        await auditPackIcons(page, theme, `${route} [${theme}]`);

        if (route === "/app") {
          const sportGroup = page.getByRole("group", { name: "Elegir deporte" });
          await expect(sportGroup).toBeVisible();
          for (const leagueCode of HOME_OFFICIAL_LEAGUE_BUTTONS) {
            const btn = sportGroup.getByRole("button", {
              name: new RegExp(`\\b${leagueCode}\\b`, "i"),
            });
            await expect(btn, `Botón ${leagueCode} en HomeSportStrip`).toBeVisible();
            await btn.scrollIntoViewIfNeeded();
            const img = btn.locator("img").first();
            await expect(img, `Logo oficial <img> de ${leagueCode} en HomeSportStrip`).toBeVisible();
            await expect
              .poll(
                () =>
                  img.evaluate((node) => {
                    if (!(node instanceof HTMLImageElement)) return { ok: false, src: "" };
                    return {
                      ok: node.complete && node.naturalWidth > 0,
                      src: node.currentSrc || node.getAttribute("src") || "",
                    };
                  }),
                { timeout: 10_000 },
              )
              .toMatchObject({ ok: true });
            const logoSrc = await img.evaluate((node) =>
              node instanceof HTMLImageElement ? node.currentSrc || node.getAttribute("src") || "" : "",
            );
            expect(
              logoSrc,
              `${leagueCode} en HomeSportStrip no debe usar balón genérico /deportes/*.webp`,
            ).not.toMatch(/\/deportes\/(?:american-football|basketball|hockey|baseball)\.webp/i);
          }
        }

        if (route === "/app/liga-mx" || route === "/app/champions-league") {
          const heroLogo = page
            .locator("[data-league-hero] img:not(.pl-team-country-flag), .pl-league-hero-crest img")
            .first();
          await expect(heroLogo, `Logo oficial en encabezado de ${route} [${theme}]`).toBeVisible();
          await expect
            .poll(
              () =>
                heroLogo.evaluate((node) =>
                  node instanceof HTMLImageElement ? node.complete && node.naturalWidth > 0 : false,
                ),
              { timeout: 10_000 },
            )
            .toBe(true);
        }
      }
      monitors.assertClean(`${route} (${testInfo.project.name})`);
    }
  });

  test("2. Calendario limpio en /app, header global sin Árbitros, acceso arbitral en Liga MX y cero slop curvo", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const isMobile = await configureViewport(page, testInfo.project.name);
    const monitors = attachMonitors(page);
    await unlockBetaSession(page);

    await navigateClean(page, "/app");

    const globalHeader = page.locator("header").first();
    await expect(globalHeader).toBeVisible();
    await expect(
      globalHeader.locator('a[href*="/arbitros"]:visible'),
      "El header global no debe contener enlaces visibles a /arbitros",
    ).toHaveCount(0);
    await expect(
      globalHeader.locator('.pl-header-nav-bar a[href*="/arbitros"]'),
      "La barra superior principal no debe incluir Árbitros",
    ).toHaveCount(0);

    const dayCenter = page.locator("[data-day-center]");
    await expect(dayCenter).toBeVisible();
    await dayCenter.click();

    const calPopover = page.locator("[data-home-calendar-popover]");
    await expect(calPopover).toBeVisible();
    await expect(
      calPopover.locator(".pl-home-cal-summary-leagues"),
      "Calendario limpio no debe renderizar .pl-home-cal-summary-leagues",
    ).toHaveCount(0);
    await expect(
      calPopover.locator(".pl-home-cal-legend"),
      "Calendario limpio no debe renderizar .pl-home-cal-legend",
    ).toHaveCount(0);

    const pastLiveOffenders = await calPopover.evaluate((popoverEl) => {
      const todayCell = popoverEl.querySelector(
        'button[data-cal-iso][aria-current="date"], button.pl-home-cal-day.is-today[data-cal-iso]',
      );
      const todayIso = todayCell?.getAttribute("data-cal-iso") ?? "";
      if (!todayIso) return [];
      const bad: string[] = [];
      for (const btn of Array.from(popoverEl.querySelectorAll("button[data-cal-iso]"))) {
        const iso = btn.getAttribute("data-cal-iso") ?? "";
        if (!iso || iso >= todayIso) continue;
        const hasLiveDot = btn.querySelector(".pl-home-cal-live-dot") !== null;
        const hasLiveClass = btn.classList.contains("has-live");
        const ariaLabel = btn.getAttribute("aria-label") ?? "";
        if (hasLiveDot || hasLiveClass || /\ben vivo\b/i.test(ariaLabel)) {
          bad.push(`${iso} (dot=${hasLiveDot}, class=${hasLiveClass})`);
        }
      }
      return bad;
    });
    expect(
      pastLiveOffenders,
      "No deben aparecer puntos 'En vivo' en fechas pasadas del calendario",
    ).toEqual([]);

    if (isMobile) {
      const mobileCalAudit = await page.evaluate(() => {
        const popover = document.querySelector("[data-home-calendar-popover]");
        if (!popover) return null;
        const popRect = popover.getBoundingClientRect();
        const dock = document.querySelector('nav[aria-label="Navegación móvil"], .mobile-dock');
        const dockRect = dock ? dock.getBoundingClientRect() : null;
        const todayBtn = popover.querySelector(".pl-home-cal-today-btn");
        const todayRect = todayBtn ? todayBtn.getBoundingClientRect() : null;
        let todayCoveredByDock = false;
        if (todayRect && todayRect.width > 0 && todayRect.height > 0 && dock) {
          const hit = document.elementFromPoint(
            todayRect.left + todayRect.width / 2,
            todayRect.top + todayRect.height / 2,
          );
          if (hit && dock.contains(hit)) {
            todayCoveredByDock = true;
          }
        }
        const smallDayCells: Array<{ iso: string; width: number; height: number }> = [];
        for (const cell of Array.from(popover.querySelectorAll(".pl-home-cal-day"))) {
          const r = cell.getBoundingClientRect();
          if (r.width <= 1 || r.height <= 1) continue;
          const w = Math.round(r.width);
          const h = Math.round(r.height);
          if (w < 44 || h < 44) {
            smallDayCells.push({
              iso: cell.getAttribute("data-cal-iso") ?? "",
              width: w,
              height: h,
            });
          }
        }
        return {
          popLeft: popRect.left,
          popRight: popRect.right,
          popBottom: popRect.bottom,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          dockTop: dockRect ? dockRect.top : null,
          todayBottom: todayRect ? todayRect.bottom : null,
          todayCoveredByDock,
          smallDayCells,
        };
      });
      expect(mobileCalAudit).not.toBeNull();
      expect(mobileCalAudit!.popLeft).toBeGreaterThanOrEqual(-1);
      expect(mobileCalAudit!.popRight).toBeLessThanOrEqual(mobileCalAudit!.viewportWidth + 1);
      expect(mobileCalAudit!.popBottom).toBeLessThanOrEqual(mobileCalAudit!.viewportHeight + 1);
      expect(
        mobileCalAudit!.todayCoveredByDock,
        "El botón Hoy del calendario móvil no debe quedar cubierto por la navegación inferior",
      ).toBe(false);
      expect(
        mobileCalAudit!.smallDayCells,
        "Todas las celdas día del calendario en móvil 390px deben medir >= 44x44 px",
      ).toEqual([]);
    }

    const activeDayCell = calPopover
      .locator('button[data-cal-iso][aria-pressed="true"], button[data-cal-iso]')
      .first();
    await activeDayCell.focus();
    const focusedBefore = await page.evaluate(
      () => document.activeElement?.getAttribute("data-cal-iso") ?? null,
    );
    expect(focusedBefore).not.toBeNull();
    await page.keyboard.press("ArrowRight");
    const focusedAfterRight = await page.evaluate(
      () => document.activeElement?.getAttribute("data-cal-iso") ?? null,
    );
    if (focusedAfterRight === focusedBefore) {
      await page.keyboard.press("ArrowLeft");
    }
    const focusedAfterMove = await page.evaluate(
      () => document.activeElement?.getAttribute("data-cal-iso") ?? null,
    );
    expect(
      focusedAfterMove,
      "La navegación por flechas debe mover el foco entre días del calendario",
    ).not.toBe(focusedBefore);

    await page.keyboard.press("Escape");
    await expect(calPopover).toBeHidden();

    const nextDayBtn = page.locator("[data-day-next]");
    const prevDayBtn = page.locator("[data-day-prev]");
    const initialCenterText = (await dayCenter.innerText()).trim();
    if (await nextDayBtn.isEnabled()) {
      await nextDayBtn.click();
    } else if (await prevDayBtn.isEnabled()) {
      await prevDayBtn.click();
    }
    await expect(dayCenter).not.toHaveText(initialCenterText);

    await dayCenter.click();
    await expect(calPopover).toBeVisible();
    await calPopover.locator(".pl-home-cal-today-btn").click();
    await expect(calPopover).toBeHidden();
    await expect(dayCenter).toContainText("Hoy");

    if (!isMobile) {
      const standingsDetailTab = page
        .locator('[data-home-detail-tabs] [role="tab"]')
        .filter({ hasText: /Clasificaci[oó]n|Tabla/i })
        .first();
      if ((await standingsDetailTab.count()) > 0 && (await standingsDetailTab.isVisible())) {
        await standingsDetailTab.click();
        await waitForLayoutAndImages(page);
        await auditNoCurvedBorderSlop(page, "/app panel derecho Clasificación");
      }
    }

    for (const theme of THEMES) {
      await applyTheme(page, theme);
      await auditTransversalInvariants(page, `/app [${theme}]`, { runAxe: true });
    }

    await navigateClean(page, "/app/liga-mx");
    const ligaRefTab = page
      .locator('#main [role="tab"]')
      .filter({ hasText: /[ÁA]rbitros/i })
      .first();
    const ligaRefLink = page.locator('#main a[href="/app/liga-mx/arbitros"]').first();
    const hasLigaRefTab = (await ligaRefTab.count()) > 0 && (await ligaRefTab.isVisible());
    const hasLigaRefLink = (await ligaRefLink.count()) > 0 && (await ligaRefLink.isVisible());
    expect(
      hasLigaRefTab || hasLigaRefLink,
      "/app/liga-mx debe exponer acceso o pestaña visible de Árbitros",
    ).toBe(true);
    if (hasLigaRefTab) {
      await ligaRefTab.click();
      await expect(ligaRefTab).toHaveAttribute("aria-selected", "true");
    }

    const refRes = await page.goto("/app/liga-mx/arbitros", { waitUntil: "domcontentloaded" });
    expect(refRes?.status(), "/app/liga-mx/arbitros debe responder 200").toBe(200);
    await expect(page.locator("#main")).toBeVisible();
    await auditTransversalInvariants(page, "/app/liga-mx/arbitros");
    monitors.assertClean(`Calendario + Header + Árbitros (${testInfo.project.name})`);
  });

  test("3. Páginas de Liga (/app/liga-mx, /app/champions-league, /app/nba): hero, progreso, Seguir, rondas, splits, Últimos 5, DOM y Axe AA", async ({
    page,
  }, testInfo) => {
    test.setTimeout(150_000);
    const isMobile = await configureViewport(page, testInfo.project.name);
    const monitors = attachMonitors(page);
    await unlockBetaSession(page);

    for (const leagueRoute of LEAGUE_HUB_ROUTES) {
      await navigateClean(page, leagueRoute);

      const hero = page.locator("[data-league-hero], .pl-league-hero").first();
      await expect(hero, `Hero visible en ${leagueRoute}`).toBeVisible();

      const heroLogo = hero
        .locator(".pl-league-hero-crest img, img:not(.pl-team-country-flag)")
        .first();
      await expect(heroLogo, `Logo oficial en hero de ${leagueRoute}`).toBeVisible();
      await expect
        .poll(
          () =>
            heroLogo.evaluate((node) =>
              node instanceof HTMLImageElement ? node.complete && node.naturalWidth > 0 : false,
            ),
          { timeout: 10_000 },
        )
        .toBe(true);

      const progressBar = hero
        .locator('.pl-league-timeline, [role="progressbar"], [aria-label*="temporada" i]')
        .first();
      await expect(progressBar, `Barra de progreso de temporada en ${leagueRoute}`).toBeVisible();

      const followBtn = hero.getByRole("button", { name: /\b(?:Seguir|Siguiendo)\b/i }).first();
      await expect(followBtn, `Botón Seguir/Siguiendo en ${leagueRoute}`).toBeVisible();
      const followInitialText = ((await followBtn.innerText()) ?? "").trim();
      expect(followInitialText).not.toMatch(/FAVORITO/i);
      const beforePressed = await followBtn.getAttribute("aria-pressed");
      const expectedNextPressed = beforePressed === "true" ? "false" : "true";
      await followBtn.click();
      await expect(
        followBtn,
        `Botón Seguir/Siguiendo debe alternar estado en ${leagueRoute}`,
      ).toHaveAttribute("aria-pressed", expectedNextPressed);
      await followBtn.click();
      if (beforePressed === "true" || beforePressed === "false") {
        await expect(followBtn).toHaveAttribute("aria-pressed", beforePressed);
      }

      let byDateControl = page
        .locator('#main button:visible, #main [role="tab"]:visible, #main [role="radio"]:visible')
        .filter({ hasText: /^Por fecha$/i })
        .first();
      let byRoundControl = page
        .locator('#main button:visible, #main [role="tab"]:visible, #main [role="radio"]:visible')
        .filter({ hasText: /^Por ronda$/i })
        .first();

      if ((await byDateControl.count()) === 0) {
        const matchesTab = page
          .locator('#main [role="tab"]')
          .filter({ hasText: /^Partidos\b/i })
          .first();
        if ((await matchesTab.count()) > 0 && (await matchesTab.isVisible())) {
          await matchesTab.click();
          await waitForLayoutAndImages(page);
        }
      }

      byDateControl = page
        .locator('#main button:visible, #main [role="tab"]:visible, #main [role="radio"]:visible')
        .filter({ hasText: /^Por fecha$/i })
        .first();
      byRoundControl = page
        .locator('#main button:visible, #main [role="tab"]:visible, #main [role="radio"]:visible')
        .filter({ hasText: /^Por ronda$/i })
        .first();

      await expect(byDateControl, `Toggle 'Por fecha' en ${leagueRoute}`).toBeVisible();
      await expect(byRoundControl, `Toggle 'Por ronda' en ${leagueRoute}`).toBeVisible();
      if (await byRoundControl.isEnabled()) {
        await byRoundControl.click();
        await assertControlActive(byRoundControl, `${leagueRoute} Por ronda`);
      }
      if (await byDateControl.isEnabled()) {
        await byDateControl.click();
        await assertControlActive(byDateControl, `${leagueRoute} Por fecha`);
      }

      const standingsTab = page
        .locator('#main [role="tab"]')
        .filter({ hasText: /Clasificaciones|Tabla/i })
        .first();
      if ((await standingsTab.count()) > 0 && (await standingsTab.isVisible())) {
        await standingsTab.click();
        await expect(standingsTab).toHaveAttribute("aria-selected", "true");
        await waitForLayoutAndImages(page);
      }

      const splitAll = page
        .locator('#main button:visible, #main [role="tab"]:visible, #main [role="radio"]:visible')
        .filter({ hasText: /^(?:Todos|Total)(?:\s*\d+)?$/i })
        .first();
      const splitHome = page
        .locator('#main button:visible, #main [role="tab"]:visible, #main [role="radio"]:visible')
        .filter({ hasText: /^Local(?:\s*\d+)?$/i })
        .first();
      const splitAway = page
        .locator('#main button:visible, #main [role="tab"]:visible, #main [role="radio"]:visible')
        .filter({ hasText: /^Visitante(?:\s*\d+)?$/i })
        .first();

      await expect(splitAll, `Split Todos/Total en ${leagueRoute}`).toBeVisible();
      await expect(splitHome, `Split Local en ${leagueRoute}`).toBeVisible();
      await expect(splitAway, `Split Visitante en ${leagueRoute}`).toBeVisible();

      await splitHome.click();
      await assertControlActive(splitHome, `${leagueRoute} Local`);
      await splitAway.click();
      await assertControlActive(splitAway, `${leagueRoute} Visitante`);
      await splitAll.click();
      await assertControlActive(splitAll, `${leagueRoute} Todos`);

      await auditNoCurvedBorderSlop(page, `${leagueRoute} Clasificaciones`);

      const formClippingIssues = await page.evaluate((mobileMode) => {
        const issues: string[] = [];
        const tables = Array.from(document.querySelectorAll("#main table"));
        for (const table of tables) {
          if (table.closest("[hidden]")) continue;
          const tableRect = table.getBoundingClientRect();
          if (tableRect.width <= 1 || tableRect.height <= 1) continue;
          const wrap =
            table.closest(
              ".pl-sf-table-wrap, .pl-sb-table-wrap, .pl-st-wrap, .pl-table-region, [class*='table-wrap']",
            ) ?? table.parentElement;
          if (!wrap) continue;
          const wrapStyle = window.getComputedStyle(wrap);
          const isScrollableX =
            (wrapStyle.overflowX === "auto" || wrapStyle.overflowX === "scroll") &&
            wrap.scrollWidth > wrap.clientWidth + 2;

          if (mobileMode && isScrollableX) {
            wrap.scrollLeft = wrap.scrollWidth - wrap.clientWidth;
          }
          const wrapRect = wrap.getBoundingClientRect();

          const strips = Array.from(
            table.querySelectorAll(".pl-af-strip, .pl-form-squares, [data-form-strip]"),
          ).slice(0, 5);
          for (const strip of strips) {
            const st = window.getComputedStyle(strip);
            if (st.display === "none" || st.visibility === "hidden") continue;
            const sRect = strip.getBoundingClientRect();
            if (sRect.width <= 1 || sRect.height <= 1) continue;
            if (strip.scrollWidth > strip.clientWidth + 2) {
              issues.push(
                `strip-internal-clip(${Math.round(strip.scrollWidth)}>${Math.round(strip.clientWidth)})`,
              );
            }
            if (!mobileMode && sRect.right > wrapRect.right + 2) {
              issues.push(
                `strip-right-clip(${Math.round(sRect.right)}>${Math.round(wrapRect.right)})`,
              );
            }
          }

          if (mobileMode && isScrollableX) {
            wrap.scrollLeft = 0;
          }
        }
        return issues;
      }, isMobile);
      expect(formClippingIssues, `Recorte en Últimos 5 en ${leagueRoute}`).toEqual([]);

      for (const theme of THEMES) {
        await applyTheme(page, theme);
        await auditTransversalInvariants(page, `${leagueRoute} [${theme}]`, {
          runAxe: true,
          maxMainDomNodes: 1_500,
          maxTotalDomNodes: 1_850,
        });
      }

      monitors.assertClean(`${leagueRoute} (${testInfo.project.name})`);
    }
  });

  test("4. Parlays (/app/parlays): boleto vacío con '—' (cero -5000), cero jerga, un selector 2..6, flujo Auto y Manual", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await configureViewport(page, testInfo.project.name);
    const monitors = attachMonitors(page);
    await unlockBetaSession(page);

    await navigateClean(page, "/app/parlays");

    for (const theme of THEMES) {
      await applyTheme(page, theme);
      const slipAside = page.locator('aside[aria-label="Boleto combinado activo"]').first();
      await expect(slipAside).toBeVisible();
      const slipText = (await slipAside.innerText()) ?? "";
      expect(slipText, `Boleto vacío debe mostrar '—' en ${theme}`).toContain("—");
      expect(slipText, `Boleto vacío JAMÁS debe mostrar -5000 en ${theme}`).not.toContain("-5000");

      const fullBodyText = (await page.locator("body").innerText()) ?? "";
      expect(fullBodyText, `Cero -5000 en /app/parlays [${theme}]`).not.toContain("-5000");
      expect(
        fullBodyText,
        `Cero jerga matemática (Fréchet/Hoeffding/Student-t/Geodesic) en /app/parlays [${theme}]`,
      ).not.toMatch(FORBIDDEN_PARLAY_JARGON_RE);

      await auditTransversalInvariants(page, `/app/parlays vacío [${theme}]`, { runAxe: true });
    }

    await applyTheme(page, "dark");

    const autoPanel = page.locator("[data-parlay-auto-panel]:visible").first();
    await expect(autoPanel).toBeVisible();
    await expect(
      autoPanel.getByRole("group", { name: "Ajustar número de selecciones" }),
      "No debe existir un stepper duplicado de número de selecciones",
    ).toHaveCount(0);
    await expect(
      autoPanel.locator(".pl-pb-stepper"),
      "No debe existir un stepper .pl-pb-stepper duplicado en el generador automático",
    ).toHaveCount(0);

    const legGroup = autoPanel
      .locator('[role="group"][aria-label*="selecciones" i], [role="group"][aria-label*="piernas" i]')
      .first();
    await expect(legGroup).toBeVisible();
    const legLabels = await legGroup
      .locator("button")
      .evaluateAll((els) =>
        els.map((el) => (el.textContent ?? "").replace(/\s*piernas?\s*/i, "").trim()),
      );
    expect(legLabels, "El selector único de piernas debe cubrir solo 2..6").toEqual([
      "2",
      "3",
      "4",
      "5",
      "6",
    ]);

    const threeBtn = legGroup.getByRole("button", { name: "3", exact: true });
    if (await threeBtn.isEnabled()) {
      await threeBtn.click();
    }
    const medioRiskBtn = autoPanel.getByRole("button", { name: /^Medio$/i }).first();
    if ((await medioRiskBtn.count()) > 0 && (await medioRiskBtn.isVisible())) {
      await medioRiskBtn.click();
    }

    await page.locator("[data-generate-parlay]").click();
    const slipLegs = page.locator('aside[aria-label="Boleto combinado activo"] .pl-pb-leg-row');
    await expect(slipLegs.first()).toBeVisible();
    const generatedCount = await slipLegs.count();
    expect(generatedCount).toBeGreaterThanOrEqual(2);

    const generatedTitles = await slipLegs
      .locator(".pl-pb-leg-title")
      .evaluateAll((els) => els.map((el) => (el.textContent ?? "").trim()));
    for (const title of generatedTitles) {
      expect(
        findUnitlessTotalLabels(title),
        `Pierna automática sin unidad en /app/parlays: "${title}"`,
      ).toEqual([]);
    }
    if (generatedTitles.length >= 3) {
      const normalizedSet = new Set(generatedTitles.map((t) => t.toLowerCase()));
      expect(
        normalizedSet.size,
        `El auto-armador no debe repetir 3x exactamente el mismo mercado: ${generatedTitles.join(" | ")}`,
      ).toBeGreaterThanOrEqual(2);
    }

    const postAutoText = (await page.locator("body").innerText()) ?? "";
    expect(postAutoText).not.toContain("-5000");
    expect(postAutoText).not.toMatch(FORBIDDEN_PARLAY_JARGON_RE);

    const clearBtn = page
      .locator('aside[aria-label="Boleto combinado activo"] button')
      .filter({ hasText: /^Limpiar$/i })
      .first();
    if ((await clearBtn.count()) > 0 && (await clearBtn.isVisible())) {
      await clearBtn.click();
      const confirmDialog = page.locator("dialog[open]").last();
      if ((await confirmDialog.count()) > 0 && (await confirmDialog.isVisible())) {
        await confirmDialog
          .locator("button")
          .filter({ hasText: /Limpiar|Confirmar|Vaciar/i })
          .first()
          .click();
        await expect(page.locator("dialog[open]")).toHaveCount(0);
      }
      await expect(slipLegs).toHaveCount(0);
      const clearedSlipText =
        (await page.locator('aside[aria-label="Boleto combinado activo"]').first().innerText()) ?? "";
      expect(clearedSlipText).toContain("—");
      expect(clearedSlipText).not.toContain("-5000");
    }

    const manualTab = page.locator('[data-parlay-mode-tabs] [data-pl-sf-tab="manual"]');
    await expect(manualTab).toBeVisible();
    await manualTab.click();
    await expect(page.locator("[data-parlay-manual-panel]")).toBeVisible();

    const manualSearch = page
      .locator('#main input[type="search"]:visible, #main input.pl-sf-search-input:visible')
      .first();
    if ((await manualSearch.count()) > 0) {
      await manualSearch.fill("zzzz_sin_coincidencia");
      await expect(manualSearch).toHaveValue("zzzz_sin_coincidencia");
      await manualSearch.fill("");
      await expect(manualSearch).toHaveValue("");
    }

    const firstUnlocked = page
      .locator("[data-parlay-manual-panel] button[data-pick-toggle]:not([data-pick-blocked])")
      .first();
    await expect(firstUnlocked).toBeVisible();
    await firstUnlocked.click();
    await expect(firstUnlocked).toContainText(/En boleto|Quitar/i);
    await firstUnlocked.click();
    await expect(firstUnlocked).toContainText(/Agregar/i);

    const unlockedToggles = page.locator(
      "[data-parlay-manual-panel] button[data-pick-toggle]:not([data-pick-blocked])",
    );
    await unlockedToggles.first().click();
    const secondAddable = page
      .locator("[data-parlay-manual-panel] button[data-pick-toggle]:not([data-pick-blocked])")
      .filter({ hasText: /Agregar/i })
      .first();
    await expect(secondAddable).toBeVisible();
    await secondAddable.click();

    const sealBtn = page.getByRole("button", { name: /Sellar en Mi r[eé]cord/i }).first();
    await expect(sealBtn).toBeEnabled();
    await sealBtn.click();

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const raw = window.localStorage.getItem("pl-journal-v1");
          if (!raw) return 0;
          try {
            const parsed: unknown = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed.length : 0;
          } catch (err) {
            void err;
            return 0;
          }
        }),
      )
      .toBeGreaterThan(0);

    await expect(page.locator("[data-parlay-dock]")).toHaveCount(0);
    if ((await page.getByText("Tu boleto combinado está vacío").count()) > 0) {
      await expect(page.getByText("Tu boleto combinado está vacío")).toBeVisible();
    }

    monitors.assertClean(`/app/parlays (${testInfo.project.name})`);
  });

  test("5. Picks (/app/picks) y Mi Récord (/app/lab): unidades en totales, EV acotado, DOM, íconos WebP y filtros separados", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await configureViewport(page, testInfo.project.name);
    const monitors = attachMonitors(page);
    await unlockBetaSession(page);

    await navigateClean(page, "/app/picks");
    await expect(page.locator("[data-picks-layout]")).toBeVisible();
    await expect(page.locator("[data-picks-row]").first()).toBeVisible({ timeout: 15_000 });

    const picksTexts = await page.evaluate(() => {
      const potd = document.querySelector("[data-picks-potd]");
      const rows = Array.from(document.querySelectorAll("[data-picks-row]")).slice(0, 20);
      return [
        ...(potd instanceof HTMLElement ? [potd.innerText] : []),
        ...rows.map((row) => (row instanceof HTMLElement ? row.innerText : "")),
      ];
    });
    expect(picksTexts.length).toBeGreaterThan(0);

    for (const block of picksTexts) {
      expect(
        findUnitlessTotalLabels(block),
        `Etiqueta de total sin unidad en /app/picks: "${block.slice(0, 140)}"`,
      ).toEqual([]);
      const evValues = extractEvPercentages(block);
      for (const ev of evValues) {
        expect(
          ev,
          `Pick recomendado muestra EV absurdo (${ev}% > 25%) en /app/picks`,
        ).toBeLessThanOrEqual(25);
      }
    }

    for (const theme of THEMES) {
      await applyTheme(page, theme);
      await auditPackIcons(page, theme, `/app/picks [${theme}]`);
      const marketIconsCount = await page.evaluate((currentTheme) => {
        const expectedPrefix = currentTheme === "dark" ? "/icons-dark/" : "/icons/";
        const imgs = Array.from(
          document.querySelectorAll("[data-picks-layout] img, [data-picks-potd] img"),
        );
        return imgs.filter((img) => {
          if (!(img instanceof HTMLImageElement)) return false;
          const src = img.currentSrc || img.getAttribute("src") || "";
          return (
            src.includes(expectedPrefix) &&
            /\.webp(?:[?#]|$)/i.test(src) &&
            img.complete &&
            img.naturalWidth > 0
          );
        }).length;
      }, theme);
      expect(
        marketIconsCount,
        `Los nuevos íconos WebP de mercado deben cargar en /app/picks [${theme}]`,
      ).toBeGreaterThan(0);

      await auditTransversalInvariants(page, `/app/picks [${theme}]`, {
        runAxe: true,
        maxMainDomNodes: 1_500,
        maxTotalDomNodes: 1_750,
      });
    }

    await navigateClean(page, "/app/parlays");
    await page.locator("[data-generate-parlay]").click();
    const sealBtn = page.getByRole("button", { name: /Sellar en Mi r[eé]cord/i }).first();
    await expect(sealBtn).toBeEnabled();
    await sealBtn.click();
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const raw = window.localStorage.getItem("pl-journal-v1");
          if (!raw) return 0;
          try {
            const parsed: unknown = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed.length : 0;
          } catch (err) {
            void err;
            return 0;
          }
        }),
      )
      .toBeGreaterThan(0);

    await expect(page.locator("[data-parlay-dock]")).toHaveCount(0);
    if ((await page.getByText("Tu boleto combinado está vacío").count()) > 0) {
      await expect(page.getByText("Tu boleto combinado está vacío")).toBeVisible();
    }

    await navigateClean(page, "/app/lab");
    await expect(page.getByRole("heading", { level: 1, name: /Mi r[eé]cord/i })).toBeVisible();

    const kindFilter = page.locator("[data-record-kind-filter]");
    const statusFilter = page.locator("[data-record-status-filter]");
    await expect(kindFilter, "Filtro Tipo ([data-record-kind-filter]) visible en /app/lab").toBeVisible();
    await expect(
      statusFilter,
      "Filtro Estado ([data-record-status-filter]) visible en /app/lab",
    ).toBeVisible();
    await expect(kindFilter).toContainText(/Simples/i);
    await expect(kindFilter).toContainText(/Parlays/i);
    await expect(statusFilter).toContainText(/Pendientes/i);

    const picksCardText = (await page.locator("#pl-rec-picks").innerText()) ?? "";
    expect(picksCardText, "Filtros de /app/lab deben separar explícitamente Tipo y Estado").toMatch(
      /\bTipo\b/i,
    );
    expect(picksCardText, "Filtros de /app/lab deben separar explícitamente Tipo y Estado").toMatch(
      /\bEstado\b/i,
    );

    const labBodyText = (await page.locator("body").innerText()) ?? "";
    expect(labBodyText, "Cero 'Geodesic v2.0' en /app/lab").not.toMatch(/Geodesic\s+v2\.0/i);
    expect(labBodyText, "Cero EV +223.4% en /app/lab").not.toContain("+223.4%");
    expect(
      labBodyText,
      "El ledger nunca debe mostrar 'Más de 3.5 + Más de 3.5 + Más de 3.5'",
    ).not.toMatch(REPEATED_BARE_TOTAL_RE);

    const parlayFilterBtn = kindFilter.locator("button").filter({ hasText: /Parlays/i }).first();
    await parlayFilterBtn.click();
    await assertControlActive(parlayFilterBtn, "/app/lab filtro Tipo Parlays");
    const pendingFilterBtn = statusFilter.locator("button").filter({ hasText: /Pendientes/i }).first();
    await pendingFilterBtn.click();
    await assertControlActive(pendingFilterBtn, "/app/lab filtro Estado Pendientes");

    const parlayRow = page.locator('[data-record-row="parlay"]').first();
    await expect(parlayRow, "El parlay sellado debe aparecer en /app/lab").toBeVisible();
    const parlayToggle = parlayRow.locator("[data-parlay-legs-toggle]").first();
    if ((await parlayToggle.count()) > 0 && (await parlayToggle.isVisible())) {
      await parlayToggle.click();
      await expect(page.locator("[data-parlay-legs-panel]").first()).toBeVisible();
    }

    const parlayLedgerText = await page.evaluate(() => {
      const row = document.querySelector('[data-record-row="parlay"]');
      const panel = document.querySelector("[data-parlay-legs-panel]");
      const parts: string[] = [];
      if (row instanceof HTMLElement) parts.push(row.innerText);
      if (panel instanceof HTMLElement) parts.push(panel.innerText);
      return parts.join("\n");
    });
    expect(parlayLedgerText).not.toMatch(/Geodesic\s+v2\.0/i);
    expect(parlayLedgerText).not.toMatch(REPEATED_BARE_TOTAL_RE);
    expect(
      parlayLedgerText,
      "El parlay en /app/lab debe mostrar contexto real de equipos/partidos",
    ).toMatch(/\bvs\.?\b|\s[–-]\s/i);
    expect(
      findUnitlessTotalLabels(parlayLedgerText),
      `Totales sin unidad en parlay de /app/lab: "${parlayLedgerText.slice(0, 180)}"`,
    ).toEqual([]);

    for (const ev of extractEvPercentages(labBodyText)) {
      expect(ev, `EV incoherente (${ev}% > 50%) en /app/lab`).toBeLessThanOrEqual(50);
    }

    for (const theme of THEMES) {
      await applyTheme(page, theme);
      await auditTransversalInvariants(page, `/app/lab [${theme}]`, { runAxe: true });
    }

    monitors.assertClean(`/app/picks + /app/lab (${testInfo.project.name})`);
  });
});
