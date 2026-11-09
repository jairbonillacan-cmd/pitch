# Guía para GPT: recrear la landing y `/app` de PitchLab

> **Para quién:** un agente (GPT/Codex u otro) que va a construir o mantener la landing (`/`) y el Inicio de la app (`/app`) en este repo.
> **Fecha:** 2026-11-09 · **Rama:** `feat/pre-mvp`.
> **Referencia visual:** el lienzo de diseño de Claude «PitchLab · App (/app)» es privado; su fuente completa está copiada en `design/canvas/app/`. Este documento y esos archivos bastan: no necesitas abrir el lienzo.

## 1. Lee antes de tocar código

En este orden, y sin saltarte ninguno:

1. `AGENTS.md`: reglas de diseño de todo el repo.
2. `apps/web/PRODUCT.md`: audiencia, foco, precios y lo que no se puede inventar.
3. `docs/design/DESIGN_SYSTEM.md`: tokens, radios, copy y anti-defaults de la marca.
4. `docs/design/UI_LIBRARIES.md`: qué librería usar para cada pieza y cómo comparten el tema.
5. Este documento.

## 2. Reglas que no se negocian

- **Foco del producto:** cada pantalla dice primero **qué es lo más probable según los datos**, con su probabilidad y su **cuota justa** (`1/p`), para que el usuario lo compare con la cuota de su casa. Se informa; nunca se recomienda monto, «pick seguro», «gana» ni «cobra».
- **Solo tokens.** Ningún hex fuera de `packages/tokens` (el linter `scripts/lint-codebase.mjs` lo bloquea). Los hex del lienzo se traducen con la tabla del §6.
- **Dos temas siempre.** Oscuro por defecto; claro con `data-theme="light"` en `<html>`. Los colores salen de los tokens, que ya cambian con ese atributo.
- **Librerías por pieza** (detalle en `UI_LIBRARIES.md` §2): primero `@pitchlab/ui`; HeroUI v3 (solo gratis) para formularios, botones, tabs y overlays; Astryx para estructura de app (AppShell, SegmentedControl, BottomSheet); shadcn solo para lo que ya existe. Todo componente de Astryx va dentro de `<AstryxScope>`.
- **FD-16:** la UI nunca nombra proveedores de datos ni algoritmos (nflverse, openfootball, api-football, Poisson, Dixon-Coles, Pitágoras, Log5). El motor es «Modelo PitchLab · en validación».
- **No se publica la metodología.** No enlaces a `/metodologia` (redirige a `/#como-se-lee`).
- **Datos reales o marcados.** Partidos, probabilidades y tablas salen de los snapshots. Lo que aún no existe (picks del usuario, histórico de cuotas) se diseña con datos de ejemplo y se marca como tal, nunca como dato real.
- **Mascota Radar:** decorativa (`alt=""`), con halo `--glow`, nunca tapa cifras ni controles. Ediciones por contexto (`radar`, `nfl`, `soccer`, liga).
- **Copy legal en positivo:** «Información para decidir, no una garantía. PitchLab no acepta apuestas. Solo mayores de 18.»

## 3. Landing (`/`): ya construida, mantenla

La landing «Pregunta un partido» está implementada y probada. Para cambiarla, edita estos archivos; no la reescribas desde cero.

| Pieza | Archivo |
|---|---|
| Componente y secciones | `packages/ui/src/landing/landing-v2.tsx` |
| Snapshot → datos de la landing | `packages/ui/src/landing/data.ts` (`landingLeagueFromSnapshot`) |
| Planes, precios y ligas (fuente única) | `packages/ui/src/landing/content.ts` |
| Estilos (todo bajo `.lv`) | `apps/web/app/landing-v2.css` (capa `components`) |
| Carga en el servidor | `apps/web/src/server/landing.ts` |
| Ruta | `apps/web/app/page.tsx` |
| Story | `PitchLab/Landing definitiva` (`packages/ui/src/landing/landing-v2.stories.tsx`) |
| E2E | `apps/web/e2e/pre-mvp.spec.ts`, pruebas 1, 4 y 5 |

Orden de secciones: barra (logo, enlaces, tema, Entrar, «Prueba 7 días») → hero con selector de liga (Astryx SegmentedControl deslizable) y riel de partidos → hoja de análisis (probabilidad grande, barra 1X2, leyenda seleccionable, Más de 2.5, Ambos anotan, marcador más probable, campo «Tu cuota» de HeroUI y factores) → «Cómo se lee» (3 filas) → «Historial íntegro» → ligas → planes (Free, Pro $199, Elite $399 MXN/mes, IVA incluido) → cierre con Radar → pie.

## 4. `/app`: Inicio, por construir

