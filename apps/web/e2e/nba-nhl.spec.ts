import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

interface RawSnapshot {
  games: Array<{
    id: string;
    status: string;
    home: { name: string; shortName: string };
    away: { name: string; shortName: string };
  }>;
  analyses: Record<
    string,
    {
      projection?: { home: number; away: number; total: number };
      x12?: [number, number, number];
      marketGroups?: Array<{ group: string }>;
      factors?: Array<{ label: string; detail?: string }>;
    }
  >;
}

const E2E_DIR = path.dirname(fileURLToPath(import.meta.url));

function readRealSnapshot(league: "nba" | "nhl"): RawSnapshot {
  const file = path.resolve(E2E_DIR, `../../../data/snapshots/${league}/latest.json`);
  return JSON.parse(fs.readFileSync(file, "utf8")) as RawSnapshot;
}

const NBA_SNAP = readRealSnapshot("nba");
const NHL_SNAP = readRealSnapshot("nhl");

const NBA_SCHEDULED = NBA_SNAP.games.find(
  (g) => g.status === "scheduled" && Boolean(NBA_SNAP.analyses[g.id]),
)!;
const NHL_WITH_OT =
  NHL_SNAP.games.find(
    (g) =>
      g.status === "scheduled" &&
      Boolean(NHL_SNAP.analyses[g.id]?.factors?.some((f) => /tiempo extra/i.test(f.label))),
  ) ?? NHL_SNAP.games.find((g) => g.status === "scheduled" && Boolean(NHL_SNAP.analyses[g.id]))!;

const EMPTY_GAME = (() => {
  const nbaMissing = NBA_SNAP.games.find((g) => !NBA_SNAP.analyses[g.id]);
  if (nbaMissing) return { league: "nba" as const, game: nbaMissing };
  const nhlMissing = NHL_SNAP.games.find((g) => !NHL_SNAP.analyses[g.id]);
  if (nhlMissing) return { league: "nhl" as const, game: nhlMissing };
  return null;
})();

const SCREENSHOTS_DIR = path.resolve(E2E_DIR, "../test-results/screenshots");

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

