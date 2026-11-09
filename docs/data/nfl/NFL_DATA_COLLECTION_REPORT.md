# NFL_DATA_COLLECTION_REPORT — Reporte final de recopilación

**Fecha:** 2026-11-08 · **Misión:** recopilación exhaustiva de datos NFL históricos gratuitos para PitchLab

## 1. Fuentes gratuitas encontradas

nflverse-data (principal, CC-BY-4.0), nflreadpy/nflreadr (clientes), nfldata (utilidades),
Kaggle tobycrabtree (pendiente de licencia), The Odds API free tier (solo personal → descartada),
Scottfree sample (comercial → descartada). Detalle: `FREE_DATA_RESEARCH.md`.

## 2. Fuentes utilizadas

**nflverse-data únicamente** — la única que cumple: gratuito, sin tarjeta/registro de pago,
licencia comercial abierta verificada (CC-BY-4.0), profundidad histórica máxima (pbp 1999+,
rosters 1920+, draft 1980+) y formatos parquet estables.

## 3. Licencias

CC-BY-4.0 para todos los datasets descargados (verificación directa del LICENSE del repo).
Atribución obligatoria: "Data from nflverse (CC-BY 4.0)". Descartados por licencia:
ftn_charting y pbp_participation (términos FTN share-alike). Detalle: `DATASET_LICENSES.md`.

## 4–8. Temporadas, datasets, archivos, registros, tamaño

| Métrica | Valor |
|---|---|
| Temporadas | pbp/stats 1999–2026 · rosters 1920–2026 · draft 1980–2026 · combine 2000–2026 · weekly_rosters 2002–2026 · injuries 2009–2026 · depth_charts 2001–2026 · snap_counts 2012–2026 · NGS 2016–2026 · QBR 2006–2026 · advstats 2018–2026 |
| Datasets | 20 familias (incl. games.csv preexistente re-registrado) |
| Archivos | 597 verificados (596 parquet + games.csv) |
| Registros | 6,136,693 filas |
| Tamaño total | 630.9 MB crudos (634.6 MB con checksums verificados en manifest) |
| Checksums | SHA-256 para el 100% de los archivos (manifest JSONL) |

## 9. Ubicación

```text
data/history/raw/nflverse/          ← datos crudos (gitignored)
  ├── games.csv                     ← calendario+resultados+cuotas cierre 1999–2026 (preexistente)
  ├── play_by_play/    (28)         ├── player_stats/  (103)   ├── stats_player/ (111)
  ├── stats_team/      (111)        ├── rosters/       (107)   ├── weekly_rosters/ (25)
  ├── snap_counts/     (15)         ├── injuries/      (18)    ├── depth_charts/ (26)
  ├── officials/ contracts/ combine/ draft_picks/ trades/   ├── nextgen_stats/ (3)
  ├── pfr_advstats/    (40)         ├── espn_qbr/      (2)     ├── misc/ teams/
data/history/manifests/nfl-downloads-manifest.jsonl   ← manifest versionado
data/history/quality_reports/nfl/                     ← quality_report.json + schemas.json
tools/nfl-data/scripts/download_nflverse.py           ← descarga con resume+checksums
tools/nfl-data/scripts/quality_check_nflverse.py      ← validación (polars)
tools/nfl-data/.venv/                                 ← entorno Python (gitignored)
docs/data/nfl/*.md                                    ← esta documentación
```

## 10–11. Calidad y campos principales

- 597/597 archivos legibles y consistentes; 0 errores de descarga.
- Duplicados lógicos: 0 (verificados con claves correctas; los aparentes eran artefactos de chequeo).
- Filas repetidas del origen preservadas tal cual (contracts 2,607; depth_charts ~100–1,600/año) → Pending Review.
- Campos principales por dataset: `DATA_SCHEMAS.md`; diccionario exacto en `schemas.json`.

## 12–14. Datos faltantes / descartados / incompletos

- 40 assets 404: convenciones del origen o postseason 2026 futuro → sin huecos reales de cobertura.
- Descartados por licencia: ftn_charting, pbp_participation (FTN), logos (IP NFL).
- Cuotas adicionales (opening odds, props, multi-book): **NO DISPONIBLE** gratis con licencia comercial.
- Descargas incompletas: ninguna.
- Detalle: `MISSING_DATA.md`.

## 15. Cómo reanudar

```bash
python -I tools/nfl-data/scripts/download_nflverse.py          # resume automático
python -I tools/nfl-data/scripts/quality_check_nflverse.py     # re-validación
```

## 16. Cómo actualizar

Mismo comando de descarga (nflverse republica semanalmente en temporada). Estrategia y frecuencias
recomendadas (Task Scheduler/Actions sin costo): `UPDATE_STRATEGY.md`.

## 17. Disponible para futuros modelos

Todo el almacén queda listo para consultas (polars/duckdb sobre parquet) y para la fase de
modelado: features pre-partido (cuotas de cierre, lesiones, depth charts, descanso, clima),
targets post-partido (pbp EPA/WPA, stats semanales), identificación estable de jugadores
(GSIS + crosswalk) y equipos. **El motor predictivo existente NO fue modificado ni tocado**
(se auditó; solo lectura). `data/history/nfl.jsonl` y snapshots existentes permanecen intactos.

## Cumplimiento de reglas absolutas

✅ Solo fuentes gratuitas · ✅ Sin servicios contratados · ✅ Sin métodos de pago ni trials ·
✅ Sin APIs premium · ✅ Sin scraping no autorizado (todo vía releases con licencia) ·
✅ Sin datos inventados · ✅ Sin modelos entrenados · ✅ Sin cambios al frontend ni motores ·
✅ Sin subidas de datasets a Git (raw/ gitignored) · ✅ Documentación completa con licencias
