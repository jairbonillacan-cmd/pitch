# Reporte de cierre · Auditoría y reparación de páginas rotas, desactualizadas y redirecciones

- **Fecha:** 2026-11-12
- **Rama:** `detect_broken_outdated_pages` (base: `921f836` `docs(env): documentar TWITTER_CLIENT_ID/SECRET y EMAIL_LOGO_URL`)
- **Estado:** Implementación completa de los **3 bloques** solicitados, verificada con `pnpm lint`, `pnpm typecheck`, pruebas unitarias en los 11 paquetes, `pnpm build` y `pnpm e2e` (`10/10` en `desktop` y `mobile`), lista para revisar e integrar en `gemini-reestructura`.

---

## 1. Qué se hizo

### Bloque 1 — Rutas críticas, redirecciones `308`, sesión, paywall y límites de error

1. **Redirecciones `308` con query string preservado (`query-string.ts`):**
   - `apps/web/src/server/query-string.ts`: conserva parámetros de búsqueda al redirigir.
   - `/pricing` (`apps/web/app/pricing/page.tsx`) y `/plans` (`apps/web/app/plans/page.tsx`) → `/precio` con `308`.
   - `/metodologia` (`apps/web/app/metodologia/page.tsx`) y `/tecnologia` (`apps/web/app/tecnologia/page.tsx`) → `/motores` con `308`.
   - `/i/[code]` (`apps/web/app/i/[code]/page.tsx` y `apps/web/src/server/short-invite.ts`) preserva UTM y parámetros hacia `/pricing/referral` y cae a `/precio` si falta código válido.
2. **Nueva ruta `/baja` y enlaces de correos:**
   - Nueva ruta pública `apps/web/app/baja/page.tsx` para cancelar notificaciones y enlaces/copy alineados en `@pitchlab/emails`, `apps/web/src/server/account-emails.ts` y `apps/web/src/server/pick-results.ts`.
3. **Guardia de subrutas `/app/*` y `404` real:**
   - `apps/web/src/server/club-route-guard.ts` y `apps/web/app/app/layout.tsx` validan subrutas del club, redirigen alias heredados (p. ej. `/app/parlay`, `/app/planes`) con `308` y devuelven HTTP `404` real en rutas inexistentes.
   - `apps/web/app/not-found.tsx` actualizado con `PublicSiteShell`.
4. **Prioridad de sesión, bucle de paywall y retornos de Stripe:**
   - `apps/web/src/server/viewer-access.ts` y `apps/web/src/server/public-session.ts` priorizan la sesión real de Better Auth sobre el preview/PIN beta.
   - Ruptura del bucle de paywall en prueba expirada dirigiendo a `/app/account?tab=plan` (`upgradeHref` y `hasAccountSession` en `packages/ui/src/platform/platform-provider.tsx`).
   - `apps/web/src/server/auth-page.ts` y `apps/web/app/signup/page.tsx` preservan `?next=` y `?code=`.
   - `apps/web/src/server/billing/checkout.ts`, `apps/web/app/app/account/page.tsx`, `packages/ui/src/platform/club/account/PlanTab.tsx` y `packages/ui/src/platform/club/SocialAndTipsterViews.tsx` manejan los retornos de Stripe Checkout (`?pago=ok` / `?pago=cancelado`) y Stripe Connect.
5. **Error boundaries:**
   - Agregados `apps/web/app/error.tsx`, `apps/web/app/app/error.tsx` y `apps/web/app/global-error.tsx`.

### Bloque 2 — Zona horaria NFL, tickets compartibles, referidos verificados y estados honestos

1. **Zona horaria NFL (DST `America/New_York` → UTC ISO + CDMX):**
   - Corregido en `services/ingest/src/adapters/nflverse.ts`, `packages/contracts/src/view-models.ts` y `packages/ui/src/platform/club/CoreMatchViews.tsx` (`CalendarSquare`).
