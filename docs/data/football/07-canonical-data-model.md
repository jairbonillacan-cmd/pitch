# 07 · Modelo canónico de datos del histórico

> Fuente de verdad: `services/ingest/src/history/schema.ts` (zod, `HISTORY_SCHEMA_VERSION = 1`).
> Este doc explica el porqué de cada decisión y cómo mapea a las entidades de la
> directiva. **Fecha:** 2026-11-08.

## 1. Entidad central: `HistoricalGame` (una fila = un partido jugado)

| Campo | Convención | Decisión de diseño |
|---|---|---|
| `id` | `<liga>:<temporada>:<torneo>:<local>:<visita>` | Determinista y estable entre corridas; el torneo va incluido para que Apertura/Clausura/Playoffs no colisionen |
| `sport` | `soccer` \| `american-football` | Un contrato para ambos deportes; las reglas de marcador (techo 15 vs 90) se ramifican por liga |
| `league` | id del catálogo (`liga-mx`, `premier-league`…) | Ligado a `HISTORY_LEAGUES` |
| `season` | `2010-11` (fútbol) o `2025` (NFL) | La etiqueta de la fuente; en Liga MX una temporada contiene dos torneos |
| `period` | jornada/semana (≥1) | Agrupa el walk-forward |
| `stage` | `Apertura`/`Clausura`/`Apertura Playoffs`… o `null` | Distingue el doble torneo mexicano |
| `phase` | `regular` \| `postseason` | La liguilla/playoffs se pueden excluir del entrenamiento |
| `date` / `kickoff` / `kickoffZone` | `YYYY-MM-DD` / `HH:mm` / nullable | Día civil de la fuente; sin conversiones de zona inventadas |
| `homeTeam` / `awayTeam` | `<liga>.<slug>` del registro propio | **No** depende del manifiesto de emblemas; alias explícitos por liga; franquicias NFL por entidad (STL→LA) |
| `homeScore` / `awayScore` | enteros ≥ 0 | Solo partidos con marcador final (FT; AET/PEN distinguibles a futuro) |
| `neutralSite` | booleano | Sede neutral afecta la localía del modelo |
| `source` / `sourceId` | proveedor + id de origen | Trazabilidad al byte (SHA-256 en el manifiesto) |
| `availableAt` | fin del día del partido + 24 h | **Lag conservador** de datos no capturados en vivo: lo que defiende el as-of de `DATA_ARCHITECTURE.md` §6 |
| `odds` | solo NFL: spread/total/moneylines, `usage: "research-only"` | Cuotas de cierre de nflverse para investigación; nunca publicadas |

## 2. Mapeo a las entidades de la directiva

| Entidad de la directiva | Estado en el modelo actual |
|---|---|
| Competition / Season / SeasonPhase | `league` + `season` + `stage`/`phase` |
| Team | Registro propio `<liga>.<slug>` + `teamAliases` + whitelist `distinctTeamPairs` |
| Fixture / MatchResult | `HistoricalGame` (solo jugados; los programados se descartan y se cuentan) |
| SourceRecord | `HistorySourceRecord` (url, licencia, atribución, sha256, bytes, retrievedAt) |
| HistoricalFeature / Prediction / ModelVersion | Fuera de este schema: viven en `@pitchlab/models` y en el pipeline de publicación (`PREDICTION_ARCHITECTURE.md`) |
| MatchTeamStatistics / Player / Lineup / Injury / Suspension / OddsSnapshot | **No modeladas todavía** — las fuentes gratuitas aprobadas no las dan; se diseñarán cuando exista fuente con licencia (no se imitan con placeholders) |

## 3. Procedencia y temporalidad (la regla de oro del §9 de la directiva)

- `datasetId` (SHA-256) = versión inmutable del corpus; cualquier evaluación cita el
  `datasetId` con el que corrió.
- Distinción implementada entre «resultado conocido» (`availableAt`) y «fecha del
  evento» (`date`): los features as-of solo pueden usar filas con
  `availableAt ≤ instante de predicción`.
- **No se reconstruyen ficticiamente snapshots pre-partido**: hoy no existe un dataset
  de «lo que se sabía antes del partido» para fútbol, y el pipeline no finge tenerlo.
  Para NFL sí existe una capa real de cuotas de cierre (posterior al evento, marcada
  como tal y solo para investigación).

## 4. Almacenamiento

- Hoy: JSONL determinista por liga (`data/history/<liga>.jsonl`) + manifiesto + caché
  cruda (`data/history/raw/`). Legible por humanos, diffable por Git LFS si se requiere.
- Plan (ADR-007): Postgres/Neon para lo que consulta la app y Parquet en R2 para el
  corpus pesado; la tabla de `HistoricalGame` se carga con el mismo pipeline. El cambio
  de almacenamiento no altera el schema canónico.
