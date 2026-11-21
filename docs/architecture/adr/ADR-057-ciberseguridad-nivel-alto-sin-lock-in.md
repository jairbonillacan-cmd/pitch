# ADR-057 · Ciberseguridad Nivel ALTO, Anti-Scraping, Inmutabilidad SQL (`0025`) y Observabilidad Sin Lock-In

- **Estado:** Aceptada
- **Fecha:** 2026-11-21
- **Rama origen:** `gemini-dos`
- **Relacionadas:** `ADR-021`/`ADR-025` (Frontera `Cero-Fuga`), `ADR-031`/`ADR-032` (PostgreSQL/Drizzle y Better Auth), `ADR-050` (Portabilidad sin lock-in), `ADR-055` (Endurecimiento inicial y `Cero-Fuga`), `ADR-056` (Arquitectura *Constraint-First* y regla `require-api-wrapper`).

---

## Contexto

PitchLab expone `86` endpoints HTTP en `apps/web/app/api/**` que sirven proyecciones cuantitativas propietarias (`Spacetime Suite v5.1`), momios anclados, probabilidades en vivo, gestión de alertas, comunidad, cobros SPEI/cupones, administración y derechos ARCO. Al crecer la superficie de producto surgieron cinco riesgos estructurales que debían resolverse sin introducir dependencia de proveedores cloud (`ADR-050`):

1. **Omisión accidental de controles en handlers individuales:** repetir manualmente checks de CSRF, autenticación, pase activo, rol admin, cabeceras de caché y manejo de errores en cada `route.ts` es frágil y propenso a desvíos.
2. **Rate-limit dependiente de memoria local o de un proveedor SaaS obligatorio:** los límites por proceso fallan en despliegues multi-instancia y exigir Redis propietario o WAF de proveedor rompería la portabilidad de `ADR-050`.
3. **Extracción automatizada (*scraping*), IDOR y exposición de identificadores externos:** endpoints en vivo, búsqueda y noticias necesitaban control de sesión, límites de paginación estrictos, detección por velocidad de extracción de recursos distintos, watermarking forense e IDs opacos libres de `FD-16`.
4. **Integridad probatoria de `sealed_picks`:** impedir la alteración retroactiva, edición post-sellado o borrado de picks en Mi Récord exige una garantía en el motor de base de datos, no solo en la UI.
5. **CSP estricta sin romper ISR y observabilidad segura:** eliminar `'unsafe-inline'` en scripts de rutas dinámicas/privadas sin invalidar el caché público ISR, y auditar eventos de abuso sin filtrar tokens, correos, cookies ni stack traces en logs.

---

## Decisión

### 1. Gobernanza del 100 % de `/api/**` mediante 6 wrappers canónicos (`apps/web/src/server/api-guards.ts`)

Todo endpoint en `apps/web/app/api/**/route.ts` debe exportar sus handlers a través de una de las 6 primitivas tipadas (`GuardedRouteHandler<TParams>` compatible con Next.js 15), verificadas mecánicamente por la regla `require-api-wrapper` (`scripts/lint-codebase.mjs`):

- `withPublicRead`: lecturas públicas acotadas con rate-limit, cabeceras `X-Content-Type-Options: nosniff` y opción de validación same-origin.
- `withSessionRead`: lecturas autenticadas (con `allowBeta` / `allowBetaPin` explícito solo en rutas del club habilitadas para PIN beta, `requireFullAccess` opcional, watermarking forense opcional `X-PitchLab-Trace` y detector *scraping velocity*).
- `withMemberMutation`: mutaciones autenticadas con verificación obligatoria de origen CSRF (`verifySameOriginMutation`), rate-limit y sanitización de errores (`SanitizedErrorPayload`).
- `withActivePaseMutation`: mutaciones que además exigen `hasActivePaseTotal` vigente (p. ej. `/api/parlays/sgp`, `/api/alerts`, `/api/alerts/copilot`, `/api/alerts/batch`).
- `withAdminMutation`: exige `requireAdmin` (correo verificado + lista `PITCHLAB_ADMIN_EMAILS`), `allowGet` explícito cuando lee telemetría administrativa y `Cache-Control: private, no-store`.
- `withCronSecret`: exige `Authorization: Bearer <CRON_SECRET>` (`requireCronAuth`) sobre cualquier scheduler HTTP estándar (`ADR-050`).

Cobertura vigente: **`86/86` rutas** (`82` envueltas directamente + `4` excepciones explícitas endurecidas en `API_WRAPPER_EXEMPTIONS`: `auth/[...all]` con rate-limit también en `GET`, `webhooks/stripe` con firma Stripe, `beta/unlock` y `beta/logout`).

### 2. Rate-limit distribuido portable en PostgreSQL `UNLOGGED` + Redis opt-in + *fail-closed*

