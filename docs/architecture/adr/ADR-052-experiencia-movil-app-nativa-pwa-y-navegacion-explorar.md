# ADR-052 · Experiencia Mobile-First tipo App Nativa, PWA y navegación `Explorar`

- **Estado:** Aceptada
- **Fecha:** 2026-11-20
- **Rama origen:** `gemini-dos`
- **Relacionadas:** [ADR-041](ADR-041-bzzoiro-fase1-mlb-standings-us-perfiles-y-pwa.md), [ADR-044](ADR-044-rediseno-mobile-first-insignias-preferencias-tablas-y-admin.md), [ADR-046](ADR-046-cancha-tactica-player-props-calibracion-parlay-movil-y-stories.md), [ADR-051](ADR-051-arquitectura-server-first-css-modular-y-cero-jank.md)

## 1. Contexto

PitchLab se utiliza prioritariamente desde teléfonos móviles (`320 px` a `430 px`) y tabletas (`768 px`), además de escritorio (`1440 px`). La auditoría en vivo (`RESPONSIVE-APP-PERF-2026-11-20`) detectó fricciones que delataban una web tradicional en lugar de una aplicación nativa:

1. Faltaba soporte edge-to-edge (`viewport-fit=cover`) y sincronización dinámica de `<meta name="theme-color">` al alternar entre tema oscuro y claro.
2. En móvil compacto (`320×568`), el botón de búsqueda y la campana del encabezado colisionaban, y los filtros de estado en `/app` recortaban `Filtros` / `Próximo`.
3. Las barras flotantes de preview (`.role-sim-pill` y `.pl-quick-jump-bar`) invadían contenido interactivo en móvil y tableta (`< 1024 px`).
4. Las hojas móviles mostraban detalles no nativos: «Más del Club» abría como modal centrado con etiquetas truncadas, doble scrollbar y sin cierre fiable con `Escape`; el menú de perfil mostraba un canal lateral derecho sin botón visible `×`; el boleto de parlay dejaba «Limpiar» huérfano en una segunda fila.
5. El copy de navegación mantenía referencias visibles a «del Club» (`Más del Club`, `Vistas y Herramientas del Club`, `Menú del Club PitchLab`, `Navegación móvil del Club`), cuando la identidad de producto prioriza una navegación limpia y directa de app deportiva.

## 2. Decisión

Se estandariza la experiencia **Mobile-First tipo App Nativa** y la nomenclatura **`Explorar`** en toda la interfaz:

### 2.1 Integración nativa con el dispositivo y PWA
- **Viewport y barra de estado:** `viewportFit: "cover"` en `apps/web/app/layout.tsx` y `<meta name="theme-color">` estático en `<head>` actualizado in-place por `THEME_INIT_SCRIPT`, `ThemeToggle` y `ShellChrome.applyTheme()` (`#000000` oscuro / `#FFFFFF` claro) sin mutar nodos antes de la hidratación.
- **Unidades y áreas seguras:** `100dvh` (con respaldo `100vh`), `env(safe-area-inset-*)` en encabezado, barra inferior (`.mobile-dock`), toasts (`.pl-toast-viewport`) y hojas inferiores; `scroll-padding-top` y `scroll-padding-bottom` para cumplir WCAG 2.4.11.
- **Sensación táctil:** `-webkit-tap-highlight-color: transparent`, `touch-action: manipulation`, feedback `:active` con `scale(0.97)` (bajo `prefers-reduced-motion: no-preference`), `user-select: none` en cromos de navegación, carruseles horizontales con `scroll-snap-type: x proximity` sin scrollbar nativo (`.pl-scroll-strip-clean`) e indicador superior `.pl-route-progress` durante transiciones de ruta (`useTransition`).
- **PWA y caché estático:** `apps/web/app/manifest.ts` con `orientation: "any"` y 4 accesos rápidos (`Partidos de hoy`, `Armar parlay`, `Buscar picks`, `Mi récord`); `apps/web/public/sw.js` con estrategia `CacheFirst` acotada (`pitchlab-static-v2`, máx. 150 entradas) únicamente para activos estáticos en producción remota (`/_next/static/`, `/fonts/`, `/brand/`, `/icons/`, `/icons-dark/`), sin interceptar HTML ni `/api/*`, y con desregistro/purga automática de `pitchlab-static-*` en `localhost`/`127.0.0.1` (`pwa-runtime.tsx` + `sw.js`) para evitar chunks obsoletos en `next dev`.