test.describe("Fase 2 NBA y NHL en rutas reales", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (testInfo.project.name === "mobile") {
      await page.setViewportSize({ width: 375, height: 812 });
    }
    await unlockClub(page);
  });

  test("muestra NBA y NHL en el selector de /app y carga /app/nba y su ficha sin empate", async ({
    page,
  }, testInfo) => {
    const vp = testInfo.project.name === "mobile" ? "375px" : "desktop";
    const nbaAnalysis = NBA_SNAP.analyses[NBA_SCHEDULED.id]!;

    await page.goto("/app");
    const sportGroup = page.getByRole("group", { name: "Elegir deporte" });
    await expect(sportGroup.getByRole("button", { name: /Basquetbol/i })).toBeVisible();
    await expect(sportGroup.getByRole("button", { name: /Hockey/i })).toBeVisible();
    await assertNoHorizontalOverflow(page);

    await page.goto("/app/nba");
    await expect(page.getByRole("heading", { name: /NBA/i }).first()).toBeVisible();
    const nbaGamesTab = page.getByRole("tab", { name: /^Partidos/i });
    if ((await nbaGamesTab.count()) > 0) {
      await nbaGamesTab.click();
    }
    const firstNbaCard = page.locator("[data-game-card]").first();
    await expect(firstNbaCard).toBeVisible();
    await expect(firstNbaCard.getByLabel("Empate")).toHaveCount(0);
    await expect(firstNbaCard).not.toContainText("Tachyon");
    await assertNoHorizontalOverflow(page);
    await assertAxeClean(page);
    await saveShot(page, `nba-hub-dark-${vp}.png`);

    await page.goto(`/app/nba/games/${NBA_SCHEDULED.id}`);
    const main = page.locator("#main");
    const studio = page.locator("[data-match-studio]");
    await expect(studio).toBeVisible();
    await expect(studio).toContainText(NBA_SCHEDULED.home.name);
    await expect(studio).toContainText(NBA_SCHEDULED.away.name);
    await expect(studio).toContainText("Puntos esperados");
    if (nbaAnalysis.projection) {
      await expect(studio).toContainText(nbaAnalysis.projection.home.toFixed(1));
      await expect(studio).toContainText(nbaAnalysis.projection.away.toFixed(1));
    }
    await expect(studio.getByLabel("Empate")).toHaveCount(0);

    // Pestañas en móvil deben conservar área táctil >= 44 px.
    const tabs = main.getByRole("tab");
    expect(await tabs.count()).toBeGreaterThanOrEqual(3);
    if (vp === "375px") {
      const tabHeights = await tabs.evaluateAll((els) =>
        els.map((el) => Math.round(el.getBoundingClientRect().height)),
      );
      for (const h of tabHeights) {
        expect(h).toBeGreaterThanOrEqual(44);
      }
    }

    await assertNoHorizontalOverflow(page);
    await assertAxeClean(page);
    await saveShot(page, `nba-ficha-dark-${vp}.png`);

    // Mercados reales del snapshot (Ganador / Spread / Total / Puntos por equipo).
    await main.getByRole("tab", { name: /^Números/i }).click();
    const expectedGroup = nbaAnalysis.marketGroups?.[0]?.group;
    if (expectedGroup) {
      await expect(main).toContainText(expectedGroup);
    }
    await expect(main).not.toContainText("Ambos equipos anotan");

    // Verificar contraste y accesibilidad también en tema claro.
    const nextTheme = await toggleTheme(page);
    expect(nextTheme).toBe("light");
    await assertNoHorizontalOverflow(page);
    await assertAxeClean(page);
    await saveShot(page, `nba-ficha-light-${vp}.png`);
  });

  test("carga /app/nhl y su ficha con factor de tiempo extra o penales", async ({ page }, testInfo) => {
    const vp = testInfo.project.name === "mobile" ? "375px" : "desktop";
    const nhlAnalysis = NHL_SNAP.analyses[NHL_WITH_OT.id]!;

    await page.goto("/app/nhl");
    await expect(page.getByRole("heading", { name: /NHL/i }).first()).toBeVisible();
    const nhlGamesTab = page.getByRole("tab", { name: /^Partidos/i });
    if ((await nhlGamesTab.count()) > 0) {
      await nhlGamesTab.click();
    }
    const firstNhlCard = page.locator("[data-game-card]").first();
    await expect(firstNhlCard).toBeVisible();
    await expect(firstNhlCard.getByLabel("Empate")).toHaveCount(0);
    await expect(firstNhlCard).not.toContainText("Tachyon");
    await assertNoHorizontalOverflow(page);
    await assertAxeClean(page);
    await saveShot(page, `nhl-hub-dark-${vp}.png`);

    await page.goto(`/app/nhl/games/${NHL_WITH_OT.id}`);
    const main = page.locator("#main");
    const studio = page.locator("[data-match-studio]");
    await expect(studio).toBeVisible();
    await expect(studio).toContainText(NHL_WITH_OT.home.name);
    await expect(studio).toContainText(NHL_WITH_OT.away.name);
    if (nhlAnalysis.projection) {
      await expect(studio).toContainText(nhlAnalysis.projection.home.toFixed(2));
      await expect(studio).toContainText(nhlAnalysis.projection.away.toFixed(2));
    }
    const otPill = studio.locator("[data-overtime-pill]");
    await expect(otPill).toBeVisible();
    await expect(otPill).toContainText("Tiempo extra");
    await expect(otPill).toContainText("se define en tiempo extra o penales");

    // La píldora de prórroga no debe desbordarse fuera del contenedor a 375 px.
    const [studioBox, otBox] = await Promise.all([studio.boundingBox(), otPill.boundingBox()]);
    expect(studioBox).not.toBeNull();
    expect(otBox).not.toBeNull();
    expect(otBox!.x + otBox!.width).toBeLessThanOrEqual(studioBox!.x + studioBox!.width + 1);

    await expect(studio.getByLabel("Empate")).toHaveCount(0);
    await assertNoHorizontalOverflow(page);
    await assertAxeClean(page);
    await saveShot(page, `nhl-ficha-dark-${vp}.png`);

    await main.getByRole("tab", { name: /^Números/i }).click();
    const expectedGroup = nhlAnalysis.marketGroups?.[0]?.group;
    if (expectedGroup) {
      await expect(main).toContainText(expectedGroup);
    }
  });

  test("muestra estado vacío honesto cuando el snapshot omite pronóstico y confianza", async ({
    page,
  }, testInfo) => {
    test.skip(!EMPTY_GAME, "El snapshot actual ya incluye análisis para todos los partidos.");
    const vp = testInfo.project.name === "mobile" ? "375px" : "desktop";

    await page.goto(`/app/${EMPTY_GAME!.league}/games/${EMPTY_GAME!.game.id}`);
    const main = page.locator("#main");
    const studio = page.locator("[data-match-studio]");
    await expect(studio).toBeVisible();
    await expect(studio.locator("[data-empty-forecast]")).toBeVisible();
    await expect(studio).toContainText("Sin pronóstico");
    await expect(main).toContainText(/Aún no hay (picks|selecciones) publicad[ao]s/i);
    await main.locator('[data-section-tab="ia"]').click();
    await expect(main).toContainText("Sin lectura publicada");
    await expect(main).not.toContainText("Simulador del partido");
    await assertNoHorizontalOverflow(page);
    await assertAxeClean(page);
    await saveShot(page, `empty-forecast-${vp}.png`);
  });
});
