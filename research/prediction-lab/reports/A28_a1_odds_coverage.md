# A28 (Ola 1 · A1) — Cobertura y Calidad de `odds_snapshots`

**Generado (UTC):** `2026-11-11T15:31:10Z` · **Esquema:** `1.0.0`

## 1. Resumen Ejecutivo

- **Snapshots válidos totales (`odds_snapshots.parquet`):** `5,442,989` filas (`185,206` eventos únicos, `471,824` mercados `(event_id, market, line)`).
- **`historical_fd` (`matches.parquet` + `nfl_games.parquet`):** `5,431,961` filas válidas (`185,097` eventos: `182,562` fútbol + `7,102` NFL).
- **`scraped_ws` (`market_microstructure.json`):** `11,028` filas pre-partido válidas (`109` eventos únicos), tras descartar `1,077` capturas post-kickoff (`ts_captured > ts_event_start`) y `1,434` duplicados exactos.
- **Validación de rango `[1.01, 1000.0]`:** `0` filas fuera de rango descartadas y contabilizadas (`historical_fd`: `0`, `scraped_ws`: `0`).
- **Deduplicación natural `(event_id, market, line, selection, book, ts_captured, source)`:** `1,434` duplicados eliminados (`0` duplicados remanentes).

## 2. Regla Estricta de Cuota de Cierre Sharp

- **`historical_fd`:** cierre = **ÚNICAMENTE** el snapshot `close` de `book == "pinnacle"` con `ts_captured <= ts_event_start` (jamás `open` de Pinnacle, jamás `betfair_exchange` / `bfe`, jamás casas recreativas ni `nflverse`).
- **`scraped_ws`:** cierre = último snapshot pre-partido (`ts_captured <= ts_event_start`) de `book == "pinnacle"`, con fallback **ÚNICAMENTE** a `book == "smarkets"` (`closing_missing = True` en cualquier otro caso).

| Fuente (`source`) | Mercados totales | Con cierre sharp | `closing_missing` | % Cobertura cierre sharp | Desglose `closing_book` |
|---|---:|---:|---:|---:|---|
| `historical_fd` | 470,673 | 179,252 | 291,421 | 38.08% | `pinnacle`: 179,252 |
| `scraped_ws` | 1,151 | 351 | 800 | 30.50% | `pinnacle`: 351 |

> **Nota de honestidad sobre NFL histórico (`nfl_games.parquet`) y Smarkets (`scraped_ws`):**
> 1. En `nfl_games.parquet` (`nflverse/nfldata`), la fuente original no atribuye explícitamente la columna a Pinnacle, por lo que se etiqueta fielmente `book = "nflverse"` y bajo la regla humana estricta de cierre sharp se reporta `closing_missing = True` en `historical_fd` NFL (sin disfrazar consenso `nflverse` como `pinnacle`). En cambio, en `scraped_ws` los partidos de NFL capturados desde Pinnacle Arcadia sí resuelven cierre sharp real `book = "pinnacle"`.
> 2. En `market_microstructure.json`, los `158` registros `smarkets_exchange_quote` provienen de `/quotes/` por `contract_id` sin metadatos `/contracts/` (`selection`/`event_id`), y los `30` registros de Codere + `43` de OddsPortal son muestras DOM de portada sin hora de inicio; se contabilizan en `discarded_unlinked_contract_or_dom_sample` sin inventar etiquetas.

## 3. Auditoría de Descartes y Deduplicación por Fuente

| Métrica | `historical_fd` | `scraped_ws` | Total |
|---|---:|---:|---:|
| Filas candidatas emitidas (`n_raw`) | 5,431,961 | 13,539 | 5,445,500 |
| Fuera de rango `[1.01, 1000.0]` (`n_out_of_range`) | 0 | 0 | 0 |
| Post-kickoff `ts_captured > ts_event_start` | 0 | 1,077 | 1,077 |
| Duplicados clave natural eliminados | 0 | 1,434 | 1,434 |
| **Filas válidas finales (`n_valid`)** | **5,431,961** | **11,028** | **5,442,989** |

### Desglose de los `22,412` registros crudos de `market_microstructure.json` (`scraped_ws`)

