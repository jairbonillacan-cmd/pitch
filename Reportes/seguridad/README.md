# Auditoría Integral de Seguridad — PitchLab

> **Rama:** `ciberseguridad` (base `921f836` / `gemini-reestructura`)  
> **Fecha de corte:** 2026-11-12  
> **Estado actual:** **Olas 1, 2 y 3 completadas y verificadas en `ciberseguridad`** (`SEC-01`..`SEC-18`: **18/18 hallazgos cerrados** — 6 Altos, 7 Medios y 5 Bajos).

---

## 1. Veredicto directo: ¿hay fuga de datos o secretos en el código a simple vista?

1. **Secretos vivos propios de PitchLab en el repositorio:** **0 encontrados** en el árbol de trabajo ni en el historial de Git (`Stripe`, `Resend`, `OpenRouter`, `DATABASE_URL` de Neon, `Cloudflare Turnstile`, `API-Football`, `football-data.org`, `BETTER_AUTH_SECRET`). Tampoco se capturaron cookies de sesión reales, JWTs ni cabeceras `Authorization` dentro de `research/*/evidence/browser-traces/` o `Reportes/`.
2. **Datos y credenciales sensibles de terceros / desarrolladores en el repo (riesgo operativo y de higiene):** **Sí hay exposición activa** — claves públicas/identificadores de Firebase y DSN de Sentry embebidos en bundles investigados de LineMate, un código de acceso de terceros (`[REDACTED_PIN]`) que no fue redactado por completo en `Reportes/`, `research/` y el historial (`9133809`), `756` archivos de código fuente descompilado de competidores (`extracted_src/`), ID de proyecto de Neon (`<NEON_PROJECT_ID>`) en scripts locales y `65+` archivos con rutas absolutas y nombres de usuario del equipo (`SEC-14`, `SEC-18`).
3. **Fuga de datos comerciales de PitchLab hacia usuarios sin suscripción (`Cero-Fuga`):** **Sí hay fuga confirmada en código (`SEC-01`, `SEC-02`, `SEC-03`).** Cualquier visitante no autenticado o cuenta gratuita puede obtener picks pagados próximos a jugarse, probabilidades del modelo (`p`), momios de mercado, bordes (`edgePts`), señales completas de `Spacetime` y patas reales de parlays SGP directamente desde respuestas RSC/HTML de Next.js.

---

## 2. Controles positivos verificados

Durante la revisión se confirmó que varios controles fundamentales ya están correctamente implementados:

