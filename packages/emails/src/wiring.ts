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
    trigger: "Inicio de sesión desde un dispositivo nuevo; vincular o desvincular Google o X.",
    needs: "Comparar el dispositivo de cada sesión con los anteriores y un gancho al vincular o desvincular cuentas.",
  },

  "referral-signed-up": {
    state: "ready",
    trigger: "Al registrar el referido (`attributeReferral` en `packages/db/src/signup.ts`).",
  },
  "referral-rewarded": {
    state: "live",
    trigger: "Al conceder la recompensa bilateral (`billing.ts`, +15 días) tras el primer pago aprobado (SPEI o Stripe).",
  },
  "referral-ambassador": {
    state: "live",
    trigger: "Al alcanzar 5 amigos pagados y conceder el bono de embajador (+30 días) tras un pago aprobado.",
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

  "payment-receipt": {
    state: "live",
    trigger: "Al aprobar una transferencia SPEI (`/api/admin/transfers/[id]/approve`) o al liquidar factura de Stripe.",
  },
  "transfer-rejected": {
    state: "live",
    trigger: "Al rechazar una solicitud SPEI con motivo en `/app/admin` (`/api/admin/transfers/[id]/reject`).",
  },
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
    state: "live",
    trigger: "Se registra en `scheduled_emails` al aprobar transferencia SPEI (3 días antes del vencimiento) y se envía/programa en el cron diario.",
  },
  "access-expired": {
    state: "live",
    trigger: "Se registra en `scheduled_emails` al finalizar el periodo aprobado por transferencia SPEI y se envía/programa en el cron diario.",
  },

  "tipster-activated": {
    state: "ready",
    trigger: "Al crear el perfil Tipster (`/api/admin/tipsters`).",
  },
  "tipster-new-subscriber": {
    state: "live",
    trigger: "Al registrar la comisión de un cobro con su código al aprobar transferencia SPEI o recibir factura de Stripe.",
  },
  "tipster-payout": {
    state: "live",
    trigger: "Al registrar el pago manual de comisión en `/app/admin` o al liquidar por Connect (`/api/cron/tipster-payouts`).",
  },
  "content-removed": {
    state: "blocked",
    trigger: "Cuando un moderador retira una publicación.",
    needs: "La acción de moderar (hoy solo existe la tabla `social_moderation_logs`, sin pantalla ni API) y las publicaciones en el servidor.",
  },
} as const satisfies Record<EmailTemplateId, EmailWiring>;
