# ADR-057 · Ciberseguridad Nivel ALTO, Anti-Scraping, Inmutabilidad SQL (`0025`/`0027`) y Observabilidad Sin Lock-In

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
  4. **Excepción local estrictamente *opt-in* (`allowLocalLoopbackMemoryRateLimit` en `apps/web/src/server/request-security.ts`):** habilita respaldo en memoria exclusivamente para pruebas Playwright locales sobre `next start` cuando se cumplen **simultáneamente** todas las condiciones: `PITCHLAB_LOCAL_MEMORY_RATE_LIMIT=1`, `isHostedRemoteEnvironment() === false` (sin `PITCHLAB_HOSTED=1`, `VERCEL`, `K_SERVICE`, `FLY_APP_NAME`, `RAILWAY_*`, `RENDER`, `AWS_EXECUTION_ENV`, etc.), ausencia de Redis (`UPSTASH_REDIS_*`) y de `DATABASE_URL`, y `BETTER_AUTH_URL` ausente o acotada a origen loopback (`localhost` / `127.0.0.1` / `[::1]`). En producción real y en cualquier despliegue hospedado, la política permanece **100 % *fail-closed***.
- **IP cliente portable (`trustedClientIp`):** configurable vía `PITCHLAB_TRUSTED_PROXY=auto|cloudflare|fly|vercel|xff-last`, soportando `Forwarded` (RFC 7239), `X-Real-IP`, `fly-client-ip`, `true-client-ip`, `cf-connecting-ip` y `x-forwarded-for`.

### 3. Defensa activa anti-scraping, watermarking `X-PitchLab-Trace`, anti-IDOR, límites SQL y fronteras de datos

- **Cierre de superficies de lectura:** `/api/live/scoreboard`, `/api/live/alerts`, `/api/live/games/[gameId]`, `/api/search/players`, `/api/search/referees` y `/api/me/coupons/preview` requieren sesión a través de `withSessionRead`.
- **Detector *scraping velocity* (`api-guards.ts`):** rastrea la cardinalidad de recursos distintos solicitados por identidad en ventanas de `5 min`:
  - `>= 35` recursos distintos (`VELOCITY_WARN_THRESHOLD`): registra evento `scraping_velocity` en auditoría.
  - `>= 50` recursos distintos (`VELOCITY_THROTTLE_THRESHOLD`): responde `HTTP 429` sin revocar aún la sesión.
  - `>= 75` recursos distintos (`VELOCITY_REVOKE_THRESHOLD`): invoca `revokeUserActiveSessions` sobre `auth_session`, registra `session_revoked` (`critical`) y bloquea la cuenta/sesión con `HTTP 403 sesion_revocada`.
