import { afterEach, describe, expect, it } from "vitest";
import { POST as postBillingCheckout } from "../app/api/billing/checkout/route";
import { GET as getTipsterPayoutsCron } from "../app/api/cron/tipster-payouts/route";
import { POST as postTipsterConnect } from "../app/api/tipster/connect/route";
import {
  getTransferBankConfig,
  paymentMode,
} from "../src/server/billing/payment-mode";

const ENV_KEYS = [
  "PITCHLAB_PAYMENTS_MODE",
  "STRIPE_SECRET_KEY",
  "STRIPE_PRICE_MONTHLY",
  "STRIPE_PRICE_ANNUAL",
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

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
});

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

  it("POST /api/billing/checkout responde 503 en modo transfer aun con STRIPE_* presentes", async () => {
    process.env.PITCHLAB_PAYMENTS_MODE = "transfer";
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_PRICE_MONTHLY = "price_m";
    process.env.STRIPE_PRICE_ANNUAL = "price_a";
    process.env.BETTER_AUTH_URL = "http://localhost:3000";

    const req = new Request("http://localhost:3000/api/billing/checkout", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({ interval: "monthly" }),
    });
    const res = await postBillingCheckout(req);
    expect(res.status).toBe(503);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toContain("SPEI");
  });

  it("POST /api/tipster/connect responde 409 en modo transfer", async () => {
    process.env.PITCHLAB_PAYMENTS_MODE = "transfer";
    process.env.BETTER_AUTH_URL = "http://localhost:3000";

    const req = new Request("http://localhost:3000/api/tipster/connect", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    });
    const res = await postTipsterConnect(req);
    expect(res.status).toBe(409);
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
