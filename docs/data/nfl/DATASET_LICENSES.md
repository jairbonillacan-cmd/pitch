# DATASET_LICENSES — Licencias verificadas de datasets NFL

**Fecha de verificación:** 2026-11-08
**Verificado por:** recopilación de datos históricos NFL gratuitos de PitchLab
**Método:** lectura directa del archivo LICENSE y releases del repositorio de origen.

## Fuente principal: nflverse-data

- Repositorio: https://github.com/nflverse/nflverse-data
- **Licencia del repositorio (todos los releases): Creative Commons Attribution 4.0 International (CC-BY-4.0)**
- URL del archivo LICENSE: https://github.com/nflverse/nflverse-data/blob/main/LICENSE
- Verificación: `gh api repos/nflverse/nflverse-data/license` → "Creative Commons Attribution 4.0 International"

### Implicancias para PitchLab (SaaS comercial)

| Obligación | Cumplimiento |
|---|---|
| Uso comercial | ✅ Permitido por CC-BY-4.0 |
| Atribución | ✅ Obligatoria — debe figurar "Data from nflverse (CC-BY 4.0)" en productos que expongan estos datos |
| Redistribución | ✅ Permitida con atribución |
| Derivados | ✅ Permitidos con atribución (sin share-alike) |
| Costo | ✅ Sin costo |

### Nota sobre fuentes originales

Algunos datasets de nflverse son agregaciones de terceros (PFR, NFL.com, ESPN, OverTheCap).
nflverse los redistribuye bajo CC-BY-4.0; PitchLab descarga de nflverse (no scrapea los originales).
La atribución final debe citar la cadena: `nflverse (CC-BY 4.0)` + fuente original cuando aplique (PFR, ESPN, NFL.com, OverTheCap).

## Registro por dataset

| Dataset (dir local) | Release nflverse | Licencia | Uso comercial | Descargado | Notas |
|---|---|---|---|---|---|
| schedules (games.csv) | `schedules` | CC-BY-4.0 | Sí | ✅ (preexistente, 1999–2026) | incluye moneyline/spread/total de cierre |
| play_by_play | `pbp` | CC-BY-4.0 | Sí | ✅ 1999–2026 | nflfastR; incluye EPA/WPA/CPoe |
| player_stats (weekly + season + kicking) | `player_stats` | CC-BY-4.0 | Sí | ✅ 1999–2024 | kicking desde 2017 |
| stats_player (reg/post/regpost/week) | `stats_player` | CC-BY-4.0 | Sí | ✅ 1999–2026 | agregados oficiales |
| stats_team (+ post/regpost/week) | `stats_team` | CC-BY-4.0 | Sí | ✅ 1999–2026 | |
| rosters (histórico) | `rosters` | CC-BY-4.0 | Sí | ✅ 1920–2026 | fuente PFR vía nflverse |
| weekly_rosters | `weekly_rosters` | CC-BY-4.0 | Sí | ✅ 2002–2026 | |
| snap_counts | `snap_counts` | CC-BY-4.0 | Sí | ✅ 2012–2026 (datos 2013+) | fuente PFR vía nflverse |
| injuries | `injuries` | CC-BY-4.0 | Sí | ✅ 2009–2026 | reportes NFL.com |
| depth_charts | `depth_charts` | CC-BY-4.0 | Sí | ✅ 2001–2026 | esquema cambia 2025 (usa `dt`) |
| officials | `officials` | CC-BY-4.0 | Sí | ✅ 2015–2026 | |
| contracts | `contracts` | CC-BY-4.0 | Sí | ✅ histórico completo | fuente OverTheCap |
| combine | `combine` | CC-BY-4.0 | Sí | ✅ 2000–2026 | fuente PFR vía nflverse |
| draft_picks | `draft_picks` | CC-BY-4.0 | Sí | ✅ 1980–2026 | fuente PFR vía nflverse |
| trades | `trades` | CC-BY-4.0 | Sí | ✅ 2002–2026 | |
| nextgen_stats | `nextgen_stats` | CC-BY-4.0 | Sí | ✅ 2016–2026 | NFL Next Gen Stats vía nflverse |
| pfr_advstats | `pfr_advstats` | CC-BY-4.0 | Sí | ✅ season + week 2018–2026 | fuente PFR vía nflverse |
| espn_qbr | `espn_data` | CC-BY-4.0 | Sí | ✅ 2006–2026 | ESPN QBR vía nflverse |
| misc (pfr_rosters) | `misc` | CC-BY-4.0 | Sí | ✅ 2002–2022 | rosters antiguos PFR |
| players (crosswalk) | `players` | CC-BY-4.0 | Sí | ✅ 24,867 jugadores | 8 sistemas de IDs |
| teams | `teams` | CC-BY-4.0 | Sí | ✅ | solo metadatos/colores; **NO se descargan imágenes de logos** (IP de NFL) |
| **clima GHCN-Daily** (NOAA NCEI) | NCEI Data Service v1 | **Dominio público EE.UU.** (sin copyright; citar NCEI) | Sí | ✅ 43 estaciones, 1999–2026 | detalle en `NOAA_WEATHER.md` |

## Descartados por licencia

| Dataset | Fuente | Razón de descarte |
|---|---|---|
| ftn_charting | `ftn_charting` (FTNFantasy.com) | Términos propios de FTN con obligaciones adicionales (share-alike / condiciones específicas). Incompatibles por defecto con arquitectura propietaria de PitchLab → excluido según regla de la misión. |
| pbp_participation | `pbp_participation` (FTN/PFF) | Mismo origen FTN con condiciones adicionales y registro. Excluido. |

## Clasificados "pendiente" (no descargados masivamente)

| Dataset | Fuente | Razón |
|---|---|---|
| Cuotas históricas NFL (Kaggle `tobycrabtree/nfl-scores-and-betting-data`) | Kaggle | Licencia informada por el uploader, no verificable como abierta sin revisión legal; queda como candidato pendiente. |
| Bases de betting "free" (Scottfree sample, Databases 2003+) | varios | Muestras de productos de pago o licencia informal → pendiente/no apto. |

## Cuotas (odds) — ver FREE_DATA_RESEARCH.md

La única fuente gratuita con licencia comercial verificada es la incluida en nflverse `games.csv`
(moneyline, spread y total de cierre por partido, 1999–2026). No existe (a la fecha) otro histórico
de cuotas gratuito con licencia comercial compatible → registrado como NO DISPONIBLE el resto
(snapshots de apertura, props históricos, múltiples sportsbooks).
