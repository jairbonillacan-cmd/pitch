# Mapa de rutas (`pitchlab.mx`)

> **Propósito:** fuente única de verdad de las URLs implementadas en `apps/web/app/` (**`55/55` `page.tsx` productivos**, incluyendo `/verificacion`, `/app/alertas`, `/app/[league]/arbitros` y `/app/[league]/r/[refereeSlug]`). Todo enlace en UI, correos, SEO (`robots.ts` / `sitemap.ts`) y guardas (`club-route-guard.ts`) sigue este mapa.
> **Actualizado:** 2026-11-21 · **Arquitectura:** Next.js App Router (`apps/web/app`), un solo origen (`https://pitchlab.mx`).

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
| `/resultados` | Historial público auditado | Marcadores cerrados y lectura previa (`ISR`) |
| `/verificacion` | Verificador criptográfico SHA-256 (`ADR-057`/`ADR-058`) | Recálculo local 100 % cliente con WebCrypto API (sin enviar datos a servidor); `ISR revalidate=3600`, JSON-LD `WebApplication` + `BreadcrumbList` |
| `/motores` | Ciencia y validación | Precisión fuera de muestra y motores |
| `/precio` | Planes y Pase PitchLab Ultra | Precio en MXN con SPEI, IVA y CFDI |
| `/u/[handle]` | Perfil público compartido de socio o tipster | Accesible sin sesión solo si `publicRecordVisible === true` y registro completo (`404` en caso contrario); OpenGraph dinámico `1200×630` |
| `/legal/privacidad` | Aviso de privacidad | — |
| `/legal/terminos` | Términos de uso | Incluye ancla `#comunidad` |
| `/legal/juego-responsable` | Juego responsable (+18) | Pausas voluntarias inmediatas (`24h`/`7d`/`30d`, comunidad) y `tel:` Línea de la Vida / CIJ |
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
| `/baja` | Centro de preferencias y baja de avisos por correo | `noindex`; enlaza a `/app/account?tab=prefs`. Complementado por el enlace firmado en correos `/api/me/email-preferences/unsubscribe` (`GET` seguro sin mutación que enlaza a `/app/account` + `POST` de confirmación) |
| `/offline` | Pantalla de respaldo sin conexión PWA (`ADR-053`) | `noindex`; única ruta HTML precacheada por `public/sw.js` en producción |

## 4. Rutas del Club (`/app/*`, requieren sesión + `noindex`)

