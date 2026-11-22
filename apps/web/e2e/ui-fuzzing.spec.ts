import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

type ThemeMode = "dark" | "light";

interface RouteEntry {
  readonly id: string;
  readonly path: string;
  readonly group: "protected" | "redesign" | "social" | "ola4";
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

interface PageInvariantAudit {
  readonly scrollWidth: number;
  readonly clientWidth: number;
  readonly overflowPx: number;
  readonly viewportWidth: number;
  readonly isMobileViewport: boolean;
  readonly smallButtons: readonly SmallButtonSample[];
  readonly smallInputs: readonly SmallInputSample[];
  readonly fd16Leaks: readonly string[];
  readonly openDialogsCount: number;
  readonly injectedScriptCount: number;
}

interface RuntimeMonitors {
  readonly assertClean: (label: string) => void;
  readonly setAllowExpected404: (allow: boolean) => void;
}

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100").replace(/\/+$/, "");
const THEMES: readonly ThemeMode[] = ["dark", "light"];
const ADVERSARIAL_INPUTS = [
  "",
  "   ",
  "<script>alert(1)</script>",
  "zzzzzz_no_match_9999",
] as const;

const RESIZE_SWEEP_VIEWPORTS: ReadonlyArray<{ readonly width: number; readonly height: number }> = [
  { width: 320, height: 812 },
  { width: 375, height: 812 },
  { width: 768, height: 900 },
  { width: 1440, height: 900 },
];

const REDESIGNED_BATCH_A: readonly RouteEntry[] = [
  { id: "parlays", path: "/app/parlays", group: "redesign" },
  { id: "picks", path: "/app/picks", group: "redesign" },
  { id: "props", path: "/app/props", group: "redesign" },
  { id: "momios", path: "/app/momios", group: "redesign" },
  { id: "comparar", path: "/app/comparar?modo=equipos&liga=liga-mx", group: "redesign" },
  { id: "lab-banca", path: "/app/lab?tab=banca", group: "redesign" },
  { id: "historial", path: "/app/historial", group: "redesign" },
  { id: "perfil-sofia", path: "/app/u/sofia_nfl", group: "redesign" },
  { id: "social", path: "/app/social", group: "social" },
];

const REDESIGNED_BATCH_B: readonly RouteEntry[] = [
  { id: "resultados", path: "/resultados", group: "redesign" },
  { id: "verificacion", path: "/verificacion", group: "redesign" },
  { id: "account-plan", path: "/app/account?tab=plan", group: "redesign" },
  { id: "account-prefs", path: "/app/account?tab=prefs", group: "redesign" },
  { id: "canjear", path: "/app/canjear", group: "redesign" },
  { id: "tipster", path: "/app/tipster", group: "redesign" },
  { id: "motores", path: "/motores", group: "redesign" },
  { id: "tech", path: "/app/tech", group: "redesign" },
  { id: "juego-responsable", path: "/legal/juego-responsable", group: "redesign" },
  { id: "alertas", path: "/app/alertas", group: "ola4" },
];

const RESIZE_REPRESENTATIVE_ROUTES: readonly RouteEntry[] = [
  { id: "app-home", path: "/app", group: "protected" },
  { id: "team-monterrey", path: "/app/liga-mx/t/monterrey", group: "protected" },
  { id: "parlays", path: "/app/parlays", group: "redesign" },
  { id: "picks", path: "/app/picks", group: "redesign" },
  { id: "momios", path: "/app/momios", group: "redesign" },
  { id: "account-prefs", path: "/app/account?tab=prefs", group: "redesign" },
  { id: "social", path: "/app/social", group: "social" },
  { id: "alertas", path: "/app/alertas", group: "ola4" },
  { id: "arbitros-ligamx", path: "/app/liga-mx/arbitros", group: "ola4" },
  { id: "verificacion", path: "/verificacion", group: "redesign" },
];

const DESTRUCTIVE_CONTROL_RE =
  /cerrar sesión|salir|eliminar|borrar|revocar|baja|exportar|descargar|sellar|pagar|comprar|activar pase|iniciar sesión|crear cuenta|reportar|pausar cuenta|bloquear/i;

const SAFE_TOGGLE_BUTTON_SELECTOR = [
  "[data-finder-quick-chips] button[aria-pressed]:not([disabled])",
  "[data-screener-group-mode] button[aria-pressed]:not([disabled])",
  "[data-historial-status-filter] button[aria-pressed]:not([disabled])",
  "[data-record-status-filter] button[aria-pressed]:not([disabled])",
  "[data-record-kind-filter] button[aria-pressed]:not([disabled])",
  "[data-parlay-scope-bar] button[aria-pressed]:not([disabled])",
  "[data-props-filter-bar] button[aria-pressed]:not([disabled])",
  "[data-home-filterbar] button[aria-pressed]:not([disabled])",
  '[role="group"] button[aria-pressed]:not([disabled])',
  "button.pl-rf-toggle-chip:not([disabled])",
].join(", ");

function attachRuntimeMonitors(page: Page): RuntimeMonitors {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const httpErrors: string[] = [];
  const browserDialogs: string[] = [];
  let allowExpected404 = false;

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text().slice(0, 280);
      if (allowExpected404 && /status of 404/i.test(text)) return;
      consoleErrors.push(text);
    }
  });

  page.on("pageerror", (err) => {
    pageErrors.push(err.message.slice(0, 280));
  });

  page.on("response", (res) => {
    if (!res.url().startsWith(ORIGIN)) return;
    const status = res.status();
    if (status >= 500 || status === 401 || status === 403) {
      httpErrors.push(`${status} ${res.url().slice(ORIGIN.length)}`);
    }
  });

  page.on("dialog", async (dialog) => {
    browserDialogs.push(`${dialog.type()}: ${dialog.message()}`);
    await dialog.dismiss();
  });

  return {
    assertClean: (label: string) => {
      expect(consoleErrors, `console.error en ${label}`).toEqual([]);
      expect(pageErrors, `pageerror en ${label}`).toEqual([]);
      expect(httpErrors, `HTTP >=500/401/403 en ${label}`).toEqual([]);
      expect(browserDialogs, `Diálogo JS inesperado (XSS/alert) en ${label}`).toEqual([]);
    },
    setAllowExpected404: (allow: boolean) => {
      allowExpected404 = allow;
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
  expect(unlock.ok(), `POST /api/beta/unlock falló con status ${unlock.status()}`).toBe(true);
}

async function configureProjectViewport(page: Page, projectName: string): Promise<boolean> {
  const isMobile = projectName === "mobile";
  await page.setViewportSize(
    isMobile ? { width: 375, height: 812 } : { width: 1440, height: 900 },
  );
  return isMobile;
}

async function waitForLayoutStable(page: Page): Promise<void> {
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) {
      await Promise.race([
        document.fonts.ready,
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, 2_500);
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
}

async function navigateAndCheckStatus(page: Page, routePath: string): Promise<void> {
  const response = await page.goto(routePath, { waitUntil: "domcontentloaded" });
  const status = response?.status() ?? 200;
  expect(status, `Ruta ${routePath} devolvió HTTP ${status}`).toBeLessThan(400);
  await expect(page.locator("#main")).toBeVisible();
  await waitForLayoutStable(page);
}

async function auditPageInvariants(
  page: Page,
  label: string,
  options: { readonly allowOpenDialog?: boolean } = {},
): Promise<void> {
  await waitForLayoutStable(page);
  const report: PageInvariantAudit = await page.evaluate(() => {
    const root = document.documentElement;
    const scrollWidth = root.scrollWidth;
    const clientWidth = root.clientWidth;
    const overflowPx = Math.max(0, scrollWidth - clientWidth);
    const viewportWidth = window.innerWidth;
    const isMobileViewport = viewportWidth < 768;

    const isElementVisible = (el: Element): boolean => {
      if (
        el.closest(
          "nextjs-portal, [data-nextjs-toast], [hidden], [aria-hidden='true'], dialog:not([open]), [popover]:not(:popover-open)",
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

    const smallButtons: SmallButtonSample[] = [];
    const smallInputs: SmallInputSample[] = [];

    if (isMobileViewport) {
      const buttonNodes = Array.from(document.querySelectorAll('button, [role="button"]'));
      for (const el of buttonNodes) {
        if (!isElementVisible(el)) continue;
        const rect = el.getBoundingClientRect();
        const width = Math.round(rect.width);
        const height = Math.round(rect.height);
        if (width < 44 || height < 44) {
          const rawLabel = (el.getAttribute("aria-label") || el.textContent || "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 60);
          const rawClass = (el.getAttribute("class") || "").trim().slice(0, 80);
          smallButtons.push({
            label: rawLabel || "(icon)",
            className: rawClass,
            width,
            height,
          });
          if (smallButtons.length >= 12) break;
        }
      }

      const inputNodes = Array.from(
        document.querySelectorAll(
          'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]):not([type="reset"]), select, textarea',
        ),
      );
      for (const el of inputNodes) {
        if (!isElementVisible(el)) continue;
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

    const fd16VisiblePattern = /scoutpicks|sofascore|bzzoiro|poisson|dixon/i;
    const fd16AttrPattern = /sofascore|scoutpicks/i;
    const fd16Leaks: string[] = [];
    const visibleText = document.body?.innerText ?? "";
    const visibleMatch = visibleText.match(fd16VisiblePattern);
    if (visibleMatch) {
      fd16Leaks.push(`visible-text:${visibleMatch[0]}`);
    }

    const allNodes = Array.from(document.querySelectorAll("*"));
    for (const el of allNodes) {
      if (fd16Leaks.length >= 10) break;
      const cls = el.getAttribute("class") ?? "";
      if (cls && fd16AttrPattern.test(cls)) {
        fd16Leaks.push(`class:${el.tagName.toLowerCase()}.${cls.slice(0, 60)}`);
      }
      const ariaLabel = el.getAttribute("aria-label") ?? "";
      if (ariaLabel && fd16AttrPattern.test(ariaLabel)) {
        fd16Leaks.push(`aria-label:${ariaLabel.slice(0, 60)}`);
      }
      for (const attr of Array.from(el.attributes)) {
        if (
          attr.name.startsWith("data-") &&
          (fd16AttrPattern.test(attr.name) || fd16AttrPattern.test(attr.value))
        ) {
          fd16Leaks.push(`data:${attr.name}=${attr.value.slice(0, 60)}`);
          break;
        }
      }
    }

    const injectedScriptCount = Array.from(document.querySelectorAll("script")).filter((node) =>
      (node.textContent ?? "").includes("alert(1)"),
    ).length;

    return {
      scrollWidth,
      clientWidth,
      overflowPx,
      viewportWidth,
      isMobileViewport,
      smallButtons,
      smallInputs,
      fd16Leaks,
      openDialogsCount: document.querySelectorAll("dialog[open]").length,
      injectedScriptCount,
    };
  });

  expect(
    report.scrollWidth,
    `Overflow horizontal (${report.overflowPx}px: scrollWidth=${report.scrollWidth} > clientWidth=${report.clientWidth}) en ${label}`,
  ).toBeLessThanOrEqual(report.clientWidth);

  if (report.isMobileViewport) {
    expect(
      report.smallButtons,
      `Botones < 44px en móvil (${report.viewportWidth}px) en ${label}`,
    ).toEqual([]);
    expect(
      report.smallInputs,
      `Inputs/selects < 16px en móvil (${report.viewportWidth}px) en ${label}`,
    ).toEqual([]);
  }

  expect(
    report.fd16Leaks,
    `Fuga FD-16 (/scoutpicks|sofascore|bzzoiro|poisson|dixon/i) en DOM/texto visible en ${label}`,
  ).toEqual([]);
  expect(report.injectedScriptCount, `Script XSS inyectado en ${label}`).toBe(0);

  if (!options.allowOpenDialog) {
    expect(report.openDialogsCount, `<dialog open> trabado en ${label}`).toBe(0);
  }
}

async function discoverFirstMatchPath(page: Page): Promise<string> {
  const findHref = async (): Promise<string | null> =>
    await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href^="/app/"][href*="/g/"]'));
      for (const el of links) {
        const href = el.getAttribute("href");
        if (!href || !/^\/app\/[a-z0-9-]+\/g\/[a-z0-9-]+/.test(href)) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          return href;
        }
      }
      return null;
    });

  const direct = await findHref();
  if (direct) return direct;

  const dayJump = page.locator("[data-day-empty] [data-day-jump]").first();
  if ((await dayJump.count()) > 0 && (await dayJump.isVisible())) {
    await dayJump.click();
    await waitForLayoutStable(page);
    const jumped = await findHref();
    if (jumped) return jumped;
  }

  await navigateAndCheckStatus(page, "/app/picks");
  const fromPicks = await findHref();
  expect(fromPicks, "No se descubrió ningún partido real /app/<league>/g/<slug>").not.toBeNull();
  return fromPicks!;
}

async function discoverFirstRefereePath(page: Page): Promise<string> {
  const discovered = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href^="/app/liga-mx/r/"]'));
    for (const el of links) {
      const href = el.getAttribute("href");
      if (!href || !/^\/app\/[a-z0-9-]+\/r\/[a-z0-9-]+/.test(href)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return href;
      }
    }
    return null;
  });
  expect(
    discovered,
    "No se descubrió ningún perfil arbitral /app/liga-mx/r/<slug> en /app/liga-mx/arbitros",
  ).not.toBeNull();
  return discovered!;
}

async function exerciseSafeRouteControls(
  page: Page,
  routeLabel: string,
  monitors: RuntimeMonitors,
): Promise<void> {
  const main = page.locator("#main");

  const tabLists = main.locator('[role="tablist"]');
  const tabListCount = await tabLists.count();
  let primaryTabList: Locator | null = null;
  for (let i = 0; i < tabListCount; i += 1) {
    const candidate = tabLists.nth(i);
    if (await candidate.isVisible()) {
      primaryTabList = candidate;
      break;
    }
  }

  if (primaryTabList !== null) {
    const rawTabs = primaryTabList.locator('[role="tab"]:not([disabled])');
    const rawTabCount = await rawTabs.count();
    const visibleTabs: Locator[] = [];
    for (let idx = 0; idx < rawTabCount && visibleTabs.length < 4; idx += 1) {
      const candidate = rawTabs.nth(idx);
      if (await candidate.isVisible()) {
        visibleTabs.push(candidate);
      }
    }
    if (visibleTabs.length > 1) {
      let initialSelectedIndex = 0;
      for (let idx = 0; idx < visibleTabs.length; idx += 1) {
        const selected = await visibleTabs[idx].getAttribute("aria-selected");
        if (selected === "true") {
          initialSelectedIndex = idx;
          break;
        }
      }
      for (let idx = 0; idx < visibleTabs.length; idx += 1) {
        if (idx === initialSelectedIndex) continue;
        const tab = visibleTabs[idx];
        const tabText = ((await tab.textContent()) ?? `tab-${idx}`).trim();
        await tab.click();
        await expect(tab).toHaveAttribute("aria-selected", "true");
        await auditPageInvariants(page, `${routeLabel} · tab(${tabText})`);
        monitors.assertClean(`${routeLabel} · tab(${tabText})`);
      }
      await visibleTabs[initialSelectedIndex].click();
      await expect(visibleTabs[initialSelectedIndex]).toHaveAttribute("aria-selected", "true");
    }
  }

  const toggleCandidates = main.locator(SAFE_TOGGLE_BUTTON_SELECTOR);
  const toggleCount = await toggleCandidates.count();
  let toggledCount = 0;
  for (let idx = 0; idx < toggleCount && toggledCount < 2; idx += 1) {
    const btn = toggleCandidates.nth(idx);
    if (!(await btn.isVisible())) continue;
    const accessibleLabel = (
      (await btn.getAttribute("aria-label")) ??
      (await btn.textContent()) ??
      ""
    ).trim();
    if (DESTRUCTIVE_CONTROL_RE.test(accessibleLabel)) continue;
    const beforePressed = await btn.getAttribute("aria-pressed");
    if (beforePressed === "true") continue;
    await btn.click();
    await auditPageInvariants(page, `${routeLabel} · chip(${accessibleLabel || idx})`);
    monitors.assertClean(`${routeLabel} · chip(${accessibleLabel || idx})`);
    toggledCount += 1;
  }

  const paginationCandidates = main
    .locator("button:not([disabled])")
    .filter({ hasText: /^(?:mostrar más|ver más|cargar más)/i });
  const paginationCount = await paginationCandidates.count();
  for (let idx = 0; idx < paginationCount; idx += 1) {
    const pagerBtn = paginationCandidates.nth(idx);
    if (!(await pagerBtn.isVisible())) continue;
    const pagerText = ((await pagerBtn.textContent()) ?? "pagination").trim();
    await pagerBtn.click();
    await auditPageInvariants(page, `${routeLabel} · pager(${pagerText})`);
    monitors.assertClean(`${routeLabel} · pager(${pagerText})`);
    break;
  }
}

async function sweepRouteBothThemes(
  page: Page,
  route: RouteEntry,
  monitors: RuntimeMonitors,
  options: { readonly exerciseControls?: boolean } = {},
): Promise<void> {
  await navigateAndCheckStatus(page, route.path);

  for (const theme of THEMES) {
    await applyTheme(page, theme);
    await auditPageInvariants(page, `${route.id} (${route.path}) [${theme}]`);
    monitors.assertClean(`${route.id} (${route.path}) [${theme}]`);
  }

  if (options.exerciseControls) {
    await exerciseSafeRouteControls(page, route.id, monitors);
  }
}

async function fuzzSearchInput(
  page: Page,
  input: Locator,
  label: string,
  monitors: RuntimeMonitors,
): Promise<void> {
  await expect(input).toBeVisible();
  for (const payload of ADVERSARIAL_INPUTS) {
    await input.fill(payload);
    await expect(input).toHaveValue(payload);
    await auditPageInvariants(page, `${label} · input(${JSON.stringify(payload)})`);
    monitors.assertClean(`${label} · input(${JSON.stringify(payload)})`);
  }
}

test.describe("Ola 5 · Adversarial UI Fuzzing across Redesigned, Social, Ola 4 and Protected Zone", () => {
  test("1. Barrido integral Zona Protegida + Rediseño Parte A + Social (dark & light, tabs, chips, paginación)", async ({
    page,
  }, testInfo) => {
    test.setTimeout(150_000);
    await configureProjectViewport(page, testInfo.project.name);
    const monitors = attachRuntimeMonitors(page);
    await unlockBetaSession(page);

    await navigateAndCheckStatus(page, "/app");
    const discoveredMatchPath = await discoverFirstMatchPath(page);

    await sweepRouteBothThemes(
      page,
      { id: "app-home", path: "/app", group: "protected" },
      monitors,
      { exerciseControls: true },
    );

    await sweepRouteBothThemes(
      page,
      { id: "team-monterrey", path: "/app/liga-mx/t/monterrey", group: "protected" },
      monitors,
      { exerciseControls: true },
    );

    await sweepRouteBothThemes(
      page,
      { id: "match-detail", path: discoveredMatchPath, group: "protected" },
      monitors,
      { exerciseControls: true },
    );

    for (const route of REDESIGNED_BATCH_A) {
      await sweepRouteBothThemes(page, route, monitors, { exerciseControls: true });
    }

    monitors.assertClean(`Batch A final (${testInfo.project.name})`);
  });

  test("2. Barrido integral Rediseño Parte B + Públicas + Ola 4 (dark & light, tabs, chips, paginación)", async ({
    page,
  }, testInfo) => {
    test.setTimeout(150_000);
    await configureProjectViewport(page, testInfo.project.name);
    const monitors = attachRuntimeMonitors(page);
    await unlockBetaSession(page);

    for (const route of REDESIGNED_BATCH_B) {
      await sweepRouteBothThemes(page, route, monitors, { exerciseControls: true });
    }

    await navigateAndCheckStatus(page, "/app/liga-mx/arbitros");
    const discoveredRefereePath = await discoverFirstRefereePath(page);

    await sweepRouteBothThemes(
      page,
      { id: "arbitros-ligamx", path: "/app/liga-mx/arbitros", group: "ola4" },
      monitors,
      { exerciseControls: true },
    );

    await sweepRouteBothThemes(
      page,
      { id: "referee-profile", path: discoveredRefereePath, group: "ola4" },
      monitors,
      { exerciseControls: true },
    );

    monitors.setAllowExpected404(true);
    const adminResponse = await page.goto("/app/admin", { waitUntil: "domcontentloaded" });
    const adminStatus = adminResponse?.status() ?? 200;
    expect(
      adminStatus === 404 || adminStatus === 200,
      `Ruta /app/admin bajo PIN beta devolvió HTTP inesperado ${adminStatus}`,
    ).toBe(true);
    await expect(page.locator(".pl-notfound")).toBeVisible();
    await expect(page.locator(".pl-notfound")).toContainText("404");
    await expect(page.getByRole("heading", { name: /Consola del fundador/i })).toHaveCount(0);
    await expect(page.locator("[data-data-health-panel]")).toHaveCount(0);
    await expect(page.locator("[data-admin-security-abuse-panel]")).toHaveCount(0);
    for (const theme of THEMES) {
      await applyTheme(page, theme);
      await auditPageInvariants(page, `/app/admin RBAC 404 [${theme}]`);
      monitors.assertClean(`/app/admin RBAC 404 [${theme}]`);
    }
    monitors.setAllowExpected404(false);

    monitors.assertClean(`Batch B final (${testInfo.project.name})`);
  });

  test("3. Entradas extremas, vacías y XSS en /app/picks, /app/alertas, /verificacion y /app/liga-mx/arbitros", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await configureProjectViewport(page, testInfo.project.name);
    const monitors = attachRuntimeMonitors(page);
    await unlockBetaSession(page);

    await navigateAndCheckStatus(page, "/app/picks");
    const picksSearch = page
      .locator('#main input[type="search"]:visible, #main input.pl-sf-search-input:visible')
      .first();
    await fuzzSearchInput(page, picksSearch, "/app/picks search", monitors);
    const resultCountBadge = page.locator("[data-screener-result-count]");
    if ((await resultCountBadge.count()) > 0 && (await resultCountBadge.isVisible())) {
      await expect(resultCountBadge).toContainText(/^0\s+picks?/i);
    } else {
      await expect(page.locator("[data-picks-row]")).toHaveCount(0);
    }
    const clearPicksSearch = page.locator("#main .pl-sf-search-clear").first();
    if ((await clearPicksSearch.count()) > 0 && (await clearPicksSearch.isVisible())) {
      await clearPicksSearch.click();
    } else {
      await picksSearch.fill("");
    }
    await expect(picksSearch).toHaveValue("");
    await auditPageInvariants(page, "/app/picks tras limpiar búsqueda");

    await navigateAndCheckStatus(page, "/app/alertas");
    const alertsSearch = page.locator("#main input.pl-sf-search-input").first();
    await fuzzSearchInput(page, alertsSearch, "/app/alertas filter-search", monitors);
    await alertsSearch.fill("");

    const copilotInput = page.locator("#main input.pl-al-copilot-input").first();
    const copilotSubmit = page.locator("#main button.pl-al-copilot-submit").first();
    await expect(copilotInput).toBeVisible();
    for (const payload of ADVERSARIAL_INPUTS) {
      await copilotInput.fill(payload);
      await copilotSubmit.click();
      await auditPageInvariants(page, `/app/alertas copilot(${JSON.stringify(payload)})`);
      monitors.assertClean(`/app/alertas copilot(${JSON.stringify(payload)})`);
    }

    const draftCard = page.locator("[data-alert-draft-card]");
    if ((await draftCard.count()) > 0 && (await draftCard.isVisible())) {
      await draftCard.getByRole("button", { name: "Cerrar", exact: true }).click();
      await expect(draftCard).toHaveCount(0);
    }

    await navigateAndCheckStatus(page, "/verificacion");
    const jsonTextarea = page.locator("[data-ver-json-input]");
    const hashInput = page.locator("[data-ver-hash-input]");
    const verifyBtn = page.locator("[data-ver-submit]");
    await expect(jsonTextarea).toBeVisible();

    for (const badPayload of [...ADVERSARIAL_INPUTS, "{invalid json!!!"]) {
      await jsonTextarea.fill(badPayload);
      await hashInput.fill("not-a-valid-sha256-hex");
      await verifyBtn.click();
      await expect(page.locator('#main [role="alert"]').first()).toBeVisible();
      await auditPageInvariants(page, `/verificacion invalid(${JSON.stringify(badPayload)})`);
      monitors.assertClean(`/verificacion invalid(${JSON.stringify(badPayload)})`);
    }

    await jsonTextarea.fill("{invalid json!!!");
    await hashInput.fill("");
    await verifyBtn.click();
    await expect(page.locator('[data-ver-outcome="computed"]')).toBeVisible();
    await expect(page.locator("[data-ver-computed-hash]")).toHaveText(/^[0-9a-f]{64}$/);

    await page.locator("[data-ver-example-tampered]").click();
    await expect(page.locator('[data-ver-outcome="mismatch"]')).toBeVisible();

    await page.locator("[data-ver-example-valid]").click();
    await expect(page.locator('[data-ver-outcome="match"]')).toBeVisible();
    await expect(page.locator("[data-ver-computed-hash]")).toHaveText(/^[0-9a-f]{64}$/);

    const fieldsTab = page.locator('[data-verification-surface] [data-pl-sf-tab="fields"]');
    const jsonTab = page.locator('[data-verification-surface] [data-pl-sf-tab="json"]');
    await fieldsTab.click();
    await expect(fieldsTab).toHaveAttribute("aria-selected", "true");
    await auditPageInvariants(page, "/verificacion tab(fields)");
    await jsonTab.click();
    await expect(jsonTab).toHaveAttribute("aria-selected", "true");

    await applyTheme(page, "light");
    await auditPageInvariants(page, "/verificacion [light]");
    await applyTheme(page, "dark");

    await navigateAndCheckStatus(page, "/app/liga-mx/arbitros");
    const refSearch = page.locator("#main input.pl-sf-search-input").first();
    await fuzzSearchInput(page, refSearch, "/app/liga-mx/arbitros search", monitors);
    const resetRefBtn = page
      .locator("[data-pl-sf-empty] button")
      .filter({ hasText: /restablecer filtros/i })
      .first();
    if ((await resetRefBtn.count()) > 0 && (await resetRefBtn.isVisible())) {
      await resetRefBtn.click();
      await expect(refSearch).toHaveValue("");
    } else {
      await refSearch.fill("");
    }
    await auditPageInvariants(page, "/app/liga-mx/arbitros tras restablecer");

    monitors.assertClean(`Adversarial inputs final (${testInfo.project.name})`);
  });

  test("4. Dobles clics rápidos sobre toggles de parlay, tabs y hojas interactivas", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const isMobile = await configureProjectViewport(page, testInfo.project.name);
    const monitors = attachRuntimeMonitors(page);
    await unlockBetaSession(page);

    await navigateAndCheckStatus(page, "/app/parlays");
    const autoTab = page.locator('[data-parlay-mode-tabs] [data-pl-sf-tab="auto"]');
    const manualTab = page.locator('[data-parlay-mode-tabs] [data-pl-sf-tab="manual"]');
    await expect(manualTab).toBeVisible();

    await manualTab.dblclick();
    await expect(manualTab).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("[data-parlay-manual-panel]")).toBeVisible();
    await autoTab.dblclick();
    await expect(autoTab).toHaveAttribute("aria-selected", "true");
    await manualTab.click();
    await expect(page.locator("[data-parlay-manual-panel]")).toBeVisible();

    const firstUnlockedToggle = page
      .locator("[data-parlay-manual-panel] button[data-pick-toggle]:not([data-pick-blocked])")
      .first();
    if ((await firstUnlockedToggle.count()) > 0 && (await firstUnlockedToggle.isVisible())) {
      await firstUnlockedToggle.dblclick();
      await expect(firstUnlockedToggle).toContainText(/Agregar|En boleto/i);

      const postDblText = ((await firstUnlockedToggle.textContent()) ?? "").trim();
      if (/Agregar/i.test(postDblText)) {
        await firstUnlockedToggle.click();
        await expect(firstUnlockedToggle).toContainText(/En boleto/i);
      }

      if (isMobile) {
        const parlayFabBtn = page.locator("[data-mobile-parlay-fab] button").first();
        if ((await parlayFabBtn.count()) > 0 && (await parlayFabBtn.isVisible())) {
          await parlayFabBtn.click();
          const parlaySheet = page.locator("dialog[data-mobile-parlay-sheet][open]");
          await expect(parlaySheet).toBeVisible();
          await auditPageInvariants(page, "/app/parlays mobile-parlay-sheet open", {
            allowOpenDialog: true,
          });
          await page.keyboard.press("Escape");
          await expect(page.locator("dialog[open]")).toHaveCount(0);
        }
      }

      await firstUnlockedToggle.click();
      await expect(firstUnlockedToggle).toContainText(/Agregar/i);
    }

    await auditPageInvariants(page, "/app/parlays tras dobles clics");

    await navigateAndCheckStatus(page, "/app/picks");
    const legacyTimingTabs = page.locator('[data-screener-timing] [role="tab"]:not([disabled])');
    const timingTabs =
      (await legacyTimingTabs.count()) > 0
        ? legacyTimingTabs
        : page.locator('#main [role="tablist"]').first().locator('[role="tab"]:not([disabled])');
    const timingCount = await timingTabs.count();
    expect(timingCount, "Debe haber al menos 2 pestañas activas en /app/picks").toBeGreaterThanOrEqual(2);
    for (let idx = 0; idx < timingCount; idx += 1) {
      const tab = timingTabs.nth(idx);
      if (!(await tab.isVisible())) continue;
      await tab.dblclick();
      await expect(tab).toHaveAttribute("aria-selected", "true");
    }
    await auditPageInvariants(page, "/app/picks tras dobles clics en tabs");

    await navigateAndCheckStatus(page, "/app/account?tab=plan");
    const accountTabs = page.locator('#main [role="tablist"]').first().locator('[role="tab"]');
    const accountTabCount = await accountTabs.count();
    expect(
      accountTabCount,
      "Debe haber al menos 3 pestañas en /app/account",
    ).toBeGreaterThanOrEqual(3);
    for (let idx = 0; idx < accountTabCount; idx += 1) {
      const tab = accountTabs.nth(idx);
      await tab.dblclick();
      await expect(tab).toHaveAttribute("aria-selected", "true");
      await auditPageInvariants(page, `/app/account double-click tab(${idx})`);
    }

    await navigateAndCheckStatus(page, "/app/lab?tab=banca");
    const recordTabs = page.locator('#main [role="tablist"]').first().locator('[role="tab"]');
    const recordTabCount = await recordTabs.count();
    expect(recordTabCount, "Debe haber al menos 3 pestañas en /app/lab").toBeGreaterThanOrEqual(3);
    for (let idx = 0; idx < recordTabCount; idx += 1) {
      const tab = recordTabs.nth(idx);
      await tab.dblclick();
      await expect(tab).toHaveAttribute("aria-selected", "true");
      await auditPageInvariants(page, `/app/lab double-click tab(${idx})`);
    }

    monitors.assertClean(`Double-click stress final (${testInfo.project.name})`);
  });

  test("5. Apertura y cierre de diálogos, drawers y hojas (Cmd+K, Filtros, Maestro-Detalle, Bet Lab, Explorar) con 0 <dialog open> trabados", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const isMobile = await configureProjectViewport(page, testInfo.project.name);
    const monitors = attachRuntimeMonitors(page);
    await unlockBetaSession(page);

    await navigateAndCheckStatus(page, "/app");

    if (!isMobile) {
      const masterDetail = page.locator("[data-home-master-detail]");
      if ((await masterDetail.count()) > 0 && (await masterDetail.isVisible())) {
        const secondMasterCard = page
          .locator('[data-home-master-list] [data-game-card][data-game-id][data-selected="false"]')
          .first();
        if ((await secondMasterCard.count()) > 0 && (await secondMasterCard.isVisible())) {
          const openTrigger = secondMasterCard.locator("[data-card-open]").first();
          if ((await openTrigger.count()) > 0 && (await openTrigger.isVisible())) {
            await openTrigger.click();
          } else {
            await secondMasterCard.click();
          }
          await expect(secondMasterCard).toHaveAttribute("data-selected", "true");
          await expect(page.locator("[data-home-detail-panel]")).toBeVisible();
          await auditPageInvariants(page, "/app Maestro-Detalle tras cambio de partido");
          monitors.assertClean("/app Maestro-Detalle tras cambio de partido");
        }

        const parlayModeBtn = page.locator('[data-home-right-mode="parlay"]:visible').first();
        const matchModeBtn = page.locator('[data-home-right-mode="match"]:visible').first();
        if ((await parlayModeBtn.count()) > 0) {
          await parlayModeBtn.click();
          await auditPageInvariants(page, "/app Maestro-Detalle modo parlay");
          monitors.assertClean("/app Maestro-Detalle modo parlay");
          if ((await matchModeBtn.count()) > 0) {
            await matchModeBtn.click();
            await expect(page.locator("[data-home-detail-panel]")).toBeVisible();
          }
        }
      }
    }

    await page.keyboard.press("Control+k");
    const cmdkDialog = page.locator("dialog.pl-cmd-dialog[open]");
    await expect(cmdkDialog).toBeVisible();
    const cmdkRefTab = cmdkDialog.locator('[data-pl-sf-tab="referees"]');
    if ((await cmdkRefTab.count()) > 0 && (await cmdkRefTab.isVisible())) {
      await cmdkRefTab.click();
      await expect(cmdkRefTab).toHaveAttribute("aria-selected", "true");
    }
    const cmdkInput = cmdkDialog.locator("input.pl-cmd-input");
    await cmdkInput.fill("<script>alert(1)</script>");
    await expect(cmdkInput).toHaveValue("<script>alert(1)</script>");
    await cmdkInput.fill("zzzzzz_no_match_9999");
    await auditPageInvariants(page, "/app Cmd+K abierto", { allowOpenDialog: true });
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);

    const homeFiltersTrigger = page.locator("[data-home-filters-trigger]:visible").first();
    if ((await homeFiltersTrigger.count()) > 0) {
      await homeFiltersTrigger.click();
      const filtersDialog = page.locator("dialog.pl-home-fmodal-dialog[open]");
      await expect(filtersDialog).toBeVisible();
      await auditPageInvariants(page, "/app HomeFiltersModal abierto", { allowOpenDialog: true });
      await page.keyboard.press("Escape");
      await expect(page.locator("dialog[open]")).toHaveCount(0);

      await homeFiltersTrigger.click();
      await expect(filtersDialog).toBeVisible();
      await filtersDialog.getByRole("button", { name: "Cerrar filtros" }).click();
      await expect(page.locator("dialog[open]")).toHaveCount(0);
    }

    if (isMobile) {
      const moreTrigger = page.locator("[data-mobile-more-trigger]:visible").first();
      await expect(moreTrigger).toBeVisible();
      await moreTrigger.click();
      const moreDialog = page.getByRole("dialog", { name: "Explorar" });
      await expect(moreDialog).toBeVisible();
      await auditPageInvariants(page, "/app hoja Explorar abierta", { allowOpenDialog: true });
      await page.keyboard.press("Escape");
      await expect(page.locator("dialog[open]")).toHaveCount(0);
    }

    await navigateAndCheckStatus(page, "/app/picks");

    const openBetLab = async (): Promise<void> => {
      const firstRow = page.locator("[data-picks-row]:visible").first();
      if ((await firstRow.count()) > 0) {
        await firstRow.click({ position: { x: 24, y: 24 } });
        return;
      }
      const potdAnalyze = page.locator("[data-picks-potd-analyze]:visible").first();
      await expect(potdAnalyze).toBeVisible({ timeout: 15_000 });
      await potdAnalyze.click();
    };

    const labDrawer = page.locator("[data-pick-lab-drawer]");
    await openBetLab();
    await expect(labDrawer).toBeVisible({ timeout: 15_000 });
    await expect(labDrawer.locator("[data-pick-lab-chart]")).toBeVisible();
    await expect(labDrawer.locator("[data-pick-lab-builder]")).toBeVisible();
    await auditPageInvariants(page, "/app/picks PickEvidenceLabDrawer abierto [dark]", {
      allowOpenDialog: true,
    });
    await page.keyboard.press("Escape");
    await expect(labDrawer).toBeHidden();
    await expect(page.locator("dialog[open]")).toHaveCount(0);

    await applyTheme(page, "light");
    await openBetLab();
    await expect(labDrawer).toBeVisible({ timeout: 15_000 });
    await auditPageInvariants(page, "/app/picks PickEvidenceLabDrawer abierto [light]", {
      allowOpenDialog: true,
    });
    await labDrawer.locator("[data-pick-lab-close]").click();
    await expect(labDrawer).toBeHidden();
    await expect(page.locator("dialog[open]")).toHaveCount(0);

    if (isMobile) {
      const mobileFilterToggle = page
        .locator("[data-picks-mobile-filters-trigger]:visible, [data-mobile-filters-toggle]:visible")
        .first();
      await expect(mobileFilterToggle).toBeVisible();
      await mobileFilterToggle.click();
      const mobileFilterSheet = page.locator('dialog[open], [role="dialog"]:visible').last();
      await expect(mobileFilterSheet).toBeVisible();
      await auditPageInvariants(page, "/app/picks hoja filtros móvil abierta", {
        allowOpenDialog: true,
      });
      await page.keyboard.press("Escape");
      await expect(page.locator("dialog[open]")).toHaveCount(0);
    }

    await auditPageInvariants(page, "/app/picks final sin diálogos");
    monitors.assertClean(`Dialogs & drawers final (${testInfo.project.name})`);
  });

  test("6. Estrés de redimensionado 320px → 375px → 768px → 1440px (dark & light) en rutas representativas", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "El barrido de redimensionado cubre 320px..1440px en una sola pasada desde el proyecto desktop.",
    );
    test.setTimeout(150_000);
    const monitors = attachRuntimeMonitors(page);
    await unlockBetaSession(page);

    for (const route of RESIZE_REPRESENTATIVE_ROUTES) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await navigateAndCheckStatus(page, route.path);

      for (const theme of THEMES) {
        await applyTheme(page, theme);
        for (const vp of RESIZE_SWEEP_VIEWPORTS) {
          await page.setViewportSize(vp);
          await auditPageInvariants(page, `${route.id} @ ${vp.width}x${vp.height} [${theme}]`);
          monitors.assertClean(`${route.id} @ ${vp.width}x${vp.height} [${theme}]`);
        }
      }
    }
  });
});