- **Watermarking invisible (`apps/web/src/server/watermark.ts`):** `applyMemberWatermarkHeader` emite la cabecera `X-PitchLab-Trace` con un HMAC-SHA256 diario truncado a `32` caracteres hexadecimales por `userId` (`PITCHLAB_WATERMARK_SECRET` con respaldo `BETTER_AUTH_SECRET`), verificable en tiempo constante (`verifyMemberWatermark`) sobre el día UTC actual y el anterior.
- **Límites SQL `<= 40`, anti-IDOR e IDs opacos:** paginación dura `<= 40` (y ventanas `ROW_NUMBER()` donde corresponde) en rutas de administración, comunidad, ranking, alertas, árbitros y live; `recordIdorAttempt` registra intentos sobre recursos ajenos; y `apps/web/src/server/espn-news.ts` + `/api/news/article` utilizan IDs opacos firmados con HMAC (`OpaqueResourceId`) en lugar de URLs o identificadores de proveedor (`FD-16`).
- **Endurecimiento de sinks de navegación (`sanitizeInternalHref`):** `packages/ui/src/platform/navigation-helpers.ts` expone `sanitizeInternalHref`, aplicado en todos los sinks de navegación interna (`PlatformClientBridge`, `ContextualBackButton`, `CommandPaletteModal`, `CanjearCouponView`, `RefereesClubView`, `VerificationSurface`, `platform-provider.tsx` y controles de redirección), permitiendo únicamente rutas relativas `/…` y rechazando esquemas externos (`javascript:`, `https://`), rutas protocol-relative (`//`), barras invertidas (`\`) y caracteres de control.
- **Bloqueo centralizado de casas y frescura *fail-closed* de cuotas (`packages/contracts/src/branded.ts`, `apps/web/src/server/spacetime.ts`, `apps/web/src/server/book-quotes.ts`):** `BLOCKED_BOOK_IDS`, `PERMITTED_MARKET_QUOTE_BOOK_IDS`, `isBlockedMarketQuoteBook` e `isPermittedMarketQuoteBook` centralizan el bloqueo de casas no autorizadas/sintéticas y la lista blanca permitida en ingesta, servidor y UI; junto con `isMarketFresh` (frescura *fail-closed* `<= 72 h` y tolerancia anti-futuro `-6 h`, rechazando sellos ausentes, malformados, caducos o adelantados).
- **Saneo de `photoKey` en serialización RSC/API (`FD-16`):** `apps/web/src/server/{compare,player-search,props-explorer,team-profile}.ts` filtran `photoKey` y `fallbackPhotoKey` a través de `resolvePersonPhotoUrl` antes de serializar payloads RSC/API, evitando exponer URLs crudas externas (`a.espncdn.com`) en el cable.

### 4. CSP estricta con `nonce` por request y SHA-256 hash sin romper ISR (`apps/web/middleware.ts`)

- En rutas dinámicas y del club (`/app`, `/app/:path*`, `/login`, `/signup`, `/onboarding`, `/precio`, `/canjear`), `middleware.ts` genera un `nonce` criptográfico de 128 bits por solicitud y aplica `script-src 'self' 'nonce-<n>' 'sha256-<THEME_INIT_SCRIPT>' 'strict-dynamic'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'` y `form-action 'self'`.
- El script mínimo de inicialización de tema (`apps/web/src/theme-init-script.ts`) se autoriza mediante su digest SHA-256 precomputado, eliminando alertas CSP sin abrir `'unsafe-inline'` para scripts.
- Las páginas públicas cacheables (`/`, `/resultados`, `/motores`, `/verificacion`, `/blog/*`, `/legal/*`) quedan fuera del matcher de `nonce` por request para conservar su comportamiento ISR (`revalidate`).
- Los orígenes de imágenes se extienden únicamente vía variables de entorno (`PITCHLAB_MEDIA_ORIGINS`, `AVATAR_PUBLIC_BASE_URL`, `S3_AVATAR_*`, `GCS_AVATAR_PUBLIC_BASE_URL`) y `challenges.cloudflare.com` se omite si `PITCHLAB_CAPTCHA_PROVIDER=none`.
- Sobre `/api/*`, `middleware.ts` bloquea mutaciones con `Sec-Fetch-Site: cross-site` excepto los endpoints legítimamente externos (`/api/webhooks/stripe`, `/api/cron/*` y baja RFC 8058 `/api/me/email-preferences/unsubscribe`) y fuerza `Cache-Control: private, no-store` en `/api/me/*` y `/api/admin/*`.

### 5. Inmutabilidad SQL de `sealed_picks` (`0025`/`0027`), recibo verificable, telemetría de abuso y logging redactado

- **Trigger SQL `sealed_picks_immutability_trg` (`0025` + `0027_sealed_picks_insert_status_guard.sql`, `28` migraciones SQL `0000`–`0027`):**
  - En `INSERT` (`BEFORE INSERT`, endurecido en `0027`): rechaza cualquier inserción pre-liquidada (`PRE_SETTLED_INSERT_FORBIDDEN` si `NEW.status <> 'pending'` o si `settled_at`, `closing_decimal`, `clv_pct` o `parlay_leg_results` no son `NULL`), alinea el reloj con tolerancia estricta de **`±5 s`** sobre `NEW.sealed_at` (reasignando `clock_timestamp()` cuando es nulo o diverge `> 5 s`) y rechaza todo registro retroactivo con `sealed_at >= kickoff_at` (`RETROACTIVE_SEALED_PICK_FORBIDDEN`), admitiendo estampas históricas solo bajo el GUC explícito de pruebas `pitchlab.allow_historical_seed = 'on'`.
  - En `DELETE`: bloquea borrados directos mientras exista el usuario (`IMMUTABLE_SEALED_PICK_DELETE`), preservando únicamente la cascada legal de eliminación de cuenta.
  - En `UPDATE`: rechaza cualquier modificación si `OLD.status <> 'pending'` (`IMMUTABLE_SETTLED_PICK_UPDATE`), protege las `19` columnas selladas (`IMMUTABLE_SEALED_PICK_UPDATE`), permite añadir `note` solo una vez si era `NULL` e impide escribir campos de liquidación mientras `status = 'pending'`.
- **Separación de huella pública y firma interna (`apps/web/src/server/member-data.ts`) + verificador sin servidor (`/verificacion`):**
  - `sealHashOf` calcula el digest público `SHA-256` sobre `canonicalSealPayload`, permitiendo que cualquier usuario recalcule y verifique recibos 100 % en cliente en `/verificacion` (`apps/web/app/verificacion/page.tsx` + `VerificationSurface.tsx` mediante WebCrypto API, sin transmitir recibos al backend ni exponer secretos).
  - `sealSignatureOf` genera por separado la firma interna `HMAC-SHA256` con `BETTER_AUTH_SECRET` para auditoría interna del servidor, evitando mezclar integridad verificable públicamente con autenticación por secreto compartido.
- **Tabla `security_abuse_events` (`0025`), API y panel Admin:** registra eventos tipados (`rate_limit`, `scraping_velocity`, `session_revoked`, `csrf_rejected`, `idor_attempt` con severidad `low|medium|high|critical`), expuestos por **`GET /api/admin/security-abuse`** (`withAdminMutation`, `limit <= 40`, lista blanca `SAFE_DETAIL_KEYS`, `ipHashPrefix` de 12 chars y `userRef` truncado) en la pestaña **`Seguridad & Anti-Scraping`** (`AdminSecurityAbuseSection.tsx`) de `/app/admin`.
- **Logger seguro (`apps/web/src/server/safe-logger.ts`):** `logSecurityEvent`, `redactSensitiveValue` y `hashIpForAudit` (SHA-256 con sal `PITCHLAB_AUDIT_SALT`) redactan JWTs, cabeceras `Authorization`/`Cookie`, prefijos de llaves, correos, credenciales en URLs y stack traces antes de imprimir JSON.

---

## Alternativas descartadas

1. **Delegar rate-limiting, anti-scraping y reglas CSRF exclusivamente a Cloudflare WAF o Vercel Firewall:** descartado por violar `ADR-050` (portabilidad total entre hostings) e impedir pruebas deterministas en CI y PGlite.
2. **Asegurar la inmutabilidad de `sealed_picks` solo en la capa de aplicación TypeScript:** descartado porque una consulta errónea o un endpoint futuro podría alterar el historial; el trigger PostgreSQL hace cumplir la regla para cualquier cliente SQL.
3. **Inyectar `nonce` CSP en el `middleware.ts` para todas las rutas incluyendo landing y blog:** descartado porque deshabilitaría el almacenamiento en caché estático/ISR de las páginas públicas.

---

## Consecuencias

- **Positivas:** postura de seguridad homogénea y verificada mecánicamente en `86/86` rutas API (`82` envueltas + `4` exenciones endurecidas); cero lock-in de infraestructura (`ADR-050`); inmutabilidad criptográfica y de motor SQL (`0025`/`0027`) en `sealed_picks` con separación limpia entre `sealHashOf` público y `sealSignatureOf` HMAC interno; navegación, casas, frescura de momios y `photoKey` blindados contra inyecciones y fugas `FD-16`; mitigación activa contra extracción automatizada con revocación de sesión y trazabilidad forense `X-PitchLab-Trace`; observabilidad de abuso en `/app/admin` libre de secretos y PII cruda.
- **Compromisos:** antes del despliegue a producción deben aplicarse las migraciones `0025`–`0027` (`28` migraciones SQL `0000`–`0027`) vía `scripts/migrate-prod.ps1` y configurarse las variables recomendadas por entorno (`PITCHLAB_TRUSTED_PROXY`, `PITCHLAB_WATERMARK_SECRET`, `PITCHLAB_AUDIT_SALT`); toda nueva ruta API debe elegir explícitamente su wrapper en `api-guards.ts` o fallará en `scripts/lint-codebase.mjs`.

---

## Validación verificada (cierre definitivo de Ola 5 · `513374cf`)

- **Linter de frontera y guardrails de producción:**
  - `node scripts/lint-codebase.mjs`: **`802` archivos / `0` violaciones** (`require-api-wrapper: 0` sobre **`86/86` rutas API** — `82` envueltas + `4` exenciones endurecidas — y `no-cloud-sdk-lockin: 0`).
  - `node scripts/check-no-secrets.mjs`: **`7,988` archivos / `0` secretos**.
  - `node scripts/check-prod-readiness.mjs`: **`12/12` OK** (`28` migraciones SQL `0000`–`0027`, `57` competencias, `0` errores bloqueantes).
- **Auditoría adversarial `pstack` (4 ejes):** cerrada con **`0 CRÍTICO / 0 ALTO`** tras las remediaciones de `0027`, `sealHashOf`/`sealSignatureOf`, `sanitizeInternalHref`, `BLOCKED_BOOK_IDS`/`isPermittedMarketQuoteBook`, frescura `<= 72 h` / `-6 h`, saneo `a.espncdn.com` y `allowLocalLoopbackMemoryRateLimit`.
- **Pruebas unitarias y formales (`pnpm -r --workspace-concurrency=1 test` · `11/11` paquetes PASS):**
  - `apps/web/tests/api-guards.test.ts` (wrappers, CSRF, rate-limit distribuido/fail-closed + `allowLocalLoopbackMemoryRateLimit`, watermark, error sanitization): **PASS**.
  - `apps/web/tests/state-machines-fc.test.ts`: máquinas `fc.commands` sobre PGlite real con migraciones `0025`/`0027` (`sealed_picks`, incl. `PRE_SETTLED_INSERT_FORBIDDEN` y ventana `±5 s`) y `withSessionRead` (*scraping velocity* `200 → 429 → 403` + revocación): **PASS**.
  - `apps/web/tests/member-data.test.ts` (`sealHashOf` SHA-256 público vs `sealSignatureOf` HMAC interno), `apps/web/tests/property-invariants.test.ts` (`Cero-Fuga` y `FD-16`) y `apps/web/tests/bzzoiro-license-fd16.test.ts` (casas bloqueadas, frescura fail-closed `<= 72 h` / `-6 h` y saneo `photoKey`): **PASS**.
- **Verificación E2E, visual y RBAC en servidor loopback (`513374cf`):**
  - `pnpm e2e` (`desktop` + `mobile`, incl. `apps/web/e2e/ui-fuzzing.spec.ts` + Axe WCAG AA): **`71` passed | `0` failed | `1` skipped por diseño** (`0` errores CSP, `0` errores de consola/página, `0` respuestas `HTTP 5xx`, y `HTTP 404` honesto verificado en `/app/admin` para no-admin).
  - Revisión visual BEFORE → AFTER (`23/23` rutas / `92` PNGs): `0` errores CSP/consola/`5xx`, incluyendo la pestaña `Seguridad & Anti-Scraping` en `/app/admin` y el verificador público `/verificacion`.
