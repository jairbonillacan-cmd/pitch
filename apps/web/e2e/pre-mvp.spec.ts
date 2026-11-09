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
  "Pitágoras",
  "Log5",
];

const SCREENSHOT_DIR = path.resolve(process.cwd(), "../../test-results/screenshots");

test.beforeAll(() => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

test.describe("PitchLab Pre-MVP E2E Suite", () => {
  test("1. Landing page, demo selector, theme persistence, FD-16 & a11y", async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    const start = Date.now();
    await page.goto("/");
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000);

    await expect(page.locator("h1")).toContainText("Lee el juego con datos");

    // Save Hero dark screenshot at top of page
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `landing-${testInfo.project.name}-dark.png`),
      fullPage: false,
    });

    // «Pregunta un partido»: elegir otro partido abre su análisis en la hoja.
    const picks = page.locator(".lv-rail .lv-chip");
    const pickCount = await picks.count();
    expect(pickCount).toBeGreaterThanOrEqual(2);

    await picks.nth(1).click();
    await expect(picks.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".lv-sheet .lv-big")).toContainText("%");

    // «Tu cuota» compara la cuota escrita con la probabilidad del modelo.
    await page.locator(".lv-yours input").fill("2.10");
    await expect(page.locator(".lv-yours-read")).toContainText("pts");

    // FD-16 check on Landing HTML
    const html = await page.content();
    for (const term of FORBIDDEN_FD16_TERMS) {
      expect(html.toLowerCase()).not.toContain(term.toLowerCase());
    }

    // Toggle theme to light and verify persistence across reload
    await page. evaluate(() => window.scrollTo(0, 0));
    await page.locator("[data-theme-toggle]").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.waitForTimeout(250);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `landing-${testInfo.project.name}-light.png`),
      fullPage: false,
    });

    // Axe accessibility check in light mode
    const lightA11y = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(lightA11y.violations).toEqual([]);

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    // Switch back to dark
    await page.locator("[data-theme-toggle]").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.waitForTimeout(250);

    // Cada liga de fútbol con tabla publicada muestra a su líder.
    await expect(page.locator("#ligas")).toContainText("Liga MX");

    // Verify all visible images loaded
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

    // Axe accessibility check
    const a11y = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(a11y.violations).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("2. Auth protection, wrong PIN, rate limit (429), and locked forms", async ({
    page,
    request,
  }, testInfo) => {
    // Visiting /app without cookie redirects to /login?next=%2Fapp
    await page.goto("/app", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login\?next=%2Fapp/);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `login-${testInfo.project.name}-dark.png`),
    });

    // Verify locked email form submit button is disabled and notice is visible
    await expect(page.locator("form.auth-form button[type='submit']")).toBeDisabled();
    await expect(page.locator(".notice")).toContainText(
      "Las cuentas abren pronto",
    );

    // Open PIN dialog and enter wrong code 9999 (using a dedicated test IP header for PIN check)
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

    // Verify rate limiter: 6 consecutive failed attempts from a distinct IP return 429
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

    // Check /signup page
    await page.goto("/signup");
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `signup-${testInfo.project.name}-dark.png`),
    });
    const signupA11y = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(signupA11y.violations).toEqual([]);
  });

  test("3. Unlock with valid PIN, navigate /app/[league], modal URL sync, reload & logout", async ({
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

    // FD-16 check on /app/premier-league
    const plHtml = await page.content();
    for (const term of FORBIDDEN_FD16_TERMS) {
      expect(plHtml.toLowerCase()).not.toContain(term.toLowerCase());
    }

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `panel-pl-${testInfo.project.name}-dark.png`),
    });

    // Toggle light mode screenshot of panel
    await page.locator("[data-theme-toggle]").click();
    await page.waitForTimeout(250);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `panel-pl-${testInfo.project.name}-light.png`),
    });
    await page.locator("[data-theme-toggle]").click();
    await page.waitForTimeout(250);

    // Axe check on /app/premier-league
    const panelA11y = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(panelA11y.violations).toEqual([]);

    // Day filter chips
    const dayChips = page.locator("#day-chips .day-chip");
    const chipCount = await dayChips.count();
    expect(chipCount).toBeGreaterThanOrEqual(2);
    await dayChips.nth(1).click();
    await expect(dayChips.nth(1)).toHaveAttribute("aria-pressed", "true");
    await dayChips.first().click();

    // Open a MatchCard modal -> URL updates to /app/premier-league/games/<gameId>
    const firstCard = page.locator(".match-card").first();
    const gameId = await firstCard.getAttribute("data-game-id");
    expect(gameId).toBeTruthy();

    await firstCard.click();
    await expect(page.locator("[role=dialog].analysis-dialog")).toBeVisible();
    expect(page.url()).toContain(`/app/premier-league/games/${gameId}`);

    const skipBtn = page.locator("[role=dialog].analysis-dialog [data-skip]");
    if (await skipBtn.isVisible()) {
      await skipBtn.click();
    }
    await expect(page.locator("[role=dialog].analysis-dialog .result")).toBeVisible();

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `modal-pl-${testInfo.project.name}-dark.png`),
    });

    // Reload directly on /app/premier-league/games/<gameId> -> modal opens automatically
    await page.reload();
    await expect(page.locator("[role=dialog].analysis-dialog")).toBeVisible();

    // Close modal with Escape -> URL returns to /app/premier-league
    await page.keyboard.press("Escape");
    await expect(page.locator("[role=dialog].analysis-dialog")).toBeHidden();
    expect(page.url()).toMatch(/\/app\/premier-league$/);

    // Switch to NFL tab
    await page.locator(".league-tab[data-league='nfl']").click();
    await page.waitForURL("**/app/nfl");
    await expect(page.locator("#panel-league-name")).toContainText("NFL");

    // FD-16 check on /app/nfl
    const nflHtml = await page.content();
    for (const term of FORBIDDEN_FD16_TERMS) {
      expect(nflHtml.toLowerCase()).not.toContain(term.toLowerCase());
    }

    // Logout -> clears cookie and redirects to /
    await page.locator("header.panel-header button", { hasText: "Salir" }).click();
    await page.waitForURL("**/");

    // Visiting /app after logout redirects to /login
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login/);
  });

  test("4. Responsive viewports (zero horizontal scroll) and /legal/creditos attribution", async ({
    page,
  }) => {
    const widths = [375, 390, 768, 1024, 1280, 1440];
    await page.goto("/");
    for (const width of widths) {
      await page.setViewportSize({ width, height: 844 });
      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(overflow, `Horizontal overflow at ${width}px`).toBe(false);
    }

    // Verify /legal/creditos has CC-BY 4.0 nflverse and CC0 openfootball attribution
    await page.goto("/legal/creditos");
    const creditHtml = await page.content();
    expect(creditHtml).toContain("nflverse");
    expect(creditHtml).toContain("CC-BY 4.0");
    expect(creditHtml).toContain("openfootball");
    expect(creditHtml).toContain("CC0");

    // Verify robots.txt
    const robotsRes = await page.request.get("/robots.txt");
    expect(robotsRes.ok()).toBe(true);
    expect(await robotsRes.text()).toContain("Disallow: /");
  });

  test("5. La metodología no se publica y LaLiga mantiene sus mercados", async ({ page }) => {
    const uniqueIp = `198.51.${Math.floor(Math.random() * 200) + 10}.${Math.floor(Math.random() * 200) + 10}`;
    await page.setExtraHTTPHeaders({ "x-forwarded-for": uniqueIp });

    await page.goto("/metodologia");
    await expect(page).toHaveURL(/\/#como-se-lee$/);
    await expect(page.locator('a[href="/metodologia"]')).toHaveCount(0);

    // Panel de LaLiga con los mercados nuevos.
    await page.goto("/login?next=%2Fapp%2Flaliga");
    await page.locator(".btn-beta").click();
    await expect(page.locator(".pin-dialog")).toBeVisible();
    for (const d of ["2", "0", "2", "6"]) {
      await page.locator(`button.pin-key[data-pin-digit='${d}']`).click();
    }
    await page.waitForURL("**/app/laliga", { timeout: 15_000 });
    await expect(page.locator("#panel-league-name")).toContainText("LaLiga");

    // Abre el primer análisis y comprueba los mercados nuevos del modelo.
    await page.locator("button:has-text('Analizar')").first().click();
    const dialog = page.locator("[role=dialog].analysis-dialog");
    await expect(dialog).toBeVisible();
    const skip = dialog.locator("[data-skip]");
    if (await skip.isVisible().catch(() => false)) await skip.click();

    // Fase A: la liga correcta en el modal y, según la hora, picks o el aviso de que no aplican.
    await expect(dialog.locator("#modal-league")).toContainText("LaLiga");
    await dialog.locator("[data-section-tab='picks']").click();
    const picksOrNote = dialog.locator("[data-picks], [data-no-picks], .tag-info");
    await expect(picksOrNote.first()).toBeVisible();
    if ((await dialog.locator("[data-picks]").count()) > 0) {
      await expect(dialog.locator("[data-picks] li")).toHaveCount(3);
    }

    // Secciones del análisis: cada pestaña muestra su bloque.
    await dialog.locator("[data-section-tab='mercados']").click();
    await expect(dialog).toContainText("Goles por equipo");
    await expect(dialog).toContainText("Marcador exacto");

    await dialog.locator("[data-section-tab='contexto']").click();
    await expect(dialog).toContainText("Forma local");
    await expect(dialog).toContainText("Forma visitante");
    await expect(dialog).toContainText("Posición local");
    await expect(dialog).toContainText("Posición visitante");
    await expect(dialog).toContainText("Contexto del partido");
    await expect(dialog).not.toContainText(/Memoria larga|ajustado por rival/i);

    // FD-20: el panel de dinero aparece (con datos o vacío) y nunca nombra al proveedor.
    await dialog.locator("[data-section-tab='dinero']").click();
    await expect(dialog.locator("[data-market-pulse]")).toBeVisible();
    await expect(dialog).not.toContainText(/polymarket|kalshi/i);
  });

  test("6. Bundesliga: emblema, tabla y sin scroll horizontal", async ({
    page,
  }, testInfo) => {
    const uniqueIp = `203.0.${Math.floor(Math.random() * 200) + 10}.${Math.floor(Math.random() * 200) + 10}`;
    await page.setExtraHTTPHeaders({ "x-forwarded-for": uniqueIp });

    await page.goto("/login?next=%2Fapp%2Fbundesliga");
    await page.locator(".btn-beta").click();
    for (const d of ["2", "0", "2", "6"]) {
      await page.locator(`button.pin-key[data-pin-digit='${d}']`).click();
    }
    await page.waitForURL("**/app/bundesliga", { timeout: 15_000 });
    await expect(page.locator("#panel-league-name")).toContainText("Bundesliga");

    const badge = page.locator('img[src$="/bundesliga.svg"]:visible').first();
    await expect(badge).toBeVisible();
    await expect.poll(() => badge.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);

    // La fila de ligas hace scroll interno: nunca desborda la página.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);

    // Tabla de posiciones calculada del snapshot.
    await expect(page.locator(".standings-block")).toBeVisible();
    await expect(page.locator(".standings")).toContainText("Pts");

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `panel-bundesliga-${testInfo.project.name}-dark.png`),
    });
  });
});
