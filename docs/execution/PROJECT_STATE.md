# Estado del proyecto PitchLab · Prediction Lab

> **Propósito:** que cualquier sesión cuantitativa o de producto retome el trabajo en `prediction-lab` sin reconstruir el contexto ni reabrir un holdout consumido. Se actualiza al cerrar cada fase.
> **Última actualización:** 2026-11-12 · **Rama / Worktree:** `prediction-lab` (`.worktrees/prediction-lab`) y `web-scraping` (`.worktrees/web-scraping`)

## Estado actual

- **Spacetime Suite `v3.0` (`666c5c7` → `263857a`):** ✅ motores base multi-deporte y feature store integrados.
- **Ola 1 (`v3.1`) — Infraestructura de Verdad (`A1` + `A2` + `A3` + Puerta 1 `A9`):** ✅ completa (`c96c7b3`, `e41f463`, `a852528`, `622949c`):
  - `5,442,989` snapshots pre-partido normalizados en `odds_snapshots.parquet` con resolución estricta de cierre sharp (`pinnacle` en `historical_fd`; `pinnacle` → `smarkets` en `scraped_ws`; `closing_missing=True` en el `100%` de NFL `nflverse`).
  - `PickLedger` inmutable encadenado por SHA-256 y tracker `CLV%` / `CLV_prob` / `ROI%` con bootstrap determinista (`>= 1,000` remuestreos `mulberry32`, paridad `< 10^{-12}` TS ↔ Python).
  - Arnés *walk-forward* anti-fuga (`DataLeakageError`), retraso realista `execution_delay_minutes = 2.0` (`alpha = 0.05` en pares `open→close`) y partición temporal fija de `70,812` eventos en `walk_forward_dev` (`56,649` eventos `< 2025-02-02T17:30:00Z`) y `holdout_sealed` (`14,163` eventos `>= 2025-02-02T17:30:00Z`).
- **Ola 2 (`v3.1`) — Calibración Modelo-Mercado y Motor de Decisión `v3.1` (`A4` + `A5` + Puerta 2 `A9`):** ✅ completa (`5b3df2c`, `ce348e0`, `c4439df`):
  - Mezcla logit modelo-mercado con selección *walk-forward* de método de-vig (`power = 38`, `proportional = 16`, `shin = 6`) y contracción $n_0 = 300$: `48 / 60` segmentos apagados automáticamente y `12 / 60` habilitados en `dev`.
  - Motor de picks con niveles exclusivos `["solido", "valor"]` (eliminados `"Pick Ancla >= 54%"` y `"Tiro de Cuota Alta"`), umbrales EV por Bayes empírico ($m_0 = 60$), filtros de dispersión ($\sigma_p \le 0.06$) y *steam* adverso, Kelly ¼ encogido y 4 topes duros (`2.0u / 2.0u / 3.0u / 5.0u`, `0` violaciones).
- **Ola 3 (`v3.1`) — Mercados 2-Vías, Exportación GBM a TS y Líneas Rezagadas (`A6` + `A7` + `A8` + Puerta 3 `A9`):** ✅ completa (`732a403`, `6583954`, `dfbf2e4`, `700dd24`, `e0f7910`):
  - `A6`: liquidación asiática exacta de 5 estados (`.25`/`.75`) y matrices Dixon-Coles; **`0 / 92` segmentos activados** con DC puro bajo Regla Rectora #4.
  - `A7`: *tree-walker* `HistGradientBoosting` nativo en TS (`< 0.065 ms`, paridad `< 4.09×10^{-8}` en `4,785` partidos OOS), mantenido en **`production_activated: false`** (`engine.ts` intacto) tras comprobar degradación de `-1.46 pp [-2.70%, -0.29%]` en `CLV%` OOF de picks de modelo.
  - `A8`: detector de líneas rezagadas de **Doble Confirmación** (`CLV% = +10.93% [+8.37%, +13.86%]` en `dev`, `+3.05 pp` sobre señal solo-sharp) y derivación matemática de cadencia óptima de scraping (`3.69 min` en `T-60m`, `8.57 min` matchday cercano, `11.69 min` matchday, `30.40 min` semanal).
