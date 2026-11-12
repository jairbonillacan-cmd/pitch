# Auditoría Integral de Seguridad — PitchLab

> **Rama:** `ciberseguridad` (base `921f836` / `gemini-reestructura`)  
> **Fecha de corte:** 2026-11-12  
> **Modalidad:** Auditoría defensiva de solo lectura sobre el código fuente, configuración, esquema SQL, flujos CI/CD e historial de Git. **No se modificó código de aplicación ni se ejecutaron pruebas intrusivas contra entornos externos.**

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

| ID | Sev. | Dominio | Título resumido | Ubicación principal | Reporte |
|---|---|---|---|---|---|
| `SEC-01` | **Alta** | `Cero-Fuga` / Paywall | `/p/[pickId]` desbloquea cualquier pick pagado y su análisis previo sin autenticación usando IDs predecibles | [`apps/web/src/server/platform-data.ts`](apps/web/src/server/platform-data.ts#L194-L215) | [02](02-CERO-FUGA-AUTH-Y-APIS.md#sec-01) |
| `SEC-02` | **Alta** | `Cero-Fuga` / RSC | `redactDatasetForVisitor` y `loadGameDetail` serializan `p`, `marketDecimal`, `conflictGroup`, `spacetime`, `projection` y `socialPosts` vía spread en props RSC | [`packages/ui/src/platform/access-guard.ts`](packages/ui/src/platform/access-guard.ts#L90-L141) | [02](02-CERO-FUGA-AUTH-Y-APIS.md#sec-02) |
| `SEC-03` | **Alta** | `Cero-Fuga` / SSR Público | `public-site-data.ts` carga el dataset crudo sin redactar y serializa parlays SGP reales y probabilidades en `/`, `/parlays`, `/como-funciona`, `/comunidad` y `/login` | [`apps/web/src/server/public-site-data.ts`](apps/web/src/server/public-site-data.ts#L50-L138) | [02](02-CERO-FUGA-AUTH-Y-APIS.md#sec-03) |
| `SEC-04` | **Alta** | Auth / Legal (+18) | Sesión de Paso 1 (incluidos menores `403` y usuarios sin términos) puede operar `/api/me/*` y pagar en `/api/billing/checkout`; `termsVersion` no se fija a `SIGNUP_CONSENT_VERSION`; `journal`/`watchlist` omiten `hasActivePaseTotal` | [`apps/web/src/server/session-user.ts`](apps/web/src/server/session-user.ts#L9-L23) | [02](02-CERO-FUGA-AUTH-Y-APIS.md#sec-04) |
| `SEC-05` | **Alta** | Beta PIN / Secretos | `pl_beta` desbloquea `Pase Total` + LLM en prod, oculta perfiles reales, acepta el placeholder de `.env.example` (56 chars) y lanza HTTP `500` si falta PIN en prod | [`apps/web/src/server/viewer-access.ts`](apps/web/src/server/viewer-access.ts#L68-L71) | [01](01-SECRETOS-DATOS-Y-CI.md#sec-05) / [02](02-CERO-FUGA-AUTH-Y-APIS.md#sec-05) |
| `SEC-06` | **Alta** | Pagos / Connect | Condición de carrera TOCTOU en `payableTransfers` vs `charge.refunded` + doble transferencia tras >24 h; `processStripeEvent` no atómico recorta doble periodo de cobro y `handleInvoicePaid` carece de bloqueo | [`packages/db/src/payouts.ts`](packages/db/src/payouts.ts#L31-L63) | [03](03-PAGOS-WEBHOOKS-Y-DB.md#sec-06) |
| `SEC-07` | **Media** | Integridad / DB | `POST /api/me/journal` sella cuotas `fairDecimal` y etiquetas enviadas por el cliente sin validar catálogo ni `Pase Total`, y faltan trigger `pick_immutable` y rol restringido de DB | [`apps/web/app/api/me/journal/route.ts`](apps/web/app/api/me/journal/route.ts#L15-L48) | [03](03-PAGOS-WEBHOOKS-Y-DB.md#sec-07) |
| `SEC-08` | **Media** | Anti-abuso / Trials | Turnstile falla abierto en prod si falta una variable; `turnstile.ts` es código muerto; bloqueo de emails desechables es solo cliente; `deviceFpHash`/`ipSubnetHash` nunca bloquean trials | [`apps/web/src/server/auth.ts`](apps/web/src/server/auth.ts#L120-L129) | [02](02-CERO-FUGA-AUTH-Y-APIS.md#sec-08) |
| `SEC-09` | **Media** | Auth / Logs | Omitir `BETTER_AUTH_URL` evade el bloqueo de producción por falta de `RESEND_API_KEY` e imprime enlaces mágicos en `stdout`; `BETTER_AUTH_SECRET` carece de longitud mínima | [`apps/web/src/server/auth.ts`](apps/web/src/server/auth.ts#L189-L210) | [01](01-SECRETOS-DATOS-Y-CI.md#sec-09) |
| `SEC-10` | **Media** | CI/CD / Supply Chain | `pre-mvp-snapshot.yml` sincroniza y ejecuta código `.ts` desde `origin/prediction-lab` con `contents: write` y secretos, usa `@v4` sin SHA y expone `VERCEL_DEPLOY_HOOK_URL` potencial vía `curl -fsSL` | [`.github/workflows/pre-mvp-snapshot.yml`](.github/workflows/pre-mvp-snapshot.yml#L11-L85) | [01](01-SECRETOS-DATOS-Y-CI.md#sec-10) |
| `SEC-11` | **Media** | Admin / RBAC | `setViewerRole("tipstar")` sin guardia en prod; `/app/admin` y `/app/tipstar` sin validación SSR; `requireAdmin` no verifica `emailVerified`; `PITCHLAB_PREVIEW_TOOLS=1` expone simulador global | [`packages/ui/src/platform/platform-provider.tsx`](packages/ui/src/platform/platform-provider.tsx#L747-L757) | [02](02-CERO-FUGA-AUTH-Y-APIS.md#sec-11) |
| `SEC-12` | **Media** | HTTP / CSRF / DoS | Ausencia total de headers de seguridad/CSP; falta verificación `Origin` en 11/12 rutas mutantes; sin rate limit en OG/handles/perfil público; `x-forwarded-for[0]` falseable y Upstash no atómico | [`apps/web/next.config.mjs`](apps/web/next.config.mjs#L1-L43) | [02](02-CERO-FUGA-AUTH-Y-APIS.md#sec-12) |
| `SEC-13` | **Media** | IA / Ingesta | Cortex IA ignora `ai.enabled` y usa `Map` por instancia sin cuota; ingesta ESPN Liga MX permite traversal/inyección en caché ejecutada en CI privilegiado | [`apps/web/src/server/cortex.ts`](apps/web/src/server/cortex.ts#L105-L165) | [02](02-CERO-FUGA-AUTH-Y-APIS.md#sec-13) |
| `SEC-14` | **Baja** | Secretos / Higiene | Clave Firebase/DSN Sentry de LineMate en repo, código `7779` sin redactar por completo (y script `9133809` en historial), logs `.local/9990.log` con magic links y Neon ID `lively-cloud-08121218` | [`scripts/local-9990.ps1`](scripts/local-9990.ps1#L34-L67) | [01](01-SECRETOS-DATOS-Y-CI.md#sec-14) |
| `SEC-15` | **Baja** | CFDI / PII | PII fiscal en `localStorage` (`pl-cfdi-v1`), error crudo de Facturapi filtrando PII, uso `G03` fijo (inválido para `616`) y fechas imposibles en `RFC_RE` | [`apps/web/src/server/billing/cfdi.ts`](apps/web/src/server/billing/cfdi.ts#L11-L100) | [01](01-SECRETOS-DATOS-Y-CI.md#sec-15) / [03](03-PAGOS-WEBHOOKS-Y-DB.md#sec-15) |
| `SEC-16` | **Baja** | Privacidad / UI | Toggle `publicProfile` (`PrefsTab.tsx`) solo persiste en `localStorage`, mientras `GET /api/u/[handle]` expone perfiles públicos sin consultar bandera de privacidad | [`packages/ui/src/platform/club/account/PrefsTab.tsx`](packages/ui/src/platform/club/account/PrefsTab.tsx#L96) | [01](01-SECRETOS-DATOS-Y-CI.md#sec-16) |
| `SEC-17` | **Baja** | Pagos / Auth / Deps | `CRON_SECRET` con `!==`; tipstars inactivos crean Connect y acumulan comisión; `createTipstarCode` salta `RESERVED_HANDLES`; `auth_account` sin `UNIQUE` ni cifrado de tokens; `syncSubscription` sin UUID/FK ni `UNIQUE` cliente; falta `cancelTrialEmails`; `request.url` fallback; `"next": "^15.1.7"` | [`apps/web/app/api/cron/tipstar-payouts/route.ts`](apps/web/app/api/cron/tipstar-payouts/route.ts#L14-L18) | [03](03-PAGOS-WEBHOOKS-Y-DB.md#sec-17) |
| `SEC-18` | **Baja** | IP / Ingesta / Config | 65+ archivos con rutas locales; `756` archivos `extracted_src/`; `understat.ts` por `http://`, ingesta sin timeouts/`redirect: "error"`/`SNAPSHOT_DATE`; CSV formula injection; `.gitignore` y `turbo.json` incompletos; drift en `FORBIDDEN_TERMS` | [`packages/ui/src/platform/platform-provider.tsx`](packages/ui/src/platform/platform-provider.tsx#L989-L1020) | [01](01-SECRETOS-DATOS-Y-CI.md#sec-18) / [02](02-CERO-FUGA-AUTH-Y-APIS.md#sec-18) |

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

### Plan sugerido de remediación (pendiente de aprobación del fundador)
- **Ola 1 — Bloqueadores críticos de ingresos, pagos e integridad legal (`SEC-01`..`SEC-06`, `SEC-09`):**
  - Cerrar los 3 vectores `Cero-Fuga` (`/p/[pickId]`, `redactDatasetForVisitor`/`loadGameDetail`, `public-site-data.ts`).
  - Bloquear bypass de Paso 1/+18/términos en `requireMember` y `/api/billing/checkout`; exigir `hasActivePaseTotal` en `/api/me/journal` y `/api/me/watchlist`.
  - Desactivar PIN beta como pase pagado en producción, rechazar secretos de ejemplo en `beta-auth.ts`, corregir guardia `BETTER_AUTH_URL` en `auth.ts` y manejar `500` de `/api/beta/unlock`.
  - Corregir carrera TOCTOU y doble cobro/transferencia en `payouts.ts`, `connect.ts` y `stripe-webhook.ts`.
- **Ola 2 — Blindaje de APIs, Admin, Anti-abuso, Headers y CI (`SEC-07`, `SEC-08`, `SEC-10`, `SEC-11`, `SEC-12`, `SEC-13`):**
  - Sellar cuotas/picks desde el servidor en `/api/me/journal` + trigger `pick_immutable`.
  - Activar Turnstile fail-closed y validación de `deviceFpHash`/`ipSubnetHash`/`isDisposableEmailDomain` en servidor.
  - Blindar `setViewerRole`, SSR de `/app/admin` y `/app/tipstar`, `emailVerified === true` y `audit_log` + roles DB.
  - Agregar `Content-Security-Policy` con nonce y headers de `SECURITY.md`, validación `Origin` + `Content-Type: application/json`, rate-limiting Upstash y saneamiento en Cortex IA e ingesta ESPN.
  - Restringir `pre-mvp-snapshot.yml` a datos JSON/PR y agregar `gitleaks` + `pnpm audit`.
- **Ola 3 — Higiene, CFDI, privacidad y deuda restante (`SEC-14`..`SEC-18`):**
  - Limpiar `extracted_src/`, scripts/artefactos `7779`, rutas personales y logs `.local/9990.log`; corregir `.gitignore`, `turbo.json`, `.env.example`, `CFDI`, `publicProfile`, `"next": "^15.5.29"` y CSV injection.

> **Siguiente paso:** Indica qué ola o hallazgos específicos deseas que remediemos primero sobre esta rama `ciberseguridad`.
