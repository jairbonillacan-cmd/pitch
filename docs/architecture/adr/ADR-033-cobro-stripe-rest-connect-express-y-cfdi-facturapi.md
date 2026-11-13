---
status: accepted
date: 2026-11-13
updates:
  - ADR-011
  - ADR-025
---

# ADR-033: Cobro directo vía Stripe REST (sin SDK), liquidación diaria con Stripe Connect Express y timbrado CFDI 4.0 con Facturapi

- **Estado:** Aceptada (`accepted`). Concreta y actualiza [ADR-011](ADR-011-billing-desacoplado-y-entitlements-por-concesiones.md) y [ADR-025](ADR-025-zero-leak-subscription-tipster-referrals.md).
- **Fecha:** 2026-11-13 (implementada en `apps/web/src/server/billing/{checkout,stripe-webhook,connect,cfdi}.ts`, `packages/db/src/{billing,payouts}.ts` y `/api/cron/tipster-payouts`).

## Contexto

 Al implementar el motor financiero de Fase 4 y revisar las decisiones del fundador del `2026-11-11` (`docs/product/DECISIONES_FUNDADOR_F4.md` §§1–2) fue necesario resolver cuatro puntos de diseño:

1. Instalar SDKs pesados de terceros (`stripe`, `facturapi`) añade dependencias grandes, acopla tipos a versiones específicas de API y dificulta inyectar transporte determinista en pruebas rápidas.
2. Pagar comisiones a Tipsters por transferencia SPEI manual el día 5 de cada mes (opción inicial de Fase 4A) exige recolectar y cifrar CLABEs bancarias, conciliar hojas de cálculo y ejecutar dispersión manual propensa a errores o reembolsos tardíos.
3. Un descuento porcentual genérico de referido aplicado al plan anual acumularía descuento sobre un precio que ya ahorra 33 %, erosionando el margen cuando además se acreditan `+15` días a cada lado.
4. El timbrado CFDI 4.0 ante el SAT rechaza facturas si la razón social conserva el régimen societario (`SA DE CV`, `SAPI DE CV`) o si el régimen fiscal no corresponde al tipo de persona del RFC (`12` vs `13` caracteres).

## Decisión

1. **Integración HTTP directa (`fetch` + `node:crypto`) sin SDKs propietarios:**
   - Checkout (`/api/billing/checkout`), webhook (`/api/webhooks/stripe`), Stripe Connect (`connect.ts`) y Facturapi v2 (`cfdi.ts`) llaman directamente a las APIs REST oficiales aceptando `fetchImpl` inyectable para pruebas unitarias y de integración 100 % deterministas.
   - `verifyStripeSignature` valida `Stripe-Signature` con HMAC-SHA256, `timingSafeEqual` y ventana máxima de `300 s`. La idempotencia de eventos se garantiza insertando en `processed_payment_events` antes de ejecutar efectos y eliminando la marca en el bloque `catch` para permitir reintentos legítimos de Stripe si ocurre un fallo transitorio.
2. **Stripe Connect Express desde el día 1 para Tipsters (`apps/web/src/server/billing/connect.ts`):**
   - Se descarta la dispersión SPEI manual como flujo principal. Cada Tipster completa su alta desde `/app/tipster` creando una cuenta Express `MX` (`individual`, capacidad `transfers`, clave idempotente `connect-account:{userId}`) mediante `account_onboarding`.
   - El evento `account.updated` actualiza `connect_payouts_enabled`.
   - Las comisiones (`25 %` calculado estrictamente sobre el **neto** = `gross_paid - IVA - balance_transaction.fee` real consultado en Stripe) nacen en `pending_clearance` con retención de **14 días** contra contracargos/reembolsos (`charge.refunded` revierte el asiento a `reversed_refund`).
   - El job diario `/api/cron/tipster-payouts` (protegido con `CRON_SECRET`) promueve comisiones liberadas a `payable` y ejecuta `/v1/transfers` en MXN con clave idempotente `tipster-payout:{ledgerId}`, aislando fallos por asiento sin detener el resto del lote.
3. **Reglas cerradas de suscripción, gracia y cupón de referido:**
   - Ante `invoice.payment_failed`, la suscripción entra en `past_due_grace` por **72 horas** antes de perder acceso (`hasActivePaseTotal` sigue sumando suscripción vigente o `entitlement_grants` activas).
   - El beneficio de entrada del amigo referido se fija exclusivamente sobre el **plan mensual** como cupón único de **`$90 MXN` de descuento** (`amount_off: 9000`, primer mes en `$209 MXN`), exigiendo cobro efectivo `>= $150 MXN` (`15000` centavos) para disparar los `+15 días` bilaterales y el bono de `+30 días` al quinto amigo pagado.
4. **Saneamiento local CFDI 4.0 previo a Facturapi (`apps/web/src/server/billing/cfdi.ts`):**
   - `validateCfdiProfile` y `cleanLegalName` normalizan el RFC, podan automáticamente sufijos societarios (`SA DE CV`, `SAPI DE CV`, `S DE RL`, `SC`, `AC`) en dos pasadas y bloquean combinaciones inválidas persona física/moral vs régimen SAT (`601` solo moral; `605`, `612`, `626` solo física) antes de timbrar con clave SAT `81112106`, uso `G03`, forma de pago `04` e IVA 16 % incluido.

## Qué actualiza

- **ADR-011:** concreta el adaptador primario en Stripe MX REST manteniendo la autorización desacoplada por `subscriptions` + `entitlement_grants`.
- **ADR-025:** sustituye el pago manual inicial a Tipsters por **Stripe Connect Express** desde el arranque y acota el descuento de referido a `$90 MXN` fijos en el ciclo mensual.

## Alternativas descartadas

- **SPEI manual mensual con almacenamiento propio de CLABEs:** mayor carga operativa y superficie de datos bancarios sensibles en nuestra base.
- **Calcular el 25 % de comisión sobre el monto bruto cobrado:** haría que PitchLab absorbiera el 100 % del IVA (16 %) y de la comisión de pasarela sobre la parte del creador.
- **Pasar a Stripe modo real sobre Vercel Hobby:** descartado en `DECISIONES_FUNDADOR_F4.md` §1.3; encender cobros requiere migrar antes a **Vercel Pro** por términos de uso comercial.

## Consecuencias

- Todo el flujo financiero (suscripciones, gracia de 72 h, referidos, comisiones netas, reembolsos, Connect y CFDI 4.0) queda probado en local contra `PGlite` sin depender de red ni llaves secretas, listo para encenderse con variables de entorno.
