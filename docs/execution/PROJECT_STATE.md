# Estado del proyecto PitchLab

> **Propósito:** que cualquier sesión retome el trabajo sin reconstruir el contexto. Se actualiza al cerrar cada fase.
> **Última actualización:** 2026-11-08 · **Rama:** `feat/pre-mvp`

## Estado actual

- **F0 (auditoría):** ✅ completa.
- **F1 (spikes y decisiones):** ✅ completa como investigación de escritorio. Las cotizaciones y la confirmación de términos dependen de que el fundador haga los contactos (FD-14).
- **F2 (product blueprint):** ✅ completa, pendiente de revisión del fundador.
- **Decisión 2026-11-08:** datos a US$0 por ahora → `docs/architecture/FREE_DATA_STRATEGY.md` (FD-02 decidida).
- **F3 (arquitectura y ADRs):** ✅ completa: 18 ADRs y 8 documentos de arquitectura, con revisión cruzada.
- **F3b (preparación de ejecución):** ✅ completa: frontend, contratos, ownership, integración, plan multiagente, quality gates y plantilla de prompts.
- **Pre-MVP para socios:** ✅ implementado en `feat/pre-mvp` (`docs/product/PRE_MVP.md` y `docs/product/PRE_MVP_DEPLOY.md`).
- **D1 diseño base:** ✅ aprobado (2026-11-08, iteración 4). Contrato en `docs/design/DESIGN_SYSTEM.md`, `INTERACTION_PATTERNS.md` y `RESPONSIVE_RULES.md`. Prototipos en `design/d1/`.
- **Siguiente:** publicar el pre-MVP en Vercel (`docs/product/PRE_MVP_DEPLOY.md`) y/o iniciar F4 completo. Bloqueo para publicar en dominio final: cuentas, DNS y secretos (`DEPLOYMENT.md` §6).

El clon previo de TouchIQ (Vite + `src/domain` con 24 tests dorados) quedó archivado en la rama `archive/touchiq-reconstruction` (ADR-018) y sus motores matemáticos viven ahora en `packages/engines-reference` con adaptadores limpios para snapshots reales.

## Documentos creados

| Documento | Fase | Estado |
|---|---|---|
| `docs/PITCHLAB_MASTER_PLAN.md` | — | v2 aprobado |
| `docs/DIRECTIVE_CHANGELOG.md` | — | Completo |
| `docs/brand/BRAND_AUDIT.md` | F0 | Completo |
| `docs/brand/ASSET_MANIFEST.md` | F0 | Completo |
| `docs/research/REA_REPORT_INVENTORY.md` | F0 | Completo |
| `docs/research/COMPETITIVE_FEATURE_MATRIX.md` | F0 | Completo (26 funcionalidades y benchmarks) |
| `docs/research/PREDICTION_ENGINE_FINDINGS.md` | F0 | Completo |
| `docs/research/UX_FINDINGS.md` | F0 | Completo (Draftea: solo la landing pública) |
| `docs/architecture/DATA_PROVIDER_MATRIX.md` | F1 | Completo (reemplaza `DATA_SOURCE_FINDINGS.md`: incluye la procedencia de datos de las referencias) |
| `docs/architecture/COMPLIANCE_REGISTER.md` | F1 | Completo (15 puntos) |
| `docs/product/COST_MODEL.md` | F1 | Completo (supuestos explícitos) |
| `docs/execution/FOUNDER_DECISIONS.md` | F1 | 14 decisiones |
| `docs/product/PRODUCT_VISION.md` | F2 | Completo (tesis, 5 personas, diferenciadores, no-objetivos y métricas norte) |
| `docs/product/USER_JOURNEYS.md` | F2 | Completo (J1–J10, base de los E2E) |
| `docs/product/INFORMATION_ARCHITECTURE.md` | F2 | Completo (navegación, `SportContext` y entitlements provisionales) |
| `docs/architecture/ROUTE_MAP.md` | F2 | Completo (fuente única de rutas) |
| `docs/product/SECTION_INDEX.md` | F2 | Completo (38 IDs + 11b; 18, 19 y 27 fusionadas) |
| `docs/product/MVP_DEFINITION.md` | F2 | Completo (Lean+ con ecosistema) |
| `docs/execution/ROADMAP.md` | F2 | Completo (waves W0–W8 con dependencias) |
| `docs/architecture/FREE_DATA_STRATEGY.md` | F2→F3 | Vigente: nflverse, openfootball, The Odds API Free y API-Football Free |
| `docs/architecture/adr/` (ADR-001…018) | F3 | 17 aceptadas, 1 propuesta (ADR-016, iconografía) |
| `docs/architecture/SYSTEM_ARCHITECTURE.md` | F3 | Módulos, límites, flujo y API `/api/v1` |
| `docs/architecture/DATA_ARCHITECTURE.md` | F3 | Modelo canónico, ingesta, R2, frescura y as-of (incluye HISTORICAL_STORAGE) |
| `docs/architecture/PREDICTION_ARCHITECTURE.md` | F3 | Live frente a retro, tablas, gate de publicación |
| `docs/architecture/AUTH_BILLING_GROWTH.md` | F3 | Auth, entitlements por concesiones, trial, referidos, invitaciones y `BillingProvider` |
| `docs/architecture/SOCIAL_ARCHITECTURE.md` | F3 | Integridad de picks, métricas, leaderboards y moderación |
| `docs/architecture/AI_ARCHITECTURE.md` | F3 | OpenRouter + modelo barato, herramientas, validador de grounding, selección por evaluación y costo |
| `docs/architecture/SECURITY.md` | F3 | Amenazas, reglas de código, roles, flags legales y respaldos |
| `docs/architecture/DEPLOYMENT.md` | F3 | Entornos, CI/CD, variables, DNS y correo, presupuestos y acciones del fundador |
| `docs/product/PRE_MVP.md` | Pre-MVP | Landing + panel de partidos y análisis para socios, con su plan de 8 pasos |
| `docs/architecture/FRONTEND_ARCHITECTURE.md` | F3b | Estructura de `apps/web`, server frente a client, componentes, estilo, responsive y pruebas |
| `docs/architecture/SHARED_CONTRACTS.md` | F3b | IDs, `DataState`, deportes, odds, análisis, predicciones, social, billing, API y URLs |
| `docs/execution/AGENT_OWNERSHIP.md` | F3b | Globs por owner de plataforma y por sección |
| `docs/execution/INTEGRATION_STRATEGY.md` | F3b | Ramas, worktrees, PRs, merges por wave, contratos y releases |
| `docs/execution/AGENT_EXECUTION_PLAN.md` | F3b | Ciclo de sesión, paralelismo por wave y handoff |
| `docs/execution/QUALITY_GATES.md` | F3b | Gates de CI, checklist de PR, criterios de aceptación y linter de prompts |
| `prompts/_TEMPLATE.md` | F3b | Plantilla A–R para los prompts de F5 |
| `docs/product/PRE_MVP_DEPLOY.md` | Pre-MVP | Guía paso a paso de despliegue en Vercel Free + GitHub Actions |

