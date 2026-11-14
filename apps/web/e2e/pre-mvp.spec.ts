import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
import path from "node:path";
import fs from "node:fs";

/** En el club, el tema vive en el menú del perfil. */
async function toggleClubTheme(page: import("@playwright/test").Page): Promise<void> {
  await page.locator("[data-profile-menu-trigger]:visible").first().click();
  await page.locator(".pl-profile-menu:popover-open [data-theme-option][aria-pressed=\"false\"]").click();
  await page.keyboard.press("Escape");
}

async function warmLazySectionsAndWaitImages(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.evaluate(async () => {
    const step = Math.max(400, window.innerHeight);
    for (let y = 0; y <= document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 30));
    }
    window.scrollTo(0, 0);
  });
  await page.evaluate(async () => {
    const imgs = Array.from(document.querySelectorAll("img")).filter((img) => {
      const style = window.getComputedStyle(img);
      return style.display !== "none" && style.visibility !== "hidden";
    });
    await Promise.all(
      imgs.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.addEventListener("load", () => resolve(), { once: true });
              img.addEventListener("error", () => resolve(), { once: true });
              setTimeout(resolve, 3000);
            }),
      ),
    );
  });
}

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

const FORBIDDEN_PUBLIC_PATTERNS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: "Primer mes gratis", pattern: /primer mes gratis/i },
  { label: "ROI", pattern: /\broi\b/i },
  { label: "Kelly", pattern: /\bkelly\b/i },
  { label: "Por qué ganamos", pattern: /por qu[eé] ganamos/i },
  { label: "más seguro", pattern: /m[aá]s seguro/i },
  { label: "Sellar", pattern: /\bsellar\b/i },
];

const PUBLIC_MENU_ROUTES = [
  "/como-funciona",
  "/motores",
  "/resultados",
  "/parlays",
  "/comunidad",
  "/precio",
] as const;

const SCREENSHOT_DIR = path.resolve(process.cwd(), "../../test-results/screenshots");