- `ingested_quote_records`: `12,306`
- `non_quote_metadata_records` (resúmenes, eventos/mercados sin precio, probes): `1,855`
- `discarded_unsupported_market_or_period` (`team_total`, mitades/cuartos `period != 0`): `7,521`
- `discarded_missing_event_or_kickoff` (eventos sin `kickoff_utc` verificable o pseudo-equipos): `499`
- `discarded_unlinked_contract_or_dom_sample` (`smarkets_exchange_quote` sin `/contracts/`, muestras DOM Codere/OddsPortal): `231`
- `discarded_live_inplay`: `0`

## 4. Detección de Huecos `> 60 min` entre Capturas Consecutivas

- **Total intervalos `> 60 min` detectados:** `557,240`
  - **`scraped_ws` (capturas reales intra-día/multi-ola):** `175` huecos (mediana `78.78` min, máximo `1222.52` min).
  - **`historical_fd` (cadencia sintética `open = -24h` → `close = -1s` = `1439.98 min`):** `557,065` pares `open → close`.

## 5. Cobertura por Liga × Mercado (% con Cierre Sharp)

| Fuente | Deporte | Liga | Mercado | Mercados `(event, line)` | Con cierre sharp | % Cierre sharp |
|---|---|---|---|---:|---:|---:|
| `historical_fd` | `football` | `ARG` | `1x2` | 6,462 | 5,928 | 91.74% |
| `historical_fd` | `football` | `B1` | `1x2` | 7,205 | 3,549 | 49.26% |
| `historical_fd` | `football` | `B1` | `ah` | 6,760 | 1,870 | 27.66% |
| `historical_fd` | `football` | `B1` | `totals` | 6,582 | 1,870 | 28.41% |
| `historical_fd` | `football` | `BRA` | `1x2` | 5,658 | 5,275 | 93.23% |
| `historical_fd` | `football` | `D1` | `1x2` | 8,024 | 4,126 | 51.42% |
| `historical_fd` | `football` | `D1` | `ah` | 7,373 | 1,985 | 26.92% |
| `historical_fd` | `football` | `D1` | `totals` | 7,413 | 1,934 | 26.09% |
| `historical_fd` | `football` | `D2` | `1x2` | 8,024 | 4,068 | 50.70% |
| `historical_fd` | `football` | `D2` | `ah` | 7,313 | 1,926 | 26.34% |
| `historical_fd` | `football` | `D2` | `totals` | 7,388 | 1,926 | 26.07% |
| `historical_fd` | `football` | `E0` | `1x2` | 9,974 | 5,150 | 51.63% |
| `historical_fd` | `football` | `E0` | `ah` | 9,124 | 2,490 | 27.29% |
| `historical_fd` | `football` | `E0` | `totals` | 9,218 | 2,479 | 26.89% |
| `historical_fd` | `football` | `E1` | `1x2` | 14,521 | 7,445 | 51.27% |
| `historical_fd` | `football` | `E1` | `ah` | 12,991 | 3,581 | 27.57% |
| `historical_fd` | `football` | `E1` | `totals` | 13,395 | 3,581 | 26.73% |
| `historical_fd` | `football` | `F1` | `1x2` | 9,482 | 4,844 | 51.09% |
| `historical_fd` | `football` | `F1` | `ah` | 8,704 | 2,184 | 25.09% |
| `historical_fd` | `football` | `F1` | `totals` | 8,851 | 2,178 | 24.61% |
| `historical_fd` | `football` | `F2` | `1x2` | 8,958 | 4,864 | 54.30% |
| `historical_fd` | `football` | `F2` | `ah` | 8,697 | 2,204 | 25.34% |
| `historical_fd` | `football` | `F2` | `totals` | 8,763 | 2,204 | 25.15% |
| `historical_fd` | `football` | `G1` | `1x2` | 5,573 | 3,172 | 56.92% |
| `historical_fd` | `football` | `G1` | `ah` | 5,955 | 1,488 | 24.99% |
| `historical_fd` | `football` | `G1` | `totals` | 5,763 | 1,488 | 25.82% |
| `historical_fd` | `football` | `I1` | `1x2` | 9,668 | 5,136 | 53.12% |
| `historical_fd` | `football` | `I1` | `ah` | 9,047 | 2,478 | 27.39% |
| `historical_fd` | `football` | `I1` | `totals` | 9,022 | 2,478 | 27.47% |
| `historical_fd` | `football` | `I2` | `1x2` | 10,950 | 5,452 | 49.79% |
| `historical_fd` | `football` | `I2` | `ah` | 10,078 | 2,363 | 23.45% |
| `historical_fd` | `football` | `I2` | `totals` | 10,137 | 2,363 | 23.31% |
| `historical_fd` | `football` | `JPN` | `1x2` | 4,653 | 4,503 | 96.78% |
| `historical_fd` | `football` | `MEX` | `1x2` | 4,789 | 4,437 | 92.65% |
| `historical_fd` | `football` | `N1` | `1x2` | 7,972 | 4,039 | 50.66% |
| `historical_fd` | `football` | `N1` | `ah` | 7,430 | 1,902 | 25.60% |
| `historical_fd` | `football` | `N1` | `totals` | 7,283 | 1,901 | 26.10% |
| `historical_fd` | `football` | `P1` | `1x2` | 7,495 | 3,994 | 53.29% |
| `historical_fd` | `football` | `P1` | `ah` | 6,910 | 1,988 | 28.77% |
| `historical_fd` | `football` | `P1` | `totals` | 6,841 | 1,988 | 29.06% |
| `historical_fd` | `football` | `SC0` | `1x2` | 5,953 | 2,968 | 49.86% |
| `historical_fd` | `football` | `SC0` | `ah` | 5,474 | 1,373 | 25.08% |
| `historical_fd` | `football` | `SC0` | `totals` | 5,405 | 1,373 | 25.40% |
| `historical_fd` | `football` | `SC1` | `1x2` | 4,648 | 2,308 | 49.66% |
| `historical_fd` | `football` | `SC1` | `ah` | 4,186 | 1,052 | 25.13% |
| `historical_fd` | `football` | `SC1` | `totals` | 3,760 | 1,052 | 27.98% |
| `historical_fd` | `football` | `SP1` | `1x2` | 9,899 | 5,127 | 51.79% |
| `historical_fd` | `football` | `SP1` | `ah` | 9,073 | 2,469 | 27.21% |
| `historical_fd` | `football` | `SP1` | `totals` | 9,203 | 2,465 | 26.78% |
| `historical_fd` | `football` | `SP2` | `1x2` | 11,542 | 6,171 | 53.47% |
| `historical_fd` | `football` | `SP2` | `ah` | 11,020 | 2,969 | 26.94% |
| `historical_fd` | `football` | `SP2` | `totals` | 10,802 | 2,969 | 27.49% |
| `historical_fd` | `football` | `SWE` | `1x2` | 3,600 | 3,366 | 93.50% |
| `historical_fd` | `football` | `T1` | `1x2` | 8,268 | 4,409 | 53.33% |
| `historical_fd` | `football` | `T1` | `ah` | 7,883 | 2,275 | 28.86% |
| `historical_fd` | `football` | `T1` | `totals` | 7,602 | 2,275 | 29.93% |
| `historical_fd` | `football` | `USA` | `1x2` | 6,311 | 5,800 | 91.90% |
| `historical_fd` | `nfl` | `NFL` | `moneyline` | 5,200 | 0 | 0.00% |
| `historical_fd` | `nfl` | `NFL` | `spread` | 5,200 | 0 | 0.00% |
| `historical_fd` | `nfl` | `NFL` | `totals` | 5,198 | 0 | 0.00% |
| `scraped_ws` | `football` | `UEFA-NATIONS-LEAGUE-B` | `1x2` | 1 | 0 | 0.00% |
| `scraped_ws` | `football` | `USA` | `1x2` | 2 | 0 | 0.00% |
| `scraped_ws` | `football` | `USA` | `moneyline` | 2 | 0 | 0.00% |
| `scraped_ws` | `football` | `USA` | `spread` | 7 | 0 | 0.00% |
| `scraped_ws` | `football` | `USA` | `totals` | 8 | 0 | 0.00% |
| `scraped_ws` | `nba` | `NBA` | `moneyline` | 14 | 0 | 0.00% |
| `scraped_ws` | `nba` | `NBA` | `spread` | 33 | 0 | 0.00% |
| `scraped_ws` | `nba` | `NBA` | `totals` | 45 | 0 | 0.00% |
| `scraped_ws` | `ncaaf` | `NCAAF` | `moneyline` | 67 | 0 | 0.00% |
| `scraped_ws` | `ncaaf` | `NCAAF` | `spread` | 296 | 0 | 0.00% |
| `scraped_ws` | `ncaaf` | `NCAAF` | `totals` | 254 | 0 | 0.00% |
| `scraped_ws` | `nfl` | `NFL` | `moneyline` | 15 | 13 | 86.67% |
| `scraped_ws` | `nfl` | `NFL` | `spread` | 181 | 169 | 93.37% |
| `scraped_ws` | `nfl` | `NFL` | `totals` | 188 | 169 | 89.89% |
| `scraped_ws` | `nhl` | `NHL` | `moneyline` | 10 | 0 | 0.00% |
| `scraped_ws` | `nhl` | `NHL` | `spread` | 12 | 0 | 0.00% |
| `scraped_ws` | `nhl` | `NHL` | `totals` | 16 | 0 | 0.00% |

