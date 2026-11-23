# ADR-062 · Ficha de Partido (`P2`), Inicio (`P1`), Picks de Jugadores, Alineaciones, Enfrentamientos, Lesiones y Bordes Nativos

- **Estado:** Aceptada
- **Fecha:** 2026-11-22
- **Rama origen:** `gemini-dos`
- **Relacionadas:** `ADR-027`/`ADR-049` (Spacetime Suite v5.1), `ADR-054`/`ADR-055` (Catálogo de `34` familias, Bzzoiro Unlimited y `Cero-Fuga`), `ADR-056` (*Constraint-First*, *ratchet* y *Error-Driven Correction*), `ADR-058`/`ADR-059`/`ADR-060` (Frontera Zona Protegida, Maestro-Detalle en `/app`, anti-slop y WCAG 2.5.3), `ADR-061` (Anti-EV misma-casa y cierre `ADR-057`).

---

## Contexto

Con autorización explícita del fundador (`2026-11-22 · Q1–Q6`) para evolucionar **`P1` (`/app` Inicio)** y **`P2` (Ficha de Partido · Match Studio)** preservando **`P3` (Páginas de Equipo) intocable en `ZONA PROTEGIDA`**, se atendieron seis deficiencias estructurales y visuales detectadas en inspección directa del producto:

1. **Solapamiento en esquinas de tarjetas `.glass-ring`:** los pseudo-elementos enmascarados con `mask-composite: exclude` / `-webkit-mask-composite: xor` producían trazos dobles y esquinas desalineadas respecto al `border-radius` nativo del contenedor en tarjetas, barras flotantes y héroes.
2. **Jerarquía de Picks en `/app` y Ficha de Partido:** las fichas abrían en `Resumen` en lugar de `Picks`; además, selecciones de baja cuota (`double_chance` o `< 1.45`) desplazaban mercados de valor jugables (`1.55–2.60`) y faltaban picks de jugadores integrados dentro del flujo principal del partido.
3. **Paneles profundos separados para Alineaciones, Enfrentamientos y Lesiones:** las bajas compartían contenedor con clasificación, faltaba una cancha interactiva por jugador en `Alineaciones` y faltaba una vista dedicada de rankings `Ataque`/`Defensa` e historial H2H con selector de competición/sede.
4. **Héroe prepartido y filas `/app`:** las filas prepartido mostraban totales decimales poco informativos en lugar de la racha reciente (`Últimos 5`), y el héroe prepartido requería hora local de inicio, etiqueta clara (`Goles esperados` / `Puntos esperados` / `Carreras esperadas`) y árbitro visible.
5. **Riesgos multi-deporte y `Cero-Fuga` / `FD-16` en enriquecimiento nuevo (`+6,998` líneas):** el servidor debía impedir fugas de campos de visitante (`adjusted_offense`/`adjusted_defense`), nombres de proveedores bloqueados (`FD-16`, p. ej. Betfair), alineaciones de fútbol sobre deportes US (`basketball`, `american-football`, `ice-hockey`, `baseball`), EV alucinado en player picks (`> 18 %` sharp / `> 22 %` soft), props de fútbol con muestra `< 45` minutos, y ocultamiento accidental de picks `FT` liquidados en `<details>`.
6. **Ergonomía móvil (`<= 375 px` / `320 px`) y contraste WCAG 2.1 AA:** botones del subselector y controles profundos medían `< 44 px` en móvil, la tabla de rankings en `320 px` necesitaba distribución fija legítima, y `.pl-mkt-top-pill` / `.locked-redact` presentaban contraste inferior a `4.5:1` bajo `AxeBuilder` (`4.4:1` en claro y `3.58:1` en tarjeta oscura).

---

## Decisión

### 1. Bordes nativos de un solo trazo en `.glass-ring` y regla permanente `no-masked-ring-border-slop`

- **CSS sin máscaras solapadas (`d2d7108c`):** se eliminan los pseudo-elementos de borde enmascarados con `mask-composite` en `apps/web/app/pitchlab-v4.css` y `apps/web/app/precio-motion.css`, sustituyéndolos por borde nativo de un solo trazo alineado al radio de cada superficie.
- **Barrera *Error-Driven Correction* (`scripts/lint-codebase.mjs`):** se incorpora la regla permanente sin baseline `no-masked-ring-border-slop`, probada en `scripts/tests/lint-codebase.test.mjs`, que bloquea `mask-composite` / `-webkit-mask-composite` en pseudo-elementos de borde (`::before`/`::after`) en hojas CSS.

