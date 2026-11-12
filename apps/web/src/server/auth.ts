/**
 * Autenticación con Better Auth (ADR-010).
 *
 * - Enlace mágico por correo: Resend si existe RESEND_API_KEY; en desarrollo el enlace se
 *   imprime en la consola del servidor.
 * - Google y Apple: solo si existen sus credenciales.
 * - Al crear la cuenta se crea (o se liga por correo) el perfil en `users`.
 *
 * Se activa con DATABASE_URL y BETTER_AUTH_SECRET; sin ellos `getAuth()` devuelve null y la
 * app sigue con el acceso por código de beta.
 */
import { randomBytes } from "node:crypto";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { captcha } from "better-auth/plugins/captcha";
import { magicLink } from "better-auth/plugins/magic-link";
import { eq } from "@pitchlab/db";
import {
  authAccount,
  authSession,
  authUser,
  authVerification,
  createDb,
  users,
  type Db,
} from "@pitchlab/db";

import { twitterCredentials, twitterUserInfo } from "./twitter";

export type SendEmail = (to: string, subject: string, html: string) => Promise<void>;

export function resendSender(apiKey: string, from: string): SendEmail {
  return async (to, subject, html) => {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) throw new Error(`Resend respondió ${res.status}`);
  };
}

const consoleSender: SendEmail = async (to, subject, html) => {
  const link = html.match(/href="([^"]+)"/)?.[1];
  console.info(`[auth] ${subject} para ${to}: ${link ?? html}`);
};

/** Liga la cuenta de Better Auth con el perfil de PitchLab (`users`) por correo. */
export async function linkProfile(db: Db, account: { id: string; email: string; name: string }): Promise<void> {
  const email = account.email.trim().toLowerCase();
  const [existing] = await db.select({ id: users.id, authUserId: users.authUserId })
    .from(users).where(eq(users.email, email));
  if (existing) {
    if (!existing.authUserId) {
      await db.update(users).set({ authUserId: account.id }).where(eq(users.id, existing.id));
    }
    return;
  }
  // Código de referido propio (SOCIO-XXXX); se reintenta si choca con uno existente.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const referralCode = `SOCIO-${randomBytes(3).toString("hex").toUpperCase()}`;
    const inserted = await db
      .insert(users)
      .values({ email, authUserId: account.id, displayName: account.name || null, referralCode })
      .onConflictDoNothing()
      .returning({ id: users.id });
    if (inserted.length) return;
    const [byEmail] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (byEmail) return;
  }
  throw new Error("No se pudo asignar un código de referido único");
}

export function pitchLabAuthAdapter(db: Db) {
  return drizzleAdapter(db, {
    provider: "pg",
    schema: { user: authUser, session: authSession, account: authAccount, verification: authVerification },
  });
}

export function createAuth(options: {
  db: Db;
  secret: string;
  baseURL: string;
  sendEmail: SendEmail;
  google?: { clientId: string; clientSecret: string };
  apple?: { clientId: string; clientSecret: string };
  twitter?: { clientId: string; clientSecret: string };
  /** Clave secreta de Cloudflare Turnstile: exige el token al pedir el enlace mágico. */
  turnstileSecret?: string;
}) {
  const socialProviders: BetterAuthOptions["socialProviders"] = {};
  if (options.google) socialProviders.google = options.google;
  if (options.apple) socialProviders.apple = options.apple;
  if (options.twitter) {
    socialProviders.twitter = {
      ...options.twitter,
      disableSignUp: true,
      disableDefaultScope: true,
      scope: ["users.read", "tweet.read"],
      getUserInfo: twitterUserInfo,
    };
  }
  const turnstile = options.turnstileSecret
    ? [
        captcha({
          provider: "cloudflare-turnstile",
          secretKey: options.turnstileSecret,
          endpoints: ["/sign-in/magic-link"],
          expectedAction: "magic_link",
        }),
      ]
    : [];

  return betterAuth({
    secret: options.secret,
    baseURL: options.baseURL,
    database: pitchLabAuthAdapter(options.db),
    socialProviders,
    account: {
      accountLinking: {
        enabled: true,
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const linkingX = ctx.path === "/link-social" && ctx.body?.provider === "twitter";
        if (linkingX && !options.twitter) throw new APIError("SERVICE_UNAVAILABLE");
        if (
          (ctx.path === "/sign-in/social" && ctx.body?.provider === "twitter") ||
          (linkingX && ctx.request) ||
          (ctx.path === "/unlink-account" && ctx.body?.providerId === "twitter")
        ) {
          throw new APIError("FORBIDDEN", { message: "Conecta X desde tu perfil." });
        }
      }),
    },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    plugins: [
      ...turnstile,
      magicLink({
        expiresIn: 15 * 60,
        sendMagicLink: async ({ email, url }) => {
          await options.sendEmail(
            email,
            "Tu acceso a PitchLab",
            `<p>Entra a PitchLab con este enlace (vence en 15 minutos):</p><p><a href="${url}">Entrar a PitchLab</a></p><p>Si no lo pediste, ignora este correo.</p>`,
          );
        },
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await linkProfile(options.db, { id: user.id, email: user.email, name: user.name });
          },
        },
      },
    },
  });
}

export type PitchLabAuth = ReturnType<typeof createAuth>;

/** ¿La app corre en tu propia PC? (`http://localhost` o `http://127.0.0.1`, nunca https). */
export function isLocalBaseURL(url: string): boolean {
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url);
}

let cached: PitchLabAuth | null | undefined;

/** Instancia según el entorno; null si faltan DATABASE_URL o BETTER_AUTH_SECRET. */
export function getAuth(): PitchLabAuth | null {
  if (cached !== undefined) return cached;
  const url = process.env.DATABASE_URL;
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!url || !secret) {
    cached = null;
    return cached;
  }
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_EMAIL_FROM ?? "PitchLab <acceso@pitchlab.mx>";
  const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  // En tu PC (build de producción en localhost) el enlace sale en la consola del servidor.
  if (!resendKey && process.env.NODE_ENV === "production" && !isLocalBaseURL(baseURL)) {
    throw new Error("RESEND_API_KEY es obligatoria en producción para enviar enlaces de acceso.");
  }
  const pair = (id?: string, secretValue?: string) =>
    id && secretValue ? { clientId: id, clientSecret: secretValue } : undefined;
  cached = createAuth({
    db: createDb(url) as unknown as Db,
    secret,
    baseURL,
    sendEmail: resendKey ? resendSender(resendKey, from) : consoleSender,
    google: pair(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET),
    apple: pair(process.env.APPLE_CLIENT_ID, process.env.APPLE_CLIENT_SECRET),
    twitter: twitterCredentials(),
    // Solo con las dos claves: si falta la pública, el navegador no podría mandar el token.
    turnstileSecret:
      process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
        ? process.env.TURNSTILE_SECRET_KEY
        : undefined,
  });
  return cached;
}
