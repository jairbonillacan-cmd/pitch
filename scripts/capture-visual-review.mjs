import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CORE_ROUTES = [
  { slug: "app-home", path: "/app", group: "protected", label: "Inicio /app" },
  { slug: "team-monterrey", path: "/app/liga-mx/t/monterrey", group: "protected", label: "Equipo Monterrey" },
  { slug: "parlays", path: "/app/parlays", group: "redesign", label: "Parlays" },
  { slug: "picks", path: "/app/picks", group: "redesign", label: "Picks" },
  { slug: "props", path: "/app/props", group: "redesign", label: "Props" },
  { slug: "momios", path: "/app/momios", group: "redesign", label: "Momios" },
  {
    slug: "comparar-equipos",
    path: "/app/comparar?modo=equipos&liga=liga-mx",
    group: "redesign",
    label: "Comparar H2H (Equipos)",
  },
  { slug: "lab-banca", path: "/app/lab?tab=banca", group: "redesign", label: "Mi récord · Banca" },
  { slug: "historial", path: "/app/historial", group: "redesign", label: "Historial" },
  { slug: "perfil-club", path: "/app/u/sofia_nfl", group: "redesign", label: "Perfil club @sofia_nfl" },
  { slug: "resultados", path: "/resultados", group: "redesign", label: "Resultados" },
  { slug: "account-plan", path: "/app/account?tab=plan", group: "redesign", label: "Cuenta · Plan" },
  { slug: "account-prefs", path: "/app/account?tab=prefs", group: "redesign", label: "Cuenta · Preferencias" },
  { slug: "tipster", path: "/app/tipster", group: "redesign", label: "Portal Tipster" },
  { slug: "admin", path: "/app/admin", group: "redesign", label: "Consola Admin" },
  { slug: "motores", path: "/motores", group: "redesign", label: "Motores (Público)" },
  { slug: "tech", path: "/app/tech", group: "redesign", label: "Cómo calculamos (Club)" },
  {
    slug: "juego-responsable",
    path: "/legal/juego-responsable",
    group: "redesign",
    label: "Juego responsable",
  },
  { slug: "social", path: "/app/social", group: "social", label: "Social" },
];

const POST_OLA3_EXTRA_ROUTES = [
  { slug: "verificacion", path: "/verificacion", group: "redesign", label: "Verificación SHA-256" },
  { slug: "alertas", path: "/app/alertas", group: "ola4", label: "Alertas de Mercado" },
  { slug: "arbitros-ligamx", path: "/app/liga-mx/arbitros", group: "ola4", label: "Árbitros Liga MX" },
];

const THEMES = ["dark", "light"];