Referencia: `design/canvas/app/Main.dc.html` (escritorio), `Mobile.dc.html` (móvil) y `MobileMore.dc.html` (menú «Más»). El tema claro es el mismo archivo con `theme="light"`.

### 4.1 Estructura de escritorio (≥ 1200 px)

- **Barra lateral 232 px** (`--background-secondary`, borde derecho `--border-default`), Astryx AppShell:
  - Logo horizontal (dark/light según tema) en una franja de 64 px.
  - Inicio (activo: fondo `--surface-active`, `aria-current="page"`).
  - Grupos con encabezado en mayúsculas de 11 px: **Deportes** (Liga MX, NFL, Premier League, LaLiga, Bundesliga con su `LeagueBadge` de 20 px), **Investigar** (Jugadores, Equipos, Prop Lab), **Mercados** (Cuotas), **Comunidad** (Leaderboards), **Personal** (Mi Lab, Watchlists). Máximo 7 entradas de primer nivel.
  - Abajo, tarjeta «Prueba Pro · Te quedan N días» con barra de progreso y enlace «Ver planes».
  - Inteligencia, IA y notificaciones **no** aparecen: llegan después del MVP.
- **Encabezado 64 px:** HeroUI SearchField («Buscar equipo, jugador o partido», atajo ⌘K, máx. 520 px), selector de liga activa, `ThemeToggle`, avatar de cuenta.
- **Contenido:** máx. 1120 px, padding 32 px, separación de 28 px entre bloques.

### 4.2 Bloques del Inicio, en orden

1. **Encabezado del día:** eyebrow con la fecha («Lunes 9 de noviembre», color `--brand-primary`), título «Hoy» (34 px, 800) y a la derecha `Freshness` («Datos actualizados HH:MM» con punto `--success`).
2. **Lo más probable en tus ligas** (bloque principal, superficie `--background-elevated`, radio 16):
   - Izquierda (4/12): Radar de 124 px sobre círculo `--glow`, título y la frase «Radar ordenó los próximos partidos por la probabilidad que estima el modelo. Compara la cuota justa con la que ves en tu casa antes de decidir.»
   - Derecha (8/12): lista ordenada con encabezado de columnas *Resultado más probable · Probabilidad · Cuota justa*. Cada fila: posición, emblema 28 px, resultado («Bayern München gana»), partido/fecha/liga, probabilidad grande en `--brand-primary` con mini barra, cuota justa.
   - Datos: de todos los partidos próximos de las ligas seguidas, toma el resultado con mayor `p` de `marketGroups[0]` (h2h) y ordena de mayor a menor; muestra 4. Cuota justa = `fairOdds` del snapshot.
3. **Esta noche** (columna 7/12): el partido más cercano de hoy. Muestra «Lo más probable · {resultado} · {p} · cuota justa». Si la diferencia entre los dos primeros resultados es < 3 puntos, añade «Casi parejo: con tan poca diferencia, la cuota decide.» Mascota de la liga (p. ej. `nfl`) de 132 px en la esquina superior derecha, con padding reservado para que no tape cifras. Botón primario «Abrir Game Center».
4. **Próximos en tus ligas** (columna 7/12): Astryx SegmentedControl Todos / Fútbol / NFL; tabla con columnas *Fecha · Partido · Lo más probable · Justa*.
5. **Columna derecha (5/12):**
   - **Mis picks abiertos** (Mi Lab): resultado · cuota tomada, «modelo X %», partido y estado. Datos de ejemplo hasta que existan cuentas.
   - **Movimientos de cuota:** «1.95 → 1.87», «justa 2.01», hace cuánto. Datos de ejemplo hasta que exista el histórico de cuotas.
   - **Liga MX · tabla:** top 3 de `standings` (posición, emblema, nombre, PJ, puntos) con `StandingsTable` (`limit={3}`).
6. **Pie legal** (12 px, `--text-muted`).

### 4.3 Móvil (< 768 px)

- Encabezado 56 px: firma compacta, botón Buscar (44 px), avatar.
- Radar 60 px + «Lo más probable hoy» + frescura; lista de 3 resultados más probables; tarjeta «Esta noche» con la mascota de la liga; «Mis picks abiertos».
- Barra inferior 64 px con 5 destinos: **Inicio, Partidos, Investigar, Mi Lab, Más**. «Más» abre un Astryx BottomSheet con Cuotas, Leaderboards, Watchlists, Cuenta y plan (chip HeroUI «Prueba Pro · N días»), Ayuda y juego responsable, y al pie Radar edición `soccer` con el aviso legal.

### 4.4 Tableta (768–1199 px)

