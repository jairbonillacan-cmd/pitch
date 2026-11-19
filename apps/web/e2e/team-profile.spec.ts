import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const E2E_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = path.resolve(E2E_DIR, "../test-results/screenshots");

function firstNbaTeamFromSnapshot(): { slug: string; name: string } {
  const file = path.resolve(E2E_DIR, "../../../data/snapshots/nba/latest.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
    games: Array<{ home: { id: string; name: string } }>;
  };
  const team = raw.games[0]!.home;
  const slug = team.id.includes(".") ? team.id.split(".")[1]! : team.id;
  return { slug, name: team.name };
}

const NBA_TEAM = firstNbaTeamFromSnapshot();

async function unlockClub(page: Page): Promise<void> {
  const uniqueIp = `198.51.${Math.floor(Math.random() * 200) + 10}.${Math.floor(Math.random() * 200) + 10}`;
  const unlock = await page.request.post("/api/beta/unlock", {
    headers: { "x-forwarded-for": uniqueIp, origin: "http://127.0.0.1:3100" },
    data: { code: "2026", next: "/app" },
  });
  expect(unlock.ok()).toBe(true);
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

async function assertAxeClean(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations).toEqual([]);
}

async function toggleTheme(page: Page): Promise<string> {
  const before = await page.evaluate(() => document.documentElement.dataset.theme ?? "dark");
  await page.locator("[data-profile-menu-trigger]:visible").click();
  await page.locator('.pl-profile-menu:popover-open [data-theme-option][aria-pressed="false"]').click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".pl-profile-menu:popover-open")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.theme ?? "dark"))
    .not.toBe(before);
  await page.waitForTimeout(300);
  return page.evaluate(() => document.documentElement.dataset.theme ?? "dark");
}

async function saveShot(page: Page, name: string): Promise<void> {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, name), fullPage: false });
}

