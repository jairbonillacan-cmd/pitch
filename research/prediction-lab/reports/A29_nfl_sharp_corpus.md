# A29 (Ola 2 · Agente B6) — Corpus de Cierre Sharp para NFL (`nfl_sharp_closing`)

> **Agente autor:** `b6-nfl-sharp` (`B6`, Ola 2 `PREDLAB-V3.2`) · **Generado (UTC):** `2026-11-12T16:01:46Z`
> **Esquema:** `nfl_sharp_closing_v3.2.0` · **Parquet generado:** `research/prediction-lab/data/processed/nfl_sharp_closing.parquet` (`sha256=178ad93241bd2bf004f77cf576a180afbb547ab65b4b28bbc63ad76f06680cae`)
> **Comando reproducible:**
> ```powershell
> Set-Location "C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\prediction-lab"
> .\research\prediction-lab\.venv\Scripts\python.exe services/ingest/nfl_sharp_closing.py
> ```

---

## 1. Resumen Ejecutivo y Veredicto de Compuerta (`>= 64` Partidos) — `OBSERVADO`

1. **Serie prospectiva multi-tick `odds_timeseries/nfl` (`B3`):** **`0` eventos** (`0` archivos `.jsonl`, `0` filas leídas; `health.json` en estado `"prospective_capture_pending"` al `2026-11-12T15:17:54Z`, `OBSERVADO`).
2. **Consolidación transparente del lote real previo `scraped_ws` (`2026-11-09` en `odds_snapshots.parquet`):** **`13` eventos NFL** con captura pre-kickoff verificada de **`pinnacle`** (`1,028` filas sharp válidas entre `2026-11-09T18:46:13Z` y `2026-11-09T20:05:00Z`, `0` filas válidas de `smarkets`, `OBSERVADO`), consolidados en **`39` filas `(game_id, market)`** (`13` partidos × `moneyline`, `spread`, `totals`).
3. **Cruce canónico con `nflverse` (`data/nfl/raw/games.csv` + `nfl_games.parquet`):** **`13 / 13` partidos (`100.0%`)** resuelven su `game_id` canónico de `nflverse` (`1` partido de Semana `9` MNF `2026_09_BUF_MIN` y `12` partidos de Semana `10` `2026_10_*`; `0` eventos en `unmatched_future`, `OBSERVADO`).
4. **Partidos liquidados con marcador final (`is_settled == True`):** **`0 / 13`** (`0` presentes en el corte liquidado `nfl_games.parquet <= 2026-11-08`; `games.csv` local fue descargado el `2026-11-09T14:36:27Z` antes del kickoff de `2026_09_BUF_MIN` el `2026-11-10T01:15:00Z`, por lo que los `13` partidos tienen `home_score = NaN, away_score = NaN`, `OBSERVADO`).
5. **Compuerta de suficiencia muestral (`MIN_SETTLED_GAMES_FOR_EVAL = 64`):**
   - `n_settled_games_with_sharp_closing = 0 < 64` (faltan **`64`** partidos liquidados con cierre sharp real).
   - **`corpus_sufficient_for_eval = False`** (`OBSERVADO`).
   - **`production_enabled = False`** — **NFL sigue apagado** (`NFL::moneyline`, `NFL::spread` y `NFL::totals` verificados en `false` en `src/data/prediction/production_segments_v3_1.json`, `sha256=0bc03bbff96a5d82a1a7858e1e8623bf7bfdb250c546d2773a71d56ed9ada9bc`, `OBSERVADO`).

---

## 2. Auditoría de Fuentes, Rechazo Estricto de No-Sharp y Anti-Leakage (`OBSERVADO`)

