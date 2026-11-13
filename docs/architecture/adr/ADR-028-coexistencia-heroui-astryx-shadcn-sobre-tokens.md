---
status: accepted
date: 2026-11-13
extends:
  - ADR-003
  - ADR-019
---

# ADR-028: Coexistencia de HeroUI v3 (gratis), Astryx y shadcn/ui mediante cascada `@layer` y `<AstryxScope>` sobre `@pitchlab/tokens`

- **Estado:** Aceptada (`accepted`). Extiende y actualiza [ADR-003](ADR-003-estilos-tailwind-css-v4-generado-desde-los-tokens.md) y [ADR-019](ADR-019-shadcn-ui-mira-base-ui-con-tokens-pitchlab.md).
- **Fecha:** 2026-11-13 (implementada desde 2026-11-09 en `docs/design/UI_LIBRARIES.md`, `packages/ui` y `apps/web/app/globals.css`).

## Contexto

Con solo primitivas de shadcn/ui ([ADR-019](ADR-019-shadcn-ui-mira-base-ui-con-tokens-pitchlab.md)) faltaban controles densos de entrada y sobreposición (Select, DateField, Drawer, Popover, Switch, Accordion) y patrones estructurales de aplicación (`AppShell`, `SegmentedControl`, `BottomSheet`, `CommandPalette`). Sin embargo, montar tres librerías distintas en una misma aplicación introduce tres riesgos graves:

1. Tres estéticas incompatibles (radios, sombras y acentos distintos).
2. Colisiones de nombres globales de clase (`.badge`, `.skeleton`, `.tag`) y preflights CSS que reinician pantallas aprobadas.
3. Conflicto de atributo `data-theme`: el proveedor `<Theme>` de Astryx elimina `data-theme` de `<html>` al montarse/desmontarse en modo `system`, y si declara su propio `[data-theme]` interno provoca que HeroUI redefina variables globales (incluida `--surface-hover`, token de marca de PitchLab).

## Decisión

1. **Rol único por librería, reexportado desde `@pitchlab/ui`:**
   - **Primitivas propias de `@pitchlab/ui`** primero cuando ya existen (`TeamBadge`, `LeagueBadge`, `ProbSplit`, `MaestroIcon`, `TopLayerModalDialog`, etc.).
   - **HeroUI v3 (exclusivamente paquetes gratuitos Apache-2.0: `@heroui/react`, `@heroui/styles`)** para formularios, controles de entrada y sobreposiciones (`TextField`, `Select`, `Switch`, `Checkbox`, `Tabs`, `Drawer`, `Popover`, `Accordion`). Quedan prohibidos HeroUI Pro, templates de pago y cualquier paquete que requiera `HEROUI_PERSONAL_TOKEN` o `HEROUI_AUTH_TOKEN`.
   - **Astryx (Meta, MIT)** para estructura y navegación de app (`AppShell`, `BottomSheet`, `SegmentedControl`, `CommandPalette`), excluyendo paquetes `@canary` inestables.
   - **shadcn/ui (Mira + Base UI)** para controles base ya adoptados y huecos puntuales.
2. **Cascada explícita `@layer` sin preflight destructivo (`apps/web/app/globals.css`):**
   - Orden fijo: `theme → reset, astryx-base, astryx-theme → legacy → astryx-pitchlab → components → utilities`.
   - HeroUI se importa por piezas en `heroui-components.css` (nunca `@heroui/styles` completo) y se excluyen `.badge`, `.skeleton` y `.tag` para no pisar las clases homónimas de PitchLab. Astryx tampoco carga su `reset.css`.
   - Los puentes `legacy` y `astryx-pitchlab.css` mapean colores, radios (`8 / 12 / 16 px`) y tipografía únicamente hacia variables de `@pitchlab/tokens`.
3. **Aislamiento obligatorio con `<AstryxScope>` (`packages/ui/src/astryx.tsx`):**
   - Todo árbol que renderice componentes de Astryx se envuelve en `<AstryxScope>`, que monta `<Theme theme={neutralTheme} mode="system">` (evitando un `[data-theme]` anidado que dispare reglas de HeroUI) y mantiene un `MutationObserver` sobre `document.documentElement` para restaurar al instante `html[data-theme]` si Astryx intenta borrarlo.

## Alternativas descartadas

- **Construir todos los controles accesibles a mano:** lento y propenso a regresiones de teclado/foco en selectores, drawers y hojas móviles.
- **Usar una sola librería para todo:** HeroUI carece de `AppShell`/`BottomSheet` equivalentes a Astryx, mientras que Astryx no cubre todos los campos de formulario requeridos; HeroUI Pro añade dependencia comercial y tokens privados.
- **Cargar hojas completas de cada librería sin `@layer`:** rompe estilos existentes y duplica resets globales.

## Consecuencias

- Las tres librerías comparten un solo interruptor de tema (`html[data-theme="dark" | "light"]`) y cero colores literales fuera de `@pitchlab/tokens`.
- `apps/web` configura `optimizePackageImports` en `next.config.mjs` para `@pitchlab/ui`, HeroUI, Base UI y Astryx a fin de evitar que los barrels disparen el First Load JS.
- Antes de crear cualquier clase global nueva es obligatorio verificar que no colisione con `@heroui/styles/dist`, `@astryxdesign/theme-neutral` ni los alias de shadcn.
