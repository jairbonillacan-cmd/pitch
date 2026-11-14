import { test as base, expect } from "@playwright/test";

/**
 * Las páginas del Club llegan del servidor con todo el HTML visible, pero sus botones solo
 * responden cuando React termina de hidratar. Con la página pesada, un clic temprano se
 * pierde (p. ej. «Copiar» del enlace de invitación nunca pasaba a «Copiado»). Este `page`
 * espera la marca `<html data-pl-hydrated="1">` del PlatformProvider después de cada
 * navegación. Las páginas sin el proveedor no esperan más de lo necesario.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    const goto = page.goto.bind(page);
    page.goto = (async (url: string, options?: Parameters<typeof goto>[1]) => {
      const res = await goto(url, options);
      // Solo el Club (`/app…`) monta el PlatformProvider; las páginas públicas no llevan la
      // marca y no deben esperar (antes cada navegación pública perdía 30 s).
      const path = new URL(page.url()).pathname;
      if (path === "/app" || path.startsWith("/app/")) {
        await page
          .waitForFunction(() => document.documentElement.dataset.plHydrated === "1", null, { timeout: 30_000 })
          .catch(() => undefined);
      }
      return res;
    }) as typeof page.goto;
    await use(page);
  },
});

export { expect };
