# Handoff Maestro para Casa · Arquitectura Integral, Constraint-First, Seguridad, Sofascore y Bzzoiro

> **Fecha de corte:** 2026-11-21 · **Rama:** `gemini-dos` · **Destino remoto:** `origin/gemini-dos`
> **Propósito:** documento 100 % autocontenido dentro del repositorio Git para retomar en casa sin pérdida de contexto. Integra el **Plan Maestro completo** (`plan_arquitectura_maestra_pitchlab.md`), la **arquitectura operativa de Lauren Tan (`@poteto` · Constraint-First / Zero-Slop / Dune / `pstack`)**, el **inventario exacto de Olas 0A–2A + Fixes 2A ya completadas y verificadas**, el **plano disjunto accionable de Mega-Ola UX `2B + 3`, Ola 4 UI y Ola 5**, las **métricas visuales BEFORE medidas** y un **prompt listo para copiar y pegar**.

---

## 1. Decisiones Selladas (Rondas `grill-me` Q1–Q11) y Plan Maestro Completo

| Eje | Decisión acordada | Implicación técnica vinculante |
|---|---|---|
| **Metodología de ingeniería** | **Arquitectura *Constraint-First* / *Software Garden*** (Lauren Tan, *"All Code Is Slop (Except Mine)"* + *Dune* + `pstack`) | La calidad jamás depende de prosa: se impone con tipos nominales (Nivel 1), lint determinista instructivo `< 1 s` (Nivel 2), `fast-check` + máquinas de estado `fc.commands` + evals + navegador real (Nivel 3), y *Error-Driven Correction*. |
| **Adopción sobre legado** | **Opción A (*Ratchet* descendente)** + `0` comentarios en archivos nuevos/editados | Fronteras críticas migradas al `100 %` en Ola 0 (`85/85` rutas `/api/**` cubiertas, `0` `usePlatform()` monolítico); legado congelado en techo decreciente (`scripts/lint-ratchet-baseline.json`) y `0` tolerancia (`--strict-files`) en todo archivo nuevo o rediseñado. |
| **Ligas y extensibilidad** | **Plantilla canónica única (`LeagueCapabilityContract`)** | Calidad `10/10` en **`15` competiciones Tier 1** (`6` ligas fútbol núcleo + `5` copas mayores + `4` US: NBA/NFL/MLB/NHL). Las otras `42` competiciones Tier 2 operan bajo `uiVisibilityPolicy: "only_when_healthy"` (ocultan módulos sin datos; cero cuadros vacíos ni "próximamente"). |
| **Ciberseguridad** | **Nivel ALTO sin lock-in cloud (`ADR-050`)** | 6 wrappers canónicos en `api-guards.ts`, cierre de `/api/live/*` y `/api/search/*` a sesión, rate-limit distribuido PostgreSQL `UNLOGGED` (`security_rate_buckets`, *fail-closed* en rutas críticas) + Redis opt-in, CSP con `nonce` por request + SHA-256 hash en `THEME_INIT_SCRIPT`, detector *scraping velocity* (`35` log / `50` → `429` / `75` → revocación + `403`), watermarking invisible `X-PitchLab-Trace`, paginación SQL `<= 40`, anti-IDOR, IDs opacos en `/api/news/article`, `safe-logger.ts` y trigger SQL inmutable `0025` en `sealed_picks`. |
| **UX/UI estilo Sofascore** | **Frontera vinculante: Zona Protegida vs. Rediseño Total (`docs/design/FEATURE_MAP.md`)** | **Zona Protegida (solo pulido quirúrgico mínimo; prohibido rehacer layout sin revisión del fundador):** `/app` Inicio, Ficha de Partido (`/app/[league]/g/[gameSlug]`) y Páginas de Equipo (`/app/[league]/t/[teamSlug]`). **Rediseño Estructural Total desde cero (Cero AI-Slop):** `13` secciones (Parlays/Bet Builder, Consulta Picks/Parlays, Player Props/Jugador, Momios, Comparar H2H, Mi Récord, Ver mi Perfil, Resultados + `/verificacion`, Mi Plan Ultra, Preferencias, Portal Tipster, Consola/Admin, Cómo calculamos + Juego responsable). **Mejora Funcional:** Social (`/app/social`). |
| **Motor & Datos** | **Cableado real `ADR-055`/Bzzoiro Unlimited v4.0 + port `origin/prediction-lab` (`d6dfed5b`)** | Catálogo de `34` familias cableado, telemetría táctica Bzzoiro (`shotmap`/`xG`/posiciones medias) activa, momios unificados bajo `SpacetimeAnchoredQuote` incondicional (Licencia Bzzoiro v4.0), `SportOutlookCard` US completa y brechas `v5.1` (`REM_00–REM_08` + `10/12` axiomas Red-Team locales) cerradas. |
| **Features Scout Picks + Bzzoiro Unlimited** | **Backends puros listos en Ola 2A; UI en Mega-Ola `2B+3` / Ola 4 UI** | Live Pick Tracker (`actual/línea` + `5` estados asiáticos `.0/.25/.5/.75` + `titular_en_banca` + Web Push `#hash`), Bet Lab SVG (`PropBetLabChart`: barras vs línea + curva minutos + `xG` + rival EB), Directorio/Perfiles de Árbitros (`κ = 15`), `/app/alertas` (`5` triggers + parser ES `16/16` + Copiloto NL opcional `DeepSeek V4.1 Flash` bajo `FLAG_AI_ENABLED` + ZDR), y Standings `Total \| Local \| Visitante` + `Ataque vs Defensa` ordinal + Brackets eliminatorios SVG. |
| **PitchLab Atlas SEO** | **Diferido a etapa futura (solo contratos preparados hoy)** | Cero páginas SEO implementadas ahora. Quedan blindados los contratos: slugs canónicos `FD-16` (`CanonicalPublicSlug` sin IDs numéricos), prohibición de hotlink a `sports.bzzoiro.com/img/*` en futuras rutas SEO públicas (Licencia Bzzoiro v4.0 §6), y `Cero-Fuga` + JSON-LD `SportsEvent` (`EventScheduled` → `EventCompleted`). Convención futura reservada: `/estadisticas/[league]{,/equipos/[teamSlug],/jugadores/[playerSlug],/arbitros/[refereeSlug],/h2h/[matchupSlug]}` y `/partidos/[league]/[gameSlug]`. |

---

