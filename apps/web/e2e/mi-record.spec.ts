import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

async function toggleClubTheme(page: Page): Promise<void> {
  await page.locator("[data-profile-menu-trigger]:visible").first().click();
  await page.locator('.pl-profile-menu:popover-open [data-theme-option][aria-pressed="false"]').click();
  await page.keyboard.press("Escape");
}

async function assertNoHorizontalOverflow(page: Page, contextLabel: string): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow, `Desbordamiento horizontal detectado en ${contextLabel}`).toBe(false);
}

async function assertAxeClean(page: Page, label: string): Promise<void> {
  await expect(page.locator(".pl-toast-item")).toHaveCount(0, { timeout: 6000 });
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations, `Violaciones Axe WCAG AA en ${label}`).toEqual([]);
}

test("Mi récord (/app/lab): 3 pestañas, banca privada MXN, privacidad con vista previa en vivo, cero 401 y Axe AA en oscuro y claro", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const width = testInfo.project.name === "mobile" ? 390 : 1440;
  await page.setViewportSize({ width, height: 900 });

  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const responses401: string[] = [];

  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("response", (res) => {
    if (res.status() === 401) responses401.push(`${res.status()} ${res.url()}`);
  });

  const uniqueIp = `198.51.${Math.floor(Math.random() * 200) + 10}.${Math.floor(Math.random() * 200) + 10}`;
  const unlock = await page.request.post("/api/beta/unlock", {
    headers: { "x-forwarded-for": uniqueIp, origin: "http://127.0.0.1:3100" },
    data: { code: "2026", next: "/app/lab" },
  });
  expect(unlock.ok()).toBe(true);

  // 1) Pestaña Picks (por defecto)
  await page.goto("/app/lab");
  await expect(page.locator("#main").getByRole("heading", { level: 1, name: "Mi récord" })).toBeVisible();
  await expect(page.locator("#main #pl-rec-tab-picks:visible")).toHaveAttribute("aria-selected", "true");
  await assertNoHorizontalOverflow(page, "/app/lab?tab=picks (oscuro)");

  await assertAxeClean(page, "/app/lab?tab=picks (oscuro)");

  // 2) Pestaña Banca y estadísticas: guardar banca privada y validar ROI
  await page.locator("#main #pl-rec-tab-banca:visible").click();
  await expect(page.locator("#main #pl-rec-tab-banca:visible")).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/\?tab=banca/);

  const bankInput = page.locator('#main input[name="bankrollStartMxn"]:visible');
  await expect(bankInput).toBeVisible();
  await bankInput.fill("abc");
  await page.locator("#main").getByRole("button", { name: "Guardar banca" }).click();
  await expect(page.locator("#main .pl-rec-error:visible")).toContainText("monto válido");

  await bankInput.fill("5000");
  await page.locator("#main").getByRole("button", { name: "Guardar banca" }).click();
  await expect(page.locator("#main [data-private-bankroll-summary]:visible")).toContainText("$5,000 MXN");
  await expect(page.locator("#main [data-bitacora-mxn-balance]:visible")).toBeVisible();
  await assertNoHorizontalOverflow(page, "/app/lab?tab=banca (oscuro)");

  await assertAxeClean(page, "/app/lab?tab=banca (oscuro)");

  // 3) Pestaña Privacidad: interruptores y vista previa en vivo
  await page.locator("#main #pl-rec-tab-privacidad:visible").click();
  await expect(page.locator("#main #pl-rec-tab-privacidad:visible")).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/\?tab=privacidad/);

  const previewVisible = page.locator('#main [data-public-record-state="visible"]:visible');
  await expect(previewVisible).toBeVisible();
  // Nunca aparecen montos en pesos en la vista previa pública
  await expect(previewVisible).not.toContainText("5,000");
  await expect(previewVisible).not.toContainText("MXN");
  await assertNoHorizontalOverflow(page, "/app/lab?tab=privacidad (oscuro)");

  await assertAxeClean(page, "/app/lab?tab=privacidad (oscuro)");

  // Cambiar a tema claro y validar Axe AA + cero desborde horizontal
  await toggleClubTheme(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.waitForTimeout(200);
  await assertNoHorizontalOverflow(page, "/app/lab?tab=privacidad (claro)");

  await assertAxeClean(page, "/app/lab?tab=privacidad (claro)");

  // Apagar interruptor maestro -> vista previa pasa a Récord privado
  const masterSwitch = page
    .locator("#main .pl-rec-priv-controls > section")
    .first()
    .locator(".pl-rec-priv-row")
    .first()
    .locator('[data-slot="switch-content"]');
  await masterSwitch.click();
  await expect(page.locator('#main [data-public-record-state="hidden"]:visible')).toBeVisible();

  // Volver a encender maestro y apagar un bloque individual -> vista previa y contador actualizan en vivo
  await masterSwitch.click();
  await expect(page.locator('#main [data-public-record-state="visible"]:visible')).toBeVisible();
  const recordBlockSwitch = page
    .locator('#main [data-privacy-block="record"] .pl-rec-priv-block-head [data-slot="switch-content"]');
  await recordBlockSwitch.click();
  await expect(page.locator('#main [data-privacy-block="record"] .pl-pill:visible')).toHaveText("Oculto");

  expect(responses401, "Cero respuestas 401 en /app/lab con PIN beta").toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
