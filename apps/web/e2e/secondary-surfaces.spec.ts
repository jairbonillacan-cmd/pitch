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

async function installClsObserver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state = { cls: 0 };
    if (typeof PerformanceObserver === "function") {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const val: unknown = Reflect.get(entry, "value");
            const recent: unknown = Reflect.get(entry, "hadRecentInput");
            if (recent === false && typeof val === "number" && Number.isFinite(val)) {
              state.cls += val;
            }
          }
        });
        observer.observe({ type: "layout-shift", buffered: true });
      } catch (err) {
        void err;
      }
    }
    Object.defineProperty(window, "__plSecondaryCls", {
      value: state,
      configurable: true,
      writable: true,
    });
  });
}

async function readCls(page: Page): Promise<number> {
  return page.evaluate(() => {
    const raw: unknown = Reflect.get(window, "__plSecondaryCls");
    if (!raw || typeof raw !== "object") return 0;
    const clsVal: unknown = Reflect.get(raw, "cls");
    return typeof clsVal === "number" && Number.isFinite(clsVal)
      ? Math.round(clsVal * 10_000) / 10_000
      : 0;
  });
}

async function resetCls(page: Page): Promise<void> {
  await page.evaluate(() => {
    const raw: unknown = Reflect.get(window, "__plSecondaryCls");
    if (raw && typeof raw === "object") {
      Reflect.set(raw, "cls", 0);
    }
  });
}

async function assertNoOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
  );
  expect(overflow, `Desborde horizontal en ${label}`).toBeLessThanOrEqual(1);
}

async function assertCleanWcag(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const severe = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
  expect(
    severe.map((v) => `${v.id}: ${v.help}`),
    `Violaciones WCAG AA en ${label}`,
  ).toEqual([]);
}

test.describe("Superficies secundarias del Club · WCAG AA, móvil/tablet 768 px, CLS y Cero-Fuga", () => {
  test("Social, perfiles, alertas, momios y comparador cumplen layout, Cero-Fuga y Axe AA", async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    const origin = resolveOrigin(testInfo.project.use.baseURL);
    const isMobile = testInfo.project.name === "mobile";
    await page.setViewportSize(
      isMobile ? { width: 375, height: 812 } : { width: 1440, height: 900 },
    );

    await unlockBeta(page, origin, isMobile ? 201 : 202);

    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/app/social");
    await expect(page.locator("#main")).toBeVisible();
    await assertNoOverflow(page, "/app/social inicial");
    await assertCleanWcag(page, "/app/social");

    for (const label of ["Para ti", "Siguiendo", "Consenso", "Ranking"] as const) {
      const tab = page.getByRole("tab", { name: new RegExp(label, "i") }).first();
      if ((await tab.count()) > 0) {
        await tab.click();
        await assertNoOverflow(page, `/app/social tab ${label}`);
      }
    }
    await page.getByRole("tab", { name: /Para ti/i }).first().click();

    const firstReplyAuthor = page.locator(".pl-com-comment-author").first();
    if ((await firstReplyAuthor.count()) > 0) {
      const authorGap = await firstReplyAuthor.evaluate((el) => {
        const st = getComputedStyle(el);
        return Number.parseFloat(st.columnGap || st.gap || "0");
      });
      expect(authorGap, ".pl-com-comment-author debe separar nombre y @handle").toBeGreaterThanOrEqual(3);
    }

    const memberProfileRes = await page.goto("/app/u/sofia_nfl");
    expect(memberProfileRes?.status()).toBe(200);
    await expect(page.locator("#main")).toBeVisible();
    await assertNoOverflow(page, "/app/u/sofia_nfl");

    const anonPublicContext = await page.context().browser()!.newContext({ baseURL: origin });
    const anonPublicRes = await anonPublicContext.request.get("/u/sofia_nfl");
    expect(anonPublicRes.status()).toBe(404);
    await anonPublicContext.close();

    await page.goto("/app/alertas");
    await expect(page.locator("#main")).toBeVisible();
    await assertNoOverflow(page, "/app/alertas");
    await assertCleanWcag(page, "/app/alertas");

    await page.goto("/app/momios");
    await expect(page.locator("table").first()).toBeVisible();
    await assertNoOverflow(page, "/app/momios");
    await assertCleanWcag(page, "/app/momios");
    const firstHeaderPos = await page
      .locator("table th:first-child")
      .first()
      .evaluate((el) => getComputedStyle(el).position);
    expect(firstHeaderPos).toBe("sticky");

    await page.goto("/app/comparar?modo=equipos&liga=liga-mx");
    await expect(page.locator("#main")).toBeVisible();
    await assertNoOverflow(page, "/app/comparar equipos");
    await assertCleanWcag(page, "/app/comparar equipos");

    if (isMobile) {
      await page.setViewportSize({ width: 320, height: 640 });
      await assertNoOverflow(page, "/app/comparar 320x640");
      const metaOverflowOrClip = await page.locator(".pl-sf-card-meta").evaluateAll((els) =>
        els.filter((el) => {
          const st = getComputedStyle(el);
          return st.textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth + 1;
        }).length,
      );
      expect(metaOverflowOrClip).toBe(0);
    }

    await page.goto("/app/comparar?modo=jugadores&liga=premier-league");
    await expect(page.locator("#main")).toBeVisible();
    await assertNoOverflow(page, "/app/comparar jugadores");

    expect(pageErrors).toEqual([]);
  });

  test("Cuenta (4 pestañas CLS <= 0.01), Canjear, objetivos >= 44 px y anti-zoom >= 16 px en 768×1024", async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    const origin = resolveOrigin(testInfo.project.use.baseURL);
    await installClsObserver(page);
    await unlockBeta(page, origin, testInfo.project.name === "mobile" ? 203 : 204);

    const tabletOrPhone =
      testInfo.project.name === "mobile"
        ? { width: 375, height: 812 }
        : { width: 768, height: 1024 };
    await page.setViewportSize(tabletOrPhone);

    for (const tab of ["plan", "referrals", "cfdi", "prefs"] as const) {
      await page.goto(`/app/account?tab=${tab}`);
      await expect(page.locator("#main")).toBeVisible();
      await page.waitForTimeout(300);
      await assertNoOverflow(page, `/app/account?tab=${tab}`);
      const cls = await readCls(page);
      expect(cls, `CLS excesivo en /app/account?tab=${tab}`).toBeLessThanOrEqual(0.01);
      await resetCls(page);
    }

    await assertCleanWcag(page, "/app/account?tab=prefs");

    const logoBox = await page.locator(".pl-header-logo").first().boundingBox();
    expect(logoBox).not.toBeNull();
    expect(Math.round(logoBox!.height)).toBeGreaterThanOrEqual(44);

    const searchInput = page.locator(".pl-acct-search-input").first();
    await expect(searchInput).toBeVisible();
    const searchFontSize = await searchInput.evaluate((el) =>
      Number.parseFloat(getComputedStyle(el).fontSize),
    );
    expect(searchFontSize).toBeGreaterThanOrEqual(16);

    await page.goto("/app/canjear");
    await expect(page.locator("#main")).toBeVisible();
    await assertNoOverflow(page, "/app/canjear");
    await assertCleanWcag(page, "/app/canjear");
  });
});
