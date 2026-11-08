# Quality gates y criterios de aceptación

> **Propósito:** qué debe cumplir cada PR, cada sección y cada prompt para considerarse terminado. Es medible y, en lo posible, automático.
> **Consumidores:** CI, agentes, revisores y el linter de prompts.
> **Fecha:** 2026-11-08 · Reúne `QUALITY_GATES.md` y `ACCEPTANCE_CRITERIA.md` del plan original.

## 1. Gates automáticos (CI, bloqueantes)

| Gate | Herramienta | Falla si… |
|---|---|---|
| Tipos | `tsc --noEmit` (strict, `noUncheckedIndexedAccess`) | Hay cualquier error. `any` explícito fuera de `**/*.d.ts` (regla ESLint). |
| Lint | ESLint: `boundaries`, `no-empty` (sin `catch {}`), sin colores fuera de tokens (`no-restricted-syntax` sobre hex y `rgb(`), `jsx-a11y` | Cualquier error |
| Unit | Vitest | Falla un test. Las reglas críticas (`can`, lock de picks, métricas, odds y motores) bajan de 100 % de cobertura de ramas. |
| Motores | Tests dorados de `engines-reference` | Δ ≠ 0 frente a los valores dorados |
| Stories | Storybook test-runner (interacción y axe) | Un componente exportado sin story por estado, una violación de axe o una interacción rota |
| Visual | Playwright screenshots en 375/768/1200/1440 | Diferencia > umbral sin aprobación explícita en el PR |
| E2E | Playwright sobre el preview | Falla un journey de la sección (`USER_JOURNEYS.md`) |
| Datos | Zod sobre fixtures de proveedores y test de leakage | Payload inválido o feature con `available_at > predicted_at` |
| Producción sin demo | Script de build | Hay un adaptador `demo` registrado con `NODE_ENV=production` |
| Seguridad | gitleaks, `pnpm audit` (severidad alta) y test de autorización por feature | Un secreto, una vulnerabilidad alta o un endpoint sin `requireEntitlement` |
| Rendimiento | Lighthouse CI en las rutas públicas, `size-limit` por ruta | Fuera de los presupuestos de `DEPLOYMENT.md` §5 |
| Anti-slop | `avoid-ai-design` `detect.mjs` sobre `apps/web` y `packages/*ui*` | Patrones de AI slop detectados sin justificación en el PR |
| Ownership | `scripts/check-ownership.mjs` | El PR toca globs de dos owners sin la etiqueta `cross-owner` |

## 2. Checklist del PR (revisión humana)

- [ ] Cada cifra visible tiene fuente y hora (y n cuando aplica). No hay números inventados.
- [ ] Están los estados loading, empty, error, stale, locked y demo de cada bloque de datos.
- [ ] Probado en móvil (375 px) sin scroll horizontal y con objetivos ≥ 44 px.
- [ ] Teclado: todo es alcanzable con el foco visible. El orden de tabulación es lógico.
- [ ] Copy en español de México con la voz de marca: sin «gana», «seguro», «pick del día» ni promesas.
- [ ] No se agregaron dependencias sin justificación (cada nueva lleva su motivo en el PR).
- [ ] No hay lógica de dominio en componentes ni recálculo de métricas en la UI.
- [ ] Handoff escrito (`AGENT_EXECUTION_PLAN.md` §4).

## 3. Criterios de aceptación por tipo

### 3.1 Componente del Design System

1. Stories de todos sus estados (`FRONTEND_ARCHITECTURE.md` §5) más una interacción por control.
2. Props tipadas con tipos de `contracts`. No hace fetch.
3. Contraste verificado con los pares de `contrast-audit.csv`. No usa solo color.
4. Documentado en su story (uso, cuándo no usarlo y accesibilidad).
5. Snapshots en 4 breakpoints aprobados.

### 3.2 Sección

1. Las rutas y los parámetros coinciden con `ROUTE_MAP.md`.
2. Los datos llegan como `DataState` y los entitlements se verifican en el servidor.
3. Los journeys de la ficha (`SECTION_INDEX.md`) pasan en E2E.
4. Usa componentes existentes. Los nuevos están justificados y tienen stories.
5. La métrica de la ficha está instrumentada (evento de PostHog en `analytics.ts`).
6. Lighthouse y axe están dentro de los umbrales.
7. Hay handoff.

### 3.3 Adaptador de datos

1. Validación Zod más tests con fixtures grabados (respuesta real anonimizada).
2. Idempotente (correr dos veces no duplica) y registra `ingestion_run`.
3. Respeta presupuestos y rate limits (prueba con un límite simulado).
4. Mapea a IDs canónicos y deja lo que no reconoce en la cola de reconciliación.
5. Atribución y `source` correctos.

### 3.4 Modelo

1. Preregistro antes de evaluar.
2. Test de leakage en verde.
3. Métricas reproducibles desde `code_ref` y `params`.
4. Pasa el gate de `PREDICTION_ARCHITECTURE.md` §5 para publicarse.

## 4. Linter de prompts (`scripts/lint-prompts.mjs`, F5)

Cada `prompts/**/NN-*.md` debe:

1. Contener las 18 secciones de `prompts/_TEMPLATE.md` (A–R) con contenido. No admite «TBD», «TODO», «lorem» ni secciones vacías.
2. Citar solo rutas que existan en `ROUTE_MAP.md`, documentos que existan en `docs/` y tipos exportados en `packages/contracts` (verificación por nombre).
3. Declarar globs de ownership (M) que **no se solapen** con los de otro prompt de la misma wave y que estén dentro de `AGENT_OWNERSHIP.md`.
4. Incluir al menos un criterio de aceptación medible (con número, herramienta o journey) por cada bloque funcional.
5. No contener frases vagas prohibidas: «moderno y bonito», «interfaz atractiva», «haz que se vea bien», «como Draftea» (se permite «patrón de UX_FINDINGS» citado).
6. Referenciar las ID de `SECTION_INDEX.md` y su wave.
7. Pesar menos de 60 KB (si es más largo, partirlo en subprompts).

Salida: un reporte por archivo. La CI falla ante cualquier error.
