/**
 * Quién está viendo y qué puede ver, una sola vez por petición.
 *
 * Dos llaves conviven:
 * - El PIN de la beta (cookie `pl_beta`): acceso completo, como hasta ahora.
 * - La cuenta (Better Auth): acceso completo si completó el paso 2 del registro y tiene el
 *   Pase vigente (prueba, días a favor o suscripción). Los correos de PITCHLAB_ADMIN_EMAILS
 *   siempre entran.
 */
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { createDb, hasActivePaseTotal, signupCompleted, type Db } from "@pitchlab/db";
import { getAuth } from "./auth";
import { getBetaCookieName, verifyBetaCookieToken } from "./beta-auth";
import { profileIdForAuthUser } from "./member-data";
import { isAdminEmail } from "./session-user";

export interface ViewerAccess {
  /** Por dónde entró: PIN de la beta, cuenta o nadie. */
  via: "beta" | "account" | "none";
  /** Con cuenta: ya guardó fecha de nacimiento y términos. */
  signupComplete: boolean;
  /** Puede ver todo (PIN, Pase vigente o administrador). */
  fullAccess: boolean;
}

const NONE: ViewerAccess = { via: "none", signupComplete: false, fullAccess: false };

let db: Db | null = null;

async function hasValidBetaCookie(): Promise<boolean> {
  try {
    const token = (await cookies()).get(getBetaCookieName())?.value;
    return await verifyBetaCookieToken(token);
  } catch (err) {
    // Sin PITCHLAB_BETA_CODE en producción no hay acceso por PIN, pero las cuentas siguen.
    void err;
    return false;
  }
}

export const getViewerAccess = cache(async (): Promise<ViewerAccess> => {
  if (await hasValidBetaCookie()) return { via: "beta", signupComplete: true, fullAccess: true };

  const auth = getAuth();
  const url = process.env.DATABASE_URL;
  if (!auth || !url) return NONE;
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return NONE;
    db ??= createDb(url) as unknown as Db;
    const userId = await profileIdForAuthUser(db, session.user.id);
    if (!userId) return { via: "account", signupComplete: false, fullAccess: false };
    const now = new Date();
    const [complete, pass] = await Promise.all([signupCompleted(db, userId), hasActivePaseTotal(db, userId, now)]);
    const admin = isAdminEmail(session.user.email);
    return { via: "account", signupComplete: complete, fullAccess: complete && (pass || admin) };
  } catch (err) {
    console.warn("[acceso] no se pudo leer la sesión:", err);
    return NONE;
  }
});
