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

test.describe("Beta 1.0 · SPEI + cupón de 1 uso, páginas legales México y Axe AA", () => {
  test("1. superficie pública /precio (sin filtrar CLABE a visitantes), /canjear y redirecciones 308 en oscuro y claro", async ({
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
    // Un visitante sin sesión no debe recibir la CLABE bancaria en el HTML público
    expect(await page.content()).not.toContain("000000000000000000");
    await expect(page.locator("#transferencia")).toContainText("Inicia sesión para ver la cuenta destino");
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

  test("2. club con PIN beta: /app, /app/canjear, /app/account (Plan, Prefs, CFDI) y /app/tipster sin 401 ni overflow", async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
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

  test("3. SPEI con PIN beta: /precio referencia única y aviso pendiente; la Consola del fundador no se muestra (solo admin)", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const width = testInfo.project.name === "mobile" ? 390 : 1440;
    await page.setViewportSize({ width, height: 900 });

    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    const uniqueIp = `198.51.${Math.floor(Math.random() * 200) + 10}.${Math.floor(Math.random() * 200) + 10}`;
    const unlock = await page.request.post("/api/beta/unlock", {
      headers: { "x-forwarded-for": uniqueIp, origin: "http://127.0.0.1:3100" },
      data: { code: "2026", next: "/precio" },
    });
    expect(unlock.ok()).toBe(true);

    // Paso 1: en /precio el usuario con sesión ve la cuenta destino y su referencia única fácil de copiar
    await page.goto("/precio");
    const refLocator = page.locator("[data-precio-spei-ref]");
    await expect(refLocator).toBeVisible();
    const speiRef = ((await refLocator.textContent()) ?? "").trim();
    expect(speiRef).toMatch(/^PL-[A-Z0-9]+-[A-Z0-9]{4}$/);

    await expect(page.locator("[data-precio-spei-bank]")).toHaveText("Banco Ejemplo Test");
    await expect(page.locator("[data-precio-spei-beneficiary]")).toHaveText("PitchLab Demo Test");
    await expect(page.locator("[data-precio-spei-clabe]")).toHaveText("000000000000000000");

    const copyRefBtn = page.locator('[data-copy-spei="ref"]');
    await copyRefBtn.click();
    await expect(copyRefBtn).toContainText("Referencia copiada");

    await page.locator("[data-precio-origin-bank]").fill("BBVA México");
    await page.locator("[data-precio-tracking-key]").fill("SPEI-E2E-7788");
    await page.locator("[data-precio-spei-submit]").click();

    await expect(page.locator('[data-spei-state="pending_review"]')).toBeVisible();
    await expect(page.locator('[data-precio-spei-feedback="ok"]')).toContainText("noreply@pitchlab.mx");
    await assertNoHorizontalOverflow(page, "/precio con aviso SPEI");
    await assertNoForbiddenCopy(page, "/precio con aviso SPEI");

    const precioSpeiA11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(precioSpeiA11y.violations).toEqual([]);

    // Paso 2: la aprobación la hace el fundador en /app/admin, que es solo para administradores
    // verificados. Con el PIN beta la Consola no se muestra (notFound) aunque PITCHLAB_PREVIEW_TOOLS=1
    // (decisión 2026-11-14). Aprobar, emitir el cupón y canjearlo se cubre en
    // packages/ui/tests/preview-spei-store.test.ts.
    // Next ya empezó a transmitir la página (pantalla de carga), así que el código HTTP
    // puede ser 200: lo que se verifica es que la Consola y sus transferencias no salen.
    const adminPage = await page.request.get("/app/admin");
    const adminHtml = await adminPage.text();
    expect(adminHtml).not.toContain("Consola del fundador");
    expect(adminHtml).not.toContain("data-admin-transfer-row");

    // Paso 3: al volver a /precio el aviso sigue pendiente de revisión, sin cupón todavía
    await page.goto("/precio");
    await expect(page.locator('[data-spei-state="pending_review"]')).toBeVisible();
    await expect(page.locator("[data-precio-spei-ref]")).toHaveText(speiRef);

    // Paso 4: /canjear rechaza un código SPEI que no existe sin activar nada
    await page.goto("/canjear?codigo=PL-SPEI-NOEX-0000");
    await expect(page.locator('[data-coupon-preview="invalid"]')).toBeVisible();
    await expect(page.locator('[data-coupon-preview="invalid"]')).toContainText("No encontramos");
    await assertNoHorizontalOverflow(page, "/canjear con código inexistente");

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("4. páginas legales públicas para México (/legal/terminos, /legal/privacidad, /legal/juego-responsable, /legal/creditos y /baja) en oscuro y claro con Axe AA", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const width = testInfo.project.name === "mobile" ? 390 : 1440;
    await page.setViewportSize({ width, height: 900 });

    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    // 1) Términos de uso
    const termRes = await page.goto("/legal/terminos");
    expect(termRes?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Términos de uso");
    const termText = (await page.locator("body").textContent()) ?? "";
    expect(termText).toContain("mayores de 18 años");
    expect(termText).toContain("no es casa de apuestas");
    expect(termText).toContain("transferencia interbancaria SPEI");
    expect(termText).toContain("cupón personal de un solo uso");
    expect(termText).toContain("noreply@pitchlab.mx");
    expect(termText).toContain("Mi récord");
    expect(termText).toContain("Ranking");
    await assertNoHorizontalOverflow(page, "/legal/terminos (oscuro)");
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);

    await togglePublicTheme(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.waitForTimeout(200);
    await assertNoHorizontalOverflow(page, "/legal/terminos (claro)");
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
    await togglePublicTheme(page);

    // 2) Aviso de privacidad (LFPDPPP + Derechos ARCO + cookies + analítica + perfil público)
    const privRes = await page.goto("/legal/privacidad");
    expect(privRes?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Aviso de privacidad");
    const privText = (await page.locator("body").textContent()) ?? "";
    expect(privText).toContain("LFPDPPP");
    expect(privText).toContain("Derechos ARCO");
    expect(privText).toContain("20 días hábiles");
    expect(privText).toContain("15 días hábiles");
    expect(privText).toContain("Descargar mis datos");
    expect(privText).toContain("analyticsConsent");
    expect(privText).toContain("Cookies técnicas");
    expect(privText).toContain("Perfil público");
    await assertNoHorizontalOverflow(page, "/legal/privacidad (oscuro)");
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);

    await togglePublicTheme(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.waitForTimeout(200);
    await assertNoHorizontalOverflow(page, "/legal/privacidad (claro)");
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
    await togglePublicTheme(page);

    // 3) Juego responsable (+18, pausas voluntarias y Línea de la Vida)
    const jrRes = await page.goto("/legal/juego-responsable");
    expect(jrRes?.status()).toBe(200);
    const jrText = (await page.locator("body").textContent()) ?? "";
    expect(jrText).toContain("800 911 2000");
    expect(jrText).toContain("24 horas");
    expect(jrText).toContain("7 días");
    expect(jrText).toContain("30 días");
    expect(jrText).toContain("Pausar Comunidad");
    await assertNoHorizontalOverflow(page, "/legal/juego-responsable");
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);

    // 4) Créditos de datos (licencias abiertas obligatorias)
    const credRes = await page.goto("/legal/creditos");
    expect(credRes?.status()).toBe(200);
    const credText = (await page.locator("body").textContent()) ?? "";
    expect(credText).toContain("nflverse");
    expect(credText).toContain("CC-BY 4.0");
    expect(credText).toContain("openfootball");
    expect(credText).toContain("CC0");
    await assertNoHorizontalOverflow(page, "/legal/creditos");
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);

    // 5) /baja (preferencias de correo y remitentes transaccionales)
    const bajaRes = await page.goto("/baja");
    expect(bajaRes?.status()).toBe(200);
    const bajaText = (await page.locator("body").textContent()) ?? "";
    expect(bajaText).toContain("noreply@pitchlab.mx");
    expect(bajaText).toContain("acceso@pitchlab.mx");
    expect(bajaText).toContain("/app/account?tab=prefs");
    await assertNoHorizontalOverflow(page, "/baja");
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
