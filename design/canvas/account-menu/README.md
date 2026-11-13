# Lienzo · Menú de cuenta (2026-11-11)

Rediseño de la campana, el chip de perfil y el menú que abre (`ShellChrome.tsx`, popover `.pl-profile-menu`).

| Archivo | Qué es |
|---|---|
| `Main.html` | Lienzo interactivo y autosuficiente: nueve tableros (socio con récord en oscuro y claro, socio sin picks, tipster verificado, admin, visitante, menú cerrado, y la hoja móvil en oscuro y claro). Al final trae «Qué cambia y por qué» y la guía «Para implementar». |

Para verlo, sirve la raíz del repo (configuración `design-prototypes` de `.claude/launch.json`, puerto 4173) y abre `/design/canvas/account-menu/Main.html`.

Es HTML de referencia, no código para copiar. Las cifras son de ejemplo: en la app salen de `journalRecord(journal)`.

## Colores del lienzo → tokens

| Lienzo | Token |
|---|---|
| `--bg` | `--pl-stage-bg` |
| `--line` / `--line2` | `--pl-border` / `--pl-border-strong` |
| `--t1` / `--t2` / `--t3` | `--pl-text` / `--pl-text-secondary` / `--pl-text-muted` |
| `--brand` / `--brandbg` | `--pl-brand` / `color-mix` de `--pl-brand` al 14 % (ficha Ultra, sello, número de la campana) |
| `--ok` / `--miss` | `--pl-success` / `--pl-danger` (saldo) |
| `--hover` / `--active` | `--pl-surface-hover` / `--pl-surface-active` |
| `--seg` / `--segon` | fondo y segmento activo del control segmentado (`OddsFormatSegment`) |
| `.glass` | `.glass-lens` + `.glass-ring` |
| `.ring` | `.glass-card` + `.glass-ring` |
