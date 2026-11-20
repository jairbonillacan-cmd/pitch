import { createECDH, generateKeyPairSync, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  applyMigrations,
  completeSignup,
  createAccessCoupon,
  createSocialPost,
  eq,
  funnelEvents,
  pushSubscriptions,
  SIGNUP_CONSENT_VERSION,
  userPreferences,
  users,
  type Db,
} from "@pitchlab/db";
import manifest from "../app/manifest";
import { POST as postFunnel } from "../app/api/analytics/funnel/route";
import { GET as getAdminOverview } from "../app/api/admin/overview/route";
import { DELETE as deletePush, GET as getPush, POST as postPush } from "../app/api/me/push/route";
import { POST as postRedeem } from "../app/api/me/redeem/route";
import { POST as postTransfer } from "../app/api/me/transfers/route";
import { POST as postComment } from "../app/api/social/posts/[id]/comments/route";
import { resetAuthForTests, type PitchLabAuth } from "../src/server/auth";
import { resetRateLimitsForTests } from "../src/server/request-security";
import { setSessionDbForTests } from "../src/server/session-user";

let db: Db;
let counter = 0;

function createVapidKeys() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pubJwk = publicKey.export({ format: "jwk" }) as { x: string; y: string };
  const privJwk = privateKey.export({ format: "jwk" }) as { d: string };
  const pub = Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(pubJwk.x, "base64url"),
    Buffer.from(pubJwk.y, "base64url"),
  ]);
  return {
    publicKey: pub.toString("base64url"),
    privateKey: Buffer.from(privJwk.d, "base64url").toString("base64url"),
  };
}

function createPushSubscriptionMaterial() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    p256dh: ecdh.getPublicKey().toString("base64url"),
    auth: randomBytes(16).toString("base64url"),
  };
}

function mockSessionAs(user: { authUserId: string; email: string; displayName: string }) {
  resetAuthForTests({
    api: {
      getSession: async () => ({
        user: {
          id: user.authUserId,
          email: user.email,
          name: user.displayName,
          emailVerified: true,
        },
      }),
    },
  } as unknown as PitchLabAuth);
}

async function seedCompletedMember(opts: {
  handle: string;
  analyticsConsent: boolean;
}) {
  counter += 1;
  const authUserId = `auth-pwa-${counter}-${opts.handle}`;
  const email = `${opts.handle}.${counter}@example.test`;
  const displayName = `Socio ${opts.handle}`;
  const [row] = await db
    .insert(users)
    .values({
      authUserId,
      email,
      displayName,
    })
    .returning({ id: users.id });

  const userId = row!.id;
  await completeSignup(db, {
    userId,
    displayName,
    handle: opts.handle,
    birthDate: "1994-06-15",
    termsVersion: SIGNUP_CONSENT_VERSION,
    analyticsConsent: opts.analyticsConsent,
    marketingConsent: false,
    trial: {
      canonicalEmail: email,
      provider: "email",
      deviceFpHash: `fp-${opts.handle}-${counter}`,
      ipSubnetHash: `ip-${opts.handle}-${counter}`,
    },
    now: new Date(),
  });
  return { id: userId, authUserId, email, displayName, handle: opts.handle };
}

beforeAll(async () => {
  const client = new PGlite();
  await applyMigrations((sql) => client.exec(sql));
  db = drizzle(client) as unknown as Db;
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetAuthForTests();
  setSessionDbForTests(null);
  resetRateLimitsForTests();
});

describe("PWA Manifest, Service Worker y encabezados CSP", () => {
  it("expone manifest estable con íconos PNG reales y sw.js válido", () => {
    const m = manifest();
    expect(m.id).toBe("/");
    expect(m.start_url).toBe("/app");
    expect(m.display).toBe("standalone");
    expect(m.icons?.map((i) => i.sizes)).toEqual(["192x192", "512x512", "512x512"]);

    const iconsDir = path.resolve(process.cwd(), "public/brand/app-icons");
    expect(fs.existsSync(path.join(iconsDir, "icon-192.png"))).toBe(true);
    expect(fs.existsSync(path.join(iconsDir, "icon-512.png"))).toBe(true);
    expect(fs.existsSync(path.join(iconsDir, "icon-maskable-512.png"))).toBe(true);
    expect(fs.existsSync(path.join(iconsDir, "apple-touch-icon.png"))).toBe(true);

    const swSource = fs.readFileSync(path.resolve(process.cwd(), "public/sw.js"), "utf8");
    expect(swSource).toContain('addEventListener("push"');
    expect(swSource).toContain('addEventListener("notificationclick"');

    const nextCfg = fs.readFileSync(path.resolve(process.cwd(), "next.config.mjs"), "utf8");
    expect(nextCfg).toContain("worker-src 'self'");
    expect(nextCfg).toContain("manifest-src 'self'");
  });
});