test.beforeAll(() => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

test.describe("PitchLab v4 Liquid Glass & Spacetime Suite E2E", () => {
  test("1. Landing page (/), 5 named engines, Tu momio comparator, hero/pricing switches, keyboard focus, theme persistence & a11y", async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    const start = Date.now();
    const homeRes = await page.goto("/");
    const elapsed = Date.now() - start;
    expect(homeRes?.status()).toBe(200);
    expect(elapsed).toBeLessThan(6000);

    await expect(page.locator("h1")).toContainText(
      "Lo más probable de cada partido, con su momio justo.",
    );

    // Sección de motores: 5 motores propios nombrados + +100,000 partidos históricos + 16,126 de Singularity
    const motoresSection = page.locator("#motores");
    await expect(motoresSection).toBeVisible();
    for (const engineName of [
      "Tachyon",
      "Singularity",
      "Minkowski",
      "Geodesic",
      "Cortex IA",
    ]) {
      await expect(motoresSection).toContainText(engineName);
    }
    await expect(motoresSection).toContainText("+100,000");
    await expect(motoresSection).toContainText("16,126");

    // Verificación estricta FD-16: cero proveedores ni fórmulas internas en DOM
    const html = await page.content();
    for (const term of FORBIDDEN_FD16_TERMS) {
      expect(html.toLowerCase(), `FD-16 forbidden term: ${term}`).not.toContain(
        term.toLowerCase(),
      );
    }

    // Verificación de copy prohibido y ausencia del simulador de rol en /
    const landingText = (await page.locator("body").textContent()) ?? "";
    for (const { label, pattern } of FORBIDDEN_PUBLIC_PATTERNS) {
      expect(landingText, `Forbidden public copy: ${label}`).not.toMatch(pattern);
    }
    await expect(
      page.locator("[data-quick-jump-bar], .pl-quick-jump-bar, [data-role-switcher]"),
    ).toHaveCount(0);
    await expect(page.getByRole("group", { name: /rol|simula/i })).toHaveCount(0);

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `landing-${testInfo.project.name}-dark.png`),
      fullPage: false,
    });

    // Comparador interactivo «Tu momio» (#tu-momio)
    const oddsInput = page.locator("#tu-momio");
    await expect(oddsInput).toBeVisible();
    const oddsFeedback = page.locator('#hoy [aria-live="polite"]').first();

    await oddsInput.fill("−200");
    await expect(oddsFeedback).toContainText("pts");
    await expect(oddsFeedback).toContainText(/paga (más|menos) que el justo/i);

    await oddsInput.fill("+150");
    await expect(oddsFeedback).toContainText("pts");

    await oddsInput.fill("1.50");
    await expect(oddsFeedback).toContainText("pts");

    await oddsInput.fill("");
    await expect(oddsFeedback).toContainText(/escribe el momio/i);

    await oddsInput.fill("abc");
    await expect(oddsFeedback).toContainText(/momio válido|no es válido/i);

    await oddsInput.fill("-200");
    await expect(oddsFeedback).toContainText("pts");

    // Cambio de liga en el hero (aria-pressed="true" cambia)
    const heroLeagueButtons = page.locator('#hoy [role="group"] button[aria-pressed]');
    expect(await heroLeagueButtons.count()).toBeGreaterThanOrEqual(2);
    await expect(heroLeagueButtons.nth(0)).toHaveAttribute("aria-pressed", "true");
    await heroLeagueButtons.nth(1).click();
    await expect(heroLeagueButtons.nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect(heroLeagueButtons.nth(0)).toHaveAttribute("aria-pressed", "false");
    await heroLeagueButtons.nth(0).click();
    await expect(heroLeagueButtons.nth(0)).toHaveAttribute("aria-pressed", "true");

    // Conmutador Mensual / Anual en Precio (aria-pressed="true" cambia y actualiza $299 <-> $2,390)
    const precioSection = page.locator("#precio");
    const billingButtons = precioSection.locator('[role="group"] button[aria-pressed]');
    await expect(billingButtons).toHaveCount(2);
    await expect(billingButtons.nth(0)).toHaveAttribute("aria-pressed", "true");
    await expect(precioSection).toContainText("299");

    await billingButtons.nth(1).click();
    await expect(billingButtons.nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect(billingButtons.nth(0)).toHaveAttribute("aria-pressed", "false");
    await expect(precioSection).toContainText("2,390");

    await billingButtons.nth(0).click();
    await expect(billingButtons.nth(0)).toHaveAttribute("aria-pressed", "true");
    await expect(precioSection).toContainText("299");

    // Navegación por teclado (Tab): foco visible y elementos interactivos alcanzables
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
      window.scrollTo(0, 0);
    });
    const reachedTags: string[] = [];
    for (let step = 0; step < 4; step++) {
      await page.keyboard.press("Tab");
      const focusState = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const style = window.getComputedStyle(el);
        const hasVisibleRing =
          (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) ||
          style.boxShadow !== "none";
        return { tag: el.tagName, hasVisibleRing };
      });
      expect(focusState).not.toBeNull();
      expect(["A", "BUTTON", "INPUT", "SUMMARY"]).toContain(focusState!.tag);
      expect(focusState!.hasVisibleRing).toBe(true);
      reachedTags.push(focusState!.tag);
    }
    expect(reachedTags.length).toBe(4);

    // Cambio a tema claro + persistencia tras recarga + WCAG AA
    await warmLazySectionsAndWaitImages(page);
    await page.locator("[data-theme-toggle]:visible").first().click();
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
    await page.locator("[data-theme-toggle]:visible").first().click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.waitForTimeout(200);

    await warmLazySectionsAndWaitImages(page);

    // Verificar 0 imágenes rotas
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

  test("2. 6 menu routes (200 + aria-current + Axe AA), 308 permanent redirects, Tipster route, Auth gate, $0 anti-abuse & 429 rate limit", async ({
    page,
    request,
  }, testInfo) => {
    test.setTimeout(120_000);

    // Las 6 páginas públicas del menú abren en 200, marcan su enlace activo con aria-current="page" y pasan Axe AA
    for (const route of PUBLIC_MENU_ROUTES) {
      const res = await page.goto(route);
      expect(res?.status(), `Expected 200 on ${route}`).toBe(200);

      const mobileMenuBtn = page.locator('header button[aria-label*="menú" i]:visible');
      if ((await mobileMenuBtn.count()) > 0) {
        await mobileMenuBtn.first().click();
        await expect(
          page.locator(`header a[href="${route}"][aria-current="page"]:visible`).first(),
        ).toBeVisible();
        await page.keyboard.press("Escape");
      } else {
        await expect(
          page.locator(`header a[href="${route}"][aria-current="page"]:visible`).first(),
        ).toBeVisible();
      }

      const routeHtml = await page.content();
      for (const term of FORBIDDEN_FD16_TERMS) {
        expect(
          routeHtml.toLowerCase(),
          `FD-16 forbidden term on ${route}: ${term}`,
        ).not.toContain(term.toLowerCase());
      }

      const routeText = (await page.locator("body").textContent()) ?? "";
      for (const { label, pattern } of FORBIDDEN_PUBLIC_PATTERNS) {
        expect(routeText, `Forbidden public copy on ${route}: ${label}`).not.toMatch(
          pattern,
        );
      }

      const routeA11y = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      expect(routeA11y.violations, `Axe violations on ${route}`).toEqual([]);
    }

    // Redirecciones permanentes 308 + navegación
    const permanentRedirects: ReadonlyArray<[string, string]> = [
      ["/metodologia", "/motores"],
      ["/tecnologia", "/motores"],
      ["/pricing", "/precio"],
    ];
    for (const [fromPath, toPath] of permanentRedirects) {
      const redirectRes = await request.get(fromPath, { maxRedirects: 0 });
      expect(redirectRes.status(), `Expected 308 for ${fromPath}`).toBe(308);
      expect(redirectRes.headers()["location"]).toContain(toPath);

      await page.goto(fromPath);
      await expect(page).toHaveURL(new RegExp(`${toPath}$`));
    }

    // Boleto público de Tipster (/p/sofia-sem): libera 1 pick semanal y protege los demás del mismo partido
    await page.goto("/p/sofia-sem");
    await expect(page.locator("h1")).toContainText("@sofia_nfl");
    await expect(page.locator("body")).toContainText("SOFIA5");
    expect(await page.locator("[data-locked-pick]").count()).toBeGreaterThanOrEqual(1);
    const tipsterPublicA11y = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(tipsterPublicA11y.violations).toEqual([]);

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
        headers: { "x-forwarded-for": rateLimitIp, origin: "http://127.0.0.1:3100" },
        data: { code: "0000", next: "/app" },
      });
      lastStatus = res.status();
    }
    expect(lastStatus).toBe(429);

    // /signup: escudo anti-abuso $0 MXN (bloqueo de correo desechable + normalización Gmail)
    await page.goto("/signup?code=SOFIA5");
    await expect(page.getByTestId("invite-notice")).toContainText("te invitó");
    const signupStep1A11y = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(signupStep1A11y.violations).toEqual([]);

    await page.locator("#auth-email").fill("bot@mailinator.com");
    await page.locator("form.auth-form button[type='submit']").click();
    await expect(page.locator("p[role='alert']")).toContainText("temporales");

    await page.locator("#auth-email").fill("Juan.Perez+promo@googlemail.com");
    await page.locator("form.auth-form button[type='submit']").click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Unos datos más");
    await expect(page.locator("body")).toContainText("juanperez@gmail.com");
    await expect(page.getByRole("button", { name: "Crear cuenta" })).toBeDisabled();

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
    // Recorre 9 pantallas del Club; con la máquina cargada el arranque del navegador llega a 2 min.
    test.setTimeout(300_000);
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
    await toggleClubTheme(page);
    await page.waitForTimeout(200);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `panel-pl-${testInfo.project.name}-light.png`),
    });
    const lightPanelA11y = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(lightPanelA11y.violations).toEqual([]);

    await toggleClubTheme(page);
    await page.waitForTimeout(200);

    // Filtro por día
    const dayChips = page.locator("#day-chips .day-chip");
    expect(await dayChips.count()).toBeGreaterThanOrEqual(2);
    await dayChips.nth(1).click();
    await expect(dayChips.nth(1)).toHaveAttribute("aria-pressed", "true");
    await dayChips.first().click();

    // Abrir la ficha del primer partido -> /app/premier-league/games/<gameId>
    const firstCard = page.locator("[data-game-card]").first();
    const gameId = await firstCard.getAttribute("data-game-card");
    expect(gameId).toBeTruthy();

    await firstCard.locator("a", { hasText: "Ver partido" }).click();
    await page.waitForURL(`**/app/premier-league/games/${gameId}`);

    await expect(page.locator("body")).toContainText("Cortex IA");
    await expect(page.locator("[data-picks]")).toBeVisible();
    // Socio con Pase PitchLab Ultra ve los 5 picks desbloqueados (cero candados)
    expect(await page.locator("[data-locked-pick]").count()).toBe(0);

    await page.locator("[data-section-tab='mercados']").click();
    await expect(page.locator("body")).toContainText("Mercados del partido");

    await page.locator("[data-section-tab='contexto']").click();
    await expect(page.locator("body")).toContainText("Contexto del partido");

    await page.locator("[data-section-tab='dinero']").click();
    await expect(page.locator("[data-market-pulse]")).toBeVisible();
    await expect(page.locator("[data-market-pulse]")).not.toContainText(/polymarket|kalshi/i);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `studio-pl-${testInfo.project.name}-dark.png`),
    });

    // Cambiar a Bundesliga y verificar emblema + tabla de posiciones + cero desborde horizontal
    // En escritorio, el grupo Ligas del sidebar empieza plegado: se abre antes de elegir.
    const ligasToggle = page.locator('.rail-group-toggle[aria-expanded="false"]');
    if (await ligasToggle.isVisible()) await ligasToggle.click();
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

    // PROFILE-2: perfil de tipster con récord calculado y pestañas por teclado
    await page.goto("/app/u/sofia_nfl");
    await expect(page.getByRole("heading", { level: 1, name: /Sofía Méndez/ })).toBeVisible();
    await expect(page.locator(".pl-vbadge")).toContainText("Tipster verificado");
    await expect(page.locator(".pl-prof-record")).toContainText("Saldo");
    await page.locator("#pl-prof-tab-picks").focus();
    await page.keyboard.press("End");
    await expect(page.locator("#pl-prof-tab-estadisticas")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#pl-prof-panel-estadisticas")).toContainText("Saldo por mes");
    await page.waitForTimeout(400); // fin de la entrada suave del panel
    const profileA11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(profileA11y.violations).toEqual([]);

    // SOCIAL-2: publicar con pick adjunto, me gusta y Ranking por teclado
    await page.goto("/app/social");
    if ((page.viewportSize()?.width ?? 1280) <= 640) {
      await page.locator(".pl-com-composer-row").click();
    }
    const composer = page.locator("form.pl-com-composer:visible");
    await composer.getByRole("button", { name: "Adjuntar pick" }).click();
    await page.locator(".pl-com-picker-pick").first().click();
    await composer.locator("textarea").fill("E2E: pick con ventaja según el modelo.");
    await composer.getByRole("button", { name: "Publicar" }).click();
    const firstPost = page.locator(".pl-com-post").first();
    await expect(firstPost).toContainText("E2E: pick con ventaja");
    await expect(firstPost.locator(".pl-com-pick")).toBeVisible();
    const likeButton = firstPost.getByRole("button", { name: /Me gusta/ });
    await likeButton.click();
    await expect(likeButton).toHaveAttribute("aria-pressed", "true");
    await page.locator("#pl-com-tab-para-ti").focus();
    await page.keyboard.press("End");
    await expect(page.locator("#pl-com-tab-ranking")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#pl-com-panel-ranking")).toContainText("Mínimo 15 picks cerrados.");
    await page.waitForTimeout(400); // fin de la entrada suave del panel
    const socialA11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(socialA11y.violations).toEqual([]);

    // CUENTA-2: Mi cuenta (/app/account), copiar enlace corto, voltear tarjeta por teclado,
    // pestañas con flechas, Axe AA en las 4 pestañas en oscuro y claro, y redirección /i/JAIR-2611
    await page.goto("/app/account");
    await expect(page.getByRole("heading", { level: 1, name: "Mi cuenta" })).toBeVisible();

    const copyBtn = page.locator("[data-copy-short-link]");
    await copyBtn.click();
    await expect(copyBtn).toHaveText("Copiado");

    const flipBackBtn = page.getByRole("button", { name: "Reverso" });
    await expect(flipBackBtn).toHaveAttribute("aria-pressed", "false");
    const cardBtn = page.locator("[data-referrals-card]");
    await cardBtn.focus();
    await page.keyboard.press("Enter");
    await expect(flipBackBtn).toHaveAttribute("aria-pressed", "true");

    await page.waitForTimeout(400);
    const accountReferralsDarkA11y = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(accountReferralsDarkA11y.violations).toEqual([]);

    // Cambiar a Mi plan y a Preferencias con flechas
    await page.locator("#pl-acct-tab-referrals").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#pl-acct-tab-plan")).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/\?tab=plan/);
    await page.waitForTimeout(400);
    const accountPlanDarkA11y = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(accountPlanDarkA11y.violations).toEqual([]);

    await page.locator("#pl-acct-tab-plan").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#pl-acct-tab-prefs")).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/\?tab=prefs/);
    await page.waitForTimeout(400);
    const accountPrefsDarkA11y = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(accountPrefsDarkA11y.violations).toEqual([]);

    // Facturación está apagada en la beta: ?tab=cfdi abre «Mi plan» y no hay pestaña de CFDI.
    await expect(page.locator("#pl-acct-tab-cfdi")).toHaveCount(0);
    await page.goto("/app/account?tab=cfdi");
    await expect(page.locator("#pl-acct-tab-plan")).toHaveAttribute("aria-selected", "true");

    // Verificar Axe AA en modo claro en las tres pestañas
    await toggleClubTheme(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    for (const tabKey of ["prefs", "plan", "referrals"] as const) {
      await page.locator(`#pl-acct-tab-${tabKey}`).click();
      await page.waitForTimeout(400);
      const lightTabA11y = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      expect(lightTabA11y.violations, `Light Axe violations on account tab ${tabKey}`).toEqual([]);
    }
    await toggleClubTheme(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    // Enlace corto /i/JAIR-2611 -> /pricing/referral?code=JAIR-2611
    await page.goto("/i/JAIR-2611");
    await expect(page).toHaveURL(/\/pricing\/referral\?code=JAIR-2611/);

    // Volver al club para cerrar sesión
    await page.goto("/app/account");

    // Cerrar sesión -> limpia cookie y redirige a /
    await page.locator("[data-profile-menu-trigger]:visible").first().click();
    await page.locator(".pl-profile-menu:popover-open button", { hasText: "Salir" }).click();
    await page.waitForURL("**/");

    await page.goto("/app");
    await expect(page).toHaveURL(/\/login/);
  });

  test("4. Responsive viewports (zero horizontal scroll on /, /motores & /precio), /legal/creditos & /robots.txt", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const widths = [375, 390, 768, 1024, 1280, 1440];
    const responsiveRoutes = ["/", "/motores", "/precio"] as const;

    for (const route of responsiveRoutes) {
      await page.goto(route);
      for (const width of widths) {
        await page.setViewportSize({ width, height: 844 });
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        );
        expect(overflow, `Horizontal overflow on ${route} at ${width}px`).toBe(false);
      }
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
