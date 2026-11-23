import { expect, test } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
import path from "node:path";

async function waitForVisualFrame(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => resolve());
        });
      }),
  );
}

async function toggleClubTheme(
  page: import("@playwright/test").Page,
  expectedTheme: "dark" | "light",
): Promise<void> {
  await page.locator("[data-profile-menu-trigger]:visible").first().click();
  await page
    .locator('.pl-profile-menu:popover-open [data-theme-option][aria-pressed="false"]')
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", expectedTheme);
  await page.keyboard.press("Escape");
  await expect(page.locator(".pl-profile-menu:popover-open")).toHaveCount(0);
  await expect(page.locator(".pl-profile-menu:not(.pl-notif-menu)")).toBeHidden();
  await waitForVisualFrame(page);
}

test("Club PitchLab v4 + Ola 6: Inicio Maestro-Detalle, Jornada, Buscador, Parlays & SGP, Props Lab, Comunidad VIP, Tipster y Referidos (+7d)", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const isMobile = testInfo.project.name === "mobile";
  const width = isMobile ? 390 : 1440;
  await page.setViewportSize({ width, height: 900 });

  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const uniqueIp = `198.51.${Math.floor(Math.random() * 200) + 10}.${Math.floor(Math.random() * 200) + 10}`;
  const unlock = await page.request.post("/api/beta/unlock", {
    headers: { "x-forwarded-for": uniqueIp, origin: "http://127.0.0.1:3100" },
    data: { code: "2026", next: "/app" },
  });
  expect(unlock.ok()).toBe(true);

  await page.goto("/app");
  await expect(page).toHaveURL(/\/app(?:\?.*)?$/);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await expect(page.getByRole("group", { name: "Elegir día" })).toBeVisible();
  const sportGroup = page.getByRole("group", { name: "Elegir deporte" });
  await expect(sportGroup).toBeVisible();

  const initialDayJump = page.locator("[data-day-empty] [data-day-jump]").first();
  if ((await initialDayJump.count()) > 0 && (await initialDayJump.isVisible())) {
    await initialDayJump.click();
  }

  let firstMatchHref: string | null = null;

  if (!isMobile) {
    await expect(page.locator("[data-home-master-detail]")).toBeVisible();
    await expect(page.locator("[data-home-master-list]")).toBeVisible();
    await expect(page.locator("[data-home-detail-pane]")).toBeVisible();
    const detailPanel = page.locator("[data-home-detail-panel]");
    await expect(detailPanel).toBeVisible();

    const fullCta = page.locator("[data-home-detail-full-cta]");
    await expect(fullCta).toBeVisible();
    await expect(fullCta).toContainText(/Ver partido completo/i);
    const initialFullHref = await fullCta.getAttribute("href");
    expect(initialFullHref).toMatch(/^\/app\/[a-z0-9-]+\/g\/[a-z0-9-]+/);
    firstMatchHref = initialFullHref;

    await page.evaluate(() => {
      (window as Window & { __plMasterDetailSentinel?: string }).__plMasterDetailSentinel =
        "alive";
    });

    const masterCards = page.locator("[data-home-master-list] [data-game-card][data-game-id]");
    const unselectedCard = page
      .locator('[data-home-master-list] [data-game-card][data-game-id][data-selected="false"]')
      .first();
    const candidateSecondCard =
      (await unselectedCard.count()) > 0 ? unselectedCard : masterCards.nth(1);

    if ((await candidateSecondCard.count()) > 0) {
      const targetGameId = await candidateSecondCard.getAttribute("data-game-id");
      expect(targetGameId).toBeTruthy();

      const targetCard = page
        .locator(`[data-home-master-list] [data-game-card][data-game-id="${targetGameId}"]`)
        .first();
      const cardOpenTrigger = targetCard.locator("[data-card-open]").first();
      if ((await cardOpenTrigger.count()) > 0 && (await cardOpenTrigger.isVisible())) {
        await cardOpenTrigger.click();
      } else {
        await targetCard.click();
      }

      await expect(targetCard).toHaveAttribute("data-selected", "true");
      await expect
        .poll(() => new URL(page.url()).searchParams.get("match"))
        .toBe(targetGameId);

      const sentinel = await page.evaluate(
        () => (window as Window & { __plMasterDetailSentinel?: string }).__plMasterDetailSentinel,
      );
      expect(sentinel).toBe("alive");

      await expect(detailPanel).toBeVisible();
      await expect(fullCta).toBeVisible();
      const updatedFullHref = await fullCta.getAttribute("href");
      expect(updatedFullHref).toMatch(/^\/app\/[a-z0-9-]+\/g\/[a-z0-9-]+/);
      if (updatedFullHref) {
        firstMatchHref = updatedFullHref;
      }
    }

    const detailTabs = page.locator('[data-home-detail-tabs] [role="tab"]:not([disabled])');
    const detailTabCount = await detailTabs.count();
    expect(detailTabCount).toBeGreaterThanOrEqual(1);
    if (detailTabCount >= 2) {
      const secondTab = detailTabs.nth(1);
      await secondTab.click();
      await expect(secondTab).toHaveAttribute("aria-selected", "true");
      await detailTabs.first().click();
      await expect(detailTabs.first()).toHaveAttribute("aria-selected", "true");
    }

    const parlayModeBtn = page.locator('[data-home-right-mode="parlay"]');
    await expect(parlayModeBtn).toBeVisible();
    await parlayModeBtn.click();
    await expect(page.getByRole("heading", { name: "Tu boleto de parlay" })).toBeVisible();
    const parlayHubTabs = page.getByRole("tablist", { name: "Opciones de parlay" });
    const dailyParlayTab = parlayHubTabs.getByRole("tab", { name: /Parlay del día/i });
    await expect(dailyParlayTab).toBeVisible();
    await dailyParlayTab.click();
    await expect(page.locator("[data-daily-parlay-card]")).toBeVisible();
    await page.locator('[data-daily-risk="conservador"]').click();
    await page.locator('[data-daily-risk="arriesgado"]').click();
    await page.locator('[data-daily-risk="medio"]').click();
    await parlayHubTabs.getByRole("tab", { name: /Tu parlay/i }).click();

    const matchModeBtn = page.locator('[data-home-right-mode="match"]');
    await expect(matchModeBtn).toBeVisible();
    await matchModeBtn.click();
    await expect(detailPanel).toBeVisible();
  } else {
    await expect(page.locator("[data-home-detail-pane]")).toBeHidden();
    const parlayHeading = page.getByRole("heading", { name: "Tu boleto de parlay" });
    if ((await parlayHeading.count()) > 0 && (await parlayHeading.isVisible())) {
      await expect(parlayHeading).toBeVisible();
      const parlayHubTabs = page.getByRole("tablist", { name: "Opciones de parlay" });
      const dailyParlayTab = parlayHubTabs.getByRole("tab", { name: /Parlay del día/i });
      await expect(dailyParlayTab).toBeVisible();
      await dailyParlayTab.click();
      await expect(page.locator("[data-daily-parlay-card]")).toBeVisible();
      await page.locator('[data-daily-risk="conservador"]').click();
      await page.locator('[data-daily-risk="arriesgado"]').click();
      await page.locator('[data-daily-risk="medio"]').click();
      await parlayHubTabs.getByRole("tab", { name: /Tu parlay/i }).click();
    }
  }

  const nbaBtn = sportGroup.getByRole("button", { name: /NBA/i });
  await nbaBtn.click();
  await expect(nbaBtn).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('.pl-header-leagueband[data-open="true"]')).toHaveCount(0);
  const nbaDayJump = page.locator("[data-day-empty] [data-day-jump]");
  if ((await nbaDayJump.count()) > 0) {
    await nbaDayJump.click();
  }
  const nbaChips = page.locator("[data-match-chip]");
  const nbaChipCount = await nbaChips.count();
  expect(nbaChipCount).toBeGreaterThan(0);
  const chipLeagues = await nbaChips.evaluateAll((els) =>
    els.map((el) => el.getAttribute("data-chip-league")),
  );
  expect(new Set(chipLeagues)).toEqual(new Set(["nba"]));

  await sportGroup.getByRole("button", { name: /Todos los deportes/ }).click();
  const chipsNext = page.locator("[data-chips-next]");
  if ((await chipsNext.count()) > 0 && (await chipsNext.isEnabled())) {
    await chipsNext.click();
    await expect(async () => {
      const sl = await page.locator("[data-day-chips]").evaluate((el) => el.scrollLeft);
      expect(sl).toBeGreaterThan(0);
    }).toPass({ timeout: 3_000 });
    const chipsPrev = page.locator("[data-chips-prev]");
    await expect(chipsPrev).toBeEnabled();
    await chipsPrev.click();
  }

  await sportGroup.getByRole("button", { name: /Todos los deportes/ }).click();
  const dayCenter = page.locator("[data-day-center]");
  const nextBtn = page.locator("[data-day-next]");
  const initialDayLabel = (await dayCenter.innerText()).trim();
  if (!(await nextBtn.isDisabled())) {
    await nextBtn.click();
  }
  await expect(dayCenter).not.toHaveText(initialDayLabel);
  await dayCenter.click();
  const calPopover = page.locator("[data-home-calendar-popover]");
  await expect(calPopover).toBeVisible();
  const calBox = await calPopover.boundingBox();
  expect(calBox).not.toBeNull();
  expect(calBox!.x).toBeGreaterThanOrEqual(0);
  expect(Math.round(calBox!.x + calBox!.width)).toBeLessThanOrEqual(width + 1);
  await calPopover.locator(".pl-home-cal-today-btn").click();
  await expect(calPopover).toBeHidden();
  await expect(dayCenter).toContainText("Hoy");

  if (width <= 640) {
    await page.setViewportSize({ width: 375, height: 844 });
    const overflow375 = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow375).toBe(false);
    const touchHeights = await page
      .locator("[data-home-filterbar] button:not(:disabled)")
      .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
    for (const h of touchHeights) {
      expect(h).toBeGreaterThanOrEqual(44);
    }
    await page.setViewportSize({ width, height: 900 });
  }

  const soccerTile = sportGroup.getByRole("button", { name: /^Fútbol\b/ }).first();
  if ((await soccerTile.count()) > 0) {
    await soccerTile.click();
    await expect(soccerTile).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("group", { name: "Ligas del deporte" })).toBeVisible();
    const dayEmpty = page.locator("[data-day-empty]");
    if ((await dayEmpty.count()) > 0) {
      await expect(dayEmpty).toContainText("Sin partidos este día");
      const jumpBtn = page.locator("[data-day-jump]");
      await expect(jumpBtn).toContainText(/^Ir al /);
      await jumpBtn.click();
    }
    const scheduledFootballLink = page
      .locator('[data-game-card]:has(button[aria-label^="Agregar al parlay"]) a[href^="/app/"][href*="/g/"]')
      .first();
    if ((await scheduledFootballLink.count()) > 0) {
      firstMatchHref = await scheduledFootballLink.getAttribute("href");
    }
    if (!(await dayCenter.innerText()).includes("Hoy")) {
      await dayCenter.click();
      await page.locator("[data-home-calendar-popover] .pl-home-cal-today-btn").click();
    }
    await sportGroup.getByRole("button", { name: /Todos los deportes/ }).click();
  }
  if (!firstMatchHref) {
    const detailCtaFallback = page.locator("[data-home-detail-full-cta]").first();
    if ((await detailCtaFallback.count()) > 0) {
      firstMatchHref = await detailCtaFallback.getAttribute("href");
    }
  }
  if (!firstMatchHref) {
    firstMatchHref = await page
      .locator('a[href^="/app/"][href*="/g/"]')
      .first()
      .getAttribute("href");
  }

  const addButton = page.locator("[data-game-card] button[aria-label^='Agregar al parlay']").first();
  if ((await addButton.count()) > 0) {
    await addButton.click();
    await expect(
      page.locator("[data-game-card] button[aria-label^='Quitar del parlay']").first(),
    ).toBeVisible();
  }

  for (const theme of ["dark", "light"] as const) {
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasOverflow).toBe(false);

    await page.screenshot({
      path: path.resolve(
        process.cwd(),
        `../../test-results/screenshots/club-jornada-${width}-${theme}.png`,
      ),
      fullPage: false,
    });

    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(violations).toEqual([]);

    if (theme === "dark") {
      await toggleClubTheme(page, "light");
    }
  }

  await toggleClubTheme(page, "dark");

  await page.getByRole("button", { name: "Buscar" }).click();
  const searchInput = page.getByRole("combobox", {
    name: /Buscar partido,.*liga/i,
  });
  await expect(searchInput).toBeVisible();
  await searchInput.fill("NFL");
  await expect(
    page
      .getByRole("dialog", { name: "Buscar en PitchLab" })
      .locator('a[href^="/app/nfl/g/"]')
      .first(),
  ).toBeVisible();
  await page
    .getByRole("dialog", { name: "Buscar en PitchLab" })
    .getByRole("button", { name: "Cerrar" })
    .click();

  if (isMobile) {
    const mobileJump = page.locator("[data-day-empty] [data-day-jump]").first();
    if ((await mobileJump.count()) > 0 && (await mobileJump.isVisible())) {
      await mobileJump.click();
    }
    const mobileCard = page.locator("[data-game-card]").first();
    if ((await mobileCard.count()) > 0 && (await mobileCard.isVisible())) {
      const mobileCardBox = await mobileCard.boundingBox();
      expect(mobileCardBox).not.toBeNull();
      expect(Math.round(mobileCardBox!.height)).toBeGreaterThanOrEqual(44);
      const mobileCardTrigger = mobileCard.locator("[data-card-open]").first();
      if ((await mobileCardTrigger.count()) > 0 && (await mobileCardTrigger.isVisible())) {
        await mobileCardTrigger.click();
      } else {
        await mobileCard.click();
      }
      await page.waitForURL(/\/app\/[a-z0-9-]+\/g\/[a-z0-9-]+/, { timeout: 15_000 });
      firstMatchHref = new URL(page.url()).pathname;
    }
  }

  await page.goto("/app/parlays");
  await expect(page.getByRole("heading", { name: /Armar parlay/i })).toBeVisible();
  const autoPanel = page.locator("[data-parlay-auto-panel]:visible");
  await expect(autoPanel).toHaveCount(1);
  await expect(autoPanel).toBeVisible();
  const fourLegsBtn = autoPanel
    .getByRole("group", { name: "Número de selecciones" })
    .getByRole("button", { name: "4", exact: true });
  if (await fourLegsBtn.isEnabled()) {
    await fourLegsBtn.click();
  }
  await autoPanel
    .getByRole("group", { name: "Estilo de riesgo" })
    .getByRole("button", { name: "Conservador" })
    .click();
  if (width <= 640) {
    await page.setViewportSize({ width: 375, height: 844 });
    const overflowParlays375 = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflowParlays375).toBe(false);
    await page.setViewportSize({ width, height: 900 });
  }
  await page.locator("[data-generate-parlay]").click();
  const sealParlayBtn = page.getByRole("button", { name: /Sellar en Mi récord/i }).first();
  await expect(sealParlayBtn).toBeEnabled();
  await sealParlayBtn.click();

  await page.goto("/app/props");
  await expect(
    page.getByRole("heading", { level: 1, name: /Props de jugadores/i }),
  ).toBeVisible();
  const plusButtons = page.getByRole("button", { name: /Subir línea/i });
  if ((await plusButtons.count()) > 0) {
    await plusButtons.first().click();
  }

  await page.goto("/app/social");
  await expect(page.getByRole("heading", { name: /^Comunidad$/i })).toBeVisible();
  if ((page.viewportSize()?.width ?? 1280) <= 640) {
    await page.locator(".pl-com-composer-row:visible").first().click();
  }
  const socialComposer = page.locator("form.pl-com-composer:visible");
  const socialTextarea = socialComposer.locator("textarea");
  await socialTextarea.fill("Únanse a mi grupo externo https://t.me/spam_picks");
  await socialComposer.getByRole("button", { name: /^Publicar$/i }).click();
  await expect(page.locator("p[role='alert']")).toContainText(/enlaces externos/i);

  await socialTextarea.fill(
    "Excelente lectura previa de Cortex IA en el cruce estelar; entré con 1.5u.",
  );
  await socialComposer.getByRole("button", { name: /^Publicar$/i }).click();
  await expect(page.locator("body")).toContainText("Excelente lectura previa de Cortex IA");

  await page.goto("/app/tipster");
  await expect(page.getByRole("heading", { name: /Portal Tipster/i })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page
    .getByRole("button", { name: /Generar Boleto 4:5 \/ 9:16 con mi Código/i })
    .click();
  const shareDialog = page.getByRole("dialog");
  await expect(shareDialog).toBeVisible();
  await expect(shareDialog).toContainText("SOFIA5");
  await page.getByRole("button", { name: "Cerrar vista de boleto" }).click();

  await page.goto("/app/account?tab=referrals");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("[data-referral-days]:visible")).toContainText("+14 días");
  await expect(page.locator("[data-example-badge]:visible").first()).toBeVisible();
  await expect(page.locator("#pl-acct-ref-link")).toHaveValue("pitchlab.mx/i/JAIR-2611");
  await expect(async () => {
    await page.locator("[data-copy-short-link]:visible").click();
    await expect(page.locator("[data-copy-short-link]:visible")).toHaveText("Copiado", {
      timeout: 1_500,
    });
  }).toPass({ timeout: 10_000 });
  await expect(page.locator("[data-simulate-referral]")).toHaveCount(0);

  await page.goto("/app/historial");
  await expect(page.locator("[data-hist-daily-parlays]")).toBeVisible();
  const histCalBtn = page.locator("[data-historial-view-toggle] button", { hasText: "Calendario" });
  await histCalBtn.click();
  await expect(page.locator("[data-daily-results-calendar]")).toBeVisible();
  if (width <= 640) {
    await page.setViewportSize({ width: 375, height: 844 });
    const overflowHist375 = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflowHist375).toBe(false);
    await page.setViewportSize({ width, height: 900 });
  }

  await page.goto("/app/picks");
  await expect(page.locator("[data-picks-layout]")).toBeVisible();
  await expect(page.locator("[data-picks-row]").first()).toBeVisible({ timeout: 15_000 });

  if (firstMatchHref) {
    await page.goto(firstMatchHref);
    const numbersTab = page.getByRole("tab", { name: /^Números/i });
    await expect(numbersTab).toBeVisible();
    await numbersTab.click();
    await expect(numbersTab).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/\?tab=numeros$/);
    await expect(page.locator("[data-numbers-expected]")).toBeVisible();
    await expect(page.locator(".pl-mkt-wrap")).toBeVisible();
    await expect(page.getByText(/Derivado del motor/i).first()).toBeVisible();
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/\b(Poisson|Dixon-Coles|sigma|matriz|tipstar)\b/i);
    if (width <= 640) {
      await page.setViewportSize({ width: 375, height: 844 });
      const overflowMatch375 = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflowMatch375).toBe(false);
      await page.setViewportSize({ width, height: 900 });
    }
  }

  expect(errors).toEqual([]);
});