## Hallazgos de F3

- Con Sonnet y las cuotas de F2, la IA costaría más que el ingreso de Pro. Se ajustaron las cuotas (Pro 60 consultas al mes).
- **Decisión del fundador (2026-11-08):** la IA usará OpenRouter con un modelo muy barato (ADR-013 rev. 2, FD-15 decidida). El modelo concreto se elige con la evaluación de `AI_ARCHITECTURE.md` §6.

## Hallazgos de F1 que cambian supuestos

- **Stripe** prohíbe los pronósticos deportivos *con premio monetario o material*, y admite excepciones con aprobación previa. Regla derivada: **ningún premio por acertar** (leaderboards sin premios).
- **Pinnacle** cerró su API pública el 23 de julio de 2025. El benchmark de mercado será el consenso sin vig de las casas con licencia.
- **Sportmonks no ofrece NFL** (el handoff de LineMate estaba equivocado).
- **Ningún proveedor confirma cuotas de Caliente o Codere MX.**
- Las APIs públicas de MLB y NHL no son aptas para uso comercial sin licencia.
- La **nueva LFPDPPP** está vigente desde el 21 de marzo de 2025.
- Una nueva Ley de Juegos y Sorteos está en preparación (SEGOB, octubre de 2026).

## Decisiones tomadas

- La arquitectura va antes que los prompts (F0→F4 antes de F5).
- Stack del §3 del plan maestro (las ADRs formales se escriben en F3).
- URLs con la Opción A (un solo origen, pitchlab.mx).
- `Reportes/` es la carpeta canónica de investigación.
- Emblemas: la fuente es `pitchlab-brand/football/<edición>/`, con un fallback neutro.
- Cero premios vinculados a pronósticos. Cero scraping. Cero afiliados en el MVP.

## Pendiente (en orden)

1. **Gate del fundador:** ✅ FD-01 y FD-03…FD-06 confirmadas (2026-11-08). Pendiente: ADR-016 (iconografía) y las acciones de `DEPLOYMENT.md` §6 (cuentas, DNS y secretos), que solo bloquean F4 y el deploy, no el diseño.
2. **Pre-MVP:** ✅ construido y verificado en `feat/pre-mvp`. Pendiente de despliegue en Vercel (`docs/product/PRE_MVP_DEPLOY.md`) y **F4:** walking skeleton completo (`SPORTS_ASSET_COVERAGE.md` se autogenera ahí).
3. **F5:** prompts (`prompts/INDEX.md`). **F6:** ejecución multiagente (`AGENT_EXECUTION_PLAN.md`).

## Bloqueos

- FD-14: confirmación de API-Football para Liga MX comercial y revisión de cuenta de Stripe MX (solo bloquean el cobro, no el desarrollo).
- Falta el archivo Inter WOFF2 en el paquete de marca (se resuelve en F4).

## Cambios del fundador sin commit (no incluidos en los commits del plan)

- `pitchlab-brand/PITCHLAB_BRAND_HANDOFF.md` y `README.md`
- `pitchlab-brand/football/` y `pitchlab-brand/social/instagram-lanzamiento/` (sin seguimiento)
- `pitchlab-brand.zip` y los ZIP de emblemas

## Handoffs

_(Cada sesión de agente agrega aquí su entrada con el formato de `AGENT_EXECUTION_PLAN.md` §4.)_

### PREMVP-01 · Construir el pre-MVP de PitchLab (landing + acceso beta + panel de análisis) — 2026-11-08 — Rama `feat/pre-mvp`
- **Hecho:**
  - Creación de la rama de archivo `archive/touchiq-reconstruction` (ADR-018) y de la rama de trabajo `feat/pre-mvp`.
  - Monorepo con `pnpm` + Turborepo (`package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.env.example`, `scripts/check-no-demo-prod.mjs`, `scripts/lint-codebase.mjs`).
  - `@pitchlab/tokens`: generador desde `pitchlab-brand/tokens/tokens.json` hacia `tokens.css` (con tema oscuro por defecto, `html[data-theme="light"]` y aliases semánticos D1) y `dist/index.{js,d.ts}`.
  - `@pitchlab/contracts`: esquemas Zod e interfaces TypeScript de `DataState<T>`, `LeagueSlug`, `TeamRef`, `MarketOdds`, `Prediction1X2`, `Prediction2Way`, `GameSummary`, `GameDetail` y `LeagueSnapshot`.
  - `@pitchlab/sports-assets`: manifiesto tipado de emblemas de `pitchlab-brand/football/` con copia automática a `apps/web/public/brand/` y componente `<TeamCrest />` con fallback determinístico.
  - `@pitchlab/engines-reference`: migración de los motores matemáticos de referencia (386 tests en verde, incluidos los 24 tests dorados y los 324 de paridad) y adaptadores puros `computeSoccerMatchPrediction` y `computeNflMatchPrediction` con factores explicables en español y cero jerga interna (FD-16).
  - `@pitchlab/ingest` (`services/ingest`): CLI `pnpm snapshot` con adaptadores reales para `nflverse` (`games.csv` CC-BY 4.0), `openfootball` (`en.1.json` CC0), `API-Football` (opcional para Liga MX con `API_FOOTBALL_KEY`) y `The Odds API` (opcional con `ODDS_API_KEY`). Generados snapshots reales verificados en `data/snapshots/nfl/2026-11-08.json` (15 partidos, Semana 9) y `data/snapshots/premier-league/2026-11-08.json` (10 partidos, Jornada 10) más sus respectivos `latest.json`.
  - `@pitchlab/ui` y `@pitchlab/web` (`apps/web`, Next.js 15 App Router): rutas `/`, `/login`, `/signup`, `/app`, `/app/[league]`, `/app/[league]/games/[gameId]`, `/legal/{privacidad,terminos,juego-responsable,creditos}`, `/robots.txt`, endpoints `POST /api/beta/unlock` (comparación constante `timingSafeEqual`, cookie `pl_beta` firmada con HMAC-SHA256 `httpOnly` y rate-limit 5 intentos / 15 min → `429`) y `POST /api/beta/logout`, más `middleware.ts` para proteger `/app/**` con `X-Robots-Tag: noindex, nofollow`.
  - Workflow `.github/workflows/pre-mvp-snapshot.yml` y guía operativa `docs/product/PRE_MVP_DEPLOY.md`.
