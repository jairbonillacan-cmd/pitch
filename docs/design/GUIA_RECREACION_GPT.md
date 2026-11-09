# Guía para GPT: recrear la landing, `/app`, Login, Crear cuenta y Planes de PitchLab

> **Para quién:** un agente (GPT/Codex u otro) que va a construir o mantener la landing (`/`), el Inicio de la app (`/app`), Login (`/login`), Crear cuenta (`/signup`) y Planes (`/pricing`) en este repo.
> **Fecha:** 2026-11-09 · **Rama:** `feat/pre-mvp`.
> **Referencia visual:** el lienzo de diseño de Claude «PitchLab · App (/app)» es privado; su fuente completa está copiada en `design/canvas/app/`. Este documento y esos archivos bastan: no necesitas abrir el lienzo.
> **Prompts listos para copiar**, uno por pantalla: `prompts/gpt/PANTALLAS.md`.

## 1. Lee antes de tocar código

En este orden, y sin saltarte ninguno:

1. `AGENTS.md`: reglas de diseño de todo el repo.
2. `apps/web/PRODUCT.md`: audiencia, foco, precios y lo que no se puede inventar.
3. `docs/design/DESIGN_SYSTEM.md`: tokens, radios, copy y anti-defaults de la marca.
4. `docs/design/UI_LIBRARIES.md`: qué librería usar para cada pieza y cómo comparten el tema.
5. Este documento.

## 2. Reglas que no se negocian

- **Foco del producto:** cada pantalla dice primero **qué es lo más probable según los datos**, con su probabilidad y su **cuota justa** (`1/p`), para que el usuario lo compare con la cuota de su casa. Se informa; nunca se recomienda monto, «pick seguro», «gana» ni «cobra».
- **Solo tokens.** Ningún hex fuera de `packages/tokens` (el linter `scripts/lint-codebase.mjs` lo bloquea). Los hex del lienzo se traducen con la tabla del §7.
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

## 4. `/app`: Inicio implementado

La ruta `apps/web/app/app/page.tsx` carga los snapshots en el servidor y monta `AppHome` de `@pitchlab/ui/app`. La story **PitchLab/Inicio** incluye jornada, datos parciales y estado sin datos. En la beta se muestran las ligas con datos y el buscador encuentra equipos y partidos publicados. Los picks, los movimientos de cuota y la prueba Pro se marcan como ejemplos.

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

## 5. Login, Crear cuenta y Planes: implementados en Storybook

Las vistas están en las stories **PitchLab/Entrar**, **PitchLab/Crear cuenta** y **PitchLab/Planes**, con el selector **Tema**. Los formularios reciben acciones por props desde `@pitchlab/ui/auth`. La comparativa y los precios de `@pitchlab/ui/pricing` usan el mismo catálogo que la landing. Las interacciones de cuenta y selección de plan son ejemplos en Storybook.

Referencia: `design/canvas/app/Login.dc.html`, `LoginMobile.dc.html`, `Signup.dc.html`, `SignupMobile.dc.html`, `Pricing.dc.html` y `PricingMobile.dc.html`. Los `*Light.dc.html` son las mismas pantallas con `theme="light"`. Reglas de cuentas: `docs/architecture/AUTH_BILLING_GROWTH.md` §1–3.

**Cuidado con el pre-MVP:** hoy `/login` es el acceso de socios con PIN y las E2E 2 y 3 dependen de él. Construye estas pantallas como componentes y stories (`packages/ui/src/auth/`, `packages/ui/src/pricing/`) y conéctalas a sus rutas solo cuando existan cuentas reales (Better Auth); hasta entonces el flujo con PIN se queda.

### 5.1 Login (`/login`)

