# ADR-009: Modelos en Python por lotes; la tabla de predicciones es el contrato

- **Estado:** Aceptada
- **Fecha:** 2026-11-08

## Contexto

El ecosistema estadístico está en Python, la web en TS y el Baseline 0 (motores reconstruidos) también en TS.

## Decisión

`services/models` (Python con uv, pandas, NumPy, SciPy, scikit-learn, LightGBM y statsmodels) corre como jobs batch y escribe en `model_version`, `prediction` y `evaluation`. El Baseline 0 escribe en las mismas tablas desde un job Node que usa `packages/engines-reference`. La web solo lee predicciones publicadas. Detalle en `PREDICTION_ARCHITECTURE.md`.

## Alternativas descartadas

API Python siempre encendida (costo sin necesidad); portar todo a TS (se pierde el ecosistema estadístico).

## Consecuencias

Cualquier lenguaje puede producir predicciones si respeta el contrato. No hay latencia en línea: las predicciones se calculan por adelantado.
