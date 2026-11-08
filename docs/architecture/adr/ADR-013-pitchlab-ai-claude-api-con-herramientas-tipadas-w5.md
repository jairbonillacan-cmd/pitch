# ADR-013: PitchLab AI: Claude API con herramientas tipadas (W5)

- **Estado:** Aceptada (se implementa en W5)
- **Fecha:** 2026-11-08

## Contexto

Las referencias tienen una «IA» basada en regex. PitchLab quiere respuestas fundamentadas en sus datos, con fuentes y hora.

## Decisión

Orquestador en el servidor con el SDK oficial de Anthropic y tool use sobre servicios internos de solo lectura (sin acceso SQL libre). Modelos de la familia Claude 5 (Sonnet para el asistente, Haiku para clasificar y resumir), con los IDs y parámetros verificados contra la documentación oficial al implementar. Cuotas por plan. Detalle en `AI_ARCHITECTURE.md`.

## Alternativas descartadas

LLM sin herramientas (inventa); RAG vectorial como base (los datos son estructurados y el tool use es más preciso); LangGraph (complejidad innecesaria).

## Consecuencias

El costo por consulta debe medirse antes de fijar las cuotas definitivas (`COST_MODEL.md`).
