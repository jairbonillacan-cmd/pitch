/**
 * Paso 2 del registro (F4): fecha de nacimiento, consentimientos con versión, atribución del
 * referido y la prueba de 7 días sin tarjeta (Mes 1), con el escudo de un solo correo por prueba.
 */
import { createHash } from "node:crypto";
import { and, countDistinct, eq, gte, isNotNull, ne, sql } from "drizzle-orm";
import { grantDays, type Db } from "./billing";
import { referralGrants, trialFingerprints, users } from "./schema";

export const TRIAL_M1_DAYS = 7;
export const MIN_SIGNUP_AGE = 18;
export const SIGNUP_CONSENT_VERSION = "2026-11-11";
export const MAX_TRIALS_PER_DEVICE = 2;
export const MAX_TRIALS_PER_SUBNET_24H = 3;

/** Usuario: 3 a 20 caracteres, minúsculas, números y guion bajo; empieza con letra. */
export const HANDLE_PATTERN = /^[a-z][a-z0-9_]{2,19}$/;

/**
 * Usuarios que no se pueden tomar: rutas y palabras del sistema, y los perfiles de ejemplo
 * que ya existen en la app (Comunidad, ranking y tipstars).
 */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  "admin", "administrador", "api", "app", "ayuda", "cuenta", "entrar", "help", "login",
  "me", "mod", "moderador", "null", "pitchlab", "pitch_lab", "precio", "registro", "root",
  "signup", "soporte", "staff", "support", "system", "tipstar", "undefined", "yo",
  "andres_l", "carlos_quant", "diego_tactico", "jair_founder", "luis_f", "mariana_t",
  "paola_c", "rodrigo_p", "socio_pl", "sofia_nfl", "valeria_g",
]);

/** Quita la @, espacios y mayúsculas. */
export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

export type HandleCheck = { ok: true; handle: string } | { ok: false; reason: "formato" | "reservado" };

export function checkHandleFormat(raw: string): HandleCheck {
  const handle = normalizeHandle(raw);
  if (!HANDLE_PATTERN.test(handle)) return { ok: false, reason: "formato" };
  if (RESERVED_HANDLES.has(handle)) return { ok: false, reason: "reservado" };
  return { ok: true, handle };
}

/** ¿Está libre? `exceptUserId` permite conservar el propio. */
export async function isHandleAvailable(db: Db, handle: string, exceptUserId?: string): Promise<boolean> {
  const where = exceptUserId
    ? and(sql`lower(${users.handle}) = ${handle}`, ne(users.id, exceptUserId))
    : sql`lower(${users.handle}) = ${handle}`;
  const [row] = await db.select({ id: users.id }).from(users).where(where);
  return !row;
}

/** Reconoce la colisión del usuario en Postgres.js y PGlite. */
export function isHandleConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const databaseError = "cause" in error ? error.cause : error;
  if (!databaseError || typeof databaseError !== "object" || !("code" in databaseError)) return false;
  if (databaseError.code !== "23505") return false;
  const constraint = "constraint_name" in databaseError ? databaseError.constraint_name :
    "constraint" in databaseError ? databaseError.constraint : null;
  return constraint === "users_handle_unique";
}

/** Sugerencia libre a partir del nombre o del correo (para prellenar el campo). */
export async function suggestHandle(db: Db, base: string): Promise<string> {
  const ascii = base
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split("@")[0]!
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^[^a-z]+/, "")
    .replace(/_+$/, "")
    .slice(0, 16);
  const stem = ascii.length >= 3 ? ascii : `socio${ascii}`;
  for (let i = 0; i < 20; i += 1) {
    const candidate = i === 0 ? stem : `${stem.slice(0, 16)}${i + 1}`;
    if (checkHandleFormat(candidate).ok && (await isHandleAvailable(db, candidate))) return candidate;
  }
  return `${stem.slice(0, 12)}${Math.floor(1000 + Math.random() * 9000)}`;
}

