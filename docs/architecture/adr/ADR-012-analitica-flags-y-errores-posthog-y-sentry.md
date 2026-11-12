# ADR-012: Analítica, flags y errores: PostHog y Sentry

- **Estado:** Aceptada
- **Fecha:** 2026-11-08

## Contexto

Hacen falta embudos (trial y referidos), experimentos de precio, interruptores (emblemas por liga, leaderboards y Liga MX) y monitoreo de errores, con presupuesto de $0.

## Decisión

PostHog (eventos con consentimiento y feature flags evaluados en el servidor) y Sentry (web, jobs y Python). El catálogo de eventos se versiona en `packages/contracts/src/analytics.ts`.

## Alternativas descartadas

GA4 + LaunchDarkly (dos herramientas, y LaunchDarkly es de pago); Vercel Analytics (sin flags).

## Consecuencias

Los flags legales (`assets.emblems.<league>`, `social.leaderboards.public` y `league.liga-mx`) tienen dueño y se listan en `SECURITY.md`.
