import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  adminAuditLogs,
  applyMigrations,
  authUser,
  completeSignup,
  eq,
  scheduledEmails,
  SIGNUP_CONSENT_VERSION,
  tipsterAttributions,
  tipsterCommissionLedger,
  users,
  type Db,
} from "@pitchlab/db";
import { createAuth, resetAuthForTests } from "../src/server/auth";
import { setMailerForTests, type OutgoingEmail } from "../src/server/mailer";
import { resetRateLimitsForTests } from "../src/server/request-security";
import { setSessionDbForTests } from "../src/server/session-user";
import { GET as getAdminCoupons, POST as postAdminCoupons } from "../app/api/admin/coupons/route";
import { PATCH as patchAdminCoupon } from "../app/api/admin/coupons/[id]/route";
import { GET as getAdminCouponRedemptions } from "../app/api/admin/coupons/[id]/redemptions/route";
import { POST as postAdminAccessGrant } from "../app/api/admin/access/grant/route";
import { POST as postAdminAccessRevoke } from "../app/api/admin/access/revoke/route";
import { GET as getAdminMembers } from "../app/api/admin/members/route";
import { GET as getAdminTipsterPayouts } from "../app/api/admin/tipster-payouts/route";
import { POST as postAdminMarkPaid } from "../app/api/admin/tipster-payouts/[id]/mark-paid/route";
import { POST as postAdminTipsters } from "../app/api/admin/tipsters/route";
import { GET as getAdminTransfers } from "../app/api/admin/transfers/route";
import { POST as postAdminApproveTransfer } from "../app/api/admin/transfers/[id]/approve/route";
import { POST as postAdminRejectTransfer } from "../app/api/admin/transfers/[id]/reject/route";
import { POST as postBillingCheckout } from "../app/api/billing/checkout/route";
import { GET as getCronTipsterPayouts } from "../app/api/cron/tipster-payouts/route";
import { GET as getCouponPreview } from "../app/api/me/coupons/preview/route";
import { POST as postDeletionRequest } from "../app/api/me/deletion-request/route";
import { GET as getExport } from "../app/api/me/export/route";
import { GET as getPlan } from "../app/api/me/plan/route";
import { GET as getPreferences, PUT as putPreferences } from "../app/api/me/preferences/route";
import { POST as postRedeem } from "../app/api/me/redeem/route";
import { GET as getTransfers, POST as postTransfers } from "../app/api/me/transfers/route";
import { DELETE as deleteTransfer, PATCH as patchTransfer } from "../app/api/me/transfers/[id]/route";
import { POST as postTipsterConnect } from "../app/api/tipster/connect/route";
import { GET as getTipsterMe } from "../app/api/tipster/me/route";

const ORIGIN = "http://localhost:3000";
const SECRET = "secreto-prueba-routes-beta1-al-menos-32-caracteres!!";
const BASE_NOW = new Date("2026-11-12T12:00:00Z");

let pgClient: PGlite;
let sharedDb: Db;
const sentEmails: OutgoingEmail[] = [];
const ENV_BACKUP = { ...process.env };

function captureCookies(headers: Headers): string {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof getSetCookie === "function") {
    return getSetCookie
      .call(headers)
      .map((c) => c.split(";")[0])
      .filter(Boolean)
      .join("; ");
  }
  const single = headers.get("set-cookie");
  return single ? single.split(";")[0] ?? "" : "";
}

