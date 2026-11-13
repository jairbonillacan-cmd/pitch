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
import {
  createDb,
  hasActivePaseTotal,
  signupCompleted,
  suggestHandle,
  viewerProfile,
  type Db,
} from "@pitchlab/db";
import { getAuth } from "./auth";
import { getBetaCookieName, verifyBetaCookieToken } from "./beta-auth";
import { profileIdForAuthUser } from "./member-data";
import { isAdminEmail } from "./session-user";

export interface ViewerAccess {
  /** Por dónde entró: PIN de la beta, cuenta o nadie. */
  via: "beta" | "account" | "none";
  /** Con cuenta: ya guardó nombre, usuario, fecha de nacimiento y términos. */
  signupComplete: boolean;
  /** Puede ver todo (PIN, Pase vigente o administrador). */
  fullAccess: boolean;
  /** Con cuenta: si su correo pertenece a PITCHLAB_ADMIN_EMAILS. */
  isAdmin?: boolean;
  /** Con cuenta: quién es (para la interfaz). Con PIN o sin sesión, null. */
  profile: AccountProfile | null;
}

/** Lo que la interfaz muestra del socio con cuenta. Nunca la fecha de nacimiento. */
export interface AccountProfile {
  handle: string | null;
  displayName: string;
  initials: string;
  avatarUrl: string | null;
  referralCode: string | null;
  /** Sugerencia para el campo «Usuario» del paso 2 cuando aún no eligió uno. */
  suggestedHandle: string | null;
}

const NONE: ViewerAccess = { via: "none", signupComplete: false, fullAccess: false, isAdmin: false, profile: null };

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : (parts[0]?.[1] ?? "");
  return (first + last).toUpperCase() || "PL";
}

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
  const auth = getAuth();
  const url = process.env.DATABASE_URL;
  if (auth && url) {
    try {
      const session = await auth.api.getSession({ headers: await headers() });
      if (session) {
        db ??= createDb(url) as unknown as Db;
        const userId = await profileIdForAuthUser(db, session.user.id);
        const admin = isAdminEmail(session.user.email);
        if (!userId) {
          return { via: "account", signupComplete: false, fullAccess: false, isAdmin: admin, profile: null };
        }
        const now = new Date();
        const [complete, pass, row] = await Promise.all([
          signupCompleted(db, userId),
          hasActivePaseTotal(db, userId, now),
          viewerProfile(db, userId),
        ]);
        const displayName =
          row?.displayName?.trim() || session.user.name?.trim() || session.user.email.split("@")[0] || "Socio";
        const profile: AccountProfile = {
          handle: row?.handle ?? null,
          displayName,
          initials: initialsOf(displayName),
          avatarUrl: row?.avatarUrl ?? null,
          referralCode: row?.referralCode ?? null,
          suggestedHandle: row?.handle ? null : await suggestHandle(db, displayName),
        };
        return {
          via: "account",
          signupComplete: complete,
          fullAccess: complete && (pass || admin),
          isAdmin: admin,
          profile,
        };
      }
    } catch (err) {
      console.warn("[acceso] no se pudo leer la sesión:", err);
    }
  }

  if (await hasValidBetaCookie()) {
    return { via: "beta", signupComplete: true, fullAccess: true, isAdmin: false, profile: null };
  }

  return NONE;
});
