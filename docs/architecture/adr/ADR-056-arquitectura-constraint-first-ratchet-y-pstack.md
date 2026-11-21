# ADR-056 · Arquitectura *Constraint-First*, *Ratchet* Descendente y Verificación Independiente `pstack`

- **Estado:** Aceptada
- **Fecha:** 2026-11-21
- **Rama origen:** `gemini-dos`
- **Relacionadas:** `ADR-004` (Storybook como contrato), `ADR-031` (Drizzle y PGlite), `ADR-034` (`Cortex IA` y validador determinista), `ADR-050` (Portabilidad sin lock-in), `ADR-051`–`ADR-055` (Server-First, Cero-Jank, diseño plano editorial y catálogo de 34 familias), `ADR-057` (Ciberseguridad Nivel ALTO sin lock-in), `ADR-058` (`LeagueCapabilityContract`, rediseño editorial `.pl-sf-*` y features Bzzoiro/Scout Picks).

---

## Contexto

Escalar el desarrollo de PitchLab con sesiones multiagente en paralelo (`/swarm`) sobre un monorepo de `11` paquetes evidenció el modo de fallo clásico de la ingeniería asistida por IA: cuando las reglas viven solo como prosa en documentos de instrucciones, los agentes producen *slop* (coerciones laxas `Number("") === 0`, casteos `as any` / `as unknown as`, comentarios racionalizando parches, `useEffect` acoplados en vistas, imports a barrels, hooks monolíticos y CSS con *jank*) y copian cualquier deuda existente como si fuera convención oficial del repositorio.

Además, revisar manualmente miles de líneas de diff por tanda no escala y permite regresiones sutiles en contratos, seguridad o ergonomía móvil. Se necesitaba pasar de *Blind Trust* a *Invested Trust* (*Software Garden*, metodología *Constraint-First* / *Dune* / `pstack` de Lauren Tan) sin frenar la entrega con una reescritura *big-bang* del legado histórico ni provocar contención de memoria (OOM) en estaciones locales de `16 GB` RAM / `4` cores.

---

## Decisión

Se institucionaliza la **Arquitectura *Constraint-First*** de PitchLab, codificada en `docs/architecture/CONSTRAINT_FIRST_PLAYBOOK.md` y sustentada en cuatro garantías ejecutables:

### 1. Pirámide Inversa de Confianza (tipos → lint `< 1 s` → verificación formal/real → prosa mínima)

1. **Nivel 1 · Tipos nominales y fronteras (`packages/contracts/src/branded.ts`):**
   - Estados inválidos irrepresentables mediante tipos nominales y constructores estrictos: `UnitProbability`, `PositiveDecimalOdds`, `OpaqueResourceId`, `CanonicalPublicSlug`, `SpacetimeAnchoredQuote`, `RedactedVisitorPick` y `SanitizedErrorPayload`.
   - Primitivas de frontera obligatorias: `parseStrictFiniteNumber`, `assertUnitProbability`, `parsePositiveDecimalOdds`, `createSpacetimeAnchoredQuote`, `createRedactedVisitorPick`, `assertNoRestrictedKeysInVisitorPayload`, `containsForbiddenFd16Term`, `isSafePublicLabel` y `CLIENT_MATCH_CONTEXT_FACTOR_LABELS`.
2. **Nivel 2 · Análisis estático instructivo `< 1 s` con *ratchet* (`scripts/lint-codebase.mjs`, `scripts/lint-ratchet-baseline.json`, `scripts/tests/lint-codebase.test.mjs` con `16` pruebas):**
   - Cada violación emite un diagnóstico accionable de 3 partes (`[REGLA] archivo:linea — QUÉ | POR QUÉ | USA EN SU LUGAR`) sin requerir compilación TypeScript completa.
   - **`6` reglas inmediatas (`0` tolerancia global):** `no-hex-outside-tokens`, `no-empty-catch`, `no-cloud-sdk-lockin`, `no-web-barrels`, `no-css-jank` (`backdrop-filter`, `backdrop-blur-*`, `transition-all`, transición en `box-shadow`) y `no-forbidden-ui-copy` (bloquea copy de usuario prohibido como etiquetas numéricas de confianza o estado parcial de datos).
   - **`7` reglas con *ratchet* descendente y `0` tolerancia en archivos nuevos o rediseñados (`--strict-files`):** `no-monolithic-use-platform`, `require-api-wrapper`, `no-prod-comments` (regla del 99 % sin comentarios literales en producción para eliminar *escape hatches* y *context poisoning*), `no-view-use-effect`, `no-unsafe-number-cast`, `no-unsafe-type-assertion` (`as any` y `as unknown as`) y `no-slop-wrapper-bloat` (`@ts-ignore`, `@ts-nocheck`, `eslint-disable` sin causa estructural `-- <razón>`, `TODO`/`FIXME`).
   - El archivo `scripts/lint-ratchet-baseline.json` solo decrece mediante `node scripts/lint-codebase.mjs --shrink-baseline` y bloquea cualquier incremento neto o introducción de deuda en archivos nuevos.