- **Migración `packages/db/migrations/0025_seguridad_rate_limit_inmutable_y_preferencias.sql`:** crea la tabla **`UNLOGGED security_rate_buckets`** (`PRIMARY KEY (bucket, subject_key, window_start)` + índice sobre `expires_at`) operada atómicamente vía `incrementPgRateBucket` y `pruneExpiredPgRateBuckets` (`packages/db/src/security-rate-limit.ts`). Al ser `UNLOGGED` evita sobrecarga WAL en contadores efímeros y funciona sobre cualquier PostgreSQL estándar (`ADR-050`).
- **Jerarquía de almacenamiento (`apps/web/src/server/request-security.ts`):**
  1. Redis REST (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`) solo como acelerador **opt-in**.
  2. PostgreSQL estándar (`security_rate_buckets`) como respaldo distribuido canónico.
  3. Política ***fail-closed* (`HTTP 503` con `Retry-After: 30`):** cuando `NODE_ENV === "production"` y `failClosed: true`, si ningún almacén distribuido responde, se rechaza la solicitud en lugar de caer a memoria por proceso.
- **IP cliente portable (`trustedClientIp`):** configurable vía `PITCHLAB_TRUSTED_PROXY=auto|cloudflare|fly|vercel|xff-last`, soportando `Forwarded` (RFC 7239), `X-Real-IP`, `fly-client-ip`, `true-client-ip`, `cf-connecting-ip` y `x-forwarded-for`.

### 3. Defensa activa anti-scraping, watermarking `X-PitchLab-Trace`, anti-IDOR y límites SQL

- **Cierre de superficies de lectura:** `/api/live/scoreboard`, `/api/live/alerts`, `/api/live/games/[gameId]`, `/api/search/players`, `/api/search/referees` y `/api/me/coupons/preview` requieren sesión a través de `withSessionRead`.
- **Detector *scraping velocity* (`api-guards.ts`):** rastrea la cardinalidad de recursos distintos solicitados por identidad en ventanas de `5 min`:
  - `>= 35` recursos distintos (`VELOCITY_WARN_THRESHOLD`): registra evento `scraping_velocity` en auditoría.
  - `>= 50` recursos distintos (`VELOCITY_THROTTLE_THRESHOLD`): responde `HTTP 429` sin revocar aún la sesión.
  - `>= 75` recursos distintos (`VELOCITY_REVOKE_THRESHOLD`): invoca `revokeUserActiveSessions` sobre `auth_session`, registra `session_revoked` (`critical`) y bloquea la cuenta/sesión con `HTTP 403 sesion_revocada`.
- **Watermarking invisible (`apps/web/src/server/watermark.ts`):** `applyMemberWatermarkHeader` emite la cabecera `X-PitchLab-Trace` con un HMAC-SHA256 diario truncado a `32` caracteres hexadecimales por `userId` (`PITCHLAB_WATERMARK_SECRET` con respaldo `BETTER_AUTH_SECRET`), verificable en tiempo constante (`verifyMemberWatermark`) sobre el día UTC actual y el anterior.
- **Límites SQL `<= 40`, anti-IDOR e IDs opacos:** paginación dura `<= 40` (y ventanas `ROW_NUMBER()` donde corresponde) en rutas de administración, comunidad, ranking, alertas, árbitros y live; `recordIdorAttempt` registra intentos sobre recursos ajenos; y `apps/web/src/server/espn-news.ts` + `/api/news/article` utilizan IDs opacos firmados con HMAC (`OpaqueResourceId`) en lugar de URLs o identificadores de proveedor (`FD-16`).

### 4. CSP estricta con `nonce` por request y SHA-256 hash sin romper ISR (`apps/web/middleware.ts`)

- En rutas dinámicas y del club (`/app`, `/app/:path*`, `/login`, `/signup`, `/onboarding`, `/precio`, `/canjear`), `middleware.ts` genera un `nonce` criptográfico de 128 bits por solicitud y aplica `script-src 'self' 'nonce-<n>' 'sha256-<THEME_INIT_SCRIPT>' 'strict-dynamic'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'` y `form-action 'self'`.
- El script mínimo de inicialización de tema (`apps/web/src/theme-init-script.ts`) se autoriza mediante su digest SHA-256 precomputado, eliminando alertas CSP sin abrir `'unsafe-inline'` para scripts.
- Las páginas públicas cacheables (`/`, `/resultados`, `/motores`, `/verificacion`, `/blog/*`, `/legal/*`) quedan fuera del matcher de `nonce` por request para conservar su comportamiento ISR (`revalidate`).
- Los orígenes de imágenes se extienden únicamente vía variables de entorno (`PITCHLAB_MEDIA_ORIGINS`, `AVATAR_PUBLIC_BASE_URL`, `S3_AVATAR_*`, `GCS_AVATAR_PUBLIC_BASE_URL`) y `challenges.cloudflare.com` se omite si `PITCHLAB_CAPTCHA_PROVIDER=none`.
- Sobre `/api/*`, `middleware.ts` bloquea mutaciones con `Sec-Fetch-Site: cross-site` excepto los endpoints legítimamente externos (`/api/webhooks/stripe`, `/api/cron/*` y baja RFC 8058 `/api/me/email-preferences/unsubscribe`) y fuerza `Cache-Control: private, no-store` en `/api/me/*` y `/api/admin/*`.

### 5. Inmutabilidad SQL de `sealed_picks`, telemetría de abuso y logging redactado

- **Trigger SQL `sealed_picks_immutability_trg` (`0025`):**
  - En `INSERT`: fija `NEW.sealed_at := clock_timestamp()` y rechaza todo registro con `sealed_at >= kickoff_at` (`RETROACTIVE_SEALED_PICK_FORBIDDEN`), admitiendo estampas históricas solo bajo el GUC explícito de pruebas `pitchlab.allow_historical_seed = 'on'`.
  - En `DELETE`: bloquea borrados directos mientras exista el usuario (`IMMUTABLE_SEALED_PICK_DELETE`), preservando únicamente la cascada legal de eliminación de cuenta.
  - En `UPDATE`: rechaza cualquier modificación si `OLD.status <> 'pending'` (`IMMUTABLE_SETTLED_PICK_UPDATE`), protege las `19` columnas selladas (`IMMUTABLE_SEALED_PICK_UPDATE`), permite añadir `note` solo una vez si era `NULL` e impide escribir campos de liquidación mientras `status = 'pending'`.
- **Auditoría verificable pública sin servidor (`/verificacion`):** `apps/web/app/verificacion/page.tsx` + `VerificationSurface.tsx` recalculan huellas SHA-256 localmente mediante WebCrypto API sin transmitir recibos al backend.
- **Tabla `security_abuse_events` (`0025`), API y panel Admin:** registra eventos tipados (`rate_limit`, `scraping_velocity`, `session_revoked`, `csrf_rejected`, `idor_attempt` con severidad `low|medium|high|critical`), expuestos por **`GET /api/admin/security-abuse`** (`withAdminMutation`, `limit <= 40`, lista blanca `SAFE_DETAIL_KEYS`, `ipHashPrefix` de 12 chars y `userRef` truncado) en la pestaña **`Seguridad & Anti-Scraping`** (`AdminSecurityAbuseSection.tsx`) de `/app/admin`.
- **Logger seguro (`apps/web/src/server/safe-logger.ts`):** `logSecurityEvent`, `redactSensitiveValue` y `hashIpForAudit` (SHA-256 con sal `PITCHLAB_AUDIT_SALT`) redactan JWTs, cabeceras `Authorization`/`Cookie`, prefijos de llaves, correos, credenciales en URLs y stack traces antes de imprimir JSON.

---

## Alternativas descartadas

1. **Delegar rate-limiting, anti-scraping y reglas CSRF exclusivamente a Cloudflare WAF o Vercel Firewall:** descartado por violar `ADR-050` (portabilidad total entre hostings) e impedir pruebas deterministas en CI y PGlite.
2. **Asegurar la inmutabilidad de `sealed_picks` solo en la capa de aplicación TypeScript:** descartado porque una consulta errónea o un endpoint futuro podría alterar el historial; el trigger PostgreSQL hace cumplir la regla para cualquier cliente SQL.
3. **Inyectar `nonce` CSP en el `middleware.ts` para todas las rutas incluyendo landing y blog:** descartado porque deshabilitaría el almacenamiento en caché estático/ISR de las páginas públicas.

---

## Consecuencias

- **Positivas:** postura de seguridad homogénea y verificada mecánicamente en `86/86` rutas API; cero lock-in de infraestructura (`ADR-050`); inmutabilidad criptográfica y de motor SQL en `sealed_picks`; mitigación activa contra extracción automatizada con revocación de sesión y trazabilidad forense `X-PitchLab-Trace`; observabilidad de abuso en `/app/admin` libre de secretos y PII cruda.
- **Compromisos:** antes del despliegue a producción deben aplicarse la migración `0025` (y `0026`) vía `scripts/migrate-prod.ps1` y configurarse las variables recomendadas por entorno (`PITCHLAB_TRUSTED_PROXY`, `PITCHLAB_WATERMARK_SECRET`, `PITCHLAB_AUDIT_SALT`); toda nueva ruta API debe elegir explícitamente su wrapper en `api-guards.ts` o fallará en `scripts/lint-codebase.mjs`.

---

## Validación verificada

- **Linter de frontera:** `scripts/lint-codebase.mjs` verifica `require-api-wrapper: 0` violaciones sobre las `86/86` rutas API y `no-cloud-sdk-lockin: 0`.
- **Pruebas unitarias y formales (`8bc5eeb0`):**
  - `apps/web/tests/api-guards.test.ts` (wrappers, CSRF, rate-limit, watermark, error sanitization): **PASS**.
  - `apps/web/tests/state-machines-fc.test.ts`: máquinas `fc.commands` sobre PGlite real con migración `0025` (`sealed_picks`) y `withSessionRead` (*scraping velocity* `200 → 429 → 403` + revocación): **PASS**.
  - `apps/web/tests/property-invariants.test.ts` (`Cero-Fuga` y `FD-16`): **PASS**.
- **Verificación visual y consola en servidor loopback (`8bc5eeb0`, `23` rutas / `92` PNGs):** `0` errores CSP, `0` errores de consola y `0` respuestas `HTTP 5xx`, incluyendo la nueva pestaña `Seguridad & Anti-Scraping` en `/app/admin` y el verificador público `/verificacion`.
