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
import { appendFile, mkdir } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { captcha } from "better-auth/plugins/captcha";
import { magicLink } from "better-auth/plugins/magic-link";
import { isDisposableEmailDomain } from "@pitchlab/contracts";
import { eq } from "@pitchlab/db";
import { renderEmail } from "@pitchlab/emails";
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

export type SendEmail = (to: string, subject: string, html: string, text?: string) => Promise<void>;

export function resendSender(apiKey: string, from: string): SendEmail {
  return async (to, subject, html, text) => {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to, subject, html, text }),
    });
    if (!res.ok) throw new Error(`Resend respondió ${res.status}`);
  };
}

function localEmailLogLine(to: string, subject: string, html: string): string {
  const link = html.match(/href="([^"]+)"/)?.[1]?.replaceAll("&amp;", "&");
  return `[auth] ${subject} para ${to}: ${link ?? html}`;
}

const consoleSender: SendEmail = async (to, subject, html) => {
  console.info(localEmailLogLine(to, subject, html));
};

const local9990Sender: SendEmail = async (to, subject, html) => {
  const cwd = process.cwd();
  const root = basename(cwd) === "web" && basename(dirname(cwd)) === "apps" ? resolve(cwd, "../..") : cwd;
  const logDirectory = resolve(root, ".local");
  await mkdir(logDirectory, { recursive: true });
  await appendFile(resolve(logDirectory, "9990.log"), localEmailLogLine(to, subject, html) + "\n", "utf8");
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
        if (ctx.path === "/sign-in/magic-link") {
          const emailCandidate = typeof ctx.body?.email === "string" ? ctx.body.email : "";
          if (isDisposableEmailDomain(emailCandidate)) {
            throw new APIError("BAD_REQUEST", {
              message: "Usa un correo permanente para iniciar sesión.",
            });
          }
        }
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
          const { subject, html, text } = await renderEmail("magic-link", { url, minutes: 15 });
          await options.sendEmail(email, subject, html, text);
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

const FORBIDDEN_AUTH_SECRETS: ReadonlySet<string> = new Set([
  "reemplazar-con-secreto-aleatorio-de-32-caracteres-minimo",
  "reemplaza-con-32-caracteres-aleatorios-minimo",
  "dev-only-pitchlab-beta-cookie-secret-32chars",
  "changeme-changeme-changeme-changeme-32",
]);

function isForbiddenAuthSecret(secret: string): boolean {
  return (
    FORBIDDEN_AUTH_SECRETS.has(secret) ||
    /^(reemplaz|replace[-_]|changeme|example[-_]|dev-only-)/i.test(secret)
  );
}

let cached: PitchLabAuth | null | undefined;

export function resetAuthForTests(instance?: PitchLabAuth | null): void {
  cached = instance;
}

/** Instancia según el entorno; null si faltan DATABASE_URL o BETTER_AUTH_SECRET. */
export function getAuth(): PitchLabAuth | null {
  if (cached !== undefined) return cached;
  const url = process.env.DATABASE_URL;
  const rawSecret = process.env.BETTER_AUTH_SECRET;
  if (!url || !rawSecret) {
    cached = null;
    return cached;
  }
  const secret = rawSecret.trim();
  if (secret.length < 32 || (process.env.NODE_ENV === "production" && isForbiddenAuthSecret(secret))) {
    throw new Error("BETTER_AUTH_SECRET debe ser un secreto válido de al menos 32 caracteres.");
  }

  const isProd = process.env.NODE_ENV === "production";
  const rawBaseURL = process.env.BETTER_AUTH_URL?.trim();
  if (isProd && !rawBaseURL) {
    throw new Error("BETTER_AUTH_URL es obligatoria en producción.");
  }
  if (isProd && process.env.VERCEL && rawBaseURL && isLocalBaseURL(rawBaseURL)) {
    throw new Error("BETTER_AUTH_URL no puede apuntar a localhost en un despliegue remoto.");
  }

  const baseURL = rawBaseURL || "http://localhost:3000";
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.AUTH_EMAIL_FROM ?? "PitchLab <acceso@pitchlab.mx>";
  const allowLocalSender =
    isLocalBaseURL(baseURL) && !process.env.VERCEL && (!isProd || Boolean(rawBaseURL));

  if (!resendKey && !allowLocalSender) {
    throw new Error("RESEND_API_KEY es obligatoria en producción para enviar enlaces de acceso.");
  }

  const sendEmail: SendEmail =
    allowLocalSender && new URL(baseURL).port === "9990"
      ? local9990Sender
      : resendKey
        ? resendSender(resendKey, from)
        : consoleSender;

  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY?.trim();
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  if (
    isProd &&
    !allowLocalSender &&
    process.env.PITCHLAB_ALLOW_NO_TURNSTILE_IN_PROD !== "1" &&
    (!turnstileSecret || !turnstileSiteKey)
  ) {
    throw new Error(
      "TURNSTILE_SECRET_KEY y NEXT_PUBLIC_TURNSTILE_SITE_KEY son obligatorias en producción.",
    );
  }

  const pair = (id?: string, secretValue?: string) =>
    id && secretValue ? { clientId: id, clientSecret: secretValue } : undefined;
  cached = createAuth({
    db: createDb(url) as unknown as Db,
    secret,
    baseURL,
    sendEmail,
    google: pair(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET),
    apple: pair(process.env.APPLE_CLIENT_ID, process.env.APPLE_CLIENT_SECRET),
    twitter: twitterCredentials(),
    // Solo con las dos claves: si falta la pública, el navegador no podría mandar el token.
    turnstileSecret: turnstileSecret && turnstileSiteKey ? turnstileSecret : undefined,
  });
  return cached;
}
