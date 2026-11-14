---
status: accepted
date: 2026-11-13
extends:
  - ADR-007
  - ADR-009
  - ADR-014
---

# ADR-029: Frontera entre corpus histórico canónico y datasets `research-only`, manifiestos SHA-256 y evaluación walk-forward sin fuga

- **Estado:** Aceptada (`accepted`). Complementa [ADR-007](ADR-007-base-de-datos-postgresql-en-neon-drizzle-historico.md), [ADR-009](ADR-009-modelos-en-python-por-lotes-la-tabla-de-prediccion.md) y [ADR-014](ADR-014-fuentes-de-datos-gratuitas-en-la-fase-inicial.md).
- **Fecha:** 2026-11-13 (implementada en `services/ingest/src/history/`, `packages/models/`, `services/models/` y `scripts/data-catalog.mjs`).

## Contexto

Para entrenar y auditar motores propios en 7 ligas (`nfl`, `premier-league`, `laliga`, `bundesliga`, `serie-a`, `ligue-1`, `liga-mx`) se reunieron ~189,000 registros entre resultados históricos, cuotas de cierre, tiros/córners, xG y variables situacionales. Mezclar todas esas fuentes en un único directorio versionado generaba tres problemas críticos:

1. **Contaminación de licencias:** mientras `nflverse` (CC-BY 4.0, excluyendo FTN CC-BY-SA) y `openfootball` (CC0) son redistribuibles, fuentes valiosas para backtesting (`football-data.co.uk`, `Understat` vía Wayback Machine, resúmenes de `ESPN` y `API-Football` histórico) no otorgan licencia clara de publicación o redistribución en el repositorio.
2. **Riesgo de pérdida silenciosa o corrupción local:** al mantener los datasets de investigación fuera de Git (`.gitignore`), un script de limpieza destructiva (`pruneStaleFiles`, incidente corregido en `DATA-13`) o una descarga incompleta podía borrar o alterar decenas de miles de filas sin que Git lo advirtiera, además de inflar la caché cruda local por encima de `2.2 GB`.
3. **Fuga temporal (*data leakage*) y sobreajuste de hiperparámetros:** optimizar pesos por liga o incluir datos sin marca de disponibilidad temporal distorsiona los benchmarks frente al mercado sin vig.

## Decisión

1. **Doble anillo físico de datos históricos (`services/ingest/src/history/`):**
   - **Corpus canónico (`data/history/*.jsonl`, versionado):** contiene exclusivamente partidos con licencia abierta verificada (`34,168` partidos, 7 ligas, identidad estable por franquicia `<liga>.<slug>` independiente del manifiesto visual de emblemas, y `availableAt` = fin del día del partido + `24 h`). Las líneas de cierre incluidas en `nflverse` se etiquetan `research-only` para evaluación interna, nunca para exhibición pública.
   - **Anillo `research-only` (`data/history/research/`, ignorado por Git):** aloja cuotas/estadísticas de `football-data.co.uk` (1993–2026), xG observado de `Understat`/Wayback y estimado linealmente desde tiros (`estimated-from-shots`, marcado explícitamente por fila), resúmenes de `ESPN` Liga MX y temporadas accesibles de `API-Football`. La poda de archivos obsoletos opera únicamente con lista blanca en corridas completas para preservar datasets auxiliares.
2. **Compactación retrocompatible de caché cruda (`compactEspnSummary`):** los resúmenes crudos de ESPN se guardan compactados (`{ names, stats }`, reduciendo `1.5 GB → 82 MB`) manteniendo reconstrucción determinista `--offline` (incluyendo marcadores `.missing` para HTTP 404).
3. **Catálogo de solo lectura e integridad criptográfica (`pnpm data:catalog` y `pnpm verify:data`):** `scripts/data-catalog.mjs` verifica offline los 24 datasets sin mutarlos, comprobando `0` duplicados, umbrales mínimos de filas y coincidencia exacta de `fileSha256` contra los manifiestos JSON.
4. **Disciplina de benchmark walk-forward y selección de modelos:**
   - `pnpm backtest:history` evalúa por defecto **solo** sobre el corpus canónico reproducible; el entrenamiento extendido es *opt-in* (`--include-research-history`) y genera reportes separados.
   - Los hiperparámetros y mezclas se eligen en ventana temporal previa (`< 2020`) y solo se promueven si generalizan con intervalo de confianza bootstrap al 95 % (descartando stacking lineal, GBM de fútbol, pesos por liga y lesiones semanales NFL cuando no superan a la mezcla base; conservando el artefacto versionado `services/models/artifacts/nfl_blend/` y la calibración Platt de totales NFL como candidatos medidos).

## Alternativas descartadas

- **Versionar en Git los CSV/JSONL de `football-data.co.uk`, `Understat` y `ESPN`:** descartado por riesgo legal de redistribución sin licencia explícita y peso en el repositorio.
- **Usar el benchmark con datos `research` como métrica pública por defecto:** impediría que un tercero o CI limpio reproduzca los resultados sin poblar cachés externas.
- **Elegir el mejor modelo o peso de mezcla liga por liga sobre el conjunto completo:** descartado tras demostrar con validación temporal (`MODEL-07` y `MODEL-09`) que las ganancias aparentes no se transfieren fuera de muestra.

## Consecuencias

- El repositorio permanece ligero y legalmente limpio, mientras `pnpm verify:data` protege los ~189k registros locales contra borrados o corrupciones silenciosas.
- Ningún dato del anillo `research-only` puede servirse directamente en la UI; la app en vivo consume únicamente snapshots vigentes e inferencia de `@pitchlab/spacetime` ([ADR-027](ADR-027-spacetime-v3-datos-verificables-y-herramientas-de-preview.md)).
