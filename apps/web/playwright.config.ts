import { randomBytes } from "node:crypto";
import os from "node:os";
import { defineConfig } from "@playwright/test";

const betaCookieSecret = process.env.BETA_COOKIE_SECRET ?? randomBytes(32).toString("hex");

function resolvePlaywrightWorkers(): number {
  const envRaw = process.env.PW_WORKERS?.trim();
  if (envRaw && /^\d+$/.test(envRaw)) {
    const parsed = Number.parseInt(envRaw, 10);
    return Math.min(6, Math.max(1, parsed));
  }
  if (process.env.CI) {
    return 1;
  }
  const threads =
    typeof os.availableParallelism === "function"
      ? os.availableParallelism()
      : os.cpus().length;
  const memGb = Math.round(os.totalmem() / 1024 ** 3);
  if (threads >= 8 && memGb >= 16) {
    return 3;
  }
  if (threads >= 4 && memGb >= 8) {
    return 2;
  }
  return 1;
}

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: resolvePlaywrightWorkers(),
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
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
    command: "pnpm exec next start -H 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      PREVIEW_ACCESS_CODE: "2026",
      BETA_COOKIE_SECRET: betaCookieSecret,
      PITCHLAB_PREVIEW_TOOLS: "1",
      PITCHLAB_LOCAL_MEMORY_RATE_LIMIT: "1",
      PITCHLAB_TRANSFER_BANK: "Banco Ejemplo Test",
      PITCHLAB_TRANSFER_BENEFICIARY: "PitchLab Demo Test",
      PITCHLAB_TRANSFER_CLABE: "000000000000000000",
    },
  },
});