## 2. Arquitectura Operativa de Lauren Tan (`@poteto` · Constraint-First / Zero-Slop / Dune / `pstack`)

Toda continuación en casa debe respetar de forma estricta `docs/architecture/CONSTRAINT_FIRST_PLAYBOOK.md` y `docs/design/FEATURE_MAP.md`:

### 2.1 Pirámide Inversa de Confianza y Reglas Mecánicas Activas

1. **Nivel 1 · Tipos Nominales y Fronteras (`packages/contracts/src/branded.ts`, `apps/web/src/server/api-guards.ts`, `packages/db/migrations/0025_*`):**
   - `UnitProbability`, `PositiveDecimalOdds`, `parseStrictFiniteNumber`, `SpacetimeAnchoredQuote`, `RedactedVisitorPick`, `OpaqueResourceId`, `CanonicalPublicSlug`, `SanitizedErrorPayload`, `containsForbiddenFd16Term`, `isSafePublicLabel`, `CLIENT_MATCH_CONTEXT_FACTOR_LABELS`.
   - **Regla FD-16 crítica para UI:** la palabra `"sofascore"` está **bloqueada en el DOM/HTML/CSS/aria renderizado**. Los nombres TypeScript y de archivos pueden usar `Sofascore*` / `sofascore-kit.css`, pero todas las clases CSS, `data-*`, `aria-label` y textos visibles usan el prefijo neutro **`.pl-sf-*` / `data-pl-sf-*`** (`0` ocurrencias de `/sofascore/i` en HTML).
2. **Nivel 2 · Análisis Estático Instructivo (`scripts/lint-codebase.mjs` + `scripts/lint-ratchet-baseline.json`):**
   - Corre en `< 1 s` sobre todo el monorepo (`793` archivos, `0` violaciones globales).
   - Diagnóstico obligatorio de 3 partes: `[REGLA] archivo:linea — QUÉ | POR QUÉ | USA EN SU LUGAR`.
   - **Estado exacto de deuda legada en `scripts/lint-ratchet-baseline.json` al cierre de Ola 2A (`total: 8,896`):**
     - `no-monolithic-use-platform`: **`0` archivos / `0` deuda** (erradicado al 100 %)
     - `require-api-wrapper`: **`0` archivos / `0` deuda** (`85/85` rutas API cubiertas)
     - `no-prod-comments`: `438` archivos / `8,267` líneas (bajada acumulada de `-418` líneas; `0` tolerancia en todo archivo nuevo o rediseñado)
     - `no-unsafe-number-cast`: `112` archivos / `415` llamadas (bajada de `476 → 415`; usar `parseStrictFiniteNumber`)
     - `no-view-use-effect`: `49` archivos / `120` llamadas (`0` en vistas nuevas/rediseñadas; usar `@pitchlab/ui/hooks`)
     - `no-unsafe-type-assertion`: `39` archivos / `88` casteos (`0` `as any` / `as unknown as` en archivos nuevos/rediseñados)
     - `no-slop-wrapper-bloat`: `6` archivos / `6` ocurrencias
   - **Exigencia por worker:** cada abeja corre `node scripts/lint-codebase.mjs --strict-files=<sus archivos nuevos/editados>` (`0` comentarios, `0` `useEffect` en vistas, `0` `Number(`, `0` `as any`/`as unknown as`, `0` `catch {}`, `0` hex fuera de tokens, `0` `backdrop-filter`, `0` `transition-all`, `0` `box-shadow` animado, `0` barrels `@pitchlab/ui` en `apps/web/`).
3. **Nivel 3 · Verificación Ejecutable, Formal (`fast-check`) y Evals:**
   - `apps/web/tests/property-invariants.test.ts` (propiedades `de-vig`, Cópula SGP Fréchet-Hoeffding, `Cero-Fuga`).
   - `apps/web/tests/state-machines-fc.test.ts` (máquinas de estado `fc.commands` sobre PGlite real `0025` `sealed_picks`, `BetBuilder` SGP y *scraping velocity*).
   - `pnpm run eval:cortex` (`24/24` PASS) y `pnpm run eval:alerts` (`16/16` PASS).
4. **Regla *Error-Driven Correction*:** ningún fallo descubierto en QA o auditoría se cierra con un comentario o un párrafo en `AGENTS.md`; todo bug recurrente deja un tipo nominal, una regla en `lint-codebase.mjs` o un test/invariante de regresión.

### 2.2 Modelo de Verificación Independiente `pstack` y Pipeline Acelerado (16 GB RAM, 4 cores)

1. **Verificación independiente `pstack` (cero auto-auditoría, cero recortes de rigor):**
   - En vez de 1 verificador lento o con límites artificiales, dividir cada cierre de ola en **3–4 verificadoras enfocadas independientes (`workspace: "inherit"`, solo lectura)** corriendo en paralelo con alcance pequeño y profundidad adversarial total.
   - Ninguna ola avanza si queda algún hallazgo `CRÍTICO` o `ALTO` abierto.
2. **Aislamiento Anti-OOM (16 GB RAM, 4 cores):**
   - Las escritoras `workspace: "share"` **NUNCA** ejecutan `tsc`, `typecheck`, `vitest`, `next build`, `storybook` ni `playwright` dentro de su worktree: validan exclusivamente con `node scripts/lint-codebase.mjs --strict-files=...` (`< 1 s`) y hacen `git commit` limpio (sin `git push`).
   - El coordinador fusiona ramas disjuntas y ejecuta los procesos pesados **estrictamente 1 a la vez en secuencia**.
3. **Iteración rápida entre olas intermedias (Ola 2B+3 y Ola 4 UI):**
   - Validar con: `node scripts/lint-codebase.mjs --shrink-baseline` + `node scripts/check-no-demo-prod.mjs` + `pnpm --filter <paquetes tocados> typecheck` + `vitest` puntual sobre suites afectadas + **SIEMPRE** `apps/web/tests/property-invariants.test.ts`, `pnpm run eval:cortex` y `pnpm run eval:alerts`.
   - Reservar la batería pesada completa (`pnpm test` 11/11 paquetes, `pnpm build`, `pnpm build-storybook`, `pnpm e2e`) exclusivamente para **Ola 5 (Cierre)**.