/** Nombre visible: 2 a 40 caracteres, sin saltos de línea. */
export function cleanDisplayName(raw: string): string | null {
  const name = raw.replace(/\s+/g, " ").trim();
  return name.length >= 2 && name.length <= 40 ? name : null;
}

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
  /** Nombre visible y usuario (@handle) elegidos en el paso 2. */
  displayName: string;
  handle: string;
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
    unknownDevice?: boolean;
    unknownSubnet?: boolean;
    turnstileRayId?: string | null;
  };
  now: Date;
}

export type CompleteSignupResult =
  | { ok: true; trial: "concedida" | "ya_usada" | "apagada"; referral: "registrado" | "ninguno" }
  | {
      ok: false;
      reason:
        | "fecha_invalida"
        | "menor_de_edad"
        | "sin_terminos"
        | "nombre_invalido"
        | "usuario_invalido"
        | "usuario_reservado"
        | "usuario_ocupado";
    };

export async function completeSignup(db: Db, input: CompleteSignupInput): Promise<CompleteSignupResult> {
  const age = ageFromIsoDate(input.birthDate, input.now);
  if (age === null || age > 120) return { ok: false, reason: "fecha_invalida" };
  if (age < MIN_SIGNUP_AGE) return { ok: false, reason: "menor_de_edad" };
  if (!input.termsVersion.trim()) return { ok: false, reason: "sin_terminos" };
  const displayName = cleanDisplayName(input.displayName);
  if (!displayName) return { ok: false, reason: "nombre_invalido" };
  const handleCheck = checkHandleFormat(input.handle);
  if (!handleCheck.ok) {
    return { ok: false, reason: handleCheck.reason === "reservado" ? "usuario_reservado" : "usuario_invalido" };
  }
  try {
    return await db.transaction(async (tx): Promise<CompleteSignupResult> => {
      const [current] = await tx
        .select({
          birthDate: users.birthDate,
          referralCode: users.referralCode,
          isAdult: users.isAdult,
          handle: users.handle,
          termsAcceptedAt: users.termsAcceptedAt,
        })
        .from(users)
        .where(eq(users.id, input.userId))
        .for("update");
      if (!current) return { ok: false, reason: "fecha_invalida" };

      if (current.isAdult && current.handle && current.termsAcceptedAt) {
        const [fingerprint] = input.trial
          ? await tx
              .select({ userId: trialFingerprints.userId, decision: trialFingerprints.decision })
              .from(trialFingerprints)
              .where(eq(trialFingerprints.canonicalEmailSha256, sha256Hex(input.trial.canonicalEmail)))
          : [];
        const trial = fingerprint
          ? fingerprint.userId === input.userId && fingerprint.decision === "granted"
            ? "concedida"
            : "ya_usada"
          : "apagada";
        return { ok: true, trial, referral: "ninguno" };
      }

      if (!(await isHandleAvailable(tx, handleCheck.handle, input.userId))) {
        return { ok: false, reason: "usuario_ocupado" };
      }

      await tx.update(users)
        .set({
          displayName,
          handle: handleCheck.handle,
          birthDate: current.birthDate ?? input.birthDate,
          isAdult: true,
          termsVersion: input.termsVersion,
          termsAcceptedAt: input.now,
          analyticsConsent: input.analyticsConsent,
          marketingConsent: input.marketingConsent,
        })
        .where(eq(users.id, input.userId));

      const referral = await attributeReferral(tx, input.userId, input.referralCode, current.referralCode);
      return grantSignupTrial(tx, input, referral);
    });
  } catch (error) {
    if (isHandleConflict(error)) return { ok: false, reason: "usuario_ocupado" };
    throw error;
  }
}

