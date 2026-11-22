# Seguridad

> **Propósito:** las reglas de seguridad que todo código de PitchLab debe cumplir y cómo se verifican (`ADR-050`, `ADR-057` y `ADR-061`).
> **Consumidores:** todos los agentes de código y la revisión de PRs.
> **Fecha:** 2026-11-21

## 1. Modelo de amenazas (resumen)

| Activo | Amenaza | Control |
|---|---|---|
| Cuentas | Robo de credenciales, fuerza bruta | Better Auth sin contraseña, Turnstile condicional (`PITCHLAB_CAPTCHA_PROVIDER`), rate limit distribuido *fail-closed* y verificación de correo + lista `PITCHLAB_ADMIN_EMAILS` para admin |
| Contenido de pago (`Cero-Fuga`) | Evadir el paywall desde cliente o filtrar proyecciones en RSC/API | `getViewerAccess()` + `access.fullAccess` en cada RSC protegido (`/app/props`, `/app/[league]/arbitros`, `/app/[league]/r/[refereeSlug]`, `loadLeagueHubEnrichment`) y `requireFullAccess: true` en `/api/alerts`, `/api/live/alerts` y handlers de datos reservados (`withSessionRead`) |
| Extracción automatizada (*scraping*) e IDOR | Descarga masiva de momios/proyecciones o acceso a recursos ajenos | Detector *scraping velocity* (`35` warn / `50` throttle `429` / `75` revocación de sesión `403`), watermarking forense `X-PitchLab-Trace`, paginación SQL `<= 40`, IDs opacos HMAC en `/api/news/article` y `recordIdorAttempt` |
| Trials y referidos | Abuso con multicuentas | `trial_fingerprints` con hashes únicos, antifraude de referidos, cupones restringidos a `restricted_to_user_id` y recompensa diferida (`AUTH_BILLING_GROWTH.md`) |
| Historial de picks (`sealed_picks`) | Manipulación (insertar pre-liquidado, editar post-sellado o borrar) | Triggers SQL inmutables `0025`/`0027` (`PRE_SETTLED_INSERT_FORBIDDEN`, ventana `±5 s`, bloqueo `UPDATE`/`DELETE`), separación `sealHashOf` (SHA-256 público `/verificacion`) vs `sealSignatureOf` (HMAC interno) y saneo de CLV únicamente en lectura/cálculo (`isCredibleClvPct`, nunca mutando BD) |
| Billing y baja de correos | Webhooks falsos, eventos duplicados o baja accidental por prefetcher `GET` | Verificación HMAC Stripe + `provider_event_id` único; `GET /api/me/email-preferences/unsubscribe` sin mutación en BD (solo formulario HTML `<form method="POST">` sin JS inline + enlace `/app/account`) y mutación exclusiva vía `POST` (RFC 8058) |
| Datos personales y logs | Fuga de PII, tokens, cookies o secretos en logs | `100 %` `safeLogger` (`apps/web/src/server/safe-logger.ts`) en todos los módulos de servidor (regla `no-raw-server-console`), mínimo necesario, cifrado en tránsito y reposo, aviso LFPDPPP y derechos ARCO (`/api/me/export`, `/api/me/deletion-request`) |
| Claves de proveedores y redirecciones | Exposición en cliente/repo u *open redirect* hacia puertos/orígenes ajenos | Solo en variables de entorno de servidor/CI (`check-no-secrets.mjs`), `sanitizeInternalHref` en navegación interna y validación estricta `parsed.protocol === "https:"` + `parsed.port === ""` (sin credenciales) en redirecciones externas |
| Admin | Escalada de privilegios | `requireAdmin` (correo verificado + `PITCHLAB_ADMIN_EMAILS`), `HTTP 404` honesto para no-admin en `/app/admin`, `audit_log` obligatorio y telemetría de abuso `security_abuse_events` (`GET /api/admin/security-abuse`) |
| IA (`Cortex IA` y Copiloto NL) | Prompt injection desde datos, costo descontrolado o alucinación numérica | Hechos cerrados de solo lectura, validador determinista numérico/léxico (`eval:cortex` `24/24`, `eval:alerts` `16/16`), cuotas estrictas y fallback determinista ZDR opt-in (`FLAG_AI_ENABLED`) |

## 2. Reglas obligatorias para el código (`ADR-057` + `ADR-061`)

