# Correos de PitchLab

> **Estado:** 2026-11-12 · 25 plantillas con la marca en `packages/emails`; 12 conectadas.
> **Fuente de verdad del estado:** `packages/emails/src/wiring.ts` (la galería y esta tabla salen de ahí).
> **Ver las plantillas:** `pnpm --filter @pitchlab/emails preview` (genera `packages/emails/.preview/index.html`).

## Cómo funciona

- **Plantillas** (`packages/emails`): React Email con los colores de `@pitchlab/tokens` (escenario oscuro de la landing). `renderEmail(id, datos)` devuelve asunto, HTML y texto plano. Los datos llegan ya formateados (montos, fechas): `apps/web/src/server/email-format.ts` tiene los formateadores.
- **Envío** (`apps/web/src/server/mailer.ts`): todo sale por **Resend**. Sin `RESEND_API_KEY` (desarrollo) se imprime en consola.
  - **Programar:** Resend guarda un correo y lo manda a la hora indicada (`scheduled_at`, hasta 30 días; en la app despachamos cuando falta ≤ 28 días mediante el cron diario).
  - **Cancelar:** `cancel(id)` cancela un correo programado que aún no salió.
  - **Sin duplicados:** cada envío lleva `Idempotency-Key`, y la tabla `scheduled_emails` (llave única `(user_id, kind, cycle_key)`) guarda qué se mandó, cuándo programar (`send_at`) y el id de Resend.
  - **Responder a:** `PITCHLAB_SUPPORT_EMAIL`. **Remitente:** `EMAIL_FROM` (por defecto `PitchLab <hola@pitchlab.mx>`; el dominio debe estar verificado en Resend, paso 5 de `docs/product/GUIA_CUENTAS_Y_DESPLIEGUE.md`).
- Un fallo de correo **nunca** rompe el registro ni la calificación de un pick: se registra en consola y, si era un envío de cuenta, se libera la reserva para reintentarlo.

## Lo que sale hoy

1. **Enlace de acceso:** al pedir entrar (`auth.ts`).
2. **Bienvenida:** al terminar el paso 2 (`POST /api/me/signup`). Si la persona ya usó su prueba, no menciona la prueba.
3. **Día 5 y día 7 de la prueba:** se programan en Resend en ese mismo momento (`startAccountEmails`): el aviso «quedan 2 días» a los 5 días y «tu prueba terminó» a los 7.
4. **Ciclo SPEI y referidos:** recibo de pago aprobado (`payment-receipt`), aviso de rechazo con motivo (`transfer-rejected`), recompensa bilateral (`referral-rewarded`) y bono embajador (`referral-ambassador`), más recordatorio de renovación (−3 días) y aviso de pase vencido (`renewal-reminder`, `access-expired`) registrados en `scheduled_emails` y despachados por `/api/cron/tipster-payouts` cuando entran en la ventana de 28 días.
5. **Tipsters:** aviso de nueva suscripción pagada con su código (`tipster-new-subscriber`) y notificación de pago de comisión (`tipster-payout`, manual en `/app/admin` o vía cron).
6. **Solicitud de baja (`POST /api/me/deletion-request`):** aviso interno por correo al equipo de soporte y registro en auditoría.

## Cuota de Resend (plan gratis)

3,000 correos al mes y **100 al día**. Cada registro nuevo con prueba genera 4 correos (acceso, bienvenida, día 5 y día 7), pero solo 2 salen el día del registro. El tope práctico son unos **50 registros al día** (acceso + bienvenida). Si se llega, pasar al plan de pago de Resend.

## Estado de cada correo

Tres estados:

- **Conectado:** ya se envía.
- **Listo para conectar:** el evento que lo dispara ya existe en el código; solo falta llamar a `renderEmail` y al `Mailer` ahí. Los de cobro además necesitan Stripe en modo real (F4).
- **Falta construir antes:** depende de algo que todavía no existe. Se construye eso primero y después se conecta el correo.

### ✅ Conectado

| Correo | Lo manda | Qué falta |
|---|---|---|
| Enlace de acceso (`magic-link`) · Cuenta y prueba | Al pedir entrar con correo (Better Auth, `auth.ts`). | — |
| Bienvenida (día 0) (`welcome`) · Cuenta y prueba | Al terminar el paso 2 del registro (`POST /api/me/signup`). | — |
| Quedan 2 días (día 5) (`trial-ending`) · Cuenta y prueba | Programado en Resend al registrarse: día 5 de la prueba. | Al encender Stripe (F4), llamar `cancelTrialEmails` desde el webhook cuando alguien se suscribe antes de que acabe la prueba; si no, este aviso le llega a quien ya pagó. |
| Fin de la prueba (día 7) (`trial-ended`) · Cuenta y prueba | Programado en Resend al registrarse: día 7, cuando termina la prueba sin tarjeta. | Lo mismo que el aviso del día 5: cancelarlo con `cancelTrialEmails` si la persona se suscribe antes. |
| Pago confirmado (`payment-receipt`) · Cobro | Al aprobar una transferencia SPEI (`/api/admin/transfers/[id]/approve`) o al liquidar factura de Stripe. | — |
| Transferencia rechazada (`transfer-rejected`) · Cobro | Al rechazar una solicitud SPEI con motivo en `/app/admin` (`/api/admin/transfers/[id]/reject`). | — |
| Tu plan se renueva (`renewal-reminder`) · Cobro | Se registra en `scheduled_emails` al aprobar transferencia SPEI (3 días antes del vencimiento) y se envía/programa en el cron diario. | — |
| Acceso en pausa por falta de pago (`access-expired`) · Cobro | Se registra en `scheduled_emails` al finalizar el periodo aprobado por transferencia SPEI y se envía/programa en el cron diario. | — |
| Recompensa ganada (`referral-rewarded`) · Referidos | Al conceder la recompensa bilateral (`billing.ts`, +15 días) tras el primer pago aprobado (SPEI o Stripe). | — |
| Ya eres embajador (`referral-ambassador`) · Referidos | Al alcanzar 5 amigos pagados y conceder el bono de embajador (+30 días) tras un pago aprobado. | — |
| Nueva suscripción con tu código (`tipster-new-subscriber`) · Tipster y comunidad | Al registrar la comisión de un cobro con su código al aprobar transferencia SPEI o recibir factura de Stripe. | — |
| Pago de comisión Tipster (`tipster-payout`) · Tipster y comunidad | Al registrar el pago manual de comisión en `/app/admin` o al liquidar por Connect (`/api/cron/tipster-payouts`). | — |

