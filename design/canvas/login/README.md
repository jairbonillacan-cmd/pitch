# Lienzo · Login propuesto (2026-11-11)

Fuente del lienzo de diseño «PitchLab · Login». El lienzo es privado; estos archivos bastan para implementarlo.

| Archivo | Qué es |
|---|---|
| `Main.dc.html` | `/login` en escritorio, interactivo: contraseña ↔ «sin contraseña» (enlace), «Revisa tu correo» y PIN de socio. El tema claro son las variables de `.lp[data-theme="light"]`. |
| `Mobile.dc.html` | `/login` en móvil, tema oscuro, fluido (ancho y alto reales del teléfono). |
| `canvas.json` | Índice. Sus `notes` traen «Qué cambia y por qué» y el brief de implementación. |

Son HTML de referencia, no código para copiar: el JS de `renderVals()` solo simula estados. En la app todo sale de tokens `--pl-*`, de los componentes de `@pitchlab/ui` y del dataset.

## Imágenes (`/_blob/…`) → archivos del repo

| Blob | Archivo (`apps/web/public/brand/…`) | En código |
|---|---|---|
| `b66eec63…` / `8ac84891…` | `logos/r1/pitchlab-horizontal-dark.svg` / `-light.svg` | `BrandLogo variant="horizontal"` |
| `100bb13c…` | logo de Liga MX | `LeagueBadge` |
| `2fcd964e…` · `eeaa657e…` | Querétaro · Monterrey | `TeamBadge` |
| `c941818e…` · `51ab02ca…` | NY Giants · Washington | `TeamBadge` |
| `a81355fe…` | `mascot/r1/radar.webp` | **No se usa.** El diseño final va sin mascota. |

Nunca escribas rutas de emblemas a mano: usa `TeamBadge` y `LeagueBadge`.

## Colores del lienzo → tokens

| Lienzo | Token |
|---|---|
| `--bg` | `--pl-stage-bg` |
| `--line` / `--line2` | `--pl-border` / `--pl-border-strong` |
| `--t1` / `--t2` / `--t3` | `--pl-text` / `--pl-text-secondary` / `--pl-text-muted` |
| `--brand` | `--pl-brand` |
| `--ok` | `--pl-success` |
| `--btn` / `--btnfg` | `--pl-btn-primary-bg` / `--pl-btn-primary-fg` |
| `--glow` | `--pl-glow` |
| `--track` | `--pl-psplit-track` |
| `--field` | `color-mix` de `--pl-text` al 3.5 % sobre transparente (oscuro) · `--pl-surface` (claro) |
| `--l1` / `--l2` / `--l3` / `--l4` (luces) | `--pl-orb-violet` / `--pl-orb-emerald` / `--pl-orb-sky` / rosa nuevo `--pl-orb-rose` en `packages/tokens`, con la opacidad del lienzo vía `color-mix` |
| `.glass` (hoja y tarjeta del partido) | `.glass-lens` + `.glass-ring` (la hoja), `.glass-lens` + `.glass-ring--featured` (tarjeta del partido) de `apps/web/app/pitchlab-v4.css` |
| `.chip` (panel de vista previa, tarjeta NFL, ícono de correo) | `.glass-card` + `.glass-ring` |
| `.atmo` / `.beam` / `.grain` | Capas nuevas `.pl-auth-atmo`, `.pl-auth-beam`, `.pl-auth-grain` en `pitchlab-v4.css`: solo `radial-gradient` / `linear-gradient`, sin `filter` ni `backdrop-filter` |
