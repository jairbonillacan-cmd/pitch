# Librerías de UI: HeroUI + Astryx + shadcn sobre los tokens de PitchLab

> **Propósito:** cómo conviven HeroUI v3, Astryx y shadcn/ui en la app definitiva sin doble trabajo ni tres estéticas.
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
2. **HeroUI v3** para formularios y controles de entrada: TextField, NumberField, Select, ComboBox, DatePicker, Switch, Checkbox, Radio, Slider; y para Tabs, Modal, Drawer, Popover, Tooltip, Toast, Pagination y Accordion.
3. **Astryx** para la estructura y los patrones de app: AppShell, BottomSheet, CommandPalette, SegmentedControl, Banner, Carousel, HoverCard, tablas y páginas de detalle. Sus «Best Practices» (`pnpm --filter @pitchlab/ui astryx component <Nombre>`) aplican siempre que no contradigan la marca.
   - **Peso (P0-08, 2026-11-13):** Astryx agrega ~110 kB comprimidos a cada página que lo use. No lo metas en el shell ni en páginas públicas por un control chico: para selectores de 2–5 opciones usa el `seg-well` de la casa (`role="radiogroup"`), como `OddsFormatSegment`. Úsalo donde su patrón ahorre trabajo real y la página ya lo justifique.
   - **Importaciones:** las páginas importan cada vista por su subruta (`@pitchlab/ui/landing`, `/home`, `/profile`, `/auth`, `/canjear`…), nunca desde la raíz `@pitchlab/ui` ni `@pitchlab/ui/platform` en código de servidor: el barril mete toda la librería en el JavaScript de la página.
4. **shadcn/ui** para lo ya construido con él (controles públicos de la landing y el login) y para lo que las otras dos no cubren.
5. **Componente propio** solo cuando ninguna de las anteriores sirve; nace en `packages/ui` con sus stories.

**Solo la parte gratuita de HeroUI** (`@heroui/react`, `@heroui/styles`, Apache-2.0). HeroUI Pro, sus templates, temas, AI Builder y cualquier paquete que pida `HEROUI_PERSONAL_TOKEN` o `HEROUI_AUTH_TOKEN` quedan fuera. Astryx es MIT completo; sus paquetes `@canary` (charts, vega) quedan fuera hasta tener versión estable.

Todo componente que use una pantalla se expone desde `@pitchlab/ui` (envuelto o reexportado), así la app importa de un solo lugar y el cambio de librería es una edición local.

## 3. Cómo comparten el tema

Un solo juego de tokens alimenta a las tres librerías. Las capas se declaran en `apps/web/app/globals.css`:

| Capa (`@layer`) | Contenido |
|---|---|
| `theme` | Tema de Tailwind y tema por defecto de HeroUI (se pisa) |
| `reset`, `astryx-base`, `astryx-theme` | Componentes de Astryx y su tema neutral (estructura: tipografía, espaciado) |
| `legacy` | Tokens de la marca, CSS de D1, alias de shadcn y el **puente HeroUI → tokens** |
| `astryx-pitchlab` | **Puente Astryx → tokens** (`astryx-pitchlab.css`) |
| `components` | CSS de componentes HeroUI (`heroui-components.css`) y su ajuste de radios y alturas |
| `utilities` | Utilidades de Tailwind (clases de shadcn) |

- **Variables compartidas, un solo significado:** `accent` = Pulso (`--brand-primary`) y `muted` = texto atenuado (`--text-muted`) en HeroUI y Astryx. En shadcn el fondo sutil es `bg-secondary` y la superficie seleccionada `bg-surface-active`.
- **Radios de la marca** en todas: controles 8, paneles 12, overlays 16; las píldoras quedan para chips y filtros.
- El tema claro y el oscuro salen solos de `data-theme` en `<html>`: los puentes apuntan a tokens, nunca a valores.
- HeroUI se importa por piezas: el import completo `@heroui/styles` trae el preflight de Tailwind, y la app trabaja sin él. Astryx tampoco carga su `reset.css`.

### Astryx siempre dentro de `<AstryxScope>`

Todo componente de Astryx va dentro de `<AstryxScope>` (`@pitchlab/ui`). Ese contenedor:

- monta el `<Theme>` de Astryx en modo `system`, así su envoltorio no declara un `data-theme` propio (HeroUI redefine sus variables en cualquier `[data-theme]`, incluida `--surface-hover`, que también es token de la marca);
- protege `data-theme` en `<html>`: el `<Theme>` raíz de Astryx lo borra al montarse y al desmontarse, y el guardián lo restaura.

El tema de Astryx se queda por debajo de D1 en la cascada: sus reglas globales de encabezados no pisan las pantallas aprobadas.

## 4. Choques conocidos

| Clase de HeroUI | Choca con | Qué se usa |
|---|---|---|
| `.badge` | `TeamBadge` / `.badge` de D1 | `TeamBadge` / `LeagueBadge`, o `Badge` de Astryx (`.astryx-badge`) |
| `.skeleton` | `Skeleton` de D1 | `Skeleton` de `@pitchlab/ui` |
| `.tag`, `.tag-group` | `Tag` de D1 | `Tag` o `Chip` de HeroUI |

Sus CSS no se cargan. Para habilitar uno, primero renombra la clase de D1 (con prefijo `pl-`) y luego agrégalo a `heroui-components.css`. Astryx no choca: sus clases llevan prefijo `astryx-` o son atómicas de StyleX.

Al agregar una clase o variable global nueva, busca antes que no exista en `@heroui/styles/dist`, en el tema de Astryx (`@astryxdesign/theme-neutral/dist/theme.css`) ni en los alias de shadcn.

## 5. Storybook es la fuente visual

`pnpm storybook` (puerto 6006) compila el mismo `globals.css` que la app y tiene el selector **Tema** (oscuro / claro) en la barra. La story `PitchLab/Librerías · HeroUI + shadcn + Astryx` muestra las tres lado a lado.

Un componente está **terminado** cuando:

- tiene stories de todos sus estados en los dos temas;
- se revisó en Storybook a 375 y 1440 px con captura, contra los principios del §1;
- `pnpm --filter @pitchlab/ui typecheck` y `test` están en verde.
