# QUERY_EXAMPLES — Cómo consultar el almacén NFL

**Fecha:** 2026-11-08 · **Entorno:** `tools/nfl-data/.venv` (polars 2.1.0, pyarrow 26.0.1, duckdb 2.0.0)

Los parquet de `data/history/raw/nflverse/` se consultan directamente con Polars (o DuckDB si se
instala después). Ejemplos probados contra este almacén:

```bash
# Activar el entorno (o usar la ruta completa como en los scripts)
source tools/nfl-data/.venv/Scripts/activate
```

## Ejemplos

### 1. Todos los juegos de una temporada con líneas de cierre

```python
import polars as pl
games = pl.read_csv("data/history/raw/nflverse/games.csv")
g2024 = games.filter((pl.col("season") == 2024) & (pl.col("game_type") == "REG")) \
             .select(["game_id", "week", "gameday", "away_team", "home_team",
                      "away_score", "home_score", "spread_line", "total_line",
                      "away_moneyline", "home_moneyline"])
```

### 2. EPA por jugador en un partido (pbp)

```python
pbp = pl.scan_parquet("data/history/raw/nflverse/play_by_play/play_by_play_2024.parquet")
epa = (pbp.filter(pl.col("game_id") == "2024_10_DET_HOU")
          .group_by("passer_player_name")
          .agg(pl.col("epa").sum().alias("total_epa"), pl.len().alias("plays"))
          .sort("total_epa", descending=True).collect())
```

### 3. Stats semanales de un QB (stats_player_week)

```python
sp = pl.scan_parquet("data/history/raw/nflverse/stats_player/stats_player_week_2024.parquet")
qb = (sp.filter((pl.col("position") == "QB") & (pl.col("week") <= 18))
        .group_by("player_display_name")
        .agg(pl.col("passing_yards").mean().round(1).alias("py_pg"))
        .sort("py_pg", descending=True).collect())
```

### 4. Lesiones reportadas antes de la semana (pre-partido)

```python
inj = pl.scan_parquet("data/history/raw/nflverse/injuries/injuries_2024.parquet")
out = (inj.filter(pl.col("week") == 10)
          .group_by("status").agg(pl.len()).collect())
```

### 5. Snap counts de una semana

```python
sc = pl.scan_parquet("data/history/raw/nflverse/snap_counts/snap_counts_2024.parquet")
row = (sc.filter((pl.col("season") == 2024) & (pl.col("week") == 1))
         .select(["team", "pfr_player_name", "snaps_off", "snaps_off_pct"])
         .sort("snaps_off", descending=True).collect())
```

### 6. Clima del estadio para un juego (games ↔ mapping ↔ GHCN)

```python
import polars as pl
games = pl.read_csv("data/history/raw/nflverse/games.csv")
mp = pl.read_csv("data/history/manifests/nfl-station-mapping.csv")
wx = pl.read_csv("data/history/raw/noaa-ghcn/stations/USW00014918.csv")  # Green Bay

# la clave del mapping es el venue (3 caracteres: GNB, ATL, ..., excepciones BUF01/SFO01)
g = (games.with_columns(pl.col("stadium_id").str.slice(0, 3).alias("venue"))
          .filter(pl.col("season") == 2023)
          .join(mp.select(["stadiumId", "stationId"]), left_on="venue", right_on="stadiumId")
          .join(wx, left_on=["gameday", "stationId"], right_on=["DATE", "STATION"])
          .filter(pl.col("stadium_id") == "GNB00")
          .select(["game_id", "gameday", "temp", "TMAX", "TMIN", "PRCP", "SNOW", "AWND"]))
# ojo: temp de nflverse está en Fahrenheit; GHCN en Celsius
```

## Reglas de oro para modelado futuro

1. **Nunca usar columnas post-partido como features del mismo partido** (scores, epa, wpa del juego).
2. Las cuotas de `games.csv` son de **cierre** → utilizables como feature pre-partido.
3. `injuries` y `depth_charts` llevan fecha de reporte → respetar `report_date`/`dt`.
4. Unir jugadores por `player_id` (GSIS) o `pfr_id`, nunca por nombre; crosswalk en
   `data/history/raw/nflverse/players/players.parquet`.
5. Nulos ≠ 0 (documentado en NORMALIZATION.md).

## SQL con DuckDB (probado sobre este almacén)

### La forma rápida: capa derivada ya unida (recomendada para análisis)

```python
import polars as pl
# juegos + cuotas de cierre + clima de estadio en una sola tabla (7,548 filas, 45 cols)
g = pl.read_parquet("data/history/normalized/nfl/games_with_weather.parquet")
ej = g.filter((pl.col("season") == 2023) & (pl.col("stadium_id") == "GNB00")) \
      .select(["game_id", "gameday", "temp_gamebook_f", "tmax_c", "tmin_c",
               "prcp_mm", "snow_mm", "spread_line", "total_line"])
# verificación y procedencia: build_manifest.json y normalized_games_report.json
# regenerar tras refrescar raw/: python -I tools/nfl-data/scripts/build_normalized_games.py
```

### Stats semanales unificados (capa derivada 2)

```python
pw = pl.scan_parquet("data/history/normalized/nfl/player_week_stats.parquet")  # 485k×150, 1999–2026
# temporada de un receptor, separando regular/postseason
s = (pw.filter((pl.col("player_display_name") == "Puka Nacua") & (pl.col("season") == 2023))
       .group_by("season_type").agg(pl.col("receptions").sum(), pl.col("receiving_yards").sum())
       .collect())  # REG=105 rec (récord rookie) + POST=9
```

### SQL directa sobre raw/ con DuckDB

DuckDB 2.0.0 está instalado en el venv y lee directamente los parquet y el CSV:

```python
import duckdb
con = duckdb.connect()
base = r"<REPO_ROOT>/data/history/raw/nflverse"

# jugadas por temporada sobre todos los pbp a la vez
con.execute(f"""
SELECT season, COUNT(*) AS plays, COUNT(DISTINCT game_id) AS games
FROM read_parquet('{base}/play_by_play/*.parquet')
GROUP BY season ORDER BY season
""").fetchall()

# líderes receptores 2025
con.execute(f"""
SELECT player_display_name, SUM(receiving_yards) AS yds
FROM read_parquet('{base}/stats_player/stats_player_week_2025.parquet')
WHERE position = 'WR' GROUP BY 1 ORDER BY yds DESC LIMIT 5
""").fetchall()

# games.csv también es consultable
con.execute(f"""
SELECT COUNT(*) FROM read_csv_auto('{base}/games.csv')
WHERE season = 2025 AND game_type = 'REG'
""").fetchone()  # → 272
```

## Clima de estadio vía SQL (join de tres fuentes)

```python
con.execute(f"""
SELECT g.game_id, g.gameday, g.temp, w.TMAX, w.TMIN, w.PRCP, w.SNOW, w.AWND
FROM read_csv_auto('{base}/games.csv') g
JOIN read_csv_auto('<REPO_ROOT>/data/history/manifests/nfl-station-mapping.csv') m
  ON substr(g.stadium_id, 1, 3) = m.stadiumId
JOIN read_csv_auto('<REPO_ROOT>/data/history/raw/noaa-ghcn/stations/*.csv') w
  ON m.stationId = w.STATION AND g.gameday = w.DATE
WHERE g.season = 2023 AND substr(g.stadium_id, 1, 3) = 'GNB'
""").fetchall()
# temp nflverse = Fahrenheit; GHCN = Celsius
```
