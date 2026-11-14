---
status: accepted
date: 2026-11-13
extends:
  - ADR-007
  - ADR-011
  - ADR-025
---

# ADR-031: Esquema PostgreSQL de Fase 4 (`@pitchlab/db`), pruebas de migraciones sobre `PGlite` y persistencia dual navegador/servidor

- **Estado:** Aceptada (`accepted`). Extiende [ADR-007](ADR-007-base-de-datos-postgresql-en-neon-drizzle-historico.md) y materializa el modelo relacional de [ADR-011](ADR-011-billing-desacoplado-y-entitlements-por-concesiones.md) y [ADR-025](ADR-025-zero-leak-subscription-tipster-referrals.md).
- **Fecha:** 2026-11-13 (implementada en `packages/db/` — migraciones `0000`…`0004` — y `apps/web/app/api/me/*`).

## Contexto

Al pasar del pre-MVP sin base de datos hacia Fase 4 surgieron tres exigencias simultáneas:

1. Blindar en la propia base de datos reglas financieras y de integridad deportiva que no pueden depender solo de validaciones en cliente o rutas HTTP (inmutabilidad pre-kickoff de picks, no auto-referirse, cuadre exacto de comisiones netas, montos sin errores de punto flotante y separación entre credenciales de auth e identidad de negocio).
2. Ejecutar pruebas reales de SQL, índices e invariantes `CHECK` en Windows, Linux y CI **sin Docker ni conexión a Neon**.
3. Mantener funcional el modo beta por PIN y los entornos locales sin `DATABASE_URL` mientras el fundador enciende gradualmente los servicios externos.

## Decisión

1. **Esquema relacional estricto en `@pitchlab/db` (`packages/db/src/schema.ts`, migraciones SQL versionadas `0000`…`0004`):**
   - **Separación `auth_*` vs `users`:** Better Auth gestiona `auth_user`, `auth_session`, `auth_account` y `auth_verification`, mientras el dominio de PitchLab vive en `users` (`uuid` propio enlazado mediante `users.auth_user_id`), preservando llaves foráneas limpias en suscripciones, bitácora y referidos.
   - **Dinero y tiempo sin ambigüedad:** todos los importes monetarios se almacenan en **centavos enteros MXN (`integer`)** y todas las marcas temporales en UTC (`timestamptz`).
   - **Invariantes en motor SQL (`CHECK` + `UNIQUE`):**
     - `sealed_picks`: `sealed_at < kickoff_at`, `0 < units <= 5`, `seal_hash` `CHAR(64)` SHA-256 e índice único `(user_id, pick_id)`.
     - `tipster_commission_ledger`: `net_commissionable_centavos_mxn = gross_paid_centavos_mxn - vat_centavos_mxn - gateway_fee_centavos_mxn` y unicidad por `stripe_invoice_id`.
     - `referral_grants` y `tipster_attributions`: prohibición de auto-referido (`referrer_user_id <> referred_user_id`), unicidad por `referred_user_id` y pago mínimo calificable `>= 15000` centavos (`$150 MXN`).
     - `public_weekly_picks`: máximo 1 pick abierto por `tipster_user_id` e `iso_year_week`, publicado estrictamente antes de `game_kickoff_at`.
     - `cfdi_profiles` y `cfdi_invoices`: validación de longitud de RFC (`12` o `13`), CP de 5 dígitos, regímenes SAT (`601`, `605`, `612`, `616`, `626`) y exclusividad de `user_id IS NULL` para facturas globales.
2. **Pruebas de integración sobre `PGlite` en memoria (`packages/db/tests/` y `apps/web/tests/`):**
   - Cada suite aplica las migraciones SQL reales generadas por `drizzle-kit` sobre una instancia PostgreSQL WASM en memoria (`@electric-sql/pglite`), verificando constraints, cascadas, concesiones, webhooks y registro sin mocks de ORM ni contenedores externos.
3. **Persistencia dual transparente (`localStorage` ↔ PostgreSQL):**
   - Con sesión autenticada y `DATABASE_URL` configurada, `PlatformProvider` sincroniza Bitácora (`/api/me/journal`), Vigilancia (`/api/me/watchlist`) y Referidos (`/api/me/referrals`) contra Postgres (`apps/web/src/server/member-data.ts`).
   - En acceso por PIN de beta o sin `DATABASE_URL`, las vistas operan sobre `localStorage` encapsulado en `try/catch` sin fallar ni fabricar registros de servidor.

## Alternativas descartadas

- **Mockear Drizzle en pruebas unitarias o usar SQLite como sustituto:** no valida tipos `timestamptz`, arreglos `text[]`, índices parciales `WHERE` ni expresiones `CHECK` reales de PostgreSQL.
- **Exigir Docker o una rama remota de Neon para correr `pnpm test`:** rompe la ejecución offline en worktrees locales y agentes sin red/credenciales.
- **Usar `auth_user.id` directamente como llave primaria de todo el dominio:** acopla todas las tablas financieras y sociales al esquema interno de la librería de autenticación.

## Consecuencias

- Las reglas críticas de negocio fallan de forma atómica en Postgres incluso ante condiciones de carrera entre peticiones concurrentes.
- Arrancar una instancia nueva de `PGlite` y correr las 5 migraciones tarda varios segundos bajo carga paralela de Turborepo, por lo que las suites con base en memoria deben reutilizar instancia por archivo o declarar `testTimeout`/`hookTimeout` holgados.
- La migración completa de publicaciones sociales (`social_posts`, `social_comments`), seguidos y preferencias extendidas desde el navegador al servidor sigue el mismo patrón gradual ya abierto en `/api/me/*`.
