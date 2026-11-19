# Mapa de rutas (`pitchlab.mx`)

> **Propósito:** fuente única de verdad de las URLs implementadas en `apps/web/app/`. Todo enlace en UI, correos, SEO (`robots.ts` / `sitemap.ts`) y guardas (`club-route-guard.ts`) sigue este mapa.
> **Actualizado:** 2026-11-19 · **Arquitectura:** Next.js App Router (`apps/web/app`), un solo origen (`https://pitchlab.mx`).

## 1. Convenciones

- Un solo origen `https://pitchlab.mx`. Las páginas públicas de marketing y legales son indexables (`/sitemap.ts` y `Allow: /` en `/robots.txt`).
- Rutas privadas, flujos de autenticación, referidos, boletos compartidos, onboarding y área interna llevan `noindex` y/o exclusión en `robots.ts` (`/app/`, `/api/`, `/i/`, `/onboarding`, `/p/`, `/baja`, `/canjear`).
- **`[league]`** acepta exactamente las **57 competencias** registradas en `PRODUCT_LEAGUES` / `COMPETITION_CATALOG` (`packages/contracts/src/competitions.ts`, ADR-043):
  - *Principales de fútbol (6):* `liga-mx`, `premier-league`, `laliga`, `bundesliga`, `serie-a`, `ligue-1`.
  - *Deportes EE. UU. (4):* `nfl`, `nba`, `nhl`, `mlb`.
  - *Norteamérica y CONCACAF clubes (3):* `mls`, `concacaf-champions`, `leagues-cup`.
  - *Copas internacionales de clubes (7):* `champions-league`, `europa-league`, `conference-league`, `uefa-super-cup`, `libertadores`, `sudamericana`, `caf-champions`.
  - *Sudamérica (9):* `liga-argentina`, `brasileirao`, `brasileirao-b`, `copa-do-brasil`, `primera-a-colombia`, `copa-colombia`, `primera-chile`, `ligapro-ecuador`, `liga-1-peru`.
  - *Copas y 2.ª división Top 5 europeo (12):* `championship`, `fa-cup`, `carabao-cup`, `segunda-espana`, `copa-del-rey`, `liga-f`, `bundesliga-2`, `dfb-pokal`, `serie-b`, `coppa-italia`, `ligue-2`, `coupe-de-france`.
  - *Otras 1.ª divisiones europeas, Medio Oriente y Asia (6):* `eredivisie`, `liga-portugal`, `pro-league-belgica`, `super-lig`, `saudi-pro-league`, `j1-league`.
  - *Selecciones nacionales (10):* `concacaf-nations`, `uefa-nations`, `amistosos`, `copa-del-mundo`, `eliminatorias`, `copa-america`, `eurocopa`, `copa-oro`, `copa-africana`, `copa-asiatica`.
  - Las competencias sin partidos en vivo ni programados en los próximos 30 días se ocultan automáticamente de las tiras activas (manteniendo su URL directa y activables en `Preferencias → Ver en pausa`).

- Las rutas inexistentes bajo `/` o bajo `/app/*` devuelven `HTTP 404` real (validado antes del streaming por `resolveClubRoute` en `apps/web/app/app/layout.tsx`).

## 2. Rutas públicas indexables

| Ruta | Propósito | Notas |
|---|---|---|
| `/` | Portada / Landing | Muestra interactiva, herramientas y Pase PitchLab Ultra |
| `/resultados` | Historial público auditado | Marcadores cerrados y lectura previa |
| `/motores` | Ciencia y validación | Precisión fuera de muestra y motores |
| `/precio` | Planes y Pase PitchLab Ultra | Precio en MXN con SPEI, IVA y CFDI |
| `/legal/privacidad` | Aviso de privacidad | — |
| `/legal/terminos` | Términos de uso | Incluye ancla `#comunidad` |
| `/legal/juego-responsable` | Juego responsable (+18) | Pausas voluntarias y Línea de la Vida |
| `/legal/creditos` | Créditos de datos abiertos | `nflverse`, `openfootball`, `football-data.org` |
| `/blog` | Índice del blog | Artículo destacado + rejilla; JSON-LD `Blog`; RSS en `/blog/rss.xml`. Guía: `docs/content/BLOG.md` |
| `/blog/categoria/[categoria]` | Artículos de una categoría | `momios`, `parlays`, `juego-responsable`, `guias` (`BLOG_CATEGORIES`); `404` si no existe; `noindex` y fuera del sitemap si está vacía |
| `/blog/[slug]` | Artículo | Markdown en `apps/web/content/blog/<slug>.md`; JSON-LD `BlogPosting` + `BreadcrumbList`; imagen OG generada; `404` si no existe o no está publicado |

