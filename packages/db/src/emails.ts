/**
 * Registro de correos transaccionales (Resend) y preferencia de avisos de la bitácora.
 * El envío en sí vive en `apps/web/src/server/mailer.ts`; aquí solo se guarda qué se mandó.
 */
import { and, asc, desc, eq, gte, inArray, isNotNull, lt, lte } from "drizzle-orm";
import type { Db } from "./billing";
import { scheduledEmails, sealedPicks, userPreferences, users, watchlist } from "./schema";

export type ScheduledEmailKind =
  | "welcome"
  | "trial_ending"
  | "trial_ended"
  | "payment_receipt"
  | "renewal_reminder"
  | "access_expired"
  | "transfer_rejected"
  | "referral_signed_up"
  | "tipster_activated"
  | "content_removed"
  | "weekly_digest"
  | "monthly_record";

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
  weeklyDigest?: boolean;
  monthlyRecord?: boolean;
}

export async function getEmailPreferences(db: Db, userId: string): Promise<EmailPreferences> {
  const [row] = await db
    .select({
      pickResults: userPreferences.emailPickResults,
      weeklyDigest: userPreferences.emailWeeklyDigest,
      monthlyRecord: userPreferences.emailMonthlyRecord,
    })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId));
  return {
    pickResults: row?.pickResults ?? false,
    weeklyDigest: row?.weeklyDigest ?? false,
    monthlyRecord: row?.monthlyRecord ?? false,
  };
}

export async function setEmailPreferences(
  db: Db,
  userId: string,
  prefs: Partial<EmailPreferences>,
): Promise<void> {
  await db
    .insert(userPreferences)
    .values({
      userId,
      emailPickResults: prefs.pickResults ?? false,
      emailWeeklyDigest: prefs.weeklyDigest ?? false,
      emailMonthlyRecord: prefs.monthlyRecord ?? false,
    })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: {
        ...(prefs.pickResults !== undefined ? { emailPickResults: prefs.pickResults } : {}),
        ...(prefs.weeklyDigest !== undefined ? { emailWeeklyDigest: prefs.weeklyDigest } : {}),
        ...(prefs.monthlyRecord !== undefined ? { emailMonthlyRecord: prefs.monthlyRecord } : {}),
        updatedAt: new Date(),
      },
    });
}

export interface EmailSubscriber {
  userId: string;
  email: string;
  displayName: string | null;
  handle: string | null;
  oddsFormat: "american" | "decimal";
  favoriteLeagues: string[];
  showInRanking: boolean;
}

/** Suscriptores activos que aceptaron recibir el resumen semanal o mensual. */
export async function listEmailSubscribers(
  db: Db,
  kind: "weekly_digest" | "monthly_record",
): Promise<EmailSubscriber[]> {
  const flagCol =
    kind === "weekly_digest" ? userPreferences.emailWeeklyDigest : userPreferences.emailMonthlyRecord;
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
      handle: users.handle,
      oddsFormat: userPreferences.oddsFormat,
      favoriteLeagues: userPreferences.favoriteLeagues,
      showInRanking: userPreferences.showInRanking,
    })
    .from(userPreferences)
    .innerJoin(users, eq(users.id, userPreferences.userId))
    .where(
      and(
        eq(flagCol, true),
        isNotNull(users.authUserId),
        isNotNull(users.termsAcceptedAt),
        eq(users.isAdult, true),
      ),
    );
  return rows.map((r) => ({
    userId: r.userId,
    email: r.email,
    displayName: r.displayName,
    handle: r.handle,
    oddsFormat: r.oddsFormat === "decimal" ? "decimal" : "american",
    favoriteLeagues: Array.isArray(r.favoriteLeagues) ? r.favoriteLeagues : [],
    showInRanking: r.showInRanking,
  }));
}

export async function listWatchedGameIds(db: Db, userId: string): Promise<string[]> {
  const rows = await db.select({ gameId: watchlist.gameId }).from(watchlist).where(eq(watchlist.userId, userId));
  return rows.map((r) => r.gameId);
}

export interface SettledMonthPickRow {
  id: string;
  leagueLabel: string;
  status: "won" | "lost" | "void";
  units: number;
  userDecimal: number;
  clvPct: number | null;
  settledAt: Date | null;
}

export async function listSettledPicksBetween(
  db: Db,
  userId: string,
  startInclusive: Date,
  endExclusive: Date,
): Promise<SettledMonthPickRow[]> {
  const rows = await db
    .select({
      id: sealedPicks.id,
      leagueLabel: sealedPicks.leagueLabel,
      status: sealedPicks.status,
      units: sealedPicks.units,
      userDecimal: sealedPicks.userDecimal,
      clvPct: sealedPicks.clvPct,
      settledAt: sealedPicks.settledAt,
    })
    .from(sealedPicks)
    .where(
      and(
        eq(sealedPicks.userId, userId),
        inArray(sealedPicks.status, ["won", "lost", "void"]),
        isNotNull(sealedPicks.settledAt),
        gte(sealedPicks.settledAt, startInclusive),
        lt(sealedPicks.settledAt, endExclusive),
      ),
    )
    .orderBy(desc(sealedPicks.settledAt));

  return rows.map((r) => ({
    id: r.id,
    leagueLabel: r.leagueLabel,
    status: (r.status === "won" || r.status === "lost" ? r.status : "void") as "won" | "lost" | "void",
    units: Number(r.units),
    userDecimal: Number(r.userDecimal),
    clvPct: r.clvPct == null ? null : Number(r.clvPct),
    settledAt: r.settledAt,
  }));
}

export async function applyEmailUnsubscribe(
  db: Db,
  userId: string,
  kind: "weekly_digest" | "monthly_record" | "all",
): Promise<void> {
  const update =
    kind === "weekly_digest"
      ? { emailWeeklyDigest: false }
      : kind === "monthly_record"
        ? { emailMonthlyRecord: false }
        : {
            emailWeeklyDigest: false,
            emailMonthlyRecord: false,
            emailPickResults: false,
            emailValueAlerts: false,
            emailBeforeMatch: false,
          };
  await db
    .insert(userPreferences)
    .values({ userId, ...update, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { ...update, updatedAt: new Date() },
    });
}
