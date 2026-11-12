# Model Card — Arquitectura Pública y Motores de Pronóstico PitchLab (`v3.2.0`)

**Versión:** `3.2.0` · **Fecha:** `2026-11-12` · **Rama:** `prediction-lab` · **Auditoría Red Team:** [`research/prediction-lab/reports/A29_verificacion_v3_2.md`](../../research/prediction-lab/reports/A29_verificacion_v3_2.md) (`Puertas 1–3 PASS`, `50/50` controles) · **Reporte maestro:** [`research/prediction-lab/reports/A29_v3_2_maestro.md`](../../research/prediction-lab/reports/A29_v3_2_maestro.md).

---

## 1. Inventario de Artefactos y Hashes `SHA-256` (`OBSERVADO`)

### 1.1 Artefactos Activos en Inferencia Pública (`MatchOutlook` + Compuerta `v3.1`)

| Artefacto | Rol en `v3.2` | `SHA-256` verificado | Estado |
|---|---|---|---|
| [`src/data/prediction/model_motor_a.json`](../../src/data/prediction/model_motor_a.json) | Motor deportivo fútbol (`PitchLab Tachyon v3.0`, logit multinomial `C=0.02`, `113` features deportivas + `23` one-hots de división = `136`, semilla `20261109`) | `3c72967eddc79bb71ca7fcae40bf21aae760269dc62b43cf2b2db7eeacfceec9` | **Activo** (congelado) |
| [`src/data/prediction/model_nfl.json`](../../src/data/prediction/model_nfl.json) | Motor deportivo NFL (`PitchLab Minkowski v3.0`, logit multinomial `29` features, semilla `20261109`) | `e74ae241875739d2dc18564f85133d4e20c1d0cef41d64b6f705852601597225` | **Activo** (congelado) |
| [`src/data/prediction/features_snapshot.json`](../../src/data/prediction/features_snapshot.json) | Snapshot precalculado de features deportivas por equipo | `8849cf1b49f68c5cb0fc2cb8e54b5164aaaf6a6a3db48a8a519405dd95ff6f2c` | **Activo** (congelado) |
| [`src/data/prediction/outlook_calibration_v3_2.json`](../../src/data/prediction/outlook_calibration_v3_2.json) | Selección causal de fuente (`pSource`) y curvas de confiabilidad de `10` bins en `98` segmentos (`B4`, commit `1e22b6a`; espejo exacto de `services/models/artifacts/outlook_calibration_v3_2.json`) | `090cfaa23d35bdd569ea3a17d0084b6af7b2e99eeb8cdb00b15a8b588654194e` | **Activo (`v3.2`)** |
| [`src/data/prediction/production_segments_v3_1.json`](../../src/data/prediction/production_segments_v3_1.json) | Compuerta dura de recomendaciones de valor (`0 / 60` segmentos en `production_enabled: true`) | `0bc03bbff96a5d82a1a7858e1e8623bf7bfdb250c546d2773a71d56ed9ada9bc` | **Activo (`0/60` encendidos)** |
| [`src/data/prediction/blend_weights_v3_1.json`](../../src/data/prediction/blend_weights_v3_1.json) | Pesos logit y método de-vig por `liga × mercado` (`A4`, congelado sin re-tuning) | `b29d7a451f6011126997c122778b42ad3239c78337d17c5fa78d550f5c92739b` | **Congelado (`v3.1`)** |
| [`src/data/prediction/pick_policy_v3_1.json`](../../src/data/prediction/pick_policy_v3_1.json) | Política interna de investigación (`solido`/`valor`, Kelly ¼ con $\sigma_p$, topes `2u/2u/3u/5u`) | `2359c8f8822ea394a380202c04e0bcd010d1a3fae7c5c25b8c11ebe810bfb7d1` | **Congelado (solo ledger interno)** |
| [`src/data/prediction/stale_lines_config.json`](../../src/data/prediction/stale_lines_config.json) | Cadencias óptimas de captura multi-tick (`T-60m <= 3.69 min`) y doble confirmación | `8bcb9c7be93270cde0cac2d58bc19f0381184dd2e769f358dd28334db2a05eac` | **Congelado (`v3.1`)** |
| [`src/data/prediction/service_constants_v3_2.json`](../../src/data/prediction/service_constants_v3_2.json) | `13` bloques de constantes externalizadas de `service.ts` con `origin` y `validation_status` (`B2`, commit `5f403ae`) | `fcbc8e7dee3b302f57cb9b68f0c5403cc10cdfb308bc6aff9e71e30957fa15b7` | **Activo (`v3.2`)** |
| [`src/data/prediction/live_matchday_v3_snapshot.json`](../../src/data/prediction/live_matchday_v3_snapshot.json) | Snapshot en vivo `schema_version = "3.2.0"` con `130` `MatchOutlook` + `242` matchups heredados (`B8`, commit `96a8f4b`) | `1dace760d68442e73c4b365f85cd16509093716b1bcac72aa1da67b61ec29699` | **Activo (`v3.2`)** |

