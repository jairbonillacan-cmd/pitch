# Auditoría Integral de Seguridad — PitchLab

> **Rama:** `ciberseguridad` (base `921f836` / `gemini-reestructura`)  
> **Fecha de corte:** 2026-11-12  
> **Estado actual:** **Ola 1 remediada y verificada en `ciberseguridad`** (`SEC-01`, `SEC-02`, `SEC-03`, `SEC-04`, `SEC-05`, `SEC-06`, `SEC-09`). Olas 2 y 3 pendientes de ejecución.

---

## 1. Veredicto directo: ¿hay fuga de datos o secretos en el código a simple vista?

1. **Secretos vivos propios de PitchLab en el repositorio:** **0 encontrados** en el árbol de trabajo ni en el historial de Git (`Stripe`, `Resend`, `OpenRouter`, `DATABASE_URL` de Neon, `Cloudflare Turnstile`, `API-Football`, `football-data.org`, `BETTER_AUTH_SECRET`). Tampoco se capturaron cookies de sesión reales, JWTs ni cabeceras `Authorization` dentro de `research/*/evidence/browser-traces/` o `Reportes/`.
2. **Datos y credenciales sensibles de terceros / desarrolladores en el repo (riesgo operativo y de higiene):** **Sí hay exposición activa** — claves públicas/identificadores de Firebase y DSN de Sentry embebidos en bundles investigados de LineMate, un código de acceso de terceros (`7779`) que no fue redactado por completo en `Reportes/`, `research/` y el historial (`9133809`), `756` archivos de código fuente descompilado de competidores (`extracted_src/`), ID de proyecto de Neon (`lively-cloud-08121218`) en scripts locales y `65+` archivos con rutas absolutas y nombres de usuario del equipo (`SEC-14`, `SEC-18`).
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
| `SEC-07` | **Media** | Pendiente (Ola 2) | Integridad / DB | `POST /api/me/journal` sella cuotas `fairDecimal` y etiquetas enviadas por el cliente sin validar catálogo ni `Pase Total` (acceso de pase ya exigido en Ola 1; falta catálogo/trigger), y faltan trigger `pick_immutable` y rol restringido de DB | [`apps/web/app/api/me/journal/route.ts`](apps/web/app/api/me/journal/route.ts) | [03](03-PAGOS-WEBHOOKS-Y-DB.md#sec-07) |
| `SEC-08` | **Media** | Pendiente (Ola 2) | Anti-abuso / Trials | Turnstile falla abierto en prod si falta una variable; `turnstile.ts` es código muerto; bloqueo de emails desechables es solo cliente; `deviceFpHash`/`ipSubnetHash` nunca bloquean trials | [`apps/web/src/server/auth.ts`](apps/web/src/server/auth.ts) | [02](02-CERO-FUGA-AUTH-Y-APIS.md#sec-08) |
| `SEC-09` | **Media** | **Remediado (Ola 1)** | Auth / Logs | Omitir `BETTER_AUTH_URL` evade el bloqueo de producción por falta de `RESEND_API_KEY` e imprime enlaces mágicos en `stdout`; `BETTER_AUTH_SECRET` carece de longitud mínima | [`apps/web/src/server/auth.ts`](apps/web/src/server/auth.ts) | [01](01-SECRETOS-DATOS-Y-CI.md#sec-09) |
| `SEC-10` | **Media** | Pendiente (Ola 2) | CI/CD / Supply Chain | `pre-mvp-snapshot.yml` sincroniza y ejecuta código `.ts` desde `origin/prediction-lab` con `contents: write` y secretos, usa `@v4` sin SHA y expone `VERCEL_DEPLOY_HOOK_URL` potencial vía `curl -fsSL` | [`.github/workflows/pre-mvp-snapshot.yml`](.github/workflows/pre-mvp-snapshot.yml) | [01](01-SECRETOS-DATOS-Y-CI.md#sec-10) |
| `SEC-11` | **Media** | Pendiente (Ola 2) | Admin / RBAC | `setViewerRole("tipstar")` sin guardia en prod; `/app/admin` y `/app/tipstar` sin validación SSR; `requireAdmin` no verifica `emailVerified`; `PITCHLAB_PREVIEW_TOOLS=1` expone simulador global | [`packages/ui/src/platform/platform-provider.tsx`](packages/ui/src/platform/platform-provider.tsx) | [02](02-CERO-FUGA-AUTH-Y-APIS.md#sec-11) |
| `SEC-12` | **Media** | Pendiente (Ola 2) | HTTP / CSRF / DoS | Ausencia total de headers de seguridad/CSP; falta verificación `Origin` en 11/12 rutas mutantes; sin rate limit en OG/handles/perfil público; `x-forwarded-for[0]` falseable y Upstash no atómico | [`apps/web/next.config.mjs`](apps/web/next.config.mjs) | [02](02-CERO-FUGA-AUTH-Y-APIS.md#sec-12) |
| `SEC-13` | **Media** | Pendiente (Ola 2) | IA / Ingesta | Cortex IA ignora `ai.enabled` y usa `Map` por instancia sin cuota; ingesta ESPN Liga MX permite traversal/inyección en caché ejecutada en CI privilegiado | [`apps/web/src/server/cortex.ts`](apps/web/src/server/cortex.ts) | [02](02-CERO-FUGA-AUTH-Y-APIS.md#sec-13) |
| `SEC-14` | **Baja** | Pendiente (Ola 3) | Secretos / Higiene | Clave Firebase/DSN Sentry de LineMate en repo, código `7779` sin redactar por completo (y script `9133809` en historial), logs `.local/9990.log` con magic links y Neon ID `lively-cloud-08121218` | [`scripts/local-9990.ps1`](scripts/local-9990.ps1) | [01](01-SECRETOS-DATOS-Y-CI.md#sec-14) |
| `SEC-15` | **Baja** | Pendiente (Ola 3) | CFDI / PII | PII fiscal en `localStorage` (`pl-cfdi-v1`), error crudo de Facturapi filtrando PII, uso `G03` fijo (inválido para `616`) y fechas imposibles en `RFC_RE` | [`apps/web/src/server/billing/cfdi.ts`](apps/web/src/server/billing/cfdi.ts) | [01](01-SECRETOS-DATOS-Y-CI.md#sec-15) / [03](03-PAGOS-WEBHOOKS-Y-DB.md#sec-15) |
| `SEC-16` | **Baja** | Pendiente (Ola 3) | Privacidad / UI | Toggle `publicProfile` (`PrefsTab.tsx`) solo persiste en `localStorage`, mientras `GET /api/u/[handle]` expone perfiles públicos sin consultar bandera de privacidad | [`packages/ui/src/platform/club/account/PrefsTab.tsx`](packages/ui/src/platform/club/account/PrefsTab.tsx) | [01](01-SECRETOS-DATOS-Y-CI.md#sec-16) |
| `SEC-17` | **Baja** | Parcial (Ola 1/3) | Pagos / Auth / Deps | `CRON_SECRET` en tiempo constante ya corregido en Ola 1; restan validaciones de tipstar inactivo, `RESERVED_HANDLES`, `auth_account`, `syncSubscription`, `cancelTrialEmails` y `"next": "^15.1.7"` | [`apps/web/app/api/cron/tipstar-payouts/route.ts`](apps/web/app/api/cron/tipstar-payouts/route.ts) | [03](03-PAGOS-WEBHOOKS-Y-DB.md#sec-17) |
| `SEC-18` | **Baja** | Pendiente (Ola 3) | IP / Ingesta / Config | 65+ archivos con rutas locales; `756` archivos `extracted_src/`; `understat.ts` por `http://`, ingesta sin timeouts/`redirect: "error"`/`SNAPSHOT_DATE`; CSV formula injection; `.gitignore` y `turbo.json` incompletos; drift en `FORBIDDEN_TERMS` | [`packages/ui/src/platform/platform-provider.tsx`](packages/ui/src/platform/platform-provider.tsx) | [01](01-SECRETOS-DATOS-Y-CI.md#sec-18) / [02](02-CERO-FUGA-AUTH-Y-APIS.md#sec-18) |

---

## 4. Elementos sujetos a validación externa (`B-01` a `B-06`)

Estos 6 puntos dependen del estado real en Vercel, Cloudflare, Stripe, Neon, Resend y GitHub Settings, por lo que no se les asigna severidad hasta validarse en los paneles correspondientes (ver detalle en [03-PAGOS-WEBHOOKS-Y-DB.md](03-PAGOS-WEBHOOKS-Y-DB.md#b-checklist-de-validación-en-despliegue-b-01-a-b-06)):

- **B-01:** Presencia y entropía real de variables en Vercel Production (`PITCHLAB_COOKIE_SECRET`, `PITCHLAB_BETA_CODE`, `BETTER_AUTH_URL`, `RESEND_API_KEY`, `TURNSTILE_*`, `UPSTASH_REDIS_*`, `CRON_SECRET`, `PITCHLAB_PREVIEW_TOOLS`).
- **B-02:** Headers de seguridad y reglas WAF/Rate-Limit en Cloudflare/Edge y sobrescritura de `X-Forwarded-For`.
- **B-03:** Suscripción de eventos del endpoint Stripe Connect (`account.updated` exclusivamente o eventos adicionales con `event.account`).
- **B-04:** Permisos por defecto de `GITHUB_TOKEN`, visibilidad del repo y reglas de protección en `main` y `prediction-lab`.
- **B-05:** Aislamiento de datos y backups PITR/R2 en el proyecto Neon `lively-cloud-08121218`.
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
- **Ola 2 — Blindaje de APIs, Admin, Anti-abuso, Headers y CI (`SEC-07`, `SEC-08`, `SEC-10`, `SEC-11`, `SEC-12`, `SEC-13`):**
  - Sellar cuotas/picks desde el servidor en `/api/me/journal` + trigger `pick_immutable`.
  - Activar Turnstile fail-closed y validación de `deviceFpHash`/`ipSubnetHash`/`isDisposableEmailDomain` en servidor.
  - Blindar `setViewerRole`, SSR de `/app/admin` y `/app/tipstar`, `emailVerified === true` y `audit_log` + roles DB.
  - Agregar `Content-Security-Policy` con nonce y headers de `SECURITY.md`, validación `Origin` + `Content-Type: application/json`, rate-limiting Upstash y saneamiento en Cortex IA e ingesta ESPN.
  - Restringir `pre-mvp-snapshot.yml` a datos JSON/PR y agregar `gitleaks` + `pnpm audit`.
- **Ola 3 — Higiene, CFDI, privacidad y deuda restante (`SEC-14`..`SEC-18`):**
  - Limpiar `extracted_src/`, scripts/artefactos `7779`, rutas personales y logs `.local/9990.log`; corregir `.gitignore`, `turbo.json`, `.env.example`, `CFDI`, `publicProfile`, `"next": "^15.5.29"` y CSV injection.

> **Siguiente paso:** Indica qué ola o hallazgos específicos deseas que remediemos primero sobre esta rama `ciberseguridad`.
