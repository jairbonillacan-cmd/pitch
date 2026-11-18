import { expect, test } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
import path from "node:path";

/** En el club, el tema vive en el menú del perfil. */
async function toggleClubTheme(page: import("@playwright/test").Page): Promise<void> {
  await page.locator("[data-profile-menu-trigger]:visible").first().click();
  await page.locator(".pl-profile-menu:popover-open [data-theme-option][aria-pressed=\"false\"]").click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".pl-profile-menu:popover-open")).toHaveCount(0);
  await page.waitForTimeout(250);
}

test("Club PitchLab v4: Jornada, Buscador, Parlays & SGP, Props Lab, Comunidad VIP, Tipster y Referidos (+7d)", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const width = testInfo.project.name === "mobile" ? 390 : 1440;
  await page.setViewportSize({ width, height: 900 });

  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const uniqueIp = `198.51.${Math.floor(Math.random() * 200) + 10}.${Math.floor(Math.random() * 200) + 10}`;
  const unlock = await page.request.post("/api/beta/unlock", {
    headers: { "x-forwarded-for": uniqueIp, origin: "http://127.0.0.1:3100" },
    data: { code: "2026", next: "/app" },
  });
  expect(unlock.ok()).toBe(true);

  await page.goto("/app");
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await expect(page.getByRole("group", { name: "Elegir día" })).toBeVisible();
  const sportGroup = page.getByRole("group", { name: "Elegir deporte" });
  await expect(sportGroup).toBeVisible();
  await expect(page.getByRole("group", { name: "Elegir liga" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tu boleto de parlay" })).toBeVisible();
  const dailyParlayTab = page.getByRole("tab", { name: /Parlay del día/i });
  await expect(dailyParlayTab).toBeVisible();
  await dailyParlayTab.click();
  await expect(page.locator("[data-daily-parlay-card]")).toBeVisible();
  await page.locator('[data-daily-risk="conservador"]').click();
  await page.locator('[data-daily-risk="arriesgado"]').click();
  await page.locator('[data-daily-risk="medio"]').click();
  await page.getByRole("tab", { name: /Tu parlay/i }).click();

  // Encabezado del Inicio: elegir NBA deja solo sus chips; avanzar con › hasta viernes; volver con Hoy; día vacío muestra «Ir al …».
  const nbaBtn = sportGroup.getByRole("button", { name: /NBA/i });
  await nbaBtn.click();
  await expect(nbaBtn).toHaveAttribute("aria-pressed", "true");
  const nbaChips = page.locator("[data-match-chip]");
  const nbaChipCount = await nbaChips.count();
  expect(nbaChipCount).toBeGreaterThan(0);
  const chipLeagues = await nbaChips.evaluateAll((els) =>
    els.map((el) => el.getAttribute("data-chip-league")),
  );
  expect(new Set(chipLeagues)).toEqual(new Set(["nba"]));

  // Desplazar tira de chips de partidos con las flechas laterales cuando hay desborde horizontal.
  await sportGroup.getByRole("button", { name: /Todos los deportes/ }).click();
  const chipsNext = page.locator("[data-chips-next]");
  if ((await chipsNext.count()) > 0 && (await chipsNext.isEnabled())) {
    await chipsNext.click();
    await expect(async () => {
      const sl = await page.locator("[data-day-chips]").evaluate((el) => el.scrollLeft);
      expect(sl).toBeGreaterThan(0);
    }).toPass({ timeout: 3_000 });
    const chipsPrev = page.locator("[data-chips-prev]");
    await expect(chipsPrev).toBeEnabled();
    await chipsPrev.click();
  }

  // Volver a Todos los deportes, avanzar con › hasta viernes 20 y regresar con Hoy.
  await sportGroup.getByRole("button", { name: /Todos los deportes/ }).click();
  const dayCenter = page.locator("[data-day-center]");
  const nextBtn = page.locator("[data-day-next]");
  for (let steps = 0; steps < 6; steps += 1) {
    const label = (await dayCenter.innerText()).trim().toLowerCase();
    if (label.startsWith("vie ")) break;
    if (await nextBtn.isDisabled()) break;
    await nextBtn.click();
  }
  await expect(dayCenter).toContainText(/^vie \d+/i);
  await dayCenter.click();
  await expect(dayCenter).toContainText("Hoy");

  let firstMatchHref: string | null = null;
  if (width <= 640) {
    await page.setViewportSize({ width: 375, height: 844 });
    const overflow375 = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow375).toBe(false);
    const touchHeights = await page
      .locator("[data-home-filterbar] button:not(:disabled)")
      .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
    for (const h of touchHeights) {
      expect(h).toBeGreaterThanOrEqual(44);
    }
    await page.setViewportSize({ width, height: 900 });
  }

  // Deporte → liga: si hoy Fútbol no tiene partidos, muestra «Ir al …» y salta al viernes con partidos.
  const soccerTile = sportGroup.getByRole("button", { name: /^Fútbol\b/ }).first();
  if ((await soccerTile.count()) > 0) {
    await soccerTile.click();
    await expect(soccerTile).toHaveAttribute("aria-pressed", "true");
    const dayEmpty = page.locator("[data-day-empty]");
    if ((await dayEmpty.count()) > 0) {
      await expect(dayEmpty).toContainText("Sin partidos este día");
      const jumpBtn = page.locator("[data-day-jump]");
      await expect(jumpBtn).toContainText(/^Ir al /);
      await jumpBtn.click();
    }
    const scheduledFootballLink = page
      .locator('[data-game-card]:has(button[aria-label^="Agregar al parlay"]) a[href^="/app/"][href*="/games/"]')
      .first();
    if ((await scheduledFootballLink.count()) > 0) {
      firstMatchHref = await scheduledFootballLink.getAttribute("href");
    }
    await dayCenter.click();
    await sportGroup.getByRole("button", { name: /Todos los deportes/ }).click();
  }
  if (!firstMatchHref) {
    firstMatchHref = await page
      .locator('a[href^="/app/"][href*="/games/"]')
      .first()
      .getAttribute("href");
  }

  // Agregar el pick principal de una tarjeta al parlay
  const addButton = page.locator("[data-game-card] button[aria-label^='Agregar al parlay']").first();
  if ((await addButton.count()) > 0) {
    await addButton.click();
    await expect(page.locator("[data-game-card] button[aria-label^='Quitar del parlay']").first()).toBeVisible();
  }

  // Verificar cero overflow y WCAG AA tanto en tema oscuro como en tema claro
  for (const theme of ["dark", "light"]) {
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasOverflow).toBe(false);

    await page.screenshot({
      path: path.resolve(
        process.cwd(),
        `../../test-results/screenshots/club-jornada-${width}-${theme}.png`,
      ),
      fullPage: false,
    });

    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(violations).toEqual([]);

    if (theme === "dark") {
      await toggleClubTheme(page);
      await page.waitForTimeout(150);
    }
  }

  // Regresar a oscuro
  await toggleClubTheme(page);

  // Buscador global (⌘K / botón Buscar)
  await page.getByRole("button", { name: "Buscar" }).click();
  const searchInput = page.getByRole("searchbox", {
    name: /Buscar equipo, liga, partido o módulo/i,
  });
  await expect(searchInput).toBeVisible();
  await searchInput.fill("NFL");
  await expect(
    page.getByRole("dialog", { name: "Buscar en PitchLab" }).locator('a[href^="/app/nfl/games/"]').first(),
  ).toBeVisible();
  await page
    .getByRole("dialog", { name: "Buscar en PitchLab" })
    .getByRole("button", { name: "Cerrar" })
    .click();

  // 1) Armador Inteligente de Parlays & Generador personal
  await page.goto("/app/parlays");
  await expect(
    page.getByRole("heading", { name: /Armar parlay/i }),
  ).toBeVisible();
  // Bajo carga, React puede dejar un instante la copia transmitida en un segmento oculto
  // antes de revelarla: se acota a la barra visible para no chocar con el modo estricto.
  const quickbar = page.locator("[data-personal-parlay-quickbar]:visible");
  await expect(quickbar).toHaveCount(1);
  await expect(quickbar).toBeVisible();
  await quickbar.locator('[data-quick-count="4"]').click();
  await quickbar.locator('[data-quick-risk="conservador"]').click();
  if (width <= 640) {
    await page.setViewportSize({ width: 375, height: 844 });
    const overflowParlays375 = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflowParlays375).toBe(false);
    await page.setViewportSize({ width, height: 900 });
  }
  await page.locator("[data-generate-parlay]").click();
  await expect(page.getByRole("button", { name: /Sellar Parlay/i })).toBeEnabled();
  await page.getByRole("button", { name: /Sellar Parlay/i }).click();

  // 2) Player Props Lab interactivo
  await page.goto("/app/props");
  await expect(
    page.getByRole("heading", { level: 1, name: /Props de jugadores/i }),
  ).toBeVisible();
  const plusButtons = page.getByRole("button", { name: /Subir línea/i });
  if ((await plusButtons.count()) > 0) {
    await plusButtons.first().click();
  }

  // 3) Comunidad VIP exclusiva: bloqueo automático de enlaces externos (Telegram/WhatsApp)
  await page.goto("/app/social");
  await expect(
    page.getByRole("heading", { name: /^Comunidad$/i }),
  ).toBeVisible();
  // En móvil el editor se abre desde la fila «Comparte un pick…».
  if ((page.viewportSize()?.width ?? 1280) <= 640) {
    await page.locator(".pl-com-composer-row:visible").first().click();
  }
  const socialComposer = page.locator("form.pl-com-composer:visible");
  const socialTextarea = socialComposer.locator("textarea");
  await socialTextarea.fill("Únanse a mi grupo externo https://t.me/spam_picks");
  await socialComposer.getByRole("button", { name: /^Publicar$/i }).click();
  await expect(page.locator("p[role='alert']")).toContainText(/enlaces externos/i);

  // Publicación limpia permitida
  await socialTextarea.fill(
    "Excelente lectura previa de Cortex IA en el cruce estelar; entré con 1.5u.",
  );
  await socialComposer.getByRole("button", { name: /^Publicar$/i }).click();
  await expect(page.locator("body")).toContainText(
    "Excelente lectura previa de Cortex IA",
  );

  // 4) Portal Tipster Creadores Oficiales: generar boleto 4:5 / 9:16 con código SOFIA5
  await page.goto("/app/tipster");
  await expect(
    page.getByRole("heading", { name: /Portal Tipster/i }),
  ).toBeVisible();
  // Esperar a que la página termine de hidratarse antes de pulsar (si no, el clic se pierde).
  await page.waitForLoadState("networkidle");
  await page
    .getByRole("button", { name: /Generar Boleto 4:5 \/ 9:16 con mi Código/i })
    .click();
  const shareDialog = page.getByRole("dialog");
  await expect(shareDialog).toBeVisible();
  await expect(shareDialog).toContainText("SOFIA5");
  await page.getByRole("button", { name: "Cerrar vista de boleto" }).click();

  // 5) Cuenta & Referidos (CUENTA-2): enlace corto, muestra marcada «Ejemplo» sin cuentas y cero simulador en producción
  await page.goto("/app/account");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("[data-referral-days]:visible")).toContainText("+14 días");
  await expect(page.locator("[data-example-badge]:visible").first()).toBeVisible();
  await expect(page.locator("#pl-acct-ref-link")).toHaveValue("pitchlab.mx/i/JAIR-2611");
  await expect(async () => {
    await page.locator("[data-copy-short-link]:visible").click();
    await expect(page.locator("[data-copy-short-link]:visible")).toHaveText("Copiado", {
      timeout: 1_500,
    });
  }).toPass({ timeout: 10_000 });
  await expect(page.locator("[data-simulate-referral]")).toHaveCount(0);

  // 6) Resultados: Parlays oficiales del día calificados + Calendario mensual de resultados diarios
  await page.goto("/app/historial");
  await expect(page.locator("[data-hist-daily-parlays]")).toBeVisible();
  const histCalBtn = page.locator("[data-historial-view-toggle] button", { hasText: "Calendario" });
  await histCalBtn.click();
  await expect(page.locator("[data-daily-results-calendar]")).toBeVisible();
  if (width <= 640) {
    await page.setViewportSize({ width: 375, height: 844 });
    const overflowHist375 = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflowHist375).toBe(false);
    await page.setViewportSize({ width, height: 900 });
  }

  // 6b) Explorar picks: chips de 1 toque y comparador manual
  await page.goto("/app/picks");
  await expect(page.locator('[data-finder-chip="probables"]')).toBeVisible();
  await page.locator('[data-finder-chip="probables"]').click();

  // 7) Ficha de partido: pestañas accesibles, números esperados y mercados derivados v3.2
  if (firstMatchHref) {
    await page.goto(firstMatchHref);
    const numbersTab = page.getByRole("tab", { name: /^Números/i });
    await expect(numbersTab).toBeVisible();
    await numbersTab.click();
    await expect(numbersTab).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/\?tab=numeros$/);
    await expect(page.locator("[data-numbers-expected]")).toBeVisible();
    await expect(page.locator(".pl-mkt-wrap")).toBeVisible();
    await expect(page.getByText(/Derivado del motor/i).first()).toBeVisible();
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/\b(Poisson|Dixon-Coles|sigma|matriz|tipstar)\b/i);
    if (width <= 640) {
      await page.setViewportSize({ width: 375, height: 844 });
      const overflowMatch375 = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflowMatch375).toBe(false);
      await page.setViewportSize({ width, height: 900 });
    }
  }

  expect(errors).toEqual([]);
});

