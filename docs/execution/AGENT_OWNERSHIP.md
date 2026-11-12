# Ownership de agentes

> **Propósito:** qué archivos puede tocar cada agente. Dos agentes nunca escriben los mismos archivos al mismo tiempo.
> **Consumidores:** prompts (sección M y N), `CODEOWNERS` y el revisor de PRs.
> **Fecha:** 2026-11-08 · Estructura en `PITCHLAB_MASTER_PLAN.md` §4 y `FRONTEND_ARCHITECTURE.md` §1.

## 1. Owners de plataforma (cambian poco; cambios por PR dedicado)

| Owner | Globs | Quién |
|---|---|---|
| **Arquitectura** | `docs/architecture/**`, `docs/execution/**`, `docs/PITCHLAB_MASTER_PLAN.md`, `turbo.json`, `pnpm-workspace.yaml`, `package.json` (raíz), `.github/workflows/**`, `packages/config/**` | Sesión de arquitectura (o el fundador) |
| **Contratos** | `packages/contracts/**`, `docs/architecture/SHARED_CONTRACTS.md` | Sesión de arquitectura. Los demás proponen por PR. |
| **Design System (W0)** | `packages/tokens/**`, `packages/ui/**`, `packages/sports-ui/**`, `packages/charts/**`, `packages/sports-assets/**`, `apps/web/src/shell/**`, `apps/web/app/layout.tsx`, `apps/web/app/(public)/layout.tsx`, `apps/web/app/app/layout.tsx`, `apps/web/app/admin/layout.tsx`, `apps/web/app/globals.css`, `docs/design/**` | Agente del prompt 00 |
| **Datos** | `packages/db/**`, `services/ingest/**`, `.github/workflows/ingest-*.yml` | Agente de datos (W1–W4) |
| **Modelos** | `services/models/**`, `packages/engines-reference/**`, `.github/workflows/models-*.yml` | Agente de modelos (W2+) |
| **Auth, billing y crecimiento** | `packages/auth/**`, `packages/billing/**`, `apps/web/app/api/webhooks/**` | Agente de W1 (03 / 28 / 38) |
| **Social** | `packages/social/**` | Agente de W4 (36 / 37) |
| **IA** | `packages/ai/**`, `services/ai-eval/**` | Agente de W5 (24) |

## 2. Owners de sección

Cada sección posee su ruta y su carpeta de features. **Patrón:**

```text
apps/web/app/<ruta de la sección>/**          (ROUTE_MAP.md)
apps/web/src/features/<slug-de-seccion>/**
apps/web/app/api/v1/<recursos de la sección>/** (si los define su ficha)
apps/web/messages/es-MX/<slug-de-seccion>.json
apps/web/e2e/<slug-de-seccion>/**
```

| ID | Slug | Ruta(s) | API propia |
|---|---|---|---|
| 01 | `landing` | `app/(public)/page.tsx` | — |
| 02 | `pricing` | `app/(public)/pricing/**` | — |
| 03 | `auth` | `app/(auth)/**` | (Better Auth vía `packages/auth`) |
| 04 | `onboarding` | `app/app/onboarding/**` | `api/v1/me/onboarding` |
| 05 | `dashboard` | `app/app/page.tsx` | — |
| 06 | `explore` | `app/app/explore/**` | `api/v1/leagues/**` |
| 07 | `sport-hub` | `app/app/[league]/page.tsx`, `app/app/[league]/layout.tsx` | `api/v1/leagues/[league]/games` |
| 08–11b | `sport-config-<sport>` | `packages/contracts/src/sports/<sport>/**` **por PR al owner de contratos** y `apps/web/src/features/sport-hub/config/<sport>.ts` | — |
| 12 | `game-center` | `app/app/[league]/games/**` | `api/v1/games/**` (excepto `odds`) |
| 13 / 14 | `players` | `app/app/[league]/players/**` | `api/v1/players/**` (excepto `props`) |
| 15 | `prop-lab` | `app/app/[league]/props/**` | `api/v1/players/[id]/props/**` |
| 16 | `teams` | `app/app/[league]/teams/**` | `api/v1/teams/**` |
| 17 | `odds` | `app/app/[league]/odds/**` | `api/v1/games/[id]/odds/**` |
| 20 | `replay` | `app/app/replay/**` | `api/v1/replay/**` |
| 21 | `predictions` | `app/app/predictions/**` | `api/v1/predictions/**` |
| 22 | `models` | `app/app/models/**` | `api/v1/models/**` |
| 23 | `backtest` | `app/app/backtest/**` | `api/v1/backtests/**` |
| 24 | `ai` | `app/app/ai/**`, `apps/web/src/shell/ai-panel/**` (**por PR al owner de W0**) | `api/v1/ai/**` |
| 25 | `my-lab` | `app/app/lab/**` | `api/v1/me/picks/**` (lectura) |
| 26 | `watchlists` | `app/app/watchlists/**` | `api/v1/watchlists/**`, `api/v1/alerts/**` |
| 28 | `account` | `app/app/account/**` | `api/v1/me/**` (excepto onboarding y picks), `api/v1/billing/**` |
| 29–32 | `admin-*` | `app/admin/**` (por subruta) | `api/v1/admin/**` (por subruta) |
| 33 | `search` | `app/app/search/**`, `apps/web/src/shell/command-palette/**` (**por PR al owner de W0**) | `api/v1/search` |
| 34 | `notifications` | `app/app/notifications/**` | `api/v1/notifications/**` |
| 35 | `help-legal` | `app/(public)/help/**`, `app/(public)/metodologia/**`, `app/(public)/legal/**`, `content/**` | — |
| 36 | `public-profile` | `app/(public)/u/**`, `app/(public)/p/**`, `app/api/og/**` | `api/v1/picks/**`, `api/v1/users/**`, `api/v1/follows/**`, `api/v1/reports` |
| 37 | `leaderboards` | `app/(public)/leaderboards/**` | `api/v1/leaderboards` |
| 38 | `growth` | `app/(public)/r/**`, `app/(public)/invite/**` | `api/v1/referrals/**`, `api/v1/invites/**`, `api/v1/me/referral` |

## 3. Reglas

1. Un agente **solo** modifica sus globs. Si necesita un cambio fuera de ellos (un componente, un contrato o una tabla), abre un PR pequeño dirigido al owner o lo pide en su handoff. Nunca lo edita «de paso».
2. **Componentes nuevos:** si son específicos de la sección, van en `src/features/<slug>/components/`. Si se reutilizarían, se proponen al owner de W0.
3. **Migraciones de DB:** solo las hace el owner de Datos. Una sección que necesita una tabla la especifica en su handoff o en un PR al owner.
4. **`messages`:** cada sección tiene su archivo de namespace. Las cadenas compartidas (shell y errores) son del owner de W0.
5. `CODEOWNERS` se genera a partir de este documento (`scripts/gen-codeowners.mjs`, F4) y **CI falla si un PR toca archivos de dos owners** sin la etiqueta `cross-owner` aprobada por arquitectura.