test("Modo Sólido unificado en /app: sin opción Cristal, diferenciación real fondo/tarjetas y Axe AA en oscuro y claro", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const width = testInfo.project.name === "mobile" ? 390 : 1440;
  await page.setViewportSize({ width, height: 900 });

  const uniqueIp = `198.51.${Math.floor(Math.random() * 200) + 10}.${Math.floor(Math.random() * 200) + 10}`;
  const unlock = await page.request.post("/api/beta/unlock", {
    headers: { "x-forwarded-for": uniqueIp, origin: "http://127.0.0.1:3100" },
    data: { code: "2026", next: "/app" },
  });
  expect(unlock.ok()).toBe(true);

  await page.addInitScript(() => {
    window.localStorage.setItem("pl-style", "glass");
  });

  await page.goto("/app");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-style", "solid");
  await expect(page.locator(".pl-atmo")).toBeHidden();

  const surfaceCheck = await page.evaluate(() => {
    const stage = document.querySelector(".pl-stage");
    const card = document.querySelector(
      ".pl-home-card, .pl-astro-league-block, [data-home-detail-panel], .glass-card",
    );
    const header = document.querySelector(".panel-header");
    return {
      stageBg: stage ? getComputedStyle(stage).backgroundColor : null,
      cardBg: card ? getComputedStyle(card).backgroundColor : null,
      headerBg: header ? getComputedStyle(header).backgroundColor : null,
    };
  });
  expect(surfaceCheck.stageBg).not.toBe("rgb(0, 0, 0)");
  expect(surfaceCheck.cardBg).not.toBeNull();
  expect(surfaceCheck.cardBg).not.toBe(surfaceCheck.stageBg);
  expect(surfaceCheck.headerBg).not.toBe(surfaceCheck.stageBg);

  await page.screenshot({
    path: `../../test-results/screenshots/app-home-${testInfo.project.name}-dark.png`,
    fullPage: false,
  });

  const darkAxe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(darkAxe.violations.map((v) => v.id)).toEqual([]);

  await page.locator("[data-profile-menu-trigger]:visible").first().click();
  const menu = page.locator(".pl-profile-menu:popover-open");
  await expect(menu.getByRole("group", { name: "Estilo" })).toHaveCount(0);
  await expect(menu.getByText("Cristal")).toHaveCount(0);
  await menu.locator('[data-theme-option="light"]').click();
  await expect(html).toHaveAttribute("data-theme", "light");
  await expect(html).toHaveAttribute("data-style", "solid");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(page.locator(".pl-profile-menu:not(.pl-notif-menu)")).toBeHidden();
  await waitForVisualFrame(page);

  await page.screenshot({
    path: `../../test-results/screenshots/app-home-${testInfo.project.name}-light.png`,
    fullPage: false,
  });

  const lightAxe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(lightAxe.violations.map((v) => v.id)).toEqual([]);
});