- **Ola 4 (`v3.1`) — Apertura Única del Holdout Sellado y Síntesis Final `v3.1` (`A10`, `f3564a4`, `"holdout consumido"`):** ✅ completa (2026-11-11, **cero re-tuning post-holdout**):
  - Consolidación auditable de las `24` corridas `run_backtest` de Olas 1–3 + `1` integrada pre-holdout (`25` corridas con `unlock_holdout=false`) + `4` corridas de una sola pasada sobre `holdout_sealed` (`trial_seq = 26..29` en `services/models/artifacts/holdout_trial_registry.jsonl`).
  - En `holdout_sealed` (`14,163` eventos `>= 2025-02-02T17:30:00Z`, **`"holdout consumido"`**), el **Sistema Integrado `v3.1` (`A4+A5+A8`)** ejecutó `50` picks (`39` con cierre Pinnacle): **`CLV% = -2.27% [-5.80%, +0.68%]` (`"no significativa"`)**, **`ROI% = -4.23% [-32.85%, +24.27%]` (`"no significativa"`)**, `MaxDD = 9.88u` (frente a `172` picks y `ROI% = -17.97%` en `v3.0`), `0` violaciones de topes.
  - **Segmentos activos en producción (`src/data/prediction/production_segments_v3_1.json`):** **`0 / 60` (`production_enabled: true = 0`, `production_enabled: false = 60`)**.
- **Ciclo `PREDLAB-V3.2` — Panorama Público sin Stake (`MatchOutlook`), Captura Legal, Paper-Trading y Candidatos Causales:** ✅ completo (2026-11-12, **cero re-tuning de `v3.1`, cero lecturas de `holdout_sealed` (`"holdout consumido"`), `50/50` controles Red Team en `PASS` en las 3 puertas**):
  - **Ola 0 — Contratos y Línea Base (`O`, `b04e342`):** congelamiento criptográfico `SHA-256` de los artefactos `v3.1` (`production_segments_v3_1.json`, `blend_weights_v3_1.json`, `pick_policy_v3_1.json`, `stale_lines_config.json`, `engine.ts`, `sealed_holdout_v3_1_eval.json`) y contratos `MASTER.md`, `CONTRACT_OUTLOOK.md` y `CONTRACT_ODDS_TIMESERIES.md`.
  - **Ola 1 — Motor `MatchOutlook`, Compuerta Dura, Captura Legal y Calibración Causal (`B3` `4993a9b`/`48854e8`, `B2` `5f403ae`, `B1` `a33cdc4`, `B4` `1e22b6a` · Puerta 1 `V` `e20e823` `PASS` `18/18`):**
    - `B1`: primitivas centralizadas en `src/domain/prediction/math.ts` y constructor puro `src/domain/prediction/outlook.ts` (`11` mercados fútbol + `topScorelines[3]` desde una única matriz Dixon-Coles y `3` mercados NFL; `0` campos de `stake`/`kelly`/`ev`/`tier`; paridad TS↔Py `max|Δ| = 4.991e-13 < 1e-12`).
    - `B2`: eliminación de cuotas sintéticas (`reconstructExecutionOdds`) y `dixonColesProbs8` en `service.ts`, compuerta `0/60` segmentos activos (`executableBetsCount = 0` en los `242` partidos vivos), ancla explícita Smarkets, `featureCoverage` (`38/113 = 33.63%` en fútbol vivo y `4/29 = 13.79%` en NFL `v3.0` vivo, ambos `"low_coverage"`), `service_constants_v3_2.json` (`13` constantes) y unificación de `VALID_PICK_TIERS = ("solido", "valor")`.
    - `B3`: auditoría legal de `7` fuentes de cuotas (`docs/LEGAL_FUENTES_CUOTAS.md`: `2` `api_only` + `5` `blocked_pending_owner_decision`), `scrapers/cadence_scheduler.py` acoplado en solo lectura a `stale_lines_config.json` (`T-60m <= 3.6858 min`, `0` evasión anti-bot) y `data/odds_timeseries/health.json` en `prospective_capture_pending` (`0` filas falsas).
    - `B4`: evaluación causal en `walk_forward_dev` (`56,649` eventos `< 2025-02-02T17:30:00Z`, `trial_seq = 30`, `unlock_holdout = false`) y publicación de `outlook_calibration_v3_2.json` (`98` segmentos: `93` `liga × mercado` + `5` `GLOBAL`; selecciona `blend_v3_1` en `3/93` —`D2::1x2`, `G1::1x2`, `G1::totals`, todos con `ΔLL` `"no significativa"`— y `market_sharp_novig` en `90/93`; `NFL::moneyline` etiquetado `"sin cierre sharp"`).
  - **Ola 2 — Paper-Trading Encadenado, Corpus Sharp NFL y Snapshot Vivo (`B6` `70e08db`, `B8` `96a8f4b`, `B5` `adb0313` · Puerta 2 `V` `19453fb` `PASS` `16/16`):**
    - `B5`: runner causal e idempotente `services/models/paper_trading.py` (`corte > 2026-11-08T20:30:00Z`, `execution_delay >= 2.0 min`, separación estricta `provenance = "real"` vs `"synthetic"`). Ledger real `data/ledger/picks_v3_2_prospective.jsonl` en `0 / 150` picks reales; fixture sintético aislado (`12` eslabones, `4` picks) con paridad `0` bits TS↔Python.
    - `B6`: `nfl_sharp_closing.parquet` (`39` filas `pinnacle` en `13` juegos futuros unidos a `nflverse`, `31,196` filas de consenso y `986` recreativas rechazadas) y compuerta `n_settled = 0 < 64` (`production_enabled = false`, calibración sharp `DESCONOCIDO`).
    - `B8`: regeneración verificada (`--check`) de `src/data/prediction/live_matchday_v3_snapshot.json` (`schema_version = "3.2.0"`, `130` `MatchOutlook` con `market: null` y `pSource: "model"` ante `0` cuotas `< 72 h` + `242` matchups con `executable_bets_count = 0`) y guía `SYNC_NOTES.md`.
  - **Ola 3 — Experimentos Causales XI Confirmado y NFL EPA como Candidatos Inactivos (`B7` `53ff835`, `B9` `bbfdbc5` · Puerta 3 `V` `14e3e1e` `PASS` `16/16`):**
    - `B7` (`EXP_V32_xi`): contrato anti-fuga `CONTRACT_XI_PUBLISHED.md` (`ts_xi_published <= ts_captured <= ts_decision - 2.0 min < kickoff_utc`), auditoría de `7` fuentes XI (`2` `api_only` + `5` `blocked_pending_owner_decision`) y verificación de `0 / 52,746` partidos con `ts_xi_published` real en `walk_forward_dev` (`ΔLL = 0.000000`, `"no significativa"`, efecto real `DESCONOCIDO`, `production_activated: false`).
    - `B9` (`EXP_V32_nfl_epa`): candidato separado `src/data/prediction/model_nfl_v3_2_candidate.json` (`41` features con `12` agregados PBP `nflverse` estrictamente causales `w' < w` `< 2025-02-02`, `trial_seq = 31`, `unlock_holdout = false`, `status = "candidate"`, `production_activated = false`; `model_nfl.json` intacto). Sube cobertura viva NFL de `4/29` (`13.79%`) a `34.37/41` (`83.83%`, `0/46` `"low_coverage"`), mejora `-0.065911 [-0.075109, -0.056734]` vs `v3.0` vivo, resulta `"no significativa"` en `DEV_OOS 2020..2024` (`-0.003153 [-0.006492, +0.000129]`) vs `v3.0` `29/29` y pierde `+0.013040 [+0.007707, +0.017938]` frente al consenso `nflverse` (`"sin cierre sharp"`).
  - **Ola 4 — Consolidación Documental (`B10` `ad5b4af`, `O` cierre de estado):** actualización de `19_HOJA_DE_RUTA_MOTORES_Y_PICKS_V4.md`, `MODEL_CARD.md` (`v3.2.0`), reporte maestro `A29_v3_2_maestro.md` y cierre de `PROJECT_STATE.md`.
