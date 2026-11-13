import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  accessUntil,
  applyMigrations,
  authSession,
  claimPayableTransfers,
  completeSignup,
  eq,
  grantDays,
  handleInvoicePaid,
  handleInvoiceRefunded,
  markCommissionPaid,
  PAYOUT_CLAIM_TIMEOUT_MS,
  referralGrants,
  setConnectAccount,
  setConnectPayoutsEnabled,
  SIGNUP_CONSENT_VERSION,
  subscriptions,
  tipstarAttributions,
  tipstarCommissionLedger,
  tipstarProfiles,
  users,
  type Db,
} from "@pitchlab/db";
import { isPickUnlocked } from "@pitchlab/ui";
import { POST as postBetaUnlock } from "../app/api/beta/unlock/route";
import { POST as postJournal } from "../app/api/me/journal/route";
import { GET as getSignup, POST as postSignup } from "../app/api/me/signup/route";
import { POST as postWatchlist } from "../app/api/me/watchlist/route";
import { createAuth, getAuth, resetAuthForTests } from "../src/server/auth";
import { isBetaPinEnabled, resetMemoryRateLimitForTests } from "../src/server/beta-auth";
import { runTipstarPayouts, stripeTransferFinder } from "../src/server/billing/connect";
import { processStripeEvent, type WebhookDeps } from "../src/server/billing/stripe-webhook";
import {
  buildServerRawPlatformDataset,
  loadGameDetail,
  loadPublicPlatformState,
} from "../src/server/platform-data";
import {
  loadComoFuncionaViewProps,
  loadLandingViewProps,
  loadLoginPreviewData,
  loadParlaysViewProps,
} from "../src/server/public-site-data";
import { requireActivePaseMember, requireMember, setSessionDbForTests } from "../src/server/session-user";
import { parseSignupBody } from "../src/server/signup";

const DAY_MS = 86_400_000;
const BASE_NOW = new Date("2026-11-12T12:00:00Z");

async function freshDb(): Promise<Db> {
  const client = new PGlite();
  await applyMigrations((sql) => client.exec(sql));
  return drizzle(client) as unknown as Db;
}

describe("Ola 1 · Cero-Fuga SSR/RSC (SEC-01, SEC-02, SEC-03)", () => {
  it("SEC-01: bloquea desbloqueo arbitrario de picks pagados (__p1..__p5) en /p/[pickId] y solo resuelve slugs públicos autorizados", async () => {
    const raw = buildServerRawPlatformDataset();
    const upcomingGame = raw.games.find(
      (g) =>
        g.status !== "FT" &&
        g.picks.some((p) => !isPickUnlocked(p, g.status, "visitor") && p.id.includes("__p")),
    );
    expect(upcomingGame).toBeTruthy();
    const lockedInternalPick = upcomingGame!.picks.find(
      (p) => !isPickUnlocked(p, upcomingGame!.status, "visitor") && p.id.includes("__p"),
    )!;

    const attackState = await loadPublicPlatformState(lockedInternalPick.id);
    expect(attackState.publicPickResolved).toBe(false);
    expect(attackState.dataset.games).toEqual([]);

    const allowedState = await loadPublicPlatformState("carlos-sem");
    expect(allowedState.publicPickResolved).toBe(true);
    expect(allowedState.dataset.games).toHaveLength(1);
    expect(allowedState.dataset.games[0]!.x12).toEqual([0, 0, 0]);
    const unlockedCount = allowedState.dataset.games[0]!.picks.filter((p) =>
      isPickUnlocked(p, allowedState.dataset.games[0]!.status, "visitor"),
    ).length;
    expect(unlockedCount).toBe(1);
  });

  it("SEC-02: loadGameDetail nunca entrega mercados ni factores de partidos próximos a visitantes", async () => {
    const raw = buildServerRawPlatformDataset();
    const upcoming = raw.games.find((g) => g.status !== "FT" && g.markets.length > 0)!;
    expect(upcoming).toBeTruthy();

    const visitorDetail = await loadGameDetail(upcoming.id);
    expect(visitorDetail).not.toBeNull();
    expect(visitorDetail!.markets).toEqual([]);
    expect(visitorDetail!.factors).toEqual([]);
  });

  it("SEC-03: páginas públicas usan el dataset redactado y nunca filtran parlays en vivo de socios", async () => {
    const [landing, comoFunciona, parlays, loginPreview] = await Promise.all([
      loadLandingViewProps(),
      loadComoFuncionaViewProps(),
      loadParlaysViewProps(),
      loadLoginPreviewData(),
    ]);
    expect(landing.parlayDemo.isExample).toBe(true);
    expect(parlays.parlayDemo.isExample).toBe(true);
    expect(comoFunciona.heroCards.length).toBeGreaterThan(0);
    expect(loginPreview.primaryCard).not.toBeNull();
  });
});

