# ADR-055 · Catálogo de Picks de 34 Familias, Bzzoiro Unlimited, UI Atómica Sofascore, Retiro de `@base-ui/react` y Blindaje Cero-Fuga

- **Estado:** Aceptada
- **Fecha:** 2026-11-20
- **Rama origen:** `gemini-dos`
- **Relacionadas:** `ADR-019` (shadcn/ui y retiro de Base UI), `ADR-021`/`ADR-025` (Frontera `Cero-Fuga`), `ADR-035` (Vidrio falso y recorte RSC), `ADR-041`/`ADR-043`/`ADR-045` (Bzzoiro Fase 1, 57 ligas, árbitros y paridad US), `ADR-048`/`ADR-049` (Screener, rigor arbitral y Spacetime Suite v5.1), `ADR-050` (Portabilidad sin lock-in), `ADR-051` (Server-First, CSS modular y Cero-Jank), `ADR-052`/`ADR-053`/`ADR-054` (Experiencia móvil app nativa, shell RSC progresivo, diseño plano editorial y política dual).

---

## Contexto

Tras cerrar el pulido nativo editorial y la arquitectura *Server-First* (`ADR-051`–`ADR-054`), el salto hacia un producto de analítica deportiva líder en México y LATAM enfrentaba cinco retos estructurales que exigían una decisión arquitectónica coordinada:

1. **Amplitud y rigor auditable del catálogo de picks:** los referentes comerciales (ScoutPicks, Astra) combinan cobertura amplia de mercados con defectos graves de modelado y transparencia: tasas de acierto ingenuas sin calibración ni `xG`, ocultamiento de picks cuando el partido finaliza (`FT`), ausencia de remoción de margen (`de-vig`) y valor esperado (`EV+`), sesgos estáticos en córners/tarjetas y fugas de metadatos de proveedor (`FD-16`). PitchLab requería un catálogo propio multi-deporte que uniera amplitud de mercados con calibración Spacetime v5.1 y liquidación auditable permanente.
2. **Aprovechamiento real de Bzzoiro Unlimited (`BZZOIRO_UNLIMITED=1`) bajo Licencia v4.0 y `FD-16`:** el plan comercial ilimitado habilita shotmaps con `xG`, posiciones medias, comparativa multi-casa MX/US/sharp con dirección de mercado, mercados extendidos, árbitros, alineaciones confirmadas/probables, disponibilidad/bajas, H2H, transmisiones TV MX y NBA `/basketball/api/v2/`. Faltaban parsers normalizados, puentes servidor y guardias `FD-16` que garantizaran que ninguna cuota se redistribuya sin análisis propio de PitchLab ni exponga IDs o URLs de proveedor.
3. **Librería atómica plana estilo Sofascore, Screener accionable y ergonomía Desktop/Mobile:** `HomeClubView.tsx` había crecido hasta `3,176` líneas monolíticas; la ficha de partido y `/app/picks` carecían de una librería atómica reutilizable de visualización táctica/estadística y de un Screener editorial con Bet Builder SGP 1-clic respaldado por CSS modular aislado del bundle global.
4. **Deuda headless, presupuesto del shell RSC y cierre de hallazgos de seguridad:** quedaban 5 wrappers residuales sobre `@base-ui/react` (hoja de ruta abierta en `ADR-053`), los nuevos campos enriquecidos de Bzzoiro amenazaban con superar el techo `< 500 KB` del shell RSC inicial y la auditoría adversarial previa a integración detectó brechas concretas de `Cero-Fuga` y endurecimiento en `/app/props`, navegación cliente con pase vencido (`ExpiredPassGate`), `x12` en visitantes, `Cache-Control` en `/api/shell/extend`, `inPlayWinProb` en `/api/live/games/[gameId]`, CSRF/pase en `/api/parlays/sgp`, sesión/allowlist de ligas en `/api/compare` y `/api/news/article`, y auto-desregistro de `sw.js` en loopback.
5. **SEO y crecimiento orgánico MX/LATAM limpio `FD-16`:** faltaban guías educativas clave en español de México sobre *fair odds* y mercados avanzados, marcado `SportsEvent` consciente del ciclo de vida del partido y sanitización estricta `FD-16` en el sitemap público.

