# Prompt · Perfil de usuario nuevo de PitchLab (para Opus en Antigravity)

Copia todo lo que está debajo de la línea.

---

Vas a rehacer el **contenido** del perfil de usuario (`/app/u/[handle]`) tal como está en el lienzo de diseño. Tiene que verse y comportarse igual que el lienzo en escritorio y en móvil, en tema oscuro y claro. **La barra superior y el sidebar del club no se tocan.** Sin cifras escritas a mano para perfiles reales y sin backend nuevo.

## 0. Lee esto antes de escribir código, en este orden

1. `AGENTS.md`, `apps/web/PRODUCT.md`, `docs/design/DESIGN_SYSTEM.md`, `docs/design/UI_LIBRARIES.md`, `docs/design/RESPONSIVE_RULES.md` y `docs/design/INTERACTION_PATTERNS.md`. Carga el skill `dataviz` antes de tocar las gráficas.
2. **El diseño:** `design/canvas/profile/README.md`, luego `Main.dc.html` (escritorio, con Tweaks de pestaña y «perfil propio»), `Mobile.dc.html` y las notas `decisiones` y `brief` de `canvas.json`. Si una nota del lienzo choca con este prompt, manda este prompt.
3. El código actual:
   - `packages/ui/src/platform/club/AnalystProfileClubView.tsx`: el perfil de hoy. Perfiles resueltos a mano, seguidores inventados, ROI y un `openShareTicket` con probabilidad fija.
   - `apps/web/app/app/u/[handle]/page.tsx`: la ruta (no cambia su forma).
   - `packages/ui/src/platform/access-guard.ts`: `journalRecord()` y `formatOddsValue()`.
   - `packages/ui/src/platform/types.ts`: `JournalEntry`, `SocialPost`, `TipstarCreator`.
   - `packages/ui/src/platform/spacetime-catalog.ts`: `TIPSTAR_CREATORS` (perfiles de ejemplo).
   - `packages/ui/src/platform/club/SocialAndTipstarViews.tsx`: `BASE_LEADERBOARD_ROWS` y `rankedAnalysts`, el leaderboard de Comunidad.
   - `packages/ui/src/platform/components/MaestroPrimitives.tsx`: `UserBadges`, `VerifiedBadge`, `TipstarBadge`, `ExampleNotice`.
   - `apps/web/app/pitchlab-v4.css`: `.pl-profile-*` y el vidrio (`.glass-*`).
   - `packages/ui/src/sports.tsx`: `LeagueBadge` y `TeamBadge`.

Antes de editar, escribe un plan corto: qué archivos cambias, qué helpers creas y cómo sacas el puesto del leaderboard sin duplicar lógica.

## 1. Decisiones ya tomadas (no las discutas)

- **El saldo en unidades es público** (decisión del fundador, 11 nov): alimenta el leaderboard de Comunidad. Se llama **«Saldo»**, nunca «ganó», «unidades ganadas» ni «ganancia». Regístralo en `apps/web/PRODUCT.md` y en `docs/execution/PROJECT_STATE.md`.
- **Fuera del perfil:** «Rendimiento», ROI, `roi95Ci`, «IC 95 %», Kelly y «sellado/sellados». Cambia la bio de `socio_pl`, que dice «sellados».
- **El récord son 4 cifras:** Saldo, Cumplidos (X de Y y %), Ventaja contra el cierre y Puesto en Comunidad del mes.
- **Pestañas:** Publicaciones · Picks · Parlays · Estadísticas (en móvil: Posts · Picks · Parlays · Datos).
- **El perfil propio no se sigue a sí mismo:** en lugar de Seguir lleva «Editar perfil» y «Perfil público».
- **El sello de verificado es solo para tipstars verificados.** Un socio lleva la ficha «Socio», sin sello.
- **Los perfiles de ejemplo siguen marcados «Ejemplo»** (`ExampleNotice` en escritorio, línea «Perfil de ejemplo» en móvil).
- **Sin mascota, vidrio falso refinado** y prohibidos `backdrop-filter` y `filter: blur`.