### 1.2 Candidatos Científicos Explícitamente Inactivos (`production_activated: false`)

| Candidato Inactivo | Commit / Agente | `SHA-256` verificado | Estatus y Bloqueante de Activación |
|---|---|---|---|
| [`src/data/prediction/gbm_trees_v3_1.json`](../../src/data/prediction/gbm_trees_v3_1.json) | `6583954`, `dfbf2e4` (`A7`) | `acf98f07585116f7f26912f943d83c6190e7e6d9e520c6e8733c3eb9bd9bed4c` | **`production_activated: false`** — En OOS `2024–25`, `ΔLL = -0.000221 [-0.001031, +0.000527]` (**`"no significativa"`**) y degrada `CLV%` en `-1.46 pp [-2.70%, -0.29%]`. |
| [`research/prediction-lab/experiments/EXP_V32_xi/exp_v32_xi_results.json`](../../research/prediction-lab/experiments/EXP_V32_xi/exp_v32_xi_results.json) | `53ff835` (`B7`) | `c92d51eb5bae01b2e6e8032a521cd34dce87e2ed144145c93d0765a6d0b8a19b` | **`production_activated: false`** — `0 / 52,746` partidos en `walk_forward_dev` tienen `ts_xi_published` real (`OBSERVADO`); efecto real en `T-60m` **`DESCONOCIDO`**. Requiere captura prospectiva legal (`API_FOOTBALL_KEY` / `FOOTBALL_DATA_API_KEY`) + cuotas `<= 3.69 min`. |
| [`src/data/prediction/model_nfl_v3_2_candidate.json`](../../src/data/prediction/model_nfl_v3_2_candidate.json) | `bbfdbc5` (`B9`) | `ebf6c3c3cfe417d57a685f0b574fed212da3f1e58da8568434f82197f5a46158` | **`status: "candidate"`, `production_activated: false`, `production_enabled: false`** — `41` features (`29` base + `12` PBP `nflverse` causales `w' < w`). Corrige cobertura viva (`4/29` $\to$ `34.37/41`), pero en `DEV_OOS 2020..2024` es **`"no significativa"`** vs `v3.0` (`29/29`) y bloqueado hasta reunir `>= 64` juegos NFL liquidados con cierre sharp real (`B6`: `0/64` hoy). |

---

## 2. Qué Hace la Arquitectura `v3.2` (`MatchOutlook` vs Compuerta Interna)

### 2.1 Salida Pública: Panorama Probabilístico Completo sin Stake (`MatchOutlook`)
Implementada en [`src/domain/prediction/outlook.ts`](../../src/domain/prediction/outlook.ts) (`B1`, commit `a33cdc4`), la interfaz pública responde únicamente a **"qué es lo más probable y cuál sería su cuota justa sin margen (`fairOdds = 1 / p`)"**:
- **Fútbol (`11` mercados + `topScorelines[3]`):** `1x2`, `double_chance`, `totals_1_5`, `totals_2_5`, `totals_3_5`, `btts`, `dnb`, `ah_-1_0`, `ah_-0_5`, `ah_0_5`, `ah_1_0` y los `3` marcadores exactos más probables, derivados de **una única matriz bivariante Dixon-Coles** (`src/domain/prediction/markets_2way.ts::buildDixonColesScoreMatrix`, `|∑p - 1| < 10^{-15}`, `|∑p_{\text{DC}} - 2| < 10^{-15}`).
- **NFL (`3` mercados):** `moneyline`, `spread` y `totals`.
- **Cero recomendaciones de apuesta en salida pública (`§0 Regla #5`):** `MatchOutlook` no contiene ni puede contener `stake`, `kelly`, `ev`, `expectedEdge`, `valueStatus`, `tier` ni etiquetas de `"pick seguro"`.
- **Cero cuotas sintéticas (`§0 Regla #4`):** Se eliminó `reconstructExecutionOdds` en [`src/domain/prediction/service.ts`](../../src/domain/prediction/service.ts) (`B2`, commit `5f403ae`). Sin cuota real con `book` verificable y `ts_captured` ISO-8601 fresco (`0 <= age < 72 h` en snapshot vivo; `<= 180 min` para mezcla sharp pre-decisión) y anterior al kickoff, la salida fija `market: null` y `valueStatus: "no_market"` (`0` edges, `0` Kelly, `0` stakes).

