# UPDATE_STRATEGY — Actualización gratuita de los datasets NFL

**Fecha:** 2026-11-08

nflverse republica cada release semanalmente durante la temporada (Automated Data Releases vía
GitHub Actions) y puntualmente fuera de temporada. La actualización es tan simple como re-descargar
los mismos assets: el mismo script sirve para actualizar.

## Cómo actualizar

```bash
# Desde la raíz del repo (Git Bash):
python -I tools/nfl-data/scripts/download_nflverse.py
# Subconjunto:
python -I tools/nfl-data/scripts/download_nflverse.py --only play_by_play,injuries
```

- **Resume:** los archivos ya descargados (size > 0) se omiten; solo se descargan nuevos o ausentes.
- **Manifest:** `data/history/manifests/nfl-downloads-manifest.jsonl` acumula un registro por intento
  (fecha, URL, checksum SHA-256, tamaño, estado). Para auditoría completa, archivar el manifest antes
  de una corrida mayor (p. ej., renombrarlo con fecha) y dejar que se regenere.
- **Chequeo de calidad posterior:**

```bash
python -I tools/nfl-data/scripts/quality_check_nflverse.py
python -I tools/nfl-data/scripts/noaa_coverage_report.py     # cobertura clima por estación/año
python -I tools/nfl-data/scripts/weather_cross_validation.py # consistencia nflverse↔NOAA
python -I tools/nfl-data/scripts/verify_manifest_checksums.py # integridad completa (opcional, lento)
```

- **Consultas:** polars o DuckDB 2.0.0 (instalado en el venv) — ejemplos probados en QUERY_EXAMPLES.md.
- **Guía de herramientas:** `tools/nfl-data/README.md`.

## Frecuencia recomendada (sin servicios de pago, sin procesos residentes)

| Momento | Datasets a refrescar | Nota |
|---|---|---|
| Martes en temporada | pbp temporada actual, player_stats, stats_team, snap_counts, injuries, depth_charts, weekly_rosters, pfr_advstats, NGS | nflverse publica tras la jornada |
| Cierre de temporada (feb) | todos los de la temporada | incluye playoffs completos |
| Fuera de temporada | draft_picks, combine, contracts, trades, rosters | puntual |
| Nunca en producción | — | este almacén es insumo, no servicio |

Rutina completa tras cada refresco (descarga → calidad → reportes de clima), y verificación de
integridad mensual o tras descargas grandes:

```bash
python -I tools/nfl-data/scripts/download_nflverse.py
python -I tools/nfl-data/scripts/download_noaa_weather.py
python -I tools/nfl-data/scripts/quality_check_nflverse.py
python -I tools/nfl-data/scripts/noaa_coverage_report.py
python -I tools/nfl-data/scripts/weather_cross_validation.py
# mensual / post-descarga grande:
python -I tools/nfl-data/scripts/verify_manifest_checksums.py
```

### Manifests append-only: convivencia con reintentos

Los manifests (`nfl-downloads-manifest.jsonl`, `noaa-downloads-manifest.jsonl`) son append-only:
cada corrida agrega registros con su fecha. Reglas:
- `downloaded`/`skipped_existing`/`preexisting_registered` son registros válidos acumulables;
  el "último registro por asset" es el vigente (así opera `verify_manifest_checksums.py`).
- Si una corrida se aborta a mitad (p. ej. por reintento de metodología), se puede reiniciar el
  manifest NOAA borrándolo y re-ejecutando `download_noaa_weather.py` (resume re-descarga lo
  faltante y valida datos en cada respuesta). Tras el reinicio del 2026-11-08, el audit de
  consistencia muestra: 43 registros, 0 duplicados, 0 huérfanos, 0 archivos vacíos.
- Los `missing_404` del manifest nflverse son registros permanentes de assets que el origen no
  publica (ver MISSING_DATA.md).

## Automatización futura (opcional, gratuita)

- **Windows Task Scheduler:** tarea semanal que ejecute los dos comandos de arriba y deje el log en
  `data/history/quality_reports/nfl/`. No requiere servicio residente.
- **GitHub Actions (repositorio propio, sin costo):** job semanal que ejecute el downloader y
  guarde un diff del manifest (no los datasets) como artefacto.

## Reglas de convivencia con Git

- `data/history/raw/` está en `.gitignore`: ningún parquet/csv grande entra al repo.
- Se versionan: scripts (`tools/nfl-data/scripts/`), manifests (`data/history/manifests/`),
  reportes de calidad (`data/history/quality_reports/`) y esta documentación (`docs/data/nfl/`).
- Al versionar un manifest tras una actualización, el historial de Git provee la trazabilidad
  (qué cambió y cuándo) sin almacenar los datos pesados.
