# Lienzo · Perfil de usuario (2026-11-11)

Fuente del lienzo de diseño «PitchLab · Perfil». El lienzo es privado; estos archivos bastan para implementarlo.

| Archivo | Qué es |
|---|---|
| `Main.dc.html` | Contenido del perfil en escritorio (`/app/u/[handle]`), interactivo: pestañas Publicaciones · Picks · Parlays · Estadísticas y botón Seguir. Tweaks: tema, pestaña inicial y «perfil propio». **Solo el contenido:** la barra y el sidebar del club no cambian. |
| `Mobile.dc.html` | El mismo perfil a 390 px, interactivo (pestañas Posts · Picks · Parlays · Datos), versión más calmada. |
| `canvas.json` | Índice. Sus `notes` traen «Qué cambia y por qué» (`decisiones`) y el brief de implementación (`brief`). |

Son HTML de referencia, no código para copiar. Los datos son los del perfil de ejemplo de Sofía (`TIPSTAR_CREATORS`, `isExample: true`): en la app todo sale del journal, de las publicaciones y del cálculo del leaderboard.

## Imágenes (`/_blob/…`) → archivos del repo

| Blob | Qué es | En código |
|---|---|---|
| `03b1c801…` / `32767807…` | logo horizontal oscuro / claro (ya no se usa: el perfil va dentro del shell) | `BrandLogo` |
| `1107a721…` · `d152abe4…` · `c8919a3c…` | NFL · Liga MX · Premier League | `LeagueBadge` |
| `30d7a772…` · `4003ad17…` | Querétaro · Monterrey | `TeamBadge` |
| `dcbec80b…` · `3d5ead22…` | NY Giants · Washington | `TeamBadge` |
| `3f79fe34…` · `9eb9ed83…` | Arsenal · Liverpool | `TeamBadge` |

Nunca escribas rutas de emblemas a mano: usa `TeamBadge` y `LeagueBadge`.

## Colores del lienzo → tokens

| Lienzo | Token |
|---|---|
| `--bg` | `--pl-stage-bg` |
| `--line` / `--line2` | `--pl-border` / `--pl-border-strong` |
| `--t1` / `--t2` / `--t3` | `--pl-text` / `--pl-text-secondary` / `--pl-text-muted` |
| `--brand` | `--pl-brand` (sello y ficha de verificado, barras de cumplidos) |
| `--ok` / `--miss` | `--pl-success` / `--pl-danger` (saldo positivo / negativo, resultado del pick) |
| `--warn` | `--pl-warning` (ficha «Ejemplo») |
| `--btn` / `--btnfg` | `--pl-btn-primary-bg` / `--pl-btn-primary-fg` |
| `--track` | `--pl-psplit-track` |
| `--l1` / `--l2` / `--l3` (luces) | `--pl-orb-violet` / `--pl-orb-emerald` / `--pl-orb-sky` con `color-mix`, solo degradados |
| `.glass` | `.glass-lens` + `.glass-ring` de `apps/web/app/pitchlab-v4.css` |
| `.chip` | `.glass-card` + `.glass-ring` |
| `.vbadge` | Componente nuevo `TipstarVerifiedBadge` (ver el prompt) |