### 2.2 Compuerta de Valor y Uso Previsto (`0 / 60` Segmentos Habilitados)
- **Uso previsto:** análisis probabilístico informativo, consulta de cuotas justas teóricas (`fairOdds`), auditoría de curvas de calibración por cubeta y experimentación prospectiva interna en *paper-trading*.
- **Uso NO autorizado:** tomar decisiones con dinero real, inferir ventaja contra casas de apuestas cuando `production_enabled == false`, o interpretar `fairOdds` como señal de apuesta.
- **Estado de la compuerta (`production_segments_v3_1.json`):** **`0 / 60` segmentos habilitados (`executableBetsCount = 0` en los `242` partidos del snapshot vivo)**. Incluso inyectando cuotas reales frescas, `service.ts` devuelve `valueStatus = "disabled_segment"` hasta que la cartera prospectiva (`data/ledger/picks_v3_2_prospective.jsonl`, corte `> 2026-11-08T20:30:00Z`) acumule `>= 150` picks reales totales, `n_clv >= 15` en el segmento e IC 95% bootstrap (`>= 1,000` réplicas `mulberry32`) estrictamente `> 0`.

---

## 3. Jerarquía Causal de Probabilidad Publicada (`B4`) y Calibración Empírica

### 3.1 Prelación de Fuentes (`PublishedProbSource`)
Evaluada estrictamente en `walk_forward_dev` (`ts_event_start < 2025-02-02T17:30:00Z`, `56,649` eventos: `52,746` fútbol + `3,903` NFL; `trial_seq = 30`, `unlock_holdout = false`) mediante:
```powershell
Set-Location "C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\prediction-lab"
.\research\prediction-lab\.venv\Scripts\python.exe services/models/outlook_calibration.py --record-trial
```
La probabilidad publicada sigue el orden causal **`market_sharp_novig` / `blend_v3_1` > `model` > `base_rate`**:
1. **Con cuota sharp real fresca (`pinnacle` o `smarkets`, `ts_captured <= ts_decision` y `age <= 180 min`):**
   - **`market_sharp_novig` en `90 / 93` segmentos `liga × mercado`** (`OBSERVADO`).
   - **`blend_v3_1` en `3 / 93` segmentos (`D2::1x2`, `G1::1x2`, `G1::totals`)**, únicos donde `w_effective > 0.05` (congelado de `blend_weights_v3_1.json`) mejora o empata a la apertura sharp tanto en peso congelado como pliegue a pliegue causal; aun así, el IC 95% pareado de `ΔLL` cruza `0` en los tres (`D2::1x2`: `-0.001610 [-0.003713, +0.000486]`; `G1::1x2`: `-0.000654 [-0.001862, +0.000588]`; `G1::totals`: `-0.000133 [-0.000830, +0.000514]`, todos etiquetados **`"no significativa"`**, `OBSERVADO`).
2. **Sin cuota sharp fresca en ventana (estado actual del snapshot vivo `130/130` partidos):** cae a **`model`** (`PitchLab Tachyon v3.0` + matriz única Dixon-Coles en fútbol; `PitchLab Minkowski v3.0` en NFL).
3. **Sin variables mínimas del modelo:** cae a **`base_rate`** histórico causal por liga/deporte.

### 3.2 Métricas Globales de Calibración en `walk_forward_dev` (`1e22b6a`, IC 95% Bootstrap `mulberry32`, `1,000` Réplicas, Semilla `20261111`, `OBSERVADO`)

