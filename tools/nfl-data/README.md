# tools/nfl-data — Herramientas de recopilación y validación NFL

Entorno y scripts para mantener el almacén histórico NFL gratuito
(`data/history/raw/nflverse/` + `data/history/raw/noaa-ghcn/`). Documentación completa
en `docs/data/nfl/`.

## Entorno

- `.venv/` (gitignored): Python 3.12 + polars 2.1.0 + pyarrow 26.0.1 + duckdb 2.0.0
  (instalados desde wheels locales en `wheels/` — pip→PyPI era lento en este host).
- Regenerar venv (si se borra):

```bash
python -m venv .venv
.venv/Scripts/python.exe -m pip install --no-index --find-links wheels polars pyarrow duckdb
```

## Scripts (ejecutar desde la raíz del repo)

| Script | Qué hace |
|---|---|
| `download_nflverse.py` | Descarga los releases nflverse-data (parquet) con resume y SHA-256. `--only dataset` para subconjuntos. Manifest: `data/history/manifests/nfl-downloads-manifest.jsonl`. |
| `download_noaa_weather.py` | Mapea estadios de games.csv a estaciones GHCN (IDs explícitos verificados contra el inventario oficial) y descarga el clima diario 1999–2026 de la API NCEI (sin key, dominio público). Manifest: `noaa-downloads-manifest.jsonl`; mapping versionado: `nfl-station-mapping.csv`. |
| `quality_check_nflverse.py` | Lee los 597 parquet + games.csv: filas, columnas, tipos, nulos, duplicados (claves lógicas y full-row), rango de temporadas. Escribe `quality_report.json` + `schemas.json`. |
| `deep_validation_nflverse.py` | Validaciones cruzadas: pbp↔games por temporada, EPA por era, cobertura 2026, moneyline por temporada, crosswalk players, nfl.jsonl≡jugados. Escribe `deep_validation.json`. |
| `noaa_coverage_report.py` | Días con datos por estación/año/variable del clima. Escribe `noaa_coverage.json`. |
| `weather_cross_validation.py` | Consistencia nflverse(gamebook °F) ↔ NOAA(GHCN °C): match rate, r de Pearson, diferencias. Escribe `weather_cross_validation.json`. |
| `verify_manifest_checksums.py` | Re-hashea cada archivo del manifest nflverse contra disco (integridad completa). |
| `build_normalized_games.py` | Construye la capa derivada de consulta `data/history/normalized/nfl/games_with_weather.parquet` (juegos + cuotas cierre + clima GHCN, 1 fila/juego, con aserción de unicidad y manifest de procedencia con checksums de insumos). No toca `raw/`. |
| `check_normalized_games.py` | Calidad de la capa derivada: paridad con games.csv, unicidad, total=suma, coberturas, unidades. Escribe `normalized_games_report.json`. |
| `build_player_week_stats.py` | Concatena los 111 `stats_player_week_*.parquet` en `data/history/normalized/nfl/player_week_stats.parquet` (485k filas × 150 cols, 1999–2026, `season_type` REG/POST) con aserción de paridad. |

## Mantenimiento semanal (temporada)

```bash
python -I tools/nfl-data/scripts/download_nflverse.py
python -I tools/nfl-data/scripts/download_noaa_weather.py
python -I tools/nfl-data/scripts/quality_check_nflverse.py
python -I tools/nfl-data/scripts/noaa_coverage_report.py
python -I tools/nfl-data/scripts/weather_cross_validation.py
```

Tras cada jornada nflverse republica; todo con resume (solo descarga lo nuevo). Los dos últimos
regeneran los reportes de cobertura y consistencia del clima. Mensual (o tras descargas grandes),
verificar integridad completa:

```bash
python -I tools/nfl-data/scripts/verify_manifest_checksums.py
```

Auditoría de manifests append-only: los registros `no_data`/`error` son históricos válidos;
el audit de consistencia (dupes/huérfanos) está descrito en `docs/data/nfl/DOWNLOAD_MANIFEST.md`.
Ver `docs/data/nfl/UPDATE_STRATEGY.md`.
