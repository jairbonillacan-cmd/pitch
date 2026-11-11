import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyMigrations,
  handleInvoicePaid,
  handleInvoiceRefunded,
  setConnectAccount,
  setConnectPayoutsEnabled,
  tipstarAttributions,
  tipstarCommissionLedger,
  tipstarProfiles,
  users,
  type Db,
} from "@pitchlab/db";
import {
  createExpressAccount,
  createOnboardingLink,
  runTipstarPayouts,
  stripeTransferCreator,
} from "../src/server/billing/connect.js";
import { processStripeEvent } from "../src/server/billing/stripe-webhook.js";

const DAY = 86_400_000;
const paidAt = new Date("2026-11-11T12:00:00Z");
let db: Db;
let tipId: string;

async function fanPays(email: string, invoice: string) {
  const [fan] = await db.insert(users).values({ email }).returning();
  await db.insert(tipstarAttributions).values({ tipstarUserId: tipId, referredUserId: fan!.id, promoCodeUsed: "TIP5", status: "trial_5d" });
  await handleInvoicePaid(db, { userId: fan!.id, stripeInvoiceId: invoice, grossCentavos: 29900, vatCentavos: 4124, gatewayFeeCentavos: 1500, paidAt });
}

beforeEach(async () => {
  const client = new PGlite();
  await applyMigrations((sql) => client.exec(sql));
  db = drizzle(client) as unknown as Db;
  const [tip] = await db.insert(users).values({ email: "tip@example.com" }).returning();
  tipId = tip!.id;
  await db.insert(tipstarProfiles).values({ userId: tipId, handle: "tip", displayName: "Tip", specialty: "NFL", promoCode: "TIP5", defaultWeeklySlug: "tip-sem" });
});

describe("pagos a tipstars con Stripe Connect", () => {
  it("libera a los 14 días y solo transfiere a cuentas listas, una vez por asiento", async () => {
    await fanPays("a@example.com", "in_a");
    await fanPays("b@example.com", "in_b");
    await handleInvoiceRefunded(db, "in_b");

    const calls: Array<{ destination: string; amountCentavos: number }> = [];
    const createTransfer = async (t: { ledgerId: string; destination: string; amountCentavos: number }) => {
      calls.push({ destination: t.destination, amountCentavos: t.amountCentavos });
      return `tr_${t.ledgerId.slice(0, 8)}`;
    };

    // Día 10: todavía en ventana anti-contracargo.
    expect(await runTipstarPayouts(db, { createTransfer, now: new Date(paidAt.getTime() + 10 * DAY) })).toMatchObject({ promoted: 0, paid: 0 });

    // Día 15: se libera, pero la cuenta aún no está lista para cobrar.
    const day15 = new Date(paidAt.getTime() + 15 * DAY);
    expect(await runTipstarPayouts(db, { createTransfer, now: day15 })).toMatchObject({ promoted: 1, paid: 0 });
    expect(calls).toHaveLength(0);

    await setConnectAccount(db, tipId, "acct_tip");
    await setConnectPayoutsEnabled(db, "acct_tip", true);
    expect(await runTipstarPayouts(db, { createTransfer, now: day15 })).toMatchObject({ paid: 1, paidCentavos: 6069, failed: [] });
    expect(calls).toEqual([{ destination: "acct_tip", amountCentavos: 6069 }]);

    // Otra corrida no vuelve a pagar.
    expect(await runTipstarPayouts(db, { createTransfer, now: day15 })).toMatchObject({ paid: 0 });
    const ledger = await db.select().from(tipstarCommissionLedger);
    expect(ledger.map((l) => l.status).sort()).toEqual(["paid_out", "reversed_refund"]);
  });

  it("un error de Stripe no detiene la corrida y se reintenta después", async () => {
    await fanPays("c@example.com", "in_c");
    await setConnectAccount(db, tipId, "acct_tip");
    await setConnectPayoutsEnabled(db, "acct_tip", true);
    const now = new Date(paidAt.getTime() + 15 * DAY);
    const failing = await runTipstarPayouts(db, { now, createTransfer: async () => { throw new Error("saldo insuficiente"); } });
    expect(failing.failed).toHaveLength(1);
    const retry = await runTipstarPayouts(db, { now, createTransfer: async () => "tr_ok" });
    expect(retry.paid).toBe(1);
  });

  it("account.updated habilita los pagos de la cuenta conectada", async () => {
    await setConnectAccount(db, tipId, "acct_x");
    const deps = { now: () => paidAt, getInvoiceFeeCentavos: async () => 0 };
    const res = await processStripeEvent(db, { id: "evt_acc", type: "account.updated", created: 0, data: { object: { id: "acct_x", payouts_enabled: true } } }, deps);
    expect(res).toBe("cuenta conectada: pagos habilitados");
    const [p] = await db.select().from(tipstarProfiles);
    expect(p).toMatchObject({ connectPayoutsEnabled: true, payoutMethod: "stripe_connect" });
  });
});

describe("cliente de Stripe Connect", () => {
  it("crea la cuenta Express MX, el enlace de alta y transfiere con clave de idempotencia", async () => {
    const requests: Array<{ url: string; body: URLSearchParams; idem: string | null }> = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      requests.push({ url, body: new URLSearchParams(String(init?.body)), idem: headers["idempotency-key"] ?? null });
      const id = url.endsWith("/accounts") ? "acct_1" : url.endsWith("/transfers") ? "tr_1" : undefined;
      return new Response(JSON.stringify({ id, url: url.endsWith("/account_links") ? "https://connect.stripe.com/setup/x" : undefined }), { status: 200 });
    }) as unknown as typeof fetch;

    expect(await createExpressAccount("sk", { email: "t@example.com", tipstarUserId: "u1", handle: "tip" }, fakeFetch)).toBe("acct_1");
    expect(requests[0]!.body.get("country")).toBe("MX");
    expect(requests[0]!.body.get("capabilities[transfers][requested]")).toBe("true");
    expect(requests[0]!.idem).toBe("connect-account:u1");

    expect(await createOnboardingLink("sk", { accountId: "acct_1", baseUrl: "https://pitchlab.mx" }, fakeFetch)).toBe("https://connect.stripe.com/setup/x");
    expect(requests[1]!.body.get("return_url")).toBe("https://pitchlab.mx/app/tipstar?connect=listo");

    expect(await stripeTransferCreator("sk", fakeFetch)({ ledgerId: "l1", destination: "acct_1", amountCentavos: 6069, stripeInvoiceId: "in_1" })).toBe("tr_1");
    expect(requests[2]!.body.get("currency")).toBe("mxn");
    expect(requests[2]!.idem).toBe("tipstar-payout:l1");
  });
});