async function signInUser(
  db: Db,
  email: string,
  options?: {
    complete?: boolean;
    handle?: string;
    displayName?: string;
    referralCode?: string | null;
    emailVerified?: boolean;
  },
): Promise<{ userId: string; authUserId: string; email: string; cookieHeader: string }> {
  const sent: Array<{ html: string }> = [];
  const auth = createAuth({
    db,
    secret: SECRET,
    baseURL: ORIGIN,
    sendEmail: async (_to, _subject, html) => {
      sent.push({ html });
    },
  });
  resetAuthForTests(auth);

  const init = await auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ email, callbackURL: "/app" }),
    }),
  );
  if (init.status !== 200) throw new Error(`magic-link init failed: ${init.status}`);

  const link = sent[0]!.html.match(/href="([^"]+)"/)![1]!.replace(/&amp;/g, "&");
  const verify = await auth.handler(new Request(link, { headers: { origin: ORIGIN } }));
  const cookieHeader = captureCookies(verify.headers);
  if (!cookieHeader) throw new Error("missing auth cookie");

  const [row] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
  if (!row || !row.authUserId) throw new Error("missing user row");

  if (options?.emailVerified !== undefined) {
    await db
      .update(authUser)
      .set({ emailVerified: options.emailVerified })
      .where(eq(authUser.id, row.authUserId));
  }

  if (options?.complete !== false) {
    const res = await completeSignup(db, {
      userId: row.id,
      displayName: options?.displayName ?? "Socio Prueba",
      handle: options?.handle ?? `socio_${row.id.slice(0, 6)}`,
      birthDate: "1992-05-10",
      termsVersion: SIGNUP_CONSENT_VERSION,
      analyticsConsent: false,
      marketingConsent: false,
      referralCode: options?.referralCode ?? null,
      trial: null,
      now: BASE_NOW,
    });
    if (!res.ok) throw new Error(`completeSignup failed: ${res.reason}`);
  }

  return {
    userId: row.id,
    authUserId: row.authUserId,
    email: row.email,
    cookieHeader,
  };
}