| Segmento Global | Escalón | `n` | `Log-Loss` `[IC 95%]` | `Brier` `[IC 95%]` | `RPS` `[IC 95%]` | `ECE` `[IC 95%]` | `ΔLL vs Benchmark` `[IC 95%]` | Significancia / Nota |
|---|---|---:|---|---|---|---|---|---|
| `GLOBAL::football::1x2` | `market_sharp_novig` | `37,490` | `0.9929` `[0.9882, 0.9978]` | `0.5928` `[0.5896, 0.5962]` | `0.2007` `[0.1993, 0.2020]` | `0.0025` `[0.0017, 0.0056]` | `+0.0000` `[+0.0000, +0.0000]` | **`"no significativa"`** (apertura sharp Pinnacle) |
| `GLOBAL::football::1x2` | `model` (`Tachyon v3.0`) | `52,746` | `1.0109` `[1.0073, 1.0145]` | `0.6052` `[0.6027, 0.6077]` | `0.2062` `[0.2052, 0.2072]` | `0.0062` `[0.0039, 0.0088]` | `-0.0639` `[-0.0666, -0.0611]` | `significativa` (vs `base_rate`; pierde vs cierre Pinnacle `0.9968`) |
| `GLOBAL::football::totals` (`2.5`) | `market_sharp_novig` | `31,845` | `0.6737` `[0.6718, 0.6757]` | `0.4809` `[0.4790, 0.4829]` | `0.2405` `[0.2395, 0.2414]` | `0.0033` `[0.0012, 0.0089]` | `+0.0000` `[+0.0000, +0.0000]` | **`"no significativa"`** |
| `GLOBAL::football::totals` (`2.5`) | `model` (DC único) | `52,746` | `0.6811` `[0.6793, 0.6830]` | `0.4879` `[0.4863, 0.4897]` | `0.2440` `[0.2431, 0.2449]` | `0.0175` `[0.0140, 0.0219]` | `-0.0063` `[-0.0080, -0.0047]` | `significativa` (vs `base_rate`) |
| `GLOBAL::football::btts` | `model` (cuota sharp `DESCONOCIDO`) | `52,746` | `0.6891` `[0.6879, 0.6904]` | `0.4959` `[0.4947, 0.4972]` | `0.2480` `[0.2474, 0.2486]` | `0.0223` `[0.0180, 0.0266]` | `-0.0016` `[-0.0028, -0.0004]` | `significativa` (vs `base_rate`; `0` cuotas BTTS históricas) |
| `GLOBAL::football::ah` | `market_sharp_novig` (`active_w=0.5` en `.25/.75`) | `29,658` | `0.6916` `[0.6910, 0.6922]` | `0.4985` `[0.4979, 0.4991]` | `0.2492` `[0.2489, 0.2495]` | `0.0020` `[0.0001, 0.0080]` | `+0.0000` `[+0.0000, +0.0000]` | **`"no significativa"`** |
| `NFL::moneyline` | Consenso `nflverse` (**`"sin cierre sharp"`**) | `3,890` | `0.6091` `[0.5975, 0.6209]` | `0.4216` `[0.4115, 0.4324]` | `0.2108` `[0.2057, 0.2162]` | `0.0094` `[0.0060, 0.0265]` | `+0.0000` `[+0.0000, +0.0000]` | **`"no significativa"`** (**`"sin cierre sharp"`**) |
| `NFL::moneyline` | `model` (`Minkowski v3.0`) | `3,890` | `0.6244` `[0.6141, 0.6346]` | `0.4353` `[0.4262, 0.4448]` | `0.2176` `[0.2131, 0.2224]` | `0.0167` `[0.0084, 0.0327]` | `+0.0153` `[+0.0098, +0.0210]` | `significativa` a favor del consenso (**`"sin cierre sharp"`**; `-0.0629` vs `base_rate`) |

### 3.3 Referencia Descriptiva del `"holdout consumido"` (`v3.1`, Commit `f3564a4`, Jamás Reutilizado para Selección)
En la pasada única sobre `holdout_sealed` (`14,163` eventos `>= 2025-02-02T17:30:00Z`, comando `.\research\prediction-lab\.venv\Scripts\python.exe services/models/evaluate_sealed_holdout_v3_1.py`), el modelo base `v3.0` perdió frente al cierre de Pinnacle por `ΔLL = +0.01287 [+0.00910, +0.01667]` (`"holdout consumido"`, `OBSERVADO`), y el sistema integrado `v3.1` (`A4+A5+A8`) registró `50` picks (`39` con cierre Pinnacle) con **`CLV% = -2.27% [-5.80%, +0.68%]` (`"no significativa"`, `"holdout consumido"`)** y **`ROI% = -4.23% [-32.85%, +24.27%]` (`"no significativa"`, `"holdout consumido"`)**.