### 2. Jerarquía de `Picks` jugables, preservación en `FT`, héroe prepartido y racha L5 (`P1` y `P2`)

- **Ranking jugable y preservación de liquidados (`2d6228ef`, `228079e3`):** `packages/ui/src/platform/pick-quality-ranker.ts` define `PLAYABLE_ODDS_MIN = 1.55`, `PLAYABLE_ODDS_MAX = 2.60`, `CONSERVATIVE_MAX_ODDS = 1.45`, `scorePlayablePick`, `selectHeadlineMatchPick` y `partitionPlayableAndConservative(picks, options?: { preserveAll?: boolean })`. En `MatchPicksEvidenceBoard.tsx` y `HomeMatchDetailPanel.tsx`, los picks con `game.status === "FT"` pasan `{ preserveAll: true }` para no ocultar jamás selecciones liquidadas bajo `<details>`.
- **Match Studio (`MatchTabs.tsx`, `match-tab.ts`, `MatchHeroAndRail.tsx`):** `Picks` pasa a ser la pestaña inicial (`default`), seguida de `Resumen`, `Enfrentamientos`, `Alineaciones` (cuando el contrato de la liga lo soporta), `Lesiones`, `Análisis IA`, `Números` y `¿Dónde está el dinero?`. El héroe prepartido muestra hora de inicio local, proyección legible por deporte (`Goles esperados`, `Puntos esperados` o `Carreras esperadas`) y árbitro oficial saneado; las vistas de rail muestran copy específico para NBA/NFL/NHL/MLB cuando no hay marcador activo.
- **`P1 · /app` (`AstroMatchRow.tsx`, `HomeMatchDetailPanel.tsx`, `HomeClubView.tsx`):** las filas prepartido exhiben guiones L5 (`[data-row-form-dashes]`), y el panel Maestro-Detalle de escritorio separa `Clasificación` y `Lesiones` como pestañas independientes, alimentado por `GET /api/games/[gameId]/preview` (`401` sin sesión / payload completo autenticado) mientras el shell inicial SSR permanece acotado (`<= 480 KB`) vía `loadInitialShellDatasetForAccess` en `apps/web/src/server/platform-data.ts`.

### 3. Cuatro paneles profundos reutilizables (`match-deep-panels.css`)

- **Componentes desacoplados (`packages/ui/src/platform/club/match/`):**
  - `MatchPlayerPicksBoard.tsx`: subselector `Equipo | Jugadores` dentro de `Picks`, filtros por dirección/métrica/equipo, resumen L5/L10/L20, enlace al perfil `/app/[league]/t/[teamSlug]/p/[playerSlug]`, acciones `+ Parlay` / `Sellar` y máscara `Cero-Fuga` cuando `allowFull === false`. Integrado también en `#player-picks` de `PlayerProfileClubView.tsx`.
  - `MatchLineupsPanel.tsx`: solo en fútbol (`sport === "football"`), sobre `AtomicLineupPitch` en proporción vertical `320/380` con cambio de métrica visual (`rendimiento`, `edad`, `estatura`, `nacionalidad`) y cajón/panel lateral interactivo de jugador.
  - `MatchEnfrentamientosPanel.tsx`: tabla comparativa `Ataque` / `Defensa` con ranking en la liga (oculta a visitantes si falta `allowFull`) e historial H2H / últimos partidos filtrable por sede y misma competición.
  - `MatchInjuriesPanel.tsx`: pestaña dedicada de bajas y dudas por equipo.
- **Hoja CSS modular por ruta (`apps/web/app/match-deep-panels.css`):** envuelta en `@layer components`, cargada únicamente en `/app/page.tsx`, `/app/[league]/g/[gameSlug]/page.tsx`, `/app/[league]/t/[teamSlug]/p/[playerSlug]/page.tsx` y `packages/ui/.storybook/preview.ts`, con objetivos táctiles `>= 44 px` en móvil (`<= 768 px` / `pointer: coarse`) y tabla H2H fija para `320 px`.

### 4. Endurecimiento multi-deporte, `Cero-Fuga` / `FD-16` y contraste WCAG 2.1 AA

