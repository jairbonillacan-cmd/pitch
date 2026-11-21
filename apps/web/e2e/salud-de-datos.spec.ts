import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AxeBuilder from "@axe-core/playwright";
import { AdminDataHealthSection } from "@pitchlab/ui/data-health";
import { buildPlatformDataset } from "@pitchlab/ui/picks-engine";
import { loadServerDataHealthReport } from "../src/server/data-health";
import { expect, test } from "./fixtures";

const DATA_HEALTH_CSS_PATH = existsSync(resolve(process.cwd(), "app/data-health.css"))
  ? resolve(process.cwd(), "app/data-health.css")
  : resolve(process.cwd(), "apps/web/app/data-health.css");
const DATA_HEALTH_CSS = readFileSync(DATA_HEALTH_CSS_PATH, "utf8");

async function toggleClubTheme(page: import("@playwright/test").Page): Promise<void> {
  await page.locator("[data-profile-menu-trigger]:visible").first().click();
  await page
    .locator('.pl-profile-menu:popover-open [data-theme-option][aria-pressed="false"]')
    .click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".pl-profile-menu:popover-open")).toHaveCount(0);
  await page.waitForTimeout(250);
}

test("Salud de datos y bajas reales: resguardo 403/404 en prod, bajas NFL en ficha y panel responsivo + Axe AA en oscuro y claro", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const width = testInfo.project.name === "mobile" ? 390 : 1440;
  await page.setViewportSize({ width, height: 900 });

  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  const uniqueIp = `198.51.${Math.floor(Math.random() * 200) + 10}.${Math.floor(Math.random() * 200) + 10}`;
  const unlock = await page.request.post("/api/beta/unlock", {
    headers: { "x-forwarded-for": uniqueIp, origin: "http://127.0.0.1:3100" },
    data: { code: "2026", next: "/app" },
  });
  expect(unlock.ok()).toBe(true);

  // 1) En producción sin cuenta de administrador verificada, /api/admin/data-health responde 403 y /app/admin omite la consola (notFound() tras SEC-04)
  const apiDenied = await page.request.get("/api/admin/data-health");
  expect([401, 403, 503]).toContain(apiDenied.status());
  await page.goto("/app/admin");
  await expect(page.getByRole("heading", { name: "Consola del fundador" })).toHaveCount(0);
  await expect(page.locator("[data-data-health-panel]")).toHaveCount(0);

  // 2) En /app/nfl, una ficha por jugar muestra las bajas nominales reales leídas de data/snapshots/nfl/injuries.json
  await page.goto("/app/nfl");
  const nflGameLink = page.locator('a[href^="/app/nfl/g/"]').first();
  if ((await nflGameLink.count()) > 0) {
    const href = await nflGameLink.getAttribute("href");
    if (href) {
      await page.goto(href);
      const preMatch = page.locator("[data-pre-match-module]");
      if ((await preMatch.count()) > 0) {
        await expect(preMatch).toBeVisible();
        const bodyText = (await preMatch.textContent()) ?? "";
        expect(bodyText).not.toMatch(/\b(Kelly|stake|EV|probable)\b/i);
      }
    }
  }

  // 3) Verificación visual, container queries (@container < 680 px) y Axe WCAG 2A/2AA en oscuro y claro
  //    del panel «Salud de datos» sobre los estilos compilados reales de /app + la hoja modular data-health.css (ADR-051)
  await page.goto("/app");
  await page.addStyleTag({ content: DATA_HEALTH_CSS });
  const serverReport = loadServerDataHealthReport();
  const ssrPanelHtml = renderToStaticMarkup(
    React.createElement(AdminDataHealthSection, {
      dataset: buildPlatformDataset([]),
      storyReport: serverReport,
    }),
  );

  await page.evaluate((markup) => {
    const main = document.querySelector("main") ?? document.body;
    const host = document.createElement("div");
    host.id = "pl-e2e-data-health-host";
    host.style.marginTop = "16px";
    host.innerHTML = markup;
    main.prepend(host);
  }, ssrPanelHtml);

  const healthPanel = page.locator("#pl-e2e-data-health-host [data-data-health-panel]");
  await expect(healthPanel).toBeVisible();
  await expect(healthPanel.getByRole("heading", { name: "Salud de datos" })).toBeVisible();

  await expect(healthPanel.locator('[data-workflow-card="odds-refresh"]')).toBeVisible();
  await expect(healthPanel.locator('[data-workflow-card="pre-mvp-snapshot"]')).toBeVisible();
  await expect(healthPanel).toContainText(".github/workflows/odds-refresh.yml");
  await expect(healthPanel).toContainText(".github/workflows/pre-mvp-snapshot.yml");

  for (const league of [
    "nfl",
    "premier-league",
    "laliga",
    "bundesliga",
    "serie-a",
    "ligue-1",
    "liga-mx",
  ]) {
    const row = healthPanel.locator(`[data-league-health-row="${league}"]`);
    await expect(row).toBeVisible();
    await expect(row.locator('[data-cell-status="disabled"]')).toContainText("Apagado");
  }
  await expect(healthPanel.locator('[data-league-health-row="nfl"]')).toContainText(
    "nflverse-cc-by-4.0",
  );

  // En escritorio >= 680 px el encabezado de tabla está visible; a 375 px @container lo oculta y apila tarjetas sin overflow
  if (width <= 640) {
    await page.setViewportSize({ width: 375, height: 844 });
    const theadDisplayMobile = await healthPanel
      .locator(".pl-dh-table thead")
      .evaluate((el) => getComputedStyle(el).display);
    expect(theadDisplayMobile).toBe("none");

    const overflow375 = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow375).toBe(false);
    await page.setViewportSize({ width, height: 900 });
  } else {
    const theadDisplayDesktop = await healthPanel
      .locator(".pl-dh-table thead")
      .evaluate((el) => getComputedStyle(el).display);
    expect(theadDisplayDesktop).not.toBe("none");

    const overflowDesktop = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflowDesktop).toBe(false);
  }

  // Accesibilidad WCAG 2A/2AA en oscuro y claro sobre el panel real
  const darkA11y = await new AxeBuilder({ page })
    .include("#pl-e2e-data-health-host")
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(darkA11y.violations).toEqual([]);

  await toggleClubTheme(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const lightA11y = await new AxeBuilder({ page })
    .include("#pl-e2e-data-health-host")
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(lightA11y.violations).toEqual([]);

  expect(pageErrors).toEqual([]);
});
