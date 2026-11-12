# Lienzo · Inicio (`/app`) · propuesta (2026-11-11)

«Hoy» pasa a llamarse **Inicio**. Misma estructura que la pantalla actual (partido destacado, parlay rápido, mejores picks y cartelera), más ordenada y con una **tira de fechas** para ver los partidos de hoy o de cualquier día. La barra superior y el sidebar no cambian, salvo el nombre «Inicio».

| Archivo | Qué es |
|---|---|
| `Main.html` | Lienzo interactivo y autosuficiente: tres tableros de escritorio (sábado 21 en tarjetas, hoy sin partidos en claro, domingo 15 en lista) y dos de móvil. Fecha, liga, orden, tarjetas o lista, «+ Parlay», «Sellar», niveles de Parlay rápido y «Tu momio». Al final: qué cambia y por qué, y la guía para implementar. |
| `data.js` | Los 72 partidos próximos de `data/snapshots/*/latest.json` (11 nov 2026) con hora de Ciudad de México, 1·X·2, marcador proyectado y dos picks por partido. Generado; no se edita a mano. |

Para verlo, sirve la raíz del repo (configuración `design-prototypes` de `.claude/launch.json`, puerto 4173) y abre `/design/canvas/inicio/Main.html`. Los emblemas salen de `apps/web/public/brand/sports/`.

`design/canvas/hoy/` es la propuesta anterior (más distinta a la pantalla actual); esta la reemplaza.

## Colores del lienzo → tokens

| Lienzo | Token |
|---|---|
| `--bg` | `--pl-stage-bg` |
| `--line` / `--line2` | `--pl-border` / `--pl-border-strong` |
| `--t1` / `--t2` / `--t3` | `--pl-text` / `--pl-text-secondary` / `--pl-text-muted` |
| `--brand` / `--brandbg` | `--pl-brand` / `color-mix` de `--pl-brand` al 14 % |
| `--ok` / `--okbg` / `--miss` / `--warn` | `--pl-success` / su `color-mix` al 12 % / `--pl-danger` / `--pl-warning` |
| `--hover` / `--active` / `--seg` | `--pl-surface-hover` / `--pl-surface-active` / `--pl-surface` |
| `--track` | `--pl-psplit-track` |
| `--btn` / `--btnfg` | `--pl-btn-primary-bg` / `--pl-btn-primary-fg` |
| `.glass` / `.ring` | `.glass-lens` + `.glass-ring` / `.glass-card` + `.glass-ring` |
