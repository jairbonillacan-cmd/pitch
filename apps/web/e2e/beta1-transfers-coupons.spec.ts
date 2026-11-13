import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const FORBIDDEN_BETA1_COPY: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: "tipstar", pattern: /\btipstar\b/i },
  { label: "seguro/garantizado", pattern: /\b(seguro|segura|garantizado|garantizada|infalible)\b/i },
  { label: "candado", pattern: /\bcandado\b/i },
  { label: "roi", pattern: /\broi\b/i },
  { label: "kelly", pattern: /\bkelly\b/i },
];

async function togglePublicTheme(page: Page): Promise<void> {
  await page.locator("[data-theme-toggle]:visible").first().click();
}

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

async function assertNoForbiddenCopy(page: Page, contextLabel: string): Promise<void> {
  const text = (await page.locator("body").textContent()) ?? "";
  for (const rule of FORBIDDEN_BETA1_COPY) {
    expect(text, `Copy prohibido (${rule.label}) en ${contextLabel}`).not.toMatch(rule.pattern);
  }
}

test.describe("Beta 1.0 · /canjear, /precio, Mi cuenta SPEI, cero 401 con PIN y Axe AA", () => {
  test("superficie pública /canjear y redirecciones 308 /plans|/pricing -> /precio en oscuro y claro", async ({
    page,
  }, testInfo) => {
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

    // Redirecciones 308 permanentes /plans y /pricing -> /precio preservando query
    for (const oldPath of ["/plans?ref=demo", "/pricing?ref=demo"]) {
      const r = await page.request.get(oldPath, { maxRedirects: 0 });
      expect(r.status(), `${oldPath} debe responder 308`).toBe(308);
      expect(r.headers().location).toContain("/precio");
    }

    await page.goto("/precio");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Un solo pase");
    await expect(page.locator("body")).toContainText("299");
    await page.getByRole("button", { name: /Anual/i }).click();
    await expect(page.locator("body")).toContainText("2,390");
    await assertNoHorizontalOverflow(page, "/precio");
    await assertNoForbiddenCopy(page, "/precio");

    // Ruta pública /canjear?codigo=BETA2026
    await page.goto("/canjear?codigo=BETA2026");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Canjea un cupón de acceso");

    const codeInput = page.locator('input[name="codigo"]');
    await expect(codeInput).toHaveValue("BETA2026");
    await assertNoHorizontalOverflow(page, "/canjear (oscuro)");
    await assertNoForbiddenCopy(page, "/canjear (oscuro)");

    const darkA11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(darkA11y.violations).toEqual([]);

    // Validación inline vacía + envío demostrativo sin cuentas activas
    await codeInput.fill("");
    await page.locator("[data-redeem-submit]").click();
    await expect(page.locator('[data-coupon-feedback="error"]')).toContainText("Escribe el código");

    await codeInput.fill("BETA2026");
    await page.locator("[data-redeem-submit]").click();
    await expect(page.locator('[data-coupon-feedback="success"]')).toContainText("BETA2026");

    // Tema claro + Axe AA + cero desborde horizontal
    await togglePublicTheme(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.waitForTimeout(250);
    await assertNoHorizontalOverflow(page, "/canjear (claro)");

    const lightA11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(lightA11y.violations).toEqual([]);

    expect(responses401, "No debe haber respuestas 401 en rutas públicas").toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("club con PIN beta: /app, /app/canjear, /app/account (Plan, Prefs, CFDI) y /app/tipster sin 401 ni overflow", async ({
    page,
  }, testInfo) => {
    // Recorre 4 páginas del Club con Axe en oscuro y claro: 60 s no alcanzan con la página real.
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
      data: { code: "2026", next: "/app" },
    });
    expect(unlock.ok()).toBe(true);

    // /app Inicio con PIN beta
    await page.goto("/app");
    await expect(page.locator("main")).toBeVisible();
    await assertNoHorizontalOverflow(page, "/app");

    // /app/canjear?codigo=BETA2026 dentro del Club (oscuro + claro + Axe AA)
    await page.goto("/app/canjear?codigo=BETA2026");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Canjea un cupón");
    await expect(page.locator('input[name="codigo"]')).toHaveValue("BETA2026");
    await assertNoHorizontalOverflow(page, "/app/canjear (oscuro)");
    await assertNoForbiddenCopy(page, "/app/canjear (oscuro)");

    const appCanjearDark = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(appCanjearDark.violations).toEqual([]);

    await toggleClubTheme(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.waitForTimeout(250);
    await assertNoHorizontalOverflow(page, "/app/canjear (claro)");

    const appCanjearLight = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(appCanjearLight.violations).toEqual([]);

    await toggleClubTheme(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    // /app/account?tab=plan en modo Beta 1.0 (oscuro + claro + Axe AA + sin overflow)
    await page.goto("/app/account?tab=plan");
    await expect(page.getByRole("heading", { level: 1, name: "Mi cuenta" })).toBeVisible();
    await expect(page.locator("body")).toContainText("Sin cobro automático");
    await expect(page.locator("body")).toContainText("Solo mayores de 18");
    await assertNoHorizontalOverflow(page, "/app/account?tab=plan (oscuro)");
    await assertNoForbiddenCopy(page, "/app/account?tab=plan");

    const planDarkA11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(planDarkA11y.violations).toEqual([]);

    await toggleClubTheme(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.waitForTimeout(250);
    await assertNoHorizontalOverflow(page, "/app/account?tab=plan (claro)");

    const planLightA11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(planLightA11y.violations).toEqual([]);

    await toggleClubTheme(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    // /app/account?tab=prefs y ?tab=cfdi (copy Beta 1.0 honesto y soporte@pitchlab.mx)
    await page.goto("/app/account?tab=prefs");
    await expect(page.locator("#pl-acct-tab-prefs")).toHaveAttribute("aria-selected", "true");
    await assertNoHorizontalOverflow(page, "/app/account?tab=prefs");

    // Facturación apagada en la beta: ?tab=cfdi cae en «Mi plan».
    await page.goto("/app/account?tab=cfdi");
    await expect(page.locator("#pl-acct-tab-plan")).toHaveAttribute("aria-selected", "true");
    await assertNoHorizontalOverflow(page, "/app/account?tab=cfdi");

    // /app/tipster sin "tipstar" ni overflow
    await page.goto("/app/tipster");
    await expect(page.locator("main")).toBeVisible();
    await assertNoHorizontalOverflow(page, "/app/tipster");
    await assertNoForbiddenCopy(page, "/app/tipster");

    expect(responses401, "Cero respuestas 401 navegando el Club con PIN de beta").toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
