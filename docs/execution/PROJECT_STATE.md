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