4. **Protocolo Visual *Verification Review* (ANTES vs. DESPUÉS), *Deslop* y *UI Fuzzing*:**
   - Capturar ANTES y DESPUÉS en **`1440×900` (desktop)** y **`375×812` (mobile)**, temas **`dark`** y **`light`**, vía `scripts/capture-visual-review.mjs` (guarda PNGs en `os.tmpdir()`, jamás en Git) y reportar con `Screenshot: <ruta-absoluta> | <ANTES/DESPUÉS qué cambió>` en el tablero Swarm.
   - Ola 5 incluye obligatoriamente **1 pasada dedicada de *Deslop* por sustracción** (borrar código/exports/CSS muerto) y **1 suite/agente de *UI Fuzzing* en Playwright** haciendo clic real en botones, filtros, pestañas, modales/sheets y estados vacíos (`320 px ↔ 1440 px`, oscuro y claro).

---

## 3. Inventario Exacto de lo YA Completado y Verificado Hoy (Olas 0A → 2A + Fixes 2A)

### 3.1 Olas Completadas en `gemini-dos`

| Ola | Commits clave | Entregables principales verificados |
|---|---|---|
| **Ola 0A · Cimientos Constraint-First y Seguridad Base** | `ebfebc1b` → `868869a6` | `scripts/lint-codebase.mjs` (diagnósticos instructivos + ratchet + 16 tests), `packages/contracts/src/branded.ts` (tipos nominales), migración **`0025_seguridad_rate_limit_inmutable_y_preferencias.sql`** (`UNLOGGED security_rate_buckets`, `security_abuse_events`, trigger inmutable `sealed_picks_immutability_trg` con GUC solo-test `pitchlab.allow_historical_seed`, columnas `preferred_bookmakers` y `saved_views` en `user_preferences`), `packages/db/src/security-rate-limit.ts`, `apps/web/src/server/{safe-logger,watermark,api-guards,request-security}.ts`, `middleware.ts` con nonce CSP (preservando ISR en rutas públicas), retiro del último `usePlatform()`, `fast-check`, `services/ai-eval/eval-cortex.ts` (`24/24`) y `property-invariants.test.ts` (`13/13`). |
| **Ola 0B · Gobernanza API 100 % + Hardening `pstack`** | `71068b99` → `a61eab05` → `ef9e0f22` | `80/80` rutas originales cubiertas (`76` envueltas en `api-guards.ts` + `4` excepciones endurecidas `auth/[...all]`, `webhooks/stripe`, `beta/unlock`, `beta/logout`), cierre de `/api/live/*`, `/api/search/players` y `/api/me/coupons/preview` a sesión (`allowBetaPin: true` en club), IDs opacos HMAC en `espn-news.ts` + `/api/news/article`, `zod 4.6.7`, `GuardedRouteHandler` sobrecargado para Next 15, RFC 8058 `unsubscribe` exento en middleware, `GET /api/auth/*` con rate-limit, y límites SQL `<= 40` / `ROW_NUMBER()` en social/admin/ranking/live. |
| **Ola 1A · `LeagueCapabilityContract`, US Outlook, `prediction-lab` v5.1 y Playbook** | `ef9e0f22` → `53a621f5` | `packages/contracts/src/league-capabilities.ts` (`57` ligas, `15` Tier 1, `34` familias, `liga-mx` sin descenso falso, `isLeagueHealthyForUi`), `SportOutlookCard` completo para NFL/NBA/MLB F5/NHL con stories oscuro/claro, cierre de las 7 brechas `v5.1` (`REM_00–REM_08`) en `spacetime-v5.ts`/`props-explorer.ts` + `10/12` axiomas Red-Team locales + `11/11` SHA-256 (`v5_1_production_invariants.test.ts`), `docs/architecture/CONSTRAINT_FIRST_PLAYBOOK.md`, `docs/design/FEATURE_MAP.md`, reglas `no-unsafe-type-assertion` y `no-slop-wrapper-bloat`, y `apps/web/tests/state-machines-fc.test.ts` (`3/3` máquinas `fc.commands`). |
| **Ola 1B · Cableado real `ADR-055`/Bzzoiro + Remediación `pstack`** | `f16149c1` → `6c37adef` → `f51e6e83` | `picks-catalog` (`34` familias) conectado en `/app/picks`, `loadGameDetail`, `PicksFinderView` y `MatchPicksEvidenceBoard` con `Cero-Fuga` estricto (`isPrimaryModelPick: false` / `isDerived: false` en visitante) y presupuesto RSC `/app/picks <= 180 KB` (`Etapa 1 + screener <= 480 KB`); `parseBzzoiroShotmap` (eje `x` normalizado a `100 = portería atacada`) y `parseBzzoiroAveragePositions` conectados a `live.ts` y UI; dedup de ~480 LOC en `book-quotes.ts` delegando a `@pitchlab/ingest/odds/bzzoiro-odds` con `SpacetimeAnchoredQuote` incondicional en fútbol y NBA; `PITCHLAB_OFFLINE=1` limpio en `us-standings-cli` y `us-snapshot-cli`; `CLIENT_MATCH_CONTEXT_FACTOR_LABELS` compartido y `data/snapshots/shell-index.json` regenerado con `"Abridores"` en MLB (`24/54`); `withDbTransaction` eliminando `as unknown as Db`; y CSP SHA-256 hash para `THEME_INIT_SCRIPT` (`apps/web/src/theme-init-script.ts`). |
| **Ola 2A Híbrida + Fixes `pstack` 2A** | `f51e6e83` → `e2adf3d6` → `0421ee71` | **Kit Base Sofascore + Storybook (VERIFICADO con `pnpm build-storybook` GREEN) + 4 Backends puros de Ola 4**, auditados por 3 verificadoras `pstack` (`#192`, `#193`, `#194`) y cerrados a **`0 CRÍTICO / 0 ALTO`** en `0421ee71`. |

### 3.2 Piezas Listas para Consumir en Mega-Ola `2B + 3` y Ola 4 UI