---

## Decisión

### 1. Catálogo propio de 34 familias de mercados, motor de evidencia y Bet Builder SGP

Se crea el módulo puro, tipado y determinista `@pitchlab/ui/picks-catalog` (`packages/ui/src/platform/picks-catalog/{catalog-types,market-families,evidence-engine,bet-builder-math,index}.ts`) junto con su adaptador de servidor `Cero-Fuga` (`apps/web/src/server/picks-catalog.ts`):

- **34 familias de mercado (`MARKET_FAMILY_COUNT = 34`):**
  - **Fútbol (20 familias):** `1x2`, `double_chance`, `dnb`, `btts`, `totals` (`0.5`–`4.5`), `team_totals` (Local/Visita), `half_time_result`, `second_half_result`, `combo_1x2_over`, `combo_1x2_btts`, `asian_handicap` (`-2.5..+2.5` con `push` condicional exacto), `clean_sheet`, `win_to_nil`, `corners_total` (Binomial Negativa condicionada a `game-state`), `corners_team`, `shots_total`, `shots_on_target`, `fouls_total`, `cards_total` (ajuste bayesiano Empirical Bayes `κ = 15` por rigor arbitral) y `player_props_football` (`shots`, `shots_on_target`, `goal_or_assist`, `fouls`, `cards` con guardia estricta `FOOTBALL_PROP_MIN_MINUTES = 45`, `lineupStatus: confirmed | probable | unknown` y exclusión automática de bajas).
  - **Deportes US (14 familias):**
    - **NBA (4):** `nba_moneyline`, `nba_spread`, `nba_totals`, `nba_player_props` (`PTS`, `REB`, `AST`, `3PM` con guardia `NBA_PROP_DEFAULT_MIN_MINUTES = 18`).
    - **MLB (4):** `mlb_moneyline`, `mlb_run_line`, `mlb_f5` (3 vías + total F5), `mlb_totals` (Binomial Negativa `r = 5.5` + extra innings sin truncamiento).
    - **NHL (3):** `nhl_moneyline`, `nhl_puck_line` (con ajuste `empty-net`), `nhl_totals` (conservación OT/SO).
    - **NFL (3):** `nfl_moneyline`, `nfl_spread` (núcleo discreto en números clave `±3 / ±7`), `nfl_totals`.
- **Motor financiero y de evidencia calibrada (`evidence-engine.ts`):**
  - `computeProportionalDeVig`, `computeShinDeVig` y `computeAdaptiveDeVig` (aplica Shin cuando el overround `>= 3.5 %` y proporcional en casas *sharp*), `fairOdds = 1 / p`, `evPct = (p * marketDecimal - 1) * 100`, `edgePts`, `noVigEdgePts` y etiqueta limpia `Valor +X.X %`.
  - Evidencia real multi-ventana (`L5`, `L10`, `L20`, `Local/Visita`, `H2H`) + señal `xG` (`resolveXgEvidenceSignal`) + rigor arbitral (`resolveRefereeEvidenceSignal`) estrictamente derivada de registros reales del partido. La frecuencia observada nunca reemplaza a la probabilidad calibrada `p` de Spacetime v5.1 ni fabrica cifras ausentes.