---

## 4. Cobertura de Variables en Vivo (`featureCoverage` y `dataQualityFlag`)

A partir de `B2` (commit `5f403ae`), `service.ts` expone en cada predicción `featureCoverage: { present, total, ratio }` y activa `dataQualityFlag = "low_coverage"` siempre que `ratio < 0.50` (`npx vitest run tests/prediction/service_gate.test.ts`, `OBSERVADO`):

| Deporte / Artefacto | Variables No Imputadas en Snapshot Vivo | Ratio | `dataQualityFlag` | Causa Técnica Documentada |
|---|---:|---:|---|---|
| **Fútbol (`model_motor_a.json` activo)** | `38 / 113` | `33.63%` | `"low_coverage"` | `features_snapshot.json` persiste rodantes de goles/Elo por equipo, pero carece en vivo de variables pre-partido de cuotas/tiros/córners que sí existían en CSV históricos de `football-data.co.uk`. |
| **NFL (`model_nfl.json` `v3.0` activo)** | `4 / 29` | `13.79%` | `"low_coverage"` | En el snapshot vivo solo están poblados `elo_pre` y diferenciales agregados básicos; las restantes `25` variables estacionales/contextuales se imputan a media de entrenamiento (`z = 0`). |
| **NFL (`model_nfl_v3_2_candidate.json` inactivo, `B9`)** | `34.37 / 41` (mín. `34/41`) | `83.83%` | `"ok"` (`0/46` en `"low_coverage"`) | Incorpora priors causales `w' < w` de equipo y QB titular desde `nflverse` PBP (`100.0%` al incluir calendario semanal y titular confirmado; permanece en `production_activated: false`). |

---

## 5. Detalle de Candidatos Inactivos de Ola 3 (`B7` y `B9`)

1. **`EXP_V32_xi` — Ajuste por XI Titular Confirmado en `T-60m` (`B7`, commit `53ff835`, `production_activated: false`):**
   - Comando: `.\research\prediction-lab\.venv\Scripts\python.exe research/prediction-lab/experiments/EXP_V32_xi/run_exp_v32_xi.py`
   - En `walk_forward_dev` (`52,746` partidos fútbol `< 2025-02-02T17:30:00Z`), **`0 / 52,746` partidos cuentan con timestamp real auditable `ts_xi_published`** (`OBSERVADO`). Con `delta = 0.0` honesto (`n = 52,659` con cierre Pinnacle), `ΔLL(xi - base) = 0.000000 [0.000000, 0.000000]` (**`"no significativa"`**) y `ΔLL(xi - Pinnacle_close) = +0.015208 [+0.013595, +0.016700]` (`significativa` a favor de Pinnacle). El impacto causal real en `[T-60m, T-0]` es **`DESCONOCIDO`**.
   - En pruebas paramétricas aisladas (`provenance = "synthetic_sensitivity"`, `INFERIDO`), añadir ruido estático (`σ_δ = 0.12`) degrada `ΔLL = +0.001100 [+0.000705, +0.001494]`, confirmando que activar el ajuste sin timestamps oficiales reales perjudicaría la calibración.
2. **`model_nfl_v3_2_candidate.json` — `NFL Minkowski` con Agregados EPA Causales (`B9`, commit `bbfdbc5`, `production_activated: false`):**
   - Comando: `.\research\prediction-lab\.venv\Scripts\python.exe research/prediction-lab/experiments/EXP_V32_nfl_epa/run_experiment.py --record-trial`
   - Evaluado en `walk_forward_dev` (`n = 3,891` sin empates, `trial_seq = 31`, `unlock_holdout = false`, `OBSERVADO`): `LL = 0.622020 [0.611977, 0.632434]`, `Brier = 0.433247 [0.424305, 0.442387]`, `ECE = 0.010454 [0.005729, 0.028311]`.
   - Supera de forma contundente a la inferencia viva actual `v3.0` (`4/29` features): `ΔLL = -0.065911 [-0.075109, -0.056734]` (`significativa`), y mejora ligeramente a `v3.0` con `29/29` features históricas en `dev` completo (`ΔLL = -0.002516 [-0.004585, -0.000523]`, `significativa`), pero en la ventana reciente `DEV_OOS 2020..2024` (`n = 1,339`) la diferencia `ΔLL = -0.003153 [-0.006492, +0.000129]` es **`"no significativa"`**, y pierde frente al consenso `nflverse` (**`"sin cierre sharp"`**, `n = 3,890`) por `ΔLL = +0.013040 [+0.007707, +0.017938]`. No se promueve a `model_nfl.json` hasta acumular `>= 64` juegos NFL liquidados con cierre sharp real en `nfl_sharp_closing.parquet` (`B6`: `0 < 64` hoy).

