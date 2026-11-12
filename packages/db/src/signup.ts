/**
 * Paso 2 del registro (F4): fecha de nacimiento, consentimientos con versión, atribución del
 * referido y la prueba de 7 días sin tarjeta (Mes 1), con el escudo de un solo correo por prueba.
 */
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { grantDays, type Db } from "./billing";
import { referralGrants, trialFingerprints, users } from "./schema";

export const TRIAL_M1_DAYS = 7;
export const MIN_SIGNUP_AGE = 18;

export const sha256Hex = (value: string): string => createHash("sha256").update(value).digest("hex");

/** Años cumplidos a `today` (UTC) para una fecha `AAAA-MM-DD`; null si la fecha no existe. */
export function ageFromIsoDate(iso: string, today: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  let age = today.getUTCFullYear() - y;
  const beforeBirthday =
    today.getUTCMonth() < mo - 1 || (today.getUTCMonth() === mo - 1 && today.getUTCDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}

export interface CompleteSignupInput {
  userId: string;
  birthDate: string;
  termsVersion: string;
  analyticsConsent: boolean;
  marketingConsent: boolean;
  /** Código de quien invitó (`?code=`), si llegó con uno. */
  referralCode?: string | null;
  /** Prueba sin tarjeta: solo si la bandera «Mes 1 sin tarjeta» está encendida. */
  trial: null | {
    canonicalEmail: string;
    provider: "google" | "apple" | "email" | null;
    deviceFpHash: string;
    ipSubnetHash: string;
  };
  now: Date;
}

export type CompleteSignupResult =
  | { ok: true; trial: "concedida" | "ya_usada" | "apagada"; referral: "registrado" | "ninguno" }
  | { ok: false; reason: "fecha_invalida" | "menor_de_edad" | "sin_terminos" };

export async function completeSignup(db: Db, input: CompleteSignupInput): Promise<CompleteSignupResult> {
  const age = ageFromIsoDate(input.birthDate, input.now);
  if (age === null || age > 120) return { ok: false, reason: "fecha_invalida" };
  if (age < MIN_SIGNUP_AGE) return { ok: false, reason: "menor_de_edad" };
  if (!input.termsVersion.trim()) return { ok: false, reason: "sin_terminos" };

  const [current] = await db
    .select({ birthDate: users.birthDate, referralCode: users.referralCode })
    .from(users)
    .where(eq(users.id, input.userId));
  if (!current) return { ok: false, reason: "fecha_invalida" };

  await db
    .update(users)
    .set({
      // La primera fecha registrada no se reescribe: evita «cambiar de edad» después.
      birthDate: current.birthDate ?? input.birthDate,
      isAdult: true,
      termsVersion: input.termsVersion,
      termsAcceptedAt: input.now,
      analyticsConsent: input.analyticsConsent,
      marketingConsent: input.marketingConsent,
    })
    .where(eq(users.id, input.userId));

  const referral = await attributeReferral(db, input.userId, input.referralCode, current.referralCode);

  if (!input.trial) return { ok: true, trial: "apagada", referral };

  const emailSha = sha256Hex(input.trial.canonicalEmail);
  const [seen] = await db
    .select({ userId: trialFingerprints.userId })
    .from(trialFingerprints)
    .where(eq(trialFingerprints.canonicalEmailSha256, emailSha));
  if (seen && seen.userId !== input.userId) return { ok: true, trial: "ya_usada", referral };

  if (!seen) {
    const inserted = await db
      .insert(trialFingerprints)
      .values({
        userId: input.userId,
        canonicalEmail: input.trial.canonicalEmail,
        canonicalEmailSha256: emailSha,
        oauthProvider: input.trial.provider,
        deviceFpHash: input.trial.deviceFpHash,
        ipSubnetHash: input.trial.ipSubnetHash,
        trialPhase: "month1_no_card",
        decision: "granted",
      })
      .onConflictDoNothing({ target: trialFingerprints.canonicalEmailSha256 })
      .returning({ id: trialFingerprints.id });
    if (!inserted.length) return { ok: true, trial: "ya_usada", referral };
  }

  await grantDays(db, {
    userId: input.userId,
    sourceKind: "trial_m1_nocard",
    days: TRIAL_M1_DAYS,
    idempotencyKey: `trial_m1:${input.userId}`,
    now: input.now,
  });
  return { ok: true, trial: "concedida", referral };
}

async function attributeReferral(
  db: Db,
  userId: string,
  rawCode: string | null | undefined,
  ownCode: string | null,
): Promise<"registrado" | "ninguno"> {
  const code = (rawCode ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9-]{4,24}$/.test(code) || code === ownCode) return "ninguno";
  const [host] = await db.select({ id: users.id }).from(users).where(eq(users.referralCode, code));
  if (!host || host.id === userId) return "ninguno";
  const inserted = await db
    .insert(referralGrants)
    .values({ referrerUserId: host.id, referredUserId: userId, referralCodeUsed: code, status: "trial_started" })
    .onConflictDoNothing({ target: referralGrants.referredUserId })
    .returning({ id: referralGrants.id });
  return inserted.length ? "registrado" : "ninguno";
}

/** ¿Ya completó el paso 2 (mayor de edad y términos aceptados)? */
export async function signupCompleted(db: Db, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.isAdult, true)));
  return Boolean(row);
}