## 2. Qué construir

### 2.1 Datos: helpers puros y probados

Crea `packages/ui/src/platform/profile-stats.ts` con funciones puras y sus pruebas en `packages/ui/tests/`:

- `profileRecord(entries: JournalEntry[])` → `{ settled, won, hitRatePct, netUnits, avgClvPct, open }`. Reutiliza la fórmula de `journalRecord` (ganado: `units × (userDecimal − 1)`; perdido: `−units`) y no la dupliques: haz que `journalRecord` llame a esta.
- `monthlyNetUnits(entries, months = 6)` → `[{ month: "2026-06", label: "Jun", net }]`, por mes de `sealedAt`, con los meses sin picks en 0.
- `hitRateByLeague(entries)` → `[{ leagueLabel, won, settled, pct }]`, ordenado por `settled`.
- `calibrationBuckets(entries)` → rangos 50–60 %, 60–70 % y 70 % o más, usando `p = 1 / fairDecimal`. Devuelve `{ range, expectedMidPct, won, settled, realPct }` y omite los rangos con menos de 5 picks cerrados.
- `pickSettlementUnits(entry)` → saldo de un pick (+/−) o `null` si está abierto.
- **Leaderboard compartido:** saca el orden de `rankedAnalysts` a `rankAnalysts(rows, { window: "30d" | "season", sort: "units" | "clv" })` en este mismo archivo, úsalo en Comunidad sin cambiar lo que se ve ahí, y crea `analystRank(handle, rows)` para el perfil (ventana de 30 días, orden por saldo). Si el usuario no aparece en el leaderboard, la cifra dice «—» con «Aún no aparece» debajo.

**De dónde sale cada perfil:**
- **Propio:** del `journal` de `usePlatform()`.
- **Tipstars de ejemplo:** agrega a `TipstarCreator` los campos `wonCount` y `joinedAt` (ISO) y llénalos en `TIPSTAR_CREATORS` de forma coherente con `settledCount` (Sofía: 84 de 142, marzo de 2026). No inventes nada fuera de los perfiles marcados `isExample`.
- **Perfil ajeno real:** no hay API. Muestra el estado «Este perfil aún no es público» y deja un `TODO(F4)` para `/api/u/[handle]`. No caigas al perfil de Sofía como hace hoy.

### 2.2 Encabezado

- Tarjeta `.glass-lens .glass-ring` con portada de luces (degradados radiales violeta, azul y verde, sin imagen) y avatar de 96 px que monta sobre la portada. En móvil va sin portada: avatar de 84 px centrado con resplandor violeta.
- **Nombre + sello de verificado:** crea `VerifiedSeal` (roseta lila con palomita, SVG, `role="img"` y `aria-label="Verificado"`) y `TipstarVerifiedBadge` (ficha de vidrio lila con el sello pequeño y «Tipstar verificado»: degradado lila, borde de 1 px, brillo interior y resplandor suave). Ponlos en `MaestroPrimitives.tsx` con stories en oscuro y claro. No cambies `VerifiedBadge` en el resto de la app en esta tarea.
- `@handle · especialidad`, bio (en móvil, una línea), seguidores · siguiendo, **«Se unió en {mes año}»** con ícono de calendario (de `joinedAt`; si no se conoce, la línea no aparece) y las ligas favoritas con `LeagueBadge`.
- **Acciones:**
  - Ajeno: «Seguir» (primario blanco) ↔ «Siguiendo» (secundario), con `aria-pressed`; **empieza en «Seguir»** (hoy empieza en «Siguiendo»).
  - Propio: «Perfil público» y «Editar perfil», ambos a `/app/account` por ahora.
  - Compartir: botón de 44 px con `aria-label`. Usa `openShareTicket({ kind: "tipstar", … })` con el récord real; si ese tipo no admite los campos, comparte la URL del perfil con `navigator.share` o copia al portapapeles. Nada de probabilidades fijas.

