# PitchLab · instrucciones para agentes

Estado y siguiente paso del proyecto: `docs/execution/PROJECT_STATE.md`.

## Diseño (siempre que toques UI)

Toda pantalla, componente, estilo, landing o demo visual de PitchLab sigue estas reglas, en cada sesión:

- **Estándar *curado*:** diseño al nivel de las apps nativas de Apple, con la identidad de PitchLab. Los principios y la definición de terminado están en `docs/design/UI_LIBRARIES.md` §1 y §5.
- **Reglas de la marca:** `docs/design/DESIGN_SYSTEM.md`, `INTERACTION_PATTERNS.md` y `RESPONSIVE_RULES.md` mandan sobre cualquier librería o skill.
- **Librerías:** HeroUI v3 (solo la parte gratuita) y shadcn/ui conviven sobre los tokens de `@pitchlab/tokens`. Antes de elegir o estilizar un componente, lee `docs/design/UI_LIBRARIES.md`.
- **Storybook** (`pnpm storybook`) es la fuente visual: cada componente nace o cambia con sus stories en tema oscuro y claro.
- **Skills de diseño**, cárgalos antes de escribir código:
  - `impeccable`: todo trabajo de interfaz (diseñar, criticar, pulir, auditar).
  - `stageshow`: UI simulada del producto para la landing, heroes, tarjetas de features y demos animadas.
  - `dataviz`: cualquier gráfica, barra de probabilidad o tablero.
  - `prototype`: explorar una pantalla o flujo antes de construirlo.