describe("Web Push API y push social en respuestas de Comunidad", () => {
  it("POST/GET/DELETE /api/me/push gestiona suscripciones en Neon y sincroniza pushEnabled", async () => {
    const vapid = createVapidKeys();
    vi.stubEnv("DATABASE_URL", "postgresql://local/test");
    vi.stubEnv("BETTER_AUTH_SECRET", "secreto-pwa-test-al-menos-32-caracteres-valido!");
    vi.stubEnv("VAPID_PUBLIC_KEY", vapid.publicKey);
    vi.stubEnv("VAPID_PRIVATE_KEY", vapid.privateKey);
    vi.stubEnv("PITCHLAB_MONTH1_NO_CARD", "1");
    setSessionDbForTests(db);

    const socio = await seedCompletedMember({ handle: "push_socio_a", analyticsConsent: false });

    // Sin sesión -> 401
    expect((await getPush(new Request("http://localhost:3000/api/me/push"))).status).toBe(401);

    mockSessionAs(socio);

    // Endpoint no-HTTPS rechazado con 400
    const badRes = await postPush(
      new Request("http://localhost:3000/api/me/push", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({
          endpoint: "http://insecure.example/push",
          keys: createPushSubscriptionMaterial(),
        }),
      }),
    );
    expect(badRes.status).toBe(400);

    const keys = createPushSubscriptionMaterial();
    const okRes = await postPush(
      new Request("http://localhost:3000/api/me/push", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({
          endpoint: "https://push.example/device-1",
          keys,
          topics: { picks: true, live: true, social: true },
        }),
      }),
    );
    expect(okRes.status).toBe(201);

    const getRes = await getPush(new Request("http://localhost:3000/api/me/push"));
    expect(getRes.status).toBe(200);
    const getJson = (await getRes.json()) as {
      configured: boolean;
      vapidPublicKey: string;
      subscriptions: Array<{ endpoint: string }>;
    };
    expect(getJson.configured).toBe(true);
    expect(getJson.vapidPublicKey).toBe(vapid.publicKey);
    expect(getJson.subscriptions).toHaveLength(1);

    const [prefRow] = await db
      .select({ pushEnabled: userPreferences.pushEnabled })
      .from(userPreferences)
      .where(eq(userPreferences.userId, socio.id));
    expect(prefRow?.pushEnabled).toBe(true);

    const delRes = await deletePush(
      new Request("http://localhost:3000/api/me/push", {
        method: "DELETE",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ endpoint: "https://push.example/device-1" }),
      }),
    );
    expect(delRes.status).toBe(200);

    const [prefAfter] = await db
      .select({ pushEnabled: userPreferences.pushEnabled })
      .from(userPreferences)
      .where(eq(userPreferences.userId, socio.id));
    expect(prefAfter?.pushEnabled).toBe(false);
    expect(await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, socio.id))).toHaveLength(0);
  });

  it("POST /api/social/posts/[id]/comments envía Web Push tema social al autor pero nunca a quien comenta", async () => {
    const vapid = createVapidKeys();
    vi.stubEnv("DATABASE_URL", "postgresql://local/test");
    vi.stubEnv("BETTER_AUTH_SECRET", "secreto-pwa-test-al-menos-32-caracteres-valido!");
    vi.stubEnv("VAPID_PUBLIC_KEY", vapid.publicKey);
    vi.stubEnv("VAPID_PRIVATE_KEY", vapid.privateKey);
    setSessionDbForTests(db);

    const autor = await seedCompletedMember({ handle: "autor_push_hilo", analyticsConsent: false });
    const lector = await seedCompletedMember({ handle: "lector_push_hilo", analyticsConsent: false });

    const createdPost = await createSocialPost(
      db,
      autor.id,
      {
        body: "Veo valor en el under del clásico regio para este sábado.",
        leagueLabel: "Liga MX",
        matchLabel: "Tigres vs Rayados",
        pickBadge: "Bajas 2.5",
        originType: "Bitácora Propia",
      },
      new Date(),
    );
    expect(createdPost.ok).toBe(true);
    const postId = createdPost.ok ? createdPost.id : "";

    mockSessionAs(autor);
    await postPush(
      new Request("http://localhost:3000/api/me/push", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({
          endpoint: "https://push.example/autor-phone",
          keys: createPushSubscriptionMaterial(),
          topics: { social: true },
        }),
      }),
    );

    mockSessionAs(lector);
    await postPush(
      new Request("http://localhost:3000/api/me/push", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({
          endpoint: "https://push.example/lector-phone",
          keys: createPushSubscriptionMaterial(),
          topics: { social: true },
        }),
      }),
    );

    const sentTargets: string[] = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input) => {
      sentTargets.push(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
      return new Response(null, { status: 201 });
    }) as typeof fetch;

    try {
      const replyRes = await postComment(
        new Request(`http://localhost:3000/api/social/posts/${postId}/comments`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://localhost:3000" },
          body: JSON.stringify({
            body: `Buena lectura, también me gusta @${lector.handle} @${autor.handle}`,
          }),
        }),
        { params: Promise.resolve({ id: postId }) },
      );
      expect(replyRes.status).toBe(201);
      expect(sentTargets).toEqual(["https://push.example/autor-phone"]);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

