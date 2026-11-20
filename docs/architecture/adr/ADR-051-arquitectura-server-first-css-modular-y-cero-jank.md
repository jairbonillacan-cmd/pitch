# ADR-051 · Arquitectura *Server-First*, CSS modular por ruta, carga diferida y gobernanza cero-jank

- **Estado:** Aceptada
- **Fecha:** 2026-11-20
- **Rama origen:** `gemini-dos`
- **Relacionadas:** [ADR-035](ADR-035-vidrio-falso-cero-blur-shell-persistente-y-recorte-rsc.md), [ADR-040](ADR-040-bordes-planos-iconos-tematicos-webp-y-microinteracciones.md), [ADR-047](ADR-047-indice-precompilado-shell-sincronizacion-preferencias-y-salida-produccion.md), [ADR-050](ADR-050-arquitectura-agnostica-de-proveedor-y-portabilidad.md), [ADR-052](ADR-052-experiencia-movil-app-nativa-pwa-y-navegacion-explorar.md)

## 1. Contexto y problema

Tras completar la expansión a 57 ligas, Spacetime Suite v5.1 y la auditoría responsive multi-dispositivo (`RESPONSIVE-APP-PERF-2026-11-20`), la medición directa sobre `apps/web` y `packages/ui` reveló cuatro fuentes estructurales de peso muerto y *jank* en móvil y escritorio:

1. **CSS global inflado (`1,107.1 KB` raw / `170.2 KB` gzip):**
   - `heroui-components.css` importaba los 81 estilos de `@heroui/styles/components/*` (`276.7 KB`), pese a que producción solo usa 10 componentes (`Button`, `Drawer`, `Input`, `Label`, `ListBox`, `Modal`, `Select`, `Switch`, `TextArea`, `TextField`).
   - 11 hojas específicas de ruta (`blog.css`, `login-motion.css`, `precio-motion.css`, `data-health.css`, `account-v2.css`, `record-v2.css`, `community-v2.css`, `community-social.css`, `live.css`, `pre-match.css`, `sport-outlook.css` = `212.6 KB`) se cargaban globalmente en `globals.css`.
   - Bloques legados D1 exclusivos de Storybook (`~54.2 KB`) seguían dentro de `globals.css` y bloques retirados (`.pl-feed-*`, `.pl-profile-cover`, `.pl-gift-card*`) seguían dentro de `pitchlab-v4.css`.
2. **Acoplamiento de barrels y fugas de JS cliente hacia rutas de lectura:**
   - `/blog/*` y `/legal/*` importaban `PublicSiteShell` desde `PublicSiteSections.tsx` (`2,870` líneas), arrastrando `LandingClientIslands` (`2,218` líneas), `ReferralCard3D` (WebGL), `CalibrationHonestyLab` y el mapa completo de `@pitchlab/sports-assets` (`113 KB`) solo para renderizar el logo y la barra pública.
   - 28 archivos en `apps/web/` importaban todavía desde los barrels `@pitchlab/ui` o `@pitchlab/ui/platform`, y `packages/ui/src/index.ts` re-exportaba `./astryx` (`@astryxdesign/core`), que solo se usa en Storybook.
3. **Tirones (*jank*) en scroll e interacción:**
   - Quedaban 14 declaraciones `backdrop-filter` / `-webkit-backdrop-filter` en `pitchlab-v4.css` y 27 transiciones animando `box-shadow` en CPU/repaint.
   - 60 componentes seguían suscritos al contexto monolítico `usePlatform()`, provocando re-renders en cascada al tocar Parlay, Comunidad o toasts.
   - Modales cerrados del shell (`CommandPaletteModal`, `ShareTicketModal`, `PickComposerModal`, `BetaPinModal`, `LeagueCategorySheet`, `MobileParlaySheet`) y pestañas inactivas de ficha de partido (`Análisis IA`, `Números`, `¿Dónde está el dinero?`, `Contexto`) se montaban de forma anticipada.
4. **Payload RSC compartido y activos sin optimizar:**
   - El shell compartido aún serializaba `parlayCandidates` a 5 días (`624.3 KB`), `rationale` y `spacetime`/`confidenceDetail` redundantes en `picks`, y `apps/web/public/brand/referral-card-front.png` pesaba `425.7 KB`.

## 2. Decisión

Se adopta y formaliza como estándar permanente de PitchLab la arquitectura ***Server-First* (mentalidad HTMX sin instalar HTMX) + Islas Cliente acotadas**:

### 2.1 Patrón *Server-First* (0 JS cliente en lectura) + Islas Cliente
- **Servidor (React Server Components, 0 JS cliente):** las páginas públicas (`/`, `/precio`, `/resultados`, `/motores`, `/blog`, `/blog/[slug]`, `/blog/categoria/[categoria]`, `/legal/*`) y las secciones de lectura/metadatos/cálculos de Spacetime se ejecutan 100 % en servidor.
  - `BrandLogo` vive en un módulo compatible con RSC (`packages/ui/src/brand-logo.tsx`, sin `"use client"`) apoyado en el subpath liviano `@pitchlab/sports-assets/brand` (`0.5 KB`, con `"sideEffects": false` y cero mapas de clubes).
  - `PublicSiteShell` y `ClosingCtaSection` viven en `packages/ui/src/platform/public/PublicSiteShell.tsx` (RSC puro) y montan únicamente la isla cliente liviana `PublicNavBarClient.tsx` (`~150` líneas), aislando completamente `/blog/*` y `/legal/*` de gráficas, WebGL 3D y emblemas.
- **Islas Cliente (`"use client"`):** reservadas exclusivamente para interacción táctil tipo app (armador de parlays, filtros instantáneos, hojas inferiores, búsqueda `Cmd/Ctrl+K`, Match Center en vivo, simuladores y gráficas interactivas). Prohibido importar desde barrels `@pitchlab/ui` o `@pitchlab/ui/platform` en `apps/web/`.