test.describe("Perfiles de equipo multi-deporte y descubrimiento", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (testInfo.project.name === "mobile") {
      await page.setViewportSize({ width: 375, height: 812 });
    }
    await unlockClub(page);
  });

  test("navega desde Liga MX a un perfil de equipo, alterna pestañas por teclado y pasa WCAG + oscuro/claro", async ({
    page,
  }, testInfo) => {
    const vp = testInfo.project.name === "mobile" ? "375px" : "desktop";

    await page.goto("/app/liga-mx");
    await assertNoHorizontalOverflow(page);

    // Verificar tabla de Clasificación limpia (sin Local/Visitante ni Play-In en Liga MX) y leyenda
    const tabTabla = page.locator("#pl-league-tab-tabla");
    if ((await tabTabla.count()) > 0) {
      await tabTabla.click();
      await expect(tabTabla).toHaveAttribute("aria-selected", "true");
      await expect(page.locator(".pl-league-split-btn")).toHaveCount(0);
      const stTable = page.locator(".pl-st-table");
      await expect(stTable).toBeVisible();
      await expect(stTable).toContainText("Liguilla");
      await expect(stTable).not.toContainText("Play-In");
      if (vp === "desktop") {
        await expect(stTable.locator(".pl-st-form-pill")).toHaveCount(18);
      }
      await expect(page.locator(".pl-st-legend")).toBeVisible();
      await assertNoHorizontalOverflow(page);
    }

    await page.locator("#pl-league-tab-equipos").click();
    await expect(page.locator("#pl-league-tab-equipos")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("[data-league-teams-directory]")).toBeVisible();

    // Desplazar hacia abajo antes de navegar para comprobar que el cambio de ruta sube hasta arriba (scrollY === 0)
    await page.evaluate(() => window.scrollTo(0, 420));

    const mtyLink = page
      .locator('[data-league-teams-directory] a[href="/app/liga-mx/teams/monterrey"]')
      .first();
    await expect(mtyLink).toBeVisible();
    await mtyLink.click();

    await expect(page).toHaveURL(/\/app\/liga-mx\/teams\/monterrey/);
    const hero = page.locator('[data-team-hero="monterrey"]');
    await expect(hero).toBeVisible();
    await expect(hero.getByRole("heading", { level: 1 })).toContainText(/Monterrey/i);
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBeLessThanOrEqual(4);

    const modelSection = page.locator("[data-team-model-section]");
    await expect(modelSection).toBeVisible();
    await expect(modelSection).toContainText(/Tachyon v3\.0/i);
    await expect(page.locator("[data-team-coach-card]")).toBeVisible();

    const main = page.locator("#main");
    const tabResumen = main.getByRole("tab", { name: /Resumen/i });
    const tabEstadisticas = main.getByRole("tab", { name: /Estadísticas/i });
    const tabPlantilla = main.getByRole("tab", { name: /Plantilla/i });
    await expect(tabResumen).toHaveAttribute("aria-selected", "true");

    if (vp === "375px") {
      const heights = await main
        .getByRole("tab")
        .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
      for (const h of heights) {
        expect(h).toBeGreaterThanOrEqual(44);
      }
    }

    await assertNoHorizontalOverflow(page);
    await assertAxeClean(page);
    await saveShot(page, `equipo-ligamx-resumen-dark-${vp}.png`);

    // Navegación accesible por teclado hacia Estadísticas (tabla única sin solapamiento) + columna lateral de Partidos
    await tabResumen.focus();
    await page.keyboard.press("ArrowRight");
    await expect(tabEstadisticas).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/tab=estadisticas/);
    await expect(page.locator(".pl-team-stats-table")).toBeVisible();
    await assertNoHorizontalOverflow(page);

    // Pestaña Plantilla agrupada con retratos reales y navegación a ficha individual de jugador
    await tabPlantilla.click();
    await expect(tabPlantilla).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/tab=plantilla/);
    const squadSection = page.locator("[data-team-squad-section]");
    await expect(squadSection).toBeVisible();
    await expect(squadSection).toContainText("Porteros");
    await assertNoHorizontalOverflow(page);
    await assertAxeClean(page);

    const matchesSection = page.locator("[data-team-matches-section]");
    await expect(matchesSection).toBeVisible();
    await matchesSection.getByRole("button", { name: "Finalizados" }).click();
    await expect(matchesSection.locator("[data-team-history-list] li").first()).toBeVisible();

    const nextTheme = await toggleTheme(page);
    expect(nextTheme).toBe("light");
    await assertNoHorizontalOverflow(page);
    await assertAxeClean(page);
    await saveShot(page, `equipo-ligamx-partilla-light-${vp}.png`);

    // Entrar al perfil individual del primer jugador de la plantilla y verificar retrato + scroll arriba + Axe AA
    await page.evaluate(() => window.scrollTo(0, 380));
    const firstPlayerLink = squadSection.locator('a[href*="/players/"]').first();
    await expect(firstPlayerLink).toBeVisible();
    await firstPlayerLink.click();
    await expect(page).toHaveURL(/\/app\/liga-mx\/teams\/monterrey\/players\//);
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBeLessThanOrEqual(4);
    const playerHero = page.locator('[data-team-hero="player"]');
    await expect(playerHero).toBeVisible();
    await expect(playerHero.locator(".pl-person-avatar").first()).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await assertAxeClean(page);

    // Recarga directa SSR del perfil de jugador (club-route-guard.ts)
    await page.reload();
    await expect(page.locator('[data-team-hero="player"]')).toBeVisible();
  });

  test("renderiza NBA sin empates, carga NFL y permite buscar equipos desde el buscador", async ({
    page,
  }, testInfo) => {
    const vp = testInfo.project.name === "mobile" ? "375px" : "desktop";

    await page.goto(`/app/nba/teams/${NBA_TEAM.slug}`);
    const nbaHero = page.locator(`[data-team-hero="${NBA_TEAM.slug}"]`);
    await expect(nbaHero).toBeVisible();
    await expect(nbaHero).toContainText(NBA_TEAM.name);
    await expect(page.locator("[data-team-model-section]")).toContainText(/Motor NBA/i);
    await expect(page.locator("#main")).not.toContainText("Empates");

    await assertNoHorizontalOverflow(page);
    await assertAxeClean(page);
    await saveShot(page, `equipo-nba-dark-${vp}.png`);

    const lightTheme = await toggleTheme(page);
    expect(lightTheme).toBe("light");
    await assertNoHorizontalOverflow(page);
    await assertAxeClean(page);
    await saveShot(page, `equipo-nba-light-${vp}.png`);

    // Verificar también la nueva nómina NBA con retratos y cero desborde horizontal
    const nbaPlantillaTab = page.locator("#main").getByRole("tab", { name: /Plantilla/i });
    await nbaPlantillaTab.click();
    await expect(page.locator("[data-team-squad-section]")).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await assertAxeClean(page);

    // Probar buscador global hacia otro equipo
    await page.getByRole("button", { name: "Buscar" }).click();
    const searchInput = page.getByRole("dialog", { name: /Buscar en PitchLab/i }).locator("input").first();
    await searchInput.fill("Chiefs");
    const kcResult = page.locator('a[href="/app/nfl/teams/kansas-city-chiefs"]').first();
    await expect(kcResult).toBeVisible();
    await kcResult.click();

    await expect(page).toHaveURL(/\/app\/nfl\/teams\/kansas-city-chiefs/);
    await expect(page.locator('[data-team-hero="kansas-city-chiefs"]')).toBeVisible();
    await expect(page.locator("[data-team-model-section]")).toContainText(/Minkowski v3\.0/i);
    await assertNoHorizontalOverflow(page);

    // Equipo inexistente retorna 404 real
    const res404 = await page.goto("/app/liga-mx/teams/equipo-inexistente-404");
    expect(res404?.status()).toBe(404);
  });
});
