# ADR-058 · `LeagueCapabilityContract`, Rediseño Editorial Plano (`.pl-sf-*`), Frontera Zona Protegida y Features Bzzoiro/Scout Picks

- **Estado:** Aceptada
- **Fecha:** 2026-11-21
- **Rama origen:** `gemini-dos`
- **Relacionadas:** `ADR-041`/`ADR-043` (Bzzoiro Fase 1, 57 ligas y árbitros), `ADR-048`/`ADR-049` (Screener, rigor arbitral y Spacetime Suite v5.1), `ADR-050`–`ADR-055` (Portabilidad, Server-First, experiencia móvil nativa, catálogo 34 familias y Bzzoiro Unlimited), `ADR-056` (Arquitectura *Constraint-First* y `pstack`), `ADR-057` (Ciberseguridad Nivel ALTO).

---

## Contexto

Con el catálogo ampliado a `57` competencias (`PRODUCT_LEAGUES`) y `34` familias de mercados (`ADR-055`), PitchLab enfrentaba tres tensiones acumuladas:

1. **Asimetría entre competencias Tier 1 y Tier 2:** las reglas por liga (formatos de tabla, zonas de descenso, brackets eliminatorios, disponibilidad de telemetría táctica, árbitros o props) vivían dispersas entre archivos, generando riesgos como zonas de descenso falsas en Liga MX o módulos vacíos en torneos de expansión sin datos frescos.
2. **Deuda visual heredada (*AI-slop*) y defectos móviles medidos en BEFORE (`20` rutas / `80` PNGs):** persistían `345` nodos `[class*="glass-"]` en escritorio, `12` botones `< 44 px` en móvil (`5` rutas), `4` inputs `< 16 px` en móvil (`2` rutas), `7` rutas superando `1,500` nodos DOM (hasta `3,285` en `/app/admin`), recorte lateral del panel `Lado B` en `/app/momios` y escasez de tablas semánticas estructuradas (`24` `<table>` concentradas en solo `6` rutas). A la vez, las `3` vistas troncales ya aprobadas (`/app` Inicio, Ficha de Partido y Equipos) debían protegerse contra cambios destructivos de layout.
3. **Capacidades de analítica accionable sobre Bzzoiro Unlimited + Spacetime v5.1:** faltaba completar el ciclo extremo a extremo para alertas de mercado (con copiloto en lenguaje natural), seguimiento en vivo de picks sellados con estados asiáticos y alertas de alineación, directorio/perfiles disciplinarios de árbitros (`κ = 15`), tablas `Total | Local | Visitante` + comparativa `Ataque vs Defensa` + brackets SVG, y dejar blindados los contratos para un futuro PitchLab Atlas SEO sin implementarlo todavía.

---

## Decisión

### 1. Plantilla canónica única `LeagueCapabilityContract` (`packages/contracts/src/league-capabilities.ts`)

- Se centralizan las capacidades de las **`57` competencias** y **`34` familias de mercado** (`20` Fútbol + `14` US) en `LEAGUE_CAPABILITY_REGISTRY`:
  - **`15` competencias Tier 1 (`uiVisibilityPolicy: "always"`):**
    - `6` ligas de fútbol núcleo (`tier1_core`): `liga-mx` (`hasRelegationZones: false`, `hasKnockoutBracket: true`), `premier-league`, `laliga`, `bundesliga`, `serie-a`, `ligue-1`.
    - `5` copas/ligas mayores (`tier1_major_cup`): `champions-league`, `europa-league`, `libertadores`, `concacaf-champions`, `mls`.
    - `4` deportes US (`tier1_core`): `nfl`, `nba`, `nhl`, `mlb`.
  - **`42` competencias Tier 2 (`tier2_expansion`, `uiVisibilityPolicy: "only_when_healthy"`):** evaluadas con `isLeagueHealthyForUi` para ocultar automáticamente módulos o ligas sin frescura suficiente en lugar de mostrar tarjetas vacías o avisos de «próximamente».
- Se completa el cableado de `ADR-055` / Bzzoiro Unlimited v4.0 y `prediction-lab` v5.1: `SportOutlookCard` en NFL/NBA/MLB F5/NHL, cierre de las brechas `REM_00–REM_08` + `10/12` axiomas Red-Team locales + `11/11` SHA-256 (`packages/spacetime/tests/v5_1_production_invariants.test.ts`), `picks-catalog` en `/app/picks` (`<= 180 KB` RSC con `Cero-Fuga`), eje `x` de `parseBzzoiroShotmap` normalizado a `100 = portería atacada`, `SpacetimeAnchoredQuote` incondicional en fútbol y NBA (Licencia Bzzoiro v4.0), `PITCHLAB_OFFLINE=1` limpio en los CLIs US y `data/snapshots/shell-index.json` con etiqueta `"Abridores"` en MLB.

