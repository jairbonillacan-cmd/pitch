import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import path from "node:path";

test("Inicio carga con la sesión de beta y funciona en los dos temas", async ({ page }, testInfo) => {
  const width = testInfo.project.name === "mobile" ? 375 : 1440;
  await page.setViewportSize({ width, height: 900 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const unlock = await page.request.post("/api/beta/unlock", {
    data: { code: "2026", next: "/app" },
  });
  expect(unlock.ok()).toBe(true);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: width === 375 ? "Lo más probable hoy" : "Hoy", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Lo más probable/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Esta noche" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Mis picks abiertos" })).toContainText("Ejemplo");
  await expect(page.getByRole("region", { name: "Movimientos de cuota" })).toContainText("Ejemplo");
  await expect(page.locator(".ph-standings tbody tr")).toHaveCount(3);

  for (const theme of ["dark", "light"]) {
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({
      path: path.resolve(process.cwd(), `../../test-results/screenshots/inicio-${width}-${theme}.png`),
      fullPage: true,
    });
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(violations).toEqual([]);
    if (theme === "dark") await page.locator("[data-theme-toggle]").click();
  }
  expect(await page.locator(".ph-content").innerText()).not.toMatch(/nflverse|openfootball|api-football|poisson|dixon-coles|pitágoras|log5/i);

  if (width === 375) {
    const more = page.getByRole("button", { name: "Más", exact: true });
    await more.click();
    const sheet = page.getByRole("dialog", { name: "Más" });
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText("Prueba Pro");
    await expect(sheet).toContainText("Ejemplo");
    await expect(sheet.getByRole("link", { name: "Ayuda y juego responsable" })).toHaveAttribute("href", "/legal/juego-responsable");
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(more).toBeFocused();
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
  } else {
    await page.keyboard.press("Control+k");
  }
  const search = page.getByRole("searchbox", { name: "Buscar equipo, jugador o partido" });
  await expect(search).toBeFocused();
  await search.fill("Liga MX");
  await expect(page.locator(".ph-search-results a").first()).toHaveAttribute("href", /\/app\/liga-mx\/games\//);
  if (width === 375) {
    await page.getByRole("dialog", { name: "Buscar" }).getByRole("button", { name: "Cerrar" }).click();
  } else {
    await page.keyboard.press("Escape");
  }

  const upcoming = page.getByRole("region", { name: "Próximos en tus ligas" });
  const nfl = upcoming.getByRole("radio", { name: "NFL" });
  await nfl.click();
  await expect(nfl).toHaveAttribute("aria-checked", "true");
  const matches = await upcoming.locator("tbody a").all();
  if (matches.length === 0) await expect(upcoming.getByRole("status")).toBeVisible();
  for (const match of matches) await expect(match).toHaveAttribute("href", /\/app\/nfl\/games\//);
  const gameCenter = page.getByRole("link", { name: "Abrir Game Center" });
  if (await gameCenter.isVisible()) {
    await gameCenter.click();
    await expect(page).toHaveURL(/\/app\/[^/]+\/games\/[^/]+$/);
    await expect(page.locator(".analysis-dialog")).toBeVisible();
  }
  expect(errors).toEqual([]);
});