1. **Kit Base Neutral Sofascore (`@pitchlab/ui/primitives` — `packages/ui/src/components/ui/primitives.ts`, prefijo `.pl-sf-*`, `0` `"sofascore"` en DOM):**
   - `Button` (`variant: "primary" | "secondary" | "ghost"` + `tone: "default" | "danger"` + alias retrocompatibles; `>= 44 px` en `< 768 px` y `pointer: coarse`, `0` `hover:shadow-*`, `0` `as unknown as`).
   - `SofascoreCard`, `SofascoreTable<T>` (con `caption`, `thead` sticky, `.is-sticky-col`, `.num`), `SofascoreSignalPair` (tope estricto 2 indicadores: `evPct` + `movement`), `SofascoreValueCell` (Prob · Justo · Mejor casa · EV+), `SofascoreKpiStrip`, `SofascoreTabs` (`underline` / `segmented` + Flechas/Home/End/RTL), `SofascoreFilterBar`, `SofascoreEmptyState`, `SettingsGroup`, `SettingsRow`.
   - `apps/web/app/sofascore-kit.css` importado 1 sola vez en `globals.css` + **6 stubs CSS vacíos pre-registrados en `packages/ui/.storybook/preview.ts`**:
     - `apps/web/app/parlays-builder.css`
     - `apps/web/app/props-betlab.css`
     - `apps/web/app/momios-compare.css`
     - `apps/web/app/tipster-admin.css`
     - `apps/web/app/editorial-verificacion.css`
     - `apps/web/app/alerts-referees.css`
   - **Pre-registros ya listos en `packages/ui/package.json`** (para que Mega-Ola `2B+3` jamás toque `package.json`, `globals.css`, `pitchlab-v4.css` ni `.storybook/preview.ts`):
     - `"./primitives"`, `"./hooks"`, `"./props"` (`PropsLabClubView.tsx` ya escindido mecánicamente de `ParlayAndQuantViews.tsx`), `"./verificacion"` (stub `VerificationSurface.tsx`), `"./alerts"` (stub `AlertsClubView.tsx`), `"./referees"` (stub `RefereesClubView.tsx`), `"./standings-brackets"` (stub `StandingsBracketsSection.tsx`).
2. **Hooks Auditados (`@pitchlab/ui/hooks` — permiten `0 useEffect` en todas las vistas de `2B+3` y `4`):**
   - `useSafeEffect`, `useMediaQuery` (`useSyncExternalStore`), `useVisibilityPolling`, `useDebouncedValue`, `useLocalStorageState`, `useAbortableJson`, `useUrlSearchTab`, `usePwaInstallAndPush`.
3. **Kit Atómico Elevado (`@pitchlab/ui/atomic`, `9` componentes + `apps/web/app/atomic-kit.css` + stories oscuro/claro):**
   - 7 elevados: `AtomicStatComparisonBar` (`lowerIsBetter`, `rankA`/`rankB`), `AtomicLineupPitch` (`playerHref`/`onSelectPlayer`), `AtomicShotmapPitch` (`onSelectShot` + `:focus-visible` teclado), `AtomicOddsChip` (`variant="chip" | "cell"`), `AtomicAveragePositionsPitch` (`playerHref`/`onSelectPlayer`), `AtomicFormStrip` (`tooltip`/`tooltips`), `AtomicMatchHeaderBar` (sticky `48–52 px`, `0 px` overflow `320 px`).
   - 2 nuevos: **`PropBetLabChart`** (SVG barras vs línea + curva minutos `0'-90'`/`0-48m` + `xG` + rival EB + tabla `<details>`) y **`LivePickProgressBar`** (`actual/línea` + proyección residual + `5` estados asiáticos + banner `titular_en_banca`).
4. **4 Backends Puros de Ola 4 Listos y Endurecidos (`0` bugs ALTO abiertos):**
   - **Alertas de Mercado + Copiloto NL:** migración **`0026_alertas_mercado.sql`** + `marketAlerts` en `schema.ts` + `@pitchlab/db/market-alerts` (CRUD `<= 40` activas / `<= 80` totales, bloqueo `FOR UPDATE`, anti-IDOR, batch `<= 10` atómico), `apps/web/src/server/market-alerts-engine.ts` (Zod cerrado 34 familias + 57 ligas, parser ES determinista **`16/16`**, 5 triggers, hidratación completa de `row.selection`), `apps/web/src/server/market-alerts-copilot.ts` (`DeepSeek V4.1 Flash` vía OpenRouter HTTP ZDR detrás de `FLAG_AI_ENABLED`, fallback determinista), rutas `GET|POST|PATCH|DELETE /api/alerts`, `POST /api/alerts/copilot` (15/min) y `POST /api/alerts/batch`, más `pnpm run eval:alerts` (`16/16`).
   - **Live Pick Tracker + Web Push `#hash`:** `apps/web/src/server/live-pick-tracker.ts` (`evaluateAsianHandicapQuarterState` 45/45 exacto, `computeResidualProjection`, `detectStarterOnBench` sin falsos positivos por homónimos/`Jr.`/`predicted`, `loadUserLiveTrackedPicks`), `GET /api/me/live-picks` (`withSessionRead`, `allowBeta: false`, `watermark: true`, `private, no-store`), y `buildLivePickMilestoneHash` + `dispatchLivePickMilestonePushes` con dedupe atómico `claimLiveCacheSlotOnce` en `packages/db/src/live.ts`.
   - **Árbitros EB `κ = 15`:** `apps/web/src/server/referees.ts` (`loadLeagueRefereeRanking`, `loadRefereeProfile` con `<= 20` jornadas + `bookablePlayers` desde `squads.json`, `searchRefereesDirectory`, filtrado a fútbol con `providers.referees === true`) y `GET /api/search/referees` (`withSessionRead`, `limit <= 40`, allowlist `PRODUCT_LEAGUES`).
   - **Standings Splits + Ataque vs Defensa + Brackets:** `apps/web/src/server/standings-brackets.ts` (`buildLeagueStandingsSplits` con `total = home + away` y 0 descenso falso en Liga MX, `buildLeagueAttackDefenseTable` / `getTeamAttackDefenseComparison` con rangos ordinales `1..N`, `buildLeagueKnockoutBracket` con series Best-of-N reales en MLB/NBA/NHL, ida+vuelta en Libertadores/UEFA, Liguilla Liga MX y `null` en ligas sin playoffs).

---

## 4. Métricas Baseline Visual **BEFORE** Medidas Hoy (Referencia para Comparar vs. AFTER en Casa)

Hoy capturamos 80 PNGs BEFORE (`20` rutas × `1440×900` + `375×812` × `dark` + `light`) antes de apagar el servidor dev local. Estas son las métricas BEFORE que Mega-Ola `2B + 3` debe pulverizar en casa:

- **Overflow horizontal (`scrollWidth > clientWidth`):** `0/40` en documento raíz (pero en `/app/momios` desktop el input `Lado B` sobresalía de su tarjeta lateral).
- **Botones `< 44 px` en móvil (`375×812`):** **`12` botones** en `5` rutas (`/app/admin` `7`, `/resultados` `2`, `/app/u/sofia_nfl` `1`, `/app/lab?tab=banca` `1`, `match-detail` `1`) → **meta AFTER: `0`**.
- **Inputs `< 16 px` en móvil (anti-zoom iOS):** **`4` inputs** (`/app/admin` `3` inputs a `12 px`; `match-detail` `.pl-ev-sort-select` a `12.5 px`) → **meta AFTER: `0`**.
- **Errores consola/hidratación:** `1` error de hidratación React en `/app/momios` desktop → **meta AFTER: `0`** *(el aviso CSP inline de `THEME_INIT_SCRIPT` en `/app/*` ya quedó resuelto hoy con `'sha256-...'` en `e2adf3d6`!)*.
- **Deuda visual AI-slop (desktop):** **`345` nodos `[class*="glass-"]`** (`momios` `62`, `historial` `41`, `props` `34`, `admin` `31`, `social` `23`), solo `24` `<table>` en total (`0` en `parlays`, `picks`, `props`, `comparar`, `lab-banca`, `perfil`, `account`, `tipster`, `social`), y `7` rutas sobre `1,500` nodos DOM (`admin` `3,284`, `match-detail` `2,597`, `historial` `2,224`, `app-home` `2,078`, `team-monterrey` `1,656`, `momios` `1,561`, `props` `1,546`).

### Paso Previo Rápido en Casa (Regenerar PNGs BEFORE locales en `< 90 s`, fuera de Git)

Antes de lanzar Mega-Ola `2B + 3`, si deseas tener el juego local de PNGs BEFORE en tu computadora de casa (para comparar lado a lado contra AFTER):

```powershell
# Terminal 1 (o IsDaemon: true) — SIEMPRE loopback -H 127.0.0.1 y puerto > 6000 (nunca 3000 ni 6006)
$env:BETTER_AUTH_URL='http://localhost:6420'
$env:PITCHLAB_DIST_DIR='.next-6420-dev'
pnpm --filter @pitchlab/web exec next dev -H 127.0.0.1 --port 6420

# Terminal 2 — Captura BEFORE en os.tmpdir()/pitchlab-visual-review/before (0 archivos en Git)
node scripts/capture-visual-review.mjs --phase=before --base-url=http://127.0.0.1:6420
```

Tras fusionar Mega-Ola `2B + 3` (+ Ola 4 UI), corre el mismo comando con `--phase=after --include-ola4` para generar el set AFTER + `manifest.json` y comparar métricas y capturas en el Verification Review.

---

## 5. Plano Accionable de lo Pendiente para Despachar en Casa

### 5.1 Mega-Ola UX `2B + 3` (+ Abeja #11 de Ola 4 UI) — 11 Escritoras `share` 100 % Disjuntas

**Invariantes obligatorias en TODAS las abejas de Mega-Ola `2B + 3`:**
- **0 archivos compartidos entre las 11 abejas.** **Ninguna** abeja toca `apps/web/app/globals.css`, `apps/web/app/pitchlab-v4.css`, `packages/ui/.storybook/preview.ts`, ni `packages/ui/package.json` (todo ya quedó pre-registrado en Ola 2A).
- Consumir exclusivamente `@pitchlab/ui/primitives` (`.pl-sf-*`), `@pitchlab/ui/hooks` (`0 useEffect` en vistas), `@pitchlab/ui/atomic` y tokens `--pl-*`.
- **0** ocurrencias de `"sofascore"` en el DOM/HTML/CSS renderizado (`FD-16`), **0** `glass-*`/`LensGlowOrbs`, **0** `backdrop-filter`/`transition-all`/`box-shadow` animado, **0** hex literales, **0** comentarios, **0** `Number(`, **0** `as any`/`as unknown as`, **0** barrels `@pitchlab/ui` en `apps/web/`, `>= 44 px` móvil (`< 768 px` y `pointer: coarse`), `>= 16 px` inputs móvil (`[@media(min-width:768px)_and_(pointer:fine)]` si se reduce en desktop — **nunca `sm:text-xs` ni `sm:min-h-9`**!).
- Cada abeja valida SOLO con `node scripts/lint-codebase.mjs --strict-files=<sus archivos>` + `git commit` limpio (sin `tsc`/`vitest`/`next build` en el worktree).

