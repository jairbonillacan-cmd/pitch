# ADR-011: Billing desacoplado y entitlements por concesiones

- **Estado:** Aceptada
- **Fecha:** 2026-11-08

## Contexto

La pasarela no está decidida (FD-06: Stripe requiere aprobación y Mercado Pago es la alternativa), y hay accesos que no vienen de un pago: trial sin tarjeta, invitaciones, recompensas por referido y concesiones de admin.

## Decisión

Interfaz `BillingProvider` (checkout, portal, cancelación y webhooks normalizados) con un adaptador por pasarela. El acceso se calcula como **el plan más alto entre la suscripción activa y las concesiones vigentes (`entitlement_grant`)**. `can(user, featureKey)` se evalúa en el servidor con la matriz de `INFORMATION_ARCHITECTURE.md` §4.

## Alternativas descartadas

Acoplarse a Stripe Billing (riesgo con la cuenta); planes en los claims de sesión (se desincronizan).

## Consecuencias

Los trials sin tarjeta y las recompensas son simples filas de concesión. Cambiar de pasarela no toca la autorización.