- **Liquidación auditable de partidos finalizados (`gradeCatalogPick`):** todo pick en partido `FT` conserva su estado verificable (`hit | miss | push | pending`). **Se prohíbe ocultar o borrar picks de partidos finalizados.**
- **Bet Builder SGP (`bet-builder-math.ts`):** matriz explícita de compatibilidad y bloqueo de conflictos (`logical_contradiction`, `same_axis_redundant`, `multi_leg_contradiction`, `exact_score_lock`, `duplicate`, `sgp_limit`, `finished`, `live`, `redacted`), matriz de correlación empírica por eje y dirección (`ρ ∈ [-0.65, +0.65]`) para los 5 deportes, probabilidad conjunta ajustada por Cópula Gaussiana exacta (cuadratura de Gauss-Legendre de 12 puntos acotada por Fréchet-Hoeffding) y alertas de margen oculto SGP (`excessive_sgp_hold`).
- **Frontera `Cero-Fuga` en servidor (`apps/web/src/server/picks-catalog.ts`):** `buildServerMatchPicksCatalog` y `buildServerMatchPicksCatalogsBatch` ejecutan `redactCatalogPickForVisitor` sobre selecciones reservadas en partidos `NS`/`LIVE` cuando `fullAccess === false` (eliminando probabilidad, cuotas justa/casa, `EV+`, ventaja, lado, línea, evidencia interna y metadatos de jugador, salvo picks promocionales abiertos), compactan el payload por familia (`compactCatalogPayload`) para proteger el presupuesto RSC y mantienen íntegros y auditables todos los partidos `FT`.

### 2. Aprovechamiento integral de Bzzoiro Unlimited (Licencia v4.0 + `FD-16`)

Se amplían los adaptadores de ingesta y los puentes de servidor bajo `BZZOIRO_UNLIMITED=1` con normalización estricta libre de IDs crudos de proveedor, claves y URLs externas (`FD-16`, validado por auditoría recursiva en `services/ingest/tests/bzzoiro-unlimited.test.ts`):

- **Shotmap/xG y Posiciones Medias (`services/ingest/src/providers/bzzoiro-live.ts`, `bzzoiro-enrichment.ts`, `bzzoiro.ts`):** `parseBzzoiroShotmap`, `parseBzzoiroAveragePositions`, `extractBzzoiroMatchTelemetry`, `fetchBzzoiroMatchTelemetry` y `sanitizeClientText` sobre `/events/{id}/stats/` y `/events/{id}/player-stats/` emiten `NormalizedShot` (`x`/`y` en `0..100`, `minute`, `xg`, `outcome: goal|saved|blocked|miss|post`, `side`, `bodyPart`, `xgTimeline`) y `NormalizedTeamAveragePositions` (`x`/`y`, dorsal, posición, toques y rating) sin filtrar `externalId` ni URLs.
- **Multi-casa MX, dirección de línea y mercados extendidos (`services/ingest/src/odds/bzzoiro-odds.ts`, `apps/web/src/server/book-quotes.ts`, `bzzoiro-expansion-cli.ts`):** consume `/api/v2/odds/best/`, `/events/{id}/odds/comparison/` y `/api/v2/odds/` para casas prioritarias MX/US/sharp (`Pinnacle`, `Bet365`, `Codere`, `Betcris`, `Caliente`, `DraftKings`, `FanDuel`, `BetMGM`) y 9 grupos extendidos (`1x2`, `over_under`, `btts`, `total_corners`, `asian_handicap`, `double_chance`, `draw_no_bet`, `clean_sheet`, `win_to_nil`), clasificando el movimiento desde apertura en `STEAM` / `SHORTENING` / `DRIFTING` / `STABLE` (`classifyLineMovement`).
- **Cumplimiento estricto de Licencia Bzzoiro v4.0:** toda cuota o comparativa multi-casa (`fetchBestOddsAnalyzed`, `fetchEventOddsComparisonAnalyzed`, `buildMarketRowComparison`, `OddsCompareView`) se ancla obligatoriamente a la probabilidad calibrada Spacetime v5.1, `fairOdds (1/p)`, `edgePts` y `evPct`; queda prohibido redistribuir feeds crudos de momios.
- **Prepartido fútbol y NBA `/basketball/api/v2/` (`bzzoiro-enrichment.ts`, `bzzoiro-nba-rich.ts`, `apps/web/src/server/player-live-stats.ts`):**
  - **Fútbol:** perfil arbitral con encogimiento bayesiano (`parseBzzoiroRefereeProfile`), alineaciones `confirmed | probable | unavailable` (`parseBzzoiroLineupNormalized`, sin mostrar `Confianza N` en UI y respetando la guardia `minMinutes >= 45` en player props), bajas reales (`parseBzzoiroEventAvailability`), historial `H2H` (`parseBzzoiroH2h`) y canales TV MX deduplicados y sin URLs (`parseBroadcastsMx` sobre `/events/{id}/broadcasts/?country_code=MX`).
  - **NBA (`/basketball/api/v2/`):** `standings`, `box-score`/`team-stats`, `odds` multi-casa con movimiento, `pregame` (árbitros, descanso, B2B y bajas reales) y `players/{id}/games/` con `buildGuardedNbaPlayerPropSeeds` (`PTS`/`REB`/`AST`/`3PM`, guardia `DEFAULT_NBA_PROP_MIN_MINUTES = 18` y exclusión de jugadores `Out`/`Injured`/`Baja`).

