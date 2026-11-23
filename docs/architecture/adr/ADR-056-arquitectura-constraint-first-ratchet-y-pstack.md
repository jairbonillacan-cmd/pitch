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
   - **Máquinas de estado `fc.commands` (`apps/web/tests/state-machines-fc.test.ts`):** `3` modelos secuenciales (`fc.modelRun` / `fc.asyncModelRun`) sobre PGlite real con migraciones `0025`/`0027` en `sealed_picks`, ciclo de vida de `BetBuilder` SGP y detector *scraping velocity* en `withSessionRead`.
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

- **Linter instructivo (`node scripts/lint-codebase.mjs`) al cierre definitivo de Ola 5 (`513374cf`):**
  - **`802` archivos escaneados / `0` violaciones** (`scripts/tests/lint-codebase.test.mjs`: `16/16` pruebas unitarias cubriendo todas las reglas).
- **Estado final verificado del *ratchet* en `scripts/lint-ratchet-baseline.json` (`513374cf`):**
  - **Total actual: `8,063`** (reducción neta de **`-833`** desde la línea base inicial `8,896`, acumulada entre Tanda A `-282`, Tanda B `-502`, *Deslop* `-41`, remediación adversarial Ola 5 `-7` y ajuste loopback E2E `-1`).
  - **Desglose exacto por regla:**
    - `no-monolithic-use-platform`: **`0`** (`0` archivos — erradicado al 100 %).
    - `require-api-wrapper`: **`0`** (`0` archivos — `86/86` rutas API cubiertas).
    - `no-slop-wrapper-bloat`: **`4`** (`4` archivos).
    - `no-view-use-effect`: **`50`** (`21` archivos).
    - `no-unsafe-type-assertion`: **`85`** (`36` archivos).
    - `no-unsafe-number-cast`: **`366`** (`94` archivos).
    - `no-prod-comments`: **`7,558`** (`379` archivos).
- **Pasada de *Deslop* por sustracción (`bc90a395`):**
  - **`-571` líneas netas** (`+308` inserciones / `-879` eliminaciones en `23` archivos), eliminando CSS/código sin uso, cerrando notas cosméticas y reduciendo el *ratchet* sin regresiones funcionales.
- **Batería secuencial final de Ola 5 completada en `513374cf` (detalle completo en `docs/execution/PROJECT_STATE.md`):**
  - Auditoría adversarial `pstack` de 4 ejes cerrada con **`0 CRÍTICO / 0 ALTO`**.
  - `pnpm -r --workspace-concurrency=1 typecheck` (`11/11` PASS), `pnpm -r --workspace-concurrency=1 test` (`11/11` paquetes · `213` passed | `0` failed | `2` skipped · `1,907` passed | `0` failed | `25` skipped, incluyendo `property-invariants.test.ts`, `state-machines-fc.test.ts` y `api-guards.test.ts`), `pnpm run eval:cortex` (`24/24` PASS), `pnpm run eval:alerts` (`16/16` PASS), `pnpm build` (`11/11` paquetes PASS), `pnpm build-storybook` (`4,494` módulos PASS) y `pnpm e2e` (`71` passed | `0` failed | `1` skipped por diseño, incl. `apps/web/e2e/ui-fuzzing.spec.ts` + Axe WCAG AA).

---

## Adenda Ola 8 (2026-11-22) · Deuda estructural a 0

- **Cierre estructural definitivo (`gemini-dos`, `817` archivos escaneados / `0` violaciones):** **`6` de las `7` reglas del *ratchet*** alcanzaron **`0` definitivo** en todo el monorepo y quedaron **bloqueadas contra regresión** mediante prueba permanente en `scripts/tests/lint-codebase.test.mjs` (`20/20` pruebas en `scripts/tests/*.mjs`) que exige `0` archivos y `0` entradas de deuda en `scripts/lint-ratchet-baseline.json`:
  - `no-monolithic-use-platform`: **`0`** (`0` archivos).
  - `require-api-wrapper`: **`0`** (`0` archivos).
  - `no-slop-wrapper-bloat`: **`4 → 0`** (`0` archivos).
  - `no-view-use-effect`: **`44 → 0`** (`0` archivos).
  - `no-unsafe-type-assertion`: **`73 → 0`** (`0` archivos).
  - `no-unsafe-number-cast`: **`333 → 0`** (`0` archivos).
- **Reducción acumulada del *ratchet*:** el total en `scripts/lint-ratchet-baseline.json` descendió de **`7,237 → 6,761`** (**`-476`** en Ola 8 y **`-2,135`** acumulado desde la línea base inicial `8,896`); únicamente restan comentarios históricos en `no-prod-comments` (`6,783 → 6,761` en `350` archivos).
