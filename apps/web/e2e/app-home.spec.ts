import { expect, test } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
import path from "node:path";

/** En el club, el tema vive en el menú del perfil. */
async function toggleClubTheme(page: import("@playwright/test").Page): Promise<void> {
  await page.locator("[data-profile-menu-trigger]:visible").first().click();
  await page.locator(".pl-profile-menu:popover-open [data-theme-option][aria-pressed=\"false\"]").click();
  await page.keyboard.press("Escape");
}

test("Club PitchLab v4: Jornada, Buscador, Parlays & SGP, Props Lab, Comunidad VIP, Tipster y Referidos (+7d)", async ({
  page,
}, testInfo) => {
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
  await expect(page.getByRole("navigation", { name: "Elegir día" })).toBeVisible();
  const sportGroup = page.getByRole("group", { name: "Elegir deporte" });
  await expect(sportGroup).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tu parlay" })).toBeVisible();

  // Deporte → liga: elegir un deporte deja solo sus ligas y marca el botón
  const soccerTile = sportGroup.getByRole("button", { name: /^Fútbol\b/ }).first();
  if ((await soccerTile.count()) > 0) {
    await soccerTile.click();
    await expect(soccerTile).toHaveAttribute("aria-pressed", "true");
    await sportGroup.getByRole("button", { name: /Todos los deportes/ }).click();
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

  // 1) Armador Inteligente de Parlays & SGP
  await page.goto("/app/parlays");
  await expect(
    page.getByRole("heading", { name: /Armar parlay/i }),
  ).toBeVisible();
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
  await expect(page.locator("[data-referral-days]:visible")).toContainText("+14 días");
  await expect(page.locator("[data-example-badge]:visible").first()).toBeVisible();
  await expect(page.locator("#pl-acct-ref-link")).toHaveValue("pitchlab.mx/i/JAIR-2611");
  await page.locator("[data-copy-short-link]:visible").click();
  await expect(page.locator("[data-copy-short-link]:visible")).toHaveText("Copiado");
  await expect(page.locator("[data-simulate-referral]")).toHaveCount(0);

  expect(errors).toEqual([]);
});