### 3. UI Atómica estilo Sofascore, Screener de Picks y CSS modular

- **Librería Atómica `@pitchlab/ui/atomic` (`packages/ui/src/platform/atomic/`, 7 componentes):** 100 % sobre tokens `--pl-*`, tema oscuro y claro, cifras tabulares `.num`, `0` colores hex literales, `0` `backdrop-filter` y `0` animaciones de `box-shadow`:
  1. `AtomicShotmapPitch` — cancha SVG (completa/media), círculos escalados por `computeShotRadius(xg)`, diferenciación redundante por forma/color (`goal`/`on_target`/`blocked`/`miss`/`post`), filtros y tabla `<details>` accesible.
  2. `AtomicAveragePositionsPitch` — cancha vertical `0..100` con relajación determinista anticolisión (`resolveAveragePositionCollisions`), dorsal, abreviatura, escala por toques, línea de bloque medio y tabla `<details>`.
  3. `AtomicLineupPitch` — cancha táctica `confirmed`/`probable` (sin `Confianza N`), dorsales, rating por nivel, eventos `<SportEventIcon />` y layout `@container (min-width: 620px)` (pestañas en `375 px`, doble cancha en `1440 px`).
  4. `AtomicStatComparisonBar` — barra plana reutilizable apoyada en `computeStatBarWidths` con soporte a métricas negativas (`data-negative="true"`, p. ej. `Goles evitados -0.54 vs -0.44`).
  5. `AtomicFormStrip` — tira compacta `G/E/P` (fútbol) y `W/L/T` (deportes US) con `role="img"` y contraste AA.
  6. `AtomicOddsChip` — `Momio justo`, cuota de casa opcional, indicador direccional (`STEAM` / `↓` / `↑` vía `resolveOddsMovement`) y `Valor +X.X %`.
  7. `AtomicMatchHeaderBar` — barra compacta single-row (`< 56 px`, sin `backdrop-filter`) con escudos, marcador/reloj, tarjetas rojas y evento reciente.
  - Conectados en `LiveMatchCenter.tsx`, `live-charts.tsx`, `MatchHeroAndRail.tsx`, `MatchNumbersPanel.tsx` y `LiveWinProbBar.tsx` (sin fabricar datos cuando faltan telemetría o alineaciones).
