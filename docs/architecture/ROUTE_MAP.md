# Mapa de rutas (pitchlab.mx)

> **Propósito:** la fuente única de las URLs. Ningún prompt inventa rutas: las toma de aquí, y un cambio de ruta se hace aquí primero.
> **Consumidores:** `apps/web` (App Router), agentes de sección, SEO y emails.
> **Fecha:** 2026-11-08 · **Decisión:** Opción A, un solo origen (plan maestro §3).

## 1. Convenciones

- Un solo origen `https://pitchlab.mx`. Las rutas públicas son indexables; `/app` y `/admin` llevan `noindex`.
- Idioma: es-MX sin prefijo. Inglés futuro con el prefijo `/en/...` (next-intl, `localePrefix: 'as-needed'`).
- **`[league]`** es un slug global y único que también determina el deporte:

  | league | deporte | Estado |
  |---|---|---|
  | `nfl` | american-football | MVP |
  | `liga-mx` | soccer | MVP |
  | `premier-league` | soccer | MVP |
  | `ncaaf` | american-football | Post-MVP |
  | `nhl` | hockey | Post-MVP |
  | `mlb` | baseball | Post-MVP |

- IDs de entidades en las URLs: los IDs canónicos de PitchLab (`gameId`, `teamId` y `playerId` como slugs o ULID), nunca los de un proveedor.
- **El estado de vista vive en la query** (nuqs), con nombres estables y compartidos entre secciones:

  | Param | Ejemplo | Uso |
  |---|---|---|
  | `season` | `2026` | Temporada |
  | `week` / `round` | `10` | Jornada |
  | `market` | `rec_yds`, `ml`, `spread`, `total` | Mercado |
  | `line` | `64.5` | Línea |
  | `side` | `over` / `under` / `home` / `away` | Lado |
  | `window` | `l5`, `l10`, `l20`, `season`, `h2h` | Ventana de muestra |
  | `split` | `home`, `away`, `vs:<teamId>` | Split |
  | `books` | `bet365,draftkings` | Casas visibles |
  | `asOf` | ISO-8601 | Instante (Replay) |
  | `tab` | `odds` | Pestaña activa |

- Se redirige la ruta de una liga deshabilitada para el plan o país del usuario a su hub con un estado explicativo, nunca a un 404.

## 2. Rutas públicas

| Ruta | Sección (ID) | Render | Notas |
|---|---|---|---|
| `/` | 01 Landing | SSG/ISR | OG por defecto |
| `/pricing` | 02 Pricing | SSG | Precios con IVA |
| `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email` | 03 Auth | SSR | Better Auth |
| `/r/[code]` | 38 Referrals | SSR | Guarda el código y el UTM en una cookie first-party (30 días) |
| `/invite/[token]` | 38 Invites | SSR | |
| `/u/[handle]` | 36 Perfil público | ISR | 404 si el perfil es privado. OG dinámico. |
| `/p/[pickId]` | 36 Pick público | ISR | OG dinámico. Solo picks de perfiles públicos. |
| `/leaderboards` | 37 Leaderboards | ISR | Detrás del flag `social.leaderboards.public` |
| `/help`, `/help/[slug]` | 35 Ayuda | SSG | |
| `/metodologia`, `/metodologia/[slug]` | 35 Metodología | SSG | Modelos, métricas y glosario |
| `/legal/privacidad`, `/legal/terminos`, `/legal/juego-responsable` | 35 Legal | SSG | |
| `/api/og/[kind]/[id]` | 36 / social | Edge | Share cards (`pick`, `profile`, `game`) |

## 3. Rutas de producto (`/app`, requieren sesión)

| Ruta | Sección (ID) | Notas |
|---|---|---|
| `/app` | 05 Dashboard | |
| `/app/onboarding` | 04 Onboarding | Redirección forzada tras el primer login |
| `/app/explore` | 06 Sports Explorer | Deportes, ligas y temporadas. Incluye Archive (ex-19). |
| `/app/explore/archive?league=&season=` | 06 (ex-19 Historical Explorer) | |
| `/app/[league]` | 07 SportHub (+ 08–11 configuración por deporte) | `?tab=games\|standings\|teams\|players\|markets` |
| `/app/[league]/games/[gameId]` | 12 Game Center | `?tab=summary\|stats\|players\|odds\|history\|model` |
| `/app/[league]/players` | 13 Player Explorer | |
| `/app/[league]/players/[playerId]` | 14 Player Profile | `?tab=overview\|logs\|splits\|props` |
| `/app/[league]/props` | 15 Player Prop Lab | `?player=&market=&line=&window=&split=` |
| `/app/[league]/teams`, `/app/[league]/teams/[teamId]` | 16 Team Explorer | |
| `/app/[league]/odds` | 17 Odds / Market Explorer (+ ex-18) | `?tab=current\|history\|movement&game=` |
| `/app/replay/[gameId]` | 20 Historical Replay | `?asOf=` |
| `/app/predictions` | 21 Prediction Center | `?league=` |
| `/app/models`, `/app/models/[modelId]` | 22 Model Lab | |
| `/app/backtest` | 23 Backtesting Studio | |
| `/app/ai` | 24 PitchLab AI | También se abre como panel lateral en cualquier ruta (`?ai=1`) |
| `/app/lab` | 25 My Lab (+ ex-27) | `?tab=journal\|performance\|bankroll-sim` |
| `/app/watchlists` | 26 Watchlists & Alerts | |
| `/app/notifications` | 34 Notification Center | |
| `/app/search?q=` | 33 Global Search | También como paleta de comandos (⌘K / Ctrl+K) |
| `/app/account` | 28 Account & Billing | Subrutas `profile`, `security`, `billing`, `referrals`, `notifications`, `privacy` |

## 4. Rutas de administración (`/admin`, rol `admin` o `staff` + MFA)

| Ruta | Sección |
|---|---|
| `/admin` | 29 Admin Dashboard |
| `/admin/data` | 30 Data Operations |
| `/admin/models` | 31 Model Operations |
| `/admin/users`, `/admin/billing`, `/admin/invites` | 32 Billing & Users |
| `/admin/moderation` | 32 (ampliado: moderación social) |

## 5. API interna (route handlers, BFF)

`/api/v1/...` versionada, con DTOs en `packages/contracts`. Autorización por `can(user, feature)` en cada handler. Webhooks en `/api/webhooks/[provider]` con firma e idempotencia. El detalle de endpoints se define en F3 (`SYSTEM_ARCHITECTURE.md`).

## 6. Redirecciones y alias

- `/app/[league]/games/[gameId]/odds` → `?tab=odds` (alias legibles para compartir).
- `/[league]` (por ejemplo, `/nfl`) → `/app/nfl` para usuarios con sesión. Sin sesión, la landing de la liga (post-MVP, SEO).