- **No hecho / fuera de alcance:**
  - Base de datos transaccional, cuentas individuales por correo, pagos con Stripe, picks sociales, asistente de IA en vivo, MLB/NHL/NCAA y comparador multi-casa completo (reservados para F4 y waves W1–W5).
  - Snapshot en vivo de Liga MX sin `API_FOOTBALL_KEY`: la pestaña Liga MX aparece como «Pronto» y se activa automáticamente al configurar `API_FOOTBALL_KEY`.
- **Contratos, tablas o componentes pedidos a otros owners:**
  - Ninguno para el pre-MVP; `@pitchlab/contracts` exporta `LeagueSnapshot`, `GameSummary`, `GameDetail` y `DataState<T>` listos para reutilizarse en W0/W2.
- **Decisiones tomadas (y por qué):**
  - En `services/ingest/src/adapters/openfootball.ts`, se aceptó `"score": []` además de `"score": {}` porque `openfootball` serializa partidos futuros como arreglo vacío en jornadas aún no disputadas.
  - En `apps/web/next.config.mjs`, se configuró `extensionAlias` en Webpack para resolver imports ESM con extensión `.js` hacia archivos `.ts`/`.tsx` de los paquetes del monorepo.
  - Se añadieron aliases semánticos de superficie (`--bg-canvas`, `--bg-subtle`, `--bg-elev-1`, `--text-primary`, `--text-secondary`, `--text-muted`) en `@pitchlab/tokens` para mantener 0 literales hex fuera de `packages/tokens` y pasar contraste WCAG AA (`axe-core`) tanto en modo oscuro como en modo claro.
- **Riesgos o deuda:**
  - El limitador de intentos de `/api/beta/unlock` usa memoria de proceso (suficiente para socios en el pre-MVP; en F4 se reemplaza por almacenamiento distribuido / Auth.js).
  - La fuente `Inter` usa `next/font/google` con fallback de sistema mientras el archivo `Inter.woff2` local entra al paquete de marca en F4.
- **Cómo probarlo:**
  - Comandos ejecutados y verificados en verde:
    - `pnpm install` (0 errores)
    - `pnpm snapshot` (genera `data/snapshots/nfl/latest.json` con 15 partidos y `data/snapshots/premier-league/latest.json` con 10 partidos)
    - `pnpm build` (7 paquetes compilados + `scripts/check-no-demo-prod.mjs` + `scripts/lint-codebase.mjs` con 0 hex fuera de tokens y 0 `catch` vacíos; First Load JS compartido `103 kB` < `180 kB`)
    - `pnpm test` (12 tareas Vitest en verde: `@pitchlab/tokens` 3, `@pitchlab/contracts` 4, `@pitchlab/sports-assets` 3, `@pitchlab/engines-reference` 386, `@pitchlab/ui` 2, `@pitchlab/ingest` 5, `@pitchlab/web` 4)
    - `pnpm e2e` (8/8 tests de Playwright en `desktop` `1440×900` y `mobile` `390×844`, incluyendo auditoría `axe` WCAG 2A/2AA en oscuro y claro, verificación FD-16 de cero nombres internos/proveedores en DOM, cero overflow horizontal en `375, 390, 768, 1024, 1280, 1440 px`, bloqueo `429` tras 5 intentos fallidos, desbloqueo con PIN, deep-link `/app/premier-league/games/[gameId]` y cierre de sesión)
  - Capturas generadas e inspeccionadas en `test-results/screenshots/`: `landing-{desktop,mobile}-{dark,light}.png`, `login-{desktop,mobile}-dark.png`, `signup-{desktop,mobile}-dark.png`, `panel-pl-{desktop,mobile}-{dark,light}.png`, `modal-pl-{desktop,mobile}-dark.png`.

### HIST-01 · Corpus histórico y benchmark walk-forward — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - `services/ingest/src/history/`: catálogo de ligas, normalización de openfootball (con `stage` para Apertura/Clausura y alias de equipos), normalización de nflverse (identidad por franquicia: `STL`/`LA`, `OAK`/`LV`, `SD`/`LAC`), auditoría de calidad, constructor determinista con caché y manifiesto de digests, y CLI `pnpm history`.
  - Corpus generado en `data/history/`: **34,168 partidos** de **7 ligas** y **108 temporadas** (NFL 1999–2026; fútbol 2010-11–2026-27), `datasetId` `0ddb5936…`, **0 errores** y 1 advertencia (Ligue 1 2019-20 cancelada por COVID). Reporte: `Reportes/datos/HISTORICO-QUALITY.md`.
  - Benchmark `pnpm backtest:history` (walk-forward con ventana móvil de 1,095 días, bootstrap 2,000): en las 6 ligas de fútbol el log loss del modelo supera al ingenuo con IC 95 % que excluye el 0 (Premier League n=5,898, **0.9748** vs 1.0653, Δ −0.0905 [−0.1002, −0.0799]; Serie A la mayor mejora, Δ −0.1029; Liga MX n=781, Δ −0.0499). NFL n=7,204, log loss **0.6545** vs ingenuo 0.6860 (Δ −0.0315) y **+0.0421 frente al mercado sin vig** (n=5,426). Reportes en `Reportes/modelos/BACKTEST-HISTORICO.*`.
  - Corrección en `packages/models/src/nfl/ratings.ts`: el centrado por medias distintas hacía divergir el solver con muestras > ~240 partidos (intercepto ~1e38). Se eliminó el centrado (el ridge identifica el modelo) y se añadió una prueba de regresión con 320 partidos.
  - Documentación: `docs/architecture/HISTORICAL_DATA.md` (contrato, licencias, límites) y `docs/architecture/STACK_REVIEW.md` (recomendación recibida frente al stack real).
- **No hecho / fuera de alcance:**
  - Persistencia en Postgres (`packages/db` sigue sin existir) y export a Parquet/R2.
  - Histórico de Liga MX anterior a 2018-19 y posterior a 2024-25 (openfootball no publica; la vía es API-Football, con reserva de licencia).
  - Elo explícito, regresión y GBM: el corpus queda listo, los modelos no.
- **Contratos, tablas o componentes pedidos a otros owners:**
  - `packages/db`: tablas `team`, `game`, `game_result` y `model_version`/`prediction` para cargar el corpus (ADR-007). Mientras tanto, `data/history/*.jsonl` es la fuente.