3. **Nivel 3 · Verificación formal generativa (`fast-check`), evals deterministas y runtime real:**
   - **Property-Based Testing (`apps/web/tests/property-invariants.test.ts`):** `13` propiedades `fast-check` verificando `de-vig` proporcional/Shin/adaptativo (sin `NaN`/`Infinity`, suma `≈ 1.0`), cotas de Fréchet-Hoeffding en Cópula Gaussiana y Student-t QMC (`evaluateBetBuilder`, `evaluateSgpCopulaV5`), liquidación determinista `gradeCatalogPick` (`FT` siempre auditable; `NS`/`LIVE` siempre `pending`), redacción `Cero-Fuga` y sanitización `FD-16` en `sanitizeCanonicalPublicUrl`.
   - **Máquinas de estado `fc.commands` (`apps/web/tests/state-machines-fc.test.ts`):** `3` modelos secuenciales (`fc.modelRun` / `fc.asyncModelRun`) sobre PGlite real con migración `0025` en `sealed_picks`, ciclo de vida de `BetBuilder` SGP y detector *scraping velocity* en `withSessionRead`.
   - **Evals deterministas de IA (`services/ai-eval/`):** `pnpm run eval:cortex` (`eval-cortex.ts` + `cortex-golden.json`) y `pnpm run eval:alerts` (`eval-alerts.ts` + `alerts-golden.json`).
4. **Nivel 4 · Prosa mínima vinculante:**
   - `AGENTS.md`, `docs/architecture/CONSTRAINT_FIRST_PLAYBOOK.md`, `docs/design/FEATURE_MAP.md` y los ADRs se reservan para criterios de producto, vocabulario compartido y punteros de contexto; ninguna restricción expresable en tipos o lint debe vivir solo como párrafo.

### 2. Eliminación de APIs trampa (lección *Dune*)

- Se erradica el consumo monolítico de `usePlatform()` en producción (`no-monolithic-use-platform: 0`), reemplazado por hooks divididos (`usePlatformCore`, `usePlatformActions`, `useParlayState`, `useSocialState`, `useOverlayState`, `useJournalEntries`, `useWatchlistGameIds`).
- Se prohíbe `useEffect` / `useLayoutEffect` en vistas nuevas o rediseñadas (`club/`, `public/`, `apps/web/app/`) y se encapsulan los efectos seguros en `@pitchlab/ui/hooks` (`packages/ui/src/platform/hooks/index.ts`: `useSafeEffect`, `useMediaQuery`, `useVisibilityPolling`, `useDebouncedValue`, `useLocalStorageState`, `useAbortableJson`, `useUrlSearchTab`, `usePwaInstallAndPush`).
- Se sustituye la coerción `Number(x)` por `parseStrictFiniteNumber` / `parsePositiveDecimalOdds` / `parseUnitProbability`, y se obliga a envolver todo endpoint `/api/**` en `apps/web/src/server/api-guards.ts` (`ADR-057`).

### 3. Verificación independiente `pstack`, *Error-Driven Correction*, *Verification Review* y *Deslop*

- **Separación autor/verificador (`pstack`):** cada tanda paralela corre con escritoras en `workspace: "share"` sobre archivos 100 % disjuntos y `3–4` verificadoras independientes en lectura (`workspace: "inherit"`) enfocadas en contratos, seguridad, `FEATURE_MAP.md` y CSS/DOM. Ninguna tanda se cierra con hallazgos `CRÍTICO` o `ALTO` abiertos.
- **Aislamiento anti-OOM:** las escritoras `share` validan en `< 1 s` solo con `node scripts/lint-codebase.mjs --strict-files=<archivos>` y nunca ejecutan `tsc`, `vitest`, `next build`, `storybook` ni `playwright` en paralelo; el coordinador fusiona y ejecuta los gates pesados estrictamente 1 a la vez en secuencia.
- ***Error-Driven Correction*:** todo bug recurrente descubierto en auditoría o QA deja al menos una barrera mecánica permanente (tipo nominal, regla de linter o invariante `fast-check`).
- ***Verification Review* visual y cierre por sustracción:** capturas emparejadas ANTES/DESPUÉS con `scripts/capture-visual-review.mjs` (`1440×900` y `375×812`, `dark` y `light`, salidas en `os.tmpdir()` fuera de Git), seguidas en Ola 5 por una pasada dedicada de *Deslop* por sustracción y *UI Fuzzing* adversarial en navegador real (`apps/web/e2e/ui-fuzzing.spec.ts`).

