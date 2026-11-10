import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import path from "node:path";

test("Club PitchLab v4: Jornada, Buscador, Parlays & SGP, Props Lab, Comunidad VIP, Tipstar y Referidos (+15d)", async ({
  page,
}, testInfo) => {
  const width = testInfo.project.name === "mobile" ? 390 : 1440;
  await page.setViewportSize({ width, height: 900 });

  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const uniqueIp = `198.51.${Math.floor(Math.random() * 200) + 10}.${Math.floor(Math.random() * 200) + 10}`;
  const unlock = await page.request.post("/api/beta/unlock", {
    headers: { "x-forwarded-for": uniqueIp },
    data: { code: "2026", next: "/app" },
  });
  expect(unlock.ok()).toBe(true);

  await page.goto("/app");
  await expect(page).toHaveURL(/\/app$/);
  await expect(
    page.getByRole("heading", { name: /Centro de Mando/i }),
  ).toBeVisible();

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
      await page.locator("[data-theme-toggle]").click();
      await page.waitForTimeout(150);
    }
  }

  // Regresar a oscuro
  await page.locator("[data-theme-toggle]").click();

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
    page.getByRole("heading", { name: /Armador Inteligente de Parlays/i }),
  ).toBeVisible();
  await page.locator("[data-generate-parlay]").click();
  await expect(page.getByRole("button", { name: /Sellar Parlay/i })).toBeEnabled();
  await page.getByRole("button", { name: /Sellar Parlay/i }).click();

  // 2) Player Props Lab interactivo
  await page.goto("/app/props");
  await expect(
    page.getByRole("heading", { name: /Player Props Lab Interactivo/i }),
  ).toBeVisible();
  const plusButtons = page.getByRole("button", { name: /Subir línea/i });
  if ((await plusButtons.count()) > 0) {
    await plusButtons.first().click();
  }

  // 3) Comunidad VIP exclusiva: bloqueo automático de enlaces externos (Telegram/WhatsApp)
  await page.goto("/app/social");
  await expect(
    page.getByRole("heading", { name: /Comunidad VIP/i }),
  ).toBeVisible();
  const socialTextarea = page.locator("textarea").first();
  await socialTextarea.fill("Únanse a mi grupo externo https://t.me/spam_picks");
  await page.getByRole("button", { name: /Publicar en Comunidad VIP/i }).click();
  await expect(page.locator("p[role='alert']")).toContainText(/enlaces externos/i);

  // Publicación limpia permitida
  await socialTextarea.fill(
    "Excelente lectura previa de Cortex IA en el cruce estelar; entré con 1.5u.",
  );
  await page.getByRole("button", { name: /Publicar en Comunidad VIP/i }).click();
  await expect(page.locator("body")).toContainText(
    "Excelente lectura previa de Cortex IA",
  );

  // 4) Portal Tipstar Creadores Oficiales: generar boleto 4:5 / 9:16 con código SOFIA5
  await page.goto("/app/tipstar");
  await expect(
    page.getByRole("heading", { name: /Portal Tipstar/i }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Generar Boleto 4:5 \/ 9:16 con mi Código/i })
    .click();
  const shareDialog = page.getByRole("dialog");
  await expect(shareDialog).toBeVisible();
  await expect(shareDialog).toContainText("SOFIA5");
  await page.getByRole("button", { name: "Cerrar vista de boleto" }).click();

  // 5) Cuenta & Referidos Doble Vía: simular primer pago de amigo (+15 días gratis para ambos)
  await page.goto("/app/account");
  await expect(page.locator("[data-referral-days]:visible")).toContainText("+30 días");
  await page.locator("[data-simulate-referral]:visible").click();
  await expect(page.locator("[data-referral-days]:visible")).toContainText("+45 días");

  expect(errors).toEqual([]);
});
