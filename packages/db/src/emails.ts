/**
 * Registro de correos transaccionales (Resend) y preferencia de avisos de la bitácora.
 * El envío en sí vive en `apps/web/src/server/mailer.ts`; aquí solo se guarda qué se mandó.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "./billing";
import { scheduledEmails, userPreferences } from "./schema";

export type ScheduledEmailKind = "welcome" | "trial_ending" | "trial_ended";

/**
 * Reserva el correo de esta persona y tipo. Devuelve el id de la fila, o null si ya estaba
 * reservado (así un reintento del registro nunca manda dos veces el mismo correo).
 */
export async function claimEmail(
  db: Db,
  input: { userId: string; kind: ScheduledEmailKind; sendAt: Date },
): Promise<string | null> {
  const [row] = await db
    .insert(scheduledEmails)
    .values({ userId: input.userId, kind: input.kind, sendAt: input.sendAt })
    .onConflictDoNothing({ target: [scheduledEmails.userId, scheduledEmails.kind] })
    .returning({ id: scheduledEmails.id });
  return row?.id ?? null;
}

export async function markEmail(
  db: Db,
  id: string,
  update: { status: "scheduled" | "sent" | "canceled" | "failed"; providerId?: string | null },
): Promise<void> {
  await db
    .update(scheduledEmails)
    .set({ status: update.status, ...(update.providerId !== undefined ? { providerId: update.providerId } : {}) })
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
