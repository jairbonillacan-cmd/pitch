import { cache } from "react";
import { cookies, headers } from "next/headers";
import {
  createDb,
  hasActivePaseTotal,
  isActiveTipsterUser,
  signupCompleted,
  suggestHandle,
  viewerProfile,
  type Db,
} from "@pitchlab/db";
import { getAuth } from "./auth";
import { getBetaCookieName, isBetaPinEnabled, verifyBetaCookieToken } from "./beta-auth";
import { profileIdForAuthUser } from "./member-data";
import { logSecurityEvent } from "./safe-logger";
import { isAdminEmail } from "./session-user";

export interface ViewerAccess {
  via: "beta" | "account" | "none";
  signupComplete: boolean;
  fullAccess: boolean;
  isAdmin: boolean;
  isTipster: boolean;
  profile: AccountProfile | null;
}

export interface AccountProfile {
  handle: string | null;
  displayName: string;
  initials: string;
  avatarUrl: string | null;
  referralCode: string | null;
  suggestedHandle: string | null;
}

const NONE: ViewerAccess = {
  via: "none",
  signupComplete: false,
  fullAccess: false,
  isAdmin: false,
  isTipster: false,
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
    void err;
    return false;
  }
}

export const getViewerAccountUserId = cache(async (): Promise<string | null> => {
  const auth = getAuth();
  const url = process.env.DATABASE_URL;
  if (!auth || !url) return null;
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return null;
    db ??= createDb(url);
    return await profileIdForAuthUser(db, session.user.id);
  } catch (err) {
    void err;
    return null;
  }
});

export const getViewerAccess = cache(async (): Promise<ViewerAccess> => {
  const auth = getAuth();
  const url = process.env.DATABASE_URL;
  if (auth && url) {
    try {
      const session = await auth.api.getSession({ headers: await headers() });
      if (session) {
        db ??= createDb(url);
        const userId = await profileIdForAuthUser(db, session.user.id);
        if (!userId) {
          return {
            via: "account",
            signupComplete: false,
            fullAccess: false,
            isAdmin: false,
            isTipster: false,
            profile: null,
          };
        }
        const now = new Date();
        const [complete, pass, row, tipster] = await Promise.all([
          signupCompleted(db, userId),
          hasActivePaseTotal(db, userId, now),
          viewerProfile(db, userId),
          isActiveTipsterUser(db, userId),
        ]);
        const verifiedAdmin = Boolean(session.user.emailVerified) && isAdminEmail(session.user.email);
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
          fullAccess: complete && (pass || verifiedAdmin),
          isAdmin: complete && verifiedAdmin,
          isTipster: complete && tipster,
          profile,
        };
      }
    } catch (err) {
      logSecurityEvent("warn", "viewer_access_session_read_failed", { error: err });
    }
  }

  if (await hasValidBetaCookie()) {
    return {
      via: "beta",
      signupComplete: true,
      fullAccess: true,
      isAdmin: false,
      isTipster: false,
      profile: null,
    };
  }

  return NONE;
});
