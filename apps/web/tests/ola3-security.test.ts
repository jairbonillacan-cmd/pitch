import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyMigrations,
  authAccount,
  authUser,
  claimEmail,
  createTipsterCode,
  handleInvoicePaid,
  listScheduledEmails,
  markEmail,
  memberProfile,
  publicProfileByHandle,
  subscriptions,
  tipsterAttributions,
  tipsterCommissionLedger,
  tipsterProfileForUser,
  tipsterProfiles,
  updateMemberProfile,
  users,
  type Db,
} from "@pitchlab/db";
import {
  CFDI_STORAGE_KEY,
  readStoredCfdiDraft,
  sanitizeCsvCell,
  validateMexicanRfc,
  writeStoredCfdiDraft,
} from "../../../packages/ui/src/platform/club/account/account-helpers";
import { listUnderstatSnapshots } from "../../../services/ingest/src/history/understat";
import { writeSnapshotFiles } from "../../../services/ingest/src/pipeline";
import { cancelTrialEmails } from "../src/server/account-emails";
import { getAuth, resetAuthForTests, scrubOAuthAccountTokens } from "../src/server/auth";
import { isBetaPinEnabled } from "../src/server/beta-auth";
import {
  buildPaseTotalInvoice,
  isValidRfc,
  stampInvoice,
  validateCfdiProfile,
} from "../src/server/billing/cfdi";
import { processStripeEvent, type WebhookDeps } from "../src/server/billing/stripe-webhook";
import { parseProfileChanges } from "../src/server/profile";
import { trustedAppBaseUrl } from "../src/server/request-security";

let client: PGlite;
let db: Db;
const now = new Date("2026-11-12T12:00:00Z");

beforeAll(async () => {
  client = new PGlite();
  await applyMigrations((sqlText) => client.exec(sqlText));
  db = drizzle(client) as unknown as Db;
}, 30_000);

beforeEach(async () => {
  await client.exec("TRUNCATE TABLE processed_payment_events, auth_user, users CASCADE");
});

afterEach(() => {
  resetAuthForTests(undefined);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await client?.close();
});

