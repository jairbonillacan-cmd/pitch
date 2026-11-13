/**
 * Registro de correos transaccionales (Resend) y preferencia de avisos de la bitácora.
 * El envío en sí vive en `apps/web/src/server/mailer.ts`; aquí solo se guarda qué se mandó.
 */
import { and, asc, eq, inArray, lte } from "drizzle-orm";
import type { Db } from "./billing";
import { scheduledEmails, userPreferences, users } from "./schema";

export type ScheduledEmailKind =
  | "welcome"
  | "trial_ending"
  | "trial_ended"
  | "payment_receipt"
  | "renewal_reminder"
  | "access_expired"
  | "transfer_rejected";

export type ScheduledEmailStatus = "pending" | "scheduled" | "sent" | "canceled" | "failed";

/**
 * Reserva el correo de esta persona, tipo y ciclo (`cycleKey`). Devuelve el id de la fila,
 * o null si ya estaba reservado (así un reintento nunca manda dos veces el mismo correo).
 */
export async function claimEmail(
  db: Db,
  input: {
    userId: string;
    kind: ScheduledEmailKind;
    sendAt: Date;
    cycleKey?: string;
    status?: ScheduledEmailStatus;
  },
): Promise<string | null> {
  const cycleKey = input.cycleKey?.trim() || "default";
  const [row] = await db
    .insert(scheduledEmails)
    .values({
      userId: input.userId,
      kind: input.kind,
      cycleKey,
      sendAt: input.sendAt,
      status: input.status ?? "pending",
    })
    .onConflictDoNothing({ target: [scheduledEmails.userId, scheduledEmails.kind, scheduledEmails.cycleKey] })
    .returning({ id: scheduledEmails.id });
  return row?.id ?? null;
}

export async function markEmail(
  db: Db,
  id: string,
  update: { status: ScheduledEmailStatus; providerId?: string | null; sendAt?: Date },
): Promise<void> {
  await db
    .update(scheduledEmails)
    .set({
      status: update.status,
      ...(update.providerId !== undefined ? { providerId: update.providerId } : {}),
      ...(update.sendAt !== undefined ? { sendAt: update.sendAt } : {}),
    })
    .where(eq(scheduledEmails.id, id));
}

/** Libera la reserva cuando el envío falló, para que un reintento pueda mandarlo. */
export async function releaseEmail(db: Db, id: string): Promise<void> {
  await db.delete(scheduledEmails).where(eq(scheduledEmails.id, id));
}

/** Correos que siguen programados en Resend (se pueden cancelar). */
export async function listScheduledEmails(
  db: Db,
  userId: string,
  kinds?: readonly ScheduledEmailKind[],
): Promise<Array<{ id: string; kind: string; providerId: string | null }>> {
  return db
    .select({ id: scheduledEmails.id, kind: scheduledEmails.kind, providerId: scheduledEmails.providerId })
    .from(scheduledEmails)
    .where(
      and(
        eq(scheduledEmails.userId, userId),
        eq(scheduledEmails.status, "scheduled"),
        ...(kinds ? [inArray(scheduledEmails.kind, [...kinds])] : []),
      ),
    );
}

/** Correos pendientes en cola local o ya programados en Resend para poder cancelarlos si cambia el acceso. */
export async function listActiveEmailReservations(
  db: Db,
  userId: string,
  kinds?: readonly ScheduledEmailKind[],
): Promise<Array<{ id: string; kind: string; status: string; providerId: string | null; cycleKey: string }>> {
  return db
    .select({
      id: scheduledEmails.id,
      kind: scheduledEmails.kind,
      status: scheduledEmails.status,
      providerId: scheduledEmails.providerId,
      cycleKey: scheduledEmails.cycleKey,
    })
    .from(scheduledEmails)
    .where(
      and(
        eq(scheduledEmails.userId, userId),
        inArray(scheduledEmails.status, ["pending", "scheduled"]),
        ...(kinds ? [inArray(scheduledEmails.kind, [...kinds])] : []),
      ),
    );
}

/** Correos en estado `pending` cuya fecha `sendAt` ya entró dentro de la ventana límite (e.g. +28 días para Resend). */
export async function listDuePendingEmails(
  db: Db,
  maxSendAt: Date,
  limit = 50,
): Promise<
  Array<{
    id: string;
    userId: string;
    kind: string;
    cycleKey: string;
    sendAt: Date;
    email: string;
    displayName: string | null;
    handle: string | null;
  }>
> {
  return db
    .select({
      id: scheduledEmails.id,
      userId: scheduledEmails.userId,
      kind: scheduledEmails.kind,
      cycleKey: scheduledEmails.cycleKey,
      sendAt: scheduledEmails.sendAt,
      email: users.email,
      displayName: users.displayName,
      handle: users.handle,
    })
    .from(scheduledEmails)
    .innerJoin(users, eq(users.id, scheduledEmails.userId))
    .where(and(eq(scheduledEmails.status, "pending"), lte(scheduledEmails.sendAt, maxSendAt)))
    .orderBy(asc(scheduledEmails.sendAt))
    .limit(limit);
}

export interface EmailPreferences {
  pickResults: boolean;
}

export async function getEmailPreferences(db: Db, userId: string): Promise<EmailPreferences> {
  const [row] = await db
    .select({ pickResults: userPreferences.emailPickResults })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId));
  return { pickResults: row?.pickResults ?? false };
}

export async function setEmailPreferences(db: Db, userId: string, prefs: EmailPreferences): Promise<void> {
  await db
    .insert(userPreferences)
    .values({ userId, emailPickResults: prefs.pickResults })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { emailPickResults: prefs.pickResults, updatedAt: new Date() },
    });
}