2. **Tickets compartibles (`ShareTicketModal` y `/p/[pickId]`):**
   - `apps/web/app/p/[pickId]/page.tsx` devuelve HTTP `404` real si el pick no existe y propaga `?code=`; conectado con `ShareTicketModal` en `packages/ui/src/platform/components/PlatformOverlays.tsx`.
3. **Referidos verificados en BD y anti-spoofing:**
   - `apps/web/src/server/short-invite.ts` exporta `lookupReferrerHandleForInvite` y endurece `resolveOgDisplayHandle` contra suplantación por `?from=` cuando `accountsEnabled` es `true`.
   - `apps/web/app/pricing/referral/page.tsx`, `apps/web/app/plans/referral/page.tsx` y `packages/ui/src/platform/public/ReferralInviteSurface.tsx` verifican el anfitrión en BD, redirigen a `/precio` si falta código válido con cuentas activas y restringen los fallbacks de ejemplo (`@jair` / `@jair_founder`) únicamente a `!accountsEnabled`.
4. **Registro, parlays, partidos `FT` y preferencias de correo:**
   - Guardia en `/signup?paso=2`.
   - `sealParlayToJournal` en `packages/ui/src/platform/platform-provider.tsx` persiste parlays en `POST /api/me/journal` usando el `gameId` de inicio más temprano y revierte en caso de error.
   - `upcomingPlusRecentFinished(dataset, 12)` en `apps/web/src/server/platform-data.ts` incluye partidos finalizados recientes (`FT`) para `NotificationBell`.
   - `packages/ui/src/platform/club/account/PrefsTab.tsx` sincroniza `pickSettled` contra `GET` y `PUT /api/me/email-preferences`.
5. **Guardias de rol y estados vacíos honestos:**
   - Guardias de servidor en `apps/web/app/app/admin/page.tsx` y `apps/web/app/app/tipster/page.tsx`.
   - `packages/ui/src/platform/club/CoreMatchViews.tsx` incorpora estados vacíos honestos para `finished`, `standings` y opiniones de socios (sin comentarios ficticios ni `+14` artificial), agrega fecha de corte en `[data-market-pulse]` y reemplaza `"más seguro"` por `"perfil conservador"` / `"Conservador"`.

### Bloque 3 — Shell unificada en `/legal/*` y `/onboarding`, SEO, copy y documentación

1. **Unificación con `PublicSiteShell`:**
   - Migradas `apps/web/app/legal/{privacidad,terminos,juego-responsable,creditos}/page.tsx` a `PublicSiteShell` + `Metadata` (con ancla `#comunidad` en Términos y conservando `nflverse`, `CC-BY 4.0`, `openfootball`, `CC0` en Créditos); eliminado `apps/web/src/client/legal-shell.tsx`.
   - Migrados `apps/web/app/onboarding/page.tsx` (`robots: { index: false, follow: false }`) y `OnboardingSurfaceV4` en `packages/ui/src/platform/public/AuthAndOnboardingSurfaces.tsx` a `PublicSiteShell` + `unitMxn`/`setUnitMxn`.
2. **SEO (`robots.txt`, `sitemap.xml`, `noindex` acotado):**
   - `apps/web/app/robots.ts` permite el sitio público y restringe `["/app/", "/api/", "/i/", "/onboarding", "/p/", "/baja"]` apuntando al sitemap.
   - Creado `apps/web/app/sitemap.ts`.
   - Retirado el `noindex` global de `apps/web/app/layout.tsx` y movido únicamente a `apps/web/app/app/layout.tsx` y rutas privadas/de servicio (`/onboarding`, `/i/[code]`, `/p/[pickId]`, `/baja`).
3. **Limpieza de copy y documentación:**
   - Copy ajustado en `packages/ui/src/platform/spacetime-catalog.ts`, `packages/ui/src/platform/club/ParlayAndQuantViews.tsx` y `packages/ui/src/platform/public/TechAndPricingSurfaces.tsx`.
   - Sincronizados `AGENTS.md` y `docs/architecture/ROUTE_MAP.md` con rutas, redirecciones `308`, ligas y endpoints reales.

