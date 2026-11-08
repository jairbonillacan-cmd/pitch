# Arquitectura frontend

> **Propósito:** convenciones de `apps/web` y de los paquetes de UI para que todos los agentes construyan igual.
> **Consumidores:** todos los agentes de UI y el revisor de PRs.
> **Fecha:** 2026-11-08 · ADR-002 a ADR-006, ADR-015 y ADR-017. Rutas en `ROUTE_MAP.md`. Contratos en `SHARED_CONTRACTS.md`.

## 1. Estructura de `apps/web`

```text
apps/web/
  app/
    (public)/                 # landing, pricing, help, metodologia, legal, u/[handle], p/[pickId], leaderboards, r/[code], invite/[token]
      layout.tsx              # PublicShell: header de marketing y footer con redes
    (auth)/                   # login, signup, forgot-password, reset-password, verify-email
    app/
      layout.tsx              # AppShell: sidebar, header, nav móvil y panel de IA
      page.tsx                # 05 Dashboard
      [league]/
        layout.tsx            # valida el slug; carga SportConfig y contexto de liga
        page.tsx              # 07 SportHub
        games/[gameId]/page.tsx
        players/…  teams/…  props/page.tsx  odds/page.tsx
      …                       # resto según ROUTE_MAP §3
    admin/                    # AdminShell (rol + 2FA)
    api/v1/…                  # route handlers (BFF)
    api/webhooks/[provider]/route.ts
    api/og/[kind]/[id]/route.tsx
  src/
    features/<seccion>/       # composición por sección: componentes de página, loaders y hooks (owner = agente de la sección)
    server/                   # helpers de servidor: session, requireEntitlement, dataState()
    lib/                      # utilidades de app (nunca de dominio)
  messages/es-MX.json         # next-intl, con namespaces por sección
```

**Regla de ownership:** cada sección vive en `app/<ruta>/` (archivos delgados) y en `src/features/<seccion>/` (la lógica de composición). Los archivos `page.tsx` solo cargan datos y componen.

## 2. Server frente a client

| Tipo | Dónde | Regla |
|---|---|---|
| Carga inicial de datos | Server Components (`page.tsx`, `layout.tsx`) | Llaman a repositorios de `packages/db` vía `src/server`. Nunca hacen `fetch` a su propia `/api`. |
| Interacción (filtros, pestañas, scrubber) | Client Components (`'use client'`) mínimos y hoja | Estado en la URL con `nuqs`. Datos extra con TanStack Query contra `/api/v1`. |
| Mutaciones | Server Actions (formularios simples) o `POST /api/v1/*` (desde clientes complejos) | Validación Zod y `requireEntitlement` siempre en el servidor |
| Streaming | `loading.tsx` con esqueletos del DS y `Suspense` por bloque | Ningún spinner global de pantalla completa |

## 3. Datos hacia la UI: `DataState<T>`

Todo bloque de datos que se muestra recibe un `DataState<T>` (`SHARED_CONTRACTS.md` §3). Los componentes de `packages/ui`, `sports-ui` y `charts` **no** cargan datos: reciben props.

Patrón en una página:

```tsx
// app/app/[league]/games/[gameId]/page.tsx
export default async function Page({ params }: { params: Promise<{ league: string; gameId: string }> }) {
  const { league, gameId } = GamePageParams.parse(await params);   // Zod (contracts)
  const user = await getSessionUser();
  const game = await loadGame(gameId);                             // DataState<GameDTO>
  const odds = await guarded(user, 'odds.current', () => loadOddsSummary(gameId)); // DataState o locked
  return <GameCenter league={league} game={game} odds={odds} />;   // src/features/game-center
}
```

`guarded()` devuelve `{ status: 'locked', requiredPlan }` cuando no hay entitlement, y la UI pinta `LockedPreview`.

## 4. Estado en la URL

- Los parámetros y sus nombres están en `ROUTE_MAP.md` §1. Los parsers se definen **una sola vez** en `packages/contracts/src/url/params.ts` (con nuqs y Zod).
- `href(route, ctx)` (en contracts) construye enlaces internos propagando el `SportContext`. Está prohibido armar URLs con template strings en los componentes.
- Las pestañas usan `?tab=` y se pueden enlazar. Al cambiar de pestaña no se pierden los demás parámetros.

## 5. Componentes