describe("Embudo propio estricto por analyticsConsent y resumen en /api/admin/overview", () => {
  it("bloquea registro sin consentimiento y registra etapas reales solo para quien aceptó + expone resumen en /api/admin/overview", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://local/test");
    vi.stubEnv("BETTER_AUTH_SECRET", "secreto-pwa-test-al-menos-32-caracteres-valido!");
    vi.stubEnv("PITCHLAB_ADMIN_EMAILS", "admin.embudo@example.test");
    setSessionDbForTests(db);

    const socioSinConsent = await seedCompletedMember({
      handle: "sin_consent_funnel",
      analyticsConsent: false,
    });
    const socioConConsent = await seedCompletedMember({
      handle: "con_consent_funnel",
      analyticsConsent: true,
    });
    const adminUser = await seedCompletedMember({
      handle: "admin_embudo",
      analyticsConsent: false,
    });
    await db
      .update(users)
      .set({ email: "admin.embudo@example.test" })
      .where(eq(users.id, adminUser.id));

    // 1) Anónimo sin consent -> recorded: false y 0 inserciones
    const noConsentRes = await postFunnel(
      new Request("http://localhost:3000/api/analytics/funnel", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ stage: "landing", consent: false, anonymousSessionId: "anon-noconsent-01" }),
      }),
    );
    expect(noConsentRes.status).toBe(200);
    expect(await noConsentRes.json()).toEqual({ ok: true, recorded: false });

    // Etapa reservada para rutas confiables del servidor -> 400
    const forbiddenStage = await postFunnel(
      new Request("http://localhost:3000/api/analytics/funnel", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ stage: "coupon_redeemed", consent: true, anonymousSessionId: "anon-hack-01" }),
      }),
    );
    expect(forbiddenStage.status).toBe(400);

    // 2) Anónimo CON consent -> landing + signup_step1
    const landingRes = await postFunnel(
      new Request("http://localhost:3000/api/analytics/funnel", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ stage: "landing", consent: true, anonymousSessionId: "anon-consented-1001" }),
      }),
    );
    expect(landingRes.status).toBe(201);

    const step1Res = await postFunnel(
      new Request("http://localhost:3000/api/analytics/funnel", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ stage: "signup_step1", consent: true, anonymousSessionId: "anon-consented-1001" }),
      }),
    );
    expect(step1Res.status).toBe(201);

    // Cupón para probar /api/me/redeem con vs sin consent
    const c1 = await createAccessCoupon(db, {
      adminUserId: adminUser.id,
      adminEmail: "admin.embudo@example.test",
      code: "FUNNEL_CONSENT",
      days: 7,
      maxRedemptions: 5,
    });
    expect(c1.ok).toBe(true);

    // 3) Socio SIN analyticsConsent hace SPEI y canjea cupón -> cero eventos propios nuevos
    mockSessionAs(socioSinConsent);
    const speiBlocked = await postTransfer(
      new Request("http://localhost:3000/api/me/transfers", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ planInterval: "monthly", originBank: "BBVA", reportedAmountMxn: 299 }),
      }),
    );
    expect(speiBlocked.status).toBe(201);
    const redeemNoConsent = await postRedeem(
      new Request("http://localhost:3000/api/me/redeem", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ code: "FUNNEL_CONSENT" }),
      }),
    );
    expect(redeemNoConsent.status).toBe(200);

    // 4) Socio CON analyticsConsent hace SPEI y canjea cupón -> registra spei_transfer y coupon_redeemed
    mockSessionAs(socioConConsent);
    const speiOk = await postTransfer(
      new Request("http://localhost:3000/api/me/transfers", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ planInterval: "annual", originBank: "Nu", reportedAmountMxn: 2390 }),
      }),
    );
    expect(speiOk.status).toBe(201);

    const redeemOk = await postRedeem(
      new Request("http://localhost:3000/api/me/redeem", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ code: "FUNNEL_CONSENT" }),
      }),
    );
    expect(redeemOk.status).toBe(200);

    const allEvents = await db.select().from(funnelEvents);
    expect(allEvents.map((e) => e.eventName).sort()).toEqual([
      "coupon_redeemed",
      "landing",
      "signup_step1",
      "spei_transfer",
    ]);

    // 5) Admin overview devuelve embudo completo
    mockSessionAs({
      authUserId: adminUser.authUserId,
      email: "admin.embudo@example.test",
      displayName: adminUser.displayName,
    });
    const adminRes = await getAdminOverview(new Request("http://localhost:3000/api/admin/overview"));
    expect(adminRes.status).toBe(200);
    const adminJson = (await adminRes.json()) as {
      funnel: {
        windowDays: number;
        stages: Array<{ stage: string; count30d: number; conversionFromLandingPct: number | null }>;
      };
    };
    expect(adminJson.funnel.windowDays).toBe(30);
    const byStage = new Map(adminJson.funnel.stages.map((s) => [s.stage, s]));
    expect(byStage.get("landing")?.count30d).toBe(1);
    expect(byStage.get("signup_step1")?.count30d).toBe(1);
    expect(byStage.get("spei_transfer")?.count30d).toBe(1);
    expect(byStage.get("coupon_redeemed")?.count30d).toBe(1);
  });
});
