---
status: accepted
date: 2026-11-10
branch: gemini-reestructura
extends:
  - ADR-003
  - ADR-004
  - ADR-016
  - ADR-019
  - ADR-020
---

# ADR-023: Física Smoked-Glass del Prototipo Maestro, Primitivas Ópticas y Gobernanza Cero-Hex AA

- **Estado:** Aceptada (`Status: accepted`)
- **Fecha:** `2026-11-10`
- **Rama de origen:** `gemini-reestructura`
- **Relación con otras ADRs:** Evoluciona [ADR-020](ADR-020-sistema-visual-liquid-glass-v4-y-aislamiento-de-tokens.md), resuelve operativamente [ADR-016](ADR-016-iconografia-iconos-de-marca-lucide-para-los-generi.md) para las superficies v4.1 y complementa [ADR-024](ADR-024-hybrid-snapshot-spacetime-quant-engine.md) y [ADR-025](ADR-025-zero-leak-subscription-tipstar-referrals.md).
- **Referencia visual canónica:** `design/prototipo-maestro/prototipo-maestro-pitchlab.html`

## Contexto y problema

Durante la primera iteración del sistema *Liquid Glass* v4 ([ADR-020](ADR-020-sistema-visual-liquid-glass-v4-y-aislamiento-de-tokens.md)) se unificaron las superficies públicas y del Club dentro de `.pl-stage`, pero la implementación en código se apartó de la física óptica del **Prototipo Maestro PitchLab** (inspirado en `shows.link` y las Human Interface Guidelines de Apple) en cuatro frentes críticos:

1. **Tarjetas carbón opacas que anulaban la profundidad y la refracción del club:** las superficies principales utilizaban rellenos grises oscuros casi opacos (`rgba(16, 16, 22, 0.78)` a `rgba(13, 18, 34, 0.90)`). Al bloquear el paso de luz desde el lienzo obsidiana (`#000000`), las auras cromáticas de los equipos (`--home-color`, `--away-color`) morían detrás de bloques planos sin refracción real, perdiendo la sensación de lentes suspendidas sobre la atmósfera de estadio.
2. **Colisión de bordes (`1px solid` apilados sobre `.glass-ring`):** al combinar bordes sólidos convencionales (`1px solid var(--pl-border)`) con el bisel especular `.glass-ring` en controles segmentados (`.seg-well`), tarjetas y botones translúcidos (`.pl-btn-glass`), se generaban contornos dobles tipo *wireframe* que ensuciaban la geometría y degradaban el acabado curado tipo Apple.
3. **Fragmentación de micro-primitivas e iconografía:** elementos estructurales repetidos en las 11 vistas maestras —pedestales ópticos de escudos, orbes internos de refracción, fichas de calendario de dos tonos, avatares apilados, filas táctiles de acción, tarjetas de aviso semántico e iconos de trazo uniforme— se resolvían de forma ad hoc o con glifos de texto, dejando inconclusa la estandarización iconográfica planteada en [ADR-016](ADR-016-iconografia-iconos-de-marca-lucide-para-los-generi.md).
4. **Riesgo de regresión en contraste WCAG 2.1 AA sobre cristal real:** al disminuir la opacidad de las lentes a velos blancos del `5.2 %`–`6.8 %` e inyectar orbes radiales con colores vivos de clubes deportivos, cualquier token secundario débil o cualquier literal hexadecimal suelto en componentes podía romper la legibilidad en modo oscuro (`obsidian`) o lavar la jerarquía al conmutar a modo claro (`alabaster`).

## Decisión

Adoptamos en `packages/tokens`, `apps/web/app/pitchlab-v4.css` y `packages/ui/src/platform/` la arquitectura **Smoked-Glass Maestro v4.1**, articulada en siete contratos técnicos inquebrantables:

### 1. Física real de cristal ahumado sobre lienzo obsidiana (`#000000`)

En el tema oscuro por defecto (`:root, :root[data-theme="dark"]`), el escenario `.pl-stage` opera sobre negro absoluto (`--pl-stage-bg: #000000`, `--pl-stage-subtle: #09090B`) y sustituye los rellenos carbón opacos por velos blancos translúcidos con desenfoque de fondo calibrado por jerarquía de elevación:

| Capa óptica | Token / Selector | Valor en Oscuro (`obsidian`) | Desenfoque y sombra | Propósito estructural |
|---|---|---|---|---|
| Escenario atmosférico | `.pl-atmo-canvas` + `.pl-atmo-scrim` | `--pl-atmo-opacity: 0.62`; scrim radial `rgba(0,0,0,0.34)` → `0.72` → `#000000` | `blur(92px) saturate(185%)` | Proyecta las auras local/visitante sin invadir la lectura del texto |
| Lente protagonista | `.glass-lens` (`--pl-glass-lens`) | `rgba(255, 255, 255, 0.068)` | `backdrop-filter: blur(18px)` + `--pl-lens-shadow` | Heroes, Spotlight de Jornada, Match Studio, Boleto Combinado y portales principales |
| Tarjeta estándar | `.glass-card` (`--pl-glass-card`) | `rgba(255, 255, 255, 0.052)` | `backdrop-filter: blur(14px)` + `--pl-card-shadow` | Tarjetas de partido, KPIs, motores de `Spacetime Suite` y módulos secundarios |
| Superficie interactiva | `--pl-surface` / `-hover` / `-active` | `0.055` / `0.095` / `0.14` (blanco `rgba`) | `blur(10px–12px)` en controles | Ranuras de `Multi-Picks`, pozos `.seg-well`, `.glass-action-row` e inputs |
| Cromo persistente | `--pl-glass-nav` / `--pl-glass-rail` / `--pl-glass-pill` | `rgba(4,4,7,0.52)` / `rgba(10,10,13,0.72)` / `rgba(12,12,16,0.82)` | `backdrop-filter: blur(20px–22px)` | Cabecera superior, riel lateral de 4 grupos, carrito de Parlay y barra de 11 vistas |

### 2. Orbes localizados de refracción cromática (`<LensGlowOrbs>`)

Para reproducir la refracción interna del *Prototipo Maestro* sin subir la opacidad global de la atmósfera hasta niveles que comprometan el texto, los contenedores `.glass-lens` destacados (`position: relative; overflow: hidden`) montan `<LensGlowOrbs>` (`.pl-lens-orbs` / `.pl-lens-orb`):

- Dos esferas radiales posicionadas en esquinas opuestas (`top/left: -3.5rem` y `bottom/right: -3.5rem`), `width/height: 16rem` (`13rem` en `subtle`), `filter: blur(44px)`, `pointer-events: none` y opacidad acotada por token (`--pl-orb-opacity: 0.28`, `--pl-orb-opacity-subtle: 0.16` en oscuro; `0.14` / `0.08` en claro).
- En contextos de partido, `--orb-color` recibe en tiempo de ejecución los colores oficiales del club local y visitante vía `getTeamColors(league, slug)` desde `@pitchlab/sports-assets`; en contextos de tecnología o crecimiento usa tokens semánticos de motor (`--engine-tachyon`, `--engine-singularity`, `--engine-minkowski`, `--engine-geodesic`, `--engine-cortex` o `--pl-orb-*`).

### 3. Bisel especular de capa única (`.glass-ring`) sin bordes competidores

Toda lente o control con acabado refractivo utiliza `.glass-ring` (`border: 0`), cuyo pseudo-elemento `::before` pinta un bisel de `1px` (`1.25px` en `.glass-ring--featured`) recortado exclusivamente al perímetro mediante `mask-composite: exclude` (`-webkit-mask-composite: xor`):

- Combina dos destellos radiales en las esquinas superiores (`--pl-ring-corner: rgba(255, 255, 255, 0.62)`; `0.90` en `featured`) con una caída lineal vertical (`--pl-ring-top: 0.34` → `--pl-ring-mid: 0.03` → `--pl-ring-bot: 0.16`).
- Se prohíbe superponer `border: 1px solid` sobre elementos que porten `.glass-ring`. Los selectores `.pl-btn-glass:not(.glass-ring)` y `.seg-well:not(.glass-ring)` aplican `box-shadow: inset 0 0 0 1px ...` únicamente como respaldo cuando el bisel óptico no está presente. Las divisiones internas entre filas usan exclusivamente `.hairline-t` / `.hairline-b` (`1px solid var(--pl-row-rule)`) o perforación de boleto `.ticket-perf` (`1px dashed var(--pl-perf-rule)`).

