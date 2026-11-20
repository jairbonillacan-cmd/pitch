import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

async function unlockClub(page: Page): Promise<void> {
  const uniqueIp = `198.51.${Math.floor(Math.random() * 200) + 10}.${Math.floor(Math.random() * 200) + 10}`;
  const unlock = await page.request.post("/api/beta/unlock", {
    headers: { "x-forwarded-for": uniqueIp, origin: "http://127.0.0.1:3100" },
    data: { code: "2026", next: "/app" },
  });
  expect(unlock.ok()).toBe(true);
}

async function assertNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const diff = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(diff, `Overflow horizontal (${diff}px) en ${label}`).toBeLessThanOrEqual(1);
}

async function assertAxeClean(page: Page, label: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.help}`),
    `Violaciones Axe WCAG AA en ${label}`,
  ).toEqual([]);
}

test.describe("Integración web y fluidez móvil multi-breakpoint", () => {
  test.beforeEach(async ({ page }) => {
    await unlockClub(page);
  });

  test("1. Matriz móvil (320/375/390/768 px) y web (1440 px): Inicio, Calendario, Campana, Menú 0.0.1-alpha, Bundesliga, Bayern, Jugador, Selección México y 404 sin scroll", async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const pageErrors: string[] = [];
    const serverErrors: string[] = [];

    page.on("pageerror", (err) => pageErrors.push(err.message));
    page.on("response", (res) => {
      if (res.status() >= 500 && res.url().startsWith("http://127.0.0.1:3100")) {
        serverErrors.push(`${res.status()} ${res.url()}`);
      }
    });

    const widths =
      testInfo.project.name === "mobile" ? [320, 375, 390] : [768, 1440];

    // 1) Inicio (/app): calendario interactivo, campana, menú con semver 0.0.1-alpha sin scrollbar y dock móvil
    await page.goto("/app");
    for (const w of widths) {
      await page.setViewportSize({ width: w, height: w <= 390 ? 812 : 900 });
      await assertNoHorizontalOverflow(page, `/app @ ${w}px`);

      const dayCenter = page.locator("[data-day-center]");
      await expect(dayCenter).toBeVisible();
      await dayCenter.click();
      const cal = page.locator("[data-home-calendar-popover]");
      await expect(cal).toBeVisible();
      const box = await cal.boundingBox();
      expect(box, `Calendario visible @ ${w}px`).not.toBeNull();
      expect(box!.x, `Calendario no se corta a la izquierda @ ${w}px`).toBeGreaterThanOrEqual(0);
      expect(
        Math.round(box!.x + box!.width),
        `Calendario no se corta a la derecha @ ${w}px`,
      ).toBeLessThanOrEqual(w + 1);
      await page.keyboard.press("Escape");
      await expect(cal).toHaveCount(0);
    }

    // Verificar menú de perfil con semver 0.0.1-alpha y barra oculta + campana de notificaciones
    const checkWidth = testInfo.project.name === "mobile" ? 375 : 1440;
    await page.setViewportSize({ width: checkWidth, height: 844 });

    await page.locator(".pl-bell-btn:visible").first().click();
    await expect(page.locator(".pl-notif-menu:popover-open")).toBeVisible();
    await assertNoHorizontalOverflow(page, `Campana abierta @ ${checkWidth}px`);
    await page.keyboard.press("Escape");
    await expect(page.locator(".pl-notif-menu:popover-open")).toHaveCount(0);

    await page.locator("[data-profile-menu-trigger]:visible").first().click();
    const profMenu = page.locator(".pl-profile-menu:popover-open");
    await expect(profMenu).toBeVisible();
    await expect(profMenu).toContainText("0.0.1-alpha");
    const scrollbarWidth = await profMenu.evaluate((el) => getComputedStyle(el).scrollbarWidth);
    expect(scrollbarWidth).toBe("none");
    await page.keyboard.press("Escape");
    await expect(profMenu).toHaveCount(0);

    if (testInfo.project.name === "mobile") {
      const moreTrigger = page.locator("[data-mobile-more-trigger]:visible");
      await expect(moreTrigger).toBeVisible();
      await moreTrigger.click();
      await expect(page.getByRole("dialog", { name: "Más del Club" })).toBeVisible();
      await assertNoHorizontalOverflow(page, "Hoja Más móvil @ 375px");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: "Más del Club" })).toHaveCount(0);
    }

    // 2) Hub de Liga (/app/bundesliga): 2 columnas, Clasificaciones con zonas y leyenda desplegable
    await page.goto("/app/bundesliga");
    await expect(page.locator('[data-league-hero="bundesliga"]')).toBeVisible();
    await expect(page.locator("#pl-league-tab-tabla")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".pl-st-table")).toBeVisible();

    const legendSummary = page.locator(".pl-st-legend-summary");
    await expect(legendSummary).toBeVisible();
    await expect(page.locator(".pl-st-legend[open]")).toBeVisible();
    await legendSummary.click();
    await expect(page.locator(".pl-st-legend[open]")).toHaveCount(0);
    await legendSummary.click();
    await expect(page.locator(".pl-st-legend[open]")).toBeVisible();

    for (const w of widths) {
      await page.setViewportSize({ width: w, height: w <= 390 ? 812 : 900 });
      await assertNoHorizontalOverflow(page, `/app/bundesliga (leyenda abierta) @ ${w}px`);
    }
    await page.setViewportSize({ width: checkWidth, height: 844 });
    await assertAxeClean(page, `/app/bundesliga @ ${checkWidth}px`);

    // 3) Perfil de Bayern München (entrenador Vincent Kompany + foto + Estadísticas + Plantilla + Jugador)
    await page.goto("/app/bundesliga/teams/bayern-munchen");
    const bayernHero = page.locator('[data-team-hero="bayern-munchen"]');
    await expect(bayernHero).toBeVisible();
    await expect(bayernHero).toContainText("Vincent Kompany");
    await expect(page.locator("[data-team-coach-card]")).toContainText("Vincent Kompany");

    // PlSelect curado en riel derecho de Partidos
    const matchesSelectTrigger = page
      .locator("[data-team-matches-section] [data-pl-select] button")
      .first();
    if ((await matchesSelectTrigger.count()) > 0) {
      await matchesSelectTrigger.click();
      await expect(page.locator(".pl-select-listbox")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.locator(".pl-select-listbox")).toHaveCount(0);
    }

    // Cambiar a Plantilla y comprobar cero overflow incluso a 320 px
    await page.locator("#main").getByRole("tab", { name: /Plantilla/i }).click();
    const bayernSquad = page.locator("[data-team-squad-section]");
    await expect(bayernSquad).toBeVisible();
    await expect(bayernSquad).toContainText("Delanteros");
    await expect(bayernSquad).toContainText("Porteros");

    for (const w of widths) {
      await page.setViewportSize({ width: w, height: w <= 390 ? 812 : 900 });
      await assertNoHorizontalOverflow(page, `/app/bundesliga/teams/bayern-munchen?tab=plantilla @ ${w}px`);
    }
    await page.setViewportSize({ width: checkWidth, height: 844 });
    await assertAxeClean(page, `Bayern Plantilla @ ${checkWidth}px`);

    // Navegar a perfil de jugador y validar retrato LCP, DT, bio y cero overflow
    const playerLink = bayernSquad.locator('a[href*="/p/"]').first();
    await playerLink.click();
    await expect(page).toHaveURL(/\/app\/bundesliga\/t\/bayern-munchen\/p\//);
    const playerHero = page.locator('[data-team-hero="player"]');
    await expect(playerHero).toBeVisible();
    await expect(playerHero).toContainText("DT: Vincent Kompany");
    for (const w of widths) {
      await page.setViewportSize({ width: w, height: w <= 390 ? 812 : 900 });
      await assertNoHorizontalOverflow(page, `Perfil jugador Bayern @ ${w}px`);
    }
    await page.setViewportSize({ width: checkWidth, height: 844 });
    await assertAxeClean(page, `Perfil jugador Bayern @ ${checkWidth}px`);

    // 4) Selección nacional (/app/copa-del-mundo/teams/mexico) + NFL (/app/nfl/teams/kansas-city-chiefs?tab=plantilla)
    await page.goto("/app/copa-del-mundo/teams/mexico?tab=plantilla");
    await expect(page.locator('[data-team-hero="mexico"]')).toContainText("Rafael Márquez");
    await expect(page.locator("[data-team-squad-section]")).toBeVisible();
    await assertNoHorizontalOverflow(page, `Selección México @ ${checkWidth}px`);

    await page.goto("/app/nfl/teams/kansas-city-chiefs?tab=plantilla");
    await expect(page.locator('[data-team-hero="kansas-city-chiefs"]')).toContainText("Andy Reid");
    await expect(page.locator("[data-team-squad-section]")).toBeVisible();
    await assertNoHorizontalOverflow(page, `Chiefs NFL Plantilla @ ${checkWidth}px`);

    // 5) Perfil propio (/app/u/socio_pl): insignias compactas con tooltip dentro del viewport y cierre con Escape
    await page.goto("/app/u/socio_pl");
    const firstBadgeTrigger = page.locator(".pl-badge-tile-trigger").first();
    if ((await firstBadgeTrigger.count()) > 0) {
      await firstBadgeTrigger.click();
      const openTooltip = page.locator('.pl-badge-tile[data-tip-open="true"] [role="tooltip"]');
      await expect(openTooltip).toBeVisible();
      const tipBox = await openTooltip.boundingBox();
      expect(tipBox).not.toBeNull();
      expect(tipBox!.x).toBeGreaterThanOrEqual(0);
      expect(Math.round(tipBox!.x + tipBox!.width)).toBeLessThanOrEqual(checkWidth + 1);
      await assertNoHorizontalOverflow(page, `Insignias con tooltip abierto @ ${checkWidth}px`);
      await page.keyboard.press("Escape");
      await expect(page.locator('.pl-badge-tile[data-tip-open="true"]')).toHaveCount(0);
    }

    // 6) Pantalla 404 centrada sin scroll vertical ni horizontal incluso en teléfono corto (375 × 667)
    const errVp =
      testInfo.project.name === "mobile"
        ? { width: 375, height: 667 }
        : { width: 1440, height: 900 };
    await page.setViewportSize(errVp);
    const res404 = await page.goto("/app/pantalla-inexistente-prueba-404");
    expect(res404?.status()).toBe(404);
    await expect(page.locator(".pl-notfound")).toBeVisible();
    const scrollMetrics = await page.evaluate(() => ({
      vOverflow: document.documentElement.scrollHeight - window.innerHeight,
      hOverflow: document.documentElement.scrollWidth - window.innerWidth,
    }));
    expect(
      scrollMetrics.hOverflow,
      `404 sin scroll horizontal @ ${errVp.width}x${errVp.height}`,
    ).toBeLessThanOrEqual(1);
    expect(
      scrollMetrics.vOverflow,
      `404 sin scroll vertical @ ${errVp.width}x${errVp.height}`,
    ).toBeLessThanOrEqual(2);

    expect(serverErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