- **Siguiente:** aprovisionar credenciales oficiales (`THE_ODDS_API_KEY` / `BETFAIR_APP_KEY` en `web-scraping`; `API_FOOTBALL_KEY` / `FOOTBALL_DATA_API_KEY` para XI), operar captura continua multi-tick y reunir `>= 150` picks prospectivos reales (`CLV% > 0` con IC 95% bootstrap `mulberry32`) en fútbol y `>= 64` juegos NFL liquidados con cierre sharp real antes de activar cualquier segmento o candidato.

---

## Documentos y artefactos creados en `v3.1`

| Ruta | Ola / Owner | Estado y Rol |
|---|---|---|
| `services/ingest/odds_snapshots.py` · `src/domain/prediction/odds.ts` | Ola 1 (`A1`) | Normalización de cuotas pre-kickoff y resolución estricta de cierre sharp (`c96c7b3`) |
| `src/domain/prediction/{ledger,clv}.ts` · `services/models/clv_report.py` | Ola 1 (`A2`) | Ledger inmutable SHA-256 y bootstrap `CLV`/`ROI` determinista (`e41f463`) |
| `services/models/backtest.py` · `services/models/artifacts/baseline_v3_0_backtest.json` | Ola 1 (`A3`) | Arnés *walk-forward* anti-fuga, retraso `2 min` y línea base `v3.0` (`a852528`) |
| `src/domain/prediction/blend.ts` · `src/data/prediction/blend_weights_v3_1.json` | Ola 2 (`A4`) | Mezcla logit modelo-mercado y métodos de-vig por `liga × mercado` (`5b3df2c`) |
| `src/domain/prediction/picks.ts` · `src/data/prediction/pick_policy_v3_1.json` | Ola 2 (`A5`) | Motor de decisión `solido`/`valor`, Kelly ¼ con $\sigma_p$ y topes `2u/2u/3u/5u` (`ce348e0`) |
| `src/domain/prediction/markets_2way.ts` · `src/data/prediction/markets_2way_config.json` | Ola 3 (`A6`) | Derivación Dixon-Coles 2-vías y liquidación asiática de 5 estados; `0/92` activos (`732a403`) |
| `src/domain/prediction/gbm.ts` · `src/data/prediction/gbm_trees_v3_1.json` | Ola 3 (`A7`) | *Tree-walker* GBM en TS `< 0.065 ms`; `production_activated: false` (`6583954`, `dfbf2e4`) |
| `src/domain/prediction/stale_lines.ts` · `src/data/prediction/stale_lines_config.json` | Ola 3 (`A8`) | Detector de líneas rezagadas Doble Confirmación y cadencia matemática (`700dd24`) |
| `research/prediction-lab/reports/A28_verificacion_swarm.md` | Puertas 1–3 (`A9`) | Auditoría Red Team independiente de Olas 1, 2 y 3 (`622949c`, `c4439df`, `e0f7910`) |
| `services/models/evaluate_sealed_holdout_v3_1.py` · `services/models/test_sealed_holdout_v3_1.py` | Ola 4 (`A10`) | Evaluación única reproducible del holdout sellado (`"holdout consumido"`) y suite de integridad |
| `services/models/artifacts/sealed_holdout_v3_1_eval.json` · `holdout_trial_registry.jsonl` | Ola 4 (`A10`) | Artefacto completo de evaluación y registro consolidado (`29` corridas `v3.1` + `2` `walk_forward_dev` `v3.2`) |
| `src/data/prediction/production_segments_v3_1.json` | Ola 4 (`A10`) | Tabla auditable de producción (`0/60` segmentos habilitados con `disabled_reason` explícito) |
| `research/prediction-lab/reports/A28_picks_medibles_v3_1.md` | Ola 4 (`A10`) | Reporte maestro con trazabilidad por script/commit y tablas de los `60` segmentos |
| `docs/predicciones/19_HOJA_DE_RUTA_MOTORES_Y_PICKS_V4.md` | Ola 4 (`A10` / `B10`) | Hoja de ruta actualizada con resultados reales `v3.1` (`"holdout consumido"`) y `v3.2` |