---

## Alternativas descartadas

1. **Reescritura *big-bang* de todo el código legado para llevar comentarios y `useEffect` a cero antes de rediseñar:** descartado porque paralizaría semanas de producto y multiplicaría el riesgo de regresiones en pantallas estables; el *ratchet* garantiza `0` deuda nueva y reducción monotónica verificable en cada ola.
2. **Usar ESLint con análisis de tipos completo (`typescript-eslint`) como gate en cada worktree:** descartado por costo de CPU/RAM en máquinas de `16 GB` con múltiples agentes concurrentes; `scripts/lint-codebase.mjs` escanea el monorepo en `< 1 s` con mensajes instructivos específicos del dominio.
3. **Permitir que el mismo agente escritor apruebe su bloque o confiar únicamente en pruebas unitarias con mocks:** descartado por sesgo de confirmación; los verificadores independientes `pstack`, PGlite real, `fast-check` y las capturas BEFORE/AFTER en servidor loopback detectaron y cerraron defectos reales de cascada CSS, tipos y targets táctiles antes de llegar a cierre.

---

## Consecuencias

- **Positivas:** deuda controlada por compilador y linter en `< 1 s`; fronteras críticas (`usePlatform()` y wrappers `/api/**`) migradas al `100 %`; verificación matemática y de máquinas de estado sobre miles de casos generados; ciclos multiagente paralelos sin colisiones de archivos ni OOM; y auditorías objetivas por evidencia reproducible.
- **Compromisos:** todo archivo nuevo o editado en modo estricto debe mantener `0` comentarios literales, `0` `useEffect` en vistas, `0` `Number(` y `0` `as any`/`as unknown as`, lo que exige invertir primero en nombres claros, tipos nominales y hooks compartidos; el *ratchet* impide introducir excepciones rápidas sin justificación estructural.

---

## Validación y métricas verificadas

- **Estado del *ratchet* en `scripts/lint-ratchet-baseline.json` (al cierre de Mega-Ola `2B + 3`, `8bc5eeb0`):**
  - `no-monolithic-use-platform`: **`0` archivos / `0` ocurrencias** (erradicado al 100 %).
  - `require-api-wrapper`: **`0` archivos / `0` ocurrencias** (`86/86` rutas API cubiertas).
  - Deuda legada total: **`8,896 → 8,112`** (`-784` tras Tanda A `-282` y Tanda B `-502`; `no-view-use-effect: 120 → 51` en `22` archivos, `no-prod-comments: 8,267 → 7,601`, `no-unsafe-number-cast: 415 → 370`, `no-unsafe-type-assertion: 88 → 86`, `no-slop-wrapper-bloat: 6 → 4`).
- **Gates ejecutados en `8bc5eeb0` (previo al cierre secuencial final de Ola 5):**
  - `scripts/tests/lint-codebase.test.mjs`: `16` pruebas unitarias cubriendo todas las reglas del linter.
  - `pnpm --filter @pitchlab/ui typecheck` y `pnpm --filter @pitchlab/web typecheck`: **PASS**.
  - `pnpm --filter @pitchlab/ui test`: **PASS** (`47/47` archivos, `315/315` pruebas).
  - Suites críticas `@pitchlab/web` (incluyendo `apps/web/tests/property-invariants.test.ts`, `apps/web/tests/state-machines-fc.test.ts` y `apps/web/tests/api-guards.test.ts`): **PASS** (`7/7` archivos, `64/64` pruebas).
  - `pnpm run eval:cortex`: **PASS (`24/24`:** `8/8` válidos, `16/16` adversariales rechazados, `24/24` fallback determinista).
  - `pnpm run eval:alerts`: **PASS (`16/16`:** `13/13` aceptados, `3/3` rechazados).
- *Nota de cierre:* las métricas de la batería secuencial completa de Ola 5 (`pnpm test` 11/11, `pnpm build`, `pnpm build-storybook`, `pnpm e2e` con `ui-fuzzing.spec.ts`) se registran en `docs/execution/PROJECT_STATE.md` inmediatamente al concluir Ola 5.