### 4. Jerarquía editorial de CTAs primarios y de acento

Para lograr máxima claridad de decisión (una sola acción primaria dominante por región):

- **CTA Primario (`.pl-btn-primary`):** blanco puro nítido en modo oscuro (`--pl-btn-primary-bg: #FFFFFF`, `--pl-btn-primary-hover: #E4E4E7`, `--pl-btn-primary-fg: #000000`, contraste `21:1`) e inversión limpia a obsidiana en modo claro (`#09090B` con texto `#FFFFFF`, contraste `19.8:1`).
- **CTA de Acento Marca (`.pl-btn-accent`):** reservado para desbloqueos contextuales (`Cero-Fuga`) o acciones secundarias destacadas, calibrado en `#7C3AED` sobre `#FFFFFF` (`5.7:1` en oscuro) y `#6D28D9` sobre `#FFFFFF` (`7.1:1` en claro).

### 5. Módulo profundo compartido `MaestroPrimitives` (`packages/ui/src/platform/components/MaestroPrimitives.tsx`)

Se centralizan en un único módulo tipado y libre de dependencias externas las ocho primitivas ópticas e interactivas del lenguaje `shows.link` / PitchLab:

1. `MaestroIcon`: catálogo cerrado de **33 glifos vectoriales SVG** (`viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `strokeWidth={1.8}`, `strokeLinecap="round"`, `strokeLinejoin="round"`, `aria-hidden="true"`), eliminando emojis e inconsistencias de grosor en toda la aplicación.
2. `LensGlowOrbs`: motor declarativo de orbes radiales internos (`primaryColor`, `secondaryColor`, `subtle`).
3. `CrestPedestal`: pedestal translúcido con `.glass-ring` (`sm: 36px`, `md: 46px`, `lg: 56px`) y halo radial opcional `--crest-glow` para enmarcar `TeamBadge` y `LeagueBadge`.
4. `CalendarSquare`: ficha `.sq-box` de dos tonos (`44×44 px`, mes en mayúsculas sobre `--pl-surface-hover` + día tabular `.num`).
5. `StackedAvatars`: pila compacta de avatares verificados con solape de `-7px`, corte perimetral `--pl-avatar-ring` y contador `+N` para `Debate de Suscriptores` y `Comunidad VIP`.
6. `NoticeCard`: tarjeta editorial de aviso y síntesis (`tone`: `brand | cortex | success | warning | info`) respaldada por tokens `--pl-pill-*`.
7. `GlassActionRow`: fila accionable (`<a>` o `<button>`) con micro-compresión táctil (`scale(0.992)`), truncado seguro (`min-w-0`) y chevron direccional.
8. `RoleSwitcherPill`: conmutador de 4 roles (`visitor | member | tipstar | admin`) para auditoría y demostración que, cuando `rawDataset.isServerRedactedForVisitor` es verdadero, invoca `submitBetaPin("2026", nextTarget)` para desbloquear la sesión en servidor sin comprometer jamás la frontera `Cero-Fuga` en el SSR inicial de visitantes.

### 6. Modales nativos en Top Layer (`TopLayerModalDialog`) y aislamiento oscuro de boletos

- Todos los overlays (`PickComposerModal`, `ShareTicketModal`, `AlertsDrawer`, `CommandPaletteModal`, `BetaPinModal` y el simulador de vista visitante en `Portal Tipstar`) se montan sobre `<dialog>` nativo abierto mediante `dialog.showModal()`, `closedby="any"` (con respaldo por geometría `getBoundingClientRect()` en `pointerdown`/`pointerup`), fondo `--pl-glass-modal: rgba(12, 12, 16, 0.90)` y contención de desplazamiento pura en CSS (`overscroll-behavior: contain` en `dialog:modal` y `dialog::backdrop`) sin mutar `overflow` en `<body>`.
- Los boletos compartibles 4:5 y 9:16 (`.share-ticket-card`) declaran `color-scheme: only dark` y re-mapean localmente `--pl-*` hacia `--share-card-*`, conservando su estética nocturna de estadio aun cuando el usuario navega en tema claro.

### 7. Gobernanza estricta Cero-Hex en `@pitchlab/tokens` y piso WCAG 2.1 AA

- `packages/tokens/scripts/generate.mjs` es la única fuente autorizada de valores de color (`dist/tokens.css`, `dist/theme.css`, `src/tokens.generated.ts`). El verificador `scripts/lint-codebase.mjs` bloquea cualquier literal hexadecimal (`#...`) en archivos `.ts`, `.tsx`, `.css` y `.mjs` fuera de `packages/tokens`.
- Para blindar la legibilidad sobre cristal translúcido, el texto secundario y atenuado se eleva en oscuro a `#E4E4E7` y `#B0B0BA` (y en claro a `#27272A` y `#52525B`), y todas las etiquetas semánticas utilizan tripletas dedicadas `--pl-pill-{brand|cortex|success|warning|danger|info}-{fg|bg|border}` verificadas con `@axe-core/playwright` (`>= 4.5:1`).

## Alternativas descartadas

1. **Conservar tarjetas carbón semiopacas (`rgba(16, 16, 22, 0.78)`) para simplificar el contraste:** descartada porque destruye la profundidad óptica sobre `#000000` e impide percibir el aura cromática del partido a través del cristal. El contraste AA se resolvió elevando la luminancia de los textos atenuados, acotando `--pl-orb-opacity` y densificando únicamente modales (`0.90`) y cabeceras de tabla (`0.90`).
2. **Implementar biseles con `border-image` o contenedores `<div>` envolventes con `padding: 1px`:** `border-image` no respeta `border-radius` de forma nativa en todos los motores CSS, mientras que envolver cada tarjeta en un `<div>` extra ensucia el DOM y rompe layouts `grid`/`flex`. El pseudo-elemento `.glass-ring::before` con `mask-composite: exclude` logra bisel curvo perfecto sin nodos adicionales.
3. **Aplicar `backdrop-filter: blur(36px+)` sin presupuesto en cada fila de tabla o sub-elemento:** descartada por sobrecarga de composición en GPU (*overdraw* de texturas fuera de pantalla en teléfonos de gama media al hacer scroll sobre listas de 20 mercados o decenas de picks).
4. **Adaptar el modo claro reduciendo simplemente la inversión del modo oscuro (`rgba(0, 0, 0, 0.05)` sobre blanco):** producía superficies grises lavadas sin separación figura-fondo. Se adoptó en su lugar cristal alabastro de alta densidad (`--pl-glass-lens: rgba(255, 255, 255, 0.92)` sobre `--pl-stage-bg: #F4F4F5`) con biseles sutilmente teñidos en iris (`rgba(91, 33, 182, 0.28–0.54)`).
5. **Incorporar un paquete externo masivo de iconos para las vistas del Club:** descartada frente a los 33 trazos curados de `MaestroIcon` (`strokeWidth={1.8}`), que garantizan coherencia óptica absoluta con el Prototipo Maestro y cero impacto en el tamaño del bundle.

## Consecuencias

- **Presupuesto explícito de composición GPU (`backdrop-filter`):** las vistas mantienen fluidez de `60 fps` al restringir `backdrop-filter` a los contenedores estructurales (`.glass-lens` `18px`, `.glass-card` `14px`, navegación/rieles `20px–22px`), evitando desenfoques anidados innecesarios en celdas de tabla, diferiendo secciones bajo el pliegue con `.pl-deferred-section` (`content-visibility: auto`) y desactivando transiciones no esenciales bajo `@media (prefers-reduced-motion: reduce)`.
- **Piso garantizado de contraste sobre auras dinámicas de clubes:** incluso cuando `getTeamColors` inyecta amarillos solares, cianes o magentas intensos en `<LensGlowOrbs>`, la combinación de `--pl-atmo-scrim`, `--pl-orb-opacity <= 0.28` y tokens tipográficos/píldoras calibrados sostiene cumplimiento estricto WCAG 2.1 AA en temas oscuro y claro.
- **Adaptación dual Obsidiana / Alabastro sin duplicar componentes:** las 11 superficies maestras de `packages/ui/src/platform/` consumen exactamente las mismas clases y variables `--pl-*`, conmutando instantáneamente sin parpadeos transitorios gracias al bloqueo efímero `html[data-theme-switching="true"]` y manteniendo intacta la identidad nocturna de los boletos `.share-ticket-card`.