---

## Documentos, artefactos y hashes SHA-256 verificados al cierre de `v3.2`

| Ruta | Ola / Owner | Estado y Rol | `SHA-256` |
|---|---|---|---|
| `src/data/prediction/production_segments_v3_1.json` | Congelado `v3.1` (`A10`) | Compuerta de segmentos (`0/60` en `production_enabled: true`) | `0bc03bbff96a5d82a1a7858e1e8623bf7bfdb250c546d2773a71d56ed9ada9bc` |
| `src/data/prediction/blend_weights_v3_1.json` | Congelado `v3.1` (`A4`) | Pesos logit y método de-vig por segmento | `b29d7a451f6011126997c122778b42ad3239c78337d17c5fa78d550f5c92739b` |
| `src/data/prediction/pick_policy_v3_1.json` | Congelado `v3.1` (`A5`) | Política interna `solido`/`valor`, Kelly ¼ y topes `2u/2u/3u/5u` | `2359c8f8822ea394a380202c04e0bcd010d1a3fae7c5c25b8c11ebe810bfb7d1` |
| `src/data/prediction/stale_lines_config.json` | Congelado `v3.1` (`A8`) | Cadencias óptimas multi-tick (`T-60m <= 3.69 min`) | `8bcb9c7be93270cde0cac2d58bc19f0381184dd2e769f358dd28334db2a05eac` |
| `src/domain/prediction/engine.ts` · `src/data/prediction/model_nfl.json` | Congelados `v3.0` | Motor TS puro intacto y pesos activos `NFL Minkowski v3.0` | `9270125c...53bc` / `e74ae241...9225` |
| `services/models/artifacts/sealed_holdout_v3_1_eval.json` | Congelado `v3.1` (`A10`) | Evaluación única `"holdout consumido"` (`0` re-lecturas en `v3.2`) | `5c9e550bfd7889e44f674c91cf64cea4c07b4281fc72231b8cadff850309f2dd` |
| `src/domain/prediction/{math,outlook}.ts` | Ola 1 `v3.2` (`B1`, `a33cdc4`) | Primitivas únicas y panorama multi-mercado `MatchOutlook` sin stake | *(código auditado en Puerta 1)* |
| `src/data/prediction/service_constants_v3_2.json` | Ola 1 `v3.2` (`B2`, `5f403ae`) | `13` bloques de constantes externalizadas de `service.ts` | `fcbc8e7dee3b302f57cb9b68f0c5403cc10cdfb308bc6aff9e71e30957fa15b7` |
| `scrapers/cadence_scheduler.py` · `docs/LEGAL_FUENTES_CUOTAS.md` | Ola 1 `v3.2` (`B3`, `4993a9b`) | Programador multi-tick legal y auditoría de `7` fuentes en `web-scraping` | *(worktree `web-scraping@4993a9b`)* |
| `src/data/prediction/outlook_calibration_v3_2.json` | Ola 1 `v3.2` (`B4`, `1e22b6a`) | Calibración causal `walk_forward_dev` (`98` segmentos, `10` bins; espejo idéntico en `services/models/artifacts/`) | `090cfaa23d35bdd569ea3a17d0084b6af7b2e99eeb8cdb00b15a8b588654194e` |
| `data/ledger/picks_v3_2_prospective.jsonl` | Ola 2 `v3.2` (`B5`, `adb0313`) | Ledger prospectivo real (`0` bytes, `0/150` picks reales) | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `data/ledger/fixtures/picks_v3_2_synthetic_fixture.jsonl` | Ola 2 `v3.2` (`B5`, `adb0313`) | Fixture funcional sintético aislado (`12` eslabones, `head_hash = eaea0bae...`) | `70b537b3b9beed80d7b6a18e689042271d496c6f15314def049a793a18aa5978` |
| `research/prediction-lab/data/processed/nfl_sharp_closing.parquet` | Ola 2 `v3.2` (`B6`, `70e08db`) | Corpus sharp NFL (`39` filas `pinnacle`, `13` juegos, `0 < 64` liquidados) | `178ad93241bd2bf004f77cf576a180afbb547ab65b4b28bbc63ad76f06680cae` |
| `src/data/prediction/live_matchday_v3_snapshot.json` | Ola 2 `v3.2` (`B8`, `96a8f4b`) | Snapshot vivo `3.2.0` (`130` `MatchOutlook` + `242` matchups, `0` apuestas) | `1dace760d68442e73c4b365f85cd16509093716b1bcac72aa1da67b61ec29699` |
| `research/prediction-lab/experiments/EXP_V32_xi/exp_v32_xi_results.json` | Ola 3 `v3.2` (`B7`, `53ff835`) | Evaluación causal XI confirmado (`production_activated: false`) | `c92d51eb5bae01b2e6e8032a521cd34dce87e2ed144145c93d0765a6d0b8a19b` |
| `src/data/prediction/model_nfl_v3_2_candidate.json` | Ola 3 `v3.2` (`B9`, `bbfdbc5`) | Candidato NFL EPA `41` features (`status: "candidate"`, `production_activated: false`) | `ebf6c3c3cfe417d57a685f0b574fed212da3f1e58da8568434f82197f5a46158` |
| `services/models/artifacts/holdout_trial_registry.jsonl` | Olas 1–3 (`B4`, `B9`) | `31` entradas (`1..29` intactas de `v3.1`; `#30` y `#31` en `walk_forward_dev`) | `058d5d0d9bcaeb97f0415f871b50a7a3279b34ad59dcdcaacf33ac4b4fe8923e` |
| `research/prediction-lab/reports/A29_verificacion_v3_2.md` · `A29_v3_2_maestro.md` | Puertas 1–3 (`V`, `14e3e1e`) · Ola 4 (`B10`, `ad5b4af`) | Auditoría Red Team (`50/50 PASS`) y reporte maestro consolidado de cierre | *(documentación maestra `v3.2`)* |