1. **Validación estricta en límites:** toda entrada externa (params, query, body, webhooks, respuestas de proveedores) pasa por esquemas Zod (`.strict()` obligatorio en mutaciones críticas como `POST /api/me/journal` y `POST /api/parlays/sgp` con `.max(6)`) y tipos nominales de `packages/contracts/src/branded.ts` (`parseStrictFiniteNumber`, `CanonicalPublicSlug`). Prohibido `any` o `Number(` laxo en fronteras.
2. **Gobernanza `100 %` de `/api/**` con `apps/web/src/server/api-guards.ts`:** las **`89/89` rutas** quedan protegidas bajo los `6` wrappers canónicos (`withPublicRead`, `withSessionRead`, `withMemberMutation`, `withActivePaseMutation`, `withAdminMutation`, `withCronSecret`), verificadas mecánicamente por `require-api-wrapper` (`scripts/lint-codebase.mjs`):
   - `87` rutas envueltas directamente (`100 %` de las rutas no-webhook fuera del dispatcher de Better Auth), incluyendo `/api/beta/unlock` y `/api/beta/logout` bajo `withPublicRead` con `failClosed: true`, `verifySameOrigin: true` y `cacheControl: "no-store"`.
   - `2` exenciones de protocolo endurecidas: `/api/auth/[...all]` (Better Auth con rate-limit *fail-closed* explícito en `GET`/`POST`/callbacks y `safe-logger.ts`) y `/api/webhooks/stripe` (verificación criptográfica HMAC de Stripe).
   - `requireFullAccess: true` obligatorio en `/api/alerts` y `/api/live/alerts`, y compuerta RSC `getViewerAccess()` `Cero-Fuga` en `/app/props`, `/app/[league]/arbitros`, `/app/[league]/r/[refereeSlug]` y `loadLeagueHubEnrichment`.
3. **Logging redactado `100 %` en servidor (`safe-logger.ts`):** nunca se silencian errores ni se usan `console.(log|info|warn|error)` directos en `apps/web/src/server/*.ts`. Toda salida pasa por `logSecurityEvent` / `redactSensitiveValue` / `hashIpForAudit` (`apps/web/src/server/safe-logger.ts`), verificado mecánicamente por la regla permanente `no-raw-server-console` (`scripts/lint-codebase.mjs`).
4. **Baja de correos segura (`GET` sin efecto secundario):** `GET /api/me/email-preferences/unsubscribe` jamás muta la base de datos; valida el token HMAC y devuelve una vista HTML de confirmación (`<form method="POST">` sin JS inline + enlace canónico `/app/account`). Solo `POST` aplica la baja (compatible con RFC 8058).
5. **Consultas parametrizadas e inmutabilidad SQL:** solo Drizzle o SQL parametrizado con paginación dura `<= 40`. Prohibido concatenar SQL y prohibido alterar o borrar registros de `sealed_picks` (protegidos por los triggers `0025`/`0027`).
6. **Secretos, CSP con `nonce` + SHA-256 y redirecciones endurecidas:**
   - Secretos nunca en cliente ni en el repo (`node scripts/check-no-secrets.mjs`). `NEXT_PUBLIC_*` solo para valores públicos.
   - `apps/web/middleware.ts` genera `nonce` de `128` bits por solicitud en rutas dinámicas/privadas (`/app/**`, `/login`, `/signup`, `/onboarding`, `/precio`, `/canjear`) con `script-src 'self' 'nonce-<n>' 'sha256-<THEME_INIT_SCRIPT>' 'strict-dynamic'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` y bloqueo de mutaciones `/api/*` con `Sec-Fetch-Site: cross-site` (excepto webhooks/crons/baja RFC 8058), dejando las rutas públicas cacheables libres para ISR.
   - Navegación interna filtrada siempre con `sanitizeInternalHref` (`packages/ui/src/platform/navigation-helpers.ts`); toda redirección externa (`EditProfileDialog`, `SocialAndTipsterViews`, `PlanTab`, `LoginSurfaceV4`, `TechAndPricingSurfaces`) exige `parsed.protocol === "https:"`, `parsed.port === ""` y ausencia de credenciales (`!parsed.username && !parsed.password`).
