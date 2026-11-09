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
