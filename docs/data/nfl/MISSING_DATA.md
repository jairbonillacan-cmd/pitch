# MISSING_DATA — Datos faltantes y limitaciones

**Fecha:** 2026-11-08

## 1. Assets solicitados que no existen en nflverse (404 esperados, 40 en total)

| Asset(s) | Razón |
|---|---|
| `stats_team_{1999..2018}.parquet` (20) | nflverse solo publica `stats_team_reg/post/regpost/week`; no existe el asset sin sufijo antes de 2019 → ya cubierto con los 4 sufijos (1999–2026 completo) |
| `stats_team_post_2026`, `stats_player_post_2026` | postseason 2026 aún no jugado (temporada en curso) |
| `player_stats_{2025,2026}*(5)` | nflverse dejó de publicar la familia `player_stats` nueva para 2025+; la cobertura 2025/2026 está en `stats_player_week` (descargada) y `stats_team_week` |
| `player_stats_kicking_2021` | ausente en el release de origen (kicking season 2021 sí existe) |

**Conclusión:** ningún hueco real de cobertura; las 40 ausencias son convenciones de nombres del
origen o fechas futuras.

## 2. Datasets nflverse NO descargados (decisión de licencia)

| Dataset | Razón |
|---|---|
| `ftn_charting` (2022–2026) | condiciones adicionales FTN (share-alike) incompatibles con arquitectura propietaria |
| `pbp_participation` (2016–2025) | mismo origen FTN |
| `players` (crosswalk de IDs) | omitido en la corrida; añadible en 1 comando cuando se requiera normalizar IDs entre sistemas: `python -I tools/nfl-data/scripts/download_nflverse.py --only players` |

## 3. Cobertura parcial por diseño del origen

- **pbp 1999–2005:** métricas avanzadas incompletas (EPA se publica completo desde ~2006; air yards desde 2006; wp/columnas de apuestas varían).
- **snap_counts 2012:** el asset existe pero el origen reporta datos útiles desde 2013.
- **injuries:** formato de reportes cambió con los años (nflverse publica 2009+).
- **depth_charts 2025+:** esquema distinto (columna `dt` en vez de `season`/`week`).
- **officials:** nflverse cubre 2015+ (antes no publicado).
- **draft_picks:** nflverse cubre 1980+ (draft histórico completo requiere otra fuente; no crítica para PitchLab).

## 4. Cuotas históricas: registrado NO DISPONIBLE

Fuera de las líneas de cierre ya incluidas en games.csv (spread/total 98.4%, ML 72.1%), **no existe
fuente gratuita con licencia comercial verificable** para: opening odds, múltiples sportsbooks,
movimiento de líneas o player props históricos. Ver FREE_DATA_RESEARCH.md §3.

## 5. Filas repetidas preservadas (Pending Review)

- `contracts`: 2,607 filas idénticas (tal como publica OverTheCap vía nflverse).
- `depth_charts`: 100–1,600 filas idénticas por año.
- Decisión: preservar en `raw/`; deduplicar solo en una futura capa normalizada.
