# 08 · Arquitectura de ingesta (implementada)

> Código: `services/ingest/src/history/` (builder, normalizadores, auditoría, reporte)
> y los adaptadores de snapshot en `services/ingest/src/adapters/`.
> **Fecha:** 2026-11-08.

## 1. Pipeline del histórico (tal como corre hoy)

```text
Fuente con licencia (openfootball CC0 · nflverse CC-BY 4.0)
        ↓  fetch con caché en disco (data/history/raw), 2 reintentos con backoff 500/1000 ms
Caché cruda por archivo (sha256 + bytes + retrievedAt)
        ↓  zod por archivo (OpenFootballHistorySeasonSchema / NflverseCsvRowSchema)
Normalizador (identity por alias, stage/phase, availableAt conservador)
        ↓  validación final fila por fila (HistoricalGameSchema)
Auditoría de calidad (7 checks → errores bloquean, warnings no)
        ↓  orden determinista (fecha, id)
data/history/<liga>.jsonl + manifest.json (datasetId SHA-256) + Reportes/datos/HISTORICO-QUALITY.md
```

## 2. Requisitos de la directiva → dónde están

| Requisito | Implementación |
|---|---|
| Configuración por proveedor | `leagues.ts` (catálogo) + `SOURCE_META` (licencia/atribución por proveedor) |
| Credenciales por variables de entorno | `env.ts` carga `.env`/`.env.local` de la raíz; el histórico de fuentes $0 **no necesita ninguna clave** |
| Rate limiting | Sin presión sobre openfootball/nflverse (archivos estáticos); para API-Football el snapshot CLI usa presupuesto diario de 90 (`api-football-budget.json`) |
| Retry con backoff | `fetchTextCached` (2 reintentos, 500 ms × intento) |
| Idempotencia | Caché-first + orden determinista + IDs derivados del contenido → re-corridas producen el mismo `datasetId` |
| Paginación | No aplica: una URL por liga-temporada; los 404 se registran como fuente `unavailable` |
| Detección de duplicados | Check `duplicate_game_id` (bloquea) + detector de variantes de identidad de equipos |
| Estadísticas de ejecución | Log por liga (partidos, descartados) + totales del manifiesto |
| Reanudación / checkpoints | La caché por archivo es el checkpoint: interrumpir y re-corridar no repite descargas |
| Control de costos | Fuentes $0 por diseño; `--offline` para correr sin red |

## 3. Comandos

```bash
pnpm history                     # catálogo completo (7 ligas, todas las temporadas)
pnpm history --offline           # solo caché (auditable sin red)
pnpm history --leagues=liga-mx   # una liga
pnpm history --no-postseason     # NFL sin playoffs
pnpm history --soccer-seasons=2024-25,2025-26
pnpm snapshot                    # jornadas en vivo (pre-MVP): nflverse + openfootball + The Odds API
pnpm backtest                    # v2 vs Baseline 0 (PL + NFL de la temporada)
pnpm backtest:history --leagues=…  # benchmark walk-forward del corpus completo
```

## 4. Errores y cómo falla el pipeline

- Archivo de fuente ausente en modo offline → error explícito con la ruta faltante
  (no inventa datos).
- 404 de openfootball → registro `unavailable` en el manifiesto y el resto del corpus
  se construye igual (la ausencia es un dato, no un fallo).
- Fila que no pasa zod → error fatal con liga e id (el dataset no se publica roto).
- Errores de calidad al final → `exitCode 1` y mensaje para revisar el reporte antes de
  entrenar.
