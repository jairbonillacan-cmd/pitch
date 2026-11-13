import { randomBytes } from "node:crypto";
import { defineConfig } from "@playwright/test";

// `next start` corre en modo producción, que rechaza secretos con forma de ejemplo.
const betaCookieSecret = process.env.BETA_COOKIE_SECRET ?? randomBytes(32).toString("hex");

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    // Sin este permiso, Chromium rechaza a veces navigator.clipboard.writeText cuando la
    // página no tiene el foco (pasa bajo carga) y las pruebas de «Copiado» fallan al azar.
    permissions: ["clipboard-read", "clipboard-write"],
  },
  projects: [
    {
      name: "desktop",
      use: {
        browserName: "chromium",
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: {
    command: "pnpm exec next start --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      PREVIEW_ACCESS_CODE: "2026",
      BETA_COOKIE_SECRET: betaCookieSecret,
    },
  },
});