## 3. Redirecciones permanentes (`HTTP 308`) y rutas públicas `noindex`

| Ruta | Comportamiento / Propósito | Notas |
|---|---|---|
| `/como-funciona` | Redirección `308` -> `/#hoy` | Preserva query string |
| `/parlays` | Redirección `308` -> `/#que-obtienes` | Preserva query string |
| `/comunidad` | Redirección `308` -> `/` | Preserva query string |
| `/pricing` | Redirección `308` -> `/precio` | Preserva query string |
| `/plans` | Redirección `308` -> `/precio` | Preserva query string |
| `/metodologia` | Redirección `308` -> `/motores` | Preserva query string |
| `/tecnologia` | Redirección `308` -> `/motores` | Preserva query string |
| `/i/[code]` | Redirección `307` -> `/pricing/referral?code=...` | Resuelve `@handle` en DB, preserva UTM y redirige a `/precio` si el código es inválido; `noindex` |
| `/pricing/referral` | Página personalizada de invitación (`noindex`) | Redirige a `/precio` sin código válido cuando hay DB; consulta `@handle` en DB |
| `/plans/referral` | Alias de `/pricing/referral` (`noindex`) | Re-exporta página y `generateMetadata` |
| `/canjear` | Canje público de cupón de acceso (`?codigo=`) | Vista previa de código (`noindex`); dirige a `/signup` o `/app/canjear` |
| `/p/[pickId]` | Boleto público compartido (`noindex`) | `404` si el slug/ID no existe; acepta `?code=` de invitación |
| `/login` | Inicio de sesión (Better Auth + PIN beta fallback) | `noindex`; preserva `?next=` |
| `/signup` | Registro en 2 pasos (cuenta + perfil/edad) | `noindex`; preserva `?next=` y `?code=`; guarda paso 2 sin sesión |
| `/onboarding` | Preferencias iniciales (`unitMxn`, ligas, riesgo) | `noindex` |
| `/baja` | Centro de preferencias y baja de avisos por correo | `noindex`; enlaza a `/app/account?tab=prefs` |

## 4. Rutas del Club (`/app/*`, requieren sesión + `noindex`)

| Ruta | Vista | Notas |
|---|---|---|
| `/app` | Jornada de hoy | Partidos próximos, spotlight y top 3 picks |
| `/app/picks` | Todos los picks del día | Buscador con comparador de momio en vivo |
| `/app/parlays` | Armador de parlays y SGP | De 2 a 6 selecciones + guardado en bitácora |
| `/app/props` | Props de jugadores | Estado honesto "próximamente" si el catálogo está vacío |
| `/app/momios` | Comparador de momios | Movimientos y líneas del corte |
| `/app/comparar` | Comparador rápido H2H (`?modo=equipos\|jugadores&liga=&a=&b=`) | Equipos cara a cara con historial real y jugadores lado a lado |
| `/app/historial` | Resultados cerrados (`FT`) | Historial completo de partidos finalizados |
| `/app/lab` | Mi Bitácora | Picks y parlays sellados con CLV y CSV |
| `/app/tech` | Motores dentro del Club | Validación y comparativa interna |
| `/app/social` | Comunidad VIP | Feed y ranking de socios |
| `/app/account` | Cuenta, Preferencias, Plan, CFDI y Referidos | `?tab=prefs|plan|cfdi|referrals`, `?pago=ok|cancelado`; SPEI, preferencias DB, export y solicitud de baja |
| `/app/canjear` | Canje de cupón dentro del Club (`?codigo=`) | Redime cupones de acceso y extiende días del pase |
| `/app/tipster` | Portal de Tipsters Oficiales | En Beta 1.0 lee `/api/tipster/me`; `?connect=ok|refresh` en modo Stripe Connect |
| `/app/admin` | Panel del equipo fundador | Solo `isAdmin` (o preview tools habilitado), si no `HTTP 404`; SPEI, cupones, socios, moderación y comisiones |
| `/app/[league]` | Hub por liga o competencia (57 ligas activas en `PRODUCT_LEAGUES`) | `?league` validado contra `PRODUCT_LEAGUES`, si no `HTTP 404` |
| `/app/[league]/g/[gameSlug]` | **Canónica** · Match Studio (`<home>-vs-<away>-<hash6>`, ADR-042) | Analizador 360°, árbitro y contexto, `?tab=resumen\|ia\|numeros\|dinero\|contexto` |
| `/app/[league]/t/[teamSlug]` | **Canónica** · Perfil del club o selección (ADR-042) | `?league` y `teamSlug` validados (`404` si faltan), `?tab=resumen\|estadisticas\|plantilla\|partidos` |
| `/app/[league]/t/[teamSlug]/p/[playerSlug]` | **Canónica** · Perfil individual del jugador (ADR-042) | `?league`, `teamSlug` y `playerSlug` validados (`404` si faltan) |
| `/app/[league]/games/[gameId]` | Redirección permanente `308` -> `/app/[league]/g/[gameSlug]` | Preserva query string (ADR-042) |
| `/app/[league]/teams/[teamId]` | Redirección permanente `308` -> `/app/[league]/t/[teamSlug]` | Preserva query string (ADR-042) |
| `/app/[league]/teams/[teamId]/players/[playerSlug]` | Redirección permanente `308` -> `/app/[league]/t/[teamSlug]/p/[playerSlug]` | Preserva query string (ADR-042) |
| `/app/u/[handle]` | Perfil público de socio o tipster | `404` si el handle no existe o es privado; botón `Insignias` en cabecera |

