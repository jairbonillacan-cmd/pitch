/**
 * Quién está viendo y qué puede ver, una sola vez por petición.
 *
 * Dos llaves conviven:
 * - El PIN de la beta (cookie `pl_beta`): acceso completo en modo preview.
 * - La cuenta (Better Auth): acceso completo si completó el paso 2 del registro y tiene el
 *   Pase vigente (prueba, días a favor o suscripción). Los correos verificados de
 *   `PITCHLAB_ADMIN_EMAILS` tienen privilegios de administración.
 */
import { cache } from "react";
import { cookies, headers } from "next/headers";
import {
  createDb,
  hasActivePaseTotal,
  isActiveTipstarUser,
  signupCompleted,
  suggestHandle,
  viewerProfile,
  type Db,
} from "@pitchlab/db";
import { getAuth } from "./auth";
import { getBetaCookieName, isBetaPinEnabled, verifyBetaCookieToken } from "./beta-auth";
import { profileIdForAuthUser } from "./member-data";
import { isAdminEmail } from "./session-user";

export interface ViewerAccess {
  /** Por dónde entró: PIN de la beta, cuenta o nadie. */
  via: "beta" | "account" | "none";
  /** Con cuenta: ya guardó nombre, usuario, fecha de nacimiento y términos. */
  signupComplete: boolean;
  /** Puede ver todo (PIN, Pase vigente o administrador verificado). */
  fullAccess: boolean;
  /** Cuenta verificada perteneciente a `PITCHLAB_ADMIN_EMAILS` con registro completo. */
  isAdmin: boolean;
  /** Cuenta con perfil activo en `tipstar_profiles` y registro completo. */
  isTipstar: boolean;
  /** Con cuenta: quién es (para la interfaz). Con PIN o sin sesión, null. */
  profile: AccountProfile | null;
}

/** Lo que la interfaz muestra del socio con cuenta. Nunca la fecha de nacimiento. */
export interface AccountProfile {
  handle: string | null;
  displayName: string;
  initials: string;
  referralCode: string | null;
  /** Sugerencia para el campo «Usuario» del paso 2 cuando aún no eligió uno. */
  suggestedHandle: string | null;
}

const NONE: ViewerAccess = {
  via: "none",
  signupComplete: false,
  fullAccess: false,
  isAdmin: false,
  isTipstar: false,
  profile: null,
};

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : (parts[0]?.[1] ?? "");
  return (first + last).toUpperCase() || "PL";
}

let db: Db | null = null;

async function hasValidBetaCookie(): Promise<boolean> {
  if (!isBetaPinEnabled()) return false;
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
        if (!userId) {
          return {
            via: "account",
            signupComplete: false,
            fullAccess: false,
            isAdmin: false,
            isTipstar: false,
            profile: null,
          };
        }
        const now = new Date();
        const [complete, pass, row, tipstar] = await Promise.all([
          signupCompleted(db, userId),
          hasActivePaseTotal(db, userId, now),
          viewerProfile(db, userId),
          isActiveTipstarUser(db, userId),
        ]);
        const verifiedAdmin = Boolean(session.user.emailVerified) && isAdminEmail(session.user.email);
        const displayName =
          row?.displayName?.trim() || session.user.name?.trim() || session.user.email.split("@")[0] || "Socio";
        const profile: AccountProfile = {
          handle: row?.handle ?? null,
          displayName,
          initials: initialsOf(displayName),
          referralCode: row?.referralCode ?? null,
          suggestedHandle: row?.handle ? null : await suggestHandle(db, displayName),
        };
        return {
          via: "account",
          signupComplete: complete,
          fullAccess: complete && (pass || verifiedAdmin),
          isAdmin: complete && verifiedAdmin,
          isTipstar: complete && tipstar,
          profile,
        };
      }
    } catch (err) {
      console.warn("[acceso] no se pudo leer la sesión:", err);
    }
  }

  if (await hasValidBetaCookie()) {
    return {
      via: "beta",
      signupComplete: true,
      fullAccess: true,
      isAdmin: false,
      isTipstar: false,
      profile: null,
    };
  }

  return NONE;
});