- **Decisiones tomadas (y por qué):**
  - Identidad de equipos propia (`<liga>.<slug>`) y no el manifiesto de emblemas: un club relegado o una franquicia mudada debe conservar historial.
  - `availableAt` = fin del día del partido + 24 h, el lag conservador de `DATA_ARCHITECTURE.md` §6.
  - Las líneas de cierre de nflverse se guardan como `research-only`: sirven para comparar contra el mercado, no para publicarlas.
  - Los 404 de openfootball se cachean como `<archivo>.missing` para que `--offline` sea reproducible.
- **Riesgos o deuda:**
  - El corpus son 14.4 MB de JSONL en el repo; si crece, mover a Parquet/R2 (ADR-007).
  - La temporada en curso de openfootball llega a 2026-09-20; la frescura diaria depende de los adaptadores en vivo.
  - El benchmark NFL solo cubre 5,426 partidos con moneyline de cierre (nflverse no las publica para todos los años).
- **Cómo probarlo:**
  - `pnpm history` (2ª corrida usa caché; 0 errores, 1 advertencia), `pnpm backtest:history`, `pnpm --filter @pitchlab/ingest exec vitest run --pool=threads` (22 tests) y `pnpm --filter @pitchlab/models exec vitest run --pool=threads` (13 tests).

### DATA-DOCS-01 · Investigación de datos históricos de fútbol y evidencia de validación — 2026-11-08 — Rama `feat/pre-mvp` (complementa HIST-01, sin tocar `services/ingest`)
- **Hecho:**
  - Carpeta completa `docs/data/football/` (18 documentos): ligas reales, auditoría de datos previos, investigación de proveedores (solo fuentes gratuitas, FD-02), matriz de cobertura verificada, clasificación de licencias (13 derechos), estrategia descubrimiento→piloto→backfill, modelo canónico explicado, arquitectura de ingesta, quality gates, feature engineering con reglas anti-leakage, auditoría de motores con números, plan de mejora, protocolo de validación, cuotas históricas, automatización, costos (3 escenarios), registro de riesgos y `FOOTBALL_DATA_MASTER_REPORT.md` (las 20 preguntas + checklist de aceptación).
  - Correcciones de ingesta verificadas con rebuild completo (cotejado con HIST-01, mismo `datasetId` `0ddb5936…`): `phase: "postseason"` para liguilla en `normalize-openfootball.ts` (antes toda la liguilla quedaba como `regular`) y `expectedGamesPerSeason: 306` para Liga MX. Resultado: **0 errores / 1 advertencia** (Ligue 1 2019-20, COVID).
  - Sonda del plan Free de API-Football (3 solicitudes del presupuesto del usuario): Liga MX histórica **2023 accesible** (340 fixtures, 44 rondas `Apertura - 1` … `Clausura - Final`), **2019 y 2021 bloqueadas por plan** (`errors=plan`). Conclusión: el hueco Liga MX 2021-22→2023-24 se llena con 2 solicitudes (temporadas 2022 y 2023) salvo el Ap2021+Cl2022, que requiere plan de pago o FD-14. Plan de implementación documentado en `docs/data/football/06-*.md` §3 (pendiente de codificar para no chocar con la sesión de HIST-01).
  - Benchmark walk-forward re-ejecutado en las 7 ligas tras el fix de `nfl/ratings.ts` (mismos números que HIST-01; football 6/6 Δ concluyente, NFL 0.6545 vs ingenuo, mercado sin vig 0.6106 gana al modelo) y números capturados como evidencia citable en los docs.
- **No hecho / fuera de alcance:**
  - El backfill de Liga MX 2022/2023 (código del normalizador API-Football histórico) quedó especificado, no implementado.
  - Tests automatizados de invariantes anti-leakage como parte de `pnpm test`.
- **Decisiones tomadas (y por qué):**
  - Monarcas Morelia → Mazatlán FC se trata como **una franquicia** (misma identidad, regla NFL STL→LA); Atlante sigue siendo otro club. Quedó señalado el mapeo de marca `Mazatlán→atlante` como bug del manifest de emblemas (no afecta al histórico).
  - football-data.org (adaptador nuevo de HIST-01) queda clasificado **PENDIENTE** en la matriz de licencias hasta clasificar sus términos.
- **Riesgos o deuda:**
  - Archivos temporales de otra sesión sin limpiar: `.tmp-probe*.mjs` (raíz) y `services/ingest/tests/.tmp-bench.test.ts`.
- **Cómo probarlo:**
  - Leer `docs/data/football/FOOTBALL_DATA_MASTER_REPORT.md` (§2 próximos pasos, §3 checklist); re-verificar números con `pnpm backtest:history --leagues=premier-league,la-liga,bundesliga,serie-a,ligue-1,liga-mx,nfl`.

### DATA-02 · Cuotas de cierre, estadísticas de partido y benchmark contra el mercado — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - `pnpm history:odds` (`services/ingest/src/history/football-data-co-uk.ts`, `research.ts`, `odds-cli.ts`): descarga 85 CSV de football-data.co.uk (5 ligas × 17 temporadas), normaliza y empareja contra el corpus. Resultado: **28,827 filas**, 28,825 con cuotas, **25,503 con cuotas de cierre** (desde 2020-21; antes pre-partido), **28,824 con tiros, tiros a puerta, córners y tarjetas**, y **25,572 emparejadas = 100 % del corpus de las cinco grandes ligas**.
  - Dataset separado `data/history/research/` (research-only, en `.gitignore`), con `manifest.json` de digests/cobertura y `Reportes/datos/ODDS-QUALITY.md`. El corpus canónico no se contamina: la licencia de football-data.co.uk no está localizada.
  - Benchmark con mercado sin vig integrado en `history-backtest.ts`: fútbol 0.9737–1.0034 frente a mercado 0.9500–0.9813 (Δ **+0.0175 a +0.0237**); NFL 0.6545 vs 0.6106 (Δ **+0.0421**). El modelo gana al ingenuo y **todavía pierde contra el mercado**, que es justo la referencia que faltaba.
  - Identidades corregidas en el corpus: `Bor. Mönchengladbach`→`borussia-monchengladbach`, `FC Internazionale Milano`→`inter`, `ES Troyes AC`→`estac-troyes`. El corpus queda en 34,168 partidos y **235 equipos** (datasetId `35fea620…`; research `649c0cba…`).
  - Refactor: caché HTTP y `mapLimit` extraídos a `history/http.ts` (los usan ambos constructores).
