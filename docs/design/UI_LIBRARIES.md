# Librerías de UI: HeroUI + shadcn sobre los tokens de PitchLab

> **Propósito:** cómo conviven HeroUI v3 y shadcn/ui en la app definitiva sin doble trabajo ni dos estéticas.
> **Consumidores:** cualquier agente o persona que toque UI (`packages/ui`, `apps/web`).
> **Fecha:** 2026-11-09 · **Jerarquía:** marca (`pitchlab-brand/`) → `DESIGN_SYSTEM.md` → **este documento** → componentes → pantallas.

## 1. Estándar de calidad: *curado*

La meta es una app **curada** al nivel de las apps nativas de Apple: cada pantalla parece decidida, no ensamblada. Se toman los principios de las Human Interface Guidelines con la identidad de PitchLab (Inter, Pulso, Radar), nunca la marca, los iconos ni la tipografía de Apple.

- **Claridad:** una idea por pantalla, una acción primaria por región, jerarquía tipográfica con pocos tamaños de la escala de la marca.
- **Deferencia:** el dato manda y el cromo se retira: superficies calladas, color reservado para lo que significa algo (`DESIGN_SYSTEM.md` §4).
- **Profundidad:** las capas (superficie → elevada → overlay) explican la navegación; la sombra solo en overlays.
- **Movimiento con causa:** cada animación responde a una acción o a un cambio de dato, con `--time-*` y `--ease-out`, y se apaga con movimiento reducido.
- **Tacto:** objetivos de 44 px (`--layout-touch`), foco visible en Pulso, estados completos (cargando, vacío, error, deshabilitado).
- **Oficio:** alineación a la escala `--space-*`, cifras con `.num`, textos que caben en 375 px sin cortes.

## 2. Qué librería usar

Elige en este orden y usa una sola fuente por tipo de componente dentro de una pantalla:

1. **Componente de `@pitchlab/ui`** si ya existe (Tag, Panel, MatchCard, ProbBar, PinPad, Skeleton…): es el contrato aprobado.
2. **HeroUI v3** para controles interactivos y accesibles nuevos: formularios (TextField, NumberField, Select, ComboBox, DatePicker), Tabs, Switch, Checkbox, Radio, Slider, Table, Modal, Drawer, Popover, Dropdown, Toast, Tooltip, Pagination, Accordion.
3. **shadcn/ui** para lo ya construido con él (controles públicos de la landing y el login) y para lo que HeroUI no cubre.
4. **Componente propio** solo cuando ninguna de las anteriores sirve; nace en `packages/ui` con sus stories.

**Solo la parte gratuita de HeroUI** (`@heroui/react`, `@heroui/styles`, Apache-2.0). HeroUI Pro, sus templates, temas, AI Builder y cualquier paquete que pida `HEROUI_PERSONAL_TOKEN` o `HEROUI_AUTH_TOKEN` quedan fuera.

Todo componente que use una pantalla se expone desde `@pitchlab/ui` (envuelto o reexportado), así la app importa de un solo lugar y el cambio de librería es una edición local.

## 3. Cómo comparten el tema

Un solo juego de variables, definido en `apps/web/app/globals.css`, alimenta a las dos librerías:

| Capa (`@layer`) | Contenido |
|---|---|
| `theme` | Tema de Tailwind y tema por defecto de HeroUI (se pisa) |
| `legacy` | Tokens de la marca, CSS de D1, alias de shadcn y el **puente HeroUI → tokens** |
| `components` | CSS de componentes HeroUI (`heroui-components.css`) y su ajuste de radios y alturas |
| `utilities` | Utilidades de Tailwind (clases de shadcn) |

- **Variables compartidas con el significado de HeroUI:** `--accent` = Pulso (`--brand-primary`) y `--muted` = texto atenuado (`--text-muted`). En shadcn el fondo sutil es `bg-secondary` y la superficie seleccionada `bg-surface-active`.
- **Radios de la marca** sobre HeroUI: controles 8, paneles 12, overlays 16; las píldoras quedan para chips y filtros.
- El tema claro y el oscuro salen solos de `data-theme` en `<html>`: el puente apunta a tokens, nunca a valores.
- HeroUI se importa por piezas. El import completo `@heroui/styles` trae el preflight de Tailwind, y la app trabaja sin él.

## 4. Choques conocidos

| Clase de HeroUI | Choca con | Qué se usa |
|---|---|---|
| `.badge` | `TeamBadge` / `.badge` de D1 | `TeamBadge` / `LeagueBadge` |
| `.skeleton` | `Skeleton` de D1 | `Skeleton` de `@pitchlab/ui` |
| `.tag`, `.tag-group` | `Tag` de D1 | `Tag` o `Chip` de HeroUI |

Sus CSS no se cargan. Para habilitar uno, primero renombra la clase de D1 (con prefijo `pl-`) y luego agrégalo a `heroui-components.css`.

Al agregar una clase o variable global nueva, busca antes que no exista en `@heroui/styles/dist` ni en los alias de shadcn.

## 5. Storybook es la fuente visual

`pnpm storybook` (puerto 6006) compila el mismo `globals.css` que la app y tiene el selector **Tema** (oscuro / claro) en la barra. La story `PitchLab/Librerías · HeroUI + shadcn` muestra ambas librerías lado a lado.

Un componente está **terminado** cuando:

- tiene stories de todos sus estados en los dos temas;
- se revisó en Storybook a 375 y 1440 px con captura;
- pasó la revisión de diseño con el skill `impeccable` (crítica y pulido) sin hallazgos abiertos;
- `pnpm --filter @pitchlab/ui typecheck` y `test` están en verde.