| Ruta | Vista | Notas |
|---|---|---|
| `/app` | Jornada de hoy (`ADR-059`/`ADR-060`) | Maestro-Detalle en escritorio (`>= 1024 px`: cartelera densa `~40%` con forma + `HomeMatchDetailPanel` sticky `~60%` vía `/api/games/[gameId]/preview`, conmutable a *Tu parlay / Parlay del día*); calendario compacto con `isEffectiveLiveGame`; navegación directa a `/app/[league]/g/[gameSlug]` en móvil (`< 1024 px`) |
| `/app/picks` | Picks recomendados, En Vivo y Bet Lab (`ADR-059`/`ADR-061`) | Picks recomendados Spacetime v5.1 (excluye `< 1.25` por defecto), *Pick del día* (`1.45–2.80`), tabla 4 cols + rail sticky, `<LivePickProgressBar>` y `PickEvidenceLabDrawer` (`/api/picks/screener` y `/api/picks/lab/[pickId]`) |
| `/app/parlays` | Armador de parlays y SGP (`ADR-061`) | Tope único `2–6` piernas (`MAX_PARLAY_LEGS = 6`), diversidad en 3 pasadas, SGP multi-deporte (5 deportes), boleto vacío `—` (cero `-5000`), cero jerga matemática y guardado `.strict()` en bitácora |
| `/app/props` | Tendencias y props de jugadores (`ADR-046`/`ADR-058`) | Protegido por `fullAccess` (`Cero-Fuga`); tabla maestra + `<PropBetLabChart>` (curva minutos + `xG` + rival EB) |
| `/app/alertas` | Alertas de mercado y Copiloto NL (`ADR-058`/`ADR-061`) | `5` triggers (`market_opened`, `sharp_steam`, `stale_line_ev`, `lineup_confirmed`, `schedule_change`), parser ES determinista, Copiloto NL ZDR opt-in (`FLAG_AI_ENABLED`) y `requireFullAccess: true` en `/api/alerts` y `/api/live/alerts` |
| `/app/momios` | Comparador de momios | Matriz terminal multi-casa anclada a `Momio justo PitchLab` (`SpacetimeAnchoredQuote`), de-vig misma-casa y blindaje Anti-EV (`ADR-061`) |
| `/app/comparar` | Comparador rápido H2H (`?modo=equipos\|jugadores&liga=&a=&b=`) | Equipos cara a cara (incl. `Ataque vs Defensa`), jugadores lado a lado y descarga 9:16 |
| `/app/historial` | Resultados cerrados (`FT`) | Historial completo + `<CalibrationCurveChart>` (Brier, ECE y cubetas reales) |
| `/app/lab` | Mi Récord / Bitácora (`ADR-061`) | Picks y parlays sellados inmutables (`0025`/`0027`, tope `6` piernas) con `<LivePickProgressBar>`, filtros separados `Tipo`/`Estado`, CLV creíble unificado (`[-60, 25]` simple / `[-60, 50]` parlay, sin mutar `sealed_picks`) y CSV |
| `/app/tech` | Motores dentro del Club | Validación y comparativa interna |
| `/app/social` | Comunidad VIP | Feed (`Para ti · Siguiendo · Consenso · Ranking`), moderación y copiar a parlay |
| `/app/account` | Cuenta, Preferencias, Plan, CFDI y Referidos | `?tab=prefs|plan|cfdi|referrals`, `?pago=ok|cancelado`; SPEI, modales en `General`, `Tus ligas` por deporte y país, casas/vistas guardadas DB (`0025`), enlace canónico de baja de correos (`/api/me/email-preferences/unsubscribe`), export y solicitud ARCO |
| `/app/juego-responsable` | Juego responsable (+18) dentro del Club | Pausas voluntarias inmediatas (`24h`/`7d`/`30d`), pausa de Comunidad, solo unidades, principios +18 y líneas `tel:` directas (`800 911 2000`, `55 5212 1212`) |
| `/app/canjear` | Canje de cupón dentro del Club (`?codigo=`) | Redime cupones de acceso y extiende días del pase |
| `/app/tipster` | Portal de Tipsters Oficiales | Solo `isTipster` o `isAdmin`; lee `/api/tipster/me`; `?connect=ok|refresh` en modo Stripe Connect |
| `/app/admin` | Panel del equipo fundador | Solo `isAdmin` con correo verificado (si no `HTTP 404`); `4` pestañas (`Salud de datos & Ligas`, `Seguridad & Anti-Scraping`, `Pagos & Cupones`, `Socios & Moderación`) |
| `/app/[league]` | Hub por liga o competencia (`57` ligas activas en `PRODUCT_LEAGUES`, `ADR-060`) | `?league` validado contra `PRODUCT_LEAGUES`, si no `HTTP 404`; layout editorial 2 cols desktop (`DOM < 1,500`, UCL `36` clubes), tab contextual `Árbitros` y `Cero-Fuga` en `loadLeagueHubEnrichment` |
| `/app/[league]/arbitros` | Directorio y ranking arbitral por liga (`ADR-058`/`ADR-060`/`ADR-061`) | Solo fútbol con `providers.referees === true` (`404` en el resto); **retirado del header global y de la hoja móvil `Explorar`** (accesible vía tab `Árbitros` de `/app/[league]`, URL directa y `Cmd+K`); protegido en RSC por `getViewerAccess()` (`Cero-Fuga`) con tasas suavizadas EB `κ = 15` |
| `/app/[league]/r/[refereeSlug]` | **Canónica** · Perfil disciplinario del árbitro (`ADR-058`/`ADR-060`/`ADR-061`) | `league` y `refereeSlug` (`CanonicalPublicSlug`) validados (`404` si faltan); protegido en RSC por `getViewerAccess()` (`Cero-Fuga`, sin filtrar metadatos ni perfiles a visitantes); hasta `20` jornadas recientes y jugadores amonestables; accesible vía `/app/[league]`, `/app/[league]/arbitros` y `Cmd+K` |
| `/app/[league]/g/[gameSlug]` | **Canónica** · Match Studio (`<home>-vs-<away>-<hash6>`, ADR-042) | Analizador 360°, árbitro y contexto, `?tab=resumen\|ia\|numeros\|dinero\|contexto` |
| `/app/[league]/t/[teamSlug]` | **Canónica** · Perfil del club o selección (ADR-042) | `?league` y `teamSlug` validados (`404` si faltan), `?tab=resumen\|estadisticas\|plantilla\|partidos`, standings splits y brackets SVG |
| `/app/[league]/t/[teamSlug]/p/[playerSlug]` | **Canónica** · Perfil individual del jugador (ADR-042) | `?league`, `teamSlug` y `playerSlug` validados (`404` si faltan); incluye `<PropBetLabChart>` |
| `/app/[league]/games/[gameId]` | Redirección permanente `308` -> `/app/[league]/g/[gameSlug]` | Preserva query string (ADR-042) |
| `/app/[league]/teams/[teamId]` | Redirección permanente `308` -> `/app/[league]/t/[teamSlug]` | Preserva query string (ADR-042) |
| `/app/[league]/teams/[teamId]/players/[playerSlug]` | Redirección permanente `308` -> `/app/[league]/t/[teamSlug]/p/[playerSlug]` | Preserva query string (ADR-042) |
| `/app/u/[handle]` | Perfil de socio o tipster dentro del Club (`noindex`) | `404` si el handle no existe o es privado; insignias y recibo SHA-256 verificable en `/verificacion` |

