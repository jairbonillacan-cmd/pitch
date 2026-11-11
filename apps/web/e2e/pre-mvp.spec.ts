import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import path from "node:path";
import fs from "node:fs";

const FORBIDDEN_FD16_TERMS = [
  "nflverse",
  "openfootball",
  "api-football",
  "Poisson",
  "Dixon-Coles",
  "LightGBM",
  "Platt",
  "Pitágoras",
  "Log5",
  "Polymarket",
  "Kalshi",
  "Understat",
  "ESPN",
];

const SCREENSHOT_DIR = path.resolve(process.cwd(), "../../test-results/screenshots");

test.beforeAll(() => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

test.describe("PitchLab v4 Liquid Glass & Spacetime Suite E2E", () => {
  test("1. Landing page, Zero-Leakage, live Geodesic comparator, theme persistence & a11y", async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    const start = Date.now();
    await page.goto("/");
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(6000);

    await expect(page.locator("h1")).toContainText("El súper-tipster cuantitativo");
    await expect(page.locator("body")).toContainText("PitchLab Spacetime Suite v3.0");
    await expect(page.locator("body")).toContainText("16,126");

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `landing-${testInfo.project.name}-dark.png`),
      fullPage: false,
    });

    // Cero-Fuga en modo visitante: los picks adicionales del partido están protegidos
    const lockedCount = await page.locator("[data-locked-pick]").count();
    expect(lockedCount).toBeGreaterThanOrEqual(2);

    // Comparador en vivo Geodesic v2.0
    const oddsInput = page.locator("#landing-user-odds");
    await expect(oddsInput).toBeVisible();
    await oddsInput.fill("2.25");
    await expect(page.locator("[data-odds-comparator]")).toContainText("pts");

    // Cambiar de partido en el selector del hero
    const heroChips = page.locator("[data-hero-game-chip]");
    expect(await heroChips.count()).toBeGreaterThanOrEqual(2);
    await heroChips.nth(1).click();
    await expect(heroChips.nth(1)).toHaveAttribute("aria-selected", "true");

    // Verificación estricta cero términos matemáticos/proveedores internos
    const html = await page.content();
    for (const term of FORBIDDEN_FD16_TERMS) {
      expect(html.toLowerCase()).not.toContain(term.toLowerCase());
    }

    // Cambio a tema claro + persistencia tras recarga + WCAG AA
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator("[data-theme-toggle]").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.waitForTimeout(200);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `landing-${testInfo.project.name}-light.png`),
      fullPage: false,
    });

    const lightA11y = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(lightA11y.violations).toEqual([]);

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    // Volver a oscuro
    await page.locator("[data-theme-toggle]").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.waitForTimeout(200);

    // Verificar imágenes visibles cargadas
    const brokenImages = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll("img"));
      return imgs
        .filter((img) => {
          const style = window.getComputedStyle(img);
          if (style.display === "none" || style.visibility === "hidden") return false;
          return img.complete && img.naturalWidth === 0;
        })
        .map((img) => img.src);
    });
    expect(brokenImages).toEqual([]);

    const darkA11y = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(darkA11y.violations).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("2. Public Tech/Pricing/Tipstar routes, Auth gate, $0 anti-abuse & 429 rate limit", async ({
    page,
    request,
  }, testInfo) => {
    // /metodologia redirige limpiamente a /tecnologia
    await page.goto("/metodologia");
    await expect(page).toHaveURL(/\/tecnologia$/);
    await expect(page.locator("h1")).toContainText(
      "Data Science, Machine Learning e IA",
    );
    await expect(page.locator("body")).toContainText("PitchLab Tachyon v3.0");
    await expect(page.locator("body")).toContainText("PitchLab Minkowski v3.0");
    const techA11y = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(techA11y.violations).toEqual([]);

    // Boleto público de Tipstar (/p/sofia-sem): libera 1 pick semanal y protege los demás del mismo partido
    // (hasta 5 picks por partido: el de valor solo existe si Geodesic encuentra valor real)
    await page.goto("/p/sofia-sem");
    await expect(page.locator("h1")).toContainText("@sofia_nfl");
    await expect(page.locator("body")).toContainText("SOFIA5");
    expect(await page.locator("[data-locked-pick]").count()).toBeGreaterThanOrEqual(1);
    const tipstarPublicA11y = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(tipstarPublicA11y.violations).toEqual([]);

    // /pricing: único Pase Total ($299 / $2,390) + referidos doble vía (+15 días)
    await page.goto("/pricing");
    await expect(page.locator("h1")).toContainText("Un solo Pase Total");
    await expect(page.locator("body")).toContainText("+15 días gratis");
    const pricingA11y = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(pricingA11y.violations).toEqual([]);

    // Visitar /app sin cookie redirige a /login?next=%2Fapp
    await page.goto("/app", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login\?next=%2Fapp/);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `login-${testInfo.project.name}-dark.png`),
    });

    // PIN incorrecto (9999) muestra retroalimentación de error
    const runIpSuffix = `${Math.floor(Math.random() * 200) + 10}.${Math.floor(Math.random() * 200) + 10}`;
    await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.51.${runIpSuffix}` });
    await page.locator(".btn-beta").click();
    await expect(page.locator(".pin-dialog")).toBeVisible();

    for (const d of ["9", "9", "9", "9"]) {
      await page.locator(`button.pin-key[data-pin-digit='${d}']`).click();
    }
    await expect(page.locator(".pin-feedback.error")).toContainText(
      "Código incorrecto",
    );

    // Rate limiter: 6 intentos fallidos consecutivos desde una IP devuelven 429
    const rateLimitIp = `203.0.${runIpSuffix}`;
    let lastStatus = 0;
    for (let i = 1; i <= 6; i++) {
      const res = await request.post("/api/beta/unlock", {
        headers: { "x-forwarded-for": rateLimitIp },
        data: { code: "0000", next: "/app" },
      });
      lastStatus = res.status();
    }
    expect(lastStatus).toBe(429);

    // /signup: escudo anti-abuso $0 MXN (bloqueo de correo desechable + normalización Gmail)
    await page.goto("/signup?code=SOFIA5");
    await expect(page.locator("#auth-promo")).toHaveValue("SOFIA5");
    await page.locator("#auth-email").fill("bot@mailinator.com");
    await page.locator("form.auth-form button[type='submit']").click();
    await expect(page.locator("p[role='alert']")).toContainText("temporales");

    await page.locator("#auth-email").fill("Juan.Perez+promo@googlemail.com");
    await expect(page.locator("body")).toContainText("juanperez@gmail.com");

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `signup-${testInfo.project.name}-dark.png`),
    });
    const signupA11y = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(signupA11y.violations).toEqual([]);
  });

  test("3. Valid PIN unlock, League Hub, Match Studio (5 picks + Cortex IA + Dinero), Bundesliga & Logout", async ({
    page,
  }, testInfo) => {
    const uniqueIp = `192.0.${Math.floor(Math.random() * 200) + 10}.${Math.floor(Math.random() * 200) + 10}`;
    await page.setExtraHTTPHeaders({ "x-forwarded-for": uniqueIp });

    await page.goto("/login?next=%2Fapp%2Fpremier-league");
    await page.locator(".btn-beta").click();
    await expect(page.locator(".pin-dialog")).toBeVisible();

    for (const d of ["2", "0", "2", "6"]) {
      await page.locator(`button.pin-key[data-pin-digit='${d}']`).click();
    }

    await page.waitForURL("**/app/premier-league", { timeout: 15_000 });
    await expect(page.locator("#panel-league-name")).toContainText("Premier League");

    const plHtml = await page.content();
    for (const term of FORBIDDEN_FD16_TERMS) {
      expect(plHtml.toLowerCase()).not.toContain(term.toLowerCase());
    }

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `panel-pl-${testInfo.project.name}-dark.png`),
    });

    // Verificar accesibilidad en modo claro y oscuro dentro del Club
    await page.locator("[data-theme-toggle]").click();
    await page.waitForTimeout(200);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `panel-pl-${testInfo.project.name}-light.png`),
    });
    const lightPanelA11y = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(lightPanelA11y.violations).toEqual([]);

    await page.locator("[data-theme-toggle]").click();
    await page.waitForTimeout(200);

    // Filtro por día
    const dayChips = page.locator("#day-chips .day-chip");
    expect(await dayChips.count()).toBeGreaterThanOrEqual(2);
    await dayChips.nth(1).click();
    await expect(dayChips.nth(1)).toHaveAttribute("aria-pressed", "true");
    await dayChips.first().click();

    // Abrir Radiografía del primer partido -> /app/premier-league/games/<gameId>
    const firstCard = page.locator("[data-game-card]").first();
    const gameId = await firstCard.getAttribute("data-game-card");
    expect(gameId).toBeTruthy();

    await firstCard.locator("a", { hasText: "Radiografía" }).click();
    await page.waitForURL(`**/app/premier-league/games/${gameId}`);

    await expect(page.locator("body")).toContainText("PitchLab Cortex IA");
    await expect(page.locator("[data-picks]")).toBeVisible();
    // Socio con Pase Total ve los 5 picks desbloqueados (cero candados)
    expect(await page.locator("[data-locked-pick]").count()).toBe(0);

    await page.locator("[data-section-tab='mercados']").click();
    await expect(page.locator("body")).toContainText("Geodesic v2.0");

    await page.locator("[data-section-tab='contexto']").click();
    await expect(page.locator("body")).toContainText("Contexto del partido");

    await page.locator("[data-section-tab='dinero']").click();
    await expect(page.locator("[data-market-pulse]")).toBeVisible();
    await expect(page.locator("[data-market-pulse]")).not.toContainText(/polymarket|kalshi/i);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `studio-pl-${testInfo.project.name}-dark.png`),
    });

    // Cambiar a Bundesliga y verificar emblema + tabla de posiciones + cero desborde horizontal
    await page.locator(".league-tab[data-league='bundesliga']:visible").first().click();
    await page.waitForURL("**/app/bundesliga");
    await expect(page.locator("#panel-league-name")).toContainText("Bundesliga");

    const badge = page.locator('img[src$="/bundesliga.svg"]:visible').first();
    await expect(badge).toBeVisible();
    await expect
      .poll(() => badge.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);

    await expect(page.locator(".standings-block")).toBeVisible();
    await expect(page.locator(".standings")).toContainText("Pts");

    // Cerrar sesión -> limpia cookie y redirige a /
    await page.locator("header.panel-header button", { hasText: "Salir" }).click();
    await page.waitForURL("**/");

    await page.goto("/app");
    await expect(page).toHaveURL(/\/login/);
  });

  test("4. Responsive viewports (zero horizontal scroll), /legal/creditos & /robots.txt", async ({
    page,
  }) => {
    const widths = [375, 390, 768, 1024, 1280, 1440];
    await page.goto("/");
    for (const width of widths) {
      await page.setViewportSize({ width, height: 844 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflow, `Horizontal overflow at ${width}px`).toBe(false);
    }

    await page.goto("/legal/creditos");
    const creditHtml = await page.content();
    expect(creditHtml).toContain("nflverse");
    expect(creditHtml).toContain("CC-BY 4.0");
    expect(creditHtml).toContain("openfootball");
    expect(creditHtml).toContain("CC0");

    const robotsRes = await page.request.get("/robots.txt");
    expect(robotsRes.ok()).toBe(true);
    expect(await robotsRes.text()).toContain("Disallow: /");
  });
});
