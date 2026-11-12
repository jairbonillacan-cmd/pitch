/**
 * Correos de la cuenta que salen al registrarse: bienvenida (ya) y los dos avisos de la prueba
 * de 7 días (programados en Resend: día 5 y día 7). Un fallo de correo nunca rompe el registro.
 */
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
import { MEMBERSHIP_SPEC } from "@pitchlab/ui";
import { firstName, formatLongDate } from "./email-format";
import type { Mailer } from "./mailer";

const DAY_MS = 86_400_000;
/** Si falta menos que esto, se manda de inmediato en vez de programarlo. */
const SCHEDULE_THRESHOLD_MS = 60_000;

export interface AccountEmailsInput {
  userId: string;
  email: string;
  displayName: string | null;
  /** ¿Se concedió la prueba de 7 días? Si no, solo sale la bienvenida. */
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
    manageUrl: `${siteUrl()}/precio`,
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
  if (!rowId) return; // ya se mandó o se programó antes
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
    console.error(`[correo] no se pudo enviar ${job.kind}:`, error);
    // Se libera la reserva: si la persona repite el registro, el correo se vuelve a intentar.
    await releaseEmail(db, rowId).catch((e) => console.error("[correo] no se pudo liberar la reserva:", e));
  }
}

/**
 * Cancela los avisos de la prueba que siguen programados. Hay que llamarla cuando la persona se
 * suscribe antes de que termine la prueba (webhook de Stripe, F4); si no, el aviso del día 5
 * le llegaría a alguien que ya pagó.
 */
export async function cancelTrialEmails(db: Db, mailer: Mailer, userId: string): Promise<number> {
  const rows = await listScheduledEmails(db, userId, ["trial_ending", "trial_ended"]);
  let canceled = 0;
  for (const row of rows) {
    try {
      if (row.providerId) await mailer.cancel(row.providerId);
      await markEmail(db, row.id, { status: "canceled" });
      canceled += 1;
    } catch (error) {
      console.error(`[correo] no se pudo cancelar ${row.kind}:`, error);
    }
  }
  return canceled;
}