### Alias legados dentro de `/app/*` (`club-route-guard.ts`)

| Alias | Redirección canónica |
|---|---|
| `/app/account/referrals` | `/app/account?tab=referrals` |
| `/app/account/notifications`, `/app/settings` | `/app/account?tab=prefs` |
| `/app/cuenta` | `/app/account` |
| `/app/alerts` | `/app/alertas` |
| `/app/journal`, `/app/bitacora` | `/app/lab` |
| `/app/resultados` | `/app/historial` |
| `/app/comunidad` | `/app/social` |
| `/app/motores` | `/app/tech` |
| `/app/precio` | `/app/account?tab=plan` |
| `/app/epl` | `/app/premier-league` |
| `/app/la-liga` | `/app/laliga` |
| `/app/tipstar` | `/app/tipster` |
| `/app/h2h`, `/app/compare` | `/app/comparar` |
| `/app/responsible-play` | `/app/juego-responsable` |

## 5. Endpoints HTTP reales (`apps/web/app/api/*`)

Todas las **`89` rutas** están gobernadas al `100 %` (`ADR-057` + `ADR-061`: **`87` envueltas directamente** en uno de los `6` wrappers canónicos de `apps/web/src/server/api-guards.ts` —incluyendo `/api/beta/unlock` y `/api/beta/logout` bajo `withPublicRead` con `failClosed: true`— + `2` exenciones de protocolo endurecidas: `/api/auth/[...all]` con rate-limit *fail-closed* y `/api/webhooks/stripe` con firma HMAC Stripe; verificadas por `require-api-wrapper` en `scripts/lint-codebase.mjs`):

- **Autenticación, onboarding y sesión pública (7):** `/api/auth/[...all]`, `/api/handles/check`, `/api/handles/suggest`, `/api/me/signup`, `/api/beta/unlock` (`withPublicRead`, `failClosed: true`), `/api/beta/logout` (`withPublicRead`, `failClosed: true`), `/api/public/session`.
- **Salud, shell progresivo, en vivo, noticias, búsqueda, comparación y parlays SGP (12):** `/api/health`, `/api/shell/extend`, `/api/analytics/funnel`, `/api/live/scoreboard`, `/api/live/alerts` (`requireFullAccess: true`), `/api/live/games/[gameId]`, `/api/news/article`, `/api/search/players`, `/api/search/referees` (`withSessionRead`, `limit <= 40`, allowlist `PRODUCT_LEAGUES`), `/api/compare`, `/api/parlays/sgp` (`withActivePaseMutation`, `.max(6).strict()`, SGP 5 deportes), `/api/me/live-picks` (`GET`, `withSessionRead`, `allowBeta: false`, `X-PitchLab-Trace`, `private, no-store`).
- **Screener de picks, Bet Lab y vista previa Maestro-Detalle (`ADR-059` · `withSessionRead`, `allowBetaPin: true`, `private, no-store`, `Cero-Fuga`) (3):**
  - `GET /api/picks/screener` (paginación `limit <= 40` de picks recomendados + `picksOfTheDay`).
  - `GET /api/picks/lab/[pickId]` (series históricas reales `barsFor`/`barsAgainst`, `recentHistory` y `relatedPicks` para `PickEvidenceLabDrawer`; `404` si inexistente o bloqueado por `Cero-Fuga`).
  - `GET /api/games/[gameId]/preview` (detalle embebido bajo demanda para `HomeMatchDetailPanel`, con `detail`, `standings` e `injuries`, manteniendo el shell RSC `<= 480 KB`; `404` si inexistente).