- **No hecho / fuera de alcance:**
  - Extender los resultados de 1993-94 a 2009-10 con la misma fuente (≈ 17 temporadas más de entrenamiento).
  - Cuotas para Liga MX (football-data.co.uk no la cubre).
  - Features de GBM con tiros/córners y un Elo explícito.
- **Decisiones tomadas (y por qué):**
  - Dataset research **separado** y fuera de git: se puede usar para backtests y features, pero no se publica ni se redistribuye (licencia sin localizar).
  - Prioridad de cuota: Pinnacle > B365 > promedio; `timing: closing` cuando la fuente lo publica y `pre-match` antes de 2020-21, declarado en cada fila.
  - Sin cuotas no se inventan precios (`odds: null`); los clubes de temporadas antiguas fuera del corpus se reportan como no emparejados.
- **Riesgos o deuda:**
  - El dataset research son ~18 MB locales; se regenera con `pnpm history:odds` (85 descargas) o `--offline` con la caché.
  - Depende de la tasa del sitio: el constructor usa concurrencia 2–3 y caché; no hay scraping agresivo.
- **Cómo probarlo:**
  - `pnpm history:odds` (cobertura 100 %), `pnpm backtest:history --leagues=premier-league,la-liga,bundesliga,serie-a,ligue-1,liga-mx,nfl`, `pnpm --filter @pitchlab/ingest exec vitest run --pool=threads` (31 tests) y `pnpm --filter @pitchlab/models exec vitest run --pool=threads` (13).

### DATA-03 · Histórico research 1993-2026 y experimento de entrenamiento extendido — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - `pnpm history:odds` amplía el dataset research a **1993-94–2026-27**: **59,531 partidos** (5 ligas × 34 temporadas), 43,754 con cuotas, **25,689 de cierre**, 41,596 con tiros/córners/tarjetas; 25,572 emparejados = 100 % del corpus. Manifest `af8e893a…`; ~31 MB locales (gitignored).
  - Los clubes antiguos que no existen en el corpus reciben un slug derivado (`Wimbledon` → `premier-league.wimbledon`) y se reportan en `fallbackNames` (9–15 por liga). Cero filas descartadas por nombres en las cinco ligas.
  - El benchmark puede entrenar con ese histórico (`--include-research-history`) sin tocar la evaluación. El benchmark público sigue siendo determinista y solo con el corpus versionado; el experimento se guarda aparte en `Reportes/modelos/BACKTEST-HISTORICO-RESEARCH.md`.
  - Resultado del experimento: más volumen **no** cierra la brecha. PL 0.9748→0.9771, LaLiga 0.9752→0.9728, Bundesliga 0.9951→0.9982, Serie A 0.9737→0.9735, Ligue 1 1.0034→1.0021; Δ frente al mercado se mantiene en 0.017–0.025. n sube porque las primeras jornadas ya alcanzan el mínimo de entrenamiento.
- **No hecho / fuera de alcance:**
  - Histórico de Liga MX por API-Football (2022 y 2023 accesibles con el plan Free; queda para la siguiente ronda).
  - Elo y features as-of (siguiente paso de modelado).
- **Decisiones tomadas (y por qué):**
  - El benchmark público **no** usa research por defecto: debe reproducirse sin descargar datos de licencia incierta. El experimento es opt-in y queda en un reporte separado.
  - Más datos no justifican cambiar el modelo por sí solos; la mejora tiene que venir de features y de un GBM.
- **Riesgos o deuda:**
  - El dataset research pesa ~31 MB y crece con cada temporada; sigue fuera de git.
  - La evaluación con research cambia `n`, así que las comparaciones con el benchmark público no son exactamente sobre el mismo conjunto de partidos (queda anotado en `HISTORICAL_DATA.md` §8).
- **Cómo probarlo:**
  - `pnpm history:odds` (1993-2026), `pnpm backtest:history` (público, mismos números), `pnpm backtest:history --include-research-history` (experimento) y `pnpm --filter @pitchlab/ingest exec vitest run --pool=threads` (32 tests).

### DATA-04 · Liga MX histórica vía API-Football (research-only) — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - `services/ingest/src/history/api-football-history.ts`: descarga una temporada por solicitud respetando la caché y el presupuesto diario (90), normaliza rondas `Apertura - N` / `Clausura - N` y liguilla (`Reclasificacion`, `Quarter-finals`, `Semi-finals`, `Final`), y mapea 18 clubes a los slugs del corpus (incluye variantes con acento y `U.N.A.M. - Pumas`).
  - `pnpm history:odds` integra Liga MX: **1,022 partidos** de 2022-23, 2023-24 y 2024-25 (312 emparejados con el corpus); **2021, 2025 y 2026 bloqueados por el plan Free** («try from 2022 to 2024»). Dataset research total: **60,553 filas, 6 ligas**, 25,884 emparejadas y 100 % de cobertura de cuotas sobre las cinco grandes.
  - Benchmark research: Liga MX pasa de 781 a **982 predicciones** y Δ frente al ingenuo de −0.0499 a **−0.0522** al entrenar con los 710 partidos extra; el resto de ligas no cambia.
  - Se conserva `stage`, `period` y `phase` en las filas research para poder filtrar liguilla o construir features después.
- **No hecho / fuera de alcance:**
  - Cuotas para Liga MX (el endpoint de fixtures no las trae).
  - Temporadas 2021, 2025 y 2026 (requieren plan de pago o FD-14).
  - Elo/GBM con las features ya disponibles.
- **Decisiones tomadas (y por qué):**
  - Liga MX histórica va al dataset **research-only**, no al corpus publicable: la licencia de API-Football sigue sin confirmar para uso comercial.
  - Se cachean las temporadas accesibles y se registran las bloqueadas en el manifiesto; no se reintentan en cada corrida para no gastar presupuesto.
- **Riesgos o deuda:**
  - Presupuesto Free: 100 solicitudes/día compartidas con el snapshot de Liga MX; la corrida consume 6 y deja margen.
  - El plan Free puede cambiar de temporadas accesibles; el manifiesto deja la evidencia de lo observado el 2026-11-09.
- **Cómo probarlo:**
  - `pnpm history:odds` (6 solicitudes, 1,022 filas de Liga MX), `pnpm backtest:history --include-research-history` (reporte research con Liga MX n=982) y `pnpm --filter @pitchlab/ingest exec vitest run --pool=threads` (36 tests).