- **Escritorio:** dos mitades que se apilan en móvil (`flex-wrap`, cada una `flex: 1 1 520px`).
  - **Izquierda, formulario** (máx. 400 px, centrado): logo; «Entra a PitchLab»; «Lo más probable de cada partido, con su cuota justa.»; botones «Continuar con Google» y «Continuar con Apple» (HeroUI Button, variante secundaria, 48 px); separador «o con tu correo»; Correo; Contraseña con botón de mostrar/ocultar (44 px, `aria-label` que cambia) y enlace «¿La olvidaste?»; botón primario «Entrar». Un botón de texto alterna a **enlace mágico**: la contraseña se cambia por «Te mandamos un enlace para entrar sin contraseña. Vence en 15 minutos.» y el botón «Enviarme el enlace». Pie: «¿No tienes cuenta? Crear cuenta» y «Solo mayores de 18. PitchLab no acepta apuestas.»
  - **Derecha, muestra de producto** (`--background-secondary` con la retícula `.fieldgrid`): eyebrow «Lee el juego con datos.», título «Lo más probable, con su cuota justa.», Radar de 112 px con halo y una lista de 3 resultados más probables reales (emblema, resultado, partido, cuota justa y probabilidad grande en `--brand-primary`), calculados como en el §4.2.
- **Móvil:** firma compacta; tarjeta con Radar y el resultado más probable del día; título; Google y Apple en dos columnas; formulario; «Entrar con un enlace por correo»; enlace a Crear cuenta al final.

### 5.2 Crear cuenta (`/signup`)

- **Misma estructura de dos mitades.**
  - **Formulario** (máx. 420 px):
    - Si se llega por un enlace de referido o invitación, aviso arriba: «{Nombre} te invitó: al crear tu cuenta tienes 7 días de Pro» (fondo `--surface-active`).
    - «Crea tu cuenta», Google y Apple, Correo.
    - **Contraseña** con el requisito en vivo debajo: «Mínimo 10 caracteres» → «Faltan N caracteres» → «Contraseña lista.» en `--success` con ícono.
    - **Fecha de nacimiento** obligatoria (HeroUI DateField o tres selectores Día/Mes/Año) con «Solo mayores de 18. Si no cumples la edad, no creamos la cuenta ni guardamos tus datos.»
    - **Consentimientos** en un grupo con borde: Términos y Aviso de privacidad (obligatorio), analítica (opcional) y novedades por correo (opcional), cada uno marcado como tal (HeroUI Checkbox).
    - «Crear cuenta» deshabilitado hasta que la contraseña sea válida y los términos estén aceptados. Pie: «¿Ya tienes cuenta? Entrar».
  - **Derecha:** «Así se ve un partido en PitchLab.» con un partido real: emblemas, «Lo más probable · {resultado}», probabilidad grande, cuota justa, barra 1X2 con los tres valores y una fila «Tu cuota» con la probabilidad implícita y la diferencia en puntos. Radar edición `soccer` con «Probabilidad y cuota justa del Modelo PitchLab · en validación. Tú decides con tu propia cuota.»
- **Móvil:** aviso de invitación con Radar y el formulario completo en una columna.
- **Backend (no lo inventes):** menor de 18 → se rechaza sin guardar datos; un trial por persona (`trial_claim`); los consentimientos se guardan con su versión (`consent`).

### 5.3 Planes (`/pricing`)

- **Barra pública** igual a la de la landing, con «Planes» activo.
- **Encabezado centrado:** eyebrow «Planes», título «Lo más probable de cada partido, al precio que elijas.» y «Precios en pesos mexicanos, IVA incluido. Empieza gratis o prueba Pro 7 días.»
- **Tres tarjetas** desde `LANDING_PLANS` (`packages/ui/src/landing/content.ts`, fuente única de precios y funciones): Free («Gratis», «Crear cuenta»); **Pro destacado** (borde `--brand-primary`, superficie elevada, etiqueta «7 días gratis», «$199 MXN al mes», «Probar 7 días»); Elite («$399 MXN al mes», «Elegir Elite»). El signo `$` va más chico y fuera del centrado de las cifras.
- **Comparativa** (HeroUI Table, encabezado fijo), desde `INFORMATION_ARCHITECTURE.md` §4 y sin nada posterior al MVP (IA, backtest, alertas):

  | Función | Free | Pro | Elite |
  |---|---|---|---|
  | Calendario, resultados y posiciones | ✓ | ✓ | ✓ |
  | Lo más probable y cuota justa | 1 partido al día | Todos | Todos |
  | Mercados por partido | 1 partido al día | Todos | Todos |
  | Cuotas actuales | Mejor cuota y 2 casas | Todas las casas | Todas las casas |
  | Apertura, cierre y movimiento | — | Temporada actual | Todo el histórico |
  | Prop Lab NFL | 3 al día | Sin límite | Sin límite |
  | Pick Journal y perfil público | ✓ | ✓ | ✓ |
  | Leaderboards | Ver | Ver y aparecer | Ver y aparecer |
  | Exportación a CSV | — | — | ✓ |

