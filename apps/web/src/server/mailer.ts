/**
 * Envío de correos transaccionales por Resend (https://resend.com/docs/api-reference/emails).
 *
 * - `scheduledAt`: Resend guarda el correo y lo manda a esa hora (hasta 30 días después), así que
 *   los avisos del día 5 y del día 7 de la prueba no necesitan tarea programada propia.
 * - `idempotencyKey`: Resend ignora un segundo envío con la misma clave (24 h).
 * - `cancel`: cancela un correo programado que todavía no salió.
 *
 * Sin `RESEND_API_KEY` (desarrollo) los correos se imprimen en la consola del servidor.
 */
import { noreplySender, supportEmail } from "@pitchlab/emails";
import { logSecurityEvent, redactSensitiveValue } from "./safe-logger";

export { noreplySender };

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Por defecto `EMAIL_FROM`. */
  from?: string;
  replyTo?: string;
  /** Si va en el futuro, Resend lo programa. */
  scheduledAt?: Date;
  idempotencyKey?: string;
  /** Etiquetas de Resend para ver en su panel qué tipo de correo es. */
  tags?: ReadonlyArray<{ name: string; value: string }>;
}

export interface Mailer {
  send(email: OutgoingEmail): Promise<{ id: string | null }>;
  cancel(id: string): Promise<void>;
}

const API = "https://api.resend.com";

export function resendMailer(apiKey: string, defaultFrom: string, fetchImpl: typeof fetch = fetch): Mailer {
  const headers = (extra: Record<string, string> = {}) => ({
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    ...extra,
  });
  return {
    async send(email) {
      const res = await fetchImpl(`${API}/emails`, {
        method: "POST",
        headers: headers(email.idempotencyKey ? { "Idempotency-Key": email.idempotencyKey } : {}),
        body: JSON.stringify({
          from: email.from ?? defaultFrom,
          to: email.to,
          subject: email.subject,
          html: email.html,
          text: email.text,
          reply_to: email.replyTo ?? supportEmail(),
          scheduled_at: email.scheduledAt?.toISOString(),
          tags: email.tags,
        }),
      });
      if (!res.ok) throw new Error(`Resend respondió ${res.status}`);
      const body = (await res.json().catch(() => null)) as { id?: unknown } | null;
      return { id: typeof body?.id === "string" ? body.id : null };
    },
    async cancel(id) {
      const res = await fetchImpl(`${API}/emails/${encodeURIComponent(id)}/cancel`, {
        method: "POST",
        headers: headers(),
      });
      // 404/422: ya salió o ya estaba cancelado. No es un error para quien llama.
      if (!res.ok && res.status !== 404 && res.status !== 422) throw new Error(`Resend respondió ${res.status}`);
    },
  };
}

export function consoleMailer(log?: (line: string) => void): Mailer {
  return {
    async send(email) {
      if (log) {
        const when = email.scheduledAt ? ` (programado para ${email.scheduledAt.toISOString()})` : "";
        const sender = email.from ? ` [desde ${email.from}]` : "";
        const redacted = redactSensitiveValue(`[correo]${sender} ${email.subject} → ${email.to}${when}`);
        log(typeof redacted === "string" ? redacted : `[correo] ${email.subject}`);
      } else {
        logSecurityEvent("info", "mailer_console_dispatched", {
          email: email.to,
          subject: email.subject,
          from: email.from ?? null,
          scheduledAt: email.scheduledAt?.toISOString() ?? null,
        });
      }
      return { id: null };
    },
    async cancel(id) {
      if (log) {
        log(`[correo] cancelado ${id}`);
      } else {
        logSecurityEvent("info", "mailer_console_canceled", { emailId: id });
      }
    },
  };
}

let cached: Mailer | null = null;

export function setMailerForTests(mailer: Mailer | null): void {
  cached = mailer;
}

/** Resend si hay clave; si no, la consola (solo para desarrollo). */
export function getMailer(): Mailer {
  if (cached) return cached;
  const key = process.env.RESEND_API_KEY;
  if (key) {
    cached = resendMailer(key, process.env.EMAIL_FROM ?? "PitchLab <hola@pitchlab.mx>");
  } else {
    if (process.env.NODE_ENV === "production") {
      logSecurityEvent("warn", "mailer_resend_key_missing");
    }
    cached = consoleMailer();
  }
  return cached;
}