### 2.2 Ergonomía multi-dispositivo (`320 px` · `375 px` · `768 px` · `1440 px`)
- **Objetivos táctiles WCAG 2.5.5:** mínimo `44×44 px` en controles táctiles (`@media (max-width: 767px), (pointer: coarse)` y tableta `768 px` en controles clave como `/app/comparar`, `/app/props`, cabecera, perfil de equipo y enlaces de navegación).
- **Móvil compacto (`320×568`):** buscador reducido a botón icono `44×44 px` (`.pl-header-search-short` oculto en `<= 400 px`) y logo ajustado para cero solapes.
- **Inicio (`/app`) compacto:** filtros de estado en fila 1 y `Filtros` + interruptor `Momios` compartiendo fila 2 (`display: contents` en `.pl-home-board-pills` en `< 640 px`), recuperando ~48 px visibles arriba del pliegue.
- **Hojas inferiores nativas:**
  - *Menú de tu cuenta* a ancho completo (`inset: auto 0 0 0; width: 100%; border-inline: 0`), tirador superior centrado, botón `×` de `44×44 px` y selector de `Rol` integrado solo en móvil cuando `allowRoleSimulation` está activo.
  - *Hoja `Explorar`* (`dialog.pl-native-dialog.pl-more-sheet-dialog`) anclada abajo en `< 768 px` con animación deslizante, scrollbar único (`overflow: hidden` en `<dialog>`), etiquetas cortas sin truncar (`Player Props`, `Momios`, `Comparar H2H`) y cierre garantizado con `Escape`.
  - *Boleto móvil* (`MobileParlaySheet`) con grid de 2 filas (`Guardar en Mi récord` arriba a lo ancho; `Abrir Parlays` + `Limpiar` abajo).
- **Tableta (`640 px–1023 px`) y Escritorio (`>= 1024 px`):** `.mobile-dock` flotante centrado de `520 px` en tableta estilo iPadOS; `.role-sim-pill` y `.pl-quick-jump-bar` ocultos en `< 1024 px` (`hidden lg:inline-flex`) y anclados en esquinas opuestas (`left: 16px` / `right: 16px`) en escritorio.
- **Correcciones funcionales ligadas a UX móvil:** pestañas de partido (`Resumen`, `Análisis IA`, `Números`) visibles en `375 px` sin recorte; `0` errores por llaves duplicadas en `MatchNumbersPanel` / `MatchMoneyPanel`; localización española completa de lesiones (`red_card_suspension` → `Suspensión por roja`); paginación progresiva en `/app/props` (`8,821 → 1,392` nodos DOM, `−84.2 %`).

### 2.3 Retirada del copy visible «del Club» y renombrado a `Explorar`
- La hoja inferior activada desde `Más` pasa de `Más del Club` a **`Explorar`** (`#mobile-more-dialog-title` en `ShellChrome.tsx`).
- La sección de navegación en la paleta `Cmd/Ctrl+K` pasa de `Vistas y Herramientas del Club` a **`Explorar PitchLab`** (`PlatformOverlays.tsx`).
- Se limpian etiquetas visibles y `aria-label` con «del Club» hacia lenguaje directo de aplicación (`Menú de PitchLab`, `Expandir menú`, `Navegación móvil`, `Muro de comunidad`, `Ver en PitchLab`, `Boleto público verificado de PitchLab`) y se actualizan pruebas E2E asociadas (`apps/web/e2e/mobile-web-fluidity.spec.ts`).

## 3. Consecuencias

- **Positivas:** paridad de ergonomía y estética nativa desde `320 px` hasta `1440 px` en oscuro y claro, cero colisiones de controles flotantes, cero errores de consola en fichas de partido y lenguaje de navegación más claro para nuevos usuarios.
- **Regla hacia adelante:** toda nueva pantalla o hoja interactiva debe validarse visualmente en `320×568`, `375×812`, `768×1024` y `1440×900` (oscuro y claro) antes de darse por terminada, evitando copy con «del Club» en controles visibles de navegación.
