/**
 * Medición de rendimiento contra el build de producción (web-prod, puerto 3100).
 *
 *   pnpm --filter @pitchlab/web exec node scripts/perf.mjs [etiqueta]
 *
 * PC: 1440×900 sin ralentizar. Móvil: 390×844, toque y CPU 4× más lenta.
 * Mide carga de /app, pintado al desplazarse, un clic de «Parlay» y la navegación
 * entre las páginas principales. Guarda el resultado en perf-results/perf-<etiqueta>.json.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.PERF_BASE ?? "http://127.0.0.1:3100";
const LABEL = process.argv[2] ?? "medicion";
const RUNS = Number(process.env.PERF_RUNS ?? 2);

const PROFILES = [
  { name: "pc", viewport: { width: 1440, height: 900 }, cpu: 1, mobile: false },
  { name: "movil", viewport: { width: 390, height: 844 }, cpu: 4, mobile: true },
];

const NAV_SEQUENCE = [
  { href: "/app/parlays", h1: /Armar parlay/i },
  { href: "/app/lab", h1: /mi récord|bitácora/i },
  { href: "/app/social", h1: /^Comunidad$/i },
  { href: "/app", h1: /Partidos de hoy/i },
];

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};
const round = (x, d = 0) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);

let storageState;

async function measureOnce(browser, profile) {
  const context = await browser.newContext({
    storageState,
    viewport: profile.viewport,
    deviceScaleFactor: profile.mobile ? 2 : 1,
    isMobile: profile.mobile,
    hasTouch: profile.mobile,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu });
  await cdp.send("Performance.enable");


  // 1) Carga de /app
  await page.addInitScript(() => {
    window.__lcp = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__lcp = e.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    window.__events = [];
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__events.push({ name: e.name, d: e.duration });
    }).observe({ type: "event", durationThreshold: 16, buffered: true });
  });
  await page.goto(`${BASE}/app`, { waitUntil: "load" });
  await page.waitForSelector("main h1", { timeout: 30000 });
  await page.waitForTimeout(1500);

  const load = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const res = performance.getEntriesByType("resource");
    const js = res.filter((r) => r.initiatorType === "script" || r.name.endsWith(".js"));
    return {
      ttfbMs: nav.responseStart,
      domContentLoadedMs: nav.domContentLoadedEventEnd,
      lcpMs: window.__lcp,
      htmlKb: nav.decodedBodySize / 1024,
      htmlTransferKb: nav.transferSize / 1024,
      jsKb: js.reduce((a, r) => a + (r.decodedBodySize || 0), 0) / 1024,
      domNodes: document.getElementsByTagName("*").length,
    };
  });

  // 2) Pintado: desplazarse por la página y medir el tiempo entre cuadros
  const metricsBefore = Object.fromEntries(
    (await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]),
  );
  const scroll = await page.evaluate(async () => {
    const deltas = [];
    const max = document.documentElement.scrollHeight - innerHeight;
    let y = 0;
    let dir = 1;
    let last = performance.now();
    await new Promise((resolve) => {
      let frames = 0;
      const step = (t) => {
        deltas.push(t - last);
        last = t;
        y += dir * 60;
        if (y >= max || y <= 0) dir *= -1;
        window.scrollTo(0, Math.max(0, Math.min(max, y)));
        if (++frames < 150) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    deltas.shift();
    const s = [...deltas].sort((a, b) => a - b);
    return {
      avgFrameMs: deltas.reduce((a, b) => a + b, 0) / deltas.length,
      p95FrameMs: s[Math.floor(s.length * 0.95)],
      slowFramesPct: (deltas.filter((d) => d > 20).length / deltas.length) * 100,
    };
  });
  const metricsAfter = Object.fromEntries(
    (await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]),
  );
  const paintWork = {
    styleMs: (metricsAfter.RecalcStyleDuration - metricsBefore.RecalcStyleDuration) * 1000,
    layoutMs: (metricsAfter.LayoutDuration - metricsBefore.LayoutDuration) * 1000,
    taskMs: (metricsAfter.TaskDuration - metricsBefore.TaskDuration) * 1000,
  };
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);

  // 3) Interacción: clic en «Parlay» (agregar al boleto)
  const clicks = [];
  for (let i = 0; i < 3; i += 1) {
    const btn = page.locator("main button", { hasText: /^Parlay$/ }).nth(i);
    if ((await btn.count()) === 0) break;
    await btn.scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      window.__events = [];
    });
    await btn.click();
    await page.waitForTimeout(600);
    const d = await page.evaluate(() =>
      Math.max(0, ...window.__events.filter((e) => /click|pointerup|pointerdown/.test(e.name)).map((e) => e.d)),
    );
    clicks.push(d);
  }

  // 4) Navegación entre las páginas principales
  const nav = [];
  for (const target of NAV_SEQUENCE) {
    const link = page.locator(`a[href="${target.href}"]:visible`).first();
    const t0 = Date.now();
    await link.click();
    await page.waitForFunction(
      (src) => new RegExp(src, "i").test(document.querySelector("main h1")?.textContent ?? ""),
      target.h1.source,
      { timeout: 30000 },
    );
    nav.push({ href: target.href, ms: Date.now() - t0 });
    await page.waitForTimeout(400);
  }

  await context.close();
  return { load, scroll, paintWork, clickMs: median(clicks), clicks, nav };
}

const out = { label: LABEL, base: BASE, at: new Date().toISOString(), profiles: {} };
const browser = await chromium.launch();

// Calentamiento: el servidor recién arrancado responde lento las primeras veces.
{
  const warm = await browser.newContext();
  const wp = await warm.newPage();
  // Una sola entrada (el servidor limita los intentos); la sesión se reutiliza en cada medición.
  const unlock = await wp.request.post(`${BASE}/api/beta/unlock`, { data: { code: "2026" } });
  if (!unlock.ok()) throw new Error(`No se pudo entrar: ${unlock.status()}`);
  for (let i = 0; i < 2; i += 1) {
    for (const href of ["/app", "/app/parlays", "/app/social", "/app/lab"]) {
      await wp.goto(`${BASE}${href}`, { waitUntil: "load" });
    }
  }
  storageState = await warm.storageState();
  await warm.close();
}
for (const profile of PROFILES) {
  const runs = [];
  for (let r = 0; r < RUNS; r += 1) runs.push(await measureOnce(browser, profile));
  const pick = (f) => round(median(runs.map(f)), 1);
  out.profiles[profile.name] = {
    htmlKb: pick((x) => x.load.htmlKb),
    htmlTransferKb: pick((x) => x.load.htmlTransferKb),
    jsKb: pick((x) => x.load.jsKb),
    domNodes: pick((x) => x.load.domNodes),
    ttfbMs: pick((x) => x.load.ttfbMs),
    lcpMs: pick((x) => x.load.lcpMs),
    avgFrameMs: pick((x) => x.scroll.avgFrameMs),
    p95FrameMs: pick((x) => x.scroll.p95FrameMs),
    slowFramesPct: pick((x) => x.scroll.slowFramesPct),
    scrollStyleMs: pick((x) => x.paintWork.styleMs),
    scrollLayoutMs: pick((x) => x.paintWork.layoutMs),
    scrollTaskMs: pick((x) => x.paintWork.taskMs),
    clickParlayMs: pick((x) => x.clickMs),
    navMedianMs: pick((x) => median(x.nav.map((n) => n.ms))),
    nav: runs.at(-1).nav,
  };
}
await browser.close();

// Fuera de test-results: Playwright vacía esa carpeta al arrancar.
const dir = path.resolve("perf-results");
mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, `perf-${LABEL}.json`), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out.profiles, null, 2));