| # | Worker `share` | Alcance | Archivos EXCLUSIVOS (UI + Rutas Next.js) | Hoja CSS EXCLUSIVA | Contratos y conexiones clave |
|---|---|---|---|---|---|
| **1** | `w2b-parlays-builder` | **Sec 1:** Creador de parlays + Bet Builder (`/app/parlays`) | `club/ParlayAndQuantViews.tsx`, `club/PersonalParlayQuickBar.tsx`, `club/picks/BetBuilderDrawer.tsx`, `club/picks/BetBuilderDrawer.stories.tsx`, `components/SgpCopulaAuditCard.tsx`, `components/MobileParlaySheet.tsx`, `apps/web/app/app/parlays/page.tsx` | `apps/web/app/parlays-builder.css` | Workspace 2 cols Desktop / Dock+Sheet `100dvh` Móvil (`useSheetSwipeDismiss`); 1 CTA primario *Sellar*; alerta inline de conflicto/hold SGP; preservar re-export `PropsLabClubView` y `MomiosExplorerClubView` en `ParlayAndQuantViews.tsx`; eliminar deuda `#193 #1/#2` (`0` comentarios, `0` `useEffect`, `0` `sm:text-xs`). |
| **2** | `w2b-picks-screener` | **Sec 2A:** Consulta y Screener de picks (`/app/picks`) + barra Live Pick Tracker | `club/PicksFinderView.tsx`, `club/picks/BookmakerComparePill.tsx`, `club/picks/EvidenceWindowPills.tsx`, `club/picks/NonLinearOddsSlider.tsx`, `club/picks/SavedViewsBar.tsx`, sus `4` `*.stories.tsx`, `apps/web/app/app/picks/page.tsx` | `apps/web/app/picks-screener.css` | Tabla `SofascoreTable` con 3 tabs (`Activos/En vivo` · `Próximos` · `Liquidados FT`), `SofascoreSignalPair` (máx. 2 señales), `SofascoreValueCell`, filtro posición/periodo y curva $C^1$; integrar `LivePickProgressBar` vía `/api/me/live-picks` (`useVisibilityPolling`); jamás ocultar `FT`; preservar props retrocompatibles de `club/picks/*`. |
| **3** | `w2b-props-betlab` | **Sec 3:** Player Props + Perfil de Jugador + Bet Lab SVG (`/app/props`, `/app/[league]/t/[teamSlug]/p/[playerSlug]`) | `club/PropsLabClubView.tsx`, `club/team/PlayerProfileClubView.tsx`, `components/PlayerPropStreakCard.tsx`, `apps/web/app/app/props/page.tsx`, `apps/web/app/app/[league]/t/[teamSlug]/p/[playerSlug]/page.tsx` | `apps/web/app/props-betlab.css` | Tabla maestra `SofascoreTable` + `<PropBetLabChart />` (de `@pitchlab/ui/atomic`) con curva de minutos + `xG` + rival EB + comparador manual *«Compara con tu casa»*; mantener `fullAccess` `Cero-Fuga` y guardia `minMinutes >= 45` fútbol / `18` NBA; preservar exports `PropsLabClubView` y `PlayerProfileClubView`; eliminar deuda `#193 #1`. |
| **4** | `w2b-momios-compare` | **Sec 4:** Momios matriz multi-casa (`/app/momios`) + **Sec 5:** Comparar H2H (`/app/comparar`) | `club/OddsCompareView.tsx`, `club/CompareHubView.tsx`, `platform/compare-hub.stories.tsx`, `apps/web/app/app/momios/page.tsx`, `apps/web/app/app/comparar/page.tsx` | `apps/web/app/momios-compare.css` | Matriz terminal sticky `Mercado` + `Momio justo PitchLab` + cols por casas preferidas (`AtomicOddsChip variant="cell"`), corregir error de hidratación React + overflow `Lado B` medido en BEFORE; en H2H usar `AtomicStatComparisonBar` (`lowerIsBetter` + rangos ordinales `getTeamAttackDefenseComparison`) y `AtomicFormStrip`; preservar `edgeAgainstBook`. |
| **5** | `w3-record-ledger` | **Sec 6:** Mi Récord (`/app/lab`, `/app/historial`) + **Sec 2B:** Picks/Parlays sellados + Live Pick Progress | `club/BitacoraClubView.tsx`, `club/HistorialClubView.tsx`, `club/record/RecordPicksTab.tsx`, `club/record/RecordBankStatsTab.tsx`, `club/record/RecordPrivacyTab.tsx`, `club/record/PublicRecordSections.tsx`, `club/DailyParlaysResultsSection.tsx`, `components/DailyResultsCalendar.tsx`, `components/MatchTicketCard.tsx`, `platform/record.stories.tsx`, `apps/web/app/app/lab/page.tsx`, `apps/web/app/app/historial/page.tsx` | `apps/web/app/record-v2.css` | 3 bloques nítidos: `SofascoreKpiStrip` (4 KPIs), balance + calendario mensual con drawer por día, tabla desglose liga/mercado; en `RecordPicksTab` filas expandibles por piernas + `<LivePickProgressBar />` en picks `LIVE` (conectado a `/api/me/live-picks`); preservar inmutabilidad `sealed_picks` (jamás Undo) y exports `PublicRecordPreviewCard`/`formatSignedPctValue`/`formatSignedUnits`. |
| **6** | `w3-profile-social` | **Sec 7:** Ver mi Perfil (`/app/u/[handle]`, `/u/[handle]`) + **Social (Mejora Funcional):** `/app/social` | `club/AnalystProfileClubView.tsx`, `public/PublicAnalystProfileSurface.tsx`, `club/EditProfileDialog.tsx`, `club/badges/ProfileBadges.tsx`, `club/CommunityClubView.tsx`, `club/SocialPostCard.tsx`, `club/community-ui.tsx`, `platform/profile.stories.tsx`, `platform/public-profile.stories.tsx`, `platform/community.stories.tsx`, `apps/web/app/app/u/[handle]/page.tsx`, `apps/web/app/u/[handle]/page.tsx`, `apps/web/app/app/social/page.tsx` | `apps/web/app/community-v2.css`, `apps/web/app/community-social.css` | Cabecera editorial compacta (`<= 3` insignias, recibo SHA-256 legible con enlace a `/verificacion`); en Social conservar las 4 vistas (`Para ti · Siguiendo · Consenso · Ranking`), moderación y exports de `community-ui.tsx`, destacando `Momio justo`, *Copiar a mi parlay*, filtro limpio por liga y botones `>= 44 px`. |
| **7** | `w3-account-plan-prefs` | **Sec 9:** Mi Plan Ultra (`PlanTab`, `BillingTab`, `Canjear`) + **Sec 10:** Preferencias (`PrefsTab`, `PwaAndPushSection`, `InviteTab`) | `club/AccountReferralsClubView.tsx`, `club/account/PlanTab.tsx`, `club/account/BillingTab.tsx`, `club/account/PrefsTab.tsx`, `club/account/PwaAndPushSection.tsx`, `club/account/InviteTab.tsx`, `club/account/account-helpers.ts`, `components/SettingsGroup.tsx`, `components/CanjearCouponView.tsx`, `platform/account-v2.stories.tsx`, `apps/web/app/app/account/page.tsx` | `apps/web/app/account-v2.css` | Estilo Apple Account + `SettingsGroup`/`SettingsRow` (casas preferidas máx. 12 y vistas guardadas máx. 20 con `pinToHomeHub` persistidas vía `/api/me/preferences` en `user_preferences`), inputs `>= 16 px` móvil, `<ConfirmActionDialog>` en acciones irreversibles, CFDI sin relleno ni `localStorage`, `account-helpers.ts` append-only; `usePwaInstallAndPush` (`0 useEffect`). |
| **8** | `w3-tipster-admin` | **Sec 11:** Portal Tipster (`/app/tipster`) + **Sec 12:** Consola Admin (`/app/admin` + pestaña Seguridad/Anti-Scraping) | `club/SocialAndTipsterViews.tsx`, `club/FounderAdminClubView.tsx`, `club/AdminDataHealthSection.tsx`, `club/AdminPaymentsCouponsSection.tsx`, **nuevo** `club/AdminSecurityAbuseSection.tsx`, `platform/data-health.stories.tsx`, `platform/beta1-payments-coupons.stories.tsx`, `apps/web/app/app/tipster/page.tsx`, `apps/web/app/app/admin/page.tsx` | `apps/web/app/data-health.css`, `apps/web/app/tipster-admin.css` | Eliminar el muro de 78 pills y 7 botones `< 44 px` / 3 inputs `12 px` de `/app/admin`; 4 tabs fijos (`Salud de datos & Ligas` · `Seguridad & Anti-Scraping` leyendo `security_abuse_events` · `Pagos & Cupones` · `Socios & Moderación`), `<ConfirmActionDialog>` en acciones destructivas; preservar `export { SocialVipClubView }` en `SocialAndTipsterViews.tsx`. |
| **9** | `w3-resultados-editorial` | **Sec 8:** Resultados (`/resultados`) + **nuevo `/verificacion`** (`WebCrypto SHA-256`) + **Sec 13:** Cómo calculamos (`/motores`, `/app/tech`) + Juego responsable (`/legal/juego-responsable`) | `public/PublicSiteSections.tsx` *(SOLO `ResultadosPageSurface`, `MotoresPageSurface`, `EnginesSection`, `CalibrationCard` — sin romper `LandingSurface`)*, `public/VerificationSurface.tsx`, `public/TechAndPricingSurfaces.tsx`, `club/ClubTechView.tsx`, `public/LegalSurfaces.tsx`, **nuevo** `public/ResponsiblePlayControls.tsx`, `components/CalibrationCurveChart.tsx`, `components/CalibrationHonestyLab.tsx`, `platform/legal.stories.tsx`, `apps/web/app/resultados/page.tsx`, **nuevo** `apps/web/app/verificacion/page.tsx`, `apps/web/app/motores/page.tsx`, `apps/web/app/app/tech/page.tsx`, `apps/web/app/legal/juego-responsable/page.tsx` | `apps/web/app/editorial-verificacion.css` | RSC + ISR (`0` cookies SSR en páginas públicas); tabla pública `FT` filtrable + verificador local `WebCrypto SHA-256` 100 % cliente en `/verificacion`; editorial limpio sin rejilla `3×2` de vidrio; en Juego Responsable controles inmediatos de pausa (`24h`/`7d`/`30d`, pausa comunidad) + botones `tel:` Línea de la Vida `800 911 2000` y CIJ `55 5212 1212`. |
| **10** | `w3-protected-zone` | **ZONA PROTEGIDA (pulido quirúrgico mínimo únicamente):** `/app` Inicio, Ficha de Partido, Equipos | `club/home/HomeClubView.tsx`, `club/home/AstroMatchRow.tsx`, `club/home/HomeFilterBar.tsx`, `club/match/MatchHeroAndRail.tsx`, `club/match/MatchTabs.tsx`, `club/match/MatchContextPanel.tsx`, `live/LiveMatchCenter.tsx`, `club/team/TeamProfileClubView.tsx`, `club/team/TeamSquadSection.tsx` | `apps/web/app/live.css`, `apps/web/app/pre-match.css`, `apps/web/app/shell-ergonomics.css` | **PROHIBIDO cambiar el layout troncal.** Solo corregir botones `< 44 px` y `.pl-ev-sort-select` (`12.5 px → 16 px` móvil), auto-salto al próximo día con juegos + ranura discreta de vistas fijadas (`pinToHomeHub`) en Inicio, cablear `Atomic*` elevados (`playerHref`, `onSelectShot`, `rankA/rankB`) en Partido, y conectar `StandingsBracketsSection` (`Total \| Local \| Visitante`, `Ataque vs Defensa`, Bracket SVG) en Equipo/Liga. |
| **11** | `w4-alerts-referees-ui` | **Ola 4 UI (conectando los 4 backends ya hechos en Ola 2A):** `/app/alertas`, `/app/[league]/arbitros`, `/app/[league]/r/[slug]`, `StandingsBracketsSection`, `Cmd+K` Árbitros | `club/AlertsClubView.tsx`, `club/RefereesClubView.tsx`, `club/StandingsBracketsSection.tsx`, `components/CommandPaletteModal.tsx` *(añadir pestaña/grupo `Árbitros` contra `/api/search/referees`)*, **nuevas rutas** `apps/web/app/app/alertas/page.tsx`, `apps/web/app/app/[league]/arbitros/page.tsx`, `apps/web/app/app/[league]/r/[refereeSlug]/page.tsx`, y enlace limpio en `ShellChrome` *(o menú Explorar si no colisiona)* | `apps/web/app/alerts-referees.css` | Conecta 1:1 con `GET|POST|PATCH|DELETE /api/alerts`, `/api/alerts/copilot` (tarjetas con píldoras editables que preservan cambios manuales), `loadLeagueRefereeRanking`, `loadRefereeProfile`, `/api/search/referees`, `buildLeagueStandingsSplits`, `getTeamAttackDefenseComparison` y `buildLeagueKnockoutBracket` (SVG limpio Liguilla/Champions/Libertadores/NBA). |