describe("Ola 1 · Autenticación, +18, consentimiento y PIN de beta (SEC-04, SEC-05, SEC-09)", () => {
  const savedEnv: Record<string, string | undefined> = {};
  const envKeys = [
    "NODE_ENV",
    "VERCEL",
    "DATABASE_URL",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "RESEND_API_KEY",
    "PITCHLAB_BETA_CODE",
    "PREVIEW_ACCESS_CODE",
    "PITCHLAB_COOKIE_SECRET",
    "BETA_COOKIE_SECRET",
    "PITCHLAB_ALLOW_BETA_PIN_IN_PROD",
  ];

  beforeEach(() => {
    for (const key of envKeys) savedEnv[key] = process.env[key];
    resetMemoryRateLimitForTests();
    resetAuthForTests();
    setSessionDbForTests(null);
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
    resetAuthForTests();
    setSessionDbForTests(null);
  });

  async function signInStep1(db: Db, email: string) {
    let magicUrl = "";
    const auth = createAuth({
      db,
      secret: "secreto-de-prueba-ola1-de-al-menos-32-caracteres!!",
      baseURL: "http://localhost:3000",
      sendEmail: async (_to, _subject, html) => {
        magicUrl = html.match(/href="([^"]+)"/)![1]!.replace(/&amp;/g, "&");
      },
    });
    await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-in/magic-link", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ email, callbackURL: "/app" }),
      }),
    );
    const verify = await auth.handler(new Request(magicUrl, { headers: { origin: "http://localhost:3000" } }));
    const rawCookie = verify.headers.getSetCookie().join("; ");
    const cookieHeader = rawCookie
      .split(";")
      .map((part) => part.trim())
      .filter((part) => part.startsWith("better-auth."))
      .join("; ");
    return { auth, cookieHeader };
  }

  it("SEC-04: bloquea sesiones de paso 1 en endpoints de socio, revoca sesión a menores de 18 y exige Pase vigente para escrituras", async () => {
    const db = await freshDb();
    process.env.DATABASE_URL = "postgresql://local/test";
    process.env.BETTER_AUTH_SECRET = "secreto-de-prueba-ola1-de-al-menos-32-caracteres!!";
    const { auth, cookieHeader } = await signInStep1(db, "paso1@example.com");
    resetAuthForTests(auth);
    setSessionDbForTests(db);

    // 1. Paso 1 puede consultar /api/me/signup, pero NO pasar requireMember ni escribir bitácora.
    const signupStatus = await getSignup(
      new Request("http://localhost:3000/api/me/signup", { headers: { cookie: cookieHeader } }),
    );
    expect(signupStatus.status).toBe(200);
    expect(await signupStatus.json()).toMatchObject({ completed: false });

    const step1Blocked = await requireMember(
      new Request("http://localhost:3000/api/me/profile", { headers: { cookie: cookieHeader } }),
    );
    expect("error" in step1Blocked).toBe(true);
    if ("error" in step1Blocked) {
      expect(step1Blocked.error.status).toBe(403);
      expect(await step1Blocked.error.json()).toEqual({ error: "registro_incompleto" });
    }

    // 2. Versión de términos manipulada se rechaza.
    expect(
      parseSignupBody({
        displayName: "Socio Uno",
        handle: "socio_uno",
        birthDate: "1995-04-10",
        consents: { terms: true, analytics: false, marketing: false, version: "1999-01-01" },
      }),
    ).toBeNull();

    // 3. Menor de 18 años recibe 403 menor_de_edad y su sesión se destruye en auth_session.
    const minorRes = await postSignup(
      new Request("http://localhost:3000/api/me/signup", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000", cookie: cookieHeader },
        body: JSON.stringify({
          displayName: "Menor Prueba",
          handle: "menor_prueba",
          birthDate: "2014-06-01",
          consents: { terms: true, analytics: false, marketing: false, version: SIGNUP_CONSENT_VERSION },
        }),
      }),
    );
    expect(minorRes.status).toBe(403);
    expect(await minorRes.json()).toEqual({ error: "menor_de_edad" });
    expect(await db.select().from(authSession)).toHaveLength(0);
    expect(minorRes.headers.get("set-cookie") ?? "").toContain("Max-Age=0");

    // 4. Socio adulto con paso 2 completo pero SIN Pase Total vigente recibe 403 pase_requerido en escrituras.
    const adult = await signInStep1(db, "adulto.sin.pase@example.com");
    resetAuthForTests(adult.auth);
    const [adultRow] = await db.select().from(users).where(eq(users.email, "adulto.sin.pase@example.com"));
    const completed = await completeSignup(db, {
      userId: adultRow!.id,
      displayName: "Adulto Sin Pase",
      handle: "adulto_sin_pase",
      birthDate: "1990-02-15",
      termsVersion: SIGNUP_CONSENT_VERSION,
      analyticsConsent: false,
      marketingConsent: false,
      referralCode: null,
      trial: null,
      now: BASE_NOW,
    });
    expect(completed.ok).toBe(true);

    const paseBlocked = await requireActivePaseMember(
      new Request("http://localhost:3000/api/me/journal", { headers: { cookie: adult.cookieHeader } }),
    );
    expect("error" in paseBlocked).toBe(true);
    if ("error" in paseBlocked) {
      expect(paseBlocked.error.status).toBe(403);
    }

    const journalBlocked = await postJournal(
      new Request("http://localhost:3000/api/me/journal", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000", cookie: adult.cookieHeader },
        body: JSON.stringify({ gameId: "g1", pickId: "p1", units: 1, userDecimal: 2.0, fairDecimal: 1.9 }),
      }),
    );
    expect(journalBlocked.status).toBe(403);
    expect(await journalBlocked.json()).toEqual({ error: "pase_requerido" });

    const watchlistBlocked = await postWatchlist(
      new Request("http://localhost:3000/api/me/watchlist", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000", cookie: adult.cookieHeader },
        body: JSON.stringify({ gameId: "g1", watched: true }),
      }),
    );
    expect(watchlistBlocked.status).toBe(403);
    expect(await watchlistBlocked.json()).toEqual({ error: "pase_requerido" });

    // Con concesión vigente, pasa requireActivePaseMember y puede guardar vigilancia.
    await grantDays(db, {
      userId: adultRow!.id,
      sourceKind: "admin_grant",
      days: 7,
      idempotencyKey: "ola1-test-pass",
      now: new Date(),
    });
    const watchlistOk = await postWatchlist(
      new Request("http://localhost:3000/api/me/watchlist", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000", cookie: adult.cookieHeader },
        body: JSON.stringify({ gameId: "nfl-game-1", watched: true }),
      }),
    );
    expect(watchlistOk.status).toBe(200);
    expect(await watchlistOk.json()).toEqual({ gameIds: ["nfl-game-1"] });
  }, 60_000);

  it("SEC-05: apaga el PIN de beta en producción con cuentas activas o secretos de ejemplo y responde 403 en /api/beta/unlock", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://neon.example/pitchlab";
    process.env.BETTER_AUTH_SECRET = "secreto-real-de-produccion-con-mas-de-32-chars!!";
    process.env.PITCHLAB_BETA_CODE = "2026";
    process.env.PITCHLAB_COOKIE_SECRET = "otro-secreto-real-de-32-caracteres-minimos!!";
    delete process.env.PITCHLAB_ALLOW_BETA_PIN_IN_PROD;

    expect(isBetaPinEnabled()).toBe(false);

    const unlockRes = await postBetaUnlock(
      new NextRequest("https://pitchlab.mx/api/beta/unlock", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://pitchlab.mx" },
        body: JSON.stringify({ code: "2026" }),
      }),
    );
    expect(unlockRes.status).toBe(403);

    // Incluso con bandera explícita, un secreto conocido de ejemplo sigue bloqueado.
    process.env.PITCHLAB_ALLOW_BETA_PIN_IN_PROD = "1";
    process.env.PITCHLAB_COOKIE_SECRET = "reemplaza-con-32-caracteres-aleatorios-minimo";
    expect(isBetaPinEnabled()).toBe(false);
  });

  it("SEC-09: getAuth falla cerrado en producción si falta BETTER_AUTH_URL, RESEND_API_KEY o el secreto es débil", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://neon.example/pitchlab";

    // Secreto corto
    process.env.BETTER_AUTH_SECRET = "corto";
    process.env.BETTER_AUTH_URL = "https://pitchlab.mx";
    process.env.RESEND_API_KEY = "re_test_key";
    resetAuthForTests();
    expect(() => getAuth()).toThrow(/BETTER_AUTH_SECRET/);

    // Falta BETTER_AUTH_URL (antes caía silenciosamente a localhost + consoleSender)
    process.env.BETTER_AUTH_SECRET = "secreto-real-de-produccion-con-mas-de-32-chars!!";
    delete process.env.BETTER_AUTH_URL;
    delete process.env.RESEND_API_KEY;
    resetAuthForTests();
    expect(() => getAuth()).toThrow(/BETTER_AUTH_URL/);

    // URL remota sin RESEND_API_KEY
    process.env.BETTER_AUTH_URL = "https://pitchlab.mx";
    resetAuthForTests();
    expect(() => getAuth()).toThrow(/RESEND_API_KEY/);
  });
});

