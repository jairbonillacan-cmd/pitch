import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

function pickRichFootballGameRoute(): string {
  const snapshotsRoot = resolve(import.meta.dirname, "../../../data/snapshots");
  for (const league of ["laliga", "liga-mx", "premier-league"] as const) {
    const file = resolve(snapshotsRoot, league, "latest.json");
    if (!existsSync(file)) continue;
    const raw = JSON.parse(readFileSync(file, "utf8")) as {
      games?: Array<{
        id: string;
        status: string;
        home?: { name?: string };
        away?: { name?: string };
      }>;
    };
    const scheduled = (raw.games ?? []).filter((g) => g.status === "scheduled" || g.status === "NS");
    const marquee = scheduled.find((g) =>
      /barcelona|madrid|chivas|américa|liverpool|arsenal/i.test(
        `${g.home?.name ?? ""} ${g.away?.name ?? ""}`,
      ),
    );
    const chosen = marquee ?? scheduled[0] ?? raw.games?.[0];
    if (chosen) {
      return `/app/${league}/games/${chosen.id}`;
    }
  }
  throw new Error("No se encontró partido de fútbol para probar ADR-062 Q1–Q6.");
}

async function unlockMemberBeta(page: Page): Promise<void> {
  const uniqueIp = `198.51.${Math.floor(Math.random() * 200) + 10}.${Math.floor(Math.random() * 200) + 10}`;
  const res = await page.request.post("/api/beta/unlock", {
    headers: { "x-forwarded-for": uniqueIp, origin: "http://127.0.0.1:3100" },
    data: { code: "2026", next: "/app" },
  });
  expect(res.ok()).toBe(true);
}

async function toggleClubTheme(page: Page): Promise<void> {
  await page.locator("[data-profile-menu-trigger]:visible").first().click();
  await page
    .locator('.pl-profile-menu:popover-open [data-theme-option][aria-pressed="false"]')
    .click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".pl-profile-menu:popover-open")).toHaveCount(0);
  await page.waitForTimeout(250);
}

async function assertCleanBordersAndImages(page: Page, contextLabel: string): Promise<void> {
  const check = await page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    const rings = Array.from(document.querySelectorAll(".glass-ring"));
    let maskedBefore = 0;
    for (const el of rings) {
      const before = getComputedStyle(el, "::before");
      if (before.content && before.content !== "none") {
        const mask = before.maskComposite || before.webkitMaskComposite || "";
        if (mask.includes("exclude") || mask.includes("xor")) {
          maskedBefore += 1;
        }
      }
    }
    const brokenImgs = Array.from(document.querySelectorAll("img"))
      .filter((img) => img.complete && img.naturalWidth === 0 && Boolean(img.getAttribute("src")))
      .map((img) => img.getAttribute("src"));
    return { overflow, maskedBefore, brokenImgs };
  });

  expect(check.overflow, `Sin desborde en ${contextLabel}`).toBeLessThanOrEqual(1);
  expect(check.maskedBefore, `Cero mask-composite en .glass-ring (${contextLabel})`).toBe(0);
  expect(check.brokenImgs, `Cero imágenes rotas (${contextLabel})`).toEqual([]);
}

test.describe("ADR-062 · Pulido Q1–Q6, bordes nativos y paneles profundos", () => {
  test("1. /app muestra rayitas L5, Maestro-Detalle separa Clasificación/Lesiones y limpia .glass-ring", async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === "mobile";
    await unlockMemberBeta(page);
    await page.goto("/app");
    await expect(page.locator("[data-row-form-dashes]").first()).toBeVisible();

    if (!isMobile) {
      const detailPane = page.locator("[data-home-detail-pane]");
      if ((await detailPane.count()) > 0 && (await detailPane.isVisible())) {
        const footballRow = page
          .locator("button, [role='button']")
          .filter({ hasText: /FC Barcelona|Barcelona|Chivas|Liverpool/i })
          .first();
        if ((await footballRow.count()) > 0) {
          await footballRow.click();
        }
        const standingsTab = page.locator('[data-home-detail-tab="standings"]');
        const injuriesTab = page.locator('[data-home-detail-tab="injuries"]');
        if ((await standingsTab.count()) > 0 && (await injuriesTab.count()) > 0) {
          await expect(standingsTab).toBeVisible();
          await expect(injuriesTab).toBeVisible();
          await injuriesTab.click();
          await expect(injuriesTab).toHaveAttribute("aria-selected", "true");
        }
      }
    }

    await assertCleanBordersAndImages(page, "/app dark");
    const a11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(a11y.violations).toEqual([]);
  });

  test("2. Ficha de partido abre en Picks (Equipo ↔ Jugadores), Alineaciones interactivas, Enfrentamientos y Lesiones (oscuro/claro + WCAG)", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await unlockMemberBeta(page);
    await page.goto(pickRichFootballGameRoute());
    await expect(page.locator("[data-match-studio]")).toBeVisible();

    const picksTab = page.locator('[data-section-tab="picks"]');
    await expect(picksTab).toHaveAttribute("aria-selected", "true");

    const switcher = page.locator("[data-studio-picks-switcher]");
    await expect(switcher).toBeVisible();
    const playersBtn = switcher.locator('[data-picks-subtab="jugadores"]');
    await playersBtn.click();
    await expect(playersBtn).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.locator("[data-player-picks-board], [data-player-picks-empty], [data-player-picks-locked]").first(),
    ).toBeVisible();

    const teamBtn = switcher.locator('[data-picks-subtab="equipo"]');
    await teamBtn.click();
    await expect(teamBtn).toHaveAttribute("aria-pressed", "true");

    const lineupsTab = page.locator('[data-section-tab="alineaciones"]');
    if ((await lineupsTab.count()) > 0) {
      await lineupsTab.click();
      await expect(lineupsTab).toHaveAttribute("aria-selected", "true");
      const panel = page.locator("[data-match-lineups-panel]");
      await expect(panel).toBeVisible();
      await expect(panel.locator("[data-lineup-banner]")).toContainText(
        /Alineación (probable|confirmada)/i,
      );
      const nodes = panel.locator(".pl-atom-node-trigger");
      if ((await nodes.count()) > 4) {
        const targetLabel = await nodes.nth(4).getAttribute("aria-label");
        await nodes.nth(4).click();
        const drawerStrong = panel.locator(".pl-mdp-lineup-drawer strong").first();
        await expect(drawerStrong).toBeVisible();
        if (targetLabel) {
          const surname = targetLabel.split(",")[0]?.trim().split(" ").pop() ?? "";
          if (surname.length >= 3) {
            await expect(panel.locator(".pl-mdp-lineup-drawer")).toContainText(
              new RegExp(surname, "i"),
            );
          }
        }
      }
    }

    const enfTab = page.locator('[data-section-tab="enfrentamientos"]');
    await enfTab.click();
    await expect(enfTab).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("[data-enfrentamientos-partidos]")).toBeVisible();

    const injuriesTab = page.locator('[data-section-tab="lesiones"]');
    await injuriesTab.click();
    await expect(injuriesTab).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("[data-match-injuries-panel]")).toBeVisible();

    for (const theme of ["dark", "light"] as const) {
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await assertCleanBordersAndImages(page, `Match Studio (${theme})`);
      const a11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      expect(a11y.violations).toEqual([]);
      if (theme === "dark") {
        await toggleClubTheme(page);
      }
    }

    expect(pageErrors).toEqual([]);
  });
});
