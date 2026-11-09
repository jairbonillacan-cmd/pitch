# HISTORICAL_COVERAGE — Cobertura histórica NFL

**Fecha:** 2026-11-08 · **Fuente:** nflverse-data · **Licencia:** CC-BY-4.0
**Verificado con:** `data/history/quality_reports/nfl/quality_report.json` (generado por `tools/nfl-data/scripts/quality_check_nflverse.py`)

## Resumen por dataset

| Dataset | Archivos | Filas | Tamaño | Cobertura | Estado |
|---|---|---|---|---|---|
| games (calendario+resultados+cuotas cierre) | 1 | 7,548 | 2.1 MB | 1999–2026 | ✅ Complete (32/32 temporadas; todas ≥250 juegos) |
| play_by_play | 28 | 1,302,418 | 474.7 MB | 1999–2026 | ✅ Complete |
| player_stats (weekly) | 28 | incl. abajo | 8.8 MB | 1999–2024 (2025/26 no publicados aún por nflverse: usar stats_player_week) | ✅ Complete hasta 2024 |
| player_stats_season | 25 | ↓ | 4.5 MB | 1999–2024 | ✅ Complete |
| player_stats_kicking (+season) | 44 | ↓ | 0.6 MB | 2017–2024 (2021 season ausente en origen) | ✅ Complete según origen |
| stats_player (reg/post/regpost/week) | 111 | 599,955 | 36.5 MB | 1999–2026 | ✅ Complete |
| stats_team (reg/post/regpost/week) | 111 | 16,915 | 8.1 MB | 1999–2026 | ✅ Complete |
| rosters (histórico) | 107 | 142,754 | 16.3 MB | 1920–2026 | ✅ Complete |
| weekly_rosters | 25 | 928,663 | 13.8 MB | 2002–2026 | ✅ Complete |
| snap_counts | 15 | 335,997 | 2.9 MB | 2012–2026 (2012 vacío/parcial en origen; datos desde 2013) | ✅ Complete según origen |
| injuries | 18 | 93,573 | 1.9 MB | 2009–2026 | ✅ Complete |
| depth_charts | 26 | 2,187,191 | 15.9 MB | 2001–2026 | ✅ Complete (⚠️ esquema cambia en 2025: sin col `season`, usa `dt`) |
| officials | 1 | 22,012 | 0.14 MB | 2015–2026 | ✅ Complete según origen |
| contracts | 1 | 53,624 | 10.7 MB | histórico (OverTheCap) | ✅ Complete (⚠️ 2,607 filas repetidas tal como publica el origen) |
| combine | 1 | 8,968 | 0.36 MB | 2000–2026 | ✅ Complete |
| draft_picks | 1 | 12,927 | 0.67 MB | 1980–2026 | ✅ Complete según origen (nflverse arranca 1980) |
| trades | 1 | 4,975 | 0.10 MB | 2002–2026 | ✅ Complete según origen |
| nextgen_stats | 3 | 27,977 | 2.2 MB | 2016–2026 | ✅ Complete |
| pfr_advstats | 40 | 145,112 | 2.8 MB | season + week 2018–2026 | ✅ Complete |
| espn_qbr | 2 | 12,530 | 0.37 MB | 2006–2026 | ✅ Complete |
| misc (pfr_rosters) | 1 | 49,518 | 0.99 MB | 2002–2022 | ✅ Complete según origen |
| players (crosswalk IDs) | 1 | 24,867 | 3.2 MB | histórico vigente | ✅ Complete (gsis/pfr/espn/pff/otc/nfl/esb/smart IDs) |
| teams (metadatos) | 1 | 36 | 0.01 MB | vigente | ✅ Complete |

**Total: 598 archivos · 6,161,560 filas · 634.3 MB** (más 40 assets 404 esperados, ver MISSING_DATA.md)
**+ NOAA GHCN-Daily: 43 estaciones · 431,484 filas · 25.7 MB** (clima diario 1999–2026)
**+ Capas derivadas de consulta** (`data/history/normalized/nfl/`, ver NORMALIZATION.md):
`games_with_weather.parquet` (7,548 juegos × 45 = cuotas cierre + clima) y
`player_week_stats.parquet` (485,205 filas × 150 = stats semanales unificados 1999–2026, REG/POST)

## Métricas clave de la capa derivada (normalized_games_report.json)

| Métrica | Valor |
|---|---|
| Juegos con estación asignada | 7,537 / 7,548 (99.9%) |
| Juegos con TMAX GHCN | 7,339 (97.2%) |
| Juegos con PRCP | 7,362 |
| Juegos con spread/total de cierre | 7,426 (98.4%) |
| Juegos con moneyline | 5,445 (72.1%; 0% 1999–2005) |
| Juegos con gamebook temp (°F) | 5,251 |
| `total == suma de scores` | 0 violaciones |
| Crosswalk players → stats/injuries/depth | 100% · snap_counts 99.8% · weekly_rosters 99.5% · rosters 93.7% (93% del resto = cortes de pretemporada, irrelevantes para temporada regular) |

## Validación cruzada pbp ↔ games (deep_validation.json)

- **7,403 de 7,407 partidos jugados (1999–2026) tienen play-by-play (99.9%).**
- Sin pbp: 1 partido de 1999, 2 de 2000, 1 de 2026 (ausencias del origen nflfastR).
- Jugadas por partido: 171–180 (rango consistente en las 28 temporadas).
- `nfl.jsonl` del repo (7,407 filas) ≡ exactamente los partidos jugados de games.csv
  (7,548 − 141 juegos futuros de 2026). Diferencia explicada al 100%.

## Notas de verificación temporal

- 2026 es temporada en curso (131/272 juegos jugados al 2026-11-08): todos los datasets semanales
  cubren hasta la semana 9 y depth charts hasta el 2026-11-08 — cobertura al día, se refresca con el downloader.
- **EPA está disponible en 98.8% de las jugadas desde 1999** (nflverse lo retrocalculó a toda la era
  modern); air yards sí comienzan ~2006; columnas de apuestas embebidas en pbp varían por era.
- Las cuotas de cierre en games.csv: spread/total 98.4% (7,426/7,548); moneyline 0% en 1999–2005,
  82–100% desde 2006, 100% desde 2010 (72.1% global).
- snap_counts_2012.parquet es un asset vacío (0 filas): los datos reales de snap counts comienzan en 2013.
