# Lienzo · Hoy (`/app`) · propuesta (2026-11-11)

Propuesta de rediseño del contenido de Inicio. La barra superior y el sidebar no cambian.

| Archivo | Qué es |
|---|---|
| `Main.html` | Lienzo interactivo y autosuficiente: escritorio (oscuro y claro, 1440 px) y móvil (oscuro y claro, 390 px). Filtro por liga, orden por hora o probabilidad, «+» al parlay y comparador «Tu momio». Al final: lo que hoy no funciona, qué cambia y por qué, y la guía para implementar. |

Para verlo, sirve la raíz del repo (configuración `design-prototypes` de `.claude/launch.json`, puerto 4173) y abre `/design/canvas/hoy/Main.html`. Los emblemas salen de `apps/web/public/brand/sports/`.

Datos: partidos y probabilidades `h2h` reales de `data/snapshots/*/latest.json` al 11 de noviembre de 2026, con horas en America/Mexico_City. «Mis picks abiertos» es de ejemplo y va marcado.

## Colores del lienzo → tokens

| Lienzo | Token |
|---|---|
| `--bg` | `--pl-stage-bg` |
| `--line` / `--line2` | `--pl-border` / `--pl-border-strong` |
| `--t1` / `--t2` / `--t3` | `--pl-text` / `--pl-text-secondary` / `--pl-text-muted` |
| `--brand` / `--brandbg` | `--pl-brand` / `color-mix` de `--pl-brand` al 14 % |
| `--ok` / `--miss` / `--warn` | `--pl-success` / `--pl-danger` / `--pl-warning` |
| `--hover` / `--active` / `--seg` | `--pl-surface-hover` / `--pl-surface-active` / `--pl-surface` |
| `--track` | `--pl-psplit-track` |
| `--btn` / `--btnfg` | `--pl-btn-primary-bg` / `--pl-btn-primary-fg` |
| `.glass` / `.ring` | `.glass-lens` + `.glass-ring` / `.glass-card` + `.glass-ring` |