function parseCliArgs(argv) {
  const opts = {
    phase: "before",
    baseUrl: "http://127.0.0.1:6420",
    outDir: "",
    pin: (process.env.PITCHLAB_BETA_CODE ?? "2026").trim() || "2026",
    includeOla4: false,
  };
  for (const arg of argv) {
    if (arg.startsWith("--phase=")) {
      const raw = arg.slice("--phase=".length).trim().toLowerCase();
      if (raw === "before" || raw === "after") {
        opts.phase = raw;
      }
    } else if (arg.startsWith("--base-url=")) {
      opts.baseUrl = arg.slice("--base-url=".length).trim().replace(/\/+$/, "");
    } else if (arg.startsWith("--out-dir=")) {
      opts.outDir = arg.slice("--out-dir=".length).trim();
    } else if (arg.startsWith("--pin=")) {
      opts.pin = arg.slice("--pin=".length).trim();
    } else if (arg === "--include-ola4") {
      opts.includeOla4 = true;
    }
  }
  const parsedUrl = new URL(opts.baseUrl);
  if (parsedUrl.hostname !== "127.0.0.1" && parsedUrl.hostname !== "localhost") {
    throw new Error(`--base-url debe apuntar a loopback (127.0.0.1 o localhost), recibido: ${opts.baseUrl}`);
  }
  if (!opts.outDir) {
    opts.outDir = path.join(os.tmpdir(), "pitchlab-visual-review", opts.phase);
  }
  return opts;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServerReady(baseUrl, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  let lastError = "sin respuesta";
  while (Date.now() < deadline) {
    attempt += 1;
    for (const probePath of ["/api/health", "/"]) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6_000);
        const res = await fetch(`${baseUrl}${probePath}`, { signal: controller.signal });
        clearTimeout(timer);
        if (res.status === 200) {
          console.log(`[health] ${probePath} -> 200 OK (intento ${attempt})`);
          return;
        }
        lastError = `${probePath} HTTP ${res.status}`;
      } catch (err) {
        lastError = `${probePath}: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    await sleep(Math.min(2_500, 500 * attempt));
  }
  throw new Error(`Servidor en ${baseUrl} no respondió 200 en ${timeoutMs}ms (${lastError})`);
}

async function unlockBeta(context, baseUrl, pin) {
  const uniqueIp = `198.51.${Math.floor(Math.random() * 200) + 10}.${Math.floor(Math.random() * 200) + 10}`;
  const res = await context.request.post(`${baseUrl}/api/beta/unlock`, {
    headers: {
      origin: baseUrl,
      "x-forwarded-for": uniqueIp,
    },
    data: { code: pin, next: "/app" },
  });
  const bodyText = await res.text();
  if (!res.ok()) {
    throw new Error(`Fallo al desbloquear PIN beta: HTTP ${res.status()} ${bodyText}`);
  }
  console.log(`[auth] PIN beta desbloqueado (${res.status()})`);
  return await context.cookies();
}

async function applyTheme(page, theme) {
  await page.evaluate(async (next) => {
    const root = document.documentElement;
    root.dataset.themeSwitching = "true";
    root.dataset.theme = next;
    root.style.colorScheme = next;
    try {
      window.localStorage.setItem("pl-theme", next);
    } catch (err) {
      void err;
    }
    void root.offsetHeight;
    delete root.dataset.themeSwitching;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, theme);
  await page.waitForTimeout(300);
}

async function waitForPageSettled(page, routePath) {
  const isClub = routePath === "/app" || routePath.startsWith("/app/");
  if (isClub) {
    await page
      .waitForFunction(() => document.documentElement.dataset.plHydrated === "1", null, {
        timeout: 25_000,
      })
      .catch((err) => {
        void err;
      });
  }
  await page
    .evaluate(async () => {
      if (document.fonts && document.fonts.ready) {
        await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3_000))]);
      }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    })
    .catch((err) => {
      void err;
    });
  await page.waitForTimeout(500);
}

async function collectDomMetrics(page, isMobile) {
  return await page.evaluate((mobileFlag) => {
    const root = document.documentElement;
    const scrollWidth = root.scrollWidth;
    const clientWidth = root.clientWidth;
    const overflowPx = Math.max(0, scrollWidth - clientWidth);
    const h1El = document.querySelector("h1");
    const h1Text = h1El ? (h1El.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120) : null;
    const isElementVisible = (el) => {
      if (el.closest("nextjs-portal, [data-nextjs-toast], [hidden], [aria-hidden='true'], dialog:not([open])")) {
        return false;
      }
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || Number.parseFloat(style.opacity) === 0) {
        return false;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) return false;
      return true;
    };

    const buttonNodes = Array.from(document.querySelectorAll('button, [role="button"]'));
    let visibleButtons = 0;
    let buttonsUnder44 = 0;
    let buttonsHeightUnder44 = 0;
    const smallButtonSamples = [];
    for (const el of buttonNodes) {
      if (!isElementVisible(el)) continue;
      visibleButtons += 1;
      const rect = el.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      const underAny = w < 44 || h < 44;
      if (underAny) buttonsUnder44 += 1;
      if (h < 44) buttonsHeightUnder44 += 1;
      if (mobileFlag && underAny && smallButtonSamples.length < 15) {
        const label = (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 50);
        const cls = typeof el.className === "string" ? el.className.trim().slice(0, 80) : "";
        smallButtonSamples.push({ label: label || "(icon)", className: cls, width: w, height: h });
      }
    }

    let inputsUnder16px = 0;
    const smallInputSamples = [];
    if (mobileFlag) {
      const inputNodes = Array.from(
        document.querySelectorAll(
          'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea',
        ),
      );
      for (const el of inputNodes) {
        if (!isElementVisible(el)) continue;
        const fs = Number.parseFloat(window.getComputedStyle(el).fontSize || "16");
        if (Number.isFinite(fs) && fs < 15.9) {
          inputsUnder16px += 1;
          if (smallInputSamples.length < 10) {
            smallInputSamples.push({
              tag: el.tagName.toLowerCase(),
              className: typeof el.className === "string" ? el.className.trim().slice(0, 80) : "",
              fontSizePx: Math.round(fs * 10) / 10,
            });
          }
        }
      }
    }

    return {
      title: document.title,
      h1: h1Text,
      themeAttr: root.dataset.theme || null,
      hydrated: root.dataset.plHydrated === "1",
      scrollWidth,
      clientWidth,
      overflowPx,
      hasHorizontalOverflow: scrollWidth > clientWidth,
      domNodeCount: document.querySelectorAll("*").length,
      tableCount: document.querySelectorAll("table").length,
      glassClassCount: document.querySelectorAll('[class*="glass-"]').length,
      visibleButtons,
      buttonsUnder44,
      buttonsHeightUnder44,
      smallButtonSamples,
      inputsUnder16px,
      smallInputSamples,
    };
  }, isMobile);
}

async function discoverFirstMatchHref(page) {
  const readHref = async () =>
    await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('a[href^="/app/"][href*="/g/"]'));
      for (const el of els) {
        const href = el.getAttribute("href");
        if (href && /^\/app\/[a-z0-9-]+\/g\/[a-z0-9-]+/.test(href)) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) return href;
        }
      }
      return null;
    });

  const direct = await readHref();
  if (direct) return direct;
  const jumpBtn = page.locator("[data-day-empty] [data-day-jump]").first();
  if ((await jumpBtn.count()) > 0 && (await jumpBtn.isVisible())) {
    await jumpBtn.click().catch((err) => {
      void err;
    });
    await page.waitForTimeout(800);
    return await readHref();
  }
  return null;
}

async function captureRoute(page, route, vpName, isMobile, errorBucket, opts) {
  errorBucket.consoleErrors = [];
  errorBucket.pageErrors = [];
  errorBucket.serverErrors = [];

  await page
    .evaluate(() => {
      try {
        window.localStorage.setItem("pl-theme", "dark");
      } catch (err) {
        void err;
      }
    })
    .catch((err) => {
      void err;
    });

  const targetUrl = `${opts.baseUrl}${route.path}`;
  let httpStatus = null;
  let navError = null;
  try {
    const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    httpStatus = response ? response.status() : null;
    await page.waitForLoadState("load", { timeout: 10_000 }).catch((err) => {
      void err;
    });
  } catch (err) {
    navError = err instanceof Error ? err.message : String(err);
  }

  await waitForPageSettled(page, route.path);

  const screenshots = {};
  const metricsByTheme = {};
  for (const theme of THEMES) {
    await applyTheme(page, theme);
    const filename = `${route.slug}__${vpName}__${theme}.png`;
    const filePath = path.join(opts.outDir, filename).replace(/\\/g, "/");
    await page.screenshot({ path: filePath, fullPage: false });
    screenshots[theme] = filePath;
    metricsByTheme[theme] = await collectDomMetrics(page, isMobile);
  }

  const darkM = metricsByTheme.dark;
  const lightM = metricsByTheme.light;
  const overflowPx = Math.max(darkM.overflowPx, lightM.overflowPx);
  console.log(
    `[${opts.phase.toUpperCase()}][${vpName}] ${route.slug.padEnd(18)} status=${httpStatus ?? "ERR"} overflow=${overflowPx}px` +
      (isMobile ? ` btn<44=${darkM.buttonsUnder44} inp<16=${darkM.inputsUnder16px}` : "") +
      ` consoleErr=${errorBucket.consoleErrors.length} pageErr=${errorBucket.pageErrors.length}`,
  );

  return {
    slug: route.slug,
    label: route.label,
    group: route.group,
    requestedPath: route.path,
    viewport: vpName,
    viewportSize: isMobile ? "375x812" : "1440x900",
    httpStatus,
    navError,
    overflowPx,
    hasHorizontalOverflow: overflowPx > 0,
    domNodeCount: darkM.domNodeCount,
    tableCount: darkM.tableCount,
    glassClassCount: darkM.glassClassCount,
    visibleButtons: darkM.visibleButtons,
    buttonsUnder44: darkM.buttonsUnder44,
    buttonsHeightUnder44: darkM.buttonsHeightUnder44,
    inputsUnder16px: darkM.inputsUnder16px,
    smallButtonSamples: isMobile ? darkM.smallButtonSamples : [],
    smallInputSamples: isMobile ? darkM.smallInputSamples : [],
    consoleErrorCount: errorBucket.consoleErrors.length,
    consoleErrors: [...errorBucket.consoleErrors],
    pageErrorCount: errorBucket.pageErrors.length,
    pageErrors: [...errorBucket.pageErrors],
    serverErrorCount: errorBucket.serverErrors.length,
    serverErrors: [...errorBucket.serverErrors],
    screenshots,
  };
}

function attachListeners(page, baseUrl) {
  const bucket = { consoleErrors: [], pageErrors: [], serverErrors: [] };
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      bucket.consoleErrors.push(msg.text().slice(0, 300));
    }
  });
  page.on("pageerror", (err) => {
    bucket.pageErrors.push((err instanceof Error ? err.message : String(err)).slice(0, 300));
  });
  page.on("response", (res) => {
    if (res.url().startsWith(baseUrl) && res.status() >= 500) {
      bucket.serverErrors.push(`${res.status()} ${res.url().slice(baseUrl.length)}`);
    }
  });
  return bucket;
}

async function main() {
  const opts = parseCliArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  await mkdir(opts.outDir, { recursive: true });
  await waitForServerReady(opts.baseUrl, 60_000);

  const require = createRequire(path.join(process.cwd(), "apps/web/package.json"));
  const { chromium } = require("@playwright/test");
  const browser = await chromium.launch({ headless: true });

  try {
    const desktopCtx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      locale: "es-MX",
    });
    const cookies = await unlockBeta(desktopCtx, opts.baseUrl, opts.pin);
    const mobileCtx = await browser.newContext({
      viewport: { width: 375, height: 812 },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
      locale: "es-MX",
    });
    await mobileCtx.addCookies(cookies);

    const desktopPage = await desktopCtx.newPage();
    const desktopBucket = attachListeners(desktopPage, opts.baseUrl);
    const mobilePage = await mobileCtx.newPage();
    const mobileBucket = attachListeners(mobilePage, opts.baseUrl);

    const routes = opts.includeOla4 ? [...CORE_ROUTES, ...POST_OLA3_EXTRA_ROUTES] : [...CORE_ROUTES];
    const entries = [];
    let discoveredMatchPath = null;

    for (const route of routes) {
      const entry = await captureRoute(desktopPage, route, "desktop", false, desktopBucket, opts);
      entries.push(entry);
      if (route.slug === "app-home") {
        discoveredMatchPath = await discoverFirstMatchHref(desktopPage);
      }
    }

    if (discoveredMatchPath) {
      const matchRoute = {
        slug: "match-detail",
        path: discoveredMatchPath,
        group: "protected",
        label: `Ficha de partido (${discoveredMatchPath})`,
      };
      routes.push(matchRoute);
      entries.push(await captureRoute(desktopPage, matchRoute, "desktop", false, desktopBucket, opts));
    }

    for (const route of routes) {
      entries.push(await captureRoute(mobilePage, route, "mobile", true, mobileBucket, opts));
    }

    await desktopCtx.close();
    await mobileCtx.close();

    const desktopEntries = entries.filter((e) => e.viewport === "desktop");
    const mobileEntries = entries.filter((e) => e.viewport === "mobile");
    const summary = {
      phase: opts.phase.toUpperCase(),
      totalRoutes: routes.length,
      totalScreenshots: entries.length * THEMES.length,
      discoveredMatchPath,
      desktopOverflows: desktopEntries.filter((e) => e.hasHorizontalOverflow).length,
      mobileOverflows: mobileEntries.filter((e) => e.hasHorizontalOverflow).length,
      mobileButtonsUnder44Total: mobileEntries.reduce((acc, e) => acc + e.buttonsUnder44, 0),
      mobileInputsUnder16pxTotal: mobileEntries.reduce((acc, e) => acc + e.inputsUnder16px, 0),
      consoleErrorsTotal: entries.reduce((acc, e) => acc + e.consoleErrorCount, 0),
      pageErrorsTotal: entries.reduce((acc, e) => acc + e.pageErrorCount, 0),
      totalTablesDesktop: desktopEntries.reduce((acc, e) => acc + e.tableCount, 0),
      totalGlassNodesDesktop: desktopEntries.reduce((acc, e) => acc + e.glassClassCount, 0),
    };

    const manifestPath = path.join(opts.outDir, "manifest.json");
    await writeFile(
      manifestPath,
      `${JSON.stringify({ startedAt, completedAt: new Date().toISOString(), baseUrl: opts.baseUrl, outDir: opts.outDir, summary, entries }, null, 2)}\n`,
      "utf8",
    );
    console.log(`\n[done] Manifest guardado en ${manifestPath}`);
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