### 2. Kit editorial plano neutro (`@pitchlab/ui/primitives`, `.pl-sf-*`) y frontera `FEATURE_MAP`

- **Primitivas compartidas (`packages/ui/src/components/ui/button.tsx`, `sofascore-surface.tsx`, `primitives.ts` + `apps/web/app/sofascore-kit.css`):**
  - `Button` consolidado en `3` jerarquías (`primary | secondary | ghost`) y tonos (`default | danger`) con tamaño mínimo `>= 44 px` en `< 768 px` y `pointer: coarse`, sin `hover:shadow-*`.
  - Primitivas editoriales: `SofascoreCard`, `SofascoreTable<T>` (`caption`, `thead` sticky, `.is-sticky-col`, `.num`), `SofascoreSignalPair` (tope estricto de `2` señales: `evPct` + movimiento), `SofascoreValueCell` (`Prob.` · `Momio justo` · `Mejor casa` · `EV+`), `SofascoreKpiStrip`, `SofascoreTabs` (`underline`/`segmented`, navegación por teclado), `SofascoreFilterBar`, `SofascoreEmptyState`, `SettingsGroup` y `SettingsRow`.
  - **Regla `FD-16` en DOM:** ninguna clase CSS, atributo `data-*`, `aria-label` ni texto visible contiene `"sofascore"`; todo el marcado renderizado usa el prefijo neutro **`.pl-sf-*` / `data-pl-sf-*`**.
- **Kit atómico ampliado a `9` componentes (`@pitchlab/ui/atomic`, `apps/web/app/atomic-kit.css`):** eleva los `7` componentes de `ADR-055` (`AtomicStatComparisonBar` con `lowerIsBetter` y `rankA`/`rankB`, `AtomicLineupPitch` y `AtomicAveragePositionsPitch` con `playerHref`/`onSelectPlayer`, `AtomicShotmapPitch` con `onSelectShot` + foco teclado, `AtomicOddsChip` `chip | cell`, `AtomicFormStrip`, `AtomicMatchHeaderBar`) y suma **`PropBetLabChart`** (SVG barras vs línea + curva minutos + `xG` + rival EB + tabla `<details>`) y **`LivePickProgressBar`** (`actual/línea` + proyección residual + `5` estados asiáticos + aviso `titular_en_banca`).
- **6 nuevas hojas CSS modulares en `@layer components`** (importadas solo por sus rutas y registradas en `packages/ui/.storybook/preview.ts`): `parlays-builder.css`, `props-betlab.css`, `momios-compare.css`, `tipster-admin.css`, `editorial-verificacion.css` y `alerts-referees.css`.
- **Frontera vinculante de pantallas (`docs/design/FEATURE_MAP.md`):**
  - **`ZONA PROTEGIDA` (3 vistas — solo pulido quirúrgico, prohibido rehacer layout troncal):**
    1. `/app` Inicio: auto-salto al siguiente día con partidos, ranura discreta de vistas fijadas (`pinToHomeHub`) y objetivos `>= 44 px`.
    2. Ficha de Partido (`/app/[league]/g/[gameSlug]`): botón compartir 9:16 `>= 44 px`, `.pl-ev-sort-select` `16 px` móvil y cableado interactivo de `Atomic*`.
    3. Equipos (`/app/[league]/t/[teamSlug]`): conexión de `StandingsSplitsPanel`, `KnockoutBracketSvgPanel` y `AttackDefenseOrdinalCard`.
  - **`REDISEÑO TOTAL` (13 secciones) y `MEJORA FUNCIONAL` (Social):** reconstrucción editorial plana con `0 useEffect` en vistas (`@pitchlab/ui/hooks`), `0` `backdrop-filter`/`glass-*` de contenido, `0` hex literales y `>= 44 px` / `>= 16 px` en móvil: Parlays/Bet Builder (`/app/parlays`), Consulta Picks (`/app/picks`), Player Props + Jugador (`/app/props` tras escindir `PropsLabClubView.tsx` + `/app/[league]/t/[teamSlug]/p/[playerSlug]`), Momios (`/app/momios` en matriz terminal única sin recorte en `Lado B`), Comparar H2H (`/app/comparar`), Mi Récord (`/app/lab`, `/app/historial`), Ver mi Perfil (`/app/u/[handle]`, `/u/[handle]` con recibo SHA-256), Resultados + `/verificacion` (`WebCrypto SHA-256`), Mi Plan Ultra + CFDI + Canje (`/app/account`, `/app/canjear`), Preferencias + Referidos (persistiendo `preferred_bookmakers` máx. `12` y `saved_views` máx. `20` en `user_preferences` `0025`), Portal Tipster (`/app/tipster`), Consola Admin (`/app/admin` en `4` pestañas fijas con `Seguridad & Anti-Scraping`), Cómo calculamos + Juego responsable (`/motores`, `/app/tech`, `/legal/juego-responsable` con `ResponsiblePlayControls.tsx`, pausas `24h`/`7d`/`30d` y botones `tel:` Línea de la Vida `800 911 2000` / CIJ `55 5212 1212`), y mejora funcional de Social (`/app/social`).