### 🟡 Listo para conectar

| Correo | Lo manda | Qué falta |
|---|---|---|
| Tu amigo se registró (`referral-signed-up`) · Referidos | Al registrar el referido (`attributeReferral` en `packages/db/src/signup.ts`). | — |
| Falló el pago (`payment-failed`) · Cobro | Webhook `invoice.payment_failed`. | Stripe en modo real con sus claves (F4). |
| Factura CFDI (`cfdi-invoice`) · Cobro | Después de timbrar la factura (`billing/cfdi.ts`). | Stripe en modo real con sus claves (F4). Facturapi configurado y que el envío admita adjuntos (PDF y XML). |
| Reembolso o disputa (`refund`) · Cobro | Webhook `charge.refunded` y `charge.dispute.created`. | Stripe en modo real con sus claves (F4). |
| Suscripción cancelada (`subscription-canceled`) · Cobro | Webhook `customer.subscription.updated` con `cancel_at_period_end`. | Stripe en modo real con sus claves (F4). |
| Recompensa revertida (`referral-reversed`) · Referidos | Webhook `charge.refunded` cuando el reembolso llega dentro de los 14 días. | Stripe en modo real con sus claves (F4). |
| Código Tipster activo (`tipster-activated`) · Tipster y comunidad | Al crear el perfil Tipster (`/api/admin/tipsters`). | — |

### ⛔ Falta construir antes

| Correo | Lo manda | Qué falta |
|---|---|---|
| Invitación (`invite`) · Referidos | Cuando alguien emite una invitación. | La tabla de invitaciones (`invite`) y la pantalla para emitirlas; hoy no existen. |
| Pick calificado (`pick-graded`) · Producto y seguridad | Cuando un pick de la bitácora pasa de `pending` a `won`, `lost` o `void`. | Un calificador que decida el resultado con el marcador final (hoy nada cambia el estado de los picks) y el interruptor «Avisarme cuando se califique un pick» en Mi cuenta. El envío, la preferencia y `settleAndNotify` ya están hechos. |
| Tu mes en PitchLab (`monthly-record`) · Producto y seguridad | Tarea programada el día 1 de cada mes. | Calcular el récord y el puesto en el servidor (hoy `profile-stats.ts` corre en el navegador), la tarea mensual y el interruptor de recibirlo. |
| Publicación retirada (`content-removed`) · Tipster y comunidad | Cuando un moderador retira una publicación. | La acción de moderar (hoy solo existe la tabla `social_moderation_logs`, sin pantalla ni API) y las publicaciones en el servidor. |
| Resumen semanal (`weekly-digest`) · Producto y seguridad | Tarea programada cada semana. | El motor de picks corriendo en el servidor por persona, la tarea semanal y el interruptor de recibirlo. |
| Aviso de seguridad (`security-notice`) · Producto y seguridad | Inicio de sesión desde un dispositivo nuevo; vincular o desvincular Google o X. | Comparar el dispositivo de cada sesión con los anteriores y un gancho al vincular o desvincular cuentas. |

## Orden recomendado para conectar los que faltan

1. **Calificador de picks** (hoy nada pasa un pick de `pending` a `won` o `lost`): decide el resultado con el marcador final y llama a `settleAndNotify` (`apps/web/src/server/pick-results.ts`, ya hecho y probado). Después, el interruptor «Avisarme cuando se califique un pick» en Mi cuenta (la API `PUT /api/me/email-preferences` ya existe; el aviso está apagado por defecto).
2. **Referido registrado y Tipster activado:** los eventos ya existen; solo se engancha el correo.
3. **Al encender Stripe (`PITCHLAB_PAYMENTS_MODE=stripe`, F4):** conectar los eventos restantes del webhook de Stripe (`payment-failed`, `subscription-canceled`, `refund`, `referral-reversed`, `cfdi-invoice`) y llamar `cancelTrialEmails` cuando alguien se suscribe antes de que acabe la prueba.
4. **Resúmenes mensuales y semanales:** agregarlos al cron diario existente (`/api/cron/tipster-payouts`) cuando corra el cálculo de picks en servidor.
5. **Moderación por correo, invitaciones y avisos de seguridad:** conectar el disparador en el flujo que los origina.