function jsonReq(
  path: string,
  method: string,
  cookieHeader: string,
  body?: unknown,
  origin: string | null = ORIGIN,
): Request {
  const headers: Record<string, string> = { cookie: cookieHeader };
  if (origin !== null) headers.origin = origin;
  if (body !== undefined) headers["content-type"] = "application/json";
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

beforeAll(async () => {
  pgClient = new PGlite();
  await applyMigrations((sqlText) => pgClient.exec(sqlText));
  sharedDb = drizzle(pgClient) as unknown as Db;
});

beforeEach(async () => {
  await pgClient.exec(
    "TRUNCATE TABLE users, auth_user, auth_verification, access_coupons, tipster_profiles, scheduled_emails, platform_runtime_flags, admin_audit_logs CASCADE",
  );
  sentEmails.length = 0;
  resetRateLimitsForTests();
  resetAuthForTests();
  setSessionDbForTests(sharedDb);
  setMailerForTests({
    async send(email) {
      sentEmails.push(email);
      return { id: `mock-mail-${sentEmails.length}` };
    },
    async cancel() {},
  });

  process.env.DATABASE_URL = "postgresql://localhost/test";
  process.env.BETTER_AUTH_SECRET = SECRET;
  process.env.BETTER_AUTH_URL = ORIGIN;
  process.env.PITCHLAB_PAYMENTS_MODE = "transfer";
  process.env.PITCHLAB_TRANSFER_BANK = "BBVA México";
  process.env.PITCHLAB_TRANSFER_BENEFICIARY = "PitchLab México";
  process.env.PITCHLAB_TRANSFER_CLABE = "000000000000000001";
  process.env.PITCHLAB_ADMIN_EMAILS = "admin@example.com";
  process.env.CRON_SECRET = "cron-secret-test-123";
  process.env.STRIPE_SECRET_KEY = "sk_test_ignored_in_transfer_mode";
});

afterEach(() => {
  setMailerForTests(null);
  setSessionDbForTests(null);
  resetAuthForTests();
  for (const key of Object.keys(process.env)) {
    if (!(key in ENV_BACKUP)) delete process.env[key];
  }
  Object.assign(process.env, ENV_BACKUP);
});

afterAll(async () => {
  await pgClient?.close();
});

describe("Beta 1.0 · Endpoints SPEI, cupones, preferencias, tipster y cron", () => {
  it("bloquea CSRF cross-origin, admin no autorizado, paso 1 incompleto y apaga Stripe en modo transfer", async () => {
    const step1 = await signInUser(sharedDb, "paso1@example.com", { complete: false });
    const member = await signInUser(sharedDb, "socio@example.com", {
      handle: "socio_mx",
      emailVerified: true,
    });
    const unverifiedAdmin = await signInUser(sharedDb, "admin@example.com", {
      handle: "admin_pend",
      emailVerified: false,
    });

    // CSRF cross-origin rechazado con 403
    const csrfBad = await postTransfers(
      jsonReq("/api/me/transfers", "POST", member.cookieHeader, { planInterval: "monthly" }, "https://evil.example"),
    );
    expect(csrfBad.status).toBe(403);

    // Paso 1 sin completar +18/usuario bloqueado en SPEI y canje
    const step1Transfer = await postTransfers(
      jsonReq("/api/me/transfers", "POST", step1.cookieHeader, { planInterval: "monthly" }),
    );
    expect(step1Transfer.status).toBe(403);
    expect(await step1Transfer.json()).toEqual({ error: "registro_incompleto" });

    const step1Redeem = await postRedeem(
      jsonReq("/api/me/redeem", "POST", step1.cookieHeader, { code: "BETA2026" }),
    );
    expect(step1Redeem.status).toBe(403);
    expect(await step1Redeem.json()).toEqual({ error: "registro_incompleto" });

    // Endpoints admin rechazan socio normal y admin sin correo verificado
    for (const badAdmin of [member, unverifiedAdmin]) {
      const r1 = await getAdminTransfers(new Request(`${ORIGIN}/api/admin/transfers`, { headers: { cookie: badAdmin.cookieHeader } }));
      expect(r1.status).toBe(403);
      const r2 = await postAdminCoupons(
        jsonReq("/api/admin/coupons", "POST", badAdmin.cookieHeader, { code: "TEST7", days: 7 }),
      );
      expect(r2.status).toBe(403);
      const r3 = await getAdminMembers(new Request(`${ORIGIN}/api/admin/members`, { headers: { cookie: badAdmin.cookieHeader } }));
      expect(r3.status).toBe(403);
      const r4 = await getAdminTipsterPayouts(new Request(`${ORIGIN}/api/admin/tipster-payouts`, { headers: { cookie: badAdmin.cookieHeader } }));
      expect(r4.status).toBe(403);
    }

    // Modo transfer (Beta 1.0) apaga Checkout (503) y Connect (409) aunque exista STRIPE_SECRET_KEY
    const checkoutRes = await postBillingCheckout(
      jsonReq("/api/billing/checkout", "POST", member.cookieHeader, { interval: "monthly" }),
    );
    expect(checkoutRes.status).toBe(503);

    const connectRes = await postTipsterConnect(
      new Request(`${ORIGIN}/api/tipster/connect`, {
        method: "POST",
        headers: { cookie: member.cookieHeader, origin: ORIGIN },
      }),
    );
    expect(connectRes.status).toBe(409);
  });

  it("ciclo SPEI completo: cotización con referido, 409 duplicado, comprobante, rechazo, reenvío y aprobación idempotente", async () => {
    const admin = await signInUser(sharedDb, "admin@example.com", {
      handle: "admin_pl",
      emailVerified: true,
    });
    const host = await signInUser(sharedDb, "anfitrion@example.com", {
      handle: "anfitrion_mx",
      displayName: "Anfitrión",
    });
    const [hostRow] = await sharedDb.select().from(users).where(eq(users.id, host.userId));

    const friend = await signInUser(sharedDb, "invitado@example.com", {
      handle: "invitado_mx",
      displayName: "Invitado Uno",
      referralCode: hostRow!.referralCode,
    });

    // Cotización inicial aplica primer mes a $209 MXN por referido y muestra CLABE desde env
    const quoteRes = await getTransfers(
      new Request(`${ORIGIN}/api/me/transfers`, { headers: { cookie: friend.cookieHeader } }),
    );
    expect(quoteRes.status).toBe(200);
    const quoteJson = (await quoteRes.json()) as {
      paymentMode: string;
      bank: { configured: boolean; clabe: string; clabeMasked: string };
      quotes: { monthly: { amountCentavosMxn: number; referralDiscountApplied: boolean } };
    };
    expect(quoteJson.paymentMode).toBe("transfer");
    expect(quoteJson.bank.configured).toBe(true);
    expect(quoteJson.bank.clabe).toBe("000000000000000001");
    expect(quoteJson.quotes.monthly.amountCentavosMxn).toBe(20_900);
    expect(quoteJson.quotes.monthly.referralDiscountApplied).toBe(true);

    // Crear solicitud mensual -> 201; duplicada pendiente -> 409
    const create1 = await postTransfers(
      jsonReq("/api/me/transfers", "POST", friend.cookieHeader, { planInterval: "monthly" }),
    );
    expect(create1.status).toBe(201);
    const created1 = (await create1.json()) as { request: { id: string; referenceCode: string } };
    expect(created1.request.referenceCode).toMatch(/^PL-/);

    const createDup = await postTransfers(
      jsonReq("/api/me/transfers", "POST", friend.cookieHeader, { planInterval: "annual" }),
    );
    expect(createDup.status).toBe(409);

    // Cancelar la primera y crear una nueva
    const cancelRes = await deleteTransfer(
      new Request(`${ORIGIN}/api/me/transfers/${created1.request.id}`, {
        method: "DELETE",
        headers: { cookie: friend.cookieHeader, origin: ORIGIN },
      }),
      { params: Promise.resolve({ id: created1.request.id }) },
    );
    expect(cancelRes.status).toBe(200);

    const create2 = await postTransfers(
      jsonReq("/api/me/transfers", "POST", friend.cookieHeader, { planInterval: "monthly" }),
    );
    expect(create2.status).toBe(201);
    const created2 = (await create2.json()) as { request: { id: string } };

    // Capturar comprobante con monto distinto detecta amountMismatch
    const patchRes = await patchTransfer(
      jsonReq(`/api/me/transfers/${created2.request.id}`, "PATCH", friend.cookieHeader, {
        originBank: "Nu México",
        reportedAmountCentavosMxn: 29_900,
        receiptReference: "SPEI-FOLIO-111",
        payerName: "Invitado Uno",
        transferDate: "2026-11-12",
      }),
      { params: Promise.resolve({ id: created2.request.id }) },
    );
    expect(patchRes.status).toBe(200);
    const patchJson = (await patchRes.json()) as { request: { amountMismatch: boolean } };
    expect(patchJson.request.amountMismatch).toBe(true);

    // Admin rechaza (motivo corto falla 400; válido 200 y envía correo)
    const rejectBad = await postAdminRejectTransfer(
      jsonReq(`/api/admin/transfers/${created2.request.id}/reject`, "POST", admin.cookieHeader, { reason: "no" }),
      { params: Promise.resolve({ id: created2.request.id }) },
    );
    expect(rejectBad.status).toBe(400);

    const rejectOk = await postAdminRejectTransfer(
      jsonReq(`/api/admin/transfers/${created2.request.id}/reject`, "POST", admin.cookieHeader, {
        reason: "Folio no localizado en cuenta",
      }),
      { params: Promise.resolve({ id: created2.request.id }) },
    );
    expect(rejectOk.status).toBe(200);
    expect(sentEmails.some((m) => m.to === friend.email && m.tags?.some((t) => t.value === "transfer_rejected"))).toBe(
      true,
    );

    // Socio crea tercera solicitud exacta y admin la aprueba
    const create3 = await postTransfers(
      jsonReq("/api/me/transfers", "POST", friend.cookieHeader, {
        planInterval: "monthly",
        originBank: "BBVA México",
        reportedAmountCentavosMxn: 20_900,
        receiptReference: "SPEI-FOLIO-222",
      }),
    );
    expect(create3.status).toBe(201);
    const created3 = (await create3.json()) as { request: { id: string } };

    const adminList = await getAdminTransfers(
      new Request(`${ORIGIN}/api/admin/transfers?status=pending_review`, {
        headers: { cookie: admin.cookieHeader },
      }),
    );
    expect(adminList.status).toBe(200);
    const adminListJson = (await adminList.json()) as { requests: Array<{ id: string }>; pendingCount: number };
    expect(adminListJson.pendingCount).toBe(1);
    expect(adminListJson.requests[0]!.id).toBe(created3.request.id);

    const mailsBeforeApprove = sentEmails.length;
    const approve1 = await postAdminApproveTransfer(
      new Request(`${ORIGIN}/api/admin/transfers/${created3.request.id}/approve`, {
        method: "POST",
        headers: { cookie: admin.cookieHeader, origin: ORIGIN },
      }),
      { params: Promise.resolve({ id: created3.request.id }) },
    );
    expect(approve1.status).toBe(200);
    const approveJson1 = (await approve1.json()) as {
      ok: boolean;
      alreadyApproved: boolean;
      newAccessUntilIso: string;
    };
    expect(approveJson1.ok).toBe(true);
    expect(approveJson1.alreadyApproved).toBe(false);
    expect(approveJson1.newAccessUntilIso).toBeTruthy();

    // Segunda aprobación es idempotente y no vuelve a enviar correos
    const mailsAfterApprove = sentEmails.length;
    expect(mailsAfterApprove).toBeGreaterThan(mailsBeforeApprove);
    const approve2 = await postAdminApproveTransfer(
      new Request(`${ORIGIN}/api/admin/transfers/${created3.request.id}/approve`, {
        method: "POST",
        headers: { cookie: admin.cookieHeader, origin: ORIGIN },
      }),
      { params: Promise.resolve({ id: created3.request.id }) },
    );
    expect(approve2.status).toBe(200);
    expect(((await approve2.json()) as { alreadyApproved: boolean }).alreadyApproved).toBe(true);
    expect(sentEmails.length).toBe(mailsAfterApprove);

    // Ambos recibieron sus días y el socio ve plan activo + transferencia aprobada
    const friendPlan = await getPlan(new Request(`${ORIGIN}/api/me/plan`, { headers: { cookie: friend.cookieHeader } }));
    const friendPlanJson = (await friendPlan.json()) as {
      active: boolean;
      planState: string;
      accessSourceKind: string;
      trialDaysRemaining: number;
      transferHistory: Array<{ status: string }>;
    };
    expect(friendPlanJson.active).toBe(true);
    expect(friendPlanJson.planState).toBe("mensual");
    expect(friendPlanJson.accessSourceKind).toBe("referral_friend_15d");
    expect(friendPlanJson.trialDaysRemaining).toBeGreaterThanOrEqual(44);
    expect(friendPlanJson.transferHistory[0]?.status).toBe("approved");

    const hostPlan = await getPlan(new Request(`${ORIGIN}/api/me/plan`, { headers: { cookie: host.cookieHeader } }));
    const hostPlanJson = (await hostPlan.json()) as { active: boolean; earnedDays: number };
    expect(hostPlanJson.active).toBe(true);
    expect(hostPlanJson.earnedDays).toBe(15);
  });

  it("cupones: admin CRUD, prioridad ya_canjeado > agotado en preview, canje atómico 200/409 y límite 429", async () => {
    const admin = await signInUser(sharedDb, "admin@example.com", {
      handle: "admin_cp",
      emailVerified: true,
    });
    const member1 = await signInUser(sharedDb, "m1@example.com", { handle: "socio_cp1" });
    const member2 = await signInUser(sharedDb, "m2@example.com", { handle: "socio_cp2" });

    // Crear cupón con límite de 1 uso
    const createRes = await postAdminCoupons(
      jsonReq("/api/admin/coupons", "POST", admin.cookieHeader, {
        code: "BETA1",
        days: 15,
        maxRedemptions: 1,
        note: "Cupón 1 uso",
      }),
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { coupon: { id: string; code: string } };

    // Previsualización pública sin sesión funciona
    const pubPreview = await getCouponPreview(
      new Request(`${ORIGIN}/api/me/coupons/preview?codigo=BETA1`),
    );
    expect(pubPreview.status).toBe(200);
    expect(await pubPreview.json()).toMatchObject({
      valid: true,
      coupon: { code: "BETA1", days: 15 },
    });

    // Socio 1 canjea -> 200
    const redeem1 = await postRedeem(
      jsonReq("/api/me/redeem", "POST", member1.cookieHeader, { code: "beta1" }),
    );
    expect(redeem1.status).toBe(200);
    expect(await redeem1.json()).toMatchObject({ ok: true, code: "BETA1", days: 15 });

    // Socio 1 ya canjeó Y el cupón llegó a 1/1 -> preview debe priorizar `ya_canjeado`
    const previewMember1 = await getCouponPreview(
      new Request(`${ORIGIN}/api/me/coupons/preview?codigo=BETA1`, {
        headers: { cookie: member1.cookieHeader },
      }),
    );
    expect(await previewMember1.json()).toMatchObject({ valid: false, reason: "ya_canjeado" });

    // Socio 2 ve `agotado` en preview y 409 agotado al canjear
    const previewMember2 = await getCouponPreview(
      new Request(`${ORIGIN}/api/me/coupons/preview?codigo=BETA1`, {
        headers: { cookie: member2.cookieHeader },
      }),
    );
    expect(await previewMember2.json()).toMatchObject({ valid: false, reason: "agotado" });

    const redeem2 = await postRedeem(
      jsonReq("/api/me/redeem", "POST", member2.cookieHeader, { code: "BETA1" }),
    );
    expect(redeem2.status).toBe(409);
    expect(await redeem2.json()).toMatchObject({ ok: false, reason: "agotado" });

    // Admin ve lista, redenciones y desactiva cupón
    const listRes = await getAdminCoupons(new Request(`${ORIGIN}/api/admin/coupons`, { headers: { cookie: admin.cookieHeader } }));
    expect(((await listRes.json()) as { coupons: unknown[] }).coupons).toHaveLength(1);

    const redemptionsRes = await getAdminCouponRedemptions(
      new Request(`${ORIGIN}/api/admin/coupons/${created.coupon.id}/redemptions`, {
        headers: { cookie: admin.cookieHeader },
      }),
      { params: Promise.resolve({ id: created.coupon.id }) },
    );
    expect(((await redemptionsRes.json()) as { redemptions: Array<{ handle: string }> }).redemptions[0]!.handle).toBe(
      "socio_cp1",
    );

    const toggleRes = await patchAdminCoupon(
      jsonReq(`/api/admin/coupons/${created.coupon.id}`, "PATCH", admin.cookieHeader, { active: false }),
      { params: Promise.resolve({ id: created.coupon.id }) },
    );
    expect(((await toggleRes.json()) as { coupon: { active: boolean } }).coupon.active).toBe(false);

    // Rate limit 10/h en /api/me/redeem (llevábamos 1 intento en member1; 9 más OK, el 11avo -> 429)
    for (let i = 0; i < 9; i++) {
      const r = await postRedeem(
        jsonReq("/api/me/redeem", "POST", member1.cookieHeader, { code: `NOEXISTE_${i}` }),
      );
      expect(r.status).toBe(404);
    }
    const rateLimited = await postRedeem(
      jsonReq("/api/me/redeem", "POST", member1.cookieHeader, { code: "NOEXISTE_10" }),
    );
    expect(rateLimited.status).toBe(429);
  });

  it("admin concede y revoca días, preferencias + export JSON + solicitud de baja con 429", async () => {
    const admin = await signInUser(sharedDb, "admin@example.com", {
      handle: "admin_op",
      emailVerified: true,
    });
    const member = await signInUser(sharedDb, "datos@example.com", { handle: "socio_datos" });

    // Admin busca socio y concede + revoca días
    const membersRes = await getAdminMembers(
      new Request(`${ORIGIN}/api/admin/members?q=socio_datos`, { headers: { cookie: admin.cookieHeader } }),
    );
    expect(((await membersRes.json()) as { members: Array<{ id: string }> }).members).toHaveLength(1);

    const grantRes = await postAdminAccessGrant(
      jsonReq("/api/admin/access/grant", "POST", admin.cookieHeader, {
        targetUserId: member.userId,
        days: 10,
        reason: "Cortesía beta",
      }),
    );
    expect(grantRes.status).toBe(200);
    const { grantId } = (await grantRes.json()) as { grantId: string };

    const revokeRes = await postAdminAccessRevoke(
      jsonReq("/api/admin/access/revoke", "POST", admin.cookieHeader, {
        grantId,
        reason: "Fin de prueba",
      }),
    );
    expect(revokeRes.status).toBe(200);

    // Preferencias: valida mínimo $10 MXN (1000 centavos) y sincroniza users.public_profile
    const badUnit = await putPreferences(
      jsonReq("/api/me/preferences", "PUT", member.cookieHeader, { unitMxnCentavos: 500 }),
    );
    expect(badUnit.status).toBe(400);

    const putRes = await putPreferences(
      jsonReq("/api/me/preferences", "PUT", member.cookieHeader, {
        oddsFormat: "decimal",
        themeMode: "light",
        unitMxnCentavos: 25_000,
        showMxnBalance: true,
        publicRecordVisible: false,
        emailPickResults: true,
        responsiblePauseKind: "7d",
      }),
    );
    expect(putRes.status).toBe(200);
    const [uRow] = await sharedDb.select().from(users).where(eq(users.id, member.userId));
    expect(uRow!.publicProfile).toBe(false);

    const getPrefRes = await getPreferences(
      new Request(`${ORIGIN}/api/me/preferences`, { headers: { cookie: member.cookieHeader } }),
    );
    expect(await getPrefRes.json()).toMatchObject({
      ok: true,
      preferences: {
        oddsFormat: "decimal",
        themeMode: "light",
        unitMxn: 250,
        showMxnBalance: true,
        publicRecordVisible: false,
        emailPickResults: true,
        responsiblePauseKind: "7d",
      },
    });

    // Export JSON completo con Content-Disposition attachment
    const exportRes = await getExport(
      new Request(`${ORIGIN}/api/me/export`, { headers: { cookie: member.cookieHeader } }),
    );
    expect(exportRes.status).toBe(200);
    expect(exportRes.headers.get("content-disposition")).toContain("attachment");
    const exportJson = (await exportRes.json()) as {
      version: string;
      profile: { handle: string };
      preferences: { unitMxnCentavos: number };
      entitlementGrants: unknown[];
    };
    expect(exportJson.version).toBe("pitchlab-export-v1");
    expect(exportJson.profile.handle).toBe("socio_datos");
    expect(exportJson.preferences.unitMxnCentavos).toBe(25_000);
    expect(exportJson.entitlementGrants.length).toBeGreaterThanOrEqual(1);

    // Solicitud de baja: audita, envía correo y aplica límite 3/24h
    for (let i = 0; i < 3; i++) {
      const r = await postDeletionRequest(
        jsonReq("/api/me/deletion-request", "POST", member.cookieHeader, { reason: `Motivo ${i}` }),
      );
      expect(r.status).toBe(200);
    }
    const del429 = await postDeletionRequest(
      jsonReq("/api/me/deletion-request", "POST", member.cookieHeader, { reason: "4to intento" }),
    );
    expect(del429.status).toBe(429);

    const logs = await sharedDb
      .select()
      .from(adminAuditLogs)
      .where(eq(adminAuditLogs.action, "member_deletion_request"));
    expect(logs).toHaveLength(3);
  });

  it("tipster portal, comisión SPEI con IVA 16%, cron (14d + ventana 28d) y liquidación manual", async () => {
    const admin = await signInUser(sharedDb, "admin@example.com", {
      handle: "admin_tip",
      emailVerified: true,
    });
    const plain = await signInUser(sharedDb, "normal@example.com", { handle: "socio_comun" });
    const tipster = await signInUser(sharedDb, "lupita@example.com", {
      handle: "lupita_mx",
      displayName: "Lupita Picks",
    });

    // Socio común ve { isTipster: false }
    const notTipster = await getTipsterMe(
      new Request(`${ORIGIN}/api/tipster/me`, { headers: { cookie: plain.cookieHeader } }),
    );
    expect(await notTipster.json()).toEqual({ isTipster: false });

    // Alta de tipster
    const tipsterCreate = await postAdminTipsters(
      jsonReq("/api/admin/tipsters", "POST", admin.cookieHeader, {
        email: "lupita@example.com",
        handle: "lupita_mx",
        displayName: "Lupita Picks",
        promoCode: "LUPITA",
        specialty: "Liga MX",
      }),
    );
    expect(tipsterCreate.status).toBe(201);

    // Nuevo socio llega atribuido al tipster con código LUPITA y paga pase anual por SPEI ($2,390 MXN)
    const buyer = await signInUser(sharedDb, "comprador@example.com", {
      handle: "comprador_mx",
      displayName: "Comprador",
    });
    await sharedDb.insert(tipsterAttributions).values({
      tipsterUserId: tipster.userId,
      referredUserId: buyer.userId,
      promoCodeUsed: "LUPITA",
      status: "trial_5d",
    });

    const createTr = await postTransfers(
      jsonReq("/api/me/transfers", "POST", buyer.cookieHeader, { planInterval: "annual" }),
    );
    expect(createTr.status).toBe(201);
    const { request: reqObj } = (await createTr.json()) as { request: { id: string } };

    const appTr = await postAdminApproveTransfer(
      new Request(`${ORIGIN}/api/admin/transfers/${reqObj.id}/approve`, {
        method: "POST",
        headers: { cookie: admin.cookieHeader, origin: ORIGIN },
      }),
      { params: Promise.resolve({ id: reqObj.id }) },
    );
    expect(appTr.status).toBe(200);

    // Recordatorio anual (>28 días) quedó como pending en scheduled_emails
    const pendingAnnualEmails = await sharedDb
      .select()
      .from(scheduledEmails)
      .where(eq(scheduledEmails.userId, buyer.userId));
    expect(pendingAnnualEmails.some((e) => e.kind === "renewal_reminder" && e.status === "pending")).toBe(
      true,
    );

    // Tipster ve atribución y saldo pendiente de madurar (14d)
    const tipsterView1 = await getTipsterMe(
      new Request(`${ORIGIN}/api/tipster/me`, { headers: { cookie: tipster.cookieHeader } }),
    );
    const tv1Json = (await tipsterView1.json()) as {
      isTipster: boolean;
      counts: { totalAttributed: number; activePaying: number };
      totals: { pendingClearanceCentavos: number; payableCentavos: number };
      ledger: Array<{ id: string; status: string; commissionCentavosMxn: number }>;
      profile: Record<string, unknown>;
    };
    expect(tv1Json.isTipster).toBe(true);
    expect(tv1Json.profile).not.toHaveProperty("clabeEncrypted");
    expect(tv1Json.counts.activePaying).toBe(1);
    expect(tv1Json.totals.pendingClearanceCentavos).toBeGreaterThan(0);
    expect(tv1Json.ledger).toHaveLength(1);
    const ledgerId = tv1Json.ledger[0]!.id;

    // Simular maduración (>14d) y un recordatorio dentro de la ventana de 28d; otro sigue >28d
    await sharedDb
      .update(tipsterCommissionLedger)
      .set({ clearsAt: new Date(Date.now() - 60_000) })
      .where(eq(tipsterCommissionLedger.id, ledgerId));

    const within28d = new Date(Date.now() + 10 * 86_400_000);
    await sharedDb.insert(scheduledEmails).values({
      userId: plain.userId,
      kind: "renewal_reminder",
      cycleKey: "cron-test-10d",
      sendAt: within28d,
      status: "pending",
    });

    // Cron sin secret -> 401; con secret -> promueve comisión y despacha solo el correo dentro de 28d
    const cronUnauth = await getCronTipsterPayouts(new Request(`${ORIGIN}/api/cron/tipster-payouts`));
    expect(cronUnauth.status).toBe(401);

    const cronOk = await getCronTipsterPayouts(
      new Request(`${ORIGIN}/api/cron/tipster-payouts`, {
        headers: { authorization: "Bearer cron-secret-test-123" },
      }),
    );
    expect(cronOk.status).toBe(200);
    const cronJson = (await cronOk.json()) as {
      mode: string;
      promoted: number;
      emailsDispatched: number;
    };
    expect(cronJson.mode).toBe("transfer");
    expect(cronJson.promoted).toBe(1);
    expect(cronJson.emailsDispatched).toBe(1);

    // El correo anual a >360 días sigue pending
    const stillPendingAnnual = await sharedDb
      .select()
      .from(scheduledEmails)
      .where(eq(scheduledEmails.userId, buyer.userId));
    expect(stillPendingAnnual.some((e) => e.kind === "renewal_reminder" && e.status === "pending")).toBe(
      true,
    );

    // Admin marca como liquidado manualmente y tipster recibe notificación por correo
    const adminPayouts = await getAdminTipsterPayouts(
      new Request(`${ORIGIN}/api/admin/tipster-payouts`, { headers: { cookie: admin.cookieHeader } }),
    );
    expect(((await adminPayouts.json()) as { ledger: Array<{ status: string }> }).ledger[0]!.status).toBe(
      "payable",
    );

    const markPaidRes = await postAdminMarkPaid(
      jsonReq(`/api/admin/tipster-payouts/${ledgerId}/mark-paid`, "POST", admin.cookieHeader, {
        reference: "SPEI-TIP-88412",
        note: "Transferido quincena",
      }),
      { params: Promise.resolve({ id: ledgerId }) },
    );
    expect(markPaidRes.status).toBe(200);
    expect(sentEmails.some((m) => m.to === tipster.email && m.tags?.some((t) => t.value === "tipster_payout"))).toBe(
      true,
    );

    const tipsterView2 = await getTipsterMe(
      new Request(`${ORIGIN}/api/tipster/me`, { headers: { cookie: tipster.cookieHeader } }),
    );
    const tv2Json = (await tipsterView2.json()) as { totals: { payableCentavos: number; paidOutCentavos: number } };
    expect(tv2Json.totals.payableCentavos).toBe(0);
    expect(tv2Json.totals.paidOutCentavos).toBeGreaterThan(0);
  });
});
