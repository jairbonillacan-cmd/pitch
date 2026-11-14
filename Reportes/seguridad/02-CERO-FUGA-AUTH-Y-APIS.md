# 02 — Brechas `Cero-Fuga` (SSR/RSC), Autenticación, APIs, IA e Ingesta

Este documento cubre la frontera de suscripción (`Cero-Fuga`), flujos de autenticación y PIN beta, control de acceso de roles y admin, protección HTTP/CSRF/rate-limit, Cortex IA e ingesta de datos.

---

## SEC-01 [Alta] — `/p/[pickId]` desbloquea cualquier pick pagado y su análisis previo sin autenticación

- **Ubicaciones:**
  - [`apps/web/app/p/[pickId]/page.tsx`](apps/web/app/p/%5BpickId%5D/page.tsx#L13-L19)
  - [`apps/web/src/server/platform-data.ts`](apps/web/src/server/platform-data.ts#L194-L215)
  - [`packages/ui/src/platform/access-guard.ts`](packages/ui/src/platform/access-guard.ts#L98-L133)
  - [`packages/ui/src/platform/match-picks-engine.ts`](packages/ui/src/platform/match-picks-engine.ts#L398)
  - [`packages/ui/src/platform/public/AuthAndOnboardingSurfaces.tsx`](packages/ui/src/platform/public/AuthAndOnboardingSurfaces.tsx#L424-L440)
- **Traza del flujo:**
  1. La ruta pública sin sesión `PublicTipsterPickPage` pasa el parámetro URL `pickId` directamente a `loadPublicPlatformState(pickId)`.
  2. `loadPublicPlatformState` (`platform-data.ts:194-215`) recorre los partidos próximos y ejecuta `g.picks.find((p) => p.id === clean || p.tipsterSlug === clean)` — sin validar que `p.isTipsterWeeklyOpen === true`.
  3. Los identificadores `pick.id` son deterministas (`${match.id}__p1`..`__p5` en `match-picks-engine.ts:398`) y además ya vienen expuestos en el payload RSC público.
  4. Al encontrar coincidencia, `found.id` se añade a `extraUnlocked` y `redactDatasetForVisitor(fullDataset, extraUnlocked)` entrega ese `MatchPick` completamente sin redactar (`selectionKey`, `label`, `rationale`, `p`, `fairDecimal`, `marketDecimal`, `edgePts`, `suggestedUnits`) y activa `hasOpenPick = true`, lo que además deja visible `preGame` (síntesis previa, claves tácticas, bajas y flujo de dinero) y mercados del partido.
- **Impacto:** Cualquier visitante anónimo puede extraer el 100 % de los picks pagados próximos a jugarse y su análisis previo del `Pase Total` (`$299 MXN/mes`), rompiendo `docs/architecture/SECURITY.md` §1 y ADR-025.
- **Remediación defensiva:** Restringir `/p/[pickId]` exclusivamente a slugs semanales públicos expresamente autorizados (`p.isTipsterWeeklyOpen === true && p.tipsterSlug === clean` o registro activo en `public_weekly_picks`), nunca aceptar `p.id`, retornar `notFound()` en caso contrario y desacoplar el pick promocional de `preGame`/`markets`.

---

## SEC-02 [Alta] — Serialización RSC de datos pagados en `redactDatasetForVisitor` y `loadGameDetail`

- **Ubicaciones:**
  - [`packages/ui/src/platform/access-guard.ts`](packages/ui/src/platform/access-guard.ts#L90-L141)
  - [`apps/web/src/server/platform-data.ts`](packages/web/src/server/platform-data.ts#L160-L165)
  - [`packages/ui/src/platform/club/MatchTicketCard.tsx`](packages/ui/src/platform/club/MatchTicketCard.tsx#L45-L83)
  - [`packages/ui/src/platform/club/CoreMatchViews.tsx`](packages/ui/src/platform/club/CoreMatchViews.tsx#L485-L512)
  - [`packages/ui/src/platform/club/CommunityClubView.tsx`](packages/ui/src/platform/club/CommunityClubView.tsx#L116-L140)
- **Traza del flujo:**
  1. Para visitantes no autenticados (`/onboarding`, `/p/[pickId]`) y cuentas sin suscripción ni trial activo (`/app/*`), el servidor llama `redactDatasetForVisitor(fullDataset)`.
  2. Como `redactDatasetForVisitor` utiliza operadores spread (`{ ...dataset }`, `{ ...game }`, `{ ...pick }`) y solo oculta `selectionKey`, `label` y `rationale`, el flujo RSC enviado al navegador sigue serializando:
     - En cada pick bloqueado: `id`, `conflictGroup` (`home_side`, `away_side`, `over_total`, `under_total`, `btts_yes`, `btts_no`, etc.), `marketGroup`, `p`, `fairDecimal`, `fairAmerican`, `marketDecimal`, `marketAmerican`, `edgePts`, `confidenceScore` y `suggestedUnits`.
     - En cada partido: `x12`, `projection`, `preGame.moneyFlow` y todo `game.spacetime` (`probs`, `value[]`, `expectedTotal`, `expectedMargin`, `drivers[]`).
     - En el dataset raíz: todos los `socialPosts` de la comunidad VIP.
  3. En `loadGameDetail(gameId)` (`platform-data.ts:160-165`), cuando `!hasAuthenticatedBetaSession()`, se retornan `factors`, `headToHead` y, si `hasOpenPick`, `markets.slice(0, 3)` con probabilidades y bordes.
- **Impacto:** Los componentes React únicamente ocultan visualmente esta información tras pantallas de bloqueo/paywall, violando la regla `Cero-Fuga` («el servidor no serializa pronósticos pagados, probabilidades del modelo ni momios justos»).
- **Remediación defensiva:** Sustituir `...pick`, `...game` y `...dataset` en `redactDatasetForVisitor` por listas blancas estrictas (poniendo a `null`/`0`/`"locked"` todos los campos numéricos, `conflictGroup`, `spacetime`, `projection`, `x12`, `moneyFlow` y `socialPosts: []`), y limpiar `markets` y `factors` en `loadGameDetail` cuando el partido no sea `FT` y falte `fullAccess`.

---

## SEC-03 [Alta] — `public-site-data.ts` entrega el dataset sin redactar en rutas públicas y filtra parlays SGP reales

- **Ubicaciones:**
  - [`apps/web/src/server/public-site-data.ts`](apps/web/src/server/public-site-data.ts#L50-L138) (`loadLandingViewProps`, `loadComoFuncionaViewProps`, `loadParlaysViewProps`, `loadComunidadViewProps`, `loadLoginPreviewData`)
  - [`packages/ui/src/platform/public/PublicSiteSections.tsx`](packages/ui/src/platform/public/PublicSiteSections.tsx#L373-L453) (`buildHeroLeagueCards`), `L661-L758` (`buildParlayDemoData`)
- **Traza del flujo:**
  1. `loadLandingViewProps` (`public-site-data.ts:50-73`), `loadComoFuncionaViewProps` (`75-82`), `loadParlaysViewProps` (`93-100`), `loadComunidadViewProps` (`102-112`) y `loadLoginPreviewData` (`119-138`) llaman directamente a `buildServerRawPlatformDataset()` **sin pasar por `redactDatasetForVisitor`**.
  2. `buildParlayDemoData(dataset.games)` busca picks con `!pk.isRedacted && pk.gameStatus !== "FT"` para decidir si muestra un ejemplo sintético (`isExample: true`) o un parlay real. Al recibir el dataset crudo (`pk.isRedacted === undefined`), selecciona **patas reales de parlays SGP por jugarse** con `label`, `p`, probabilidad combinada y `fairAmerican`.
  3. De forma similar, se serializan datos sin redactar hacia `/`, `/como-funciona`, `/parlays`, `/comunidad` y `/login`.
- **Impacto:** Visitantes sin sesión ni cuenta obtienen picks combinados SGP próximos y probabilidades multideporte directamente desde las páginas públicas de marketing.
- **Remediación defensiva:** Envolver `buildServerRawPlatformDataset()` con `redactDatasetForVisitor(...)` dentro de `loadLandingViewProps`, `loadComoFuncionaViewProps`, `loadParlaysViewProps`, `loadComunidadViewProps` y `loadLoginPreviewData`, reservando los datos sin redactar únicamente para partidos ya finalizados (`FT`) en `loadResultadosViewProps`.

---

## SEC-04 [Alta] — Evasión de mayoría de edad (+18), aceptación de términos y suscripción `Pase Total` en APIs

- **Ubicaciones:**
  - [`apps/web/src/server/session-user.ts`](apps/web/src/server/session-user.ts#L9-L23) (`requireMember`)
  - [`apps/web/app/api/me/signup/route.ts`](apps/web/app/api/me/signup/route.ts#L69-L74) (`menor_de_edad`)
  - [`apps/web/src/server/signup.ts`](apps/web/src/server/signup.ts#L31) & [`packages/db/src/signup.ts`](packages/db/src/signup.ts#L13) (`SIGNUP_CONSENT_VERSION`)
  - [`apps/web/app/api/me/profile/route.ts`](apps/web/app/api/me/profile/route.ts#L19-L27), [`journal/route.ts`](apps/web/app/api/me/journal/route.ts#L8-L48), [`watchlist/route.ts`](apps/web/app/api/me/watchlist/route.ts#L14-L23), [`email-preferences/route.ts`](apps/web/app/api/me/email-preferences/route.ts#L17-L25)
  - [`apps/web/app/api/billing/checkout/route.ts`](apps/web/app/api/billing/checkout/route.ts#L19-L67)
- **Traza del flujo:**
  1. El Paso 1 (Magic Link o Google/Apple) emite una `auth_session` válida e inserta una fila en `users` con `isAdult: false`, `birthDate: null`, `termsAcceptedAt: null` y `handle: null`.
  2. Si un menor envía su fecha de nacimiento a `POST /api/me/signup`, el servidor responde `403` (`menor_de_edad`), pero **deja activa la sesión `auth_session`**.
  3. `requireMember` (`session-user.ts:9-23`) solo comprueba la sesión de Better Auth y `profileIdForAuthUser`, sin exigir `signupCompleted(db, userId)` ni `hasActivePaseTotal`.
  4. Por ello, una cuenta incompleta (incluido un menor rechazado) puede ejecutar `PATCH /api/me/profile` (apartando `handle`), `PUT /api/me/email-preferences`, `POST /api/billing/checkout` (iniciando cobros reales en Stripe siendo menor o sin términos aceptados), `POST /api/me/journal` y `POST /api/me/watchlist`. Además, usuarios con prueba expirada (plan gratuito) tampoco son bloqueados por `hasActivePaseTotal` en `journal` o `watchlist`.
  5. En `apps/web/src/server/signup.ts:31`, `termsVersion` acepta cualquier string no vacío (`min(1).max(32)`) en lugar de validar la versión vigente `SIGNUP_CONSENT_VERSION`.
- **Impacto:** Riesgo regulatorio y legal por aceptación de cobros y operación de cuenta por menores de 18 años o usuarios sin consentimiento válido; acceso a escritura en funciones de pago sin suscripción.
- **Remediación defensiva:** Exigir `signupCompleted` (`isAdult === true`, `termsAcceptedAt !== null`) dentro de `requireMember` (separando un `requireStep1Session` exclusivo para `POST /api/me/signup`), revocar `auth_session` ante `menor_de_edad`, exigir `hasActivePaseTotal` o rol admin en `/api/me/journal` y `/api/me/watchlist`, y fijar `termsVersion` con `z.literal(SIGNUP_CONSENT_VERSION)`.

---

## SEC-05 [Alta] — PIN Beta (`pl_beta`) actúa como `Pase Total` + LLM en prod, eclipsa cuentas reales y lanza `500`

> *Detalles de `.env.example` documentados en [01-SECRETOS-DATOS-Y-CI.md](01-SECRETOS-DATOS-Y-CI.md#sec-05).*

- **Ubicaciones:**
  - [`apps/web/src/server/viewer-access.ts`](apps/web/src/server/viewer-access.ts#L68-L71)
  - [`apps/web/app/api/beta/unlock/route.ts`](apps/web/app/api/beta/unlock/route.ts#L45-L70)
  - [`apps/web/app/api/beta/logout/route.ts`](apps/web/app/api/beta/logout/route.ts#L4-L15)
  - [`apps/web/src/server/beta-auth.ts`](apps/web/src/server/beta-auth.ts#L21-L41)
- **Traza del flujo:**
  1. `getViewerAccess()` evalúa `if (await hasValidBetaCookie())` (`viewer-access.ts:68-71`) **antes** de `auth.api.getSession`, devolviendo `{ via: "beta", signupComplete: true, fullAccess: true, profile: null }`. Si `PITCHLAB_BETA_CODE` queda definido en producción, un PIN de 4 dígitos (`10,000` combinaciones) otorga 30 días de `Pase Total` sin +18/términos ni revocación en servidor (`/api/beta/logout` solo borra la cookie del navegador), habilita consumo de OpenRouter LLM y oculta sesiones reales de socios.
  2. `POST /api/beta/unlock` invoca `verifyPinCodeConstantTime(code)` en la línea 46 **sin bloque `try/catch`**: cuando `PITCHLAB_BETA_CODE` está desactivado/ausente en producción, `beta-auth.ts` lanza excepción no controlada devolviendo HTTP `500` en lugar de `403`.
- **Remediación defensiva:** Deshabilitar el acceso por PIN en producción cuando las cuentas reales estén activas (salvo bandera explícita `PITCHLAB_ALLOW_BETA_PIN_IN_PROD=1`), evaluar `auth.api.getSession` antes que `pl_beta` y envolver `verifyPinCodeConstantTime` con `try/catch` devolviendo `403`.

---

## SEC-08 [Media] — Turnstile falla abierto, código muerto `turnstile.ts` y hashes de prueba sin aplicación en BD

- **Ubicaciones:**
  - [`apps/web/src/server/turnstile.ts`](apps/web/src/server/turnstile.ts#L1-L38) (nunca importado fuera de pruebas)
  - [`apps/web/src/server/auth.ts`](apps/web/src/server/auth.ts#L120-L129), [`L215-L218`](apps/web/src/server/auth.ts#L215-L218)
  - [`packages/db/src/signup.ts`](packages/db/src/signup.ts#L198-L238) (`grantSignupTrial`)
  - [`packages/ui/src/platform/public/SignupSurfaceV4.tsx`](packages/ui/src/platform/public/SignupSurfaceV4.tsx#L502) (`isDisposableEmailDomain` solo en cliente)
- **Traza del flujo:**
  1. `verifyTurnstile()` en `apps/web/src/server/turnstile.ts` es **código muerto** en producción. El único captcha activo es el plugin `captcha()` de Better Auth en `/sign-in/magic-link`, registrado solo si existen **ambas** variables `TURNSTILE_SECRET_KEY` y `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (`auth.ts:215-218`); si falta cualquiera en producción, Turnstile se apaga en silencio sin error de arranque.
  2. La verificación de dominios de correo temporales (`isDisposableEmailDomain`) solo corre en el navegador, no en `POST /api/me/signup` ni al enviar el magic link.
  3. `grantSignupTrial` (`packages/db/src/signup.ts:206-228`) guarda `deviceFpHash` e `ipSubnetHash` en `trial_fingerprints`, **pero únicamente consulta `canonicalEmailSha256`** al decidir si otorga los 7 días gratis sin tarjeta (`trial_m1_nocard`), sin consultar ni limitar repeticiones por dispositivo o subred IP (y sin poblar `oauthSubject` o `turnstile_ray_id`).
- **Impacto:** Posibilidad de abuso de envío de correos Resend si falla configuración de Turnstile y creación ilimitada de cuentas con prueba gratuita de 7 días desde un mismo dispositivo/IP usando dominios temporales o propios.
- **Remediación defensiva:** Fallar al arrancar en producción si falta cualquier variable Turnstile; habilitar `rateLimit` persistente en Better Auth; validar `isDisposableEmailDomain` y umbrales sobre `deviceFpHash` + `ipSubnetHash` en el servidor dentro de `grantSignupTrial`.

---

## SEC-11 [Media] — Escalada de rol en cliente a `"tipster"`, `/app/admin` y `/app/tipster` sin guardia SSR y ausencia de `emailVerified`

- **Ubicaciones:**
  - [`packages/ui/src/platform/platform-provider.tsx`](packages/ui/src/platform/platform-provider.tsx#L747-L757) (`setViewerRole`)
  - [`packages/ui/src/platform/club/SocialAndTipsterViews.tsx`](packages/ui/src/platform/club/SocialAndTipsterViews.tsx#L191), [`L522`](packages/ui/src/platform/club/SocialAndTipsterViews.tsx#L522)
  - [`apps/web/app/app/admin/page.tsx`](apps/web/app/app/admin/page.tsx#L1-L7) y [`apps/web/app/app/tipster/page.tsx`](apps/web/app/app/tipster/page.tsx#L1-L6)
  - [`apps/web/src/server/viewer-access.ts`](apps/web/src/server/viewer-access.ts#L88) y [`apps/web/src/server/session-user.ts`](apps/web/src/server/session-user.ts#L26-L47) (`requireAdmin`)
  - [`apps/web/src/server/platform-data.ts`](apps/web/src/server/platform-data.ts#L72-L74) (`previewToolsEnabled`)
- **Traza del flujo:**
  1. Aunque `allowRoleSimulation` inicia en `false` en producción, `setViewerRole` (`platform-provider.tsx:747-757`) **no comprueba `!allowRoleSimulation`**. Cualquier usuario dentro de `/app` puede navegar a `/app/tipster` (que carece de verificación SSR de rol tipster) y pulsar los botones de cambio a rol `"tipster"`, desbloqueando exportación previa de tarjetas sin sellar y reemplazando la marca de agua del usuario (`@sofia_nfl · TIPSTER-8842`) por atribuciones falsas, además de abrir vistas protegidas solo en cliente cuando `viewerRole === "visitor"`.
  2. `/app/admin/page.tsx` renderiza `<FounderAdminClubView />` sin comprobar si el usuario es administrador en SSR (las APIs `/api/admin/*` sí bloquean con `403`, salvo en modo sin cuentas donde muestra UI simulada).
  3. Ni `getViewerAccess` (`viewer-access.ts:88`) ni `requireAdmin` (`session-user.ts:43`) comprueban `session.user.emailVerified === true` antes de otorgar privilegios a correos en `PITCHLAB_ADMIN_EMAILS` (algo riesgoso ante proveedores OAuth o autenticación por contraseña futura).
  4. Si `PITCHLAB_PREVIEW_TOOLS=1` queda activo en despliegue público, habilita el simulador de roles para **todos** los visitantes y no solo admins autenticados.
- **Remediación defensiva:** Proteger `setViewerRole` con `if (!allowRoleSimulation) return;`; añadir validación SSR de rol/admin en `/app/admin/page.tsx` y `/app/tipster/page.tsx`; exigir `session.user.emailVerified === true` en `isAdmin` / `requireAdmin`; limitar `PITCHLAB_PREVIEW_TOOLS=1` a sesiones admin verificadas; migrar autorización admin a columna `role` en DB + 2FA + `audit_log` conforme a `SECURITY.md`.

---

## SEC-12 [Media] — Ausencia de cabeceras HTTP/CSP, falta de validación CSRF `Origin` en 11/12 rutas y brechas de Rate Limiting / DoS

- **Ubicaciones:**
  - Cabeceras HTTP: [`apps/web/next.config.mjs`](apps/web/next.config.mjs#L1-L43), [`apps/web/middleware.ts`](apps/web/middleware.ts#L1-L60), [`apps/web/vercel.json`](apps/web/vercel.json#L1-L9).
  - CSRF `Origin`: presente únicamente en `POST /api/me/profile/x` (`apps/web/app/api/me/profile/x/route.ts:15-17`); **ausente** en `DELETE /api/me/profile/x`, `PATCH /api/me/profile`, `POST /api/me/signup`, `POST /api/me/journal`, `POST /api/me/watchlist`, `PUT /api/me/email-preferences`, `POST /api/billing/checkout`, `POST /api/tipster/connect`, `POST /api/admin/flags`, `POST /api/admin/tipsters`, `POST /api/beta/unlock` y `POST /api/beta/logout`.
  - Rate Limit & DoS: [`apps/web/app/i/[code]/opengraph-image.tsx`](apps/web/app/i/%5Bcode%5D/opengraph-image.tsx#L10-L60), [`apps/web/app/api/handles/check/route.ts`](apps/web/app/api/handles/check/route.ts#L16-L32), [`apps/web/app/api/u/[handle]/route.ts`](apps/web/app/api/u/%5Bhandle%5D/route.ts#L5-L11), [`apps/web/app/api/beta/unlock/route.ts`](apps/web/app/api/beta/unlock/route.ts#L14), [`apps/web/src/server/beta-auth.ts`](apps/web/src/server/beta-auth.ts#L154-L191).
- **Traza del flujo:**
  1. **Sin headers de seguridad:** Ninguna ruta recibe `Content-Security-Policy` (nonce + `frame-ancestors 'none'`), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` ni `Permissions-Policy`.
  2. **Sin CSRF `Origin` ni exigencia estricta de `Content-Type: application/json`:** Peticiones simples entre subdominios (`SameSite=Lax` se envía desde subdominios como `staging.pitchlab.mx`) o login-CSRF contra `/api/beta/unlock` pueden mutar estado sin validación de origen.
  3. **Sin Rate Limiting & `XFF` falseable:** Solo `/api/beta/unlock` tiene limitador Upstash, pero con dos llamadas REST separadas (`INCR` y `EXPIRE` no atómicos en `beta-auth.ts:164-179`), caída silenciosa a `memoryRateStore` en memoria volátil por instancia y lectura del primer elemento de `x-forwarded-for` (`x-forwarded-for[0]`, manipulable si el proxy concatena). Rutas públicas costosas en DB/CPU (`/i/[code]/opengraph-image` con Satori/Resvg + consulta Neon, `/api/handles/check` con enumeración de handles, `/api/u/[handle]`, `/api/me/signup`, `/api/me/journal`, `/api/auth/*`) carecen por completo de límite en aplicación.
- **Remediación defensiva:** Configurar cabeceras de seguridad + CSP con nonce (propagado a `<script>` en `apps/web/app/layout.tsx:41`); aplicar guardia centralizada `verifySameOriginJson(request)`; leer IP confiable (`x-vercel-forwarded-for` / `cf-connecting-ip`); usar pipeline atómico en Upstash y extender rate limiting + `Cache-Control` al resto de endpoints exigidos por `SECURITY.md` §2.8.

---

## SEC-13 [Media] — Cortex IA ignora `ai.enabled` y la ingesta ESPN Liga MX permite traversal/inyección en caché

- **Ubicaciones:**
  - **Cortex IA:** [`apps/web/src/server/cortex.ts`](apps/web/src/server/cortex.ts#L17-L165), [`apps/web/app/app/[league]/games/[gameId]/page.tsx`](apps/web/app/app/%5Bleague%5D/games/%5BgameId%5D/page.tsx#L40-L43)
  - **Ingesta ESPN:** [`services/ingest/src/adapters/espn-liga-mx-schedule.ts`](services/ingest/src/adapters/espn-liga-mx-schedule.ts#L52-L113), [`services/ingest/src/history/espn-liga-mx.ts`](services/ingest/src/history/espn-liga-mx.ts#L180-L324)
- **Traza del flujo:**
  1. **Cortex IA:** Aunque se acota con `MAX_CHARS = 520`, `max_tokens: 220` y validación numérica (`allowedNumbers`), no consulta el kill-switch `ai.enabled` (`SECURITY.md` §4), utiliza un `Map` en memoria por instancia que se reinicia con cada despliegue o cambio de `generatedAt`, carece de cuota por usuario en Upstash y omite `zdr: true` junto con delimitadores estrictos contra prompt injection indirecto sobre nombres provenientes de feeds externos.
  2. **Ingesta ESPN Liga MX (en CI con `contents: write`):** En `espn-liga-mx-schedule.ts`, `leagues[0].calendar` se valida solo como `z.array(z.string())` sin expresión regular de fecha; `dayKey()` conserva caracteres `.`, `/`, `\`, `?`, `&`, y el filtro lexicográfico `d <= limitDay` deja pasar cadenas que empiecen con `.` o `/` antes de escribir en `join(cacheRoot, day + ".json")` e interpolar `?dates=` + `day`. De forma similar, `history/espn-liga-mx.ts` usa `team.id` y `event.id` mediante `as` directamente en `mkdirSync`/`writeFileSync` y URLs.
- **Remediación defensiva:** Consultar `ai.enabled` en `platform_runtime_flags`, persistir caché compartida de Cortex por snapshot/partido con cuota por usuario y añadir `zdr: true` + sanitización de nombres; validar `/^\d{8}$/` + contención `resolve()` y `/^\d+$/` en la ingesta ESPN.

---

## SEC-18 (Parte Ingesta / UI) [Baja] — Transporte `http://`, redirecciones con credenciales, CSV Injection y drift de términos

- **Ubicaciones:**
  - [`services/ingest/src/history/understat.ts`](services/ingest/src/history/understat.ts#L344-L417): usa `http://web.archive.org/...` sin validar `/^\d{14}$/` en timestamps `row[1]`.
  - [`services/ingest/src/adapters/api-football.ts`](services/ingest/src/adapters/api-football.ts#L236-L239) & [`football-data.ts`](services/ingest/src/adapters/football-data.ts#L128): llamadas `fetch` con headers de clave (`x-apisports-key`, `X-Auth-Token`) sin `redirect: "error"` ni `AbortSignal.timeout(...)`. *(Verificado que los errores lanzados y snapshots no imprimen las claves.)*
  - [`services/ingest/src/cli.ts`](services/ingest/src/cli.ts#L104) & [`pipeline.ts`](services/ingest/src/pipeline.ts#L544): `SNAPSHOT_DATE` no valida `/^\d{4}-\d{2}-\d{2}$/`.
  - [`packages/ui/src/platform/platform-provider.tsx`](packages/ui/src/platform/platform-provider.tsx#L989-L1020) (`exportJournalCsv`): no neutraliza celdas que inicien con `=`, `+`, `-`, `@`, `\t` o `\r` (CSV Formula Injection al abrir en Excel/Sheets).
  - [`apps/web/src/server/cortex.ts`](apps/web/src/server/cortex.ts#L20-L25) (`FORBIDDEN_TERMS`): faltan términos de fuentes internas que sí están contemplados en pruebas E2E (`polymarket`, `kalshi`, `football-data`, `the-odds-api`, `understat`, `sumersports`, `ourlads`, `lightgbm`, `platt`, `pitágoras`, `log5`, `touchiq`, `aztecavet`, `linemate`).
- **Remediación defensiva:** Pasar `understat.ts` a HTTPS y validar `/^\d{14}$/`; añadir `redirect: "error"` y timeout en todos los adapters; validar `SNAPSHOT_DATE`; anteponer `'` en `exportJournalCsv` para prefijos de fórmula; sincronizar `FORBIDDEN_TERMS`.
