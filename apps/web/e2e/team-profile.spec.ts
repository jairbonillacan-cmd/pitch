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
    await expect(page.locator("[data-league-teams-directory]")).toBeVisible();

    const mtyLink = page
      .locator('a[href="/app/liga-mx/teams/monterrey"]')
      .first();
    await expect(mtyLink).toBeVisible();
    await mtyLink.click();

    await expect(page).toHaveURL(/\/app\/liga-mx\/teams\/monterrey/);
    const hero = page.locator('[data-team-hero="monterrey"]');
    await expect(hero).toBeVisible();
    await expect(hero.getByRole("heading", { level: 1 })).toContainText(/Monterrey/i);

    const modelSection = page.locator("[data-team-model-section]");
    await expect(modelSection).toBeVisible();
    await expect(modelSection).toContainText(/Tachyon v3\.0/i);

    const main = page.locator("#main");
    const tabResumen = main.getByRole("tab", { name: /Resumen/i });
    const tabPartidos = main.getByRole("tab", { name: /Partidos/i });
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

    // Navegación accesible por teclado y persistencia ?tab=partidos
    await tabResumen.focus();
    await page.keyboard.press("ArrowRight");
    await expect(tabPartidos).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/tab=partidos/);

    const matchesSection = page.locator("[data-team-matches-section]");
    await expect(matchesSection).toBeVisible();
    await expect(matchesSection.locator("[data-team-history-list] li").first()).toBeVisible();

    await matchesSection.getByRole("button", { name: "En casa" }).click();
    await expect(matchesSection.getByRole("button", { name: "En casa" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const nextTheme = await toggleTheme(page);
    expect(nextTheme).toBe("light");
    await assertNoHorizontalOverflow(page);
    await assertAxeClean(page);
    await saveShot(page, `equipo-ligamx-partidos-light-${vp}.png`);
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