### MODEL-01 · Elo calibrado y mezcla con Dixon-Coles — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - `packages/models/src/football/elo.ts`: Elo incremental para clubes con ventaja de local, multiplicador por diferencia de goles, regresión a la media al cambiar de temporada y modelo de empate decreciente. API `createEloTracker` (predice antes de actualizar, sin fuga) y helpers `eloExpectedScore` / `goalDifferenceMultiplier`.
  - Hiperparámetros elegidos con **validación temporal** en Premier League: ajuste en 2010-11…2018-19 y evaluación en 2019-20…2026-27 (K=15, localía 65, regresión 0.10, empate 0.30 − 0.0005·|Δ|). 540 combinaciones evaluadas; 8 pruebas unitarias.
  - `history-backtest` incorpora Elo y una **mezcla 50/50** con Dixon-Coles; el reporte muestra DC, Elo, mezcla, ingenuo, mercado y los Δ con bootstrap.
  - Resultado: Elo solo queda a la par de Dixon-Coles, pero la mezcla gana en las 6 ligas. Δ mezcla−DC de −0.0012 a −0.0025; IC 95 % excluye 0 en PL, LaLiga, Bundesliga y Ligue 1. Frente al mercado, la brecha baja de 0.0175–0.0237 a **0.0152–0.0225** (cierra 10–15 %).
  - En el benchmark research (entrena con 1993-2010): mezcla 0.9744 en PL (DC 0.9771) y 0.9703 en LaLiga (DC 0.9728).
- **No hecho / fuera de alcance:**
  - La mezcla no se publica: sigue siendo candidata hasta pasar el gate de `PREDICTION_ARCHITECTURE.md` §5.
  - El peso de la mezcla está fijo en 0.5 (elegido a priori, no ajustado sobre el test).
  - GBM/features as-of (siguiente paso).
- **Decisiones tomadas (y por qué):**
  - Elo se selecciona en una ventana anterior al periodo evaluado para no contaminar la comparación.
  - La mezcla se evalúa sin optimizar el peso en el test; un peso aprendido queda para cuando exista un GBM que lo haga con validación propia.
- **Riesgos o deuda:**
  - Elo no aporta por sí solo; su valor está en la mezcla y como feature futura. Si el GBM no usa Elo, la mezcla 50/50 es el candidato actual más fuerte.
  - La mejora de 0.002 en log loss es real pero pequeña: la brecha frente al mercado sigue en ~0.02.
- **Cómo probarlo:**
  - `pnpm backtest:history` (público, tabla DC/Elo/mezcla) y `pnpm backtest:history --include-research-history`; `pnpm --filter @pitchlab/models exec vitest run --pool=threads` (21 tests) y `pnpm --filter @pitchlab/ingest exec vitest run --pool=threads` (36 tests).

### MODEL-02 · Regresión logística y stacking con features as-of — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - `packages/models/src/football/logistic.ts`: regresión logística multinomial (softmax) con estandarización de features, L2 y descenso de gradiente determinista; `fitMultinomialLogistic` / `predictMultinomialLogistic` y 4 pruebas unitarias.
  - `history-backtest` construye features as-of por partido: probabilidades de Dixon-Coles y Elo, descanso (días desde el último partido), forma (puntos de los últimos 5) y diferencia de tiros a puerta (cuando el dataset research tiene estadísticas). El modelo se reajusta cada 10 jornadas y predice las siguientes; evaluación solo con partidos posteriores.
  - Resultado del experimento (`--with-stack`): **no supera a la mezcla 50/50** salvo en Bundesliga (0.9941 vs 0.9957). PL 0.9748 vs 0.9744; LaLiga 0.9743 vs 0.9703; Serie A 0.9729 vs 0.9707; Ligue 1 1.0050 vs 0.9993; Liga MX 1.0104 vs 1.0020. La mezcla sigue siendo el mejor candidato.
  - Stack desactivado por defecto para que el benchmark público siga siendo rápido y reproducible; se activa con `--with-stack`.
- **No hecho / fuera de alcance:**
  - GBM real (LightGBM) con las mismas features y más capacidad.
  - Optimizar el peso de la mezcla o el número de iteraciones del stack con validación propia.
- **Decisiones tomadas (y por qué):**
  - El stack se descarta como candidato publicado: con 12 features lineales no aporta sobre la mezcla y añade complejidad.
  - Se conserva el código y el flag porque son la base del GBM y permiten repetir el experimento.
- **Riesgos o deuda:**
  - Las features de tiros dependen del dataset research (big-five); Liga MX y las temporadas antiguas no las tienen.
  - El stack reajusta sobre muestras de predicciones pasadas; con pocos datos al inicio es ruidoso (primeros ~400 partidos sin stack).
- **Cómo probarlo:**
  - `pnpm backtest:history --include-research-history --with-stack` (reporte research con columna Stack); `pnpm --filter @pitchlab/models exec vitest run --pool=threads` (25 tests) y `pnpm --filter @pitchlab/ingest exec vitest run --pool=threads` (36 tests).

### MODEL-03 · GBM (LightGBM) sobre features as-of — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - `pnpm backtest:history --export-features` exporta una fila por partido evaluado con features as-of (Elo, Dixon-Coles, descanso, forma, tiros a puerta), probabilidades base y cuota de mercado. Archivo `Reportes/modelos/features-asof.jsonl` (25,554 filas, gitignored).
  - `services/models/train_gbm.py` (LightGBM 4.7 vía API nativa, sin scikit-learn): walk-forward por temporada con entrenamiento agrupado entre ligas y one-hot de liga; compara GBM contra DC, Elo, mezcla y mercado con bootstrap pareado.
  - `services/models/README.md` y `requirements.txt`; dependencias locales en `services/models/.deps` (gitignored) porque el sandbox bloquea `pip install` global/temporal.
  - Resultado: el GBM **no supera a la mezcla**. Premier League 0.9710 vs 0.9695, LaLiga 0.9729 vs 0.9703, Bundesliga 0.9930 vs 0.9915, Serie A 0.9726 vs 0.9707, Ligue 1 1.0019 vs 0.9993; Δ +0.0015 a +0.0027 con IC 95 % que incluye el 0. Frente al mercado sigue a +0.017–0.024.
- **No hecho / fuera de alcance:**
  - Features nuevas (xG, alineaciones, lesiones, cuotas de apertura) que sí podrían mover la aguja.
  - Integrar el GBM al pipeline de predicción live (sigue siendo experimento).
- **Decisiones tomadas (y por qué):**
  - Entrenamiento agrupado entre ligas: con una sola liga hay muy pocas filas por temporada y el GBM sobreajusta (log loss 1.02–1.06). El one-hot de liga recupera la escala y lo deja cerca de la mezcla.
  - No se toca el benchmark público: GBM y stacking son experimentos opt-in; la mezcla 50/50 sigue siendo el candidato.