### 2.3 Récord

- **Escritorio:** una sola tira `.glass-lens .glass-ring` con 4 celdas separadas por líneas de 1 px:
  - Saldo en `--pl-success` si es positivo o `--pl-danger` si es negativo, con «N picks cerrados» debajo;
  - Cumplidos «84 de 142» con «59 % de acierto»;
  - Ventaja contra el cierre con «Tomó mejor momio que el de cierre»;
  - Puesto «#3» con el enlace «{Mes} · ver tabla» a `/app/social`.
  - A 860 px o menos pasa a 2×2.
- **Móvil:** tira de 3 cifras (Saldo, Cumplidos %, Contra el cierre) y una fila enlace «#3 en Comunidad · {mes} · 84 de 142 ›».
- Sin picks cerrados: «Sin picks cerrados todavía» en lugar de las cifras, y en el perfil propio un botón «Registra tu primer pick» a `/app`.

### 2.4 Tipstar: pick gratis de la semana

Solo si `isTipstar`: tarjeta (en escritorio) o fila (en móvil) con «Pick gratis de la semana», el partido y el código, que enlaza a `/p/{weeklyPickSlug}`.

### 2.5 Pestañas

- Patrón de pestañas WAI-ARIA completo: `role="tablist"`, `tab` con `aria-selected` y `aria-controls`, `tabpanel` con `aria-labelledby`, flechas izquierda y derecha, Inicio y Fin. Subrayadas, como en el lienzo.
- La pestaña activa vive en `?tab=` para poder compartir el enlace. La de inicio es **Picks**.
- **Publicaciones:** `SocialPost` del autor, con el pick adjunto en una ficha (equipos, mercado y unidades, «momio vs justo» y estado), me gusta y comentarios con sus acciones actuales. El ícono de me gusta es SVG, no un carácter.
- **Picks** (`JournalEntry` cuyo `origin` no es «Parlay Combinado»):
  - Filtros: Todos / Abiertos · N / Cerrados · N y liga. En móvil van detrás de un botón «Filtrar».
  - Secciones «Abiertos» y «Cerrados». Cada fila lleva:
    - emblemas (escritorio) o logo de la liga (móvil);
    - el pick;
    - el partido, con el marcador si ya terminó;
    - «registrado N días/horas antes»: compara `sealedAt` con el inicio del partido en el dataset (`gameId`); si no hay inicio, omítelo;
    - su momio contra el justo (`formatOddsValue` en el formato elegido);
    - las unidades y el estado.
  - Estado: punto verde «Cumplido», punto rojo «No se cumplió» o círculo vacío «Abierto», siempre con texto, nunca solo color. Los cerrados muestran su saldo (+/−u).
  - **Visitante:** los abiertos se ven bloqueados («Disponible para socios» + «Desbloquear» a `/signup`); los cerrados, completos.
  - Muestra 5 por sección y «Ver los N picks» que expande de 20 en 20.
- **Parlays** (`origin === "Parlay Combinado"`): una tarjeta por boleto con sus piernas (si el journal solo trae `pickLabel`, sepáralo por « + » o «·»), la probabilidad combinada (`1 / fairDecimal`), el estado y el saldo. Si no se pueden separar las piernas, muestra `pickLabel` completo y anótalo como pendiente.
- **Estadísticas** (si hay al menos 10 picks cerrados; si no, «Las estadísticas aparecen con 10 picks cerrados»):
  - **Saldo por mes:** barras con base en cero, verde arriba y rojo abajo, etiqueta en cada barra, sin eje doble, con `title` por barra y una tabla oculta para lectores de pantalla.
  - **Cumplidos por liga:** barras horizontales en `--pl-brand` con «% · X de Y».
  - **«Cuando dijo X %, ¿se cumplió?»:** barra con lo real y una marca de 2 px en lo esperado, con la nota «La raya marca lo esperado (punto medio del rango)».

