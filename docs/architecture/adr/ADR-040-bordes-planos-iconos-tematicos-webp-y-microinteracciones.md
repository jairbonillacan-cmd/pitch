---
status: accepted
date: 2026-11-18
extends:
  - ADR-016
  - ADR-020
  - ADR-028
  - ADR-035
---

# ADR-040: Bordes planos por token dedicado (`--pl-card-border`), paquete dual de iconos WebP y micro-interacciones CSS sin `backdrop-filter`

- **Estado:** Aceptada (`accepted` e implementada en `gemini-dos`).
- **Fecha:** 2026-11-18.

## Contexto

Tras consolidar el modo sólido (`ADR-035`) y ampliar las vistas del Club en tema oscuro (`#111114` lienzo → `#000000` tarjetas) y tema claro (`#EDF0F7` lienzo → `#FFFFFF` tarjetas), aparecieron tres problemas visuales y técnicos recurrentes:

1. **Bordes grises pesados y dobles en tarjetas:** reutilizar `--pl-border` (`rgba(15, 23, 42, 0.11)` en claro) en `.glass-ring::before`, junto con `border: 1px solid var(--pl-border)` en hojas como `.pl-team-main-sheet` y la sombra `--pl-lens-shadow`, producía en tema claro un surco gris de `2 px` más oscuro que el lienzo `#EDF0F7` y que la tarjeta `#FFFFFF`.
2. **Legibilidad de iconos rasterizados WebP en modo oscuro:** el paquete editorial en `apps/web/public/icons/` fue optimizado para superficies claras; sobre `#000000` perdía definición, mientras que invertirlo con filtros CSS distorsionaba tonos de marca y banderas.
3. **Transiciones bruscas y corrimiento cromático en mezclas neutras:** avisos (`ToastViewport`), botones de seguimiento (`FollowControl`), pantalla de carga (`LaunchScreen`) e insignias necesitaban micro-interacciones limpias y tooltips contenidos en móvil, además de evitar `color-mix(in oklch, ...)` sobre neutros (bug 565837690 de Chromium que introduce tinte rojizo cuando la croma es nula).

## Decisión

1. **Separación de borde estructural de tarjeta (`--pl-card-border`) y sombra exclusiva de overlays (`--pl-overlay-shadow`):**
   - `packages/tokens/scripts/generate.mjs` define `--pl-card-border` (`rgba(15, 23, 42, 0.035)` en tema claro —valor intermedio entre `#EDF0F7` y `#FFFFFF`, sin surco oscuro— y `rgba(255, 255, 255, 0.065)` en tema oscuro), dejando `--pl-card-shadow: none`, `--pl-lens-shadow: none` y `--shadow-card: none` para tarjetas estáticas.
   - Los controles interactivos (`.glass-input`, `.pl-btn-glass.glass-ring`, `.seg-well`, focus rings) conservan `--pl-border` / `--pl-border-strong` para mantener contraste WCAG 1.4.11, mientras que modales y menús flotantes usan `--pl-overlay-shadow`.
   - Las superficies que combinan `.glass-ring` con clases contenedoras (`.pl-team-main-sheet`, `.pl-tmr`, `.pl-home-card`, `.pl-home-board-bar`) eliminan su `border` redundante para impedir el doble trazo.
   - Las mezclas neutras en CSS adoptan `color-mix(in oklab, ...)` como espacio de interpolación por defecto.
2. **Paquete dual de iconos temáticos WebP (`public/icons/` + `public/icons-dark/`):**
   - `packages/ui/src/pack-icon-theme.ts` (`usePackIconBase`, `resolveThemedPackUrl`, `resolveThemedPackSrcSet`) conmuta automáticamente la ruta de activos WebP según `data-theme`, preservando escudos oficiales en selecciones y banderas circulares únicamente para metadatos de país/jugador.
3. **Micro-interacciones CSS-first con `prefers-reduced-motion` y tooltips contenidos:**
   - Se implementan animaciones nativas en CSS para entrada/salida de `ToastViewport`, despliegue de acciones secundarias en `FollowControl`, `LaunchScreen` minimalista e insignias compactas (`ProfileBadges`) que exponen su criterio en `role="tooltip"` al pasar el cursor o enfocar, sin librerías externas de animación ni `backdrop-filter`.

## Alternativas descartadas

- **Reducir `--pl-border` globalmente a `0.035`:** descartado porque degrada el contraste de bordes en inputs, selectores y botones táctiles por debajo de WCAG AA.
- **Aplicar `filter: invert()` a los iconos WebP en modo oscuro:** descartado porque altera morados de marca, banderas y colores semánticos.
- **Adoptar una librería de animaciones en JS (Framer Motion / Lottie):** descartado por peso de bundle innecesario frente a transiciones CSS nativas compatibles con `ADR-035`.

## Consecuencias

- Todas las tarjetas del Club y páginas públicas muestran una transición limpia y uniforme entre lienzo y superficie en modo claro y oscuro, sin halos grises ni bordes duplicados.
- Todo icono nuevo añadido a `apps/web/public/icons/` debe incluir su variante equivalente en `apps/web/public/icons-dark/` para mantener paridad temática.
- Las pruebas automatizadas de `scripts/lint-codebase.mjs` garantizan cero literales hexadecimales fuera de `packages/tokens/`.
