# 06 · Estrategia de adquisición del histórico (descubrimiento → piloto → backfill)

> Cómo se llena el histórico sin gastar y sin riesgo legal, y qué parte está ya
> ejecutada. **Fecha:** 2026-11-08.

## 1. Los tres modos y su estado

| Modo | Diseño | Estado |
|---|---|---|
| **Dry-run / discovery** | Ver qué hay sin consumir: `pnpm history --offline` (solo caché, 0 descargas), sondas puntuales (`HEAD` de archivos de openfootball, 3 solicitudes de prueba a API-Football) | ✅ En uso: el modo offline es parte del CLI y las sondas definieron el alcance real |
| **Pilot import** | Una competición + temporadas acotadas, con validación y trazabilidad completas | ✅ Ejecutado: el corpus completo 34,168 partidos pasó por el mismo pipeline (zod fila por fila, auditoría, manifiesto con SHA-256). La corrección de Liga MX (stage Apertura/Clausura + fase postseason) se verificó re-construyendo el dataset completo: 0 errores |
| **Historical backfill** | Catálogo completo por lotes según cobertura y presupuesto | ✅ Para openfootball (103 archivos, 2010→2026) y nflverse (games.csv 1999→2026). ⏭ Siguiente lote: Liga MX 2022 y 2023 vía API-Football Free (ver §3) |

## 2. Contrato de reproducibilidad (lo que hace auditable el backfill)

- Misma caché de origen + misma configuración → mismo `datasetId` (SHA-256 de los
  archivos normalizados + configuración). El `datasetId` funciona como commit lógico
  del corpus: `data/history/manifest.json`.
- Cada fila lleva `source` + `sourceId` (`<archivo>#<índice>` de openfootball,
  `game_id` de nflverse) → cualquier partido se rastrea hasta el byte exacto de origen.
- El modo `--offline` permite regenerar y auditar sin red: mismo resultado si la caché
  no cambió.

## 3. Backfill pendiente: Liga MX 2021-22 → 2023-24 (hueco de openfootball)

| Temporada API-Football | Etiqueta openfootball | Contenido | Sonda del plan Free |
|---|---|---|---|
| 2022 | `2022-23` | Apertura 2022 + Clausura 2023 | sin probar (1 solicitud al ejecutar) |
| 2023 | `2023-24` | Apertura 2023 + Clausura 2024 | **✅ OK**: 340 fixtures, 44 rondas |
| 2021 | `2021-22` | Apertura 2021 + Clausura 2022 | ⛔ `errors=plan` (bloqueada en Free) |
| 2019 | `2019-20` | (ya cubierto por openfootball) | ⛔ `errors=plan` |

Plan de implementación (cuando la sesión de ingesta quede libre):

1. `history/normalize-api-football.ts`: reutiliza `ApiFootballResponseSchema`, filtra
   estados `FT/AET/PEN`, mapea rondas `«Apertura - 5»` → (`stage: "Apertura"`,
   `period: 5`) y rondas nombradas (`Quarter-finals`, `Semi-finals`, `Final`) →
   `stage: "<Torneo> Playoffs"`, `phase: "postseason"`.
2. Identidades por la tabla de alias del histórico (`leagues.ts`), **no** por el
   manifiesto de emblemas — y en modo estricto: un nombre sin alias detiene la
   normalización con error explícito.
3. Caché permanente por temporada cerrada (`data/history/raw/api-football/`), respeto
   del presupuesto diario (`services/ingest/.cache/api-football-budget.json`) y registro
   de fuente con licencia `API-Football Free (uso interno; sin redistribución)`.
4. Doble validación: zod por fila + auditoría completa (los 7 checks) sobre el corpus
   combinado; dedup por id con preferencia openfootball si hubiera solape.

**Costo total del relleno: 2 solicitudes del plan Free.** No se descarga nada de la
temporada 2021 hasta que cambie el plan o se confirme la licencia (FD-14).

## 4. Lo que NO se hace a propósito

- No se descarga football-data.co.uk (términos no clasificados para este uso).
- No se «reconstruyen» estadísticas que la fuente no dio (sin xG inventado, sin
  alineaciones retro-ficticias). Lo no observado se declara ausente (`10-feature-engineering.md`).
- No se masifica ninguna descarga fuera del presupuesto diario declarado.
