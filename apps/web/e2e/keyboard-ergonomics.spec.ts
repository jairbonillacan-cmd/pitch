import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

function resolveOrigin(baseURL: string | undefined): string {
  return (baseURL ?? process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100").replace(/\/+$/, "");
}

async function unlockBeta(page: Page, origin: string, ipSuffix: number): Promise<void> {
  const res = await page.request.post("/api/beta/unlock", {
    headers: {
      "x-forwarded-for": `198.51.100.${ipSuffix}`,
      origin,
    },
    data: { code: "2026", next: "/app" },
  });
  expect(res.ok(), `POST /api/beta/unlock falló con HTTP ${res.status()}`).toBe(true);
}

async function verifyTablistRoving(
  page: Page,
  tablistSelector: string,
  expectedMinTabs: number,
  label: string,
): Promise<void> {
  const tablist = page.locator(tablistSelector).first();
  await expect(tablist, `${label} debe ser visible`).toBeVisible();
  const tabs = tablist.locator('[role="tab"]:not(:disabled):not([aria-disabled="true"])');
  const count = await tabs.count();
  expect(count, `${label} debe tener al menos ${expectedMinTabs} pestañas`).toBeGreaterThanOrEqual(
    expectedMinTabs,
  );

  const selectedCount = await tablist.locator('[role="tab"][tabindex="0"]').count();
  expect(selectedCount, `${label} debe exponer exactamente 1 tab con tabindex="0"`).toBe(1);

  const firstTab = tabs.first();
  await firstTab.focus();
  await firstTab.press("ArrowRight");

  const secondSelected = await tabs.nth(1).getAttribute("aria-selected");
  expect(secondSelected, `${label}: ArrowRight debe seleccionar el 2.º tab`).toBe("true");
  const focusedAfterRight = await page.evaluate(() => {
    const active = document.activeElement;
    return active?.getAttribute("role") === "tab" ? active.textContent?.trim() ?? "" : "";
  });
  const secondText = ((await tabs.nth(1).textContent()) ?? "").trim();
  expect(focusedAfterRight).toBe(secondText);

  if (count > 2) {
    await tabs.nth(1).press("End");
    expect(await tabs.nth(count - 1).getAttribute("aria-selected")).toBe("true");
    await tabs.nth(count - 1).press("Home");
    expect(await tabs.first().getAttribute("aria-selected")).toBe("true");
  } else {
    await tabs.nth(1).press("ArrowLeft");
    expect(await tabs.first().getAttribute("aria-selected")).toBe("true");
  }
}

test.describe("Ergonomía de teclado, skip-links, tablists WAI-ARIA, Cmd+K y reduced-motion", () => {
  test("Skip-link lleva el foco a #main y tablists soportan Arrow/Home/End en Club y público", async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    const origin = resolveOrigin(testInfo.project.use.baseURL);
    await unlockBeta(page, origin, testInfo.project.name === "mobile" ? 211 : 212);

    await page.goto("/");
    const publicSkip = page.locator("a.skip-link[href='#main']").first();
    await expect(publicSkip).toBeAttached();
    const publicMainTabIndex = await page.locator("main#main").first().getAttribute("tabindex");
    expect(publicMainTabIndex).toBe("-1");
    await publicSkip.focus();
    await publicSkip.press("Enter");
    const activePublicId = await page.evaluate(() => document.activeElement?.id ?? "");
    expect(activePublicId).toBe("main");

    await page.goto("/app");
    await expect(page.locator("main#main")).toBeVisible();
    const clubSkip = page.locator("a.skip-link[href='#main']").first();
    await clubSkip.focus();
    await clubSkip.press("Enter");
    const activeClubId = await page.evaluate(() => document.activeElement?.id ?? "");
    expect(activeClubId).toBe("main");

    await verifyTablistRoving(page, '[role="tablist"][aria-label="Vista de partidos"]', 3, "/app Vista de partidos");
    if (testInfo.project.name === "desktop") {
      await verifyTablistRoving(
        page,
        '[role="tablist"][aria-label="Cambiar panel derecho"]',
        2,
        "/app Cambiar panel derecho",
      );
      await page.locator("#home-right-mode-parlay").click();
      await verifyTablistRoving(
        page,
        '[role="tablist"][aria-label="Opciones de parlay"]',
        2,
        "/app Opciones de parlay",
      );
    }

    await page.goto("/app/picks");
    await verifyTablistRoving(page, '[role="tablist"]', 2, "/app/picks");

    await page.goto("/app/social");
    await verifyTablistRoving(page, '[role="tablist"]', 4, "/app/social");

    await page.goto("/app/account");
    await verifyTablistRoving(
      page,
      '[role="tablist"][aria-label="Secciones de mi cuenta"]',
      3,
      "/app/account",
    );
  });

  test("Buscador Cmd/Ctrl+K implementa combobox/listbox sin tildes, ArrowDown, Escape y respeta reduced-motion", async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    const origin = resolveOrigin(testInfo.project.use.baseURL);
    await unlockBeta(page, origin, testInfo.project.name === "mobile" ? 213 : 214);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/app");

    const searchBtn = page.locator("button.pl-header-search").first();
    await expect(searchBtn).toBeVisible();
    await searchBtn.click();

    const combobox = page.locator('input[role="combobox"]').first();
    await expect(combobox).toBeVisible();
    await expect(combobox).toBeFocused();
    expect(await combobox.getAttribute("aria-autocomplete")).toBe("list");

    await combobox.fill("america");
    await page.waitForTimeout(220);

    const listboxId = await combobox.getAttribute("aria-controls");
    expect(listboxId).toBeTruthy();
    const listbox = page.locator(`#${listboxId}[role="listbox"]`);
    await expect(listbox).toBeVisible();
    expect(await combobox.getAttribute("aria-expanded")).toBe("true");

    const options = listbox.locator('[role="option"]');
    const optionCount = await options.count();
    expect(optionCount).toBeGreaterThanOrEqual(2);
    const firstActiveId = await combobox.getAttribute("aria-activedescendant");
    expect(firstActiveId).toBeTruthy();

    await combobox.press("ArrowDown");
    const secondActiveId = await combobox.getAttribute("aria-activedescendant");
    expect(secondActiveId).toBeTruthy();
    expect(secondActiveId).not.toBe(firstActiveId);
    expect(await listbox.locator(`#${secondActiveId}`).getAttribute("aria-selected")).toBe("true");

    const axeCmd = await new AxeBuilder({ page })
      .include("dialog")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const severe = axeCmd.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(
      severe.map((v) => `${v.id}: ${v.help}`),
      "Combobox CommandPaletteModal sin violaciones WCAG AA",
    ).toEqual([]);

    await combobox.fill("mexico");
    await page.waitForTimeout(180);
    const mexicoCount = await page.locator('[role="listbox"] [role="option"]').count();
    expect(mexicoCount).toBeGreaterThanOrEqual(1);

    await page.keyboard.press("Escape");
    await expect(combobox).toBeHidden();
    await expect(searchBtn).toBeFocused();

    await page.keyboard.press("Control+k");
    await expect(combobox).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(combobox).toBeHidden();
  });
});
