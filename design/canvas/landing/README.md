# Lienzo · Landing propuesta (2026-11-11)

Fuente del lienzo de diseño «PitchLab · Landing propuesta». El lienzo es privado; estos archivos bastan para implementarlo.

| Archivo | Qué es |
|---|---|
| `Main.dc.html` | Landing de escritorio, interactiva (liga, «Tu momio», mensual/anual, tema). El tema claro son las variables de `.lp[data-theme="light"]`. |
| `Mobile.dc.html` | La misma landing a 390 px, tema oscuro. |
| `canvas.json` | Índice del lienzo. Sus `notes` traen «Qué cambia y por qué», el brief de implementación y el mapa del sitio. |

Son HTML de referencia, no código para copiar: el JS de `renderVals()` solo simula datos. En la app todo sale de tokens `--pl-*`, de los componentes de `@pitchlab/ui` y del dataset.

## Imágenes (`/_blob/…`) → archivos del repo

| Blob | Archivo (`apps/web/public/brand/…`) | En código |
|---|---|---|
| `0a34c4f2…` / `1b995e75…` | `logos/r1/pitchlab-horizontal-dark.svg` / `-light.svg` | `BrandLogo variant="horizontal"` |
| `b9a000a4…` | `mascot/r1/radar.webp` | `Mascot edition="radar"` |
| `75fe2646…` | `mascot/r1/soccer.webp` | `Mascot edition="soccer"` |
| `f7cc8bf4…` · `ab6c8d69…` · `1110dd19…` · `abfc3d0c…` | logos de Liga MX, NFL, Premier y LaLiga | `LeagueBadge` |
| `94cf4d84…` · `3c564f82…` | Querétaro · Monterrey | `TeamBadge` |
| `f6bd85ed…` · `a981b7a2…` | NY Giants · Washington | `TeamBadge` |
| `62776c27…` · `dbe2f77a…` · `f02fc12f…` · `6e2b4f82…` | Arsenal · Liverpool · Real Madrid · Barcelona | `TeamBadge` |
| `b3d0c938…` · `b49d692b…` · `f8d3d6ca…` · `e8a7e1a7…` · `5f3f81d3…` · `6ddc85e7…` | Necaxa · Tijuana · Atl. San Luis · Juárez · América · Chivas | `TeamBadge` |

Nunca escribas rutas de emblemas a mano: usa `TeamBadge` y `LeagueBadge`.

## Colores del lienzo → tokens

| Lienzo | Token |
|---|---|
| `--bg` / `--bg2` | `--pl-stage-bg` / `--pl-stage-subtle` |
| `--surf` / `--surf2` | `--pl-surface` / `--pl-surface-elevated` |
| `--line` / `--line2` | `--pl-border` / `--pl-border-strong` |
| `--t1` / `--t2` / `--t3` | `--pl-text` / `--pl-text-secondary` / `--pl-text-muted` |
| `--brand` | `--pl-brand` |
| `--ok` / `--okbg` | `--pl-success` / `color-mix` de `--pl-success` al 12 % |
| `--miss` / `--missbg` | `--pl-danger` / `color-mix` de `--pl-danger` al 10 % |
| `--btn` / `--btnfg` | `--pl-btn-primary-bg` / `--pl-btn-primary-fg` |
| `--glow` | `--pl-glow` |
| `--track` | `--pl-psplit-track` |
| `--orb1` / `--orb2` / `--orb3` | `--pl-orb-violet` / `--pl-orb-emerald` / `--pl-orb-sky` |
| `.glass-lens` / `.glass-card` / `.glass-pill` / `.glass-ring` | Las clases del mismo nombre en `apps/web/app/pitchlab-v4.css` (`.glass-pill` = `.glass-pill-bar`) |
