/**
 * Despacho de correos para el ciclo de transferencia SPEI, aprobaciones, rechazos y
 * liquidaciones manuales a tipsters (Beta 1.0).
 *
 * Respeta el límite máximo de 30 días de `scheduledAt` en Resend usando una ventana de
 * 28 días: cualquier recordatorio más lejano (ej. pase anual a 365 días) queda en
 * `scheduled_emails` con estado `pending` y el cron diario `/api/cron/tipster-payouts`
 * lo programa o envía en cuanto entra en ventana.
 */
import {
  accessUntil,
  and,
  claimEmail,
  eq,
  listActiveEmailReservations,
  listDuePendingEmails,
  lookupReferrerByReferredUserId,
  markEmail,
  releaseEmail,
  tipsterAttributions,
  tipsterProfiles,
  users,
  type ApproveTransferResult,
  type Db,
  type RejectTransferResult,
  type ScheduledEmailKind,
} from "@pitchlab/db";
import { renderEmail, siteUrl } from "@pitchlab/emails";
import { MEMBERSHIP_SPEC } from "@pitchlab/ui";
import { cancelTrialEmails } from "./account-emails";
import { firstName, formatLongDate } from "./email-format";
import { paymentMode } from "./billing/payment-mode";
import type { Mailer } from "./mailer";

const DAY_MS = 86_400_000;
const SCHEDULE_THRESHOLD_MS = 60_000;
const RESEND_WINDOW_MS = 28 * DAY_MS;