- **Riesgos o deuda:**
  - `services/models/.deps` son ~112 MB locales; no se versiona. El README documenta la instalación.
  - LightGBM sin scikit-learn: se usa `lgb.train`, no el wrapper `LGBMClassifier`.
- **Cómo probarlo:**
  - `pnpm backtest:history --include-research-history --export-features=Reportes/modelos/features-asof.jsonl`; `$env:PYTHONPATH="services/models/.deps"; python services/models/train_gbm.py`; reporte `Reportes/modelos/BACKTEST-GBM.md`.

### DATA-05 · xG histórico (Understat vía Wayback) y Elo-xG — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - `services/ingest/src/history/understat.ts` + `xg.ts`: scrapea Understat a través de la Wayback Machine (el sitio en vivo respondía «We will come back soon»), elige el snapshot más reciente con ≥90 % de los partidos, decodifica `datesData`, normaliza ids con los slugs del corpus y cachea el HTML en `data/history/raw/understat/`.
  - Dataset `data/history/research/xg/`: **18,241 partidos** de las cinco grandes (2014-15 a 2025-26), 18,209 emparejados con el corpus; cobertura 62–79 % (Understat empieza en 2014 y algunos snapshots son parciales). Reporte: `Reportes/datos/XG-QUALITY.md`.
  - Nuevo candidato **Elo-xG**: ratings actualizadas con xG en vez de goles y su mezcla con Dixon-Coles (50/50). En el benchmark research: Premier League **0.9720** vs 0.9744 de la mezcla 50/50; LaLiga 0.9673 vs 0.9703; Bundesliga 0.9933 vs 0.9957; Serie A 0.9670 vs 0.9707; Ligue 1 0.9985 vs 0.9993. Δ de −0.0036 a −0.0065, IC 95 % que excluye el 0 en las cinco ligas.
  - La brecha frente al mercado baja a **0.012–0.018** (antes 0.017–0.025). Es la mayor mejora del motor y proviene de datos nuevos.
  - xG también entra como feature del GBM (`xg_home`, `xg_away`): mejora poco (+0.001–0.002), así que el valor está en las ratings xG.
- **No hecho / fuera de alcance:**
  - xG para Liga MX (Understat no la cubre) y temporadas previas a 2014-15.
  - Poisson sobre xG (afinar Dixon-Coles) y xG por tiro/periodo.
  - Publicar el dataset: es research-only por licencia.
- **Decisiones tomadas (y por qué):**
  - Wayback en lugar de scraping directo: el sitio estaba caído y el archivo conserva el HTML con los datos.
  - xG solo entra al benchmark research (igual que el histórico 1993-2010): el benchmark público sigue reproducible sin datos research.
  - La mezcla con xG se evalúa con peso fijo 0.5; no se ajusta sobre el test.
- **Riesgos o deuda:**
  - Depende de Wayback: si un snapshot falta o es parcial, esa temporada queda incompleta (Ligue 1 2024-25: 171/306).
  - Understat no declara licencia; el dataset no se versiona y no debe publicarse.
  - El Elo-xG necesita goles como fallback cuando no hay xG (Liga MX, pretemporadas).
- **Cómo probarlo:**
  - `pnpm history:xg` (18,241 filas, 5 ligas); `pnpm backtest:history --include-research-history` (reporte con columnas Elo-xG y Mezcla-xG); `pnpm --filter @pitchlab/ingest exec vitest run --pool=threads` (41 tests, 5 nuevos de Understat).

### MODEL-04 · Dixon-Coles sobre xG y totales con xG — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - `fitDixonColes` acepta goles fraccionarios (xG): la rejilla de ρ redondea al marcador entero. Prueba de regresión con xG en `packages/models/tests/models.test.ts`.
  - Benchmark: se ajusta un segundo Dixon-Coles sobre xG (solo filas con xG) y se evalúan **totales O/U 2.5 con xG** frente a goles y mercado; nueva columna `totalsXg` en el reporte research.
  - Experimentos: (a) mezcla DC-goles + DC-xG = 0.9682 vs 0.9712 de DC-goles en Premier League, pero combinada con Elo-xG solo mejora 0.0003 → no se integra; (b) totales xG mixtos: mejora Serie A y Ligue 1 (~0.004), empeora LaLiga y PL; (c) hiperparámetros del Elo-xG no estables con validación temporal (K=8 gana en validación y pierde en test).
- **No hecho / fuera de alcance:**
  - Poisson bivariado con xG por equipo y covariables.
  - xG por tiro/periodo (requeriría páginas de partido de Understat).
- **Decisiones tomadas (y por qué):**
  - No se cambia el candidato publicado: la mejora de DC-xG en 1X2 es marginal y no consistente; se documenta el experimento.
  - Los totales xG quedan como evaluación, no como modelo de producción, hasta verlos consistentes en más ligas.
- **Riesgos o deuda:**
  - El modelo xG se ajusta solo con partidos que tienen xG (2014+), así que su ventana efectiva es menor que la del modelo de goles.
  - Understat sigue caído; las temporadas 2025-26 están incompletas.
- **Cómo probarlo:**
  - `pnpm backtest:history --include-research-history` (columna LogLoss xG en totales); `pnpm --filter @pitchlab/models exec vitest run --pool=threads` (32 tests).

### DATA-06 · xG de 2026-27 y descargador incremental de estadísticas de Liga MX — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - El dataset xG incorpora la temporada **2026-27** con las columnas `HxG`/`AxG` de football-data.co.uk (la única temporada en que las publica). Total: **18,693 partidos**, 18,442 emparejados con el corpus; cobertura 63.4–80.1 % por liga.
  - `services/ingest/src/history/api-football-stats.ts` + `pnpm history:api-stats`: descarga `/fixtures/statistics` de Liga MX de forma incremental y reanudable, con caché por fixture, presupuesto diario (90) y reconstrucción de `liga-mx-stats.jsonl`.
  - Hallazgo: API-Football devuelve `expected_goals = null` para Liga MX (sí trae xG en otras competiciones). Sí entrega tiros, tiros a puerta, córners, posesión y tarjetas.
  - La cuota diaria se agotó durante la prueba (90/90) y quedaron 10 partidos cacheados; el descargador continuará en las siguientes corridas sin repetir trabajo.
- **No hecho / fuera de alcance:**
  - Liga MX sigue sin xG: habría que buscar otra fuente o confirmar que API-Football lo habilite.
  - Integrar las estadísticas de Liga MX al benchmark cuando la cobertura sea suficiente (hoy 10 partidos).