| Capa | Paquete | Contenido | Regla |
|---|---|---|---|
| Primitivas | `packages/ui` | Button, IconButton, Input, Select, Combobox, Tabs, Badge, Card, Dialog, Drawer o BottomSheet, Tooltip, Popover, Toast, Skeleton, EmptyState, ErrorState, LockedPreview, DataTable (TanStack), Pagination, SegmentedControl | Radix por dentro y tokens por fuera. Stories de todos sus estados. |
| Deportivos | `packages/sports-ui` | TeamBadge, LeagueBadge, LeagueSelector, MatchCard, GameHeader, OddsCell, MarketSelector, ProbabilityBar, MarketTable, HitRateIndicator, SampleSizeBadge, ImpliedProbabilityTag, InjuryIndicator, GameLogTable, PredictionCard, ModelStatus, DataFreshnessIndicator, PickCard, ShareButtons | Reciben DTOs de contracts. Sin lógica de datos. |
| Gráficas | `packages/charts` | HitRateBars, DistributionHistogram, TrendChart, LineMovementChart, CalibrationPlot, ComparisonChart y Sparkline | `summary` textual y tabla accesible obligatorios |
| Shells | `apps/web/src/shell/` | PublicShell, AppShell, AdminShell, MobileNav, CommandPalette y AiPanel | Solo los modifica el owner de W0 |

**Antes de crear un componente nuevo** se busca en Storybook. Si un componente de sección resulta reutilizable, se propone (PR al owner del paquete). No se copia.

## 6. Estilo

- Solo clases de Tailwind mapeadas a tokens (`bg-surface-default`, `text-text-secondary`, `rounded-panel`…). Un lint prohíbe los valores arbitrarios de color y los hex.
- Números con `tabular-nums lining-nums` (utilidad `.num`). Formato con helpers de `contracts/format.ts` (`formatPct`, `formatOdds`, `formatDateTime` con `Intl` es-MX).
- Movimiento con los tokens `--time-*` y `--ease-out`. Todo respeta `prefers-reduced-motion`.
- Iconos según ADR-016. Emblemas solo vía `TeamBadge` o `LeagueBadge`.
- Solo modo oscuro en la app (`BRAND_AUDIT.md` B4).

## 7. Responsive

- Breakpoints de la marca: < 768 (4 columnas, margen 16), 768–1199 (8 columnas, margen 24) y ≥ 1200 (12 columnas, margen 32, contenido ≤ 1440).
- **Tablas en móvil:** columnas priorizadas (`priority` en la definición de columna), scroll interno etiquetado y primera columna fija. No se esconden datos esenciales.
- **Filtros en móvil:** BottomSheet con el resumen de los filtros activos visible en la barra.
- **Gráficas:** alto mínimo de 200 px en móvil, eje simplificado y tabla accesible en un disclosure.
- Objetivos táctiles ≥ 44 px (token `--layout-touch`).

## 8. Accesibilidad

WCAG 2.2 AA:

- Foco visible con el anillo Pulso.
- Landmarks (`header`, `nav`, `main`) y un skip link.
- `aria-current` en la navegación y `aria-sort` en las tablas.
- `aria-busy` y `role="status"` en las cargas.
- El color nunca es la única señal (acierto o fallo también con forma o icono).
- axe en Storybook y en E2E.

## 9. Rendimiento

- Las rutas públicas no cargan `charts` ni TanStack Table.
- `next/dynamic` para el panel de IA, las gráficas pesadas y los diálogos grandes.
- Imágenes con `next/image`. Emblemas en SVG, servidos con un path versionado (`r<rev>`).
- Presupuestos de JS en `DEPLOYMENT.md` §5.

## 10. Errores y estados vacíos

- `error.tsx` por segmento con `ErrorState` (mensaje humano, código y reintentar). Los errores van a Sentry.
- `not-found.tsx` con la búsqueda y enlaces útiles.
- Cada lista o tabla define su `EmptyState` con una acción siguiente (por ejemplo, «No hay partidos esta semana · Ver la próxima jornada»).

## 11. Pruebas por capa

| Capa | Herramienta | Mínimo |
|---|---|---|
| Helpers y dominio (`contracts`, `social/metrics`, `billing/can`) | Vitest | Cobertura de ramas de reglas críticas (lock, entitlements, métricas) |
| Componentes | Storybook con interaction tests y axe | Una story por estado más una interacción por control |
| Visual | Playwright screenshots (Storybook y páginas clave) | 4 breakpoints |
| Flujos | Playwright E2E (`USER_JOURNEYS.md`) | Los journeys de la sección |