function formatMxnAmountLabel(centavos: number): string {
  const pesos = centavos / 100;
  return `$${pesos.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
}

function formatMonthYear(date: Date): string {
  return new Intl.DateTimeFormat("es-MX", {
    month: "long",
    year: "numeric",
    timeZone: "America/Mexico_City",
  }).format(date);
}

function formatPeriodRange(start: Date, end: Date): string {
  return `${formatLongDate(start)} – ${formatLongDate(end, true)}`;
}

async function cancelPreviousCycleEmails(db: Db, mailer: Mailer, userId: string): Promise<void> {
  const rows = await listActiveEmailReservations(db, userId, ["renewal_reminder", "access_expired"]);
  for (const row of rows) {
    try {
      if (row.providerId) await mailer.cancel(row.providerId);
      await markEmail(db, row.id, { status: "canceled" });
    } catch (error) {
      console.error(`[correo] no se pudo cancelar ${row.kind} (${row.cycleKey}):`, error);
    }
  }
}

async function reserveOrScheduleEmail(
  db: Db,
  mailer: Mailer,
  input: {
    userId: string;
    email: string;
    kind: ScheduledEmailKind;
    cycleKey: string;
    sendAt: Date;
    now: Date;
    build: () => Promise<{ subject: string; html: string; text: string }>;
  },
): Promise<void> {
  const rowId = await claimEmail(db, {
    userId: input.userId,
    kind: input.kind,
    cycleKey: input.cycleKey,
    sendAt: input.sendAt,
    status: "pending",
  });
  if (!rowId) return;

  const deltaMs = input.sendAt.getTime() - input.now.getTime();
  // Si falta más de 28 días (p. ej. pase anual), queda guardado como `pending` para que el cron diario lo tome luego.
  if (deltaMs > RESEND_WINDOW_MS) {
    return;
  }

  try {
    const { subject, html, text } = await input.build();
    const shouldSchedule = deltaMs > SCHEDULE_THRESHOLD_MS;
    const { id } = await mailer.send({
      to: input.email,
      subject,
      html,
      text,
      ...(shouldSchedule ? { scheduledAt: input.sendAt } : {}),
      idempotencyKey: `${input.kind}:${input.userId}:${input.cycleKey}`,
      tags: [{ name: "tipo", value: input.kind }],
    });
    await markEmail(db, rowId, { status: shouldSchedule ? "scheduled" : "sent", providerId: id });
  } catch (error) {
    console.error(`[correo] error enviando/programando ${input.kind}:`, error);
    await releaseEmail(db, rowId).catch((err) => void err);
  }
}

export async function sendTransferApprovedEmails(
  db: Db,
  mailer: Mailer,
  approved: Extract<ApproveTransferResult, { ok: true }>,
  now: Date,
): Promise<void> {
  if (approved.alreadyApproved) return;
  const { request, user, newAccessUntil, paidEffects } = approved;
  const baseUrl = siteUrl();
  const planName =
    request.planInterval === "annual"
      ? `${MEMBERSHIP_SPEC.name} anual`
      : `${MEMBERSHIP_SPEC.name} mensual`;
  const amountLabel = formatMxnAmountLabel(request.amountCentavosMxn);
  const name = firstName(user.displayName);
  const cycleKey = `transfer:${request.id}`;

  // 1. Cancelar avisos de prueba y ciclos previos antes de emitir los del nuevo ciclo.
  await cancelTrialEmails(db, mailer, user.id);
  await cancelPreviousCycleEmails(db, mailer, user.id);

  // 2. Recibo inmediato.
  const endsAt = newAccessUntil ?? new Date(now.getTime() + (request.planInterval === "annual" ? 365 : 30) * DAY_MS);
  await reserveOrScheduleEmail(db, mailer, {
    userId: user.id,
    email: user.email,
    kind: "payment_receipt",
    cycleKey,
    sendAt: now,
    now,
    build: () =>
      renderEmail("payment-receipt", {
        name,
        planName,
        amountLabel,
        paidOn: formatLongDate(now, true),
        periodLabel: formatPeriodRange(now, endsAt),
        paymentMethodLabel: "Transferencia SPEI",
        referenceCode: request.referenceCode,
        receiptUrl: `${baseUrl}/app/account?tab=plan`,
      }),
  });

  // 3. Recordatorio 3 días antes de vencer (si aún no estamos a menos de 1 hora).
  const reminderAt = new Date(endsAt.getTime() - 3 * DAY_MS);
  if (reminderAt.getTime() - now.getTime() > 3_600_000) {
    await reserveOrScheduleEmail(db, mailer, {
      userId: user.id,
      email: user.email,
      kind: "renewal_reminder",
      cycleKey,
      sendAt: reminderAt,
      now,
      build: () =>
        renderEmail("renewal-reminder", {
          name,
          planName,
          daysLeft: 3,
          renewsOn: formatLongDate(endsAt, true),
          amountLabel: formatMxnAmountLabel(
            request.planInterval === "annual" ? 239_000 : 29_900,
          ),
          paymentMode: "transfer",
          manageUrl: `${baseUrl}/app/account?tab=plan`,
        }),
    });
  }

  // 4. Aviso al vencer el pase.
  await reserveOrScheduleEmail(db, mailer, {
    userId: user.id,
    email: user.email,
    kind: "access_expired",
    cycleKey,
    sendAt: endsAt,
    now,
    build: () =>
      renderEmail("access-expired", {
        name,
        planName,
        paymentMode: "transfer",
        updateCardUrl: `${baseUrl}/app/account?tab=plan`,
      }),
  });

  // 5. Avisos de referido bilateral y embajador (si este fue el primer pago elegible).
  if (paidEffects.referralRewarded) {
    try {
      const ref = await lookupReferrerByReferredUserId(db, user.id);
      if (ref) {
        const refUntil = await accessUntil(db, ref.referrerUserId, now);
        const friendLabel = firstName(user.displayName) ?? (user.handle ? `@${user.handle}` : "tu invitado");
        const rewarded = await renderEmail("referral-rewarded", {
          name: firstName(ref.referrerName),
          friendName: friendLabel,
          planName: MEMBERSHIP_SPEC.name,
          accessUntil: formatLongDate(refUntil ?? now, true),
          referralsUrl: `${baseUrl}/app/account?tab=invite`,
        });
        await mailer.send({
          to: ref.referrerEmail,
          subject: rewarded.subject,
          html: rewarded.html,
          text: rewarded.text,
          idempotencyKey: `ref-rewarded:${request.id}`,
          tags: [{ name: "tipo", value: "referral_rewarded" }],
        });

        if (paidEffects.ambassadorBonus) {
          const amb = await renderEmail("referral-ambassador", {
            name: firstName(ref.referrerName),
            count: 5,
            bonusDays: 30,
            planName: MEMBERSHIP_SPEC.name,
            accessUntil: formatLongDate(refUntil ?? now, true),
            referralsUrl: `${baseUrl}/app/account?tab=invite`,
          });
          await mailer.send({
            to: ref.referrerEmail,
            subject: amb.subject,
            html: amb.html,
            text: amb.text,
            idempotencyKey: `ref-ambassador:${ref.referrerUserId}`,
            tags: [{ name: "tipo", value: "referral_ambassador" }],
          });
        }
      }
    } catch (error) {
      console.error("[correo] error enviando aviso de referido:", error);
    }
  }

  // 6. Aviso al tipster si se registró comisión.
  if (paidEffects.commissionCentavos !== null) {
    try {
      const [tip] = await db
        .select({
          email: users.email,
          displayName: users.displayName,
          promoCode: tipsterProfiles.promoCode,
        })
        .from(tipsterAttributions)
        .innerJoin(tipsterProfiles, eq(tipsterProfiles.userId, tipsterAttributions.tipsterUserId))
        .innerJoin(users, eq(users.id, tipsterProfiles.userId))
        .where(and(eq(tipsterAttributions.referredUserId, user.id), eq(tipsterProfiles.isActive, true)))
        .limit(1);

      if (tip) {
        const netCentavos = Math.round(request.amountCentavosMxn / 1.16);
        const payableDate = new Date(now.getTime() + 14 * DAY_MS);
        const rendered = await renderEmail("tipster-new-subscriber", {
          name: firstName(tip.displayName),
          promoCode: tip.promoCode,
          planName,
          commissionLabel: formatMxnAmountLabel(paidEffects.commissionCentavos),
          netLabel: formatMxnAmountLabel(netCentavos),
          payableOn: formatLongDate(payableDate, true),
          commissionsUrl: `${baseUrl}/app/tipster`,
        });
        await mailer.send({
          to: tip.email,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          idempotencyKey: `tipster-sub:${request.id}`,
          tags: [{ name: "tipo", value: "tipster_new_subscriber" }],
        });
      }
    } catch (error) {
      console.error("[correo] error enviando aviso al tipster:", error);
    }
  }
}

export async function sendTransferRejectedEmail(
  mailer: Mailer,
  rejected: Extract<RejectTransferResult, { ok: true }>,
): Promise<void> {
  const { request, user } = rejected;
  const planName =
    request.planInterval === "annual"
      ? `${MEMBERSHIP_SPEC.name} anual`
      : `${MEMBERSHIP_SPEC.name} mensual`;
  try {
    const rendered = await renderEmail("transfer-rejected", {
      name: firstName(user.displayName),
      planName,
      amountLabel: formatMxnAmountLabel(request.amountCentavosMxn),
      referenceCode: request.referenceCode,
      reason: request.rejectionReason ?? "No pudimos verificar el movimiento.",
      retryUrl: `${siteUrl()}/app/account?tab=plan`,
    });
    await mailer.send({
      to: user.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      idempotencyKey: `transfer-rejected:${request.id}`,
      tags: [{ name: "tipo", value: "transfer_rejected" }],
    });
  } catch (error) {
    console.error("[correo] error enviando aviso de rechazo SPEI:", error);
  }
}

export async function sendTipsterManualPayoutEmail(
  mailer: Mailer,
  input: {
    tipsterEmail: string;
    tipsterName: string | null;
    amountCentavos: number;
    paidAt: Date;
    reference: string;
  },
): Promise<void> {
  try {
    const rendered = await renderEmail("tipster-payout", {
      name: firstName(input.tipsterName),
      amountLabel: formatMxnAmountLabel(input.amountCentavos),
      periodLabel: formatMonthYear(input.paidAt),
      paidOn: formatLongDate(input.paidAt, true),
      referenceLabel: input.reference,
      detailUrl: `${siteUrl()}/app/tipster`,
    });
    await mailer.send({
      to: input.tipsterEmail,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      idempotencyKey: `tipster-payout:${input.reference}:${input.paidAt.getTime()}`,
      tags: [{ name: "tipo", value: "tipster_payout" }],
    });
  } catch (error) {
    console.error("[correo] error enviando liquidación manual a tipster:", error);
  }
}

/**
 * Toma correos en `scheduled_emails` con `status = 'pending'` que ya entraron a la ventana de
 * 28 días de Resend y los programa o envía en el momento.
 */
export async function dispatchDueScheduledEmails(
  db: Db,
  mailer: Mailer,
  now: Date = new Date(),
): Promise<number> {
  const maxSendAt = new Date(now.getTime() + RESEND_WINDOW_MS);
  const rows = await listDuePendingEmails(db, maxSendAt, 50);
  const mode = paymentMode();
  const baseUrl = siteUrl();
  let dispatched = 0;

  for (const row of rows) {
    try {
      let rendered: { subject: string; html: string; text: string } | null = null;
      const endsAt = await accessUntil(db, row.userId, now);
      const name = firstName(row.displayName);

      if (row.kind === "renewal_reminder") {
        const targetDate = endsAt ?? new Date(row.sendAt.getTime() + 3 * DAY_MS);
        const daysLeft = Math.max(1, Math.ceil((targetDate.getTime() - row.sendAt.getTime()) / DAY_MS));
        rendered = await renderEmail("renewal-reminder", {
          name,
          planName: MEMBERSHIP_SPEC.name,
          daysLeft,
          renewsOn: formatLongDate(targetDate, true),
          amountLabel: formatMxnAmountLabel(MEMBERSHIP_SPEC.monthlyMxn * 100),
          paymentMode: mode,
          manageUrl: `${baseUrl}/app/account?tab=plan`,
        });
      } else if (row.kind === "access_expired") {
        rendered = await renderEmail("access-expired", {
          name,
          planName: MEMBERSHIP_SPEC.name,
          paymentMode: mode,
          updateCardUrl: `${baseUrl}/app/account?tab=plan`,
        });
      }

      if (!rendered) continue;
      const shouldSchedule = row.sendAt.getTime() - now.getTime() > SCHEDULE_THRESHOLD_MS;
      const { id } = await mailer.send({
        to: row.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        ...(shouldSchedule ? { scheduledAt: row.sendAt } : {}),
        idempotencyKey: `${row.kind}:${row.userId}:${row.cycleKey}`,
        tags: [{ name: "tipo", value: row.kind }],
      });
      await markEmail(db, row.id, { status: shouldSchedule ? "scheduled" : "sent", providerId: id });
      dispatched += 1;
    } catch (error) {
      console.error(`[cron correos] fallo en ${row.id} (${row.kind}):`, error);
      await markEmail(db, row.id, { status: "failed" }).catch((err) => void err);
    }
  }

  return dispatched;
}