---

## Hallazgos cuantitativos que cambian supuestos

1. **El modelo pre-partido tabular pierde frente al cierre sin margen de Pinnacle tanto en `dev` (`+0.01457` nats) como en `holdout_sealed` (`+0.01287` nats, IC 95% `[+0.00910, +0.01667]`, `"holdout consumido"`):** ningún segmento guiado solo por modelo estático genera `+CLV` sostenible fuera de muestra (`a5_model_driven` obtuvo `CLV% = -3.37% [-5.39%, -1.43%]` en el `"holdout consumido"`).
2. **Más complejidad de árboles sobre las mismas features degrada el `CLV%` de apuestas (`A7`):** aunque `HistGradientBoosting` araña `-0.00076` nats en histórico largo, en `2024–2025` su mejora en `log-loss` no es significativa (`-0.00022 [-0.00103, +0.00053]`) y reduce `CLV%` en `-1.46 pp` en picks guiados por modelo.
3. **El único alfa positivo medido (`a5_sharp_arb` `+16.25%` y `A8` Doble Confirmación `+10.93%` en `dev`) depende de capturar líneas recreativas rezagadas en tiempo real:** en `scraped_ws`, la brecha actual de `78.78 min` en Pinnacle y la captura única en Caliente/skins US impidieron llenar un solo pick vivo (`0 / 50` picks `scraped_ws` en el `"holdout consumido"`). Pasar a `<= 3.69 min` en `T-60m` sube la supervivencia esperada del edge de `38.06%` a `89.81%`.
4. **El `holdout_sealed` de `2025-02-02` a `2026-11-08` ya fue abierto una vez y queda consumido como conjunto de prueba virgen (`"holdout consumido"`):** cualquier iteración futura (`v3.2+` / `v4.0`) debe validarse sobre datos prospectivos posteriores al `2026-11-08T20:30:00Z` registrados en `PickLedger`.
5. **En Hándicap Asiático con ponderación exacta de cuartos de línea (`active_w = 0.5` en `.25`/`.75`, `B4` `1e22b6a`), ningún segmento de fútbol retiene ventaja causal de mezcla sobre la apertura sharp de Pinnacle:** en los `93` segmentos `liga × mercado` evaluados en `walk_forward_dev`, solo `3` (`D2::1x2`, `G1::1x2`, `G1::totals`) seleccionan `blend_v3_1` y en los tres el IC 95% bootstrap de `ΔLL` cruza `0` (`"no significativa"`).
6. **La inferencia viva de `v3.0` sufría un apagón silencioso de cobertura (`B2` `5f403ae`), corregible con agregados PBP causales pero no equivalente a los `-0.008..-0.012` nats hipotéticos (`B9` `bbfdbc5`):** en NFL vivo, `model_nfl.json` operaba con `4/29` features (`13.79%`, `LL = 0.6879`). El candidato causal `model_nfl_v3_2_candidate.json` (`41` features) sube la cobertura viva a `34.37/41` (`83.83%`, `ΔLL = -0.065911 [-0.075109, -0.056734]` vs `v3.0` vivo), pero frente a `v3.0` histórico completo (`29/29`) gana solo `-0.002516 [-0.004585, -0.000523]` en `dev` agregado, es `"no significativa"` en `DEV_OOS 2020..2024` (`-0.003153 [-0.006492, +0.000129]`), y pierde `+0.013040 [+0.007707, +0.017938]` frente al consenso `nflverse` (`"sin cierre sharp"`).
7. **No existen timestamps históricos reales de publicación de XI (`0 / 52,746` en `walk_forward_dev`, `B7` `53ff835`):** activar ajustes de disponibilidad con proxies ruidosos degrada la calibración (`ΔLL = +0.001100 [+0.000705, +0.001494]` con `σ_δ = 0.12`, `INFERIDO`), por lo que el ajuste de XI solo puede evaluarse prospectivamente con timestamps auditables pre-decisión.

