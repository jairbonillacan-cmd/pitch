---
status: accepted
date: 2026-11-13
updates:
  - ADR-013
---

# ADR-034: `Cortex IA` sobre hechos cerrados vía OpenRouter (`DeepSeek V4.1 Flash`) con validador determinista numérico y léxico

- **Estado:** Aceptada (`accepted`). Concreta y modifica [ADR-013](ADR-013-pitchlab-ai-openrouter-modelo-barato-w5.md).
- **Fecha:** 2026-11-13 (implementada en `apps/web/src/server/cortex.ts` y aprobada para lanzamiento en `DECISIONES_FUNDADOR_F4.md` §3.3).

## Contexto

[ADR-013](ADR-013-pitchlab-ai-openrouter-modelo-barato-w5.md) planteó construir PitchLab AI sobre Vercel AI SDK con *tool calling* abierto sobre servicios internos. Al implementar la síntesis previa de `Cortex IA` para la ficha de partido surgieron tres riesgos concretos:

1. Permitir múltiples rondas de *tool calling* en un modelo ultrabarato multiplica la latencia, encarece tokens de entrada/salida y abre superficie de alucinación entre pasos.
2. En OpenRouter un mismo identificador de modelo puede enrutarse entre proveedores con diferencias de costo de hasta `13×` y políticas distintas de retención de prompts.
3. Cualquier cifra inventada por el LLM (un porcentaje, marcador o momio inexistente) o cualquier mención de proveedores/fórmulas internas rompería de inmediato [ADR-027](ADR-027-spacetime-v3-datos-verificables-y-herramientas-de-preview.md) (solo datos verificables) y `FD-16`.

## Decisión

1. **Llamada HTTP única sobre JSON cerrado de hechos (`cortexFactsFor` en `apps/web/src/server/cortex.ts`), sin SDK ni *tool calling*:**
   - El servidor empaqueta antes de invocar al modelo un objeto inmutable `CortexFacts` con únicamente las salidas verificadas de `Spacetime Suite v3.0`: partido, liga, probabilidades enteras, proyección de marcador, casa y probabilidades sin vig (si hay mercado vigente), los 3 factores de mayor `|impactLogit|`, bajas reportadas y estadio.
   - Modelo por defecto: `deepseek/deepseek-v4.1-flash-1017` (`~US$0.0003` por resumen, `temperature: 0.3`, `max_tokens: 220`, timeout estricto de `6,000 ms` con `AbortController`).
   - Privacidad y costo acotado en OpenRouter: siempre se envía `provider: { data_collection: "deny" }` y, cuando se configura `OPENROUTER_PROVIDER`, se fija `{ order: [provider], allow_fallbacks: false }` para impedir desvíos a endpoints caros.
2. **Validador determinista post-generación (`validateCortexText`) con respaldo silencioso a plantilla:**
   - **Lista blanca exacta de números (`allowedNumbers`):** se extraen todos los literales numéricos presentes en `CortexFacts`; si el texto devuelto contiene **cualquier** número que no exista exactamente en esa lista, la respuesta se descarta (`numero_no_respaldado`).
   - **Filtro léxico `FD-16` (`FORBIDDEN_TERMS`):** se rechaza cualquier mención de estimadores estadísticos (`dixon`, `coles`, `poisson`, `logit`, `elo`, `kelly`, `shin`, `devig`) o proveedores internos (`openrouter`, `deepseek`, `nflverse`, `openfootball`, `api-football`, `understat`, `espn`, `pinnacle`, etc.).
   - **Cota editorial (`40`–`520` caracteres, máx. 3 oraciones):** si el texto falla cualquier regla, agota el tiempo o falta `OPENROUTER_API_KEY`, `cortexSummary` devuelve `null` y la interfaz muestra sin errores la síntesis determinista del partido.
3. **Caché en memoria por huella de datos:** el resultado se memoriza bajo `${game.id}:${sha256(facts)}` (LRU acotado a 500 entradas) y solo se ejecuta en vistas con sesión válida, evitando gasto por bots o recargas repetidas mientras no cambie el snapshot.

## Qué modifica

- **ADR-013:** para las lecturas previas de `Cortex IA` se prescinde de Vercel AI SDK y de *tool calling* dinámico a favor de inyección directa de `CortexFacts` + `validateCortexText`; el uso de herramientas interactivas queda reservado únicamente si en una ola posterior se abre un chat conversacional libre.

## Alternativas descartadas

- **Dejar que el LLM consulte herramientas en tiempo real al abrir la ficha del partido:** latencia impredecible y costo innecesario cuando el servidor ya tiene el `PlatformGame` calculado en memoria.
- **Confiar solo en el `SYSTEM_PROMPT` para evitar números inventados o jerga prohibida:** insuficiente en modelos pequeños; la validación por expresión regular y conjunto numérico garantiza cero fugas.

## Consecuencias

- Cero riesgo de mostrar cifras alucinadas o proveedores prohibidos en producción, con degradación instantánea a plantilla determinista si OpenRouter falla o se agota el saldo prepagado.
