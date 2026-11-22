# ADR-061 · Calibración Dixon-Coles IPF, Blindaje Anti-EV, Contrato de Parlays (`<= 6`), CLV Creíble y Cierre `100 %` de `ADR-057`

- **Estado:** Aceptada
- **Fecha:** 2026-11-21
- **Rama origen:** `gemini-dos`
- **Relacionadas:** `ADR-027`/`ADR-049` (Spacetime Suite v5.1 y motores cuantitativos), `ADR-054`/`ADR-055` (Catálogo de `34` familias, Bzzoiro Unlimited y `Cero-Fuga`), `ADR-056` (*Constraint-First*, *ratchet* y *Error-Driven Correction*), `ADR-057` (Ciberseguridad Nivel ALTO, `api-guards.ts`, `safe-logger.ts` e inmutabilidad SQL `0025`/`0027`), `ADR-058`/`ADR-059`/`ADR-060` (Hub de ligas, `/app/picks`, `/app/parlays` y anti-slop).

---

## Contexto

Las auditorías cuantitativas, funcionales y de seguridad de **Ola 7 / Ola 7+** identificaron cuatro clases de defectos que exigían corrección en causa raíz y guardrails estáticos permanentes:

1. **Deriva inflacionaria en `fitDixonColes`, `NaN` en equipos inéditos y precedencia obsoleta de `live_matchday_v3_snapshot.json`:** en `packages/models/src/football/dixon-coles.ts`, el denominador de defensa visitante (`defenseDen[r.away]`) y la información de Fisher (`exposureDefense[r.away]`) omitían `* homeAdvantage`, y `baseRate` acumulaba deriva al escalarse por medias geométricas en vez de re-anclarse a los goles observados. Además, el muestreo Monte Carlo en `predictFootball` indexaba `model.attack[home]!`/`model.defense[away]!` sin fallback `?? 1`, propagando `NaN` hacia intervalos y `confidence.score` en equipos sin partidos previos. Por separado, `packages/spacetime/data/live_matchday_v3_snapshot.json` (anclado por hash SHA-256 en pruebas de remediación) podía sobreescribir snapshots recién refiteados con totales inflados (p. ej. `Tottenham vs Ipswich` `3.01` vs `4.72`).
2. **EV alucinado y ambigüedad de mercados:** permitir de-vig mezclando cuotas de casas distintas (*cross-book*), indexar mercados sin `line`, mezclar `corners_team` con `corners_total` o aceptar casas fuera de la lista blanca producía bordes (`EV+`) irreales y líneas sin unidades explícitas.
3. **Inconsistencia en Parlays y Mi Récord:** el máximo de piernas difería entre motor, hojas móviles y endpoints; el boleto vacío mostraba `-5000`; la interfaz exponía jerga matemática interna (`Fréchet-Hoeffding`, `Student-t`, `Armador Inteligente Geodesic v2.0`); el SGP no cubría de forma uniforme los `5` deportes; y el descarte de outliers de `clvPct` variaba entre `/app/lab`, perfil público, exportación CSV y notificaciones.
4. **Brechas residuales de `ADR-057` y ausencia de reglas estáticas preventivas:** `GET /api/me/email-preferences/unsubscribe` ejecutaba escritura en BD vía `GET`, `/api/alerts` y `/api/live/alerts` no exigían `requireFullAccess: true`, las páginas RSC de arbitraje necesitaban compuerta `getViewerAccess()`, `/api/beta/unlock` y `/api/beta/logout` seguían fuera de `api-guards.ts`, persistían `console.*` directos en `apps/web/src/server/*.ts` y las redirecciones externas debían rechazar puertos no estándar (`parsed.port === ""`).

---

## Decisión

### 1. Corrección raíz IPF de Dixon-Coles, refit determinista offline y guardia de frescura sobre `live_matchday_v3_snapshot.json`