describe("Ola 1 · Atomicidad de pagos Connect y webhooks de Stripe (SEC-06)", () => {
  it("reclama asientos en processing_payout protegiendo contra carreras con charge.refunded y reconcilia >24h sin doble transferencia", async () => {
    const db = await freshDb();
    const [tip] = await db.insert(users).values({ email: "tipstar@example.com" }).returning();
    const [fan] = await db.insert(users).values({ email: "fan@example.com" }).returning();
    await db.insert(tipstarProfiles).values({
      userId: tip!.id,
      handle: "tip_ola1",
      displayName: "Tip Ola 1",
      specialty: "NFL",
      promoCode: "TIPOLA1",
      defaultWeeklySlug: "tip-ola1-sem",
      payoutMethod: "stripe_connect",
      stripeConnectAccountId: "acct_ola1",
      connectPayoutsEnabled: true,
    });
    await setConnectAccount(db, tip!.id, "acct_ola1");
    await setConnectPayoutsEnabled(db, "acct_ola1", true);
    await db.insert(tipstarAttributions).values({
      tipstarUserId: tip!.id,
      referredUserId: fan!.id,
      promoCodeUsed: "TIPOLA1",
      status: "trial_5d",
    });
    await handleInvoicePaid(db, {
      userId: fan!.id,
      stripeInvoiceId: "in_race_1",
      grossCentavos: 29_900,
      vatCentavos: 4_124,
      gatewayFeeCentavos: 1_500,
      paidAt: BASE_NOW,
    });

    const day15 = new Date(BASE_NOW.getTime() + 15 * DAY_MS);
    await runTipstarPayouts(db, {
      now: day15,
      createTransfer: async () => {
        throw new Error("simular pausa antes de transferir");
      },
    });

    // Reclamo atómico directo simula corrida en vuelo:
    const claimed = await claimPayableTransfers(db, day15);
    expect(claimed).toHaveLength(1);
    const ledgerId = claimed[0]!.ledgerId;

    // 1. Mientras está en processing_payout, otra corrida paralela no lo vuelve a tomar.
    expect(await claimPayableTransfers(db, new Date(day15.getTime() + 60_000))).toHaveLength(0);

    // 2. Si llega charge.refunded a mitad del vuelo a Stripe, NO pisa el asiento reclamado.
    expect(await handleInvoiceRefunded(db, "in_race_1")).toBe(false);

    // 3. Si el proceso hubiera caído tras crear la transferencia en Stripe y reintenta >24h después,
    //    claimPayableTransfers retoma el asiento vencido (>15 min) y findExistingTransfer evita pagar doble.
    const afterCrash = new Date(day15.getTime() + PAYOUT_CLAIM_TIMEOUT_MS + 25 * 3_600_000);
    let createCalls = 0;
    const fakeFetch = (async () =>
      new Response(
        JSON.stringify({
          data: [{ id: "tr_existing_99", reversed: false, metadata: { ledger_id: ledgerId } }],
        }),
        { status: 200 },
      )) as unknown as typeof fetch;

    const recovered = await runTipstarPayouts(db, {
      now: afterCrash,
      findExistingTransfer: stripeTransferFinder("sk_test", fakeFetch),
      createTransfer: async () => {
        createCalls += 1;
        return "tr_duplicate_bug";
      },
    });
    expect(createCalls).toBe(0);
    expect(recovered.paid).toBe(1);
    const [finalRow] = await db.select().from(tipstarCommissionLedger).where(eq(tipstarCommissionLedger.id, ledgerId));
    expect(finalRow!.status).toBe("paid_out");
    expect(finalRow!.stripeTransferId).toBe("tr_existing_99");
    expect(await markCommissionPaid(db, ledgerId, "tr_other", afterCrash)).toBe(false);
  });

  it("evita doble recorte de currentPeriodEnd cuando charge.refunded falla a mitad y Stripe reintenta", async () => {
    const db = await freshDb();
    const [host] = await db.insert(users).values({ email: "host-claw@example.com" }).returning();
    const [friend] = await db.insert(users).values({ email: "friend-claw@example.com" }).returning();
    await db.insert(referralGrants).values({
      referrerUserId: host!.id,
      referredUserId: friend!.id,
      referralCodeUsed: "SOCIO-CLAW",
      status: "trial_started",
    });

    const sec = (d: Date) => Math.floor(d.getTime() / 1000);
    const hostInitialEnd = new Date(BASE_NOW.getTime() + 20 * DAY_MS);
    const friendInitialEnd = new Date(BASE_NOW.getTime() + 30 * DAY_MS);
    let clock = BASE_NOW;

    const baseDeps: WebhookDeps = {
      now: () => clock,
      getInvoiceFeeCentavos: async () => 1500,
      setSubscriptionTrialEnd: async () => {},
    };

    const makeSubEvent = (id: string, userId: string, customer: string, subId: string, end: Date, status = "active") => ({
      id,
      type: "customer.subscription.updated",
      created: 0,
      data: {
        object: {
          id: subId,
          customer,
          status,
          metadata: { user_id: userId },
          items: {
            data: [
              {
                price: { unit_amount: 29_900, recurring: { interval: "month" } },
                current_period_start: sec(BASE_NOW),
                current_period_end: sec(end),
              },
            ],
          },
        },
      },
    });

    await processStripeEvent(db, makeSubEvent("e_sh", host!.id, "cus_h", "sub_h", hostInitialEnd), baseDeps);
    await processStripeEvent(db, makeSubEvent("e_sf", friend!.id, "cus_f", "sub_f", friendInitialEnd), baseDeps);
    await processStripeEvent(
      db,
      {
        id: "e_inv_claw",
        type: "invoice.paid",
        created: 0,
        data: {
          object: {
            id: "in_claw_1",
            customer: "cus_f",
            amount_paid: 20_900,
            status_transitions: { paid_at: sec(BASE_NOW) },
          },
        },
      },
      baseDeps,
    );

    // Ambos quedaron en trialing_card con +15 días aplicados en Stripe (host: +35d, friend: +45d).
    clock = new Date(BASE_NOW.getTime() + 2 * DAY_MS);
    let failSecondSubOnce = true;
    const flakyDeps: WebhookDeps = {
      now: () => clock,
      getInvoiceFeeCentavos: async () => 1500,
      setSubscriptionTrialEnd: async (subId) => {
        if (subId === "sub_f" && failSecondSubOnce) {
          failSecondSubOnce = false;
          throw new Error("Stripe 502 temporal en sub_f");
        }
      },
    };

    const refundEvt = {
      id: "e_refund_retry",
      type: "charge.refunded",
      created: 0,
      data: { object: { id: "ch_claw_1", invoice: "in_claw_1", amount: 20_900, amount_refunded: 20_900 } },
    };

    // Primer intento: sub_h ya se recorrió hacia atrás en Stripe y BD; sub_f lanza error y fuerza reintento.
    await expect(processStripeEvent(db, refundEvt, flakyDeps)).rejects.toThrow("Stripe 502 temporal");

    // Reintento de Stripe del mismo evento: sub_h NO debe volver a restarse otros 15 días.
    const retryMsg = await processStripeEvent(db, refundEvt, flakyDeps);
    expect(retryMsg).toContain("premio del referido revertido");

    const [hostSub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, host!.id));
    const [friendSub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, friend!.id));
    expect(hostSub!.currentPeriodEnd.getTime()).toBe(hostInitialEnd.getTime());
    expect(friendSub!.currentPeriodEnd.getTime()).toBe(friendInitialEnd.getTime());
    expect((await accessUntil(db, host!.id, clock))!.getTime()).toBe(hostInitialEnd.getTime());
    expect((await accessUntil(db, friend!.id, clock))!.getTime()).toBe(friendInitialEnd.getTime());
  });
});
