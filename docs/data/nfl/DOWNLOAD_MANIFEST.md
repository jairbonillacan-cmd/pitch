# DOWNLOAD_MANIFEST — Registro de descargas NFL

**Fecha de corrida principal:** 2026-11-08

## Ubicación

- **Manifest completo (JSONL, versionado en Git):** `data/history/manifests/nfl-downloads-manifest.jsonl`
  - Un registro JSON por asset intentado: dataset, asset, temporada, release tag, URL de origen,
    fecha/hora de descarga (UTC), ruta local, tamaño en bytes, **checksum SHA-256**, estado y error si lo hubo.
- **Datos crudos (gitignored):** `data/history/raw/nflverse/<dataset>/<asset>.parquet`

## Resumen de la corrida

| Métrica | Valor |
|---|---|
| Registros en manifest | 665 |
| Descargados | 596 |
| Preexistentes registrados (games.csv, sin re-descargar) | 1 (+1 duplicado de registro en re-corrida de stats_team) |
| Omitidos por ya existir (resume) | 27 |
| Ausentes en origen (404 esperados) | 40 |
| Errores de red/descarga | 0 |
| Bytes verificados con checksum | 634,609,953 |

## Estados usados

- `downloaded` — descargado y checksum calculado.
- `skipped_existing` — ya estaba completo (resume); checksum verificado de local.
- `preexisting_registered` — el archivo ya existía (descargado por services/ingest); registrado sin re-descarga.
- `missing_404` — el asset no existe en el release (rango de temporada no publicado por nflverse; ver MISSING_DATA.md).

## Cómo reanudar / repetir

```bash
python -I tools/nfl-data/scripts/download_nflverse.py            # todo (resume automático)
python -I tools/nfl-data/scripts/download_nflverse.py --only pbp # subconjunto por dataset
```

El script nunca re-descarga un archivo completo y verificado. Las re-corridas agregan nuevos
registros al manifest (append-only) para trazabilidad.
