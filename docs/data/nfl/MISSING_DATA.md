# MISSING_DATA — Datos faltantes y limitaciones

**Fecha:** 2026-11-08

## 1. Assets solicitados que no existen en nflverse (404 esperados, 40 en total)

| Asset(s) | Razón |
|---|---|
| `stats_team_{1999..2018}.parquet` (20) | nflverse solo publica `stats_team_reg/post/regpost/week`; no existe el asset sin sufijo antes de 2019 → ya cubierto con los 4 sufijos (1999–2026 completo) |
| `stats_team_post_2026`, `stats_player_post_2026` | postseason 2026 aún no jugado (temporada en curso) |
| `player_stats_{2025,2026}*(5)` | nflverse dejó de publicar la familia `player_stats` nueva para 2025+; la cobertura 2025/2026 está en `stats_player_week` (descargada) y `stats_team_week` |
| `player_stats_kicking_2021` | ausente en el release de origen (kicking season 2021 sí existe) |
| `play_by_play_{1999,2000,2026}` (3 juegos) | 4 juegos jugados sin pbp en el origen (1 de 1999, 2 de 2000, 1 de 2026) |

**Conclusión:** ningún hueco real de cobertura; las 40 ausencias son convenciones de nombres del
origen o fechas futuras.

## 2. Datasets nflverse NO descargados (decisión de licencia)

| Dataset | Razón |
|---|---|
| `ftn_charting` (2022–2026) | condiciones adicionales FTN (share-alike) incompatibles con arquitectura propietaria |
| `pbp_participation` (2016–2025) | mismo origen FTN |
| `schedules/games.parquet` | equivalente al `games.csv` ya presente (1999–2026) |
| `players_components` (evaluado 2026-11-08) | **redundante**: son los archivos intermedios de construcción de `players.parquet` (`otc_players.parquet` + `players.parquet` parcial, body del release: "Component files for nflverse players build"). El consolidado final `players.parquet` ya está descargado (24,867 jugadores, 8 IDs) y es el "single source of truth" según nflreadr. Licencia del repo igualmente CC-BY-4.0 — se descartó por duplicación de contenido, no por licencia. Útil solo si se quisiera reconstruir el build de nflverse-players. |
| ~~`players` (crosswalk de IDs)~~ | ✅ descargado en la fase de validación (24,867 jugadores, 8 sistemas de IDs) |

## 3. Cobertura parcial por diseño del origen

- **pbp sin 4 juegos jugados:** 1999×1, 2000×2, 2026×1 (7,403/7,407 con pbp = 99.9%; ausencias del origen nflfastR).
- **EPA:** disponible 98.8% desde 1999 (retrocalculado por nflverse). Air yards comienzan ~2006.
- **snap_counts 2012:** asset vacío (0 filas); datos reales desde 2013.
- **injuries:** formato de reportes cambió con los años (nflverse publica 2009+).
- **depth_charts 2025+:** esquema distinto (columna `dt` en vez de `season`/`week`).
- **officials:** nflverse cubre 2015+ (antes no publicado).
- **draft_picks:** nflverse cubre 1980+ (draft histórico completo requiere otra fuente; no crítica para PitchLab).
- **moneyline en games.csv:** no publicado para 1999–2005 (0%); 82–100% desde 2006; 100% desde 2010.

## 4. Cuotas históricas: registrado NO DISPONIBLE

Fuera de las líneas de cierre ya incluidas en games.csv (spread/total 98.4%, ML 72.1%), **no existe
fuente gratuita con licencia comercial verificable** para: opening odds, múltiples sportsbooks,
movimiento de líneas o player props históricos. Ver FREE_DATA_RESEARCH.md §3.

## 5. Filas repetidas preservadas (Pending Review)

- `contracts`: 2,607 filas idénticas (tal como publica OverTheCap vía nflverse).
- `depth_charts`: 100–1,600 filas idénticas por año.
- Decisión: preservar en `raw/`; deduplicar solo en una futura capa normalizada.

## 6. Clima (NOAA NCEI) — venues sin estación

- 3 venues sin estación GHCN-Daily con datos: `BRG` (Tiger Stadium LSU), `BUF01` (Rogers Centre
  Toronto), `RIO` (Maracanã) → **11 juegos sin clima de estación** (de 7,548). Estaciones con huecos
  y detalles: `NOAA_WEATHER.md`.
- Release `players_components` evaluado (2026-11-08): **redundante** con `players.parquet`
  (archivos intermedios de construcción); no descargado por duplicación de contenido, no por licencia.