---

## Decisiones tomadas

- **`0 / 60` segmentos habilitados en `production_segments_v3_1.json`:** se respeta sin excepciones la puerta `CLV% > 0` con IC 95% bootstrap que no cruce `0`. No se reajustan pesos, umbrales EV ni márgenes tras observar el `"holdout consumido"`.
- **`src/domain/prediction/engine.ts`, `packages/ui`, `packages/spacetime` y `apps/web` permanecen intactos:** la capa cuantitativa vive desacoplada y tipada en `src/domain/prediction/{math,outlook,odds,ledger,clv,blend,picks,markets_2way,gbm,stale_lines}.ts` y `src/data/prediction/*_v3_{1,2}.json`.
- **Niveles únicos `solido` y `valor`:** eliminados definitivamente `"Pick Ancla >= 54%"` y `"Tiro de Cuota Alta"` en `ledger.ts` y `clv_report.py`.
- **Separación estricta entre pronóstico público (`MatchOutlook`) y apuesta (`v3.2`):** la salida pública expone solo probabilidades calibradas y `fairOdds = 1/p`, sin `stake`, `kelly`, `ev`, `tier` ni cuotas sintéticas (`market: null` sin cuota real fresca `< 72 h`).
- **Candidatos de Ola 3 mantenidos explícitamente apagados (`production_activated: false`):** ni `EXP_V32_xi` (`B7`) ni `model_nfl_v3_2_candidate.json` (`B9`, `status: "candidate"`) reemplazan motores activos hasta superar las compuertas prospectivas con datos reales.
- **Cumplimiento legal estricto sin evasión anti-bot (`B3` y `B7`):** `4` adaptadores oficiales listos en modo `api_only` (`the_odds_api`, `betfair_exchange`, `api_football`, `football_data_org`) y `10` fuentes web bloqueadas por código (`blocked_pending_owner_decision`) hasta decisión comercial/legal expresa del propietario.

