# DATA_QUALITY_REPORT — Calidad de los datos NFL recopilados

**Fecha:** 2026-11-08 · **Herramientas:** `quality_check_nflverse.py` + `deep_validation_nflverse.py` (polars)
**Reportes máquina:** `data/history/quality_reports/nfl/quality_report.json` · `schemas.json` · `deep_validation.json`

## Resultado global

| Métrica | Valor |
|---|---|
| Archivos verificados | 598 (597 parquet + games.csv) |
| Archivos ilegibles / inválidos | **0** |
| Filas totales | 6,161,560 |
| Bytes | 634,334,826 |
| Estados | Complete: 598 · Partial: 0 (por archivo) · Invalid: 0 |

## Verificaciones aplicadas por archivo

1. **Legibilidad** (scan parquet completo) — 100% ok.
2. **Columnas y tipos** capturados en `schemas.json`.
3. **Rango de temporada** (`season` min/max) — coincide con lo publicado por nflverse.
4. **Nulos** — top-10 columnas con más nulos por archivo (reporte JSON); nulos preservados, nunca convertidos a 0.
5. **Duplicados** — doble chequeo:
   - Clave lógica por dataset (p. ej., `[season, week, player_id]`) — 0 duplicados reales.
     Los conteos aparentes iniciales eran artefactos de claves: los archivos semanales traen 1 fila por semana
     (`stats_team_week`), y los agregados season traen `season_type` REG/POST (`player_stats_season`,
     `kicking_season`). Verificados con claves correctas → **0 duplicados**.
   - Filas 100% idénticas (`duplicateFullRows`) — 26 archivos con repetidas tal como las publica el origen:
     - `contracts/historical_contracts.parquet`: 2,607 (OverTheCap repite contratos con reestructuraciones)
     - `depth_charts`: ~100–1,600 por año (repetición de slots idénticos en origen)
     - **Se preservan tal como fueron publicados** (regla de no destruir datos originales). Estado: *Pending Review* para
       deduplicación futura en capa normalizada, sin tocar `raw/`.
6. **Cobertura por temporada** — games.csv: 32 temporadas (1999–2026), ninguna con <250 juegos; 2026=272 (en curso).

## Referencias cruzadas verificadas

- **pbp ↔ games por temporada:** 7,403/7,407 partidos jugados con pbp (99.9%); sin pbp solo
  1999×1, 2000×2, 2026×1. Jugadas por partido 171–180, consistente en las 28 temporadas.
- **nfl.jsonl (7,407) ≡ partidos jugados de games.csv** (7,548 − 141 futuros de 2026): diferencia
  explicada al 100%, el pipeline existente está consistente con el almacén.
- **EPA disponible desde 1999:** 98.8% de jugadas con EPA no-nulo en todas las eras
  (1999–2005: 98.8%, 2006–2013: 98.8%, 2014–2026: 98.9%).
- **Cobertura 2026 al día:** todos los datasets semanales hasta la semana 9; depth charts hasta 2026-11-08.

## Tasa de resolución del crosswalk players.parquet (chequeo 2024, medido 2026-11-08)

| Dataset (clave) | Resuelve | Tasa |
|---|---|---|
| stats_player_week_2024 (`player_id` gsis) | 18,961/18,961 | **100.0%** |
| stats_player_reg_2024 (`player_id` gsis) | 1,996/1,996 | **100.0%** |
| depth_charts_2023 (`gsis_id`) | 37,327/37,327 | **100.0%** |
| injuries_2024 (`gsis_id`) | 6,215/6,215 | **100.0%** |
| weekly_rosters_2024 (`gsis_id`) | 46,350/46,572 | **99.5%** |
| snap_counts_2024 (`pfr_player_id`) | 26,573/26,615 | **99.8%** |
| rosters_2024 (`gsis_id`) | 3,014/3,215 | 93.7% (ver desglose abajo) |

**Desglose de los 201 no resueltos en rosters_2024** (análisis 2026-11-08):

| status | Jugadores | Explicación |
|---|---|---|
| CUT | **187 (93%)** | cortados en el campamento pre-temporada: nunca juegan un down regular → no tienen GSIS en el crosswalk. **Irrelevantes para modelado de temporada regular** (solo aparecen en partidos de pretemporada) |
| ACT | 5 | marginales (firmados tardíos sin down registrado) |
| INA / DEV / RES / RET | 9 | inactivos, práctica, reservados, retirados |
| Posiciones del grupo | DL 39, DB 35, WR 34, OL 33… | perfil típico de cuerpos de campamento (borde de plantilla) |

**Corrección**: la hipótesis inicial "internacionales/prácticos" era incorrecta — el 93% son cortes
de pretemporada. Respaldo por nombre+equipo solo necesario para esos 14 casos no-CUT.

Conclusión: el crosswalk `players.parquet` es viable como tabla puente canónica para el modelado.

## Clima: validación nflverse ↔ NOAA

`weather_cross_validation.json`: match 7,365/7,548 (97.6%); **r=0.909**, mediana |Δ|=2.24 °C en
5,201 pares open-air tras convertir gamebook °F→°C. Detalle y valor añadido (162 juegos sin
gamebook temp cubiertos) en NOAA_WEATHER.md.

## Cuotas (games.csv)

| Campo | No-nulos | Cobertura |
|---|---|---|
| spread_line | 7,426 / 7,548 | 98.4% |
| total_line | 7,426 / 7,548 | 98.4% |
| moneyline (home o away) | 5,445 / 7,548 | 72.1% global — 0% en 1999–2005, 82–100% desde 2006, 100% desde 2010 |