- **Preguntas** (HeroUI Accordion, una abierta a la vez): la prueba de 7 días (una por persona; al terminar sin plan vuelve a Free sin perder datos); IVA incluido; «¿PitchLab me dice a qué apostar?» (no: muestra lo más probable y su cuota justa; la decisión y el monto son tuyos); «¿PitchLab acepta apuestas?» (no); CFDI («[POR CONFIRMAR]»).
- **Cierre** con Radar sobre `--surface-active`: «Información para decidir.» y «Probar Pro 7 días».
- **Móvil:** Pro primero, luego Elite y Free; la comparativa muestra un plan a la vez con un Astryx SegmentedControl Free/Pro/Elite (Pro seleccionado), nunca una tabla ancha.
- **Por confirmar con el fundador antes de publicar:** precio anual, si la prueba desde Planes pide tarjeta y la fecha del CFDI.

## 6. Mapeo de piezas a componentes

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
| Correo, contraseña | HeroUI `TextField` + `Input` + `Label` |
| Fecha de nacimiento | HeroUI `DateField` (o `Select` Día/Mes/Año) |
| Consentimientos | HeroUI `Checkbox` |
| Comparativa de planes (escritorio) | HeroUI `Table` |
| Preguntas de Planes | HeroUI `Accordion` |
| Comparativa de planes (móvil) | Astryx `SegmentedControl` |

## 7. Traducción del lienzo a tokens

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

## 8. Imágenes del lienzo (`/_blob/…`) → archivos del repo

Los `src="/_blob/…"` de `design/canvas/app/` solo existen en el lienzo. Equivalencias:

| Blob | Archivo |
|---|---|
| `847e53db…` / `f3a2fcc2…` | `apps/web/public/brand/logos/r1/pitchlab-horizontal-dark.svg` / `-light.svg` → `BrandLogo variant="horizontal"` |
| `6663a8cb…` / `0adefa1c…` | `…/logos/r1/pitchlab-compact-dark.svg` / `-light.svg` → `BrandLogo variant="compact"` |
| `a1308dc9…` / `29d73fe2…` / `87c91e8a…` | `apps/web/public/brand/mascot/r1/radar.webp` / `nfl.webp` / `soccer.webp` → `Mascot edition="…"` |
| emblemas de ligas y equipos | `apps/web/public/brand/sports/<liga>/<r1|r2>/…` → `TeamBadge` / `LeagueBadge` (nunca rutas a mano) |

## 9. Cómo trabajar y cuándo está terminado

1. Construye los componentes nuevos en `packages/ui/src/app/` y exponlos desde `@pitchlab/ui`.
2. Crea sus stories en Storybook con datos reales de `data/snapshots/*/latest.json`, en tema oscuro y claro (selector «Tema» de la barra).
3. Conecta la ruta `apps/web/app/app/page.tsx` cargando los datos en el servidor, como hace `apps/web/src/server/landing.ts`.
4. Está terminado cuando, sin excepción:
   - cada bloque del §4.2 o del §5 existe con datos reales o marcado como ejemplo;
   - se revisó a 375 y 1440 px en los dos temas, sin scroll horizontal;
   - `pnpm typecheck`, `pnpm test` (incluye el linter de hex) y las E2E afectadas pasan;
   - ninguna regla del §2 se rompió.