- **Algoritmo IPF y robustez en `packages/models/src/football/dixon-coles.ts` (`2bbeb649`, `4bbf8543`):**
  - Se corrigen `defenseDen[r.away] += w * attack[r.home]! * homeAdvantage` y `exposureDefense[r.away] += r.weight * attack[r.home]! * homeAdvantage`.
  - Se aplica prior bayesiano adaptativo (`clamp(12 - avgTeamMatches * 0.2, 6, 10)`) y re-anclaje canónico exacto `baseRate = observedGoals / canonicalTotalIndex` en cada iteración.
  - En `predictFootball`, los equipos inéditos usan fallback seguro `?? 1` y desviaciones estándar finitas (`seLog*`/`seLogHomeAdvantage`), complementados por saneo `Number.isFinite` en `packages/models/src/picks.ts` (`clamp01`, `confidenceIndex`) y `packages/models/src/football/analyze.ts`.
- **CLI offline determinista (`services/ingest/src/refit-football-snapshots-cli.ts`, `cc1d46dc`):** ejecutado sobre las **`41` ligas de fútbol abiertas** (`772` partidos refiteados, **`978` partidos `FT` preservados** intactos y `data/snapshots/shell-index.json` regenerado).
- **Guardia de frescura y anti-inflación (`apps/web/src/server/outlook.ts`, `apps/web/src/server/platform-data.ts`):** se exporta `isStaleInflatedFootballOutlook` y se cablea en `applyOutlook(..., snapshotGeneratedAt)` y `outlookDetailFor`. Cuando el snapshot local refiteado es estrictamente más reciente (`> 24 h`) que `live_matchday_v3_snapshot.json` y el v3 infla `total > +0.35` goles o `Over 3.5 > +0.06`, prevalece el snapshot local refiteado **sin mutar** `packages/spacetime/data/live_matchday_v3_snapshot.json` (preservando su anclaje por hash en `v5_1_remediation.test.ts`).

### 2. Blindaje Anti-EV alucinado y calidad de mercado

- **De-vig estricto misma-casa (`0` fallback cross-book):** `resolveEventSelectionDeVigProb` (`apps/web/src/server/book-quotes.ts`) exige todas las selecciones complementarias dentro de la **misma casa** (priorizando casas sharp) para computar `computeAdaptiveDeVig`; si falta la contraparte en esa casa, devuelve `null` en lugar de mezclar cuotas de casas diferentes.
- **Topes auditables unificados (`book-quotes.ts`, `picks-catalog.ts`, `PicksFinderView.tsx`, `OddsCompareView.tsx`, `bzzoiro-odds.ts`, `bzzoiro-nba-rich.ts`):** se aplican de forma uniforme los umbrales máximos `MAX_SHARP_EV_PCT = 18` (**`18 %`** sharp), `MAX_SOFT_EV_PCT = 22` (**`22 %`** soft) y `MAX_DEVIG_PROB_DIVERGENCE = 0.12` (**`|p - deVig| <= 12 %`**) para descartar ventajas anómalas.
- **Claves sensibles a `line`, mercados segregados, allowlist y unidades obligatorias:** toda clave de búsqueda de mercado incluye `line`; `corners_team` permanece separado de `corners_total`; `isPermittedMarketQuoteBook` se exige tanto en servidor como en UI; y toda línea numérica en catálogo, picks, parlays y sellado simple/combinado expresa explícitamente su unidad (`goles`, `puntos`, `carreras` o conteos).

### 3. Contrato único de Parlays (`MAX_PARLAY_LEGS = 6`), SGP multi-deporte y CLV creíble unificado en Mi Récord