### 2.6 Responsive

- Escritorio: contenido de máx. 1040 px dentro del shell.
- Por debajo de 640 px se usa el diseño móvil del lienzo: identidad centrada, tira de 3 cifras, pestañas con nombres cortos y filas sin fichas.
- Sin scroll horizontal de 320 a 1440 px.

## 3. Reglas de implementación

- **Solo tokens `--pl-*`.** Cero hex fuera de `packages/tokens`. Los degradados del avatar usan los `--avatar-grad-*` que ya existen.
- **Componentes existentes primero:** `LeagueBadge`, `TeamBadge`, `ExampleNotice`, `MaestroIcon`, `ClubWorkspaceShell` (sin cambios), botones de `@pitchlab/ui`.
- **Accesibilidad WCAG 2.2 AA:** un `h1` (el nombre), un `h2` por sección, objetivos de 44 px, contraste 4.5:1 en textos de 11–13 px (incluido «Abierto» en `--pl-text-secondary`) y foco visible con `--pl-brand`.
- **Rendimiento:** listas paginadas (sin pintar cientos de filas) y cálculos en `useMemo` sobre los helpers puros. Sin dependencias nuevas.
- **Movimiento:** solo la entrada suave del panel al cambiar de pestaña; nada con `prefers-reduced-motion`.
- No toques el header, el sidebar, la landing, el login ni el registro.

## 4. Verificación (obligatoria antes de decir que terminaste)

1. `pnpm typecheck`, `pnpm lint` y `pnpm test`, en verde, incluidas las pruebas nuevas de `profile-stats.ts`:
   - saldo de ganado/perdido/abierto;
   - meses vacíos;
   - rangos con menos de 5 picks;
   - el orden del leaderboard igual al de antes.
2. `pnpm --filter @pitchlab/web build` y `pnpm e2e`, todo en verde. Agrega a la prueba 3, después de entrar con el PIN:
   - visitar `/app/u/sofia_nfl`;
   - comprobar «Tipstar verificado» y «Saldo»;
   - cambiar a «Estadísticas» con el teclado;
   - pasar axe (WCAG 2 A y AA) sin violaciones.
3. **Capturas** de `/app/u/sofia_nfl` (las 4 pestañas) y de tu propio perfil (`/app/u/{tu handle}`, con y sin picks), comparadas con el lienzo: 1440×900 y 1280×720 en escritorio, 375×667 y 390×844 en móvil, en tema oscuro y claro.
4. A mano:
   - Seguir/Siguiendo;
   - compartir;
   - filtros;
   - «Ver los N picks»;
   - `?tab=parlays` en la URL;
   - visitante con picks bloqueados;
   - perfil propio sin picks;
   - handle que no existe («Este perfil aún no es público»).
5. `grep` en lo que tocaste: «ganad», «Rendimiento», «ROI», «IC 95», «Kelly», «sellad», `backdrop-filter`, `filter: blur`.
6. Agrega la entrada **PROFILE-2** a `docs/execution/PROJECT_STATE.md` con qué cambió, la decisión de saldo público y lo pendiente.

## 5. Terminado significa

- El perfil igual al lienzo en los cuatro tamaños y los dos temas, con cifras calculadas y el puesto sacado del mismo cálculo que Comunidad.
- Pruebas y E2E en verde.
- **No hagas commit ni push.** Entrega un resumen con capturas y archivos tocados, y deja señalados estos pendientes para el fundador:
  - API pública de perfiles (`/api/u/[handle]`) para ver perfiles ajenos reales.
  - Guardar el momio de cierre en el journal, para mostrar «cerró −120» en los picks cerrados.
  - Guardar las piernas del parlay como lista, no como texto.
  - Pantallas de «Editar perfil» y «Privacidad».