*(Consejo de ejecución en casa: si quieres mantener 6–8 escritoras simultáneas como punto dulce, ejecuta **Tanda A = Bees 1, 2, 3, 4, 5, 11** [6 escritoras] → merge + gate rápido + 3 verificadoras `pstack`, y luego **Tanda B = Bees 6, 7, 8, 9, 10** [5 escritoras] → merge + gate rápido + 3 verificadoras `pstack` + **Verification Review visual AFTER** con `scripts/capture-visual-review.mjs --phase=after --include-ola4`! O las 11 juntas si la máquina de casa tiene >= 16–32 GB RAM — cero colisiones de archivos en ambos modos.)*

### 5.2 Ola 5 · Deslop + UI Fuzzing + Auditoría Adversarial + ADRs + Cierre Formal

1. **Pasada explícita de *Deslop* por sustracción (`w5-deslop-subtraction`, `share`):**
   - Detectar y borrar código muerto, componentes/exports huérfanos, reglas/selectores CSS sin uso en `apps/web/app/*.css`, props innecesarias y deuda residual en `scripts/lint-ratchet-baseline.json` (`--shrink-baseline`).
2. **UI Fuzzing en navegador (`w5-ui-fuzzing`, `share`):**
   - Crear `apps/web/e2e/ui-fuzzing.spec.ts` que recorra las 13 secciones rediseñadas + Social + Zona Protegida + `/app/alertas` + `/app/liga-mx/arbitros` + `/verificacion` en `1440×900` y `375×812` (`dark` y `light`), haciendo clic real en botones, filtros, tabs, modales/hojas, dobles clics rápidos, entradas extremas/vacías y resize `320 px ↔ 1440 px` verificando: `0` `console.error`, `0` `pageerror`, `0 px` overflow horizontal, `0` botones `< 44 px` móvil, `0` inputs `< 16 px` móvil y `0` diálogos trabados.
