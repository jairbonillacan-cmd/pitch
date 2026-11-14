---
status: accepted
date: 2026-11-13
updates:
  - ADR-006
  - ADR-020
  - ADR-023
---

# ADR-035: Arquitectura de rendimiento «Vidrio Falso» (`0 backdrop-filter`), shell persistente (`ClubShellBridge`), contextos divididos y recorte de payload RSC

- **Estado:** Aceptada (`accepted`). Reemplaza en parte a [ADR-020](ADR-020-sistema-visual-liquid-glass-v4-y-aislamiento-de-tokens.md) y [ADR-023](ADR-023-smoked-glass-maestro-ui-physics.md) (física CSS de cristal y orbes) y actualiza [ADR-006](ADR-006-estado-tanstack-query-para-datos-del-servidor-y-la.md).
- **Fecha:** 2026-11-13 (implementada en `UI-PULIDO-2`, `PERF-1` y `LANDING-2`: `apps/web/app/pitchlab-v4.css`, `apps/web/src/client/club-shell-bridge.tsx`, `packages/ui/src/platform/platform-provider.tsx` y `apps/web/src/server/platform-data.ts`).

## Contexto

Las mediciones reales con Playwright sobre el build de producción (`apps/web/scripts/perf.mjs`, escritorio `1440×900` y móvil `390×844` con CPU `4×` más lenta) revelaron que la física óptica original de [ADR-023](ADR-023-smoked-glass-maestro-ui-physics.md) y el transporte completo del dataset en el layout de `/app` degradaban severamente la experiencia:

1. **Colapso de pintado por desenfoques GPU:** las 38 declaraciones `backdrop-filter: blur(...)` combinadas con orbes `filter: blur(44px–92px)` producían cuadros `p95` de **`283 ms`** al desplazar en PC y un LCP móvil de **`7,692 ms`** (`551 ms` de recálculo de estilos durante el scroll).
2. **Re-renderizado masivo en cliente:** un único contexto `usePlatform()` provocaba que agregar una selección al parlay redibujara todas las tarjetas de partido (`552 ms` por clic en PC y `744 ms` en móvil), mientras que desmontar y remontar el encabezado y la barra lateral en cada cambio de ruta llevaba la navegación mediana a `1,268 ms` en PC y `3,109 ms` en móvil.
3. **Sobrecarga de HTML/RSC y JS público:** el layout de `/app` serializaba todos los partidos (incluidos terminados y mercados secundarios, `~1.6 MB`), y las páginas públicas cargaban `<PlatformClientBridge>` completo (`~458 kB` First Load JS).

## Decisión

1. **«Vidrio Falso» refinado y prohibición total de `backdrop-filter` y `filter: blur()`:**
   - Se eliminan y prohíben todas las reglas `backdrop-filter` y `filter: blur()` en `apps/web/app/pitchlab-v4.css`, `globals.css` y vistas nuevas.
   - Las superficies `.glass-lens` y `.glass-card` simulan refracción mediante fondos translúcidos ligeramente más densos con `color-mix(in oklab, ...)`, luz interior superior, bisel perimetral único `.glass-ring` y barras fijas casi opacas; las auras y `<LensGlowOrbs>` usan exclusivamente degradados radiales `closest-side` sin filtros de desenfoque.
   - Animaciones continuas (espectro arcoíris, entrada `.pl-page-enter`, barras animadas) se activan solo en `>= 768 px` y bajo `prefers-reduced-motion: no-preference`.
2. **Shell persistente en `/app/layout.tsx` (`ClubShellBridge`):**
   - `ClubShellBridge` monta escenario, encabezado y barra lateral fija una sola vez por sesión de `/app`; los envoltorios internos `AtmosphereStage` / `ClubWorkspaceShell` detectan el shell padre y actúan como *pass-through* sin recrear nodos DOM al navegar, precargando en tiempo ocioso (`requestIdleCallback`) las 4 rutas primarias con `{ kind: "full" }`.
3. **Partición de contextos React y almacén externo del Parlay (`PlatformProvider`):**
   - El estado del club se divide en selectores granulares (`usePlatformCore`, `usePlatformActions` de identidad estable, `useAuraColors`, `useJournalEntries`) más un almacén suscribible por pick (`useIsPickInParlay`), junto con `React.memo` en `MatchTicketCard`/`MultiPickRow` y paginación progresiva con `content-visibility: auto`.
4. **Recorte de payload RSC en `/app` e islas mínimas en rutas públicas:**
   - `/app/layout.tsx` envía solo partidos próximos sin detalle pesado (`upcomingOnly` + `withoutGameDetail`, bajando el HTML transferido a `639 KB`, con caché en memoria de servidor de `5 min`); Resultados, ligas y fichas de partido cargan bajo demanda (`loadFinishedGames`, `loadGameDetail`) e inyectan con `PlatformGamesSupplement`.
   - Las páginas públicas (`/`, `/como-funciona`, `/motores`, `/resultados`, `/parlays`, `/comunidad`, `/precio` y `/pricing/referral`) se sirven como **Server Components puros** con islas cliente puntuales (`LandingClientIslands.tsx`), sin montar `<PlatformClientBridge>` (`159–170 kB` First Load JS).
5. **Empaquetador de producción:** tras medir Next.js 15.5 sin caché persistente de Turbopack en disco, se mantiene **Webpack** con imports relativos limpios (sin extensión `.js` forzada en paquetes consumidos por la web).

## Qué reemplaza y actualiza

- **ADR-020 y ADR-023 (§1 y §2):** reemplaza el uso de `backdrop-filter: blur(...)` y `filter: blur(...)` por «vidrio falso» con `color-mix` y degradados `closest-side`; conserva intactos el lienzo obsidiana/alabastro, `.glass-ring`, `TopLayerModalDialog`, `MaestroPrimitives` y la regla Cero-Hex AA.
- **ADR-006:** en lugar de TanStack Query para datos de partidos, la carga usa RSC recortado + suplementos de servidor y contextos divididos + URL (`?tab=`, segmentos) para el estado de navegación.

## Alternativas descartadas

- **Mantener `backdrop-filter` solo en escritorio o en menos elementos:** incluso acotado degradaba los tiempos de cuadro sobre fondos con múltiples gradientes y complicaba la paridad visual entre dispositivos.
- **Hidratar todo el catálogo de partidos y mercados en el layout raíz:** penaliza cada recarga inicial en redes móviles mexicanas.

## Consecuencias

- El cuadro `p95` al desplazar cayó de **`283 ms` a `16.8 ms`** en PC (`0 %` cuadros lentos) y de **`83 ms` a `16.8 ms`** en móvil CPU `4×`, reduciendo la navegación mediana de `1,268 ms → 233 ms` (PC) y `3,109 ms → 1,188 ms` (móvil).
- Queda pendiente en rutas `/login` y `/signup` afinar las importaciones de raíz de `@pitchlab/ui` y diferir modales pesados en `/app` para seguir reduciendo el First Load JS móvil.
