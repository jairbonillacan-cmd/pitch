import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  SIGNUP_CONSENT_VERSION,
  applyMigrations,
  completeSignup,
  users,
  type Db,
} from "@pitchlab/db";
import { POST as postBillingCheckout } from "../app/api/billing/checkout/route";
import { GET as getTipsterPayoutsCron } from "../app/api/cron/tipster-payouts/route";
import { POST as postTipsterConnect } from "../app/api/tipster/connect/route";
import { POST as postStripeWebhook } from "../app/api/webhooks/stripe/route";
import { resetScrapingVelocityForTests } from "../src/server/api-guards";
import { resetAuthForTests, type PitchLabAuth } from "../src/server/auth";
import {
  getTransferBankConfig,
  paymentMode,
} from "../src/server/billing/payment-mode";
import { resetRateLimitsForTests } from "../src/server/request-security";
import { setSessionDbForTests } from "../src/server/session-user";

const ENV_KEYS = [
  "PITCHLAB_PAYMENTS_MODE",
  "STRIPE_SECRET_KEY",
  "STRIPE_PRICE_MONTHLY",
  "STRIPE_PRICE_ANNUAL",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_CONNECT_WEBHOOK_SECRET",
  "PITCHLAB_TRANSFER_BANK",
  "PITCHLAB_TRANSFER_BENEFICIARY",
  "PITCHLAB_TRANSFER_CLABE",
  "PITCHLAB_TRANSFER_INSTRUCTIONS",
  "CRON_SECRET",
  "DATABASE_URL",
  "BETTER_AUTH_URL",
] as const;

const savedEnv: Record<string, string | undefined> = {};
for (const key of ENV_KEYS) {
  savedEnv[key] = process.env[key];
}

let pgClient: PGlite;
let testDb: Db;

beforeAll(async () => {
  pgClient = new PGlite();
  await applyMigrations((sqlText) => pgClient.exec(sqlText));
  testDb = drizzle(pgClient) as unknown as Db;

  const [memberRow] = await testDb
    .insert(users)
    .values({
      authUserId: "auth_pm_member",
      email: "pm.member@example.com",
      displayName: "Socio Pago",
      handle: "socio_pago",
      isAdult: true,
    })
    .returning({ id: users.id });

  await completeSignup(testDb, {
    userId: memberRow!.id,
    displayName: "Socio Pago",
    handle: "socio_pago",
    birthDate: "1992-05-10",
    termsVersion: SIGNUP_CONSENT_VERSION,
    analyticsConsent: false,
    marketingConsent: false,
    referralCode: null,
    trial: null,
    now: new Date("2026-11-12T12:00:00Z"),
  });
}, 60_000);

afterEach(async () => {
  setSessionDbForTests(null);
  resetAuthForTests();
  resetRateLimitsForTests();
  resetScrapingVelocityForTests();
  await pgClient.exec("TRUNCATE TABLE security_rate_buckets, security_abuse_events");
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
});

afterAll(async () => {
  await pgClient?.close();
});

function enableMockMemberAuth(): void {
  process.env.DATABASE_URL = "postgresql://localhost/test";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  setSessionDbForTests(testDb);
  resetAuthForTests({
    api: {
      getSession: async ({ headers }: { headers: Headers }) =>
        headers.get("cookie") === "session=valid"
          ? {
              user: {
                id: "auth_pm_member",
                email: "pm.member@example.com",
                name: "Socio Pago",
                emailVerified: true,
              },
            }
          : null,
    },
  } as unknown as PitchLabAuth);
}