3. **Auditoría adversarial final (`3–4` verificadoras `pstack` en paralelo, `workspace: "inherit"`):**
   - (a) Ciberseguridad API / Anti-Scraping / IDOR / CSP / `Cero-Fuga`;
   - (b) `FD-16` / Licencia Bzzoiro v4.0 / `SpacetimeAnchoredQuote` / SEO contratos;
   - (c) Matemática cuantitativa (`fast-check` + `fc.commands` + `eval:cortex` + `eval:alerts`);
   - (d) Accesibilidad WCAG 2.1 AA / Visual BEFORE vs AFTER / Zona Protegida intacta.
   - Todo hallazgo CRÍTICO/ALTO se remedia con *Error-Driven Correction*.
4. **ADRs y Documentación Final:**
   - Redactar **`ADR-056`** (Arquitectura Constraint-First, Ratchet y `pstack`), **`ADR-057`** (Ciberseguridad Nivel ALTO sin Lock-In `ADR-050`) y **`ADR-058`** (`LeagueCapabilityContract`, Rediseño Sofascore y Features Bzzoiro/Scout Picks).
   - Actualizar `docs/architecture/adr/README.md`, `AGENTS.md`, `docs/design/FEATURE_MAP.md` y `docs/execution/PROJECT_STATE.md`.
5. **Batería completa de cierre (estrictamente secuencial, 1 proceso pesado a la vez):**
   1. `node scripts/lint-codebase.mjs --shrink-baseline`
   2. `node scripts/check-no-demo-prod.mjs`
   3. `node scripts/check-no-secrets.mjs`
   4. `node scripts/check-prod-readiness.mjs`
   5. `pnpm run eval:cortex` (`24/24`) y `pnpm run eval:alerts` (`16/16`)
   6. `pnpm --filter @pitchlab/{contracts,db,ingest,ui,web} typecheck` (o `pnpm -r typecheck`)
   7. `pnpm test` (`11/11` paquetes completos)
   8. `pnpm build`
   9. `STORYBOOK_DISABLE_TELEMETRY=1 pnpm build-storybook`
   10. `pnpm e2e` (`desktop` + `mobile`, incluyendo `ui-fuzzing.spec.ts`)

---

## 6. Prompt Listo para Copiar y Pegar en Casa

```text
/swarm Retomamos el Plan Maestro de PitchLab desde la rama `gemini-dos`.

Lee primero estos 3 documentos del repositorio antes de lanzar ninguna abeja:
1. `docs/execution/HANDOFF_CASA_ARQUITECTURA_MAESTRA.md` (estado exacto, plano disjunto de las 11 abejas de Mega-Ola 2B+3 + Ola 4 UI, métricas BEFORE y Ola 5)
2. `docs/architecture/CONSTRAINT_FIRST_PLAYBOOK.md` (reglas Lauren Tan / Constraint-First / Zero-Slop / pstack)
3. `docs/design/FEATURE_MAP.md` (frontera vinculante Zona Protegida vs. 13 secciones Rediseño Total vs. Social)

Reglas innegociables de ejecución:
- Olas 0A, 0B, 1A, 1B, 2A Híbrida + Fixes 2A (Kit Base Sofascore `.pl-sf-*`, Storybook en verde, 4 backends puros de Ola 4) ya están completadas y verificadas en `gemini-dos`. NO las rehagas.
- Antes de despachar las escritoras de Mega-Ola UX `2B + 3`, levanta el servidor dev en loopback (`-H 127.0.0.1`, puerto libre `> 6000`, `PITCHLAB_DIST_DIR=.next-<puerto>-dev`) y corre `node scripts/capture-visual-review.mjs --phase=before --base-url=http://127.0.0.1:<puerto>` para tener los PNGs BEFORE locales en `os.tmpdir()` (jamás subas PNGs a Git).
- Despacha Mega-Ola UX `2B + 3` + Ola 4 UI usando exactamente la partición 100 % disjunta de las 11 abejas en `HANDOFF_CASA_ARQUITECTURA_MAESTRA.md` §5.1 (en 2 tandas de 6 + 5 abejas `share` o todas juntas según RAM; cero ediciones a `globals.css`, `pitchlab-v4.css`, `preview.ts` ni `packages/ui/package.json`).
- Aplica rigor total: 0 comentarios literales, 0 `useEffect` en vistas (`@pitchlab/ui/hooks`), 0 `Number(`, 0 `as any`/`as unknown as`, 0 `"sofascore"` en el DOM/HTML/CSS (`FD-16`, prefijo `.pl-sf-*`), `>= 44 px` táctil en `< 768 px` y `pointer: coarse`, `>= 16 px` inputs móvil, y respeto estricto a Zona Protegida (`/app` Inicio, Ficha de Partido, Equipos).
- Cada writer valida únicamente con `node scripts/lint-codebase.mjs --strict-files=...` (anti-OOM, sin `tsc`/`vitest`/`next build` en worktrees).
- Tras el merge: corre `lint-codebase --shrink-baseline`, `check-no-demo-prod`, `typecheck` de paquetes tocados, `vitest` puntual + SIEMPRE `property-invariants.test.ts`, `eval:cortex` y `eval:alerts`; lanza 3–4 verificadoras independientes `pstack` (`workspace: "inherit"`) en paralelo + Verification Review visual AFTER (`--phase=after --include-ola4`, comparando métricas BEFORE vs AFTER con líneas `Screenshot:` en el tablero).
- Al cerrar `2B + 3 + 4 UI` con 0 CRÍTICO / 0 ALTO, ejecuta **Ola 5** completa: pasada dedicada de *Deslop* por sustracción, `ui-fuzzing.spec.ts` en navegador real, auditoría adversarial `pstack`, ADRs `056–058`, actualización de `PROJECT_STATE.md`/`AGENTS.md`, y batería secuencial completa (`pnpm test`, `pnpm build`, `pnpm build-storybook`, `pnpm e2e`). Nunca hagas `git push` sin mi autorización explícita.
```