| Fuente / Filtro | Conteo | Etiqueta | Detalle Auditable |
|---|---:|---|---|
| `../web-scraping/data/odds_timeseries/nfl/*.jsonl` | `0` | `OBSERVADO` | `0` archivos `.jsonl`; `capture_status = "prospective_capture_pending"` (sin credenciales activas para `the_odds_api`/`betfair_exchange` y sin evasión anti-bot). |
| `odds_snapshots.parquet` (`sport == "nfl"`, `historical_fd`) | `31,196` | `OBSERVADO` | **Rechazadas al 100%**: líneas de consenso anónimo `book == "nflverse"` (`5,200` partidos históricos sin casa sharp identificable; Regla Rectora #4). |
| `odds_snapshots.parquet` (`sport == "nfl"`, `scraped_ws`) | `2,014` | `OBSERVADO` | Filas pre-kickoff normalizadas candidatas ingresadas a validación (`validate_and_deduplicate_snapshots`). |
| Ticks post-kickoff descartados (`ts_captured > ts_event_start`) | `0` | `OBSERVADO` | Guardia anti-fuga temporal estricta en `validate_and_deduplicate_snapshots`. |
| Cuotas fuera de `[1.01, 1000.0]` o incompletas | `0` | `OBSERVADO` | Validación dura de dominio decimal y timestamps UTC. |
| Filas no-sharp rechazadas en `scraped_ws` (`19` emisores) | `986` | `OBSERVADO` | **Rechazadas al 100%**: recreativas US/MX y consensos/mercados de predicción (`draftkings`, `dk nj`, `fanduel`, `bet365`, `betmgm`, `betrivers`, `fanatics nj`, `hardrock`, `action_consensus`, `consensus`, `open`, `polymarket`, `kalshi`). |
| Filas sharp válidas pre-kickoff (`pinnacle` / `smarkets`) | `1,028` | `OBSERVADO` | `pinnacle = 1,028`, `smarkets = 0` (`351` combinaciones `(event_id, market, line)` incluyendo líneas alternas). |
| **Filas canónicas finales en `nfl_sharp_closing.parquet`** | **`39`** | `OBSERVADO` | `1` línea principal por `(game_id, market)` (`13` partidos × `3` mercados: `moneyline`, `spread`, `totals`). |

### Desglose de casas no-sharp rechazadas en el corte NFL `scraped_ws` (`OBSERVADO`)

| Casa / Emisor rechazado (`book`) | Filas descartadas | Motivo de rechazo (Regla #4 y #8) |
|---|---:|---|
| `action_consensus` | `12` | Consenso / apertura agregada (prohibido como cierre sharp) |
| `action_open` | `12` | Consenso / apertura agregada (prohibido como cierre sharp) |
| `bet365` | `6` | Casa recreativa (`book not in ('pinnacle', 'smarkets')`) |
| `bet365 nj` | `84` | Casa recreativa (`book not in ('pinnacle', 'smarkets')`) |
| `betmgm` | `6` | Casa recreativa (`book not in ('pinnacle', 'smarkets')`) |
| `betmgm nj` | `84` | Casa recreativa (`book not in ('pinnacle', 'smarkets')`) |
| `betrivers` | `6` | Casa recreativa (`book not in ('pinnacle', 'smarkets')`) |
| `betrivers nj` | `84` | Casa recreativa (`book not in ('pinnacle', 'smarkets')`) |
| `consensus` | `84` | Consenso / apertura agregada (prohibido como cierre sharp) |
| `dk nj` | `84` | Casa recreativa (`book not in ('pinnacle', 'smarkets')`) |
| `draftkings` | `12` | Casa recreativa (`book not in ('pinnacle', 'smarkets')`) |
| `fanatics nj` | `84` | Casa recreativa (`book not in ('pinnacle', 'smarkets')`) |
| `fanduel` | `6` | Casa recreativa (`book not in ('pinnacle', 'smarkets')`) |
| `fanduel nj` | `84` | Casa recreativa (`book not in ('pinnacle', 'smarkets')`) |
| `hardrock` | `6` | Casa recreativa (`book not in ('pinnacle', 'smarkets')`) |
| `hardrock nj` | `84` | Casa recreativa (`book not in ('pinnacle', 'smarkets')`) |
| `kalshi` | `80` | Mercado de predicción no homologado en `SHARP_BOOKS_SCRAPED_FALLBACK_ORDER` |
| `open` | `84` | Consenso / apertura agregada (prohibido como cierre sharp) |
| `polymarket` | `84` | Mercado de predicción no homologado en `SHARP_BOOKS_SCRAPED_FALLBACK_ORDER` |

---

## 3. Estadísticos Descriptivos e Inferencia Bootstrap (`mulberry32`, `1,000` remuestreos)

### 3.1 Calibración sobre Partidos Liquidados (`is_settled == True`)

| Mercado | `n_settled_non_push` | `log_loss` cierre sharp [IC 95%] | `Brier` cierre sharp [IC 95%] | Diagnóstico Estadístico (`OBSERVADO`) |
|---|---:|---|---|---|
| `NFL::moneyline` | `0` | N/A | N/A | `muestra insuficiente (n=0 < 64; no significativa)` |
| `NFL::spread` | `0` | N/A | N/A | `muestra insuficiente (n=0 < 64; no significativa)` |
| `NFL::totals` | `0` | N/A | N/A | `muestra insuficiente (n=0 < 64; no significativa)` |

### 3.2 Microestructura Observada en las `39` Líneas Principales de `Pinnacle` (`OBSERVADO`)

- **Rango temporal de capturas sharp (`ts_closing`):** `2026-11-09T18:46:13Z` a `2026-11-09T20:05:00Z` (`2` olas el `2026-11-09`; el `100%` de las `39` filas finales resuelve al corte `2026-11-09T20:05:00Z`).
- **Margen implícito medio (`closing_overround`, `n = 39` mercados):** `3.27%` (`[3.14%, 3.41%]`) (`mulberry32`, `1,000` remuestreos).
- **Anticipación media al kickoff (`lead_time_to_kickoff_minutes`, `n = 39` mercados):** `7791.2 min` (`[6989.6, 8485.1] min`).
  - **Nota de honestidad temporal (`INFERIDO` a partir de `lead_time_to_kickoff_minutes`):** salvo `2026_09_BUF_MIN` (capturado a `T - 310.0 min` = `5.17 h` del kickoff), los `12` partidos de Semana `10` corresponden a **apertura temprana de semana** (`4,630.0` a `10,390.0 min` antes del kickoff = `3.2` a `7.2` días). `resolve_closing_odds` devuelve legítimamente el último snapshot sharp pre-partido disponible hoy, pero para evaluación rigurosa de `CLV%` y `Δlog_loss` contra cierre verdadero se requiere que `cadence_scheduler.py` (`B3`) opere con `THE_ODDS_API_KEY` hasta `[T-60m, T-0]` (`<= 3.69 min`).
- **Calibración contra cierre sharp real de NFL hoy:** **`DESCONOCIDO`** (`n_settled = 0 < 64`; prohibido sustituir con consenso `nflverse`).

---

## 4. Cobertura Detallada del Parquet (`39` Filas por `(game_id, market)`) — `OBSERVADO`

| `game_id` | Sem. | `gameday` | Kickoff UTC | Cruce (`away @ home`) | Mercado | Línea | Libro | `lead_min` | Overround | `p_home / p_over` | `p_away / p_under` | Liquidado | Origen |
|---|---:|---|---|---|---|---:|---|---:|---:|---:|---:|---|---|
| `2026_09_BUF_MIN` | 9 | `2026-11-09` | `2026-11-10T01:15:00Z` | `BUF @ MIN` | `moneyline` | `—` | `pinnacle` | `310.0` | `2.69%` | `0.3565` | `0.6435` | `False` | `odds_snapshots_scraped_ws_2026_11_09` |
| `2026_09_BUF_MIN` | 9 | `2026-11-09` | `2026-11-10T01:15:00Z` | `BUF @ MIN` | `spread` | `+3.0` | `pinnacle` | `310.0` | `2.33%` | `0.4596` | `0.5404` | `False` | `odds_snapshots_scraped_ws_2026_11_09` |
| `2026_09_BUF_MIN` | 9 | `2026-11-09` | `2026-11-10T01:15:00Z` | `BUF @ MIN` | `totals` | `45.0` | `pinnacle` | `310.0` | `2.91%` | `0.5000` | `0.5000` | `False` | `odds_snapshots_scraped_ws_2026_11_09` |
| `2026_10_WAS_NYG` | 10 | `2026-11-12` | `2026-11-13T01:15:00Z` | `WAS @ NYG` | `moneyline` | `—` | `pinnacle` | `4630.0` | `2.98%` | `0.5548` | `0.4452` | `False` | `odds_snapshots_scraped_ws_2026_11_09` |
| `2026_10_WAS_NYG` | 10 | `2026-11-12` | `2026-11-13T01:15:00Z` | `WAS @ NYG` | `spread` | `-2.5` | `pinnacle` | `4630.0` | `2.88%` | `0.4904` | `0.5096` | `False` | `odds_snapshots_scraped_ws_2026_11_09` |
| `2026_10_WAS_NYG` | 10 | `2026-11-12` | `2026-11-13T01:15:00Z` | `WAS @ NYG` | `totals` | `42.5` | `pinnacle` | `4630.0` | `3.84%` | `0.4976` | `0.5024` | `False` | `odds_snapshots_scraped_ws_2026_11_09` |
| `2026_10_NE_DET` | 10 | `2026-11-15` | `2026-11-15T14:30:00Z` | `NE @ DET` | `moneyline` | `—` | `pinnacle` | `8305.0` | `2.94%` | `0.5849` | `0.4151` | `False` | `odds_snapshots_scraped_ws_2026_11_09` |
| `2026_10_NE_DET` | 10 | `2026-11-15` | `2026-11-15T14:30:00Z` | `NE @ DET` | `spread` | `-2.5` | `pinnacle` | `8305.0` | `2.94%` | `0.5248` | `0.4752` | `False` | `odds_snapshots_scraped_ws_2026_11_09` |
| `2026_10_NE_DET` | 10 | `2026-11-15` | `2026-11-15T14:30:00Z` | `NE @ DET` | `totals` | `51.0` | `pinnacle` | `8305.0` | `3.83%` | `0.5071` | `0.4929` | `False` | `odds_snapshots_scraped_ws_2026_11_09` |
| `2026_10_CAR_NO` | 10 | `2026-11-15` | `2026-11-15T18:00:00Z` | `CAR @ NO` | `moneyline` | `—` | `pinnacle` | `8515.0` | `2.94%` | `0.5248` | `0.4752` | `False` | `odds_snapshots_scraped_ws_2026_11_09` |
| `2026_10_CAR_NO` | 10 | `2026-11-15` | `2026-11-15T18:00:00Z` | `CAR @ NO` | `spread` | `-1.0` | `pinnacle` | `8515.0` | `2.88%` | `0.5096` | `0.4904` | `False` | `odds_snapshots_scraped_ws_2026_11_09` |
| `2026_10_CAR_NO` | 10 | `2026-11-15` | `2026-11-15T18:00:00Z` | `CAR @ NO` | `totals` | `47.5` | `pinnacle` | `8515.0` | `3.85%` | `0.5000` | `0.5000` | `False` | `odds_snapshots_scraped_ws_2026_11_09` |
| `2026_10_HOU_CLE` | 10 | `2026-11-15` | `2026-11-15T18:00:00Z` | `HOU @ CLE` | `moneyline` | `—` | `pinnacle` | `8515.0` | `3.30%` | `0.3185` | `0.6815` | `False` | `odds_snapshots_scraped_ws_2026_11_09` |
| `2026_10_HOU_CLE` | 10 | `2026-11-15` | `2026-11-15T18:00:00Z` | `HOU @ CLE` | `spread` | `+5.0` | `pinnacle` | `8515.0` | `2.91%` | `0.5048` | `0.4952` | `False` | `odds_snapshots_scraped_ws_2026_11_09` |
| `2026_10_HOU_CLE` | 10 | `2026-11-15` | `2026-11-15T18:00:00Z` | `HOU @ CLE` | `totals` | `39.5` | `pinnacle` | `8515.0` | `3.84%` | `0.4976` | `0.5024` | `False` | `odds_snapshots_scraped_ws_2026_11_09` |
| `2026_10_JAX_TEN` | 10 | `2026-11-15` | `2026-11-15T18:00:00Z` | `JAX @ TEN` | `moneyline` | `—` | `pinnacle` | `8515.0` | `3.77%` | `0.1850` | `0.8150` | `False` | `odds_snapshots_scraped_ws_2026_11_09` |
| `2026_10_JAX_TEN` | 10 | `2026-11-15` | `2026-11-15T18:00:00Z` | `JAX @ TEN` | `spread` | `+10.0` | `pinnacle` | `8515.0` | `2.86%` | `0.5119` | `0.4881` | `False` | `odds_snapshots_scraped_ws_2026_11_09` |
| `2026_10_JAX_TEN` | 10 | `2026-11-15` | `2026-11-15T18:00:00Z` | `JAX @ TEN` | `totals` | `47.5` | `pinnacle` | `8515.0` | `4.01%` | `0.4871` | `0.5129` | `False` | `odds_snapshots_scraped_ws_2026_11_09` |
| `2026_10_KC_ATL` | 10 | `2026-11-15` | `2026-11-15T18:00:00Z` | `KC @ ATL` | `moneyline` | `—` | `pinnacle` | `8515.0` | `3.15%` | `0.3684` | `0.6316` | `False` | `odds_snapshots_scraped_ws_2026_11_09` |
| `2026_10_KC_ATL` | 10 | `2026-11-15` | `2026-11-15T18:00:00Z` | `KC @ ATL` | `spread` | `+3.5` | `pinnacle` | `8515.0` | `2.91%` | `0.5271` | `0.4729` | `False` | `odds_snapshots_scraped_ws_2026_11_09` |
| `2026_10_KC_ATL` | 10 | `2026-11-15` | `2026-11-15T18:00:00Z` | `KC @ ATL` | `totals` | `45.5` | `pinnacle` | `8515.0` | `3.79%` | `0.4882` | `0.5118` | `False` | `odds_snapshots_scraped_ws_2026_11_09` |
| `2026_10_MIA_IND` | 10 | `2026-11-15` | `2026-11-15T18:00:00Z` | `MIA @ IND` | `moneyline` | `—` | `pinnacle` | `8515.0` | `2.95%` | `0.5713` | `0.4287` | `False` | `odds_snapshots_scraped_ws_2026_11_09` |
| `2026_10_MIA_IND` | 10 | `2026-11-15` | `2026-11-15T18:00:00Z` | `MIA @ IND` | `spread` | `-2.5` | `pinnacle` | `8515.0` | `2.91%` | `0.5048` | `0.4952` | `False` | `odds_snapshots_scraped_ws_2026_11_09` |
| `2026_10_MIA_IND` | 10 | `2026-11-15` | `2026-11-15T18:00:00Z` | `MIA @ IND` | `totals` | `40.5` | `pinnacle` | `8515.0` | `3.84%` | `0.5047` | `0.4953` | `False` | `odds_snapshots_scraped_ws_2026_11_09` |
| `2026_10_LA_ARI` | 10 | `2026-11-15` | `2026-11-15T21:05:00Z` | `LA @ ARI` | `moneyline` | `—` | `pinnacle` | `8700.0` | `3.60%` | `0.2329` | `0.7671` | `False` | `odds_snapshots_scraped_ws_2026_11_09` |
| `2026_10_LA_ARI` | 10 | `2026-11-15` | `2026-11-15T21:05:00Z` | `LA @ ARI` | `spread` | `+7.5` | `pinnacle` | `8700.0` | `2.86%` | `0.5119` | `0.4881` | `False` | `odds_snapshots_scraped_ws_2026_11_09` |
| `2026_10_LA_ARI` | 10 | `2026-11-15` | `2026-11-15T21:05:00Z` | `LA @ ARI` | `totals` | `44.5` | `pinnacle` | `8700.0` | `4.03%` | `0.4895` | `0.5105` | `False` | `odds_snapshots_scraped_ws_2026_11_09` |
| `2026_10_SEA_LV` | 10 | `2026-11-15` | `2026-11-15T21:05:00Z` | `SEA @ LV` | `moneyline` | `—` | `pinnacle` | `8700.0` | `3.19%` | `0.3712` | `0.6288` | `False` | `odds_snapshots_scraped_ws_2026_11_09` |
| `2026_10_SEA_LV` | 10 | `2026-11-15` | `2026-11-15T21:05:00Z` | `SEA @ LV` | `spread` | `+3.5` | `pinnacle` | `8700.0` | `2.96%` | `0.5225` | `0.4775` | `False` | `odds_snapshots_scraped_ws_2026_11_09` |
| `2026_10_SEA_LV` | 10 | `2026-11-15` | `2026-11-15T21:05:00Z` | `SEA @ LV` | `totals` | `43.5` | `pinnacle` | `8700.0` | `3.84%` | `0.4976` | `0.5024` | `False` | `odds_snapshots_scraped_ws_2026_11_09` |
| `2026_10_SF_DAL` | 10 | `2026-11-15` | `2026-11-15T21:25:00Z` | `SF @ DAL` | `moneyline` | `—` | `pinnacle` | `8720.0` | `3.16%` | `0.3402` | `0.6598` | `False` | `odds_snapshots_scraped_ws_2026_11_09` |
| `2026_10_SF_DAL` | 10 | `2026-11-15` | `2026-11-15T21:25:00Z` | `SF @ DAL` | `spread` | `+4.0` | `pinnacle` | `8720.0` | `2.89%` | `0.5072` | `0.4928` | `False` | `odds_snapshots_scraped_ws_2026_11_09` |
| `2026_10_SF_DAL` | 10 | `2026-11-15` | `2026-11-15T21:25:00Z` | `SF @ DAL` | `totals` | `56.0` | `pinnacle` | `8720.0` | `3.84%` | `0.4976` | `0.5024` | `False` | `odds_snapshots_scraped_ws_2026_11_09` |
| `2026_10_PIT_CIN` | 10 | `2026-11-15` | `2026-11-16T01:20:00Z` | `PIT @ CIN` | `moneyline` | `—` | `pinnacle` | `8955.0` | `3.14%` | `0.6475` | `0.3525` | `False` | `odds_snapshots_scraped_ws_2026_11_09` |
| `2026_10_PIT_CIN` | 10 | `2026-11-15` | `2026-11-16T01:20:00Z` | `PIT @ CIN` | `spread` | `-3.5` | `pinnacle` | `8955.0` | `2.91%` | `0.4976` | `0.5024` | `False` | `odds_snapshots_scraped_ws_2026_11_09` |
| `2026_10_PIT_CIN` | 10 | `2026-11-15` | `2026-11-16T01:20:00Z` | `PIT @ CIN` | `totals` | `48.5` | `pinnacle` | `8955.0` | `3.84%` | `0.4953` | `0.5047` | `False` | `odds_snapshots_scraped_ws_2026_11_09` |
| `2026_10_LAC_BAL` | 10 | `2026-11-16` | `2026-11-17T01:15:00Z` | `LAC @ BAL` | `moneyline` | `—` | `pinnacle` | `10390.0` | `3.30%` | `0.6815` | `0.3185` | `False` | `odds_snapshots_scraped_ws_2026_11_09` |
| `2026_10_LAC_BAL` | 10 | `2026-11-16` | `2026-11-17T01:15:00Z` | `LAC @ BAL` | `spread` | `-5.0` | `pinnacle` | `10390.0` | `2.91%` | `0.5000` | `0.5000` | `False` | `odds_snapshots_scraped_ws_2026_11_09` |
| `2026_10_LAC_BAL` | 10 | `2026-11-16` | `2026-11-17T01:15:00Z` | `LAC @ BAL` | `totals` | `38.5` | `pinnacle` | `10390.0` | `3.85%` | `0.5000` | `0.5000` | `False` | `odds_snapshots_scraped_ws_2026_11_09` |

---

## 5. Contrato Entregado a `B9` (`b9-nfl-epa`, Ola 3)

- **Ruta:** `research/prediction-lab/data/processed/nfl_sharp_closing.parquet` (`26` columnas tipadas: `game_id, event_id, season, week, gameday, ts_event_start, home_team, away_team, market, line, closing_book, ts_closing, lead_time_to_kickoff_minutes, closing_overround, p_home_novig, p_away_novig, p_over_novig, p_under_novig, price_home_decimal, price_away_decimal, price_over_decimal, price_under_decimal, home_score, away_score, is_settled, ingest_origin`).
- **Cobertura del calendario `nflverse` local:** `7,548` partidos totales (`7,411` liquidados hasta `2026-11-08` + `137` programados hasta `2027-01-10`).
- **Regla obligatoria para `B9` (TODO 4.1):** al encontrarse `corpus_sufficient_for_eval == False` (`0 < 64` partidos liquidados con cierre sharp), `B9` puede inspeccionar sin bloqueo el esquema real de `nfl_sharp_closing.parquet`, debe evaluar su experimento causal EPA en `walk_forward_dev` reportando el consenso `nflverse` con la etiqueta explícita `"sin cierre sharp"`, registrar el ensayo con `unlock_holdout=False` y mantener `model_nfl_v3_2_candidate.json` en estado `candidate` (`production_enabled = False`).