test("Modo Sólido unificado en /app: sin opción Cristal, diferenciación real fondo/tarjetas y Axe AA en oscuro y claro", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const width = testInfo.project.name === "mobile" ? 390 : 1440;
  await page.setViewportSize({ width, height: 900 });

  const uniqueIp = `198.51.${Math.floor(Math.random() * 200) + 10}.${Math.floor(Math.random() * 200) + 10}`;
  const unlock = await page.request.post("/api/beta/unlock", {
    headers: { "x-forwarded-for": uniqueIp, origin: "http://127.0.0.1:3100" },
    data: { code: "2026", next: "/app" },
  });
  expect(unlock.ok()).toBe(true);

  await page.addInitScript(() => {
    window.localStorage.setItem("pl-style", "glass");
  });

  await page.goto("/app");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-style", "solid");
  await expect(page.locator(".pl-atmo")).toBeHidden();

  const surfaceCheck = await page.evaluate(() => {
    const stage = document.querySelector(".pl-stage");
    const card = document.querySelector(".pl-home-card, .pl-astro-league-block, .glass-card");
    const header = document.querySelector(".panel-header");
    return {
      stageBg: stage ? getComputedStyle(stage).backgroundColor : null,
      cardBg: card ? getComputedStyle(card).backgroundColor : null,
      headerBg: header ? getComputedStyle(header).backgroundColor : null,
    };
  });
  expect(surfaceCheck.stageBg).not.toBe("rgb(0, 0, 0)");
  expect(surfaceCheck.cardBg).not.toBeNull();
  expect(surfaceCheck.cardBg).not.toBe(surfaceCheck.stageBg);
  expect(surfaceCheck.headerBg).not.toBe(surfaceCheck.stageBg);

  await page.screenshot({
    path: `../../test-results/screenshots/app-home-${testInfo.project.name}-dark.png`,
    fullPage: false,
  });

  const darkAxe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(darkAxe.violations.map((v) => v.id)).toEqual([]);

  await page.locator("[data-profile-menu-trigger]:visible").first().click();
  const menu = page.locator(".pl-profile-menu:popover-open");
  await expect(menu.getByRole("group", { name: "Estilo" })).toHaveCount(0);
  await expect(menu.getByText("Cristal")).toHaveCount(0);
  await menu.locator('[data-theme-option="light"]').click();
  await expect(html).toHaveAttribute("data-theme", "light");
  await expect(html).toHaveAttribute("data-style", "solid");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  await page.screenshot({
    path: `../../test-results/screenshots/app-home-${testInfo.project.name}-light.png`,
    fullPage: false,
  });

  const lightAxe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(lightAxe.violations.map((v) => v.id)).toEqual([]);
});
