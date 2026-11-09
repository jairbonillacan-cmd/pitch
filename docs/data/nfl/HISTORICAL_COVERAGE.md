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
| teams (metadatos) | 1 | 36 | 0.01 MB | vigente | ✅ Complete |

**Total: 597 archivos · 6,136,693 filas · 630.9 MB** (más 39 assets 404 esperados, ver MISSING_DATA.md)

## Notas de verificación temporal

- 2026 es temporada en curso (272 juegos al 2026-11-08): cobertura parcial por diseño, se refresca con el downloader.
- pbp 1999–2005 carece de algunas métricas modernas (EPA completo, air yards desde 2006, etc.): evolución del origen, no pérdida local.
- Las cuotas de cierre en games.csv cubren spread/total 98.4% (7,426/7,548) y moneyline 72.1% (5,445/7,548; ML no se publicaba consistentemente antes de ~2002).
