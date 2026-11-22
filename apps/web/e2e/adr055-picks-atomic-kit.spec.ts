import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const FD16_VISIBLE_RE = /scoutpicks|sofascore|bzzoiro|poisson|dixon/i;

async function unlockBeta(page: Page): Promise<void> {
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

async function assertNoForbiddenAdrCopy(
  page: Page,
  label: string,
  opts: { readonly strictConfianza?: boolean } = {},
): Promise<void> {
  const bodyText = (await page.locator("body").innerText()) ?? "";
  expect(bodyText, `No debe aparecer «Conf.» en ${label}`).not.toMatch(/\bConf\.\s*\d*/i);
  if (opts.strictConfianza) {
    expect(bodyText, `No debe aparecer «Confianza N» en ${label}`).not.toMatch(
      /\bConfianza\s+\d+/i,
    );
  }
  expect(bodyText, `No debe aparecer «Datos completos / parciales» en ${label}`).not.toMatch(
    /Datos completos|Datos parciales/i,
  );
  expect(bodyText, `No debe aparecer «Más del Club» en ${label}`).not.toMatch(/Más del Club/i);
  expect(bodyText, `Fuga FD-16 en texto visible en ${label}`).not.toMatch(FD16_VISIBLE_RE);
}

async function navigateToFirstAvailableMatchFromHome(page: Page): Promise<string> {
  await page.goto("/app");
  await expect(page.locator("#main")).toBeVisible();

  const dayJump = page.locator("[data-day-empty] [data-day-jump]").first();
  if ((await dayJump.count()) > 0 && (await dayJump.isVisible())) {
    await dayJump.click();
  }

  const detailCta = page.locator("[data-home-detail-full-cta]:visible").first();
  if ((await detailCta.count()) > 0) {
    const href = await detailCta.getAttribute("href");
    expect(href).toMatch(/^\/app\/[a-z0-9-]+\/g\/[a-z0-9-]+/);
    await detailCta.click();
    await page.waitForURL(/\/app\/[a-z0-9-]+\/g\/[a-z0-9-]+/, { timeout: 15_000 });
    return href!;
  }

  const preferredMatchLink = page
    .locator('[data-game-card]:has(button[aria-label^="Agregar al parlay"]) a[data-card-open]')
    .first();
  const fallbackCardLink = page.locator("[data-game-card] a[data-card-open]").first();
  const genericMatchLink = page.locator('a[href^="/app/"][href*="/g/"]:visible').first();

  let targetLink = preferredMatchLink;
  if ((await preferredMatchLink.count()) === 0) {
    targetLink = (await fallbackCardLink.count()) > 0 ? fallbackCardLink : genericMatchLink;
  }

  if ((await targetLink.count()) === 0) {
    await page.goto("/app/picks");
    const screenerMatchLink = page.locator('a[href^="/app/"][href*="/g/"]:visible').first();
    await expect(screenerMatchLink).toBeVisible({ timeout: 15_000 });
    const href = await screenerMatchLink.getAttribute("href");
    expect(href).toMatch(/^\/app\/[a-z0-9-]+\/g\/[a-z0-9-]+/);
    await screenerMatchLink.click();
    await page.waitForURL(/\/app\/[a-z0-9-]+\/g\/[a-z0-9-]+/, { timeout: 15_000 });
    return href!;
  }

  await expect(targetLink).toBeVisible();
  const href = await targetLink.getAttribute("href");
  expect(href).toMatch(/^\/app\/[a-z0-9-]+\/g\/[a-z0-9-]+/);
  await targetLink.click();
  await page.waitForURL(/\/app\/[a-z0-9-]+\/g\/[a-z0-9-]+/, { timeout: 15_000 });
  return href!;
}

test.describe("ADR-055 / Ola 6 · Screener de Picks, Pick del día, Bet Lab, Ficha Atómica, Props, Móvil Explorar, Política Dual y /offline", () => {
  test("1. Screener /app/picks Ola 6: Pick del día, 1er pick arriba del pliegue, rail derecho, Bet Lab Drawer y hoja móvil 375×812", async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    const isMobile = testInfo.project.name === "mobile";
    await page.setViewportSize(
      isMobile ? { width: 375, height: 812 } : { width: 1440, height: 900 },
    );

    const pageErrors: string[] = [];
    const serverErrors: string[] = [];

    page.on("pageerror", (err) => pageErrors.push(err.message));
    page.on("response", (res) => {
      if (res.status() >= 500 && res.url().startsWith("http://127.0.0.1:3100")) {
        serverErrors.push(`${res.status()} ${res.url()}`);
      }
    });

    await unlockBeta(page);
    await page.goto("/app/picks");

    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect(page.locator("[data-picks-layout]")).toBeVisible();
    await expect(page.locator("[data-picks-main]")).toBeVisible();

    await assertNoHorizontalOverflow(page, "/app/picks inicial");
    await assertNoForbiddenAdrCopy(page, "/app/picks", { strictConfianza: true });

    const potdBanner = page.locator("[data-picks-potd]");
    await expect(potdBanner).toBeVisible();
    const potdToggle = page.locator("[data-picks-potd-toggle]:visible").first();
    if ((await potdToggle.count()) > 0) {
      await potdToggle.click();
      await assertNoHorizontalOverflow(page, "/app/picks Pick del día expandido");
      await potdToggle.click();
    }

    const firstRow = page.locator("[data-picks-row]").first();
    await expect(firstRow).toBeVisible({ timeout: 15_000 });
    const firstRowText = ((await firstRow.innerText()) ?? "").trim();
    expect(firstRowText.length).toBeGreaterThan(10);

    if (!isMobile) {
      const rowBox = await firstRow.boundingBox();
      expect(rowBox).not.toBeNull();
      expect(
        rowBox!.y,
        `El primer [data-picks-row] debe quedar arriba del pliegue en 1440×900 (y=${rowBox!.y})`,
      ).toBeLessThan(900);

      const filterRail = page.locator("[data-picks-filter-rail]");
      await expect(filterRail).toBeVisible();
      const mainBox = await page.locator("[data-picks-main]").boundingBox();
      const railBox = await filterRail.boundingBox();
      expect(mainBox).not.toBeNull();
      expect(railBox).not.toBeNull();
      expect(
        railBox!.x,
        "El rail de filtros [data-picks-filter-rail] debe aparecer a la derecha de [data-picks-main]",
      ).toBeGreaterThanOrEqual(mainBox!.x + mainBox!.width - 8);

      const loadMoreGameBtn = page.locator("[data-picks-load-more-game]:visible").first();
      if ((await loadMoreGameBtn.count()) > 0) {
        await loadMoreGameBtn.click();
        await assertNoHorizontalOverflow(page, "/app/picks tras cargar más picks por partido");
      }
    } else {
      await expect(page.locator("[data-picks-filter-rail]")).toBeHidden();

      const mobileFiltersTrigger = page.locator("[data-picks-mobile-filters-trigger]");
      await expect(mobileFiltersTrigger).toBeVisible();
      const triggerBox = await mobileFiltersTrigger.boundingBox();
      expect(triggerBox).not.toBeNull();
      expect(Math.round(triggerBox!.height)).toBeGreaterThanOrEqual(44);
      expect(Math.round(triggerBox!.width)).toBeGreaterThanOrEqual(44);

      await mobileFiltersTrigger.click();
      const mobileSheet = page.locator('dialog[open], [role="dialog"]:visible').last();
      await expect(mobileSheet).toBeVisible();
      await assertNoHorizontalOverflow(page, "/app/picks hoja filtros móvil 375×812");
      await assertNoForbiddenAdrCopy(page, "/app/picks hoja filtros móvil", {
        strictConfianza: true,
      });

      const mobileSheetAudit = await mobileSheet.evaluate((root) => {
        const isVisible = (el: Element): boolean => {
          const style = window.getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 1 && rect.height > 1;
        };
        const smallButtons = Array.from(root.querySelectorAll('button, [role="button"]'))
          .filter(isVisible)
          .map((el) => Math.round(el.getBoundingClientRect().height))
          .filter((h) => h < 44);
        const smallInputs = Array.from(
          root.querySelectorAll(
            'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea',
          ),
        )
          .filter(isVisible)
          .map((el) => Number.parseFloat(window.getComputedStyle(el).fontSize || "16"))
          .filter((fs) => Number.isFinite(fs) && fs < 15.9);
        return { smallButtons, smallInputs };
      });
      expect(mobileSheetAudit.smallButtons).toEqual([]);
      expect(mobileSheetAudit.smallInputs).toEqual([]);

      await page.keyboard.press("Escape");
      await expect(page.locator("dialog[open]")).toHaveCount(0);
    }

    await firstRow.click({ position: { x: 24, y: 24 } });
    const labDrawer = page.locator("[data-pick-lab-drawer]");
    await expect(labDrawer).toBeVisible({ timeout: 15_000 });
    await expect(labDrawer.locator("[data-pick-lab-chart]")).toBeVisible();
    await expect(labDrawer.locator("[data-pick-lab-builder]")).toBeVisible();
    await assertNoHorizontalOverflow(page, "/app/picks Bet Lab abierto");
    await assertNoForbiddenAdrCopy(page, "/app/picks Bet Lab abierto", { strictConfianza: true });

    const expandStatsBtn = labDrawer.locator("[data-pick-lab-expand-stats]:visible").first();
    if ((await expandStatsBtn.count()) > 0) {
      await expandStatsBtn.click();
      await expect(expandStatsBtn).toHaveAttribute("aria-expanded", "true");
    }

    await page.keyboard.press("Escape");
    await expect(labDrawer).toBeHidden();
    await expect(page.locator("dialog[open]")).toHaveCount(0);

    const potdAnalyze = page.locator("[data-picks-potd-analyze]:visible").first();
    if ((await potdAnalyze.count()) > 0) {
      await potdAnalyze.click();
    } else {
      await firstRow.click({ position: { x: 24, y: 24 } });
    }
    await expect(labDrawer).toBeVisible({ timeout: 15_000 });
    await labDrawer.locator("[data-pick-lab-close]").click();
    await expect(labDrawer).toBeHidden();
    await expect(page.locator("dialog[open]")).toHaveCount(0);

    await assertNoHorizontalOverflow(page, "/app/picks final");
    expect(serverErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test("2. Ficha de partido (/app/<league>/g/...): navega desde /app, valida pestañas, MatchPicksEvidenceBoard, cero Conf. y 0 px overflow", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const pageErrors: string[] = [];
    const serverErrors: string[] = [];

    page.on("pageerror", (err) => pageErrors.push(err.message));
    page.on("response", (res) => {
      if (res.status() >= 500 && res.url().startsWith("http://127.0.0.1:3100")) {
        serverErrors.push(`${res.status()} ${res.url()}`);
      }
    });

    await unlockBeta(page);
    await navigateToFirstAvailableMatchFromHome(page);

    await expect(page.locator("[data-match-studio]")).toBeVisible();
    await assertNoHorizontalOverflow(page, "Ficha partido · Resumen");

    const evidenceBoard = page.locator("[data-evidence-board]");
    await expect(evidenceBoard).toBeVisible();
    await expect(
      evidenceBoard.getByRole("heading", { name: /Picks y evidencia del modelo/i }),
    ).toBeVisible();
    expect(await evidenceBoard.locator("[data-evidence-group]").count()).toBeGreaterThanOrEqual(1);

    const firstEvidencePick = evidenceBoard.locator("[data-evidence-pick]").first();
    await expect(firstEvidencePick).toBeVisible();
    const evidenceCol = firstEvidencePick.locator(".pl-ev-col-evidence");
    await expect(evidenceCol).toBeVisible();

    const evidenceItemsCount =
      (await evidenceCol.locator("[data-evidence-windows]").count()) +
      (await evidenceCol.locator('ul[aria-label="Evidencia del pick"] li').count());
    expect(
      evidenceItemsCount,
      "Debe mostrar píldoras de ventana o evidencia verificable real",
    ).toBeGreaterThanOrEqual(1);
    await expect(firstEvidencePick.locator("[data-bookmaker-compare]")).toBeVisible();

    const boardText = (await evidenceBoard.innerText()) ?? "";
    expect(boardText).not.toMatch(/\bConf\.|\bConfianza\s+\d+|Datos completos|Datos parciales/i);
    await assertNoForbiddenAdrCopy(page, "Ficha partido · Resumen");
    await expect(page.locator(".pl-conf-chip")).toHaveCount(0);

    const sortSelect = evidenceBoard.getByLabel("Ordenar selecciones");
    await expect(sortSelect).toBeVisible();
    await sortSelect.selectOption("prob");
    await expect(sortSelect).toHaveValue("prob");
    await sortSelect.selectOption("recomendados");

    const resumenTab = page.locator('[data-section-tab="resumen"]');
    await expect(resumenTab).toHaveAttribute("aria-selected", "true");

    for (const tabKey of ["ia", "numeros", "dinero", "contexto"] as const) {
      const tab = page.locator(`[data-section-tab="${tabKey}"]`);
      await expect(tab).toBeVisible();
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");
      await expect(page).toHaveURL(new RegExp(`[?&]tab=${tabKey}(?:&|$)`));
      if (tabKey === "numeros") {
        await expect(page.locator("[data-numbers-expected]")).toBeVisible();
      }
      await assertNoHorizontalOverflow(page, `Ficha partido · tab=${tabKey}`);
    }

    await assertNoForbiddenAdrCopy(page, "Ficha partido · tras recorrer pestañas");
    expect(serverErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test("3. /app/props: carga limpia para socio autenticado sin errores de consola", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const serverErrors: string[] = [];
    const responses401: string[] = [];

    page.on("pageerror", (err) => pageErrors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("response", (res) => {
      if (!res.url().startsWith("http://127.0.0.1:3100")) return;
      if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`);
      if (res.status() === 401) responses401.push(`${res.status()} ${res.url()}`);
    });

    await unlockBeta(page);
    const res = await page.goto("/app/props");
    expect(res?.status()).toBe(200);

    await expect(
      page.getByRole("heading", { level: 1, name: /Tendencias y props de jugadores/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Props de jugadores para Pase PitchLab Ultra/i }),
    ).toHaveCount(0);

    const hasStreaks =
      (await page.locator('section[aria-label="Tendencias de jugadores contra línea"]').count()) >
      0;
    const hasCatalogCards = (await page.locator("[data-prop-card]").count()) > 0;
    const hasEmptyState = (await page.locator("[data-props-empty]").count()) > 0;
    expect(hasStreaks || hasCatalogCards || hasEmptyState).toBe(true);

    if (hasCatalogCards) {
      const firstRaiseBtn = page.getByRole("button", { name: /Subir línea/i }).first();
      if (await firstRaiseBtn.isVisible()) {
        await firstRaiseBtn.click();
      }
    }

    await assertNoHorizontalOverflow(page, "/app/props");
    await assertNoForbiddenAdrCopy(page, "/app/props", { strictConfianza: true });

    expect(responses401).toEqual([]);
    expect(serverErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("4. Móvil 375×812: hoja Explorar (nunca «Más del Club»), 0 px overflow horizontal y objetivos táctiles >= 44 px", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.setViewportSize({ width: 375, height: 812 });
    await unlockBeta(page);
    await page.goto("/app");

    await assertNoHorizontalOverflow(page, "/app @ 375x812");
    await assertNoForbiddenAdrCopy(page, "/app @ 375x812");

    const mobileDock = page.locator('nav[aria-label="Navegación móvil"]');
    await expect(mobileDock).toBeVisible();
    const dockHeights = await mobileDock
      .locator("a, button")
      .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
    expect(dockHeights.length).toBeGreaterThanOrEqual(4);
    for (const h of dockHeights) {
      expect(h, "Cada objetivo del dock móvil debe medir >= 44 px").toBeGreaterThanOrEqual(44);
    }

    const moreTrigger = page.locator("[data-mobile-more-trigger]:visible");
    await expect(moreTrigger).toBeVisible();
    await moreTrigger.click();

    const explorarDialog = page.getByRole("dialog", { name: "Explorar" });
    await expect(explorarDialog).toBeVisible();
    await expect(
      explorarDialog.getByRole("heading", { name: "Explorar", exact: true }),
    ).toBeVisible();
    expect((await explorarDialog.innerText()) ?? "").not.toMatch(/Más del Club/i);
    await assertNoHorizontalOverflow(page, "Hoja Explorar @ 375x812");

    const sheetControlHeights = await explorarDialog
      .locator("a, button")
      .evaluateAll((els) =>
        els
          .filter((el) => {
            const style = getComputedStyle(el);
            return style.display !== "none" && style.visibility !== "hidden";
          })
          .map((el) => Math.round(el.getBoundingClientRect().height))
          .filter((h) => h > 0),
      );
    expect(sheetControlHeights.length).toBeGreaterThan(0);
    for (const h of sheetControlHeights) {
      expect(
        h,
        "Los objetivos táctiles dentro de Explorar deben medir >= 44 px",
      ).toBeGreaterThanOrEqual(44);
    }

    await explorarDialog.locator('a[href="/app/picks"]').click();
    await page.waitForURL(/\/app\/picks$/);
    await expect(explorarDialog).toHaveCount(0);
    await assertNoHorizontalOverflow(page, "/app/picks @ 375x812");
    await assertNoForbiddenAdrCopy(page, "/app/picks @ 375x812", { strictConfianza: true });

    const mobileFilterBtn = page.locator("[data-picks-mobile-filters-trigger]");
    await expect(mobileFilterBtn).toBeVisible();
    const filterBtnBox = await mobileFilterBtn.boundingBox();
    expect(filterBtnBox).not.toBeNull();
    expect(Math.round(filterBtnBox!.height)).toBeGreaterThanOrEqual(44);

    const visibleTabHeights = await page
      .locator('#main [role="tablist"] [role="tab"]')
      .evaluateAll((els) =>
        els
          .filter((el) => {
            const style = getComputedStyle(el);
            return style.display !== "none" && style.visibility !== "hidden";
          })
          .map((el) => Math.round(el.getBoundingClientRect().height))
          .filter((h) => h > 0),
      );
    for (const h of visibleTabHeights) {
      expect(h, "Pestañas en /app/picks deben medir >= 44 px en móvil").toBeGreaterThanOrEqual(44);
    }

    await page.goto("/app/props");
    await assertNoHorizontalOverflow(page, "/app/props @ 375x812");

    expect(pageErrors).toEqual([]);
  });

  test("5. Política dual Confirmar / Deshacer (ConfirmActionDialog con foco seguro en Cancelar + toast Deshacer)", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await unlockBeta(page);
    await page.goto("/app/parlays");
    await expect(page.getByRole("heading", { level: 1, name: /Armar parlay/i })).toBeVisible();

    await page.locator("[data-generate-parlay]").click();
    const sealBtn = page.getByRole("button", { name: /Sellar en Mi récord/i });
    await expect(sealBtn).toBeEnabled();

    const clearBtn = page.getByRole("button", { name: /^Limpiar$/i });
    await expect(clearBtn).toBeVisible();

    await clearBtn.click();
    const confirmDialog = page.locator("[data-confirm-action-dialog]");
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog).toContainText(/Vaciar parlay/i);

    const cancelBtn = confirmDialog.getByRole("button", { name: "Cancelar" });
    await expect(cancelBtn).toBeVisible();
    await expect(cancelBtn).toBeFocused();

    await cancelBtn.click();
    await expect(confirmDialog).toHaveCount(0);
    await expect(sealBtn).toBeEnabled();

    await clearBtn.click();
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.locator("[data-confirm-action-btn]").click();
    await expect(confirmDialog).toHaveCount(0);
    await expect(page.getByText("Tu boleto combinado está vacío")).toBeVisible();

    const undoBtn = page.locator("[data-toast-undo]", { hasText: "Deshacer" }).first();
    await expect(undoBtn).toBeVisible();
    await undoBtn.click();

    await expect(sealBtn).toBeEnabled();
    await expect(page.getByText("Tu boleto combinado está vacío")).toHaveCount(0);

    await assertNoHorizontalOverflow(page, "/app/parlays · política dual");
    expect(pageErrors).toEqual([]);
  });

  test("6. Ruta pública /offline: mensaje sin conexión, botón Reintentar, enlace /app y cero overflow", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];

    page.on("pageerror", (err) => pageErrors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    const res = await page.goto("/offline");
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(/\/offline$/);

    await expect(page.locator("body")).toContainText("SIN CONEXIÓN");
    await expect(
      page.getByRole("heading", { level: 1, name: "No tienes conexión a internet" }),
    ).toBeVisible();

    const retryBtn = page.getByRole("button", { name: "Reintentar" });
    await expect(retryBtn).toBeVisible();
    await expect(retryBtn).toBeEnabled();

    const appLink = page.locator('a[href="/app"]', { hasText: /Ir a partidos de hoy/i });
    await expect(appLink).toBeVisible();
    await expect(appLink).toHaveAttribute("href", "/app");

    await assertNoHorizontalOverflow(page, "/offline");

    await page.setViewportSize({ width: 375, height: 812 });
    await assertNoHorizontalOverflow(page, "/offline @ 375x812");

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