async function grantSignupTrial(
  db: Db,
  input: CompleteSignupInput,
  referral: "registrado" | "ninguno",
): Promise<CompleteSignupResult> {
  if (!input.trial) return { ok: true, trial: "apagada", referral };

  const emailSha = sha256Hex(input.trial.canonicalEmail);
  await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`trial:${emailSha}`})::bigint)`);
  if (!input.trial.unknownDevice && input.trial.deviceFpHash) {
    await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`trial_dev:${input.trial.deviceFpHash}`})::bigint)`);
  }

  const [seen] = await db
    .select({ userId: trialFingerprints.userId, decision: trialFingerprints.decision })
    .from(trialFingerprints)
    .where(eq(trialFingerprints.canonicalEmailSha256, emailSha));
  if (seen) {
    if (seen.userId !== input.userId || seen.decision !== "granted") {
      return { ok: true, trial: "ya_usada", referral };
    }
  } else {
    if (!input.trial.unknownDevice && input.trial.deviceFpHash) {
      const [devRow] = await db
        .select({ n: countDistinct(trialFingerprints.userId) })
        .from(trialFingerprints)
        .where(
          and(
            eq(trialFingerprints.deviceFpHash, input.trial.deviceFpHash),
            eq(trialFingerprints.decision, "granted"),
            ne(trialFingerprints.userId, input.userId),
          ),
        );
      if (Number(devRow?.n ?? 0) >= MAX_TRIALS_PER_DEVICE) {
        await db
          .insert(trialFingerprints)
          .values({
            userId: input.userId,
            canonicalEmail: input.trial.canonicalEmail,
            canonicalEmailSha256: emailSha,
            oauthProvider: input.trial.provider,
            deviceFpHash: input.trial.deviceFpHash,
            ipSubnetHash: input.trial.ipSubnetHash,
            turnstileRayId: input.trial.turnstileRayId ?? null,
            trialPhase: "month1_no_card",
            decision: "denied_duplicate_device",
            createdAt: input.now,
          })
          .onConflictDoNothing({ target: trialFingerprints.canonicalEmailSha256 });
        return { ok: true, trial: "ya_usada", referral };
      }
    }

    if (!input.trial.unknownSubnet && input.trial.ipSubnetHash) {
      const since24h = new Date(input.now.getTime() - 24 * 3_600_000);
      const [subRow] = await db
        .select({ n: countDistinct(trialFingerprints.userId) })
        .from(trialFingerprints)
        .where(
          and(
            eq(trialFingerprints.ipSubnetHash, input.trial.ipSubnetHash),
            eq(trialFingerprints.decision, "granted"),
            gte(trialFingerprints.createdAt, since24h),
            ne(trialFingerprints.userId, input.userId),
          ),
        );
      if (Number(subRow?.n ?? 0) >= MAX_TRIALS_PER_SUBNET_24H) {
        await db
          .insert(trialFingerprints)
          .values({
            userId: input.userId,
            canonicalEmail: input.trial.canonicalEmail,
            canonicalEmailSha256: emailSha,
            oauthProvider: input.trial.provider,
            deviceFpHash: input.trial.deviceFpHash,
            ipSubnetHash: input.trial.ipSubnetHash,
            turnstileRayId: input.trial.turnstileRayId ?? null,
            trialPhase: "month1_no_card",
            decision: "denied_subnet_rate",
            createdAt: input.now,
          })
          .onConflictDoNothing({ target: trialFingerprints.canonicalEmailSha256 });
        return { ok: true, trial: "ya_usada", referral };
      }
    }

    const inserted = await db
      .insert(trialFingerprints)
      .values({
        userId: input.userId,
        canonicalEmail: input.trial.canonicalEmail,
        canonicalEmailSha256: emailSha,
        oauthProvider: input.trial.provider,
        deviceFpHash: input.trial.deviceFpHash,
        ipSubnetHash: input.trial.ipSubnetHash,
        turnstileRayId: input.trial.turnstileRayId ?? null,
        trialPhase: "month1_no_card",
        decision: "granted",
        createdAt: input.now,
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

/** ¿Ya completó el paso 2 (mayor de edad, términos y usuario elegido)? */
export async function signupCompleted(db: Db, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, userId),
        eq(users.isAdult, true),
        isNotNull(users.handle),
        isNotNull(users.termsAcceptedAt),
      ),
    );
  return Boolean(row);
}

export interface ViewerProfile {
  handle: string | null;
  displayName: string | null;
  email: string;
  referralCode: string | null;
  avatarUrl: string | null;
}

/** Datos públicos del socio para la interfaz (nunca la fecha de nacimiento). */
export async function viewerProfile(db: Db, userId: string): Promise<ViewerProfile | null> {
  const [row] = await db
    .select({
      handle: users.handle,
      displayName: users.displayName,
      email: users.email,
      referralCode: users.referralCode,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(eq(users.id, userId));
  return row ?? null;
}