### 3. Cuatro capacidades avanzadas Bzzoiro Unlimited + Scout Picks (Backends + UI Ola 4)

1. **Alertas de Mercado y Copiloto NL (`/app/alertas`):**
   - Migración **`packages/db/migrations/0026_alertas_mercado.sql`** (`market_alerts`), capa DB `@pitchlab/db/market-alerts` (`<= 40` activas / `<= 80` totales, bloqueo `FOR UPDATE`, anti-IDOR, batch atómico `<= 10`), motor `apps/web/src/server/market-alerts-engine.ts` (`5` triggers: `market_opened`, `sharp_steam`, `stale_line_ev`, `lineup_confirmed`, `schedule_change`; parser determinista en español `16/16`), copiloto `apps/web/src/server/market-alerts-copilot.ts` (`DeepSeek V4.1 Flash` vía OpenRouter ZDR opt-in detrás de `FLAG_AI_ENABLED` con fallback determinista), APIs `GET|POST|PATCH|DELETE /api/alerts`, `POST /api/alerts/copilot` (`15/min`) y `POST /api/alerts/batch`, y vista `AlertsClubView.tsx`.
2. **Live Pick Tracker y Web Push `#hash`:**
   - `apps/web/src/server/live-pick-tracker.ts` (`evaluateAsianHandicapQuarterState` en 5 estados `.0/.25/.5/.75`, `computeResidualProjection`, `detectStarterOnBench`, `loadUserLiveTrackedPicks`), `GET /api/me/live-picks` (`withSessionRead`, `allowBeta: false`, `watermark: true`, `private, no-store`), `buildLivePickMilestoneHash` y `dispatchLivePickMilestonePushes` (`apps/web/src/server/push-alerts.ts`) con deduplicación atómica `claimLiveCacheSlotOnce` (`packages/db/src/live.ts`), integrados mediante `<LivePickProgressBar />` en `/app/picks` y `/app/lab`.
3. **Directorio y Perfiles de Árbitros EB `κ = 15` (`/app/[league]/arbitros`, `/app/[league]/r/[refereeSlug]`):**
   - `apps/web/src/server/referees.ts` (`REFEREE_EB_KAPPA = 15`, `loadLeagueRefereeRanking`, `loadRefereeProfile` con hasta `20` partidos recientes y `bookablePlayers` desde `squads.json`, `searchRefereesDirectory`, restringido a fútbol con `providers.referees === true`), `GET /api/search/referees` (`withSessionRead`, `limit <= 40`, allowlist `PRODUCT_LEAGUES`), `RefereesClubView.tsx` y grupo `Árbitros` en `CommandPaletteModal.tsx` (`Cmd+K`).
4. **Standings Splits (`Total | Local | Visitante`), `Ataque vs Defensa` ordinal y Brackets SVG:**
   - `apps/web/src/server/standings-brackets.ts` (`buildLeagueStandingsSplits`, `buildLeagueAttackDefenseTable`, `getTeamAttackDefenseComparison`, `buildLeagueKnockoutBracket` para Best-of-N NBA/NHL/MLB, ida+vuelta UEFA/Libertadores y Liguilla Liga MX) y `StandingsBracketsSection.tsx` integrados en perfiles de equipo y `/app/comparar`.

### 4. Contratos blindados para futuro PitchLab Atlas SEO (diferido)

No se implementan páginas SEO masivas en esta etapa. Quedan congelados los contratos previos: slugs canónicos `CanonicalPublicSlug` sin IDs numéricos `>= 5` dígitos ni marcas de proveedor (`FD-16`), prohibición de hotlink a imágenes externas de proveedor en rutas SEO públicas futuras (Licencia Bzzoiro v4.0 §6), redacción `Cero-Fuga`, JSON-LD `SportsEvent` (`EventScheduled` → `EventCompleted`) y convención de URLs reservada `/estadisticas/[league]{,/equipos/[teamSlug],/jugadores/[playerSlug],/arbitros/[refereeSlug],/h2h/[matchupSlug]}` y `/partidos/[league]/[gameSlug]`.

