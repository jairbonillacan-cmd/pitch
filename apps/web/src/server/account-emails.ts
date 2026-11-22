import {
  claimEmail,
  listScheduledEmails,
  markEmail,
  releaseEmail,
  TRIAL_M1_DAYS,
  type Db,
  type ScheduledEmailKind,
} from "@pitchlab/db";
import { renderEmail, siteUrl } from "@pitchlab/emails";
import { MEMBERSHIP_SPEC } from "@pitchlab/ui/spacetime-catalog";
import { firstName, formatLongDate } from "./email-format";
import type { Mailer } from "./mailer";
import { logSecurityEvent } from "./safe-logger";

const DAY_MS = 86_400_000;
const SCHEDULE_THRESHOLD_MS = 60_000;

export interface AccountEmailsInput {
  userId: string;
  email: string;
  displayName: string | null;
  trialGranted: boolean;
  now: Date;
}

interface Pending {
  kind: ScheduledEmailKind;
  sendAt: Date;
  build: () => Promise<{ subject: string; html: string; text: string }>;
}

export async function startAccountEmails(db: Db, mailer: Mailer, input: AccountEmailsInput): Promise<void> {
  const name = firstName(input.displayName);
  const trialEnd = new Date(input.now.getTime() + TRIAL_M1_DAYS * DAY_MS);
  const plan = {
    planName: MEMBERSHIP_SPEC.name,
    manageUrl: `${siteUrl()}/app/account?tab=plan`,
  };

  const jobs: Pending[] = [
    {
      kind: "welcome",
      sendAt: input.now,
      build: () =>
        renderEmail("welcome", { name, trialDays: input.trialGranted ? TRIAL_M1_DAYS : null }),
    },
  ];
  if (input.trialGranted) {
    jobs.push(
      {
        kind: "trial_ending",
        sendAt: new Date(trialEnd.getTime() - 2 * DAY_MS),
        build: () =>
          renderEmail("trial-ending", {
            name,
            daysLeft: 2,
            planName: plan.planName,
            priceLabel: `$${MEMBERSHIP_SPEC.monthlyMxn} MXN al mes, IVA incluido`,
            endsOn: formatLongDate(trialEnd),
            manageUrl: plan.manageUrl,
            hasCard: false,
          }),
      },
      {
        kind: "trial_ended",
        sendAt: trialEnd,
        build: () => renderEmail("trial-ended", { name, outcome: "free", ...plan }),
      },
    );
  }

  for (const job of jobs) {
    await sendOnce(db, mailer, input, job);
  }
}

async function sendOnce(db: Db, mailer: Mailer, input: AccountEmailsInput, job: Pending): Promise<void> {
  const rowId = await claimEmail(db, { userId: input.userId, kind: job.kind, sendAt: job.sendAt });
  if (!rowId) return;
  try {
    const { subject, html, text } = await job.build();
    const scheduled = job.sendAt.getTime() - input.now.getTime() > SCHEDULE_THRESHOLD_MS;
    const { id } = await mailer.send({
      to: input.email,
      subject,
      html,
      text,
      ...(scheduled ? { scheduledAt: job.sendAt } : {}),
      idempotencyKey: `${job.kind}:${input.userId}`,
      tags: [{ name: "tipo", value: job.kind }],
    });
    await markEmail(db, rowId, { status: scheduled ? "scheduled" : "sent", providerId: id });
  } catch (error) {
    logSecurityEvent("error", "account_email_send_failed", {
      kind: job.kind,
      userId: input.userId,
      error,
    });
    await releaseEmail(db, rowId).catch((e) =>
      logSecurityEvent("error", "account_email_release_failed", {
        kind: job.kind,
        rowId,
        error: e,
      }),
    );
  }
}

export async function cancelTrialEmails(db: Db, mailer: Mailer, userId: string): Promise<number> {
  const rows = await listScheduledEmails(db, userId, ["trial_ending", "trial_ended"]);
  let canceled = 0;
  for (const row of rows) {
    try {
      if (row.providerId) await mailer.cancel(row.providerId);
      await markEmail(db, row.id, { status: "canceled" });
      canceled += 1;
    } catch (error) {
      logSecurityEvent("error", "account_email_cancel_failed", {
        kind: row.kind,
        rowId: row.id,
        userId,
        error,
      });
    }
  }
  return canceled;
}