- **Screener de Picks `@pitchlab/ui/picks-components` (`packages/ui/src/platform/club/picks/`, 5 componentes) y vistas actualizadas:**
  1. `NonLinearOddsSlider` — rango de momios no lineal (`1.10..10.00+` o formato americano) con presets rápidos y controles nativos `>= 44 px` compatibles con Safari.
  2. `SavedViewsBar` — gestión de vistas guardadas con toast reversible `Deshacer` (política dual `ADR-054`) e input anti-zoom (`>= 16 px` móvil).
  3. `BetBuilderDrawer` (+ `BetBuilderQuickButton`) — `<dialog>` nativo (`showModal()`, `closedby="any"` + fallback pointer Safari, `useSheetSwipeDismiss` con guardia `scrollTop === 0` en móvil, cajón lateral en escritorio) conectado a `useParlayState`/`usePlatformActions` con diagnóstico de conflictos SGP y alta 1-clic.
  4. `BookmakerComparePill` — `Momio justo` frente a mejor casa preferida, `Valor +X.X %`, dirección `STEAM`/`SHORTENING`/`DRIFTING`, comparativa multi-casa y sello `<time dateTime=...>`.
  5. `EvidenceWindowPills` — píldoras verificables `L5 / L10 / L20 / H2H` + `xG` + rigor arbitral.
  - Integrados en `PicksFinderView.tsx` (modos `Por partido` / `Por mercado` / `Lista plana`, ordenación por `EV+` / probabilidad / movimiento / hora, selector de 7 casas MX/US/sharp, conmutador `Próximos / En vivo` con pausa por `visibilitychange`, filtro multi-deporte y bottom sheet móvil), `MatchPicksEvidenceBoard.tsx` y `MatchMarketsGrid.tsx`.
- **CSS modular en `@layer components` (fuera de `globals.css`, todas registradas en `packages/ui/.storybook/preview.ts`):**
  - `apps/web/app/picks-screener.css` (`39.5 KB`) — importada solo en `apps/web/app/app/picks/page.tsx` y `apps/web/app/app/[league]/g/[gameSlug]/page.tsx`.
  - `apps/web/app/atomic-kit.css` (`27.0 KB`) — importada solo en `apps/web/app/app/[league]/g/[gameSlug]/page.tsx`.
  - `apps/web/app/shell-ergonomics.css` (`13.6 KB`) — importada en `apps/web/app/app/layout.tsx`.

### 4. Retiro 100 % de `@base-ui/react`, modularización de `HomeClubView`, blindaje RSC `< 500 KB` y cierre de seguridad

- **Retiro definitivo de `@base-ui/react` (`1.9.0` → eliminado):** se migran los 5 wrappers restantes en `packages/ui/src/components/ui/` (`button.tsx`, `dialog.tsx`, `tabs.tsx`, `toggle-group.tsx`, `tooltip.tsx`, junto con `badge.tsx` ya migrado en `ADR-053`) a primitivas nativas HTML + React accesibles (`<button>`, `<dialog>` con `showModal()`/`closedby="any"` + fallback pointer Safari y `overscroll-contain`, WAI-ARIA `role="tablist"` con foco itinerante, `role="group"` con `aria-pressed`, y `role="tooltip"` WCAG 1.4.13 con portal/flip/clamp), retirando `backdrop-blur-[4px]` y transiciones de `box-shadow`. Se elimina `"@base-ui/react"` de `packages/ui/package.json` y `pnpm-lock.yaml`, y se retiran `"@base-ui/react"` y `"@astryxdesign/core"` de `optimizePackageImports` en `apps/web/next.config.mjs` (**0** referencias restantes en el monorepo).
- **Modularización de `HomeClubView` (`3,176 → 541` líneas, `−83.0 %`) y ergonomía Desktop/Mobile:** se descompone el monolito en `home-view-helpers.ts`, `HomeFilterBar.tsx`, `AstroMatchRow.tsx` (`React.memo`), `HomeFiltersModal.tsx`, `HomeParlayHubCard.tsx` (`<ConfirmActionDialog>` en `>= 2` piernas) y `HomeRightRail.tsx` (`prefetchRoute`), manteniendo compatibilidad total de exports y hooks divididos. `ShellChrome.tsx` + `shell-ergonomics.css` optimizan la ergonomía de escritorio (`>= 1024 px`/`1280 px`, rejilla CSS Grid y `@container match-feed`) y compactan vistas de detalle móvil (`data-shell-context="detail"`). Se completan limpiezas anti-slop y `ADR-054` en `ParlayAndQuantViews.tsx`, `OddsCompareView.tsx` (tabla semántica `.pl-odds-table` + `@container odds-table`), `MatchTicketCard.tsx`, `CortexAnalysisCard.tsx`, `PlatformOverlays.tsx`, `MatchOutlookStrip.tsx`, `outlook.ts`, `league-news.ts` y `CoreMatchViews.tsx` (retiro residual de `<LensGlowOrbs>`, `transition-all`, `Conf. N`, `"Datos completos / parciales"`, `"ni confianza"`/`"snapshot"`, y actualización de etiquetas de motor `v3.0 → v5.1`).
- **Blindaje determinista del shell RSC (`< 500 KB`, `apps/web/src/server/platform-data.ts`):**
  - Proyección explícita por lista blanca (`projectShellGame` / `projectShellPick`) en `withoutGameDetail` y `splitInitialShellDataset` para excluir cualquier payload pesado de Bzzoiro (`shotmap`, `averagePositions`, `extendedLines`, `evidenceSplits`, `multiWindowEvidence`, `probableLineups`) tanto de Etapa 1 como de Etapa 2, reservándolos a `loadGameDetail` bajo demanda.
  - Tope `INITIAL_SHELL_MAX_GAMES = 52` aplicado también al bucle de partidos `LIVE` (priorizando promocionales → `CORE_SHELL_LEAGUES` → `prestigeTier` → hora) + guardia determinista de bytes `INITIAL_SHELL_MAX_BYTES = 480 KB` (`< 500 KB` con margen de `20 KB` para Flight).
  - **Medición real del payload JSON inicial:** desde `30,262.6 KB` crudos → **`initialMemberShell = 280.7 KB`** (`52` partidos, `60` equipos) y **`initialVisitorShell = 227.3 KB`** (`52` partidos, `0` equipos); en prueba de estrés con `80` partidos `LIVE` simultáneos + campos Bzzoiro inyectados, `187.1 KB`, `52` partidos y `0` campos pesados filtrados.
