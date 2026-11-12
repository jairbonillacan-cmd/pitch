import type { Metadata } from "next";
import { createDb, sql, users, type Db } from "@pitchlab/db";
import { MEMBERSHIP_SPEC, normalizeReferralCode } from "@pitchlab/ui";

let cachedDb: Db | null = null;

function getReadOnlyDb(): Db | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  cachedDb ??= createDb(url) as unknown as Db;
  return cachedDb;
}

function sanitizeCleanHandle(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .trim()
    .replace(/^@+/, "")
    .replace(/[^a-zA-Z0-9_.-]/g, "")
    .slice(0, 28);
  return cleaned.length > 0 ? cleaned : null;
}

/** Consulta de solo lectura por users.referralCode (sin distinguir mayúsculas). Nunca escribe en la base. */
export async function lookupReferrerHandleByCode(
  db: Db,
  normalizedCode: string,
): Promise<string | null> {
  const [row] = await db
    .select({ handle: users.handle })
    .from(users)
    .where(sql`upper(${users.referralCode}) = ${normalizedCode}`)
    .limit(1);
  return sanitizeCleanHandle(row?.handle);
}

/** Envuelve la consulta de invitador con la conexión de solo lectura configurada. */
export async function lookupReferrerHandleForInvite(
  normalizedCode: string,
  dbOverride?: Db | null,
): Promise<string | null> {
  const db = dbOverride !== undefined ? dbOverride : getReadOnlyDb();
  if (!db) return null;
  try {
    return await lookupReferrerHandleByCode(db, normalizedCode);
  } catch (err) {
    void err;
    return null;
  }
}

export interface ResolvedShortInvite {
  valid: boolean;
  code: string | null;
  handle: string | null;
  redirectTo: string;
}

export async function resolveShortInviteTarget(
  rawCode: string | null | undefined,
  options?: {
    accountsEnabled?: boolean;
    db?: Db | null;
    extraQuery?: Record<string, string | string[] | undefined>;
  },
): Promise<ResolvedShortInvite> {
  const extra = new URLSearchParams();
  if (options?.extraQuery) {
    for (const [key, raw] of Object.entries(options.extraQuery)) {
      if (key === "code" || key === "from" || raw === undefined) continue;
      if (Array.isArray(raw)) {
        for (const item of raw) {
          if (item !== undefined) extra.append(key, item);
        }
      } else {
        extra.append(key, raw);
      }
    }
  }

  const code = normalizeReferralCode(rawCode);
  if (!code) {
    const qs = extra.toString();
    return {
      valid: false,
      code: null,
      handle: null,
      redirectTo: qs ? `/precio?${qs}` : "/precio",
    };
  }

  const accountsEnabled =
    options?.accountsEnabled ?? Boolean(process.env.DATABASE_URL);
  let handle: string | null = null;

  if (accountsEnabled) {
    const db = options?.db !== undefined ? options.db : getReadOnlyDb();
    if (db) {
      try {
        handle = await lookupReferrerHandleByCode(db, code);
      } catch (err) {
        void err;
        handle = null;
      }
    }
  }

  const search = new URLSearchParams({ code });
  if (handle) {
    search.set("from", handle);
  }
  for (const [key, value] of extra.entries()) {
    search.append(key, value);
  }

  return {
    valid: true,
    code,
    handle,
    redirectTo: `/pricing/referral?${search.toString()}`,
  };
}

export function resolveOgDisplayHandle(input: {
  code: string;
  dbHandle: string | null;
  explicitFrom?: string | null;
  accountsEnabled: boolean;
}): string | null {
  if (input.accountsEnabled) {
    return sanitizeCleanHandle(input.dbHandle);
  }
  const explicit = sanitizeCleanHandle(input.explicitFrom);
  if (explicit) return explicit;
  if (input.dbHandle) return sanitizeCleanHandle(input.dbHandle);
  if (input.code === "JAIR-2611") {
    return "jair";
  }
  return null;
}

export function buildInviteShareMetadata(input: {
  code: string | null;
  handle: string | null;
}): Metadata {
  const baseUrl = process.env.BETTER_AUTH_URL ?? "https://pitchlab.mx";
  const trialDays = MEMBERSHIP_SPEC.referralTrialDays;
  const firstMonthMxn = MEMBERSHIP_SPEC.referralFriendFirstMonthMxn;
  const bothDays = MEMBERSHIP_SPEC.referralBothRewardDays;

  if (!input.code) {
    return {
      metadataBase: new URL(baseUrl),
      title: "Invitación · PitchLab Ultra",
      description: `${trialDays} días sin costo en PitchLab Ultra.`,
      robots: {
        index: false,
        follow: false,
        googleBot: { index: false, follow: false },
      },
    };
  }

  const title = input.handle
    ? `@${input.handle} te invita a PitchLab: ${trialDays} días de PitchLab Ultra`
    : `${trialDays} días de PitchLab Ultra · Invitación personal`;
  const description = `Sin cargo hoy. Luego $${firstMonthMxn} MXN tu primer mes y +${bothDays} días cuando pagas.`;
  const imagePath = `/i/${encodeURIComponent(input.code)}/opengraph-image`;

  return {
    metadataBase: new URL(baseUrl),
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${baseUrl}/i/${encodeURIComponent(input.code)}`,
      siteName: "PitchLab",
      locale: "es_MX",
      type: "website",
      images: [
        {
          url: imagePath,
          width: 1200,
          height: 630,
          alt: input.handle
            ? `Tarjeta Pase PitchLab Ultra de @${input.handle}, código ${input.code}`
            : `Tarjeta Pase PitchLab Ultra, código ${input.code}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imagePath],
    },
    robots: {
      index: false,
      follow: false,
      googleBot: { index: false, follow: false },
    },
  };
}
