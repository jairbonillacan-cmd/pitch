import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

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
}

async function navigateToFirstAvailableMatchFromHome(page: Page): Promise<string> {
  await page.goto("/app");
  await expect(page.locator("#main")).toBeVisible();

  const dayJump = page.locator("[data-day-empty] [data-day-jump]").first();
  if ((await dayJump.count()) > 0 && (await dayJump.isVisible())) {
    await dayJump.click();
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
    // Respaldo dinámico: si hoy no tiene tarjetas en /app, toma el primer partido real desde /app/picks
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

test.describe("ADR-055 · Screener de Picks, Ficha Sofascore, Props, Móvil Explorar, Política Dual y /offline", () => {
  test("1. Screener /app/picks: filtros (mercado/agrupación, slider no lineal, SavedViewsBar + Deshacer), cero Conf./Datos y BetBuilderDrawer", async ({
    page,
  }, testInfo) => {
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
    await page.goto("/app/picks");

    await expect(
      page.getByRole("heading", { level: 1, name: /Explorar picks/i }),
    ).toBeVisible();
    await expect(page.locator("[data-screener-timing]")).toBeVisible();
    await expect(page.locator("[data-screener-group-mode]")).toBeVisible();
    await expect(page.locator("[data-screener-result-count]")).toBeVisible();
    await expect(page.locator("[data-finder-quick-chips]")).toBeVisible();
    await expect(page.locator("[data-saved-views-bar]")).toBeVisible();

    await assertNoHorizontalOverflow(page, "/app/picks inicial");
    await assertNoForbiddenAdrCopy(page, "/app/picks", { strictConfianza: true });

    // Agrupación: Por partido -> Por mercado -> Lista plana -> Por partido
    const groupBar = page.locator("[data-screener-group-mode]");
    await expect(groupBar.getByRole("button", { name: "Por partido" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await groupBar.getByRole("button", { name: "Por mercado" }).click();
    await expect(groupBar.getByRole("button", { name: "Por mercado" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    if ((await page.locator("[data-screener-pick]").count()) > 0) {
      await expect(page.locator('[data-screener-view="market"]')).toBeVisible();
    }

    await groupBar.getByRole("button", { name: "Lista plana" }).click();
    await expect(groupBar.getByRole("button", { name: "Lista plana" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    if ((await page.locator("[data-screener-pick]").count()) > 0) {
      await expect(page.locator('[data-screener-view="flat"]')).toBeVisible();
    }

    await groupBar.getByRole("button", { name: "Por partido" }).click();
    await expect(groupBar.getByRole("button", { name: "Por partido" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Barra de filtros avanzados (inline en escritorio >= 768 px, hoja inferior en móvil < 768 px)
    const isMobile = testInfo.project.name === "mobile";
    let filtersContainer = page.locator("#pl-finder-advanced-panel");
    if (isMobile) {
      const mobileToggle = page.locator("[data-mobile-filters-toggle]");
      await expect(mobileToggle).toBeVisible();
      await mobileToggle.click();
      filtersContainer = page.locator("dialog[data-mobile-filters-sheet]");
      await expect(filtersContainer).toBeVisible();
    } else {
      await expect(filtersContainer).toBeVisible();
    }

    // Selector de familia de mercado (24+ familias)
    const familySelect = filtersContainer.getByLabel("Familia de mercado");
    await expect(familySelect).toBeVisible();
    await familySelect.selectOption("goles");
    await expect(familySelect).toHaveValue("goles");
    await familySelect.selectOption("all");
    await expect(familySelect).toHaveValue("all");

    // Slider no lineal de momios (NonLinearOddsSlider)
    const sliderBox = filtersContainer.locator("[data-odds-range-slider]");
    await expect(sliderBox).toBeVisible();
    const readout = sliderBox.locator("[data-odds-range-readout]");
    await expect(readout).toContainText("Sin límite");

    const minRange = sliderBox.getByLabel("Momio mínimo");
    const maxRange = sliderBox.getByLabel("Momio máximo");
    await expect(minRange).toBeVisible();
    await expect(maxRange).toBeVisible();

    const oddsPresets = sliderBox.getByRole("group", { name: "Atajos de rango de momios" });
    const sweetPreset = oddsPresets.locator("button").nth(2);
    await sweetPreset.click();
    await expect(sweetPreset).toHaveAttribute("aria-pressed", "true");
    await expect(readout).not.toContainText("Sin límite");

    await minRange.fill("25");
    await expect(minRange).toHaveValue("25");

    await sliderBox.getByRole("button", { name: "Limpiar" }).click();
    await expect(readout).toContainText("Sin límite");

    if (isMobile) {
      await filtersContainer.getByRole("button", { name: "Cerrar filtros" }).click();
      await expect(filtersContainer).toHaveCount(0);
    }

    // Presets SavedViewsBar: guardar vista, aplicarla, borrarla y restaurarla con toast Deshacer
    await page.locator('[data-finder-chip="probables"]').click();
    await expect(page.locator('[data-finder-chip="probables"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const savedBar = page.locator("[data-saved-views-bar]");
    const openSaveBtn = savedBar.locator("[data-open-save-view]");
    await expect(openSaveBtn).toBeVisible();
    if (await openSaveBtn.isEnabled()) {
      const viewName = "E2E Probables";
      await openSaveBtn.click();
      const nameInput = savedBar.getByLabel("Nombre de la vista guardada");
      await expect(nameInput).toBeVisible();
      await nameInput.fill(viewName);
      await savedBar.getByRole("button", { name: "Guardar", exact: true }).click();

      const savedChip = savedBar.locator(".pl-scr-view-chip", { hasText: viewName });
      await expect(savedChip).toBeVisible();

      await page.locator('[data-finder-chip="todos"]').click();
      await savedChip.locator(".pl-scr-view-apply").click();
      await expect(savedChip.locator(".pl-scr-view-apply")).toHaveAttribute(
        "aria-pressed",
        "true",
      );

      // Política dual reversible: eliminar vista -> toast Deshacer restaura la vista
      await savedBar.getByRole("button", { name: `Eliminar vista ${viewName}` }).click();
      await expect(savedChip).toHaveCount(0);

      const undoBtn = page.locator("[data-toast-undo]", { hasText: "Deshacer" }).first();
      await expect(undoBtn).toBeVisible();
      await undoBtn.click();
      await expect(savedChip).toBeVisible();

      // Limpieza de la vista de prueba
      await savedBar.getByRole("button", { name: `Eliminar vista ${viewName}` }).click();
      await expect(savedChip).toHaveCount(0);
    }

    await page.locator('[data-finder-chip="todos"]').click();

    // Apertura de BetBuilderDrawer y alta de selección en el boleto
    const firstBuilderBtn = page.locator("[data-open-bet-builder]").first();
    await expect(firstBuilderBtn).toBeVisible({ timeout: 15_000 });
    await firstBuilderBtn.click();

    const drawer = page.locator("dialog[data-bet-builder-drawer]");
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText("Bet Builder");
    await expect(drawer.locator("[data-bookmaker-compare]")).toBeVisible();

    const addPrimaryBtn = drawer.locator("[data-builder-add-primary]");
    await expect(addPrimaryBtn).toBeVisible();
    await addPrimaryBtn.click();
    await expect(drawer.locator('[data-builder-compat="in_parlay"]')).toBeVisible();
    await expect(drawer).toContainText(/Tu boleto \(1 selección\)/i);

    await drawer.getByRole("button", { name: "Cerrar Bet Builder" }).click();
    await expect(drawer).toHaveCount(0);
    await expect(firstBuilderBtn).toContainText("En boleto");

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

    // Validar MatchPicksEvidenceBoard y columna de evidencia verificable
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

    // Cero Conf. / Confianza N / Datos completos / Datos parciales en tablero y ficha
    const boardText = (await evidenceBoard.innerText()) ?? "";
    expect(boardText).not.toMatch(/\bConf\.|\bConfianza\s+\d+|Datos completos|Datos parciales/i);
    await assertNoForbiddenAdrCopy(page, "Ficha partido · Resumen");
    await expect(page.locator(".pl-conf-chip")).toHaveCount(0);

    // Ordenación dentro de MatchPicksEvidenceBoard
    const sortSelect = evidenceBoard.getByLabel("Ordenar selecciones");
    await expect(sortSelect).toBeVisible();
    await sortSelect.selectOption("prob");
    await expect(sortSelect).toHaveValue("prob");
    await sortSelect.selectOption("recomendados");

    // Validar las 5 pestañas de la ficha y 0 px de overflow horizontal en cada una
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

    // Dock móvil inferior con objetivos táctiles >= 44 px
    const mobileDock = page.locator('nav[aria-label="Navegación móvil"]');
    await expect(mobileDock).toBeVisible();
    const dockHeights = await mobileDock
      .locator("a, button")
      .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
    expect(dockHeights.length).toBeGreaterThanOrEqual(4);
    for (const h of dockHeights) {
      expect(h, "Cada objetivo del dock móvil debe medir >= 44 px").toBeGreaterThanOrEqual(44);
    }

    // Botón Más abre hoja «Explorar» (nunca «Más del Club»)
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

    // Verificar objetivos táctiles accesibles >= 44 px dentro de la hoja Explorar
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

    // Navegar a /app/picks desde la hoja Explorar y comprobar ergonomía móvil 375×812
    await explorarDialog.locator('a[href="/app/picks"]').click();
    await page.waitForURL(/\/app\/picks$/);
    await expect(explorarDialog).toHaveCount(0);
    await assertNoHorizontalOverflow(page, "/app/picks @ 375x812");

    const mobileFilterBtn = page.locator("[data-mobile-filters-toggle]");
    await expect(mobileFilterBtn).toBeVisible();
    const filterBtnBox = await mobileFilterBtn.boundingBox();
    expect(filterBtnBox).not.toBeNull();
    expect(Math.round(filterBtnBox!.height)).toBeGreaterThanOrEqual(44);

    const quickChipHeights = await page
      .locator("[data-finder-chip]")
      .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
    for (const h of quickChipHeights) {
      expect(h, "Atajos rápidos en /app/picks deben medir >= 44 px en móvil").toBeGreaterThanOrEqual(
        44,
      );
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

    // Generar un parlay de >= 2 selecciones para activar el control destructivo «Limpiar»
    await page.locator("[data-generate-parlay]").click();
    const sealBtn = page.getByRole("button", { name: /Sellar en Mi récord/i });
    await expect(sealBtn).toBeEnabled();

    const clearBtn = page.getByRole("button", { name: /^Limpiar$/i });
    await expect(clearBtn).toBeVisible();

    // 1) Confirmar acción destructiva: foco inicial en Cancelar (acción segura ADR-054)
    await clearBtn.click();
    const confirmDialog = page.locator("[data-confirm-action-dialog]");
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog).toContainText(/Vaciar parlay/i);

    const cancelBtn = confirmDialog.getByRole("button", { name: "Cancelar" });
    await expect(cancelBtn).toBeVisible();
    await expect(cancelBtn).toBeFocused();

    // Cancelar conserva las selecciones intactas
    await cancelBtn.click();
    await expect(confirmDialog).toHaveCount(0);
    await expect(sealBtn).toBeEnabled();

    // 2) Confirmar vaciado -> limpia el boleto y ofrece toast reversible «Deshacer»
    await clearBtn.click();
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.locator("[data-confirm-action-btn]").click();
    await expect(confirmDialog).toHaveCount(0);
    await expect(page.getByText("Tu boleto combinado está vacío")).toBeVisible();

    const undoBtn = page.locator("[data-toast-undo]", { hasText: "Deshacer" }).first();
    await expect(undoBtn).toBeVisible();
    await undoBtn.click();

    // Tras pulsar Deshacer, las selecciones regresan al boleto
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

    // Sin PIN beta ni sesión: /offline debe ser pública (HTTP 200)
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