- **Tope único `MAX_PARLAY_LEGS = 6`:** unificado de punta a punta en `parlay-engine.ts`, `daily-parlay.ts`, `ParlayAndQuantViews.tsx`, `PersonalParlayQuickBar.tsx`, `MobileParlaySheet.tsx`, `BetBuilderDrawer.tsx`, `POST /api/me/journal` y `POST /api/parlays/sgp` (ambos con esquemas Zod `.strict()` y `.max(6)`).
- **Higiene UX y SGP multi-deporte:** boleto vacío muestra `—` (**cero `-5000`**), cero jerga matemática visible (`Fréchet-Hoeffding`, `Student-t`, `Armador Inteligente Geodesic v2.0`), diversidad real en `3` pasadas en el generador, propagación del momio manual de casa al sellar, CTA primario único *Sellar* y Bet Builder SGP multi-deporte cubriendo los **`5` deportes** (fútbol, NFL, NBA, MLB, NHL).
- **Mi Récord (`/app/lab`) y CLV creíble sin mutar `sealed_picks`:** `clvPct?: number` (`null → undefined`), filtros divididos en `Tipo` y `Estado`, piernas legibles con escudos/unidades/elipsis limpia y helper único `isCredibleClvPct(clvPct, isParlay)` (`packages/ui/src/platform/record-stats.ts`: `MIN_CREDIBLE_CLV_PCT = -60`, `MAX_CREDIBLE_SINGLE_CLV_PCT = 25` para simples `[-60, 25]` y `MAX_CREDIBLE_PARLAY_CLV_PCT = 50` para parlays `[-60, 50]`), reutilizado en `record-stats.ts`, `platform-provider.tsx` (`exportJournalCsv`), `notifications.ts` y `record-audit-helpers.ts` para excluir outliers únicamente en lectura/cálculo sin alterar registros inmutables de `sealed_picks`.

### 4. Cierre `100 %` de `ADR-057` y guardrails permanentes *Error-Driven Correction*

- **Baja de correos sin mutación en `GET` (`apps/web/app/api/me/email-preferences/unsubscribe/route.ts`):** `GET` solo verifica la firma HMAC y responde un formulario HTML seguro (`<form method="POST">` sin JavaScript inline) más el enlace canónico `/app/account`; únicamente `POST` escribe en BD (preservando RFC 8058 One-Click).
- **Compuertas `requireFullAccess` y `Cero-Fuga` RSC:** `requireFullAccess: true` obligatorio en `/api/alerts` y `/api/live/alerts`; `getViewerAccess()` obligatorio en `apps/web/app/app/[league]/arbitros/page.tsx` y `apps/web/app/app/[league]/r/[refereeSlug]/page.tsx` (en coordinación con `loadLeagueHubEnrichment` de `ADR-060`).
- **Cobertura `100 %` de `safeLogger` en `apps/web/src/server/*.ts`:** migración completa de todas las llamadas `console.*` en módulos de servidor (`auth.ts`, `viewer-access.ts`, `stripe-webhook.ts`, `cortex.ts`, `mailer.ts`, `lifecycle-emails.ts`, `platform-data.ts`, `account-emails.ts`, `badges.ts`, `funnel.ts`, `league-news.ts`, `live.ts`, `pick-results.ts`, `snapshots.ts`, `spacetime.ts`, `team-profile.ts`, `transfer-emails.ts`) a `logSecurityEvent` (`safe-logger.ts`).
- **Cobertura `100 %` de `api-guards.ts` en rutas no-webhook:** `/api/beta/logout` y `/api/beta/unlock` quedan envueltas en `withPublicRead` (`failClosed: true`, `verifySameOrigin: true`, `cacheControl: "no-store"`), completando `87/89` rutas envueltas directamente (`100 %` de rutas no-webhook fuera del dispatcher de Better Auth `/api/auth/[...all]` con rate-limit fail-closed en `GET`/`POST`/callbacks y `/api/webhooks/stripe` validado por HMAC Stripe).
- **Redirecciones externas endurecidas (`parsed.port === ""`):** `EditProfileDialog.tsx`, `SocialAndTipsterViews.tsx`, `PlanTab.tsx`, `LoginSurfaceV4.tsx` y `TechAndPricingSurfaces.tsx` exigen `parsed.protocol === "https:"`, `parsed.port === ""` y ausencia de credenciales (`!parsed.username && !parsed.password`).
- **Tres reglas permanentes *Error-Driven Correction* en `scripts/lint-codebase.mjs` (siempre activas, sin baseline):**
  1. `no-raw-server-console`: bloquea `console.(log|info|warn|error)` en `apps/web/src/server/*.ts` (excluyendo `safe-logger.ts`).
  2. `no-forbidden-math-jargon`: prohíbe cadenas de jerga matemática interna (`Fréchet-Hoeffding`, `Armador Inteligente Geodesic`) en UI (`packages/ui/src/**`, `apps/web/app/**`).
  3. `no-curved-accent-slop`: prohíbe `border-left`/`border-inline-start` combinados con `border-radius` sobre celdas/filas acentuadas en `apps/web/app/*.css`.

