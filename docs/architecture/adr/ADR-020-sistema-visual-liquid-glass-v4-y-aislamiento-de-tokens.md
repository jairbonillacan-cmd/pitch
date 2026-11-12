# ADR-020: Sistema visual Liquid Glass v4, aislamiento de tokens duales y diálogos nativos Top Layer

- **Estado:** Aceptada (2026-11-10). Modifica ADR-003 y ADR-019.
- **Decisión del fundador:** reconstrucción integral de `apps/web` y `packages/ui` con estética *Liquid Glass* tipo `shows.link`, soporte dual oscuro/claro AA/AAA y cero literales hexadecimales fuera de `@pitchlab/tokens`.

## Contexto

Las superficies v2/v3 de landing, acceso y panel arrastraban ~4,700 líneas de CSS heredado en `@layer legacy` (`apps/web/app/globals.css`), clases genéricas como `.block`, `.league-tab` y `.day-chip` que colisionaban con utilidades de Tailwind v4, y tarjetas oscuras de compartir cuyos textos heredaban tokens claros al alternar a `data-theme="light"`, rompiendo el contraste WCAG AA. Además, las superposiciones modales construidas con `<div role="dialog">` requerían recrear manualmente trampa de foco, tecla `Esc`, bloqueo de scroll y capa superior.

## Decisión

1. **Sistema visual *Liquid Glass* v4 (`apps/web/app/pitchlab-v4.css` + `packages/ui/src/platform/`):**
   - Todas las rutas públicas (`/`, `/tecnologia`, `/pricing`, `/login`, `/signup`, `/onboarding`, `/p/[pickId]`) y las 14 vistas del Club (`/app/**`) corren sobre `AtmosphereStage` (`.pl-stage`), con auras dinámicas sincronizadas por partido (`--home-color`, `--away-color`), lentes translúcidas (`.glass-lens`, `.glass-card`) y biseles ópticos con `mask-composite: exclude` (`.glass-ring`).
   - Se neutralizan explícitamente dentro de `.pl-stage` las colisiones de `@layer legacy` (`.pl-stage .block { padding: 0 }`, `.pl-stage .league-tab:not(.rail-item), .pl-stage .day-chip { width: auto; flex: 0 0 auto }`) para preservar utilidades Tailwind y evitar desborde horizontal en móvil.
2. **Única fuente cromática en `@pitchlab/tokens` (`packages/tokens/scripts/generate.mjs`):**
   - Los temas oscuro (`#000000` obsidian) y claro (`#F4F4F7` alabaster) emiten todas las variables `--pl-*`, `--engine-*`, `--share-card-*` y `--avatar-grad-*` desde `@pitchlab/tokens`. Ningún archivo fuera de `packages/tokens` contiene literales hexadecimales (`node scripts/lint-codebase.mjs`).
   - `ThemeToggle` aplica un atributo efímero `data-theme-switching="true"` con vaciado síncrono de estilos para congelar transiciones CSS durante el cambio de tema, garantizando contraste instantáneo sin estados intermedios ilegibles.
3. **Subárbol de esquema forzado en boletos compartibles (`.share-ticket-card`):**
   - Los boletos 4:5 / 9:16 mantienen estética nocturna de estadio aún cuando la página está en modo claro mediante `color-scheme: only dark`, declarando explícitamente `background: var(--share-card-bg)` y re-especificando las propiedades heredadas (`color`, `caret-color`, `accent-color`) junto con el re-mapeo local de `--text-*`, `--foreground` y `--pl-*` hacia `--share-card-*`.
4. **Diálogos modales en Top Layer nativo (`TopLayerModalDialog`):**
   - Los modales y paneles laterales de `packages/ui/src/platform/` (`PickComposerModal`, `ShareTicketModal`, `AlertsDrawer`, `CommandPaletteModal`, `BetaPinModal` y el menú móvil del Club) usan `<dialog>` nativo abierto con `dialog.showModal()`, sin `role="dialog"` ni `aria-modal` redundantes, con cierre ligero `closedby="any"` (y respaldo por coordenadas `getBoundingClientRect()` en `pointerdown`/`pointerup` donde `closedBy` no existe) y contención pura por CSS (`overscroll-behavior: contain` en `dialog:modal` y `overflow: hidden; overscroll-behavior: contain` en `dialog::backdrop`) sin mutar `overflow` en `<html>` ni `<body>`.
5. **Tablas responsivas y diferimiento bajo el pliegue:**
   - Las tablas cuantitativas se envuelven en regiones desplazables enfocables por teclado (`.pl-table-region` con `tabIndex={0}`, `role="region"`, `container-type: inline-size` y `thead` `sticky`), y las secciones pesadas confirmadas debajo del pliegue inicial usan `.pl-deferred-section` (`content-visibility: auto; contain-intrinsic-size: auto none auto 420px`).

## Alternativas descartadas

- **Conservar las hojas `landing-v2.css`, `app-home.css` y `account-previews.css`:** fragmentaban el diseño entre tres lenguajes visuales incompatibles y duplicaban selectores globales.
- **Bloquear el scroll del documento mutando `body { overflow: hidden }` al abrir modales:** elimina la barra de desplazamiento raíz, provoca saltos de layout horizontal y rompe encabezados `position: sticky`.
- **Heredar colores de página dentro de `.share-ticket-card`:** degradaba la identidad del boleto exportable en modo claro y producía fallos de contraste AA (`1.06:1`).

## Consecuencias

- Un solo árbol de componentes en `packages/ui/src/platform/` alimenta Next.js App Router y Storybook (`platform-v4.stories.tsx`) con paridad visual en oscuro y claro.
- Cero hallazgos en `modern-web-guidance legacy-scan`, cero violaciones `wcag2a`/`wcag2aa` en `@axe-core/playwright` y cero desbordes horizontales de `375px` a `1440px`.
