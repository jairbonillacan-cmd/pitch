import type { EmailTemplateId } from "./registry";

/**
 * Estado de conexión de cada correo:
 * - `live`: ya se envía hoy.
 * - `ready`: el evento que lo dispara ya existe en el código; falta engancharlo.
 * - `blocked`: depende de algo que todavía no está construido (ver `needs`).
 *
 * Es la lista de pendientes de los correos: al conectar uno, cambia su estado aquí y la galería
 * y `docs/architecture/CORREOS.md` lo reflejan.
 */
export type EmailWiringState = "live" | "ready" | "blocked";

export interface EmailWiring {
  state: EmailWiringState;
  /** Qué evento lo manda. */
  trigger: string;
  /** Lo que debe existir antes (solo si `state` no es `live`). */
  needs?: string;
}

const STRIPE_REAL = "Stripe en modo real con sus claves (F4).";

export const EMAIL_WIRING = {
  "magic-link": { state: "live", trigger: "Al pedir entrar con correo (Better Auth, `auth.ts`)." },
  welcome: { state: "live", trigger: "Al terminar el paso 2 del registro (`POST /api/me/signup`)." },
  "trial-ending": {
    state: "live",
    trigger: "Programado en Resend al registrarse: día 5 de la prueba.",
    needs:
      "Al encender Stripe (F4), llamar `cancelTrialEmails` desde el webhook cuando alguien se suscribe antes de que acabe la prueba; si no, este aviso le llega a quien ya pagó.",
  },
  "trial-ended": {
    state: "live",
    trigger: "Programado en Resend al registrarse: día 7, cuando termina la prueba sin tarjeta.",
    needs: "Lo mismo que el aviso del día 5: cancelarlo con `cancelTrialEmails` si la persona se suscribe antes.",
  },

  "pick-graded": {
    state: "blocked",
    trigger: "Cuando un pick de la bitácora pasa de `pending` a `won`, `lost` o `void`.",
    needs:
      "Un calificador que decida el resultado con el marcador final (hoy nada cambia el estado de los picks) y el interruptor «Avisarme cuando se califique un pick» en Mi cuenta. El envío, la preferencia y `settleAndNotify` ya están hechos.",
  },
  "monthly-record": {
    state: "blocked",
    trigger: "Tarea programada el día 1 de cada mes.",
    needs:
      "Calcular el récord y el puesto en el servidor (hoy `profile-stats.ts` corre en el navegador), la tarea mensual y el interruptor de recibirlo.",
  },
  "weekly-digest": {
    state: "blocked",
    trigger: "Tarea programada cada semana.",
    needs: "El motor de picks corriendo en el servidor por persona, la tarea semanal y el interruptor de recibirlo.",
  },
  "security-notice": {
    state: "blocked",
    trigger: "Inicio de sesión desde un dispositivo nuevo; vincular o desvincular Google, Apple o X.",
    needs: "Comparar el dispositivo de cada sesión con los anteriores y un gancho al vincular o desvincular cuentas.",
  },

  "referral-signed-up": {
    state: "ready",
    trigger: "Al registrar el referido (`attributeReferral` en `packages/db/src/signup.ts`).",
  },
  "referral-rewarded": {
    state: "ready",
    trigger: "Al conceder la recompensa bilateral (`billing.ts`, `grantDays` del referente).",
    needs: STRIPE_REAL,
  },
  "referral-ambassador": {
    state: "ready",
    trigger: "Al conceder el bono de embajador (`billing.ts`).",
    needs: STRIPE_REAL,
  },
  "referral-reversed": {
    state: "ready",
    trigger: "Webhook `charge.refunded` cuando el reembolso llega dentro de los 14 días.",
    needs: STRIPE_REAL,
  },
  invite: {
    state: "blocked",
    trigger: "Cuando alguien emite una invitación.",
    needs: "La tabla de invitaciones (`invite`) y la pantalla para emitirlas; hoy no existen.",
  },

  "payment-receipt": { state: "ready", trigger: "Webhook `invoice.paid`.", needs: STRIPE_REAL },
  "payment-failed": { state: "ready", trigger: "Webhook `invoice.payment_failed`.", needs: STRIPE_REAL },
  "subscription-canceled": {
    state: "ready",
    trigger: "Webhook `customer.subscription.updated` con `cancel_at_period_end`.",
    needs: STRIPE_REAL,
  },
  refund: { state: "ready", trigger: "Webhook `charge.refunded` y `charge.dispute.created`.", needs: STRIPE_REAL },
  "cfdi-invoice": {
    state: "ready",
    trigger: "Después de timbrar la factura (`billing/cfdi.ts`).",
    needs: `${STRIPE_REAL} Facturapi configurado y que el envío admita adjuntos (PDF y XML).`,
  },
  "renewal-reminder": {
    state: "blocked",
    trigger: "7 días antes de renovar un plan anual.",
    needs: "Manejar el webhook `invoice.upcoming` de Stripe (hoy no se procesa) o una tarea diaria sobre `subscriptions`.",
  },
  "access-expired": {
    state: "blocked",
    trigger: "Cuando termina el plazo de gracia de 72 h de un pago fallido.",
    needs: "Una tarea diaria que pase `past_due_grace` a `expired` (hoy el estado se guarda pero nada lo vence).",
  },

  "tipster-activated": {
    state: "ready",
    trigger: "Al crear el perfil Tipster (`/api/admin/tipstars`).",
  },
  "tipster-new-subscriber": {
    state: "ready",
    trigger: "Al registrar la comisión de un cobro con su código (`invoice.paid`).",
    needs: STRIPE_REAL,
  },
  "tipster-payout": {
    state: "ready",
    trigger: "Al liquidar el pago (`runTipstarPayouts`, tarea diaria).",
    needs: STRIPE_REAL,
  },
  "content-removed": {
    state: "blocked",
    trigger: "Cuando un moderador retira una publicación.",
    needs: "La acción de moderar (hoy solo existe la tabla `social_moderation_logs`, sin pantalla ni API) y las publicaciones en el servidor.",
  },
} as const satisfies Record<EmailTemplateId, EmailWiring>;
