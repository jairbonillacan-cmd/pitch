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
import { drizzleAdapter } from "better-auth/adapters/drizzle";
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
  const [existing] = await db.select().from(users).where(eq(users.email, email));
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

export function createAuth(options: {
  db: Db;
  secret: string;
  baseURL: string;
  sendEmail: SendEmail;
  google?: { clientId: string; clientSecret: string };
  apple?: { clientId: string; clientSecret: string };
}) {
  const socialProviders: BetterAuthOptions["socialProviders"] = {};
  if (options.google) socialProviders.google = options.google;
  if (options.apple) socialProviders.apple = options.apple;

  return betterAuth({
    secret: options.secret,
    baseURL: options.baseURL,
    database: drizzleAdapter(options.db, {
      provider: "pg",
      schema: { user: authUser, session: authSession, account: authAccount, verification: authVerification },
    }),
    socialProviders,
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    plugins: [
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
  if (!resendKey && process.env.NODE_ENV === "production") {
    throw new Error("RESEND_API_KEY es obligatoria en producción para enviar enlaces de acceso.");
  }
  const pair = (id?: string, secretValue?: string) =>
    id && secretValue ? { clientId: id, clientSecret: secretValue } : undefined;
  cached = createAuth({
    db: createDb(url) as unknown as Db,
    secret,
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    sendEmail: resendKey ? resendSender(resendKey, from) : consoleSender,
    google: pair(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET),
    apple: pair(process.env.APPLE_CLIENT_ID, process.env.APPLE_CLIENT_SECRET),
  });
  return cached;
}
