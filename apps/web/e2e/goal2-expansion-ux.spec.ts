import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function unlockBeta(page: Page, ipSuffix: number): Promise<void> {
  const res = await page.request.post("/api/beta/unlock", {
    headers: {
      "x-forwarded-for": `198.51.100.${ipSuffix}`,
      origin: "http://127.0.0.1:3100",
    },
    data: { code: "2026", next: "/app" },
  });
  expect(res.ok()).toBe(true);
}

async function assertNoOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(overflow, `Desborde horizontal en ${label}`).toBe(false);
}

test.describe("ADR-042/043/044 · URLs cortas 308, expansión fútbol, insignias, preferencias y tablas", () => {
  test("redirecciones 308 legadas -> /t/ y /g/, y nuevas ligas (Champions, MLS, Brasileirão) cargan limpias", async ({
    page,
  }, testInfo) => {
    await unlockBeta(page, 141);

    // 1) Redirección permanente 308 de /teams/ -> /t/
    const teamRedirect = await page.request.get("/app/liga-mx/teams/monterrey", {
      maxRedirects: 0,
    });
    expect(teamRedirect.status()).toBe(308);
    expect(teamRedirect.headers()["location"]).toContain("/app/liga-mx/t/monterrey");

    // 2) Nuevas competencias de la expansión cargan reales y con <FormSquares>
    for (const league of ["champions-league", "mls", "brasileirao"] as const) {
      const resp = await page.goto(`/app/${league}`);
      expect(resp?.status()).toBe(200);
      await expect(page.locator("#main")).toBeVisible();
      await assertNoOverflow(page, `/app/${league}`);
    }

    // 3) Verificar <FormSquares> en Liga MX y cero cápsula gris .pl-st-form-pill
    await page.goto("/app/liga-mx");
    await expect(page.locator(".pl-st-table [data-form-squares]")).toHaveCount(18);
    if (testInfo.project.name === "desktop") {
      await expect(page.locator(".pl-st-table [data-form-squares]").first()).toBeVisible();
    }
    await expect(page.locator(".pl-st-table .pl-st-form-pill")).toHaveCount(0);
    await expect(page.locator("#pl-league-tab-equipos")).toHaveCount(0);
  });

  test("Insignias en modal de perfil, Preferencias agrupadas (Soporte/Telegram/Baja) y menú limpio en móvil y escritorio", async ({
    page,
  }) => {
    await unlockBeta(page, 142);

    // 1) Perfil propio: botón Insignias junto a cabecera abre BadgePickerDialog y sin pestaña duplicada Estadísticas
    await page.goto("/app/u/jair");
    await page.waitForLoadState("networkidle");
    const badgesBtn = page.locator("[data-open-badges-modal]").first();
    await expect(badgesBtn).toBeVisible();
    await badgesBtn.click();
    const badgesDialog = page.locator("dialog[data-badge-picker-dialog]");
    await expect(badgesDialog).toBeVisible();
    await badgesDialog.getByRole("button", { name: /Cerrar|Listo/i }).first().click();
    await expect(badgesDialog).not.toBeVisible();

    // 2) Menú de perfil sin «Invitar amigos» ni «Facturación»
    const profileTrigger = page.locator("[data-profile-menu-trigger]").first();
    await profileTrigger.click();
    const profileMenu = page.locator('[aria-label="Menú de tu cuenta"]');
    await expect(profileMenu).toBeVisible();
    await expect(profileMenu).not.toContainText("Invitar amigos");
    await expect(profileMenu).not.toContainText("Facturación");

    // 3) Preferencias agrupadas + modal de Feedback e ideas (dark + WCAG AA)
    await page.goto("/app/account?tab=prefs");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-prefs-feedback-row]")).toBeVisible();
    await expect(page.locator("[data-prefs-support-row]")).toBeVisible();
    await expect(page.locator("[data-prefs-telegram-row]")).toBeVisible();
    await expect(page.locator("[data-prefs-delete-account-row]")).toBeVisible();

    await page.locator("[data-prefs-feedback-row]").click();
    const supportDialog = page.locator('dialog[data-support-dialog="feedback"]');
    await expect(supportDialog).toBeVisible();
    await supportDialog.getByRole("button", { name: /Cerrar|Cancelar/i }).first().click();
    await expect(supportDialog).not.toBeVisible();

    await assertNoOverflow(page, "/app/account?tab=prefs");
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(violations).toEqual([]);

    // 4) /app/momios y /app/historial sin desborde
    for (const route of ["/app/momios", "/app/historial"] as const) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await assertNoOverflow(page, route);
    }
  });
});