---

## 2. Verificaciones ejecutadas (todas tras la última edición)

- `pnpm lint` (`pnpm -r lint && node scripts/lint-codebase.mjs`): **exit 0** (`Cero colores hex fuera de packages/tokens y cero catch vacíos`).
- `pnpm typecheck`: **exit 0** en todo el workspace.
- `node scripts/check-no-demo-prod.mjs`: **exit 0**.
- **Pruebas unitarias secuenciales** (`pnpm --filter "!@pitchlab/web" -r --workspace-concurrency=1 test` y `pnpm --filter @pitchlab/web exec vitest run tests --no-file-parallelism`):
  - `packages/contracts`: `5/5`
  - `packages/db`: `24/24`
  - `packages/spacetime`: `97/97`
  - `packages/tokens`: `3/3`
  - `packages/engines-reference`: `394/394`
  - `packages/models`: `41/41`
  - `packages/sports-assets`: `3/3`
  - `packages/emails`: `56/56`
  - `packages/ui`: `58/58`
  - `services/ingest`: `115/116` (`1` omitida en `tests/xg-offline.test.ts`)
  - `apps/web`: `100/100` (`18` archivos)
- `pnpm build`: **exit 0** (compilación completa de los 12 proyectos, `next build` y validaciones de producción).
- `$env:CI = "1"; pnpm e2e`: **10/10 aprobados** (`desktop` y `mobile`, incluyendo Axe WCAG AA y redirecciones `308`).

---

## 3. En qué nos quedamos y qué falta al continuar en casa

### Estado exacto de la rama
- Todo el trabajo de la auditoría de rutas y los 3 bloques de correcciones quedó **cerrado, limpio y subido** en GitHub bajo la rama `detect_broken_outdated_pages`.
- **Nota sobre trabajo paralelo previo en esta PC:** en el directorio principal `C:\Users\T490s\Desktop\Proyectos\PitchLab`, la rama `gemini-reestructura` tiene `10` commits locales (`COMUNIDAD-2`, `0834c32`) sin push a `origin` al momento de cerrar esta sesión. Conviene subir o tener en cuenta esos commits al integrar `detect_broken_outdated_pages` en `gemini-reestructura`.

### Pasos para continuar en casa
```bash
git fetch origin
git checkout detect_broken_outdated_pages
pnpm install
pnpm dev
```

Al integrar `detect_broken_outdated_pages` dentro de `gemini-reestructura` (vía PR o `git merge`), revisar estos archivos tocados en ambas ramas (especialmente los relacionados con `COMUNIDAD-2`):
- `apps/web/app/layout.tsx`
- `apps/web/src/server/platform-data.ts`
- `apps/web/src/server/viewer-access.ts`
- `packages/ui/src/platform/platform-provider.tsx`
- `packages/ui/src/platform/components/ShellChrome.tsx`
- `packages/ui/src/platform/club/{AccountReferralsClubView,AnalystProfileClubView,CommunityClubView}.tsx`
- `docs/execution/PROJECT_STATE.md` (actualizar tras el merge para registrar el cierre de esta rama)

### Pendientes posteriores de F4 / producto (fuera de esta rama)
1. **Frescura de snapshots (< 72 h):** regenerar/sincronizar `live_matchday_v3_snapshot.json` periódicamente en producción.
2. **Baja de correos en 1 clic (`/baja?token=...`):** conectar token firmado HMAC/verificado cuando se habiliten envíos automáticos/marketing en Resend.
3. **Lectura pública de picks/parlays personales en `/p/[pickId]`:** extender desde la BD cuando el endpoint público de picks sellados de socios entre en F4.
4. **Cobro y despliegue en producción:** conectar Stripe Customer Portal para cambiar tarjeta/cancelar/reactivar desde `PlanTab` y cargar las variables de `.env.example` en Vercel/Neon/Resend/Turnstile.