---

## 6. Gobernanza del Holdout Sellado y Limitaciones Conocidas

1. **Blindaje de `holdout_sealed` (`§0 Regla #2`):** `services/models/artifacts/holdout_trial_registry.jsonl` (`SHA-256 = 058d5d0d...`, `31` entradas) preserva intactas byte a byte las entradas `1..29` de `v3.1`; las únicas adiciones de `v3.2` (`#30` `B4` y `#31` `B9`) corrieron con `eval_split = "walk_forward_dev"` y `unlock_holdout = false`, respaldadas por guardias en código (`HoldoutSealedError` y `assert_no_holdout_events`). El corte `2025-02-02T17:30:00Z`–`2026-11-08` es **`"holdout consumido"`**; toda prueba futura ocurre sobre eventos prospectivos `> 2026-11-08T20:30:00Z`.
2. **El mercado sharp supera a los modelos deportivos puros:** tanto en fútbol (`0.9968` vs `1.0109` en `1x2` `dev`) como en NFL (`0.6091` consenso `"sin cierre sharp"` vs `0.6244` `v3.0` / `0.6220` candidato `v3.2`), razón por la cual cuando haya cuota sharp fresca `MatchOutlook` prioriza `market_sharp_novig` / `blend_v3_1` y mantiene `0/60` segmentos de apuesta apagados.
3. **Captura en vivo pendiente de credenciales (`prospective_capture_pending`):** sin `THE_ODDS_API_KEY` / `BETFAIR_APP_KEY` en `web-scraping` (`B3`), los `130` partidos de `live_matchday_v3_snapshot.json` operan hoy en escalón `pSource = "model"` con `market: null`.
4. **Cobertura histórica nula de cuotas sharp en `btts` y en NFL:** `odds_snapshots.parquet` tiene `0` cuotas históricas de `btts` en fútbol (benchmark sharp `DESCONOCIDO`, calibrado contra `base_rate` causal) y `0` cierres sharp liquidados en NFL (`0 < 64` en `B6`, `DESCONOCIDO`).
5. **Licencias de datos:** `nflverse` opera bajo `CC BY 4.0` / `MIT`; los CSV históricos de `football-data.co.uk` carecen de licencia comercial explícita (`DESCONOCIDO` para redistribución comercial de datos crudos); las `10` fuentes web con restricciones anti-bot o ToS restrictivos (`5` de cuotas en `B3` + `5` de XI en `B7`) permanecen bloqueadas en código (`blocked_pending_owner_decision`).

---

## 7. Paridad TS↔Python y Reproducibilidad

- **Primitivas matemáticas unificadas (`src/domain/prediction/math.ts`):** `clamp`, `logit`, `sigmoid`, `normalCdf` y `createMulberry32` centralizadas sin duplicados.
- **Paridad verificada `< 10^{-12}` (`OBSERVADO`):**
  - `engine.ts` vs Python (`Motor A` y `NFL Minkowski` `v3.0` / candidato `v3.2`): `max |Δ| <= 4.991 × 10^{-13}`.
  - `markets_2way.ts` / `outlook.ts` vs `regenerate_live_snapshot.py` / `outlook_calibration.py`: `max |Δ| <= 4.441 × 10^{-16}`.
  - `ledger.ts` / `clv.ts` vs `clv_report.py` / `paper_trading.py` (hashes SHA-256 y bootstrap `mulberry32`): `max |Δ| = 0.0`.
- **Verificación automatizada completa:**
  - TypeScript: `npx vitest run` (`61` archivos / `1,153` tests en verde; restaurar `git checkout -- evidence/statistical-tests/aztecavet-experiments.json` tras correr la suite global).
  - Python (`prediction-lab`): `.\research\prediction-lab\.venv\Scripts\python.exe -B -m pytest services/models research/prediction-lab/experiments/EXP_V32_xi research/prediction-lab/experiments/EXP_V32_nfl_epa -v` (`120` tests en verde).
  - Python (`web-scraping`): `.\.venv\Scripts\python.exe -m pytest tests -v` (`7` tests en verde).
