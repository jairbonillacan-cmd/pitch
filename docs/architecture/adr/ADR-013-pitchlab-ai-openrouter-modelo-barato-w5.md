# ADR-013: PitchLab AI vía OpenRouter con un modelo barato y herramientas tipadas (W5)

- **Estado:** Aceptada (rev. 2: reemplaza la versión con Claude API directa)
- **Fecha:** 2026-11-08

## Contexto

Las referencias usan una «IA» basada en regex. PitchLab quiere respuestas fundamentadas en sus datos, con fuentes y hora. El fundador decidió que, si se aplica IA real, sea mediante **OpenRouter con un modelo muy barato**.

## Decisión

Vercel AI SDK con `@openrouter/ai-sdk-provider`, tool calling sobre servicios internos de solo lectura y el modelo como configuración (`AI_MODEL_DEFAULT` y `AI_MODEL_ESCALATION` opcional). En OpenRouter se exige `require_parameters: true` y `data_collection: "deny"` (más `zdr` cuando exista). Un validador de grounding en el servidor compara las cifras de la respuesta con los tool results. El modelo se elige con una evaluación de 40 preguntas: gana el más barato que pase los umbrales. Detalle en `AI_ARCHITECTURE.md`.

## Alternativas descartadas

API directa de un solo proveedor (ata el modelo y suele costar más por consulta); LLM sin herramientas (inventa); RAG vectorial como base (los datos son estructurados); frameworks de agentes pesados (complejidad innecesaria).

## Consecuencias

Costo por consulta del orden de milésimas de dólar y tope duro mediante créditos prepagados. Un modelo pequeño alucina más, y se compensa con herramientas que devuelven datos ya agregados, el validador de grounding y tarjetas de fuentes visibles. OpenRouter y el proveedor final procesan las consultas, por lo que se declaran en el aviso de privacidad y no se envían datos personales.
