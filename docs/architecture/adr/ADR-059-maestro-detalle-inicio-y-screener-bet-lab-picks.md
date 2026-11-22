# ADR-059 · Maestro-Detalle en Inicio (`/app`) y Screener + Bet Lab Interactivo en Picks (`/app/picks`)

- **Estado:** Aceptada
- **Fecha:** 2026-11-21
- **Rama origen:** `gemini-dos`
- **Relacionadas:** `ADR-051` (Server-First, CSS modular y presupuesto `DOM < 1,500`), `ADR-053` (Shell RSC progresivo `<= 480 KB`), `ADR-054` (Diseño plano editorial y evidencia verificable), `ADR-055` (Catálogo de `34` familias, Bzzoiro Unlimited y `Cero-Fuga`), `ADR-056` (*Constraint-First* y `pstack`), `ADR-057` (`api-guards.ts` y watermarking `X-PitchLab-Trace`), `ADR-058` (`LeagueCapabilityContract`, `.pl-sf-*` y `ZONA PROTEGIDA`).

---

## Contexto

Tras concluir el Plan Maestro (Olas 0A–5, `513374cf`), dos superficies críticas del flujo diario seguían presentando fricción de lectura y presupuesto DOM excesivo:

1. **Exploración fragmentada y sobrepeso DOM en `/app` (Inicio):** el listado de tarjetas obligaba a abrir una página completa por cada partido para revisar mercados, probabilidades, bajas o forma reciente en escritorio, y el árbol inicial (`1,803` nodos en `1440×900` y `1,805` en `375×812`) excedía el techo de `1,500` nodos DOM. Evolucionar `P1 · /app` exigía autorización explícita del fundador (otorgada el `2026-11-21`), preservando intactas `P2` (Ficha de Partido) y `P3` (Páginas de Equipo) dentro de `ZONA PROTEGIDA` y sin inflar el shell RSC (`<= 480 KB`).
2. **Primer pick por debajo del pliegue y ausencia de auditoría interactiva en `/app/picks` (`R2`):** el panel superior horizontal de filtros (`1,384 × 391 px`) empujaba el primer pick hasta `y = 901 px` (`0` filas visibles arriba del pliegue en `1440×900`). Faltaba además un bloque curado (*Pick del día*) libre de cuotas triviales (`< 1.25`), separación clara entre picks próximos, en vivo y liquidados `FT`, y un laboratorio interactivo de evidencia real (`L5`/`L10`/`L20`/Local-Visita/`H2H`) consultable en un clic sin salir del screener.

---

## Decisión

### 1. Evolución autorizada de `P1 · /app` a Maestro-Detalle en escritorio (`>= 1024 px`) y navegación directa en móvil (`< 1024 px`)

- **Escritorio (`>= 1024 px`):** `/app` adopta un patrón split-view **Maestro-Detalle** (`~40 %` / `~60 %`, `554 px + 810 px` en `1440×900`, `apps/web/app/shell-ergonomics.css`):
  - **Panel maestro (izquierda):** cartelera densa (`HomeClubView.tsx`, `AstroMatchRow.tsx` con mini-barras de forma, `HomeFilterBar.tsx` y bloque `Recomendados para ti`).
  - **Panel detalle sticky (derecha):** `HomeMatchDetailPanel.tsx` hidratado bajo demanda, con CTA destacado ***Ver partido completo*** (`[data-home-detail-full-cta]`) hacia `/app/[league]/g/[gameSlug]`, pestañas filtradas por `LeagueCapabilityContract` (cero módulos vacíos) y conmutador inmediato hacia ***Tu parlay / Parlay del día*** (`HomeRightRail.tsx`, `HomeParlayHubCard.tsx`, `OfficialDailyParlayCard.tsx`).
- **Móvil (`< 1024 px`):** prohibido el split-view; `[data-home-detail-pane]` permanece oculto sin disparar peticiones de vista previa (`0` fetches a `/api/games/*/preview`) y tocar cualquier partido navega directamente a pantalla completa hacia `/app/[league]/g/[gameSlug]`.
- **Preservación estricta de `ZONA PROTEGIDA`:** `P2 · Ficha de Partido` (`/app/[league]/g/[gameSlug]`) y `P3 · Páginas de Equipo` (`/app/[league]/t/[teamSlug]`) permanecen **100 % intocables** en su estructura troncal (`docs/design/FEATURE_MAP.md`).

