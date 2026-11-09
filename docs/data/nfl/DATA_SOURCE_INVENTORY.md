# DATA_SOURCE_INVENTORY — Inventario de fuentes de datos NFL

**Fecha:** 2026-11-08 · **Proyecto:** PitchLab (pitchlab.mx)

## Fuente activa

| Campo | Valor |
|---|---|
| Fuente | nflverse-data (GitHub releases) |
| URL | https://github.com/nflverse/nflverse-data/releases |
| Licencia | CC-BY-4.0 (atribución obligatoria) |
| Formato descargado | Parquet (salvo schedules preexistente en CSV) |
| Ubicación local | `data/history/raw/nflverse/` (gitignored) |
| Manifest | `data/history/manifests/nfl-downloads-manifest.jsonl` |
| Método de descarga | `tools/nfl-data/scripts/download_nflverse.py` (resume + checksums) |

## Datasets y cobertura objetivo

| # | Dataset | Dir | Release | Cobertura objetivo | Prioridad |
|---|---|---|---|---|---|
| 0 | Calendarios y resultados (incluye cuotas de cierre, estadio, clima, descanso) | `games.csv` (preexistente) | schedules | 1999–2026 | 1 (ya existía) |
| 1 | Play-by-play | `play_by_play/` | pbp | 1999–2026 | 1 (máxima) |
| 2 | Estadísticas de jugadores (semanal + temporada + kicking) | `player_stats/` | player_stats | 1999–2026 | 3–4 |
| 3 | Estadísticas de jugadores agregadas (reg/post/regpost/week) | `stats_player/` | stats_player | 1999–2026 | 4 |
| 4 | Estadísticas de equipos (temporada + post) | `stats_team/` | stats_team | 1999–2026 | 3 |
| 5 | Rosters históricos | `rosters/` | rosters | 1920–2026 | 5 |
| 6 | Rosters semanales | `weekly_rosters/` | weekly_rosters | 2002–2026 | 5 |
| 7 | Snap counts | `snap_counts/` | snap_counts | 2012–2026 | 6 |
| 8 | Lesiones | `injuries/` | injuries | 2009–2026 | 7 |
| 9 | Depth charts | `depth_charts/` | depth_charts | 2001–2026 | 8 |
| 10 | Oficiales (árbitros) | `officials/` | officials | histórico completo | 10 |
| 11 | Contratos | `contracts/` | contracts | histórico completo | 10 |
| 12 | Combine | `combine/` | combine | histórico completo | 10 |
| 13 | Draft | `draft_picks/` | draft_picks | 1936–2026 | 10 |
| 14 | Trades | `trades/` | trades | histórico completo | 10 |
| 15 | Next Gen Stats (pase/recepción/carrera) | `nextgen_stats/` | nextgen_stats | 2016–2026 | 9 |
| 16 | Advanced stats PFR (temporada + semanales) | `pfr_advstats/` | pfr_advstats | season + week 2018–2026 | 9 |
| 17 | ESPN QBR | `espn_qbr/` | espn_data | season/week level | 9 |
| 18 | PFR rosters (histórico antiguo) | `misc/` | misc | histórico | 10 |
| 19 | Equipos: metadatos, colores, abreviaturas | `teams/` | teams | vigente | 10 |

## Datasets de nflverse NO descargados

| Dataset | Razón |
|---|---|
| `ftn_charting` | Términos FTN adicionales (share-alike) — incompatibles con arquitectura propietaria |
| `pbp_participation` | Mismo origen FTN + registro |
| `teams` imágenes de logos | IP de la NFL; solo se descargó el parquet de metadatos |
| `schedules/games.parquet` | Ya existía `games.csv` equivalente (1999–2026) descargado por services/ingest |

## Relación con los datos existentes del repo

- `data/history/nfl.jsonl` (7,407 juegos normalizados) fue generado por `services/ingest/history`
  a partir de `games.csv` — se mantiene intacto; los nuevos datasets quedan disponibles para
  normalización futura **sin modificar el motor predictivo** (regla absoluta de la misión).
- `data/snapshots/nfl/*.json` (snapshots API-Football) no se tocan.
- Informes REA previos consultados: `Reportes/18-engine-nfl-report.md` (TouchIQ NFL),
  `Reportes/analisis-linemate/REPORT-NFL.md`, `nfl-data-model.md`, `historical-odds.md`,
  `licensing-and-data-options.md`.