- **Enriquecimiento seguro en servidor (`apps/web/src/server/match-enrichment.ts`):**
  - `buildEnrichedMatchLineups` retorna `null` cuando `game.sport !== "football"`.
  - `buildMatchPlayerPicks` valida etiquetas públicas con `isSafePublicLabel`, filtra casas de apuesta con `isPermittedMarketQuoteBook`, impone topes Anti-EV (`MAX_PLAYER_SHARP_EV_PCT = 18` / `MAX_PLAYER_SOFT_EV_PCT = 22`), exige muestra de fútbol `>= 45` minutos, unidades numéricas explícitas (`Goles`, `Puntos`, `Carreras`, etc.) y probabilidades finitas.
  - `buildMatchEnfrentamientos` omite `adjusted_offense` y `adjusted_defense` cuando `allowFull === false`.
- **Contraste WCAG 2.1 AA (`2ef269b0`, `apps/web/app/pitchlab-v4.css`):** `.pl-mkt-top-pill` adopta `var(--pl-pill-brand-bg)` y `var(--pl-pill-brand-fg)` (cumpliendo `>= 4.5:1` en tema claro dentro de filas resaltadas), y `.locked-redact` ajusta `opacity` a `0.72` conservando `filter: blur(6px)` para cumplir `>= 4.5:1` sobre `.share-ticket-card` oscura y superficies claras.

---

## Alternativas descartadas

1. **Mantener pseudo-elementos enmascarados con ajustes de `inset` por breakpoint en `.glass-ring`:** descartado porque los subpíxeles en escalados HiDPI y contenedores con `overflow` seguían produciendo solapamiento en esquinas redondeadas; los bordes nativos eliminan la clase de defecto de raíz y quedan resguardados por `no-masked-ring-border-slop`.
2. **Generar alineaciones sintéticas o mostrar métricas `adjusted_*` de enriquecimiento en vista de visitante:** descartado porque viola `Cero-Fuga` (`ADR-055`) e introduce alucinación estructural en deportes US donde el campo de fútbol `11 vs 11` no aplica.
3. **Ocultar `.pl-mkt-top-pill` o usar colores literales `#hex` en `pitchlab-v4.css` para resolver `AxeBuilder`:** descartado por violar el sistema de tokens `@pitchlab/tokens` y la regla estática `no-hex-outside-tokens`.

---

## Consecuencias

- **Positivas:** cierre completo de Q1–Q6 en `/app` y `/app/[league]/g/[gameSlug]` manteniendo `P3` intocable; `0` solapamientos de esquinas en `.glass-ring`; picks jugables priorizados sin ocultar liquidados `FT`; separación limpia `Equipo | Jugadores`, `Alineaciones`, `Enfrentamientos` y `Lesiones`; blindaje `Cero-Fuga` / `FD-16` / Anti-EV multi-deporte y cumplimiento WCAG 2.1 AA + objetivos táctiles `>= 44 px` hasta `320 px`.
- **Compromisos:** toda evolución futura de paneles profundos debe mantener las `4` familias de tests (unitarias, propiedades `fast-check`, Storybook en claro/oscuro/vacío/visitante y E2E Playwright) y respetar la hoja modular `match-deep-panels.css` exclusivamente en sus `3` rutas.

---

## Validación y métricas verificadas

- **Unitarias y propiedades:** `packages/ui/tests/pick-quality-ranker.test.ts` (propiedades `fast-check` sobre conservación de `FT` y prioridad jugable) y `apps/web/tests/match-enrichment.test.ts` (blindaje `Cero-Fuga`, `FD-16`, Betfair bloqueado, tope sharp `> 18 %`, mínimo `45 min` fútbol, unidades NBA/NHL/MLB, `lineups === null` fuera de fútbol y shell visitante/socio `<= 480 KB`).
- **Auditoría visual multi-deporte en Chromium (`127.0.0.1:6420`):** fútbol (`liga-mx`), `nba`, `nfl` y `nhl` en `1440×900`, `768×1024`, `375×812` y `320×640` en oscuro/claro (`0 px` overflow, `0` botones `< 44 px` móvil, `0` máscaras en `.glass-ring`, `CLS <= 0.0182`).
- **E2E y Storybook:** `apps/web/e2e/adr062-q1q6-match-polish.spec.ts`, alineación de `antes-del-partido.spec.ts` / `salud-de-datos.spec.ts`, contraste WCAG AA verde en `nba-nhl.spec.ts` y `pre-mvp.spec.ts`, y `packages/ui/src/platform/club/match/MatchDeepPanels.stories.tsx` cubriendo NBA claro/oscuro, visitante `allowFull={false}` y estados vacíos.