describe("Ola 3 Seguridad (SEC-14..SEC-18)", () => {
  it("SEC-14: bloquea secretos locales local-9990/e2e-test en producción", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/neondb");
    vi.stubEnv("BETTER_AUTH_URL", "https://pitchlab.mx");
    vi.stubEnv("BETTER_AUTH_SECRET", "local-9990-pitchlab-beta-cookie-secret-32chars!");
    expect(() => getAuth()).toThrow(/BETTER_AUTH_SECRET/);

    resetAuthForTests(undefined);
    vi.stubEnv("BETTER_AUTH_SECRET", "e2e-test-secret-that-is-32-chars-or-more!!");
    expect(() => getAuth()).toThrow(/BETTER_AUTH_SECRET/);

    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    vi.stubEnv("PITCHLAB_BETA_CODE", "9482");
    vi.stubEnv("PITCHLAB_COOKIE_SECRET", "local-9990-pitchlab-beta-cookie-secret-32chars!");
    expect(isBetaPinEnabled()).toBe(false);
  });

  it("SEC-15: valida calendario real en RFC, uso S01 en régimen 616, redacta PII de Facturapi y purga pl-cfdi-v1", async () => {
    // 31 de febrero y 29 de febrero no bisiesto deben rechazarse
    expect(isValidRfc("ABCD850231AB1")).toBe(false);
    expect(isValidRfc("ABCD010229AB1")).toBe(false);
    expect(isValidRfc("ABCD000229AB1")).toBe(true);
    expect(validateMexicanRfc("ABCD850231XYZ", "612").valid).toBe(false);
    expect(validateMexicanRfc("ABCD890123XYZ", "612").valid).toBe(true);

    // Régimen 616 exige S01
    const base616 = {
      rfc: "XAXX010101000",
      legalName: "Público en General",
      taxZipCode: "06600",
      satTaxSystem: "616",
      billingEmail: "fiscal@example.com",
    };
    expect(validateCfdiProfile({ ...base616, cfdiUse: "G03" })).toMatchObject({ ok: false });
    const valid616 = validateCfdiProfile(base616);
    expect(valid616).toMatchObject({ ok: true, value: { cfdiUse: "S01" } });

    const invoice616 = buildPaseTotalInvoice({
      customer: base616,
      totalCentavos: 29900,
      planLabel: "Mensual",
      stripeInvoiceId: "in_616",
    });
    expect(invoice616.use).toBe("S01");
    expect(() =>
      buildPaseTotalInvoice({
        customer: base616,
        totalCentavos: 0,
        planLabel: "Mensual",
        stripeInvoiceId: "in_zero",
      }),
    ).toThrow(/Monto de factura inválido/);

    // Facturapi devuelve PII en el cuerpo de error: stampInvoice jamás la filtra al mensaje de Error
    const piiErrorFetch = (async () =>
      new Response(
        JSON.stringify({
          code: "invalid_tax_id",
          message: "El RFC ABCD890123XYZ de JUAN PEREZ LOPEZ no coincide con el padrón del SAT",
        }),
        { status: 400, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;

    await expect(stampInvoice("sk_facturapi_test", invoice616, piiErrorFetch)).rejects.toSatisfy((err: unknown) => {
      const msg = String(err);
      return (
        msg.includes("400") &&
        msg.includes("invalid_tax_id") &&
        !msg.includes("ABCD890123XYZ") &&
        !msg.includes("JUAN PEREZ")
      );
    });

    // Purga de pl-cfdi-v1 en localStorage
    const store = new Map<string, string>([
      [CFDI_STORAGE_KEY, JSON.stringify({ rfc: "ABCD890123XYZ", razonSocial: "JUAN PEREZ" })],
    ]);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    });
    const draft = readStoredCfdiDraft();
    expect(draft.rfc).toBe("");
    expect(store.has(CFDI_STORAGE_KEY)).toBe(false);
    writeStoredCfdiDraft({ v: 1, rfc: "ABCD890123XYZ", razonSocial: "JUAN", regimenFiscal: "612", usoCfdi: "G03", cpFiscal: "06600" });
    expect(store.has(CFDI_STORAGE_KEY)).toBe(false);
  });

  it("SEC-16: persiste publicProfile en PostgreSQL y oculta /api/u/[handle] al desactivarlo", async () => {
    const [socio] = await db
      .insert(users)
      .values({
        authUserId: "auth_priv_1",
        email: "privado@example.com",
        handle: "carlos_privado",
        displayName: "Carlos Privado",
        isAdult: true,
      })
      .returning();

    expect(await publicProfileByHandle(db, "carlos_privado")).toMatchObject({
      handle: "carlos_privado",
      displayName: "Carlos Privado",
    });

    const parsed = parseProfileChanges({ publicProfile: false });
    expect(parsed).toEqual({ changes: { publicProfile: false } });
    expect(parseProfileChanges({ publicProfile: "no" })).toEqual({ error: "privacidad_invalida" });

    const updated = await updateMemberProfile(db, socio!.id, { publicProfile: false });
    expect(updated).toMatchObject({ status: "saved", profile: { publicProfile: false } });

    // El perfil público deja de resolver (404 en /api/u/[handle] y /app/u/[handle]), pero el titular conserva su lectura
    expect(await publicProfileByHandle(db, "carlos_privado")).toBeNull();
    expect(await memberProfile(db, socio!.id)).toMatchObject({
      handle: "carlos_privado",
      publicProfile: false,
    });
  });

  it("SEC-17: bloquea tipsters inactivos, reservados en createTipsterCode y minimiza tokens OAuth", async () => {
    // Handles reservados o inválidos rechazados en createTipsterCode
    expect(
      await createTipsterCode(db, {
        email: "admin@example.com",
        handle: "admin",
        displayName: "Admin",
        promoCode: "ADM10",
        specialty: "NFL",
      }),
    ).toEqual({ ok: false, reason: "handle_invalido" });
    expect(
      await createTipsterCode(db, {
        email: "sofia@example.com",
        handle: "sofia_nfl",
        displayName: "Sofía",
        promoCode: "SOF10",
        specialty: "NFL",
      }),
    ).toEqual({ ok: false, reason: "handle_invalido" });

    // Tipster desactivado no puede abrir Connect ni devengar nuevas comisiones
    const [tipsterUser, fanUser] = await db
      .insert(users)
      .values([{ email: "tipster@example.com" }, { email: "fan@example.com" }])
      .returning();
    await db.insert(tipsterProfiles).values({
      userId: tipsterUser!.id,
      handle: "tip_inactivo",
      displayName: "Tipster Inactivo",
      specialty: "Liga MX",
      promoCode: "INACT5",
      defaultWeeklySlug: "tip-inactivo-sem",
      commissionBps: 2500,
      isActive: false,
    });
    await db.insert(tipsterAttributions).values({
      tipsterUserId: tipsterUser!.id,
      referredUserId: fanUser!.id,
      promoCodeUsed: "INACT5",
      status: "trial_5d",
    });

    expect(await tipsterProfileForUser(db, tipsterUser!.id)).toBeNull();

    const paidRes = await handleInvoicePaid(db, {
      userId: fanUser!.id,
      stripeInvoiceId: "in_inactive_tipster",
      grossCentavos: 29900,
      vatCentavos: 4124,
      gatewayFeeCentavos: 1500,
      paidAt: now,
    });
    expect(paidRes.commissionCentavos).toBeNull();
    const ledgerRows = await db.select().from(tipsterCommissionLedger);
    expect(ledgerRows).toHaveLength(0);

    // auth_account: índice único (provider_id, account_id) + borrado de tokens OAuth
    await db.insert(authUser).values([
      { id: "au_1", name: "Uno", email: "uno@example.com" },
      { id: "au_2", name: "Dos", email: "dos@example.com" },
    ]);
    await db.insert(authAccount).values({
      id: "acc_1",
      accountId: "google_sub_123",
      providerId: "google",
      userId: "au_1",
      accessToken: "ya29.secret",
      refreshToken: "1//refresh-secret",
      idToken: "eyJ.id-token",
    });
    await scrubOAuthAccountTokens(db, "acc_1");
    const [scrubbed] = await db.select().from(authAccount).where(eq(authAccount.id, "acc_1"));
    expect(scrubbed).toMatchObject({
      accessToken: null,
      refreshToken: null,
      idToken: null,
    });

    await expect(
      db.insert(authAccount).values({
        id: "acc_2",
        accountId: "google_sub_123",
        providerId: "google",
        userId: "au_2",
      }),
    ).rejects.toSatisfy((err: unknown) => {
      const detail = `${String(err)} ${err && typeof err === "object" && "cause" in err ? String(err.cause) : ""}`;
      return detail.includes("auth_account_provider_account_uq") || detail.includes("unique");
    });
  });

  it("SEC-17: syncSubscription ignora user_id huérfano, cancela correos de prueba al pagar y fija baseUrl confiable", async () => {
    const [socio] = await db.insert(users).values({ email: "trial-to-paid@example.com" }).returning();
    const rowEnding = await claimEmail(db, {
      userId: socio!.id,
      kind: "trial_ending",
      sendAt: new Date(now.getTime() + 5 * 86_400_000),
    });
    await markEmail(db, rowEnding!, { status: "scheduled", providerId: "re_msg_ending" });

    const canceledProviderIds: string[] = [];
    const fakeMailer = {
      send: async () => ({ id: "re_1" }),
      cancel: async (id: string) => {
        canceledProviderIds.push(id);
      },
    };
    const deps: WebhookDeps = {
      now: () => now,
      getInvoiceFeeCentavos: async () => 1200,
      cancelScheduledTrialEmails: (uid) => cancelTrialEmails(db, fakeMailer, uid),
    };

    // 1. user_id inválido o inexistente se ignora sin error 500 de llave foránea
    const orphanMsg = await processStripeEvent(
      db,
      {
        id: "evt_orphan_sub",
        type: "customer.subscription.created",
        created: Math.floor(now.getTime() / 1000),
        data: {
          object: {
            id: "sub_orphan",
            customer: "cus_orphan",
            status: "active",
            metadata: { user_id: "00000000-0000-4000-8000-000000000999" },
          },
        },
      },
      deps,
    );
    expect(orphanMsg).toContain("ignorada");
    expect(await db.select().from(subscriptions)).toHaveLength(0);

    // 2. Conversión real cancela el correo programado de fin de prueba en Resend y en PostgreSQL
    const paidMsg = await processStripeEvent(
      db,
      {
        id: "evt_paid_sub",
        type: "customer.subscription.created",
        created: Math.floor(now.getTime() / 1000),
        data: {
          object: {
            id: "sub_real",
            customer: "cus_real",
            status: "active",
            metadata: { user_id: socio!.id },
            items: {
              data: [
                {
                  current_period_start: Math.floor(now.getTime() / 1000),
                  current_period_end: Math.floor(now.getTime() / 1000) + 30 * 86_400,
                  price: { unit_amount: 29900, recurring: { interval: "month" } },
                },
              ],
            },
          },
        },
      },
      deps,
    );
    expect(paidMsg).toBe("suscripción active");
    expect(canceledProviderIds).toEqual(["re_msg_ending"]);
    expect(await listScheduledEmails(db, socio!.id, ["trial_ending", "trial_ended"])).toHaveLength(0);

    // 3. trustedAppBaseUrl no confía en request.url falsificado en producción
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_URL", "");
    expect(() => trustedAppBaseUrl(new Request("https://evil.example/api/billing/checkout"))).toThrow(
      /BETTER_AUTH_URL/,
    );
    vi.stubEnv("BETTER_AUTH_URL", "https://pitchlab.mx/app");
    expect(trustedAppBaseUrl(new Request("https://evil.example/api/billing/checkout"))).toBe(
      "https://pitchlab.mx",
    );
  });

  it("SEC-18: neutraliza fórmulas CSV, exige HTTPS/timestamps en Wayback y bloquea path traversal en snapshots", async () => {
    expect(sanitizeCsvCell("=CMD|' /C calc'!A0")).toBe("'=CMD|' /C calc'!A0");
    expect(sanitizeCsvCell("  +SUM(A1:A2)")).toBe("'  +SUM(A1:A2)");
    expect(sanitizeCsvCell("@IMPORTXML(A1,\"//a\")")).toBe("'@IMPORTXML(A1,\"\"//a\"\")");
    expect(sanitizeCsvCell("América -1.5")).toBe("América -1.5");

    const requestedUrls: string[] = [];
    const fakeCdxFetch = (async (url: string) => {
      requestedUrls.push(String(url));
      return new Response(
        JSON.stringify([
          ["urlkey", "timestamp", "original", "mimetype", "statuscode"],
          ["", "20250520123045", "https://understat.com/league/EPL/2024", "text/html", "200"],
          ["", "20250520../../evil", "https://understat.com/league/EPL/2024", "text/html", "200"],
        ]),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const snaps = await listUnderstatSnapshots("EPL", 2024, { retries: 0, fetchImpl: fakeCdxFetch });
    expect(requestedUrls[0]?.startsWith("https://web.archive.org/")).toBe(true);
    expect(snaps).toEqual([
      {
        timestamp: "20250520123045",
        url: "https://web.archive.org/web/20250520123045id_/https://understat.com/league/EPL/2024",
      },
    ]);
    await expect(listUnderstatSnapshots("EPL/../../evil", 2024, { retries: 0, fetchImpl: fakeCdxFetch })).rejects.toThrow(
      /Parámetros inválidos/,
    );

    expect(() => writeSnapshotFiles("/tmp/snapshots", {} as never, "../../etc/passwd")).toThrow(
      /Fecha de snapshot inválida/,
    );
  });
});