- **Cierre integral de hallazgos de seguridad (`Cero-Fuga`, APIs y PWA):**
  1. **`Cero-Fuga` en `/app/props` (`apps/web/app/app/props/page.tsx`, `platform-data.ts`):** marcada `force-dynamic`, valida `getViewerAccess()` en servidor y restringe `loadPlayerPropStreakCards(36)` y `loadShellPlayerProps({ fullAccess })` a socios con pase vigente (`[]` para visitantes).
  2. **`ExpiredPassGate` en navegación cliente (`apps/web/app/app/layout.tsx`, `apps/web/src/client/club-shell-bridge.tsx`):** `ClubShellBridge` recibe `expiredPassGate` y reevalúa la ruta en cada cambio cliente de `pathname`, impidiendo eludir el muro de pase vencido al navegar desde `/app/account` o `/app/canjear` hacia otras rutas `/app/**`.
  3. **Redacción de `x12` para visitantes (`packages/ui/src/platform/access-guard.ts`, `match-evidence.ts`):** `redactDatasetForVisitor` redacta `x12` a `[0, 0, 0]` en partidos bloqueados no-showcase y `buildEnrichedMatchPicks` deduplica picks redactados por `pk.id` para no colapsar ranuras bloqueadas.
  4. **`GET /api/shell/extend` (`apps/web/app/api/shell/extend/route.ts`):** `Cache-Control` endurecido a `private, no-store`.
  5. **`GET /api/live/games/[gameId]` (`apps/web/app/api/live/games/[gameId]/route.ts`):** redacta `inPlayWinProb` cuando `!access.fullAccess` y responde `Cache-Control: private, no-store` cuando entrega `inPlayWinProb` a socios.
  6. **`POST /api/parlays/sgp` (`apps/web/app/api/parlays/sgp/route.ts`):** exige guardia CSRF `verifySameOriginMutation(request, { requireJson: true })`, sesión autenticada (`401`) y pase vigente (`403 pase_requerido`).
  7. **`GET /api/compare` y `GET /api/news/article` (`apps/web/app/api/compare/route.ts`, `apps/web/src/server/compare.ts`, `apps/web/app/api/news/article/route.ts`):** exigen sesión autenticada (`401`), validan la liga contra la allowlist `PRODUCT_LEAGUES` (`400`, bloqueando path traversal en `squads.json`) y aplican `Cache-Control: private, no-store` en `/api/compare`.
  8. **Auto-desregistro de `sw.js` en loopback (`apps/web/public/sw.js`):** en `localhost`/`127.0.0.1`/`[::1]`, además de purgar cachés, ejecuta `self.registration.unregister()` en `activate`.