### Alias legados dentro de `/app/*` (`club-route-guard.ts`)

| Alias | Redirección canónica |
|---|---|
| `/app/account/referrals` | `/app/account?tab=referrals` |
| `/app/account/notifications`, `/app/settings` | `/app/account?tab=prefs` |
| `/app/cuenta` | `/app/account` |
| `/app/journal`, `/app/bitacora` | `/app/lab` |
| `/app/resultados` | `/app/historial` |
| `/app/comunidad` | `/app/social` |
| `/app/motores` | `/app/tech` |
| `/app/precio` | `/app/account?tab=plan` |
| `/app/epl` | `/app/premier-league` |
| `/app/la-liga` | `/app/laliga` |
| `/app/h2h`, `/app/compare` | `/app/comparar` |

## 5. Endpoints HTTP reales (`apps/web/app/api/*`)

- Autenticación y onboarding: `/api/auth/[...all]`, `/api/handles/check`, `/api/me/signup`, `/api/beta/unlock`, `/api/beta/logout`.
- Búsqueda, comparación y utilidades del Club: `/api/search/players`, `/api/compare`, `/api/me/push`.
- Cuenta, plan, cupones, preferencias, feedback y privacidad: `/api/me/profile`, `/api/me/profile/x`, `/api/me/avatar`, `/api/me/journal`, `/api/me/watchlist`, `/api/me/plan`, `/api/me/transfers`, `/api/me/transfers/[id]`, `/api/me/coupons/preview`, `/api/me/redeem`, `/api/me/referrals`, `/api/me/preferences`, `/api/me/email-preferences`, `/api/me/feedback`, `/api/me/export`, `/api/me/deletion-request`, `/api/me/notifications`, `/api/me/notifications/read`.
- Comunidad, perfiles, tipsters, pagos y tareas programadas: `/api/u/[handle]`, `/api/social/posts`, `/api/social/posts/[id]`, `/api/social/posts/[id]/comments`, `/api/social/posts/[id]/like`, `/api/social/follows`, `/api/social/reports`, `/api/tipster/me`, `/api/tipster/connect`, `/api/billing/checkout`, `/api/webhooks/stripe`, `/api/cron/tipster-payouts`.
- Administración interna (`requireAdmin`): `/api/admin/overview`, `/api/admin/flags`, `/api/admin/moderation`, `/api/admin/tipsters`, `/api/admin/transfers`, `/api/admin/transfers/[id]/approve`, `/api/admin/transfers/[id]/reject`, `/api/admin/coupons`, `/api/admin/coupons/batch`, `/api/admin/coupons/[id]`, `/api/admin/coupons/[id]/redemptions`, `/api/admin/inbox`, `/api/admin/audit`, `/api/admin/members`, `/api/admin/access/grant`, `/api/admin/access/revoke`, `/api/admin/tipster-payouts`, `/api/admin/tipster-payouts/[id]/mark-paid`.