## 6. Cobertura por Casa (`book`) y Fuente

| Fuente | Casa (`book`) | Filas válidas | Eventos únicos | Mercados cubiertos |
|---|---|---:|---:|---:|
| `historical_fd` | `market_avg` | 1,241,771 | 153,821 | 414,144 |
| `historical_fd` | `market_max` | 1,241,767 | 153,821 | 414,143 |
| `historical_fd` | `bet365` | 911,604 | 142,021 | 255,574 |
| `historical_fd` | `pinnacle` | 838,850 | 106,149 | 193,158 |
| `historical_fd` | `william_hill` | 500,208 | 135,353 | 135,353 |
| `historical_fd` | `bwin` | 495,090 | 125,782 | 125,782 |
| `historical_fd` | `betfair_exchange` | 137,506 | 18,068 | 34,543 |
| `historical_fd` | `betfair_sportsbook` | 33,969 | 5,665 | 5,665 |
| `historical_fd` | `nflverse` | 31,196 | 5,200 | 15,598 |
| `scraped_ws` | `pinnacle` | 1,028 | 13 | 351 |
| `scraped_ws` | `polymarket` | 604 | 96 | 291 |
| `scraped_ws` | `betmgm nj` | 564 | 94 | 282 |
| `scraped_ws` | `consensus` | 564 | 94 | 282 |
| `scraped_ws` | `dk nj` | 564 | 94 | 282 |
| `scraped_ws` | `fanatics nj` | 564 | 94 | 282 |
| `scraped_ws` | `fanduel nj` | 564 | 94 | 282 |
| `scraped_ws` | `open` | 564 | 94 | 282 |
| `scraped_ws` | `betrivers nj` | 562 | 94 | 288 |
| `scraped_ws` | `bet365 nj` | 558 | 93 | 279 |
| `scraped_ws` | `action_consensus` | 508 | 81 | 246 |
| `scraped_ws` | `action_open` | 508 | 81 | 245 |
| `scraped_ws` | `fanduel` | 496 | 81 | 245 |
| `scraped_ws` | `betmgm` | 481 | 80 | 241 |
| `scraped_ws` | `draftkings` | 480 | 79 | 237 |
| `scraped_ws` | `bet365` | 478 | 80 | 240 |
| `scraped_ws` | `betrivers` | 472 | 79 | 239 |
| `scraped_ws` | `fanatics` | 468 | 78 | 234 |
| `scraped_ws` | `thescore bet nj` | 382 | 67 | 191 |
| `scraped_ws` | `thescore_bet` | 372 | 67 | 186 |
| `scraped_ws` | `kalshi` | 146 | 27 | 73 |
| `scraped_ws` | `hardrock nj` | 88 | 15 | 44 |
| `scraped_ws` | `hardrock` | 10 | 2 | 5 |
| `scraped_ws` | `caliente` | 3 | 1 | 1 |