7. **Cookies y CSRF:** cookies `HttpOnly`, `Secure` en producción y `SameSite=Lax`. Verificación de origen (`verifySameOriginMutation`) obligatoria en toda mutación de miembro, pase activo, admin o beta.
8. **Rate limiting distribuido portable sin lock-in (`ADR-050`/`ADR-057`):** respaldado canónicamente por la tabla PostgreSQL `UNLOGGED security_rate_buckets` (`0025`) con Redis REST (`UPSTASH_REDIS_*`) solo como acelerador opt-in. Política ***fail-closed* (`HTTP 503`)** en producción y despliegues hospedados (respaldo local en memoria estrictamente opt-in para Playwright loopback vía `allowLocalLoopbackMemoryRateLimit`). IP cliente portable vía `trustedClientIp` (`PITCHLAB_TRUSTED_PROXY`).
9. **Subida de archivos (avatares):** validación de firma binaria (`jpeg`/`png`/`webp`, `<= 2 MB`), re-encode cuadrado `256×256` WebP en servidor y almacenamiento portable (`AVATAR_STORAGE_PROVIDER=s3|gcs|vercel-blob` con firma AWS SigV4 nativa sobre `node:crypto`, sin SDKs cloud en lógica de producto).
10. **Frontera de datos `FD-16` y dependencias:** bloqueo centralizado de casas no autorizadas (`BLOCKED_BOOK_IDS` / `isPermittedMarketQuoteBook`), frescura *fail-closed* (`<= 72 h` / `-6 h`), saneo de `photoKey` (`resolvePersonPhotoUrl`) sin URLs externas crudas en el cable, y vigilancia semanal de dependencias (`pnpm audit`).

## 3. Roles y auditoría

| Rol | Puede |
|---|---|
| `user` | Lo suyo: perfil, picks sellados inmutables, alertas (`<= 40` activas), cuenta, exportación y solicitud ARCO |
| `staff` | Leer en Admin, moderar reportes y reintentar jobs |
| `admin` | Todo lo de staff (con correo verificado y presencia en `PITCHLAB_ADMIN_EMAILS`), más aprobar/rechazar SPEI, conceder/revocar planes, emitir cupones, gestionar tipsters, consultar `security_abuse_events` y cambiar flags |

`audit_log(actor_id, action, target_type, target_id, before, after, at, ip_hash)` y `security_abuse_events` (`0025`) registran toda acción privilegiada y evento de abuso (`rate_limit`, `scraping_velocity`, `session_revoked`, `csrf_rejected`, `idor_attempt`) con `ipHash` salted (`PITCHLAB_AUDIT_SALT`) y sin PII ni secretos en claro.

## 4. Feature flags con impacto legal (dueño: el fundador)

| Flag | Default | Motivo |
|---|---|---|
| `assets.emblems.liga-mx`, `assets.emblems.premier-league` | on en la beta privada, **revisión antes del lanzamiento público** (`logoUrl === null` → iniciales en superficie pública sin licencia) | C-10 / FD-08 / Licencia Bzzoiro v4.0 |
| `social.leaderboards.public` | off | C-03 / FD-07 |
| `league.liga-mx` (público y de pago) | off hasta FD-14 (a) | Licencia de datos |
| `ai.enabled` (`FLAG_AI_ENABLED`) | opt-in | Costo y gobernanza ZDR |

## 5. Respaldos y recuperación (portables · `ADR-050`)

- **PostgreSQL (`DATABASE_URL`):** point-in-time restore según el proveedor gestionado + export lógico diario (`pg_dump`) hacia almacenamiento de objetos S3-compatible con `30` días de retención.
- **Objetos históricos (`curated/` y `odds/`):** inmutables y respaldados mensualmente en bucket S3-compatible.
- **Prueba de restauración** trimestral documentada en `/app/admin` (fecha y resultado).
- **Objetivos:** RPO `<= 24 h` (`<=` minutos con PITR) y RTO `<= 4 h`.

## 6. Datos personales

- Se recopila lo mínimo: email, fecha de nacimiento (+18), handle y preferencias. No se piden documentos oficiales y los datos fiscales CFDI jamás se persisten en `localStorage`.
- **Retención y ARCO:** exportación JSON inmediata en `/api/me/export` y baja de cuenta a petición en `/api/me/deletion-request` (`<= 20` días hábiles conforme LFPDPPP). Los picks públicos se anonimizan («usuario eliminado») en lugar de borrarse cuando afectan agregados históricos, preservando la cascada legal de borrado en el trigger `sealed_picks_immutability_trg`.
- La analítica propia (`/api/analytics/funnel`) solo se activa con consentimiento explícito (`analyticsConsent`). La IP se almacena únicamente con hash salado.