### 5. SEO & Crecimiento MX/LATAM (`FD-16` limpio)

- **Nuevos artículos educativos MX/LATAM (`apps/web/content/blog/`):** `fair-odds-y-valor-real-vs-momios.md` (categoría `momios`) y `mercados-avanzados-corners-tarjetas-xg-props.md` (categoría `guias`), activando las 4 categorías del blog con enfoque analítico sobrio y juego responsable, sin términos prohibidos ni rastro `FD-16`.
- **`SportsEvent` JSON-LD y sanitizadores `FD-16` (`apps/web/src/server/json-ld.tsx`, `apps/web/app/precio/page.tsx`):** `buildSportsEventJsonLd`, `buildSportsEventListJsonLd` y `buildPricingPageJsonLd` (integrado en `/precio/page.tsx` junto con metadatos OpenGraph/Twitter). `resolveSportsEventStatus` distingue `NS`/`scheduled` (`https://schema.org/EventScheduled`) de `FT`/`final` (nunca emite `EventScheduled`; incluye `endDate`, marcador oficial, `winner` y `additionalProperty` `EventCompleted`). `sanitizeCanonicalPublicUrl` y `sanitizeFirstPartyAssetUrl` rechazan dominios de proveedor, rutas privadas e IDs numéricos `>= 5` dígitos.
- **Sitemap limpio `FD-16` (`apps/web/app/sitemap.ts`) y pulido de Landing (`LandingSurface.tsx`):** todas las rutas públicas (18 URLs limpias) pasan por `sanitizeCanonicalPublicUrl` con `lastModified` ISO real (`max(updated ?? date)`); `LandingSurface.tsx` refuerza `.num` tabular y claridad de copy sobre momio justo y naturaleza estrictamente analítica.

---

## Alternativas descartadas

1. **Usar tasas de acierto recientes (`X/5`) como probabilidad directa u ocultar picks de partidos `FT`:** descartado porque genera precios falsos (`1.00`) y oculta fallos pasados; la evidencia `L5/L10/L20/H2H` complementa siempre a `p` calibrada de Spacetime v5.1 y `FT` queda auditable de forma irreversible.
2. **Exponer un comparador crudo de cuotas de Bzzoiro sin valoración propia:** descartado por incumplimiento de Licencia Bzzoiro v4.0 y falta de diferenciación; toda cuota aparece ligada a `fairOdds`, `de-vig` y `EV+` propios.
3. **Conservar `@base-ui/react` para compatibilidad con stories D1 o cargar los nuevos estilos en `globals.css`:** descartado para eliminar deuda headless y evitar `~80 KB` de CSS innecesario en rutas públicas; los wrappers nativos preservan la API existente y las 3 hojas nuevas se aíslan por ruta en `@layer components`.
4. **Serializar shotmaps, posiciones medias o el catálogo completo de 34 familias en el shell RSC inicial:** descartado porque rompería el techo `< 500 KB`; el shell inicial usa proyección por lista blanca y la telemetría táctica/catálogo extendido carga bajo demanda en las rutas de detalle.

---

## Consecuencias

