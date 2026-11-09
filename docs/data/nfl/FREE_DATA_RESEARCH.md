# FREE_DATA_RESEARCH — Investigación de fuentes NFL gratuitas

**Fecha:** 2026-11-08
**Alcance:** fuentes públicas gratuitas, legalmente utilizables en PitchLab (SaaS comercial), sin contratar servicios, sin trials de pago, sin scraping prohibido.

## 1. Fuentes evaluadas

| Fuente | Tipo | Cobertura NFL | Licencia | Uso comercial | Decisión |
|---|---|---|---|---|---|
| **nflverse-data** (GitHub releases) | Datasets históricos curados | pbp 1999+, stats 1999+, rosters 1920+, injuries 2009+, depth charts 2001+, snap counts 2012+, draft/combine/contracts/trades/NGS/QBR | CC-BY-4.0 | ✅ | **USADA — fuente principal** |
| nflreadpy / nflreadr | Librerías de acceso a nflverse | ídem | MIT (código) | ✅ | Usada como referencia de catálogo; descarga directa de releases parquet |
| **NOAA NCEI GHCN-Daily** (clima) | Observaciones meteorológicas diarias por estación | 1999–2026, ~40 estaciones mapeadas a estadios NFL | **Dominio público de EE.UU.** (datos federales, sin copyright; se solicita citar NCEI/NOAA) | ✅ | **USADA — clima histórico (sección 5.J)** |
| openfootball (nfl) | Calendarios | limitado | libre (fútbol soccer principalmente) | ✅ | No necesario; nflverse supera su cobertura NFL |
| nfldata (github nflverse/nfldata) | Utilidades y mappings | equipos/conferencias | MIT/varios | ✅ | Complementaria; mappings incluidos en nflverse |
| Kaggle `tobycrabtree/nfl-scores-and-betting-data` | Scores + betting 1966/1979+ | 1966–presente | "Other" del uploader (no verificable) | ⚠️ pendiente | **PENDIENTE — no descargado masivamente** |
| The Odds API | Cuotas históricas | 2020+ | gratuito solo personal; comercial de pago | ❌ | **NO DISPONIBLE para PitchLab** (regla absoluta: no contratar) |
| Scottfree Sports | Cuotas históricas | muestra gratis | producto de pago | ❌ | Descartado (muestrario comercial) |
| SportsDataIO / Sportradar / OddsJam / Pinnacle B2B | APIs comerciales | — | de pago | ❌ | Fuera de alcance (informes REA LineMate ya los documentaban) |
| NFL.com / ESPN / PFR scraping directo | Sitios web | — | Términos restrictivos | ❌ | Descartado (no scraping de fuentes que no lo autorizan) |
| FTN Charting / pbp_participation vía nflverse | Charting avanzado | 2016/2022+ | términos FTN adicionales | ⚠️ share-alike | **Descartado** por condiciones incompatibles con arquitectura propietaria |

## 2. Decisión principal

**nflverse-data** es la única fuente que cumple simultáneamente:
1. Gratuito sin registros de pago ni tarjetas.
2. Licencia CC-BY-4.0 verificada en el propio repositorio (uso comercial + redistribución con atribución).
3. Profundidad histórica máxima disponible (pbp desde 1999, rosters desde 1920, draft desde 1936).
4. Formatos eficientes (parquet) publicados como releases versionados con URLs estables.

## 3. Cuotas históricas (sección 6 de la misión)

Deseado: moneyline, spreads, totals, opening/closing odds, sportsbooks, player props históricos.

Resultado de la investigación:

| Dato | Estado | Fuente |
|---|---|---|
| Moneyline (home/away) cierre | ✅ DISPONIBLE | nflverse `games.csv` 1999–2026 (columnas `away_moneyline`, `home_moneyline`) |
| Spread (línea) cierre | ✅ DISPONIBLE | nflverse `games.csv` (`spread_line`, `away_spread_odds`, `home_spread_odds`) |
| Total (over/under) cierre | ✅ DISPONIBLE | nflverse `games.csv` (`total_line`, `under_odds`, `over_odds`) |
| Opening odds | ❌ NO DISPONIBLE (gratis + licencia comercial) | — |
| Múltiples sportsbooks históricos | ❌ NO DISPONIBLE | proveedores gratuitos no autorizan uso comercial |
| Player props históricos | ❌ NO DISPONIBLE | solo productos de pago (LineMate report lo confirma: $5k–15k/mes feeds enterprise) |

Conclusión: **la falta de cuotas adicionales no detiene la recopilación**; el dataset de nflverse
ya provee las líneas de cierre esenciales para análisis histórico. Se registra la limitación
sin inventar datos.

## 4. Datos complementarios investigados (sección 5.J de la misión)

| Dato | Estado | Fuente |
|---|---|---|
| Draft | ✅ | `draft_picks.parquet` (1936–2026) |
| Combine | ✅ | `combine.parquet` |
| Trades | ✅ | `trades.parquet` |
| Cambios de equipo | ✅ (parcial) | `trades` + `weekly_rosters` (movimientos semanales) + `contracts` |
| Calendarios históricos | ✅ | `games.csv` (preexistente) |
| Estadio | ✅ | columnas `stadium`, `roof`, `surface` en games.csv |
| **Meteorología histórica** | ✅ **AMPLIADA** | nflverse `temp`/`wind` en games.csv (del gamebook, estadios abiertos) **+ NOAA NCEI GHCN-Daily** (TMAX/TMIN/PRCP/SNOW/SNWD/AWND diarios 1999–2026 por ~40 estaciones mapeadas a estadios; dominio público EE.UU., sin key, sin costo) — detalle y limitaciones en `NOAA_WEATHER.md` |
| Descanso entre partidos | ✅ | columnas `away_rest`, `home_rest` en games.csv |

## 5. Exclusiones razonadas

1. **FTN (ftn_charting, pbp_participation):** datos de gran calidad pero publicados vía nflverse bajo
   condiciones adicionales de FTN. La misión indica no incluirlos por defecto si sus condiciones son
   incompatibles con arquitectura propietaria → descartados y documentados.
2. **Logos de equipos:** `teams_colors_logos.parquet` solo contiene metadatos/colores/URLs. Las
   imágenes de logos son propiedad intelectual de la NFL → no se descargan.
3. **Scraping de PFR/NFL.com/ESPN directo:** términos restrictivos; todo se obtiene vía releases
   nflverse que ya lo agregan con licencia explícita.

## 6. Fuentes citadas

- https://github.com/nflverse/nflverse-data (releases y LICENSE)
- https://nflreadr.nflverse.com/reference/index.html (catálogo de datasets)
- https://nflreadpy.nflverse.com (cliente Python)
- https://www.ncei.noaa.gov/products/land-based-station/global-historical-climatology-network-daily (GHCN-Daily, dominio público EE.UU.)
- https://www.ncei.noaa.gov/access/services/data/v1 (NCEI Data Service API, sin key)
- https://www.kaggle.com/datasets/tobycrabtree/nfl-scores-and-betting-data (pendiente de licencia)
- https://the-odds-api.com/sports-odds-data/nfl-odds.html (comercial → no usado)
- Informes REA previos del repo: `Reportes/analisis-linemate/historical-odds.md`,
  `Reportes/analisis-linemate/licensing-and-data-options.md`, `Reportes/18-engine-nfl-report.md`