### 2. Rediseño estructural de `/app/picks` (`R2`): 3 pestañas, *Pick del día*, tabla 4 columnas + rail colapsable y Bet Lab interactivo

- **Tres pestañas de ciclo de vida (`packages/ui/src/platform/club/PicksFinderView.tsx`):**
  1. `Recomendados / Próximos` (`upcoming`): ordenados por scoring honesto de Spacetime v5.1 (`scoreRecommendedCatalogPick`), **excluyendo cuotas triviales `< 1.25` por defecto** (`includeTrivial=false`).
  2. `Activos / En vivo` (`live`): integra progreso en tiempo real mediante `<LivePickProgressBar />`.
  3. `Liquidados FT` (`settled`): mantiene trazabilidad auditable al `100 %` sin ocultar jamás picks finalizados (`ADR-055`).
- **Bloque *Pick del día* compacto (`85 px`):** derivado por `selectPicksOfTheDay` en rango de cuotas útiles (`1.45–2.80`), respetando el formato de momios del socio (`oddsFormat`).
- **Tabla agrupada de 4 columnas + rail derecho colapsable (`apps/web/app/picks-screener.css`):** diseño `~74 % / ~26 %` en escritorio (`356 px` de rail sticky derecho para filtros; hoja inferior `100dvh` con `useSheetSwipeDismiss` en móvil) que eleva el primer pick visible arriba del pliegue (`y = 302 px`, `4` filas visibles en `1440×900`).
- **Bet Lab interactivo (`packages/ui/src/platform/club/picks/PickEvidenceLabDrawer.tsx` + `PickEvidenceLabDrawer.stories.tsx`):** cajón lateral/modal con series históricas reales en orden cronológico ascendente (`L5`/`L10`/`L20`/Local-Visita/`H2H`, `barsFor`/`barsAgainst`, `recentHistory` y `relatedPicks`), separando estrictamente la frecuencia empírica observada de la probabilidad calibrada Spacetime v5.1 y del `EV+`, sin recorte en `L10` (`10/10` barras visibles) y contraste `> 12:1` AA en tema oscuro y claro.

### 3. Tres nuevos endpoints autenticados bajo demanda (`withSessionRead`, `Cero-Fuga`, `86 → 89` rutas API)

Para preservar el techo del shell RSC (`<= 480 KB`) y la carga inicial de `/app/picks` (`<= 180 KB`) sin exponer datos reservados a visitantes, todo el detalle bajo demanda se sirve mediante tres endpoints en `apps/web/app/api/` envueltos en `withSessionRead` (`allowBetaPin: true`, `watermark: true`, `Cache-Control: private, no-store`, validación `SAFE_ID_RE` y redacción `Cero-Fuga` según `access.fullAccess`):

1. **`GET /api/games/[gameId]/preview`** (`loadGamePreviewPayload`): entrega `detail`, `standings` e `injuries` para `HomeMatchDetailPanel` (`resourceKey` por `gameId`, `limit: 60/min`, `404` si inexistente).
2. **`GET /api/picks/screener`** (`loadScreenerApiPage`): paginación acotada (`limit <= 40`, default `16`) de picks recomendados y `picksOfTheDay` con filtros (`sport`, `league`, `gameId`, `onlyRecommended`, `includeTrivial`, `q`).
3. **`GET /api/picks/lab/[pickId]`** (`loadPickEvidenceLabData`): entrega las series históricas reales (`barsFor`/`barsAgainst`), `recentHistory` y `relatedPicks` para `PickEvidenceLabDrawer` (`resourceKey` por `pickId`, `404` si el pick no existe o queda bloqueado por `Cero-Fuga`).

---

## Alternativas descartadas