---

## Alternativas descartadas

1. **Modificar manualmente `packages/spacetime/data/live_matchday_v3_snapshot.json` en este repositorio:** descartado porque está anclado por digest SHA-256 en `v5_1_remediation.test.ts` y su regeneración canónica pertenece al pipeline upstream `prediction-lab/run_matchday_refresh.py`; la guardia `isStaleInflatedFootballOutlook` garantiza calibración inmediata sin romper integridad criptográfica.
2. **Corregir registros históricos de CLV modificando filas en `sealed_picks`:** descartado por violar la inmutabilidad probatoria y los triggers SQL `0025`/`0027` (`ADR-057`); el filtrado `isCredibleClvPct` opera únicamente en lectura/agregación.
3. **Permitir de-vig cross-book o mantener exenciones manuales en `/api/beta/*` y `console.*` en servidor:** descartado porque reintroduce bordes fantasma (`EV+`), fugas potenciales de PII/tokens en logs y brechas en la gobernanza uniforme de seguridad.

---

## Consecuencias

- **Positivas:** proyecciones de fútbol calibradas sin deriva IPF ni `NaN` en `41` ligas abiertas (`772` partidos refiteados, `978` `FT` intactos); eliminación estructural de EV alucinado y colisiones de línea; contrato único de `2–6` piernas sin `-5000` ni jerga matemática; paridad total de CLV creíble preservando `sealed_picks` inmutable; cierre `100 %` de `ADR-057` en `safeLogger`, `api-guards.ts`, `Cero-Fuga` RSC/API y redirecciones; y prevención mecánica permanente vía `scripts/lint-codebase.mjs`.
- **Compromisos:** queda como seguimiento upstream resincronizar `packages/spacetime/data/live_matchday_v3_snapshot.json` desde `prediction-lab/run_matchday_refresh.py`; toda futura ruta en `apps/web/src/server/` o `apps/web/app/api/` debe cumplir `no-raw-server-console` y `require-api-wrapper` desde el primer commit.

---

## Validación y métricas verificadas

- **Refit Dixon-Coles IPF (`cc1d46dc`, `53/53` ligas verificadas en `--dry-run`, `41` ligas abiertas escritas):** `772` partidos refiteados, `978` `FT` preservados intactos y `shell-index.json` regenerado (`premier-league` media `3.07 → 2.83` goles y `over35 > 50 %` `1 → 0`; `laliga` `3.28 → 2.85`; `bundesliga` `3.98 → 3.41`, `over35 > 50 %` `7 → 2`; `europa-league` `3.00 → 2.87`, `6 → 0`; `segunda-espana` `3.05 → 2.72`, `7 → 0`; `0` `NaN` en equipos inéditos).
- **Pruebas de regresión y propiedades:** `packages/models/tests/ola7-dixon-coles-invariants.test.ts`, `apps/web/tests/outlook.test.ts` (precedencia ante v3 obsoleto/inflado), `apps/web/tests/ola7-security-regressions.test.ts` (`GET` unsubscribe sin mutación, `requireFullAccess` en alertas, RSC arbitraje, `.strict()`/`.max(6)`, `0` `console.*` servidor, cobertura `api-guards.ts`, `parsed.port === ""`), `apps/web/tests/property-invariants.test.ts` y `apps/web/e2e/ola7-usability-audit.spec.ts`.
- **Guardrails y auditoría `pstack`:** `node scripts/lint-codebase.mjs` (`812` archivos / `0` violaciones, *ratchet* reducido a **`7,590`**, `-172` en Ola 7 y `-1,306` acumulado desde `8,896`, más las `3` nuevas reglas permanentes sin baseline de Ola 7+), `node scripts/check-no-secrets.mjs` (`8,351` archivos / `0` secretos), `node scripts/check-prod-readiness.mjs` (`12/12` OK) y auditoría `pstack` (`v7-quant-picks`, `v7-security-fd16`) en **`0 CRÍTICO / 0 ALTO / 0 MEDIO`**.