- **Alertas de mercado y Copiloto NL (`0026`, `ADR-058`/`ADR-061`) (3):** `/api/alerts` (`GET` `withSessionRead` con `requireFullAccess: true`; `POST|PATCH|DELETE` `withActivePaseMutation`), `/api/alerts/copilot` (`POST`, `withActivePaseMutation`, `15/min`), `/api/alerts/batch` (`POST`, `withActivePaseMutation`, máx. `10` ops atómicas).
- **Cuenta, plan, cupones, preferencias, push, feedback y privacidad (21):** `/api/me/profile`, `/api/me/profile/x`, `/api/me/avatar`, `/api/me/badges`, `/api/me/journal` (`.strict()`, máx. `6` piernas), `/api/me/watchlist`, `/api/me/plan`, `/api/me/transfers`, `/api/me/transfers/[id]`, `/api/me/coupons/preview`, `/api/me/redeem`, `/api/me/referrals`, `/api/me/preferences`, `/api/me/email-preferences`, `/api/me/email-preferences/unsubscribe` (`GET` seguro sin mutación con formulario HTML `<form method="POST">` sin JS inline + enlace canónico `/app/account`; `POST` aplica baja RFC 8058), `/api/me/push`, `/api/me/feedback`, `/api/me/export`, `/api/me/deletion-request`, `/api/me/notifications`, `/api/me/notifications/read`.
- **Comunidad, perfiles, tipsters y pagos (18):** `/api/u/[handle]`, `/api/u/[handle]/record`, `/api/social/posts`, `/api/social/posts/[id]`, `/api/social/posts/[id]/comments`, `/api/social/posts/[id]/comments/[commentId]`, `/api/social/posts/[id]/comments/[commentId]/like`, `/api/social/posts/[id]/like`, `/api/social/posts/[id]/copy`, `/api/social/follows`, `/api/social/reports`, `/api/social/consensus`, `/api/social/ranking`, `/api/social/votes`, `/api/tipster/me`, `/api/tipster/connect`, `/api/billing/checkout`, `/api/webhooks/stripe`.
- **Tareas programadas (`withCronSecret`) (5):** `/api/cron/settle-picks`, `/api/cron/push-alerts`, `/api/cron/tipster-payouts`, `/api/cron/weekly-digest`, `/api/cron/monthly-record`.
- **Administración interna (`withAdminMutation` / `requireAdmin`) (20):** `/api/admin/overview`, `/api/admin/data-health`, `/api/admin/security-abuse` (`GET`, `limit <= 40`, telemetría `security_abuse_events` 24 h), `/api/admin/flags`, `/api/admin/moderation`, `/api/admin/tipsters`, `/api/admin/transfers`, `/api/admin/transfers/[id]/approve`, `/api/admin/transfers/[id]/reject`, `/api/admin/coupons`, `/api/admin/coupons/batch`, `/api/admin/coupons/[id]`, `/api/admin/coupons/[id]/redemptions`, `/api/admin/inbox`, `/api/admin/audit`, `/api/admin/members`, `/api/admin/access/grant`, `/api/admin/access/revoke`, `/api/admin/tipster-payouts`, `/api/admin/tipster-payouts/[id]/mark-paid`.

## 6. Rutas Atlas SEO reservadas / diferidas (NO implementadas en esta fase)

Las siguientes URLs están reservadas únicamente para una futura fase de Atlas SEO público y **NO existen como `page.tsx`** en `apps/web/app/` (frente a las **`55/55` rutas `page.tsx` productivas implementadas**, que sí incluyen `/verificacion`, `/app/alertas`, `/app/[league]/arbitros` y `/app/[league]/r/[refereeSlug]`):

| Ruta reservada | Estado actual | Regla operativa |
|---|---|---|
| `/estadisticas/[league]` | **Diferida (NO implementada)** | Devuelve `HTTP 404`; prohibido enlazar en UI, correos o `sitemap.ts` hasta su fase dedicada |
| `/estadisticas/[league]/equipos/[teamSlug]` | **Diferida (NO implementada)** | Devuelve `HTTP 404`; la superficie productiva equivalente en el Club es `/app/[league]/t/[teamSlug]` |
| `/estadisticas/[league]/jugadores/[playerSlug]` | **Diferida (NO implementada)** | Devuelve `HTTP 404`; la superficie productiva equivalente en el Club es `/app/[league]/t/[teamSlug]/p/[playerSlug]` |
| `/estadisticas/[league]/arbitros/[refereeSlug]` | **Diferida (NO implementada)** | Devuelve `HTTP 404`; la superficie productiva equivalente en el Club es `/app/[league]/r/[refereeSlug]` |
| `/estadisticas/[league]/h2h/[matchupSlug]` | **Diferida (NO implementada)** | Devuelve `HTTP 404`; la superficie productiva equivalente en el Club es `/app/comparar` |
| `/partidos/[league]/[gameSlug]` | **Diferida (NO implementada)** | Devuelve `HTTP 404`; la superficie productiva equivalente en el Club es `/app/[league]/g/[gameSlug]` |