1. **Incrustar los detalles de todos los partidos y las series históricas de picks en el payload RSC inicial de `/app` y `/app/picks`:** descartado porque rompería los límites duros de `<= 480 KB` del shell (`ADR-053`/`ADR-055`) y `<= 180 KB` en `/app/picks`, penalizando TTFB e hidratación en móvil.
2. **Habilitar Maestro-Detalle también en móvil (`< 1024 px`) o refactorizar `P2`/`P3` para fusionarlas con el screener:** descartado por ergonomía táctil nativa (`ADR-052`) y para honrar la frontera `ZONA PROTEGIDA` de `P2` y `P3` (`ADR-058`).
3. **Mezclar frecuencia histórica `L10` con probabilidad del modelo en un único porcentaje o permitir cuotas `< 1.25` en el ranking por defecto:** descartado porque induce sesgo de sobreconfianza y rellena la parte superior de `/app/picks` con favoritos triviales sin valor real.

---

## Consecuencias

- **Positivas:** `/app` ofrece inspección inmediata en escritorio sin abandonar la jornada y reduce su DOM inicial por debajo de `1,500` nodos en escritorio y móvil; `/app/picks` coloca `4` picks arriba del pliegue (`y = 302 px`), integra *Pick del día*, progreso en vivo y auditoría histórica interactiva (`PickEvidenceLabDrawer`) con evidencia real verificable; `P2` y `P3` permanecen intactas al `100 %`.
- **Compromisos:** toda evolución en `HomeMatchDetailPanel` o `PickEvidenceLabDrawer` debe mantener la carga diferida vía sus endpoints `withSessionRead`, preservar `0` fetches `/api/games/*/preview` en `< 1024 px`, respetar `LeagueCapabilityContract` y conservar la separación entre evidencia empírica y probabilidad calibrada.

---

## Validación y métricas BEFORE → AFTER verificadas (cierre Ola 6 · `9e7086fa`)

| Superficie / Dimensión | BEFORE | AFTER (`9e7086fa`) | Estado |
|---|---|---|---|
| **`/app` `1440×900`** | Grid sin detalle embebido · DOM `1,803` (`> 1,500`) · `0 px` overflow | Maestro-Detalle **`554 px + 810 px`** · DOM **`1,803 → 1,376` (`-427`, `< 1,500`)** · `0 px` overflow · `0` errores | **PASS** |
| **`/app` `375×812`** | DOM `1,805` · `0` botones `< 44 px` · `0` inputs `< 16 px` | `[data-home-detail-pane]` oculto (**`0` fetches `/api/games/*/preview`**) · DOM **`1,805 → 1,365`** · `0` botones `< 44 px` · `0` inputs `< 16 px` | **PASS** |
| **`/app/picks` `1440×900`** | Sin POTD · filtros horizontales `1,384 × 391 px` · 1er pick **`y = 901 px`** (`0` above-fold) | POTD compacto **`85 px`** · 1er pick **`y = 901 → 302 px` (`-599 px`, `4` above-fold)** · rail derecho **`356 px`** | **PASS** |
| **Bet Lab (`PickEvidenceLabDrawer`)** | N/A *(nuevo en Ola 6)* | **`10/10` barras `L10` sin recorte** · valores **`> 12:1` AA** dark/light · botón `X` **`44×44 px`** · `0 px` overflow | **PASS** |
| **Auditoría `pstack` (3 ejes), `FD-16` y Zona Protegida** | Pendiente | **`0 CRÍTICO / 0 ALTO / 0 MEDIO`** · `0` `FD-16` visible · **`P2`/`P3` 100 % intactas** | **PASS** |

- **Batería secuencial de cierre Ola 6 (`9e7086fa`):** `node scripts/lint-codebase.mjs` (`809` archivos / `0` violaciones, *ratchet* `7,762`, `-301`), `pnpm -r typecheck` (`11/11` PASS), `pnpm -r test` (`11/11` paquetes PASS, `1,917` pruebas), `pnpm build` PASS (`First Load JS shared: 103 kB`), `pnpm build-storybook` PASS (`4,498` módulos) y `pnpm e2e` (`71` passed | `0` failed | `1` skipped por diseño).
