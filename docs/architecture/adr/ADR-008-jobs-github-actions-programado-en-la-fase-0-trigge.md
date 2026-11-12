# ADR-008: Jobs: GitHub Actions programado en la fase $0; Trigger.dev después

- **Estado:** Aceptada
- **Fecha:** 2026-11-08

## Contexto

Las ingestas son descargas periódicas y cortas (releases de nflverse y snapshots de cuotas), y no hay presupuesto.

## Decisión

Workflows programados en `.github/workflows/ingest-*.yml` que ejecutan scripts de `services/ingest` (TS) y `services/models` (Python). Cada job es idempotente (clave de corrida), registra un `ingestion_run` y respeta los presupuestos (créditos de The Odds API). Cuando se superen los límites o hagan falta reintentos finos, se migra a Trigger.dev sin cambiar los adaptadores.

## Alternativas descartadas

Trigger.dev o Inngest desde el inicio (mejor DX, pero con costo y límites); Vercel Cron (límite de duración); un worker propio (infraestructura que mantener).

## Consecuencias

El cron de Actions tiene una precisión de minutos, suficiente para los snapshots previos al partido. El retraso posible en la frescura se documenta.
