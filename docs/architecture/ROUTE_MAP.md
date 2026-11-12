# Mapa de rutas (`pitchlab.mx`)

> **Propósito:** fuente única de verdad de las URLs implementadas en `apps/web/app/`. Todo enlace en UI, correos, SEO (`robots.ts` / `sitemap.ts`) y guardas (`club-route-guard.ts`) sigue este mapa.
> **Actualizado:** 2026-11-12 · **Arquitectura:** Next.js App Router (`apps/web/app`), un solo origen (`https://pitchlab.mx`).

## 1. Convenciones

- Un solo origen `https://pitchlab.mx`. Las páginas públicas de marketing y legales son indexables (`/sitemap.ts` y `Allow: /` en `/robots.txt`).
- Rutas privadas, flujos de autenticación, referidos, boletos compartidos, onboarding y área interna llevan `noindex` y/o exclusión en `robots.ts` (`/app/`, `/api/`, `/i/`, `/onboarding`, `/p/`, `/baja`).
- **`[league]`** acepta exactamente las ligas activas del producto (`PRODUCT_LEAGUES` en `apps/web/src/server/snapshots.ts`):

  | league | Deporte |
  |---|---|
  | `liga-mx` | soccer |
  | `premier-league` | soccer |
  | `laliga` | soccer |
  | `bundesliga` | soccer |
  | `serie-a` | soccer |
  | `ligue-1` | soccer |
  | `nfl` | american-football |

- Las rutas inexistentes bajo `/` o bajo `/app/*` devuelven `HTTP 404` real (validado antes del streaming por `resolveClubRoute` en `apps/web/app/app/layout.tsx`).

## 2. Rutas públicas indexables

| Ruta | Propósito | Notas |
|---|---|---|
| `/` | Portada / Landing | Muestra interactiva y Pase PitchLab Ultra |
| `/como-funciona` | Explicación del producto | Tres números en cada partido |
| `/parlays` | Vitrina pública de Parlays | Combinadas de 2 a 6 selecciones |
| `/resultados` | Historial público auditado | Marcadores cerrados y lectura previa |
| `/motores` | Ciencia y validación | Precisión fuera de muestra y motores |
| `/precio` | Planes y Pase PitchLab Ultra | Precio en MXN con IVA y CFDI |
| `/comunidad` | Comunidad y tipstars | Ranking de muestra y portal de creadores |
| `/legal/privacidad` | Aviso de privacidad | — |
| `/legal/terminos` | Términos de uso | Incluye ancla `#comunidad` |
| `/legal/juego-responsable` | Juego responsable (+18) | Pausas voluntarias y Línea de la Vida |
| `/legal/creditos` | Créditos de datos abiertos | `nflverse`, `openfootball`, `football-data.org` |

## 3. Redirecciones permanentes (`HTTP 308`) y rutas públicas `noindex`

| Ruta | Comportamiento / Propósito | Notas |
|---|---|---|
| `/pricing` | Redirección `308` -> `/precio` | Preserva query string |
| `/plans` | Redirección `308` -> `/precio` | Preserva query string |
| `/metodologia` | Redirección `308` -> `/motores` | Preserva query string |
| `/tecnologia` | Redirección `308` -> `/motores` | Preserva query string |
| `/i/[code]` | Redirección `307` -> `/pricing/referral?code=...` | Resuelve `@handle` en DB, preserva UTM y redirige a `/precio` si el código es inválido; `noindex` |
| `/pricing/referral` | Página personalizada de invitación (`noindex`) | Redirige a `/precio` sin código válido cuando hay DB; consulta `@handle` en DB |
| `/plans/referral` | Alias de `/pricing/referral` (`noindex`) | Re-exporta página y `generateMetadata` |
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
| `/app/historial` | Resultados cerrados (`FT`) | Historial completo de partidos finalizados |
| `/app/lab` | Mi Bitácora | Picks y parlays sellados con CLV y CSV |
| `/app/tech` | Motores dentro del Club | Validación y comparativa interna |
| `/app/social` | Comunidad VIP | Feed y ranking de socios |
| `/app/account` | Cuenta, Preferencias, Plan, CFDI y Referidos | `?tab=prefs|plan|cfdi|referrals`, `?pago=ok|cancelado` |
| `/app/tipstar` | Portal de Tipstars Oficiales | `?connect=ok|refresh` (Stripe Connect) |
| `/app/admin` | Panel del equipo fundador | Solo `isAdmin` (o preview tools habilitado), si no `HTTP 404` |
| `/app/[league]` | Hub por liga | `?league` validado contra `PRODUCT_LEAGUES`, si no `HTTP 404` |
| `/app/[league]/games/[gameId]` | Match Studio | Analizador 360°, `?tab=picks|mercados|contexto|dinero` |
| `/app/u/[handle]` | Perfil de socio o tipstar | `404` si el handle no existe o es privado |

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

## 5. Endpoints HTTP reales (`apps/web/app/api/*`)

- Autenticación y onboarding: `/api/auth/[...all]`, `/api/handles/check`, `/api/me/signup`, `/api/beta/unlock`, `/api/beta/logout`.
- Cuenta, bitácora y preferencias: `/api/me/profile`, `/api/me/profile/x`, `/api/me/journal`, `/api/me/watchlist`, `/api/me/plan`, `/api/me/referrals`, `/api/me/email-preferences`.
- Perfiles públicos y creator economy: `/api/u/[handle]`, `/api/tipstar/connect`, `/api/billing/checkout`, `/api/webhooks/stripe`, `/api/cron/tipstar-payouts`.
- Administración interna: `/api/admin/overview`, `/api/admin/flags`, `/api/admin/tipstars`.
