# 15 · Automatización y frescura de datos

> PitchLab no depende de CSV manuales. Estado actual y plan. **Fecha:** 2026-11-08.

## 1. Lo que ya corre solo

| Job | Gatillo | Qué hace | Frecuencia |
|---|---|---|---|
| `pre-mvp-snapshot.yml` (GitHub Actions) | `schedule` (cron) + manual | `pnpm snapshot`: jornadas en vivo de nflverse, openfootball, Liga MX (API-Football Free si hay clave) y cuotas The Odds API; escribe `data/snapshots/<liga>/<fecha>.json` + `latest.json` | Diaria en temporada |
| `pnpm history` | manual hoy | Corpus histórico completo (con caché: corridas cortas) | Semanal es suficiente (los archivos cerrados no cambian) |
| `pnpm backtest:history` | manual hoy | Benchmark walk-forward sobre el corpus | Con cada cambio de modelo o de corpus |

## 2. Frecuencia objetivo por tipo de dato (cuando haya ingresos / F4)

| Dato | Frecuencia | Motivo |
|---|---|---|
| Resultados y calendario | Diaria (openfootball ya actualiza a diario; nflverse post-juego) | Frescura honesta: horas, no minutos |
| Cuotas | 5-6 snapshots/semana por liga según `FREE_DATA_STRATEGY.md` §3 | El presupuesto de créditos manda; el scheduler lee créditos restantes y se detiene antes |
| Corpus histórico | Semanal (o post-temporada) | Los archivos cerrados son inmutables |
| Benchmark | Por cambio de modelo o corpus | Cada corrida ancla `datasetId` |
| Liga MX backfill 2022/2023 | Única vez (2 solicitudes) | Temporadas cerradas |

## 3. Requisitos operativos ya contemplados

- **Idempotencia**: re-corridas no duplican (caché por archivo + IDs deterministas).
- **Retries con backoff** y 404 como `unavailable` documentado.
- **Presupuesto**: API-Football 90 req/día con contador en disco; The Odds API con
  lectura de créditos restantes y parada anticipada.
- **Staleness**: la UI muestra «Actualizado hace X h · fuente» (`DataFreshnessIndicator`);
  un fallo del proveedor no puede producir predicciones stale sin identificación.
- **Alertas** (plan F4): falla de job, corpus sin actualizar > 7 días, presupuesto
  agotado antes de tiempo, calidad con errores > 0.

## 4. Pendientes de automatizar (orden)

1. Workflow semanal `history + backtest:history` que abra issue si errores > 0 o si el
   Δ vs ingenuo se degrada.
2. Scheduler de cuotas con presupuesto (requiere entornos con `ODDS_API_KEY` en CI).
3. Backfill puntual de Liga MX 2022/2023 como job único con salida verificada.