---

## Pendiente (en orden)

1. **Aprovisionar credenciales oficiales para desbloquear captura prospectiva legal (`B3` / `B7`):** configurar `THE_ODDS_API_KEY` y/o `BETFAIR_APP_KEY` + `BETFAIR_SESSION_TOKEN` en `.worktrees/web-scraping` para activar `cadence_scheduler.py`, y `API_FOOTBALL_KEY` / `FOOTBALL_DATA_API_KEY` para activar `xi_collector.py` (o emitir decisión formal del propietario sobre las fuentes `blocked_pending_owner_decision`).
2. **Acumular cartera prospectiva real en `PickLedger` (`B5`, meta `>= 150` picks):** ejecutar periódicamente `paper_trading.py --provenance real` (`execution_delay >= 2.0 min`, `ts_pick > 2026-11-08T20:30:00Z`) y evaluar apertura por segmento solo cuando existan `>= 150` picks totales, `n_clv >= 15` en el segmento e IC 95% bootstrap (`mulberry32`) de `CLV% > 0`.
3. **Acumular cierres sharp liquidados en NFL (`B6` / `B9`, meta `>= 64` juegos):** liquidar los `13` juegos ya capturados y continuar recolectando cierres `pinnacle`/`smarkets` hasta `>= 64` juegos NFL liquidados para evaluar `model_nfl_v3_2_candidate.json` contra un benchmark sharp real.
4. **Sincronizar UI web cuando producto lo priorice (`B8`):** conectar `apps/web`, `packages/spacetime` y `packages/ui` al arreglo `outlooks` de `src/data/prediction/live_matchday_v3_snapshot.json` siguiendo `research/prediction-lab/coordination/v3_2/SYNC_NOTES.md`.

---

## Bloqueos

- **Credenciales API ausentes en entorno (`prospective_capture_pending`):** `0` fuentes activas en `web-scraping` (`B3`) y `EXP_V32_xi` (`B7`) mientras no se inyecten `THE_ODDS_API_KEY` / `BETFAIR_APP_KEY` / `API_FOOTBALL_KEY` / `FOOTBALL_DATA_API_KEY` ni exista convenio escrito para las `10` fuentes `blocked_pending_owner_decision`.
- **Compuertas de tamaño muestral prospectivo en cero:** `0 / 150` picks reales en `picks_v3_2_prospective.jsonl` (`0/60` segmentos activos) y `0 / 64` juegos NFL liquidados con cierre sharp en `nfl_sharp_closing.parquet`.
- **Ausencia de cuotas sharp históricas en `btts` y por jugador:** impide evaluar valor histórico contra casa sharp en `btts` y bloquea cualquier motor de *player props* (`19_HOJA_DE_RUTA_MOTORES_Y_PICKS_V4.md` §4.4).

---

## Handoffs

### PREDLAB-V3.2 · Motor público `MatchOutlook` sin stake, compuerta anti-sintéticos, captura legal multi-tick, ledger prospectivo y candidatos causales XI / NFL EPA — 2026-11-12 — Ramas `prediction-lab` y `web-scraping`
- **Hecho:**
  - **Ola 0 (`b04e342`):** contratos maestros (`MASTER.md`, `CONTRACT_OUTLOOK.md`, `CONTRACT_ODDS_TIMESERIES.md`, `20_SWARM_V3_2_GEMINI.md`) y congelamiento `SHA-256` de `v3.1`.
  - **Ola 1 (`4993a9b` en `web-scraping`; `48854e8`, `5f403ae`, `a33cdc4`, `1e22b6a` y Puerta 1 `e20e823` en `prediction-lab`):** `math.ts` + `outlook.ts` (`11` mercados fútbol + `topScorelines[3]`, `3` NFL, `0` stakes), eliminación de cuotas sintéticas y `featureCoverage` en `service.ts` (`0/60` activos), programador legal `cadence_scheduler.py` (`7` fuentes auditadas, `0` anti-bot) y `outlook_calibration_v3_2.json` (`98` segmentos en `walk_forward_dev`, `trial_seq = 30`).
  - **Ola 2 (`70e08db`, `96a8f4b`, `adb0313` y Puerta 2 `19453fb`):** corpus `nfl_sharp_closing.parquet` (`39` filas `pinnacle`, compuerta `0 < 64`), regeneración de `live_matchday_v3_snapshot.json` (`130` `MatchOutlook`, `market: null`, `0` apuestas) + `SYNC_NOTES.md`, y runner idempotente `paper_trading.py` (`delay >= 2.0 min`, `0/150` reales + fixture sintético con paridad `0` bits TS↔Py).
  - **Ola 3 (`53ff835`, `bbfdbc5` y Puerta 3 `14e3e1e`):** contrato y experimento `EXP_V32_xi` (`0/52,746` XI históricos reales, `production_activated: false`) y candidato separado `model_nfl_v3_2_candidate.json` (`41` features EPA causales `w' < w`, cobertura viva NFL `13.79% -> 83.83%`, `trial_seq = 31`, `production_activated: false`).
  - **Ola 4 (`ad5b4af` + cierre `O`):** consolidación en `19_HOJA_DE_RUTA_MOTORES_Y_PICKS_V4.md`, `MODEL_CARD.md` (`v3.2.0`), reporte maestro `A29_v3_2_maestro.md` y actualización de `PROJECT_STATE.md`.
