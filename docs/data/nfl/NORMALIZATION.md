# NORMALIZATION — Normalización e identificadores NFL

**Fecha:** 2026-11-08

## Principios aplicados en esta recopilación

1. **Preservación de datos originales.** Los parquet descargados se almacenan byte a byte como los
   publica nflverse. No se reescriben columnas, tipos ni nombres en `raw/`.
2. **IDs originales intactos.** Se conservan todos los identificadores de origen: `game_id`
   (formato `{season}_{week}_{away}_{home}` de nflfastR), `gsis`, `pfr`, `pff`, `espn`, `ftn`,
   `nfl_detail_id`, `old_game_id`, `player_id` (gsis) + `pfr_id`/`espn_id`/`yahoo_id` en rosters/players.
3. **Sin merges destructivos.** No se crean tablas unidas en esta fase. Cuando se relacionen datasets
   (pbp ↔ player_stats ↔ rosters), la clave canónica de jugador será `player_id` (GSIS) resolviendo
   equivalencias con `players.parquet` — **nunca por nombre**.
4. **Equivaleencias documentadas.** `players.parquet` (crosswalk oficial de nflverse) es la tabla puente
   entre sistemas de IDs. `teams_colors_logos.parquet` normaliza abreviaturas históricas de equipos.
5. **Nulos preservados.** No se convierten nulos a cero. Un nulo en pbp (`epa` de jugadas especiales
   anteriores a 2005, por ejemplo) significa "no calculado", no "cero".
6. **Zonas horarias.** `games.csv` trae `gameday` (fecha) y `gametime` (hora en hora local del estadio,
   ET). La normalización previa del repo (`nfl.jsonl`) usa `America/New_York` como zona de kickoff.
   Los timestamps de publicación (injuries, rosters semanales) se conservan tal como los publica nflverse.
7. **Trazabilidad temporal.** Cada archivo lleva `downloadedAt` + checksum en el manifest. nflverse
   republica correcciones retroactivas (p. ej., ajustes de EPA); re-descargas posteriores deben
   versionarse, no sobrescribir silenciosamente (ver UPDATE_STRATEGY.md).

## Distinción pre-partido vs post-partido (integridad temporal)

| Dato | Momento de disponibilidad | Uso permitido en modelos futuros |
|---|---|---|
| `games.csv`: cuotas de cierre, clima, lesiones reportadas | pre-partido (cierre) | ✅ features |
| `games.csv`: marcadores, resultado | post-partido | ✅ solo como target/etiqueta |
| pbp: EPA/WPA, estadísticas de jugada | post-partido (construidas después) | ✅ target / análisis; ❌ feature de la misma jugada sin look-ahead |
| player_stats semanales | post-partido | ✅ target de props; como feature solo de semanas anteriores |
| injuries / depth charts / rosters semanales | pre-partido (reporte semanal) | ✅ features (respetando fecha de reporte) |
| NGS / QBR / advstats | post-partido | igual que player_stats |

Estas reglas quedan documentadas para la fase de modelado posterior; esta recopilación no entrena
ni modifica motores.

## Propuesta de esquema normalizado (futura, fuera de alcance aquí)

```text
fact_game        ← games.csv (game_id PK, fechas UTC + local, marcadores, cuotas cierre)
fact_play        ← pbp (game_id+play_id PK)
fact_player_week ← player_stats weekly
dim_player       ← players.parquet + rosters
dim_team         ← teams_colors_logos + games.csv
fact_injury_report ← injuries (fecha de reporte explícita)
fact_snap        ← snap_counts
fact_odds_close  ← columnas de games.csv (spread/total/ML de cierre)
```

## Capa derivada de consulta IMPLEMENTADA: `data/history/normalized/nfl/`

**Primera tabla derivada construida** (2026-11-08): `games_with_weather.parquet` — una fila por
juego con cuotas de cierre y clima de estadio ya unidos. `raw/` permanece intacto.

| Campo | Valor |
|---|---|
| Filas × columnas | 7,548 × 45 (paridad exacta con games.csv; `game_id` único verificado) |
| Construcción | `tools/nfl-data/scripts/build_normalized_games.py` (regenerable, idempotente) |
| Calidad | `tools/nfl-data/scripts/check_normalized_games.py` → `quality_reports/nfl/normalized_games_report.json` |
| Procedencia | `data/history/normalized/nfl/build_manifest.json` (checksums SHA-256 de TODOS los insumos: games.csv, mapping, 43 estaciones GHCN) |
| Licencia heredada | CC-BY-4.0 (nflverse) + dominio público (NOAA) |

### Claves de unión (documentadas y verificadas)

1. `games.stadium_id` → **venue** (3 primeros caracteres; excepciones `BUF01`/`SFO01`) →
   `nfl-station-mapping.csv.stadiumId` (deduplicado a una fila por venue) → `stationId`.
2. `games.gameday` + `stationId` → GHCN `DATE` + `STATION`.
3. Aserción de unicidad en el builder: si el join produce ≠ 7,548 filas, **aborta** (evita explosión
   de filas por mapeos repetidos — bug detectado y corregido durante la construcción).

### Columnas de la capa derivada

- Identificación/juego: `game_id, season, game_type, week, gameday, weekday, gametime, away/home_team,
  away/home_score, total, overtime, result, stadium_id, stadium, venue, roof, surface, location,
  div_game, away/home_rest, away/home_qb_name, away/home_coach, referee`.
- **Cuotas de cierre** (nflverse, passthrough intacto): `spread_line, total_line, away/home_moneyline,
  away/home_spread_odds, under_odds, over_odds`.
- **Clima**: `temp_gamebook_f, wind` (nflverse, °F) + `stationId, tmax_c, tmin_c, prcp_mm, snow_mm,
  snwd_mm, awnd_ms` (GHCN, métrico). Sufijos de unidad explícitos en el nombre de columna.

### Verificaciones de la capa (normalized_games_report.json)

- Paridad de filas y unicidad de `game_id` ✅ · `total == away_score + home_score`: **0 violaciones** ✅
- Cobertura: estación asignada 7,537 · TMAX presente 7,339 (97.2%) · PRCP 7,362 · spread 7,426 · ML 5,445
- Consistencia de unidades re-verificada en la propia tabla: mediana |gamebook−TMAX| 2023 open-air = **2.21 °C**
- Nulos preservados (los 37 días con TMAX=0.0°C exacto son días fríos reales, no ceros sintéticos)

### Segunda capa derivada: `player_week_stats.parquet`

| Campo | Valor |
|---|---|
| Filas × columnas | **485,205 × 150** (12.6 MB) — 465,201 REG + 20,004 POST |
| Cobertura | 1999–2026 · 11,651 jugadores · semana a semana |
| Construcción | `tools/nfl-data/scripts/build_player_week_stats.py` (concatenación pura de 111 `stats_player_week_*.parquet`, con aserción de paridad de filas) |
| Procedencia | `build_manifest_player_week.json` (checksum implícito por paridad; fuente CC-BY-4.0) |
| Distinción REG/POST | columna `season_type` — sanity check: Puka Nacua 2023 = 105 rec REG (récord rookie oficial) + 9 POST = 114 totales ✅ |

Útil para modelado de props/targets: estadísticas semanales completas en un solo archivo,
unible por `player_id` (GSIS) al crosswalk y por `game_id` a `games_with_weather`.
