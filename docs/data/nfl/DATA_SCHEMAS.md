# DATA_SCHEMAS — Esquemas de los datasets NFL

**Fecha:** 2026-11-08

## Diccionario completo por archivo

El diccionario exacto (columna → tipo Polars) de cada uno de los 597 archivos quedó exportado en:

- `data/history/quality_reports/nfl/schemas.json` (versionado en Git)

## Resumen de campos principales por dataset

| Dataset | Clave / IDs | Campos principales |
|---|---|---|
| `games.csv` (schedules) | `game_id` (`1999_01_MIN_ATL`), `gsis`, `pfr`, `pff`, `espn`, `ftn`, `nfl_detail_id`, `old_game_id` | season, game_type (REG/POST), week, gameday, gametime, away/home_team+score, result, total, overtime, roof, surface, temp, wind, stadium, away/home_rest, **away/home_moneyline, spread_line, away/home_spread_odds, total_line, under/over_odds**, away/home_qb_id, coaches, referee |
| `play_by_play` | `game_id`+`play_id` | quarter (qtr), quarter_seconds_remaining, posteam, down, ydstogo, yardline_100, play_type, yards_gained, epa, wpa, success, air_yards, yards_after_catch, td/interception/fumble/sack/penalty flags, first_down_*, wp, vegas_* (líneas de cierre), 370+ columnas preservadas |
| `player_stats` weekly | season+week+player_id (gsis) | passing: completions, attempts, passing_yards, passing_tds, interceptions, sacks, passing_epa, cpoe; rushing: carries, rushing_yards, rushing_tds, rushing_epa; receiving: receptions, targets, receiving_yards, receiving_tds, receiving_epa, rac_yards, air_yards; fantasy + kicking (2017+) |
| `stats_player` reg/post/regpost/week | season(+week)+player_id | agregados oficiales equivalentes (fuente: agregación nflverse de pbp) |
| `stats_team` reg/post/regpost/week | season(+week)+team | team_stats: passing/rushing/receiving/scoring agregados + penalties, turnovers, extra/fg |
| `rosters` (anual) | season+team+player (gsis player_id) | player_name, position, jersey_number, birth_date, height, weight, rookie_year, draft_* |
| `weekly_rosters` | season+week+team+player_id | ídem + game_type/status; captura semanal de plantilla |
| `snap_counts` | season+week+team+pfr_id | off/snaps_off, snaps_off_pct, def/snaps_def, snaps_def_pct, st/snaps_st, snaps_st_pct |
| `injuries` | season+week+gsis+report_date | full_participation, limited_participation, did_not_participate, status (+ `practice_primary_injury`, reportes Wed/Thu/Fri/Sat) |
| `depth_charts` | season+week+team+gsis (≤2024); **dt+team+espn_id (2025+)** | pos_grp/pos_id/pos_name/pos_abb, pos_slot, pos_rank |
| `officials` | game_id | referee, umpire, etc. por partido |
| `contracts` | player+team+años (OverTheCap) | contract history, valores,firmas |
| `combine` | season+player_id | 40yd, bench, vertical, broad, shuttle, cone, height/weight |
| `draft_picks` | season+pick | team, player, college, round/trade flags |
| `trades` | season+trade_id | equipos, jugadores/picks involucrados |
| `nextgen_stats` | season+week+player_display_name | avg_time_to_throw, cpoe, completion_pct, aggs — passing/receiving/rushing |
| `pfr_advstats` | season(+week)+pfr_player_id | drops, bad throws, pressure, targets separados (pass/rec/rush/def) |
| `espn_qbr` | season+game_id+player_id | qbr_total, qb_plays, etc. (season y week level) |
| `teams` | team_abbr | nombres, colores, logos (URL; imágenes no descargadas) |

## Convenciones

- Los tipos exactos viven en `schemas.json`; nada se transformó localmente.
- Nulos preservados (nunca convertidos a 0).
- Claves de unión recomendadas: `game_id` (pbp↔games↔snap_counts↔injuries), `player_id` GSIS
  (stats↔rosters↔injuries), `pfr_player_id` (snap_counts↔advstats), crosswalk en `players.parquet`
  del release `players` (no descargado: se puede añadir con `--only players` si se requiere).
