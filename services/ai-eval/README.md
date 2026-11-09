# `services/ai-eval` — evaluación y costos de PitchLab AI

> **Propósito:** medir antes de encender la IA de W5. Dos piezas: la evaluación de 40 preguntas
> (`AI_ARCHITECTURE.md` §6, pendiente de implementar) y esta simulación de uso y costo.
> **Consumidores:** fundador, sección 24 y quien implemente `packages/ai`.

## Simulación de uso (100 usuarios)

`simulate-usage.mjs` no llama a OpenRouter ni necesita API key. Modela el bucle de herramientas de
`AI_ARCHITECTURE.md` §1 (1–4 pasos, resultados agregados, validador de grounding con un reintento),
los tokens de system + 9 esquemas + `SportContext`, la caché de prefijo y las tarifas reales del
catálogo de OpenRouter para `deepseek/deepseek-v4.1-flash-1017`.

```bash
node services/ai-eval/simulate-usage.mjs
node services/ai-eval/simulate-usage.mjs --months=5000 --seed=7
node services/ai-eval/simulate-usage.mjs --route=valor --out=Reportes/ai
```

Salidas en `Reportes/ai/`:

| Archivo | Contenido |
|---|---|
| `SIMULACION-100-USUARIOS.md` | Reporte completo con tablas y recomendación |
| `simulacion-100-usuarios.json` | Todas las cifras y los supuestos, para reutilizar |
| `simulacion-100-usuarios.csv` | Una fila por usuario de un mes simulado |

Los supuestos viven en las constantes `TOKENS`, `INTENTS`, `PLANS`, `COHORTS` y `ROUTES` del script.
Cambiar una y volver a correr regenera el reporte completo. El generador es determinista con la
misma semilla.

## Qué mide y qué no

**Mide:** consultas por plan, tokens de entrada/salida/caché, costo por consulta y por mes, cola de
la distribución (p50–p99), techo por cuotas, sensibilidad a razonamiento/caché/reintentos/ruta.

**No mide:** calidad de las respuestas, latencia, ni el resto de la infraestructura. La calidad se
mide con la evaluación de 40 preguntas de `AI_ARCHITECTURE.md` §6, que es el gate para encender
`ai.enabled`.

## Reglas del experimento

1. Los precios son del catálogo de OpenRouter de un día concreto; no son una cotización.
2. Las cuotas (5/60/250) y los planes salen de `INFORMATION_ARCHITECTURE.md` §4.
3. Las 9 herramientas y el límite de 4 pasos salen de `AI_ARCHITECTURE.md` §3 y §2.
4. El resultado es un supuesto, no una factura: el log `ai_usage` es la fuente de verdad.