- **Cómo probarlo:**
  - Verificar snapshot en vivo (`130` `MatchOutlook`, `< 72 h`, `0` stakes): `.\research\prediction-lab\.venv\Scripts\python.exe services/models/regenerate_live_snapshot.py --timeseries-dir ..\web-scraping\data\odds_timeseries --max-quote-age-hours 72 --out src/data/prediction/live_matchday_v3_snapshot.json --check`
  - Suite Python completa `prediction-lab` (`120` tests en verde): `$env:PYTHONDONTWRITEBYTECODE='1'; .\research\prediction-lab\.venv\Scripts\python.exe -B -m pytest services/models research/prediction-lab/experiments/EXP_V32_xi research/prediction-lab/experiments/EXP_V32_nfl_epa -v`
  - Suite TypeScript completa `prediction-lab` (`61` archivos / `1,153` tests activos en verde): `npx.cmd vitest run; git checkout -- evidence/statistical-tests/aztecavet-experiments.json`
  - Suite Python `web-scraping` (`7` tests en verde): `Set-Location ..\web-scraping; .\.venv\Scripts\python.exe -m pytest tests -v`

### PREDLAB-V3.1 · Infraestructura CLV, política EV/Kelly, mercados 2-vías, GBM TS, líneas rezagadas y evaluación única del Holdout Sellado — 2026-11-11 — Rama `prediction-lab`
- **Hecho:**
  - **Ola 1 (`c96c7b3`, `e41f463`, `a852528`, Puerta 1 `622949c`):** construcción de `odds_snapshots.parquet` (`5.44M` filas), `PickLedger` inmutable SHA-256 + `clv.ts`/`clv_report.py` y `backtest.py` anti-fuga con `holdout_sealed` del `20%` (`14,163` eventos).
  - **Ola 2 (`5b3df2c`, `ce348e0`, Puerta 2 `c4439df`):** calibración `blend.ts` (`12/60` segmentos activos en `dev`, `48/60` apagados) y motor `picks.ts`/`picks_engine.py` (`solido`/`valor`, Kelly ¼ con $\sigma_p$, topes `2u/2u/3u/5u`).
  - **Ola 3 (`732a403`, `6583954`, `dfbf2e4`, `700dd24`, Puerta 3 `e0f7910`):** liquidación asiática de 5 estados (`markets_2way.ts`, `0/92` activos con DC puro), exportación `gbm.ts` (`< 0.065 ms`, `production_activated: false`) y detector `stale_lines.ts` con Doble Confirmación y cadencia óptima `3.69 min` en `T-60m`.
  - **Ola 4 (`a10-holdout`, `f3564a4`):** consolidación de las `24` corridas `run_backtest` de Olas 1–3 + `1` integrada `dev` + `4` corridas únicas sobre `holdout_sealed` (`29` entradas en `holdout_trial_registry.jsonl`, `"holdout consumido"`), materialización de `sealed_holdout_v3_1_eval.json` y `production_segments_v3_1.json` (`0/60` segmentos activos), reporte maestro `A28_picks_medibles_v3_1.md` y reescritura íntegra de `docs/predicciones/19_HOJA_DE_RUTA_MOTORES_Y_PICKS_V4.md`.
- **Cómo probarlo:**
  - Reproducir evaluación del holdout sellado (`"holdout consumido"`): `.\research\prediction-lab\.venv\Scripts\python.exe services/models/evaluate_sealed_holdout_v3_1.py`
  - Suite Python completa (`85` tests base en verde): `.\research\prediction-lab\.venv\Scripts\python.exe -m pytest services/models -v`
  - Suite TypeScript completa (`57` archivos / `1,126` tests base en verde): `npx vitest run`