- **Positivas:** catálogo propio de 34 familias multi-deporte con valoración `de-vig`/`EV+`, SGP con Cópula Gaussiana y liquidación `FT` auditable; integración completa de Bzzoiro Unlimited cumpliendo Licencia v4.0 y `FD-16`; kit atómico Sofascore (`7` componentes) + Screener modular (`5` componentes) con CSS aislado por ruta; retiro al 100 % de `@base-ui/react`; `HomeClubView` reducido en `-83.0 %`; shell RSC garantizado `< 500 KB` (`280.7 KB` socio / `227.3 KB` visitante); cierre integral de hallazgos `Cero-Fuga`/API/SW; y SEO MX/LATAM con JSON-LD `SportsEvent` y sitemap `FD-16` limpio.
- **Compromisos:** todo campo enriquecido nuevo que se agregue a `PlatformGame` o `MatchPick` queda fuera del shell compartido por defecto salvo inclusión explícita en `projectShellGame`/`projectShellPick`; las rutas que monten vistas atómicas o del screener deben importar explícitamente `atomic-kit.css` y/o `picks-screener.css`; y los consumidores/pruebas de `/api/compare`, `/api/news/article`, `/api/parlays/sgp` y `/api/live/games/[gameId]` deben operar bajo el contrato endurecido de sesión, pase, allowlist de ligas y CSRF.

---

## Validación y métricas finales

- **Métricas arquitectónicas verificadas en integración (`77de9711`):**
  - Catálogo de mercados: **`34` familias** (`20` Fútbol + `14` US) en `@pitchlab/ui/picks-catalog`.
  - Librería visual: **`7` componentes atómicos** (`@pitchlab/ui/atomic`) + **`5` componentes de Screener/Picks** (`@pitchlab/ui/picks-components`) + **`3` hojas CSS modulares** en `@layer components`.
  - Modularización de Inicio: `HomeClubView.tsx` **`3,176 → 541` líneas (`−83.0 %`)**.
  - Dependencias headless: **`0`** referencias a `@base-ui/react` en `packages/ui`, `apps/web` y `pnpm-lock.yaml`.
  - Presupuesto del shell RSC Etapa 1 (`< 500 KB`): **`280.7 KB`** socio / **`227.3 KB`** visitante (`187.1 KB` bajo estrés de `80` partidos `LIVE` + campos Bzzoiro).
  - Sitemap público `FD-16`: **`18` URLs canónicas limpias**.
- **Batería de cierre final (ejecutada en secuencia en `gemini-dos`):**
  - **Pruebas unitarias y guardrails (`pnpm test` + `lint-codebase` + `check-no-demo-prod` + `check-no-secrets` + `check-prod-readiness`):** **EN VERDE** — `11/11` paquetes (`199` archivos de prueba pasando, `2` omitidos; **`1,707`** tests pasando, `0` fallos, `25` omitidos), `lint-codebase` OK, `check-no-demo-prod` OK, `check-no-secrets` OK (`7,901` archivos), `check-prod-readiness` OK (`12/12` checks, `0` bloqueantes) y `typecheck` en verde en `@pitchlab/ingest`, `@pitchlab/ui` y `@pitchlab/web`.
  - **Compilación de producción (`pnpm build`):** **EN VERDE** — `11/11` paquetes compilados sin errores, `28/28` páginas estáticas/ISR generadas (`First Load JS shared by all: 103 kB`, `Middleware: 35.7 kB`, `/offline`: `1.01 kB` / `104 kB`).
  - **Storybook (`pnpm build-storybook`):** Pendiente explícito de ejecución final por corte de reloj (16:50); las `13` nuevas stories CSF3 oscuro/claro (`atomic/*`, `club/picks/*` y `MatchPicksEvidenceBoard.stories.tsx`) pasan `tsc --noEmit` en `@pitchlab/ui`.
  - **Pruebas E2E y accesibilidad WCAG 2.1 AA (`pnpm e2e`):** Pendiente explícito de ejecución final por corte de reloj (16:50); spec nuevo `apps/web/e2e/adr055-picks-atomic-kit.spec.ts` listo y validado contra la auditoría visual previa en Chromium real (`1440×900` y `375×812`, oscuro/claro) más cierre de todos los hallazgos `CRÍTICO`/`ALTO` de Olas 2 y 3.