- **Consultas SQL parametrizadas:** El 100 % de las consultas en `packages/db/src/*.ts` y `apps/web/src/server/*.ts` usan Drizzle ORM con enlace parametrizado, sin concatenación dinámica de SQL.
- **Verificación de webhooks Stripe:** `verifyStripeSignature` en [`apps/web/src/server/billing/stripe-webhook.ts`](apps/web/src/server/billing/stripe-webhook.ts#L41-L59) valida firma HMAC-SHA256 sobre el cuerpo crudo, tolerancia temporal de `300` s, múltiples firmas `v1=` y comparación con longitud constante + `timingSafeEqual`; falla cerrado (`503`) si falta configuración en [`apps/web/app/api/webhooks/stripe/route.ts`](apps/web/app/api/webhooks/stripe/route.ts#L25-L27).
- **Vinculación de Checkout:** `POST /api/billing/checkout` asigna `client_reference_id` y `metadata[user_id]` únicamente desde la sesión autenticada en servidor (`requireMember`) y nunca desde parámetros del cliente.
- **Integración OAuth de X (Twitter) y avatares:** El flujo de vinculación de X usa `state`/PKCE de Better Auth, bloqueo transaccional `pg_advisory_xact_lock`, borrado inmediato de tokens OAuth a `null` dentro de la misma transacción (`profile-x.ts`) y sanitización estricta de `@handle`; la subida de avatar valida tipo MIME raster (`jpeg`/`png`/`webp`), re-codifica en servidor/canvas y acota tamaño.
- **Antiself-referral y edad calendario UTC:** Bloqueo de auto-referido en código y en DB (`CHECK (referrer_user_id <> referred_user_id)`), normalización canónica de puntos/`+tag` en Gmail y cálculo de mayoría de edad en UTC.
- **Protección contra XSS reflejado y open redirects en `?next=`:** El único `dangerouslySetInnerHTML` en [`apps/web/app/layout.tsx`](apps/web/app/layout.tsx#L24-L41) inyecta una constante estática (`THEME_INIT_SCRIPT`), y `sanitizeNextPath` en [`apps/web/src/server/beta-auth.ts`](apps/web/src/server/beta-auth.ts#L236-L253) restringe redirecciones a rutas internas `/app`.
- **Aislamiento de nombres de competidores en UI pública:** `TouchIQ`, `AztecaVet`, `LineMate` y `extracted_src` no se importan desde `apps/web`, `packages/ui` ni `apps/web/public/`.
- **Versiones bloqueadas en `pnpm-lock.yaml`:** El lockfile fija `next@15.5.29` y `better-auth@1.7.19`.

---

## 3. Índice maestro de hallazgos confirmados (`SEC-01` a `SEC-18`)

Distribución total: **18 hallazgos confirmados** (**6 Altos**, **7 Medios**, **5 Bajos**).

| ID | Sev. | Estado | Dominio | Título resumido | Ubicación principal | Reporte |
|---|---|---|---|---|---|---|
| `SEC-01` | **Alta** | **Remediado (Ola 1)** | `Cero-Fuga` / Paywall | `/p/[pickId]` desbloquea cualquier pick pagado y su análisis previo sin autenticación usando IDs predecibles | [`apps/web/src/server/platform-data.ts`](apps/web/src/server/platform-data.ts) | [02](02-CERO-FUGA-AUTH-Y-APIS.md#sec-01) |
| `SEC-02` | **Alta** | **Remediado (Ola 1)** | `Cero-Fuga` / RSC | `redactDatasetForVisitor` y `loadGameDetail` serializan `p`, `marketDecimal`, `conflictGroup`, `spacetime`, `projection` y mercados vía spread en props RSC | [`packages/ui/src/platform/access-guard.ts`](packages/ui/src/platform/access-guard.ts) | [02](02-CERO-FUGA-AUTH-Y-APIS.md#sec-02) |
| `SEC-03` | **Alta** | **Remediado (Ola 1)** | `Cero-Fuga` / SSR Público | `public-site-data.ts` carga el dataset crudo sin redactar y serializa parlays SGP reales y probabilidades en `/`, `/parlays`, `/como-funciona`, `/comunidad` y `/login` | [`apps/web/src/server/public-site-data.ts`](apps/web/src/server/public-site-data.ts) | [02](02-CERO-FUGA-AUTH-Y-APIS.md#sec-03) |
| `SEC-04` | **Alta** | **Remediado (Ola 1)** | Auth / Legal (+18) | Sesión de Paso 1 (incluidos menores `403` y usuarios sin términos) puede operar `/api/me/*` y pagar en `/api/billing/checkout`; `termsVersion` no se fija a `SIGNUP_CONSENT_VERSION`; `journal`/`watchlist` omiten `hasActivePaseTotal` | [`apps/web/src/server/session-user.ts`](apps/web/src/server/session-user.ts) | [02](02-CERO-FUGA-AUTH-Y-APIS.md#sec-04) |
| `SEC-05` | **Alta** | **Remediado (Ola 1)** | Beta PIN / Secretos | `pl_beta` desbloquea `Pase Total` + LLM en prod, oculta perfiles reales, acepta el placeholder de `.env.example` (56 chars) y lanza HTTP `500` si falta PIN en prod | [`apps/web/src/server/beta-auth.ts`](apps/web/src/server/beta-auth.ts) | [01](01-SECRETOS-DATOS-Y-CI.md#sec-05) / [02](02-CERO-FUGA-AUTH-Y-APIS.md#sec-05) |
| `SEC-06` | **Alta** | **Remediado (Ola 1)** | Pagos / Connect | Condición de carrera TOCTOU en `payableTransfers` vs `charge.refunded` + doble transferencia tras >24 h; `processStripeEvent` no atómico recorta doble periodo de cobro y `handleInvoicePaid` carece de bloqueo | [`packages/db/src/payouts.ts`](packages/db/src/payouts.ts) | [03](03-PAGOS-WEBHOOKS-Y-DB.md#sec-06) |
| `SEC-07` | **Media** | **Remediado (Ola 2)** | Integridad / DB | `POST /api/me/journal` deriva `fairDecimal`/etiquetas del catálogo de servidor, `sealHashOf` cubre todos los campos inmutables con HMAC y migración `0008` instala trigger `pick_immutable` | [`apps/web/app/api/me/journal/route.ts`](apps/web/app/api/me/journal/route.ts) | [03](03-PAGOS-WEBHOOKS-Y-DB.md#sec-07) |
| `SEC-08` | **Media** | **Remediado (Ola 2)** | Anti-abuso / Trials | Turnstile falla cerrado en prod; bloqueo en servidor de correos desechables; topes `deviceFpHash` (`<=2`) e `ipSubnetHash` (`<=3`/24h) con `pg_advisory_xact_lock` | [`apps/web/src/server/auth.ts`](apps/web/src/server/auth.ts) | [02](02-CERO-FUGA-AUTH-Y-APIS.md#sec-08) |
| `SEC-09` | **Media** | **Remediado (Ola 1)** | Auth / Logs | Omitir `BETTER_AUTH_URL` evade el bloqueo de producción por falta de `RESEND_API_KEY` e imprime enlaces mágicos en `stdout`; `BETTER_AUTH_SECRET` carece de longitud mínima | [`apps/web/src/server/auth.ts`](apps/web/src/server/auth.ts) | [01](01-SECRETOS-DATOS-Y-CI.md#sec-09) |
| `SEC-10` | **Media** | **Remediado (Ola 2)** | CI/CD / Supply Chain | `pre-mvp-snapshot.yml` restringido a `--data-only` (`.json` validados), permisos mínimos `contents: read`, `curl --config -` sin exponer URL en logs y `check-no-secrets.mjs` + `pnpm audit` en CI | [`.github/workflows/pre-mvp-snapshot.yml`](.github/workflows/pre-mvp-snapshot.yml) | [01](01-SECRETOS-DATOS-Y-CI.md#sec-10) |
| `SEC-11` | **Media** | **Remediado (Ola 2)** | Admin / RBAC | Guardia en `setViewerRole` + limpieza de `pl-sim-role`; validación SSR en `/app/admin` y `/app/tipstar`; `emailVerified === true` en `requireAdmin`; `previewToolsEnabled` restringido a admins en prod y tabla `admin_audit_logs` | [`packages/ui/src/platform/platform-provider.tsx`](packages/ui/src/platform/platform-provider.tsx) | [02](02-CERO-FUGA-AUTH-Y-APIS.md#sec-11) |
| `SEC-12` | **Media** | **Remediado (Ola 2)** | HTTP / CSRF / DoS | Headers HSTS/CSP/XFO/nosniff/Permissions-Policy en `next.config.mjs`; guardia CSRF `verifySameOriginMutation` en 12 rutas mutantes; IP de borde `trustedClientIp` y pipeline atómico Upstash (`INCR`+`PEXPIRE NX`) | [`apps/web/src/server/request-security.ts`](apps/web/src/server/request-security.ts) | [02](02-CERO-FUGA-AUTH-Y-APIS.md#sec-12) |
| `SEC-13` | **Media** | **Remediado (Ola 2)** | IA / Ingesta | Cortex IA respeta `ai.enabled`, cuota por socio, `zdr: true`, saneamiento anti-inyección + `<datos_partido>` y `FORBIDDEN_TERMS` sincronizados; ingesta ESPN valida rutas/IDs contra path traversal | [`apps/web/src/server/cortex.ts`](apps/web/src/server/cortex.ts) | [02](02-CERO-FUGA-AUTH-Y-APIS.md#sec-13) |
| `SEC-14` | **Baja** | **Remediado (Ola 3)** | Secretos / Higiene | Eliminados bundles/mapas con clave Firebase/DSN Sentry de LineMate, redactado `[REDACTED_PIN]` e IDs `<NEON_PROJECT_ID>` movidos a entorno; ACL privada (`0o700`/`0o600`) en `.local/9990.log` y patrones `AIza`/Sentry en `check-no-secrets.mjs` | [`scripts/local-9990.ps1`](scripts/local-9990.ps1) | [01](01-SECRETOS-DATOS-Y-CI.md#sec-14) |
| `SEC-15` | **Baja** | **Remediado (Ola 3)** | CFDI / PII | Purgado `pl-cfdi-v1` de `localStorage` (borrador solo en memoria), calendario real en `isValidRfc`/`validateMexicanRfc`, `S01` obligatorio en régimen `616` y errores de Facturapi sin PII | [`apps/web/src/server/billing/cfdi.ts`](apps/web/src/server/billing/cfdi.ts) | [01](01-SECRETOS-DATOS-Y-CI.md#sec-15) / [03](03-PAGOS-WEBHOOKS-Y-DB.md#sec-15) |
| `SEC-16` | **Baja** | **Remediado (Ola 3)** | Privacidad / UI | Columna `users.public_profile` (migración `0009`), sincronización en `PrefsTab.tsx` vía `PATCH /api/me/profile` y filtro activo en `publicProfileByHandle` (`404` en `/api/u/[handle]` y `/app/u/[handle]`) | [`packages/db/src/profiles.ts`](packages/db/src/profiles.ts) | [01](01-SECRETOS-DATOS-Y-CI.md#sec-16) |
| `SEC-17` | **Baja** | **Remediado (Ola 3)** | Pagos / Auth / Deps | Filtro `isActive` en tipstars, `checkHandleFormat` en `createTipstarCode`, unicidad + limpieza de tokens OAuth en `auth_account`, `trustedProviders`, validación `syncSubscription` + `cancelTrialEmails`, `trustedAppBaseUrl` y `"next": "^15.5.29"` | [`apps/web/src/server/billing/stripe-webhook.ts`](apps/web/src/server/billing/stripe-webhook.ts) | [03](03-PAGOS-WEBHOOKS-Y-DB.md#sec-17) |
| `SEC-18` | **Baja** | **Remediado (Ola 3)** | IP / Ingesta / Config | Eliminados `extracted_src/`, `*.js.map` y `pitchlab-brand.zip`; rutas locales normalizadas a `<REPO_ROOT>`; `understat` en `https://` + validación Wayback, timeouts/`redirect: "error"`/`SNAPSHOT_DATE`, `sanitizeCsvCell`, `.gitignore` y `turbo.json` | [`packages/ui/src/platform/platform-provider.tsx`](packages/ui/src/platform/platform-provider.tsx) | [01](01-SECRETOS-DATOS-Y-CI.md#sec-18) / [02](02-CERO-FUGA-AUTH-Y-APIS.md#sec-18) |

---

## 4. Elementos sujetos a validación externa (`B-01` a `B-06`)

Estos 6 puntos dependen del estado real en Vercel, Cloudflare, Stripe, Neon, Resend y GitHub Settings, por lo que no se les asigna severidad hasta validarse en los paneles correspondientes (ver detalle en [03-PAGOS-WEBHOOKS-Y-DB.md](03-PAGOS-WEBHOOKS-Y-DB.md#b-checklist-de-validación-en-despliegue-b-01-a-b-06)):

- **B-01:** Presencia y entropía real de variables en Vercel Production (`PITCHLAB_COOKIE_SECRET`, `PITCHLAB_BETA_CODE`, `BETTER_AUTH_URL`, `RESEND_API_KEY`, `TURNSTILE_*`, `UPSTASH_REDIS_*`, `CRON_SECRET`, `PITCHLAB_PREVIEW_TOOLS`).
- **B-02:** Headers de seguridad y reglas WAF/Rate-Limit en Cloudflare/Edge y sobrescritura de `X-Forwarded-For`.
- **B-03:** Suscripción de eventos del endpoint Stripe Connect (`account.updated` exclusivamente o eventos adicionales con `event.account`).
- **B-04:** Permisos por defecto de `GITHUB_TOKEN`, visibilidad del repo y reglas de protección en `main` y `prediction-lab`.
- **B-05:** Aislamiento de datos y backups PITR/R2 en el proyecto Neon `<NEON_PROJECT_ID>`.
- **B-06:** Verificación SPF/DKIM/DMARC en Resend (`EMAIL_FROM` y `accountLinking.trustedProviders` en Google/Apple OAuth).

---

## 5. Estructura de esta auditoría y plan sugerido de remediación (3 Olas)

### Documentos del reporte
1. [01-SECRETOS-DATOS-Y-CI.md](01-SECRETOS-DATOS-Y-CI.md) — Secretos, historial Git, variables de entorno, CI/CD, privacidad local, `extracted_src/` e higiene de rutas.
2. [02-CERO-FUGA-AUTH-Y-APIS.md](02-CERO-FUGA-AUTH-Y-APIS.md) — Brechas `Cero-Fuga` SSR/RSC, autenticación/sesiones/+18/Beta PIN, RBAC, headers/CSP, CSRF, Cortex IA e ingesta.
3. [03-PAGOS-WEBHOOKS-Y-DB.md](03-PAGOS-WEBHOOKS-Y-DB.md) — Stripe Webhooks/Connect/Cron, integridad del diario (`sealed_picks`), CFDI 4.0, checklist `B-01..B-06` y matriz completa vs `SECURITY.md`.

### Plan de remediación por olas
- **Ola 1 — COMPLETADA (`SEC-01`..`SEC-06`, `SEC-09`):**
  - Cerrados los 3 vectores `Cero-Fuga` (`/p/[pickId]` restringido a slugs semanales públicos con HTTP `404` y dataset acotado a 1 juego, `redactDatasetForVisitor` sin spreads y `loadGameDetail` sin mercados/factores en próximos, `public-site-data.ts` sobre dataset redactado).
  - Separado `requireStep1Member` de `requireMember` (`signupCompleted` obligatorio), revocación inmediata de `auth_session` + cookies ante `menor_de_edad`, versión fija `SIGNUP_CONSENT_VERSION` y guardia `requireActivePaseMember` en `POST /api/me/journal` y `POST /api/me/watchlist`.
  - Desactivado el PIN de beta en producción cuando las cuentas están activas (`isBetaPinEnabled`), limpiados placeholders en `.env.example`, priorizada sesión Better Auth sobre `pl_beta`, respuesta `403` limpia en `POST /api/beta/unlock` y bloqueo fail-closed de `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` y `RESEND_API_KEY` en `auth.ts`.
  - Reclamo atómico `FOR UPDATE SKIP LOCKED` (`processing_payout` + migración `0007_pagos_connect_atomicos.sql`), reconciliación de transferencias Connect >24 h (`stripeTransferFinder`), bandera `tipstar_payouts_enabled`, comparación constante de `CRON_SECRET`, transacción con bloqueos en `handleInvoicePaid` y protección contra doble recorte en `shiftStripeForClawback`.
- **Ola 2 — COMPLETADA (`SEC-07`, `SEC-08`, `SEC-10`, `SEC-11`, `SEC-12`, `SEC-13`):**
  - `POST /api/me/journal` deriva `fairDecimal`, etiquetas y `kickoffAt` del catálogo oficial en servidor; `sealHashOf` firma todos los campos inmutables con HMAC-SHA256 y la migración `0008_ola2_integridad_y_auditoria.sql` activa el trigger `pick_immutable` sobre `sealed_picks`.
  - `getAuth()` falla cerrado en producción cuando faltan `TURNSTILE_SECRET_KEY` o `NEXT_PUBLIC_TURNSTILE_SITE_KEY`; bloqueo en servidor de correos desechables (`isDisposableEmailDomain` en enlace mágico y paso 2); validación `verifyTurnstile` en `/api/me/signup` y límites anti-abuso por `deviceFpHash` (`<=2`) e `ipSubnetHash` (`<=3`/24h) serializados con `pg_advisory_xact_lock`.
  - Guardia en `setViewerRole` y purga de `pl-sim-role` cuando `!allowRoleSimulation`; `previewToolsEnabled` acotado a admins verificados en producción; protección SSR en `/app/admin` y `/app/tipstar`; requisito `emailVerified === true` en `requireAdmin` y bitácora `admin_audit_logs` en `/api/admin/flags` y `/api/admin/tipstars`.
  - Cabeceras HTTP de seguridad y `Content-Security-Policy` en `next.config.mjs`, guardia CSRF `verifySameOriginMutation` (`Origin` + `Sec-Fetch-Site` + `Content-Type`) en las 12 rutas mutantes por cookie, extracción de IP de borde `trustedClientIp`, caché ISR en OG y limitador atómico en Upstash (`/pipeline` con `INCR` + `PEXPIRE NX`) en endpoints públicos y sensibles.
  - `pre-mvp-snapshot.yml` endurecido con `--data-only` (solo `.json` validados, sin sobrescribir `.ts`), `permissions: contents: read` por defecto, `curl --config -` por stdin y guardia `check-no-secrets.mjs` + `pnpm audit` en `ci.yml`; Cortex IA respeta `ai.enabled`, `zdr: true`, cuota por socio, saneamiento anti-inyección y `FORBIDDEN_TERMS` completos, e ingesta ESPN bloquea path traversal.
- **Ola 3 — COMPLETADA (`SEC-14`..`SEC-18`):**
  - Eliminados los árboles descompilados de competidores (`extracted_src/`), mapas `*.js.map`, bundles con claves de terceros y `pitchlab-brand.zip`; redactadas menciones residuales de `[REDACTED_PIN]` y normalizadas rutas locales de estación de trabajo a `<REPO_ROOT>` en más de 100 documentos/evidencias; parametrizado `NEON_PROJECT_ID` en `local-9990.ps1` / `migrate-9990.ps1` y restringidos permisos de `.local/9990.log` (`0o700`/`0o600` + `icacls`).
  - Purgado el almacenamiento de PII fiscal en `localStorage` (`pl-cfdi-v1`), añadida validación de fecha calendario real en RFC, exigido `S01` en régimen `616` y saneados los errores de `stampInvoice` para no reflejar PII de Facturapi.
  - Persistida `users.public_profile` en PostgreSQL (migración `0009_ola3_privacidad_y_restricciones.sql`), conectada a `PATCH /api/me/profile` desde `PrefsTab.tsx` y aplicada en `publicProfileByHandle` (`404` en `/api/u/[handle]` y `/app/u/[handle]` cuando está apagada).
  - Filtrados tipstars inactivos en Connect y comisiones, validado `checkHandleFormat` (`RESERVED_HANDLES`) en `createTipstarCode`, añadidos índices únicos en `auth_account (provider_id, account_id)` y `subscriptions (provider, provider_customer_id)`, limpiados tokens OAuth tras el inicio de sesión (`scrubOAuthAccountTokens`), restringido `accountLinking.trustedProviders` a `["google", "apple"]`, conectado `cancelTrialEmails` en conversiones de Stripe, asegurado `trustedAppBaseUrl` y elevado el piso de Next.js a `"^15.5.29"`.
  - Endurecida la ingesta (`https://web.archive.org`, validación de timestamps Wayback y `SNAPSHOT_DATE`, `redirect: "error"` y timeouts de 15 s en `api-football`/`football-data`), neutralizada la inyección de fórmulas en `exportJournalCsv` (`sanitizeCsvCell`) y completados `.gitignore`, `.env.example`, `turbo.json` (`globalEnv`), `lint-codebase.mjs` y `check-no-secrets.mjs`.

> **Estado final:** Los **18 hallazgos (`SEC-01`..`SEC-18`)** de las 3 olas están remediados y cubiertos por pruebas automatizadas en la rama `ciberseguridad`. Solo restan las verificaciones operativas externas (`B-01`..`B-06`) en los paneles de Vercel, Cloudflare, Stripe, Neon, Resend y GitHub al momento del despliegue.
