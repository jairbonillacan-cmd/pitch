import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";

const WEB_DIR = path.resolve(import.meta.dirname, "..");
const REPO_ROOT = path.resolve(WEB_DIR, "../..");
const requireFromWeb = createRequire(path.join(WEB_DIR, "package.json"));
const { chromium } = requireFromWeb("@playwright/test");
const axeMod = requireFromWeb("@axe-core/playwright");
const AxeBuilder = axeMod.AxeBuilder ?? axeMod.default ?? axeMod;

const BASE_BETA = process.env.BASE_BETA || "http://127.0.0.1:3121";
const BASE_ACCOUNTS = process.env.BASE_ACCOUNTS || "http://127.0.0.1:3122";
const OUT_DIR = path.join(REPO_ROOT, "test-results/screenshots/login-2");

fs.mkdirSync(OUT_DIR, { recursive: true });

async function waitImages(page) {
  await page.evaluate(async () => {
    const imgs = Array.from(document.querySelectorAll("img")).filter((img) => {
      const style = window.getComputedStyle(img);
      return style.display !== "none" && style.visibility !== "hidden";
    });
    await Promise.all(
      imgs.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise((resolve) => {
              img.addEventListener("load", () => resolve(), { once: true });
              img.addEventListener("error", () => resolve(), { once: true });
              setTimeout(resolve, 3000);
            }),
      ),
    );
  });
}

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t;
    localStorage.setItem("pl-theme", t);
  }, theme);
  await page.waitForTimeout(120);
}

const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900, mobile: false, mustNotScrollY: true },
  { name: "1280x720", width: 1280, height: 720, mobile: false, mustNotScrollY: true },
  { name: "375x667", width: 375, height: 667, mobile: true, mustNotScrollY: true },
  { name: "390x844", width: 390, height: 844, mobile: true, mustNotScrollY: true },
];

const EXTRA_WIDTHS = [
  { name: "320x667", width: 320, height: 667 },
  { name: "430x932", width: 430, height: 932 },
  { name: "820x900", width: 820, height: 900 },
];

const report = {
  viewports: [],
  extraWidths: [],
  flows: {},
};

const browser = await chromium.launch();