---

## Alternativas descartadas

1. **Rediseñar desde cero también Inicio, Ficha de Partido y Equipos:** descartado por el riesgo de romper flujos centrales ya aprobados; el contrato `ZONA PROTEGIDA` acota las ediciones allí a correcciones quirúrgicas verificables.
2. **Mostrar las 57 ligas con el mismo layout fijo y tarjetas vacías en Tier 2:** descartado porque erosiona la confianza del usuario; `LeagueCapabilityContract` hace explícita cada capacidad y oculta bloques no saludables.
3. **Usar el nombre comercial de referencia en clases CSS/atributos DOM o implementar PitchLab Atlas SEO en esta misma ola:** descartado por riesgo de fuga `FD-16` en el primer caso y por dispersión de alcance/cumplimiento de activos en el segundo.

---

## Consecuencias

- **Positivas:** contrato tipado único para `57` ligas y `34` familias; eliminación masiva de vidrio/AI-slop, cero defectos táctiles o de zoom iOS en móvil y todas las vistas rediseñadas por debajo de `1,500` nodos DOM; `4` capacidades nuevas de retención y analítica operando sobre datos reales con `Cero-Fuga` y `FD-16` intactos; y Zona Protegida preservada al `100 %`.
- **Compromisos:** toda liga nueva o cambio de proveedor debe declararse en `packages/contracts/src/league-capabilities.ts`; las `6` hojas CSS nuevas deben mantenerse aisladas por ruta y sincronizadas con `packages/ui/.storybook/preview.ts`; y la tabla `market_alerts` (`0026`) requiere migración en producción junto con `0025`.

---

## Validación y métricas BEFORE → AFTER verificadas

Verificación visual en servidor loopback (`http://127.0.0.1:6420`, commit `8bc5eeb0`, `scripts/capture-visual-review.mjs` en `1440×900` y `375×812`, `dark` y `light`):

| Métrica | BEFORE (`20` rutas) | AFTER (`23` rutas / `20` comunes) | Cambio verificado |
|---|---:|---:|---|
| Rutas capturadas (`HTTP 200`) | `20/20` (`80` PNGs) | **`23/23` (`92` PNGs)** | `+3` (`/verificacion`, `/app/alertas`, `/app/liga-mx/arbitros`) |
| Overflow horizontal (desktop / móvil) | `0 / 0` | **`0 / 0`** | Limpio (`Lado B` en `/app/momios` corregido al 100 %) |
| Botones `< 44 px` en móvil (`375×812`) | `12` (`5` rutas) | **`0` (`0` rutas)** | **`-12` (`100 %` cerrados)** |
| Inputs `< 16 px` en móvil | `4` (`2` rutas) | **`0` (`0` rutas)** | **`-4` (`100 %` cerrados)** |
| Errores consola / página / HTTP `5xx` | `0 / 0 / 0` | **`0 / 0 / 0`** | Limpio |
| Nodos `[class*="glass-"]` (desktop) | `345` | **`106`** (`98` en `20` comunes) | **`-71.6 %`** en `20` comunes (`0` en las `4` públicas) |
| Tablas `<table>` (desktop) | `24` (`6` rutas) | **`30` (`14` rutas; `29` comunes)** | Tablas estructuradas (`momios` `16 → 1`, `picks` `0 → 9`) |
| Rutas `> 1,500` nodos DOM | `7` | **`3` (solo Zona Protegida)** | **`-4`** (`admin` `3,285→1,343`, `historial` `2,224→1,173`, `momios` `1,561→1,158`, `props` `1,549→933`) |

- **Verificaciones funcionales en `8bc5eeb0`:** `pnpm --filter @pitchlab/ui typecheck` y `test` (`47/47` archivos, `315/315` pruebas), `pnpm --filter @pitchlab/web typecheck` y suites clave (`7/7` archivos, `64/64` pruebas), `pnpm run eval:cortex` (`24/24`) y `pnpm run eval:alerts` (`16/16`). Todas las auditorías `pstack` de Tanda A y Tanda B cerraron en `0 CRÍTICO / 0 ALTO`.
- *Nota de cierre:* las cifras finales de la batería secuencial de Ola 5 (`pnpm test` 11/11, `pnpm build`, `pnpm build-storybook`, `pnpm e2e` con `ui-fuzzing.spec.ts`) se estamparán en `docs/execution/PROJECT_STATE.md` al concluir Ola 5.
