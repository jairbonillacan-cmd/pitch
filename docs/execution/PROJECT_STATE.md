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
