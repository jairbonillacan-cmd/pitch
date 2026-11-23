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
  TRANSFER_COUPON_VALIDITY_DAYS,
  users,
  type ActivatedTransferPayment,
  type ApproveTransferResult,
  type Db,
  type RejectTransferResult,
  type ScheduledEmailKind,
} from "@pitchlab/db";
import { noreplySender, renderEmail, siteUrl } from "@pitchlab/emails";
import { MEMBERSHIP_SPEC } from "@pitchlab/ui/spacetime-catalog";
import { cancelTrialEmails } from "./account-emails";
import { firstName, formatLongDate } from "./email-format";
import { paymentMode } from "./billing/payment-mode";
import type { Mailer } from "./mailer";
import { logSecurityEvent } from "./safe-logger";

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
      logSecurityEvent("error", "transfer_email_cancel_failed", {
        kind: row.kind,
        cycleKey: row.cycleKey,
        rowId: row.id,
        userId,
        error,
      });
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
    from?: string;
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
  if (deltaMs > RESEND_WINDOW_MS) {
    return;
  }

  try {
    const { subject, html, text } = await input.build();
    const shouldSchedule = deltaMs > SCHEDULE_THRESHOLD_MS;
    const { id } = await mailer.send({
      ...(input.from ? { from: input.from } : {}),
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
    logSecurityEvent("error", "transfer_email_dispatch_failed", {
      kind: input.kind,
      cycleKey: input.cycleKey,
      userId: input.userId,
      error,
    });
    await releaseEmail(db, rowId).catch((err) => void err);
  }
}

export async function sendTransferApprovedEmails(
  _db: Db,
  mailer: Mailer,
  approved: Extract<ApproveTransferResult, { ok: true }>,
  now: Date,
): Promise<void> {
  if (approved.alreadyApproved) return;
  const { request, coupon, user } = approved;
  const baseUrl = siteUrl();
  const planName =
    request.planInterval === "annual"
      ? `${MEMBERSHIP_SPEC.name} anual`
      : `${MEMBERSHIP_SPEC.name} mensual`;
  const amountLabel = formatMxnAmountLabel(request.amountCentavosMxn);
  const expiresAt =
    coupon.expiresAt ?? new Date(now.getTime() + TRANSFER_COUPON_VALIDITY_DAYS * DAY_MS);

  try {
    const rendered = await renderEmail("transfer-coupon", {
      name: firstName(user.displayName),
      planName,
      amountLabel,
      referenceCode: request.referenceCode,
      couponCode: coupon.code,
      days: coupon.days,
      expiresOn: formatLongDate(expiresAt, true),
      redeemUrl: `${baseUrl}/canjear?codigo=${encodeURIComponent(coupon.code)}`,
    });

    await mailer.send({
      from: noreplySender(),
      to: user.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      idempotencyKey: `transfer-coupon:${request.id}`,
      tags: [{ name: "tipo", value: "transfer_coupon" }],
    });
  } catch (error) {
    logSecurityEvent("error", "transfer_coupon_email_failed", {
      requestId: request.id,
      userId: user.id,
      error,
    });
  }
}

export async function sendTransferRedeemedEmails(
  db: Db,
  mailer: Mailer,
  input: {
    activated: ActivatedTransferPayment;
    newAccessUntil: Date | null;
    now: Date;
  },
): Promise<void> {
  const { activated, newAccessUntil, now } = input;
  const { request, paidEffects, user } = activated;
  const baseUrl = siteUrl();
  const planName =
    request.planInterval === "annual"
      ? `${MEMBERSHIP_SPEC.name} anual`
      : `${MEMBERSHIP_SPEC.name} mensual`;
  const amountLabel = formatMxnAmountLabel(request.amountCentavosMxn);
  const name = firstName(user.displayName);
  const cycleKey = `transfer:${request.id}`;

  await cancelTrialEmails(db, mailer, user.id);
  await cancelPreviousCycleEmails(db, mailer, user.id);

  const endsAt =
    newAccessUntil ??
    new Date(now.getTime() + (request.planInterval === "annual" ? 365 : 30) * DAY_MS);
  await reserveOrScheduleEmail(db, mailer, {
    userId: user.id,
    email: user.email,
    kind: "payment_receipt",
    cycleKey,
    sendAt: now,
    now,
    from: noreplySender(),
    build: () =>
      renderEmail("payment-receipt", {
        name,
        planName,
        amountLabel,
        paidOn: formatLongDate(now, true),
        periodLabel: formatPeriodRange(now, endsAt),
        paymentMethodLabel: "Transferencia SPEI + cupón",
        referenceCode: request.referenceCode,
        receiptUrl: `${baseUrl}/app/account?tab=plan`,
      }),
  });

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
          manageUrl: `${baseUrl}/precio#transferencia`,
        }),
    });
  }

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
        updateCardUrl: `${baseUrl}/precio#transferencia`,
      }),
  });

  if (paidEffects.referralRewarded) {
    try {
      const ref = await lookupReferrerByReferredUserId(db, user.id);
      if (ref) {
        const refUntil = await accessUntil(db, ref.referrerUserId, now);
        const friendLabel =
          firstName(user.displayName) ?? (user.handle ? `@${user.handle}` : "tu invitado");
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
      logSecurityEvent("error", "transfer_referral_email_failed", {
        requestId: request.id,
        userId: user.id,
        error,
      });
    }
  }

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
        .where(
          and(eq(tipsterAttributions.referredUserId, user.id), eq(tipsterProfiles.isActive, true)),
        )
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
      logSecurityEvent("error", "transfer_tipster_notice_email_failed", {
        requestId: request.id,
        userId: user.id,
        error,
      });
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
      retryUrl: `${siteUrl()}/precio#transferencia`,
    });
    await mailer.send({
      from: noreplySender(),
      to: user.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      idempotencyKey: `transfer-rejected:${request.id}`,
      tags: [{ name: "tipo", value: "transfer_rejected" }],
    });
  } catch (error) {
    logSecurityEvent("error", "transfer_rejected_email_failed", {
      requestId: request.id,
      userId: user.id,
      error,
    });
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
    logSecurityEvent("error", "tipster_manual_payout_email_failed", { error });
  }
}

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
          manageUrl: `${baseUrl}/precio#transferencia`,
        });
      } else if (row.kind === "access_expired") {
        rendered = await renderEmail("access-expired", {
          name,
          planName: MEMBERSHIP_SPEC.name,
          paymentMode: mode,
          updateCardUrl: `${baseUrl}/precio#transferencia`,
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
      logSecurityEvent("error", "scheduled_email_cron_dispatch_failed", {
        rowId: row.id,
        kind: row.kind,
        userId: row.userId,
        error,
      });
      await markEmail(db, row.id, { status: "failed" }).catch((err) => void err);
    }
  }

  return dispatched;
}
