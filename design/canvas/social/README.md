# Lienzo · Comunidad (`/app/social`) (2026-11-11)

Fuente del lienzo de diseño «PitchLab · Comunidad». El lienzo es privado; estos archivos bastan para implementarlo.

| Archivo | Qué es |
|---|---|
| `Main.dc.html` | Contenido de `/app/social` en escritorio, interactivo: pestañas Para ti · Siguiendo · Consenso · Ranking, Seguir y Me gusta. Tweaks: tema y pestaña inicial. **Solo el contenido:** la barra y el sidebar del club no cambian. |
| `Mobile.dc.html` | Lo mismo a 390 px, en una columna, con el top en carrusel. |
| `Siguiendo.dc.html` / `SiguiendoMobile.dc.html` | Pestaña Siguiendo: a quién sigues, filtros (Todos · Tipstars · Socios · Con pick abierto), feed de quienes sigues, picks abiertos próximos y sugerencias. |
| `Consenso.dc.html` / `ConsensoMobile.dc.html` | Pestaña Consenso: filtro por liga y orden, partido destacado con los 3 resultados (Socios vs Modelo) y lista con la diferencia en puntos. |
| `Ranking.dc.html` / `RankingMobile.dc.html` | Pestaña Ranking: periodo y orden (Saldo · Contra el cierre · Cumplidos), podio de 3, tabla del 4 al 10 y tu fila. En móvil tu fila queda fija abajo. |
| `canvas.json` | Índice. Sus `notes` traen «Qué cambia y por qué» (`decisiones`), el brief (`brief`) y una nota por pestaña (`nSiguiendo`, `nConsenso`, `nRanking`). |

Las pestañas de escritorio y móvil se enlazan entre sí en modo Play.

Son HTML de referencia, no código para copiar. Nombres, saldos y porcentajes son de los perfiles de ejemplo (`TIPSTAR_CREATORS`, `socio_pl`) o ilustrativos (Mariana T., Andrés L.): en la app todo sale de las publicaciones, del journal y de `rankAnalysts()`.

## Imágenes (`/_blob/…`) → archivos del repo

| Blob | Qué es | En código |
|---|---|---|
| `9f120714…` · `1158a9b5…` · `d6519d21…` | Liga MX · NFL · Premier League | `LeagueBadge` |
| `2323d62b…` · `c0b14d13…` | Querétaro · Monterrey | `TeamBadge` |
| `9c4128b9…` · `082deb75…` | NY Giants · Washington | `TeamBadge` |
| `fc30e667…` · `218f3696…` | Arsenal · Liverpool | `TeamBadge` |

## Colores del lienzo → tokens

Los mismos que `design/canvas/profile/README.md`: `--bg` → `--pl-stage-bg`, `--t1/2/3` → `--pl-text*`, `--brand` → `--pl-brand` (sello, barras de socios), `--ok`/`--miss` → `--pl-success`/`--pl-danger`, `--track` → `--pl-psplit-track`, `.glass` → `.glass-lens .glass-ring`, `.chip` → `.glass-card .glass-ring`. La barra «Modelo» del consenso usa `--pl-text-secondary`. Los degradados de los avatares usan `--avatar-grad-*`.