No está dibujada: rail de 64 px con iconos y tooltip (`INFORMATION_ARCHITECTURE.md` §2), mismo contenido en una columna.

## 5. Mapeo de piezas a componentes

| Pieza del lienzo | Construir con |
|---|---|
| Shell y barra lateral | Astryx `AppShell` dentro de `<AstryxScope>` |
| Filtro Todos/Fútbol/NFL, selector de liga | Astryx `SegmentedControl` |
| Hoja «Más» (móvil) | Astryx `BottomSheet` |
| Buscador | HeroUI `SearchField` |
| Botones y enlaces-botón | HeroUI `Button` / clases `button button--primary` en `<a>` |
| Chip «Prueba Pro» | HeroUI `Chip` |
| Barra 1X2 y probabilidad | `@pitchlab/ui` `ProbSplit` / `ProbBar` / `PBar` |
| Emblemas | `@pitchlab/ui` `TeamBadge` / `LeagueBadge` |
| Radar y ediciones | `@pitchlab/ui` `Mascot` |
| Frescura | `@pitchlab/ui` `Freshness` |
| Tabla de posiciones | `@pitchlab/ui` `StandingsTable` |
| Tema | `@pitchlab/ui` `ThemeToggle` |

## 6. Traducción del lienzo a tokens

El lienzo usa variables cortas con hex. En código usa siempre el token de la derecha.

| Lienzo | Token | Oscuro | Claro |
|---|---|---|---|
| `--bg` | `--background-primary` | #0B1020 | #F3F5FD |
| `--nav` | `--background-secondary` | #10172A | #FFFFFF |
| `--elev` | `--background-elevated` | #1A2440 | #FFFFFF |
| `--surf` | `--surface-default` | #151E34 | #FFFFFF |
| `--hover` | `--surface-hover` | #222D49 | #E9ECF7 |
| `--active` | `--surface-active` | #302650 | #E6E0FF |
| `--t1` / `--t2` / `--t3` | `--text-primary` / `-secondary` / `-muted` | #F3F5FD / #B8C1D7 / #98A4BF | #0B1020 / #3B4560 / #5A6480 |
| `--line` / `--line2` | `--border-default` / `--border-strong` | #33405D / #73819F | #D5DAE8 / #7C87A3 |
| `--brand` | `--brand-primary` | #B49AFF | #5940B2 |
| `--ok` | `--success` | #66D9AE | #12704E |
| `--on` | `--on-primary` | #0B1020 | #FFFFFF |
| `--glow` | `--glow` | #B49AFF26 | #5940B21F |

Radios: controles 8 (`--radius-control`), paneles 12 (`--radius-panel`), bloque principal y hojas 16 (`--radius-overlay`). Espaciado en la escala `--space-*`. Tipografía Inter con `font-variant-numeric: tabular-nums` (clase `.num`) en toda cifra.

## 7. Imágenes del lienzo (`/_blob/…`) → archivos del repo

Los `src="/_blob/…"` de `design/canvas/app/` solo existen en el lienzo. Equivalencias:

| Blob | Archivo |
|---|---|
| `847e53db…` / `f3a2fcc2…` | `apps/web/public/brand/logos/r1/pitchlab-horizontal-dark.svg` / `-light.svg` → `BrandLogo variant="horizontal"` |
| `6663a8cb…` / `0adefa1c…` | `…/logos/r1/pitchlab-compact-dark.svg` / `-light.svg` → `BrandLogo variant="compact"` |
| `a1308dc9…` / `29d73fe2…` / `87c91e8a…` | `apps/web/public/brand/mascot/r1/radar.webp` / `nfl.webp` / `soccer.webp` → `Mascot edition="…"` |
| emblemas de ligas y equipos | `apps/web/public/brand/sports/<liga>/<r1|r2>/…` → `TeamBadge` / `LeagueBadge` (nunca rutas a mano) |

## 8. Cómo trabajar y cuándo está terminado

1. Construye los componentes nuevos en `packages/ui/src/app/` y exponlos desde `@pitchlab/ui`.
2. Crea sus stories en Storybook con datos reales de `data/snapshots/*/latest.json`, en tema oscuro y claro (selector «Tema» de la barra).
3. Conecta la ruta `apps/web/app/app/page.tsx` cargando los datos en el servidor, como hace `apps/web/src/server/landing.ts`.
4. Está terminado cuando, sin excepción:
   - cada bloque del §4.2 existe con datos reales o marcado como ejemplo;
   - se revisó a 375 y 1440 px en los dos temas, sin scroll horizontal;
   - `pnpm typecheck`, `pnpm test` (incluye el linter de hex) y las E2E afectadas pasan;
   - ninguna regla del §2 se rompió.