### 2.2 CSS modular por ruta y poda permanente
- **`heroui-components.css`:** conserva únicamente los **20** `@import` requeridos por los 10 componentes de producción (`58.9 KB` raw vs. `276.7 KB` previos; `card.css`, `chip.css` y `tabs.css` viven solo en `packages/ui/.storybook/preview.ts`).
- **Aislamiento de Astryx:** `@astryxdesign/core`, `@astryxdesign/theme-neutral` y `@stylexjs/stylex` salen por completo de `apps/web/package.json` y de `packages/ui/src/index.ts`, moviéndose a `devDependencies` de `packages/ui` exclusivamente para `libraries.stories.tsx` en Storybook. *(Si en una fase futura se retira Astryx de Storybook, basta borrar `packages/ui/src/astryx.tsx`, `astryx-pitchlab.css` y esas 3 `devDependencies`.)*
- **División de 11 hojas por ruta (`212.6 KB` fuera de `globals.css`):** cada hoja envuelta en `@layer components { ... }` e importada únicamente en su `layout.tsx` o `page.tsx` (`blog.css`, `login-motion.css`, `precio-motion.css`, `data-health.css`, `account-v2.css`, `record-v2.css`, `community-v2.css`, `community-social.css`, `live.css`, `pre-match.css`, `sport-outlook.css`), conservando todas en `packages/ui/.storybook/preview.ts`.
- **D1 legado de Storybook:** extraído a `apps/web/app/legacy-d1-storybook.css` (`54.2 KB`, importado solo en `preview.ts`), dejando `globals.css` en `57.9 KB`.

### 2.3 Gobernanza Cero-Jank, contextos divididos y carga diferida
- **Cero `backdrop-filter` y cero `box-shadow` animado:** `14 → 0` declaraciones `backdrop-filter` y `27 → 0` transiciones sobre `box-shadow` en CSS de producción; todas las transiciones animan solo `transform`, `opacity`, `border-color`, `background-color` o `color`.
- **`content-visibility: auto` + `contain-intrinsic-size` (con respaldo `@supports not { contain: layout style paint; }`):** aplicado estrictamente debajo del primer pliegue en bloques de liga (`n+3`), props (`n+5`), filas de picks (`n+9`), secciones de mercados (`n+3`), tarjetas de conteos (`n+4`), tarjetas de récord (`n+3`) y publicaciones de comunidad (`n+5:not(:focus-within)` para no recortar menús abiertos).
- **Contextos divididos + `React.memo`:** añadidos `ParlayStateContext`, `SocialStateContext`, `OverlayStateContext` y `FollowAlertsContext` en `platform-provider.tsx`; migradas `54` suscripciones de `usePlatform()` a hooks acotados y memorizadas las tarjetas repetitivas (`HomeMatchCard`, `MatchListRow`, `MultiPickRow`, `MatchTicketCard`, `AstroMatchRow`, `MatchMarketsGrid`, `PlayerPropStreakCard`, `SocialPostCard`).
- **Carga diferida (`React.lazy` + montaje condicional):** modales/hojas cerradas del shell (`CommandPaletteModal`, `ShareTicketModal`, `PickComposerModal`, `BetaPinModal`, `LeagueCategorySheet`, `MobileParlaySheet`), pestañas inactivas de ficha de partido (`LiveMatchPanelView`, `CortexAnalysisCard`, `MatchNumbersPanel`, `MatchMoneyPanel`, `MatchContextPanel`), `ReferralCard3D` público y `CalibrationCurveChart` / `CalibrationHonestyLab`.
- **Imágenes, fuentes y payload RSC:** `loading="lazy" decoding="async"` en imágenes fuera del pliegue (reservando `fetchPriority="high"` únicamente al hero LCP), `InterVariable.woff2` verificado con `font-display: swap`, `referral-card-front.png` comprimido `425.7 KB → 71.7 KB` + variante `referral-card-front.webp` (`9.0 KB`), y `withoutGameDetail` refinado (`parlayCandidates` a 48 h / máx. 3, sin `rationale`/`spacetime`/`confidenceDetail` en shell compartido, restaurados por `PlatformGamesSupplement` en fichas) bajando el shell a `1,880.6 KB` (`−61.7 %` desde `4,910.5 KB`).

### 2.4 Limpieza de código muerto y dependencias
- Eliminados archivos sin referencias en código ni pruebas: `apps/web/src/server/model-metrics.ts` y `apps/web/src/client/use-beta-pin.ts`.
- En `apps/web/package.json`: retirados `@astryxdesign/*` y `@stylexjs/stylex`; `drizzle-orm` movido a `devDependencies` (uso exclusivo en 23 archivos de `apps/web/tests/`). En `packages/ui/package.json`: conservados `@internationalized/date` y `react-aria*` por ser `peerDependencies` obligatorias de `@heroui/react`.

## 3. Consecuencias

- **Positivas:** caída de **`−46.6 %`** en CSS global (`1,107.1 KB → 590.9 KB` raw; `170.2 KB → 96.9 KB` gzip), **`0`** barrels en `apps/web/`, **`0`** `backdrop-filter` y **`0`** `box-shadow` animados, rutas públicas de lectura prácticamente sin JS cliente y menor contención del hilo principal en gama media móvil.
- **Compromisos:** al crear nuevas rutas que usen hojas específicas (`account-v2.css`, `record-v2.css`, `community-social.css`, etc.) debe importarse explícitamente la hoja en su `page.tsx`/`layout.tsx`; al habilitar un nuevo componente de HeroUI v3 se añade su `@import` correspondiente en `apps/web/app/heroui-components.css`.