describe("Bloque 1 · paymentMode y apagado limpio de Stripe", () => {
  it("devuelve transfer por defecto aun si existen llaves STRIPE_* sin PITCHLAB_PAYMENTS_MODE=stripe", () => {
    const fullStripeEnv = {
      STRIPE_SECRET_KEY: "sk_test_123",
      STRIPE_PRICE_MONTHLY: "price_m",
      STRIPE_PRICE_ANNUAL: "price_a",
    } as unknown as NodeJS.ProcessEnv;

    expect(paymentMode({} as NodeJS.ProcessEnv)).toBe("transfer");
    expect(paymentMode(fullStripeEnv)).toBe("transfer");
    expect(
      paymentMode({ ...fullStripeEnv, PITCHLAB_PAYMENTS_MODE: "transfer" }),
    ).toBe("transfer");
    expect(
      paymentMode({
        PITCHLAB_PAYMENTS_MODE: "stripe",
        STRIPE_SECRET_KEY: "sk_test_123",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe("transfer");
    expect(
      paymentMode({ ...fullStripeEnv, PITCHLAB_PAYMENTS_MODE: "stripe" }),
    ).toBe("stripe");
  });

  it("valida configuración bancaria SPEI y enmascara CLABE sin exponer errores", () => {
    expect(getTransferBankConfig({} as NodeJS.ProcessEnv)).toEqual({
      configured: false,
      bank: null,
      beneficiary: null,
      clabe: null,
      clabeMasked: null,
      instructions: null,
    });

    expect(
      getTransferBankConfig({
        PITCHLAB_TRANSFER_BANK: "NU México",
        PITCHLAB_TRANSFER_BENEFICIARY: "PitchLab Demo SA",
        PITCHLAB_TRANSFER_CLABE: "6381 8001 0123 4567 89",
        PITCHLAB_TRANSFER_INSTRUCTIONS: "Usa tu referencia exacta",
      } as unknown as NodeJS.ProcessEnv),
    ).toEqual({
      configured: true,
      bank: "NU México",
      beneficiary: "PitchLab Demo SA",
      clabe: "638180010123456789",
      clabeMasked: "•••• 6789",
      instructions: "Usa tu referencia exacta",
    });

    expect(
      getTransferBankConfig({
        PITCHLAB_TRANSFER_BANK: "BBVA",
        PITCHLAB_TRANSFER_BENEFICIARY: "PitchLab",
        PITCHLAB_TRANSFER_CLABE: "12345",
      } as unknown as NodeJS.ProcessEnv).configured,
    ).toBe(false);
  });

  it("POST /api/billing/checkout exige sesión (401) y responde 503 en modo transfer aun con STRIPE_* presentes", async () => {
    enableMockMemberAuth();
    process.env.PITCHLAB_PAYMENTS_MODE = "transfer";
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_PRICE_MONTHLY = "price_m";
    process.env.STRIPE_PRICE_ANNUAL = "price_a";

    const unauthReq = new Request("http://localhost:3000/api/billing/checkout", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({ interval: "monthly" }),
    });
    const unauthRes = await postBillingCheckout(unauthReq);
    expect(unauthRes.status).toBe(401);

    const authReq = new Request("http://localhost:3000/api/billing/checkout", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "content-type": "application/json",
        cookie: "session=valid",
      },
      body: JSON.stringify({ interval: "monthly" }),
    });
    const res = await postBillingCheckout(authReq);
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const json = (await res.json()) as { error?: string };
    expect(json.error).toContain("SPEI");
  });

  it("POST /api/tipster/connect exige sesión (401) y responde 409 en modo transfer", async () => {
    enableMockMemberAuth();
    process.env.PITCHLAB_PAYMENTS_MODE = "transfer";

    const unauthReq = new Request("http://localhost:3000/api/tipster/connect", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    });
    const unauthRes = await postTipsterConnect(unauthReq);
    expect(unauthRes.status).toBe(401);

    const authReq = new Request("http://localhost:3000/api/tipster/connect", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        cookie: "session=valid",
      },
    });
    const res = await postTipsterConnect(authReq);
    expect(res.status).toBe(409);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("POST /api/webhooks/stripe rechaza payloads > 256 KB con 413 y sanitiza StripeSignatureError", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_123456";
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.DATABASE_URL = "postgresql://localhost/test";

    const oversizedPayload = "a".repeat(256 * 1024 + 16);
    const tooBigRes = await postStripeWebhook(
      new Request("http://localhost:3000/api/webhooks/stripe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: oversizedPayload,
      }),
    );
    expect(tooBigRes.status).toBe(413);
    expect(tooBigRes.headers.get("cache-control")).toBe("no-store");

    const badSigRes = await postStripeWebhook(
      new Request("http://localhost:3000/api/webhooks/stripe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "evt_1", type: "ping", created: 1, data: { object: {} } }),
      }),
    );
    expect(badSigRes.status).toBe(400);
    expect(badSigRes.headers.get("cache-control")).toBe("no-store");
    const badSigJson = (await badSigRes.json()) as { error?: string };
    expect(badSigJson.error).toBe("Firma inválida");
  });

  it("GET /api/cron/tipster-payouts protege con CRON_SECRET y no exige Stripe en modo transfer", async () => {
    process.env.CRON_SECRET = "cron_secret_test";
    delete process.env.DATABASE_URL;

    const unauthorized = await getTipsterPayoutsCron(
      new Request("http://localhost:3000/api/cron/tipster-payouts"),
    );
    expect(unauthorized.status).toBe(401);

    const noDb = await getTipsterPayoutsCron(
      new Request("http://localhost:3000/api/cron/tipster-payouts", {
        headers: { authorization: "Bearer cron_secret_test" },
      }),
    );
    expect(noDb.status).toBe(503);
    const json = (await noDb.json()) as { error?: string };
    expect(json.error).toBe("Base de datos no configurada");
  });
});