try {
  // 1. Capturas en los 4 tamaños x 2 temas + métricas de scroll y Axe WCAG 2.2 AA
  for (const vp of VIEWPORTS) {
    for (const theme of ["dark", "light"]) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        reducedMotion: "reduce",
      });
      const page = await ctx.newPage();
      await page.addInitScript((t) => {
        localStorage.setItem("pl-theme", t);
        document.documentElement.dataset.theme = t;
      }, theme);
      await page.goto(`${BASE_BETA}/login`, { waitUntil: "networkidle" });
      await setTheme(page, theme);
      await waitImages(page);

      const metrics = await page.evaluate(() => ({
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        previewVisible: (() => {
          const el = document.querySelector(".pl-auth-preview");
          return Boolean(el && getComputedStyle(el).display !== "none");
        })(),
        secondaryVisible: (() => {
          const el = document.querySelector(".pl-auth-secondary-card");
          return Boolean(el && getComputedStyle(el).display !== "none");
        })(),
        h1Count: document.querySelectorAll("h1").length,
        btnBetaCount: document.querySelectorAll(".btn-beta").length,
      }));

      const axe = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();

      const fileName = `login-${vp.name}-${theme}.png`;
      await page.screenshot({
        path: path.join(OUT_DIR, fileName),
        fullPage: false,
      });

      report.viewports.push({
        viewport: vp.name,
        theme,
        fileName,
        ...metrics,
        axeViolations: axe.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.length,
        })),
      });

      if (metrics.scrollWidth > metrics.innerWidth) {
        throw new Error(
          `Horizontal scroll detected at ${vp.name} (${theme}): ${metrics.scrollWidth} > ${metrics.innerWidth}`,
        );
      }
      if (vp.mustNotScrollY && metrics.scrollHeight > metrics.innerHeight) {
        throw new Error(
          `Vertical scroll detected at ${vp.name} (${theme}): ${metrics.scrollHeight} > ${metrics.innerHeight}`,
        );
      }
      if (axe.violations.length > 0) {
        throw new Error(
          `Axe violations at ${vp.name} (${theme}): ${JSON.stringify(axe.violations, null, 2)}`,
        );
      }

      await ctx.close();
    }
  }

  // 2. Anchos extremos (320px, 430px, 820px)
  for (const vp of EXTRA_WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      reducedMotion: "reduce",
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE_BETA}/login`, { waitUntil: "networkidle" });
    const m = await page.evaluate(() => {
      const sheet = document.querySelector(".pl-auth-sheet");
      const preview = document.querySelector(".pl-auth-preview");
      return {
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        sheetWidth: sheet ? Math.round(sheet.getBoundingClientRect().width) : 0,
        previewDisplay: preview ? getComputedStyle(preview).display : "missing",
      };
    });
    report.extraWidths.push({ viewport: vp.name, ...m });
    if (m.scrollWidth > m.innerWidth) {
      throw new Error(
        `Horizontal scroll at ${vp.name}: ${m.scrollWidth} > ${m.innerWidth}`,
      );
    }
    if (vp.width === 820 && (m.previewDisplay !== "none" || m.sheetWidth !== 460)) {
      throw new Error(
        `Expected preview hidden & 460px sheet at 820px, got: ${JSON.stringify(m)}`,
      );
    }
    await ctx.close();
  }

  // 3. Flujos manuales en modo Beta (errores, ?ref=, Tab focus, PIN 9999 y PIN 2026 -> ?next=/app/premier-league)
  {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await ctx.newPage();
    await page.setExtraHTTPHeaders({ "x-forwarded-for": "198.51.100.77" });

    await page.goto(`${BASE_BETA}/login?ref=SOFIA5`, { waitUntil: "networkidle" });
    const promoText = await page.locator(".pl-auth-promo").textContent();
    if (!promoText || !promoText.includes("SOFIA5 aplicado: 7 días gratis, sin tarjeta")) {
      throw new Error(`Unexpected promo banner: ${promoText}`);
    }
    await page.screenshot({
      path: path.join(OUT_DIR, "login-1440x900-ref-dark.png"),
    });

    await page.goto(`${BASE_BETA}/login?next=%2Fapp%2Fpremier-league`, {
      waitUntil: "networkidle",
    });

    const tabStops = [];
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return null;
        const st = getComputedStyle(el);
        return {
          tag: el.tagName,
          text: (
            el.textContent ||
            el.getAttribute("aria-label") ||
            el.getAttribute("placeholder") ||
            ""
          )
            .trim()
            .slice(0, 40),
          hasFocusStyle:
            (st.outlineStyle !== "none" && parseFloat(st.outlineWidth) >= 2) ||
            st.boxShadow !== "none",
        };
      });
      tabStops.push(info);
    }
    report.flows.tabStops = tabStops;
    if (tabStops.some((s) => !s || !s.hasFocusStyle)) {
      throw new Error(`Missing focus ring in tab stops: ${JSON.stringify(tabStops)}`);
    }

    await page.locator("form.pl-auth-form button[type='submit']").click();
    const emptyErr = await page.locator("#pl-login-error").textContent();
    const describedByOnErr = await page
      .locator("#pl-login-email")
      .getAttribute("aria-describedby");
    const liveAttr = await page.locator("#pl-login-error").getAttribute("aria-live");
    if (!emptyErr || liveAttr !== "polite" || !describedByOnErr?.includes("pl-login-error")) {
      throw new Error(
        `Empty email a11y error failed: err=${emptyErr}, live=${liveAttr}, describedby=${describedByOnErr}`,
      );
    }
    report.flows.emptyEmailError = emptyErr.trim();

    await page.locator("#pl-login-email").fill("correo-malo");
    await page.locator("form.pl-auth-form button[type='submit']").click();
    const invalidErr = (await page.locator("#pl-login-error").textContent())?.trim();
    if (!invalidErr || !invalidErr.includes("válido")) {
      throw new Error(`Invalid email check failed: ${invalidErr}`);
    }
    report.flows.invalidEmailError = invalidErr;

    await page.locator("#pl-login-email").fill("usuario@mailinator.com");
    await page.locator("form.pl-auth-form button[type='submit']").click();
    const dispErr = (await page.locator("#pl-login-error").textContent())?.trim();
    if (!dispErr || !dispErr.includes("temporales")) {
      throw new Error(`Disposable email check failed: ${dispErr}`);
    }
    report.flows.disposableEmailError = dispErr;

    await page.locator(".btn-beta").click();
    await page.locator(".pin-dialog").waitFor({ state: "visible" });
    await page.screenshot({
      path: path.join(OUT_DIR, "login-pin-dialog-dark.png"),
    });
    for (const d of ["9", "9", "9", "9"]) {
      await page.locator(`button.pin-key[data-pin-digit='${d}']`).click();
    }
    const pinErr = (await page.locator(".pin-feedback.error").textContent())?.trim();
    if (!pinErr || !pinErr.includes("Código incorrecto")) {
      throw new Error(`Wrong PIN check failed: ${pinErr}`);
    }
    report.flows.wrongPinFeedback = pinErr;

    for (const d of ["2", "0", "2", "6"]) {
      await page.locator(`button.pin-key[data-pin-digit='${d}']`).click();
    }
    await page.waitForURL("**/app/premier-league", { timeout: 15000 });
    report.flows.pinRedirectUrl = page.url();

    await ctx.close();
  }

  // 4. Flujo con cuentas simuladas (accountsEnabled=true): fallo de envío, enlace mágico, Revisa tu correo, Reenviar (30 s) y Usar otro correo
  {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await ctx.newPage();
    const magicLinkCalls = [];
    let failNextCall = true;
    await page.route("**/api/auth/sign-in/magic-link", async (route) => {
      const postData = route.request().postDataJSON();
      magicLinkCalls.push(postData);
      await new Promise((r) => setTimeout(r, 220));
      if (failNextCall) {
        failNextCall = false;
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            message: "No pudimos enviar el enlace en este momento.",
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: true }),
      });
    });

    await page.goto(`${BASE_ACCOUNTS}/login?next=%2Fapp%2Fpremier-league`, {
      waitUntil: "networkidle",
    });
    await page.locator("#pl-login-email").fill("ana@ejemplo.mx");
    const submitBtn = page.locator("form.pl-auth-form button[type='submit']");

    await submitBtn.click();
    await page.locator("#pl-login-error").waitFor({ state: "visible" });
    const sendFailureError = (await page.locator("#pl-login-error").textContent())?.trim();

    const clickPromise = submitBtn.click();
    await page.waitForTimeout(60);
    const busyState = {
      ariaBusy: await submitBtn.getAttribute("aria-busy"),
      text: (await submitBtn.textContent())?.trim(),
      disabled: await submitBtn.isDisabled(),
      sendFailureError,
    };
    await clickPromise;

    await page.locator("h1", { hasText: "Revisa tu correo" }).waitFor({ state: "visible" });
    const sentEmailStrong = (await page.locator(".pl-auth-sent-email").textContent())?.trim();
    await page.screenshot({
      path: path.join(OUT_DIR, "login-sent-1440x900-dark.png"),
    });
    await setTheme(page, "light");
    await page.screenshot({
      path: path.join(OUT_DIR, "login-sent-1440x900-light.png"),
    });
    await setTheme(page, "dark");

    const sentAxe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    if (sentAxe.violations.length > 0) {
      throw new Error(`Sent state Axe violations: ${JSON.stringify(sentAxe.violations)}`);
    }

    const resendBtn = page.locator(".pl-auth-sent-actions button").first();
    await resendBtn.click();
    await page.waitForFunction(
      () => {
        const btn = document.querySelector(".pl-auth-sent-actions button");
        return Boolean(
          btn && btn.hasAttribute("disabled") && /Reenviar \(\d+ s\)/.test(btn.textContent || ""),
        );
      },
      null,
      { timeout: 5000 },
    );
    const cooldownText = (await resendBtn.textContent())?.trim();
    const cooldownDisabled = await resendBtn.isDisabled();

    const changeEmailBtn = page.locator(".pl-auth-sent-actions button", {
      hasText: "Usar otro correo",
    });
    await changeEmailBtn.click();
    await page.locator("h1", { hasText: "Entra a PitchLab" }).waitFor({ state: "visible" });

    report.flows.magicLink = {
      calls: magicLinkCalls,
      busyState,
      sentEmailStrong,
      cooldownText,
      cooldownDisabled,
    };

    await ctx.close();
  }

  console.log("VERIFY_LOGIN_OK");
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