- **Decisiones tomadas (y por qué):**
  - El xG de 2026-27 entra por football-data.co.uk en vez de Understat: son los mismos datos y no depende de Wayback.
  - El descargador de API-Football se diseñó incremental para no agotar cuota ni repetir fixtures ya cacheados.
- **Riesgos o deuda:**
  - Presupuesto Free compartido con el snapshot de Liga MX; 90 solicitudes/día para ~340 fixtures por temporada.
  - Las estadísticas de Liga MX no incluyen xG, así que no mejoran el Elo-xG de esa liga.
- **Cómo probarlo:**
  - `pnpm history:xg --offline` (18,693 filas), `pnpm history:api-stats --build-only` (dataset desde caché) y `pnpm --filter @pitchlab/ingest exec vitest run --pool=threads` (45 tests, 3 nuevos de estadísticas).

### DATA-07 · Estadísticas de Liga MX desde ESPN — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - `services/ingest/src/history/espn-liga-mx.ts` + `pnpm history:espn`: enumera los calendarios de los 18 equipos en ESPN, deduplica eventos y descarga el `summary` de cada partido terminado (sin API key ni cuota). Parsea tiros, tiros a puerta, córners, posesión y tarjetas, y empareja con el corpus por equipos y fecha (±2 días).
  - Dataset `data/history/research/liga-mx-espn-stats.jsonl`: **278 de 340 partidos** de 2024-25 emparejados; research-only por licencia.
  - Integración como features del benchmark (tiros a puerta) para Liga MX y experimentos: Elo de tiros 1.0032 vs mezcla actual 1.0030; GBM con features ESPN 1.0056 vs 1.0020. **Sin mejora**, documentado.
  - Understat sigue caído; el xG de 2026-27 ya entra por football-data.co.uk.
- **No hecho / fuera de alcance:**
  - Ampliar ESPN a 2021-2023 (el adaptador lo permite con `--seasons`).
  - xG para Liga MX: ESPN no lo trae y API-Football devuelve `null`.
- **Decisiones tomadas (y por qué):**
  - Se conserva el dataset ESPN aunque no mejore el candidato: cubre un hueco de datos del producto y sirve para features cuando haya más temporadas.
  - No se cambia la mezcla publicada; los experimentos quedan fuera del reporte público.
- **Riesgos o deuda:**
  - Sin cuota, pero ESPN puede cambiar el esquema o bloquear; el adaptador cachea todo y tolera fallos por evento.
  - Solo 2024-25 está cubierto; 2021-2023 requeriría otra corrida (~340 summaries por temporada).
- **Cómo probarlo:**
  - `pnpm history:espn --seasons=2024 --offline` (278 partidos desde caché) y `pnpm --filter @pitchlab/ingest exec vitest run --pool=threads` (50 tests, 2 nuevos de ESPN).

### DATA-08 · ESPN ampliado a cuatro temporadas de Liga MX — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - El constructor ESPN ahora mergea con el dataset existente y empareja contra los ids del **corpus canónico y del research** (las temporadas 2021-22…2023-24 solo existen en research).
  - Dataset: **1,054 partidos** de Liga MX con tiros, tiros a puerta, córners, posesión y tarjetas: 2020-21 (135), 2022-23 (308), 2023-24 (305), 2024-25 (306). Research-only.
  - Experimento con histórico ampliado: Elo de tiros 1.0072; DC + Elo de tiros 1.0022 (igual que la mezcla actual); mezcla triple DC + Elo + Elo-tiros **1.0016** (mejora 0.0006). No se cambia el candidato por una diferencia tan pequeña.
- **No hecho / fuera de alcance:**
  - xG real para Liga MX (ESPN/API-Football no lo dan).
  - Integrar el Elo-tiros al reporte público; la mejora no supera el ruido.
- **Decisiones tomadas (y por qué):**
  - Merge incremental en el constructor: cada corrida conserva las temporadas anteriores.
  - Se prioriza cobertura de datos sobre un cambio de modelo marginal.
- **Riesgos o deuda:**
  - 2020-21 solo tiene 135 de 342 partidos emparejados (los summaries de esa temporada están incompletos en ESPN).
  - La licencia de ESPN sigue sin clasificar; el dataset no se versiona.
- **Cómo probarlo:**
  - `pnpm history:espn --seasons=2024,2023,2022,2021 --offline` (1,054 partidos desde caché) y `pnpm --filter @pitchlab/ingest exec vitest run --pool=threads` (50 tests).

### MODEL-05 · xG estimado por tiros y Elo-xG en todas las ligas — 2026-11-09 — Rama `feat/pre-mvp`
- **Hecho:**
  - `services/ingest/src/history/xg-estimate.ts`: regresión lineal tiros/SOT → xG ajustada sobre **18,692 partidos** de las cinco grandes con xG y estadísticas (R² ≈ 0.51). Coeficientes documentados.
  - `pnpm history:xg` rellena con xG estimado (`estimated-from-shots`) los partidos sin xG real: 2010-2014, 2025-26 incompleto y toda Liga MX. Dataset xG: **41,718 filas**, cobertura **100 %** del corpus en las cinco grandes y 34.7 % en Liga MX.
  - Benchmark research: la mezcla Elo-xG gana a la mezcla 50/50 en todas las ligas (Δ −0.0034 a −0.0075; IC 95 % excluye el 0 en cuatro de cinco) y Liga MX mejora de 1.0020 a **1.0011**. Brecha frente al mercado: **0.0116–0.0171**.
- **No hecho / fuera de alcance:**
  - El xG estimado no sustituye al real en la published model; el benchmark público sigue sin datos research.
  - La estimación es lineal con tiros/SOT; un GBM de xG podría afinarla.
- **Decisiones tomadas (y por qué):**
  - Estimar xG desde tiros permite extender el Elo-xG a temporadas sin proveedor y a Liga MX, con mejora medida.
  - Se marca la fuente en cada fila (`estimated-from-shots`) para no confundirla con xG observado.
- **Riesgos o deuda:**
  - El Elo-xG con xG estimado empeora solo (0.9866 en PL), pero su mezcla con DC sigue ganando; el ruido lo absorbe la mezcla.
  - La regresión se ajustó en las cinco grandes y se transfiere a Liga MX; puede tener sesgo de liga.
- **Cómo probarlo:**
  - `pnpm history:xg --offline` (41,718 filas) y `pnpm backtest:history --include-research-history` (reporte con Elo-xG y mezcla-xG en Liga MX); `pnpm --filter @pitchlab/ingest exec vitest run --pool=threads` (50 tests).













