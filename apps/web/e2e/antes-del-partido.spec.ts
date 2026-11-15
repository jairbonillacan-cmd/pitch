import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixtures";

const PRE_MATCH_LEAGUES = [
  "liga-mx",
  "premier-league",
  "laliga",
  "bundesliga",
  "serie-a",
  "ligue-1",
  "nfl",
] as const;

function pickScheduledGameRoute(): string {
  const snapshotsRoot = resolve(import.meta.dirname, "../../../data/snapshots");
  const nowMs = Date.now();
  let fallbackScheduledRoute: string | null = null;

  for (const league of PRE_MATCH_LEAGUES) {
    const file = resolve(snapshotsRoot, league, "latest.json");
    if (!existsSync(file)) continue;
    const snapshot = JSON.parse(readFileSync(file, "utf8")) as {
      games?: Array<{ id: string; status: string; startTime?: string }>;
    };
    const scheduled = (snapshot.games ?? []).filter((g) => g.status === "scheduled");
    const upcoming = scheduled.find((g) => {
      const ts = g.startTime ? Date.parse(g.startTime) : Number.NaN;
      return Number.isFinite(ts) && ts > nowMs;
    });
    if (upcoming) {
      return `/app/${league}/games/${upcoming.id}`;
    }
    if (!fallbackScheduledRoute && scheduled[0]) {
      fallbackScheduledRoute = `/app/${league}/games/${scheduled[0].id}`;
    }
  }

  if (fallbackScheduledRoute) return fallbackScheduledRoute;
  throw new Error("No hay partidos scheduled en data/snapshots/*/latest.json para probar Antes del partido.");
}

async function toggleClubTheme(page: import("@playwright/test").Page): Promise<void> {
  await page.locator("[data-profile-menu-trigger]:visible").first().click();
  await page
    .locator('.pl-profile-menu:popover-open [data-theme-option][aria-pressed="false"]')
    .click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".pl-profile-menu:popover-open")).toHaveCount(0);
  await page.waitForTimeout(250);
}

test("Ficha del partido: módulo «Antes del partido» (bajas, pick congelado, votos, campana y alineación apagada)", async ({
  page,
}, testInfo) => {
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

  await page.goto(pickScheduledGameRoute());
  await expect(page.locator("[data-match-studio]")).toBeVisible();

  const moduleSection = page.locator("[data-pre-match-module]");
  await expect(moduleSection).toBeVisible();
  await expect(moduleSection.getByRole("heading", { name: "Antes del partido" })).toBeVisible();

  // 1) Pick principal y sello de hora (congelado o por congelar), sin stake, Kelly ni EV
  const freezeSeal = moduleSection.locator("[data-freeze-seal]");
  await expect(freezeSeal).toBeVisible();
  await expect(freezeSeal).toHaveText(/(Se congela a las|Congelado a las)\s+\d{2}:\d{2}/);
  await expect(moduleSection.locator("[data-frozen-pick-label]")).toBeVisible();
  await expect(moduleSection.locator("[data-frozen-pick-prob]")).toContainText("%");
  await expect(moduleSection.locator("[data-frozen-pick-odds]")).toBeVisible();

  const moduleText = await moduleSection.innerText();
  expect(moduleText).not.toMatch(/\b(Kelly|stake|EV|Poisson|Dixon-Coles|sigma|matriz|tipstar)\b/i);

  // 2) Bajas y lesiones: reporte real o mensaje honesto sin inventar
  const absencesCard = moduleSection.locator("[data-pre-match-absences]");
  await expect(absencesCard).toBeVisible();
  const hasNoAbsencesCopy = (await absencesCard.locator("[data-no-absences]").count()) > 0;
  if (hasNoAbsencesCopy) {
    await expect(absencesCard).toContainText("Sin bajas reportadas en nuestras fuentes");
  } else {
    expect(await absencesCard.locator("li").count()).toBeGreaterThan(0);
  }

  // 3) Ranura «Alineación confirmada» preparada pero APAGADA
  const lineupSlot = moduleSection.locator('[data-lineup-slot="off"]');
  await expect(lineupSlot).toBeVisible();
  await expect(lineupSlot).toContainText("Alineación confirmada");
  await expect(lineupSlot).toContainText("Apagado");

  // 4) Votos de la comunidad integrados dentro del módulo (sin duplicarse en la ficha)
  await expect(page.locator("[data-community-poll]")).toHaveCount(1);
  await expect(moduleSection.locator("[data-community-poll]")).toBeVisible();

  const firstPollOption = moduleSection.locator("[data-community-poll] .pl-poll-option").first();
  if (await firstPollOption.isEnabled()) {
    await firstPollOption.click();
    await expect(firstPollOption).toHaveAttribute("aria-pressed", "true");
    await expect(moduleSection.locator("[data-community-poll]")).toContainText("Modelo:");
  }

  // 5) Aviso opcional en la campana («Avísame 60 min antes») usando toggleWatchlistGame
  const bellButton = moduleSection.getByRole("button", { name: "Avísame 60 min antes" });
  await expect(bellButton).toBeVisible();
  if (await bellButton.isEnabled()) {
    await expect(bellButton).toHaveAttribute("aria-pressed", "false");
    await bellButton.click();
    await expect(bellButton).toHaveAttribute("aria-pressed", "true");
    await expect(moduleSection).toContainText("Aviso activo en tu campana");
    await expect(page.getByRole("button", { name: "Siguiendo" })).toBeVisible();
  }

  // Cero desborde horizontal en móvil estricto de 375 px
  if (width <= 640) {
    await page.setViewportSize({ width: 375, height: 844 });
    const overflow375 = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow375).toBe(false);
    await page.setViewportSize({ width, height: 900 });
  }

  // Accesibilidad WCAG 2A/2AA y cero scroll horizontal en oscuro y claro
  for (const theme of ["dark", "light"] as const) {
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasOverflow).toBe(false);

    const a11y = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(a11y.violations).toEqual([]);

    if (theme === "dark") {
      await toggleClubTheme(page);
    }
  }

  expect(pageErrors).toEqual([]);
});
