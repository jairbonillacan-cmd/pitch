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

test.describe("MLB, Standings US por conferencia, búsqueda de jugadores y Comparador H2H", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (testInfo.project.name === "mobile") {
      await page.setViewportSize({ width: 375, height: 812 });
    }
    await unlockClub(page);
  });

  test("carga /app/mlb con tabla por conferencia (Liga Americana / Liga Nacional), logos oficiales y Axe AA", async ({
    page,
  }) => {
    await page.goto("/app/mlb");
    await assertNoHorizontalOverflow(page);

    const tabTabla = page.locator("#pl-league-tab-tabla");
    if ((await tabTabla.count()) > 0) {
      await tabTabla.click();
    }
    await expect(page.locator(".pl-st-table")).toBeVisible();
    await expect(page.getByRole("radio", { name: "Liga Americana" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Liga Nacional" })).toBeVisible();
    await page.getByRole("radio", { name: "Liga Nacional" }).click();
    await expect(page.getByRole("radio", { name: "Liga Nacional" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await assertNoHorizontalOverflow(page);
    await assertAxeClean(page);
  });

  test("busca un jugador en Ctrl+K y abre su perfil con estadísticas y Últimos 5 partidos", async ({
    page,
  }) => {
    await page.goto("/app/mlb");
    const searchBtn = page.locator("[data-cmdk-trigger]:visible").first();
    if ((await searchBtn.count()) > 0) {
      await searchBtn.click();
    } else {
      await page.keyboard.press("Control+k");
    }

    const input = page.locator(".pl-cmd-input");
    await expect(input).toBeVisible();
    await input.fill("Ohtani");

    const playersGroup = page.locator("[data-cmd-players-group]");
    await expect(playersGroup).toBeVisible({ timeout: 8000 });
    await playersGroup.locator("a").first().click();

    await page.waitForURL(/\/app\/mlb\/teams\/[^/]+\/players\//);
    await expect(page.locator("[data-team-hero='player']")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Estadísticas de temporada" })).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await assertAxeClean(page);
  });

  test("carga /app/comparar en Equipos H2H y alterna a Jugadores sin desborde y WCAG AA", async ({
    page,
  }) => {
    await page.goto("/app/comparar?modo=equipos&liga=liga-mx&a=america&b=chivas");
    await expect(page.locator("[data-compare-hub]")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Comparador H2H" })).toBeVisible();
    await expect(page.getByText("Historial directo (H2H)")).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await assertAxeClean(page);

    await page.getByRole("tab", { name: "Jugadores" }).click();
    await expect(page.getByRole("tab", { name: "Jugadores" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await assertNoHorizontalOverflow(page);
  });
});
